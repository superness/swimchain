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
 *   - `bank(index)` does NOT terminate+recreate that fryer's worker (thread
 *     spin-up plus re-wiring onmessage on every single bank click adds up);
 *     it reuses the worker and sends a fresh `start` with a new ms. The
 *     worker's own `generation` counter (crunch.worker.ts) discards any
 *     result from the grind that `start` superseded, so a hash that was
 *     already in flight for the OLD chip can't post a stale update tagged
 *     with a chip that's no longer in the basket.
 *
 * Every ms handed to a worker — a fryer's first chip AND every chip it
 * starts after a bank — comes from ONE allocator per hook instance
 * (fryerLogic.ts's createMsAllocator), held in a ref so it survives effect
 * re-runs. That's what guarantees two fryers, or one fryer across a rebank,
 * never grind the same preimage: see fryerLogic.test.ts for why a fresh
 * `Date.now() + index` re-seeded per effect run doesn't have that guarantee
 * (two effect runs can land in the same millisecond) and a monotonic counter
 * does.
 */
import { useEffect, useRef, useState } from 'react';
import type { CrunchReq, CrunchRes } from './crunch.worker';
import { createMsAllocator, isBankable } from './fryerLogic';

/** What the UI needs to render a basket. The nonce is intentionally not
 *  part of this shape — nothing renders it — but IS tracked internally
 *  (see `latest` below) so `bank()` can hand it over when the player cashes
 *  a chip in. */
export interface FryerChip {
  ms: number;
  bits: number;
  attempts: number;
}

/** Internal per-fryer record: everything FryerChip has, plus the nonce
 *  `bank()` needs. This, not React state, is the source of truth read by
 *  `bank()` — it's updated synchronously in the same handler that calls
 *  `setChips`, so there's no risk of reading a stale nonce alongside a
 *  fresher bits/ms pair (or vice versa) the way splitting the read across
 *  state and a second ref could. */
interface FryerRecord extends FryerChip {
  nonce: bigint;
}

function placeholder(ms: number): FryerRecord {
  return { ms, bits: -1, attempts: 0, nonce: 0n };
}

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

  useEffect(() => {
    if (!authorIdHex || !tableId || count <= 0) {
      workers.current = [];
      latest.current = [];
      setChips([]);
      return;
    }
    const allocate = allocatorRef.current!;

    function applyMessage(index: number, msg: CrunchRes): void {
      const prev = latest.current[index];
      // A message for an ms this basket has already moved past (e.g. a
      // 'crisper' from a grind bank() has since superseded) is stale —
      // this is a second, hook-side line of defense on top of the
      // worker's own `generation` guard, not a substitute for it.
      if (prev && msg.ms !== prev.ms) return;
      if (msg.type === 'exhausted') return;
      const next: FryerRecord = {
        ms: msg.ms,
        bits: msg.bits,
        attempts: msg.attempts,
        nonce: msg.type === 'crisper' ? BigInt('0x' + msg.nonce) : (prev?.nonce ?? 0n),
      };
      latest.current[index] = next;
      setChips((cur) => {
        const out = cur.slice();
        out[index] = { ms: next.ms, bits: next.bits, attempts: next.attempts };
        return out;
      });
    }

    const initial: FryerRecord[] = [];
    const made: Worker[] = [];
    for (let i = 0; i < count; i++) {
      const ms = allocate();
      initial.push(placeholder(ms));
      made.push(startWorker(authorIdHex, tableId, ms, (msg) => applyMessage(i, msg)));
    }
    latest.current = initial;
    workers.current = made;
    setChips(initial.map(({ ms, bits, attempts }) => ({ ms, bits, attempts })));

    return () => {
      for (const w of made) stopWorker(w);
    };
  }, [count, authorIdHex, tableId]);

  /**
   * Bank the chip in fryer `index`: returns null if there isn't one yet or
   * it hasn't reached BANK_MIN_BITS (the fold would reject it as
   * `rejected-bits` anyway — see chipsEngine.ts — so there's no point
   * spending a submit + action-PoW on it). On a successful take, that
   * fryer's worker is handed a brand-new ms and starts grinding its next
   * chip immediately — "one chip at a time" — while the returned nonce is
   * the caller's to turn into a `bank` move (chipsBody.ts's `bankBody`).
   */
  function bank(index: number): { nonce: bigint; bits: number; ms: number } | null {
    const chip = latest.current[index];
    const worker = workers.current[index];
    if (!chip || !worker || !isBankable(chip.bits)) return null;

    const result = { nonce: chip.nonce, bits: chip.bits, ms: chip.ms };

    const allocate = allocatorRef.current!;
    const ms = allocate();
    latest.current[index] = placeholder(ms);
    setChips((cur) => {
      const out = cur.slice();
      out[index] = { ms, bits: -1, attempts: 0 };
      return out;
    });

    const nextMsg: CrunchReq = { type: 'start', authorIdHex, tableId, ms };
    worker.postMessage(nextMsg);

    return result;
  }

  return { chips, bank };
}
