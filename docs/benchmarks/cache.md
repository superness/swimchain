# Cache Performance Benchmarks (Milestone 3.4)

## Test Configuration

- **Date:** TBD (fill after running benchmarks)
- **CPU:** TBD
- **Rust:** TBD
- **Profile:** Release with LTO

## Hit Rate by Profile

Access pattern: Zipf distribution (α=1.0), simulating realistic content popularity.

| Profile       | Items  | Accesses | Hit Rate | Notes                |
|---------------|--------|----------|----------|----------------------|
| Budget_1GB    | 2,000  | 10,000   | TBD      | Most constrained     |
| Standard_5GB  | 10,000 | 50,000   | TBD      | Default profile      |
| Flagship_10GB | 20,000 | 100,000  | TBD      | Largest cache        |

**Target:** Budget ≥ 60%, Standard ≥ 70%, Flagship ≥ 75%

### Zipf Distribution Rationale

The Zipf distribution with α=1.0 models real-world content access patterns where:
- A few items are accessed very frequently
- Most items are accessed rarely
- This matches social media usage where popular content gets disproportionate views

## Eviction Overhead

Time to execute `evict_if_needed()` at various fill levels (10MB test cache).

| Fill % | Mean Time | Std Dev | P99      | Notes                |
|--------|-----------|---------|----------|----------------------|
| 50%    | TBD       | TBD     | TBD      | Below threshold      |
| 75%    | TBD       | TBD     | TBD      | Below threshold      |
| 90%    | TBD       | TBD     | TBD      | At threshold         |
| 95%    | TBD       | TBD     | TBD      | Over threshold       |
| 99%    | TBD       | TBD     | TBD      | Near full            |

**Target:** < 10ms @ 90% fill, < 50ms @ 99% fill

## CachingContentStore Throughput

Put operation throughput with different content sizes.

| Size   | Throughput | Notes                |
|--------|------------|----------------------|
| 1KB    | TBD        | Small content items  |
| 10KB   | TBD        | Medium content       |
| 100KB  | TBD        | Larger content       |

## Statistics Collection Overhead

Time to collect full statistics by entry count.

| Entries | Mean Time | Notes                |
|---------|-----------|----------------------|
| 100     | TBD       | Small cache          |
| 1,000   | TBD       | Medium cache         |
| 10,000  | TBD       | Large cache          |

## Running Benchmarks

```bash
# Full benchmark suite
cargo bench --bench cache_benchmark

# Specific benchmark
cargo bench --bench cache_benchmark -- "hit_rate"
cargo bench --bench cache_benchmark -- "eviction"
cargo bench --bench cache_benchmark -- "caching_store"
cargo bench --bench cache_benchmark -- "statistics"

# Results location
open target/criterion/report/index.html
```

## Measurement Methodology

1. **Hit Rate:** Pre-fill cache, access with Zipf(α=1.0), measure hit/miss ratio
2. **Eviction Overhead:** Pre-fill to target %, time `evict_if_needed(10KB)`
3. **Put Throughput:** Measure `put_with_metadata()` with unique data each iteration
4. **Statistics:** Time `statistics()` call at various cache sizes

## Test Cache Size

Benchmarks use a 10MB test cache (smaller than production profiles) for:
- Faster CI runs
- Reproducible results
- Less variance from I/O

The relative performance characteristics should scale to larger caches.

## Critical Measurements Summary

| Question | Finding |
|----------|---------|
| What cache size is practical on mobile? | TBD - Budget (1GB) achieves X% hit rate |
| What is cache hit rate with realistic usage? | TBD - See table above |
| What is eviction overhead? | TBD - See table above |
| How fast is statistics collection? | TBD - See table above |

## Comparison with Previous Milestones

| Metric | Before M3.4 | After M3.4 | Change |
|--------|-------------|------------|--------|
| Cache tracking | Basic | Full statistics | +eviction counts, bytes by priority |
| Profile support | Manual config | 3 profiles | +eviction_threshold per profile |
| Integration | Separate components | CachingContentStore | Unified API |
