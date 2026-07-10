const { test } = require('node:test');
const assert = require('node:assert');
const CFG = require('../lib/config');

test('client registry contains the five bundled clients', () => {
  assert.deepStrictEqual(Object.keys(CFG.CLIENTS).sort(), ['chat', 'feed', 'forum', 'search', 'wiki']);
  assert.strictEqual(CFG.CLIENTS.forum, 'forum-client');
});

test('clientUrl builds static-server URLs', () => {
  assert.strictEqual(CFG.clientUrl('forum'), `http://127.0.0.1:${CFG.STATIC_PORT}/forum-client/`);
  assert.strictEqual(CFG.clientUrl('chat', '/settings'), `http://127.0.0.1:${CFG.STATIC_PORT}/chat-client/settings`);
  assert.strictEqual(CFG.clientUrl('nope'), null);
});

test('paths are anchored at the repo root', () => {
  assert.match(CFG.CLIENTS_DIR.replace(/\\/g, '/'), /desktop-app\/dist\/clients$/);
  assert.match(CFG.PID_FILE.replace(/\\/g, '/'), /\.daemon-pids\/swim-auto\.pid$/);
});
