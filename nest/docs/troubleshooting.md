# Troubleshooting Guide

Based on the 9-step diagnostic sequence from the design brief (§6.9).

---

## The 9 Diagnostic Steps

When an app isn't reachable, run **Diagnostics** in NEST. It checks:

| Step | Check | What It Means |
|------|-------|---------------|
| 1 | **Process Running?** | Is the app process alive? |
| 2 | **Port Listening?** | Is something bound to the port? |
| 3 | **Listener Address** | Is it `127.0.0.1`, `0.0.0.0`, or LAN IP? |
| 4 | **Local HTTP Check** | Can the host reach the app via LAN IP? |
| 5 | **Selected LAN IP Current** | Has the interface IP changed since LAN enable? |
| 6 | **Firewall Rule** | Rule exists, Private profile, LocalSubnet, correct port? |
| 7 | **Protocol/Path** | HTTP/HTTPS configured, health path valid? |
| 8 | **Remote Device** | Manual test from second device (QR code) |
| 9 | **External Causes** | Client isolation, VPN, other firewalls, guest network |

---

## Example Diagnostic Output

```
Application: Scout
Process: Running
Port 3000: Listening
Local HTTP check: Passed (42ms)
LAN binding: all_interfaces (0.0.0.0)
Firewall rule: Enabled (Private, LocalSubnet, port 3000)
Remote device check: Not performed

Result:
The application is configured for LAN access.
Verify connectivity from a second device on the same network.
```

---

## Common Issues & Solutions

### Step 1: Process Not Running

| Cause | Fix |
|-------|-----|
| App crashed | Check logs in NEST → Logs tab; fix crash, restart |
| Never started | Click **Start** in NEST |
| Startup timeout | Increase `startupTimeoutMs` in app config |
| Wrong working directory | Fix `workingDirectory` in app config |

### Step 2: Port Not Listening

| Cause | Fix |
|-------|-----|
| App failed to bind | Check app logs for "EADDRINUSE" or permission errors |
| Port conflict | NEST shows conflict; change port or stop conflicting app |
| App listening on different port | Update app config port to match |

### Step 3: Wrong Listener Address

| Binding | Meaning | Fix |
|---------|---------|-----|
| `loopback_only` (127.0.0.1) | LAN impossible | Add LAN Launch Profile with `--host 0.0.0.0`; or configure app to bind `0.0.0.0` |
| `not_listening` | App not started or wrong port | Start app; verify port in config |
| `specific_lan` (e.g., 192.168.1.50) | Only that interface | Ensure selected interface matches; or use `0.0.0.0` |

### Step 4: Local HTTP Check Fails

| Cause | Fix |
|-------|-----|
| No HTTP health check configured | Add HTTP health check with `/health` path |
| Wrong health path | Update `healthCheck.path` in app config |
| App returns non-200 | Check app logs; fix `/health` endpoint |
| App not ready | Increase `startupTimeoutMs`; check startup logs |
| TLS/HTTPS mismatch | Ensure protocol matches (http vs https) |

### Step 5: LAN IP Changed

| Cause | Fix |
|-------|-----|
| DHCP lease renewed | Click **Re-run LAN Access** on stale URL banner |
| Switched Wi-Fi networks | Select new interface in Network settings; re-run LAN Access |
| VPN connected/disconnected | Select correct physical adapter; re-run LAN Access |

### Step 6: Firewall Rule Issues

| Issue | Fix |
|-------|-----|
| No rule exists | Re-run LAN Access workflow (Step 5) |
| Rule exists but disabled | Enable rule in Windows Firewall; or re-run LAN Access |
| Wrong profile (Public) | Change network to Private; re-run LAN Access |
| Wrong port | Re-run LAN Access; verify app port matches |
| Wrong remote address | Must be `LocalSubnet`; re-run LAN Access |
| Rule exists but wrong group | Delete rule manually; re-run LAN Access |

### Step 7: Protocol/Path Issues

| Issue | Fix |
|-------|-----|
| HTTP check on HTTPS app | Set protocol to `https` in app config |
| Health path returns 404 | Add `/health` endpoint or update `healthCheck.path` |
| Self-signed cert (HTTPS) | Use `tcp` check instead; or trust cert system-wide |

### Step 8: Remote Device Fails

| Cause | Fix |
|-------|-----|
| Client isolation (AP isolation) | Disable AP isolation in router Wi-Fi settings |
| VPN active | Disconnect VPN or configure split tunneling |
| Third-party firewall | Add exception for port in Norton/McAfee/Windows Defender |
| Guest network | Use main network, not guest |
| Different subnet | Ensure both devices on same subnet (e.g., 192.168.1.x) |
| Windows Network Discovery off | Enable in Network & Sharing Center |
| App requires auth | Test with auth disabled first; then add credentials |

### Step 9: External Causes (Guidance, Not Verdicts)

NEST lists these as **possible causes**, never as definitive verdicts:

| Possible Cause | How to Test |
|----------------|-------------|
| Client isolation (AP isolation) | Try wired Ethernet; check router "AP Isolation" setting |
| VPN routing | Disconnect VPN; test again |
| Third-party firewall | Temporarily disable Norton/McAfee/ZoneAlarm |
| Router guest network | Ensure both devices on main network |
| Windows Network Discovery | Enable in Control Panel → Network & Sharing Center |
| Subnet mismatch | Verify both devices same subnet (e.g., 192.168.1.x) |

> NEST presents these as **advice**, never as a verdict. The root cause may be something else entirely.

---

## Quick Diagnostic Commands

Run these in PowerShell (Admin) to verify manually:

```powershell
# 1. Process running?
Get-Process -Name "node" # or your app name

# 2. Port listening?
netstat -ano | findstr :3000
# Or: Get-NetTCPConnection -LocalPort 3000 -State Listen

# 3. Listener address
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select LocalAddress, LocalPort, OwningProcess

# 4. Local HTTP check
curl http://192.168.1.50:3000/health

# 5. Network interface IP
Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.IPv4Address.IPAddress -notlike '127.*' }

# 6. Firewall rules
Get-NetFirewallRule -Group NEST | Select Name, Enabled, Profile, LocalPort, RemoteAddress

# 7. Firewall profile
Get-NetConnectionProfile | Select Name, NetworkCategory

# 8. Test from remote (run on second device)
# curl http://<LAN-IP>:3000/health

# 9. Check for AP isolation / VPN / third-party firewall
# (Manual checks - no single command)
```

---

## Diagnostic Report Format

NEST's diagnostic report matches the brief's example format:

```
Application: <name>
Process: <Running|Stopped|Failed>
Port <port>: <Listening|Not Listening>
Local HTTP check: <Passed|Failed|Not configured>
LAN binding: <Detected|Loopback Only|Not Listening>
Firewall rule: <Enabled|Disabled|Missing>
Remote device check: <Not performed|Confirmed by remote device>

Result:
The application is configured for LAN access.
Verify connectivity from a second device on the same network.
```

> NEST **never** declares "LAN verified" from local checks alone. Remote verification requires explicit user confirmation from a second device.

---

## When to Contact Support

If all 9 steps pass but LAN still fails:
1. Run the PowerShell commands above
2. Collect: diagnostic report, firewall rule output, `netstat` output
3. Check router: AP isolation, guest network, subnet
4. Check VPN/third-party firewall
5. File issue with all collected data