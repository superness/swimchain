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
 * Profile information structure
 */
export interface ProfileInfo {
  /** Display name (optional, falls back to truncated address) */
  displayName?: string;
  /** Short bio/description */
  bio?: string;
  /** Website or other link */
  website?: string;
  /** Additional links (twitter, github, etc.) */
  links?: Record<string, string>;
  /** Profile banner color or image hash */
  bannerColor?: string;
  /** When the profile was last updated */
  updatedAt: number;
  /** Whether this profile is private (encrypted) */
  isPrivate?: boolean;
  /** Public display name even when profile is private (optional) */
  publicDisplayName?: string;
}

/**
 * Private profile metadata (stored unencrypted to indicate privacy)
 */
export interface PrivateProfileMeta {
  /** Indicates this is a private profile */
  isPrivate: true;
  /** Public display name (visible to everyone) */
  publicDisplayName?: string;
  /** Public avatar (visible to everyone) - if not set, avatar is also private */
  publicAvatar?: boolean;
  /** When the profile was last updated */
  updatedAt: number;
  /** Encrypted profile data (base64) */
  encryptedData: string;
}

/**
 * Avatar information
 */
export interface AvatarInfo {
  /** Content ID of the avatar image */
  contentId: string;
  /** Image format (png, jpg, webp) */
  format: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** When the avatar was set */
  updatedAt: number;
}

/**
 * Full user profile (combined info + avatar)
 */
export interface UserProfile {
  /** User's public key (hex) */
  userPk: string;
  /** Profile space ID */
  profileSpaceId: string;
  /** Profile information */
  info: ProfileInfo | null;
  /** Avatar information */
  avatar: AvatarInfo | null;
  /** Whether this profile exists on-chain */
  exists: boolean;
  /** Whether this profile is private/encrypted */
  isPrivate?: boolean;
  /** Whether we could decrypt the profile (only true if we're the owner) */
  isDecrypted?: boolean;
  /** Public display name (available even if profile is private) */
  publicDisplayName?: string;
}

/**
 * Generate a deterministic profile space ID from a user's public key.
 *
 * This ensures each user has exactly one profile space that can be
 * discovered by anyone who knows their public key.
 *
 * @param userPk - User's public key (hex string)
 * @returns Profile space ID (32 hex chars)
 */
export function getProfileSpaceId(userPk: string): string {
  const preimage = `profile:${PROFILE_VERSION}:${userPk.toLowerCase()}`;
  const hash = sha256(new TextEncoder().encode(preimage));
  return applyClass(SpaceClass.Profile, hash);
}

/**
 * Check if a space ID is a profile space for a given user
 */
export function isProfileSpace(spaceId: string, userPk: string): boolean {
  return getProfileSpaceId(userPk) === spaceId.toLowerCase();
}

/**
 * Encode profile info as a post body
 */
export function encodeProfileInfo(info: ProfileInfo): string {
  return `[${PROFILE_INFO_TYPE}]${JSON.stringify(info)}`;
}

/**
 * Decode profile info from a post body
 */
export function decodeProfileInfo(body: string): ProfileInfo | null {
  if (!body.startsWith(`[${PROFILE_INFO_TYPE}]`)) {
    return null;
  }

  try {
    const json = body.slice(PROFILE_INFO_TYPE.length + 2);
    return JSON.parse(json) as ProfileInfo;
  } catch {
    return null;
  }
}

/**
 * Encode avatar info as a post body
 */
export function encodeAvatarInfo(avatar: AvatarInfo): string {
  return `[${PROFILE_AVATAR_TYPE}]${JSON.stringify(avatar)}`;
}

/**
 * Decode avatar info from a post body
 */
export function decodeAvatarInfo(body: string): AvatarInfo | null {
  if (!body.startsWith(`[${PROFILE_AVATAR_TYPE}]`)) {
    return null;
  }

  try {
    const json = body.slice(PROFILE_AVATAR_TYPE.length + 2);
    return JSON.parse(json) as AvatarInfo;
  } catch {
    return null;
  }
}

/**
 * Generate a color from a public key for default avatar background
 */
export function getAvatarColor(userPk: string): string {
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
export function getAvatarInitials(displayName?: string, userPk?: string): string {
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
export function createEmptyProfile(userPk: string): UserProfile {
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
export function deriveProfileKey(privateKey: string): Uint8Array {
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
async function importProfileKey(profileKey: Uint8Array): Promise<CryptoKey> {
  if (profileKey.length !== 32) {
    throw new Error('Profile key must be 32 bytes');
  }

  // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
  const keyBuffer = new ArrayBuffer(32);
  new Uint8Array(keyBuffer).set(profileKey);

  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt profile info for private storage
 *
 * @param info - Profile info to encrypt
 * @param profileKey - 32-byte profile encryption key
 * @returns Encrypted data as base64 string
 */
export async function encryptProfileInfo(
  info: ProfileInfo,
  profileKey: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(info));

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Import key and encrypt
  const key = await importProfileKey(profileKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

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
export async function decryptProfileInfo(
  encryptedData: string,
  profileKey: Uint8Array
): Promise<ProfileInfo | null> {
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
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext)) as ProfileInfo;
  } catch (error) {
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
export async function encodePrivateProfileInfo(
  info: ProfileInfo,
  profileKey: Uint8Array,
  publicDisplayName?: string,
  publicAvatar?: boolean
): Promise<string> {
  const encryptedData = await encryptProfileInfo(info, profileKey);

  const meta: PrivateProfileMeta = {
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
export async function decodePrivateProfileInfo(
  body: string,
  profileKey?: Uint8Array
): Promise<{
  meta: PrivateProfileMeta;
  info: ProfileInfo | null;
  isDecrypted: boolean;
} | null> {
  if (!body.startsWith(`[${PROFILE_INFO_PRIVATE_TYPE}]`)) {
    return null;
  }

  try {
    const json = body.slice(PROFILE_INFO_PRIVATE_TYPE.length + 2);
    const meta = JSON.parse(json) as PrivateProfileMeta;

    // Try to decrypt if we have the key
    let info: ProfileInfo | null = null;
    let isDecrypted = false;

    if (profileKey) {
      info = await decryptProfileInfo(meta.encryptedData, profileKey);
      isDecrypted = info !== null;
    }

    return { meta, info, isDecrypted };
  } catch {
    return null;
  }
}

/**
 * Check if a profile post body indicates a private profile
 */
export function isPrivateProfile(body: string): boolean {
  return body.startsWith(`[${PROFILE_INFO_PRIVATE_TYPE}]`);
}

/**
 * Try to decode profile info, handling both public and private formats
 *
 * @param body - Post body (could be public or private profile)
 * @param profileKey - Profile key (if available, for private profile decryption)
 * @returns Profile info with privacy metadata
 */
export async function decodeAnyProfileInfo(
  body: string,
  profileKey?: Uint8Array
): Promise<{
  info: ProfileInfo | null;
  isPrivate: boolean;
  isDecrypted: boolean;
  publicDisplayName?: string;
} | null> {
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
