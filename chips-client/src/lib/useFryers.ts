/**
 * Runs `count` fryers, one Web Worker each (crunch.worker.ts), and exposes
 * the current chip in every basket plus a way to bank one. `count` comes
 * from the fold's `fryers` field (the `fryer2`/`fryer3`/`fryer4` upgrades in
 * chipsConst.ts/chipsEngine.ts) — buying a fryer really does add a grinder.
 *
 * Lifecycle, all load-bearing:
 *   - the whole basket is built by an OWNING effect keyed on [authorIdHex,
 *     tableId]. Both bind into every chip's Argon2id preimage, so either
 *     changing really does make every existing grind worthless and the
 *     basket restarts from scratch.
 *   - `count` is NOT in that effect's deps, and that is the point. It used
 *     to be, and buying a fryer therefore CONFISCATED every other basket's
 *     chip: a dep change runs the cleanup, the cleanup terminates every
 *     worker, and terminating is the only thing that CAN stop a grind, so
 *     each partly-ground chip died with its worker (measured live: 12-bit /
 *     4352-attempt chips destroyed, three times per purchase). A separate
 *     resize effect now reconciles the delta — fryerLogic.ts's `planResize`
 *     — so growing starts only the new slots and shrinking stops only the
 *     removed tail. `chips` is rewritten from the plan's records at the same
 *     time, so a decrease can't leave a phantom fryer's stale chip in the
 *     returned array (its entry would otherwise just sit there, never
 *     overwritten, since no worker at that index exists anymore).
 *   - the cleanup returned from the OWNING effect stops and terminates every
 *     worker in the array IT created — an array the resize effect and
 *     `bank()` mutate IN PLACE and never replace, precisely so that one
 *     cleanup still sees every live worker. A StrictMode double-invoke
 *     (mount -> cleanup -> mount) therefore can't leak the first mount's
 *     workers no matter how fast the second mount follows. A leaked worker
 *     keeps burning a core at 8 MiB/hash forever.
 *   - `bank(index)` TERMINATES that fryer's worker and starts a fresh one.
 *     It used to reuse the worker and post it a new `start`, on the theory
 *     that thread spin-up on every bank click adds up. That never worked:
 *     a running grind starves its own worker's message queue (the
 *     measurement is in `grindLoop`'s doc comment in fryerLogic.ts), so the
 *     `start` was never delivered, the fryer kept grinding the chip that
 *     had already been banked, every message it posted was dropped by the
 *     ms guard, and the basket sat at `bits: -1` for the rest of the
 *     session. Observed live on 2026-07-25: 100 s after a bank, still -1.
 *     `terminate()` used to be the only thing that stops a running grind (the
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
 *   - a worker that NEVER STARTS is respawned, with a backoff. This is not
 *     defensive tidiness: `new Worker(new URL(...))` fetches a module script,
 *     and a fetch that fails (offline, a dev-server hiccup, a hashed chunk
 *     that 404s for a tab left open across a redeploy) yields a Worker object
 *     that swallows `postMessage` and posts nothing back, for ever. Before
 *     this hook handled `onerror` that was completely invisible — the basket
 *     read `bits: -1, attempts: 0` until the player reloaded the page, i.e.
 *     the game's entire production loop was dead behind a screen that looked
 *     fine. It bites hardest right after buying a fryer upgrade, because a
 *     `count` change is when EVERY worker is torn down and replaced at once,
 *     so one bad moment takes every basket rather than one. See
 *     `startWorker`'s doc for the reproduction.
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
  createMsAllocator, isBankable, applyFryerMessage, takeChip, toFryerChip,
  restartRecord, nextRetryDelay, planResize,
} from './fryerLogic';
import type { FryerChip, FryerRecord } from './fryerLogic';

export type { FryerChip };

/**
 * `onFail` is not optional plumbing — it is the difference between a fryer that
 * stops and a game that stops. A Worker whose module script never loads (an
 * offline moment, a dev-server hiccup, a hashed chunk that 404s for a tab left
 * open across a redeploy) fires ONE `error` event and then does nothing, for
 * ever: it accepts `postMessage` silently and posts nothing back. With no
 * handler that is completely invisible — the basket sits at `bits: -1,
 * attempts: 0` until the player reloads the page, i.e. the whole game loop is
 * dead with no error, no notice and nothing on screen that looks broken.
 *
 * Reproduced 2026-07-26 (chips-client, live tab): with the module server
 * stopped, a fryer-count change spawned three workers, every basket went to
 * `-1/0`, and they stayed there — including after the server came back — until
 * a reload. That matches the live report of both fryers frozen at `-1/0` for
 * 90+ seconds immediately after buying an upgrade, which is exactly the moment
 * this hook tears every worker down and builds new ones.
 */
function startWorker(
  authorIdHex: string,
  tableId: string,
  ms: number,
  onMessage: (msg: CrunchRes) => void,
  onFail: (w: Worker) => void
): Worker {
  const w = new Worker(new URL('./crunch.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<CrunchRes>) => onMessage(e.data);
  w.onerror = (e: ErrorEvent) => {
    // A load failure reports an empty message on most engines; log whatever
    // there is, because a silent fryer is the thing being fixed here.
    console.error('[chips] a fryer never started', e.message || '(no message — the worker script failed to load)');
    onFail(w);
  };
  const start: CrunchReq = { type: 'start', authorIdHex, tableId, ms };
  w.postMessage(start);
  return w;
}

function clearTimers(timers: Set<number>): void {
  for (const t of timers) window.clearTimeout(t);
  timers.clear();
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
    // This fryer is demonstrably alive, so its respawn backoff starts over.
    backoff.current[index] = 0;
    latest.current = updated;
    setChips(updated.map(toFryerChip));
  }, []);

  /**
   * Respawn a fryer whose worker died. See `startWorker`'s doc for what dying
   * looks like (one `error` event, then silence for ever).
   *
   * Three things keep this from resurrecting a fryer that should stay dead:
   *
   *   - `epoch`, bumped by the owning effect on every run AND by its cleanup.
   *     A pending retry from a previous basket (or from an unmounted hook)
   *     no-ops. Cleanup ALSO clears the timers outright — the epoch check alone
   *     would not stop a timer that fires between unmount and page teardown
   *     from allocating a Worker nobody holds a handle to.
   *   - `workers.current[index] === w`: the worker that failed must still be
   *     the one this basket is using. A bank, or a rebuild, already replaced it
   *     otherwise, and that replacement is alive.
   *   - a per-fryer backoff (fryerLogic.ts's `nextRetryDelay`), so a build
   *     that is genuinely broken retries twice a minute rather than per frame.
   *
   * Written as a ref rather than a `useCallback` because `startWorker` calls in
   * BOTH the effect and `bank()` install it as a worker's `onerror`, and those
   * callbacks outlive the render that created them: reading through a ref means
   * a retry always uses the CURRENT identity/table, never the pair that was in
   * scope when the dead worker was born.
   */
  const epoch = useRef(0);
  const timers = useRef<Set<number>>(new Set());
  const backoff = useRef<number[]>([]);
  const restartRef = useRef<(index: number, w: Worker) => void>(() => { /* set below */ });
  restartRef.current = (index: number, w: Worker): void => {
    const myEpoch = epoch.current;
    if (workers.current[index] !== w) return; // already replaced — nothing to do
    w.terminate();
    const wait = nextRetryDelay(backoff.current[index] ?? 0);
    backoff.current[index] = wait;
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      if (epoch.current !== myEpoch) return;   // a rebuild (or unmount) happened
      if (workers.current[index] !== w) return; // superseded by a bank
      const ms = allocatorRef.current!();
      const records = restartRecord(latest.current, index, ms);
      if (!records) return;                     // this basket no longer has that fryer
      latest.current = records;
      setChips(records.map(toFryerChip));
      workers.current[index] = startWorker(
        authorIdHex, tableId, ms,
        (msg) => applyMessage(index, msg),
        (bad) => restartRef.current(index, bad)
      );
    }, wait);
    timers.current.add(t);
  };

  /**
   * Bring the basket to `want` fryers, touching as little as possible
   * (fryerLogic.ts's `planResize` decides what "as little as possible" is).
   *
   * MUTATES `workers.current` IN PLACE — `length =` to shrink, index assignment
   * to grow — and never replaces the array object. That is not a style choice:
   * the owning effect's cleanup closes over the array it created, and swapping
   * in a different one here would leave that cleanup terminating a stale list
   * while the live workers ran on unowned, i.e. a leaked core per fryer.
   *
   * A ref rather than a `useCallback` for the same reason `restartRef` is: it
   * is called from an effect whose deps deliberately exclude the things it
   * reads, so it must always be the CURRENT closure over identity/table.
   */
  const syncRef = useRef<(want: number) => void>(() => { /* set below */ });
  syncRef.current = (want: number): void => {
    // No identity or no table means no valid preimage, so no fryers at all.
    const target = !authorIdHex || !tableId ? 0 : want;
    const plan = planResize(latest.current, target, allocatorRef.current!);
    if (plan.started.length === 0 && plan.stopped.length === 0) return;

    for (const i of plan.stopped) {
      const w = workers.current[i];
      if (w) stopWorker(w);
    }
    if (plan.stopped.length > 0) {
      workers.current.length = plan.records.length;
      backoff.current.length = plan.records.length;
    }
    latest.current = plan.records;
    for (const { index, ms } of plan.started) {
      backoff.current[index] = 0;
      workers.current[index] = startWorker(
        authorIdHex, tableId, ms,
        (msg) => applyMessage(index, msg),
        (bad) => restartRef.current(index, bad)
      );
    }
    setChips(plan.records.map(toFryerChip));
  };

  /**
   * The OWNING effect: one basket per identity+table, and the only thing that
   * terminates workers on teardown.
   *
   * `count` is deliberately NOT a dependency. It used to be, and that is what
   * made buying a fryer confiscate every other basket's chip: a dep change runs
   * the cleanup, the cleanup terminates every worker, and `terminate()` is the
   * only thing that CAN stop a grind, so every partly-ground chip died with it.
   * Resizing is now the separate effect below, which reconciles the delta
   * instead. The `count` read here is still the current one — an effect closes
   * over the render it was scheduled for — it simply does not re-run for it.
   *
   * An identity or table change DOES rebuild everything, and must: both bind
   * into every chip's Argon2id preimage, so a chip ground for the old pair is
   * worthless for the new one. `latest.current = []` is what makes the sync
   * below treat every slot as new.
   */
  useEffect(() => {
    // A new basket is a new generation: any respawn still pending from the last
    // one must not fire into it.
    epoch.current++;
    clearTimers(timers.current);
    backoff.current = [];
    // A fresh array, owned by THIS run's cleanup. The previous run's workers
    // were already terminated by the previous run's cleanup, which React ran
    // before this body.
    const owned: Worker[] = [];
    workers.current = owned;
    latest.current = [];
    setChips([]);
    syncRef.current(count);

    return () => {
      // Bump again, and drop the timers: a respawn scheduled by THIS run must
      // not outlive it. Without the clear, a hook unmounted between a worker's
      // `error` and its retry would spawn a Worker with nothing left holding a
      // handle to terminate it — a leaked core at 8 MiB a hash, the exact thing
      // the rest of this cleanup exists to prevent.
      epoch.current++;
      clearTimers(timers.current);
      // `owned` IS `workers.current` (same array object, mutated in place by
      // `syncRef`/`bank`), so a worker swapped or appended mid-life is the one
      // terminated here — while still being the array THIS effect run created,
      // which is what keeps a StrictMode mount -> cleanup -> mount from leaking
      // the first mount's workers.
      for (const w of owned) stopWorker(w);
    };
    // `count` is read, not tracked — see the doc above. Declared BEFORE the
    // resize effect so that in a commit where identity/table AND count both
    // change, this rebuild runs first and the resize below finds nothing to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorIdHex, tableId, applyMessage]);

  /**
   * The RESIZE effect: buying (or somehow losing) a fryer adds or removes
   * grinders without disturbing the ones already frying.
   *
   * It owns no workers and has no cleanup — it only ever mutates the array the
   * effect above created, so unmount teardown stays in exactly one place.
   */
  useEffect(() => {
    syncRef.current(count);
  }, [count]);

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

    // RETARGET the running worker with a `start` for the fresh ms — do NOT
    // terminate it. The grind loop now yields to its event loop every
    // YIELD_EVERY attempts (fryerLogic.ts), so this message is actually
    // delivered mid-grind: the worker bumps its generation, the old grind
    // exits at its next check, and the SAME 8 MiB Argon2id WASM instance
    // starts the next chip. The old terminate-and-respawn here cost a fresh
    // WASM instantiation on every bank — the allocation churn behind the
    // live "WebAssembly.instantiate(): Out of memory" failures (present
    // since day one, game-bricking under memory pressure, 2026-07-27).
    // Stale messages from the outgoing grind are dropped by
    // applyFryerMessage's ms guard, exactly as before.
    backoff.current[index] = 0;
    const start: CrunchReq = { type: 'start', authorIdHex, tableId, ms: newMs };
    worker.postMessage(start);

    return taken;
  }

  return { chips, bank };
}
