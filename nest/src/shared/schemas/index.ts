/**
 * Zod schemas - Single source of truth for validation
 * ZERO Node/Electron imports allowed in this file
 */
import { z } from 'zod';
import type {
  ApplicationConfig,
  EnvVar,
  HealthCheckConfig,
  AccessPolicy,
  RuntimeState,
  ActivityLogEntry,
  NetworkInterfaceInfo,
  PortInfo,
  DiagnosticReport,
  DiagnosticStep,
  AppError,
  SystemInfo,
  ProcessInfo,
  ListenerInfo,
  ResolvedExecutable,
  ErrorCode,
  ProcessState,
  HealthState,
  PortState,
  AccessMode,
  LanVerification,
  LifecycleMode,
  Protocol,
  ExpectedListenAddress,
  HealthCheckType,
  NetworkProfile,
  InterfaceType,
  AutoRestartPolicy,
  RestartHistoryEntry,
} from '../types';

// Re-export types
export type {
  ApplicationConfig,
  EnvVar,
  HealthCheckConfig,
  AccessPolicy,
  RuntimeState,
  ActivityLogEntry,
  NetworkInterfaceInfo,
  PortInfo,
  DiagnosticReport,
  DiagnosticStep,
  AppError,
  SystemInfo,
  ProcessInfo,
  ListenerInfo,
  ResolvedExecutable,
  ErrorCode,
  ProcessState,
  HealthState,
  PortState,
  AccessMode,
  LanVerification,
  LifecycleMode,
  Protocol,
  ExpectedListenAddress,
  HealthCheckType,
  NetworkProfile,
  InterfaceType,
  AutoRestartPolicy,
  RestartHistoryEntry,
};

/** Error codes */
export const ErrorCodeSchema = z.enum([
  'VALIDATION',
  'NOT_FOUND',
  'PORT_IN_USE',
  'SPAWN_FAILED',
  'START_TIMEOUT',
  'ALREADY_RUNNING',
  'NOT_OWNED',
  'ELEVATION_DENIED',
  'FIREWALL_FAILED',
  'POLICY_BLOCKED',
  'NETWORK_PROFILE_PUBLIC',
  'LOOPBACK_ONLY',
  'UNSUPPORTED_OPERATION',
  'INTERNAL',
]);

/** AppError schema */
export const AppErrorSchema: z.ZodType<AppError> = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

/** Result type for all operations */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

/** Result schema factory */
export const makeResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: AppErrorSchema }),
  ]);

/** ProcessState */
export const ProcessStateSchema = z.enum([
  'registered',
  'starting',
  'running',
  'stopping',
  'stopped',
  'failed',
  'external',
  'unknown',
]);

/** HealthState */
export const HealthStateSchema = z.enum([
  'healthy',
  'unhealthy',
  'checking',
  'unknown',
  'not_applicable',
]);

/** PortState */
export const PortStateSchema = z.enum([
  'free',
  'occupied_by_managed',
  'occupied_by_other',
  'listening_loopback',
  'listening_all',
  'listening_lan',
  'unknown',
]);

/** AccessMode */
export const AccessModeSchema = z.enum([
  'local_only',
  'lan_requested',
  'lan_enabled',
  'lan_unavailable',
  'lan_disabled',
]);

/** LanVerification */
export const LanVerificationSchema = z.enum([
  'unverified',
  'local_ok',
  'remote_user_confirmed',
  'failed',
]);

/** LifecycleMode */
export const LifecycleModeSchema = z.enum(['managed', 'external']);

/** Protocol */
export const ProtocolSchema = z.enum(['http', 'https']);

/** ExpectedListenAddress */
export const ExpectedListenAddressSchema = z.enum(['loopback', 'all', 'specific']);

/** HealthCheckType */
export const HealthCheckTypeSchema = z.enum(['tcp', 'http', 'none']);

/** NetworkProfile */
export const NetworkProfileSchema = z.enum(['Private', 'Public', 'DomainAuthenticated', 'Unknown']);

/** InterfaceType */
export const InterfaceTypeSchema = z.enum([
  'Ethernet',
  'WiFi',
  'VPN',
  'Virtual',
  'Loopback',
  'Other',
]);

/** EnvVar schema */
export const EnvVarSchema = z.object({
  key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid environment variable name'),
  value: z.string(),
  secret: z.boolean().default(false),
});

/** HealthCheckConfig schema */
export const HealthCheckConfigSchema = z.object({
  type: HealthCheckTypeSchema.default('none'),
  path: z.string().optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  expectedBodyContains: z.string().optional(),
  intervalMs: z.number().int().positive().default(30000),
  timeoutMs: z.number().int().positive().default(5000),
  failureThreshold: z.number().int().positive().default(3),
});

/** ApplicationConfig schema */
export const ApplicationConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  projectPath: z.string().min(1),
  runtimeLabel: z.string().max(50).optional(),
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  workingDirectory: z.string().min(1),
  env: z.array(EnvVarSchema).default([]),
  protocol: ProtocolSchema.default('http'),
  port: z.number().int().min(1).max(65535),
  expectedListenAddress: ExpectedListenAddressSchema.default('loopback'),
  lifecycleMode: LifecycleModeSchema.default('managed'),
  startupTimeoutMs: z.number().int().positive().default(30000),
  healthCheck: HealthCheckConfigSchema.default({
    type: 'none',
    intervalMs: 30000,
    timeoutMs: 5000,
    failureThreshold: 3,
  }),
  selectedInterface: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

/** AccessPolicy schema */
export const AccessPolicySchema = z.object({
  appId: z.string().uuid(),
  mode: AccessModeSchema.default('local_only'),
  selectedInterface: z.string().optional(),
  firewallRuleRef: z.string().optional(),
  lastVerification: LanVerificationSchema.optional(),
  lastVerificationAt: z.number().int().positive().optional(),
  updatedAt: z.number().int().positive(),
});

/** RuntimeState schema */
export const RuntimeStateSchema = z.object({
  appId: z.string().uuid(),
  processState: ProcessStateSchema.default('unknown'),
  healthState: HealthStateSchema.default('unknown'),
  pid: z.number().int().positive().optional(),
  processStartTime: z.number().int().positive().optional(),
  portState: PortStateSchema.default('unknown'),
  listenerAddress: z.string().optional(),
  lastHealthCheck: z
    .object({
      timestamp: z.number().int().positive(),
      processAlive: z.boolean(),
      portListening: z.boolean(),
      localResponding: z.boolean(),
      latencyMs: z.number().int().positive().optional(),
      details: z.string().optional(),
    })
    .optional(),
  lastError: z.string().optional(),
  startedAt: z.number().int().positive().optional(),
  stoppedAt: z.number().int().positive().optional(),
  updatedAt: z.number().int().positive(),
});

/** HealthCheckResult schema */
export const HealthCheckResultSchema = z.object({
  timestamp: z.number().int().positive(),
  processAlive: z.boolean(),
  portListening: z.boolean(),
  localResponding: z.boolean(),
  latencyMs: z.number().int().positive().optional(),
  details: z.string().optional(),
});

/** ActivityLogEntry schema */
export const ActivityLogEntrySchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid().optional(),
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
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number().int().positive(),
});

/** NetworkInterfaceInfo schema */
export const NetworkInterfaceInfoSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  ipv4: z.string().min(1),
  subnet: z.string().min(1),
  prefixLength: z.number().int().min(0).max(32),
  gateway: z.string().optional(),
  isUp: z.boolean(),
  type: InterfaceTypeSchema,
  networkProfile: NetworkProfileSchema,
  isRecommended: z.boolean(),
});

/** PortInfo schema */
export const PortInfoSchema = z.object({
  port: z.number().int().min(1).max(65535),
  state: PortStateSchema,
  ownerPid: z.number().int().positive().optional(),
  ownerImage: z.string().optional(),
  ownedByManagedAppId: z.string().uuid().optional(),
  boundAddress: z.string().min(1),
});

/** DiagnosticStep schema */
export const DiagnosticStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['pass', 'fail', 'skipped', 'not_performed']),
  detail: z.string().min(1),
  suggestedAction: z.string().optional(),
});

/** DiagnosticReport schema */
export const DiagnosticReportSchema = z.object({
  appId: z.string().uuid(),
  timestamp: z.number().int().positive(),
  steps: z.array(DiagnosticStepSchema),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    notPerformed: z.number().int().nonnegative(),
  }),
});

/** SystemInfo schema */
export const SystemInfoSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
  isElevated: z.boolean(),
  userDataPath: z.string(),
});

/** ProcessInfo schema */
export const ProcessInfoSchema = z.object({
  pid: z.number().int().positive(),
  startTime: z.number().int().positive(),
  imageName: z.string(),
  parentPid: z.number().int().positive().optional(),
});

/** ListenerInfo schema */
export const ListenerInfoSchema = z.object({
  localAddress: z.string(),
  localPort: z.number().int().min(1).max(65535),
  pid: z.number().int().positive(),
  protocol: z.enum(['TCP', 'UDP']),
});

/** ResolvedExecutable schema */
export const ResolvedExecutableSchema = z.object({
  path: z.string().min(1),
  args: z.array(z.string()),
  isCmd: z.boolean(),
});

/** UUID generator helper */
export const uuidSchema = z.string().uuid();

/** Port validation with warning for privileged ports */
export const portSchema = z.number().int().min(1).max(65535);

/** Non-empty string */
export const nonEmptyString = z.string().min(1);

/** Path validation (shape only - existence checked in service) */
export const pathSchema = z.string().min(1);

/** Environment variable key validation */
export const envKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

/** Launch config linting warnings */
export interface LaunchConfigWarning {
  type:
    'metacharacter' | 'privileged_port' | 'relative_path' | 'missing_working_dir' | 'cmd_with_args';
  message: string;
  field: string;
}

/** Workflow request/response schemas */
export const AccessWorkflowStartRequestSchema = z.object({
  appId: uuidSchema,
});

export const AccessWorkflowStepRequestSchema = z.object({
  appId: uuidSchema,
  step: z.number().int().min(1).max(10),
  payload: z.record(z.unknown()).optional(),
});

export const AccessWorkflowStepResponseSchema = z.object({
  step: z.object({
    step: z.number().int().min(1).max(10),
    name: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
    details: z.record(z.unknown()),
    error: z.string().optional(),
  }),
  nextStep: z.number().int().min(1).max(10).optional(),
  workflow: z.object({
    appId: uuidSchema,
    currentStep: z.number().int().min(0).max(10),
    steps: z.array(
      z.object({
        step: z.number().int().min(1).max(10),
        name: z.string(),
        status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
        details: z.record(z.unknown()),
        error: z.string().optional(),
      })
    ),
    completed: z.boolean(),
    error: z.string().optional(),
  }),
});

export const AccessWorkflowStatusRequestSchema = z.object({
  appId: uuidSchema,
});

export const AccessWorkflowStatusSchema = z.object({
  appId: uuidSchema,
  currentStep: z.number().int().min(0).max(10),
  steps: z.array(
    z.object({
      step: z.number().int().min(1).max(10),
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
      details: z.record(z.unknown()),
      error: z.string().optional(),
    })
  ),
  completed: z.boolean(),
  error: z.string().optional(),
});

/** Lint launch config for warnings (not errors) */
export function lintLaunchConfig(config: ApplicationConfig): LaunchConfigWarning[] {
  const warnings: LaunchConfigWarning[] = [];

  // Check for privileged port
  if (config.port < 1024) {
    warnings.push({
      type: 'privileged_port',
      message: `Port ${config.port} is a privileged port (<1024) and may require elevation`,
      field: 'port',
    });
  }

  // Check for shell metacharacters in args
  const metacharRegex = /[&|<>^%!"]/;
  for (const arg of config.args) {
    if (metacharRegex.test(arg)) {
      warnings.push({
        type: 'metacharacter',
        message: `Argument contains shell metacharacters: ${arg}`,
        field: 'args',
      });
    }
    if (arg.includes('\n') || arg.includes('\r')) {
      warnings.push({
        type: 'metacharacter',
        message: `Argument contains newline characters`,
        field: 'args',
      });
    }
  }

  // Check for relative executable path
  if (!config.executable.startsWith('/') && !config.executable.match(/^[A-Za-z]:[/\\]/)) {
    if (config.executable.includes('/') || config.executable.includes('\\')) {
      warnings.push({
        type: 'relative_path',
        message: `Executable path appears relative: ${config.executable}`,
        field: 'executable',
      });
    }
  }

  // Check working directory
  if (!config.workingDirectory || config.workingDirectory.trim() === '') {
    warnings.push({
      type: 'missing_working_dir',
      message: 'Working directory is empty',
      field: 'workingDirectory',
    });
  }

  // Check for .cmd/.bat with args (requires special handling)
  if (/\.cmd$/i.test(config.executable) || /\.bat$/i.test(config.executable)) {
    if (config.args.length > 0) {
      warnings.push({
        type: 'cmd_with_args',
        message: 'Batch files with arguments require special handling on Windows',
        field: 'executable',
      });
    }
  }

  return warnings;
}
