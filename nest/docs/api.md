# API Reference

## IPC Channels

All communication between renderer and main process uses typed IPC channels defined in `src/shared/ipc-contract.ts`.

### Request/Response Pattern

All requests return `Result<T, AppError>`:

```typescript
type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type ErrorCode =
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
```

### Applications

| Channel                 | Request                                                       | Response                |
| ----------------------- | ------------------------------------------------------------- | ----------------------- |
| `apps.list`             | `void`                                                        | `ApplicationConfig[]`   |
| `apps.get`              | `{ id: string }`                                              | `ApplicationConfig`     |
| `apps.create`           | `Omit<ApplicationConfig, 'id' \| 'createdAt' \| 'updatedAt'>` | `ApplicationConfig`     |
| `apps.update`           | `{ id: string, config: Partial<ApplicationConfig> }`          | `ApplicationConfig`     |
| `apps.remove`           | `{ id: string, confirmDeleteFiles?: boolean }`                | `void`                  |
| `apps.start`            | `{ id: string }`                                              | `RuntimeState`          |
| `apps.stop`             | `{ id: string, force?: boolean }`                             | `RuntimeState`          |
| `apps.restart`          | `{ id: string }`                                              | `RuntimeState`          |
| `apps.registerExternal` | `RegisterExternalParams`                                      | `ApplicationConfig`     |
| `apps.lintLaunchConfig` | `{ config: ApplicationConfig }`                               | `LaunchConfigWarning[]` |

#### ApplicationConfig

```typescript
interface ApplicationConfig {
  id: string;
  name: string;
  projectPath: string;
  runtimeLabel?: string;
  executable: string;
  args: string[];
  workingDirectory: string;
  env: EnvVar[];
  protocol: 'http' | 'https';
  port: number;
  expectedListenAddress: 'loopback' | 'all' | 'lan';
  lifecycleMode: 'managed' | 'external';
  startupTimeoutMs: number;
  healthCheck: HealthCheckConfig;
  selectedInterface?: string;
  autoRestartPolicy?: AutoRestartPolicy;
  createdAt: number;
  updatedAt: number;
}

interface EnvVar {
  key: string;
  value: string;
  secret: boolean;
}

interface HealthCheckConfig {
  type: 'tcp' | 'http' | 'none';
  path?: string;
  expectedStatus?: number;
  expectedBodyContains?: string;
  intervalMs: number;
  timeoutMs: number;
  failureThreshold: number;
}

interface AutoRestartPolicy {
  enabled: boolean;
  maxRestarts: number;
  windowMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}
```

#### RegisterExternalParams

```typescript
interface RegisterExternalParams {
  name: string;
  port: number;
  protocol?: 'http' | 'https';
  healthCheck?: HealthCheckConfig;
  selectedInterface?: string;
}
```

### Ports

| Channel               | Request                                            | Response         |
| --------------------- | -------------------------------------------------- | ---------------- |
| `ports.check`         | `{ port: number, host?: string }`                  | `PortInfo`       |
| `ports.suggest`       | `{ preferred?: number, range?: [number, number] }` | `number`         |
| `ports.listListeners` | `void`                                             | `ListenerInfo[]` |

```typescript
interface PortInfo {
  port: number;
  state: PortState;
  ownerPid?: number;
  ownerImage?: string;
  ownedByManagedAppId?: string;
  boundAddress: string;
}

type PortState =
  | 'free'
  | 'occupied_by_managed'
  | 'occupied_by_other'
  | 'listening_loopback'
  | 'listening_all'
  | 'listening_lan'
  | 'unknown';

interface ListenerInfo {
  localAddress: string;
  localPort: number;
  pid: number;
  protocol: 'TCP' | 'UDP';
}
```

### Network

| Channel                   | Request                     | Response                             |
| ------------------------- | --------------------------- | ------------------------------------ |
| `network.listInterfaces`  | `void`                      | `NetworkInterfaceInfo[]`             |
| `network.selectInterface` | `{ interfaceName: string }` | `{ selected: NetworkInterfaceInfo }` |

```typescript
interface NetworkInterfaceInfo {
  name: string;
  description: string;
  ipv4: string;
  subnet: string;
  prefixLength: number;
  gateway?: string;
  isUp: boolean;
  type: 'Ethernet' | 'WiFi' | 'VPN' | 'Virtual' | 'Loopback' | 'Other';
  networkProfile: 'Private' | 'Public' | 'DomainAuthenticated' | 'Unknown';
  isRecommended: boolean;
}
```

### Access (LAN)

| Channel            | Request                                                | Response                                                         |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `access.getStatus` | `{ appId: string }`                                    | `AccessStatus`                                                   |
| `access.enable`    | `{ appId: string, confirmation: string }`              | `{ policy: AccessPolicy; lanUrl: string; verification: string }` |
| `access.disable`   | `{ appId: string, restartWithLocalProfile?: boolean }` | `AccessPolicy`                                                   |

```typescript
interface AccessPolicy {
  appId: string;
  mode: AccessMode;
  selectedInterface?: string;
  firewallRuleRef?: string;
  lastVerification?: LanVerification;
  lastVerificationAt?: number;
  updatedAt: number;
}

type AccessMode =
  'local_only' | 'lan_requested' | 'lan_enabled' | 'lan_unavailable' | 'lan_disabled';

type LanVerification = 'unverified' | 'local_ok' | 'remote_user_confirmed' | 'failed';
```

### Health

| Channel           | Request             | Response            |
| ----------------- | ------------------- | ------------------- |
| `health.checkNow` | `{ appId: string }` | `HealthCheckResult` |

```typescript
interface HealthCheckResult {
  timestamp: number;
  processAlive: boolean;
  portListening: boolean;
  localResponding: boolean;
  latencyMs?: number;
  details?: string;
}
```

### Diagnostics

| Channel           | Request             | Response           |
| ----------------- | ------------------- | ------------------ |
| `diagnostics.run` | `{ appId: string }` | `DiagnosticReport` |

```typescript
interface DiagnosticReport {
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

interface DiagnosticStep {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skipped' | 'not_performed';
  detail: string;
  suggestedAction?: string;
}
```

### Logs

| Channel      | Request           | Response                                         |
| ------------ | ----------------- | ------------------------------------------------ |
| `logs.query` | `LogsQueryParams` | `{ entries: ActivityLogEntry[]; total: number }` |

```typescript
interface LogsQueryParams {
  appId?: string;
  eventType?: string[];
  severity?: string[];
  from?: number;
  to?: number;
  text?: string;
  limit?: number; // default 1000, max 10000
  offset?: number; // default 0
}

interface ActivityLogEntry {
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
```

### Settings

| Channel           | Request             | Response   |
| ----------------- | ------------------- | ---------- |
| `settings.get`    | `void`              | `Settings` |
| `settings.update` | `Partial<Settings>` | `void`     |

```typescript
interface Settings {
  backgroundMode: boolean;
  shutdownPolicy: 'stop_all' | 'keep_running' | 'ask';
  startupAtLogin: boolean;
  defaultAccessPolicy: 'local_only';
  preferredInterface?: string;
  confirmationPreferences: Record<string, boolean>;
  logRetentionDays: number;
  logMaxLinesPerApp: number;
}
```

### System

| Channel       | Request | Response     |
| ------------- | ------- | ------------ |
| `system.info` | `void`  | `SystemInfo` |

```typescript
interface SystemInfo {
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  isElevated: boolean;
  userDataPath: string;
  lanIp?: string;
  networkProfile?: string;
}
```

### Events (Main → Renderer)

Events are pushed via `eventBus.emit()` and subscribed via `nest.on()`/`nest.off()`.

| Event              | Payload                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `app.stateChanged` | `{ appId, processState, healthState, timestamp }`                                            |
| `app.log`          | `ActivityLogEntry`                                                                           |
| `health.changed`   | `{ appId, healthState, result, timestamp }`                                                  |
| `network.changed`  | `{ interfaces: NetworkInterfaceInfo[]; selectedInterface?: string; timestamp }`              |
| `port.conflict`    | `{ appId, port, state, ownerPid, ownerImage, ownedByManagedAppId, boundAddress, timestamp }` |
| `firewall.changed` | `{ appId, oldMode, newMode, timestamp }`                                                     |

### Preload API (`window.nest`)

```typescript
interface NestAPI {
  apps: {
    list: () => Promise<Result<ApplicationConfig[]>>;
    get: (id: string) => Promise<Result<ApplicationConfig>>;
    create: (config) => Promise<Result<ApplicationConfig>>;
    update: (id, config) => Promise<Result<ApplicationConfig>>;
    remove: (id, confirmDeleteFiles?) => Promise<Result<void>>;
    start: (id) => Promise<Result<RuntimeState>>;
    stop: (id, force?) => Promise<Result<RuntimeState>>;
    restart: (id) => Promise<Result<RuntimeState>>;
    registerExternal: (params) => Promise<Result<ApplicationConfig>>;
    lintLaunchConfig: (config) => Promise<Result<LaunchConfigWarning[]>>;
    dummy: (message) => Promise<Result<{ echo: string; timestamp: number }>>;
  };
  ports: {
    check: (port, host?) => Promise<Result<PortInfo>>;
    suggest: (preferred?, range?) => Promise<Result<number>>;
    listListeners: () => Promise<Result<ListenerInfo[]>>;
  };
  network: {
    listInterfaces: () => Promise<Result<NetworkInterfaceInfo[]>>;
    selectInterface: (name) => Promise<Result<{ selected: NetworkInterfaceInfo }>>;
  };
  access: {
    getStatus: (appId) => Promise<Result<AccessStatus>>;
    enable: (
      appId,
      confirmation
    ) => Promise<Result<{ policy: AccessPolicy; lanUrl: string; verification: string }>>;
    disable: (appId, restartWithLocalProfile?) => Promise<Result<AccessPolicy>>;
  };
  health: {
    checkNow: (appId) => Promise<Result<HealthCheckResult>>;
  };
  diagnostics: {
    run: (appId) => Promise<Result<DiagnosticReport>>;
  };
  logs: {
    query: (params) => Promise<Result<{ entries: ActivityLogEntry[]; total: number }>>;
  };
  settings: {
    get: () => Promise<Result<Settings>>;
    update: (params) => Promise<Result<void>>;
  };
  system: {
    info: () => Promise<Result<SystemInfo>>;
  };
  on: <K extends EventChannelName>(channel: K, callback: (payload) => void) => () => void;
  off: <K extends EventChannelName>(channel: K, callback: (payload) => void) => void;
}
```

### Error Codes

| Code                     | HTTP-like | Description                         |
| ------------------------ | --------- | ----------------------------------- |
| `VALIDATION`             | 400       | Input validation failed             |
| `NOT_FOUND`              | 404       | Resource not found                  |
| `PORT_IN_USE`            | 409       | Port already in use                 |
| `SPAWN_FAILED`           | 500       | Failed to spawn process             |
| `START_TIMEOUT`          | 408       | Startup timeout exceeded            |
| `ALREADY_RUNNING`        | 409       | App already running                 |
| `NOT_OWNED`              | 403       | PID ownership verification failed   |
| `ELEVATION_DENIED`       | 403       | UAC elevation declined              |
| `FIREWALL_FAILED`        | 500       | Firewall operation failed           |
| `POLICY_BLOCKED`         | 403       | Security policy blocks action       |
| `NETWORK_PROFILE_PUBLIC` | 403       | Active network is Public            |
| `LOOPBACK_ONLY`          | 400       | App only listening on loopback      |
| `UNSUPPORTED_OPERATION`  | 405       | Operation not supported (e.g., UDP) |
| `INTERNAL`               | 500       | Internal error                      |
