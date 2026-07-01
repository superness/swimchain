/**
 * Local useKeypair hook using local WASM
 * Replaces @swimchain/react's useKeypair to avoid WASM loading issues
 */
import { WasmKeypair } from '../wasm/loader';
export interface UseKeypairResult {
    keypair: WasmKeypair | null;
    address: string | null;
    generate: () => void;
    clear: () => void;
}
export declare function useKeypair(): UseKeypairResult;
//# sourceMappingURL=useKeypair.d.ts.map