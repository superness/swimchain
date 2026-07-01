# Poster Reputation System

This document describes the poster reputation system implemented in `src/reputation/` per SPEC_12 Sections 3.4 and 4.5.

## Overview

The reputation system tracks each identity's posting history and abuse signals. It provides:

1. **Reputation Score**: A calculated value that reflects trustworthiness
2. **Reputation Effects**: Rate limits and decay modifiers based on score thresholds
3. **Decay on Attestations**: Negative impact from spam flags
4. **Recovery Over Time**: Path back from bad behavior
5. **Fast Recovery**: Immediate points when spam flags are counter-attested

## Score Calculation

The reputation score is calculated using the following formula:

```
score = base + age_bonus + quality_bonus + counter_success_bonus + counter_bonus
        + recovery_bonus + fast_recovery
        - spam_penalty - attester_penalty - illegal_penalty
```

### Component Weights

| Component | Formula | Description |
|-----------|---------|-------------|
| **base** | 100 | Every identity starts here |
| **age_bonus** | +1/day, max 365 | Longevity indicates good behavior |
| **quality_bonus** | +5 per attestation | Positive signals from community |
| **counter_success_bonus** | +3 per counter | Reward for defending false positives |
| **counter_bonus** | +15 per flag countered | Vindication when your flags cleared |
| **recovery_bonus** | +1/day, max 90 | Time-based rehabilitation |
| **fast_recovery** | +10 per counter | Immediate recovery for countered flags |
| **spam_penalty** | -20 per flag | Cost of spam accusations |
| **attester_penalty** | -30 per counter | Punishment for bad-faith attestations |
| **illegal_penalty** | -1000 per flag | Devastating for illegal content |

### Score Example

```rust
// Example from SPEC_12 §11.3
let mut rep = PosterReputation::new(identity);
rep.identity_age_days = 100;
rep.spam_flags_received = 2;
rep.spam_flags_countered = 1;
rep.quality_attestations = 5;
rep.counter_attestation_successes = 2;
let days_since_flag = 30;

// Score calculation:
// base = 100
// age_bonus = 100 (min(100, 365))
// quality_bonus = 25 (5 * 5)
// counter_success_bonus = 6 (2 * 3)
// counter_bonus = 15 (1 * 15)
// fast_recovery = 10 (1 * 10)
// recovery_bonus = 30 (min(30, 90))
// spam_penalty = 40 (2 * 20)
// score = 100 + 100 + 25 + 6 + 15 + 10 + 30 - 40 = 246 (Trusted)
```

## Reputation Effects

Based on score thresholds, identities receive different treatment:

| Score Range | Effect | Description |
|-------------|--------|-------------|
| > 200 | **Trusted** | Content decays 1.5x slower |
| 100-200 | **Normal** | Standard treatment |
| 50-100 | **Watched** | Rate limits reduced 50% |
| 0-50 | **Restricted** | Rate limits reduced 80%, new space posting blocked |
| < 0 | **Untrusted** | All content starts with accelerated decay |

### Effect Details

```rust
pub enum ReputationEffect {
    Trusted,    // 🛡️ decay_multiplier: 1.5, rate_limit: 100%
    Normal,     // ✓  decay_multiplier: 1.0, rate_limit: 100%
    Watched,    // ⚠️  decay_multiplier: 1.0, rate_limit: 50%
    Restricted, // 🚫 decay_multiplier: 1.0, rate_limit: 20%, blocks new spaces
    Untrusted,  // ⛔ decay_multiplier: 0.25 (4x faster), rate_limit: 10%
}
```

## API Usage

### Creating and Storing Reputation

```rust
use swimchain::reputation::{PosterReputation, ReputationStore};

// Open store
let db = sled::open("./data/reputation").unwrap();
let store = ReputationStore::open(db);

// Create or get reputation
let rep = store.get_or_create(&identity)?;

// Record events
store.record_spam_flag(&identity, timestamp)?;
store.record_counter(&identity, timestamp)?;
store.record_quality_attestation(&identity)?;

// Check score
let score = store.get_score(&identity)?;
let is_restricted = store.is_below_threshold(&identity, 50)?;
```

### Calculating Rate Limits

```rust
use swimchain::reputation::{calculate_rate_limit, get_reputation_effect};

// Base limit: 50 posts/day
let effective_limit = calculate_rate_limit(50, score);

// For Watched (score 75): 50 * 0.5 = 25 posts/day
// For Restricted (score 25): 50 * 0.2 = 10 posts/day
// For Untrusted (score -10): 50 * 0.1 = 5 posts/day
```

### Getting Decay Multiplier

```rust
use swimchain::reputation::calculate_decay_multiplier;

let multiplier = calculate_decay_multiplier(score);

// For Trusted (score 250): 1.5x slower decay
// For Normal (score 150): 1.0x normal decay
// For Untrusted (score -50): 0.25x (4x faster decay)
```

## Recovery Mechanics

### Standard Recovery

After receiving a spam flag, reputation recovers at +1 point/day:

```
Day 0:  Receive spam flag, score drops 20 points
Day 1:  +1 recovery
Day 2:  +1 recovery
...
Day 90: +1 recovery (capped)
```

### Fast Recovery

When a spam flag is counter-attested, immediate recovery occurs:

```
Initial: Score 200
After spam flag: Score 180 (-20)
After counter-attestation: Score 205 (+15 counter + +10 fast recovery)
```

This means a wrongly flagged user can recover most of their reputation immediately when the flag is cleared.

## Module Structure

```
src/reputation/
├── mod.rs      # Module exports and documentation
├── error.rs    # ReputationError types
├── types.rs    # PosterReputation, ReputationSummary
├── score.rs    # Score calculation, ReputationEffect
└── storage.rs  # ReputationStore (sled-backed)
```

## Constants

```rust
// Score calculation
pub const REPUTATION_BASE_SCORE: i32 = 100;
pub const REPUTATION_RECOVERY_PER_DAY: i32 = 1;
pub const REPUTATION_RECOVERY_MAX_DAYS: i32 = 90;
pub const REPUTATION_FAST_RECOVERY_PER_COUNTER: i32 = 10;

// Thresholds
pub const REPUTATION_TRUSTED_THRESHOLD: i32 = 200;
pub const REPUTATION_NORMAL_THRESHOLD: i32 = 100;
pub const REPUTATION_WATCHED_THRESHOLD: i32 = 50;
pub const REPUTATION_RESTRICTED_THRESHOLD: i32 = 0;
pub const REPUTATION_MIN_SCORE: i32 = -1000;
```

## Integration Points

The reputation system integrates with:

1. **Content Decay (SPEC_02)**: Trusted users get slower decay, Untrusted get faster
2. **Rate Limiting (API Layer)**: Post/engagement limits based on reputation
3. **Space Creation (CLI)**: Restricted/Untrusted cannot create new spaces
4. **Profile Display**: ReputationSummary provides badge and effect name
5. **Spam Attestation (SPEC_12)**: Flags and counters update reputation

## Test Coverage

The implementation includes tests for:

- Base score calculation
- Age bonus (with cap at 365)
- All penalty and bonus types
- Recovery mechanics (standard and fast)
- Score thresholds and effects
- Storage operations
- SPEC_12 test vector (§11.3)

## References

- SPEC_12 Section 3.4: PosterReputation data structure
- SPEC_12 Section 4.5: Reputation score calculation
- SPEC_12 Section 6.4: Reputation effect thresholds
- SPEC_12 Section 14: Constants summary
