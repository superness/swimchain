# Block Production

This document describes how blocks are produced and aggregated in Swimchain,
following [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md).

## Overview

Block production follows a bottom-up aggregation pattern:

1. **Actions** are created by users (POST, REPLY, ENGAGE)
2. **Content blocks** aggregate actions per thread
3. **Space blocks** aggregate content blocks per space
4. **Root blocks** aggregate space blocks when PoW threshold is met

## Using the BlockBuilder

The `BlockBuilder` accumulates actions and forms blocks when conditions are met:

```rust
use swimchain::blocks::{BlockBuilder, Action, ActionType, BranchPath};

// Create builder with 30-second difficulty target
let mut builder = BlockBuilder::new(30);

// Add actions for threads
let action1 = Action { /* POST action with pow_work: 15 */ };
let action2 = Action { /* REPLY action with pow_work: 10 */ };
let action3 = Action { /* ENGAGE action with pow_work: 8 */ };

// Add to builder
builder.add_action(thread_id_1, space_id, action1, BranchPath::root());
builder.add_action(thread_id_1, space_id, action2, BranchPath::for_reply(&parent_path));
builder.add_action(thread_id_2, space_id, action3, BranchPath::root());

// Check accumulated PoW
println!("Total PoW: {}s", builder.total_pow()); // 33s

// Check if ready to form root block
if builder.should_form_root() {
    let (root_block, space_blocks, content_blocks) = builder.build_root_block(timestamp);
}
```

## Block Formation Process

### Step 1: Accumulate Actions

Actions are accumulated per thread:

```rust
builder.add_action(
    thread_id,      // Thread this action belongs to
    space_id,       // Space containing the thread
    action,         // The action (POST/REPLY/ENGAGE)
    branch_path,    // Tree placement path
);

// Monitor accumulation
println!("Pending actions: {}", builder.pending_action_count());
println!("Pending threads: {}", builder.pending_thread_count());
println!("Total PoW: {}s", builder.total_pow());
```

### Step 2: Check Formation Threshold

Root blocks form when total PoW meets the difficulty target:

```rust
// Default target is 30 seconds
if builder.should_form_root() {
    // Ready to form blocks
}

// Adjust target if needed
builder.set_difficulty_target(60);  // 60 second blocks
```

### Step 3: Build Block Hierarchy

When threshold is met, build the complete hierarchy:

```rust
let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs();

let (root_block, space_blocks, content_blocks) = builder.build_root_block(timestamp);

// Results:
// - root_block: Chain tip with aggregated PoW
// - space_blocks: One per space with active threads
// - content_blocks: One per thread with actions
```

## Chain Continuity

The builder maintains chain state automatically:

```rust
// Start fresh
let mut builder = BlockBuilder::new(30);

// First block
builder.add_action(/* ... */);
let (root1, _, _) = builder.build_root_block(1000);

// Builder automatically tracks:
// - prev_root_hash = root1.hash()
// - current_height = 1

// Second block
builder.add_action(/* ... */);
let (root2, _, _) = builder.build_root_block(1030);

assert_eq!(root2.prev_root_hash, root1.hash());
assert_eq!(root2.height, 2);
```

### Resuming from Existing Chain

To resume from an existing chain state:

```rust
let builder = BlockBuilder::from_chain_state(
    30,                 // Difficulty target
    current_height,     // Last block height
    last_root_hash,     // Last root block hash
);
```

## PoW Aggregation Example

Complete example showing PoW flow:

```rust
// Actions with PoW
let action1 = Action { pow_work: 30, /* POST */ };
let action2 = Action { pow_work: 10, /* REPLY */ };
let action3 = Action { pow_work: 20, /* ENGAGE */ };

// Add to same thread
builder.add_action(thread_id, space_id, action1, path.clone());
builder.add_action(thread_id, space_id, action2, path.clone());
builder.add_action(thread_id, space_id, action3, path.clone());

let (root, spaces, contents) = builder.build_root_block(timestamp);

// Content block aggregates actions: 30 + 10 + 20 = 60
assert_eq!(contents[0].total_pow, 60);

// Space block aggregates content blocks
assert_eq!(spaces[0].total_pow, 60);

// Root block aggregates space blocks
assert_eq!(root.total_pow, 60);

// Root meets difficulty (60 >= 30)
assert!(root.meets_difficulty());
```

## Multi-Space Block Production

Actions from multiple spaces are handled automatically:

```rust
// Thread in space A
builder.add_action(thread_1, space_a, action1, path.clone());

// Thread in space B
builder.add_action(thread_2, space_b, action2, path.clone());

// Thread in space A (different thread)
builder.add_action(thread_3, space_a, action3, path.clone());

let (root, space_blocks, content_blocks) = builder.build_root_block(timestamp);

// Result:
// - 2 space blocks (space A and space B)
// - 3 content blocks (one per thread)
// - 1 root block aggregating both spaces
```

## Space-Specific Monitoring

Monitor PoW per space:

```rust
// Check PoW for specific space
let space_pow = builder.space_pow(&space_id);
println!("Space PoW: {}s", space_pow);
```

## Incremental Building

Build content blocks without forming full chain:

```rust
// Add actions
builder.add_action(thread_id, space_id, action1, path.clone());
builder.add_action(thread_id, space_id, action2, path.clone());

// Build just the content block
let content_block = builder.build_content_block(&thread_id, timestamp);

// Content block is removed from builder
assert_eq!(builder.pending_thread_count(), 0);
```

## Genesis Block

Create the chain genesis:

```rust
use swimchain::blocks::{RootBlock, INITIAL_DIFFICULTY};

// Create genesis at a specific timestamp
let genesis = RootBlock::genesis(1703516400);

assert!(genesis.is_genesis());
assert_eq!(genesis.height, 0);
assert_eq!(genesis.prev_root_hash, [0u8; 32]);
assert_eq!(genesis.total_pow, 0);
assert_eq!(genesis.difficulty_target, INITIAL_DIFFICULTY); // 30s
```

## Direct Block Creation

For testing or special cases, create blocks directly:

```rust
// Create content block directly
let content_block = ContentBlock::new(
    thread_root_id,
    space_id,
    actions,
    prev_content_hash,  // None for first block
    timestamp,
    branch_path,
)?;

// Create space block from content blocks
let space_block = SpaceBlock::from_content_blocks(
    space_id,
    &[content_block],
    prev_space_hash,
    timestamp,
);

// Create root block from space blocks
let root_block = RootBlock::from_space_blocks(
    &[space_block],
    prev_root_hash,
    timestamp,
    difficulty_target,
    height,
);
```

## Chaining Blocks

Create next block in chain:

```rust
// Space blocks
let next_space = SpaceBlock::create_next(&prev_space, &content_blocks, timestamp);

// Root blocks
let next_root = RootBlock::create_next(&prev_root, &space_blocks, timestamp);
```

## Action Creation from Pool Contributions

Create ENGAGE actions from engagement pool contributions:

```rust
use swimchain::blocks::Action;

let engage_action = Action::from_pool_contribution(
    &pool_contribution,     // PoolContribution from engagement pool
    target_content_hash,    // Content being engaged with
);

assert_eq!(engage_action.action_type, ActionType::Engage);
```

## Performance Considerations

### Block Size

Monitor block sizes to avoid overly large blocks:

```rust
println!("Content blocks: {}", content_blocks.len());
println!("Actions per block: {}", content_blocks[0].action_count());

// Consider splitting if too many actions per thread
```

### Difficulty Adjustment

Adjust difficulty based on block production rate:

```rust
// If blocks coming too fast, increase difficulty
if avg_block_time < 25.0 {
    let new_target = (current_target as f64 * 30.0 / avg_block_time) as u64;
    builder.set_difficulty_target(new_target);
}
```

## Module API

Key builder methods:

| Method | Description |
|--------|-------------|
| `new(target)` | Create builder with difficulty target |
| `from_chain_state(...)` | Resume from existing chain |
| `add_action(...)` | Add action for thread |
| `total_pow()` | Get accumulated PoW |
| `should_form_root()` | Check if ready to form block |
| `build_root_block(ts)` | Build complete hierarchy |
| `build_content_block(...)` | Build single content block |
| `space_pow(&id)` | Get PoW for specific space |
| `pending_action_count()` | Count pending actions |
| `pending_thread_count()` | Count pending threads |
| `clear()` | Clear all pending actions |

## See Also

- [Recursive Blocks](recursive-blocks.md) - Block hierarchy overview
- [Chain Validation](chain-validation.md) - Validation rules
- [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md) - Full specification
