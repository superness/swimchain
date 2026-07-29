/**
 * Move-body grammar builders — the exact inverse of `parseMove` (chipsEngine.ts).
 *
 * Deliberately dependency-free (only `chipsConst`, no RPC/PoW/signing imports):
 * these are pure string builders, and putting them in `host.ts` would drag the
 * whole RPC/PoW import chain onto their test path for no reason — which is
 * exactly what made an earlier version of their test unrunnable in a worktree
 * where the workspace's other packages hadn't been `npm install`ed yet.
 * There are three builders below; `host.ts` re-exports all three —
 * `bankBody`, `buyBody` and `bankBatchBody` — for callers that only import
 * the seam. The emitter half of the batching plan (the queue, the sender
 * loop) is what actually calls `bankBatchBody` now; this file's own grammar
 * is unchanged and stays consensus-frozen.
 */
import { BANK_MIN_BITS, MAX_BITS, MAX_BATCH } from './chipsConst';
// `import type` only — erased at compile time, so the dependency-free property
// above still holds at runtime while `bankBatchBody`'s parameter stays pinned to
// the same shape the fold parses into, rather than a structural copy that can
// drift away from it.
import type { ChipEntry } from './chipsEngine';

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

/** Build a `dip` move body: `dip <amount>#<ms>~` — the pot-x-multi game's
 *  self-declared cash-out (see chipsEngine's ParsedMove doc for why no
 *  proof). The asserts mirror parseMove's bounds: a body the fold rejects is
 *  a silently lost dip. */
export function dipBody(amount: number, ms: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0 || String(amount).length > 15) {
    throw new Error(`dipBody: amount must be a safe non-negative integer of <=15 digits, got ${amount}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`dipBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `dip ${amount}#${ms}~`;
}

/** Build a `tip` move body: `tip#<ms>~`. No argument by design — the fold
 *  computes the salt itself (chipsEngine.saltFor), so nothing about this
 *  move is client-declared. */
export function tipBody(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`tipBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `tip#${ms}~`;
}

/**
 * Build a `broke` move body: `broke#<ms>~`.
 *
 * NO ARGUMENT, exactly like `tip`. The band is whichever comes next and the
 * fold works that out from state it can see; the char it pays is permanent,
 * so a body that could name its own depth could claim the lava on a fresh
 * table. `parseMove` refuses `broke 5` outright rather than range-checking
 * it — see chipsEngine.broke.test.ts.
 */
/**
 * Build a `broke` move body: `broke <paid>#<ms>~`.
 *
 * `paid` is the worth of the chip FED TO THE BOSS. It buys the band and pays
 * the player nothing — no crumbs, no lifetime.
 *
 * It used to be a bare `broke#<ms>~` alongside a separate ordinary `dip`, so
 * the winning chip was banked as well as spent. That is what broke the descent
 * on 2026-07-29: the porcelain demands ONE dip worth more than everything else
 * banked this run, so the chip the fight requires is enormous by construction —
 * a live 4.8 BILLION crumb dip carried lifetime past all six band floors at
 * once and dropped the player out the far side having fought one boss.
 * Operator: "arguably I shouldn't get to collect those crumbs — I paid it to
 * beat the boss."
 *
 * One action, so the payment cannot be separated from the break by reordering
 * or by a dropped reply. The legacy bare form is still folded (one such reply
 * exists on mainnet) and simply pays nothing, which is the same rule.
 */
export function brokeBody(paid: number, ms: number): string {
  if (!Number.isSafeInteger(paid) || paid < 0) {
    throw new Error(`brokeBody: paid must be a non-negative safe integer, got ${paid}`);
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`brokeBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `broke ${paid}#${ms}~`;
}

/**
 * Build a `burn` move body: `burn <upgrade-key>#<ms>~`.
 *
 * Names its key, unlike `broke` — here the CHOICE is the move, and naming it
 * forges nothing: the fold still checks you own the jar and computes the
 * refund from the catalog, so the worst a hostile body can do is burn its own
 * property at the published rate.
 */
export function burnBody(key: string, ms: number): string {
  if (!/^[a-z0-9]+$/.test(key)) throw new Error(`burnBody: bad key ${key}`);
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`burnBody: ms must be a positive safe integer, got ${ms}`);
  }
  return `burn ${key}#${ms}~`;
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
export function bankBatchBody(chips: ChipEntry[], authoringMs: number): string {
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
