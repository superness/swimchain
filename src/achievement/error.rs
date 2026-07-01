//! Achievement system error types
//!
//! Defines error types for achievement operations per SPEC_09 Section 5.

use thiserror::Error;

use super::types::Achievement;

/// Errors that can occur in the achievement system.
#[derive(Debug, Error)]
pub enum AchievementError {
    /// Storage error from sled
    #[error("Storage error: {0}")]
    Storage(#[from] sled::Error),

    /// Serialization error from bincode
    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),

    /// Achievement not found
    #[error("Achievement not found: {0:?}")]
    NotFound(Achievement),

    /// Invalid achievement ID
    #[error("Invalid achievement ID: {0}")]
    InvalidId(u8),

    /// Level error passthrough
    #[error("Level error: {0}")]
    Level(String),
}
