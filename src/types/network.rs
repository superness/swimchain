//! Network types per SPEC_06
//!
//! Types for peer identity, messages, synchronization, and gossip.

use std::fmt;
use std::net::{Ipv4Addr, Ipv6Addr};

use super::block::{BlockHash, BlockHeader};
use super::identity::{IdentityId, PublicKey, Signature};

/// Node identifier (32 bytes, SHA-256 of node's public key)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct NodeId(pub [u8; 32]);

impl NodeId {
    /// Create from raw bytes
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Debug for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "NodeId(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for NodeId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Transport type discriminants (SPEC_06 §3.2)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransportType {
    /// TCP over IPv4
    TcpV4 = 0x01,
    /// TCP over IPv6
    TcpV6 = 0x02,
    /// Tor hidden service
    Tor = 0x03,
    /// I2P service
    I2p = 0x04,
    /// QUIC protocol
    Quic = 0x05,
}

impl TryFrom<u8> for TransportType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(TransportType::TcpV4),
            0x02 => Ok(TransportType::TcpV6),
            0x03 => Ok(TransportType::Tor),
            0x04 => Ok(TransportType::I2p),
            0x05 => Ok(TransportType::Quic),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Capability bitmask constants (SPEC_06 §3.1)
///
/// DESIGN NOTE: There is intentionally NO "RELAY" capability.
/// All nodes are equal participants. There are no special relay roles.
/// Users host content they have viewed (view-to-host model).
/// "Power users" are just users with more storage/uptime, not a distinct class.
pub mod capability {
    /// Full node with complete chain history
    pub const FULL_NODE: u32 = 0x0001;
    /// Can produce blocks (participates in consensus)
    pub const BLOCK_PRODUCER: u32 = 0x0002;
    // NOTE: 0x0004 reserved (removed RELAY - no special relay role by design)
    /// Supports Tor connections
    pub const TOR: u32 = 0x0008;
    /// Supports I2P connections
    pub const I2P: u32 = 0x0010;
    /// Mobile client (may have storage/bandwidth constraints)
    pub const MOBILE: u32 = 0x0020;
}

/// Peer address (SPEC_06 §3.2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PeerAddress {
    /// IPv4 address with port
    TcpV4 {
        /// IP address
        addr: Ipv4Addr,
        /// Port number
        port: u16,
    },
    /// IPv6 address with port
    TcpV6 {
        /// IP address
        addr: Ipv6Addr,
        /// Port number
        port: u16,
    },
    /// Tor onion address (v3, 56 characters)
    Tor {
        /// Onion address (without .onion suffix)
        address: String,
        /// Port number
        port: u16,
    },
    /// I2P address
    I2p {
        /// I2P destination
        destination: String,
    },
    /// QUIC address (currently same as TCP)
    Quic {
        /// IP address (v4 or v6)
        addr: std::net::IpAddr,
        /// Port number
        port: u16,
    },
}

impl PeerAddress {
    /// Get the transport type for this address
    #[must_use]
    pub fn transport_type(&self) -> TransportType {
        match self {
            PeerAddress::TcpV4 { .. } => TransportType::TcpV4,
            PeerAddress::TcpV6 { .. } => TransportType::TcpV6,
            PeerAddress::Tor { .. } => TransportType::Tor,
            PeerAddress::I2p { .. } => TransportType::I2p,
            PeerAddress::Quic { .. } => TransportType::Quic,
        }
    }
}

/// Peer identity (SPEC_06 §3.1)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerIdentity {
    /// Node identifier
    pub node_id: NodeId,
    /// Node's public key
    pub public_key: PublicKey,
    /// Protocol version
    pub protocol_version: u8,
    /// Capability bitmask
    pub capabilities: u32,
    /// User agent string
    pub user_agent: String,
}

/// Peer information (SPEC_06 §3.3)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerInfo {
    /// Peer's identity
    pub identity: PeerIdentity,
    /// Known addresses
    pub addresses: Vec<PeerAddress>,
    /// Last seen timestamp (UNIX seconds)
    pub last_seen: u64,
    /// Latency in milliseconds (if measured)
    pub latency_ms: Option<u32>,
    /// Number of successful connections
    pub connection_count: u64,
}

/// Message type discriminants (SPEC_06 §5.1)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MessageType {
    // Handshake
    /// Version handshake
    Version = 0x00,
    /// Version acknowledgment
    Verack = 0x01,
    /// Ping for latency
    Ping = 0x02,
    /// Pong response
    Pong = 0x03,

    // Address discovery
    /// Request peer addresses
    GetAddr = 0x10,
    /// Address list response
    Addr = 0x11,

    // Inventory
    /// Inventory announcement
    Inv = 0x20,
    /// Request data
    GetData = 0x21,
    /// Data response
    Data = 0x22,
    /// Data not found
    NotFound = 0x23,

    // Chain Sync (relocated from 0x30-0x34 to avoid SPEC_09 social layer conflict)
    /// Request blocks
    GetBlocks = 0x70,
    /// Blocks response
    Blocks = 0x71,
    /// Request headers
    GetHeaders = 0x72,
    /// Headers response
    Headers = 0x73,
    /// Chain status
    ChainStatus = 0x74,
    /// Request blocks using Bitcoin-style locator
    GetBlocksLocator = 0x78,
    /// Request headers using Bitcoin-style locator (headers-first sync)
    GetHeadersLocator = 0x7A,

    // Gossip
    /// Gossip message
    Gossip = 0x40,

    // Content sync (SPEC_07)
    /// Query if peer has content
    WhoHas = 0x24,
    /// Response indicating peer has content
    IHave = 0x25,
    /// Request content data
    Get = 0x26,
    /// Content data response
    DataContent = 0x27,
    /// Content not found response
    NotFoundContent = 0x28,

    // Fork handling (relocated from 0x50-0x52 to avoid conflict)
    /// Fork announcement
    ForkAnnounce = 0x53,
    /// Fork query
    ForkQuery = 0x54,
    /// Fork info response
    ForkInfo = 0x55,

    // Error handling
    /// Rejection message
    Reject = 0x60,
    /// Alert message
    Alert = 0x61,

    // Block sync (SPEC_08)
    /// Block announcement
    BlockAnnounce = 0x75,
    /// Request specific block
    GetBlock = 0x76,
    /// Block data response
    BlockData = 0x77,

    // Engagement pools (SPEC_03 §7, SPEC_08 §3.3)
    /// Pool announcement (new pool created)
    PoolAnnounce = 0x90,
    /// Pool contribution (PoW work submission)
    PoolContribution = 0x91,
    /// Pool status query/response
    PoolStatus = 0x92,

    // Mempool gossip (action broadcast)
    /// Action announcement (broadcast pending action to peers)
    ActionAnnounce = 0x93,
    /// Request peer's mempool inventory (Bitcoin-style mempool sync)
    GetMempool = 0x94,
    /// Direct-message request announcement — propagate a pending DM request so it
    /// reaches the recipient's node (SPEC: DM delivery). Carries its own PoW +
    /// signature so receiving nodes can verify it without trusting the relay.
    DmRequestAnnounce = 0x96,
    /// Direct-message acceptance announcement — propagate back to the original
    /// requester so their node flips the request to Accepted. Signed by the acceptor.
    DmAcceptAnnounce = 0x97,
    /// Direct-message decline announcement — propagate back to the original requester
    /// so their node marks the request Declined. Signed by the decliner.
    DmDeclineAnnounce = 0x98,

    // DHT (Kademlia) - SPEC_06 §3.8
    /// DHT ping (liveness check)
    DhtPing = 0x80,
    /// DHT pong (ping response)
    DhtPong = 0x81,
    /// DHT find node request
    DhtFindNode = 0x82,
    /// DHT nodes response
    DhtNodes = 0x83,
    /// DHT find value (content providers) request
    DhtFindValue = 0x84,
    /// DHT providers response
    DhtProviders = 0x85,
    /// DHT store (announce content)
    DhtStore = 0x86,
    /// DHT store acknowledgment
    DhtStoreAck = 0x87,

    // Branch-Selective Sync (BRANCH_SELECTIVE_SYNC.md)
    /// Request blocks for a specific branch (filtered sync)
    GetBlocksBranch = 0xA0,
    /// Subscribe to branch announcements
    SubscribeBranch = 0xA1,
    /// Unsubscribe from branch announcements
    UnsubscribeBranch = 0xA2,
    /// Announce new content in a branch
    BranchAnnounce = 0xA3,
    /// Send inventory of branches this peer serves
    BranchInventory = 0xA4,

    // Space Name Resolution (Bug #4)
    /// Request a single space's display metadata
    GetSpaceMeta = 0xC0,
    /// Reply carrying space name, creator pubkey, timestamp
    SpaceMeta = 0xC1,

    // Blocklist Gossip (SPEC_12 §4.6)
    /// Blocklist update (new blocked content)
    BlocklistUpdate = 0xB0,
    /// Blocklist sync (Merkle root exchange)
    BlocklistSync = 0xB1,
    /// Request specific blocklist entries
    BlocklistRequest = 0xB2,

    // Social Layer / Peer Attestation (SPEC_09 §8.2)
    /// Contribution claim (announce contribution for attestation)
    ContributionClaim = 0x30,
    /// Contribution attestation (peer attestation of observed contribution)
    ContributionAttest = 0x31,
    /// Query peer's swimmer level
    LevelQuery = 0x32,
    /// Response with swimmer level
    LevelResponse = 0x33,
    /// Query space health metrics
    SpaceHealthQuery = 0x34,
    /// Response with space health metrics
    SpaceHealthResponse = 0x35,

    // Sponsorship Offers (SPEC_11 §3.11)
    /// Broadcast a new sponsorship offer
    SponsorshipOffer = 0x49,
    /// Submit a claim on an offer
    SponsorshipOfferClaim = 0x4A,
    /// Sponsor's response to a claim (approve/reject)
    SponsorshipClaimResponse = 0x4B,
    /// Query available offers from a peer
    SponsorshipOfferQuery = 0x4C,
    /// Response with list of offers
    SponsorshipOfferList = 0x4D,
}

impl TryFrom<u8> for MessageType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(MessageType::Version),
            0x01 => Ok(MessageType::Verack),
            0x02 => Ok(MessageType::Ping),
            0x03 => Ok(MessageType::Pong),
            0x10 => Ok(MessageType::GetAddr),
            0x11 => Ok(MessageType::Addr),
            0x20 => Ok(MessageType::Inv),
            0x21 => Ok(MessageType::GetData),
            0x22 => Ok(MessageType::Data),
            0x23 => Ok(MessageType::NotFound),
            0x70 => Ok(MessageType::GetBlocks),
            0x71 => Ok(MessageType::Blocks),
            0x72 => Ok(MessageType::GetHeaders),
            0x73 => Ok(MessageType::Headers),
            0x74 => Ok(MessageType::ChainStatus),
            0x40 => Ok(MessageType::Gossip),
            0x24 => Ok(MessageType::WhoHas),
            0x25 => Ok(MessageType::IHave),
            0x26 => Ok(MessageType::Get),
            0x27 => Ok(MessageType::DataContent),
            0x28 => Ok(MessageType::NotFoundContent),
            0x53 => Ok(MessageType::ForkAnnounce),
            0x54 => Ok(MessageType::ForkQuery),
            0x55 => Ok(MessageType::ForkInfo),
            0x60 => Ok(MessageType::Reject),
            0x61 => Ok(MessageType::Alert),
            0x75 => Ok(MessageType::BlockAnnounce),
            0x76 => Ok(MessageType::GetBlock),
            0x77 => Ok(MessageType::BlockData),
            0x78 => Ok(MessageType::GetBlocksLocator),
            0x7A => Ok(MessageType::GetHeadersLocator),
            0x90 => Ok(MessageType::PoolAnnounce),
            0x91 => Ok(MessageType::PoolContribution),
            0x92 => Ok(MessageType::PoolStatus),
            // Mempool gossip
            0x93 => Ok(MessageType::ActionAnnounce),
            0x94 => Ok(MessageType::GetMempool),
            0x96 => Ok(MessageType::DmRequestAnnounce),
            0x97 => Ok(MessageType::DmAcceptAnnounce),
            0x98 => Ok(MessageType::DmDeclineAnnounce),
            // DHT messages
            0x80 => Ok(MessageType::DhtPing),
            0x81 => Ok(MessageType::DhtPong),
            0x82 => Ok(MessageType::DhtFindNode),
            0x83 => Ok(MessageType::DhtNodes),
            0x84 => Ok(MessageType::DhtFindValue),
            0x85 => Ok(MessageType::DhtProviders),
            0x86 => Ok(MessageType::DhtStore),
            0x87 => Ok(MessageType::DhtStoreAck),
            // Branch-selective sync messages
            0xA0 => Ok(MessageType::GetBlocksBranch),
            0xA1 => Ok(MessageType::SubscribeBranch),
            0xA2 => Ok(MessageType::UnsubscribeBranch),
            0xA3 => Ok(MessageType::BranchAnnounce),
            0xA4 => Ok(MessageType::BranchInventory),
            0xC0 => Ok(MessageType::GetSpaceMeta),
            0xC1 => Ok(MessageType::SpaceMeta),
            // Blocklist gossip (SPEC_12 §4.6)
            0xB0 => Ok(MessageType::BlocklistUpdate),
            0xB1 => Ok(MessageType::BlocklistSync),
            0xB2 => Ok(MessageType::BlocklistRequest),
            // Social layer / Peer attestation (SPEC_09 §8.2)
            0x30 => Ok(MessageType::ContributionClaim),
            0x31 => Ok(MessageType::ContributionAttest),
            0x32 => Ok(MessageType::LevelQuery),
            0x33 => Ok(MessageType::LevelResponse),
            0x34 => Ok(MessageType::SpaceHealthQuery),
            0x35 => Ok(MessageType::SpaceHealthResponse),
            // Sponsorship offers (SPEC_11 §3.11)
            0x49 => Ok(MessageType::SponsorshipOffer),
            0x4A => Ok(MessageType::SponsorshipOfferClaim),
            0x4B => Ok(MessageType::SponsorshipClaimResponse),
            0x4C => Ok(MessageType::SponsorshipOfferQuery),
            0x4D => Ok(MessageType::SponsorshipOfferList),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Message envelope (SPEC_06 §3.4)
///
/// Wire format (46-byte header + payload):
/// - magic: 4 bytes ("CSOC")
/// - version: 1 byte
/// - message_type: 1 byte
/// - fork_id: 32 bytes (fork context, zeros for fork-agnostic)
/// - payload_length: 4 bytes (little-endian)
/// - checksum: 4 bytes (first 4 bytes of SHA-256 of payload)
/// - payload: variable length
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageEnvelope {
    /// Magic bytes for framing
    pub magic: [u8; 4],
    /// Protocol version
    pub version: u8,
    /// Message type
    pub message_type: MessageType,
    /// Fork context (SPEC_06 §3.4) - zeros for fork-agnostic messages
    pub fork_id: [u8; 32],
    /// Payload length
    pub payload_length: u32,
    /// Checksum of payload
    pub checksum: [u8; 4],
    /// Message payload
    pub payload: Vec<u8>,
}

impl MessageEnvelope {
    /// Create a new envelope with specified fork ID
    ///
    /// Uses the magic bytes for the active network mode (mainnet/testnet/regtest).
    #[must_use]
    pub fn new(message_type: MessageType, fork_id: [u8; 32], payload: Vec<u8>) -> Self {
        use crate::network::NetworkContext;
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(&payload);
        let checksum = [hash[0], hash[1], hash[2], hash[3]];

        Self {
            magic: NetworkContext::magic_bytes(),
            version: super::constants::PROTOCOL_VERSION,
            message_type,
            fork_id,
            payload_length: payload.len() as u32,
            checksum,
            payload,
        }
    }

    /// Create a new fork-agnostic envelope (fork_id = zeros)
    #[must_use]
    pub fn new_fork_agnostic(message_type: MessageType, payload: Vec<u8>) -> Self {
        Self::new(message_type, [0u8; 32], payload)
    }

    /// Verify the checksum
    #[must_use]
    pub fn verify_checksum(&self) -> bool {
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(&self.payload);
        self.checksum == [hash[0], hash[1], hash[2], hash[3]]
    }

    /// Validate message envelope per SPEC_06 §6.1
    ///
    /// Validates:
    /// - V-MSG-01: Magic bytes MUST match current network mode
    /// - V-MSG-02: Version MUST be supported (currently only 1)
    /// - V-MSG-03: Checksum MUST match SHA-256(payload)[0..4]
    /// - V-MSG-04: Payload length MUST match actual payload
    /// - V-MSG-05: Message type MUST be known (already validated by MessageType enum)
    /// - V-MSG-06: Fork ID validation (zeros allowed for fork-agnostic)
    pub fn validate(&self) -> Result<(), crate::network::WireError> {
        use crate::network::{NetworkContext, WireError};

        // V-MSG-01: Magic bytes MUST match current network mode
        if !NetworkContext::validate_magic(self.magic) {
            return Err(WireError::InvalidMagic(self.magic));
        }

        // V-MSG-02: Version MUST be supported (currently only 1)
        if self.version != 1 {
            return Err(WireError::UnsupportedVersion(self.version));
        }

        // V-MSG-03: Checksum MUST match
        if !self.verify_checksum() {
            return Err(WireError::InvalidChecksum);
        }

        // V-MSG-04: Payload length MUST match
        if self.payload_length != self.payload.len() as u32 {
            return Err(WireError::PayloadLengthMismatch {
                expected: self.payload_length,
                actual: self.payload.len() as u32,
            });
        }

        // V-MSG-05: Already validated via MessageType enum during deserialization
        // V-MSG-06: Fork ID validation - zeros are allowed for fork-agnostic messages
        // Note: Known fork validation deferred to higher layer

        Ok(())
    }

    /// Check if this is a fork-agnostic message (fork_id is all zeros)
    #[must_use]
    pub fn is_fork_agnostic(&self) -> bool {
        self.fork_id == [0u8; 32]
    }
}

/// Sync filter for selective synchronization (SPEC_06 §3.5)
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyncFilter {
    /// Filter by space IDs (empty = all spaces)
    pub space_ids: Vec<super::content::SpaceId>,
    /// Filter by identity IDs (empty = all identities)
    pub identity_ids: Vec<IdentityId>,
    /// Minimum block height
    pub min_height: Option<u64>,
    /// Maximum block height
    pub max_height: Option<u64>,
    /// Only include blocks after this timestamp
    pub after_timestamp: Option<u64>,
}

/// Sync request (SPEC_06 §3.5)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRequest {
    /// Starting block hash
    pub start_hash: BlockHash,
    /// Ending block hash (optional, for range)
    pub end_hash: Option<BlockHash>,
    /// Maximum blocks to return
    pub max_blocks: u32,
    /// Optional filter
    pub filter: Option<SyncFilter>,
}

/// Sync response (SPEC_06 §3.6)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncResponse {
    /// Request ID for matching
    pub request_id: u64,
    /// Block headers (or full blocks depending on request)
    pub headers: Vec<BlockHeader>,
    /// Whether more blocks are available
    pub has_more: bool,
    /// Next block hash for continuation
    pub continuation_hash: Option<BlockHash>,
}

/// Gossip type discriminants (SPEC_06 §3.7)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GossipType {
    /// New block announcement (SPEC_06 §3.7)
    BlockAnnounce = 0x01,
    /// New content announcement
    ContentNew = 0x02,
    /// Request specific content
    ContentRequest = 0x03,
    /// Provide requested content
    ContentResponse = 0x04,
    /// Announce peer availability
    PeerAnnounce = 0x05,
}

impl TryFrom<u8> for GossipType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(GossipType::BlockAnnounce),
            0x02 => Ok(GossipType::ContentNew),
            0x03 => Ok(GossipType::ContentRequest),
            0x04 => Ok(GossipType::ContentResponse),
            0x05 => Ok(GossipType::PeerAnnounce),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Gossip message (SPEC_06 §3.7)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GossipMessage {
    /// Type of gossip
    pub gossip_type: GossipType,
    /// Time-to-live (remaining hops)
    pub ttl: u8,
    /// Message ID for deduplication
    pub message_id: [u8; 32],
    /// Originator node ID
    pub origin: NodeId,
    /// Timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Payload data
    pub payload: Vec<u8>,
    /// Signature from originator
    pub signature: Signature,
}

impl GossipMessage {
    /// Decrement TTL, returns true if message should continue propagating
    pub fn decrement_ttl(&mut self) -> bool {
        if self.ttl > 0 {
            self.ttl -= 1;
            true
        } else {
            false
        }
    }
}

/// DHT record for distributed storage (SPEC_06 §3.8)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DhtRecord {
    /// Key for lookup
    pub key: [u8; 32],
    /// Value data
    pub value: Vec<u8>,
    /// Expiry timestamp (UNIX seconds)
    pub expiry: u64,
    /// Publisher node ID
    pub publisher: NodeId,
    /// Signature from publisher
    pub signature: Signature,
    /// Sequence number for updates
    pub sequence: u64,
}

/// Inventory item type (for Inv/GetData messages) (SPEC_06 §5.2.4)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum InvType {
    /// Block inventory
    Block = 0x01,
    /// Content item inventory
    Content = 0x02,
    /// Identity inventory (SPEC_06 §5.2.4)
    Identity = 0x03,
}

impl TryFrom<u8> for InvType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(InvType::Block),
            0x02 => Ok(InvType::Content),
            0x03 => Ok(InvType::Identity),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Inventory vector (SPEC_06 §5.2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvVector {
    /// Type of item
    pub inv_type: InvType,
    /// Hash of item
    pub hash: [u8; 32],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_type_discriminants() {
        assert_eq!(TransportType::TcpV4 as u8, 0x01);
        assert_eq!(TransportType::TcpV6 as u8, 0x02);
        assert_eq!(TransportType::Tor as u8, 0x03);
        assert_eq!(TransportType::I2p as u8, 0x04);
        assert_eq!(TransportType::Quic as u8, 0x05);
    }

    #[test]
    fn test_capability_bitmask() {
        // Note: No RELAY capability by design - all nodes are equal participants
        let caps = capability::FULL_NODE | capability::BLOCK_PRODUCER | capability::TOR;
        assert!(caps & capability::FULL_NODE != 0);
        assert!(caps & capability::BLOCK_PRODUCER != 0);
        assert!(caps & capability::TOR != 0);
        assert!(caps & capability::MOBILE == 0);
    }

    #[test]
    fn test_message_type_groups() {
        // Handshake: 0x00-0x0F
        assert!((MessageType::Version as u8) < 0x10);
        assert!((MessageType::Pong as u8) < 0x10);

        // Address: 0x10-0x1F
        assert!((MessageType::GetAddr as u8) >= 0x10);
        assert!((MessageType::Addr as u8) < 0x20);

        // Gossip: 0x40-0x4F
        assert_eq!(MessageType::Gossip as u8, 0x40);
    }

    #[test]
    fn test_message_envelope_checksum() {
        let payload = b"test payload".to_vec();
        let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, payload);
        assert!(envelope.verify_checksum());
        assert_eq!(envelope.fork_id, [0u8; 32]); // Fork-agnostic has zeros
    }

    #[test]
    fn test_message_envelope_with_fork_id() {
        let payload = b"test payload".to_vec();
        let fork_id = [0xab; 32];
        let envelope = MessageEnvelope::new(MessageType::Ping, fork_id, payload);
        assert!(envelope.verify_checksum());
        assert_eq!(envelope.fork_id, [0xab; 32]);
    }

    #[test]
    fn test_gossip_message_ttl() {
        let mut msg = GossipMessage {
            gossip_type: GossipType::ContentNew,
            ttl: 3,
            message_id: [0u8; 32],
            origin: NodeId::default(),
            timestamp: 0,
            payload: vec![],
            signature: super::super::identity::Signature::default(),
        };

        assert!(msg.decrement_ttl());
        assert_eq!(msg.ttl, 2);
        assert!(msg.decrement_ttl());
        assert!(msg.decrement_ttl());
        assert!(!msg.decrement_ttl()); // TTL now 0
    }

    #[test]
    fn test_gossip_type_values() {
        assert_eq!(GossipType::BlockAnnounce as u8, 0x01);
        assert_eq!(GossipType::ContentNew as u8, 0x02);
        assert_eq!(GossipType::ContentRequest as u8, 0x03);
        assert_eq!(GossipType::ContentResponse as u8, 0x04);
        assert_eq!(GossipType::PeerAnnounce as u8, 0x05);
    }

    #[test]
    fn test_inv_type_values() {
        assert_eq!(InvType::Block as u8, 0x01);
        assert_eq!(InvType::Content as u8, 0x02);
        assert_eq!(InvType::Identity as u8, 0x03);
    }

    #[test]
    fn test_message_envelope_validation_success() {
        let payload = b"test payload".to_vec();
        let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, payload);
        assert!(envelope.validate().is_ok());
    }

    #[test]
    fn test_message_envelope_invalid_magic() {
        use crate::network::WireError;
        let mut envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![]);
        envelope.magic = [0xFF, 0x00, 0x00, 0x00];
        match envelope.validate() {
            Err(WireError::InvalidMagic(m)) => assert_eq!(m, [0xFF, 0x00, 0x00, 0x00]),
            _ => panic!("expected InvalidMagic error"),
        }
    }

    #[test]
    fn test_message_envelope_invalid_version() {
        use crate::network::WireError;
        let mut envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![]);
        envelope.version = 99;
        match envelope.validate() {
            Err(WireError::UnsupportedVersion(v)) => assert_eq!(v, 99),
            _ => panic!("expected UnsupportedVersion error"),
        }
    }

    #[test]
    fn test_message_envelope_invalid_checksum() {
        use crate::network::WireError;
        let mut envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![1, 2, 3]);
        envelope.checksum[0] ^= 0xFF; // Flip a bit
        match envelope.validate() {
            Err(WireError::InvalidChecksum) => {}
            _ => panic!("expected InvalidChecksum error"),
        }
    }

    #[test]
    fn test_message_envelope_payload_length_mismatch() {
        use crate::network::WireError;
        let mut envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![1, 2, 3]);
        envelope.payload_length = 100; // Wrong length
        match envelope.validate() {
            Err(WireError::PayloadLengthMismatch {
                expected: 100,
                actual: 3,
            }) => {}
            _ => panic!("expected PayloadLengthMismatch error"),
        }
    }

    #[test]
    fn test_message_envelope_is_fork_agnostic() {
        let agnostic = MessageEnvelope::new_fork_agnostic(MessageType::Ping, vec![]);
        assert!(agnostic.is_fork_agnostic());

        let with_fork = MessageEnvelope::new(MessageType::Ping, [0xab; 32], vec![]);
        assert!(!with_fork.is_fork_agnostic());
    }
}
