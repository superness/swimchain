//! Branch management error types (SPEC_08 - Milestone 1.7)
//!
//! Defines errors that can occur during branch assignment, fracturing,
//! and cross-branch operations.

use crate::blocks::BranchPath;
use crate::types::error::StorageError;

/// Errors that can occur during branch management operations
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BranchError {
    /// Storage operation failed (preserves original error for debugging)
    #[error("storage error: {0}")]
    StorageError(#[from] StorageError),

    /// Branch not found for the given space and path
    #[error("branch not found: space {space_id:02x?}..., path depth {}", branch_path.depth)]
    BranchNotFound {
        /// Space identifier
        space_id: [u8; 32],
        /// Branch path that was not found
        branch_path: BranchPath,
    },

    /// Thread not found in branch index
    #[error("thread not found: {thread_root_id:02x?}...")]
    ThreadNotFound {
        /// Thread root ID that was not found
        thread_root_id: [u8; 32],
    },

    /// Fracture operation failed
    #[error("fracture error: {0}")]
    FractureError(String),

    /// Attempted operation on non-leaf branch
    #[error("not a leaf branch: depth {}", branch_path.depth)]
    NotLeafBranch {
        /// Branch path that is not a leaf
        branch_path: BranchPath,
    },

    /// Maximum branch depth reached, cannot fracture further
    #[error("max depth reached: depth {} is maximum", branch_path.depth)]
    MaxDepthReached {
        /// Branch path at maximum depth
        branch_path: BranchPath,
    },

    /// Space has not been initialized with branch state
    #[error("space not initialized: {space_id:02x?}...")]
    SpaceNotInitialized {
        /// Space identifier
        space_id: [u8; 32],
    },

    /// Serialization or deserialization failed
    #[error("serialization error: {0}")]
    SerializationError(String),
}

// Note: From<StorageError> is derived via #[from] on the StorageError variant

impl From<bincode::Error> for BranchError {
    fn from(e: bincode::Error) -> Self {
        BranchError::SerializationError(e.to_string())
    }
}
