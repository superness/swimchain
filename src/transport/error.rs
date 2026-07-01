//! Transport layer errors
//!
//! Error types for TCP transport connections, handshakes, and message framing.

use std::io;
use thiserror::Error;

use super::state::ConnectionState;
use crate::network::WireError;

/// Transport layer errors
#[derive(Debug, Error)]
pub enum TransportError {
    /// I/O error (connection, read, write)
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    /// VERSION not received within timeout
    #[error("VERSION not received within {0} seconds")]
    VersionTimeout(u64),

    /// Handshake not completed within timeout
    #[error("Handshake not completed within {0} seconds")]
    HandshakeTimeout(u64),

    /// Connection closed by peer
    #[error("Connection closed by peer")]
    ConnectionClosed,

    /// Protocol version mismatch
    #[error("Protocol version mismatch: peer={peer}, ours={ours}")]
    VersionMismatch {
        /// Peer's protocol version
        peer: u32,
        /// Our protocol version
        ours: u32,
    },

    /// Duplicate connection detected (nonce collision)
    #[error("Duplicate connection detected (nonce collision)")]
    DuplicateConnection,

    /// Self-connection detected (same nonce)
    #[error("Self-connection detected (same nonce)")]
    SelfConnection,

    /// Wire protocol error
    #[error("Wire protocol error: {0}")]
    Wire(#[from] WireError),

    /// Invalid state transition
    #[error("Invalid state transition from {from:?} to {to:?}")]
    InvalidStateTransition {
        /// Current state
        from: ConnectionState,
        /// Attempted new state
        to: ConnectionState,
    },

    /// Message too large
    #[error("Message too large: {size} bytes exceeds max {max} bytes")]
    MessageTooLarge {
        /// Actual message size
        size: u32,
        /// Maximum allowed size
        max: u32,
    },

    /// Unexpected message type received
    #[error("Unexpected message type: {0}")]
    UnexpectedMessage(String),

    /// PONG not received within timeout
    #[error("PONG not received within timeout")]
    PongTimeout,

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialize(#[from] crate::types::error::SerializeError),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_io_error_conversion() {
        let io_err = io::Error::new(io::ErrorKind::ConnectionRefused, "connection refused");
        let transport_err: TransportError = io_err.into();
        assert!(matches!(transport_err, TransportError::Io(_)));
        assert!(transport_err.to_string().contains("connection refused"));
    }

    #[test]
    fn test_version_timeout_display() {
        let err = TransportError::VersionTimeout(10);
        assert_eq!(err.to_string(), "VERSION not received within 10 seconds");
    }

    #[test]
    fn test_handshake_timeout_display() {
        let err = TransportError::HandshakeTimeout(30);
        assert_eq!(err.to_string(), "Handshake not completed within 30 seconds");
    }

    #[test]
    fn test_version_mismatch_display() {
        let err = TransportError::VersionMismatch { peer: 2, ours: 1 };
        assert!(err.to_string().contains("peer=2"));
        assert!(err.to_string().contains("ours=1"));
    }

    #[test]
    fn test_invalid_state_transition_display() {
        let err = TransportError::InvalidStateTransition {
            from: ConnectionState::Connected,
            to: ConnectionState::Established,
        };
        assert!(err.to_string().contains("Connected"));
        assert!(err.to_string().contains("Established"));
    }

    #[test]
    fn test_message_too_large_display() {
        let err = TransportError::MessageTooLarge {
            size: 5_000_000,
            max: 4_194_304,
        };
        assert!(err.to_string().contains("5000000"));
        assert!(err.to_string().contains("4194304"));
    }
}
