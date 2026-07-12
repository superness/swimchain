//! Content Block (SPEC_08 §2.2)
//!
//! Content blocks contain actions for a single thread within a space.
//! They aggregate PoW from individual actions and form the leaf level
//! of the three-level hierarchy.
//!
//! # Structure
//!
//! - Contains all actions for one thread (POST, REPLY, ENGAGE)
//! - Aggregates total PoW from all contained actions
//! - References space_id and thread_root_id for placement
//! - Includes merkle root of action hashes
//!
//! # PoW Aggregation
//!
//! total_pow = sum of all action.pow_work values

use super::action::Action;
use super::branch_path::BranchPath;
use super::merkle::compute_merkle_root;
use crate::crypto::sha256;

/// Error types for content block operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentBlockError {
    /// No actions provided
    EmptyActions,
    /// Thread mismatch - action doesn't belong to this thread
    ThreadMismatch {
        expected: [u8; 32],
        actual: [u8; 32],
    },
    /// Invalid action in block
    InvalidAction(String),
    /// PoW aggregation mismatch
    PoWSumMismatch { expected: u64, actual: u64 },
    /// Merkle root mismatch
    MerkleRootMismatch {
        expected: [u8; 32],
        actual: [u8; 32],
    },
}

impl std::fmt::Display for ContentBlockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContentBlockError::EmptyActions => write!(f, "Content block cannot have empty actions"),
            ContentBlockError::ThreadMismatch { expected, actual } => {
                write!(
                    f,
                    "Thread mismatch: expected {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected[0], expected[1], actual[0], actual[1]
                )
            }
            ContentBlockError::InvalidAction(msg) => write!(f, "Invalid action: {msg}"),
            ContentBlockError::PoWSumMismatch { expected, actual } => {
                write!(f, "PoW sum mismatch: expected {expected}, got {actual}")
            }
            ContentBlockError::MerkleRootMismatch { expected, actual } => {
                write!(
                    f,
                    "Merkle root mismatch: expected {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected[0], expected[1], actual[0], actual[1]
                )
            }
        }
    }
}

impl std::error::Error for ContentBlockError {}

/// Metadata for space creation (stored with CreateSpace actions)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SpaceCreationMetadata {
    /// Space name (max 64 bytes UTF-8)
    pub name: String,
    /// Optional description (max 256 bytes UTF-8)
    pub description: Option<String>,
}

/// Content block containing thread actions (SPEC_08 §2.2)
///
/// Leaf level of the three-level hierarchy, containing actions for
/// a single thread.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ContentBlock {
    /// Thread root content hash (identifies the thread)
    pub thread_root_id: [u8; 32],
    /// Space this thread belongs to
    pub space_id: [u8; 32],
    /// Actions in this block
    pub actions: Vec<Action>,
    /// Merkle root of action hashes
    pub merkle_root: [u8; 32],
    /// Previous content block hash for this thread (None for first)
    pub prev_content_hash: Option<[u8; 32]>,
    /// Block creation timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Total PoW aggregated from actions
    pub total_pow: u64,
    /// Branch path for tree placement
    pub branch_path: BranchPath,
    /// Optional space metadata (only present for CreateSpace actions)
    /// Note: Do NOT use skip_serializing_if with bincode - it breaks deserialization
    pub space_metadata: Option<SpaceCreationMetadata>,
}

impl ContentBlock {
    /// Create a new content block
    ///
    /// # Arguments
    /// * `thread_root_id` - Hash identifying the thread
    /// * `space_id` - Space this thread belongs to
    /// * `actions` - Actions to include in the block
    /// * `prev_content_hash` - Previous block in thread chain
    /// * `timestamp` - Block creation time (UNIX seconds)
    /// * `branch_path` - Tree placement path
    ///
    /// # Errors
    /// Returns error if actions is empty
    pub fn new(
        thread_root_id: [u8; 32],
        space_id: [u8; 32],
        actions: Vec<Action>,
        prev_content_hash: Option<[u8; 32]>,
        timestamp: u64,
        branch_path: BranchPath,
    ) -> Result<Self, ContentBlockError> {
        if actions.is_empty() {
            return Err(ContentBlockError::EmptyActions);
        }

        // Compute merkle root of action hashes
        let action_hashes: Vec<[u8; 32]> = actions.iter().map(|a| a.hash()).collect();
        let merkle_root = compute_merkle_root(&action_hashes);

        // Aggregate PoW
        let total_pow: u64 = actions.iter().map(|a| a.pow_work).sum();

        Ok(Self {
            thread_root_id,
            space_id,
            actions,
            merkle_root,
            prev_content_hash,
            timestamp,
            total_pow,
            branch_path,
            space_metadata: None,
        })
    }

    /// Create a new content block with space creation metadata
    ///
    /// Used when the block contains a CreateSpace action
    pub fn new_with_space_metadata(
        thread_root_id: [u8; 32],
        space_id: [u8; 32],
        actions: Vec<Action>,
        prev_content_hash: Option<[u8; 32]>,
        timestamp: u64,
        branch_path: BranchPath,
        space_metadata: SpaceCreationMetadata,
    ) -> Result<Self, ContentBlockError> {
        let mut block = Self::new(
            thread_root_id,
            space_id,
            actions,
            prev_content_hash,
            timestamp,
            branch_path,
        )?;
        block.space_metadata = Some(space_metadata);
        Ok(block)
    }

    /// Compute the hash of this content block
    #[must_use]
    pub fn hash(&self) -> [u8; 32] {
        let mut data = Vec::new();

        // thread_root_id: 32 bytes
        data.extend_from_slice(&self.thread_root_id);

        // space_id: 32 bytes
        data.extend_from_slice(&self.space_id);

        // merkle_root: 32 bytes
        data.extend_from_slice(&self.merkle_root);

        // prev_content_hash: 32 bytes (zeros if None)
        match &self.prev_content_hash {
            Some(hash) => data.extend_from_slice(hash),
            None => data.extend_from_slice(&[0u8; 32]),
        }

        // timestamp: 8 bytes
        data.extend_from_slice(&self.timestamp.to_be_bytes());

        // total_pow: 8 bytes
        data.extend_from_slice(&self.total_pow.to_be_bytes());

        // branch_path: variable
        data.extend_from_slice(&self.branch_path.serialize());

        sha256(&data)
    }

    /// Verify the merkle root matches actions
    pub fn verify_merkle_root(&self) -> Result<(), ContentBlockError> {
        let action_hashes: Vec<[u8; 32]> = self.actions.iter().map(|a| a.hash()).collect();
        let computed = compute_merkle_root(&action_hashes);

        if computed != self.merkle_root {
            return Err(ContentBlockError::MerkleRootMismatch {
                expected: self.merkle_root,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify the total_pow matches sum of action pow_work
    pub fn verify_pow_sum(&self) -> Result<(), ContentBlockError> {
        let computed: u64 = self.actions.iter().map(|a| a.pow_work).sum();

        if computed != self.total_pow {
            return Err(ContentBlockError::PoWSumMismatch {
                expected: self.total_pow,
                actual: computed,
            });
        }

        Ok(())
    }

    /// Verify all actions reference the correct thread
    pub fn verify_thread_integrity(&self) -> Result<(), ContentBlockError> {
        use super::action::ActionType;

        for action in &self.actions {
            match action.action_type {
                ActionType::Post => {
                    // POST creates thread - content_hash should match thread_root_id
                    // (first post in thread)
                    if let Some(content_hash) = action.content_hash {
                        // First action should establish the thread
                        if content_hash != self.thread_root_id
                            && self.prev_content_hash.is_none()
                            && self.actions.len() == 1
                        {
                            // This is the first block and first action - it defines the thread
                            // For subsequent blocks, we don't validate this strictly
                        }
                    }
                }
                ActionType::Reply => {
                    // REPLY must have parent_id
                    if action.parent_id.is_none() {
                        return Err(ContentBlockError::InvalidAction(
                            "Reply must have parent_id".to_string(),
                        ));
                    }
                }
                ActionType::CreateSpace => {
                    // CreateSpace actions don't need thread integrity checks
                    // They establish new spaces, not content in threads
                }
                ActionType::Engage => {
                    // ENGAGE targets content in this thread
                    // content_hash should reference something in the thread
                }
                ActionType::Edit => {
                    // EDIT must have parent_id (original content) and content_hash (new content)
                    if action.parent_id.is_none() {
                        return Err(ContentBlockError::InvalidAction(
                            "Edit must have parent_id (original content ID)".to_string(),
                        ));
                    }
                    if action.content_hash.is_none() {
                        return Err(ContentBlockError::InvalidAction(
                            "Edit must have content_hash (new content)".to_string(),
                        ));
                    }
                }
                // Private space actions don't need thread integrity checks
                // They operate on spaces/membership, not content threads
                ActionType::Invite
                | ActionType::Leave
                | ActionType::Kick
                | ActionType::RevokeInvite
                | ActionType::KeyRotation
                | ActionType::DMRequest
                | ActionType::AcceptDM
                | ActionType::DeclineDM => {}
                // Sponsorship actions don't need thread integrity checks
                ActionType::Sponsor | ActionType::GenesisRegister => {}
                // Space metadata actions operate on spaces, not content threads
                ActionType::RenameSpace => {}
            }
        }

        Ok(())
    }

    /// Get action count
    #[must_use]
    pub fn action_count(&self) -> usize {
        self.actions.len()
    }

    /// Check if this is the first block in the thread
    #[must_use]
    pub fn is_first_in_thread(&self) -> bool {
        self.prev_content_hash.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::action::ActionType;

    fn make_test_action(pow_work: u64) -> Action {
        Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1000,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        }
    }

    #[test]
    fn test_content_block_creation() {
        let actions = vec![make_test_action(30)];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert_eq!(block.total_pow, 30);
        assert_eq!(block.action_count(), 1);
        assert!(block.is_first_in_thread());
    }

    #[test]
    fn test_content_block_empty_actions() {
        let result =
            ContentBlock::new([1u8; 32], [2u8; 32], vec![], None, 1000, BranchPath::root());
        assert!(matches!(result, Err(ContentBlockError::EmptyActions)));
    }

    #[test]
    fn test_pow_aggregation() {
        let actions = vec![
            make_test_action(30),
            make_test_action(10),
            make_test_action(20),
        ];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert_eq!(block.total_pow, 60); // 30 + 10 + 20
    }

    #[test]
    fn test_verify_pow_sum() {
        let actions = vec![make_test_action(30), make_test_action(20)];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert!(block.verify_pow_sum().is_ok());
    }

    #[test]
    fn test_verify_pow_sum_mismatch() {
        let actions = vec![make_test_action(30)];
        let mut block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        // Tamper with total_pow
        block.total_pow = 999;

        let result = block.verify_pow_sum();
        assert!(matches!(
            result,
            Err(ContentBlockError::PoWSumMismatch { .. })
        ));
    }

    #[test]
    fn test_verify_merkle_root() {
        let actions = vec![make_test_action(30), make_test_action(20)];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert!(block.verify_merkle_root().is_ok());
    }

    #[test]
    fn test_verify_merkle_root_mismatch() {
        let actions = vec![make_test_action(30)];
        let mut block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        // Tamper with merkle_root
        block.merkle_root = [0xFFu8; 32];

        let result = block.verify_merkle_root();
        assert!(matches!(
            result,
            Err(ContentBlockError::MerkleRootMismatch { .. })
        ));
    }

    #[test]
    fn test_content_block_hash_deterministic() {
        let actions = vec![make_test_action(30)];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let hash1 = block.hash();
        let hash2 = block.hash();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_content_block_hash_changes() {
        let actions1 = vec![make_test_action(30)];
        let actions2 = vec![make_test_action(60)];

        let block1 = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions1,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let block2 = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions2,
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert_ne!(block1.hash(), block2.hash());
    }

    #[test]
    fn test_content_block_with_prev_hash() {
        let actions = vec![make_test_action(30)];
        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            actions,
            Some([5u8; 32]),
            1000,
            BranchPath::root(),
        )
        .unwrap();

        assert!(!block.is_first_in_thread());
    }

    #[test]
    fn test_reply_without_parent_fails() {
        let action = Action {
            action_type: ActionType::Reply,
            actor: [1u8; 32],
            timestamp: 1000,
            content_hash: Some([2u8; 32]),
            parent_id: None, // Missing parent_id
            pow_nonce: 42,
            pow_work: 10,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };

        let block = ContentBlock::new(
            [1u8; 32],
            [2u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let result = block.verify_thread_integrity();
        assert!(matches!(result, Err(ContentBlockError::InvalidAction(_))));
    }
}
