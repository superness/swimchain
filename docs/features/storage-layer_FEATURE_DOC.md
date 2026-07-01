# Storage Layer - Feature Documentation

> **Owner Area**: `src/storage/`
> **Specification**: SPEC_07 - Milestones 1.6, 1.7, 3.4, 3.5
> **Status**: Complete

## Overview

The Storage Layer is the persistence backbone of Swimchain, providing durable storage for blockchain data, content, and metadata. It implements a tiered storage architecture designed for mobile-first operation while supporting desktop nodes with larger storage capacities:

- **Sled embedded database** for structured chain data and metadata (crash-safe, ACID)
- **Content-addressed blob storage** with SHA-256 hashing and 2-char prefix sharding
- **LRU cache** with 5-tier eviction priorities protecting user content
- **Mobile-optimized storage profiles** for resource-constrained devices

The architecture enables efficient reads, crash-safe writes, and intelligent eviction policies that protect user-created and pinned content while staying within device storage limits.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         StorageManager              │
                    │  (Unified coordinator for all       │
                    │   storage components)               │
                    └─────────────────┬───────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐          ┌───────────────────┐          ┌─────────────────┐
│  ChainStore   │          │ CachingContentStore│          │ MembershipStore │
│ (Blocks/Index)│          │ (Content + Cache)  │          │(Private Spaces) │
└───────┬───────┘          └─────────┬─────────┘          └─────────────────┘
        │                            │
        ▼                            ▼
┌───────────────┐          ┌─────────────────────────────────────┐
│ Sled Database │          │        ┌───────────┐                │
│ (15 Trees)    │          │        │ LruCache  │◄──JSON Index   │
└───────────────┘          │        └─────┬─────┘                │
                           │              │                       │
                           │              ▼                       │
                           │        ┌───────────┐                │
                           │        │ BlobStore │◄──SHA-256 Blobs│
                           │        └───────────┘                │
                           └─────────────────────────────────────┘
        ┌───────────────┐
        │AggregationCache│◄── Pre-computed statistics
        └───────────────┘
```

### Directory Structure

```
~/.swimchain/
├── chain/                         # Sled database (ChainStore)
│   ├── root_blocks/               # RootBlock tree
│   ├── space_blocks/              # SpaceBlock tree
│   ├── content_blocks/            # ContentBlock tree
│   ├── height_index/              # Height → BlockHash (canonical chain)
│   ├── best_tip/                  # Current chain tip
│   ├── space_content_index/       # Space+timestamp → content lookup
│   ├── content_metadata_index/    # ContentHash → Metadata
│   ├── posts_by_space_index/      # Posts by space (excludes replies)
│   ├── replies_by_parent_index/   # Replies by parent content
│   ├── author_content_index/      # Feed-style author lookup
│   ├── branch_metadata/           # Branch management (Milestone 1.7)
│   ├── thread_branch_index/       # Thread → branch path
│   ├── space_branch_state/        # Per-space branch state
│   ├── thread_size/               # Thread reply counts
│   ├── branch_thread_index/       # Branch → thread mapping
│   ├── space_registry/            # On-chain space data
│   └── finalized_actions/         # Duplicate action prevention
└── content/
    ├── blobs/
    │   └── sha256/
    │       ├── ab/                # 2-char prefix directories (256 buckets)
    │       │   └── <62-hex-chars> # Blob files (remaining hash)
    │       └── ...
    ├── metadata/                  # Sled DB for ContentItem
    ├── manifests/                 # Chunk manifests (large files)
    └── cache_index.json           # LRU cache state (persisted)
```

---

## Data Structures

### ChainStore

Primary storage for blockchain data with 15 sled trees for different query patterns.

| Field | Type | Description |
|-------|------|-------------|
| db | Db | Sled database handle |
| root_blocks | sled::Tree | Root block storage (key: hash) |
| space_blocks | sled::Tree | Space block storage (key: hash) |
| content_blocks | sled::Tree | Content block storage (key: hash) |
| height_index | sled::Tree | Canonical chain index (key: u64 BE height) |
| best_tip | sled::Tree | Current chain tip tracking |
| space_content_index | sled::Tree | space_id(16) ‖ timestamp(8 BE) → content_hash |
| content_metadata_index | sled::Tree | Content hash → ContentIndexEntry |
| posts_by_space_index | sled::Tree | Posts only (excludes replies) |
| replies_by_parent_index | sled::Tree | parent_hash ‖ timestamp → reply_hash |
| author_content_index | sled::Tree | author_pk(32) ‖ timestamp(8 BE) → content_hash |
| branch_metadata | sled::Tree | Branch management data |
| thread_branch_index | sled::Tree | Thread → branch path mapping |
| space_branch_state | sled::Tree | Per-space branch state |
| thread_size | sled::Tree | Thread reply counts |
| branch_thread_index | sled::Tree | Branch → thread mapping |
| space_registry | sled::Tree | Space metadata |
| finalized_actions | sled::Tree | action_hash → block_height |
| total_bytes | AtomicU64 | Total storage used |

### ContentIndexEntry

Compact metadata stored in `content_metadata_index` for fast lookups.

| Field | Type | Description |
|-------|------|-------------|
| author | [u8; 32] | Author's public key |
| parent_hash | [u8; 32] | Parent content hash (zeroed if top-level) |
| content_type | u8 | 0=Post, 1=Reply, 2=Engage |
| timestamp | u64 | Creation timestamp (UNIX seconds) |
| space_id | [u8; 16] | Space identifier |

### SpaceInfo

On-chain space registration data.

| Field | Type | Description |
|-------|------|-------------|
| space_id | [u8; 16] | Unique space identifier |
| name | String | Space name (max 64 bytes) |
| description | Option<String> | Optional description (max 256 bytes) |
| creator | [u8; 32] | Creator's public key |
| created_at | u64 | Creation timestamp |
| pow_work | u64 | PoW work committed |
| is_private | bool | Encrypted space flag |
| encrypted_name | Option<Vec<u8>> | AES-256-GCM encrypted name (private spaces) |
| creator_encrypted_key | Option<Vec<u8>> | X25519 box for key recovery |
| key_version | u32 | Key rotation version |

### BlobStore

Content-addressed filesystem storage for raw content blobs.

| Field | Type | Description |
|-------|------|-------------|
| base_path | PathBuf | Root directory for blobs |
| total_bytes | AtomicU64 | Total blob storage used |

### ContentBlobHash

SHA-256 content hash with string representation.

| Field | Type | Description |
|-------|------|-------------|
| 0 | [u8; 32] | SHA-256 hash bytes |

**String Format**: `sha256:<64-hex-chars>` (e.g., `sha256:ab1234...`)

### PersistentContentStore

Unified content storage combining metadata and blobs.

| Field | Type | Description |
|-------|------|-------------|
| db | Db | Sled database handle |
| content_tree | sled::Tree | ContentId → ContentItem |
| tombstone_tree | sled::Tree | Deleted content markers |
| children_tree | sled::Tree | Parent → children index |
| reactions_tree | sled::Tree | Reaction storage |
| reaction_counts_tree | sled::Tree | Aggregated reaction counts |
| blob_store | BlobStore | Blob storage reference |
| total_bytes | AtomicU64 | Total storage used |

**Inline Threshold**: Content ≤1KB is stored inline; >1KB goes to blob store.

### LruCache

LRU cache with 5-tier priority-based eviction.

| Field | Type | Description |
|-------|------|-------------|
| index | CacheIndex | In-memory index (HashMap) |
| index_path | PathBuf | Path to cache_index.json |
| max_bytes | u64 | Maximum cache size |
| eviction_threshold | f64 | Eviction trigger (0.85-0.92) |
| current_user | String | Current user's public key (hex) |
| followed_spaces | HashSet<String> | Followed space IDs |
| cache_hits | u64 | Hit counter |
| cache_misses | u64 | Miss counter |
| eviction_count | u64 | Eviction counter (Milestone 3.4) |
| bytes_evicted | u64 | Total bytes evicted (Milestone 3.4) |

### CacheEntry

Individual cache entry with eviction metadata.

| Field | Type | Description |
|-------|------|-------------|
| content_hash | String | "sha256:<hex>" hash |
| size_bytes | u64 | Content size |
| last_access | u64 | Last access timestamp (UNIX seconds) |
| access_count | u32 | Access frequency |
| owner_id | String | Content owner (hex) |
| is_pinned | bool | User protection flag |
| space_id | String | Space ID (hex) |
| created_at | u64 | Creation timestamp (for age calculation) |

### EvictionPriority

5-tier eviction priority system. **Note**: Values are 1-5, not 0-4.

| Variant | Value | Description |
|---------|-------|-------------|
| OldUnfollowed | 1 | Evicted first - old content in unfollowed spaces |
| OldFollowed | 2 | Old content in followed spaces |
| RecentFollowed | 3 | Recent (<7 days) content in followed spaces |
| Pinned | 4 | User-protected content |
| OwnContent | 5 | User's own content - **never** auto-evicted |

### StorageProfile

Mobile-optimized storage configurations.

| Variant | Description |
|---------|-------------|
| Budget1GB | 1GB cache, 85% threshold (aggressive eviction) |
| Standard5GB | 5GB cache, 90% threshold (default) |
| Flagship10GB | 10GB cache, 92% threshold (relaxed) |
| Custom | User-defined limits |

**Note**: MASTER_FEATURES.md references a "Desktop 50GB" profile, but this is not implemented. Use `Custom` with appropriate limits for desktop nodes.

### StorageConfig

Storage configuration parameters.

| Field | Type | Description |
|-------|------|-------------|
| base_path | PathBuf | Root storage directory (~/.swimchain) |
| max_cache_bytes | u64 | Maximum cache size |
| eviction_threshold | f64 | Eviction trigger (0.85-0.92) |
| profile | StorageProfile | Selected profile |
| flush_interval_secs | u64 | Background flush interval |

### MobileConfig

Mobile-specific storage and network configuration.

| Field | Type | Description |
|-------|------|-------------|
| cache_limit_gb | f64 | Cache size limit in GB |
| serve_on_wifi_only | bool | Only serve content on WiFi |
| cellular_limit_mb_per_day | u32 | Daily cellular data limit |
| background_serving | bool | Serve content in background |

### Manifest

Chunk manifest for large files (>1MB).

| Field | Type | Description |
|-------|------|-------------|
| version | u8 | Manifest format version (currently 1) |
| total_size | u64 | Original file size |
| chunk_size | u32 | Chunk size (1MB = 1,048,576) |
| chunks | Vec<ChunkInfo> | Chunk metadata |

### ChunkInfo

Individual chunk metadata.

| Field | Type | Description |
|-------|------|-------------|
| index | u32 | Chunk sequence number (0-based) |
| hash | String | "sha256:<hex>" chunk hash |
| size | u32 | Chunk size in bytes |

### AggregationCache

Pre-computed statistics for fast queries.

| Field | Type | Description |
|-------|------|-------------|
| content_tree | sled::Tree | ContentId → ContentAggregation |
| space_tree | sled::Tree | SpaceId → SpaceAggregation |
| meta_tree | sled::Tree | Cache metadata (version, rebuild time) |

### ContentAggregation

Per-content statistics.

| Field | Type | Description |
|-------|------|-------------|
| reply_count | u64 | Number of replies |
| engagement_score | u64 | Reactions + replies + preservations |
| last_activity | u64 | Most recent activity timestamp |
| thread_depth | u32 | Nesting depth (0 = top-level) |

### SpaceAggregation

Per-space statistics.

| Field | Type | Description |
|-------|------|-------------|
| post_count | u64 | Top-level posts only |
| total_reply_count | u64 | All replies in space |
| total_content_count | u64 | All content items |
| last_activity | u64 | Most recent activity timestamp |

### MembershipStore

Private space membership and invite management.

| Field | Type | Description |
|-------|------|-------------|
| members | sled::Tree | space_id(16) ‖ member_pk(32) → MemberRecord |
| user_spaces | sled::Tree | member_pk(32) ‖ space_id(16) → () (reverse index) |
| pending_invites | sled::Tree | invite_hash(32) → InviteRecord |
| invites_by_user | sled::Tree | invitee_pk(32) ‖ invite_hash(32) → () |
| dm_requests | sled::Tree | requester ‖ recipient → DMRequestRecord |
| dm_requests_by_recipient | sled::Tree | Reverse index for DMs |

### MemberRecord

Space membership data.

| Field | Type | Description |
|-------|------|-------------|
| member_pk | [u8; 32] | Member's public key |
| role | MemberRole | Admin/Moderator/Member |
| joined_at | u64 | Join timestamp |
| invited_by | [u8; 32] | Inviter's public key |
| encrypted_space_key | Vec<u8> | X25519-encrypted space key |
| key_version | u32 | Key rotation version |

### MemberRole

| Variant | Value | Description |
|---------|-------|-------------|
| Admin | 0 | Full control (create, invite, kick) |
| Moderator | 1 | Can kick and invite |
| Member | 2 | Can post and leave |

### InviteStatus

| Variant | Value | Description |
|---------|-------|-------------|
| Pending | 0 | Awaiting response |
| Accepted | 1 | Invite accepted |
| Declined | 2 | Invite declined |
| Revoked | 3 | Invite revoked by sender |
| Expired | 4 | Invite expired |

### DMRequestStatus

| Variant | Value | Description |
|---------|-------|-------------|
| Pending | 0 | Awaiting response |
| Accepted | 1 | DM accepted |
| Declined | 2 | DM declined |

### CacheStatistics

Comprehensive cache metrics (Milestone 3.4).

| Field | Type | Description |
|-------|------|-------------|
| total_entries | usize | Number of cached items |
| total_bytes | u64 | Total bytes cached |
| max_bytes | u64 | Cache limit |
| usage_percent | f64 | Current utilization |
| cache_hits | u64 | Cache hit count |
| cache_misses | u64 | Cache miss count |
| hit_rate | f64 | Hit/(hit+miss) ratio |
| eviction_count | u64 | Total evictions |
| bytes_evicted | u64 | Total bytes evicted |
| bytes_by_priority | HashMap<EvictionPriority, u64> | Bytes per priority tier |

### StorageMetrics

Aggregated storage metrics for monitoring.

| Field | Type | Description |
|-------|------|-------------|
| total_bytes | u64 | Total storage used |
| chain_bytes | u64 | Chain data size |
| blob_bytes | u64 | Blob storage size |
| metadata_bytes | u64 | Metadata size |
| cache_index_bytes | u64 | Cache index size |
| max_bytes | u64 | Storage limit |
| root_block_count | u64 | Number of root blocks |
| space_block_count | u64 | Number of space blocks |
| content_block_count | u64 | Number of content blocks |
| blob_count | u64 | Number of blobs |
| content_item_count | u64 | Number of content items |
| tombstone_count | u64 | Number of tombstones |
| cache_entry_count | u64 | Number of cache entries |
| cache_hit_rate | f64 | Cache hit rate |
| cache_hits | u64 | Total cache hits |
| cache_misses | u64 | Total cache misses |

### StorageError

Error types for storage operations.

| Variant | Description |
|---------|-------------|
| IoError(String) | Filesystem I/O error |
| DatabaseError(String) | Sled database error |
| SerializationError(String) | Bincode/JSON serialization error |
| BlobNotFound { hash } | Missing blob |
| CorruptedData { expected, actual } | Hash verification failed |
| InvalidHashFormat(String) | Bad hash string format |
| DataTooLarge { size, max } | Exceeds size limit |
| StorageFull { used_bytes, limit_bytes } | Storage exhausted |
| BlockNotFound { hash } | Missing block |
| ManifestNotFound { hash } | Missing manifest |
| InvalidPath(String) | Invalid path |

---

## Core APIs

### StorageManager

#### open()
**Signature**: `fn open(config: StorageConfig, current_user: IdentityId) -> Result<Self, StorageError>`

**Purpose**: Open all storage components with the given configuration.

**Parameters**:
- `config`: Storage configuration
- `current_user`: Current user's identity ID

**Returns**: Initialized StorageManager or error

#### chain() / blobs() / content() / cache()
**Signature**: `fn chain(&self) -> &ChainStore` (and similar for others)

**Purpose**: Access individual storage components.

**Returns**: Reference to the requested component

#### metrics()
**Signature**: `fn metrics(&self) -> Result<StorageMetrics, StorageError>`

**Purpose**: Get unified metrics across all components.

**Returns**: Combined metrics struct

#### enforce_limits()
**Signature**: `fn enforce_limits(&mut self) -> Result<(), StorageError>`

**Purpose**: Trigger eviction if storage exceeds limits.

#### flush()
**Signature**: `fn flush(&self) -> Result<(), StorageError>`

**Purpose**: Flush all pending writes to disk.

#### shutdown()
**Signature**: `fn shutdown(self) -> Result<(), StorageError>`

**Purpose**: Graceful shutdown with final flush.

**Example**:
```rust
let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
let manager = StorageManager::open(config, current_user)?;

// Access components
let chain = manager.chain();
let blobs = manager.blobs();

// Get metrics
let metrics = manager.metrics()?;
println!("Cache hit rate: {:.2}%", metrics.cache_hit_rate * 100.0);

// Graceful shutdown
manager.shutdown()?;
```

### ChainStore

#### put_root_block() / get_root_block()
**Signature**: `fn put_root_block(&self, block: &RootBlock) -> Result<BlockHash, StorageError>`

**Purpose**: Store or retrieve root blocks.

#### index_height()
**Signature**: `fn index_height(&self, height: u64, hash: BlockHash) -> Result<(), StorageError>`

**Purpose**: Index a block at a specific height in the canonical chain.

#### get_root_hash_at_height()
**Signature**: `fn get_root_hash_at_height(&self, height: u64) -> Result<Option<BlockHash>, StorageError>`

**Purpose**: Get the canonical block hash at a height.

#### get_latest_height()
**Signature**: `fn get_latest_height(&self) -> Result<Option<u64>, StorageError>`

**Purpose**: Get the current chain tip height.

#### generate_locator()
**Signature**: `fn generate_locator(&self) -> Result<Vec<BlockHash>, StorageError>`

**Purpose**: Generate a Bitcoin-style block locator for sync. Uses exponential backoff: heights tip, tip-1, tip-2, tip-4, tip-8, etc.

**Returns**: Vector of block hashes from tip to genesis

#### find_locator_match()
**Signature**: `fn find_locator_match(&self, locator: &[[u8; 32]]) -> Result<Option<u64>, StorageError>`

**Purpose**: Find the highest common block with a peer's locator.

**Parameters**:
- `locator`: Peer's block locator

**Returns**: Height of common ancestor, if any

#### get_blocks_from_height()
**Signature**: `fn get_blocks_from_height(&self, start: u64, max: u16) -> Result<Vec<RootBlock>, StorageError>`

**Purpose**: Get canonical chain blocks starting from a height.

#### validate_chain()
**Signature**: `fn validate_chain(&self) -> Result<ChainValidationResult, StorageError>`

**Purpose**: Validate the entire chain for integrity issues.

**Returns**: Validation result with any errors found

#### repair_chain()
**Signature**: `fn repair_chain(&self) -> Result<ChainRepairResult, StorageError>`

**Purpose**: Attempt to repair chain integrity issues.

**Returns**: Repair result with actions taken

#### reorg_to_heavier_chain()
**Signature**: `fn reorg_to_heavier_chain(&self, new_tip: &RootBlock) -> Result<Vec<Action>, StorageError>`

**Purpose**: Reorganize to a heavier chain, returning orphaned actions to mempool.

**Parameters**:
- `new_tip`: New chain tip to switch to

**Returns**: Actions from orphaned blocks

#### get_best_tip() / set_best_tip()
**Signature**: `fn get_best_tip(&self) -> Result<Option<BlockHash>, StorageError>`

**Purpose**: Get or set the current canonical chain tip.

#### update_best_tip_if_heavier()
**Signature**: `fn update_best_tip_if_heavier(&self, candidate: &RootBlock) -> Result<bool, StorageError>`

**Purpose**: Update best tip if the candidate represents a heavier chain.

**Returns**: True if tip was updated

#### space_exists()
**Signature**: `fn space_exists(&self, space_id: &[u8; 16]) -> Result<bool, StorageError>`

**Purpose**: Check if a space exists in the registry.

#### needs_index_rebuild()
**Signature**: `fn needs_index_rebuild(&self) -> Result<bool, StorageError>`

**Purpose**: Check if content indexes need rebuilding.

### BlobStore

#### put()
**Signature**: `fn put(&self, data: &[u8]) -> Result<ContentBlobHash, StorageError>`

**Purpose**: Store data and return its content-addressed hash.

**Parameters**:
- `data`: Raw bytes to store

**Returns**: SHA-256 hash of the stored data

**Example**:
```rust
let blob_store = BlobStore::new(&path)?;
let hash = blob_store.put(b"Hello, Swimchain!")?;
assert!(blob_store.exists(&hash));

// Retrieve with integrity verification
let data = blob_store.get(&hash)?;
assert_eq!(data, b"Hello, Swimchain!");
```

#### get()
**Signature**: `fn get(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError>`

**Purpose**: Retrieve data by hash with integrity verification.

**Parameters**:
- `hash`: Content hash

**Returns**: Original data if hash matches, error otherwise

#### get_unchecked()
**Signature**: `fn get_unchecked(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError>`

**Purpose**: Fast retrieval without hash verification.

#### exists()
**Signature**: `fn exists(&self, hash: &ContentBlobHash) -> bool`

**Purpose**: Check if a blob exists.

#### delete()
**Signature**: `fn delete(&self, hash: &ContentBlobHash) -> Result<bool, StorageError>`

**Purpose**: Remove a blob and clean up empty directories.

#### iter_hashes()
**Signature**: `fn iter_hashes(&self) -> impl Iterator<Item = Result<ContentBlobHash, StorageError>>`

**Purpose**: Iterate all blob hashes in the store.

### LruCache

#### access()
**Signature**: `fn access(&mut self, hash: &ContentBlobHash)`

**Purpose**: Record access to content, updating last_access and access_count.

#### add_entry()
**Signature**: `fn add_entry(&mut self, entry: CacheEntry)`

**Purpose**: Add new content to the cache.

#### evict_if_needed()
**Signature**: `fn evict_if_needed(&mut self, incoming_bytes: u64) -> Result<Vec<ContentBlobHash>, StorageError>`

**Purpose**: Evict entries if adding incoming_bytes would exceed threshold.

**Parameters**:
- `incoming_bytes`: Size of incoming content

**Returns**: Hashes of evicted content

**Example**:
```rust
let mut cache = LruCache::open(&path, 1_000_000_000, 0.90, current_user)?;
cache.set_followed_spaces(followed_spaces);

// Before storing new content
let evicted = cache.evict_if_needed(new_content_size)?;
for hash in evicted {
    blob_store.delete(&hash)?;
}
```

#### pin() / unpin()
**Signature**: `fn pin(&mut self, hash: &ContentBlobHash) -> bool`

**Purpose**: Protect content from eviction (pin) or remove protection (unpin).

**Returns**: True if entry was found and modified

#### set_followed_spaces()
**Signature**: `fn set_followed_spaces(&mut self, spaces: HashSet<SpaceId>)`

**Purpose**: Update followed spaces for priority calculation.

#### statistics()
**Signature**: `fn statistics(&self) -> CacheStatistics`

**Purpose**: Get comprehensive cache metrics.

### PersistentContentStore

#### put()
**Signature**: `fn put(&self, content: &ContentItem) -> Result<(), StorageError>`

**Purpose**: Store content, handling inline vs blob storage automatically.

#### get()
**Signature**: `fn get(&self, id: &ContentId) -> Result<Option<ContentItem>, StorageError>`

**Purpose**: Retrieve content by ID.

#### get_children()
**Signature**: `fn get_children(&self, parent_id: &ContentId) -> Result<Vec<ContentItem>, StorageError>`

**Purpose**: Get all replies to content.

#### add_reaction()
**Signature**: `fn add_reaction(&self, reaction: &Reaction) -> Result<bool, StorageError>`

**Purpose**: Record a reaction to content.

#### remove_reaction()
**Signature**: `fn remove_reaction(&self, content_id: &ContentId, reactor_id: &IdentityId, reaction_type: ReactionType) -> Result<bool, StorageError>`

**Purpose**: Remove a reaction from content.

#### get_reaction_counts()
**Signature**: `fn get_reaction_counts(&self, content_id: &ContentId) -> Result<ReactionCounts, StorageError>`

**Purpose**: Get aggregated reaction counts.

### MembershipStore

#### add_member()
**Signature**: `fn add_member(&self, space_id: &[u8; 16], record: &MemberRecord) -> Result<(), StorageError>`

**Purpose**: Add a member to a private space.

#### get_space_members()
**Signature**: `fn get_space_members(&self, space_id: &[u8; 16]) -> Result<Vec<MemberRecord>, StorageError>`

**Purpose**: Get all members of a space.

#### get_user_spaces()
**Signature**: `fn get_user_spaces(&self, user_pk: &[u8; 32]) -> Result<Vec<[u8; 16]>, StorageError>`

**Purpose**: Get all spaces a user belongs to.

#### add_invite()
**Signature**: `fn add_invite(&self, invite: &InviteRecord) -> Result<(), StorageError>`

**Purpose**: Store a pending invite.

#### get_user_invites()
**Signature**: `fn get_user_invites(&self, user_pk: &[u8; 32]) -> Result<Vec<InviteRecord>, StorageError>`

**Purpose**: Get all pending invites for a user.

### AggregationCache

#### increment_reply_count()
**Signature**: `fn increment_reply_count(&self, parent_id: &ContentId) -> Result<(), StorageError>`

**Purpose**: Increment reply count for content.

#### get_content()
**Signature**: `fn get_content(&self, content_id: &ContentId) -> Result<Option<ContentAggregation>, StorageError>`

**Purpose**: Get aggregated statistics for content.

#### get_space()
**Signature**: `fn get_space(&self, space_id: &[u8; 16]) -> Result<Option<SpaceAggregation>, StorageError>`

**Purpose**: Get aggregated statistics for a space.

#### needs_rebuild()
**Signature**: `fn needs_rebuild(&self) -> Result<bool, StorageError>`

**Purpose**: Check if cache needs rebuilding.

#### mark_rebuilt()
**Signature**: `fn mark_rebuilt(&self) -> Result<(), StorageError>`

**Purpose**: Mark cache as rebuilt with current version.

---

## Behaviors

### Eviction Process

When new content is stored, the LRU cache determines if eviction is needed:

1. **Calculate projected size**: current_bytes + incoming_bytes
2. **Check threshold**: If projected > (threshold × max_bytes), eviction triggers
3. **Select candidates**:
   - Filter for evictable entries (exclude OwnContent tier)
   - Sort by priority (lowest first), then by last_access (oldest first)
4. **Evict until under threshold**:
   - Remove from cache index
   - Delete from blob store
   - Track eviction statistics
5. **Store new content**

**Priority Calculation**:
```rust
fn calculate_priority(entry: &CacheEntry, current_user: &str,
                      followed: &HashSet<String>) -> EvictionPriority {
    if entry.owner_id == current_user {
        return EvictionPriority::OwnContent;  // Never evict
    }
    if entry.is_pinned {
        return EvictionPriority::Pinned;      // User protected
    }

    let age_secs = now() - entry.created_at;
    let is_recent = age_secs < 604_800;       // 7 days
    let is_followed = followed.contains(&entry.space_id);

    match (is_recent, is_followed) {
        (true, true) => EvictionPriority::RecentFollowed,
        (false, true) => EvictionPriority::OldFollowed,
        (_, false) => EvictionPriority::OldUnfollowed,
    }
}
```

### Content Block Indexing

When a content block is stored, multiple indexes are updated:

1. **Store the block**: `content_blocks[hash] = block`
2. **For each action with content_hash**:
   - Create `space_content_index` entry: `space_id || timestamp → hash`
   - Create `content_metadata_index` entry: `hash → ContentIndexEntry`
   - Create `author_content_index` entry: `author || timestamp → hash`
   - If Post: add to `posts_by_space_index`
   - If Reply: add to `replies_by_parent_index`
3. **Track finalized action**: `finalized_actions[action_hash] = block_height`

### Bitcoin-Style Locator Sync

The locator system enables efficient sync with peers:

**Generating a locator**:
```
For chain tip at height 1000:
- Include heights: 1000, 999, 998, 996, 992, 984, 968, 936, 872, 744, 488, 0
- Exponential backoff: step doubles each iteration
- O(log N) hashes for any chain length
```

**Finding common ancestor**:
1. Peer sends locator
2. For each hash in locator (tip to genesis):
   - Check if hash exists AND is in height_index (canonical)
   - Return height of first match
3. Sync blocks from matched height onwards

### Orphan Blob Reconciliation

The CachingContentStore handles orphan blobs on startup:

1. **Scan blob store**: Get all blob hashes
2. **Check cache index**: Find hashes not in cache
3. **For each orphan**:
   - Try to recover metadata from chain
   - If recoverable, add to cache with correct metadata
   - If not recoverable, create conservative entry (owner = current_user)
4. **Persist cache index**

**Alternative**: Use `CachingContentStore::new_without_reconcile()` to skip this process.

### Aggregation Cache Rebuild

When the aggregation cache is stale or corrupted:

1. **Check version**: `needs_rebuild()` compares stored vs expected version
2. **Clear existing**: `clear()` removes all aggregations
3. **Rebuild from chain**:
   - Iterate all content blocks
   - Count replies per content
   - Calculate engagement scores
   - Aggregate per-space statistics
4. **Mark complete**: `mark_rebuilt()` stores current version

### Chain Reorganization

When a heavier chain is detected:

1. **Compare chains**: Calculate cumulative PoW
2. **Find fork point**: Common ancestor of current and new chain
3. **Rollback current**: Remove blocks from fork point to current tip
4. **Collect orphan actions**: Extract actions from rolled-back blocks
5. **Apply new chain**: Store new blocks and update indexes
6. **Return orphans**: Actions returned to mempool for re-inclusion

---

## Configuration

### Storage Profiles

| Profile | Cache Size | Threshold | Target Device |
|---------|------------|-----------|---------------|
| Budget1GB | 1 GB | 85% | Low-end mobile |
| Standard5GB | 5 GB | 90% | Average mobile (default) |
| Flagship10GB | 10 GB | 92% | High-end mobile |
| Custom | User-defined | 0.5-0.99 | Desktop/custom |

### Mobile Configuration Profiles

| Profile | Cache Limit | WiFi Only | Cellular Limit/Day | Background Serving |
|---------|-------------|-----------|-------------------|-------------------|
| Budget | 1.0 GB | Yes | 50 MB | No |
| Standard | 5.0 GB | Yes | 100 MB | Yes |
| Flagship | 10.0 GB | Yes | 200 MB | Yes |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| base_path | PathBuf | ~/.swimchain/ | Root storage directory |
| max_cache_bytes | u64 | 5 GB | Maximum storage size |
| eviction_threshold | f64 | 0.90 | Trigger eviction at this % |
| flush_interval_secs | u64 | 60 | Auto-flush interval |
| serve_on_wifi_only | bool | true | Mobile: only serve on WiFi |
| cellular_limit_mb_per_day | u32 | 100 | Mobile: daily cellular limit |
| background_serving | bool | true | Mobile: serve in background |

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| CHUNK_SIZE | 1,048,576 (1 MB) | Large file chunk size |
| INLINE_THRESHOLD | 1,024 (1 KB) | Inline vs blob storage cutoff |
| RECENT_THRESHOLD_SECS | 604,800 (7 days) | "Recent" content age for eviction |
| MIN_CACHE_BYTES | 104,857,600 (100 MB) | Minimum cache size |
| MAX_CACHE_BYTES | 107,374,182,400 (100 GB) | Maximum cache size |
| MAX_MEDIA_SIZE | 1,048,576 (1 MB) | Maximum media size |
| CACHE_VERSION | 1 | Aggregation cache schema version |
| Manifest::CURRENT_VERSION | 1 | Manifest format version |

---

## RPC Methods

Storage is accessed through the RPC layer. Key methods include:

### get_content
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_content",
  "params": { "content_id": "hex-encoded-content-id" },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content_id": "...",
    "author": "cs1...",
    "body": "Content text",
    "created_at": 1704067200,
    "space_id": "...",
    "reply_count": 5
  },
  "id": 1
}
```

### get_posts
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_posts",
  "params": {
    "space_id": "hex-encoded-space-id",
    "limit": 50,
    "offset": 0
  },
  "id": 1
}
```

**Purpose**: Retrieves posts from `posts_by_space_index` (excludes replies).

### get_replies
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_replies",
  "params": {
    "parent_id": "hex-encoded-content-id",
    "limit": 100
  },
  "id": 1
}
```

**Purpose**: Retrieves replies from `replies_by_parent_index`.

### get_user_feed
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_user_feed",
  "params": {
    "author": "cs1address...",
    "limit": 20
  },
  "id": 1
}
```

**Purpose**: Retrieves content from `author_content_index` for feed-style display.

---

## CLI Commands

### cs block view
```bash
cs block view <height|hash>
```
View a specific block by height or hash.

### cs block stats
```bash
cs block stats
```
Display chain statistics including block counts and storage usage.

### cs block content
```bash
cs block content <hash>
```
View content block details.

### cs block action
```bash
cs block action <hash>
```
View action metadata for a specific action hash.

### cs block engagements
```bash
cs block engagements
```
List engagement actions in recent blocks.

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| BlobNotFound | Requested blob doesn't exist | Content may have been evicted or never synced; re-fetch from peers |
| CorruptedData | Hash verification failed | Re-fetch content from peers |
| StorageFull | Cache exceeds limits | Automatic eviction should trigger; check config or free space |
| DatabaseError | Sled operation failed | Check disk space, permissions; may need database repair |
| InvalidHashFormat | Bad hash string | Ensure "sha256:<64-hex>" format |
| DataTooLarge | Content exceeds MAX_MEDIA_SIZE | Chunk content using Manifest |
| BlockNotFound | Missing block | May need to sync from peers |

---

## Testing

### Unit Tests
```bash
# Run storage layer tests
cargo test --package swimchain --lib storage

# Run specific test modules
cargo test chain_store
cargo test blob_store
cargo test lru_cache
cargo test membership_store
cargo test aggregation_cache
```

### Integration Tests
```bash
# Run storage integration tests
cargo test --test storage_integration

# Test eviction behavior
cargo test eviction_priority

# Test chain sync
cargo test locator_sync
```

### E2E Tests
```bash
# Storage stress testing
cargo test --test e2e_flows flow7_storage_stress

# Media chunking flows
cargo test --test e2e_flows flow3_media_chunks

# Mobile simulation
cargo test --test mobile_simulation storage_limits
```

### Test Coverage

| Test File | Coverage |
|-----------|----------|
| `tests/mobile_simulation/storage_limits.rs` | Storage profiles, eviction, OwnContent protection |
| `tests/e2e_flows/flow7_storage_stress.rs` | Storage stress testing |
| `tests/e2e_flows/flow3_media_chunks.rs` | Media chunking flows |
| `src/storage/mod.rs` (integration_tests) | Full lifecycle, persistence, eviction |
| Each module's `#[cfg(test)] mod tests` | Unit tests for all components |

---

## Known Limitations

1. **No Desktop Profile**: MASTER_FEATURES.md mentions a "Desktop 50GB" profile, but only Budget/Standard/Flagship/Custom exist in code. Use `Custom` with appropriate limits for desktop deployments.

2. **EvictionPriority Values**: Documentation may show 0-4, but code uses 1-5 (OldUnfollowed=1, not 0).

3. **Single-threaded Eviction**: Eviction runs synchronously and may briefly block on large caches.

4. **JSON Cache Index**: The cache index is stored as JSON, which is slower than binary formats for very large caches (>100k entries).

5. **No Automatic Compaction**: Sled database may grow over time; manual compaction may be needed.

6. **Space Listing**: Code uses `list_spaces()` iterator pattern rather than `get_all_spaces()` method.

---

## Future Work

Based on gap analysis, the following improvements are planned:

1. **Implement Desktop profile**: Add explicit 50GB Desktop profile to match documentation.

2. **Document chain validation/repair**: Add comprehensive docs for `validate_chain()`, `repair_chain()`, and `reorg_to_heavier_chain()` methods.

3. **Binary cache index**: Consider migrating from JSON to bincode for faster large-cache operations.

4. **Automatic compaction**: Add periodic or triggered sled database compaction.

5. **Parallel eviction**: Investigate concurrent eviction for large caches.

---

## Related Features

- [Content & Decay Engine](./content-decay-engine_FEATURE_DOC.md) - Content lifecycle and pruning
- [Synchronization](./synchronization_FEATURE_DOC.md) - Chain sync that populates storage
- [Private Spaces & Encryption](./private-spaces-encryption_FEATURE_DOC.md) - Uses MembershipStore
- [Device Constraints](./device-constraints_FEATURE_DOC.md) - Storage profiles integration
- [Seeding & Availability](./seeding_FEATURE_DOC.md) - Content sharing from storage
- [DHT & Peer Discovery](./dht-peer-discovery_FEATURE_DOC.md) - Content provider announcements

---

## Integration Points

### Used By
- **NodeManager** (`src/node/manager.rs`): Owns StorageManager
- **Syncer** (`src/sync/syncer.rs`): Uses ChainStore for block sync
- **RPC Methods** (`src/rpc/methods.rs`): Queries content and spaces
- **BlockBuilder** (`src/blocks/`): Stores finalized blocks
- **ContentRetrieval** (`src/content/retrieval.rs`): Fetches content

### Events
- **Eviction callback** (`EvictionCallback`): Notifies when content is evicted (Milestone 3.5)
- **Flush**: Periodic persistence of cache index

### Network Messages
- Locator sync: `generate_locator()` / `find_locator_match()`
- Block propagation: Content blocks trigger automatic indexing

---

## Data Integrity Features

1. **SHA-256 content addressing**: Blobs identified by content hash
2. **Hash verification on read**: `get()` verifies hash matches
3. **Atomic writes**: Temp file + rename pattern (POSIX atomic)
4. **Sled crash safety**: Embedded database handles crashes (ACID)
5. **2-char prefix sharding**: 256 buckets for blob distribution
6. **Manifest validation**: Chunk sizes, indices, total size checks

---

## Quality Checklist

- [x] Sled database handles crashes
- [x] Blob storage uses 2-char prefix distribution
- [x] LRU correctly tracks access times
- [x] Eviction respects 5-tier priorities
- [x] OwnContent never auto-evicted
- [x] Storage metrics are accurate
- [x] Reconciliation handles orphan blobs
- [x] Bitcoin-style locator sync implemented
- [x] Aggregation cache with version-based rebuild
- [x] Chain validation and repair methods
- [x] Best tip management for canonical chain
- [x] Reactions API complete
