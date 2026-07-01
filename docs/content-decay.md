# Content & Decay Engine

> Reference: SPEC_02_CONTENT_DECAY.md, THESIS_06_DECAY.md

The Content & Decay Engine implements organic moderation through engagement-based content lifecycle management. Content naturally decays over time unless sustained by community engagement.

## Core Concepts

### Decay Formula

Content survival probability follows a half-life model:

```
survival_probability = 0.5^(effective_decay_time / half_life)
```

Where:
- `effective_decay_time = max(0, time_since_last_engagement - floor_period)`
- `half_life` = 7 days (604,800 seconds) by default
- `floor_period` = 48 hours (content is protected during this time)

### Content Lifecycle

Content progresses through four stages based on survival probability:

```
  Protected ──────► Active ──────► Stale ──────► Decayed
  (floor/pinned)   (≥50%)        (≥6.25%)      (<6.25%)
       │              │              │              │
       │              │              │              ▼
       │              │              │          PRUNED
       │              │              │
       ▼              ▼              ▼
  [Cannot decay]  [Healthy]    [At risk]
```

| Stage | Survival Probability | Half-Lives Elapsed | Description |
|-------|---------------------|-------------------|-------------|
| Protected | 100% | 0 | Within 48h floor or pinned |
| Active | ≥50% | <1 | Less than 1 half-life elapsed |
| Stale | 6.25% - 50% | 1-4 | Declining engagement |
| Decayed | <6.25% | >4 | Eligible for pruning |

### Decay Threshold

Content is considered decayed when survival probability drops below **6.25%** (DECAY_THRESHOLD). This corresponds to approximately 4 half-lives without engagement:

- After 1 half-life (7 days): 50% survival
- After 2 half-lives (14 days): 25% survival
- After 3 half-lives (21 days): 12.5% survival
- After 4 half-lives (28 days): 6.25% survival ← Decay threshold

## Adaptive Decay

The half-life adjusts based on storage pressure to maintain bounded storage:

```
pressure = current_storage / target_storage

if pressure > 1.0:
    # Over budget: decrease half-life (faster decay)
    target_half_life = current_half_life / pressure
else:
    # Under budget: increase half-life (slower decay)
    target_half_life = current_half_life * (1 + (1 - pressure) * 0.5)

# Apply smoothing (10%) and clamp to [1 day, 30 days]
new_half_life = current + (target - current) * 0.1
new_half_life = clamp(new_half_life, MIN_HALF_LIFE, MAX_HALF_LIFE)
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TARGET_STORAGE_BYTES` | 500 MB | Target storage per node |
| `MIN_HALF_LIFE_SECS` | 86,400 (1 day) | Minimum half-life |
| `MAX_HALF_LIFE_SECS` | 2,592,000 (30 days) | Maximum half-life |
| `ADAPTATION_INTERVAL_SECS` | 3,600 (1 hour) | How often to recalculate |
| `ADAPTATION_SMOOTHING` | 0.1 (10%) | Smoothing factor |

## Engagement Effects

Only meaningful engagement resets the decay timer:

| Engagement Type | Resets Decay | Notes |
|-----------------|--------------|-------|
| Reply | Yes | Creates new content, links to parent |
| Quote | Yes | Creates new content, references original |
| Engage (pooled) | Deferred | Phase 2 - pooled PoW engagement |
| View | No | Passive, not counted |

Self-engagement is allowed per SPEC_02 §4.2 (costs same PoW as external engagement).

## Pruning Behavior

Content is pruned when:
1. `survival_probability < 0.0625` (decayed)
2. Not protected (not pinned, past floor period)
3. Grace period (24 hours) has elapsed

### Thread Coherence

When decayed content has active children:
- Full content is deleted
- **Tombstone** is created to preserve thread structure
- Tombstone contains: content_id, author_id, tombstone_time, summary_hash

When decayed content has no active children:
- Content is fully deleted
- No tombstone created

## API Usage

```rust
use swimchain::content::ContentManager;

// Create manager
let manager = ContentManager::new();

// Create content
let content_id = manager.create_content(content, current_time_ms)?;

// Query decay state
let decay_state = manager.get_decay_state(&content_id, current_time_ms)?;
println!("Survival: {:.1}%", decay_state.survival_probability * 100.0);

// Process engagement (resets decay timer)
let result = manager.process_engagement(engagement, current_time_ms)?;

// Prune decayed content (call periodically)
let stats = manager.prune(current_time_ms)?;
println!("Pruned {} items", stats.items_pruned);

// Adapt half-life based on storage (call hourly)
let new_half_life = manager.adapt_half_life()?;
```

## Implementation Details

### Storage Layer

- In-memory HashMap-based storage
- Parent-child relationship indexing
- Efficient iteration for pruning
- Size estimation for adaptive decay

### Thread Safety

`ContentManager` uses `Arc<RwLock<>>` for thread-safe access:
- Read operations (get_content, get_decay_state) use read locks
- Write operations (create_content, process_engagement, prune) use write locks

### Performance Considerations

- Decay calculation is O(1) per item
- Pruning is O(n) where n = total content items
- Child checking uses index for O(children) lookup
- Recommended prune interval: 1 minute to 1 hour

## Test Vectors

### Test 1: Floor Protection
- Created: 1 day ago, no engagement
- Expected: `is_protected=true`, `survival=1.0`

### Test 2: Basic Decay (32 days)
- Created: 32 days ago, no engagement
- Effective decay time: 30 days (32 - 2 floor)
- Half-lives: 30 / 7 = 4.286
- Expected: `survival ≈ 0.051`, `is_decayed=true`

### Test 3: Engagement Resets Decay
- Created: day 0, engaged: day 27, checked: day 32
- Time since engagement: 5 days
- Effective decay: 3 days
- Expected: `survival ≈ 0.74`, `is_decayed=false`
