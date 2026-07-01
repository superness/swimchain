# Engagement & Social - Feature Documentation

**Section**: 11. Engagement & Social
**Owner Area**: `src/engagement_graph/`, `src/achievement/`, `src/notification/`, `src/space_health/`, `src/attribution/`
**Status**: Complete (with deprecations noted)
**Last Updated**: 2026-01-11

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Structures](#data-structures)
4. [Core APIs](#core-apis)
5. [Behaviors](#behaviors)
6. [Configuration](#configuration)
7. [RPC Methods](#rpc-methods)
8. [CLI Commands](#cli-commands)
9. [Error Handling](#error-handling)
10. [Testing](#testing)
11. [Known Limitations](#known-limitations)
12. [Future Work](#future-work)
13. [Related Features](#related-features)

---

## Overview

The Engagement & Social system provides the social layer for Swimchain, enabling user interactions, achievement tracking, notifications, community health monitoring, and content attribution. This feature set transforms raw blockchain activity into meaningful social signals that encourage participation and recognize contributions.

**Core Concepts**:
- **Engagement Graph**: Directed edges tracking who engages with whose content
- **Achievement System**: 12 permanent, non-transferable badges for milestones
- **Notification Service**: 6 notification types with multi-layer throttling
- **Space Health**: Community vitality scores (0-100)
- **Attribution**: "Kept alive by" display showing content contributors
- **Swimmer Levels**: *DEPRECATED* - Level progression system removed in favor of PoW-only gating

---

## Architecture

```
                        +-----------------------------------------+
                        |           Engagement & Social           |
                        +-----------------------------------------+
                                           |
        +--------------+--------------+----+----+--------------+--------------+
        v              v              v         v              v              v
+---------------+ +---------------+ +-----------+ +-----------+ +------------+ +-----------+
|  Engagement   | |  Achievement  | |Notification| |Space Health| | Attribution| |   RPC     |
|    Graph      | |    System     | |  Service   | |  Tracker   | |   System   | | Methods   |
+-------+-------+ +-------+-------+ +-----+-----+ +-----+------+ +------+-----+ +-----+-----+
        |                 |               |             |               |             |
        v                 v               v             v               v             v
+---------------+ +---------------+ +-----------+ +-----------+ +------------+ +-----------+
|  types.rs     | |  types.rs     | | types.rs  | | types.rs  | |  types.rs  | |submit_    |
|  storage.rs   | |  storage.rs   | | service.rs| | compute.rs| |  compute.rs| |engagement |
|               | |  service.rs   | |throttle.rs| |tracker.rs | |  handler.rs| |get_chain_ |
|               | |  triggers.rs  | |prefs.rs   | |           | |            | |engagements|
+---------------+ +---------------+ +-----------+ +-----------+ +------------+ +-----------+
        |                 |               |             |               |             |
        +-----------------+---------------+-------------+---------------+-------------+
                                           |
                                    +------+-------+
                                    |   sled DB    |
                                    +--------------+
```

### Storage Keys

| Module | Prefix | Key Format | Value |
|--------|--------|------------|-------|
| Engagement Graph | `edge:` | `edge:{engager}:{author}` | EngagementEdge |
| Engagement Graph | `out:` | `out:{engager}` | List of authors |
| Engagement Graph | `in:` | `in:{author}` | List of engagers |
| Engagement Graph | `stats:` | `stats:{identity}` | EngagementStats |
| Achievements | `achievements` tree | `{identity}` | StoredAchievements |
| Notifications | `notification_preferences` tree | `{identity}` | StoredPreferences |
| Throttle | `notification_throttle` tree | `{identity}` | StoredThrottleState |

---

## Data Structures

### EngagementType

Types of engagement actions between users.

| Variant | Description |
|---------|-------------|
| `Reply` | Reply to content |
| `Reaction` | Upvote or emoji reaction |
| `Quote` | Quote/repost of content |

### EngagementEdge

A directed edge in the engagement graph: engager -> author.

| Field | Type | Description |
|-------|------|-------------|
| `engager` | `[u8; 32]` | Identity who performed the engagement |
| `author` | `[u8; 32]` | Identity whose content was engaged with |
| `total_count` | `u64` | Total number of engagements |
| `reply_count` | `u32` | Count of reply engagements |
| `reaction_count` | `u32` | Count of reaction engagements |
| `quote_count` | `u32` | Count of quote engagements |
| `first_engagement` | `u64` | First engagement timestamp (UNIX seconds) |
| `last_engagement` | `u64` | Most recent engagement timestamp |
| `recent_timestamps` | `Vec<u64>` | Sliding window (max 100) for rate analysis |

### EngagementStats

Aggregate engagement statistics for an identity.

| Field | Type | Description |
|-------|------|-------------|
| `identity` | `[u8; 32]` | Identity these stats belong to |
| `unique_authors_engaged` | `u32` | Number of unique authors engaged with |
| `total_outgoing` | `u64` | Total outgoing engagements |
| `unique_engagers` | `u32` | Number of unique engagers |
| `total_incoming` | `u64` | Total incoming engagements |
| `self_engagement_count` | `u64` | Self-engagement count (spam detection) |
| `last_updated` | `u64` | Last update timestamp |

### Achievement

12 achievement types with unique badges (permanent, non-transferable).

| ID | Name | Badge | Trigger |
|----|------|-------|---------|
| 0 | FirstStroke | :ocean: | First post created |
| 1 | FirstServe | :satellite: | First content served to peer |
| 2 | WeekSwimmer | :calendar: | 7-day hosting streak |
| 3 | MonthSwimmer | :date: | 30-day hosting streak |
| 4 | Centurion | :100: | 100-day hosting streak |
| 5 | BandwidthBaron | :sports_medal: | Served 100 GiB lifetime |
| 6 | TerabyteClub | :trophy: | Served 1 TiB lifetime |
| 7 | AlwaysOn | :zap: | 30 days at 95%+ uptime (placeholder) |
| 8 | AnchorDrop | :anchor: | Reached Anchor level (deprecated) |
| 9 | LaneOpener | :building_construction: | Created first space |
| 10 | KeeperOfTheFlame | :fire: | Kept 100+ posts alive |
| 11 | EfficientSwimmer | :seedling: | High contribution/resource ratio (provisional) |

### NotificationType

6 notification types for user engagement.

| Type | Emoji | Description |
|------|-------|-------------|
| `Streak` | :fire: | Streak milestone (7, 14, 30, 100 days) |
| `LevelUp` | :arrow_up: | Level increase |
| `Achievement` | :tada: | Achievement earned |
| `SpaceHealth` | :swimmer: | Space needs help (health < 50) |
| `ContentRisk` | :warning: | Content at risk of decay |
| `ContributionThanks` | :pray: | Weekly contribution acknowledgment |

### NotificationPreferences

User-configurable notification settings (opt-out model).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `streak_notifications` | `bool` | `true` | Show streak notifications |
| `achievement_notifications` | `bool` | `true` | Show level/achievement notifications |
| `space_health_nudges` | `bool` | `true` | Show space health nudges |
| `decay_warnings` | `bool` | `true` | Show content decay warnings |
| `streak_notify_threshold` | `u16` | `7` | Minimum streak length to notify |

### SpaceHealth

Community vitality indicators per space.

| Field | Type | Description |
|-------|------|-------------|
| `space_id` | `[u8; 16]` | Space identifier |
| `active_swimmers` | `u32` | Identities with activity in last 7 days |
| `last_sync_age` | `Duration` | Time since last sync |
| `posts_at_risk` | `u32` | Posts with 6.25% <= survival < 25% |
| `top_contributors` | `Vec<SpaceContributor>` | Top contributors this period |
| `health_score` | `u8` | Health score (0-100) |
| `linear_chain_warnings` | `Vec<LinearChainWarning>` | Sybil attack warnings |

### HealthStatus

Health status categories for display.

| Score Range | Status | Description |
|-------------|--------|-------------|
| 80-100 | Healthy | Network functioning well |
| 60-79 | Degraded | Some issues, monitor closely |
| 40-59 | Warning | Multiple issues present |
| 0-39 | Unhealthy | Critical issues requiring attention |

### ContentAttribution

Attribution data showing who keeps content alive.

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | `[u8; 32]` | Content identifier |
| `contributors` | `Vec<AttributionEntry>` | Contributors sorted by PoW DESC |
| `total_contributors` | `u32` | Total unique contributors |
| `total_pow_contributed` | `u64` | Total PoW from all contributors |
| `pool_completion_timestamp` | `Option<u64>` | When pool completed (if any) |

### DecayStatus

Content decay state for attribution display.

| Variant | Byte | Description |
|---------|------|-------------|
| `Active` | 0x01 | Normal countdown - days > 0 |
| `Protected` | 0x02 | Floor period or pinned content |
| `Decayed` | 0x03 | Already decayed below threshold |

---

## Core APIs

### Engagement Graph

#### EngagementGraphStore::record_engagement()

**Signature**: `fn record_engagement(&self, engager: &[u8; 32], author: &[u8; 32], engagement_type: EngagementType, timestamp: u64) -> Result<(), EngagementGraphError>`

**Purpose**: Record an engagement action from one identity to another.

**Parameters**:
- `engager`: Identity performing the engagement
- `author`: Identity whose content was engaged with
- `engagement_type`: Type of engagement (Reply, Reaction, Quote)
- `timestamp`: UNIX timestamp in seconds

**Returns**: `Result<(), EngagementGraphError>`

**Example**:
```rust
let store = EngagementGraphStore::open(db);
store.record_engagement(&alice, &bob, EngagementType::Reply, 1735689600)?;
```

#### EngagementStats::looks_organic()

**Signature**: `fn looks_organic(&self) -> (bool, &'static str)`

**Purpose**: Evaluate if engagement patterns appear organic vs. suspicious.

**Returns**: Tuple of (is_organic, reason_code)

**Detection Criteria**:
- Self-engagement ratio > 30% = suspicious
- Incoming diversity < 10% = suspicious
- Minimum 10 engagements required for assessment

### Achievement System

#### AchievementService::check_and_unlock()

**Signature**: `fn check_and_unlock(&self, identity: &[u8; 32], context: &TriggerContext, timestamp_secs: u64) -> Result<Vec<Achievement>, AchievementError>`

**Purpose**: Check triggers and unlock any new achievements.

**Parameters**:
- `identity`: Identity to check achievements for
- `context`: TriggerContext with current metrics
- `timestamp_secs`: Current UNIX timestamp

**Returns**: List of newly unlocked achievements

**Example**:
```rust
let ctx = TriggerContext::new()
    .with_post_count(1)
    .with_bandwidth(100_000_000_000) // 100 GiB
    .with_streak(7);

let unlocked = service.check_and_unlock(&identity, &ctx, now)?;
for achievement in unlocked {
    println!("Unlocked: {} {}", achievement.badge(), achievement.name());
}
```

### Notification Service

#### NotificationService::check_streak()

**Signature**: `fn check_streak(&self, identity: &[u8; 32], current_streak: u16, now_ms: u64) -> Result<Option<Notification>, NotificationError>`

**Purpose**: Check for streak milestone and emit notification if appropriate.

**Parameters**:
- `identity`: Identity to notify
- `current_streak`: Current streak in days
- `now_ms`: Current time in milliseconds

**Returns**: Optional notification if milestone reached

### Space Health

#### compute_health_score()

**Signature**: `fn compute_health_score(active_swimmers: u32, posts_at_risk: u32, last_sync_age_secs: u64, monthly_bandwidth_gb: u64) -> u8`

**Purpose**: Compute the health score (0-100) for a space.

**Formula**:
- **Swimmer score (30%)**: `min(30, active_swimmers / 10 * 30)`
- **Risk score (30%)**: `max(0, 30 - posts_at_risk)`
- **Sync score (20%)**: `20` if sync < 5 min, else `0`
- **Contribution score (20%)**: `min(20, monthly_bandwidth_gb / 100 * 20)`

**Example**:
```rust
// Healthy space: 10 swimmers, 0 risk, fresh sync, 100GB
let score = compute_health_score(10, 0, 60, 100); // Returns 100

// Empty space: only risk score (no at-risk posts)
let score = compute_health_score(0, 0, 999, 0); // Returns 30
```

#### compute_health_score_with_warnings()

**Signature**: `fn compute_health_score_with_warnings(active_swimmers: u32, posts_at_risk: u32, last_sync_age_secs: u64, monthly_bandwidth_gb: u64, linear_chain_warning_count: u32) -> u8`

**Purpose**: Same as above but includes linear chain penalty.

**Penalty**: Each warning reduces score by 2 points, max 10 points.

### Attribution

#### format_attribution_display()

**Signature**: `fn format_attribution_display(attribution: &ContentAttribution, decay_days: Option<u16>, decay_status: DecayStatus, identity_resolver: Option<&dyn IdentityResolver>) -> ContentAttributionDisplay`

**Purpose**: Format attribution for UI display per SPEC_09 §6.3.

**Output Format**:
```
KEPT ALIVE BY: @alice, @bob, and 7 others
└── Decays in 12 days without engagement
```

#### decay_countdown_days()

**Signature**: `fn decay_countdown_days(content: &ContentItem, current_time_ms: u64, half_life_secs: u64) -> (Option<u16>, DecayStatus)`

**Purpose**: Calculate days until content decays.

**Returns**: Tuple of (days_until_decay, decay_status)

---

## Behaviors

### Engagement Recording

When an engagement occurs:
1. Parse content ID and validate format (`sha256:` prefix)
2. Verify identity is sponsored (Sybil check)
3. Validate PoW for engagement action
4. Record engagement to reset decay timer
5. Update content's `last_engagement` timestamp
6. Add ENGAGE action to BlockBuilder for network propagation
7. Broadcast action to peers via mempool gossip
8. Check if PoW threshold met - form block immediately if so

### Achievement Trigger Evaluation

Achievement triggers are evaluated after relevant events:

| Achievement | Trigger Condition |
|-------------|-------------------|
| FirstStroke | `post_count >= 1` |
| FirstServe | `lifetime_bandwidth_served > 0` |
| WeekSwimmer | `current_streak >= 7` |
| MonthSwimmer | `current_streak >= 30` |
| Centurion | `current_streak >= 100` |
| BandwidthBaron | `lifetime_bandwidth_served >= 100 GiB` |
| TerabyteClub | `lifetime_bandwidth_served >= 1 TiB` |
| AlwaysOn | `days_at_95_percent_uptime >= 30` (placeholder) |
| AnchorDrop | Deprecated (level system removed) |
| LaneOpener | `spaces_created >= 1` |
| KeeperOfTheFlame | `lifetime_posts_supported >= 100` |
| EfficientSwimmer | `contribution_score / resource_cost >= 2.0` |

### Notification Throttling

Multi-layer throttling prevents notification spam:

**Per-Type Throttling**:

| Type | Throttle Rule |
|------|---------------|
| Streak | Once per milestone (7, 14, 30, 100) |
| LevelUp | Once per level change |
| Achievement | Once per achievement ID |
| SpaceHealth | 4-hour cooldown per space |
| ContentRisk | 24-hour cooldown |
| ContributionThanks | Once per period (weekly) |

**Global Limits**:
- Daily limit: 10 notifications (default)
- Optional quiet hours (UTC)

### Space Health Computation

Health score computed from 4 components with optional penalty:

```rust
// Base components (total 100 points max)
swimmer_score = min(30, active_swimmers / 10 * 30);
risk_score = max(0, 30 - posts_at_risk);
sync_score = (last_sync_age < 5min) ? 20 : 0;
contrib_score = min(20, monthly_bandwidth_gb / 100 * 20);

// Linear chain penalty (Sybil detection)
penalty = min(10, warning_count * 2);

total = swimmer_score + risk_score + sync_score + contrib_score - penalty;
```

### Decay Countdown

Content decay follows half-life model:
- Floor protection: Content < 48h old is protected
- Pin protection: Pinned content is protected until expiry
- Decay threshold: Survival < 6.25% (4 half-lives)
- Default half-life: 7 days (604800 seconds)

```rust
effective_decay_time = time_since_engagement - FLOOR_SECS;
half_lives_elapsed = effective_decay_time / half_life_secs;
days_remaining = (4.0 - half_lives_elapsed) * half_life_secs / 86400;
```

---

## Configuration

### Achievement Thresholds

| Constant | Value | Description |
|----------|-------|-------------|
| `WEEK_STREAK_THRESHOLD` | 7 | Days for WeekSwimmer |
| `MONTH_STREAK_THRESHOLD` | 30 | Days for MonthSwimmer |
| `CENTURION_STREAK_THRESHOLD` | 100 | Days for Centurion |
| `BANDWIDTH_BARON_BYTES` | 107,374,182,400 | 100 GiB |
| `TERABYTE_CLUB_BYTES` | 1,099,511,627,776 | 1 TiB |
| `ALWAYS_ON_DAYS` | 30 | Days at 95%+ uptime |
| `KEEPER_OF_FLAME_POSTS` | 100 | Posts kept alive |
| `EFFICIENT_SWIMMER_RATIO` | 2.0 | Contribution/cost ratio |
| `GENESIS_EPOCH_SECS` | 1735689600 | 2025-01-01 00:00:00 UTC |

### Notification Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `daily_limit` | `u16` | 10 | Max notifications per day |
| `quiet_hours` | `Option<(u8, u8)>` | None | UTC hours to suppress (start, end) |
| `SPACE_HEALTH_COOLDOWN_SECS` | `u64` | 14400 | 4-hour cooldown for space health |
| `CONTENT_RISK_COOLDOWN_SECS` | `u64` | 86400 | 24-hour cooldown for content risk |
| `STREAK_MILESTONES` | `[u16; 4]` | [7, 14, 30, 100] | Streak notification triggers |
| `SPACE_HEALTH_THRESHOLD` | `u8` | 50 | Score below which to notify |
| `CONTENT_RISK_THRESHOLD` | `u16` | 3 | Days remaining to trigger |

### Space Health Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `SYNC_FRESH_THRESHOLD_SECS` | 300 | 5 minutes for fresh sync |
| `MAX_SWIMMERS_FOR_FULL_SCORE` | 10 | Full swimmer points at 10+ |
| `MAX_BANDWIDTH_FOR_FULL_SCORE` | 100 | Full contrib at 100+ GB/month |
| `MAX_LINEAR_CHAIN_PENALTY` | 10 | Max points deducted for warnings |
| `PENALTY_PER_WARNING` | 2 | Points per linear chain warning |
| `AT_RISK_THRESHOLD` | 0.25 | Survival probability upper bound |
| `DECAY_THRESHOLD` | 0.0625 | Survival probability lower bound |

### Attribution Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_DISPLAY_CONTRIBUTORS` | 10 | Max contributors shown in "kept alive by" |
| `DECAY_FLOOR_SECS` | 172800 | 48-hour protection period |
| `HALF_LIVES_TO_DECAY` | 4.0 | Half-lives until decay |
| `AttributionEntry::WIRE_SIZE` | 48 | Bytes per entry (32 + 8 + 8) |

### Engagement Graph Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_RECENT` | 100 | Sliding window for recent timestamps |
| `EDGE_PREFIX` | `b"edge:"` | Sled key prefix for edges |
| `OUT_PREFIX` | `b"out:"` | Sled key prefix for outgoing adjacency |
| `IN_PREFIX` | `b"in:"` | Sled key prefix for incoming adjacency |
| `STATS_PREFIX` | `b"stats:"` | Sled key prefix for stats |

---

## RPC Methods

### submit_engagement

Submit an engagement action (reaction, etc.) for content.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_engagement",
  "params": {
    "content_id": "sha256:abc123...",
    "author_id": "def456...",
    "pow_nonce": 12345,
    "pow_difficulty": 16,
    "pow_nonce_space": "00000000...",
    "pow_hash": "789abc...",
    "timestamp": 1735689600,
    "signature": "...",
    "emoji": [128077, 0, 0, 0]
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "engaged": true,
    "reaction_stored": false,
    "content_id": "sha256:abc123...",
    "emoji": [128077, 0, 0, 0]
  },
  "id": 1
}
```

**Notes**:
- Requires sponsored identity (Sybil check)
- PoW validation required
- Reactions go to mempool, stored when block is formed
- Broadcasts action to peers via mempool gossip

### get_chain_engagements

Query engagement actions from the chain.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_chain_engagements",
  "params": {
    "content_id": "sha256:abc123..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "total_engage_actions": 42,
    "content_stats": [
      {
        "content_hash": "abc123...",
        "total_engagements": 15,
        "total_pow_work": 10000,
        "unique_actors": 8,
        "emoji_counts": {
          "👍": 10,
          "❤️": 5
        }
      }
    ]
  },
  "id": 1
}
```

### Network Messages

| Message | Code | Purpose |
|---------|------|---------|
| `MSG_SPACE_HEALTH_QUERY` | 0x34 | Request space health data |
| `MSG_SPACE_HEALTH_RESPONSE` | 0x35 | Return space health data |
| `MSG_ATTRIBUTION_QUERY` | 0x50 | Request content attribution |
| `MSG_ATTRIBUTION_RESPONSE` | 0x51 | Return attribution data |

---

## CLI Commands

Currently, engagement and social features are primarily accessed via RPC. The following CLI commands interact with related functionality:

### cs node status
```bash
cs node status
```
Shows node status including sync state (affects space health sync score).

### cs content list
```bash
cs content list --space <space_id>
```
Lists content with engagement counts and decay status.

---

## Error Handling

### Engagement Graph Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `EngagementGraphError::Storage` | sled database error | Check disk space, database integrity |
| `EngagementGraphError::Serialization` | JSON serialization failed | Check data format |

### Achievement Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `AchievementError::Storage` | Database error | Check sled database |
| `AchievementError::InvalidId` | Invalid achievement ID | Use valid ID (0-11) |

### Notification Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `NotificationError::Storage` | Database error | Check sled database |
| `NotificationError::Throttled` | Rate limited | Wait for cooldown |
| `NotificationError::Serialization` | bincode serialization failed | Check data format |

### Attribution Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `AttributionError::ContentNotFound` | Content ID not found | Verify content exists |

---

## Testing

### Run Unit Tests
```bash
# Run all engagement & social tests
cargo test --package swimchain engagement_graph
cargo test --package swimchain achievement
cargo test --package swimchain notification
cargo test --package swimchain space_health
cargo test --package swimchain attribution
```

### Run with Output
```bash
cargo test --lib -- --nocapture
```

### Integration Testing
```bash
# Test engagement flow
cargo test --test engagement_integration

# Test achievement unlocking
cargo test --test achievement_triggers

# Test notification throttling
cargo test --test notification_throttle
```

### Manual Testing

```bash
# Start a test node
cs node start --testnet

# Submit engagement via RPC
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"submit_engagement","params":{...},"id":1}'

# Query engagements
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"get_chain_engagements","params":{},"id":1}'
```

### Key Test Coverage

| Module | Test File | Key Tests |
|--------|-----------|-----------|
| Engagement Graph | `storage.rs` | Record, retrieve, mutual engagement, self-engagement |
| Achievement | `types.rs`, `triggers.rs` | All 12 achievements, boundary tests, permanence |
| Notification | `throttle.rs`, `preferences.rs`, `triggers.rs` | All 6 types, throttling, preferences |
| Space Health | `compute.rs`, `types.rs` | Score calculation, status boundaries |
| Attribution | `compute.rs`, `types.rs` | Contributor extraction, decay countdown |

---

## Known Limitations

1. **Swimmer Levels Deprecated**: The 6-level progression system (Guppy -> Anchor) has been removed in favor of PoW-only gating. The `update_level()` function is a no-op.

2. **AnchorDrop Achievement Unavailable**: Cannot be earned since the level system is deprecated.

3. **AlwaysOn Achievement Placeholder**: Requires daily uptime tracking which is not yet implemented. The trigger checks `days_at_95_percent_uptime` which is always 0.

4. **EfficientSwimmer Provisional**: The contribution/resource ratio metric is not fully integrated across all systems.

5. **Engagement Pools Deprecated**: The RPC methods `create_pool`, `contribute_to_pool`, `get_pool_info`, and `get_pool_for_content` return `MethodNotFound` errors. Use `submit_engagement` instead.

6. **Self-Engagement Detection**: While tracked, self-engagement is not currently blocked - only flagged for spam detection analysis.

7. **No Real-time Notifications**: Notifications are stored and polled rather than pushed via WebSocket.

8. **Documentation Discrepancies**: Some documented values differ from implementation:
   - Always On: Doc says 7-day streak, impl uses 30 days at 95%+ uptime
   - Bandwidth Baron: Doc says 1TB, impl uses 100GB
   - Terabyte Club: Doc says 10TB, impl uses 1TB
   - Keeper of Flame: Doc says 1000+ posts, impl uses 100+

---

## Future Work

Based on gap analysis, the following improvements are planned:

1. **Implement Daily Uptime Tracking**: Enable AlwaysOn achievement trigger with proper 95%+ uptime detection over 30 days.

2. **WebSocket Notification Push**: Add real-time notification delivery via WebSocket subscriptions.

3. **Engagement Graph Visualization**: RPC method to export engagement graph for social network visualization.

4. **Achievement Progress API**: Expose progress percentages toward locked achievements via RPC.

5. **Space Health Alerts**: Automatic notifications when space health drops below thresholds.

6. **Attribution Caching**: Implement caching layer for frequently-accessed attribution data.

7. **Linear Chain Detection Improvements**: More sophisticated Sybil detection beyond linear sponsorship chains.

8. **Update Documentation**: Align MASTER_FEATURES.md with actual implementation thresholds.

---

## Related Features

- **[Content & Decay Engine](./content-decay-engine_FEATURE_DOC.md)**: Engagement resets decay timer; engagement pools concept (deprecated)
- **[Spam & Reputation](./spam-reputation_FEATURE_DOC.md)**: Reputation scoring interacts with spam detection
- **[Sponsorship & Sybil Resistance](./sponsorship-sybil-resistance_FEATURE_DOC.md)**: Sponsor tree interacts with linear chain warnings
- **[Proof-of-Work Systems](./proof-of-work-systems_FEATURE_DOC.md)**: PoW validation for engagement actions
- **[Storage Layer](./storage-layer_FEATURE_DOC.md)**: sled database for persistence

---

*Last updated: 2026-01-11*
*Documentation version: 2.0*
