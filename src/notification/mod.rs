//! Notification system for user engagement
//!
//! Implements the notification system per SPEC_09 Section 7.
//! Provides light-touch notifications to encourage participation
//! without creating notification fatigue.
//!
//! # Overview
//!
//! The notification system provides:
//! - 6 notification types per SPEC_09 §7.1
//! - User-configurable preferences per SPEC_09 §7.2
//! - Throttling to prevent notification spam
//! - Persistent storage with 30-day expiry
//! - Event system for UI integration
//!
//! # Key Types
//!
//! - [`NotificationType`] - The 6 notification types
//! - [`Notification`] - A notification to display
//! - [`NotificationPreferences`] - User preferences for notifications
//! - [`ThrottleConfig`] - Throttling configuration
//! - [`ThrottleState`] - Per-identity throttle state
//! - [`NotificationService`] - Main integration point
//!
//! # Example
//!
//! ```rust,ignore
//! use swimchain::notification::{NotificationService, TriggerSources};
//! use std::sync::Arc;
//!
//! // Create service
//! let db = sled::open("my_db")?;
//! let sources = TriggerSources::default();
//! let service = NotificationService::new(&db, sources)?;
//!
//! // Check for notifications
//! let identity = [1u8; 32];
//! let now_ms = std::time::SystemTime::now()
//!     .duration_since(std::time::UNIX_EPOCH)
//!     .unwrap()
//!     .as_millis() as u64;
//!
//! let notifications = service.check_and_notify(&identity, now_ms)?;
//! for n in notifications {
//!     println!("{}: {}", n.notification_type, n.message);
//! }
//! ```
//!
//! # Throttling
//!
//! Each notification type has specific throttling:
//! - Streak: Once per milestone (7, 14, 30, 100 days)
//! - LevelUp: Once per level change
//! - Achievement: Once per achievement
//! - SpaceHealth: 4-hour cooldown per space
//! - ContentRisk: 24-hour cooldown
//! - ContributionThanks: Once per period (weekly)
//!
//! Additionally, there is a global daily limit (default: 10) to prevent spam.

pub mod error;
pub mod preferences;
pub mod service;
pub mod storage;
pub mod throttle;
pub mod triggers;
pub mod types;

// Re-export main types
pub use error::NotificationError;
pub use preferences::{NotificationPreferences, PreferencesStore};
pub use service::{NotificationEvent, NotificationService};
pub use storage::NotificationStore;
pub use throttle::{ThrottleConfig, ThrottleContext, ThrottleState, ThrottleStore, TypeCooldown};
pub use triggers::{detect_triggers, TriggerEvent, TriggerSources};
pub use types::{Notification, NotificationContext, NotificationId, NotificationType};

// Re-export threshold constants
pub use throttle::{CONTENT_RISK_COOLDOWN_SECS, DEFAULT_DAILY_LIMIT, SPACE_HEALTH_COOLDOWN_SECS};
pub use triggers::STREAK_MILESTONES;
