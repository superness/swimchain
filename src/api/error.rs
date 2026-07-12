//! API error types
//!
//! Defines all error types that can be returned by the API layer.

use crate::content::ContentFormatError;
use crate::types::content::{ContentId, SpaceId};

/// Errors that can occur during API operations
#[derive(Debug, Clone)]
pub enum ApiError {
    /// Content was not found in storage
    ContentNotFound(ContentId),

    /// No identity has been set for the client
    NoIdentity,

    /// Space was not found
    SpaceNotFound(SpaceId),

    /// PoW operation was cancelled by user
    PowCancelled,

    /// PoW computation failed
    PowFailed(String),

    /// Storage operation failed
    Storage(String),

    /// Content format validation failed (SPEC_12 §3.1)
    ContentFormat(ContentFormatError),

    /// Internal error
    Internal(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::ContentNotFound(_id) => {
                write!(f, "The requested content could not be found. It may have decayed or been removed.")
            }
            ApiError::NoIdentity => {
                write!(f, "Please set up your identity before posting. Go to Settings > Identity to create or import one.")
            }
            ApiError::SpaceNotFound(_id) => {
                write!(f, "The requested space could not be found. It may not exist or you may not have access.")
            }
            ApiError::PowCancelled => write!(f, "Operation cancelled"),
            ApiError::PowFailed(msg) => {
                write!(
                    f,
                    "Failed to compute proof-of-work: {}. Please try again.",
                    msg
                )
            }
            ApiError::Storage(msg) => {
                write!(
                    f,
                    "Storage error: {}. Please check disk space and permissions.",
                    msg
                )
            }
            ApiError::ContentFormat(err) => write!(f, "Content format error: {}", err),
            ApiError::Internal(msg) => {
                write!(
                    f,
                    "An unexpected error occurred: {}. Please try again or report this issue.",
                    msg
                )
            }
        }
    }
}

impl std::error::Error for ApiError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = ApiError::NoIdentity;
        assert!(err.to_string().contains("identity"));

        let err = ApiError::PowCancelled;
        assert!(err.to_string().contains("cancelled"));

        let err = ApiError::Storage("disk full".to_string());
        assert!(err.to_string().contains("disk full"));
    }

    #[test]
    fn test_content_format_error_display() {
        let err = ApiError::ContentFormat(ContentFormatError::VideoNotSupported);
        assert!(err.to_string().contains("Content format error"));

        let err = ApiError::ContentFormat(ContentFormatError::TextTooLong {
            size: 20000,
            max: 10000,
        });
        assert!(err.to_string().contains("Content format error"));
    }
}
