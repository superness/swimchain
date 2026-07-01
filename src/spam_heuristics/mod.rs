//! Spam Detection Heuristics for Swimchain
//!
//! This module implements SPEC_12 Section 7: Automated spam detection helpers
//! that assist community moderation without replacing it.
//!
//! # Key Features
//!
//! - **Repetition Detection**: Flag duplicate or near-duplicate content within a time window
//! - **Cross-Posting Limits**: Limit the number of spaces the same content can be posted to
//! - **Rate Limits by Level**: Different posting limits for different swimmer levels
//! - **Pattern Detection**: Identify suspicious patterns (link density, mention spam)
//! - **Review Flags**: Mark content for review without auto-deleting
//!
//! # Design Philosophy
//!
//! These heuristics are advisory, not authoritative. They trigger review flags
//! rather than automatic removal. Human attestation is still required to trigger
//! accelerated decay.
//!
//! See RESEARCH_06 (Contribution-Based Access Economics) for attack economics analysis.

pub mod cross_posting;
pub mod error;
pub mod pattern_detection;
pub mod rate_limits;
pub mod repetition;
pub mod review_flag;
pub mod types;

pub use cross_posting::{CrossPostingConfig, CrossPostingTracker};
pub use error::SpamHeuristicsError;
pub use pattern_detection::{PatternDetector, PatternDetectorConfig, PatternMatch, PatternType};
pub use rate_limits::{RateLimitConfig, RateLimitTracker};
pub use repetition::{RepetitionConfig, RepetitionDetector};
pub use review_flag::{ReviewFlag, ReviewFlagReason, ReviewFlagStore, ReviewOutcome};
pub use types::{
    ContentFingerprint, HeuristicResult, HeuristicViolation, ViolationType,
    default_posts_per_day,
    // Constants
    DEFAULT_POSTS_PER_DAY,
    POSTS_PER_SPACE_PER_HOUR, MAX_CROSS_POST_SPACES, CROSS_POST_WINDOW_SECS,
    REPETITION_WINDOW_SECS, MAX_EXACT_DUPLICATES, SIMILARITY_THRESHOLD,
    MAX_LINK_DENSITY, MAX_MENTIONS_PER_POST, MIN_CONTENT_FOR_PATTERNS,
};
