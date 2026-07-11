//! Attribution error types
//!
//! Error types for the content attribution system.

/// Error types for attribution operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AttributionError {
    /// Content not found in storage
    ContentNotFound,

    /// No qualifying engagements found for content
    NoEngagements,

    /// Internal error computing attribution
    ComputeError(String),

    /// Invalid wire format data
    InvalidWireFormat(String),
}

impl std::fmt::Display for AttributionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ContentNotFound => write!(f, "Content not found"),
            Self::NoEngagements => write!(f, "No qualifying engagements for content"),
            Self::ComputeError(msg) => write!(f, "Attribution compute error: {}", msg),
            Self::InvalidWireFormat(msg) => write!(f, "Invalid wire format: {}", msg),
        }
    }
}

impl std::error::Error for AttributionError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        assert_eq!(
            AttributionError::ContentNotFound.to_string(),
            "Content not found"
        );
        assert_eq!(
            AttributionError::NoEngagements.to_string(),
            "No qualifying engagements for content"
        );
        assert_eq!(
            AttributionError::ComputeError("test error".to_string()).to_string(),
            "Attribution compute error: test error"
        );
        assert_eq!(
            AttributionError::InvalidWireFormat("bad data".to_string()).to_string(),
            "Invalid wire format: bad data"
        );
    }

    #[test]
    fn test_error_equality() {
        assert_eq!(
            AttributionError::ContentNotFound,
            AttributionError::ContentNotFound
        );
        assert_ne!(
            AttributionError::ContentNotFound,
            AttributionError::NoEngagements
        );
    }
}
