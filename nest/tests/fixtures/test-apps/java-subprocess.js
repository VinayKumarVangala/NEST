/**
 * Java subprocess test server
 * Simulates: Java app (Spring Boot, Gradle, Maven) launching subprocesses
 * Requires Java to be installed - will gracefully handle if not available
 */

const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3202;
const HOST = process.env.HOST || '0.0.0.0';

let javaProcess = null;

function findJava() {
  return new Promise((resolve) => {
    // Try to find java
    const { spawn } = require('child_process');
    const check = spawn('java', ['-version'], { stdio: 'ignore' });
    check.on('error', () => resolve(null));
    check.on('close', (code) => resolve(code === 0 ? 'java' : null));
  });
}

function spawnJavaApp() {
  findJava().then((javaPath) => {
    if (!javaPath) {
      console.log('[Java Parent] Java not found, simulating Java process tree');
      spawnSimulatedJavaTree();
      return;
    }

    console.log('[Java Parent] Found Java:', javaPath);
    
    // Simulate a Java app that spawns subprocesses (like Gradle daemon, Spring Boot)
    javaProcess = spawn(javaPath, [
      '-cp', '.', 
      '-Dserver.port=' + PORT,
      'SimulatedJavaApp'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: process.cwd(),
    });

    javaProcess.stdout?.on('data', (data) => {
      console.log(`[Java App] ${data.toString().trim()}`);
    });

    javaProcess.stderr?.on('data', (data) => {
      console.error(`[Java App] ERROR: ${data.toString().trim()}`);
    });

    javaProcess.on('error', (err) => {
      console.error('[Java App] Spawn error:', err.message);
      spawnSimulatedJavaTree();
    });
  });
}

function spawnSimulatedJavaTree() {
  // Simulate Java process tree with Node.js (since Java may not be available)
  console.log('[Java Parent] Spawning simulated Java process tree');
  
  javaProcess = spawn(process.execPath, ['-e', `
    // This simulates a Java application (Spring Boot, etc.)
    console.log('[Simulated Java App] Started, PID:', process.pid);
    console.log('[Simulated Java App] Parent PID:', process.ppid);
    
    // Simulate Gradle daemon
    const { spawn } = require('child_process');
    const gradleDaemon = spawn(process.execPath, ['-e', \`
      console.log('[Gradle Daemon] Started, PID:', process.pid);
      setInterval(() => {
        console.log('[Gradle Daemon] Building...');
      }, 10000);
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    gradleDaemon.stdout?.on('data', (d) => console.log('[Gradle Daemon]', d.toString().trim()));
    
    // Simulate Spring Boot app with Actuator
    const springBoot = spawn(process.execPath, ['-e', \`
      console.log('[Spring Boot] Started, PID:', process.pid);
      const http = require('http');
      const server = http.createServer((req, res) => {
        if (req.url === '/actuator/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'UP', 
            pid: process.pid,
            timestamp: Date.now() 
          }));
          return;
        }
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'healthy', 
            pid: process.pid,
            timestamp: Date.now() 
          }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Spring Boot app\\n');
      });
      server.listen(${PORT}, '${HOST}', () => {
        console.log('[Spring Boot] Listening on ${HOST}:${PORT}');
      });
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    springBoot.stdout?.on('data', (d) => console.log('[Spring Boot]', d.toString().trim()));
    
    // Simulate Maven/Gradle test runner
    const testRunner = spawn(process.execPath, ['-e', \`
      console.log('[Test Runner] Started, PID:', process.pid);
      setInterval(() => {
        console.log('[Test Runner] Running integration tests...');
      }, 15000);
    \`], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    testRunner.stdout?.on('data', (d) => console.log('[Test Runner]', d.toString().trim()));
    
    process.on('SIGTERM', () => {
      gradleDaemon.kill('SIGTERM');
      springBoot.kill('SIGTERM');
      testRunner.kill('SIGTERM');
      process.exit(0);
    });
  `], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  javaProcess.stdout?.on('data', (data) => {
    console.log(`[Simulated Java] ${data.toString().trim()}`);
  });

  javaProcess.stderr?.on('data', (data) => {
    console.error(`[Simulated Java] ERROR: ${data.toString().trim()}`);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      pid: process.pid,
      timestamp: Date.now(),
      hasJavaProcess: !!javaProcess,
      javaPid: javaProcess?.pid
    }));
    return;
  }
  
  if (req.url === '/spawn-java') {
    spawnJavaApp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'java process tree spawned' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Java parent (simulated)\\nPID: ${process.pid}\\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Java Parent] Listening on ${HOST}:${PORT}`);
  console.log(`[Java Parent] PID: ${process.pid}`);
  console.log(`[Java Parent] Spawn Java tree: http://${HOST}:${PORT}/spawn-java`);
  console.log(`[Java Parent] Health: http://${HOST}:${PORT}/health`);
});

// Spawn Java tree on startup
setTimeout(spawnJavaApp, 1000);

process.on('SIGTERM', () => {
  console.log('[Java Parent] Received SIGTERM');
  if (javaProcess) {
    javaProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Java Parent] Received SIGINT');
  if (javaProcess) {
    javaProcess.kill('SIGTERM');
  }
  server.close(() => {
    process.exit(0);
  });
});