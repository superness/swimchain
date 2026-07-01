/**
 * Analytics Client Types
 *
 * Based on SPEC_09 and CLIENT_DESIGN analytics requirements.
 */

import { NETWORK_STATUS } from './constants';

export * from './constants';

// === Configuration ===
export interface AnalyticsConfig {
  /** Enable real-time metrics collection */
  enabled: boolean;
  /** Metrics polling interval in ms */
  pollIntervalMs: number;
  /** Spaces to watch (empty = all accessible) */
  watchedSpaces: string[];
  /** Enable browser notifications for alerts */
  enableAlerts: boolean;
  /** Show advanced metrics */
  showAdvanced: boolean;
}

// === Network Health (SPEC_09 §6) ===
export type NetworkStatusType = typeof NETWORK_STATUS[keyof typeof NETWORK_STATUS];

export interface NetworkHealth {
  /** Overall health score 0-100 */
  score: number;
  /** Categorical status */
  status: NetworkStatusType;
  /** Number of active swimmers in the network */
  activeSwimmers: number;
  /** Number of posts at risk of decay */
  postsAtRisk: number;
  /** Minutes since last successful sync */
  lastSyncAgeMinutes: number;
  /** Average heat across network (0-100) */
  avgHeat: number;
  /** Component scores breakdown */
  breakdown: HealthBreakdown;
  /** Timestamp of this measurement */
  timestamp: Date;
}

export interface HealthBreakdown {
  swimmerScore: number;
  riskScore: number;
  syncScore: number;
  heatScore: number;
}

// === Space Metrics ===
export interface SpaceMetrics {
  /** Space ID */
  spaceId: string;
  /** Space name if known */
  name?: string;
  /** Total posts in space */
  totalPosts: number;
  /** Posts with heat below decay threshold */
  postsAtRisk: number;
  /** Posts with heat > 75% */
  healthyPosts: number;
  /** Average heat of posts in space */
  avgHeat: number;
  /** Heat distribution histogram */
  heatDistribution: HeatDistribution;
  /** Active contributors count */
  activeContributors: number;
  /** Posts created in last 24h */
  postsLast24h: number;
  /** Engagements in last 24h */
  engagementsLast24h: number;
  /** Timestamp of this measurement */
  timestamp: Date;
}

// === Heat Distribution ===
export interface HeatDistribution {
  /** Bucket boundaries [0-10, 10-20, ..., 90-100] */
  buckets: HeatBucket[];
  /** Total posts counted */
  totalPosts: number;
  /** Median heat value */
  medianHeat: number;
}

export interface HeatBucket {
  /** Lower bound (inclusive) */
  min: number;
  /** Upper bound (exclusive, except 90-100) */
  max: number;
  /** Number of posts in this bucket */
  count: number;
  /** Percentage of total */
  percentage: number;
}

// === Historical Data ===
export interface HealthHistoryPoint {
  timestamp: Date;
  score: number;
  activeSwimmers: number;
  postsAtRisk: number;
  avgHeat: number;
}

export interface SpaceHistoryPoint {
  timestamp: Date;
  spaceId: string;
  totalPosts: number;
  avgHeat: number;
  postsAtRisk: number;
}

// === Recent Activity ===
export interface RecentPost {
  id: string;
  spaceId: string;
  authorId: string;
  heat: number;
  createdAt: Date;
  lastEngagement: Date;
  engagementCount: number;
  isAtRisk: boolean;
}

export interface RecentEngagement {
  id: string;
  postId: string;
  spaceId: string;
  type: 'reply' | 'pow' | 'boost';
  actorId: string;
  timestamp: Date;
  heatContribution: number;
}

// === Alerts ===
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'low_swimmers'
  | 'high_risk_posts'
  | 'stale_sync'
  | 'low_avg_heat'
  | 'space_degraded';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: string;
  spaceId?: string;
  timestamp: Date;
  acknowledged: boolean;
}

// === Analytics State ===
export interface AnalyticsState {
  config: AnalyticsConfig;
  networkHealth: NetworkHealth | null;
  healthHistory: HealthHistoryPoint[];
  spaceMetrics: Map<string, SpaceMetrics>;
  recentPosts: RecentPost[];
  recentEngagements: RecentEngagement[];
  alerts: Alert[];
  isCollecting: boolean;
  lastError: string | null;
}

// === Service Callbacks ===
export interface MetricsCallbacks {
  onNetworkHealth?: (health: NetworkHealth) => void;
  onSpaceMetrics?: (metrics: SpaceMetrics) => void;
  onAlert?: (alert: Alert) => void;
  onError?: (error: Error) => void;
}

// === API Response Types ===
export interface NetworkStatsResponse {
  activeSwimmers: number;
  totalPosts: number;
  postsAtRisk: number;
  avgHeat: number;
  lastSyncTimestamp: string;
}

export interface SpaceStatsResponse {
  spaceId: string;
  name?: string;
  postCount: number;
  memberCount: number;
  posts: Array<{
    id: string;
    heat: number;
    authorId: string;
    createdAt: string;
    lastEngagement: string;
    engagementCount: number;
  }>;
}

// === Utility Functions ===

/**
 * Calculate health score from components (SPEC_09 §6)
 */
export function calculateHealthScore(
  activeSwimmers: number,
  postsAtRisk: number,
  lastSyncAgeMinutes: number,
  avgHeat: number
): number {
  // Swimmer score: up to 30 points based on active swimmers
  const swimmerScore = Math.min(30, (activeSwimmers / 10) * 30);

  // Risk score: 30 points if < 5 at-risk, decreases as risk increases
  const riskScore = postsAtRisk < 5 ? 30 : Math.max(0, 30 - postsAtRisk);

  // Sync score: 20 points if sync < 5 minutes old, 0 otherwise
  const syncScore = lastSyncAgeMinutes < 5 ? 20 : 0;

  // Heat score: up to 20 points based on average heat
  const heatScore = (avgHeat / 100) * 20;

  return Math.min(100, swimmerScore + riskScore + syncScore + heatScore);
}

/**
 * Get health status category from score
 */
export function getHealthStatus(score: number): NetworkStatusType {
  if (score >= 80) return NETWORK_STATUS.HEALTHY;
  if (score >= 60) return NETWORK_STATUS.DEGRADED;
  if (score >= 40) return NETWORK_STATUS.DEGRADED;
  if (score > 0) return NETWORK_STATUS.UNHEALTHY;
  return NETWORK_STATUS.UNKNOWN;
}

/**
 * Create heat distribution buckets from post heat values
 */
export function createHeatDistribution(heatValues: number[]): HeatDistribution {
  const buckets: HeatBucket[] = [];
  const totalPosts = heatValues.length;

  // Create 10 buckets: 0-10, 10-20, ..., 90-100
  for (let i = 0; i < 10; i++) {
    const min = i * 10;
    const max = (i + 1) * 10;
    const count = heatValues.filter(h => {
      if (i === 9) return h >= min && h <= max; // Include 100 in last bucket
      return h >= min && h < max;
    }).length;

    buckets.push({
      min,
      max,
      count,
      percentage: totalPosts > 0 ? (count / totalPosts) * 100 : 0,
    });
  }

  // Calculate median
  const sorted = [...heatValues].sort((a, b) => a - b);
  let medianHeat = 0;
  if (sorted.length > 0) {
    if (sorted.length % 2 === 0) {
      const mid1 = sorted[sorted.length / 2 - 1] ?? 0;
      const mid2 = sorted[sorted.length / 2] ?? 0;
      medianHeat = (mid1 + mid2) / 2;
    } else {
      medianHeat = sorted[Math.floor(sorted.length / 2)] ?? 0;
    }
  }

  return {
    buckets,
    totalPosts,
    medianHeat,
  };
}

/**
 * Get default analytics configuration
 */
export function getDefaultConfig(): AnalyticsConfig {
  return {
    enabled: true,
    pollIntervalMs: 30_000,
    watchedSpaces: [],
    enableAlerts: true,
    showAdvanced: false,
  };
}
