/**
 * Security Policy Manager - LAN access control
 */
import type { AccessPolicy, LanVerification } from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus, setupEventBus } from '../../events';
import { AccessPolicyRepository } from '../../db';

export class SecurityPolicyManager {
  private osAdapter: any;
  private eventBus: ReturnType<typeof setupEventBus>;
  private networkManager: any;
  private applicationManager: any;

  constructor(
    osAdapter: any,
    eventBus: ReturnType<typeof setupEventBus>,
    networkManager: any,
    applicationManager: any
  ) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.networkManager = networkManager;
    this.applicationManager = applicationManager;
  }

  async getAccessStatus(appId: string): Promise<any> {
    const app = await this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    const policy = AccessPolicyRepository.get(appId) || {
      appId,
      mode: 'local_only' as const,
      updatedAt: Date.now(),
    };

    // Determine binding class
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: any) => l.localPort === app.port);
    let bindingClass: 'loopback_only' | 'all_interfaces' | 'specific_lan' | 'not_listening' =
      'not_listening';

    if (listener) {
      if (listener.localAddress === '127.0.0.1' || listener.localAddress === '::1') {
        bindingClass = 'loopback_only';
      } else if (listener.localAddress === '0.0.0.0' || listener.localAddress === '::') {
        bindingClass = 'all_interfaces';
      } else {
        bindingClass = 'specific_lan';
      }
    }

    let lanUrl: string | undefined;
    if (
      bindingClass !== 'loopback_only' &&
      bindingClass !== 'not_listening' &&
      this.networkManager.getSelectedInterface()
    ) {
      const interfaces = await this.networkManager.listInterfaces();
      const selected = interfaces.find(
        (i: any) => i.name === this.networkManager.getSelectedInterface()
      );
      if (selected) {
        lanUrl = this.networkManager.buildUrl(app, selected.ipv4);
      }
    }

    return {
      policy,
      bindingClass,
      lanUrl,
      changePlan:
        policy.mode === 'local_only'
          ? {
              needsRestart: bindingClass === 'loopback_only',
              needsElevation: true,
              firewallRule: {
                name: `NEST-${app.name}-${app.port}`,
                port: app.port,
                remoteAddress: 'LocalSubnet',
                profile: 'Private',
              },
              warnings:
                bindingClass === 'loopback_only'
                  ? ['App is listening on loopback only. Firewall changes cannot fix this.']
                  : [],
            }
          : undefined,
    };
  }

  async enableAccess(appId: string, confirmation: string): Promise<any> {
    const app = await this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    // Verify confirmation
    if (confirmation !== 'I understand the risks') {
      throw new Error('Confirmation required');
    }

    const status = await this.getAccessStatus(appId);
    if (status.bindingClass === 'loopback_only') {
      throw new Error('LOOPBACK_ONLY');
    }

    // Restart with LAN profile if needed
    if (status.changePlan?.needsRestart && app.lanLaunchProfile) {
      // This would restart the app with LAN profile
      // For now, just update policy
    }

    // Add firewall rule (Phase 3)
    // await this.osAdapter.firewall?.addRule(...)

    const policy: AccessPolicy = {
      appId,
      mode: 'lan_enabled',
      selectedInterface: this.networkManager.getSelectedInterface() || undefined,
      firewallRuleRef: `NEST-${app.id}`,
      lastVerification: 'local_ok',
      lastVerificationAt: Date.now(),
      updatedAt: Date.now(),
    };
    AccessPolicyRepository.upsert(policy);

    this.eventBus.emit('firewall.changed', {
      appId,
      action: 'added',
      ruleName: policy.firewallRuleRef,
      timestamp: Date.now(),
    });

    return {
      policy,
      lanUrl: status.lanUrl,
      verification: 'local_ok' as LanVerification,
    };
  }

  async disableAccess(appId: string, restartWithLocalProfile: boolean): Promise<AccessPolicy> {
    const app = await this.applicationManager.getApplication(appId);
    if (!app) throw new Error('Application not found');

    const policy = AccessPolicyRepository.get(appId);
    if (policy?.firewallRuleRef) {
      // Remove firewall rule (Phase 3)
      // await this.osAdapter.firewall?.removeRule(appId)

      this.eventBus.emit('firewall.changed', {
        appId,
        action: 'removed',
        ruleName: policy.firewallRuleRef,
        timestamp: Date.now(),
      });
    }

    const updatedPolicy: AccessPolicy = {
      appId,
      mode: 'lan_disabled',
      updatedAt: Date.now(),
    };
    AccessPolicyRepository.upsert(updatedPolicy);

    return updatedPolicy;
  }
}
