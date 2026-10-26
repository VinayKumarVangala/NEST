/**
 * Slow-start test server - takes time to start listening
 * Used for testing startup timeout handling
 */

const http = require('http');

const PORT = process.env.PORT || 3102;
const HOST = process.env.HOST || '0.0.0.0';
const START_DELAY = parseInt(process.env.START_DELAY || '5000');

console.log(`[Slow Server] Will start listening in ${START_DELAY}ms...`);

setTimeout(() => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: Date.now(), pid: process.pid }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Slow-start server running on ${HOST}:${PORT}\nPID: ${process.pid}\n`);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Slow Server] Listening on ${HOST}:${PORT} (after ${START_DELAY}ms delay)`);
    console.log(`[Slow Server] Health endpoint: http://${HOST}:${PORT}/health`);
    console.log(`[Slow Server] PID: ${process.pid}`);
  });

  process.on('SIGTERM', () => {
    console.log('[Slow Server] Received SIGTERM, shutting down...');
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[Slow Server] Received SIGINT, shutting down...');
    server.close(() => {
      process.exit(0);
    });
  });
}, START_DELAY);