/**
 * Core type definitions for the Swimchain Archiver Client
 */

/**
 * Space ID type (bech32m format: sp1...)
 */
export type SpaceId = string;

/**
 * Content hash type (sha256:...)
 */
export type ContentHash = string;

/**
 * Identity address type (bech32m format: cs1...)
 */
export type IdentityAddress = string;

/**
 * Urgency level for at-risk content
 */
export type UrgencyLevel = 'critical' | 'warning' | 'normal';

/**
 * Configuration for the archiver
 */
export interface ArchiverConfig {
  /** Spaces to monitor for decaying content */
  targetSpaces: SpaceId[];
  /** Minimum heat before archiving (default: 0.05) */
  minHeatBeforeArchiving: number;
  /** Heat threshold for auto-engagement (default: 0.10) */
  autoEngageThreshold: number;
  /** Maximum storage to use in GB (default: 50) */
  storageBudgetGB: number;
  /** Maximum PoW seconds to spend per day (default: 3600) */
  dailyPowBudgetSeconds: number;
  /** Whether to automatically engage with low-heat content */
  enableAutoEngage: boolean;
}

/**
 * Current status of the archiver
 */
export interface ArchiverStatus {
  /** Number of spaces being monitored */
  spacesMonitored: number;
  /** Total number of archived posts */
  archivedCount: number;
  /** Total bytes of archived content */
  archivedSizeBytes: number;
  /** Seconds of PoW contributed today */
  autoEngagedToday: number;
  /** Number of posts rescued from decay today */
  rescuedFromDecay: number;
  /** Timestamp of last scan */
  lastScanTime: Date;
}

/**
 * Pool status for engagement tracking
 */
export interface PoolStatus {
  /** Current accumulated PoW seconds */
  currentSeconds: number;
  /** Required PoW seconds (always 60) */
  requiredSeconds: number;
  /** Number of unique contributors */
  contributorCount: number;
}

/**
 * Content at risk of decaying
 */
export interface AtRiskContent {
  /** Hash of the post */
  postHash: ContentHash;
  /** Space the post belongs to */
  spaceId: SpaceId;
  /** Title of the post */
  title: string;
  /** Author's identity address */
  author: IdentityAddress;
  /** Current heat value (0-1) */
  heat: number;
  /** Estimated time when content will decay */
  estimatedDecayTime: Date;
  /** Number of replies */
  replyCount: number;
  /** Current pool state */
  poolStatus: PoolStatus;
  /** Urgency classification */
  urgency: UrgencyLevel;
}

/**
 * Archived content entry stored in IndexedDB
 */
export interface ArchiveEntry {
  /** Hash of the post (primary key) */
  postHash: ContentHash;
  /** Space the post belongs to */
  spaceId: SpaceId;
  /** Title of the post */
  title: string;
  /** Full body content */
  body: string;
  /** Author's identity address */
  author: IdentityAddress;
  /** Original creation timestamp */
  timestamp: Date;
  /** When this was archived */
  archivedAt: Date;
  /** Heat at time of archiving */
  originalHeat: number;
  /** Archived replies (optional) */
  replies?: ArchiveEntry[];
}

/**
 * Policy for a specific space
 */
export interface ArchiverPolicy {
  /** Space this policy applies to */
  spaceId: SpaceId;
  /** Whether to auto-engage in this space */
  autoEngage: boolean;
  /** Whether to archive content from this space */
  archive: boolean;
  /** Minimum PoW contribution per engagement (5, 15, or 30) */
  minEngagementSeconds: 5 | 15 | 30;
}

/**
 * Budget state for tracking daily PoW usage
 */
export interface BudgetState {
  /** Seconds of PoW used today */
  used: number;
  /** Date string in YYYY-MM-DD format (UTC) */
  date: string;
  /** Daily limit in seconds */
  limit: number;
}

/**
 * Result of a content engagement
 */
export interface EngagementResult {
  /** Whether the engagement succeeded */
  success: boolean;
  /** Seconds of PoW contributed */
  secondsContributed: number;
  /** New pool status after engagement */
  newPoolStatus: PoolStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Get default archiver configuration
 */
export function getDefaultConfig(): ArchiverConfig {
  return {
    targetSpaces: [],
    minHeatBeforeArchiving: 0.05,
    autoEngageThreshold: 0.10,
    storageBudgetGB: 50,
    dailyPowBudgetSeconds: 3600,
    enableAutoEngage: true,
  };
}

/**
 * Get default archiver status
 */
export function getDefaultStatus(): ArchiverStatus {
  return {
    spacesMonitored: 0,
    archivedCount: 0,
    archivedSizeBytes: 0,
    autoEngagedToday: 0,
    rescuedFromDecay: 0,
    lastScanTime: new Date(),
  };
}
