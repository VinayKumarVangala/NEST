# Manual LAN Access Test Checklist

This checklist is for verifying LAN access functionality on a real Windows machine with a second device on the same network.

## Prerequisites

- [ ] Windows 10/11 machine (Host) with NEST installed
- [ ] Second device (phone, tablet, or another computer) on the same Wi-Fi/LAN
- [ ] Both devices can ping each other
- [ ] Network profile is set to **Private** on the Host (Settings → Network & Internet → Properties → Network profile type: Private)
- [ ] Windows Firewall is enabled
- [ ] Test application that can listen on configurable port (e.g., Node.js `http-server`, Python `http.server`, or a simple Express/FastAPI app)

---

## Test Applications

Prepare at least two test applications:

### App 1: Loopback-only (should fail LAN enablement)
```bash
# Node.js example - only listens on localhost
npx http-server -p 3000 -a 127.0.0.1

# Or Python
python -m http.server 3000 --bind 127.0.0.1
```

### App 2: LAN-accessible (should succeed)
```bash
# Node.js example - listens on all interfaces
npx http-server -p 3001 -a 0.0.0.0

# Or Python
python -m http.server 3001 --bind 0.0.0.0

# Or with LAN launch profile support (for managed mode)
# App config should have lanLaunchProfile with args: ["-a", "0.0.0.0"]
```

---

## Test Scenarios

### 1. Basic Registration & Local Access
- [ ] Register App 1 (loopback-only) in NEST
- [ ] Register App 2 (LAN-accessible) in NEST
- [ ] Start both applications from NEST
- [ ] Verify both show "Running" process state
- [ ] Open local URLs (`http://localhost:3000`, `http://localhost:3001`) - both should work
- [ ] Verify health checks pass (green "Local" indicator)

### 2. Loopback-only Detection
- [ ] Select App 1 in NEST
- [ ] Verify "Port" indicator shows "Loopback" (amber)
- [ ] Verify "LAN" indicator shows "Disabled" (slate)
- [ ] Click "Enable LAN Access"
- [ ] **Expected**: Workflow stops at Step 2 (Binding Check) with action "manualConfig"
- [ ] **Expected**: Error message explains app is bound to 127.0.0.1 and must be reconfigured
- [ ] **Verify**: No firewall rule created

### 3. LAN Access Enablement (Full Workflow)
- [ ] Select App 2 in NEST
- [ ] Verify "Port" indicator shows "Listening" (green) with "0.0.0.0"
- [ ] Click "Enable LAN Access"
- [ ] **Step 1 - Preconditions**: Should pass (app registered, interface selected, Private profile)
- [ ] **Step 2 - Binding Check**: Should pass (all_interfaces)
- [ ] **Step 3 - Change Plan**: Review firewall rule details (name, port, LocalSubnet, Private profile)
- [ ] **Step 4 - User Confirmation**: 
  - [ ] Type exact text: "I understand the risks"
  - [ ] Check the checkbox
  - [ ] Click "Confirm & Continue"
- [ ] **Step 5 - Apply Changes**: 
  - [ ] UAC prompt appears for firewall rule creation
  - [ ] Click "Yes" to allow
  - [ ] Wait for "Read-back Verified: Yes"
- [ ] **Step 6 - Local Verification**: 
  - [ ] HTTP check passes from host via LAN IP
  - [ ] Shows latency in ms
- [ ] **Step 7 - Remote Verification**: 
  - [ ] QR code displayed with LAN URL
  - [ ] "Copy LAN URL" button works
- [ ] **Step 8 - Persist Policy**: Policy saved as `lan_enabled`
- [ ] **Result**: Green success banner with LAN URL and QR code

### 4. Second Device Connectivity Test
- [ ] On second device, open browser to the LAN URL (e.g., `http://192.168.1.50:3001`)
- [ ] **Expected**: Application loads successfully
- [ ] In NEST, click "I confirmed from a remote device"
- [ ] **Expected**: Remote verification status changes to "User confirmed" (green)
- [ ] **LAN indicator** on App Card changes to green "Verified"

### 5. Disable LAN Access (Rollback)
- [ ] Click "Disable LAN Access" on App 2
- [ ] Choose "Restart with local profile" if app has lanLaunchProfile
- [ ] **Expected**: 
  - Firewall rule removed (read-back verified)
  - Policy reverted to `lan_disabled`
  - App restarted with local-only binding (if lanLaunchProfile configured)
- [ ] Verify "LAN" indicator shows "Disabled" (slate)
- [ ] Verify second device can no longer access the LAN URL
- [ ] Verify local URL still works

### 6. Network Change Handling
- [ ] Re-enable LAN access for App 2
- [ ] Change Wi-Fi network or disconnect/reconnect (IP changes)
- [ ] **Expected**: Stale URL banner appears on App Card
- [ ] Banner shows old URL and new URL
- [ ] Click "Re-run LAN Access" on banner
- [ ] Workflow completes with new IP
- [ ] Second device can access new URL

### 7. Public Network Profile Block
- [ ] Change network profile to **Public** (Settings → Network & Internet → Properties → Public)
- [ ] Try to enable LAN access for any app
- [ ] **Expected**: Step 1 (Preconditions) fails with "Network profile must be Private"
- [ ] Change back to Private, verify it works again

### 8. Firewall Rule Verification
- [ ] Enable LAN access for App 2
- [ ] Open Windows Defender Firewall with Advanced Security
- [ ] Go to Inbound Rules
- [ ] Find rule named `NEST-<app-id>`
- [ ] **Verify**:
  - [ ] Action: Allow
  - [ ] Protocol: TCP
  - [ ] Local Port: Correct port (e.g., 3001)
  - [ ] Remote IP: Local subnet
  - [ ] Profile: Private only (not Public, not Domain)
  - [ ] Group: NEST
  - [ ] Enabled: Yes

### 9. Multiple Simultaneous Apps
- [ ] Enable LAN access for both App 1 (after reconfiguring to 0.0.0.0) and App 2
- [ ] Both should have separate firewall rules
- [ ] Both accessible from second device simultaneously
- [ ] Disable one, verify other still works

### 10. NEST Restart Recovery
- [ ] Enable LAN access for App 2
- [ ] Close NEST completely (Exit from tray)
- [ ] Reopen NEST
- [ ] **Expected**: 
  - App 2 shows "LAN access enabled"
  - Firewall rule still present
  - Reconciliation step passes
  - Second device can still access

### 11. Edge Cases
- [ ] Try enabling LAN access without selecting network interface → Should fail at Step 1
- [ ] Try enabling LAN access for app not running → Should fail at Step 1 or 2
- [ ] Try enabling LAN access for app on privileged port (<1024) → Warning shown but should work with elevation
- [ ] Register external app (already running) → Enable LAN access should work if listening on 0.0.0.0
- [ ] Kill app process externally → NEST detects crash, shows "Failed" state

---

## Diagnostic Report Verification

For each test, run Diagnostics and verify the output matches the brief's example format:

```
Application: <name>
Process: Running
Port <port>: Listening
Local HTTP check: Passed
LAN binding: Detected
Firewall rule: Enabled
Remote device check: Not performed / Confirmed by remote device

Result:
The application is configured for LAN access.
Verify connectivity from a second device on the same network.
```

---

## Expected Failures (Should Be Handled Gracefully)

- [ ] UAC denied for firewall rule → Error shown, no false success
- [ ] Firewall rule creation blocked by group policy → Clear error message
- [ ] App crashes during workflow → Workflow stops, state rolled back
- [ ] Network interface disappears mid-workflow → Appropriate error
- [ ] Second device on guest network (isolation) → Cannot connect, NEST shows "Unverified"

---

## Sign-off

| Test | Status | Notes |
|------|--------|-------|
| Basic Registration | ☐ Pass / ☐ Fail | |
| Loopback Detection | ☐ Pass / ☐ Fail | |
| Full Workflow | ☐ Pass / ☐ Fail | |
| Second Device Connectivity | ☐ Pass / ☐ Fail | |
| Rollback/Disable | ☐ Pass / ☐ Fail | |
| Network Change | ☐ Pass / ☐ Fail | |
| Public Profile Block | ☐ Pass / ☐ Fail | |
| Firewall Rule Verification | ☐ Pass / ☐ Fail | |
| Multiple Apps | ☐ Pass / ☐ Fail | |
| Restart Recovery | ☐ Pass / ☐ Fail | |
| Edge Cases | ☐ Pass / ☐ Fail | |
| Diagnostic Format | ☐ Pass / ☐ Fail | |

**Tester**: _______________ **Date**: _______________ **NEST Version**: _______________