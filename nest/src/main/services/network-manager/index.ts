/**
 * Network Manager - Interface discovery and selection
 */
import type { NetworkInterfaceInfo, NetworkProfile } from '@shared/types';
import type { Result } from '@shared/types';
import { eventBus, setupEventBus } from '../../events';

export class NetworkManager {
  private osAdapter: any;
  private eventBus: ReturnType<typeof setupEventBus>;
  private selectedInterface: string | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(osAdapter: any, eventBus: ReturnType<typeof setupEventBus>) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
  }

  async listInterfaces(): Promise<NetworkInterfaceInfo[]> {
    return this.osAdapter.getNetworkInterfaces();
  }

  async selectInterface(interfaceName: string): Promise<NetworkInterfaceInfo> {
    const interfaces = await this.listInterfaces();
    const selected = interfaces.find((i) => i.name === interfaceName);
    if (!selected) throw new Error(`Interface not found: ${interfaceName}`);

    this.selectedInterface = interfaceName;
    this.eventBus.emit('network.changed', {
      interfaces,
      selectedInterface: interfaceName,
      timestamp: Date.now(),
    });

    return selected;
  }

  getSelectedInterface(): string | undefined {
    return this.selectedInterface || undefined;
  }

  buildUrl(app: any, address: string): string {
    return `${app.protocol}://${address}:${app.port}`;
  }

  start(): void {
    this.pollInterval = setInterval(async () => {
      try {
        const interfaces = await this.listInterfaces();
        this.eventBus.emit('network.changed', {
          interfaces,
          selectedInterface: this.selectedInterface || undefined,
          timestamp: Date.now(),
        });
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
}
