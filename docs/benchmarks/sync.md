# Sync Benchmarks

This document contains benchmark methodology and expected results for chain synchronization.

## Benchmark Methodology

Benchmarks use the Criterion library with the following setup:

- **Hardware**: Results will vary by system
- **Data**: Synthetic header chains with valid linkage
- **Iterations**: Criterion auto-tunes for statistical significance

## Running Benchmarks

```bash
# Run all sync benchmarks
cargo bench --bench sync

# Run specific benchmark
cargo bench --bench sync -- verify_header_chain

# Generate HTML report
cargo bench --bench sync -- --save-baseline main
```

## Benchmark Functions

### verify_header_chain

Measures time to verify chain linkage, PoW, and timestamps.

| Chain Size | Expected Time | Notes |
|------------|---------------|-------|
| 100 headers | < 1ms | Trivial |
| 1,000 headers | ~5ms | Fast |
| 10,000 headers | ~50ms | Acceptable |
| 100,000 headers | ~500ms | Production target |

### identify_relevant_blocks

Measures time to filter blocks by decay threshold.

| Chain Size | Expected Time | Notes |
|------------|---------------|-------|
| 1,000 headers | < 1ms | O(n) scan |
| 10,000 headers | ~2ms | Linear scaling |
| 100,000 headers | ~20ms | Still fast |

### header_hash

Measures single header hash computation.

| Operation | Expected Time |
|-----------|---------------|
| SHA-256 hash | ~500ns |

### meets_difficulty

Measures difficulty check (simple comparison).

| Operation | Expected Time |
|-----------|---------------|
| PoW check | < 10ns |

## Expected Sync Times (from SPEC_06)

| Scenario | Headers | Blocks | Expected Time |
|----------|---------|--------|---------------|
| New node (1 day) | ~2,880 | ~2,880 | < 30s |
| New node (1 week) | ~20,160 | ~5,760 | < 2 min |
| New node (1 month) | ~86,400 | ~5,760 | < 5 min |
| Catch-up (1 hour) | ~120 | ~120 | < 5s |

Notes:
- Block count assumes 48-hour decay window
- Times assume 100 Mbps network
- Header-only sync is much faster

## Bandwidth Analysis

### Header Download

| Component | Size | Per 1000 Headers |
|-----------|------|------------------|
| RootBlock header | ~200 bytes | ~200 KB |
| Network overhead | ~20% | ~40 KB |
| **Total** | | **~240 KB** |

### Block Content Download

| Component | Size | Notes |
|-----------|------|-------|
| RootBlock | ~200 bytes | Header data |
| SpaceBlocks | Variable | Depends on activity |
| ContentBlocks | Variable | ~1KB per post |

### Estimated Bandwidth

| Scenario | Headers | Content | Total |
|----------|---------|---------|-------|
| 10K header sync | 2.4 MB | 0 | 2.4 MB |
| 10K full sync | 2.4 MB | ~50 MB | ~52 MB |
| 100K header sync | 24 MB | 0 | 24 MB |

## Optimization Opportunities

### Current Bottlenecks

1. **Cumulative Work Calculation**: O(n) per status query
   - Solution: Cache in ChainStore, update incrementally

2. **Sequential Downloads**: Default parallel_downloads = 1
   - Solution: Increase for trusted peers

3. **Per-Block Storage**: Individual inserts
   - Solution: Batch writes

### Future Improvements

1. **Parallel Header Verification**: SHA-256 is parallelizable
2. **Compact Headers**: Strip space_block_hashes for sync
3. **Checkpoint Sync**: Skip verification for known-good heights

## Sample Results

To be populated after running benchmarks:

```
verify_header_chain/100
                        time:   [XXX µs YYY µs ZZZ µs]
verify_header_chain/1000
                        time:   [XXX ms YYY ms ZZZ ms]
verify_header_chain/10000
                        time:   [XXX ms YYY ms ZZZ ms]
verify_header_chain/100000
                        time:   [XXX ms YYY ms ZZZ ms]

identify_relevant_blocks/1000
                        time:   [XXX µs YYY µs ZZZ µs]
identify_relevant_blocks/10000
                        time:   [XXX ms YYY ms ZZZ ms]
identify_relevant_blocks/100000
                        time:   [XXX ms YYY ms ZZZ ms]

header_hash             time:   [XXX ns YYY ns ZZZ ns]
meets_difficulty        time:   [XXX ns YYY ns ZZZ ns]
```
