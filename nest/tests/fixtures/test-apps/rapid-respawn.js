/**
 * Rapidly respawning child test server
 * Simulates crash loops, watchdog-restarted processes
 */

const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3203;
const HOST = process.env.HOST || '0.0.0.0';

const RESPAWN_INTERVAL = parseInt(process.env.RESPAWN_INTERVAL || '1000'); // ms
let childProcess = null;
let respawnCount = 0;
let isRespawning = false;

function spawnChild() {
  if (childProcess) {
    try {
      childProcess.kill('SIGTERM');
    } catch (e) {}
  }

  respawnCount++;
  console.log(`[Respawn Parent] Spawning child #${respawnCount}, PID: ${process.pid}`);

  childProcess = spawn(process.execPath, ['-e', `
    // This simulates a child that crashes after a short time
    console.log('[Respawning Child] Started, PID:', process.pid);
    console.log('[Respawning Child] Parent PID:', process.ppid);
    
    const http = require('http');
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          pid: process.pid,
          parent: process.ppid,
          respawnCount: ${respawnCount},
          timestamp: Date.now() 
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Respawning child\\n');
    });
    
    server.listen(${PORT}, '${HOST}', () => {
      console.log('[Respawning Child] Listening on ${HOST}:${PORT}');
    });
    
    // Crash after random short time (100-500ms)
    const crashTime = 100 + Math.random() * 400;
    setTimeout(() => {
      console.log('[Respawning Child] Crashing intentionally!');
      process.exit(1);
    }, crashTime);
    
    process.on('SIGTERM', () => {
      server.close(() => process.exit(0));
    });
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  childProcess.stdout?.on('data', (data) => {
    console.log(`[Respawning Child] ${data.toString().trim()}`);
  });

  childProcess.stderr?.on('data', (data) => {
    console.error(`[Respawning Child] ERROR: ${data.toString().trim()}`);
  });

  childProcess.on('exit', (code, signal) => {
    console.log(`[Respawning Child] Exited with code ${code}, signal ${signal}`);
    childProcess = null;
    
    if (isRespawning) {
      // Respawn after interval
      setTimeout(() => {
        if (isRespawning) {
          spawnChild();
        }
      }, RESPAWN_INTERVAL);
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      pid: process.pid,
      timestamp: Date.now(),
      respawnCount,
      isRespawning,
      hasChild: !!childProcess
    }));
    return;
  }
  
  if (req.url === '/start-respawn') {
    if (!isRespawning) {
      isRespawning = true;
      respawnCount = 0;
      spawnChild();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'respawn started' }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'already respawning' }));
    }
    return;
  }
  
  if (req.url === '/stop-respawn') {
    isRespawning = false;
    if (childProcess) {
      childProcess.kill('SIGTERM');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'respawn stopped', respawnCount }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Rapid respawn parent\\nPID: ${process.pid}\\nRespawn count: ${respawnCount}\\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Respawn Parent] Listening on ${HOST}:${PORT}`);
  console.log(`[Respawn Parent] PID: ${process.pid}`);
  console.log(`[Respawn Parent] Respawn interval: ${RESPAWN_INTERVAL}ms`);
  console.log(`[Respawn Parent] Start: http://${HOST}:${PORT}/start-respawn`);
  console.log(`[Respawn Parent] Stop: http://${HOST}:${PORT}/stop-respawn`);
  console.log(`[Respawn Parent] Health: http://${HOST}:${PORT}/health`);
});

process.on('SIGTERM', () => {
  console.log('[Respawn Parent] Received SIGTERM');
  isRespawning = false;
  if (childProcess) {
    childProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Respawn Parent] Received SIGINT');
  isRespawning = false;
  if (childProcess) {
    childProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});