//! API request/response types
//!
//! Defines the data structures used for API requests and responses.

use serde::{Deserialize, Serialize};

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
