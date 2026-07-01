//! Branch metadata types (SPEC_08 - Milestone 1.7)
//!
//! Defines metadata structures for branch tracking:
//! - BranchMetadata: Per-branch statistics (size, thread count)
//! - SpaceBranchState: Space-level branching state

use crate::blocks::BranchPath;
use serde::{Deserialize, Serialize};

/// Metadata for a single branch within a space
///
/// Tracks cumulative size and thread count to determine when
/// a branch needs to fracture (split into two child branches).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BranchMetadata {
    /// Path identifying this branch in the tree
    pub branch_path: BranchPath,

    /// Total size in bytes (sum of bincode-serialized ContentBlock sizes)
    pub total_size: u64,

    /// Number of threads rooted in this branch
    pub thread_count: u32,

    /// Last update timestamp (UNIX seconds)
    pub last_updated: u64,
}

impl BranchMetadata {
    /// Create new empty branch metadata
    ///
    /// # Arguments
    /// * `branch_path` - The branch path this metadata represents
    /// * `timestamp` - Current timestamp for last_updated
    #[must_use]
    pub fn new_empty(branch_path: BranchPath, timestamp: u64) -> Self {
        Self {
            branch_path,
            total_size: 0,
            thread_count: 0,
            last_updated: timestamp,
        }
    }

    /// Check if this branch exceeds the given threshold
    ///
    /// # Arguments
    /// * `threshold` - Size threshold in bytes
    #[must_use]
    pub fn is_over_threshold(&self, threshold: u64) -> bool {
        self.total_size > threshold
    }
}

/// Space-level branching state
///
/// Tracks the overall branching structure for a space:
/// - max_depth: How deep the tree has grown (0 = only root)
/// - active_branches: Current leaf branches (those that haven't fractured)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpaceBranchState {
    /// Maximum depth reached in this space (0 = only root branch)
    pub max_depth: u8,

    /// Active leaf branches (branches that haven't fractured yet)
    pub active_branches: Vec<BranchPath>,
}

impl SpaceBranchState {
    /// Create new space branch state with only root branch
    #[must_use]
    pub fn new() -> Self {
        Self {
            max_depth: 0,
            active_branches: vec![BranchPath::root()],
        }
    }

    /// Check if this space has ever fractured
    #[must_use]
    pub fn has_fractured(&self) -> bool {
        self.max_depth > 0
    }
}

impl Default for SpaceBranchState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::BranchDirection;

    #[test]
    fn test_branch_metadata_new_empty() {
        let metadata = BranchMetadata::new_empty(BranchPath::root(), 1000);

        assert_eq!(metadata.branch_path, BranchPath::root());
        assert_eq!(metadata.total_size, 0);
        assert_eq!(metadata.thread_count, 0);
        assert_eq!(metadata.last_updated, 1000);
    }

    #[test]
    fn test_branch_metadata_is_over_threshold() {
        let mut metadata = BranchMetadata::new_empty(BranchPath::root(), 1000);

        assert!(!metadata.is_over_threshold(100));

        metadata.total_size = 101;
        assert!(metadata.is_over_threshold(100));

        metadata.total_size = 100;
        assert!(!metadata.is_over_threshold(100)); // Equal is not over
    }

    #[test]
    fn test_space_branch_state_new() {
        let state = SpaceBranchState::new();

        assert_eq!(state.max_depth, 0);
        assert_eq!(state.active_branches.len(), 1);
        assert_eq!(state.active_branches[0], BranchPath::root());
    }

    #[test]
    fn test_space_branch_state_has_fractured() {
        let mut state = SpaceBranchState::new();
        assert!(!state.has_fractured());

        state.max_depth = 1;
        assert!(state.has_fractured());
    }

    #[test]
    fn test_space_branch_state_default() {
        let state = SpaceBranchState::default();
        assert_eq!(state, SpaceBranchState::new());
    }

    #[test]
    fn test_branch_metadata_serialize_roundtrip() {
        let metadata = BranchMetadata {
            branch_path: BranchPath::root()
                .branch(BranchDirection::Left)
                .branch(BranchDirection::Right),
            total_size: 1_000_000,
            thread_count: 42,
            last_updated: 1234567890,
        };

        let serialized = bincode::serialize(&metadata).unwrap();
        let deserialized: BranchMetadata = bincode::deserialize(&serialized).unwrap();

        assert_eq!(metadata, deserialized);
    }

    #[test]
    fn test_space_branch_state_serialize_roundtrip() {
        let state = SpaceBranchState {
            max_depth: 3,
            active_branches: vec![
                BranchPath::root().branch(BranchDirection::Left),
                BranchPath::root().branch(BranchDirection::Right),
            ],
        };

        let serialized = bincode::serialize(&state).unwrap();
        let deserialized: SpaceBranchState = bincode::deserialize(&serialized).unwrap();

        assert_eq!(state, deserialized);
    }
}
