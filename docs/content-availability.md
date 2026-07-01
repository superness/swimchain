# Content Availability Tracking

This document describes how nodes track which peers have which content, used by the content retrieval protocol (Milestone 3.3, SPEC_07 Section 4).

## Overview

The content availability system maintains a mapping from content hashes to the set of peers that have reported having that content. This enables efficient peer selection when requesting content.

## PeerAvailabilityMap

### Structure

```rust
struct PeerAvailabilityMap {
    /// content_hash -> (peers, last_updated)
    inner: HashMap<ContentBlobHash, AvailabilityEntry>,
    /// Maximum entries to prevent unbounded growth
    max_entries: usize,
}

struct AvailabilityEntry {
    /// Peers that have this content
    peers: HashSet<PeerId>,
    /// When this entry was last updated
    last_updated: Instant,
}
```

### Operations

| Operation | Complexity | Description |
|-----------|------------|-------------|
| `add_peer(hash, peer)` | O(1) amortized | Record peer as having content |
| `remove_peer(hash, peer)` | O(1) amortized | Remove peer from availability |
| `get_peers(hash)` | O(n) where n = peer count | Get all peers with content |
| `expire_old_entries(ttl)` | O(m) where m = entries | Remove entries older than TTL |

## Lifecycle

### Entry Creation

When a peer responds with I_HAVE to a WHO_HAS query:

```rust
manager.on_i_have(&payload, sender_peer_id);
// This calls:
// availability.add_peer(content_hash, sender_peer_id);
```

### Entry Updates

Each `add_peer` call updates the `last_updated` timestamp, keeping the entry fresh.

### Entry Removal

Entries are removed in two scenarios:

1. **Explicit Removal**: When a peer responds with NOTFOUND:
   ```rust
   manager.on_not_found(&hash, peer_id);
   // This calls:
   // availability.remove_peer(hash, peer_id);
   ```

2. **Expiration**: Entries older than `availability_cache_ttl` (default 5 minutes):
   ```rust
   manager.expire_availability();
   // This calls:
   // availability.expire_old_entries(config.availability_cache_ttl);
   ```

### Capacity Management

The map enforces a maximum entry limit (`max_availability_entries`, default 10,000):

- When at capacity and adding a new hash, the oldest entry is evicted
- This prevents unbounded memory growth
- Eviction is based on `last_updated` timestamp

## Peer Selection Strategy

### Current Implementation

Simple selection with exclusion list:

```rust
pub fn select_peer(&self, hash: &ContentBlobHash, exclude: &[PeerId]) -> Option<PeerId> {
    let peers = self.get_peers_with_content(hash);
    peers.into_iter().find(|p| !exclude.contains(p))
}
```

### Usage Pattern

```rust
// First attempt
let peer = manager.select_peer(&hash, &[]);

// On failure, exclude failed peer
let next_peer = manager.select_peer(&hash, &[failed_peer]);
```

## Configuration

| Parameter | Default | Constant Name |
|-----------|---------|---------------|
| Cache TTL | 5 minutes | `PEER_AVAILABILITY_TTL_SECS` |
| Max entries | 10,000 | `MAX_PEER_AVAILABILITY_ENTRIES` |

## WHO_HAS Deduplication

To prevent response floods, the manager tracks recently seen WHO_HAS queries:

```rust
struct WhoHasSeenCache {
    /// (content_hash, peer_id) -> when we last responded
    seen: HashMap<(ContentBlobHash, PeerId), Instant>,
    /// TTL for entries (default 60 seconds)
    ttl: Duration,
}
```

If the same peer sends WHO_HAS for the same content within the TTL, we don't respond again.

## Thread Safety

The `ContentRetrievalManager` uses `RwLock` for thread-safe access:

```rust
pub struct ContentRetrievalManager {
    availability: RwLock<PeerAvailabilityMap>,
    // ...
}
```

- Read operations (get_peers) acquire read locks
- Write operations (add/remove peer) acquire write locks

## Future Enhancements

### Rarest-First Selection

Track peer counts per chunk to prioritize rare chunks:

```rust
fn select_rarest_chunk(&self, chunks: &[ContentBlobHash]) -> Option<ContentBlobHash> {
    chunks.iter()
        .min_by_key(|h| self.get_peers_with_content(h).len())
        .copied()
}
```

### Peer Scoring

Track peer performance for better selection:

```rust
struct PeerScore {
    success_count: u32,
    failure_count: u32,
    avg_response_ms: u64,
}

fn select_best_peer(&self, hash: &ContentBlobHash) -> Option<PeerId> {
    self.get_peers_with_content(hash)
        .into_iter()
        .max_by_key(|p| self.peer_scores.get(p).map(|s| s.score()))
}
```

### DHT Integration

For content not found via gossip-based WHO_HAS:

1. Query DHT for content location
2. DHT stores (content_hash -> peer_id) mappings
3. Integrate DHT results into availability map

## Related Documents

- [Content Retrieval Protocol](content-retrieval.md)
- [Content Chunking](content-chunking.md)
- SPEC_07: Content Distribution
