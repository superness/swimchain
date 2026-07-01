/**
 * Core type definitions for the Swimchain Chat Client
 * Discord-like real-time messaging experience
 */

// ============================================
// Constants
// ============================================

/** Pool target seconds for content persistence */
export const POOL_TARGET_SECONDS = 60;

/** Quick engagement contribution in seconds */
export const ENGAGE_QUICK_SECONDS = 5;

/** Standard engagement contribution in seconds */
export const ENGAGE_STANDARD_SECONDS = 15;

/** Typing indicator disappears after this many ms */
export const TYPING_TIMEOUT_MS = 5000;

/** Re-broadcast typing every N ms while typing */
export const TYPING_BROADCAST_INTERVAL_MS = 3000;

/** Presence heartbeat interval in ms */
export const PRESENCE_HEARTBEAT_MS = 30000;

/** Transition to 'away' after this many ms of no activity */
export const PRESENCE_AWAY_THRESHOLD_MS = 120000;

/** Poll for new messages every N ms (MVP, future: WebSocket) */
export const POLL_INTERVAL_MS = 5000;

/** Update heat values every N ms */
export const HEAT_UPDATE_INTERVAL_MS = 60000;

/** PoW difficulty for reactions (~1s on mobile, <1s on desktop) */
export const REACTION_DIFFICULTY = 8;

/** PoW difficulty for messages (~15s on desktop) */
export const MESSAGE_DIFFICULTY = 10;

// ============================================
// Space (Channel) Types
// ============================================

/**
 * Space represents a channel in the chat context
 * Format: sp1... (bech32m)
 */
export interface Space {
  /** Unique space ID in sp1... format */
  id: string;
  /** Display name (e.g., "rust-lang") */
  name: string;
  /** Emoji or URL for the space icon */
  icon: string;
  /** Total number of members */
  memberCount: number;
  /** Currently online members */
  onlineCount: number;
  /** Unread message count */
  unreadCount: number;
  /** Category for grouping (e.g., "Tech", "Local") */
  category: string;
}

/**
 * Category for organizing spaces in the sidebar
 */
export interface SpaceCategory {
  name: string;
  spaces: Space[];
  isCollapsed: boolean;
}

// ============================================
// Message Types
// ============================================

/**
 * Message represents a chat message
 */
export interface Message {
  /** Unique message ID (content hash sha256:<hex>) */
  id: string;
  /** Author's cs1... address */
  authorAddress: string;
  /** Message text content */
  content: string;
  /** Unix timestamp (seconds) when created */
  createdAt: number;
  /** Unix timestamp of last engagement */
  lastEngagement: number;
  /** Heat percentage 0-100 */
  heatPercent: number;
  /** Seconds contributed to pool */
  poolCurrent: number;
  /** Pool target (always 60) */
  poolTarget: number;
  /** Number of thread replies */
  replyCount: number;
  /** Parent message ID (null for top-level messages) */
  parentId: string | null;
  /** Space ID this message belongs to */
  spaceId: string;
  /** Reactions on this message */
  reactions: MessageReactions;
}

/**
 * Reaction counts on a message
 */
export interface MessageReactions {
  /** Count of +5s quick reactions */
  quickCount: number;
  /** Count of +15s standard reactions */
  standardCount: number;
}

/**
 * Thread containing a parent message and its replies (chat-style)
 */
export interface Thread {
  /** The parent message */
  parentMessage: Message;
  /** Replies in chronological order */
  replies: Message[];
}

/**
 * Reply type used by RPC hooks (forum-style)
 */
export interface Reply {
  id: string;
  threadId: string;
  parentId: string | null;
  author: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  heat: number;
  depth: number;
  children: Reply[];
  decay?: DecayInfo;
}

// ============================================
// Presence Types
// ============================================

/** User presence status */
export type PresenceStatus = 'online' | 'away' | 'offline';

/**
 * Presence state for a user
 */
export interface PresenceState {
  /** User's cs1... address */
  userId: string;
  /** Current presence status */
  status: PresenceStatus;
  /** Unix timestamp of last activity */
  lastSeen: number;
}

// ============================================
// Typing Indicator Types
// ============================================

/**
 * Typing indicator (ephemeral, never persisted)
 */
export interface TypingIndicator {
  /** User's cs1... address */
  userId: string;
  /** Space ID where typing */
  spaceId: string;
  /** Timestamp when typing started */
  timestamp: number;
}

// ============================================
// Message Input Types
// ============================================

/**
 * Message input states per CLIENT_DESIGN.md §5.3
 */
export type MessageInputState = 'ready' | 'typing' | 'mining' | 'sent';

/**
 * Mining progress information
 */
export interface MiningProgress {
  /** Number of PoW attempts */
  attempts: number;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Estimated remaining time in ms */
  estimatedRemainingMs: number;
}

// ============================================
// Pool State Types
// ============================================

/**
 * Engagement pool state for content persistence
 */
export interface PoolState {
  /** Accumulated seconds (0-60) */
  contributedSeconds: number;
  /** Required seconds (always 60) */
  requiredSeconds: number;
  /** Number of unique contributors */
  contributorCount: number;
  /** Pool status */
  status: 'empty' | 'partial' | 'complete' | 'locked';
}

// ============================================
// Heat State Types
// ============================================

/** Heat visual state thresholds */
export type HeatState = 'full' | 'warm' | 'cooling' | 'fading' | 'decayed';

/**
 * Get heat visual state from heat percentage
 */
export function getHeatState(heatPercent: number): HeatState {
  if (heatPercent >= 80) return 'full';     // 80-100%
  if (heatPercent >= 60) return 'warm';     // 60-79%
  if (heatPercent >= 20) return 'cooling';  // 20-59%
  if (heatPercent >= 5) return 'fading';    // 5-19%
  return 'decayed';                          // <5%
}

/**
 * Get CSS class for heat-based opacity
 */
export function getHeatClass(heatPercent: number): string {
  if (heatPercent >= 80) return 'heat-100';
  if (heatPercent >= 60) return 'heat-80';
  if (heatPercent >= 40) return 'heat-60';
  if (heatPercent >= 20) return 'heat-40';
  if (heatPercent >= 5) return 'heat-20';
  return 'heat-5';
}

// ============================================
// Network/Sync Types
// ============================================

/**
 * Network synchronization status
 */
export interface SyncStatus {
  /** Chain sync progress 0-100 */
  chainPercent: number;
  /** Connected peers count */
  peerCount: number;
  /** Peers we're receiving from */
  peersReceiving: number;
  /** Peers we're sending to */
  peersSending: number;
  /** Current storage used in MB */
  storageMB: number;
  /** Storage target/limit in MB */
  storageTargetMB: number;
  /** Unix timestamp of last block */
  lastBlockTime: number;
  /** Sync state */
  state: 'synced' | 'syncing' | 'behind' | 'offline';
}

// ============================================
// User Preferences Types
// ============================================

/**
 * Chat-specific user preferences stored in localStorage
 */
export interface ChatPreferences {
  /** Show typing indicators from other users */
  showTypingIndicators: boolean;
  /** Show presence indicators */
  showPresence: boolean;
  /** Enable notification sounds */
  notificationSounds: boolean;
  /** Preferred message PoW difficulty */
  powDifficulty: number;
}

/**
 * Default chat preferences
 */
export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  showTypingIndicators: true,
  showPresence: true,
  notificationSounds: true,
  powDifficulty: MESSAGE_DIFFICULTY,
};

// ============================================
// Stored Identity Types
// ============================================

/**
 * Stored identity data (persisted in localStorage)
 */
export interface StoredIdentity {
  /** cs1... bech32m address */
  address: string;
  /** Hex-encoded public key */
  publicKey: string;
  /** Hex-encoded seed (for signing RPC requests) */
  seed: string;
  /** Unix timestamp of creation */
  createdAt: number;
  /** Optional stored PoW solution */
  powSolution?: {
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

/**
 * Decay information for content
 */
export interface DecayInfo {
  state: 'protected' | 'active' | 'stale' | 'decayed';
  survivalProbability: number;
  isProtected: boolean;
  secondsUntilDecayStarts: number | null;
  secondsUntilPruned: number | null;
  timeSinceEngagement: number;
}

// ============================================
// Navigation Types
// ============================================

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
