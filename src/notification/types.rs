//! Notification type definitions
//!
//! Defines NotificationType enum and Notification struct per SPEC_09 Section 7.1.
//! All 6 notification types with context data.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Notification type per SPEC_09 §7.1
///
/// Light-touch notifications encourage participation:
/// - Streak: Streak milestone reached
/// - LevelUp: Level increases
/// - Achievement: Achievement earned
/// - SpaceHealth: Space needs help
/// - ContentRisk: Your content at risk
/// - ContributionThanks: Significant contribution
///
/// #[repr(u8)] ensures stable wire format for storage.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NotificationType {
    /// Streak milestone reached (7, 14, 30, 100 days)
    Streak = 0,

    /// Level increased (e.g., Regular → Resident)
    LevelUp = 1,

    /// Achievement earned
    Achievement = 2,

    /// Space needs help (health score low)
    SpaceHealth = 3,

    /// Your content is at risk of decay
    ContentRisk = 4,

    /// Thanks for significant contribution
    ContributionThanks = 5,

    /// Your group's conversations earned their own community space
    /// (SPEC_13 behavioral branching, Phase 2). Graduation framing:
    /// recognition, never eviction — nobody is removed from the parent.
    CommunityFormed = 6,
}

impl NotificationType {
    /// Convert from u8 representation.
    ///
    /// Returns None if the value is out of range (0-5).
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(Self::Streak),
            1 => Some(Self::LevelUp),
            2 => Some(Self::Achievement),
            3 => Some(Self::SpaceHealth),
            4 => Some(Self::ContentRisk),
            5 => Some(Self::ContributionThanks),
            6 => Some(Self::CommunityFormed),
            _ => None,
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get a human-readable name for this notification type.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Streak => "Streak",
            Self::LevelUp => "Level Up",
            Self::Achievement => "Achievement",
            Self::SpaceHealth => "Space Health",
            Self::ContentRisk => "Content Risk",
            Self::ContributionThanks => "Contribution Thanks",
            Self::CommunityFormed => "Community Formed",
        }
    }

    /// Get the default emoji for this notification type.
    pub fn emoji(&self) -> &'static str {
        match self {
            Self::Streak => "🔥",
            Self::LevelUp => "⬆️",
            Self::Achievement => "🎉",
            Self::SpaceHealth => "🏊",
            Self::ContentRisk => "⚠️",
            Self::ContributionThanks => "🙏",
            Self::CommunityFormed => "🌱",
        }
    }

    /// Get all notification type variants.
    pub fn all() -> [NotificationType; 7] {
        [
            Self::Streak,
            Self::LevelUp,
            Self::Achievement,
            Self::SpaceHealth,
            Self::ContentRisk,
            Self::ContributionThanks,
            Self::CommunityFormed,
        ]
    }
}

impl Default for NotificationType {
    fn default() -> Self {
        Self::Streak
    }
}

impl fmt::Display for NotificationType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.emoji(), self.name())
    }
}

/// Unique notification identifier (128-bit UUID).
pub type NotificationId = [u8; 16];

/// Generate a new random notification ID using cryptographic randomness.
pub fn generate_notification_id() -> NotificationId {
    use rand::RngCore;
    let mut id = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut id);
    id
}

/// A notification to display to the user.
///
/// Notifications are stored persistently and expire after 30 days.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Notification {
    /// Unique identifier for this notification
    pub id: NotificationId,

    /// Type of notification
    pub notification_type: NotificationType,

    /// Human-readable message (max 256 chars)
    pub message: String,

    /// When this notification was created (Unix timestamp milliseconds)
    pub created_at_ms: u64,

    /// Whether the user has seen this notification
    pub read: bool,

    /// Optional type-specific context
    pub context: Option<NotificationContext>,
}

impl Notification {
    /// Create a new notification.
    ///
    /// The message will be truncated to 256 characters if longer.
    pub fn new(
        notification_type: NotificationType,
        message: impl Into<String>,
        created_at_ms: u64,
    ) -> Self {
        let mut message = message.into();
        if message.len() > 256 {
            message.truncate(256);
        }

        Self {
            id: generate_notification_id(),
            notification_type,
            message,
            created_at_ms,
            read: false,
            context: None,
        }
    }

    /// Create a notification with context.
    pub fn with_context(
        notification_type: NotificationType,
        message: impl Into<String>,
        created_at_ms: u64,
        context: NotificationContext,
    ) -> Self {
        let mut n = Self::new(notification_type, message, created_at_ms);
        n.context = Some(context);
        n
    }

    /// Mark this notification as read.
    pub fn mark_read(&mut self) {
        self.read = true;
    }

    /// Check if this notification has expired (older than 30 days).
    pub fn is_expired(&self, now_ms: u64) -> bool {
        const THIRTY_DAYS_MS: u64 = 30 * 24 * 60 * 60 * 1000;
        now_ms.saturating_sub(self.created_at_ms) > THIRTY_DAYS_MS
    }

    /// Get the age of this notification in milliseconds.
    pub fn age_ms(&self, now_ms: u64) -> u64 {
        now_ms.saturating_sub(self.created_at_ms)
    }
}

/// Type-specific context for notifications.
///
/// Provides additional data for UI rendering.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NotificationContext {
    /// Streak milestone context
    Streak {
        /// Current streak length in days
        days: u16,
        /// The milestone reached (7, 14, 30, 100)
        milestone: u16,
    },

    /// Level up context
    LevelUp {
        /// Previous level (0-5)
        old_level: u8,
        /// New level (0-5)
        new_level: u8,
        /// Name of the new level
        level_name: String,
    },

    /// Achievement context
    Achievement {
        /// Achievement ID (0-11)
        achievement_id: u8,
        /// Achievement badge emoji
        badge: String,
        /// Achievement name
        name: String,
    },

    /// Space health context
    SpaceHealth {
        /// Space identifier (UUID)
        space_id: [u8; 16],
        /// Current health score (0-100)
        health_score: u8,
        /// Space name if known
        space_name: Option<String>,
    },

    /// Content at risk context
    ContentRisk {
        /// Number of posts at risk
        content_count: u32,
        /// Days until decay
        days_remaining: u16,
    },

    /// Contribution thanks context
    ContributionThanks {
        /// Number of posts supported
        posts_supported: u32,
        /// Period number (weeks since genesis)
        period: u32,
    },

    /// Community formed context (SPEC_13 Phase 2)
    CommunityFormed {
        /// Parent space the community grew out of (full 32-byte id, hex on the wire)
        parent_space_id: [u8; 32],
        /// The new community's id
        community_id: [u8; 32],
        /// Deterministic auto-name assigned at formation
        auto_name: String,
        /// Number of founding members
        founding_member_count: u32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_type_count() {
        assert_eq!(NotificationType::all().len(), 7);
    }

    #[test]
    fn test_notification_type_values() {
        assert_eq!(NotificationType::Streak.as_u8(), 0);
        assert_eq!(NotificationType::LevelUp.as_u8(), 1);
        assert_eq!(NotificationType::Achievement.as_u8(), 2);
        assert_eq!(NotificationType::SpaceHealth.as_u8(), 3);
        assert_eq!(NotificationType::ContentRisk.as_u8(), 4);
        assert_eq!(NotificationType::ContributionThanks.as_u8(), 5);
        assert_eq!(NotificationType::CommunityFormed.as_u8(), 6);
    }

    #[test]
    fn test_from_u8() {
        for i in 0..7u8 {
            assert!(NotificationType::from_u8(i).is_some());
        }
        assert!(NotificationType::from_u8(7).is_none());
        assert!(NotificationType::from_u8(255).is_none());
    }

    #[test]
    fn test_roundtrip() {
        for nt in NotificationType::all() {
            let val = nt.as_u8();
            let restored = NotificationType::from_u8(val).unwrap();
            assert_eq!(nt, restored);
        }
    }

    #[test]
    fn test_display() {
        let nt = NotificationType::Streak;
        let display = format!("{}", nt);
        assert!(display.contains("Streak"));
        assert!(display.contains("🔥"));
    }

    #[test]
    fn test_notification_creation() {
        let n = Notification::new(
            NotificationType::Streak,
            "🔥 7-day streak! Keep swimming!",
            1735689600000,
        );

        assert_eq!(n.notification_type, NotificationType::Streak);
        assert!(!n.read);
        assert!(n.context.is_none());
        assert!(!n.id.iter().all(|&b| b == 0)); // ID should not be all zeros
    }

    #[test]
    fn test_notification_with_context() {
        let n = Notification::with_context(
            NotificationType::Streak,
            "🔥 7-day streak!",
            1735689600000,
            NotificationContext::Streak {
                days: 7,
                milestone: 7,
            },
        );

        assert!(n.context.is_some());
        if let Some(NotificationContext::Streak { days, milestone }) = n.context {
            assert_eq!(days, 7);
            assert_eq!(milestone, 7);
        } else {
            panic!("Expected Streak context");
        }
    }

    #[test]
    fn test_message_truncation() {
        let long_message = "x".repeat(300);
        let n = Notification::new(NotificationType::Streak, long_message, 0);
        assert_eq!(n.message.len(), 256);
    }

    #[test]
    fn test_mark_read() {
        let mut n = Notification::new(NotificationType::Streak, "test", 0);
        assert!(!n.read);
        n.mark_read();
        assert!(n.read);
    }

    #[test]
    fn test_expiry() {
        let n = Notification::new(NotificationType::Streak, "test", 0);

        // Not expired at creation time
        assert!(!n.is_expired(0));

        // Not expired after 29 days
        let twenty_nine_days_ms = 29 * 24 * 60 * 60 * 1000;
        assert!(!n.is_expired(twenty_nine_days_ms));

        // Expired after 31 days
        let thirty_one_days_ms = 31 * 24 * 60 * 60 * 1000;
        assert!(n.is_expired(thirty_one_days_ms));
    }

    #[test]
    fn test_age() {
        let n = Notification::new(NotificationType::Streak, "test", 1000);
        assert_eq!(n.age_ms(1000), 0);
        assert_eq!(n.age_ms(2000), 1000);
        assert_eq!(n.age_ms(500), 0); // Saturates at 0
    }

    #[test]
    fn test_unique_ids() {
        let n1 = Notification::new(NotificationType::Streak, "test1", 0);
        let n2 = Notification::new(NotificationType::Streak, "test2", 0);
        assert_ne!(n1.id, n2.id);
    }

    #[test]
    fn test_serialization() {
        let n = Notification::with_context(
            NotificationType::LevelUp,
            "You're now a Resident!",
            1735689600000,
            NotificationContext::LevelUp {
                old_level: 1,
                new_level: 2,
                level_name: "Resident".into(),
            },
        );

        let serialized = bincode::serialize(&n).unwrap();
        let deserialized: Notification = bincode::deserialize(&serialized).unwrap();

        assert_eq!(n.notification_type, deserialized.notification_type);
        assert_eq!(n.message, deserialized.message);
        assert_eq!(n.created_at_ms, deserialized.created_at_ms);
        assert_eq!(n.read, deserialized.read);
        assert_eq!(n.context, deserialized.context);
    }

    #[test]
    fn test_all_context_types() {
        // Verify all context types serialize correctly
        let contexts = [
            NotificationContext::Streak {
                days: 7,
                milestone: 7,
            },
            NotificationContext::LevelUp {
                old_level: 1,
                new_level: 2,
                level_name: "Resident".into(),
            },
            NotificationContext::Achievement {
                achievement_id: 0,
                badge: "🌊".into(),
                name: "First Stroke".into(),
            },
            NotificationContext::SpaceHealth {
                space_id: [0u8; 16],
                health_score: 45,
                space_name: Some("/gardening".into()),
            },
            NotificationContext::ContentRisk {
                content_count: 3,
                days_remaining: 2,
            },
            NotificationContext::ContributionThanks {
                posts_supported: 50,
                period: 10,
            },
            NotificationContext::CommunityFormed {
                parent_space_id: [7u8; 32],
                community_id: [8u8; 32],
                auto_name: "community-ab12cd34".into(),
                founding_member_count: 5,
            },
        ];

        for ctx in contexts {
            let serialized = bincode::serialize(&ctx).unwrap();
            let deserialized: NotificationContext = bincode::deserialize(&serialized).unwrap();
            assert_eq!(ctx, deserialized);
        }
    }

    #[test]
    fn test_hash() {
        // Verify NotificationType can be used as HashMap key
        use std::collections::HashMap;
        let mut map: HashMap<NotificationType, u32> = HashMap::new();
        map.insert(NotificationType::Streak, 7);
        map.insert(NotificationType::LevelUp, 2);
        assert_eq!(map.get(&NotificationType::Streak), Some(&7));
        assert_eq!(map.get(&NotificationType::LevelUp), Some(&2));
    }
}
