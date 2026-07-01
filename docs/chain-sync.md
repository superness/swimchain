# Chain Synchronization (SPEC_06 §4.4, §4.5)

This document describes the chain synchronization implementation for Swimchain.

## Overview

Chain synchronization uses a **header-first** approach where block headers are downloaded and verified before full block content. This enables efficient syncing by:

1. Validating chain structure with lightweight headers
2. Identifying which blocks contain non-decayed content
3. Only downloading post records for relevant blocks

## Two-Layer Sync Model

### Initial Sync

When a new node joins the network:

1. **Query Peers**: Request chain status from up to 8 peers
2. **Select Best Chain**: Choose peer with most cumulative work
3. **Download Headers**: Request headers in batches of 2000
4. **Verify Chain**: Validate all V-SYNC rules
5. **Identify Relevant Blocks**: Filter by decay threshold
6. **Download Content**: Get post records for non-decayed blocks

### Continuous Sync

After initial sync, nodes enter continuous sync:

1. **Periodic Check**: Every 30 seconds (SYNC_INTERVAL_SECS)
2. **Query Peers**: Get chain status from peers
3. **Detect Updates**: Compare cumulative work
4. **Sync Missing**: Download any new blocks

## Validation Rules

### V-SYNC-01: Chain Linkage

```
header.prev_root_hash == predecessor.hash()
```

Every header must correctly reference its predecessor's hash.

### V-SYNC-02: PoW Meets Difficulty

```
header.total_pow >= header.difficulty_target
```

Aggregated proof-of-work must meet the difficulty target.

### V-SYNC-03: Monotonic Timestamps

```
header.timestamp > predecessor.timestamp
```

Timestamps must strictly increase along the chain.

### V-SYNC-04: Content Signatures

Merkle root verification ensures space block hashes are correctly aggregated.

### V-SYNC-05: Block Range

Blocks in responses must be within the requested height range.

### V-SYNC-06: Request Tracking

Responses are only accepted for registered requests, preventing unsolicited data attacks.

## Fork Detection

The sync module detects four fork scenarios:

| Scenario | Detection | Action |
|----------|-----------|--------|
| Same Chain | `local.tip_hash == remote.tip_hash` | No action needed |
| Extension Needed | `remote.cumulative_work > local.cumulative_work` | Download missing blocks |
| Fork Detected | Different tips at same height | Binary search for common ancestor |
| Local Ahead | `local.cumulative_work > remote.cumulative_work` | No action needed |

### Common Ancestor Search

When a fork is detected, binary search finds the highest height where chains agree:

```rust
pub fn find_common_ancestor(
    store: &ChainStore,
    remote_headers: &[RootBlock],
) -> Result<Option<u64>, SyncError>
```

## Module Structure

```
src/sync/
├── mod.rs           # Module exports and SyncPeerConnection trait
├── error.rs         # SyncError enum (V-SYNC-01 through V-SYNC-06)
├── state.rs         # SyncState enum (Idle, Syncing, Continuous, Error)
├── config.rs        # SyncConfig with defaults from constants
├── chain_status.rs  # Build ChainStatusPayload, cumulative work calculation
├── request_tracker.rs # V-SYNC-06 request/response tracking
├── header_sync.rs   # Header chain verification (V-SYNC-01/02/03)
├── block_download.rs # Block range validation (V-SYNC-04/05)
├── progress.rs      # SyncProgress events via broadcast channel
├── fork_detect.rs   # ForkType detection, common ancestor search
├── initial_sync.rs  # Initial sync coordinator
├── continuous.rs    # Continuous sync loop
└── syncer.rs        # ChainSyncer facade (unified API)
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `sync_interval_secs` | 30 | Continuous sync check interval |
| `block_request_timeout_ms` | 10,000 | Request timeout |
| `header_batch_size` | 2,000 | Headers per request |
| `query_peer_count` | 8 | Peers to query for chain status |
| `parallel_downloads` | 1 | Concurrent block downloads |

## Error Handling

All sync operations return `Result<T, SyncError>`. Error variants include:

- `InvalidChainLinkage` - V-SYNC-01 violation
- `InsufficientPoW` - V-SYNC-02 violation
- `NonMonotonicTimestamp` - V-SYNC-03 violation
- `InvalidMerkleRoot` - V-SYNC-04 violation
- `BlockOutOfRange` - V-SYNC-05 violation
- `UnregisteredRequest` - V-SYNC-06 violation
- `NoPeersAvailable` - No peers responded
- `PeerTimeout` - Request timed out
- `Storage` - Storage layer error
- `Cancelled` - Sync was cancelled

## Progress Tracking

Subscribe to progress events:

```rust
let syncer = ChainSyncer::new(SyncConfig::default());
let mut rx = syncer.subscribe_progress();

while let Ok(event) = rx.recv().await {
    match event {
        SyncProgressEvent::Started => println!("Sync started"),
        SyncProgressEvent::PhaseChanged(phase) => println!("Phase: {:?}", phase),
        SyncProgressEvent::Progress(p) => println!("{:.1}% complete", p.percentage()),
        SyncProgressEvent::Complete { blocks_synced, duration_secs } => {
            println!("Synced {} blocks in {:.1}s", blocks_synced, duration_secs);
        }
        _ => {}
    }
}
```

## Performance Considerations

### Cumulative Work Calculation

Current implementation iterates all blocks from genesis (O(n)). For production:

```rust
// TODO: Cache cumulative_work in ChainStore
// Update incrementally when adding new blocks
```

### Parallel Downloads

Default is sequential (`parallel_downloads = 1`) for safety. Can be increased:

```rust
let config = SyncConfig::default()
    .with_parallel_downloads(4);
```

### Decay Optimization

Only blocks within `DECAY_FLOOR_SECS` (48 hours) need content downloaded:

```rust
pub fn identify_relevant_blocks(headers: &[RootBlock], current_time: u64) -> Vec<u64>
```

## Usage Example

```rust
use swimchain::sync::{ChainSyncer, SyncConfig};
use swimchain::storage::ChainStore;
use std::sync::Arc;

// Create syncer
let syncer = ChainSyncer::new(SyncConfig::default());

// Initial sync
let stats = syncer.start_initial_sync(
    fork_id,
    &peers,
    &store,
).await?;

println!("Synced {} headers, {} blocks in {:.1}s",
    stats.headers_synced,
    stats.blocks_synced,
    stats.duration_secs);

// Start continuous sync
let handle = syncer.start_continuous_sync(
    fork_id,
    Arc::new(store),
    Arc::new(peers),
);

// Later: stop sync
syncer.stop();
```
