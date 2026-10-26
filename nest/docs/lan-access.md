# LAN Access Guide

## The Binding Rule

**An application bound to `127.0.0.1` (localhost) is only accessible from the same computer.**

For LAN access, the application must listen on a non-loopback address:

| Bind Address | Accessible From |
|--------------|-----------------|
| `127.0.0.1` / `::1` | Localhost only |
| `0.0.0.0` / `::` | All interfaces (LAN + localhost) |
| `192.168.1.50` (specific LAN IP) | That interface only |

**NEST classifies binding into four categories:**

| Binding Class | Description | LAN Eligible |
|---------------|-------------|--------------|
| `loopback_only` | Listening on `127.0.0.1` or `::1` only | ❌ No |
| `all_interfaces` | Listening on `0.0.0.0` or `::` | ✅ Yes |
| `specific_lan` | Listening on a specific LAN IP | ✅ Yes (if matches selected interface) |
| `not_listening` | No listener on the port | ❌ No |

---

## The 10-Step LAN Access Workflow

When you click **Enable LAN Access**, NEST runs this exact sequence:

### Step 1: Preconditions
- ✅ App is registered
- ✅ Network interface selected
- ✅ Network profile is **Private** (not Public/Domain)

### Step 2: Binding Check
NEST inspects the actual listener on the app's port:
- `loopback_only` → **Offers LAN Launch Profile restart** (if managed) or **manual config instructions** (if external)
- `not_listening` → **Fails** (start the app first)
- `all_interfaces` / `specific_lan` → **Proceeds**

### Step 3: Change Plan
NEST shows exactly what will change:
- Firewall rule name: `NEST-<appId>`
- Port, protocol (TCP), profile (Private), remote address (LocalSubnet)
- Whether app restart is needed
- Risk notes (dev server exposure warnings)

### Step 4: User Confirmation
You must:
1. Type exactly: **"I understand the risks"**
2. Check the confirmation checkbox

### Step 5: Apply Changes
1. If restart needed → NEST restarts app with LAN Launch Profile
2. **UAC prompt** → Click **Yes** to allow firewall change
3. Firewall rule added (Windows Firewall, Inbound, TCP, Private, LocalSubnet)
3. **Read-back verification** → NEST confirms rule exists

### Step 6: Local Verification
NEST performs HTTP check from host via LAN IP. Must pass.

### Step 7: Remote Verification
- QR code generated for LAN URL
- **You must test from a second device** on the same network
- Click "I confirmed from remote device" only after successful test

### Step 8: Persist Policy
Only after Steps 5–6 succeed:
- Policy set to `lan_enabled`
- Firewall rule reference stored
- Last verification = `local_ok`

### Step 9: Disable / Rollback
- Removes firewall rule (with read-back verification)
- Restores policy to `lan_disabled`
- Optionally restarts app with local-only profile

### Step 10: Reconciliation (on startup)
- Verifies policy matches actual firewall rules
- Verifies listener matches expected binding
- Reports drift

---

## `0.0.0.0` ≠ LAN-Only

**Binding to `0.0.0.0` makes a service listen on ALL IPv4 interfaces.** This includes:
- Loopback (`127.0.0.1`)
- All LAN interfaces (Wi-Fi, Ethernet, VPN, Docker, etc.)
- All future interfaces

**The firewall is what restricts access to LAN.** NEST creates a rule scoped to:
- **Profile:** Private only (never Public)
- **Remote Address:** `LocalSubnet` (your LAN subnet only)
- **Group:** `NEST` (for identification and cleanup)

> ⚠️ If your network is misclassified as **Public**, Windows Firewall blocks the connection even with the rule. NEST refuses to create rules on Public profiles.

---

## Firewall Scope

| Property | Value | Why |
|----------|-------|-----|
| **Action** | Allow | Permit inbound connections |
| **Direction** | Inbound | Only incoming connections |
| **Protocol** | TCP | HTTP/HTTPS traffic |
| **Local Port** | Your app's port | Specific to your app |
| **Remote Address** | `LocalSubnet` | Only your LAN subnet |
| **Profile** | Private only | Never Public/Domain |
| **Group** | `NEST` | For identification/cleanup |
| **Name** | `NEST-<appId>` | Unique per app |

> The firewall rule **does not guarantee** connectivity. Router isolation, VPNs, other firewalls, and app-level auth can still block access.

---

## Network Profile: Private Only

| Profile | LAN Access | NEST Behavior |
|---------|------------|---------------|
| **Private** | ✅ Allowed | Creates firewall rule |
| **Public** | ❌ Blocked | Refuses, shows error |
| **Domain** | ⚠️ Varies | Depends on policy |

> Windows classifies networks when you first connect. Check **Settings → Network & Internet → Properties → Network profile type**.

---

## Common Connectivity Blockers

Even with correct binding and firewall rules, these can block LAN access:

| Blocker | Description | Resolution |
|---------|-------------|------------|
| **Client Isolation (AP Isolation)** | Wi-Fi router prevents device-to-device traffic | Disable AP Isolation in router settings |
| **VPN** | VPN routes traffic away from LAN | Disconnect VPN or configure split tunneling |
| **Third-party Firewall** | Norton, McAfee, Windows Defender (extra) | Add exception for NEST app/port |
| **Router Guest Network** | Guest isolation prevents LAN access | Use main network, not guest |
| **Windows Network Discovery** | Off by default on some profiles | Enable in Network & Sharing Center |
| **Subnet Mismatch** | Devices on different subnets | Ensure same subnet (e.g., 192.168.1.x) |
| **Docker/VPN Virtual Adapters** | May be selected as interface | Choose correct physical adapter in NEST |

---

## VPN Considerations

| Scenario | Behavior |
|----------|----------|
| **VPN Connected** | May create virtual adapter; NEST may select it. Choose physical adapter in Network settings. |
| **Split Tunneling** | If enabled, LAN traffic may bypass VPN. Test both with/without VPN. |
| **Corporate VPN** | Often blocks all local LAN traffic. Disconnect for LAN testing. |

---

## Dev Server Security Warnings

> ⚠️ **Enabling LAN access exposes your development server to every device on the network.**

Development servers often have:
- Debug endpoints (`/debug`, `/actuator`, `/metrics`)
- No authentication / default credentials
- Hot reload / code execution endpoints
- Database admin interfaces (Adminer, phpMyAdmin)
- Source maps / source code exposure

**Before enabling LAN access:**
- [ ] Verify no sensitive endpoints are exposed
- [ ] Add authentication if possible
- [ ] Disable debug/profiling endpoints in production-like config
- [ ] Ensure database/admin tools are not exposed
- [ ] Consider: would you be comfortable if a colleague accessed this?

> NEST **cannot** scan your app for vulnerabilities. You are responsible for what you expose.

---

## Troubleshooting LAN Access

| Symptom | Check |
|---------|-------|
| "LAN Access enabled" but can't connect | Run Diagnostics → review all 9 steps |
| Second device gets "Connection refused" | Verify app binds to `0.0.0.0`, not `127.0.0.1` |
| "Connection timed out" | Firewall rule missing, wrong profile, or router blocking |
| Works on Wi-Fi but not Ethernet | Different interfaces/subnets; select correct interface in NEST |
| Works then stops after reboot | Re-run LAN Access (IP may have changed); check startup-at-login |
| QR code doesn't work | LAN URL may have changed; re-run LAN Access |

---

## What NEST Guarantees / Doesn't Guarantee

| NEST Guarantees | NEST Does NOT Guarantee |
|-----------------|------------------------|
| Firewall rule created with correct scope | LAN connectivity from other devices |
| App restarted with LAN profile args | App accepts connections (app-level logic) |
| Policy persisted across reboots | Router/VPN/third-party firewall won't block |
| Rule removed on uninstall | App is secure (you must secure it) |

> **NEST manages the OS-level plumbing. Your application and network must do the rest.**