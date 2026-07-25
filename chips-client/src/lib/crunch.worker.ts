/**
 * A fryer. Grinds chip nonces off-thread and streams crispness back so the UI
 * can show the chip crisping in real time.
 *
 * Each fryer owns one chip at a time, identified by its authoring-ms. It
 * grinds until told to stop; the main thread (useFryers.ts) decides when to
 * bank, which is the whole game decision — this worker only reports progress
 * and the best nonce found so far.
 *
 * Grinding must never touch the main thread: a difficulty-8+ Argon2id search
 * on the main thread froze the tab so hard its own progress modal couldn't
 * paint (reef-client/src/lib/pow.worker.ts exists precisely because of that,
 * and actionPow.worker.ts repeats the fix for the protocol action-PoW). This
 * is NOT that worker — actionPow.worker.ts mines a fixed-difficulty action
 * proof once per submitted move; this one grinds the unbounded GAME chip
 * proof from chipsPow.ts, one continuous grind per basket.
 *
 * Deliberately calls chipHash (exported from chipsPow.ts) rather than
 * calling argon2id here with its own copy of CHIP_POW/the salt: a second,
 * hand-rolled copy of those params would only need to drift once for every
 * chip this worker mines to fail verification later — silently
 * (`rejected-bits`), not as a crash. Importing the one real implementation
 * means there is exactly one place that can go wrong.
 */
import { chipPreimage, chipHash } from './chipsPow';
import { grindLoop } from './fryerLogic';

export type StartMsg = { type: 'start'; authorIdHex: string; tableId: string; ms: number };
export type StopMsg = { type: 'stop' };
export type CrunchReq = StartMsg | StopMsg;

export type CrisperMsg = { type: 'crisper'; ms: number; bits: number; nonce: string; attempts: number };
export type ProgressMsg = { type: 'progress'; ms: number; bits: number; attempts: number };
/** Only reachable after ~2^64 attempts — see fryerLogic.ts's nextNonce doc.
 *  Included so the contract is total rather than silently hanging forever. */
export type ExhaustedMsg = { type: 'exhausted'; ms: number };
export type CrunchRes = CrisperMsg | ProgressMsg | ExhaustedMsg;

function post(msg: CrunchRes): void {
  (self as unknown as Worker).postMessage(msg);
}

/**
 * One grind. `myGeneration` pins this call to the `start` message that spawned
 * it, so a grind that is still in flight when a newer `start` is processed
 * drops its result instead of posting a message stamped with the OLD ms after
 * this fryer has moved on.
 *
 * That guard only covers messages this worker actually RECEIVES, which — while
 * a grind is running — is none of them. `grindLoop`'s doc comment in
 * fryerLogic.ts has the measurement: an awaited Argon2id chain never returns to
 * the event loop, so an in-flight grind starves this worker's message queue for
 * as long as it runs. A worker is therefore only ever addressable while idle,
 * and the ONLY way to stop a running fryer is `terminate()` — which is exactly
 * what useFryers.ts's `bank()` now does.
 */
async function grind(msg: StartMsg, myGeneration: number): Promise<void> {
  await grindLoop(msg.ms, {
    hash: (nonce) => chipHash(chipPreimage(msg.authorIdHex, msg.tableId, msg.ms, nonce)),
    post,
    isCurrent: () => generation === myGeneration,
  });
}

/** Bumped on every `start` (and on `stop`, so a stop with no following start
 *  also retires whatever was running). The currently-running grind, if any,
 *  is identified by the generation value it captured when it began. */
let generation = 0;

self.onmessage = (e: MessageEvent<CrunchReq>) => {
  if (e.data.type === 'stop') {
    generation++;
    return;
  }
  generation++;
  // A rejected grind used to die silently and take this fryer with it: the
  // basket would sit at `bits: -1` forever with nothing anywhere to look at.
  // A worker `console.error` at least surfaces in the page console.
  void grind(e.data, generation).catch((err) => {
    console.error('[chips] a fryer stopped grinding', err);
  });
};
