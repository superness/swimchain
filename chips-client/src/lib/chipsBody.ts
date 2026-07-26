/**
 * Move-body grammar builders — the exact inverse of `parseMove` (chipsEngine.ts).
 *
 * Deliberately dependency-free (only `chipsConst`, no RPC/PoW/signing imports):
 * these are pure string builders, and putting them in `host.ts` would drag the
 * whole RPC/PoW import chain onto their test path for no reason — which is
 * exactly what made an earlier version of their test unrunnable in a worktree
 * where the workspace's other packages hadn't been `npm install`ed yet.
 * `host.ts` re-exports both for callers that only import the seam.
 */
import { BANK_MIN_BITS, MAX_BITS, MAX_BATCH } from './chipsConst';

/**
 * Build a `bank` move body. The fold's parser (`parseMove` in chipsEngine.ts)
 * requires `bank <bits> <nonce_hex>#<ms>~` with the nonce matching
 * `[0-9a-fA-F]{1,16}` exactly — a malformed body doesn't error, it silently
 * becomes an unparseable reply and the move (and whatever PoW/broadcast cost
 * went into it) is lost forever. These asserts catch that before the grind,
 * not after.
 */
export function bankBody(bits: number, nonce: bigint, ms: number): string {
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) {
    throw new Error(`bankBody: bits must be an integer in [0, ${MAX_BITS}], got ${bits}`);
  }
  if (nonce < 0n || nonce > 0xffffffffffffffffn) {
    throw new Error(`bankBody: nonce must fit in an unsigned 64-bit int, got ${nonce}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`bankBody: ms must be a positive safe integer, got ${ms}`);
  }
  // BigInt#toString(16) is always lowercase, satisfying parseMove's regex.
  return `bank ${bits} ${nonce.toString(16)}#${ms}~`;
}

/** Build a `buy` move body: `buy <upgrade-key>#<ms>~`. */
export function buyBody(key: string, ms: number): string {
  if (!/^[a-z0-9]+$/.test(key)) {
    throw new Error(`buyBody: key must match /^[a-z0-9]+$/, got ${JSON.stringify(key)}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`buyBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `buy ${key}#${ms}~`;
}

/**
 * The inverse of `parseMove`'s batch form.
 *
 * Asserts rather than trusts: a body the fold would reject whole is a silently
 * lost pile of mined proofs, and the caller has already spent the CPU.
 */
export function bankBatchBody(
  chips: { ms: number; bits: number; nonce: bigint }[],
  authoringMs: number
): string {
  if (chips.length === 0) throw new Error('bankBatchBody: empty batch');
  if (chips.length > MAX_BATCH) throw new Error(`bankBatchBody: ${chips.length} chips exceeds MAX_BATCH ${MAX_BATCH}`);
  if (!Number.isSafeInteger(authoringMs) || authoringMs <= 0) throw new Error('bankBatchBody: bad authoring ms');

  const parts = chips.map((c) => {
    if (!Number.isInteger(c.bits) || c.bits < BANK_MIN_BITS || c.bits > MAX_BITS) {
      throw new Error(`bankBatchBody: bits ${c.bits} outside [${BANK_MIN_BITS}, ${MAX_BITS}]`);
    }
    if (c.nonce < 0n || c.nonce > 0xffffffffffffffffn) throw new Error('bankBatchBody: nonce outside u64');
    if (!Number.isSafeInteger(c.ms) || c.ms <= 0) throw new Error('bankBatchBody: bad chip ms');
    return `${c.ms}:${c.bits}:${c.nonce.toString(16)}`;
  });

  return `bank ${parts.join(',')}#${authoringMs}~`;
}
