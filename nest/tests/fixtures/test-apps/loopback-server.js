/**
 * Loopback-only test server - only listens on 127.0.0.1
 * Used for testing LAN access denial when app binds to loopback only
 */

const http = require('http');

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: Date.now() }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Loopback server running on ${HOST}:${PORT}\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Loopback Server] Listening on ${HOST}:${PORT}`);
  console.log(`[Loopback Server] Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`[Loopback Server] PID: ${process.pid}`);
});

process.on('SIGTERM', () => {
  console.log('[Loopback Server] Received SIGTERM, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Loopback Server] Received SIGINT, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});