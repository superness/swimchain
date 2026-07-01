//! Chain status utilities (SPEC_06 - Chain Sync)
//!
//! Utilities for building and comparing chain status.

use crate::network::messages::ChainStatusPayload;
use crate::storage::ChainStore;

use super::error::SyncError;

/// Build ChainStatusPayload from local chain state
///
/// IMPORTANT: cumulative_work calculation is O(n) - iterates all blocks from genesis.
/// For production, cache this value in ChainStore and update incrementally.
///
/// # Errors
///
/// Returns error if storage operations fail.
pub fn build_local_status(store: &ChainStore) -> Result<ChainStatusPayload, SyncError> {
    let height = store.get_latest_height()?.unwrap_or(0);

    let tip_hash = if height == 0 {
        // Check if we have a genesis block at height 0
        store.get_root_hash_at_height(0)?.unwrap_or([0u8; 32])
    } else {
        store.get_root_hash_at_height(height)?.unwrap_or([0u8; 32])
    };

    let cumulative_work = calculate_cumulative_work(store, height)?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(ChainStatusPayload {
        height,
        tip_hash,
        cumulative_work,
        pending_content_count: 0, // Not tracking pending content yet
        timestamp,
    })
}

/// Calculate cumulative work from genesis to given height
///
/// WARNING: O(n) complexity - for production, should be cached and updated incrementally.
///
/// # Errors
///
/// Returns error if storage operations fail.
pub fn calculate_cumulative_work(store: &ChainStore, height: u64) -> Result<u64, SyncError> {
    let mut cumulative = 0u64;

    for h in 0..=height {
        if let Some(hash) = store.get_root_hash_at_height(h)? {
            if let Some(block) = store.get_root_block(&hash)? {
                cumulative = cumulative.saturating_add(block.total_pow);
            }
        }
    }

    Ok(cumulative)
}

/// Compare local vs remote chain status
///
/// Returns true if remote has more cumulative work (better chain)
#[must_use]
pub fn remote_has_more_work(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> bool {
    remote.cumulative_work > local.cumulative_work
}

/// Check if chains are at the same tip
#[must_use]
pub fn same_tip(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> bool {
    local.tip_hash == remote.tip_hash
}

/// Check if local is ahead of remote
#[must_use]
pub fn local_is_ahead(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> bool {
    local.cumulative_work > remote.cumulative_work
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_status(height: u64, tip: [u8; 32], work: u64) -> ChainStatusPayload {
        ChainStatusPayload {
            height,
            tip_hash: tip,
            cumulative_work: work,
            pending_content_count: 0,
            timestamp: 1_000_000,
        }
    }

    #[test]
    fn test_remote_has_more_work() {
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(105, [2u8; 32], 1500);

        assert!(remote_has_more_work(&local, &remote));
        assert!(!remote_has_more_work(&remote, &local));
    }

    #[test]
    fn test_same_tip() {
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(100, [1u8; 32], 1000);
        let different = make_status(100, [2u8; 32], 1000);

        assert!(same_tip(&local, &remote));
        assert!(!same_tip(&local, &different));
    }

    #[test]
    fn test_local_is_ahead() {
        let local = make_status(110, [3u8; 32], 2000);
        let remote = make_status(100, [1u8; 32], 1000);

        assert!(local_is_ahead(&local, &remote));
        assert!(!local_is_ahead(&remote, &local));
    }

    #[test]
    fn test_equal_work_not_ahead() {
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(100, [2u8; 32], 1000);

        assert!(!remote_has_more_work(&local, &remote));
        assert!(!local_is_ahead(&local, &remote));
    }
}
