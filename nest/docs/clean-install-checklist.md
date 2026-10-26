# NEST Clean Install Checklist

**Version:** 0.1.0  
**Date:** 2024  
**Tester:** _______________  
**Environment:** Windows 10/11 (Sandbox/VM)  
**Build:** `NEST-Setup.exe` (unsigned or signed)

---

## Prerequisites

- [ ] Windows 10 21H2+ or Windows 11 (fresh Sandbox/VM)
- [ ] No development tools installed (no Node.js, Visual Studio, etc.)
- [ ] No prior NEST installation
- [ ] Administrator account for UAC prompts
- [ ] Network: Private profile (Wi-Fi/Ethernet set to Private)
- [ ] Second device on same LAN for remote verification

---

## Test Artifacts

| Artifact | Source | SHA256 |
|----------|--------|--------|
| `NEST-Setup.exe` | `electron-forge make` | ________ |
| Sample app | `tests/fixtures/test-apps/lan-server.js` | N/A |

---

## 1. Install

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 1.1 | Run `NEST-Setup.exe` (no admin) | Installer launches, no UAC for install | ☐ |
| 1.2 | Accept defaults | Installs to `%LOCALAPPDATA%\NEST` | ☐ |
| 1.3 | Finish installer | NEST launches, tray icon appears | ☐ |
| 1.4 | Verify install location | Files in `%LOCALAPPDATA%\NEST` | ☐ |
| 1.5 | Verify auto-start | Tray icon present after reboot (if enabled) | ☐ |

**Install Path:** `%LOCALAPPDATA%\NEST`  
**Executable:** `%LOCALAPPDATA%\NEST\NEST.exe`  
**Data Dir:** `%APPDATA%\NEST` (database, logs, settings)

---

## 2. Register Sample App (LAN-Accessible)

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 2.1 | Open NEST UI | Dashboard loads | ☐ |
| 2.2 | Click "Register Application" | Wizard opens | ☐ |
| 2.3 | Name: `LAN Test Server` | Accepted | ☐ |
| 2.4 | Project Path: `C:\TestApps\LanServer` | Accepted (create dir) | ☐ |
| 2.5 | Executable: `node` | Accepted | ☐ |
| 2.6 | Arguments: `lan-server.js` | Accepted | ☐ |
| 2.7 | Working Dir: `C:\TestApps\LanServer` | Accepted | ☐ |
| 2.8 | Port: `3101` | Accepted (free) | ☐ |
| 2.9 | Protocol: `http` | Accepted | ☐ |
| 2.10 | LAN Launch Profile: Args `["--host","0.0.0.0"]` | Accepted | ☐ |
| 2.11 | Health Check: HTTP `/health` | Accepted | ☐ |
| 2.12 | Finish | App appears in list | ☐ |

**Sample App Location:** Copy `tests/fixtures/test-apps/lan-server.js` to `C:\TestApps\LanServer\lan-server.js`

---

## 3. Start / Stop / Restart

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 3.1 | Click "Start" on LAN Test Server | Status: Starting → Running | ☐ |
| 3.2 | Verify local URL `http://localhost:3101` | Opens in browser, shows "LAN server running" | ☐ |
| 3.3 | Verify health check | Status: Healthy (green) | ☐ |
| 3.4 | Click "Restart" | Status: Stopping → Starting → Running | ☐ |
| 3.5 | Click "Stop" | Status: Stopped | ☐ |
| 3.6 | Restart again | Running again | ☐ |
| 3.7 | Verify tray menu | Start/Stop/Restart work from tray | ☐ |

---

## 4. Enable LAN Access (Full Workflow)

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 4.1 | Ensure Network Profile = Private | Settings → Network → Private | ☐ |
| 4.2 | Select Network Interface | Wi-Fi/Ethernet selected | ☐ |
| 4.3 | Click "Enable LAN Access" on app | Workflow dialog opens | ☐ |
| 4.4 | **Step 1: Preconditions** | Pass (app registered, interface selected, Private) | ☐ |
| 4.5 | **Step 2: Binding Check** | Pass (all_interfaces via LAN launch profile) | ☐ |
| 4.6 | **Step 3: Change Plan** | Shows firewall rule, restart needed | ☐ |
| 4.7 | **Step 4: Confirmation** | Type "I understand the risks", check checkbox | ☐ |
| 4.8 | **Step 5: Apply** | UAC prompt → Firewall rule added → App restarted with LAN profile | ☐ |
| 4.8.1 | UAC Prompt | Appears, click Yes | ☐ |
| 4.8.2 | Firewall Rule Created | `NEST-<appId>` rule in Windows Firewall (Inbound, TCP, Private, LocalSubnet) | ☐ |
| 4.8.3 | App Restarted with LAN Profile | Process listening on 0.0.0.0:3101 | ☐ |
| 4.9 | **Step 6: Local Verification** | HTTP check via LAN IP passes | ☐ |
| 4.10 | **Step 7: Remote Verification** | QR code displayed | ☐ |
| 4.11 | **Step 8: Persist Policy** | Policy = `lan_enabled` saved | ☐ |
| 4.12 | LAN URL displayed | `http://<LAN-IP>:3101` | ☐ |
| 4.13 | Copy LAN URL / QR Code | Copied to clipboard / QR shown | ☐ |

**Firewall Rule Verification:**
```powershell
Get-NetFirewallRule -Group NEST | Select Name, Enabled, Profile, LocalPort, RemoteAddress
```
Expected: `NEST-<appId>`, Enabled=True, Profile=Private, LocalPort=3101, RemoteAddress=LocalSubnet

---

## 5. Remote Device Verification

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 5.1 | On second device, open browser to LAN URL | Page loads, shows "LAN server running" | ☐ |
| 5.2 | In NEST, click "I confirmed from remote device" | Verification = User Confirmed (green) | ☐ |
| 5.3 | Dashboard LAN indicator | Green "Verified" | ☐ |

---

## 6. Reboot & Relaunch (Persistence)

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 6.1 | Reboot Windows | System restarts | ☐ |
| 6.2 | Log in | NEST tray icon appears (if startup-at-login enabled) | ☐ |
| 6.3 | Open NEST UI | Apps listed, states recovered | ☐ |
| 6.4 | Verify LAN Test Server | Status: Running (auto-restarted) | ☐ |
| 6.4.1 | Local URL works | `http://localhost:3101` | ☐ |
| 6.4.2 | LAN URL works | `http://<LAN-IP>:3101` | ☐ |
| 6.5 | Verify firewall rule persisted | `Get-NetFirewallRule -Group NEST` shows rule | ☐ |
| 6.6 | Verify DB intact | `nest.db` in `%APPDATA%\NEST` | ☐ |
| 6.7 | Verify settings persisted | Network interface, startup-at-login, etc. | ☐ |

---

## 7. Tray Behavior

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 7.1 | Close main window (X) | Minimizes to tray, apps keep running | ☐ |
| 7.2 | Tray right-click → Open | Main window opens | ☐ |
| 7.3 | Tray right-click → App → Stop | App stops | ☐ |
| 7.4 | Tray right-click → App → Start | App starts | ☐ |
| 7.5 | Tray → Review Warnings | Opens Diagnostics | ☐ |
| 7.6 | Tray → Exit | Prompts shutdown policy | ☐ |

---

## 8. Startup-at-Login Option

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 8.1 | Settings → Startup at Login = ON | Toggles on | ☐ |
| 8.2 | Reboot | NEST starts automatically, tray icon appears | ☐ |
| 8.3 | Settings → Startup at Login = OFF | Toggles off | ☐ |
| 8.4 | Reboot | NEST does NOT start automatically | ☐ |

---

## 9. Shutdown Policy

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 9.1 | Settings → Shutdown Policy = "Stop All Apps & Exit" | Saved | ☐ |
| 9.2 | Start app, Exit NEST (tray → Exit) | Prompt: "Stop All Apps & Exit" / "Keep Apps Running" / "Cancel" | ☐ |
| 9.3 | Choose "Stop All Apps & Exit" | Apps stopped, NEST exits | ☐ |
| 9.4 | Restart NEST, start app | Running | ☐ |
| 9.5 | Settings → Shutdown Policy = "Keep Apps Running" | Saved | ☐ |
| 9.6 | Exit NEST (tray → Exit) | Apps keep running, NEST exits | ☐ |

---

## 10. Uninstall

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 10.1 | Windows Settings → Apps → NEST → Uninstall | Uninstaller runs | ☐ |
| 10.2 | UAC prompt for firewall removal | Appears, click Yes | ☐ |
| 10.3 | Verify firewall rules removed | `Get-NetFirewallRule -Group NEST` returns nothing | ☐ |
| 10.4 | User data prompt | "User data preserved" (default) | ☐ |
| 10.5 | Re-run with `--remove-user-data` | User data folder removed | ☐ |
| 10.6 | App data gone | `%APPDATA%\NEST` removed | ☐ |
| 10.7 | App uninstalled | No tray icon, no `%LOCALAPPDATA%\NEST` | ☐ |

**PowerShell Verification:**
```powershell
# Firewall rules
Get-NetFirewallRule -Group NEST

# App data
Test-Path "$env:APPDATA\NEST"
Test-Path "$env:LOCALAPPDATA\NEST"
```

---

## 11. Network Change Handling

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 11.1 | Disconnect Wi-Fi / Switch network | Network change detected | ☐ |
| 11.2 | NEST detects IP change | Stale URL banner appears on app card | ☐ |
| 11.3 | Click "Re-run LAN Access" on banner | LAN workflow re-runs, new IP | ☐ |
| 11.4 | New LAN URL works | Accessible from second device | ☐ |
| 11.5 | Firewall rule updated | Rule reflects new subnet (if changed) | ☐ |

---

## 12. Diagnostics

| Step | Action | Expected | Pass/Fail |
|------|--------|----------|-----------|
| 12.1 | Open Diagnostics tab | Lists all apps | ☐ |
| 12.2 | Run Diagnostics on LAN Test Server | All 9 steps pass | ☐ |
| 12.3 | Verify output format | Matches brief §6.9 example format | ☐ |
| 12.4 | Copy Report | Clipboard contains full report | ☐ |

---

## 13. Settings Persistence

| Setting | Verify Persists After Reboot | Pass/Fail |
|---------|------------------------------|-----------|
| Network Interface | ☐ | ☐ |
| Startup at Login | ☐ | ☐ |
| Shutdown Policy | ☐ | ☐ |
| Log Retention Days | ☐ | ☐ |
| Confirmation Preferences | ☐ | ☐ |
| Log Max Lines Per App | ☐ | ☐ |

---

## 13. Firewall Rule Audit

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Rule Name: `NEST-<appId>` | ☐ | ☐ |
| Group: `NEST` | ☐ | ☐ |
| Enabled: True | ☐ | ☐ |
| Action: Allow | ☐ | ☐ |
| Direction: Inbound | ☐ | ☐ |
| Protocol: TCP | ☐ | ☐ |
| Local Port: 3101 | ☐ | ☐ |
| Remote Address: LocalSubnet | ☐ | ☐ |
| Profile: Private | ☐ | ☐ |
| Enabled: True | ☐ | ☐ |

---

## 14. Database Verification

| Table | Rows Expected | Pass/Fail |
|-------|---------------|-----------|
| `applications` | 1 (LAN Test Server) | ☐ |
| `runtime_state` | 1 (Running) | ☐ |
| `access_policies` | 1 (lan_enabled) | ☐ |
| `activity_logs` | >0 (start, lan_enable, etc.) | ☐ |
| `settings` | All settings present | ☐ |
| `schema_migrations` | 2 migrations applied | ☐ |

---

## 14. Logs & Audit

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Activity logs show `lan_enable` event | ☐ | ☐ |
| Activity logs show `firewall_change` (added) | ☐ | ☐ |
| Audit log shows `lan_enable` → `success` | ☐ | ☐ |
| Audit log shows `firewall_add` → `success` | ☐ | ☐ |
| Audit log shows `firewall_remove` on uninstall | ☐ | ☐ |

---

## Summary

| Category | Total Checks | Passed | Failed | Notes |
|----------|--------------|--------|--------|-------|
| Install | 5 | | | |
| Register App | 12 | | | |
| Start/Stop/Restart | 7 | | | |
| LAN Access Workflow | 13 | | | |
| Remote Verification | 3 | | | |
| Reboot/Persistence | 7 | | | |
| Tray Behavior | 6 | | | |
| Startup-at-Login | 4 | | | |
| Shutdown Policy | 6 | | | |
| Uninstall | 7 | | | |
| Network Change | 5 | | | |
| Diagnostics | 4 | | | |
| Settings Persistence | 6 | | | |
| Firewall Audit | 10 | | | |
| Database | 6 | | | |
| Logs & Audit | 5 | | | |
| **TOTAL** | **117** | | | |

---

## Sign-off

**Tester:** _______________  
**Date:** _______________  
**Build:** _______________  
**Overall Result:** ☐ PASS / ☐ FAIL

**Notes:**
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________