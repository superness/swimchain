/**
 * Verification, off the main thread.
 *
 * Checking a chip is one Argon2id-8MiB hash — ~20-60 ms of straight-line WASM
 * that cannot be interrupted. On the main thread that is not "a bit of work",
 * it is a frozen tab: an awaited Argon2id chain never returns to the event
 * loop at all (the measurement is in `grindLoop`'s doc comment in
 * fryerLogic.ts — after 30 consecutive hashes, a `setTimeout(…, 0)` scheduled
 * before the loop still had not run), so nothing paints, no click is
 * dispatched, and no progress callback the caller passes can reach the screen.
 *
 * The boards loop is what makes this a launch-blocker rather than a nuisance:
 * it folds EVERY table on the board, every 60 s, and a browser with a cold
 * cache pays one real hash per bank per table. At 20 tables x 200 banks that is
 * ~84 seconds of unresponsive tab on first load. Reef hit exactly this shape of
 * freeze and answered it the same way (reef-client/src/lib/pow.worker.ts), as
 * did this client twice already (actionPow.worker.ts, crunch.worker.ts).
 *
 * This worker holds no state and makes no policy decisions: the memo cache, the
 * owner filter and the progress reporting all stay in chipsVerify.ts. It only
 * takes the hash off the UI thread.
 */
import { verifyChipBits } from './chipsPow';

export interface VerifyReq {
  id: number;
  authorIdHex: string;
  tableId: string;
  ms: number;
  /** Hex, no 0x — a bigint survives structured clone, but a string survives
   *  every transport, including a future non-worker implementation of this. */
  nonceHex: string;
}

export type VerifyRes =
  | { id: number; bits: number }
  | { id: number; error: string };

self.onmessage = (e: MessageEvent<VerifyReq>) => {
  const { id, authorIdHex, tableId, ms, nonceHex } = e.data;
  void verifyChipBits(authorIdHex, tableId, ms, BigInt('0x' + nonceHex))
    .then((bits) => {
      (self as unknown as Worker).postMessage({ id, bits } satisfies VerifyRes);
    })
    .catch((err: unknown) => {
      (self as unknown as Worker).postMessage({
        id, error: err instanceof Error ? err.message : String(err),
      } satisfies VerifyRes);
    });
};
