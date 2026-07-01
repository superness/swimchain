//! Query handler for read operations
//!
//! Provides methods for querying content, sync status, and other read-only data.

use std::sync::{Arc, RwLock};

use crate::api::error::ApiError;
use crate::api::types::{ContentResponse, PoolSummary, SyncStatusResponse};
use crate::content::decay::calculate_decay_state;
use crate::content::pool::PoolManager;
use crate::storage::StorageManager;
use crate::types::constants::{DECAY_THRESHOLD, HALF_LIFE_SECS};
use crate::types::content::ContentId;

/// Handler for query (read) operations
pub struct QueryHandler {
    storage: Arc<RwLock<StorageManager>>,
    pool_manager: Option<Arc<RwLock<PoolManager>>>,
    half_life_secs: u64,
}

impl QueryHandler {
    /// Create a new query handler with storage
    #[must_use]
    pub fn new(storage: Arc<RwLock<StorageManager>>) -> Self {
        Self {
            storage,
            pool_manager: None,
            half_life_secs: HALF_LIFE_SECS,
        }
    }

    /// Configure with a pool manager for pool queries
    #[must_use]
    pub fn with_pool_manager(mut self, pm: Arc<RwLock<PoolManager>>) -> Self {
        self.pool_manager = Some(pm);
        self
    }

    /// Configure with a custom half-life for testing
    #[must_use]
    pub fn with_half_life(mut self, secs: u64) -> Self {
        self.half_life_secs = secs;
        self
    }

    /// Get content with decay state information
    ///
    /// Returns the content item along with computed decay state, including
    /// survival probability, hours until decay, and associated pool info.
    ///
    /// # Errors
    ///
    /// Returns `ApiError::ContentNotFound` if the content doesn't exist.
    /// Returns `ApiError::Storage` if there's a storage read error.
    pub fn get_content(&self, content_id: &ContentId) -> Result<ContentResponse, ApiError> {
        let current_time_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        // Get content from storage
        let storage = self
            .storage
            .read()
            .map_err(|e| ApiError::Storage(e.to_string()))?;

        let item = storage
            .content()
            .get(content_id)
            .map_err(|e| ApiError::Storage(e.to_string()))?
            .ok_or_else(|| ApiError::ContentNotFound(*content_id))?;

        // Calculate decay state
        let decay = calculate_decay_state(&item, current_time_ms, self.half_life_secs);

        // Calculate hours until decay
        let hours_until_decay = self.calculate_hours_until_decay(
            decay.survival_probability,
            decay.is_protected,
            decay.is_decayed,
        );

        // Get pool info if pool manager is available
        let pool = self.get_pool_for_content(&item.content_id, current_time_ms);

        Ok(ContentResponse {
            item,
            survival_probability: decay.survival_probability,
            is_decayed: decay.is_decayed,
            is_protected: decay.is_protected,
            hours_until_decay,
            pool,
        })
    }

    /// Calculate hours until content reaches decay threshold
    ///
    /// Returns None if content is protected or already decayed.
    fn calculate_hours_until_decay(
        &self,
        survival_probability: f64,
        is_protected: bool,
        is_decayed: bool,
    ) -> Option<u64> {
        if is_protected || is_decayed {
            return None;
        }

        // Formula: time until survival_probability reaches DECAY_THRESHOLD
        // survival = 0.5^(t/half_life), so t = half_life * log2(survival/threshold)
        let ratio = survival_probability / DECAY_THRESHOLD;
        if ratio <= 1.0 {
            Some(0)
        } else {
            let hours = (ratio.log2() * self.half_life_secs as f64 / 3600.0).max(0.0);
            Some(hours as u64)
        }
    }

    /// Get pool info for content if available
    fn get_pool_for_content(
        &self,
        content_id: &ContentId,
        current_time_ms: u64,
    ) -> Option<PoolSummary> {
        self.pool_manager.as_ref().and_then(|pm| {
            let content_hash = content_id.as_bytes();
            pm.read()
                .ok()?
                .get_pool_info_for_content(content_hash, current_time_ms)
                .map(PoolSummary::from)
        })
    }

    /// Get sync status (placeholder for now)
    ///
    /// Returns an idle sync status. Will be connected to actual sync
    /// state in future milestones.
    #[must_use]
    pub fn get_sync_status(&self) -> SyncStatusResponse {
        SyncStatusResponse::idle()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{StorageConfig, StorageManager};
    use crate::types::content::{ContentItem, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};
    use tempfile::tempdir;

    fn create_test_storage() -> Arc<RwLock<StorageManager>> {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let user_id = IdentityId::from_bytes([1u8; 32]);
        Arc::new(RwLock::new(StorageManager::open(config, user_id).unwrap()))
    }

    fn make_test_content(id: [u8; 32], created_at: u64, last_engagement: u64) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: None,
            created_at,
            last_engagement,
            body_inline: Some("Test content".to_string()),
            content_hash: None,
            content_size: None,
            content_type_mime: None,
            media_refs: vec![],
            pin_state: None,
            engagement_count: 0,
            signature: Signature::from_bytes([0u8; 64]),
            pow_nonce: 0,
            pow_difficulty: 0,
            preservation_pow: None,
            display_name: None,
        }
    }

    #[test]
    fn test_get_content_not_found() {
        let storage = create_test_storage();
        let handler = QueryHandler::new(storage);
        let id = ContentId::from_bytes([0u8; 32]);

        let result = handler.get_content(&id);
        assert!(matches!(result, Err(ApiError::ContentNotFound(_))));
    }

    #[test]
    fn test_get_content_found() {
        let storage = create_test_storage();

        // Add content
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let content = make_test_content([1u8; 32], now, now);
        {
            let s = storage.write().unwrap();
            s.content().put(&content).unwrap();
        }

        let handler = QueryHandler::new(storage);
        let result = handler.get_content(&content.content_id);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.item.content_id, content.content_id);
        // Content just created should be protected
        assert!(response.is_protected);
        assert_eq!(response.survival_probability, 1.0);
    }

    #[test]
    fn test_get_content_with_decay() {
        let storage = create_test_storage();

        // Create content from 10 days ago
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let ten_days_ago = now - (10 * 24 * 60 * 60 * 1000);
        let content = make_test_content([1u8; 32], ten_days_ago, ten_days_ago);
        {
            let s = storage.write().unwrap();
            s.content().put(&content).unwrap();
        }

        let handler = QueryHandler::new(storage);
        let result = handler.get_content(&content.content_id);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(!response.is_protected);
        assert!(response.survival_probability < 1.0);
        assert!(response.hours_until_decay.is_some());
    }

    #[test]
    fn test_hours_until_decay_protected() {
        let storage = create_test_storage();
        let handler = QueryHandler::new(storage);

        let hours = handler.calculate_hours_until_decay(1.0, true, false);
        assert!(hours.is_none());
    }

    #[test]
    fn test_hours_until_decay_already_decayed() {
        let storage = create_test_storage();
        let handler = QueryHandler::new(storage);

        let hours = handler.calculate_hours_until_decay(0.01, false, true);
        assert!(hours.is_none());
    }

    #[test]
    fn test_hours_until_decay_at_50_percent() {
        let storage = create_test_storage();
        let handler = QueryHandler::new(storage);

        // At 50% survival, content should decay in about 4 half-lives
        // (to reach 6.25% threshold: 50% -> 25% -> 12.5% -> 6.25%)
        // That's about 3 half-lives = 21 days = 504 hours
        let hours = handler.calculate_hours_until_decay(0.5, false, false);
        assert!(hours.is_some());
        let h = hours.unwrap();
        // 3 half-lives = 3 * 7 * 24 = 504 hours (roughly)
        assert!(h > 400 && h < 600, "Expected ~504 hours, got {}", h);
    }

    #[test]
    fn test_get_sync_status() {
        let storage = create_test_storage();
        let handler = QueryHandler::new(storage);

        let status = handler.get_sync_status();
        assert_eq!(status.state, crate::api::types::SyncState::Idle);
        assert_eq!(status.current_height, 0);
    }
}
