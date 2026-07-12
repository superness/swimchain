// Central config for swim-auto. All paths anchored at the repo root so the
// tool works no matter which directory the CLI is invoked from.
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const CLIENTS = {
  forum: 'forum-client',
  chat: 'chat-client',
  feed: 'feed-client',
  search: 'search-client',
  wiki: 'wiki-client',
};

const STATIC_PORT = parseInt(process.env.SWIM_AUTO_STATIC_PORT || '8899', 10);

// The harness testnet node (started via scripts/daemon-control.js): RPC on 19736,
// data dir <ROOT>/genesis-testnet (the --testnet suffix is applied to `genesis`).
const NODE_RPC_URL = process.env.SWIM_AUTO_NODE_RPC || 'http://127.0.0.1:19736';
const NODE_DATA_DIR = process.env.SWIM_AUTO_NODE_DATADIR || path.join(ROOT, 'genesis-testnet');

function clientUrl(name, route) {
  const dir = CLIENTS[name];
  if (!dir) return null;
  const base = `http://127.0.0.1:${STATIC_PORT}/${dir}/`;
  if (!route) return base;
  return base + String(route).replace(/^\/+/, '');
}

// Shell (node-mode) URL: an app-shell-style wrapper that frames the client and
// posts SWIMCHAIN_RPC_CONFIG so it adopts the node's identity — the mode the
// launcher produces. `name` is a client key; `route` is an in-client deep link.
function shellUrl(name, route) {
  if (!CLIENTS[name]) return null;
  const base = `http://127.0.0.1:${STATIC_PORT}/shell/${name}`;
  return route ? `${base}?route=${encodeURIComponent(String(route).replace(/^\/+/, ''))}` : base;
}

module.exports = {
  ROOT,
  CONTROL_PORT: parseInt(process.env.SWIM_AUTO_PORT || '8897', 10),
  STATIC_PORT,
  CLIENTS_DIR: path.join(ROOT, 'desktop-app', 'dist', 'clients'),
  SHOTS_DIR: path.join(ROOT, 'tools', 'app-automation', 'shots'),
  PID_FILE: path.join(ROOT, '.daemon-pids', 'swim-auto.pid'),
  LOG_BUFFER_CAP: 2000,
  DEFAULT_TIMEOUT: 15000,
  NODE_RPC_URL,
  NODE_DATA_DIR,
  CLIENTS,
  clientUrl,
  shellUrl,
};
