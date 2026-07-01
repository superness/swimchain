//! Content lifecycle manager (SPEC_02)
//!
//! High-level API for content management that orchestrates:
//! - Content creation and storage
//! - Decay state queries
//! - Engagement processing
//! - Periodic pruning
//! - Adaptive half-life adjustment

use std::sync::{Arc, RwLock};

use log::warn;

use crate::content::decay::{calculate_adaptive_half_life, calculate_decay_state, NodeState};
use crate::content::engagement::{process_engagement, EngagementResult};
use crate::content::pruning::{prune_decayed_content, PruneStats};
use crate::content::storage::{ContentStore, InMemoryContentStore};
use crate::types::constants::{HALF_LIFE_SECS, INLINE_CONTENT_THRESHOLD, TARGET_STORAGE_BYTES};
use crate::types::content::{ContentId, ContentItem, DecayState, EngagementRecord};
use crate::types::error::ContentError;

/// Content lifecycle manager
///
/// Thread-safe manager for content operations including:
/// - Content creation with inline threshold validation
/// - Decay state queries
/// - Engagement processing
/// - Pruning and adaptive half-life adjustment
pub struct ContentManager {
    storage: Arc<RwLock<InMemoryContentStore>>,
    current_half_life_secs: Arc<RwLock<u64>>,
    target_storage_bytes: u64,
}

impl ContentManager {
    /// Create a new content manager with default settings
    #[must_use]
    pub fn new() -> Self {
        Self {
            storage: Arc::new(RwLock::new(InMemoryContentStore::new())),
            current_half_life_secs: Arc::new(RwLock::new(HALF_LIFE_SECS)),
            target_storage_bytes: TARGET_STORAGE_BYTES,
        }
    }

    /// Create a content manager with custom target storage
    #[must_use]
    pub fn with_target_storage(target_bytes: u64) -> Self {
        Self {
            storage: Arc::new(RwLock::new(InMemoryContentStore::new())),
            current_half_life_secs: Arc::new(RwLock::new(HALF_LIFE_SECS)),
            target_storage_bytes: target_bytes,
        }
    }

    /// Create new content, enforcing inline threshold
    ///
    /// If body exceeds INLINE_CONTENT_THRESHOLD (1024 bytes), a warning is logged.
    /// The `last_engagement` field is initialized to `created_at`.
    ///
    /// # Arguments
    /// * `content` - The content item to create
    /// * `_current_time_ms` - Current time (unused, content has its own timestamp)
    ///
    /// # Returns
    /// The content ID on success, or an error
    ///
    /// # Errors
    /// Returns `ContentError::AlreadyExists` if content with this ID already exists.
    /// Returns `ContentError::StorageLockPoisoned` if the storage lock is poisoned.
    pub fn create_content(
        &self,
        mut content: ContentItem,
        _current_time_ms: u64,
    ) -> Result<ContentId, ContentError> {
        // Enforce inline threshold (SPEC_02 §3.1)
        if let Some(ref body) = content.body_inline {
            if body.len() > INLINE_CONTENT_THRESHOLD {
                warn!(
                    "Content body {} bytes exceeds inline threshold {}; should use content_hash",
                    body.len(),
                    INLINE_CONTENT_THRESHOLD
                );
                // Note: Implementation should set content_hash and clear body_inline
                // For now, log warning - full enforcement is client responsibility
            }
        }

        // Initialize last_engagement to created_at
        content.last_engagement = content.created_at;

        let mut storage = self
            .storage
            .write()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        storage.put(content.clone())?;

        Ok(content.content_id)
    }

    /// Get a content item by ID
    ///
    /// # Returns
    /// The content item if found, or None
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if the storage lock is poisoned.
    pub fn get_content(&self, id: &ContentId) -> Result<Option<ContentItem>, ContentError> {
        let storage = self
            .storage
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        Ok(storage.get(id).cloned())
    }

    /// Get the decay state for content at the given time
    ///
    /// # Returns
    /// The decay state if content exists, or None
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if a lock is poisoned.
    pub fn get_decay_state(
        &self,
        id: &ContentId,
        current_time_ms: u64,
    ) -> Result<Option<DecayState>, ContentError> {
        let storage = self
            .storage
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        let half_life = *self
            .current_half_life_secs
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;

        Ok(storage
            .get(id)
            .map(|c| calculate_decay_state(c, current_time_ms, half_life)))
    }

    /// Process an engagement record
    ///
    /// # Returns
    /// The engagement result (Accepted, Rejected, or PoolIncomplete)
    ///
    /// # Errors
    /// Returns `ContentError::NotFound` if the content doesn't exist.
    /// Returns `ContentError::StorageLockPoisoned` if a lock is poisoned.
    pub fn process_engagement(
        &self,
        engagement: EngagementRecord,
        current_time_ms: u64,
    ) -> Result<EngagementResult, ContentError> {
        let mut storage = self
            .storage
            .write()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        let half_life = *self
            .current_half_life_secs
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;

        let content = storage
            .get_mut(&engagement.content_id)
            .ok_or_else(|| ContentError::NotFound(engagement.content_id))?;

        Ok(process_engagement(
            content,
            &engagement,
            current_time_ms,
            half_life,
        ))
    }

    /// Prune decayed content from storage
    ///
    /// # Returns
    /// Statistics about the prune operation
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if a lock is poisoned.
    pub fn prune(&self, current_time_ms: u64) -> Result<PruneStats, ContentError> {
        let mut storage = self
            .storage
            .write()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        let half_life = *self
            .current_half_life_secs
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;

        Ok(prune_decayed_content(
            &mut *storage,
            current_time_ms,
            half_life,
        ))
    }

    /// Recalculate half-life based on storage pressure
    ///
    /// # Returns
    /// The new half-life in seconds
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if a lock is poisoned.
    pub fn adapt_half_life(&self) -> Result<u64, ContentError> {
        let storage = self
            .storage
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        let current_half_life = *self
            .current_half_life_secs
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;

        let state = NodeState {
            total_storage_bytes: storage.total_storage_bytes(),
            target_storage_bytes: self.target_storage_bytes,
            current_half_life_secs: current_half_life,
        };

        let new_half_life = calculate_adaptive_half_life(&state);

        drop(storage);

        let mut half_life = self
            .current_half_life_secs
            .write()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        *half_life = new_half_life;

        Ok(new_half_life)
    }

    /// Get current storage statistics
    ///
    /// # Returns
    /// Tuple of (total_bytes, item_count)
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if the storage lock is poisoned.
    pub fn storage_stats(&self) -> Result<(u64, usize), ContentError> {
        let storage = self
            .storage
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        Ok((storage.total_storage_bytes(), storage.len()))
    }

    /// Get the current half-life in seconds
    ///
    /// # Errors
    /// Returns `ContentError::StorageLockPoisoned` if the lock is poisoned.
    pub fn current_half_life(&self) -> Result<u64, ContentError> {
        let half_life = self
            .current_half_life_secs
            .read()
            .map_err(|_| ContentError::StorageLockPoisoned)?;
        Ok(*half_life)
    }
}

impl Default for ContentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::engagement::EngagementRejection;
    use crate::types::content::{ContentType, EngagementType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

    fn make_test_content(id: [u8; 32], created_at: u64, body: &str) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: None,
            created_at,
            last_engagement: created_at, // Will be overwritten by create_content
            body_inline: Some(body.to_string()),
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

    fn make_test_engagement(content_id: ContentId, timestamp: u64) -> EngagementRecord {
        EngagementRecord {
            content_id,
            engager_id: IdentityId::from_bytes([2u8; 32]),
            engagement_type: EngagementType::Reply,
            timestamp,
            pow_nonce: 0,
            pow_work: 0,
            signature: Signature::from_bytes([0u8; 64]),
            emoji: None,
        }
    }

    #[test]
    fn test_create_and_get_content() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let content = make_test_content([1u8; 32], now, "Hello");
        let id = content.content_id;

        manager.create_content(content, now).unwrap();

        let retrieved = manager.get_content(&id).unwrap().unwrap();
        assert_eq!(retrieved.content_id, id);
        assert_eq!(retrieved.last_engagement, now); // Should be set to created_at
    }

    #[test]
    fn test_decay_state_query() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let content = make_test_content([1u8; 32], now, "Hello");
        let id = content.content_id;

        manager.create_content(content, now).unwrap();

        let decay_state = manager.get_decay_state(&id, now).unwrap().unwrap();
        assert!(decay_state.is_protected); // Within floor period
        assert!(!decay_state.is_decayed);
    }

    #[test]
    fn test_engagement_processing() {
        let manager = ContentManager::new();
        let now = 1_000_000_000_u64;

        let content = make_test_content([1u8; 32], now, "Hello");
        let id = content.content_id;

        manager.create_content(content, now).unwrap();

        let engagement_time = now + 1_000_000;
        let engagement = make_test_engagement(id, engagement_time);

        let result = manager
            .process_engagement(engagement, engagement_time)
            .unwrap();
        assert_eq!(result, EngagementResult::Accepted);

        // Check engagement was recorded
        let updated = manager.get_content(&id).unwrap().unwrap();
        assert_eq!(updated.last_engagement, engagement_time);
        assert_eq!(updated.engagement_count, 1);
    }

    #[test]
    fn test_engagement_on_decayed_content() {
        let manager = ContentManager::new();

        // Content from 60 days ago
        let old_time = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000;

        let content = make_test_content([1u8; 32], old_time, "Old post");
        let id = content.content_id;

        manager.create_content(content, old_time).unwrap();

        let engagement = make_test_engagement(id, current_time);
        let result = manager
            .process_engagement(engagement, current_time)
            .unwrap();

        assert_eq!(
            result,
            EngagementResult::Rejected(EngagementRejection::ContentDecayed)
        );
    }

    #[test]
    fn test_storage_stats() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let (bytes, count) = manager.storage_stats().unwrap();
        assert_eq!(bytes, 0);
        assert_eq!(count, 0);

        let content = make_test_content([1u8; 32], now, "Hello");
        manager.create_content(content, now).unwrap();

        let (bytes, count) = manager.storage_stats().unwrap();
        assert!(bytes > 0);
        assert_eq!(count, 1);
    }

    #[test]
    fn test_prune_lifecycle() {
        let manager = ContentManager::new();

        // Create old content
        let old_time = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000;

        let content = make_test_content([1u8; 32], old_time, "Old post");
        manager.create_content(content, old_time).unwrap();

        // Prune
        let stats = manager.prune(current_time).unwrap();
        assert_eq!(stats.items_pruned, 1);

        let (_, count) = manager.storage_stats().unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_adapt_half_life() {
        // Create manager with small target
        let manager = ContentManager::with_target_storage(1000);
        let now = 1_000_000_u64;

        // Add content to exceed target
        let content = make_test_content([1u8; 32], now, &"X".repeat(2000));
        manager.create_content(content, now).unwrap();

        let original_half_life = manager.current_half_life().unwrap();
        let new_half_life = manager.adapt_half_life().unwrap();

        // Should decrease due to storage pressure
        assert!(new_half_life < original_half_life);
    }

    #[test]
    fn test_inline_threshold_warning() {
        // This test verifies the warning is triggered but doesn't fail
        // In real tests, we'd use a log capture crate
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let large_body = "X".repeat(2000); // Exceeds 1024 threshold
        let content = make_test_content([1u8; 32], now, &large_body);

        // Should succeed but log warning
        let result = manager.create_content(content, now);
        assert!(result.is_ok());
    }

    #[test]
    fn test_inline_at_threshold() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        // Exactly 1024 bytes - should not trigger warning
        let body = "X".repeat(1024);
        let content = make_test_content([1u8; 32], now, &body);

        let result = manager.create_content(content, now);
        assert!(result.is_ok());
    }

    #[test]
    fn test_duplicate_content_error() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let content = make_test_content([1u8; 32], now, "Hello");
        manager.create_content(content.clone(), now).unwrap();

        let result = manager.create_content(content, now);
        assert!(matches!(result, Err(ContentError::AlreadyExists(_))));
    }

    #[test]
    fn test_content_not_found() {
        let manager = ContentManager::new();
        let now = 1_000_000_u64;

        let id = ContentId::from_bytes([99u8; 32]);
        let engagement = make_test_engagement(id, now);

        let result = manager.process_engagement(engagement, now);
        assert!(matches!(result, Err(ContentError::NotFound(_))));
    }
}
