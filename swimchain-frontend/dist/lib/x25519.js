/**
 * X25519 Key Derivation and NaCl Box Encryption
 *
 * Converts Ed25519 identity keys to X25519 for encryption,
 * enabling private space key exchange between users.
 *
 * Uses @noble/curves for cryptographic operations.
 */
import { x25519 } from '@noble/curves/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/hashes/utils';
import { xsalsa20poly1305 } from '@noble/ciphers/salsa.js';
// NaCl box nonce size (24 bytes)
const NONCE_SIZE = 24;
/**
 * Convert Ed25519 private key (seed) to X25519 private key
 *
 * Ed25519 private key is a 32-byte seed. We hash it with SHA-512
 * and use the first 32 bytes (clamped) as the X25519 private key.
 * This matches libsodium's crypto_sign_ed25519_sk_to_curve25519.
 */
export function ed25519PrivateToX25519(ed25519PrivateKey) {
    if (ed25519PrivateKey.length !== 32 && ed25519PrivateKey.length !== 64) {
        throw new Error('Ed25519 private key must be 32 or 64 bytes');
    }
    // If 64-byte key, take first 32 bytes (seed)
    const seed = ed25519PrivateKey.length === 64
        ? ed25519PrivateKey.slice(0, 32)
        : ed25519PrivateKey;
    // Hash the seed with SHA-512
    const hash = sha512(seed);
    // Take first 32 bytes and clamp for X25519
    const x25519Key = new Uint8Array(hash.slice(0, 32));
    // Clamp the key (as per X25519 spec)
    x25519Key[0] = (x25519Key[0] ?? 0) & 248;
    x25519Key[31] = ((x25519Key[31] ?? 0) & 127) | 64;
    return x25519Key;
}
/**
 * Convert Ed25519 public key to X25519 public key
 *
 * Uses the birational map from Ed25519 to Curve25519.
 * This matches libsodium's crypto_sign_ed25519_pk_to_curve25519.
 */
export function ed25519PublicToX25519(ed25519PublicKey) {
    if (ed25519PublicKey.length !== 32) {
        throw new Error('Ed25519 public key must be 32 bytes');
    }
    return convertEdPublicToX25519(ed25519PublicKey);
}
/**
 * Internal conversion of Ed25519 public key to X25519
 * Uses the birational map: u = (1 + y) / (1 - y) mod p
 */
function convertEdPublicToX25519(edPk) {
    // Field prime for Curve25519
    const p = BigInt('57896044618658097711785492504343953926634992332820282019728792003956564819949');
    // Read y-coordinate (Ed25519 public key is compressed y with sign bit)
    let y = BigInt(0);
    for (let i = 0; i < 32; i++) {
        const byte = edPk[i] ?? 0;
        y |= BigInt(byte) << BigInt(8 * i);
    }
    // Clear the sign bit
    y &= (BigInt(1) << BigInt(255)) - BigInt(1);
    // Compute u = (1 + y) * inverse(1 - y) mod p
    const one = BigInt(1);
    const numerator = mod(one + y, p);
    const denominator = mod(one - y, p);
    const u = mod(numerator * modInverse(denominator, p), p);
    // Convert back to bytes (little-endian)
    const result = new Uint8Array(32);
    let temp = u;
    for (let i = 0; i < 32; i++) {
        result[i] = Number(temp & BigInt(0xff));
        temp >>= BigInt(8);
    }
    return result;
}
// Modular arithmetic helpers
function mod(a, m) {
    return ((a % m) + m) % m;
}
function modInverse(a, m) {
    // Extended Euclidean algorithm
    let [old_r, r] = [a, m];
    let [old_s, s] = [BigInt(1), BigInt(0)];
    while (r !== BigInt(0)) {
        const quotient = old_r / r;
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
    }
    return mod(old_s, m);
}
/**
 * Derive X25519 keypair from Ed25519 seed
 */
export function deriveX25519Keys(ed25519Seed) {
    const secretKey = ed25519PrivateToX25519(ed25519Seed);
    const publicKey = x25519.getPublicKey(secretKey);
    return { publicKey, secretKey };
}
/**
 * Compute shared secret using X25519 Diffie-Hellman
 */
export function x25519SharedSecret(mySecretKey, theirPublicKey) {
    return x25519.getSharedSecret(mySecretKey, theirPublicKey);
}
/**
 * NaCl box: Encrypt a message for a recipient
 *
 * Uses X25519 for key exchange and XSalsa20-Poly1305 for authenticated encryption.
 * Returns: nonce (24 bytes) || ciphertext
 */
export function x25519Box(message, recipientPublicKey, senderSecretKey) {
    // Generate random nonce
    const nonce = randomBytes(NONCE_SIZE);
    // Compute shared secret
    const sharedSecret = x25519SharedSecret(senderSecretKey, recipientPublicKey);
    // Use XSalsa20-Poly1305 for encryption
    const cipher = xsalsa20poly1305(sharedSecret, nonce);
    const ciphertext = cipher.encrypt(message);
    // Prepend nonce to ciphertext
    const result = new Uint8Array(NONCE_SIZE + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, NONCE_SIZE);
    return result;
}
/**
 * NaCl unbox: Decrypt a message from a sender
 *
 * Input format: nonce (24 bytes) || ciphertext
 * Returns decrypted message or null if decryption fails
 */
export function x25519Unbox(boxedMessage, senderPublicKey, recipientSecretKey) {
    if (boxedMessage.length < NONCE_SIZE + 16) { // 16 = Poly1305 tag size
        return null;
    }
    // Extract nonce and ciphertext
    const nonce = boxedMessage.slice(0, NONCE_SIZE);
    const ciphertext = boxedMessage.slice(NONCE_SIZE);
    // Compute shared secret
    const sharedSecret = x25519SharedSecret(recipientSecretKey, senderPublicKey);
    try {
        // Use XSalsa20-Poly1305 for decryption
        const cipher = xsalsa20poly1305(sharedSecret, nonce);
        return cipher.decrypt(ciphertext);
    }
    catch {
        // Decryption failed (invalid tag or corrupted data)
        return null;
    }
}
/**
 * Generate a random 32-byte space key for AES-256-GCM encryption
 */
export function generateSpaceKey() {
    return randomBytes(32);
}
/**
 * Encrypt a space key for a recipient using their X25519 public key
 */
export function encryptSpaceKeyForRecipient(spaceKey, recipientX25519PublicKey, senderX25519SecretKey) {
    return x25519Box(spaceKey, recipientX25519PublicKey, senderX25519SecretKey);
}
/**
 * Decrypt a space key that was encrypted for us
 */
export function decryptSpaceKey(encryptedSpaceKey, senderX25519PublicKey, recipientX25519SecretKey) {
    return x25519Unbox(encryptedSpaceKey, senderX25519PublicKey, recipientX25519SecretKey);
}
//# sourceMappingURL=x25519.js.map