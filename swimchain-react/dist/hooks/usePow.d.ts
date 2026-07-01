/**
 * React hooks for Proof-of-Work mining
 *
 * Provides hooks for both synchronous and async (worker-based) PoW mining.
 */
import { type PowSolution, type MiningState } from "@swimchain/core";
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
export declare function usePow(): UsePowResult;
/**
 * Hook for synchronous (blocking) PoW mining
 *
 * WARNING: This will block the main thread. Use usePow() for non-blocking mining.
 *
 * @returns Mining function and state
 */
export declare function usePowSync(): {
    solution: PowSolution | null;
    error: string | null;
    isLoading: boolean;
    mine: (publicKey: Uint8Array, difficulty?: number) => void;
};
/**
 * Hook for verifying a PoW solution
 *
 * @param publicKey - 32-byte public key
 * @param timestamp - Timestamp from solution
 * @param nonce - Nonce from solution
 * @param difficulty - Required difficulty
 * @returns true if solution is valid
 */
export declare function useVerifyPow(publicKey: Uint8Array | null, timestamp: bigint | null, nonce: bigint | null, difficulty: number): boolean;
/**
 * Hook for estimating mining time
 *
 * @param difficulty - Required difficulty
 * @param hashRate - Estimated hash rate (default: 500000)
 * @returns Estimated time in seconds and formatted string
 */
export declare function useMiningEstimate(difficulty: number, hashRate?: number): {
    seconds: number;
    formatted: string;
};
//# sourceMappingURL=usePow.d.ts.map