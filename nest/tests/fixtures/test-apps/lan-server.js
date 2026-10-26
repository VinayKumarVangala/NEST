/**
 * LAN-accessible test server - listens on 0.0.0.0
 * Used for testing successful LAN access
 */

const http = require('http');

const PORT = process.env.PORT || 3101;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: Date.now(), pid: process.pid }));
    return;
  }
  
  if (req.url === '/slow') {
    // Simulate slow response
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Slow response\n');
    }, 5000);
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`LAN server running on ${HOST}:${PORT}\nPID: ${process.pid}\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`[LAN Server] Listening on ${HOST}:${PORT}`);
  console.log(`[LAN Server] Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`[LAN Server] PID: ${process.pid}`);
});

process.on('SIGTERM', () => {
  console.log('[LAN Server] Received SIGTERM, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[LAN Server] Received SIGINT, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});