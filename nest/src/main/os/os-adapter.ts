/**
 * OS Adapter Interface - Platform-neutral interface for OS operations
 * All OS-specific code lives behind this interface
 */
import type {
  ResolvedExecutable,
  ProcessInfo,
  ListenerInfo,
  NetworkInterfaceInfo,
  NetworkProfile,
  SystemInfo,
} from '@shared/types';

export interface OsAdapter {
  /** Resolve an executable name or path to an absolute path with args */
  resolveExecutable(nameOrPath: string): Promise<ResolvedExecutable | null>;

  /** Spawn a process with the given specification */
  spawnProcess(spec: {
    executable: string;
    args: string[];
    workingDirectory: string;
    env: Record<string, string>;
  }): Promise<{ pid: number; startTime: number; child: any }>;

  /** Get process information by PID */
  getProcessInfo(pid: number): Promise<ProcessInfo | null>;

  /** List child processes of a given PID */
  listChildProcesses(pid: number): Promise<ProcessInfo[]>;

  /** Terminate a process tree */
  terminateProcessTree(
    pid: number,
    options: { graceful: boolean }
  ): Promise<{ success: boolean; error?: string }>;

  /** List all TCP listeners */
  listTcpListeners(): Promise<ListenerInfo[]>;

  /** Get network interfaces */
  getNetworkInterfaces(): Promise<NetworkInterfaceInfo[]>;

  /** Get network profile for an interface */
  getNetworkProfile(interfaceId: string): Promise<NetworkProfile>;

  /** Get system information */
  getSystemInfo(): Promise<SystemInfo>;

  // Firewall operations (implemented in Phase 3)
  firewall?: {
    addRule(params: {
      appId: string;
      name: string;
      port: number;
      remoteAddress: string;
    }): Promise<{ success: boolean; ruleName?: string; error?: string }>;
    removeRule(appId: string): Promise<{ success: boolean; error?: string }>;
    getRule(appId: string): Promise<{ exists: boolean; rule?: any; error?: string }>;
    listRules(): Promise<any[]>;
    getActiveProfile(): Promise<NetworkProfile>;
    reconcileRules(expectedRules: any[]): Promise<{ orphaned: any[]; missing: any[] }>;
  };
}

/** Factory function to create the platform-specific adapter */
export function createOsAdapter(): OsAdapter {
  if (process.platform === 'win32') {
    return new (require('./windows/WindowsAdapter').WindowsAdapter)();
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
