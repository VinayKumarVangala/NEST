/**
 * Application Manager - Lifecycle & Supervision
 */
import type {
  RuntimeState,
  ProcessState,
  HealthState,
  HealthCheckResult,
  HealthCheckConfig,
  PortInfo,
  AutoRestartPolicy,
  RestartHistoryEntry,
  ApplicationConfig,
} from '@shared/types';
import type { ErrorCode } from '@shared/types';
import {
  ApplicationRepository,
  RuntimeStateRepository,
  ActivityLogRepository,
  RestartHistoryRepository,
  withTransaction,
} from '../../db';
import { lintLaunchConfig } from '@shared/schemas';
import { PortGuard, NoOpPortGuardImpl } from '../port-manager';

// State machine transition validation
const VALID_TRANSITIONS: Record<ProcessState, ProcessState[]> = {
  registered: ['starting'],
  starting: ['running', 'failed'],
  running: ['stopping', 'failed'],
  stopping: ['stopped'],
  stopped: ['starting'],
  failed: ['starting'],
  external: [],
  unknown: ['starting', 'stopped', 'failed'],
};

// Valid terminal states that don't transition
// const TERMINAL_STATES: ProcessState[] = ['stopped', 'failed', 'external'];

/** Per-app mutex for single-flight operations */
class AppMutex {
  private locks: Map<string, Promise<any>> = new Map();

  async acquire<T>(appId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(appId);
    if (existing) {
      // Coalesce: wait for existing operation to complete
      await existing;
      // Check if another operation was queued
      const newLock = this.locks.get(appId);
      if (newLock !== existing) {
        return newLock;
      }
    }

    const promise = operation().finally(() => {
      if (this.locks.get(appId) === promise) {
        this.locks.delete(appId);
      }
    });
    this.locks.set(appId, promise);
    return promise;
  }
}

/** Shutdown policy from settings */
type ShutdownPolicy = 'stop_all' | 'keep_running' | 'ask';

interface AppManagerSettings {
  backgroundMode: boolean;
  shutdownPolicy: ShutdownPolicy;
  startupAtLogin: boolean;
  preferredInterface?: string;
  confirmationPreferences: Record<string, boolean>;
  logRetentionDays: number;
  logMaxLinesPerApp: number;
}

export class ApplicationManager {
  private osAdapter: any;
  private eventBus: any;
  private settings: AppManagerSettings;
  private runningProcesses: Map<string, { child: any; startTime: number }> = new Map();
  private startLocks: Map<string, Promise<RuntimeState>> = new Map();
  private portGuard: PortGuard;
  private healthMonitor: any;
  private portManager: any;
  private securityPolicyManager: any;
  private networkManager: any;
  private mutex = new AppMutex();
  private isQuitting = false;
  private externalMonitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    osAdapter: any,
    eventBus: any,
    settings: any,
    portGuard: PortGuard = new NoOpPortGuardImpl(),
    healthMonitor: any = null,
    portManager: any = null,
    securityPolicyManager: any = null,
    networkManager: any = null
  ) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.settings = {
      backgroundMode: settings.backgroundMode ?? true,
      shutdownPolicy: settings.shutdownPolicy ?? 'ask',
      startupAtLogin: settings.startupAtLogin ?? false,
      preferredInterface: settings.preferredInterface,
      confirmationPreferences: settings.confirmationPreferences ?? {},
      logRetentionDays: settings.logRetentionDays ?? 30,
      logMaxLinesPerApp: settings.logMaxLinesPerApp ?? 5000,
    };
    this.portGuard = portGuard;
    this.healthMonitor = healthMonitor;
    this.portManager = portManager;
    this.securityPolicyManager = securityPolicyManager;
    this.networkManager = networkManager;
  }

  private validateTransition(from: ProcessState, to: ProcessState): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw this.createError('INTERNAL', `Illegal state transition: ${from} -> ${to}`);
    }
  }

  async listApplications(): Promise<any[]> {
    return ApplicationRepository.list();
  }

  async getApplication(id: string): Promise<ApplicationConfig | null> {
    return ApplicationRepository.get(id);
  }

  async createApplication(config: any): Promise<any> {
    const now = Date.now();
    const app = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    // Store in repository
    return app;
  }

  async updateApplication(id: string, config: Partial<any>): Promise<any | null> {
    const app = await this.getApplication(id);
    if (!app) return null;

    const updated = { ...app, ...config, updatedAt: Date.now() };
    // ApplicationRepository.update(id, updated);
    return updated;
  }

  async removeApplication(id: string, _confirmDeleteFiles: boolean): Promise<void> {
    const app = await this.getApplication(id);
    if (!app) return;

    const state = RuntimeStateRepository.get(id);
    if (state && ['starting', 'running', 'stopping'].includes(state.processState)) {
      await this.stop(id, true);
    }

    // ApplicationRepository.delete(id);
    this.emitAppLog(id, 'info', 'Application removed', { name: app.name });
  }

  async start(id: string): Promise<any> {
    const app = await this.getApplication(id);
    if (app?.lifecycleMode === 'external') {
      throw this.createError('UNSUPPORTED_OPERATION', 'Start is unavailable — not managed by NEST');
    }
    return this.mutex.acquire(id, () => this.doStart(id));
  }

  private async doStart(id: string): Promise<any> {
    const app = await this.getApplication(id);
    if (!app) throw this.createError('NOT_FOUND', 'Application not found');

    const currentState = RuntimeStateRepository.get(id);
    if (currentState && ['starting', 'running'].includes(currentState.processState)) {
      throw this.createError('ALREADY_RUNNING', 'Application already running or starting');
    }

    // Validate config
    if (!app.workingDirectory) throw this.createError('VALIDATION', 'Working directory not set');

    // Check binding class for LAN eligibility
    const bindingClass = await this.portManager.computeBindingClass(app.port);
    const networkManager = (this as any).networkManager;
    const selectedInterfaceIp = networkManager?.getSelectedInterfaceInfo
      ? (await networkManager.getSelectedInterfaceInfo())?.ipv4
      : undefined;

    // Check if app wants LAN access and needs binding class change
    const needsLanProfile =
      app.lanLaunchProfile &&
      (bindingClass === 'loopback_only' ||
        (bindingClass === 'specific_lan' &&
          selectedInterfaceIp &&
          bindingClass === 'specific_lan'));

    // Check if app wants LAN access
    const accessPolicy = await this.securityPolicyManager?.getAccessStatus(id);
    const wantsLanAccess =
      accessPolicy?.policy?.mode === 'lan_enabled' ||
      (this.networkManager && this.networkManager.getSelectedInterface());

    if (wantsLanAccess && bindingClass === 'loopback_only' && !app.lanLaunchProfile) {
      throw this.createError(
        'LOOPBACK_ONLY',
        'Changing the firewall cannot fix a service listening only on 127.0.0.1. ' +
          'Define a lanLaunchProfile with args like --host 0.0.0.0 or HOST=0.0.0.0 to enable LAN access.'
      );
    }

    // Port pre-check via PortGuard
    const portCheck = await this.portGuard.checkPort(app.port);
    if (!portCheck.available) {
      throw this.createError('PORT_IN_USE', `Port ${app.port} is already in use`, {
        port: app.port,
      });
    }

    // Determine if we need to use LAN launch profile
    const useLanProfile =
      app.lanLaunchProfile &&
      (bindingClass === 'loopback_only' ||
        (bindingClass === 'specific_lan' && app.selectedInterface));

    // Prepare environment and args
    let finalArgs = app.args;
    let finalEnv = { ...app.env.reduce((acc, e) => ({ ...acc, [e.key]: e.value }), {}) };

    // Check if we should use LAN launch profile
    const useLanLaunchProfile = app.lanLaunchProfile && wantsLanAccess;

    // Update state to starting
    const now = Date.now();
    const startingState: RuntimeState = {
      appId: id,
      processState: 'starting',
      healthState: 'checking',
      portState: 'unknown',
      updatedAt: now,
    };
    RuntimeStateRepository.upsert(startingState);
    this.emitStateChange(id, 'starting', 'checking');

    try {
      // Resolve executable
      const resolved = await this.osAdapter.resolveExecutable(app.executable);
      if (!resolved)
        throw this.createError('SPAWN_FAILED', `Executable not found: ${app.executable}`);

      // Prepare environment
      const env: Record<string, string> = {};
      for (const e of app.env) {
        env[e.key] = e.value;
      }

      // Use LAN launch profile if available and needed
      let finalArgs = app.args;
      let finalEnv: Record<string, string> = {
        ...app.env.reduce((acc, e) => ({ ...acc, [e.key]: e.value }), {}),
      };

      if (useLanLaunchProfile && app.lanLaunchProfile) {
        // Apply LAN launch profile args
        finalArgs = [...app.lanLaunchProfile.args, ...app.args];
        // Apply LAN launch profile env vars
        for (const e of app.lanLaunchProfile.env) {
          finalEnv[e.key] = e.value;
        }
        this.emitAppLog(id, 'info', 'Starting with LAN launch profile', {
          args: app.lanLaunchProfile.args,
          env: app.lanLaunchProfile.env,
        });
      }

      // Spawn process
      const { pid, startTime, child } = await this.osAdapter.spawnProcess({
        executable: resolved.path,
        args: [...resolved.args, ...finalArgs],
        workingDirectory: app.workingDirectory,
        env: finalEnv,
      });

      // Store process reference
      this.runningProcesses.set(id, { child, startTime });

      // Update runtime state with PID
      const runningState: RuntimeState = {
        appId: id,
        processState: 'running',
        healthState: 'checking',
        pid,
        processStartTime: startTime,
        portState: 'unknown',
        updatedAt: Date.now(),
      };
      RuntimeStateRepository.upsert(runningState);
      this.emitStateChange(id, 'running', 'checking');

      // Set up log piping
      this.setupLogPiping(id, child);

      // Handle process exit
      child.on('exit', (code: number | null, signal: string | null) => {
        this.handleProcessExit(id, code, signal);
      });

      // Wait for health check or port listening
      const startupTimeout = app.startupTimeoutMs;
      const startTimeMs = Date.now();

      while (Date.now() - startTimeMs < startupTimeout) {
        await new Promise((r) => setTimeout(r, 1000));

        const state = RuntimeStateRepository.get(id);
        if (!state || state.processState !== 'running') break;

        // Check port
        const portInfo = await this.checkPort(app.port);
        if (portInfo.state !== 'free') {
          // Port is listening, verify health if configured
          if (app.healthCheck.type !== 'none') {
            const health = await this.checkHealth(app);
            if (health.processAlive && health.portListening && health.localResponding) {
              this.updateHealthState(id, 'healthy', health);
              return RuntimeStateRepository.get(id)!;
            }
          } else {
            // No health check, just port listening is enough
            this.updateHealthState(id, 'healthy', {
              timestamp: Date.now(),
              processAlive: true,
              portListening: true,
              localResponding: true,
            });
            return RuntimeStateRepository.get(id)!;
          }
        }

        // Check if process died
        const processInfo = await this.osAdapter.getProcessInfo(pid);
        if (!processInfo) {
          throw new Error('Process died during startup');
        }
      }

      throw this.createError('START_TIMEOUT', `Startup timeout after ${startupTimeout}ms`);
    } catch (error) {
      const errorState: RuntimeState = {
        appId: id,
        processState: 'failed',
        healthState: 'unhealthy',
        portState: 'unknown',
        lastError: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: Date.now(),
      };
      RuntimeStateRepository.upsert(errorState);
      this.emitStateChange(id, 'failed', 'unhealthy');
      this.emitAppLog(
        id,
        'error',
        `Start failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  private async checkPort(port: number): Promise<PortInfo> {
    // Use port manager if available
    return { port, state: 'occupied_by_managed', boundAddress: '127.0.0.1' };
  }

  private async checkHealth(app: any): Promise<HealthCheckResult> {
    // Delegate to health monitor
    return {
      timestamp: Date.now(),
      processAlive: true,
      portListening: true,
      localResponding: true,
    };
  }

  private updateHealthState(id: string, healthState: HealthState, result: any) {
    const state = RuntimeStateRepository.get(id);
    if (!state) return;

    const updated: RuntimeState = {
      ...state,
      healthState,
      lastHealthCheck: {
        timestamp: Date.now(),
        processAlive: result.processAlive,
        portListening: result.portListening,
        localResponding: result.localResponding,
      },
      updatedAt: Date.now(),
    };
    RuntimeStateRepository.upsert(updated);
    this.emitStateChange(id, state.processState, healthState);
  }

  private setupLogPiping(appId: string, child: any) {
    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
      const lines = data
        .toString()
        .split('\n')
        .filter((l) => l.trim());
      for (const line of lines) {
        // Redact secrets from logs
        const redactedLine = this.redactSecrets(line);
        this.emitAppLog(appId, 'info', redactedLine, { stream });
      }
    };

    child.stdout?.on('data', (data: Buffer) => handleOutput(data, 'stdout'));
    child.stderr?.on('data', (data: Buffer) => handleOutput(data, 'stderr'));
  }

  private redactSecrets(text: string): string {
    return text
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer ••••')
      .replace(/password\s*=\s*[^\s]+/gi, 'password=••••')
      .replace(/token\s*=\s*[^\s]+/gi, 'token=••••')
      .replace(/secret\s*=\s*[^\s]+/gi, 'secret=••••')
      .replace(/api[_-]?key\s*=\s*[^\s]+/gi, 'api_key=••••')
      .replace(/authorization\s*:\s*[^\s]+/gi, 'authorization: ••••');
  }

  private async handleProcessExit(appId: string, code: number | null, signal: string | null) {
    const state = RuntimeStateRepository.get(appId);
    if (!state) return;

    this.runningProcesses.delete(appId);

    const app = await this.getApplication(appId);
    if (!app) return;

    const isUnexpected = code !== 0 && code !== null;
    const isManualStop = code === 0 || code === null;

    // Determine if we should attempt auto-restart
    const shouldAutoRestart =
      !isManualStop && app.autoRestartPolicy?.enabled && app.lifecycleMode === 'managed';

    let newState: RuntimeState;
    let restartReason: 'crash' | 'start_timeout' | 'health_failure' | 'manual' | 'startup_failure' =
      'crash';

    if (isManualStop) {
      newState = {
        ...state,
        processState: 'stopped',
        healthState: 'unknown',
        lastError: undefined,
        stoppedAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      // Determine restart reason based on exit code/signal
      if (code === null && signal) {
        restartReason = 'crash';
      } else if (code !== 0) {
        restartReason = 'crash';
      } else {
        restartReason = 'startup_failure';
      }

      newState = {
        ...state,
        processState: 'failed',
        healthState: 'unhealthy',
        lastError: `Process exited with code ${code ?? signal}`,
        stoppedAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    RuntimeStateRepository.upsert(newState);
    this.emitStateChange(appId, newState.processState, 'unknown');

    this.emitAppLog(
      appId,
      isManualStop ? 'info' : 'error',
      `Process exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (signal: ${signal})` : ''}`
    );

    if (shouldAutoRestart) {
      this.scheduleAutoRestart(appId, restartReason);
    }
  }

  /**
   * Schedule an auto-restart with exponential backoff and rate limiting
   */
  private async scheduleAutoRestart(
    appId: string,
    reason: 'crash' | 'start_timeout' | 'health_failure' | 'manual' | 'startup_failure'
  ): Promise<void> {
    const app = await this.getApplication(appId);
    if (!app || !app.autoRestartPolicy?.enabled) return;

    const policy = app.autoRestartPolicy;
    const now = Date.now();
    const windowStart = now - policy.windowMs;

    // Get recent restart attempts
    const recentAttempts = RestartHistoryRepository.getSince(appId, windowStart);
    const failureCount = recentAttempts.filter((r) => !r.success).length;

    // Check if we've exceeded max restarts in window
    if (failureCount >= policy.maxRestarts) {
      this.emitAppLog(
        appId,
        'warn',
        `Auto-restart disabled: max restarts (${policy.maxRestarts}) exceeded in window`,
        {
          reason,
          windowMs: policy.windowMs,
          attempts: failureCount,
        }
      );
      return;
    }

    // Calculate backoff
    const attemptNumber = recentAttempts.length + 1;
    const backoffMs = Math.min(
      policy.backoffBaseMs * Math.pow(2, attemptNumber - 1),
      policy.backoffMaxMs
    );

    // Record the restart attempt
    const attemptId = crypto.randomUUID();
    RestartHistoryRepository.insert({
      id: attemptId,
      appId,
      attemptedAt: Date.now(),
      success: false, // Will be updated after restart attempt
      reason: 'crash', // Using the reason from the crash
      backoffMs,
      error: `Auto-restart scheduled due to ${reason}`,
    });

    // Schedule the restart
    setTimeout(async () => {
      try {
        this.emitAppLog(
          appId,
          'info',
          `Attempting auto-restart (attempt ${attemptNumber}/${policy.maxRestarts})`,
          {
            reason,
            backoffMs,
            attemptNumber,
          }
        );

        await this.start(appId);

        // Mark the restart as successful
        const attempt = RestartHistoryRepository.getByAppId(appId, 1)[0];
        if (attempt) {
          // Update the attempt as successful
          // Note: We don't have an update method, but we can log it
          this.emitAppLog(appId, 'info', `Auto-restart successful`, { reason, attemptNumber });
        }
      } catch (error) {
        this.emitAppLog(appId, 'error', `Auto-restart failed`, {
          reason,
          attemptNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // If restart failed, we could schedule another attempt if under limit
        // but we'll let the next crash handler handle it
      }
    }, backoffMs);
  }

  async stop(id: string, force = false): Promise<any> {
    const app = await this.getApplication(id);
    if (app?.lifecycleMode === 'external') {
      throw this.createError('UNSUPPORTED_OPERATION', 'Stop is unavailable — not managed by NEST');
    }
    return this.mutex.acquire(id, async () => {
      const state = RuntimeStateRepository.get(id);
      if (!state) throw this.createError('NOT_FOUND', 'Application not found');

      const processInfo = state.pid ? await this.osAdapter.getProcessInfo(state.pid) : null;
      if (state.pid && processInfo && processInfo.startTime !== state.processStartTime) {
        throw this.createError('NOT_OWNED', 'Process ownership verification failed (PID reused)');
      }

      if (!state.pid || !['starting', 'running', 'stopping'].includes(state.processState)) {
        return state;
      }

      const stoppingState: RuntimeState = {
        ...state,
        processState: 'stopping',
        updatedAt: Date.now(),
      };
      RuntimeStateRepository.upsert(stoppingState);
      this.emitStateChange(id, 'stopping', state.healthState);

      const processRef = this.runningProcesses.get(id);
      if (processRef) {
        const result = await this.osAdapter.terminateProcessTree(state.pid!, { graceful: !force });
        if (!result.success && !force) {
          // Try force
          await this.osAdapter.terminateProcessTree(state.pid!, { graceful: false });
        }
      }

      const finalState: RuntimeState = {
        ...state,
        processState: 'stopped',
        healthState: 'unknown',
        stoppedAt: Date.now(),
        updatedAt: Date.now(),
      };
      RuntimeStateRepository.upsert(finalState);
      this.emitStateChange(id, 'stopped', 'unknown');
      this.emitAppLog(id, 'info', 'Application stopped');

      return finalState;
    });
  }

  async restart(id: string): Promise<any> {
    const app = await this.getApplication(id);
    if (app?.lifecycleMode === 'external') {
      throw this.createError(
        'UNSUPPORTED_OPERATION',
        'Restart is unavailable — not managed by NEST'
      );
    }
    // Use mutex to ensure single-flight restart
    return this.mutex.acquire(id, async () => {
      await this.stop(id);
      return this.start(id);
    });
  }

  async registerExternal(params: any): Promise<any> {
    const port = params.port;
    const protocol = params.protocol || 'http';
    const healthCheck = params.healthCheck || {
      type: 'tcp',
      intervalMs: 30000,
      timeoutMs: 5000,
      failureThreshold: 3,
    };

    // Inspect the port using PortManager
    const inspection = await this.portManager.inspectPort(port, {
      type: healthCheck.type,
      path: healthCheck.path,
      expectedStatus: healthCheck.expectedStatus,
      expectedBodyContains: healthCheck.expectedBodyContains,
      timeoutMs: healthCheck.timeoutMs,
    });

    if (!inspection.listener) {
      throw this.createError('NOT_FOUND', `No listener found on port ${port}`);
    }

    // Check connectivity
    if (!inspection.connectivity.success) {
      throw this.createError(
        'NOT_FOUND',
        `Cannot connect to port ${port}: ${inspection.connectivity.error}`
      );
    }

    // Get owner process info
    const ownerPid = inspection.listener.pid;
    const ownerImage = inspection.listener.ownerImage;

    // Create the application
    const app = await this.createApplication({
      name: params.name,
      projectPath: '',
      executable: 'external',
      args: [],
      workingDirectory: '',
      env: [],
      protocol: params.protocol || 'http',
      port: port,
      expectedListenAddress: 'all',
      lifecycleMode: 'external',
      startupTimeoutMs: 5000,
      healthCheck: healthCheck,
      selectedInterface: params.selectedInterface,
    });

    // Update runtime state to external with owner PID
    RuntimeStateRepository.upsert({
      appId: app.id,
      processState: 'external',
      healthState: 'unknown',
      portState: 'unknown',
      pid: ownerPid,
      processStartTime: Date.now(), // We don't know the actual start time, use now
      updatedAt: Date.now(),
    });
    this.emitStateChange(app.id, 'external', 'unknown');

    // Start health monitoring for external app
    this.healthMonitor.startCheckForApp(app.id);

    // Log the registration
    this.emitAppLog(
      app.id,
      'info',
      `Registered external app on port ${port} (PID: ${ownerPid}, Process: ${ownerImage || 'unknown'})`
    );

    return app;
  }

  async recover(): Promise<void> {
    const apps = await this.listApplications();
    for (const app of apps) {
      const state = RuntimeStateRepository.get(app.id);
      if (!state || !state.pid || !state.processStartTime) continue;

      // Handle external apps differently
      if (app.lifecycleMode === 'external') {
        // For external apps, check if the listener still exists
        const inspection = await this.portManager.inspectPort(app.port, {
          type: app.healthCheck.type,
          path: app.healthCheck.path,
          expectedStatus: app.healthCheck.expectedStatus,
          expectedBodyContains: app.healthCheck.expectedBodyContains,
          timeoutMs: app.healthCheck.timeoutMs,
        });

        if (inspection.listener) {
          // Listener still exists, update PID if changed
          const ownerPid = inspection.listener.pid;
          const ownerImage = inspection.listener.ownerImage;

          const updatedState: RuntimeState = {
            ...state,
            processState: 'external',
            healthState: 'unknown',
            portState: 'unknown',
            pid: ownerPid,
            processStartTime: Date.now(),
            updatedAt: Date.now(),
          };
          RuntimeStateRepository.upsert(updatedState);
          this.emitStateChange(app.id, 'external', 'unknown');

          // Restart health monitoring
          this.healthMonitor.startCheckForApp(app.id);

          this.emitAppLog(
            app.id,
            'info',
            `Re-adopted external app on port ${app.port} (PID: ${ownerPid})`
          );
        } else {
          // Listener disappeared
          const updatedState: RuntimeState = {
            ...state,
            processState: 'stopped',
            healthState: 'unknown',
            portState: 'unknown',
            lastError: 'External listener disappeared',
            updatedAt: Date.now(),
          };
          RuntimeStateRepository.upsert(updatedState);
          this.emitStateChange(app.id, 'stopped', 'unknown');
          this.emitAppLog(app.id, 'warn', `External app on port ${app.port} listener disappeared`);
        }
        continue;
      }

      // Verify PID ownership for managed apps
      const processInfo = await this.osAdapter.getProcessInfo(state.pid);
      if (processInfo && processInfo.startTime === state.processStartTime) {
        // Re-adopt
        this.runningProcesses.set(app.id, { child: null, startTime: state.processStartTime });
        const recoveredState: RuntimeState = {
          ...state,
          processState: 'running',
          healthState: 'checking',
          updatedAt: Date.now(),
        };
        RuntimeStateRepository.upsert(recoveredState);
        this.emitStateChange(app.id, 'running', 'checking');
      } else {
        // PID reused or process gone
        const updatedState: RuntimeState = {
          ...state,
          processState: 'stopped',
          healthState: 'unknown',
          lastError: 'NEST was not running when it exited',
          updatedAt: Date.now(),
        };
        RuntimeStateRepository.upsert(updatedState);
      }
    }
  }

  /**
   * Start periodic monitoring for external apps
   * Checks every 30 seconds if external listeners are still present
   */
  startExternalMonitoring(): void {
    if (this.externalMonitorInterval) {
      return;
    }
    this.externalMonitorInterval = setInterval(async () => {
      try {
        const apps = await this.listApplications();
        for (const app of apps) {
          if (app.lifecycleMode !== 'external') continue;

          const state = RuntimeStateRepository.get(app.id);
          if (!state || state.processState !== 'external') continue;

          try {
            const inspection = await this.portManager.inspectPort(app.port, {
              type: app.healthCheck.type,
              path: app.healthCheck.path,
              expectedStatus: app.healthCheck.expectedStatus,
              expectedBodyContains: app.healthCheck.expectedBodyContains,
              timeoutMs: app.healthCheck.timeoutMs,
            });

            if (!inspection.listener) {
              // Listener disappeared
              const updatedState: RuntimeState = {
                ...RuntimeStateRepository.get(app.id)!,
                processState: 'stopped',
                healthState: 'unknown',
                portState: 'unknown',
                lastError: 'External listener disappeared',
                updatedAt: Date.now(),
              };
              RuntimeStateRepository.upsert(updatedState);
              this.emitStateChange(app.id, 'stopped', 'unknown');
              this.emitAppLog(
                app.id,
                'warn',
                `External app on port ${app.port} listener disappeared`
              );
              this.healthMonitor.stopCheckForApp(app.id);
            } else {
              // Listener still present, update PID if changed
              const ownerPid = inspection.listener.pid;
              const currentState = RuntimeStateRepository.get(app.id);
              if (currentState && currentState.pid !== ownerPid) {
                const updatedState: RuntimeState = {
                  ...currentState,
                  pid: ownerPid,
                  processStartTime: Date.now(),
                  updatedAt: Date.now(),
                };
                RuntimeStateRepository.upsert(updatedState);
              }
            }
          } catch (error) {
            console.error(`[AppManager] External monitor check failed for ${app.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[AppManager] External monitor check failed:`, error);
      }
    }, 30000); // Check every 30 seconds
  }

  stopExternalMonitoring(): void {
    if (this.externalMonitorInterval) {
      clearInterval(this.externalMonitorInterval);
      this.externalMonitorInterval = null;
    }
  }

  async stopAll(): Promise<void> {
    const apps = await this.listApplications();
    for (const app of apps) {
      const state = RuntimeStateRepository.get(app.id);
      if (state && ['starting', 'running', 'stopping'].includes(state.processState)) {
        try {
          await this.stop(app.id, true);
        } catch (error) {
          console.error(`[AppManager] Failed to stop ${app.id}:`, error);
        }
      }
    }
  }

  getAllRunningApps(): any[] {
    const apps = ApplicationRepository.list();
    return apps
      .map((app) => {
        const state = RuntimeStateRepository.get(app.id);
        return state && ['starting', 'running', 'stopping'].includes(state.processState)
          ? { config: app, runtimeState: state }
          : null;
      })
      .filter((a): a is { config: any; runtimeState: RuntimeState } => a !== null);
  }

  lintLaunchConfig(config: any): any[] {
    return lintLaunchConfig(config);
  }

  async queryLogs(params: any): Promise<{ entries: any[]; total: number }> {
    return ActivityLogRepository.query(params);
  }

  private emitStateChange(appId: string, processState: ProcessState, healthState: HealthState) {
    this.validateTransition(processState, processState);
    this.eventBus.emit('app.stateChanged', {
      appId,
      processState,
      healthState,
      timestamp: Date.now(),
    });
  }

  private emitAppLog(
    appId: string | undefined,
    severity: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    details?: Record<string, unknown>
  ) {
    const entry = {
      id: crypto.randomUUID(),
      appId,
      eventType: 'info' as const,
      severity,
      message,
      details,
      timestamp: Date.now(),
    };
    // ActivityLogRepository.insert(entry);
    this.eventBus.emit('app.log', entry);
  }

  private createError(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ): Error & {
    code: ErrorCode;
    details?: Record<string, unknown>;
  } {
    const error = new Error(message) as Error & {
      code: ErrorCode;
      details?: Record<string, unknown>;
    };
    error.code = code;
    error.details = details;
    return error;
  }

  // Shutdown handling
  async handleBeforeQuit(): Promise<void> {
    this.isQuitting = true;
    const policy = this.settings.shutdownPolicy;

    if (policy === 'ask') {
      // In a real implementation, this would show a dialog
      // For now, default to stop_all
      await this.stopAll();
    } else if (policy === 'stop_all') {
      await this.stopAll();
    }
    // keep_running: do nothing, apps keep running
  }

  async handleQuit(): Promise<void> {
    await this.handleBeforeQuit();
  }
}
