//! Sync error types (SPEC_06 - Chain Sync)
//!
//! Error types for chain synchronization validation rules V-SYNC-01 through V-SYNC-06.

use crate::types::error::StorageError;

/// Errors that can occur during chain synchronization
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SyncError {
    /// V-SYNC-01: Invalid chain linkage at height
    #[error("V-SYNC-01: Invalid chain linkage at height {height}: prev_hash mismatch")]
    InvalidChainLinkage {
        /// Height where linkage failed
        height: u64,
        /// Expected previous hash
        expected: [u8; 32],
        /// Actual previous hash
        actual: [u8; 32],
    },

    /// V-SYNC-02: Insufficient PoW at height
    #[error("V-SYNC-02: Insufficient PoW at height {height}: required {required}, got {actual}")]
    InsufficientPoW {
        /// Height where PoW check failed
        height: u64,
        /// Required PoW (difficulty target)
        required: u64,
        /// Actual PoW
        actual: u64,
    },

    /// V-SYNC-03: Non-monotonic timestamp at height
    #[error("V-SYNC-03: Non-monotonic timestamp at height {height}: prev={prev_ts}, current={current_ts}")]
    NonMonotonicTimestamp {
        /// Height where timestamp check failed
        height: u64,
        /// Previous block timestamp
        prev_ts: u64,
        /// Current block timestamp
        current_ts: u64,
    },

    /// V-SYNC-04: Invalid merkle root at height
    #[error("V-SYNC-04: Invalid merkle root at height {height}")]
    InvalidMerkleRoot {
        /// Height where merkle root check failed
        height: u64,
        /// Expected merkle root
        expected: [u8; 32],
        /// Actual merkle root
        actual: [u8; 32],
    },

    /// V-SYNC-05: Block height outside requested range
    #[error("V-SYNC-05: Block height {actual} outside requested range [{start}, {end}]")]
    BlockOutOfRange {
        /// Actual height received
        actual: u64,
        /// Start of requested range
        start: u64,
        /// End of requested range
        end: u64,
    },

    /// V-SYNC-06: Response for unregistered request
    #[error("V-SYNC-06: Response for unregistered request from peer {peer_id:?}")]
    UnregisteredRequest {
        /// Peer ID that sent the unregistered response
        peer_id: [u8; 32],
        /// Start height of the unregistered request
        start: u64,
        /// End height of the unregistered request
        end: u64,
    },

    /// No peers available for synchronization
    #[error("No peers available for sync")]
    NoPeersAvailable,

    /// Peer connection timed out
    #[error("Peer {peer_id:?} timed out")]
    PeerTimeout {
        /// Peer ID that timed out
        peer_id: [u8; 32],
    },

    /// Storage operation failed
    #[error("Storage error: {0}")]
    Storage(String),

    /// Sync operation was cancelled
    #[error("Sync cancelled")]
    Cancelled,

    /// Invalid genesis block
    #[error("Invalid genesis block: {reason}")]
    InvalidGenesis {
        /// Reason why genesis is invalid
        reason: String,
    },

    /// Peer sent invalid data
    #[error("Invalid data from peer: {reason}")]
    InvalidPeerData {
        /// Description of what's wrong
        reason: String,
    },
}

impl From<StorageError> for SyncError {
    fn from(err: StorageError) -> Self {
        SyncError::Storage(err.to_string())
    }
}

impl SyncError {
    /// Returns a user-friendly error message suitable for display in UI.
    ///
    /// These messages avoid technical jargon and provide actionable guidance
    /// where possible.
    #[must_use]
    pub fn user_message(&self) -> &'static str {
        match self {
            SyncError::InvalidChainLinkage { .. } => {
                "The chain data appears corrupted. Try restarting the sync or connecting to different peers."
            }
            SyncError::InsufficientPoW { .. } => {
                "Received invalid block data. The node will automatically retry with other peers."
            }
            SyncError::NonMonotonicTimestamp { .. } => {
                "Received blocks with invalid timestamps. Trying other peers."
            }
            SyncError::InvalidMerkleRoot { .. } => {
                "Block verification failed. The node will retry with other peers."
            }
            SyncError::BlockOutOfRange { .. } => {
                "Received unexpected block data. Retrying sync."
            }
            SyncError::UnregisteredRequest { .. } => {
                "Received unsolicited data from a peer. This peer may be misconfigured."
            }
            SyncError::NoPeersAvailable => {
                "No peers available. Check your internet connection and try again."
            }
            SyncError::PeerTimeout { .. } => {
                "A peer stopped responding. The node will try other peers."
            }
            SyncError::Storage(_) => {
                "Failed to save sync data. Check available disk space."
            }
            SyncError::Cancelled => {
                "Sync was cancelled."
            }
            SyncError::InvalidGenesis { .. } => {
                "This node is on a different network. Check your network settings."
            }
            SyncError::InvalidPeerData { .. } => {
                "Received invalid data from a peer. Trying other peers."
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = SyncError::InvalidChainLinkage {
            height: 100,
            expected: [1u8; 32],
            actual: [2u8; 32],
        };
        assert!(err.to_string().contains("V-SYNC-01"));
        assert!(err.to_string().contains("100"));
    }

    #[test]
    fn test_insufficient_pow_error() {
        let err = SyncError::InsufficientPoW {
            height: 50,
            required: 30,
            actual: 10,
        };
        assert!(err.to_string().contains("V-SYNC-02"));
        assert!(err.to_string().contains("30"));
        assert!(err.to_string().contains("10"));
    }

    #[test]
    fn test_non_monotonic_timestamp_error() {
        let err = SyncError::NonMonotonicTimestamp {
            height: 25,
            prev_ts: 1001,
            current_ts: 1000,
        };
        assert!(err.to_string().contains("V-SYNC-03"));
    }

    #[test]
    fn test_block_out_of_range_error() {
        let err = SyncError::BlockOutOfRange {
            actual: 201,
            start: 100,
            end: 200,
        };
        assert!(err.to_string().contains("V-SYNC-05"));
        assert!(err.to_string().contains("201"));
        assert!(err.to_string().contains("[100, 200]"));
    }

    #[test]
    fn test_storage_error_conversion() {
        let storage_err = StorageError::DatabaseError("test error".to_string());
        let sync_err: SyncError = storage_err.into();
        assert!(matches!(sync_err, SyncError::Storage(_)));
    }

    #[test]
    fn test_user_message_returns_friendly_text() {
        // Test that user_message returns non-empty, user-friendly messages
        let errors = vec![
            SyncError::InvalidChainLinkage {
                height: 100,
                expected: [0u8; 32],
                actual: [1u8; 32],
            },
            SyncError::InsufficientPoW {
                height: 50,
                required: 30,
                actual: 10,
            },
            SyncError::NoPeersAvailable,
            SyncError::Cancelled,
        ];

        for err in errors {
            let msg = err.user_message();
            // User messages should not contain technical codes
            assert!(!msg.contains("V-SYNC-"), "User message should not contain V-SYNC codes: {msg}");
            // User messages should not be empty
            assert!(!msg.is_empty());
            // User messages should end with a period
            assert!(msg.ends_with('.'), "User message should end with period: {msg}");
        }
    }

    #[test]
    fn test_user_message_no_peers_is_actionable() {
        let err = SyncError::NoPeersAvailable;
        let msg = err.user_message();
        // This specific error should mention checking internet connection
        assert!(msg.contains("internet") || msg.contains("connection"));
    }
}
