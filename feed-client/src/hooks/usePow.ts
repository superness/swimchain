/**
 * Local usePow hook using local WASM
 * Replaces @swimchain/react's usePow to avoid WASM loading issues
 */

import { useState, useCallback, useRef } from 'react';
import { mineIdentityPowWithLimit } from '../wasm/loader';
import { useSwimchain } from '../providers/SwimchainProvider';

export type PowState = 'idle' | 'initializing' | 'mining' | 'complete' | 'cancelled' | 'error';

export interface PowSolution {
  nonce: bigint;
  timestamp: bigint;
  elapsedMs: number;
}

export interface UsePowResult {
  state: PowState;
  solution: PowSolution | null;
  attempts: number;
  elapsedMs: number;
  mine: (publicKey: Uint8Array, difficulty: number) => void;
  cancel: () => void;
  reset: () => void;
}

export function usePow(): UsePowResult {
  const { isLoaded } = useSwimchain();
  const [state, setState] = useState<PowState>('idle');
  const [solution, setSolution] = useState<PowSolution | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const cancelledRef = useRef(false);
  const miningRef = useRef(false);

  const mine = useCallback((publicKey: Uint8Array, difficulty: number) => {
    if (!isLoaded) {
      console.error('[usePow] WASM not loaded');
      setState('error');
      return;
    }

    if (miningRef.current) {
      console.warn('[usePow] Already mining');
      return;
    }

    cancelledRef.current = false;
    miningRef.current = true;
    setState('initializing');
    setAttempts(0);
    setElapsedMs(0);
    setSolution(null);

    const startTime = Date.now();
    const BATCH_SIZE = 10000n; // Try 10k hashes per batch
    let totalAttempts = 0n;

    const mineNextBatch = () => {
      if (cancelledRef.current) {
        miningRef.current = false;
        setState('cancelled');
        return;
      }

      setState('mining');

      // Run a batch of mining attempts
      try {
        const result = mineIdentityPowWithLimit(publicKey, difficulty, BATCH_SIZE);

        // Found a solution!
        const elapsed = Date.now() - startTime;
        totalAttempts += result.attempts;

        setSolution({
          nonce: result.nonce,
          timestamp: result.timestamp,
          elapsedMs: elapsed,
        });
        setAttempts(Number(totalAttempts));
        setElapsedMs(elapsed);
        setState('complete');
        miningRef.current = false;

        // Free the WASM object
        result.free();
        return;
      } catch (err) {
        // mineIdentityPowWithLimit throws when batch limit is reached without finding solution
        // This is expected - we just continue with the next batch
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (errorMsg.includes('exceeded') || errorMsg.includes('attempts')) {
          // Expected: batch limit reached, continue mining
          totalAttempts += BATCH_SIZE;
          setAttempts(Number(totalAttempts));
          setElapsedMs(Date.now() - startTime);

          // Schedule next batch with setTimeout to allow UI updates
          setTimeout(mineNextBatch, 0);
        } else {
          // Unexpected error - stop mining
          console.error('[usePow] Mining error:', err);
          miningRef.current = false;
          setState('error');
        }
      }
    };

    // Start mining after a short delay to show initializing state
    setTimeout(mineNextBatch, 100);
  }, [isLoaded]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    miningRef.current = false;
    setState('idle');
    setSolution(null);
    setAttempts(0);
    setElapsedMs(0);
  }, []);

  return {
    state,
    solution,
    attempts,
    elapsedMs,
    mine,
    cancel,
    reset,
  };
}
