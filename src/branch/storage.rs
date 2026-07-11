//! Branch-aware storage wrapper (SPEC_08 §5 - Milestone 1.7)
//!
//! Provides unified API for storing content blocks with automatic
//! branch assignment, size tracking, and fracture triggering.

use crate::blocks::{BranchPath, ContentBlock};
use crate::storage::ChainStore;

use super::error::BranchError;
use super::manager::BranchManager;
use super::BRANCH_FRACTURE_THRESHOLD;

/// Result of storing a content block with branch tracking
#[derive(Debug, Clone)]
pub struct PutResult {
    /// Hash of the stored block
    pub hash: [u8; 32],
    /// Branch path assigned to the block
    pub branch_path: BranchPath,
    /// Whether a fracture was triggered by this operation
    pub fracture_triggered: bool,
}

/// Branch-aware content storage wrapper
///
/// Wraps ChainStore + BranchManager to provide unified API for
/// storing content blocks with automatic branch assignment.
///
/// # Example
///
/// ```no_run
/// use swimchain::branch::BranchAwareStore;
/// use swimchain::storage::ChainStore;
///
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// let store = ChainStore::open("path/to/db")?;
/// let branch_store = BranchAwareStore::new(&store);
///
/// // Store with 50MB default threshold
/// // let result = branch_store.put_content_block(block)?;
///
/// // Or use custom threshold for testing
/// let test_store = BranchAwareStore::with_fracture_threshold(&store, 1000);
/// # Ok(())
/// # }
/// ```
pub struct BranchAwareStore<'a> {
    chain_store: &'a ChainStore,
    fracture_threshold: u64,
}

impl<'a> BranchAwareStore<'a> {
    /// Create new branch-aware store with default threshold
    #[must_use]
    pub fn new(chain_store: &'a ChainStore) -> Self {
        Self {
            chain_store,
            fracture_threshold: BRANCH_FRACTURE_THRESHOLD,
        }
    }

    /// Create new branch-aware store with custom threshold
    ///
    /// Useful for testing with smaller thresholds.
    #[must_use]
    pub fn with_fracture_threshold(chain_store: &'a ChainStore, threshold: u64) -> Self {
        Self {
            chain_store,
            fracture_threshold: threshold,
        }
    }

    /// Store a content block with automatic branch assignment
    ///
    /// This method:
    /// 1. Assigns a branch path based on thread type (new vs reply)
    /// 2. Updates the block's branch_path field
    /// 3. Serializes and stores the block
    /// 4. Registers with branch manager for size tracking
    /// 5. Triggers fracture if threshold exceeded
    ///
    /// # Arguments
    /// * `block` - Content block to store (branch_path will be set)
    ///
    /// # Returns
    /// `PutResult` with hash, assigned branch path, and fracture status
    pub fn put_content_block(&self, mut block: ContentBlock) -> Result<PutResult, BranchError> {
        let manager = BranchManager::with_threshold(self.chain_store, self.fracture_threshold);
        let is_new_thread = block.prev_content_hash.is_none();
        let timestamp = block.timestamp;

        // Thread author (first action's actor) for community-aware routing
        // (SPEC_13 §13.2: new threads by community members go to their
        // community branch). With no communities this is a no-op.
        let thread_author = block.actions.first().map(|a| a.actor);

        // 1. Pre-assign branch path to compute correct size
        let path = if is_new_thread {
            manager.assign_branch_for_new_thread_with_author(
                &block.space_id,
                &block.thread_root_id,
                thread_author.as_ref(),
            )?
        } else {
            manager.assign_branch_for_reply(&block.space_id, &block.thread_root_id)?
        };

        // 2. Set branch path on block BEFORE serialization
        block.branch_path = path.clone();

        // 3. Serialize to get actual size
        let serialized = bincode::serialize(&block)?;
        let serialized_size = serialized.len() as u64;

        // 4. Store block via chain_store (StorageError converts via #[from])
        let hash = self.chain_store.put_content_block(&block)?;

        // 5. Register with branch manager (this also handles fracture if needed)
        let (_, fracture_triggered) = manager.register_content_block_with_author(
            &block.space_id,
            &block.thread_root_id,
            is_new_thread,
            serialized_size,
            timestamp,
            thread_author.as_ref(),
        )?;

        Ok(PutResult {
            hash,
            branch_path: path,
            fracture_triggered,
        })
    }

    /// Store an already-built content block with branch size tracking.
    ///
    /// This is the production write path for blocks that are hash-committed
    /// (locally formed or received from the network). The block is stored
    /// EXACTLY as built — its `branch_path` field is part of the block hash
    /// and therefore of consensus, so it is never mutated here. Placement is
    /// registered via [`BranchManager::register_built_block`], which derives
    /// it deterministically from chain data (thread index / hash bits), and
    /// the 50MB fracture check runs on every write.
    ///
    /// Idempotent: re-delivery of a block already in the store (e.g. the same
    /// block arriving from multiple peers) does not double-count branch sizes.
    pub fn put_built_content_block(&self, block: &ContentBlock) -> Result<PutResult, BranchError> {
        let hash = block.hash();
        let already_stored = self.chain_store.has_content_block(&hash)?;

        // Store (or re-store) the block as-is.
        let hash = self.chain_store.put_content_block(block)?;

        if already_stored {
            // Indexes already reflect this block — report current placement.
            let path = self
                .chain_store
                .get_thread_branch(&block.space_id, &block.thread_root_id)?
                .unwrap_or_else(|| block.branch_path.clone());
            return Ok(PutResult {
                hash,
                branch_path: path,
                fracture_triggered: false,
            });
        }

        let manager = BranchManager::with_threshold(self.chain_store, self.fracture_threshold);
        let (branch_path, fracture_triggered) = manager.register_built_block(block)?;

        Ok(PutResult {
            hash,
            branch_path,
            fracture_triggered,
        })
    }

    /// Access underlying chain store
    #[must_use]
    pub fn chain_store(&self) -> &ChainStore {
        self.chain_store
    }

    /// Get the fracture threshold
    #[must_use]
    pub fn fracture_threshold(&self) -> u64 {
        self.fracture_threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::{Action, ActionType, BranchDirection};
    use tempfile::tempdir;

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
        }
    }

    fn create_content_block(
        thread_id: [u8; 32],
        space_id: [u8; 32],
        is_first: bool,
    ) -> ContentBlock {
        ContentBlock {
            thread_root_id: thread_id,
            space_id,
            actions: vec![make_test_action(10)],
            merkle_root: [0u8; 32],
            prev_content_hash: if is_first { None } else { Some([0xFFu8; 32]) },
            timestamp: 1000,
            total_pow: 10,
            branch_path: BranchPath::root(),
            space_metadata: None,
        }
    }

    #[test]
    fn test_branch_aware_store_new() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::new(&store);

        assert_eq!(branch_store.fracture_threshold(), BRANCH_FRACTURE_THRESHOLD);
    }

    #[test]
    fn test_branch_aware_store_with_threshold() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::with_fracture_threshold(&store, 5000);

        assert_eq!(branch_store.fracture_threshold(), 5000);
    }

    #[test]
    fn test_put_content_block_new_thread() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];
        let block = create_content_block(thread_id, space_id, true);

        let result = branch_store.put_content_block(block).unwrap();

        assert_eq!(result.branch_path, BranchPath::root());
        assert!(!result.fracture_triggered);

        // Verify block was stored
        assert!(store.has_content_block(&result.hash).unwrap());
    }

    #[test]
    fn test_put_content_block_reply() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Create thread first
        let first_block = create_content_block(thread_id, space_id, true);
        let first_result = branch_store.put_content_block(first_block).unwrap();

        // Create reply
        let mut reply_block = create_content_block(thread_id, space_id, false);
        reply_block.prev_content_hash = Some(first_result.hash);
        let reply_result = branch_store.put_content_block(reply_block).unwrap();

        assert_eq!(reply_result.branch_path, first_result.branch_path);
    }

    #[test]
    fn test_put_content_block_triggers_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        // Very small threshold to trigger fracture quickly
        let branch_store = BranchAwareStore::with_fracture_threshold(&store, 200);

        let space_id = [1u8; 32];

        // Add blocks until fracture triggers
        let mut fractured = false;
        for i in 0..10 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            let block = create_content_block(thread_id, space_id, true);
            let result = branch_store.put_content_block(block).unwrap();

            if result.fracture_triggered {
                fractured = true;
                break;
            }
        }

        assert!(fractured, "Fracture should have triggered");

        // Verify state
        let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
        assert!(state.has_fractured());
    }

    #[test]
    fn test_put_content_block_after_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::with_fracture_threshold(&store, 200);

        let space_id = [1u8; 32];

        // Trigger fracture
        for i in 0..10 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            let block = create_content_block(thread_id, space_id, true);
            branch_store.put_content_block(block).unwrap();
        }

        // New thread with first bit = 1 should go to RIGHT branch
        let mut new_thread_id = [0u8; 32];
        new_thread_id[0] = 0x80; // Bit 0 = 1
        let block = create_content_block(new_thread_id, space_id, true);
        let result = branch_store.put_content_block(block).unwrap();

        assert_eq!(
            result.branch_path,
            BranchPath::root().branch(BranchDirection::Right)
        );
    }

    #[test]
    fn test_chain_store_accessor() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::new(&store);

        // Should be able to access chain store
        let _chain_store = branch_store.chain_store();
    }
}
