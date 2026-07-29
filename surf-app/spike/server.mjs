#!/usr/bin/env node
// Surf A0 spike server.
//
// - Serves the shell (this dir) and every channel dist under /channels/<id>/
//   from ONE origin, so on Android all frames share one renderer — the very
//   condition this spike exists to measure.
// - Proxies JSON-RPC at /rpc to the dev node, injecting the real cookie auth
//   server-side (the node has no CORS headers, and the cookie should never
//   reach the page). Channels get a placeholder rpcAuth; the proxy replaces
//   the Authorization header on every request regardless.
//
// Zero dependencies. Node 21+.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json',
};

// Pure. Maps a URL pathname to { channelId, rel }; channelId null means the
// spike's own directory. Returns null for traversal or unknown channels.
export function resolveMount(pathname, channels) {
  let clean;
  try { clean = decodeURIComponent(pathname); } catch { return null; }
  // Reject BEFORE normalizing: normalize collapses '/../..' into a clean
  // path, so a post-normalize check would wave encoded traversal through.
  // Backslash would become a separator in win32 path.join; NUL is never ok.
  if (clean.includes('..') || clean.includes('\\') || clean.includes('\0')) return null;
  clean = path.posix.normalize(clean);
  const m = clean.match(/^\/channels\/([^/]+)(\/.*)?$/);
  if (m) {
    if (!channels.some((c) => c.id === m[1])) return null;
    let rel = m[2] ?? '/';
    if (rel === '/' || rel === '') rel = '/index.html';
    if (!path.posix.extname(rel)) rel = '/index.html'; // SPA deep-link fallback
    return { channelId: m[1], rel };
  }
  return { channelId: null, rel: clean === '/' ? '/index.html' : clean };
}

export function startServer({ port, rpcUrl, auth, manifest, nodeAddress }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/rpc' && req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const upstream = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: auth },
          body: Buffer.concat(chunks),
        });
        res.writeHead(upstream.status, { 'content-type': 'application/json' });
        res.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      if (url.pathname === '/spike-config.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          rpcAuth: 'Basic c3VyZi1zcGlrZQ==', // placeholder; proxy injects the real one
          ...(nodeAddress ? { nodeAddress } : {}),
          warmSize: manifest.warmSize,
          channels: manifest.channels.map(({ id, number, name }) => ({ id, number, name })),
        }));
        return;
      }
      const hit = resolveMount(url.pathname, manifest.channels);
      if (!hit) { res.writeHead(404); res.end('not found'); return; }
      const root = hit.channelId
        ? path.resolve(__dirname, manifest.channels.find((c) => c.id === hit.channelId).dist)
        : __dirname;
      const abs = path.join(root, hit.rel);
      const body = await readFile(abs);
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(err?.code === 'ENOENT' ? 404 : 500);
      res.end(String(err?.code ?? err));
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

// CLI entry — guarded so importing for tests has no side effects.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2)
    .map((a) => a.match(/^--([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  if (!args.cookie) {
    console.error('usage: node server.mjs --cookie=<data_dir>/.cookie'
      + ' [--rpc=http://127.0.0.1:29736] [--port=8080] [--node-address=cs1...]');
    process.exit(1);
  }
  const cookieHex = readFileSync(args.cookie, 'utf8').trim();
  const auth = 'Basic ' + Buffer.from(`__cookie__:${cookieHex}`).toString('base64');
  const manifest = JSON.parse(readFileSync(path.join(__dirname, 'channels.json'), 'utf8'));
  const port = Number(args.port ?? 8080);
  const rpcUrl = args.rpc ?? 'http://127.0.0.1:29736';
  startServer({ port, rpcUrl, auth, manifest, nodeAddress: args['node-address'] });
  console.log(`surf spike on http://localhost:${port} -> rpc ${rpcUrl}`);
}
