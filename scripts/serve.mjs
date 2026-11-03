import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.argv[2] || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
http.createServer(async (request, response) => {
  try {
    const route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!file.startsWith(root) || route.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { if (!response.headersSent) response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log('Scenario workbench: http://127.0.0.1:' + port));
