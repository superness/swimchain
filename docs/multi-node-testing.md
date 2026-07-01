# Multi-Node Testing Guide

This document describes the multi-node integration testing infrastructure for Milestone 8.6.

## Overview

The multi-node testing framework provides infrastructure for running multiple Swimchain nodes in a local test environment. It uses ephemeral ports for CI compatibility and temporary directories for storage isolation.

## Architecture

```
tests/integration/
├── mod.rs                    # Module declarations
└── multi_node/
    ├── mod.rs               # Multi-node module exports
    ├── error.rs             # Test-specific error types
    ├── harness.rs           # MultiNodeTestHarness infrastructure
    ├── helpers.rs           # Utility functions
    ├── two_node_tests.rs    # Two-node scenarios
    ├── three_node_tests.rs  # Three-node scenarios
    ├── content_tests.rs     # Content propagation tests
    ├── sync_tests.rs        # Sync from scratch tests
    └── partition_tests.rs   # Partition and recovery tests
```

## Key Components

### MultiNodeTestHarness

The main test orchestrator that manages multiple node instances:

```rust
pub struct MultiNodeTestHarness {
    pub nodes: Vec<RunningNode>,
}

impl MultiNodeTestHarness {
    /// Create N nodes (not started yet)
    pub async fn new(node_count: usize) -> Result<Self, TestError>;

    /// Start all nodes
    pub async fn start_all(&mut self) -> Result<(), TestError>;

    /// Connect one node to another
    pub async fn connect_pair(&self, from: usize, to: usize) -> Result<(), TestError>;

    /// Connect all nodes in full mesh
    pub async fn connect_mesh(&self) -> Result<(), TestError>;

    /// Wait for connection between specific nodes
    pub async fn wait_for_connection(&self, from: usize, to: usize, timeout: Duration) -> Result<(), TestError>;

    /// Shutdown all nodes gracefully
    pub async fn shutdown_all(&mut self) -> Result<(), TestError>;
}
```

### RunningNode

Represents a single running node in the test harness:

```rust
pub struct RunningNode {
    pub manager: NodeManager,
    pub keypair: KeyPair,
    pub listen_addr: SocketAddr,  // Actual bound address
    pub data_dir: TempDir,
    pub index: usize,
}
```

## Running Tests

```bash
# Run all integration tests
cargo test --test integration_tests

# Run specific test category
cargo test --test integration_tests two_node
cargo test --test integration_tests three_node
cargo test --test integration_tests partition

# Run with verbose output
cargo test --test integration_tests -- --nocapture

# Run single test
cargo test --test integration_tests test_two_nodes_start_and_run -- --nocapture
```

## Test Categories

### Two-Node Tests (`two_node_tests.rs`)

| Test | Description |
|------|-------------|
| `test_two_nodes_start_and_run` | Both nodes start and reach Running state |
| `test_node_subsystems_accessible` | gossip_manager, chain_store, connection_manager accessible |
| `test_node_restart` | Node can stop and restart |
| `test_connection_to_nonexistent_node` | Failed connections don't crash node |
| `test_peer_count_zero_initially` | Initial peer count is 0 |
| `test_two_nodes_connect_handshake` | Two nodes connect and complete VERSION/VERACK handshake |
| `test_bidirectional_connection` | Bidirectional communication after connection |

### Three-Node Tests (`three_node_tests.rs`)

| Test | Description |
|------|-------------|
| `test_three_nodes_start_and_run` | All three nodes start successfully |
| `test_gossip_manager_seen_cache` | SeenCache functionality per node |
| `test_chain_store_isolation` | ChainStore isolation between nodes |
| `test_node_id_uniqueness` | Each node has unique ID |
| `test_three_node_mesh_connection` | Full mesh topology with connections |
| `test_gossip_seen_cache_multi_node` | Seen cache propagation simulation |
| `test_three_node_connection_performance` | Mesh setup performance measurement |

### Content Tests (`content_tests.rs`)

| Test | Description |
|------|-------------|
| `test_chain_store_basic_operations` | Block storage and retrieval |
| `test_chain_store_node_isolation` | Storage isolation between nodes |
| `test_block_storage_performance` | 100-block storage performance |
| `test_simulated_content_propagation` | Content propagation between nodes |
| `test_gossip_prevents_duplicate_propagation` | Seen cache prevents duplicates |
| `test_multi_node_propagation_performance` | 5-node propagation performance |

### Sync Tests (`sync_tests.rs`)

| Test | Description |
|------|-------------|
| `test_syncer_initialization` | Initial sync state is Idle |
| `test_syncer_state_after_restart` | Sync state persists across restart |
| `test_harness_creation_overhead` | Multi-node harness performance |
| `test_sync_from_scratch` | New node syncs full chain |
| `test_large_chain_sync_performance` | 500-block sync performance |
| `test_incremental_sync` | Incremental sync after offline period |
| `test_syncer_status_during_operations` | Sync status accessibility |

### Partition Tests (`partition_tests.rs`)

| Test | Description |
|------|-------------|
| `test_disconnect_api_callable` | Disconnect API works |
| `test_rapid_start_stop_cycles` | Node stability during rapid operations |
| `test_independent_node_lifecycle` | Nodes can start/stop independently |
| `test_peer_count_without_connections` | Initial peer count is 0 |
| `test_node_stable_after_failed_connect` | Failed connections don't crash node |
| `test_network_partition_simulation` | Three-node partition and recovery |
| `test_chain_divergence_during_partition` | Chain reconciliation after partition |
| `test_disconnect_reconnect_cycle` | Disconnect and reconnect cycle |
| `test_partition_recovery_performance` | Recovery time measurement |

## Test Isolation

Each test uses:
- **Ephemeral ports** (port 0): OS assigns random available port
- **Temporary directories**: TempDir creates unique data directories per test
- **Independent instances**: Each node has its own subsystems

## Implementation Details

### Accept Loop (Implemented 2025-12-27)

The NodeManager now includes an accept loop in the BackgroundTaskRunner that:
1. Accepts incoming TCP connections
2. Completes VERSION/VERACK handshake
3. Registers connections in ConnectionManager

This enables full two-node connection testing with actual handshakes.

### Node Restart Support

Nodes can be stopped and restarted. On restart:
1. Shutdown channels are reset
2. New ephemeral port is assigned
3. All subsystems are reinitialized

### Simulated vs Real Propagation

Content propagation tests use simulated propagation (direct ChainStore writes)
rather than actual gossip message exchange. This validates:
- Storage infrastructure works correctly
- Seen cache prevents duplicates
- Performance is within acceptable bounds

Full gossip-based propagation requires the message routing event loop.

## Performance Measurements

### Critical Metrics (CM)

| Metric | Target | Current Status |
|--------|--------|----------------|
| CM1: Content propagation time (2 nodes) | < 10s | ~1ms (simulated) |
| CM2: Sync 100 blocks time | < 60s | ~10ms (simulated) |

### Baseline Measurements

| Operation | Measurement |
|-----------|-------------|
| Node startup | ~100-200ms |
| Node shutdown | ~50-100ms |
| Harness creation (5 nodes) | ~500ms |
| Mesh connection (3 nodes) | ~100ms |
| Block storage (100 blocks) | < 5s |
| Sync (500 blocks) | > 100 blocks/sec |
| Partition recovery | < 5s |

## Troubleshooting

### Tests fail with "port already in use"

This shouldn't happen with ephemeral ports. If it does:
1. Check for zombie processes: `ps aux | grep integration_tests`
2. Wait a few seconds and retry
3. Check system port exhaustion

### Tests timeout

- Default handshake timeout is 30s
- If tests consistently timeout, check:
  1. Network firewall settings (local connections should be allowed)
  2. System load (high CPU may slow tokio runtime)
  3. Available memory (each node uses ~50MB)

### Sled database errors

Each test uses a unique TempDir. If sled errors occur:
1. Ensure sufficient disk space in /tmp
2. Check file descriptor limits: `ulimit -n`
3. Verify TempDir cleanup: old test data should be auto-deleted

## Extending the Framework

### Adding New Tests

1. Create test function in appropriate file
2. Use `MultiNodeTestHarness::new(N)` for N nodes
3. Call `start_all()` before operations
4. Use `shutdown_all()` for cleanup
5. Handle errors appropriately

### Adding New Topologies

Implement in `harness.rs`:
```rust
impl MultiNodeTestHarness {
    pub async fn connect_ring(&self) -> Result<(), TestError> {
        for i in 0..self.nodes.len() {
            let next = (i + 1) % self.nodes.len();
            self.connect_pair(i, next).await?;
        }
        Ok(())
    }
}
```

## Related Documents

- [SPEC_10_NODE_OPERATIONS.md](../specs/SPEC_10_NODE_OPERATIONS.md) - Node operations specification
- [node-manager.md](node-manager.md) - NodeManager design
- [network-testing.md](network-testing.md) - Simulation-based testing framework
- [transport-layer.md](transport-layer.md) - TCP transport details

---

*Created: 2025-12-27*
*Milestone: 8.6 Multi-Node Testing*
