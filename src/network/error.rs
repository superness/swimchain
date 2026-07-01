//! Wire protocol errors (SPEC_06 §6.1)
//!
//! Error types for wire protocol validation and serialization.

use thiserror::Error;

/// Wire protocol errors
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum WireError {
    /// Invalid magic bytes (V-MSG-01)
    #[error("invalid magic bytes: expected SWIM, got {0:02x?}")]
    InvalidMagic([u8; 4]),

    /// Unsupported protocol version (V-MSG-02)
    #[error("unsupported protocol version: {0}")]
    UnsupportedVersion(u8),

    /// Checksum mismatch (V-MSG-03)
    #[error("checksum mismatch")]
    InvalidChecksum,

    /// Payload length mismatch (V-MSG-04)
    #[error("payload length mismatch: expected {expected}, got {actual}")]
    PayloadLengthMismatch {
        /// Expected length from header
        expected: u32,
        /// Actual payload length
        actual: u32,
    },

    /// Unknown message type (V-MSG-05)
    #[error("unknown message type: 0x{0:02x}")]
    UnknownMessageType(u8),

    /// Unknown fork ID (V-MSG-06)
    #[error("unknown fork ID: {0:02x?}")]
    UnknownForkId([u8; 32]),

    /// Serialization error
    #[error("serialization error: {0}")]
    Serialize(#[from] crate::types::error::SerializeError),

    /// Invalid payload structure
    #[error("invalid payload: {0}")]
    InvalidPayload(String),

    /// Buffer too short for reading
    #[error("buffer too short: need {needed} bytes, have {have}")]
    BufferTooShort {
        /// Bytes needed
        needed: usize,
        /// Bytes available
        have: usize,
    },

    /// Maximum limit exceeded
    #[error("{item} count {count} exceeds maximum {max}")]
    LimitExceeded {
        /// Item type description
        item: &'static str,
        /// Actual count
        count: usize,
        /// Maximum allowed
        max: usize,
    },

    /// Invalid enum discriminant
    #[error("invalid {enum_name} value: 0x{value:02x}")]
    InvalidEnumValue {
        /// Enum type name
        enum_name: &'static str,
        /// Invalid value
        value: u8,
    },
}

impl WireError {
    /// Create a payload error with a message
    pub fn payload(msg: impl Into<String>) -> Self {
        WireError::InvalidPayload(msg.into())
    }

    /// Create a limit exceeded error
    pub fn limit_exceeded(item: &'static str, count: usize, max: usize) -> Self {
        WireError::LimitExceeded { item, count, max }
    }

    /// Create a buffer too short error
    pub fn buffer_short(needed: usize, have: usize) -> Self {
        WireError::BufferTooShort { needed, have }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = WireError::InvalidMagic([0xFF, 0x00, 0x00, 0x00]);
        assert!(err.to_string().contains("invalid magic bytes"));

        let err = WireError::UnsupportedVersion(99);
        assert!(err.to_string().contains("99"));

        let err = WireError::PayloadLengthMismatch {
            expected: 100,
            actual: 50,
        };
        assert!(err.to_string().contains("100"));
        assert!(err.to_string().contains("50"));
    }

    #[test]
    fn test_error_helpers() {
        let err = WireError::payload("test error");
        assert_eq!(err, WireError::InvalidPayload("test error".to_string()));

        let err = WireError::limit_exceeded("addresses", 1500, 1000);
        match err {
            WireError::LimitExceeded { item, count, max } => {
                assert_eq!(item, "addresses");
                assert_eq!(count, 1500);
                assert_eq!(max, 1000);
            }
            _ => panic!("expected LimitExceeded"),
        }
    }
}
