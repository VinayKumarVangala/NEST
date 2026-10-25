/**
 * Diagnostics Service - Health and connectivity diagnostics
 */
import type { DiagnosticReport, DiagnosticStep } from '@shared/types';
import type { Result } from '@shared/types';

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

    // Step 1: Process running
    const state = await this.getRuntimeState(appId);
    steps.push({
      id: 'process',
      name: 'Process Running',
      status: state?.processState === 'running' ? 'pass' : 'fail',
      detail:
        state?.processState === 'running'
          ? `Process running (PID: ${state.pid})`
          : `Process state: ${state?.processState || 'unknown'}`,
      suggestedAction: state?.processState !== 'running' ? 'Start the application' : undefined,
    });

    // Step 2: Port listening
    const portInfo = await this.portManager.checkPort(app.port);
    steps.push({
      id: 'port',
      name: 'Port Listening',
      status: portInfo.state !== 'free' ? 'pass' : 'fail',
      detail:
        portInfo.state !== 'free'
          ? `Port ${app.port} is listening`
          : `Port ${app.port} is not listening`,
      suggestedAction:
        portInfo.state === 'free' ? 'Check if application started correctly' : undefined,
    });

    // Step 3: Listener address
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: any) => l.localPort === app.port);
    let bindingClass: string = 'not_listening';
    if (listener) {
      if (listener.localAddress === '127.0.0.1' || listener.localAddress === '::1')
        bindingClass = 'loopback_only';
      else if (listener.localAddress === '0.0.0.0' || listener.localAddress === '::')
        bindingClass = 'all_interfaces';
      else bindingClass = 'specific_lan';
    }
    steps.push({
      id: 'binding',
      name: 'Listener Binding',
      status: bindingClass !== 'loopback_only' ? 'pass' : 'fail',
      detail: `Binding: ${bindingClass.replace('_', ' ')} (${listener?.localAddress || 'N/A'})`,
      suggestedAction:
        bindingClass === 'loopback_only'
          ? 'Configure app to listen on 0.0.0.0 or specific LAN IP'
          : undefined,
    });

    // Step 4: Local HTTP check
    if (app.healthCheck.type === 'http') {
      const health = await this.healthMonitor.checkNow(appId);
      steps.push({
        id: 'local_http',
        name: 'Local HTTP Response',
        status: health.localResponding ? 'pass' : 'fail',
        detail: health.localResponding
          ? `HTTP check passed (${health.latencyMs}ms)`
          : 'HTTP check failed',
        suggestedAction: !health.localResponding ? 'Check application logs for errors' : undefined,
      });
    } else {
      steps.push({
        id: 'local_http',
        name: 'Local HTTP Response',
        status: 'skipped',
        detail: 'No HTTP health check configured',
      });
    }

    // Step 5: Network interface
    const selectedInterface = this.networkManager.getSelectedInterface();
    if (selectedInterface) {
      const interfaces = await this.networkManager.listInterfaces();
      const iface = interfaces.find((i: any) => i.name === selectedInterface);
      steps.push({
        id: 'interface',
        name: 'Network Interface',
        status: iface ? 'pass' : 'fail',
        detail: iface
          ? `${iface.name} (${iface.ipv4}/${iface.prefixLength}) - ${iface.networkProfile}`
          : 'Selected interface not found',
        suggestedAction: !iface ? 'Re-select network interface' : undefined,
      });
    } else {
      steps.push({
        id: 'interface',
        name: 'Network Interface',
        status: 'not_performed',
        detail: 'No interface selected for LAN access',
      });
    }

    // Step 6: Firewall rule
    const policy = await this.securityPolicyManager.getAccessStatus(appId);
    steps.push({
      id: 'firewall',
      name: 'Firewall Rule',
      status: policy.policy.mode === 'lan_enabled' ? 'pass' : 'not_performed',
      detail:
        policy.policy.mode === 'lan_enabled' ? 'Firewall rule active' : 'LAN access not enabled',
      suggestedAction: policy.policy.mode !== 'lan_enabled' ? 'Enable LAN access' : undefined,
    });

    // Step 7: Local verification
    steps.push({
      id: 'local_verification',
      name: 'Local LAN Verification',
      status: policy.policy.lastVerification === 'local_ok' ? 'pass' : 'not_performed',
      detail:
        policy.policy.lastVerification === 'local_ok'
          ? 'Local LAN reachability confirmed'
          : 'Not verified',
      suggestedAction:
        policy.policy.lastVerification !== 'local_ok' ? 'Run verification' : undefined,
    });

    // Step 8: Remote verification
    steps.push({
      id: 'remote_verification',
      name: 'Remote Verification',
      status: policy.policy.lastVerification === 'remote_user_confirmed' ? 'pass' : 'not_performed',
      detail:
        policy.policy.lastVerification === 'remote_user_confirmed'
          ? 'Confirmed by remote user'
          : 'Not confirmed (requires manual test from another device)',
    });

    // Step 9: External factors
    steps.push({
      id: 'external',
      name: 'External Factors',
      status: 'not_performed',
      detail:
        'Client isolation, VPN, other firewalls, router guest networks may affect connectivity',
      suggestedAction: 'Verify from another device on the same network',
    });

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

  private async getRuntimeState(appId: string): Promise<any> {
    // This would use RuntimeStateRepository
    return null;
  }
}
