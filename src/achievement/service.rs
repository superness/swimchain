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

    // ========================================================================
    // Live-event award hooks (SPEC_09 §5.3)
    //
    // These are the entry points the running node calls from the real event
    // paths. Each builds the minimal TriggerContext for its event and defers to
    // `check_and_unlock`, so awards stay idempotent and permanent. They are
    // recognition ONLY — none of them grant PoW discounts, decay extension, or
    // any rate-limit change.
    // ========================================================================

    /// Record that `identity` had a post accepted. Awards FirstStroke on the
    /// first accepted post (idempotent thereafter).
    pub fn record_post(
        &self,
        identity: &[u8; 32],
        timestamp_secs: u64,
    ) -> Result<Vec<Achievement>, AchievementError> {
        let ctx = TriggerContext::new().with_post_count(1);
        self.check_and_unlock(identity, &ctx, timestamp_secs)
    }

    /// Record that `identity` created a space. Awards LaneOpener on the first
    /// space created (idempotent thereafter). Re-specified for the PoW-only
    /// model: there is no longer any swimmer-level gate — creating any space
    /// qualifies.
    pub fn record_space_created(
        &self,
        identity: &[u8; 32],
        timestamp_secs: u64,
    ) -> Result<Vec<Achievement>, AchievementError> {
        let ctx = TriggerContext::new().with_spaces_created(1);
        self.check_and_unlock(identity, &ctx, timestamp_secs)
    }

    /// Record that `identity` served `bytes` of content to a peer. Increments
    /// the persistent lifetime bytes-served counter and evaluates the bandwidth
    /// achievements (FirstServe, BandwidthBaron, TerabyteClub) against the new
    /// cumulative total.
    pub fn record_bandwidth_served(
        &self,
        identity: &[u8; 32],
        bytes: u64,
        timestamp_secs: u64,
    ) -> Result<Vec<Achievement>, AchievementError> {
        if bytes == 0 {
            return Ok(Vec::new());
        }
        let total = self.store.add_bandwidth_served(identity, bytes)?;
        let ctx = TriggerContext::new().with_bandwidth(total);
        self.check_and_unlock(identity, &ctx, timestamp_secs)
    }

    /// Record that `identity` has supported `posts_supported` posts through
    /// engagement (cumulative outgoing-engagement count from the local
    /// engagement graph). Awards KeeperOfTheFlame once the count reaches the
    /// threshold. Re-specified: the engagement graph tracks total outgoing
    /// engagements rather than distinct posts, so this uses that count as the
    /// deterministic local proxy for "posts kept alive".
    pub fn record_posts_supported(
        &self,
        identity: &[u8; 32],
        posts_supported: u64,
        timestamp_secs: u64,
    ) -> Result<Vec<Achievement>, AchievementError> {
        let ctx = TriggerContext::new().with_posts_supported(posts_supported);
        self.check_and_unlock(identity, &ctx, timestamp_secs)
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
    fn test_update_level_is_deprecated_noop() {
        // The swimmer level ladder was removed (PoW-only gating), so AnchorDrop is
        // permanently unsatisfiable and `update_level` is a documented no-op.
        // Regardless of the level passed, it awards nothing.
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        for level in [LEVEL_LIFEGUARD, LEVEL_ANCHOR, LEVEL_POOL_KEEPER] {
            let is_first = service
                .update_level(&identity, level, TEST_TIMESTAMP)
                .unwrap();
            assert!(!is_first, "update_level must be a no-op");
        }
        assert!(!service
            .has_achievement(&identity, Achievement::AnchorDrop)
            .unwrap());
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

    // ========================================================================
    // Live-event award-hook tests (one per wired trigger)
    // ========================================================================

    #[test]
    fn test_record_post_awards_first_stroke() {
        let (_temp, service) = create_test_service();
        let identity = [9u8; 32];

        let unlocked = service.record_post(&identity, TEST_TIMESTAMP).unwrap();
        assert_eq!(unlocked, vec![Achievement::FirstStroke]);

        // Idempotent: a second accepted post awards nothing new.
        let again = service
            .record_post(&identity, TEST_TIMESTAMP + 100)
            .unwrap();
        assert!(again.is_empty());
        assert!(service
            .has_achievement(&identity, Achievement::FirstStroke)
            .unwrap());
    }

    #[test]
    fn test_record_space_created_awards_lane_opener() {
        let (_temp, service) = create_test_service();
        let identity = [9u8; 32];

        let unlocked = service
            .record_space_created(&identity, TEST_TIMESTAMP)
            .unwrap();
        assert_eq!(unlocked, vec![Achievement::LaneOpener]);

        // Idempotent across further space creations.
        let again = service
            .record_space_created(&identity, TEST_TIMESTAMP + 100)
            .unwrap();
        assert!(again.is_empty());
    }

    #[test]
    fn test_record_bandwidth_awards_first_serve_then_thresholds() {
        use crate::achievement::triggers::{BANDWIDTH_BARON_BYTES, TERABYTE_CLUB_BYTES};

        let (_temp, service) = create_test_service();
        let identity = [9u8; 32];

        // Zero-byte serve records nothing.
        assert!(service
            .record_bandwidth_served(&identity, 0, TEST_TIMESTAMP)
            .unwrap()
            .is_empty());

        // First real serve awards FirstServe only.
        let first = service
            .record_bandwidth_served(&identity, 512, TEST_TIMESTAMP)
            .unwrap();
        assert_eq!(first, vec![Achievement::FirstServe]);

        // Crossing 100 GiB (cumulative) awards BandwidthBaron.
        let baron = service
            .record_bandwidth_served(&identity, BANDWIDTH_BARON_BYTES, TEST_TIMESTAMP + 10)
            .unwrap();
        assert!(baron.contains(&Achievement::BandwidthBaron));
        assert!(!baron.contains(&Achievement::FirstServe)); // already earned

        // Crossing 1 TiB awards TerabyteClub.
        let tb = service
            .record_bandwidth_served(&identity, TERABYTE_CLUB_BYTES, TEST_TIMESTAMP + 20)
            .unwrap();
        assert!(tb.contains(&Achievement::TerabyteClub));
    }

    #[test]
    fn test_record_posts_supported_awards_keeper_of_flame() {
        use crate::achievement::triggers::KEEPER_OF_FLAME_POSTS;

        let (_temp, service) = create_test_service();
        let identity = [9u8; 32];

        // Below threshold awards nothing.
        assert!(service
            .record_posts_supported(&identity, KEEPER_OF_FLAME_POSTS - 1, TEST_TIMESTAMP)
            .unwrap()
            .is_empty());

        // At threshold awards KeeperOfTheFlame.
        let unlocked = service
            .record_posts_supported(&identity, KEEPER_OF_FLAME_POSTS, TEST_TIMESTAMP + 1)
            .unwrap();
        assert_eq!(unlocked, vec![Achievement::KeeperOfTheFlame]);
    }

    #[test]
    fn test_lane_opener_integration() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Level system removed - LaneOpener now unlocks with space creation (PoW-gated)
        let ctx_with_space = TriggerContext::new().with_spaces_created(1);
        let unlocked = service
            .check_and_unlock(&identity, &ctx_with_space, TEST_TIMESTAMP)
            .unwrap();
        assert!(unlocked.contains(&Achievement::LaneOpener));
    }
}
