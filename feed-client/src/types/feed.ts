/**
 * Feed-specific type definitions
 * Based on DESIGN.md specifications
 */

/**
 * Feed source representing a followed space or user
 */
export interface FeedSource {
  type: 'space' | 'user';
  id: string;           // spaceId or userPk (hex)
  displayName?: string; // Optional display name
  addedAt: number;      // UNIX timestamp when followed
  muted: boolean;       // Temporarily hide without unfollowing
  notifications: boolean; // Get notifications for new posts
}

/**
 * User's feed preferences stored locally
 */
export interface FeedPreferences {
  followedSpaces: FeedSource[];
  followedUsers: FeedSource[];
  savedPosts: string[]; // Post content IDs

  // Display preferences
  showRepliesInFeed: boolean;     // Show reply activity
  showEngagementsInFeed: boolean; // "alice liked bob's post"
  sortOrder: 'recent' | 'hot';    // Default sort
  compactMode: boolean;           // Smaller cards
}

/**
 * Stored feed preferences (versioned for migrations)
 */
export interface StoredFeedPreferences {
  version: 1;
  followedSpaces: FeedSource[];
  followedUsers: FeedSource[];
  savedPosts: string[];
  settings: {
    showRepliesInFeed: boolean;
    showEngagementsInFeed: boolean;
    sortOrder: 'recent' | 'hot';
    compactMode: boolean;
  };
  lastUpdated: number;
}

/**
 * Media reference attached to a post
 */
export interface MediaRef {
  mediaHash: string;     // sha256 hash of media content
  mediaType: string;     // MIME type (image/jpeg, image/png, etc.)
  sizeBytes: number;     // Size in bytes
}

/**
 * Individual item in the feed
 */
export interface FeedItem {
  id: string;             // Content ID
  type: 'post' | 'reply'; // Content type
  spaceId: string;        // Space this belongs to
  spaceName?: string;     // Space display name
  authorId: string;       // Author's public key (hex)
  authorName?: string;    // Author's display name
  title?: string;         // Post title (null for replies)
  body: string;           // Post/reply content
  createdAt: number;      // UNIX timestamp
  lastEngagement: number; // Last engagement timestamp

  // Engagement metrics
  engagementCount: number;
  replyCount: number;

  // Decay info
  decayState: 'protected' | 'active' | 'stale' | 'decayed';
  secondsUntilDecay: number | null;

  // Media attachments
  mediaRefs?: MediaRef[];

  // Source tracking for deduplication
  source: 'space' | 'user';
  sourceId: string; // spaceId or userId that brought this into feed

  // Reactions
  reactions?: ReactionCounts;

  // Pending state
  pending?: boolean;

  // True when this post came from a followed private space and was decrypted.
  isPrivate?: boolean;
}

/**
 * Reaction counts for content
 */
export interface ReactionCounts {
  reactions: Array<{
    emoji: string;
    reactionType: number;
    count: number;
  }>;
  total: number;
  userReactions?: number[]; // Reaction types the current user has added
}

/**
 * Feed cursor for pagination
 */
export interface FeedCursor {
  timestamp: number;
  lastId: string;
}

/**
 * Result from feed loading
 */
export interface FeedResult {
  items: FeedItem[];
  hasMore: boolean;
  cursor?: FeedCursor;
}

/**
 * Space summary for discovery
 */
export interface SpaceSummary {
  spaceId: string;
  name: string | null;
  postCount: number;
  lastActivity: number | null;
  isFollowing: boolean;
}

/**
 * User profile summary for discovery
 */
export interface UserSummary {
  userId: string;       // Public key hex
  displayName?: string;
  address: string;      // cs1... bech32m address
  postCount: number;
  isFollowing: boolean;
}

/**
 * Reaction type codes matching backend
 */
export const REACTION_CODES = {
  heart: 1,
  thumbs_up: 2,
  thumbs_down: 3,
  laugh: 4,
  thinking: 5,
  mind_blown: 6,
  fire: 7,
  swimming: 8,
} as const;

/**
 * Reaction type to emoji mapping
 */
export const REACTION_EMOJIS: Record<keyof typeof REACTION_CODES, string> = {
  heart: '❤️',
  thumbs_up: '👍',
  thumbs_down: '👎',
  laugh: '😂',
  thinking: '🤔',
  mind_blown: '🤯',
  fire: '🔥',
  swimming: '🏊',
} as const;

export type ReactionType = keyof typeof REACTION_CODES;
