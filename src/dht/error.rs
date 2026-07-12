//! DHT Error Types

use std::fmt;

/// Result type for DHT operations
pub type DhtResult<T> = Result<T, DhtError>;

/// Errors that can occur in DHT operations
#[derive(Debug, Clone)]
pub enum DhtError {
    /// Node ID is invalid (wrong length, zero, etc.)
    InvalidNodeId { reason: String },

    /// Routing table is full and no stale entries to evict
    RoutingTableFull,

    /// Lookup operation timed out
    LookupTimeout { target: [u8; 32] },

    /// No providers found for content
    NoProviders { content_hash: [u8; 32] },

    /// RPC to peer failed
    RpcFailed { peer: [u8; 32], reason: String },

    /// Message serialization/deserialization failed
    SerializationError { reason: String },

    /// Storage error (provider store, etc.)
    StorageError { reason: String },

    /// Provider record expired
    ProviderExpired {
        content_hash: [u8; 32],
        provider: [u8; 32],
    },

    /// Invalid message format
    InvalidMessage { msg_type: u8, reason: String },

    /// Bucket index out of range
    BucketIndexOutOfRange { index: usize, max: usize },

    /// Self-lookup (target is our own ID)
    SelfLookup,

    /// Network error during DHT operation
    NetworkError { reason: String },

    /// Subnet limit exceeded (eclipse attack mitigation)
    SubnetLimitExceeded { subnet: [u8; 3], limit: usize },

    /// Invalid provider record signature
    InvalidProviderSignature {
        content_hash: [u8; 32],
        provider: [u8; 32],
    },

    /// STORE request rate limited (too many requests per minute)
    StoreRateLimited {
        sender: [u8; 32],
        limit_per_min: u32,
    },

    /// Provider limit exceeded (sender has too many provider records)
    ProviderLimitExceeded { sender: [u8; 32], limit: usize },

    /// Invalid message signature (H-DHT-3)
    InvalidMessageSignature { sender: [u8; 32], reason: String },

    /// Message timestamp expired or too far in future (H-DHT-3)
    MessageTimestampInvalid {
        sender: [u8; 32],
        timestamp: u64,
        current_time: u64,
    },
}

impl fmt::Display for DhtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidNodeId { reason } => write!(f, "Invalid node ID: {}", reason),
            Self::RoutingTableFull => write!(f, "Routing table is full"),
            Self::LookupTimeout { target } => {
                write!(
                    f,
                    "Lookup timed out for target {}",
                    hex::encode(&target[..8])
                )
            }
            Self::NoProviders { content_hash } => {
                write!(
                    f,
                    "No providers found for content {}",
                    hex::encode(&content_hash[..8])
                )
            }
            Self::RpcFailed { peer, reason } => {
                write!(f, "RPC to {} failed: {}", hex::encode(&peer[..8]), reason)
            }
            Self::SerializationError { reason } => {
                write!(f, "Serialization error: {}", reason)
            }
            Self::StorageError { reason } => write!(f, "Storage error: {}", reason),
            Self::ProviderExpired {
                content_hash,
                provider,
            } => {
                write!(
                    f,
                    "Provider {} expired for content {}",
                    hex::encode(&provider[..8]),
                    hex::encode(&content_hash[..8])
                )
            }
            Self::InvalidMessage { msg_type, reason } => {
                write!(f, "Invalid message type 0x{:02X}: {}", msg_type, reason)
            }
            Self::BucketIndexOutOfRange { index, max } => {
                write!(f, "Bucket index {} out of range (max {})", index, max)
            }
            Self::SelfLookup => write!(f, "Cannot lookup self"),
            Self::NetworkError { reason } => write!(f, "Network error: {}", reason),
            Self::SubnetLimitExceeded { subnet, limit } => {
                write!(
                    f,
                    "Subnet {}.{}.{}.0/24 already has {} nodes (limit: {})",
                    subnet[0], subnet[1], subnet[2], limit, limit
                )
            }
            Self::InvalidProviderSignature {
                content_hash,
                provider,
            } => {
                write!(
                    f,
                    "Invalid provider signature from {} for content {}",
                    hex::encode(&provider[..8]),
                    hex::encode(&content_hash[..8])
                )
            }
            Self::StoreRateLimited {
                sender,
                limit_per_min,
            } => {
                write!(
                    f,
                    "STORE rate limited: sender {} exceeded {} requests/min",
                    hex::encode(&sender[..8]),
                    limit_per_min
                )
            }
            Self::ProviderLimitExceeded { sender, limit } => {
                write!(
                    f,
                    "Provider limit exceeded: sender {} has {} provider records (limit: {})",
                    hex::encode(&sender[..8]),
                    limit,
                    limit
                )
            }
            Self::InvalidMessageSignature { sender, reason } => {
                write!(
                    f,
                    "Invalid message signature from {}: {}",
                    hex::encode(&sender[..8]),
                    reason
                )
            }
            Self::MessageTimestampInvalid {
                sender,
                timestamp,
                current_time,
            } => {
                write!(
                    f,
                    "Message timestamp invalid from {}: message timestamp {} vs current time {}",
                    hex::encode(&sender[..8]),
                    timestamp,
                    current_time
                )
            }
        }
    }
}

impl std::error::Error for DhtError {}
