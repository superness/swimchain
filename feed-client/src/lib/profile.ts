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
import { SpaceClass, applyClass } from './spaceClass';

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
 * Poster reputation summary (SPEC_12 §3.4/§4.5).
 *
 * A public, informational trust signal derived from community spam attestations
 * and time-based recovery. It carries NO protocol privileges — a high score never
 * makes posting cheaper or content longer-lived; it only reflects standing.
 */
export interface Reputation {
  /** Reputation score (base 100; decays on spam flags, recovers over time) */
  score: number;
  /** Effect tier name (Trusted / Normal / Watched / Restricted / Untrusted) */
  effect: string;
  /** Display badge for the effect tier */
  badge: string;
  /** Identity age in days */
  ageDays: number;
  /** Net spam flags received (received minus countered) */
  netSpamFlags: number;
  /** Whether the identity has any illegal-content flags */
  hasIllegalFlags: boolean;
  /** Total posts created */
  totalPosts: number;
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
  /** Poster reputation (trust signal), null when unavailable */
  reputation: Reputation | null;
  /** Whether this profile exists on-chain */
  exists: boolean;
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
 * Extract and parse a `[MARKER]{json}` segment from a post body.
 *
 * Handles the two storage realities that broke exact-prefix matching:
 * - the node stores bodies as title + double-newline + body (empty-title
 *   profile posts carry a leading double newline), and
 * - avatar updates write a COMBINED body: avatar segment, a "---" separator
 *   line, then the info segment - so each decoder must find its own segment
 *   and must not feed the separator/next segment into JSON.parse.
 */
function decodeMarkedSegment<T>(body: string, markerType: string): T | null {
  const marker = `[${markerType}]`;
  for (const segment of body.split(/\n---\n/)) {
    const trimmed = segment.replace(/^\s+/, '').replace(/\s+$/, '');
    if (!trimmed.startsWith(marker)) {
      continue;
    }
    try {
      return JSON.parse(trimmed.slice(marker.length)) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Decode profile info from a post body
 */
export function decodeProfileInfo(body: string): ProfileInfo | null {
  return decodeMarkedSegment<ProfileInfo>(body, PROFILE_INFO_TYPE);
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
  return decodeMarkedSegment<AvatarInfo>(body, PROFILE_AVATAR_TYPE);
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
    reputation: null,
    exists: false,
  };
}

/**
 * Parse a reputation object from a get_user_profile RPC response.
 * Returns null if the field is absent or malformed.
 */
export function parseReputation(raw: unknown): Reputation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.score !== 'number') return null;
  return {
    score: r.score,
    effect: typeof r.effect === 'string' ? r.effect : 'Normal',
    badge: typeof r.badge === 'string' ? r.badge : '',
    ageDays: typeof r.age_days === 'number' ? r.age_days : 0,
    netSpamFlags: typeof r.net_spam_flags === 'number' ? r.net_spam_flags : 0,
    hasIllegalFlags: r.has_illegal_flags === true,
    totalPosts: typeof r.total_posts === 'number' ? r.total_posts : 0,
  };
}
