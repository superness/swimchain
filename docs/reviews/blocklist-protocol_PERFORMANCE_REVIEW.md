# Performance Review: Blocklist Protocol

## Summary

The Blocklist Protocol demonstrates good performance characteristics for typical operation, with O(1) hash lookups via sled's B-tree storage and HashMap-based in-memory caching. However, several O(n) operations in the Merkle tree computation and sync state management could become bottlenecks at scale (>10K entries). The design lacks explicit size limits for unbounded HashMap growth in the gossip layer.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | Good O(1) lookups; O(n log n) Merkle tree rebuilds on every write |
| Resource Usage | 20 | 25 | Efficient serialization; Merkle root recomputed on every add/remove |
| Scalability | 17 | 25 | No horizontal scaling; single-node sled storage; unbounded HashMap growth |
| Optimization Opportunities | 20 | 25 | Several caching opportunities; batch processing not implemented |
| **Total** | **75** | **100** | Good for moderate scale; needs optimization for large blocklists |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `is_blocked()` | O(1) | sled B-tree key lookup or HashMap contains |
| `add()` | O(n log n) | Insert O(1), but triggers `update_sync_state()` which recomputes Merkle root |
| `remove()` | O(n log n) | Delete O(1), but triggers `update_sync_state()` |
| `get_all()` | O(n) | Full table scan with deserialization |
| `get_all_hashes()` | O(n) | Full table scan, key-only |
| `get_since()` | O(n) | Calls `get_all()` then filters |
| `get_by_reason()` | O(n) | Calls `get_all()` then filters |
| `compute_merkle_root()` | O(n log n) | Sorts all hashes, builds tree bottom-up |
| `compute_diff()` | O(n + m) | Creates HashSets from both lists |
| `build_proof()` | O(n log n) | Rebuilds entire tree to generate proof |
| `validate_update()` | O(k) | k = attestation count (typically 3-5) |
| `peers_to_forward()` | O(p) | p = peer count |

## Bottlenecks Identified

### 1. Merkle Root Recomputation on Every Write
**Location**: `src/blocklist/storage.rs:220-238` (update_sync_state)
**Impact**: At 10K entries, each add/remove requires O(10K log 10K) operations
**Mitigation**:
- Cache Merkle root and invalidate on writes
- Use incremental Merkle tree updates (add leaf without rebuilding)
- Batch updates before recomputing

### 2. Full Table Scans for Filtered Queries
**Location**: `src/blocklist/storage.rs:184-197` (get_since, get_by_reason)
**Impact**: Every filtered query scans all entries
**Mitigation**:
- Add secondary indexes by timestamp and reason
- Use sled's range queries with timestamp-prefixed keys
- Maintain in-memory indexes

### 3. Unbounded HashMap Growth in Gossip
**Location**: `src/blocklist/gossip.rs:32-35`
**Impact**: `pending_attestations` and `seen_by_peers` grow without limits
**Mitigation**:
- Current `cleanup_seen()` requires manual invocation with arbitrary `max_entries`
- Add automatic cleanup triggered by entry count thresholds
- Consider LRU cache with fixed size

### 4. Blocking sled I/O in Hot Paths
**Location**: `src/blocklist/storage.rs:67-68` (is_blocked)
**Impact**: Every content creation/retrieval blocks on sled disk access
**Mitigation**:
- Add in-memory bloom filter for quick negative lookups
- Cache hot entries in memory with LRU eviction
- Use sled's async API if available

### 5. Attestation Iteration for Sybil Check
**Location**: `src/blocklist/gossip.rs:75-79`
**Impact**: O(k) linear scan of pending attestations per new attestation
**Mitigation**:
- Use HashSet of attester IDs for O(1) lookup
- Keep Vec for ordered storage, HashSet for existence checks

## Scalability Concerns

### Vertical Scaling Limits
- **Single sled instance**: No sharding support; all blocklist data on one node
- **Memory pressure**: Large blocklists require significant RAM for Merkle computation
- **Lock contention**: `Arc<BlocklistStore>` without RwLock limits concurrent reads

### Horizontal Scaling Challenges
- **No partition tolerance**: All nodes must sync entire blocklist
- **Gossip amplification**: N nodes × M updates = O(N×M) network traffic
- **Sync storms**: All nodes requesting entries after network partition

### Expected Load Analysis
| Scale | Entries | Merkle Build | Memory | Concern Level |
|-------|---------|--------------|--------|---------------|
| Small | <1K | <1ms | ~100KB | Low |
| Medium | 1K-10K | 10-100ms | 1-10MB | Medium |
| Large | 10K-100K | 100ms-1s | 10-100MB | High |
| Very Large | >100K | >1s | >100MB | Critical |

## Optimization Recommendations

### High Impact

1. **Implement Incremental Merkle Tree** (Est. improvement: 90% on writes)
   - Store tree structure, update only affected branches
   - Location: `src/blocklist/merkle.rs`
   - Complexity: Medium-High

2. **Add Bloom Filter for Negative Lookups** (Est. improvement: 50% on non-blocked content)
   - 99.9% of content isn't blocked; optimize the common case
   - Location: `src/blocklist/storage.rs:is_blocked()`
   - Complexity: Low-Medium

3. **Batch Update Processing** (Est. improvement: 80% on bulk updates)
   - Accumulate updates, compute Merkle root once
   - Add `add_batch()` method
   - Complexity: Low

### Medium Impact

4. **Add Secondary Index by Timestamp**
   - Enables efficient `get_since()` without full scan
   - Use composite key: `timestamp:content_hash`
   - Complexity: Medium

5. **Replace HashMap with LRU Cache in Gossip**
   - Fixed memory footprint for `seen_by_peers`
   - Use `lru` crate
   - Complexity: Low

6. **Async sled Operations**
   - Non-blocking I/O for content checks
   - Requires runtime integration
   - Complexity: Medium

### Low Impact (Quick Wins)

7. **HashSet for Attester Deduplication** (Est. improvement: 10% on attestation processing)
   ```rust
   // Current: O(k) scan
   for existing in pending.iter() {
       if existing.attester == attestation.attester { ... }
   }
   // Better: O(1) lookup
   pending_attesters: HashSet<[u8; 32]>
   ```

8. **Pre-allocate Vectors with Known Capacity**
   - Already done in most places (good)
   - Verify `Vec::new()` calls have `with_capacity`

9. **Cache Merkle Root Between Reads**
   - Already implemented via `sync_state.local_root`
   - Verify cache invalidation is correct

## Resource Estimates

### Memory Usage (per node)
| Component | Typical | Maximum |
|-----------|---------|---------|
| sled cache | 64 MB | Configurable |
| Merkle tree build | 32 bytes × n | ~3.2 MB @ 100K entries |
| Gossip pending_attestations | ~200 bytes × pending | Unbounded (concern) |
| Gossip seen_by_peers | ~40 bytes × entries | Unbounded (concern) |
| **Total baseline** | ~100 MB | ~500 MB |

### Storage Usage (sled on disk)
| Entries | Raw Size | With Overhead |
|---------|----------|---------------|
| 1,000 | ~500 KB | ~1 MB |
| 10,000 | ~5 MB | ~10 MB |
| 100,000 | ~50 MB | ~100 MB |

Estimate based on: 512 bytes/entry (BlocklistEntry with 3 attestations)

### Network Usage
| Operation | Size | Frequency |
|-----------|------|-----------|
| BlocklistUpdate | ~400-600 bytes | Per addition |
| BlocklistSync | 108 bytes | Hourly per peer |
| BlocklistRequest | 12 + 32×n bytes | On sync mismatch |

**Gossip amplification**: Each update propagates to all connected peers
- 100 peers × 600 bytes = 60 KB per blocklist addition

## Benchmarking Recommendations

1. **Add benchmarks for critical paths**:
   ```rust
   #[bench]
   fn bench_is_blocked_hit() { ... }

   #[bench]
   fn bench_is_blocked_miss() { ... }

   #[bench]
   fn bench_merkle_root_1k_entries() { ... }

   #[bench]
   fn bench_merkle_root_10k_entries() { ... }
   ```

2. **Load test with realistic data**:
   - Import external blocklist (NCMEC-like) with 10K+ entries
   - Measure startup time, memory usage
   - Profile content creation latency with active blocklist

3. **Network simulation**:
   - Test sync behavior with 10+ nodes
   - Measure convergence time after partition
   - Monitor bandwidth usage during sync storms

## Code Quality Notes

### Positive Patterns
- `Vec::with_capacity()` used consistently for serialization
- Deterministic Merkle root via sorted hashes
- Clean separation of storage and gossip logic

### Areas for Improvement
- No explicit memory limits on unbounded collections
- Missing `#[inline]` hints on hot path functions
- No metrics/telemetry for performance monitoring

---
*Review Date: 2026-01-12*
*Reviewer: Performance Analysis Agent*
*Feature Version: As documented in blocklist-protocol_FEATURE_DOC.md*
