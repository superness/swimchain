# Branch Management (Milestone 1.7)

## Overview

Branch management implements automatic content branching for scalability per SPEC_08 Section 5.

As spaces grow, content is automatically organized into a binary tree structure based on thread hash values. This enables efficient selective synchronization and prevents any single branch from growing too large.

## Branch Assignment Rules

### 1. New Posts (POST action)

- Assigned to branch by `thread_root_id` hash
- Uses `BranchPath::direction_at(hash, depth)` at each tree level
- In unfractured space: all threads go to `BranchPath::root()`
- After fracture: navigates tree by hash bits to find appropriate leaf branch

```rust
// Hash bit 0 = 0 -> LEFT branch
// Hash bit 0 = 1 -> RIGHT branch

let direction = BranchPath::direction_at(&thread_id, depth);
match direction {
    BranchDirection::Left => // thread goes to left child
    BranchDirection::Right => // thread goes to right child
}
```

### 2. Replies (REPLY action)

- **Always inherit parent thread's branch** (parent-anchored)
- Uses `assign_branch_for_reply(space_id, thread_root_id)` which looks up thread's current branch
- Ensures complete threads stay together after fractures

### 3. Engagements (ENGAGE action)

- Go to **TARGET content's branch**, not engager's location
- Cross-branch engagements are allowed
- Maintains thread locality for sync efficiency

## Storage Layout

### Trees in sled database

| Tree | Key Format | Value |
|------|------------|-------|
| `branch_metadata` | space_id(32) \|\| depth(1) \|\| path_bytes | BranchMetadata |
| `thread_branch_index` | space_id(32) \|\| thread_root_id(32) | branch_path_bytes |
| `space_branch_state` | space_id(32) | SpaceBranchState |
| `thread_size` | space_id(32) \|\| thread_root_id(32) | u64 (cumulative size) |
| `branch_thread_index` | space_id(32) \|\| depth(1) \|\| path_bytes \|\| thread_root_id(32) | () |

### Data Structures

```rust
/// Per-branch metadata
pub struct BranchMetadata {
    pub branch_path: BranchPath,
    pub total_size: u64,        // bytes
    pub thread_count: u32,
    pub last_updated: u64,      // UNIX timestamp
}

/// Space-level branching state
pub struct SpaceBranchState {
    pub max_depth: u8,                      // 0 = only root
    pub active_branches: Vec<BranchPath>,   // current leaf branches
}
```

## Thread Integrity Guarantee

Threads are **never split across branches**:

1. Thread root determines branch for entire thread
2. Replies always inherit via `assign_branch_for_reply()`
3. During fracture, entire thread moves together (only index updates)
4. ContentBlock data is never moved, only index pointers change

## API Usage

```rust
use swimchain::branch::BranchAwareStore;
use swimchain::storage::ChainStore;

// Open storage with branch awareness
let store = ChainStore::open("path/to/db")?;
let branch_store = BranchAwareStore::new(&store);

// Store content block with automatic branch assignment
let result = branch_store.put_content_block(block)?;

println!("Hash: {:?}", result.hash);
println!("Branch: {:?}", result.branch_path);
println!("Fractured: {}", result.fracture_triggered);

// Access branch manager directly for queries
let manager = BranchManager::new(&store);
let branch = manager.get_thread_branch(&space_id, &thread_id)?;
```

### Custom Threshold

```rust
// Use custom threshold for testing or special cases
let branch_store = BranchAwareStore::with_fracture_threshold(&store, 10_000_000); // 10MB
```

## Cross-Branch References

Engagements may target content in different branches:

```rust
// Resolve engagement target's branch
let engagement_branch = manager.resolve_engagement_branch(&space_id, &target_thread_id)?;
// Engagement is recorded in target's branch, not engager's
```

This ensures:
- Users syncing any branch get all engagements on content in that branch
- No data duplication, only index entries
- Thread locality maintained

## Error Handling

```rust
pub enum BranchError {
    StorageError(String),
    BranchNotFound { space_id, branch_path },
    ThreadNotFound { thread_root_id },
    FractureError(String),
    NotLeafBranch { branch_path },
    MaxDepthReached { branch_path },
    SpaceNotInitialized { space_id },
}
```

See also: [Auto-Fracture Documentation](auto-fracture.md)
