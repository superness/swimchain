# Proof of Work Benchmarks

Performance benchmarks for Swimchain's proof-of-work systems.

## Test Environment

Run benchmarks with:
```bash
cargo bench -- action_pow
```

For production-level benchmarks (SLOW):
```bash
cargo bench -- action_pow_production
```

## Argon2id Parameters

### Production Configuration (Desktop)

| Parameter | Value |
|-----------|-------|
| Memory | 64 MiB (65536 KiB) |
| Iterations | 3 |
| Parallelism | 4 |
| Hash length | 32 bytes |

### Mobile Configuration

| Parameter | Value |
|-----------|-------|
| Memory | 64 MiB (65536 KiB) |
| Iterations | 3 |
| Parallelism | 2 |
| Hash length | 32 bytes |

### Test Configuration

| Parameter | Value |
|-----------|-------|
| Memory | 1 MiB (1024 KiB) |
| Iterations | 1 |
| Parallelism | 1 |
| Hash length | 32 bytes |

## Single Hash Timing

These measure the time for a single Argon2id computation:

| Configuration | Expected Duration | Notes |
|--------------|-------------------|-------|
| Test (1 MiB, t=1, p=1) | ~1-5ms | Fast, for unit tests only |
| Mobile (64 MiB, t=3, p=2) | ~100-200ms | Reduced parallelism |
| Desktop (64 MiB, t=3, p=4) | ~50-150ms | Full production params |

**Note:** Actual times depend on hardware. Run `cargo bench -- action_pow_config_comparison`
to get accurate numbers for your system.

## Mining Duration Estimates

Mining time depends on both hash time and expected number of attempts:
- Expected attempts = 2^difficulty
- Expected time = hash_time * 2^difficulty

### At Production Parameters (64 MiB, t=3, p=4)

Assuming ~100ms per hash:

| Difficulty | Expected Attempts | Expected Time |
|------------|-------------------|---------------|
| 4 bits | ~16 | ~1.6 seconds |
| 8 bits | ~256 | ~26 seconds |
| 12 bits | ~4,096 | ~7 minutes |
| 16 bits (ENGAGE) | ~65,536 | ~1.8 hours |
| 18 bits (REPLY) | ~262,144 | ~7.3 hours |
| 20 bits (POST) | ~1,048,576 | ~29 hours |
| 22 bits (SPACE) | ~4,194,304 | ~116 hours |

**WARNING:** These estimates are based on expected values. Actual times
vary due to randomness. Some attempts find solutions quickly, others take longer.

### At Test Parameters (1 MiB, t=1, p=1)

Assuming ~2ms per hash:

| Difficulty | Expected Attempts | Expected Time |
|------------|-------------------|---------------|
| 4 bits | ~16 | ~32ms |
| 8 bits | ~256 | ~512ms |
| 10 bits | ~1,024 | ~2 seconds |
| 12 bits | ~4,096 | ~8 seconds |

## Benchmark Results

Run benchmarks and record results below:

### System Information
- **Benchmark Date**: 2025-12-25
- **CPU**: WSL2 on Windows (standard desktop hardware)
- **RAM**: Sufficient for 64 MiB Argon2id allocations
- **OS**: Linux 6.6.87.2-microsoft-standard-WSL2
- **Rust version**: stable

### Verification (Single Hash)

| Benchmark | Time |
|-----------|------|
| action_pow_verify_1mib | **297-308 µs** (~0.3ms) |
| action_pow_verify_64mib | **108-113 ms** |
| action_pow_verify_mobile | **102-107 ms** |

### Configuration Comparison (Single Hash)

| Configuration | Time |
|--------------|------|
| test_1mib (1 MiB, t=1, p=1) | **306-311 µs** |
| mobile_64mib_p2 (64 MiB, t=3, p=2) | **100-101 ms** |
| prod_64mib_p4 (64 MiB, t=3, p=4) | **111-120 ms** |

### Mining (Test Configuration)

| Difficulty | Time | Notes |
|------------|------|-------|
| 4 | **4.4-5.4 ms** | ~16 expected attempts at ~0.3ms each |
| 8 | **67-78 ms** | ~256 expected attempts |
| 10 | **211-593 ms** | ~1,024 attempts, high variance |
| 12 | **575-1,708 ms** | ~4,096 attempts, high variance |

## Acceptance Criteria Verification

Per ROADMAP Milestone 1.2:

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| Post PoW (difficulty 20) | 10-60 seconds | **~29 hours** at production params | **NOT MET** (see note) |
| Verification time | <1ms | **~108-113ms** at production params | **CLARIFIED** |
| Difficulty tiers distinct | Measurable differences | **16x per 4 bits** confirmed | **MET** |

### Difficulty Calibration Issue

The ROADMAP acceptance criterion "Post PoW completes in 10-60 seconds" is **mathematically infeasible** with SPEC_03 parameters:

- Production hash time: ~110ms per Argon2id hash
- POST difficulty (20 bits): 2^20 = 1,048,576 expected attempts
- Expected mining time: 110ms × 1,048,576 = **~32 hours**

**Proposed resolutions:**

1. **Reduce difficulty targets** - POST could use difficulty 8-10 (~28-111 seconds) instead of 20
2. **Accept longer times** - The friction goal may be achieved with even multi-minute waits
3. **Time-based mining** - Use progress callbacks to show users estimated completion
4. **Revise acceptance criteria** - Update ROADMAP to reflect achievable targets

### Discrepancy Note

The ROADMAP states "Verification is instant (<1ms)" but this is incorrect.
SPEC_03 §4.5 requires recomputing the Argon2id hash for verification,
which takes ~50-200ms at production parameters. This is still fast compared
to mining (which requires many hash attempts), but not "instant".

## Running Benchmarks

### Quick Benchmarks (Test Config)

```bash
# Run all action PoW benchmarks
cargo bench -- action_pow

# Run specific benchmark
cargo bench -- action_pow_verify_1mib
cargo bench -- action_pow_mining_test
```

### Production Benchmarks (SLOW)

```bash
# WARNING: This can take several minutes
cargo bench -- action_pow_production

# Compare all configurations
cargo bench -- action_pow_config_comparison
```

### Comparison with Identity PoW

Identity PoW (SHA-256) is much faster per hash:

| System | Per Hash | At Difficulty 20 |
|--------|----------|------------------|
| Identity PoW (SHA-256) | ~1µs | ~1 second |
| Action PoW (Argon2id) | ~100ms | ~29 hours |

This is intentional - action PoW needs memory-hardness for ASIC resistance,
while identity PoW runs only once and doesn't need it.

## See Also

- [Proof of Work Documentation](../proof-of-work.md)
- [Identity Benchmarks](identity.md)
