# Propagation Timing

## Overview

This document describes how propagation timing is measured in the Swimchain gossip protocol, expected performance characteristics, and tuning guidelines.

## Measurement Methodology

### Latency Tracking

The `PropagationMetrics` system tracks end-to-end propagation latency:

1. **Origin Tracking**: When a node creates and sends gossip with `TTL = GOSSIP_TTL`, the content ID and timestamp are recorded

2. **Receipt Tracking**: When a gossip message is received back (via network loop), the time difference is calculated and recorded

3. **Sample Storage**: Recent latencies are stored in a circular buffer for statistical analysis

### Metrics Captured

| Metric | Description |
|--------|-------------|
| `messages_sent` | Total gossip messages sent |
| `messages_received` | Total gossip messages received |
| `duplicates_dropped` | Messages dropped due to seen cache |
| `ttl_exhausted` | Messages not forwarded (TTL=0) |
| `validation_failures` | Messages rejected during validation |

### Latency Statistics

| Statistic | Method |
|-----------|--------|
| Average | Arithmetic mean of samples |
| Median | Middle value of sorted samples |
| P95 | 95th percentile |

## Expected Propagation Times

### Theoretical Analysis

Given the protocol parameters:
- `GOSSIP_FANOUT = 8`
- `GOSSIP_TTL = 6`

Maximum reachable nodes per hop:
```
Hop 1: 8 nodes
Hop 2: 8 × 8 = 64 nodes
Hop 3: 64 × 8 = 512 nodes
Hop 4: 512 × 8 = 4,096 nodes
Hop 5: 4,096 × 8 = 32,768 nodes
Hop 6: 32,768 × 8 = 262,144 nodes
```

### Expected Latency

| Network Size | Avg Hops | Expected Latency (50ms RTT) |
|--------------|----------|----------------------------|
| < 50 | 1-2 | 50-100ms |
| 50-500 | 2-3 | 100-150ms |
| 500-5,000 | 3-4 | 150-200ms |
| 5,000-50,000 | 4-5 | 200-250ms |
| 50,000+ | 5-6 | 250-300ms |

### Real-World Considerations

Actual latency will be affected by:

1. **Network Latency**: Geographic distance between nodes
2. **Processing Time**: Validation, storage, and forwarding overhead
3. **Congestion**: Network and node load
4. **Peer Selection**: Quality of selected peers

## Benchmarking Instructions

### Basic Latency Test

```rust
use swimchain::gossip::{GossipManager, gossip_types};
use std::time::Duration;

async fn benchmark_propagation() {
    let mut manager = GossipManager::new();
    let _ = manager.start();

    // Send multiple messages
    for i in 0..100 {
        let content_id = [i as u8; 32];
        let _ = manager.propagator()
            .gossip_content(content_id, gossip_types::CONTENT_NEW, None)
            .await;
    }

    // Wait for propagation
    tokio::time::sleep(Duration::from_secs(10)).await;

    // Get metrics
    let summary = manager.metrics().summary();
    println!("Average latency: {:.2}ms", summary.average_latency_ms);
    println!("Median latency: {}ms", summary.median_latency_ms);
    println!("P95 latency: {}ms", summary.p95_latency_ms);

    manager.stop().await;
}
```

### Multi-Node Test

For accurate benchmarking, run multiple nodes:

1. Start N nodes in a mesh network
2. Record start time at origin
3. Measure receipt time at all other nodes
4. Calculate end-to-end propagation time

### Metrics Collection

```rust
// Get comprehensive metrics
let metrics = manager.metrics();

println!("=== Gossip Metrics ===");
println!("Messages sent: {}", metrics.messages_sent());
println!("Messages received: {}", metrics.messages_received());
println!("Duplicates dropped: {}", metrics.duplicates_dropped());
println!("TTL exhausted: {}", metrics.ttl_exhausted());
println!("Validation failures: {}", metrics.validation_failures());
println!();
println!("=== Latency Statistics ===");
println!("Average: {:.2}ms", metrics.get_average_latency_ms());
println!("Median: {}ms", metrics.get_median_latency_ms());
println!("P95: {}ms", metrics.get_p95_latency_ms());
println!("Sample count: {}", metrics.latency_sample_count());
```

## Metrics API Reference

### PropagationMetrics

```rust
pub struct PropagationMetrics {
    // Counters
    fn messages_sent(&self) -> u64;
    fn messages_received(&self) -> u64;
    fn duplicates_dropped(&self) -> u64;
    fn ttl_exhausted(&self) -> u64;
    fn validation_failures(&self) -> u64;

    // Latency
    fn get_average_latency_ms(&self) -> f64;
    fn get_median_latency_ms(&self) -> u64;
    fn get_p95_latency_ms(&self) -> u64;
    fn latency_sample_count(&self) -> usize;

    // Recording
    fn record_sent(&self, gossip: &GossipPayload);
    fn record_received(&self, gossip: &GossipPayload);
    fn record_duplicate(&self);
    fn record_ttl_exhausted(&self);
    fn record_validation_failure(&self);

    // Summary
    fn summary(&self) -> MetricsSummary;
    fn reset(&self);
}
```

### MetricsSummary

```rust
pub struct MetricsSummary {
    pub messages_sent: u64,
    pub messages_received: u64,
    pub duplicates_dropped: u64,
    pub ttl_exhausted: u64,
    pub validation_failures: u64,
    pub average_latency_ms: f64,
    pub median_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub latency_sample_count: usize,
}
```

## Tuning Guidelines

### For Lower Latency

1. **Increase GOSSIP_FANOUT**: More peers per hop means faster propagation
   - Trade-off: Higher bandwidth usage
   - Recommendation: 8-16 for low-latency networks

2. **Optimize Peer Selection**: Prefer low-latency peers
   - Use latency measurements in scoring
   - Avoid consistently slow peers

3. **Reduce Validation Overhead**: Cache validation results
   - Pre-validate common patterns
   - Batch signature verification

### For Lower Bandwidth

1. **Decrease GOSSIP_FANOUT**: Fewer peers reduces redundancy
   - Trade-off: Higher latency, lower reliability
   - Recommendation: 4-6 for bandwidth-constrained environments

2. **Adjust TTL**: Lower TTL reduces total transmissions
   - Trade-off: May not reach all nodes
   - Only reduce if network diameter is known

3. **Larger Seen Cache**: Reduces duplicate transmissions
   - Trade-off: Higher memory usage
   - Recommendation: Size based on expected message rate

### For Higher Reliability

1. **Increase GOSSIP_FANOUT**: More redundancy
2. **Increase TTL**: Reaches further nodes
3. **Better Peer Diversity**: Use diversity bonus weighting

### Monitoring Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Average latency | > 500ms | > 2000ms |
| Duplicate rate | > 50% | > 80% |
| TTL exhausted rate | > 10% | > 30% |
| Validation failure rate | > 1% | > 5% |

## Performance Optimization

### Seen Cache

- Keep `SEEN_CACHE_SIZE` proportional to message rate
- Formula: `size = messages_per_second × SEEN_CACHE_EXPIRY_SECS × 1.5`

### Memory Usage

Per-node memory estimate:
```
Seen Cache: SEEN_CACHE_SIZE × 40 bytes ≈ 400 KB
Metrics: ~50 KB (latency samples)
Content tracking: ~500 KB
Total: ~1 MB baseline
```

### CPU Usage

Main CPU costs:
1. Signature verification (if enabled)
2. Hash computation for content IDs
3. Peer selection (random sampling)

Optimization: Batch operations where possible.
