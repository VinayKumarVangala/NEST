# Behavior Specification

## Application Lifecycle

### Process States

| State | Meaning | Transitions |
|-------|---------|-------------|
| `registered` | App configured, not running | → `starting` |
| `starting` | Launch command issued | → `running` / `failed` |
| `running` | Process alive, port may be listened | → `stopping` / `failed` |
| `stopping` | Stop requested | → `stopped` |
| `stopped` | Process exited cleanly | → `starting` |
| `failed` | Crashed / timeout / error | → `starting` (if auto-restart) |
| `external` | Registered but not managed | (no transitions) |
| `unknown` | State unknown (recovery) | → `running` / `stopped` |

**Transitions are validated** — invalid transitions throw `INTERNAL` error.

---

## Start Sequence

```
User clicks Start
       │
       ▼
Validate config (working dir, executable, port)
       │
       ▼
Port pre-check (PortGuard) ──conflict──▶ Error: PORT_IN_USE
       │
       ▼
Resolve executable (PATH, .cmd handling, metachar check)
       │
       ▼
Check LAN binding ──loopback_only──▶ LAN Launch Profile available?
       │                                      │
       ▼                                      ▼
    Proceed                            Offer restart with LAN profile
       │
       ▼
Spawn process (shell:false, windowsHide:true)
       │
       ▼
Set state: starting
       │
       ▼
Poll: process alive + port listening + health check
       │
       ├── timeout ──▶ failed (START_TIMEOUT)
       │
       ▼
Health check passes ──▶ running
       │
       ▼
Emit app.stateChanged (running)
```

---

## Stop Sequence

```
User clicks Stop (force=false)
       │
       ▼
Verify ownership (PID + start time match)
       │
       ▼
Set state: stopping
       │
       ▼
Graceful terminate (taskkill /PID /T)
       │
       ├── success ──▶ stopped
       │
       └── fail + force=true ──▶ taskkill /F /PID /T ──▶ stopped
       │
       ▼
Emit app.stateChanged (stopped)
```

**Force stop** (`force=true`) skips graceful attempt, uses `/F` immediately.

---

## Restart

```
restart(appId):
  await stop(appId, force=false)
  await start(appId)
```

Uses mutex — concurrent start/stop/restart on same app serialized.

---

## Crash Detection & Auto-Restart

| Condition | Detected Via | Action |
|-----------|--------------|--------|
| Process exit (code ≠ 0) | `child.on('exit')` | Auto-restart if policy enabled |
| Process killed by signal | `child.on('exit', signal)` | Auto-restart if policy enabled |
| Startup timeout | `startupTimeoutMs` exceeded | `failed` state; auto-restart if policy |
| Health check failures | `failureThreshold` exceeded | `unhealthy`; auto-restart if policy |

**Auto-restart policy** (per app, optional):
```json
{
  "enabled": true,
  "maxRestarts": 3,
  "windowMs": 60000,
  "backoffBaseMs": 1000,
  "backoffMaxMs": 30000
}
```

**Backoff:** `min(base * 2^(attempt-1), max)`

**Rate limiting:** Max restarts per window; exceeded → disable auto-restart, log warning.

---

## External Applications

| Capability | Supported |
|------------|-----------|
| Start/Stop/Restart | ❌ No (not managed) |
| Health monitoring | ✅ Yes |
| Port inspection | ✅ Yes |
| LAN Access | ✅ Yes (if binding eligible) |
| Auto-restart | ❌ No |

External apps are **monitored only** — NEST never kills them.

---

## Window Close / Exit Semantics

| Action | Behavior |
|--------|----------|
| **Click X (close window)** | If `backgroundMode=true` (default): hide to tray, apps keep running |
| **Tray → Exit** | Runs shutdown policy (see below) |
| **App.quit()** | Triggers `before-quit` → shutdown policy |
| **User logs off / shutdown** | `before-quit` fires; shutdown policy applies |
| **Task Manager kill NEST** | Apps keep running (orphaned); recovered on restart |

---

## Shutdown Policy (on Exit)

Configured in **Settings → Shutdown Policy**:

| Policy | Behavior on Exit |
|--------|------------------|
| `stop_all` (default) | Stop all managed apps, then quit |
| `keep_running` | Leave apps running, quit NEST only |
| `ask` | Prompt: "Stop All Apps & Exit" / "Keep Apps Running & Exit" / "Cancel" |

**Prompt checkbox:** "Remember my choice" → saves as new default.

**On `stop_all`:** NEST waits for all apps to stop gracefully (with force fallback).

---

## Reboot / Sleep / Resume

| Event | Behavior |
|-------|----------|
| **Sleep (suspend)** | NEST stops health monitoring, network polling, external monitoring; logs suspend |
| **Resume** | Waits 2s for network; reconciles network state; recovers processes; restarts monitors; runs diagnostics on running apps |
| **Reboot (clean shutdown)** | `before-quit` → shutdown policy → apps stopped per policy |
| **Reboot (forced/power loss)** | On restart: `applicationManager.recover()` reads DB, verifies PID+startTime, reconciles runtime state |

**Recovery on startup:**
1. Load all apps from DB
2. For each: check PID + startTime via `Get-CimInstance Win32_Process`
3. If match → re-adopt (`running`); if mismatch → mark `stopped`
4. External apps: re-inspect port; re-adopt if listener exists
5. Start health monitoring for all running apps

---

## Network Changes

| Event | Detection | Reaction |
|-------|-----------|----------|
| IP changed on selected interface | Polling (5s) + `Get-NetIPConfiguration` | Emit `network.changed` with `diff.ipChanged`; emit `network.staleUrl` for affected apps |
| Interface added/removed | Polling | Emit `network.changed` with `diff.interfacesChanged` |
| Profile changed (Private→Public) | Polling | Emit `network.changed`; LAN Access blocked if Public |

**Stale URL Banner:** Shown on app card when selected interface IP changes. Click "Re-run LAN Access" to update.

---

## Startup at Login

| Setting | Mechanism |
|---------|-----------|
| `startupAtLogin: true` | `app.setLoginItemSettings({ openAtLogin: true, path: process.execPath })` |
| `startupAtLogin: false` | `app.setLoginItemSettings({ openAtLogin: false })` |

**Behavior:** On login, NEST starts minimized to tray. Apps with `startupAtLogin` (per-app) would need separate implementation — currently only NEST itself.

---

## Tray Behavior

| Action | Result |
|--------|--------|
| Double-click tray | Show main window |
| Right-click → Open | Show main window |
| Right-click → App → Start/Stop/Restart | Control app |
| Right-click → Review Warnings | Open Diagnostics tab |
| Right-click → Exit | Trigger shutdown policy |

---

## State Persistence

| Data | Storage | Persists |
|------|---------|----------|
| App configs | SQLite `applications` table | ✅ Yes |
| Runtime state | SQLite `runtime_state` | ✅ Yes (recovered) |
| Access policies | SQLite `access_policies` | ✅ Yes |
| Settings | SQLite `settings` table | ✅ Yes |
| Activity logs | SQLite `activity_logs` | ✅ Yes (retention) |
| Restart history | SQLite `restart_history` | ✅ Yes |
| Firewall rules | Windows Firewall | ✅ Yes (OS-managed) |

**On upgrade:** DB migrations run automatically (idempotent). User data preserved.

---

## Summary: State Machine Diagram

```
                    ┌─────────────┐
                    │  registered │
                    └──────┬──────┘
                           │ start()
                           ▼
                    ┌─────────────┐
                    │  starting   │
                    └──────┬──────┘
                           │ health check passes
                           ▼
                    ┌─────────────┐
         ┌──────────▶│   running   │◀──────────┐
         │           └──────┬──────┘           │
         │                  │                  │
    stop()              crash/timeout        restart()
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────┐      ┌─────────────┐  ┌─────────────┐
│  stopping   │      │   failed    │  │  starting   │
└──────┬──────┘      └──────┬──────┘  └──────┬──────┘
       │                    │                 │
       ▼                    │ (auto-restart?) │
┌─────────────┐             │                 │
│  stopped    │◀────────────┘                 │
└─────────────┘                               │
       │                                      │
       └────────────── start() ──────────────┘
```