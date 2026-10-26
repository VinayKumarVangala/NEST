/**
 * Diagnostics Service - Health and connectivity diagnostics
 * Implements steps 1-4 from brief §6.9:
 * 1. Process running
 * 2. Port listening
 * 3. Listener address (binding class)
 * 4. Local HTTP check
 */
import type { DiagnosticReport, DiagnosticStep } from '@shared/types';
import type { Result } from '@shared/types';
import { RuntimeStateRepository } from '../../db';

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

    // Step 2: Port listening
    const portInfo = await this.portManager.checkPort(app.port);
    const portListening = portInfo.state !== 'free';
    steps.push({
      id: 'port',
      name: 'Port Listening',
      status: portListening ? 'pass' : 'fail',
      detail: portListening ? `Port ${app.port} is listening` : `Port ${app.port} is not listening`,
      suggestedAction: portListening ? undefined : 'Check if application started correctly',
    });

    // Step 3: Listener address (binding class)
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

    // Step 4: Local HTTP check
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

    // Summary (only for steps 1-4 per brief)
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
