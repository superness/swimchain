/**
 * The Trench — chain plumbing over `nodeRpc.ts` and the pure `trenchEngine.ts` fold.
 *
 * Mirrors reef-client/src/lib/reefEngine.ts's mine→sign→submit path (`submitMinedPost`
 * / `submitMinedReply` there) almost line for line: claim = post, move = reply, and the
 * node re-derives `content_hash` itself (see swimchain-react's `signAction.ts` header),
 * so a client's job is just to mine PoW and sign that same preimage — nothing here is
 * trench-specific except the move body shape (`docs/superpowers/plans/2026-07-22-the-
 * trench.md` Global Constraints) and the claim JSON header.
 *
 * ── PoW profile: why network-detection isn't optional here ─────────────────────────
 * `verify_pow` (src/crypto/action_pow.rs) recomputes the Argon2id hash using an
 * Argon2id CONFIG chosen purely from the node's network mode — regtest always gets
 * `ForkPoWConfig::test()` (1 MiB / 1 iter / 1 par), testnet/mainnet get the 8 MiB / 1 /
 * 2 profile (mainnet was tuned to match testnet 2026-07-22, see src/network/mode.rs).
 * Memory cost feeds directly into the Argon2id hash, so mining with the wrong config
 * produces a hash the node can NEVER match, regardless of difficulty — this isn't a
 * "nice to have," a regtest submission mined at testnet's config always fails with
 * "PoW verification failed: hash mismatch". Regtest's minimum difficulty is also a
 * flat 4 bits for every action type (`NetworkMode::Regtest` in src/network/mode.rs),
 * not the per-action testnet/mainnet table — so `detectNetwork`/`powProfile` below
 * call `get_info` once per endpoint and cache the answer.
 */

import {
  ActionType,
  createChallenge,
  computePow,
  getConfig,
  getDifficulty,
  solutionToRpcParams,
  hexToBytes,
  ensureSponsored,
  signAction,
  contentHashForPost,
  contentHashForReply,
  SwimchainRpc,
  TEST_CONFIG,
  type ProgressCallback,
  type PoWChallenge,
  type PoWConfig,
  type PoWSolution,
} from '@swimchain/react';

import { rpcCall, type RpcAuth, type NodeIdentity } from './nodeRpc';
import {
  TRENCH_SPACE,
  GAME_SPONSOR,
  parseClaimHeader,
  foldClaim,
  foldMap,
  type ClaimHeader,
  type ClaimState,
  type MapClaim,
  type ReplyLike,
} from './trenchEngine';

// ── PoW mining (worker, with a main-thread fallback) ───────────────────────────────
// Identical shape to reef-client/src/lib/reefEngine.ts's `minePow`: try the dedicated
// worker first (keeps the UI thread live during the Argon2id search), and fall back to
// mining inline if the worker can't be constructed. That fallback isn't just "very old
// runtime" — it's also what makes this whole module load AND run correctly under plain
// `tsx` (the regtest smoke script): Node has no `Worker` global matching the DOM Worker
// API, so `new Worker(...)` throws synchronously, the catch fires, and mining proceeds
// in-process via `computePow` with no worker at all.
function minePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback
): Promise<PoWSolution> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return computePow(challenge, config, onProgress);
  }
  return new Promise<PoWSolution>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === 'progress') {
        onProgress?.(m.attempts, m.elapsedMs, m.hashRate);
      } else if (m?.type === 'solution') {
        resolve(m.solution as PoWSolution);
        worker.terminate();
      } else if (m?.type === 'error') {
        reject(new Error(m.message));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(new Error(err.message || 'pow worker error'));
      worker.terminate();
    };
    worker.postMessage({ challenge, config });
  });
}

// ── Network-aware PoW profile ───────────────────────────────────────────────────────

type NetworkKind = 'mainnet' | 'testnet' | 'regtest';

/** One cached `get_info` lookup per endpoint — moves are frequent enough (heartbeat
 *  scheduler, Task 3) that re-querying the network on every submit would be wasteful,
 *  and the network a given endpoint speaks for never changes mid-session. */
const networkCache = new Map<string, Promise<NetworkKind>>();

async function detectNetwork(auth: RpcAuth): Promise<NetworkKind> {
  let cached = networkCache.get(auth.endpoint);
  if (!cached) {
    cached = rpcCall<{ network?: string }>(auth, 'get_info', {})
      .then((info): NetworkKind => {
        const n = (info.network ?? '').toLowerCase();
        return n === 'regtest' ? 'regtest' : n === 'testnet' ? 'testnet' : 'mainnet';
      })
      .catch((): NetworkKind => 'mainnet'); // best-effort; falls back to the heaviest (safe) profile
    networkCache.set(auth.endpoint, cached);
  }
  return cached;
}

function powProfile(network: NetworkKind, action: ActionType): { difficulty: number; config: PoWConfig } {
  if (network === 'regtest') {
    // NetworkMode::Regtest::adjusted_difficulty is a flat 4 bits for every action
    // type; ForkPoWConfig::test() is 1 MiB / 1 iter / 1 par.
    return { difficulty: 4, config: TEST_CONFIG };
  }
  // Mainnet currently mirrors testnet's lightweight PoW profile (operator decision
  // 2026-07-22 — src/network/mode.rs); both use the same difficulty table and Argon2id
  // config, so `getDifficulty`/`getConfig`'s `isTestnet=true` branch is correct for both.
  return { difficulty: getDifficulty(action, true), config: getConfig(true) };
}

// ── Mine + canonically sign, then submit (mirrors reefEngine.ts's submitMinedPost /
//    submitMinedReply, and chess-client before it) ──────────────────────────────────

async function submitMinedPost(
  auth: RpcAuth,
  id: NodeIdentity,
  spaceId: string,
  title: string,
  body: string
): Promise<string> {
  const network = await detectNetwork(auth);
  const { difficulty, config } = powProfile(network, ActionType.Post);

  const content = `${title}\n\n${body}`;
  const challenge = await createChallenge(
    ActionType.Post,
    new TextEncoder().encode(content),
    hexToBytes(id.publicKeyHex),
    difficulty
  );
  const solution = await minePow(challenge, config);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForPost(title, body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });

  const result = await rpcCall<{ content_id: string }>(auth, 'submit_post', {
    space_id: spaceId,
    title,
    body,
    author_id: id.publicKeyHex,
    // pow_nonce must go over the wire as a JSON NUMBER (the node's SubmitPostParams
    // is `pow_nonce: u64`) — solutionToRpcParams stringifies it to dodge f64
    // precision loss above 2^53, so convert back here (reefEngine.ts does the same).
    pow_nonce: Number(p.pow_nonce),
    pow_difficulty: p.pow_difficulty,
    pow_nonce_space: p.pow_nonce_space,
    pow_hash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return result.content_id;
}

async function submitMinedReply(auth: RpcAuth, id: NodeIdentity, parentId: string, body: string): Promise<string> {
  const network = await detectNetwork(auth);
  const { difficulty, config } = powProfile(network, ActionType.Reply);

  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(id.publicKeyHex),
    difficulty
  );
  const solution = await minePow(challenge, config);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForReply(body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });

  const result = await rpcCall<{ content_id: string }>(auth, 'submit_reply', {
    parent_id: parentId,
    body,
    author_id: id.publicKeyHex,
    pow_nonce: Number(p.pow_nonce),
    pow_difficulty: p.pow_difficulty,
    pow_nonce_space: p.pow_nonce_space,
    pow_hash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return result.content_id;
}

/**
 * The trench space to act in. Reads `TRENCH_SPACE_OVERRIDE` (checked at CALL time, not
 * module-load time) ahead of the build-time `TRENCH_SPACE` constant — the escape hatch
 * `scripts/regtest-smoke.ts` needs, since `TRENCH_SPACE` is a `const` sourced from
 * `import.meta.env.VITE_TRENCH_SPACE` at import time, which is always `''` under plain
 * `tsx` (no Vite ever ran to inject it) and can't be reassigned from outside anyway
 * (ESM named exports are read-only live bindings). `typeof process` is checked first
 * because Vite doesn't polyfill a `process` global by default — referencing it
 * unguarded in browser code would throw a ReferenceError.
 */
function effectiveTrenchSpace(): string {
  const override = typeof process !== 'undefined' ? process.env?.TRENCH_SPACE_OVERRIDE : undefined;
  return (override && override.trim()) || TRENCH_SPACE;
}

// ── Onboarding ───────────────────────────────────────────────────────────────────────

/** Decodes an `Authorization: Basic base64(user:pass)` header back into credentials
 *  for `@swimchain/react`'s `SwimchainRpc` (whose config only accepts `{username,
 *  password}` or its own signature-auth, not a raw header — see nodeRpc.ts's header
 *  comment). Mirrors feed-client/src/lib/rpc.ts's `getTauriAuth` decode step. */
function legacyRpc(auth: RpcAuth): SwimchainRpc {
  let basicAuth: { username: string; password: string } | undefined;
  if (auth.authHeader?.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.authHeader.slice(6));
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        basicAuth = { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
      }
    } catch {
      // Malformed header — proceed unauthenticated; the node will reject with a
      // clear auth error rather than us silently pretending it worked.
    }
  }
  return new SwimchainRpc({ endpoint: auth.endpoint, auth: basicAuth, timeout: 30_000 });
}

/**
 * Thin wrapper over `@swimchain/react`'s `ensureSponsored`, pinned to the trench's
 * always-on game sponsor and its own space — see ensureSponsored.ts's `strictPreferred`
 * doc for why games never fall back to a stray sponsor (2026-07-18 hang incident).
 */
export async function ensureTrenchSponsored(
  auth: RpcAuth,
  id: NodeIdentity,
  onPhase?: (p: string) => void
): Promise<void> {
  const rpc = legacyRpc(auth);
  await ensureSponsored(
    rpc,
    { publicKeyHex: id.publicKeyHex, sign: id.sign },
    {
      preferredSponsorHex: GAME_SPONSOR,
      strictPreferred: true,
      requiredSpaceId: effectiveTrenchSpace(),
      onProgress: onPhase,
    }
  );
}

// ── Claims & moves ──────────────────────────────────────────────────────────────────

/**
 * Founds a new claim: a Post in `TRENCH_SPACE` whose title is the claim name and whose
 * body is the claim header (spec-exact shape: `<name>\n\n{"v":1,"kind":"trench-
 * claim",...}` — `JSON.stringify` on an object literal built in that field order
 * produces byte-identical key ordering, which `parseClaimHeader` doesn't require but
 * keeps this human-diffable on-chain). Returns the new claim's content id.
 */
export async function foundClaim(auth: RpcAuth, id: NodeIdentity, name: string, x: number, y: number): Promise<string> {
  const header: ClaimHeader = { v: 1, kind: 'trench-claim', name, x, y };
  const body = `${name}\n\n${JSON.stringify(header)}`;
  return submitMinedPost(auth, id, effectiveTrenchSpace(), name, body);
}

/**
 * Submits one move as a Reply on `claimId` (the player's own claim post — the fold
 * isolation rule (spec §2) means a move posted anywhere else is simply never folded
 * into anyone's balance). Appends the `#<ms>~` authoring-timestamp suffix itself
 * (reef convention — see trenchEngine.ts's `embeddedMs`), using the current wall
 * clock, exactly like reef stamps its own moves at submit time. Returns the new
 * move's content id.
 */
export async function submitTrenchMove(auth: RpcAuth, id: NodeIdentity, claimId: string, body: string): Promise<string> {
  const stamped = `${body} #${Date.now()}~`;
  return submitMinedReply(auth, id, claimId, stamped);
}

// ── Bech32m address decode (pure JS, no WASM) ───────────────────────────────────────
// `@swimchain/core`'s `decodeAddress` is WASM-backed and its loader `fetch()`es its
// `.wasm` binary — fine in a browser/Vite context, but plain Node's `fetch()` doesn't
// support `file:` URLs, so it throws under `tsx` (confirmed empirically: the regtest
// smoke script hit this directly — EVERY legitimate move folded `rejected-foreign`,
// because the caught-and-swallowed WASM failure silently degraded `ownerPubkeyHex` to
// `''`, so the owner gate could only ever match the address form, which replies never
// use). A pure-JS reimplementation of src/crypto/address.rs's `decode_address_to_pubkey`
// (BIP-173/350 bech32m) sidesteps the WASM loader entirely, so it behaves IDENTICALLY
// under plain tsx and the browser — no environment-dependent code path to drift.
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** Decodes a bech32m string into `{hrp, data}` (5-bit words, checksum stripped),
 *  verifying the checksum against the bech32m constant (BIP-350). Throws on any
 *  malformed input — callers treat that as "can't resolve this form", not a crash. */
function bech32mDecode(bech: string): { hrp: string; data: number[] } {
  const s = bech.toLowerCase();
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length || s.length > 90) throw new Error('invalid bech32 format');
  const hrp = s.slice(0, pos);
  const data: number[] = [];
  for (const c of s.slice(pos + 1)) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v === -1) throw new Error('invalid bech32 character');
    data.push(v);
  }
  if (bech32Polymod(bech32HrpExpand(hrp).concat(data)) !== BECH32M_CONST) {
    throw new Error('invalid bech32m checksum');
  }
  return { hrp, data: data.slice(0, -6) };
}

/** Converts an array of 5-bit words to bytes (8-bit), per BIP-173's convertbits
 *  (`pad: false` — a well-formed 33-byte payload divides evenly, so any leftover
 *  bits mean the input was malformed, not that padding is needed). */
function convertBits5to8(data: number[]): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const value of data) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * Resolves a bech32 address to its 32-byte pubkey hex — the form `foldClaim`'s
 * owner-gate needs to match against replies' `author_id` (hex pubkey, from
 * `get_replies`), since the claim POST's `author_id` (from `get_content`) is
 * bech32 (task-2's report flagged this exact both-forms trap; the review that
 * hardened the fold re-flagged it). Format verified empirically against a live
 * identity's known address+pubkey pair (version byte + 32-byte pubkey), not
 * assumed from doc comments (the Rust source has two differently-behaved
 * address-encoding functions and the comments on them don't agree with which
 * one content endpoints actually call). Never throws: a malformed address
 * resolves to `''`, which `foldClaim` treats as "no pubkey form to match" —
 * degrading to address-only comparison rather than breaking the read path.
 */
function addressToPubkeyHex(address: string): string {
  try {
    const { data } = bech32mDecode(address);
    const bytes = convertBits5to8(data);
    if (bytes.length !== 33) return ''; // not a 1-version-byte + 32-byte-pubkey payload
    return bytes.slice(1).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/**
 * Loads and folds one claim: `get_content` for the claim post itself (owner + header),
 * `get_replies` for its own move stream (depth_limit 1 — moves are direct replies
 * only, never threaded), then `foldClaim` per the fold-isolation rule — gated against
 * BOTH the owner's address and pubkey-hex forms (see `addressToPubkeyHex`).
 */
export async function loadClaim(
  auth: RpcAuth,
  claimId: string
): Promise<{ header: ClaimHeader; owner: string; state: ClaimState }> {
  const post = await rpcCall<{ author_id: string; body: string | null }>(auth, 'get_content', {
    content_id: claimId,
  });
  const header = parseClaimHeader(post.body);
  if (!header) {
    throw new Error(`loadClaim: ${claimId} is not a valid trench claim (malformed or missing header)`);
  }
  const owner = post.author_id;
  const ownerPubkeyHex = addressToPubkeyHex(owner);

  const repliesResult = await rpcCall<{
    replies: Array<{
      content_id: string;
      author_id: string;
      body: string | null;
      created_at: number;
      block_height?: number | null;
    }>;
  }>(auth, 'get_replies', { content_id: claimId, limit: 1000, depth_limit: 1 });

  const replies: ReplyLike[] = repliesResult.replies.map((r) => ({
    author_id: r.author_id,
    body: r.body ?? null,
    content_id: r.content_id,
    created_at: r.created_at,
    block_height: r.block_height ?? null,
  }));

  const state = foldClaim(claimId, owner, ownerPubkeyHex, header, replies);
  return { header, owner, state };
}

/**
 * Lists every claim in `TRENCH_SPACE` (display/driver input only — never a balance
 * source, per the fold isolation rule) and folds spacing acceptance via `foldMap`.
 *
 * Uses `list_space_posts` (src/rpc/methods.rs — same `ListSpaceContentParams` in,
 * same `ListSpaceContentResult{items,total}` shape out as `list_space_content`, just
 * filtered to Posts at the DB level: "get exactly `limit` posts"), NOT
 * `list_space_content`, which mixes posts AND every move-reply together — on a claim
 * with any real move activity, 500-most-recent-of-everything starves OLD claims off
 * the map entirely (a veteran player's own claim stops resolving via `myClaim` and
 * they're regressed straight back to the founding screen). `list_space_posts` is also
 * separately aliased as `list_posts_for_space`, already in the node's auth-exempt
 * list, so this now works even before signature/cookie auth is available.
 */
export async function listClaims(auth: RpcAuth): Promise<MapClaim[]> {
  const result = await rpcCall<{
    items: Array<{
      content_id: string;
      author_id: string;
      body: string | null;
      title: string | null;
      parent_id: string | null;
      created_at: number;
    }>;
  }>(auth, 'list_space_posts', { space_id: effectiveTrenchSpace(), limit: 500, offset: 0, sort: 'recent' });

  const claims = result.items
    // list_space_posts only ever returns Posts (parent_id is always null server-side)
    // — this filter is defensive, not load-bearing, should that ever not hold.
    .filter((it) => it.parent_id === null && it.body !== null)
    .map((it) => {
      // `list_space_posts`'s `body` field is the RAW STORED BLOB (`${title}\n\n${body}`,
      // the exact preimage a Post signs — see src/rpc/methods.rs, which returns the
      // un-split text, not the title-stripped body), not the caller's original `body`
      // param `foundClaim()` submitted (itself `${name}\n\n${json header}`). Left
      // unstripped, `parseClaimHeader`'s own `\n\n` split lands mid-name and every claim
      // folds as malformed (`accepted: false`, including the player's OWN — founding
      // never completes visibly since `myClaim` can never match). Recover the true
      // submitted body by peeling off the known `${title}\n\n` prefix.
      const raw = it.body as string;
      const body = it.title && raw.startsWith(`${it.title}\n\n`) ? raw.slice(it.title.length + 2) : raw;
      return {
        claimId: it.content_id,
        owner: it.author_id,
        body,
        created_at: it.created_at,
      };
    });

  return foldMap(claims);
}

/**
 * Asks the local node to fetch (host) a claim's full content — the expedition/viewing
 * driver: visiting a claim makes YOUR node responsible for keeping it retrievable, per
 * the design's "your node is your lantern" thesis. Fire-and-forget from the caller's
 * perspective (the node's WHO_HAS/sync machinery does the actual work); this just
 * resolves once the request itself was accepted.
 */
export async function requestClaimContent(auth: RpcAuth, claimId: string): Promise<void> {
  await rpcCall(auth, 'request_content', { content_id: claimId });
}
