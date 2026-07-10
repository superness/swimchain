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

function clientUrl(name, route) {
  const dir = CLIENTS[name];
  if (!dir) return null;
  const base = `http://127.0.0.1:${STATIC_PORT}/${dir}/`;
  if (!route) return base;
  return base + String(route).replace(/^\/+/, '');
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
  CLIENTS,
  clientUrl,
};
