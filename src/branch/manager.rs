//! Branch Manager (SPEC_08 §5 - Milestone 1.7)
//!
//! Core logic for branch assignment and fracturing:
//!
//! # Cross-Branch Reference Rules (SPEC_08 §4.3)
//!
//! 1. **POST**: New thread - assigned by hash to leaf branch
//! 2. **REPLY**: Goes to parent thread's branch (parent-anchored)
//! 3. **ENGAGE**: Goes to TARGET content's branch, NOT engager's location
//!
//! Cross-branch references are allowed and tracked. When a user in branch A
//! engages content in branch B, the engagement is recorded in branch B.
//! This maintains thread locality - users syncing branch B will get all
//! engagements on content in that branch, regardless of engager's home branch.

use crate::blocks::{BranchDirection, BranchPath};
use crate::storage::ChainStore;

use super::error::BranchError;
use super::metadata::{BranchMetadata, SpaceBranchState};
use super::BRANCH_FRACTURE_THRESHOLD;

/// Branch manager for assignment and fracturing
///
/// Handles:
/// - Assigning branches to new threads and replies
/// - Tracking branch sizes and thread counts
/// - Executing fractures when thresholds are exceeded
pub struct BranchManager<'a> {
    store: &'a ChainStore,
    fracture_threshold: u64,
}

impl<'a> BranchManager<'a> {
    /// Create a new branch manager with default threshold
    #[must_use]
    pub fn new(store: &'a ChainStore) -> Self {
        Self {
            store,
            fracture_threshold: BRANCH_FRACTURE_THRESHOLD,
        }
    }

    /// Create a new branch manager with custom threshold
    #[must_use]
    pub fn with_threshold(store: &'a ChainStore, threshold: u64) -> Self {
        Self {
            store,
            fracture_threshold: threshold,
        }
    }

    /// Assign branch for a NEW thread (no parent)
    ///
    /// For unfractured spaces, returns root branch.
    /// For fractured spaces, navigates by hash bits to find the appropriate leaf branch.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Hash of the thread root (used for branch selection)
    pub fn assign_branch_for_new_thread(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        let state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        if state.max_depth == 0 {
            // No fractures yet - all threads go to root
            return Ok(BranchPath::root());
        }

        // Find the leaf branch that matches this hash
        // Since the tree may not be balanced (branches fracture independently),
        // we need to find the active branch whose path matches the hash bits
        for active_branch in &state.active_branches {
            if Self::hash_matches_branch(thread_root_id, active_branch) {
                return Ok(active_branch.clone());
            }
        }

        // If no match found, navigate by hash bits to max_depth as fallback
        let mut current = BranchPath::root();
        for depth in 0..state.max_depth {
            let direction = BranchPath::direction_at(thread_root_id, depth);
            current = current.branch(direction);
        }

        // This shouldn't happen with correct state
        Err(BranchError::NotLeafBranch {
            branch_path: current,
        })
    }

    /// Check if a hash matches a branch's path
    ///
    /// A hash matches a branch if the hash bits at positions 0..branch.depth
    /// match the branch's path bits.
    fn hash_matches_branch(hash: &[u8; 32], branch: &BranchPath) -> bool {
        // For root branch, everything matches
        if branch.depth == 0 {
            return true;
        }

        // Check each bit up to branch.depth
        for depth in 0..branch.depth {
            let hash_direction = BranchPath::direction_at(hash, depth);
            let byte_index = (depth / 8) as usize;
            let bit_index = 7 - (depth % 8);

            // Get the branch's direction at this depth
            let branch_bit = if byte_index < branch.path.len() {
                (branch.path[byte_index] >> bit_index) & 1
            } else {
                0
            };

            let matches = match hash_direction {
                BranchDirection::Left => branch_bit == 0,
                BranchDirection::Right => branch_bit == 1,
            };

            if !matches {
                return false;
            }
        }

        true
    }

    /// Assign branch for a REPLY (inherits parent's branch)
    ///
    /// Replies stay with their parent thread to maintain thread integrity.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Thread root hash (identifies the thread)
    pub fn assign_branch_for_reply(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        self.store
            .get_thread_branch(space_id, thread_root_id)?
            .ok_or(BranchError::ThreadNotFound {
                thread_root_id: *thread_root_id,
            })
    }

    /// Check if branch needs fracturing
    ///
    /// # Arguments
    /// * `space_id` - Space containing the branch
    /// * `branch_path` - Branch to check
    pub fn needs_fracture(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<bool, BranchError> {
        // Cannot fracture at max depth
        if branch_path.depth >= BranchPath::MAX_DEPTH {
            return Ok(false);
        }

        // Check branch size against threshold
        let metadata = self.store.get_branch_metadata(space_id, branch_path)?;
        Ok(metadata.map_or(false, |m| m.is_over_threshold(self.fracture_threshold)))
    }

    /// Ensure space has branch state initialized
    fn ensure_space_initialized(
        &self,
        space_id: &[u8; 32],
        timestamp: u64,
    ) -> Result<(), BranchError> {
        // Use atomic check-and-set pattern
        if self.store.get_space_branch_state(space_id)?.is_none() {
            let state = SpaceBranchState::new();
            self.store.put_space_branch_state(space_id, &state)?;

            // Also create root branch metadata
            let metadata = BranchMetadata::new_empty(BranchPath::root(), timestamp);
            self.store.put_branch_metadata(space_id, &metadata)?;
        }
        Ok(())
    }

    /// Register a content block and update branch indexes
    ///
    /// This method:
    /// 1. Ensures space is initialized
    /// 2. Assigns or looks up branch path
    /// 3. Updates thread size tracking
    /// 4. Updates branch metadata
    /// 5. Triggers fracture if threshold exceeded
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Thread root hash
    /// * `is_new_thread` - True if this is a new thread (POST), false for REPLY
    /// * `serialized_size` - Size of bincode-serialized ContentBlock in bytes
    /// * `timestamp` - Current timestamp for metadata
    ///
    /// # Returns
    /// (assigned_branch_path, fracture_triggered)
    pub fn register_content_block(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        is_new_thread: bool,
        serialized_size: u64,
        timestamp: u64,
    ) -> Result<(BranchPath, bool), BranchError> {
        // 1. Ensure space is initialized
        self.ensure_space_initialized(space_id, timestamp)?;

        // 2. Get or assign branch path
        let path = if is_new_thread {
            let assigned = self.assign_branch_for_new_thread(space_id, thread_root_id)?;
            // Index the new thread
            self.store
                .put_thread_branch(space_id, thread_root_id, &assigned)?;
            assigned
        } else {
            self.assign_branch_for_reply(space_id, thread_root_id)?
        };

        // 3. Update thread size tracking
        self.store
            .update_thread_size(space_id, thread_root_id, serialized_size)?;

        // 4. Update branch metadata
        let mut metadata = self
            .store
            .get_branch_metadata(space_id, &path)?
            .unwrap_or_else(|| BranchMetadata::new_empty(path.clone(), timestamp));

        metadata.total_size += serialized_size;
        if is_new_thread {
            metadata.thread_count += 1;
        }
        metadata.last_updated = timestamp;
        self.store.put_branch_metadata(space_id, &metadata)?;

        // 5. Check for fracture trigger
        let fracture_triggered = if self.needs_fracture(space_id, &path)? {
            self.execute_fracture(space_id, &path, timestamp)?;
            true
        } else {
            false
        };

        Ok((path, fracture_triggered))
    }

    /// Execute fracture on a branch that exceeded threshold
    ///
    /// # Algorithm
    /// 1. Create LEFT and RIGHT child branches
    /// 2. Get all threads in this branch
    /// 3. Reassign each thread to appropriate child based on hash bit
    /// 4. Create child metadata, delete parent metadata
    /// 5. Update SpaceBranchState
    ///
    /// # Thread Integrity Note
    /// Only index pointers change - ContentBlock data is NOT moved.
    /// All content blocks for a thread share the same thread_root_id,
    /// so replies will continue to find the correct branch.
    pub fn execute_fracture(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        timestamp: u64,
    ) -> Result<(), BranchError> {
        // 1. Validate fracture is possible
        if branch_path.depth >= BranchPath::MAX_DEPTH {
            return Err(BranchError::MaxDepthReached {
                branch_path: branch_path.clone(),
            });
        }

        // 2. Create child branches
        let left_child = branch_path.branch(BranchDirection::Left);
        let right_child = branch_path.branch(BranchDirection::Right);
        let fracture_depth = branch_path.depth; // Bit position to check

        // 3. Get all threads in this branch with their sizes
        let threads = self.store.get_threads_in_branch(space_id, branch_path)?;

        // 4. Track child branch statistics
        let mut left_size: u64 = 0;
        let mut left_count: u32 = 0;
        let mut right_size: u64 = 0;
        let mut right_count: u32 = 0;

        // 5. Reassign each thread to appropriate child
        for (thread_id, size) in &threads {
            let direction = BranchPath::direction_at(thread_id, fracture_depth);

            // Delete old index entry
            self.store
                .delete_thread_branch(space_id, thread_id, branch_path)?;

            // Add new index entry
            match direction {
                BranchDirection::Left => {
                    self.store
                        .put_thread_branch(space_id, thread_id, &left_child)?;
                    left_size += size;
                    left_count += 1;
                }
                BranchDirection::Right => {
                    self.store
                        .put_thread_branch(space_id, thread_id, &right_child)?;
                    right_size += size;
                    right_count += 1;
                }
            }
        }

        // 6. Create child branch metadata
        let left_meta = BranchMetadata {
            branch_path: left_child.clone(),
            total_size: left_size,
            thread_count: left_count,
            last_updated: timestamp,
        };
        let right_meta = BranchMetadata {
            branch_path: right_child.clone(),
            total_size: right_size,
            thread_count: right_count,
            last_updated: timestamp,
        };
        self.store.put_branch_metadata(space_id, &left_meta)?;
        self.store.put_branch_metadata(space_id, &right_meta)?;

        // 7. Delete parent branch metadata
        self.store.delete_branch_metadata(space_id, branch_path)?;

        // 8. Update SpaceBranchState
        let mut state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        state.active_branches.retain(|p| p != branch_path);
        state.active_branches.push(left_child);
        state.active_branches.push(right_child);

        let new_depth = fracture_depth + 1;
        if new_depth > state.max_depth {
            state.max_depth = new_depth;
        }

        self.store.put_space_branch_state(space_id, &state)?;

        Ok(())
    }

    /// Get the branch for a thread (by thread_root_id)
    pub fn get_thread_branch(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        self.store
            .get_thread_branch(space_id, thread_root_id)?
            .ok_or(BranchError::ThreadNotFound {
                thread_root_id: *thread_root_id,
            })
    }

    /// Resolve engagement target's branch
    ///
    /// Per SPEC_08 §4.3: Engagements go to the TARGET content's branch.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `target_thread_root_id` - Thread root of the content being engaged
    ///
    /// # Returns
    /// The branch path where the engagement should be recorded
    pub fn resolve_engagement_branch(
        &self,
        space_id: &[u8; 32],
        target_thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        // Engagement goes to TARGET content's branch, not engager's location
        self.get_thread_branch(space_id, target_thread_root_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_branch_manager_new() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        assert_eq!(manager.fracture_threshold, BRANCH_FRACTURE_THRESHOLD);
    }

    #[test]
    fn test_branch_manager_with_threshold() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 1000);

        assert_eq!(manager.fracture_threshold, 1000);
    }

    #[test]
    fn test_new_thread_unfractured_space() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        let path = manager
            .assign_branch_for_new_thread(&space_id, &thread_id)
            .unwrap();
        assert_eq!(path, BranchPath::root());
    }

    #[test]
    fn test_reply_thread_not_found() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        let result = manager.assign_branch_for_reply(&space_id, &thread_id);
        assert!(matches!(result, Err(BranchError::ThreadNotFound { .. })));
    }

    #[test]
    fn test_register_content_block_initializes_space() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register first block
        let (path, fractured) = manager
            .register_content_block(&space_id, &thread_id, true, 100, 1000)
            .unwrap();

        assert_eq!(path, BranchPath::root());
        assert!(!fractured);

        // Space should be initialized
        let state = store.get_space_branch_state(&space_id).unwrap();
        assert!(state.is_some());

        // Branch metadata should exist
        let metadata = store
            .get_branch_metadata(&space_id, &BranchPath::root())
            .unwrap();
        assert!(metadata.is_some());
        let metadata = metadata.unwrap();
        assert_eq!(metadata.thread_count, 1);
        assert_eq!(metadata.total_size, 100);
    }

    #[test]
    fn test_reply_inherits_thread_branch() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register new thread
        let (thread_path, _) = manager
            .register_content_block(&space_id, &thread_id, true, 100, 1000)
            .unwrap();

        // Register reply (is_new_thread = false)
        let (reply_path, _) = manager
            .register_content_block(&space_id, &thread_id, false, 50, 1001)
            .unwrap();

        assert_eq!(reply_path, thread_path);

        // Thread count should still be 1 (reply doesn't add thread)
        let metadata = store
            .get_branch_metadata(&space_id, &BranchPath::root())
            .unwrap()
            .unwrap();
        assert_eq!(metadata.thread_count, 1);
        assert_eq!(metadata.total_size, 150); // 100 + 50
    }

    #[test]
    fn test_needs_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 500);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register block below threshold
        manager
            .register_content_block(&space_id, &thread_id, true, 400, 1000)
            .unwrap();

        assert!(!manager
            .needs_fracture(&space_id, &BranchPath::root())
            .unwrap());

        // Register block that pushes over threshold
        // Note: register_content_block triggers fracture automatically
        let mut thread_id2 = [0u8; 32];
        thread_id2[0] = 3;
        let (_, fractured) = manager
            .register_content_block(&space_id, &thread_id2, true, 200, 1001)
            .unwrap();

        // The fracture should have happened during registration
        assert!(
            fractured,
            "Fracture should have triggered during registration"
        );

        // After fracture, root branch no longer exists - it's been split
        // So needs_fracture on root returns false (branch doesn't exist)
        assert!(!manager
            .needs_fracture(&space_id, &BranchPath::root())
            .unwrap());
    }

    #[test]
    fn test_execute_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 100);

        let space_id = [1u8; 32];

        // Create threads with different first bits (for different branches)
        let thread_left = [0x00u8; 32]; // Bit 0 = 0 -> LEFT
        let thread_right = [0x80u8; 32]; // Bit 0 = 1 -> RIGHT

        // Register both threads
        manager
            .register_content_block(&space_id, &thread_left, true, 60, 1000)
            .unwrap();
        manager
            .register_content_block(&space_id, &thread_right, true, 60, 1001)
            .unwrap();

        // Should trigger fracture (120 > 100)
        let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
        assert!(state.has_fractured());
        assert_eq!(state.max_depth, 1);
        assert_eq!(state.active_branches.len(), 2);

        // Verify thread assignments
        let left_branch = manager.get_thread_branch(&space_id, &thread_left).unwrap();
        let right_branch = manager.get_thread_branch(&space_id, &thread_right).unwrap();

        assert_eq!(
            left_branch,
            BranchPath::root().branch(BranchDirection::Left)
        );
        assert_eq!(
            right_branch,
            BranchPath::root().branch(BranchDirection::Right)
        );
    }

    #[test]
    fn test_resolve_engagement_branch() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let target_thread = [2u8; 32];

        // Register target thread
        manager
            .register_content_block(&space_id, &target_thread, true, 100, 1000)
            .unwrap();

        // Resolve engagement branch should return target's branch
        let engagement_branch = manager
            .resolve_engagement_branch(&space_id, &target_thread)
            .unwrap();

        assert_eq!(engagement_branch, BranchPath::root());
    }
}
