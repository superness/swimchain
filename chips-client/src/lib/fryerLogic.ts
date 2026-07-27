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
 * Put fryer `index` back on a FRESH chip at `newMs`, or `null` if this basket
 * has no such fryer (it shrank, or was cleared).
 *
 * Used when a fryer's worker dies and has to be replaced (useFryers.ts's
 * `onerror` path). The replacement MUST get a new ms and a fresh placeholder
 * rather than resume the dead worker's ms: a restarted grind walks nonces from
 * 0 again and its first message would be a `crisper` at ~0 bits, which
 * `applyFryerMessage` writes in unconditionally — silently DOWNGRADING a basket
 * that may already hold a good chip. A new ms means the dead chip's record is
 * replaced outright and every message the dead worker may still have in flight
 * is dropped by the ms guard.
 *
 * The cost is honest and unavoidable: whatever that fryer had ground is lost,
 * because a chip's proof is bound to its ms (see chipsPow's preimage). In the
 * failure this exists for — a worker whose module script never loaded — there
 * is nothing to lose: it never produced an attempt.
 */
export function restartRecord(
  records: readonly FryerRecord[],
  index: number,
  newMs: number
): FryerRecord[] | null {
  if (!records[index]) return null;
  const out = records.slice();
  out[index] = placeholderRecord(newMs);
  return out;
}

/** One fryer to start: which basket slot, and the ms its chip is bound to. */
export interface StartedFryer {
  index: number;
  ms: number;
}

/**
 * Move a basket of `records` to `count` fryers with the LEAST possible churn:
 * which slots to stop, which to start, and the records that result.
 *
 * This exists because rebuilding the whole basket on a count change is not a
 * tidiness question — it CONFISCATES WORK. A fryer's chip is Argon2id seconds
 * the player has already spent, and terminating its worker throws them away
 * (`terminate()` being the only thing that can stop a running grind — see
 * `grindLoop` below). Measured live 2026-07-26: a count change destroyed
 * 12-bit / 4352-attempt chips in every basket that already existed, and buying
 * a fryer upgrade did it three times over (the fold briefly forgets and
 * re-remembers the upgrade around its confirmation). Buying a fryer is a
 * REWARD; it must not quietly cost the player every other basket.
 *
 * So:
 *   - growing keeps every existing record BY IDENTITY (same object: same ms,
 *     bits, attempts and nonce) and appends placeholders for the new slots
 *     only. The workers behind slots 0..n-1 are never told anything, so their
 *     grinds continue uninterrupted.
 *   - shrinking drops ONLY the removed tail and reports exactly those indices
 *     as `stopped`. Surviving slots keep their records by identity.
 *   - an unchanged count is a true no-op: nothing stopped, nothing started,
 *     and — load-bearing — NO ms drawn from the allocator.
 *
 * Only the tail ever moves, never an interior slot: `applyFryerMessage` routes
 * a worker's messages by INDEX, so shuffling a live record to a different index
 * would hand it another worker's messages.
 *
 * What this does NOT cover is an identity or table change. Those bind into
 * every chip's Argon2id preimage (chipsPow.ts's `chipPreimage`), so a chip
 * ground for one table can never fold on another and the basket really must be
 * rebuilt. useFryers.ts does that by clearing its records to `[]` before
 * calling this — from `[]` every slot is new, which is exactly right, and is
 * the case the `planResize([], n)` tests cover.
 */
export function planResize(
  records: readonly FryerRecord[],
  count: number,
  allocate: () => number
): { records: FryerRecord[]; started: StartedFryer[]; stopped: number[] } {
  const target = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const started: StartedFryer[] = [];
  const stopped: number[] = [];

  if (target === records.length) return { records: records.slice(), started, stopped };

  if (target < records.length) {
    for (let i = target; i < records.length; i++) stopped.push(i);
    return { records: records.slice(0, target), started, stopped };
  }

  const out = records.slice();
  for (let i = records.length; i < target; i++) {
    const ms = allocate();
    out.push(placeholderRecord(ms));
    started.push({ index: i, ms });
  }
  return { records: out, started, stopped };
}

/**
 * How long to wait before respawning a fryer whose worker died: 1s, then
 * doubling to a 30s ceiling.
 *
 * A dead fryer must keep trying — the dominant cause is a transient failure to
 * fetch the worker's module script (an offline moment, a dev-server hiccup, a
 * chunk that 404s against a tab left open across a redeploy), and those heal on
 * their own. But it must not hammer: a permanently broken build would otherwise
 * spawn a worker per frame. The ceiling keeps a long outage at two attempts a
 * minute, and the game resumes by itself the moment the fetch succeeds.
 */
export function nextRetryDelay(prev: number): number {
  if (!Number.isFinite(prev) || prev <= 0) return 1000;
  return Math.min(prev * 2, 30_000);
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
  /** Return control to the host's EVENT LOOP (a macrotask, e.g.
   *  `new Promise(r => setTimeout(r, 0))`) — NOT a microtask, which would
   *  change nothing. Called every `YIELD_EVERY` attempts so queued messages
   *  (a `start` for the next chip after a bank) actually get delivered to a
   *  worker mid-grind. This is what made fryer workers REUSABLE: before it,
   *  the only way to retarget a grinding worker was `terminate()`, which cost
   *  a fresh 8 MiB Argon2id WASM instantiation per bank — the allocation
   *  churn behind the live "WebAssembly.instantiate(): Out of memory"
   *  failures (present since day one; reported bricking the game 2026-07-27). */
  yieldToHost(): Promise<void>;
}

/** Attempts between yields. At ~60 hashes/sec this is ~7 yields/sec; a
 *  clamped setTimeout(0) costs ~1ms each, so under 1% throughput for a
 *  worker that can actually hear its mail. */
export const YIELD_EVERY = 8;

/**
 * One chip's grind: hash, track the best crispness so far, report it.
 *
 * THE SCHEDULING FACT THIS ENCODES — and, since 2026-07-27, WORKS AROUND
 * with `yieldToHost` (see GrindDeps) instead of surrendering to:
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
 * The periodic macrotask yield is the fix: every YIELD_EVERY attempts the
 * loop genuinely returns to the event loop, queued messages are delivered,
 * `generation` can move, and `isCurrent()` becomes a REAL stop button. A
 * running fryer is now retargeted with a `start` message and its 8 MiB WASM
 * instance lives for the whole session; `terminate()` remains only for true
 * teardown (unmount, fryer-count shrink, a dead worker being replaced).
 */
export async function grindLoop(ms: number, deps: GrindDeps): Promise<void> {
  let nonce: bigint | null = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;

  while (deps.isCurrent() && nonce !== null) {
    // The yield comes FIRST in the iteration so even a grind whose hash
    // rejects on attempt 1 (a broken WASM load) has already given the host a
    // chance to deliver mail at least once per YIELD_EVERY window.
    if (attempts > 0 && attempts % YIELD_EVERY === 0) {
      await deps.yieldToHost();
      if (!deps.isCurrent()) return; // superseded while yielded — the common retarget path now
    }
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
