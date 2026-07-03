/**
 * Stored Identity Hook for Swimchain
 *
 * Manages identity persistence in localStorage and provides keypair integration.
 *
 * @packageDocumentation
 */
import { Keypair } from '@swimchain/core';
export interface StoredIdentity {
    /** Hex-encoded 32-byte seed (private key) */
    seed: string;
    /** Hex-encoded 32-byte public key */
    publicKey: string;
    /** Bech32m-encoded address */
    address: string;
    /** When the identity was created */
    createdAt: number;
    /** Optional display name */
    displayName?: string;
}
export interface UseStoredIdentityResult {
    /** The stored identity (or null if none) */
    identity: StoredIdentity | null;
    /** Whether we're loading from storage */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Save a new identity to storage */
    saveIdentity: (identity: StoredIdentity) => void;
    /** Clear the stored identity */
    clearIdentity: () => void;
    /** Check if an identity is stored */
    hasIdentity: boolean;
}
export interface UseStoredKeypairResult {
    /** The WASM Keypair object */
    keypair: Keypair | null;
    /** The public key as Uint8Array */
    publicKey: Uint8Array | null;
    /** The public key as hex string */
    publicKeyHex: string | null;
    /** The bech32m address */
    address: string | null;
    /** Whether we're loading */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Sign a message with the keypair */
    sign: (message: Uint8Array) => Uint8Array | null;
}
/**
 * Hook to manage stored identity in localStorage
 *
 * @example
 * ```tsx
 * const { identity, saveIdentity, clearIdentity, hasIdentity } = useStoredIdentity();
 *
 * if (!hasIdentity) {
 *   // Show identity creation UI
 * }
 * ```
 */
export declare function useStoredIdentity(): UseStoredIdentityResult;
/**
 * Hook to get a WASM Keypair from stored identity
 *
 * Automatically loads the identity from localStorage and creates
 * a Keypair from its seed, enabling cryptographic operations.
 *
 * @example
 * ```tsx
 * const { keypair, publicKeyHex, address, sign } = useStoredKeypair();
 *
 * if (keypair) {
 *   const signature = sign(messageBytes);
 * }
 * ```
 */
export declare function useStoredKeypair(): UseStoredKeypairResult;
/**
 * Create a new identity with a fresh keypair
 *
 * @returns StoredIdentity ready to be saved
 */
export declare function createNewIdentity(keypair: Keypair, displayName?: string): StoredIdentity;
/**
 * Load identity directly from localStorage (non-hook version)
 * Useful for RPC authentication setup before React renders
 */
export declare function loadStoredIdentity(): StoredIdentity | null;
//# sourceMappingURL=useStoredIdentity.d.ts.map