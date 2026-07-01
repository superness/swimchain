//! Branch Management (SPEC_08 §5 - Milestone 1.7)
//!
//! Implements automatic content branching for scalability:
//!
//! - **Branch Assignment**: Deterministic placement based on thread hash
//! - **Parent-Anchored Threading**: Replies stay with their parent thread
//! - **Automatic Fracturing**: Branches split when exceeding size threshold
//! - **Cross-Branch References**: Engagements target content's branch
//!
//! # Branch Assignment Rules
//!
//! 1. **New Posts (POST)**: Assigned to leaf branch by `thread_root_id` hash bits
//! 2. **Replies (REPLY)**: Inherit parent thread's branch (parent-anchored)
//! 3. **Engagements (ENGAGE)**: Go to TARGET content's branch
//!
//! # Automatic Fracturing
//!
//! When a branch exceeds the size threshold (default 50MB):
//! 1. Create LEFT and RIGHT child branches
//! 2. Redistribute threads by hash bit at fracture depth
//! 3. Update indexes (thread data is not moved)
//!
//! # Thread Integrity
//!
//! Threads are never split across branches:
//! - Thread root determines branch for entire thread
//! - All replies inherit via `assign_branch_for_reply()`
//! - During fracture, entire thread moves together
//!
//! # Example
//!
//! ```no_run
//! use swimchain::branch::BranchAwareStore;
//! use swimchain::storage::ChainStore;
//!
//! // Open storage with branch awareness
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let store = ChainStore::open("path/to/db")?;
//! let branch_store = BranchAwareStore::new(&store);
//!
//! // Store content block with automatic branch assignment
//! // let result = branch_store.put_content_block(block)?;
//! // println!("Branch: {:?}", result.branch_path);
//! # Ok(())
//! # }
//! ```

pub mod error;
pub mod manager;
pub mod metadata;
pub mod storage;

pub use error::BranchError;
pub use manager::BranchManager;
pub use metadata::{BranchMetadata, SpaceBranchState};
pub use storage::{BranchAwareStore, PutResult};

/// Default fracture threshold: 50MB
///
/// Branches will automatically split when their total size exceeds this value.
/// This can be customized via `BranchAwareStore::with_fracture_threshold()`.
pub const BRANCH_FRACTURE_THRESHOLD: u64 = 50 * 1024 * 1024;
