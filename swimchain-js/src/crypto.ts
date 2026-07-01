/**
 * Cryptographic utilities
 *
 * Provides hashing and PoW difficulty verification functions.
 */

import { getWasm } from "./wasm-loader";

/**
 * Compute SHA-256 hash of data
 *
 * @param data - Data to hash
 * @returns 32-byte hash
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("Hello");
 * const hash = sha256(data);
 * console.log(hash.length); // 32
 * ```
 */
export function sha256(data: Uint8Array): Uint8Array {
  return getWasm().sha256(data);
}

/**
 * Count leading zero bits in a hash
 *
 * Used for PoW difficulty verification.
 *
 * @param hash - Hash to count leading zeros in
 * @returns Number of leading zero bits (0-256)
 *
 * @example
 * ```ts
 * const zeros = leadingZeros(hash);
 * console.log(`Hash has ${zeros} leading zero bits`);
 * ```
 */
export function leadingZeros(hash: Uint8Array): number {
  return getWasm().leading_zeros(hash);
}

/**
 * Verify that a hash meets PoW difficulty
 *
 * @param hash - Hash to verify
 * @param difficulty - Required number of leading zero bits
 * @returns true if hash meets difficulty
 */
export function verifyPowDifficulty(
  hash: Uint8Array,
  difficulty: number
): boolean {
  return getWasm().verify_pow_difficulty(hash, difficulty);
}

/**
 * Compute content ID from data
 *
 * Returns a content-addressed ID in the format "sha256:<hex>".
 *
 * @param data - Content data
 * @returns Content ID string
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("Hello");
 * const id = contentId(data);
 * // "sha256:185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969"
 * ```
 */
export function contentId(data: Uint8Array): string {
  return getWasm().content_id(data);
}

/**
 * Compute double SHA-256 hash
 *
 * @param data - Data to hash
 * @returns 32-byte double hash
 */
export function doubleSha256(data: Uint8Array): Uint8Array {
  return getWasm().double_sha256(data);
}

/**
 * Convert bytes to hex string
 *
 * @param bytes - Byte array
 * @returns Hexadecimal string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to bytes
 *
 * @param hex - Hexadecimal string
 * @returns Byte array
 * @throws Error if hex string is invalid
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Compare two byte arrays for equality
 *
 * @param a - First array
 * @param b - Second array
 * @returns true if arrays are equal
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Concatenate multiple byte arrays
 *
 * @param arrays - Arrays to concatenate
 * @returns Concatenated array
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
