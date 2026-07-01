/**
 * Constants for the Archiver Client
 * Values sourced from SPEC_02 and SPEC_03
 */

// Heat thresholds (from CLIENT_DESIGN §10.1)
export const MIN_HEAT_ARCHIVE_THRESHOLD = 0.05; // 5% - archive content below this
export const AUTO_ENGAGE_THRESHOLD = 0.10; // 10% - auto-engage content below this
export const DECAY_THRESHOLD = 0.0625; // 6.25% per SPEC_02 - content below this is decayed

// Decay timing (from SPEC_02)
export const HALF_LIFE_SECONDS = 604_800; // 7 days default half-life
export const DECAY_FLOOR_SECONDS = 172_800; // 48 hours minimum before decay starts

// Pool requirements (from SPEC_03)
export const POOL_REQUIRED_POW_SECS = 60; // 60 seconds total PoW required
export const MIN_CONTRIBUTION_SECS = 1; // Minimum PoW contribution

// Storage defaults
export const DEFAULT_STORAGE_BUDGET_GB = 50; // Default storage limit in GB
export const MIN_STORAGE_BUDGET_GB = 1;
export const MAX_STORAGE_BUDGET_GB = 1000;

// Scanning intervals
export const SCAN_INTERVAL_MS = 60_000; // 1 minute between scans

// Daily budget
export const DAILY_POW_BUDGET_SECS = 3600; // 1 hour of PoW mining per day

// Urgency colors for UI
export const URGENCY_COLORS = {
  critical: '#dc2626', // red-600
  warning: '#eab308',  // yellow-500
  normal: 'var(--text-secondary)',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  CONFIG: 'archiver_config',
  BUDGET: 'archiver_budget',
  POLICIES: 'archiver_policies',
} as const;

// IndexedDB configuration
export const DB_NAME = 'archiver-db';
export const DB_VERSION = 1;
export const DB_STORES = {
  ARCHIVES: 'archives',
  METADATA: 'metadata',
} as const;
