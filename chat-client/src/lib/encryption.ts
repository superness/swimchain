/**
 * Client-side encryption utilities for encrypted messages/channels
 *
 * Uses Web Crypto API with:
 * - PBKDF2 for key derivation from passphrase (via Web Worker)
 * - AES-GCM for symmetric encryption
 *
 * Encrypted content format:
 * [ENCRYPTED:v1:<base64(salt:iv:ciphertext)>]<rest of content>
 */

import type { DeriveKeyRequest, DeriveKeyResponse } from './encryption-worker';

const ENCRYPTION_PREFIX = '[ENCRYPTED:v1:';
const ENCRYPTION_SUFFIX = ']';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// =========================================================================
// Web Worker for PBKDF2 (M-CLIENT-1 fix)
// =========================================================================

let encryptionWorker: Worker | null = null;
let workerRequestId = 0;
const pendingRequests = new Map<string, {
  resolve: (key: CryptoKey) => void;
  reject: (error: Error) => void;
}>();

/**
 * Initialize the encryption worker lazily
 */
function getWorker(): Worker | null {
  if (encryptionWorker) {
    return encryptionWorker;
  }

  // Only create worker in browser environment with Worker support
  if (typeof Worker === 'undefined') {
    return null;
  }

  try {
    encryptionWorker = new Worker(
      new URL('./encryption-worker.ts', import.meta.url),
      { type: 'module' }
    );

    encryptionWorker.onmessage = (event: MessageEvent<DeriveKeyResponse>) => {
      const response = event.data;
      if (response.type === 'deriveKeyResult') {
        const pending = pendingRequests.get(response.id);
        if (pending) {
          pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error));
          } else if (response.key) {
            // Import the raw key back as CryptoKey
            crypto.subtle.importKey(
              'raw',
              response.key,
              { name: 'AES-GCM', length: 256 },
              false,
              ['encrypt', 'decrypt']
            ).then(pending.resolve).catch(pending.reject);
          } else {
            pending.reject(new Error('No key in response'));
          }
        }
      }
    };

    encryptionWorker.onerror = (error) => {
      console.error('[Encryption] Worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error('Worker error'));
        pendingRequests.delete(id);
      }
      // Reset worker to allow retry
      encryptionWorker = null;
    };

    return encryptionWorker;
  } catch (err) {
    console.warn('[Encryption] Failed to create worker, falling back to main thread:', err);
    return null;
  }
}

/**
 * Derive key using Web Worker (non-blocking)
 */
async function deriveKeyViaWorker(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const worker = getWorker();
  if (!worker) {
    // Fallback to main thread if worker unavailable
    return deriveKeyDirect(passphrase, salt);
  }

  return new Promise((resolve, reject) => {
    const id = `derive-${++workerRequestId}`;
    pendingRequests.set(id, { resolve, reject });

    const request: DeriveKeyRequest = {
      type: 'deriveKey',
      id,
      passphrase,
      salt: new Uint8Array(salt), // Clone to ensure transferability
    };

    worker.postMessage(request);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Key derivation timed out'));
      }
    }, 30000);
  });
}

/**
 * Direct PBKDF2 derivation on main thread (fallback)
 */
async function deriveKeyDirect(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Check if content is encrypted
 */
export function isEncrypted(content: string): boolean {
  return content.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Extract encrypted payload from content
 */
function extractPayload(content: string): { payload: string; suffix: string } | null {
  if (!content.startsWith(ENCRYPTION_PREFIX)) {
    return null;
  }

  const endIndex = content.indexOf(ENCRYPTION_SUFFIX, ENCRYPTION_PREFIX.length);
  if (endIndex === -1) {
    return null;
  }

  const payload = content.slice(ENCRYPTION_PREFIX.length, endIndex);
  const suffix = content.slice(endIndex + ENCRYPTION_SUFFIX.length);

  return { payload, suffix };
}

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2
 *
 * Uses Web Worker to avoid blocking main thread (M-CLIENT-1 fix).
 * Falls back to main thread derivation if worker is unavailable.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKeyViaWorker(passphrase, salt);
}

/**
 * Encrypt content with a passphrase
 *
 * @param content - Plain text content to encrypt
 * @param passphrase - User-provided passphrase
 * @returns Encrypted content string with metadata
 */
export async function encryptContent(content: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt);

  // Encrypt the content
  const plaintext = encoder.encode(content);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  // Base64 encode
  const base64 = btoa(String.fromCharCode(...combined));

  return `${ENCRYPTION_PREFIX}${base64}${ENCRYPTION_SUFFIX}`;
}

/**
 * Decrypt content with a passphrase
 *
 * @param encryptedContent - Encrypted content string
 * @param passphrase - User-provided passphrase
 * @returns Decrypted plain text, or null if decryption fails
 */
export async function decryptContent(encryptedContent: string, passphrase: string): Promise<string | null> {
  const extracted = extractPayload(encryptedContent);
  if (!extracted) {
    return null;
  }

  try {
    // Base64 decode
    const combined = Uint8Array.from(atob(extracted.payload), c => c.charCodeAt(0));

    if (combined.length < SALT_LENGTH + IV_LENGTH + 1) {
      return null;
    }

    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive key from passphrase
    const key = await deriveKey(passphrase, salt);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext) + extracted.suffix;
  } catch (error) {
    // Decryption failed (wrong passphrase or corrupted data)
    console.error('[Encryption] Decryption failed:', error);
    return null;
  }
}

/**
 * Encrypt message content with a passphrase
 */
export async function encryptMessage(
  content: string,
  passphrase: string
): Promise<string> {
  return encryptContent(content, passphrase);
}

/**
 * Decrypt a message
 */
export async function decryptMessage(
  encryptedContent: string,
  passphrase: string
): Promise<string | null> {
  return decryptContent(encryptedContent, passphrase);
}

/**
 * Generate a random passphrase (for convenience)
 */
export function generatePassphrase(length: number = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const array = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// =========================================================================
// Private Channel Encryption (using channel keys instead of passphrases)
// =========================================================================

const PRIVATE_PREFIX = '[PRIVATE:v1:';

/**
 * Check if content is encrypted with a channel key
 */
export function isPrivateEncrypted(content: string): boolean {
  return content.startsWith(PRIVATE_PREFIX);
}

/**
 * Import a raw 32-byte channel key as a CryptoKey for AES-GCM
 */
async function importChannelKey(channelKey: Uint8Array): Promise<CryptoKey> {
  if (channelKey.length !== 32) {
    throw new Error('Channel key must be 32 bytes');
  }

  // Create a new ArrayBuffer to ensure compatibility
  const keyBuffer = new Uint8Array(channelKey).buffer;

  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt content with a channel key (for private channels)
 *
 * Format: [PRIVATE:v1:<base64(iv:ciphertext)>]
 *
 * @param content - Plain text content to encrypt
 * @param channelKey - 32-byte AES-256 key
 * @returns Encrypted content string
 */
export async function encryptWithChannelKey(
  content: string,
  channelKey: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Import the channel key
  const key = await importChannelKey(channelKey);

  // Encrypt the content
  const plaintext = encoder.encode(content);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Combine iv + ciphertext (no salt needed - key is already derived)
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  // Base64 encode
  const base64 = btoa(String.fromCharCode(...combined));

  return `${PRIVATE_PREFIX}${base64}${ENCRYPTION_SUFFIX}`;
}

/**
 * Decrypt content with a channel key (for private channels)
 *
 * @param encryptedContent - Encrypted content string
 * @param channelKey - 32-byte AES-256 key
 * @returns Decrypted plain text, or null if decryption fails
 */
export async function decryptWithChannelKey(
  encryptedContent: string,
  channelKey: Uint8Array
): Promise<string | null> {
  if (!encryptedContent.startsWith(PRIVATE_PREFIX)) {
    return null;
  }

  const endIndex = encryptedContent.indexOf(ENCRYPTION_SUFFIX, PRIVATE_PREFIX.length);
  if (endIndex === -1) {
    return null;
  }

  const payload = encryptedContent.slice(PRIVATE_PREFIX.length, endIndex);
  const suffix = encryptedContent.slice(endIndex + ENCRYPTION_SUFFIX.length);

  try {
    // Base64 decode
    const combined = Uint8Array.from(atob(payload), c => c.charCodeAt(0));

    if (combined.length < IV_LENGTH + 1) {
      return null;
    }

    // Extract iv and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Import the channel key
    const key = await importChannelKey(channelKey);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext) + suffix;
  } catch (error) {
    console.error('[Encryption] Private channel decryption failed:', error);
    return null;
  }
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 * Uses chunked approach to avoid call stack limits with large arrays
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Process in chunks to avoid call stack limits for large arrays
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }

  return btoa(chunks.join(''));
}
