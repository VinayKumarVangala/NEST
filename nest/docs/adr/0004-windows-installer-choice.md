# ADR-0004: Windows Installer Technology Choice

**Date:** 2026-10-26
**Status:** Accepted
**Deciders:** Architecture Team

## Context

NEST needs a Windows installer for distribution. The installer must:
- Support per-user installation (no admin required)
- Handle native module unpacking (better-sqlite3)
- Include the firewall helper script with integrity verification
- Preserve database on upgrades with automatic migration
- Offer (not force) removal of firewall rules and user data on uninstall
- Support code signing via environment variables for CI/CD
- Allow unsigned builds for development

## Decision

**Use Electron Forge with MakerSquirrel (Squirrel.Windows)** as the primary installer technology.

Squirrel.Windows is the native Electron-recommended installer for Windows. It provides:
- Per-user installation by default (installs to `%LOCALAPPDATA%`)
- Built-in auto-update framework (Squirrel)
- Native delta updates
- No administrative privileges required for installation
- Mature ecosystem with Electron Forge integration

**Do NOT use WiX/MSI** for the initial release because:
- MSI requires admin rights for per-machine installs (per-user MSI is complex)
- Adds significant build complexity (WiX toolset, candle/light)
- Squirrel's per-user model aligns better with NEST's developer-tool positioning
- WiX can be added later as an enterprise distribution option

## Consequences

### Positive
- Simpler build pipeline (single MakerSquirrel)
- Per-user install by default (no UAC prompt for install)
- Auto-updates via Squirrel built-in
- Delta updates reduce download size
- Native Electron Forge support

### Negative
- Squirrel.Windows is in maintenance mode (but stable)
- No native MSI for enterprise Group Policy deployment
- Uninstall behavior less customizable than WiX
- Some enterprise environments block AppData executables

## Implementation Requirements

1. **App Icon & Versioning**: Use `resources/icon.ico`, version from `package.json`
2. **Per-User Install**: Squirrel default (no config needed)
3. **Code Signing**: Via `CSC_LINK`/`CSC_KEY_PASSWORD` env vars (dev allows unsigned)
3. **Native Modules**: `AutoUnpackNativesPlugin` for better-sqlite3
4. **Resources**: Include `firewall-helper.ps1` with SHA256 integrity hash
5. **Upgrade Path**: DB migrations run on app startup (idempotent)
6. **Uninstall**: Offer (not force) firewall rule + user data removal
7. **Integrity**: Embed SHA256 of firewall-helper.ps1 in app for runtime verification

## Alternatives Considered

| Option | Per-User | Admin Required | Auto-Update | Complexity |
|--------|----------|----------------|-------------|------------|
| **Squirrel.Windows** | ✅ Yes | ❌ No | ✅ Built-in | Low |
| WiX/MSI (per-user) | ✅ Yes | ❌ No | Manual | High |
| WiX/MSI (per-machine) | ❌ No | ✅ Yes | Manual | High |
| NSIS | ✅ Yes | ❌ No | Manual | Medium |

## References

- Electron Forge MakerSquirrel docs
- Squirrel.Windows GitHub
- Electron security fuses (already configured in ADR-0003)