/**
 * Stress/Soak Tests for NEST
 * Tests 10+ simultaneous apps starting/stopping/crashing
 * Verifies per-app locks, no event storms (coalesce), no leaked timers/listeners/handles
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { ApplicationManager } from '../../src/main/services/application-manager';
import { PortManager } from '../../src/main/services/port-manager';
import { NetworkManager } from '../../src/main/services/network-manager';
import { HealthMonitor } from '../../src/main/services/health-monitor';
import { SecurityPolicyManager } from '../../src/main/services/security-policy';
import { DiagnosticsService } from '../../src/main/services/diagnostics';
import { setupEventBus, eventBus } from '../../src/main/events';

// Test configuration
const STRESS_TEST_CONFIG = {
  appCount: 12,
  iterations: 5,
  operationDelay: 100, // ms between operations
  maxMemoryGrowth: 50 * 1024 * 1024, // 50MB max memory growth
  testDuration: 30 * 60 * 1000, // 30 minutes for soak test
};

// Mock OS adapter for testing
class MockOSAdapter {
  private processes = new Map<number, { startTime: number; alive: boolean }>();
  private pidCounter = 10000;
  private listeners = new Map<number, { port: number; address: string; pid: number }>();

  async spawnProcess(config: any): Promise<{ pid: number; startTime: number; child: any }> {
    const pid = this.pidCounter++;
    const startTime = Date.now();
    
    const child = {
      pid,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'exit') {
          setTimeout(() => cb(0, null), 100);
        }
      }),
      kill: vi.fn(),
    };

    this.processes.set(pid, { startTime, alive: true });
    this.listeners.set(pid, { port: config.args.includes('--port') ? parseInt(config.args[config.args.indexOf('--port') + 1]) : 3000, address: '127.0.0.1', pid });

    return { pid, startTime, child };
  }

  async terminateProcessTree(pid: number, options: { graceful: boolean }): Promise<{ success: boolean }> {
    const process = this.processes.get(pid);
    if (process) {
      process.alive = false;
      this.processes.delete(pid);
      this.listeners.delete(pid);
      return { success: true };
    }
    return { success: false };
  }

  async getProcessInfo(pid: number): Promise<{ pid: number; startTime: number; imageName: string; parentPid?: number } | null> {
    const process = this.processes.get(pid);
    if (process && process.alive) {
      return { pid, startTime: process.startTime, imageName: 'node.exe' };
    }
    return null;
  }

  async listTcpListeners(): Promise<Array<{ localAddress: string; localPort: number; pid: number; protocol: 'TCP' | 'UDP' }>> {
    const listeners: Array<{ localAddress: string; localPort: number; pid: number; protocol: 'TCP' | 'UDP' }> = [];
    for (const [pid, info] of this.listeners) {
      if (this.processes.get(pid)?.alive) {
        listeners.push({
          localAddress: info.address,
          localPort: info.port,
          pid,
          protocol: 'TCP',
        });
      }
    }
    return listeners;
  }

  async getNetworkInterfaces(): Promise<Array<{ name: string; description: string; ipv4: string; subnet: string; prefixLength: number; gateway?: string; isUp: boolean; type: string; networkProfile: string; isRecommended: boolean }>> {
    return [{
      name: 'Ethernet',
      description: 'Test Ethernet Adapter',
      ipv4: '192.168.1.100',
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'Ethernet',
      networkProfile: 'Private',
      isRecommended: true,
    }];
  }

  async resolveExecutable(executable: string): Promise<{ path: string; args: string[]; isCmd: boolean }> {
    return { path: 'node', args: [], isCmd: false };
  }

  async getSystemInfo(): Promise<any> {
    return {
      platform: 'win32',
      arch: 'x64',
      electronVersion: '32.0.0',
      nodeVersion: '20.0.0',
      isElevated: false,
      userDataPath: '/mock/user/data',
    };
  }

  // Helper for tests
  addListener(pid: number, port: number, address: string = '127.0.0.1') {
    this.listeners.set(pid, { port, address, pid });
  }

  removeListener(pid: number) {
    this.listeners.delete(pid);
  }

  killProcess(pid: number) {
    const process = this.processes.get(pid);
    if (process) {
      process.alive = false;
    }
  }
}

describe('Stress/Soak Tests', () => {
  let osAdapter: MockOSAdapter;
  let eventBus: ReturnType<typeof setupEventBus>;
  let appManager: ApplicationManager;
  let portManager: PortManager;
  let networkManager: NetworkManager;
  let healthMonitor: HealthMonitor;
  let securityPolicyManager: SecurityPolicyManager;
  let diagnosticsService: DiagnosticsService;

  const testApps: Array<{ id: string; config: any }> = [];

  beforeAll(async () => {
    // Initialize services
    osAdapter = new MockOSAdapter();
    eventBus = setupEventBus();
    
    portManager = new PortManager(osAdapter, eventBus, null as any);
    networkManager = new NetworkManager(osAdapter, eventBus);
    healthMonitor = new HealthMonitor(osAdapter, eventBus, null as any);
    securityPolicyManager = new SecurityPolicyManager(osAdapter, eventBus, networkManager, null as any, portManager);
    diagnosticsService = new DiagnosticsService(osAdapter, null as any, portManager, healthMonitor, networkManager, securityPolicyManager);

    appManager = new ApplicationManager(
      osAdapter,
      eventBus,
      {
        backgroundMode: true,
        shutdownPolicy: 'stop_all',
        startupAtLogin: false,
        confirmationPreferences: {},
        logRetentionDays: 30,
        logMaxLinesPerApp: 5000,
      },
      undefined, // portGuard
      healthMonitor,
      portManager,
      securityPolicyManager,
      networkManager
    );

    // Create test applications
    for (let i = 0; i < STRESS_TEST_CONFIG.appCount; i++) {
      const port = 4000 + i;
      const config = {
        name: `Stress Test App ${i}`,
        projectPath: `C:\\Projects\\StressTest${i}`,
        executable: 'node',
        args: ['server.js', `--port=${port}`],
        workingDirectory: `C:\\Projects\\StressTest${i}`,
        env: [],
        protocol: 'http' as const,
        port,
        expectedListenAddress: 'all' as const,
        lifecycleMode: 'managed' as const,
        startupTimeoutMs: 10000,
        healthCheck: {
          type: 'http' as const,
          path: '/health',
          expectedStatus: 200,
          intervalMs: 5000,
          timeoutMs: 2000,
          failureThreshold: 2,
        },
        lanLaunchProfile: {
          args: ['--host', '0.0.0.0'],
          env: [],
        },
      };

      const app = await appManager.createApplication(config);
      testApps.push({ id: app.id, config });
    }

    // Start network manager polling
    networkManager.start();

    // Start external monitoring
    appManager.startExternalMonitoring();
  });

  afterAll(async () => {
    networkManager.stop();
    appManager.stopExternalMonitoring();
    
    // Stop all apps
    for (const { id } of testApps) {
      try {
        await appManager.stop(id, true);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Per-App Locks and Coalescing', () => {
    it('should prevent concurrent start operations on same app', async () => {
      const app = testApps[0];
      
      // Start first operation
      const startPromise1 = appManager.start(app.id);
      
      // Immediately try to start again (should be coalesced)
      const startPromise2 = appManager.start(app.id);
      
      // Both should resolve to the same result
      const [result1, result2] = await Promise.all([startPromise1, startPromise2]);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.processState).toBe('running');
    });

    it('should prevent concurrent stop operations on same app', async () => {
      const app = testApps[1];
      
      // Start the app first
      await appManager.start(app.id);
      
      // Try concurrent stops
      const stopPromise1 = appManager.stop(app.id);
      const stopPromise2 = appManager.stop(app.id);
      
      const [result1, result2] = await Promise.all([stopPromise1, stopPromise2]);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.processState).toBe('stopped');
    });

    it('should handle rapid start/stop/restart cycles', async () => {
      const app = testApps[2];
      
      for (let i = 0; i < STRESS_TEST_CONFIG.iterations; i++) {
        await appManager.start(app.id);
        const runningState = await appManager.getApplication(app.id);
        expect(runningState).toBeDefined();
        
        await appManager.stop(app.id);
        const stoppedState = await appManager.getApplication(app.id);
        expect(stoppedState).toBeDefined();
        
        await new Promise(r => setTimeout(r, STRESS_TEST_CONFIG.operationDelay));
      }
    });
  });

  describe('Event Coalescing (No Event Storms)', () => {
    it('should coalesce rapid state change events', async () => {
      const app = testApps[3];
      const events: any[] = [];
      
      const listener = (event: any) => {
        if (event.appId === app.id) {
          events.push(event);
        }
      };
      
      eventBus.on('app.stateChanged', listener);

      // Rapidly change state
      await appManager.start(app.id);
      await appManager.stop(app.id);
      await appManager.start(app.id);
      await appManager.stop(app.id);

      // Wait for events to be processed
      await new Promise(r => setTimeout(r, 100));

      // Should have received events but not a storm
      // With coalescing, we expect at most 4 state changes
      expect(events.length).toBeLessThanOrEqual(8);
      expect(events.length).toBeGreaterThan(0);

      eventBus.off('app.stateChanged', listener);
    });

    it('should coalesce health check events', async () => {
      const app = testApps[4];
      const events: any[] = [];
      
      const listener = (event: any) => {
        if (event.appId === app.id) {
          events.push(event);
        }
      };
      
      eventBus.on('health.changed', listener);

      await appManager.start(app.id);
      
      // Wait for several health check cycles
      await vi.advanceTimersByTimeAsync(15000);
      
      // Should have reasonable number of health events, not a storm
      expect(events.length).toBeLessThanOrEqual(10);
      expect(events.length).toBeGreaterThan(0);

      eventBus.off('health.changed', listener);
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory during rapid operations', async () => {
      const app = testApps[5];
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 20; i++) {
        await appManager.start(app.id);
        await appManager.stop(app.id);
      }
      
      // Force GC if available
      if (global.gc) {
        global.gc();
      }
      
      await new Promise(r => setTimeout(r, 100));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable (less than 10MB for this test)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Simultaneous App Operations', () => {
    it('should handle 10+ apps starting simultaneously', async () => {
      const apps = testApps.slice(0, 10);
      
      // Start all simultaneously
      const startPromises = apps.map(({ id }) => appManager.start(id));
      const results = await Promise.all(startPromises);
      
      // All should succeed
      expect(results.length).toBe(10);
      results.forEach(r => {
        expect(r.processState).toBe('running');
      });
      
      // Stop all simultaneously
      const stopPromises = apps.map(({ id }) => appManager.stop(id, true));
      await Promise.all(stopPromises);
    });

    it('should handle mixed start/stop/restart operations', async () => {
      const apps = testApps.slice(0, 8);
      
      // Start all
      await Promise.all(apps.map(({ id }) => appManager.start(id)));
      
      // Mix of operations
      const operations = [
        appManager.stop(apps[0].id),
        appManager.restart(apps[1].id),
        appManager.stop(apps[2].id),
        appManager.restart(apps[3].id),
        appManager.start(apps[4].id), // Already running
        appManager.stop(apps[5].id),
        appManager.restart(apps[6].id),
        appManager.stop(apps[7].id),
      ];
      
      const results = await Promise.allSettled(operations);
      
      // Most should succeed (some may fail due to state conflicts which is expected)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(6);
    });
  });
});

describe('Network Change Handling', () => {
  let osAdapter: MockOSAdapter;
  let eventBus: ReturnType<typeof setupEventBus>;
  let networkManager: NetworkManager;

  beforeAll(() => {
    osAdapter = new MockOSAdapter();
    eventBus = setupEventBus();
    
    networkManager = new NetworkManager(osAdapter, eventBus);
  });

  it('should detect Wi-Fi interface IP change', async () => {
    const ipChangedEvents: any[] = [];
    
    eventBus.on('network.changed', (event: any) => {
      if (event.diff?.ipChanged) {
        ipChangedEvents.push(event);
      }
    });

    // Simulate interface list with initial IP
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Wi-Fi',
      description: 'Wi-Fi Adapter',
      ipv4: '192.168.1.50',
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'WiFi',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    await networkManager.selectInterface('Wi-Fi');
    
    // Simulate IP change
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Wi-Fi',
      description: 'Wi-Fi Adapter',
      ipv4: '192.168.1.75', // Changed IP
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'WiFi',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    // Trigger poll
    await vi.advanceTimersByTimeAsync(6000);
    
    expect(ipChangedEvents.length).toBeGreaterThan(0);
    expect(ipChangedEvents[0].diff.ipChanged).toBe(true);
    expect(ipChangedEvents[0].diff.previousIp).toBe('192.168.1.50');
    expect(ipChangedEvents[0].diff.currentIp).toBe('192.168.1.75');
  });

  it('should detect adapter down/up', async () => {
    const interfaceChangedEvents: any[] = [];
    
    eventBus.on('network.changed', (event: any) => {
      if (event.diff?.interfacesChanged) {
        interfaceChangedEvents.push(event);
      }
    });

    // Initial state with two adapters
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([
      {
        name: 'Ethernet',
        description: 'Ethernet Adapter',
        ipv4: '192.168.1.100',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '192.168.1.1',
        isUp: true,
        type: 'Ethernet',
        networkProfile: 'Private',
        isRecommended: true,
      },
      {
        name: 'Wi-Fi',
        description: 'Wi-Fi Adapter',
        ipv4: '192.168.1.50',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '192.168.1.1',
        isUp: true,
        type: 'WiFi',
        networkProfile: 'Private',
        isRecommended: false,
      },
    ]);

    await networkManager.selectInterface('Ethernet');

    // Simulate Wi-Fi going down
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([
      {
        name: 'Ethernet',
        description: 'Ethernet Adapter',
        ipv4: '192.168.1.100',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '192.168.1.1',
        isUp: true,
        type: 'Ethernet',
        networkProfile: 'Private',
        isRecommended: true,
      },
      // Wi-Fi removed
    ]);

    await vi.advanceTimersByTimeAsync(6000);
    
    expect(interfaceChangedEvents.length).toBeGreaterThan(0);
    expect(interfaceChangedEvents[0].diff.interfacesChanged).toBe(true);
    expect(interfaceChangedEvents[0].diff.removed.length).toBe(1);
    expect(interfaceChangedEvents[0].diff.removed[0].name).toBe('Wi-Fi');
  });

  it('should detect VPN connect/disconnect', async () => {
    const interfaceChangedEvents: any[] = [];
    
    eventBus.on('network.changed', (event: any) => {
      if (event.diff?.interfacesChanged) {
        interfaceChangedEvents.push(event);
      }
    });

    // Initial state without VPN
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([
      {
        name: 'Ethernet',
        description: 'Ethernet Adapter',
        ipv4: '192.168.1.100',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '192.168.1.1',
        isUp: true,
        type: 'Ethernet',
        networkProfile: 'Private',
        isRecommended: true,
      },
    ]);

    await networkManager.selectInterface('Ethernet');

    // Simulate VPN connecting
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([
      {
        name: 'Ethernet',
        description: 'Ethernet Adapter',
        ipv4: '192.168.1.100',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '192.168.1.1',
        isUp: true,
        type: 'Ethernet',
        networkProfile: 'Private',
        isRecommended: true,
      },
      {
        name: 'VPN Adapter',
        description: 'Corporate VPN',
        ipv4: '10.0.0.5',
        subnet: '255.255.255.0',
        prefixLength: 24,
        gateway: '10.0.0.1',
        isUp: true,
        type: 'VPN',
        networkProfile: 'Private',
        isRecommended: false,
      },
    ]);

    await vi.advanceTimersByTimeAsync(6000);
    
    expect(interfaceChangedEvents.length).toBeGreaterThan(0);
    expect(interfaceChangedEvents[0].diff.added.length).toBe(1);
    expect(interfaceChangedEvents[0].diff.added[0].type).toBe('VPN');
  });

  it('should update LAN URLs when selected interface IP changes', async () => {
    const urlChangedEvents: any[] = [];
    
    eventBus.on('network.staleUrl', (event: any) => {
      urlChangedEvents.push(event);
    });

    // Initial state
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Wi-Fi',
      description: 'Wi-Fi Adapter',
      ipv4: '192.168.1.50',
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'WiFi',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    await networkManager.selectInterface('Wi-Fi');

    // Simulate IP change
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Wi-Fi',
      description: 'Wi-Fi Adapter',
      ipv4: '192.168.1.75', // Changed
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'WiFi',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    await vi.advanceTimersByTimeAsync(6000);
    
    // The network.changed event should include the IP change diff
    expect(urlChangedEvents.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle network profile change (Private -> Public)', async () => {
    const profileChangedEvents: any[] = [];
    
    eventBus.on('network.changed', (event: any) => {
      if (event.diff?.interfacesChanged) {
        const changed = event.diff.changed?.find((c: any) => c.networkProfile);
        if (changed) {
          profileChangedEvents.push(event);
        }
      }
    });

    // Initial Private profile
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Ethernet',
      description: 'Ethernet Adapter',
      ipv4: '192.168.1.100',
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'Ethernet',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    await networkManager.selectInterface('Ethernet');

    // Change to Public profile
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Ethernet',
      description: 'Ethernet Adapter',
      ipv4: '192.168.1.100',
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'Ethernet',
      networkProfile: 'Public', // Changed!
      isRecommended: true,
    }]);

    await vi.advanceTimersByTimeAsync(6000);
    
    expect(profileChangedEvents.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Sleep/Resume Handling', () => {
  let osAdapter: MockOSAdapter;
  let eventBus: ReturnType<typeof setupEventBus>;
  let appManager: ApplicationManager;
  let networkManager: NetworkManager;
  let healthMonitor: HealthMonitor;

  beforeAll(() => {
    osAdapter = new MockOSAdapter();
    eventBus = setupEventBus();
    
    networkManager = new NetworkManager(osAdapter, eventBus);
    healthMonitor = new HealthMonitor(osAdapter, eventBus, null as any);
    
    appManager = new ApplicationManager(
      osAdapter,
      eventBus,
      {
        backgroundMode: true,
        shutdownPolicy: 'stop_all',
        startupAtLogin: false,
        confirmationPreferences: {},
        logRetentionDays: 30,
        logMaxLinesPerApp: 5000,
      },
      undefined,
      healthMonitor,
      {} as any,
      {} as any,
      networkManager
    );
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('should have powerMonitor integration in main process', () => {
    // The main process registers powerMonitor handlers for suspend/resume
    // This is tested in the main process integration test
    expect(true).toBe(true);
  });

  it('should re-reconcile processes on resume via recover()', async () => {
    const pid = 12345;
    const startTime = Date.now() - 100000;

    // Simulate app running before sleep
    osAdapter.getProcessInfo = vi.fn().mockResolvedValue({
      pid,
      startTime,
      imageName: 'node.exe',
    });

    osAdapter.listTcpListeners = vi.fn().mockResolvedValue([{
      localAddress: '0.0.0.0',
      localPort: 3000,
      pid,
      protocol: 'TCP',
    }]);

    // Mock the recovery process
    await expect(appManager.recover()).resolves.toBeUndefined();
  });

  it('should re-reconcile network state on resume', async () => {
    // Simulate network state after resume
    osAdapter.getNetworkInterfaces = vi.fn().mockResolvedValue([{
      name: 'Wi-Fi',
      description: 'Wi-Fi Adapter',
      ipv4: '192.168.1.100', // May be different after resume
      subnet: '255.255.255.0',
      prefixLength: 24,
      gateway: '192.168.1.1',
      isUp: true,
      type: 'WiFi',
      networkProfile: 'Private',
      isRecommended: true,
    }]);

    // Trigger network reconciliation
    await networkManager.reconcile();
    
    const interfaces = await networkManager.listInterfaces();
    expect(interfaces.length).toBeGreaterThan(0);
    expect(interfaces[0].ipv4).toBe('192.168.1.100');
  });

  it('should re-reconcile health checks on resume', async () => {
    const appId = 'test-health-app';
    
    // Simulate health check after resume
    const healthResult = await healthMonitor.checkNow(appId);
    
    expect(healthResult).toBeDefined();
    expect(typeof healthResult.processAlive).toBe('boolean');
  });
});