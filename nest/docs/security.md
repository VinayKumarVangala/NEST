# Security Model

## Core Invariants (What NEST Guarantees)

These are **hard invariants** — NEST's code enforces them, and they will never be violated.

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | **Renderer isolation** | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; all main communication via typed, Zod-validated IPC |
| 2 | **No shell injection** | Commands = `executable + args[]` stored separately; spawned with `shell: false`; `.cmd` handled via `cmd.exe /d/s/c` with metacharacter rejection |
| 3 | **Default deny** | Default access policy = `local_only`; no firewall rule without explicit user confirmation |
| 4 | **Firewall safety** | Never disables Windows Firewall; only manages `NEST-` prefixed rules in `NEST` group; Private profile only |
| 5 | **Elevation only for specific ops** | Firewall helper runs via `Start-Process -Verb RunAs`; fixed operation set (Add/Remove/Get/List/Reconcile); no generic PowerShell |
| 6 | **Management surface never network-reachable** | No HTTP server for admin; IPC only; renderer cannot access Node/Electron APIs |
| 7 | **Kill only owned processes** | Verifies PID + start time matches; kills process tree via `taskkill /T`; never kills by name or directory |
| 8 | **No assumed state** | UI shows observed state only (Running ≠ Healthy ≠ Reachable ≠ LAN-verified) |
| 9 | **No secret logging** | Redacts tokens, passwords, keys, secrets at log writer boundary |
| 10 | **No false success** | Privileged ops report exact OS error; never claim success on failure |

---

## What NEST Will NEVER Do

| NEST Will Never... | Why |
|--------------------|-----|
| **Disable Windows Firewall** | Would compromise host security |
| **Create firewall rules without explicit user consent** | User must type confirmation text + check checkbox |
| **Create rules on Public profile** | Only Private profile; Public = blocked |
| **Create rules with broad scope** | Always `LocalSubnet`, Private profile, `NEST-` prefix |
| **Modify rules not owned by NEST** | Only manages `NEST-` group rules |
| **Expose management UI to network** | No HTTP server; IPC only |
| **Execute shell commands from user input** | All commands = executable + args[]; `shell: false` |
| **Kill processes by name or directory** | Only kills verified PID + start time + descendants |
| **Log secrets** | Redacts tokens, passwords, keys at log boundary |
| **Claim LAN verified from local checks** | Requires explicit remote user confirmation |
| **Claim success on privileged failure** | Reports exact OS error (ELEVATION_DENIED, POLICY_BLOCKED, etc.) |
| **Modify app source code** | Only manages process lifecycle |
| **Auto-discover all projects** | User must explicitly register each app |
| **Run apps in containers/VMs** | Native process management only |
| **Provide public internet exposure** | LAN only; no port forwarding, tunnels, or proxies |
| **Act as reverse proxy** | Direct IP:port access only |
| **Provide custom DNS/hostnames** | IP:port only |
| **Override OS/network restrictions** | Respects AP isolation, VPN, third-party firewalls |

---

## Threat Model

| Threat | Mitigation |
|-------|------------|
| **Malicious app config** | Zod validation on all inputs; metacharacter rejection |
| **Shell injection via args** | Metacharacter rejection (`&|<>^%!"` + newlines); `shell: false` |
| **Path traversal** | Path validation; working directory restricted |
| **Secret leakage** | Redaction at log writer; `safeStorage` for encrypted env vars |
| **Privilege escalation** | UAC only for firewall ops; fixed operation set |
| **Firewall rule hijacking** | `NEST-` prefix + `NEST` group; only manages own rules |
| **Process hijacking** | PID + start time verification; `taskkill /T` only on owned tree |
| **IPC spoofing** | `contextIsolation`, frame origin validation, Zod schema validation |
| **Secret leakage in logs** | Redaction at write boundary; `secret: true` env vars never logged |
| **Supply chain (native modules)** | `better-sqlite3` rebuilt via `@electron/rebuild`; pinned versions |

---

## Code Signing

| Build Type | Requirements |
|------------|--------------|
| **Development** | Unsigned allowed; omit `CSC_LINK` |
| **CI/CD Release** | Set `CSC_LINK` (URL to .pfx) + `CSC_KEY_PASSWORD` |
| **Verification** | Windows SmartScreen passes; no "Unknown Publisher" |

```bash
# Signed build
CSC_LINK=https://artifacts.example.com/cert.pfx CSC_KEY_PASSWORD=secret npm run make:sign

# Unsigned (dev)
npm run make:unsigned
```

---

## Data Protection

| Data | Protection |
|------|------------|
| **Environment variables (secrets)** | Encrypted via Electron `safeStorage` (DPAPI on Windows) |
| **Database** | SQLite in `%APPDATA%\NEST\nest.db` (user-only ACL) |
| **Logs** | No secrets; redacted at write boundary |
| **Firewall rules** | Windows Firewall ACLs (admin only) |
| **IPC** | `contextIsolation: true`; Zod validation; frame origin check |

---

## What NEST Cannot Guarantee

> These are **outside NEST's control** — NEST manages the plumbing, but cannot override:

| Cannot Guarantee | Reason |
|-----------------|--------|
| **LAN connectivity** | Depends on app binding, firewall, router, VPN, third-party firewalls |
| **App security** | NEST exposes what you configure; you must secure your app |
| **Network reachability** | AP isolation, VPN, guest networks, third-party firewalls |
| **App stability** | Crashes, memory leaks, bugs are app's responsibility |
| **Port availability** | Other apps may occupy the port |
| **OS/network policy changes** | Group Policy, Windows updates, router changes |
| **Hardware failures** | Disk full, NIC failure, power loss |

> **NEST manages the OS-level plumbing. Your application and network must do the rest.**