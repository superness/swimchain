/**
 * Runs `count` fryers, one Web Worker each (crunch.worker.ts), and exposes
 * the current chip in every basket plus a way to bank one. `count` comes
 * from the fold's `fryers` field (the `fryer2`/`fryer3`/`fryer4` upgrades in
 * chipsConst.ts/chipsEngine.ts) — buying a fryer really does add a grinder.
 *
 * Lifecycle, all load-bearing:
 *   - workers are (re)created in an effect keyed on [count, authorIdHex,
 *     tableId] — any of those changing means every existing grind's
 *     preimage is stale, so the whole basket restarts. `chips` is reset to
 *     `count` fresh placeholders at the SAME time, so a `count` decrease
 *     can't leave a phantom fryer's stale chip in the returned array (its
 *     entry would otherwise just sit there, never overwritten, since no
 *     worker at that index exists anymore to correct it).
 *   - the cleanup returned from that effect stops and terminates every
 *     worker IT created — not whatever's currently in the ref — so a
 *     StrictMode double-invoke (mount -> cleanup -> mount) can't leak the
 *     first mount's workers no matter how fast the second mount follows.
 *     A leaked worker keeps burning a core at 8 MiB/hash forever, and two
 *     copies of `count` workers running at once would double that.
 *   - `bank(index)` TERMINATES that fryer's worker and starts a fresh one.
 *     It used to reuse the worker and post it a new `start`, on the theory
 *     that thread spin-up on every bank click adds up. That never worked:
 *     a running grind starves its own worker's message queue (the
 *     measurement is in `grindLoop`'s doc comment in fryerLogic.ts), so the
 *     `start` was never delivered, the fryer kept grinding the chip that
 *     had already been banked, every message it posted was dropped by the
 *     ms guard, and the basket sat at `bits: -1` for the rest of the
 *     session. Observed live on 2026-07-25: 100 s after a bank, still -1.
 *     `terminate()` is the only thing that stops a running grind, so the
 *     replacement worker is not an optimisation choice — it is the only
 *     correct implementation. It also costs nothing that matters: a bank
 *     happens once every tens of seconds at best, against a grind that
 *     hashes at ~20-60 ms per attempt.
 *
 *     The replacement is written into `workers.current`, which IS the array
 *     the owning effect's cleanup closes over — so a banked-and-replaced
 *     worker is still terminated on unmount and nothing leaks.
 *
 *     Both stale-message guards are kept anyway. See `applyFryerMessage`'s
 *     doc in fryerLogic.ts: a message a worker posted just before it was
 *     terminated can still be delivered afterwards, and the ms check is
 *     what drops it.
 *
 * Every ms handed to a worker — a fryer's first chip AND every chip it
 * starts after a bank — comes from ONE allocator per hook instance
 * (fryerLogic.ts's createMsAllocator), held in a ref so it survives effect
 * re-runs. That's what guarantees two fryers, or one fryer across a rebank,
 * never grind the same preimage: see fryerLogic.test.ts for why a fresh
 * `Date.now() + index` re-seeded per effect run doesn't have that guarantee
 * (two effect runs can land in the same millisecond) and a monotonic counter
 * does.
 *
 * The two state transitions that actually matter here — dropping a stale
 * worker message (`applyFryerMessage`) and retiring+reallocating a chip on
 * bank (`takeChip`) — are pure functions over `FryerRecord[]` and live in
 * fryerLogic.ts, not here, specifically so they have real tests
 * (fryerLogic.test.ts) despite this file's Worker/React plumbing being
 * untestable under this repo's plain-tsx harness.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrunchReq, CrunchRes } from './crunch.worker';
import {
  createMsAllocator, isBankable, applyFryerMessage, takeChip, placeholderRecord, toFryerChip,
} from './fryerLogic';
import type { FryerChip, FryerRecord } from './fryerLogic';

export type { FryerChip };

function startWorker(
  authorIdHex: string,
  tableId: string,
  ms: number,
  onMessage: (msg: CrunchRes) => void
): Worker {
  const w = new Worker(new URL('./crunch.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<CrunchRes>) => onMessage(e.data);
  const start: CrunchReq = { type: 'start', authorIdHex, tableId, ms };
  w.postMessage(start);
  return w;
}

function stopWorker(w: Worker): void {
  const stop: CrunchReq = { type: 'stop' };
  w.postMessage(stop);
  w.terminate();
}

export function useFryers(count: number, authorIdHex: string, tableId: string) {
  const workers = useRef<Worker[]>([]);
  const latest = useRef<FryerRecord[]>([]);
  const [chips, setChips] = useState<FryerChip[]>([]);
  const allocatorRef = useRef<() => number>();
  if (!allocatorRef.current) allocatorRef.current = createMsAllocator();

  // Hoisted out of the effect because `bank()` wires it onto the replacement
  // worker it creates. Stable: it touches only refs and `setChips`, both of
  // which React guarantees are constant for the life of the hook — so having
  // it in the effect's dependency list below cannot cause an extra restart.
  const applyMessage = useCallback((index: number, msg: CrunchRes): void => {
    const updated = applyFryerMessage(latest.current, index, msg);
    if (!updated) return; // stale ms, exhausted, or an index this basket no longer tracks
    latest.current = updated;
    setChips(updated.map(toFryerChip));
  }, []);

  useEffect(() => {
    if (!authorIdHex || !tableId || count <= 0) {
      workers.current = [];
      latest.current = [];
      setChips([]);
      return;
    }
    const allocate = allocatorRef.current!;

    const initial: FryerRecord[] = [];
    const made: Worker[] = [];
    for (let i = 0; i < count; i++) {
      const ms = allocate();
      initial.push(placeholderRecord(ms));
      made.push(startWorker(authorIdHex, tableId, ms, (msg) => applyMessage(i, msg)));
    }
    latest.current = initial;
    workers.current = made;
    setChips(initial.map(toFryerChip));

    return () => {
      // `made` IS `workers.current` (same array object), so a worker `bank()`
      // swapped in mid-life is the one terminated here — while still being the
      // array THIS effect run created, which is what keeps a StrictMode
      // mount -> cleanup -> mount from leaking the first mount's workers.
      for (const w of made) stopWorker(w);
    };
  }, [count, authorIdHex, tableId, applyMessage]);

  /**
   * Bank (take) the chip in fryer `index`. Returns `null` if there isn't
   * one yet or it hasn't reached `BANK_MIN_BITS` (the fold would reject it
   * as `rejected-bits` anyway — see chipsEngine.ts — so there's no point
   * spending a submit + action-PoW on it).
   *
   * HARD CONTRACT for callers (Task 10 and beyond): this is DESTRUCTIVE.
   * A successful call immediately retires the chip from the basket and
   * starts that fryer grinding its NEXT chip ("one chip at a time") — the
   * returned `{nonce, bits, ms}` is the ONLY remaining reference to that
   * proof; this hook keeps no second copy anywhere. If turning the result
   * into a submitted `bank` move then fails (offline, sponsor rejection,
   * the action-PoW step erroring, etc.), a SECOND call to `bank(index)`
   * will NOT hand back the same chip — the basket has already moved on,
   * so it returns `null` (nothing bankable yet) or a different, newer chip.
   *
   * The mined proof itself does not expire and isn't tied to being "in" a
   * fryer — a `{nonce, bits, ms}` triple returned here is valid to submit
   * at any later time. The correct recovery from a failed submit is to
   * retry submission with the SAME returned object (e.g. from a
   * pending-submit queue the caller holds), never to call `bank(index)`
   * again expecting to "get it back."
   */
  function bank(index: number): { nonce: bigint; bits: number; ms: number } | null {
    const worker = workers.current[index];
    const chip = latest.current[index];
    if (!worker || !chip || !isBankable(chip.bits)) return null;

    const newMs = allocatorRef.current!();
    const { taken, records } = takeChip(latest.current, index, newMs);
    if (!taken) return null; // defensive: the isBankable check above should already guarantee this

    latest.current = records;
    setChips(records.map(toFryerChip));

    // TERMINATE, then start a replacement. Posting a `start` to the running
    // worker instead does nothing at all: it is mid-grind, and a grind starves
    // its own message queue (see the hook's header comment). The replacement
    // goes into `workers.current` — the same array the owning effect's cleanup
    // closes over — so it is still terminated on unmount.
    stopWorker(worker);
    workers.current[index] = startWorker(authorIdHex, tableId, newMs, (msg) => applyMessage(index, msg));

    return taken;
  }

  return { chips, bank };
}
