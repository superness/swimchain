# Contribution Benefits System

**SPEC Reference:** SPEC_09 Social Layer, Section 4: Contribution Benefits

## Overview

The Contribution Benefits system rewards network participants with non-economic benefits based on their swimmer level. These benefits are:

- **Non-transferable**: Tied to your identity, not tradeable
- **Earned**: Based on actual contribution, not purchased
- **Progressive**: Higher levels unlock greater benefits

## Philosophy (§4.1)

Benefits are designed to:
1. Reward those who keep the network running
2. Create positive incentives for contribution
3. Maintain Sybil resistance (splitting resources provides no advantage)
4. Avoid economic speculation (no tokens, no market)

## Benefits by Level

| Level | PoW Reduction | Decay Multiplier | Space Creation | Sync Priority |
|-------|---------------|------------------|----------------|---------------|
| NewSwimmer | 0% | 1.0x | No | Normal |
| Regular | 0% | 1.0x | No | Normal |
| Resident | 10% | 1.2x | **Yes** | Normal |
| Lifeguard | 20% | 1.5x | Yes | Above Normal |
| Anchor | 35% | 1.8x | Yes | High |
| PoolKeeper | 50% | 2.0x | Yes | **Highest** |

## PoW Reduction (§4.3)

Higher-level contributors earn reduced proof-of-work difficulty for content creation:

```rust
use swimchain::benefits::adjusted_difficulty;
use swimchain::level::SwimmerLevel;

// Base difficulty for a post is 20
let base = 20;

// PoolKeeper gets 50% reduction
let reduced = adjusted_difficulty(base, SwimmerLevel::PoolKeeper);
assert_eq!(reduced, 10);  // 50% of 20 = 10

// NewSwimmer gets no reduction
let reduced = adjusted_difficulty(base, SwimmerLevel::NewSwimmer);
assert_eq!(reduced, 20);  // No change
```

### How It Works

1. Get base difficulty from `ForkPoWConfig::get_difficulty(action_type)`
2. Look up reduction percentage from `POW_REDUCTION_PERCENT[level]`
3. Calculate: `reduced = base * (100 - reduction) / 100`
4. Clamp to minimum 1 (difficulty cannot be 0)

### Reduction Schedule

| Level | Reduction | 20-bit base | 22-bit base |
|-------|-----------|-------------|-------------|
| NewSwimmer | 0% | 20 | 22 |
| Regular | 0% | 20 | 22 |
| Resident | 10% | 18 | 20 |
| Lifeguard | 20% | 16 | 18 |
| Anchor | 35% | 13 | 14 |
| PoolKeeper | 50% | 10 | 11 |

## Decay Extension (§4.4)

Content from higher-level contributors lasts longer before decaying:

```rust
use swimchain::benefits::decay_multiplier;
use swimchain::level::SwimmerLevel;

// Base half-life is 7 days (604800 seconds)
let base_half_life = 604800;

// PoolKeeper content lasts twice as long
let mult = decay_multiplier(SwimmerLevel::PoolKeeper);
let effective = (base_half_life as f64 * mult as f64) as u64;
assert_eq!(effective, 1209600);  // 14 days
```

### Effective Half-Lives

| Level | Multiplier | Effective Half-Life |
|-------|------------|---------------------|
| NewSwimmer | 1.0x | 7 days |
| Regular | 1.0x | 7 days |
| Resident | 1.2x | 8.4 days |
| Lifeguard | 1.5x | 10.5 days |
| Anchor | 1.8x | 12.6 days |
| PoolKeeper | 2.0x | 14 days |

## Space Creation Rights (§4.5)

Only Residents and above can create spaces:

```rust
use swimchain::benefits::{can_create_space, MIN_LEVEL_FOR_SPACE_CREATION};
use swimchain::level::SwimmerLevel;

// New users cannot create spaces
assert!(!can_create_space(SwimmerLevel::NewSwimmer));
assert!(!can_create_space(SwimmerLevel::Regular));

// Residents and above can
assert!(can_create_space(SwimmerLevel::Resident));
assert!(can_create_space(SwimmerLevel::PoolKeeper));
```

### Rationale

Space creation requires:
- PoW cost (anti-spam)
- Demonstrated commitment (anti-Sybil)

By requiring Resident level (30+ days active, 10GB+ lifetime bandwidth, 50%+ uptime), we ensure space creators have invested real resources in the network.

## Sync Priority (§4.6)

Under network load, high-level contributors get faster sync:

```rust
use swimchain::benefits::{sync_priority, Priority};
use swimchain::level::SwimmerLevel;

assert_eq!(sync_priority(SwimmerLevel::PoolKeeper), Priority::Highest);
assert_eq!(sync_priority(SwimmerLevel::Anchor), Priority::High);
assert_eq!(sync_priority(SwimmerLevel::Lifeguard), Priority::AboveNormal);
assert_eq!(sync_priority(SwimmerLevel::Resident), Priority::Normal);
```

### How It Works

1. Under light load (<50 pending requests): FIFO ordering
2. Under heavy load (≥50 pending): Priority ordering
3. Within same priority: FIFO maintained

### Priority Levels

| Priority | Levels |
|----------|--------|
| Highest | PoolKeeper |
| High | Anchor |
| AboveNormal | Lifeguard |
| Normal | Resident, Regular, NewSwimmer |

## Integration Points

### With PoW System

Use `PoWChallenge::generate_with_level()` for level-aware PoW:

```rust
use swimchain::crypto::action_pow::{ActionType, PoWChallenge, ForkPoWConfig};
use swimchain::level::SwimmerLevel;

let config = ForkPoWConfig::production();
let challenge = PoWChallenge::generate_with_level(
    ActionType::Post,
    b"content",
    &author_pubkey,
    SwimmerLevel::Anchor,
    &config,
);
// challenge.difficulty is reduced for Anchor level
```

### With Decay System

Use `calculate_decay_state_with_level()` for level-aware decay:

```rust
use swimchain::content::calculate_decay_state_with_level;
use swimchain::level::SwimmerLevel;
use swimchain::types::constants::HALF_LIFE_SECS;

let state = calculate_decay_state_with_level(
    &content,
    SwimmerLevel::PoolKeeper,
    current_time_ms,
    HALF_LIFE_SECS,
);
// PoolKeeper content decays slower
```

### With CLI

Space creation is gated in the `cs space create` command:

```bash
# Will fail if not Resident+
$ cs space create --name "My Space"
Error: Space creation requires Resident level (you are New Swimmer).
Advance to Resident by contributing bandwidth and uptime.

# Testing bypass
$ cs space create --name "Test" --skip-level-check
```

## See Also

- `src/benefits/mod.rs` - Module documentation
- `src/benefits/pow_reduction.rs` - PoW reduction implementation
- `src/benefits/decay_extension.rs` - Decay multiplier implementation
- `src/benefits/space_rights.rs` - Space creation rights
- `src/benefits/sync_priority.rs` - Sync priority mapping
- `specs/SPEC_09_SOCIAL_LAYER.md` - Full specification
