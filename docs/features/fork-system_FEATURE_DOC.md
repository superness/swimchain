# Fork System - Feature Documentation

## Overview

The Fork System enables communities to escape from captured or hostile chains while preserving identity, social graphs, and optionally content. This implements the "Fork-Friendly Chain Ecosystem" described in VISION Section 5 and Whitepaper Definitions 5.1-5.4.

**Key Principles**:
- **Community Sovereignty**: Any community can fork away from hostile takeovers or governance disputes
- **Identity Preservation**: Ed25519 keypairs work across all forks (Theorem 5.1)
- **Selective Migration**: Content can be fully inherited, excluded, or selectively filtered
- **Bad Actor Exclusion**: Specific identities can be blocked from the new fork

**Owner Area**: `src/fork/`

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Fork System                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │  ForkConfig  │───>│ ForkGenesis  │───>│   ForkId     │           │
│  │   (Builder)  │    │   (Block)    │    │ (SHA-256)    │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   │                   │                    │
│         v                   v                   v                    │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │                     ForkRegistry                          │       │
│  │  - create_fork()   - switch_fork()   - list_forks()      │       │
│  │  - get_fork_info() - is_excluded()   - add_fork_support()│       │
│  └──────────────────────────────────────────────────────────┘       │
│                            │                                         │
│                            v                                         │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │                       ForkStore                           │       │
│  │            (sled database persistence)                    │       │
│  │    Trees: fork_genesis | fork_known | fork_active         │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Module Structure**:

| File | Purpose |
|------|---------|
| `src/fork/mod.rs` | Module exports and `calculate_fork_id()` function |
| `src/fork/genesis.rs` | `ForkConfig`, `ForkConfigBuilder`, `ForkGenesis`, `ContentSelector` |
| `src/fork/registry.rs` | `ForkRegistry`, `Identity`, `ForkInfo`, `ForkCreationResult`, `ForkError` |
| `src/fork/storage.rs` | `ForkStore` persistence layer, `ForkStoreError` |

## Data Structures

### ForkId

32-byte identifier for a fork, derived deterministically from the fork genesis block via SHA-256 hashing.

**Location**: `src/types/block.rs:52-88`

| Field | Type | Description |
|-------|------|-------------|
| `0` | `[u8; 32]` | Raw 32-byte fork identifier |

**Special Values**:
- `ForkId::main_chain()` returns `[0u8; 32]` (all zeros) representing the main chain

### ContentSelector

Enum specifying how content is inherited when creating a fork.

**Location**: `src/fork/genesis.rs:11-25`

| Variant | Description |
|---------|-------------|
| `All` | Inherit all content except from excluded identities (default) |
| `None` | Start fresh with no inherited content |
| `Selective { ... }` | Filter content based on space, time, or identity |

**Selective Variant Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `space_filter` | `Option<Vec<String>>` | Only include content from these spaces (`None` = all spaces) |
| `time_filter` | `Option<u64>` | Only include content newer than this Unix timestamp (`None` = all time) |
| `identity_filter` | `Option<Vec<[u8; 32]>>` | Only include content from these identities (`None` = all identities) |

### ForkConfig

Configuration input for creating a new fork, built using the builder pattern.

**Location**: `src/fork/genesis.rs:35-48`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `String` | `""` | Human-readable fork name (1-64 chars, required) |
| `description` | `String` | `""` | Reason for fork creation |
| `excluded_ids` | `HashSet<[u8; 32]>` | `{}` | Public keys of bad actors to exclude |
| `content_selector` | `ContentSelector` | `All` | Content inheritance mode |
| `pow_multiplier` | `f64` | `1.0` | PoW difficulty adjustment (0.1-10.0, clamped) |
| `decay_multiplier` | `f64` | `1.0` | Content decay rate adjustment (0.1-10.0, clamped) |

### ForkGenesis

Complete genesis block for a fork, containing all configuration and signatures.

**Location**: `src/fork/genesis.rs:138-165`

| Field | Type | Description |
|-------|------|-------------|
| `version` | `u32` | Protocol version (currently 1) |
| `parent_fork` | `ForkId` | Fork this branches from (zeros for main chain) |
| `parent_height` | `u64` | Block height in parent where fork occurs |
| `parent_block` | `[u8; 32]` | Block hash at `parent_height` |
| `timestamp` | `u64` | Unix timestamp of fork creation |
| `name` | `String` | Human-readable fork name |
| `description` | `String` | Fork description |
| `config` | `Vec<u8>` | Serialized ForkConfig |
| `excluded_ids` | `Vec<[u8; 32]>` | Excluded identity public keys |
| `content_selector_bytes` | `Vec<u8>` | Serialized ContentSelector |
| `creator_id` | `[u8; 32]` | Creator's Ed25519 public key |
| `creator_sig` | `[u8; 64]` | Creator's signature over genesis |
| `supporter_sigs` | `Vec<([u8; 32], [u8; 64])>` | Endorsement signatures (pubkey, sig) |

### ForkInfo

Summary information about a fork for display purposes.

**Location**: `src/fork/registry.rs:332-353`

| Field | Type | Description |
|-------|------|-------------|
| `fork_id` | `ForkId` | Fork identifier |
| `name` | `String` | Fork name |
| `description` | `String` | Fork description |
| `parent_fork` | `Option<ForkId>` | Parent fork (None for main chain) |
| `parent_height` | `u64` | Height in parent where fork occurred |
| `creator` | `[u8; 32]` | Creator's public key |
| `timestamp` | `u64` | Creation Unix timestamp |
| `excluded_count` | `usize` | Number of excluded identities |
| `supporter_count` | `usize` | Number of endorsement signatures |

### ForkCreationResult

Result returned from successful fork creation.

**Location**: `src/fork/registry.rs:76-86`

| Field | Type | Description |
|-------|------|-------------|
| `fork_id` | `ForkId` | The new fork's identifier |
| `genesis` | `ForkGenesis` | The complete genesis block |
| `inherited_content_count` | `u64` | Estimated content items to inherit |
| `excluded_count` | `usize` | Number of excluded identities |

### Identity

Wrapper for Ed25519 keypair used in fork operations.

**Location**: `src/fork/registry.rs:13-54`

| Field | Type | Description |
|-------|------|-------------|
| `keypair` | `KeyPair` | Ed25519 keypair for signing |

## Core APIs

### ForkConfig::builder()

**Signature**: `pub fn builder() -> ForkConfigBuilder`

**Purpose**: Creates a builder for constructing fork configuration.

**Example**:
```rust
use swimchain::fork::{ForkConfig, ContentSelector};

let config = ForkConfig::builder()
    .name("community-v2")
    .description("Fork away from hostile takeover")
    .exclude_identity([0xBA; 32])  // Bad actor pubkey
    .exclude_identity([0xBB; 32])  // Another bad actor
    .content_mode(ContentSelector::Selective {
        space_filter: Some(vec!["gardening".into()]),
        time_filter: Some(1700000000),  // Unix timestamp
        identity_filter: None,
    })
    .pow_multiplier(1.5)   // 50% harder PoW
    .decay_multiplier(0.8) // 20% slower decay
    .build();
```

### ForkConfigBuilder Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `name()` | `fn name(self, name: impl Into<String>) -> Self` | Set fork name (required) |
| `description()` | `fn description(self, desc: impl Into<String>) -> Self` | Set description |
| `exclude_identity()` | `fn exclude_identity(self, id: [u8; 32]) -> Self` | Add identity to exclusion list |
| `exclude_identities()` | `fn exclude_identities(self, ids: impl IntoIterator<Item = [u8; 32]>) -> Self` | Add multiple exclusions |
| `content_mode()` | `fn content_mode(self, mode: ContentSelector) -> Self` | Set content inheritance |
| `pow_multiplier()` | `fn pow_multiplier(self, mult: f64) -> Self` | Set PoW adjustment (clamped 0.1-10.0) |
| `decay_multiplier()` | `fn decay_multiplier(self, mult: f64) -> Self` | Set decay adjustment (clamped 0.1-10.0) |
| `build()` | `fn build(self) -> ForkConfig` | Finalize configuration |

### ForkGenesis::new()

**Signature**:
```rust
pub fn new(
    parent_fork: ForkId,
    parent_height: u64,
    parent_block: [u8; 32],
    name: String,
    description: String,
    creator_id: [u8; 32],
) -> Self
```

**Purpose**: Creates a new fork genesis block with default values.

**Parameters**:
- `parent_fork`: The fork this branches from
- `parent_height`: Block height in parent where fork occurs
- `parent_block`: Block hash at parent_height
- `name`: Human-readable fork name
- `description`: Fork description
- `creator_id`: Creator's Ed25519 public key

**Returns**: A new `ForkGenesis` with timestamp set to current time

### ForkGenesis Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `with_config()` | `fn with_config(self, config: &ForkConfig) -> Self` | Apply fork configuration |
| `add_supporter()` | `fn add_supporter(&mut self, pubkey: [u8; 32], sig: [u8; 64])` | Add endorsement signature |
| `is_excluded()` | `fn is_excluded(&self, id: &[u8; 32]) -> bool` | Check if identity is excluded |
| `supporter_count()` | `fn supporter_count(&self) -> usize` | Get number of supporters |
| `to_bytes()` | `fn to_bytes(&self) -> Vec<u8>` | Serialize for hashing/signing |
| `from_bytes()` | `fn from_bytes(bytes: &[u8]) -> Option<Self>` | Deserialize from bytes |

### calculate_fork_id()

**Signature**: `pub fn calculate_fork_id(genesis: &ForkGenesis) -> ForkId`

**Purpose**: Deterministically calculates a fork ID from a genesis block using SHA-256.

**Parameters**:
- `genesis`: The fork genesis block

**Returns**: A `ForkId` (32-byte hash)

**Example**:
```rust
use swimchain::fork::{calculate_fork_id, ForkGenesis};
use swimchain::types::block::ForkId;

let genesis = ForkGenesis::new(
    ForkId::main_chain(),
    100,
    [0xAB; 32],
    "my-fork".into(),
    "A community fork".into(),
    creator_pubkey,
);

let fork_id = calculate_fork_id(&genesis);
// Fork ID is deterministic - same genesis always produces same ID
```

### ForkRegistry Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `new()` | `fn new(store: Arc<ForkStore>, chain_store: Option<Arc<ChainStore>>) -> Self` | Create registry |
| `active_fork()` | `fn active_fork(&self) -> ForkId` | Get current active fork |
| `create_fork()` | `fn create_fork(&self, config: ForkConfig, identity: &Identity) -> Result<ForkCreationResult, ForkError>` | Create new fork |
| `switch_fork()` | `fn switch_fork(&self, fork_id: ForkId) -> Result<(), ForkError>` | Switch active fork |
| `get_fork()` | `fn get_fork(&self, fork_id: &ForkId) -> Result<Option<ForkGenesis>, ForkError>` | Get genesis by ID |
| `list_forks()` | `fn list_forks(&self) -> Result<Vec<ForkId>, ForkError>` | List known forks |
| `get_fork_info()` | `fn get_fork_info(&self, fork_id: &ForkId) -> Result<ForkInfo, ForkError>` | Get fork summary |
| `is_excluded()` | `fn is_excluded(&self, identity: &[u8; 32]) -> Result<bool, ForkError>` | Check exclusion in active fork |
| `add_fork_support()` | `fn add_fork_support(&self, fork_id: &ForkId, identity: &Identity) -> Result<(), ForkError>` | Add endorsement |
| `delete_fork()` | `fn delete_fork(&self, fork_id: &ForkId) -> Result<(), ForkError>` | Delete non-active fork |
| `fork_count()` | `fn fork_count(&self) -> Result<usize, ForkError>` | Get number of known forks |

### Identity Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `from_secret_key()` | `fn from_secret_key(seed: &[u8; 32]) -> Result<Self, String>` | Create from 32-byte seed |
| `generate()` | `fn generate() -> Result<Self, String>` | Generate new random identity |
| `public_key()` | `fn public_key(&self) -> [u8; 32]` | Get public key bytes |
| `sign()` | `fn sign(&self, message: &[u8]) -> [u8; 64]` | Sign a message |

### ForkStore Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `open()` | `fn open(db: Arc<Db>) -> Result<Self, ForkStoreError>` | Open/create storage |
| `store_genesis()` | `fn store_genesis(&self, fork_id: &ForkId, genesis: &ForkGenesis) -> Result<(), ForkStoreError>` | Store genesis |
| `get_genesis()` | `fn get_genesis(&self, fork_id: &ForkId) -> Result<Option<ForkGenesis>, ForkStoreError>` | Retrieve genesis |
| `contains()` | `fn contains(&self, fork_id: &ForkId) -> Result<bool, ForkStoreError>` | Check if fork exists |
| `list_known_forks()` | `fn list_known_forks(&self) -> Result<Vec<ForkId>, ForkStoreError>` | List all fork IDs |
| `set_active_fork()` | `fn set_active_fork(&self, fork_id: &ForkId) -> Result<(), ForkStoreError>` | Set active fork |
| `get_active_fork()` | `fn get_active_fork(&self) -> Result<ForkId, ForkStoreError>` | Get active fork |
| `delete_fork()` | `fn delete_fork(&self, fork_id: &ForkId) -> Result<(), ForkStoreError>` | Delete fork |
| `fork_count()` | `fn fork_count(&self) -> Result<usize, ForkStoreError>` | Count known forks |

## Behaviors

### Fork Creation Workflow

When `ForkRegistry::create_fork()` is called:

1. **Validation**
   - Fork name must be 1-64 characters (non-empty)
   - PoW/decay multipliers are clamped to 0.1-10.0 range

2. **Chain State Capture**
   - Get current chain height from `ChainStore`
   - Get block hash at that height for `parent_block`
   - If no chain store, defaults to height 0 and zero hash

3. **Genesis Construction**
   - Create `ForkGenesis` with parent info and creator ID
   - Apply configuration via `with_config()`
   - Sign genesis with creator's identity

4. **Fork ID Calculation**
   - Serialize genesis to bytes via `to_bytes()`
   - Hash with SHA-256
   - Result is deterministic fork ID

5. **Duplicate Check**
   - Verify fork ID doesn't already exist in store

6. **Content Estimation**
   - `All`: Estimate = chain height * 10
   - `None`: 0 items
   - `Selective`: Estimate based on time window (1 action/minute) or height * 5

7. **Persistence**
   - Store genesis in `fork_genesis` sled tree
   - Add fork ID to `fork_known` list

### Fork Switching Process

When `ForkRegistry::switch_fork()` is called:

1. If target is main chain (`[0u8; 32]`), always allow
2. Verify fork exists in `ForkStore`
3. Update `fork_active` tree in sled
4. Update in-memory cached `active_fork` (behind RwLock)

### Exclusion Checking

When `ForkRegistry::is_excluded()` is called:

1. Get active fork ID
2. If main chain, return `false` (main chain has no exclusions)
3. Load fork genesis from store
4. Check if identity is in `excluded_ids` list via `ForkGenesis::is_excluded()`

### Fork ID Determinism

Fork IDs are deterministic because:
- Same genesis block always produces same SHA-256 hash
- All fields (including timestamps) are included in serialization
- Different names/descriptions/configs produce different IDs

## Configuration

| Option | Type | Default | Valid Range | Description |
|--------|------|---------|-------------|-------------|
| `name` | `String` | `""` | 1-64 chars | Fork name (required) |
| `description` | `String` | `""` | Any | Fork description |
| `excluded_ids` | `HashSet<[u8; 32]>` | `{}` | Any | Excluded public keys |
| `content_selector` | `ContentSelector` | `All` | Enum | Content migration mode |
| `pow_multiplier` | `f64` | `1.0` | 0.1-10.0 | PoW difficulty adjustment |
| `decay_multiplier` | `f64` | `1.0` | 0.1-10.0 | Decay rate adjustment |

**Multiplier Semantics**:
- `pow_multiplier > 1.0`: Harder proof-of-work required
- `pow_multiplier < 1.0`: Easier proof-of-work required
- `decay_multiplier > 1.0`: Content decays faster
- `decay_multiplier < 1.0`: Content decays slower

## RPC Methods

### create_fork

Creates a new fork from the current chain state.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "create_fork",
  "params": {
    "name": "community-v2",
    "description": "Fork away from spam",
    "excluded_ids": ["ba0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad"],
    "content_mode": "all",
    "pow_multiplier": 1.0,
    "decay_multiplier": 1.0,
    "secret_key": "your32bytesecretkeyhex..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "fork_id": "abc123...",
    "name": "community-v2",
    "parent_fork": "0000000000000000000000000000000000000000000000000000000000000000",
    "parent_height": 12345,
    "inherited_content_count": 123450,
    "excluded_count": 1,
    "timestamp": 1700000000
  },
  "id": 1
}
```

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Fork name (1-64 chars) |
| `description` | string | No | Fork description |
| `excluded_ids` | string[] | No | Hex-encoded public keys to exclude |
| `content_mode` | string | No | "all", "none", or "selective" (default: "all") |
| `pow_multiplier` | number | No | PoW adjustment (default: 1.0) |
| `decay_multiplier` | number | No | Decay adjustment (default: 1.0) |
| `secret_key` | string | Yes | 32-byte hex-encoded secret key |

### switch_fork

Switches to a different fork.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "switch_fork",
  "params": {
    "fork_id": "abc123..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "active_fork": "abc123..."
  },
  "id": 1
}
```

Use `"fork_id": "main"` or all zeros to switch to the main chain.

### list_forks

Lists all known forks including the main chain.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "list_forks",
  "params": null,
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "forks": [
      {"fork_id": "0000...", "name": "main", "is_active": true},
      {"fork_id": "abc123...", "name": "community-v2", "is_active": false}
    ],
    "count": 2
  },
  "id": 1
}
```

### get_fork_info

Gets detailed information about a specific fork.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_fork_info",
  "params": {
    "fork_id": "abc123..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "fork_id": "abc123...",
    "name": "community-v2",
    "description": "Fork away from spam",
    "parent_fork": "0000000000000000000000000000000000000000000000000000000000000000",
    "parent_height": 12345,
    "creator": "creator_pubkey_hex...",
    "timestamp": 1700000000,
    "excluded_count": 1,
    "supporter_count": 5,
    "is_active": false
  },
  "id": 1
}
```

### get_active_fork

Gets the currently active fork.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_active_fork",
  "params": null,
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "fork_id": "0000000000000000000000000000000000000000000000000000000000000000",
    "name": "main",
    "is_main_chain": true
  },
  "id": 1
}
```

## CLI Commands

### sw fork create

Create a new fork from the current chain.

```bash
sw fork create --name "community-v2" --description "Fork away from spam"
sw fork create --name "clean-fork" --exclude cs1badactor... --exclude cs1spammer...
sw fork create --name "fresh-start" --content-mode none
```

**Options**:

| Flag | Description |
|------|-------------|
| `--name <NAME>` | Fork name (required, 1-64 chars) |
| `--description <DESC>` | Fork description |
| `--exclude <ID>` | Identity to exclude (can specify multiple times) |
| `--content-mode <MODE>` | "all", "none", or "selective" (default: all) |

### sw fork list

List all known forks.

```bash
sw fork list
sw fork list --json
```

**Example Output**:
```
Known forks (2):
  Active: main

  main (0000...) *
  community-v2 (abc123...)
```

### sw fork switch

Switch to a different fork.

```bash
sw fork switch main
sw fork switch abc123...
```

### sw fork info

Get detailed information about a fork.

```bash
sw fork info main
sw fork info abc123...
sw fork info abc123... --json
```

**Example Output**:
```
Fork: community-v2 (abc123...)
Description: Fork away from spam
Parent fork: 0000...
Parent height: 12345
Creator: cs1creator...
Excluded identities: 1
Supporters: 5
```

### sw fork active

Show the currently active fork.

```bash
sw fork active
sw fork active --json
```

## Error Handling

### ForkError Types

| Error | Cause | Resolution |
|-------|-------|------------|
| `Storage(ForkStoreError)` | Database operation failed | Check disk space and permissions |
| `NotFound(ForkId)` | Fork doesn't exist in registry | Verify fork ID is correct |
| `AlreadyExists(ForkId)` | Fork with same ID already exists | Use different configuration (different name/description) |
| `InvalidConfig(String)` | Invalid configuration (empty name, name too long) | Fix configuration parameters |
| `SignatureError(String)` | Signature verification failed | Check identity/keypair validity |
| `ChainError(String)` | Chain store operation failed | Check node state |
| `IdentityRequired` | No identity provided for creation | Provide secret key |

### ForkStoreError Types

| Error | Cause | Resolution |
|-------|-------|------------|
| `Storage(sled::Error)` | Sled database error | Check database files, disk space |
| `NotFound(ForkId)` | Fork not found in storage | Create the fork first |
| `AlreadyExists(ForkId)` | Fork already exists in storage | Delete existing or use different config |
| `DeserializationError` | Corrupt genesis data | May need to delete and recreate fork |

## Testing

### Unit Tests

Run fork system tests:

```bash
cargo test fork --lib
```

### Key Test Cases

```bash
# Test fork ID determinism
cargo test test_fork_id_deterministic

# Test different genesis produces different ID
cargo test test_different_genesis_different_id

# Test fork config builder
cargo test test_fork_config_builder

# Test genesis serialization roundtrip
cargo test test_fork_genesis_serialization

# Test fork creation
cargo test test_create_fork

# Test fork switching
cargo test test_switch_fork

# Test exclusion lists
cargo test test_exclusion_check

# Test fork info
cargo test test_fork_info

# Test main chain info
cargo test test_main_chain_info

# Test name validation
cargo test test_fork_name_validation

# Test adding fork support
cargo test test_add_fork_support

# Storage tests
cargo test test_store_and_retrieve_genesis
cargo test test_list_known_forks
cargo test test_active_fork
cargo test test_delete_non_active_fork
cargo test test_cannot_delete_active_fork
cargo test test_cannot_switch_to_unknown_fork
```

### Integration Testing

```bash
# Start a node and create a fork via CLI
sw node start &
sw fork create --name "test-fork" --description "Testing"
sw fork list
sw fork switch test-fork
sw fork active
sw fork info test-fork
sw fork switch main
```

## Known Limitations

1. **Content Migration Not Implemented**: The `inherited_content_count` is an estimation only. Actual content migration logic is not yet implemented - content is not copied during fork creation.

2. **Selective Filters Not Exposed via RPC**: When using `content_mode: "selective"` via RPC, the `space_filter`, `time_filter`, and `identity_filter` parameters are all set to `None`. Full selective filtering is only available via the Rust API.

3. **Fork Network Propagation Incomplete**: While fork message types are defined in the protocol (ForkAnnounce `0x53`, ForkQuery `0x54`, ForkInfo `0x55`), the handlers for propagating forks across the network are not fully implemented.

4. **No Cross-Fork Sync**: Switching forks requires a full re-sync from peers on the target fork. There is no mechanism to maintain sync state across multiple forks simultaneously.

5. **Cannot Delete Active Fork**: The active fork cannot be deleted. You must switch to a different fork first.

6. **Documentation vs Implementation Discrepancy**: MASTER_FEATURES.md shows `time_filter: Option<TimeRange>` but the actual implementation uses `time_filter: Option<u64>` (Unix timestamp).

## Future Work

- **Full Content Migration**: Implement actual content copying based on `ContentSelector` settings
- **RPC Selective Filter Parameters**: Expose `space_filter`, `time_filter`, `identity_filter` in RPC
- **Fork Network Propagation**: Complete fork announcement and discovery handlers
- **Multi-Fork Sync**: Allow maintaining connections to multiple forks simultaneously
- **Fork Merge/Reconciliation**: Tools for reconciling diverged fork histories
- **Fork Governance**: Voting mechanisms for fork decisions

## Related Features

- [Identity & Cryptography](./identity-cryptography_FEATURE_DOC.md) - Keys work across all forks
- [Block Formation & Consensus](./block-formation_FEATURE_DOC.md) - Fork genesis block structure
- [Synchronization](./synchronization_FEATURE_DOC.md) - Fork detection during sync
- [RPC Interface](./rpc-interface_FEATURE_DOC.md) - Fork-related RPC methods

---

*Generated from codebase analysis on 2026-01-11*
