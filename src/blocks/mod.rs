//! Recursive Block Hierarchy (SPEC_08)
//!
//! Implements the three-level block hierarchy for Swimchain:
//!
//! - **Root Block**: Chain coordination layer, aggregates space blocks (~30s intervals)
//! - **Space Block**: Space-level aggregation, contains merkle root of content blocks
//! - **Content Block**: Thread-level blocks containing actions (POST, REPLY, ENGAGE)
//!
//! # PoW Aggregation
//!
//! Proof-of-work aggregates upward through the hierarchy:
//! - Actions have individual PoW (pow_work field)
//! - Content blocks sum action PoW
//! - Space blocks sum content block PoW
//! - Root blocks sum space block PoW
//!
//! # Parent-Anchored Threading
//!
//! Replies stay with their parent via BranchPath:
//! - Thread roots get a path based on their hash
//! - Replies inherit the parent's path
//! - This ensures thread coherence across the tree structure

pub mod action;
pub mod branch_path;
pub mod builder;
pub mod content_block;
pub mod leader;
pub mod merkle;
pub mod root_block;
pub mod space_block;
pub mod validation;

// Re-export main types
pub use action::{Action, ActionType, ACTION_SERIALIZED_SIZE};
pub use branch_path::{BranchDirection, BranchPath};
pub use builder::BlockBuilder;
pub use content_block::{ContentBlock, ContentBlockError, SpaceCreationMetadata};
pub use leader::{
    compute_block_seed, validate_block_leader, BlockEligibility, MAX_ELIGIBILITY_TIME,
    TARGET_BLOCK_INTERVAL,
};
pub use merkle::compute_merkle_root;
pub use root_block::{RootBlock, INITIAL_DIFFICULTY};
pub use space_block::SpaceBlock;
pub use validation::{
    validate_action, validate_content_block, validate_root_block, validate_space_block,
    ValidationError, TIMESTAMP_FUTURE_SECS, TIMESTAMP_WINDOW_SECS,
};

/// Type aliases for clarity
pub type SpaceId = [u8; 32];
pub type ThreadId = [u8; 32];
pub type ContentHash = [u8; 32];
pub type BlockHash = [u8; 32];
