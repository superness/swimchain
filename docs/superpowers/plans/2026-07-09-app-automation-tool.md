# swim-auto App Automation Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `swim-auto`, a daemon + thin-CLI tool that runs the swimchain testnet node, serves the bundled clients, and lets a Claude session see the UI (screenshots, ARIA snapshots), manipulate it (click/type/navigate), and read console logs / JS errors.

**Architecture:** A detached daemon process owns a Playwright Chromium browser, a static file server for `desktop-app/dist/clients/`, and a ring buffer continuously capturing console/pageerror/requestfailed events. A thin CLI talks to the daemon over localhost HTTP and delegates node lifecycle to the existing `scripts/daemon-control.js`.

**Tech Stack:** Node.js (CommonJS, no build step), Playwright `^1.61.1`, `node:test` for unit tests. Spec: `docs/superpowers/specs/2026-07-09-app-automation-tool-design.md`.

## Global Constraints

- Location: `tools/app-automation/` — plain JS, CommonJS (`require`), no TypeScript, no build step.
- Only runtime dependency: `playwright` `^1.61.1`.
- Control API port **8897**, static server port **8899** (env-overridable via `SWIM_AUTO_PORT` / `SWIM_AUTO_STATIC_PORT`). Both bind `127.0.0.1` only.
- Client registry: `forum, chat, feed, search, wiki` → `{name}-client` dirs under `desktop-app/dist/clients/`.
- Node lifecycle: delegate to `scripts/daemon-control.js` (testnet genesis, P2P 19735 / RPC 19736). Never reimplement.
- Log ring buffer cap 2000; default Playwright action timeout 15000 ms.
- `screenshot` MUST print the absolute PNG path as the last output line (the calling agent Reads it).
- All control API responses: `{ok: true, result}` or `{ok: false, error}` JSON.
- Commit style: conventional commits (`feat:`, `test:`, `docs:`), each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run all commands from repo root `C:\github\swimchain` unless a task says otherwise. PowerShell 5.1 is the shell: no `&&` — chain with `;`.

---

### Task 1: Package scaffold, config module, client registry

**Files:**
- Create: `tools/app-automation/package.json`
- Create: `tools/app-automation/.gitignore`
- Create: `tools/app-automation/lib/config.js`
- Test: `tools/app-automation/test/config.test.js`

**Interfaces:**
- Produces: `require('./lib/config')` exporting `{ ROOT, CONTROL_PORT, STATIC_PORT, CLIENTS_DIR, SHOTS_DIR, PID_FILE, LOG_BUFFER_CAP, DEFAULT_TIMEOUT, CLIENTS, clientUrl(name, route) }`. `clientUrl` returns `http://127.0.0.1:<STATIC_PORT>/<dir>/[route]` or `null` for unknown client names.

- [ ] **Step 1: Create package.json and .gitignore**

`tools/app-automation/package.json`:

```json
{
  "name": "swim-auto",
  "version": "1.0.0",
  "private": true,
  "description": "Swimchain app automation: run node, serve bundled clients, drive UI, capture screenshots and console logs",
  "bin": { "swim-auto": "./cli.js" },
  "scripts": {
    "test": "node --test test/",
    "smoke": "node smoke.js"
  },
  "dependencies": {
    "playwright": "^1.61.1"
  }
}
```

`tools/app-automation/.gitignore`:

```
node_modules/
shots/
```

- [ ] **Step 2: Install dependencies and Chromium**

Run: `cd tools/app-automation; npm install; npx playwright install chromium; cd ..\..`
Expected: playwright installed; Chromium download completes (or reports already installed).

- [ ] **Step 3: Write the failing test**

`tools/app-automation/test/config.test.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd tools/app-automation; node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../lib/config'`

- [ ] **Step 5: Write the config module**

`tools/app-automation/lib/config.js`:

```js
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd tools/app-automation; node --test test/config.test.js`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```powershell
git add tools/app-automation/package.json tools/app-automation/package-lock.json tools/app-automation/.gitignore tools/app-automation/lib/config.js tools/app-automation/test/config.test.js
git commit -m "feat(swim-auto): package scaffold, config, client registry`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Log ring buffer

**Files:**
- Create: `tools/app-automation/lib/ringbuffer.js`
- Test: `tools/app-automation/test/ringbuffer.test.js`

**Interfaces:**
- Produces: `class RingBuffer { constructor(cap); push(item); list({tail, errorsOnly} = {}); clear(); get size() }`. Entries are `{ts, kind, type, text, location}` where `kind` ∈ `console|pageerror|requestfailed`. `errorsOnly` keeps `pageerror`, `requestfailed`, and `console` entries with `type === 'error'`.

- [ ] **Step 1: Write the failing test**

`tools/app-automation/test/ringbuffer.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { RingBuffer } = require('../lib/ringbuffer');

function entry(kind, type, text) {
  return { ts: 0, kind, type, text, location: '' };
}

test('caps at capacity, keeping newest', () => {
  const b = new RingBuffer(3);
  for (let i = 1; i <= 5; i++) b.push(entry('console', 'log', `m${i}`));
  assert.strictEqual(b.size, 3);
  assert.deepStrictEqual(b.list().map(e => e.text), ['m3', 'm4', 'm5']);
});

test('errorsOnly filters to errors', () => {
  const b = new RingBuffer(10);
  b.push(entry('console', 'log', 'info'));
  b.push(entry('console', 'error', 'boom'));
  b.push(entry('pageerror', '', 'crash'));
  b.push(entry('requestfailed', '', 'net'));
  assert.deepStrictEqual(b.list({ errorsOnly: true }).map(e => e.text), ['boom', 'crash', 'net']);
});

test('tail limits to last N after filtering', () => {
  const b = new RingBuffer(10);
  for (let i = 1; i <= 5; i++) b.push(entry('console', 'log', `m${i}`));
  assert.deepStrictEqual(b.list({ tail: 2 }).map(e => e.text), ['m4', 'm5']);
});

test('clear empties the buffer', () => {
  const b = new RingBuffer(10);
  b.push(entry('console', 'log', 'x'));
  b.clear();
  assert.strictEqual(b.size, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/app-automation; node --test test/ringbuffer.test.js`
Expected: FAIL — `Cannot find module '../lib/ringbuffer'`

- [ ] **Step 3: Write the implementation**

`tools/app-automation/lib/ringbuffer.js`:

```js
// Capped buffer for captured page events. Oldest entries are dropped first.
class RingBuffer {
  constructor(cap) {
    this.cap = cap;
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    if (this.items.length > this.cap) {
      this.items.splice(0, this.items.length - this.cap);
    }
  }

  list({ tail, errorsOnly } = {}) {
    let out = this.items;
    if (errorsOnly) {
      out = out.filter(
        e =>
          e.kind === 'pageerror' ||
          e.kind === 'requestfailed' ||
          (e.kind === 'console' && e.type === 'error')
      );
    }
    if (tail && out.length > tail) out = out.slice(-tail);
    return out.slice();
  }

  clear() {
    this.items = [];
  }
}

module.exports = { RingBuffer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/app-automation; node --test test/ringbuffer.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```powershell
git add tools/app-automation/lib/ringbuffer.js tools/app-automation/test/ringbuffer.test.js
git commit -m "feat(swim-auto): log ring buffer with errors filter`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Static client server (subpath serving + SPA fallback + deep-route asset rewrite)

**Files:**
- Create: `tools/app-automation/lib/static-server.js`
- Test: `tools/app-automation/test/static-server.test.js`

**Interfaces:**
- Consumes: `CFG.CLIENTS` shape (`{name: dirName}`).
- Produces:
  - `candidatesFor(urlPath, clientDirs)` — pure. Returns `null` if the path doesn't match a known `/{dir}/...` prefix, else `{clientDir, candidates}` where `candidates` is an ordered list of paths (relative to that client's dist dir) to try on disk, always ending with `'index.html'`.
  - `startStaticServer({port, clientsDir, clients})` — returns `Promise<http.Server>`; resolves once listening on `127.0.0.1`. Serves `GET /` as an HTML listing page that includes the exact text `swim-auto client index` and runs `console.log('[swim-auto] listing page loaded')` (the daemon integration test asserts on both).

**Why the asset rewrite exists:** clients are built with Vite `base: './'` and use `BrowserRouter`. A hard navigation to `/forum-client/thread/abc` gets `index.html` via SPA fallback, but that page's relative asset refs then resolve to `/forum-client/thread/assets/x.js`. The rewrite maps any `**/assets/<file>` miss back to the client's real `assets/<file>`.

- [ ] **Step 1: Write the failing tests**

`tools/app-automation/test/static-server.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools/app-automation; node --test test/static-server.test.js`
Expected: FAIL — `Cannot find module '../lib/static-server'`

- [ ] **Step 3: Write the implementation**

`tools/app-automation/lib/static-server.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/app-automation; node --test test/static-server.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```powershell
git add tools/app-automation/lib/static-server.js tools/app-automation/test/static-server.test.js
git commit -m "feat(swim-auto): static client server with SPA fallback and asset rewrite`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Browser session manager

**Files:**
- Create: `tools/app-automation/lib/browser.js`

**Interfaces:**
- Consumes: `RingBuffer` from Task 2.
- Produces: `class BrowserSession` with:
  - `constructor({headed, bufferCap, defaultTimeout})`
  - `logs` — the `RingBuffer` instance
  - `async open(url, clientName)` — launches Chromium on first use, navigates, remembers `clientName` and the client's base URL
  - `async goto(target)` — absolute `http(s)://` URL, or path relative to the current client's base; throws if relative and no client open
  - `async click(selector)`, `async type(selector, text)` (uses `locator.fill`), `async press(key)`
  - `async wait(selector, timeout)` — waits for first match visible
  - `async eval(js)` — evaluates a JS *expression* string in the page, returns JSON-safe result
  - `async screenshot({selector, out, fullPage})` — writes PNG, returns absolute path
  - `async ui(selector)` — returns ARIA snapshot string of `selector` (default `body`)
  - `status()` — `{launched, url, client}`
  - `async close()`

No unit test here (everything is Playwright-bound); Task 5's integration test drives every method through the daemon against a real Chromium.

- [ ] **Step 1: Write the implementation**

`tools/app-automation/lib/browser.js`:

```js
// Owns the Playwright Chromium session and the continuous log capture.
// One page is reused across open()/goto() so the log buffer and browser
// state survive client switches.
const { chromium } = require('playwright');
const { RingBuffer } = require('./ringbuffer');

function fmtLocation(loc) {
  if (!loc || !loc.url) return '';
  return `${loc.url}:${loc.lineNumber || 0}`;
}

class BrowserSession {
  constructor({ headed = false, bufferCap = 2000, defaultTimeout = 15000 } = {}) {
    this.headed = headed;
    this.defaultTimeout = defaultTimeout;
    this.logs = new RingBuffer(bufferCap);
    this.browser = null;
    this.page = null;
    this.client = null; // current client name, e.g. 'forum'
    this.clientBase = null; // e.g. http://127.0.0.1:8899/forum-client/
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: !this.headed });
    }
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.defaultTimeout);
    this.attachCapture(this.page);
    return this.page;
  }

  attachCapture(page) {
    page.on('console', msg => {
      this.logs.push({
        ts: Date.now(),
        kind: 'console',
        type: msg.type(),
        text: msg.text(),
        location: fmtLocation(msg.location()),
      });
    });
    page.on('pageerror', err => {
      this.logs.push({
        ts: Date.now(),
        kind: 'pageerror',
        type: '',
        text: err.stack || String(err),
        location: '',
      });
    });
    page.on('requestfailed', req => {
      const failure = req.failure();
      this.logs.push({
        ts: Date.now(),
        kind: 'requestfailed',
        type: '',
        text: `${req.method()} ${req.url()} -> ${failure ? failure.errorText : 'failed'}`,
        location: '',
      });
    });
  }

  async open(url, clientName) {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: 'load' });
    this.client = clientName || null;
    this.clientBase = clientName ? url.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : null;
    if (clientName) {
      // base is always .../{dir}/ — normalize in case a route was appended
      const m = url.match(/^(https?:\/\/[^/]+\/[a-z0-9-]+-client\/)/);
      if (m) this.clientBase = m[1];
    }
    return this.status();
  }

  async goto(target) {
    const page = await this.ensurePage();
    let url = target;
    if (!/^https?:\/\//.test(target)) {
      if (!this.clientBase) throw new Error("No client open — use 'open <client>' first or pass an absolute URL");
      url = this.clientBase + String(target).replace(/^\/+/, '');
    }
    await page.goto(url, { waitUntil: 'load' });
    return this.status();
  }

  requirePage() {
    if (!this.page || this.page.isClosed()) {
      throw new Error("No page open — use 'open <client>' first");
    }
    return this.page;
  }

  async click(selector) {
    await this.requirePage().locator(selector).first().click();
  }

  async type(selector, text) {
    await this.requirePage().locator(selector).first().fill(text);
  }

  async press(key) {
    await this.requirePage().keyboard.press(key);
  }

  async wait(selector, timeout) {
    await this.requirePage()
      .locator(selector)
      .first()
      .waitFor({ state: 'visible', timeout: timeout || this.defaultTimeout });
  }

  async eval(js) {
    // Evaluate as an expression; JSON round-trip keeps the result serializable.
    const result = await this.requirePage().evaluate(js);
    return JSON.parse(JSON.stringify(result === undefined ? null : result));
  }

  async screenshot({ selector, out, fullPage } = {}) {
    const page = this.requirePage();
    // Let renders settle so the picture reflects the latest action.
    await page.waitForTimeout(300);
    if (selector) {
      await page.locator(selector).first().screenshot({ path: out });
    } else {
      await page.screenshot({ path: out, fullPage: !!fullPage });
    }
    return out;
  }

  async ui(selector) {
    return this.requirePage().locator(selector || 'body').ariaSnapshot();
  }

  status() {
    const launched = !!(this.page && !this.page.isClosed());
    return {
      launched,
      url: launched ? this.page.url() : null,
      client: launched ? this.client : null,
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
      this.client = null;
      this.clientBase = null;
    }
  }
}

module.exports = { BrowserSession };
```

- [ ] **Step 2: Syntax check**

Run: `cd tools/app-automation; node -e "require('./lib/browser'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```powershell
git add tools/app-automation/lib/browser.js
git commit -m "feat(swim-auto): Playwright browser session with continuous log capture`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Daemon with control API + integration test

**Files:**
- Create: `tools/app-automation/daemon.js`
- Test: `tools/app-automation/test/daemon.test.js`

**Interfaces:**
- Consumes: `startStaticServer` (Task 3), `BrowserSession` (Task 4), `CFG` (Task 1).
- Produces: HTTP control API on `CFG.CONTROL_PORT` (127.0.0.1):
  - `GET /status` → `{ok, result: {pid, staticPort, controlPort, browser: {launched, url, client}}}`
  - `POST /open` `{client?, path?, url?}` — `url` wins; else `client` resolved via `CFG.clientUrl`
  - `POST /goto` `{target}`
  - `POST /click` `{selector}` · `POST /type` `{selector, text}` · `POST /press` `{key}`
  - `POST /wait` `{selector, timeout?}`
  - `POST /eval` `{js}` → result value
  - `POST /screenshot` `{selector?, out, fullPage?}` → absolute path (`out` is REQUIRED and absolute; the CLI computes defaults)
  - `POST /ui` `{selector?}` → ARIA snapshot string
  - `POST /logs` `{errorsOnly?, tail?, clear?}` → entries array (or `{cleared: true}`)
  - `POST /shutdown` → closes browser, static server, exits 0 after replying
- Daemon writes its PID to `CFG.PID_FILE` on boot and removes it on shutdown. `--headed` CLI flag propagates to `BrowserSession`.

- [ ] **Step 1: Write the failing integration test**

`tools/app-automation/test/daemon.test.js` (spawns the real daemon on alternate ports; drives a real headless Chromium against the static server's listing page — no swimchain node or built clients needed):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/app-automation; node --test test/daemon.test.js`
Expected: FAIL — daemon.js does not exist, `waitForDaemon` throws `daemon did not come up`

- [ ] **Step 3: Write the daemon**

`tools/app-automation/daemon.js`:

```js
#!/usr/bin/env node
// swim-auto daemon: owns the Playwright browser, the static client server,
// and the log buffer. The CLI talks to this over localhost HTTP.
const http = require('http');
const fs = require('fs');
const path = require('path');
const CFG = require('./lib/config');
const { startStaticServer } = require('./lib/static-server');
const { BrowserSession } = require('./lib/browser');

async function main() {
  const headed = process.argv.includes('--headed');
  const staticServer = await startStaticServer({
    port: CFG.STATIC_PORT,
    clientsDir: CFG.CLIENTS_DIR,
    clients: CFG.CLIENTS,
  });
  const session = new BrowserSession({
    headed,
    bufferCap: CFG.LOG_BUFFER_CAP,
    defaultTimeout: CFG.DEFAULT_TIMEOUT,
  });

  let controlServer;

  async function shutdown() {
    await session.close();
    staticServer.close();
    try {
      fs.unlinkSync(CFG.PID_FILE);
    } catch {}
    controlServer.close(() => process.exit(0));
    // Belt and braces: force-exit if close callbacks hang.
    setTimeout(() => process.exit(0), 2000).unref();
  }

  const handlers = {
    'GET /status': async () => ({
      pid: process.pid,
      staticPort: CFG.STATIC_PORT,
      controlPort: CFG.CONTROL_PORT,
      browser: session.status(),
    }),
    'POST /open': async b => {
      const url = b.url || CFG.clientUrl(b.client, b.path);
      if (!url) {
        throw new Error(`unknown client '${b.client}' (known: ${Object.keys(CFG.CLIENTS).join(', ')})`);
      }
      return session.open(url, b.url ? null : b.client);
    },
    'POST /goto': async b => session.goto(b.target),
    'POST /click': async b => {
      await session.click(b.selector);
      return { clicked: b.selector };
    },
    'POST /type': async b => {
      await session.type(b.selector, b.text);
      return { typed: b.selector };
    },
    'POST /press': async b => {
      await session.press(b.key);
      return { pressed: b.key };
    },
    'POST /wait': async b => {
      await session.wait(b.selector, b.timeout);
      return { visible: b.selector };
    },
    'POST /eval': async b => session.eval(b.js),
    'POST /screenshot': async b => {
      if (!b.out) throw new Error('screenshot requires an absolute output path');
      fs.mkdirSync(path.dirname(b.out), { recursive: true });
      return session.screenshot(b);
    },
    'POST /ui': async b => session.ui(b.selector),
    'POST /logs': async b => {
      if (b.clear) {
        session.logs.clear();
        return { cleared: true };
      }
      return session.logs.list({ errorsOnly: !!b.errorsOnly, tail: b.tail });
    },
    'POST /shutdown': async () => {
      setTimeout(shutdown, 50);
      return { stopping: true };
    },
  };

  controlServer = http.createServer((req, res) => {
    const key = `${req.method} ${(req.url || '').split('?')[0]}`;
    const handler = handlers[key];
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      if (!handler) {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: `unknown endpoint ${key}` }));
        return;
      }
      let body = {};
      try {
        if (raw) body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
        return;
      }
      try {
        const result = await handler(body);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    controlServer.once('error', reject);
    controlServer.listen(CFG.CONTROL_PORT, '127.0.0.1', resolve);
  });

  fs.mkdirSync(path.dirname(CFG.PID_FILE), { recursive: true });
  fs.writeFileSync(CFG.PID_FILE, String(process.pid));

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(
    `[swim-auto] daemon up: control http://127.0.0.1:${CFG.CONTROL_PORT}, clients http://127.0.0.1:${CFG.STATIC_PORT}`
  );
}

main().catch(e => {
  console.error(`[swim-auto] daemon failed: ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/app-automation; node --test test/daemon.test.js`
Expected: PASS (1 test, takes a few seconds for Chromium launch)

- [ ] **Step 5: Run the whole unit suite**

Run: `cd tools/app-automation; npm test`
Expected: all tests pass (config, ringbuffer, static-server, daemon)

- [ ] **Step 6: Commit**

```powershell
git add tools/app-automation/daemon.js tools/app-automation/test/daemon.test.js
git commit -m "feat(swim-auto): control-API daemon with integration test`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: CLI — arg parsing, daemon spawn, command dispatch

**Files:**
- Create: `tools/app-automation/lib/args.js`
- Create: `tools/app-automation/cli.js`
- Test: `tools/app-automation/test/args.test.js`

**Interfaces:**
- Consumes: daemon control API (Task 5), `CFG` (Task 1).
- Produces:
  - `parseArgs(argv)` → `{_: [positionals], flagName: value|true}` (flags are `--name` or `--name=value`).
  - `swim-auto` CLI commands: `open <client> [path]`, `goto <target>`, `click <sel>`, `type <sel> <text...>`, `press <key>`, `wait <sel> [--timeout ms]`, `eval <js...>`, `screenshot [sel] [--out file] [--full]`, `ui [sel]`, `logs [--errors] [--tail N] [--clear]`, `status`, `stop [--all]`, plus Task 7's `node`/`clients` commands. Browser commands auto-start the daemon. `--shot` on `open/goto/click/type/press` takes a screenshot after the action and prints its path last. `--headed` on any daemon-starting command launches a visible browser.

- [ ] **Step 1: Write the failing parser test**

`tools/app-automation/test/args.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseArgs } = require('../lib/args');

test('positionals and flags', () => {
  assert.deepStrictEqual(parseArgs(['click', 'text=New Thread', '--shot']), {
    _: ['click', 'text=New Thread'],
    shot: true,
  });
});

test('flag values', () => {
  assert.deepStrictEqual(parseArgs(['wait', '#root', '--timeout=5000']), {
    _: ['wait', '#root'],
    timeout: '5000',
  });
  assert.deepStrictEqual(parseArgs(['screenshot', '--out=x.png', '--full']), {
    _: ['screenshot'],
    out: 'x.png',
    full: true,
  });
});

test('multi-word tail stays positional', () => {
  const a = parseArgs(['type', '#title', 'hello', 'world']);
  assert.deepStrictEqual(a._, ['type', '#title', 'hello', 'world']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/app-automation; node --test test/args.test.js`
Expected: FAIL — `Cannot find module '../lib/args'`

- [ ] **Step 3: Write lib/args.js**

`tools/app-automation/lib/args.js`:

```js
function parseArgs(argv) {
  const out = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) out[arg.slice(2)] = true;
      else out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      out._.push(arg);
    }
  }
  return out;
}

module.exports = { parseArgs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/app-automation; node --test test/args.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Write cli.js**

`tools/app-automation/cli.js`:

```js
#!/usr/bin/env node
// swim-auto CLI: thin dispatcher over the daemon's control API, plus node
// lifecycle (delegated to scripts/daemon-control.js) and client builds.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const CFG = require('./lib/config');
const { parseArgs } = require('./lib/args');

function api(method, endpoint, body, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: CFG.CONTROL_PORT,
        path: endpoint,
        method,
        timeout,
        headers: { 'Content-Type': 'application/json' },
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`bad daemon response: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('daemon request timed out'));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function daemonAlive() {
  try {
    const r = await api('GET', '/status', null, 1500);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon(headed) {
  if (await daemonAlive()) return;
  const daemonArgs = [path.join(__dirname, 'daemon.js')];
  if (headed) daemonArgs.push('--headed');
  const child = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    if (await daemonAlive()) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`daemon did not start on port ${CFG.CONTROL_PORT}`);
}

async function call(endpoint, body) {
  const r = await api('POST', endpoint, body || {});
  if (!r.ok) throw new Error(r.error);
  return r.result;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function defaultShotPath() {
  let client = 'page';
  try {
    const s = await api('GET', '/status');
    if (s.ok && s.result.browser.client) client = s.result.browser.client;
  } catch {}
  return path.join(CFG.SHOTS_DIR, `${client}-${timestamp()}.png`);
}

async function takeShot(args) {
  const out = path.resolve(args.out || (await defaultShotPath()));
  const result = await call('/screenshot', {
    out,
    selector: args._[1],
    fullPage: !!args.full,
  });
  // Contract: absolute path is the LAST line of output so agents can Read it.
  console.log(result);
  return result;
}

function fmtLog(e) {
  const t = new Date(e.ts).toISOString().slice(11, 19);
  const tag = e.kind === 'console' ? e.type : e.kind;
  const loc = e.location ? `  (${e.location})` : '';
  return `[${t}] ${tag.padEnd(13)} ${e.text}${loc}`;
}

function runNodeControl(argv) {
  const r = spawnSync(process.execPath, [path.join(CFG.ROOT, 'scripts', 'daemon-control.js'), ...argv], {
    cwd: CFG.ROOT,
    stdio: 'inherit',
  });
  return r.status || 0;
}

const HELP = `swim-auto — swimchain app automation (daemon + CLI)

Node & clients:
  node start|stop|status        Manage the testnet node (scripts/daemon-control.js)
  clients build                 Build all bundled clients (desktop-app build-clients.js)

Browser (auto-starts the daemon; add --headed to watch):
  open <client> [path]          Open a client: ${Object.keys(CFG.CLIENTS).join(', ')}
  goto <path|url>               Navigate within the client, or to an absolute URL
  click <selector>              Click (Playwright selectors: css, text=, role=)
  type <selector> <text...>     Fill an input
  press <key>                   Press a key (Enter, Escape, ...)
  wait <selector> [--timeout=ms]
  eval <js expression...>       Evaluate JS in the page, print JSON result
  screenshot [selector] [--out=file] [--full]
  ui [selector]                 ARIA snapshot of visible elements (find selectors)
  logs [--errors] [--tail=N] [--clear]
  status                        Daemon + browser + node status
  stop [--all]                  Stop browser+daemon (--all: also the node)

Any of open/goto/click/type/press accept --shot to screenshot after acting.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  // Non-daemon commands first.
  if (!cmd || cmd === 'help' || args.help) {
    console.log(HELP);
    return;
  }
  if (cmd === 'node') {
    const sub = args._[1];
    if (!['start', 'stop', 'status'].includes(sub)) throw new Error('usage: swim-auto node start|stop|status');
    const flags = sub === 'status' ? [sub] : [sub, '--node-only'];
    process.exitCode = runNodeControl(flags);
    return;
  }
  if (cmd === 'clients') {
    if (args._[1] !== 'build') throw new Error('usage: swim-auto clients build');
    const r = spawnSync(process.execPath, [path.join(CFG.ROOT, 'desktop-app', 'scripts', 'build-clients.js')], {
      cwd: CFG.ROOT,
      stdio: 'inherit',
    });
    process.exitCode = r.status || 0;
    return;
  }
  if (cmd === 'stop') {
    if (await daemonAlive()) {
      await api('POST', '/shutdown', {});
      console.log('daemon stopped');
    } else {
      console.log('daemon not running');
    }
    try {
      fs.unlinkSync(CFG.PID_FILE);
    } catch {}
    if (args.all) process.exitCode = runNodeControl(['stop', '--node-only']);
    return;
  }
  if (cmd === 'status') {
    if (await daemonAlive()) {
      const s = await api('GET', '/status');
      console.log(JSON.stringify(s.result, null, 2));
    } else {
      console.log('daemon: not running');
    }
    runNodeControl(['status']);
    return;
  }

  // Browser commands: make sure the daemon is up.
  await ensureDaemon(!!args.headed);

  switch (cmd) {
    case 'open': {
      const client = args._[1];
      if (!client) throw new Error('usage: swim-auto open <client> [path]');
      const built = fs.existsSync(path.join(CFG.CLIENTS_DIR, CFG.CLIENTS[client] || '', 'index.html'));
      if (CFG.CLIENTS[client] && !built) {
        throw new Error(`${client} is not built — run: swim-auto clients build`);
      }
      const result = await call('/open', { client, path: args._[2] });
      console.log(JSON.stringify(result));
      break;
    }
    case 'goto': {
      if (!args._[1]) throw new Error('usage: swim-auto goto <path|url>');
      console.log(JSON.stringify(await call('/goto', { target: args._[1] })));
      break;
    }
    case 'click': {
      if (!args._[1]) throw new Error('usage: swim-auto click <selector>');
      await call('/click', { selector: args._[1] });
      console.log(`clicked ${args._[1]}`);
      break;
    }
    case 'type': {
      if (args._.length < 3) throw new Error('usage: swim-auto type <selector> <text...>');
      const text = args._.slice(2).join(' ');
      await call('/type', { selector: args._[1], text });
      console.log(`typed into ${args._[1]}`);
      break;
    }
    case 'press': {
      if (!args._[1]) throw new Error('usage: swim-auto press <key>');
      await call('/press', { key: args._[1] });
      console.log(`pressed ${args._[1]}`);
      break;
    }
    case 'wait': {
      if (!args._[1]) throw new Error('usage: swim-auto wait <selector> [--timeout=ms]');
      await call('/wait', { selector: args._[1], timeout: args.timeout ? parseInt(args.timeout, 10) : undefined });
      console.log(`visible: ${args._[1]}`);
      break;
    }
    case 'eval': {
      if (args._.length < 2) throw new Error('usage: swim-auto eval <js expression>');
      const result = await call('/eval', { js: args._.slice(1).join(' ') });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'screenshot': {
      await takeShot(args);
      return; // takeShot already printed the path as the last line
    }
    case 'ui': {
      console.log(await call('/ui', { selector: args._[1] }));
      break;
    }
    case 'logs': {
      const result = await call('/logs', {
        errorsOnly: !!args.errors,
        tail: args.tail ? parseInt(args.tail, 10) : undefined,
        clear: !!args.clear,
      });
      if (result.cleared) console.log('logs cleared');
      else if (result.length === 0) console.log('(no log entries)');
      else result.forEach(e => console.log(fmtLog(e)));
      break;
    }
    default:
      throw new Error(`unknown command '${cmd}' — run: swim-auto help`);
  }

  // --shot: act-then-look in one command.
  if (args.shot && ['open', 'goto', 'click', 'type', 'press'].includes(cmd)) {
    await takeShot({ _: [], out: undefined, full: false });
  }
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 6: Manual verification against the daemon**

Run (from repo root):

```powershell
node tools/app-automation/cli.js status
node tools/app-automation/cli.js eval "1 + 1"   # should auto-start daemon; fails with 'No page open' — expected
node tools/app-automation/cli.js goto "http://127.0.0.1:8899/" ; node tools/app-automation/cli.js eval "document.title"
node tools/app-automation/cli.js screenshot
node tools/app-automation/cli.js logs
node tools/app-automation/cli.js stop
```

Expected: `status` shows daemon not running then node status; `eval` first errors with "No page open" (exit 1 — fine); `goto` errors with "No client open" for relative targets but this absolute URL works after daemon auto-start; `eval` prints `"swim-auto"`; `screenshot` prints an absolute path under `tools/app-automation/shots/`; `logs` shows the listing-page console line; `stop` prints `daemon stopped`.

- [ ] **Step 7: Commit**

```powershell
git add tools/app-automation/lib/args.js tools/app-automation/cli.js tools/app-automation/test/args.test.js
git commit -m "feat(swim-auto): CLI with daemon auto-spawn, --shot, node/clients delegation`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Smoke test — full loop against the real node and bundled clients

**Files:**
- Create: `tools/app-automation/smoke.js`

**Interfaces:**
- Consumes: the complete CLI (Task 6). Requires built clients in `desktop-app/dist/clients/` (present) and a buildable/startable testnet node via `scripts/daemon-control.js`.

- [ ] **Step 1: Check the forum client's root element id**

Run: `Select-String -Path desktop-app\dist\clients\forum-client\index.html -Pattern 'id="root"'`
Expected: a match (standard Vite React root). If the id differs, use the actual id in Step 2's `wait` call.

- [ ] **Step 2: Write smoke.js**

`tools/app-automation/smoke.js`:

```js
#!/usr/bin/env node
// Acceptance check: node up -> open forum -> see it -> read logs -> switch
// to chat -> see it -> tear down. Run: node tools/app-automation/smoke.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CLI = path.join(__dirname, 'cli.js');

function run(...cliArgs) {
  console.log(`\n$ swim-auto ${cliArgs.join(' ')}`);
  const out = execFileSync(process.execPath, [CLI, ...cliArgs], { encoding: 'utf8', timeout: 120000 });
  process.stdout.write(out);
  return out.trim();
}

function lastLine(s) {
  const lines = s.split('\n').filter(Boolean);
  return lines[lines.length - 1];
}

try {
  run('node', 'start'); // daemon-control waits for RPC health itself

  run('open', 'forum');
  run('wait', '#root');

  const shot1 = lastLine(run('screenshot'));
  assert.ok(fs.existsSync(shot1), `screenshot missing: ${shot1}`);
  assert.ok(fs.statSync(shot1).size > 5000, 'screenshot suspiciously small');

  const logs = run('logs', '--tail=50');
  assert.notStrictEqual(logs, '(no log entries)', 'expected console output from the forum client');

  const snapshot = run('ui');
  assert.ok(snapshot.length > 0, 'expected a non-empty ARIA snapshot');

  const chatStatus = run('open', 'chat');
  assert.ok(chatStatus.includes('chat-client'), `expected chat-client URL, got: ${chatStatus}`);
  const shot2 = lastLine(run('screenshot'));
  assert.ok(fs.existsSync(shot2), `screenshot missing: ${shot2}`);

  console.log('\nSMOKE OK');
} finally {
  try {
    run('stop');
  } catch {}
}
```

Note: `smoke.js` intentionally leaves the node running (stopping it is disruptive if the operator had it up already); `swim-auto stop --all` tears it down when wanted.

- [ ] **Step 3: Ensure the node binary exists**

Run: `Test-Path target\release\sw.exe; Test-Path target\release\sw`
Expected: at least one `True`. If both `False`, build it: `cargo build --release` (several minutes). Check which filename `scripts/daemon-control.js` expects (`CONFIG.node.binary` is `target/release/sw`) — on Windows spawn resolves `sw` to `sw.exe` automatically; if `node start` fails on the binary path, note it and fix `daemon-control.js`'s binary resolution with a `process.platform === 'win32'` suffix check.

- [ ] **Step 4: Run the smoke test**

Run: `node tools/app-automation/smoke.js`
Expected: each command echoes, two screenshot paths print, final line `SMOKE OK`.

If the forum client renders but shows a connection error, check `swim-auto logs --errors` for the RPC endpoint it tried — it must be `http://127.0.0.1:19736` (testnet). A different port means the standalone fallback isn't picking testnet; investigate `forum-client/src/lib/rpc.ts` `LOCAL_CONFIG` before proceeding.

- [ ] **Step 5: Look at the screenshots**

Read both PNG files printed by the smoke run and confirm they show the forum and chat UIs respectively (not blank pages or error screens). This is the point of the tool — verify visually.

- [ ] **Step 6: Commit**

```powershell
git add tools/app-automation/smoke.js
git commit -m "test(swim-auto): end-to-end smoke test (node + forum + chat)`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: README and final polish

**Files:**
- Create: `tools/app-automation/README.md`

- [ ] **Step 1: Write the README**

`tools/app-automation/README.md`:

```markdown
# swim-auto

App automation for swimchain: run the testnet node, serve the bundled clients,
drive the UI in a real Chromium, take screenshots, and read console logs / JS
errors. Built for Claude sessions validating frontend functionality.

Spec: `docs/superpowers/specs/2026-07-09-app-automation-tool-design.md`

## Setup (once)

    cd tools/app-automation
    npm install
    npx playwright install chromium

Clients must be built: `node tools/app-automation/cli.js clients build`
(wraps `desktop-app/scripts/build-clients.js`).

## Typical session

    node tools/app-automation/cli.js node start        # testnet genesis node
    node tools/app-automation/cli.js open forum        # daemon + browser start automatically
    node tools/app-automation/cli.js ui                # ARIA snapshot: find selectors
    node tools/app-automation/cli.js click "text=New Thread" --shot
    node tools/app-automation/cli.js type "#title" "hello world"
    node tools/app-automation/cli.js screenshot        # prints absolute PNG path (Read it)
    node tools/app-automation/cli.js logs --errors
    node tools/app-automation/cli.js open chat         # switch client, same browser
    node tools/app-automation/cli.js stop --all        # stop browser, daemon, node

Run `node tools/app-automation/cli.js help` for the full command list.

## How it works

- A detached **daemon** (`daemon.js`) owns a Playwright Chromium, a static
  server on :8899 for `desktop-app/dist/clients/`, and a 2000-entry ring
  buffer capturing every console message, uncaught exception, and failed
  request — nothing between CLI calls is lost.
- The **CLI** (`cli.js`) talks to the daemon on :8897 and auto-starts it.
  `--headed` launches a visible browser. `--shot` on any action command
  screenshots after acting.
- Clients are served standalone (not in the Tauri iframe) and fall back to
  `http://127.0.0.1:19736` (local testnet RPC) per `useRpc.tsx`.
- Node lifecycle delegates to `scripts/daemon-control.js`.

## Tests

    npm test        # unit + daemon integration (needs Chromium, no node)
    npm run smoke   # full loop (starts the testnet node, opens clients)
```

- [ ] **Step 2: Run the full unit suite one more time**

Run: `cd tools/app-automation; npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```powershell
git add tools/app-automation/README.md
git commit -m "docs(swim-auto): README with setup and typical session`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification checklist (maps to spec)

- Run node: `node start|stop|status` (Task 6, delegation) ✅
- Serve bundled clients: static server, all five clients (Tasks 3, 5) ✅
- Switch clients: `open <client>` reuses the browser (Tasks 4–6, smoke) ✅
- Interact with UI: `click/type/press/wait/goto` (Tasks 4–6) ✅
- SEE the UI: `screenshot` prints absolute path (agents Read it), element shots, `--full`, `--shot`, `ui` ARIA snapshot (Tasks 4–6) ✅
- Console/JS info: continuous capture of console + pageerror + requestfailed, `logs --errors/--tail/--clear`, `eval` (Tasks 2, 4, 5) ✅
- Error handling: unknown client, not-built client, no-page, daemon-spawn timeout, stale pidfile removal on stop (Tasks 5, 6) ✅
- Acceptance: `smoke.js` (Task 7) ✅
