# Mobile Benchmarks

## Test Environment

- **Platform**: WSL2 on Windows (Linux 6.6.87.2-microsoft-standard-WSL2)
- **Rust Version**: 1.70+
- **Benchmark Framework**: Criterion 0.5
- **Date**: December 2024

## Running Benchmarks

```bash
# Run all mobile benchmarks
cargo bench -- mobile_

# Run specific benchmark suite
cargo bench -- mobile_pow
cargo bench -- mobile_sync
cargo bench -- mobile_storage
```

## Benchmark Suites

### Mobile PoW (`benches/mobile_pow.rs`)

Measures Proof-of-Work performance on mobile configuration.

**Groups:**
- `mobile_single_hash` - Single hash verification time
- `mobile_mining` - Mining at various difficulties
- `test_config_mining` - Comparison with test config
- `mobile_action_types` - Different action types

**Key Metrics:**

| Metric | Mobile (p=2) | Desktop (p=4) | Test (p=1) |
|--------|--------------|---------------|------------|
| Single hash | ~100-107ms | ~108-113ms | ~1ms |
| Difficulty 4 | ~1.6s | ~1.7s | ~16ms |
| Difficulty 8 | ~26s | ~27s | ~256ms |

### Mobile Sync (`benches/mobile_sync.rs`)

Measures header synchronization under bandwidth constraints.

**Groups:**
- `header_sync` - Sync time by network type
- `chunk_transfer` - Optimal chunk sizes
- `theoretical_sync` - Calculated expected times

**Network Profiles:**

| Profile | Speed | Bytes/sec |
|---------|-------|-----------|
| 3G | 2 Mbps | 256,000 |
| 4G | 10 Mbps | 1,250,000 |
| WiFi | 50 Mbps | 6,250,000 |

**Expected Sync Times (100K headers = 20 MB):**

| Network | Expected Time |
|---------|---------------|
| 3G | 78 seconds |
| 4G | 16 seconds |
| WiFi | 3.2 seconds |

### Mobile Storage (`benches/mobile_storage.rs`)

Projects storage requirements based on PROJECTIONS.md activity model.

**Groups:**
- `storage_projection` - Storage over time by user count
- `decay_calculation` - Core decay math
- `user_scale` - Different user scales
- `storage_requirements` - Profile fit checks

**Activity Model (from PROJECTIONS.md):**

```
Posts per user per day: 0.3
Text-only: 78% (1 KB avg)
Images: 20% (500 KB avg)
Video: 2% (5 MB avg)
Decay half-life: 30 days
```

**Storage Projections:**

| Users | Daily Growth | Steady State (30 days) |
|-------|--------------|------------------------|
| 12 | 0.4 MB | 17 MB |
| 100 | 3.1 MB | 134 MB |
| 500 | 15 MB | 670 MB |
| 1,000 | 31 MB | 1.3 GB |

## Analysis

### PoW Feasibility

The mobile PoW configuration uses reduced parallelism (p=2) to manage heat and battery on mobile devices. The key finding is that SPEC_03 default difficulties are infeasible:

```
Hash time: ~100ms (mobile config)
Expected attempts: 2^difficulty

Difficulty 8:  2^8  = 256 attempts × 100ms = 25.6 seconds ✓
Difficulty 10: 2^10 = 1024 attempts × 100ms = 102.4 seconds ⚠
Difficulty 16: 2^16 = 65,536 attempts × 100ms = 109 minutes ✗
Difficulty 20: 2^20 = 1M attempts × 100ms = 29 hours ✗
```

**Recommendation**: Use difficulty 8-10 for mobile clients.

### Sync Viability

Even on 3G networks, header sync is viable:

- 10,000 headers (initial sync): 8 seconds on 3G
- 100,000 headers (full chain): 80 seconds on 3G

Header-only sync saves significant bandwidth:
- Full sync (headers + content): ~7 MB for 10K posts
- Header-only sync: ~2 MB for 10K headers
- Savings: 71%

### Storage Viability

The decay mechanism is essential for mobile storage viability:

Without decay (linear growth):
- 100 users × 0.3 posts/day × 100 KB avg = 3 MB/day
- After 1 year: 1.1 GB just for 100 users

With decay (30-day half-life):
- Steady state: ~134 MB for 100 users
- Easily fits in Budget 1GB profile

## Comparison with Desktop

| Metric | Mobile | Desktop | Ratio |
|--------|--------|---------|-------|
| PoW parallelism | 2 | 4 | 0.5x |
| Hash time | 100ms | 110ms | ~same |
| Cache size | 1-10 GB | 100 GB+ | 0.01-0.1x |
| Bandwidth | 2-50 Mbps | 100+ Mbps | 0.02-0.5x |

Mobile users can participate fully but with adjusted expectations:
- Posting takes ~26 seconds instead of ~27 seconds (negligible difference)
- Sync takes longer on cellular but is still reasonable
- Storage is bounded by decay, fitting mobile cache sizes

## Criterion Reports

After running benchmarks, HTML reports are generated in:

```
target/criterion/mobile_pow/report/
target/criterion/mobile_sync/report/
target/criterion/mobile_storage/report/
```

Open `index.html` in each directory for detailed graphs and statistics.
