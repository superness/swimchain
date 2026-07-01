# Synchronization - Feature Documentation

**Owner Area**: `src/sync/`
**Spec Reference**: SPEC_06 Section 4.4, Section 4.5 (Milestone 2.4)
**Last Updated**: 2026-01-11

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Structures](#data-structures)
4. [Core APIs](#core-apis)
5. [Behaviors](#behaviors)
6. [Configuration](#configuration)
7. [Wire Protocol Messages](#wire-protocol-messages)
8. [RPC Methods](#rpc-methods)
9. [CLI Commands](#cli-commands)
10. [Error Handling](#error-handling)
11. [Testing](#testing)
12. [Known Limitations](#known-limitations)
13. [Future Work](#future-work)
14. [Related Features](#related-features)

---

## Overview

The Synchronization system implements header-first chain synchronization for the Swimchain network. It enables nodes to efficiently catch up with the network, validate incoming data, detect forks, and maintain continuous synchronization with peers.

Key design principles:
- **Header-first sync**: Download and verify headers before fetching full blocks, saving bandwidth
- **Decay-aware downloads**: Only download block content for non-decayed data (within `DECAY_FLOOR_SECS`)
- **Fork detection**: Identify chain forks and switch to the highest-work chain
- **Progress tracking**: Emit events for UX progress indicators
- **Request validation**: Prevent unsolicited data attacks via request tracking (V-SYNC-06)
- **Branch-selective sync**: Subscribe to specific branches to stay within storage budgets
- **Adaptive priority queue**: FIFO under normal load, priority ordering under congestion

---

## Architecture

```
+------------------+     +-------------------+     +------------------+
|   ChainSyncer    |---->|  ProgressTracker  |---->|  UI/Listeners    |
|  (Facade API)    |     |  (Event Broadcast)|     |                  |
+--------+---------+     +-------------------+     +------------------+
         |
         v
+--------+---------+     +-------------------+
|  Initial Sync    |---->|  Header Sync      |
|  (Coordinator)   |     |  (V-SYNC-01/02/03)|
+--------+---------+     +-------------------+
         |
         v
+--------+---------+     +-------------------+
| Continuous Sync  |---->|  Block Download   |
|  (Background)    |     |  (V-SYNC-04/05)   |
+--------+---------+     +-------------------+
         |
         v
+--------+---------+     +-------------------+
|  Fork Detection  |---->|  Request Tracker  |
|  (Chain Compare) |     |  (V-SYNC-06)      |
+--------+---------+     +-------------------+
         |
         v
+--------+---------+     +-------------------+
| Priority Queue   |---->|  Branch Manager   |
| (Congestion Ctrl)|     |  (LRU/Storage)    |
+------------------+     +-------------------+
```

### Module Structure

| File | Purpose |
|------|---------|
| `sync/mod.rs` | Module exports and `SyncPeerConnection` trait |
| `sync/syncer.rs` | `ChainSyncer` facade API |
| `sync/state.rs` | `SyncState` enum |
| `sync/config.rs` | `SyncConfig` parameters |
| `sync/initial_sync.rs` | Initial sync coordinator |
| `sync/continuous.rs` | Background sync loop |
| `sync/header_sync.rs` | Header verification (V-SYNC-01/02/03) |
| `sync/block_download.rs` | Block validation (V-SYNC-04/05) |
| `sync/fork_detect.rs` | Fork detection and resolution |
| `sync/chain_status.rs` | Chain status utilities |
| `sync/progress.rs` | Progress events and tracking |
| `sync/request_tracker.rs` | Request correlation (V-SYNC-06) |
| `sync/priority_queue.rs` | Adaptive priority queue |
| `sync/subscription.rs` | Branch subscription management |
| `sync/error.rs` | Error types |

---

## Data Structures

### SyncState

Tracks the current synchronization state.

```rust
pub enum SyncState {
    Idle,
    SyncingHeaders { current: u64, target: u64 },
    SyncingBlocks { current: u64, target: u64 },
    Continuous,
    Error,
}
```

| Variant | Description |
|---------|-------------|
| `Idle` | Not currently syncing |
| `SyncingHeaders` | Downloading and verifying headers |
| `SyncingBlocks` | Downloading block content |
| `Continuous` | Running background sync loop |
| `Error` | Sync encountered an error |

**Methods**:
| Method | Returns | Description |
|--------|---------|-------------|
| `is_syncing()` | `bool` | True if in `SyncingHeaders` or `SyncingBlocks` |
| `is_continuous()` | `bool` | True if in `Continuous` state |
| `is_idle()` | `bool` | True if in `Idle` state |
| `is_error()` | `bool` | True if in `Error` state |
| `progress()` | `Option<f64>` | Progress percentage (0-100) if syncing |

**Location**: `src/sync/state.rs:6-99`

---

### SyncConfig

Configuration parameters for synchronization.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sync_interval_secs` | `u64` | 30 | Sync check interval (SPEC_06 Section 4.5) |
| `block_request_timeout_ms` | `u64` | 10,000 | Block request timeout |
| `header_batch_size` | `u16` | 2,000 | Max headers per request |
| `query_peer_count` | `usize` | 8 | Peers to query for chain status |
| `parallel_downloads` | `usize` | 1 | Parallel block download count |
| `max_retries_per_peer` | `u32` | 3 | Max retries before switching peer |
| `verify_merkle_roots` | `bool` | true | Verify merkle roots during sync |
| `verify_pow` | `bool` | true | Verify PoW during sync |

**Location**: `src/sync/config.rs:8-33`

#### Configuration Presets

| Preset | Use Case | Details |
|--------|----------|---------|
| `SyncConfig::default()` | Production | 30s interval, 1 parallel download |
| `SyncConfig::fast()` | Testing | 5s interval, 4 parallel downloads |
| `SyncConfig::no_validation()` | Benchmarking only | Skips merkle/PoW verification |

---

### ChainSyncer

Main synchronization manager providing the unified public API.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `SyncConfig` | Sync configuration |
| `state` | `Arc<RwLock<SyncState>>` | Current sync state |
| `request_tracker` | `Arc<RequestTracker>` | V-SYNC-06 request correlation |
| `shutdown_tx` | `watch::Sender<bool>` | Shutdown signal sender |
| `shutdown_rx` | `watch::Receiver<bool>` | Shutdown signal receiver |
| `progress_sender` | `broadcast::Sender<SyncProgressEvent>` | Progress event broadcaster |

**Location**: `src/sync/syncer.rs:40-53`

---

### SyncProgress

Snapshot of current sync progress.

| Field | Type | Description |
|-------|------|-------------|
| `phase` | `SyncPhase` | Current sync phase |
| `current` | `u64` | Current progress (e.g., height) |
| `total` | `u64` | Target total |
| `bytes_downloaded` | `u64` | Bytes downloaded so far |
| `elapsed_secs` | `f64` | Elapsed time in seconds |

**Methods**:
| Method | Returns | Description |
|--------|---------|-------------|
| `percentage()` | `f64` | Progress percentage (0-100) |
| `download_rate()` | `f64` | Bytes per second |
| `eta_secs()` | `Option<f64>` | Estimated remaining time |

**Location**: `src/sync/progress.rs:35-95`

---

### SyncPhase

```rust
pub enum SyncPhase {
    QueryingPeers,       // Querying peers for chain status
    DownloadingHeaders,  // Downloading block headers
    VerifyingHeaders,    // Verifying downloaded headers
    DownloadingBlocks,   // Downloading block content
    Complete,            // Sync complete
}
```

**Location**: `src/sync/progress.rs:8-20`

---

### SyncProgressEvent

Events emitted during synchronization.

```rust
pub enum SyncProgressEvent {
    Started,
    PhaseChanged(SyncPhase),
    Progress(SyncProgress),
    PeerFound { peer_count: usize },
    HeadersReceived { count: u64, total: u64 },
    BlockReceived { height: u64 },
    Error(String),
    Complete { blocks_synced: u64, duration_secs: f64 },
}
```

**Location**: `src/sync/progress.rs:98-132`

---

### SyncStats

Statistics from a completed sync operation.

| Field | Type | Description |
|-------|------|-------------|
| `headers_synced` | `u64` | Number of headers synced |
| `blocks_synced` | `u64` | Number of blocks synced (with content) |
| `bytes_downloaded` | `u64` | Total bytes downloaded |
| `duration_secs` | `f64` | Total sync duration |

**Location**: `src/sync/initial_sync.rs:17-27`

---

### ForkType

Describes the relationship between local and remote chains.

```rust
pub enum ForkType {
    SameChain,
    ExtensionNeeded { missing_from: u64, to: u64 },
    ForkDetected { fork_height: u64 },
    LocalAhead,
}
```

| Variant | Description |
|---------|-------------|
| `SameChain` | Tips match - chains are identical |
| `ExtensionNeeded` | Remote is ahead - need to extend |
| `ForkDetected` | Chains have diverged at `fork_height` |
| `LocalAhead` | Local has more cumulative work |

**Location**: `src/sync/fork_detect.rs:14-32`

---

### SyncError

Error types for synchronization with validation rule mapping.

| Error Variant | Validation Rule | Description |
|--------------|-----------------|-------------|
| `InvalidChainLinkage` | V-SYNC-01 | `prev_hash` mismatch |
| `InsufficientPoW` | V-SYNC-02 | PoW below difficulty target |
| `NonMonotonicTimestamp` | V-SYNC-03 | Timestamp not increasing |
| `InvalidMerkleRoot` | V-SYNC-04 | Merkle root mismatch |
| `BlockOutOfRange` | V-SYNC-05 | Block outside requested range |
| `UnregisteredRequest` | V-SYNC-06 | Response without matching request |
| `NoPeersAvailable` | - | No peers available |
| `PeerTimeout` | - | Peer connection timed out |
| `Storage` | - | Storage operation failed |
| `Cancelled` | - | Sync was cancelled |
| `InvalidGenesis` | - | Invalid genesis block |
| `InvalidPeerData` | - | Peer sent invalid data |

**Location**: `src/sync/error.rs:8-108`

---

### RequestTracker

Tracks pending sync requests for V-SYNC-06 validation.

| Field | Type | Description |
|-------|------|-------------|
| `next_id` | `AtomicU64` | Next request ID |
| `pending` | `RwLock<HashMap<RequestKey, PendingRequest>>` | Pending requests |

**Location**: `src/sync/request_tracker.rs:32-37`

---

### PendingRequest

A pending sync request.

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | `u64` | Unique request ID |
| `peer_id` | `[u8; 32]` | Target peer ID |
| `start_height` | `u64` | Start height |
| `end_height` | `u64` | End height |
| `created_at` | `Instant` | Creation time |

**Location**: `src/sync/request_tracker.rs:12-23`

---

### Priority

Priority levels for sync requests.

```rust
pub enum Priority {
    Normal,
    AboveNormal,
    High,
    Highest,
}
```

**Location**: `src/sync/priority_queue.rs:13-23`

---

### SyncPriorityQueue<T>

Adaptive priority queue that uses FIFO under light load and switches to priority ordering under congestion.

| Field | Type | Description |
|-------|------|-------------|
| `heap` | `BinaryHeap<Reverse<PrioritizedRequest<T>>>` | Priority heap |
| `fallback` | `VecDeque<T>` | FIFO queue for light load |
| `next_sequence` | `u64` | Sequence counter for FIFO within priority |
| `use_priority` | `bool` | Whether priority mode is active |

**Location**: `src/sync/priority_queue.rs:93-102`

---

### BranchSubscriptionManager

Manages branch subscriptions with storage budget enforcement.

| Field | Type | Description |
|-------|------|-------------|
| `subscriptions` | `HashMap<[u8;32], HashMap<Vec<u8>, SubscriptionEntry>>` | Active subscriptions |
| `subscription_set` | `HashSet<([u8;32], Vec<u8>)>` | Quick lookup set |
| `max_storage_bytes` | `u64` | Storage budget |
| `current_storage_bytes` | `u64` | Current usage |
| `subscription_count` | `usize` | Total subscriptions |

**Location**: `src/sync/subscription.rs:96-111`

---

### SubscriptionEntry

Metadata for a branch subscription.

| Field | Type | Description |
|-------|------|-------------|
| `space_id` | `[u8; 32]` | Space identifier |
| `branch_path` | `BranchPath` | Branch path |
| `subscribed_at` | `u64` | Subscription timestamp |
| `last_access` | `u64` | Last access time (for LRU) |
| `storage_bytes` | `u64` | Storage usage |
| `last_synced_height` | `u64` | Last synced height |
| `content_count` | `u32` | Content item count |

**Location**: `src/sync/subscription.rs:44-59`

---

## Core APIs

### ChainSyncer

#### new()

**Signature**: `pub fn new(config: SyncConfig) -> Self`

**Purpose**: Create a new chain syncer with the given configuration.

**Example**:
```rust
use swimchain::sync::{ChainSyncer, SyncConfig};

let syncer = ChainSyncer::new(SyncConfig::default());
```

---

#### state()

**Signature**: `pub fn state(&self) -> SyncState`

**Purpose**: Get the current sync state.

**Returns**: Copy of current `SyncState`.

---

#### subscribe_progress()

**Signature**: `pub fn subscribe_progress(&self) -> broadcast::Receiver<SyncProgressEvent>`

**Purpose**: Subscribe to progress events for UI updates.

**Example**:
```rust
let mut rx = syncer.subscribe_progress();
while let Ok(event) = rx.recv().await {
    match event {
        SyncProgressEvent::Progress(p) => println!("{}%", p.percentage()),
        SyncProgressEvent::Complete { blocks_synced, .. } => break,
        _ => {}
    }
}
```

---

#### start_initial_sync()

**Signature**:
```rust
pub async fn start_initial_sync<P: SyncPeerConnection>(
    &self,
    fork_id: [u8; 32],
    peers: &[Arc<P>],
    store: &ChainStore,
) -> Result<SyncStats, SyncError>
```

**Purpose**: Perform full initial chain synchronization from peers.

**Parameters**:
- `fork_id`: Fork identifier for this chain
- `peers`: List of peer connections to sync from
- `store`: Chain storage backend

**Returns**: `SyncStats` with sync metrics on success.

**Location**: `src/sync/syncer.rs:145-175`

---

#### start_continuous_sync()

**Signature**:
```rust
pub fn start_continuous_sync<P: SyncPeerConnection + 'static>(
    &self,
    fork_id: [u8; 32],
    store: Arc<ChainStore>,
    peers: Arc<Vec<Arc<P>>>,
) -> JoinHandle<Result<(), SyncError>>
```

**Purpose**: Start background sync loop that periodically checks for new blocks.

**Returns**: `JoinHandle` for the background task.

**Location**: `src/sync/syncer.rs:190-206`

---

#### stop()

**Signature**: `pub fn stop(&self)`

**Purpose**: Stop all sync operations.

**Location**: `src/sync/syncer.rs:209-212`

---

#### reset()

**Signature**: `pub fn reset(&self)`

**Purpose**: Reset syncer state (for testing).

**Location**: `src/sync/syncer.rs:215-218`

---

### Header Sync Functions

#### verify_header_chain()

**Signature**: `pub fn verify_header_chain(headers: &[RootBlock]) -> Result<(), SyncError>`

**Purpose**: Verify a chain of headers against V-SYNC-01, V-SYNC-02, V-SYNC-03.

**Validates**:
- V-SYNC-01: Chain linkage (`prev_root_hash` matches predecessor)
- V-SYNC-02: PoW meets difficulty (`total_pow >= difficulty_target`)
- V-SYNC-03: Timestamps monotonically increasing

**Location**: `src/sync/header_sync.rs:21-39`

---

#### verify_single_header()

**Signature**: `pub fn verify_single_header(header: &RootBlock, prev: &RootBlock) -> Result<(), SyncError>`

**Purpose**: Verify a single header against its predecessor.

**Location**: `src/sync/header_sync.rs:46-77`

---

#### verify_headers_connect()

**Signature**: `pub fn verify_headers_connect(headers: &[RootBlock], local_tip_hash: [u8; 32]) -> Result<(), SyncError>`

**Purpose**: Verify headers connect to our local chain tip.

**Location**: `src/sync/header_sync.rs:101-118`

---

#### verify_height_sequence()

**Signature**: `pub fn verify_height_sequence(headers: &[RootBlock]) -> Result<(), SyncError>`

**Purpose**: Verify height sequence is consecutive.

**Location**: `src/sync/header_sync.rs:121-134`

---

### Block Download Functions

#### identify_relevant_blocks()

**Signature**: `pub fn identify_relevant_blocks(headers: &[RootBlock], current_time: u64) -> Vec<u64>`

**Purpose**: Identify blocks with non-decayed content (need to download).

Filters blocks where `timestamp > (current_time - DECAY_FLOOR_SECS)`.

**Location**: `src/sync/block_download.rs:15-23`

---

#### validate_block_content()

**Signature**: `pub fn validate_block_content(root: &RootBlock, space_blocks: &[SpaceBlock]) -> Result<(), SyncError>`

**Purpose**: Validate block content matches header claims (V-SYNC-04).

**Location**: `src/sync/block_download.rs:34-58`

---

#### validate_block_range()

**Signature**: `pub fn validate_block_range(blocks: &[RootBlock], start: u64, end: u64) -> Result<(), SyncError>`

**Purpose**: Validate all blocks are within requested range (V-SYNC-05).

**Location**: `src/sync/block_download.rs:65-76`

---

### Fork Detection Functions

#### detect_fork()

**Signature**: `pub fn detect_fork(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> ForkType`

**Purpose**: Detect fork relationship between local and remote chain.

**Location**: `src/sync/fork_detect.rs:57-80`

---

#### find_common_ancestor()

**Signature**: `pub fn find_common_ancestor(store: &ChainStore, remote_headers: &[RootBlock]) -> Result<Option<u64>, SyncError>`

**Purpose**: Find common ancestor using binary search.

**Returns**: Highest height where local and remote hashes match.

**Location**: `src/sync/fork_detect.rs:90-150`

---

#### should_switch_chain()

**Signature**: `pub fn should_switch_chain(local: &ChainStatusPayload, remote: &ChainStatusPayload) -> bool`

**Purpose**: Determine if we should switch to remote chain (has more work).

**Location**: `src/sync/fork_detect.rs:153-156`

---

### Request Tracker Functions

#### register_request()

**Signature**: `pub fn register_request(&self, peer_id: [u8; 32], start: u64, end: u64) -> u64`

**Purpose**: Register a new request for V-SYNC-06 validation.

**Returns**: Request ID for tracking.

**Location**: `src/sync/request_tracker.rs:52-67`

---

#### validate_response()

**Signature**: `pub fn validate_response(&self, peer_id: [u8; 32], start: u64, end: u64) -> Option<u64>`

**Purpose**: Validate that a response matches a registered request.

**Returns**: Request ID if valid, `None` if unregistered (V-SYNC-06 violation).

**Location**: `src/sync/request_tracker.rs:73-77`

---

#### cleanup_stale()

**Signature**: `pub fn cleanup_stale(&self, timeout: Duration) -> usize`

**Purpose**: Remove requests older than the timeout.

**Returns**: Number of stale requests removed.

**Location**: `src/sync/request_tracker.rs:96-101`

---

### Branch Subscription Functions

#### subscribe()

**Signature**: `pub fn subscribe(&mut self, space_id: [u8; 32], branch_path: BranchPath) -> bool`

**Purpose**: Subscribe to a branch for selective sync.

**Returns**: `true` if added, `false` if already subscribed or at limit.

**Location**: `src/sync/subscription.rs:135-164`

---

#### make_room()

**Signature**: `pub fn make_room(&mut self, needed_bytes: u64) -> Vec<BranchId>`

**Purpose**: Make room by unsubscribing LRU branches.

**Returns**: List of unsubscribed branches.

**Location**: `src/sync/subscription.rs:333-366`

---

#### serialize() / deserialize()

**Purpose**: Persist/restore subscription state.

**Location**: `src/sync/subscription.rs:392-483`

---

## Behaviors

### Initial Sync Flow

When a new node joins the network:

```
[New Node]                    [Best Peer]
    |                              |
    |------ ChainStatus Request -->|
    |<----- ChainStatus Response --|
    |                              |
    |------ GetHeaders (0-2000) -->|
    |<----- Headers Response ------|
    |                              |
    |  [Verify V-SYNC-01/02/03]    |
    |                              |
    |------ GetBlocks (relevant) ->|
    |<----- Blocks Response -------|
    |                              |
    |  [Store to ChainStore]       |
```

1. **Query Peers**: Request chain status from up to `query_peer_count` peers
2. **Select Best**: Choose peer with highest cumulative work
3. **Download Headers**: Fetch headers in batches of `header_batch_size`
4. **Verify Headers**: Apply V-SYNC-01/02/03 validation rules
5. **Identify Relevant**: Filter blocks within decay window
6. **Download Blocks**: Fetch block content for relevant heights only
7. **Store**: Save blocks and headers to ChainStore

---

### Continuous Sync Flow

After initial sync completes:

1. **Wait**: Sleep for `sync_interval_secs`
2. **Build Status**: Calculate local chain status
3. **Query Peers**: Request status from random peers
4. **Compare Work**: Find peers with more cumulative work
5. **Sync Delta**: Request missing blocks from best peer
6. **Repeat**: Loop until shutdown signal

---

### Fork Resolution

When chains diverge:

1. **Detect**: Compare chain tips and cumulative work
2. **Classify**: Determine `ForkType` (Extension, Fork, LocalAhead)
3. **Find Ancestor**: Binary search for common ancestor
4. **Decide**: Switch if remote has more work
5. **Reorg**: Re-sync from common ancestor

---

### Priority Queue Activation

Under normal load (< 50 pending requests):
- Requests processed in FIFO order
- Priority values ignored

Under congestion (>= 50 pending requests):
- All requests migrated to priority heap
- Higher priority processed first
- FIFO maintained within same priority

---

### LRU Branch Eviction

When storage budget exceeded:

1. **Sort**: Order subscriptions by `last_access` (oldest first)
2. **Unsubscribe**: Remove oldest branches until below budget
3. **Notify**: Return list of evicted branches

---

## Configuration

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sync_interval_secs` | `u64` | 30 | Continuous sync check interval |
| `block_request_timeout_ms` | `u64` | 10,000 | Request timeout |
| `header_batch_size` | `u16` | 2,000 | Max headers per batch |
| `query_peer_count` | `usize` | 8 | Peers to query |
| `parallel_downloads` | `usize` | 1 | Parallel downloads |
| `max_retries_per_peer` | `u32` | 3 | Retries before switching peer |
| `verify_merkle_roots` | `bool` | true | Enable merkle verification |
| `verify_pow` | `bool` | true | Enable PoW verification |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PRIORITY_QUEUE_ACTIVATION_THRESHOLD` | 50 | When to enable priority ordering |
| `SYNC_INTERVAL_SECS` | 30 | Default sync check interval |
| `BLOCK_REQUEST_TIMEOUT_MS` | 10,000 | Default block request timeout |
| `MAX_HEADERS_PER_MESSAGE` | 2,000 | Max headers per wire message |
| `SYNC_QUERY_PEER_COUNT` | 8 | Default peers to query |
| `DECAY_FLOOR_SECS` | 172,800 | Content decay threshold (48 hours) |

---

## Wire Protocol Messages

### Chain Status

| Message | Payload Type | Purpose |
|---------|--------------|---------|
| `CHAINSTATUS` | `ChainStatusPayload` | Announce chain status |

### Block Sync

| Message | Payload Type | Purpose |
|---------|--------------|---------|
| `GETBLOCKS` | `GetBlocksPayload` | Request blocks by range |
| `GETBLOCKS_LOCATOR` | `GetBlocksLocatorPayload` | Bitcoin-style locator |
| `BLOCKS` | `BlocksPayload` | Response with blocks |
| `BLOCK_ANNOUNCE` | `BlockAnnouncePayload` | New block announcement |
| `GET_BLOCK` | `GetBlockPayload` | Request single block |
| `BLOCK_DATA` | `BlockDataPayload` | Single block response |

### Header Sync

| Message | Payload Type | Purpose |
|---------|--------------|---------|
| `GETHEADERS` | `GetHeadersPayload` | Request headers by range |
| `GETHEADERS_LOCATOR` | `GetHeadersLocatorPayload` | Headers-first locator |
| `HEADERS` | `HeadersPayload` | Response with headers |

### Branch Sync

| Message | Payload Type | Purpose |
|---------|--------------|---------|
| `GETBLOCKS_BRANCH` | `GetBlocksBranchPayload` | Request branch blocks |
| `SUBSCRIBE_BRANCH` | `SubscribeBranchPayload` | Subscribe to branch |
| `UNSUBSCRIBE_BRANCH` | `UnsubscribeBranchPayload` | Unsubscribe from branch |
| `BRANCH_ANNOUNCE` | `BranchAnnouncePayload` | New branch content |
| `BRANCH_INVENTORY` | `BranchInventoryPayload` | Served branches |

### Mempool Sync

| Message | Payload Type | Purpose |
|---------|--------------|---------|
| `GETMEMPOOL` | `GetMempoolPayload` | Request mempool |
| `ACTION_ANNOUNCE` | `ActionAnnouncePayload` | Pending action |
| `INV` (type=0x04) | `InvPayload` | Action inventory |

---

## RPC Methods

### sync_status

**Request**:
```json
{"jsonrpc": "2.0", "method": "sync_status", "id": 1}
```

**Response**:
```json
{
  "result": {
    "state": "SyncingBlocks",
    "current": 5000,
    "target": 10000,
    "progress_percent": 50.0
  }
}
```

### chain_status

**Request**:
```json
{"jsonrpc": "2.0", "method": "chain_status", "id": 1}
```

**Response**:
```json
{
  "result": {
    "height": 10000,
    "tip_hash": "abc123...",
    "cumulative_work": 50000000,
    "pending_content_count": 42
  }
}
```

---

## CLI Commands

### cs sync status

```bash
cs sync status
```

Shows current sync state, progress percentage, and ETA.

### cs sync start

```bash
cs sync start [--peers <count>]
```

Manually trigger a sync check.

### cs sync stop

```bash
cs sync stop
```

Stop continuous sync loop.

### cs chain status

```bash
cs chain status
```

Display local chain status (height, tip hash, cumulative work).

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `InvalidChainLinkage` | prev_hash doesn't match predecessor | Request from different peer |
| `InsufficientPoW` | PoW below difficulty target | Reject block, consider banning peer |
| `NonMonotonicTimestamp` | Timestamp not increasing | Reject block, consider banning peer |
| `InvalidMerkleRoot` | Merkle root mismatch | Reject block, request retry |
| `BlockOutOfRange` | Block height outside request | Log warning, ignore block |
| `UnregisteredRequest` | Unsolicited response | Drop data, consider banning peer |
| `NoPeersAvailable` | No peers to sync from | Wait and retry |
| `PeerTimeout` | Request timed out | Try different peer |
| `Storage` | Database error | Check storage health |
| `Cancelled` | Shutdown requested | Normal termination |

---

## Testing

### Unit Tests

```bash
# Run all sync module tests
cargo test sync::

# Run specific test file
cargo test sync::header_sync::tests

# Run specific test
cargo test sync::header_sync::tests::test_valid_header_chain
```

### Integration Tests

```bash
# Run sync integration tests
cargo test --test sync_integration

# Test with multiple nodes
./scripts/test-two-node-sync.sh
```

### Manual Testing

```bash
# Start a local testnet
./scripts/start-test-nodes.sh

# Monitor sync progress on node
cs --node localhost:9001 sync status

# Trigger manual sync
cs --node localhost:9001 sync start
```

---

## Known Limitations

1. **Cumulative work calculation is O(n)**: The `calculate_cumulative_work()` function iterates all blocks. For production, this should be cached and updated incrementally.

2. **No checkpoint resume**: Sync restarts from beginning if interrupted during initial sync. Continuous sync handles reconnection but initial sync does not checkpoint progress.

3. **Sequential block downloads**: Default `parallel_downloads=1` for safety. Can be increased but may cause ordering issues.

4. **Priority queue memory**: Under congestion, all pending requests are held in memory. No disk spillover for very large queues.

5. **LRU eviction is synchronous**: `make_room()` blocks while evicting branches. Large evictions may cause delays.

---

## Future Work

1. **Checkpoint persistence**: Save sync progress to disk for resume after restart
2. **Cached cumulative work**: Store and update incrementally instead of O(n) calculation
3. **Parallel header verification**: Verify headers in parallel on multi-core systems
4. **Priority queue persistence**: Spill large queues to disk under memory pressure
5. **Adaptive batch sizing**: Adjust `header_batch_size` based on network conditions
6. **Compact block relay**: Send only missing transactions like Bitcoin's compact blocks

---

## Related Features

- [Block Formation & Consensus](./block-formation-consensus_FEATURE_DOC.md) - Blocks that sync downloads
- [Storage Layer](./storage-layer_FEATURE_DOC.md) - Where synced data is persisted
- [Network & Transport](./network-transport_FEATURE_DOC.md) - Wire protocol for sync messages
- [Content Decay Engine](./content-decay-engine_FEATURE_DOC.md) - Decay filtering during sync

---

## Validation Rules Reference

| Rule | Description | Enforced By |
|------|-------------|-------------|
| V-SYNC-01 | Chain linkage - `prev_root_hash` matches predecessor | `verify_single_header()` |
| V-SYNC-02 | PoW meets difficulty - `total_pow >= difficulty_target` | `verify_single_header()` |
| V-SYNC-03 | Timestamps monotonically increasing | `verify_single_header()` |
| V-SYNC-04 | Merkle root verification | `validate_block_content()` |
| V-SYNC-05 | Blocks within requested range | `validate_block_range()` |
| V-SYNC-06 | Response matches registered request | `RequestTracker::validate_response()` |

---

## Discrepancies: MASTER_FEATURES.md vs Implementation

The following discrepancies exist between the MASTER_FEATURES.md documentation and actual implementation:

### File Names
| Documented | Actual |
|-----------|--------|
| `sync/chain.rs` | `sync/syncer.rs` |
| `sync/fork.rs` | `sync/fork_detect.rs` |

### SyncState Enum
| Documented | Actual |
|-----------|--------|
| `Connecting` | Not implemented |
| `DownloadingHeaders` | `SyncingHeaders { current, target }` |
| `DownloadingBlocks` | `SyncingBlocks { current, target }` |
| `Validating` | Not implemented (inline validation) |
| `Complete` | Uses `Idle` instead |
| `Failed(SyncError)` | `Error` (no payload) |

### Validation Rule Descriptions
| Documented | Actual |
|-----------|--------|
| V-SYNC-01: Monotonic timestamps | V-SYNC-01: Chain linkage |
| V-SYNC-02: Valid signatures | V-SYNC-02: PoW difficulty |
| V-SYNC-03: PoW meets difficulty | V-SYNC-03: Monotonic timestamps |
| V-SYNC-04: Parent block exists | V-SYNC-04: Merkle root |
| V-SYNC-05: Merkle roots match | V-SYNC-05: Block in range |
| V-SYNC-06: No duplicate content | V-SYNC-06: Request matching |
