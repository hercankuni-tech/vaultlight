// A tiny static server for local play: serves game/ and prints the URL. Node 22, stdlib only.
// Run: node serve.ts   (then open http://localhost:8080)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = new URL('./game/', import.meta.url);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const port = Number(process.env.PORT ?? 8080);
createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  try {
    const body = await readFile(join(root.pathname, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`VAULTLIGHT serving game/ at http://localhost:${port}`);
});
