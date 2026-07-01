# Swimmer Levels

This document describes the swimmer level system implemented per SPEC_09 Section 3.

## Overview

Swimmer levels represent a node's contribution tier in the Swimchain network. Levels are:
- **Non-transferable**: Tied to an identity's public key
- **Computed dynamically**: Based on contribution history
- **Cached for performance**: Recomputed when contributions change

## Level Definitions

| Level | Value | Monthly BW | Uptime | Active Days | Lifetime BW |
|-------|-------|------------|--------|-------------|-------------|
| NewSwimmer | 0 | - | - | - | - |
| Regular | 1 | - | - | 7+ | > 0 GB |
| Resident | 2 | - | 50%+ | 30+ | 10+ GB |
| Lifeguard | 3 | 50+ GB | 70%+ | - | - |
| Anchor | 4 | 200+ GB | 90%+ | - | - |
| PoolKeeper | 5 | 500+ GB | 95%+ | - | - |

### Level Requirements

1. **NewSwimmer (Level 0)**
   - Default level for new identities
   - No contribution requirements

2. **Regular (Level 1)**
   - 7+ days of activity
   - Any amount of bandwidth served (> 0 GB lifetime)

3. **Resident (Level 2)**
   - 30+ days of activity
   - 10+ GB lifetime bandwidth
   - 50%+ weighted average uptime

4. **Lifeguard (Level 3)**
   - 50+ GB bandwidth in last 30 days
   - 70%+ weighted average uptime
   - Recent hosting activity (within 7 days)

5. **Anchor (Level 4)**
   - 200+ GB bandwidth in last 30 days
   - 90%+ weighted average uptime
   - Recent hosting activity (within 7 days)

6. **PoolKeeper (Level 5)**
   - 500+ GB bandwidth in last 30 days
   - 95%+ weighted average uptime
   - Recent hosting activity (within 7 days)

## Computation Algorithm

Level computation follows SPEC_09 §3.2:

```
function compute_level(records, current_period):
    if records is empty:
        return NewSwimmer

    total_days = count_active_days(records)
    avg_uptime = weighted_average_uptime(records, current_period)
    monthly_bw = bandwidth_last_30_days(records, current_period)
    lifetime_bw = total_bandwidth(records)
    recent = has_recent_hosting(records, current_period, 7)

    // Inactivity cap
    if not recent:
        return min(Regular, base_level(total_days, lifetime_bw))

    // Check levels in descending order
    if monthly_bw >= 500 GB and avg_uptime >= 95%:
        return PoolKeeper
    if monthly_bw >= 200 GB and avg_uptime >= 90%:
        return Anchor
    if monthly_bw >= 50 GB and avg_uptime >= 70%:
        return Lifeguard
    if total_days >= 30 and lifetime_bw >= 10 GB and avg_uptime >= 50%:
        return Resident
    if total_days >= 7 and lifetime_bw > 0:
        return Regular

    return NewSwimmer
```

## Contribution Weight Decay

Per SPEC_09 §8.3, older contributions have less weight:

| Age (weeks) | Weight |
|-------------|--------|
| 0-4 | 1.0 (full) |
| 5-12 | Linear decay from 1.0 to 0.1 |
| 13+ | 0.1 (minimal) |

Formula for weeks 5-12:
```
weight = 1.0 - ((age - 4) / 8) * 0.9
```

## Inactivity Rules

If a node has no hosting activity in the last 7 days:
- Level is capped at Regular (or lower if base requirements not met)
- Prevents inactive nodes from maintaining high levels
- Encourages continuous participation

## Caching Strategy

- Cached levels are stored with computation metadata (period, timestamp)
- Cache is considered fresh if computed in current or previous period
- Cache is invalidated when contribution records change
- Uses sled database tree "swimmer_levels"

## Wire Protocol

### LEVEL_QUERY (0x32)

Request level information for an identity.

| Field | Size | Description |
|-------|------|-------------|
| identity | 32 | Public key to query |

**Total: 32 bytes**

### LEVEL_RESPONSE (0x33)

Response with level information.

| Field | Size | Description |
|-------|------|-------------|
| identity | 32 | Queried public key |
| level | 1 | SwimmerLevel as u8 |
| streak | 2 | Current streak days |
| bandwidth_30d_gb | 8 | GB served last 30 days |
| uptime_ratio | 2 | 0-10000 (0.00%-100.00%) |
| lifetime_bandwidth_gb | 8 | Total GB served |

**Total: 53 bytes**

## API Examples

### Rust

```rust
use swimchain::level::{LevelManager, SwimmerLevel, compute_level};
use swimchain::contribution::ContributionStore;

// Query level via manager (uses caching)
let level = level_manager.get_level(&identity)?;

// Check level requirements
if level.at_least(SwimmerLevel::Resident) {
    // Identity can access Resident-level features
}

// Direct computation (no cache)
let level = compute_level(&records, current_period);

// Build identity profile
let profile = IdentityProfile::build(
    public_key,
    Some("DisplayName".to_string()),
    &level_manager,
    &contribution_store,
    vec![space_id],
)?;
```

### Message Handling

```rust
use swimchain::level::handler::LevelQueryHandler;
use swimchain::network::messages::{LevelQueryPayload, LevelResponsePayload};

// Create handler
let handler = LevelQueryHandler::new(
    Arc::clone(&level_manager),
    Arc::clone(&contribution_store),
);

// Handle query
let query = LevelQueryPayload::new(identity);
let response = handler.handle(&query)?;

println!("Level: {}", SwimmerLevel::from_u8(response.level).unwrap().name());
println!("Streak: {} days", response.streak);
println!("Monthly BW: {} GB", response.bandwidth_30d_gb);
```

## Benefits by Level

Higher swimmer levels unlock network benefits. See `docs/contribution-benefits.md` for full details.

| Level | PoW Reduction | Decay Extension | Space Creation | Sync Priority |
|-------|---------------|-----------------|----------------|---------------|
| NewSwimmer | 0% | 1.0x | No | Normal |
| Regular | 0% | 1.0x | No | Normal |
| Resident | 10% | 1.2x | **Yes** | Normal |
| Lifeguard | 20% | 1.5x | Yes | Above Normal |
| Anchor | 35% | 1.8x | Yes | High |
| PoolKeeper | 50% | 2.0x | Yes | Highest |

### Quick Reference

```rust
use swimchain::benefits::{
    adjusted_difficulty,
    decay_multiplier,
    can_create_space,
    sync_priority,
};
use swimchain::level::SwimmerLevel;

// PoW reduction
let reduced = adjusted_difficulty(20, SwimmerLevel::PoolKeeper);
assert_eq!(reduced, 10);  // 50% reduction

// Decay extension
let mult = decay_multiplier(SwimmerLevel::Anchor);
assert_eq!(mult, 1.8);  // 80% longer half-life

// Space creation gate
assert!(!can_create_space(SwimmerLevel::Regular));
assert!(can_create_space(SwimmerLevel::Resident));

// Sync priority
assert_eq!(sync_priority(SwimmerLevel::PoolKeeper), Priority::Highest);
```

## Related Specifications

- SPEC_09 Section 3: Swimmer Levels
- SPEC_09 Section 2: Contribution Metrics
- SPEC_09 Section 4: Contribution Benefits
- SPEC_09 Section 8.3: Contribution Weight Decay
- SPEC_09 Section 11: Wire Protocol

## Module Structure

```
src/level/
├── mod.rs       # Module exports
├── types.rs     # SwimmerLevel enum and constants
├── compute.rs   # Level computation functions
├── cache.rs     # LevelCache for sled storage
├── manager.rs   # LevelManager coordinator
├── handler.rs   # LEVEL_QUERY message handler
├── profile.rs   # IdentityProfile structure
└── error.rs     # LevelError type
```
