//! Node error types
//!
//! Error types for node operations including lifecycle, network, storage, and sync errors.
//!
//! See SPEC_10 §7.2 for error category definitions.

use std::io;
use std::net::SocketAddr;
use std::path::PathBuf;
use thiserror::Error;

use crate::storage::ContentBlobHash;
use crate::transport::TransportError;

/// Node operation errors
///
/// Categorized by subsystem per SPEC_10 §7.1:
/// - Lifecycle: startup/shutdown state errors
/// - Network: connection and peer errors
/// - Storage: persistence errors
/// - Identity: key/signing errors
/// - Sync: chain synchronization errors
/// - Content: content retrieval errors
/// - Configuration: invalid settings
#[derive(Debug, Error)]
pub enum NodeError {
    // ========== Lifecycle Errors ==========
    /// Node is already running
    #[error("node is already running")]
    AlreadyRunning,

    /// Node is not running
    #[error("node is not running")]
    NotRunning,

    /// Shutdown failed
    #[error("shutdown failed: {0}")]
    ShutdownFailed(String),

    // ========== Network Errors ==========
    /// Failed to bind to address
    #[error("failed to bind to {0}: {1}")]
    BindFailed(SocketAddr, io::Error),

    /// Connection to peer failed
    #[error("connection failed to {0}: {1}")]
    ConnectionFailed(SocketAddr, TransportError),

    /// No available peers for operation
    #[error("no available peers for operation")]
    NoAvailablePeers,

    // ========== Storage Errors ==========
    /// Failed to open storage
    #[error("failed to open storage at {0}: {1}")]
    StorageOpen(PathBuf, String),

    /// Storage write failed
    #[error("storage write failed: {0}")]
    StorageWrite(String),

    /// Storage read failed
    #[error("storage read failed: {0}")]
    StorageRead(String),

    // ========== Identity Errors ==========
    /// Identity not found
    #[error("identity not found")]
    IdentityNotFound,

    /// Identity decryption failed
    #[error("identity decryption failed")]
    IdentityDecryptionFailed,

    // ========== Sync Errors ==========
    /// Sync failed
    #[error("sync failed: {0}")]
    SyncFailed(String),

    /// Fork conflict detected
    #[error("fork conflict detected: {0}")]
    ForkConflict(String),

    // ========== Content Errors ==========
    /// Content not found
    #[error("content not found: {0}")]
    ContentNotFound(ContentBlobHash),

    /// Content verification failed
    #[error("content verification failed")]
    ContentVerificationFailed,

    // ========== Configuration Errors ==========
    /// Invalid configuration
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),

    // ========== RPC Errors ==========
    /// RPC server error
    #[error("RPC error: {0}")]
    RpcError(String),

    // ========== Transport Passthrough ==========
    /// Transport layer error
    #[error("transport error: {0}")]
    Transport(#[from] TransportError),
}

impl NodeError {
    /// Returns true if this is a lifecycle error
    pub fn is_lifecycle(&self) -> bool {
        matches!(
            self,
            NodeError::AlreadyRunning | NodeError::NotRunning | NodeError::ShutdownFailed(_)
        )
    }

    /// Returns true if this is a network error
    pub fn is_network(&self) -> bool {
        matches!(
            self,
            NodeError::BindFailed(_, _)
                | NodeError::ConnectionFailed(_, _)
                | NodeError::NoAvailablePeers
                | NodeError::Transport(_)
        )
    }

    /// Returns true if this is a storage error
    pub fn is_storage(&self) -> bool {
        matches!(
            self,
            NodeError::StorageOpen(_, _) | NodeError::StorageWrite(_) | NodeError::StorageRead(_)
        )
    }

    /// Returns true if this error is recoverable (can retry)
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            NodeError::ConnectionFailed(_, _)
                | NodeError::NoAvailablePeers
                | NodeError::SyncFailed(_)
                | NodeError::ContentNotFound(_)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = NodeError::AlreadyRunning;
        assert_eq!(err.to_string(), "node is already running");

        let err = NodeError::NotRunning;
        assert_eq!(err.to_string(), "node is not running");

        let err = NodeError::ShutdownFailed("timeout".to_string());
        assert_eq!(err.to_string(), "shutdown failed: timeout");

        let err = NodeError::InvalidConfig("min_peers > target_peers".to_string());
        assert!(err.to_string().contains("invalid configuration"));
    }

    #[test]
    fn test_bind_failed_display() {
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        let io_err = io::Error::new(io::ErrorKind::AddrInUse, "address in use");
        let err = NodeError::BindFailed(addr, io_err);
        assert!(err.to_string().contains("127.0.0.1:9735"));
        assert!(err.to_string().contains("address in use"));
    }

    #[test]
    fn test_storage_open_display() {
        let path = PathBuf::from("/data/swimchain");
        let err = NodeError::StorageOpen(path, "permission denied".to_string());
        assert!(err.to_string().contains("/data/swimchain"));
        assert!(err.to_string().contains("permission denied"));
    }

    #[test]
    fn test_from_transport_error() {
        let transport_err = TransportError::ConnectionClosed;
        let node_err: NodeError = transport_err.into();
        assert!(matches!(node_err, NodeError::Transport(_)));
        assert!(node_err.to_string().contains("transport error"));
    }

    #[test]
    fn test_is_lifecycle() {
        assert!(NodeError::AlreadyRunning.is_lifecycle());
        assert!(NodeError::NotRunning.is_lifecycle());
        assert!(NodeError::ShutdownFailed("x".into()).is_lifecycle());
        assert!(!NodeError::NoAvailablePeers.is_lifecycle());
    }

    #[test]
    fn test_is_network() {
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        assert!(NodeError::BindFailed(addr, io::Error::new(io::ErrorKind::Other, "")).is_network());
        assert!(NodeError::NoAvailablePeers.is_network());
        assert!(NodeError::Transport(TransportError::ConnectionClosed).is_network());
        assert!(!NodeError::AlreadyRunning.is_network());
    }

    #[test]
    fn test_is_storage() {
        let path = PathBuf::from("/data");
        assert!(NodeError::StorageOpen(path.clone(), "x".into()).is_storage());
        assert!(NodeError::StorageWrite("x".into()).is_storage());
        assert!(NodeError::StorageRead("x".into()).is_storage());
        assert!(!NodeError::AlreadyRunning.is_storage());
    }

    #[test]
    fn test_is_recoverable() {
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        assert!(
            NodeError::ConnectionFailed(addr, TransportError::ConnectionClosed).is_recoverable()
        );
        assert!(NodeError::NoAvailablePeers.is_recoverable());
        assert!(NodeError::SyncFailed("timeout".into()).is_recoverable());
        assert!(!NodeError::AlreadyRunning.is_recoverable());
        assert!(!NodeError::InvalidConfig("x".into()).is_recoverable());
    }
}
