/**
 * Child-spawning test server - spawns child processes
 * Used for testing process tree termination
 */

const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3104;
const HOST = process.env.HOST || '0.0.0.0';
const CHILD_COUNT = parseInt(process.env.CHILD_COUNT || '3');

let childProcesses: any[] = [];

function spawnChild(index: number) {
  // Spawn a simple infinite process
  const child = spawn(process.execPath, ['-e', `
    console.log('[Child ${index}] Started, PID: ' + process.pid);
    setInterval(() => {
      console.log('[Child ${index}] Heartbeat');
    }, 5000);
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data) => {
    console.log(`[Child ${index}] ${data.toString().trim()}`);
  });

  child.stderr?.on('data', (data) => {
    console.error(`[Child ${index}] ERROR: ${data.toString().trim()}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`[Child ${index}] Exited with code ${code}, signal ${signal}`);
  });

  return child;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: Date.now(), 
      pid: process.pid,
      children: childProcesses.length 
    }));
    return;
  }
  
  if (req.url === '/spawn') {
    const child = spawnChild(childProcesses.length);
    childProcesses.push(child);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'spawned', 
      children: childProcesses.length 
    }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Parent server running on ${HOST}:${PORT}\nPID: ${process.pid}\nChildren: ${childProcesses.length}\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Child Spawner] Listening on ${HOST}:${PORT}`);
  console.log(`[Child Spawner] Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`[Child Spawner] Spawn endpoint: http://${HOST}:${PORT}/spawn`);
  console.log(`[Child Spawner] Will spawn ${CHILD_COUNT} children on startup`);
  console.log(`[Child Spawner] PID: ${process.pid}`);

  // Spawn initial children
  for (let i = 0; i < CHILD_COUNT; i++) {
    setTimeout(() => {
      const child = spawnChild(i);
      childProcesses.push(child);
    }, i * 500);
  }
});

function cleanup() {
  console.log('[Child Spawner] Shutting down all children...');
  for (const child of childProcesses) {
    child.kill('SIGTERM');
  }
}

process.on('SIGTERM', () => {
  console.log('[Child Spawner] Received SIGTERM, shutting down...');
  cleanup();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Child Spawner] Received SIGINT, shutting down...');
  cleanup();
  server.close(() => {
    process.exit(0);
  });
});