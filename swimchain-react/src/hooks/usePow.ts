/**
 * React hooks for Proof-of-Work mining
 *
 * Provides hooks for both synchronous and async (worker-based) PoW mining.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  mineIdentityPow,
  verifyIdentityPow,
  estimateMiningTime,
  formatMiningTimeEstimate,
  PowWorker,
  type PowSolution,
  type MiningState,
  DEFAULT_IDENTITY_POW_DIFFICULTY,
} from "@swimchain/core";
import { useSwimchain } from "../SwimchainProvider";

/**
 * Result of usePow hook
 */
export interface UsePowResult {
  /** Current mining state */
  state: MiningState;
  /** Mining solution if complete */
  solution: PowSolution | null;
  /** Error message if failed */
  error: string | null;
  /** Mining progress (attempts) */
  attempts: number;
  /** Mining progress (elapsed ms) */
  elapsedMs: number;
  /** Start mining */
  mine: (publicKey: Uint8Array, difficulty?: number) => void;
  /** Cancel current mining */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for PoW mining in a Web Worker (non-blocking)
 *
 * @returns Mining state and control functions
 *
 * @example
 * ```tsx
 * function IdentityCreator() {
 *   const { keypair, generate } = useKeypair();
 *   const { state, solution, mine, cancel, error } = usePow();
 *
 *   const handleCreate = () => {
 *     if (keypair) {
 *       mine(keypair.publicKey(), 8);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={generate}>Generate Keypair</button>
 *       <button onClick={handleCreate} disabled={state === 'mining'}>
 *         {state === 'mining' ? 'Mining...' : 'Create Identity'}
 *       </button>
 *       {state === 'mining' && <button onClick={cancel}>Cancel</button>}
 *       {solution && <p>Success! Nonce: {solution.nonce.toString()}</p>}
 *       {error && <p className="error">{error}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePow(): UsePowResult {
  const { isLoaded } = useSwimchain();
  const [state, setState] = useState<MiningState>("idle");
  const [solution, setSolution] = useState<PowSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const workerRef = useRef<PowWorker | null>(null);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const mine = useCallback(
    async (publicKey: Uint8Array, difficulty: number = DEFAULT_IDENTITY_POW_DIFFICULTY) => {
      if (!isLoaded) {
        setError("WASM not loaded");
        return;
      }

      // Reset state
      setState("initializing");
      setSolution(null);
      setError(null);
      setAttempts(0);
      setElapsedMs(0);

      // Create worker if needed
      if (!workerRef.current) {
        workerRef.current = new PowWorker();
      }

      try {
        await workerRef.current.init();
        setState("mining");

        const result = await workerRef.current.mine(
          publicKey,
          difficulty,
          (a, e) => {
            setAttempts(a);
            setElapsedMs(e);
          }
        );

        setState("complete");
        setSolution(result);
        setAttempts(Number(result.attempts));
        setElapsedMs(result.elapsedMs);
      } catch (err) {
        if (err instanceof Error && err.message === "Mining cancelled") {
          setState("cancelled");
        } else {
          setState("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [isLoaded]
  );

  const cancel = useCallback(() => {
    workerRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.cancel();
    setState("idle");
    setSolution(null);
    setError(null);
    setAttempts(0);
    setElapsedMs(0);
  }, []);

  return {
    state,
    solution,
    error,
    attempts,
    elapsedMs,
    mine,
    cancel,
    reset,
  };
}

/**
 * Hook for synchronous (blocking) PoW mining
 *
 * WARNING: This will block the main thread. Use usePow() for non-blocking mining.
 *
 * @returns Mining function and state
 */
export function usePowSync(): {
  solution: PowSolution | null;
  error: string | null;
  isLoading: boolean;
  mine: (publicKey: Uint8Array, difficulty?: number) => void;
} {
  const { isLoaded } = useSwimchain();
  const [solution, setSolution] = useState<PowSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mine = useCallback(
    (publicKey: Uint8Array, difficulty: number = DEFAULT_IDENTITY_POW_DIFFICULTY) => {
      if (!isLoaded) {
        setError("WASM not loaded");
        return;
      }

      setIsLoading(true);
      setError(null);
      setSolution(null);

      try {
        const result = mineIdentityPow(publicKey, difficulty);
        setSolution(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoaded]
  );

  return { solution, error, isLoading, mine };
}

/**
 * Hook for verifying a PoW solution
 *
 * @param publicKey - 32-byte public key
 * @param timestamp - Timestamp from solution
 * @param nonce - Nonce from solution
 * @param difficulty - Required difficulty
 * @returns true if solution is valid
 */
export function useVerifyPow(
  publicKey: Uint8Array | null,
  timestamp: bigint | null,
  nonce: bigint | null,
  difficulty: number
): boolean {
  const { isLoaded } = useSwimchain();

  if (!isLoaded || !publicKey || timestamp === null || nonce === null) {
    return false;
  }

  return verifyIdentityPow(publicKey, timestamp, nonce, difficulty);
}

/**
 * Hook for estimating mining time
 *
 * @param difficulty - Required difficulty
 * @param hashRate - Estimated hash rate (default: 500000)
 * @returns Estimated time in seconds and formatted string
 */
export function useMiningEstimate(
  difficulty: number,
  hashRate: number = 500000
): { seconds: number; formatted: string } {
  const { isLoaded } = useSwimchain();

  if (!isLoaded) {
    return { seconds: 0, formatted: "Unknown" };
  }

  const seconds = estimateMiningTime(difficulty, hashRate);
  const formatted = formatMiningTimeEstimate(difficulty, hashRate);

  return { seconds, formatted };
}
