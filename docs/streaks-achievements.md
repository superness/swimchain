# Streaks and Achievements

This document describes the implementation of streaks and achievements per SPEC_09 Sections 5.1-5.3.

## Overview

The Swimchain protocol tracks two types of engagement indicators:

1. **Streaks** (from Milestone 7.1) - Consecutive days of hosting activity
2. **Achievements** (from Milestone 7.5) - Permanent milestone badges

Both are tied to identity and are non-transferable. Achievements are permanent once earned, while streaks can be broken by inactivity.

## Streaks

### StreakTracker

Located in `src/contribution/streak.rs`, the `StreakTracker` tracks consecutive days of hosting activity.

```rust
pub struct StreakTracker {
    pub current_streak: u16,      // Current consecutive days
    pub best_streak: u16,         // Longest streak ever
    pub last_active_day: u32,     // Days since GENESIS_EPOCH
    pub total_active_days: u32,   // Lifetime active days
}
```

### Streak Rules

1. First activity ever starts streak at 1
2. Activity on consecutive days extends the streak
3. Missing a day (gap > 1) resets streak to 1
4. Same-day activity is idempotent (doesn't increase streak)
5. Past-day activity is ignored (can't record retroactively)

### Usage

```rust
let mut tracker = StreakTracker::new();
let today = StreakTracker::days_since_genesis(timestamp)?;
tracker.record_activity(today);
```

## Achievements

### Achievement Types

The protocol defines 12 achievements per SPEC_09 Section 5.3:

| ID | Name | Badge | Trigger |
|----|------|-------|---------|
| 0 | First Stroke | 🌊 | First post ever |
| 1 | First Serve | 📡 | First content served to peer |
| 2 | Week Swimmer | 📅 | 7-day hosting streak |
| 3 | Month Swimmer | 📆 | 30-day hosting streak |
| 4 | Centurion | 💯 | 100-day hosting streak |
| 5 | Bandwidth Baron | 🏅 | Served 100GB lifetime |
| 6 | Terabyte Club | 🏆 | Served 1TB lifetime |
| 7 | Always On | ⚡ | 30 days at 95%+ uptime |
| 8 | Anchor Drop | ⚓ | First time reaching Anchor level |
| 9 | Lane Opener | 🏗️ | Created first space (Resident+) |
| 10 | Keeper of the Flame | 🔥 | Kept 100+ posts alive |
| 11 | Efficient Swimmer | 🌱 | High contribution/low resource use |

### Trigger Thresholds

```rust
pub const WEEK_STREAK_THRESHOLD: u32 = 7;
pub const MONTH_STREAK_THRESHOLD: u32 = 30;
pub const CENTURION_STREAK_THRESHOLD: u32 = 100;
pub const BANDWIDTH_BARON_BYTES: u64 = 107_374_182_400;  // 100 GiB
pub const TERABYTE_CLUB_BYTES: u64 = 1_099_511_627_776;  // 1 TiB
pub const ALWAYS_ON_DAYS: u32 = 30;
pub const KEEPER_OF_FLAME_POSTS: u64 = 100;
pub const EFFICIENT_SWIMMER_RATIO: f64 = 2.0;
```

### Permanence Model

Per SPEC_09 Section 5.3, achievements are:

- **Permanent**: Once earned, cannot be revoked
- **Non-transferable**: Tied to identity key
- **Visible**: Displayed on profile

The storage layer enforces permanence by not providing any delete operations:

```rust
// NOTE: No delete method - PERMANENCE requirement per SPEC_09 §5.3
// Achievements once earned are permanent and cannot be revoked.
```

## Module Structure

```
src/achievement/
├── mod.rs          # Module exports
├── error.rs        # AchievementError enum
├── types.rs        # Achievement enum, AchievementRecord
├── tracker.rs      # AchievementTracker (in-memory)
├── storage.rs      # AchievementStore (sled persistence)
├── triggers.rs     # TriggerContext, check_triggers()
└── service.rs      # AchievementService (integration point)
```

## Integration

### Checking and Unlocking Achievements

```rust
use swimchain::achievement::{AchievementService, AchievementStore, TriggerContext};
use std::sync::Arc;

// Create service
let db = sled::open("my_db")?;
let store = Arc::new(AchievementStore::new(&db)?);
let service = AchievementService::new(store);

// Build context from current metrics
let ctx = TriggerContext::new()
    .with_post_count(1)           // User has 1 post
    .with_bandwidth(1000)          // Served 1000 bytes
    .with_streak(7)                // 7-day streak
    .with_level(SwimmerLevel::Resident);

// Check and unlock
let unlocked = service.check_and_unlock(&identity, &ctx, timestamp)?;
for achievement in unlocked {
    println!("Unlocked: {} {}", achievement.badge(), achievement.name());
}
```

### Profile Integration

```rust
// Build profile with achievements
let profile = IdentityProfile::build_with_achievements(
    public_key,
    display_name,
    &level_manager,
    &contribution_store,
    &achievement_store,
    active_spaces,
)?;

// Check for specific achievement
if profile.has_achievement(Achievement::Centurion) {
    println!("100-day streak champion!");
}

// Display badges
println!("Badges: {}", profile.achievement_badges()); // "🌊 📡 📅"
```

### Event Subscription

```rust
// Subscribe to achievement unlock events
let mut rx = service.subscribe();

// In async context
tokio::spawn(async move {
    while let Ok(event) = rx.recv().await {
        match event {
            AchievementEvent::Unlocked { identity, achievement } => {
                println!("{:?} unlocked {}", identity, achievement.name());
            }
        }
    }
});
```

## Integration Points

The achievement service should be called from:

1. **Post creation** - Check for FirstStroke
2. **Content serving** - Check for FirstServe, BandwidthBaron, TerabyteClub
3. **Streak updates** - Check for WeekSwimmer, MonthSwimmer, Centurion
4. **Level changes** - Check for AnchorDrop via `service.update_level()`
5. **Space creation** - Check for LaneOpener
6. **Engagement PoW** - Check for KeeperOfTheFlame

## Placeholder Notes

Two achievements have provisional implementations:

### AlwaysOn
Requires daily uptime tracking at 95%+ threshold. Currently uses `days_at_95_percent_uptime` field which is not yet populated by the contribution system.

### EfficientSwimmer
Uses a provisional ratio of 2.0 (contribution_score / resource_cost). The exact ratio and resource cost calculation may be refined based on real-world data.

## Testing

The achievement module has 62 unit tests covering:

- All 12 achievement types
- Threshold boundaries (e.g., streak 6 vs 7)
- Permanence (duplicate unlock returns false)
- Serialization/deserialization
- Storage persistence
- Event emission
- Service integration

Run tests with:
```bash
cargo test --lib achievement
```

## Related Documentation

- [SPEC_09_SOCIAL_LAYER.md](../specs/SPEC_09_SOCIAL_LAYER.md) - Full specification
- [contribution-tracking.md](contribution-tracking.md) - Contribution metrics
- [swimmer-levels.md](swimmer-levels.md) - Level system
- [contribution-benefits.md](contribution-benefits.md) - Level benefits

---

*Last updated: 2025-12-26*
*Status: Implemented in Milestone 7.5*
