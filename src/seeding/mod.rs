//! Seeding and availability layer (SPEC_07 - Milestone 3.5)
//!
//! This module provides content seeding capabilities for the Swimchain protocol.
//!
//! # Overview
//!
//! Seeding allows nodes to share content they have stored locally with other nodes
//! in the network. This is a voluntary action that can be configured per-user.
//!
//! # Features
//!
//! - **Seeding Configuration**: Control which content to seed (own, viewed, spaces)
//! - **Bandwidth Limiting**: Token bucket rate limiter prevents network overload
//! - **Statistics Tracking**: Monitor upload/download metrics and health
//! - **Availability Announcements**: Gossip-based content discovery
//! - **Mobile Support**: WiFi-only mode and cellular data limits
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────┐
//! │                    SeedingManager                       │
//! │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
//! │  │   Config    │  │ RateLimiter  │  │  Statistics   │  │
//! │  │ (spaces,    │  │ (token       │  │ (bytes,       │  │
//! │  │  bandwidth) │  │  bucket)     │  │  requests)    │  │
//! │  └─────────────┘  └──────────────┘  └───────────────┘  │
//! └─────────────────────────────────────────────────────────┘
//!                           │
//!                           ▼
//! ┌─────────────────────────────────────────────────────────┐
//! │                  AvailabilityHandler                    │
//! │  - on_content_stored(): queue for announcement         │
//! │  - get_announcement_batches(): prepare gossip payloads │
//! │  - should_reannounce(): check re-announcement timer    │
//! └─────────────────────────────────────────────────────────┘
//! ```
//!
//! # Configuration
//!
//! ```rust
//! use swimchain::seeding::{SeedingConfig, SeedingMode};
//!
//! // Default configuration: seed own and viewed content
//! let config = SeedingConfig::default();
//! assert_eq!(config.mode(), SeedingMode::ViewedContent);
//!
//! // Seed only own content
//! let own_only = SeedingConfig::own_content_only();
//! assert_eq!(own_only.mode(), SeedingMode::OwnContent);
//!
//! // Disable seeding
//! let disabled = SeedingConfig::disabled();
//! assert_eq!(disabled.mode(), SeedingMode::Disabled);
//! ```
//!
//! # Usage
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use swimchain::seeding::{SeedingManager, SeedingConfig, AvailabilityHandler};
//! use swimchain::types::identity::IdentityId;
//!
//! // Create seeding manager
//! let user = IdentityId::from_bytes([1u8; 32]);
//! let manager = Arc::new(SeedingManager::with_defaults(user));
//!
//! // Create availability handler
//! let handler = AvailabilityHandler::new(Arc::clone(&manager));
//!
//! // Check if content should be seeded
//! let should = manager.should_seed(&hash, space, owner, created_at);
//!
//! // Acquire bandwidth for serving
//! let acquired = manager.try_acquire_bandwidth(1_000_000);
//! if acquired == 1_000_000 {
//!     // Serve content...
//!     manager.record_served(acquired, space);
//! }
//! ```

pub mod availability;
pub mod config;
pub mod manager;
pub mod rate_limiter;
pub mod statistics;

// Re-export main types
pub use availability::{AvailabilityAnnouncePayload, AvailabilityHandler, PeerAvailabilityMap};
pub use config::{ConfigError, MobileConfig, SeedingConfig, SeedingMode};
pub use manager::{NetworkStateProvider, SeedingManager};
pub use rate_limiter::TokenBucketLimiter;
pub use statistics::{SeedingHealth, SeedingStatistics, SpaceStats, StatisticsSnapshot};
