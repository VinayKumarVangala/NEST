# NEST

## Host on your network.

**Project Brief · Windows-First Network Application Management Platform**

**Project type:** Standalone desktop application
**Initial platform:** Windows 10/11
**Primary objective:** Simplify the process of managing local development applications and making them accessible to other devices on the same local network.

---

# 1. Project Overview

NEST is a standalone Windows desktop application designed to centralize the management and network accessibility of development projects running on a computer.

Developers frequently work with multiple projects built using different programming languages, frameworks, runtimes, and development tools. These applications may run on different ports and require individual terminal commands, environment configurations, process monitoring, and network settings.

NEST provides a unified desktop interface through which users can register projects, start and stop applications, monitor their status, detect port conflicts, and configure approved local network access.

Once an application is configured for LAN access, other devices connected to the same reachable local network can access it using the host computer's LAN IP address and the application's port number.

NEST will initially use direct IP-and-port access without a reverse proxy, custom DNS server, public hosting infrastructure, or cloud dependency. Its architecture will prioritize operating-system integration, security, reliability, and future Linux compatibility.

**Core principle:** Manage the application centrally without requiring every application to be rewritten, regardless of the technology used to build it.

# 2. Project Objectives

1. Provide a single desktop interface for managing multiple development applications.
2. Support projects built with different languages, frameworks, and runtimes.
3. Allow users to register existing applications or configure NEST to launch them.
4. Automate application startup, shutdown, monitoring, and port-conflict detection.
5. Enable explicitly approved access from other devices on the local network.
6. Display accessible URLs using the computer's current LAN IP address and each application's port.
7. Integrate carefully with Windows networking and firewall controls.
8. Diagnose common connectivity failures and provide actionable troubleshooting guidance.
9. Maintain a security-first approach with localhost-only access as the default.
10. Design the internal architecture so Linux support can be added in a later phase.

# 3. Scope and Boundaries

## Included in the initial release

- Windows desktop application.
- Project registration and configuration.
- Process lifecycle management.
- Port detection and allocation assistance.
- LAN IP discovery.
- LAN accessibility configuration.
- Windows Firewall integration.
- Application health monitoring.
- Connectivity diagnostics.
- Logs and persistent configuration.
- Direct access through IP and port.

## Explicitly excluded from the initial release

- Public internet hosting and router port forwarding.
- Cloud tunnels and remote-access gateways.
- NGINX or another reverse proxy.
- Custom DNS and hostname-based application routing.
- Automatic modification of application source code.
- Automatic discovery and registration of every project on the computer.
- Running applications inside containers or virtual machines on behalf of users.
- Linux implementation in the first release.

These exclusions keep the first version focused on the core networking problem rather than expanding prematurely into a general-purpose hosting platform.

# 4. Technology Stack

The following stack is the chosen implementation stack for the first version. It is not a list of alternatives.

| Layer                    | Selected technology                                                                     | Responsibility                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Desktop runtime          | Electron                                                                                | Standalone Windows application, desktop lifecycle and native integration     |
| Frontend                 | React + TypeScript                                                                      | User interface and application dashboard                                     |
| UI styling               | Tailwind CSS                                                                            | Consistent interface and responsive layouts                                  |
| Backend runtime          | Node.js + TypeScript                                                                    | Application management, networking operations and orchestration              |
| Desktop integration      | Electron main process and Node.js APIs                                                  | Process management, filesystem access, network interfaces and OS integration |
| Local database           | SQLite                                                                                  | Projects, settings, access policies and diagnostic history                   |
| Database library         | better-sqlite3                                                                          | Local persistent storage                                                     |
| Input validation         | Zod                                                                                     | Validation of project configurations and IPC/API inputs                      |
| Testing                  | Vitest + Playwright                                                                     | Unit, integration and desktop UI testing                                     |
| Packaging                | Electron Forge                                                                          | Windows installer and distributable application                              |
| Windows network controls | Windows Firewall with Advanced Security, managed through a controlled PowerShell helper | Narrowly scoped firewall configuration                                       |

## Why Electron?

NEST needs more than a web dashboard. It must interact with the host operating system, launch processes, monitor ports, inspect network interfaces, and eventually manage firewall rules.

Electron allows the user interface and operating-system management to be packaged into a single Windows desktop application using one primary programming language: TypeScript.

The application will use Electron's main process for privileged desktop operations and a sandboxed renderer for the interface.

The frontend will not receive unrestricted access to Node.js APIs. All native operations will pass through a narrow, validated IPC interface.

## Windows-specific integration

Windows networking and firewall operations will be implemented behind a dedicated Windows adapter.

The adapter may use supported Node.js APIs and carefully controlled PowerShell commands where Windows-specific functionality is required.

NEST must never construct and execute arbitrary shell commands from user-provided input. Project commands and arguments must be stored separately, validated, and launched without unnecessary shell interpretation.

Administrative privileges will be requested only when a specific operation requires them, such as adding or removing an approved firewall rule.

# 5. High-Level Architecture

The system will follow a modular desktop architecture.

```text
┌─────────────────────────────────────────────┐
│              NEST Desktop UI                 │
│              React + TypeScript              │
│                                             │
│ Dashboard | Projects | Network | Settings    │
└──────────────────────┬──────────────────────┘
                       │
                 Validated IPC
                       │
┌──────────────────────▼──────────────────────┐
│             Electron Main Process            │
│                                             │
│ Application Manager                         │
│ Port Manager                                │
│ Network Manager                             │
│ Health Monitor                              │
│ Security Policy Manager                     │
│ Diagnostics Engine                          │
│ Database Repository                         │
└───────────┬──────────────┬──────────────────┘
            │              │
   ┌────────▼───────┐ ┌────▼─────────────────┐
   │ SQLite         │ │ Windows OS Adapter   │
   │ Project State  │ │ Processes / Network  │
   │ Configurations │ │ Firewall / Interfaces│
   └────────────────┘ └──────────┬───────────┘
                                 │
                      ┌──────────▼───────────┐
                      │ Registered Projects  │
                      │                      │
                      │ Node / Python / Java │
                      │ .NET / Other Runtimes│
                      └──────────────────────┘
```

Each project remains an independent application. NEST coordinates its lifecycle and access configuration without requiring the project to adopt NEST's programming language or framework.

# 6. Detailed Frontend Modules

## 6.1 Application Dashboard

The dashboard will be the primary landing page.

It must display:

- Total registered applications.
- Currently running applications.
- Stopped applications.
- Applications with errors.
- Applications enabled for LAN access.
- Current LAN IP address.
- Current network profile, where available.
- A summary of port conflicts and connectivity warnings.

Each project will appear as a compact application card.

Every card will show the project name, framework or runtime if known, status, port, local URL, LAN URL when applicable, and the most recent health-check result.

### Dashboard actions

- Start an application.
- Stop an application.
- Restart an application.
- Open the application in the default browser.
- Copy its local URL.
- Copy its LAN URL when LAN access is enabled.
- Open project details.
- View logs.
- Enable or disable LAN access.
- Remove a project registration without deleting its source files.

The dashboard must distinguish between an application that is running and one that is actually reachable. A running process does not guarantee a functioning HTTP service.

## 6.2 Project Registration Wizard

The registration wizard will guide users through adding an application.

### Required information

- Project display name.
- Project directory.
- Startup executable or runtime.
- Startup arguments.
- Working directory.
- Application port.
- Protocol: HTTP or HTTPS, where applicable.
- Health-check method and endpoint, if supported.

### Optional information

- Runtime label, such as Node.js, Python, Java, or .NET.
- Environment-variable configuration.
- Startup timeout.
- Health-check interval.
- Expected application response.
- Application description.

### Registration modes

**Mode A: Manage and launch**

NEST stores the startup configuration and launches the application itself.

This is the preferred mode because NEST can monitor the process, capture output, and coordinate startup and shutdown.

**Mode B: Register an already running application**

The user provides an existing application port. NEST inspects the listener, checks whether it can identify the owning process, and tests connectivity.

NEST must not automatically terminate or reconfigure an unidentified process.

For an externally managed application, NEST may be able to monitor it without owning its lifecycle. Any operations that NEST cannot safely perform must be clearly marked as unavailable.

### Startup configuration examples

Node.js:

```text
Runtime: node
Arguments: server.js
Working directory: C:\Projects\Scout
Port: 3000
```

Python:

```text
Runtime: python
Arguments: -m uvicorn main:app --host 0.0.0.0 --port 8000
Working directory: C:\Projects\ApiServer
Port: 8000
```

Java:

```text
Runtime: java
Arguments: -jar application.jar --server.port=8080
Working directory: C:\Projects\JavaApp
Port: 8080
```

These are illustrative configurations. The appropriate startup command depends on the actual application and framework.

NEST must not assume that every application supports the same command-line options or that changing the listening address works identically across frameworks.

## 6.3 Application Lifecycle Manager

Yes, NEST's document includes the Application Lifecycle Manager, which launches applications, captures their output, monitors their processes, and handles shutdown. But you're right to ask this because I didn't explicitly define how NEST keeps applications running without an open terminal window. We should make that requirement clear.

### How NEST will run applications without a terminal

The solution is to launch applications as background processes managed by NEST, rather than opening a separate terminal window for each project.

NEST Desktop

Click Start on Scout

NEST Process Manager

Launches the configured executable in the background

Scout

Node.js · Port 3000 · Running

Live

Python API

Python · Port 8000 · Running

Live

Both applications run without separate terminal windows. NEST displays their status and logs.

### Implementation in NEST

Since we chose Electron + Node.js + TypeScript, NEST can use Node.js's `child_process.spawn()` API to launch each project's runtime directly.

For example, instead of opening a terminal and running:

```
cd C:\Projects\Scout
npm run dev
```

NEST launches the equivalent configured executable and arguments in the background, with the correct working directory and environment variables.

```
import { spawn } from "node:child_process";

const child = spawn("npm.cmd", ["run", "dev"], {
  cwd: "C:\\Projects\\Scout",
  windowsHide: true,
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout?.on("data", (data) => {
  // Forward output to NEST's log manager.
});

child.stderr?.on("data", (data) => {
  // Forward errors to NEST's log manager.
});
```

This is an illustrative example. The production implementation must also handle Windows executable resolution, process termination, child processes, errors, and application-specific startup behavior.

## What happens when you close NEST?

We should explicitly support two separate behaviors:

| Action                      | Expected behavior                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Minimize NEST               | Applications continue running.                                                          |
| Close the main window       | NEST minimizes to the system tray, if background mode is enabled.                       |
| Stop an application in NEST | NEST stops the managed process and its relevant child processes safely.                 |
| Exit NEST                   | The user chooses whether managed applications should stop or continue running.          |
| Restart the computer        | Applications stop with Windows unless a separate startup mechanism has been configured. |

Important distinction: If NEST itself exits, processes it launched may continue running, but NEST will no longer supervise them. Therefore, for the initial release, I recommend keeping NEST running in the system tray whenever managed applications are active.

Later, we can add an optional Windows background service if you need applications to survive NEST closing, user logoff, or other desktop-session changes. That requires a separate service architecture and stronger permission controls.



### Background Execution and Supervision: 
NEST shall launch registered applications as background processes without requiring users to open or maintain terminal windows. It shall capture standard output and errors, track process identifiers and relevant child processes, monitor application health, and provide controlled start, stop, and restart operations. NEST shall support system-tray operation so managed applications can remain available while the main window is closed. Process persistence after NEST exits, Windows logoff, or system reboot shall be handled through explicitly configured mechanisms rather than assumed.

The lifecycle manager is responsible for launching and supervising registered applications.

### Supported operations

- Start.
- Stop.
- Restart.
- Process-status inspection.
- Startup timeout detection.
- Crash detection.
- Standard output and error capture.
- Graceful termination where supported.
- Forced termination only as a controlled fallback.

### Application states

The application state model will include:

- Registered.
- Starting.
- Running.
- Stopping.
- Stopped.
- Unhealthy.
- Failed.
- Externally managed.
- Unknown.

State transitions must be based on observed process and health information rather than optimistic assumptions.

For example, the application must not display Running merely because the startup command was submitted. It should first confirm that the process exists and, where applicable, that the expected service responds.

### Process ownership

NEST will track the process it launches and its known child processes.

Stopping an application must not terminate unrelated processes merely because they use a similar name or share a project directory.

Where process-tree termination is necessary, Windows-specific process management must be implemented carefully and tested against applications that spawn child processes.

## 6.4 Port Manager

The port manager will coordinate port discovery, conflict detection, and allocation assistance.

### Responsibilities

- Check whether a requested TCP port is available.
- Identify listening ports where Windows provides sufficient information.
- Identify the process associated with a port where possible.
- Warn when a port is already occupied.
- Suggest an available port.
- Associate configured ports with registered applications.
- Detect stale or changed port assignments.
- Distinguish a locally occupied port from an application that is reachable over the LAN.

NEST must not assume that an available port remains available indefinitely. The application should recheck immediately before startup and handle bind failures gracefully.

### Port allocation policy

When a user specifies a port, NEST should attempt to use it.

If it is occupied, NEST must explain the conflict and ask whether the user wants to choose another port. It must not silently change the application configuration and claim success.

For applications with dynamically allocated ports, NEST should initially require an explicitly configured port unless the application's integration supports reliable discovery of the actual bound port.

### TCP and UDP

The initial release will focus on TCP-based HTTP and HTTPS development services.

UDP applications may be registered as a future extension, but they will require separate listener detection, firewall handling, and connectivity checks. They should not be treated as interchangeable with TCP services.

## 6.5 Network Manager

The network manager determines how a registered service can be accessed.

### Responsibilities

- Discover available network interfaces.
- Identify IPv4 addresses suitable for LAN access.
- Detect changes in network interfaces and addresses.
- Display the current candidate LAN address.
- Generate the correct URL for a configured application.
- Check whether the application is listening on the expected port.
- Test local connectivity.
- Diagnose common reasons that a remote device cannot connect.

The interface must not assume that every network adapter represents a usable LAN. Virtual machines, VPNs, containers, and inactive adapters can expose additional addresses.

NEST should display the selected interface and let the user confirm the address used for LAN access.

### Address selection

If several candidate addresses exist, the user must be able to select the intended interface.

For example:

```text
Wi-Fi
IPv4: 192.168.1.20
Network access: Available

Ethernet
IPv4: 192.168.10.15
Network access: Not selected

VPN adapter
IPv4: 10.8.0.2
Network access: Not selected
```

The values above are examples only.

NEST must refresh the selected address after network changes and warn users if the URL they previously shared is no longer valid.

## 6.6 LAN Access Configuration

This is one of the most important modules in the application.

Enabling LAN access requires more than displaying an IP address. The application must actually listen on a reachable interface, and Windows Firewall and network conditions must allow the connection.

### Access states

Each application will have an explicit access policy:

- Local only.
- LAN access requested.
- LAN access enabled.
- LAN access unavailable.
- LAN access disabled.

The UI must distinguish between a requested policy and verified connectivity.

### LAN enablement workflow

1. The user selects Enable LAN Access.
2. NEST identifies the selected network interface and current IP address.
3. NEST verifies the application's listening address and port.
4. If the application is bound only to loopback, NEST explains that remote devices cannot directly reach that listener.
5. If the application is managed by NEST, it may restart the application with an appropriate host binding only when the registered configuration explicitly supports that change.
6. NEST explains the firewall change it intends to make.
7. The user confirms the exposure and any necessary administrative action.
8. NEST applies a narrowly scoped Windows Firewall rule when required and permitted.
9. NEST verifies local reachability and performs available connectivity checks.
10. NEST displays the LAN URL and the resulting access status.

If the application cannot be safely reconfigured, NEST must not pretend that LAN access has been enabled. It should explain the required manual change.

### Important binding rule

An application bound to `127.0.0.1` or `localhost` is normally accessible only from the same computer.

For direct LAN access, the application generally needs to bind to an appropriate non-loopback interface or to `0.0.0.0` for IPv4.

Binding to `0.0.0.0` makes a service listen on all applicable IPv4 interfaces. It does not mean "LAN only." Therefore, the firewall must still restrict incoming connections to the intended network and interface as far as Windows Firewall permits.

The actual network interface and firewall policy must be tested. NEST must not treat a successful local connection as proof that another device can connect.

## 6.7 Windows Firewall Manager

The firewall manager will use a narrow, auditable policy for applications enabled for LAN access.

### Required behavior

- Default to no new inbound firewall rules.
- Explain the proposed rule before applying it.
- Request elevation only when necessary.
- Restrict the rule to the required protocol and application port.
- Scope remote addresses to the intended local subnet where feasible.
- Prefer the Windows Private profile and never automatically open services on the Public profile.
- Associate rules with NEST-managed applications so they can be removed safely.
- Remove or disable NEST-managed rules when LAN access is revoked.
- Report when an existing system policy prevents a requested change.

NEST must not disable Windows Firewall or replace the machine's existing security policy.

A firewall rule does not guarantee successful connectivity. Router isolation, VPNs, other firewall products, application authentication, and network segmentation can still prevent access.

## 6.8 Application Health Monitor

The health monitor checks whether an application is functioning after startup and while running.

### Supported checks

**TCP check:** Determine whether a TCP connection can be established to the configured endpoint.

**HTTP check:** Send a request to a configured HTTP or HTTPS URL and inspect the response.

**Expected response:** Optionally check for an expected status code or response marker.

### Health states

- Healthy.
- Unhealthy.
- Checking.
- Unknown.
- Not applicable.

Health checks must have configurable timeouts and intervals. They must not generate excessive traffic or cause an application to be marked unhealthy because of one temporary delay.

The system must distinguish between:

- Process running.
- Port listening.
- Local application responding.
- LAN connectivity verified.

These are different conditions and should be reported separately.

## 6.9 Connectivity Diagnostics

NEST will provide a guided diagnostic tool for applications that cannot be reached.

### Diagnostic sequence

1. Is the application process running?
2. Is the configured port listening?
3. Does the listener use the expected address?
4. Can the host computer reach the application locally?
5. Is the selected LAN IP current?
6. Is a suitable firewall rule present?
7. Is the application configured for the intended protocol and path?
8. Can a remote device reach the endpoint, if a remote test is available?
9. Is the failure caused by network isolation or another external condition?

### Example output

```text
Application: Scout
Process: Running
Port 3000: Listening
Local HTTP check: Passed
LAN binding: Detected
Firewall rule: Enabled
Remote device check: Not performed

Result:
The application is configured for LAN access.
Verify connectivity from a second device on the same network.
```

NEST must avoid declaring a connection successful based solely on its own local checks. Remote connectivity should be labelled verified only when a remote test actually confirms it.

## 6.10 Logs and Activity History

The logs module will collect information about NEST operations and managed applications.

### Information to record

- Application startup and shutdown.
- Process exit codes.
- Port conflicts.
- Failed health checks.
- LAN access changes.
- Firewall rule changes.
- Diagnostic outcomes.
- Relevant operating-system errors.

The application should provide filters by project, event type, and time.

Logs must not capture passwords, secret environment variables, authentication tokens, or unnecessary sensitive application output. Retention should be configurable.

## 6.11 Settings and Security

The settings page will include:

- Default access policy.
- Preferred network interface.
- Health-check defaults.
- Log retention.
- Application startup behavior.
- Tray behavior.
- Confirmation preferences for network exposure.
- Diagnostic options.
- Application version and system information.

The default policy must always be Local only.

NEST must require explicit confirmation before enabling LAN access for a project. Remote administration of NEST itself is outside the initial scope.

## 6.12 Notifications and System Tray

The application may provide a Windows system-tray icon for convenient background operation.

Supported actions:

- Open NEST.
- View running applications.
- Start or stop a registered application.
- Review connectivity warnings.
- Exit NEST.

The behavior when the main window closes must be explicit. If background management is enabled, NEST should remain visible in the system tray and explain that managed applications may continue running.

When NEST exits, the user must be able to choose whether managed applications should continue running or be stopped. The default behavior should be documented and consistent.

# 7. Standardization Across Different Application Stacks

NEST will not require all applications to use a common internal programming language, framework, or application protocol.

Instead, it will standardize how NEST describes, starts, monitors, and exposes applications.

## 7.1 Common application contract

Every registered application will have a normalized configuration containing:

- Unique application ID.
- Display name.
- Project path.
- Startup executable.
- Startup arguments.
- Working directory.
- Environment-variable references.
- Configured protocol.
- Configured port.
- Expected listening address.
- Lifecycle ownership.
- Health-check configuration.
- LAN access policy.
- Current process and health state.

This contract belongs to NEST. Individual applications do not need to implement it.

## 7.2 Application-specific startup adapters

NEST will initially use a generic process adapter that launches an executable with arguments and a working directory.

The adapter must not assume that every project uses Node.js or Python.

Examples include:

- Node.js applications launched with `node` or a package-manager script.
- Python applications launched with `python` or a framework-specific command.
- Java applications launched with `java`.
- .NET applications launched with `dotnet`.
- Compiled applications launched through their executable.
- Other runtimes supported by the operating system.

Framework-specific presets may help users configure common applications, but all presets must produce the same normalized internal configuration.

## 7.3 Common communication protocol

For initial LAN access, NEST will use HTTP and HTTPS as the standard application access protocols.

For lifecycle management, NEST will communicate with its own frontend through validated Electron IPC.

For application health checks, NEST will use TCP connection checks or HTTP requests, depending on the configured service.

No special handshake between NEST and every registered application is required.

An application does not need to understand NEST. It only needs to start successfully and listen on the configured port and address.

If an application exposes a health endpoint, NEST can use it. Otherwise, NEST can perform a basic TCP check, with the limitation that a listening port does not prove the application is fully functional.

# 8. What Happens When a User Has Multiple Projects?

Suppose the user has three projects:

| Application    | Runtime | Port | Access URL                 |
| -------------- | ------- | ---: | -------------------------- |
| Scout          | Node.js | 3000 | `http://192.168.1.20:3000` |
| Analytics API  | Python  | 8000 | `http://192.168.1.20:8000` |
| Java Dashboard | Java    | 8080 | `http://192.168.1.20:8080` |

These addresses are illustrative.

The user registers each project in NEST, providing its directory, startup configuration, port, and any necessary health-check details.

NEST then:

1. Validates each project configuration.
2. Checks the requested ports.
3. Starts the configured applications when instructed.
4. Monitors their processes and service health.
5. Checks whether the services listen on the intended addresses.
6. Requests confirmation before enabling LAN access.
7. Applies appropriately scoped firewall rules where necessary.
8. Displays the correct access URL for each application.
9. Allows the user to copy a URL or open it in a browser.
10. Records status changes and diagnostic results.

A second device can open the corresponding URL if the service is listening on the LAN interface, firewall and network rules permit access, and the application accepts the request.

If the laptop's IP address changes, NEST must update its displayed URLs.

# 9. Handling Existing Applications

NEST must support two common situations.

## Situation A: Application already running on a LAN-accessible address

If a project is already listening on a suitable LAN interface and its port is accessible, NEST can register the port, inspect its status, perform health checks, and display the URL.

The user does not necessarily need to restart the application.

## Situation B: Application running only on localhost

If a project is listening only on `127.0.0.1`, other devices generally cannot connect to it directly through the laptop's LAN IP and that port.

NEST must identify this condition and explain the available action.

For a managed project, NEST may offer to restart it with a supported network binding. For an externally managed application, the user may need to change the application's configuration manually.

NEST must not claim that changing a firewall rule alone can fix a service that is listening only on loopback.

# 10. Data Model

The initial database will contain the following logical entities.

## Applications

- `id`
- `name`
- `project_path`
- `runtime`
- `executable`
- `arguments`
- `working_directory`
- `configured_port`
- `protocol`
- `health_check_config`
- `lifecycle_mode`
- `created_at`
- `updated_at`

## Runtime State

- `application_id`
- `process_id`
- `process_state`
- `port_state`
- `health_state`
- `last_health_check`
- `last_exit_code`
- `last_error`

Runtime state should be recoverable and refreshed when NEST starts. A stored process ID alone must never be treated as proof that the same application is still running.

## Access Policies

- `application_id`
- `access_mode`
- `selected_interface`
- `selected_address`
- `approved_port`
- `firewall_rule_reference`
- `last_verification`
- `policy_status`

## Activity Logs

- `id`
- `application_id`
- `event_type`
- `severity`
- `message`
- `timestamp`

The database should store configuration and history, not application secrets in plaintext. Credentials and sensitive environment variables should not be displayed in logs.

# 11. Security Architecture

Security is a core functional requirement, not an optional enhancement.

## 11.1 Least privilege

NEST should operate without administrative privileges for normal project management wherever possible.

Administrative access should be requested only for operations that require it. The firewall helper must expose a small, predefined set of operations rather than an unrestricted PowerShell execution facility.

## 11.2 Local management boundary

The management interface must not be exposed to other devices on the LAN.

Application access and NEST administration are separate capabilities. A user may intentionally expose a web application while keeping NEST's process-management controls private.

## 11.3 Command execution

The application must validate executable paths, arguments, project directories, and configuration values.

It must avoid constructing shell commands by concatenating arbitrary user input. Project startup commands should be represented as a validated executable plus an argument list.

## 11.4 Firewall safety

NEST must never disable Windows Firewall globally.

Firewall changes must be narrowly scoped, associated with NEST-managed policies, auditable, and reversible.

NEST must respect existing operating-system policies and report when permissions prevent a change.

## 11.5 Network trust

LAN access should be disabled by default on unknown or Public network profiles.

A private IP address is not a security boundary. Other devices on a shared network may still be able to connect to an exposed service.

NEST should warn that development servers may contain debug interfaces, sample credentials, or unauthenticated administrative endpoints. Users must ensure the application itself is appropriate for LAN access.

## 11.6 Security testing

The release must include tests confirming that:

- Applications default to localhost-only access where supported.
- No firewall rules are created without the required user action.
- LAN access can be revoked.
- NEST's management interface is not reachable by LAN clients.
- An unrelated process is not terminated during application shutdown.
- A port conflict does not cause NEST to launch a service under an unintended configuration.
- Public network profiles do not receive automatically broadened exposure rules.

# 12. Development Phases

Development will proceed in phases, with each phase delivering a testable result.

## Phase 1: Desktop Foundation

**Objective:** Establish the Windows desktop application and core project management.

Implementation:

- Initialize the Electron, React, and TypeScript project.
- Configure secure renderer isolation and validated IPC.
- Implement the main dashboard.
- Create the SQLite database and schema.
- Implement project registration and editing.
- Implement the generic process launcher.
- Capture standard output and standard error.
- Implement start, stop, restart, and process-state handling.
- Add unit tests for the core services.

**Acceptance criteria:**

- NEST installs and launches on Windows.
- Users can register at least two projects with different startup commands.
- Applications can be started and stopped from the interface.
- Process errors are reported accurately.
- No LAN access is enabled automatically.

## Phase 2: Port Management and Local Health

**Objective:** Make NEST reliable at managing local development services.

Implementation:

- Add port availability checks.
- Detect port conflicts.
- Identify listening processes where possible.
- Implement application health checks.
- Add application logs and diagnostic states.
- Add restart and crash handling.
- Validate startup timeouts and shutdown behavior.

**Acceptance criteria:**

- NEST detects an occupied port before attempting startup where possible.
- Applications that fail to bind their ports are reported as failed.
- A running process is not automatically classified as healthy.
- Port and health states remain accurate after restarting NEST.

## Phase 3: LAN Access

**Objective:** Allow explicitly approved development applications to be reached from another device on the same network.

Implementation:

- Discover and display network interfaces.
- Select the intended LAN interface.
- Generate LAN URLs.
- Detect loopback-only listeners.
- Add LAN access confirmation.
- Implement the Windows Firewall adapter.
- Add scoped firewall-rule creation and removal.
- Add local connectivity diagnostics.
- Provide clear access-state indicators.

**Acceptance criteria:**

- A localhost-only application is identified correctly.
- A supported application can be configured for LAN access.
- A second device can access the application when the network and firewall permit it.
- Disabling LAN access removes or disables NEST-managed exposure rules.
- NEST reports when access cannot be verified.

## Phase 4: Robustness and Security

**Objective:** Make NEST safe and dependable under ordinary development conditions.

Implementation:

- Add network-change handling.
- Test multiple simultaneous applications.
- Improve process-tree lifecycle handling.
- Harden configuration validation.
- Audit privileged operations.
- Add recovery for stale runtime state.
- Test public network profiles and permission failures.
- Add comprehensive regression tests.

**Acceptance criteria:**

- NEST handles application crashes without corrupting its configuration.
- Network changes update displayed URLs.
- Unrelated processes remain unaffected.
- Failed privileged operations are reported without falsely claiming success.
- LAN exposure remains explicit and revocable.

## Phase 5: Release and Documentation

**Objective:** Package NEST for practical use.

Implementation:

- Produce the Windows installer.
- Verify installation and upgrade behavior.
- Document project registration.
- Document LAN access and security implications.
- Add troubleshooting guides.
- Validate the application on a clean Windows installation.
- Prepare release notes and known limitations.

**Acceptance criteria:**

- A user can install NEST without a development environment.
- The packaged application can manage configured projects.
- Core functionality works after reboot and application relaunch.
- Documentation explains the limits of LAN connectivity and firewall automation.

## Phase 6: Optional Enhancements

Only after the previous phases are stable:

- Friendly application names and URL-path routing.
- Reverse-proxy integration.
- Additional hostname-resolution mechanisms.
- Linux support through an operating-system adapter.
- Additional application-specific startup presets.
- Optional remote-access integrations with separate security review.

These are future enhancements, not dependencies for the first release.

# 13. Testing and Evaluation Plan

NEST must be evaluated using observable results rather than visual appearance alone.

## Test environment

- One Windows laptop running NEST.
- At least two development applications using different runtimes.
- A second device connected to the same reachable Wi-Fi or LAN.
- A controlled test application with known listening and health behavior.

## Test scenarios

1. Register and start multiple applications.
2. Attempt to start an application on an occupied port.
3. Register an application listening only on localhost.
4. Enable LAN access for a supported application.
5. Access the application from the second device.
6. Revoke LAN access and verify that the service is no longer reachable through the intended network path.
7. Stop an application unexpectedly and observe the status.
8. Change the selected network or IP address.
9. Attempt an operation without required administrative privileges.
10. Restart NEST and verify recovery of application configuration and status.

## Metrics

- Time required to register an application.
- Time required to make a supported application accessible over the LAN.
- Port-conflict detection accuracy.
- Process-state detection accuracy.
- Health-check accuracy.
- Successful LAN connectivity rate under controlled conditions.
- False-positive and false-negative diagnostic rates.
- Correctness of firewall-rule creation and revocation.
- Recovery behavior following process failure or network change.

Manual configuration should be measured against NEST-assisted configuration under the same test conditions.

# 14. Implementation Checklist

## Desktop and application management

- [ ] Electron application initialized.
- [ ] React and TypeScript interface implemented.
- [ ] Secure IPC boundary implemented.
- [ ] SQLite database created.
- [ ] Project registration implemented.
- [ ] Start, stop, and restart operations implemented.
- [ ] Process output and error logging implemented.
- [ ] Runtime state recovery implemented.

## Port and health management

- [ ] Port availability checks implemented.
- [ ] Port conflicts reported.
- [ ] Listening process inspection implemented where supported.
- [ ] TCP health checks implemented.
- [ ] HTTP health checks implemented.
- [ ] Application health states implemented.
- [ ] Startup timeout handling implemented.

## Network and LAN access

- [ ] Network interface discovery implemented.
- [ ] LAN IP selection implemented.
- [ ] Local and LAN URLs displayed.
- [ ] Loopback-only binding detected.
- [ ] Explicit LAN access confirmation implemented.
- [ ] Windows Firewall adapter implemented.
- [ ] Narrowly scoped firewall rules tested.
- [ ] LAN access revocation tested.
- [ ] Network-change handling implemented.
- [ ] Second-device connectivity testing completed.

## Security and release

- [ ] Management API remains private.
- [ ] Renderer cannot execute arbitrary system commands.
- [ ] Administrative operations are narrowly scoped.
- [ ] No global firewall disabling.
- [ ] Public network exposure safeguards tested.
- [ ] Sensitive values excluded from logs.
- [ ] Windows installer created.
- [ ] Clean-install testing completed.
- [ ] User documentation and troubleshooting guide completed.

# 15. Known Limitations

NEST cannot guarantee that every arbitrary application can be made LAN-accessible automatically.

Applications may use different startup conventions, hard-code localhost, allocate dynamic ports, require authentication, depend on local files, or assume a particular URL prefix.

Some applications may require source-code or configuration changes before they can listen on a LAN interface.

Windows Firewall configuration may require administrative approval or may be restricted by organizational policy. Other network devices may enforce client isolation, and VPNs may alter routing.

NEST can diagnose and guide users through these issues, but it cannot override every operating-system, application, or network restriction.

The initial release will focus on applications that can be configured to listen on a known TCP port and accessed through HTTP or HTTPS.

# 16. Final Project Definition

NEST is a Windows-first desktop platform for managing development application lifecycles and enabling controlled access to those applications across a local network.

It standardizes application registration, process management, port handling, health monitoring, LAN URL generation, and network-access configuration without requiring applications to share a programming language or framework.

Its first release will use direct IP-and-port access, preserve localhost-only defaults, and integrate carefully with Windows Firewall. Reverse proxies, custom names, public internet exposure, and Linux support will be considered only after the core Windows workflow is reliable.

**NEST: Host on your network.**
