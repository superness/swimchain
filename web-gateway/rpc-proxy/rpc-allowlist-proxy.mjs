// Safe public RPC proxy for the browser chess client.
// The node authorizes ANY method for a validly-signed request, so exposing the raw
// RPC would let anyone call admin methods (stop, add_peer). This forwards ONLY the
// read/write methods the chess client needs, passing the browser's signature-auth
// headers through to the node. Everything else is refused.
import http from 'http';

const NODE = { host: '127.0.0.1', port: 19736 };
const LISTEN_PORT = 3400;

const ALLOWED = new Set([
  'get_info', 'get_sync_status',
  'list_spaces', 'resolve_space_name', 'list_space_posts', 'list_space_content',
  'get_content', 'get_replies', 'request_content', 'get_reactions',
  'submit_post', 'submit_reply', 'submit_engagement',
  'list_sponsorship_offers', 'claim_sponsorship_offer', 'get_sponsorship_status',
]);

// Reachable only from localhost and the swimchain-gateway droplet — this
// listens on 0.0.0.0 so the gateway can use it as an RPC backend, and the
// source check (not a firewall) is what keeps it closed to the world.
const ALLOWED_SOURCES = new Set(['127.0.0.1', '::1', '167.99.116.63', '::ffff:167.99.116.63']);

const server = http.createServer((req, res) => {
  const src = req.socket.remoteAddress || '';
  if (!ALLOWED_SOURCES.has(src)) { res.writeHead(403); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CS-Identity, X-CS-Timestamp, X-CS-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end('POST only'); return; }

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
  req.on('end', () => {
    let method;
    try { method = JSON.parse(body).method; } catch { res.writeHead(400); res.end('bad json'); return; }
    if (!ALLOWED.has(method)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: `method not allowed via public proxy: ${method}` }, id: null }));
      return;
    }
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    for (const h of ['x-cs-identity', 'x-cs-timestamp', 'x-cs-signature']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    const pr = http.request({ ...NODE, method: 'POST', path: '/', headers }, (nodeRes) => {
      res.writeHead(nodeRes.statusCode || 502, { 'Content-Type': 'application/json' });
      nodeRes.pipe(res);
    });
    pr.on('error', (e) => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e) })); });
    pr.end(body);
  });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => console.log(`chess-rpc-proxy â†’ node ${NODE.host}:${NODE.port}, listening 127.0.0.1:${LISTEN_PORT}`));
