/**
 * Application Manager - Lifecycle & Supervision
 */
import type {
  ApplicationConfig,
  RuntimeState,
  ProcessState,
  HealthState,
  LaunchConfigWarning,
} from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus } from '../../events';
import {
  ApplicationRepository,
  RuntimeStateRepository,
  AccessPolicyRepository,
  ActivityLogRepository,
} from '../../db';
import { lintLaunchConfig } from '@shared/schemas';
import { v4 as uuidv4 } from 'uuid';

export class ApplicationManager {
  private osAdapter: any;
  private eventBus: ReturnType<typeof import('../../events').setupEventBus>;
  private settings: any;
  private runningProcesses: Map<string, { child: any; startTime: number }> = new Map();
  private startLocks: Map<string, Promise<RuntimeState>> = new Map();

  constructor(
    osAdapter: any,
    eventBus: ReturnType<typeof import('../../events').setupEventBus>,
    settings: any
  ) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.settings = settings;
  }

  async listApplications(): Promise<ApplicationConfig[]> {
    return ApplicationRepository.list();
  }

  async getApplication(id: string): Promise<ApplicationConfig | null> {
    return ApplicationRepository.get(id);
  }

  async createApplication(
    config: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ApplicationConfig> {
    const now = Date.now();
    const app: ApplicationConfig = {
      ...config,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    ApplicationRepository.create(app);

    // Create default access policy
    AccessPolicyRepository.upsert({
      appId: app.id,
      mode: 'local_only',
      updatedAt: now,
    });

    // Create initial runtime state
    RuntimeStateRepository.upsert({
      appId: app.id,
      processState: 'registered',
      healthState: 'unknown',
      portState: 'unknown',
      updatedAt: now,
    });

    this.emitAppLog(app.id, 'info', 'Application registered', { name: app.name });
    return app;
  }

  async updateApplication(
    id: string,
    config: Partial<ApplicationConfig>
  ): Promise<ApplicationConfig | null> {
    const app = await this.getApplication(id);
    if (!app) return null;

    const updated = { ...app, ...config, updatedAt: Date.now() };
    ApplicationRepository.update(id, updated);
    return updated;
  }

  async removeApplication(id: string, confirmDeleteFiles: boolean): Promise<void> {
    const app = await this.getApplication(id);
    if (!app) return;

    // Stop if running
    const state = RuntimeStateRepository.get(id);
    if (state && ['starting', 'running', 'stopping'].includes(state.processState)) {
      await this.stop(id, true);
    }

    // Remove from database (cascades to runtime_state, access_policies)
    ApplicationRepository.delete(id);

    this.emitAppLog(id, 'info', 'Application removed', { name: app.name });
  }

  async start(id: string): Promise<RuntimeState> {
    // Check for existing start operation
    const existingLock = this.startLocks.get(id);
    if (existingLock) return existingLock;

    const lock = this.doStart(id);
    this.startLocks.set(id, lock);
    try {
      return await lock;
    } finally {
      this.startLocks.delete(id);
    }
  }

  private async doStart(id: string): Promise<RuntimeState> {
    const app = await this.getApplication(id);
    if (!app) throw new Error('Application not found');

    const currentState = RuntimeStateRepository.get(id);
    if (currentState && ['starting', 'running'].includes(currentState.processState)) {
      throw new Error('Application already running or starting');
    }

    // Validate config
    if (!app.workingDirectory) throw new Error('Working directory not set');

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
      if (!resolved) throw new Error(`Executable not found: ${app.executable}`);

      // Prepare environment
      const env: Record<string, string> = {};
      for (const e of app.env) {
        env[e.key] = e.value;
      }

      // Spawn process
      const { pid, startTime, child } = await this.osAdapter.spawnProcess({
        executable: resolved.path,
        args: [...resolved.args, ...app.args],
        workingDirectory: app.workingDirectory,
        env,
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

      throw new Error('Startup timeout');
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

  private async checkPort(port: number): Promise<{ state: string }> {
    // Use port manager if available
    return { state: 'occupied_by_managed' };
  }

  private async checkHealth(app: ApplicationConfig) {
    // Delegate to health monitor
    return { processAlive: true, portListening: true, localResponding: true };
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
        this.emitAppLog(appId, 'info', line, { stream });
      }
    };

    child.stdout?.on('data', (data: Buffer) => handleOutput(data, 'stdout'));
    child.stderr?.on('data', (data: Buffer) => handleOutput(data, 'stderr'));
  }

  private handleProcessExit(appId: string, code: number | null, signal: string | null) {
    const state = RuntimeStateRepository.get(appId);
    if (!state) return;

    this.runningProcesses.delete(appId);

    const isUnexpected = code !== 0 && code !== null;
    const newState: RuntimeState = {
      ...state,
      processState: isUnexpected ? 'failed' : 'stopped',
      healthState: 'unknown',
      lastError: isUnexpected ? `Process exited with code ${code ?? signal}` : undefined,
      stoppedAt: Date.now(),
      updatedAt: Date.now(),
    };
    RuntimeStateRepository.upsert(newState);
    this.emitStateChange(appId, newState.processState, 'unknown');

    this.emitAppLog(
      appId,
      isUnexpected ? 'error' : 'info',
      `Process exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (signal: ${signal})` : ''}`
    );
  }

  async stop(id: string, force = false): Promise<RuntimeState> {
    const state = RuntimeStateRepository.get(id);
    if (!state) throw new Error('Application not found');

    const processInfo = state.pid ? await this.osAdapter.getProcessInfo(state.pid) : null;
    if (state.pid && processInfo && processInfo.startTime !== state.processStartTime) {
      throw new Error('Process ownership verification failed (PID reused)');
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
  }

  async restart(id: string): Promise<RuntimeState> {
    await this.stop(id);
    return this.start(id);
  }

  async registerExternal(params: {
    name: string;
    port: number;
    protocol: 'http' | 'https';
    healthCheck?: any;
    selectedInterface?: string;
  }): Promise<ApplicationConfig> {
    const app = await this.createApplication({
      name: params.name,
      projectPath: '',
      executable: 'external',
      args: [],
      workingDirectory: '',
      env: [],
      protocol: params.protocol,
      port: params.port,
      expectedListenAddress: 'all',
      lifecycleMode: 'external',
      startupTimeoutMs: 5000,
      healthCheck: params.healthCheck || {
        type: 'tcp',
        intervalMs: 30000,
        timeoutMs: 5000,
        failureThreshold: 3,
      },
      selectedInterface: params.selectedInterface,
    });

    // Update runtime state to external
    RuntimeStateRepository.upsert({
      appId: app.id,
      processState: 'external',
      healthState: 'unknown',
      portState: 'unknown',
      updatedAt: Date.now(),
    });
    this.emitStateChange(app.id, 'external', 'unknown');

    return app;
  }

  async recover(): Promise<void> {
    const apps = await this.listApplications();
    for (const app of apps) {
      const state = RuntimeStateRepository.get(app.id);
      if (!state || !state.pid || !state.processStartTime) continue;

      // Verify PID ownership
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

  getAllRunningApps(): { config: ApplicationConfig; runtimeState: RuntimeState }[] {
    const apps = ApplicationRepository.list();
    return apps
      .map((app) => {
        const state = RuntimeStateRepository.get(app.id);
        return state && ['starting', 'running', 'stopping'].includes(state.processState)
          ? { config: app, runtimeState: state }
          : null;
      })
      .filter((a): a is { config: ApplicationConfig; runtimeState: RuntimeState } => a !== null);
  }

  lintLaunchConfig(config: ApplicationConfig): LaunchConfigWarning[] {
    return lintLaunchConfig(config);
  }

  async queryLogs(params: any): Promise<{ entries: any[]; total: number }> {
    return ActivityLogRepository.query(params);
  }

  private emitStateChange(appId: string, processState: ProcessState, healthState: HealthState) {
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
      id: uuidv4(),
      appId,
      eventType: 'info' as const,
      severity,
      message,
      details,
      timestamp: Date.now(),
    };
    ActivityLogRepository.insert(entry);
    this.eventBus.emit('app.log', entry);
  }
}
