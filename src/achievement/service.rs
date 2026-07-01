//! Achievement service for integration with other modules
//!
//! Provides the main entry point for checking and unlocking achievements.
//! Coordinates between storage, tracker, and trigger detection.

use std::sync::Arc;

use tokio::sync::broadcast;

use super::error::AchievementError;
use super::storage::AchievementStore;
use super::tracker::AchievementTracker;
use super::triggers::{check_triggers, TriggerContext};
use super::types::Achievement;

/// Size of the event broadcast channel
const EVENT_CHANNEL_SIZE: usize = 256;

/// Events emitted by the achievement service.
#[derive(Debug, Clone)]
pub enum AchievementEvent {
    /// An achievement was unlocked for an identity
    Unlocked {
        /// The identity that unlocked the achievement
        identity: [u8; 32],
        /// The achievement that was unlocked
        achievement: Achievement,
    },
}

/// Achievement service coordinates achievement checking and unlocking.
///
/// This is the main integration point for the achievement system.
/// Other modules call this service after relevant events (post created,
/// bandwidth served, level changed, etc.).
pub struct AchievementService {
    /// Persistent storage for achievements
    store: Arc<AchievementStore>,

    /// Event broadcaster for unlock notifications
    event_tx: broadcast::Sender<AchievementEvent>,
}

impl AchievementService {
    /// Create a new achievement service with the given store.
    pub fn new(store: Arc<AchievementStore>) -> Self {
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_SIZE);
        Self { store, event_tx }
    }

    /// Subscribe to achievement events.
    ///
    /// Returns a receiver that will receive all future achievement unlock events.
    pub fn subscribe(&self) -> broadcast::Receiver<AchievementEvent> {
        self.event_tx.subscribe()
    }

    /// Check triggers and unlock any new achievements.
    ///
    /// This is the main entry point for achievement checking. Call this after
    /// any event that might trigger an achievement (post created, bandwidth
    /// served, level changed, etc.).
    ///
    /// Returns the list of achievements that were newly unlocked.
    pub fn check_and_unlock(
        &self,
        identity: &[u8; 32],
        context: &TriggerContext,
        timestamp_secs: u64,
    ) -> Result<Vec<Achievement>, AchievementError> {
        // Load current tracker (creates empty if none exists)
        let mut tracker = self.store.load(identity)?;

        // Check which achievements can be newly unlocked
        let newly_unlockable = check_triggers(context, &tracker);

        // Unlock each achievement
        let mut newly_unlocked = Vec::new();
        for achievement in newly_unlockable {
            if tracker.unlock(achievement, timestamp_secs) {
                newly_unlocked.push(achievement);
            }
        }

        // Save if anything changed, then emit events after successful persistence
        if !newly_unlocked.is_empty() {
            self.store.save(identity, &tracker)?;

            // Emit events only after successful save (ignore send errors - no subscribers is okay)
            for &achievement in &newly_unlocked {
                let _ = self.event_tx.send(AchievementEvent::Unlocked {
                    identity: *identity,
                    achievement,
                });
            }
        }

        Ok(newly_unlocked)
    }

    /// Get the achievement tracker for an identity.
    ///
    /// Returns an empty tracker if no achievements exist for this identity.
    pub fn get_tracker(&self, identity: &[u8; 32]) -> Result<AchievementTracker, AchievementError> {
        self.store.load(identity)
    }

    /// Check if an identity has a specific achievement.
    pub fn has_achievement(
        &self,
        identity: &[u8; 32],
        achievement: Achievement,
    ) -> Result<bool, AchievementError> {
        let tracker = self.store.load(identity)?;
        Ok(tracker.has(achievement))
    }

    /// Get all achievements for an identity.
    pub fn get_achievements(
        &self,
        identity: &[u8; 32],
    ) -> Result<Vec<Achievement>, AchievementError> {
        let tracker = self.store.load(identity)?;
        Ok(tracker.unlocked_achievements())
    }

    /// Get the count of achievements for an identity.
    pub fn count_achievements(&self, identity: &[u8; 32]) -> Result<usize, AchievementError> {
        let tracker = self.store.load(identity)?;
        Ok(tracker.count())
    }

    /// Unlock a specific achievement directly (for testing or special cases).
    ///
    /// Normally achievements should be unlocked via check_and_unlock().
    /// This method is primarily for testing or administrative purposes.
    pub fn unlock_directly(
        &self,
        identity: &[u8; 32],
        achievement: Achievement,
        timestamp_secs: u64,
    ) -> Result<bool, AchievementError> {
        let mut tracker = self.store.load(identity)?;
        let was_new = tracker.unlock(achievement, timestamp_secs);

        if was_new {
            self.store.save(identity, &tracker)?;

            let _ = self.event_tx.send(AchievementEvent::Unlocked {
                identity: *identity,
                achievement,
            });
        }

        Ok(was_new)
    }

    /// Update highest level for an identity.
    ///
    /// DEPRECATED: Level system has been removed. This function is a no-op
    /// and always returns false. Kept for API compatibility.
    pub fn update_level(
        &self,
        _identity: &[u8; 32],
        _level: u8,
        _timestamp_secs: u64,
    ) -> Result<bool, AchievementError> {
        // Level system removed - AnchorDrop achievement no longer available
        Ok(false)
    }

    /// Get reference to the underlying store.
    pub fn store(&self) -> &Arc<AchievementStore> {
        &self.store
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // Level constants for tests (matching old SwimmerLevel enum values)
    const LEVEL_NEW_SWIMMER: u8 = 0;
    const LEVEL_REGULAR: u8 = 1;
    const LEVEL_RESIDENT: u8 = 2;
    const LEVEL_LIFEGUARD: u8 = 3;
    const LEVEL_ANCHOR: u8 = 4;
    const LEVEL_POOL_KEEPER: u8 = 5;

    fn create_test_service() -> (TempDir, AchievementService) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = Arc::new(AchievementStore::new(&db).unwrap());
        let service = AchievementService::new(store);
        (temp_dir, service)
    }

    const GENESIS: u64 = 1735689600;
    const TEST_TIMESTAMP: u64 = GENESIS + 86400;

    #[test]
    fn test_service_creation() {
        let (_temp, service) = create_test_service();
        assert_eq!(service.store.identity_count(), 0);
    }

    #[test]
    fn test_check_and_unlock_empty() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new(); // No achievements triggered

        let unlocked = service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();
        assert!(unlocked.is_empty());
    }

    #[test]
    fn test_check_and_unlock_first_stroke() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new().with_post_count(1);

        let unlocked = service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();
        assert_eq!(unlocked.len(), 1);
        assert!(unlocked.contains(&Achievement::FirstStroke));

        // Verify persisted
        assert!(service
            .has_achievement(&identity, Achievement::FirstStroke)
            .unwrap());
    }

    #[test]
    fn test_check_and_unlock_multiple() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new()
            .with_post_count(1)
            .with_bandwidth(1)
            .with_streak(7);

        let unlocked = service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();
        assert_eq!(unlocked.len(), 3);
        assert!(unlocked.contains(&Achievement::FirstStroke));
        assert!(unlocked.contains(&Achievement::FirstServe));
        assert!(unlocked.contains(&Achievement::WeekSwimmer));
    }

    #[test]
    fn test_idempotent() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new().with_post_count(1);

        // First call unlocks
        let first = service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();
        assert_eq!(first.len(), 1);

        // Second call returns empty (already earned)
        let second = service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP + 100)
            .unwrap();
        assert!(second.is_empty());

        // Still only one achievement
        assert_eq!(service.count_achievements(&identity).unwrap(), 1);
    }

    #[test]
    fn test_get_tracker() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new().with_post_count(1);

        service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();

        let tracker = service.get_tracker(&identity).unwrap();
        assert!(tracker.has(Achievement::FirstStroke));
    }

    #[test]
    fn test_get_achievements() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let ctx = TriggerContext::new().with_post_count(1).with_streak(100);

        service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();

        let achievements = service.get_achievements(&identity).unwrap();
        assert!(achievements.contains(&Achievement::FirstStroke));
        assert!(achievements.contains(&Achievement::WeekSwimmer));
        assert!(achievements.contains(&Achievement::MonthSwimmer));
        assert!(achievements.contains(&Achievement::Centurion));
    }

    #[test]
    fn test_unlock_directly() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // First unlock succeeds
        let was_new = service
            .unlock_directly(&identity, Achievement::Centurion, TEST_TIMESTAMP)
            .unwrap();
        assert!(was_new);

        // Second unlock fails (already earned)
        let was_new = service
            .unlock_directly(&identity, Achievement::Centurion, TEST_TIMESTAMP)
            .unwrap();
        assert!(!was_new);
    }

    #[test]
    fn test_update_level_anchor_drop() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Below Anchor - no achievement
        let is_first = service
            .update_level(&identity, LEVEL_LIFEGUARD, TEST_TIMESTAMP)
            .unwrap();
        assert!(!is_first);
        assert!(!service
            .has_achievement(&identity, Achievement::AnchorDrop)
            .unwrap());

        // First time Anchor - achievement unlocked
        let is_first = service
            .update_level(&identity, LEVEL_ANCHOR, TEST_TIMESTAMP + 1000)
            .unwrap();
        assert!(is_first);
        assert!(service
            .has_achievement(&identity, Achievement::AnchorDrop)
            .unwrap());

        // Already was Anchor - no new achievement
        let is_first = service
            .update_level(&identity, LEVEL_POOL_KEEPER, TEST_TIMESTAMP + 2000)
            .unwrap();
        assert!(!is_first);
    }

    #[tokio::test]
    async fn test_event_subscription() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Subscribe before unlocking
        let mut rx = service.subscribe();

        // Unlock an achievement
        let ctx = TriggerContext::new().with_post_count(1);
        service
            .check_and_unlock(&identity, &ctx, TEST_TIMESTAMP)
            .unwrap();

        // Should receive event
        let event = rx.try_recv().unwrap();
        match event {
            AchievementEvent::Unlocked {
                identity: id,
                achievement,
            } => {
                assert_eq!(id, identity);
                assert_eq!(achievement, Achievement::FirstStroke);
            }
        }
    }

    #[test]
    fn test_multiple_identities() {
        let (_temp, service) = create_test_service();
        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];

        let ctx1 = TriggerContext::new().with_post_count(1);
        let ctx2 = TriggerContext::new().with_streak(30);

        service
            .check_and_unlock(&identity1, &ctx1, TEST_TIMESTAMP)
            .unwrap();
        service
            .check_and_unlock(&identity2, &ctx2, TEST_TIMESTAMP)
            .unwrap();

        // Identity 1 has FirstStroke
        assert!(service
            .has_achievement(&identity1, Achievement::FirstStroke)
            .unwrap());
        assert!(!service
            .has_achievement(&identity1, Achievement::MonthSwimmer)
            .unwrap());

        // Identity 2 has MonthSwimmer (and WeekSwimmer)
        assert!(service
            .has_achievement(&identity2, Achievement::MonthSwimmer)
            .unwrap());
        assert!(!service
            .has_achievement(&identity2, Achievement::FirstStroke)
            .unwrap());
    }

    #[test]
    fn test_lane_opener_integration() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Level system removed - LaneOpener now unlocks with space creation (PoW-gated)
        let ctx_with_space = TriggerContext::new()
            .with_spaces_created(1);
        let unlocked = service
            .check_and_unlock(&identity, &ctx_with_space, TEST_TIMESTAMP)
            .unwrap();
        assert!(unlocked.contains(&Achievement::LaneOpener));
    }
}
