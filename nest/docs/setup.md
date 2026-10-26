# Setup Guide

## System Requirements

- **OS**: Windows 10/11 (primary), macOS 13+, Linux (experimental)
- **Runtime**: Node.js 20+, Electron 28+
- **Database**: SQLite (embedded, no external dependency)
- **Privileges**: Standard user (no admin required for normal operation)

## Installation

### From Source

```bash
# Clone repository
git clone https://github.com/yourusername/nest.git
cd nest

# Install dependencies
npm install

# Start development
npm run dev
```

### Building Installer

```bash
# Production build
npm run build

# Create Windows installer (NSIS)
npm run make
```

Output: `out/make/squirrel.windows/x64/`

## Configuration

### Settings Location

Windows: `%APPDATA%\nest\`

- `nest.db` - SQLite database
- `logs/` - Application logs

### Settings Schema

```json
{
  "backgroundMode": true,
  "shutdownPolicy": "ask",
  "startupAtLogin": false,
  "preferredInterface": null,
  "confirmationPreferences": {},
  "logRetentionDays": 30,
  "logMaxLinesPerApp": 5000
}
```

## First Run

1. Launch NEST
2. Click **"Register Application"**
3. Follow the 6-step wizard:
   - **Mode**: Managed (NEST launches) or External (already running)
   - **Basics**: Name, project folder
   - **Launch**: Runtime preset, executable, args, working directory, env vars
   - **Port & Protocol**: Port number, HTTP/HTTPS
   - **Health Check**: TCP, HTTP, or None
   - **Review**: Configuration warnings, save

## Managing Applications

### Dashboard

- **Summary tiles**: Total, Running, Stopped, Errors, LAN-enabled, Conflicts
- **App cards**: Name, runtime label, process state, health, port, URLs
- **Actions**: Start/Stop/Restart, Open browser, Copy URL, Details, Logs, Remove

### Process States

| State        | Meaning                             |
| ------------ | ----------------------------------- |
| `registered` | Configured, not started             |
| `starting`   | Launching, waiting for health check |
| `running`    | Process alive                       |
| `stopping`   | Graceful shutdown in progress       |
| `stopped`    | Stopped cleanly                     |
| `failed`     | Crashed or health check failed      |
| `external`   | Registered but not managed by NEST  |
| `unknown`    | State unknown (recovery)            |

### Health States

| State            | Meaning                                             |
| ---------------- | --------------------------------------------------- |
| `healthy`        | Process alive, port listening, health check passing |
| `unhealthy`      | Any check failing                                   |
| `checking`       | Initial health check in progress                    |
| `unknown`        | Not yet checked                                     |
| `not_applicable` | No health check configured                          |

## Network & LAN Access

### Default: Local Only

All applications bind to `127.0.0.1` only. No firewall rules created.

### Enabling LAN Access

1. Go to **Network** tab
2. Select a **Private** network interface
3. On app card, click **"Enable LAN"**
4. Confirm the firewall rule creation
5. NEST creates a Windows Firewall rule scoped to the selected subnet

### Network Profiles

| Profile | LAN Access                  |
| ------- | --------------------------- |
| Private | Allowed (with confirmation) |
| Public  | Blocked                     |
| Domain  | Allowed (with confirmation) |

### Firewall Rules

- Created in **Windows Defender Firewall with Advanced Security**
- Group: `NEST`
- Name prefix: `NEST-`
- Scoped to selected subnet only
- Removed when LAN disabled

## Health Checks

### Types

| Type   | Description                                |
| ------ | ------------------------------------------ |
| `none` | No check, assume healthy if port listening |
| `tcp`  | TCP connect to port                        |
| `http` | HTTP GET with optional status/body check   |

### Configuration

```json
{
  "type": "http",
  "path": "/health",
  "expectedStatus": 200,
  "expectedBodyContains": "ok",
  "intervalMs": 30000,
  "timeoutMs": 5000,
  "failureThreshold": 3
}
```

### Failure Threshold

- Consecutive failures before marking `unhealthy`
- Default: 3
- Single slow response doesn't flip state
- Backoff applied when unhealthy

## Auto-Restart Policy

### Configuration (per app)

```json
{
  "enabled": false,
  "maxRestarts": 3,
  "windowMs": 300000,
  "backoffBaseMs": 1000,
  "backoffMaxMs": 60000
}
```

### Behavior

- Only on crash/startup_failure/health_failure (never START_TIMEOUT)
- Exponential backoff: `baseMs * 2^(attempt-1)` capped at `backoffMaxMs`
- Rate limited: max N restarts in windowMs
- Success resets counter and backoff
- Logged each decision

## Diagnostics

Run from **Diagnostics** tab:

1. Select application
2. Click **Run Diagnostics**
3. View per-step results with suggested actions

### Steps (1-4 from brief)

1. **Process Running** - PID exists, start time matches
2. **Port Listening** - TCP listener on configured port
3. **Listener Address** - Binding class (loopback/all/LAN)
4. **Local HTTP Response** - HTTP check if configured

### Statuses

| Status          | Meaning                               |
| --------------- | ------------------------------------- |
| `pass`          | Check succeeded                       |
| `fail`          | Check failed                          |
| `skipped`       | Check configured but not applicable   |
| `not_performed` | Check not applicable (not configured) |

## Logs

### Features

- **Ring buffer**: 5000 lines/app (configurable)
- **File logging**: `logs/<appId>/app.log` (10MB, 5 files)
- **Redaction**: Bearer tokens, passwords, tokens, secrets, API keys
- **Filters**: App, event type, severity, time range, text search
- **Pagination**: Limit/offset
- **Live tail**: WebSocket push (100ms batch)
- **Export**: Copy/export redacted

### Log Entry

```json
{
  "id": "uuid",
  "appId": "uuid",
  "eventType": "start|stop|restart|crash|health_change|...",
  "severity": "debug|info|warn|error",
  "message": "string",
  "details": {},
  "timestamp": 1234567890
}
```

## Diagnostics Service (Steps 1-4)

### Step 1: Process Running

- **Pass**: PID exists, start time matches
- **Fail**: PID missing, start time mismatch, or process not running
- **Action**: Start the application

### Step 2: Port Listening

- **Pass**: TCP listener on configured port
- **Fail**: Port not listening
- **Action**: Check if application started correctly

### Step 3: Listener Address

- **Pass**: Listening on 0.0.0.0, ::, or LAN IP
- **Fail**: Listening on 127.0.0.1/::1 only (loopback_only)
- **Action**: Configure app to listen on 0.0.0.0 or specific LAN IP

### Step 4: Local HTTP Response

- **Pass**: HTTP check passes (status, optional body marker)
- **Fail**: HTTP check fails (timeout, wrong status, body mismatch)
- **Action**: Check application logs for errors

### Report Structure

```typescript
interface DiagnosticReport {
  appId: string;
  timestamp: number;
  steps: DiagnosticStep[];
  summary: { passed: number; failed: number; skipped: number; notPerformed: number };
}

interface DiagnosticStep {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skipped' | 'not_performed';
  detail: string;
  suggestedAction?: string;
}
```

## Logs Page

### Features

- **Filters**: App ID, event type, severity, time range, text search
- **Pagination**: Limit (default 500, max 10000), offset
- **Live tail**: WebSocket push, batched 100ms
- **Export**: Copy to clipboard, download as JSON/CSV
- **Redaction**: Automatic at writer boundary

### API

```typescript
nest.logs.query({
  appId?: string;
  eventType?: string[];
  severity?: string[];
  from?: number; // timestamp
  to?: number;
  text?: string;
  limit: number; // max 10000
  offset: number;
})
```

## Project Details Page

### Sections

1. **Config** - All registered config (executable, args, env, port, etc.)
2. **State Timeline** - Process state transitions with timestamps
3. **Health History** - Chart of health checks over time
4. **Port State** - Current listener binding class
5. **Diagnostics Button** - Run full diagnostic suite

## Troubleshooting

### Common Issues

| Issue              | Solution                                                 |
| ------------------ | -------------------------------------------------------- |
| App won't start    | Check executable path, working directory, port conflicts |
| Health check fails | Verify path, expected status, body marker                |
| LAN not working    | Check network profile (must be Private), firewall rule   |
| Port conflict      | Use `nest ports.suggest()` or change app port            |
| Logs not appearing | Check log retention, ring buffer size                    |

### Logs Location

- **Database**: `%APPDATA%\nest\nest.db`
- **Log files**: `%APPDATA%\nest\logs\<appId>\app.log`

### Reset

```bash
# Delete database and logs
rm %APPDATA%\nest\nest.db
rm -r %APPDATA%\nest\logs
```

## Development

### Project Structure

```
src/
├── main/
│   ├── index.ts              # Entry point, window, tray
│   ├── ipc/register.ts       # IPC handlers
│   ├── db/index.ts            # Database + repositories
│   ├── services/
│   │   ├── application-manager/
│   │   ├── health-monitor/
│   │   ├── port-manager/
│   │   ├── network-manager/
│   │   ├── security-policy/
│   │   ├── diagnostics/
│   │   └── logging/
│   └── os/os-adapter.ts       # OS abstraction
├── preload/index.ts           # contextBridge
├── renderer/
│   ├── features/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── network/
│   │   ├── logs/
│   │   ├── settings/
│   │   └── diagnostics/
│   ├── components/
│   ├── hooks/
│   └── lib/ipc.ts
└── shared/
    ├── types/index.ts
    ├── schemas/index.ts
    └── ipc-contract.ts
```

### Testing

```bash
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
```

### Code Quality

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript strict mode
npm run format        # Prettier
```

## License

MIT
