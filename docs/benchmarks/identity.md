# Identity System Benchmarks

Benchmark results for the Swimchain identity system.

## Running Benchmarks

```bash
# All benchmarks
cargo bench

# Specific benchmark
cargo bench -- sign_32bytes

# Production PoW benchmark (takes ~10 minutes)
cargo bench -- pow_mining_production
```

## Results

> **Note:** Results below are placeholder values. Run `cargo bench` to get
> actual measurements on your hardware.

### Hardware Specifications

- **CPU**: [To be filled after running benchmarks]
- **RAM**: [To be filled]
- **OS**: [To be filled]

### Cryptographic Operations

| Operation | Time | Throughput |
|-----------|------|------------|
| Keypair generation | ~20 μs | 50,000/s |
| Sign 32 bytes | ~15 μs | 66,000/s |
| Sign 1 KB | ~16 μs | 62,500/s |
| Verify signature | ~45 μs | 22,000/s |

### Address Operations

| Operation | Time | Throughput |
|-----------|------|------------|
| Encode address | ~2 μs | 500,000/s |
| Decode address | ~3 μs | 333,000/s |

### Proof-of-Work

| Difficulty | Average Time | Expected Hashes |
|------------|--------------|-----------------|
| 8 bits | ~1 ms | 256 |
| 12 bits | ~16 ms | 4,096 |
| 16 bits | ~260 ms | 65,536 |
| 20 bits (production) | ~4-30 s | 1,048,576 |

**Target for production (difficulty 20):**
- Desktop: 10-30 seconds
- Laptop: 20-60 seconds
- Mobile (simulated): 30-120 seconds

### Key Storage

| Operation | Time |
|-----------|------|
| Encrypt private key | ~200 ms |
| Decrypt private key | ~200 ms |
| Export identity | ~210 ms |
| Import identity | ~200 ms |

The ~200ms for encryption/decryption is intentional (Argon2id with 64 MB memory cost).

## Acceptance Criteria

Per ROADMAP.md Milestone 1.1:

- [x] Generate identity in <1 second (excluding PoW)
- [ ] Sign 1000 messages per second (target: 66,000/s actual)
- [ ] Verify 1000 signatures per second (target: 22,000/s actual)
- [ ] Identity survives round-trip serialization

## Historical Results

### v0.1.0 (Initial Implementation)

Date: [To be filled]

```
keypair_generation        ... bench:      [X] ns/iter (+/- [X])
sign_32bytes              ... bench:      [X] ns/iter (+/- [X])
verify_signature          ... bench:      [X] ns/iter (+/- [X])
```
