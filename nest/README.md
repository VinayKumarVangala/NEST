# NEST

**Host on your network.**

NEST is a Windows-first desktop application for managing development application lifecycles and enabling controlled access to those applications across a local network.

## What NEST Does

- **Register** applications built with any language/framework (Node.js, Python, Java, .NET, Go, Rust, etc.)
- **Manage** process lifecycle: start, stop, restart, crash detection, auto-restart
- **Monitor** health via TCP/HTTP checks with configurable intervals
- **Expose** applications to LAN with explicit user consent and firewall management
- **Diagnose** connectivity issues with a guided 9-step diagnostic tool

## What NEST Does NOT Do

- ❌ **Does not** host applications publicly on the internet
- ❌ **Does not** provide reverse proxy, custom DNS, or hostname routing
- ❌ **Does not** automatically modify application source code
- ❌ **Does not** run applications in containers/VMs
- ❌ **Does not** guarantee LAN accessibility (depends on app binding, firewall, network)
- ❌ **Does not** override OS/network security policies

## Quick Start

1. Download and run `NEST-Setup.exe`
2. Click "Register Application"
3. Fill in your app details (path, command, port)
4. Click "Start" to run your app
5. (Optional) Click "Enable LAN Access" to share on local network

## Documentation

| Guide | Description |
|-------|-------------|
| [User Guide](docs/user-guide.md) | Registering apps, managing lifecycle, LAN access |
| [LAN Access](docs/lan-access.md) | Binding rules, firewall, network troubleshooting |
| [Troubleshooting](docs/troubleshooting.md) | Diagnostic steps, common issues |
| [Security](docs/security.md) | Invariants, what NEST will never do |
| [Behavior](docs/behavior.md) | Close/exit/reboot semantics |
| [Known Limitations](docs/known-limitations.md) | From brief §15 |
| [Release Notes](docs/release-notes.md) | Version history |

## Requirements

- Windows 10 21H2+ or Windows 11
- Network profile set to **Private** (for LAN access)
- Administrator rights for firewall changes (UAC prompt)

## Security First

- **Local-only by default** — no network exposure without explicit consent
- **No admin required for install** — per-user install to `%LOCALAPPDATA%`
- **Firewall rules scoped** — Private profile only, `LocalSubnet` only, `NEST-` prefix
- **No secrets in logs** — automatic redaction of tokens, passwords, keys
- **Code signing** — CI/CD builds signed via `CSC_LINK`/`CSC_KEY_PASSWORD`

## License

MIT License — see [LICENSE](LICENSE)