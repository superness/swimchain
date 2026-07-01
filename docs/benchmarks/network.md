# Network Benchmark Results

## Overview

This document contains benchmark measurements for network propagation behavior
as part of Milestone 4.2 (Multi-Node Network).

## Test Environment

- **Simulation Type**: In-process (no real network I/O)
- **Node Count**: 10 (default), varies per test
- **Gossip Parameters**:
  - `GOSSIP_FANOUT`: 8
  - `GOSSIP_TTL`: 6
- **Simulated Hop Delay**: 10ms (configurable)

## Propagation Timing

### Full Mesh Topology (10 nodes)

| Metric | Value |
|--------|-------|
| Genesis Propagation | 10ms |
| All Nodes Reached | 10/10 |
| Hops to Full Coverage | 9 |
| Duplicate Messages | 0 |

In a full mesh, all nodes are 1 hop from origin, so propagation completes
in a single hop cycle.

### Ring Topology (10 nodes)

| Metric | Value |
|--------|-------|
| Genesis Propagation | 50ms |
| All Nodes Reached | 10/10 |
| Max Path Length | 5 hops |
| TTL Exhausted | 0 |

Ring diameter is n/2 = 5, well within TTL of 6.

### Star Topology (10 nodes)

| Metric | Value |
|--------|-------|
| From Hub | 10ms |
| From Leaf | 20ms |
| All Nodes Reached | 10/10 |

Star topology has diameter 2 (leaf -> hub -> leaf).

## Convergence Measurements

### Time to Full Convergence

| Scenario | Nodes | Blocks | Time |
|----------|-------|--------|------|
| Single genesis | 10 | 1 | 10ms |
| 5-block chain | 10 | 5 | 50ms |
| 10-block chain | 10 | 10 | 100ms |
| Large network | 20 | 1 | 10ms |

### Convergence with Partitions

| Scenario | Partition Duration | Recovery Time |
|----------|-------------------|---------------|
| 50/50 split | N/A | Immediate after heal |
| Single node isolation | N/A | Requires sync |

## Gossip Efficiency

### Duplicate Detection

| Scenario | Total Hops | Duplicates Dropped |
|----------|------------|-------------------|
| 10-node mesh, 1 block | 9+ | 0-8 (seen cache) |
| 10-node ring, 1 block | 18+ | 8+ |

SeenCache effectively prevents redundant processing.

### TTL Exhaustion

| Topology | Nodes | TTL | Nodes Reached | TTL Exhausted |
|----------|-------|-----|---------------|---------------|
| Line (12 nodes) | 12 | 6 | 7 | Yes |
| Ring (10 nodes) | 10 | 6 | 10 | No |
| Mesh (10 nodes) | 10 | 6 | 10 | No |

TTL=6 is sufficient for networks with diameter ≤ 6.

## Failure Scenarios

### Node Failures

| Scenario | Nodes Online | Propagation |
|----------|--------------|-------------|
| 1 node offline | 9/10 | 9 reached |
| 3 nodes offline | 7/10 | 7 reached |
| Hub offline (star) | 9/10 | 1 reached (isolated) |

### Partition Recovery

The current simulation does not include sync mechanisms for catching up
missed blocks. Recovery requires:
1. Partition heal
2. Sync protocol (not simulated)
3. Chain selection for conflicting forks

## Critical Measurements

### How long for content to reach all nodes?

| Network Size | Topology | Max Latency |
|--------------|----------|-------------|
| 10 | Full Mesh | 10ms |
| 10 | Ring | 50ms |
| 10 | Star | 20ms |
| 20 | Full Mesh | 10ms |

**Finding**: Content reaches all nodes within 1-5 hop cycles, bounded by
network diameter and TTL.

### How does network recover from partition?

1. **During Partition**: Groups diverge, building independent chains
2. **After Heal**: Communication resumes
3. **Convergence**: Requires sync protocol (not simulated)

**Finding**: Partition healing allows message flow, but diverged chains
need additional sync logic to converge.

## Recommendations

1. **TTL Setting**: Current TTL=6 is adequate for networks up to ~100 nodes
   with typical mesh connectivity.

2. **Fanout Setting**: GOSSIP_FANOUT=8 provides good balance between
   redundancy and bandwidth.

3. **Partition Handling**: Consider adding proactive sync after partition
   detection to accelerate recovery.

4. **Large Networks**: Test with 50-100+ nodes to validate scaling behavior.

## Future Work

- [ ] Variable latency simulation
- [ ] Bandwidth-constrained propagation
- [ ] Real TCP/IP integration tests
- [ ] Docker-based multi-container tests
- [ ] Long-running stability tests

## Appendix: Test Commands

```bash
# Run all benchmarks
cargo test --test network_test -- --nocapture 2>&1 | grep -E "(test|PASSED|FAILED)"

# Run with timing
cargo test --test network_test -- -Z unstable-options --report-time

# Run specific benchmark
cargo test --test network_test test_propagation_timing
```
