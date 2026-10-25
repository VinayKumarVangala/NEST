/**
 * IPC Client - Typed client for renderer to communicate with main process
 */
import type {
  NestAPI,
  Result,
  ApplicationConfig,
  RuntimeState,
  PortInfo,
  NetworkInterfaceInfo,
  AccessPolicy,
  HealthCheckResult,
  DiagnosticReport,
  ActivityLogEntry,
  SystemInfo,
  ListenerInfo,
  LaunchConfigWarning,
} from '@shared/ipc-contract';

// Type-safe wrapper around window.nest
const api = window.nest as NestAPI;

export const nest = {
  apps: {
    list: () => api.apps.list() as Promise<Result<ApplicationConfig[]>>,
    get: (id: string) => api.apps.get(id) as Promise<Result<ApplicationConfig>>,
    create: (config: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>) =>
      api.apps.create(config) as Promise<Result<ApplicationConfig>>,
    update: (id: string, config: Partial<ApplicationConfig>) =>
      api.apps.update(id, config) as Promise<Result<ApplicationConfig>>,
    remove: (id: string, confirmDeleteFiles?: boolean) =>
      api.apps.remove(id, confirmDeleteFiles) as Promise<Result<void>>,
    start: (id: string) => api.apps.start(id) as Promise<Result<RuntimeState>>,
    stop: (id: string, force?: boolean) =>
      api.apps.stop(id, force) as Promise<Result<RuntimeState>>,
    restart: (id: string) => api.apps.restart(id) as Promise<Result<RuntimeState>>,
    registerExternal: (params: {
      name: string;
      port: number;
      protocol?: 'http' | 'https';
      healthCheck?: {
        type: 'tcp' | 'http' | 'none';
        path?: string;
        expectedStatus?: number;
        intervalMs?: number;
        timeoutMs?: number;
        failureThreshold?: number;
      };
      selectedInterface?: string;
    }) => api.apps.registerExternal(params) as Promise<Result<ApplicationConfig>>,
    lintLaunchConfig: (config: ApplicationConfig) =>
      api.apps.lintLaunchConfig(config) as Promise<Result<LaunchConfigWarning[]>>,
  },

  ports: {
    check: (port: number, host?: string) =>
      api.ports.check(port, host) as Promise<Result<PortInfo>>,
    suggest: (preferred?: number, range?: [number, number]) =>
      api.ports.suggest(preferred, range) as Promise<Result<number>>,
    listListeners: () => api.ports.listListeners() as Promise<Result<ListenerInfo[]>>,
  },

  network: {
    listInterfaces: () => api.network.listInterfaces() as Promise<Result<NetworkInterfaceInfo[]>>,
    selectInterface: (interfaceName: string) =>
      api.network.selectInterface(interfaceName) as Promise<
        Result<{ selected: NetworkInterfaceInfo }>
      >,
  },

  access: {
    getStatus: (appId: string) => api.access.getStatus(appId) as Promise<Result<any>>,
    enable: (appId: string, confirmation: string) =>
      api.access.enable(appId, confirmation) as Promise<Result<any>>,
    disable: (appId: string, restartWithLocalProfile?: boolean) =>
      api.access.disable(appId, restartWithLocalProfile) as Promise<Result<AccessPolicy>>,
  },

  health: {
    checkNow: (appId: string) => api.health.checkNow(appId) as Promise<Result<HealthCheckResult>>,
  },

  diagnostics: {
    run: (appId: string) => api.diagnostics.run(appId) as Promise<Result<DiagnosticReport>>,
  },

  logs: {
    query: (params: {
      appId?: string;
      eventType?: string[];
      severity?: string[];
      from?: number;
      to?: number;
      text?: string;
      limit?: number;
      offset?: number;
    }) => api.logs.query(params) as Promise<Result<{ entries: ActivityLogEntry[]; total: number }>>,
  },

  settings: {
    get: () => api.settings.get() as Promise<Result<any>>,
    update: (params: any) => api.settings.update(params) as Promise<Result<void>>,
  },

  system: {
    info: () => api.system.info() as Promise<Result<SystemInfo>>,
  },

  on: <K extends keyof NestAPI['on']>(channel: K, callback: any) => api.on(channel, callback),
  off: <K extends keyof NestAPI['off']>(channel: K, callback: any) => api.off(channel, callback),
};

// React hooks for IPC
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => nest.apps.list(),
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['apps', id],
    queryFn: () => nest.apps.get(id),
    enabled: !!id,
  });
}

export function useStartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => nest.apps.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => nest.apps.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useRestartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => nest.apps.restart(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useInterfaces() {
  return useQuery({
    queryKey: ['interfaces'],
    queryFn: () => nest.network.listInterfaces(),
  });
}

export function useLogs(filters: any) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => nest.logs.query(filters),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => nest.settings.get(),
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ['systemInfo'],
    queryFn: () => nest.system.info(),
  });
}
