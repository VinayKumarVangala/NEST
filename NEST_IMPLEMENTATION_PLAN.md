# NEST — Agentic Implementation Plan

> **NEST: Host on your network.** Windows-first Electron desktop app that registers, launches, supervises and (explicitly, safely) exposes local dev apps to the LAN.
>
> **How to use this file:** Feed it to your agentic IDE (Claude Code, Cursor, Windsurf, Copilot Agent, etc.). Put Sections 0–3 in the project rules file (`CLAUDE.md` / `.cursorrules` / `AGENTS.md`). Then execute the prompts in Section 4+ **one at a time, in order**. Do not start a prompt until the previous one's acceptance checks pass.

---

## 0. Source of Truth & Non-Negotiable Rules

The project brief (`NesT.md`) is the product spec. This plan is the execution spec. If they conflict, stop and ask; do not guess.

### 0.1 Fixed stack (do not substitute)

| Layer | Choice |
|---|---|
| Desktop runtime | Electron (main + sandboxed renderer + preload) |
| Frontend | React + TypeScript + Tailwind CSS |
| Backend (in main process) | Node.js + TypeScript |
| DB | SQLite via `better-sqlite3` |
| Validation | Zod (every IPC payload, every config object) |
| Tests | Vitest (unit/integration), Playwright (Electron UI) |
| Packaging | Electron Forge (Windows installer) |
| Windows firewall | Windows Defender Firewall with Advanced Security, via a **controlled PowerShell helper** |

### 0.2 Hard security invariants (every prompt must respect these)

1. Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer talks to main only through a **preload-exposed, Zod-validated, allow-listed IPC API**.
2. **Never** build shell command strings from user input. Commands = `executable` + `args[]`, stored separately, spawned with `shell: false` (see 0.4 for `.cmd` handling).
3. Default access policy is **Local only**. No firewall rule is ever created without explicit user confirmation.
4. Never disable Windows Firewall. Never touch rules not owned by NEST (all NEST rules use group `NEST` and name prefix `NEST-`).
5. Elevation only for the specific firewall operation, via a fixed operation set (not generic PowerShell execution).
6. NEST's own management surface is **never** network-reachable (no HTTP server for admin; IPC only).
7. Never kill a process by name or by project-directory match. Only kill processes NEST spawned (verified by PID + start-time) and their descendants.
8. UI must never claim a state that was not observed (Running ≠ Healthy ≠ Reachable ≠ LAN-verified).
9. Never log secrets (env values flagged secret, tokens, passwords). Redact at the log-writer boundary.
10. Never show success when a privileged/OS operation failed.

### 0.3 State vocabulary (use exactly these)

- **Process state:** `registered | starting | running | stopping | stopped | failed | external | unknown`
- **Health state:** `healthy | unhealthy | checking | unknown | not_applicable`
- **Port state:** `free | occupied_by_managed | occupied_by_other | listening_loopback | listening_all | listening_lan | unknown`
- **Access policy:** `local_only | lan_requested | lan_enabled | lan_unavailable | lan_disabled`
- **LAN verification:** `unverified | local_ok | remote_user_confirmed | failed` (**never** `verified` from local checks alone)

### 0.4 Known platform pitfalls (agent must handle, not rediscover)

- **`.cmd`/`.bat` spawn with `shell:false`:** Since Node security releases (CVE-2024-27980), spawning `npm.cmd` etc. without a shell throws `EINVAL`. The brief's `spawn("npm.cmd", …, {shell:false})` example will fail. Resolution strategy, in order: (a) resolve the real `.exe`/`.js` entry (e.g. run `node <npm-cli.js> run dev`); (b) if a `.cmd` must run, spawn `cmd.exe` with `["/d","/s","/c", <cmd>, ...args]`, **after** rejecting any argument containing cmd metacharacters (`& | < > ^ % ! "` and newlines) and proper quoting. Centralize this in one `resolveLaunch()` function with tests.
- **Process-tree kill on Windows:** `child.kill()` does not kill grandchildren. Use `taskkill /PID <pid> /T` (graceful) then `/F` as controlled fallback, only for verified NEST-owned PIDs. Consider Job Objects later; not in v1.
- **PID reuse:** Persist `pid` + `process_start_time`. On startup recovery, treat a PID as ours only if start time matches.
- **better-sqlite3 is a native module:** Needs Electron-ABI rebuild; configure Forge's auto-unpack-natives / `@electron/rebuild`.
- **Firewall profile:** Rules scoped to `Private` profile only. If the active network category is `Public`, refuse automatic exposure and explain.
- **Binding to `0.0.0.0` ≠ LAN-only.** Firewall rule must restrict `RemoteAddress` to the selected subnet (or `LocalSubnet`).
- **Loopback-only listener:** Firewall changes cannot fix it. Detect via `Get-NetTCPConnection -State Listen` `LocalAddress` (`127.0.0.1`/`::1` vs `0.0.0.0`/`::`/LAN IP).

---

## 1. Target Repository Structure

```text
nest/
├─ AGENTS.md                      # rules from Section 0–3 (agent context)
├─ package.json
├─ forge.config.ts
├─ vite.main.config.ts / vite.preload.config.ts / vite.renderer.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ src/
│  ├─ shared/                     # ZERO Node/Electron imports; used by main + renderer
│  │  ├─ types/                   # domain types & enums (Section 0.3)
│  │  ├─ schemas/                 # Zod schemas (single source of truth)
│  │  └─ ipc-contract.ts          # channel names + request/response schemas
│  ├─ main/
│  │  ├─ index.ts                 # app bootstrap, window, tray
│  │  ├─ ipc/                     # handlers (validate -> call service -> return Result)
│  │  ├─ db/                      # connection, migrations, repositories
│  │  ├─ services/
│  │  │  ├─ application-manager/  # lifecycle, launch resolution, supervision
│  │  │  ├─ port-manager/
│  │  │  ├─ network-manager/
│  │  │  ├─ health-monitor/
│  │  │  ├─ security-policy/
│  │  │  ├─ diagnostics/
│  │  │  └─ logging/
│  │  ├─ os/
│  │  │  ├─ os-adapter.ts         # interface (platform-neutral; Linux later)
│  │  │  └─ windows/              # WindowsAdapter: processes, ports, interfaces, firewall
│  │  └─ events/                  # typed event bus (main -> renderer push)
│  ├─ preload/index.ts            # contextBridge: exposes typed `window.nest`
│  └─ renderer/                   # React app
│     ├─ app/ (routes, layout)
│     ├─ features/ (dashboard, projects, network, logs, settings, diagnostics)
│     ├─ components/
│     └─ lib/ (ipc client, query hooks, store)
├─ resources/ (icons, firewall helper scripts)
├─ tests/
│  ├─ unit/  ├─ integration/  ├─ e2e/
│  └─ fixtures/test-apps/         # controlled test servers (Node, Python, loopback-only, slow-start, crashy, child-spawning)
└─ docs/
```

**Key architectural rule:** all OS-specific code lives behind `OsAdapter` (interface in `os-adapter.ts`, implementation in `os/windows/`). Services depend on the interface, never on `windows/` directly. This is what enables Linux later.

---

## 2. Data Flow & Integration Map

```text
React UI ──(window.nest.*, typed)──► preload ──(ipcRenderer.invoke, Zod-checked)──► IPC handlers
                                                                                       │
                                  ┌────────────────────────────────────────────────────┤
                                  ▼                                                    ▼
                         ApplicationManager ◄──events──► HealthMonitor        SecurityPolicyManager
                          │  │   │                           │                         │
              PortManager◄┘  │   └► LogService ◄─────────────┘                         │
                          │  ▼                                                          ▼
                          │ OsAdapter (Windows) ◄── NetworkManager ◄── Diagnostics ── FirewallManager
                          ▼                                                          (elevated helper)
                      Repositories ──► SQLite
Events (main ► renderer): app.stateChanged, app.log, health.changed, network.changed, port.conflict, firewall.changed
```

**Integration contracts to keep stable across phases**

- Every IPC handler returns `Result<T, AppError>` (`{ok:true,data}` | `{ok:false,error:{code,message,details?}}`). No thrown errors cross IPC.
- Every service method that touches the OS returns observed facts, never assumed ones.
- State changes are written to DB **and** emitted as events; the renderer subscribes, never polls blindly.
- Startup recovery order: open DB → run migrations → load apps → reconcile runtime state with OS (PID+start-time, listeners) → start monitors → show window.

---

## 3. Working Agreement for the Agent

For **every** prompt below:

1. Read `AGENTS.md` and Section 0 first. Restate which invariants apply.
2. Plan briefly, then implement in small commits (conventional commits: `feat(port-manager): …`).
3. Write/extend tests in the same step; run `npm run typecheck && npm run lint && npm test` and fix failures.
4. Do not add dependencies beyond the fixed stack without justification noted in the commit message.
5. Do not implement features from later phases. If a later-phase hook is needed, define the interface only.
6. End with a **Completion report**: files changed, tests added, acceptance checks (pass/fail), open issues. Never claim a check passed unless run.
7. If a requirement is ambiguous or conflicts with an invariant, stop and ask.

---

## 4. Phase 0 — Project Bootstrap & Contracts

### Prompt 0.1 — Scaffold

```text
Create the NEST project: Electron + Vite + React + TypeScript + Tailwind, using Electron Forge's Vite+TypeScript template. Windows is the only target.

Requirements:
- Folder structure exactly as in Section 1 of NEST_IMPLEMENTATION_PLAN.md (empty modules with index.ts placeholders are fine).
- BrowserWindow with contextIsolation:true, nodeIntegration:false, sandbox:true, webSecurity on, a strict CSP via meta/headers (no remote scripts), and navigation/new-window blocking (open external links via shell.openExternal only for http/https and only on explicit user action).
- A preload script that exposes `window.nest` via contextBridge (empty typed API for now).
- Scripts: dev, build, typecheck, lint (ESLint + typescript-eslint), format (Prettier), test (Vitest), test:e2e (Playwright), make (Forge).
- Path aliases: @shared, @main, @renderer.
- Configure better-sqlite3 for Electron (auto-unpack natives / electron-rebuild) and prove it loads in the main process.
- Write AGENTS.md containing Sections 0–3 of the plan.

Acceptance: `npm run dev` opens a window showing "NEST"; `npm run typecheck`, `lint`, `test` pass; a smoke test proves better-sqlite3 opens an in-memory DB inside Electron main; renderer cannot access `require`/`process` (add a Playwright test asserting `typeof require === "undefined"` in the page).
```

### Prompt 0.2 — Shared types, Zod schemas, IPC contract

```text
In src/shared, define the domain contract (no Node/Electron imports allowed here; add an ESLint restriction).

1. Types/enums for: ProcessState, HealthState, PortState, AccessMode, LanVerification (exact values from Section 0.3).
2. Zod schemas:
   - ApplicationConfig: id (uuid), name (1–80 chars), projectPath, runtimeLabel?, executable, args: string[], workingDirectory, env: {key, value, secret:boolean}[], protocol: 'http'|'https', port (1–65535, reject <1024 with a warning flag, not an error), expectedListenAddress: 'loopback'|'all'|'specific', lifecycleMode: 'managed'|'external', startupTimeoutMs, healthCheck: {type:'tcp'|'http'|'none', path?, expectedStatus?, expectedBodyContains?, intervalMs, timeoutMs, failureThreshold}.
   - Validation rules: executable must be an absolute path or a bare name resolvable on PATH; args must not contain NUL/newline; workingDirectory must exist and be a directory (check done in service, schema only checks shape); env keys match /^[A-Za-z_][A-Za-z0-9_]*$/.
   - AccessPolicy, RuntimeState, ActivityLogEntry, NetworkInterfaceInfo, PortInfo, DiagnosticReport.
3. `Result<T>` and `AppError` with a closed set of error codes (VALIDATION, NOT_FOUND, PORT_IN_USE, SPAWN_FAILED, START_TIMEOUT, ALREADY_RUNNING, NOT_OWNED, ELEVATION_DENIED, FIREWALL_FAILED, POLICY_BLOCKED, NETWORK_PROFILE_PUBLIC, LOOPBACK_ONLY, UNSUPPORTED_OPERATION, INTERNAL).
4. ipc-contract.ts: a typed map of channel name -> {request schema, response schema}. Channels (initial): apps.list/get/create/update/remove, apps.start/stop/restart, apps.registerExternal, ports.check/suggest/listListeners, network.listInterfaces/selectInterface, access.enable/disable/getStatus, health.checkNow, diagnostics.run, logs.query, settings.get/update, system.info. Event channels (main->renderer): app.stateChanged, app.log, health.changed, network.changed, port.conflict, firewall.changed.

Acceptance: unit tests for every schema with valid + invalid cases (shell-metacharacter-laden args are allowed in args[] but flagged by a separate `lintLaunchConfig()` function that returns warnings); a type-level test that the IPC contract and the preload API stay in sync.
```

### Prompt 0.3 — IPC plumbing (generic, reused everywhere)

```text
Implement the IPC layer:
- main/ipc/register.ts: `registerHandler(channel, handler)` that parses the request with the contract's Zod schema, rejects invalid input with a VALIDATION error, validates `event.senderFrame` origin is the app's own renderer, calls the handler, wraps exceptions into Result errors, and validates the response in dev mode.
- preload: generate `window.nest` from the contract — each method is `invoke(channel, payload)`; event subscription helpers `on(channel, cb)` returning an unsubscribe function. Do NOT expose ipcRenderer itself.
- renderer/lib/ipc.ts: typed client + a React hook `useIpcQuery` / `useIpcMutation` (use TanStack Query) and `useNestEvent(channel, cb)`.
- Typed event bus in main/events used by services to push events to all windows.

Acceptance: integration test calling a dummy channel through the real preload in Playwright; invalid payload returns VALIDATION; renderer has no access to ipcRenderer.
```

---

## 5. Phase 1 — Desktop Foundation

**Goal:** register projects, launch/stop them in the background, capture logs, no LAN anything.

### Prompt 1.1 — SQLite schema, migrations, repositories

```text
Implement main/db with better-sqlite3 (WAL mode, foreign_keys ON). DB file in app.getPath('userData').

Tables (see brief §10): applications, runtime_state, access_policies, activity_logs, settings (key/value JSON), schema_migrations.
- Migration runner: ordered numbered SQL migrations, transactional, idempotent, version-recorded.
- Repositories (typed, parameterized queries only, no string interpolation): ApplicationRepository, RuntimeStateRepository, AccessPolicyRepository, ActivityLogRepository, SettingsRepository.
- Secrets: env vars flagged `secret` are stored via Electron `safeStorage` encryption (base64 ciphertext); never plaintext in DB; repository returns them decrypted only to the ApplicationManager launch path, and redacted ('••••') to the renderer.
- Defaults: access policy row created with mode `local_only` on app creation. Default setting `defaultAccessPolicy = local_only` (not user-changeable to anything broader than `local_only` in v1 UI, per brief §6.11).

Acceptance: Vitest tests using a temp DB: migration up from empty; CRUD round-trips; deleting an application cascades runtime/policy rows but never touches files; secret env values are not present in raw DB bytes (test greps the file).
```

### Prompt 1.2 — OsAdapter interface + Windows process primitives

```text
Define `OsAdapter` in main/os/os-adapter.ts (platform-neutral):
- resolveExecutable(nameOrPath): Promise<ResolvedExecutable | null>
- spawnProcess(spec): { pid, startTime, child }  (shell:false, windowsHide:true, stdio pipes)
- getProcessInfo(pid): { exists, startTime?, imageName?, parentPid? } | null
- listChildProcesses(pid): ProcessInfo[]  (descendants)
- terminateProcessTree(pid, {graceful:boolean}): Result
- listTcpListeners(): ListenerInfo[] ({localAddress, localPort, pid})
- getNetworkInterfaces(), getNetworkProfile(interfaceId)  (stubs now, implemented in Phase 3)
- firewall.* (interface only; implemented in Phase 3)

Implement WindowsAdapter for the process primitives now:
- `resolveLaunch()` following Section 0.4 (.cmd handling, PATH/PATHEXT resolution, absolute-path preference). Heavily unit-test, including args with spaces, quotes, `&`, `%`, unicode; metacharacters must be rejected for .cmd/.bat routes.
- Process start time + descendants via PowerShell `Get-CimInstance Win32_Process` (fixed script, parameters passed as validated integers, never string-concatenated user input) or equivalent safe API.
- terminateProcessTree: graceful `taskkill /PID <pid> /T`, then forced `/F /T` only if requested and only for PIDs passed in (the manager guarantees ownership).

Acceptance: integration tests with fixture apps: a Node server that spawns a child server (tree kill kills both), a process that ignores graceful termination (force path works), and an unrelated sibling process with the same image name that must survive.
```

### Prompt 1.3 — ApplicationManager (lifecycle & supervision)

```text
Implement services/application-manager:

State machine (enforce legal transitions; illegal ones throw INTERNAL and are tested):
registered → starting → running | failed ; running → stopping → stopped ; running → failed (crash) ; any → unknown (recovery) ; external for lifecycleMode=external.

start(appId):
 1. Load config; validate with Zod + filesystem checks (workingDirectory exists, executable resolves).
 2. Refuse if already running/starting (ALREADY_RUNNING).
 3. (Phase 2 plugs in the port pre-check here via an injected `PortGuard`; for now a no-op interface.)
 4. Spawn via OsAdapter. Record pid+startTime in runtime_state. State=`starting`.
 5. Pipe stdout/stderr line-by-line into LogService (ring buffer in memory + persisted summary); redact secrets.
 6. Promote to `running` ONLY after: process still alive AND (if healthCheck != none) the first health check passes, or (if none) the configured port is listening. Otherwise on startupTimeoutMs → `failed` with START_TIMEOUT and terminate the tree.
 7. On `exit`: record exit code/signal; `stopping` → `stopped`, unexpected → `failed` with lastError; emit app.stateChanged.
stop(appId): verify ownership (pid+startTime match) else NOT_OWNED; graceful tree termination, wait up to N seconds, force fallback, confirm process gone, state `stopped`.
restart(appId): stop then start; single-flight per app (per-app mutex; concurrent calls coalesce or reject).
Concurrency: per-app mutex, no global lock.
Shutdown hook (`before-quit`): implement the user's choice policy from settings: `stop_all | keep_running | ask`. For `keep_running`, record pids so recovery can re-adopt them (state `unknown`→verified `running` by pid+start time).

Acceptance (integration, using fixture apps): start/stop/restart; startup timeout; immediate crash; crash after running; child-spawning app fully stopped; double-start rejected; stopping an app never kills the unrelated same-named process; state never `running` before verification.
```

### Prompt 1.4 — LogService

```text
Implement services/logging: structured app-event logging (ActivityLogRepository) + per-app output capture (bounded ring buffer, default 5,000 lines/app, plus optional rolling file under userData/logs/<appId>/ with size cap).
- Redaction at the writer: any env value flagged secret, plus patterns (Bearer tokens, `password=`, `token=`, `secret=`) replaced with ••••.
- `logs.query` IPC supports filters: appId, eventType, severity, time range, text search, pagination.
- Retention job: prune by configured days on startup and daily.
- Push `app.log` events to the renderer with backpressure (batch every 100ms).

Acceptance: tests for redaction, ring-buffer bound, retention pruning, and that high-volume output doesn't block the main process (stress test 50k lines).
```

### Prompt 1.5 — Frontend shell, Dashboard, Registration Wizard

```text
Build the renderer UI (React + Tailwind, accessible, keyboard navigable, dark/light via system).

Layout: sidebar (Dashboard | Projects | Network | Logs | Settings), top bar with NEST wordmark.

Dashboard (brief §6.1): summary tiles (total, running, stopped, errors, LAN-enabled count, current LAN IP [placeholder until Phase 3], network profile [placeholder], conflicts/warnings) and app cards: name, runtime label, process-state badge, health badge, port, local URL, LAN URL (hidden until enabled), last health result. Card actions: Start/Stop/Restart, Open in browser, Copy local URL, Details, Logs, Remove registration (confirm dialog: "Source files are NOT deleted"). Visually distinguish Running vs Healthy vs Reachable using separate badges.

Registration Wizard (brief §6.2): steps — (1) Mode (Manage & launch / Register running app [Phase 2 enables it]); (2) Basics (name, project folder picker via main-process dialog); (3) Launch (runtime preset dropdown: Node, npm script, Python, Java, .NET, custom; executable, args as a token list editor — NOT a free-text shell line; working directory; env editor with secret toggle); (4) Port & protocol; (5) Health check; (6) Review & save. Presets only prefill the normalized ApplicationConfig; they never add logic. Show `lintLaunchConfig()` warnings inline.

State: TanStack Query for data, subscribe to events for live updates. All calls via window.nest.

Acceptance: Playwright E2E — register two apps with different launch configs (fixture Node + fixture Python), start/stop both from the UI, see live status + logs, remove one without touching its folder. No LAN controls enabled. Phase 1 acceptance criteria from the brief all pass.
```

### Prompt 1.6 — System tray & window-close behavior

```text
Implement tray (brief §6.12) and close behavior:
- Close main window → hide to tray when `backgroundMode` enabled (default on) with a one-time notice that managed apps keep running.
- Tray menu: Open NEST, running apps list (click to stop/start), Review warnings, Exit.
- Exit flow honoring `shutdownPolicy` (ask/stop_all/keep_running); "ask" shows a dialog listing running apps with a "remember my choice" option.
- Single-instance lock; second launch focuses the existing window.
- Windows startup-at-login option (off by default) via app.setLoginItemSettings.

Acceptance: E2E/integration tests for close→tray, exit with each policy, single instance. Document defaults in docs/behavior.md.
```

---

## 6. Phase 2 — Port Management & Local Health

**Goal:** reliable local service management; accurate port and health truth.

### Prompt 2.1 — PortManager

```text
Implement services/port-manager over OsAdapter.listTcpListeners() (Windows: Get-NetTCPConnection -State Listen via a fixed PowerShell script returning JSON; fallback to parsing `netstat -ano -p tcp` if PowerShell fails).
- checkPort(port, {host}): attempt-bind test (net.createServer, listen, close) AND listener table lookup; return PortInfo {state, ownerPid?, ownerImage?, ownedByManagedAppId?, boundAddress}.
- listListeners(): all listeners with owner process info (best-effort when not elevated; mark `ownerUnknown` rather than guessing).
- suggestPort(preferred, {range}): next free port; excludes ports configured for other registered apps.
- detectConfigDrift(): configured ports vs actual listeners → stale/changed assignments.
- Implement the `PortGuard` hook used by ApplicationManager.start(): re-check immediately before spawn; on conflict return PORT_IN_USE with owner details and a suggestion; NEVER silently change the port; on bind failure after spawn (process exits / port not listening by timeout) report `failed` with a clear message.
- Event `port.conflict` pushed to UI.
- TCP only. UDP explicitly returns UNSUPPORTED_OPERATION.

Acceptance: tests with fixtures: occupied port detected pre-start (start refused, nothing spawned); port occupied between check and spawn → app `failed` accurately; owner process identified for a managed and an external listener; suggestions skip registered ports.
```

### Prompt 2.2 — HealthMonitor

```text
Implement services/health-monitor:
- Check types: TCP connect, HTTP(S) request (GET, follow no redirects by default, accept self-signed for https ONLY for loopback/LAN target hosts, configurable), expected status and optional body marker.
- Per-app scheduler with configurable interval/timeout; jitter; no overlapping checks per app; stop on app stop; backoff when unhealthy.
- failureThreshold (default 3 consecutive failures) before `unhealthy`; success resets. A single slow response must not flip state.
- Report SEPARATELY and persist: processAlive, portListening, localResponding. (LAN verification belongs to Phase 3.)
- Emits health.changed only on change; stores last result + latency.
- `health.checkNow` IPC for manual runs.

Acceptance: fixture app with toggled responsiveness: flaps below threshold stay healthy; sustained failure → unhealthy; process alive but HTTP 500 → process=running, health=unhealthy (UI shows both); port listening but wrong body → unhealthy; no overlapping checks under slow responses.
```

### Prompt 2.3 — Externally managed apps (Mode B)

```text
Implement `apps.registerExternal`: user supplies a port (+ optional protocol/health). NEST inspects the listener (PortManager), attempts to identify owner pid/image, tests connectivity, and registers with lifecycleMode=`external`, state `external`.
- Monitoring works (health, port state). Start/Stop/Restart are disabled and return UNSUPPORTED_OPERATION; UI marks them "Unavailable — not managed by NEST" with a tooltip.
- NEST must never terminate or reconfigure an unidentified/unowned process.
- If the listener disappears, state → `unknown`/`stopped` appropriately with a log entry.

Acceptance: E2E: start a fixture app outside NEST, register it, see health, confirm Stop is unavailable and the process survives all NEST actions.
```

### Prompt 2.4 — Crash handling, restart policy, state recovery

```text
- Optional per-app auto-restart policy (off by default): max N restarts in window with exponential backoff; never auto-restart on `START_TIMEOUT`/port conflict loops; log each decision.
- Startup recovery (reconcile): for each app with stored pid, verify pid + startTime still match; if yes → re-adopt (state from observation), else mark `stopped`/`failed` with note "NEST was not running when it exited". Re-evaluate ports/health after reconcile. A stored PID alone is never proof.
- Corruption safety: crash of an app or NEST mid-operation must not corrupt config (wrap multi-row updates in transactions; test by killing the process mid-write).

Acceptance: tests for: restart NEST with keep_running apps (re-adopted), with dead pids (marked correctly), with reused PID (not adopted), and Phase 2 acceptance criteria from the brief.
```

### Prompt 2.5 — Diagnostics (local-only portion) + Logs UI

```text
Create diagnostics service skeleton implementing steps 1–4 of brief §6.9 (process running, port listening, listener address, local HTTP check) returning a structured DiagnosticReport with per-step {status: pass|fail|skipped|not_performed, detail, suggestedAction}. Add the UI: Project details page (config, state timeline, health history chart, port state, diagnostics button) and Logs page (filters by project/event type/severity/time, live tail, copy/export redacted).

Acceptance: diagnostic report correct for: stopped app, running-but-wrong-port, running-but-unresponsive, healthy app. UI never shows "OK" for steps not performed.
```

---

## 7. Phase 3 — LAN Access

**Goal:** explicit, confirmed, firewall-scoped, revocable, honestly-verified LAN access.

### Prompt 3.1 — NetworkManager

```text
Implement services/network-manager + WindowsAdapter network functions:
- Interface discovery: use os.networkInterfaces() enriched by PowerShell (Get-NetIPConfiguration / Get-NetConnectionProfile via fixed scripts) to get: name, description, IPv4, subnet/prefix, gateway presence, up/down, adapter type, network category (Private/Public/DomainAuthenticated).
- Classify candidates: exclude loopback, link-local (169.254/16), and mark likely virtual/VPN/container adapters (Hyper-V, WSL, VirtualBox, VMware, Docker, TAP/Wintun) as "not recommended" but still selectable.
- User selection persisted (settings.preferredInterface + per-app selected_interface).
- Change detection: poll every 5s (+ OS event if available) and emit network.changed with diff; if the selected IP changed, mark affected apps' LAN URLs stale and warn "previously shared URL is no longer valid"; re-scope firewall rules (Prompt 3.3) when subnet changes.
- URL generation: `buildUrl(app, address)` → `http(s)://<ip>:<port>` (+ health path not included).

UI: Network page listing interfaces exactly like the brief's example, "Use for LAN access" selector, profile badge, warning for Public profile.

Acceptance: unit tests for classification with mocked interface lists (Wi-Fi, Ethernet, VPN, Hyper-V, link-local); change-detection tests; UI shows stale-URL warning after simulated IP change.
```

### Prompt 3.2 — Listener binding detection & LAN-eligibility

```text
Using PortManager listener data compute `bindingClass` for each app: loopback_only | all_interfaces | specific_lan | not_listening.
- LAN-eligible only if all_interfaces or specific_lan matching the selected interface IP.
- If loopback_only: return LOOPBACK_ONLY with explanation: "Changing the firewall cannot fix a service listening only on 127.0.0.1."
- For managed apps, support an OPTIONAL per-app `lanLaunchProfile` (alternative args/env, e.g. `--host 0.0.0.0` or `HOST=0.0.0.0`) explicitly defined by the user in the registration/edit form. NEST only restarts with this profile if it exists; it never guesses framework flags. Provide framework hints (documentation text only, not auto-applied).
- Never assume localhost→LAN is possible. If no profile and loopback-only: show the manual change required.

Acceptance: fixtures: loopback-only server, 0.0.0.0 server, specific-IP server each classified correctly; managed app restart-with-lan-profile flow works; app without profile is not modified.
```

### Prompt 3.3 — Windows Firewall adapter + elevated helper

```text
Implement the firewall layer (brief §6.7, §11.1, §11.4).

Design:
- A fixed, versioned helper script `resources/firewall-helper.ps1` (shipped signed-as-possible, hash-checked by NEST before each use) exposing ONLY these operations, selected by an enum argument, with parameters validated both in TS (Zod) and in PowerShell (ValidateRange/ValidatePattern):
  - `Add-NestRule -AppId <guid> -Port <1..65535> -Protocol TCP -RemoteSubnet <CIDR|LocalSubnet> -Profile Private`
  - `Remove-NestRule -AppId <guid>`
  - `Get-NestRule -AppId <guid>` / `List-NestRules`
  - `Get-ActiveProfile`
- Rules: DisplayName `NEST-<appName>-<port>`, Name `NEST-<appId>`, Group `NEST`, Direction Inbound, Action Allow, Protocol TCP, LocalPort <port>, RemoteAddress scoped to selected subnet (fallback LocalSubnet), Profile Private ONLY. Optional `-Program` scope off by default.
- Elevation: non-elevated `Get-*` where possible. For Add/Remove, launch the helper elevated via UAC (`Start-Process -Verb RunAs`) with arguments passed as a validated JSON file in a temp path with restricted ACL, result returned via a temp output file; handle UAC cancel → ELEVATION_DENIED; never fall back to unelevated pretending success.
- After any change, READ BACK the rule via Get-NetFirewallRule to confirm it exists with the expected scope, then update `firewall_rule_reference` in access_policies; on mismatch report FIREWALL_FAILED.
- Detect group-policy/managed restrictions (access denied, policy-managed) and report POLICY_BLOCKED with the exact OS message.
- Refuse to create rules if the target interface's network category is Public (NETWORK_PROFILE_PUBLIC) — no override in v1.
- Idempotent: adding an existing identical rule is a no-op; reconcile drift (rule exists in OS but not in DB and vice versa) via `reconcileRules()` at startup, surfacing orphans to the user rather than deleting silently.
- Audit: every privileged operation writes an activity log entry (who/what/when/result).

Acceptance: tests with a mocked PowerShell runner for argument validation (injection attempts like `; Remove-NetFirewallRule *` rejected), plus a manual/CI-on-Windows integration test creating and removing a real rule in a throwaway test group. Verify NEST never touches non-NEST rules and never changes the global firewall state.
```

### Prompt 3.4 — AccessManager: Enable/Disable LAN workflow

```text
Implement services/security-policy + `access.enable/disable/getStatus` following the brief §6.6 workflow EXACTLY (10 steps), as a resumable orchestrated flow with a typed step result list the UI can render:

1. Preconditions: app registered; interface selected; network profile Private (else block).
2. Verify listening address/port (Prompt 3.2). If loopback_only → branch: offer lanLaunchProfile restart (managed) or manual instructions (external). 
3. Produce a **Change Plan** object (no side effects): selected interface/IP, port, proposed firewall rule (exact fields), whether a restart is needed, whether elevation is needed, risk notes (debug endpoints, sample credentials, no auth).
4. UI shows a confirmation dialog rendering the Change Plan; requires an explicit checkbox/typed confirmation. (Setting "confirmation preferences" may reduce repeat prompts for the same unchanged plan but never skip the first confirmation.)
5. Apply: restart (if needed) → add firewall rule → read-back verification.
6. Verify: local reachability via the LAN IP from the host itself (note: proves listening + local firewall path only), set `lastVerification` and LanVerification=`local_ok`.
7. Remote verification: offer "Test from another device" — show the LAN URL + QR code; user confirms success manually → `remote_user_confirmed`. Without confirmation it stays `unverified`/`local_ok`. NEVER label "verified" from local checks.
8. Persist policy `lan_enabled` only after steps 5–6 succeed; on any failure leave/restore `local_only`/`lan_unavailable`, roll back created rule, log, and show actionable error.
Disable: remove/disable the NEST rule, read-back confirm, set `lan_disabled`→ treated as local_only; if the app was restarted with a LAN launch profile, offer to restart with the local profile (revoking exposure fully, since the listener would otherwise still be 0.0.0.0 but firewall-blocked).
Also: on app stop, access policy remains but status shows "not currently reachable"; on NEST startup, reconcile policy vs actual firewall/listener state.

Acceptance: security tests from brief §11.6 — default local-only; no rule without confirmation; revocation removes rule; Public profile refused; failure paths never report success; mgmt interface unreachable from LAN (port-scan NEST process: no listeners other than Electron internals bound to loopback — assert none on non-loopback).
```

### Prompt 3.5 — Full diagnostics, LAN UI, indicators

```text
Complete diagnostics (all 9 steps of brief §6.9): add checks for selected-IP currency, firewall rule presence/scope/profile, protocol/path sanity, optional remote result (manual confirmation or not_performed), and "possible external cause" guidance (client isolation, VPN, other firewall products, router guest network) as advice, never as a verdict.
UI:
- Card shows four independent indicators: Process | Port | Local response | LAN (unverified / local ok / user-confirmed / failed).
- "Enable LAN access" flow dialog (Change Plan + confirmation + progress steps + result).
- Copy LAN URL, QR code, stale URL banners.
- Diagnostic report view reproducing the brief's example output format.
- Settings: preferred interface, confirmation preferences, default policy (locked to Local only).

Acceptance: Phase 3 criteria in the brief; Playwright E2E with a mocked OsAdapter for firewall/network + one real-Windows manual test checklist (docs/manual-lan-test.md) for second-device verification.
```

---

## 8. Phase 4 — Robustness & Security Hardening

### Prompt 4.1 — Network-change & multi-app resilience

```text
- Stress/soak tests: 10+ simultaneous apps starting/stopping/crashing; ensure per-app locks, no event storms (coalesce), no leaked timers/listeners/handles (test with `--detect-open-handles`-style checks).
- Network changes: simulate Wi-Fi switch, IP change, adapter down/up, VPN connect; rules re-scoped or flagged; URLs updated; user warned.
- Sleep/resume handling (powerMonitor): re-reconcile processes, ports, health, network.
Acceptance: automated simulated-change tests + soak test passes for 30 minutes without memory growth beyond threshold.
```

### Prompt 4.2 — Process-tree hardening

```text
Harden tree handling: test apps that spawn detached grandchildren, rapidly respawning children, npm→node→worker chains, Java launching subprocesses. Ensure stop kills the full owned tree and nothing else (verify ownership of each descendant via parent chain from the owned root with start-time checks). Evaluate and document (decision record in docs/adr/) whether to use Windows Job Objects (via a tiny native helper) in v1.x.
```

### Prompt 4.3 — Validation & injection hardening

```text
Fuzz and property-test: config schema, launchers, IPC handlers, firewall helper args, PowerShell script parameter binding, path traversal in working directory/project path, UNC paths, reserved device names, extremely long inputs, unicode tricks. Add a security regression suite mapping 1:1 to Section 0.2 invariants and brief §11.6. Run `npm audit`, enable Electron fuses (disable RunAsNode, enable cookie encryption, OnlyLoadAppFromAsar), set CSP, disable DevTools in production, verify `will-navigate`/`setWindowOpenHandler`.
```

### Prompt 4.4 — Privileged-operation audit & failure transparency

```text
Create an "Audit" view listing every privileged operation (firewall add/remove, process terminations, LAN enables) with outcome and OS error text. Test: UAC denied, group policy block, PowerShell execution policy restriction, helper hash mismatch (refuse to run + alert), rule exists but disabled by admin. In all cases UI reports the true state, never success.
```

---

## 9. Phase 5 — Release & Documentation

### Prompt 5.1 — Packaging

```text
Configure Electron Forge Windows installer (Squirrel or WiX/MSI per team preference; decide and record in an ADR). Include: app icon, versioning, per-user install (no admin required to install), code-signing config via env vars (documented; unsigned builds allowed for dev), auto-unpack native modules (better-sqlite3), include resources/firewall-helper.ps1 with integrity hash. Verify upgrade path preserves the DB (migrations run) and uninstall offers (does not force) removal of NEST firewall rules and user data.
```

### Prompt 5.2 — Clean-machine validation

```text
Provide docs/clean-install-checklist.md and, if possible, a Windows Sandbox/VM script: install without dev tools; register a prebuilt sample app; start/stop; enable LAN with UAC; reboot and relaunch; verify config persistence, state recovery, tray behavior, startup-at-login option, uninstall.
```

### Prompt 5.3 — Documentation

```text
Write: README, docs/user-guide.md (registering Node/Python/Java/.NET examples from the brief, with the caveat that flags vary by framework), docs/lan-access.md (binding rule, 0.0.0.0 ≠ LAN-only, firewall scope, Private-profile-only, client isolation, VPNs, dev-server security warnings), docs/troubleshooting.md (derived from diagnostic steps), docs/security.md (invariants, what NEST will never do), docs/behavior.md (close/exit/reboot semantics), docs/known-limitations.md (from brief §15), release notes. Documentation must state plainly what NEST cannot guarantee.
```

---

## 10. Phase 6 — Optional (Only After Phases 1–5 Are Stable)

Do **not** start unless explicitly requested. Each needs its own design doc first.

- Friendly names + URL-path routing (reverse proxy integration).
- Hostname resolution (mDNS or hosts-file helper).
- Linux support: implement `LinuxOsAdapter` (`ss`/`/proc`, `ufw`/`nftables`/`firewalld` adapters). Only `os/linux/` and packaging change if Section 1's boundary was respected.
- Additional framework startup presets (presets only emit the normalized ApplicationConfig).
- Remote-access integrations (separate security review).

---

## 11. Phase Dependency & Flow Summary

```text
P0 Scaffold/Contracts ──► P1 Foundation (DB → OsAdapter/process → AppManager → Logs → UI → Tray)
                              │
                              ▼
                     P2 Ports & Health (PortManager → Health → External apps → Recovery → Local diagnostics)
                              │
                              ▼
                     P3 LAN (Network → Binding detect → Firewall helper → Access workflow → Full diagnostics/UI)
                              │
                              ▼
                     P4 Hardening ──► P5 Release ──► P6 Optional
```

Cross-phase integration points (agent must wire these when reaching the later prompt):

| Defined in | Consumed by |
|---|---|
| `PortGuard` hook (1.3 stub) | PortManager (2.1) |
| Runtime state + events (1.3) | HealthMonitor (2.2), Tray (1.6), Dashboard (1.5) |
| `OsAdapter.getNetworkInterfaces/firewall` interface (1.2) | NetworkManager (3.1), Firewall (3.3) |
| `bindingClass` (3.2) | AccessManager (3.4), Diagnostics (3.5) |
| Activity log (1.4) | Audit view (4.4), Diagnostics, Logs UI |
| Shutdown policy + pid/startTime persistence (1.3/1.6) | Recovery (2.4) |

---

## 12. Definition of Done (Per Phase)

A phase is done only when: (1) all its prompts' acceptance checks pass with evidence from an actual test run; (2) the brief's acceptance criteria for that phase pass; (3) `typecheck`, `lint`, unit, integration and E2E suites are green; (4) no Section 0.2 invariant is violated (security regression suite green); (5) docs for new behavior are updated; (6) a Completion report is produced.

## 13. Fixture Apps (create in Phase 0/1, reused throughout)

Place under `tests/fixtures/test-apps/`, each configurable by env/args:

- `node-http` — HTTP server on given port/host, `/health`, toggles for delay/500/body.
- `python-http` — same behavior (different runtime).
- `loopback-only` — binds 127.0.0.1 only.
- `slow-start` — listens after N seconds (startup timeout tests).
- `crash-on-start` / `crash-after-n` — exit codes.
- `port-squatter` — occupies a port to create conflicts.
- `spawns-children` — spawns child/grandchild servers (tree kill).
- `ignores-sigterm` — requires forced kill.
- `secret-logger` — prints fake secrets to verify redaction.

## 14. Final Reminder to the Agent

NEST's value is **honesty about state and safety by default**. When in doubt: choose Local only, ask for confirmation, verify by observation, report failures plainly, and never touch what NEST does not own.
