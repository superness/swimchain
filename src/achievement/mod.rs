//! Achievement system for tracking and rewarding participation
//!
//! Implements the achievement system per SPEC_09 Section 5.3.
//! Achievements are permanent, non-transferable accomplishments that
//! recognize specific hosting and participation milestones.
//!
//! # Overview
//!
//! The achievement system provides:
//! - 12 achievement types with unique badges
//! - Trigger detection based on hosting metrics
//! - Persistent storage with permanence guarantee
//! - Event system for unlock notifications
//!
//! # Key Types
//!
//! - [`Achievement`] - The 12 achievement types
//! - [`AchievementRecord`] - Record of when an achievement was unlocked
//! - [`AchievementTracker`] - In-memory tracking of unlocked achievements
//! - [`AchievementStore`] - Persistent storage using sled
//! - [`AchievementService`] - Main integration point
//! - [`TriggerContext`] - Context for evaluating achievement triggers
//!
//! # Example
//!
//! ```rust,ignore
//! use swimchain::achievement::{AchievementService, AchievementStore, TriggerContext};
//! use std::sync::Arc;
//!
//! // Create service
//! let db = sled::open("my_db")?;
//! let store = Arc::new(AchievementStore::new(&db)?);
//! let service = AchievementService::new(store);
//!
//! // Check for new achievements after a post
//! let identity = [1u8; 32];
//! let ctx = TriggerContext::new()
//!     .with_post_count(1)
//!     .with_bandwidth(1000);
//!
//! let unlocked = service.check_and_unlock(&identity, &ctx, timestamp)?;
//! for achievement in unlocked {
//!     println!("Unlocked: {} {}", achievement.badge(), achievement.name());
//! }
//! ```
//!
//! # Permanence
//!
//! Per SPEC_09 §5.3, achievements are:
//! - **Permanent**: Once earned, cannot be revoked
//! - **Non-transferable**: Tied to identity, not tradeable
//! - **Visible**: Displayed on profile
//!
//! The storage layer enforces this by not providing any delete operations.

pub mod error;
pub mod service;
pub mod storage;
pub mod tracker;
pub mod triggers;
pub mod types;

// Re-export main types
pub use error::AchievementError;
pub use service::{AchievementEvent, AchievementService};
pub use storage::AchievementStore;
pub use tracker::AchievementTracker;
pub use triggers::{check_triggers, TriggerContext};
pub use types::{Achievement, AchievementRecord};

// Re-export threshold constants for external use
pub use triggers::{
    ALWAYS_ON_DAYS, BANDWIDTH_BARON_BYTES, CENTURION_STREAK_THRESHOLD, EFFICIENT_SWIMMER_RATIO,
    KEEPER_OF_FLAME_POSTS, MONTH_STREAK_THRESHOLD, TERABYTE_CLUB_BYTES, WEEK_STREAK_THRESHOLD,
};
