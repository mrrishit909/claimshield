// Tiny static server for the workbench. Binds 127.0.0.1 only. No other network.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    const url = new URL(req.url, `http://${HOST}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) return send(res, 403, 'forbidden');
    if (target.includes(`${sep}.git${sep}`) || target.endsWith(`${sep}.git`)) return send(res, 403, 'forbidden');
    const info = await stat(target).catch(() => null);
    if (!info) return send(res, 404, 'not found');
    if (info.isDirectory()) {
      res.writeHead(302, { Location: `${url.pathname}/` });
      return res.end();
    }
    const body = await readFile(target);
    return send(res, 200, body, MIME[extname(target).toLowerCase()] || 'application/octet-stream');
  } catch (err) {
    return send(res, 500, 'server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ClaimShield workbench (synthetic demo data only): http://${HOST}:${PORT}/app/`);
  console.log(`README (plain text): http://${HOST}:${PORT}/README.md  Press Ctrl+C to stop.`);
});
