//! Connection event types (SPEC_10 §4.4)
//!
//! Defines events emitted by the ConnectionManager for connection lifecycle
//! changes, allowing other subsystems to react to peer connectivity changes.

use std::net::SocketAddr;

use crate::transport::ConnectionDirection;

/// Error types for connection-related failures
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionError {
    /// I/O error (wrapped as String for Clone)
    Io(String),
    /// Handshake timeout
    HandshakeTimeout,
    /// PONG response timeout
    PongTimeout,
    /// Message too large
    MessageTooLarge,
    /// Invalid message format or content
    InvalidMessage(String),
}

impl std::fmt::Display for ConnectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(msg) => write!(f, "I/O error: {}", msg),
            Self::HandshakeTimeout => write!(f, "handshake timeout"),
            Self::PongTimeout => write!(f, "PONG timeout"),
            Self::MessageTooLarge => write!(f, "message too large"),
            Self::InvalidMessage(msg) => write!(f, "invalid message: {}", msg),
        }
    }
}

impl std::error::Error for ConnectionError {}

impl From<std::io::Error> for ConnectionError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

/// Reason for connection disconnection
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DisconnectReason {
    /// Graceful disconnection (normal close)
    Normal,
    /// Connection or keepalive timeout
    Timeout,
    /// Protocol violation (invalid message, bad checksum, etc.)
    ProtocolViolation(String),
    /// Connection error (I/O failure)
    ConnectionError(ConnectionError),
    /// Peer is banned
    PeerBanned,
    /// Connection limit exceeded
    LimitExceeded,
    /// Node is shutting down
    Shutdown,
}

impl std::fmt::Display for DisconnectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Normal => write!(f, "normal disconnect"),
            Self::Timeout => write!(f, "timeout"),
            Self::ProtocolViolation(msg) => write!(f, "protocol violation: {}", msg),
            Self::ConnectionError(err) => write!(f, "connection error: {}", err),
            Self::PeerBanned => write!(f, "peer banned"),
            Self::LimitExceeded => write!(f, "connection limit exceeded"),
            Self::Shutdown => write!(f, "node shutting down"),
        }
    }
}

/// Events emitted by ConnectionManager (SPEC_10 §4.4)
///
/// These events allow subsystems to react to connection lifecycle changes.
/// Subscribers receive events through a broadcast channel.
#[derive(Debug, Clone)]
pub enum ConnectionEvent {
    /// A new peer connection was established
    Connected {
        /// The peer's node ID (32-byte public key hash)
        peer_id: [u8; 32],
        /// Remote socket address
        addr: SocketAddr,
        /// Direction of the connection
        direction: ConnectionDirection,
    },

    /// A peer connection was closed
    Disconnected {
        /// The peer's node ID
        peer_id: [u8; 32],
        /// Reason for disconnection
        reason: DisconnectReason,
    },

    /// A message was received from a peer
    MessageReceived {
        /// The peer's node ID
        peer_id: [u8; 32],
        /// Message type code (wire protocol uses u8)
        message_type: u8,
        /// Fork ID from message envelope
        fork_id: [u8; 32],
        /// Raw message payload
        payload: Vec<u8>,
    },

    /// A connection error occurred
    Error {
        /// The peer's node ID
        peer_id: [u8; 32],
        /// The error that occurred
        error: ConnectionError,
    },
}

impl ConnectionEvent {
    /// Get the peer ID associated with this event
    #[must_use]
    pub fn peer_id(&self) -> &[u8; 32] {
        match self {
            Self::Connected { peer_id, .. } => peer_id,
            Self::Disconnected { peer_id, .. } => peer_id,
            Self::MessageReceived { peer_id, .. } => peer_id,
            Self::Error { peer_id, .. } => peer_id,
        }
    }

    /// Check if this is a connection event
    #[must_use]
    pub fn is_connected(&self) -> bool {
        matches!(self, Self::Connected { .. })
    }

    /// Check if this is a disconnection event
    #[must_use]
    pub fn is_disconnected(&self) -> bool {
        matches!(self, Self::Disconnected { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_error_display() {
        assert_eq!(
            ConnectionError::Io("broken pipe".to_string()).to_string(),
            "I/O error: broken pipe"
        );
        assert_eq!(
            ConnectionError::HandshakeTimeout.to_string(),
            "handshake timeout"
        );
        assert_eq!(ConnectionError::PongTimeout.to_string(), "PONG timeout");
        assert_eq!(
            ConnectionError::MessageTooLarge.to_string(),
            "message too large"
        );
        assert_eq!(
            ConnectionError::InvalidMessage("bad checksum".to_string()).to_string(),
            "invalid message: bad checksum"
        );
    }

    #[test]
    fn test_disconnect_reason_display() {
        assert_eq!(DisconnectReason::Normal.to_string(), "normal disconnect");
        assert_eq!(DisconnectReason::Timeout.to_string(), "timeout");
        assert_eq!(
            DisconnectReason::ProtocolViolation("invalid magic".to_string()).to_string(),
            "protocol violation: invalid magic"
        );
        assert_eq!(DisconnectReason::PeerBanned.to_string(), "peer banned");
        assert_eq!(
            DisconnectReason::LimitExceeded.to_string(),
            "connection limit exceeded"
        );
        assert_eq!(DisconnectReason::Shutdown.to_string(), "node shutting down");
    }

    #[test]
    fn test_connection_event_peer_id() {
        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        let event = ConnectionEvent::Connected {
            peer_id,
            addr,
            direction: ConnectionDirection::Outbound,
        };
        assert_eq!(event.peer_id(), &peer_id);

        let event = ConnectionEvent::Disconnected {
            peer_id,
            reason: DisconnectReason::Normal,
        };
        assert_eq!(event.peer_id(), &peer_id);

        let event = ConnectionEvent::MessageReceived {
            peer_id,
            message_type: 0x01,
            fork_id: [0u8; 32],
            payload: vec![],
        };
        assert_eq!(event.peer_id(), &peer_id);

        let event = ConnectionEvent::Error {
            peer_id,
            error: ConnectionError::PongTimeout,
        };
        assert_eq!(event.peer_id(), &peer_id);
    }

    #[test]
    fn test_connection_event_is_connected() {
        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        let event = ConnectionEvent::Connected {
            peer_id,
            addr,
            direction: ConnectionDirection::Inbound,
        };
        assert!(event.is_connected());
        assert!(!event.is_disconnected());

        let event = ConnectionEvent::Disconnected {
            peer_id,
            reason: DisconnectReason::Normal,
        };
        assert!(!event.is_connected());
        assert!(event.is_disconnected());
    }

    #[test]
    fn test_connection_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::BrokenPipe, "broken pipe");
        let conn_err = ConnectionError::from(io_err);
        assert!(matches!(conn_err, ConnectionError::Io(_)));
    }
}
