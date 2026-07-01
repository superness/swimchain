//! Block download and validation (V-SYNC-04, V-SYNC-05)
//!
//! Implements block content validation during sync.

use crate::blocks::{RootBlock, SpaceBlock};
use crate::types::constants::DECAY_FLOOR_SECS;

use super::error::SyncError;

/// Identify blocks with non-decayed content (need to download post records)
///
/// Filters blocks where timestamp > (current_time - DECAY_FLOOR_SECS)
/// per SPEC_02 §4.1 decay rules.
#[must_use]
pub fn identify_relevant_blocks(headers: &[RootBlock], current_time: u64) -> Vec<u64> {
    let decay_threshold = current_time.saturating_sub(DECAY_FLOOR_SECS);

    headers
        .iter()
        .filter(|h| h.timestamp > decay_threshold)
        .map(|h| h.height)
        .collect()
}

/// Validate block content matches header claims (V-SYNC-04)
///
/// Verifies:
/// 1. Merkle root of space_block hashes matches header.merkle_root
/// 2. Sum of space_block.total_pow matches header.total_pow
///
/// # Errors
///
/// Returns error if validation fails.
pub fn validate_block_content(
    root: &RootBlock,
    space_blocks: &[SpaceBlock],
) -> Result<(), SyncError> {
    // Use RootBlock's existing merkle root verification
    if let Err(_) = root.verify_merkle_root() {
        return Err(SyncError::InvalidMerkleRoot {
            height: root.height,
            expected: root.merkle_root,
            actual: [0u8; 32], // Computed differs
        });
    }

    // Verify PoW sum
    let computed_pow: u64 = space_blocks.iter().map(|sb| sb.total_pow).sum();
    if computed_pow != root.total_pow {
        return Err(SyncError::InsufficientPoW {
            height: root.height,
            required: root.total_pow,
            actual: computed_pow,
        });
    }

    Ok(())
}

/// Validate all blocks are within requested range (V-SYNC-05)
///
/// # Errors
///
/// Returns error if any block is outside the range.
pub fn validate_block_range(blocks: &[RootBlock], start: u64, end: u64) -> Result<(), SyncError> {
    for block in blocks {
        if block.height < start || block.height > end {
            return Err(SyncError::BlockOutOfRange {
                actual: block.height,
                start,
                end,
            });
        }
    }
    Ok(())
}

/// Validate blocks are sorted by height ascending
pub fn validate_sorted_ascending(blocks: &[RootBlock]) -> Result<(), SyncError> {
    for i in 1..blocks.len() {
        if blocks[i].height <= blocks[i - 1].height {
            return Err(SyncError::InvalidPeerData {
                reason: format!(
                    "Blocks not sorted: height {} after {}",
                    blocks[i].height,
                    blocks[i - 1].height
                ),
            });
        }
    }
    Ok(())
}

/// Calculate how many blocks contain non-decayed content
#[must_use]
pub fn count_relevant_blocks(headers: &[RootBlock], current_time: u64) -> usize {
    identify_relevant_blocks(headers, current_time).len()
}

/// Estimate download size for block range (rough estimate based on space block count)
#[must_use]
pub fn estimate_download_size(headers: &[RootBlock]) -> u64 {
    headers
        .iter()
        .map(|h| {
            // Rough estimate: 1KB base + 500 bytes per space block
            1024 + (h.space_block_count as u64 * 500)
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_header(height: u64, timestamp: u64, pow: u64) -> RootBlock {
        RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: [0u8; 32],
            timestamp,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: pow,
            difficulty_target: 30,
            height,
            cumulative_pow: pow,
            block_creator: [0u8; 32],
        }
    }

    #[test]
    fn test_identify_relevant_blocks() {
        let current_time = 1_000_000u64;

        let headers = vec![
            create_test_header(0, current_time - DECAY_FLOOR_SECS - 1000, 30), // Decayed
            create_test_header(1, current_time - DECAY_FLOOR_SECS + 1000, 30), // Relevant
            create_test_header(2, current_time - 1000, 30),                    // Relevant
            create_test_header(3, current_time - DECAY_FLOOR_SECS - 500, 30),  // Decayed
            create_test_header(4, current_time, 30),                           // Relevant
        ];

        let relevant = identify_relevant_blocks(&headers, current_time);

        assert_eq!(relevant.len(), 3);
        assert!(relevant.contains(&1));
        assert!(relevant.contains(&2));
        assert!(relevant.contains(&4));
        assert!(!relevant.contains(&0));
        assert!(!relevant.contains(&3));
    }

    #[test]
    fn test_identify_relevant_blocks_all_decayed() {
        let current_time = 1_000_000u64;
        let old_time = current_time - DECAY_FLOOR_SECS - 10_000;

        let headers = vec![
            create_test_header(0, old_time, 30),
            create_test_header(1, old_time + 100, 30),
            create_test_header(2, old_time + 200, 30),
        ];

        let relevant = identify_relevant_blocks(&headers, current_time);
        assert!(relevant.is_empty());
    }

    #[test]
    fn test_identify_relevant_blocks_all_relevant() {
        let current_time = 1_000_000u64;
        let recent_time = current_time - 1000;

        let headers = vec![
            create_test_header(0, recent_time, 30),
            create_test_header(1, recent_time + 100, 30),
            create_test_header(2, recent_time + 200, 30),
        ];

        let relevant = identify_relevant_blocks(&headers, current_time);
        assert_eq!(relevant.len(), 3);
    }

    #[test]
    fn test_validate_block_range_within() {
        let blocks = vec![
            create_test_header(100, 1_000_000, 30),
            create_test_header(150, 1_001_000, 30),
            create_test_header(200, 1_002_000, 30),
        ];

        assert!(validate_block_range(&blocks, 100, 200).is_ok());
    }

    #[test]
    fn test_validate_block_range_outside_low() {
        let blocks = vec![
            create_test_header(99, 1_000_000, 30), // Below start
            create_test_header(150, 1_001_000, 30),
        ];

        let result = validate_block_range(&blocks, 100, 200);
        assert!(matches!(
            result,
            Err(SyncError::BlockOutOfRange {
                actual: 99,
                start: 100,
                end: 200
            })
        ));
    }

    #[test]
    fn test_validate_block_range_outside_high() {
        let blocks = vec![
            create_test_header(100, 1_000_000, 30),
            create_test_header(201, 1_001_000, 30), // Above end
        ];

        let result = validate_block_range(&blocks, 100, 200);
        assert!(matches!(
            result,
            Err(SyncError::BlockOutOfRange {
                actual: 201,
                start: 100,
                end: 200
            })
        ));
    }

    #[test]
    fn test_validate_sorted_ascending() {
        let blocks = vec![
            create_test_header(1, 1_000_000, 30),
            create_test_header(2, 1_001_000, 30),
            create_test_header(3, 1_002_000, 30),
        ];

        assert!(validate_sorted_ascending(&blocks).is_ok());
    }

    #[test]
    fn test_validate_sorted_descending_fails() {
        let blocks = vec![
            create_test_header(3, 1_000_000, 30),
            create_test_header(2, 1_001_000, 30), // Out of order
        ];

        let result = validate_sorted_ascending(&blocks);
        assert!(matches!(result, Err(SyncError::InvalidPeerData { .. })));
    }

    #[test]
    fn test_validate_sorted_equal_fails() {
        let blocks = vec![
            create_test_header(2, 1_000_000, 30),
            create_test_header(2, 1_001_000, 30), // Same height
        ];

        let result = validate_sorted_ascending(&blocks);
        assert!(matches!(result, Err(SyncError::InvalidPeerData { .. })));
    }

    #[test]
    fn test_count_relevant_blocks() {
        let current_time = 1_000_000u64;

        let headers = vec![
            create_test_header(0, current_time - DECAY_FLOOR_SECS - 1000, 30),
            create_test_header(1, current_time - 1000, 30),
            create_test_header(2, current_time, 30),
        ];

        assert_eq!(count_relevant_blocks(&headers, current_time), 2);
    }

    #[test]
    fn test_estimate_download_size() {
        let headers = vec![
            create_test_header(0, 1_000_000, 30),
            create_test_header(1, 1_001_000, 30),
        ];

        let estimate = estimate_download_size(&headers);
        assert!(estimate > 0);
    }
}
