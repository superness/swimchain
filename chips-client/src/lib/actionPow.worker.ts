/**
 * Action-PoW Web Worker.
 *
 * Table creation and every move mine a difficulty ~8-10 Argon2id proof —
 * several seconds of CPU. Running that on the main thread froze the whole
 * tab (any progress UI couldn't even paint) — reef hit exactly this and
 * fixed it with an identical worker (reef-client/src/lib/pow.worker.ts). This
 * runs the same `computePow` loop off-thread, streaming progress back.
 *
 * NOT the same worker as the chip-grinder (Task 9's Argon2id chip proof) —
 * that mines a different preimage at a different difficulty; this one only
 * does node action PoW (Post/Reply).
 */
import { computePow, type PoWChallenge, type PoWConfig } from '@swimchain/react';

type Req = { challenge: PoWChallenge; config: PoWConfig };

self.onmessage = async (e: MessageEvent<Req>) => {
  const { challenge, config } = e.data;
  try {
    const solution = await computePow(challenge, config, (attempts, elapsedMs, hashRate) => {
      (self as unknown as Worker).postMessage({ type: 'progress', attempts, elapsedMs, hashRate });
    });
    // PoWSolution holds a bigint nonce + Uint8Array hash — both structured-cloneable.
    (self as unknown as Worker).postMessage({ type: 'solution', solution });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
