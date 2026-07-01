//! Space health system for Swimchain
//!
//! This module implements SPEC_09 (Social Layer) Section 6: Space-Level Social Features.
//! It provides space-level health indicators including:
//! - Active swimmer count (identities with Level >= Regular active in last 7 days)
//! - Top contributors list (per period)
//! - Posts at risk of decay (6.25% <= survival < 25%)
//! - Health score (0-100) computed from multiple factors
//!
//! The health score formula (per docs/analytics-client.md):
//! - Swimmer score (30%): active_swimmers / 10 * 30, capped at 30
//! - Risk score (30%): max(0, 30 - posts_at_risk), capped at 30
//! - Sync score (20%): 20 if last_sync < 5 minutes, else 0
//! - Contribution score (20%): monthly_bandwidth_gb / 100 * 20, capped at 20

mod compute;
mod contributors;
mod error;
mod handler;
mod manager;
mod risk;
mod tracker;
mod types;

pub use compute::compute_health_score;
pub use contributors::{ContributorRanker, SpaceContributionData};
pub use error::SpaceHealthError;
pub use handler::SpaceHealthQueryHandler;
pub use manager::SpaceHealthManager;
pub use risk::{count_posts_at_risk, AT_RISK_THRESHOLD, DECAY_THRESHOLD};
pub use tracker::SpaceSwimmerTracker;
pub use types::{SpaceContributor, SpaceHealth};
