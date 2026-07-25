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
import { chipPreimage, chipHash, leadingZeroBits } from './chipsPow';
import { MAX_BITS } from './chipsConst';
import { nextNonce } from './fryerLogic';

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
 * One grind. `myGeneration` pins this call to the `start` message that
 * spawned it: useFryers.ts reuses one worker across a rebank (sends a new
 * `start` with a fresh ms rather than terminating+recreating), so a grind
 * that is mid-`await chipHash(...)` when a newer `start` arrives must notice
 * it has been superseded and drop its result instead of posting a message
 * stamped with the OLD ms after the fryer has already moved on to a new
 * chip — otherwise the UI (and a very literal-minded player) could see a
 * "crisper" update for a chip that's no longer in the basket.
 */
async function grind(msg: StartMsg, myGeneration: number): Promise<void> {
  let nonce: bigint | null = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;

  while (generation === myGeneration && nonce !== null) {
    const hash = await chipHash(chipPreimage(msg.authorIdHex, msg.tableId, msg.ms, nonce));
    if (generation !== myGeneration) return; // superseded while awaiting the hash

    attempts++;
    const bits = Math.min(leadingZeroBits(hash), MAX_BITS);
    if (bits > best.bits) {
      best = { nonce, bits };
      post({ type: 'crisper', ms: msg.ms, bits, nonce: nonce.toString(16), attempts });
    } else if (attempts % 16 === 0) {
      post({ type: 'progress', ms: msg.ms, bits: best.bits, attempts });
    }
    nonce = nextNonce(nonce);
  }
  if (nonce === null) post({ type: 'exhausted', ms: msg.ms });
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
  void grind(e.data, generation);
};
