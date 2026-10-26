/**
 * Windows Adapter - Windows-specific OS operations
 */
import { spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type {
  ResolvedExecutable,
  ProcessInfo,
  ListenerInfo,
  NetworkInterfaceInfo,
  NetworkProfile,
  SystemInfo,
  FirewallRule,
  FirewallOperationResult,
  FirewallReconcileResult,
} from '@shared/types';
import type { OsAdapter } from '../os-adapter';

const execAsync = promisify(exec);

interface Win32Process {
  ProcessId: number;
  CreationDate: string;
  Name: string;
  ParentProcessId: number;
  ExecutablePath?: string;
  CommandLine?: string;
}

interface NetTCPConnection {
  LocalAddress: string;
  LocalPort: number;
  OwningProcess: number;
  State: string;
}

interface NetIPConfiguration {
  InterfaceAlias: string;
  InterfaceDescription: string;
  IPv4Address: { IPAddress: string; PrefixLength: number }[];
  IPv4DefaultGateway: { NextHop: string }[];
  NetAdapter: { Status: string; HardwareInterfaceType: number; InterfaceType: number }[];
  NetworkProfile?: { Name: string; Category: string }[];
}

interface NetConnectionProfile {
  Name: string;
  InterfaceAlias: string;
  NetworkCategory: string;
  IPv4Connectivity: string;
  IPv6Connectivity: string;
}

export class WindowsAdapter implements OsAdapter {
  /** Shell metacharacters that are dangerous in cmd.exe context */
  private static readonly METACHAR_REGEX = /[&|<>^%!"\n\r]/;
  /** Windows command script extensions that require cmd.exe */
  private static readonly CMD_EXTS = ['.cmd', '.bat'];

  async resolveExecutable(nameOrPath: string): Promise<ResolvedExecutable | null> {
    // Check if it's an absolute path
    if (this.isAbsolutePath(nameOrPath)) {
      return this.resolveAbsolutePath(nameOrPath);
    }

    // Check if it's a bare command (no path separators)
    if (!nameOrPath.includes('\\') && !nameOrPath.includes('/')) {
      return this.resolveFromPath(nameOrPath);
    }

    // Relative path - resolve against CWD
    return this.resolveAbsolutePath(resolve(process.cwd(), nameOrPath));
  }

  private isAbsolutePath(path: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
  }

  private async resolveAbsolutePath(absPath: string): Promise<ResolvedExecutable | null> {
    const isCmd = WindowsAdapter.CMD_EXTS.some((ext) => absPath.toLowerCase().endsWith(ext));

    if (isCmd) {
      // For .cmd/.bat, validate no metacharacters in the path itself
      if (WindowsAdapter.METACHAR_REGEX.test(absPath)) {
        throw new Error(`Path contains shell metacharacters: ${absPath}`);
      }
      return { path: 'cmd.exe', args: ['/d', '/s', '/c', `"${absPath}"`], isCmd: true };
    }

    // Try to verify the executable exists
    try {
      await execAsync(`where "${absPath}"`);
      return { path: absPath, args: [], isCmd: false };
    } catch {
      // where might fail but file could still exist
      return { path: absPath, args: [], isCmd: false };
    }
  }

  private async resolveFromPath(command: string): Promise<ResolvedExecutable | null> {
    // Check PATHEXT for Windows executables
    const pathExt = process.env.PATHEXT?.split(';').map((e) => e.toLowerCase()) || [
      '.exe',
      '.cmd',
      '.bat',
      '.com',
    ];

    for (const ext of pathExt) {
      const withExt = command.toLowerCase().endsWith(ext) ? command : command + ext;
      try {
        const { stdout } = await execAsync(`where "${withExt}"`);
        const foundPath = stdout.trim().split('\n')[0];
        if (foundPath) {
          const isCmd = ['.cmd', '.bat'].includes(ext);
          if (isCmd) {
            return { path: 'cmd.exe', args: ['/d', '/s', '/c', `"${foundPath}"`], isCmd: true };
          }
          return { path: foundPath, args: [], isCmd: false };
        }
      } catch {
        // Continue to next extension
      }
    }

    // Try without extension (might be a full command like "npm" which is npm.cmd)
    try {
      const { stdout } = await execAsync(`where "${command}"`);
      const foundPath = stdout.trim().split('\n')[0];
      if (foundPath) {
        const isCmd = WindowsAdapter.CMD_EXTS.some((ext) => foundPath.toLowerCase().endsWith(ext));
        if (isCmd) {
          return { path: 'cmd.exe', args: ['/d', '/s', '/c', `"${foundPath}"`], isCmd: true };
        }
        return { path: foundPath, args: [], isCmd: false };
      }
    } catch {
      // Not found
    }

    return null;
  }

  /**
   * Validate arguments for cmd.exe execution.
   * Throws if args contain shell metacharacters when using cmd.exe route.
   */
  private validateArgsForCmd(args: string[]): void {
    for (const arg of args) {
      if (WindowsAdapter.METACHAR_REGEX.test(arg)) {
        throw new Error(
          `Argument contains shell metacharacters (not allowed with .cmd/.bat): ${arg}`
        );
      }
      if (arg.includes('\n') || arg.includes('\r')) {
        throw new Error('Argument contains newline characters');
      }
    }
  }

  async spawnProcess(spec: {
    executable: string;
    args: string[];
    workingDirectory: string;
    env: Record<string, string>;
  }): Promise<{ pid: number; startTime: number; child: ChildProcess }> {
    // Resolve the executable first to handle .cmd/.bat properly
    const resolved = await this.resolveExecutable(spec.executable);
    if (!resolved) {
      throw new Error(`Executable not found: ${spec.executable}`);
    }

    // If using cmd.exe for .cmd/.bat, validate args for metacharacters
    if (resolved.isCmd) {
      this.validateArgsForCmd(spec.args);
    }

    const finalExecutable = resolved.path;
    const finalArgs = resolved.isCmd ? [...resolved.args, ...spec.args] : spec.args;

    const startTime = Date.now();

    return new Promise((resolvePromise, reject) => {
      const child = spawn(finalExecutable, finalArgs, {
        cwd: spec.workingDirectory,
        env: { ...process.env, ...spec.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      child.on('error', (error) => {
        reject(new Error(`Spawn failed: ${error.message}`));
      });

      child.on('spawn', () => {
        if (child.pid) {
          resolvePromise({ pid: child.pid, startTime, child });
        }
      });

      // Timeout if spawn doesn't emit 'spawn' quickly
      setTimeout(() => {
        if (!child.pid) {
          reject(new Error('Spawn timeout'));
        }
      }, 5000);
    });
  }

  async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\" | Select-Object ProcessId, CreationDate, Name, ParentProcessId, ExecutablePath | ConvertTo-Json"`
      );
      const processes: Win32Process[] = JSON.parse(stdout);
      const proc = Array.isArray(processes) ? processes[0] : processes;

      if (!proc) return null;

      return {
        pid: proc.ProcessId,
        startTime: new Date(proc.CreationDate).getTime(),
        imageName: proc.Name,
        parentPid: proc.ParentProcessId,
      };
    } catch {
      return null;
    }
  }

  async listChildProcesses(pid: number): Promise<ProcessInfo[]> {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} } | Select-Object ProcessId, CreationDate, Name, ParentProcessId | ConvertTo-Json"`
      );
      const processes: Win32Process[] = JSON.parse(stdout);
      const arr = Array.isArray(processes) ? processes : processes ? [processes] : [];

      return arr.map((p) => ({
        pid: p.ProcessId,
        startTime: new Date(p.CreationDate).getTime(),
        imageName: p.Name,
        parentPid: p.ParentProcessId,
      }));
    } catch {
      return [];
    }
  }

  async terminateProcessTree(
    pid: number,
    options: { graceful: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First try graceful termination
      if (options.graceful) {
        await execAsync(`taskkill /PID ${pid} /T`);
        return { success: true };
      }

      // Force kill
      await execAsync(`taskkill /F /PID ${pid} /T`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async listTcpListeners(): Promise<ListenerInfo[]> {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess | ConvertTo-Json"`
      );
      const connections: NetTCPConnection[] = JSON.parse(stdout);
      const arr = Array.isArray(connections) ? connections : connections ? [connections] : [];

      return arr.map((c) => ({
        localAddress: c.LocalAddress,
        localPort: c.LocalPort,
        pid: c.OwningProcess,
        protocol: 'TCP' as const,
      }));
    } catch {
      // Fallback to netstat
      try {
        const { stdout } = await execAsync('netstat -ano -p tcp');
        const lines = stdout.split('\n').slice(4); // Skip headers
        const listeners: ListenerInfo[] = [];

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5 && parts[3] === 'LISTENING') {
            const localAddr = parts[1];
            const [address, portStr] = localAddr.split(':').slice(-2);
            const port = parseInt(portStr, 10);
            const pid = parseInt(parts[4], 10);

            if (!isNaN(port) && !isNaN(pid)) {
              listeners.push({
                localAddress: address === '0.0.0.0' ? '0.0.0.0' : address,
                localPort: port,
                pid,
                protocol: 'TCP',
              });
            }
          }
        }
        return listeners;
      } catch {
        return [];
      }
    }
  }

  async getNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> {
    try {
      const { stdout: ipConfigOut } = await execAsync(
        `powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4Address } | Select-Object InterfaceAlias, InterfaceDescription, IPv4Address, IPv4DefaultGateway, NetAdapter | ConvertTo-Json -Depth 3"`
      );
      const ipConfigs: NetIPConfiguration[] = JSON.parse(ipConfigOut);
      const ipConfigArr = Array.isArray(ipConfigs) ? ipConfigs : ipConfigs ? [ipConfigs] : [];

      const { stdout: profileOut } = await execAsync(
        `powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory | ConvertTo-Json"`
      );
      const profiles: NetConnectionProfile[] = JSON.parse(profileOut);
      const profileMap = new Map(
        (Array.isArray(profiles) ? profiles : profiles ? [profiles] : []).map((p) => [
          p.InterfaceAlias,
          p.NetworkCategory,
        ])
      );

      const interfaces: NetworkInterfaceInfo[] = [];

      for (const config of ipConfigArr) {
        for (const ipv4 of config.IPv4Address) {
          const ip = ipv4.IPAddress;
          const prefix = ipv4.PrefixLength;

          // Skip loopback and link-local
          if (ip === '127.0.0.1' || ip.startsWith('169.254.')) continue;

          const gateway = config.IPv4DefaultGateway[0]?.NextHop;
          const isUp = config.NetAdapter?.[0]?.Status === 'Up';
          const adapterType = config.NetAdapter?.[0]?.InterfaceType || 0;

          let type: NetworkInterfaceInfo['type'] = 'Other';
          const desc = config.InterfaceDescription.toLowerCase();

          // Classify interface type with improved detection
          if (desc.includes('wi-fi') || desc.includes('wireless') || desc.includes('802.11')) {
            type = 'WiFi';
          } else if (
            desc.includes('ethernet') &&
            !desc.includes('virtual') &&
            !desc.includes('vmware') &&
            !desc.includes('hyper-v') &&
            !desc.includes('docker') &&
            !desc.includes('veth')
          ) {
            type = 'Ethernet';
          } else if (
            desc.includes('vpn') ||
            desc.includes('tap') ||
            desc.includes('tun') ||
            desc.includes('wintun') ||
            desc.includes('openvpn') ||
            desc.includes('wireguard')
          ) {
            type = 'VPN';
          } else if (
            desc.includes('virtual') ||
            desc.includes('vmware') ||
            desc.includes('hyper-v') ||
            desc.includes('docker') ||
            desc.includes('veth') ||
            desc.includes('loopback')
          ) {
            type = 'Virtual';
          }

          const networkProfile =
            (profileMap.get(config.InterfaceAlias) as NetworkProfile) || 'Unknown';

          // isRecommended: only Ethernet and WiFi on Private networks are recommended for LAN access
          const isRecommended =
            (type === 'Ethernet' || type === 'WiFi') && networkProfile === 'Private';

          interfaces.push({
            name: config.InterfaceAlias,
            description: config.InterfaceDescription,
            ipv4: ip,
            subnet: this.prefixToSubnet(prefix),
            prefixLength: prefix,
            gateway,
            isUp,
            type,
            networkProfile,
            isRecommended,
          });
        }
      }

      return interfaces;
    } catch (error) {
      console.error('[WindowsAdapter] getNetworkInterfaces error:', error);
      return [];
    }
  }

  async getNetworkProfile(interfaceId: string): Promise<NetworkProfile> {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-NetConnectionProfile -InterfaceAlias '${interfaceId}' | Select-Object NetworkCategory | ConvertTo-Json"`
      );
      const profiles: NetConnectionProfile[] = JSON.parse(stdout);
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      return (profile?.NetworkCategory as NetworkProfile) || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const isElevated = await this.checkElevation();
    return {
      platform: 'win32',
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.version,
      isElevated,
      userDataPath: (await import('electron')).app.getPath('userData'),
    };
  }

  /**
   * Get the path to the firewall helper script
   */
  private getFirewallHelperPath(): string {
    const basePath =
      process.env.NODE_ENV === 'development'
        ? join(__dirname, '..', '..', '..', 'resources')
        : join(process.resourcesPath, 'resources');
    return join(basePath, 'firewall-helper.ps1');
  }

  /**
   * Run the firewall helper script with the given parameters
   */
  private async runFirewallHelper(
    operation: string,
    params: Record<string, any>,
    elevated: boolean
  ): Promise<any> {
    const helperPath = this.getFirewallHelperPath();

    // Create a temp directory with restricted ACL for input/output files
    const tempDir = await mkdtemp(join(tmpdir(), 'nest-fw-'));
    const inputPath = join(tempDir, 'input.json');
    const outputPath = join(tempDir, 'output.json');

    try {
      // Write input parameters to temp file
      await writeFile(inputPath, JSON.stringify(params), { encoding: 'utf8' });

      // Build the PowerShell command
      const psArgs = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        `"${this.getFirewallHelperPath()}"`,
        '-Operation',
        operation,
        ...Object.entries(params).flatMap(([key, value]) =>
          value !== undefined ? ['-' + key, typeof value === 'string' ? `"${value}"` : value] : []
        ),
        '-OutputPath',
        `"${outputPath}"`,
      ].join(' ');

      if (elevated) {
        // For elevated operations, use Start-Process with -Verb RunAs
        const scriptPath = join(tempDir, 'elevated.ps1');
        const psScript = `Start-Process powershell -ArgumentList ${psArgs} -Verb RunAs -Wait`;
        await writeFile(scriptPath, psScript, { encoding: 'utf8' });

        const { stderr } = await execAsync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
          {
            timeout: 30000,
          }
        );

        if (stderr && stderr.includes('Access is denied')) {
          throw new Error('ELEVATION_DENIED');
        }
      } else {
        // Non-elevated execution
        const { stderr } = await execAsync(
          `powershell -NoProfile -ExecutionPolicy Bypass ${psArgs}`,
          {
            timeout: 30000,
          }
        );

        if (stderr && stderr.includes('Access is denied')) {
          throw new Error('ELEVATION_DENIED');
        }
      }

      // Read the output file
      try {
        const outputContent = await readFile(outputPath, 'utf8');
        return JSON.parse(outputContent);
      } catch {
        throw new Error('Failed to read firewall helper output');
      }
    } finally {
      // Cleanup temp directory
      try {
        await unlink(inputPath).catch(() => {});
        await unlink(outputPath).catch(() => {});
        await unlink(join(tempDir, 'elevated.ps1')).catch(() => {});
        await unlink(tempDir).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // ========== FIREWALL OPERATIONS ==========

  async firewallAddRule(params: {
    appId: string;
    name: string;
    port: number;
    remoteAddress: string;
  }): Promise<FirewallOperationResult> {
    const selectedInterfaceIp = await this.getSelectedInterfaceIp();
    const remoteSubnet = this.calculateRemoteSubnet(selectedInterfaceIp);

    const result = await this.runFirewallHelper(
      'Add-NestRule',
      {
        AppId: params.appId,
        Port: params.port,
        Protocol: 'TCP',
        RemoteSubnet: remoteSubnet,
        Profile: 'Private',
      },
      true
    );

    return result;
  }

  async firewallRemoveRule(appId: string): Promise<FirewallOperationResult> {
    const result = await this.runFirewallHelper(
      'Remove-NestRule',
      {
        AppId: appId,
      },
      true
    );

    return result;
  }

  async firewallGetRule(appId: string): Promise<{ exists: boolean; rule?: any; error?: string }> {
    const result = await this.runFirewallHelper(
      'Get-NestRule',
      {
        AppId: appId,
      },
      false
    );

    return result;
  }

  async firewallListRules(): Promise<any[]> {
    const result = await this.runFirewallHelper('List-NestRules', {}, false);
    return result.rules || [];
  }

  async firewallGetActiveProfile(): Promise<NetworkProfile> {
    const result = await this.runFirewallHelper('Get-ActiveProfile', {}, false);
    return (result.profile as NetworkProfile) || 'Unknown';
  }

  async firewallReconcileRules(expectedRules: any[]): Promise<FirewallReconcileResult> {
    const result = await this.runFirewallHelper(
      'ReconcileRules',
      {
        ExpectedRulesJson: JSON.stringify(expectedRules),
      },
      false
    );

    return result;
  }

  // Helper methods
  private async getSelectedInterfaceIp(): Promise<string | undefined> {
    return undefined;
  }

  private calculateRemoteSubnet(selectedInterfaceIp?: string): string {
    if (!selectedInterfaceIp) {
      return 'LocalSubnet';
    }
    return 'LocalSubnet';
  }

  private async checkElevation(): Promise<boolean> {
    try {
      await execAsync('net session');
      return true;
    } catch {
      return false;
    }
  }

  private prefixToSubnet(prefix: number): string {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
  }
}
