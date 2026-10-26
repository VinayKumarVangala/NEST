/**
 * Windows Adapter - Windows-specific OS operations
 */
import { spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { logAuditEvent } from '../../services/logging';
import * as crypto from 'crypto';
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
    options: { graceful: boolean; rootStartTime?: number }
  ): Promise<{ success: boolean; error?: string; killedPids?: number[] }> {
    try {
      // Verify root ownership if startTime provided
      if (options.rootStartTime !== undefined) {
        const rootInfo = await this.getProcessInfo(pid);
        if (!rootInfo) {
          return { success: false, error: `Root process ${pid} not found` };
        }
        if (rootInfo.startTime !== options.rootStartTime) {
          return {
            success: false,
            error: `Root process ${pid} start time mismatch (expected ${options.rootStartTime}, got ${rootInfo.startTime}) - PID reused`,
          };
        }
      }

      // Get all descendants with ownership verification
      const descendants = await this.getVerifiedDescendants(pid, options.rootStartTime);

      if (descendants.length === 0) {
        // No descendants, just kill root
        const killCmd = options.graceful ? `taskkill /PID ${pid}` : `taskkill /F /PID ${pid}`;
        await execAsync(killCmd);
        return { success: true, killedPids: [pid] };
      }

      // Kill in reverse order (children first, then parents)
      // This prevents orphaned processes that might respawn
      const pidsToKill = [...descendants.map((d) => d.pid), pid].reverse();
      const killedPids: number[] = [];

      for (const killPid of pidsToKill) {
        try {
          // Re-verify ownership at kill time (race condition mitigation)
          if (killPid !== pid) {
            const verified = await this.verifyDescendantOwnership(killPid, pid, options.rootStartTime);
            if (!verified) {
              console.log(`[WindowsAdapter] Skipping ${killPid} - ownership verification failed at kill time`);
              continue;
            }
          }

          const killCmd = options.graceful ? `taskkill /PID ${killPid}` : `taskkill /F /PID ${killPid}`;
          await execAsync(killCmd);
          killedPids.push(killPid);
        } catch (error) {
          // Process may have already exited
          console.log(`[WindowsAdapter] Process ${killPid} already exited or could not be killed`);
        }
      }

      return { success: true, killedPids };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get all verified descendants of a process
   * Walks parent chain from each candidate back to root
   */
  private async getVerifiedDescendants(
    rootPid: number,
    rootStartTime?: number
  ): Promise<Array<{ pid: number; startTime: number; parentPid: number }>> {
    try {
      // Get all processes in system
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, CreationDate, ParentProcessId | ConvertTo-Json"'
      );
      const allProcesses: Win32Process[] = JSON.parse(stdout);
      const procArray = Array.isArray(allProcesses) ? allProcesses : allProcesses ? [allProcesses] : [];

      // Build process map for O(1) lookups
      const processMap = new Map<number, Win32Process>();
      for (const p of procArray) {
        processMap.set(p.ProcessId, p);
      }

      // Find all candidates whose parent chain leads to root
      const verified: Array<{ pid: number; startTime: number; parentPid: number }> = [];

      for (const proc of procArray) {
        if (proc.ProcessId === rootPid) continue;

        // Walk parent chain
        let current = proc;
        let isDescendant = false;
        const chain: number[] = [];

        while (current && current.ParentProcessId !== 0) {
          chain.push(current.ProcessId);

          if (current.ParentProcessId === rootPid) {
            isDescendant = true;
            break;
          }

          const parent = processMap.get(current.ParentProcessId);
          if (!parent) break;
          current = parent;
        }

        if (isDescendant) {
          // Verify the entire chain has consistent start times (no PID reuse in chain)
          let chainValid = true;
          for (const chainPid of chain) {
            const chainProc = processMap.get(chainPid);
            if (!chainProc) {
              chainValid = false;
              break;
            }
          }

          if (chainValid) {
            verified.push({
              pid: proc.ProcessId,
              startTime: new Date(proc.CreationDate).getTime(),
              parentPid: proc.ParentProcessId,
            });
          }
        }
      }

      return verified;
    } catch (error) {
      console.error('[WindowsAdapter] Failed to get verified descendants:', error);
      return [];
    }
  }

  /**
   * Verify a specific PID is still a descendant of root at kill time
   */
  private async verifyDescendantOwnership(
    targetPid: number,
    rootPid: number,
    rootStartTime?: number
  ): Promise<boolean> {
    try {
      // Get target process info
      const targetInfo = await this.getProcessInfo(targetPid);
      if (!targetInfo) return false;

      // Verify root still exists and has correct start time
      if (rootStartTime !== undefined) {
        const rootInfo = await this.getProcessInfo(rootPid);
        if (!rootInfo || rootInfo.startTime !== rootStartTime) {
          return false; // Root was replaced
        }
      }

      // Walk parent chain from target to root
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=${targetPid}\\" | Select-Object ProcessId, ParentProcessId | ConvertTo-Json"`
      );
      let current: Win32Process = JSON.parse(stdout);
      current = Array.isArray(current) ? current[0] : current;

      if (!current) return false;

      while (current && current.ParentProcessId !== 0) {
        if (current.ParentProcessId === rootPid) {
          return true; // Verified descendant
        }

        // Get parent
        const { stdout: parentOut } = await execAsync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=${current.ParentProcessId}\\" | Select-Object ProcessId, ParentProcessId | ConvertTo-Json"`
        );
        const parent = JSON.parse(parentOut);
        current = Array.isArray(parent) ? parent[0] : parent;

        if (!current) break;
      }

      return false;
    } catch {
      return false;
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
   * Expected SHA256 hash of firewall-helper.ps1 for integrity verification.
   * This is injected at build time by forge.config.ts.
   */
  private readonly FIREWALL_HELPER_EXPECTED_HASH = '__FIREWALL_HELPER_HASH__';

  /**
   * Verify the firewall helper script integrity by comparing SHA256 hash.
   * Throws if the hash doesn't match expected value.
   */
  private async verifyFirewallHelperIntegrity(): Promise<void> {
    const helperPath = this.getFirewallHelperPath();
    try {
      const content = await readFile(helperPath, 'utf8');
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      if (actualHash !== this.FIREWALL_HELPER_EXPECTED_HASH) {
        throw new Error(
          `Firewall helper integrity check failed: expected ${this.FIREWALL_HELPER_EXPECTED_HASH}, got ${actualHash}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('integrity check failed')) {
        throw error;
      }
      throw new Error(`Failed to verify firewall helper: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    // Verify firewall helper integrity before execution
    await this.verifyFirewallHelperIntegrity();

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

    // Log audit event
    const success = result.success === true;
    const outcome = success
      ? 'success'
      : result.error?.includes('ELEVATION_DENIED')
        ? 'elevation_denied'
        : result.error?.includes('POLICY_BLOCKED')
          ? 'policy_blocked'
          : result.error?.includes('execution policy')
            ? 'execution_policy_restricted'
            : result.error?.includes('hash mismatch')
              ? 'hash_mismatch'
              : 'failed';

    logAuditEvent(
      'firewall_add',
      outcome as any,
      {
        appId: params.appId,
        appName: params.name,
        port: params.port,
        remoteSubnet,
        ruleName: `NEST-${params.appId}`,
        profile: 'Private',
      },
      result.error,
      true,
      success,
      params.appId,
      params.name
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

    // Log audit event
    const success = result.success === true;
    const outcome = success
      ? 'success'
      : result.error?.includes('ELEVATION_DENIED')
        ? 'elevation_denied'
        : result.error?.includes('POLICY_BLOCKED')
          ? 'policy_blocked'
          : result.error?.includes('execution policy')
            ? 'execution_policy_restricted'
            : 'failed';

    logAuditEvent(
      'firewall_remove',
      outcome as any,
      {
        appId,
        ruleName: `NEST-${appId}`,
      },
      result.error,
      true,
      success,
      appId
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

    // Log audit event
    const success = result.success === true;
    const outcome = success
      ? 'success'
      : result.error?.includes('ELEVATION_DENIED')
        ? 'elevation_denied'
        : result.error?.includes('POLICY_BLOCKED')
          ? 'policy_blocked'
          : result.error?.includes('execution policy')
            ? 'execution_policy_restricted'
            : 'failed';

    logAuditEvent(
      'firewall_reconcile',
      outcome as any,
      {
        expectedRulesCount: expectedRules.length,
        orphanedCount: result.orphaned?.length || 0,
        missingCount: result.missing?.length || 0,
      },
      result.error,
      false,
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
