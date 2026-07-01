/**
 * Client-side encryption utilities for encrypted posts/spaces
 *
 * Uses Web Crypto API with:
 * - PBKDF2 for key derivation from passphrase
 * - AES-GCM for symmetric encryption
 *
 * Encrypted content format:
 * [ENCRYPTED:v1:<base64(salt:iv:ciphertext)>]<rest of content>
 */

const ENCRYPTION_PREFIX = '[ENCRYPTED:v1:';
const ENCRYPTION_SUFFIX = ']';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

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
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
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
 * Encrypt title and body together
 * Format: title\n\nbody (to preserve structure)
 */
export async function encryptPost(
  title: string,
  body: string,
  passphrase: string
): Promise<{ encryptedTitle: string; encryptedBody: string }> {
  // Encrypt the full content (title + body together)
  const fullContent = `${title}\n\n${body}`;
  const encrypted = await encryptContent(fullContent, passphrase);

  // Title shows it's encrypted, body contains the encrypted payload
  return {
    encryptedTitle: '[Encrypted Post]',
    encryptedBody: encrypted,
  };
}

/**
 * Decrypt a post (title and body)
 */
export async function decryptPost(
  encryptedBody: string,
  passphrase: string
): Promise<{ title: string; body: string } | null> {
  const decrypted = await decryptContent(encryptedBody, passphrase);
  if (!decrypted) {
    return null;
  }

  // Split back into title and body
  const firstNewline = decrypted.indexOf('\n\n');
  if (firstNewline === -1) {
    return { title: '', body: decrypted };
  }

  return {
    title: decrypted.slice(0, firstNewline),
    body: decrypted.slice(firstNewline + 2),
  };
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
// Media Encryption (for images in encrypted posts)
// =========================================================================

/**
 * Encrypt binary media data (images) with a passphrase
 *
 * @param data - Raw media bytes (ArrayBuffer or Uint8Array)
 * @param passphrase - User-provided passphrase
 * @returns Encrypted bytes as Uint8Array
 */
export async function encryptMedia(
  data: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<Uint8Array> {
  // Convert to Uint8Array and then get a clean ArrayBuffer for Web Crypto API
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const plainBuffer = new ArrayBuffer(bytes.length);
  new Uint8Array(plainBuffer).set(bytes);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from passphrase
  const key = await deriveKey(passphrase, salt);

  // Encrypt the media
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBuffer
  );

  // Combine: salt (16) + iv (12) + ciphertext
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  return combined;
}

/**
 * Decrypt binary media data (images) with a passphrase
 *
 * @param encryptedData - Encrypted bytes (from encryptMedia)
 * @param passphrase - User-provided passphrase
 * @returns Decrypted bytes, or null if decryption fails
 */
export async function decryptMedia(
  encryptedData: ArrayBuffer | Uint8Array,
  passphrase: string
): Promise<Uint8Array | null> {
  try {
    const combined = encryptedData instanceof Uint8Array
      ? encryptedData
      : new Uint8Array(encryptedData);

    if (combined.length < SALT_LENGTH + IV_LENGTH + 1) {
      console.error('[Encryption] Encrypted media too short');
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

    return new Uint8Array(plaintext);
  } catch (error) {
    console.error('[Encryption] Media decryption failed:', error);
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
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

// =========================================================================
// Private Space Encryption (using space keys instead of passphrases)
// =========================================================================

const PRIVATE_PREFIX = '[PRIVATE:v1:';

/**
 * Check if content is encrypted with a space key
 */
export function isPrivateEncrypted(content: string): boolean {
  return content.startsWith(PRIVATE_PREFIX);
}

/**
 * Import a raw 32-byte space key as a CryptoKey for AES-GCM
 */
async function importSpaceKey(spaceKey: Uint8Array): Promise<CryptoKey> {
  if (spaceKey.length !== 32) {
    throw new Error('Space key must be 32 bytes');
  }

  // Create a new ArrayBuffer to ensure compatibility
  const keyBuffer = new Uint8Array(spaceKey).buffer;

  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt content with a space key (for private spaces)
 *
 * Format: [PRIVATE:v1:<base64(iv:ciphertext)>]
 *
 * @param content - Plain text content to encrypt
 * @param spaceKey - 32-byte AES-256 key
 * @returns Encrypted content string
 */
export async function encryptWithSpaceKey(
  content: string,
  spaceKey: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Import the space key
  const key = await importSpaceKey(spaceKey);

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
 * Decrypt content with a space key (for private spaces)
 *
 * @param encryptedContent - Encrypted content string
 * @param spaceKey - 32-byte AES-256 key
 * @returns Decrypted plain text, or null if decryption fails
 */
export async function decryptWithSpaceKey(
  encryptedContent: string,
  spaceKey: Uint8Array
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

    // Import the space key
    const key = await importSpaceKey(spaceKey);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext) + suffix;
  } catch (error) {
    console.error('[Encryption] Private space decryption failed:', error);
    return null;
  }
}

/**
 * Encrypt a private space post (title and body)
 */
export async function encryptPrivatePost(
  title: string,
  body: string,
  spaceKey: Uint8Array
): Promise<{ encryptedTitle: string; encryptedBody: string }> {
  const fullContent = `${title}\n\n${body}`;
  const encrypted = await encryptWithSpaceKey(fullContent, spaceKey);

  return {
    encryptedTitle: '[Private]',
    encryptedBody: encrypted,
  };
}

/**
 * Decrypt a private space post
 */
export async function decryptPrivatePost(
  encryptedBody: string,
  spaceKey: Uint8Array
): Promise<{ title: string; body: string } | null> {
  const decrypted = await decryptWithSpaceKey(encryptedBody, spaceKey);
  if (!decrypted) {
    return null;
  }

  const firstNewline = decrypted.indexOf('\n\n');
  if (firstNewline === -1) {
    return { title: '', body: decrypted };
  }

  return {
    title: decrypted.slice(0, firstNewline),
    body: decrypted.slice(firstNewline + 2),
  };
}

/**
 * Encrypt media with a space key (for private space images)
 */
export async function encryptPrivateMedia(
  data: ArrayBuffer | Uint8Array,
  spaceKey: Uint8Array
): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const plainBuffer = new ArrayBuffer(bytes.length);
  new Uint8Array(plainBuffer).set(bytes);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Import the space key
  const key = await importSpaceKey(spaceKey);

  // Encrypt the media
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBuffer
  );

  // Combine: iv (12) + ciphertext
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return combined;
}

/**
 * Decrypt media with a space key (for private space images)
 */
export async function decryptPrivateMedia(
  encryptedData: ArrayBuffer | Uint8Array,
  spaceKey: Uint8Array
): Promise<Uint8Array | null> {
  try {
    const combined = encryptedData instanceof Uint8Array
      ? encryptedData
      : new Uint8Array(encryptedData);

    if (combined.length < IV_LENGTH + 1) {
      console.error('[Encryption] Encrypted private media too short');
      return null;
    }

    // Extract iv and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Import the space key
    const key = await importSpaceKey(spaceKey);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    console.error('[Encryption] Private media decryption failed:', error);
    return null;
  }
}

/**
 * Encrypt a space name with the space key
 */
export async function encryptSpaceName(
  name: string,
  spaceKey: Uint8Array
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await importSpaceKey(spaceKey);

  const plaintext = encoder.encode(name);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Combine: iv (12) + ciphertext
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return combined;
}

/**
 * Decrypt a space name with the space key
 */
export async function decryptSpaceName(
  encryptedName: Uint8Array,
  spaceKey: Uint8Array
): Promise<string | null> {
  try {
    if (encryptedName.length < IV_LENGTH + 1) {
      return null;
    }

    const iv = encryptedName.slice(0, IV_LENGTH);
    const ciphertext = encryptedName.slice(IV_LENGTH);

    const key = await importSpaceKey(spaceKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    console.error('[Encryption] Space name decryption failed:', error);
    return null;
  }
}
