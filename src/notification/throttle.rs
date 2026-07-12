//! Notification throttling system
//!
//! Prevents notification spam with per-type cooldowns and global limits.
//! Per SPEC_09 §7 requirements for light-touch notifications.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sled::{Db, Tree};

use super::error::NotificationError;
use super::types::NotificationType;

/// Sled tree name for throttle state.
pub const THROTTLE_TREE: &str = "notification_throttle";

/// Default global daily notification limit.
pub const DEFAULT_DAILY_LIMIT: u16 = 10;

/// Cooldown for space health notifications (4 hours in seconds).
pub const SPACE_HEALTH_COOLDOWN_SECS: u64 = 4 * 60 * 60;

/// Cooldown for content risk notifications (24 hours in seconds).
pub const CONTENT_RISK_COOLDOWN_SECS: u64 = 24 * 60 * 60;

/// Seconds per day (for daily limit reset).
const SECONDS_PER_DAY: u64 = 24 * 60 * 60;

/// Milliseconds per second.
const MS_PER_SEC: u64 = 1000;

/// Throttle configuration.
///
/// Defines per-type cooldowns and global limits.
#[derive(Debug, Clone)]
pub struct ThrottleConfig {
    /// Per-type cooldown configurations
    pub type_cooldowns: HashMap<NotificationType, TypeCooldown>,

    /// Global daily notification limit
    pub daily_limit: u16,

    /// Optional quiet hours (start, end) in UTC (0-23)
    ///
    /// If set, notifications are blocked during these hours.
    /// Wraps around midnight: (22, 8) means 10PM to 8AM.
    pub quiet_hours: Option<(u8, u8)>,
}

impl Default for ThrottleConfig {
    fn default() -> Self {
        let mut type_cooldowns = HashMap::new();

        type_cooldowns.insert(
            NotificationType::Streak,
            TypeCooldown::PerMilestone {
                milestones: vec![7, 14, 30, 100],
            },
        );
        type_cooldowns.insert(NotificationType::LevelUp, TypeCooldown::PerLevelChange);
        type_cooldowns.insert(NotificationType::Achievement, TypeCooldown::PerAchievement);
        type_cooldowns.insert(
            NotificationType::SpaceHealth,
            TypeCooldown::Seconds(SPACE_HEALTH_COOLDOWN_SECS),
        );
        type_cooldowns.insert(
            NotificationType::ContentRisk,
            TypeCooldown::Seconds(CONTENT_RISK_COOLDOWN_SECS),
        );
        type_cooldowns.insert(
            NotificationType::ContributionThanks,
            TypeCooldown::PerPeriod,
        );

        Self {
            type_cooldowns,
            daily_limit: DEFAULT_DAILY_LIMIT,
            quiet_hours: None,
        }
    }
}

impl ThrottleConfig {
    /// Create config with custom daily limit.
    pub fn with_daily_limit(mut self, limit: u16) -> Self {
        self.daily_limit = limit;
        self
    }

    /// Create config with quiet hours.
    ///
    /// Hours are in UTC, 0-23. Wraps around midnight.
    pub fn with_quiet_hours(mut self, start: u8, end: u8) -> Self {
        self.quiet_hours = Some((start.min(23), end.min(23)));
        self
    }

    /// Check if the current time is within quiet hours.
    pub fn is_quiet_hour(&self, now_ms: u64) -> bool {
        if let Some((start, end)) = self.quiet_hours {
            let hour = ((now_ms / MS_PER_SEC / 3600) % 24) as u8;

            if start <= end {
                // Simple range: e.g., 9-17 (9AM to 5PM)
                hour >= start && hour < end
            } else {
                // Wraps around midnight: e.g., 22-8 (10PM to 8AM)
                hour >= start || hour < end
            }
        } else {
            false
        }
    }
}

/// Type-specific cooldown configuration.
#[derive(Debug, Clone)]
pub enum TypeCooldown {
    /// Once per milestone (for streaks: 7, 14, 30, 100).
    PerMilestone { milestones: Vec<u16> },

    /// Once per level change.
    PerLevelChange,

    /// Once per achievement (handled by achievement ID).
    PerAchievement,

    /// Minimum seconds between notifications.
    Seconds(u64),

    /// Once per period (week).
    PerPeriod,
}

/// Context for throttle decisions.
///
/// Provides the specific data needed to check throttling for each type.
#[derive(Debug, Clone)]
pub enum ThrottleContext {
    /// Streak context: the streak length/milestone
    Streak { days: u16 },

    /// Level context: the new level
    Level { new_level: u8 },

    /// Achievement context: the achievement ID
    Achievement { id: u8 },

    /// Space context: the space ID
    Space { space_id: [u8; 16] },

    /// Content risk context (no additional data)
    ContentRisk,

    /// Contribution context: the period number
    Contribution { period: u32 },
}

/// Persistent throttle state per identity.
///
/// Tracks what notifications have been sent to prevent spam.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThrottleState {
    /// Last notification timestamp per type+context key
    pub last_sent: HashMap<String, u64>,

    /// Notifications sent today (UTC day)
    pub daily_count: u16,

    /// UTC day of daily_count (days since epoch)
    pub daily_count_day: u32,

    /// Last notified streak milestones
    pub notified_streak_milestones: Vec<u16>,

    /// Last notified level
    pub last_notified_level: Option<u8>,

    /// Notified achievement IDs
    pub notified_achievements: Vec<u8>,

    /// Last notification time per space (for SpaceHealth)
    #[serde(default)]
    pub last_space_notify: HashMap<[u8; 16], u64>,

    /// Last notified period (for ContributionThanks)
    pub last_notified_period: Option<u32>,
}

impl ThrottleState {
    /// Create a new empty throttle state.
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the current UTC day from a millisecond timestamp.
    fn current_day(now_ms: u64) -> u32 {
        ((now_ms / MS_PER_SEC) / SECONDS_PER_DAY) as u32
    }

    /// Check if a notification can be sent based on throttle rules.
    ///
    /// Returns true if the notification is allowed.
    pub fn can_send(
        &self,
        notification_type: NotificationType,
        context: &ThrottleContext,
        config: &ThrottleConfig,
        now_ms: u64,
    ) -> bool {
        // Check quiet hours
        if config.is_quiet_hour(now_ms) {
            return false;
        }

        // Check daily limit
        let today = Self::current_day(now_ms);
        if self.daily_count_day == today && self.daily_count >= config.daily_limit {
            return false;
        }

        // Check type-specific cooldown
        let cooldown = match config.type_cooldowns.get(&notification_type) {
            Some(c) => c,
            None => return true, // No cooldown configured = allowed
        };

        match (cooldown, context) {
            (TypeCooldown::PerMilestone { milestones }, ThrottleContext::Streak { days }) => {
                // Find the milestone for this streak length
                let milestone = milestones.iter().filter(|&&m| *days >= m).max();
                if let Some(&m) = milestone {
                    !self.notified_streak_milestones.contains(&m)
                } else {
                    false // Below first milestone
                }
            }

            (TypeCooldown::PerLevelChange, ThrottleContext::Level { new_level }) => {
                match self.last_notified_level {
                    None => true,
                    Some(last) => *new_level > last,
                }
            }

            (TypeCooldown::PerAchievement, ThrottleContext::Achievement { id }) => {
                !self.notified_achievements.contains(id)
            }

            (TypeCooldown::Seconds(cooldown_secs), ThrottleContext::Space { space_id }) => {
                match self.last_space_notify.get(space_id) {
                    None => true,
                    Some(&last_ms) => {
                        let elapsed_secs = (now_ms.saturating_sub(last_ms)) / MS_PER_SEC;
                        elapsed_secs >= *cooldown_secs
                    }
                }
            }

            (TypeCooldown::Seconds(cooldown_secs), ThrottleContext::ContentRisk) => {
                let key = "content_risk".to_string();
                match self.last_sent.get(&key) {
                    None => true,
                    Some(&last_ms) => {
                        let elapsed_secs = (now_ms.saturating_sub(last_ms)) / MS_PER_SEC;
                        elapsed_secs >= *cooldown_secs
                    }
                }
            }

            (TypeCooldown::PerPeriod, ThrottleContext::Contribution { period }) => {
                match self.last_notified_period {
                    None => true,
                    Some(last) => *period > last,
                }
            }

            // Mismatched context for cooldown type
            _ => true,
        }
    }

    /// Record that a notification was sent.
    ///
    /// Updates the throttle state to prevent duplicate notifications.
    pub fn record_sent(
        &mut self,
        notification_type: NotificationType,
        context: &ThrottleContext,
        now_ms: u64,
    ) {
        // Update daily count
        let today = Self::current_day(now_ms);
        if self.daily_count_day != today {
            self.daily_count = 1;
            self.daily_count_day = today;
        } else {
            self.daily_count += 1;
        }

        // Update type-specific state
        match context {
            ThrottleContext::Streak { days } => {
                // Record all milestones up to and including this one
                for &m in &[7u16, 14, 30, 100] {
                    if *days >= m && !self.notified_streak_milestones.contains(&m) {
                        self.notified_streak_milestones.push(m);
                    }
                }
            }

            ThrottleContext::Level { new_level } => {
                self.last_notified_level = Some(*new_level);
            }

            ThrottleContext::Achievement { id } => {
                if !self.notified_achievements.contains(id) {
                    self.notified_achievements.push(*id);
                }
            }

            ThrottleContext::Space { space_id } => {
                self.last_space_notify.insert(*space_id, now_ms);
            }

            ThrottleContext::ContentRisk => {
                self.last_sent.insert("content_risk".to_string(), now_ms);
            }

            ThrottleContext::Contribution { period } => {
                self.last_notified_period = Some(*period);
            }
        }

        // Record generic last_sent for type
        let key = format!("{:?}", notification_type);
        self.last_sent.insert(key, now_ms);
    }

    /// Reset all throttle state (for testing).
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Stored format for throttle state - versioned for future migrations.
#[derive(Debug, Serialize, Deserialize)]
struct StoredThrottleState {
    version: u8,
    state: ThrottleState,
}

impl StoredThrottleState {
    const CURRENT_VERSION: u8 = 1;

    fn new(state: ThrottleState) -> Self {
        Self {
            version: Self::CURRENT_VERSION,
            state,
        }
    }
}

/// Persistent storage for throttle state.
pub struct ThrottleStore {
    tree: Tree,
}

impl ThrottleStore {
    /// Create a new throttle store using the given sled database.
    pub fn new(db: &Db) -> Result<Self, NotificationError> {
        let tree = db.open_tree(THROTTLE_TREE)?;
        Ok(Self { tree })
    }

    /// Load throttle state for an identity.
    ///
    /// Returns empty state if none exists.
    pub fn load(&self, identity: &[u8; 32]) -> Result<ThrottleState, NotificationError> {
        match self.tree.get(identity)? {
            None => Ok(ThrottleState::new()),
            Some(bytes) => {
                let stored: StoredThrottleState = bincode::deserialize(&bytes)?;
                Ok(stored.state)
            }
        }
    }

    /// Save throttle state for an identity.
    pub fn save(
        &self,
        identity: &[u8; 32],
        state: &ThrottleState,
    ) -> Result<(), NotificationError> {
        let stored = StoredThrottleState::new(state.clone());
        let bytes = bincode::serialize(&stored)?;
        self.tree.insert(identity, bytes)?;
        self.tree.flush()?;
        Ok(())
    }

    /// Clear throttle state for an identity.
    pub fn clear(&self, identity: &[u8; 32]) -> Result<(), NotificationError> {
        self.tree.remove(identity)?;
        self.tree.flush()?;
        Ok(())
    }

    /// Get count of identities with throttle state.
    pub fn identity_count(&self) -> usize {
        self.tree.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_db() -> (TempDir, Db) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        (temp_dir, db)
    }

    const BASE_MS: u64 = 1735689600000; // 2025-01-01 00:00:00 UTC

    #[test]
    fn test_default_config() {
        let config = ThrottleConfig::default();
        assert_eq!(config.daily_limit, 10);
        assert!(config.quiet_hours.is_none());
        assert_eq!(config.type_cooldowns.len(), 6);
    }

    #[test]
    fn test_quiet_hours_simple_range() {
        let config = ThrottleConfig::default().with_quiet_hours(9, 17);

        // 9AM - in quiet hours
        let nine_am = BASE_MS + (9 * 3600 * 1000);
        assert!(config.is_quiet_hour(nine_am));

        // 5PM - at end of quiet hours (not included)
        let five_pm = BASE_MS + (17 * 3600 * 1000);
        assert!(!config.is_quiet_hour(five_pm));

        // 8AM - before quiet hours
        let eight_am = BASE_MS + (8 * 3600 * 1000);
        assert!(!config.is_quiet_hour(eight_am));
    }

    #[test]
    fn test_quiet_hours_wrap_around() {
        let config = ThrottleConfig::default().with_quiet_hours(22, 8);

        // 11PM - in quiet hours
        let eleven_pm = BASE_MS + (23 * 3600 * 1000);
        assert!(config.is_quiet_hour(eleven_pm));

        // 3AM - in quiet hours (after midnight)
        let three_am = BASE_MS + (3 * 3600 * 1000);
        assert!(config.is_quiet_hour(three_am));

        // 12PM - not in quiet hours
        let noon = BASE_MS + (12 * 3600 * 1000);
        assert!(!config.is_quiet_hour(noon));
    }

    #[test]
    fn test_daily_limit() {
        let config = ThrottleConfig::default().with_daily_limit(5);
        let mut state = ThrottleState::new();

        // Send 5 notifications
        for _ in 0..5 {
            state.record_sent(
                NotificationType::Achievement,
                &ThrottleContext::Achievement { id: 0 },
                BASE_MS,
            );
        }

        // 6th should be blocked
        assert!(!state.can_send(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 7 },
            &config,
            BASE_MS,
        ));
    }

    #[test]
    fn test_daily_limit_resets() {
        let config = ThrottleConfig::default().with_daily_limit(5);
        let mut state = ThrottleState::new();

        // Max out today
        for _ in 0..5 {
            state.record_sent(
                NotificationType::Achievement,
                &ThrottleContext::Achievement { id: 0 },
                BASE_MS,
            );
        }

        // Next day should allow
        let next_day_ms = BASE_MS + (24 * 60 * 60 * 1000);
        assert!(state.can_send(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 7 },
            &config,
            next_day_ms,
        ));
    }

    #[test]
    fn test_streak_milestone_throttle() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();

        // First 7-day notification allowed
        assert!(state.can_send(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 7 },
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 7 },
            BASE_MS,
        );

        // Same milestone blocked
        assert!(!state.can_send(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 7 },
            &config,
            BASE_MS + 1000,
        ));

        // Next milestone allowed (14)
        assert!(state.can_send(
            NotificationType::Streak,
            &ThrottleContext::Streak { days: 14 },
            &config,
            BASE_MS + 1000,
        ));
    }

    #[test]
    fn test_level_change_throttle() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();

        // First level up allowed
        assert!(state.can_send(
            NotificationType::LevelUp,
            &ThrottleContext::Level { new_level: 2 },
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::LevelUp,
            &ThrottleContext::Level { new_level: 2 },
            BASE_MS,
        );

        // Same level blocked
        assert!(!state.can_send(
            NotificationType::LevelUp,
            &ThrottleContext::Level { new_level: 2 },
            &config,
            BASE_MS + 1000,
        ));

        // Higher level allowed
        assert!(state.can_send(
            NotificationType::LevelUp,
            &ThrottleContext::Level { new_level: 3 },
            &config,
            BASE_MS + 1000,
        ));
    }

    #[test]
    fn test_achievement_throttle() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();

        // First achievement allowed
        assert!(state.can_send(
            NotificationType::Achievement,
            &ThrottleContext::Achievement { id: 0 },
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::Achievement,
            &ThrottleContext::Achievement { id: 0 },
            BASE_MS,
        );

        // Same achievement blocked
        assert!(!state.can_send(
            NotificationType::Achievement,
            &ThrottleContext::Achievement { id: 0 },
            &config,
            BASE_MS + 1000,
        ));

        // Different achievement allowed
        assert!(state.can_send(
            NotificationType::Achievement,
            &ThrottleContext::Achievement { id: 1 },
            &config,
            BASE_MS + 1000,
        ));
    }

    #[test]
    fn test_space_health_cooldown() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();
        let space_id = [1u8; 16];

        // First notification allowed
        assert!(state.can_send(
            NotificationType::SpaceHealth,
            &ThrottleContext::Space { space_id },
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::SpaceHealth,
            &ThrottleContext::Space { space_id },
            BASE_MS,
        );

        // Same space within 4 hours blocked
        let two_hours_later = BASE_MS + (2 * 60 * 60 * 1000);
        assert!(!state.can_send(
            NotificationType::SpaceHealth,
            &ThrottleContext::Space { space_id },
            &config,
            two_hours_later,
        ));

        // Different space allowed
        let other_space = [2u8; 16];
        assert!(state.can_send(
            NotificationType::SpaceHealth,
            &ThrottleContext::Space {
                space_id: other_space
            },
            &config,
            two_hours_later,
        ));

        // Same space after 4 hours allowed
        let five_hours_later = BASE_MS + (5 * 60 * 60 * 1000);
        assert!(state.can_send(
            NotificationType::SpaceHealth,
            &ThrottleContext::Space { space_id },
            &config,
            five_hours_later,
        ));
    }

    #[test]
    fn test_content_risk_cooldown() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();

        // First notification allowed
        assert!(state.can_send(
            NotificationType::ContentRisk,
            &ThrottleContext::ContentRisk,
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::ContentRisk,
            &ThrottleContext::ContentRisk,
            BASE_MS,
        );

        // Within 24 hours blocked
        let twelve_hours_later = BASE_MS + (12 * 60 * 60 * 1000);
        assert!(!state.can_send(
            NotificationType::ContentRisk,
            &ThrottleContext::ContentRisk,
            &config,
            twelve_hours_later,
        ));

        // After 24 hours allowed
        let twenty_five_hours_later = BASE_MS + (25 * 60 * 60 * 1000);
        assert!(state.can_send(
            NotificationType::ContentRisk,
            &ThrottleContext::ContentRisk,
            &config,
            twenty_five_hours_later,
        ));
    }

    #[test]
    fn test_contribution_per_period() {
        let config = ThrottleConfig::default();
        let mut state = ThrottleState::new();

        // Period 1 allowed
        assert!(state.can_send(
            NotificationType::ContributionThanks,
            &ThrottleContext::Contribution { period: 1 },
            &config,
            BASE_MS,
        ));

        state.record_sent(
            NotificationType::ContributionThanks,
            &ThrottleContext::Contribution { period: 1 },
            BASE_MS,
        );

        // Same period blocked
        assert!(!state.can_send(
            NotificationType::ContributionThanks,
            &ThrottleContext::Contribution { period: 1 },
            &config,
            BASE_MS + 1000,
        ));

        // Next period allowed
        assert!(state.can_send(
            NotificationType::ContributionThanks,
            &ThrottleContext::Contribution { period: 2 },
            &config,
            BASE_MS + 1000,
        ));
    }

    #[test]
    fn test_store_save_and_load() {
        let (_temp, db) = create_test_db();
        let store = ThrottleStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let mut state = ThrottleState::new();
        state.notified_streak_milestones.push(7);
        state.last_notified_level = Some(2);
        state.daily_count = 5;

        store.save(&identity, &state).unwrap();

        let loaded = store.load(&identity).unwrap();
        assert_eq!(loaded.notified_streak_milestones, vec![7]);
        assert_eq!(loaded.last_notified_level, Some(2));
        assert_eq!(loaded.daily_count, 5);
    }

    #[test]
    fn test_store_clear() {
        let (_temp, db) = create_test_db();
        let store = ThrottleStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let state = ThrottleState::new();
        store.save(&identity, &state).unwrap();

        assert_eq!(store.identity_count(), 1);

        store.clear(&identity).unwrap();
        assert_eq!(store.identity_count(), 0);

        // Load should return default
        let loaded = store.load(&identity).unwrap();
        assert!(loaded.notified_streak_milestones.is_empty());
    }

    #[test]
    fn test_serialization() {
        let mut state = ThrottleState::new();
        state.notified_streak_milestones = vec![7, 14];
        state.last_notified_level = Some(3);
        state.notified_achievements = vec![0, 2, 5];
        state.daily_count = 3;
        state.daily_count_day = 19721;

        let serialized = bincode::serialize(&state).unwrap();
        let deserialized: ThrottleState = bincode::deserialize(&serialized).unwrap();

        assert_eq!(
            state.notified_streak_milestones,
            deserialized.notified_streak_milestones
        );
        assert_eq!(state.last_notified_level, deserialized.last_notified_level);
        assert_eq!(
            state.notified_achievements,
            deserialized.notified_achievements
        );
        assert_eq!(state.daily_count, deserialized.daily_count);
    }
}
