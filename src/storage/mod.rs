//! Storage layer for Swimchain (SPEC_07 - Milestone 1.6)
//!
//! Provides persistent storage for:
//! - Chain data (blocks, headers) using sled embedded database
//! - Content blobs using content-addressed filesystem storage
//! - Content metadata using sled
//! - LRU cache with 5-tier eviction priorities
//!
//! # Directory Structure
//!
//! ```text
//! ~/.swimchain/
//! ├── chain/                    # Sled database for blocks
//! │   ├── root_blocks/          # Root block tree
//! │   ├── space_blocks/         # Space block tree
//! │   ├── content_blocks/       # Content block tree
//! │   └── height_index/         # Height -> hash index
//! └── content/
//!     ├── blobs/
//!     │   └── sha256/
//!     │       ├── ab/           # 2-char prefix directories
//!     │       │   └── <62chars> # Blob files
//!     │       └── ...
//!     ├── manifests/            # Chunk manifests for large files
//!     ├── metadata/             # Sled database for ContentItem
//!     └── cache_index.json      # LRU cache state
//! ```
//!
//! # Storage Profiles
//!
//! Three mobile-optimized profiles are available:
//! - **Budget (1GB)**: For devices with limited storage
//! - **Standard (5GB)**: Default for most devices
//! - **Flagship (10GB)**: For devices with ample storage
//!
//! # Eviction Priority
//!
//! The cache uses a 5-tier eviction system:
//! 1. **Old Unfollowed** - Evict first
//! 2. **Old Followed** - Evict second
//! 3. **Recent Followed** - Protected from eviction
//! 4. **Pinned** - User-protected content
//! 5. **Own Content** - Never automatically evicted
//!
//! # Example
//!
//! ```no_run
//! use swimchain::storage::{StorageManager, StorageConfig, StorageProfile};
//! use swimchain::types::identity::IdentityId;
//!
//! // Open storage with standard profile
//! let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
//! let user = IdentityId::from_bytes([0u8; 32]);
//! let manager = StorageManager::open(config, user).unwrap();
//!
//! // Store a blob
//! let hash = manager.blobs().put(b"hello world").unwrap();
//!
//! // Get metrics
//! let metrics = manager.metrics().unwrap();
//! println!("{}", metrics.summary());
//! ```

pub mod aggregation_cache;
pub mod blob;
pub mod cache;
pub mod caching_store;
pub mod chain;
pub mod config;
pub mod content;
pub mod manager;
pub mod manifest;
pub mod membership;
pub mod metrics;

// Re-export main types
pub use aggregation_cache::{AggregationCache, CacheStats, ContentAggregation, SpaceAggregation};
pub use blob::{BlobStore, ContentBlobHash, CHUNK_SIZE};
pub use cache::{
    CacheEntry, CacheStatistics, EvictionPriority, LruCache, MAX_CACHE_BYTES, MIN_CACHE_BYTES,
    RECENT_THRESHOLD_SECS,
};
pub use caching_store::{CachingContentStore, EvictionCallback};
pub use chain::{BlockHash, ChainStore, SpaceInfo};
pub use config::{MobileConfig, StorageConfig, StorageProfile};
pub use content::{PersistentContentStore, INLINE_THRESHOLD};
pub use manager::StorageManager;
pub use manifest::{ChunkInfo, Manifest};
pub use membership::{
    DMRequestRecord, DMRequestStatus, InviteRecord, InviteStatus, MemberRecord, MemberRole,
    MembershipStats, MembershipStore,
};
pub use metrics::StorageMetrics;

/// sled defaults to a **1 GiB page cache per database**. A node opens ~13 separate sled
/// databases (chain, content, aggregation, membership, peers, DHT, sponsorship, blocklist,
/// spam, engagement, offers, fork, device-constraints), so the defaults can balloon to many
/// GiB under load and OOM a small host — the testnet seed on a 1 GB droplet was OOM-killed at
/// ~1.8 GiB RSS (idle it uses ~19 MiB). Cap each DB's cache so total memory stays bounded.
pub const SLED_CACHE_CAPACITY: u64 = 32 * 1024 * 1024; // 32 MiB per database

/// Open a sled database with a bounded page cache (see [`SLED_CACHE_CAPACITY`]). Use this
/// instead of `sled::open` for any long-lived node database.
pub fn open_db<P: AsRef<std::path::Path>>(path: P) -> Result<sled::Db, sled::Error> {
    sled::Config::new()
        .path(path.as_ref())
        .cache_capacity(SLED_CACHE_CAPACITY)
        .open()
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::blocks::{BranchPath, ContentBlock, RootBlock, SpaceBlock, INITIAL_DIFFICULTY};
    use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};
    use tempfile::tempdir;

    fn create_test_root_block(height: u64, prev_hash: [u8; 32]) -> RootBlock {
        RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: prev_hash,
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

    fn create_test_space_block(space_id: [u8; 32]) -> SpaceBlock {
        SpaceBlock {
            space_id,
            merkle_root: [0u8; 32],
            content_block_hashes: vec![],
            prev_space_hash: None,
            timestamp: 1_000_000,
            total_pow: 0,
            content_block_count: 0,
        }
    }

    fn create_test_content_block(thread_id: [u8; 32]) -> ContentBlock {
        ContentBlock {
            thread_root_id: thread_id,
            space_id: [0u8; 32],
            actions: vec![],
            merkle_root: [0u8; 32],
            prev_content_hash: None,
            timestamp: 1_000_000,
            total_pow: 0,
            branch_path: BranchPath::root(),
            space_metadata: None,
        }
    }

    fn create_test_content(id: [u8; 32], owner: [u8; 32]) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes(owner),
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
    fn test_full_storage_lifecycle() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let user_id = IdentityId::from_bytes([1u8; 32]);

        // Create and populate storage
        let block_hash;
        let blob_hash;
        let content_id;
        {
            let mut manager = StorageManager::open(config.clone(), user_id).unwrap();

            // Store blocks
            for i in 0..10 {
                let block = create_test_root_block(i, [i as u8; 32]);
                let hash = manager.chain().put_root_block(&block).unwrap();
                manager.chain().index_height(i, hash).unwrap();
            }

            for i in 0..5 {
                let block = create_test_space_block([i as u8; 32]);
                manager.chain().put_space_block(&block).unwrap();
            }

            for i in 0..15 {
                let block = create_test_content_block([i as u8; 32]);
                manager.chain().put_content_block(&block).unwrap();
            }

            // Store blobs
            for i in 0..10 {
                let data = format!("blob data {}", i);
                manager.blobs().put(data.as_bytes()).unwrap();
            }

            // Store specific items we'll verify later
            let block = create_test_root_block(100, [100u8; 32]);
            block_hash = manager.chain().put_root_block(&block).unwrap();

            blob_hash = manager.blobs().put(b"persistent blob").unwrap();

            let content = create_test_content([42u8; 32], [1u8; 32]);
            content_id = content.content_id;
            manager.content().put(&content).unwrap();

            // Add cache entries
            let entry = CacheEntry::new(
                blob_hash,
                15,
                IdentityId::from_bytes([1u8; 32]),
                SpaceId::from_bytes([2u8; 32]),
                1_000_000,
            );
            manager.cache_mut().add_entry(entry);

            // Verify metrics before flush
            let metrics = manager.metrics().unwrap();
            assert_eq!(metrics.root_block_count, 11);
            assert_eq!(metrics.space_block_count, 5);
            assert_eq!(metrics.content_block_count, 15);
            assert_eq!(metrics.blob_count, 11);
            assert_eq!(metrics.content_item_count, 1);
            assert_eq!(metrics.cache_entry_count, 1);

            manager.flush().unwrap();
        }

        // Reopen and verify persistence
        let manager = StorageManager::open(config, user_id).unwrap();

        // Verify block
        let block = manager.chain().get_root_block(&block_hash).unwrap();
        assert!(block.is_some());
        assert_eq!(block.unwrap().height, 100);

        // Verify height index
        let latest_height = manager.chain().get_latest_height().unwrap();
        assert_eq!(latest_height, Some(9));

        // Verify blob
        assert!(manager.blobs().exists(&blob_hash));
        let blob = manager.blobs().get(&blob_hash).unwrap();
        assert_eq!(blob, b"persistent blob");

        // Verify content
        let content = manager.content().get(&content_id).unwrap();
        assert!(content.is_some());

        // Verify cache
        assert_eq!(manager.cache().len(), 1);
        assert!(manager.cache().contains(&blob_hash));

        // Verify metrics after reopen
        let metrics = manager.metrics().unwrap();
        assert_eq!(metrics.root_block_count, 11);
        assert_eq!(metrics.blob_count, 11);
        assert!(metrics.total_bytes > 0);
    }

    #[test]
    fn test_storage_profiles() {
        // Budget profile
        let config = StorageConfig::from_profile(StorageProfile::Budget1GB);
        assert_eq!(config.max_cache_bytes, 1_073_741_824);

        // Standard profile
        let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
        assert_eq!(config.max_cache_bytes, 5_368_709_120);

        // Flagship profile
        let config = StorageConfig::from_profile(StorageProfile::Flagship10GB);
        assert_eq!(config.max_cache_bytes, 10_737_418_240);
    }

    #[test]
    fn test_eviction_priorities() {
        let dir = tempdir().unwrap();
        let mut config = StorageConfig::with_base_path(dir.path().to_path_buf());
        config.max_cache_bytes = 10_000; // Small limit
        config.eviction_threshold = 0.5;

        let user_id = IdentityId::from_bytes([1u8; 32]);
        let mut manager = StorageManager::open(config, user_id).unwrap();

        // Add own content (should never be evicted)
        let own_entry = CacheEntry::new(
            ContentBlobHash::from_bytes([1u8; 32]),
            3000,
            IdentityId::from_bytes([1u8; 32]), // Same as current user
            SpaceId::from_bytes([2u8; 32]),
            1_000_000,
        );
        manager.cache_mut().add_entry(own_entry);

        // Add unfollowed content (should be evicted first)
        let unfollowed_entry = CacheEntry::new(
            ContentBlobHash::from_bytes([2u8; 32]),
            3000,
            IdentityId::from_bytes([3u8; 32]),
            SpaceId::from_bytes([4u8; 32]),
            1_000_000,
        );
        manager.cache_mut().add_entry(unfollowed_entry);

        // Try to evict
        let evicted = manager.cache_mut().evict_if_needed(2000).unwrap();

        // Should evict unfollowed, not own content
        assert_eq!(evicted.len(), 1);
        assert_eq!(evicted[0], ContentBlobHash::from_bytes([2u8; 32]));
    }

    #[test]
    fn test_manifest_chunking() {
        // Test large content chunking
        let data: Vec<u8> = (0..3_000_000).map(|i| (i % 256) as u8).collect();

        let (manifest, chunks) = Manifest::from_data_default(&data);

        assert_eq!(manifest.total_size, 3_000_000);
        assert_eq!(manifest.chunk_size, CHUNK_SIZE as u32);
        assert_eq!(chunks.len(), 3); // 3 chunks for 3MB with 1MB chunk size

        manifest.validate().unwrap();

        // Test reassembly
        let chunk_data: Vec<Vec<u8>> = chunks.into_iter().map(|(d, _)| d).collect();
        let reassembled = manifest::reassemble_chunks(&manifest, &chunk_data).unwrap();
        assert_eq!(reassembled, data);
    }

    #[test]
    fn test_content_hash_format() {
        let hash = ContentBlobHash::from_bytes([0xab; 32]);

        let hash_string = hash.to_hash_string();
        assert!(hash_string.starts_with("sha256:"));
        assert_eq!(hash_string.len(), 7 + 64);

        let parsed = ContentBlobHash::from_hash_string(&hash_string).unwrap();
        assert_eq!(parsed, hash);
    }

    #[test]
    fn test_blob_integrity() {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        let data = b"test data for integrity";
        let hash = manager.blobs().put(data).unwrap();

        // Corrupt the file
        let blob_path = manager.blobs().blob_path(&hash);
        std::fs::write(&blob_path, b"corrupted").unwrap();

        // Get should fail integrity check
        let result = manager.blobs().get(&hash);
        assert!(result.is_err());
    }
}
