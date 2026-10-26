/**
 * IPC Client - Typed client for renderer to communicate with main process
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  EventChannelName,
  PrivilegedOperationType,
  PrivilegedOperationOutcome,
} from '@shared/ipc-contract';

// Type-safe wrapper around window.nest
const api = window.nest as NestAPI;

// Type definitions for complex result types
interface LogQueryResult {
  entries: ActivityLogEntry[];
  total: number;
}

interface AuditQueryResult {
  entries: any[];
  total: number;
}

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
    dummy: (message: string) =>
      api.apps.dummy(message) as Promise<Result<{ echo: string; timestamp: number }>>,
    pickFolder: () => api.apps.pickFolder() as Promise<Result<{ path: string } | undefined>>,
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
    workflow: {
      start: (appId: string) => api.access.workflow.start(appId) as Promise<Result<any>>,
      step: (appId: string, step: number, payload?: Record<string, unknown>) =>
        api.access.workflow.step(appId, step, payload) as Promise<Result<any>>,
      status: (appId: string) => api.access.workflow.status(appId) as Promise<Result<any>>,
    },
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
    }) => api.logs.query(params) as Promise<Result<LogQueryResult>>,
  },

  audit: {
    query: (params: {
      appId?: string;
      operationType?: PrivilegedOperationType;
      outcome?: PrivilegedOperationOutcome;
      from?: number;
      to?: number;
      limit?: number;
      offset?: number;
    }) => api.audit.query(params) as Promise<Result<AuditQueryResult>>,
  },

  settings: {
    get: () => api.settings.get() as Promise<Result<any>>,
    update: (params: any) => api.settings.update(params) as Promise<Result<void>>,
  },

  system: {
    info: () => api.system.info() as Promise<Result<SystemInfo>>,
  },

  on: <K extends EventChannelName>(channel: K, callback: any) => api.on(channel, callback),
  off: <K extends EventChannelName>(channel: K, callback: any) => api.off(channel, callback),
};

// Type definitions for complex result types
interface LogQueryResult {
  entries: ActivityLogEntry[];
  total: number;
}

interface AuditQueryResult {
  entries: any[];
  total: number;
}

// React hooks for IPC
/** Generic query hook for IPC calls */
export function useIpcQuery<TResult, TError = Error>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<Result<TResult>>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  }
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const result = await queryFn();
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime,
    refetchInterval: options?.refetchInterval,
  });
}

/** Generic mutation hook for IPC calls */
export function useIpcMutation<TVariables, TResult, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<Result<TResult>>,
  options?: {
    onSuccess?: (data: TResult, variables: TVariables) => void;
    onError?: (error: TError, variables: TVariables) => void;
    onSettled?: (data: TResult | undefined, error: TError | null, variables: TVariables) => void;
  }
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: TVariables) => {
      const result = await mutationFn(variables);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    onSettled: options?.onSettled,
  });
}

/** Pre-built hooks for common operations */
export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: async () => {
      const result = await nest.apps.list();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['apps', id],
    queryFn: async () => {
      const result = await nest.apps.get(id);
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useStartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return nest.apps.start(id).then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return nest.apps.stop(id).then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useRestartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return nest.apps.restart(id).then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  });
}

export function useInterfaces() {
  return useQuery({
    queryKey: ['interfaces'],
    queryFn: async () => {
      const result = await nest.network.listInterfaces();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useLogs(filters: any) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: async () => {
      const result = await nest.logs.query(filters);
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await nest.settings.get();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ['systemInfo'],
    queryFn: async () => {
      const result = await nest.system.info();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}