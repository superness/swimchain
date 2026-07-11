/**
 * User Profile Utilities
 *
 * Profiles are stored as a special "profile space" tied to each user's identity.
 * The profile space ID is deterministically derived from the user's public key.
 *
 * Profile data is stored as posts in this space:
 * - Profile info post: JSON with bio, display name, links, etc.
 * - Avatar post: Image content for the user's avatar
 */

import { sha256 } from '@noble/hashes/sha256';

/** Profile space version for future compatibility */
const PROFILE_VERSION = 'v1';

/** Content type markers for profile posts */
export const PROFILE_INFO_TYPE = 'PROFILE_INFO';
export const PROFILE_AVATAR_TYPE = 'PROFILE_AVATAR';

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
  /** Profile banner color */
  bannerColor?: string;
  /** When the profile was last updated */
  updatedAt: number;
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
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
  // Use first 16 bytes (32 hex chars) for space ID
  return bytesToHex(hash.slice(0, 16));
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
  // The node stores post bodies as title + double-newline + body; profile
  // posts have an empty title, so stored bodies carry a leading double
  // newline - trim before matching the marker.
  const trimmed = body.replace(/^\s+/, '');
  if (!trimmed.startsWith(`[${PROFILE_INFO_TYPE}]`)) {
    return null;
  }

  try {
    const json = trimmed.slice(PROFILE_INFO_TYPE.length + 2);
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
  // Same leading-double-newline trim as decodeProfileInfo (empty-title storage).
  const trimmed = body.replace(/^\s+/, '');
  if (!trimmed.startsWith(`[${PROFILE_AVATAR_TYPE}]`)) {
    return null;
  }

  try {
    const json = trimmed.slice(PROFILE_AVATAR_TYPE.length + 2);
    return JSON.parse(json) as AvatarInfo;
  } catch {
    return null;
  }
}

/**
 * Generate a color from a public key for default avatar background
 */
export function getAvatarColor(userPk: string): string {
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
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.substring(0, 8)}...${address.substring(address.length - 4)}`;
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
