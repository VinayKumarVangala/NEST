/**
 * Health Monitor - Health checking for applications
 */
import type {
  HealthCheckResult,
  HealthCheckConfig,
  HealthState,
  HealthCheckType,
  ApplicationConfig,
} from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus } from '../../events';
import { RuntimeStateRepository } from '../../db';

/**
 * Internal state for tracking health checks per app
 */
interface AppHealthState {
  intervalId: ReturnType<typeof setTimeout> | null;
  failureCount: number;
  isChecking: boolean;
  currentTimeoutId: ReturnType<typeof setTimeout> | null;
  lastHealthState: HealthState | null;
  backoffMultiplier: number;
}

/**
 * HTTP check options
 */
interface HttpCheckOptions {
  url: string;
  expectedStatus?: number;
  expectedBodyContains?: string;
  timeoutMs: number;
  allowSelfSigned: boolean;
}

/**
 * Health check execution result
 */
interface CheckExecutionResult {
  timestamp: number;
  processAlive: boolean;
  portListening: boolean;
  localResponding: boolean;
  latencyMs?: number;
  error?: string;
  details?: string;
}

export class HealthMonitor {
  private osAdapter: any;
  private eventBus: any;
  private applicationManager: any;
  private appStates: Map<string, AppHealthState> = new Map();

  constructor(osAdapter: any, eventBus: any, applicationManager: any) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.applicationManager = applicationManager;
  }

  /**
   * Start periodic health checks for an app
   */
  startCheckForApp(appId: string): void {
    if (this.appStates.has(appId)) {
      // Already monitoring
      return;
    }

    const appState: AppHealthState = {
      intervalId: null,
      failureCount: 0,
      isChecking: false,
      currentTimeoutId: null,
      lastHealthState: null,
      backoffMultiplier: 1,
    };

    this.appStates.set(appId, appState);
    this.scheduleNextCheck(appId);
  }

  /**
   * Stop health checks for an app
   */
  stopCheckForApp(appId: string): void {
    const appState = this.appStates.get(appId);
    if (!appState) return;

    if (appState.intervalId) {
      clearTimeout(appState.intervalId);
      appState.intervalId = null;
    }
    if (appState.currentTimeoutId) {
      clearTimeout(appState.currentTimeoutId);
      appState.currentTimeoutId = null;
    }
    this.appStates.delete(appId);
  }

  /**
   * Schedule the next health check with jitter
   */
  private scheduleNextCheck(appId: string): void {
    const appState = this.appStates.get(appId);
    if (!appState) return;

    const app = this.applicationManager.getApplication(appId);
    if (!app) {
      this.appStates.delete(appId);
      return;
    }

    // Clear any existing interval
    if (appState.intervalId) {
      clearTimeout(appState.intervalId);
    }

    const intervalMs = app.healthCheck.intervalMs;
    // Add jitter: ±10% of interval
    const jitter = intervalMs * 0.1 * (Math.random() * 2 - 1);
    const nextInterval = Math.max(1000, Math.floor(intervalMs + jitter));

    // Apply backoff if unhealthy
    const effectiveInterval = Math.floor(nextInterval * appState.backoffMultiplier);

    appState.intervalId = setTimeout(() => {
      this.executeHealthCheck(appId);
    }, effectiveInterval);
  }

  /**
   * Execute a health check (with overlap prevention)
   */
  private async executeHealthCheck(appId: string): Promise<void> {
    const appState = this.appStates.get(appId);
    if (!appState) return;

    // Prevent overlapping checks
    if (appState.isChecking) {
      // Skip this check, reschedule
      this.scheduleNextCheck(appId);
      return;
    }

    const app = this.applicationManager.getApplication(appId);
    if (!app) {
      this.stopCheckForApp(appId);
      return;
    }

    appState.isChecking = true;

    try {
      const result = await this.performHealthCheck(app);
      await this.updateHealthState(appId, app, result);
    } catch (error) {
      console.error(`[HealthMonitor] Check failed for ${appId}:`, error);
      // Treat as failure
      await this.handleCheckError(
        appId,
        app,
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      appState.isChecking = false;
      // Schedule next check
      if (this.appStates.has(appId)) {
        this.scheduleNextCheck(appId);
      }
    }
  }

  /**
   * Perform the actual health check
   */
  private async performHealthCheck(app: ApplicationConfig): Promise<CheckExecutionResult> {
    const state = RuntimeStateRepository.get(app.id);
    if (!state || !state.pid) {
      return {
        timestamp: Date.now(),
        processAlive: false,
        portListening: false,
        localResponding: false,
        error: 'No process state found',
      };
    }

    // 1. Check process alive
    const processInfo = await this.osAdapter.getProcessInfo(state.pid);
    const processAlive = processInfo !== null && processInfo.startTime === state.processStartTime;

    // 2. Check port listening
    const listeners = await this.osAdapter.listTcpListeners();
    const portListening = listeners.some(
      (l: any) => l.localPort === app.port && l.pid === state.pid
    );

    // 3. Check health endpoint based on type
    let localResponding = false;
    let latencyMs: number | undefined;
    let error: string | undefined;
    let details: string | undefined;

    if (app.healthCheck.type === 'none') {
      localResponding = true; // No health check configured
    } else if (app.healthCheck.type === 'tcp') {
      localResponding = portListening;
    } else if (app.healthCheck.type === 'http') {
      const protocol = app.healthCheck.type;
      const path = app.healthCheck.path || '/health';
      const baseUrl = `${protocol}://localhost:${app.port}`;
      const url = `${baseUrl}${path}`;

      const start = Date.now();
      try {
        const httpResult = await this.performHttpCheck({
          url,
          expectedStatus: app.healthCheck.expectedStatus,
          expectedBodyContains: app.healthCheck.expectedBodyContains,
          timeoutMs: app.healthCheck.timeoutMs,
          allowSelfSigned: protocol === 'http' && this.isLoopbackOrLanTarget(baseUrl),
        });
        latencyMs = Date.now() - start;
        localResponding = httpResult.success;
        if (!httpResult.success) {
          error = httpResult.error;
          details = httpResult.details;
        }
      } catch (err) {
        localResponding = false;
        error = err instanceof Error ? err.message : 'HTTP check failed';
      }
    }

    return {
      timestamp: Date.now(),
      processAlive,
      portListening,
      localResponding,
      latencyMs,
      error,
      details,
    };
  }

  /**
   * Perform HTTP/HTTPS health check
   */
  private async performHttpCheck(
    options: HttpCheckOptions
  ): Promise<{ success: boolean; error?: string; details?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: 'GET',
        redirect: 'manual', // Do not follow redirects
        signal: controller.signal,
        // For self-signed certs on loopback/LAN
        // Note: Node.js fetch doesn't support certificate validation options directly
        // This would need a custom agent in production
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== options.expectedStatus) {
        const error = `HTTP ${response.status}`;
        const details = `Expected status ${options.expectedStatus || '2xx'}, got ${response.status}`;
        return { success: false, error, details };
      }

      // Check expected status if configured
      if (options.expectedStatus && response.status !== options.expectedStatus) {
        return {
          success: false,
          error: `Expected status ${options.expectedStatus}, got ${response.status}`,
        };
      }

      // Check body content if configured
      if (options.expectedBodyContains) {
        const text = await response.text();
        if (!text.includes(options.expectedBodyContains)) {
          return {
            success: false,
            error: 'Body marker not found',
            details: `Expected body to contain "${options.expectedBodyContains}"`,
          };
        }
      }

      return { success: true };
    } catch (err) {
      clearTimeout(timeoutId);
      const error = err instanceof Error ? err.message : 'Fetch failed';
      return { success: false, error };
    }
  }

  /**
   * Check if target is loopback or LAN (for self-signed cert acceptance)
   */
  private isLoopbackOrLanTarget(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return true;
      }
      // Check if it's a private IP range
      const parts = host.split('.');
      if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first === 10) return true;
        if (first === 172 && second >= 16 && second <= 31) return true;
        if (first === 192 && second === 168) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Handle check error (network issues, etc.)
   */
  private async handleCheckError(
    appId: string,
    app: ApplicationConfig,
    error: string
  ): Promise<void> {
    const state = RuntimeStateRepository.get(appId);
    if (!state) return;

    // Get current process/port state to preserve them
    const processInfo = state.pid ? await this.osAdapter.getProcessInfo(state.pid) : null;
    const processAlive = processInfo !== null && processInfo.startTime === state.processStartTime;

    const listeners = await this.osAdapter.listTcpListeners();
    const portListening = listeners.some(
      (l: any) => l.localPort === app.port && l.pid === state.pid
    );

    const result: HealthCheckResult = {
      timestamp: Date.now(),
      processAlive,
      portListening,
      localResponding: false,
      details: error,
    };

    await this.updateHealthState(appId, app, result);
  }

  /**
   * Update health state with failure threshold logic
   */
  private async updateHealthState(
    appId: string,
    app: ApplicationConfig,
    result: CheckExecutionResult
  ): Promise<void> {
    const state = RuntimeStateRepository.get(appId);
    if (!state) return;

    const appState = this.appStates.get(appId);
    if (!appState) return;

    const healthCheckResult: HealthCheckResult = {
      timestamp: result.timestamp || Date.now(),
      processAlive: result.processAlive,
      portListening: result.portListening,
      localResponding: result.localResponding,
      latencyMs: result.latencyMs,
      details: result.details,
    };

    // Determine raw health based on all three signals
    const rawHealthy = result.processAlive && result.portListening && result.localResponding;
    let newHealthState: HealthState = rawHealthy ? 'healthy' : 'unhealthy';

    // Update failure count
    if (!rawHealthy) {
      appState.failureCount += 1;
    } else {
      // Success resets failure count
      appState.failureCount = 0;
      appState.backoffMultiplier = 1; // Reset backoff on success
    }

    // Apply failure threshold
    const threshold = app.healthCheck.failureThreshold || 3;
    if (appState.failureCount >= threshold && !rawHealthy) {
      newHealthState = 'unhealthy';
      // Apply exponential backoff (max 5x)
      appState.backoffMultiplier = Math.min(5, appState.backoffMultiplier * 1.5);
    }

    // Persist last health check result
    const updatedState = {
      ...state,
      healthState: newHealthState,
      lastHealthCheck: healthCheckResult,
      updatedAt: Date.now(),
    };
    RuntimeStateRepository.upsert(updatedState);

    // Emit event only on state change
    if (newHealthState !== appState.lastHealthState) {
      appState.lastHealthState = newHealthState;

      this.eventBus.emit('health.changed', {
        appId,
        healthState: newHealthState,
        result: healthCheckResult,
        timestamp: Date.now(),
      });

      // Also emit app.stateChanged for UI consistency
      this.eventBus.emit('app.stateChanged', {
        appId,
        processState: state.processState,
        healthState: newHealthState,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Manual health check via IPC
   */
  async checkNow(appId: string): Promise<HealthCheckResult> {
    const app = this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    const result = await this.performHealthCheck(app);
    await this.updateHealthState(appId, app, result);

    const state = RuntimeStateRepository.get(appId);
    return {
      timestamp: result.timestamp || Date.now(),
      processAlive: result.processAlive,
      portListening: result.portListening,
      localResponding: result.localResponding,
      latencyMs: result.latencyMs,
      details: result.details,
    };
  }

  /**
   * Get current health state for an app
   */
  getHealthState(appId: string): HealthState | null {
    const appState = this.appStates.get(appId);
    return appState?.lastHealthState ?? null;
  }

  /**
   * Start monitoring (no-op - checks are started per-app via startCheckForApp)
   * Kept for backward compatibility
   */
  start(): void {
    // No-op - checks are started per-app
  }

  /**
   * Stop all health checks
   */
  stop(): void {
    for (const appId of this.appStates.keys()) {
      this.stopCheckForApp(appId);
    }
  }
}
