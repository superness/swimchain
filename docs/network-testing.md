# Network Testing Framework

## Overview

This document describes the multi-node network testing infrastructure for Milestone 4.2.
The framework provides in-process simulation of network behavior without Docker containers,
enabling fast iteration and deterministic timing control.

## Architecture

The test framework consists of several modular components:

```
tests/network/
├── mod.rs                 # Module declarations and re-exports
├── mock_chain.rs          # MockBlock: Simplified block structure
├── node.rs               # NodeHandle: Simulated node with SeenCache
├── topology.rs           # Topology: Network connectivity patterns
├── partition.rs          # PartitionController: Network partition simulation
├── test_network.rs       # TestNetwork: Orchestrator for propagation
├── helpers.rs            # Utility functions for tests
├── metrics_collector.rs  # Metrics aggregation and reporting
├── convergence_tests.rs  # Convergence validation tests
├── partition_tests.rs    # Partition and healing tests
├── propagation_tests.rs  # Gossip propagation tests
└── failure_tests.rs      # Node failure mode tests
```

## Design Decisions

### In-Process Simulation vs Docker

We chose in-process simulation over Docker-based testing for several reasons:

1. **Speed**: No container startup overhead (tests run in milliseconds)
2. **Determinism**: Simulated time allows precise timing control
3. **Debugging**: Standard Rust debugging tools work seamlessly
4. **Simplicity**: No external dependencies or infrastructure

### Component Design

#### MockBlock

Simplified block structure for testing network propagation without full validation:

```rust
pub struct MockBlock {
    pub height: u64,
    pub prev_hash: [u8; 32],
    pub fork_id: [u8; 32],
    pub timestamp: u64,
    pub producer_id: u64,
    pub hash: [u8; 32],
}
```

- Uses SHA-256 for deterministic hash computation
- Supports chain creation via `genesis()` and `next()` methods
- Fork ID allows multiple independent test chains

#### NodeHandle

Represents a single node in the test network:

```rust
pub struct NodeHandle {
    pub node_id: usize,
    seen_cache: SeenCache,  // Real SeenCache from swimchain
    tip: ChainTip,
    blocks: Vec<MockBlock>,
    receive_times_ms: Vec<(usize, u64)>,
    offline: bool,
}
```

- Integrates with the actual `SeenCache` implementation
- Tracks block receive times for latency analysis
- Supports offline/online state transitions

#### Topology

Defines network connectivity patterns:

- **FullMesh**: Every node connected to every other
- **Ring**: Circular connection pattern
- **Star(hub)**: Hub-and-spoke with specified hub node
- **Custom(edges)**: Arbitrary edge list

#### PartitionController

Simulates network partitions:

```rust
pub fn partition(&mut self, group_a: &[usize], group_b: &[usize]);
pub fn heal(&mut self);
pub fn isolate_node(&mut self, node: usize, total_nodes: usize);
```

#### TestNetwork

Main orchestrator using BFS-based gossip propagation:

```rust
pub fn propagate_block(&mut self, block: &MockBlock, origin: usize) -> PropagationResult;
```

The propagation follows gossip protocol rules:
- Fanout limited to `GOSSIP_FANOUT` (8) neighbors
- TTL decremented each hop, stops at 0
- SeenCache prevents duplicate processing

## Test Categories

### Convergence Tests

Validate that all nodes reach the same state:

| Test | Description |
|------|-------------|
| `test_all_nodes_converge_from_empty` | 10-node mesh converges on genesis |
| `test_chain_convergence` | Nodes converge after 10-block chain |
| `test_ring_convergence` | Ring topology converges |
| `test_star_convergence_from_hub` | Star topology from hub |
| `test_star_convergence_from_leaf` | Star topology from leaf |

### Partition Tests

Validate partition behavior and healing:

| Test | Description |
|------|-------------|
| `test_partition_isolation` | Groups are isolated during partition |
| `test_partition_healing_convergence` | Network heals after partition removed |
| `test_isolate_single_node` | Single node isolation |
| `test_split_brain_partition` | 50/50 network split |

### Propagation Tests

Validate gossip propagation behavior:

| Test | Description |
|------|-------------|
| `test_propagation_timing_bounded` | Latency is within expected bounds |
| `test_gossip_duplicate_detection` | SeenCache prevents duplicates |
| `test_gossip_ttl_enforcement` | TTL limits hop count |
| `test_fanout_limit` | Fanout limits neighbor selection |

### Failure Tests

Validate behavior during node failures:

| Test | Description |
|------|-------------|
| `test_node_offline_others_continue` | Network continues without failed node |
| `test_hub_failure_star_topology` | Star topology hub failure |
| `test_ring_with_failure` | Ring routes around failed node |

## Acceptance Criteria Mapping

| Acceptance Criterion | Tests |
|---------------------|-------|
| "All nodes converge on same state" | `convergence_tests.rs` |
| "Partitions heal correctly" | `partition_tests.rs` |
| "Propagation time is bounded" | `test_propagation_timing_bounded` |

## Spec Compliance

| Spec Requirement | Validation |
|-----------------|------------|
| NET-H01 (zero central infrastructure) | In-process simulation |
| NET-H02 (every client is full node) | NodeHandle stores full chain |
| NET-H03 (network continues if entity disappears) | `failure_tests.rs` |
| V-GOSSIP-01 (TTL > 0 to forward) | `test_gossip_ttl_enforcement` |
| V-GOSSIP-05 (duplicates dropped) | `test_gossip_duplicate_detection` |
| GOSSIP_FANOUT=8 | Configured from constants |
| GOSSIP_TTL=6 | Configured from constants |

## Running Tests

```bash
# Run all network tests
cargo test --test network_test

# Run specific test category
cargo test --test network_test convergence
cargo test --test network_test partition
cargo test --test network_test propagation
cargo test --test network_test failure

# Run with output
cargo test --test network_test -- --nocapture
```

## Metrics Collection

The `MetricsCollector` and `BenchmarkSuite` classes aggregate test results:

```rust
let mut suite = BenchmarkSuite::new("Propagation Tests");
suite.run("Full mesh genesis", || {
    network.propagate_block(&genesis, 0)
});

let report = suite.report();
```

See `docs/benchmarks/network.md` for benchmark results.

## Extending the Framework

### Adding New Topologies

Implement in `topology.rs`:

```rust
impl Topology {
    pub fn neighbors(&self, node_id: usize, total_nodes: usize) -> Vec<usize> {
        match self {
            // Add new topology here
            Topology::NewTopology(params) => {
                // Return neighbor list
            }
        }
    }
}
```

### Adding New Test Scenarios

1. Create appropriate helpers in `helpers.rs`
2. Add test functions to the relevant test module
3. Update metrics collection if needed

## Limitations

- **No Real Networking**: Tests simulate propagation, not actual network I/O
- **Simplified Sync**: Nodes can't recover blocks they missed while offline
- **No Latency Variance**: Hop delay is constant, not variable

These limitations are acceptable for testing propagation semantics. Real network
behavior is tested in integration tests with actual TCP connections.
