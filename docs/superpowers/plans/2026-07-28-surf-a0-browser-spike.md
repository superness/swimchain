# Surf A0 — Browser Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Surf deck as a plain web page against an existing dev node and answer one question with measurements: do three warm channels (including one game) survive in a single Android WebView renderer, or is the deck N=2?

**Architecture:** A zero-dependency Node static server hosts the shell page and every channel dist under **one origin** (so all iframes share one renderer — the exact condition being measured) and proxies JSON-RPC to the dev node with cookie auth injected server-side. The shell is vanilla ES modules: a pure LRU deck state machine, a config-handover + readiness gate, a canvas static shader driven by live node numbers, and instrumentation (flip-to-paint, per-frame rAF heartbeats, longtasks, heap). The Android measurement runs in Chrome-for-Android over `adb reverse`, with renderer PSS sampled via `dumpsys meminfo`.

**Tech Stack:** Node 20+ (built-in `fetch`, `node:test`), vanilla ES modules (no npm deps in the spike), existing client dist bundles rebuilt with `vite build --base=... --outDir dist-spike`, adb + PowerShell for the device protocol.

**Worktree:** All work happens in `C:\github\swimchain\.claude\worktrees\mobile-app` on branch `worktree-mobile-app`. Before any first push of a session, check the branch's PR state (operator rule: never push to a merged branch).

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` (rev 3). A0 scope is §5 A0; its corrections are load-bearing (28-agent review). This plan implements A0 **only** — no APK, no Tauri, no `surf-app/` scaffold beyond `surf-app/spike/`, no dialed channels, no client source modifications.

## Global Constraints

Copied from the spec; every task's requirements implicitly include these.

- **Flip-to-paint ≤300ms warm; ≤2s cold, then SIGNAL LOST** (§3.2, §8). The 2s cold gate produces the SIGNAL LOST card, **never a blank frame**.
- **Seam rule:** the static persists **exactly until the incoming channel's readiness signal** — never shorter, never artificially longer (§3.2).
- **Static shader: one canvas, 30fps** (§8).
- **N=3 is a hypothesis to be measured; N=2 (current + last) is the stated fallback** (§2.2). A0's deliverable is this decision, recorded with numbers.
- **Power-on:** phosphor-green bloom ~700ms (§3.1). **Power-off:** CRT collapse to a dot, then a steady lantern-point captioned *"Still broadcasting."* (§3.7).
- **postMessage discipline:** outbound config uses an exact `targetOrigin` — **never `'*'`** (§2.4). Inbound messages count only when `event.source` is the specific frame's window **and** `event.origin` equals the expected origin (§2.2 inbound contract).
- **Frames carry `allow=""`** — no camera/mic/geolocation riding the shell's grants (§2.2).
- **All channels are same-origin baked bundles.** No remote/dialed channel is ever mounted in A0 (§2.4, §4). Existing client sources are **not modified** — only rebuilt with CLI flags.
- **Clients that mine PoW must do it in Workers** — known repo gotcha: a synchronous await-hash loop starves its own event loop; the spike's event-loop-health probes exist partly to catch this.
- **Spike code has zero npm dependencies.** Tests run with `node --test "surf-app/spike/*.test.mjs"` — the quoted glob form is mandatory: on Node 21+ positional args are glob patterns, **not** directories, so `node --test surf-app/spike/` loads the directory as a module, throws MODULE_NOT_FOUND, runs zero tests, and its error text masquerades as a TDD red (reproduced on this machine's Node v24.16.0, both shells). Node 21+.
- **Mutation-test rule (operator + §7):** every load-bearing test must be proven to FAIL against the bug it names before it counts.

## Verified facts this plan builds on

Checked in the worktree on 2026-07-28 — not assumptions:

| Fact | Where |
|---|---|
| Config message is `{type:'SWIMCHAIN_RPC_CONFIG', rpcEndpoint, rpcAuth, nodeAddress?, nodeDisplayName?}`; `rpcAuth` is a full `Authorization` header value (`'Basic ...'`) | `feed-client/src/hooks/useParentRpcConfig.ts:5-25`, `desktop-app/src/components/ClientFrame.tsx:45-51` |
| Clients accept config from **same origin always** (empty origin or `=== window.location.origin`), else prefix-match against `http://localhost`, `http://127.0.0.1`, `tauri://localhost`, `https://localhost` | `useParentRpcConfig.ts:33-50` — same-origin serving means the spike is always accepted |
| Node RPC sends **no CORS headers** — browser fetch from another origin would fail; hence the same-origin `/rpc` proxy | `grep Access-Control-Allow-Origin src/rpc/` → no matches |
| RPC auth is `Authorization: Basic base64(__cookie__:<cookie_hex>)`; cookie at `<data_dir>/.cookie`; node logs `Generated RPC auth cookie: <path>` at startup | `src/rpc/auth.rs:7-13,74-77,113` |
| `get_sync_status` returns `peer_count`, `chain_height`, `tip_hash` (16 hex chars), `mempool_actions`, `state` — everything the static shader needs in one call | `src/rpc/types.rs:154-178` |
| `get_info` returns `peer_count`, `block_height`, `version`, `network` | `src/rpc/methods.rs:1223-1253` |
| reef-client reads `VITE_RPC_ENDPOINT` at **build time**; no `SWIMCHAIN_RPC_CONFIG` handling (games adopt node identity in Phase C, not A0). **Caution:** `reef-client/.env.production:6` pins the mainnet gateway `https://swimchain.io/rpc`; the spike build must override via process env on every rebuild (Task 4 Step 1) | `reef-client/src/main.tsx:12-13`, `reef-client/.env.production:6`, spec §2.5 |
| `feed-client`, `forum-client`, `wiki-client`, `chat-client`, `reef-client` all exist in the worktree | directory listing |
| Vite dists are built with `base: '/'` — served under `/channels/<id>/` their absolute `/assets/...` URLs break, so each channel is rebuilt with `--base=/channels/<id>/` into `dist-spike/` (never touching `dist/`, which the deploy flow owns) | vite default + operator deploy rule |

## File structure

```
surf-app/spike/
  server.mjs            zero-dep static server + /rpc auth-injecting proxy (Task 1)
  channels.json         the dial: id, number, name, dist path, warmSize (Task 1)
  server.test.mjs       path-mapping / traversal tests (Task 1)
  deck.mjs              pure LRU deck state machine (Task 2)
  deck.test.mjs         (Task 2)
  handover.mjs          config message builder + readiness gate + inbound filter (Task 3)
  handover.test.mjs     (Task 3)
  index.html            the set: deck, static canvas, OSD, SIGNAL LOST, power, HUD (Task 4)
  shell.mjs             wiring: power, flip, mount/evict, advisory messages (Task 4)
  static-shader.mjs     honest static: canvas driven by get_sync_status (Task 5)
  static-shader.test.mjs(Task 5)
  measure.mjs           flip timer, frame probes, HUD, results export (Task 6)
  measure.test.mjs      (Task 6)
  meminfo-sampler.ps1   adb PSS sampler → CSV (Task 7)
  README.md             run book + measurement protocol (Task 7)
  RESULTS.md            the A0 answer: gates, numbers, N decision (Task 7)
```

Modified: root `.gitignore` (add `*-client/dist-spike/` — Task 4).

---

### Task 1: Spike scaffold — server, channel mounts, /rpc proxy

**Files:**
- Create: `surf-app/spike/server.mjs`
- Create: `surf-app/spike/channels.json`
- Create: `surf-app/spike/server.test.mjs`

**Interfaces:**
- Consumes: a running dev node (any mode) and its cookie file. To start one from the main checkout: `C:\github\swimchain\target\release\sw.exe --regtest --data-dir C:\tmp\surf-spike-node node start --listen 127.0.0.1:29735` (RPC = P2P port + 1 = 29736; if no release binary exists, `cargo build --release` first). The node logs `Generated RPC auth cookie: <path>` — use that exact path.
- Produces (later tasks rely on):
  - `GET /` → serves `surf-app/spike/index.html`; other shell files by path.
  - `GET /channels/<id>/...` → serves that channel's `dist-spike` bundle; extensionless paths fall back to the channel's `index.html`.
  - `POST /rpc` → forwarded to the node with the real `Authorization` header injected server-side. The page never sees the cookie.
  - `GET /spike-config.json` → `{ rpcAuth: 'Basic c3VyZi1zcGlrZQ==', nodeAddress?, warmSize, channels: [{id, number, name}] }` (placeholder `rpcAuth`; the proxy replaces auth anyway).
  - Exported for tests: `resolveMount(pathname, channels)` → `{ channelId: string|null, rel: string }` or `null`.
  - Server binds `127.0.0.1` only (the phone reaches it via `adb reverse`, never LAN).

- [ ] **Step 1: Write `channels.json`**

Numbers follow the spec's sparse bands (§3.4): surface 2–19, reef band 50–79. Five channels on the dial, warm set of 3, so LRU eviction is actually exercised while flipping.

```json
{
  "warmSize": 3,
  "channels": [
    { "id": "feed",  "number": 2,  "name": "FEED",  "dist": "../../feed-client/dist-spike" },
    { "id": "forum", "number": 3,  "name": "FORUM", "dist": "../../forum-client/dist-spike" },
    { "id": "wiki",  "number": 4,  "name": "WIKI",  "dist": "../../wiki-client/dist-spike" },
    { "id": "chat",  "number": 5,  "name": "CHAT",  "dist": "../../chat-client/dist-spike" },
    { "id": "reef",  "number": 50, "name": "REEF",  "dist": "../../reef-client/dist-spike" }
  ]
}
```

- [ ] **Step 2: Write the failing tests** (`surf-app/spike/server.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMount } from './server.mjs';

const CHANNELS = [{ id: 'feed', dist: 'x' }, { id: 'reef', dist: 'y' }];

test('root serves the shell index', () => {
  assert.deepEqual(resolveMount('/', CHANNELS), { channelId: null, rel: '/index.html' });
});

test('shell files resolve to the spike dir', () => {
  assert.deepEqual(resolveMount('/shell.mjs', CHANNELS), { channelId: null, rel: '/shell.mjs' });
});

test('channel root serves that dist index', () => {
  assert.deepEqual(resolveMount('/channels/feed/', CHANNELS), { channelId: 'feed', rel: '/index.html' });
  assert.deepEqual(resolveMount('/channels/feed', CHANNELS), { channelId: 'feed', rel: '/index.html' });
});

test('channel assets resolve inside that dist', () => {
  assert.deepEqual(resolveMount('/channels/reef/assets/index-abc.js', CHANNELS),
    { channelId: 'reef', rel: '/assets/index-abc.js' });
});

test('extensionless channel path falls back to its index (SPA deep link)', () => {
  assert.deepEqual(resolveMount('/channels/feed/space/123', CHANNELS),
    { channelId: 'feed', rel: '/index.html' });
});

test('unknown channel is rejected', () => {
  assert.equal(resolveMount('/channels/nope/index.html', CHANNELS), null);
});

test('traversal is rejected, encoded or not', () => {
  assert.equal(resolveMount('/channels/feed/%2e%2e/%2e%2e/server.mjs', CHANNELS), null);
  assert.equal(resolveMount('/..%2f..%2fsecret', CHANNELS), null);
  assert.equal(resolveMount('/channels/feed/..%5c..%5cserver.mjs', CHANNELS), null);
});
```

Note the traversal expectations: the reject check runs on the **decoded, un-normalized** path — any `..`, `\` or NUL returns `null`. Normalizing first would collapse `/../../secret` into a clean `/secret` and wave it through; the mutation check in Step 6 exists to catch exactly that ordering bug.

- [ ] **Step 3: Run tests, verify they fail**

Run from the worktree root: `node --test "surf-app/spike/*.test.mjs"`
Expected: FAIL — `Cannot find module ... server.mjs`.

- [ ] **Step 4: Write `surf-app/spike/server.mjs`**

```js
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
// Zero dependencies. Node 20+.

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
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `node --test "surf-app/spike/*.test.mjs"`
Expected: all `server.test.mjs` tests PASS.

- [ ] **Step 6: Mutation-check the traversal test**

Temporarily delete the `if (clean.includes('..') ...) return null;` line, rerun — the traversal tests must FAIL (if they still pass, the test is vacuous; fix the test, not the check). Restore the line, rerun, PASS.

- [ ] **Step 7: Verify the proxy against the live node**

With the dev node running and the server started (`node surf-app/spike/server.mjs --cookie=<logged cookie path> --rpc=http://127.0.0.1:29736`):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/rpc -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","id":1,"method":"get_sync_status","params":{}}'
```

Expected: a JSON result carrying `peer_count`, `chain_height`, `tip_hash`, `mempool_actions`. **Record the exact field names you see** — Task 5's `mapStats` consumes them; if any differ from this plan, fix Task 5's code when you get there, not the node.

Also: `Invoke-RestMethod http://localhost:8080/spike-config.json` → the dial JSON, and `/channels/feed/` → 404 for now (dist-spike doesn't exist until Task 4).

- [ ] **Step 8: Commit**

```bash
git add surf-app/spike/server.mjs surf-app/spike/channels.json surf-app/spike/server.test.mjs
git commit -m "feat(surf): A0 spike server - same-origin channel mounts + auth-injecting /rpc proxy"
```

---

### Task 2: Deck state machine (LRU warm set)

**Files:**
- Create: `surf-app/spike/deck.mjs`
- Create: `surf-app/spike/deck.test.mjs`

**Interfaces:**
- Consumes: nothing (pure module, no DOM).
- Produces (Task 4 relies on): `class Deck`:
  - `new Deck(ids: string[], warmSize: number)` — ids in dial order; throws if `warmSize < 2`.
  - `tune(id) -> { mounted: string[], evicted: string[], current: string }` — `mounted` lists ids that were cold and must be mounted now (0 or 1 entries); `evicted` lists ids to unmount.
  - `next() / prev()` — tune the dial neighbor (wraps around); same return shape.
  - `get current(): string|null`, `get warm(): string[]`, `get pinned(): string|null`.
  - `pin(id)` / `unpin()` — pinned channels are never LRU-evicted.
  - `evict(id)` — forced eviction (SIGNAL LOST path); throws on the current channel.

- [ ] **Step 1: Write the failing tests** (`surf-app/spike/deck.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from './deck.mjs';

const IDS = ['feed', 'forum', 'wiki', 'chat', 'reef'];

test('first tune mounts and sets current', () => {
  const d = new Deck(IDS, 3);
  assert.deepEqual(d.tune('feed'), { mounted: ['feed'], evicted: [], current: 'feed' });
  assert.equal(d.current, 'feed');
  assert.deepEqual(d.warm, ['feed']);
});

test('warm set grows to warmSize without eviction', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  const r = d.tune('wiki');
  assert.deepEqual(r.evicted, []);
  assert.equal(d.warm.length, 3);
});

test('exceeding warmSize evicts the least-recently-current channel', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum'); d.tune('wiki');
  const r = d.tune('chat');
  assert.deepEqual(r, { mounted: ['chat'], evicted: ['feed'], current: 'chat' });
});

test('re-tuning refreshes recency', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum'); d.tune('wiki');
  d.tune('feed');               // feed is now most recent
  const r = d.tune('chat');     // forum is now LRU
  assert.deepEqual(r.evicted, ['forum']);
});

test('tuning a warm channel mounts nothing', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  assert.deepEqual(d.tune('feed').mounted, []);
});

test('pinned channels are never LRU-evicted', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.pin('feed');
  d.tune('forum'); d.tune('wiki');
  const r = d.tune('chat');     // candidates exclude pinned feed and current chat
  assert.deepEqual(r.evicted, ['forum']);
  assert.deepEqual(new Set(d.warm), new Set(['feed', 'wiki', 'chat']));
});

test('current channel is never evicted even at warmSize 2 with a pin', () => {
  const d = new Deck(IDS, 2);
  d.tune('feed'); d.pin('feed');
  d.tune('forum');
  const r = d.tune('wiki');     // warm {feed(pinned), forum, wiki(current)} > 2
  assert.deepEqual(r.evicted, ['forum']);
});

test('next/prev walk dial order and wrap', () => {
  const d = new Deck(IDS, 3);
  d.tune('reef');
  assert.equal(d.next().current, 'feed');   // wrap bottom -> top
  assert.equal(d.prev().current, 'reef');   // and back
});

test('unknown channel throws; warmSize < 2 throws', () => {
  const d = new Deck(IDS, 3);
  assert.throws(() => d.tune('nope'), /unknown channel/);
  assert.throws(() => new Deck(IDS, 1), /warmSize/);
});

test('forced evict removes a warm channel but refuses the current one', () => {
  const d = new Deck(IDS, 3);
  d.tune('feed'); d.tune('forum');
  d.evict('feed');
  assert.deepEqual(d.warm, ['forum']);
  assert.throws(() => d.evict('forum'), /current/);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test "surf-app/spike/*.test.mjs"`
Expected: FAIL — `Cannot find module ... deck.mjs`.

- [ ] **Step 3: Write `surf-app/spike/deck.mjs`**

```js
// Deck state machine: which channels are warm (mounted), which is current,
// which get evicted. Pure — no DOM, no timers. LRU recency = the last moment
// a channel was the current one. The shell maps mounted/evicted to iframe
// creation/removal (spec §2.2: N most-recently-watched stay mounted; LRU
// eviction; one pinnable; the current and pinned channels are never
// eviction candidates).
export class Deck {
  #order; #warm; #warmSize; #tick = 0; #current = null; #pinned = null;

  constructor(ids, warmSize) {
    if (warmSize < 2) throw new Error('warmSize must be >= 2');
    this.#order = [...ids];
    this.#warm = new Map(); // id -> last-current tick
    this.#warmSize = warmSize;
  }

  get current() { return this.#current; }
  get warm() { return [...this.#warm.keys()]; }
  get pinned() { return this.#pinned; }

  tune(id) {
    if (!this.#order.includes(id)) throw new Error(`unknown channel ${id}`);
    const mounted = this.#warm.has(id) ? [] : [id];
    this.#warm.set(id, ++this.#tick);
    this.#current = id;
    const evicted = [];
    while (this.#warm.size > this.#warmSize) {
      const candidates = [...this.#warm.entries()]
        .filter(([cid]) => cid !== this.#current && cid !== this.#pinned)
        .sort((a, b) => a[1] - b[1]);
      if (candidates.length === 0) break; // warm = {current, pinned}; nothing evictable
      const [victim] = candidates[0];
      this.#warm.delete(victim);
      evicted.push(victim);
    }
    return { mounted, evicted, current: this.#current };
  }

  next() { return this.tune(this.#neighbor(+1)); }
  prev() { return this.tune(this.#neighbor(-1)); }

  #neighbor(step) {
    const i = this.#order.indexOf(this.#current);
    return this.#order[(i + step + this.#order.length) % this.#order.length];
  }

  pin(id) {
    if (!this.#warm.has(id)) throw new Error('pin requires a warm channel');
    this.#pinned = id;
  }
  unpin() { this.#pinned = null; }

  evict(id) { // forced (SIGNAL LOST / wedged frame); DOM removal works regardless
    if (id === this.#current) throw new Error('cannot evict current channel');
    this.#warm.delete(id);
    if (this.#pinned === id) this.#pinned = null;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test "surf-app/spike/*.test.mjs"` — all deck tests PASS.

- [ ] **Step 5: Mutation-check the LRU test**

Flip the eviction sort to `b[1] - a[1]` (evict most-recent instead of least): the `exceeding warmSize evicts the least-recently-current` and `re-tuning refreshes recency` tests must FAIL. Restore, rerun, PASS.

- [ ] **Step 6: Commit**

```bash
git add surf-app/spike/deck.mjs surf-app/spike/deck.test.mjs
git commit -m "feat(surf): A0 deck state machine - LRU warm set with pin and forced evict"
```

---

### Task 3: Config handover + readiness gate

**Files:**
- Create: `surf-app/spike/handover.mjs`
- Create: `surf-app/spike/handover.test.mjs`

**Interfaces:**
- Consumes: nothing (DOM only touched inside `watchReadiness`, which tests don't call).
- Produces (Task 4 relies on):
  - `buildConfigMessage({rpcEndpoint, rpcAuth, nodeAddress?, nodeDisplayName?})` → the exact `SWIMCHAIN_RPC_CONFIG` object clients expect; absent optionals are **omitted**, not `undefined`.
  - `isFromFrame(event, frameWindow, expectedOrigin): boolean` — inbound filter.
  - `createReadinessGate({timeoutMs, onReady, onTimeout, setTimeoutFn?, clearTimeoutFn?})` → `{ settled, ready(via): boolean, cancel() }` — first signal wins, late signals return `false`.
  - `watchReadiness(iframe, {timeoutMs?, onReady, onTimeout, pollMs?})` → gate (with cleanup folded into `ready`/`cancel`/timeout).

**Design notes (from the spec, load-bearing):**
- No shipped client posts `SWIMCHAIN_CHANNEL_READY` yet (§2.2 defines it as new). The spike listens for it (forward-compat) but detects readiness by **same-origin DOM peek**: the client's `#root` gained children, then one `requestAnimationFrame` — ≈ first meaningful render, which is what flip-to-paint must measure.
- The spec's `load` + rAF fallback is for **cross-origin** channels only. `load` fires before React renders; arming it on same-origin frames would settle the gate on an unpainted frame and break the seam rule (static persists exactly until READY). The spike is 100% same-origin, so the fallback is **deliberately not armed** — the timeout covers pathological cases.
- Outbound config: exact `targetOrigin`, never `'*'` (§2.4). Inbound: `event.source` must be this frame's window and `event.origin` must equal ours (§2.2).

- [ ] **Step 1: Write the failing tests** (`surf-app/spike/handover.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigMessage, isFromFrame, createReadinessGate } from './handover.mjs';

test('config message matches the client contract, omitting absent optionals', () => {
  const msg = buildConfigMessage({ rpcEndpoint: 'http://localhost:8080/rpc', rpcAuth: 'Basic x' });
  assert.deepEqual(msg, {
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint: 'http://localhost:8080/rpc',
    rpcAuth: 'Basic x',
  });
  assert.equal('nodeAddress' in msg, false); // omitted, not undefined
  const withId = buildConfigMessage({ rpcEndpoint: 'e', rpcAuth: 'a', nodeAddress: 'cs1q' });
  assert.equal(withId.nodeAddress, 'cs1q');
});

test('isFromFrame requires the exact source window AND exact origin', () => {
  const frameWin = {}; const otherWin = {};
  const ORIGIN = 'http://localhost:8080';
  assert.equal(isFromFrame({ source: frameWin, origin: ORIGIN }, frameWin, ORIGIN), true);
  assert.equal(isFromFrame({ source: otherWin, origin: ORIGIN }, frameWin, ORIGIN), false); // sibling
  assert.equal(isFromFrame({ source: frameWin, origin: 'http://evil.test' }, frameWin, ORIGIN), false);
  assert.equal(isFromFrame({ source: frameWin, origin: 'http://localhost:8080.evil.test' }, frameWin, ORIGIN), false); // prefix trick
});

function fakeTimers() {
  const pending = new Map(); let nextId = 1;
  return {
    set: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clear: (id) => pending.delete(id),
    fire: () => { for (const { fn } of pending.values()) fn(); pending.clear(); },
    count: () => pending.size,
  };
}

test('gate: timeout fires when nothing was ready', () => {
  const t = fakeTimers(); let readyVia = null; let timedOut = false;
  createReadinessGate({ timeoutMs: 2000, onReady: (v) => { readyVia = v; }, onTimeout: () => { timedOut = true; },
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  t.fire();
  assert.equal(timedOut, true);
  assert.equal(readyVia, null);
});

test('gate: ready settles, cancels the timeout, and reports the signal', () => {
  const t = fakeTimers(); let readyVia = null; let timedOut = false;
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: (v) => { readyVia = v; }, onTimeout: () => { timedOut = true; },
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  assert.equal(gate.ready('dom-peek'), true);
  assert.equal(readyVia, 'dom-peek');
  assert.equal(t.count(), 0);        // timeout cleared
  t.fire();
  assert.equal(timedOut, false);
});

test('gate: first signal wins — duplicate and post-timeout ready are ignored', () => {
  const t = fakeTimers(); let readyCount = 0;
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: () => { readyCount++; }, onTimeout: () => {},
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  assert.equal(gate.ready('message'), true);
  assert.equal(gate.ready('dom-peek'), false);  // duplicate
  assert.equal(readyCount, 1);

  const t2 = fakeTimers();
  const gate2 = createReadinessGate({ timeoutMs: 2000, onReady: () => { assert.fail('ready after timeout'); },
    onTimeout: () => {}, setTimeoutFn: t2.set, clearTimeoutFn: t2.clear });
  t2.fire();
  assert.equal(gate2.ready('late'), false);
});

test('gate: cancel prevents both callbacks (flip-away mid-mount)', () => {
  const t = fakeTimers();
  const gate = createReadinessGate({ timeoutMs: 2000, onReady: () => assert.fail('ready'), onTimeout: () => assert.fail('timeout'),
    setTimeoutFn: t.set, clearTimeoutFn: t.clear });
  gate.cancel();
  t.fire();
  assert.equal(gate.ready('x'), false);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test "surf-app/spike/*.test.mjs"`
Expected: FAIL — `Cannot find module ... handover.mjs`.

- [ ] **Step 3: Write `surf-app/spike/handover.mjs`**

```js
// Config handover + readiness gate for the incoming channel.
//
// Outbound: SWIMCHAIN_RPC_CONFIG posted with an EXACT targetOrigin — never
// '*' (spec §2.4). Existing clients accept same-origin messages, so the
// spike's own origin always passes their allowlist.
//
// Readiness (spec §2.2 seam rule): the static persists exactly until the
// incoming channel is painted. Signals, first one wins:
//   1. 'message'  — SWIMCHAIN_CHANNEL_READY from exactly this frame
//                   (no shipped client sends it yet; forward-compat)
//   2. 'dom-peek' — same-origin peek: the client's #root gained children,
//                   then one rAF (≈ first meaningful render)
// The spec's load+rAF fallback is for cross-origin channels only: load fires
// BEFORE React renders, so arming it here would expose an unpainted frame.
// Hard timeout → onTimeout → SIGNAL LOST card. Never a blank frame.

export function buildConfigMessage({ rpcEndpoint, rpcAuth, nodeAddress, nodeDisplayName }) {
  return {
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint,
    rpcAuth,
    ...(nodeAddress ? { nodeAddress } : {}),
    ...(nodeDisplayName ? { nodeDisplayName } : {}),
  };
}

// Inbound filter (spec §2.2): a message counts only if it comes from exactly
// this frame's window at exactly the expected origin. No prefix matching.
export function isFromFrame(event, frameWindow, expectedOrigin) {
  return event.source === frameWindow && event.origin === expectedOrigin;
}

// Timer functions are injectable so tests control time.
export function createReadinessGate({ timeoutMs = 2000, onReady, onTimeout,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let settled = false;
  const timer = setTimeoutFn(() => {
    if (!settled) { settled = true; onTimeout(); }
  }, timeoutMs);
  return {
    get settled() { return settled; },
    ready(via) {
      if (settled) return false;
      settled = true;
      clearTimeoutFn(timer);
      onReady(via);
      return true;
    },
    cancel() { settled = true; clearTimeoutFn(timer); },
  };
}

// DOM wiring. Returns the gate so the caller can cancel on flip-away.
export function watchReadiness(iframe, { timeoutMs = 2000, onReady, onTimeout, pollMs = 50 }) {
  let cleanup = () => {};
  const gate = createReadinessGate({
    timeoutMs,
    onReady: (via) => { cleanup(); onReady(via); },
    onTimeout: () => { cleanup(); onTimeout(); },
  });

  const onMsg = (e) => {
    if (e.data?.type === 'SWIMCHAIN_CHANNEL_READY'
      && isFromFrame(e, iframe.contentWindow, window.location.origin)) {
      gate.ready('message');
    }
  };
  window.addEventListener('message', onMsg);

  const peek = setInterval(() => {
    try {
      const root = iframe.contentDocument?.querySelector('#root');
      if (root && root.childElementCount > 0) {
        clearInterval(peek);
        requestAnimationFrame(() => gate.ready('dom-peek'));
      }
    } catch { /* cross-origin frame: only READY message or timeout apply */ }
  }, pollMs);

  cleanup = () => { window.removeEventListener('message', onMsg); clearInterval(peek); };
  const innerCancel = gate.cancel.bind(gate);
  gate.cancel = () => { cleanup(); innerCancel(); };
  return gate;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test "surf-app/spike/*.test.mjs"` — all handover tests PASS.

- [ ] **Step 5: Mutation-check the inbound filter and the first-wins guard**

1. In `isFromFrame`, change `event.source === frameWindow` to `true`: the sibling-window case must FAIL.
2. In `isFromFrame`, change `origin === expectedOrigin` to `origin.startsWith(expectedOrigin)`: the prefix-trick case (`http://localhost:8080.evil.test`) must FAIL.
3. In `createReadinessGate.ready`, remove the `if (settled) return false;` guard: the duplicate-ready test must FAIL.

Each mutation: apply, run, confirm the named test fails, revert, confirm PASS.

- [ ] **Step 6: Commit**

```bash
git add surf-app/spike/handover.mjs surf-app/spike/handover.test.mjs
git commit -m "feat(surf): A0 config handover + readiness gate - exact-origin, first-wins, 2s cold gate"
```

---

### Task 4: Channel builds + the shell page (power, flip, OSD, SIGNAL LOST)

**Files:**
- Create: `surf-app/spike/index.html`
- Create: `surf-app/spike/shell.mjs`
- Modify: root `.gitignore` (append one line)
- Create (build artifacts, gitignored): `feed-client/dist-spike/`, `forum-client/dist-spike/`, `wiki-client/dist-spike/`, `chat-client/dist-spike/`, `reef-client/dist-spike/`

**Interfaces:**
- Consumes: `Deck` (Task 2), `buildConfigMessage` / `watchReadiness` (Task 3), `GET /spike-config.json` + `/channels/<id>/` (Task 1). Also consumes `createStatic` (Task 5) and `createFlipTimer` / `attachFrameProbes` / `createHud` / `exportResults` (Task 6) — **stub them for now** exactly as shown in Step 4 so this task runs standalone; Tasks 5–6 replace the stubs by changing one import line.
- Produces: the running spike page. Controls: **ArrowUp/ArrowDown** flip (desktop), **vertical swipe on the right-edge strip** flips (touch), **p** power toggle, **m** HUD toggle, **r** reset the drift gauge (stage-scoped G4 measurement), **e** or **tap the invisible bottom-right 44px corner** export results JSON, tap the bottom-left 44px corner for HUD, tap the off-screen to power back on. Shell keys are registered on the shell window **and on every mounted frame's window** (same-origin) — otherwise the first click inside a channel moves focus into the iframe and all shell keys go dead.

**Design notes:**
- **Warm frames are occluded, not hidden.** All channel iframes are full-screen, stacked by z-index; the current one is raised. Hidden channels keep their rAF loops and timers running at full rate — the deliberate worst case for the N=3 memory/CPU bet, and it matches the spec's "ignoring HIDDEN costs battery until eviction." Do **not** use `display:none`/`visibility:hidden` (both would throttle the hidden channels and flatter the measurement).
- **Gestures:** iframes swallow touch events, so the shell cannot see swipes over a channel. The spike uses a 56px right-edge gesture strip (`#flip-strip`) for touch flips; the channel below it stays fully interactive elsewhere. This is a spike affordance — the real set does native gesture arbitration in A1.
- Config is posted on the iframe's `load` event: clients register their message listener in module scripts, which execute before `load` fires, so the listener is always up.

- [ ] **Step 1: Build the five channel dist-spike bundles**

Vite dists default to `base: '/'`, whose absolute `/assets/...` URLs break under `/channels/<id>/` — so each channel is rebuilt with `--base`. Output goes to `dist-spike/`, never `dist/` (the deploy flow owns `dist/`). reef gets its RPC endpoint baked (it has no `SWIMCHAIN_RPC_CONFIG` handling — spec §2.5); the spike proxy makes that endpoint same-origin so the node's missing CORS doesn't matter.

```powershell
# from the worktree root; install once per client (~minutes, one-time)
# package-lock.json is gitignored REPO-WIDE (root .gitignore), so `npm ci` has no
# lockfile and hard-errors with EUSAGE — use npm install. wiki-client is pnpm-managed
# (tracked pnpm-lock.yaml); prefer pnpm there to match its locked tree, npm install
# is an acceptable spike fallback if pnpm is unavailable.
# if any install hangs on puppeteer: $env:PUPPETEER_SKIP_DOWNLOAD='1'
cd feed-client;  npm install; npx vite build --base=/channels/feed/  --outDir dist-spike; cd ..
cd forum-client; npm install; npx vite build --base=/channels/forum/ --outDir dist-spike; cd ..
cd wiki-client;  npx pnpm install --frozen-lockfile; npx vite build --base=/channels/wiki/ --outDir dist-spike; cd ..
cd chat-client;  npm install; npx vite build --base=/channels/chat/  --outDir dist-spike; cd ..
cd reef-client;  npm install
$env:VITE_RPC_ENDPOINT = 'http://localhost:8080/rpc'
npx vite build --base=/channels/reef/ --outDir dist-spike
Remove-Item Env:VITE_RPC_ENDPOINT
cd ..
```

**reef rebuild trap:** `reef-client/.env.production:6` pins `VITE_RPC_ENDPOINT=https://swimchain.io/rpc` — the mainnet gateway. The command above wins only because process env outranks `.env` files in Vite; **any later reef rebuild in a fresh shell without re-setting `$env:VITE_RPC_ENDPOINT` silently bakes the production gateway**, reef bypasses the spike proxy, and the game-channel measurements (S3–S5) are invalid. Run the grep-verify below after **every** reef rebuild, not just the first.

Note: `npx vite build` skips each package's `tsc -b` typecheck step — fine for the spike (esbuild still transpiles TS). If a client's `vite.config.ts` hardcodes `outDir`, the CLI flag wins; verify each `dist-spike/index.html` exists and its asset URLs start with `/channels/<id>/` (grep-verify the baked values — operator rule: never trust an unverified bundle):

```powershell
Select-String -Path *-client\dist-spike\index.html -Pattern '/channels/' | Select-Object -First 10
Select-String -Path reef-client\dist-spike\assets\*.js -Pattern 'localhost:8080/rpc' -List
```

- [ ] **Step 2: Append to root `.gitignore`**

```
*-client/dist-spike/
```

- [ ] **Step 3: Write `surf-app/spike/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SURF — A0 spike</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }

  /* deck: all warm channels full-screen, stacked; current raised by z-index */
  #deck { position: absolute; inset: 0; }
  iframe.channel { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }

  /* honest static: one canvas (spec §8), above the deck during seams */
  #static { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 5000;
            opacity: 0; transition: opacity 80ms linear; pointer-events: none;
            image-rendering: pixelated; }

  /* SIGNAL LOST: bleached test card, above static */
  #signal-lost { position: absolute; inset: 0; z-index: 5500; display: flex;
                 flex-direction: column; align-items: center; justify-content: center; gap: 16px;
                 background: repeating-linear-gradient(90deg,
                   #9aa89b 0 14.2%, #a8a173 14.2% 28.4%, #7d9c8e 28.4% 42.6%, #7f8f6f 42.6% 56.8%,
                   #9d7f88 56.8% 71%, #8d7a92 71% 85.2%, #6f7f8c 85.2% 100%); }
  #signal-lost .sl-card { background: rgba(0,0,0,.82); color: #cfe; padding: 24px 32px;
                          font: bold 18px/1.6 monospace; text-align: center; }
  #signal-lost button { font: bold 16px monospace; padding: 10px 26px; background: #041;
                        color: #9fb; border: 2px solid #9fb; }

  /* OSD: fat tuner type burned over the live picture, slightly refracted */
  #osd { position: absolute; top: 6%; left: 6%; z-index: 6000; pointer-events: none;
         font: 900 11vw/1 monospace; letter-spacing: .04em; color: #efe;
         text-shadow: 2px 0 rgba(255,60,60,.55), -2px 0 rgba(60,120,255,.55), 0 0 18px rgba(180,255,200,.5);
         opacity: 0; }
  #osd.burn { animation: burn 1.6s ease-out; }
  @keyframes burn { 0% {opacity:0} 8% {opacity:1} 62% {opacity:1} 100% {opacity:0} }

  /* touch flip strip: right edge; the rest of the screen belongs to the channel */
  #flip-strip { position: absolute; top: 0; right: 0; width: 56px; height: 100%; z-index: 6500;
                background: linear-gradient(270deg, rgba(120,255,180,.06), transparent);
                touch-action: none; }

  /* power-on: phosphor bloom ~700ms (spec §3.1) */
  #bloom { position: absolute; inset: 0; z-index: 7000; background: #000; pointer-events: none; }
  #bloom .dot { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px;
                border-radius: 50%; background: #8f8;
                box-shadow: 0 0 24px 10px #6f6, 0 0 90px 40px rgba(90,255,120,.5); }
  #bloom.blooming { animation: bloom-bg 700ms ease-out forwards; }
  #bloom.blooming .dot { animation: bloom-dot 700ms cubic-bezier(.2,.7,.3,1) forwards; }
  @keyframes bloom-dot { 0% {transform: scale(1)} 55% {transform: scale(28)} 100% {transform: scale(400); opacity: 0} }
  @keyframes bloom-bg  { 0% {opacity:1} 80% {opacity:1} 100% {opacity:0} }

  /* power-off: CRT collapse → lantern point, "Still broadcasting." (spec §3.7) */
  #off-screen { position: absolute; inset: 0; z-index: 8000; background: #000; }
  #off-screen .crt { position: absolute; inset: 0; background: #fff; opacity: 0; }
  #off-screen.collapsing .crt { animation: crt-off 320ms ease-in forwards; }
  @keyframes crt-off {
    0%   { opacity: 1; transform: scale(1, 1); }
    45%  { opacity: 1; transform: scale(1, .006); }
    80%  { opacity: 1; transform: scale(.01, .006); }
    100% { opacity: 0; transform: scale(.002, .002); }
  }
  #off-screen .lantern { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px;
                         border-radius: 50%; background: #af8;
                         box-shadow: 0 0 14px 4px rgba(140,255,150,.7); animation: lantern 3.2s ease-in-out infinite; }
  @keyframes lantern { 0%,100% {opacity:.75} 50% {opacity:1} }
  #off-screen .caption { position: absolute; left: 0; right: 0; top: 58%; text-align: center;
                         color: #575; font: 14px monospace; }

  /* HUD (instrumentation readout) */
  #hud { position: absolute; left: 8px; bottom: 8px; z-index: 9000; background: rgba(0,0,0,.75);
         color: #8f8; font: 11px/1.5 monospace; padding: 8px 10px; white-space: pre;
         max-width: 92vw; overflow: hidden; pointer-events: none; }
  #hud-toggle { position: absolute; left: 0; bottom: 0; width: 44px; height: 44px; z-index: 9001;
                opacity: 0; }
  #export-btn { position: absolute; right: 0; bottom: 0; width: 44px; height: 44px; z-index: 9001;
                opacity: 0; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
  <div id="deck"></div>
  <canvas id="static"></canvas>
  <div id="signal-lost" hidden>
    <div class="sl-card">
      <div class="sl-name">CH —</div>
      <div>SIGNAL LOST</div>
      <button id="retune">RETUNE</button>
    </div>
  </div>
  <div id="osd"></div>
  <div id="flip-strip"></div>
  <div id="bloom" hidden><div class="dot"></div></div>
  <div id="off-screen" hidden>
    <div class="crt"></div>
    <div class="lantern"></div>
    <div class="caption">Still broadcasting.</div>
  </div>
  <pre id="hud" hidden></pre>
  <button id="hud-toggle" aria-label="toggle HUD"></button>
  <button id="export-btn" aria-label="export results"></button>
  <script type="module" src="/shell.mjs"></script>
</body>
</html>
```

- [ ] **Step 4: Write `surf-app/spike/shell.mjs`**

Until Tasks 5–6 land, create `surf-app/spike/stubs.mjs` with inert stand-ins and import from it; when Tasks 5–6 are done, switch the two import lines to `./static-shader.mjs` and `./measure.mjs` and delete `stubs.mjs`.

```js
// stubs.mjs — TEMPORARY (deleted when Tasks 5-6 land)
export function createStatic() {
  return { start() {}, stop() {}, show() {}, hide() {} };
}
export function createFlipTimer() {
  return { start() {}, end() { return null; }, abort() {}, stats() { return null; }, all: () => [] };
}
export function attachFrameProbes() {}
export function createHud() {
  return {
    sink: { channel: () => ({}), dropChannel() {}, entries: () => [] },
    drift: { max: () => 0, reset() {} },
    toggle() {}, note() {},
  };
}
export function exportResults() {}
```

```js
// shell.mjs — the set: power, flip, mount/evict, OSD, SIGNAL LOST.
import { Deck } from './deck.mjs';
import { buildConfigMessage, watchReadiness } from './handover.mjs';
import { createStatic } from './stubs.mjs';   // Task 5: change to './static-shader.mjs'
import { createFlipTimer, attachFrameProbes, createHud, exportResults } from './stubs.mjs'; // Task 6: './measure.mjs'

const cfg = await (await fetch('/spike-config.json')).json();
const byId = new Map(cfg.channels.map((c) => [c.id, c]));
const deck = new Deck(cfg.channels.map((c) => c.id), cfg.warmSize);

const deckEl = document.getElementById('deck');
const staticCtl = createStatic(document.getElementById('static'));
const timer = createFlipTimer();
const hud = createHud(document.getElementById('hud'), timer);

const frames = new Map();  // id -> iframe
const painted = new Set(); // ids whose first paint actually landed (gate READY)
let z = 1;                 // monotonic; the current channel is raised on lock
let gate = null;           // readiness gate of the in-flight tune
let powered = false;
let lastFlipAt = 0;        // input throttle

const rpcConfig = buildConfigMessage({
  rpcEndpoint: `${location.origin}/rpc`,
  rpcAuth: cfg.rpcAuth,
  nodeAddress: cfg.nodeAddress,
});

function mount(id) {
  const f = document.createElement('iframe');
  f.className = 'channel';
  f.setAttribute('allow', ''); // no camera/mic/geo (spec §2.2)
  f.src = `/channels/${id}/`;
  // Clients register their message listener in module scripts, which run
  // before `load` fires — so posting on load is never too early.
  f.addEventListener('load', () => {
    f.contentWindow.postMessage(rpcConfig, location.origin); // exact origin, never '*'
    attachFrameProbes(id, f, hud.sink);
    // Shell keys must survive focus moving into a channel: key events go to
    // the focused document, so register on each frame's window too
    // (same-origin makes this legal — attachFrameProbes already relies on it).
    try { f.contentWindow.addEventListener('keydown', onKey); } catch { /* frame gone */ }
  });
  deckEl.appendChild(f);
  frames.set(id, f);
  return f;
}

function unmount(id) { // plain DOM removal — works even if the frame is wedged (spec §6)
  frames.get(id)?.remove();
  frames.delete(id);
  painted.delete(id);
  hud.sink.dropChannel(id);
}

function advisory(id, type) {
  frames.get(id)?.contentWindow?.postMessage({ type }, location.origin);
}

// Tune `target` (already applied to the deck): static up, mount if cold,
// settle via the readiness gate. Every path out of here hides the static
// only at READY, or lands on SIGNAL LOST — never a blank frame.
// Flip kind is PAINT state, not deck state: a mount whose gate was cancelled
// by flip-away is still cold on the return flip (deck says warm, but #root
// may be unpainted — classifying it warm would poison G3's warm median).
// kindOverride='power' keeps power-on reveals out of the warm/cold buckets.
function settle(target, tuneResult, from, kindOverride = null) {
  const cold = tuneResult.mounted.includes(target) || !painted.has(target);
  timer.start(target, kindOverride ?? (cold ? 'cold' : 'warm'));
  staticCtl.show();
  document.getElementById('signal-lost').hidden = true;
  for (const id of tuneResult.evicted) unmount(id);
  const frame = frames.get(target) ?? mount(target);
  gate = watchReadiness(frame, {
    timeoutMs: 2000,
    onReady: (via) => {
      const rec = timer.end(via);
      painted.add(target);
      frame.style.zIndex = ++z;      // occlude the others; do NOT hide them
      staticCtl.hide();              // seam rule: static persists exactly until READY
      if (from && from !== target) advisory(from, 'SWIMCHAIN_CHANNEL_HIDDEN');
      advisory(target, 'SWIMCHAIN_CHANNEL_VISIBLE');
      showOsd(byId.get(target), rec);
    },
    onTimeout: () => {
      timer.abort();
      staticCtl.hide();
      showSignalLost(byId.get(target));
    },
  });
}

function flip(dir) {
  if (!powered) return;
  const now = performance.now();
  if (now - lastFlipAt < 250) return; // input throttle, not a seam timer
  lastFlipAt = now;
  const from = deck.current;
  gate?.cancel(); // flip-away during a cold mount
  const r = dir > 0 ? deck.next() : deck.prev();
  settle(r.current, r, from);
}

function showOsd(ch, rec) {
  const osd = document.getElementById('osd');
  osd.textContent = `CH ${ch.number} ${ch.name}`;
  osd.classList.remove('burn'); void osd.offsetWidth; osd.classList.add('burn');
  if (rec) hud.note(`flip ${rec.kind} ${Math.round(rec.ms)}ms via ${rec.via}`);
}

function showSignalLost(ch) {
  const el = document.getElementById('signal-lost');
  el.querySelector('.sl-name').textContent = `CH ${ch.number} ${ch.name}`;
  el.hidden = false;
}

document.getElementById('retune').addEventListener('click', () => {
  const id = deck.current;
  unmount(id); // fresh mount on retune
  settle(id, { mounted: [id], evicted: [] }, null);
});

// --- power (spec §3.1 / §3.7) ---
function powerOn() {
  powered = true;
  document.getElementById('off-screen').hidden = true;
  const bloom = document.getElementById('bloom');
  bloom.hidden = false;
  bloom.classList.remove('blooming'); void bloom.offsetWidth; bloom.classList.add('blooming');
  setTimeout(() => { bloom.hidden = true; }, 750);
  staticCtl.start();
  const target = deck.current ?? cfg.channels[0].id;
  const r = deck.tune(target);
  settle(target, r, null, 'power'); // power-on reveal: excluded from G3's warm/cold stats
}

function powerOff() {
  powered = false;
  gate?.cancel();
  staticCtl.stop();
  const off = document.getElementById('off-screen');
  off.hidden = false;
  off.classList.remove('collapsing'); void off.offsetWidth; off.classList.add('collapsing');
  // Frames stay mounted: the node keeps running. "Still broadcasting." is true.
}

// --- input ---
// One named handler, registered on the shell window AND (in mount()) on every
// frame's window — key events dispatch to the focused document, and the shell
// is fully covered by iframes, so window-only registration goes dead after
// the first click inside a channel.
function onKey(e) {
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // don't steal typing
  if (e.key === 'ArrowDown') flip(+1);
  else if (e.key === 'ArrowUp') flip(-1);
  else if (e.key === 'p') (powered ? powerOff : powerOn)();
  else if (e.key === 'm') hud.toggle();
  else if (e.key === 'r') hud.drift.reset();
  else if (e.key === 'e') exportResults(timer, hud);
}
window.addEventListener('keydown', onKey);
document.getElementById('export-btn').addEventListener('click', () => exportResults(timer, hud));

const strip = document.getElementById('flip-strip');
let touchY = null;
strip.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
strip.addEventListener('touchend', (e) => {
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  touchY = null;
  if (Math.abs(dy) > 60) flip(dy < 0 ? +1 : -1); // swipe up = next (descend the dial)
});
strip.addEventListener('wheel', (e) => { e.preventDefault(); flip(e.deltaY > 0 ? +1 : -1); }, { passive: false });

document.getElementById('off-screen').addEventListener('click', () => { if (!powered) powerOn(); });
document.getElementById('hud-toggle').addEventListener('click', () => hud.toggle());

powerOn();
```

- [ ] **Step 5: Run the page and verify against the checklist**

Node + server running (Task 1 Step 7), then open `http://localhost:8080` in desktop Chrome. Verify each item by doing it:

1. Power-on bloom plays (~700ms), then the FEED channel appears with real posts from the dev node (regtest may be sparse — any rendered client UI counts, but confirm at least one RPC succeeds in DevTools Network: `POST /rpc` → 200 with a `result`).
2. Console shows each channel's `[ParentConfig] Received RPC config from parent` (clients log it in dev builds; if absent in prod builds, verify instead via DevTools that channel fetches go to `localhost:8080/rpc`).
3. ArrowDown flips FEED → FORUM: the previous picture holds until FORUM's first paint, then the `CH 3 FORUM` OSD burn. No blank frame at any point. (`createStatic` is still the stub here, so no static is visible yet — the static seam itself is verified at Task 5 Step 6; do not tick a static assertion at this task.)
4. Flip through all five channels; on the 4th distinct channel, the LRU eviction removes the oldest iframe (verify in DevTools Elements: never more than 3 `iframe.channel` nodes).
5. Flip back to a warm channel: near-instant reveal (timing numbers arrive with Task 6; static behavior with Task 5).
6. REEF plays (its canvas animates). Flip away; in DevTools confirm the reef iframe is still in the DOM (occluded, not display:none) — this is the worst-case condition the measurement depends on.
7. Click **inside** a channel (scroll the feed), then press ArrowDown — the flip still fires. Shell keys must survive channel focus (they are registered on each frame's window too); if this fails, the Android session's controls die on first touch.
8. `p` powers off: CRT collapse → lantern point + "Still broadcasting." Tap powers back on to the same channel, warm.
9. Kill the dev node; flip to a cold channel → the channel **still paints its own loading/error UI** and reveals at READY. A dead node is an in-channel condition, **not** signal loss — every client commits fallback DOM into `#root` before any RPC resolves, so the dom-peek gate settles correctly (the honest dead-node visual is Task 5's sparse static, verified there). Restart the node. **Do not "fix" the readiness gate to wait for RPC** — that would break the seam rule and add an RPC round-trip to every flip-to-paint sample.
10. Force the real SIGNAL LOST path: rename one channel's dist (`Rename-Item wiki-client\dist-spike dist-spike.off`), flip cold to WIKI → its bundle 404s, `#root` never populates, and after 2s the SIGNAL LOST card with RETUNE appears — never a blank frame. Rename the directory back; RETUNE recovers the channel. (This is deterministic and keeps the spike server alive so RETUNE has something to recover against.)
11. `node --test "surf-app/spike/*.test.mjs"` still passes.

- [ ] **Step 6: Commit**

```bash
git add surf-app/spike/index.html surf-app/spike/shell.mjs surf-app/spike/stubs.mjs .gitignore
git commit -m "feat(surf): A0 shell - power-on/off, flip with seam rule, OSD, SIGNAL LOST, LRU deck wiring"
```

---

### Task 5: Honest-static shader

**Files:**
- Create: `surf-app/spike/static-shader.mjs`
- Create: `surf-app/spike/static-shader.test.mjs`
- Modify: `surf-app/spike/shell.mjs` (one import line: `./stubs.mjs` → `./static-shader.mjs` for `createStatic`)

**Interfaces:**
- Consumes: `POST /rpc` (Task 1), the `#static` canvas (Task 4).
- Produces (Task 4's shell already calls): `createStatic(canvas, {pollMs?}) -> { start(), stop(), show(), hide() }`. Also exports pure `mapStats(syncStatus) -> { density, drift, ghost }` and `rpcCall(method, params)` (Task 6's HUD may reuse it).

**Design notes:** every visual parameter is a real node number, nothing is faked (§3.2): fleck density ← `peer_count`, drift ← `mempool_actions`, ghost glyphs ← `tip_hash` — all from one `get_sync_status` call (verified: `src/rpc/types.rs:154-178`; reconcile with the field names actually recorded in Task 1 Step 7). One canvas at 30fps (§8); rendering runs at quarter resolution for period-correct chunk and cheap fills. When the node is unreachable, `mapStats(null)` produces sparse, driftless, ghostless static — the dead-sea look, and honestly so.

- [ ] **Step 1: Write the failing tests** (`surf-app/spike/static-shader.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStats } from './static-shader.mjs';

test('no data -> sparse dead-sea static', () => {
  assert.deepEqual(mapStats(null), { density: 0.05, drift: 0, ghost: '' });
});

test('peers raise density, clamped at 0.35', () => {
  assert.equal(mapStats({ peer_count: 2 }).density, 0.05 + 2 * 0.03);
  assert.equal(mapStats({ peer_count: 500 }).density, 0.35);
});

test('mempool drives drift, clamped at 3 px/frame', () => {
  assert.equal(mapStats({ mempool_actions: 4 }).drift, 1);
  assert.equal(mapStats({ mempool_actions: 999 }).drift, 3);
});

test('ghost is the first 16 chars of the tip hash', () => {
  assert.equal(mapStats({ tip_hash: 'abcdef0123456789ff' }).ghost, 'abcdef0123456789');
  assert.equal(mapStats({ tip_hash: null }).ghost, '');
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test "surf-app/spike/*.test.mjs"`
Expected: FAIL — `Cannot find module ... static-shader.mjs`.

- [ ] **Step 3: Write `surf-app/spike/static-shader.mjs`**

```js
// Honest static (spec §3.2): ONE canvas, 30fps budget (§8). Every visual
// parameter is a real node number:
//   fleck density <- peer_count       }
//   drift         <- mempool_actions  }  one get_sync_status call
//   ghost glyphs  <- tip_hash         }
// Node unreachable -> mapStats(null): sparse, still, ghostless. Dead sea.

export function mapStats(s) {
  const peers = Number(s?.peer_count ?? 0);
  const mempool = Number(s?.mempool_actions ?? 0);
  return {
    density: Math.min(0.35, 0.05 + peers * 0.03),
    drift: Math.min(3, mempool * 0.25),
    ghost: (s?.tip_hash ?? '').slice(0, 16),
  };
}

export async function rpcCall(method, params = {}) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'rpc error');
  return json.result;
}

export function createStatic(canvas, { pollMs = 2000 } = {}) {
  const ctx = canvas.getContext('2d');
  let params = mapStats(null);
  let running = false, visible = false;
  let raf = 0, poll = 0, last = 0, driftX = 0;

  function resize() { // quarter-ish res: period-correct chunk, cheap fills
    canvas.width = Math.max(120, Math.ceil(window.innerWidth / 3));
    canvas.height = Math.max(80, Math.ceil(window.innerHeight / 3));
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!visible || t - last < 33) return; // 30fps gate; idle when hidden
    last = t;
    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < params.density ? 140 + ((Math.random() * 90) | 0) : 8;
      d[i] = (v * 0.75) | 0; d[i + 1] = v; d[i + 2] = (v * 0.85) | 0; d[i + 3] = 255; // phosphor tint
    }
    ctx.putImageData(img, 0, 0);
    if (params.ghost) {
      driftX = (driftX + params.drift) % w;
      ctx.font = `bold ${Math.round(h / 6)}px monospace`;
      ctx.fillStyle = 'rgba(160,255,190,0.10)';
      ctx.fillText(params.ghost, w - driftX, h * 0.55);
      ctx.fillText(params.ghost, w - driftX - w, h * 0.55); // wrap
    }
  }

  async function tick() {
    try { params = mapStats(await rpcCall('get_sync_status')); }
    catch { params = mapStats(null); }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick(); poll = setInterval(tick, pollMs);
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; clearInterval(poll); cancelAnimationFrame(raf); },
    show() { visible = true; canvas.style.opacity = '1'; },
    hide() { visible = false; canvas.style.opacity = '0'; },
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test "surf-app/spike/*.test.mjs"` — shader tests PASS.

- [ ] **Step 5: Mutation-check the clamps**

Remove the `Math.min(0.35, ...)` clamp: the 500-peer test must FAIL. Restore, PASS. (Density above ~0.35 whites the screen out — the clamp is the difference between "busy sea" and "broken TV".)

- [ ] **Step 6: Switch the shell import and verify live**

In `shell.mjs`, change the `createStatic` import from `./stubs.mjs` to `./static-shader.mjs`. Reload the page:

1. Flips now pass through visible phosphor-tinted static; a ghost of the real tip hash drifts across it (compare against Task 1 Step 7's `tip_hash`).
2. Kill the node: static goes sparse and still within one poll (~2s). Restart: it re-busies. This is the honest-liveness check — the shader must visibly track node state, not decorate.
3. DevTools Performance: with static visible, the shader stays ≤ one frame per 33ms (30fps gate holds).

- [ ] **Step 7: Commit**

```bash
git add surf-app/spike/static-shader.mjs surf-app/spike/static-shader.test.mjs surf-app/spike/shell.mjs
git commit -m "feat(surf): A0 honest static - canvas shader driven by live get_sync_status numbers"
```

---

### Task 6: Instrumentation — flip timing, event-loop health, HUD, export

**Files:**
- Create: `surf-app/spike/measure.mjs`
- Create: `surf-app/spike/measure.test.mjs`
- Modify: `surf-app/spike/shell.mjs` (import line: `./stubs.mjs` → `./measure.mjs`)
- Delete: `surf-app/spike/stubs.mjs`

**Interfaces:**
- Consumes: same-origin iframes (Task 4 passes each mounted frame to `attachFrameProbes`).
- Produces (Task 4's shell already calls):
  - `createFlipTimer(now?) -> { start(to, kind), end(via) -> rec|null, abort(), stats(kind) -> {n, median, p95, max}|null, all() }` — `kind` is `'warm'|'cold'`; `rec` is `{to, kind, via, ms}`.
  - `attachFrameProbes(id, iframe, sink)` — installs, **inside the frame's own realm** (same-origin makes this possible with zero client changes): a rAF heartbeat counter and a `longtask` PerformanceObserver.
  - `createHud(el, timer) -> { sink, drift, toggle(), note(msg) }` — renders every second when visible: uptime, JS heap, max shell-interval drift, warm/cold flip stats, per-channel rAF rate + longtask totals. `drift` is `{ max(): number, reset() }` — **stage-scoped**: G4 reads driftMax over the S5 idle window only, so the shell's `r` key resets it at stage start (a lifetime-cumulative max would be latched forever by the first cold mount and fail G4 unconditionally).
  - `exportResults(timer, hud)` — downloads `surf-spike-results.json` (includes `driftMaxMs`).

**What each metric answers (§5 A0 "measures first"):**
- *flip-to-paint* — warm ≤300ms gate; cold vs the 2s SIGNAL LOST gate.
- *per-frame rAF rate* — proves occluded channels (reef!) are still running, i.e. the deck really is warm, and shows starvation if a channel's loop stalls (the known hash-wasm event-loop trap).
- *longtasks per frame + shell interval drift* — event-loop health of the shared renderer.
- *HUD uptime* — doubles as the renderer-death detector: a background kill reloads the page and resets uptime.
- *JS heap* — in-page trend line; the authoritative PSS number comes from adb in Task 7.

- [ ] **Step 1: Write the failing tests** (`surf-app/spike/measure.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlipTimer } from './measure.mjs';

function clockAt(values) { let i = 0; return () => values[Math.min(i++, values.length - 1)]; }

test('start/end measures elapsed ms and tags kind + via', () => {
  const t = createFlipTimer(clockAt([100, 350]));
  t.start('forum', 'warm');
  assert.deepEqual(t.end('dom-peek'), { to: 'forum', kind: 'warm', via: 'dom-peek', ms: 250 });
});

test('end without start returns null; abort discards the pending flip', () => {
  const t = createFlipTimer(clockAt([0]));
  assert.equal(t.end('x'), null);
  t.start('feed', 'cold');
  t.abort();
  assert.equal(t.end('x'), null);
  assert.deepEqual(t.all(), []);
});

test('stats: median and p95 over one kind only, on UNSORTED arrivals', () => {
  // Durations arrive out of order (300, 100, 200) — real flips do too. A
  // stats() that forgets to sort before taking percentiles must fail here.
  const t = createFlipTimer(clockAt([0, 300, 0, 100, 0, 200, 0, 5000]));
  t.start('a', 'warm'); t.end('v');
  t.start('b', 'warm'); t.end('v');
  t.start('c', 'warm'); t.end('v');
  t.start('d', 'cold'); t.end('v');   // must not pollute warm stats
  const s = t.stats('warm');
  assert.equal(s.n, 3);
  assert.equal(s.median, 200);
  assert.equal(s.p95, 300);
  assert.equal(s.max, 300);
  assert.equal(t.stats('cold').n, 1);
  assert.equal(t.stats('nope'), null);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test "surf-app/spike/*.test.mjs"`
Expected: FAIL — `Cannot find module ... measure.mjs`.

- [ ] **Step 3: Write `surf-app/spike/measure.mjs`**

```js
// Instrumentation for the A0 decision. Everything a page can see:
// flip-to-paint, per-channel event-loop health (observed from INSIDE each
// same-origin frame's realm — no client changes), shell main-thread drift,
// renderer JS heap. The authoritative PSS number comes from adb (Task 7).

export function createFlipTimer(now = () => performance.now()) {
  let pending = null;
  const flips = [];
  const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))];
  return {
    start(to, kind) { pending = { to, kind, t0: now() }; },
    end(via) {
      if (!pending) return null;
      const { to, kind, t0 } = pending;
      pending = null;
      const rec = { to, kind, via, ms: now() - t0 };
      flips.push(rec);
      return rec;
    },
    abort() { pending = null; },
    stats(kind) {
      const xs = flips.filter((f) => f.kind === kind).map((f) => f.ms).sort((a, b) => a - b);
      return xs.length
        ? { n: xs.length, median: pct(xs, 0.5), p95: pct(xs, 0.95), max: xs[xs.length - 1] }
        : null;
    },
    all: () => [...flips],
  };
}

export function createSink() {
  const channels = new Map(); // id -> mutable metrics record
  return {
    channel(id) {
      if (!channels.has(id)) {
        channels.set(id, { rafCount: 0, rafRate: 0, longtasks: 0, longtaskMs: 0 });
      }
      return channels.get(id);
    },
    dropChannel(id) { channels.delete(id); },
    entries: () => [...channels.entries()],
  };
}

// Runs inside the frame's realm via its own window object. Same-origin only.
export function attachFrameProbes(id, iframe, sink) {
  const w = iframe.contentWindow;
  if (!w) return;
  const ch = sink.channel(id);
  const beat = () => { ch.rafCount++; try { w.requestAnimationFrame(beat); } catch { /* frame gone */ } };
  try { w.requestAnimationFrame(beat); } catch { return; }
  let lastCount = 0;
  const rate = setInterval(() => {
    if (!iframe.isConnected) { clearInterval(rate); return; }
    ch.rafRate = ch.rafCount - lastCount;
    lastCount = ch.rafCount;
  }, 1000);
  try {
    new w.PerformanceObserver((list) => {
      for (const e of list.getEntries()) { ch.longtasks++; ch.longtaskMs += e.duration; }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported: rAF rate still stands */ }
}

export function createHud(el, timer) {
  const sink = createSink();
  const notes = [];
  const startedAt = performance.now();
  let driftMax = 0, expected = performance.now() + 500;
  setInterval(() => { // shell main-thread starvation probe
    const t = performance.now();
    driftMax = Math.max(driftMax, t - expected);
    expected = t + 500;
  }, 500);
  setInterval(() => {
    if (el.hidden) return;
    const warm = timer.stats('warm'), cold = timer.stats('cold');
    const fmt = (s) => (s ? `n${s.n} med ${s.median.toFixed(0)} p95 ${s.p95.toFixed(0)} max ${s.max.toFixed(0)}` : '-');
    const heap = globalThis.performance?.memory
      ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + 'MB' : '?';
    el.textContent = [
      `up ${((performance.now() - startedAt) / 60000).toFixed(1)}m  heap ${heap}  driftMax ${driftMax.toFixed(0)}ms`,
      `warm ${fmt(warm)}`,
      `cold ${fmt(cold)}`,
      ...sink.entries().map(([id, c]) =>
        `${id}: raf ${c.rafRate}/s  longtask ${c.longtasks} (${c.longtaskMs.toFixed(0)}ms)`),
      ...notes.slice(-3),
    ].join('\n');
  }, 1000);
  return {
    sink,
    // Stage-scoped drift gauge: G4 reads the max over ONE protocol stage, so
    // the operator resets it at stage start ('r' key). Lifetime-cumulative
    // would be latched by the first cold mount and fail G4 unconditionally.
    drift: {
      max: () => driftMax,
      reset() { driftMax = 0; expected = performance.now() + 500; },
    },
    toggle() { el.hidden = !el.hidden; },
    note(s) { notes.push(s); },
  };
}

export function exportResults(timer, hud) {
  const payload = {
    exportedAt: new Date().toISOString(),
    ua: navigator.userAgent,
    warm: timer.stats('warm'),
    cold: timer.stats('cold'),
    flips: timer.all(),
    channels: Object.fromEntries(hud.sink.entries()),
    driftMaxMs: hud.drift.max(),
    heapMB: globalThis.performance?.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = 'surf-spike-results.json';
  a.click();
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test "surf-app/spike/*.test.mjs"` — measure tests PASS.

- [ ] **Step 5: Mutation-check the stats — both mutations**

1. In `stats`, change the filter to drop the `kind` check (`.filter(() => true)`): the `stats: median and p95 over one kind only, on UNSORTED arrivals` test must FAIL (cold flip polluting warm stats is exactly the bug that would corrupt the A0 verdict). Restore, PASS.
2. In `stats`, delete `.sort((a, b) => a - b)`: the same test must FAIL (on the unsorted array [300, 100, 200] the median index lands on 100 and `max` on 200). Unsorted percentiles are garbage, and G3's warm median — a gate that decides N — is computed by this function. Restore, PASS.

- [ ] **Step 6: Switch shell imports, delete stubs, verify live**

Change the measure import in `shell.mjs` to `./measure.mjs`, delete `stubs.mjs`. Reload:

1. `m` shows the HUD; flip a few times — warm/cold stats accumulate, and each flip drops a `note` line.
2. With REEF warm but occluded, its HUD line shows a nonzero `raf .../s` — the proof the deck is genuinely warm.
3. `e` **and** a tap on the invisible bottom-right corner both download `surf-spike-results.json` with the same numbers, including `driftMaxMs`. The corner button is the only export path on the phone — verify it now, not on the device.
4. Press `r`, then confirm the HUD's `driftMax` drops to ~0 and re-accumulates — the stage-scoped G4 measurement depends on this reset.
5. `node --test "surf-app/spike/*.test.mjs"` — full suite green.

- [ ] **Step 7: Commit**

```bash
git add surf-app/spike/measure.mjs surf-app/spike/measure.test.mjs surf-app/spike/shell.mjs
git rm surf-app/spike/stubs.mjs
git commit -m "feat(surf): A0 instrumentation - flip-to-paint, per-frame rAF/longtask probes, HUD, export"
```

---

### Task 7: The measurement — Android protocol, RESULTS.md, decide N

This task is the point of A0. Everything before it exists so these numbers can be read off a real phone.

**Files:**
- Create: `surf-app/spike/meminfo-sampler.ps1`
- Create: `surf-app/spike/README.md`
- Create: `surf-app/spike/RESULTS.md`

**Interfaces:**
- Consumes: the complete spike (Tasks 1–6), a USB-debuggable Android phone (use the phone that sideloads the v0.1.7 APKs; record its model, Android version, and RAM in RESULTS.md), `adb` on PATH, dev node + spike server running on the PC.
- Produces: `RESULTS.md` — the A0 verdict: **N=3 or N=2, with numbers**. This feeds §8's memory gate ("under the A0-measured ceiling") and A1's deck sizing.

**Proxy honesty (record this caveat verbatim in RESULTS.md):** the spike measures Chrome-for-Android, not the Android System WebView an APK will embed. Same Blink/V8 engine, same single-renderer condition for same-site frames — but process-kill priorities differ, and the difference is **one-sided**: a backgrounded Chrome tab's renderer is more kill-exposed than a foreground app's WebView renderer, **and strictly more kill-exposed than the backgrounded Surf APK's too** — the spec's `NodeForegroundService` (§2.1/§3.7) holds the app process at foreground-service priority, and WebView's default renderer-priority policy (`RENDERER_PRIORITY_IMPORTANT`, not waived when invisible) binds the renderer to it, while a home-buttoned Chrome and its renderer drop to the cached band. Therefore: **a G2 pass transfers to the APK; a G2 fail may be a Chrome-only artifact** and never by itself decides N (see the decision rule). This is inference from documented Android/Chromium behavior, not measurement — it gets re-verified on the real WebView in A1, and RESULTS.md must say so.

- [ ] **Step 1: Write `surf-app/spike/meminfo-sampler.ps1`**

```powershell
# Samples per-process PSS for Chrome on a USB-connected Android device.
# Usage: .\meminfo-sampler.ps1                     # defaults below
#        .\meminfo-sampler.ps1 -IntervalSec 60 -OutCsv soak.csv
param(
  [string]$Package = 'com.android.chrome',
  [int]$IntervalSec = 30,
  [string]$OutCsv = 'meminfo.csv'
)
"timestamp,process,pss_kb" | Out-File -Encoding utf8 $OutCsv
while ($true) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $lines = adb shell ps -A -o PID,NAME | Select-String $Package
  foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split '\s+')
    $procPid = $parts[0]; $name = $parts[1]
    $mem = adb shell dumpsys meminfo $procPid
    $totalLine = $mem | Select-String 'TOTAL PSS:'
    if (-not $totalLine) { $totalLine = $mem | Select-String '^\s+TOTAL\s+\d+' } # older format
    if ($totalLine -and $totalLine.ToString() -match '(\d+)') {
      "$ts,$name,$($Matches[1])" | Add-Content $OutCsv
      Write-Host "$ts  $name  $([math]::Round([int]$Matches[1]/1024,1)) MB"
    }
  }
  Start-Sleep -Seconds $IntervalSec
}
```

Verify one sample manually before trusting the soak: run `adb shell dumpsys meminfo <renderer pid>` yourself and check the sampler's number matches the `TOTAL PSS` line (dumpsys output format varies by Android version — if the regex grabs the wrong figure, fix the regex before running the protocol, and note the Android version in RESULTS.md).

- [ ] **Step 2: Device + connection setup**

```powershell
adb devices                          # phone listed, authorized
adb reverse tcp:8080 tcp:8080        # phone's localhost:8080 -> PC's spike server
adb shell am force-stop com.android.chrome   # fresh Chrome, no stray renderers
```

Server bound to `127.0.0.1` + `adb reverse` means nothing is exposed on the LAN and the phone sees the spike at a `http://localhost:8080` origin — which the clients' origin allowlist accepts. Open Chrome on the phone → `http://localhost:8080` → the set powers on. Close every other tab (each extra tab is another renderer polluting the measurement).

- [ ] **Step 3: Confirm the single-renderer condition**

```powershell
adb shell ps -A -o PID,NAME | Select-String sandboxed
```

Expected: **one** `com.android.chrome:sandboxed_process...` entry (all channels are same-site, so even Android's partial site isolation keeps them in one renderer — the WebView-equivalent condition). If more than one appears, close other tabs / check for a second window; if it persists, record all renderer PIDs and sum them in Step 4, noting that the sum slightly overstates a single-renderer deck (duplicated V8 overhead) — still a valid upper bound for the gates.

- [ ] **Step 4: Run the scenario script, sampling throughout**

Start `.\meminfo-sampler.ps1` in a second terminal and leave it running. Then, on the phone, with timestamps noted at each stage boundary:

| Stage | Do | Record |
|---|---|---|
| S1 baseline | power-on lands on FEED; let it settle 2 min | PSS @ 1 warm channel |
| S2 | flip to FORUM; settle 2 min | PSS @ 2 warm |
| S3 | flip to REEF; **play it** 3 min (board animating) | PSS @ 3 warm incl. game |
| S4 flip soak | 15 min of realistic flipping across all 5 channels (LRU evictions included), scrolling feed, opening a thread, playing reef. **Include ≥25 direction-reversal flips inside the current warm trio** (bounce between the last two channels) — monotone dial cycling at warmSize 3 over 5 channels *always* lands on the just-evicted channel, i.e. every monotone flip is cold, and G3 needs ≥20 warm samples | PSS trend; HUD warm/cold stats; any "Aw, Snap"/reload |
| S5 idle | **tap-reset the drift gauge first** (`r` via a paired Bluetooth keyboard, or `adb shell input text r` from the PC — the drift number for G4 is the S5 window only), then sit on FEED 5 min, REEF warm underneath | HUD: reef `raf/s` > 0 while occluded; driftMax over S5 only |
| **S5-export** | **before backgrounding anything:** tap the invisible bottom-right corner → `surf-spike-results.json` lands in Downloads; `adb pull /sdcard/Download/surf-spike-results.json`. Also photograph/screenshot the HUD. All metrics live in renderer memory — if S6 kills the renderer, everything S1–S5 measured is gone; this export is the record | the JSON + HUD capture |
| S6 background soak | home button; screen on; leave Chrome backgrounded **60 min** (sampler keeps logging) | renderer alive? PSS under pressure |
| S7 return | reopen Chrome | did the page survive (HUD uptime continuous) or reload (uptime reset)? |

If the page survived S7, export once more (bottom-right corner tap) for the post-soak numbers; if it reloaded, the S5-export is the dataset and S7 records the death.

- [ ] **Step 5: Write RESULTS.md against the gates**

`RESULTS.md` structure (fill every cell with a number or a dated observation — no blank verdicts):

```markdown
# Surf A0 — measurement results (YYYY-MM-DD)

Device: <model>, Android <version>, <RAM> GB. Chrome <version>.
Node: <mode, height, peer count during run>. Single renderer confirmed: <yes/no (pids)>.

## Gates (warmSize=3, lineup feed+forum+wiki+chat+reef, warm incl. REEF)

| Gate | Pass condition | Measured | Verdict |
|---|---|---|---|
| G1 foreground survival | S4: 15-min flip soak, zero renderer deaths | | |
| G2 background survival | S6/S7: 60-min background, no reload on return | | |
| G3 warm flip | median <= 300ms over >= 20 warm flips (p95 recorded) | | |
| G4 event-loop health | S5: occluded REEF raf/s > 0 AND shell driftMax < 250ms **measured over the S5 idle window only (drift gauge reset at S5 start)** | | |

## Numbers

- PSS @ 1 / 2 / 3 warm: ___ / ___ / ___ MB (steady-state)
- PSS peak during S4: ___ MB; trend during S6: ___
- Warm flips: n=___, median=___ms, p95=___ms. Cold: median=___ms vs 2s gate.
- Longtasks per channel over S4: ___

## Verdict

**N = ___.** <One paragraph: which gates carried the decision.>
R3 ceiling for §8: ___ MB (or R2 = ___ MB if N=2).

## Caveats

<The Chrome-vs-WebView proxy paragraph from the plan, verbatim, plus anything observed.>
```

**Decision rule (fixed in advance so the verdict can't be argued into shape after the fact):**
- **N=3** iff G1–G4 all pass.
- **G2-only exception:** if G2 alone fails (G1/G3/G4 pass), record **N=3 provisional, G2 deferred** — the proxy-honesty caveat above makes a G2 fail potentially a Chrome-only artifact (backgrounded Chrome sits in the cached kill band; the APK's `NodeForegroundService` does not). Re-run S6/S7 on the real WebView in A1 and let *that* result bind. Do **not** set warmSize 2 on a G2-only failure.
- Any of G1/G3/G4 fails → set `warmSize: 2` in `channels.json`, re-run S1→S7, and record the same table for N=2. **N=2** iff its G1/G3/G4 pass (G2 treated the same way as above).
- The "single-renderer deck assumption is broken" verdict requires a **G1 failure at warmSize 2** — never G2 alone. If that happens, stop and take the numbers to the operator (the spec has no N=1 fallback; that's a §2.2 design conversation, not an implementer's call).

- [ ] **Step 6: Write `surf-app/spike/README.md`**

Contents, in order (pull the exact commands from the tasks above): what the spike is (one paragraph + pointer to the spec §5 A0); prerequisites (Node 20+, a dev node, adb); the run book (start node → note cookie path → build dist-spikes → start server → open page; controls list); the Android measurement protocol (Steps 2–5 condensed, with the sampler usage); the decision rule and a pointer to RESULTS.md; a warning that regtest is the default target and pointing the spike at a mainnet node means channel UIs can post real actions under the node identity — read-only flipping is fine, but don't type into forms during a mainnet-pointed run.

- [ ] **Step 7: Commit**

```bash
git add surf-app/spike/meminfo-sampler.ps1 surf-app/spike/README.md surf-app/spike/RESULTS.md
git commit -m "feat(surf): A0 measurement protocol + results - the N=3 vs N=2 verdict"
```

---

## What A0 explicitly does not do

Scope fences so no task drifts into later phases (§4, §5): no APK/Tauri/`surf-app` scaffold beyond `spike/`; no `NodeHost`; no client source changes (the §2.4 config-handover hardening is Phase C — the spike's same-origin serving sidesteps, not fixes, the prefix-allowlist weakness); no dial, no registry, no capability tokens; no dwell-engage or flare (Phase B — nothing in the spike calls `submit_engagement`); no `get_space_health` RPC; no Chart, no Interference, no Night Swim; no sourcemap/size CI gates (those bite when something is baked into an APK).

## Execution notes

- Tasks 1→7 in order; 2 and 3 can run in parallel after 1; 5 and 6 can run in parallel after 4.
- Every task ends with `node --test "surf-app/spike/*.test.mjs"` green plus its own verification step. No task claims completion on code alone — Tasks 4–7 have eyes-on-the-page or eyes-on-the-phone checks.
- Full suite runtime is seconds; run it before every commit.
