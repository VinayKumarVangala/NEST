# NEST Behavior Defaults and Policies

This document describes the default behaviors and policies for the NEST application.

## Window Close Behavior

### Default: Hide to Tray (`backgroundMode: true`)

When the user clicks the close button on the main window:

1. The window is hidden (not closed)
2. The application continues running in the system tray
3. All managed applications continue running
4. A one-time notice is shown: *"NEST has been minimized to the tray. Managed applications will continue running."*
5. User can dismiss this notice permanently via "Don't show this again" checkbox

**To disable:** Set `backgroundMode: false` in Settings → Application Behavior

### One-Time Notice

- Stored in settings as `trayNoticeDismissed: true`
- Can be re-enabled by clearing this setting
- Shown only when `backgroundMode` is enabled and notice hasn't been dismissed

---

## Tray Menu

The system tray icon provides:

| Menu Item | Action |
|-----------|--------|
| **Open NEST** | Shows the main window |
| **Running Apps** | Lists all running managed apps with Stop/Start/Restart actions |
| **Review Warnings** | Opens NEST to the Diagnostics page |
| **Exit** | Triggers the shutdown policy flow |

### Tray Interactions

- **Double-click** tray icon → Opens NEST
- **Right-click** → Shows context menu
- Menu updates automatically when app states change

---

## Shutdown Policy (`shutdownPolicy`)

Controls what happens when the user selects "Exit" from the tray menu or attempts to quit the application.

### Default: `ask`

When the user selects "Exit":

1. If managed apps are running:
   - Dialog shows: *"Managed applications are still running: [list]. What would you like to do?"*
   - Options:
     - **Stop All Apps & Exit** (default) - Gracefully stops all apps, then quits
     - **Keep Apps Running & Exit** - Leaves apps running, quits NEST only
     - **Cancel** - Returns to NEST, no changes
   - Checkbox: *"Remember my choice"* - Updates `shutdownPolicy` setting

2. If no managed apps are running:
   - Dialog shows: *"No managed applications are running. What would you like to do?"*
   - Default option: **Cancel** (safe default)

### `stop_all`

- Immediately stops all managed applications
- Then quits NEST
- No confirmation dialog

### `keep_running`

- Quits NEST immediately
- All managed applications continue running
- No confirmation dialog
- On next NEST launch, apps are re-adopted (PID + start time verified)

---

## Single Instance Lock

- Only one instance of NEST can run at a time
- Second launch attempt focuses the existing window
- If window is hidden/minimized, it is restored and shown
- Implemented via `app.requestSingleInstanceLock()`

---

## Windows Startup at Login

### Default: `startupAtLogin: false` (off by default)

When enabled in Settings → Application Behavior:

- Uses `app.setLoginItemSettings({ openAtLogin: true, path: process.execPath })`
- Creates a Windows shortcut in `shell:startup`
- NEST starts minimized to tray on user login
- Managed apps with `lifecycleMode: managed` will auto-start if configured

### Security Note

- Only affects the current user (not system-wide)
- No elevated privileges required
- Can be toggled without admin rights

---

## Settings Summary

| Setting | Default | Description |
|---------|---------|-------------|
| `backgroundMode` | `true` | Hide to tray on close |
| `shutdownPolicy` | `'ask'` | Exit behavior: ask/stop_all/keep_running |
| `startupAtLogin` | `false` | Start at Windows login |
| `trayNoticeDismissed` | `false` | One-time tray notice dismissed |

---

## Application Recovery

On NEST startup:

1. Load all registered applications
2. Check `RuntimeState` for each: PID + process start time
3. If PID exists and start time matches → re-adopt as `running` (health = checking)
4. If PID reused or process gone → mark as `stopped` with last error

This allows `keep_running` shutdown policy to work correctly across NEST restarts.

---

## Platform-Specific Notes

### Windows
- Tray icon: 16x16px PNG
- Startup at login: `app.setLoginItemSettings()` (user-level)
- Tray double-click: Opens NEST
- Right-click: Context menu

### macOS
- Dock icon hidden when minimized to tray
- Tray icon: Template image (not implemented yet)
- `app.dock.hide()` called on minimize

### Linux
- System tray support depends on desktop environment
- AppIndicator support needed (not implemented yet)

---

## Change Log

| Version | Changes |
|---------|---------|
| 0.1.0 | Initial behavior implementation |