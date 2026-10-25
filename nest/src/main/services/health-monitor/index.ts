/**
 * Health Monitor - Health checking for applications
 */
import type { HealthCheckResult, HealthCheckConfig, HealthState } from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus, setupEventBus } from '../../events';
import { RuntimeStateRepository } from '../../db';

export class HealthMonitor {
  private osAdapter: any;
  private eventBus: ReturnType<typeof setupEventBus>;
  private applicationManager: any;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private failureCounts: Map<string, number> = new Map();

  constructor(osAdapter: any, eventBus: ReturnType<typeof setupEventBus>, applicationManager: any) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.applicationManager = applicationManager;
  }

  async checkNow(appId: string): Promise<HealthCheckResult> {
    const app = await this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    return this.performHealthCheck(app);
  }

  private async performHealthCheck(app: any): Promise<HealthCheckResult> {
    const state = RuntimeStateRepository.get(app.id);
    if (!state || !state.pid) {
      return {
        timestamp: Date.now(),
        processAlive: false,
        portListening: false,
        localResponding: false,
      };
    }

    // Check process alive
    const processInfo = await this.osAdapter.getProcessInfo(state.pid);
    const processAlive = processInfo !== null && processInfo.startTime === state.processStartTime;

    // Check port listening
    const listeners = await this.osAdapter.listTcpListeners();
    const portListening = listeners.some(
      (l: any) => l.localPort === app.port && l.pid === state.pid
    );

    // Check HTTP response if configured
    let localResponding = false;
    let latencyMs: number | undefined;

    if (app.healthCheck.type === 'http' && app.healthCheck.path) {
      const start = Date.now();
      try {
        const response = await fetch(`http://localhost:${app.port}${app.healthCheck.path}`, {
          signal: AbortSignal.timeout(app.healthCheck.timeoutMs),
        });
        latencyMs = Date.now() - start;
        localResponding = response.ok;
        if (app.healthCheck.expectedStatus) {
          localResponding = response.status === app.healthCheck.expectedStatus;
        }
        if (app.healthCheck.expectedBodyContains) {
          const text = await response.text();
          localResponding = localResponding && text.includes(app.healthCheck.expectedBodyContains);
        }
      } catch {
        localResponding = false;
      }
    } else if (app.healthCheck.type === 'tcp') {
      localResponding = portListening;
    } else {
      localResponding = true; // No health check
    }

    return {
      timestamp: Date.now(),
      processAlive,
      portListening,
      localResponding,
      latencyMs,
    };
  }

  start(): void {
    // Start periodic checks for all running apps
    // This would be called for each app when it starts
  }

  startCheckForApp(appId: string): void {
    const app = this.applicationManager.getApplication(appId);
    if (!app) return;

    const interval = setInterval(async () => {
      try {
        const result = await this.performHealthCheck(app);
        await this.updateHealthState(app.id, result);
      } catch (error) {
        console.error(`[HealthMonitor] Check failed for ${appId}:`, error);
      }
    }, app.healthCheck.intervalMs);

    this.checkIntervals.set(appId, interval);
  }

  stopCheckForApp(appId: string): void {
    const interval = this.checkIntervals.get(appId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(appId);
    }
    this.failureCounts.delete(appId);
  }

  private async updateHealthState(appId: string, result: HealthCheckResult): Promise<void> {
    const state = RuntimeStateRepository.get(appId);
    if (!state) return;

    const app = await this.applicationManager.getApplication(appId);
    if (!app) return;

    let newHealthState: HealthState = 'healthy';
    if (!result.processAlive || !result.portListening || !result.localResponding) {
      newHealthState = 'unhealthy';
    }

    const failures = this.failureCounts.get(appId) || 0;
    if (newHealthState === 'unhealthy') {
      this.failureCounts.set(appId, failures + 1);
    } else {
      this.failureCounts.set(appId, 0);
    }

    const threshold = app.healthCheck.failureThreshold;
    if (failures + 1 >= threshold && newHealthState === 'unhealthy') {
      newHealthState = 'unhealthy';
    }

    if (newHealthState !== state.healthState) {
      const updatedState = {
        ...state,
        healthState: newHealthState,
        lastHealthCheck: result,
        updatedAt: Date.now(),
      };
      RuntimeStateRepository.upsert(updatedState);

      this.eventBus.emit('health.changed', {
        appId,
        healthState: newHealthState,
        result,
        timestamp: Date.now(),
      });
    }
  }

  stop(): void {
    for (const [appId] of this.checkIntervals) {
      this.stopCheckForApp(appId);
    }
  }
}
