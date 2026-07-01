//! Router error types (SPEC_10 §5.3)
//!
//! Defines error types for message routing failures.

use thiserror::Error;

/// Error type for message routing failures
#[derive(Debug, Error)]
pub enum RouteError {
    /// Unknown message type code
    #[error("unknown message type: 0x{0:02x}")]
    UnknownMessageType(u8),

    /// Handler returned an error
    #[error("handler error: {0}")]
    HandlerError(String),

    /// Required subsystem is not available
    #[error("subsystem unavailable: {0}")]
    SubsystemUnavailable(&'static str),

    /// Failed to deserialize message payload
    #[error("deserialization error: {0}")]
    DeserializationError(String),

    /// Payload is too small for the message type
    #[error("payload too small: expected {expected}, got {actual}")]
    PayloadTooSmall {
        /// Expected minimum size
        expected: usize,
        /// Actual size received
        actual: usize,
    },

    /// Payload exceeds maximum allowed size
    #[error("payload too large: max {max}, got {actual}")]
    PayloadTooLarge {
        /// Maximum allowed size
        max: usize,
        /// Actual size received
        actual: usize,
    },

    /// Invalid signature in message
    #[error("invalid signature")]
    InvalidSignature,

    /// Storage operation failed
    #[error("storage error: {0}")]
    StorageError(String),

    /// Rate limit exceeded
    #[error("rate limit exceeded for peer")]
    RateLimitExceeded,

    /// Failed to serialize message payload
    #[error("serialization error: {0}")]
    SerializationError(String),

    /// Invalid data in message
    #[error("invalid data: {0}")]
    InvalidData(String),
}

impl RouteError {
    /// Returns true if this error indicates a peer misbehavior
    /// that should affect their score.
    pub fn is_peer_fault(&self) -> bool {
        matches!(
            self,
            Self::PayloadTooSmall { .. }
                | Self::PayloadTooLarge { .. }
                | Self::DeserializationError(_)
                | Self::InvalidSignature
                | Self::RateLimitExceeded
                | Self::InvalidData(_)
        )
    }

    /// Returns true if this error is transient and the message
    /// could potentially be processed later.
    pub fn is_transient(&self) -> bool {
        matches!(self, Self::SubsystemUnavailable(_) | Self::StorageError(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = RouteError::UnknownMessageType(0xFE);
        assert_eq!(err.to_string(), "unknown message type: 0xfe");

        let err = RouteError::PayloadTooSmall {
            expected: 8,
            actual: 3,
        };
        assert_eq!(err.to_string(), "payload too small: expected 8, got 3");

        let err = RouteError::PayloadTooLarge {
            max: 1000,
            actual: 2000,
        };
        assert_eq!(err.to_string(), "payload too large: max 1000, got 2000");

        let err = RouteError::SubsystemUnavailable("gossip");
        assert_eq!(err.to_string(), "subsystem unavailable: gossip");
    }

    #[test]
    fn test_is_peer_fault() {
        assert!(RouteError::PayloadTooSmall {
            expected: 8,
            actual: 3
        }
        .is_peer_fault());
        assert!(RouteError::PayloadTooLarge {
            max: 100,
            actual: 200
        }
        .is_peer_fault());
        assert!(RouteError::DeserializationError("bad".into()).is_peer_fault());
        assert!(RouteError::InvalidSignature.is_peer_fault());
        assert!(RouteError::RateLimitExceeded.is_peer_fault());

        assert!(!RouteError::SubsystemUnavailable("test").is_peer_fault());
        assert!(!RouteError::UnknownMessageType(0xFF).is_peer_fault());
        assert!(!RouteError::StorageError("disk".into()).is_peer_fault());
    }

    #[test]
    fn test_is_transient() {
        assert!(RouteError::SubsystemUnavailable("gossip").is_transient());
        assert!(RouteError::StorageError("disk full".into()).is_transient());

        assert!(!RouteError::PayloadTooSmall {
            expected: 8,
            actual: 3
        }
        .is_transient());
        assert!(!RouteError::UnknownMessageType(0xFF).is_transient());
    }
}
