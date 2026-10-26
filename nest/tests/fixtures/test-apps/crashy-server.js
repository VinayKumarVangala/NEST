/**
 * Crashy test server - randomly crashes
 * Used for testing crash detection and auto-restart
 */

const http = require('http');

const PORT = process.env.PORT || 3103;
const HOST = process.env.HOST || '0.0.0.0';
const CRASH_PROBABILITY = parseFloat(process.env.CRASH_PROBABILITY || '0.1');
const CRASH_INTERVAL = parseInt(process.env.CRASH_INTERVAL || '10000');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: Date.now(), pid: process.pid }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Crashy server running on ${HOST}:${PORT}\nPID: ${process.pid}\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Crashy Server] Listening on ${HOST}:${PORT}`);
  console.log(`[Crashy Server] Crash probability: ${CRASH_PROBABILITY * 100}% every ${CRASH_INTERVAL}ms`);
  console.log(`[Crashy Server] Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`[Crashy Server] PID: ${process.pid}`);
});

// Random crash timer
const crashTimer = setInterval(() => {
  if (Math.random() < CRASH_PROBABILITY) {
    console.log('[Crashy Server] Random crash triggered!');
    process.exit(1);
  }
}, CRASH_INTERVAL);

process.on('SIGTERM', () => {
  console.log('[Crashy Server] Received SIGTERM, shutting down...');
  clearInterval(crashTimer);
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Crashy Server] Received SIGINT, shutting down...');
  clearInterval(crashTimer);
  server.close(() => {
    process.exit(0);
  });
});