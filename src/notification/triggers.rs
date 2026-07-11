//! Trigger detection for notifications
//!
//! Detects when notifications should be generated based on
//! changes in user state (streaks, levels, achievements, etc.).

use std::sync::Arc;

use super::types::{Notification, NotificationContext, NotificationType};

/// Streak milestones that trigger notifications.
pub const STREAK_MILESTONES: [u16; 4] = [7, 14, 30, 100];

/// Space health threshold below which to trigger notification.
pub const SPACE_HEALTH_THRESHOLD: u8 = 50;

/// Content risk threshold (days remaining) below which to trigger notification.
pub const CONTENT_RISK_THRESHOLD: u16 = 3;

/// Optional dependencies for trigger detection.
///
/// Uses Option<Arc<...>> for graceful degradation when
/// some systems are not available.
#[derive(Default)]
pub struct TriggerSources {
    /// Achievement service for achievement notifications
    pub achievement_service: Option<Arc<crate::achievement::AchievementService>>,

    /// Space health manager for space health notifications
    pub space_health_manager: Option<Arc<crate::space_health::SpaceHealthManager>>,
}

impl TriggerSources {
    /// Create empty trigger sources (all None).
    pub fn new() -> Self {
        Self::default()
    }

    /// Builder method to add achievement service.
    pub fn with_achievement_service(
        mut self,
        service: Arc<crate::achievement::AchievementService>,
    ) -> Self {
        self.achievement_service = Some(service);
        self
    }

    /// Builder method to add space health manager.
    pub fn with_space_health_manager(
        mut self,
        manager: Arc<crate::space_health::SpaceHealthManager>,
    ) -> Self {
        self.space_health_manager = Some(manager);
        self
    }
}

/// A detected trigger event that can generate a notification.
#[derive(Debug, Clone)]
pub struct TriggerEvent {
    /// Type of notification to generate
    pub notification_type: NotificationType,

    /// Context data for the notification
    pub context: NotificationContext,

    /// Human-readable message
    pub message: String,
}

impl TriggerEvent {
    /// Convert this trigger event into a notification.
    pub fn into_notification(self, created_at_ms: u64) -> Notification {
        Notification::with_context(
            self.notification_type,
            self.message,
            created_at_ms,
            self.context,
        )
    }
}

/// Detect streak milestone trigger.
///
/// Returns a trigger event if the current streak has reached a new milestone
/// that hasn't been notified yet.
pub fn detect_streak_milestone(
    current_streak: u16,
    notified_milestones: &[u16],
) -> Option<TriggerEvent> {
    // Find the highest milestone reached
    for &milestone in STREAK_MILESTONES.iter().rev() {
        if current_streak >= milestone && !notified_milestones.contains(&milestone) {
            return Some(TriggerEvent {
                notification_type: NotificationType::Streak,
                context: NotificationContext::Streak {
                    days: current_streak,
                    milestone,
                },
                message: format!("🔥 {}-day streak! Keep swimming!", milestone),
            });
        }
    }
    None
}

/// Level name lookup for notification messages.
fn level_name(level: u8) -> &'static str {
    match level {
        0 => "NewSwimmer",
        1 => "Regular",
        2 => "Resident",
        3 => "Lifeguard",
        4 => "Anchor",
        5 => "PoolKeeper",
        _ => "Unknown",
    }
}

/// Detect level change trigger.
///
/// Returns a trigger event if the user has leveled up.
/// Level is passed as u8 (0=NewSwimmer, 1=Regular, 2=Resident, 3=Lifeguard, 4=Anchor, 5=PoolKeeper).
pub fn detect_level_change(
    current_level: u8,
    last_notified_level: Option<u8>,
) -> Option<TriggerEvent> {
    let name = level_name(current_level);

    match last_notified_level {
        None if current_level > 0 => Some(TriggerEvent {
            notification_type: NotificationType::LevelUp,
            context: NotificationContext::LevelUp {
                old_level: 0,
                new_level: current_level,
                level_name: name.to_string(),
            },
            message: format!("⬆️ You're now a {}!", name),
        }),
        Some(last) if current_level > last => Some(TriggerEvent {
            notification_type: NotificationType::LevelUp,
            context: NotificationContext::LevelUp {
                old_level: last,
                new_level: current_level,
                level_name: name.to_string(),
            },
            message: format!("⬆️ You're now a {}!", name),
        }),
        _ => None,
    }
}

/// Detect achievement trigger.
///
/// Returns a trigger event for a newly unlocked achievement.
pub fn detect_achievement(
    achievement: crate::achievement::Achievement,
    notified_achievements: &[u8],
) -> Option<TriggerEvent> {
    let id = achievement.as_u8();
    if notified_achievements.contains(&id) {
        return None;
    }

    Some(TriggerEvent {
        notification_type: NotificationType::Achievement,
        context: NotificationContext::Achievement {
            achievement_id: id,
            badge: achievement.badge().to_string(),
            name: achievement.name().to_string(),
        },
        message: format!("🎉 Earned: {} {}", achievement.badge(), achievement.name()),
    })
}

/// Detect space health trigger.
///
/// Returns a trigger event if a space's health score is below threshold.
pub fn detect_space_health(
    space_id: [u8; 16],
    health_score: u8,
    space_name: Option<String>,
) -> Option<TriggerEvent> {
    if health_score >= SPACE_HEALTH_THRESHOLD {
        return None;
    }

    let name = space_name.clone().unwrap_or_else(|| "A space".to_string());
    Some(TriggerEvent {
        notification_type: NotificationType::SpaceHealth,
        context: NotificationContext::SpaceHealth {
            space_id,
            health_score,
            space_name,
        },
        message: format!(
            "🏊 {} could use some help (health: {}%)",
            name, health_score
        ),
    })
}

/// Detect content risk trigger.
///
/// Returns a trigger event if user has content about to decay.
pub fn detect_content_risk(content_count: u32, days_remaining: u16) -> Option<TriggerEvent> {
    if content_count == 0 || days_remaining >= CONTENT_RISK_THRESHOLD {
        return None;
    }

    let message = if days_remaining == 1 {
        format!("⚠️ {} of your posts decay tomorrow", content_count)
    } else if days_remaining == 0 {
        format!("⚠️ {} of your posts decay today!", content_count)
    } else {
        format!(
            "⚠️ {} of your posts decay in {} days",
            content_count, days_remaining
        )
    };

    Some(TriggerEvent {
        notification_type: NotificationType::ContentRisk,
        context: NotificationContext::ContentRisk {
            content_count,
            days_remaining,
        },
        message,
    })
}

/// Detect contribution thanks trigger.
///
/// Returns a trigger event for weekly contribution summary.
pub fn detect_contribution_thanks(
    posts_supported: u32,
    period: u32,
    last_notified_period: Option<u32>,
) -> Option<TriggerEvent> {
    // Only trigger if we have posts to thank for
    if posts_supported == 0 {
        return None;
    }

    // Only trigger once per period
    if let Some(last) = last_notified_period {
        if period <= last {
            return None;
        }
    }

    Some(TriggerEvent {
        notification_type: NotificationType::ContributionThanks,
        context: NotificationContext::ContributionThanks {
            posts_supported,
            period,
        },
        message: format!("🙏 You kept {} posts alive this week!", posts_supported),
    })
}

/// Check all triggers and return any events that should generate notifications.
///
/// This is a convenience function that checks all trigger sources.
/// For more control, use the individual detect_* functions.
pub fn detect_triggers(
    identity: &[u8; 32],
    sources: &TriggerSources,
    current_streak: Option<u16>,
    notified_milestones: &[u16],
    last_notified_level: Option<u8>,
    notified_achievements: &[u8],
    last_notified_period: Option<u32>,
    now_ms: u64,
) -> Vec<TriggerEvent> {
    let mut events = Vec::new();

    // Check streak milestone
    if let Some(streak) = current_streak {
        if let Some(event) = detect_streak_milestone(streak, notified_milestones) {
            events.push(event);
        }
    }

    // Level change detection removed (level system deprecated)

    // Note: Achievement triggers are typically handled by subscribing to
    // AchievementService events rather than polling here

    // Note: Space health and content risk triggers typically require
    // periodic scanning which is done by the service layer

    events
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::achievement::Achievement;

    // Level constants for tests (matching old SwimmerLevel enum values)
    const LEVEL_NEW_SWIMMER: u8 = 0;
    const LEVEL_REGULAR: u8 = 1;
    const LEVEL_RESIDENT: u8 = 2;

    #[test]
    fn test_streak_milestone_7() {
        let event = detect_streak_milestone(7, &[]).unwrap();
        assert_eq!(event.notification_type, NotificationType::Streak);
        if let NotificationContext::Streak { days, milestone } = event.context {
            assert_eq!(days, 7);
            assert_eq!(milestone, 7);
        } else {
            panic!("Wrong context type");
        }
        assert!(event.message.contains("7-day"));
    }

    #[test]
    fn test_streak_milestone_14() {
        let event = detect_streak_milestone(14, &[7]).unwrap();
        if let NotificationContext::Streak { milestone, .. } = event.context {
            assert_eq!(milestone, 14);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_streak_milestone_30() {
        let event = detect_streak_milestone(30, &[7, 14]).unwrap();
        if let NotificationContext::Streak { milestone, .. } = event.context {
            assert_eq!(milestone, 30);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_streak_milestone_100() {
        let event = detect_streak_milestone(100, &[7, 14, 30]).unwrap();
        if let NotificationContext::Streak { milestone, .. } = event.context {
            assert_eq!(milestone, 100);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_streak_milestone_already_notified() {
        assert!(detect_streak_milestone(7, &[7]).is_none());
        assert!(detect_streak_milestone(14, &[7, 14]).is_none());
        assert!(detect_streak_milestone(100, &[7, 14, 30, 100]).is_none());
    }

    #[test]
    fn test_streak_milestone_below_first() {
        assert!(detect_streak_milestone(5, &[]).is_none());
    }

    #[test]
    fn test_streak_milestone_between() {
        // At 20 days, 14 is the highest milestone
        let event = detect_streak_milestone(20, &[7]).unwrap();
        if let NotificationContext::Streak { milestone, .. } = event.context {
            assert_eq!(milestone, 14);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_level_change_first_level() {
        let event = detect_level_change(LEVEL_REGULAR, None).unwrap();
        assert_eq!(event.notification_type, NotificationType::LevelUp);
        if let NotificationContext::LevelUp {
            old_level,
            new_level,
            ref level_name,
        } = event.context
        {
            assert_eq!(old_level, 0);
            assert_eq!(new_level, 1);
            assert_eq!(level_name, "Regular");
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_level_change_upgrade() {
        let event = detect_level_change(LEVEL_RESIDENT, Some(1)).unwrap();
        if let NotificationContext::LevelUp {
            old_level,
            new_level,
            ..
        } = event.context
        {
            assert_eq!(old_level, 1);
            assert_eq!(new_level, 2);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_level_change_no_change() {
        assert!(detect_level_change(LEVEL_REGULAR, Some(1)).is_none());
    }

    #[test]
    fn test_level_change_new_swimmer() {
        // NewSwimmer (level 0) shouldn't trigger from None
        assert!(detect_level_change(LEVEL_NEW_SWIMMER, None).is_none());
    }

    #[test]
    fn test_achievement_trigger() {
        let event = detect_achievement(Achievement::FirstStroke, &[]).unwrap();
        assert_eq!(event.notification_type, NotificationType::Achievement);
        if let NotificationContext::Achievement {
            achievement_id,
            ref badge,
            ref name,
        } = event.context
        {
            assert_eq!(achievement_id, 0);
            assert_eq!(badge, "🌊");
            assert_eq!(name, "First Stroke");
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_achievement_already_notified() {
        assert!(detect_achievement(Achievement::FirstStroke, &[0]).is_none());
    }

    #[test]
    fn test_space_health_below_threshold() {
        let event = detect_space_health([0u8; 16], 45, Some("/gardening".to_string())).unwrap();
        assert_eq!(event.notification_type, NotificationType::SpaceHealth);
        assert!(event.message.contains("/gardening"));
        assert!(event.message.contains("45%"));
    }

    #[test]
    fn test_space_health_above_threshold() {
        assert!(detect_space_health([0u8; 16], 50, None).is_none());
        assert!(detect_space_health([0u8; 16], 80, None).is_none());
    }

    #[test]
    fn test_content_risk_tomorrow() {
        let event = detect_content_risk(3, 1).unwrap();
        assert_eq!(event.notification_type, NotificationType::ContentRisk);
        assert!(event.message.contains("tomorrow"));
        assert!(event.message.contains("3"));
    }

    #[test]
    fn test_content_risk_today() {
        let event = detect_content_risk(5, 0).unwrap();
        assert!(event.message.contains("today"));
    }

    #[test]
    fn test_content_risk_2_days() {
        let event = detect_content_risk(2, 2).unwrap();
        assert!(event.message.contains("2 days"));
    }

    #[test]
    fn test_content_risk_above_threshold() {
        assert!(detect_content_risk(5, 3).is_none());
        assert!(detect_content_risk(5, 10).is_none());
    }

    #[test]
    fn test_content_risk_zero_content() {
        assert!(detect_content_risk(0, 1).is_none());
    }

    #[test]
    fn test_contribution_thanks() {
        let event = detect_contribution_thanks(50, 10, None).unwrap();
        assert_eq!(
            event.notification_type,
            NotificationType::ContributionThanks
        );
        assert!(event.message.contains("50"));
        assert!(event.message.contains("this week"));
    }

    #[test]
    fn test_contribution_thanks_new_period() {
        let event = detect_contribution_thanks(25, 11, Some(10)).unwrap();
        if let NotificationContext::ContributionThanks { period, .. } = event.context {
            assert_eq!(period, 11);
        } else {
            panic!("Wrong context type");
        }
    }

    #[test]
    fn test_contribution_thanks_same_period() {
        assert!(detect_contribution_thanks(50, 10, Some(10)).is_none());
    }

    #[test]
    fn test_contribution_thanks_zero_posts() {
        assert!(detect_contribution_thanks(0, 10, None).is_none());
    }

    #[test]
    fn test_trigger_event_to_notification() {
        let event = TriggerEvent {
            notification_type: NotificationType::Streak,
            context: NotificationContext::Streak {
                days: 7,
                milestone: 7,
            },
            message: "🔥 7-day streak!".to_string(),
        };

        let notification = event.into_notification(1735689600000);
        assert_eq!(notification.notification_type, NotificationType::Streak);
        assert_eq!(notification.message, "🔥 7-day streak!");
        assert_eq!(notification.created_at_ms, 1735689600000);
        assert!(!notification.read);
    }

    #[test]
    fn test_trigger_sources_builder() {
        let sources = TriggerSources::new();
        // level_manager removed (level system deprecated)
        assert!(sources.achievement_service.is_none());
        assert!(sources.space_health_manager.is_none());
    }
}
