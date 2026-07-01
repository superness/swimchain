//! Continuous sync loop (SPEC_06 - Chain Sync)
//!
//! Maintains chain synchronization after initial sync is complete.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::watch;
use tokio::time::sleep;

use crate::storage::ChainStore;

use super::chain_status::{build_local_status, remote_has_more_work};
use super::config::SyncConfig;
use super::error::SyncError;
use super::SyncPeerConnection;

/// Result of a single sync check
#[derive(Debug)]
pub enum SyncCheckResult {
    /// Already at chain tip
    AtTip,
    /// Synced new blocks
    Synced { new_blocks: u64 },
    /// No peers available
    NoPeers,
    /// Error during sync
    Error(SyncError),
}

/// Run continuous sync loop until shutdown signal
///
/// This function runs in a loop, periodically checking for new blocks
/// and syncing them from peers.
///
/// # Arguments
///
/// * `fork_id` - Fork ID for this chain (not currently used)
/// * `store` - Chain storage
/// * `peers` - List of peers to sync from
/// * `config` - Sync configuration
/// * `shutdown` - Watch receiver that signals shutdown when it receives `true`
///
/// # Returns
///
/// Returns Ok(()) when shutdown is received, or Err if a fatal error occurs.
pub async fn continuous_sync_loop<P: SyncPeerConnection + 'static>(
    _fork_id: [u8; 32],
    store: Arc<ChainStore>,
    peers: Arc<Vec<Arc<P>>>,
    config: SyncConfig,
    mut shutdown: watch::Receiver<bool>,
) -> Result<(), SyncError> {
    loop {
        tokio::select! {
            // Check for shutdown
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    return Ok(());
                }
            }

            // Wait for sync interval
            _ = sleep(Duration::from_secs(config.sync_interval_secs)) => {
                // Perform sync check
                match sync_check(&store, &peers, &config).await {
                    SyncCheckResult::AtTip => {
                        // Nothing to do
                    }
                    SyncCheckResult::Synced { new_blocks } => {
                        // Log sync
                        log::debug!("Synced {} new blocks", new_blocks);
                    }
                    SyncCheckResult::NoPeers => {
                        // No peers available
                        log::warn!("No peers available for sync check");
                    }
                    SyncCheckResult::Error(e) => {
                        // Log error but continue loop
                        log::error!("Sync check failed: {}", e);
                    }
                }
            }
        }
    }
}

/// Perform a single sync check
async fn sync_check<P: SyncPeerConnection>(
    store: &ChainStore,
    peers: &[Arc<P>],
    config: &SyncConfig,
) -> SyncCheckResult {
    // Build local status
    let local_status = match build_local_status(store) {
        Ok(status) => status,
        Err(e) => return SyncCheckResult::Error(e),
    };

    // Query peers for their tips
    let mut better_peers = Vec::new();
    for peer in peers.iter().take(config.query_peer_count) {
        if let Ok(remote_status) = peer.request_chain_status().await {
            if remote_has_more_work(&local_status, &remote_status) {
                better_peers.push((peer.clone(), remote_status));
            }
        }
    }

    if better_peers.is_empty() {
        if peers.is_empty() {
            return SyncCheckResult::NoPeers;
        }
        return SyncCheckResult::AtTip;
    }

    // Sync from best peer
    let (best_peer, best_tip) = better_peers
        .into_iter()
        .max_by_key(|(_, s)| s.cumulative_work)
        .unwrap();

    // Request missing blocks
    let start = local_status.height + 1;
    let end = best_tip.height;

    let timeout = Duration::from_millis(config.block_request_timeout_ms);
    let mut new_blocks = 0u64;

    for height in start..=end {
        let result =
            tokio::time::timeout(timeout, best_peer.request_blocks(height, height, true)).await;

        match result {
            Ok(Ok(blocks)) => {
                for block in blocks {
                    match store.put_root_block(&block) {
                        Ok(hash) => {
                            let _ = store.index_height(block.height, hash);
                            new_blocks += 1;
                        }
                        Err(e) => {
                            return SyncCheckResult::Error(e.into());
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                return SyncCheckResult::Error(e);
            }
            Err(_) => {
                return SyncCheckResult::Error(SyncError::PeerTimeout {
                    peer_id: best_peer.peer_id(),
                });
            }
        }
    }

    SyncCheckResult::Synced { new_blocks }
}

/// Run a limited number of sync checks (for testing)
pub async fn run_sync_checks<P: SyncPeerConnection>(
    store: &ChainStore,
    peers: &[Arc<P>],
    config: &SyncConfig,
    max_checks: usize,
) -> Vec<SyncCheckResult> {
    let mut results = Vec::new();

    for _ in 0..max_checks {
        results.push(sync_check(store, peers, config).await);
        sleep(Duration::from_millis(100)).await;
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_check_result_debug() {
        let result = SyncCheckResult::AtTip;
        assert!(format!("{:?}", result).contains("AtTip"));

        let result = SyncCheckResult::Synced { new_blocks: 10 };
        assert!(format!("{:?}", result).contains("10"));
    }
}
