# Storage Layer Architecture

This document describes the local storage layer for Swimchain, implemented as Milestone 1.6 per SPEC_07.

## Overview

The storage layer provides persistent, content-addressed storage with configurable limits and intelligent cache eviction. It is designed for mobile-first operation with three storage profiles.

## Directory Structure

```
~/.swimchain/                       # Default base path
├── chain/                          # Sled database for blocks
│   ├── root_blocks/                # Root block tree
│   ├── space_blocks/               # Space block tree
│   ├── content_blocks/             # Content block tree
│   └── height_index/               # Height -> hash index
└── content/
    ├── blobs/
    │   └── sha256/
    │       ├── ab/                 # 2-char prefix directories
    │       │   └── <62-char-hash>  # Blob files
    │       └── cd/
    │           └── ...
    ├── manifests/                  # Chunk manifests for large files
    ├── metadata/                   # Sled database for ContentItem
    └── cache_index.json            # LRU cache state
```

## Components

### 1. ChainStore

Stores blockchain data using sled embedded database:
- **Root blocks**: Chain coordination layer (~30s intervals)
- **Space blocks**: Per-space aggregation of content blocks
- **Content blocks**: Thread-level blocks containing actions
- **Height index**: Maps block heights to hashes for fast lookup

```rust
use swimchain::storage::ChainStore;

let store = ChainStore::open("/path/to/chain")?;
let hash = store.put_root_block(&block)?;
let block = store.get_root_block(&hash)?;
```

### 2. BlobStore

Content-addressed blob storage on the filesystem:
- Hash format: `sha256:<64-char-hex>`
- Directory sharding: First byte (2 chars) as prefix
- Atomic writes using temp file + rename
- Integrity verification on read

```rust
use swimchain::storage::BlobStore;

let store = BlobStore::new("/path/to/blobs")?;
let hash = store.put(b"content data")?;  // Returns sha256:abc123...
let data = store.get(&hash)?;            // Verifies integrity
```

### 3. PersistentContentStore

Stores ContentItem metadata with parent-child relationships:
- Content items stored in sled
- Children index for fast traversal
- Tombstone support for deleted content
- Batch insert for efficiency

```rust
use swimchain::storage::PersistentContentStore;

let store = PersistentContentStore::open(db_path, blob_path)?;
store.put(&content_item)?;
let children = store.get_children(&parent_id)?;
```

### 4. LruCache

LRU cache with 5-tier eviction priorities:

| Priority | Type | Eviction Order |
|----------|------|----------------|
| 1 | Old Unfollowed | First to evict |
| 2 | Old Followed | Second |
| 3 | Recent Followed | Protected |
| 4 | Pinned | User-protected |
| 5 | Own Content | Never auto-evict |

```rust
use swimchain::storage::LruCache;

let cache = LruCache::open(path, max_bytes, threshold, user_id)?;
cache.add_entry(entry);
cache.access(&hash);  // Update LRU
let evicted = cache.evict_if_needed(incoming_bytes)?;
```

### 5. StorageManager

Unified interface combining all components:

```rust
use swimchain::storage::{StorageManager, StorageConfig, StorageProfile};

let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
let manager = StorageManager::open(config, user_id)?;

// Access individual stores
manager.chain().put_root_block(&block)?;
manager.blobs().put(data)?;
manager.content().put(&item)?;

// Get aggregated metrics
let metrics = manager.metrics()?;
println!("{}", metrics.summary());
```

## Storage Profiles

Three profiles optimized for different device capabilities:

| Profile | Cache Limit | Use Case |
|---------|-------------|----------|
| Budget (1GB) | 1 GB | Budget phones, aggressive eviction |
| Standard (5GB) | 5 GB | Default for most devices |
| Flagship (10GB) | 10 GB | High-end devices |

```rust
use swimchain::storage::{StorageConfig, StorageProfile};

// Budget profile
let config = StorageConfig::from_profile(StorageProfile::Budget1GB);

// Custom limit
let config = StorageConfig::with_max_bytes(2_147_483_648); // 2GB
```

## Mobile Configuration

Additional mobile-specific settings:

```rust
use swimchain::storage::MobileConfig;

let mobile = MobileConfig::standard();
// cache_limit_gb: 5.0
// seed_on_wifi_only: true
// prefetch_on_wifi: true
// cellular_limit_mb_per_day: 100
// background_seeding: false
```

## Content Chunking

Large content (>1MB) is split into chunks with manifests:

```rust
use swimchain::storage::{Manifest, CHUNK_SIZE};

let (manifest, chunks) = Manifest::from_data(&large_data, CHUNK_SIZE);

// Store chunks
for (chunk_data, chunk_hash) in chunks {
    blob_store.put_with_hash(&chunk_data, &chunk_hash)?;
}

// Reassemble
let data = manifest::reassemble_chunks(&manifest, &chunk_data)?;
```

## Eviction Algorithm

When storage exceeds the eviction threshold (default 90%):

1. Calculate bytes to free
2. Collect entries with evictable priorities (1-4)
3. Sort by priority, then by last access time (LRU)
4. Select entries until enough bytes can be freed
5. Remove from cache and delete from blob store

**Critical behavior**: If cache is 100% full with OwnContent, new content is rejected with `StorageError::StorageFull`.

## Persistence Guarantees

- **Sled**: ACID-compliant embedded database with crash recovery
- **Blobs**: Atomic writes via temp file + rename
- **Cache index**: Atomic writes with .tmp extension

Data persists across:
- Normal restarts
- Graceful shutdowns (`manager.shutdown()`)
- Unexpected crashes (sled recovery)

## Error Handling

```rust
use swimchain::types::error::StorageError;

match manager.blobs().get(&hash) {
    Ok(data) => { /* use data */ },
    Err(StorageError::BlobNotFound { hash }) => { /* handle missing */ },
    Err(StorageError::CorruptedData { expected, actual }) => { /* handle corruption */ },
    Err(StorageError::StorageFull { used_bytes, limit_bytes }) => { /* handle full */ },
    Err(e) => { /* other errors */ },
}
```

## Metrics

```rust
let metrics = manager.metrics()?;

println!("Usage: {:.1}%", metrics.usage_percent());
println!("Blocks: {}", metrics.total_block_count());
println!("Cache hit rate: {:.1}%", metrics.cache_hit_rate * 100.0);

// Detailed breakdown
println!("{}", metrics.detailed_summary());
```

## Thread Safety

- `ChainStore`: Uses sled's internal locking
- `BlobStore`: Uses atomic counters, filesystem atomic operations
- `PersistentContentStore`: Uses sled's internal locking
- `LruCache`: Requires external synchronization (e.g., `Mutex<LruCache>`)

For concurrent access, wrap in `Arc<Mutex<StorageManager>>` or use individual component locks.

## Testing

Run storage tests:

```bash
cargo test storage --lib
cargo test integration_tests --lib
```

## Benchmarks

See `docs/benchmarks/storage.md` for I/O timing benchmarks.

Run benchmarks:

```bash
cargo bench --bench storage_benchmarks
```
