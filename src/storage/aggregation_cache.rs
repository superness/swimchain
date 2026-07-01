//! Aggregation cache for computed metadata (Option 2 implementation)
//!
//! This cache stores pre-computed aggregations like reply counts,
//! engagement scores, and last activity times for fast list view queries.
//!
//! The cache is:
//! - Rebuilt from blockchain on startup
//! - Updated incrementally as new content arrives
//! - Stored in Sled for persistence across restarts
//!
//! This separates the "source of truth" (blockchain) from the
//! "queryable view" (aggregation cache) for performance.

use std::path::Path;
use sled::Db;
use log::{info, debug, warn};
use crate::types::content::ContentId;
use crate::types::error::StorageError;

/// Aggregated metadata for a single content item
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContentAggregation {
    /// Number of direct replies
    pub reply_count: u64,
    /// Total engagement score (reactions + replies + preservations)
    pub engagement_score: u64,
    /// Last activity timestamp (most recent engagement)
    pub last_activity: u64,
    /// Depth in thread (0 = top-level post)
    pub thread_depth: u32,
}

impl ContentAggregation {
    pub fn new() -> Self {
        Self {
            reply_count: 0,
            engagement_score: 0,
            last_activity: 0,
            thread_depth: 0,
        }
    }
}

impl Default for ContentAggregation {
    fn default() -> Self {
        Self::new()
    }
}

/// Aggregated metadata for a space
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SpaceAggregation {
    /// Total post count (top-level only)
    pub post_count: u64,
    /// Total reply count (all replies in space)
    pub total_reply_count: u64,
    /// Total content count (posts + replies)
    pub total_content_count: u64,
    /// Last activity timestamp
    pub last_activity: u64,
}

impl SpaceAggregation {
    pub fn new() -> Self {
        Self {
            post_count: 0,
            total_reply_count: 0,
            total_content_count: 0,
            last_activity: 0,
        }
    }
}

impl Default for SpaceAggregation {
    fn default() -> Self {
        Self::new()
    }
}

/// Version marker for cache invalidation on schema changes
const CACHE_VERSION: u32 = 1;

/// Persistent aggregation cache using Sled
pub struct AggregationCache {
    db: Db,
    content_tree: sled::Tree,   // ContentId -> ContentAggregation
    space_tree: sled::Tree,     // SpaceId -> SpaceAggregation
    meta_tree: sled::Tree,      // Cache metadata (version, last rebuild time)
}

impl AggregationCache {
    /// Open or create the aggregation cache
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let db = sled::open(path.as_ref())?;
        let content_tree = db.open_tree("content_aggregations")?;
        let space_tree = db.open_tree("space_aggregations")?;
        let meta_tree = db.open_tree("cache_meta")?;

        let cache = Self {
            db,
            content_tree,
            space_tree,
            meta_tree,
        };

        // Check if rebuild is needed
        if cache.needs_rebuild()? {
            info!("[AGGREGATION-CACHE] Cache version mismatch or missing, will need rebuild");
        } else {
            debug!("[AGGREGATION-CACHE] Cache version {} is current", CACHE_VERSION);
        }

        Ok(cache)
    }

    /// Check if cache needs to be rebuilt (version mismatch or empty)
    pub fn needs_rebuild(&self) -> Result<bool, StorageError> {
        match self.meta_tree.get("version")? {
            Some(data) => {
                let version: u32 = bincode::deserialize(&data)?;
                Ok(version != CACHE_VERSION)
            }
            None => Ok(true),
        }
    }

    /// Mark cache as rebuilt with current version
    pub fn mark_rebuilt(&self) -> Result<(), StorageError> {
        let version_data = bincode::serialize(&CACHE_VERSION)?;
        self.meta_tree.insert("version", version_data)?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let timestamp_data = bincode::serialize(&timestamp)?;
        self.meta_tree.insert("last_rebuild", timestamp_data)?;

        info!("[AGGREGATION-CACHE] Marked as rebuilt, version {}", CACHE_VERSION);
        Ok(())
    }

    /// Clear all cached data (before rebuild)
    pub fn clear(&self) -> Result<(), StorageError> {
        self.content_tree.clear()?;
        self.space_tree.clear()?;
        info!("[AGGREGATION-CACHE] Cleared all cached aggregations");
        Ok(())
    }

    // =========================================================================
    // Content Aggregation Methods
    // =========================================================================

    /// Get aggregation for a content item
    pub fn get_content(&self, content_id: &ContentId) -> Result<Option<ContentAggregation>, StorageError> {
        match self.content_tree.get(&content_id.0)? {
            Some(data) => {
                let agg: ContentAggregation = bincode::deserialize(&data)?;
                Ok(Some(agg))
            }
            None => Ok(None),
        }
    }

    /// Get reply count for a content item (fast path)
    pub fn get_reply_count(&self, content_id: &ContentId) -> Result<u64, StorageError> {
        match self.get_content(content_id)? {
            Some(agg) => Ok(agg.reply_count),
            None => Ok(0),
        }
    }

    /// Set aggregation for a content item
    pub fn set_content(&self, content_id: &ContentId, agg: &ContentAggregation) -> Result<(), StorageError> {
        let data = bincode::serialize(agg)?;
        self.content_tree.insert(&content_id.0, data)?;
        Ok(())
    }

    /// Increment reply count for a parent
    pub fn increment_reply_count(&self, parent_id: &ContentId) -> Result<(), StorageError> {
        let mut agg = self.get_content(parent_id)?.unwrap_or_default();
        agg.reply_count += 1;
        self.set_content(parent_id, &agg)?;
        debug!("[AGGREGATION-CACHE] Incremented reply count for {:?} to {}", parent_id, agg.reply_count);
        Ok(())
    }

    /// Update last activity for a content item
    pub fn update_last_activity(&self, content_id: &ContentId, timestamp: u64) -> Result<(), StorageError> {
        let mut agg = self.get_content(content_id)?.unwrap_or_default();
        if timestamp > agg.last_activity {
            agg.last_activity = timestamp;
            self.set_content(content_id, &agg)?;
        }
        Ok(())
    }

    /// Initialize a new content item in the cache
    pub fn init_content(&self, content_id: &ContentId, thread_depth: u32, created_at: u64) -> Result<(), StorageError> {
        let agg = ContentAggregation {
            reply_count: 0,
            engagement_score: 0,
            last_activity: created_at,
            thread_depth,
        };
        self.set_content(content_id, &agg)?;
        Ok(())
    }

    // =========================================================================
    // Space Aggregation Methods
    // =========================================================================

    /// Get aggregation for a space
    pub fn get_space(&self, space_id: &[u8; 16]) -> Result<Option<SpaceAggregation>, StorageError> {
        match self.space_tree.get(space_id)? {
            Some(data) => {
                let agg: SpaceAggregation = bincode::deserialize(&data)?;
                Ok(Some(agg))
            }
            None => Ok(None),
        }
    }

    /// Set aggregation for a space
    pub fn set_space(&self, space_id: &[u8; 16], agg: &SpaceAggregation) -> Result<(), StorageError> {
        let data = bincode::serialize(agg)?;
        self.space_tree.insert(space_id, data)?;
        Ok(())
    }

    /// Increment post count for a space
    pub fn increment_post_count(&self, space_id: &[u8; 16], timestamp: u64) -> Result<(), StorageError> {
        let mut agg = self.get_space(space_id)?.unwrap_or_default();
        agg.post_count += 1;
        agg.total_content_count += 1;
        if timestamp > agg.last_activity {
            agg.last_activity = timestamp;
        }
        self.set_space(space_id, &agg)?;
        debug!("[AGGREGATION-CACHE] Space {:?} now has {} posts", space_id, agg.post_count);
        Ok(())
    }

    /// Increment reply count for a space
    pub fn increment_space_reply_count(&self, space_id: &[u8; 16], timestamp: u64) -> Result<(), StorageError> {
        let mut agg = self.get_space(space_id)?.unwrap_or_default();
        agg.total_reply_count += 1;
        agg.total_content_count += 1;
        if timestamp > agg.last_activity {
            agg.last_activity = timestamp;
        }
        self.set_space(space_id, &agg)?;
        Ok(())
    }

    // =========================================================================
    // Batch Operations (for rebuild)
    // =========================================================================

    /// Batch update content aggregations
    pub fn batch_set_content(&self, updates: &[(ContentId, ContentAggregation)]) -> Result<(), StorageError> {
        let mut batch = sled::Batch::default();
        for (id, agg) in updates {
            let data = bincode::serialize(agg)?;
            batch.insert(&id.0, data);
        }
        self.content_tree.apply_batch(batch)?;
        Ok(())
    }

    /// Batch update space aggregations
    pub fn batch_set_space(&self, updates: &[([u8; 16], SpaceAggregation)]) -> Result<(), StorageError> {
        let mut batch = sled::Batch::default();
        for (id, agg) in updates {
            let data = bincode::serialize(agg)?;
            batch.insert(id, data);
        }
        self.space_tree.apply_batch(batch)?;
        Ok(())
    }

    /// Flush to disk
    pub fn flush(&self) -> Result<(), StorageError> {
        self.db.flush()?;
        Ok(())
    }

    /// Get statistics about the cache
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            content_entries: self.content_tree.len(),
            space_entries: self.space_tree.len(),
        }
    }
}

/// Statistics about the aggregation cache
#[derive(Debug)]
pub struct CacheStats {
    pub content_entries: usize,
    pub space_entries: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_content_aggregation() {
        let dir = tempdir().unwrap();
        let cache = AggregationCache::open(dir.path().join("cache")).unwrap();

        let content_id = ContentId::from_bytes([1u8; 32]);

        // Initially empty
        assert!(cache.get_content(&content_id).unwrap().is_none());
        assert_eq!(cache.get_reply_count(&content_id).unwrap(), 0);

        // Initialize
        cache.init_content(&content_id, 0, 1000).unwrap();
        assert_eq!(cache.get_reply_count(&content_id).unwrap(), 0);

        // Increment reply count
        cache.increment_reply_count(&content_id).unwrap();
        cache.increment_reply_count(&content_id).unwrap();
        assert_eq!(cache.get_reply_count(&content_id).unwrap(), 2);
    }

    #[test]
    fn test_space_aggregation() {
        let dir = tempdir().unwrap();
        let cache = AggregationCache::open(dir.path().join("cache")).unwrap();

        let space_id: [u8; 16] = [2u8; 16];

        // Initially empty
        assert!(cache.get_space(&space_id).unwrap().is_none());

        // Add posts
        cache.increment_post_count(&space_id, 1000).unwrap();
        cache.increment_post_count(&space_id, 2000).unwrap();

        let agg = cache.get_space(&space_id).unwrap().unwrap();
        assert_eq!(agg.post_count, 2);
        assert_eq!(agg.total_content_count, 2);
        assert_eq!(agg.last_activity, 2000);
    }

    #[test]
    fn test_version_check() {
        let dir = tempdir().unwrap();
        let cache = AggregationCache::open(dir.path().join("cache")).unwrap();

        // Fresh cache needs rebuild
        assert!(cache.needs_rebuild().unwrap());

        // After marking rebuilt, no longer needs it
        cache.mark_rebuilt().unwrap();
        assert!(!cache.needs_rebuild().unwrap());
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cache");

        let content_id = ContentId::from_bytes([1u8; 32]);

        {
            let cache = AggregationCache::open(&path).unwrap();
            cache.init_content(&content_id, 0, 1000).unwrap();
            cache.increment_reply_count(&content_id).unwrap();
            cache.mark_rebuilt().unwrap();
            cache.flush().unwrap();
        }

        // Reopen
        {
            let cache = AggregationCache::open(&path).unwrap();
            assert!(!cache.needs_rebuild().unwrap());
            assert_eq!(cache.get_reply_count(&content_id).unwrap(), 1);
        }
    }
}
