//! Mock blockchain representation for network tests
//!
//! Provides a simplified block structure for testing network propagation
//! without the overhead of full block validation.

use sha2::{Digest, Sha256};

/// A simplified block representation for testing
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MockBlock {
    /// Block height in the chain
    pub height: u64,
    /// Hash of the previous block (all zeros for genesis)
    pub prev_hash: [u8; 32],
    /// Fork identifier (unique per test chain)
    pub fork_id: [u8; 32],
    /// Block timestamp (simulated seconds since epoch)
    pub timestamp: u64,
    /// ID of the node that produced this block
    pub producer_id: u64,
    /// Computed hash of this block
    pub hash: [u8; 32],
}

impl MockBlock {
    /// Compute the block hash from its components
    pub fn compute_hash(
        height: u64,
        prev_hash: &[u8; 32],
        fork_id: &[u8; 32],
        timestamp: u64,
        producer_id: u64,
    ) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(height.to_le_bytes());
        hasher.update(prev_hash);
        hasher.update(fork_id);
        hasher.update(timestamp.to_le_bytes());
        hasher.update(producer_id.to_le_bytes());
        hasher.finalize().into()
    }

    /// Create a genesis block with the given seed
    ///
    /// The seed determines the fork_id, making each test chain unique.
    pub fn genesis(seed: u64) -> Self {
        let fork_id = {
            let mut h = Sha256::new();
            h.update(b"test_fork_");
            h.update(seed.to_le_bytes());
            h.finalize().into()
        };
        let hash = Self::compute_hash(0, &[0u8; 32], &fork_id, 0, seed);
        Self {
            height: 0,
            prev_hash: [0u8; 32],
            fork_id,
            timestamp: 0,
            producer_id: seed,
            hash,
        }
    }

    /// Create the next block in the chain
    ///
    /// Increments height, uses current block's hash as prev_hash,
    /// and advances timestamp by 60 seconds (simulated block time).
    pub fn next(&self, producer_id: u64) -> Self {
        let timestamp = self.timestamp + 60; // 60 second block time
        let hash = Self::compute_hash(
            self.height + 1,
            &self.hash,
            &self.fork_id,
            timestamp,
            producer_id,
        );
        Self {
            height: self.height + 1,
            prev_hash: self.hash,
            fork_id: self.fork_id,
            timestamp,
            producer_id,
            hash,
        }
    }

    /// Create a chain of N blocks starting from genesis
    pub fn create_chain(seed: u64, length: usize) -> Vec<Self> {
        let mut chain = Vec::with_capacity(length);
        let genesis = Self::genesis(seed);
        chain.push(genesis);

        for i in 1..length {
            let prev = &chain[i - 1];
            let producer_id = (seed + i as u64) % 10; // Rotate producers
            chain.push(prev.next(producer_id));
        }

        chain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genesis_deterministic() {
        // Same seed should produce same genesis block
        let genesis1 = MockBlock::genesis(42);
        let genesis2 = MockBlock::genesis(42);

        assert_eq!(genesis1.hash, genesis2.hash);
        assert_eq!(genesis1.fork_id, genesis2.fork_id);
        assert_eq!(genesis1.height, 0);
        assert_eq!(genesis1.prev_hash, [0u8; 32]);
    }

    #[test]
    fn test_genesis_different_seeds() {
        // Different seeds should produce different genesis blocks
        let genesis1 = MockBlock::genesis(42);
        let genesis2 = MockBlock::genesis(43);

        assert_ne!(genesis1.hash, genesis2.hash);
        assert_ne!(genesis1.fork_id, genesis2.fork_id);
    }

    #[test]
    fn test_next_extends_chain() {
        let genesis = MockBlock::genesis(1);
        let block1 = genesis.next(2);

        assert_eq!(block1.height, 1);
        assert_eq!(block1.prev_hash, genesis.hash);
        assert_eq!(block1.fork_id, genesis.fork_id);
        assert_eq!(block1.timestamp, 60);
        assert_eq!(block1.producer_id, 2);
    }

    #[test]
    fn test_hash_changes_with_producer() {
        let genesis = MockBlock::genesis(1);
        let block_a = genesis.next(2);
        let block_b = genesis.next(3);

        // Same height, same prev_hash, but different producer
        assert_ne!(block_a.hash, block_b.hash);
        assert_eq!(block_a.height, block_b.height);
        assert_eq!(block_a.prev_hash, block_b.prev_hash);
    }

    #[test]
    fn test_chain_extends_correctly() {
        let genesis = MockBlock::genesis(1);
        let block1 = genesis.next(2);
        let block2 = block1.next(3);
        let block3 = block2.next(4);

        assert_eq!(block3.height, 3);
        assert_eq!(block3.prev_hash, block2.hash);
        assert_eq!(block2.prev_hash, block1.hash);
        assert_eq!(block1.prev_hash, genesis.hash);
    }

    #[test]
    fn test_create_chain() {
        let chain = MockBlock::create_chain(1, 5);

        assert_eq!(chain.len(), 5);
        assert_eq!(chain[0].height, 0);
        assert_eq!(chain[4].height, 4);

        // Verify chain linkage
        for i in 1..chain.len() {
            assert_eq!(chain[i].prev_hash, chain[i - 1].hash);
            assert_eq!(chain[i].height, chain[i - 1].height + 1);
        }
    }
}
