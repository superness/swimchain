/**
 * SwimChain Client Types
 *
 * Core type definitions for the SwimChain protocol
 */

// =============================================================================
// Identity Types
// =============================================================================

/**
 * Stored identity data - all fields are hex strings
 */
export interface StoredIdentity {
  address: string;         // cs1... bech32m address
  publicKey: string;       // Hex-encoded public key (64 hex chars = 32 bytes)
  seed: string;            // Hex-encoded seed/private key (64 hex chars = 32 bytes)
  createdAt: number;       // UNIX timestamp of creation
}

/**
 * Identity level info from the network
 */
export interface IdentityLevel {
  identityId: string;
  level: number;
  levelName: string;
  isGenesis: boolean;
  streakDays: number;
  bandwidthServed: number;
  contributionScore: number;
}

// =============================================================================
// Space Types
// =============================================================================

/**
 * Space represents a discussion category/forum
 */
export interface Space {
  id: string;            // sp1... bech32m format
  name: string;          // Display name
  description?: string;  // Brief description
  creator?: string;      // cs1... identity address
  postCount: number;     // Total threads ever created
  activePostCount?: number; // Threads not yet decayed
  lastActivity?: number; // UNIX timestamp of last activity
  createdAt?: number;    // UNIX timestamp of creation
}

// =============================================================================
// Content Types
// =============================================================================

/**
 * Content type enum matching backend
 */
export enum ContentType {
  Post = 'Post',
  Reply = 'Reply',
  Quote = 'Quote',
}

/**
 * Decay state for content
 */
export type DecayState = 'protected' | 'active' | 'stale' | 'decayed';

/**
 * Decay information
 */
export interface DecayInfo {
  state: DecayState;
  survivalProbability: number;     // 0.0-1.0
  isProtected: boolean;            // In 48-hour floor protection
  secondsUntilDecayStarts: number | null;
  secondsUntilPruned: number | null;
  timeSinceEngagement: number;     // Seconds since last engagement
}

/**
 * Content item from RPC
 */
export interface ContentItem {
  contentId: string;
  contentType: ContentType;
  authorId: string;
  spaceId: string;
  parentId: string | null;
  createdAt: number;       // UNIX seconds
  lastEngagement: number;  // UNIX seconds
  title: string | null;    // Only for posts
  body: string | null;     // May be null if not fetched
  engagementCount: number;
  decayState: DecayState;
  secondsUntilDecay: number | null;
  decay?: DecayInfo;
}

/**
 * Thread (post with replies)
 */
export interface Thread extends ContentItem {
  replyCount: number;
  reactions?: ReactionCounts;
  pool?: PoolState;
}

/**
 * Reply to a thread or another reply
 */
export interface Reply {
  id: string;
  threadId: string;
  parentId: string | null;
  author: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  depth: number;
  childCount?: number;
  children: Reply[];
  decay?: DecayInfo;
  reactions?: ReactionCounts;
  bodyLoading?: boolean;
}

// =============================================================================
// Reaction Types
// =============================================================================

/**
 * Reaction types matching backend enum
 */
export type ReactionType =
  | 'heart'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'laugh'
  | 'thinking'
  | 'mind_blown'
  | 'fire'
  | 'swimming';

/**
 * Reaction type to numeric code mapping
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
};

/**
 * Reaction type to emoji mapping
 */
export const REACTION_EMOJIS: Record<ReactionType, string> = {
  heart: '\u2764\ufe0f',
  thumbs_up: '\ud83d\udc4d',
  thumbs_down: '\ud83d\udc4e',
  laugh: '\ud83d\ude02',
  thinking: '\ud83e\udd14',
  mind_blown: '\ud83e\udd2f',
  fire: '\ud83d\udd25',
  swimming: '\ud83c\udfca',
};

/**
 * Single emoji reaction count
 */
export interface EmojiCount {
  emoji: string;
  reactionType: number;
  count: number;
}

/**
 * Aggregated reaction counts
 */
export interface ReactionCounts {
  reactions: EmojiCount[];
  total: number;
  userReactions?: number[];
}

// =============================================================================
// Pool Types
// =============================================================================

/**
 * Engagement pool state
 */
export interface PoolState {
  contributedSeconds: number;  // 0-60 accumulated
  requiredSeconds: number;     // Always 60
  contributorCount: number;
  status: 'empty' | 'partial' | 'complete' | 'locked';
}

/**
 * Pool info from RPC
 */
export interface PoolInfo {
  poolId: string;
  contentId: string;
  totalPow: number;
  requiredPow: number;
  status: string;
  contributorCount: number;
  expiresAt: number;
}

// =============================================================================
// Network Types
// =============================================================================

/**
 * Node info from RPC
 */
export interface NodeInfo {
  version: string;
  network: string;
  uptimeSeconds: number;
  peerCount: number;
  blockHeight: number;
  nodeId: string;
  rpcPort: number;
  p2pPort: number;
}

/**
 * Peer info
 */
export interface PeerInfo {
  peerId: string;
  address: string;
  direction: 'inbound' | 'outbound';
}

/**
 * Sync status from RPC
 */
export interface SyncStatus {
  state: 'synced' | 'syncing' | 'behind' | 'offline';
  chainPercent: number;
  peerCount: number;
  peersReceiving?: number;
  peersSending?: number;
  storageMB: number;
  storageTargetMB: number;
  lastBlockTime: number | null;
}

// =============================================================================
// RPC Types
// =============================================================================

/**
 * RPC request format
 */
export interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number | string;
}

/**
 * RPC response format
 */
export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: RpcError;
  id: number | string;
}

/**
 * RPC error
 */
export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * RPC client configuration
 */
export interface RpcConfig {
  endpoint: string;
  auth?: {
    username: string;
    password: string;
  };
  /** Signature auth: hex-encoded 32-byte seed */
  seed?: string;
  /** Signature auth: hex-encoded 32-byte public key */
  publicKey?: string;
  timeout?: number;
}

// =============================================================================
// PoW Types
// =============================================================================

/**
 * Action types for PoW
 */
export enum ActionType {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
}

/**
 * PoW configuration
 */
export interface PoWConfig {
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/**
 * PoW challenge
 */
export interface PoWChallenge {
  actionType: ActionType;
  contentHash: Uint8Array;
  authorId: Uint8Array;
  timestamp: number;
  difficulty: number;
  nonceSpace: Uint8Array;
}

/**
 * PoW solution
 */
export interface PoWSolution {
  challenge: PoWChallenge;
  nonce: bigint;
  hash: Uint8Array;
}

/**
 * Progress callback for mining
 */
export type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;

/**
 * Cancellation check for mining
 */
export type CancellationCheck = () => boolean;
