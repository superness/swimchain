/**
 * Action-PoW Web Worker.
 *
 * Reef move mining is difficulty-8 Argon2id over 8 MiB — several seconds of
 * CPU. Running it on the main thread froze the whole tab (the "Growing…"
 * modal couldn't even paint). This worker runs the exact same `computePow`
 * loop off-thread, streaming progress back, so the UI stays live.
 *
 * The shared `usePow`/`PowWorker` helpers only cover IDENTITY PoW (SHA-256);
 * this is the action-PoW (Argon2id) equivalent, kept local to reef.
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
