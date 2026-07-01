//! Unified storage manager (SPEC_07 - Milestone 1.6)
//!
//! Combines all storage components into a single interface.

use std::fs;

use super::blob::BlobStore;
use super::cache::LruCache;
use super::chain::ChainStore;
use super::config::StorageConfig;
use super::content::PersistentContentStore;
use super::metrics::StorageMetrics;
use crate::types::error::StorageError;
use crate::types::identity::IdentityId;

/// Unified storage manager
pub struct StorageManager {
    config: StorageConfig,
    chain: ChainStore,
    blobs: BlobStore,
    content: PersistentContentStore,
    cache: LruCache,
}

impl StorageManager {
    /// Open storage with config
    ///
    /// Creates all necessary directories and initializes storage components.
    ///
    /// # Errors
    ///
    /// Returns error if directories cannot be created or storage cannot be opened.
    pub fn open(config: StorageConfig, current_user: IdentityId) -> Result<Self, StorageError> {
        // Create directories if needed
        fs::create_dir_all(config.chain_path())?;
        fs::create_dir_all(config.blob_path())?;
        fs::create_dir_all(config.manifest_path())?;
        fs::create_dir_all(config.metadata_path())?;

        let chain = ChainStore::open(config.chain_path())?;
        let blobs = BlobStore::new(config.blob_path())?;
        let content = PersistentContentStore::open(config.metadata_path(), config.blob_path())?;
        let cache = LruCache::open(
            config.cache_index_path(),
            config.max_cache_bytes,
            config.eviction_threshold,
            current_user,
        )?;

        Ok(Self {
            config,
            chain,
            blobs,
            content,
            cache,
        })
    }

    /// Open with default config
    ///
    /// # Errors
    ///
    /// Returns error if storage cannot be opened.
    pub fn open_default(current_user: IdentityId) -> Result<Self, StorageError> {
        Self::open(StorageConfig::default(), current_user)
    }

    /// Open with custom base path and default settings
    ///
    /// # Errors
    ///
    /// Returns error if storage cannot be opened.
    pub fn open_at_path(
        path: impl Into<std::path::PathBuf>,
        current_user: IdentityId,
    ) -> Result<Self, StorageError> {
        let config = StorageConfig::with_base_path(path.into());
        Self::open(config, current_user)
    }

    /// Get config reference
    #[must_use]
    pub fn config(&self) -> &StorageConfig {
        &self.config
    }

    /// Get chain store reference
    #[must_use]
    pub fn chain(&self) -> &ChainStore {
        &self.chain
    }

    /// Get mutable chain store reference
    pub fn chain_mut(&mut self) -> &mut ChainStore {
        &mut self.chain
    }

    /// Get blob store reference
    #[must_use]
    pub fn blobs(&self) -> &BlobStore {
        &self.blobs
    }

    /// Get mutable blob store reference
    pub fn blobs_mut(&mut self) -> &mut BlobStore {
        &mut self.blobs
    }

    /// Get content store reference
    #[must_use]
    pub fn content(&self) -> &PersistentContentStore {
        &self.content
    }

    /// Get mutable content store reference
    pub fn content_mut(&mut self) -> &mut PersistentContentStore {
        &mut self.content
    }

    /// Get cache reference
    #[must_use]
    pub fn cache(&self) -> &LruCache {
        &self.cache
    }

    /// Get mutable cache reference
    pub fn cache_mut(&mut self) -> &mut LruCache {
        &mut self.cache
    }

    /// Get aggregated metrics
    ///
    /// # Errors
    ///
    /// Returns error if metrics cannot be collected.
    pub fn metrics(&self) -> Result<StorageMetrics, StorageError> {
        let (_cache_used, cache_max) = self.cache.usage();

        let blob_bytes = self.blobs.total_bytes();
        let chain_bytes = self.chain.total_bytes();
        let metadata_bytes = self.content.total_bytes();
        let cache_index_bytes = fs::metadata(self.config.cache_index_path())
            .map(|m| m.len())
            .unwrap_or(0);

        let total_bytes = blob_bytes + chain_bytes + metadata_bytes;

        Ok(StorageMetrics {
            total_bytes,
            chain_bytes,
            blob_bytes,
            metadata_bytes,
            cache_index_bytes,
            max_bytes: cache_max,
            root_block_count: self.chain.root_block_count()?,
            space_block_count: self.chain.space_block_count()?,
            content_block_count: self.chain.content_block_count()?,
            blob_count: self.blobs.blob_count()?,
            content_item_count: self.content.len() as u64,
            tombstone_count: self.content.tombstone_count() as u64,
            cache_entry_count: self.cache.len() as u64,
            cache_hit_rate: self.cache.hit_rate(),
            cache_hits: self.cache.cache_hits(),
            cache_misses: self.cache.cache_misses(),
        })
    }

    /// Check storage limits and trigger eviction if needed
    ///
    /// # Errors
    ///
    /// Returns error if eviction fails.
    pub fn enforce_limits(&mut self) -> Result<(), StorageError> {
        let metrics = self.metrics()?;

        if self.config.is_over_threshold(metrics.total_bytes) {
            let bytes_to_free = metrics.total_bytes
                - (self.config.max_cache_bytes as f64 * self.config.eviction_threshold) as u64;

            let evicted = self.cache.evict_if_needed(bytes_to_free)?;

            // Delete evicted blobs
            for hash in evicted {
                let _ = self.blobs.delete(&hash);
            }
        }

        Ok(())
    }

    /// Flush all pending writes
    ///
    /// # Errors
    ///
    /// Returns error if flush fails.
    pub fn flush(&self) -> Result<(), StorageError> {
        self.chain.flush()?;
        self.content.flush()?;
        self.cache.persist()?;
        Ok(())
    }

    /// Graceful shutdown
    ///
    /// # Errors
    ///
    /// Returns error if shutdown fails.
    pub fn shutdown(self) -> Result<(), StorageError> {
        self.flush()?;
        // sled handles its own shutdown when dropped
        Ok(())
    }

    /// Get total storage usage
    #[must_use]
    pub fn total_bytes(&self) -> u64 {
        self.blobs.total_bytes() + self.chain.total_bytes() + self.content.total_bytes()
    }

    /// Check if storage has capacity for additional bytes
    #[must_use]
    pub fn has_capacity(&self, additional_bytes: u64) -> bool {
        self.total_bytes().saturating_add(additional_bytes) <= self.config.max_cache_bytes
    }

    /// Get remaining capacity
    #[must_use]
    pub fn remaining_capacity(&self) -> u64 {
        self.config
            .max_cache_bytes
            .saturating_sub(self.total_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    use crate::blocks::{RootBlock, SpaceBlock, INITIAL_DIFFICULTY};
    use crate::storage::blob::ContentBlobHash;
    use crate::storage::cache::CacheEntry;
    use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
    use crate::types::identity::Signature;

    fn create_test_root_block(height: u64) -> RootBlock {
        RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: [0u8; 32],
            timestamp: 1_000_000 + height,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: 0,
            difficulty_target: INITIAL_DIFFICULTY,
            height,
            cumulative_pow: 0,
            block_creator: [0u8; 32],
        }
    }

    fn create_test_content(id: [u8; 32]) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: None,
            created_at: 1_000_000,
            last_engagement: 1_000_000,
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
    fn test_manager_open() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());

        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        assert!(dir.path().join("chain").exists());
        assert!(dir.path().join("content/blobs/sha256").exists());
        assert_eq!(manager.total_bytes(), 0);
    }

    #[test]
    fn test_manager_store_blocks() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        let block = create_test_root_block(0);
        let hash = manager.chain().put_root_block(&block).unwrap();

        let retrieved = manager.chain().get_root_block(&hash).unwrap();
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_manager_store_blobs() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        let data = b"hello world";
        let hash = manager.blobs().put(data).unwrap();

        assert!(manager.blobs().exists(&hash));
        let retrieved = manager.blobs().get(&hash).unwrap();
        assert_eq!(retrieved, data);
    }

    #[test]
    fn test_manager_store_content() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        let content = create_test_content([1u8; 32]);
        manager.content().put(&content).unwrap();

        let retrieved = manager.content().get(&content.content_id).unwrap();
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_manager_metrics() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        // Add some data
        manager
            .chain()
            .put_root_block(&create_test_root_block(0))
            .unwrap();
        manager.blobs().put(b"test data").unwrap();
        manager
            .content()
            .put(&create_test_content([1u8; 32]))
            .unwrap();

        let metrics = manager.metrics().unwrap();
        assert_eq!(metrics.root_block_count, 1);
        assert_eq!(metrics.blob_count, 1);
        assert_eq!(metrics.content_item_count, 1);
        assert!(metrics.total_bytes > 0);
    }

    #[test]
    fn test_manager_persistence() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());

        let hash;
        {
            let manager =
                StorageManager::open(config.clone(), IdentityId::from_bytes([1u8; 32])).unwrap();
            hash = manager.blobs().put(b"persistent data").unwrap();
            manager.flush().unwrap();
        }

        // Reopen
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();
        assert!(manager.blobs().exists(&hash));
    }

    #[test]
    fn test_manager_capacity() {
        let dir = tempdir().unwrap();
        let mut config = StorageConfig::with_base_path(dir.path().to_path_buf());
        config.max_cache_bytes = 1_000_000; // 1MB

        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        assert!(manager.has_capacity(100));
        assert!(manager.remaining_capacity() > 0);
    }

    #[test]
    fn test_manager_flush() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let mut manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        // Add cache entry
        let entry = CacheEntry::new(
            ContentBlobHash::from_bytes([1u8; 32]),
            1000,
            IdentityId::from_bytes([2u8; 32]),
            SpaceId::from_bytes([3u8; 32]),
            1_000_000,
        );
        manager.cache_mut().add_entry(entry);

        manager.flush().unwrap();

        // Cache index should exist
        assert!(dir.path().join("content/cache_index.json").exists());
    }
}
