//! LRU cache with 5-tier eviction (SPEC_07 - Milestone 1.6, 3.4)
//!
//! Implements a cache with eviction priorities based on content ownership,
//! following status, and age.
//!
//! # Statistics (Milestone 3.4)
//!
//! The cache tracks comprehensive statistics including:
//! - Cache hits and misses
//! - Eviction counts and bytes evicted
//! - Bytes by priority tier
//!
//! Use [`LruCache::statistics()`] to get a snapshot of all metrics.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::blob::ContentBlobHash;
use crate::types::content::SpaceId;
use crate::types::error::StorageError;
use crate::types::identity::IdentityId;

/// 7 days in seconds (for determining "recent" content)
pub const RECENT_THRESHOLD_SECS: u64 = 604_800;

/// 5-tier eviction priority per SPEC_07
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum EvictionPriority {
    /// Tier 1: Old content from unfollowed spaces (evict first)
    OldUnfollowed = 1,
    /// Tier 2: Old content from followed spaces
    OldFollowed = 2,
    /// Tier 3: Recent content from followed spaces
    RecentFollowed = 3,
    /// Tier 4: Explicitly pinned content
    Pinned = 4,
    /// Tier 5: User's own content (never auto-evict)
    OwnContent = 5,
}

impl EvictionPriority {
    /// Get display name for this priority
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::OldUnfollowed => "Old Unfollowed",
            Self::OldFollowed => "Old Followed",
            Self::RecentFollowed => "Recent Followed",
            Self::Pinned => "Pinned",
            Self::OwnContent => "Own Content",
        }
    }

    /// Check if this priority allows automatic eviction
    #[must_use]
    pub const fn can_evict(&self) -> bool {
        !matches!(self, Self::OwnContent)
    }
}

/// Cache entry metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    /// Content hash (as string for JSON serialization)
    pub content_hash: String,
    /// Size in bytes
    pub size_bytes: u64,
    /// Last access timestamp (Unix seconds)
    pub last_access: u64,
    /// Number of accesses
    pub access_count: u32,
    /// Content owner ID (as hex string for JSON)
    pub owner_id: String,
    /// Whether explicitly pinned
    pub is_pinned: bool,
    /// Space this content belongs to (as hex string for JSON)
    pub space_id: String,
    /// Creation timestamp for age calculation (Unix seconds)
    pub created_at: u64,
}

impl CacheEntry {
    /// Create new cache entry
    #[must_use]
    pub fn new(
        content_hash: ContentBlobHash,
        size_bytes: u64,
        owner_id: IdentityId,
        space_id: SpaceId,
        created_at: u64,
    ) -> Self {
        Self {
            content_hash: content_hash.to_hash_string(),
            size_bytes,
            last_access: current_timestamp(),
            access_count: 1,
            owner_id: hex::encode(owner_id.0),
            is_pinned: false,
            space_id: hex::encode(space_id.0),
            created_at,
        }
    }

    /// Get content hash
    ///
    /// # Errors
    ///
    /// Returns error if hash format is invalid.
    pub fn get_content_hash(&self) -> Result<ContentBlobHash, StorageError> {
        ContentBlobHash::from_hash_string(&self.content_hash)
    }

    /// Calculate eviction priority
    #[must_use]
    pub fn eviction_priority(
        &self,
        current_user: &str,
        followed_spaces: &HashSet<String>,
        now: u64,
        recent_threshold_secs: u64,
    ) -> EvictionPriority {
        // Own content: never evict
        if self.owner_id == current_user {
            return EvictionPriority::OwnContent;
        }

        // Pinned: protected
        if self.is_pinned {
            return EvictionPriority::Pinned;
        }

        let age = now.saturating_sub(self.created_at);
        let is_recent = age < recent_threshold_secs;
        let is_followed = followed_spaces.contains(&self.space_id);

        match (is_recent, is_followed) {
            (true, true) => EvictionPriority::RecentFollowed,
            (false, true) => EvictionPriority::OldFollowed,
            (_, false) => EvictionPriority::OldUnfollowed,
        }
    }
}

// ============================================================================
// Cache Statistics (Milestone 3.4)
// ============================================================================

/// Minimum cache size: 100MB
pub const MIN_CACHE_BYTES: u64 = 100 * 1024 * 1024;

/// Maximum cache size: 100GB
pub const MAX_CACHE_BYTES: u64 = 100 * 1024 * 1024 * 1024;

/// Comprehensive cache statistics (Milestone 3.4)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    /// Number of entries in cache
    pub total_entries: usize,
    /// Total cached bytes
    pub total_bytes: u64,
    /// Maximum allowed bytes
    pub max_bytes: u64,
    /// Usage as percentage (0.0-100.0)
    pub usage_percent: f64,
    /// Total cache hits since last reset
    pub cache_hits: u64,
    /// Total cache misses since last reset
    pub cache_misses: u64,
    /// Hit rate (0.0-1.0)
    pub hit_rate: f64,
    /// Total evictions since last reset
    pub eviction_count: u64,
    /// Total bytes evicted since last reset
    pub bytes_evicted: u64,
    /// Bytes by eviction priority tier
    pub bytes_by_priority: HashMap<EvictionPriority, u64>,
}

impl CacheStatistics {
    /// Get usage as a human-readable string
    #[must_use]
    pub fn summary(&self) -> String {
        format!(
            "Cache: {} entries, {:.2} MB / {:.2} MB ({:.1}%), hit rate: {:.1}%, evicted: {} entries ({:.2} MB)",
            self.total_entries,
            self.total_bytes as f64 / 1_048_576.0,
            self.max_bytes as f64 / 1_048_576.0,
            self.usage_percent,
            self.hit_rate * 100.0,
            self.eviction_count,
            self.bytes_evicted as f64 / 1_048_576.0
        )
    }
}

// ============================================================================
// Cache Index
// ============================================================================

/// Cache index (persisted to cache_index.json)
#[derive(Debug, Serialize, Deserialize)]
pub struct CacheIndex {
    /// Format version
    pub version: u8,
    /// Hash string -> CacheEntry
    pub entries: HashMap<String, CacheEntry>,
    /// Total cached bytes
    pub total_bytes: u64,
    /// Last update timestamp
    pub last_updated: u64,
}

impl Default for CacheIndex {
    fn default() -> Self {
        Self {
            version: 1,
            entries: HashMap::new(),
            total_bytes: 0,
            last_updated: current_timestamp(),
        }
    }
}

// ============================================================================
// LRU Cache Manager
// ============================================================================

/// LRU cache manager
pub struct LruCache {
    index: CacheIndex,
    index_path: PathBuf,
    max_bytes: u64,
    eviction_threshold: f64,
    current_user: String,
    followed_spaces: HashSet<String>,
    /// Track cache hits for metrics
    cache_hits: u64,
    /// Track cache misses for metrics
    cache_misses: u64,
    /// Total evictions since cache opened (Milestone 3.4)
    eviction_count: u64,
    /// Total bytes evicted since cache opened (Milestone 3.4)
    bytes_evicted: u64,
}

impl LruCache {
    /// Load or create cache
    ///
    /// # Errors
    ///
    /// Returns error if cache file exists but cannot be read.
    pub fn open(
        path: impl AsRef<Path>,
        max_bytes: u64,
        eviction_threshold: f64,
        current_user: IdentityId,
    ) -> Result<Self, StorageError> {
        let index_path = path.as_ref().to_path_buf();
        let current_user_hex = hex::encode(current_user.0);

        let index = if index_path.exists() {
            let mut file = fs::File::open(&index_path)?;
            let mut data = Vec::new();
            file.read_to_end(&mut data)?;
            serde_json::from_slice(&data).unwrap_or_default()
        } else {
            CacheIndex::default()
        };

        Ok(Self {
            index,
            index_path,
            max_bytes,
            eviction_threshold,
            current_user: current_user_hex,
            followed_spaces: HashSet::new(),
            cache_hits: 0,
            cache_misses: 0,
            eviction_count: 0,
            bytes_evicted: 0,
        })
    }

    /// Record access to content (updates LRU)
    pub fn access(&mut self, hash: &ContentBlobHash) {
        let key = hash.to_hash_string();
        if let Some(entry) = self.index.entries.get_mut(&key) {
            entry.last_access = current_timestamp();
            entry.access_count = entry.access_count.saturating_add(1);
            self.cache_hits += 1;
        } else {
            self.cache_misses += 1;
        }
    }

    /// Check if cache contains an entry
    #[must_use]
    pub fn contains(&self, hash: &ContentBlobHash) -> bool {
        self.index.entries.contains_key(&hash.to_hash_string())
    }

    /// Get cache entry
    #[must_use]
    pub fn get(&self, hash: &ContentBlobHash) -> Option<&CacheEntry> {
        self.index.entries.get(&hash.to_hash_string())
    }

    /// Check if eviction needed and get candidates
    ///
    /// Returns list of hashes to evict, sorted by priority (lowest first)
    #[must_use]
    pub fn get_eviction_candidates(&self, bytes_to_free: u64) -> Vec<ContentBlobHash> {
        let now = current_timestamp();
        let mut candidates: Vec<_> = self
            .index
            .entries
            .iter()
            .filter_map(|(_, entry)| {
                let priority = entry.eviction_priority(
                    &self.current_user,
                    &self.followed_spaces,
                    now,
                    RECENT_THRESHOLD_SECS,
                );
                if priority.can_evict() {
                    Some((entry.clone(), priority))
                } else {
                    None
                }
            })
            .collect();

        // Sort by priority (lowest first), then by last access (oldest first)
        candidates
            .sort_by(|(a, pa), (b, pb)| pa.cmp(pb).then_with(|| a.last_access.cmp(&b.last_access)));

        // Select candidates until we've freed enough bytes
        let mut freed = 0u64;
        let mut result = Vec::new();

        for (entry, _) in candidates {
            if freed >= bytes_to_free {
                break;
            }
            freed += entry.size_bytes;
            if let Ok(hash) = entry.get_content_hash() {
                result.push(hash);
            }
        }

        result
    }

    /// Evict entries if over threshold
    ///
    /// Returns list of evicted hashes or error if storage is full with OwnContent.
    ///
    /// # Errors
    ///
    /// Returns error if cache is 100% full with OwnContent.
    pub fn evict_if_needed(
        &mut self,
        incoming_bytes: u64,
    ) -> Result<Vec<ContentBlobHash>, StorageError> {
        let threshold_bytes = (self.max_bytes as f64 * self.eviction_threshold) as u64;
        let projected = self.index.total_bytes.saturating_add(incoming_bytes);

        if projected < threshold_bytes {
            return Ok(Vec::new());
        }

        let bytes_to_free = projected.saturating_sub(threshold_bytes);
        let candidates = self.get_eviction_candidates(bytes_to_free);

        // Check if we can free enough space
        let freeable: u64 = candidates
            .iter()
            .filter_map(|h| self.get(h))
            .map(|e| e.size_bytes)
            .sum();

        if freeable < bytes_to_free {
            // Not enough space can be freed - cache is full with protected content
            return Err(StorageError::StorageFull {
                used_bytes: self.index.total_bytes,
                limit_bytes: self.max_bytes,
            });
        }

        // Actually evict
        let mut evicted = Vec::new();
        for hash in candidates {
            if let Some(entry) = self.index.entries.remove(&hash.to_hash_string()) {
                self.index.total_bytes = self.index.total_bytes.saturating_sub(entry.size_bytes);
                // Track eviction statistics (Milestone 3.4)
                self.eviction_count += 1;
                self.bytes_evicted += entry.size_bytes;
                evicted.push(hash);
            }
        }

        self.index.last_updated = current_timestamp();

        Ok(evicted)
    }

    /// Add entry to cache
    pub fn add_entry(&mut self, entry: CacheEntry) {
        let key = entry.content_hash.clone();
        self.index.total_bytes += entry.size_bytes;
        self.index.entries.insert(key, entry);
        self.index.last_updated = current_timestamp();
    }

    /// Remove entry from cache
    pub fn remove_entry(&mut self, hash: &ContentBlobHash) -> Option<CacheEntry> {
        let key = hash.to_hash_string();
        if let Some(entry) = self.index.entries.remove(&key) {
            self.index.total_bytes = self.index.total_bytes.saturating_sub(entry.size_bytes);
            self.index.last_updated = current_timestamp();
            Some(entry)
        } else {
            None
        }
    }

    /// Pin content (prevents eviction)
    pub fn pin(&mut self, hash: &ContentBlobHash) -> bool {
        let key = hash.to_hash_string();
        if let Some(entry) = self.index.entries.get_mut(&key) {
            entry.is_pinned = true;
            true
        } else {
            false
        }
    }

    /// Unpin content
    pub fn unpin(&mut self, hash: &ContentBlobHash) -> bool {
        let key = hash.to_hash_string();
        if let Some(entry) = self.index.entries.get_mut(&key) {
            entry.is_pinned = false;
            true
        } else {
            false
        }
    }

    /// Update followed spaces (affects eviction priority)
    pub fn set_followed_spaces(&mut self, spaces: HashSet<SpaceId>) {
        self.followed_spaces = spaces.into_iter().map(|s| hex::encode(s.0)).collect();
    }

    /// Add a followed space
    pub fn add_followed_space(&mut self, space_id: SpaceId) {
        self.followed_spaces.insert(hex::encode(space_id.0));
    }

    /// Remove a followed space
    pub fn remove_followed_space(&mut self, space_id: &SpaceId) {
        self.followed_spaces.remove(&hex::encode(space_id.0));
    }

    /// Persist cache index to disk (atomic write)
    ///
    /// # Errors
    ///
    /// Returns error if write fails.
    pub fn persist(&self) -> Result<(), StorageError> {
        // Create parent directory if needed
        if let Some(parent) = self.index_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write to temp file first
        let temp_path = self.index_path.with_extension("json.tmp");
        {
            let mut file = fs::File::create(&temp_path)?;
            let data = serde_json::to_vec_pretty(&self.index)?;
            file.write_all(&data)?;
            file.sync_all()?;
        }

        // Atomic rename
        fs::rename(&temp_path, &self.index_path)?;

        Ok(())
    }

    /// Get usage stats
    #[must_use]
    pub fn usage(&self) -> (u64, u64) {
        (self.index.total_bytes, self.max_bytes)
    }

    /// Get usage percentage
    #[must_use]
    pub fn usage_percent(&self) -> f64 {
        if self.max_bytes == 0 {
            0.0
        } else {
            (self.index.total_bytes as f64 / self.max_bytes as f64) * 100.0
        }
    }

    /// Get cache hit rate
    #[must_use]
    pub fn hit_rate(&self) -> f64 {
        let total = self.cache_hits + self.cache_misses;
        if total == 0 {
            0.0
        } else {
            self.cache_hits as f64 / total as f64
        }
    }

    /// Get total cache hits
    #[must_use]
    pub fn cache_hits(&self) -> u64 {
        self.cache_hits
    }

    /// Get total cache misses
    #[must_use]
    pub fn cache_misses(&self) -> u64 {
        self.cache_misses
    }

    /// Get entry count
    #[must_use]
    pub fn len(&self) -> usize {
        self.index.entries.len()
    }

    /// Check if cache is empty
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.index.entries.is_empty()
    }

    /// Get entries by priority tier
    pub fn entries_by_priority(&self) -> HashMap<EvictionPriority, Vec<&CacheEntry>> {
        let now = current_timestamp();
        let mut result: HashMap<EvictionPriority, Vec<&CacheEntry>> = HashMap::new();

        for entry in self.index.entries.values() {
            let priority = entry.eviction_priority(
                &self.current_user,
                &self.followed_spaces,
                now,
                RECENT_THRESHOLD_SECS,
            );
            result.entry(priority).or_default().push(entry);
        }

        result
    }

    /// Get total bytes by priority tier
    pub fn bytes_by_priority(&self) -> HashMap<EvictionPriority, u64> {
        let now = current_timestamp();
        let mut result: HashMap<EvictionPriority, u64> = HashMap::new();

        for entry in self.index.entries.values() {
            let priority = entry.eviction_priority(
                &self.current_user,
                &self.followed_spaces,
                now,
                RECENT_THRESHOLD_SECS,
            );
            *result.entry(priority).or_default() += entry.size_bytes;
        }

        result
    }

    // ========================================================================
    // Statistics and Configuration (Milestone 3.4)
    // ========================================================================

    /// Get comprehensive cache statistics
    #[must_use]
    pub fn statistics(&self) -> CacheStatistics {
        CacheStatistics {
            total_entries: self.len(),
            total_bytes: self.index.total_bytes,
            max_bytes: self.max_bytes,
            usage_percent: self.usage_percent(),
            cache_hits: self.cache_hits,
            cache_misses: self.cache_misses,
            hit_rate: self.hit_rate(),
            eviction_count: self.eviction_count,
            bytes_evicted: self.bytes_evicted,
            bytes_by_priority: self.bytes_by_priority(),
        }
    }

    /// Get eviction count
    #[must_use]
    pub fn eviction_count(&self) -> u64 {
        self.eviction_count
    }

    /// Get bytes evicted
    #[must_use]
    pub fn bytes_evicted(&self) -> u64 {
        self.bytes_evicted
    }

    /// Reset session statistics (hits, misses, eviction counts)
    pub fn reset_statistics(&mut self) {
        self.cache_hits = 0;
        self.cache_misses = 0;
        self.eviction_count = 0;
        self.bytes_evicted = 0;
    }

    /// Set maximum cache size (clamped to MIN_CACHE_BYTES..MAX_CACHE_BYTES)
    pub fn set_max_bytes(&mut self, bytes: u64) {
        self.max_bytes = bytes.clamp(MIN_CACHE_BYTES, MAX_CACHE_BYTES);
    }

    /// Get maximum cache size
    #[must_use]
    pub fn max_bytes(&self) -> u64 {
        self.max_bytes
    }

    /// Set eviction threshold (clamped to 0.5..0.99)
    pub fn set_eviction_threshold(&mut self, threshold: f64) {
        self.eviction_threshold = threshold.clamp(0.5, 0.99);
    }

    /// Get eviction threshold
    #[must_use]
    pub fn eviction_threshold(&self) -> f64 {
        self.eviction_threshold
    }

    // ========================================================================
    // Seeding Support (Milestone 3.5)
    // ========================================================================

    /// Get all seedable entries with metadata
    ///
    /// Returns a list of (hash, space_id, owner_id, created_at) tuples for
    /// all entries in the cache that can be used for seeding decisions.
    #[must_use]
    pub fn get_seedable_entries(&self) -> Vec<(ContentBlobHash, SpaceId, IdentityId, u64)> {
        self.index
            .entries
            .values()
            .filter_map(|entry| {
                let hash = entry.get_content_hash().ok()?;
                let space_bytes: [u8; 32] = hex::decode(&entry.space_id).ok()?.try_into().ok()?;
                let owner_bytes: [u8; 32] = hex::decode(&entry.owner_id).ok()?.try_into().ok()?;
                Some((
                    hash,
                    SpaceId::from_bytes(space_bytes),
                    IdentityId::from_bytes(owner_bytes),
                    entry.created_at,
                ))
            })
            .collect()
    }

    /// Iterate entries filtered by space
    ///
    /// Returns entries that belong to the specified space.
    pub fn iter_by_space(&self, space_id: &SpaceId) -> impl Iterator<Item = &CacheEntry> {
        let space_hex = hex::encode(space_id.0);
        self.index
            .entries
            .values()
            .filter(move |e| e.space_id == space_hex)
    }

    /// Get hashes for all entries in a space
    #[must_use]
    pub fn get_hashes_by_space(&self, space_id: &SpaceId) -> Vec<ContentBlobHash> {
        self.iter_by_space(space_id)
            .filter_map(|e| e.get_content_hash().ok())
            .collect()
    }

    /// Get total size of content in a specific space
    #[must_use]
    pub fn bytes_in_space(&self, space_id: &SpaceId) -> u64 {
        self.iter_by_space(space_id).map(|e| e.size_bytes).sum()
    }

    /// Get count of entries in a specific space
    #[must_use]
    pub fn count_in_space(&self, space_id: &SpaceId) -> usize {
        self.iter_by_space(space_id).count()
    }
}

/// Get current Unix timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn make_entry(hash: [u8; 32], size: u64, owner: [u8; 32], space: [u8; 32]) -> CacheEntry {
        CacheEntry::new(
            ContentBlobHash::from_bytes(hash),
            size,
            IdentityId::from_bytes(owner),
            SpaceId::from_bytes(space),
            current_timestamp(),
        )
    }

    #[test]
    fn test_cache_open_empty() {
        let dir = tempdir().unwrap();
        let cache = LruCache::open(
            dir.path().join("cache_index.json"),
            1_073_741_824,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        assert!(cache.is_empty());
        assert_eq!(cache.usage(), (0, 1_073_741_824));
    }

    #[test]
    fn test_cache_add_entry() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            1_073_741_824,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        let entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        cache.add_entry(entry);

        assert_eq!(cache.len(), 1);
        assert_eq!(cache.usage().0, 1000);
    }

    #[test]
    fn test_cache_access() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            1_073_741_824,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        cache.add_entry(entry);

        cache.access(&hash);
        cache.access(&hash);

        let entry = cache.get(&hash).unwrap();
        assert_eq!(entry.access_count, 3); // 1 initial + 2 accesses

        assert_eq!(cache.cache_hits(), 2);
        assert_eq!(cache.cache_misses(), 0);
    }

    #[test]
    fn test_eviction_priority_own_content() {
        let owner = [1u8; 32];
        let entry = make_entry([1u8; 32], 1000, owner, [3u8; 32]);

        let priority = entry.eviction_priority(
            &hex::encode(owner),
            &HashSet::new(),
            current_timestamp(),
            RECENT_THRESHOLD_SECS,
        );

        assert_eq!(priority, EvictionPriority::OwnContent);
        assert!(!priority.can_evict());
    }

    #[test]
    fn test_eviction_priority_pinned() {
        let mut entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        entry.is_pinned = true;

        let priority = entry.eviction_priority(
            &hex::encode([1u8; 32]),
            &HashSet::new(),
            current_timestamp(),
            RECENT_THRESHOLD_SECS,
        );

        assert_eq!(priority, EvictionPriority::Pinned);
        // Pinned content can be evicted, just with lower priority than unpinned
        assert!(priority.can_evict());
    }

    #[test]
    fn test_eviction_priority_followed() {
        let space = [3u8; 32];
        let entry = make_entry([1u8; 32], 1000, [2u8; 32], space);

        let mut followed = HashSet::new();
        followed.insert(hex::encode(space));

        let priority = entry.eviction_priority(
            &hex::encode([1u8; 32]),
            &followed,
            current_timestamp(),
            RECENT_THRESHOLD_SECS,
        );

        assert_eq!(priority, EvictionPriority::RecentFollowed);
    }

    #[test]
    fn test_eviction_priority_old() {
        let space = [3u8; 32];
        let mut entry = make_entry([1u8; 32], 1000, [2u8; 32], space);
        // Make content old
        entry.created_at = current_timestamp().saturating_sub(RECENT_THRESHOLD_SECS + 1);

        let mut followed = HashSet::new();
        followed.insert(hex::encode(space));

        let priority = entry.eviction_priority(
            &hex::encode([1u8; 32]),
            &followed,
            current_timestamp(),
            RECENT_THRESHOLD_SECS,
        );

        assert_eq!(priority, EvictionPriority::OldFollowed);
    }

    #[test]
    fn test_eviction_candidates() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            10000,
            0.5,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        // Add entries with different priorities
        // OwnContent - never evict
        let own = make_entry([1u8; 32], 1000, [1u8; 32], [3u8; 32]);
        cache.add_entry(own);

        // OldUnfollowed - evict first
        let mut old = make_entry([2u8; 32], 1000, [2u8; 32], [4u8; 32]);
        old.created_at = current_timestamp().saturating_sub(RECENT_THRESHOLD_SECS + 1);
        cache.add_entry(old);

        // Get eviction candidates
        let candidates = cache.get_eviction_candidates(500);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0], ContentBlobHash::from_bytes([2u8; 32]));
    }

    #[test]
    fn test_evict_if_needed() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            3000, // 3KB max
            0.5,  // 50% threshold = 1.5KB
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        // Add 2KB of evictable content
        let e1 = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        let e2 = make_entry([2u8; 32], 1000, [2u8; 32], [3u8; 32]);
        cache.add_entry(e1);
        cache.add_entry(e2);

        // Try to add 1KB more (would exceed threshold)
        let evicted = cache.evict_if_needed(1000).unwrap();

        // Should evict something
        assert!(!evicted.is_empty());
    }

    #[test]
    fn test_storage_full_own_content() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            2000, // 2KB max
            0.5,  // 50% threshold
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        // Fill with own content
        let own = make_entry([1u8; 32], 2000, [1u8; 32], [3u8; 32]);
        cache.add_entry(own);

        // Try to add more
        let result = cache.evict_if_needed(1000);
        assert!(matches!(result, Err(StorageError::StorageFull { .. })));
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cache_index.json");

        {
            let mut cache =
                LruCache::open(&path, 1_073_741_824, 0.9, IdentityId::from_bytes([1u8; 32]))
                    .unwrap();

            let entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
            cache.add_entry(entry);
            cache.persist().unwrap();
        }

        // Reopen
        let cache =
            LruCache::open(&path, 1_073_741_824, 0.9, IdentityId::from_bytes([1u8; 32])).unwrap();

        assert_eq!(cache.len(), 1);
        assert_eq!(cache.usage().0, 1000);
    }

    #[test]
    fn test_pin_unpin() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            1_073_741_824,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        cache.add_entry(entry);

        assert!(cache.pin(&hash));
        assert!(cache.get(&hash).unwrap().is_pinned);

        assert!(cache.unpin(&hash));
        assert!(!cache.get(&hash).unwrap().is_pinned);
    }

    #[test]
    fn test_followed_spaces() {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache_index.json"),
            1_073_741_824,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        let space = SpaceId::from_bytes([3u8; 32]);
        cache.add_followed_space(space);

        // Add content from followed space
        let entry = make_entry([1u8; 32], 1000, [2u8; 32], [3u8; 32]);
        cache.add_entry(entry);

        let by_priority = cache.bytes_by_priority();
        assert!(by_priority.contains_key(&EvictionPriority::RecentFollowed));
    }
}
