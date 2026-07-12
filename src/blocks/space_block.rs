//! Space Block (SPEC_08 §2.2)
//!
//! Space blocks aggregate content blocks for a single space.
//! They form the middle level of the three-level hierarchy.
//!
//! # Structure
//!
//! - Contains merkle root of content block hashes
//! - Aggregates total PoW from all content blocks
//! - References space_id for space identification
//! - Chains to previous space block for the same space
//!
//! # PoW Aggregation
//!
//! total_pow = sum of all content_block.total_pow values

use super::content_block::ContentBlock;
use super::merkle::compute_merkle_root;
use crate::crypto::sha256;

/// Error types for space block operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpaceBlockError {
    /// No content blocks provided
    EmptyContentBlocks,
    /// Space ID mismatch - content block doesn't belong to this space
    SpaceMismatch {
        expected: [u8; 32],
        actual: [u8; 32],
    },
    /// PoW aggregation mismatch
    PoWSumMismatch { expected: u64, actual: u64 },
    /// Merkle root mismatch
    MerkleRootMismatch {
        expected: [u8; 32],
        actual: [u8; 32],
    },
}

impl std::fmt::Display for SpaceBlockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpaceBlockError::EmptyContentBlocks => {
                write!(f, "Space block cannot have empty content blocks")
            }
            SpaceBlockError::SpaceMismatch { expected, actual } => {
                write!(
                    f,
                    "Space mismatch: expected {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected[0], expected[1], actual[0], actual[1]
                )
            }
            SpaceBlockError::PoWSumMismatch { expected, actual } => {
                write!(f, "PoW sum mismatch: expected {expected}, got {actual}")
            }
            SpaceBlockError::MerkleRootMismatch { expected, actual } => {
                write!(
                    f,
                    "Merkle root mismatch: expected {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected[0], expected[1], actual[0], actual[1]
                )
            }
        }
    }
}

impl std::error::Error for SpaceBlockError {}

/// Space block aggregating content blocks (SPEC_08 §2.2)
///
/// Middle level of the three-level hierarchy, aggregating all
/// content blocks for a single space.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SpaceBlock {
    /// Space identifier
    pub space_id: [u8; 32],
    /// Merkle root of content block hashes
    pub merkle_root: [u8; 32],
    /// Hashes of content blocks in this space block
    pub content_block_hashes: Vec<[u8; 32]>,
    /// Previous space block hash (None for first)
    pub prev_space_hash: Option<[u8; 32]>,
    /// Block creation timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Total PoW aggregated from content blocks
    pub total_pow: u64,
    /// Number of content blocks
    pub content_block_count: u32,
}

impl SpaceBlock {
    /// Create a new space block from content blocks
    ///
    /// # Arguments
    /// * `space_id` - Space identifier
    /// * `content_blocks` - Content blocks to aggregate
    /// * `prev_space_hash` - Previous block in space chain
    /// * `timestamp` - Block creation time (UNIX seconds)
    ///
    /// # Returns
    /// New space block with aggregated PoW and merkle root
    #[must_use]
    pub fn from_content_blocks(
        space_id: [u8; 32],
        content_blocks: &[ContentBlock],
        prev_space_hash: Option<[u8; 32]>,
        timestamp: u64,
    ) -> Self {
        // Compute hashes of content blocks
        let content_block_hashes: Vec<[u8; 32]> =
            content_blocks.iter().map(|cb| cb.hash()).collect();

        // Compute merkle root
        let merkle_root = compute_merkle_root(&content_block_hashes);

        // Aggregate PoW
        let total_pow: u64 = content_blocks.iter().map(|cb| cb.total_pow).sum();

        Self {
            space_id,
            merkle_root,
            content_block_hashes,
            prev_space_hash,
            timestamp,
            total_pow,
            content_block_count: content_blocks.len() as u32,
        }
    }

    /// Create from pre-computed hashes and total_pow
    ///
    /// Use this when you already have the content block hashes
    /// and don't want to recompute them.
    pub fn from_hashes(
        space_id: [u8; 32],
        content_block_hashes: Vec<[u8; 32]>,
        total_pow: u64,
        prev_space_hash: Option<[u8; 32]>,
        timestamp: u64,
    ) -> Self {
        let merkle_root = compute_merkle_root(&content_block_hashes);

        Self {
            space_id,
            merkle_root,
            content_block_hashes: content_block_hashes.clone(),
            prev_space_hash,
            timestamp,
            total_pow,
            content_block_count: content_block_hashes.len() as u32,
        }
    }

    /// Create next block in space chain
    #[must_use]
    pub fn create_next(
        prev_block: &SpaceBlock,
        content_blocks: &[ContentBlock],
        timestamp: u64,
    ) -> Self {
        Self::from_content_blocks(
            prev_block.space_id,
            content_blocks,
            Some(prev_block.hash()),
            timestamp,
        )
    }

    /// Compute the hash of this space block
    #[must_use]
    pub fn hash(&self) -> [u8; 32] {
        let mut data = Vec::new();

        // space_id: 32 bytes
        data.extend_from_slice(&self.space_id);

        // merkle_root: 32 bytes
        data.extend_from_slice(&self.merkle_root);

        // prev_space_hash: 32 bytes (zeros if None)
        match &self.prev_space_hash {
            Some(hash) => data.extend_from_slice(hash),
            None => data.extend_from_slice(&[0u8; 32]),
        }

        // timestamp: 8 bytes
        data.extend_from_slice(&self.timestamp.to_be_bytes());

        // total_pow: 8 bytes
        data.extend_from_slice(&self.total_pow.to_be_bytes());

        // content_block_count: 4 bytes
        data.extend_from_slice(&self.content_block_count.to_be_bytes());

        sha256(&data)
    }

    /// Verify the merkle root matches content block hashes
    pub fn verify_merkle_root(&self) -> Result<(), SpaceBlockError> {
        let computed = compute_merkle_root(&self.content_block_hashes);

        if computed != self.merkle_root {
            return Err(SpaceBlockError::MerkleRootMismatch {
                expected: self.merkle_root,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify total_pow against content blocks
    pub fn verify_pow_sum(&self, content_blocks: &[ContentBlock]) -> Result<(), SpaceBlockError> {
        let computed: u64 = content_blocks.iter().map(|cb| cb.total_pow).sum();

        if computed != self.total_pow {
            return Err(SpaceBlockError::PoWSumMismatch {
                expected: self.total_pow,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify all content blocks belong to this space
    pub fn verify_space_membership(
        &self,
        content_blocks: &[ContentBlock],
    ) -> Result<(), SpaceBlockError> {
        for cb in content_blocks {
            if cb.space_id != self.space_id {
                return Err(SpaceBlockError::SpaceMismatch {
                    expected: self.space_id,
                    actual: cb.space_id,
                });
            }
        }
        Ok(())
    }

    /// Get content block count
    #[must_use]
    pub fn content_block_count(&self) -> u32 {
        self.content_block_count
    }

    /// Check if this is the first block in the space chain
    #[must_use]
    pub fn is_first_in_chain(&self) -> bool {
        self.prev_space_hash.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::action::{Action, ActionType};
    use crate::blocks::branch_path::BranchPath;

    fn make_test_content_block(pow: u64) -> ContentBlock {
        let action = Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1000,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: pow,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };

        ContentBlock::new(
            [10u8; 32], // thread_root_id
            [20u8; 32], // space_id
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap()
    }

    #[test]
    fn test_space_block_creation() {
        let cb = make_test_content_block(50);
        let block = SpaceBlock::from_content_blocks([20u8; 32], &[cb], None, 1000);

        assert_eq!(block.total_pow, 50);
        assert_eq!(block.content_block_count, 1);
        assert!(block.is_first_in_chain());
    }

    #[test]
    fn test_pow_aggregation() {
        let cb1 = make_test_content_block(100);
        let cb2 = make_test_content_block(150);
        let cb3 = make_test_content_block(50);

        let block = SpaceBlock::from_content_blocks([20u8; 32], &[cb1, cb2, cb3], None, 1000);

        assert_eq!(block.total_pow, 300); // 100 + 150 + 50
        assert_eq!(block.content_block_count, 3);
    }

    #[test]
    fn test_verify_merkle_root() {
        let cb1 = make_test_content_block(50);
        let cb2 = make_test_content_block(30);

        let block = SpaceBlock::from_content_blocks([20u8; 32], &[cb1, cb2], None, 1000);

        assert!(block.verify_merkle_root().is_ok());
    }

    #[test]
    fn test_verify_merkle_root_mismatch() {
        let cb = make_test_content_block(50);
        let mut block = SpaceBlock::from_content_blocks([20u8; 32], &[cb], None, 1000);

        // Tamper with merkle_root
        block.merkle_root = [0xFFu8; 32];

        let result = block.verify_merkle_root();
        assert!(matches!(
            result,
            Err(SpaceBlockError::MerkleRootMismatch { .. })
        ));
    }

    #[test]
    fn test_verify_pow_sum() {
        let cb1 = make_test_content_block(100);
        let cb2 = make_test_content_block(50);
        let content_blocks = vec![cb1.clone(), cb2.clone()];

        let block = SpaceBlock::from_content_blocks([20u8; 32], &content_blocks, None, 1000);

        assert!(block.verify_pow_sum(&content_blocks).is_ok());
    }

    #[test]
    fn test_verify_pow_sum_mismatch() {
        let cb = make_test_content_block(100);
        let content_blocks = vec![cb.clone()];

        let mut block = SpaceBlock::from_content_blocks([20u8; 32], &content_blocks, None, 1000);

        // Tamper with total_pow
        block.total_pow = 999;

        let result = block.verify_pow_sum(&content_blocks);
        assert!(matches!(
            result,
            Err(SpaceBlockError::PoWSumMismatch { .. })
        ));
    }

    #[test]
    fn test_space_block_hash_deterministic() {
        let cb = make_test_content_block(50);
        let block = SpaceBlock::from_content_blocks([20u8; 32], &[cb], None, 1000);

        let hash1 = block.hash();
        let hash2 = block.hash();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_space_block_hash_changes() {
        let cb1 = make_test_content_block(50);
        let cb2 = make_test_content_block(100);

        let block1 = SpaceBlock::from_content_blocks([20u8; 32], &[cb1], None, 1000);
        let block2 = SpaceBlock::from_content_blocks([20u8; 32], &[cb2], None, 1000);

        assert_ne!(block1.hash(), block2.hash());
    }

    #[test]
    fn test_create_next() {
        let cb1 = make_test_content_block(50);
        let block1 = SpaceBlock::from_content_blocks([20u8; 32], &[cb1], None, 1000);

        let cb2 = make_test_content_block(30);
        let block2 = SpaceBlock::create_next(&block1, &[cb2], 2000);

        assert!(!block2.is_first_in_chain());
        assert_eq!(block2.prev_space_hash, Some(block1.hash()));
    }

    #[test]
    fn test_from_hashes() {
        let hashes = vec![[1u8; 32], [2u8; 32], [3u8; 32]];
        let block = SpaceBlock::from_hashes([20u8; 32], hashes.clone(), 150, None, 1000);

        assert_eq!(block.content_block_count, 3);
        assert_eq!(block.total_pow, 150);
        assert_eq!(block.content_block_hashes, hashes);
    }
}
