/**
 * Identity management utilities
 *
 * Provides keypair generation, address encoding/decoding, and signature operations.
 */
import type { AddressValidation } from "./types";
/**
 * Ed25519 keypair for identity operations
 *
 * Wraps the WASM keypair with a TypeScript-friendly interface.
 * Remember to call `free()` when done to release WASM memory.
 *
 * @example
 * ```ts
 * const keypair = new Keypair();
 * console.log(keypair.address()); // cs1...
 *
 * const message = new TextEncoder().encode("Hello");
 * const signature = keypair.sign(message);
 *
 * keypair.free(); // Release memory
 * ```
 */
export declare class Keypair {
    private inner;
    /**
     * Create a new random keypair
     */
    constructor();
    /**
     * Create a keypair from a 32-byte seed
     *
     * The same seed will always produce the same keypair.
     *
     * @param seed - 32-byte seed value
     */
    static fromSeed(seed: Uint8Array): Keypair;
    /**
     * Get the 32-byte public key
     */
    publicKey(): Uint8Array;
    /**
     * Sign a message
     *
     * @param message - Message to sign
     * @returns 64-byte signature
     */
    sign(message: Uint8Array): Uint8Array;
    /**
     * Get the Bech32m address for this keypair
     *
     * @returns Address string starting with "cs1"
     */
    address(): string;
    /**
     * Get the 32-byte seed (private key)
     *
     * WARNING: The seed IS the private key. Store it securely (encrypted).
     * Anyone with access to this seed can sign messages as this identity.
     *
     * @returns 32-byte Ed25519 seed
     */
    seed(): Uint8Array;
    /**
     * Release WASM memory
     *
     * Call this when you're done with the keypair.
     */
    free(): void;
}
/**
 * Encode a public key as a Bech32m address
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @returns Address string starting with "cs1"
 * @throws Error if public key is invalid
 *
 * @example
 * ```ts
 * const address = encodeAddress(keypair.publicKey());
 * console.log(address); // cs1...
 * ```
 */
export declare function encodeAddress(publicKey: Uint8Array): string;
/**
 * Decode a Bech32m address to a public key
 *
 * @param address - Bech32m address string
 * @returns 32-byte public key
 * @throws Error if address is invalid
 *
 * @example
 * ```ts
 * const pubkey = decodeAddress("cs1...");
 * console.log(pubkey.length); // 32
 * ```
 */
export declare function decodeAddress(address: string): Uint8Array;
/**
 * Verify an Ed25519 signature
 *
 * @param publicKey - 32-byte public key
 * @param message - Original message
 * @param signature - 64-byte signature
 * @returns true if signature is valid
 *
 * @example
 * ```ts
 * const isValid = verifySignature(pubkey, message, signature);
 * ```
 */
export declare function verifySignature(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
/**
 * Check if an address is valid
 *
 * @param address - Address string to validate
 * @returns true if valid Swimchain address
 *
 * @example
 * ```ts
 * if (isValidAddress(userInput)) {
 *   // Safe to use
 * }
 * ```
 */
export declare function isValidAddress(address: string): boolean;
/**
 * Validate an address and get detailed information
 *
 * @param address - Address string to validate
 * @returns Validation result with decoded public key if valid
 *
 * @example
 * ```ts
 * const result = validateAddress(userInput);
 * if (result.valid) {
 *   console.log("Public key:", result.publicKey);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export declare function validateAddress(address: string): AddressValidation;
/**
 * Sign a message and return the signature with verification info
 *
 * @param keypair - Keypair to sign with
 * @param message - Message to sign
 * @returns Object with signature and public key
 */
export declare function signMessage(keypair: Keypair, message: Uint8Array): {
    signature: Uint8Array;
    publicKey: Uint8Array;
};
//# sourceMappingURL=identity.d.ts.map