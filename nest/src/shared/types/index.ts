/**
 * Domain types and enums - Section 0.3 State vocabulary
 * ZERO Node/Electron imports allowed in this file
 */

/** Process state: registered | starting | running | stopping | stopped | failed | external | unknown */
export type ProcessState =
  | 'registered'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'external'
  | 'unknown';

/** Health state: healthy | unhealthy | checking | unknown | not_applicable */
export type HealthState = 'healthy' | 'unhealthy' | 'checking' | 'unknown' | 'not_applicable';

/** Port state: free | occupied_by_managed | occupied_by_other | listening_loopback | listening_all | listening_lan | unknown */
export type PortState =
  | 'free'
  | 'occupied_by_managed'
  | 'occupied_by_other'
  | 'listening_loopback'
  | 'listening_all'
  | 'listening_lan'
  | 'unknown';

/** Access policy: local_only | lan_requested | lan_enabled | lan_unavailable | lan_disabled */
export type AccessMode =
  'local_only' | 'lan_requested' | 'lan_enabled' | 'lan_unavailable' | 'lan_disabled';

/** LAN verification: unverified | local_ok | remote_user_confirmed | failed */
export type LanVerification = 'unverified' | 'local_ok' | 'remote_user_confirmed' | 'failed';

/** Runtime mode for applications */
export type LifecycleMode = 'managed' | 'external';

/** Protocol type */
export type Protocol = 'http' | 'https';

/** Expected listen address */
export type ExpectedListenAddress = 'loopback' | 'all' | 'specific' | 'lan';

/** Health check type */
export type HealthCheckType = 'tcp' | 'http' | 'none';

/** Network profile */
export type NetworkProfile = 'Private' | 'Public' | 'DomainAuthenticated' | 'Unknown';

/** Network interface type */
export type InterfaceType = 'Ethernet' | 'WiFi' | 'VPN' | 'Virtual' | 'Loopback' | 'Other';

/** Error codes (closed set) */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'PORT_IN_USE'
  | 'SPAWN_FAILED'
  | 'START_TIMEOUT'
  | 'ALREADY_RUNNING'
  | 'NOT_OWNED'
  | 'ELEVATION_DENIED'
  | 'FIREWALL_FAILED'
  | 'POLICY_BLOCKED'
  | 'NETWORK_PROFILE_PUBLIC'
  | 'LOOPBACK_ONLY'
  | 'UNSUPPORTED_OPERATION'
  | 'INTERNAL';

/** Application configuration */
export interface ApplicationConfig {
  id: string;
  name: string;
  projectPath: string;
  runtimeLabel?: string;
  executable: string;
  args: string[];
  workingDirectory: string;
  env: EnvVar[];
  protocol: Protocol;
  port: number;
  expectedListenAddress: ExpectedListenAddress;
  lifecycleMode: LifecycleMode;
  startupTimeoutMs: number;
  healthCheck: HealthCheckConfig;
  selectedInterface?: string;
  autoRestartPolicy?: AutoRestartPolicy;
  createdAt: number;
  updatedAt: number;
}

/** Auto-restart policy for managed apps */
export interface AutoRestartPolicy {
  enabled: boolean;
  maxRestarts: number;
  windowMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

/** Environment variable */
export interface EnvVar {
  key: string;
  value: string;
  secret: boolean;
}

/** Health check configuration */
export interface HealthCheckConfig {
  type: HealthCheckType;
  path?: string;
  expectedStatus?: number;
  expectedBodyContains?: string;
  intervalMs: number;
  timeoutMs: number;
  failureThreshold: number;
}

/** Restart history entry */
export interface RestartHistoryEntry {
  id: string;
  appId: string;
  attemptedAt: number;
  success: boolean;
  reason: 'crash' | 'start_timeout' | 'health_failure' | 'manual' | 'startup_failure';
  backoffMs?: number;
  error?: string;
}

/** Launch profile for LAN mode */
export interface LaunchProfile {
  args: string[];
  env: EnvVar[];
}

/** Access policy */
export interface AccessPolicy {
  appId: string;
  mode: AccessMode;
  selectedInterface?: string;
  firewallRuleRef?: string;
  lastVerification?: LanVerification;
  lastVerificationAt?: number;
  updatedAt: number;
}

/** Runtime state */
export interface RuntimeState {
  appId: string;
  processState: ProcessState;
  healthState: HealthState;
  pid?: number;
  processStartTime?: number;
  portState: PortState;
  listenerAddress?: string;
  lastHealthCheck?: HealthCheckResult;
  lastError?: string;
  startedAt?: number;
  stoppedAt?: number;
  updatedAt: number;
}

/** Health check result */
export interface HealthCheckResult {
  timestamp: number;
  processAlive: boolean;
  portListening: boolean;
  localResponding: boolean;
  latencyMs?: number;
  details?: string;
}

/** Activity log entry */
export interface ActivityLogEntry {
  id: string;
  appId?: string;
  eventType:
    | 'start'
    | 'stop'
    | 'restart'
    | 'crash'
    | 'health_change'
    | 'lan_enable'
    | 'lan_disable'
    | 'firewall_change'
    | 'error'
    | 'info';
  severity: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

/** Network interface info */
export interface NetworkInterfaceInfo {
  name: string;
  description: string;
  ipv4: string;
  subnet: string;
  prefixLength: number;
  gateway?: string;
  isUp: boolean;
  type: InterfaceType;
  networkProfile: NetworkProfile;
  isRecommended: boolean;
}

/** Port info */
export interface PortInfo {
  port: number;
  state: PortState;
  ownerPid?: number;
  ownerImage?: string;
  ownedByManagedAppId?: string;
  boundAddress: string;
}

/** Diagnostic report */
export interface DiagnosticReport {
  appId: string;
  timestamp: number;
  steps: DiagnosticStep[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    notPerformed: number;
  };
}

/** Diagnostic step */
export interface DiagnosticStep {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skipped' | 'not_performed';
  detail: string;
  suggestedAction?: string;
}

/** Result type for all operations */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

/** Application error */
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** System info */
export interface SystemInfo {
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  isElevated: boolean;
  userDataPath: string;
  lanIp?: string;
  networkProfile?: string;
}

/** Listener info */
export interface ListenerInfo {
  localAddress: string;
  localPort: number;
  pid: number;
  protocol: 'TCP' | 'UDP';
}

/** Process info */
export interface ProcessInfo {
  pid: number;
  startTime: number;
  imageName: string;
  parentPid?: number;
}

/** Resolved executable */
export interface ResolvedExecutable {
  path: string;
  args: string[];
  isCmd: boolean;
}

/** Launch config warning */
export interface LaunchConfigWarning {
  type:
    'metacharacter' | 'privileged_port' | 'relative_path' | 'missing_working_dir' | 'cmd_with_args';
  message: string;
  field: string;
}
