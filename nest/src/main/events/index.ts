/**
 * Typed Event Bus (main -> renderer push)
 */
import { EventEmitter } from 'node:events';
import type { EventChannelName } from '@shared/ipc-contract';
import { EventChannels } from '@shared/ipc-contract';

type EventMap = {
  [K in EventChannelName]: z.infer<(typeof EventChannels)[K]>;
};

import { z } from 'zod';

class TypedEventBus extends EventEmitter {
  private mainWindow: Electron.BrowserWindow | null = null;

  setMainWindow(window: Electron.BrowserWindow): void {
    this.mainWindow = window;
  }

  /** Emit event to all renderer windows */
  emit<K extends EventChannelName>(channel: K, payload: EventMap[K]): boolean {
    const result = super.emit(channel, payload);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
    return result;
  }

  /** Subscribe to events (for main process listeners) */
  on<K extends EventChannelName>(channel: K, listener: (payload: EventMap[K]) => void): this {
    return super.on(channel, listener);
  }

  off<K extends EventChannelName>(channel: K, listener: (payload: EventMap[K]) => void): this {
    return super.off(channel, listener);
  }
}

export const eventBus = new TypedEventBus();

export function setupEventBus(): TypedEventBus {
  eventBus.setMaxListeners(100);
  return eventBus;
}
