/**
 * The Shoal — two-client regtest smoke (plan 2b Task 6, Step 2).
 *
 * This is the only place the whole bridge runs together against a real node:
 * space + room setup, two independent identities, mine/sign/submit
 * (`shoalSend`), the live `content_new` channel (`shoalLive`), the log
 * assembly (`shoalRoom`) and the deterministic fold (`shoalEngine`). Every
 * check prints PASS or FAIL; the process exits non-zero if any check failed
 * or anything threw. It never fakes a pass.
 *
 * ── How to start the node this script expects ──────────────────────────────
 *
 * From the repo root, in a separate terminal (this script does NOT spawn or
 * manage the node — it talks to an already-running one):
 *
 *   # 1. one-time: give the node an identity (it refuses to start without one)
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoalnode identity create
 *
 *   # 2. run it (RPC listens on p2p port + 1, i.e. 29736)
 *   SWIMCHAIN_PASSWORD=smoketest123 ./target/release/sw.exe \
 *       --regtest --data-dir=/tmp/shoalnode node start --listen 127.0.0.1:29735
 *
 * Note the data dir gets a `-regtest` suffix, so the cookie lands at
 * `/tmp/shoalnode-regtest/.cookie`. Then, from `shoal-client/`:
 *
 *   SHOAL_RPC=http://127.0.0.1:29736 \
 *   SHOAL_COOKIE_FILE=/tmp/shoalnode-regtest/.cookie \
 *   npm run smoke
 *
 * It is idempotent: `create_space` on an app-namespaced name returns the
 * existing space, and the room post is looked up by its (deterministic)
 * content id before being created. Re-running just appends more moves to the
 * same room, which is exactly what a long-lived room does anyway.
 *
 * ── Sponsorship: why the genesis seed is not optional here ─────────────────
 *
 * Regtest bypasses the sponsorship gate at RPC INGESTION outright
 * (`check_identity_sponsored`, src/rpc/methods.rs:753-759, returns Ok
 * immediately when network == "regtest"), so an unsponsored identity's writes
 * are accepted, land in the mempool, and come straight back out of
 * `get_replies` (which merges the mempool in, methods.rs:9473-9616). Every
 * assertion below passes with unsponsored identities. It is a trap.
 *
 * BLOCK INCLUSION is gated separately and is NOT bypassed on regtest: the
 * builder drops any action whose author fails `is_authorized_in_space`
 * (src/blocks/builder.rs:974-995) and purges it from the mempool. Observed
 * directly on the first run of this script, before sponsorship was added:
 *
 *   [BLOCK_BUILDER] Excluding Reply by 66332201bee1e107 from block:
 *                   author not authorized in space 055b0bffdca20488
 *   [BLOCK_BUILDER] Removed 6 invalid actions from thread 7929b99f590b07ff
 *
 * — so every move silently evaporated at the next block (~45 s), and a fold
 * that had just agreed perfectly would have been folding a room that no
 * longer existed. This is precisely the failure the plan brief warned about.
 *
 * So both identities are sponsored by the testnet/regtest genesis identity
 * before anything is written, via `register_sponsored_identity` (pure RPC —
 * the sponsor's signature is made HERE, so the node never needs to hold the
 * genesis key, and `sw sponsor` is never shelled out to). And the run does
 * not stop at "the moves are visible": it waits for a block and asserts they
 * are still there WITH a block height. That last check is the one that turns
 * this from a smoke that would have passed a broken bridge into one that
 * catches it.
 *
 * The genesis seed used is the TESTNET/dev one, which is public in this repo
 * by design (GENESIS_IDENTITY.md) and is network-gated so it can never be a
 * sponsor on mainnet (`genesis_list.rs:99-108` selects MAINNET_GENESIS_LIST
 * on mainnet and the dev list on testnet/regtest).
 *
 * ── The assertion this script exists to make ───────────────────────────────
 *
 * "B eventually sees A" is far too weak: `startLive`'s poll timer would
 * rescue a completely dead socket, and the single highest-value defect this
 * smoke can catch — a space id in the wrong FORM — degrades the live channel
 * to exactly that rescued-by-polling behaviour while every other observable
 * stays perfectly healthy (see `isWireSpaceId` in shoalSend.ts).
 *
 * So the live assertion is made to discriminate, two ways:
 *
 *  1. **The poll timer is moved out of the way.** Every watcher runs with
 *     `pollIntervalMs = 60_000`, and `startLive`'s heartbeat is a plain
 *     `setInterval(pollIntervalMs)` started at construction — so its FIRST
 *     tick cannot land until 60 s after the watcher started. `nextAction`
 *     only ever sets `refetch` from three places: a `content` event whose
 *     space matches, a `tick` while polling, and a `tick` during detected
 *     silence. The latter two are unreachable before the first tick. Every
 *     refetch is therefore timestamped and checked against the watcher's own
 *     start time; a refetch at elapsed < 60 s is *provably* socket-driven,
 *     and the script prints the actual elapsed ms so the margin is visible
 *     rather than asserted in the dark.
 *
 *  2. **A negative control runs alongside.** A third watcher subscribes to
 *     the SAME node and the SAME room with the space id in its raw 32-char
 *     hex form instead of bech32m. It must record ZERO refetches across the
 *     entire run. Without it, check (1) would still pass if `nextAction`'s
 *     space filter were removed entirely — the control is what proves the
 *     filter is doing real work and that the form this client passes is the
 *     form the node's events actually carry, end to end.
 */
import { readFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';

import { rpcCall, type RpcAuth } from '../src/lib/shoalRpc';
import {
  ACTION_TYPE_POST,
  ACTION_TYPE_SPACE_CREATION,
  isWireSpaceId,
  mineAndSignAction,
  powProfileFor,
  sendEat,
  sendPresence,
  type SendCtx,
  type SignFn,
} from '../src/lib/shoalSend';
import { fetchRoomLog } from '../src/lib/shoalRoom';
import { startLive } from '../src/lib/shoalLive';
import { foldShoal } from '../src/lib/shoalEngine';
import { fingerprint } from '../src/lib/shoalFixtures';
import { BLOOM_COLS, SPEED_CRUISE } from '../src/lib/shoalConst';
import type { LogEntry, Presence, Vec } from '../src/lib/shoalTypes';

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
  console.log(`[smoke] ${msg}`);
}

/** Poll `pred` until it holds or `timeoutMs` elapses. Returns whether it held.
 *  `Date.now()` is fine here — this is a script, not `src/lib/` code. */
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
// Two independent identities, generated locally
// ---------------------------------------------------------------------------

interface Player {
  readonly label: string;
  readonly publicKeyHex: string;
  readonly sign: SignFn;
}

/**
 * A deterministic ed25519 identity from a label — same keys on every run, so
 * a re-run's moves fold as the SAME two swimmers rather than littering the
 * room with a fresh pair each time.
 *
 * Uses only `node:crypto` (no new dependency): an ed25519 PKCS#8 private key
 * is the fixed 16-byte DER prefix below followed by the raw 32-byte seed, and
 * the raw public key is the last 32 bytes of the SPKI export. Both identities
 * are purely client-side — the node never holds them, which is the point:
 * two clients, one node, and the node's own identity is not either of them.
 */
function player(label: string): Player {
  return playerFromSeed(label, createHash('sha256').update(`shoal-smoke:${label}`).digest());
}

function playerFromSeed(label: string, seed: Buffer): Player {
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  const publicKeyHex = spki.subarray(spki.length - 32).toString('hex');
  return {
    label,
    publicKeyHex,
    sign: async (msg: Uint8Array): Promise<Uint8Array> => new Uint8Array(edSign(null, Buffer.from(msg), priv)),
  };
}

// ---------------------------------------------------------------------------
// Sponsorship (the block-inclusion gate — see the module header)
// ---------------------------------------------------------------------------

/** The TESTNET/dev genesis identity, published in GENESIS_IDENTITY.md and
 *  hardcoded in `src/sponsorship/genesis_list.rs`. Regtest shares the testnet
 *  genesis list; the network gate at genesis_list.rs:99-108 means this key can
 *  never sponsor on mainnet, which is exactly why it is safe to have here. */
const GENESIS_SEED_HEX = '11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471';
const GENESIS_PUBKEY_HEX = '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420';

/**
 * The onboarding PoW `register_sponsored_identity` requires (methods.rs
 * :16494-16524): at least one leading ZERO BYTE of
 * `sha256(nonce_space(32) || nonce.to_le_bytes())`. The node derives the work
 * itself from the nonce rather than trusting a number, so this must be real —
 * it is just cheap (~256 tries expected).
 */
function mineOnboardingPow(): { nonceSpaceHex: string; nonce: number } {
  const nonceSpace = createHash('sha256').update(`shoal-smoke-onboard:${Date.now()}`).digest();
  for (let nonce = 0; ; nonce++) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(nonce));
    if (createHash('sha256').update(Buffer.concat([nonceSpace, buf])).digest()[0] === 0) {
      return { nonceSpaceHex: nonceSpace.toString('hex'), nonce };
    }
  }
}

/**
 * Register `sponsee` as globally sponsored by the genesis identity, so the
 * block builder will actually include its actions. Idempotent: a second run
 * gets "Identity is already registered" back, which is a success for our
 * purposes, not a failure.
 *
 * The sponsor signature covers `sponsee(32) || timestamp as u64 BIG-endian(8)`
 * for a global grant (`Action::sponsor_sig_message`, src/blocks/action.rs:648).
 * A scope would append the 32-byte space id; a GLOBAL grant is used here
 * deliberately — `is_authorized_in_space` (src/sponsorship/storage.rs:94-105)
 * returns true for a global grant in any space, and a scoped grant would have
 * to name the space id in its padded 32-byte form, one more format to get
 * subtly wrong for no gain in a smoke test.
 */
async function sponsorViaGenesis(auth: RpcAuth, genesis: Player, sponsee: Player): Promise<'registered' | 'already'> {
  const timestamp = Math.floor(Date.now() / 1000);
  const msg = Buffer.alloc(40);
  Buffer.from(sponsee.publicKeyHex, 'hex').copy(msg, 0);
  msg.writeBigUInt64BE(BigInt(timestamp), 32);
  const signature = Buffer.from(await genesis.sign(new Uint8Array(msg))).toString('hex');
  const pow = mineOnboardingPow();

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
// bech32 -> hex, for the negative control
// ---------------------------------------------------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * The raw 32-char hex form of a bech32m `sp1…` space id — the form
 * `decode_space_id` (methods.rs:136-182) accepts perfectly well on every
 * request, and that `shoalLive`'s event filter can never match. Used ONLY to
 * build the negative-control watcher.
 *
 * No checksum verification: the input is a space id the node just handed us.
 */
function spaceIdToHex(spaceId: string): string {
  const words: number[] = [];
  for (const c of spaceId.slice(spaceId.lastIndexOf('1') + 1)) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v === -1) throw new Error(`spaceIdToHex: bad bech32 char ${JSON.stringify(c)}`);
    words.push(v);
  }
  words.length -= 6; // strip the checksum
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  // byte 0 is the version byte; the space id proper is the next 16.
  return bytes.slice(1, 17).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Live watchers
// ---------------------------------------------------------------------------

/** Long enough that `startLive`'s heartbeat cannot fire inside the run — see
 *  the module header. Every refetch observed below this elapsed time came
 *  from a `content_new` event, by construction. */
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

/**
 * A SMOKE RUN MUST NOT WRITE INTO THE WATER PEOPLE PLAY IN, and neither half of
 * that is achieved by the space name alone.
 *
 * The space is `@shoal:smoke` rather than `shellConfig.ts`'s `WATER_SPACE_NAME`
 * on purpose — this file is not the minter, `scripts/mint-water.ts` is, and it
 * imports that constant so the real water's name lives in exactly one place.
 *
 * THE ROOM TEXT HAD TO CHANGE TOO, and this is the part that was quietly wrong.
 * `submit_post` derives a post's content id from `sha256("{title}\n\n{body}")`
 * with NO space in the preimage (src/rpc/methods.rs:2086-2089), and
 * `get_replies` is keyed on that parent content id alone (src/rpc/types.rs:644)
 * — so a smoke room whose title and body matched the real water's WOULD BE the
 * real water's room, in a different space, sharing one reply set. This file's
 * title and body were character-for-character `shellConfig.ts`'s until now, so
 * the first node to run this smoke and then mint `@shoal:main` would have had
 * every smoke move show up in the real sea. `two-client-smoke.ts` avoids the
 * same trap by having its own text; now so does this.
 */
const SPACE_NAME = '@shoal:smoke';
const ROOM_TITLE = 'The Shoal (smoke)';
const ROOM_BODY = 'a room for one node to talk to itself in';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * `create_space` is idempotent for an app-namespaced (`@app:display`) name —
 * a second call for the same name returns the existing space id — so this is
 * safe on every run without a pre-check.
 *
 * The PoW preimage is `sha256(name)`, recomputed SERVER-side (methods.rs
 * `create_space`). That is NOT the `space:`-prefixed scheme
 * `@swimchain/react`'s `createSpaceChallenge` helper mines against; using
 * that helper here would produce a hash the node can never verify. Recorded
 * as a hard-won build fact in project_the_trench, re-verified here.
 *
 * Done over RPC rather than `sw space create`, deliberately: the CLI opens
 * the SAME sled data dir the running node already holds locked, and the
 * second process hangs on the lock indefinitely rather than failing fast
 * (also project_the_trench).
 */
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
    // Not there yet (or not retrievable) — create it below.
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

// ---------------------------------------------------------------------------
// Assertions over a fetched log
// ---------------------------------------------------------------------------

function presenceBy(logEntries: readonly LogEntry[], contentId: string): Presence | undefined {
  const e = logEntries.find((x) => x.hash === contentId);
  return e && e.kind === 'presence' ? e : undefined;
}

/**
 * `block_height` per reply, straight from `get_replies` — the one field
 * `fetchRoomLog` deliberately drops on its way to a `LogEntry` (a room's log
 * is chain-plus-mempool reality, so the fold has no business knowing which a
 * given entry is). This script needs it for exactly one purpose: proving the
 * writes were not silently purged at block formation. `null` means still
 * pending; a number means finalized.
 */
async function replyHeights(auth: RpcAuth, roomId: string): Promise<Map<string, number | null>> {
  const res = await rpcCall<{ replies: Array<{ content_id: string; block_height: number | null }> }>(
    auth, 'get_replies', { content_id: roomId, limit: 100_000, depth_limit: 0 },
  );
  return new Map(res.replies.map((r) => [r.content_id, r.block_height]));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const endpoint = (process.env.SHOAL_RPC ?? '').trim();
  const cookieFile = (process.env.SHOAL_COOKIE_FILE ?? '').trim();
  if (!endpoint) {
    throw new Error('regtest-smoke requires SHOAL_RPC (and normally SHOAL_COOKIE_FILE) — see this file\'s header');
  }
  const authHeader = cookieFile
    ? `Basic ${Buffer.from(`__cookie__:${readFileSync(cookieFile, 'utf8').trim()}`, 'utf8').toString('base64')}`
    : null;
  const auth: RpcAuth = { endpoint, authHeader };

  log(`endpoint=${endpoint}`);
  log(`cookieFile=${cookieFile || '(none)'}`);

  const info = await rpcCall<{ network?: string; block_height?: number }>(auth, 'get_info', {});
  log(`node network=${info.network} block_height=${info.block_height}`);
  check('node is in regtest mode', info.network === 'regtest', info.network);

  const profile = await powProfileFor(auth);
  log(`pow profile: network=${profile.network} argon2id=${profile.config.memoryKib}KiB/` +
      `${profile.config.iterations}iter/${profile.config.parallelism}par`);
  check('PoW profile detected as regtest (1 MiB / 1 / 1)',
    profile.network === 'regtest' && profile.config.memoryKib === 1024
      && profile.config.iterations === 1 && profile.config.parallelism === 1,
    profile);
  // The cache is the whole point of detecting once (see shoalSend's header).
  //
  // This check used to be `(await powProfileFor(auth)) === profile`, WHICH
  // COULD NOT FAIL: `profileFor()` returns module-level singletons, so the
  // identity comparison holds whether or not `profileCache` exists at all.
  // Deleting the cache entirely still printed PASS — it proved the opposite of
  // what its comment claimed. The only thing that actually distinguishes a
  // cache from no cache is a ROUND TRIP, so count them: wrap `fetch` for the
  // duration of a second `powProfileFor` and assert ZERO new `get_info` calls
  // go out. Delete the cache and this reads 1 and fails.
  const realFetch = globalThis.fetch;
  let getInfoCalls = 0;
  globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    if (body.includes('"get_info"')) getInfoCalls++;
    return realFetch(input, init);
  }) as typeof realFetch;
  let profileAgain: typeof profile;
  try {
    profileAgain = await powProfileFor(auth);
  } finally {
    globalThis.fetch = realFetch;
  }
  check('the PoW profile is cached per endpoint (a re-detect makes ZERO new get_info round trips)',
    getInfoCalls === 0 && profileAgain === profile, { getInfoCalls, same: profileAgain === profile });
  // The counter itself must be discriminating: one deliberate uncached call has
  // to move it, or `getInfoCalls === 0` above would pass for the wrong reason.
  globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    if (body.includes('"get_info"')) getInfoCalls++;
    return realFetch(input, init);
  }) as typeof realFetch;
  try {
    await rpcCall<{ network?: string }>(auth, 'get_info', {});
  } finally {
    globalThis.fetch = realFetch;
  }
  check('…and the round-trip counter is real: one deliberate uncached get_info moves it to 1',
    getInfoCalls === 1, { getInfoCalls });

  const alice = player('alice');
  const bob = player('bob');
  log(`A (alice) = ${alice.publicKeyHex}`);
  log(`B (bob)   = ${bob.publicKeyHex}`);
  check('the two clients are genuinely different identities', alice.publicKeyHex !== bob.publicKeyHex);

  // ── sponsorship, BEFORE anything is written ──────────────────────────────
  const genesis = playerFromSeed('genesis', Buffer.from(GENESIS_SEED_HEX, 'hex'));
  check('the documented genesis seed derives the documented genesis public key',
    genesis.publicKeyHex === GENESIS_PUBKEY_HEX, { got: genesis.publicKeyHex, want: GENESIS_PUBKEY_HEX });

  for (const p of [alice, bob]) {
    // To re-verify that the finalization checks below are discriminating
    // rather than decorative, skip this call and re-run against a fresh data
    // dir: the block builder purges both authors' moves and the run ends with
    // 5 failures and a room of 0 entries (measured 2026-07-28).
    const outcome = await sponsorViaGenesis(auth, genesis, p);
    check(`${p.label} holds a real genesis sponsorship`, outcome === 'registered' || outcome === 'already', outcome);
    log(`sponsorship for ${p.label}: ${outcome}`);
  }
  // Deliberately NOT verified with `get_sponsorship_info`: that method
  // short-circuits to `is_sponsored: true` for EVERY identity on regtest
  // (methods.rs:16894-16911), so asserting on it here would pass whether or
  // not the registration above ever happened — a vacuous check. The real,
  // non-bypassable evidence that these identities are sponsored is that their
  // writes survive block formation, which is asserted at the end of the run.

  // ── room setup ───────────────────────────────────────────────────────────
  const spaceId = await createOrReuseSpace(auth, alice, Date.now());
  log(`space ${SPACE_NAME} -> ${spaceId}`);
  check('create_space returned the bech32m wire form (sp1…, 37 chars)', isWireSpaceId(spaceId), spaceId);

  const spaceHex = spaceIdToHex(spaceId);
  log(`same space in raw hex (the wrong form) -> ${spaceHex}`);
  check('the hex form is NOT the wire form', !isWireSpaceId(spaceHex), spaceHex);

  // `startLive` now REFUSES the hex form outright. It used to accept it and
  // silently degrade to poll-only — the highest-value defect this smoke exists
  // to catch, and the one no unit test could see. Asserted against the live
  // path specifically (the write path has always checked; `startLive` was the
  // module the check protected and the module that lacked it).
  {
    let threw: unknown = null;
    try {
      watch(auth, 'hex-refused', spaceHex).stop();
    } catch (e) { threw = e; }
    check('startLive REFUSES a raw-hex space id instead of silently degrading to polling',
      threw instanceof RangeError, threw instanceof Error ? threw.message : threw);
  }

  // The end-to-end negative control still runs, but now with a WELL-FORMED
  // space id that simply is not ours: the real one with a single character
  // rotated inside the bech32 charset. It passes `isWireSpaceId` (still 37
  // chars, still `sp1`, still in-charset), so `startLive` accepts it, the
  // socket connects, it receives every `content_new` this run produces — and
  // must record ZERO refetches, because `nextAction` compares the FULL string.
  // That is what proves the filter does real work and that the form this
  // client passes is the form the node's events carry, end to end.
  const rotate = (c: string) => BECH32_CHARSET[(BECH32_CHARSET.indexOf(c) + 1) % BECH32_CHARSET.length];
  const wrongSpaceId = spaceId.slice(0, 36) + rotate(spaceId[36]);
  log(`well-formed but different space id, for the negative control -> ${wrongSpaceId}`);
  check('the control space id is well-formed', isWireSpaceId(wrongSpaceId), wrongSpaceId);
  check('…and is genuinely a different string from ours', wrongSpaceId !== spaceId, wrongSpaceId);

  const roomId = await createOrReuseRoom(auth, alice, spaceId, Date.now());

  const ctxA: SendCtx = {
    auth, spaceId, roomContentId: roomId, authorIdHex: alice.publicKeyHex, sign: alice.sign, powProfile: profile,
  };
  const ctxB: SendCtx = {
    auth, spaceId, roomContentId: roomId, authorIdHex: bob.publicKeyHex, sign: bob.sign, powProfile: profile,
  };

  // ── the live channel ─────────────────────────────────────────────────────
  const wA = watch(auth, 'A', spaceId);
  const wB = watch(auth, 'B', spaceId);
  // The negative control. To re-verify that this control is genuinely
  // discriminating rather than merely a socket that never worked, change
  // `wrongSpaceId` to `spaceId` here and re-run: the tally must flip from 0 to
  // the same count A and B see, and this check must fail. Nothing else about
  // the watcher changes.
  const wHex = watch(auth, 'wrong-space-control', wrongSpaceId);
  log('three live watchers started (A, B, and a wrong-space-id negative control); ' +
      `poll interval ${POLL_INTERVAL_MS} ms, so no tick can fire during this run`);
  // Give the sockets time to connect and send their `subscribe` frame before
  // the first write, or the event we are trying to observe is published
  // before anyone is listening.
  await sleep(2_000);

  try {
    // ── A emits, B sees it live ──────────────────────────────────────────────
    const beforeB = wB.refetchAtMs.length;
    const vecA: Vec = { x: 1_000, y: 1_000, heading: 0, speed: SPEED_CRUISE, t: Date.now() };
    const aPresenceId = await sendPresence(ctxA, vecA, 'a swims');
    log(`A presence -> ${aPresenceId}`);

    const bSawEvent = await waitUntil(() => wB.refetchAtMs.length > beforeB, 20_000);
    check('B got a live refetch after A wrote', bSawEvent, { refetches: wB.refetchAtMs.length });
    const bElapsed = bSawEvent ? wB.refetchAtMs[beforeB] - wB.startedAtMs : -1;
    log(`B's first refetch landed ${bElapsed} ms after its watcher started ` +
        `(poll interval ${POLL_INTERVAL_MS} ms)`);
    check(
      `that refetch was socket-driven, not poll-rescued (${bElapsed} ms < ${POLL_INTERVAL_MS} ms, ` +
      'before B\'s heartbeat could ever have fired)',
      bSawEvent && bElapsed >= 0 && bElapsed < POLL_INTERVAL_MS,
      { bElapsed, POLL_INTERVAL_MS },
    );

    const logB1 = await fetchRoomLog(auth, spaceId, roomId);
    const aSeenByB = presenceBy(logB1, aPresenceId);
    check('B decoded A\'s write as a presence entry', aSeenByB !== undefined, { entries: logB1.length });
    check('…with A\'s author id', aSeenByB?.id === alice.publicKeyHex, { got: aSeenByB?.id, want: alice.publicKeyHex });
    check('…and A\'s exact vector round-tripped',
      aSeenByB !== undefined
        && aSeenByB.vec.x === vecA.x && aSeenByB.vec.y === vecA.y
        && aSeenByB.vec.heading === vecA.heading && aSeenByB.vec.speed === vecA.speed
        && aSeenByB.vec.t === vecA.t && aSeenByB.ms === vecA.t,
      aSeenByB?.vec);
    check('…and A\'s speech rode along', aSeenByB?.say === 'a swims', aSeenByB?.say);

    // ── B emits, A sees it live ─────────────────────────────────────────────
    const beforeA = wA.refetchAtMs.length;
    const vecB: Vec = { x: 1_100, y: 1_000, heading: 128, speed: SPEED_CRUISE, t: Date.now() };
    const bPresenceId = await sendPresence(ctxB, vecB);
    log(`B presence -> ${bPresenceId}`);

    const aSawEvent = await waitUntil(() => wA.refetchAtMs.length > beforeA, 20_000);
    check('A got a live refetch after B wrote', aSawEvent, { refetches: wA.refetchAtMs.length });
    const aElapsed = aSawEvent ? wA.refetchAtMs[beforeA] - wA.startedAtMs : -1;
    check(
      `that refetch was socket-driven too (${aElapsed} ms < ${POLL_INTERVAL_MS} ms)`,
      aSawEvent && aElapsed >= 0 && aElapsed < POLL_INTERVAL_MS,
      { aElapsed, POLL_INTERVAL_MS },
    );

    const logA1 = await fetchRoomLog(auth, spaceId, roomId);
    const bSeenByA = presenceBy(logA1, bPresenceId);
    check('A decoded B\'s write as a presence entry', bSeenByA !== undefined, { entries: logA1.length });
    check('…with B\'s author id', bSeenByA?.id === bob.publicKeyHex, { got: bSeenByA?.id, want: bob.publicKeyHex });
    check('…and no `say` field, because B sent none', bSeenByA?.say === undefined, bSeenByA?.say);

    // ── an eat claim, so the other wire form is exercised too ───────────────
    const eatMs = Date.now();
    // The bloom cell nearest B's position: 1100/128 = 8, 1000/128 = 7.
    const cell = 7 * BLOOM_COLS + 8;
    const bEatId = await sendEat(ctxB, cell, eatMs);
    log(`B eat claim (cell ${cell}) -> ${bEatId}`);

    // ── close the live window, and check the negative control inside it ─────
    // The watchers are stopped HERE, before the long finalization wait below,
    // and the window they were open for is asserted to be shorter than one
    // poll interval. That is what makes both live claims airtight rather than
    // lucky: with no tick possible for ANY watcher, every refetch A and B saw
    // must have come from a `content_new` event, and the hex control's zero
    // cannot be explained away by it simply not having been given a chance.
    //
    // This is not hypothetical tidiness — it was found by running the script
    // with sponsorship disabled: the finalization wait pushed the run past
    // 60 s, the heartbeat fired, `nextAction`'s silence detection refetched,
    // and the hex control recorded 2 refetches while still being completely
    // correct about never having matched an event.
    const watchWindowMs = Date.now() - wHex.startedAtMs;
    wA.stop();
    wB.stop();
    wHex.stop();
    check(
      `no heartbeat tick could have fired for any watcher (window ${watchWindowMs} ms < ` +
      `poll interval ${POLL_INTERVAL_MS} ms), so every refetch below is socket-driven`,
      watchWindowMs < POLL_INTERVAL_MS,
      { watchWindowMs, POLL_INTERVAL_MS },
    );
    check('the wrong-space watcher never once refetched — the live channel really is ' +
          'filtering on the FULL space id the node\'s events carry, not merely on their shape',
      wHex.refetchAtMs.length === 0,
      { refetches: wHex.refetchAtMs.length });
    log(`refetch tallies — A: ${wA.refetchAtMs.length}, B: ${wB.refetchAtMs.length}, ` +
        `wrong-space-control: ${wHex.refetchAtMs.length}`);

    // ── the writes must SURVIVE block formation ─────────────────────────────
    // Not a nicety: unsponsored authors are dropped by the block builder and
    // purged from the mempool, so a room that folded perfectly at t+2 s is
    // simply gone at t+45 s. See the module header. Regtest forms a block
    // roughly every 45 s, so this allows a few intervals.
    const moveIds = [aPresenceId, bPresenceId, bEatId];
    const FINALIZE_TIMEOUT_MS = 180_000;
    log(`waiting up to ${FINALIZE_TIMEOUT_MS / 1000}s for the three moves to finalize into a block…`);
    const finalizeDeadline = Date.now() + FINALIZE_TIMEOUT_MS;
    let heights = await replyHeights(auth, roomId);
    while (Date.now() < finalizeDeadline
           && !moveIds.every((h) => heights.has(h) && heights.get(h) !== null)) {
      await sleep(3_000);
      heights = await replyHeights(auth, roomId);
    }
    check('all three moves are still in the room after block formation (not purged by the ' +
          'block builder\'s authorization gate)',
      moveIds.every((h) => heights.has(h)),
      moveIds.map((h) => [h.slice(7, 19), heights.has(h)]));
    check('…and every one of them carries a block height, i.e. it actually finalized on chain',
      moveIds.every((h) => (heights.get(h) ?? null) !== null),
      moveIds.map((h) => [h.slice(7, 19), heights.get(h) ?? null]));
    log(`block heights: ${moveIds.map((h) => `${h.slice(7, 15)}=${heights.get(h) ?? 'pending'}`).join(' ')}`);

    // ── both clients fold the same room to the same world ───────────────────
    // Two genuinely independent reads, folded to one shared tick. Nothing is
    // written between them, so any difference is a real divergence.
    //
    // The tick is `eatMs + 1000`, not `Date.now()`: the wait above can easily
    // outlast PRESENCE_TTL_MS (90 s), which would evict both swimmers and
    // leave the fingerprints matching over an empty world — a check that
    // passes for the wrong reason. A deterministic fold should name its tick
    // anyway rather than inherit whatever the wall clock happens to say.
    const logForA = await fetchRoomLog(auth, spaceId, roomId);
    const logForB = await fetchRoomLog(auth, spaceId, roomId);
    const untilMs = eatMs + 1_000;

    check('both clients fetched a log containing all three writes',
      [aPresenceId, bPresenceId, bEatId].every((h) => logForA.some((e) => e.hash === h))
      && [aPresenceId, bPresenceId, bEatId].every((h) => logForB.some((e) => e.hash === h)),
      { a: logForA.length, b: logForB.length });

    const eat = logForA.find((e) => e.hash === bEatId);
    check('B\'s eat claim decoded as an eat entry, with B\'s author id and the ms it was authored at',
      eat?.kind === 'eat' && eat.id === bob.publicKeyHex && eat.cell === cell && eat.ms === eatMs, eat);

    const stateA = foldShoal(logForA, untilMs);
    const stateB = foldShoal(logForB, untilMs);
    const fpA = fingerprint(stateA);
    const fpB = fingerprint(stateB);
    log(`fold covered ${logForA.length} entries up to ${untilMs} (epoch ${stateA.epoch})`);
    check('both clients fold the same log to IDENTICAL world fingerprints', fpA === fpB,
      fpA === fpB ? undefined : { fpA: fpA.slice(0, 400), fpB: fpB.slice(0, 400) });
    check('the fold actually placed both swimmers in the world (a fingerprint match over an empty world proves nothing)',
      stateA.fish.has(alice.publicKeyHex) && stateA.fish.has(bob.publicKeyHex),
      [...stateA.fish.keys()]);
  } finally {
    // Idempotent — `startLive`'s `stop()` applies a `stop` event, and a
    // `stopped` machine short-circuits every later event. Repeated here so a
    // throw before the in-band stop above still tears the sockets down.
    wA.stop();
    wB.stop();
    wHex.stop();
  }

  console.log(`\n[smoke] ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[smoke] FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
