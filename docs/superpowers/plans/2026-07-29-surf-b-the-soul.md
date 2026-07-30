# Surf B — The Soul: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the set know its channels are alive: the `get_space_health` RPC (minimal-honest), dwell-engage (watching is feeding, for real), Dead Air + the flare, the Chart with health glow and mooring, and health-driven bootstrap — per spec §5 B and the ruled decision sheet.

**Architecture:** One small node-side RPC derived from the already-synced chain (no new consensus, no new indexes — a cached scan in the proven `list_spaces` pattern). Everything else is shell policy: a pre-bundled Argon2id worker (reef's CSP-proven pattern) mines minimum-difficulty engages that the node identity signs via loopback `sign_message`; dead-air and Chart glow read the new RPC; every threshold is client policy per the fold-rules law.

**Tech Stack:** Rust (one RPC + tests), vanilla ESM shell modules + node:test, esbuild one-shot worker bundle, existing clients untouched.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-b-soul`. Check PR state before first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` §3.3, §3.4, §5 B. **Rulings:** `docs/superpowers/specs/2026-07-29-surf-b-decision-sheet.md` (B1–B6, all ruled). A1 shipped as #231.

## Verified facts this plan builds on (recon 2026-07-29, file:line checked)

| Fact | Where |
|---|---|
| `sign_message` RPC: params `{message: <hex>}`, signs with the node identity key, returns `{signature, public_key}`; AUTH REQUIRED (deliberately not exempt — signing oracle rationale) | `src/rpc/methods.rs:8496-8537`, `src/rpc/server.rs:460-501` |
| Engage PoW challenge = 82 bytes: `[0]=action_type(Engage=0x04) | [1..33)=RAW 32-byte content hash (NOT re-hashed) | [33..65)=author pubkey | [65..73)=timestamp u64 BE | [73]=difficulty | [74..82)=nonce_space`; hash input = challenge ‖ nonce u64 BE (90 bytes); Argon2id salt = nonce_space | `src/crypto/action_pow.rs:136-145,400-404`, `src/rpc/methods.rs:357-460,3884-3899` |
| **Mainnet minimum difficulty for Engage = 6 bits** (base 16 − 10, floor 4); leading zeros counted in BITS | `src/crypto/action_pow.rs:91-106,340-350`, `src/network/mode.rs:274-296` |
| **Mainnet Argon2id params = 8 MiB / 1 iter / 2 lanes** (operator decision 2026-07-22) | `src/crypto/action_pow.rs:264-274` |
| **TRAP:** client-side `DIFFICULTY` tables say Engage 16 for mainnet (1000× over-mine) and client `PRODUCTION_CONFIG` says 64 MiB/3/4 (→ unrecoverable hash mismatch vs the node). The shell must use 6 bits + 8 MiB/1/2 and NEVER import the stale client tables | `feed-client/src/lib/action-pow.ts:32,59-63` vs node truth above |
| Engage signature (separate from PoW): Ed25519 over UTF-8 `engage:{content_id}:{pow_nonce}:{timestamp}` (+`:{emoji}` if present), verified against `author_id`; `submit_engagement` is NOT auth-exempt (shell's cookie covers it) | `src/rpc/methods.rs:3916-3937`, `server.rs:468-501` |
| Working engage specimens: `tools/swim-bot/activity-bot.mjs:66-144` (node-signed, correct preimage), forum-client's Worker miner (`forum-client/src/lib/action-pow.ts:47-50`, `action-pow-worker.ts:98-184`); reef's per-call worker via `new Worker(new URL(...), {type:'module'})` survives strict CSP because Vite emits a same-origin chunk | recon report |
| `computePow` shared impl lives in `swimchain-react` (used by reef's worker) | `reef-client/src/lib/pow.worker.ts:16-30` |
| Per-space engagement recency is chain-derivable; precedent loop folds engage timestamps into `SpaceSummary.last_activity` | `src/rpc/methods.rs:5690-5709` |
| `list_spaces`: auth-exempt, 3s-TTL cache (`SPACE_LIST_TTL`), sorted `last_activity` desc, `class` field | `src/rpc/methods.rs:5524-5570,5868`, `src/rpc/types.rs:747-791` |
| No engagement rate limit node-side; `submit_engagement` is `MethodCategory::Write` (120/min bucket) | `src/rpc/rate_limiter.rs:70,112` |
| `space_health` module's score inputs are half-stubbed; manager never constructed — B1 ruling: DO NOT expose `health_score` | `src/space_health/risk.rs:121-128`, `manager.rs:199-201` |

## Global Constraints

- **Brightness is truth** (§3.4): every number the Chart or Dead Air shows derives from real chain data via the B1 RPC — no invented values, no half-stubbed scores.
- **Chain + mempool = reality** (design law): a fresh engage counts the moment it's submitted — the shell's own ledger updates optimistically; the RPC reflects it after block inclusion, and that lag is acceptable and honest.
- **Dwell-engage runs only where licensed** (§2.5): one sponsorship-rejected attempt marks the channel receive-only for the session — silent, no error surface.
- **Mining in a Worker, always** (hash-wasm event-loop trap); bits not bytes; node-true params (6 bits, 8 MiB/1/2) with a live-verification step before any task claims done.
- **Seam rule and all A1 shell discipline unchanged** — B adds overlays and a drawer; it never touches the flip/readiness machinery except where stated.
- **No client-source changes; spike/ untouched; no Night Swim/Channel 0/dial** (fences per the decision sheet).
- **All thresholds are policy constants** in one place (`web/policy.mjs`) — N=45s, K=3, 24h ledger, 2d/5d dead-air, glow curve — so tuning never hunts through logic.
- **Tests:** node:test for every new pure module with mutation checks; cargo test for the RPC; the 25 existing shell tests + 4 node-host tests stay green.
- **Commits:** conventional + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; never push to a merged branch.

## File structure

```
src/rpc/methods.rs            +get_space_health (dispatch + impl + cache field) (Task 1)
src/rpc/types.rs              +GetSpaceHealthParams/Result, SpaceHealthEntry (Task 1)
src/rpc/server.rs             +AUTH_EXEMPT entry (read-only aggregate, list_spaces precedent) (Task 1)
src/rpc/rate_limiter.rs       +Read category entry (Task 1)
surf-app/scripts/build-worker.cjs   esbuild one-shot: engage worker bundle (Task 2)
surf-app/web/workers/         engage.worker.js (built, gitignored) (Task 2)
surf-app/web/policy.mjs       every B dial in one file (Task 2)
surf-app/web/dwell.mjs        dwell core: timer state, 24h ledger, K-selection (pure) (Task 3)
surf-app/web/engage.mjs       mine→sign→submit pipeline + receive-only latch (Task 3)
surf-app/web/deadair.mjs      thresholds + card state + flare (pure core) (Task 4)
surf-app/web/chart.mjs        glow mapping (pure) + drawer wiring (Task 5)
surf-app/web/shell.mjs        integration: dwell hooks, dead-air on tune, chart entry,
                              moored cycling, bootstrap swap (Tasks 3-6)
surf-app/web/index.html       dead-air card, chart drawer, top pull strip (Tasks 4-5)
surf-app/test/                dwell/deadair/chart/engage-preimage tests (Tasks 2-5)
surf-app/README.md            B section + debt updates (Task 6)
```

---

### Task 1: The `get_space_health` RPC (minimal-honest, B1)

**Files:**
- Modify: `src/rpc/types.rs` (three new types), `src/rpc/methods.rs` (dispatch + impl + cache field), `src/rpc/server.rs` (auth-exempt list), `src/rpc/rate_limiter.rs` (category map)
- Tests: unit tests beside the pure fold function in `src/rpc/methods.rs` (`#[cfg(test)]`), following the file's existing test module conventions

**Interfaces:**
- Consumes: `chain_store.iter_content_blocks()` exactly as the precedent loop does (`methods.rs:5690-5709`).
- Produces (Tasks 3-5 call this from the shell): JSON-RPC `get_space_health` with params `{ "space_ids": ["<32-hex or bech32>", ...] }` (optional — omitted/empty means all known spaces) returning `{ "spaces": [{ "space_id": "<32-hex>", "last_engagement_ts": u64|null, "engagements_7d": u64, "unique_actors_7d": u64 }] }`. Auth-exempt, Read-category, 3s-TTL cached.

- [ ] **Step 1: types** — in `src/rpc/types.rs`, next to the space-listing types (`:747`):

```rust
/// Params for get_space_health (Surf Phase B — decision B1: minimal-honest).
#[derive(Debug, Deserialize)]
pub struct GetSpaceHealthParams {
    /// Hex or bech32 space ids; empty/omitted = all known spaces.
    #[serde(default)]
    pub space_ids: Vec<String>,
}

/// Per-space engagement-derived health. Every field is chain-derived truth;
/// deliberately NO health_score (its inputs are stubbed — see decision B1).
#[derive(Debug, Serialize)]
pub struct SpaceHealthEntry {
    pub space_id: String,
    pub last_engagement_ts: Option<u64>,
    pub engagements_7d: u64,
    pub unique_actors_7d: u64,
}

#[derive(Debug, Serialize)]
pub struct GetSpaceHealthResult {
    pub spaces: Vec<SpaceHealthEntry>,
}
```

- [ ] **Step 2: the pure fold + the method** — in `src/rpc/methods.rs`:

Extract the aggregation as a free function so it unit-tests without a node. Shape (adjust names to the file's conventions; the loop body mirrors `resolved_space_list`'s at `:5690-5709` but filters to Engage and buckets by the block's space):

```rust
/// Fold engage actions into per-space stats. `now` injected for testability.
/// Iterator yields (space_id_16, action_type, actor, timestamp) tuples the
/// caller extracts from ContentBlock.actions — Engage actions only are folded.
fn fold_space_engage_stats(
    rows: impl Iterator<Item = ([u8; 16], crate::types::ActionType, [u8; 32], u64)>,
    now: u64,
) -> std::collections::HashMap<[u8; 16], ( Option<u64>, u64, std::collections::HashSet<[u8; 32]> )> {
    let week_ago = now.saturating_sub(7 * 24 * 3600);
    let mut map: std::collections::HashMap<_, (Option<u64>, u64, std::collections::HashSet<[u8; 32]>)> =
        std::collections::HashMap::new();
    for (space, ty, actor, ts) in rows {
        if ty != crate::types::ActionType::Engage { continue; }
        let e = map.entry(space).or_default();
        if e.0.map_or(true, |cur| ts > cur) { e.0 = Some(ts); }
        if ts >= week_ago {
            e.1 += 1;
            e.2.insert(actor);
        }
    }
    map
}
```

The async method walks `iter_content_blocks()`, flat-maps each block's actions to those tuples (block's `space_id[..16]` + action fields — copy the access patterns from `:5690-5709`), calls the fold, filters to requested ids (`decode_space_id` handles hex/bech32 — precedent `methods.rs:161-177`), and serializes. Cache: a field alongside the space-list cache (`:547-548`) with the same 3-second TTL pattern (`SPACE_LIST_TTL` at `:5570`) — key the cache on nothing (whole-map cache) and filter per request from the cached map.

- [ ] **Step 3: wiring** — dispatch arm next to `"list_spaces"` (`:1087`); `server.rs` `AUTH_EXEMPT_METHODS` entry beside `list_spaces` (`:475`) with a one-line comment (read-only chain aggregate, same exposure class as list_spaces); `rate_limiter.rs` Read-category entry beside the other reads (`:135-137`).

- [ ] **Step 4: unit tests (TDD on the fold)** — write these FIRST in the `#[cfg(test)]` module, run red (function absent), implement, run green:
  1. engage actions bucket by space; non-Engage actions ignored;
  2. `last_engagement_ts` is the max ts even when it's older than 7d (and 7d counters then exclude it);
  3. `unique_actors_7d` dedupes the same actor across contents;
  4. empty iterator → empty map.
  **Mutation checks:** (a) remove the `ty != Engage` filter → test 1 fails; (b) change `>= week_ago` to `>` off-by-one is NOT catchable honestly — skip; instead (b) swap `ts > cur` to `ts < cur` in the max fold → test 2 fails. Evidence both.

- [ ] **Step 5: cargo + live check** — `cargo test --lib fold_space_engage` then full `cargo test --lib` for the rpc module scope you touched (the repo has 7 known pre-existing lib-test failures on main — compare against a baseline run from BEFORE your change so you never chase inherited breakage; only NEW failures are yours). Then live: start the dev surf node or any local mainnet-synced node and `Invoke-RestMethod` `get_space_health` with no params — expect entries for the known /browse spaces with plausible recent `last_engagement_ts`. Record the output.

- [ ] **Step 6: Commit** — `feat(surf): get_space_health RPC - minimal-honest per-space engagement stats`

---

### Task 2: Policy module + the engage worker bundle

**Files:**
- Create: `surf-app/web/policy.mjs`, `surf-app/scripts/build-worker.cjs`, `surf-app/scripts/worker-src/engage.worker.mjs` (bundle entry, committed), `surf-app/test/policy.test.mjs`
- Modify: `surf-app/.gitignore` (+`web/workers/`), `surf-app/package.json` (+`build:worker` script)
- Built artifact (gitignored): `surf-app/web/workers/engage.worker.js`

**Interfaces:**
- Produces: `policy.mjs` exporting every B dial; a same-origin classic-module worker at `/workers/engage.worker.js` that accepts `{challenge: {actionType, contentHashHex, authorPkHex, timestamp, difficulty, nonceSpaceHex}, config: {memoryMiB, iterations, parallelism}}` and posts `{type:'solution', nonce: string(u64), hashHex}` / `{type:'error', message}` (progress optional). Task 3 consumes both.

- [ ] **Step 1: `surf-app/web/policy.mjs`** (full file):

```js
// Every Phase B dial in one place (decision sheet B1-B6; all client policy).
export const DWELL_SECONDS = 45;          // B2: tuned time before the miner starts
export const DWELL_K = 3;                 // B2: newest items engaged per dwell
export const ENGAGE_LEDGER_HOURS = 24;    // B2: one engage per content per window
export const ENGAGE_DIFFICULTY_BITS = 6;  // node truth: mainnet Engage minimum (mode.rs:274-296)
export const ARGON2 = { memoryMiB: 8, iterations: 1, parallelism: 2 }; // node truth (action_pow.rs:264-274)
export const DEAD_AIR_FADING_DAYS = 2;    // B6
export const DEAD_AIR_DYING_DAYS = 5;     // B6
export const MOOR_CAP = 3;                // B3: measured warm size is the natural cap
// B3 glow: recency (seconds) -> 0..1 brightness, log-scaled against the 7-day half-life.
export function glow(ageSeconds) {
  if (ageSeconds == null) return 0;
  const days = ageSeconds / 86400;
  if (days <= 0.25) return 1;
  if (days >= 7) return 0.06;             // near-black, never fully invisible on the Chart
  return Math.max(0.06, 1 - Math.log2(1 + days) / Math.log2(8));
}
```

`policy.test.mjs`: glow(0)=1; glow(7d)≈0.06 floor; monotonically non-increasing across 0.1d..7d sample points; null→0. Mutation: flip the log base → monotonicity/endpoint tests fail. (These constants ARE the level-design of Phase B — the test freezes the curve's shape so a future tweak is deliberate.)

- [ ] **Step 2: worker entry** — `surf-app/scripts/worker-src/engage.worker.mjs` (committed source; the BUILD is what lands in web/):

```js
// Engage PoW worker. Bundled by build-worker.cjs into /workers/engage.worker.js.
// Mirrors the node's verify side exactly (action_pow.rs:136-145,400-404):
// 82-byte challenge || nonce u64 BE, Argon2id with salt = nonce_space,
// leading zeros counted in BITS. Params/difficulty arrive from the shell
// (policy.mjs) — never from the stale client DIFFICULTY tables.
import { argon2id } from 'hash-wasm';

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function leadingZeroBits(bytes) {
  let z = 0;
  for (const b of bytes) {
    if (b === 0) { z += 8; continue; }
    z += Math.clz32(b) - 24;
    break;
  }
  return z;
}
function buildChallenge(c) {
  const buf = new Uint8Array(82);
  buf[0] = c.actionType;                       // Engage = 0x04
  buf.set(hexToBytes(c.contentHashHex), 1);    // RAW 32-byte hash, never re-hashed
  buf.set(hexToBytes(c.authorPkHex), 33);
  new DataView(buf.buffer).setBigUint64(65, BigInt(c.timestamp), false); // BE
  buf[73] = c.difficulty;
  buf.set(hexToBytes(c.nonceSpaceHex), 74);
  return buf;
}

self.onmessage = async (e) => {
  const { challenge, config } = e.data;
  try {
    const base = buildChallenge(challenge);
    const salt = hexToBytes(challenge.nonceSpaceHex);
    const input = new Uint8Array(90);
    input.set(base, 0);
    const view = new DataView(input.buffer);
    for (let nonce = 0n; ; nonce++) {
      view.setBigUint64(82, nonce, false);     // BE, matches the node
      const hashHex = await argon2id({
        password: input, salt,
        memorySize: config.memoryMiB * 1024,   // hash-wasm takes KiB
        iterations: config.iterations,
        parallelism: config.parallelism,
        hashLength: 32, outputType: 'hex',
      });
      if (leadingZeroBits(hexToBytes(hashHex)) >= challenge.difficulty) {
        postMessage({ type: 'solution', nonce: nonce.toString(), hashHex });
        return;
      }
      if (nonce % 32n === 0n) postMessage({ type: 'progress', attempts: Number(nonce) });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err) });
  }
};
```

**Adaptation note (resolve, don't guess):** compare this against the node's exact recompute (`action_pow.rs:354-404`) AND a known-good client (`swimchain-react/src/lib/action-pow.ts` serialize/mine) for any detail drift — especially whether hash-wasm's `memorySize` unit and the salt handling match what `computePow` does. If `swimchain-react`'s `computePow` is directly bundleable, PREFER wrapping it over this hand-rolled loop (less drift risk) — this listing is the fallback shape. Either way the live check in Step 4 is the arbiter.

- [ ] **Step 3: `build-worker.cjs`** — esbuild one-shot (esbuild is present transitively in every client's node_modules via vite): resolve esbuild from `feed-client/node_modules`, bundle `worker-src/engage.worker.mjs` → `web/workers/engage.worker.js` (`--bundle --format=iife --platform=browser`), fail loudly if the output lacks `argon2id` or exceeds ~2 MB (WASM inlined as base64 by hash-wasm's browser build — verify how it loads under CSP: if it fetches a .wasm asset, copy it beside and confirm `'self'` covers it; if it inlines, `wasm-unsafe-eval` already landed in A1). Wire `npm run build:worker`; add `web/workers/` to `.gitignore`. Also call it from `build-channels.cjs`'s tail so one bake command produces everything.

- [ ] **Step 4: live mining verification (the arbiter)** — with the surf dev app running (desktop, mainnet synced): from the shell console via CDP, spawn the worker, mine a challenge for a REAL recent content id (from `list_space_content` on a bootstrap space) with the node identity's pubkey (`get_identity_info`), difficulty 6, fresh random nonce_space, now-timestamp; then `sign_message` over the UTF-8→hex `engage:{content_id}:{nonce}:{timestamp}` string; then `submit_engagement`. Expected: `{"success":true}`-class result, and the engage visible via `get_chain_engagements` (or mempool per the chain+mempool law). One real minimum-weight engage on mainnet under the dev identity is precisely dwell-engage's production behavior — acceptable and intended. Record timing (should be well under a second at 6 bits / 8 MiB).

- [ ] **Step 5: tests + commit** — `npm test` green (policy tests added); commit `feat(surf): B policy dials + engage PoW worker (node-true params)`.

---

### Task 3: Dwell-engage — the mechanic behind "watching is feeding"

**Files:**
- Create: `surf-app/web/dwell.mjs` (pure), `surf-app/web/engage.mjs` (pipeline), `surf-app/test/dwell.test.mjs`
- Modify: `surf-app/web/shell.mjs` (start/stop the dwell timer on tune/flip)

**Interfaces:**
- Consumes: `policy.mjs`; the worker (Task 2); `rpc(method, params)`, `invoke('get_node_address')`, and a `sign(messageHex)` helper the shell adds (wraps `sign_message`); the current channel's listing (reuse the shell's existing `list_space_content` calls from acquisition — Task 3 of A1).
- Produces (shell calls): `createDwell({ rpc, sign, myPk, onEngaged })` → `{ tuned(channelId, spaces), untuned(), tick() }`. `engage.mjs` exports `mineSignSubmit({ rpc, sign, myPk, contentId }) -> {ok:true} | {ok:false, receiveOnly:boolean}`.

**Design (B2 ruling):** on `tuned`, start a 45s timer bound to the current channel; if the viewer stays 45s continuously (any flip cancels it via `untuned`), select the K=3 most-recent *rendered* items on that channel's spaces, and for each not in the 24h ledger, mine→sign→submit. First sponsorship rejection latches the channel receive-only for the session (silent). The ledger is `localStorage` keyed `engage:{contentId}` → epoch-ms; entries older than 24h are ignored/pruned.

- [ ] **Step 1: dwell tests first** (`surf-app/test/dwell.test.mjs`, injected clock + fake rpc/sign):
  1. 45s continuous → attempts engage on up to K items; <45s then untuned → no attempt.
  2. re-`tuned` to the same channel resets the timer (no double-fire).
  3. ledger: a content engaged 1h ago is skipped; 25h ago is retried.
  4. receive-only latch: a rejection on the first item stops attempts on the rest this session and no error propagates.
  5. K cap: 5 rendered items → at most 3 attempts, newest first.
  Mutation checks: remove the ledger check → test 3 fails; remove the latch → test 4 fails; drop the `.slice(0, K)` → test 5 fails.

- [ ] **Step 2: `dwell.mjs`** (pure — no DOM, no real timers; the shell drives `tick()` or injects setTimeout):

```js
import { DWELL_SECONDS, DWELL_K, ENGAGE_LEDGER_HOURS } from './policy.mjs';

const LKEY = (id) => `engage:${id}`;
export function ledgerHas(store, id, now) {
  const raw = store.getItem(LKEY(id));
  if (!raw) return false;
  return now - Number(raw) < ENGAGE_LEDGER_HOURS * 3600_000;
}
export function ledgerMark(store, id, now) { store.setItem(LKEY(id), String(now)); }

// Pure selection: newest-first, ledger-fresh, capped at K.
export function selectForEngage(items, store, now) {
  return items
    .slice()
    .sort((a, b) => (b.created_ms ?? 0) - (a.created_ms ?? 0)) // DISCOVERY: confirm the item timestamp field
    .filter((it) => !ledgerHas(store, it.content_id, now))
    .slice(0, DWELL_K)
    .map((it) => it.content_id);
}

export function createDwell({ rpc, engageOne, store, now = () => Date.now(),
                             setTimer = setTimeout, clearTimer = clearTimeout }) {
  let handle = null, current = null, receiveOnly = new Set();
  async function fire(channelId, spaces) {
    if (receiveOnly.has(channelId)) return;
    let items = [];
    for (const s of spaces) {
      try { items = items.concat((await rpc('list_space_content', { space_id: s, limit: 5 }))?.items ?? []); }
      catch { /* keep going */ }
    }
    const targets = selectForEngage(items, store, now());
    for (const id of targets) {
      const r = await engageOne(id);
      if (!r.ok && r.receiveOnly) { receiveOnly.add(channelId); return; }
      if (r.ok) ledgerMark(store, id, now());
    }
  }
  return {
    tuned(channelId, spaces) {
      if (handle) clearTimer(handle);
      current = channelId;
      handle = setTimer(() => { if (current === channelId) fire(channelId, spaces); },
                        DWELL_SECONDS * 1000);
    },
    untuned() { if (handle) clearTimer(handle); handle = null; current = null; },
  };
}
```

- [ ] **Step 3: `engage.mjs`** — the mine→sign→submit pipeline, using the Task 2 worker and node-true params. Builds the challenge (raw content hash from `content_id.slice(7)`, node pubkey, now-ts, difficulty 6, random 8-byte nonce_space), runs the worker, signs `engage:{content_id}:{nonce}:{timestamp}` via `sign` (hex-encode the UTF-8 string for `sign_message`), submits with all PoW fields. Classifies a sponsorship/authorization rejection (`check_identity_sponsored` failure — match the node's error text/code from `methods.rs:3849`) as `{ok:false, receiveOnly:true}`; other errors `{ok:false, receiveOnly:false}`. **DISCOVERY:** confirm the exact `submit_engagement` param names/casing from `src/rpc/types.rs:394-415` and the sponsorship-rejection error shape; adjust the classifier to the real message.

- [ ] **Step 4: shell wiring** — add a `sign(hex)` helper (wraps `sign_message`, caches `myPk` from `get_identity_info` already fetched in A1); construct the dwell controller once; call `dwell.tuned(target, byId.get(target).spaces)` inside `settle`'s `onReady` (only when acquired and the channel has spaces and is not receive-only), and `dwell.untuned()` at the top of `flip` and in `powerOff`. Guard: never dwell-engage during acquisition or on a channel with `spaces: []`.

- [ ] **Step 5: run + live** — `npm test` green; live via CDP: tune a bootstrap channel, wait 45s (or inject a short DWELL for the check), confirm a real engage lands (mempool/`get_chain_engagements`) and the ledger blocks an immediate repeat. Record.

- [ ] **Step 6: Commit** — `feat(surf): dwell-engage - 45s tuned mines a minimum-weight engage, 24h ledger, receive-only latch`

---

### Task 4: Dead Air + the flare (B6)

**Files:**
- Create: `surf-app/web/deadair.mjs` (pure), `surf-app/test/deadair.test.mjs`
- Modify: `surf-app/web/index.html` (test-card element), `surf-app/web/shell.mjs` (evaluate on tune)

**Interfaces:**
- Consumes: `policy.mjs`, `get_space_health` (Task 1), the flare's `request_content`+engage (reuse `engage.mjs`).
- Produces: `classifyDeadAir(lastEngagementTs, now)` → `{state:'alive'|'fading'|'dying', days:number}`; shell shows the SMPTE test card over a channel classified fading/dying, with a RETUNE-style FLARE button.

- [ ] **Step 1: tests first** — boundaries: <2d = alive; exactly 2d and 4d = fading; exactly 5d and 8d = dying; null lastEngagement (never engaged) = dying (honest: a space with zero chain engagements is dead air). Mutation: swap `>=` for `>` at a boundary → the exact-2d/5d tests fail.

- [ ] **Step 2: `deadair.mjs`**:

```js
import { DEAD_AIR_FADING_DAYS, DEAD_AIR_DYING_DAYS } from './policy.mjs';
export function classifyDeadAir(lastEngagementTs, now) {
  if (lastEngagementTs == null) return { state: 'dying', days: Infinity };
  const days = (now - lastEngagementTs * 1000) / 86400_000;
  if (days >= DEAD_AIR_DYING_DAYS) return { state: 'dying', days };
  if (days >= DEAD_AIR_FADING_DAYS) return { state: 'fading', days };
  return { state: 'alive', days };
}
```

- [ ] **Step 3: card + wiring** — in `index.html`, a `#dead-air` overlay (bleached coral SMPTE bars via CSS gradient — reuse the spike's SIGNAL LOST card structure/z-order family; channel name + `LAST SIGNAL: N DAYS AGO` + for dying `THIS CHANNEL IS DYING` + a `FLARE` button). In `shell.mjs`, after a channel reveals (`onReady`), call `get_space_health` for its spaces (cached; cheap), classify by the freshest `last_engagement_ts` across them, and show the card for fading/dying — drawn OVER the channel (which keeps playing beneath per §3.3 "decayed channels are not hidden — you flip through them"), dismissed on the next flip. FLARE = `request_content` for the space's most recent surviving item + one `engage.mjs` engage on arrival; on success, re-classify (card updates/clears); when nothing is retrievable, the card reads the spec's beyond-flares line. Guard the flare behind the same licensed/receive-only check as dwell.

- [ ] **Step 4: run + live** — `npm test` green; live check needs a genuinely stale space, which mainnet may not have — if so, verify the classifier live against a real space's `last_engagement_ts` (assert the state matches the computed age) and drive the CARD render by temporarily injecting an old timestamp via CDP, documenting that the threshold data is real but the stale-state was injected. Record.

- [ ] **Step 5: Commit** — `feat(surf): dead air + flare - decayed channels flip to a dying test card that can be revived`

---

### Task 5: The Chart — the water column (B3)

**Files:**
- Create: `surf-app/web/chart.mjs`, `surf-app/test/chart.test.mjs`
- Modify: `surf-app/web/index.html` (drawer + top pull strip), `surf-app/web/shell.mjs` (open/close, moored cycling)

**Interfaces:**
- Consumes: `policy.mjs` (`glow`, `MOOR_CAP`), `channels.json` (numbers/bands), `get_space_health` (Task 1), the deck (current/warm), `localStorage` (moored set).
- Produces: `chartRows(channels, healthByChannel, warmSet, moored, now)` → ordered rows `{id, number, name, band, glowValue, afterglow:boolean, moored:boolean}` (pure); the shell renders them into a pull-down drawer and handles a tap-to-tune + horizontal-flick-to-moor.

**Design (B3 + §3.4):** pull down from the top → a vertical water column, surface→trench, channels at their fixed band depths (surface 2–19, mid 20–49, reef 50–79, trench 80–98). Each row's brightness = `glow(ageSeconds)` from its freshest `last_engagement_ts`; warm-deck channels carry an afterglow flag (extra ring/tint). Tap a row = tune (close drawer, flip to it). Horizontal flick on a row = toggle moored (cap 3). Moored buoys cycle via a horizontal flick on the *set* (distinct from the vertical dial). Moored set + numbers persist in `localStorage`.

- [ ] **Step 1: tests first** (`chart.test.mjs`):
  1. rows come back in canonical dial order (= number order = depth order); band assigned correctly at each boundary (19→surface, 20→mid, 49→mid, 50→reef, 79→reef, 80→trench).
  2. glowValue wired to the channel's freshest health ts (a 1h-old channel > a 6d-old channel).
  3. warm channels flagged afterglow; non-warm not.
  4. moored flag reflects the moored set; a row absent from health → glow 0 (dead/unknown, honest).
  Mutation: break the band boundary (`<20` → `<=20`) → boundary test fails; drop the afterglow flag → test 3 fails.

- [ ] **Step 2: `chart.mjs`** — pure `chartRows(...)` + `bandOf(number)` (surface/mid/reef/trench per the §3.4 ranges) + a `toggleMoor(moored, id, cap)` helper (returns the new set or the unchanged set if adding past the cap — the shell surfaces a brief "deck full" note). No DOM.

- [ ] **Step 3: drawer + wiring** — `index.html`: a `#chart` drawer (full-height, gradient sunlit-surface→trench-black background, `overflow-y:auto`, rows as depth-positioned buoys with a glow style bound to `--glow`), and a top `#chart-strip` (mirror of the flip strip, top edge) whose downward drag opens it. `shell.mjs`: on open, `get_space_health` for all dial spaces (cached), build rows, render; tap row → close + tune; horizontal-flick a row → `toggleMoor` + persist; horizontal-flick on the set (new left-edge gesture or two-finger — pick the one that doesn't collide with the right-edge flip strip; document the choice) cycles the moored buoys. Escape/tap-scrim closes. Guard: the chart is available only once acquired.

- [ ] **Step 4: run + live** — `npm test` green; live via CDP: pull the chart, confirm rows in band order with brightness tracking real `last_engagement_ts` (the freshest bootstrap space visibly brighter than a stale one), moor a channel and confirm it persists across a reload, cycle moored buoys. Screenshot the column. Record.

- [ ] **Step 5: Commit** — `feat(surf): the Chart - depth-ordered water column, glow = engagement recency, mooring`

---

### Task 6: Bootstrap-via-health + README/debt (B5, B6 close-out)

**Files:**
- Modify: `surf-app/web/shell.mjs` (acquisition bootstrap swap), `surf-app/web/channels.json` (feed spaces → fallback comment), `surf-app/README.md`

**Interfaces:**
- Consumes: `list_spaces` (A1 already uses it nowhere; add it here) or `get_space_health` for ranking; the existing acquisition path (A1 Task 3).

- [ ] **Step 1: bootstrap swap (B5)** — in `shell.mjs`'s `acquisitionBoot`, before following the hardcoded set: call `list_spaces {limit:20}`, filter `class === 'social'`, take the top 3 by `last_activity` (or by `get_space_health` recency if you prefer one source of truth — pick one, note it), and use those as the follow+drive set. Keep the hardcoded trio from `channels.json` as the fallback when the listing is empty (true first run pre-sync). Update `channels.json`'s feed `spaces` comment to "fallback only — live bootstrap ranks list_spaces". The acquisition lock (items-with-bodies ≥ N) is unchanged.
  - Test: a small pure `pickBootstrap(listSpacesResult, fallbackSpaces)` extracted and unit-tested (social filter, top-3 by activity, empty→fallback). Mutation: drop the social filter → a test with a mixed-class list fails.

- [ ] **Step 2: live** — fresh data dir (or clear `surf.acquired`), power on, confirm acquisition now follows live top spaces and reveals real content; confirm empty-listing fallback by pointing at a fresh regtest node (no spaces) → falls back to the trio (which won't resolve on regtest, so acquisition stays in honest static — that's correct, and proves the fallback path executes). Record.

- [ ] **Step 3: README + debt** — add a "Phase B — the soul" section to `surf-app/README.md`: what shipped (get_space_health, dwell-engage, dead air + flare, Chart, health bootstrap), the B dials and where to tune them (`policy.mjs`), the engage worker build step (`npm run build:worker`, folded into `build:channels`). Update the debt table: the A1 bootstrap-decay row is now CLOSED (B5); add any B carry (e.g. get_space_health v2 with a real score = Phase B1(b)/later; node-side engagement rate limiting still deferred). Keep the standing G2-soak note.

- [ ] **Step 4: Commit** — `feat(surf): health-driven bootstrap + Phase B README/debt`

---

## What B explicitly does not do

Night Swim + Channel 0 (§3.5); a real `health_score` (its inputs stay stubbed — B1 ruling); node-side engagement rate limiting (client policy until abused); the dial/registry/capability tokens/purpose-scoped signing (Phase D); any client-source change; release signing/size gates (Phase C); the Trench channel (B4 — Phase E). The G2 WebView soak and on-device long-press check remain open from A1, operator-scheduled.

## Execution notes

- Task order 1→6; Task 1 (Rust) is the long compile — prime it early. Tasks 3-5 all touch `shell.mjs`; run strictly sequentially (no parallel shell edits).
- The mainnet-truth PoW params (6 bits, 8 MiB/1/2) are the single most bug-prone spot — the Task 2 live mining check is the arbiter and every later engage path inherits it; if it can't land a real engage, stop and fix Task 2 before proceeding.
- Every dwell/flare live check writes a real minimum-weight engage to mainnet under the dev identity — intended, that IS the feature; keep it to the bootstrap spaces.
- `npm test` (shell) + `cargo test` (rpc) green before each commit; compare cargo failures against a pre-change baseline (7 known pre-existing lib failures on main).
