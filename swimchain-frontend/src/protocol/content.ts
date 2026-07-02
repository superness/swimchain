/**
 * Swimchain Content Protocol
 *
 * Defines the protocol-level types and utilities for Swimchain content
 * (posts, replies, threads), including content IDs, serialization format,
 * and metadata conventions.
 *
 * Content ID format: sha256:<hex>
 * Thread ID format: derived from parent content ID
 */

// ============================================================================
// Content Protocol Constants
// ============================================================================

/** Content ID prefix indicating SHA-256 hash */
export const CONTENT_ID_PREFIX = 'sha256:' as const;

/** Expected length of a SHA-256 hash in hex characters (32 bytes = 64 hex) */
export const CONTENT_HASH_HEX_LENGTH = 64 as const;

/** Expected minimum length of a full content ID string */
export const CONTENT_ID_MIN_LENGTH = 71 as const; // "sha256:" + 64 hex chars

/** Maximum title length per protocol spec (bytes) */
export const MAX_TITLE_BYTES = 256 as const;

/** Maximum body length per protocol spec (bytes) */
export const MAX_BODY_BYTES = 65536 as const; // 64 KiB

/** Maximum reply body length per protocol spec (bytes) */
export const MAX_REPLY_BYTES = 16384 as const; // 16 KiB

// ============================================================================
// Content Protocol Types
// ============================================================================

/**
 * Content type identifiers used in protocol messages
 */
export enum ContentTypeProtocol {
  /** Top-level post / thread */
  Post = 0x01,
  /** Reply to a post or another reply */
  Reply = 0x02,
  /** Quoted content reference */
  Quote = 0x03,
}

/**
 * Protocol-level content item
 *
 * Represents content as it flows over the network, excluding
 * UI-specific fields like heat percent or pool state.
 */
export interface ContentProtocol {
  /** Content ID in sha256:<hex> format */
  id: string;
  /** Content type */
  type: ContentTypeProtocol;
  /** Author's cs1... address */
  authorAddress: string;
  /** Parent content ID (null for top-level posts) */
  parentId: string | null;
  /** Space ID this content belongs to */
  spaceId: string;
  /** Content title (posts only, null for replies) */
  title: string | null;
  /** Content body */
  body: string | null;
  /** Unix timestamp (seconds) when created */
  createdAt: number;
  /** Unix timestamp (seconds) of last engagement */
  lastEngagement: number;
  /** Number of direct child replies */
  replyCount: number;
}

/**
 * Protocol-level thread representation
 */
export interface ThreadProtocol {
  /** The parent (root) content */
  parentContent: ContentProtocol;
  /** Child replies in chronological order */
  replies: ContentProtocol[];
  /** Total number of replies (may exceed replies.length if paginated) */
  totalReplies: number;
}

/**
 * Protocol-level reaction data
 */
export interface ReactionProtocol {
  /** Content ID being reacted to */
  contentId: string;
  /** Reactor's cs1... address */
  authorAddress: string;
  /** Reaction type numeric code */
  reactionType: number;
  /** Unix timestamp (seconds) */
  timestamp: number;
}

/**
 * Reaction counts per content
 */
export interface ReactionCountsProtocol {
  /** Content ID */
  contentId: string;
  /** Map of reaction type -> count */
  counts: Record<number, number>;
  /** Total number of reactions */
  total: number;
}

/**
 * Content engagement pool protocol representation
 */
export interface EngagementPoolProtocol {
  /** Pool ID */
  poolId: string;
  /** Content ID this pool is for */
  contentId: string;
  /** Accumulated PoW seconds */
  contributedSeconds: number;
  /** Required PoW seconds (always 60) */
  requiredSeconds: number;
  /** Number of unique contributors */
  contributorCount: number;
  /** Pool status */
  status: 'empty' | 'partial' | 'complete' | 'locked';
  /** Unix timestamp when pool expires */
  expiresAt: number;
}

// ============================================================================
// Content ID Utilities
// ============================================================================

/**
 * Check if a string looks like a valid content ID
 *
 * @param value - String to check
 * @returns true if the string starts with 'sha256:' and has correct hash length
 *
 * @example
 * ```ts
 * if (isContentId(str)) {
 *   // Looks like a content ID
 * }
 * ```
 */
export function isContentId(value: string): boolean {
  if (!value.startsWith(CONTENT_ID_PREFIX)) {
    return false;
  }
  const hash = value.slice(CONTENT_ID_PREFIX.length);
  return hash.length === CONTENT_HASH_HEX_LENGTH && /^[0-9a-f]+$/i.test(hash);
}

/**
 * Validate content size constraints per protocol spec
 *
 * @param title - Content title (optional)
 * @param body - Content body
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```ts
 * const result = validateContentSize('My Title', longBody);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateContentSize(
  title: string | null,
  body: string
): { valid: boolean; error?: string } {
  const encoder = new TextEncoder();

  if (title && encoder.encode(title).length > MAX_TITLE_BYTES) {
    return { valid: false, error: `Title exceeds ${MAX_TITLE_BYTES} bytes` };
  }

  if (encoder.encode(body).length > MAX_BODY_BYTES) {
    return { valid: false, error: `Body exceeds ${MAX_BODY_BYTES} bytes` };
  }

  return { valid: true };
}

/**
 * Get content type label for display
 *
 * @param type - Content type enum value
 * @returns Human-readable label
 */
export function getContentTypeLabel(type: ContentTypeProtocol): string {
  switch (type) {
    case ContentTypeProtocol.Post:
      return 'Post';
    case ContentTypeProtocol.Reply:
      return 'Reply';
    case ContentTypeProtocol.Quote:
      return 'Quote';
    default:
      return 'Unknown';
  }
}
