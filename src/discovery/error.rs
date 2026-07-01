//! Error types for peer discovery operations (SPEC_06 §4.1)

use thiserror::Error;

/// Errors that can occur during peer discovery operations
#[derive(Debug, Error)]
pub enum DiscoveryError {
    /// Database storage error
    #[error("storage error: {0}")]
    Storage(#[from] sled::Error),

    /// Serialization/deserialization error
    #[error("serialization error: {0}")]
    Serialize(#[from] crate::types::error::SerializeError),

    /// Rate limit exceeded for GETADDR requests
    #[error("rate limited: {elapsed_secs}s elapsed, {required_secs}s required")]
    RateLimited {
        /// Seconds elapsed since last request
        elapsed_secs: u64,
        /// Seconds required between requests
        required_secs: u64,
    },

    /// Too many addresses in ADDR message (V-PEER-04)
    #[error("too many addresses: {count}, max {max}")]
    TooManyAddresses {
        /// Number of addresses received
        count: usize,
        /// Maximum allowed addresses
        max: usize,
    },

    /// Invalid transport type byte
    #[error("invalid transport type: 0x{0:02x}")]
    InvalidTransport(u8),

    /// I/O error during file operations
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Peer not found in store
    #[error("peer not found")]
    PeerNotFound,

    /// Store is closed
    #[error("store is closed")]
    StoreClosed,

    /// mDNS discovery error
    #[error("mDNS error: {0}")]
    MdnsError(String),
}
