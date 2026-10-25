/**
 * Port Manager - Port checking and management
 */
import type { PortInfo, ListenerInfo, PortState } from '@shared/types';
import type { Result } from '@shared/types';

export class PortManager {
  private osAdapter: any;
  private eventBus: any;

  constructor(osAdapter: any, eventBus: any) {
    this.osAdapter = osAdapter;
    this.eventBus = eventBus;
  }

  async checkPort(port: number, host?: string): Promise<PortInfo> {
    // Attempt bind test
    const listeners = await this.osAdapter.listTcpListeners();
    const listener = listeners.find((l: ListenerInfo) => l.localPort === port);

    if (!listener) {
      return { port, state: 'free', boundAddress: host || '0.0.0.0' };
    }

    return {
      port,
      state: 'occupied_by_other',
      ownerPid: listener.pid,
      boundAddress: listener.localAddress,
    };
  }

  async suggestPort(preferred?: number, range?: [number, number]): Promise<number> {
    const start = range?.[0] || preferred || 3000;
    const end = range?.[1] || 65535;

    for (let port = start; port <= end; port++) {
      const info = await this.checkPort(port);
      if (info.state === 'free') return port;
    }

    throw new Error('No free port found in range');
  }

  async listListeners(): Promise<ListenerInfo[]> {
    return this.osAdapter.listTcpListeners();
  }
}
