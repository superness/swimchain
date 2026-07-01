//! ChainSyncer facade (SPEC_06 - Chain Sync)
//!
//! Unified public API for chain synchronization.

use std::sync::{Arc, RwLock};

use log::debug;
use tokio::sync::{broadcast, watch};
use tokio::task::JoinHandle;

use crate::storage::ChainStore;

use super::config::SyncConfig;
use super::continuous::continuous_sync_loop;
use super::error::SyncError;
use super::initial_sync::{initial_chain_sync, SyncStats};
use super::progress::{ProgressTracker, SyncProgressEvent};
use super::request_tracker::RequestTracker;
use super::state::SyncState;
use super::SyncPeerConnection;

/// Chain synchronization manager
///
/// Provides a unified API for initial and continuous chain synchronization.
///
/// # Example
///
/// ```no_run
/// use swimchain::sync::{ChainSyncer, SyncConfig};
///
/// let syncer = ChainSyncer::new(SyncConfig::default());
///
/// // Subscribe to progress events
/// let mut rx = syncer.subscribe_progress();
///
/// // Check current state
/// let state = syncer.state();
/// println!("Current state: {}", state);
/// ```
pub struct ChainSyncer {
    /// Sync configuration
    config: SyncConfig,
    /// Current sync state
    state: Arc<RwLock<SyncState>>,
    /// Request tracker for V-SYNC-06
    request_tracker: Arc<RequestTracker>,
    /// Shutdown signal sender
    shutdown_tx: watch::Sender<bool>,
    /// Shutdown signal receiver (for cloning)
    shutdown_rx: watch::Receiver<bool>,
    /// Progress event sender
    progress_sender: broadcast::Sender<SyncProgressEvent>,
}

impl ChainSyncer {
    /// Create a new chain syncer with the given configuration
    #[must_use]
    pub fn new(config: SyncConfig) -> Self {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let (progress_sender, _) = broadcast::channel(100);

        Self {
            config,
            state: Arc::new(RwLock::new(SyncState::Idle)),
            request_tracker: Arc::new(RequestTracker::new()),
            shutdown_tx,
            shutdown_rx,
            progress_sender,
        }
    }

    /// Get the current sync state
    #[must_use]
    pub fn state(&self) -> SyncState {
        *self.state.read().unwrap()
    }

    /// Subscribe to progress events
    #[must_use]
    pub fn subscribe_progress(&self) -> broadcast::Receiver<SyncProgressEvent> {
        self.progress_sender.subscribe()
    }

    /// Get the request tracker
    #[must_use]
    pub fn request_tracker(&self) -> Arc<RequestTracker> {
        self.request_tracker.clone()
    }

    /// Get the current configuration
    #[must_use]
    pub fn config(&self) -> &SyncConfig {
        &self.config
    }

    /// Check if currently syncing
    #[must_use]
    pub fn is_syncing(&self) -> bool {
        self.state().is_syncing()
    }

    /// Check if in continuous sync mode
    #[must_use]
    pub fn is_continuous(&self) -> bool {
        self.state().is_continuous()
    }

    /// Perform a single sync check iteration
    ///
    /// Phase 1 implementation: Returns Ok(()) immediately.
    /// No peers to sync from yet; actual sync requires peer integration.
    ///
    /// Future implementation will:
    /// 1. Check if already syncing (return early if so)
    /// 2. Query random connected peer for their chain tip
    /// 3. Compare cumulative work to our tip
    /// 4. If behind, initiate header sync
    ///
    /// # Errors
    ///
    /// Returns `SyncError` if sync check fails.
    pub async fn sync_once(&self) -> Result<(), SyncError> {
        if self.is_syncing() {
            debug!("Skipping sync_once: already syncing");
            return Ok(());
        }
        // Phase 1: Placeholder - sync integration pending
        debug!("sync_once executed (placeholder)");
        Ok(())
    }

    /// Start initial chain synchronization
    ///
    /// Performs a full sync from the best available peer.
    ///
    /// # Arguments
    ///
    /// * `fork_id` - Fork ID for this chain
    /// * `peers` - List of peers to sync from
    /// * `store` - Chain storage
    ///
    /// # Errors
    ///
    /// Returns error if sync fails.
    pub async fn start_initial_sync<P: SyncPeerConnection>(
        &self,
        fork_id: [u8; 32],
        peers: &[Arc<P>],
        store: &ChainStore,
    ) -> Result<SyncStats, SyncError> {
        *self.state.write().unwrap() = SyncState::SyncingHeaders {
            current: 0,
            target: 0,
        };

        let mut progress = ProgressTracker::new();

        // Forward progress events to our broadcast
        let sender = self.progress_sender.clone();
        let mut rx = progress.subscribe();
        tokio::spawn(async move {
            while let Ok(event) = rx.recv().await {
                let _ = sender.send(event);
            }
        });

        let result = initial_chain_sync(fork_id, peers, store, &self.config, &mut progress).await;

        match &result {
            Ok(_) => *self.state.write().unwrap() = SyncState::Idle,
            Err(_) => *self.state.write().unwrap() = SyncState::Error,
        }

        result
    }

    /// Start continuous sync loop
    ///
    /// Spawns a background task that periodically checks for new blocks.
    ///
    /// # Arguments
    ///
    /// * `fork_id` - Fork ID for this chain
    /// * `store` - Chain storage
    /// * `peers` - List of peers to sync from
    ///
    /// # Returns
    ///
    /// Returns a JoinHandle for the background task.
    pub fn start_continuous_sync<P: SyncPeerConnection + 'static>(
        &self,
        fork_id: [u8; 32],
        store: Arc<ChainStore>,
        peers: Arc<Vec<Arc<P>>>,
    ) -> JoinHandle<Result<(), SyncError>> {
        let config = self.config.clone();
        let shutdown = self.shutdown_rx.clone();
        let state = self.state.clone();

        tokio::spawn(async move {
            *state.write().unwrap() = SyncState::Continuous;
            let result = continuous_sync_loop(fork_id, store, peers, config, shutdown).await;
            *state.write().unwrap() = SyncState::Idle;
            result
        })
    }

    /// Stop all sync operations
    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
        *self.state.write().unwrap() = SyncState::Idle;
    }

    /// Reset syncer state (for testing)
    pub fn reset(&self) {
        *self.state.write().unwrap() = SyncState::Idle;
        self.request_tracker.clear();
    }
}

impl Default for ChainSyncer {
    fn default() -> Self {
        Self::new(SyncConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_syncer_creation() {
        let syncer = ChainSyncer::default();
        assert!(syncer.state().is_idle());
    }

    #[test]
    fn test_syncer_state_checks() {
        let syncer = ChainSyncer::default();

        assert!(syncer.state().is_idle());
        assert!(!syncer.is_syncing());
        assert!(!syncer.is_continuous());
    }

    #[test]
    fn test_syncer_subscribe() {
        let syncer = ChainSyncer::default();
        let _rx = syncer.subscribe_progress();
        // Just verify we can subscribe without error
    }

    #[test]
    fn test_syncer_request_tracker() {
        let syncer = ChainSyncer::default();
        let tracker = syncer.request_tracker();

        // Register a request
        let id = tracker.register_request([1u8; 32], 0, 100);
        assert_eq!(id, 1);
    }

    #[test]
    fn test_syncer_stop() {
        let syncer = ChainSyncer::default();
        syncer.stop();
        assert!(syncer.state().is_idle());
    }

    #[test]
    fn test_syncer_reset() {
        let syncer = ChainSyncer::default();
        let tracker = syncer.request_tracker();
        tracker.register_request([1u8; 32], 0, 100);

        syncer.reset();

        assert!(syncer.state().is_idle());
        assert_eq!(tracker.pending_count(), 0);
    }
}
