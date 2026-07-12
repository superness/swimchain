//! Message construction and parsing (SPEC_06 §5)
//!
//! This module provides a high-level API for constructing and parsing wire protocol
//! messages. The `Message` enum wraps all payload types and handles serialization
//! to/from MessageEnvelope.

use super::error::WireError;
use super::messages::*;
use crate::types::network::{MessageEnvelope, MessageType};
use crate::types::serialize::{Deserialize, Serialize};

/// Typed message wrapper
///
/// This enum represents all possible wire protocol messages. Each variant
/// contains the payload for that message type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Message {
    /// VERSION handshake message
    Version(VersionPayload),
    /// VERACK acknowledgment (no payload)
    Verack,
    /// PING for latency measurement
    Ping(PingPongPayload),
    /// PONG response to ping
    Pong(PingPongPayload),
    /// GETADDR request for peer addresses
    GetAddr(GetAddrPayload),
    /// ADDR response with peer addresses
    Addr(AddrPayload),
    /// INV inventory announcement
    Inv(InvPayload),
    /// GETDATA request for specific items
    GetData(InvPayload),
    /// DATA response with requested data
    Data(DataPayload),
    /// NOTFOUND response for missing items
    NotFound(NotFoundPayload),
    /// GETBLOCKS request for blocks
    GetBlocks(GetBlocksPayload),
    /// GETBLOCKS_LOCATOR request for blocks using Bitcoin-style locator
    GetBlocksLocator(GetBlocksLocatorPayload),
    /// GETHEADERS_LOCATOR request for headers using Bitcoin-style locator
    GetHeadersLocator(GetHeadersLocatorPayload),
    /// BLOCKS response with blocks
    Blocks(BlocksPayload),
    /// GETHEADERS request for headers
    GetHeaders(GetHeadersPayload),
    /// HEADERS response with headers
    Headers(HeadersPayload),
    /// CHAINSTATUS periodic status update
    ChainStatus(ChainStatusPayload),
    /// GOSSIP message propagation
    Gossip(GossipPayload),
    /// FORKANNOUNCE fork announcement
    ForkAnnounce(ForkAnnouncePayload),
    /// FORKQUERY fork information request
    ForkQuery(ForkQueryPayload),
    /// FORKINFO fork information response
    ForkInfo(ForkInfoPayload),
    /// REJECT message rejection
    Reject(RejectPayload),
    /// ALERT network-wide alert
    Alert(AlertPayload),
}

impl Message {
    /// Get the message type for this message
    #[must_use]
    pub fn message_type(&self) -> MessageType {
        match self {
            Message::Version(_) => MessageType::Version,
            Message::Verack => MessageType::Verack,
            Message::Ping(_) => MessageType::Ping,
            Message::Pong(_) => MessageType::Pong,
            Message::GetAddr(_) => MessageType::GetAddr,
            Message::Addr(_) => MessageType::Addr,
            Message::Inv(_) => MessageType::Inv,
            Message::GetData(_) => MessageType::GetData,
            Message::Data(_) => MessageType::Data,
            Message::NotFound(_) => MessageType::NotFound,
            Message::GetBlocks(_) => MessageType::GetBlocks,
            Message::GetBlocksLocator(_) => MessageType::GetBlocksLocator,
            Message::GetHeadersLocator(_) => MessageType::GetHeadersLocator,
            Message::Blocks(_) => MessageType::Blocks,
            Message::GetHeaders(_) => MessageType::GetHeaders,
            Message::Headers(_) => MessageType::Headers,
            Message::ChainStatus(_) => MessageType::ChainStatus,
            Message::Gossip(_) => MessageType::Gossip,
            Message::ForkAnnounce(_) => MessageType::ForkAnnounce,
            Message::ForkQuery(_) => MessageType::ForkQuery,
            Message::ForkInfo(_) => MessageType::ForkInfo,
            Message::Reject(_) => MessageType::Reject,
            Message::Alert(_) => MessageType::Alert,
        }
    }

    /// Serialize the message payload to bytes
    #[must_use]
    pub fn payload_bytes(&self) -> Vec<u8> {
        match self {
            Message::Version(p) => p.to_bytes(),
            Message::Verack => Vec::new(),
            Message::Ping(p) => p.to_bytes(),
            Message::Pong(p) => p.to_bytes(),
            Message::GetAddr(p) => p.to_bytes(),
            Message::Addr(p) => p.to_bytes(),
            Message::Inv(p) => p.to_bytes(),
            Message::GetData(p) => p.to_bytes(),
            Message::Data(p) => p.to_bytes(),
            Message::NotFound(p) => p.to_bytes(),
            Message::GetBlocks(p) => p.to_bytes(),
            Message::GetBlocksLocator(p) => p.to_bytes(),
            Message::GetHeadersLocator(p) => p.to_bytes(),
            Message::Blocks(p) => p.to_bytes(),
            Message::GetHeaders(p) => p.to_bytes(),
            Message::Headers(p) => p.to_bytes(),
            Message::ChainStatus(p) => p.to_bytes(),
            Message::Gossip(p) => p.to_bytes(),
            Message::ForkAnnounce(p) => p.to_bytes(),
            Message::ForkQuery(p) => p.to_bytes(),
            Message::ForkInfo(p) => p.to_bytes(),
            Message::Reject(p) => p.to_bytes(),
            Message::Alert(p) => p.to_bytes(),
        }
    }

    /// Convert to a MessageEnvelope with specified fork ID
    #[must_use]
    pub fn to_envelope(&self, fork_id: [u8; 32]) -> MessageEnvelope {
        MessageEnvelope::new(self.message_type(), fork_id, self.payload_bytes())
    }

    /// Convert to a fork-agnostic MessageEnvelope (fork_id = zeros)
    #[must_use]
    pub fn to_envelope_agnostic(&self) -> MessageEnvelope {
        MessageEnvelope::new_fork_agnostic(self.message_type(), self.payload_bytes())
    }

    /// Parse a message from a MessageEnvelope
    pub fn from_envelope(envelope: &MessageEnvelope) -> Result<Self, WireError> {
        let payload = &envelope.payload;

        match envelope.message_type {
            MessageType::Version => {
                let p = VersionPayload::from_bytes(payload)?;
                Ok(Message::Version(p))
            }
            MessageType::Verack => {
                if !payload.is_empty() {
                    return Err(WireError::payload("VERACK should have empty payload"));
                }
                Ok(Message::Verack)
            }
            MessageType::Ping => {
                let p = PingPongPayload::from_bytes(payload)?;
                Ok(Message::Ping(p))
            }
            MessageType::Pong => {
                let p = PingPongPayload::from_bytes(payload)?;
                Ok(Message::Pong(p))
            }
            MessageType::GetAddr => {
                let p = GetAddrPayload::from_bytes(payload)?;
                Ok(Message::GetAddr(p))
            }
            MessageType::Addr => {
                let p = AddrPayload::from_bytes(payload)?;
                Ok(Message::Addr(p))
            }
            MessageType::Inv => {
                let p = InvPayload::from_bytes(payload)?;
                Ok(Message::Inv(p))
            }
            MessageType::GetData => {
                let p = InvPayload::from_bytes(payload)?;
                Ok(Message::GetData(p))
            }
            MessageType::Data => {
                let p = DataPayload::from_bytes(payload)?;
                Ok(Message::Data(p))
            }
            MessageType::NotFound => {
                let p = NotFoundPayload::from_bytes(payload)?;
                Ok(Message::NotFound(p))
            }
            MessageType::GetBlocks => {
                let p = GetBlocksPayload::from_bytes(payload)?;
                Ok(Message::GetBlocks(p))
            }
            MessageType::GetBlocksLocator => {
                let p = GetBlocksLocatorPayload::from_bytes(payload)?;
                Ok(Message::GetBlocksLocator(p))
            }
            MessageType::GetHeadersLocator => {
                let p = GetHeadersLocatorPayload::from_bytes(payload)?;
                Ok(Message::GetHeadersLocator(p))
            }
            MessageType::Blocks => {
                let p = BlocksPayload::from_bytes(payload)?;
                Ok(Message::Blocks(p))
            }
            MessageType::GetHeaders => {
                let p = GetHeadersPayload::from_bytes(payload)?;
                Ok(Message::GetHeaders(p))
            }
            MessageType::Headers => {
                let p = HeadersPayload::from_bytes(payload)?;
                Ok(Message::Headers(p))
            }
            MessageType::ChainStatus => {
                let p = ChainStatusPayload::from_bytes(payload)?;
                Ok(Message::ChainStatus(p))
            }
            MessageType::Gossip => {
                let p = GossipPayload::from_bytes(payload)?;
                Ok(Message::Gossip(p))
            }
            MessageType::ForkAnnounce => {
                let p = ForkAnnouncePayload::from_bytes(payload)?;
                Ok(Message::ForkAnnounce(p))
            }
            MessageType::ForkQuery => {
                let p = ForkQueryPayload::from_bytes(payload)?;
                Ok(Message::ForkQuery(p))
            }
            MessageType::ForkInfo => {
                let p = ForkInfoPayload::from_bytes(payload)?;
                Ok(Message::ForkInfo(p))
            }
            MessageType::Reject => {
                let p = RejectPayload::from_bytes(payload)?;
                Ok(Message::Reject(p))
            }
            MessageType::Alert => {
                let p = AlertPayload::from_bytes(payload)?;
                Ok(Message::Alert(p))
            }
            // Content sync messages (SPEC_07) are handled at the router level
            // These are parsed directly by the router, not through this enum
            MessageType::WhoHas
            | MessageType::IHave
            | MessageType::Get
            | MessageType::DataContent
            | MessageType::NotFoundContent => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Content sync message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Block sync messages (SPEC_08) are handled at the router level
            MessageType::BlockAnnounce | MessageType::GetBlock | MessageType::BlockData => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Block sync message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Pool and mempool messages are handled at the router level
            MessageType::PoolAnnounce
            | MessageType::PoolContribution
            | MessageType::PoolStatus
            | MessageType::ActionAnnounce
            | MessageType::GetMempool
            | MessageType::DmRequestAnnounce
            | MessageType::DmAcceptAnnounce
            | MessageType::DmDeclineAnnounce
            | MessageType::HolePunchIntro => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Pool/mempool message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // DHT messages (SPEC_06 §3.8) are handled at the router level
            MessageType::DhtPing
            | MessageType::DhtPong
            | MessageType::DhtFindNode
            | MessageType::DhtNodes
            | MessageType::DhtFindValue
            | MessageType::DhtProviders
            | MessageType::DhtStore
            | MessageType::DhtStoreAck => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "DHT message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Branch-selective sync messages (BRANCH_SELECTIVE_SYNC.md) are handled at the router level
            MessageType::GetBlocksBranch
            | MessageType::SubscribeBranch
            | MessageType::UnsubscribeBranch
            | MessageType::BranchAnnounce
            | MessageType::BranchInventory => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Branch sync message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Social layer / Peer attestation messages (SPEC_09 §8.2) are handled at the router level
            MessageType::ContributionClaim
            | MessageType::ContributionAttest
            | MessageType::LevelQuery
            | MessageType::LevelResponse
            | MessageType::SpaceHealthQuery
            | MessageType::SpaceHealthResponse => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Social layer message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Blocklist gossip messages (SPEC_12 §4.6) are handled at the router level
            MessageType::BlocklistUpdate
            | MessageType::BlocklistSync
            | MessageType::BlocklistRequest
            | MessageType::BlocklistBundle => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Blocklist message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Sponsorship offer messages (SPEC_11 §3.11) are handled at the router level
            MessageType::SponsorshipOffer
            | MessageType::SponsorshipOfferClaim
            | MessageType::SponsorshipClaimResponse
            | MessageType::SponsorshipOfferQuery
            | MessageType::SponsorshipOfferList => {
                // Return the raw payload for router-level handling
                Err(WireError::payload(format!(
                    "Sponsorship message type {:?} should be handled at router level",
                    envelope.message_type
                )))
            }
            // Space name resolution (Bug #4) — handled at router level
            MessageType::GetSpaceMeta | MessageType::SpaceMeta => Err(WireError::payload(format!(
                "Space-meta message type {:?} should be handled at router level",
                envelope.message_type
            ))),
        }
    }

    /// Check if this message type requires a non-empty payload
    #[must_use]
    pub fn requires_payload(&self) -> bool {
        !matches!(self, Message::Verack)
    }

    /// Check if this message can be sent without completing handshake
    #[must_use]
    pub fn is_pre_handshake(&self) -> bool {
        matches!(self, Message::Version(_) | Message::Verack)
    }
}

/// Builder for creating VERSION messages
#[derive(Debug, Default)]
pub struct VersionBuilder {
    payload: VersionPayload,
}

impl VersionBuilder {
    /// Create a new version builder
    #[must_use]
    pub fn new() -> Self {
        Self {
            payload: VersionPayload::default(),
        }
    }

    /// Set the protocol version
    #[must_use]
    pub fn protocol_version(mut self, v: u32) -> Self {
        self.payload.protocol_version = v;
        self
    }

    /// Set the node services bitmask
    #[must_use]
    pub fn services(mut self, s: u64) -> Self {
        self.payload.node_services = s;
        self
    }

    /// Set the timestamp
    #[must_use]
    pub fn timestamp(mut self, t: u64) -> Self {
        self.payload.timestamp = t;
        self
    }

    /// Set the sender address
    #[must_use]
    pub fn sender_addr(mut self, addr: CompactAddr) -> Self {
        self.payload.sender_addr = addr;
        self
    }

    /// Set the receiver address
    #[must_use]
    pub fn receiver_addr(mut self, addr: CompactAddr) -> Self {
        self.payload.receiver_addr = addr;
        self
    }

    /// Set the nonce
    #[must_use]
    pub fn nonce(mut self, n: u64) -> Self {
        self.payload.nonce = n;
        self
    }

    /// Set the user agent
    #[must_use]
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.payload.user_agent = ua.into();
        self
    }

    /// Set the start height
    #[must_use]
    pub fn start_height(mut self, h: u32) -> Self {
        self.payload.start_height = h;
        self
    }

    /// Set the relay flag
    #[must_use]
    pub fn relay(mut self, r: bool) -> Self {
        self.payload.relay = r;
        self
    }

    /// Build the Message
    #[must_use]
    pub fn build(self) -> Message {
        Message::Version(self.payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_type() {
        assert_eq!(Message::Verack.message_type(), MessageType::Verack);
        assert_eq!(
            Message::Ping(PingPongPayload::new(0)).message_type(),
            MessageType::Ping
        );
    }

    #[test]
    fn test_verack_empty_payload() {
        let msg = Message::Verack;
        let bytes = msg.payload_bytes();
        assert!(bytes.is_empty());
    }

    #[test]
    fn test_ping_roundtrip() {
        let original = Message::Ping(PingPongPayload::new(0x1234567890abcdef));
        let envelope = original.to_envelope_agnostic();
        let recovered = Message::from_envelope(&envelope).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_version_roundtrip() {
        let original = VersionBuilder::new()
            .protocol_version(1)
            .services(0x0003)
            .timestamp(1700000000)
            .nonce(0xdeadbeef)
            .user_agent("swimchain/0.1.0")
            .start_height(12345)
            .relay(true)
            .build();

        let envelope = original.to_envelope_agnostic();
        let recovered = Message::from_envelope(&envelope).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_envelope_with_fork_id() {
        let msg = Message::Ping(PingPongPayload::new(42));
        let fork_id = [0xab; 32];
        let envelope = msg.to_envelope(fork_id);

        assert_eq!(envelope.fork_id, fork_id);
        assert!(envelope.verify_checksum());
    }

    #[test]
    fn test_envelope_validation() {
        let msg = Message::Verack;
        let envelope = msg.to_envelope_agnostic();
        assert!(envelope.validate().is_ok());
    }

    #[test]
    fn test_inv_message_roundtrip() {
        let original = Message::Inv(InvPayload {
            items: vec![InvItem::block([0x11; 32]), InvItem::content([0x22; 32])],
        });
        let envelope = original.to_envelope_agnostic();
        let recovered = Message::from_envelope(&envelope).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_chain_status_roundtrip() {
        let original = Message::ChainStatus(ChainStatusPayload {
            height: 100000,
            tip_hash: [0xab; 32],
            cumulative_work: 999999,
            pending_content_count: 42,
            timestamp: 1700000000,
        });
        let envelope = original.to_envelope_agnostic();
        let recovered = Message::from_envelope(&envelope).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_reject_roundtrip() {
        let original = Message::Reject(RejectPayload {
            rejected_type: 0x20,
            code: RejectionCode::NotFound,
            reason: "Item not found".to_string(),
            hash: Some([0xef; 32]),
        });
        let envelope = original.to_envelope_agnostic();
        let recovered = Message::from_envelope(&envelope).unwrap();
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_is_pre_handshake() {
        assert!(Message::Version(VersionPayload::default()).is_pre_handshake());
        assert!(Message::Verack.is_pre_handshake());
        assert!(!Message::Ping(PingPongPayload::new(0)).is_pre_handshake());
    }

    #[test]
    fn test_requires_payload() {
        assert!(!Message::Verack.requires_payload());
        assert!(Message::Ping(PingPongPayload::new(0)).requires_payload());
    }

    #[test]
    fn test_all_message_types_have_message_type() {
        // Verify each message variant returns correct type
        let test_cases: Vec<(Message, MessageType)> = vec![
            (
                Message::Version(VersionPayload::default()),
                MessageType::Version,
            ),
            (Message::Verack, MessageType::Verack),
            (Message::Ping(PingPongPayload::default()), MessageType::Ping),
            (Message::Pong(PingPongPayload::default()), MessageType::Pong),
            (
                Message::GetAddr(GetAddrPayload::default()),
                MessageType::GetAddr,
            ),
            (Message::Addr(AddrPayload::default()), MessageType::Addr),
            (Message::Inv(InvPayload::default()), MessageType::Inv),
            (
                Message::GetData(InvPayload::default()),
                MessageType::GetData,
            ),
            (Message::Data(DataPayload::default()), MessageType::Data),
            (
                Message::NotFound(NotFoundPayload::default()),
                MessageType::NotFound,
            ),
            (
                Message::GetBlocks(GetBlocksPayload::default()),
                MessageType::GetBlocks,
            ),
            (
                Message::Blocks(BlocksPayload::default()),
                MessageType::Blocks,
            ),
            (
                Message::GetHeaders(GetHeadersPayload::default()),
                MessageType::GetHeaders,
            ),
            (
                Message::Headers(HeadersPayload::default()),
                MessageType::Headers,
            ),
            (
                Message::ChainStatus(ChainStatusPayload::default()),
                MessageType::ChainStatus,
            ),
            (
                Message::Gossip(GossipPayload::default()),
                MessageType::Gossip,
            ),
            (
                Message::ForkAnnounce(ForkAnnouncePayload::default()),
                MessageType::ForkAnnounce,
            ),
            (
                Message::ForkQuery(ForkQueryPayload::default()),
                MessageType::ForkQuery,
            ),
            (
                Message::ForkInfo(ForkInfoPayload::default()),
                MessageType::ForkInfo,
            ),
            (
                Message::Reject(RejectPayload::default()),
                MessageType::Reject,
            ),
            (Message::Alert(AlertPayload::default()), MessageType::Alert),
        ];

        for (msg, expected_type) in test_cases {
            assert_eq!(msg.message_type(), expected_type);
        }
    }
}
