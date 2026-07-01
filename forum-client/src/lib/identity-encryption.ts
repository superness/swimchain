/**
 * Identity Key Encryption
 *
 * Encrypts private keys (seeds) before storing in localStorage.
 * Uses Argon2id for key derivation (consistent with @swimchain/react WASM bindings)
 * and AES-GCM for encryption.
 *
 * Format: [IDENTITY:v1:<base64(salt:iv:ciphertext)>]
 *
 * @packageDocumentation
 */

import { argon2id } from 'hash-wasm';

// =========================================================================
// Constants
// =========================================================================

const IDENTITY_PREFIX = '[IDENTITY:v1:';
const IDENTITY_SUFFIX = ']';

/** Salt length in bytes (16 bytes = 128 bits) */
const SALT_LENGTH = 16;

/** IV length for AES-GCM (12 bytes = 96 bits) */
const IV_LENGTH = 12;

/**
 * Argon2id parameters for key derivation
 * Tuned for browser environment - balance between security and usability
 */
const ARGON2_CONFIG = {
  memoryKib: 16384, // 16 MiB - reasonable for browser
  iterations: 3, // OWASP minimum recommendation
  parallelism: 1, // Single thread for web workers compatibility
  hashLength: 32, // 256-bit key for AES-256-GCM
};

// =========================================================================
// Types
// =========================================================================

export interface EncryptedIdentity {
  address: string;
  publicKey: string;
  encryptedSeed: string; // Base64-encoded encrypted seed
  createdAt: number;
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

// =========================================================================
// Utilities
// =========================================================================

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =========================================================================
// Key Derivation
// =========================================================================

/**
 * Derive an AES-256 key from passphrase using Argon2id
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Create a clean ArrayBuffer copy of salt to avoid SharedArrayBuffer issues
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength
  ) as ArrayBuffer;

  // Derive raw key material using Argon2id
  const keyMaterial = await argon2id({
    password: passphraseBytes,
    salt: new Uint8Array(saltBuffer),
    parallelism: ARGON2_CONFIG.parallelism,
    memorySize: ARGON2_CONFIG.memoryKib,
    iterations: ARGON2_CONFIG.iterations,
    hashLength: ARGON2_CONFIG.hashLength,
    outputType: 'binary',
  });

  // Create a clean ArrayBuffer from the hash result to avoid SharedArrayBuffer issues
  const keyBuffer = new ArrayBuffer(keyMaterial.length);
  new Uint8Array(keyBuffer).set(new Uint8Array(keyMaterial));

  // Import as AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// =========================================================================
// Encryption
// =========================================================================

/**
 * Check if a seed string is encrypted
 */
export function isEncryptedSeed(seed: string): boolean {
  return seed.startsWith(IDENTITY_PREFIX);
}

/**
 * Encrypt a seed (private key) with a passphrase
 *
 * @param seedHex - Hex-encoded 32-byte seed
 * @param passphrase - User-provided passphrase
 * @returns Encrypted seed string in format [IDENTITY:v1:base64]
 */
export async function encryptSeed(seedHex: string, passphrase: string): Promise<string> {
  const seed = hexToBytes(seedHex);

  if (seed.length !== 32) {
    throw new Error(`Invalid seed length: ${seed.length} (expected 32)`);
  }

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt);

  // Create a fresh ArrayBuffer to avoid SharedArrayBuffer issues with Web Crypto
  const seedBuffer = new ArrayBuffer(seed.length);
  new Uint8Array(seedBuffer).set(seed);

  // Encrypt the seed
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    seedBuffer
  );

  // Combine: salt (16) + iv (12) + ciphertext (32 + 16 auth tag = 48)
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  // Base64 encode
  const base64 = btoa(String.fromCharCode(...combined));

  return `${IDENTITY_PREFIX}${base64}${IDENTITY_SUFFIX}`;
}

/**
 * Decrypt an encrypted seed with a passphrase
 *
 * @param encryptedSeed - Encrypted seed string
 * @param passphrase - User-provided passphrase
 * @returns Hex-encoded seed, or null if decryption fails
 */
export async function decryptSeed(
  encryptedSeed: string,
  passphrase: string
): Promise<string | null> {
  if (!encryptedSeed.startsWith(IDENTITY_PREFIX)) {
    // Not encrypted - return as-is (for migration)
    return encryptedSeed;
  }

  const endIndex = encryptedSeed.indexOf(IDENTITY_SUFFIX, IDENTITY_PREFIX.length);
  if (endIndex === -1) {
    return null;
  }

  const payload = encryptedSeed.slice(IDENTITY_PREFIX.length, endIndex);

  try {
    // Base64 decode
    const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));

    const minLength = SALT_LENGTH + IV_LENGTH + 32 + 16; // salt + iv + seed + auth tag
    if (combined.length < minLength) {
      return null;
    }

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive key from passphrase
    const key = await deriveKey(passphrase, salt);

    // Create a fresh ArrayBuffer for the ciphertext to avoid SharedArrayBuffer issues
    const ciphertextBuffer = new ArrayBuffer(ciphertext.length);
    new Uint8Array(ciphertextBuffer).set(ciphertext);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertextBuffer
    );

    const seed = new Uint8Array(plaintext);
    if (seed.length !== 32) {
      return null;
    }

    return bytesToHex(seed);
  } catch (error) {
    // Decryption failed (wrong passphrase or corrupted data)
    console.error('[IdentityEncryption] Decryption failed:', error);
    return null;
  }
}

/**
 * Validate passphrase strength
 *
 * @returns Error message if invalid, null if valid
 */
export function validatePassphrase(passphrase: string): string | null {
  if (passphrase.length < 8) {
    return 'Passphrase must be at least 8 characters';
  }
  return null;
}
