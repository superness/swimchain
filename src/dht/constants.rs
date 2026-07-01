//! DHT Constants (SPEC_06 §3.8)
//!
//! Kademlia parameters and protocol constants.

/// Number of nodes per k-bucket (replication factor)
pub const K: usize = 8;

/// Number of parallel lookups (concurrency factor)
pub const ALPHA: usize = 3;

/// Number of bits in a node ID (256 for SHA-256)
pub const ID_BITS: usize = 256;

/// Maximum number of k-buckets
pub const NUM_BUCKETS: usize = ID_BITS;

/// Provider record TTL in seconds (1 hour)
pub const PROVIDER_TTL_SECS: u64 = 3600;

/// Provider record refresh interval in seconds (45 minutes)
pub const PROVIDER_REFRESH_SECS: u64 = 2700;

/// Lookup timeout in milliseconds
pub const LOOKUP_TIMEOUT_MS: u64 = 10_000;

/// Single RPC timeout in milliseconds
pub const RPC_TIMEOUT_MS: u64 = 5_000;

/// Maximum number of providers to return for a content hash
pub const MAX_PROVIDERS: usize = 20;

/// Routing table refresh interval in seconds (1 hour)
pub const ROUTING_REFRESH_SECS: u64 = 3600;

/// Maximum age of a node entry before refresh needed (in seconds)
pub const NODE_STALE_SECS: u64 = 3600;

/// Maximum nodes per /24 subnet in each bucket (eclipse attack mitigation)
/// This prevents a single subnet from dominating the routing table
pub const MAX_NODES_PER_SUBNET: usize = 2;

// === Protocol Message Types (0x80-0x8F range) ===

/// DHT_PING message type (liveness check)
pub const MSG_DHT_PING: u8 = 0x80;

/// DHT_PONG message type (ping response)
pub const MSG_DHT_PONG: u8 = 0x81;

/// DHT_FIND_NODE request
pub const MSG_DHT_FIND_NODE: u8 = 0x82;

/// DHT_NODES response (list of closest nodes)
pub const MSG_DHT_NODES: u8 = 0x83;

/// DHT_FIND_VALUE request (find content providers)
pub const MSG_DHT_FIND_VALUE: u8 = 0x84;

/// DHT_PROVIDERS response with providers
pub const MSG_DHT_PROVIDERS: u8 = 0x85;

/// DHT_STORE request (announce content availability)
pub const MSG_DHT_STORE: u8 = 0x86;

/// DHT_STORE_ACK acknowledgment
pub const MSG_DHT_STORE_ACK: u8 = 0x87;

// === STORE Rate Limiting (H-DHT-1) ===

/// Maximum STORE requests per sender per minute
pub const MAX_STORES_PER_SENDER_PER_MIN: u32 = 60;

/// Maximum total provider records a single sender can have across all content
pub const MAX_PROVIDERS_PER_SENDER: usize = 100;

/// STORE rate limiter cleanup interval in seconds (remove stale entries)
pub const STORE_RATE_LIMITER_CLEANUP_SECS: u64 = 300;

// === DHT Persistence (H-DHT-2) ===

/// DHT persistence version for migration support
pub const DHT_PERSISTENCE_VERSION: u32 = 1;

/// DHT persistence save interval in seconds (5 minutes)
pub const DHT_PERSISTENCE_SAVE_INTERVAL_SECS: u64 = 300;
