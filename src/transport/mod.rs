//! TCP Transport layer (SPEC_06 §5.3)
//!
//! This module implements the TCP transport layer for Swimchain peer-to-peer
//! communication. It provides:
//! - Connection state machine with distinct inbound/outbound paths
//! - VERSION/VERACK handshake protocol
//! - Message framing with 46-byte envelope headers
//! - Connection timeout handling
//! - Basic peer management

pub mod connection;
pub mod error;
pub mod framing;
pub mod handshake;
pub mod keepalive;
pub mod listener;
pub mod peer;
pub mod state;

pub use connection::Connection;
pub use error::TransportError;
pub use listener::TcpTransport;
pub use peer::{LocalNodeInfo, PeerEvent, PeerInfo};
pub use state::{ConnectionDirection, ConnectionState};
