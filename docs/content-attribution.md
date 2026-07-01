# Content Attribution System

> Reference: SPEC_09 §6.3 (Content Attribution)

The Content Attribution System displays who keeps content alive through engagement pool contributions.

## Display Format

Per SPEC_09 §6.3:

```
POST by @dave (3 days ago)
═══════════════════════════════════════════════════════════════════════

"Here's my tomato harvest this year..."

[image]

👍 34 | 💬 12 | ♻️ 8

KEPT ALIVE BY: @alice, @bob, @carol, and 7 others
└── Decays in 12 days without engagement
```

## Data Structures

### AttributionEntry (48 bytes wire)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| identity | [u8; 32] | 32 | Contributor's Ed25519 public key |
| pow_contributed | u64 | 8 | Total PoW seconds contributed |
| first_contribution_timestamp | u64 | 8 | First contribution time (ms) |

### ContentAttribution

| Field | Type | Description |
|-------|------|-------------|
| content_id | [u8; 32] | Target content |
| contributors | Vec<AttributionEntry> | Sorted by pow DESC |
| total_contributors | u32 | Unique contributor count |
| total_pow_contributed | u64 | Sum of all contributions |
| pool_completion_timestamp | Option<u64> | When pool completed |

### DecayStatus

| Value | Byte | Meaning |
|-------|------|---------|
| Active | 0x01 | Normal countdown, days > 0 |
| Protected | 0x02 | Floor period or pinned content |
| Decayed | 0x03 | Already below threshold |

## Wire Protocol

### MSG_ATTRIBUTION_QUERY (0x50)

| Field | Bytes | Description |
|-------|-------|-------------|
| content_id | 32 | Content to query |

### MSG_ATTRIBUTION_RESPONSE (0x51)

| Field | Bytes | Description |
|-------|-------|-------------|
| content_id | 32 | Content ID |
| decay_status | 1 | 0x01=Active, 0x02=Protected, 0x03=Decayed |
| days_remaining | 2 | Days until decay (0xFFFF if N/A) |
| total_contributors | 4 | Total unique contributors |
| total_pow | 8 | Total PoW seconds |
| has_completion_ts | 1 | 0 or 1 |
| completion_ts | 0 or 8 | Pool completion timestamp (if present) |
| contributor_count | 1 | Display contributors (max 255) |
| contributors | N × 48 | AttributionEntry array |

Fixed portion: 49 bytes (no completion timestamp) or 57 bytes (with timestamp)
Per contributor: 48 bytes

## Decay Countdown Calculation

Formula (SPEC_02 §4.1):

1. `effective_decay_time = max(0, time_since_engagement - floor_period)`
2. `half_lives_elapsed = effective_decay_time / half_life_secs`
3. `survival = 0.5^half_lives_elapsed`
4. Content decays when `survival < 0.0625` (4 half-lives)
5. `days_remaining = (4 - half_lives_elapsed) × (half_life_secs / 86400)`

With level multiplier (SPEC_09 §4.4):

| Level | Multiplier | Fresh Content Days |
|-------|------------|-------------------|
| NewSwimmer | 1.0× | ~30 days |
| Regular | 1.0× | ~30 days |
| Resident | 1.2× | ~36 days |
| Lifeguard | 1.5× | ~45 days |
| Anchor | 1.8× | ~54 days |
| PoolKeeper | 2.0× | ~60 days |

## Special Display Cases

| Condition | Attribution Line | Decay Line |
|-----------|-----------------|------------|
| No pools completed | "Not yet engaged" | Decay countdown |
| Floor period (< 48h) | Contributors (if any) | "New content (protected)" |
| Pinned content | Contributors | "Pinned by [author/community]" |
| Decayed content | Contributors | "Decayed" |

## Contributor Aggregation

Contributors are aggregated across multiple pools:

1. Extract all contributions from completed pools for the content
2. Group by contributor identity using HashMap
3. Sum pow_contributed for duplicate contributors
4. Keep earliest first_contribution_timestamp for duplicates
5. Sort by pow_contributed DESC
6. Limit display to MAX_DISPLAY_CONTRIBUTORS (10)

## Identity Resolution

The display format supports identity resolution:

1. Try to resolve identity pubkey to display name (e.g., "@alice")
2. Fall back to truncated hex (e.g., "@abcdef12") if resolution fails
3. Resolution is handled by the `IdentityResolver` trait

## API Usage

```rust
use swimchain::attribution::{
    AttributionManager, ContentAttribution, format_attribution_display,
    decay_countdown_days, DecayStatus,
};
use swimchain::types::constants::HALF_LIFE_SECS;

// Create manager
let mut manager = AttributionManager::new();

// Get attribution for content
let attribution = manager.get_attribution(
    &content_id,
    &pools,
    current_time_ms,
);

// Calculate decay countdown
let (days, status) = decay_countdown_days(
    &content,
    current_time_ms,
    HALF_LIFE_SECS,
);

// Format for display
let display = format_attribution_display(
    &attribution,
    days,
    status,
    Some(&identity_service),
);

println!("{}", display.attribution_line);
println!("└── {}", display.decay_line);
```

## Caching

The `AttributionManager` caches computed attribution data:

- **Cache TTL**: 5 minutes
- **Invalidation**: Call `invalidate_cache(&content_id)` when pools complete
- **Cleanup**: Call `cleanup_stale_cache()` periodically

## Implementation Files

| File | Purpose |
|------|---------|
| `src/attribution/mod.rs` | Module exports |
| `src/attribution/types.rs` | Core data structures |
| `src/attribution/error.rs` | Error types |
| `src/attribution/compute.rs` | Contributor extraction and decay calculation |
| `src/attribution/manager.rs` | Attribution manager with caching |
| `src/attribution/handler.rs` | Wire protocol handling |

## See Also

- **Spec:** `specs/SPEC_09_SOCIAL_LAYER.md` §6.3
- **Related:** [Engagement Pools](engagement-pools.md)
- **Related:** [Content Decay](content-decay.md)
- **Related:** [Swimmer Levels](swimmer-levels.md)
