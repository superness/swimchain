//! Utility functions for multi-node tests

use std::time::{Duration, Instant};

use swimchain::blocks::RootBlock;
use swimchain::storage::ChainStore;

use super::error::TestError;

/// Create a test chain of N blocks
///
/// Generates a chain starting from genesis with sequential heights.
pub fn create_test_chain(count: u64) -> Vec<RootBlock> {
    let mut chain = Vec::with_capacity(count as usize);
    let mut prev_hash = [0u8; 32]; // Genesis has zero prev_hash

    let mut cumulative = 0u64;
    for height in 0..count {
        let block_pow = 1000 + height * 100; // PoW for this block
        cumulative += block_pow;
        let block = RootBlock {
            version: 1,
            prev_root_hash: prev_hash,
            timestamp: 1_000_000 + height,
            merkle_root: [0u8; 32], // Simplified for testing
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: block_pow, // PoW for this block only
            cumulative_pow: cumulative, // Sum from genesis to here
            difficulty_target: 30, // 30 second target
            height,
            block_creator: [0u8; 32],
        };

        // Compute hash for next block
        prev_hash = block.hash();
        chain.push(block);
    }

    chain
}

/// Store a chain in ChainStore
///
/// Stores all blocks and creates height index.
pub fn store_chain(store: &ChainStore, chain: &[RootBlock]) -> Result<(), swimchain::types::error::StorageError> {
    for block in chain {
        let hash = store.put_root_block(block)?;
        store.index_height(block.height, hash)?;
    }
    Ok(())
}

/// Wait for a block to appear in a store
pub async fn wait_for_block(
    store: &ChainStore,
    hash: &[u8; 32],
    timeout_duration: Duration,
) -> Result<(), TestError> {
    let start = Instant::now();
    let poll_interval = Duration::from_millis(50);

    while start.elapsed() < timeout_duration {
        if let Ok(Some(_)) = store.get_root_block(hash) {
            return Ok(());
        }
        tokio::time::sleep(poll_interval).await;
    }

    Err(TestError::ConditionTimeout {
        condition: format!("block {} to appear", hex::encode(&hash[..8])),
        timeout_secs: timeout_duration.as_secs(),
    })
}

/// Wait for a node to reach a specific chain height
pub async fn wait_for_height(
    store: &ChainStore,
    target_height: u64,
    timeout_duration: Duration,
) -> Result<(), TestError> {
    let start = Instant::now();
    let poll_interval = Duration::from_millis(100);

    while start.elapsed() < timeout_duration {
        if let Ok(Some(current)) = store.get_latest_height() {
            if current >= target_height {
                return Ok(());
            }
        }
        tokio::time::sleep(poll_interval).await;
    }

    Err(TestError::ConditionTimeout {
        condition: format!("height >= {}", target_height),
        timeout_secs: timeout_duration.as_secs(),
    })
}

/// Measure propagation time for content between nodes
pub struct PropagationTimer {
    start: Instant,
}

impl PropagationTimer {
    /// Start timing
    pub fn start() -> Self {
        Self { start: Instant::now() }
    }

    /// Stop timing and return duration in milliseconds
    pub fn elapsed_ms(&self) -> u128 {
        self.start.elapsed().as_millis()
    }
}

/// Generate a deterministic test hash from a seed
pub fn test_hash(seed: u8) -> [u8; 32] {
    [seed; 32]
}

/// Verify that all nodes have the same chain tip
pub fn verify_chain_tips_match(tips: &[[u8; 32]]) -> bool {
    if tips.is_empty() {
        return true;
    }
    tips.iter().all(|tip| tip == &tips[0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_chain() {
        let chain = create_test_chain(10);
        assert_eq!(chain.len(), 10);

        // Verify heights are sequential
        for (i, block) in chain.iter().enumerate() {
            assert_eq!(block.height, i as u64);
        }

        // Verify prev_hash links
        for i in 1..chain.len() {
            assert_eq!(chain[i].prev_root_hash, chain[i - 1].hash());
        }

        // Genesis has zero prev_hash
        assert_eq!(chain[0].prev_root_hash, [0u8; 32]);
    }

    #[test]
    fn test_test_hash() {
        let h1 = test_hash(0xAB);
        let h2 = test_hash(0xCD);

        assert_eq!(h1, [0xAB; 32]);
        assert_eq!(h2, [0xCD; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_verify_tips_match() {
        let tip1 = [1u8; 32];
        let tip2 = [1u8; 32];
        let tip3 = [2u8; 32];

        assert!(verify_chain_tips_match(&[tip1, tip2]));
        assert!(!verify_chain_tips_match(&[tip1, tip3]));
        assert!(verify_chain_tips_match(&[]));
    }
}
