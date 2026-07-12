//! Peer information types
//!
//! Defines PeerInfo (extracted from VERSION) and LocalNodeInfo for VERSION construction.

use std::net::SocketAddr;

use crate::types::network::MessageEnvelope;

/// Information about a connected peer (extracted from VERSION message)
#[derive(Debug, Clone)]
pub struct PeerInfo {
    /// Node ID per SPEC_06 §128: SHA-256(public_key), ephemeral per session.
    /// Derived from `VersionPayload.public_key`.
    pub node_id: [u8; 32],
    /// Protocol version supported
    pub protocol_version: u32,
    /// Service capabilities bitmask
    pub services: u64,
    /// User agent string (e.g., "Swimchain/0.1.0")
    pub user_agent: String,
    /// Peer's reported block height
    pub start_height: u32,
    /// Whether peer wants gossip messages
    pub relay: bool,
    /// Peer's nonce (for duplicate/self-connection detection)
    pub nonce: u64,
    /// Remote socket address
    pub remote_addr: SocketAddr,
    /// Timestamp from VERSION message
    pub timestamp: u64,
    /// The public address the PEER observed US as (their VERSION's `receiver_addr`).
    /// This is how a NAT'd node learns its own external endpoint (SPEC_06 discovery /
    /// NAT reflection). None if the peer reported nothing dialable.
    pub observed_external_addr: Option<SocketAddr>,
    /// The peer's own advertised LISTEN address (their VERSION's `sender_addr`).
    /// For an inbound connection `remote_addr` is only the peer's ephemeral SOURCE
    /// port, which nothing listens on — the peer's real listen port lives here, and
    /// is what must be stored/gossiped so others can dial it. None if not advertised.
    pub advertised_addr: Option<SocketAddr>,
}

impl PeerInfo {
    /// Dialable listen endpoint to advertise for an INBOUND peer: the observed source
    /// IP (from `remote_addr`, which is correct) combined with the peer's advertised
    /// listen PORT (from their VERSION `sender_addr`, since `remote_addr`'s port is a
    /// throwaway ephemeral one). `None` when the peer advertised no usable port — we
    /// then avoid gossiping an unreachable address for it.
    pub fn inbound_discovery_addr(&self) -> Option<SocketAddr> {
        self.advertised_addr
            .filter(|a| a.port() != 0)
            .map(|a| SocketAddr::new(self.remote_addr.ip(), a.port()))
    }
}

/// Local node information for VERSION message construction
#[derive(Debug, Clone)]
pub struct LocalNodeInfo {
    /// Our service capabilities
    pub services: u64,
    /// Our current block height
    pub height: u32,
    /// Our user agent string (e.g., "Swimchain/0.1.0")
    pub user_agent: String,
    /// Whether we accept gossip messages
    pub relay: bool,
    /// Our Ed25519 public key. Required by SPEC_06 §128 — peers compute our
    /// `node_id` as SHA-256(public_key).
    pub public_key: [u8; 32],
}

impl Default for LocalNodeInfo {
    fn default() -> Self {
        Self {
            services: crate::types::network::capability::FULL_NODE as u64,
            height: 0,
            user_agent: format!("Swimchain/{}", env!("CARGO_PKG_VERSION")),
            relay: true,
            public_key: [0u8; 32],
        }
    }
}

/// Events emitted by peer connections
#[derive(Debug, Clone)]
pub enum PeerEvent {
    /// A message was received from the peer
    MessageReceived {
        /// The received message envelope
        envelope: MessageEnvelope,
    },
    /// Peer disconnected
    Disconnected {
        /// Reason for disconnection
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::network::MessageType;

    #[test]
    fn test_local_node_info_default() {
        let info = LocalNodeInfo::default();
        assert_eq!(
            info.services,
            crate::types::network::capability::FULL_NODE as u64
        );
        assert_eq!(info.height, 0);
        assert!(info.user_agent.starts_with("Swimchain/"));
        assert!(info.relay);
    }

    #[test]
    fn test_peer_info_fields() {
        let peer = PeerInfo {
            node_id: [0xab; 32],
            protocol_version: 1,
            services: 0x0001,
            user_agent: "TestAgent/1.0".to_string(),
            start_height: 12345,
            relay: true,
            nonce: 0xdeadbeef,
            remote_addr: "127.0.0.1:9735".parse().unwrap(),
            timestamp: 1700000000,
            observed_external_addr: None,
            advertised_addr: None,
        };

        assert_eq!(peer.protocol_version, 1);
        assert_eq!(peer.start_height, 12345);
        assert!(peer.relay);
    }

    #[test]
    fn test_peer_event_message_received() {
        let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![1, 2, 3]);
        let event = PeerEvent::MessageReceived {
            envelope: envelope.clone(),
        };

        match event {
            PeerEvent::MessageReceived { envelope: e } => {
                assert_eq!(e.message_type, MessageType::Ping);
            }
            _ => panic!("Expected MessageReceived event"),
        }
    }

    #[test]
    fn test_peer_event_disconnected() {
        let event = PeerEvent::Disconnected {
            reason: "timeout".to_string(),
        };

        match event {
            PeerEvent::Disconnected { reason } => {
                assert_eq!(reason, "timeout");
            }
            _ => panic!("Expected Disconnected event"),
        }
    }
}
