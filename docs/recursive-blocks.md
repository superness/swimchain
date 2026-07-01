# Recursive Block Hierarchy

This document describes the three-level recursive block hierarchy implementation
for Swimchain, following [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md).

## Overview

Swimchain uses a recursive three-level block hierarchy that aggregates
proof-of-work (PoW) from individual user actions up through the chain:

```
                    ┌─────────────┐
                    │ Root Block  │  ← Chain tip (~30s intervals)
                    │ total_pow   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ Space Block │ │ Space Block │ │ Space Block │  ← Per community
    │ total_pow   │ │ total_pow   │ │ total_pow   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
       ┌───┴───┐       ┌───┴───┐       ┌───┴───┐
       ▼       ▼       ▼       ▼       ▼       ▼
    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
    │ CB  │ │ CB  │ │ CB  │ │ CB  │ │ CB  │ │ CB  │  ← Content blocks (per thread)
    └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
       │       │       │       │       │       │
    [actions] [actions] ... per thread
```

## The Three Levels

### 1. Content Block (Thread Level)

Content blocks contain actions for a single thread. They form the leaf
level of the hierarchy.

```rust
use swimchain::blocks::{ContentBlock, Action, ActionType, BranchPath};

// Create actions for a thread
let post_action = Action {
    action_type: ActionType::Post,
    actor: [1u8; 32],          // Ed25519 public key
    timestamp: 1703516400,     // UNIX seconds
    content_hash: Some([2u8; 32]),
    parent_id: None,
    pow_nonce: 42,
    pow_work: 30,              // 30 seconds of PoW
    pow_target: [3u8; 32],
    signature: [4u8; 64],
};

// Create content block
let content_block = ContentBlock::new(
    thread_root_id,            // Thread identifier
    space_id,                  // Space this thread belongs to
    vec![post_action],         // Actions in this block
    None,                      // Previous content block (None for first)
    1703516400,                // Timestamp
    BranchPath::root(),        // Tree placement path
).unwrap();

// PoW aggregates automatically
assert_eq!(content_block.total_pow, 30);
```

**Key fields:**
- `thread_root_id`: Hash identifying the thread (first post's content hash)
- `space_id`: Community/space this thread belongs to
- `actions`: Vector of POST, REPLY, or ENGAGE actions
- `merkle_root`: SHA-256 merkle root of action hashes
- `total_pow`: Sum of all action `pow_work` values
- `branch_path`: Tree placement for parent-anchored threading

### 2. Space Block (Space Level)

Space blocks aggregate all content blocks for a single space/community.

```rust
use swimchain::blocks::SpaceBlock;

// Create space block from content blocks
let space_block = SpaceBlock::from_content_blocks(
    space_id,                  // Space identifier
    &[content_block1, content_block2, content_block3],
    None,                      // Previous space block
    1703516400,                // Timestamp
);

// PoW aggregates from content blocks
// If content blocks have 100, 150, 50 PoW respectively:
assert_eq!(space_block.total_pow, 300);
```

**Key fields:**
- `space_id`: Community identifier
- `merkle_root`: SHA-256 merkle root of content block hashes
- `content_block_hashes`: Hashes of included content blocks
- `total_pow`: Sum of all content block `total_pow` values
- `prev_space_hash`: Chain to previous block in space

### 3. Root Block (Chain Level)

Root blocks form the chain coordination layer, aggregating all space blocks
at approximately 30-second intervals.

```rust
use swimchain::blocks::{RootBlock, INITIAL_DIFFICULTY};

// Create genesis block
let genesis = RootBlock::genesis(1703516400);

// Create root block from space blocks
let root_block = RootBlock::from_space_blocks(
    &[space_block1, space_block2],
    genesis.hash(),           // Previous root hash
    1703516430,               // 30 seconds later
    INITIAL_DIFFICULTY,       // 30 second target
    1,                        // Height
);

// Check if block meets difficulty
assert!(root_block.meets_difficulty());
```

**Key fields:**
- `version`: Block format version (currently 1)
- `prev_root_hash`: Previous root block hash ([0;32] for genesis)
- `merkle_root`: SHA-256 merkle root of space block hashes
- `total_pow`: Sum of all space block `total_pow` values
- `difficulty_target`: Required PoW threshold (default 30 seconds)
- `height`: Chain height (0 for genesis)

## PoW Aggregation

Proof-of-work aggregates upward through the hierarchy:

```
Action (pow_work: 30s) ─┐
Action (pow_work: 10s) ─┼─► ContentBlock (total_pow: 60s) ─┐
Action (pow_work: 20s) ─┘                                   │
                                                            │
Action (pow_work: 40s) ─┬─► ContentBlock (total_pow: 40s) ─┼─► SpaceBlock (total_pow: 100s)
                                                            │
                                                            └─► RootBlock (total_pow: 100s)
```

This design provides **Sybil resistance**: 1 user contributing 60s of PoW
is equivalent to 60 users contributing 1s each. The total work is what matters.

## Action Types

Three action types are supported:

| Type | Byte | Description | Required Fields |
|------|------|-------------|-----------------|
| POST | 0x01 | Create new thread | content_hash |
| REPLY | 0x02 | Reply to content | content_hash, parent_id |
| ENGAGE | 0x03 | Engage with content (from pool) | content_hash |

```rust
use swimchain::blocks::ActionType;

let action_type = ActionType::Post;
assert_eq!(action_type.to_byte(), 0x01);
```

## Parent-Anchored Threading

Replies stay with their parent via `BranchPath`. This ensures thread
coherence across the tree structure.

```rust
use swimchain::blocks::{BranchPath, BranchDirection};

// Thread root gets path based on hash
let thread_path = BranchPath::from_thread_root(&thread_hash);

// Replies inherit parent's path
let reply_path = BranchPath::for_reply(&parent_path);
assert_eq!(reply_path, parent_path); // Same path!

// Path can branch as tree grows
let new_path = thread_path.branch(BranchDirection::Left);
```

## Genesis Block

The genesis block is identified by:
- `prev_root_hash = [0u8; 32]`
- `height = 0`

```rust
let genesis = RootBlock::genesis(1703516400);

assert!(genesis.is_genesis());
assert_eq!(genesis.height, 0);
assert_eq!(genesis.prev_root_hash, [0u8; 32]);
```

## Block Hashing

All blocks use SHA-256 hashing with deterministic serialization:

```rust
// Content block hash includes:
// - thread_root_id (32 bytes)
// - space_id (32 bytes)
// - merkle_root (32 bytes)
// - prev_content_hash (32 bytes, zeros if None)
// - timestamp (8 bytes BE)
// - total_pow (8 bytes BE)
// - branch_path (variable)

let hash = content_block.hash();
```

## Merkle Trees

All levels use SHA-256 merkle trees:

```rust
use swimchain::blocks::compute_merkle_root;

let hashes = vec![[1u8; 32], [2u8; 32], [3u8; 32]];
let root = compute_merkle_root(&hashes);
```

Edge cases:
- Empty list: Returns `[0u8; 32]`
- Single element: Returns that element unchanged
- Odd count: Duplicates last element for pairing

## Module Structure

```
src/blocks/
├── mod.rs          # Module exports and documentation
├── action.rs       # Action type and serialization
├── branch_path.rs  # Parent-anchored threading paths
├── builder.rs      # BlockBuilder for accumulating actions
├── content_block.rs # Thread-level blocks
├── merkle.rs       # Merkle tree computation
├── root_block.rs   # Chain coordination blocks
├── space_block.rs  # Space-level aggregation
└── validation.rs   # Chain validation rules
```

## API Reference

Full API documentation:

```bash
cargo doc --open
```

Key modules:
- `swimchain::blocks` - Block types and building
- `swimchain::blocks::validation` - Validation functions
- `swimchain::blocks::compute_merkle_root` - Merkle computation

## See Also

- [Block Production](block-production.md) - How blocks are built
- [Chain Validation](chain-validation.md) - Validation rules
- [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md) - Full specification
