/**
 * Diagnostics Service - Complete 9-step connectivity diagnostics per brief §6.9
 * 1. Is the application process running?
 * 2. Is the configured port listening?
 * 3. Does the listener use the expected address?
 * 4. Can the host computer reach the application locally?
 * 5. Is the selected LAN IP current?
 * 6. Is a suitable firewall rule present?
 * 7. Is the application configured for the intended protocol and path?
 * 8. Can a remote device reach the endpoint, if a remote test is available?
 * 9. Is the failure caused by network isolation or another external condition?
 */
import type { DiagnosticReport, DiagnosticStep } from '@shared/types';
import type { Result } from '@shared/types';
import { RuntimeStateRepository } from '../../db';
import { AccessPolicyRepository } from '../../db';

export class DiagnosticsService {
  private osAdapter: any;
  private applicationManager: any;
  private portManager: any;
  private healthMonitor: any;
  private networkManager: any;
  private securityPolicyManager: any;

  constructor(
    osAdapter: any,
    applicationManager: any,
    portManager: any,
    healthMonitor: any,
    networkManager: any,
    securityPolicyManager: any
  ) {
    this.osAdapter = osAdapter;
    this.applicationManager = applicationManager;
    this.portManager = portManager;
    this.healthMonitor = healthMonitor;
    this.networkManager = networkManager;
    this.securityPolicyManager = securityPolicyManager;
  }

  async runDiagnostics(appId: string): Promise<DiagnosticReport> {
    const app = await this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    const steps: DiagnosticStep[] = [];

    // ========== STEP 1: Process Running ==========
    const runtimeState = RuntimeStateRepository.get(appId);
    const processAlive = await this.checkProcessRunning(appId, runtimeState);
    steps.push({
      id: 'process',
      name: 'Process Running',
      status: processAlive ? 'pass' : 'fail',
      detail: processAlive
        ? `Process running (PID: ${runtimeState?.pid})`
        : `Process state: ${runtimeState?.processState || 'unknown'}`,
      suggestedAction: processAlive ? undefined : 'Start the application',
    });

    // ========== STEP 2: Port Listening ==========
    const portInfo = await this.portManager.checkPort(app.port);
    const portListening = portInfo.state !== 'free';
    steps.push({
      id: 'port',
      name: 'Port Listening',
      status: portListening ? 'pass' : 'fail',
      detail: portListening ? `Port ${app.port} is listening` : `Port ${app.port} is not listening`,
      suggestedAction: portListening ? undefined : 'Check if application started correctly',
    });

    // ========== STEP 3: Listener Address (Binding Class) ==========
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: any) => l.localPort === app.port && l.protocol === 'TCP');
    let bindingClass: string = 'not_listening';
    let listenerAddress: string = 'N/A';
    if (listener) {
      listenerAddress = listener.localAddress;
      if (listener.localAddress === '127.0.0.1' || listener.localAddress === '::1') {
        bindingClass = 'loopback_only';
      } else if (listener.localAddress === '0.0.0.0' || listener.localAddress === '::') {
        bindingClass = 'all_interfaces';
      } else {
        bindingClass = 'specific_lan';
      }
    }
    steps.push({
      id: 'binding',
      name: 'Listener Binding',
      status:
        bindingClass === 'loopback_only'
          ? 'fail'
          : bindingClass === 'not_listening'
            ? 'fail'
            : 'pass',
      detail: `Binding: ${bindingClass.replace('_', ' ')} (${listenerAddress})`,
      suggestedAction:
        bindingClass === 'loopback_only'
          ? 'Configure app to listen on 0.0.0.0 or specific LAN IP'
          : bindingClass === 'not_listening'
            ? 'Start the application'
            : undefined,
    });

    // ========== STEP 4: Local HTTP Response ==========
    let localHttpResult = {
      localResponding: false,
      latencyMs: undefined as number | undefined,
      error: undefined as string | undefined,
    };
    if (app.healthCheck.type === 'http' || app.healthCheck.type === 'https') {
      try {
        const health = await this.healthMonitor.checkNow(appId);
        localHttpResult = {
          localResponding: health.localResponding,
          latencyMs: health.latencyMs,
          error: health.localResponding ? undefined : 'HTTP check failed',
        };
      } catch (err) {
        localHttpResult = {
          localResponding: false,
          latencyMs: undefined,
          error: err instanceof Error ? err.message : 'HTTP check failed',
        };
      }
    }
    const httpConfigured = app.healthCheck.type === 'http' || app.healthCheck.type === 'https';
    steps.push({
      id: 'local_http',
      name: 'Local HTTP Response',
      status: httpConfigured ? (localHttpResult.localResponding ? 'pass' : 'fail') : 'skipped',
      detail: httpConfigured
        ? localHttpResult.localResponding
          ? `HTTP check passed (${localHttpResult.latencyMs}ms)`
          : `HTTP check failed${localHttpResult.error ? `: ${localHttpResult.error}` : ''}`
        : 'No HTTP health check configured',
      suggestedAction:
        httpConfigured && !localHttpResult.localResponding
          ? 'Check application logs for errors; verify health check path and expected status'
          : undefined,
    });

    // ========== STEP 5: Selected LAN IP Currency ==========
    const selectedInterface = this.networkManager.getSelectedInterface();
    const interfaces = await this.networkManager.listInterfaces();
    const selected = interfaces.find((i: any) => i.name === selectedInterface);
    const policy = AccessPolicyRepository.get(appId);
    const lanIpCurrent = selected && policy?.selectedInterface === selectedInterface;
    const currentIp = selected?.ipv4 || 'N/A';
    const policyIp = policy?.selectedInterface
      ? interfaces.find((i: any) => i.name === policy.selectedInterface)?.ipv4 || 'N/A'
      : 'N/A';
    const ipMismatch = selected && policy?.selectedInterface && selectedInterface !== policy.selectedInterface;
    steps.push({
      id: 'lan_ip',
      name: 'Selected LAN IP',
      status: lanIpCurrent ? 'pass' : (ipMismatch ? 'fail' : 'skipped'),
      detail: selected
        ? `Current: ${currentIp} | Policy: ${policyIp}${ipMismatch ? ' (MISMATCH)' : ''}`
        : 'No network interface selected',
      suggestedAction:
        ipMismatch
          ? 'Network interface changed; re-run LAN access workflow to update firewall rules and URLs'
          : selected
            ? undefined
            : 'Select a network interface in Network settings',
    });

    // ========== STEP 6: Firewall Rule Presence/Scope/Profile ==========
    let firewallRulePresent = false;
    let firewallRuleCorrect = false;
    let firewallProfile = 'N/A';
    let firewallRemoteAddress = 'N/A';
    if (policy?.firewallRuleRef) {
      const fwRule = await this.osAdapter.firewallGetRule(appId);
      firewallRulePresent = fwRule.exists;
      if (fwRule.rule) {
        firewallProfile = fwRule.rule.profile || 'N/A';
        firewallRemoteAddress = fwRule.rule.remoteAddress || 'N/A';
        // Verify rule scope: Private profile, LocalSubnet, correct port
        firewallRuleCorrect =
          fwRule.rule.profile === 'Private' &&
          fwRule.rule.remoteAddress === 'LocalSubnet' &&
          fwRule.rule.localPort === app.port &&
          fwRule.rule.enabled;
      }
    }
    const firewallRelevant = policy?.mode === 'lan_enabled' || policy?.mode === 'lan_requested';
    steps.push({
      id: 'firewall',
      name: 'Firewall Rule',
      status: firewallRelevant
        ? firewallRulePresent && firewallRuleCorrect
          ? 'pass'
          : firewallRulePresent
            ? 'fail'
            : 'fail'
        : 'skipped',
      detail: firewallRelevant
        ? firewallRulePresent
          ? firewallRuleCorrect
            ? `Rule present: ${policy.firewallRuleRef} (Private, LocalSubnet, port ${app.port})`
            : `Rule present but misconfigured: ${policy.firewallRuleRef} (Profile: ${firewallProfile}, Remote: ${firewallRemoteAddress})`
          : `No firewall rule found for ${policy?.firewallRuleRef || 'app'}`
        : 'LAN access not enabled; firewall rule not required',
      suggestedAction: firewallRelevant && (!firewallRulePresent || !firewallRuleCorrect)
        ? 'Re-run LAN access workflow to create/correct firewall rule; ensure Private network profile'
        : undefined,
    });

    // ========== STEP 7: Protocol/Path Sanity ==========
    const protocolMatch = app.protocol === 'http' || app.protocol === 'https';
    const healthCheckConfigured = app.healthCheck.type !== 'none';
    const pathConfigured = app.healthCheck.path && app.healthCheck.path.length > 0;
    const protocolPathOk = protocolMatch && (app.healthCheck.type === 'tcp' || (healthCheckConfigured && pathConfigured));
    steps.push({
      id: 'protocol_path',
      name: 'Protocol & Path',
      status: protocolPathOk ? 'pass' : 'fail',
      detail: `Protocol: ${app.protocol} | Health check: ${app.healthCheck.type}${app.healthCheck.path ? ` (path: ${app.healthCheck.path})` : ''}`,
      suggestedAction:
        !protocolMatch
          ? 'Protocol must be http or https'
          : !healthCheckConfigured
            ? 'Configure health check (TCP or HTTP) for connectivity verification'
            : !pathConfigured && (app.healthCheck.type === 'http' || app.healthCheck.type === 'https')
              ? 'HTTP health check requires a path'
              : undefined,
    });

    // ========== STEP 8: Remote Device Check ==========
    // This is a manual/optional step - we can only offer the test, not perform it automatically
    const remoteTestAvailable = policy?.mode === 'lan_enabled' && firewallRulePresent && firewallRuleCorrect && localHttpResult.localResponding;
    const remoteVerification = policy?.lastVerification || 'unverified';
    steps.push({
      id: 'remote_check',
      name: 'Remote Device Reachability',
      status: remoteTestAvailable
        ? remoteVerification === 'remote_user_confirmed'
          ? 'pass'
          : 'not_performed'
        : 'not_performed',
      detail:
        remoteVerification === 'remote_user_confirmed'
          ? 'Confirmed by remote device'
          : remoteTestAvailable
            ? 'Manual test required: use QR code or copy LAN URL to test from second device'
            : 'LAN access not fully configured; cannot test remote reachability',
      suggestedAction:
        remoteTestAvailable && remoteVerification !== 'remote_user_confirmed'
          ? 'Test from a second device on the same network using the LAN URL or QR code'
          : remoteTestAvailable
            ? undefined
            : 'Complete LAN access configuration first',
    });

    // ========== STEP 9: External Causes Guidance ==========
    // Provide guidance on possible external causes, never as a verdict
    const externalCauses: string[] = [];
    if (!lanIpCurrent && selected) {
      externalCauses.push('Network interface IP changed since LAN access was configured');
    }
    if (firewallRelevant && (!firewallRulePresent || !firewallRuleCorrect)) {
      externalCauses.push('Firewall rule missing or misconfigured');
    }
    if (bindingClass === 'loopback_only') {
      externalCauses.push('Application binds only to loopback (127.0.0.1); cannot reach via LAN IP');
    }
    // Check network profile
    if (selected && selected.networkProfile !== 'Private') {
      externalCauses.push(`Network profile is ${selected.networkProfile}; LAN access requires Private profile`);
    }
    // Common external causes to mention
    const guidance = [
      'Client isolation (AP isolation) on Wi-Fi may block device-to-device communication',
      'VPN or virtual adapters may alter routing; test with VPN disabled',
      'Third-party firewall/antivirus may block inbound connections',
      'Router guest network isolation prevents LAN access',
      'Windows "Network discovery" must be enabled for Private profile',
    ];

    const allExternalCauses = [...externalCauses, ...guidance];
    steps.push({
      id: 'external_causes',
      name: 'Possible External Causes',
      status: allExternalCauses.length > 0 ? 'fail' : 'pass',
      detail: allExternalCauses.length > 0
        ? allExternalCauses.map((c, i) => `${i + 1}. ${c}`).join('\n')
        : 'No obvious external blockers detected',
      suggestedAction: allExternalCauses.length > 0 ? 'Review items above; they are guidance, not verdicts' : undefined,
    });

    // Summary
    const summary = {
      passed: steps.filter((s) => s.status === 'pass').length,
      failed: steps.filter((s) => s.status === 'fail').length,
      skipped: steps.filter((s) => s.status === 'skipped').length,
      notPerformed: steps.filter((s) => s.status === 'not_performed').length,
    };

    return {
      appId,
      timestamp: Date.now(),
      steps,
      summary,
    };
  }

  private async checkProcessRunning(appId: string, runtimeState: any): Promise<boolean> {
    if (!runtimeState || !runtimeState.pid) {
      return false;
    }
    try {
      const processInfo = await this.osAdapter.getProcessInfo(runtimeState.pid);
      return processInfo !== null && processInfo.startTime === runtimeState.processStartTime;
    } catch {
      return false;
    }
  }
}