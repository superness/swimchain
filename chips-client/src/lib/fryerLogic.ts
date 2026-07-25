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
import { BANK_MIN_BITS, MAX_BITS } from './chipsConst';
import { leadingZeroBits } from './chipsPow';
import type { CrunchRes } from './crunch.worker';

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
 *
 * NOTE for future readers: `ms` is not merely an identity/salt token — the
 * fold's `orderReplies` (chipsEngine.ts) uses the reply body's authoring-ms
 * as the within-block ordering tiebreak. This allocator deliberately
 * decouples `ms` from wall-clock time, which means banks end up ordered by
 * CHIP-START order rather than bank order. That is safe (deterministic and
 * identical on every client, since the decay clock is `created_at`, never
 * `ms` — see chipsEngine.ts's own comment on that) but it means `ms` here
 * does NOT mean "when this was authored" the way it might elsewhere in this
 * codebase. Don't "fix" this allocator to track real time.
 */
export function createMsAllocator(seed: number = Date.now()): () => number {
  let last = Math.max(1, Math.floor(seed));
  return function allocate(): number {
    last += 1;
    return last;
  };
}

/** What the UI needs to render a basket. No `nonce` — nothing renders it —
 *  but `bank()`/`takeChip()` need it, so the full internal shape is
 *  `FryerRecord` below. */
export interface FryerChip {
  ms: number;
  bits: number;
  attempts: number;
}

/** Internal per-fryer record: everything `FryerChip` has, plus the nonce
 *  a bank needs. This — not any derived React state — is the source of
 *  truth for what a fryer currently holds. */
export interface FryerRecord extends FryerChip {
  nonce: bigint;
}

/** A fresh, not-yet-bankable placeholder for a fryer that just started (or
 *  just restarted after a bank) grinding `ms`. `bits: -1` is a sentinel for
 *  "no hash found yet" — `0` is a real, valid crispness value, so it can't
 *  double as "not started." */
export function placeholderRecord(ms: number): FryerRecord {
  return { ms, bits: -1, attempts: 0, nonce: 0n };
}

export function toFryerChip(r: FryerRecord): FryerChip {
  return { ms: r.ms, bits: r.bits, attempts: r.attempts };
}

/**
 * Apply one crunch-worker message to a fryer basket. Returns the updated
 * array, or `null` if nothing should change: a stale `ms`, an `exhausted`
 * notice, or an index this basket has no record for.
 *
 * That last case is not hypothetical: `Worker.terminate()` does not retract
 * an already-queued message. A message posted by a worker just before it was
 * torn down can still arrive after `count` shrank past `index`, or after
 * `latest.current` was cleared to `[]` entirely (e.g. on logout) — `!prev`
 * must be treated the same as a stale ms, or this would write past the end
 * of the array and hand callers a sparse `FryerChip[]` with holes.
 *
 * `msg.ms !== prev.ms` is the PRIMARY guard, not a backstop. It is the only
 * check that catches the dominant stale-message interleaving in this
 * system: `chipHash`'s promise resolves as a microtask, which drains
 * completely before a same-worker `postMessage({type:'start', ...})` is
 * even dispatched as a macrotask on the worker side. So when a rebank sends
 * a NEW `start` to a worker that is mid-`await chipHash(...)` for the OLD
 * ms, that in-flight grind resumes, rechecks crunch.worker.ts's OWN
 * `generation` counter (still unchanged at that instant — the new `start`
 * hasn't been processed by the worker yet), and posts a stale `crisper` for
 * the retired chip BEFORE the worker-side generation guard has any chance
 * to fire. crunch.worker.ts's generation check handles later interleavings
 * (grinds still in flight after the worker HAS processed the new `start`);
 * this ms check is what actually stops the earlier, more common one — and
 * it works because the allocator (`createMsAllocator`) never reuses an ms,
 * so "same ms" reliably means "same chip," not just "close enough."
 */
export function applyFryerMessage(
  records: readonly FryerRecord[],
  index: number,
  msg: CrunchRes
): FryerRecord[] | null {
  const prev = records[index];
  if (!prev || msg.ms !== prev.ms) return null;
  if (msg.type === 'exhausted') return null;

  const next: FryerRecord = {
    ms: msg.ms,
    bits: msg.bits,
    attempts: msg.attempts,
    nonce: msg.type === 'crisper' ? BigInt('0x' + msg.nonce) : prev.nonce,
  };
  const out = records.slice();
  out[index] = next;
  return out;
}

/**
 * Everything a grind needs from its host, injected so the loop itself can be
 * tested without a Worker, without Argon2id and without a DOM.
 */
export interface GrindDeps {
  /** One Argon2id evaluation of this chip's preimage at `nonce`. */
  hash(nonce: bigint): Promise<Uint8Array>;
  post(msg: CrunchRes): void;
  /** False once this grind has been superseded — see the starvation note below. */
  isCurrent(): boolean;
}

/**
 * One chip's grind: hash, track the best crispness so far, report it.
 *
 * THE SCHEDULING FACT THIS ENCODES, and the reason `bank()` terminates its
 * worker instead of reusing it:
 *
 * `await deps.hash(...)` does NOT return control to the event loop. hash-wasm's
 * argon2id is synchronous WASM behind an async signature — once its module is
 * warm, the returned promise settles in a MICROTASK, and the microtask queue is
 * drained to empty before the event loop ever runs again. This loop enqueues a
 * fresh microtask every iteration, so it never empties, so the host agent's
 * task queues are starved for as long as the grind runs.
 *
 * Measured in Chrome on 2026-07-25: after 30 consecutive `chipHash` calls
 * (~1.8 s of grinding) neither a `setTimeout(…, 0)` nor a `MessageChannel`
 * message scheduled *before* the loop started had run. In a Worker that means
 * an incoming `message` event — including a new `start` after a bank — is NEVER
 * DELIVERED while a grind is in flight, and `isCurrent()` can therefore never
 * flip from outside. The old design posted a fresh `start` to the running
 * worker and waited: the worker kept grinding the retired chip forever, every
 * message it posted was dropped by `applyFryerMessage`'s ms guard, and the
 * basket sat at `bits: -1` for the rest of the session. That was the whole game
 * loop, dead after the first bank.
 *
 * `isCurrent()` is therefore a guard against orderings that CAN happen (a
 * message delivered while the worker sits idle between grinds), not a stop
 * button. The only reliable stop for a running grind is `Worker.terminate()`.
 */
export async function grindLoop(ms: number, deps: GrindDeps): Promise<void> {
  let nonce: bigint | null = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;

  while (deps.isCurrent() && nonce !== null) {
    const hash = await deps.hash(nonce);
    if (!deps.isCurrent()) return; // superseded while awaiting the hash
    attempts++;
    const bits = Math.min(leadingZeroBits(hash), MAX_BITS);
    if (bits > best.bits) {
      best = { nonce, bits };
      deps.post({ type: 'crisper', ms, bits, nonce: nonce.toString(16), attempts });
    } else if (attempts % 16 === 0) {
      deps.post({ type: 'progress', ms, bits: best.bits, attempts });
    }
    nonce = nextNonce(nonce);
  }
  if (nonce === null) deps.post({ type: 'exhausted', ms });
}

/**
 * Retire the chip in fryer `index` and replace it with a fresh placeholder
 * at `newMs`, but ONLY if the current chip is bankable. Always returns a
 * `records` array the caller can apply unconditionally (a no-op copy when
 * `taken` is null), so callers never need an extra branch to decide whether
 * to write back the result.
 *
 * DESTRUCTIVE: a successful take removes the only copy of that proof this
 * basket holds. See useFryers.ts's `bank()` doc for the full contract this
 * implies for callers (retry with the returned object; don't call `bank`
 * again expecting the same chip back).
 */
export function takeChip(
  records: readonly FryerRecord[],
  index: number,
  newMs: number
): { taken: { nonce: bigint; bits: number; ms: number } | null; records: FryerRecord[] } {
  const chip = records[index];
  if (!chip || !isBankable(chip.bits)) {
    return { taken: null, records: records.slice() };
  }
  const out = records.slice();
  out[index] = placeholderRecord(newMs);
  return { taken: { nonce: chip.nonce, bits: chip.bits, ms: chip.ms }, records: out };
}
