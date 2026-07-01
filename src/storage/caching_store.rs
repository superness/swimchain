//! Caching content store (SPEC_07 - Milestone 3.4)
//!
//! Wraps BlobStore with LRU cache tracking for automatic eviction.
//!
//! # Architecture
//!
//! ```text
//! ┌──────────────────────────────────────────┐
//! │         CachingContentStore              │
//! │  (Wraps BlobStore + LruCache)            │
//! ├──────────────────────────────────────────┤
//! │ put_with_metadata() → evict + store      │
//! │ get() → access + retrieve                │
//! │ apply_profile() → resize + evict         │
//! └──────────────────────────────────────────┘
//!          │                    │
//!          ▼                    ▼
//! ┌─────────────────┐  ┌─────────────────┐
//! │    BlobStore    │  │    LruCache     │
//! │  (Filesystem)   │  │  (Index JSON)   │
//! └─────────────────┘  └─────────────────┘
//! ```
//!
//! # Usage
//!
//! ```no_run
//! use std::sync::{Arc, RwLock};
//! use swimchain::storage::{BlobStore, CachingContentStore, LruCache, StorageConfig, StorageProfile};
//! use swimchain::types::identity::IdentityId;
//! use swimchain::types::content::SpaceId;
//!
//! // Create components
//! let blob_store = Arc::new(BlobStore::new("/path/to/blobs").unwrap());
//! let cache = Arc::new(RwLock::new(
//!     LruCache::open("/path/to/cache.json", 5_368_709_120, 0.90, IdentityId::from_bytes([0u8; 32])).unwrap()
//! ));
//! let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
//! let user = IdentityId::from_bytes([1u8; 32]);
//!
//! // Create caching store
//! let store = CachingContentStore::new(blob_store, cache, config, user).unwrap();
//!
//! // Store content with metadata
//! let hash = store.put_with_metadata(
//!     b"hello world",
//!     IdentityId::from_bytes([2u8; 32]),  // owner
//!     SpaceId::from_bytes([3u8; 32]),     // space
//!     1234567890,                          // created_at
//! ).unwrap();
//!
//! // Retrieve content
//! let data = store.get(&hash).unwrap();
//! ```

use std::sync::{Arc, RwLock};

use super::blob::{BlobStore, ContentBlobHash};
use super::cache::{CacheEntry, CacheStatistics, LruCache};
use super::config::{StorageConfig, StorageProfile};
use crate::types::content::SpaceId;
use crate::types::error::StorageError;
use crate::types::identity::IdentityId;

/// Callback invoked when content is evicted from cache (Milestone 3.5)
///
/// Used for availability withdrawal announcements.
pub type EvictionCallback = Arc<dyn Fn(&ContentBlobHash) + Send + Sync>;

/// Wrapper that integrates BlobStore with LRU cache tracking
///
/// Provides automatic eviction when storing content, and records
/// access patterns for LRU-based cache management.
pub struct CachingContentStore {
    blob_store: Arc<BlobStore>,
    cache: Arc<RwLock<LruCache>>,
    config: StorageConfig,
    current_user: IdentityId,
    /// Optional callback for eviction events (Milestone 3.5)
    eviction_callback: RwLock<Option<EvictionCallback>>,
}

impl CachingContentStore {
    /// Create new caching store, reconciling orphan blobs
    ///
    /// # Errors
    ///
    /// Returns error if reconciliation fails.
    pub fn new(
        blob_store: Arc<BlobStore>,
        cache: Arc<RwLock<LruCache>>,
        config: StorageConfig,
        current_user: IdentityId,
    ) -> Result<Self, StorageError> {
        let store = Self {
            blob_store,
            cache,
            config,
            current_user,
            eviction_callback: RwLock::new(None),
        };
        store.reconcile()?;
        Ok(store)
    }

    /// Create without reconciliation (for testing or when blobs are known to be tracked)
    #[must_use]
    pub fn new_without_reconcile(
        blob_store: Arc<BlobStore>,
        cache: Arc<RwLock<LruCache>>,
        config: StorageConfig,
        current_user: IdentityId,
    ) -> Self {
        Self {
            blob_store,
            cache,
            config,
            current_user,
            eviction_callback: RwLock::new(None),
        }
    }

    /// Reconcile orphan blobs (in BlobStore but not in cache)
    ///
    /// Creates conservative cache entries for any blobs not already tracked.
    fn reconcile(&self) -> Result<(), StorageError> {
        let mut cache = self
            .cache
            .write()
            .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;

        for hash_result in self.blob_store.iter_hashes() {
            let hash = hash_result?;
            if !cache.contains(&hash) {
                // Orphan blob: create entry with lowest eviction priority
                // Owner = zero (distinct from current_user, enables eviction)
                // Space = zero (unknown, not followed)
                // Created = 0 (old timestamp)
                // This ensures orphans have EvictionPriority::OldUnfollowed (evict first)
                let size = self.blob_store.get(&hash)?.len() as u64;
                let entry = CacheEntry::new(
                    hash,
                    size,
                    IdentityId::from_bytes([0u8; 32]), // Orphan marker: distinct from current_user
                    SpaceId::from_bytes([0u8; 32]),
                    0, // Old timestamp = low priority
                );
                cache.add_entry(entry);
            }
        }
        cache.persist()?;
        Ok(())
    }

    /// Store content with metadata
    ///
    /// Evicts entries if necessary before storing. The new content is added
    /// to the cache with the provided metadata for eviction priority calculation.
    ///
    /// # Errors
    ///
    /// Returns error if storage fails or cache is full with protected content.
    pub fn put_with_metadata(
        &self,
        data: &[u8],
        owner_id: IdentityId,
        space_id: SpaceId,
        created_at: u64,
    ) -> Result<ContentBlobHash, StorageError> {
        let hash = ContentBlobHash::compute(data);
        let size = data.len() as u64;

        // Evict if needed before storing
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;
            let evicted = cache.evict_if_needed(size)?;
            // Delete evicted blobs from disk and notify callback
            for evicted_hash in evicted {
                // Call eviction callback first (Milestone 3.5)
                if let Ok(callback) = self.eviction_callback.read() {
                    if let Some(ref cb) = *callback {
                        cb(&evicted_hash);
                    }
                }
                let _ = self.blob_store.delete(&evicted_hash);
            }
        }

        // Store blob
        self.blob_store.put_with_hash(data, &hash)?;

        // Add to cache
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;
            let entry = CacheEntry::new(hash, size, owner_id, space_id, created_at);
            cache.add_entry(entry);
        }

        Ok(hash)
    }

    /// Get content, recording cache access
    ///
    /// Updates the LRU access time for the content.
    ///
    /// # Errors
    ///
    /// Returns error if content not found or read fails.
    pub fn get(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError> {
        // Record access (updates LRU)
        if let Ok(mut cache) = self.cache.write() {
            cache.access(hash);
        }
        self.blob_store.get(hash)
    }

    /// Get content without recording access (for internal operations)
    ///
    /// # Errors
    ///
    /// Returns error if content not found or read fails.
    pub fn get_unchecked(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError> {
        self.blob_store.get_unchecked(hash)
    }

    /// Delete content from cache and blob store
    ///
    /// # Errors
    ///
    /// Returns error if deletion fails.
    pub fn delete(&self, hash: &ContentBlobHash) -> Result<bool, StorageError> {
        {
            let mut cache = self
                .cache
                .write()
                .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;
            cache.remove_entry(hash);
        }
        self.blob_store.delete(hash)
    }

    /// Check if content exists
    #[must_use]
    pub fn exists(&self, hash: &ContentBlobHash) -> bool {
        self.blob_store.exists(hash)
    }

    /// Apply storage profile (updates max_bytes and eviction_threshold)
    ///
    /// Triggers eviction if the cache is now over the new threshold.
    ///
    /// # Errors
    ///
    /// Returns error if eviction fails.
    pub fn apply_profile(&self, profile: StorageProfile) -> Result<(), StorageError> {
        let mut cache = self
            .cache
            .write()
            .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;
        cache.set_max_bytes(profile.max_cache_bytes());
        cache.set_eviction_threshold(profile.eviction_threshold());
        // Trigger eviction if now over threshold
        let evicted = cache.evict_if_needed(0)?;
        drop(cache);
        for evicted_hash in evicted {
            // Call eviction callback first (Milestone 3.5)
            if let Ok(callback) = self.eviction_callback.read() {
                if let Some(ref cb) = *callback {
                    cb(&evicted_hash);
                }
            }
            let _ = self.blob_store.delete(&evicted_hash);
        }
        Ok(())
    }

    /// Set callback for eviction events (Milestone 3.5)
    ///
    /// The callback is invoked for each content hash that is evicted from the cache.
    /// This can be used for availability withdrawal announcements.
    pub fn set_eviction_callback(&self, callback: EvictionCallback) {
        if let Ok(mut cb) = self.eviction_callback.write() {
            *cb = Some(callback);
        }
    }

    /// Clear eviction callback
    pub fn clear_eviction_callback(&self) {
        if let Ok(mut cb) = self.eviction_callback.write() {
            *cb = None;
        }
    }

    /// Get cache statistics
    #[must_use]
    pub fn statistics(&self) -> Option<CacheStatistics> {
        self.cache.read().ok().map(|c| c.statistics())
    }

    /// Get the underlying blob store
    #[must_use]
    pub fn blob_store(&self) -> &Arc<BlobStore> {
        &self.blob_store
    }

    /// Get the underlying cache
    #[must_use]
    pub fn cache(&self) -> &Arc<RwLock<LruCache>> {
        &self.cache
    }

    /// Get the current configuration
    #[must_use]
    pub fn config(&self) -> &StorageConfig {
        &self.config
    }

    /// Get the current user ID
    #[must_use]
    pub fn current_user(&self) -> IdentityId {
        self.current_user
    }

    /// Persist cache index to disk
    ///
    /// # Errors
    ///
    /// Returns error if write fails.
    pub fn persist(&self) -> Result<(), StorageError> {
        let cache = self
            .cache
            .read()
            .map_err(|_| StorageError::IoError("cache lock poisoned".into()))?;
        cache.persist()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_store() -> (CachingContentStore, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let user = IdentityId::from_bytes([1u8; 32]);
        let cache = Arc::new(RwLock::new(
            LruCache::open(
                dir.path().join("cache_index.json"),
                10_000_000, // 10MB for testing
                0.9,
                user,
            )
            .unwrap(),
        ));
        let config = StorageConfig::from_profile(StorageProfile::Standard5GB);

        let store = CachingContentStore::new_without_reconcile(blob_store, cache, config, user);
        (store, dir)
    }

    #[test]
    fn test_caching_store_put_get_roundtrip() {
        let (store, _dir) = create_test_store();

        let data = b"test content for roundtrip";
        let owner = IdentityId::from_bytes([2u8; 32]);
        let space = SpaceId::from_bytes([3u8; 32]);

        let hash = store
            .put_with_metadata(data, owner, space, 1234567890)
            .unwrap();

        // Verify get returns same data
        let retrieved = store.get(&hash).unwrap();
        assert_eq!(retrieved, data.to_vec());

        // Verify cache tracks it
        let cache = store.cache.read().unwrap();
        assert!(cache.contains(&hash));
    }

    #[test]
    fn test_caching_store_eviction_on_put() {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let user = IdentityId::from_bytes([1u8; 32]);
        let cache = Arc::new(RwLock::new(
            LruCache::open(
                dir.path().join("cache_index.json"),
                10_000, // 10KB max
                0.5,    // 50% threshold = 5KB
                user,
            )
            .unwrap(),
        ));
        let config = StorageConfig::from_profile(StorageProfile::Standard5GB);

        let store = CachingContentStore::new_without_reconcile(blob_store, cache, config, user);

        // Add content from other owner (evictable)
        let other_owner = IdentityId::from_bytes([2u8; 32]);
        let space = SpaceId::from_bytes([3u8; 32]);

        // Fill with 4KB of evictable content
        let data1 = vec![1u8; 2000];
        let data2 = vec![2u8; 2000];
        store
            .put_with_metadata(&data1, other_owner, space, 100)
            .unwrap();
        store
            .put_with_metadata(&data2, other_owner, space, 200)
            .unwrap();

        // Add 2KB more - should trigger eviction
        let data3 = vec![3u8; 2000];
        store
            .put_with_metadata(&data3, other_owner, space, 300)
            .unwrap();

        // Check eviction happened
        let stats = store.statistics().unwrap();
        assert!(
            stats.eviction_count > 0,
            "Expected evictions, got {}",
            stats.eviction_count
        );
        assert!(
            stats.total_bytes < 5000,
            "Expected < 5KB after eviction, got {}",
            stats.total_bytes
        );
    }

    #[test]
    fn test_caching_store_apply_profile() {
        let (store, _dir) = create_test_store();

        // Initially using Standard5GB internally (10MB for test)
        let stats = store.statistics().unwrap();
        assert_eq!(stats.max_bytes, 10_000_000);

        // Apply Budget profile
        store.apply_profile(StorageProfile::Budget1GB).unwrap();

        let cache = store.cache.read().unwrap();
        assert_eq!(
            cache.max_bytes(),
            StorageProfile::Budget1GB.max_cache_bytes()
        );
        assert!(
            (cache.eviction_threshold() - StorageProfile::Budget1GB.eviction_threshold()).abs()
                < f64::EPSILON
        );
    }

    #[test]
    fn test_caching_store_reconcile_orphans() {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());

        // Add 5 blobs directly to blob store (bypassing cache)
        let mut hashes = Vec::new();
        for i in 0..5 {
            let data = format!("orphan blob {}", i);
            let hash = blob_store.put(data.as_bytes()).unwrap();
            hashes.push(hash);
        }

        // Create cache (empty)
        let user = IdentityId::from_bytes([1u8; 32]);
        let cache = Arc::new(RwLock::new(
            LruCache::open(dir.path().join("cache_index.json"), 10_000_000, 0.9, user).unwrap(),
        ));

        // Verify cache is empty
        assert_eq!(cache.read().unwrap().len(), 0);

        // Create caching store with reconciliation
        let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
        let _store =
            CachingContentStore::new(Arc::clone(&blob_store), Arc::clone(&cache), config, user)
                .unwrap();

        // Verify cache now has 5 entries
        assert_eq!(cache.read().unwrap().len(), 5);

        // Verify all orphans are tracked
        let cache_read = cache.read().unwrap();
        for hash in &hashes {
            assert!(
                cache_read.contains(hash),
                "Orphan hash not tracked: {}",
                hash
            );
        }
    }

    #[test]
    fn test_caching_store_delete() {
        let (store, _dir) = create_test_store();

        let data = b"content to delete";
        let owner = IdentityId::from_bytes([2u8; 32]);
        let space = SpaceId::from_bytes([3u8; 32]);

        let hash = store
            .put_with_metadata(data, owner, space, 1234567890)
            .unwrap();

        // Verify exists
        assert!(store.exists(&hash));

        // Delete
        let deleted = store.delete(&hash).unwrap();
        assert!(deleted);

        // Verify gone
        assert!(!store.exists(&hash));
        assert!(!store.cache.read().unwrap().contains(&hash));
    }

    #[test]
    fn test_caching_store_statistics() {
        let (store, _dir) = create_test_store();

        let data = b"stats test content";
        let owner = IdentityId::from_bytes([2u8; 32]);
        let space = SpaceId::from_bytes([3u8; 32]);

        let hash = store
            .put_with_metadata(data, owner, space, 1234567890)
            .unwrap();

        // Access it a few times
        for _ in 0..5 {
            let _ = store.get(&hash);
        }

        let stats = store.statistics().unwrap();
        assert_eq!(stats.total_entries, 1);
        assert_eq!(stats.total_bytes, data.len() as u64);
        assert_eq!(stats.cache_hits, 5);
    }

    #[test]
    fn test_caching_store_persist() {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let user = IdentityId::from_bytes([1u8; 32]);
        let cache_path = dir.path().join("cache_index.json");

        let hash;
        {
            let cache = Arc::new(RwLock::new(
                LruCache::open(&cache_path, 10_000_000, 0.9, user).unwrap(),
            ));
            let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
            let store =
                CachingContentStore::new_without_reconcile(blob_store.clone(), cache, config, user);

            let data = b"persistent content";
            let owner = IdentityId::from_bytes([2u8; 32]);
            let space = SpaceId::from_bytes([3u8; 32]);

            hash = store
                .put_with_metadata(data, owner, space, 1234567890)
                .unwrap();
            store.persist().unwrap();
        }

        // Reopen cache
        let cache = Arc::new(RwLock::new(
            LruCache::open(&cache_path, 10_000_000, 0.9, user).unwrap(),
        ));

        // Verify entry persisted
        assert!(cache.read().unwrap().contains(&hash));
    }
}
