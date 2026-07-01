# Performance Review: Content & Decay Engine

## Summary

The Content & Decay Engine demonstrates solid performance for individual operations with O(1) decay calculations and O(1) engagement processing. However, critical scalability concerns exist in the pruning system which iterates all content (O(n)) and the recursive child checking algorithm (potentially O(n*m)). At scale (100K+ content items), these operations could cause significant latency spikes during maintenance windows.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 17 | 25 | Core O(1) but pruning is O(n) with recursive child check |
| Resource Usage | 20 | 25 | Efficient memory patterns; file I/O well-chunked |
| Scalability | 18 | 25 | In-memory store limits scale; no decay index |
| Optimization Opportunities | 20 | 25 | Clear paths for improvement identified |
| **Total** | **75** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `calculate_decay_state()` | O(1) | `decay.rs:39` | Constant time math operations |
| `calculate_adaptive_half_life()` | O(1) | `decay.rs:108` | Simple arithmetic |
| `calculate_decay_state_spam_flagged()` | O(1) | `decay.rs:149` | Delegates to O(1) function |
| `process_engagement()` | O(1) | `engagement.rs:56` | Single lookup + update |
| `ContentManager::create_content()` | O(1) | `lifecycle.rs:71` | HashMap insert |
| `ContentManager::get_decay_state()` | O(1) | `lifecycle.rs:123` | HashMap lookup + O(1) calc |
| `prune_decayed_content()` | **O(n)** | `pruning.rs:45` | Iterates ALL content |
| `has_non_decayed_children()` | **O(d)** | `pruning.rs:112` | Recursive, d=tree depth |
| `chunk_data()` | O(n/chunk_size) | `chunking.rs:315` | Linear in content size |
| `reassemble_from_manifest()` | O(chunks) | `chunking.rs:460` | Sequential chunk fetch |
| `check_availability_from_manifest()` | O(chunks) | `chunking.rs:514` | Iterates chunk list |

## Bottlenecks Identified

### 1. O(n) Pruning Operation

**Location**: `src/content/pruning.rs:54-91`

```rust
// First pass: identify decayed content
for content in storage.iter() {  // <-- O(n) iteration
    stats.items_checked += 1;
    let decay_state = calculate_decay_state(content, current_time_ms, half_life_secs);
    // ...
}
```

**Impact**: With 100,000 content items:
- Calculation: ~100K decay calculations
- At 1µs/calc = 100ms just for decay checks
- Child checks multiply this further

**Scale Threshold**: Becomes problematic at ~50K items (>50ms latency)

**Mitigation**:
- Add decay timestamp index sorted by `last_engagement + effective_decay_time`
- Prune only items where `estimated_decay_time < current_time`
- Use B-tree index for O(log n) range queries

### 2. Recursive Child Checking

**Location**: `src/content/pruning.rs:112-129`

```rust
fn has_non_decayed_children<S: ContentStore>(
    storage: &S,
    parent_id: &ContentId,
    current_time_ms: u64,
    half_life_secs: u64,
) -> bool {
    for child in storage.get_children(parent_id) {
        let decay_state = calculate_decay_state(child, current_time_ms, half_life_secs);
        if !decay_state.is_decayed {
            return true;
        }
        // Recursively check grandchildren
        if has_non_decayed_children(storage, &child.content_id, current_time_ms, half_life_secs) {
            return true;
        }
    }
    false
}
```

**Impact**:
- Worst case: O(n) where n = total descendants
- Deep thread trees (100+ levels) could stack overflow
- Re-computes decay for same children multiple times

**Scale Threshold**: Threads with >1000 replies cause visible latency

**Mitigation**:
- Cache decay state during pruning pass
- Use iterative BFS instead of recursion
- Maintain "has_active_descendant" flag updated on engagement

### 3. In-Memory Content Store

**Location**: `src/content/storage.rs:66-71`

```rust
pub struct InMemoryContentStore {
    content: HashMap<ContentId, ContentItem>,
    tombstones: HashMap<ContentId, Tombstone>,
    children_index: HashMap<ContentId, Vec<ContentId>>,
    total_bytes: u64,
}
```

**Impact**:
- All content in RAM limits node capacity
- No persistence = lost data on restart
- HashMap resizing causes GC pauses

**Scale Threshold**: ~500K items = ~1GB RAM (estimated 2KB/item avg)

**Mitigation**: Disk-backed store with LRU cache (partially implemented in `CachingContentStore`)

### 4. Unbounded Tombstone Growth

**Location**: `src/content/pruning.rs:100-106`

```rust
for (id, tombstone) in to_tombstone {
    if storage.delete(&id) {
        let _ = storage.put_tombstone(tombstone);  // Never pruned
        stats.items_pruned += 1;
        stats.tombstones_created += 1;
    }
}
```

**Impact**: Tombstones accumulate forever, consuming memory

**Scale Threshold**: After years, tombstone count could exceed content count

**Mitigation**: Add tombstone TTL and periodic cleanup

## Scalability Concerns

### 1. Single-Threaded Pruning
The pruning operation holds a write lock (`storage.write()`) for the entire duration, blocking all reads/writes.

**Recommendation**: Batch pruning with lock release between batches.

### 2. Adaptive Half-Life Calculation
`adapt_half_life()` at `lifecycle.rs:207` acquires multiple locks sequentially, risking deadlock under concurrent access.

### 3. Content Retrieval Parallelism
`ParallelFetcher` limited to 4 concurrent requests (`MAX_CONCURRENT_CHUNK_REQUESTS`). For large files (1GB = 1024 chunks), download time is dominated by sequential chunks.

### 4. Grace Period Implementation
```rust
// pruning.rs:62-67
let time_since_engagement_ms = current_time_ms.saturating_sub(content.last_engagement);
if time_since_engagement_ms < PRUNE_GRACE_PERIOD_MS {
    continue; // Within grace period
}
```
This uses `time_since_engagement` as proxy for "time since decay", which is inaccurate. Content could cross decay threshold but still satisfy this check.

### 5. No Horizontal Scaling Path
Content is local to each node. No sharding strategy for distributing content across nodes.

## Optimization Recommendations

### High Impact

1. **Add Decay Index** (Expected: 10-100x pruning speedup)
   ```rust
   // Proposed structure
   decay_index: BTreeMap<u64, HashSet<ContentId>>
   // Key: estimated_decay_timestamp = last_engagement + floor + 4*half_life
   ```
   - Query range `[0, current_time]` for candidates
   - Reduces pruning from O(n) to O(k log n) where k = pruned items

2. **Cache Decay State During Pruning** (Expected: 2-5x speedup)
   ```rust
   let decay_cache: HashMap<ContentId, DecayState> = HashMap::new();
   // Populate during first pass, reuse for child checks
   ```

3. **Batch Processing for Pruning** (Expected: Reduce lock contention)
   - Process 1000 items per batch
   - Release write lock between batches
   - Allow reads during batch intervals

### Medium Impact

4. **Convert Recursive to Iterative Child Check**
   ```rust
   fn has_non_decayed_children_iterative(...) -> bool {
       let mut queue = VecDeque::from(storage.get_children(parent_id));
       while let Some(child) = queue.pop_front() {
           if !calculate_decay_state(child, ...).is_decayed {
               return true;
           }
           queue.extend(storage.get_children(&child.content_id));
       }
       false
   }
   ```

5. **Add Tombstone Cleanup Policy**
   - TTL: 90 days after all children decayed
   - Periodic background cleanup task

6. **Increase Concurrent Chunk Downloads**
   - Increase `MAX_CONCURRENT_CHUNK_REQUESTS` to 8-16 for large files
   - Add bandwidth-aware throttling

### Low Impact (Quick Wins)

7. **Pre-allocate Vectors in Pruning**
   ```rust
   let mut to_prune: Vec<ContentId> = Vec::with_capacity(estimated_prune_count);
   ```

8. **Use `parking_lot` for RwLock**
   - Faster than std RwLock
   - Fair scheduling reduces writer starvation

9. **Add Metrics/Instrumentation**
   - Track pruning duration, items checked, items pruned
   - Alert when pruning exceeds threshold

10. **Lazy Decay Calculation**
    - Only calculate decay when accessed (not on every query)
    - Cache result with TTL (e.g., 60 seconds)

## Resource Estimates

### Memory Usage (per 10,000 content items)
| Component | Size | Notes |
|-----------|------|-------|
| ContentItem structs | ~20 MB | ~2KB avg per item |
| Children index | ~3 MB | ContentId refs |
| Tombstones (10%) | ~0.3 MB | Minimal data |
| Decay cache (optional) | ~2 MB | If implemented |
| **Total** | ~25 MB | |

### Storage (500MB node target)
| Content Type | Estimate |
|--------------|----------|
| Inline posts (≤1KB) | ~200K items |
| Referenced blobs (1KB-1MB) | ~500-500K items |
| Chunked content (>1MB) | Limited by `MAX_CONCURRENT_CHUNK_REQUESTS` |

### Network (P2P Retrieval)
| Operation | Bandwidth |
|-----------|-----------|
| WHO_HAS broadcast | 64 bytes × fanout |
| I_HAVE response | 64 bytes per peer |
| GET/DATA for 1MB | 1MB + 36 byte header |
| Chunk download (parallel=4) | 4MB concurrent |

### CPU (per operation)
| Operation | Estimated Time |
|-----------|----------------|
| Decay calculation | ~500ns |
| Engagement processing | ~1µs |
| Content creation | ~5µs |
| Prune check (per item) | ~2µs |
| Full prune (10K items) | ~20ms |
| Full prune (100K items) | ~200ms |

## Benchmarking Recommendations

1. Add micro-benchmarks for:
   - `calculate_decay_state()`
   - `process_engagement()`
   - `prune_decayed_content()` at various scales

2. Add integration benchmarks for:
   - Concurrent engagement processing
   - Pruning under write load
   - Content retrieval latency

3. Load testing targets:
   - 100K content items
   - 1K engagements/second
   - 10 concurrent prune operations

---

*Generated: 2026-01-12*
*Reviewer: Performance Analysis*
*Source: `src/content/`, `src/storage/`, `src/types/constants.rs`*
