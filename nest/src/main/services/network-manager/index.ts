/**
 * Network Manager - Interface discovery and selection
 */
import type { NetworkInterfaceInfo, NetworkProfile, ApplicationConfig } from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus, setupEventBus } from '../../events';
import { loadSettings, saveSettings } from '../../db';

interface NetworkState {
  interfaces: NetworkInterfaceInfo[];
  selectedInterface: string | null;
  timestamp: number;
}

export class NetworkManager {
  private osAdapter: any;
  private eventBus: ReturnType<typeof setupEventBus>;
  private selectedInterface: string | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private previousState: NetworkState | null = null;

  constructor(osAdapter: any, eventBus: ReturnType<typeof setupEventBus>) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
    this.loadPreferredInterface();
  }

  private loadPreferredInterface(): void {
    try {
      const settings = loadSettings();
      if (settings.preferredInterface) {
        this.selectedInterface = settings.preferredInterface;
      }
    } catch (error) {
      console.error('[NetworkManager] Failed to load preferred interface:', error);
    }
  }

  async listInterfaces(): Promise<NetworkInterfaceInfo[]> {
    return this.osAdapter.getNetworkInterfaces();
  }

  async selectInterface(interfaceName: string): Promise<NetworkInterfaceInfo> {
    const interfaces = await this.listInterfaces();
    const selected = interfaces.find((i: NetworkInterfaceInfo) => i.name === interfaceName);
    if (!selected) throw new Error(`Interface not found: ${interfaceName}`);

    const previousInterface = this.selectedInterface;
    this.selectedInterface = interfaceName;

    // Persist to settings
    this.savePreferredInterface(interfaceName);

    // Emit change event with full state
    const currentInterfaces = await this.listInterfaces();
    this.emitNetworkChanged(currentInterfaces, interfaceName);

    // If interface changed, check for IP changes and warn
    if (previousInterface && previousInterface !== interfaceName) {
      this.checkAndEmitStaleUrlWarning(interfaceName);
    }

    return selected;
  }

  getSelectedInterface(): string | undefined {
    return this.selectedInterface || undefined;
  }

  buildUrl(app: any, address: string): string {
    return `${app.protocol}://${address}:${app.port}`;
  }

  private savePreferredInterface(interfaceName: string): void {
    try {
      saveSettings({ preferredInterface: interfaceName });
    } catch (error) {
      console.error('[NetworkManager] Failed to save preferred interface:', error);
    }
  }

  private emitNetworkChanged(
    interfaces: NetworkInterfaceInfo[],
    selectedInterface: string | null
  ): void {
    const currentState: NetworkState = {
      interfaces,
      selectedInterface,
      timestamp: Date.now(),
    };

    // Compute diff if we have previous state
    let diff: Record<string, any> = {};
    if (this.previousState) {
      const prevInterfaces = this.previousState.interfaces;
      const currInterfaces = interfaces;

      // Check for IP changes on selected interface
      const prevSelected = prevInterfaces.find(
        (i) => i.name === this.previousState!.selectedInterface
      );
      const currSelected = currInterfaces.find((i) => i.name === selectedInterface);

      if (prevSelected && currSelected && prevSelected.ipv4 !== currSelected.ipv4) {
        diff = {
          ...diff,
          ipChanged: true,
          previousIp: prevSelected.ipv4,
          currentIp: currSelected.ipv4,
        };
      }

      // Check for interface up/down changes
      const added = currInterfaces.filter(
        (c: NetworkInterfaceInfo) =>
          !prevInterfaces.find((p: NetworkInterfaceInfo) => p.name === c.name)
      );
      const removed = prevInterfaces.filter(
        (p: NetworkInterfaceInfo) =>
          !currInterfaces.find((c: NetworkInterfaceInfo) => c.name === p.name)
      );
      const changed = currInterfaces.filter((c: NetworkInterfaceInfo) => {
        const prev = prevInterfaces.find((p: NetworkInterfaceInfo) => p.name === c.name);
        return (
          prev &&
          (prev.ipv4 !== c.ipv4 || prev.isUp !== c.isUp || prev.networkProfile !== c.networkProfile)
        );
      });

      if (added.length || removed.length || changed.length) {
        diff = { ...diff, interfacesChanged: true, added, removed, changed };
      }
    }

    this.previousState = currentState;

    this.eventBus.emit('network.changed', {
      interfaces,
      selectedInterface: selectedInterface || undefined,
      timestamp: Date.now(),
    });
  }

  private checkAndEmitStaleUrlWarning(newInterfaceName: string): void {
    // This will be handled by the SecurityPolicyManager when it receives the network.changed event
    // The SecurityPolicyManager will check if any app's LAN URL is stale and emit a warning
  }

  start(): void {
    this.pollInterval = setInterval(async () => {
      try {
        const interfaces = await this.listInterfaces();
        this.emitNetworkChanged(interfaces, this.selectedInterface);
      } catch (error) {
        console.error('[NetworkManager] Poll error:', error);
      }
    }, 5000);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Reconcile network state after system resume
   * Triggers a full network state recomputation and emits change events
   */
  async reconcile(): Promise<void> {
    const interfaces = await this.listInterfaces();
    this.emitNetworkChanged(interfaces, this.selectedInterface);
  }

  // Get the currently selected interface info
  async getSelectedInterfaceInfo(): Promise<NetworkInterfaceInfo | null> {
    if (!this.selectedInterface) return null;
    const interfaces = await this.osAdapter.getNetworkInterfaces();
    return interfaces.find((i: NetworkInterfaceInfo) => i.name === this.selectedInterface) || null;
  }
}
