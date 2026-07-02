/**
 * Swimchain Identity Protocol
 *
 * Defines the protocol-level types and utilities for Swimchain identities,
 * including address format, key types, and identity verification.
 *
 * Address format: cs1... (Bech32m with 'cs' human-readable prefix)
 * Key types: Ed25519 (32-byte public keys, 64-byte signatures)
 */

// ============================================================================
// Address Constants
// ============================================================================

/** Bech32m human-readable prefix for Swimchain addresses */
export const ADDRESS_HRP = 'cs' as const;

/** Length of a decoded Ed25519 public key in bytes */
export const PUBLIC_KEY_LENGTH = 32 as const;

/** Length of an Ed25519 signature in bytes */
export const SIGNATURE_LENGTH = 64 as const;

/** Length of an Ed25519 seed (private key) in bytes */
export const SEED_LENGTH = 32 as const;

/** Expected length of a Bech32m address string (hrp + separator + data + checksum) */
export const ADDRESS_STRING_LENGTH_MIN = 50 as const;

/** Expected maximum length of a Bech32m address string */
export const ADDRESS_STRING_LENGTH_MAX = 70 as const;

// ============================================================================
// Identity Protocol Types
// ============================================================================

/**
 * Protocol-level identity representation
 *
 * An identity in Swimchain is an Ed25519 keypair identified by
 * its Bech32m-encoded public key address.
 */
export interface IdentityProtocol {
  /** Bech32m address (cs1...) */
  address: string;
  /** 32-byte Ed25519 public key */
  publicKey: Uint8Array;
  /** Optional 32-byte seed (private key) — never exposed over network */
  seed?: Uint8Array;
}

/**
 * Address validation result from the protocol
 */
export interface AddressValidationProtocol {
  /** Whether the address is syntactically valid Bech32m */
  valid: boolean;
  /** Human-readable error message if invalid */
  error?: string;
  /** Decoded 32-byte public key if valid */
  publicKey?: Uint8Array;
}

/**
 * Signature verification result
 */
export interface SignatureVerificationProtocol {
  /** Whether the signature is cryptographically valid */
  isValid: boolean;
  /** Signer's public key address */
  address: string;
  /** Human-readable message */
  message: string;
}

/**
 * Identity type classification
 */
export type IdentityTypeProtocol =
  | 'standard'    // Regular Ed25519 keypair
  | 'genesis'     // Genesis identity (special privileges)
  | 'ephemeral';  // Temporary identity (not persisted)

// ============================================================================
// Address Utility Functions
// ============================================================================

/**
 * Check if a string looks like a valid Swimchain address format
 *
 * Performs a basic prefix and length check without decoding.
 * Use validateAddress() from @swimchain/core for full validation.
 *
 * @param value - String to check
 * @returns true if the string starts with 'cs1' and has reasonable length
 *
 * @example
 * ```ts
 * if (looksLikeAddress(input)) {
 *   // Proceed with full validation
 * }
 * ```
 */
export function looksLikeAddress(value: string): boolean {
  return (
    value.startsWith('cs1') &&
    value.length >= ADDRESS_STRING_LENGTH_MIN &&
    value.length <= ADDRESS_STRING_LENGTH_MAX
  );
}

/**
 * Determine address type from prefix characters
 *
 * @param address - Bech32m address string
 * @returns Address type classification
 *
 * @example
 * ```ts
 * const type = getAddressType('cs1...');
 * // Returns { isIdentity: true, isSpace: false, isContent: false }
 * ```
 */
export function getAddressType(address: string): {
  isIdentity: boolean;
  isSpace: boolean;
  isContent: boolean;
} {
  if (!address.startsWith('cs1')) {
    return { isIdentity: false, isSpace: false, isContent: false };
  }

  // All addresses start with cs1 in current protocol
  // Future: add subtype detection based on second character
  return {
    isIdentity: true,
    isSpace: false,  // Space IDs use 'sp1...' in some implementations
    isContent: false, // Content IDs use hash-based identifiers
  };
}

/**
 * Truncate a long address for display
 *
 * @param address - Full Bech32m address
 * @param prefixLen - Characters to keep at start (default: 8)
 * @param suffixLen - Characters to keep at end (default: 6)
 * @returns Truncated address string
 *
 * @example
 * ```ts
 * const short = truncateAddress('cs1abcdef...xyz789');
 * // Returns 'cs1abcde...z789'
 * ```
 */
export function truncateAddress(
  address: string,
  prefixLen: number = 8,
  suffixLen: number = 6
): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}
