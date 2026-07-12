/**
 * User Profile Utilities
 *
 * Profiles are stored as a special "profile space" tied to each user's identity.
 * The profile space ID is deterministically derived from the user's public key.
 *
 * Profile data is stored as posts in this space:
 * - Profile info post: JSON with bio, display name, links, etc.
 * - Avatar post: Image content for the user's avatar
 *
 * This allows profiles to use existing space/thread infrastructure and benefit
 * from the same sync, storage, and content addressing.
 *
 * ## Private Profiles
 *
 * Users can make their profile "private" (encrypted). When private:
 * - Profile info is encrypted with a key derived from their identity
 * - Only the owner can decrypt and view the full profile
 * - Others see a "Private Profile" indicator
 * - Display name and avatar can optionally remain public
 *
 * @packageDocumentation
 */
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes } from './x25519';
import { SpaceClass, applyClass } from './spaceClass';
/** Profile space version for future compatibility */
const PROFILE_VERSION = 'v1';
/** Content type markers for profile posts */
export const PROFILE_INFO_TYPE = 'PROFILE_INFO';
export const PROFILE_AVATAR_TYPE = 'PROFILE_AVATAR';
/** Marker for encrypted/private profile info */
export const PROFILE_INFO_PRIVATE_TYPE = 'PROFILE_INFO_PRIVATE';
/**
 * Generate a deterministic profile space ID from a user's public key.
 *
 * This ensures each user has exactly one profile space that can be
 * discovered by anyone who knows their public key.
 *
 * @param userPk - User's public key (hex string)
 * @returns Profile space ID (32 hex chars)
 */
export function getProfileSpaceId(userPk) {
    const preimage = `profile:${PROFILE_VERSION}:${userPk.toLowerCase()}`;
    const hash = sha256(new TextEncoder().encode(preimage));
    return applyClass(SpaceClass.Profile, hash);
}
/**
 * Check if a space ID is a profile space for a given user
 */
export function isProfileSpace(spaceId, userPk) {
    return getProfileSpaceId(userPk) === spaceId.toLowerCase();
}
/**
 * Encode profile info as a post body
 */
export function encodeProfileInfo(info) {
    return `[${PROFILE_INFO_TYPE}]${JSON.stringify(info)}`;
}
/**
 * Decode profile info from a post body
 */
export function decodeProfileInfo(body) {
    if (!body.startsWith(`[${PROFILE_INFO_TYPE}]`)) {
        return null;
    }
    try {
        const json = body.slice(PROFILE_INFO_TYPE.length + 2);
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
/**
 * Encode avatar info as a post body
 */
export function encodeAvatarInfo(avatar) {
    return `[${PROFILE_AVATAR_TYPE}]${JSON.stringify(avatar)}`;
}
/**
 * Decode avatar info from a post body
 */
export function decodeAvatarInfo(body) {
    if (!body.startsWith(`[${PROFILE_AVATAR_TYPE}]`)) {
        return null;
    }
    try {
        const json = body.slice(PROFILE_AVATAR_TYPE.length + 2);
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
/**
 * Generate a color from a public key for default avatar background
 */
export function getAvatarColor(userPk) {
    // Use first 6 chars of hash as hex color
    const hash = sha256(new TextEncoder().encode(userPk));
    const byte0 = hash[0] ?? 0;
    const byte1 = hash[1] ?? 0;
    const byte2 = hash[2] ?? 0;
    const byte3 = hash[3] ?? 0;
    const hue = (byte0 + byte1 * 256) % 360;
    const saturation = 60 + (byte2 % 20); // 60-80%
    const lightness = 45 + (byte3 % 15); // 45-60%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
/**
 * Get initials from a display name or public key
 */
export function getAvatarInitials(displayName, userPk) {
    if (displayName) {
        const parts = displayName.trim().split(/\s+/);
        if (parts.length >= 2) {
            const first = parts[0]?.[0] ?? '';
            const last = parts[parts.length - 1]?.[0] ?? '';
            return (first + last).toUpperCase();
        }
        return displayName.slice(0, 2).toUpperCase();
    }
    if (userPk) {
        return userPk.slice(0, 2).toUpperCase();
    }
    return '??';
}
/**
 * Default empty profile
 */
export function createEmptyProfile(userPk) {
    return {
        userPk,
        profileSpaceId: getProfileSpaceId(userPk),
        info: null,
        avatar: null,
        exists: false,
    };
}
// ============================================================================
// Private Profile Encryption
// ============================================================================
/** IV length for AES-GCM */
const IV_LENGTH = 12;
/**
 * Derive a profile encryption key from a user's private key.
 *
 * Uses HKDF-like derivation: SHA256(privateKey || "profile-encryption-key-v1")
 * This ensures the profile key is deterministic and only known to the user.
 *
 * @param privateKey - User's Ed25519 private key (32 or 64 bytes hex)
 * @returns 32-byte profile encryption key
 */
export function deriveProfileKey(privateKey) {
    // Take first 32 bytes of private key (seed portion)
    const pkBytes = hexToBytes(privateKey);
    const seed = pkBytes.slice(0, 32);
    // Derive profile key: SHA256(seed || context)
    const context = new TextEncoder().encode('profile-encryption-key-v1');
    const combined = new Uint8Array(seed.length + context.length);
    combined.set(seed, 0);
    combined.set(context, seed.length);
    return sha256(combined);
}
/**
 * Import a profile key as a CryptoKey for AES-GCM
 */
async function importProfileKey(profileKey) {
    if (profileKey.length !== 32) {
        throw new Error('Profile key must be 32 bytes');
    }
    // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
    const keyBuffer = new ArrayBuffer(32);
    new Uint8Array(keyBuffer).set(profileKey);
    return crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/**
 * Encrypt profile info for private storage
 *
 * @param info - Profile info to encrypt
 * @param profileKey - 32-byte profile encryption key
 * @returns Encrypted data as base64 string
 */
export async function encryptProfileInfo(info, profileKey) {
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(info));
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    // Import key and encrypt
    const key = await importProfileKey(profileKey);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    // Combine: iv (12) + ciphertext
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);
    // Return as base64
    return btoa(String.fromCharCode(...combined));
}
/**
 * Decrypt profile info from private storage
 *
 * @param encryptedData - Base64 encrypted profile data
 * @param profileKey - 32-byte profile encryption key
 * @returns Decrypted profile info, or null if decryption fails
 */
export async function decryptProfileInfo(encryptedData, profileKey) {
    try {
        // Base64 decode
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        if (combined.length < IV_LENGTH + 1) {
            return null;
        }
        // Extract iv and ciphertext
        const iv = combined.slice(0, IV_LENGTH);
        const ciphertext = combined.slice(IV_LENGTH);
        // Import key and decrypt
        const key = await importProfileKey(profileKey);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(plaintext));
    }
    catch (error) {
        console.error('[Profile] Decryption failed:', error);
        return null;
    }
}
/**
 * Encode a private profile as a post body
 *
 * The post body contains:
 * - Unencrypted metadata (isPrivate flag, public display name)
 * - Encrypted profile data (base64)
 *
 * @param info - Full profile info to encrypt
 * @param profileKey - 32-byte profile encryption key
 * @param publicDisplayName - Optional name to show publicly
 * @param publicAvatar - Whether avatar should remain public
 */
export async function encodePrivateProfileInfo(info, profileKey, publicDisplayName, publicAvatar) {
    const encryptedData = await encryptProfileInfo(info, profileKey);
    const meta = {
        isPrivate: true,
        publicDisplayName,
        publicAvatar,
        updatedAt: info.updatedAt,
        encryptedData,
    };
    return `[${PROFILE_INFO_PRIVATE_TYPE}]${JSON.stringify(meta)}`;
}
/**
 * Decode a private profile from a post body
 *
 * @param body - Post body containing private profile
 * @param profileKey - Profile key (if available, for decryption)
 * @returns Object with metadata and optionally decrypted info
 */
export async function decodePrivateProfileInfo(body, profileKey) {
    if (!body.startsWith(`[${PROFILE_INFO_PRIVATE_TYPE}]`)) {
        return null;
    }
    try {
        const json = body.slice(PROFILE_INFO_PRIVATE_TYPE.length + 2);
        const meta = JSON.parse(json);
        // Try to decrypt if we have the key
        let info = null;
        let isDecrypted = false;
        if (profileKey) {
            info = await decryptProfileInfo(meta.encryptedData, profileKey);
            isDecrypted = info !== null;
        }
        return { meta, info, isDecrypted };
    }
    catch {
        return null;
    }
}
/**
 * Check if a profile post body indicates a private profile
 */
export function isPrivateProfile(body) {
    return body.startsWith(`[${PROFILE_INFO_PRIVATE_TYPE}]`);
}
/**
 * Try to decode profile info, handling both public and private formats
 *
 * @param body - Post body (could be public or private profile)
 * @param profileKey - Profile key (if available, for private profile decryption)
 * @returns Profile info with privacy metadata
 */
export async function decodeAnyProfileInfo(body, profileKey) {
    // Try private profile first
    if (isPrivateProfile(body)) {
        const result = await decodePrivateProfileInfo(body, profileKey);
        if (result) {
            return {
                info: result.info,
                isPrivate: true,
                isDecrypted: result.isDecrypted,
                publicDisplayName: result.meta.publicDisplayName,
            };
        }
        return null;
    }
    // Try public profile
    const info = decodeProfileInfo(body);
    if (info) {
        return {
            info,
            isPrivate: false,
            isDecrypted: true,
            publicDisplayName: info.displayName,
        };
    }
    return null;
}
//# sourceMappingURL=profile.js.map