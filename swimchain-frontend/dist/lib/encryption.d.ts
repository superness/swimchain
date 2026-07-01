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
/**
 * Check if content is encrypted
 */
export declare function isEncrypted(content: string): boolean;
/**
 * Encrypt content with a passphrase
 *
 * @param content - Plain text content to encrypt
 * @param passphrase - User-provided passphrase
 * @returns Encrypted content string with metadata
 */
export declare function encryptContent(content: string, passphrase: string): Promise<string>;
/**
 * Decrypt content with a passphrase
 *
 * @param encryptedContent - Encrypted content string
 * @param passphrase - User-provided passphrase
 * @returns Decrypted plain text, or null if decryption fails
 */
export declare function decryptContent(encryptedContent: string, passphrase: string): Promise<string | null>;
/**
 * Encrypt title and body together
 * Format: title\n\nbody (to preserve structure)
 */
export declare function encryptPost(title: string, body: string, passphrase: string): Promise<{
    encryptedTitle: string;
    encryptedBody: string;
}>;
/**
 * Decrypt a post (title and body)
 */
export declare function decryptPost(encryptedBody: string, passphrase: string): Promise<{
    title: string;
    body: string;
} | null>;
/**
 * Generate a random passphrase (for convenience)
 */
export declare function generatePassphrase(length?: number): string;
/**
 * Encrypt binary media data (images) with a passphrase
 *
 * @param data - Raw media bytes (ArrayBuffer or Uint8Array)
 * @param passphrase - User-provided passphrase
 * @returns Encrypted bytes as Uint8Array
 */
export declare function encryptMedia(data: ArrayBuffer | Uint8Array, passphrase: string): Promise<Uint8Array>;
/**
 * Decrypt binary media data (images) with a passphrase
 *
 * @param encryptedData - Encrypted bytes (from encryptMedia)
 * @param passphrase - User-provided passphrase
 * @returns Decrypted bytes, or null if decryption fails
 */
export declare function decryptMedia(encryptedData: ArrayBuffer | Uint8Array, passphrase: string): Promise<Uint8Array | null>;
/**
 * Convert base64 string to Uint8Array
 */
export declare function base64ToBytes(base64: string): Uint8Array;
/**
 * Convert Uint8Array to base64 string
 */
export declare function bytesToBase64(bytes: Uint8Array): string;
/**
 * Check if content is encrypted with a space key
 */
export declare function isPrivateEncrypted(content: string): boolean;
/**
 * Encrypt content with a space key (for private spaces)
 *
 * Format: [PRIVATE:v1:<base64(iv:ciphertext)>]
 *
 * @param content - Plain text content to encrypt
 * @param spaceKey - 32-byte AES-256 key
 * @returns Encrypted content string
 */
export declare function encryptWithSpaceKey(content: string, spaceKey: Uint8Array): Promise<string>;
/**
 * Decrypt content with a space key (for private spaces)
 *
 * @param encryptedContent - Encrypted content string
 * @param spaceKey - 32-byte AES-256 key
 * @returns Decrypted plain text, or null if decryption fails
 */
export declare function decryptWithSpaceKey(encryptedContent: string, spaceKey: Uint8Array): Promise<string | null>;
/**
 * Encrypt a private space post (title and body)
 */
export declare function encryptPrivatePost(title: string, body: string, spaceKey: Uint8Array): Promise<{
    encryptedTitle: string;
    encryptedBody: string;
}>;
/**
 * Decrypt a private space post
 */
export declare function decryptPrivatePost(encryptedBody: string, spaceKey: Uint8Array): Promise<{
    title: string;
    body: string;
} | null>;
/**
 * Encrypt media with a space key (for private space images)
 */
export declare function encryptPrivateMedia(data: ArrayBuffer | Uint8Array, spaceKey: Uint8Array): Promise<Uint8Array>;
/**
 * Decrypt media with a space key (for private space images)
 */
export declare function decryptPrivateMedia(encryptedData: ArrayBuffer | Uint8Array, spaceKey: Uint8Array): Promise<Uint8Array | null>;
/**
 * Encrypt a space name with the space key
 */
export declare function encryptSpaceName(name: string, spaceKey: Uint8Array): Promise<Uint8Array>;
/**
 * Decrypt a space name with the space key
 */
export declare function decryptSpaceName(encryptedName: Uint8Array, spaceKey: Uint8Array): Promise<string | null>;
//# sourceMappingURL=encryption.d.ts.map