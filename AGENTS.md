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
├─ CLAUDE.md                      # rules from Section 0–3 (agent context)
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

1. Read `CLAUDE.md` and Section 0 first. Restate which invariants apply.
2. Plan briefly, then implement in small commits (conventional commits: `feat(port-manager): …`).
3. Write/extend tests in the same step; run `npm run typecheck && npm run lint && npm test` and fix failures.
4. Do not add dependencies beyond the fixed stack without justification noted in the commit message.
5. Do not implement features from later phases. If a later-phase hook is needed, define the interface only.
6. End with a **Completion report**: files changed, tests added, acceptance checks (pass/fail), open issues. Never claim a check passed unless run.
7. If a requirement is ambiguous or conflicts with an invariant, stop and ask.

---
