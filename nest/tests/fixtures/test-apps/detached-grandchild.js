/**
 * Detached grandchild test server
 * Spawns a child that detaches (simulates "start" or service-like behavior)
 */

const { spawn } = require('child_process');

const PORT = process.env.PORT || 3200;
const HOST = process.env.HOST || '0.0.0.0';

let detachedChild = null;

function spawnDetachedChild() {
  // Spawn a process that detaches from parent
  detachedChild = spawn(process.execPath, ['-e', `
    // This simulates a detached child (like a service)
    console.log('[Detached Grandchild] Started, PID:', process.pid);
    console.log('[Detached Grandchild] Parent PID:', process.ppid);
    
    // Create HTTP server
    const http = require('http');
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          pid: process.pid,
          parent: process.ppid,
          timestamp: Date.now() 
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Detached grandchild\\n');
    });
    
    server.listen(${PORT}, '${HOST}', () => {
      console.log('[Detached Grandchild] Listening on ${HOST}:${PORT}');
    });
    
    // Prevent immediate exit
    setInterval(() => {}, 1000);
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,  // Key: detached from parent
    windowsHide: true,
  });

  detachedChild.stdout?.on('data', (data) => {
    console.log(`[Detached Grandchild] ${data.toString().trim()}`);
  });

  detachedChild.stderr?.on('data', (data) => {
    console.error(`[Detached Grandchild] ERROR: ${data.toString().trim()}`);
  });

  // Unref so parent can exit independently
  detachedChild.unref();
  
  return detachedChild;
}

const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      pid: process.pid,
      timestamp: Date.now(),
      hasDetachedChild: !!detachedChild
    }));
    return;
  }
  
  if (req.url === '/spawn-detached') {
    spawnDetachedChild();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'detached child spawned' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Parent server with detached grandchild\\nPID: ${process.pid}\\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Detached Grandchild Parent] Listening on ${HOST}:${PORT}`);
  console.log(`[Detached Grandchild Parent] PID: ${process.pid}`);
  console.log(`[Detached Grandchild Parent] Spawn detached: http://${HOST}:${PORT}/spawn-detached`);
  console.log(`[Detached Grandchild Parent] Health: http://${HOST}:${PORT}/health`);
});

// Spawn detached child on startup
setTimeout(spawnDetachedChild, 1000);

process.on('SIGTERM', () => {
  console.log('[Detached Grandchild Parent] Received SIGTERM');
  server.close(() => {
    if (detachedChild) {
      detachedChild.kill('SIGTERM');
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Detached Grandchild Parent] Received SIGINT');
  server.close(() => {
    if (detachedChild) {
      detachedChild.kill('SIGTERM');
    }
    process.exit(0);
  });
});