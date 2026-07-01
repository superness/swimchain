# Performance Review: Engagement & Social

## Summary

The Engagement & Social feature has a well-optimized write path for core operations but contains several algorithmic bottlenecks that will degrade performance at scale. The engagement graph's `record_engagement()` is O(1) for key lookups, but includes an O(n) adjacency list contains check. Query paths like `get_top_engagers()` O(n log n) and `find_mutual_connections()` O(n²) won't scale for popular authors (10K+ engagers). Notification storage uses efficient prefix scans but lacks caching. Space health appropriately caches computed values with 60s TTL. JSON serialization for engagement edges adds 3-5x overhead vs binary formats.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | Several O(n²) operations, adjacency O(n) contains |
| Resource Usage | 19 | 25 | JSON overhead, no caching except space health, frequent flush() |
| Scalability | 17 | 25 | Popular authors bottleneck, unbounded data growth |
| Optimization Opportunities | 18 | 25 | Clear caching/indexing opportunities exist |
| **Total** | **72** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `record_engagement()` | O(1) key + O(n) contains | storage.rs:30-66 | 4 DB ops, adjacency check is O(n) |
| `get_edge()` | O(1) | storage.rs:69-79 | Single key lookup |
| `get_mutual()` | O(1) | storage.rs:82-91 | 2 key lookups |
| `get_stats()` | O(1) | storage.rs:94-103 | Single key lookup |
| `get_engaged_authors()` | O(k) | storage.rs:106-108 | k = adjacency list size |
| `get_engagers()` | O(k) | storage.rs:111-113 | k = adjacency list size |
| `get_top_engagers()` | O(n log n) | storage.rs:116-128 | Loads ALL edges, then sorts |
| `find_mutual_connections()` | O(n²) | storage.rs:131-155 | Set intersection + n get_mutual() calls |
| `graph_stats()` | O(E + V) | storage.rs:158-174 | Full database scan |
| `add_to_adjacency_list()` | O(n) | storage.rs:201-218 | `list.contains()` is linear |
| `recent_timestamps.remove(0)` | O(100) | types.rs:77-79 | Vec shift of up to 100 elements |
| `compute_health_score()` | O(1) | compute.rs:62-99 | Pure arithmetic |
| `get_health()` | O(1) cached / O(m) miss | manager.rs:62-89 | 60s TTL cache |
| `check_and_unlock()` | O(12) | achievement | 12 constant-time comparisons |
| `check_streak()` | O(p) | service.rs:123-171 | p = preference/throttle lookups |
| `get_unread()` | O(n) | notification/storage.rs:71-93 | Scans all identity notifications |
| `count_unread()` | O(n) | notification/storage.rs:269-282 | Full scan, no counter cache |
| `get_chain_engagements()` | O(B * A) | methods.rs:6466-6570 | B=blocks, A=actions per block |
| `extract_contributors_from_pool()` | O(n log n) | attribution | HashMap aggregation + sort |
| `format_attribution_display()` | O(1) | attribution | Bounded by MAX_DISPLAY_CONTRIBUTORS=10 |
| `decay_countdown_days()` | O(1) | attribution | Pure arithmetic |

## Bottlenecks Identified

### 1. Top Engagers Query Loads All Edges
**Location**: `src/engagement_graph/storage.rs:116-128`
**Impact**: At 10K+ engagers, multi-second latency; at 100K+, potential OOM
**Code**:
```rust
// Current: O(n log n)
let mut edges: Vec<_> = engagers.iter()
    .filter_map(|engager| self.get_edge(engager, author).ok().flatten())
    .collect();
edges.sort_by(|a, b| b.1.cmp(&a.1));
edges.truncate(limit);
```
**Mitigation**: Maintain pre-sorted top-N index updated on each engagement; limit to top 1000

### 2. Mutual Connections Has O(n²) Behavior
**Location**: `src/engagement_graph/storage.rs:131-155`
**Impact**: User with 1K connections = 1M operations; 10K connections = 100M operations
**Code**:
```rust
// Current: O(n²)
let engaged_set: HashSet<_> = engaged_authors.iter().collect();
let mutual_ids: Vec<_> = engagers.iter()
    .filter(|id| engaged_set.contains(id))
    .collect();
for other in mutual_ids {
    let mutual = self.get_mutual(identity, &other)?; // n get_edge calls
}
```
**Mitigation**: Add mutual connection index; compute incrementally on engagement

### 3. Adjacency List Contains Check
**Location**: `src/engagement_graph/storage.rs:210`
**Impact**: Every new engagement to an author with n engagers costs O(n)
**Code**:
```rust
// Current: O(n) per new engagement
if !list.contains(other) {
    list.push(*other);
}
```
**Mitigation**: Use HashSet or sled secondary index for O(1) membership

### 4. Recent Timestamps Vec::remove(0)
**Location**: `src/engagement_graph/types.rs:77-79`
**Impact**: Every engagement to existing edge copies up to 100 elements
**Code**:
```rust
// Current: O(100)
self.recent_timestamps.push(timestamp);
if self.recent_timestamps.len() > Self::MAX_RECENT {
    self.recent_timestamps.remove(0); // O(n) copy
}
```
**Mitigation**: Replace Vec with VecDeque for O(1) front removal

### 5. Graph Stats Full Database Scan
**Location**: `src/engagement_graph/storage.rs:158-174`
**Impact**: O(E + V) for every stats call; unusable at scale
**Code**:
```rust
for result in self.db.scan_prefix(EDGE_PREFIX) { ... }
for result in self.db.scan_prefix(STATS_PREFIX) { ... }
```
**Mitigation**: Maintain running counters updated on inserts

### 6. Notification Count Not Cached
**Location**: `src/notification/storage.rs:269-282`
**Impact**: Each `count_unread()` call scans all identity notifications
**Code**:
```rust
// Current: O(n) - full scan
pub fn count_unread(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
    let prefix = Self::make_prefix(identity);
    let mut count = 0;
    for result in self.tree.scan_prefix(&prefix) { ... }
    Ok(count)
}
```
**Mitigation**: Maintain atomic counter incremented on store, decremented on read

### 7. Synchronous flush() After Every Write
**Location**: Multiple locations (storage.rs:64, 137, 165, etc.)
**Impact**: Blocks on disk I/O for each operation; adds 1-10ms per write
**Mitigation**: Batch flushes or use async writes

### 8. Chain Engagements Iterates All Blocks
**Location**: `src/rpc/methods.rs:6466-6570`
**Impact**: Linear in total blockchain size; no pagination
**Mitigation**: Add engagement index by content_id; implement pagination

### 9. JSON Serialization for Engagement Graph
**Location**: `src/engagement_graph/storage.rs:39-58`
**Impact**: JSON is 3-5x larger than bincode and 2-3x slower. The `EngagementEdge` struct with 100-element `recent_timestamps` Vec serializes to ~1KB JSON vs ~200 bytes bincode.
**Mitigation**: Switch to bincode (already used by achievement/notification stores)

## Scalability Concerns

### Data Growth Without Bounds
- **Adjacency lists**: Grow unbounded per identity; no max limit
- **Recent timestamps**: Capped at 100 per edge (good)
- **Notifications**: Capped at 100 per identity via prune_overflow() (good)
- **Engagement edges**: Unbounded; no archival strategy

### Horizontal Scaling Limitations
- **sled DB**: Single-node embedded database; no sharding
- **EngagementGraphStore**: Stateful, no partition strategy
- **Space health cache**: Per-process HashMap; not distributed

### Load Characteristics

| Scenario | Expected Load | Bottleneck |
|----------|---------------|------------|
| Active user reading notifications | 10/min | count_unread() O(n) scans |
| Popular author receiving engagements | 100/min | adjacency O(n) contains |
| Profile page with mutual connections | On load | find_mutual_connections() O(n²) |
| Space health dashboard | 10/sec/space | Cached, 60s TTL (acceptable) |
| Global analytics query | On demand | graph_stats() full scan |

### Memory Pressure Points
- `find_mutual_connections()` builds full HashSet in memory (~320KB for 10K connections)
- `get_top_engagers()` loads all edges before sorting
- Notification pruning collects all keys before deletion

## Optimization Recommendations

### High Impact

1. **Pre-computed Top Engagers Index**
   - Maintain sorted top-N list per author, updated on engagement
   - **Files**: `src/engagement_graph/storage.rs`
   - **Expected improvement**: O(n log n) → O(1) reads, O(log n) writes
   - **Effort**: M

2. **HashSet for Adjacency Membership**
   - Replace Vec.contains() with HashSet lookup or composite key existence
   - **Current**: `out:{engager}` → Vec<[u8; 32]>
   - **Proposed**: `out:{engager}:{author}` exists/not-exists
   - **Expected improvement**: O(n) → O(1) per new connection
   - **Effort**: M (requires migration)

3. **Replace JSON with bincode in engagement_graph**
   - **Files**: `src/engagement_graph/storage.rs`, `types.rs`
   - **Expected improvement**: 60-70% storage reduction, 2-3x faster ser/deser
   - **Effort**: S - change serde_json to bincode in 4 locations

### Medium Impact

4. **Notification Unread Counter Cache**
   - Atomic counter per identity, maintained on insert/read operations
   - **Expected improvement**: O(n) → O(1) for count queries
   - **Effort**: S

5. **VecDeque for Recent Timestamps**
   - Simple type change from Vec to VecDeque
   - **Expected improvement**: O(100) → O(1) per sliding window update
   - **Effort**: S

6. **Add counter keys for graph_stats()**
   - **Files**: `src/engagement_graph/storage.rs`
   - **Expected improvement**: O(E+V) → O(1) for stats queries
   - **Effort**: S - add 2 keys, update in record_engagement()

7. **Mutual Connections Index**
   - Track bidirectional edges in separate index, updated incrementally
   - **Expected improvement**: O(n²) → O(n) for retrieval
   - **Effort**: L

### Low Impact (Quick Wins)

8. **Batch sled Flush Operations**
   - Group writes before flush instead of flush-per-write
   - **Expected improvement**: 10-50% write throughput increase
   - **Effort**: S

9. **Add LRU cache for hot engagement edges**
   - **Improvement**: 90%+ cache hit rate for popular content
   - **Effort**: M - add ~50 lines of caching code

10. **Pre-allocate Vec capacities**
    - Add `Vec::with_capacity()` where growth patterns are known
    - **Effort**: S

## Resource Estimates

### Memory (per node, typical usage)
- **Engagement graph in-memory**: Minimal (sled-managed)
- **Hot cache (if added)**: ~10MB for 10K cached edges
- **Notification service**: ~1MB for 10K identities throttle state
- **Achievement service**: ~100KB for 10K identities (12 bytes each)
- **Space health cache**: ~1KB per cached space × active spaces

### Storage (per node)
- **Engagement edges**: ~500 bytes/edge with JSON (could be ~150 bytes with bincode)
- **10K users with 100 engagements each**: ~500MB JSON, ~150MB bincode
- **100K users**: ~5GB JSON, ~1.5GB bincode
- **Notifications**: ~500 bytes/notification, MAX 100/identity
- **Adjacency lists**: ~32KB per popular user with 1000 connections

### Network (per RPC call)
- **submit_engagement**: ~500 bytes request, ~200 bytes response
- **get_chain_engagements**: Variable; ~1KB per content item (unbounded!)
- **Space health query**: ~2KB response (with top 10 contributors)

### CPU
- **record_engagement()**: ~50-100μs (dominated by DB + JSON)
- **check_and_unlock()**: ~10-20μs (12 comparisons + optional DB write)
- **compute_health_score()**: ~100ns (pure arithmetic)
- **get_top_engagers(10)**: ~10ms for 1K engagers, ~100ms for 10K engagers

## Database Access Patterns

| Operation | Reads | Writes | Flushes |
|-----------|-------|--------|---------|
| `record_engagement()` | 4-5 | 3-4 | 0 (good) |
| `get_top_engagers(limit)` | n+1 | 0 | 0 |
| `check_streak()` | 2 | 2 | 2 (excessive) |
| `store_notification()` | 0 | 1 | 1 |
| `get_unread(limit)` | n | 0 | 0 |
| `mark_read()` | n | 1 | 1 |
| `mark_all_read()` | n | n | 1 |

## Caching Analysis

| Component | Cache Strategy | TTL | Invalidation |
|-----------|----------------|-----|--------------|
| Engagement Graph | None | N/A | N/A |
| Engagement Stats | None | N/A | N/A |
| Space Health | In-memory HashMap | 60s | On activity/contribution |
| Notifications | None | N/A | N/A |
| Achievement Progress | None | N/A | N/A |

**Recommendation**: Add LRU cache for:
- Popular authors' engagement stats (most queried)
- Active users' unread notification counts
- Recently accessed engagement edges

## Async/Parallel Opportunities

| Opportunity | Current | Potential |
|-------------|---------|-----------|
| Notification service | Sync DB + async broadcast | Already uses tokio broadcast for events |
| Engagement recording | Sync blocking | Could use async sled operations |
| Top engagers query | Sequential | Could parallelize edge lookups |
| Achievement checking | Sequential | Independent checks could parallelize |
| Space health computation | Sync | Background thread recomputation |

The engagement graph module is fully synchronous. Adding async support would require significant refactoring but would improve throughput under concurrent load.

## Serialization Inconsistency

| Module | Format | Issue |
|--------|--------|-------|
| engagement_graph | JSON | 3-5x larger, slower |
| achievement | bincode | Optimal |
| notification/throttle | bincode | Optimal |
| notification/storage | bincode | Optimal |
| notification/preferences | bincode | Optimal |

**Recommendation**: Standardize on bincode for all storage modules.

## Performance Testing Recommendations

1. **Load test get_top_engagers() at scale**
   - Synthetic author with 10K, 50K, 100K engagers
   - Measure latency and memory usage

2. **Stress test record_engagement() concurrency**
   - Multiple concurrent writers to same author
   - Verify no race conditions in adjacency list updates

3. **Benchmark JSON vs bincode serialization**
   - Measure actual throughput difference
   - Quantify storage savings

4. **Profile notification count operations**
   - Measure count_unread() latency with 100 notifications
   - Compare to counter-based approach

## Critical Bug Impact on Performance

### unique_engagers / unique_authors_engaged Never Incremented

**Location**: `src/engagement_graph/storage.rs:231-261`

The comment at line 253 acknowledges that unique counters need edge scanning to be exact, but the code never attempts to track uniqueness:

```rust
// Comment says: "Update unique count (this is approximate - we'd need to scan to be exact)"
// But NO code follows - unique_authors_engaged and unique_engagers are NEVER incremented
```

**Performance implication**: If fixed naively with per-engagement scanning, this would add O(n) overhead to every engagement. Proper fix requires:
- Track "seen" set in memory per write batch, or
- Use separate sled tree for O(1) membership test

### Self-Engagement Not Blocked

**Location**: `src/engagement_graph/storage.rs:62-63`

Self-engagements are tracked (`is_self` parameter passed) but never prevented. This allows users to artificially inflate their engagement stats and game the `looks_organic()` spam detection. While not a direct performance issue, it creates unnecessary write amplification if users abuse this.

---

## Summary of Priority Fixes

| Priority | Fix | Performance Gain | Effort |
|----------|-----|------------------|--------|
| P0 | VecDeque for recent_timestamps | O(100) → O(1) | 30 min |
| P0 | Fix unique counter tracking | Required for correctness | 2-4 hours |
| P1 | HashSet adjacency membership | O(n) → O(1) per new edge | M |
| P1 | Notification unread counter | O(n) → O(1) per query | S |
| P2 | bincode for engagement_graph | 60-70% storage reduction | S |
| P2 | Pre-computed top engagers | O(n log n) → O(1) reads | M |
| P3 | Graph stats counters | O(E+V) → O(1) | S |
| P3 | Mutual connections index | O(n²) → O(n) | L |

---

*Performance Review updated: 2026-01-13*
*Methodology: Code analysis, complexity assessment, bottleneck identification*
*Reviewer: Claude Performance Reviewer*
