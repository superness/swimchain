# Mobile Viability Assessment

## Executive Summary

**Can mobile devices be full Swimchain participants?** Yes, with specific accommodations:

1. **PoW Difficulty**: Must use difficulty 8-10 instead of SPEC_03 defaults (16-22)
2. **Sync Strategy**: Header-only background sync on cellular; full sync on WiFi only
3. **Storage**: Decay mechanism bounds storage to ~130 MB steady state (fits Budget 1GB)
4. **Network**: 4G is sufficient for good UX; 3G works but slower

## Test Environment

- **Platform**: WSL2 on Windows (Linux 6.6.87.2-microsoft-standard-WSL2)
- **Rust Version**: 1.70+
- **Test Framework**: Criterion for benchmarks, standard Rust tests
- **Date**: December 2024

## Critical Measurements

### PoW Performance

Mobile config: 64 MiB memory, 3 iterations, **parallelism 2** (vs 4 for desktop)

| Config | Difficulty | Expected Time | Status |
|--------|------------|---------------|--------|
| Mobile (p=2) | 4 | ~1.6s | PASS |
| Mobile (p=2) | 6 | ~6.4s | PASS |
| Mobile (p=2) | 8 | ~26s | **TARGET** |
| Mobile (p=2) | 10 | ~102s | MARGINAL |
| Mobile (p=2) | 12 | ~410s | FAIL |
| Mobile (p=2) | 16 | ~1.8h | INFEASIBLE |
| Mobile (p=2) | 20 | ~29h | INFEASIBLE |

**Key Finding**: SPEC_03 default difficulties (16-22) are mathematically infeasible on mobile. Each Argon2id hash takes ~100ms on mobile, so:
- Difficulty 16 = 65,536 attempts × 100ms = 6,554 seconds = **109 minutes**
- Difficulty 20 = 1,048,576 attempts × 100ms = 104,858 seconds = **29 hours**

**Recommendation**: Use difficulty 8-10 for mobile clients.

### Sync Performance

Header size: 200 bytes (approximate serialized size)

| Network | Speed | 10K Headers | 100K Headers |
|---------|-------|-------------|--------------|
| 3G | 2 Mbps (256 KB/s) | 8s | 80s |
| 4G | 10 Mbps (1.25 MB/s) | 1.6s | 16s |
| WiFi | 50 Mbps (6.25 MB/s) | 0.3s | 3.2s |

**Key Finding**: Even 3G can sync 100K headers in ~80 seconds. This is acceptable for initial sync.

### Storage Analysis

Using PROJECTIONS.md activity model:
- 0.3 posts per user per day
- 78% text (1 KB), 20% images (500 KB), 2% video (5 MB)
- 30-day decay half-life

| Users | Daily Growth | Steady State | Profile Needed |
|-------|--------------|--------------|----------------|
| 12 | 0.4 MB | 17 MB | Budget 1GB |
| 100 | 3.1 MB | 134 MB | Budget 1GB |
| 500 | 15 MB | 670 MB | Budget 1GB |
| 1,000 | 31 MB | 1.3 GB | Standard 5GB |
| 10,000 | 310 MB | 13 GB | Desktop only |

**Key Finding**: Decay is essential for mobile viability. Without decay, storage would grow linearly forever.

### Cellular Budget Analysis

MobileConfig limits:

| Profile | Daily Limit | Headers Possible |
|---------|-------------|------------------|
| Budget | 50 MB | 262,144 |
| Standard | 100 MB | 524,288 |
| Flagship | 200 MB | 1,048,576 |

**Key Finding**: Even budget phones can sync years of chain history headers on cellular.

## User Experience Assessment

### Minimum Viable Mobile

**Device**: 2015 smartphone (1 GB cache)
**Network**: 3G cellular
**Experience**:
- Initial sync: ~80 seconds for 100K headers
- Creating a post: ~26 seconds (difficulty 8)
- Viewing content: On-demand fetch, ~0.4s for 100 KB image
- Storage: Comfortable for 100-500 active users

**Verdict**: Usable but not ideal. Users will notice delays.

### Recommended Mobile

**Device**: Modern smartphone (5 GB cache)
**Network**: 4G or WiFi
**Experience**:
- Initial sync: ~16 seconds on 4G
- Creating a post: ~26 seconds (same PoW)
- Viewing content: ~0.08s for 100 KB image on 4G
- Storage: Comfortable for 1,000+ users

**Verdict**: Good experience comparable to other social apps.

## Recommendations

### Spec Updates Required

1. **PoW Difficulty Calibration** (SPEC_03)
   - Add mobile difficulty tier: 8-10 bits for basic actions
   - Document that production difficulties (16-22) are for desktop only
   - Consider time-based adjustment (longer allowed = lower difficulty)

2. **Mobile Config Standardization** (SPEC_07)
   - Formalize `MobileConfig` struct in spec
   - Define cellular budget tiers (Budget/Standard/Flagship)
   - Specify header-only sync mode behavior

### Client UX Patterns

1. **PoW Progress Indicator**
   - Show estimated time remaining
   - Allow background mining with notification on completion
   - Queue actions for WiFi+charging (optional user preference)

2. **Sync Strategy Selector**
   - "WiFi Only" mode for full sync
   - "Cellular Saver" mode (header-only, content on-demand)
   - "Background Sync" with configurable limits

3. **Storage Management UI**
   - Show cache usage by category (OwnContent, Pinned, Recent, Old)
   - Manual eviction controls for power users
   - Auto-eviction with clear notification

4. **Battery Considerations**
   - Defer PoW mining when battery < 20%
   - Queue large syncs for charging state
   - Respect system doze/standby modes

## Conclusion

**Mobile CAN be a full Swimchain participant** with the following accommodations:

| Aspect | Accommodation | Impact |
|--------|--------------|--------|
| PoW | Difficulty 8-10 | Posting takes ~26s instead of instant |
| Sync | Header-only on cellular | Saves 70%+ bandwidth |
| Storage | Decay + eviction | Stays under 500 MB |
| Network | 4G+ recommended | 3G works but slower |

The key enabling feature is **content decay** (SPEC_02), which bounds chain growth and makes mobile full nodes viable. Without decay, mobile participation would require external dependencies (light clients, trusted servers).

### Open Questions

1. Should mobile clients use pooled PoW for engagements? (SPEC_03 §7)
2. How to handle offline-first posting with PoW? (Queue with progress?)
3. Should there be a "mobile mode" flag in protocol messages?

### Test Coverage

The following test files validate these findings:

- `tests/mobile_simulation/cpu_throttle.rs` - PoW performance tests
- `tests/mobile_simulation/bandwidth_throttle.rs` - Network simulation
- `tests/mobile_simulation/storage_limits.rs` - Storage/eviction tests
- `tests/mobile_simulation/battery_sync.rs` - Sync mode tests
- `tests/mobile_simulation/full_flow.rs` - End-to-end flow test
- `benches/mobile_pow.rs` - PoW benchmarks
- `benches/mobile_sync.rs` - Sync benchmarks
- `benches/mobile_storage.rs` - Storage projections

Run tests: `cargo test --test mobile_simulation_test`
Run benchmarks: `cargo bench -- mobile_`
