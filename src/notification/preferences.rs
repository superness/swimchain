//! Notification preferences storage
//!
//! Implements user notification preferences per SPEC_09 Section 7.2.
//! Users control which types of notifications they receive.

use serde::{Deserialize, Serialize};
use sled::{Db, Tree};

use super::error::NotificationError;
use super::types::NotificationType;

/// Sled tree name for notification preferences.
pub const PREFERENCES_TREE: &str = "notification_preferences";

/// User notification preferences per SPEC_09 §7.2.
///
/// Controls which types of notifications are shown. All default to true
/// (opt-out rather than opt-in).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationPreferences {
    /// Show streak notifications (7, 14, 30, 100 day milestones)
    pub streak_notifications: bool,

    /// Show level/achievement notifications
    pub achievement_notifications: bool,

    /// Show space health nudges ("space could use an anchor")
    pub space_health_nudges: bool,

    /// Show content decay warnings ("3 posts decay tomorrow")
    pub decay_warnings: bool,

    /// Minimum streak length to notify (default: 7)
    ///
    /// Only streaks >= this threshold trigger notifications.
    /// For example, if set to 14, the first notification would be
    /// at 14 days instead of 7 days.
    pub streak_notify_threshold: u16,
}

impl Default for NotificationPreferences {
    fn default() -> Self {
        Self {
            streak_notifications: true,
            achievement_notifications: true,
            space_health_nudges: true,
            decay_warnings: true,
            streak_notify_threshold: 7,
        }
    }
}

impl NotificationPreferences {
    /// Create preferences with all notifications enabled.
    pub fn all_enabled() -> Self {
        Self::default()
    }

    /// Create preferences with all notifications disabled.
    pub fn all_disabled() -> Self {
        Self {
            streak_notifications: false,
            achievement_notifications: false,
            space_health_nudges: false,
            decay_warnings: false,
            streak_notify_threshold: 7,
        }
    }

    /// Check if a notification type is enabled.
    pub fn is_enabled(&self, notification_type: NotificationType) -> bool {
        match notification_type {
            NotificationType::Streak => self.streak_notifications,
            NotificationType::LevelUp => self.achievement_notifications,
            NotificationType::Achievement => self.achievement_notifications,
            NotificationType::SpaceHealth => self.space_health_nudges,
            NotificationType::ContentRisk => self.decay_warnings,
            NotificationType::ContributionThanks => true, // Always enabled (not spam-like)
            // Always enabled: formations are rare (per-space ~14-day
            // cooldown), once-per-community, and graduation recognition —
            // not spam-like (SPEC_13 Phase 2).
            NotificationType::CommunityFormed => true,
        }
    }

    /// Check if a streak milestone should trigger a notification.
    ///
    /// Returns true if streak notifications are enabled AND the milestone
    /// is >= the threshold.
    pub fn should_notify_streak(&self, milestone: u16) -> bool {
        self.streak_notifications && milestone >= self.streak_notify_threshold
    }

    /// Builder method to set streak notifications.
    pub fn with_streak_notifications(mut self, enabled: bool) -> Self {
        self.streak_notifications = enabled;
        self
    }

    /// Builder method to set achievement notifications.
    pub fn with_achievement_notifications(mut self, enabled: bool) -> Self {
        self.achievement_notifications = enabled;
        self
    }

    /// Builder method to set space health nudges.
    pub fn with_space_health_nudges(mut self, enabled: bool) -> Self {
        self.space_health_nudges = enabled;
        self
    }

    /// Builder method to set decay warnings.
    pub fn with_decay_warnings(mut self, enabled: bool) -> Self {
        self.decay_warnings = enabled;
        self
    }

    /// Builder method to set streak notify threshold.
    pub fn with_streak_threshold(mut self, threshold: u16) -> Self {
        self.streak_notify_threshold = threshold;
        self
    }
}

/// Stored format for preferences - versioned for future migrations.
#[derive(Debug, Serialize, Deserialize)]
struct StoredPreferences {
    /// Storage format version (currently 1)
    version: u8,
    /// The preferences
    prefs: NotificationPreferences,
}

impl StoredPreferences {
    const CURRENT_VERSION: u8 = 1;

    fn new(prefs: NotificationPreferences) -> Self {
        Self {
            version: Self::CURRENT_VERSION,
            prefs,
        }
    }
}

/// Persistent storage for notification preferences.
///
/// Stores per-identity preferences using sled.
pub struct PreferencesStore {
    /// The sled tree for preferences storage
    tree: Tree,
}

impl PreferencesStore {
    /// Create a new preferences store using the given sled database.
    ///
    /// Opens or creates the "notification_preferences" tree.
    pub fn new(db: &Db) -> Result<Self, NotificationError> {
        let tree = db.open_tree(PREFERENCES_TREE)?;
        Ok(Self { tree })
    }

    /// Load preferences for an identity.
    ///
    /// Returns default preferences if none are stored.
    pub fn load(&self, identity: &[u8; 32]) -> Result<NotificationPreferences, NotificationError> {
        match self.tree.get(identity)? {
            None => Ok(NotificationPreferences::default()),
            Some(bytes) => {
                let stored: StoredPreferences = bincode::deserialize(&bytes)?;
                Ok(stored.prefs)
            }
        }
    }

    /// Save preferences for an identity.
    pub fn save(
        &self,
        identity: &[u8; 32],
        prefs: &NotificationPreferences,
    ) -> Result<(), NotificationError> {
        let stored = StoredPreferences::new(prefs.clone());
        let bytes = bincode::serialize(&stored)?;
        self.tree.insert(identity, bytes)?;
        self.tree.flush()?;
        Ok(())
    }

    /// Check if an identity has custom preferences.
    pub fn has_preferences(&self, identity: &[u8; 32]) -> Result<bool, NotificationError> {
        Ok(self.tree.contains_key(identity)?)
    }

    /// Reset preferences to defaults for an identity.
    pub fn reset(&self, identity: &[u8; 32]) -> Result<(), NotificationError> {
        self.tree.remove(identity)?;
        self.tree.flush()?;
        Ok(())
    }

    /// Get the count of identities with custom preferences.
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

    #[test]
    fn test_default_preferences() {
        let prefs = NotificationPreferences::default();
        assert!(prefs.streak_notifications);
        assert!(prefs.achievement_notifications);
        assert!(prefs.space_health_nudges);
        assert!(prefs.decay_warnings);
        assert_eq!(prefs.streak_notify_threshold, 7);
    }

    #[test]
    fn test_all_disabled() {
        let prefs = NotificationPreferences::all_disabled();
        assert!(!prefs.streak_notifications);
        assert!(!prefs.achievement_notifications);
        assert!(!prefs.space_health_nudges);
        assert!(!prefs.decay_warnings);
    }

    #[test]
    fn test_is_enabled() {
        let prefs = NotificationPreferences::default()
            .with_streak_notifications(false)
            .with_decay_warnings(false);

        assert!(!prefs.is_enabled(NotificationType::Streak));
        assert!(prefs.is_enabled(NotificationType::LevelUp));
        assert!(prefs.is_enabled(NotificationType::Achievement));
        assert!(prefs.is_enabled(NotificationType::SpaceHealth));
        assert!(!prefs.is_enabled(NotificationType::ContentRisk));
        assert!(prefs.is_enabled(NotificationType::ContributionThanks)); // Always enabled
    }

    #[test]
    fn test_should_notify_streak() {
        let prefs = NotificationPreferences::default().with_streak_threshold(14);

        // Below threshold
        assert!(!prefs.should_notify_streak(7));

        // At threshold
        assert!(prefs.should_notify_streak(14));

        // Above threshold
        assert!(prefs.should_notify_streak(30));

        // With notifications disabled
        let disabled = NotificationPreferences::default().with_streak_notifications(false);
        assert!(!disabled.should_notify_streak(7));
        assert!(!disabled.should_notify_streak(30));
    }

    #[test]
    fn test_builder_pattern() {
        let prefs = NotificationPreferences::default()
            .with_streak_notifications(false)
            .with_achievement_notifications(true)
            .with_space_health_nudges(false)
            .with_decay_warnings(true)
            .with_streak_threshold(30);

        assert!(!prefs.streak_notifications);
        assert!(prefs.achievement_notifications);
        assert!(!prefs.space_health_nudges);
        assert!(prefs.decay_warnings);
        assert_eq!(prefs.streak_notify_threshold, 30);
    }

    #[test]
    fn test_store_creation() {
        let (_temp, db) = create_test_db();
        let store = PreferencesStore::new(&db).unwrap();
        assert_eq!(store.identity_count(), 0);
    }

    #[test]
    fn test_load_default() {
        let (_temp, db) = create_test_db();
        let store = PreferencesStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let prefs = store.load(&identity).unwrap();

        // Should get defaults for missing identity
        assert_eq!(prefs, NotificationPreferences::default());
        assert!(!store.has_preferences(&identity).unwrap());
    }

    #[test]
    fn test_save_and_load() {
        let (_temp, db) = create_test_db();
        let store = PreferencesStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let prefs = NotificationPreferences::default()
            .with_streak_notifications(false)
            .with_streak_threshold(14);

        store.save(&identity, &prefs).unwrap();
        assert!(store.has_preferences(&identity).unwrap());
        assert_eq!(store.identity_count(), 1);

        let loaded = store.load(&identity).unwrap();
        assert_eq!(prefs, loaded);
    }

    #[test]
    fn test_reset() {
        let (_temp, db) = create_test_db();
        let store = PreferencesStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let prefs = NotificationPreferences::all_disabled();

        store.save(&identity, &prefs).unwrap();
        assert!(store.has_preferences(&identity).unwrap());

        store.reset(&identity).unwrap();
        assert!(!store.has_preferences(&identity).unwrap());

        // Should get defaults after reset
        let loaded = store.load(&identity).unwrap();
        assert_eq!(loaded, NotificationPreferences::default());
    }

    #[test]
    fn test_multiple_identities() {
        let (_temp, db) = create_test_db();
        let store = PreferencesStore::new(&db).unwrap();

        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];

        let prefs1 = NotificationPreferences::default().with_streak_notifications(false);
        let prefs2 = NotificationPreferences::default().with_decay_warnings(false);

        store.save(&identity1, &prefs1).unwrap();
        store.save(&identity2, &prefs2).unwrap();

        assert_eq!(store.identity_count(), 2);

        let loaded1 = store.load(&identity1).unwrap();
        let loaded2 = store.load(&identity2).unwrap();

        assert!(!loaded1.streak_notifications);
        assert!(loaded1.decay_warnings);

        assert!(loaded2.streak_notifications);
        assert!(!loaded2.decay_warnings);
    }

    #[test]
    fn test_persistence_across_reopen() {
        let temp_dir = TempDir::new().unwrap();
        let identity = [42u8; 32];

        // First session
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = PreferencesStore::new(&db).unwrap();

            let prefs = NotificationPreferences::all_disabled();
            store.save(&identity, &prefs).unwrap();
        }

        // Second session
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = PreferencesStore::new(&db).unwrap();

            let loaded = store.load(&identity).unwrap();
            assert!(!loaded.streak_notifications);
            assert!(!loaded.achievement_notifications);
            assert!(!loaded.space_health_nudges);
            assert!(!loaded.decay_warnings);
        }
    }

    #[test]
    fn test_serialization() {
        let prefs = NotificationPreferences::default()
            .with_streak_notifications(false)
            .with_streak_threshold(100);

        let serialized = bincode::serialize(&prefs).unwrap();
        let deserialized: NotificationPreferences = bincode::deserialize(&serialized).unwrap();

        assert_eq!(prefs, deserialized);
    }
}
