//! Root Block (SPEC_08 §2.1)
//!
//! Root blocks form the chain coordination layer, aggregating space blocks
//! at approximately 30-second intervals.
//!
//! # Structure
//!
//! - Contains merkle root of space block hashes
//! - Aggregates total PoW from all space blocks
//! - Chains to previous root block
//! - Tracks chain height
//!
//! # Genesis Block
//!
//! The genesis block is identified by:
//! - prev_root_hash = [0u8; 32]
//! - height = 0
//!
//! # PoW Aggregation
//!
//! total_pow = sum of all space_block.total_pow values
//!
//! # Block Timing
//!
//! Target is ~30 seconds between root blocks, controlled by difficulty_target.

use super::merkle::compute_merkle_root;
use super::space_block::SpaceBlock;
use crate::crypto::sha256;

/// Initial difficulty target (30 seconds of PoW)
pub const INITIAL_DIFFICULTY: u64 = 30;

/// Error types for root block operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RootBlockError {
    /// PoW aggregation mismatch
    PoWSumMismatch { expected: u64, actual: u64 },
    /// Merkle root mismatch
    MerkleRootMismatch {
        expected: [u8; 32],
        actual: [u8; 32],
    },
    /// Invalid previous hash for genesis
    InvalidGenesisPrevHash,
    /// Invalid height
    InvalidHeight { expected: u64, actual: u64 },
    /// Difficulty not met
    DifficultyNotMet { required: u64, actual: u64 },
}

impl std::fmt::Display for RootBlockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RootBlockError::PoWSumMismatch { expected, actual } => {
                write!(f, "PoW sum mismatch: expected {expected}, got {actual}")
            }
            RootBlockError::MerkleRootMismatch { expected, actual } => {
                write!(
                    f,
                    "Merkle root mismatch: expected {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected[0], expected[1], actual[0], actual[1]
                )
            }
            RootBlockError::InvalidGenesisPrevHash => {
                write!(f, "Genesis block must have zero prev_root_hash")
            }
            RootBlockError::InvalidHeight { expected, actual } => {
                write!(f, "Invalid height: expected {expected}, got {actual}")
            }
            RootBlockError::DifficultyNotMet { required, actual } => {
                write!(f, "Difficulty not met: required {required}s, got {actual}s")
            }
        }
    }
}

impl std::error::Error for RootBlockError {}

/// Root block - chain coordination layer (SPEC_08 §2.1)
///
/// Top level of the three-level hierarchy, formed approximately
/// every 30 seconds.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RootBlock {
    /// Block format version
    pub version: u8,
    /// Hash of previous root block ([0;32] for genesis)
    pub prev_root_hash: [u8; 32],
    /// Block creation timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Merkle root of space block hashes
    pub merkle_root: [u8; 32],
    /// Hashes of space blocks in this root block
    pub space_block_hashes: Vec<[u8; 32]>,
    /// Number of space blocks included
    pub space_block_count: u32,
    /// Total PoW aggregated from space blocks in THIS block only
    pub total_pow: u64,
    /// Cumulative PoW from genesis to this block (used for fork resolution)
    /// This is the sum of all total_pow values from genesis to this block.
    /// The chain with higher cumulative_pow wins in case of forks.
    #[serde(default)]
    pub cumulative_pow: u64,
    /// Required difficulty target (seconds of PoW)
    pub difficulty_target: u64,
    /// Chain height (0 for genesis)
    pub height: u64,
    /// Identity of the node that created this block (for leader election validation)
    /// [0u8; 32] for genesis block or legacy blocks without this field
    #[serde(default)]
    pub block_creator: [u8; 32],
}

impl RootBlock {
    /// Current version
    pub const CURRENT_VERSION: u8 = 1;

    /// Create genesis block
    ///
    /// # Arguments
    /// * `timestamp` - UNIX timestamp in SECONDS
    #[must_use]
    pub fn genesis(timestamp: u64) -> Self {
        Self {
            version: Self::CURRENT_VERSION,
            prev_root_hash: [0u8; 32],
            timestamp,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: 0,
            cumulative_pow: 0,
            difficulty_target: INITIAL_DIFFICULTY,
            height: 0,
            block_creator: [0u8; 32], // Genesis has no creator
        }
    }

    /// The CANONICAL genesis block for the active network — a fixed, deterministic
    /// height-0 anchor every node persists on a fresh chain so all nodes share one
    /// common ancestor. Without this, nodes each forge a *different* height-1 block
    /// off the zero hash on a fresh mainnet → divergent chains with no shared
    /// genesis, convergence left to luck (launch readiness B3). The per-network
    /// fixed timestamp makes the block (and thus its hash) identical for everyone.
    #[must_use]
    pub fn canonical_genesis() -> Self {
        // Fixed genesis timestamps (UNIX seconds), one per network. Changing a
        // value forks that network's genesis, so these are permanent.
        let ts = match crate::network::NetworkContext::mode() {
            crate::network::NetworkMode::Mainnet => 1_752_710_400, // 2025-07-17 00:00:00 UTC
            crate::network::NetworkMode::Testnet => 1_000_000,
            crate::network::NetworkMode::Regtest => 1_000_000,
        };
        Self::genesis(ts)
    }

    /// Create a new root block from space blocks
    ///
    /// # Arguments
    /// * `space_blocks` - Space blocks to aggregate
    /// * `prev_root_hash` - Previous root block hash
    /// * `prev_cumulative_pow` - Cumulative PoW of the parent block (0 for first block after genesis)
    /// * `timestamp` - Block creation time (UNIX seconds)
    /// * `difficulty_target` - Required difficulty
    /// * `height` - Chain height
    /// * `block_creator` - Identity of the node creating this block
    #[must_use]
    pub fn from_space_blocks(
        space_blocks: &[SpaceBlock],
        prev_root_hash: [u8; 32],
        prev_cumulative_pow: u64,
        timestamp: u64,
        difficulty_target: u64,
        height: u64,
        block_creator: [u8; 32],
    ) -> Self {
        // Compute hashes of space blocks
        let space_block_hashes: Vec<[u8; 32]> = space_blocks.iter().map(|sb| sb.hash()).collect();

        // Compute merkle root
        let merkle_root = compute_merkle_root(&space_block_hashes);

        // Aggregate PoW for this block
        let total_pow: u64 = space_blocks.iter().map(|sb| sb.total_pow).sum();

        // Cumulative PoW = parent's cumulative + this block's PoW
        let cumulative_pow = prev_cumulative_pow + total_pow;

        Self {
            version: Self::CURRENT_VERSION,
            prev_root_hash,
            timestamp,
            merkle_root,
            space_block_hashes,
            space_block_count: space_blocks.len() as u32,
            total_pow,
            cumulative_pow,
            difficulty_target,
            height,
            block_creator,
        }
    }

    /// Create from pre-computed hashes and total_pow
    pub fn from_hashes(
        space_block_hashes: Vec<[u8; 32]>,
        total_pow: u64,
        prev_root_hash: [u8; 32],
        prev_cumulative_pow: u64,
        timestamp: u64,
        difficulty_target: u64,
        height: u64,
        block_creator: [u8; 32],
    ) -> Self {
        let merkle_root = compute_merkle_root(&space_block_hashes);
        let cumulative_pow = prev_cumulative_pow + total_pow;

        Self {
            version: Self::CURRENT_VERSION,
            prev_root_hash,
            timestamp,
            merkle_root,
            space_block_hashes: space_block_hashes.clone(),
            space_block_count: space_block_hashes.len() as u32,
            total_pow,
            cumulative_pow,
            difficulty_target,
            height,
            block_creator,
        }
    }

    /// Create next block in chain
    #[must_use]
    pub fn create_next(
        prev_block: &RootBlock,
        space_blocks: &[SpaceBlock],
        timestamp: u64,
        block_creator: [u8; 32],
    ) -> Self {
        Self::from_space_blocks(
            space_blocks,
            prev_block.hash(),
            prev_block.cumulative_pow,
            timestamp,
            prev_block.difficulty_target,
            prev_block.height + 1,
            block_creator,
        )
    }

    /// Compute the hash of this root block
    #[must_use]
    pub fn hash(&self) -> [u8; 32] {
        let mut data = Vec::new();

        // version: 1 byte
        data.push(self.version);

        // prev_root_hash: 32 bytes
        data.extend_from_slice(&self.prev_root_hash);

        // timestamp: 8 bytes
        data.extend_from_slice(&self.timestamp.to_be_bytes());

        // merkle_root: 32 bytes
        data.extend_from_slice(&self.merkle_root);

        // space_block_count: 4 bytes
        data.extend_from_slice(&self.space_block_count.to_be_bytes());

        // total_pow: 8 bytes
        data.extend_from_slice(&self.total_pow.to_be_bytes());

        // cumulative_pow: 8 bytes (for fork resolution)
        data.extend_from_slice(&self.cumulative_pow.to_be_bytes());

        // difficulty_target: 8 bytes
        data.extend_from_slice(&self.difficulty_target.to_be_bytes());

        // height: 8 bytes
        data.extend_from_slice(&self.height.to_be_bytes());

        // block_creator: 32 bytes (for leader election validation)
        data.extend_from_slice(&self.block_creator);

        sha256(&data)
    }

    /// Compare this block's chain weight against another block
    /// Returns Ordering::Greater if this block has more cumulative PoW
    /// Used for fork resolution - the heavier chain wins
    #[must_use]
    pub fn compare_chain_weight(&self, other: &RootBlock) -> std::cmp::Ordering {
        self.cumulative_pow.cmp(&other.cumulative_pow)
    }

    /// Check if this block represents a heavier chain than another
    #[must_use]
    pub fn is_heavier_than(&self, other: &RootBlock) -> bool {
        self.cumulative_pow > other.cumulative_pow
    }

    /// Check if this is the genesis block
    #[must_use]
    pub fn is_genesis(&self) -> bool {
        self.prev_root_hash == [0u8; 32] && self.height == 0
    }

    /// Check if this block meets difficulty target
    #[must_use]
    pub fn meets_difficulty(&self) -> bool {
        self.total_pow >= self.difficulty_target
    }

    /// Verify the merkle root matches space block hashes
    pub fn verify_merkle_root(&self) -> Result<(), RootBlockError> {
        let computed = compute_merkle_root(&self.space_block_hashes);

        if computed != self.merkle_root {
            return Err(RootBlockError::MerkleRootMismatch {
                expected: self.merkle_root,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify total_pow against space blocks
    pub fn verify_pow_sum(&self, space_blocks: &[SpaceBlock]) -> Result<(), RootBlockError> {
        let computed: u64 = space_blocks.iter().map(|sb| sb.total_pow).sum();

        if computed != self.total_pow {
            return Err(RootBlockError::PoWSumMismatch {
                expected: self.total_pow,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify genesis block constraints
    pub fn verify_genesis(&self) -> Result<(), RootBlockError> {
        if !self.is_genesis() {
            return Ok(()); // Not a genesis block, skip check
        }

        if self.prev_root_hash != [0u8; 32] {
            return Err(RootBlockError::InvalidGenesisPrevHash);
        }

        if self.height != 0 {
            return Err(RootBlockError::InvalidHeight {
                expected: 0,
                actual: self.height,
            });
        }

        Ok(())
    }

    /// Verify difficulty is met
    pub fn verify_difficulty(&self) -> Result<(), RootBlockError> {
        if !self.meets_difficulty() {
            return Err(RootBlockError::DifficultyNotMet {
                required: self.difficulty_target,
                actual: self.total_pow,
            });
        }
        Ok(())
    }

    /// Get space block count
    #[must_use]
    pub fn space_block_count(&self) -> u32 {
        self.space_block_count
    }

    /// Get chain height
    #[must_use]
    pub fn height(&self) -> u64 {
        self.height
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::action::{Action, ActionType};
    use crate::blocks::branch_path::BranchPath;
    use crate::blocks::content_block::ContentBlock;

    fn make_test_space_block(pow: u64) -> SpaceBlock {
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

        let content_block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        SpaceBlock::from_content_blocks([20u8; 32], &[content_block], None, 1000)
    }

    #[test]
    fn test_genesis_block() {
        let genesis = RootBlock::genesis(1000);

        assert!(genesis.is_genesis());
        assert_eq!(genesis.height, 0);
        assert_eq!(genesis.prev_root_hash, [0u8; 32]);
        assert_eq!(genesis.version, RootBlock::CURRENT_VERSION);
        assert_eq!(genesis.difficulty_target, INITIAL_DIFFICULTY);
    }

    // The canonical genesis anchor MUST be deterministic — every node on a
    // network derives the identical height-0 block/hash, so they all share one
    // ancestor and height-1 forks can't diverge from no-shared-genesis (B3).
    #[test]
    fn test_canonical_genesis_deterministic() {
        let a = RootBlock::canonical_genesis();
        let b = RootBlock::canonical_genesis();
        assert_eq!(a.hash(), b.hash(), "canonical genesis must be reproducible");
        assert!(a.is_genesis());
        assert_eq!(a.height, 0);
        assert!(a.verify_genesis().is_ok());
        // The active network in unit tests is Mainnet (default) → the fixed
        // mainnet genesis timestamp. Guard it so an accidental change to the
        // constant (which would fork the network) fails loudly.
        assert_eq!(a.timestamp, 1_752_710_400);
    }

    #[test]
    fn test_genesis_verification() {
        let genesis = RootBlock::genesis(1000);
        assert!(genesis.verify_genesis().is_ok());
    }

    #[test]
    fn test_root_block_creation() {
        let sb = make_test_space_block(50);
        let block = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert_eq!(block.total_pow, 50);
        assert_eq!(block.cumulative_pow, 50); // 0 + 50
        assert_eq!(block.space_block_count, 1);
        assert_eq!(block.height, 1);
        assert!(!block.is_genesis());
    }

    #[test]
    fn test_pow_aggregation() {
        let sb1 = make_test_space_block(300);
        let sb2 = make_test_space_block(200);

        let block = RootBlock::from_space_blocks(&[sb1, sb2], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert_eq!(block.total_pow, 500); // 300 + 200
        assert_eq!(block.cumulative_pow, 500); // 0 + 500
    }

    #[test]
    fn test_cumulative_pow_chain() {
        // Test that cumulative_pow correctly accumulates across blocks
        let genesis = RootBlock::genesis(1000);
        assert_eq!(genesis.cumulative_pow, 0);

        let sb1 = make_test_space_block(50);
        let block1 = RootBlock::create_next(&genesis, &[sb1], 1030, [0u8; 32]);
        assert_eq!(block1.total_pow, 50);
        assert_eq!(block1.cumulative_pow, 50); // 0 + 50

        let sb2 = make_test_space_block(30);
        let block2 = RootBlock::create_next(&block1, &[sb2], 1060, [0u8; 32]);
        assert_eq!(block2.total_pow, 30);
        assert_eq!(block2.cumulative_pow, 80); // 50 + 30
    }

    #[test]
    fn test_fork_resolution_by_cumulative_pow() {
        // Two competing chains at same height
        let genesis = RootBlock::genesis(1000);

        // Chain A: genesis -> block_a (60 pow)
        let sb_a = make_test_space_block(60);
        let block_a = RootBlock::create_next(&genesis, &[sb_a], 1030, [0u8; 32]);

        // Chain B: genesis -> block_b (40 pow)
        let sb_b = make_test_space_block(40);
        let block_b = RootBlock::create_next(&genesis, &[sb_b], 1030, [0u8; 32]);

        // block_a should be heavier
        assert!(block_a.is_heavier_than(&block_b));
        assert!(!block_b.is_heavier_than(&block_a));
        assert_eq!(
            block_a.compare_chain_weight(&block_b),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn test_meets_difficulty() {
        let sb = make_test_space_block(60);
        let block = RootBlock::from_space_blocks(
            &[sb],
            [0u8; 32],
            0, // prev_cumulative_pow
            1000,
            30, // difficulty_target = 30s
            1,
            [0u8; 32],
        );

        assert!(block.meets_difficulty()); // 60 >= 30
    }

    #[test]
    fn test_does_not_meet_difficulty() {
        let sb = make_test_space_block(20);
        let block = RootBlock::from_space_blocks(
            &[sb],
            [0u8; 32],
            0, // prev_cumulative_pow
            1000,
            30, // difficulty_target = 30s
            1,
            [0u8; 32],
        );

        assert!(!block.meets_difficulty()); // 20 < 30
    }

    #[test]
    fn test_scaled_threshold_formation_matches_validation() {
        // SWIM-BLOCK-THRESHOLD consensus invariant: a block formed at a network's
        // scaled threshold must PASS validation, because verify_difficulty() reads the
        // block's own difficulty_target field (which is part of the hash). This is what
        // keeps every node on a network in agreement.
        use crate::network::NetworkMode;

        for mode in [
            NetworkMode::Mainnet,
            NetworkMode::Testnet,
            NetworkMode::Regtest,
        ] {
            let threshold = mode.scaled_block_difficulty(INITIAL_DIFFICULTY);
            // A block whose total_pow exactly meets the scaled threshold.
            let sb = make_test_space_block(threshold);
            let block =
                RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, threshold, 1, [0u8; 32]);
            assert!(
                block.verify_difficulty().is_ok(),
                "block formed at {mode} scaled threshold {threshold} must validate"
            );
        }

        // Demonstrates the bug this fixes: a low-PoW block (e.g. a single regtest action,
        // pow=1) is REJECTED if validated against the unscaled mainnet threshold of 30,
        // which is exactly why low-traffic testnet/regtest content used to sit pending
        // forever. With the scaled threshold (1) it validates (checked in the loop above).
        let sb = make_test_space_block(1);
        let stuck = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);
        assert!(matches!(
            stuck.verify_difficulty(),
            Err(RootBlockError::DifficultyNotMet { .. })
        ));
    }

    #[test]
    fn test_verify_difficulty() {
        let sb = make_test_space_block(30);
        let block = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert!(block.verify_difficulty().is_ok());
    }

    #[test]
    fn test_verify_difficulty_not_met() {
        let sb = make_test_space_block(20);
        let block = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        let result = block.verify_difficulty();
        assert!(matches!(
            result,
            Err(RootBlockError::DifficultyNotMet { .. })
        ));
    }

    #[test]
    fn test_verify_merkle_root() {
        let sb1 = make_test_space_block(50);
        let sb2 = make_test_space_block(30);

        let block = RootBlock::from_space_blocks(&[sb1, sb2], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert!(block.verify_merkle_root().is_ok());
    }

    #[test]
    fn test_verify_merkle_root_mismatch() {
        let sb = make_test_space_block(50);
        let mut block = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        // Tamper with merkle_root
        block.merkle_root = [0xFFu8; 32];

        let result = block.verify_merkle_root();
        assert!(matches!(
            result,
            Err(RootBlockError::MerkleRootMismatch { .. })
        ));
    }

    #[test]
    fn test_verify_pow_sum() {
        let sb1 = make_test_space_block(100);
        let sb2 = make_test_space_block(50);
        let space_blocks = vec![sb1.clone(), sb2.clone()];

        let block =
            RootBlock::from_space_blocks(&space_blocks, [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert!(block.verify_pow_sum(&space_blocks).is_ok());
    }

    #[test]
    fn test_verify_pow_sum_mismatch() {
        let sb = make_test_space_block(100);
        let space_blocks = vec![sb.clone()];

        let mut block =
            RootBlock::from_space_blocks(&space_blocks, [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        // Tamper with total_pow
        block.total_pow = 999;

        let result = block.verify_pow_sum(&space_blocks);
        assert!(matches!(result, Err(RootBlockError::PoWSumMismatch { .. })));
    }

    #[test]
    fn test_root_block_hash_deterministic() {
        let sb = make_test_space_block(50);
        let block = RootBlock::from_space_blocks(&[sb], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        let hash1 = block.hash();
        let hash2 = block.hash();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_root_block_hash_changes() {
        let sb1 = make_test_space_block(50);
        let sb2 = make_test_space_block(100);

        let block1 = RootBlock::from_space_blocks(&[sb1], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);
        let block2 = RootBlock::from_space_blocks(&[sb2], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        assert_ne!(block1.hash(), block2.hash());
    }

    #[test]
    fn test_create_next() {
        let genesis = RootBlock::genesis(1000);

        let sb = make_test_space_block(50);
        let block1 = RootBlock::create_next(&genesis, &[sb], 1030, [0u8; 32]);

        assert_eq!(block1.height, 1);
        assert_eq!(block1.prev_root_hash, genesis.hash());
        assert!(!block1.is_genesis());
    }

    #[test]
    fn test_sybil_equivalence() {
        // Scenario 1: One user contributes 60s
        let sb1 = make_test_space_block(60);
        let block1 = RootBlock::from_space_blocks(&[sb1], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        // Scenario 2: 60 users contribute 1s each (simulated as 60 actions)
        // We'll create 60 space blocks with 1s each
        let mut space_blocks = Vec::new();
        for _ in 0..60 {
            space_blocks.push(make_test_space_block(1));
        }
        let block2 =
            RootBlock::from_space_blocks(&space_blocks, [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

        // Both should have same total PoW
        assert_eq!(block1.total_pow, 60);
        assert_eq!(block2.total_pow, 60);

        // Both should meet difficulty
        assert!(block1.meets_difficulty());
        assert!(block2.meets_difficulty());
    }

    #[test]
    fn test_from_hashes() {
        let hashes = vec![[1u8; 32], [2u8; 32]];
        let block =
            RootBlock::from_hashes(hashes.clone(), 100, [0u8; 32], 50, 1000, 30, 5, [0u8; 32]);

        assert_eq!(block.space_block_count, 2);
        assert_eq!(block.total_pow, 100);
        assert_eq!(block.cumulative_pow, 150); // 50 + 100
        assert_eq!(block.height, 5);
        assert_eq!(block.space_block_hashes, hashes);
    }
}
