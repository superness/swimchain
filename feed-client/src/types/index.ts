/**
 * Core type definitions for the Swimchain Feed Client
 */

// Re-export feed types
export * from './feed';

/**
 * Stored identity data (persisted in localStorage)
 * Matches forum-client for cross-compatibility
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
 * Decay information from the daemon (source of truth)
 */
export interface DecayInfo {
  state: 'protected' | 'active' | 'stale' | 'decayed';
  survivalProbability: number;
  isProtected: boolean;
  secondsUntilDecayStarts: number | null;
  secondsUntilPruned: number | null;
  timeSinceEngagement: number;
}

/**
 * Space for navigation
 */
export interface Space {
  id: string;
  name: string;
  description: string;
  creator: string;
  postCount: number;
  activePostCount: number;
  createdAt: number;
  parentId?: string;
}

/**
 * Thread (post) data
 */
export interface Thread {
  id: string;
  spaceId: string;
  author: string;
  displayName?: string;
  title: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  heat: number;
  pool: PoolState;
  decay: DecayInfo;
  reactions?: import('./feed').ReactionCounts;
  mediaRefs?: import('./feed').MediaRef[];
  pending?: boolean;
}

/**
 * Reply data
 */
export interface Reply {
  id: string;
  threadId: string;
  parentId: string | null;
  author: string;
  displayName?: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  heat: number;
  depth: number;
  childCount?: number;
  children: Reply[];
  decay?: DecayInfo;
  reactions?: import('./feed').ReactionCounts;
  bodyLoading?: boolean;
}

/**
 * Engagement pool state
 */
export interface PoolState {
  contributedSeconds: number;
  requiredSeconds: number;
  contributorCount: number;
  status: 'empty' | 'partial' | 'complete' | 'locked';
}
