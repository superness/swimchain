/**
 * Wall chain plumbing: network-aware PoW mining + canonical signing for
 * `submit_post` / `submit_reply`, plus the read-side row shapes `Wall.tsx`
 * renders. Mirrors `reef-client/src/lib/reefEngine.ts`'s `minePow` /
 * `submitMinedPost` / `submitMinedReply` (and `trench-client/ui/src/lib/
 * trenchNet.ts`'s network-aware `powProfile` on top of that) — same worker
 * wiring, same mine → sign → submit recipe, ported here because this client
 * has no other game-engine module to hang it off of.
 *
 * ── Why the challenge content is NOT `createPostChallenge`/
 *    `createReplyChallenge` from `@swimchain/react`'s `action-pow.ts` ──────
 * Those two convenience helpers hash `${spaceId}:${title}:${body}` (post) and
 * `${parentId}:${body}` (reply) — but the node computes its own PoW-challenge
 * content differently (`src/rpc/methods.rs`):
 *   - `submit_post`  (~line 2087): `post_content = format!("{}\n\n{}", title, body)`
 *   - `submit_reply` (~line 2922): `params.body.as_bytes()` (body alone)
 * Mining against the helpers' preimage would produce a hash the node can
 * NEVER match — "PoW verification failed: hash mismatch" regardless of
 * difficulty. `contentHashForPost`/`contentHashForReply` (used for the
 * action *signature*) already hash the correct `${title}\n\n${body}` / `body`
 * forms, so the challenge below is built by hand with that same content,
 * exactly as `reefEngine.ts`'s `submitMinedPost`/`submitMinedReply` already do
 * (verified against the Rust source directly, not assumed from the helpers'
 * names).
 *
 * ── Network-aware PoW profile ───────────────────────────────────────────
 * `verify_pow_submission` (`src/crypto/action_pow.rs`) recomputes the
 * Argon2id hash using a config chosen purely from the node's network mode:
 * regtest gets a flat 4-bit difficulty and the 1 MiB/1-iter/1-par test
 * config for every action type; testnet/mainnet share the 8 MiB/1-iter/2-par
 * profile and the per-action difficulty table (mainnet mirrors testnet,
 * operator decision 2026-07-22). Memory cost feeds the Argon2id hash
 * directly, so mining with the wrong config can never verify, independent of
 * difficulty — this is why `useRpc()`'s `nodeInfo.network` (populated by the
 * same `get_info` call `connect()` already makes) is threaded through here
 * rather than hardcoding one profile the way `reefEngine.ts`'s `TESTNET =
 * true` constant does (that client only ever targets testnet/mainnet; this
 * one is developed and manually verified against regtest, where the wrong
 * profile is a hard mining-time failure, not a style choice).
 */
import {
  ActionType,
  createChallenge,
  computePow,
  getConfig,
  getDifficulty,
  solutionToRpcParams,
  hexToBytes,
  signAction,
  contentHashForPost,
  contentHashForReply,
  TEST_CONFIG,
  type SwimchainRpc,
  type SignFn,
  type ProgressCallback,
  type PoWChallenge,
  type PoWConfig,
  type PoWSolution,
  type ContentResult,
  type ReplyResult,
} from '@swimchain/react';

// ── Read-side row shapes ─────────────────────────────────────────────────

export interface WallPost {
  id: string;
  author: string;
  title: string;
  body: string;
  createdAtMs: number;
  replyCount: number;
}

export interface WallReply {
  id: string;
  author: string;
  body: string;
  createdAtMs: number;
}

/**
 * `list_space_posts`/`get_content` return `created_at`/reply body in
 * milliseconds already (`src/rpc/methods.rs` emits `metadata.timestamp *
 * 1000` throughout) — no unit conversion needed here.
 *
 * `list_space_posts`'s `body` field is the RAW STORED BLOB
 * (`${title}\n\n${body}` — the exact preimage a Post signs, `src/rpc/
 * methods.rs`'s `post_content = format!("{}\n\n{}", title, body)`), not the
 * caller's original body text — confirmed live (curl against a regtest
 * node's own seed post) and already documented/fixed once before for the
 * SAME endpoint in `trench-client/ui/src/lib/trenchNet.ts`'s `listClaims()`.
 * Left unstripped, every post (including this client's own title-less ones,
 * where the stored blob is still `\n\n${body}` — the node concatenates
 * unconditionally even when title is `''`) would render with a leading
 * `${title}\n\n` baked into the visible body. Peel off the known prefix here,
 * the same fix trenchNet.ts already applied.
 */
export function toWallPost(item: ContentResult): WallPost {
  const title = item.title ?? '';
  const rawBody = item.body ?? '';
  const prefix = `${title}\n\n`;
  const body = rawBody.startsWith(prefix) ? rawBody.slice(prefix.length) : rawBody;
  return {
    id: item.content_id,
    author: item.author_id,
    title,
    body,
    createdAtMs: item.created_at,
    replyCount: item.reply_count ?? 0,
  };
}

export function toWallReply(item: ReplyResult): WallReply {
  return {
    id: item.content_id,
    author: item.author_id,
    body: item.body,
    createdAtMs: item.created_at,
  };
}

// ── PoW mining (worker, with a main-thread fallback) ────────────────────
// Identical shape to reef-client/src/lib/reefEngine.ts's `minePow`: try the
// dedicated worker first (keeps the UI thread live during the Argon2id
// search — a sync-WASM-behind-async-signature loop on the main thread never
// yields, so nothing else, including the worker's own onmessage, can run),
// falling back to inline mining only if the worker can't be constructed.
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

// ── Network-aware PoW profile ───────────────────────────────────────────

export type NetworkKind = 'mainnet' | 'testnet' | 'regtest';

/** Normalizes `useRpc()`'s `nodeInfo.network` (whatever casing the node
 *  reports) into the three kinds `powProfile` understands. */
export function normalizeNetwork(raw: string | null | undefined): NetworkKind {
  const n = (raw ?? '').toLowerCase();
  return n === 'regtest' ? 'regtest' : n === 'testnet' ? 'testnet' : 'mainnet';
}

function powProfile(network: NetworkKind, action: ActionType): { difficulty: number; config: PoWConfig } {
  if (network === 'regtest') {
    // NetworkMode::Regtest::adjusted_difficulty is a flat 4 bits for every
    // action type; ForkPoWConfig::test() is 1 MiB / 1 iter / 1 par.
    return { difficulty: 4, config: TEST_CONFIG };
  }
  // Mainnet currently mirrors testnet's lightweight PoW profile (operator
  // decision 2026-07-22, src/network/mode.rs) — both use the same difficulty
  // table and Argon2id config, so `isTestnet=true` is correct for both.
  return { difficulty: getDifficulty(action, true), config: getConfig(true) };
}

// ── Mine + canonically sign, then submit ────────────────────────────────

export async function submitMinedPost(
  rpc: SwimchainRpc,
  network: NetworkKind,
  authorPublicKeyHex: string,
  sign: SignFn,
  spaceId: string,
  title: string,
  body: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const { difficulty, config } = powProfile(network, ActionType.Post);
  const challenge = await createChallenge(
    ActionType.Post,
    new TextEncoder().encode(`${title}\n\n${body}`),
    hexToBytes(authorPublicKeyHex),
    difficulty
  );
  const solution = await minePow(challenge, config, onProgress);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForPost(title, body);
  const signature = await signAction(sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitPost({
    spaceId,
    title,
    body,
    authorId: authorPublicKeyHex,
    // pow_nonce must go over the wire as a JSON number (node's SubmitPostParams
    // is `pow_nonce: u64`); solutionToRpcParams stringifies it to dodge f64
    // precision loss above 2^53, so convert back here (reefEngine.ts does the same).
    powNonce: Number(p.pow_nonce),
    powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space,
    powHash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return res.content_id;
}

export async function submitMinedReply(
  rpc: SwimchainRpc,
  network: NetworkKind,
  authorPublicKeyHex: string,
  sign: SignFn,
  parentId: string,
  body: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const { difficulty, config } = powProfile(network, ActionType.Reply);
  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(authorPublicKeyHex),
    difficulty
  );
  const solution = await minePow(challenge, config, onProgress);
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForReply(body);
  const signature = await signAction(sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitReply({
    parentId,
    body,
    authorId: authorPublicKeyHex,
    powNonce: Number(p.pow_nonce),
    powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space,
    powHash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return res.content_id;
}
