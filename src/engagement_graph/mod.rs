//! Engagement Graph Tracking
//!
//! Tracks who engages with whose content to inform:
//! - Organic community detection
//! - Automated level upgrades (future)
//! - Spam/self-engagement pattern detection
//!
//! # Data Model
//!
//! We track directed edges: `engager -> author`
//! Each edge has:
//! - Total engagement count
//! - Recent engagement timestamps (sliding window)
//! - Breakdown by engagement type (reply, reaction, quote)
//!
//! # Storage
//!
//! Uses sled for persistent storage with keys:
//! - `edge:{engager}:{author}` -> EngagementEdge
//! - `out:{engager}` -> list of authors engaged with
//! - `in:{author}` -> list of engagers
//! - `stats:{identity}` -> EngagementStats

mod storage;
mod types;

pub use storage::EngagementGraphStore;
pub use types::{EngagementEdge, EngagementStats, EngagementType};
