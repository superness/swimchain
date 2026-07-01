# Notification System

**Reference:** SPEC_09 Section 7 (Notifications and Nudges)
**Module:** `src/notification/`
**Status:** Implemented (Milestone 7.9)

---

## Overview

The notification system provides light-touch notifications to encourage participation without creating notification fatigue. Notifications are **local to the client** and do not use the wire protocol—there is no `MSG_NOTIFICATION` message type.

Key design principles:
- **Non-intrusive:** Notifications are helpful nudges, not demands
- **Configurable:** Users control what they receive via preferences
- **Throttled:** Per-type cooldowns and daily limits prevent spam
- **Ephemeral:** Notifications expire after 30 days

---

## Notification Types

Per SPEC_09 §7.1, there are 6 notification types:

| Type | When | Message Example | Throttle |
|------|------|-----------------|----------|
| **Streak** | Streak milestone (7, 14, 30, 100 days) | "🔥 7-day streak! Keep swimming!" | Per milestone |
| **LevelUp** | Level increases | "⬆️ You're now a Resident!" | Per level change |
| **Achievement** | Achievement earned | "🎉 Earned: Keeper of the Flame" | Per achievement |
| **SpaceHealth** | Space needs help (health < 50%) | "/gardening could use an anchor" | 4 hours per space |
| **ContentRisk** | Your content at risk | "3 of your posts decay tomorrow" | 24 hours |
| **ContributionThanks** | Significant contribution | "You kept 50 posts alive this week!" | Per period (weekly) |

---

## Module Structure

```
src/notification/
├── mod.rs           # Module exports and documentation
├── error.rs         # NotificationError enum
├── types.rs         # NotificationType, Notification, NotificationContext
├── preferences.rs   # NotificationPreferences, PreferencesStore
├── throttle.rs      # ThrottleConfig, ThrottleState, ThrottleStore
├── triggers.rs      # TriggerSources, TriggerEvent, detect_* functions
├── storage.rs       # NotificationStore with 30-day expiry
└── service.rs       # NotificationService coordinator
```

---

## Preferences

Per SPEC_09 §7.2, users control notification volume:

```rust
pub struct NotificationPreferences {
    /// Show streak notifications (default: true)
    pub streak_notifications: bool,

    /// Show level/achievement notifications (default: true)
    pub achievement_notifications: bool,

    /// Show space health nudges (default: true)
    pub space_health_nudges: bool,

    /// Show content decay warnings (default: true)
    pub decay_warnings: bool,

    /// Minimum streak length to notify (default: 7)
    pub streak_notify_threshold: u16,
}
```

**Defaults:** All notifications are enabled by default (opt-out model).

**Storage:** Preferences are stored in the `notification_preferences` sled tree.

---

## Throttling

Each notification type has specific throttling to prevent spam:

### Per-Type Cooldowns

| Type | Cooldown Strategy |
|------|-------------------|
| Streak | Once per milestone (7 → 14 → 30 → 100) |
| LevelUp | Once per level change |
| Achievement | Once per achievement (by ID) |
| SpaceHealth | 4 hours per space |
| ContentRisk | 24 hours |
| ContributionThanks | Once per period (weekly) |

### Global Limits

- **Daily limit:** Maximum 10 notifications per day (configurable)
- **Quiet hours:** Optional time window where notifications are blocked

### Throttle State

Per-identity throttle state is persisted in the `notification_throttle` sled tree:

```rust
pub struct ThrottleState {
    /// Last notification timestamp per type+context
    pub last_sent: HashMap<String, u64>,
    /// Notifications sent today (UTC day)
    pub daily_count: u16,
    /// UTC day of daily_count
    pub daily_count_day: u32,
    /// Notified streak milestones
    pub notified_streak_milestones: Vec<u16>,
    /// Last notified level
    pub last_notified_level: Option<u8>,
    /// Notified achievement IDs
    pub notified_achievements: Vec<u8>,
    /// Last notify time per space (for SpaceHealth)
    pub last_space_notify: HashMap<[u8; 16], u64>,
    /// Last notified period (for ContributionThanks)
    pub last_notified_period: Option<u32>,
}
```

---

## Trigger Sources

Notifications are triggered by changes in other services:

| Notification | Trigger Source | Event |
|--------------|----------------|-------|
| Streak | StreakTracker | `record_activity()` updates streak |
| LevelUp | LevelManager | `compute_level()` returns higher level |
| Achievement | AchievementService | `AchievementEvent::Unlocked` |
| SpaceHealth | SpaceHealthManager | Periodic check finds health < 50% |
| ContentRisk | AttributionManager | `decay_countdown_days()` < 3 |
| ContributionThanks | ContributionStore | Weekly period change |

The `TriggerSources` struct holds optional references to these services:

```rust
pub struct TriggerSources {
    pub streak_store: Option<Arc<ContributionStore>>,
    pub level_manager: Option<Arc<LevelManager>>,
    pub achievement_service: Option<Arc<AchievementService>>,
    pub space_health_manager: Option<Arc<SpaceHealthManager>>,
    pub attribution_manager: Option<Arc<AttributionManager>>,
}
```

All references are `Option<Arc<...>>` for graceful degradation when some systems are unavailable.

---

## API Usage

### Creating the Service

```rust
use swimchain::notification::{NotificationService, TriggerSources};

let db = sled::open("my_db")?;
let sources = TriggerSources::default();
let service = NotificationService::new(&db, sources)?;
```

### Checking for Notifications

Call the appropriate `check_*` method when relevant events occur:

```rust
// When streak changes
let notification = service.check_streak(&identity, current_streak, now_ms)?;

// When level changes
let notification = service.check_level_up(&identity, new_level, now_ms)?;

// When achievement unlocks
let notification = service.check_achievement(&identity, achievement, now_ms)?;

// Periodic checks
let notification = service.check_space_health(&identity, space_id, health, name, now_ms)?;
let notification = service.check_content_risk(&identity, count, days_remaining, now_ms)?;
let notification = service.check_contribution_thanks(&identity, posts, period, now_ms)?;
```

### Retrieving Notifications

```rust
// Get unread notifications
let pending = service.get_pending(&identity, 10)?;

// Get all notifications (including read)
let all = service.get_all(&identity, 50)?;

// Count unread
let count = service.count_unread(&identity)?;
```

### Managing Notifications

```rust
// Mark as read
service.mark_read(&identity, notification_id)?;

// Mark all as read
service.mark_all_read(&identity)?;

// Clear all
service.clear_all(&identity)?;

// Prune expired (30+ days old)
service.prune_expired(&identity, now_ms)?;
```

### Preferences

```rust
// Get preferences (returns defaults if none set)
let prefs = service.get_preferences(&identity)?;

// Set preferences
let new_prefs = NotificationPreferences::default()
    .with_streak_notifications(false)
    .with_streak_threshold(14);
service.set_preferences(&identity, new_prefs)?;
```

---

## Event Subscription

Subscribe to notification events for real-time UI updates:

```rust
let mut rx = service.subscribe();

// In async context
while let Ok(event) = rx.recv().await {
    match event {
        NotificationEvent::Emitted { identity, notification } => {
            println!("New: {}", notification.message);
        }
        NotificationEvent::Read { identity, notification_id } => {
            println!("Read: {:?}", notification_id);
        }
        NotificationEvent::Cleared { identity, count } => {
            println!("Cleared {} notifications", count);
        }
    }
}
```

---

## Storage

Notifications are stored in the `notifications` sled tree with the key format:

```
identity[32] || created_at_ms[8 BE] || notification_id[16]
```

- **32 bytes:** Identity public key
- **8 bytes:** Creation timestamp (big-endian for natural ordering)
- **16 bytes:** Notification UUID

This format enables:
- Efficient range scans per identity
- Natural newest-first ordering (reversed iteration)
- O(log n) lookup by notification ID

### Expiry

Notifications automatically expire after 30 days. Call `prune_expired()` periodically to clean up:

```rust
// Prune expired notifications for an identity
let pruned = service.prune_expired(&identity, now_ms)?;
println!("Pruned {} expired notifications", pruned);
```

---

## API Events

The notification system integrates with the API event layer:

```rust
/// Notification-related API events
pub enum NotificationApiEvent {
    /// A new notification was generated
    New {
        notification_id: [u8; 16],
        notification_type: String,
        message: String,
    },
    /// A notification was marked as read
    Read { notification_id: [u8; 16] },
    /// Notifications were cleared
    Cleared { count: usize },
}
```

These events can be forwarded to UI clients for real-time updates.

---

## Integration Points

The notification system integrates with:

1. **Achievement System** (`src/achievement/`)
   - Subscribe to `AchievementEvent::Unlocked`
   - Call `check_achievement()` when achievements unlock

2. **Level System** (`src/level/`)
   - Call `check_level_up()` when level is computed

3. **Contribution System** (`src/contribution/`)
   - Read streak from StreakTracker
   - Call `check_streak()` after `record_activity()`

4. **Space Health** (`src/space_health/`)
   - Periodic check for low health spaces
   - Call `check_space_health()` for participating spaces

5. **Attribution** (`src/attribution/`)
   - Check decay countdown for user's content
   - Call `check_content_risk()` when content is at risk

---

## Configuration

### ThrottleConfig

```rust
let config = ThrottleConfig::default()
    .with_daily_limit(15)           // Max 15 notifications per day
    .with_quiet_hours(22, 8);       // Block from 10PM to 8AM UTC

let service = NotificationService::with_config(&db, sources, config)?;
```

### Default Values

| Setting | Default |
|---------|---------|
| Daily limit | 10 |
| Quiet hours | None (disabled) |
| Streak milestones | [7, 14, 30, 100] |
| SpaceHealth cooldown | 4 hours |
| ContentRisk cooldown | 24 hours |
| Notification expiry | 30 days |

---

## Testing

Run the notification module tests:

```bash
cargo test notification
```

Key test cases:
- `test_streak_notification_milestone_7` - 7-day streak triggers notification
- `test_streak_notification_idempotent` - Same milestone doesn't trigger twice
- `test_streak_threshold` - Preferences threshold is respected
- `test_daily_limit_reached` - 11th notification is blocked
- `test_space_health_throttle` - 4-hour cooldown per space
- `test_content_risk_24h_throttle` - 24-hour cooldown
- `test_persistence` - Notifications survive restart

---

## Changelog

### Milestone 7.9 (2025-12-26)
- Initial implementation
- All 6 notification types per SPEC_09 §7.1
- NotificationPreferences per SPEC_09 §7.2
- Throttling system with per-type cooldowns
- 30-day notification expiry
- API event integration
