/**
 * npm→node→worker chain test server
 * Simulates: npm run dev -> node (webpack/dev-server) -> worker threads
 * This is a common pattern in modern JS development
 */

const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3201;
const HOST = process.env.HOST || '0.0.0.0';

let nodeProcess = null;
let workers = [];

function spawnNodeWithWorkers() {
  // Simulate: npm spawns node which spawns workers
  nodeProcess = spawn(process.execPath, ['-e', `
    // This simulates a node process (like webpack dev server)
    console.log('[Node Process] Started, PID:', process.pid);
    console.log('[Node Process] Parent PID:', process.ppid);
    
    // Spawn worker threads (simulated as child processes)
    const { spawn } = require('child_process');
    
    // Worker 1: TypeScript compiler
    const tsWorker = spawn(process.execPath, ['-e', \`
      console.log('[TS Worker] Started, PID:', process.pid);
      setInterval(() => {
        console.log('[TS Worker] Compiling...');
      }, 5000);
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    tsWorker.stdout?.on('data', (d) => console.log('[TS Worker]', d.toString().trim()));
    
    // Worker 2: ESLint
    const lintWorker = spawn(process.execPath, ['-e', \`
      console.log('[Lint Worker] Started, PID:', process.pid);
      setInterval(() => {
        console.log('[Lint Worker] Linting...');
      }, 3000);
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    lintWorker.stdout?.on('data', (d) => console.log('[Lint Worker]', d.toString().trim()));
    
    // Worker 3: Test runner
    const testWorker = spawn(process.execPath, ['-e', \`
      console.log('[Test Worker] Started, PID:', process.pid);
      setInterval(() => {
        console.log('[Test Worker] Running tests...');
      }, 7000);
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    testWorker.stdout?.on('data', (d) => console.log('[Test Worker]', d.toString().trim()));
    
    // HTTP server for health
    const http = require('http');
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          pid: process.pid,
          parent: process.ppid,
          workers: [tsWorker.pid, lintWorker.pid, testWorker.pid],
          timestamp: Date.now() 
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Node with workers\\n');
    });
    
    server.listen(${PORT}, '${HOST}', () => {
      console.log('[Node Process] Listening on ${HOST}:${PORT}');
    });
    
    // Cleanup
    process.on('SIGTERM', () => {
      tsWorker.kill('SIGTERM');
      lintWorker.kill('SIGTERM');
      testWorker.kill('SIGTERM');
      server.close(() => process.exit(0));
    });
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  nodeProcess.stdout?.on('data', (data) => {
    console.log(`[Node Process] ${data.toString().trim()}`);
  });

  nodeProcess.stderr?.on('data', (data) => {
    console.error(`[Node Process] ERROR: ${data.toString().trim()}`);
  });

  return nodeProcess;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      pid: process.pid,
      timestamp: Date.now(),
      hasNodeProcess: !!nodeProcess,
      nodePid: nodeProcess?.pid
    }));
    return;
  }
  
  if (req.url === '/spawn-node') {
    spawnNodeWithWorkers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'node process with workers spawned' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`NPM/Node parent\\nPID: ${process.pid}\\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[NPM Chain Parent] Listening on ${HOST}:${PORT}`);
  console.log(`[NPM Chain Parent] PID: ${process.pid}`);
  console.log(`[NPM Chain Parent] Spawn node chain: http://${HOST}:${PORT}/spawn-node`);
  console.log(`[NPM Chain Parent] Health: http://${HOST}:${PORT}/health`);
});

// Spawn node chain on startup
setTimeout(spawnNodeWithWorkers, 1000);

process.on('SIGTERM', () => {
  console.log('[NPM Chain Parent] Received SIGTERM');
  if (nodeProcess) {
    nodeProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[NPM Chain Parent] Received SIGINT');
  if (nodeProcess) {
    nodeProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});