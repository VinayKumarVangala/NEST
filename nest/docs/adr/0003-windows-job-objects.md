# ADR-0003: Windows Job Objects for Process Tree Management

**Date:** 2026-10-26
**Status:** Accepted
**Deciders:** Architecture Team

## Context

NEST manages application processes on Windows and must ensure that when an application is stopped, its entire process tree is terminated - and only its process tree. Current implementation uses `taskkill /PID <pid> /T` which kills all descendants but doesn't verify ownership.

Complex scenarios that need handling:
1. **Detached grandchildren** - Child processes that detach from parent (e.g., `start` command, services)
2. **Rapidly respawning children** - Processes that restart quickly (crash loops, watchdogs)
3. **npm→node→worker chains** - npm spawns node which spawns workers
4. **Java subprocesses** - JVM launching subprocesses (gradle, maven, application servers)

The critical invariant: **Never kill a process by name or project-directory match. Only kill processes NEST spawned (verified by PID + start-time) and their descendants.**

## Decision

**Do not use Windows Job Objects in v1.x.** Instead, enhance the current `taskkill /T` approach with rigorous ownership verification via parent-chain walk with start-time checks.

### Rationale

| Factor | Job Objects | Enhanced taskkill |
|--------|-------------|-------------------|
| **Complexity** | Requires native Node.js addon (node-windows-job-objects or custom C++ addon) | Pure TypeScript/PowerShell |
| **Maintenance** | Native addon must be rebuilt for each Electron/Node version | No native dependencies |
| **Reliability** | Job Objects have edge cases (breakout, limits) | Well-understood `taskkill` behavior |
| **Security** | Requires elevated privileges for some operations | Same privilege model |
| **Time to implement** | 2-3 weeks (addon + testing) | 1-2 days (enhancement) |
| **Linux portability** | Windows-only concept | Architecture supports Linux adapter later |

### Enhanced Approach

1. **Root ownership verification**: Verify root PID + startTime matches registry
2. **Descendant enumeration**: Recursive `Get-CimInstance Win32_Process` parent-chain walk
3. **Ownership validation**: For each descendant, verify its parent chain leads back to the owned root with matching start-times
4. **Selective termination**: Only kill verified descendants
5. **Race condition handling**: Re-verify ownership at kill time

## Consequences

### Positive
- No native dependencies, faster v1.x delivery
- Transparent, auditable process tree logic
- Works with existing Electron/Node upgrade cycle
- Portable architecture for Linux adapter

### Negative
- Slight race window between enumeration and kill (mitigated by re-verification)
- Requires careful PowerShell command construction
- Cannot prevent child process "breakout" (but neither can Job Objects if `BREAKAWAY_OK` is used)

## Implementation Plan

1. **Enhance `terminateProcessTree`** in WindowsAdapter with ownership verification
2. **Add test fixtures** for complex process trees
3. **Add integration tests** verifying correct tree termination
4. **Document behavior** in process management docs

## Related

- AGENTS.md §0.2 Invariant #7: "Never kill a process by name or by project-directory match. Only kill processes NEST spawned (verified by PID + start-time) and their descendants."
- ADR-0001: Electron Architecture
- ADR-0002: Security Architecture