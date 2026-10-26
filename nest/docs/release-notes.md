# Release Notes

## v0.1.0 (Development) — 2024-10-26

### Initial Development Release

This is the first development release of NEST. It implements the core functionality for managing development applications and enabling controlled LAN access.

---

### ✨ Features

#### Application Management
- Register applications with full configuration (name, path, executable, args, env, port, protocol)
- Start, stop, restart with mutex-protected single-flight operations
- Process lifecycle management with PID + startTime verification
- Crash detection and configurable auto-restart with exponential backoff
- External application registration (monitor only)

#### Port Management
- Port availability checking with conflict detection
- Listener enumeration with process ownership
- Port suggestion for conflicts

#### Health Monitoring
- TCP and HTTP health checks with configurable intervals
- Health states: `healthy`, `unhealthy`, `checking`, `unknown`, `not_applicable`
- Failure threshold and timeout configuration

#### Network & LAN Access
- Network interface discovery with IP, subnet, profile, type
- Interface selection with persistence
- **10-step LAN Access workflow** (preconditions → binding check → change plan → confirmation → apply → local verify → remote verify → persist → disable → reconcile)
- **Binding classification**: `loopback_only`, `all_interfaces`, `specific_lan`, `not_listening`
- LAN Launch Profile for automatic restart with LAN binding
- QR code generation for LAN URL sharing
- Stale URL detection on IP change

#### Windows Firewall Integration
- Controlled PowerShell helper (`resources/firewall-helper.ps1`)
- Operations: Add, Remove, Get, List, Reconcile, Get Active Profile
- Rules scoped: Private profile, LocalSubnet, NEST group, NEST- prefix
- Integrity verification via embedded SHA256 hash
- Read-back verification after every operation

#### Security Policy
- Default `local_only` access policy
- 10-step workflow with explicit user confirmation
- UAC elevation only for firewall operations
- Audit logging for all privileged operations

#### Windows Integration
- Per-user install via Squirrel.Windows (no admin required)
- System tray with app control menu
- Startup at login option
- Power monitoring (suspend/resume handling)
- Single instance lock

#### Diagnostics
- 9-step guided diagnostics (process → port → binding → local HTTP → LAN IP → firewall → protocol → remote → external causes)
- Output matches brief §6.9 format
- QR code for remote verification

#### Logging & Auditing
- Structured activity logs (start, stop, restart, crash, health_change, lan_enable, lan_disable, firewall_change, error, info)
- Secret redaction (tokens, passwords, keys, Bearer, auth headers)
- Privileged operation audit trail (firewall add/remove, process terminate, LAN enable/disable)

#### Database
- SQLite with WAL mode, foreign keys
- Migrations system (idempotent, versioned)
- Repositories: Applications, RuntimeState, AccessPolicies, RestartHistory, ActivityLogs, Settings

#### UI (React + TypeScript + Tailwind)
- Dashboard with app cards (4 indicators: Process | Port | Local | LAN)
- Projects list with registration wizard
- Network interface management
- Diagnostics view with QR code
- Settings (network, confirmations, logging, security)
- Dark mode support

#### Security Hardening
- Electron fuses: `RunAsNode=false`, `EnableCookieEncryption=true`, `OnlyLoadAppFromAsar=true`
- Renderer: `contextIsolation=true`, `nodeIntegration=false`, `sandbox=true`
- CSP headers via `webRequest.onHeadersReceived`
- `will-navigate` + `setWindowOpenHandler` for external links
- Zod validation on all IPC payloads

---

### 🔧 Developer Experience

- TypeScript strict mode throughout
- Zod schemas as single source of truth (shared types, IPC contracts, validation)
- Vitest unit tests (58 passing)
- Playwright E2E tests
- ESLint + Prettier + Oxlint

---

### ⚠️ Known Limitations (v0.1.0)

- Windows only (Linux/macOS post-v1)
- No reverse proxy / custom domains / TLS termination
- No multi-user / RBAC / cloud sync
- No container/VM management
- Firewall rules: Private profile only, LocalSubnet only
- No guaranteed LAN connectivity (network-dependent)
- QR code uses external service (api.qrserver.com)
- Unsigned builds by default (set `CSC_LINK` for signing)

---

### 🐛 Known Issues

- Integration tests have environment issues (file:// URL in jsdom)
- Security regression tests read source files directly (environment limitation)
- DevTools disabled in production (by design)

---

### 📦 Installation

```bash
# Download NEST-Setup.exe from releases
# Run (no admin required)
# App installs to %LOCALAPPDATA%\NEST
```

### 🛠 Development

```bash
npm install
npm run dev          # Start dev server + Electron
npm run build        # Package
npm run make         # Create installer
npm run typecheck    # TypeScript check
npm run test         # Unit tests
npm run test:e2e     # Playwright E2E
```

### 🏗 Build Signed Release

```bash
CSC_LINK=https://artifacts.example.com/cert.pfx \
CSC_KEY_PASSWORD=secret \
npm run make:sign
```

### 📖 Documentation

- [User Guide](docs/user-guide.md) — Framework examples, LAN Launch Profile
- [LAN Access](docs/lan-access.md) — Binding rules, firewall, troubleshooting
- [Troubleshooting](docs/troubleshooting.md) — 9-step diagnostics
- [Security](docs/security.md) — Invariants, threat model
- [Behavior](docs/behavior.md) — Lifecycle, exit semantics
- [Known Limitations](docs/known-limitations.md) — What NEST cannot do

---

### 🙏 Acknowledgments

Built with: Electron, React, TypeScript, Tailwind, SQLite (better-sqlite3), Zod, TanStack Query, Electron Forge, Squirrel.Windows

---

**NEST: Host on your network.**