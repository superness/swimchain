/**
 * React hooks for Proof-of-Work mining
 *
 * Provides hooks for both synchronous and async (worker-based) PoW mining.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { mineIdentityPow, verifyIdentityPow, estimateMiningTime, formatMiningTimeEstimate, PowWorker, DEFAULT_IDENTITY_POW_DIFFICULTY, } from "@swimchain/core";
import { useSwimchain } from "../SwimchainProvider";
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
export function usePow() {
    const { isLoaded } = useSwimchain();
    const [state, setState] = useState("idle");
    const [solution, setSolution] = useState(null);
    const [error, setError] = useState(null);
    const [attempts, setAttempts] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const workerRef = useRef(null);
    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
        };
    }, []);
    const mine = useCallback(async (publicKey, difficulty = DEFAULT_IDENTITY_POW_DIFFICULTY) => {
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
            const result = await workerRef.current.mine(publicKey, difficulty, (a, e) => {
                setAttempts(a);
                setElapsedMs(e);
            });
            setState("complete");
            setSolution(result);
            setAttempts(Number(result.attempts));
            setElapsedMs(result.elapsedMs);
        }
        catch (err) {
            if (err instanceof Error && err.message === "Mining cancelled") {
                setState("cancelled");
            }
            else {
                setState("error");
                setError(err instanceof Error ? err.message : String(err));
            }
        }
    }, [isLoaded]);
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
export function usePowSync() {
    const { isLoaded } = useSwimchain();
    const [solution, setSolution] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const mine = useCallback((publicKey, difficulty = DEFAULT_IDENTITY_POW_DIFFICULTY) => {
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
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setIsLoading(false);
        }
    }, [isLoaded]);
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
export function useVerifyPow(publicKey, timestamp, nonce, difficulty) {
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
export function useMiningEstimate(difficulty, hashRate = 500000) {
    const { isLoaded } = useSwimchain();
    if (!isLoaded) {
        return { seconds: 0, formatted: "Unknown" };
    }
    const seconds = estimateMiningTime(difficulty, hashRate);
    const formatted = formatMiningTimeEstimate(difficulty, hashRate);
    return { seconds, formatted };
}
//# sourceMappingURL=usePow.js.map