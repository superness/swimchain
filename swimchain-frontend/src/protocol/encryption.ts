/**
 * Swimchain Encryption Protocol
 *
 * Defines the protocol-level types and constants for Swimchain content encryption,
 * including encrypted content format markers, key types, and protocol versions.
 *
 * Two encryption schemes:
 * 1. Passphrase-based (PBKDF2 + AES-GCM) — for user-encrypted posts
 * 2. Space-key-based (AES-GCM) — for private space content
 * 3. NaCl box (X25519 + XSalsa20-Poly1305) — for key exchange
 */

// ============================================================================
// Encryption Protocol Constants
// ============================================================================

/** Protocol version prefix for passphrase-encrypted content */
export const ENCRYPTED_V1_PREFIX = '[ENCRYPTED:v1:' as const;

/** Protocol version prefix for space-key-encrypted content */
export const PRIVATE_V1_PREFIX = '[PRIVATE:v1:' as const;

/** Suffix for all encrypted content markers */
export const ENCRYPTED_SUFFIX = ']' as const;

/** Supported encryption protocol versions */
export type EncryptionProtocolVersion = 'v1';

/** AES-GCM key lengths in bytes */
export const AES_GCM_KEY_LENGTH = 32 as const; // 256-bit
export const AES_GCM_IV_LENGTH = 12 as const;   // 96-bit

/** PBKDF2 parameters per protocol spec */
export const PBKDF2_ITERATIONS = 100000 as const;
export const PBKDF2_SALT_LENGTH = 16 as const;
export const PBKDF2_HASH = 'SHA-256' as const;

/** NaCl box nonce length (XSalsa20) */
export const NACL_BOX_NONCE_LENGTH = 24 as const;

/** Poly1305 authentication tag length */
export const POLY1305_TAG_LENGTH = 16 as const;

/** Space key length for AES-256-GCM */
export const SPACE_KEY_LENGTH = 32 as const;

/** X25519 public key length */
export const X25519_PUBLIC_KEY_LENGTH = 32 as const;

/** X25519 secret key length */
export const X25519_SECRET_KEY_LENGTH = 32 as const;

// ============================================================================
// Encryption Protocol Types
// ============================================================================

/**
 * Encryption scheme type
 */
export type EncryptionSchemeProtocol =
  /** Passphrase-based: PBKDF2 + AES-256-GCM, format [ENCRYPTED:v1:...] */
  | 'passphrase'
  /** Space-key-based: AES-256-GCM, format [PRIVATE:v1:...] */
  | 'space_key'
  /** NaCl box: X25519 + XSalsa20-Poly1305 for key exchange */
  | 'nacl_box';

/**
 * Encrypted content protocol metadata
 */
export interface EncryptedContentProtocol {
  /** Encryption scheme used */
  scheme: EncryptionSchemeProtocol;
  /** Protocol version */
  version: EncryptionProtocolVersion;
  /** The raw base64-encoded payload */
  payload: string;
  /** Any unencrypted suffix after the encrypted block */
  suffix: string;
}

/**
 * Space key exchange payload (NaCl box)
 *
 * Used to securely share a space key among authorized members.
 * Format: nonce (24) || ciphertext
 */
export interface SpaceKeyExchangeProtocol {
  /** 24-byte XSalsa20 nonce */
  nonce: Uint8Array;
  /** Encrypted space key (ciphertext includes Poly1305 tag) */
  encryptedKey: Uint8Array;
  /** Sender's X25519 public key */
  senderPublicKey: Uint8Array;
}

// ============================================================================
// Protocol Utility Functions
// ============================================================================

/**
 * Check if content uses the passphrase encryption format
 *
 * @param content - Raw content string
 * @returns true if content starts with [ENCRYPTED:v1:
 *
 * @example
 * ```ts
 * if (isEncryptedProtocol(post.body)) {
 *   // Needs decryption
 * }
 * ```
 */
export function isEncryptedProtocol(content: string): boolean {
  return content.startsWith(ENCRYPTED_V1_PREFIX);
}

/**
 * Check if content uses the space key encryption format
 *
 * @param content - Raw content string
 * @returns true if content starts with [PRIVATE:v1:
 *
 * @example
 * ```ts
 * if (isPrivateEncryptedProtocol(post.body)) {
 *   // Needs space key decryption
 * }
 * ```
 */
export function isPrivateEncryptedProtocol(content: string): boolean {
  return content.startsWith(PRIVATE_V1_PREFIX);
}

/**
 * Extract encrypted payload from protocol-formatted content
 *
 * @param content - Raw content string with encryption marker
 * @returns Parsed encrypted content protocol, or null if format is invalid
 *
 * @example
 * ```ts
 * const enc = parseEncryptedContent('[ENCRYPTED:v1:base64...]suffix');
 * // { scheme: 'passphrase', version: 'v1', payload: 'base64...', suffix: 'suffix' }
 * ```
 */
export function parseEncryptedContent(
  content: string
): EncryptedContentProtocol | null {
  if (content.startsWith(ENCRYPTED_V1_PREFIX)) {
    const payloadStart = ENCRYPTED_V1_PREFIX.length;
    const endIndex = content.indexOf(ENCRYPTED_SUFFIX, payloadStart);
    if (endIndex === -1) return null;

    return {
      scheme: 'passphrase',
      version: 'v1',
      payload: content.slice(payloadStart, endIndex),
      suffix: content.slice(endIndex + ENCRYPTED_SUFFIX.length),
    };
  }

  if (content.startsWith(PRIVATE_V1_PREFIX)) {
    const payloadStart = PRIVATE_V1_PREFIX.length;
    const endIndex = content.indexOf(ENCRYPTED_SUFFIX, payloadStart);
    if (endIndex === -1) return null;

    return {
      scheme: 'space_key',
      version: 'v1',
      payload: content.slice(payloadStart, endIndex),
      suffix: content.slice(endIndex + ENCRYPTED_SUFFIX.length),
    };
  }

  return null;
}
