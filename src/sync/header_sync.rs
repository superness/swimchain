//! Header chain verification (V-SYNC-01, V-SYNC-02, V-SYNC-03)
//!
//! Implements header-first synchronization validation.

use crate::blocks::RootBlock;

use super::error::SyncError;

/// Verify a chain of headers (V-SYNC-01, V-SYNC-02, V-SYNC-03)
///
/// Validates:
/// - V-SYNC-01: Chain linkage (prev_root_hash matches predecessor's hash)
/// - V-SYNC-02: PoW meets difficulty (total_pow >= difficulty_target)
/// - V-SYNC-03: Timestamps monotonically increasing
///
/// Assumes headers are in order from lowest to highest height.
///
/// # Errors
///
/// Returns the first validation error encountered.
pub fn verify_header_chain(headers: &[RootBlock]) -> Result<(), SyncError> {
    if headers.is_empty() {
        return Ok(());
    }

    // If first header is genesis, verify it separately
    if headers[0].is_genesis() {
        verify_genesis_header(&headers[0])?;
    }

    // Verify chain linkage between consecutive headers
    for i in 1..headers.len() {
        let prev = &headers[i - 1];
        let current = &headers[i];
        verify_single_header(current, prev)?;
    }

    Ok(())
}

/// Verify a single header against its predecessor
///
/// # Errors
///
/// Returns error if any validation rule fails.
pub fn verify_single_header(header: &RootBlock, prev: &RootBlock) -> Result<(), SyncError> {
    // V-SYNC-01: Chain linkage - prev_root_hash must match predecessor's hash
    let expected_prev = prev.hash();
    if header.prev_root_hash != expected_prev {
        return Err(SyncError::InvalidChainLinkage {
            height: header.height,
            expected: expected_prev,
            actual: header.prev_root_hash,
        });
    }

    // V-SYNC-02: PoW meets difficulty - use RootBlock's existing method
    // RootBlock.meets_difficulty() checks total_pow >= difficulty_target
    if !header.meets_difficulty() {
        return Err(SyncError::InsufficientPoW {
            height: header.height,
            required: header.difficulty_target,
            actual: header.total_pow,
        });
    }

    // V-SYNC-03: Timestamps must be monotonically increasing
    if header.timestamp <= prev.timestamp {
        return Err(SyncError::NonMonotonicTimestamp {
            height: header.height,
            prev_ts: prev.timestamp,
            current_ts: header.timestamp,
        });
    }

    Ok(())
}

/// Verify genesis header constraints
///
/// # Errors
///
/// Returns error if genesis block is invalid.
pub fn verify_genesis_header(genesis: &RootBlock) -> Result<(), SyncError> {
    if !genesis.is_genesis() {
        return Err(SyncError::InvalidGenesis {
            reason: "Block is not a genesis block".to_string(),
        });
    }

    genesis
        .verify_genesis()
        .map_err(|e| SyncError::InvalidGenesis {
            reason: e.to_string(),
        })
}

/// Verify headers connect to our local chain
///
/// Checks that the first header's prev_root_hash matches our tip.
pub fn verify_headers_connect(
    headers: &[RootBlock],
    local_tip_hash: [u8; 32],
) -> Result<(), SyncError> {
    if headers.is_empty() {
        return Ok(());
    }

    if headers[0].prev_root_hash != local_tip_hash {
        return Err(SyncError::InvalidChainLinkage {
            height: headers[0].height,
            expected: local_tip_hash,
            actual: headers[0].prev_root_hash,
        });
    }

    Ok(())
}

/// Verify height sequence is consecutive
pub fn verify_height_sequence(headers: &[RootBlock]) -> Result<(), SyncError> {
    for i in 1..headers.len() {
        let expected_height = headers[i - 1].height + 1;
        if headers[i].height != expected_height {
            return Err(SyncError::InvalidPeerData {
                reason: format!(
                    "Non-consecutive heights: expected {}, got {}",
                    expected_height, headers[i].height
                ),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_valid_chain(count: usize, base_timestamp: u64, difficulty: u64) -> Vec<RootBlock> {
        let mut headers = Vec::with_capacity(count);
        let mut prev_hash = [0u8; 32]; // Genesis

        for i in 0..count {
            let header = RootBlock {
                version: RootBlock::CURRENT_VERSION,
                prev_root_hash: prev_hash,
                timestamp: base_timestamp + (i as u64 * 30), // 30s between blocks
                merkle_root: [0u8; 32],
                space_block_hashes: vec![],
                space_block_count: 0,
                total_pow: difficulty, // Exactly meets difficulty
                difficulty_target: difficulty,
                height: i as u64,
                cumulative_pow: difficulty * (i as u64 + 1),
                block_creator: [0u8; 32],
            };
            prev_hash = header.hash();
            headers.push(header);
        }

        headers
    }

    #[test]
    fn test_valid_header_chain() {
        let headers = create_valid_chain(5, 1_000_000, 30);
        assert!(verify_header_chain(&headers).is_ok());
    }

    #[test]
    fn test_empty_chain() {
        let headers: Vec<RootBlock> = vec![];
        assert!(verify_header_chain(&headers).is_ok());
    }

    #[test]
    fn test_single_genesis_header() {
        let headers = create_valid_chain(1, 1_000_000, 30);
        assert!(verify_header_chain(&headers).is_ok());
    }

    #[test]
    fn test_v_sync_01_chain_linkage_failure() {
        let mut headers = create_valid_chain(5, 1_000_000, 30);

        // Tamper with prev_root_hash at index 2
        headers[2].prev_root_hash = [0xFFu8; 32];

        let result = verify_header_chain(&headers);
        assert!(matches!(
            result,
            Err(SyncError::InvalidChainLinkage { height: 2, .. })
        ));
    }

    #[test]
    fn test_v_sync_02_insufficient_pow() {
        let mut headers = create_valid_chain(5, 1_000_000, 30);

        // Set PoW below difficulty at index 3
        headers[3].total_pow = 10; // Below difficulty_target of 30

        let result = verify_header_chain(&headers);
        assert!(matches!(
            result,
            Err(SyncError::InsufficientPoW {
                height: 3,
                required: 30,
                actual: 10
            })
        ));
    }

    #[test]
    fn test_v_sync_03_non_monotonic_timestamp() {
        let mut headers = create_valid_chain(5, 1_000_000, 30);

        // Make timestamp at index 2 less than or equal to index 1
        // headers[1] has timestamp: 1_000_000 + 30 = 1_000_030
        headers[2].timestamp = headers[1].timestamp; // Equal - should fail

        let result = verify_header_chain(&headers);
        assert!(matches!(
            result,
            Err(SyncError::NonMonotonicTimestamp { height: 2, .. })
        ));
    }

    #[test]
    fn test_v_sync_03_timestamp_going_backwards() {
        let mut headers = create_valid_chain(5, 1_000_000, 30);

        // Make timestamp go backwards
        headers[2].timestamp = headers[1].timestamp - 10;

        let result = verify_header_chain(&headers);
        assert!(matches!(
            result,
            Err(SyncError::NonMonotonicTimestamp { height: 2, .. })
        ));
    }

    #[test]
    fn test_verify_genesis_header() {
        let genesis = RootBlock::genesis(1_000_000);
        assert!(verify_genesis_header(&genesis).is_ok());
    }

    #[test]
    fn test_verify_non_genesis_as_genesis() {
        let headers = create_valid_chain(2, 1_000_000, 30);
        let non_genesis = &headers[1]; // Not genesis

        let result = verify_genesis_header(non_genesis);
        assert!(matches!(result, Err(SyncError::InvalidGenesis { .. })));
    }

    #[test]
    fn test_verify_headers_connect() {
        let headers = create_valid_chain(5, 1_000_000, 30);

        // Start from index 2, should connect to headers[1].hash()
        let subset = &headers[2..];
        let local_tip = headers[1].hash();

        assert!(verify_headers_connect(subset, local_tip).is_ok());
    }

    #[test]
    fn test_verify_headers_connect_failure() {
        let headers = create_valid_chain(5, 1_000_000, 30);
        let subset = &headers[2..];
        let wrong_tip = [0xFFu8; 32];

        let result = verify_headers_connect(subset, wrong_tip);
        assert!(matches!(result, Err(SyncError::InvalidChainLinkage { .. })));
    }

    #[test]
    fn test_verify_height_sequence() {
        let headers = create_valid_chain(5, 1_000_000, 30);
        assert!(verify_height_sequence(&headers).is_ok());
    }

    #[test]
    fn test_verify_height_sequence_gap() {
        let mut headers = create_valid_chain(5, 1_000_000, 30);
        headers[3].height = 10; // Gap from 2 to 10

        let result = verify_height_sequence(&headers);
        assert!(matches!(result, Err(SyncError::InvalidPeerData { .. })));
    }
}
