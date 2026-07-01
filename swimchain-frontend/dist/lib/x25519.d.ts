/**
 * X25519 Key Derivation and NaCl Box Encryption
 *
 * Converts Ed25519 identity keys to X25519 for encryption,
 * enabling private space key exchange between users.
 *
 * Uses @noble/curves for cryptographic operations.
 */
/**
 * Convert Ed25519 private key (seed) to X25519 private key
 *
 * Ed25519 private key is a 32-byte seed. We hash it with SHA-512
 * and use the first 32 bytes (clamped) as the X25519 private key.
 * This matches libsodium's crypto_sign_ed25519_sk_to_curve25519.
 */
export declare function ed25519PrivateToX25519(ed25519PrivateKey: Uint8Array): Uint8Array;
/**
 * Convert Ed25519 public key to X25519 public key
 *
 * Uses the birational map from Ed25519 to Curve25519.
 * This matches libsodium's crypto_sign_ed25519_pk_to_curve25519.
 */
export declare function ed25519PublicToX25519(ed25519PublicKey: Uint8Array): Uint8Array;
/**
 * Derive X25519 keypair from Ed25519 seed
 */
export declare function deriveX25519Keys(ed25519Seed: Uint8Array): {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
};
/**
 * Compute shared secret using X25519 Diffie-Hellman
 */
export declare function x25519SharedSecret(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array;
/**
 * NaCl box: Encrypt a message for a recipient
 *
 * Uses X25519 for key exchange and XSalsa20-Poly1305 for authenticated encryption.
 * Returns: nonce (24 bytes) || ciphertext
 */
export declare function x25519Box(message: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): Uint8Array;
/**
 * NaCl unbox: Decrypt a message from a sender
 *
 * Input format: nonce (24 bytes) || ciphertext
 * Returns decrypted message or null if decryption fails
 */
export declare function x25519Unbox(boxedMessage: Uint8Array, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null;
/**
 * Generate a random 32-byte space key for AES-256-GCM encryption
 */
export declare function generateSpaceKey(): Uint8Array;
/**
 * Encrypt a space key for a recipient using their X25519 public key
 */
export declare function encryptSpaceKeyForRecipient(spaceKey: Uint8Array, recipientX25519PublicKey: Uint8Array, senderX25519SecretKey: Uint8Array): Uint8Array;
/**
 * Decrypt a space key that was encrypted for us
 */
export declare function decryptSpaceKey(encryptedSpaceKey: Uint8Array, senderX25519PublicKey: Uint8Array, recipientX25519SecretKey: Uint8Array): Uint8Array | null;
//# sourceMappingURL=x25519.d.ts.map