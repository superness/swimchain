/**
 * The Shoal — TWO NODES, one sea (plan 2c Task 7).
 *
 * `scripts/regtest-smoke.ts` (the bridge's own smoke) proves two *identities*
 * on ONE node fold to identical fingerprints. This script proves the thing that
 * one could not: **two separate node processes, peered over P2P, one identity
 * on each**, and — the whole point — that a `content_new` raised by GOSSIP
 * rather than by local submission makes the other client refetch.
 *
 * That gap is open item §3 in `docs/THE_SHOAL_OPEN_ITEMS.md`. On one node,
 * every event the bridge's smoke ever saw came out of the LOCAL-SUBMISSION
 * publisher; the gossip-ingest publisher at `src/node/router/router.rs:5947`
 * — the one this game's live channel actually depends on between two players
 * — never fired once.
 *
 * ── How to start the two nodes this script expects ─────────────────────────
 *
 * From the repo root. Two nodes need two DATA DIRS (a shared one deadlocks on
 * the sled lock) and two PORT PAIRS (RPC is always P2P+1):
 *
 *   # one-time: an identity per node
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoal-a identity create
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoal-b identity create
 *
 *   # node A — P2P 29735, RPC 29736
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoal-a node start --listen 127.0.0.1:29735
 *
 *   # node B — P2P 29745, RPC 29746, dialing A
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoal-b node start --listen 127.0.0.1:29745 \
 *       --connect 127.0.0.1:29735
 *
 * `--connect` is how `scripts/node-manager.sh` peers its own local fleet
 * (cmd_start, line 320); this script does not invent a second method. It does
 * fall back to the `add_peer` RPC (the same call `node-manager.sh cmd_connect`
 * makes) if the nodes come up unpeered, and it will not proceed until each
 * node lists the OTHER's node_id as a peer.
 *
 * The data dir gets a `-regtest` suffix, so the cookies land at
 * `/tmp/shoal-a-regtest/.cookie` and `/tmp/shoal-b-regtest/.cookie`. Then,
 * from `shoal-client/`:
 *
 *   SHOAL_RPC_A=http://127.0.0.1:29736 \
 *   SHOAL_COOKIE_A=/tmp/shoal-a-regtest/.cookie \
 *   SHOAL_RPC_B=http://127.0.0.1:29746 \
 *   SHOAL_COOKIE_B=/tmp/shoal-b-regtest/.cookie \
 *   npm run smoke:two
 *
 * Optionally also `SHOAL_LOG_B=/tmp/shoal-b-regtest/node.log` — see "the
 * fourth leg" below. This is NOT part of `npm test`: it needs two live nodes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THE GOSSIP CLAIM IS MADE AIRTIGHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "B eventually saw A" is worth nothing: `startLive`'s poll timer rescues a
 * completely dead socket, and so does a plain refetch loop. Four independent
 * legs, each of which alone would leave a hole:
 *
 * **1. The poll timer cannot have fired.** Every watcher runs with
 * `pollIntervalMs = 60_000`, and `startLive`'s heartbeat is a plain
 * `setInterval(pollIntervalMs)` armed at construction, so its FIRST tick
 * cannot land until 60 s after the watcher started. `nextAction` sets
 * `refetch` from exactly three places: a `content` event whose space matches,
 * a `tick` while polling, and a `tick` during detected silence. The latter two
 * are unreachable before the first tick. Every watcher's whole open window is
 * asserted to be shorter than one poll interval, and every refetch is
 * timestamped against its watcher's start, with the real elapsed ms printed.
 *
 * **2. The observing node never received a write.** `globalThis.fetch` is
 * wrapped for the entire run and every (endpoint, JSON-RPC method, ms) triple
 * is recorded. The node has exactly two local-submission publishers, and this
 * script does not take that on trust: it READS THE RUST and asserts that every
 * `.publish_content_new(` call site outside `router.rs` sits inside
 * `submit_post` or `submit_reply` (see `auditPublishers`). So if node B's
 * endpoint provably received no `submit_post`/`submit_reply` in the window
 * that ends at B's refetch, no local-submission publisher can have fired on
 * node B, and `router.rs`'s gossip-ingest publisher is the only remaining
 * source of that event. That inventory check is what keeps this argument from
 * silently going stale the day someone adds a third publisher.
 *
 * **3. A negative control on the SAME socket.** A third watcher subscribes to
 * node B with a well-formed-but-different space id (the real one with a single
 * bech32 character rotated). It receives every `content_new` this run
 * produces and must record ZERO refetches. Without it, leg 1 would still pass
 * if `nextAction`'s space filter were deleted outright.
 *
 * **4. A quiet period first.** Room setup itself gossips a space creation and
 * a post to node B. Those are real `content_new` events in the same space, and
 * one arriving late would look exactly like the event we are trying to
 * observe. So after the watchers connect the script sits still and asserts
 * ALL THREE watchers record zero refetches across a quiet window; only then
 * does anyone write. Every later refetch is additionally required to be
 * timestamped at or after the moment its triggering write was requested.
 *
 * Optionally (leg 4b), if `SHOAL_LOG_B` names node B's log file, the script
 * also asserts node B logged a `[MEMPOOL] Added action … from peer …` line —
 * the gossip-ingest path's own log line, emitted a few lines above the
 * publisher at router.rs:5947 — inside the phase-1 window. That is positive
 * evidence from the ingest path itself rather than elimination.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPONSORSHIP (the same trap the bridge's smoke fell into)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regtest bypasses the sponsorship gate at RPC INGESTION but NOT at block
 * inclusion: the builder drops any action whose author fails
 * `is_authorized_in_space` and purges it from the mempool, so a run that folds
 * perfectly at t+2 s is folding a room that no longer exists at t+45 s. Both
 * identities are therefore sponsored by the dev/testnet genesis identity —
 * **on BOTH nodes**, because either node may be the one that builds the block,
 * and a node that never heard the registration would purge the moves it did
 * not recognise. The run does not stop at "the moves are visible": it asserts
 * every move carries a `block_height` on BOTH nodes.
 *
 * The genesis seed is the TESTNET/dev one, public in this repo by design
 * (GENESIS_IDENTITY.md) and network-gated so it can never sponsor on mainnet
 * (`genesis_list.rs:99-108`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEAD-RECKONING TOLERANCE, AND WHY IT IS TWO NUMBERS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The brief asks that "positions rendered by A for B match B's own, within a
 * dead-reckoning tolerance you state and justify." Measured honestly that is
 * two different claims, and collapsing them into one loose number would hide
 * the interesting one:
 *
 * **(a) Same log, same instant: the tolerance is ZERO.** `reckon` is integer
 * arithmetic over the published `Vec`, and both clients render a swimmer from
 * the fold, so once B's vector has reached A there is no drift term at all —
 * not a rounding one, not a float one. This is asserted as exact equality
 * (`=== 0` cu), which is what makes it able to catch a lossy wire round trip
 * across two nodes: any field of the `Vec` mangled anywhere on the
 * mine → sign → submit → gossip → mempool → `get_replies` path moves this off
 * zero. A "within N cu" assertion here would pass through exactly that bug.
 *
 * **(b) One broadcast stale: bounded by the emit cadence.** A's picture of B
 * is at most one emit gap old, because `shouldEmit` (shoalEmit.ts) refuses to
 * publish more often than `MIN_EMIT_GAP_MS`. The furthest a swimmer can be
 * from where a one-gap-stale observer draws it is a full reversal at top
 * speed, so
 *
 *     DR_TOLERANCE_CU = 2 * SPEED_DART * MIN_EMIT_GAP_MS / 1000
 *                     = 2 * 220 * 3 = 1320 cu
 *
 * over a 4096-cu world. That is the design's own worst case, derived from the
 * two constants that cause it rather than tuned to whatever this run happens
 * to measure — and the run PRINTS its measured error so the margin is visible
 * instead of asserted in the dark. To keep the bound from being vacuous the
 * script also asserts the stale error is strictly greater than zero: a
 * scenario where A is never actually behind would satisfy any bound and prove
 * nothing about dead reckoning at all.
 *
 * `scripts/` may read a clock and use floats (global constraint); `src/lib/`
 * may not, and nothing here leaks into it.
 */
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';

import { rpcCall, type RpcAuth } from '../src/lib/shoalRpc';
import {
  ACTION_TYPE_POST,
  ACTION_TYPE_SPACE_CREATION,
  isWireSpaceId,
  mineAndSignAction,
  powProfileFor,
  sendPresence,
  type SendCtx,
  type SignFn,
} from '../src/lib/shoalSend';
import { MIN_EMIT_GAP_MS, shouldEmit } from '../src/lib/shoalEmit';
import { fetchRoomLog } from '../src/lib/shoalRoom';
import { startLive } from '../src/lib/shoalLive';
import { foldShoal } from '../src/lib/shoalEngine';
import { fingerprint } from '../src/lib/shoalFixtures';
import { SPEED_CRUISE, SPEED_DART, TICK_MS } from '../src/lib/shoalConst';
import type { LogEntry, ShoalState, Vec } from '../src/lib/shoalTypes';

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    failures++;
    console.log(`FAIL: ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  }
}

function log(msg: string): void {
  console.log(`[two] ${msg}`);
}

/** `Date.now()` is fine here — this is a script, not `src/lib/` code. */
async function waitUntil(pred: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise<void>((r) => { setTimeout(r, stepMs); });
  }
  return pred();
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => { setTimeout(r, ms); });
}

// ---------------------------------------------------------------------------
// Identities (client-side only — neither node ever holds either key)
// ---------------------------------------------------------------------------

interface Player {
  readonly label: string;
  readonly publicKeyHex: string;
  readonly sign: SignFn;
}

/** An ed25519 PKCS#8 private key is the fixed 16-byte DER prefix below followed
 *  by the raw 32-byte seed; the raw public key is the last 32 bytes of the SPKI
 *  export. Only `node:crypto`, no new dependency. Deterministic from the label,
 *  so a re-run's moves fold as the SAME two swimmers. */
function playerFromSeed(label: string, seed: Buffer): Player {
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return {
    label,
    publicKeyHex: spki.subarray(spki.length - 32).toString('hex'),
    sign: async (msg: Uint8Array): Promise<Uint8Array> => new Uint8Array(edSign(null, Buffer.from(msg), priv)),
  };
}

function player(label: string): Player {
  return playerFromSeed(label, createHash('sha256').update(`shoal-two:${label}`).digest());
}

// ---------------------------------------------------------------------------
// LEG 2, part one: read the Rust and inventory the publishers
// ---------------------------------------------------------------------------

/** Every `.publish_content_new(` call site in the node, with the file it lives
 *  in and the nearest enclosing `fn`. */
interface PublisherSite {
  readonly file: string;
  readonly line: number;
  readonly fn: string;
}

function rustFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) rustFiles(p, out);
    else if (name.endsWith('.rs')) out.push(p);
  }
  return out;
}

/**
 * The elimination argument in leg 2 rests entirely on there being exactly two
 * places a node publishes `content_new` for a locally-submitted write, and on
 * both of them living in a `submit_*` RPC handler. That is a fact about the
 * Rust, not about this script, and a fact that a future node change could
 * quietly falsify — at which point this run would still print PASS while
 * proving nothing. So it is checked, here, against the source.
 *
 * Matches `.publish_content_new(` (the method CALL) rather than
 * `publish_content_new`, so `events.rs`'s own `pub fn` definition is not
 * counted; the enclosing function is found by scanning backwards to the
 * nearest `fn NAME` at any indentation.
 */
function auditPublishers(repoRoot: string): PublisherSite[] {
  const sites: PublisherSite[] = [];
  for (const file of rustFiles(join(repoRoot, 'src'))) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('.publish_content_new(')) continue;
      let fn = '(unknown)';
      for (let j = i; j >= 0; j--) {
        const m = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/.exec(lines[j]);
        if (m) { fn = m[1]; break; }
      }
      // `relative`, not `slice(repoRoot.length + 1)`: `fileURLToPath` of a URL
      // ending in `/` returns a path WITH a trailing separator, so the manual
      // slice ate one character too many and every path came out as `rc/...`.
      // Every file-name comparison below then failed while the run still
      // printed the sites, which is the worst kind of wrong — a check that
      // fails for a reason unrelated to what it is checking.
      sites.push({ file: relative(repoRoot, file).replace(/\\/g, '/'), line: i + 1, fn });
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// LEG 2, part two: watch every RPC call this process makes, and where to
// ---------------------------------------------------------------------------

interface RpcCallRecord {
  readonly endpoint: string;
  readonly method: string;
  readonly atMs: number;
}

const rpcLog: RpcCallRecord[] = [];

/** The two methods whose handlers publish `content_new` locally — verified
 *  against the Rust by `auditPublishers`, not assumed. */
const PUBLISHING_METHODS = ['submit_post', 'submit_reply'];

function installFetchRecorder(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    const endpoint = typeof input === 'string' ? input : String(input);
    let method = '(unparsed)';
    if (typeof init?.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as { method?: unknown };
        if (typeof parsed.method === 'string') method = parsed.method;
      } catch {
        // not JSON-RPC; recorded as unparsed rather than dropped
      }
    }
    rpcLog.push({ endpoint, method, atMs: Date.now() });
    return realFetch(input, init);
  }) as typeof realFetch;
}

/** Publishing calls made to `endpoint` inside `[fromMs, toMs]`, inclusive. */
function publishingCallsTo(endpoint: string, fromMs: number, toMs: number): RpcCallRecord[] {
  return rpcLog.filter((r) => r.endpoint === endpoint
    && PUBLISHING_METHODS.includes(r.method)
    && r.atMs >= fromMs && r.atMs <= toMs);
}

// ---------------------------------------------------------------------------
// Sponsorship
// ---------------------------------------------------------------------------

const GENESIS_SEED_HEX = '11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471';
const GENESIS_PUBKEY_HEX = '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420';

/** At least one leading ZERO BYTE of `sha256(nonce_space(32) || nonce LE u64)`
 *  (methods.rs:16494-16524). The node re-derives the work from the nonce, so
 *  this must be real — it is just cheap (~256 tries expected). */
function mineOnboardingPow(salt: string): { nonceSpaceHex: string; nonce: number } {
  const nonceSpace = createHash('sha256').update(`shoal-two-onboard:${salt}:${Date.now()}`).digest();
  for (let nonce = 0; ; nonce++) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(nonce));
    if (createHash('sha256').update(Buffer.concat([nonceSpace, buf])).digest()[0] === 0) {
      return { nonceSpaceHex: nonceSpace.toString('hex'), nonce };
    }
  }
}

/** Global grant: the sponsor signature covers `sponsee(32) || timestamp u64 BE`
 *  (`Action::sponsor_sig_message`, src/blocks/action.rs:648). Idempotent — a
 *  second run gets "already registered", which is a success here. */
async function sponsorViaGenesis(auth: RpcAuth, genesis: Player, sponsee: Player): Promise<'registered' | 'already'> {
  const timestamp = Math.floor(Date.now() / 1000);
  const msg = Buffer.alloc(40);
  Buffer.from(sponsee.publicKeyHex, 'hex').copy(msg, 0);
  msg.writeBigUInt64BE(BigInt(timestamp), 32);
  const signature = Buffer.from(await genesis.sign(new Uint8Array(msg))).toString('hex');
  const pow = mineOnboardingPow(sponsee.label);
  try {
    await rpcCall(auth, 'register_sponsored_identity', {
      new_identity_pubkey: sponsee.publicKeyHex,
      sponsor_pubkey: genesis.publicKeyHex,
      sponsor_signature: signature,
      timestamp,
      probationary: false,
      pow_nonce_space: pow.nonceSpaceHex,
      pow_nonce: pow.nonce,
    });
    return 'registered';
  } catch (err) {
    if (err instanceof Error && err.message.includes('already registered')) return 'already';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

/** Long enough that `startLive`'s heartbeat cannot fire inside the run — leg 1.
 *  Every refetch observed below this elapsed time came from a `content_new`
 *  event, by construction. */
const POLL_INTERVAL_MS = 60_000;

interface Watcher {
  readonly name: string;
  readonly startedAtMs: number;
  /** `Date.now()` of every `onRefetch`, in order. */
  readonly refetchAtMs: number[];
  stop(): void;
}

function watch(auth: RpcAuth, name: string, spaceId: string): Watcher {
  const refetchAtMs: number[] = [];
  const startedAtMs = Date.now();
  const handle = startLive({
    auth,
    spaceId,
    pollIntervalMs: POLL_INTERVAL_MS,
    onRefetch: () => { refetchAtMs.push(Date.now()); },
  });
  return { name, startedAtMs, refetchAtMs, stop: () => handle.stop() };
}

// ---------------------------------------------------------------------------
// Room setup (idempotent)
// ---------------------------------------------------------------------------

const SPACE_NAME = '@shoal:two';
const ROOM_TITLE = 'The Shoal (two nodes)';
const ROOM_BODY = 'one sea, two nodes, one room';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** The PoW preimage is `sha256(name)`, recomputed SERVER-side. Done over RPC
 *  rather than `sw space create`, which would open the SAME sled data dir the
 *  running node already holds locked and hang there forever. */
async function createOrReuseSpace(auth: RpcAuth, p: Player, nowMs: number): Promise<string> {
  const profile = await powProfileFor(auth);
  const mined = await mineAndSignAction(
    ACTION_TYPE_SPACE_CREATION,
    new TextEncoder().encode(SPACE_NAME),
    p.publicKeyHex,
    p.sign,
    Math.floor(nowMs / 1000),
    profile,
  );
  const result = await rpcCall<{ space_id: string }>(auth, 'create_space', {
    name: SPACE_NAME,
    creator_id: p.publicKeyHex,
    ...mined,
  });
  return result.space_id;
}

/** The room post's content id is fully determined by its text (`submit_post`
 *  hashes `${title}\n\n${body}`), so existence is a lookup, not a search. */
async function createOrReuseRoom(auth: RpcAuth, p: Player, spaceId: string, nowMs: number): Promise<string> {
  const contentId = `sha256:${sha256Hex(`${ROOM_TITLE}\n\n${ROOM_BODY}`)}`;
  try {
    await rpcCall<{ content_id: string }>(auth, 'get_content', { content_id: contentId });
    log(`room post already exists: ${contentId}`);
    return contentId;
  } catch {
    // not there yet — create it below
  }

  const profile = await powProfileFor(auth);
  const mined = await mineAndSignAction(
    ACTION_TYPE_POST,
    new TextEncoder().encode(`${ROOM_TITLE}\n\n${ROOM_BODY}`),
    p.publicKeyHex,
    p.sign,
    Math.floor(nowMs / 1000),
    profile,
  );
  const result = await rpcCall<{ content_id: string }>(auth, 'submit_post', {
    space_id: spaceId,
    title: ROOM_TITLE,
    body: ROOM_BODY,
    author_id: p.publicKeyHex,
    ...mined,
  });
  if (result.content_id !== contentId) {
    throw new Error(`room content id mismatch: node said ${result.content_id}, we derived ${contentId}`);
  }
  log(`created room post ${contentId}`);
  return contentId;
}

/**
 * Poll `fetchRoomLog` until `hash` is in it, and return how long that took
 * measured from `sinceMs`. Returns `-1` if it never arrived.
 *
 * ## Why this exists — a real finding from the first run of this script
 *
 * **The `content_new` event races ahead of `get_replies`.** On the first run,
 * every gossip assertion passed and then FOUR content assertions failed,
 * because the script fetched the room log the instant the refetch fired and
 * got a log that did not yet contain the reply the event had just announced.
 * The same three writes were all present, on both nodes, at the end of the run.
 *
 * That is not a bug in this script's timing so much as a property of the node
 * worth stating: the gossip-ingest publisher fires immediately after
 * `block_builder.add_action` (router.rs, a few lines above 5947), and the
 * mempool merge `get_replies` performs is not the same read, so a client that
 * treats `content_new` as "the log now contains X" is wrong. `startLive`'s
 * design already survives this — its poll heartbeat and silence detection
 * refetch again — but a client that refetched exactly once per event and
 * rendered the result would drop writes silently, which is precisely the shape
 * of bug that never shows up on one node because the local-submission path
 * writes and merges in the same call.
 *
 * The measured lag is printed by the run rather than hidden, and bounded by an
 * assertion, so this stays a stated property rather than an unexamined sleep.
 */
async function waitForHash(
  auth: RpcAuth, spaceId: string, roomId: string, hash: string, sinceMs: number, timeoutMs = 20_000,
): Promise<{ log: LogEntry[]; lagMs: number }> {
  const deadline = Date.now() + timeoutMs;
  let last: LogEntry[] = [];
  for (;;) {
    last = await fetchRoomLog(auth, spaceId, roomId);
    if (last.some((e) => e.hash === hash)) return { log: last, lagMs: Date.now() - sinceMs };
    if (Date.now() >= deadline) return { log: last, lagMs: -1 };
    await sleep(250);
  }
}

/** `block_height` per reply, straight from `get_replies` — the one field
 *  `fetchRoomLog` deliberately drops. `null` means still pending in the
 *  mempool; a number means finalized on chain. */
async function replyHeights(auth: RpcAuth, roomId: string): Promise<Map<string, number | null>> {
  const res = await rpcCall<{ replies: Array<{ content_id: string; block_height: number | null }> }>(
    auth, 'get_replies', { content_id: roomId, limit: 100_000, depth_limit: 0 },
  );
  return new Map(res.replies.map((r) => [r.content_id, r.block_height]));
}

// ---------------------------------------------------------------------------
// Dead reckoning
// ---------------------------------------------------------------------------

/** See the module header, section (b). The design's own worst case: an
 *  observer's picture of a swimmer is at most one `MIN_EMIT_GAP_MS` stale, and
 *  the furthest a swimmer can be from where a one-gap-stale observer draws it
 *  is a full reversal at `SPEED_DART`. Speeds are cu per 1000 ms (`reckon`). */
const DR_TOLERANCE_CU = (2 * SPEED_DART * MIN_EMIT_GAP_MS) / 1000;

function posOf(state: ShoalState, id: string): { x: number; y: number } | null {
  const f = state.fish.get(id);
  return f ? { x: f.x, y: f.y } : null;
}

function distCu(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

interface NodeInfo {
  network?: string;
  node_id?: string;
  p2p_port?: number;
  peer_count?: number;
  block_height?: number;
}

interface PeerRow { peer_id?: string }

function authFrom(rpcEnv: string, cookieEnv: string): RpcAuth {
  const endpoint = (process.env[rpcEnv] ?? '').trim();
  if (!endpoint) throw new Error(`two-client-smoke requires ${rpcEnv} — see this file's header`);
  const cookieFile = (process.env[cookieEnv] ?? '').trim();
  const authHeader = cookieFile
    ? `Basic ${Buffer.from(`__cookie__:${readFileSync(cookieFile, 'utf8').trim()}`, 'utf8').toString('base64')}`
    : null;
  return { endpoint, authHeader };
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

async function main(): Promise<void> {
  installFetchRecorder();

  const authA = authFrom('SHOAL_RPC_A', 'SHOAL_COOKIE_A');
  const authB = authFrom('SHOAL_RPC_B', 'SHOAL_COOKIE_B');
  log(`node A = ${authA.endpoint}`);
  log(`node B = ${authB.endpoint}`);

  // ── the two nodes are genuinely two nodes ────────────────────────────────
  const infoA = await rpcCall<NodeInfo>(authA, 'get_info', {});
  const infoB = await rpcCall<NodeInfo>(authB, 'get_info', {});
  log(`A: node_id=${infoA.node_id?.slice(0, 16)} p2p=${infoA.p2p_port} peers=${infoA.peer_count} height=${infoA.block_height}`);
  log(`B: node_id=${infoB.node_id?.slice(0, 16)} p2p=${infoB.p2p_port} peers=${infoB.peer_count} height=${infoB.block_height}`);
  check('both endpoints are regtest nodes',
    infoA.network === 'regtest' && infoB.network === 'regtest', [infoA.network, infoB.network]);
  check('the two endpoints are TWO DIFFERENT NODES, not one node twice',
    !!infoA.node_id && !!infoB.node_id && infoA.node_id !== infoB.node_id,
    [infoA.node_id?.slice(0, 16), infoB.node_id?.slice(0, 16)]);
  check('…on two different P2P ports', infoA.p2p_port !== infoB.p2p_port, [infoA.p2p_port, infoB.p2p_port]);
  check('…reached over two different RPC endpoints', authA.endpoint !== authB.endpoint);

  // ── peered, and peered to EACH OTHER ─────────────────────────────────────
  // `add_peer` is the same RPC `node-manager.sh cmd_connect` uses. It is only
  // needed if the nodes came up without `--connect` (and without finding each
  // other over mDNS); calling it when they are already peered is harmless.
  const knowsOther = async (auth: RpcAuth, otherId: string): Promise<boolean> => {
    const peers = await rpcCall<PeerRow[]>(auth, 'get_peers', {});
    return peers.some((p) => p.peer_id === otherId);
  };
  if (!(await knowsOther(authA, infoB.node_id ?? ''))) {
    log(`A does not know B yet — dialing 127.0.0.1:${infoB.p2p_port} via add_peer`);
    try {
      await rpcCall(authA, 'add_peer', { address: `127.0.0.1:${infoB.p2p_port}` });
    } catch (err) {
      log(`add_peer failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // `waitUntil` takes a synchronous predicate and "are we peered" needs an RPC
  // round trip, so this waits with its own loop rather than smuggling a
  // promise through a sync predicate.
  async function peerWait(): Promise<boolean> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await knowsOther(authA, infoB.node_id ?? '') && await knowsOther(authB, infoA.node_id ?? '')) return true;
      await sleep(500);
    }
    return false;
  }
  const peered = await peerWait();
  check('node A lists node B as a peer AND node B lists node A — a real P2P link, both directions',
    peered);
  if (!peered) {
    console.log('\n[two] the two nodes never peered; the gossip claim CANNOT be made. Stopping.');
    process.exitCode = 1;
    return;
  }

  // ── leg 2, part one: the Rust says what this script's argument assumes ───
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const sites = auditPublishers(repoRoot);
  const local = sites.filter((s) => s.file === 'src/rpc/methods.rs');
  const gossip = sites.filter((s) => s.file === 'src/node/router/router.rs');
  const other = sites.filter((s) => s.file !== 'src/rpc/methods.rs' && s.file !== 'src/node/router/router.rs');
  log(`publish_content_new call sites: ${sites.map((s) => `${s.file}:${s.line} in ${s.fn}()`).join(', ')}`);
  check('every LOCAL-submission content_new publisher lives in submit_post or submit_reply — '
      + 'so an endpoint that received neither cannot have published one locally',
    local.length === 2 && local.every((s) => s.fn === 'submit_post' || s.fn === 'submit_reply'),
    local);
  check('there is exactly ONE gossip-ingest publisher, in router.rs',
    gossip.length === 1, gossip);
  check('and no publisher anywhere else in the node outside its own unit test — '
      + 'if this fails, the elimination argument below is stale and must be redone',
    other.every((s) => s.file === 'src/rpc/events.rs'), other);

  // ── the two players, one per node ────────────────────────────────────────
  const alice = player('alice');
  const bob = player('bob');
  log(`A's player (alice) = ${alice.publicKeyHex.slice(0, 16)}…`);
  log(`B's player (bob)   = ${bob.publicKeyHex.slice(0, 16)}…`);
  check('one identity per node, and they are different identities',
    alice.publicKeyHex !== bob.publicKeyHex);

  const genesis = playerFromSeed('genesis', Buffer.from(GENESIS_SEED_HEX, 'hex'));
  check('the documented genesis seed derives the documented genesis public key',
    genesis.publicKeyHex === GENESIS_PUBKEY_HEX, { got: genesis.publicKeyHex, want: GENESIS_PUBKEY_HEX });

  // BOTH nodes, not just the writer's: either may build the block, and a node
  // that never heard the registration purges the moves it does not recognise.
  for (const [nodeName, auth] of [['A', authA], ['B', authB]] as const) {
    for (const p of [alice, bob]) {
      const outcome = await sponsorViaGenesis(auth, genesis, p);
      check(`${p.label} holds a genesis sponsorship on node ${nodeName}`,
        outcome === 'registered' || outcome === 'already', outcome);
    }
  }

  // ── the room, created on node A only ─────────────────────────────────────
  const spaceId = await createOrReuseSpace(authA, alice, Date.now());
  log(`space ${SPACE_NAME} -> ${spaceId}`);
  check('create_space returned the bech32m wire form (sp1…, 37 chars)', isWireSpaceId(spaceId), spaceId);
  const roomId = await createOrReuseRoom(authA, alice, spaceId, Date.now());

  // Node B must have the room before it can fold it — over gossip, since the
  // room was never submitted to node B.
  let sawRoomOnB = false;
  {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !sawRoomOnB) {
      try {
        await rpcCall(authB, 'get_content', { content_id: roomId });
        sawRoomOnB = true;
      } catch {
        await sleep(500);
      }
    }
  }
  check('node B received the room post it was never given — over the P2P link',
    sawRoomOnB, roomId);

  const ctxA: SendCtx = {
    auth: authA, spaceId, roomContentId: roomId,
    authorIdHex: alice.publicKeyHex, sign: alice.sign, powProfile: await powProfileFor(authA),
  };
  const ctxB: SendCtx = {
    auth: authB, spaceId, roomContentId: roomId,
    authorIdHex: bob.publicKeyHex, sign: bob.sign, powProfile: await powProfileFor(authB),
  };

  // ── watchers ─────────────────────────────────────────────────────────────
  const rotate = (c: string) => BECH32_CHARSET[(BECH32_CHARSET.indexOf(c) + 1) % BECH32_CHARSET.length];
  const wrongSpaceId = spaceId.slice(0, 36) + rotate(spaceId[36]);
  check('the negative control uses a WELL-FORMED space id (so startLive accepts it and the '
      + 'socket really connects) that is simply not ours',
    isWireSpaceId(wrongSpaceId) && wrongSpaceId !== spaceId, wrongSpaceId);

  const wA = watch(authA, 'A', spaceId);
  const wB = watch(authB, 'B', spaceId);
  const wCtl = watch(authB, 'wrong-space-control', wrongSpaceId);
  log(`three watchers up: A on node A, B on node B, and a wrong-space control on node B; `
    + `poll interval ${POLL_INTERVAL_MS} ms`);

  let quietSummary = '';
  try {
    // ── leg 4: a quiet period, so nothing stale can be mistaken for a hit ──
    await sleep(2_000); // sockets connect and send their subscribe frame
    const beforeQuiet = [wA.refetchAtMs.length, wB.refetchAtMs.length, wCtl.refetchAtMs.length];
    await sleep(4_000);
    const afterQuiet = [wA.refetchAtMs.length, wB.refetchAtMs.length, wCtl.refetchAtMs.length];
    quietSummary = `${JSON.stringify(beforeQuiet)} -> ${JSON.stringify(afterQuiet)}`;
    check('the sea is QUIET before anyone writes — no watcher refetched during a 4 s idle window, '
        + 'so no in-flight setup gossip can be mistaken for the event under test',
      afterQuiet.every((n, i) => n === beforeQuiet[i]), quietSummary);

    // ══ PHASE 1 — A writes on node A; node B must raise it from GOSSIP ═════
    const beforeB = wB.refetchAtMs.length;
    const p1Start = Date.now();
    const vecA: Vec = { x: 1_000, y: 1_000, heading: 0, speed: SPEED_CRUISE, t: p1Start };
    const aPresenceId = await sendPresence(ctxA, vecA, 'a swims');
    log(`A wrote presence ${aPresenceId.slice(7, 19)}… to node A only`);

    const bSaw = await waitUntil(() => wB.refetchAtMs.length > beforeB, 20_000);
    const bRefetchMs = bSaw ? wB.refetchAtMs[beforeB] : -1;
    const bElapsed = bSaw ? bRefetchMs - wB.startedAtMs : -1;
    check('node B\'s client refetched after A wrote', bSaw, { refetches: wB.refetchAtMs.length });
    check(`…and it happened AFTER the write was requested (${bSaw ? bRefetchMs - p1Start : -1} ms after), `
        + 'so it is not a late setup event',
      bSaw && bRefetchMs >= p1Start, { bRefetchMs, p1Start });
    check(`…and it was socket-driven, not poll-rescued: ${bElapsed} ms after B's watcher started, `
        + `versus a ${POLL_INTERVAL_MS} ms heartbeat that cannot have ticked yet`,
      bSaw && bElapsed >= 0 && bElapsed < POLL_INTERVAL_MS, { bElapsed, POLL_INTERVAL_MS });

    // LEG 2: node B never received a write. Checked over the whole run so far,
    // not merely the phase window — the strongest form available.
    const writesToB = publishingCallsTo(authB.endpoint, 0, bSaw ? bRefetchMs : Date.now());
    check('node B\'s RPC endpoint received ZERO submit_post/submit_reply calls up to that refetch — '
        + 'so no local-submission publisher can have fired on node B, and router.rs:5947 '
        + '(gossip ingest) is the ONLY remaining source of that content_new',
      writesToB.length === 0, writesToB);
    log(`RPC methods sent to node B so far: ${[...new Set(rpcLog.filter((r) => r.endpoint === authB.endpoint).map((r) => r.method))].join(', ')}`);

    // Optional leg 4b: positive evidence out of the gossip path's own log.
    const logB = (process.env.SHOAL_LOG_B ?? '').trim();
    if (logB) {
      const text = readFileSync(logB, 'utf8');
      const mempoolFromPeer = text.split(/\r?\n/).filter((l) => l.includes('[MEMPOOL] Added action') && l.includes('from peer'));
      check('node B\'s own log shows the gossip-ingest path running: '
          + '"[MEMPOOL] Added action … from peer …", the line a few above router.rs:5947',
        mempoolFromPeer.length > 0, { lines: mempoolFromPeer.length });
      if (mempoolFromPeer.length > 0) log(`node B log, last gossip ingest: ${mempoolFromPeer[mempoolFromPeer.length - 1].trim()}`);
    } else {
      log('SHOAL_LOG_B not set — skipping the node-log corroboration (leg 4b). '
        + 'The elimination argument above does not depend on it.');
    }

    // Both clients can now see A's swimmer. NOT read synchronously off the
    // refetch — see `waitForHash`: the event genuinely arrives before the log
    // does, and asserting on the log at event time measures the wrong thing.
    const b1 = await waitForHash(authB, spaceId, roomId, aPresenceId, bSaw ? bRefetchMs : p1Start);
    check(`node B's room log became readable with A's write (${b1.lagMs} ms after B's refetch fired)`,
      b1.lagMs >= 0, { lagMs: b1.lagMs, entries: b1.log.length });
    const aOnB = b1.log.find((e) => e.hash === aPresenceId);
    check('node B\'s client decoded A\'s write, with A\'s author id and A\'s exact vector',
      aOnB !== undefined && aOnB.kind === 'presence' && aOnB.id === alice.publicKeyHex
      && aOnB.vec.x === vecA.x && aOnB.vec.y === vecA.y && aOnB.vec.heading === vecA.heading
      && aOnB.vec.speed === vecA.speed && aOnB.vec.t === vecA.t,
      aOnB);
    check('…and A\'s word rode along the whole way',
      aOnB !== undefined && aOnB.kind === 'presence' && aOnB.say === 'a swims',
      aOnB?.kind === 'presence' ? aOnB.say : undefined);

    // ══ PHASE 2 — B writes on node B; node A must raise it from GOSSIP ════
    const beforeA = wA.refetchAtMs.length;
    const p2Start = Date.now();
    const vecB1: Vec = { x: 1_600, y: 1_400, heading: 0, speed: SPEED_CRUISE, t: p2Start };
    const bId1 = await sendPresence(ctxB, vecB1);
    log(`B wrote presence ${bId1.slice(7, 19)}… to node B only`);

    const aSaw = await waitUntil(() => wA.refetchAtMs.length > beforeA, 20_000);
    const aRefetchMs = aSaw ? wA.refetchAtMs[beforeA] : -1;
    const aElapsed = aSaw ? aRefetchMs - wA.startedAtMs : -1;
    check('node A\'s client refetched after B wrote — the mirror direction', aSaw,
      { refetches: wA.refetchAtMs.length });
    check(`…socket-driven too (${aElapsed} ms after A's watcher started, heartbeat ${POLL_INTERVAL_MS} ms)`,
      aSaw && aElapsed >= 0 && aElapsed < POLL_INTERVAL_MS, { aElapsed, POLL_INTERVAL_MS });
    const writesToAinWindow = publishingCallsTo(authA.endpoint, p2Start, aSaw ? aRefetchMs : Date.now());
    check('node A\'s endpoint received no submit_post/submit_reply between B\'s write and A\'s refetch — '
        + 'so that event, too, came off the gossip path and not off a local submission',
      writesToAinWindow.length === 0, writesToAinWindow);

    // ══ DEAD RECKONING ═══════════════════════════════════════════════════
    // A's view one broadcast behind, versus A's view up to date. Snapshot A's
    // log NOW, while it holds B's first vector and cannot yet hold the second.
    const stale = await waitForHash(authA, spaceId, roomId, bId1, aSaw ? aRefetchMs : p2Start);
    const staleLogOnA = stale.log;
    check(`A's stale snapshot holds B's first vector (readable ${stale.lagMs} ms after A's refetch)`,
      stale.lagMs >= 0 && staleLogOnA.some((e) => e.hash === bId1), { lagMs: stale.lagMs });
    // The room is long-lived and reused across runs, so this is asserted on
    // the exact content id of the write that has not happened yet — never on
    // "no presence with heading 64", which an earlier run would falsify.
    const bId1Ms = staleLogOnA.find((e) => e.hash === bId1)?.ms ?? -1;
    check('…and nothing of B\'s newer than that first vector — which is what makes it a genuinely '
        + 'one-broadcast-stale view rather than an up-to-date one',
      bId1Ms > 0 && !staleLogOnA.some((e) => e.id === bob.publicKeyHex && e.ms > bId1Ms),
      { bId1Ms });

    // The emit cadence is what makes the staleness bounded — so it is exercised
    // rather than assumed. `shouldEmit` must refuse a real change of mind
    // inside the floor and allow it once the floor has passed.
    const turned = (t: number): Vec => ({ x: vecB1.x, y: vecB1.y, heading: 64, speed: SPEED_CRUISE, t });
    check(`shouldEmit REFUSES B's turn inside the ${MIN_EMIT_GAP_MS} ms floor — this is the staleness `
        + 'the tolerance below is derived from, not an accident of timing',
      !shouldEmit(vecB1, turned(p2Start + 1_000), p2Start));
    check('…and allows it once the floor has passed',
      shouldEmit(vecB1, turned(p2Start + MIN_EMIT_GAP_MS), p2Start));

    const waitToFloor = p2Start + MIN_EMIT_GAP_MS + 200 - Date.now();
    if (waitToFloor > 0) await sleep(waitToFloor);

    const beforeA2 = wA.refetchAtMs.length;
    const t2 = Date.now();
    const vecB2: Vec = { x: vecB1.x, y: vecB1.y, heading: 64, speed: SPEED_CRUISE, t: t2 };
    check('B\'s second write really is past the emit floor', t2 - p2Start >= MIN_EMIT_GAP_MS, t2 - p2Start);
    const bId2 = await sendPresence(ctxB, vecB2);
    log(`B turned and wrote presence ${bId2.slice(7, 19)}… (heading ${vecB1.heading} -> ${vecB2.heading})`);
    const aSaw2 = await waitUntil(() => wA.refetchAtMs.length > beforeA2, 20_000);
    check('node A refetched on B\'s turn as well', aSaw2, { refetches: wA.refetchAtMs.length });

    const fresh = await waitForHash(authA, spaceId, roomId, bId2, t2);
    const freshLogOnA = fresh.log;
    const freshLogOnB = await fetchRoomLog(authB, spaceId, roomId);
    check(`A's fresh log holds BOTH of B's vectors (the turn was readable on A ${fresh.lagMs} ms `
        + 'after B authored it, having crossed a real P2P link on the way)',
      fresh.lagMs >= 0 && freshLogOnA.some((e) => e.hash === bId1) && freshLogOnA.some((e) => e.hash === bId2),
      { lagMs: fresh.lagMs });

    // Fold all three views to ONE named instant. Naming the tick rather than
    // reading the wall clock is what makes this comparable at all; it also
    // keeps the fold off PRESENCE_TTL_MS eviction, which would compare two
    // empty worlds and call it a match.
    const drAtMs = t2 + 3_000;
    const stateFreshA = foldShoal(freshLogOnA, drAtMs);
    const stateFreshB = foldShoal(freshLogOnB, drAtMs);
    const stateStaleA = foldShoal(staleLogOnA, drAtMs);

    const posAB = posOf(stateFreshA, bob.publicKeyHex);
    const posBB = posOf(stateFreshB, bob.publicKeyHex);
    const posStale = posOf(stateStaleA, bob.publicKeyHex);
    log(`at ${drAtMs} (tick ${stateFreshA.nowMs - TICK_MS}) — A draws B at ${JSON.stringify(posAB)}, `
      + `B draws itself at ${JSON.stringify(posBB)}, a one-broadcast-stale A would draw it at ${JSON.stringify(posStale)}`);

    check('(a) A\'s position for B and B\'s own position for B are EXACTLY equal — 0 cu, not "close". '
        + 'Nothing on the mine -> sign -> submit -> gossip -> mempool -> get_replies path across two nodes '
        + 'perturbed a single field of the vector',
      posAB !== null && posBB !== null && posAB.x === posBB.x && posAB.y === posBB.y,
      { posAB, posBB });

    const staleErr = posStale && posBB ? distCu(posStale, posBB) : Number.NaN;
    log(`(b) one-broadcast-stale error: ${staleErr.toFixed(1)} cu; tolerance ${DR_TOLERANCE_CU} cu `
      + `(= 2 * SPEED_DART(${SPEED_DART}) * MIN_EMIT_GAP_MS(${MIN_EMIT_GAP_MS}) / 1000)`);
    check('(b) the stale error is NONZERO — otherwise the bound below would be satisfied by a '
        + 'scenario in which A was never actually behind, and would prove nothing',
      staleErr > 0, staleErr);
    check(`(b) …and within the derived tolerance: ${staleErr.toFixed(1)} cu <= ${DR_TOLERANCE_CU} cu`,
      staleErr <= DR_TOLERANCE_CU, { staleErr, DR_TOLERANCE_CU });

    // ── close the live window ────────────────────────────────────────────
    // Stopped HERE, before the long finalization wait, and the window they were
    // open for is asserted shorter than one poll interval. That is what makes
    // every claim above airtight rather than lucky: with no tick possible for
    // ANY watcher, every refetch came from a content_new event, and the
    // control's zero cannot be explained by it never having had a chance.
    const windowMs = Date.now() - wCtl.startedAtMs;
    wA.stop(); wB.stop(); wCtl.stop();
    check(`no heartbeat tick could have fired for any watcher (window ${windowMs} ms < `
        + `poll interval ${POLL_INTERVAL_MS} ms)`,
      windowMs < POLL_INTERVAL_MS, { windowMs, POLL_INTERVAL_MS });
    check('the wrong-space control on node B never refetched once, though it sat on the same socket '
        + 'stream and received the same events — the space filter is doing real work',
      wCtl.refetchAtMs.length === 0, { refetches: wCtl.refetchAtMs.length });
    // A zero is only worth something next to a non-zero measured the same way.
    // Both of the following are POSITIVE controls for instruments that this
    // run's central claims read a zero out of; without them, a control watcher
    // whose socket never connected, and an RPC recorder whose endpoint match
    // never fired, would both report exactly what a pass looks like.
    check('…and that zero is measured against a watcher that demonstrably works: watcher B, on the '
        + 'SAME node and the same socket path, refetched over the same window',
      wB.refetchAtMs.length > 0, { b: wB.refetchAtMs.length, control: wCtl.refetchAtMs.length });
    const laterWritesToB = publishingCallsTo(authB.endpoint, p2Start, Date.now());
    check('…and the RPC recorder is not blind either: node B\'s endpoint DID record submit_* calls '
        + 'later in the run, when B itself wrote — so the zero in phase 1 is a measured zero, not a '
        + 'filter that can never match',
      laterWritesToB.length > 0, { later: laterWritesToB.length });
    log(`refetch tallies — A: ${wA.refetchAtMs.length}, B: ${wB.refetchAtMs.length}, control: ${wCtl.refetchAtMs.length}`);

    // ── the writes must SURVIVE block formation, on BOTH nodes ────────────
    const moveIds = [aPresenceId, bId1, bId2];
    const FINALIZE_TIMEOUT_MS = 240_000;
    log(`waiting up to ${FINALIZE_TIMEOUT_MS / 1000}s for all three moves to finalize on BOTH nodes…`);
    const deadline = Date.now() + FINALIZE_TIMEOUT_MS;
    let hA = await replyHeights(authA, roomId);
    let hB = await replyHeights(authB, roomId);
    const done = (h: Map<string, number | null>) => moveIds.every((m) => (h.get(m) ?? null) !== null);
    while (Date.now() < deadline && !(done(hA) && done(hB))) {
      await sleep(3_000);
      hA = await replyHeights(authA, roomId);
      hB = await replyHeights(authB, roomId);
    }
    check('all three moves survive block formation on node A (not purged by the builder\'s '
        + 'authorization gate) and carry a block height',
      done(hA), moveIds.map((m) => [m.slice(7, 19), hA.get(m) ?? null]));
    check('…and on node B, independently',
      done(hB), moveIds.map((m) => [m.slice(7, 19), hB.get(m) ?? null]));
    log(`heights on A: ${moveIds.map((m) => `${m.slice(7, 15)}=${hA.get(m) ?? 'pending'}`).join(' ')}`);
    log(`heights on B: ${moveIds.map((m) => `${m.slice(7, 15)}=${hB.get(m) ?? 'pending'}`).join(' ')}`);

    // ── one sea: identical fingerprints from two independent nodes ────────
    const finalA = await fetchRoomLog(authA, spaceId, roomId);
    const finalB = await fetchRoomLog(authB, spaceId, roomId);
    const foldAt = t2 + 1_000;
    const sA = foldShoal(finalA, foldAt);
    const sB = foldShoal(finalB, foldAt);
    const fpA = fingerprint(sA);
    const fpB = fingerprint(sB);
    log(`folded ${finalA.length} entries (A) / ${finalB.length} entries (B) to ${foldAt}, epoch ${sA.epoch}`);
    check('the two nodes\' clients fold to IDENTICAL world fingerprints', fpA === fpB,
      fpA === fpB ? undefined : { fpA: fpA.slice(0, 400), fpB: fpB.slice(0, 400) });
    check('…over a world that actually has BOTH swimmers in it (a fingerprint match over an empty '
        + 'world proves nothing)',
      sA.fish.has(alice.publicKeyHex) && sA.fish.has(bob.publicKeyHex)
      && sB.fish.has(alice.publicKeyHex) && sB.fish.has(bob.publicKeyHex),
      { a: [...sA.fish.keys()].map((k) => k.slice(0, 8)), b: [...sB.fish.keys()].map((k) => k.slice(0, 8)) });
  } finally {
    wA.stop(); wB.stop(); wCtl.stop();
  }

  // ── the two windows ──────────────────────────────────────────────────────
  // Everything above is this same machinery with no canvas in front of it. The
  // URLs are printed rather than documented because six query parameters
  // (three of them long hex strings) are exactly the kind of thing a recipe
  // gets subtly wrong — and a window with half a configuration renders an
  // empty sea that looks just like a node with nobody in it.
  const uiBase = (process.env.SHOAL_UI ?? 'http://localhost:5196').trim().replace(/\/+$/, '');
  const cookieA = (process.env.SHOAL_COOKIE_A ?? '').trim();
  const cookieB = (process.env.SHOAL_COOKIE_B ?? '').trim();
  const windowUrl = (rpc: string, cookieFile: string, id: string, who: string) => {
    const q = new URLSearchParams({ rpc, space: spaceId, room: roomId, id, who });
    if (cookieFile) q.set('cookie', readFileSync(cookieFile, 'utf8').trim());
    return `${uiBase}/?${q.toString()}`;
  };
  console.log('\n[two] two windows, one sea — `npm run dev`, then open one of these in each window:');
  console.log(`  A: ${windowUrl(authA.endpoint, cookieA, alice.publicKeyHex, 'alice')}`);
  console.log(`  B: ${windowUrl(authB.endpoint, cookieB, bob.publicKeyHex, 'bob')}`);

  console.log(`\n[two] ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[two] FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
