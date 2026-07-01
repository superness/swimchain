//! Notification system error types
//!
//! Defines error types for notification operations per SPEC_09 Section 7.

use thiserror::Error;

use super::types::NotificationType;

/// Errors that can occur in the notification system.
#[derive(Debug, Error)]
pub enum NotificationError {
    /// Storage error from sled
    #[error("Storage error: {0}")]
    Storage(#[from] sled::Error),

    /// Serialization error from bincode
    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),

    /// Notification was throttled
    #[error("Throttled: {reason}")]
    Throttled {
        /// Reason for throttling
        reason: String,
    },

    /// Trigger source is unavailable
    #[error("Trigger source unavailable: {trigger_source}")]
    TriggerUnavailable {
        /// The source that was unavailable
        trigger_source: String,
    },

    /// Notification not found
    #[error("Notification not found: {0:?}")]
    NotFound([u8; 16]),

    /// Invalid notification type ID
    #[error("Invalid notification type: {0}")]
    InvalidType(u8),

    /// Quiet hours are active
    #[error("Quiet hours active (hour {current} is in {start}-{end} range)")]
    QuietHours {
        /// Current hour (0-23)
        current: u8,
        /// Start of quiet hours
        start: u8,
        /// End of quiet hours
        end: u8,
    },

    /// Daily limit reached
    #[error("Daily notification limit reached ({limit})")]
    DailyLimitReached {
        /// The daily limit
        limit: u16,
    },

    /// Type-specific cooldown active
    #[error("Cooldown active for {notification_type:?}: {reason}")]
    CooldownActive {
        /// The notification type
        notification_type: NotificationType,
        /// Reason for cooldown
        reason: String,
    },
}

impl NotificationError {
    /// Create a throttled error with the given reason.
    pub fn throttled(reason: impl Into<String>) -> Self {
        Self::Throttled {
            reason: reason.into(),
        }
    }

    /// Create a trigger unavailable error.
    pub fn trigger_unavailable(trigger_source: impl Into<String>) -> Self {
        Self::TriggerUnavailable {
            trigger_source: trigger_source.into(),
        }
    }

    /// Check if this is a throttling-related error (not a hard failure).
    pub fn is_throttled(&self) -> bool {
        matches!(
            self,
            Self::Throttled { .. }
                | Self::QuietHours { .. }
                | Self::DailyLimitReached { .. }
                | Self::CooldownActive { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_throttled_error() {
        let err = NotificationError::throttled("test reason");
        assert!(err.is_throttled());
        assert!(err.to_string().contains("test reason"));
    }

    #[test]
    fn test_trigger_unavailable() {
        let err = NotificationError::trigger_unavailable("StreakTracker");
        assert!(!err.is_throttled());
        assert!(err.to_string().contains("StreakTracker"));
    }

    #[test]
    fn test_quiet_hours() {
        let err = NotificationError::QuietHours {
            current: 23,
            start: 22,
            end: 8,
        };
        assert!(err.is_throttled());
        assert!(err.to_string().contains("23"));
    }

    #[test]
    fn test_daily_limit() {
        let err = NotificationError::DailyLimitReached { limit: 10 };
        assert!(err.is_throttled());
        assert!(err.to_string().contains("10"));
    }

    #[test]
    fn test_cooldown_active() {
        let err = NotificationError::CooldownActive {
            notification_type: NotificationType::SpaceHealth,
            reason: "4h not elapsed".into(),
        };
        assert!(err.is_throttled());
        assert!(err.to_string().contains("SpaceHealth"));
    }

    #[test]
    fn test_storage_error_not_throttled() {
        // Can't easily create a sled::Error, but we can test the pattern
        let err = NotificationError::NotFound([0u8; 16]);
        assert!(!err.is_throttled());
    }
}
