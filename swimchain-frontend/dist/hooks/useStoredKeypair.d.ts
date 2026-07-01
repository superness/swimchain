/**
 * Hook that bridges stored identity (localStorage) with WASM Keypair
 *
 * The `useKeypair` hook from @swimchain/react creates fresh in-memory keypairs.
 * This hook loads the stored identity's seed from localStorage and creates
 * a Keypair from it, enabling PoW mining and signing with the persisted identity.
 */
import { WasmKeypair } from '../wasm/loader';
/**
 * Hook result type
 */
export interface UseStoredKeypairResult {
    /** The WASM Keypair object (or null if not loaded) */
    keypair: WasmKeypair | null;
    /** The public key as Uint8Array */
    publicKey: Uint8Array | null;
    /** The bech32m address */
    address: string | null;
    /** Whether we're still loading */
    isLoading: boolean;
    /** Any error that occurred */
    error: string | null;
    /** Sign a message with the keypair */
    sign: (message: Uint8Array) => Uint8Array | null;
}
/**
 * Hook to get a WASM Keypair from the stored identity
 *
 * This automatically loads the identity from localStorage and creates
 * a Keypair from its seed, enabling cryptographic operations.
 */
export declare function useStoredKeypair(): UseStoredKeypairResult;
//# sourceMappingURL=useStoredKeypair.d.ts.map