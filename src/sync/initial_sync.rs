//! Initial chain sync coordinator (SPEC_06 - Chain Sync)
//!
//! Coordinates the initial synchronization of a new node with the network.

use std::sync::Arc;

use crate::storage::ChainStore;

use super::block_download::identify_relevant_blocks;
use super::config::SyncConfig;
use super::error::SyncError;
use super::header_sync::verify_header_chain;
use super::progress::{ProgressTracker, SyncPhase, SyncProgressEvent};
use super::SyncPeerConnection;

/// Statistics from a completed sync operation
#[derive(Debug, Clone)]
pub struct SyncStats {
    /// Number of headers synced
    pub headers_synced: u64,
    /// Number of blocks synced (with content)
    pub blocks_synced: u64,
    /// Total bytes downloaded
    pub bytes_downloaded: u64,
    /// Total sync duration in seconds
    pub duration_secs: f64,
}

impl SyncStats {
    /// Create empty stats
    #[must_use]
    pub fn empty() -> Self {
        Self {
            headers_synced: 0,
            blocks_synced: 0,
            bytes_downloaded: 0,
            duration_secs: 0.0,
        }
    }

    /// Calculate headers per second rate
    #[must_use]
    pub fn headers_per_sec(&self) -> f64 {
        if self.duration_secs <= 0.0 {
            return 0.0;
        }
        self.headers_synced as f64 / self.duration_secs
    }

    /// Calculate blocks per second rate
    #[must_use]
    pub fn blocks_per_sec(&self) -> f64 {
        if self.duration_secs <= 0.0 {
            return 0.0;
        }
        self.blocks_synced as f64 / self.duration_secs
    }
}

/// Perform initial chain sync
///
/// This function coordinates the full initial sync process:
/// 1. Query peers for chain status
/// 2. Download headers from best peer
/// 3. Verify header chain
/// 4. Identify non-decayed blocks
/// 5. Download block content for relevant blocks
/// 6. Store blocks in ChainStore
///
/// # Arguments
///
/// * `fork_id` - Fork ID for this chain (not currently used)
/// * `peers` - List of peers to sync from
/// * `store` - Chain storage
/// * `config` - Sync configuration
/// * `progress` - Progress tracker for events
///
/// # Errors
///
/// Returns error if sync fails for any reason.
pub async fn initial_chain_sync<P: SyncPeerConnection>(
    _fork_id: [u8; 32],
    peers: &[Arc<P>],
    store: &ChainStore,
    config: &SyncConfig,
    progress: &mut ProgressTracker,
) -> Result<SyncStats, SyncError> {
    let start_time = std::time::Instant::now();

    progress.emit(SyncProgressEvent::Started);

    // Phase 1: Query peers for chain status
    progress.set_phase(SyncPhase::QueryingPeers);

    let mut chain_tips = Vec::new();
    for peer in peers.iter().take(config.query_peer_count) {
        match peer.request_chain_status().await {
            Ok(status) => chain_tips.push((peer.clone(), status)),
            Err(_) => continue, // Skip unresponsive peers
        }
    }

    if chain_tips.is_empty() {
        return Err(SyncError::NoPeersAvailable);
    }

    progress.emit(SyncProgressEvent::PeerFound {
        peer_count: chain_tips.len(),
    });

    // Select best chain (most cumulative work)
    let (best_peer, best_tip) = chain_tips
        .into_iter()
        .max_by_key(|(_, status)| status.cumulative_work)
        .unwrap();

    let target_height = best_tip.height;
    let local_height = store.get_latest_height()?.unwrap_or(0);

    if target_height <= local_height {
        // Already synced
        return Ok(SyncStats {
            headers_synced: 0,
            blocks_synced: 0,
            bytes_downloaded: 0,
            duration_secs: start_time.elapsed().as_secs_f64(),
        });
    }

    // Phase 2: Download headers
    progress.set_phase(SyncPhase::DownloadingHeaders);

    let mut all_headers = Vec::new();
    let mut current = local_height + 1;

    while current <= target_height {
        let end = std::cmp::min(current + config.header_batch_size as u64 - 1, target_height);

        let headers = best_peer
            .request_headers(current, end, config.header_batch_size)
            .await?;

        progress.emit(SyncProgressEvent::HeadersReceived {
            count: headers.len() as u64,
            total: target_height - local_height,
        });

        all_headers.extend(headers);
        current = end + 1;
    }

    // Phase 3: Verify header chain
    progress.set_phase(SyncPhase::VerifyingHeaders);

    if config.verify_pow {
        verify_header_chain(&all_headers)?;
    }

    // Phase 4: Identify non-decayed blocks
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let relevant_heights = identify_relevant_blocks(&all_headers, current_time);

    // Phase 5: Download post records for relevant blocks
    progress.set_phase(SyncPhase::DownloadingBlocks);

    let mut blocks_synced = 0u64;
    for height in relevant_heights {
        let blocks = best_peer.request_blocks(height, height, true).await?;

        for block in blocks {
            // Store in ChainStore
            let hash = store.put_root_block(&block)?;
            store.index_height(block.height, hash)?;
            blocks_synced += 1;

            progress.emit(SyncProgressEvent::BlockReceived {
                height: block.height,
            });
        }
    }

    // Also store headers for blocks we didn't download content for
    for header in &all_headers {
        if !store.has_root_block(&header.hash())? {
            let hash = store.put_root_block(header)?;
            store.index_height(header.height, hash)?;
        }
    }

    progress.set_phase(SyncPhase::Complete);

    let stats = SyncStats {
        headers_synced: all_headers.len() as u64,
        blocks_synced,
        bytes_downloaded: progress.bytes_downloaded,
        duration_secs: start_time.elapsed().as_secs_f64(),
    };

    progress.emit(SyncProgressEvent::Complete {
        blocks_synced: stats.blocks_synced,
        duration_secs: stats.duration_secs,
    });

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_stats_empty() {
        let stats = SyncStats::empty();
        assert_eq!(stats.headers_synced, 0);
        assert_eq!(stats.blocks_synced, 0);
    }

    #[test]
    fn test_sync_stats_rates() {
        let stats = SyncStats {
            headers_synced: 1000,
            blocks_synced: 500,
            bytes_downloaded: 0,
            duration_secs: 10.0,
        };

        assert!((stats.headers_per_sec() - 100.0).abs() < 0.001);
        assert!((stats.blocks_per_sec() - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_sync_stats_zero_duration() {
        let stats = SyncStats {
            headers_synced: 100,
            blocks_synced: 50,
            bytes_downloaded: 0,
            duration_secs: 0.0,
        };

        assert_eq!(stats.headers_per_sec(), 0.0);
        assert_eq!(stats.blocks_per_sec(), 0.0);
    }
}
