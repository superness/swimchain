//! Poster Reputation System for Swimchain
//!
//! This module implements SPEC_12 Section 3.4 and Section 4.5: Reputation tracking
//! for content creators, including score calculation, decay on attestations, and
//! recovery over time.
//!
//! # Key Features
//!
//! - **PosterReputation**: Tracks spam flags, counters, quality attestations, and age
//! - **Score Calculation**: Comprehensive formula balancing multiple factors
//! - **Reputation Decay**: Negative impact from spam attestations
//! - **Reputation Recovery**: +1 point/day after last spam flag, capped at 90 days
//! - **Fast Recovery**: +10 immediate points for counter-attested flags
//! - **Reputation Effects**: Rate limits and decay modifiers based on score thresholds
//!
//! # Score Thresholds (SPEC_12 §6.4)
//!
//! | Score Range | Effect |
//! |-------------|--------|
//! | > 200 | Trusted: content decays 1.5x slower |
//! | 100-200 | Normal: standard treatment |
//! | 50-100 | Watched: rate limits reduced 50% |
//! | 0-50 | Restricted: rate limits reduced 80%, new space posting blocked |
//! | < 0 | Untrusted: all content starts with accelerated decay |
//!
//! See SPEC_12 for full specification.

pub mod error;
pub mod score;
pub mod storage;
pub mod types;

pub use error::ReputationError;
pub use score::{
    calculate_reputation_score, get_reputation_effect, ReputationEffect,
    REPUTATION_MIN_SCORE, REPUTATION_NORMAL_THRESHOLD, REPUTATION_RECOVERY_MAX_DAYS,
    REPUTATION_RECOVERY_PER_DAY, REPUTATION_RESTRICTED_THRESHOLD, REPUTATION_TRUSTED_THRESHOLD,
    REPUTATION_WATCHED_THRESHOLD, REPUTATION_FAST_RECOVERY_PER_COUNTER,
};
pub use storage::ReputationStore;
pub use types::{PosterReputation, ReputationSummary};
