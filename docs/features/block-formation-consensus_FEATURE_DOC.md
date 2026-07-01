# Block Formation & Consensus - Feature Documentation

## Overview

Block Formation & Consensus is the core mechanism by which Swimchain organizes user actions into a three-level hierarchical block structure. This system aggregates Proof-of-Work (PoW) upward through the hierarchy, maintains thread integrity via parent-anchored threading, and provides deterministic block formation for network consensus.

The system enables:
- **Hierarchical Aggregation**: Root → Space → Content blocks for efficient PoW aggregation
- **Thread Coherence**: Replies stay with their parent threads via branch paths
- **Deterministic Block Formation**: Nodes produce identical blocks from the same mempool
- **Fork Resolution**: Cumulative PoW determines the canonical chain
- **Automatic Scaling**: Branch fracturing splits large spaces for selective sync

**Primary Implementation**: `src/blocks/`
**Supporting Implementation**: `src/branch/`

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RootBlock (Height N)                        │
│  - merkle_root of SpaceBlocks                                       │
│  - cumulative_pow (fork resolution)                                 │
│  - block_creator (leader election)                                  │
│  - ~30s difficulty target                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  SpaceBlock   │   │  SpaceBlock   │   │  SpaceBlock   │
│  space_id: A  │   │  space_id: B  │   │  space_id: C  │
│  merkle_root  │   │  merkle_root  │   │  merkle_root  │
│  total_pow    │   │  total_pow    │   │  total_pow    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
   ┌────┼────┐         ┌────┘                   │
   ▼    ▼    ▼         ▼                        ▼
┌─────┐┌─────┐┌─────┐ ┌─────┐               ┌─────┐
│ CB  ││ CB  ││ CB  │ │ CB  │               │ CB  │
│ T1  ││ T2  ││ T3  │ │ T4  │               │ T5  │
└─────┘└─────┘└─────┘ └─────┘               └─────┘
  │
  └── Actions: POST, REPLY, ENGAGE, EDIT, etc.
      Each with: actor, timestamp, pow_work, signature
```

**Key Files:**
| File | Purpose |
|------|---------|
| `src/blocks/mod.rs` | Module exports and type aliases |
| `src/blocks/root_block.rs` | RootBlock structure and chain coordination |
| `src/blocks/space_block.rs` | SpaceBlock structure and space aggregation |
| `src/blocks/content_block.rs` | ContentBlock structure and thread actions |
| `src/blocks/action.rs` | Action types and 432-byte serialization |
| `src/blocks/merkle.rs` | SHA-256 merkle tree computation |
| `src/blocks/validation.rs` | Block and action validation rules |
| `src/blocks/leader.rs` | Deterministic XOR-distance leader election |
| `src/blocks/builder.rs` | BlockBuilder/mempool with RIM support |
| `src/blocks/branch_path.rs` | BranchPath for parent-anchored threading |
| `src/branch/manager.rs` | Branch assignment and fracturing |
| `src/branch/storage.rs` | Branch-aware content storage |

## Data Structures

### RootBlock

Chain coordination layer, formed approximately every 30 seconds when PoW threshold is met.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `u8` | Block format version (currently 1) |
| `prev_root_hash` | `[u8; 32]` | Hash of previous root block (`[0; 32]` for genesis) |
| `timestamp` | `u64` | Block creation timestamp (UNIX seconds) |
| `merkle_root` | `[u8; 32]` | Merkle root of space block hashes |
| `space_block_hashes` | `Vec<[u8; 32]>` | Hashes of included space blocks |
| `space_block_count` | `u32` | Number of space blocks |
| `total_pow` | `u64` | Total PoW aggregated from space blocks (this block only) |
| `cumulative_pow` | `u64` | Sum of all total_pow from genesis (for fork resolution) |
| `difficulty_target` | `u64` | Required difficulty in seconds of PoW |
| `height` | `u64` | Chain height (0 for genesis) |
| `block_creator` | `[u8; 32]` | Identity of node that created this block |

**Location**: `src/blocks/root_block.rs:85-113`

### SpaceBlock

Space-level aggregation, containing merkle root of content blocks for a single space.

| Field | Type | Description |
|-------|------|-------------|
| `space_id` | `[u8; 32]` | Space identifier |
| `merkle_root` | `[u8; 32]` | Merkle root of content block hashes |
| `content_block_hashes` | `Vec<[u8; 32]>` | Hashes of included content blocks |
| `prev_space_hash` | `Option<[u8; 32]>` | Previous space block in chain (None for first) |
| `timestamp` | `u64` | Block creation timestamp (UNIX seconds) |
| `total_pow` | `u64` | Total PoW aggregated from content blocks |
| `content_block_count` | `u32` | Number of content blocks |

**Location**: `src/blocks/space_block.rs:74-89`

### ContentBlock

Thread-level blocks containing actions for a single thread.

| Field | Type | Description |
|-------|------|-------------|
| `thread_root_id` | `[u8; 32]` | Hash identifying the thread |
| `space_id` | `[u8; 32]` | Space this thread belongs to |
| `actions` | `Vec<Action>` | Actions in this block |
| `merkle_root` | `[u8; 32]` | Merkle root of action hashes |
| `prev_content_hash` | `Option<[u8; 32]>` | Previous content block for this thread |
| `timestamp` | `u64` | Block creation timestamp (UNIX seconds) |
| `total_pow` | `u64` | Sum of action pow_work values |
| `branch_path` | `BranchPath` | Tree placement path |
| `space_metadata` | `Option<SpaceCreationMetadata>` | Name/description for CreateSpace actions |

**Location**: `src/blocks/content_block.rs:86-106`

### Action

Individual operation within a content block, carrying PoW proof and signature.

| Field | Type | Description |
|-------|------|-------------|
| `action_type` | `ActionType` | Type of action (POST, REPLY, ENGAGE, etc.) |
| `actor` | `[u8; 32]` | Public key of actor |
| `timestamp` | `u64` | UNIX timestamp in seconds |
| `content_hash` | `Option<[u8; 32]>` | Content hash (POST/REPLY) or target hash (ENGAGE) |
| `parent_id` | `Option<[u8; 32]>` | Parent content ID (for REPLY/EDIT) |
| `pow_nonce` | `u64` | PoW nonce |
| `pow_work` | `u64` | Work amount in seconds |
| `pow_target` | `[u8; 32]` | PoW target hash |
| `signature` | `[u8; 64]` | Ed25519 signature |
| `emoji` | `Option<u8>` | Emoji type for ENGAGE (1-8) |
| `display_name` | `Option<String>` | User display name (max 31 UTF-8 bytes) |
| `media_refs` | `Vec<ActionMediaRef>` | Media attachments (max 4) |
| `replaces_pending` | `Option<[u8; 32]>` | Replace-In-Mempool: hash of action to replace |

**Serialized Size**: 432 bytes (fixed format)

**Location**: `src/blocks/action.rs:157-191`

### ActionType

```rust
#[repr(u8)]
pub enum ActionType {
    CreateSpace = 0x00,  // Create a new space
    Post = 0x01,         // Create a new thread
    Reply = 0x02,        // Reply to existing content
    Engage = 0x03,       // Engage with content (emoji reaction)
    Edit = 0x04,         // Edit existing content
    Invite = 0x05,       // Invite user to private space
    Leave = 0x06,        // Leave a private space
    Kick = 0x07,         // Kick member from private space
    RevokeInvite = 0x08, // Cancel pending invite
    KeyRotation = 0x09,  // Distribute new space key after kick
    DMRequest = 0x0A,    // Request to start 1:1 DM
    AcceptDM = 0x0B,     // Accept DM request
    DeclineDM = 0x0C,    // Decline DM request
}
```

**Location**: `src/blocks/action.rs:61-102`

### BranchPath

Tree placement path for parent-anchored threading.

| Field | Type | Description |
|-------|------|-------------|
| `depth` | `u8` | Depth in tree (0 = root level) |
| `path` | `Vec<u8>` | Path bits (each bit = left/right at that level) |

**Constants**: `MAX_DEPTH = 255`

**Location**: `src/blocks/branch_path.rs:28-34`

### BlockEligibility

Calculator for deterministic block leader election.

| Field | Type | Description |
|-------|------|-------------|
| `block_seed` | `[u8; 32]` | Deterministic seed from prev block + space |
| `prev_block_timestamp` | `u64` | Timestamp of previous block |
| `starting_pct` | `f64` | Starting eligibility percentage (difficulty-adjusted) |
| `max_time` | `u64` | Time at which anyone becomes eligible |

**Location**: `src/blocks/leader.rs:226-235`

## Core APIs

### RootBlock Creation

#### `RootBlock::genesis()`
**Signature**: `fn genesis(timestamp: u64) -> Self`

**Purpose**: Create the genesis block with default values.

**Location**: `src/blocks/root_block.rs:124-138`

#### `RootBlock::from_space_blocks()`
**Signature**: `fn from_space_blocks(space_blocks: &[SpaceBlock], prev_root_hash: [u8; 32], prev_cumulative_pow: u64, timestamp: u64, difficulty_target: u64, height: u64, block_creator: [u8; 32]) -> Self`

**Purpose**: Create a new root block aggregating space blocks.

**Location**: `src/blocks/root_block.rs:151-185`

#### `RootBlock::create_next()`
**Signature**: `fn create_next(prev_block: &RootBlock, space_blocks: &[SpaceBlock], timestamp: u64, block_creator: [u8; 32]) -> Self`

**Purpose**: Create the next block in the chain with correct prev_hash and height.

**Location**: `src/blocks/root_block.rs:218-233`

### SpaceBlock Creation

#### `SpaceBlock::from_content_blocks()`
**Signature**: `fn from_content_blocks(space_id: [u8; 32], content_blocks: &[ContentBlock], prev_space_hash: Option<[u8; 32]>, timestamp: u64) -> Self`

**Purpose**: Create a space block aggregating content blocks.

**Location**: `src/blocks/space_block.rs:103-128`

### ContentBlock Creation

#### `ContentBlock::new()`
**Signature**: `fn new(thread_root_id: [u8; 32], space_id: [u8; 32], actions: Vec<Action>, prev_content_hash: Option<[u8; 32]>, timestamp: u64, branch_path: BranchPath) -> Result<Self, ContentBlockError>`

**Purpose**: Create a content block from actions for a thread.

**Location**: `src/blocks/content_block.rs:121-151`

### Action Creation

#### `Action::new_post()`
**Signature**: `fn new_post(actor: [u8; 32], timestamp: u64, content_hash: [u8; 32], pow_nonce: u64, pow_work: u64, pow_target: [u8; 32], signature: [u8; 64]) -> Self`

**Purpose**: Create a new POST action (starts a thread).

**Location**: `src/blocks/action.rs:195-219`

#### `Action::new_reply()`
**Signature**: `fn new_reply(actor: [u8; 32], timestamp: u64, content_hash: [u8; 32], parent_id: [u8; 32], pow_nonce: u64, pow_work: u64, pow_target: [u8; 32], signature: [u8; 64]) -> Self`

**Purpose**: Create a new REPLY action (responds to content).

**Location**: `src/blocks/action.rs:250-275`

#### `Action::new_engage()`
**Signature**: `fn new_engage(actor: [u8; 32], timestamp: u64, target_content: [u8; 32], pow_nonce: u64, pow_work: u64, pow_target: [u8; 32], signature: [u8; 64], emoji: Option<u8>) -> Self`

**Purpose**: Create a new ENGAGE action (reaction).

**Location**: `src/blocks/action.rs:307-332`

#### `Action::new_edit()`
**Signature**: `fn new_edit(actor: [u8; 32], timestamp: u64, original_content_id: [u8; 32], new_content_hash: [u8; 32], pow_nonce: u64, pow_work: u64, pow_target: [u8; 32], signature: [u8; 64]) -> Self`

**Purpose**: Create an EDIT action (modify existing content).

**Location**: `src/blocks/action.rs:396-421`

### Merkle Tree

#### `compute_merkle_root()`
**Signature**: `fn compute_merkle_root(hashes: &[[u8; 32]]) -> [u8; 32]`

**Purpose**: Compute SHA-256 based merkle root from a list of hashes.

**Algorithm**:
- Empty list → `[0u8; 32]`
- Single element → unchanged
- Multiple → pairwise hashing with odd-element duplication

**Location**: `src/blocks/merkle.rs:24-52`

#### `verify_merkle_proof()`
**Signature**: `fn verify_merkle_proof(leaf: &[u8; 32], proof: &[([u8; 32], bool)], root: &[u8; 32]) -> bool`

**Purpose**: Verify inclusion proof for a leaf hash.

**Location**: `src/blocks/merkle.rs:115-131`

### Block Validation

#### `validate_action()`
**Signature**: `fn validate_action(action: &Action, current_time: u64) -> Result<(), ValidationError>`

**Purpose**: Validate action timestamp and type-specific requirements.

**Location**: `src/blocks/validation.rs:149-290`

#### `validate_content_block()`
**Signature**: `fn validate_content_block(block: &ContentBlock, current_time: u64) -> Result<(), ValidationError>`

**Purpose**: Validate merkle root, PoW sum, thread integrity, and actions.

**Location**: `src/blocks/validation.rs:372-391`

#### `validate_root_block()`
**Signature**: `fn validate_root_block(block: &RootBlock, prev_block: Option<&RootBlock>, space_blocks: Option<&[SpaceBlock]>) -> Result<(), ValidationError>`

**Purpose**: Validate merkle root, PoW sum, difficulty, genesis, and chain continuity.

**Location**: `src/blocks/validation.rs:462-501`

### Leader Election

#### `validate_block_leader()`
**Signature**: `fn validate_block_leader(creator_identity: &[u8; 32], block_timestamp: u64, prev_block_hash: &[u8; 32], prev_block_timestamp: u64, space_id: &[u8; 16], recent_block_timestamps: &[u64]) -> bool`

**Purpose**: Verify that a block creator was eligible at the claimed timestamp.

**Location**: `src/blocks/leader.rs:369-385`

#### `BlockEligibility::is_eligible()`
**Signature**: `fn is_eligible(&self, identity: &[u8; 32], now: u64) -> bool`

**Purpose**: Check if an identity is eligible to create a block based on XOR distance and elapsed time.

**Location**: `src/blocks/leader.rs:303-315`

### BlockBuilder (Mempool)

#### `BlockBuilder::add_action()`
**Signature**: `fn add_action(&mut self, thread_id: ThreadId, space_id: SpaceId, action: Action, branch_path: BranchPath) -> bool`

**Purpose**: Add an action to the mempool. Supports Replace-In-Mempool (RIM) via `replaces_pending` field.

**Returns**: `true` if action was added, `false` if duplicate or replacement failed.

**Location**: `src/blocks/builder.rs:187-219`

#### `BlockBuilder::build_root_block()`
**Signature**: `fn build_root_block(&mut self, timestamp: u64, block_creator: [u8; 32]) -> (RootBlock, Vec<SpaceBlock>, Vec<ContentBlock>)`

**Purpose**: Build all pending blocks with deterministic ordering.

**Location**: `src/blocks/builder.rs:447-563`

#### `BlockBuilder::should_form_root()`
**Signature**: `fn should_form_root(&mut self) -> bool`

**Purpose**: Check if we should form a root block, with lazy waiting to avoid duplicate formation.

**Location**: `src/blocks/builder.rs:365-397`

## Behaviors

### Block Hierarchy Formation

The three-level hierarchy forms as follows:

1. **Actions accumulate** in the BlockBuilder mempool
2. **When PoW threshold is met** (~30 seconds of accumulated work):
   - Start 30-second lazy wait for network block
   - If no network block arrives, proceed to form our own
3. **Build content blocks** - one per thread with actions sorted by hash
4. **Build space blocks** - one per space with content blocks sorted
5. **Build root block** - aggregating all space blocks

**Deterministic Block Formation**:
- Timestamps are quantized to 10-second windows (`TIMESTAMP_QUANTUM_SECS = 10`)
- Actions within threads are sorted by hash
- Threads within spaces are sorted by thread_id
- Spaces are sorted by space_id
- This ensures nodes with same mempool produce identical block hashes

### PoW Aggregation

PoW flows upward through the hierarchy:

```
Action.pow_work (individual PoW)
    │
    ▼ (sum)
ContentBlock.total_pow
    │
    ▼ (sum)
SpaceBlock.total_pow
    │
    ▼ (sum)
RootBlock.total_pow (block's PoW)
    │
    ▼ (+ prev_cumulative_pow)
RootBlock.cumulative_pow (chain's total PoW)
```

### Parent-Anchored Threading

Replies stay with their parent thread:

1. **Thread roots (POST)** get a `BranchPath` based on their content hash
2. **Replies** inherit the parent's `BranchPath` via `BranchPath::for_reply()`
3. **Engagements** go to the TARGET content's branch, not the engager's

This ensures:
- Entire threads stay in the same branch
- Users syncing a branch get complete threads
- Cross-branch engagements are recorded in the content's branch

### Branch Fracturing

When a branch exceeds 50MB (configurable):

1. **Create child branches**: LEFT and RIGHT at next depth
2. **Redistribute threads**: Based on hash bit at fracture depth
3. **Update indexes**: Only pointers change, data is not moved
4. **Thread integrity preserved**: Entire thread moves together

```
Before:                    After:
┌────────────┐            ┌───────────┐
│   Root     │            │   Left    │ (threads with bit 0)
│ 60MB total │    ─────>  └───────────┘
└────────────┘            ┌───────────┐
                          │   Right   │ (threads with bit 1)
                          └───────────┘
```

### Fork Resolution

When competing chains exist:

1. **Compare `cumulative_pow`** of chain tips
2. **Higher cumulative PoW wins** (heavier chain is canonical)
3. **Switch to heavier chain** if discovered

```rust
if new_block.cumulative_pow > current_tip.cumulative_pow {
    // Reorganize to new chain
}
```

### Deterministic Leader Election

Block creation eligibility expands over time:

1. **Compute block seed**: `SHA256(prev_block_hash || space_id)`
2. **Calculate XOR distance**: Between identity and seed
3. **Eligibility expands**: From 0.001% to 100% over 8 minutes (logarithmic)
4. **Closer identities** become eligible earlier

This prevents:
- Simultaneous block formation by many nodes
- Need for explicit leader coordination
- Centralized block production

### Replace-In-Mempool (RIM)

Allows editing unconfirmed actions:

1. **Create edit action** with `replaces_pending = Some(original_hash)`
2. **BlockBuilder validates**: Same author, target exists in mempool
3. **Old action removed**, new action added
4. **Single on-chain action** instead of create+edit

## Configuration

| Constant | Type | Default | Description |
|----------|------|---------|-------------|
| `INITIAL_DIFFICULTY` | `u64` | 30 | Initial PoW threshold (seconds) |
| `TIMESTAMP_QUANTUM_SECS` | `u64` | 10 | Timestamp quantization window |
| `LAZY_BLOCK_WAIT_MS` | `u64` | 30,000 | Wait time before forming block |
| `TIMESTAMP_WINDOW_SECS` | `u64` | 600 | Max timestamp age (10 minutes) |
| `TIMESTAMP_FUTURE_SECS` | `u64` | 60 | Max timestamp in future |
| `TARGET_BLOCK_INTERVAL` | `u64` | 600 | Target time between blocks (10 min) |
| `MAX_ELIGIBILITY_TIME` | `u64` | 480 | Time until anyone is eligible (8 min) |
| `BASE_STARTING_PCT` | `f64` | 0.001 | Base eligibility percentage |
| `MIN_STARTING_PCT` | `f64` | 0.00001 | Minimum eligibility percentage |
| `MAX_STARTING_PCT` | `f64` | 10.0 | Maximum eligibility percentage |
| `BRANCH_FRACTURE_THRESHOLD` | `u64` | 52,428,800 | 50MB - fracture threshold |
| `MAX_MEDIA_REFS` | `usize` | 4 | Max media attachments per action |
| `ACTION_SERIALIZED_SIZE` | `usize` | 432 | Fixed action serialization size |
| `BranchPath::MAX_DEPTH` | `u8` | 255 | Maximum branch tree depth |
| `DIFFICULTY_ADJUSTMENT_WINDOW` | `usize` | 10 | Blocks for difficulty adjustment |

## RPC Methods

### submit_action
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_action",
  "params": {
    "action_type": "Post",
    "content_hash": "base64...",
    "space_id": "base64...",
    "pow_nonce": 12345,
    "pow_work": 30,
    "signature": "base64..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "action_hash": "base64...",
    "accepted": true
  },
  "id": 1
}
```

### get_block
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_block",
  "params": {
    "height": 1234
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "height": 1234,
    "timestamp": 1704067200,
    "total_pow": 500,
    "cumulative_pow": 150000,
    "space_block_count": 5
  },
  "id": 1
}
```

## CLI Commands

```bash
# View block by height or hash
sw block view <height|hash>

# View action by content hash
sw block action <hash>

# Show chain statistics
sw block stats

# View content block details
sw block content <hash>
```

## Error Handling

| Error Type | Cause | Resolution |
|------------|-------|------------|
| `RootBlockError::PoWSumMismatch` | Space block PoW doesn't sum to total_pow | Recompute total_pow from space blocks |
| `RootBlockError::MerkleRootMismatch` | Merkle root doesn't match space block hashes | Recompute merkle root |
| `RootBlockError::DifficultyNotMet` | total_pow < difficulty_target | Wait for more actions |
| `SpaceBlockError::EmptyContentBlocks` | No content blocks provided | Include at least one content block |
| `SpaceBlockError::SpaceMismatch` | Content block space_id doesn't match | Ensure content blocks belong to space |
| `ContentBlockError::EmptyActions` | No actions provided | Include at least one action |
| `ContentBlockError::InvalidAction` | Action fails type-specific validation | Check action requirements |
| `ValidationError::TimestampTooOld` | Action timestamp > 10 minutes old | Use current timestamp |
| `ValidationError::TimestampInFuture` | Action timestamp > 60 seconds in future | Synchronize system clock |
| `ValidationError::SignatureVerificationFailed` | Signature doesn't verify | Re-sign with correct key |
| `BranchError::ThreadNotFound` | Reply to non-existent thread | Create parent thread first |
| `BranchError::MaxDepthReached` | Cannot fracture at depth 255 | Branch tree is at maximum |

## Validation Rules

### Per-Action-Type Requirements

| Action Type | content_hash | parent_id | pow_work | Notes |
|-------------|--------------|-----------|----------|-------|
| `CreateSpace` | Required (space_id) | None | ≥ 1 | Creates new space |
| `Post` | Required | None | ≥ 1 | Creates thread |
| `Reply` | Required | Required | ≥ 1 | Responds to content |
| `Engage` | Required (target) | None | ≥ 0 | Can be from pool |
| `Edit` | Required (new) | Required (original) | ≥ 1 | Modifies content |
| `Invite` | Required (payload) | Required (space_id) | ≥ 1 | Invites to space |
| `Leave` | None | Required (space_id) | 0 | Free to leave |
| `Kick` | Required (member) | Required (space_id) | ≥ 1 | Admin only |
| `RevokeInvite` | Required (invite hash) | None | 0 | Free to revoke |
| `KeyRotation` | Required (payload) | Required (space_id) | ≥ 1 | After kick |
| `DMRequest` | Required (payload) | None | ≥ 1 | Anti-spam |
| `AcceptDM` | Required (payload) | Required (space_id) | 0 | Free to accept |
| `DeclineDM` | None | Required (request hash) | 0 | Free to decline |

## Testing

### Running Block Tests

```bash
# Run all block-related tests
cargo test blocks::

# Run specific test modules
cargo test blocks::root_block::tests
cargo test blocks::space_block::tests
cargo test blocks::content_block::tests
cargo test blocks::action::tests
cargo test blocks::merkle::tests
cargo test blocks::validation::tests
cargo test blocks::leader::tests
cargo test blocks::builder::tests

# Run branch tests
cargo test branch::

# Run with output
cargo test blocks:: -- --nocapture
```

### Integration Tests

```bash
# Block building integration
cargo test --test blockbuilder_integration

# Block propagation
cargo test --test block_propagation

# Multi-node block building
cargo test --test block_building
```

## Known Limitations

1. **Fixed Action Size**: Actions are serialized to exactly 432 bytes, limiting display_name to 31 characters and media_refs to 4 attachments.

2. **Branch Depth Limit**: Maximum branch depth of 255 limits fracturing for extremely large spaces.

3. **Lazy Wait Timing**: The 30-second lazy block wait can delay block formation in low-activity periods.

4. **Genesis Block PoW**: Genesis block has zero PoW and doesn't meet difficulty, requiring special-case handling in validation.

5. **Timestamp Quantization**: 10-second timestamp windows can cause slight timestamp inaccuracy.

## Future Work

1. **Dynamic Difficulty Adjustment**: Full Bitcoin-style difficulty adjustment based on block frequency.

2. **Compact Block Relay**: Send block headers with transaction hashes to reduce bandwidth.

3. **Parallel Block Validation**: Validate content blocks in parallel for faster sync.

4. **Branch Pruning**: Allow nodes to prune old branches they don't need.

5. **Variable Action Size**: Support larger content or more media references.

## Related Features

- **Proof-of-Work Systems** - PoW mining and verification
- **Content & Decay Engine** - Content storage in blocks
- **Storage Layer** - Block persistence
- **Synchronization** - Block download and validation
- **Sponsorship & Sybil Resistance** - Identity validation for actions

## Quality Checklist

From MASTER_FEATURES.md:

- [x] Block timestamps monotonically increase
- [x] Merkle roots correctly computed
- [x] Branch paths maintain thread integrity
- [x] PoW validates at each level
- [x] Orphan blocks handled correctly (via cumulative_pow fork resolution)
