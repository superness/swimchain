# Cache Management (Milestone 3.4)

Swimchain implements a 5-tier LRU cache for content blobs with intelligent eviction based on content ownership and relationship.

## Architecture Overview

```
┌──────────────────────────────────────────┐
│         CachingContentStore              │
│  (Wraps BlobStore + LruCache)            │
├──────────────────────────────────────────┤
│ put_with_metadata() → evict + store      │
│ get() → access + retrieve                │
│ apply_profile() → resize + evict         │
└──────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│    BlobStore    │  │    LruCache     │
│  (Filesystem)   │  │  (Index JSON)   │
└─────────────────┘  └─────────────────┘
```

## Eviction Priority (5-Tier)

| Priority | Tier Name       | Eviction Behavior                          |
|----------|-----------------|-------------------------------------------|
| 1        | OldUnfollowed   | Evict first - old content from unfollowed spaces |
| 2        | OldFollowed     | Evict second - old content from followed spaces |
| 3        | RecentFollowed  | Evict third - recent content from followed spaces |
| 4        | Pinned          | Evict fourth - explicitly pinned content (protected but evictable) |
| 5        | OwnContent      | **Never evict** - user's own content |

> **Note:** "Old" is defined as >7 days since content creation (604,800 seconds).

## Mobile Storage Profiles

| Profile       | Cache Size | Eviction Threshold | Use Case                    |
|---------------|------------|--------------------|-----------------------------|
| Budget1GB     | 1 GB       | 85%                | Entry-level phones, tight storage |
| Standard5GB   | 5 GB       | 90%                | Mid-range phones (default)  |
| Flagship10GB  | 10 GB      | 92%                | High-end phones, tablets    |

### Threshold Rationale

- **Budget (85%)**: Aggressive eviction to stay within tight limits, frequent smaller evictions
- **Standard (90%)**: Balanced approach, evicts when cache is reasonably full
- **Flagship (92%)**: More relaxed, larger cache can handle more content before evicting

## Key Components

### CachingContentStore

Primary interface for cached content operations:

```rust
use swimchain::storage::{BlobStore, CachingContentStore, LruCache, StorageConfig, StorageProfile};
use swimchain::types::identity::IdentityId;
use swimchain::types::content::SpaceId;
use std::sync::{Arc, RwLock};

// Create components
let blob_store = Arc::new(BlobStore::new("/path/to/blobs")?);
let cache = Arc::new(RwLock::new(
    LruCache::open("/path/to/cache.json", 5_368_709_120, 0.90, user)?
));
let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
let store = CachingContentStore::new(blob_store, cache, config, current_user)?;

// Store content with metadata (handles eviction)
let hash = store.put_with_metadata(
    data,
    owner_id,
    space_id,
    created_at,
)?;

// Retrieve content (records access for LRU)
let data = store.get(&hash)?;

// Change storage profile at runtime
store.apply_profile(StorageProfile::Budget1GB)?;

// Get comprehensive statistics
let stats = store.statistics().unwrap();
println!("{}", stats.summary());
```

### CacheStatistics

Comprehensive metrics for monitoring cache health:

```rust
pub struct CacheStatistics {
    pub total_entries: usize,      // Number of entries in cache
    pub total_bytes: u64,          // Total cached bytes
    pub max_bytes: u64,            // Maximum allowed bytes
    pub usage_percent: f64,        // Usage as percentage (0.0-100.0)
    pub cache_hits: u64,           // Total cache hits since reset
    pub cache_misses: u64,         // Total cache misses since reset
    pub hit_rate: f64,             // Hit rate (0.0-1.0)
    pub eviction_count: u64,       // Total evictions since reset
    pub bytes_evicted: u64,        // Total bytes evicted since reset
    pub bytes_by_priority: HashMap<EvictionPriority, u64>,
}
```

### ContentRetrievalManager Integration

P2P content retrieval with cache integration:

```rust
use swimchain::content::retrieval::{ContentRetrievalManager, ContentMetadata};

// Create metadata from chain record
let metadata = ContentMetadata::new(owner_id, space_id, created_at);

// Store fetched content with proper cache tracking
manager.on_data_with_cache(&hash, &data, &metadata, &caching_store)?;
```

## Configuration

### Using Storage Profiles

```rust
use swimchain::storage::{StorageConfig, StorageProfile};

// Create config from profile
let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
assert_eq!(config.max_cache_bytes, 5_368_709_120);
assert_eq!(config.eviction_threshold, 0.90);
```

### Custom Configuration

```rust
let config = StorageConfig {
    max_cache_bytes: 2 * 1024 * 1024 * 1024, // 2GB
    eviction_threshold: 0.88,
    ..StorageConfig::default()
};
```

### Runtime Configuration Changes

```rust
// Update cache limits at runtime
let mut cache = cache.write().unwrap();

// Clamped to MIN_CACHE_BYTES (100MB) .. MAX_CACHE_BYTES (100GB)
cache.set_max_bytes(3 * 1024 * 1024 * 1024); // 3GB

// Clamped to 0.5 .. 0.99
cache.set_eviction_threshold(0.85);

// Reset statistics (useful for session tracking)
cache.reset_statistics();
```

## Orphan Blob Reconciliation

When `CachingContentStore` is created with `new()`, it automatically reconciles blobs that exist in `BlobStore` but are not tracked in `LruCache`:

1. Scans all blob hashes in the filesystem
2. For each hash not in the cache index, creates a conservative entry:
   - Owner: current user (prevents accidental eviction)
   - Space: zero (unknown)
   - Created: 0 (old timestamp for low priority if owner doesn't match)
3. Persists the updated cache index

Use `new_without_reconcile()` for testing or when blobs are known to be tracked.

## Tuning Guidelines

1. **Aggressive eviction (threshold 0.80-0.85)**: Use for constrained devices
2. **Standard eviction (threshold 0.90)**: Default, balanced approach
3. **Relaxed eviction (threshold 0.92-0.95)**: High-storage devices

Lower thresholds mean more frequent, smaller evictions. Higher thresholds mean less frequent, larger evictions.

## Size Limits

Cache size is clamped to reasonable bounds:

- **Minimum**: 100 MB (`MIN_CACHE_BYTES`)
- **Maximum**: 100 GB (`MAX_CACHE_BYTES`)

Eviction threshold is clamped to:

- **Minimum**: 0.5 (50%)
- **Maximum**: 0.99 (99%)

## Performance Characteristics

- **Put operation**: O(n) worst case for eviction candidate selection
- **Get operation**: O(1) for cache access recording
- **Statistics collection**: O(n) for bytes_by_priority calculation
- **Eviction**: Sorted by priority then by last access time

## Related Documentation

- [specs/SPEC_07_CONTENT_DISTRIBUTION.md](../specs/SPEC_07_CONTENT_DISTRIBUTION.md) - Content distribution specification
- [docs/storage-layer.md](storage-layer.md) - Storage architecture overview
- [docs/content-retrieval.md](content-retrieval.md) - P2P content retrieval protocol
- [docs/benchmarks/cache.md](benchmarks/cache.md) - Performance benchmarks
