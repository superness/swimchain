# Proof of Work System

Swimchain uses two distinct PoW systems for different purposes:

## Overview

| System | Algorithm | Purpose | Memory | Frequency |
|--------|-----------|---------|--------|-----------|
| Identity PoW | SHA-256 | One-time identity creation | Not memory-hard | Once per identity |
| Action PoW | Argon2id | Every action (post, reply, etc.) | 64 MiB memory-hard | Per action |

## Identity PoW (SPEC_01)

- **Algorithm:** SHA-256
- **Purpose:** One-time identity creation
- **Difficulty:** 20 bits (~10-30 seconds)
- **Memory:** Not memory-hard
- **Implementation:** `src/crypto/pow.rs`

Identity PoW runs only once when creating a new identity. It uses SHA-256 because:
1. Single-use doesn't justify memory-hard protection
2. SHA-256 is well-understood and widely implemented
3. Faster verification for identity validation

## Action PoW (SPEC_03)

- **Algorithm:** Argon2id (RFC 9106)
- **Purpose:** Every action (post, reply, engage)
- **Implementation:** `src/crypto/action_pow.rs`

### Argon2id Parameters

| Configuration | Memory | Iterations | Parallelism | Use Case |
|---------------|--------|------------|-------------|----------|
| Production | 64 MiB | 3 | 4 | Desktop clients |
| Mobile | 64 MiB | 3 | 2 | Mobile devices |
| Test | 1 MiB | 1 | 1 | Unit tests only |

### Difficulty Tiers (SPEC_03 §6.4)

| Action Type | Difficulty | Expected Time* |
|-------------|------------|----------------|
| Space Creation | 22 bits | ~60 seconds* |
| Post | 20 bits | ~30 seconds* |
| Reply | 18 bits | ~15 seconds* |
| Engage | 16 bits | ~5-60 seconds (pooled)* |
| Identity Update | 20 bits | ~30 seconds* |

**⚠️ CRITICAL: Difficulty Calibration Issue**

The "Expected Time" values above are from SPEC_03 but are **mathematically infeasible**
with Argon2id at production parameters. See the [Difficulty Calibration Issue](#difficulty-calibration-issue)
section below for detailed analysis and proposed resolutions.

## Why Two Systems?

The key insight is frequency of use:

1. **Identity PoW (SHA-256)**: Runs once per identity creation. The low frequency
   doesn't justify the complexity and resource cost of memory-hard PoW.

2. **Action PoW (Argon2id)**: Runs for every action. Memory-hardness prevents
   ASIC optimization for bulk spam, ensuring fair cost across all hardware.

## Verification Time

**Important:** Action PoW verification is NOT instant.

- Single Argon2id hash: ~50-200ms (production params)
- This is acceptable because:
  1. It's constant-time (one hash regardless of difficulty)
  2. It's much faster than mining (which requires many attempts)
  3. Nodes can rate-limit verification attempts

Note: The ROADMAP incorrectly states "Verification is instant (<1ms)".
SPEC_03 §4.5 clearly requires recomputing the Argon2id hash for verification.

## Challenge Structure

Per SPEC_03 §4.2, challenges are 82 bytes:

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | action_type |
| 1 | 32 | content_hash (SHA-256) |
| 33 | 32 | author_id (public key) |
| 65 | 8 | timestamp (big-endian) |
| 73 | 1 | difficulty |
| 74 | 8 | nonce_space |

Note: The spec text says "75 bytes" but the offset table totals to 82 bytes.
We implement 82 bytes as the offset table is more precise.

## Content Binding (SPEC_03 §6.3)

PoW is bound to specific content and author:

1. `content_hash` = SHA-256 of the action content
2. `author_id` = author's public key

This prevents:
- Reusing PoW for different content
- Impersonating another author
- Pre-mining PoW without knowing the content

## Challenge Expiry (SPEC_03 §6.1)

- **Validity window:** 10 minutes (600 seconds)
- **Future tolerance:** 1 minute (for clock drift)

Expired challenges are rejected to prevent:
- Stockpiling pre-computed PoW
- Replay attacks with old solutions

## Mobile Considerations (SPEC_03 §10.2)

For mobile devices:

1. Use `parallelism=2` (instead of 4) to manage heat
2. Expect 2x duration for same difficulty
3. Support background computation during charging
4. Pause computation when battery < 20%

## ASIC Resistance (SPEC_03 §9.3)

Minimum memory floor: 32 MiB

Production uses 64 MiB, but forks MUST NOT go below 32 MiB or they lose
ASIC resistance properties. The `ForkPoWConfig::validate()` method enforces
this minimum.

## Usage Example

```rust
use swimchain::crypto::{
    ActionType, PoWChallenge, ForkPoWConfig,
    compute_pow, verify_pow, sha256, current_timestamp,
};

// Create a challenge
let config = ForkPoWConfig::production();
let challenge = PoWChallenge::generate(
    ActionType::Post,
    b"Hello, world!",
    &author_pubkey,
    config.get_difficulty(ActionType::Post),
);

// Mine a solution
let solution = compute_pow(&challenge, &config)?;

// Verify it (on receiving node)
verify_pow(&solution, &config, current_timestamp())?;
```

## Difficulty Calibration Issue

**Status:** Unresolved - Requires specification update

### The Problem

The ROADMAP acceptance criterion states "Post PoW completes in 10-60 seconds" and SPEC_03
defines POST difficulty as 20 bits. However, these targets are **mathematically impossible**
with Argon2id at production parameters.

### Mathematical Analysis

Benchmark data (run 2025-12-25):
- Production Argon2id hash time: ~110ms per hash
- Mobile Argon2id hash time: ~100ms per hash

Expected mining times at production parameters:

| Difficulty | Expected Attempts | Expected Time | Status |
|------------|-------------------|---------------|--------|
| 4 bits | 16 | ~1.8 seconds | Feasible |
| 8 bits | 256 | ~28 seconds | **Within target** |
| 10 bits | 1,024 | ~112 seconds | Feasible |
| 12 bits | 4,096 | ~7.5 minutes | Long but acceptable |
| 16 bits (ENGAGE) | 65,536 | ~2 hours | **Infeasible** |
| 18 bits (REPLY) | 262,144 | ~8 hours | **Infeasible** |
| 20 bits (POST) | 1,048,576 | ~32 hours | **Infeasible** |
| 22 bits (SPACE) | 4,194,304 | ~5.3 days | **Infeasible** |

### Root Cause

SPEC_03 was likely written assuming much faster hash times (perhaps ~1ms, implying
SHA-256 or minimal Argon2id parameters). However, the spec explicitly requires:
- 64 MiB memory (memory-hardness for ASIC resistance)
- 3 iterations
- Parallelism 4

These parameters result in ~100-150ms per hash, making high difficulties impractical.

### Proposed Resolutions

**Option 1: Reduce Difficulty Targets**

Adjust difficulties to achieve target times with actual hash speeds:

| Action Type | Original | Revised | Expected Time |
|-------------|----------|---------|---------------|
| Space Creation | 22 | 10-12 | ~1.5-7 minutes |
| Post | 20 | 8-10 | ~28-112 seconds |
| Reply | 18 | 6-8 | ~7-28 seconds |
| Engage | 16 | 4-6 | ~1.8-7 seconds |
| Identity Update | 20 | 8-10 | ~28-112 seconds |

**Option 2: Accept Longer Times**

The friction goal (making users pause before posting) may be achieved with even
longer waits. A 5-minute post delay could be more effective than 30 seconds.

**Option 3: Hybrid Approach**

- Use lower difficulties (8-12 bits) for immediate posting
- Offer "premium priority" with higher difficulties for users willing to wait
- Time-based mining with progress UI showing estimated completion

**Option 4: Revise Argon2id Parameters**

Reduce memory/iterations for faster hashing, but this compromises ASIC resistance.
NOT recommended as it defeats the purpose of memory-hard PoW.

### Recommendation

Adopt **Option 1** (Reduce Difficulty Targets) and update SPEC_03 accordingly.
The difficulty constants in `src/crypto/action_pow.rs` should be updated once
the specification is revised.

Current implementation uses SPEC_03 values as written, awaiting specification update.

## See Also

- [Benchmark Results](benchmarks/pow.md)
- [Identity System](identity-system.md)
- `specs/SPEC_01_IDENTITY.md` - Identity PoW specification
- `specs/SPEC_03_PROOF_OF_WORK.md` - Action PoW specification
