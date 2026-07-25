/**
 * Pure fryer-scheduling rules, factored out of crunch.worker.ts and
 * useFryers.ts so they can be unit-tested without a Worker or a DOM — both
 * are awkward to exercise under this repo's plain-tsx test scripts (see
 * task-9-report.md). Nothing here touches Argon2id, hash-wasm, or React; it
 * only encodes the invariants that keep fryers from wasting or corrupting
 * work:
 *
 *   - a nonce may never cross the u64 ceiling bankBody/parseMove enforce
 *     (bankBody asserts it, parseMove's regex caps at 16 hex chars)
 *   - a chip is only bankable at >= BANK_MIN_BITS (the fold's own gate)
 *   - every chip any fryer ever grinds, across its whole lifetime, gets a
 *     distinct authoring-ms, so two grinds never share a preimage and never
 *     collide in seenProofs (chipsEngine.ts), which keys on
 *     `author:ms:nonce`
 */
import { BANK_MIN_BITS } from './chipsConst';

export const U64_MAX = 2n ** 64n - 1n;

/**
 * The next nonce to try, or null once incrementing would cross the u64
 * ceiling. A grinder must STOP there, not wrap back to 0n — wrapping would
 * silently re-walk nonces it (or the fold) may already have seen under this
 * ms, and bankBody would reject anything past the ceiling anyway.
 * (Unreachable in practice — an 8 MiB Argon2id search would take
 * astronomically longer than the age of the universe to get there — but the
 * guard is cheap and keeps the invariant checkable.)
 */
export function nextNonce(nonce: bigint): bigint | null {
  return nonce >= U64_MAX ? null : nonce + 1n;
}

/**
 * A chip is only worth taking out of its fryer at >= BANK_MIN_BITS; below
 * that the fold (chipsEngine.ts's `rejected-bits` branch) refuses it, so
 * banking it would spend a submit + PoW for nothing.
 */
export function isBankable(bits: number): boolean {
  return bits >= BANK_MIN_BITS;
}

/**
 * Hands out strictly increasing — and therefore always-distinct —
 * authoring-ms values. One allocator per hook instance, held for the whole
 * component lifetime (not recreated per effect run): every fryer's initial
 * chip, and every chip a fryer starts after a bank, draws from the same
 * sequence, so no two grinds ever share an ms even across a `count` change
 * or a rebank. A fresh `Date.now()` reseeded per effect run (naively,
 * `ms = Date.now() + fryerIndex`) can collide across two effect runs that
 * land in the same millisecond (React re-renders faster than 1ms apart, and
 * StrictMode intentionally double-invokes effects) — a monotonic counter
 * has no such window.
 */
export function createMsAllocator(seed: number = Date.now()): () => number {
  let last = Math.max(1, Math.floor(seed));
  return function allocate(): number {
    last += 1;
    return last;
  };
}
