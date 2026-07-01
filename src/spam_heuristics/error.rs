//! Error types for spam heuristics

use std::fmt;

/// Errors that can occur during spam heuristic evaluation.
#[derive(Debug, Clone, PartialEq)]
pub enum SpamHeuristicsError {
    /// Content is a duplicate within the repetition window
    DuplicateContent {
        /// Number of times this content was posted
        occurrence_count: u32,
        /// Time window in seconds
        window_secs: u64,
    },

    /// Content was cross-posted to too many spaces
    ExcessiveCrossPosting {
        /// Number of spaces this content appears in
        space_count: u32,
        /// Maximum allowed spaces
        max_spaces: u32,
    },

    /// Rate limit exceeded for this swimmer level
    RateLimitExceeded {
        /// Current post count in the period
        current_count: u32,
        /// Maximum allowed for this level
        max_allowed: u32,
        /// Time until reset (seconds)
        reset_in_secs: u64,
    },

    /// Suspicious pattern detected
    SuspiciousPattern {
        /// Type of pattern detected
        pattern_type: String,
        /// Confidence score (0.0 - 1.0)
        confidence: f32,
    },

    /// Storage error
    StorageError(String),
}

impl fmt::Display for SpamHeuristicsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateContent {
                occurrence_count,
                window_secs,
            } => {
                write!(
                    f,
                    "Content posted {} times within {} seconds",
                    occurrence_count, window_secs
                )
            }
            Self::ExcessiveCrossPosting {
                space_count,
                max_spaces,
            } => {
                write!(
                    f,
                    "Content posted to {} spaces (max: {})",
                    space_count, max_spaces
                )
            }
            Self::RateLimitExceeded {
                current_count,
                max_allowed,
                reset_in_secs,
            } => {
                write!(
                    f,
                    "Rate limit exceeded: {} posts (max: {}), resets in {} seconds",
                    current_count, max_allowed, reset_in_secs
                )
            }
            Self::SuspiciousPattern {
                pattern_type,
                confidence,
            } => {
                write!(
                    f,
                    "Suspicious pattern detected: {} (confidence: {:.2})",
                    pattern_type, confidence
                )
            }
            Self::StorageError(msg) => write!(f, "Storage error: {}", msg),
        }
    }
}

impl std::error::Error for SpamHeuristicsError {}
