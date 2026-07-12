/**
 * Gateway configuration types
 */
export interface GatewayConfig {
  /** WebSocket URL to connect to Swimchain node */
  nodeWebsocketUrl: string;
  /** Public URL where this gateway is accessible */
  publicUrl: string;
  /** Rate limit for general requests per minute */
  rateLimitPerMinute: number;
  /** Rate limit for search requests per minute */
  searchRateLimitPerMinute: number;
  /** Maximum cache age in seconds */
  cacheMaxAge: number;
  /** How far back to sync content in hours */
  syncWindowHours: number;
}

/**
 * Node connection events from api-reference.md
 */
export type ContentEventKind =
  | 'NewPost'
  | 'NewReply'
  | 'ContentDecaying'
  | 'ContentDecayed';

export interface ContentEvent {
  kind: ContentEventKind;
  content_id: string;
  space_id?: string;
  author_id?: string;
  hours_remaining?: number;
}

/**
 * Content types from SPEC_02
 */
export type ContentType = 'POST' | 'REPLY' | 'QUOTE';

/**
 * Pool summary for engagement tracking
 */
export interface PoolSummary {
  poolId: string;
  contributedSeconds: number;  // 0-60
  requiredSeconds: 60;         // Always 60
  contributorCount: number;
  timeRemainingMs: number | null;
  progressPercentage: number;  // 0-100
}

/**
 * ContentItem from node - matches SPEC_02 ContentItem structure
 */
export interface ContentItem {
  content_id: string;
  author_id: string;
  signature: string;
  created_at: number;         // Unix timestamp ms
  last_engagement: number;    // Unix timestamp ms
  content_type: ContentType;
  parent_id: string | null;
  space_id: string;
  body_inline: string | null;     // For content <= 1KB
  content_hash: string | null;    // For content > 1KB
  content_size: number | null;
  /** Attached media (content-addressed), rendered via the media proxy. */
  media?: { hash: string; type: string }[];
  pow_nonce: number;
  pow_difficulty: number;
  engagement_count: number;
}

/**
 * ContentResponse with decay information - what the node API returns
 */
export interface ContentResponse {
  item: ContentItem;
  survival_probability: number;  // 0.0-1.0
  is_decayed: boolean;
  is_protected: boolean;
  hours_until_decay: number | null;
  pool: PoolSummary | null;
  children?: ContentResponse[];
}

/**
 * SpaceActivitySummary from SPEC_04
 */
export interface SpaceActivitySummary {
  space_id: string;             // 16-byte SpaceID, hex-encoded
  space_name: string;           // Human readable name
  description?: string;
  post_count: number;           // Total posts ever (u64)
  active_posts: number;         // Posts not yet decayed (u64)
  unique_participants: number;  // Distinct identities who posted (u64)
  last_activity: number;        // Timestamp of most recent post (u64)
  decay_health: number;         // 0-100, rough decay pressure measure (u8)
  created_at: number;           // Unix timestamp
}

/**
 * ReputationSummary from SPEC_01
 */
export interface ReputationSummary {
  identity: string;              // The identity address
  first_block: number;           // Block height of first activity
  post_count: number;            // Total posts created
  reply_count: number;           // Total replies created
  received_replies: number;      // Replies to user's content
  age_seconds: number;           // Approximate age in seconds
}

/**
 * Health check response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  nodeConnected: boolean;
  nodeLatencyMs: number;
  indexedPosts: number;
  lastSyncTime: string;          // ISO 8601 timestamp
}
