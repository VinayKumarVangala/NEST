# NEST — Local Network Application Host

NEST is a desktop application for managing and exposing local network services. It helps you run, monitor, and expose local development servers (Node.js, Python, .NET, Java, etc.) on your local network with proper firewall management, health monitoring, and diagnostics.

## Features

- **Process Management**: Start, stop, restart, and monitor local applications
- **Health Monitoring**: TCP, HTTP/HTTPS health checks with configurable intervals
- **Port Management**: Automatic port conflict detection and resolution
- **Network Access**: Controlled LAN exposure with Windows Firewall integration
- **Diagnostics**: Comprehensive health and connectivity diagnostics
- **Log Management**: Structured logging with redaction, filtering, and export
- **Auto-Restart**: Configurable exponential backoff restart policies
- **System Tray**: Background operation with tray menu

## Quick Start

### Prerequisites

- Node.js 20+
- Windows 10/11 (primary target)
- Electron 28+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/nest.git
cd nest

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building

```bash
# Build for production
npm run build

# Create Windows installer
npm run make
```

## Documentation

- [Setup Guide](docs/setup.md) - Installation and configuration
- [Behavior Reference](docs/behavior.md) - Application behaviors and policies
- [API Reference](docs/api.md) - IPC contracts and types

## Project Structure

```
nest/
├── src/
│   ├── main/                 # Main process (Electron)
│   │   ├── services/         # Business logic services
│   │   ├── ipc/             # IPC handlers
│   │   ├── db/              # Database layer
│   │   └── os/              # OS-specific adapters
│   ├── preload/             # Preload script
│   ├── renderer/            # React UI
│   │   ├── features/        # Feature modules
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom hooks
│   │   └── lib/             # Utilities
│   └── shared/              # Shared types, schemas, IPC contracts
├── resources/               # Icons, assets
├── docs/                    # Documentation
└── tests/                   # Unit and integration tests
```

## Development

### Commands

```bash
npm run dev          # Start development (main + renderer)
npm run build        # Build all targets
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Run unit tests
npm run test:e2e     # Run Playwright E2E tests
```

## Architecture

### Main Process Services

| Service               | Responsibility                                |
| --------------------- | --------------------------------------------- |
| ApplicationManager    | Process lifecycle, supervision, recovery      |
| HealthMonitor         | Health checks (TCP, HTTP), failure thresholds |
| PortManager           | Port checking, allocation, conflict detection |
| NetworkManager        | Network interfaces, profiles, selection       |
| SecurityPolicyManager | Firewall rules, LAN access policies           |
| DiagnosticsService    | Comprehensive diagnostics                     |
| LoggingService        | Structured logging, redaction, retention      |
| PortManager           | Port checking, allocation, conflict detection |

### IPC Communication

All communication between renderer and main process goes through typed IPC channels defined in `src/shared/ipc-contract.ts`.

### Database

SQLite (better-sqlite3) with WAL mode. Schema migrations on startup.

## Configuration

Settings stored in SQLite `settings` table:

```json
{
  "backgroundMode": true,
  "shutdownPolicy": "ask",
  "startupAtLogin": false,
  "logRetentionDays": 30,
  "logMaxLinesPerApp": 5000
}
```

## Security

- Context isolation enabled
- Node integration disabled
- Sandbox enabled
- No shell command execution from user input
- Secrets encrypted with Electron safeStorage
- Logs redacted at writer boundary
- Default LAN access: disabled (opt-in only)

## License

MIT
