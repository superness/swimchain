//! Notification service for coordinating notification generation
//!
//! Provides the main integration point for the notification system.
//! Coordinates between preferences, throttling, triggers, and storage.

use std::sync::Arc;

use tokio::sync::broadcast;

use super::error::NotificationError;
use super::preferences::{NotificationPreferences, PreferencesStore};
use super::storage::NotificationStore;
use super::throttle::{ThrottleConfig, ThrottleContext, ThrottleState, ThrottleStore};
use super::triggers::{
    detect_achievement, detect_content_risk, detect_contribution_thanks, detect_level_change,
    detect_space_health, detect_streak_milestone, TriggerEvent, TriggerSources,
};
use super::types::{Notification, NotificationId, NotificationType};

/// Size of the event broadcast channel.
const EVENT_CHANNEL_SIZE: usize = 256;

/// Events emitted by the notification service.
#[derive(Debug, Clone)]
pub enum NotificationEvent {
    /// A notification was generated.
    Emitted {
        /// The identity that received the notification
        identity: [u8; 32],
        /// The notification
        notification: Notification,
    },

    /// A notification was marked as read.
    Read {
        /// The identity that owns the notification
        identity: [u8; 32],
        /// The notification ID
        notification_id: NotificationId,
    },

    /// All notifications were cleared for an identity.
    Cleared {
        /// The identity whose notifications were cleared
        identity: [u8; 32],
        /// Number of notifications cleared
        count: usize,
    },
}

/// Central notification service coordinator.
///
/// This is the main integration point for the notification system.
/// It coordinates between:
/// - Preferences (what types of notifications the user wants)
/// - Throttling (preventing notification spam)
/// - Triggers (detecting when notifications should be generated)
/// - Storage (persisting notifications for later retrieval)
pub struct NotificationService {
    /// Preferences storage
    preferences_store: Arc<PreferencesStore>,

    /// Throttle state storage
    throttle_store: Arc<ThrottleStore>,

    /// Notification storage
    notification_store: Arc<NotificationStore>,

    /// Trigger sources for detecting notification events
    trigger_sources: TriggerSources,

    /// Throttle configuration
    throttle_config: ThrottleConfig,

    /// Event broadcaster
    event_tx: broadcast::Sender<NotificationEvent>,
}

impl NotificationService {
    /// Create a new notification service.
    ///
    /// Opens or creates the required sled trees.
    pub fn new(db: &sled::Db, trigger_sources: TriggerSources) -> Result<Self, NotificationError> {
        let preferences_store = Arc::new(PreferencesStore::new(db)?);
        let throttle_store = Arc::new(ThrottleStore::new(db)?);
        let notification_store = Arc::new(NotificationStore::new(db)?);
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_SIZE);

        Ok(Self {
            preferences_store,
            throttle_store,
            notification_store,
            trigger_sources,
            throttle_config: ThrottleConfig::default(),
            event_tx,
        })
    }

    /// Create a notification service with custom throttle config.
    pub fn with_config(
        db: &sled::Db,
        trigger_sources: TriggerSources,
        throttle_config: ThrottleConfig,
    ) -> Result<Self, NotificationError> {
        let mut service = Self::new(db, trigger_sources)?;
        service.throttle_config = throttle_config;
        Ok(service)
    }

    /// Subscribe to notification events.
    ///
    /// Returns a receiver that will receive all future notification events.
    pub fn subscribe(&self) -> broadcast::Receiver<NotificationEvent> {
        self.event_tx.subscribe()
    }

    /// Check for streak milestone and emit notification if appropriate.
    ///
    /// Call this when a user's streak changes.
    pub fn check_streak(
        &self,
        identity: &[u8; 32],
        current_streak: u16,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // Load preferences
        let prefs = self.preferences_store.load(identity)?;
        if !prefs.streak_notifications {
            return Ok(None);
        }

        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) =
            detect_streak_milestone(current_streak, &throttle.notified_streak_milestones)
        {
            // Check streak threshold from preferences
            if let super::types::NotificationContext::Streak { milestone, .. } = &event.context {
                if !prefs.should_notify_streak(*milestone) {
                    return Ok(None);
                }
            }

            // Check throttle
            let context = ThrottleContext::Streak {
                days: current_streak,
            };
            if !throttle.can_send(
                NotificationType::Streak,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::Streak, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Check for level up and emit notification if appropriate.
    ///
    /// Call this when a user's level changes.
    /// Level is passed as u8 (0=NewSwimmer, 1=Regular, 2=Resident, 3=Lifeguard, 4=Anchor, 5=PoolKeeper).
    pub fn check_level_up(
        &self,
        identity: &[u8; 32],
        current_level: u8,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // Load preferences
        let prefs = self.preferences_store.load(identity)?;
        if !prefs.achievement_notifications {
            return Ok(None);
        }

        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) = detect_level_change(current_level, throttle.last_notified_level) {
            // Check throttle
            let context = ThrottleContext::Level {
                new_level: current_level,
            };
            if !throttle.can_send(
                NotificationType::LevelUp,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::LevelUp, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Check for achievement and emit notification if appropriate.
    ///
    /// Call this when a user earns an achievement.
    pub fn check_achievement(
        &self,
        identity: &[u8; 32],
        achievement: crate::achievement::Achievement,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // Load preferences
        let prefs = self.preferences_store.load(identity)?;
        if !prefs.achievement_notifications {
            return Ok(None);
        }

        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) = detect_achievement(achievement, &throttle.notified_achievements) {
            // Check throttle
            let context = ThrottleContext::Achievement {
                id: achievement.as_u8(),
            };
            if !throttle.can_send(
                NotificationType::Achievement,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::Achievement, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Check space health and emit notification if appropriate.
    ///
    /// Call this periodically for spaces the user participates in.
    pub fn check_space_health(
        &self,
        identity: &[u8; 32],
        space_id: [u8; 16],
        health_score: u8,
        space_name: Option<String>,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // Load preferences
        let prefs = self.preferences_store.load(identity)?;
        if !prefs.space_health_nudges {
            return Ok(None);
        }

        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) = detect_space_health(space_id, health_score, space_name) {
            // Check throttle
            let context = ThrottleContext::Space { space_id };
            if !throttle.can_send(
                NotificationType::SpaceHealth,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::SpaceHealth, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Check content at risk and emit notification if appropriate.
    ///
    /// Call this periodically to check for content about to decay.
    pub fn check_content_risk(
        &self,
        identity: &[u8; 32],
        content_count: u32,
        days_remaining: u16,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // Load preferences
        let prefs = self.preferences_store.load(identity)?;
        if !prefs.decay_warnings {
            return Ok(None);
        }

        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) = detect_content_risk(content_count, days_remaining) {
            // Check throttle
            let context = ThrottleContext::ContentRisk;
            if !throttle.can_send(
                NotificationType::ContentRisk,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::ContentRisk, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Check contribution thanks and emit notification if appropriate.
    ///
    /// Call this at the end of each period (weekly).
    pub fn check_contribution_thanks(
        &self,
        identity: &[u8; 32],
        posts_supported: u32,
        period: u32,
        now_ms: u64,
    ) -> Result<Option<Notification>, NotificationError> {
        // ContributionThanks is always enabled (not spam-like)
        // Load throttle state
        let mut throttle = self.throttle_store.load(identity)?;

        // Check if notification would be triggered
        if let Some(event) =
            detect_contribution_thanks(posts_supported, period, throttle.last_notified_period)
        {
            // Check throttle
            let context = ThrottleContext::Contribution { period };
            if !throttle.can_send(
                NotificationType::ContributionThanks,
                &context,
                &self.throttle_config,
                now_ms,
            ) {
                return Ok(None);
            }

            // Generate and store notification
            let notification = event.into_notification(now_ms);
            self.notification_store.store(identity, &notification)?;

            // Update throttle state
            throttle.record_sent(NotificationType::ContributionThanks, &context, now_ms);
            self.throttle_store.save(identity, &throttle)?;

            // Emit event
            let _ = self.event_tx.send(NotificationEvent::Emitted {
                identity: *identity,
                notification: notification.clone(),
            });

            return Ok(Some(notification));
        }

        Ok(None)
    }

    /// Get unread notifications for an identity.
    pub fn get_pending(
        &self,
        identity: &[u8; 32],
        limit: usize,
    ) -> Result<Vec<Notification>, NotificationError> {
        self.notification_store.get_unread(identity, limit)
    }

    /// Get all notifications for an identity (including read).
    pub fn get_all(
        &self,
        identity: &[u8; 32],
        limit: usize,
    ) -> Result<Vec<Notification>, NotificationError> {
        self.notification_store.get_all(identity, limit)
    }

    /// Mark a notification as read.
    pub fn mark_read(
        &self,
        identity: &[u8; 32],
        notification_id: NotificationId,
    ) -> Result<bool, NotificationError> {
        let marked = self
            .notification_store
            .mark_read(identity, notification_id)?;
        if marked {
            let _ = self.event_tx.send(NotificationEvent::Read {
                identity: *identity,
                notification_id,
            });
        }
        Ok(marked)
    }

    /// Mark all notifications as read for an identity.
    pub fn mark_all_read(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        self.notification_store.mark_all_read(identity)
    }

    /// Clear all notifications for an identity.
    pub fn clear_all(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        let count = self.notification_store.clear(identity)?;
        if count > 0 {
            let _ = self.event_tx.send(NotificationEvent::Cleared {
                identity: *identity,
                count,
            });
        }
        Ok(count)
    }

    /// Count unread notifications for an identity.
    pub fn count_unread(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        self.notification_store.count_unread(identity)
    }

    /// Get notification preferences for an identity.
    pub fn get_preferences(
        &self,
        identity: &[u8; 32],
    ) -> Result<NotificationPreferences, NotificationError> {
        self.preferences_store.load(identity)
    }

    /// Set notification preferences for an identity.
    pub fn set_preferences(
        &self,
        identity: &[u8; 32],
        prefs: NotificationPreferences,
    ) -> Result<(), NotificationError> {
        self.preferences_store.save(identity, &prefs)
    }

    /// Prune expired notifications for an identity.
    pub fn prune_expired(
        &self,
        identity: &[u8; 32],
        now_ms: u64,
    ) -> Result<usize, NotificationError> {
        self.notification_store
            .prune_expired_for_identity(identity, now_ms)
    }

    /// Get reference to the trigger sources.
    pub fn trigger_sources(&self) -> &TriggerSources {
        &self.trigger_sources
    }

    /// Get reference to the notification store.
    pub fn notification_store(&self) -> &Arc<NotificationStore> {
        &self.notification_store
    }

    /// Get reference to the preferences store.
    pub fn preferences_store(&self) -> &Arc<PreferencesStore> {
        &self.preferences_store
    }

    /// Get reference to the throttle store.
    pub fn throttle_store(&self) -> &Arc<ThrottleStore> {
        &self.throttle_store
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::achievement::Achievement;
    use tempfile::TempDir;

    // Level constants for tests (matching old SwimmerLevel enum values)
    const LEVEL_NEW_SWIMMER: u8 = 0;
    const LEVEL_REGULAR: u8 = 1;
    const LEVEL_RESIDENT: u8 = 2;

    fn create_test_service() -> (TempDir, NotificationService) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let service = NotificationService::new(&db, TriggerSources::default()).unwrap();
        (temp_dir, service)
    }

    const BASE_MS: u64 = 1735689600000;

    #[test]
    fn test_service_creation() {
        let (_temp, service) = create_test_service();
        assert_eq!(service.notification_store.total_count(), 0);
    }

    #[test]
    fn test_streak_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // First 7-day streak
        let notification = service.check_streak(&identity, 7, BASE_MS).unwrap();
        assert!(notification.is_some());
        let n = notification.unwrap();
        assert_eq!(n.notification_type, NotificationType::Streak);
        assert!(n.message.contains("7-day"));

        // Check it was stored
        let pending = service.get_pending(&identity, 10).unwrap();
        assert_eq!(pending.len(), 1);
    }

    #[test]
    fn test_streak_notification_idempotent() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // First notification
        let first = service.check_streak(&identity, 7, BASE_MS).unwrap();
        assert!(first.is_some());

        // Second should be blocked by throttle
        let second = service.check_streak(&identity, 7, BASE_MS + 1000).unwrap();
        assert!(second.is_none());
    }

    #[test]
    fn test_streak_notification_next_milestone() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // 7-day
        service.check_streak(&identity, 7, BASE_MS).unwrap();

        // 14-day should work
        let notification = service.check_streak(&identity, 14, BASE_MS + 1000).unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("14-day"));
    }

    #[test]
    fn test_streak_notification_disabled() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Disable streak notifications
        let prefs = NotificationPreferences::default().with_streak_notifications(false);
        service.set_preferences(&identity, prefs).unwrap();

        // Should not generate notification
        let notification = service.check_streak(&identity, 7, BASE_MS).unwrap();
        assert!(notification.is_none());
    }

    #[test]
    fn test_streak_threshold() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Set threshold to 14
        let prefs = NotificationPreferences::default().with_streak_threshold(14);
        service.set_preferences(&identity, prefs).unwrap();

        // 7-day should not trigger
        let notification = service.check_streak(&identity, 7, BASE_MS).unwrap();
        assert!(notification.is_none());

        // 14-day should trigger
        let notification = service.check_streak(&identity, 14, BASE_MS + 1000).unwrap();
        assert!(notification.is_some());
    }

    #[test]
    fn test_level_up_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Regular level up
        let notification = service
            .check_level_up(&identity, LEVEL_REGULAR, BASE_MS)
            .unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("Regular"));
    }

    #[test]
    fn test_level_up_subsequent() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Regular
        service
            .check_level_up(&identity, LEVEL_REGULAR, BASE_MS)
            .unwrap();

        // Same level - no notification
        let notification = service
            .check_level_up(&identity, LEVEL_REGULAR, BASE_MS + 1000)
            .unwrap();
        assert!(notification.is_none());

        // Higher level - notification
        let notification = service
            .check_level_up(&identity, LEVEL_RESIDENT, BASE_MS + 2000)
            .unwrap();
        assert!(notification.is_some());
    }

    #[test]
    fn test_achievement_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        let notification = service
            .check_achievement(&identity, Achievement::FirstStroke, BASE_MS)
            .unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("First Stroke"));
    }

    #[test]
    fn test_achievement_notification_idempotent() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // First
        service
            .check_achievement(&identity, Achievement::FirstStroke, BASE_MS)
            .unwrap();

        // Second should be blocked
        let notification = service
            .check_achievement(&identity, Achievement::FirstStroke, BASE_MS + 1000)
            .unwrap();
        assert!(notification.is_none());
    }

    #[test]
    fn test_space_health_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let space_id = [0u8; 16];

        // Below threshold
        let notification = service
            .check_space_health(
                &identity,
                space_id,
                45,
                Some("/gardening".to_string()),
                BASE_MS,
            )
            .unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("/gardening"));
    }

    #[test]
    fn test_space_health_throttle() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];
        let space_id = [0u8; 16];

        // First
        service
            .check_space_health(&identity, space_id, 45, None, BASE_MS)
            .unwrap();

        // Same space within 4 hours - blocked
        let two_hours = BASE_MS + (2 * 60 * 60 * 1000);
        let notification = service
            .check_space_health(&identity, space_id, 45, None, two_hours)
            .unwrap();
        assert!(notification.is_none());

        // After 4 hours - allowed
        let five_hours = BASE_MS + (5 * 60 * 60 * 1000);
        let notification = service
            .check_space_health(&identity, space_id, 45, None, five_hours)
            .unwrap();
        assert!(notification.is_some());
    }

    #[test]
    fn test_content_risk_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        let notification = service
            .check_content_risk(&identity, 3, 1, BASE_MS)
            .unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("tomorrow"));
    }

    #[test]
    fn test_contribution_thanks_notification() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        let notification = service
            .check_contribution_thanks(&identity, 50, 10, BASE_MS)
            .unwrap();
        assert!(notification.is_some());
        assert!(notification.unwrap().message.contains("50"));
    }

    #[test]
    fn test_mark_read() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        let notification = service
            .check_streak(&identity, 7, BASE_MS)
            .unwrap()
            .unwrap();
        let id = notification.id;

        assert_eq!(service.count_unread(&identity).unwrap(), 1);

        assert!(service.mark_read(&identity, id).unwrap());

        assert_eq!(service.count_unread(&identity).unwrap(), 0);
    }

    #[test]
    fn test_clear_all() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Generate some notifications
        service.check_streak(&identity, 7, BASE_MS).unwrap();
        service.check_streak(&identity, 14, BASE_MS + 1000).unwrap();
        service
            .check_achievement(&identity, Achievement::FirstStroke, BASE_MS + 2000)
            .unwrap();

        let pending = service.get_pending(&identity, 10).unwrap();
        assert_eq!(pending.len(), 3);

        let cleared = service.clear_all(&identity).unwrap();
        assert_eq!(cleared, 3);

        let pending = service.get_pending(&identity, 10).unwrap();
        assert_eq!(pending.len(), 0);
    }

    #[test]
    fn test_preferences() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        // Default preferences
        let prefs = service.get_preferences(&identity).unwrap();
        assert!(prefs.streak_notifications);

        // Set custom preferences
        let custom = NotificationPreferences::all_disabled();
        service.set_preferences(&identity, custom.clone()).unwrap();

        let loaded = service.get_preferences(&identity).unwrap();
        assert_eq!(loaded, custom);
    }

    #[tokio::test]
    async fn test_event_subscription() {
        let (_temp, service) = create_test_service();
        let identity = [1u8; 32];

        let mut rx = service.subscribe();

        // Generate notification
        service.check_streak(&identity, 7, BASE_MS).unwrap();

        // Should receive event
        let event = rx.try_recv().unwrap();
        match event {
            NotificationEvent::Emitted {
                identity: id,
                notification,
            } => {
                assert_eq!(id, identity);
                assert_eq!(notification.notification_type, NotificationType::Streak);
            }
            _ => panic!("Expected Emitted event"),
        }
    }
}
