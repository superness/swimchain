/**
 * Local usePow hook using local WASM
 * Replaces @swimchain/react's usePow to avoid WASM loading issues
 */

import { useState, useCallback, useRef } from 'react';
import { mine_identity_pow } from '../wasm/loader';
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

    // Run mining in a setTimeout to allow UI to update first
    setTimeout(() => {
      if (cancelledRef.current) {
        miningRef.current = false;
        setState('cancelled');
        return;
      }

      setState('mining');

      try {
        // Use blocking mine_identity_pow - it will find a solution
        const result = mine_identity_pow(publicKey, difficulty);

        setSolution({
          nonce: result.nonce,
          timestamp: result.timestamp,
          elapsedMs: result.elapsedMs,
        });
        setAttempts(Number(result.attempts));
        setElapsedMs(result.elapsedMs);
        setState('complete');
        miningRef.current = false;

        // Free the WASM object
        result.free();
      } catch (err) {
        console.error('[usePow] Mining error:', err);
        miningRef.current = false;
        setState('error');
      }
    }, 100);
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
