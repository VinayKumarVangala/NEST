/**
 * Preload script - Exposes typed `window.nest` via contextBridge
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { NestAPI, EventChannelName, RequestChannelName } from '@shared/ipc-contract';

// Type-safe invoke wrapper
const invoke = <T>(channel: RequestChannelName, payload: unknown): Promise<T> => {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
};

// Event subscription helpers
const createEventHandler = <K extends EventChannelName>(channel: K) => {
  return (callback: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  };
};

// Build the NestAPI object
const nestAPI: NestAPI = {
  apps: {
    list: () => invoke('apps.list', undefined),
    get: (id: string) => invoke('apps.get', { id }),
    create: (config) => invoke('apps.create', config),
    update: (id, config) => invoke('apps.update', { id, config }),
    remove: (id, confirmDeleteFiles = false) => invoke('apps.remove', { id, confirmDeleteFiles }),
    start: (id) => invoke('apps.start', { id }),
    stop: (id, force = false) => invoke('apps.stop', { id, force }),
    restart: (id) => invoke('apps.restart', { id }),
    registerExternal: (params) => invoke('apps.registerExternal', params),
    lintLaunchConfig: (config) => invoke('apps.lintLaunchConfig', { config }),
    dummy: (message: string) => invoke('test.dummy', { message }),
    pickFolder: () => invoke('apps.pickFolder', undefined),
  },
  ports: {
    check: (port, host) => invoke('ports.check', { port, host }),
    suggest: (preferred, range) => invoke('ports.suggest', { preferred, range }),
    listListeners: () => invoke('ports.listListeners', undefined),
  },
  network: {
    listInterfaces: () => invoke('network.listInterfaces', undefined),
    selectInterface: (interfaceName) => invoke('network.selectInterface', { interfaceName }),
  },
  access: {
    getStatus: (appId) => invoke('access.getStatus', { appId }),
    enable: (appId, confirmation) => invoke('access.enable', { appId, confirmation }),
    disable: (appId, restartWithLocalProfile = false) =>
      invoke('access.disable', { appId, restartWithLocalProfile }),
    workflow: {
      start: (appId) => invoke('access.workflow.start', { appId }),
      step: (appId, step, payload) => invoke('access.workflow.step', { appId, step, payload }),
      status: (appId) => invoke('access.workflow.status', { appId }),
    },
  },
  health: {
    checkNow: (appId) => invoke('health.checkNow', { appId }),
  },
  diagnostics: {
    run: (appId) => invoke('diagnostics.run', { appId }),
  },
  logs: {
    query: (params) => invoke('logs.query', params),
  },
  settings: {
    get: () => invoke('settings.get', undefined),
    update: (params) => invoke('settings.update', params),
  },
  system: {
    info: () => invoke('system.info', undefined),
  },
  on: <K extends EventChannelName>(channel: K, callback: (payload: unknown) => void) => {
    return createEventHandler(channel)(callback);
  },
  off: <K extends EventChannelName>(channel: K, callback: (payload: unknown) => void) => {
    ipcRenderer.off(channel, callback);
  },
};

// Expose the API
contextBridge.exposeInMainWorld('nest', nestAPI);

// Type declaration for renderer
declare global {
  interface Window {
    nest: NestAPI;
  }
}
