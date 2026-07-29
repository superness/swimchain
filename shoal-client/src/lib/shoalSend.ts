/**
 * The Shoal — writing a move to the chain (plan 2b Task 6, "the bridge").
 *
 * A move is a REPLY to the room post, so the path is exactly the one every
 * other game client in this repo walks:
 *
 *   encode the body (shoalWire) -> mine action PoW (Argon2id) ->
 *   sign `sha256(body) || timestamp_LE || private` -> `submit_reply`
 *
 * The node re-derives `content_hash = sha256(body)` itself
 * (`src/rpc/methods.rs` `submit_reply`), so a client's only jobs are the PoW
 * and the signature over that same preimage.
 *
 * ## THE PoW PROFILE TRAP — read this before touching anything below
 *
 * `verify_pow` (`src/crypto/action_pow.rs:554`) recomputes the Argon2id hash
 * with a config chosen PURELY from the node's network mode
 * (`verify_pow_submission`, `src/rpc/methods.rs:312-316`):
 *
 *   regtest -> `ForkPoWConfig::test()`      1024 KiB / 1 iter / 1 par
 *   testnet -> `ForkPoWConfig::testnet()`   8192 KiB / 1 iter / 2 par
 *   mainnet -> `ForkPoWConfig::production()` 8192 KiB / 1 iter / 2 par
 *              (mainnet was tuned to match testnet 2026-07-22 — read the
 *              comment at action_pow.rs:264, these are mainnet's OWN values
 *              and are independently tunable, so do not collapse the two
 *              branches into one on the assumption they must stay equal)
 *
 * Memory cost feeds directly into the Argon2id hash. Mining with the wrong
 * profile produces a hash the node can NEVER match, at ANY difficulty: it
 * fails with `PoW verification failed: hash mismatch` and reads exactly like
 * a signing bug. The minimum difficulty is network-dependent too
 * (`NetworkMode::adjusted_difficulty`, `src/network/mode.rs:274`): regtest is
 * a FLAT 4 bits for every action type, not the per-action table testnet and
 * mainnet share (`base - 10`, floored at 4; Reply's base is 18, so 8 bits).
 *
 * So `powProfileFor` asks the node `get_info` ONCE per endpoint and caches
 * the answer — a room writes roughly every 3-8 s per player (spec 3.6), and
 * the network an endpoint speaks for never changes mid-session. Same
 * structure, and the same reasoning, as `trench-client/ui/src/lib/trenchNet.ts`
 * (the reference implementation for this task).
 *
 * ## Why the PoW/signing primitives are re-implemented here rather than
 * imported from `@swimchain/react`
 *
 * `@swimchain/react` is where `createChallenge`/`computePow`/`signAction`
 * live for the React game clients (reef, chess, chips, trench). Its package
 * `exports` map exposes ONLY the root entry, whose `dist/index.js` eagerly
 * re-exports `SwimchainProvider`, which statically imports `react` — so
 * importing it at all would make `react` (plus the WASM-backed
 * `@swimchain/core`, whose loader `fetch()`es a `file:` URL and throws under
 * plain `tsx` — see trenchNet.ts's `addressToPubkeyHex` header) a RUNTIME
 * dependency of a package that today has none and renders nothing.
 *
 * The established alternative in this repo is exactly what is done here:
 * `swimchain-frontend/src/lib/action-pow.ts`, `feed-client/src/lib/action-pow.ts`
 * and `forum-client/src/lib/action-pow.ts` each carry a local copy that
 * depends only on `hash-wasm`. This file follows those, and every byte layout
 * below was re-verified line-by-line against the Rust the node actually runs
 * (`PoWChallenge::serialize`, action_pow.rs:136-145) rather than copied on
 * trust — see the comments on `serializeChallenge` and
 * `actionSignaturePreimage`. The regtest smoke script (`scripts/regtest-smoke.ts`)
 * is what proves the bytes are right: a wrong layout is rejected by the node,
 * it cannot pass silently.
 *
 * ## No wall clock, no floats (this plan's Global Constraints)
 *
 * An action carries a `timestamp` (unix SECONDS) that is folded into the PoW
 * challenge AND into the signature preimage, and the node checks it against a
 * window (`CHALLENGE_VALIDITY_SECS` 600 back, `CHALLENGE_FUTURE_TOLERANCE_SECS`
 * 60 forward — action_pow.rs:79-82). Nothing in `src/lib/` may read a clock,
 * so that timestamp is NOT read from `Date.now()`: it is derived from the
 * authoring millisecond the caller already had to supply anyway —
 * `vec.t` for a presence write, `ms` for an eat claim. That is the same
 * instant the wire body carries and the fold orders on, so the action's
 * timestamp and the move's own claimed time can never disagree, and the
 * caller has exactly one clock read to make instead of two.
 *
 * `Math.floor(ms / 1000)` is the one division in this file. It is integer
 * milliseconds in, integer seconds out (`ms` is validated non-negative by
 * `encodePresence`/`encodeEat` before it gets here, so floor and trunc agree);
 * no fractional quantity is ever stored or compared.
 *
 * A CHECKPOINT is the one write whose action timestamp is NOT the instant its
 * body describes. `sendCheckpoint(ctx, cp, nowMs)` takes the publisher's own
 * clock for the envelope only: the body's time is the epoch inside the payload,
 * and if a publisher's clock reached the body then two honest clients rolling
 * the same boundary milliseconds apart would compute different payloads for one
 * world — turning every honest pair into a detected divergence. See
 * `sendCheckpoint` below.
 *
 * ## `sendEat` takes `(cell, ms)`, not `(cell)`
 *
 * Carried forward from Task 1: the plan brief listed `encodeEat(cell)` and
 * `sendEat(ctx, cell)`, but `EatClaim.ms` is a real fold-consulted value
 * (`canEat` judges the bite against `reckon(fish.vec, claim.ms)`, `orderLog`
 * keys on it, the cooldown is measured from it) and this module may not read
 * a clock to invent one. See shoalWire.ts's module header for the full
 * argument. `sendEat(ctx, cell, ms)` supplies it.
 *
 * ## The body's `salt` comes from `ctx.authorIdHex`, not from a parameter
 *
 * Every body this module writes carries a `salt` field — the first 16
 * characters of the author's public key hex — so that two swimmers cannot
 * author byte-identical bodies and collide on `content_id = sha256(body)`
 * (see shoalWire.ts's module header for the whole defect and the length
 * justification). `sendPresence`/`sendEat` pass `ctx.authorIdHex` straight
 * into `encodePresence`/`encodeEat`, which derive the salt themselves; there
 * is no salt parameter anywhere, so a caller cannot author a body salted with
 * anyone else's key by accident. The SIGNATURE still binds the same body via
 * `content_hash = sha256(body)`, so the salt is inside everything already
 * signed and mined — it is not a second, unauthenticated channel.
 */

import { argon2id, createSHA256 } from 'hash-wasm';

import type { Checkpoint, Vec } from './shoalTypes';
import { encodeCheckpoint, encodeEat, encodePresence } from './shoalWire';
import { assertWireSpaceId, rpcCall, type RpcAuth } from './shoalRpc';

// ---------------------------------------------------------------------------
// Action PoW — byte layouts verified against src/crypto/action_pow.rs
// ---------------------------------------------------------------------------

/**
 * SPEC_03 §3.1 action types (`ActionType`, action_pow.rs:43-59). A move is
 * always a `Reply`, which is the only one this module's own send path uses —
 * but the discriminant is byte 0 of the challenge AND selects the base
 * difficulty, so the three a Shoal room's lifecycle can touch are all named
 * here (a room's space is created once with `SpaceCreation`, its room post
 * once with `Post`, and then it is replies forever).
 */
export const ACTION_TYPE_SPACE_CREATION = 0x01;
export const ACTION_TYPE_POST = 0x02;
export const ACTION_TYPE_REPLY = 0x03;

/** Argon2id parameters. `memoryKib` is the one that silently poisons
 *  everything when it is wrong (see the module header). */
export interface PowConfig {
  readonly memoryKib: number;
  readonly iterations: number;
  readonly parallelism: number;
}

/** `ForkPoWConfig::test()` — action_pow.rs:281-287. Regtest only. */
const REGTEST_CONFIG: PowConfig = { memoryKib: 1024, iterations: 1, parallelism: 1 };
/** `ForkPoWConfig::testnet()` (action_pow.rs:305-311) and
 *  `ForkPoWConfig::production()` (action_pow.rs:264-274) are currently the
 *  same three numbers, but they are separate functions in the node and are
 *  documented there as independently tunable, so they stay separate here. */
const TESTNET_CONFIG: PowConfig = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const MAINNET_CONFIG: PowConfig = { memoryKib: 8192, iterations: 1, parallelism: 2 };

/** Base difficulty per action type — `crate::crypto::action_pow::difficulty`
 *  (action_pow.rs:91-106), selected by `ForkPoWConfig::get_difficulty`. */
const BASE_DIFFICULTY: Readonly<Record<number, number>> = {
  [0x01]: 22, // SpaceCreation
  [0x02]: 20, // Post
  [0x03]: 18, // Reply
  [0x04]: 16, // Engage
  [0x05]: 20, // IdentityUpdate
  [0x06]: 18, // Edit
  [0x07]: 16, // Invite
};

export type NetworkKind = 'mainnet' | 'testnet' | 'regtest';

/** Which Argon2id parameters a given node will verify against. Difficulty is
 *  NOT a field here because it is per-action — see `difficultyFor`. */
export interface PowProfile {
  readonly network: NetworkKind;
  readonly config: PowConfig;
}

const REGTEST_PROFILE: PowProfile = { network: 'regtest', config: REGTEST_CONFIG };
const TESTNET_PROFILE: PowProfile = { network: 'testnet', config: TESTNET_CONFIG };
const MAINNET_PROFILE: PowProfile = { network: 'mainnet', config: MAINNET_CONFIG };

/**
 * The minimum difficulty this node will accept for `actionType`, exactly as
 * `NetworkMode::adjusted_difficulty` computes it (src/network/mode.rs:274-296):
 *
 *  - regtest: a FLAT 4 bits for every action type. The per-action table above
 *    is not consulted at all — mining a Reply and a SpaceCreation cost the
 *    same there.
 *  - testnet and mainnet: `base - 10`, floored at 4 (mainnet was tuned to
 *    testnet's shift 2026-07-22). So SpaceCreation 12, Post 10, Reply 8.
 *
 * Bits, never bytes (project_pow_difficulty_units). Submitting below the
 * minimum is rejected outright (methods.rs:329-336); submitting above it is
 * accepted but is pure wasted work, so this returns the minimum.
 */
export function difficultyFor(profile: PowProfile, actionType: number): number {
  if (profile.network === 'regtest') return 4;
  const base = BASE_DIFFICULTY[actionType];
  if (base === undefined) throw new RangeError(`difficultyFor: unknown action type 0x${actionType.toString(16)}`);
  const shifted = base - 10;
  return shifted > 4 ? shifted : 4;
}

/**
 * One `get_info` lookup per endpoint, cached as the in-flight PROMISE (not
 * the resolved value) so N concurrent first writes share a single round trip
 * instead of racing N of them.
 *
 * A failed lookup falls back to mainnet — the heaviest profile and the
 * strictest difficulty. That direction is deliberate: over-mining costs the
 * writer time and is still accepted by a lighter network only if the config
 * ALSO matches, which it would not, so the failure is loud (`hash mismatch`)
 * rather than a silently-underpowered write being accepted somewhere it
 * should not be. It is also NOT cached, so a transient `get_info` failure
 * does not pin an endpoint to the wrong profile for the rest of the session.
 */
const profileCache = new Map<string, Promise<PowProfile>>();

function profileFor(network: NetworkKind): PowProfile {
  if (network === 'regtest') return REGTEST_PROFILE;
  if (network === 'testnet') return TESTNET_PROFILE;
  return MAINNET_PROFILE;
}

/**
 * Detect (once per endpoint) which Argon2id profile this node will verify
 * against. See the module header for why getting this wrong is unrecoverable
 * rather than merely slow.
 */
export async function powProfileFor(auth: RpcAuth): Promise<PowProfile> {
  const cached = profileCache.get(auth.endpoint);
  if (cached) return cached;

  const pending = rpcCall<{ network?: string }>(auth, 'get_info', {}).then((info): PowProfile => {
    const n = (info.network ?? '').toLowerCase();
    const network: NetworkKind = n === 'regtest' ? 'regtest' : n === 'testnet' ? 'testnet' : 'mainnet';
    return profileFor(network);
  });

  // Cache the promise immediately (dedupes concurrent callers), but drop it
  // again if it rejects so the next write re-detects instead of inheriting a
  // one-off network blip forever.
  profileCache.set(auth.endpoint, pending);
  try {
    return await pending;
  } catch {
    profileCache.delete(auth.endpoint);
    return MAINNET_PROFILE;
  }
}

// --- primitives -------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new RangeError(`hexToBytes: odd-length hex (${hex.length})`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isInteger(byte)) throw new RangeError(`hexToBytes: not hex at offset ${i * 2}`);
    out[i] = byte;
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hasher = await createSHA256();
  hasher.update(data);
  return hasher.digest('binary');
}

/**
 * The 82-byte canonical challenge, byte-for-byte against
 * `PoWChallenge::serialize` (action_pow.rs:136-145):
 *
 *   [0]      action_type (u8)
 *   [1..33)  content_hash (32)
 *   [33..65) author_id (32, the raw pubkey)
 *   [65..73) timestamp, u64 BIG-endian   <- big, not little; the SIGNATURE
 *                                           preimage uses little-endian for
 *                                           the same value. They genuinely
 *                                           differ; do not "fix" either one.
 *   [73]     difficulty (u8)
 *   [74..82) nonce_space (8)
 */
function serializeChallenge(
  actionType: number, contentHash: Uint8Array, authorId: Uint8Array,
  timestamp: number, difficulty: number, nonceSpace: Uint8Array,
): Uint8Array {
  if (contentHash.length !== 32) throw new RangeError(`content_hash must be 32 bytes, got ${contentHash.length}`);
  if (authorId.length !== 32) throw new RangeError(`author_id must be 32 bytes, got ${authorId.length}`);
  if (nonceSpace.length !== 8) throw new RangeError(`nonce_space must be 8 bytes, got ${nonceSpace.length}`);

  const buf = new Uint8Array(82);
  buf[0] = actionType;
  buf.set(contentHash, 1);
  buf.set(authorId, 33);
  new DataView(buf.buffer).setBigUint64(65, BigInt(timestamp), false); // big-endian
  buf[73] = difficulty;
  buf.set(nonceSpace, 74);
  return buf;
}

/** Leading zero BITS, matching `crate::crypto::leading_zeros`. Difficulty is
 *  counted in bits, never bytes (see project_pow_difficulty_units: byte-counting
 *  miners over-mine 8x and read as a timeout). */
function leadingZeroBits(hash: Uint8Array): number {
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += Math.clz32(byte) - 24; // clz32 is 32-bit; a byte's own count is 24 fewer
      break;
    }
  }
  return zeros;
}

function randomNonceSpace(): Uint8Array {
  const out = new Uint8Array(8);
  const c = (globalThis as { crypto?: { getRandomValues?(a: Uint8Array): Uint8Array } }).crypto;
  if (!c?.getRandomValues) {
    // Node < 19 has no global `crypto` (this package's engines field allows
    // >= 18). Refusing loudly beats mining against a predictable nonce space,
    // which is a real weakening of the PoW, not a cosmetic difference.
    throw new Error('shoalSend: no crypto.getRandomValues available for the PoW nonce space');
  }
  c.getRandomValues(out);
  return out;
}

/**
 * Mine until the Argon2id hash of `challenge || nonce_BE(8)`, salted with
 * `nonce_space`, has at least `difficulty` leading zero bits — the exact
 * recomputation `verify_pow` performs (action_pow.rs:585-592).
 *
 * The `setTimeout(0)` yield is load-bearing, not politeness: `hash-wasm`'s
 * argon2id is synchronous WASM behind an async signature, so a tight
 * `await`-hash loop never actually yields the event loop and starves every
 * other callback in the process — including a WebSocket's `onmessage`
 * (recorded as a cross-client gotcha in this project's memory, hit in reef
 * and chess). The Shoal runs its live channel (shoalLive.ts) in the same
 * process as its writes, so without this yield a burst of mining would stall
 * exactly the events this game exists to deliver promptly.
 */
async function minePow(
  actionType: number, contentHash: Uint8Array, authorId: Uint8Array,
  timestamp: number, difficulty: number, profile: PowProfile,
): Promise<{ nonce: number; hash: Uint8Array; nonceSpace: Uint8Array }> {
  const nonceSpace = randomNonceSpace();
  const serialized = serializeChallenge(
    actionType, contentHash, authorId, timestamp, difficulty, nonceSpace,
  );

  const input = new Uint8Array(90);
  input.set(serialized, 0);
  const view = new DataView(input.buffer);

  for (let nonce = 0; ; nonce++) {
    view.setBigUint64(82, BigInt(nonce), false); // nonce is big-endian too
    const raw = await argon2id({
      password: input,
      salt: nonceSpace,
      parallelism: profile.config.parallelism,
      memorySize: profile.config.memoryKib,
      iterations: profile.config.iterations,
      hashLength: 32,
      outputType: 'binary',
    });
    const hash = new Uint8Array(raw);
    if (leadingZeroBits(hash) >= difficulty) {
      return { nonce, hash, nonceSpace };
    }
    if (nonce % 8 === 7) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    }
  }
}

/**
 * The canonical v2 action-signature preimage the node checks in
 * `validate_action_signature` (src/blocks/validation.rs):
 *
 *   content_hash(32) || timestamp as u64 LITTLE-endian(8) || private(1)
 *
 * A move is always written to a public room, so `private` is 0. The
 * `timestamp` MUST be the same one that went into the PoW challenge and the
 * same one submitted over RPC — signing a different timestamp than is
 * submitted is the classic silent-invalid-signature bug this repo has hit
 * before (see swimchain-react/src/lib/signAction.ts's header).
 */
function actionSignaturePreimage(contentHash: Uint8Array, timestamp: number): Uint8Array {
  const msg = new Uint8Array(41);
  msg.set(contentHash, 0);
  new DataView(msg.buffer).setBigUint64(32, BigInt(timestamp), true); // little-endian
  msg[40] = 0; // public space
  return msg;
}

/** Signs a raw byte string, returning the 64-byte ed25519 signature. Either a
 *  local keypair or the node's own `sign_message` (see `shoalRpc.ts`'s
 *  `nodeIdentity`) — this module never sees a private key. */
export type SignFn = (msg: Uint8Array) => Promise<Uint8Array>;

/** The six PoW/signature fields every content-writing RPC on this node takes,
 *  named exactly as the wire names them. */
export interface MinedAction {
  readonly pow_nonce: number;
  readonly pow_difficulty: number;
  readonly pow_nonce_space: string;
  readonly pow_hash: string;
  readonly signature: string;
  readonly timestamp: number;
}

/**
 * Mine and canonically sign one action over `content`, whose SHA-256 is the
 * `content_hash` the node re-derives for itself. What `content` must be is
 * defined by the RPC being called, and the three differ:
 *
 *   create_space  -> the space NAME bytes           (`sha256(name)`, methods.rs
 *                    `create_space` — NOT the `space:`-prefixed preimage
 *                    `@swimchain/react`'s `createSpaceChallenge` helper uses;
 *                    that helper mines against a hash the server never checks,
 *                    and every submission fails with "hash mismatch")
 *   submit_post   -> `${title}\n\n${body}`
 *   submit_reply  -> `body`
 *
 * Exported because a room has a lifecycle beyond moves — something has to
 * create the space and the room post — and re-deriving these byte layouts in
 * a second place is exactly how the two drift apart. `sendPresence`/`sendEat`
 * go through this same function.
 */
export async function mineAndSignAction(
  actionType: number,
  content: Uint8Array,
  authorIdHex: string,
  sign: SignFn,
  timestampSecs: number,
  profile: PowProfile,
): Promise<MinedAction> {
  const contentHash = await sha256(content);
  const authorId = hexToBytes(authorIdHex);
  const difficulty = difficultyFor(profile, actionType);

  const solution = await minePow(actionType, contentHash, authorId, timestampSecs, difficulty, profile);

  const signature = await sign(actionSignaturePreimage(contentHash, timestampSecs));
  if (signature.length !== 64) {
    throw new Error(`shoalSend: expected a 64-byte signature, got ${signature.length}`);
  }

  return {
    // `pow_nonce` is a `u64` server-side, so it goes over the wire as a JSON
    // number. Mining starts at 0 and regtest needs ~16 attempts, so it is
    // nowhere near 2^53.
    pow_nonce: solution.nonce,
    pow_difficulty: difficulty,
    pow_nonce_space: bytesToHex(solution.nonceSpace),
    pow_hash: bytesToHex(solution.hash),
    signature: bytesToHex(signature),
    timestamp: timestampSecs,
  };
}

// ---------------------------------------------------------------------------
// The room a client writes into
// ---------------------------------------------------------------------------

/**
 * Re-exported from `shoalRpc.ts`, which is where these now live so that
 * `shoalLive.ts` — the ONE module a hex space id actually breaks — can reach
 * them without importing the write path. Kept exported here because callers
 * (and the regtest smoke) already import them from this module.
 */
export { isWireSpaceId, assertWireSpaceId } from './shoalRpc';

/** Everything one client needs to write a move into one room. */
export interface SendCtx {
  /** Where the node is and how to authenticate. */
  readonly auth: RpcAuth;
  /**
   * The room's space, in the node's bech32m wire form (`sp1…`) — the SAME
   * string that must be handed to `startLive`. Format-checked on every write;
   * see `isWireSpaceId` for why that check earns its place.
   */
  readonly spaceId: string;
  /** The room post every move is a reply to (`sha256:…`). */
  readonly roomContentId: string;
  /** This client's swimmer id: its 32-byte ed25519 public key, hex. The same
   *  value the node reports as a reply's `author_id`, and therefore the same
   *  value `repliesToLog` folds a `LogEntry.id` from. */
  readonly authorIdHex: string;
  /** Signs the 41-byte action preimage; returns the raw 64-byte signature. */
  readonly sign: SignFn;
  /** Skips `get_info` detection when the caller already knows the profile.
   *  Omit it and the profile is detected once per endpoint and cached. */
  readonly powProfile?: PowProfile;
}

interface SubmitReplyResult {
  content_id: string;
  broadcast?: boolean;
  recipients?: number;
}

/**
 * Mine, sign and submit one already-encoded body — a move or a checkpoint, both
 * of which are replies to the room post. Returns the new reply's `content_id`
 * — the same `sha256:…` string that comes back as a `LogEntry.hash` (or a
 * `CheckpointEntry.hash`) from `splitRoomReplies`, so a caller can recognise
 * its own write in the next fetched room.
 */
async function submitToRoom(ctx: SendCtx, body: string, ms: number): Promise<string> {
  assertWireSpaceId(ctx.spaceId, 'shoalSend: ctx.spaceId');

  const profile = ctx.powProfile ?? (await powProfileFor(ctx.auth));

  // Unix SECONDS, derived from the caller's authoring millisecond — never
  // from a clock read (see the module header). `ms` is already validated
  // non-negative by encodePresence/encodeEat, so floor === trunc here.
  const timestamp = Math.floor(ms / 1000);

  // The node re-derives `content_hash = sha256(body)` itself and never trusts
  // ours (methods.rs `submit_reply`), so the body is the whole payload.
  const mined = await mineAndSignAction(
    ACTION_TYPE_REPLY, new TextEncoder().encode(body), ctx.authorIdHex, ctx.sign, timestamp, profile,
  );

  const result = await rpcCall<SubmitReplyResult>(ctx.auth, 'submit_reply', {
    parent_id: ctx.roomContentId,
    body,
    author_id: ctx.authorIdHex,
    ...mined,
  });
  return result.content_id;
}

/**
 * Write this client's swim vector (and optional speech) into the room.
 *
 * `vec.t` is both the wire body's single timestamp and the source of the
 * action's own — one instant, authored once, with nowhere for two values to
 * disagree (shoalWire.ts's "one timestamp, not two"). `encodePresence`
 * throws a `RangeError` on an out-of-domain vector before any work is done,
 * so a caller bug costs nothing but the exception.
 */
export async function sendPresence(ctx: SendCtx, vec: Vec, say?: string): Promise<string> {
  return submitToRoom(ctx, encodePresence(vec, ctx.authorIdHex, say), vec.t);
}

/**
 * Publish this client's checkpoint for a closed epoch (spec §3.9 point 4) into
 * the same room every move goes to. `cp` is what `advance` returned as
 * `rolled` — never one built by hand, and never `checkpointFrom` called
 * directly (see its own doc: only `rollEpoch` prunes `departed` first, and a
 * checkpoint taken without that prune is a different payload for the same
 * world, which no honest peer agrees with).
 *
 * `nowMs` IS NOT PART OF THE CHECKPOINT and never reaches the wire body. It is
 * the publisher's own clock, used only for the action envelope's `timestamp`,
 * which the node checks against a window (600 s back, 60 s forward —
 * action_pow.rs:79-82) and which is not covered by `content_hash =
 * sha256(body)`. That separation is deliberate and load-bearing: two honest
 * publishers roll the same boundary milliseconds apart, so if their clocks
 * reached the BODY they would compute different payloads for one world and
 * every joiner would read an honest pair as a divergence. The body's only time
 * is the epoch inside the payload.
 *
 * This module still reads no clock of its own — `nowMs` is passed in, exactly
 * as `ms` is for an eat claim.
 *
 * A checkpoint body is KB-scale rather than the ~50 bytes a move costs (see
 * shoalWire.ts's size measurements), but PoW and mempool eviction are priced
 * per ACTION, not per byte (builder.rs:92), so publishing one costs the same
 * mine as a single vector — once an hour.
 */
export async function sendCheckpoint(ctx: SendCtx, cp: Checkpoint, nowMs: number): Promise<string> {
  return submitToRoom(ctx, encodeCheckpoint(cp, ctx.authorIdHex), nowMs);
}

/**
 * Claim a bite from a bloom cell at the instant `ms`.
 *
 * `ms` is not optional and cannot be defaulted here: it is the instant the
 * fold judges the claim against (`canEat` -> `reckon(fish.vec, claim.ms)`),
 * and nothing in `src/lib/` may read a clock. See the module header.
 */
export async function sendEat(ctx: SendCtx, cell: number, ms: number): Promise<string> {
  return submitToRoom(ctx, encodeEat(cell, ms, ctx.authorIdHex), ms);
}
