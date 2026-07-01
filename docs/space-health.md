# Space Health System

Implementation documentation for Milestone 7.6 - Space Health Indicators.

This module implements SPEC_09 (Social Layer) Section 6: Space-Level Social Features.

## Overview

The space health system provides visibility into how well a space is being maintained by its participants. It tracks:

- **Active Swimmers**: Identities with Level >= Regular who have been active in the last 7 days
- **Posts at Risk**: Content that is approaching decay (6.25% <= survival < 25%)
- **Top Contributors**: The highest-contributing identities in the current period
- **Health Score**: A composite metric (0-100) reflecting overall space health

This is about **HOSTING health**, not post activity. An "active" space is one with good hosting coverage.

## Data Structures

### SpaceHealth

The main health indicator struct:

```rust
pub struct SpaceHealth {
    pub space_id: [u8; 16],           // Space identifier
    pub active_swimmers: u32,          // Level >= Regular, active in 7 days
    pub last_sync_age: Duration,       // Time since last sync
    pub posts_at_risk: u32,            // Posts near decay threshold
    pub top_contributors: Vec<SpaceContributor>,  // Top 10 contributors
    pub health_score: u8,              // 0-100 composite score
}
```

### SpaceContributor

Per-space contributor statistics:

```rust
pub struct SpaceContributor {
    pub identity: [u8; 32],            // Ed25519 public key
    pub bandwidth_served_bytes: u64,    // Bytes served this period
    pub uptime_ratio: u16,             // 0-10000 (0.00%-100.00%)
    pub contribution_score: u64,        // Computed score
}
```

## Health Score Formula

Per SPEC_09 Section 6.1 and docs/analytics-client.md:

```
Health Score = Swimmer Score + Risk Score + Sync Score + Contrib Score
```

### Components

| Component | Weight | Formula | Max |
|-----------|--------|---------|-----|
| Swimmer Score | 30% | `min(30, active_swimmers / 10 * 30)` | 30 |
| Risk Score | 30% | `max(0, 30 - posts_at_risk)` | 30 |
| Sync Score | 20% | `20 if last_sync < 5min else 0` | 20 |
| Contrib Score | 20% | `min(20, monthly_bandwidth_gb / 100 * 20)` | 20 |

### Examples

**Empty Space (score = 30)**
- 0 swimmers: 0 points
- 0 at-risk posts: 30 points (no risk!)
- Stale sync: 0 points
- 0 GB bandwidth: 0 points
- Total: 30

**Healthy Space (score = 100)**
- 10 swimmers: 30 points
- 0 at-risk posts: 30 points
- Fresh sync (< 5 min): 20 points
- 100 GB bandwidth: 20 points
- Total: 100

**Degraded Space (score = 45)**
- 5 swimmers: 15 points
- 10 at-risk posts: 20 points
- Stale sync: 0 points
- 50 GB bandwidth: 10 points
- Total: 45

## Active Swimmer Criteria

An identity counts as an "active swimmer" if:

1. **Level >= Regular**: Must have achieved at least Regular level (7+ days active, some bandwidth served)
2. **Recent Activity**: Must have hosting activity within the last 7 days

The 7-day window ensures the count reflects current participation, not historical.

## Posts at Risk

Content is considered "at risk" when:

- Survival probability >= 6.25% (DECAY_THRESHOLD)
- Survival probability < 25% (AT_RISK_THRESHOLD)

This gives users early warning before content fully decays.

### Thresholds

| Threshold | Value | Meaning |
|-----------|-------|---------|
| DECAY_THRESHOLD | 6.25% | Content is decayed/prunable below this |
| AT_RISK_THRESHOLD | 25% | Content needs attention below this |

## Top Contributors Ranking

Contributors are ranked by `contribution_score`:

```
contribution_score = bandwidth_gb * 100 + content_count / 100
```

- Bandwidth dominates (1 GB = 100 points)
- Content served adds minor bonus (100 requests = 1 point)
- Ties broken by identity (deterministic ordering)
- Limited to top 10 contributors

## Wire Protocol

### SPACE_HEALTH_QUERY (0x34)

Query for space health data.

| Field | Size | Description |
|-------|------|-------------|
| space_id | 16 bytes | Space identifier |

Total: 16 bytes

### SPACE_HEALTH_RESPONSE (0x35)

Response with space health data.

| Field | Size | Description |
|-------|------|-------------|
| space_id | 16 bytes | Space identifier |
| active_swimmers | 4 bytes LE | Active swimmer count |
| last_sync_age_secs | 8 bytes LE | Seconds since sync |
| posts_at_risk | 4 bytes LE | At-risk post count |
| health_score | 1 byte | Score 0-100 |
| contributor_count | 4 bytes LE | Number of contributors |
| contributors[] | 50 bytes each | Contributor data |

Minimum: 37 bytes (no contributors)
Maximum practical: 537 bytes (10 contributors)

### SpaceContributorPayload

| Field | Size | Description |
|-------|------|-------------|
| identity | 32 bytes | Ed25519 public key |
| bandwidth_served_bytes | 8 bytes LE | Bytes served |
| uptime_ratio | 2 bytes LE | 0-10000 |
| contribution_score | 8 bytes LE | Computed score |

Total: 50 bytes

## API Usage

### Creating SpaceHealthManager

```rust
use swimchain::space_health::SpaceHealthManager;
use std::sync::Arc;

let manager = SpaceHealthManager::new(
    &db,
    Arc::clone(&level_manager),
    Arc::clone(&contribution_store),
)?;
```

### Querying Space Health

```rust
let health = manager.get_health(&space_id)?;
println!("Health score: {}", health.health_score);
println!("Active swimmers: {}", health.active_swimmers);
```

### Recording Activity

```rust
// Record hosting activity (triggers cache invalidation)
manager.record_activity(&space_id, &identity, timestamp)?;

// Record bandwidth contribution
manager.record_contribution(&space_id, &identity, bytes_served)?;
```

### Message Handling

```rust
use swimchain::space_health::SpaceHealthQueryHandler;

let handler = SpaceHealthQueryHandler::new(Arc::clone(&manager));
let response = handler.handle(&query)?;
```

## Caching

- Health data is cached for 60 seconds (CACHE_TTL)
- Cache is invalidated when activity or contribution is recorded
- Force invalidation with `manager.invalidate(&space_id)`

## Known Gaps

### ContentManager Integration

The `count_posts_at_risk_in_space()` function currently returns 0. Full integration requires:

1. Content indexed by space_id
2. `ContentManager.iter_space(space_id)` API
3. Decay state calculation for each content item

### Sync Status Integration

The `last_sync_age` is currently always 0. Integration with sync system requires:

1. Tracking last successful sync per space
2. Sync status updates from the sync module

## Module Structure

```
src/space_health/
├── mod.rs          - Module exports
├── types.rs        - SpaceHealth, SpaceContributor structs
├── error.rs        - SpaceHealthError enum
├── tracker.rs      - SpaceSwimmerTracker (activity tracking)
├── contributors.rs - ContributorRanker (contribution tracking)
├── risk.rs         - Posts at risk calculation
├── compute.rs      - Health score computation
├── manager.rs      - SpaceHealthManager coordinator
└── handler.rs      - SpaceHealthQueryHandler
```

## Related Documentation

- [SPEC_09: Social Layer](../specs/SPEC_09_SOCIAL_LAYER.md) - Full specification
- [SPEC_02: Content & Decay](../specs/SPEC_02_CONTENT_DECAY.md) - Decay thresholds
- [Analytics Client](analytics-client.md) - Health score formula reference
- [Swimmer Levels](swimmer-levels.md) - Level requirements for active swimmers
