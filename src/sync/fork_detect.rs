//! Fork detection (SPEC_06 - Chain Sync)
//!
//! Detects and handles chain forks during synchronization.

use std::collections::HashMap;

use crate::blocks::RootBlock;
use crate::network::messages::ChainStatusPayload;
use crate::storage::ChainStore;

use super::error::SyncError;

/// Type of fork relationship between local and remote chains
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ForkType {
    /// Tips match - chains are identical
    SameChain,
    /// Remote is ahead on same chain - need to extend
    ExtensionNeeded {
        /// Height to start syncing from
        missing_from: u64,
        /// Height to sync to
        to: u64,
    },
    /// Chains have diverged - fork detected
    ForkDetected {
        /// Height where fork occurred
        fork_height: u64,
    },
    /// Local is ahead of remote
    LocalAhead,
}

impl std::fmt::Display for ForkType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ForkType::SameChain => write!(f, "Same chain"),
            ForkType::ExtensionNeeded { missing_from, to } => {
                write!(f, "Extension needed: {} to {}", missing_from, to)
            }
            ForkType::ForkDetected { fork_height } => {
                write!(f, "Fork detected at height {}", fork_height)
            }
            ForkType::LocalAhead => write!(f, "Local ahead"),
        }
    }
}

/// Detect fork relationship between local and remote chain
///
/// Based on chain status payloads, determines whether chains are:
/// - Identical (same tip)
/// - Extension (remote ahead, same chain)
/// - Fork (diverged)
/// - Local ahead
#[must_use]
pub fn detect_fork(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> ForkType {
    // Same tip - chains identical
    if local.tip_hash == remote.tip_hash {
        return ForkType::SameChain;
    }

    // Remote has more work - either extension or fork
    if remote.cumulative_work > local.cumulative_work {
        // Can't determine fork height from status alone
        // Caller should use find_common_ancestor for precise detection
        ForkType::ExtensionNeeded {
            missing_from: local.height + 1,
            to: remote.height,
        }
    } else if local.cumulative_work > remote.cumulative_work {
        // Local has more work - we're ahead
        ForkType::LocalAhead
    } else {
        // Equal work but different tips - fork at current height
        ForkType::ForkDetected {
            fork_height: local.height.min(remote.height),
        }
    }
}

/// Find common ancestor between local chain and remote headers using binary search
///
/// Returns the highest height where local hash matches remote hash.
/// If no common ancestor found, returns None (completely disjoint chains).
///
/// # Errors
///
/// Returns error if storage operations fail.
pub fn find_common_ancestor(
    store: &ChainStore,
    remote_headers: &[RootBlock],
) -> Result<Option<u64>, SyncError> {
    if remote_headers.is_empty() {
        return Ok(None);
    }

    // Build a map of remote height -> hash for O(1) lookup
    let remote_hashes: HashMap<u64, [u8; 32]> = remote_headers
        .iter()
        .map(|h| (h.height, h.hash()))
        .collect();

    // Get height range from remote headers
    let min_height = remote_headers.iter().map(|h| h.height).min().unwrap_or(0);
    let max_height = remote_headers.iter().map(|h| h.height).max().unwrap_or(0);

    // Binary search for common ancestor
    let mut low = min_height;
    let mut high = max_height;
    let mut result = None;

    while low <= high {
        let mid = low + (high - low) / 2;

        // Check if hashes match at mid
        if let Some(remote_hash) = remote_hashes.get(&mid) {
            if let Some(local_hash) = store.get_root_hash_at_height(mid)? {
                if &local_hash == remote_hash {
                    // Match found, search higher for better match
                    result = Some(mid);
                    if mid == high {
                        break;
                    }
                    low = mid + 1;
                } else {
                    // Mismatch, search lower
                    if mid == 0 {
                        break;
                    }
                    high = mid - 1;
                }
            } else {
                // Local doesn't have this height, search lower
                if mid == 0 {
                    break;
                }
                high = mid - 1;
            }
        } else {
            // Remote doesn't have this height, search lower
            if mid == 0 {
                break;
            }
            high = mid - 1;
        }
    }

    Ok(result)
}

/// Determine if we should switch to remote chain (has more work)
#[must_use]
pub fn should_switch_chain(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> bool {
    remote.cumulative_work > local.cumulative_work
}

/// Linear search for common ancestor (simpler but slower)
///
/// Iterates from highest to lowest height until a match is found.
/// Use when binary search isn't possible or for small ranges.
pub fn find_common_ancestor_linear(
    store: &ChainStore,
    remote_headers: &[RootBlock],
) -> Result<Option<u64>, SyncError> {
    // Sort by height descending
    let mut sorted: Vec<_> = remote_headers.iter().collect();
    sorted.sort_by(|a, b| b.height.cmp(&a.height));

    for header in sorted {
        if let Some(local_hash) = store.get_root_hash_at_height(header.height)? {
            if local_hash == header.hash() {
                return Ok(Some(header.height));
            }
        }
    }

    Ok(None)
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
    fn test_detect_fork_same_chain() {
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(100, [1u8; 32], 1000);

        assert_eq!(detect_fork(&local, &remote), ForkType::SameChain);
    }

    #[test]
    fn test_detect_fork_extension_needed() {
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(150, [2u8; 32], 1500);

        match detect_fork(&local, &remote) {
            ForkType::ExtensionNeeded { missing_from, to } => {
                assert_eq!(missing_from, 101);
                assert_eq!(to, 150);
            }
            other => panic!("Expected ExtensionNeeded, got {:?}", other),
        }
    }

    #[test]
    fn test_detect_fork_local_ahead() {
        let local = make_status(150, [1u8; 32], 2000);
        let remote = make_status(100, [2u8; 32], 1000);

        assert_eq!(detect_fork(&local, &remote), ForkType::LocalAhead);
    }

    #[test]
    fn test_detect_fork_diverged() {
        // Same height, same work, different tips
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(100, [2u8; 32], 1000);

        match detect_fork(&local, &remote) {
            ForkType::ForkDetected { fork_height } => {
                assert_eq!(fork_height, 100);
            }
            other => panic!("Expected ForkDetected, got {:?}", other),
        }
    }

    #[test]
    fn test_detect_fork_remote_lower_different_work() {
        // Remote is lower and has less work - local is ahead
        let local = make_status(100, [1u8; 32], 1000);
        let remote = make_status(90, [2u8; 32], 900);

        assert_eq!(detect_fork(&local, &remote), ForkType::LocalAhead);
    }

    #[test]
    fn test_should_switch_chain() {
        let local = make_status(100, [1u8; 32], 1000);
        let better = make_status(150, [2u8; 32], 1500);
        let worse = make_status(80, [3u8; 32], 800);
        let equal = make_status(100, [4u8; 32], 1000);

        assert!(should_switch_chain(&local, &better));
        assert!(!should_switch_chain(&local, &worse));
        assert!(!should_switch_chain(&local, &equal));
    }

    #[test]
    fn test_fork_type_display() {
        assert_eq!(ForkType::SameChain.to_string(), "Same chain");
        assert_eq!(
            ForkType::ExtensionNeeded {
                missing_from: 100,
                to: 200
            }
            .to_string(),
            "Extension needed: 100 to 200"
        );
        assert_eq!(
            ForkType::ForkDetected { fork_height: 50 }.to_string(),
            "Fork detected at height 50"
        );
    }
}
