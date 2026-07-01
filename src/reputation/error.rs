//! Reputation error types

use std::fmt;

/// Error types for reputation operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReputationError {
    /// Identity not found in reputation store
    IdentityNotFound {
        /// The identity that was not found
        identity: [u8; 32],
    },

    /// Storage operation failed
    StorageError(String),

    /// Invalid reputation score value
    InvalidScore {
        /// The invalid score value
        score: i32,
        /// Reason why it's invalid
        reason: String,
    },

    /// Rate limit exceeded for this reputation level
    RateLimitExceeded {
        /// Current rate limit for this level
        limit: u32,
        /// Current count
        current: u32,
    },

    /// Operation not allowed at this reputation level
    ReputationTooLow {
        /// Required minimum score
        required: i32,
        /// Actual score
        actual: i32,
    },

    /// Cannot modify reputation (e.g., already at minimum)
    ReputationLocked {
        /// Reason for lock
        reason: String,
    },
}

impl fmt::Display for ReputationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IdentityNotFound { identity } => {
                write!(f, "Identity not found: {}", hex::encode(&identity[..8]))
            }
            Self::StorageError(msg) => write!(f, "Storage error: {}", msg),
            Self::InvalidScore { score, reason } => {
                write!(f, "Invalid reputation score {}: {}", score, reason)
            }
            Self::RateLimitExceeded { limit, current } => {
                write!(f, "Rate limit exceeded: {}/{}", current, limit)
            }
            Self::ReputationTooLow { required, actual } => {
                write!(f, "Reputation too low: {} required, {} actual", required, actual)
            }
            Self::ReputationLocked { reason } => {
                write!(f, "Reputation locked: {}", reason)
            }
        }
    }
}

impl std::error::Error for ReputationError {}

impl From<sled::Error> for ReputationError {
    fn from(e: sled::Error) -> Self {
        Self::StorageError(e.to_string())
    }
}
