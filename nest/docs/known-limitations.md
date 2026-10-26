# Known Limitations

From brief §15.

---

## Network & LAN Access

| Limitation | Details |
|------------|---------|
| **No guaranteed LAN connectivity** | NEST manages OS-level plumbing (binding, firewall). Cannot override router AP isolation, VPN routing, third-party firewalls, guest network isolation, or subnet mismatches. |
| **`0.0.0.0` ≠ LAN-only** | Binding to `0.0.0.0` listens on ALL interfaces. Firewall scopes to LAN, but NEST cannot prevent other network paths. |
| **Loopback-only apps** | Apps hardcoded to `127.0.0.1` cannot be fixed by firewall alone. NEST offers LAN Launch Profile restart (managed) or manual config instructions (external). |
| **Network profile dependency** | LAN access only works on **Private** profile. Public/Domain = blocked. User must set network to Private. |
| **Single interface selection** | Only one network interface active at a time. Multi-homed scenarios require manual re-selection. |
| **IP changes break URLs** | DHCP renewal changes LAN IP. NEST detects and shows stale URL banner; user must re-run LAN Access. |
| **No hostname/DNS** | Direct IP:port only. No mDNS, no custom hostnames, no reverse proxy. |

---

## Application Management

| Limitation | Details |
|------------|---------|
| **Framework-specific flags** | Flags to bind `0.0.0.0` vary by framework/version. NEST cannot know all; user must provide correct LAN Launch Profile args. |
| **Apps without LAN config** | Some apps only support config file changes (Spring Boot `application.yml`, Django `settings.py`). NEST cannot modify those. |
| **Dynamic ports** | Apps that allocate random ports (e.g., some dev servers) cannot be reliably managed — NEST requires fixed port. |
| **Authentication/Authorization** | NEST does not add auth. Exposed apps are open to LAN. |
| **Process tree killing** | Uses `taskkill /T` (Windows). Some processes (detached, services) may escape. Job Objects not yet implemented. |
| **External app limitations** | Cannot start/stop/restart; no LAN Launch Profile; health monitoring only. |
| **PID reuse** | Mitigated by PID + startTime verification, but theoretical race exists. |
| **No container/VM support** | Native processes only. Docker/WSL2/VM apps must be registered as external. |

---

## LAN Access & Security

| Limitation | Details |
|------------|---------|
| **No LAN connectivity guarantee** | NEST manages binding + firewall. Cannot overcome: AP isolation, VPN split tunneling, third-party firewalls, router guest isolation, subnet segregation. |
| **Firewall scope** | Rules are Private-profile only, `LocalSubnet` remote address. Cannot create rules for specific IPs, other profiles, or outbound rules. |
| **No reverse proxy / TLS termination** | Direct HTTP/TCP only. No automatic HTTPS, no cert management. |
| **No authentication/authorization** | NEST adds no auth. Exposed apps are open to LAN. |
| **No rate limiting / DDoS protection** | Raw port exposure. |
| **QR code uses external service** | `api.qrserver.com` for QR generation (network call). Can be disabled by not using QR. |
| **Remote verification is manual** | NEST cannot automate "second device confirms" — requires human action. |

---

## Platform & OS

| Limitation | Details |
|------------|---------|
| **Windows only (v1)** | Linux/macOS support planned post-v1 (via OS adapter). |
| **Windows 10 21H2+ / Windows 11** | Older versions untested; may lack `Get-NetFirewallRule` etc. |
| **Admin required for firewall** | UAC prompt on every LAN enable/disable. No service-mode to avoid UAC. |
| **No service/daemon mode** | NEST must run as user session. Apps stop on user logoff (unless shutdown policy = keep_running). |
| **No system-wide install** | Per-user only (`%LOCALAPPDATA%`). No MSI, no system-wide firewall rules. |
| **Electron/Node.js dependencies** | ~150MB install; ~100MB RAM baseline. |
| **No ARM64 build yet** | x64 only (for now). |

---

## Data & Persistence

| Limitation | Details |
|------------|---------|
| **SQLite only** | No PostgreSQL/MySQL. Single-user, local file. |
| **No multi-user** | Single-user app. No auth, no roles, no sharing. |
| **No cloud sync** | Settings/database local only. |
| **Log retention** | Configurable (default 30 days). No infinite retention. |
| **Secrets in DB** | Encrypted via Electron `safeStorage` (DPAPI). Not portable across users/machines. |

---

## Development Workflow

| Limitation | Details |
|------------|---------|
| **No hot reload for registered apps** | NEST manages process; app must handle its own HMR (e.g., `vite`, `webpack-dev-server`). |
| **No built-in log streaming UI** | Logs view shows DB entries; no real-time tail. |
| **No integrated terminal** | Process output captured to logs only. |
| **No environment variable templating** | Static env vars only; no `${VAR}` expansion. |

---

## What NEST Explicitly Does Not Do (by Design)

| Feature | Reason |
|--------|--------|
| Public internet exposure | Security scope; LAN only |
| Reverse proxy / custom domains | Complexity; out of scope |
| Custom DNS / mDNS / Bonjour | Out of scope |
| Container orchestration | Docker/Podman/K8s separate tools |
| CI/CD integration | Out of scope |
| Team collaboration / RBAC | Single-user tool |
| Metrics / observability stack | Use Prometheus/Grafana separately |
| Log aggregation (ELK, Loki) | Export logs manually if needed |
| Configuration as code (GitOps) | SQLite only; no declarative config |

---

## Future Considerations (Post-v1)

| Area | Potential |
|------|-----------|
| Linux support | Via OS adapter (systemd, firewalld, nftables) |
| macOS support | Via OS adapter (pfctl, launchd) |
| WiX/MSI maker | Enterprise Group Policy deployment |
| Reverse proxy integration | Traefik/Caddy/NGINX sidecar |
| mDNS / .local hostnames | Avahi / Bonjour integration |
| Plugin system | Custom health checks, notifiers |
| Telemetry (opt-in) | Anonymous usage stats |

---

## Summary

> **NEST is a developer tool for managing local dev servers and exposing them to LAN.** It handles process lifecycle, port management, health checks, and Windows Firewall integration. It does **not** replace production infrastructure, cannot guarantee network connectivity, and does not secure your applications for you.

> **Use NEST for:** Local development, team LAN demos, testing mobile apps against local API, sharing dev servers on trusted LAN.

> **Do NOT use NEST for:** Production hosting, public internet exposure, multi-tenant environments, or situations where you cannot control the network environment.