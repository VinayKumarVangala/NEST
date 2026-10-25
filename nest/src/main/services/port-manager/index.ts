/**
 * Port Manager - Port checking, management, and conflict detection
 */
import { EventEmitter } from 'events';
import net from 'net';
import type {
  PortInfo,
  ListenerInfo,
  PortState,
  ProcessInfo,
  ApplicationConfig,
  Result,
  AppError,
} from '@shared/types';

/**
 * PortGuard interface for Phase 2 integration
 */
export interface PortGuard {
  checkPort(port: number): Promise<{ available: boolean; error?: string }>;
}

/**
 * No-op PortGuard for Phase 1
 */
export class NoOpPortGuardImpl implements PortGuard {
  async checkPort(_port: number): Promise<{ available: boolean; error?: string }> {
    return { available: true };
  }
}

/**
 * Extended listener info with owner process details
 */
export interface ListenerInfoWithOwner extends ListenerInfo {
  ownerImage?: string;
  ownedByManagedAppId?: string;
}

/**
 * Port check result with detailed information
 */
export interface PortCheckResult {
  available: boolean;
  portInfo?: PortInfo;
  error?: string;
  suggestedPort?: number;
}

/**
 * Config drift detection result
 */
export interface ConfigDrift {
  stale: { port: number; appId: string; appName: string; reason: string }[];
  changed: { port: number; oldPid: number; newPid: number; appId: string }[];
  orphaned: { port: number; pid: number; processImage?: string }[];
}

/**
 * PortManager service for port checking, management, and conflict detection
 */
export class PortManager extends EventEmitter {
  private osAdapter: any;
  private eventBus: any;
  private applicationManager: any;
  private portGuard: PortGuard;
  private registeredAppPorts: Map<number, string> = new Map(); // port -> appId

  constructor(
    osAdapter: any,
    eventBus: any,
    applicationManager: any = null,
    portGuard: PortGuard = new NoOpPortGuardImpl()
  ) {
    super();
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.applicationManager = applicationManager;
    this.portGuard = portGuard;
  }

  /**
   * Update the registered app ports map (called when apps are registered/updated/removed)
   */
  updateRegisteredAppPorts(apps: ApplicationConfig[]): void {
    this.registeredAppPorts.clear();
    for (const app of apps) {
      this.registeredAppPorts.set(app.port, app.id);
    }
  }

  /**
   * Check if a port is available using both attempt-bind and listener table lookup
   */
  async checkPort(port: number, host?: string): Promise<PortInfo> {
    const bindHost = host || '127.0.0.1';

    // First, check listener table
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: ListenerInfo) => l.localPort === port);

    if (!listener) {
      // No listener in table, attempt bind test
      const bindResult = await this.attemptBind(port, bindHost);
      if (bindResult.success) {
        return { port, state: 'free', boundAddress: bindHost };
      }
      // Bind failed but no listener in table - could be race condition or permission issue
      return { port, state: 'unknown', boundAddress: bindHost };
    }

    // Listener exists in table, get owner process info
    const ownerInfo = await this.getProcessInfoSafe(listener.pid);
    const boundAddress = listener.localAddress;

    // Determine port state based on bound address
    let state: PortState = 'occupied_by_other';
    if (boundAddress === '127.0.0.1' || boundAddress === '::1') {
      state = 'listening_loopback';
    } else if (boundAddress === '0.0.0.0' || boundAddress === '::') {
      state = 'listening_all';
    } else if (this.isLanAddress(boundAddress)) {
      state = 'listening_lan';
    }

    // Check if this port is registered to a managed app
    const managedAppId = this.registeredAppPorts.get(port);
    if (managedAppId) {
      state = 'occupied_by_managed';
    }

    // Also check via PortGuard for immediate pre-spawn check
    const guardResult = await this.portGuard.checkPort(port);
    if (!guardResult.available) {
      // PortGuard says not available (e.g., reserved by another NEST app)
      const guardListener = listeners.find((l: ListenerInfo) => l.localPort === port);
      if (guardListener) {
        const ownerInfo2 = await this.getProcessInfoSafe(guardListener.pid);
        return {
          port,
          state: 'occupied_by_managed',
          ownerPid: guardListener.pid,
          ownerImage: ownerInfo2?.imageName,
          ownedByManagedAppId: managedAppId,
          boundAddress: guardListener.localAddress,
        };
      }
    }

    return {
      port,
      state,
      ownerPid: listener.pid,
      ownerImage: ownerInfo?.imageName,
      ownedByManagedAppId: managedAppId,
      boundAddress,
    };
  }

  /**
   * Attempt to bind to a port to test availability
   */
  private async attemptBind(
    port: number,
    host: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: false, error: `Bind test failed: ${err.message}` });
        }
      });
      server.once('listening', () => {
        server.close(() => resolve({ success: true }));
      });
      server.listen(port, host);
    });
  }

  /**
   * Get process info safely, returning undefined on failure
   */
  private async getProcessInfoSafe(pid: number): Promise<ProcessInfo | undefined> {
    try {
      const info = await this.osAdapter.getProcessInfo(pid);
      return info || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if an address is a LAN address (not loopback, not 0.0.0.0)
   */
  private isLanAddress(address: string): boolean {
    if (address === '127.0.0.1' || address === '::1' || address === '0.0.0.0' || address === '::') {
      return false;
    }
    // Check if it's a private IP range
    const parts = address.split('.');
    if (parts.length === 4) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      // 10.x.x.x, 172.16-31.x.x, 192.168.x.x
      if (first === 10) return true;
      if (first === 172 && second >= 16 && second <= 31) return true;
      if (first === 192 && second === 168) return true;
    }
    return false;
  }

  /**
   * List all TCP listeners with owner process information
   */
  async listListeners(): Promise<ListenerInfoWithOwner[]> {
    const listeners = await this.osAdapter.listTcpListeners();
    const result: ListenerInfoWithOwner[] = [];

    for (const listener of listeners) {
      if (listener.protocol !== 'TCP') continue;

      const ownerInfo = await this.getProcessInfoSafe(listener.pid);
      const managedAppId = this.registeredAppPorts.get(listener.localPort);

      result.push({
        ...listener,
        ownerImage: ownerInfo?.imageName,
        ownedByManagedAppId: managedAppId,
      });
    }

    return result;
  }

  /**
   * Suggest a free port, excluding ports configured for registered apps
   */
  async suggestPort(preferred?: number, range?: [number, number]): Promise<number> {
    const start = range?.[0] || preferred || 3000;
    const end = range?.[1] || 65535;

    // Get all listeners once
    const listeners = await this.osAdapter.listTcpListeners();
    const occupiedPorts = new Set(listeners.map((l: ListenerInfo) => l.localPort));

    // Add registered app ports to occupied set
    for (const port of this.registeredAppPorts.keys()) {
      occupiedPorts.add(port);
    }

    for (let port = start; port <= end; port++) {
      if (!occupiedPorts.has(port)) {
        // Double-check with bind test
        const bindResult = await this.attemptBind(port, '127.0.0.1');
        if (bindResult.success) {
          return port;
        }
      }
    }

    throw new Error(`No free port found in range ${start}-${end}`);
  }

  /**
   * Detect configuration drift between registered apps and actual listeners
   */
  async detectConfigDrift(apps: ApplicationConfig[]): Promise<ConfigDrift> {
    const listeners = await this.listListeners();
    const listenerPorts = new Map(listeners.map((l) => [l.localPort, l]));

    const stale: ConfigDrift['stale'] = [];
    const changed: ConfigDrift['changed'] = [];
    const orphaned: ConfigDrift['orphaned'] = [];

    // Check each registered app
    for (const app of apps) {
      const listener = listenerPorts.get(app.port);
      if (!listener) {
        // App configured but no listener - stale config
        stale.push({
          port: app.port,
          appId: app.id,
          appName: app.name,
          reason: 'No listener found on configured port',
        });
      } else {
        // Check if the listener is owned by the expected app
        const expectedPid = listener.ownedByManagedAppId === app.id ? listener.pid : undefined;
        if (!expectedPid) {
          // Port is occupied by something else
          changed.push({
            port: app.port,
            oldPid: listener.pid,
            newPid: listener.pid, // Actually unknown who owns it now
            appId: app.id,
          });
        }
      }
    }

    // Find orphaned listeners (listening ports not configured by any app)
    for (const [port, listener] of listenerPorts) {
      if (!this.registeredAppPorts.has(port) && !apps.some((a) => a.port === port)) {
        orphaned.push({
          port,
          pid: listener.pid,
          processImage: listener.ownerImage,
        });
      }
    }

    return { stale, changed, orphaned };
  }

  /**
   * PortGuard implementation that uses PortManager's checkPort
   * This replaces the NoOpPortGuard with a real implementation
   */
  getPortGuard(): PortGuard {
    return {
      checkPort: async (port: number): Promise<{ available: boolean; error?: string }> => {
        const info = await this.checkPort(port);
        if (info.state === 'free') {
          return { available: true };
        }
        // Check if it's occupied by a managed app (which would be a conflict)
        if (info.state === 'occupied_by_managed' || info.state === 'occupied_by_other') {
          return {
            available: false,
            error: `Port ${port} is already in use by ${info.ownerImage || `PID ${info.ownerPid}`}`,
          };
        }
        // For other states (listening_loopback, etc.), consider available but warn
        return { available: true };
      },
    };
  }

  /**
   * PortGuard hook used by ApplicationManager.start()
   * Re-checks immediately before spawn; on conflict returns PORT_IN_USE with owner details
   */
  async preStartPortCheck(appId: string, port: number): Promise<PortCheckResult> {
    const info = await this.checkPort(port);

    if (info.state === 'free') {
      return { available: true };
    }

    // Port is occupied - determine if it's a conflict
    if (
      info.state === 'occupied_by_other' ||
      info.state === 'occupied_by_managed' ||
      info.state === 'listening_loopback' ||
      info.state === 'listening_all' ||
      info.state === 'listening_lan'
    ) {
      // Emit port.conflict event for UI
      this.eventBus.emit('port.conflict', {
        appId,
        port,
        state: info.state,
        ownerPid: info.ownerPid,
        ownerImage: info.ownerImage,
        ownedByManagedAppId: info.ownedByManagedAppId,
        boundAddress: info.boundAddress,
        timestamp: Date.now(),
      });

      // Get suggested alternative port
      let suggestedPort: number | undefined;
      try {
        suggestedPort = await this.suggestPort(port + 1);
      } catch {
        // No suggestion available
      }

      return {
        available: false,
        portInfo: info,
        error: `Port ${port} is already in use (${info.state}). Owner: ${info.ownerImage || `PID ${info.ownerPid}`}`,
        suggestedPort,
      };
    }

    return { available: true };
  }

  /**
   * Post-spawn bind verification
   * Called after process spawn to verify the port is actually listening
   */
  async verifyPortListening(
    appId: string,
    port: number,
    timeoutMs: number = 5000
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 500));

      const info = await this.checkPort(port);
      if (info.state !== 'free') {
        // Port is now listening
        // Check if it's our process
        const listeners = await this.osAdapter.listTcpListeners();
        const listener = listeners.find((l: ListenerInfo) => l.localPort === port);
        if (listener && listener.ownedByManagedAppId === appId) {
          return { success: true };
        }
        // Port is listening but not by our app - this is a conflict
        return {
          success: false,
          error: `Port ${port} is listening but not by our app (owner: ${listener?.ownerImage || `PID ${listener?.pid}`})`,
        };
      }
    }

    // Timeout - process didn't start listening
    return {
      success: false,
      error: `Process did not start listening on port ${port} within ${timeoutMs}ms`,
    };
  }

  /**
   * Inspect a port for external registration
   * Returns detailed info about the listener and tests connectivity
   */
  async inspectPort(
    port: number,
    healthCheck: {
      type: 'tcp' | 'http' | 'https';
      path?: string;
      expectedStatus?: number;
      expectedBodyContains?: string;
      timeoutMs?: number;
    }
  ): Promise<{
    listener: ListenerInfoWithOwner | null;
    connectivity: { success: boolean; error?: string; latencyMs?: number };
  }> {
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: ListenerInfo) => l.localPort === port);

    if (!listener) {
      return {
        listener: null,
        connectivity: { success: false, error: 'No listener found on port' },
      };
    }

    // Get owner process info
    const ownerInfo = await this.getProcessInfoSafe(listener.pid);
    const managedAppId = this.registeredAppPorts.get(port);

    const listenerWithOwner: ListenerInfoWithOwner = {
      ...listener,
      ownerImage: ownerInfo?.imageName,
      ownedByManagedAppId: managedAppId,
    };

    // Test connectivity based on health check type
    let connectivity: { success: boolean; error?: string; latencyMs?: number } = {
      success: false,
      error: 'Unknown check type',
    };

    if (healthCheck.type === 'tcp') {
      const start = Date.now();
      try {
        const server = net.createServer();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('TCP connect timeout')),
            healthCheck.timeoutMs || 5000
          );
          server.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          server.once('listening', () => {
            clearTimeout(timeout);
            server.close(() => resolve());
          });
          server.listen(port, '127.0.0.1');
        });
        connectivity = { success: true, latencyMs: Date.now() - start };
      } catch (err) {
        connectivity = {
          success: false,
          error: err instanceof Error ? err.message : 'TCP connect failed',
        };
      }
    } else if (healthCheck.type === 'http' || healthCheck.type === 'https') {
      const protocol = healthCheck.type;
      const path = healthCheck.path || '/health';
      const baseUrl = `${protocol}://localhost:${port}`;
      const url = `${baseUrl}${path}`;

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), healthCheck.timeoutMs || 5000);

        const response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let success = response.ok;
        if (healthCheck.expectedStatus && response.status !== healthCheck.expectedStatus) {
          success = false;
        }
        if (healthCheck.expectedBodyContains) {
          const text = await response.text();
          success = success && text.includes(healthCheck.expectedBodyContains);
        }

        connectivity = { success, latencyMs: Date.now() - start };
        if (!success) {
          connectivity.error = `HTTP ${response.status}${healthCheck.expectedStatus ? ` (expected ${healthCheck.expectedStatus})` : ''}`;
        }
      } catch (err) {
        connectivity = {
          success: false,
          error: err instanceof Error ? err.message : 'HTTP check failed',
        };
      }
    } else {
      connectivity = { success: true, latencyMs: 0 }; // 'none' type - assume healthy
    }

    return { listener: listenerWithOwner, connectivity };
  }

  /**
   * UDP port check - explicitly unsupported
   */
  async checkUdpPort(): Promise<Result<PortInfo, AppError>> {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: 'UDP port checking is not supported',
      },
    };
  }
}

/**
 * Factory function to create PortManager with real PortGuard
 */
export function createPortManager(
  osAdapter: any,
  eventBus: any,
  applicationManager: any
): PortManager {
  const portManager = new PortManager(osAdapter, eventBus, applicationManager);
  return portManager;
}
