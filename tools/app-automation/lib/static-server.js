// Static server for the bundled client dists (desktop-app/dist/clients).
// Serves each client under /{name}-client/ with SPA fallback so BrowserRouter
// deep links work, plus an assets rewrite for Vite's relative (base './') refs.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

function candidatesFor(urlPath, clientDirs) {
  const m = urlPath.match(/^\/([a-z0-9-]+-client)(\/.*)?$/);
  if (!m || !clientDirs.includes(m[1])) return null;
  const clientDir = m[1];
  let rest;
  try {
    rest = decodeURIComponent(m[2] || '/');
  } catch {
    rest = '/';
  }
  rest = rest.replace(/^\/+/, '');
  if (rest.includes('..')) return { clientDir, candidates: ['index.html'] };

  const candidates = [];
  if (rest && !rest.endsWith('/')) candidates.push(rest);
  // Deep-route asset rewrite: **/assets/<file> -> assets/<file>
  const assetIdx = rest.lastIndexOf('assets/');
  if (assetIdx > 0) candidates.push(rest.slice(assetIdx));
  candidates.push('index.html'); // SPA fallback
  return { clientDir, candidates };
}

function listingHtml(clients, clientsDir) {
  const rows = Object.entries(clients)
    .map(([name, dir]) => {
      const built = fs.existsSync(path.join(clientsDir, dir, 'index.html'));
      return `<li><a href="/${dir}/">${name}</a> (${dir}) ${built ? '✅ built' : '❌ not built — run: swim-auto clients build'}</li>`;
    })
    .join('\n');
  return `<!doctype html><html><head><title>swim-auto</title></head><body>
<h1>swim-auto client index</h1>
<ul>${rows}</ul>
<script>console.log('[swim-auto] listing page loaded')</script>
</body></html>`;
}

function startStaticServer({ port, clientsDir, clients }) {
  const clientDirs = Object.values(clients);
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(listingHtml(clients, clientsDir));
      return;
    }

    const resolved = candidatesFor(urlPath, clientDirs);
    if (resolved) {
      for (const candidate of resolved.candidates) {
        const filePath = path.join(clientsDir, resolved.clientDir, candidate);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': type });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${urlPath}\nKnown clients: ${clientDirs.join(', ')}`);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { candidatesFor, startStaticServer, listingHtml };
