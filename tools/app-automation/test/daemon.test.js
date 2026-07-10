const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

const CONTROL = 18897;
const STATIC = 18899;
let child;

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port: CONTROL, path: endpoint, method, headers: { 'Content-Type': 'application/json' } },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => resolve(JSON.parse(raw)));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitForDaemon(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await api('GET', '/status');
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('daemon did not come up');
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'daemon.js')], {
    env: { ...process.env, SWIM_AUTO_PORT: String(CONTROL), SWIM_AUTO_STATIC_PORT: String(STATIC) },
    stdio: 'ignore',
  });
  await waitForDaemon();
});

after(async () => {
  try {
    await api('POST', '/shutdown', {});
  } catch {}
  await new Promise(r => setTimeout(r, 500));
  try {
    child.kill();
  } catch {}
});

test('full daemon loop: open, eval, logs, ui, screenshot', async () => {
  const open = await api('POST', '/open', { url: `http://127.0.0.1:${STATIC}/` });
  assert.strictEqual(open.ok, true, JSON.stringify(open));
  assert.strictEqual(open.result.launched, true);

  const title = await api('POST', '/eval', { js: 'document.title' });
  assert.strictEqual(title.result, 'swim-auto');

  // console capture: the listing page logs on load
  const logs = await api('POST', '/logs', {});
  assert.strictEqual(logs.ok, true);
  assert.ok(
    logs.result.some(e => e.kind === 'console' && e.text.includes('[swim-auto] listing page loaded')),
    `expected listing log, got: ${JSON.stringify(logs.result)}`
  );

  // ui snapshot mentions the heading
  const ui = await api('POST', '/ui', {});
  assert.match(ui.result, /swim-auto client index/);

  // screenshot lands on disk with real content
  const out = path.join(os.tmpdir(), `swim-auto-test-${Date.now()}.png`);
  const shot = await api('POST', '/screenshot', { out });
  assert.strictEqual(shot.result, out);
  assert.ok(fs.statSync(out).size > 1000);
  fs.unlinkSync(out);

  // pageerror capture
  await api('POST', '/eval', { js: 'setTimeout(() => { throw new Error("swim-auto-test-error") }, 0), null' });
  await new Promise(r => setTimeout(r, 500));
  const errs = await api('POST', '/logs', { errorsOnly: true });
  assert.ok(errs.result.some(e => e.text.includes('swim-auto-test-error')));

  // unknown client -> clean error
  const bad = await api('POST', '/open', { client: 'nope' });
  assert.strictEqual(bad.ok, false);
  assert.match(bad.error, /unknown client/i);
});
