//! API request/response types
//!
//! Defines the data structures used for API requests and responses.

use serde::{Deserialize, Serialize};

use crate::content::pool::{PoolId, PoolInfo};
use crate::types::content::ContentItem;

/// Response containing content with decay state information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentResponse {
    /// The content item
    pub item: ContentItem,
    /// Current survival probability (0.0 to 1.0)
    pub survival_probability: f64,
    /// Whether content has decayed below threshold
    pub is_decayed: bool,
    /// Whether content is protected (floor period or pinned)
    pub is_protected: bool,
    /// Hours until content decays. None if protected or already decayed.
    pub hours_until_decay: Option<u64>,
    /// Associated pool summary, if any
    pub pool: Option<PoolSummary>,
}

/// Summary of an engagement pool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolSummary {
    /// Unique pool identifier
    pub pool_id: PoolId,
    /// Total seconds contributed so far
    pub contributed_seconds: u64,
    /// Required total seconds for completion
    pub required_seconds: u64,
    /// Number of contributions (not unique contributors)
    pub contributor_count: usize,
    /// Milliseconds remaining in pool window. None if completed/expired.
    pub time_remaining_ms: Option<u64>,
    /// Progress percentage, capped at 100.0
    pub progress_percentage: f64,
}

impl From<PoolInfo> for PoolSummary {
    fn from(info: PoolInfo) -> Self {
        let progress = if info.required > 0 {
            (info.total_contributed as f64 / info.required as f64 * 100.0).min(100.0)
        } else {
            100.0
        };

        Self {
            pool_id: info.pool_id,
            contributed_seconds: info.total_contributed,
            required_seconds: info.required,
            contributor_count: info.contributor_count,
            time_remaining_ms: info.time_remaining_ms,
            progress_percentage: progress,
        }
    }
}

/// Sync state enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncState {
    /// Not syncing
    Idle,
    /// Connecting to peers
    Connecting,
    /// Actively syncing
    Syncing,
    /// Sync completed
    Complete,
    /// Sync failed
    Failed,
}

/// Response containing sync status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusResponse {
    /// Current sync state
    pub state: SyncState,
    /// Current block height
    pub current_height: u64,
    /// Target block height
    pub target_height: u64,
    /// Number of connected peers
    pub peer_count: usize,
    /// Total bytes downloaded
    pub bytes_downloaded: u64,
    /// Sync progress percentage
    pub progress_percentage: f64,
}

impl SyncStatusResponse {
    /// Create a placeholder idle response
    #[must_use]
    pub fn idle() -> Self {
        Self {
            state: SyncState::Idle,
            current_height: 0,
            target_height: 0,
            peer_count: 0,
            bytes_downloaded: 0,
            progress_percentage: 0.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::pool::PoolStatus;

    #[test]
    fn test_pool_summary_from_info() {
        let info = PoolInfo {
            pool_id: [0u8; 32],
            target_content: [1u8; 32],
            status: PoolStatus::Open,
            total_contributed: 30,
            required: 60,
            contributor_count: 3,
            time_remaining_ms: Some(300_000),
        };

        let summary = PoolSummary::from(info);
        assert_eq!(summary.contributed_seconds, 30);
        assert_eq!(summary.required_seconds, 60);
        assert_eq!(summary.contributor_count, 3);
        assert_eq!(summary.progress_percentage, 50.0);
    }

    #[test]
    fn test_pool_summary_caps_at_100() {
        let info = PoolInfo {
            pool_id: [0u8; 32],
            target_content: [1u8; 32],
            status: PoolStatus::Completed,
            total_contributed: 120,
            required: 60,
            contributor_count: 1,
            time_remaining_ms: None,
        };

        let summary = PoolSummary::from(info);
        assert_eq!(summary.progress_percentage, 100.0);
    }

    #[test]
    fn test_sync_status_idle() {
        let status = SyncStatusResponse::idle();
        assert_eq!(status.state, SyncState::Idle);
        assert_eq!(status.current_height, 0);
        assert_eq!(status.progress_percentage, 0.0);
    }

    #[test]
    fn test_sync_state_serialization() {
        let state = SyncState::Syncing;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"Syncing\"");

        let deserialized: SyncState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, SyncState::Syncing);
    }
}
