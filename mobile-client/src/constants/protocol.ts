/**
 * Swimchain Protocol Constants for Mobile
 * Per SPEC_03: Proof of Work parameters
 */

// Challenge timing
export const CHALLENGE_EXPIRY_SECS = 600; // 10 minutes
export const CHALLENGE_REFRESH_THRESHOLD = 0.8; // Refresh at 80% = 8 minutes
export const MAX_POW_RETRIES = 3;

// Argon2id configuration for mobile (SPEC_03)
export const ARGON2_CONFIG = {
  memoryKib: 65536, // 64 MiB
  iterations: 3,
  parallelism: 2,
  hashLength: 32,
} as const;

// Difficulty recommendations for mobile (per mobile-viability.md)
// NOTE: MASTER_FEATURES #2 specifies difficulty 16-22 for desktop/server.
// Mobile uses reduced difficulty 8-10 due to power/thermal constraints.
// This deviation is documented and accepted for mobile-tier PoW.
// TODO: Formalize cross-platform difficulty ratios in protocol spec.
export const DIFFICULTY = {
  // Action difficulties (8-10 for mobile vs 16-22 desktop)
  post: 9, // New thread ~51s expected
  reply: 8, // Reply ~26s expected
  engage: 8, // Engagement ~26s expected

  // Time estimates (ms) per difficulty
  estimates: {
    8: 26000, // ~26 seconds
    9: 51000, // ~51 seconds
    10: 102000, // ~102 seconds
  } as Record<number, number>,
} as const;

// Battery estimates per mining duration
export const BATTERY_ESTIMATES = {
  // % per 30 seconds of mining
  perThirtySeconds: 5,
} as const;

// Engagement pool settings (SPEC_09)
export const ENGAGEMENT_POOL = {
  requiredSeconds: 60, // Total seconds needed
  contributionOptions: [5, 15, 30] as const, // Available contribution amounts
} as const;

// Content limits
export const CONTENT_LIMITS = {
  titleMaxLength: 140,
  bodyMaxLength: 10000,
  spaceNameMaxLength: 32,
} as const;

// Address format
export const ADDRESS = {
  prefix: 'cs1q',
  fullLength: 42,
  truncatedLength: 14, // cs1q9x7...2k4m
  minimalLength: 7, // ...2k4m
} as const;

// Rejection reasons (SPEC_03)
export const REJECTION_REASONS = {
  INVALID_HASH: 0x01,
  EXPIRED_CHALLENGE: 0x02,
  INVALID_SIGNATURE: 0x03,
  INSUFFICIENT_DIFFICULTY: 0x04,
} as const;
