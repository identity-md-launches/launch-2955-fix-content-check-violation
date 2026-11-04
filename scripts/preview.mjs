import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The same static handler is used by validation to check gateway/subpath hosting.
export function serve(root = fileURLToPath(new URL('../dist/', import.meta.url))) {
  const base = resolve(root);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.writeHead(302, { Location: '/preview/' }); res.end(); return; }
      if (!url.pathname.startsWith('/preview/')) throw new Error('Outside preview');
      const name = decodeURIComponent(url.pathname.slice('/preview/'.length)) || 'index.html';
      const path = resolve(base, name);
      if (!path.startsWith(base + sep) || !(await stat(path)).isFile()) throw new Error('Not found');
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = serve();
  server.listen(Number(process.argv[2] || 4173), '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}/preview/`));
}
