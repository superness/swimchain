//! Message payload types (SPEC_06 §5.2)
//!
//! This module defines all wire protocol message payloads. Each struct corresponds
//! to a specific message type and can be serialized/deserialized for network transmission.

use crate::types::constants;

/// Compact address for VERSION message (26 bytes)
///
/// Wire format:
/// - transport: 1 byte
/// - address: 16 bytes (IPv6 or IPv4-mapped)
/// - port: 2 bytes (little-endian)
/// - services: 4 bytes (little-endian)
/// - padding: 3 bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactAddr {
    /// Transport type (see TransportType enum)
    pub transport: u8,
    /// IPv6 address or IPv4-mapped IPv6 address
    pub address: [u8; 16],
    /// Port number
    pub port: u16,
    /// Service capabilities bitmask
    pub services: u32,
}

impl Default for CompactAddr {
    fn default() -> Self {
        Self {
            transport: 0x01, // TcpV4
            address: [0u8; 16],
            port: constants::DEFAULT_PORT,
            services: 0,
        }
    }
}

impl CompactAddr {
    /// Decode the 16-byte address + port into a `SocketAddr`. An IPv4-mapped IPv6
    /// address (`::ffff:a.b.c.d`) decodes back to IPv4. Returns None for the
    /// unspecified/zero address (nothing dialable).
    #[must_use]
    pub fn to_socket_addr(&self) -> Option<std::net::SocketAddr> {
        use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
        if self.address == [0u8; 16] || self.port == 0 {
            return None;
        }
        // IPv4-mapped IPv6: first 10 bytes 0, then 0xff 0xff, then 4 IPv4 octets.
        let ip = if self.address[..10] == [0u8; 10]
            && self.address[10] == 0xff
            && self.address[11] == 0xff
        {
            IpAddr::V4(Ipv4Addr::new(
                self.address[12],
                self.address[13],
                self.address[14],
                self.address[15],
            ))
        } else {
            IpAddr::V6(Ipv6Addr::from(self.address))
        };
        Some(SocketAddr::new(ip, self.port))
    }
}

/// HOLE_PUNCH_INTRO (0x99) payload — 50 bytes.
///
/// A well-connected node (typically the seed) sends this to introduce two NAT'd peers
/// to each other for Layer 2 NAT traversal. It carries the *target* peer's node_id and
/// the public endpoint the introducer observed for it. The receiver attempts an
/// outbound dial to that endpoint; when both introduced peers dial at nearly the same
/// moment, the simultaneous outbound SYNs punch each side's NAT mapping.
///
/// This is advisory and unauthenticated beyond "a peer we're connected to suggested we
/// dial this address" — a bogus intro costs at most one failed `connect()`, so no PoW
/// or signature is required. Wire layout: target_node_id[32] ++ address[16] ++ port[2 LE].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HolePunchIntroPayload {
    /// SHA-256 node_id of the peer to connect to (for dedup / already-connected check).
    pub target_node_id: [u8; 32],
    /// The target's observed public endpoint, as IPv4-mapped-IPv6 / IPv6 bytes.
    pub address: [u8; 16],
    /// The target's port.
    pub port: u16,
}

impl HolePunchIntroPayload {
    /// Fixed serialized size: 32 + 16 + 2.
    pub const SIZE: usize = 50;

    /// Build an intro for `target_node_id` observed at `endpoint`.
    pub fn new(target_node_id: [u8; 32], endpoint: std::net::SocketAddr) -> Self {
        use std::net::IpAddr;
        let address = match endpoint.ip() {
            IpAddr::V4(v4) => {
                // IPv4-mapped IPv6: ::ffff:a.b.c.d
                let mut a = [0u8; 16];
                a[10] = 0xff;
                a[11] = 0xff;
                a[12..16].copy_from_slice(&v4.octets());
                a
            }
            IpAddr::V6(v6) => v6.octets(),
        };
        Self {
            target_node_id,
            address,
            port: endpoint.port(),
        }
    }

    /// Serialize to a fixed 50-byte buffer.
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut out = [0u8; Self::SIZE];
        out[0..32].copy_from_slice(&self.target_node_id);
        out[32..48].copy_from_slice(&self.address);
        out[48..50].copy_from_slice(&self.port.to_le_bytes());
        out
    }

    /// Parse from bytes (accepts a longer buffer, reads the first 50 bytes).
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut target_node_id = [0u8; 32];
        target_node_id.copy_from_slice(&bytes[0..32]);
        let mut address = [0u8; 16];
        address.copy_from_slice(&bytes[32..48]);
        let port = u16::from_le_bytes([bytes[48], bytes[49]]);
        Some(Self {
            target_node_id,
            address,
            port,
        })
    }

    /// Decode the target endpoint into a dialable `SocketAddr` (None if zero addr/port).
    pub fn endpoint(&self) -> Option<std::net::SocketAddr> {
        CompactAddr {
            transport: 0x02,
            address: self.address,
            port: self.port,
            services: 0,
        }
        .to_socket_addr()
    }
}

/// Wire address for ADDR message (75 bytes) (SPEC_06 §5.2.3)
///
/// Wire format:
/// - transport: 1 byte
/// - address: 64 bytes (zero-padded)
/// - port: 2 bytes (little-endian)
/// - services: 4 bytes (little-endian)
/// - last_seen: 4 bytes (little-endian, UNIX timestamp)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WireAddr {
    /// Transport type (see TransportType enum)
    pub transport: u8,
    /// Address bytes (zero-padded to 64 bytes)
    pub address: [u8; 64],
    /// Port number
    pub port: u16,
    /// Service capabilities bitmask
    pub services: u32,
    /// Last seen timestamp (UNIX seconds)
    pub last_seen: u32,
}

impl Default for WireAddr {
    fn default() -> Self {
        Self {
            transport: 0x01, // TcpV4
            address: [0u8; 64],
            port: constants::DEFAULT_PORT,
            services: 0,
            last_seen: 0,
        }
    }
}

/// VERSION payload (SPEC_06 §5.2.1)
///
/// Sent as the first message when establishing a connection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionPayload {
    /// Protocol version (current: 1)
    pub protocol_version: u32,
    /// Node services bitmask (capability flags)
    pub node_services: u64,
    /// Timestamp of message creation (UNIX seconds)
    pub timestamp: u64,
    /// Sender's address info
    pub sender_addr: CompactAddr,
    /// Receiver's address info (as seen by sender)
    pub receiver_addr: CompactAddr,
    /// Random nonce for connection deduplication
    pub nonce: u64,
    /// User agent string (max 256 bytes)
    pub user_agent: String,
    /// Sender's current block height
    pub start_height: u32,
    /// Whether the node wants to receive gossip
    pub relay: bool,
    /// Sender's Ed25519 public key (SPEC_06 §128). Receiver computes
    /// `node_id = SHA-256(public_key)`.
    pub public_key: [u8; 32],
}

impl Default for VersionPayload {
    fn default() -> Self {
        Self {
            protocol_version: constants::PROTOCOL_VERSION as u32,
            node_services: 0,
            timestamp: 0,
            sender_addr: CompactAddr::default(),
            receiver_addr: CompactAddr::default(),
            nonce: 0,
            user_agent: String::new(),
            start_height: 0,
            relay: true,
            public_key: [0u8; 32],
        }
    }
}

/// PING/PONG payload (SPEC_06 §5.2)
///
/// Used for latency measurement and keepalive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PingPongPayload {
    /// Random nonce to match ping with pong
    pub nonce: u64,
}

impl PingPongPayload {
    /// Create a new ping/pong with the given nonce
    pub const fn new(nonce: u64) -> Self {
        Self { nonce }
    }
}

/// GETADDR payload (SPEC_06 §5.2.2)
///
/// Request peer addresses from a node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetAddrPayload {
    /// Fork ID filter (zeros for any fork)
    pub fork_id: [u8; 32],
    /// Maximum number of addresses to return
    pub max_addrs: u16,
}

impl Default for GetAddrPayload {
    fn default() -> Self {
        Self {
            fork_id: [0u8; 32],
            max_addrs: 1000,
        }
    }
}

/// ADDR payload (SPEC_06 §5.2.3)
///
/// Response containing peer addresses.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AddrPayload {
    /// List of peer addresses (max 1000 per V-PEER-04)
    pub addresses: Vec<WireAddr>,
}

/// Inventory item (33 bytes) (SPEC_06 §5.2.4)
///
/// Used in INV, GETDATA, and NOTFOUND messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InvItem {
    /// Type of inventory item (Block=1, Content=2, Identity=3)
    pub inv_type: u8,
    /// Hash of the item
    pub hash: [u8; 32],
}

impl InvItem {
    /// Create a new inventory item
    pub const fn new(inv_type: u8, hash: [u8; 32]) -> Self {
        Self { inv_type, hash }
    }

    /// Create a block inventory item
    pub const fn block(hash: [u8; 32]) -> Self {
        Self::new(0x01, hash)
    }

    /// Create a content inventory item
    pub const fn content(hash: [u8; 32]) -> Self {
        Self::new(0x02, hash)
    }

    /// Create an identity inventory item
    pub const fn identity(hash: [u8; 32]) -> Self {
        Self::new(0x03, hash)
    }

    /// Create a mempool action inventory item
    pub const fn action(hash: [u8; 32]) -> Self {
        Self::new(0x04, hash)
    }

    /// Check if this is an action inventory item
    pub const fn is_action(&self) -> bool {
        self.inv_type == 0x04
    }
}

/// GETMEMPOOL payload - request peer's mempool inventory
///
/// Empty payload - just signals the request.
/// Peer responds with INV containing action hashes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GetMempoolPayload;

/// INV/GETDATA payload (SPEC_06 §5.2.4-5)
///
/// INV announces available inventory; GETDATA requests specific items.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct InvPayload {
    /// List of inventory items (max 50000)
    pub items: Vec<InvItem>,
}

/// GETBLOCKS payload (SPEC_06 §5.2.6)
///
/// Request blocks in a height range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GetBlocksPayload {
    /// Starting block height
    pub start_height: u64,
    /// Ending block height
    pub end_height: u64,
    /// Whether to include content blocks
    pub include_content: bool,
    /// Maximum number of blocks to return
    pub max_blocks: u16,
}

impl Default for GetBlocksPayload {
    fn default() -> Self {
        Self {
            start_height: 0,
            end_height: u64::MAX,
            include_content: false,
            max_blocks: 500,
        }
    }
}

// === GETBLOCKS_LOCATOR (Bitcoin-style locator) ===

/// GETBLOCKS_LOCATOR payload
///
/// Request blocks using a Bitcoin-style locator pattern. The locator contains
/// block hashes at exponentially increasing intervals from the requester's tip,
/// allowing the responder to find the common ancestor efficiently.
///
/// Wire format:
/// - locator_count: u8 (max 32 hashes)
/// - locator_hashes: [32; locator_count] (variable)
/// - stop_hash: [u8; 32] (all zeros = no limit)
/// - max_blocks: u16
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetBlocksLocatorPayload {
    /// Block hashes at exponential intervals from tip
    /// Pattern: [tip, tip-1, tip-2, tip-4, tip-8, ..., genesis]
    pub locator_hashes: Vec<[u8; 32]>,
    /// Stop at this hash (all zeros = continue to tip)
    pub stop_hash: [u8; 32],
    /// Maximum number of blocks to return
    pub max_blocks: u16,
}

impl Default for GetBlocksLocatorPayload {
    fn default() -> Self {
        Self {
            locator_hashes: Vec::new(),
            stop_hash: [0u8; 32],
            max_blocks: 500,
        }
    }
}

impl GetBlocksLocatorPayload {
    /// Maximum number of locator hashes allowed
    pub const MAX_LOCATOR_HASHES: usize = 32;

    /// Create a new locator request
    #[must_use]
    pub fn new(locator_hashes: Vec<[u8; 32]>, max_blocks: u16) -> Self {
        Self {
            locator_hashes,
            stop_hash: [0u8; 32],
            max_blocks,
        }
    }

    /// Create with a stop hash
    #[must_use]
    pub fn with_stop_hash(mut self, stop_hash: [u8; 32]) -> Self {
        self.stop_hash = stop_hash;
        self
    }
}

/// Variable-length serialized block
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SerializedBlock {
    /// Raw block data
    pub data: Vec<u8>,
}

/// BLOCKS payload (SPEC_06 §5.2.7)
///
/// Response containing requested blocks.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BlocksPayload {
    /// List of serialized blocks
    pub blocks: Vec<SerializedBlock>,
}

// === SPEC_08: Block Announcement Protocol ===

/// BLOCK_ANNOUNCE payload (SPEC_08)
///
/// Announce a new root block to peers. Contains the root block hash and
/// enough information for peers to decide whether to request the full block.
///
/// Wire format:
/// - block_hash[32]: Hash of the root block
/// - height: 8 bytes (little-endian)
/// - total_pow: 8 bytes (little-endian)
/// - space_block_count: 4 bytes (little-endian)
/// - timestamp: 8 bytes (little-endian)
/// Total: 60 bytes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlockAnnouncePayload {
    /// Hash of the root block being announced
    pub block_hash: [u8; 32],
    /// Chain height of this block
    pub height: u64,
    /// Total PoW aggregated in this block
    pub total_pow: u64,
    /// Number of space blocks in this root block
    pub space_block_count: u32,
    /// Block creation timestamp (UNIX seconds)
    pub timestamp: u64,
}

impl Default for BlockAnnouncePayload {
    fn default() -> Self {
        Self {
            block_hash: [0u8; 32],
            height: 0,
            total_pow: 0,
            space_block_count: 0,
            timestamp: 0,
        }
    }
}

impl BlockAnnouncePayload {
    /// Wire size in bytes
    pub const SIZE: usize = 60; // 32 + 8 + 8 + 4 + 8

    /// Create a new block announce payload
    #[must_use]
    pub fn new(
        block_hash: [u8; 32],
        height: u64,
        total_pow: u64,
        space_block_count: u32,
        timestamp: u64,
    ) -> Self {
        Self {
            block_hash,
            height,
            total_pow,
            space_block_count,
            timestamp,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.block_hash);
        bytes[32..40].copy_from_slice(&self.height.to_le_bytes());
        bytes[40..48].copy_from_slice(&self.total_pow.to_le_bytes());
        bytes[48..52].copy_from_slice(&self.space_block_count.to_le_bytes());
        bytes[52..60].copy_from_slice(&self.timestamp.to_le_bytes());
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut block_hash = [0u8; 32];
        block_hash.copy_from_slice(&bytes[0..32]);

        Some(Self {
            block_hash,
            height: u64::from_le_bytes(bytes[32..40].try_into().ok()?),
            total_pow: u64::from_le_bytes(bytes[40..48].try_into().ok()?),
            space_block_count: u32::from_le_bytes(bytes[48..52].try_into().ok()?),
            timestamp: u64::from_le_bytes(bytes[52..60].try_into().ok()?),
        })
    }
}

/// GET_BLOCK payload (SPEC_08)
///
/// Request a specific block by hash.
///
/// Wire format: block_hash[32] = 32 bytes total
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GetBlockPayload {
    /// Hash of the block to retrieve
    pub block_hash: [u8; 32],
}

impl GetBlockPayload {
    /// Wire size in bytes
    pub const SIZE: usize = 32;

    /// Create a new get block payload
    #[must_use]
    pub const fn new(block_hash: [u8; 32]) -> Self {
        Self { block_hash }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        self.block_hash
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut block_hash = [0u8; 32];
        block_hash.copy_from_slice(&bytes[..32]);
        Some(Self { block_hash })
    }
}

/// BLOCK_DATA payload (SPEC_08)
///
/// Send block data in response to GET_BLOCK. Contains the serialized root block,
/// space blocks, and content blocks.
///
/// Wire format:
/// - block_hash[32]: Hash of the root block
/// - root_block_len: 4 bytes (little-endian)
/// - root_block_data: variable bytes
/// - space_block_count: 4 bytes (little-endian)
/// - space_blocks: (4-byte len + data) per block
/// - content_block_count: 4 bytes (little-endian)
/// - content_blocks: (4-byte len + data) per block
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockDataPayload {
    /// Hash of the root block
    pub block_hash: [u8; 32],
    /// Serialized root block
    pub root_block: Vec<u8>,
    /// Serialized space blocks
    pub space_blocks: Vec<Vec<u8>>,
    /// Serialized content blocks
    pub content_blocks: Vec<Vec<u8>>,
}

impl Default for BlockDataPayload {
    fn default() -> Self {
        Self {
            block_hash: [0u8; 32],
            root_block: Vec::new(),
            space_blocks: Vec::new(),
            content_blocks: Vec::new(),
        }
    }
}

impl BlockDataPayload {
    /// Minimum wire size (hash + root_len + space_count + content_count)
    pub const MIN_SIZE: usize = 32 + 4 + 4 + 4; // 44 bytes

    /// Create a new block data payload
    #[must_use]
    pub fn new(block_hash: [u8; 32]) -> Self {
        Self {
            block_hash,
            ..Default::default()
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(Self::MIN_SIZE);

        buf.extend_from_slice(&self.block_hash);
        buf.extend_from_slice(&(self.root_block.len() as u32).to_le_bytes());
        buf.extend_from_slice(&self.root_block);
        buf.extend_from_slice(&(self.space_blocks.len() as u32).to_le_bytes());
        for sb in &self.space_blocks {
            buf.extend_from_slice(&(sb.len() as u32).to_le_bytes());
            buf.extend_from_slice(sb);
        }
        buf.extend_from_slice(&(self.content_blocks.len() as u32).to_le_bytes());
        for cb in &self.content_blocks {
            buf.extend_from_slice(&(cb.len() as u32).to_le_bytes());
            buf.extend_from_slice(cb);
        }

        buf
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::MIN_SIZE {
            return None;
        }

        let mut block_hash = [0u8; 32];
        block_hash.copy_from_slice(&bytes[0..32]);

        let root_block_len = u32::from_le_bytes(bytes[32..36].try_into().ok()?) as usize;
        if bytes.len() < 36 + root_block_len {
            return None;
        }
        let root_block = bytes[36..36 + root_block_len].to_vec();

        let mut offset = 36 + root_block_len;
        if bytes.len() < offset + 4 {
            return None;
        }

        let space_block_count =
            u32::from_le_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
        offset += 4;

        // Sanity check to prevent excessive allocation
        if space_block_count > 10000 {
            return None;
        }

        let mut space_blocks = Vec::with_capacity(space_block_count);
        for _ in 0..space_block_count {
            if bytes.len() < offset + 4 {
                return None;
            }
            let len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
            offset += 4;
            if bytes.len() < offset + len {
                return None;
            }
            space_blocks.push(bytes[offset..offset + len].to_vec());
            offset += len;
        }

        if bytes.len() < offset + 4 {
            return None;
        }
        let content_block_count =
            u32::from_le_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
        offset += 4;

        // Sanity check
        if content_block_count > 100000 {
            return None;
        }

        let mut content_blocks = Vec::with_capacity(content_block_count);
        for _ in 0..content_block_count {
            if bytes.len() < offset + 4 {
                return None;
            }
            let len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().ok()?) as usize;
            offset += 4;
            if bytes.len() < offset + len {
                return None;
            }
            content_blocks.push(bytes[offset..offset + len].to_vec());
            offset += len;
        }

        Some(Self {
            block_hash,
            root_block,
            space_blocks,
            content_blocks,
        })
    }
}

/// GETHEADERS payload
///
/// Request block headers in a height range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GetHeadersPayload {
    /// Starting block height
    pub start_height: u64,
    /// Ending block height
    pub end_height: u64,
    /// Maximum number of headers to return
    pub max_headers: u16,
}

impl Default for GetHeadersPayload {
    fn default() -> Self {
        Self {
            start_height: 0,
            end_height: u64::MAX,
            max_headers: 2000,
        }
    }
}

/// HEADERS payload
///
/// Response containing block headers.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HeadersPayload {
    /// List of serialized headers
    pub headers: Vec<SerializedBlock>,
}

// === GETHEADERS_LOCATOR (Bitcoin-style headers-first sync) ===

/// GETHEADERS_LOCATOR payload
///
/// Request headers using a Bitcoin-style locator pattern. Similar to
/// GETBLOCKS_LOCATOR but returns lightweight headers instead of full blocks.
/// This enables headers-first sync where PoW is verified before downloading
/// full block content.
///
/// Wire format:
/// - locator_count: u8 (max 32 hashes)
/// - locator_hashes: [32; locator_count] (variable)
/// - stop_hash: [u8; 32] (all zeros = no limit)
/// - max_headers: u16
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetHeadersLocatorPayload {
    /// Block hashes at exponential intervals from tip
    /// Pattern: [tip, tip-1, tip-2, tip-4, tip-8, ..., genesis]
    pub locator_hashes: Vec<[u8; 32]>,
    /// Stop at this hash (all zeros = continue to tip)
    pub stop_hash: [u8; 32],
    /// Maximum number of headers to return
    pub max_headers: u16,
}

impl Default for GetHeadersLocatorPayload {
    fn default() -> Self {
        Self {
            locator_hashes: Vec::new(),
            stop_hash: [0u8; 32],
            max_headers: 2000,
        }
    }
}

impl GetHeadersLocatorPayload {
    /// Maximum number of locator hashes allowed
    pub const MAX_LOCATOR_HASHES: usize = 32;

    /// Create a new locator request for headers
    #[must_use]
    pub fn new(locator_hashes: Vec<[u8; 32]>, max_headers: u16) -> Self {
        Self {
            locator_hashes,
            stop_hash: [0u8; 32],
            max_headers,
        }
    }

    /// Create with a stop hash
    #[must_use]
    pub fn with_stop_hash(mut self, stop_hash: [u8; 32]) -> Self {
        self.stop_hash = stop_hash;
        self
    }
}

/// CHAINSTATUS payload (SPEC_06 §5.2.8)
///
/// Periodic chain status announcement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ChainStatusPayload {
    /// Current chain height
    pub height: u64,
    /// Hash of tip block
    pub tip_hash: [u8; 32],
    /// Cumulative proof of work
    pub cumulative_work: u64,
    /// Number of pending content items
    pub pending_content_count: u32,
    /// Timestamp of status (UNIX seconds)
    pub timestamp: u64,
}

/// GOSSIP payload (SPEC_06 §5.2.9)
///
/// Gossip message for content/block announcements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GossipPayload {
    /// Gossip type (BlockAnnounce=1, ContentNew=2, etc.)
    pub gossip_type: u8,
    /// Content/block ID being gossiped
    pub content_id: [u8; 32],
    /// Timestamp of gossip (UNIX seconds)
    pub timestamp: u64,
    /// Time-to-live (remaining hops)
    pub ttl: u8,
    /// Optional attached payload data
    pub payload: Option<Vec<u8>>,
}

impl Default for GossipPayload {
    fn default() -> Self {
        Self {
            gossip_type: 0x01,
            content_id: [0u8; 32],
            timestamp: 0,
            ttl: crate::types::constants::GOSSIP_TTL,
            payload: None,
        }
    }
}

/// Rejection codes (SPEC_06 §5.2.10)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RejectionCode {
    /// Message was malformed
    Malformed = 0x01,
    /// Message was invalid (e.g., invalid signature)
    Invalid = 0x02,
    /// Message is obsolete (e.g., old protocol version)
    Obsolete = 0x03,
    /// Duplicate message
    Duplicate = 0x04,
    /// Requested item not found
    NotFound = 0x05,
    /// Rate limited
    RateLimited = 0x06,
    /// Peer is banned
    Banned = 0x07,
}

impl TryFrom<u8> for RejectionCode {
    type Error = super::WireError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(RejectionCode::Malformed),
            0x02 => Ok(RejectionCode::Invalid),
            0x03 => Ok(RejectionCode::Obsolete),
            0x04 => Ok(RejectionCode::Duplicate),
            0x05 => Ok(RejectionCode::NotFound),
            0x06 => Ok(RejectionCode::RateLimited),
            0x07 => Ok(RejectionCode::Banned),
            _ => Err(super::WireError::InvalidEnumValue {
                enum_name: "RejectionCode",
                value,
            }),
        }
    }
}

/// REJECT payload (SPEC_06 §5.2.10)
///
/// Sent when a message is rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RejectPayload {
    /// Type of rejected message
    pub rejected_type: u8,
    /// Rejection reason code
    pub code: RejectionCode,
    /// Human-readable reason (max 256 bytes)
    pub reason: String,
    /// Hash of rejected item (if applicable)
    pub hash: Option<[u8; 32]>,
}

impl Default for RejectPayload {
    fn default() -> Self {
        Self {
            rejected_type: 0,
            code: RejectionCode::Invalid,
            reason: String::new(),
            hash: None,
        }
    }
}

/// NOTFOUND payload
///
/// Response when requested inventory items are not available.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct NotFoundPayload {
    /// List of items that were not found
    pub items: Vec<InvItem>,
}

/// DATA payload
///
/// Response containing requested data.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DataPayload {
    /// Raw data
    pub data: Vec<u8>,
}

/// ALERT payload
///
/// Network-wide alert message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlertPayload {
    /// Alert message (max 256 bytes)
    pub message: String,
    /// Signature from authorized key
    pub signature: [u8; 64],
}

impl Default for AlertPayload {
    fn default() -> Self {
        Self {
            message: String::new(),
            signature: [0u8; 64],
        }
    }
}

/// FORKANNOUNCE payload
///
/// Announce a new fork.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ForkAnnouncePayload {
    /// Fork identifier
    pub fork_id: [u8; 32],
}

/// FORKQUERY payload
///
/// Request information about a fork.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ForkQueryPayload {
    /// Fork identifier
    pub fork_id: [u8; 32],
}

// === SPEC_07: Content Retrieval (§4) ===

/// WHO_HAS payload (SPEC_07 §4)
///
/// Query for content by hash. Sent when a node wants to find peers who have content.
/// Wire format: hash[32] = 32 bytes total
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WhoHasPayload {
    /// SHA-256 hash of content being queried
    pub hash: [u8; 32],
}

impl WhoHasPayload {
    /// Create a new WHO_HAS payload for the given hash
    #[must_use]
    pub const fn new(hash: [u8; 32]) -> Self {
        Self { hash }
    }
}

/// I_HAVE payload (SPEC_07 §4)
///
/// Response declaring content availability. Sent in response to WHO_HAS when peer has the content.
/// Wire format: hash[32] + provider_id[32] = 64 bytes total
///
/// The provider_id field indicates which peer actually has the content. When a node responds
/// directly about its own content, provider_id equals the sender's peer_id. When a relay node
/// forwards I_HAVE on behalf of another node, provider_id contains the actual content owner's
/// peer_id so the requester can connect directly to them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct IHavePayload {
    /// SHA-256 hash of content we have
    pub hash: [u8; 32],
    /// Peer ID of the node that actually has the content (may be different from message sender for relays)
    pub provider_id: [u8; 32],
}

impl IHavePayload {
    /// Create a new I_HAVE payload for the given hash with self as provider
    #[must_use]
    pub const fn new(hash: [u8; 32]) -> Self {
        Self {
            hash,
            provider_id: [0u8; 32],
        }
    }

    /// Create a new I_HAVE payload with explicit provider ID (for relays)
    #[must_use]
    pub const fn with_provider(hash: [u8; 32], provider_id: [u8; 32]) -> Self {
        Self { hash, provider_id }
    }

    /// Check if this is a self-announcement (provider_id is zero)
    #[must_use]
    pub fn is_self_announcement(&self) -> bool {
        self.provider_id == [0u8; 32]
    }
}

/// GET payload (SPEC_07 §4)
///
/// Request content by hash. Sent to a peer that responded with I_HAVE to retrieve actual content.
/// Wire format: hash[32] = 32 bytes total
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GetPayload {
    /// SHA-256 hash of content to retrieve
    pub hash: [u8; 32],
}

impl GetPayload {
    /// Create a new GET payload for the given hash
    #[must_use]
    pub const fn new(hash: [u8; 32]) -> Self {
        Self { hash }
    }
}

/// FORKINFO payload
///
/// Response with fork information.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ForkInfoPayload {
    /// Fork identifier
    pub fork_id: [u8; 32],
    /// Fork information data
    pub info: Vec<u8>,
}

// === SPEC_09: Peer Attestation Protocol (§11) ===
// NOTE: ContributionClaimPayload and ContributionAttestPayload have been removed.
// The peer attestation protocol that used crate::contribution::types::ContributionRecord
// and crate::attestation::types::Attestation has been deprecated as part of the
// level system removal.

// === SPEC_09: Swimmer Level Protocol (§3, §11) ===

/// LEVEL_QUERY payload (SPEC_09 §11)
///
/// Query for an identity's swimmer level. Used to retrieve level info for a specific identity.
///
/// Wire format: identity[32] = 32 bytes total
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LevelQueryPayload {
    /// The identity (public key) to query level for
    pub identity: [u8; 32],
}

impl LevelQueryPayload {
    /// Wire size: identity[32] = 32 bytes
    pub const SIZE: usize = 32;

    /// Create a new level query payload
    #[must_use]
    pub const fn new(identity: [u8; 32]) -> Self {
        Self { identity }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        self.identity
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut identity = [0u8; 32];
        identity.copy_from_slice(&bytes[..32]);
        Some(Self { identity })
    }
}

/// LEVEL_RESPONSE payload (SPEC_09 §11)
///
/// Response containing swimmer level information. Sent in response to LEVEL_QUERY.
///
/// Wire format:
/// - identity[32]: 32 bytes
/// - level: 1 byte (SwimmerLevel as u8)
/// - streak: 2 bytes (little-endian)
/// - bandwidth_30d_gb: 8 bytes (little-endian)
/// - uptime_ratio: 2 bytes (little-endian, 0-10000)
/// - lifetime_bandwidth_gb: 8 bytes (little-endian)
/// Total: 53 bytes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LevelResponsePayload {
    /// The identity (public key) this level is for
    pub identity: [u8; 32],
    /// Swimmer level (0-5, see SwimmerLevel enum)
    pub level: u8,
    /// Current streak in days
    pub streak: u16,
    /// Bandwidth served in last 30 days (GB)
    pub bandwidth_30d_gb: u64,
    /// Uptime ratio (0-10000, representing 0.00%-100.00%)
    pub uptime_ratio: u16,
    /// Lifetime bandwidth served (GB)
    pub lifetime_bandwidth_gb: u64,
}

impl Default for LevelResponsePayload {
    fn default() -> Self {
        Self {
            identity: [0u8; 32],
            level: 0, // NewSwimmer
            streak: 0,
            bandwidth_30d_gb: 0,
            uptime_ratio: 0,
            lifetime_bandwidth_gb: 0,
        }
    }
}

impl LevelResponsePayload {
    /// Wire size: identity[32] + level[1] + streak[2] + bandwidth_30d_gb[8] + uptime_ratio[2] + lifetime_bandwidth_gb[8] = 53 bytes
    pub const SIZE: usize = 53;

    /// Create a new level response payload
    #[must_use]
    pub fn new(
        identity: [u8; 32],
        level: u8,
        streak: u16,
        bandwidth_30d_gb: u64,
        uptime_ratio: u16,
        lifetime_bandwidth_gb: u64,
    ) -> Self {
        Self {
            identity,
            level,
            streak,
            bandwidth_30d_gb,
            uptime_ratio,
            lifetime_bandwidth_gb,
        }
    }

    /// Get the wire size of this payload
    pub const fn wire_size() -> usize {
        Self::SIZE
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];

        bytes[0..32].copy_from_slice(&self.identity);
        bytes[32] = self.level;
        bytes[33..35].copy_from_slice(&self.streak.to_le_bytes());
        bytes[35..43].copy_from_slice(&self.bandwidth_30d_gb.to_le_bytes());
        bytes[43..45].copy_from_slice(&self.uptime_ratio.to_le_bytes());
        bytes[45..53].copy_from_slice(&self.lifetime_bandwidth_gb.to_le_bytes());

        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut identity = [0u8; 32];
        identity.copy_from_slice(&bytes[0..32]);

        Some(Self {
            identity,
            level: bytes[32],
            streak: u16::from_le_bytes(bytes[33..35].try_into().ok()?),
            bandwidth_30d_gb: u64::from_le_bytes(bytes[35..43].try_into().ok()?),
            uptime_ratio: u16::from_le_bytes(bytes[43..45].try_into().ok()?),
            lifetime_bandwidth_gb: u64::from_le_bytes(bytes[45..53].try_into().ok()?),
        })
    }
}

// === SPACE_HEALTH_QUERY/RESPONSE (SPEC_09 §11) ===

/// SPACE_HEALTH_QUERY payload (SPEC_09 §11)
///
/// Query for a space's health indicators. Sent to request health data.
///
/// Wire format:
/// - space_id[16]: 16 bytes
/// Total: 16 bytes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpaceHealthQueryPayload {
    /// The space identifier to query health for
    pub space_id: [u8; 16],
}

impl SpaceHealthQueryPayload {
    /// Wire size in bytes
    pub const SIZE: usize = 16;

    /// Create a new space health query payload
    #[must_use]
    pub const fn new(space_id: [u8; 16]) -> Self {
        Self { space_id }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; 16] {
        self.space_id
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 16 {
            return None;
        }
        let mut space_id = [0u8; 16];
        space_id.copy_from_slice(&bytes[..16]);
        Some(Self { space_id })
    }
}

/// SPACE_HEALTH_RESPONSE payload (SPEC_09 §11)
///
/// Response containing space health information. Sent in response to SPACE_HEALTH_QUERY.
///
/// Wire format:
/// - space_id[16]: 16 bytes
/// - active_swimmers: 4 bytes (little-endian)
/// - last_sync_age_secs: 8 bytes (little-endian)
/// - posts_at_risk: 4 bytes (little-endian)
/// - health_score: 1 byte
/// - contributor_count: 4 bytes (little-endian)
/// - contributors[]: contributor_count * SpaceContributorPayload (50 bytes each)
///
/// Minimum size: 37 bytes (no contributors)
/// Maximum practical size: 37 + 10 * 50 = 537 bytes (10 contributors)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceHealthResponsePayload {
    /// Space identifier
    pub space_id: [u8; 16],
    /// Number of active swimmers (Level >= Regular, active in 7 days)
    pub active_swimmers: u32,
    /// Seconds since last sync was available
    pub last_sync_age_secs: u64,
    /// Number of posts at risk of decay
    pub posts_at_risk: u32,
    /// Health score (0-100)
    pub health_score: u8,
    /// Top contributors for this space
    pub contributors: Vec<SpaceContributorPayload>,
}

impl Default for SpaceHealthResponsePayload {
    fn default() -> Self {
        Self {
            space_id: [0u8; 16],
            active_swimmers: 0,
            last_sync_age_secs: 0,
            posts_at_risk: 0,
            health_score: 30,
            contributors: Vec::new(),
        }
    }
}

impl SpaceHealthResponsePayload {
    /// Minimum wire size (no contributors)
    pub const MIN_SIZE: usize = 37; // 16 + 4 + 8 + 4 + 1 + 4

    /// Create a new space health response payload
    #[must_use]
    pub fn new(space_id: [u8; 16]) -> Self {
        Self {
            space_id,
            ..Default::default()
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(
            Self::MIN_SIZE + self.contributors.len() * SpaceContributorPayload::SIZE,
        );

        buf.extend_from_slice(&self.space_id);
        buf.extend_from_slice(&self.active_swimmers.to_le_bytes());
        buf.extend_from_slice(&self.last_sync_age_secs.to_le_bytes());
        buf.extend_from_slice(&self.posts_at_risk.to_le_bytes());
        buf.push(self.health_score);
        buf.extend_from_slice(&(self.contributors.len() as u32).to_le_bytes());

        for c in &self.contributors {
            buf.extend_from_slice(&c.to_bytes());
        }

        buf
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::MIN_SIZE {
            return None;
        }

        let mut space_id = [0u8; 16];
        space_id.copy_from_slice(&bytes[..16]);

        let active_swimmers = u32::from_le_bytes(bytes[16..20].try_into().ok()?);
        let last_sync_age_secs = u64::from_le_bytes(bytes[20..28].try_into().ok()?);
        let posts_at_risk = u32::from_le_bytes(bytes[28..32].try_into().ok()?);
        let health_score = bytes[32];
        let contributor_count = u32::from_le_bytes(bytes[33..37].try_into().ok()?) as usize;

        // Sanity check to prevent excessive allocation
        if contributor_count > 1000 {
            return None;
        }

        let expected_size = Self::MIN_SIZE + contributor_count * SpaceContributorPayload::SIZE;
        if bytes.len() < expected_size {
            return None;
        }

        let mut contributors = Vec::with_capacity(contributor_count);
        let mut offset = 37;

        for _ in 0..contributor_count {
            if let Some(c) = SpaceContributorPayload::from_bytes(
                &bytes[offset..offset + SpaceContributorPayload::SIZE],
            ) {
                contributors.push(c);
                offset += SpaceContributorPayload::SIZE;
            } else {
                return None;
            }
        }

        Some(Self {
            space_id,
            active_swimmers,
            last_sync_age_secs,
            posts_at_risk,
            health_score,
            contributors,
        })
    }
}

/// Contributor data within a SPACE_HEALTH_RESPONSE.
///
/// Wire format:
/// - identity[32]: 32 bytes
/// - bandwidth_served_bytes: 8 bytes (little-endian)
/// - uptime_ratio: 2 bytes (little-endian, 0-10000)
/// - contribution_score: 8 bytes (little-endian)
/// Total: 50 bytes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpaceContributorPayload {
    /// Ed25519 public key
    pub identity: [u8; 32],
    /// Bytes served for this space in current period
    pub bandwidth_served_bytes: u64,
    /// Uptime ratio (0-10000, representing 0.00%-100.00%)
    pub uptime_ratio: u16,
    /// Computed contribution score
    pub contribution_score: u64,
}

impl SpaceContributorPayload {
    /// Wire size in bytes
    pub const SIZE: usize = 50; // 32 + 8 + 2 + 8

    /// Create a new contributor payload
    #[must_use]
    pub fn new(identity: [u8; 32]) -> Self {
        Self {
            identity,
            bandwidth_served_bytes: 0,
            uptime_ratio: 0,
            contribution_score: 0,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; 50] {
        let mut bytes = [0u8; 50];
        bytes[0..32].copy_from_slice(&self.identity);
        bytes[32..40].copy_from_slice(&self.bandwidth_served_bytes.to_le_bytes());
        bytes[40..42].copy_from_slice(&self.uptime_ratio.to_le_bytes());
        bytes[42..50].copy_from_slice(&self.contribution_score.to_le_bytes());
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut identity = [0u8; 32];
        identity.copy_from_slice(&bytes[0..32]);

        Some(Self {
            identity,
            bandwidth_served_bytes: u64::from_le_bytes(bytes[32..40].try_into().ok()?),
            uptime_ratio: u16::from_le_bytes(bytes[40..42].try_into().ok()?),
            contribution_score: u64::from_le_bytes(bytes[42..50].try_into().ok()?),
        })
    }
}

// === Pool Gossip Protocol Payloads (SPEC_03 §7, SPEC_08 §3.3) ===

/// POOL_ANNOUNCE payload
///
/// Announces a new engagement pool for content preservation.
/// Peers can then contribute PoW to help save the content.
///
/// Wire format:
/// - pool_id: 32 bytes
/// - target_content: 32 bytes (content hash to preserve)
/// - creator: 32 bytes (pool creator's identity)
/// - required_pow: 8 bytes (total PoW needed in seconds)
/// - window_end: 8 bytes (deadline timestamp in ms)
/// - signature: 64 bytes (creator's signature)
/// Total: 176 bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolAnnouncePayload {
    /// Unique pool identifier
    pub pool_id: [u8; 32],
    /// Content hash that this pool is trying to preserve
    pub target_content: [u8; 32],
    /// Identity of pool creator
    pub creator: [u8; 32],
    /// Total PoW required in seconds (usually 60)
    pub required_pow: u64,
    /// Deadline for contributions (UNIX milliseconds)
    pub window_end: u64,
    /// Creator's signature
    pub signature: [u8; 64],
}

impl PoolAnnouncePayload {
    /// Wire size in bytes
    pub const SIZE: usize = 176;

    /// Create a new pool announcement
    #[must_use]
    pub fn new(
        pool_id: [u8; 32],
        target_content: [u8; 32],
        creator: [u8; 32],
        required_pow: u64,
        window_end: u64,
        signature: [u8; 64],
    ) -> Self {
        Self {
            pool_id,
            target_content,
            creator,
            required_pow,
            window_end,
            signature,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.pool_id);
        bytes[32..64].copy_from_slice(&self.target_content);
        bytes[64..96].copy_from_slice(&self.creator);
        bytes[96..104].copy_from_slice(&self.required_pow.to_le_bytes());
        bytes[104..112].copy_from_slice(&self.window_end.to_le_bytes());
        bytes[112..176].copy_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut pool_id = [0u8; 32];
        pool_id.copy_from_slice(&bytes[0..32]);

        let mut target_content = [0u8; 32];
        target_content.copy_from_slice(&bytes[32..64]);

        let mut creator = [0u8; 32];
        creator.copy_from_slice(&bytes[64..96]);

        let required_pow = u64::from_le_bytes(bytes[96..104].try_into().ok()?);
        let window_end = u64::from_le_bytes(bytes[104..112].try_into().ok()?);

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[112..176]);

        Some(Self {
            pool_id,
            target_content,
            creator,
            required_pow,
            window_end,
            signature,
        })
    }
}

impl Default for PoolAnnouncePayload {
    fn default() -> Self {
        Self {
            pool_id: [0u8; 32],
            target_content: [0u8; 32],
            creator: [0u8; 32],
            required_pow: 60, // 60 seconds standard
            window_end: 0,
            signature: [0u8; 64],
        }
    }
}

/// POOL_CONTRIBUTION payload
///
/// Submits PoW work to an existing pool.
///
/// Wire format:
/// - pool_id: 32 bytes
/// - contributor: 32 bytes
/// - pow_nonce: 8 bytes
/// - pow_work: 8 bytes (seconds of work)
/// - pow_target: 32 bytes
/// - timestamp: 8 bytes
/// - nonce_space: 8 bytes
/// - signature: 64 bytes
/// Total: 192 bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolContributionPayload {
    /// Pool ID to contribute to
    pub pool_id: [u8; 32],
    /// Contributor's identity
    pub contributor: [u8; 32],
    /// PoW solution nonce
    pub pow_nonce: u64,
    /// Work amount in seconds
    pub pow_work: u64,
    /// Target hash solved against
    pub pow_target: [u8; 32],
    /// Contribution timestamp (UNIX milliseconds)
    pub timestamp: u64,
    /// Random bytes for challenge uniqueness
    pub nonce_space: [u8; 8],
    /// Contributor's signature
    pub signature: [u8; 64],
}

impl PoolContributionPayload {
    /// Wire size in bytes
    pub const SIZE: usize = 192;

    /// Create a new pool contribution
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool_id: [u8; 32],
        contributor: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        timestamp: u64,
        nonce_space: [u8; 8],
        signature: [u8; 64],
    ) -> Self {
        Self {
            pool_id,
            contributor,
            pow_nonce,
            pow_work,
            pow_target,
            timestamp,
            nonce_space,
            signature,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.pool_id);
        bytes[32..64].copy_from_slice(&self.contributor);
        bytes[64..72].copy_from_slice(&self.pow_nonce.to_le_bytes());
        bytes[72..80].copy_from_slice(&self.pow_work.to_le_bytes());
        bytes[80..112].copy_from_slice(&self.pow_target);
        bytes[112..120].copy_from_slice(&self.timestamp.to_le_bytes());
        bytes[120..128].copy_from_slice(&self.nonce_space);
        bytes[128..192].copy_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut pool_id = [0u8; 32];
        pool_id.copy_from_slice(&bytes[0..32]);

        let mut contributor = [0u8; 32];
        contributor.copy_from_slice(&bytes[32..64]);

        let pow_nonce = u64::from_le_bytes(bytes[64..72].try_into().ok()?);
        let pow_work = u64::from_le_bytes(bytes[72..80].try_into().ok()?);

        let mut pow_target = [0u8; 32];
        pow_target.copy_from_slice(&bytes[80..112]);

        let timestamp = u64::from_le_bytes(bytes[112..120].try_into().ok()?);

        let mut nonce_space = [0u8; 8];
        nonce_space.copy_from_slice(&bytes[120..128]);

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[128..192]);

        Some(Self {
            pool_id,
            contributor,
            pow_nonce,
            pow_work,
            pow_target,
            timestamp,
            nonce_space,
            signature,
        })
    }
}

impl Default for PoolContributionPayload {
    fn default() -> Self {
        Self {
            pool_id: [0u8; 32],
            contributor: [0u8; 32],
            pow_nonce: 0,
            pow_work: 0,
            pow_target: [0u8; 32],
            timestamp: 0,
            nonce_space: [0u8; 8],
            signature: [0u8; 64],
        }
    }
}

/// POOL_STATUS payload
///
/// Query or response for pool status.
///
/// Wire format:
/// - pool_id: 32 bytes
/// - status: 1 byte (0=query, 1=open, 2=completed, 3=expired)
/// - total_pow: 8 bytes (accumulated PoW so far)
/// - contributor_count: 2 bytes
/// Total: 43 bytes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PoolStatusPayload {
    /// Pool ID
    pub pool_id: [u8; 32],
    /// Status: 0=query, 1=open, 2=completed, 3=expired
    pub status: u8,
    /// Total PoW accumulated so far
    pub total_pow: u64,
    /// Number of contributors
    pub contributor_count: u16,
}

impl PoolStatusPayload {
    /// Wire size in bytes
    pub const SIZE: usize = 43;

    /// Create a query (status=0 means we're asking for status)
    #[must_use]
    pub fn query(pool_id: [u8; 32]) -> Self {
        Self {
            pool_id,
            status: 0,
            total_pow: 0,
            contributor_count: 0,
        }
    }

    /// Create a status response
    #[must_use]
    pub fn response(pool_id: [u8; 32], status: u8, total_pow: u64, contributor_count: u16) -> Self {
        Self {
            pool_id,
            status,
            total_pow,
            contributor_count,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.pool_id);
        bytes[32] = self.status;
        bytes[33..41].copy_from_slice(&self.total_pow.to_le_bytes());
        bytes[41..43].copy_from_slice(&self.contributor_count.to_le_bytes());
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut pool_id = [0u8; 32];
        pool_id.copy_from_slice(&bytes[0..32]);

        Some(Self {
            pool_id,
            status: bytes[32],
            total_pow: u64::from_le_bytes(bytes[33..41].try_into().ok()?),
            contributor_count: u16::from_le_bytes(bytes[41..43].try_into().ok()?),
        })
    }
}

impl Default for PoolStatusPayload {
    fn default() -> Self {
        Self {
            pool_id: [0u8; 32],
            status: 0,
            total_pow: 0,
            contributor_count: 0,
        }
    }
}

// === Mempool Gossip Protocol ===

/// ACTION_ANNOUNCE payload
///
/// Broadcasts a pending action to peers for mempool synchronization.
/// This ensures all nodes have the same pending actions before block formation.
///
/// Wire format:
/// - thread_id: 32 bytes
/// - space_id: 32 bytes
/// - action: 399 bytes (ACTION_SERIALIZED_SIZE - now includes media_refs)
/// Total: 463 bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionAnnouncePayload {
    /// Thread identifier (content hash of thread root)
    pub thread_id: [u8; 32],
    /// Space identifier
    pub space_id: [u8; 32],
    /// Serialized action (399 bytes - includes media_refs)
    pub action_data: [u8; crate::blocks::action::ACTION_SERIALIZED_SIZE],
}

impl ActionAnnouncePayload {
    /// Wire size in bytes: 32 + 32 + 399 = 463
    pub const SIZE: usize = 32 + 32 + crate::blocks::action::ACTION_SERIALIZED_SIZE;

    /// Create a new action announcement
    #[must_use]
    pub fn new(
        thread_id: [u8; 32],
        space_id: [u8; 32],
        action_data: [u8; crate::blocks::action::ACTION_SERIALIZED_SIZE],
    ) -> Self {
        Self {
            thread_id,
            space_id,
            action_data,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.thread_id);
        bytes[32..64].copy_from_slice(&self.space_id);
        bytes[64..Self::SIZE].copy_from_slice(&self.action_data);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }

        let mut thread_id = [0u8; 32];
        thread_id.copy_from_slice(&bytes[0..32]);

        let mut space_id = [0u8; 32];
        space_id.copy_from_slice(&bytes[32..64]);

        let mut action_data = [0u8; crate::blocks::action::ACTION_SERIALIZED_SIZE];
        action_data.copy_from_slice(&bytes[64..Self::SIZE]);

        Some(Self {
            thread_id,
            space_id,
            action_data,
        })
    }
}

impl Default for ActionAnnouncePayload {
    fn default() -> Self {
        Self {
            thread_id: [0u8; 32],
            space_id: [0u8; 32],
            action_data: [0u8; crate::blocks::action::ACTION_SERIALIZED_SIZE],
        }
    }
}

/// Announcement that propagates a pending direct-message request to peers so it
/// reaches the recipient's node. Self-authenticating: a receiving node verifies the
/// signature and PoW independently, so an untrusted relay can't forge or tamper.
///
/// Canonical signed message (ed25519 by `requester`):
///   b"DM_REQUEST_V1" || requester || recipient || key_share || timestamp(8 LE)
/// PoW (anti-spam, `DM_REQUEST_POW_DIFFICULTY` leading zero bits):
///   sha256(b"DM_REQUEST_POW_V1" || requester || recipient || timestamp(8 LE) || pow_nonce(8 LE))
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DmRequestAnnouncePayload {
    /// Requester (sender) ed25519 public key.
    pub requester: [u8; 32],
    /// Intended recipient ed25519 public key.
    pub recipient: [u8; 32],
    /// The DM space key wrapped for the recipient — NaCl box `nonce(24) || sealed(48)`
    /// = 72 bytes — so only the recipient (with their seed) can open it.
    pub key_share: [u8; 72],
    /// Unix seconds when the request was created (bounds replay + PoW freshness).
    pub timestamp: u64,
    /// PoW nonce satisfying the difficulty target above.
    pub pow_nonce: u64,
    /// Requester's signature over the canonical message.
    pub signature: [u8; 64],
}

/// Fixed PoW difficulty (leading zero bits) for a DM request. Unsolicited, so it
/// carries a cost to deter spam, mirroring the spam-attestation PoW.
pub const DM_REQUEST_POW_DIFFICULTY: u8 = 12;

impl DmRequestAnnouncePayload {
    /// Wire size: 32 + 32 + 72 + 8 + 8 + 64 = 216 bytes.
    pub const SIZE: usize = 32 + 32 + 72 + 8 + 8 + 64;

    /// The bytes the `requester` signs (ed25519).
    #[must_use]
    pub fn signing_message(&self) -> Vec<u8> {
        let mut m = Vec::with_capacity(13 + 32 + 32 + 72 + 8);
        m.extend_from_slice(b"DM_REQUEST_V1");
        m.extend_from_slice(&self.requester);
        m.extend_from_slice(&self.recipient);
        m.extend_from_slice(&self.key_share);
        m.extend_from_slice(&self.timestamp.to_le_bytes());
        m
    }

    /// The PoW pre-image (without the nonce); callers append the u64 nonce (LE).
    #[must_use]
    pub fn pow_message(&self) -> Vec<u8> {
        let mut m = Vec::with_capacity(17 + 32 + 32 + 8);
        m.extend_from_slice(b"DM_REQUEST_POW_V1");
        m.extend_from_slice(&self.requester);
        m.extend_from_slice(&self.recipient);
        m.extend_from_slice(&self.timestamp.to_le_bytes());
        m
    }

    /// Serialize to bytes.
    #[must_use]
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut b = [0u8; Self::SIZE];
        b[0..32].copy_from_slice(&self.requester);
        b[32..64].copy_from_slice(&self.recipient);
        b[64..136].copy_from_slice(&self.key_share);
        b[136..144].copy_from_slice(&self.timestamp.to_le_bytes());
        b[144..152].copy_from_slice(&self.pow_nonce.to_le_bytes());
        b[152..216].copy_from_slice(&self.signature);
        b
    }

    /// Deserialize from bytes.
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut requester = [0u8; 32];
        requester.copy_from_slice(&bytes[0..32]);
        let mut recipient = [0u8; 32];
        recipient.copy_from_slice(&bytes[32..64]);
        let mut key_share = [0u8; 72];
        key_share.copy_from_slice(&bytes[64..136]);
        let timestamp = u64::from_le_bytes(bytes[136..144].try_into().ok()?);
        let pow_nonce = u64::from_le_bytes(bytes[144..152].try_into().ok()?);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[152..216]);
        Some(Self {
            requester,
            recipient,
            key_share,
            timestamp,
            pow_nonce,
            signature,
        })
    }

    /// Verify the signature and PoW independently of any relay. Returns true only if
    /// the requester actually signed this and paid the PoW cost.
    #[must_use]
    pub fn verify(&self) -> bool {
        use crate::crypto::{leading_zeros, pow_hash};
        // PoW
        let mut pow_input = self.pow_message();
        pow_input.extend_from_slice(&self.pow_nonce.to_le_bytes());
        if leading_zeros(&pow_hash(&pow_input)) < u32::from(DM_REQUEST_POW_DIFFICULTY) {
            return false;
        }
        // Signature
        let pubkey = crate::types::identity::PublicKey(self.requester);
        let sig = crate::types::identity::Signature(self.signature);
        crate::crypto::signature::verify(&pubkey, &self.signing_message(), &sig)
    }
}

/// Announcement that a DM request was accepted, propagated back to the original
/// requester so their node can flip the request from Pending to Accepted. Signed by
/// the acceptor. No PoW: a receiving node only acts on it if it holds a matching
/// outgoing Pending request to this acceptor, so it can't be used to spam.
///
/// Canonical signed message (ed25519 by `acceptor`):
///   b"DM_ACCEPT_V1" || requester || acceptor || timestamp(8 LE)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DmAcceptAnnouncePayload {
    /// The original requester (recipient of this announcement).
    pub requester: [u8; 32],
    /// The acceptor (signer) ed25519 public key.
    pub acceptor: [u8; 32],
    /// Unix seconds when accepted (bounds replay).
    pub timestamp: u64,
    /// Acceptor's signature over the canonical message.
    pub signature: [u8; 64],
}

impl DmAcceptAnnouncePayload {
    /// Wire size: 32 + 32 + 8 + 64 = 136 bytes.
    pub const SIZE: usize = 32 + 32 + 8 + 64;

    /// The bytes the `acceptor` signs (ed25519).
    #[must_use]
    pub fn signing_message(&self) -> Vec<u8> {
        let mut m = Vec::with_capacity(12 + 32 + 32 + 8);
        m.extend_from_slice(b"DM_ACCEPT_V1");
        m.extend_from_slice(&self.requester);
        m.extend_from_slice(&self.acceptor);
        m.extend_from_slice(&self.timestamp.to_le_bytes());
        m
    }

    /// Serialize to bytes.
    #[must_use]
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut b = [0u8; Self::SIZE];
        b[0..32].copy_from_slice(&self.requester);
        b[32..64].copy_from_slice(&self.acceptor);
        b[64..72].copy_from_slice(&self.timestamp.to_le_bytes());
        b[72..136].copy_from_slice(&self.signature);
        b
    }

    /// Deserialize from bytes.
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut requester = [0u8; 32];
        requester.copy_from_slice(&bytes[0..32]);
        let mut acceptor = [0u8; 32];
        acceptor.copy_from_slice(&bytes[32..64]);
        let timestamp = u64::from_le_bytes(bytes[64..72].try_into().ok()?);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[72..136]);
        Some(Self {
            requester,
            acceptor,
            timestamp,
            signature,
        })
    }

    /// Verify the acceptor's signature over the canonical message.
    #[must_use]
    pub fn verify(&self) -> bool {
        let pubkey = crate::types::identity::PublicKey(self.acceptor);
        let sig = crate::types::identity::Signature(self.signature);
        crate::crypto::signature::verify(&pubkey, &self.signing_message(), &sig)
    }
}

/// Announcement that a DM request was declined, propagated back to the requester so
/// their node marks the request Declined (and their client can drop it). Signed by the
/// decliner; no PoW (a node only acts on it if it holds a matching outgoing request).
///
/// Canonical signed message (ed25519 by `decliner`):
///   b"DM_DECLINE_V1" || requester || decliner || timestamp(8 LE)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DmDeclineAnnouncePayload {
    /// The original requester (recipient of this announcement).
    pub requester: [u8; 32],
    /// The decliner (signer) ed25519 public key.
    pub decliner: [u8; 32],
    /// Unix seconds when declined (bounds replay).
    pub timestamp: u64,
    /// Decliner's signature over the canonical message.
    pub signature: [u8; 64],
}

impl DmDeclineAnnouncePayload {
    /// Wire size: 32 + 32 + 8 + 64 = 136 bytes.
    pub const SIZE: usize = 32 + 32 + 8 + 64;

    /// The bytes the `decliner` signs (ed25519).
    #[must_use]
    pub fn signing_message(&self) -> Vec<u8> {
        let mut m = Vec::with_capacity(13 + 32 + 32 + 8);
        m.extend_from_slice(b"DM_DECLINE_V1");
        m.extend_from_slice(&self.requester);
        m.extend_from_slice(&self.decliner);
        m.extend_from_slice(&self.timestamp.to_le_bytes());
        m
    }

    /// Serialize to bytes.
    #[must_use]
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut b = [0u8; Self::SIZE];
        b[0..32].copy_from_slice(&self.requester);
        b[32..64].copy_from_slice(&self.decliner);
        b[64..72].copy_from_slice(&self.timestamp.to_le_bytes());
        b[72..136].copy_from_slice(&self.signature);
        b
    }

    /// Deserialize from bytes.
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SIZE {
            return None;
        }
        let mut requester = [0u8; 32];
        requester.copy_from_slice(&bytes[0..32]);
        let mut decliner = [0u8; 32];
        decliner.copy_from_slice(&bytes[32..64]);
        let timestamp = u64::from_le_bytes(bytes[64..72].try_into().ok()?);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[72..136]);
        Some(Self {
            requester,
            decliner,
            timestamp,
            signature,
        })
    }

    /// Verify the decliner's signature over the canonical message.
    #[must_use]
    pub fn verify(&self) -> bool {
        let pubkey = crate::types::identity::PublicKey(self.decliner);
        let sig = crate::types::identity::Signature(self.signature);
        crate::crypto::signature::verify(&pubkey, &self.signing_message(), &sig)
    }
}

// ============================================================================
// Branch-Selective Sync Payloads
// See docs/BRANCH_SELECTIVE_SYNC.md for architecture overview
// ============================================================================

/// Request blocks for a specific space + branch
///
/// Enables selective sync where nodes only download branches they've subscribed to.
/// Much more bandwidth-efficient than full-chain sync.
///
/// Wire format:
/// - space_id: 32 bytes
/// - branch_depth: 1 byte
/// - branch_path: (depth + 7) / 8 bytes
/// - start_height: 8 bytes (big-endian)
/// - end_height: 8 bytes (big-endian)
/// - include_content: 1 byte (0 or 1)
/// - max_blocks: 2 bytes (big-endian)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetBlocksBranchPayload {
    /// Space ID (32 bytes)
    pub space_id: [u8; 32],
    /// Branch path within space
    pub branch_path: crate::blocks::BranchPath,
    /// Starting block height
    pub start_height: u64,
    /// Ending block height (inclusive, u64::MAX for "to tip")
    pub end_height: u64,
    /// Include content blocks in response
    pub include_content: bool,
    /// Maximum blocks to return
    pub max_blocks: u16,
}

impl GetBlocksBranchPayload {
    /// Create a new branch block request
    pub fn new(
        space_id: [u8; 32],
        branch_path: crate::blocks::BranchPath,
        start_height: u64,
        max_blocks: u16,
    ) -> Self {
        Self {
            space_id,
            branch_path,
            start_height,
            end_height: u64::MAX,
            include_content: true,
            max_blocks,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let path_bytes = &self.branch_path.path;
        let mut buf = Vec::with_capacity(32 + 1 + path_bytes.len() + 19);
        buf.extend_from_slice(&self.space_id);
        buf.push(self.branch_path.depth);
        buf.extend_from_slice(path_bytes);
        buf.extend_from_slice(&self.start_height.to_be_bytes());
        buf.extend_from_slice(&self.end_height.to_be_bytes());
        buf.push(self.include_content as u8);
        buf.extend_from_slice(&self.max_blocks.to_be_bytes());
        buf
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 52 {
            return None;
        }

        let mut space_id = [0u8; 32];
        space_id.copy_from_slice(&bytes[0..32]);

        let depth = bytes[32];
        let path_len = (depth as usize + 7) / 8;

        if bytes.len() < 33 + path_len + 19 {
            return None;
        }

        let path = bytes[33..33 + path_len].to_vec();
        let branch_path = crate::blocks::BranchPath { depth, path };

        let offset = 33 + path_len;
        let start_height = u64::from_be_bytes(bytes[offset..offset + 8].try_into().ok()?);
        let end_height = u64::from_be_bytes(bytes[offset + 8..offset + 16].try_into().ok()?);
        let include_content = bytes[offset + 16] != 0;
        let max_blocks = u16::from_be_bytes(bytes[offset + 17..offset + 19].try_into().ok()?);

        Some(Self {
            space_id,
            branch_path,
            start_height,
            end_height,
            include_content,
            max_blocks,
        })
    }
}

/// Subscribe to receive announcements for a branch
///
/// After subscribing, peer will send BRANCH_ANNOUNCE messages when new
/// content arrives in this branch.
///
/// Wire format:
/// - space_id: 32 bytes
/// - branch_depth: 1 byte
/// - branch_path: (depth + 7) / 8 bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubscribeBranchPayload {
    /// Space ID
    pub space_id: [u8; 32],
    /// Branch path
    pub branch_path: crate::blocks::BranchPath,
}

impl SubscribeBranchPayload {
    pub fn new(space_id: [u8; 32], branch_path: crate::blocks::BranchPath) -> Self {
        Self {
            space_id,
            branch_path,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let path_bytes = &self.branch_path.path;
        let mut buf = Vec::with_capacity(32 + 1 + path_bytes.len());
        buf.extend_from_slice(&self.space_id);
        buf.push(self.branch_path.depth);
        buf.extend_from_slice(path_bytes);
        buf
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 33 {
            return None;
        }

        let mut space_id = [0u8; 32];
        space_id.copy_from_slice(&bytes[0..32]);

        let depth = bytes[32];
        let path_len = (depth as usize + 7) / 8;

        if bytes.len() < 33 + path_len {
            return None;
        }

        let path = bytes[33..33 + path_len].to_vec();
        let branch_path = crate::blocks::BranchPath { depth, path };

        Some(Self {
            space_id,
            branch_path,
        })
    }
}

/// Unsubscribe from a branch (same format as subscribe)
pub type UnsubscribeBranchPayload = SubscribeBranchPayload;

/// Announce new content in a branch (gossip)
///
/// Sent to subscribed peers when new content arrives in a branch.
/// Recipients can then request the full block if interested.
///
/// Wire format:
/// - space_id: 32 bytes
/// - branch_depth: 1 byte
/// - branch_path: (depth + 7) / 8 bytes
/// - block_hash: 32 bytes
/// - height: 8 bytes (big-endian)
/// - content_count: 4 bytes (big-endian)
/// - timestamp: 8 bytes (big-endian)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchAnnouncePayload {
    /// Space ID
    pub space_id: [u8; 32],
    /// Branch path
    pub branch_path: crate::blocks::BranchPath,
    /// Block hash containing the content
    pub block_hash: [u8; 32],
    /// Block height
    pub height: u64,
    /// Content block count in this branch for this block
    pub content_count: u32,
    /// Timestamp
    pub timestamp: u64,
}

impl BranchAnnouncePayload {
    pub fn new(
        space_id: [u8; 32],
        branch_path: crate::blocks::BranchPath,
        block_hash: [u8; 32],
        height: u64,
        content_count: u32,
        timestamp: u64,
    ) -> Self {
        Self {
            space_id,
            branch_path,
            block_hash,
            height,
            content_count,
            timestamp,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let path_bytes = &self.branch_path.path;
        let mut buf = Vec::with_capacity(32 + 1 + path_bytes.len() + 52);
        buf.extend_from_slice(&self.space_id);
        buf.push(self.branch_path.depth);
        buf.extend_from_slice(path_bytes);
        buf.extend_from_slice(&self.block_hash);
        buf.extend_from_slice(&self.height.to_be_bytes());
        buf.extend_from_slice(&self.content_count.to_be_bytes());
        buf.extend_from_slice(&self.timestamp.to_be_bytes());
        buf
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 85 {
            return None;
        }

        let mut space_id = [0u8; 32];
        space_id.copy_from_slice(&bytes[0..32]);

        let depth = bytes[32];
        let path_len = (depth as usize + 7) / 8;

        if bytes.len() < 33 + path_len + 52 {
            return None;
        }

        let path = bytes[33..33 + path_len].to_vec();
        let branch_path = crate::blocks::BranchPath { depth, path };

        let offset = 33 + path_len;
        let mut block_hash = [0u8; 32];
        block_hash.copy_from_slice(&bytes[offset..offset + 32]);

        let height = u64::from_be_bytes(bytes[offset + 32..offset + 40].try_into().ok()?);
        let content_count = u32::from_be_bytes(bytes[offset + 40..offset + 44].try_into().ok()?);
        let timestamp = u64::from_be_bytes(bytes[offset + 44..offset + 52].try_into().ok()?);

        Some(Self {
            space_id,
            branch_path,
            block_hash,
            height,
            content_count,
            timestamp,
        })
    }
}

/// Advertise which branches this peer serves
///
/// Sent to peers to help them find nodes serving specific branches.
/// Each entry is (space_id[16], branch_path).
///
/// Wire format:
/// - count: 2 bytes (big-endian)
/// - entries: count * (16 + 1 + path_len) bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchInventoryPayload {
    /// List of (space_id[16], branch_path) pairs this peer serves
    pub branches: Vec<([u8; 16], crate::blocks::BranchPath)>,
}

impl BranchInventoryPayload {
    pub fn new(branches: Vec<([u8; 16], crate::blocks::BranchPath)>) -> Self {
        Self { branches }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        let count = self
            .branches
            .len()
            .min(constants::MAX_BRANCH_INVENTORY_ENTRIES) as u16;
        buf.extend_from_slice(&count.to_be_bytes());

        for (space_id, branch_path) in self.branches.iter().take(count as usize) {
            buf.extend_from_slice(space_id);
            buf.push(branch_path.depth);
            buf.extend_from_slice(&branch_path.path);
        }
        buf
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 2 {
            return None;
        }

        let count = u16::from_be_bytes(bytes[0..2].try_into().ok()?) as usize;
        if count > constants::MAX_BRANCH_INVENTORY_ENTRIES {
            return None;
        }

        let mut branches = Vec::with_capacity(count);
        let mut offset = 2;

        for _ in 0..count {
            if offset + 17 > bytes.len() {
                return None;
            }

            let mut space_id = [0u8; 16];
            space_id.copy_from_slice(&bytes[offset..offset + 16]);

            let depth = bytes[offset + 16];
            let path_len = (depth as usize + 7) / 8;

            if offset + 17 + path_len > bytes.len() {
                return None;
            }

            let path = bytes[offset + 17..offset + 17 + path_len].to_vec();
            let branch_path = crate::blocks::BranchPath { depth, path };

            branches.push((space_id, branch_path));
            offset += 17 + path_len;
        }

        Some(Self { branches })
    }
}

// ============================================================================
// Space Name Resolution (Bug #4) — see docs/SPACE_NAME_RESOLUTION.md
// ============================================================================

/// Request the display metadata for a single space.
///
/// Wire format: just the 16-byte space_id (truncated SHA-256 commitment).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetSpaceMetaPayload {
    pub space_id: [u8; 16],
}

impl GetSpaceMetaPayload {
    pub fn new(space_id: [u8; 16]) -> Self {
        Self { space_id }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        self.space_id.to_vec()
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 16 {
            return None;
        }
        let mut space_id = [0u8; 16];
        space_id.copy_from_slice(&bytes[..16]);
        Some(Self { space_id })
    }
}

/// Reply carrying a single space's display metadata.
///
/// Wire format:
/// - space_id: 16 bytes
/// - creator_pubkey: 32 bytes
/// - timestamp: 8 bytes LE
/// - name_len: 1 byte, name_bytes (max 255 bytes, valid UTF-8)
/// - desc_flag: 1 byte (0 = none, 1 = present)
/// - if desc_flag==1: desc_len 1 byte + desc_bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceMetaPayload {
    pub space_id: [u8; 16],
    pub creator_pubkey: [u8; 32],
    pub timestamp: u64,
    pub name: String,
    pub description: Option<String>,
}

impl SpaceMetaPayload {
    pub fn new(
        space_id: [u8; 16],
        creator_pubkey: [u8; 32],
        timestamp: u64,
        name: String,
        description: Option<String>,
    ) -> Self {
        Self {
            space_id,
            creator_pubkey,
            timestamp,
            name,
            description,
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let name_bytes = self.name.as_bytes();
        let name_len = name_bytes.len().min(255) as u8;
        let mut buf = Vec::with_capacity(16 + 32 + 8 + 1 + name_len as usize + 2);
        buf.extend_from_slice(&self.space_id);
        buf.extend_from_slice(&self.creator_pubkey);
        buf.extend_from_slice(&self.timestamp.to_le_bytes());
        buf.push(name_len);
        buf.extend_from_slice(&name_bytes[..name_len as usize]);
        match &self.description {
            Some(d) => {
                let d_bytes = d.as_bytes();
                let d_len = d_bytes.len().min(255) as u8;
                buf.push(1);
                buf.push(d_len);
                buf.extend_from_slice(&d_bytes[..d_len as usize]);
            }
            None => buf.push(0),
        }
        buf
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 16 + 32 + 8 + 1 + 1 {
            return None;
        }
        let mut offset = 0;

        let mut space_id = [0u8; 16];
        space_id.copy_from_slice(&bytes[offset..offset + 16]);
        offset += 16;

        let mut creator_pubkey = [0u8; 32];
        creator_pubkey.copy_from_slice(&bytes[offset..offset + 32]);
        offset += 32;

        let mut ts_bytes = [0u8; 8];
        ts_bytes.copy_from_slice(&bytes[offset..offset + 8]);
        let timestamp = u64::from_le_bytes(ts_bytes);
        offset += 8;

        let name_len = bytes[offset] as usize;
        offset += 1;
        if bytes.len() < offset + name_len + 1 {
            return None;
        }
        let name = String::from_utf8(bytes[offset..offset + name_len].to_vec()).ok()?;
        offset += name_len;

        let desc_flag = bytes[offset];
        offset += 1;
        let description = if desc_flag == 1 {
            if bytes.len() < offset + 1 {
                return None;
            }
            let d_len = bytes[offset] as usize;
            offset += 1;
            if bytes.len() < offset + d_len {
                return None;
            }
            Some(String::from_utf8(bytes[offset..offset + d_len].to_vec()).ok()?)
        } else {
            None
        };

        Some(Self {
            space_id,
            creator_pubkey,
            timestamp,
            name,
            description,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compact_addr_default() {
        let addr = CompactAddr::default();
        assert_eq!(addr.transport, 0x01);
        assert_eq!(addr.port, constants::DEFAULT_PORT);
    }

    #[test]
    fn test_wire_addr_default() {
        let addr = WireAddr::default();
        assert_eq!(addr.transport, 0x01);
        assert_eq!(addr.address.len(), 64);
    }

    #[test]
    fn test_hole_punch_intro_roundtrip_ipv4() {
        let node_id = [0x7c; 32];
        let ep: std::net::SocketAddr = "203.0.113.9:29736".parse().unwrap();
        let intro = HolePunchIntroPayload::new(node_id, ep);
        let bytes = intro.to_bytes();
        assert_eq!(bytes.len(), HolePunchIntroPayload::SIZE);

        let decoded = HolePunchIntroPayload::from_bytes(&bytes).unwrap();
        assert_eq!(decoded, intro);
        assert_eq!(decoded.target_node_id, node_id);
        // IPv4 endpoint survives the IPv4-mapped-IPv6 round trip.
        assert_eq!(decoded.endpoint(), Some(ep));
    }

    #[test]
    fn test_hole_punch_intro_roundtrip_ipv6() {
        let node_id = [0x01; 32];
        let ep: std::net::SocketAddr = "[2001:db8::1]:1234".parse().unwrap();
        let intro = HolePunchIntroPayload::new(node_id, ep);
        let decoded = HolePunchIntroPayload::from_bytes(&intro.to_bytes()).unwrap();
        assert_eq!(decoded.endpoint(), Some(ep));
    }

    #[test]
    fn test_hole_punch_intro_rejects_short_and_zero() {
        assert!(HolePunchIntroPayload::from_bytes(&[0u8; 10]).is_none());
        // All-zero address/port is not dialable.
        let zero = HolePunchIntroPayload {
            target_node_id: [0u8; 32],
            address: [0u8; 16],
            port: 0,
        };
        assert_eq!(zero.endpoint(), None);
    }

    #[test]
    fn test_inv_item_constructors() {
        let hash = [0xab; 32];

        let block = InvItem::block(hash);
        assert_eq!(block.inv_type, 0x01);
        assert_eq!(block.hash, hash);

        let content = InvItem::content(hash);
        assert_eq!(content.inv_type, 0x02);

        let identity = InvItem::identity(hash);
        assert_eq!(identity.inv_type, 0x03);
    }

    #[test]
    fn test_rejection_code_try_from() {
        assert_eq!(
            RejectionCode::try_from(0x01).unwrap(),
            RejectionCode::Malformed
        );
        assert_eq!(
            RejectionCode::try_from(0x07).unwrap(),
            RejectionCode::Banned
        );
        assert!(RejectionCode::try_from(0xFF).is_err());
    }

    #[test]
    fn test_ping_pong_payload() {
        let ping = PingPongPayload::new(0x1234567890abcdef);
        assert_eq!(ping.nonce, 0x1234567890abcdef);
    }

    #[test]
    fn test_version_payload_default() {
        let version = VersionPayload::default();
        assert_eq!(version.protocol_version, constants::PROTOCOL_VERSION as u32);
        assert!(version.relay);
    }

    // === SPEC_07: Content Retrieval Payload Tests ===

    #[test]
    fn test_who_has_payload_new() {
        let hash = [0xab; 32];
        let payload = WhoHasPayload::new(hash);
        assert_eq!(payload.hash, hash);
    }

    #[test]
    fn test_i_have_payload_new() {
        let hash = [0xcd; 32];
        let payload = IHavePayload::new(hash);
        assert_eq!(payload.hash, hash);
    }

    #[test]
    fn test_get_payload_new() {
        let hash = [0xef; 32];
        let payload = GetPayload::new(hash);
        assert_eq!(payload.hash, hash);
    }

    #[test]
    fn test_content_retrieval_payloads_default() {
        let who_has = WhoHasPayload::default();
        assert_eq!(who_has.hash, [0u8; 32]);

        let i_have = IHavePayload::default();
        assert_eq!(i_have.hash, [0u8; 32]);

        let get = GetPayload::default();
        assert_eq!(get.hash, [0u8; 32]);
    }

    // === SPEC_09: Swimmer Level Payload Tests ===

    #[test]
    fn test_level_query_payload_default() {
        let payload = LevelQueryPayload::default();
        assert_eq!(payload.identity, [0u8; 32]);
    }

    #[test]
    fn test_level_query_payload_new() {
        let identity = [42u8; 32];
        let payload = LevelQueryPayload::new(identity);
        assert_eq!(payload.identity, identity);
    }

    #[test]
    fn test_level_response_payload_default() {
        let payload = LevelResponsePayload::default();
        assert_eq!(payload.identity, [0u8; 32]);
        assert_eq!(payload.level, 0); // NewSwimmer
        assert_eq!(payload.streak, 0);
        assert_eq!(payload.bandwidth_30d_gb, 0);
        assert_eq!(payload.uptime_ratio, 0);
        assert_eq!(payload.lifetime_bandwidth_gb, 0);
    }

    #[test]
    fn test_level_response_payload_new() {
        let identity = [1u8; 32];
        let payload = LevelResponsePayload::new(
            identity, 4,    // Anchor
            30,   // 30 day streak
            200,  // 200 GB/month
            9200, // 92% uptime
            1000, // 1TB lifetime
        );
        assert_eq!(payload.identity, identity);
        assert_eq!(payload.level, 4);
        assert_eq!(payload.streak, 30);
        assert_eq!(payload.bandwidth_30d_gb, 200);
        assert_eq!(payload.uptime_ratio, 9200);
        assert_eq!(payload.lifetime_bandwidth_gb, 1000);
    }

    #[test]
    fn test_level_response_wire_size() {
        // Per SPEC_09 §11: 32 + 1 + 2 + 8 + 2 + 8 = 53 bytes
        assert_eq!(LevelResponsePayload::wire_size(), 53);
    }

    // === SPEC_09: Space Health Payload Tests ===

    #[test]
    fn test_space_health_query_size() {
        assert_eq!(SpaceHealthQueryPayload::SIZE, 16);
    }

    #[test]
    fn test_space_health_query_serialization() {
        let space_id = [0xab; 16];
        let query = SpaceHealthQueryPayload::new(space_id);

        let bytes = query.to_bytes();
        assert_eq!(bytes.len(), 16);
        assert_eq!(bytes, space_id);

        let restored = SpaceHealthQueryPayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored.space_id, space_id);
    }

    #[test]
    fn test_space_health_response_min_size() {
        // 16 + 4 + 8 + 4 + 1 + 4 = 37 bytes
        assert_eq!(SpaceHealthResponsePayload::MIN_SIZE, 37);
    }

    #[test]
    fn test_space_health_response_default() {
        let response = SpaceHealthResponsePayload::default();
        assert_eq!(response.space_id, [0u8; 16]);
        assert_eq!(response.active_swimmers, 0);
        assert_eq!(response.last_sync_age_secs, 0);
        assert_eq!(response.posts_at_risk, 0);
        assert_eq!(response.health_score, 30);
        assert!(response.contributors.is_empty());
    }

    #[test]
    fn test_space_health_response_roundtrip_no_contributors() {
        let response = SpaceHealthResponsePayload {
            space_id: [1u8; 16],
            active_swimmers: 10,
            last_sync_age_secs: 60,
            posts_at_risk: 5,
            health_score: 85,
            contributors: Vec::new(),
        };

        let bytes = response.to_bytes();
        assert_eq!(bytes.len(), SpaceHealthResponsePayload::MIN_SIZE);

        let restored = SpaceHealthResponsePayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored, response);
    }

    #[test]
    fn test_space_health_response_roundtrip_with_contributors() {
        let response = SpaceHealthResponsePayload {
            space_id: [1u8; 16],
            active_swimmers: 10,
            last_sync_age_secs: 60,
            posts_at_risk: 5,
            health_score: 85,
            contributors: vec![
                SpaceContributorPayload {
                    identity: [2u8; 32],
                    bandwidth_served_bytes: 1_000_000_000,
                    uptime_ratio: 9500,
                    contribution_score: 100,
                },
                SpaceContributorPayload {
                    identity: [3u8; 32],
                    bandwidth_served_bytes: 500_000_000,
                    uptime_ratio: 8500,
                    contribution_score: 50,
                },
            ],
        };

        let bytes = response.to_bytes();
        assert_eq!(
            bytes.len(),
            SpaceHealthResponsePayload::MIN_SIZE + 2 * SpaceContributorPayload::SIZE
        );

        let restored = SpaceHealthResponsePayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored, response);
    }

    #[test]
    fn test_space_contributor_size() {
        // 32 + 8 + 2 + 8 = 50 bytes
        assert_eq!(SpaceContributorPayload::SIZE, 50);
    }

    #[test]
    fn test_space_contributor_roundtrip() {
        let contributor = SpaceContributorPayload {
            identity: [0xab; 32],
            bandwidth_served_bytes: 5_000_000_000,
            uptime_ratio: 9500,
            contribution_score: 500,
        };

        let bytes = contributor.to_bytes();
        assert_eq!(bytes.len(), 50);

        let restored = SpaceContributorPayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored, contributor);
    }

    #[test]
    fn test_space_health_query_short_bytes() {
        let bytes = [0u8; 15]; // Too short
        assert!(SpaceHealthQueryPayload::from_bytes(&bytes).is_none());
    }

    #[test]
    fn test_space_health_response_short_bytes() {
        let bytes = [0u8; 36]; // Too short (needs 37)
        assert!(SpaceHealthResponsePayload::from_bytes(&bytes).is_none());
    }

    #[test]
    fn test_space_contributor_short_bytes() {
        let bytes = [0u8; 49]; // Too short (needs 50)
        assert!(SpaceContributorPayload::from_bytes(&bytes).is_none());
    }
}
