# Automatic Branching (Fracture) - Milestone 1.7

## Fracture Trigger

Branches automatically split when exceeding a size threshold:

- **Threshold:** 50MB default (`BRANCH_FRACTURE_THRESHOLD`)
- **Configurable:** `BranchAwareStore::with_fracture_threshold(store, bytes)`
- **Checked:** After each content block registration
- **Limit:** Cannot fracture at MAX_DEPTH (255)

## Binary Split Algorithm

When a branch at path P exceeds the threshold:

```
1. Create LEFT child = P.branch(BranchDirection::Left)
2. Create RIGHT child = P.branch(BranchDirection::Right)
3. For each thread in P:
   - Get bit at P.depth from thread_root_id hash
   - bit=0 → reassign to LEFT
   - bit=1 → reassign to RIGHT
4. Update metadata:
   - Create child BranchMetadata
   - Delete parent BranchMetadata
   - Update SpaceBranchState.active_branches
   - Update SpaceBranchState.max_depth
```

### Implementation

```rust
pub fn execute_fracture(
    &self,
    space_id: &[u8; 32],
    branch_path: &BranchPath,
    timestamp: u64,
) -> Result<(), BranchError> {
    // 1. Validate fracture is possible
    if branch_path.depth >= BranchPath::MAX_DEPTH {
        return Err(BranchError::MaxDepthReached { branch_path });
    }

    // 2. Create child branches
    let left_child = branch_path.branch(BranchDirection::Left);
    let right_child = branch_path.branch(BranchDirection::Right);
    let fracture_depth = branch_path.depth;

    // 3. Get all threads in this branch
    let threads = self.store.get_threads_in_branch(space_id, branch_path)?;

    // 4-5. Reassign threads to appropriate child
    for (thread_id, size) in &threads {
        let direction = BranchPath::direction_at(thread_id, fracture_depth);
        // Update indexes...
    }

    // 6-8. Update metadata and state...
}
```

## Thread Preservation

During fracture, thread integrity is maintained:

- **Index update only:** ContentBlock data is NOT moved
- Block data stays in same storage location
- Only branch index pointers change
- Replies continue to find correct branch via thread_root_id lookup

### Before Fracture

```
Root Branch (depth 0)
├── Thread A (hash 0x00...)
├── Thread B (hash 0x80...)
└── Thread C (hash 0x40...)
```

### After Fracture

```
Root (fractured, no longer active)
├── LEFT Branch (depth 1, path [0x00])
│   ├── Thread A (hash 0x00..., bit 0 = 0)
│   └── Thread C (hash 0x40..., bit 0 = 0)
└── RIGHT Branch (depth 1, path [0x80])
    └── Thread B (hash 0x80..., bit 0 = 1)
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Lookup | O(1) | Hash table lookup by thread_id |
| Fracture | O(t) | t = threads in branch |
| Registration | O(1) | Plus potential fracture |
| New thread assignment | O(b) | b = active branches (find matching) |

## Unbalanced Trees

The tree may not be balanced because:
- Only branches exceeding threshold fracture
- Light branches stay as leaves
- `max_depth` tracks deepest point
- `active_branches` contains all current leaves regardless of depth

Example:
```
max_depth = 3
active_branches = [
  {depth: 1, path: [0x00]},      // LEFT hasn't fractured
  {depth: 3, path: [0xE0]},      // RIGHT -> RIGHT -> RIGHT
  {depth: 3, path: [0xC0]},      // RIGHT -> RIGHT -> LEFT
  {depth: 2, path: [0xA0]},      // RIGHT -> LEFT
]
```

## Recursive Fracturing

If a child branch also exceeds threshold after receiving threads:
- It will fracture on the next content block registration
- Each registration checks `needs_fracture()` after updating metadata

## Cross-Branch State

After fracture:
- Parent branch metadata is deleted
- Child branch metadata is created with redistributed sizes/counts
- SpaceBranchState updated with new active branches
- Thread index entries point to new child branches

## Configuring Threshold

Choose threshold based on:
- Network bandwidth for sync
- Storage constraints
- Content volume expectations

```rust
// Testing: small threshold for quick fractures
let store = BranchAwareStore::with_fracture_threshold(&chain_store, 1_000);

// Production: default 50MB
let store = BranchAwareStore::new(&chain_store);

// High-volume space: larger threshold
let store = BranchAwareStore::with_fracture_threshold(&chain_store, 100_000_000);
```

## Benchmarks

Run benchmarks to measure performance:

```bash
cargo bench --bench branching
```

Key measurements:
- Fracture overhead at various thread counts
- Branch lookup performance
- Insert throughput with/without fractures

See also: [Branch Management Overview](branch-management.md)
