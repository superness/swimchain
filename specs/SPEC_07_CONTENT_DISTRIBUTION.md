# SPEC_07: Content Distribution Layer

**Version:** 1.6
**Status:** Partially Implemented
**Created:** 2024-12-24
**Updated:** 2025-12-26
**Depends on:** SPEC_02 (Content & Decay), SPEC_06 (Network Sync)

---

## Overview

Swimchain uses a **hybrid architecture** with two distinct layers:

| Layer | Model | What It Stores |
|-------|-------|----------------|
| **Authoritative** | Bitcoin-like chain | Post metadata, PoW proof, signatures, content hashes |
| **Content** | BitTorrent-like P2P | Actual media files, fetched from whoever has them |

This specification defines the **Content Distribution Layer** - the BitTorrent-like P2P system for storing and retrieving actual content blobs.

---

## Design Principles

### 1. Authority and Content Are Separate

The chain provides **authority** (who posted what, when, with valid PoW). The content layer provides **availability** (the actual bytes of media files).

```
AUTHORITATIVE RECORD (in chain)          CONTENT BLOB (in P2P network)
{
  author: pubkey,                        Qm7x9abc... → 50MB video file
  space: "tech-projects",
  timestamp: 1703456789,                 ├── Stored by creator
  pow_nonce: 847291,         ───hash───► ├── Cached by viewers
  content_hash: "Qm7x9abc...",           └── Seeded by enthusiasts
  signature: "sig..."
}
```

### 2. Content-Addressed Storage

All content is addressed by its cryptographic hash, not by location:

- **Hash algorithm:** SHA-256 (for simplicity and ubiquity)
- **Content ID format:** `sha256:<64-char-hex>` or CID (IPFS-compatible)
- **Request pattern:** "Give me content with hash X" not "Give me file from location Y"

### 3. Availability Is Probabilistic

Content availability depends on whether anyone online has it:

| Content Type | Expected Availability |
|--------------|----------------------|
| Popular post in active space | High (many caches) |
| Recent post in small group | Medium (creator + few viewers) |
| Old post in niche space | Low (may have decayed) |
| Content with no seeders | Unavailable |

**This is a feature.** Content fades when no one cares enough to keep it.

### 4. No Obligation to Store

Nodes choose what content to store:

- **Creators** store their own content (at least initially)
- **Viewers** cache content they view (configurable)
- **Enthusiasts** may seed entire spaces
- **No node is required** to store anything

---

## Content Types and Thresholds

### What Goes in the Chain vs. Content Layer

| Content Type | Size | Storage |
|--------------|------|---------|
| Post metadata | ~500 bytes | Chain |
| Short text (<1KB) | <1KB | Chain (inline) |
| Long text (>1KB) | 1KB-1MB | Content layer |
| Images | 100KB-10MB | Content layer |
| Videos | 10MB-1GB | Content layer |
| Attachments | Varies | Content layer |

**Threshold rule:** Content >1KB is stored in the content layer and referenced by hash. Content ≤1KB may be stored inline in the chain record.

### Inline Content Format

For small content (≤1KB), the chain record includes:

```json
{
  "author": "pubkey...",
  "space": "tech-projects",
  "timestamp": 1703456789,
  "pow_nonce": 847291,
  "content_type": "text/plain",
  "content_inline": "This is a short text post that fits inline.",
  "signature": "sig..."
}
```

### Referenced Content Format

For larger content (>1KB), the chain record references by hash:

```json
{
  "author": "pubkey...",
  "space": "tech-projects",
  "timestamp": 1703456789,
  "pow_nonce": 847291,
  "content_type": "video/mp4",
  "content_hash": "sha256:7x9abc123...",
  "content_size": 52428800,
  "content_chunks": 50,
  "signature": "sig..."
}
```

---

## Content Chunking

Large files are split into chunks for efficient distribution:

### Chunk Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk size | 1MB | Balances request overhead vs. parallelism |
| Max chunks | 1024 | Allows files up to 1GB |
| Min chunks | 1 | Small files have single chunk |

### Chunk Addressing

Each chunk is content-addressed:

```
File: video.mp4 (50MB)
├── Chunk 0: sha256:chunk0hash... (1MB)
├── Chunk 1: sha256:chunk1hash... (1MB)
├── ...
├── Chunk 49: sha256:chunk49hash... (50KB remainder)
└── Manifest: sha256:7x9abc123... (list of chunk hashes)
```

The `content_hash` in the chain record points to the **manifest**, which lists chunk hashes.

### Manifest Format

```json
{
  "version": 1,
  "total_size": 52428800,
  "chunk_size": 1048576,
  "chunks": [
    {"index": 0, "hash": "sha256:chunk0hash...", "size": 1048576},
    {"index": 1, "hash": "sha256:chunk1hash...", "size": 1048576},
    ...
    {"index": 49, "hash": "sha256:chunk49hash...", "size": 51200}
  ]
}
```

---

## Content Retrieval Protocol

### Request Flow

```
1. User wants to view Albert's video post
   ├── Has chain record: content_hash = "sha256:manifest..."

2. Request manifest from peers
   ├── "WHO_HAS sha256:manifest..."
   ├── Peers respond: "I_HAVE" or silence
   ├── Select peer, request: "GET sha256:manifest..."
   ├── Receive manifest, verify hash

3. Request chunks (parallelized)
   ├── "GET sha256:chunk0hash..." from peer A
   ├── "GET sha256:chunk1hash..." from peer B
   ├── ... (up to N concurrent requests)
   ├── Verify each chunk hash
   └── Assemble file from chunks

4. Cache locally for re-seeding
```

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `WHO_HAS <hash>` | Broadcast | Ask who has content |
| `I_HAVE <hash>` | Response | Declare availability |
| `GET <hash>` | Request | Request specific content |
| `DATA <hash> <bytes>` | Response | Return content |
| `NOT_FOUND <hash>` | Response | Don't have it |

### Request Optimization

- **Parallel chunk requests:** Download from multiple peers simultaneously
- **Rarest-first:** Request least-available chunks first (BitTorrent strategy)
- **Local cache check:** Always check local storage before network
- **Peer scoring:** Track reliable peers for future requests

---

## Storage and Caching

### Local Storage Structure

```
~/.swimchain/
├── chain/                    # Authoritative chain data
│   └── ...
└── content/                  # Content layer storage
    ├── blobs/                # Raw content by hash
    │   ├── sha256/
    │   │   ├── 7x/
    │   │   │   └── 9abc123...  # Actual bytes
    │   │   └── ...
    │   └── ...
    ├── manifests/            # Chunk manifests
    │   └── ...
    └── cache_index.json      # What we have, LRU info
```

### Cache Management

Nodes manage limited storage with LRU (Least Recently Used) eviction:

| Parameter | Default | Configurable |
|-----------|---------|--------------|
| Max cache size | 10GB | Yes |
| Min cache size | 1GB | Yes |
| Eviction threshold | 90% full | Yes |
| Protected content | Own posts, pinned | Yes |

### Cache Policies

```
EVICTION_PRIORITY (lowest = evicted first):
1. Old content from spaces you don't follow
2. Old content from spaces you follow but don't post in
3. Recent content from spaces you follow
4. Content you've explicitly pinned
5. Content you created (never auto-evicted)
```

### Seeding Configuration

Users can configure seeding behavior:

```json
{
  "seeding": {
    "enabled": true,
    "spaces": ["tech-projects", "college-friends"],
    "bandwidth_limit_mbps": 10,
    "storage_limit_gb": 50,
    "seed_own_content": true,
    "seed_viewed_content": true,
    "seed_duration_hours": 168
  }
}
```

---

## Availability Announcements

### How Peers Learn What Others Have

**Option A: DHT-based** (like BitTorrent Mainline DHT)
- Store `hash → [peer addresses]` in distributed hash table
- Peers announce what they have
- Lookup before requesting

**Option B: Gossip-based** (simpler, less efficient)
- `WHO_HAS` broadcasts to connected peers
- Peers relay to their peers (with hop limit)
- Works without global DHT

**Option C: Hybrid** (recommended)
- Use gossip for recent/active content
- Use DHT for older/sparse content
- Falls back gracefully

### DHT Structure (if used)

```
DHT Key: content_hash
DHT Value: {
  "providers": [
    {"peer_id": "abc...", "last_seen": 1703456789},
    {"peer_id": "def...", "last_seen": 1703456700},
    ...
  ]
}
```

### Announcement Protocol

When a node obtains new content:

```
1. Store locally
2. Announce to DHT: "I have sha256:xyz..."
3. Respond to future WHO_HAS queries
```

When a node evicts content:

```
1. Delete locally
2. Stop announcing to DHT (or let announcement expire)
3. Stop responding to WHO_HAS for that content
```

---

## Content Decay Integration

Content decay (SPEC_02) affects the authoritative layer. The content layer responds:

### When Chain Record Decays

If a post's chain record decays (is pruned from the chain):

1. **Content becomes orphaned** - No authoritative reference
2. **Nodes may evict orphaned content** - No reason to keep it
3. **Content hash alone is meaningless** - Can't prove who posted it

### When Content Becomes Unavailable

If content blobs become unavailable (no seeders):

1. **Chain record still exists** - Proves "X posted something at time T"
2. **Content cannot be retrieved** - Hash exists but bytes are gone
3. **UI shows placeholder** - "Content unavailable - no seeders"

### Decay Coordination

```
DECAY TIMELINE:

Day 0:  Post created, content stored by creator
Day 1:  Some viewers cache content
Day 7:  Low engagement → chain record decay starts
Day 14: Chain record fully decayed (pruned)
Day 15: Nodes evict orphaned content blobs
Day 16: Content effectively gone from network
```

**Key insight:** Content availability follows chain authority. When the chain forgets, nodes stop seeding.

---

## Security Considerations

### Content Integrity

- All content verified by hash before accepting
- Chunks verified individually, then manifest
- Malformed/mismatched content rejected

### Spam Prevention

- Content requests require knowing the hash
- Can't enumerate what a node has
- PoW on chain record prevents spam content creation

### Privacy

- Nodes learn what peers request (unavoidable)
- Consider: onion routing for content requests?
- Consider: encrypted content with key in chain record?

### Denial of Service

- Bandwidth limits on seeding
- Request rate limiting
- Peer reputation for bad actors

---

## Mobile Considerations

Mobile devices have constraints:

| Constraint | Mitigation |
|------------|------------|
| Storage | Aggressive cache limits (1-5GB) |
| Bandwidth | Prefer WiFi for large content, cellular for metadata |
| Battery | Batch requests, disable background seeding |
| Connectivity | Graceful offline mode, queue requests |

### Mobile-Specific Behavior

**DESIGN NOTE:** The view-to-host model means users only cache content they explicitly view.
There is NO prefetch option - that would contradict consent-based content hosting.
"Background serving" means serving content already in cache, never fetching new content.

```json
{
  "mobile_mode": {
    "cache_limit_gb": 2,
    "serve_on_wifi_only": true,
    "cellular_limit_mb_per_day": 100,
    "background_serving": false
  }
}
```

Note: `cellular_limit_mb_per_day` applies to chain sync only. Content is fetched on-demand
when the user explicitly views it - there is no proactive/background content fetching.

---

## Comparison with Prior Art

| System | Similarity | Difference |
|--------|------------|------------|
| **BitTorrent** | Content-addressed, seeded by interest | No tracker, DHT-only |
| **IPFS** | Content addressing, chunking | Simpler protocol, no complex DAGs |
| **Dat/Hypercore** | Distributed, mutable | Our content is immutable once created |
| **WebTorrent** | Browser-compatible | May be relevant for web clients |

---

## Open Questions

### To Resolve

1. **DHT choice:** Build custom, use Kademlia, or adapt existing (Mainline DHT)?
2. **Content encryption:** Encrypt all content? Only private content? Key distribution?
3. **Large file limits:** Maximum content size? (1GB? 10GB? Unlimited?)
4. **Streaming:** Support for streaming video vs. download-first?

### For Prototyping

1. **Chunk size optimization:** Is 1MB optimal for real-world usage?
2. **Cache sizing:** What's the right default for different device types?
3. **Peer discovery:** How quickly can content be located in a sparse network?

---

## Implementation Notes

### Recommended Libraries

- **libp2p:** Battle-tested P2P networking
- **multihash:** Standard content addressing
- **leveldb/rocksdb:** Local content storage

### Phased Implementation

1. **Phase 1:** Basic content storage and retrieval (no chunking, no DHT)
2. **Phase 2:** Add chunking for large files
3. **Phase 3:** Add DHT for content discovery
4. **Phase 4:** Optimize caching and seeding policies

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-24 | Initial specification |
| 1.1 | 2025-12-25 | Storage layer implementation complete (Milestone 1.6): ChainStore (sled), BlobStore (sha256:<hex> content-addressing), LruCache (5-tier eviction), mobile storage profiles (1GB/5GB/10GB) |
| 1.2 | 2025-12-25 | Content addressing implementation complete (Milestone 3.1): SHA-256 hashing via ContentBlobHash, Content ID format `sha256:<64-hex>`, hash verification on retrieval (HashMismatch/CorruptedData errors), INLINE_THRESHOLD=1024 per SPEC_02 §3.1, ContentAddressedStore high-level API, 39 tests (13 unit + 26 integration) |
| 1.3 | 2025-12-25 | Content chunking implementation complete (Milestone 3.2): 1MB chunk boundaries (CHUNK_SIZE=1,048,576), Manifest JSON format per §3, ChunkAvailability for partial downloads, ChunkedContentStore high-level API, ContentReference::Chunked variant, 22 chunking tests. Critical measurements answered: 1MB optimal chunk size (<0.02% manifest overhead), ~140 bytes per chunk entry. Full integration with ContentAddressedStore. Documentation: docs/content-chunking.md, docs/benchmarks/chunking.md |
| 1.4 | 2025-12-26 | Content retrieval protocol implementation complete (Milestone 3.3): WHO_HAS/I_HAVE/GET/DATA/NOTFOUND message types (0x24-0x28) per §4. ContentRetrievalManager with PeerAvailabilityMap (expiry, max entries), WhoHasSeenCache (deduplication), hash verification on DATA. ParallelFetcher with configurable max_concurrent (default: 4) and retry logic (max_retries: 3). ChunkFetchStatus enum tracks retry count across state transitions. Peer rotation on NOTFOUND. 27 retrieval module tests + 898 total tests. Constants: MAX_CONCURRENT_CHUNK_REQUESTS=4, CONTENT_MAX_RETRIES=3. Documentation: docs/content-retrieval.md, docs/content-availability.md |
| 1.5 | 2025-12-26 | Cache management implementation complete (Milestone 3.4): CachingContentStore (src/storage/caching_store.rs, ~280 LOC) wraps BlobStore + LruCache. CacheStatistics struct with hits, misses, eviction_count, bytes_evicted, bytes_by_priority. 5-tier EvictionPriority (OldUnfollowed→OldFollowed→RecentFollowed→Pinned→OwnContent) with OwnContent protected (can_evict=false). StorageProfile eviction thresholds: Budget1GB (0.85), Standard5GB (0.90), Flagship10GB (0.92). MIN_CACHE_BYTES=100MB, MAX_CACHE_BYTES=100GB. set_max_bytes(), set_eviction_threshold(), apply_profile() for runtime configuration. ContentRetrievalManager.on_data_with_cache() integration. Benchmark suite (benches/cache_benchmark.rs) with Zipf distribution. 909 total tests passing. Documentation: docs/cache-management.md, docs/benchmarks/cache.md |
| 1.6 | 2025-12-26 | Seeding & availability implementation complete (Milestone 3.5): `src/seeding/` module (6 files). SeedingConfig with SeedingMode enum (Disabled, OwnContent, ViewedContent, FullSpace), spaces filter, bandwidth 1-100 Mbps, storage 1-1000 GB, duration 1-8760 hours. MobileConfig with WiFi-only mode and cellular limits. AvailabilityAnnouncePayload with compact wire format (space_id:32 + expires_at:8 + count:2 + hashes:32×N), max 100 hashes per batch per §6. PeerAvailabilityMap tracks hash→peers with TTL-based expiration and 5-minute re-announcement interval. TokenBucketLimiter with lock-free atomics (AtomicU64) for bandwidth control, 1-second burst capacity. SeedingStatistics with bytes_uploaded/downloaded, requests_served/denied, per-space stats (HashMap<SpaceId, SpaceStats>), rolling 1-hour window for bytes_uploaded_last_hour, SeedingHealth enum (Healthy/Degraded/Inactive). SeedingManager.should_seed() policy checks: enabled, WiFi-only, own content override, space filter, duration check. ContentRetrievalManager integration via on_who_has_with_seeding() and on_get_with_seeding(). LruCache enhancements: get_seedable_entries(), iter_by_space(), get_hashes_by_space(), bytes_in_space(), count_in_space(). CachingContentStore eviction callbacks (EvictionCallback type, set_eviction_callback()). 60 seeding module tests + 818 total tests. **PHASE 3 COMPLETE.** Documentation: docs/seeding.md (240 lines), docs/availability-announcements.md (277 lines) |

---

*Specification created: 2024-12-24*
*Last updated: 2025-12-26*
*Status: Partially implemented - storage layer, content addressing, chunking, retrieval protocol, cache management, and seeding & availability complete. PHASE 3 COMPLETE. Next: Phase 4 Integration & Testing (Milestone 4.1 End-to-End Flow)*
