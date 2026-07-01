//! Chain Synchronization (SPEC_06 §4.4, §4.5 - Milestone 2.4)
//!
//! Implements header-first chain synchronization with the following features:
//!
//! - **Header-first sync**: Download and verify headers before blocks
//! - **Block download**: Download post records only (not content blobs)
//! - **Sync progress tracking**: Broadcast events for sync progress
//! - **Continuous sync loop**: Keep node current with network
//! - **Fork detection**: Detect and handle chain forks
//!
//! # Validation Rules
//!
//! - **V-SYNC-01**: Chain linkage - prev_root_hash matches predecessor's hash
//! - **V-SYNC-02**: PoW meets difficulty - total_pow >= difficulty_target
//! - **V-SYNC-03**: Timestamps monotonically increasing
//! - **V-SYNC-04**: Content signatures valid (merkle root verification)
//! - **V-SYNC-05**: Blocks within requested range
//! - **V-SYNC-06**: Response matches registered request
//!
//! # Example
//!
//! ```no_run
//! use swimchain::sync::{ChainSyncer, SyncConfig};
//!
//! // Create syncer with default config
//! let syncer = ChainSyncer::new(SyncConfig::default());
//!
//! // Check current state
//! let state = syncer.state();
//! println!("Sync state: {}", state);
//! ```

pub mod block_download;
pub mod chain_status;
pub mod config;
pub mod continuous;
pub mod error;
pub mod fork_detect;
pub mod header_sync;
pub mod initial_sync;
pub mod priority_queue;
pub mod progress;
pub mod request_tracker;
pub mod state;
pub mod subscription;
pub mod syncer;

// Re-export main types
pub use config::SyncConfig;
pub use error::SyncError;
pub use priority_queue::{
    PrioritizedRequest, SyncPriorityQueue, PRIORITY_QUEUE_ACTIVATION_THRESHOLD,
};
pub use progress::{ProgressTracker, SyncPhase, SyncProgress, SyncProgressEvent};
pub use state::SyncState;
pub use subscription::{BranchId, BranchSubscriptionManager, SubscriptionEntry};
pub use syncer::ChainSyncer;

use crate::blocks::RootBlock;
use crate::network::messages::ChainStatusPayload;

/// Trait for sync peer communication
///
/// This trait abstracts peer communication for testing purposes.
/// Real implementations would use the transport layer.
#[async_trait::async_trait]
pub trait SyncPeerConnection: Send + Sync {
    /// Get the peer's ID
    fn peer_id(&self) -> [u8; 32];

    /// Request the peer's chain status
    async fn request_chain_status(&self) -> Result<ChainStatusPayload, SyncError>;

    /// Request headers in a range
    async fn request_headers(
        &self,
        start: u64,
        end: u64,
        max: u16,
    ) -> Result<Vec<RootBlock>, SyncError>;

    /// Request blocks in a range
    async fn request_blocks(
        &self,
        start: u64,
        end: u64,
        include_content: bool,
    ) -> Result<Vec<RootBlock>, SyncError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all exports are accessible
        let _ = SyncState::Idle;
        let _ = SyncConfig::default();
        let _ = SyncPhase::QueryingPeers;
    }
}
