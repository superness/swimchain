const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { candidatesFor, startStaticServer } = require('../lib/static-server');

const DIRS = ['forum-client', 'chat-client'];

test('candidatesFor: unknown client -> null', () => {
  assert.strictEqual(candidatesFor('/nope-client/', DIRS), null);
  assert.strictEqual(candidatesFor('/random', DIRS), null);
});

test('candidatesFor: client root -> index.html', () => {
  assert.deepStrictEqual(candidatesFor('/forum-client/', DIRS), {
    clientDir: 'forum-client',
    candidates: ['index.html'],
  });
  assert.deepStrictEqual(candidatesFor('/forum-client', DIRS).candidates, ['index.html']);
});

test('candidatesFor: real file tried first, index.html last', () => {
  assert.deepStrictEqual(candidatesFor('/forum-client/assets/app.js', DIRS).candidates, [
    'assets/app.js',
    'index.html',
  ]);
});

test('candidatesFor: deep-route asset rewrites to client assets dir', () => {
  assert.deepStrictEqual(candidatesFor('/forum-client/thread/abc/assets/app.js', DIRS).candidates, [
    'thread/abc/assets/app.js',
    'assets/app.js',
    'index.html',
  ]);
});

test('candidatesFor: traversal is neutralized to index.html', () => {
  assert.deepStrictEqual(candidatesFor('/forum-client/../secret.txt', DIRS).candidates, ['index.html']);
});

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: urlPath }, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

test('serves client files, SPA fallback, listing, and 404s', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swim-auto-'));
  fs.mkdirSync(path.join(tmp, 'forum-client', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'forum-client', 'index.html'), '<html>FORUM-INDEX</html>');
  fs.writeFileSync(path.join(tmp, 'forum-client', 'assets', 'app.js'), 'console.log(1)');

  const server = await startStaticServer({
    port: 0,
    clientsDir: tmp,
    clients: { forum: 'forum-client' },
  });
  const port = server.address().port;

  assert.strictEqual((await get(port, '/forum-client/')).body, '<html>FORUM-INDEX</html>');
  assert.strictEqual((await get(port, '/forum-client/assets/app.js')).body, 'console.log(1)');
  // SPA fallback for a deep route
  assert.strictEqual((await get(port, '/forum-client/thread/abc')).body, '<html>FORUM-INDEX</html>');
  // deep-route asset rewrite
  assert.strictEqual((await get(port, '/forum-client/thread/abc/assets/app.js')).body, 'console.log(1)');
  // listing page
  const listing = await get(port, '/');
  assert.strictEqual(listing.status, 200);
  assert.match(listing.body, /swim-auto client index/);
  // unknown client
  assert.strictEqual((await get(port, '/nope-client/')).status, 404);

  server.close();
});
