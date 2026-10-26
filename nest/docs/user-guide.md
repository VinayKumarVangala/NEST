# User Guide

## Registering an Application

NEST can manage any application that runs as a process and listens on a TCP port. The registration wizard guides you through the required fields.

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Display name in NEST | `API Server` |
| **Project Path** | Root directory of the project | `C:\Projects\api-server` |
| **Executable** | Command to run (must be in PATH or full path) | `node` / `python` / `dotnet` / `java` |
| **Arguments** | Arguments passed to executable | `server.js` / `-m uvicorn main:app` |
| **Working Directory** | Directory to run from (usually project root) | `C:\Projects\api-server` |
| **Port** | TCP port the app listens on | `3000` |
| **Protocol** | `http` or `https` | `http` |

### Optional Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Runtime Label** | Informational tag | `Node.js 20` / `Python 3.11` |
| **Environment Variables** | Key/value pairs, mark secrets | `NODE_ENV=production` |
| **Startup Timeout** | Max time to wait for port (ms) | `30000` |
| **Health Check** | `tcp` / `http` / `none` | `http` |
| **Health Check Path** | For HTTP checks | `/health` |
| **Expected Status** | Expected HTTP status | `200` |
| **LAN Launch Profile** | Args/env for LAN mode (see below) | `--host 0.0.0.0` |

---

## Framework Examples

> ⚠️ **Important:** The exact flags vary by framework and version. The examples below are common patterns — consult your framework's documentation for the exact flags to bind to `0.0.0.0` or a specific interface.

### Node.js (Express, Fastify, Next.js, etc.)

| Field | Value |
|-------|-------|
| Executable | `node` |
| Arguments | `server.js` |
| Working Directory | `C:\Projects\my-app` |
| Port | `3000` |
| **LAN Launch Profile Args** | `["--host", "0.0.0.0"]` |

**Express:**
```bash
# Default binds to 127.0.0.1
node server.js

# For LAN access, use LAN Launch Profile:
# Args: ["--host", "0.0.0.0"]
# Or set in code: app.listen(3000, '0.0.0.0')
```

**Fastify:**
```bash
# Default binds to 127.0.0.1
node server.js

# LAN Launch Profile Args: ["--address", "0.0.0.0"]
# Or in code: fastify.listen({ port: 3000, host: '0.0.0.0' })
```

**Next.js (dev):**
```bash
# next dev binds to 127.0.0.1 by default
npx next dev

# LAN Launch Profile Args: ["-H", "0.0.0.0"]
# Or: next dev -H 0.0.0.0
```

**Vite (React/Vue/Svelte):**
```bash
# npm run dev binds to 127.0.0.1
npm run dev

# LAN Launch Profile Args: ["--host", "0.0.0.0"]
# Or: npx vite --host 0.0.0.0
```

---

### Python (Flask, FastAPI, Django, aiohttp)

| Field | Value |
|-------|-------|
| Executable | `python` |
| Arguments | `-m uvicorn main:app --host 127.0.0.1 --port 8000` |
| Working Directory | `C:\Projects\api` |
| Port | `8000` |
| **LAN Launch Profile Args** | `["--host", "0.0.0.0"]` |

**FastAPI (uvicorn):**
```bash
# Local only (default)
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# LAN Launch Profile Args: ["--host", "0.0.0.0"]
# Or: uvicorn main:app --host 0.0.0.0 --port 8000
```

**Flask:**
```bash
# Default binds to 127.0.0.1
flask run --port 5000

# LAN Launch Profile Args: ["--host", "0.0.0.0"]
# Or: flask run --host 0.0.0.0 --port 5000
```

**Django:**
```bash
# Default binds to 127.0.0.1
python manage.py runserver 8000

# LAN Launch Profile Args: ["0.0.0.0:8000"]
# Or: python manage.py runserver 0.0.0.0:8000
```

**aiohttp:**
```python
# In code:
web.run_app(app, host='127.0.0.1', port=8080)
# Change to host='0.0.0.0' for LAN
```

---

### Java (Spring Boot, Quarkus, Micronaut)

| Field | Value |
|-------|-------|
| Executable | `java` |
| Arguments | `-jar app.jar --server.port=8080` |
| Working Directory | `C:\Projects\java-app` |
| Port | `8080` |
| **LAN Launch Profile Args** | `["--server.address=0.0.0.0"]` |

**Spring Boot:**
```bash
# Default binds to 127.0.0.1
java -jar app.jar --server.port=8080

# LAN Launch Profile Args: ["--server.address=0.0.0.0"]
# Or in application.yml:
# server:
#   address: 0.0.0.0
#   port: 8080
```

**Quarkus:**
```bash
# quarkus.http.host=0.0.0.0 in application.properties
# Or LAN Launch Profile Args: ["-Dquarkus.http.host=0.0.0.0"]
```

---

### .NET (ASP.NET Core)

| Field | Value |
|-------|-------|
| Executable | `dotnet` |
| Arguments | `run --urls "http://127.0.0.1:5000"` |
| Working Directory | `C:\Projects\webapp` |
| Port | `5000` |
| **LAN Launch Profile Args** | `["--urls", "http://0.0.0.0:5000"]` |

**ASP.NET Core:**
```bash
# Default binds to 127.0.0.1
dotnet run --urls "http://127.0.0.1:5000"

# LAN Launch Profile Args: ["--urls", "http://0.0.0.0:5000"]
# Or in launchSettings.json / appsettings.json:
# "Urls": "http://0.0.0.0:5000"
```

**Kestrel (programmatic):**
```csharp
// Program.cs
builder.WebHost.UseUrls("http://0.0.0.0:5000");
```

---

### Go

| Field | Value |
|-------|-------|
| Executable | `go` |
| Arguments | `run main.go` |
| Working Directory | `C:\Projects\go-app` |
| Port | `8080` |
| **LAN Launch Profile Args** | (modify code to listen on `0.0.0.0`) |

```go
// Default binds to 127.0.0.1
http.ListenAndServe(":8080", nil)

// For LAN:
http.ListenAndServe("0.0.0.0:8080", nil)
```

---

### Rust (Axum, Actix, Warp)

| Field | Value |
|-------|-------|
| Executable | `cargo` |
| Arguments | `run` |
| Working Directory | `C:\Projects\rust-app` |
| Port | `3000` |
| **LAN Launch Profile** | Modify code to bind `0.0.0.0` |

```rust
// Axum
let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
// For LAN:
let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
```

---

### PHP (Built-in Server, Laravel, Symfony)

| Field | Value |
|-------|-------|
| Executable | `php` |
| Arguments | `-S 127.0.0.1:8000 -t public` |
| Working Directory | `C:\Projects\laravel` |
| Port | `8000` |
| **LAN Launch Profile Args** | `["-S", "0.0.0.0:8000", "-t", "public"]` |

---

### Docker-based Apps (Registered as External)

If your app runs in Docker, register it as **External**:

| Field | Value |
|-------|-------|
| Mode | Register External |
| Name | `PostgreSQL` |
| Port | `5432` |
| Protocol | `tcp` (for health check) |

NEST will monitor the port but won't manage the container lifecycle.

---

## LAN Launch Profile

The **LAN Launch Profile** lets NEST restart your app with different arguments when you enable LAN access. This is essential for apps that default to `127.0.0.1`.

| App Config | LAN Launch Profile Args | Result |
|------------|------------------------|--------|
| `node server.js` | `["--host", "0.0.0.0"]` | `node server.js --host 0.0.0.0` |
| `python -m uvicorn main:app --host 127.0.0.1 --port 8000` | `["--host", "0.0.0.0"]` | `python -m uvicorn main:app --host 0.0.0.0 --port 8000` |
| `dotnet run --urls "http://127.0.0.1:5000"` | `["--urls", "http://0.0.0.0:5000"]` | `dotnet run --urls "http://0.0.0.0:5000"` |

**How it works:**
1. You register app with local-only args
2. When enabling LAN, NEST stops the app
3. NEST restarts with LAN Launch Profile args (merged with original)
3. App now listens on `0.0.0.0` or LAN IP
4. NEST adds firewall rule
5. When disabling LAN, NEST restarts with original args

**Limitations:**
- Only works for **managed** apps (NEST launched them)
- App must support the LAN args you provide
- Some apps require config file changes instead (Spring Boot, Django settings)

---

## Health Checks

| Type | Use When | Configuration |
|------|----------|---------------|
| `none` | No check, assume healthy | None |
| `tcp` | Any TCP service | Port only |
| `http` | HTTP/HTTPS services | Path, expected status, optional body contains |

**Example HTTP health check:**
```json
{
  "type": "http",
  "path": "/health",
  "expectedStatus": 200,
  "expectedBodyContains": "healthy",
  "intervalMs": 30000,
  "timeoutMs": 5000,
  "failureThreshold": 3
}
```

---

## External Applications

If your app is already running (not launched by NEST), use **Register External**:

1. Click "Register External Application"
2. Provide name, port, protocol
3. NEST inspects the listener, verifies connectivity
4. NEST monitors health but **cannot** start/stop/restart

**Limitations for external apps:**
- No auto-restart on crash
- No LAN Launch Profile (you must configure binding manually)
- Cannot stop/start from NEST
- Health monitoring only