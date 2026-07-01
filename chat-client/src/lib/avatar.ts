/**
 * Avatar Utilities
 *
 * Simple utilities for generating default avatars based on user IDs.
 */

/**
 * Simple string hash function for color generation
 * Uses DJB2 algorithm for a simple but consistent hash
 */
function simpleHash(str: string): number[] {
  let hash = 5381;
  const bytes: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char;
    bytes.push(char & 0xff);
  }

  // Generate pseudo-random bytes from hash
  const result: number[] = [];
  for (let i = 0; i < 4; i++) {
    result.push((hash >> (i * 8)) & 0xff);
  }
  return result;
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
 * Generate a color from a user ID for default avatar background
 */
export function getAvatarColor(userId: string): string {
  // Use hash of user ID to generate consistent color
  const hash = simpleHash(userId);
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
 * Get initials from a display name or user ID
 */
export function getAvatarInitials(displayName?: string, userId?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? '';
      const last = parts[parts.length - 1]?.[0] ?? '';
      return (first + last).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }

  if (userId) {
    // For sw1... or cs1... addresses, use first 2 chars after prefix
    if (userId.startsWith('sw1') || userId.startsWith('cs1')) {
      return userId.slice(3, 5).toUpperCase();
    }
    return userId.slice(0, 2).toUpperCase();
  }

  return '??';
}

/**
 * Generate a truncated display name from a user ID
 */
export function truncateUserId(userId: string): string {
  if (userId.startsWith('sw1') || userId.startsWith('cs1')) {
    return userId.slice(0, 8) + '...' + userId.slice(-4);
  }
  return userId.slice(0, 12);
}
