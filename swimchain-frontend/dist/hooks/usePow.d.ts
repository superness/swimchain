/**
 * Local usePow hook using local WASM
 * Replaces @swimchain/react's usePow to avoid WASM loading issues
 */
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
export declare function usePow(): UsePowResult;
//# sourceMappingURL=usePow.d.ts.map