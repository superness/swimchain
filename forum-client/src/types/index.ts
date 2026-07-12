/**
 * Core type definitions for the Swimchain Forum Client
 */

/**
 * Space represents a discussion category/forum
 * Format: sp1... (bech32m)
 */
export interface Space {
  id: string;            // sp1... bech32m format
  name: string;          // Display name (e.g., "rust-lang", "boston")
  description: string;   // Brief description
  creator: string;       // cs1... identity address
  postCount: number;     // Total threads ever created
  activePostCount: number; // Threads not yet decayed
  createdAt: number;     // UNIX timestamp seconds
  parentId?: string;     // Parent space ID for hierarchical organization

  // === Behavioral-branching lineage (SPEC_13, Phase 2) ===
  // All optional and additive — present only when the node exposes lineage.
  childIds?: string[];          // Child spaces that grew out of this one
  formedAt?: number;            // UNIX seconds when this space formed from its parent
  foundingMemberCount?: number; // Members present at formation
  formationHeight?: number;     // Block height formation was detected at
}

/**
 * Thread represents a discussion topic within a space
 */
export interface MediaRef {
  mediaHash: string;     // sha256 hash of media content
  mediaType: string;     // MIME type (image/jpeg, image/png, etc.)
  sizeBytes: number;     // Size in bytes
}

export interface Thread {
  id: string;            // sha256:... content ID
  spaceId: string;       // Parent space ID
  author: string;        // cs1... address
  displayName?: string;  // Author's display name (if set)
  title: string;         // Thread title
  content: string;       // Thread content/body
  createdAt: number;     // UNIX timestamp seconds
  lastEngagement: number; // UNIX timestamp of last engagement
  replyCount: number;    // Number of replies
  heat: number;          // Computed heat 0.0 to 1.0 (DEPRECATED - use decay)
  pool: PoolState;       // Engagement pool state
  decay: DecayInfo;      // Decay info from daemon (source of truth)
  reactions?: ReactionCounts; // Discord-style emoji reactions
  mediaRefs?: MediaRef[]; // Attached images
  pending?: boolean;     // True if in mempool, not yet on chain
}

/**
 * Decay information from the daemon (source of truth)
 * This replaces client-side decay calculations
 */
export interface DecayInfo {
  state: 'protected' | 'active' | 'stale' | 'decayed'; // Current decay state
  survivalProbability: number;     // 0.0-1.0 (1.0 = fully preserved)
  isProtected: boolean;            // In 48-hour floor protection
  secondsUntilDecayStarts: number | null; // Seconds until floor ends (if protected)
  secondsUntilPruned: number | null;      // Seconds until content would be deleted
  timeSinceEngagement: number;     // Seconds since last engagement
}

/**
 * Reply represents a response within a thread
 */
export interface Reply {
  id: string;            // Unique reply ID
  threadId: string;      // Parent thread ID
  parentId: string | null; // Parent reply ID, null = direct reply to thread
  author: string;        // cs1... address
  displayName?: string;  // Author's display name (if set)
  content: string;       // Reply content
  createdAt: number;     // UNIX timestamp seconds
  lastEngagement: number; // UNIX timestamp of last engagement
  heat: number;          // Computed heat 0.0 to 1.0 (DEPRECATED - use decay)
  depth: number;         // Nesting depth: 0 = direct reply, 1+ = nested
  childCount?: number;   // Total child reply count (from RPC, even if not fetched)
  children: Reply[];     // Nested replies (tree structure, limited by depth_limit)
  decay?: DecayInfo;     // Decay info from daemon (optional for backward compat)
  reactions?: ReactionCounts; // Discord-style emoji reactions
  bodyLoading?: boolean; // True if body content is being fetched from network
}

/**
 * Engagement pool state for content persistence
 * Content requires 60 seconds total to persist
 */
export interface PoolState {
  contributedSeconds: number;  // 0-60 accumulated seconds
  requiredSeconds: number;     // Always 60
  contributorCount: number;    // Number of unique contributors
  status: 'empty' | 'partial' | 'complete' | 'locked';
}

/**
 * Network synchronization status
 */
export interface SyncStatus {
  chainPercent: number;     // 0-100 chain sync progress
  peerCount: number;        // Connected peers
  peersReceiving: number;   // Peers we're receiving from
  peersSending: number;     // Peers we're sending to
  storageMB: number;        // Current storage used
  storageTargetMB: number;  // Storage target/limit
  lastBlockTime: number;    // UNIX timestamp of last block
  state: 'synced' | 'syncing' | 'behind' | 'offline';
}

/**
 * User preferences stored in localStorage
 */
export interface Preferences {
  threadOrdering: 'newest' | 'oldest' | 'replies' | 'active';
  threadsPerPage: number;
  storageTargetMB: number;
}

/**
 * Stored identity data (persisted in localStorage)
 */
export interface StoredIdentity {
  address: string;         // cs1... bech32m address
  publicKey: string;       // Hex-encoded public key (64 hex chars = 32 bytes)
  seed: string;            // Hex-encoded seed/private key (64 hex chars = 32 bytes)
  createdAt: number;       // UNIX timestamp of creation
  powSolution?: {          // Optional stored PoW solution
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

/**
 * Thread sort options
 */
export type ThreadSortOption = 'newest' | 'oldest' | 'replies' | 'active';

/**
 * Reaction types matching backend ReactionType enum
 */
export type ReactionType = 'heart' | 'thumbs_up' | 'thumbs_down' | 'laugh' | 'thinking' | 'mind_blown' | 'fire' | 'swimming';

/**
 * Reaction type to numeric code mapping (matches Rust backend)
 */
export const REACTION_CODES: Record<ReactionType, number> = {
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
export const REACTION_EMOJIS: Record<ReactionType, string> = {
  heart: '❤️',
  thumbs_up: '👍',
  thumbs_down: '👎',
  laugh: '😂',
  thinking: '🤔',
  mind_blown: '🤯',
  fire: '🔥',
  swimming: '🏊',
} as const;

/**
 * Single emoji reaction count
 */
export interface EmojiCount {
  emoji: string;
  reactionType: number;
  count: number;
}

/**
 * Aggregated reaction counts for content
 */
export interface ReactionCounts {
  reactions: EmojiCount[];
  total: number;
  userReactions?: number[]; // Reaction types the current user has added
}

/**
 * Navigation item for sidebar
 */
export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  children?: NavItem[];
}
