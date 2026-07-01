/**
 * Cryptographic utilities
 *
 * Provides hashing and PoW difficulty verification functions.
 */
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
export declare function sha256(data: Uint8Array): Uint8Array;
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
export declare function leadingZeros(hash: Uint8Array): number;
/**
 * Verify that a hash meets PoW difficulty
 *
 * @param hash - Hash to verify
 * @param difficulty - Required number of leading zero bits
 * @returns true if hash meets difficulty
 */
export declare function verifyPowDifficulty(hash: Uint8Array, difficulty: number): boolean;
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
export declare function contentId(data: Uint8Array): string;
/**
 * Compute double SHA-256 hash
 *
 * @param data - Data to hash
 * @returns 32-byte double hash
 */
export declare function doubleSha256(data: Uint8Array): Uint8Array;
/**
 * Convert bytes to hex string
 *
 * @param bytes - Byte array
 * @returns Hexadecimal string
 */
export declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Convert hex string to bytes
 *
 * @param hex - Hexadecimal string
 * @returns Byte array
 * @throws Error if hex string is invalid
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Compare two byte arrays for equality
 *
 * @param a - First array
 * @param b - Second array
 * @returns true if arrays are equal
 */
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
/**
 * Concatenate multiple byte arrays
 *
 * @param arrays - Arrays to concatenate
 * @returns Concatenated array
 */
export declare function concatBytes(...arrays: Uint8Array[]): Uint8Array;
//# sourceMappingURL=crypto.d.ts.map