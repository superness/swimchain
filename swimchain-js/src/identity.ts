/**
 * Identity management utilities
 *
 * Provides keypair generation, address encoding/decoding, and signature operations.
 */

import { getWasm, type WasmKeypair as InternalKeypair } from "./wasm-loader";
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
export class Keypair {
  private inner: InternalKeypair;

  /**
   * Create a new random keypair
   */
  constructor() {
    const wasm = getWasm();
    this.inner = new wasm.WasmKeypair();
  }

  /**
   * Create a keypair from a 32-byte seed
   *
   * The same seed will always produce the same keypair.
   *
   * @param seed - 32-byte seed value
   */
  static fromSeed(seed: Uint8Array): Keypair {
    const wasm = getWasm();
    const instance = Object.create(Keypair.prototype) as Keypair;
    instance.inner = wasm.WasmKeypair.fromSeed(seed);
    return instance;
  }

  /**
   * Get the 32-byte public key
   */
  publicKey(): Uint8Array {
    return this.inner.publicKey();
  }

  /**
   * Sign a message
   *
   * @param message - Message to sign
   * @returns 64-byte signature
   */
  sign(message: Uint8Array): Uint8Array {
    return this.inner.sign(message);
  }

  /**
   * Get the Bech32m address for this keypair
   *
   * @returns Address string starting with "cs1"
   */
  address(): string {
    return this.inner.address();
  }

  /**
   * Get the 32-byte seed (private key)
   *
   * WARNING: The seed IS the private key. Store it securely (encrypted).
   * Anyone with access to this seed can sign messages as this identity.
   *
   * @returns 32-byte Ed25519 seed
   */
  seed(): Uint8Array {
    return this.inner.seed();
  }

  /**
   * Release WASM memory
   *
   * Call this when you're done with the keypair.
   */
  free(): void {
    this.inner.free();
  }
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
export function encodeAddress(publicKey: Uint8Array): string {
  return getWasm().encode_address(publicKey);
}

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
export function decodeAddress(address: string): Uint8Array {
  return getWasm().decode_address(address);
}

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
export function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  return getWasm().verify_signature(publicKey, message, signature);
}

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
export function isValidAddress(address: string): boolean {
  return getWasm().is_valid_address(address);
}

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
export function validateAddress(address: string): AddressValidation {
  try {
    const publicKey = decodeAddress(address);
    return { valid: true, publicKey };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sign a message and return the signature with verification info
 *
 * @param keypair - Keypair to sign with
 * @param message - Message to sign
 * @returns Object with signature and public key
 */
export function signMessage(
  keypair: Keypair,
  message: Uint8Array
): { signature: Uint8Array; publicKey: Uint8Array } {
  return {
    signature: keypair.sign(message),
    publicKey: keypair.publicKey(),
  };
}
