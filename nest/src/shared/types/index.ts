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

/** Binding class for a port listener */
export type BindingClass = 'loopback_only' | 'all_interfaces' | 'specific_lan' | 'not_listening';

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
  lanLaunchProfile?: LaunchProfile;
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

/** Firewall rule */
export interface FirewallRule {
  name: string;
  displayName: string;
  description: string;
  group: string;
  enabled: boolean;
  action: 'Allow' | 'Block';
  direction: 'Inbound' | 'Outbound';
  protocol: 'TCP' | 'UDP';
  localPort: number;
  remoteAddress: string;
  profile: 'Private' | 'Public' | 'Domain';
}

/** Firewall operation result */
export interface FirewallOperationResult {
  success: boolean;
  ruleName?: string;
  message?: string;
  error?: string;
}

/** Firewall reconciliation result */
export interface FirewallReconcileResult {
  success: boolean;
  orphaned: FirewallRule[];
  missing: Array<{
    name: string;
    displayName: string;
    protocol: 'TCP' | 'UDP';
    localPort: number;
    remoteAddress: string;
    profile: 'Private' | 'Public' | 'Domain';
  }>;
  error?: string;
}

/** Privileged operation types */
export type PrivilegedOperationType =
  | 'firewall_add'
  | 'firewall_remove'
  | 'firewall_reconcile'
  | 'process_terminate'
  | 'lan_enable'
  | 'lan_disable'
  | 'elevation_request';

/** Privileged operation outcome */
export type PrivilegedOperationOutcome =
  | 'success'
  | 'failed'
  | 'elevation_denied'
  | 'policy_blocked'
  | 'execution_policy_restricted'
  | 'hash_mismatch'
  | 'rule_disabled_by_admin'
  | 'rule_exists_disabled'
  | 'internal_error';

/** Audit entry for privileged operations */
export interface AuditEntry {
  id: string;
  timestamp: number;
  operationType: PrivilegedOperationType;
  appId?: string;
  appName?: string;
  outcome: PrivilegedOperationOutcome;
  osErrorText?: string;
  details: Record<string, unknown>;
  requiresElevation: boolean;
  wasElevated: boolean;
}

/** Audit query parameters */
export interface AuditQueryParams {
  appId?: string;
  operationType?: PrivilegedOperationType;
  outcome?: PrivilegedOperationOutcome;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

/** Audit query result */
export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
}

/** Launch config warning */
export interface LaunchConfigWarning {
  type:
    'metacharacter' | 'privileged_port' | 'relative_path' | 'missing_working_dir' | 'cmd_with_args';
  message: string;
  field: string;
}

/** Step status for the 10-step workflow */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Step 1: Preconditions check result */
export interface PreconditionsCheck {
  step: 1;
  name: 'Preconditions';
  status: StepStatus;
  details: {
    appRegistered: boolean;
    interfaceSelected: boolean;
    networkProfilePrivate: boolean;
    networkProfile: string;
  };
  error?: string;
}

/** Step 2: Binding check result */
export interface BindingCheck {
  step: 2;
  name: 'Binding Check';
  status: StepStatus;
  details: {
    bindingClass: 'loopback_only' | 'all_interfaces' | 'specific_lan' | 'not_listening';
    listenerAddress?: string;
    port: number;
    lanLaunchProfileAvailable: boolean;
    isExternal: boolean;
  };
  actionRequired?: 'none' | 'lanLaunchProfileRestart' | 'manualConfig';
  error?: string;
}

/** Step 3: Change Plan */
export interface ChangePlan {
  step: 3;
  name: 'Change Plan';
  status: StepStatus;
  details: {
    selectedInterface: string;
    selectedIp: string;
    port: number;
    proposedFirewallRule: {
      name: string;
      displayName: string;
      port: number;
      protocol: 'TCP';
      remoteAddress: string;
      profile: 'Private';
      group: 'NEST';
    };
    needsRestart: boolean;
    needsElevation: boolean;
    riskNotes: string[];
  };
  error?: string;
}

/** Step 4: User Confirmation */
export interface UserConfirmation {
  step: 4;
  name: 'User Confirmation';
  status: StepStatus;
  details: {
    confirmed: boolean;
    confirmationText: string;
    checkboxChecked: boolean;
  };
  error?: string;
}

/** Step 5: Apply Changes */
export interface ApplyChanges {
  step: 5;
  name: 'Apply Changes';
  status: StepStatus;
  details: {
    restartPerformed?: boolean;
    firewallRuleAdded: boolean;
    ruleName?: string;
    readbackVerified: boolean;
  };
  error?: string;
}

/** Step 6: Local Verification */
export interface LocalVerification {
  step: 6;
  name: 'Local Verification';
  status: StepStatus;
  details: {
    localReachable: boolean;
    latencyMs?: number;
    lastVerification?: 'local_ok';
  };
  error?: string;
}

/** Step 7: Remote Verification */
export interface RemoteVerification {
  step: 7;
  name: 'Remote Verification';
  status: StepStatus;
  details: {
    qrCodeUrl?: string;
    lanUrl: string;
    confirmed: boolean;
    verification?: 'unverified' | 'local_ok' | 'remote_user_confirmed' | 'failed';
  };
  error?: string;
}

/** Step 8: Persist Policy */
export interface PersistPolicy {
  step: 8;
  name: 'Persist Policy';
  status: StepStatus;
  details: {
    policyMode: 'lan_enabled';
    firewallRuleRef: string;
    lastVerification: 'local_ok';
    lastVerificationAt: number;
  };
  error?: string;
}

/** Step 9: Disable (Rollback) */
export interface DisableRollback {
  step: 9;
  name: 'Disable / Rollback';
  status: StepStatus;
  details: {
    firewallRuleRemoved: boolean;
    ruleName?: string;
    readbackVerified: boolean;
    policyRestored: boolean;
    restartWithLocalProfile?: boolean;
  };
  error?: string;
}

/** Step 10: Reconciliation */
export interface Reconciliation {
  step: 10;
  name: 'Reconciliation';
  status: StepStatus;
  details: {
    policyReconciled: boolean;
    firewallRuleReconciled: boolean;
    listenerReconciled: boolean;
  };
  error?: string;
}

/** Union of all step types */
export type WorkflowStep =
  | PreconditionsCheck
  | BindingCheck
  | ChangePlan
  | UserConfirmation
  | ApplyChanges
  | LocalVerification
  | RemoteVerification
  | PersistPolicy
  | DisableRollback
  | Reconciliation;

/** Access workflow status */
export interface AccessWorkflowStatus {
  appId: string;
  currentStep: number;
  steps: WorkflowStep[];
  completed: boolean;
  error?: string;
}

/** Workflow request/response types */
export interface AccessWorkflowStartRequest {
  appId: string;
}

export interface AccessWorkflowStepRequest {
  appId: string;
  step: number;
  payload?: Record<string, unknown>;
}

export interface AccessWorkflowStepResponse {
  step: WorkflowStep;
  nextStep?: number;
  workflow: AccessWorkflowStatus;
}

export interface AccessWorkflowStatusRequest {
  appId: string;
}
