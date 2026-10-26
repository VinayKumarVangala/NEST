/**
 * IPC Contract - Channel names + request/response schemas
 * ZERO Node/Electron imports allowed in this file
 */
import { z } from 'zod';
import {
  ApplicationConfigSchema,
  AccessPolicySchema,
  RuntimeStateSchema,
  ActivityLogEntrySchema,
  NetworkInterfaceInfoSchema,
  PortInfoSchema,
  DiagnosticReportSchema,
  SystemInfoSchema,
  AppErrorSchema,
  uuidSchema,
  portSchema,
  nonEmptyString,
  ProcessStateSchema,
  HealthStateSchema,
  LanVerificationSchema,
  ProcessInfoSchema,
  ListenerInfoSchema,
  HealthCheckResultSchema,
  AccessWorkflowStartRequestSchema,
  AccessWorkflowStepRequestSchema,
  AccessWorkflowStepResponseSchema,
  AccessWorkflowStatusRequestSchema,
  AccessWorkflowStatusSchema,
} from './schemas';
import type {
  ApplicationConfig,
  AccessPolicy,
  RuntimeState,
  ActivityLogEntry,
  NetworkInterfaceInfo,
  PortInfo,
  DiagnosticReport,
  SystemInfo,
  AppError,
  Result,
  ProcessInfo,
  ListenerInfo,
  HealthCheckResult,
  LaunchConfigWarning,
  LaunchProfile,
  AutoRestartPolicy,
  RestartHistoryEntry,
  AccessWorkflowStatus,
} from './types';

// Re-export types for consumers
export type {
  ApplicationConfig,
  AccessPolicy,
  RuntimeState,
  ActivityLogEntry,
  NetworkInterfaceInfo,
  PortInfo,
  DiagnosticReport,
  SystemInfo,
  AppError,
  Result,
  ProcessInfo,
  ListenerInfo,
  HealthCheckResult,
  LaunchConfigWarning,
  AutoRestartPolicy,
  RestartHistoryEntry,
};
export { AppsCreateRequestSchema };

/** Request payload schemas (separate from full config schemas) */
const AppsCreateRequestSchema = z.object({
  name: z.string().min(1).max(80),
  projectPath: z.string().min(1),
  runtimeLabel: z.string().max(50).optional(),
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  workingDirectory: z.string().min(1),
  env: z.array(z.object({ key: z.string(), value: z.string(), secret: z.boolean() })).default([]),
  protocol: z.enum(['http', 'https']).default('http'),
  port: z.number().int().min(1).max(65535),
  expectedListenAddress: z.enum(['loopback', 'all', 'specific']).default('loopback'),
  lifecycleMode: z.enum(['managed', 'external']).default('managed'),
  startupTimeoutMs: z.number().int().positive().default(30000),
  healthCheck: z
    .object({
      type: z.enum(['tcp', 'http', 'none']).default('none'),
      path: z.string().optional(),
      expectedStatus: z.number().int().min(100).max(599).optional(),
      expectedBodyContains: z.string().optional(),
      intervalMs: z.number().int().positive().default(30000),
      timeoutMs: z.number().int().positive().default(5000),
      failureThreshold: z.number().int().positive().default(3),
    })
    .default({ type: 'none', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 }),
  lanLaunchProfile: z
    .object({
      args: z.array(z.string()).default([]),
      env: z
        .array(z.object({ key: z.string(), value: z.string(), secret: z.boolean() }))
        .default([]),
    })
    .optional(),
  selectedInterface: z.string().optional(),
});

const AppsUpdateRequestSchema = z.object({
  id: uuidSchema,
  config: AppsCreateRequestSchema.partial(),
});

const RegisterExternalRequestSchema = z.object({
  name: nonEmptyString,
  port: portSchema,
  protocol: z.enum(['http', 'https']).default('http'),
  healthCheck: z
    .object({
      type: z.enum(['tcp', 'http', 'none']).default('tcp'),
      path: z.string().optional(),
      expectedStatus: z.number().int().min(100).max(599).optional(),
      intervalMs: z.number().int().positive().default(30000),
      timeoutMs: z.number().int().positive().default(5000),
      failureThreshold: z.number().int().positive().default(3),
    })
    .optional(),
  selectedInterface: z.string().optional(),
});

const PortCheckRequestSchema = z.object({
  port: portSchema,
  host: z.string().optional(),
});

const PortSuggestRequestSchema = z.object({
  preferred: portSchema.optional(),
  range: z.tuple([portSchema, portSchema]).optional(),
});

const SelectInterfaceRequestSchema = z.object({
  interfaceName: nonEmptyString,
});

const AccessStatusRequestSchema = z.object({
  appId: uuidSchema,
});

const AccessEnableRequestSchema = z.object({
  appId: uuidSchema,
  confirmation: z.string(),
});

const AccessDisableRequestSchema = z.object({
  appId: uuidSchema,
  restartWithLocalProfile: z.boolean().default(false),
});

const HealthCheckRequestSchema = z.object({
  appId: uuidSchema,
});

const DiagnosticsRequestSchema = z.object({
  appId: uuidSchema,
});

const LogsQueryRequestSchema = z.object({
  appId: uuidSchema.optional(),
  eventType: z
    .array(
      z.enum([
        'start',
        'stop',
        'restart',
        'crash',
        'health_change',
        'lan_enable',
        'lan_disable',
        'firewall_change',
        'error',
        'info',
      ])
    )
    .optional(),
  severity: z.array(z.enum(['debug', 'info', 'warn', 'error'])).optional(),
  from: z.number().int().positive().optional(),
  to: z.number().int().positive().optional(),
  text: z.string().optional(),
  limit: z.number().int().positive().max(10000).default(1000),
  offset: z.number().int().nonnegative().default(0),
});

const SettingsUpdateRequestSchema = z.object({
  backgroundMode: z.boolean().optional(),
  shutdownPolicy: z.enum(['stop_all', 'keep_running', 'ask']).optional(),
  startupAtLogin: z.boolean().optional(),
  preferredInterface: z.string().optional(),
  confirmationPreferences: z.record(z.boolean()).optional(),
  logRetentionDays: z.number().int().positive().optional(),
  logMaxLinesPerApp: z.number().int().positive().optional(),
});

const LintLaunchConfigRequestSchema = z.object({
  config: ApplicationConfigSchema,
});

const DummyRequestSchema = z.object({
  message: z.string(),
});

const DummyResponseSchema = z.object({
  echo: z.string(),
  timestamp: z.number().int().positive(),
});

/** Result schema factory */
const makeResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: AppErrorSchema }),
  ]);

/** Helper to create a typed IPC channel */
export const createChannel = <TRequest, TResponse>(
  name: string,
  requestSchema: z.ZodType<TRequest>,
  responseSchema: z.ZodType<TResponse>
) =>
  ({
    name,
    requestSchema,
    responseSchema,
  }) as const;

/** Event channels (main -> renderer) */
export const EventChannels = {
  'app.stateChanged': z.object({
    appId: uuidSchema,
    processState: ProcessStateSchema,
    healthState: HealthStateSchema,
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{ appId: string; processState: string; healthState: string; timestamp: number }>,
  'app.log': z.object({
    id: uuidSchema,
    appId: uuidSchema.optional(),
    eventType: z.enum([
      'start',
      'stop',
      'restart',
      'crash',
      'health_change',
      'lan_enable',
      'lan_disable',
      'firewall_change',
      'error',
      'info',
    ]),
    severity: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    timestamp: z.number().int().positive(),
  }) as z.ZodType<ActivityLogEntry>,
  'health.changed': z.object({
    appId: uuidSchema,
    healthState: HealthStateSchema,
    result: HealthCheckResultSchema,
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{
    appId: string;
    healthState: string;
    result: HealthCheckResult;
    timestamp: number;
  }>,
  'network.changed': z.object({
    interfaces: z.array(NetworkInterfaceInfoSchema),
    selectedInterface: z.string().optional(),
    timestamp: z.number().int().positive(),
    diff: z.object({
      ipChanged: z.boolean().optional(),
      previousIp: z.string().optional(),
      currentIp: z.string().optional(),
      interfacesChanged: z.boolean().optional(),
      added: z.array(NetworkInterfaceInfoSchema).optional(),
      removed: z.array(NetworkInterfaceInfoSchema).optional(),
      changed: z.array(NetworkInterfaceInfoSchema).optional(),
    }).optional(),
  }) as z.ZodType<{
    interfaces: NetworkInterfaceInfo[];
    selectedInterface?: string;
    timestamp: number;
    diff?: {
      ipChanged?: boolean;
      previousIp?: string;
      currentIp?: string;
      interfacesChanged?: boolean;
      added?: NetworkInterfaceInfo[];
      removed?: NetworkInterfaceInfo[];
      changed?: NetworkInterfaceInfo[];
    };
  }>,
  'network.staleUrl': z.object({
    appId: uuidSchema,
    appName: z.string(),
    oldIp: z.string(),
    newIp: z.string(),
    oldUrl: z.string(),
    newUrl: z.string(),
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{
    appId: string;
    appName: string;
    oldIp: string;
    newIp: string;
    oldUrl: string;
    newUrl: string;
    timestamp: number;
  }>,
  'port.conflict': z.object({
    appId: uuidSchema,
    port: portSchema,
    ownerPid: z.number().int().positive().optional(),
    ownerImage: z.string().optional(),
    suggestion: z.number().int().min(1).max(65535).optional(),
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{
    appId: string;
    port: number;
    ownerPid?: number;
    ownerImage?: string;
    suggestion?: number;
    timestamp: number;
  }>,
  'firewall.changed': z.object({
    appId: uuidSchema,
    action: z.enum(['added', 'removed', 'reconciled', 'failed']),
    ruleName: z.string().optional(),
    error: AppErrorSchema.optional(),
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{
    appId: string;
    action: string;
    ruleName?: string;
    error?: AppError;
    timestamp: number;
  }>,
  'system.resume': z.object({
    timestamp: z.number().int().positive(),
  }) as z.ZodType<{
    timestamp: number;
  }>,
} as const;

/** Request/Response channels (renderer -> main) */
export const RequestChannels = {
  // Applications
  'apps.list': createChannel(
    'apps.list',
    z.void(),
    makeResultSchema(z.array(ApplicationConfigSchema))
  ),
  'apps.get': createChannel(
    'apps.get',
    z.object({ id: uuidSchema }),
    makeResultSchema(ApplicationConfigSchema)
  ),
  'apps.create': createChannel(
    'apps.create',
    AppsCreateRequestSchema,
    makeResultSchema(ApplicationConfigSchema)
  ),
  'apps.update': createChannel(
    'apps.update',
    AppsUpdateRequestSchema,
    makeResultSchema(ApplicationConfigSchema)
  ),
  'apps.remove': createChannel(
    'apps.remove',
    z.object({ id: uuidSchema, confirmDeleteFiles: z.boolean().default(false) }),
    makeResultSchema(z.void())
  ),
  'apps.start': createChannel(
    'apps.start',
    z.object({ id: uuidSchema }),
    makeResultSchema(RuntimeStateSchema)
  ),
  'apps.stop': createChannel(
    'apps.stop',
    z.object({ id: uuidSchema, force: z.boolean().default(false) }),
    makeResultSchema(RuntimeStateSchema)
  ),
  'apps.restart': createChannel(
    'apps.restart',
    z.object({ id: uuidSchema }),
    makeResultSchema(RuntimeStateSchema)
  ),
  'apps.registerExternal': createChannel(
    'apps.registerExternal',
    RegisterExternalRequestSchema,
    makeResultSchema(ApplicationConfigSchema)
  ),
  'apps.pickFolder': createChannel(
    'apps.pickFolder',
    z.void(),
    makeResultSchema(z.object({ path: z.string().optional() }))
  ),

  // Ports
  'ports.check': createChannel(
    'ports.check',
    PortCheckRequestSchema,
    makeResultSchema(PortInfoSchema)
  ),
  'ports.suggest': createChannel(
    'ports.suggest',
    PortSuggestRequestSchema,
    makeResultSchema(portSchema)
  ),
  'ports.listListeners': createChannel(
    'ports.listListeners',
    z.void(),
    makeResultSchema(z.array(ListenerInfoSchema))
  ),

  // Network
  'network.listInterfaces': createChannel(
    'network.listInterfaces',
    z.void(),
    makeResultSchema(z.array(NetworkInterfaceInfoSchema))
  ),
  'network.selectInterface': createChannel(
    'network.selectInterface',
    SelectInterfaceRequestSchema,
    makeResultSchema(z.object({ selected: NetworkInterfaceInfoSchema }))
  ),

  // Access
  'access.getStatus': createChannel(
    'access.getStatus',
    AccessStatusRequestSchema,
    makeResultSchema(
      z.object({
        policy: AccessPolicySchema,
        bindingClass: z.enum(['loopback_only', 'all_interfaces', 'specific_lan', 'not_listening']),
        lanUrl: z.string().optional(),
        changePlan: z
          .object({
            needsRestart: z.boolean(),
            needsElevation: z.boolean(),
            firewallRule: z
              .object({
                name: z.string(),
                port: portSchema,
                remoteAddress: z.string(),
                profile: z.string(),
              })
              .optional(),
            warnings: z.array(z.string()),
          })
          .optional(),
      })
    )
  ),
  'access.enable': createChannel(
    'access.enable',
    AccessEnableRequestSchema,
    makeResultSchema(
      z.object({
        policy: AccessPolicySchema,
        lanUrl: z.string(),
        verification: LanVerificationSchema,
      })
    )
  ),
  'access.disable': createChannel(
    'access.disable',
    AccessDisableRequestSchema,
    makeResultSchema(AccessPolicySchema)
  ),

  // Access Workflow
  'access.workflow.start': createChannel(
    'access.workflow.start',
    AccessWorkflowStartRequestSchema,
    makeResultSchema(AccessWorkflowStatusSchema)
  ),
  'access.workflow.step': createChannel(
    'access.workflow.step',
    AccessWorkflowStepRequestSchema,
    makeResultSchema(AccessWorkflowStepResponseSchema)
  ),
  'access.workflow.status': createChannel(
    'access.workflow.status',
    AccessWorkflowStatusRequestSchema,
    makeResultSchema(AccessWorkflowStatusSchema)
  ),

  // Health
  'health.checkNow': createChannel(
    'health.checkNow',
    HealthCheckRequestSchema,
    makeResultSchema(HealthCheckResultSchema)
  ),

  // Diagnostics
  'diagnostics.run': createChannel(
    'diagnostics.run',
    DiagnosticsRequestSchema,
    makeResultSchema(DiagnosticReportSchema)
  ),

  // Logs
  'logs.query': createChannel(
    'logs.query',
    LogsQueryRequestSchema,
    makeResultSchema(
      z.object({
        entries: z.array(ActivityLogEntrySchema),
        total: z.number().int().nonnegative(),
      })
    )
  ),

  // Settings
  'settings.get': createChannel(
    'settings.get',
    z.void(),
    makeResultSchema(
      z.object({
        backgroundMode: z.boolean(),
        shutdownPolicy: z.enum(['stop_all', 'keep_running', 'ask']),
        startupAtLogin: z.boolean(),
        defaultAccessPolicy: z.literal('local_only'),
        preferredInterface: z.string().optional(),
        confirmationPreferences: z.record(z.boolean()).default({}),
        logRetentionDays: z.number().int().positive().default(30),
        logMaxLinesPerApp: z.number().int().positive().default(5000),
      })
    )
  ),
  'settings.update': createChannel(
    'settings.update',
    SettingsUpdateRequestSchema,
    makeResultSchema(z.void())
  ),

  // System
  'system.info': createChannel('system.info', z.void(), makeResultSchema(SystemInfoSchema)),

  // Test dummy channel
  'test.dummy': createChannel(
    'test.dummy',
    DummyRequestSchema,
    makeResultSchema(DummyResponseSchema)
  ),

  // Launch config linting
  'apps.lintLaunchConfig': createChannel(
    'apps.lintLaunchConfig',
    LintLaunchConfigRequestSchema,
    makeResultSchema(
      z.array(
        z.object({
          type: z.enum([
            'metacharacter',
            'privileged_port',
            'relative_path',
            'missing_working_dir',
            'cmd_with_args',
          ]),
          message: z.string(),
          field: z.string(),
        })
      )
    )
  ),
} as const;

/** Type for event channel names */
export type EventChannelName = keyof typeof EventChannels;

/** Type for request channel names */
export type RequestChannelName = keyof typeof RequestChannels;

/** All channel names */
export type ChannelName = EventChannelName | RequestChannelName;

/** Extract request type from channel */
export type RequestOf<C extends RequestChannelName> = z.infer<
  (typeof RequestChannels)[C]['requestSchema']
>;

/** Extract response type from channel */
export type ResponseOf<C extends RequestChannelName> = z.infer<
  (typeof RequestChannels)[C]['responseSchema']
>;

/** Preload API shape (what gets exposed to renderer) */
export interface NestAPI {
  apps: {
    list(): Promise<Result<ApplicationConfig[]>>;
    get(id: string): Promise<Result<ApplicationConfig>>;
    create(
      config: Omit<ApplicationConfig, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Result<ApplicationConfig>>;
    update(id: string, config: Partial<ApplicationConfig>): Promise<Result<ApplicationConfig>>;
    remove(id: string, confirmDeleteFiles?: boolean): Promise<Result<void>>;
    start(id: string): Promise<Result<RuntimeState>>;
    stop(id: string, force?: boolean): Promise<Result<RuntimeState>>;
    restart(id: string): Promise<Result<RuntimeState>>;
    registerExternal(params: {
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
    }): Promise<Result<ApplicationConfig>>;
    lintLaunchConfig(config: ApplicationConfig): Promise<Result<LaunchConfigWarning[]>>;
    dummy(message: string): Promise<Result<{ echo: string; timestamp: number }>>;
    pickFolder(): Promise<Result<{ path: string } | undefined>>;
  };
  ports: {
    check(port: number, host?: string): Promise<Result<PortInfo>>;
    suggest(preferred?: number, range?: [number, number]): Promise<Result<number>>;
    listListeners(): Promise<Result<ListenerInfo[]>>;
  };
  network: {
    listInterfaces(): Promise<Result<NetworkInterfaceInfo[]>>;
    selectInterface(interfaceName: string): Promise<Result<{ selected: NetworkInterfaceInfo }>>;
  };
  access: {
    getStatus(appId: string): Promise<
      Result<{
        policy: AccessPolicy;
        bindingClass: 'loopback_only' | 'all_interfaces' | 'specific_lan' | 'not_listening';
        lanUrl?: string;
        isLanEligible: boolean;
        changePlan?: {
          needsRestart: boolean;
          needsElevation: boolean;
          firewallRule?: { name: string; port: number; remoteAddress: string; profile: string };
          warnings: string[];
        };
      }>
    >;
    enable(
      appId: string,
      confirmation: string
    ): Promise<Result<{ policy: AccessPolicy; lanUrl: string; verification: string }>>;
    disable(appId: string, restartWithLocalProfile?: boolean): Promise<Result<AccessPolicy>>;
    workflow: {
      start(appId: string): Promise<Result<AccessWorkflowStatus>>;
      step(
        appId: string,
        step: number,
        payload?: Record<string, unknown>
      ): Promise<Result<{ step: any; nextStep?: number; workflow: AccessWorkflowStatus }>>;
      status(appId: string): Promise<Result<AccessWorkflowStatus>>;
    };
  };
  health: {
    checkNow(appId: string): Promise<Result<HealthCheckResult>>;
  };
  diagnostics: {
    run(appId: string): Promise<Result<DiagnosticReport>>;
  };
  logs: {
    query(params: {
      appId?: string;
      eventType?: string[];
      severity?: string[];
      from?: number;
      to?: number;
      text?: string;
      limit?: number;
      offset?: number;
    }): Promise<Result<{ entries: ActivityLogEntry[]; total: number }>>;
  };
  settings: {
    get(): Promise<
      Result<{
        backgroundMode: boolean;
        shutdownPolicy: 'stop_all' | 'keep_running' | 'ask';
        startupAtLogin: boolean;
        defaultAccessPolicy: 'local_only';
        preferredInterface?: string;
        confirmationPreferences: Record<string, boolean>;
        logRetentionDays: number;
        logMaxLinesPerApp: number;
      }>
    >;
    update(
      params: Partial<{
        backgroundMode: boolean;
        shutdownPolicy: 'stop_all' | 'keep_running' | 'ask';
        startupAtLogin: boolean;
        preferredInterface: string;
        confirmationPreferences: Record<string, boolean>;
        logRetentionDays: number;
        logMaxLinesPerApp: number;
      }>
    ): Promise<Result<void>>;
  };
  system: {
    info(): Promise<Result<SystemInfo>>;
  };
  on: <K extends EventChannelName>(channel: K, callback: (payload: unknown) => void) => () => void;
  off: <K extends EventChannelName>(channel: K, callback: (payload: unknown) => void) => void;
}

/** Type guard to verify channel exists */
export function isValidChannel(name: string): name is ChannelName {
  return name in EventChannels || name in RequestChannels;
}

// Re-export workflow types
export type {
  StepStatus,
  AccessWorkflowStatus,
  AccessWorkflowStartRequest,
  AccessWorkflowStepRequest,
  AccessWorkflowStepResponse,
  AccessWorkflowStatusRequest,
  WorkflowStep,
  PreconditionsCheck,
  BindingCheck,
  ChangePlan,
  UserConfirmation,
  ApplyChanges,
  LocalVerification,
  RemoteVerification,
  PersistPolicy,
  DisableRollback,
  Reconciliation,
} from './types';
