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
  if (assetIdx > 0 && rest[assetIdx - 1] === '/') candidates.push(rest.slice(assetIdx));
  candidates.push('index.html'); // SPA fallback
  return { clientDir, candidates };
}

// App-shell-style wrapper: frames the client and posts SWIMCHAIN_RPC_CONFIG so it
// adopts the node's identity ("node mode") — the exact path the launcher exercises.
// The embed script fetches /rpc-config (live node endpoint + cookie auth + address)
// and re-posts for 10s so a node identity that becomes ready late still lands.
function shellHtml(clientDir, route) {
  const src = `/${clientDir}/${route ? String(route).replace(/^\/+/, '') : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>swim-auto shell: ${clientDir}</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100vw;height:100vh;display:block}</style>
</head><body>
<iframe id="client" src="${src}"></iframe>
<script>
const iframe = document.getElementById('client');
async function pushConfig() {
  let cfg;
  try {
    const res = await fetch('/rpc-config');
    cfg = await res.json();
  } catch (e) { console.warn('[swim-auto shell] rpc-config fetch failed:', e); return; }
  if (cfg.error) { console.warn('[swim-auto shell] node not ready:', cfg.error); return; }
  iframe.contentWindow && iframe.contentWindow.postMessage({
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint: cfg.endpoint,
    rpcAuth: cfg.auth,
    nodeAddress: cfg.nodeAddress,
    nodeDisplayName: cfg.nodeDisplayName,
  }, window.location.origin);
}
iframe.addEventListener('load', pushConfig);
let n = 0; const t = setInterval(function(){ pushConfig(); if (++n >= 10) clearInterval(t); }, 1000);
</script>
</body></html>`;
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

function startStaticServer({ port, clientsDir, clients, getNodeConfig }) {
  const clientDirs = Object.values(clients);
  // Lazy default so the harness works without a node for pure-static use / tests.
  const resolveNodeConfig = getNodeConfig || (() => require('./node-rpc').getNodeRpcConfig());
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const urlPath = url.pathname;

    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(listingHtml(clients, clientsDir));
      return;
    }

    // Live node RPC config for the shell wrapper. Never throws to the socket:
    // if the node isn't up, return { error } so the shell page can log it.
    if (urlPath === '/rpc-config') {
      Promise.resolve()
        .then(resolveNodeConfig)
        .then(cfg => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(cfg));
        })
        .catch(err => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        });
      return;
    }

    // App-shell-style wrapper: /shell/<client>[?route=deep/link]
    const shellMatch = urlPath.match(/^\/shell\/([a-z0-9-]+)$/);
    if (shellMatch) {
      const clientKey = shellMatch[1];
      const clientDir = clients[clientKey];
      if (!clientDir) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Unknown client '${clientKey}'. Known: ${Object.keys(clients).join(', ')}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shellHtml(clientDir, url.searchParams.get('route') || ''));
      return;
    }

    const resolved = candidatesFor(urlPath, clientDirs);
    if (resolved) {
      for (const candidate of resolved.candidates) {
        try {
          const filePath = path.join(clientsDir, resolved.clientDir, candidate);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': type });
            fs.createReadStream(filePath)
              .on('error', () => res.destroy())
              .pipe(res);
            return;
          }
        } catch {
          // Treat a race (file removed/replaced between checks) as a miss and try the next candidate.
          continue;
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

module.exports = { candidatesFor, startStaticServer, listingHtml, shellHtml };
