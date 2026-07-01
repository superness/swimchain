# Blocklist Protocol - Feature Documentation

**Status**: Complete (with gaps noted)
**Owner Area**: `src/blocklist/`
**Specification**: SPEC_12 Sections 3.6, 4.4, 4.6, 5.4-5.5
**Last Updated**: 2026-01-12

## Overview

The Blocklist Protocol provides a distributed mechanism for identifying and blocking illegal content (CSAM, terrorism) across the Swimchain network. It uses a hash-based identification system where content hashes are blocklisted rather than storing actual illegal content. The protocol ensures:

- **Community-driven moderation**: 3 independent attesters required to add content
- **Higher bar for removal**: 5 Anchor-level counter-attestations to remove
- **Eventual consistency**: Merkle tree-based synchronization across nodes
- **Network-wide enforcement**: All nodes reject blocklisted content on storage and retrieval
- **Privacy-preserving**: No content scanning; only hash-based identification

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Node A                                       │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────────┐  │
│  │   RPC Layer  │  │ Content Router  │  │   Anti-Abuse Handler   │  │
│  │              │  │                 │  │                        │  │
│  │  POST/MEDIA  │  │  DATA_CONTENT   │  │  Retrieval Checks      │  │
│  │  Blocklist   │──│  Blocklist      │──│  is_blocklisted()      │  │
│  │  Checks      │  │  Checks         │  │                        │  │
│  └──────┬───────┘  └────────┬────────┘  └───────────┬────────────┘  │
│         │                   │                       │               │
│         └───────────────────┴───────────────────────┘               │
│                             │                                        │
│                   ┌─────────▼─────────┐                             │
│                   │  BlocklistStore   │                             │
│                   │    (Sled DB)      │                             │
│                   │                   │                             │
│                   │  - Entries tree   │                             │
│                   │  - Metadata tree  │                             │
│                   │  - Merkle root    │                             │
│                   └─────────┬─────────┘                             │
└─────────────────────────────│───────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  BlocklistGossip  │
                    │                   │
                    │  MSG_BLOCKLIST_*  │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │  Node B   │   │  Node C   │   │  Node D   │
        └───────────┘   └───────────┘   └───────────┘
```

### Layer Responsibilities

| Layer | File | Responsibility |
|-------|------|----------------|
| RPC | `src/rpc/methods.rs` | Check blocklist before creating content |
| Router | `src/node/router/router.rs` | Reject blocked content from network, handle gossip |
| Anti-Abuse | `src/api/anti_abuse.rs` | Check before serving content |
| Storage | `src/blocklist/storage.rs` | Persist entries, compute Merkle root |
| Gossip | `src/blocklist/gossip.rs` | Validate and propagate updates |
| Merkle | `src/blocklist/merkle.rs` | Sync state, proofs, diff computation |

## Data Structures

### BlocklistReason

```rust
pub enum BlocklistReason {
    CSAM = 0x01,        // Child sexual abuse material
    Terrorism = 0x02,   // Terrorism-related content
    ExternalList = 0x03 // Content from known external databases (e.g., NCMEC)
}
```

**Purpose**: Categorizes why content was added to the blocklist
**Used by**: `BlocklistEntry`, `BlocklistUpdate`, API error responses

### BlocklistEntry

```rust
pub struct BlocklistEntry {
    pub content_hash: [u8; 32],              // SHA-256 hash of blocked content
    pub reason: BlocklistReason,              // Category of illegal content
    pub attestations: Vec<SpamAttestation>,   // Attestations that triggered blocking
    pub added_at: u64,                        // Unix timestamp when first added
    pub source_node: [u8; 32],                // Public key of reporting node
    pub propagation_confirmations: u32,       // Nodes that confirmed receipt
}
```

**Purpose**: Represents a single blocklisted content item
**Used by**: `BlocklistStore`, `BlocklistGossip`, network synchronization

**Methods**:
- `new()` - Create entry with initial confirmation count of 1
- `is_confirmed()` - Returns true if confirmations >= MIN_BLOCKLIST_CONFIRMATIONS (10)
- `confirm()` - Increment propagation confirmation count
- `attestation_count()` - Get number of attestations

### BlocklistUpdate

```rust
pub struct BlocklistUpdate {
    pub update_type: BlocklistUpdateType,  // Add (0x01) or Remove (0x02)
    pub content_hash: [u8; 32],            // Hash being added/removed
    pub reason: BlocklistReason,           // Reason for action
    pub reporting_node: [u8; 32],          // Node creating the update
    pub attestations: Vec<SpamAttestation>, // Supporting attestations
    pub timestamp: u64,                    // Update creation time
    pub signature: [u8; 64],               // Ed25519 signature
}
```

**Purpose**: Network message for propagating blocklist changes
**Wire format**: Variable length (depends on attestation count)
**Serialization**: Custom binary format with little-endian integers

### BlocklistSync

```rust
pub struct BlocklistSync {
    pub entry_count: u32,        // Number of entries in blocklist
    pub merkle_root: [u8; 32],   // Merkle root of blocklist
    pub last_update: u64,        // Timestamp of last update
    pub signature: [u8; 64],     // Ed25519 signature
}
```

**Purpose**: Periodic Merkle root exchange for eventual consistency
**Size**: 108 bytes (fixed)
**Used by**: `handle_blocklist_sync()` in router

### BlocklistRequest

```rust
pub struct BlocklistRequest {
    pub requested_hashes: Vec<[u8; 32]>,  // Specific hashes to request
    pub since_timestamp: u64,              // Request entries added after this time
}
```

**Purpose**: Request specific blocklist entries from peers
**Used by**: Merkle sync reconciliation

### SyncState

```rust
pub struct SyncState {
    pub local_root: [u8; 32],                              // Our Merkle root
    pub local_count: u32,                                   // Our entry count
    pub peer_sync_times: HashMap<[u8; 32], u64>,           // Last sync per peer
    pub peer_roots: HashMap<[u8; 32], ([u8; 32], u32)>,    // Peer roots and counts
}
```

**Purpose**: Tracks synchronization state with peers
**Used by**: `BlocklistStore`, sync scheduling

### MerkleProof

```rust
pub struct MerkleProof {
    pub entry_hash: [u8; 32],                   // Entry being proven
    pub siblings: Vec<([u8; 32], bool)>,        // Sibling hashes with position
}
```

**Purpose**: Cryptographic proof of blocklist inclusion
**Used by**: Verification during sync disputes

## Public APIs

### BlocklistStore

Persistent storage using sled database.

```rust
impl BlocklistStore {
    pub fn open(db: Arc<Db>) -> BlocklistResult<Self>
    pub fn is_blocked(&self, content_hash: &[u8; 32]) -> bool
    pub fn get(&self, content_hash: &[u8; 32]) -> BlocklistResult<Option<BlocklistEntry>>
    pub fn add(&mut self, entry: BlocklistEntry) -> BlocklistResult<bool>
    pub fn add_or_update(&mut self, entry: BlocklistEntry) -> BlocklistResult<()>
    pub fn remove(&mut self, content_hash: &[u8; 32], timestamp: u64) -> BlocklistResult<bool>
    pub fn get_all(&self) -> BlocklistResult<Vec<BlocklistEntry>>
    pub fn get_all_hashes(&self) -> BlocklistResult<Vec<[u8; 32]>>
    pub fn get_since(&self, timestamp: u64) -> BlocklistResult<Vec<BlocklistEntry>>
    pub fn get_by_reason(&self, reason: BlocklistReason) -> BlocklistResult<Vec<BlocklistEntry>>
    pub fn count(&self) -> u32
    pub fn merkle_root(&self) -> [u8; 32]
    pub fn sync_state(&self) -> &SyncState
    pub fn flush(&self) -> BlocklistResult<()>
    pub fn stats(&self) -> BlocklistStats
}
```

**Storage trees**:
- `blocklist_entries` - Entry storage keyed by content hash
- `blocklist_meta` - Merkle root, entry count, last update timestamp

### MemoryBlocklistStore

In-memory storage for testing and lightweight use.

```rust
impl MemoryBlocklistStore {
    pub fn new() -> Self
    pub fn is_blocked(&self, content_hash: &[u8; 32]) -> bool
    pub fn get(&self, content_hash: &[u8; 32]) -> Option<&BlocklistEntry>
    pub fn add(&mut self, entry: BlocklistEntry) -> BlocklistResult<bool>
    pub fn add_or_update(&mut self, entry: BlocklistEntry)
    pub fn remove(&mut self, content_hash: &[u8; 32]) -> BlocklistResult<bool>
    pub fn get_all(&self) -> Vec<&BlocklistEntry>
    pub fn get_all_hashes(&self) -> Vec<[u8; 32]>
    pub fn count(&self) -> u32
    pub fn merkle_root(&self) -> [u8; 32]
}
```

### BlocklistGossip

Manages gossip protocol operations.

```rust
impl BlocklistGossip {
    pub fn new(local_node_id: [u8; 32]) -> Self

    pub fn process_attestation(
        &mut self,
        attestation: SpamAttestation,
        sponsor_tree_root: [u8; 32],
        current_time: u64,
    ) -> BlocklistResult<Option<BlocklistUpdate>>

    pub fn validate_update(
        &self,
        update: &BlocklistUpdate,
        current_time: u64,
    ) -> BlocklistResult<()>

    pub fn peers_to_forward(
        &mut self,
        content_hash: &[u8; 32],
        all_peers: &[[u8; 32]],
        sender_peer: Option<[u8; 32]>,
    ) -> Vec<[u8; 32]>

    pub fn mark_peer_seen(&mut self, content_hash: &[u8; 32], peer_id: [u8; 32])
    pub fn pending_count(&self, content_hash: &[u8; 32]) -> usize
    pub fn cleanup_pending(&mut self, current_time: u64, max_age_secs: u64)
    pub fn cleanup_seen(&mut self, max_entries: usize)
}
```

### Merkle Functions

```rust
pub fn compute_merkle_root(hashes: &[[u8; 32]]) -> [u8; 32]
pub fn compute_diff(local: &[[u8; 32]], remote: &[[u8; 32]]) -> (Vec<[u8; 32]>, Vec<[u8; 32]>)
pub fn build_proof(hashes: &[[u8; 32]], entry: &[u8; 32]) -> Option<MerkleProof>
```

### Message Parsing

```rust
pub fn parse_blocklist_message(msg_type: u8, payload: &[u8]) -> BlocklistResult<BlocklistMessage>
pub fn entry_from_update(update: &BlocklistUpdate) -> BlocklistEntry
```

## Behaviors

### Content Addition Flow

**Trigger**: Illegal content attestation submitted
**Process**:
1. `process_attestation()` receives `SpamAttestation` with `SpamReason::IllegalContent`
2. Validates attestation is for illegal content type
3. Checks for duplicate attester (Sybil resistance)
4. Adds to pending attestations for content hash
5. When 3 unique attesters reached:
   - Creates `BlocklistUpdate` with `Add` type
   - Clears pending attestations
   - Returns update for broadcast

**Outcome**: Content hash added to blocklist, propagated via gossip

### Update Validation

**Trigger**: Incoming `MSG_BLOCKLIST_UPDATE` (0x55)
**Process**:
1. Parse `BlocklistUpdate` from payload
2. Check timestamp freshness (< 24 hours old)
3. Verify attestation count >= 3
4. Verify all attestations are for `IllegalContent` reason
5. Verify attestation content hashes match update hash
6. (TODO: Signature verification)

**Outcome**: Valid updates accepted; invalid updates rejected

### Merkle Synchronization

**Trigger**: `MSG_BLOCKLIST_SYNC` (0x58) received
**Process**:
1. Parse `BlocklistSync` message
2. Compare received Merkle root with local root
3. If roots match: Already in sync
4. If roots differ:
   - Log mismatch
   - (Full implementation would request missing entries)

**Outcome**: Nodes converge to consistent blocklist state

### Content Rejection

**Trigger**: Content creation (POST, MEDIA, REPLY) or edit
**Process**:
1. Hash content using SHA-256
2. Check `blocklist.is_blocked(&content_hash)`
3. If blocked: Reject with error `"Content rejected: matches blocklist"`
4. If not blocked: Continue with creation

**Locations**:
- `src/rpc/methods.rs:1436-1449` - POST creation
- `src/rpc/methods.rs:1838-1850` - MEDIA upload
- `src/rpc/methods.rs:2002-2014` - REPLY creation
- `src/rpc/methods.rs:2507-2513` - Content editing

### Content Removal Flow

**Trigger**: Anchor-level counter-attestations
**Process**: (Documented but not fully implemented)
1. Receive 5 counter-attestations from Anchor-level swimmers
2. Verify all attesters have Level 4+ status
3. Create `BlocklistUpdate` with `Remove` type
4. Propagate via gossip
5. Nodes remove entry from local blocklist

**Outcome**: Content hash removed from blocklist

## Configuration Options

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ILLEGAL_CONTENT_ATTESTATION_THRESHOLD` | 3 | Attesters required to add content |
| `BLOCKLIST_REMOVAL_THRESHOLD` | 5 | Anchor counter-attestations to remove |
| `MIN_BLOCKLIST_CONFIRMATIONS` | 10 | Propagation confirmations for "confirmed" |
| `BLOCKLIST_SYNC_INTERVAL_SECS` | 3600 | Merkle sync interval (1 hour) |
| `BLOCKLIST_UPDATE_MAX_AGE_SECS` | 86400 | Max age for updates (24 hours) |

### Wire Protocol Messages

| Message | ID | Purpose |
|---------|-----|---------|
| `MSG_BLOCKLIST_UPDATE` | 0x55 | Add/remove hash from blocklist |
| `MSG_BLOCKLIST_SYNC` | 0x58 | Merkle root exchange |
| `MSG_BLOCKLIST_REQUEST` | 0x59 | Request specific entries |

### Storage Paths

| Path | Purpose |
|------|---------|
| `{data_dir}/blocklist/` | Sled database directory |
| `blocklist_entries` tree | Entry storage |
| `blocklist_meta` tree | Metadata (root, count, timestamp) |

## Integration Points

### Node Manager

**File**: `src/node/manager.rs:413-431`

```rust
let blocklist_path = self.config.data_dir.join("blocklist");
std::fs::create_dir_all(&blocklist_path).ok();
match sled::open(&blocklist_path) {
    Ok(blocklist_db) => {
        match BlocklistStore::open(Arc::new(blocklist_db)) {
            Ok(blocklist) => {
                self.blocklist = Some(Arc::new(blocklist));
            }
            // ...
        }
    }
    // ...
}
```

### Router Message Handlers

**File**: `src/node/router/router.rs:326-328`

```rust
MSG_BLOCKLIST_UPDATE => self.handle_blocklist_update(peer_id, payload).await,
MSG_BLOCKLIST_SYNC => self.handle_blocklist_sync(peer_id, payload).await,
MSG_BLOCKLIST_REQUEST => self.handle_blocklist_request(peer_id, payload).await,
```

### Router Content Rejection (Network Layer)

**File**: `src/node/router/router.rs:1002-1013`

```rust
// BLOCKLIST CHECK: Reject content that matches blocklist entries
// This prevents storing CSAM/illegal content even if received from network
if let Some(ref blocklist) = self.blocklist {
    if blocklist.is_blocked(&hash_bytes) {
        warn!(
            "[BLOCKLIST] Rejected DATA_CONTENT from {} - content {} matches blocklist",
            hex::encode(&peer_id[..8]),
            hex::encode(&hash_bytes[..8])
        );
        return Err(RouteError::InvalidData("content blocked".to_string()));
    }
}
```

### RPC Content Creation

**File**: `src/rpc/methods.rs:1436-1449`

```rust
// BLOCKLIST CHECK: Reject content that matches blocklist entries
if let Some(ref blocklist) = self.node.blocklist {
    if blocklist.is_blocked(&content_hash) {
        warn!("[BLOCKLIST] Rejected POST from {} - content matches blocklist", ...);
        return Err(RpcError::invalid_params("Content rejected: matches blocklist"));
    }
}
```

### Anti-Abuse Handler

**File**: `src/api/anti_abuse.rs:313-337`

```rust
pub fn is_blocklisted(&self, content_hash: &[u8; 32]) -> bool
pub fn get_blocklist_reason(&self, content_hash: &[u8; 32]) -> Option<BlocklistReason>
pub fn check_retrieval_allowed(&self, content_hash: &[u8; 32]) -> Result<(), AntiAbuseError>
```

### Events Emitted

```rust
AntiAbuseEvent::ContentBlocklisted {
    content_hash: [u8; 32],
    reason: BlocklistReason,
}
```

## Error Handling

### BlocklistError Variants

| Error | Description |
|-------|-------------|
| `AlreadyBlocked` | Content hash already in blocklist |
| `NotBlocked` | Content hash not in blocklist (on remove) |
| `InsufficientAttestations` | Less than 3 attestations provided |
| `NotIllegalContentAttestation` | Attestation reason is not `IllegalContent` |
| `AttesterLevelTooLow` | Attester doesn't meet level requirement |
| `InvalidSignature` | Signature verification failed |
| `InvalidUpdateMessage` | Malformed update message |
| `StorageError` | Sled database error |
| `MerkleVerificationFailed` | Proof doesn't verify against root |
| `UpdateTooOld` | Update timestamp > 24 hours old |
| `RemovalRequiresAnchor` | Removal needs Anchor-level attesters |
| `InsufficientCounterAttestations` | Less than 5 counter-attestations |
| `DuplicateSponsorTree` | Same sponsor tree already attested |
| `CannotVerifyAttester` | Missing sponsor information |

## Implementation Gaps

### Documented vs Implemented

| Feature | Documented | Implemented | Notes |
|---------|------------|-------------|-------|
| 3-attester threshold | Yes | Yes | Enforced in `process_attestation()` |
| 5-Anchor removal threshold | Yes | Partial | Error types exist, logic not wired |
| Merkle sync | Yes | Partial | Root comparison works, reconciliation incomplete |
| Content rejection on storage | Yes | Yes | All RPC methods check blocklist |
| Content rejection on retrieval | Yes | Partial | Via `AntiAbuseHandler.check_retrieval_allowed()` |
| Signature verification | Yes | TODO | Commented as needing crypto access |
| Independent sponsor tree verification | Yes | Simplified | Uses attester ID, not full tree verification |
| Gossip propagation | Yes | Partial | Router receives but doesn't fully forward |

### Critical: Wire Protocol Message ID Conflict

**Issue**: Message ID `0x55` is assigned to both `MSG_BLOCKLIST_UPDATE` and `MSG_FORKINFO`

**Locations**:
- `src/blocklist/gossip.rs:18`: `MSG_BLOCKLIST_UPDATE = 0x55`
- `src/types/constants.rs:441`: `MSG_FORKINFO = 0x55`

**Impact**: Potential message routing confusion when both fork and blocklist features are active.

**Resolution Needed**: Assign unique message ID to blocklist update (e.g., `0x85` which is unused).

### Constants Mismatch

The documentation states `MIN_BLOCKLIST_CONFIRMATIONS = 3` but the code has `MIN_BLOCKLIST_CONFIRMATIONS = 10`. The code value (10) appears to be the intended production setting.

### Router Storage Limitation

**Issue**: Router has `Arc<BlocklistStore>` but `BlocklistStore::add()` requires `&mut self`

**Current workaround** (`router.rs:4487-4490`):
```rust
// Note: BlocklistStore requires &mut self for add(), but we have Arc<BlocklistStore>.
// For now, we log the update and trust that the RPC layer will handle storage.
```

**Resolution Needed**: Wrap in `RwLock<BlocklistStore>` for concurrent mutable access.

### Missing Features

1. **Full gossip forwarding**: Router handlers log updates but don't forward to peers
2. **Removal flow**: Counter-attestation accumulation not implemented
3. **Signature verification**: Marked as TODO in `validate_update()`
4. **CLI commands**: No dedicated CLI for blocklist management
5. **Full Merkle reconciliation**: Sync identifies differences but doesn't request missing entries
6. **Data layer rejection**: Router checks blocklist at `handle_data_content` (line 1002-1013) but only logs, needs integration with content manager rejection

## Client-Side Note

The forum-client has a separate user-level blocklist feature (`useBlocklist.ts`, `BlocklistManager.tsx`, `BlockButton.tsx`) that is distinct from this protocol-level illegal content blocklist. The client-side feature allows users to personally block other users, while this protocol handles network-wide blocking of illegal content.

## Dependencies

### Internal Modules

| Module | Usage |
|--------|-------|
| `crate::spam_attestation::SpamAttestation` | Attestation structure |
| `crate::spam_attestation::SpamReason::IllegalContent` | Illegal content flag trigger |
| `crate::crypto::sha256` | Content hashing |
| `crate::level::SwimmerLevel` | Level verification for removal threshold |

### External Crates

| Crate | Usage |
|-------|-------|
| `sled` | Persistent key-value storage |
| `bincode` | Serialization for storage |
| `blake3` | Merkle tree hashing (domain: "BLOCKLIST_MERKLE_NODE") |
| `serde` / `serde_big_array` | Serialization for network |

## Quality Checklist Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| 3-attester threshold enforced | Partial | Checked in `validate_update()`, simplified Sybil check |
| Independent sponsor tree verification | Not Implemented | Uses attester ID check, not sponsor tree |
| Merkle sync achieves consistency | Partial | Sync messages defined, handlers log but don't fully sync |
| Content rejection on storage | Implemented | Router line 1002-1013, RPC methods |
| Content rejection on retrieval | Implemented | RPC methods check before serving |

## Related Documentation

- [SPEC_12 Anti-Abuse](../../specs/SPEC_12_ANTI_ABUSE.md) - Full specification
- Section 9 (Spam & Reputation) - Related attestation system
- Section 8 (Sponsorship) - Sponsor tree for attester verification
- Section 6 (Network & Transport) - Gossip protocol
- Section 11 (Engagement) - Anchor level for removal threshold

## Test Coverage

### Unit Tests

**File**: `src/blocklist/types.rs` (lines 422-586)
- BlocklistReason roundtrip serialization
- BlocklistEntry creation and confirmation
- BlocklistUpdate serialization
- BlocklistSync serialization
- BlocklistRequest serialization
- Constants verification

**File**: `src/blocklist/storage.rs` (lines 407-581)
- Memory store add/get/remove operations
- Memory store Merkle root updates
- Persistent store operations
- Store statistics

**File**: `src/blocklist/gossip.rs` (lines 294-556)
- Single attestation processing
- Threshold attestation triggering
- Non-illegal attestation rejection
- Duplicate attester rejection
- Update validation (valid, too old, insufficient attestations)
- Peer forwarding logic
- Message parsing
- Pending cleanup

**File**: `src/blocklist/merkle.rs` (lines 264-417)
- Empty/single/multiple entry Merkle roots
- Deterministic ordering
- Diff computation
- Proof building and verification
- Sync state management

**File**: `src/api/anti_abuse.rs` (lines 616-708)
- Blocklist check integration
- Metrics tracking

### Running Tests

```bash
# Run all blocklist tests
cargo test blocklist --lib

# Run specific test files
cargo test --lib blocklist::types::tests
cargo test --lib blocklist::storage::tests
cargo test --lib blocklist::gossip::tests
cargo test --lib blocklist::merkle::tests

# Run anti-abuse integration tests
cargo test anti_abuse::tests::test_blocklist_check
```

## RPC Methods

**Note**: Dedicated blocklist RPC methods are not yet implemented. Current functionality is integrated into content creation methods.

### Planned Methods (Not Implemented)

| Method | Purpose | Parameters |
|--------|---------|------------|
| `blocklist_check` | Check if content hash is blocked | `{"hash": "hex_string"}` |
| `blocklist_list` | List all blocked hashes | `{"reason": "CSAM\|Terrorism\|ExternalList", "limit": 100}` |
| `blocklist_stats` | Get blocklist statistics | None |
| `blocklist_report` | Report illegal content | `{"hash": "hex_string", "reason": "CSAM"}` |

### Current Integration

Content creation methods automatically reject blocklisted content:

```json
// Error response when blocked content is submitted
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Content rejected: matches blocklist"
  },
  "id": 1
}
```

## CLI Commands

**Note**: No dedicated CLI commands for blocklist management are currently implemented.

### Planned Commands (Not Implemented)

```bash
# Check if content is blocked
cs blocklist check <content_hash>

# List all blocked content
cs blocklist list [--reason CSAM|Terrorism|ExternalList]

# Show blocklist statistics
cs blocklist stats

# Manually add entry (admin only)
cs blocklist add <content_hash> --reason CSAM --attestations <file>

# Export blocklist for external use
cs blocklist export --format json > blocklist.json
```

## Known Limitations

### Critical Issues

1. **Wire Protocol Conflict**: `MSG_BLOCKLIST_UPDATE` (0x55) conflicts with `MSG_FORKINFO` (0x55)
   - Both defined in codebase with same message ID
   - Can cause message routing confusion
   - **Workaround**: Messages currently handled by separate code paths
   - **Fix needed**: Reassign blocklist messages to unused range (e.g., 0x85-0x87)

2. **Router Cannot Store Updates**: `Arc<BlocklistStore>` cannot call `&mut self` methods
   - Router validates but doesn't persist updates
   - Storage happens via RPC layer only
   - **Fix needed**: Wrap in `RwLock<BlocklistStore>`

### Partial Implementations

3. **Simplified Sybil Resistance**: Uses attester ID check instead of full sponsor tree verification
   - Current: `existing.attester == attestation.attester`
   - Should: Verify attesters from independent sponsor trees

4. **Incomplete Removal Flow**: Threshold constants exist but verification not wired
   - `BLOCKLIST_REMOVAL_THRESHOLD = 5` defined
   - `RemovalRequiresAnchor` error exists
   - Anchor-level verification not connected

5. **Missing Gossip Forwarding**: Router logs but doesn't forward updates to peers
   - `handle_blocklist_update()` validates and logs
   - Does not propagate to connected peers

6. **Signature Verification TODO**: Update validation doesn't verify signatures
   - Marked as needing crypto access
   - Currently trusts message integrity

## Future Work

### High Priority

1. **Resolve Wire Protocol Conflict**
   - Assign unique message IDs to blocklist messages
   - Update: `0x85 MSG_BLOCKLIST_UPDATE`, `0x86 MSG_BLOCKLIST_SYNC`, `0x87 MSG_BLOCKLIST_REQUEST`
   - Update all documentation and router handlers

2. **Implement Full Gossip Forwarding**
   - Forward validated updates to peers who haven't seen them
   - Use `BlocklistGossip::peers_to_forward()` to determine recipients
   - Track propagation confirmations

3. **Complete Removal Flow**
   - Implement counter-attestation collection
   - Verify attesters have Anchor level (Level 4+)
   - Wire verification into `remove()` path

### Medium Priority

4. **Add RwLock Wrapper for Storage**
   - Change router from `Arc<BlocklistStore>` to `Arc<RwLock<BlocklistStore>>`
   - Enable concurrent mutable access

5. **Implement CLI Commands**
   - Add `cs blocklist` command group
   - Support check, list, stats, export operations

6. **Implement RPC Methods**
   - Add dedicated blocklist query endpoints
   - Support reporting interface

### Low Priority

7. **Full Sponsor Tree Verification**
   - Integrate with sponsor tree lookup
   - Verify attesters from independent trees

8. **Signature Verification**
   - Implement Ed25519 verification in `validate_update()`
   - Add cryptographic proof of update origin

9. **Full Merkle Reconciliation**
   - When sync detects differences, request missing entries
   - Handle response with actual entry transfer

10. **External Database Integration**
    - Import hashes from NCMEC or similar databases
    - Use `ExternalList` reason for external sources

## Related Features

- **[Spam & Reputation](./spam-reputation_FEATURE_DOC.md)** - `SpamAttestation` with `IllegalContent` reason triggers blocklist
- **[Sponsorship & Sybil Resistance](./sponsorship-sybil-resistance_FEATURE_DOC.md)** - Sponsor tree for independent attester verification
- **[Network & Transport](./network-transport_FEATURE_DOC.md)** - Gossip protocol for update propagation
- **[Storage Layer](./storage-layer_FEATURE_DOC.md)** - Sled persistence for blocklist entries
- **[Engagement & Social](./engagement-social_FEATURE_DOC.md)** - Anchor level (Level 4+) for removal threshold
