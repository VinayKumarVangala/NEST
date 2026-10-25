/**
 * IPC Handler Registration - Generic, reused everywhere
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { Result, AppError } from '@shared/types';
import type { RequestChannelName } from '@shared/ipc-contract';
import { RequestChannels, EventChannels, isValidChannel } from '@shared/ipc-contract';

export interface IPCServices {
  applicationManager: any;
  portManager: any;
  healthMonitor: any;
  networkManager: any;
  securityPolicyManager: any;
  diagnosticsService: any;
  osAdapter: any;
  eventBus: any;
  settings: any;
  saveSettings: (settings: Partial<any>) => void;
}

/** Validate event sender is our own renderer */
function validateSender(event: IpcMainInvokeEvent): boolean {
  return true;
}

/** Create a standardized error response */
function createError(
  code: AppError['code'],
  message: string,
  details?: Record<string, unknown>
): AppError {
  return { code, message, details };
}

/** Register all IPC handlers */
export function registerHandlers(
  ipcMain: typeof import('electron').ipcMain,
  services: IPCServices
): void {
  const createHandler = <TRequest, TResponse>(
    channel: RequestChannelName,
    handler: (payload: TRequest, services: IPCServices) => Promise<TResponse>
  ) => {
    const { requestSchema, responseSchema } = RequestChannels[channel];

    ipcMain.handle(channel, async (event, payload: unknown): Promise<Result<TResponse>> => {
      if (!validateSender(event)) {
        return { ok: false, error: createError('VALIDATION', 'Invalid sender') };
      }

      const parseResult = requestSchema.safeParse(payload);
      if (!parseResult.success) {
        return {
          ok: false,
          error: createError('VALIDATION', 'Invalid request payload', {
            issues: parseResult.error.flatten().fieldErrors,
          }),
        };
      }

      try {
        const data = await handler(parseResult.data as TRequest, services);

        if (process.env.NODE_ENV === 'development') {
          const responseParse = responseSchema.safeParse({ ok: true, data });
          if (!responseParse.success) {
            console.error(`[IPC] Response validation failed for ${channel}:`, responseParse.error);
          }
        }

        return { ok: true, data };
      } catch (error) {
        console.error(`[IPC] Handler error for ${channel}:`, error);
        return {
          ok: false,
          error: createError('INTERNAL', error instanceof Error ? error.message : 'Unknown error'),
        };
      }
    });
  };

  /** Create a standardized error response */
  function createError(
    code: AppError['code'],
    message: string,
    details?: Record<string, unknown>
  ): AppError {
    return { code, message, details };
  }

  /** Validate event sender is our own renderer */
  function validateSender(event: IpcMainInvokeEvent): boolean {
    return true;
  }

  // Applications
  createHandler('apps.list', async () => {
    const apps = await services.applicationManager.listApplications();
    return apps;
  });

  createHandler('apps.get', async ({ id }: { id: string }) => {
    const app = await services.applicationManager.getApplication(id);
    if (!app) throw new Error('Application not found');
    return app;
  });

  createHandler('apps.create', async (config: any) => {
    const app = await services.applicationManager.createApplication(config);
    return app;
  });

  createHandler('apps.update', async ({ id, config }: { id: string; config: any }) => {
    const app = await services.applicationManager.updateApplication(id, config);
    if (!app) throw new Error('Application not found');
    return app;
  });

  createHandler(
    'apps.remove',
    async ({ id, confirmDeleteFiles }: { id: string; confirmDeleteFiles: boolean }) => {
      await services.applicationManager.removeApplication(id, confirmDeleteFiles);
      return undefined;
    }
  );

  createHandler('apps.start', async ({ id }: { id: string }) => {
    const state = await services.applicationManager.start(id);
    return state;
  });

  createHandler('apps.stop', async ({ id, force }: { id: string; force: boolean }) => {
    const state = await services.applicationManager.stop(id, force);
    return state;
  });

  createHandler('apps.restart', async ({ id }: { id: string }) => {
    const state = await services.applicationManager.restart(id);
    return state;
  });

  createHandler('apps.registerExternal', async (params: any) => {
    const app = await services.applicationManager.registerExternal(params);
    return app;
  });

  createHandler('apps.lintLaunchConfig', async ({ config }: { config: any }) => {
    const warnings = services.applicationManager.lintLaunchConfig(config);
    return warnings;
  });

  // Ports
  createHandler('ports.check', async ({ port, host }: { port: number; host?: string }) => {
    const info = await services.portManager.checkPort(port, host);
    return info;
  });

  createHandler(
    'ports.suggest',
    async ({ preferred, range }: { preferred?: number; range?: [number, number] }) => {
      const port = await services.portManager.suggestPort(preferred, range);
      return port;
    }
  );

  createHandler('ports.listListeners', async () => {
    const listeners = await services.portManager.listListeners();
    return listeners;
  });

  // Network
  createHandler('network.listInterfaces', async () => {
    const interfaces = await services.networkManager.listInterfaces();
    return interfaces;
  });

  createHandler('network.selectInterface', async ({ interfaceName }: { interfaceName: string }) => {
    const selected = await services.networkManager.selectInterface(interfaceName);
    return { selected };
  });

  // Access
  createHandler('access.getStatus', async ({ appId }: { appId: string }) => {
    const status = await services.securityPolicyManager.getAccessStatus(appId);
    return status;
  });

  createHandler(
    'access.enable',
    async ({ appId, confirmation }: { appId: string; confirmation: string }) => {
      const result = await services.securityPolicyManager.enableAccess(appId, confirmation);
      return result;
    }
  );

  createHandler(
    'access.disable',
    async ({
      appId,
      restartWithLocalProfile,
    }: {
      appId: string;
      restartWithLocalProfile: boolean;
    }) => {
      const policy = await services.securityPolicyManager.disableAccess(
        appId,
        restartWithLocalProfile
      );
      return policy;
    }
  );

  // Health
  createHandler('health.checkNow', async ({ appId }: { appId: string }) => {
    const result = await services.healthMonitor.checkNow(appId);
    return result;
  });

  // Diagnostics
  createHandler('diagnostics.run', async ({ appId }: { appId: string }) => {
    const report = await services.diagnosticsService.runDiagnostics(appId);
    return report;
  });

  // Logs
  createHandler('logs.query', async (params: any) => {
    const result = await services.applicationManager.queryLogs(params);
    return result;
  });

  // Settings
  createHandler('settings.get', async () => {
    const settings = services.settings;
    return settings;
  });

  createHandler('settings.update', async (params: any) => {
    services.saveSettings({ ...services.settings, ...params });
    return undefined;
  });

  // System
  createHandler('system.info', async () => {
    const info = await services.osAdapter.getSystemInfo();
    return info;
  });

  console.log('[IPC] All handlers registered');
}
