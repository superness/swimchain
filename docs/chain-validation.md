# Chain Validation

This document describes the validation rules for the three-level block hierarchy
in Swimchain, following [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md).

## Overview

Validation occurs at each level of the hierarchy:

1. **Action validation**: Timestamp, type requirements, signatures
2. **Content block validation**: Merkle root, PoW sum, thread integrity
3. **Space block validation**: Merkle root, PoW sum, space membership
4. **Root block validation**: Merkle root, PoW sum, difficulty, chain continuity

## Validation API

```rust
use swimchain::blocks::{
    validate_action,
    validate_content_block,
    validate_space_block,
    validate_root_block,
    validate_chain_segment,
    ValidationError,
    TIMESTAMP_WINDOW_SECS,
    TIMESTAMP_FUTURE_SECS,
};
```

## Action Validation

### Basic Validation

```rust
let current_time = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs();

match validate_action(&action, current_time) {
    Ok(()) => println!("Action valid"),
    Err(e) => println!("Invalid: {}", e),
}
```

### Timestamp Rules

| Check | Window | Error |
|-------|--------|-------|
| Too old | `current_time - 600s` | `TimestampTooOld` |
| Too new | `current_time + 60s` | `TimestampInFuture` |

```rust
// Timestamp constants
pub const TIMESTAMP_WINDOW_SECS: u64 = 600;   // 10 minutes past
pub const TIMESTAMP_FUTURE_SECS: u64 = 60;    // 1 minute future
```

### Action Type Requirements

| Type | Required Fields | Error if Missing |
|------|-----------------|------------------|
| POST | `content_hash` | `ActionError("POST must have content_hash")` |
| REPLY | `content_hash`, `parent_id` | `ActionError("REPLY must have...")` |
| ENGAGE | `content_hash` | `ActionError("ENGAGE must have content_hash")` |

### Full Validation (with Signature/PoW)

```rust
// Full validation including expensive operations
match validate_action_full(&action, current_time) {
    Ok(()) => println!("Fully valid"),
    Err(e) => println!("Invalid: {}", e),
}

// Individual checks
validate_action_signature(&action)?;  // Ed25519 verification
validate_action_pow(&action)?;        // Argon2id PoW verification
```

## Content Block Validation

```rust
let result = validate_content_block(&content_block, current_time);
```

### Checks Performed

1. **Merkle root verification**
   - Recomputes merkle root from action hashes
   - Must match `content_block.merkle_root`

2. **PoW sum verification**
   - Sum of `action.pow_work` values
   - Must match `content_block.total_pow`

3. **Thread integrity**
   - POST actions must have `content_hash`
   - REPLY actions must have `parent_id`
   - ENGAGE actions target content in thread

4. **Action validation**
   - Each action passes `validate_action()`

### Example

```rust
// Create content block
let content_block = ContentBlock::new(/* ... */)?;

// Validate it
match validate_content_block(&content_block, current_time) {
    Ok(()) => println!("Content block valid"),
    Err(ValidationError::ContentBlockError(e)) => {
        match e {
            ContentBlockError::MerkleRootMismatch { expected, actual } => {
                println!("Merkle root mismatch");
            }
            ContentBlockError::PoWSumMismatch { expected, actual } => {
                println!("PoW sum: expected {}, got {}", expected, actual);
            }
            _ => println!("Other error: {}", e),
        }
    }
    Err(e) => println!("Validation error: {}", e),
}
```

### Direct Verification Methods

```rust
// Individual checks
content_block.verify_merkle_root()?;
content_block.verify_pow_sum()?;
content_block.verify_thread_integrity()?;
```

## Space Block Validation

```rust
let result = validate_space_block(&space_block, Some(&content_blocks));
```

### Checks Performed

1. **Merkle root verification**
   - Recomputes merkle root from content block hashes
   - Must match `space_block.merkle_root`

2. **PoW sum verification** (if content blocks provided)
   - Sum of `content_block.total_pow` values
   - Must match `space_block.total_pow`

3. **Space membership** (if content blocks provided)
   - All content blocks must have `space_id == space_block.space_id`

### Example

```rust
// With content blocks for full verification
match validate_space_block(&space_block, Some(&content_blocks)) {
    Ok(()) => println!("Space block valid"),
    Err(ValidationError::SpaceBlockError(e)) => {
        match e {
            SpaceBlockError::SpaceMismatch { expected, actual } => {
                println!("Content block in wrong space");
            }
            SpaceBlockError::PoWSumMismatch { expected, actual } => {
                println!("PoW sum mismatch");
            }
            _ => println!("Error: {}", e),
        }
    }
    Err(e) => println!("Error: {}", e),
}

// Without content blocks (merkle only)
validate_space_block(&space_block, None)?;
```

### Direct Verification Methods

```rust
space_block.verify_merkle_root()?;
space_block.verify_pow_sum(&content_blocks)?;
space_block.verify_space_membership(&content_blocks)?;
```

## Root Block Validation

```rust
let result = validate_root_block(&root_block, Some(&prev_block), Some(&space_blocks));
```

### Checks Performed

1. **Merkle root verification**
   - Recomputes merkle root from space block hashes
   - Must match `root_block.merkle_root`

2. **PoW sum verification** (if space blocks provided)
   - Sum of `space_block.total_pow` values
   - Must match `root_block.total_pow`

3. **Difficulty verification**
   - `root_block.total_pow >= root_block.difficulty_target`
   - Error: `DifficultyNotMet`

4. **Genesis verification** (if genesis block)
   - `prev_root_hash == [0u8; 32]`
   - `height == 0`

5. **Chain continuity** (if prev_block provided)
   - `root_block.prev_root_hash == prev_block.hash()`
   - `root_block.height == prev_block.height + 1`

### Example

```rust
match validate_root_block(&root_block, Some(&prev), Some(&spaces)) {
    Ok(()) => println!("Root block valid"),
    Err(ValidationError::RootBlockError(e)) => {
        match e {
            RootBlockError::DifficultyNotMet { required, actual } => {
                println!("Need {}s PoW, have {}s", required, actual);
            }
            RootBlockError::InvalidHeight { expected, actual } => {
                println!("Height should be {}, is {}", expected, actual);
            }
            _ => println!("Error: {}", e),
        }
    }
    Err(ValidationError::ChainContinuityError { expected_prev, actual_prev }) => {
        println!("Chain break: wrong prev_hash");
    }
    Err(e) => println!("Error: {}", e),
}
```

### Direct Verification Methods

```rust
root_block.verify_merkle_root()?;
root_block.verify_pow_sum(&space_blocks)?;
root_block.verify_difficulty()?;
root_block.verify_genesis()?;

// Check difficulty without error
if root_block.meets_difficulty() {
    println!("Difficulty met");
}
```

## Chain Segment Validation

Validate a sequence of root blocks:

```rust
let blocks = vec![genesis, block1, block2, block3];

match validate_chain_segment(&blocks) {
    Ok(()) => println!("Chain segment valid"),
    Err(e) => println!("Chain invalid: {}", e),
}
```

### What It Checks

1. Validates first block (may be genesis)
2. For each subsequent block:
   - `block[n].prev_root_hash == block[n-1].hash()`
   - `block[n].height == block[n-1].height + 1`
   - All standard root block checks

## Error Types

### ValidationError

```rust
pub enum ValidationError {
    // Action errors
    ActionError(String),
    TimestampTooOld { timestamp: u64, current: u64 },
    TimestampInFuture { timestamp: u64, current: u64 },
    InvalidActionType { expected: ActionType, actual: ActionType },
    SignatureVerificationFailed,
    PoWVerificationFailed(String),

    // Block errors (wrapped)
    ContentBlockError(ContentBlockError),
    SpaceBlockError(SpaceBlockError),
    RootBlockError(RootBlockError),

    // Chain errors
    ChainContinuityError { expected_prev: [u8; 32], actual_prev: [u8; 32] },
    HeightContinuityError { expected: u64, actual: u64 },
}
```

### Block-Specific Errors

```rust
// ContentBlockError
pub enum ContentBlockError {
    EmptyActions,
    ThreadMismatch { expected: [u8; 32], actual: [u8; 32] },
    InvalidAction(String),
    PoWSumMismatch { expected: u64, actual: u64 },
    MerkleRootMismatch { expected: [u8; 32], actual: [u8; 32] },
}

// SpaceBlockError
pub enum SpaceBlockError {
    EmptyContentBlocks,
    SpaceMismatch { expected: [u8; 32], actual: [u8; 32] },
    PoWSumMismatch { expected: u64, actual: u64 },
    MerkleRootMismatch { expected: [u8; 32], actual: [u8; 32] },
}

// RootBlockError
pub enum RootBlockError {
    PoWSumMismatch { expected: u64, actual: u64 },
    MerkleRootMismatch { expected: [u8; 32], actual: [u8; 32] },
    InvalidGenesisPrevHash,
    InvalidHeight { expected: u64, actual: u64 },
    DifficultyNotMet { required: u64, actual: u64 },
}
```

## Validation Summary Table

| Level | Check | Field | Error |
|-------|-------|-------|-------|
| Action | Timestamp past | `timestamp` | `TimestampTooOld` |
| Action | Timestamp future | `timestamp` | `TimestampInFuture` |
| Action | POST has content | `content_hash` | `ActionError` |
| Action | REPLY has parent | `parent_id` | `ActionError` |
| ContentBlock | Merkle integrity | `merkle_root` | `MerkleRootMismatch` |
| ContentBlock | PoW sum | `total_pow` | `PoWSumMismatch` |
| ContentBlock | Thread integrity | actions | `InvalidAction` |
| SpaceBlock | Merkle integrity | `merkle_root` | `MerkleRootMismatch` |
| SpaceBlock | PoW sum | `total_pow` | `PoWSumMismatch` |
| SpaceBlock | Space membership | `space_id` | `SpaceMismatch` |
| RootBlock | Merkle integrity | `merkle_root` | `MerkleRootMismatch` |
| RootBlock | PoW sum | `total_pow` | `PoWSumMismatch` |
| RootBlock | Difficulty | `total_pow` vs `difficulty_target` | `DifficultyNotMet` |
| RootBlock | Genesis rules | `prev_root_hash`, `height` | `InvalidGenesisPrevHash`, `InvalidHeight` |
| Chain | Hash continuity | `prev_root_hash` | `ChainContinuityError` |
| Chain | Height continuity | `height` | `HeightContinuityError` |

## Performance Considerations

### Expensive Operations

Some validations are expensive and may be deferred:

```rust
// Quick validation (cheap)
validate_action(&action, current_time)?;

// Full validation (expensive)
validate_action_signature(&action)?;  // Ed25519 verify
validate_action_pow(&action)?;        // Argon2id verify
```

### Incremental Validation

Validate blocks as they arrive rather than full chain:

```rust
// Validate new block against last known good block
validate_root_block(&new_block, Some(&last_valid), Some(&space_blocks))?;
```

## See Also

- [Recursive Blocks](recursive-blocks.md) - Block hierarchy overview
- [Block Production](block-production.md) - How blocks are built
- [SPEC_08_RECURSIVE_BLOCKS.md](../specs/SPEC_08_RECURSIVE_BLOCKS.md) - Full specification
