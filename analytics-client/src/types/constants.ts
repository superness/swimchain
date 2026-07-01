/**
 * Analytics Client Constants
 *
 * Based on SPEC_09 health score and CLIENT_DESIGN analytics requirements.
 */

// === Health Score Weights (SPEC_09 §6) ===
export const HEALTH_SWIMMER_WEIGHT = 30;      // Max points for active swimmers
export const HEALTH_RISK_WEIGHT = 30;         // Max points for low at-risk posts
export const HEALTH_SYNC_WEIGHT = 20;         // Max points for fresh sync
export const HEALTH_HEAT_WEIGHT = 20;         // Max points for heat distribution

// === Health Score Thresholds ===
export const HEALTH_SWIMMER_TARGET = 10;      // Target swimmers for full score
export const HEALTH_RISK_THRESHOLD = 5;       // Max at-risk posts for full score
export const HEALTH_SYNC_FRESH_MINUTES = 5;   // Sync age for "fresh" status

// === Health Score Categories ===
export const HEALTH_EXCELLENT_THRESHOLD = 80;
export const HEALTH_GOOD_THRESHOLD = 60;
export const HEALTH_FAIR_THRESHOLD = 40;
export const HEALTH_POOR_THRESHOLD = 20;

// === Polling Intervals ===
export const METRICS_POLL_INTERVAL_MS = 30_000;        // 30 seconds
export const NETWORK_POLL_INTERVAL_MS = 60_000;        // 1 minute
export const SPACE_POLL_INTERVAL_MS = 120_000;         // 2 minutes
export const HISTORY_SNAPSHOT_INTERVAL_MS = 300_000;   // 5 minutes

// === Heat Distribution Buckets ===
export const HEAT_BUCKET_COUNT = 10;
export const HEAT_BUCKET_SIZE = 10;  // 0-10, 10-20, ..., 90-100

// === Data Retention ===
export const MAX_HISTORY_POINTS = 288;        // 24 hours at 5-minute intervals
export const MAX_SPACE_METRICS_CACHE = 100;   // Cache up to 100 spaces
export const MAX_RECENT_POSTS_DISPLAY = 50;   // Show last 50 posts

// === Chart Colors ===
export const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#6b7280',
  grid: '#e5e7eb',
  heatGradient: [
    '#fee2e2',  // 0-10: Very low (danger zone)
    '#fecaca',  // 10-20
    '#fca5a5',  // 20-30
    '#f87171',  // 30-40
    '#fb923c',  // 40-50
    '#fbbf24',  // 50-60
    '#a3e635',  // 60-70
    '#4ade80',  // 70-80
    '#34d399',  // 80-90
    '#22c55e',  // 90-100: Maximum heat (healthy)
  ],
} as const;

// === Storage Keys ===
export const STORAGE_KEY_CONFIG = 'analytics-config';
export const STORAGE_KEY_HISTORY = 'analytics-history';
export const STORAGE_KEY_WATCHED_SPACES = 'analytics-watched-spaces';

// === Network Status ===
export const NETWORK_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
} as const;

// === Alert Thresholds ===
export const ALERT_LOW_SWIMMERS = 3;          // Alert if swimmers below this
export const ALERT_HIGH_RISK_POSTS = 20;      // Alert if at-risk posts above this
export const ALERT_STALE_SYNC_MINUTES = 15;   // Alert if sync older than this
export const ALERT_LOW_AVG_HEAT = 20;         // Alert if average heat below this
