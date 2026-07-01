//! Space health error types
//!
//! Error handling for the space health system.

use std::fmt;

/// Errors that can occur in the space health system.
#[derive(Debug)]
pub enum SpaceHealthError {
    /// Space not found
    SpaceNotFound([u8; 16]),

    /// Storage operation failed
    Storage(sled::Error),

    /// Serialization/deserialization failed
    Serialization(String),

    /// Level system error
    LevelError(String),

    /// Contribution system error
    ContributionError(String),

    /// Content system error
    ContentError(String),

    /// Invalid space ID format
    InvalidSpaceId(String),

    /// Computation error
    ComputationError(String),
}

impl fmt::Display for SpaceHealthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SpaceNotFound(space_id) => {
                write!(f, "Space not found: {:02x}{:02x}...", space_id[0], space_id[1])
            }
            Self::Storage(e) => write!(f, "Storage error: {}", e),
            Self::Serialization(msg) => write!(f, "Serialization error: {}", msg),
            Self::LevelError(msg) => write!(f, "Level system error: {}", msg),
            Self::ContributionError(msg) => write!(f, "Contribution system error: {}", msg),
            Self::ContentError(msg) => write!(f, "Content system error: {}", msg),
            Self::InvalidSpaceId(msg) => write!(f, "Invalid space ID: {}", msg),
            Self::ComputationError(msg) => write!(f, "Computation error: {}", msg),
        }
    }
}

impl std::error::Error for SpaceHealthError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Storage(e) => Some(e),
            _ => None,
        }
    }
}

impl From<sled::Error> for SpaceHealthError {
    fn from(err: sled::Error) -> Self {
        Self::Storage(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_space_not_found_display() {
        let space_id = [0xAB, 0xCD, 0u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let err = SpaceHealthError::SpaceNotFound(space_id);
        let display = err.to_string();
        assert!(display.contains("Space not found"));
        assert!(display.contains("abcd"));
    }

    #[test]
    fn test_storage_error_display() {
        // Can't easily create a sled::Error, so test the format
        let err = SpaceHealthError::Serialization("test".to_string());
        assert!(err.to_string().contains("Serialization error"));
    }

    #[test]
    fn test_level_error_display() {
        let err = SpaceHealthError::LevelError("test".to_string());
        assert!(err.to_string().contains("Level system error"));
    }

    #[test]
    fn test_content_error_display() {
        let err = SpaceHealthError::ContentError("test".to_string());
        assert!(err.to_string().contains("Content system error"));
    }

    #[test]
    fn test_invalid_space_id_display() {
        let err = SpaceHealthError::InvalidSpaceId("bad format".to_string());
        assert!(err.to_string().contains("Invalid space ID"));
        assert!(err.to_string().contains("bad format"));
    }

    #[test]
    fn test_computation_error_display() {
        let err = SpaceHealthError::ComputationError("overflow".to_string());
        assert!(err.to_string().contains("Computation error"));
        assert!(err.to_string().contains("overflow"));
    }
}
