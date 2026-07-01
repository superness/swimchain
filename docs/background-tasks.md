# Background Tasks

This document describes the background task system for Swimchain nodes, as specified in SPEC_10 Section 6.

## Overview

The `BackgroundTaskRunner` manages periodic background tasks that run during node operation. All tasks are spawned as Tokio tasks and respond to a shutdown signal for graceful termination.

## Task Inventory

| Task | Interval | Purpose | Integration Status |
|------|----------|---------|-------------------|
| Sync Loop | 30s | Check for new blocks, sync if behind | Placeholder |
| Decay Tick | 60s | Process content decay, prune if needed | Placeholder |
| Peer Maintenance | 60s | Check peer count, reconnect if needed | Connected to ConnectionManager |
| Contribution Record | 300s (5min) | Sample uptime | Connected to ContributionManager |
| Keepalive | 120s (2min) | Send PING to idle connections | Placeholder |
| Cache Cleanup | 600s (10min) | Evict old cache entries | Placeholder |
| Availability Announce | 300s (5min) | Announce seeding availability | Placeholder |

## Architecture

### Shutdown Mechanism

All tasks use `tokio::select!` with a `watch::Receiver<bool>` for graceful shutdown:

```rust
loop {
    tokio::select! {
        biased; // Check shutdown first

        _ = shutdown.changed() => {
            break;
        }
        _ = ticker.tick() => {
            // Do work
        }
    }
}
```

The `biased` keyword ensures the shutdown branch is checked first, guaranteeing prompt termination.

### Missed Tick Behavior

All interval-based tasks use `MissedTickBehavior::Skip` to prevent task pile-up if processing takes longer than the interval.

### Error Handling

- Tasks log warnings on errors but never crash
- Errors do not stop the task loop
- Critical errors that would prevent normal operation should signal for node shutdown

## Integration with NodeManager

### Startup

Background tasks are started in `NodeManager::start()` after subsystem initialization:

```rust
let mut tasks = BackgroundTaskRunner::new(self.shutdown_rx.clone());
tasks.spawn_all(
    self.syncer.clone(),
    self.connection_manager.clone(),
    self.contribution.clone(),
);
self.tasks = Some(tasks);
```

### Shutdown

Tasks are stopped first in `NodeManager::stop()` to ensure clean shutdown:

```rust
if let Some(ref mut tasks) = self.tasks {
    tasks.shutdown().await;
}
self.tasks = None;
```

## Interval Constants

All intervals are defined as constants in `src/node/tasks.rs`:

```rust
pub const SYNC_INTERVAL_SECS: u64 = 30;
pub const DECAY_TICK_INTERVAL_SECS: u64 = 60;
pub const PEER_MAINTENANCE_INTERVAL_SECS: u64 = 60;
pub const CONTRIBUTION_RECORD_INTERVAL_SECS: u64 = 300;  // 5 min
pub const KEEPALIVE_INTERVAL_SECS: u64 = 120;           // 2 min
pub const CACHE_CLEANUP_INTERVAL_SECS: u64 = 600;       // 10 min
pub const AVAILABILITY_ANNOUNCE_INTERVAL_SECS: u64 = 300; // 5 min
```

These match the values specified in SPEC_10 Section 6.1.

## Task Details

### Sync Loop (30s)

Calls `ChainSyncer::sync_once()` to check if the node is behind and needs to sync.

**Current Status**: Placeholder - `sync_once()` returns immediately.

**Future Implementation**:
1. Query a connected peer for their chain tip
2. Compare cumulative work to local tip
3. If behind, initiate header sync

### Decay Tick (60s)

Processes content decay according to SPEC_07.

**Current Status**: Placeholder - no content store integration.

**Future Implementation**:
1. Get storage usage from ContentStore
2. Process decay via ContentManager
3. Prune decayed content if over storage threshold

### Peer Maintenance (60s)

Monitors peer count and connection health.

**Current Status**: Connected to ConnectionManager - logs connection count and `needs_more_peers` status.

**Future Implementation**:
1. If below target peer count, reconnect to best known peers
2. Rotate poor-performing connections
3. Update peer scoring based on behavior

### Contribution Recording (5min)

Records uptime samples for contribution tracking per SPEC_09.

**Current Status**: Fully connected - calls `ContributionManager::record_uptime_sample()`.

### Keepalive (2min)

Sends PING messages to idle connections to detect dead peers.

**Current Status**: Placeholder - PING/PONG protocol not integrated.

**Future Implementation**:
1. Get connections idle longer than keepalive interval
2. Send PING message to each
3. Mark connections that don't respond as failed

### Cache Cleanup (10min)

Evicts old entries from the content cache.

**Current Status**: Placeholder - CachingContentStore not integrated.

**Future Implementation**:
1. Check cache size against limits
2. Evict least-recently-used entries
3. Log cleanup statistics

### Availability Announce (5min)

Broadcasts seeding availability to the network.

**Current Status**: Placeholder - SeedingManager not integrated.

**Future Implementation**:
1. Gather list of content we're seeding
2. Broadcast availability messages to peers
3. Update DHT entries if applicable

## Testing

### Unit Tests

Located in `src/node/tasks.rs`:

- `test_background_task_runner_creation` - Verifies struct creation
- `test_interval_constants_match_spec` - Validates constant values
- `test_spawn_all_with_none_subsystems` - Tests optional subsystem handling
- `test_shutdown_clears_handles` - Verifies shutdown cleans up
- `test_shutdown_responds_to_signal` - Tests graceful shutdown

### Integration Tests

Task integration is tested through `NodeManager` lifecycle tests:

- `test_start_transitions_to_running` - Verifies tasks start during node startup
- `test_stop_transitions_to_stopped` - Verifies tasks stop during node shutdown
- `test_node_restart` - Verifies tasks restart properly

## Logging

All tasks use the `log` crate at debug level for normal operations:

- Task startup: `debug!("Sync loop started (30s interval)")`
- Task execution: `debug!("sync_once executed (placeholder)")`
- Shutdown: `debug!("Sync loop received shutdown signal")`
- Errors: `warn!("Sync loop error: {}", e)`

## References

- [SPEC_10 Node Operations](../specs/SPEC_10_NODE_OPERATIONS.md) - Section 6: Background Tasks
- [SPEC_09 Contribution System](../specs/SPEC_09_CONTRIBUTION_SYSTEM.md) - Section 2: Uptime Tracking
- [SPEC_07 Content Storage](../specs/SPEC_07_CONTENT_STORAGE.md) - Content decay
