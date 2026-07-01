# Performance Review: DHT & Peer Discovery

## Summary
The DHT & Peer Discovery system demonstrates solid algorithmic foundations with standard Kademlia O(log n) complexity for lookups, but suffers from several performance bottlenecks that will impact scalability. The most critical issues are blocking DNS resolution, sequential lookup result processing, and full-table scans in the peer store. Memory usage is reasonable but could be optimized with better caching strategies.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 20 | 25 | Standard Kademlia O(log n), but sorting and linear scans in hot paths |
| Resource Usage | 17 | 25 | Blocking DNS, repeated allocations, no connection pooling |
| Scalability | 18 | 25 | O(n) full table scans limit peer cache scaling |
| Optimization Opportunities | 20 | 25 | Many low-hanging fruit available |
| **Total** | **75** | **100** | |

---

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `closest()` | O(n log n) | `routing_table.rs:298-313` | Collects all nodes then sorts; up to 2048 nodes (256 buckets × 8 nodes) |
| `bucket_index()` | O(1) | `node_id.rs:79-95` | Single XOR + leading zeros |
| `xor_distance()` | O(1) | `node_id.rs:65-71` | 32-byte XOR, fixed cost |
| `update()` (k-bucket) | O(K) | `routing_table.rs:130-161` | Linear scan of bucket (K=8), acceptable |
| `get_all()` (peer store) | O(n) | `peer_store.rs:70-78` | Full sled tree iteration |
| `evict_lowest_scores()` | O(n log n) | `peer_store.rs:153-173` | Full scan + sort |
| `remove_banned()` | O(n) | `peer_store.rs:176-189` | Full scan |
| `remove_stale()` | O(n) | `peer_store.rs:192-206` | Full scan |
| Iterative lookup | O(log n × K × α) | `lookup.rs:151-269` | Standard Kademlia, α=3 parallel queries |
| `add_provider()` | O(m) | `provider_store.rs:73-99` | m = MAX_PROVIDERS (20), linear find |
| `peers_for_branch()` | O(1) | `peer_branches.rs:223-228` | HashMap lookup |
| `coverage_summary()` | O(b × p) | `peer_branches.rs:312-342` | b = branches, p = peers per branch |
| DNS seed resolution | O(network) | `seed_list.rs:160-169` | **BLOCKING** - stalls async runtime |

---

## Bottlenecks Identified

### 1. Blocking DNS Resolution (Critical)
**Location**: `src/discovery/seed_list.rs:160-169`
```rust
pub fn resolve(&self) -> Vec<SocketAddr> {
    let lookup = format!("{}:{}", self.domain, self.port);
    match lookup.to_socket_addrs() {  // BLOCKING!
        ...
    }
}
```
**Impact**: Blocks the entire async runtime during DNS resolution. At startup with multiple DNS seeds, this can stall the node for several seconds or more if DNS is slow.
**Mitigation**: Use `tokio::net::lookup_host()` for async DNS resolution.

### 2. Full Table Scans in PeerStore (High)
**Location**: `src/discovery/peer_store.rs:70-78, 153-206`
**Impact**: Operations like `get_by_min_score()`, `evict_lowest_scores()`, `remove_banned()`, and `remove_stale()` all call `get_all()` which iterates the entire sled tree. With MAX_CACHED_PEERS=2000, this means deserializing 2000 × 95-byte entries.
**Scale Threshold**: Becomes noticeable at 1000+ peers, problematic at 5000+.
**Mitigation**:
- Add secondary indexes for score-based queries
- Use sled's `scan_prefix()` with score-keyed entries
- Cache frequently accessed data in memory

### 3. Sequential Lookup Result Processing (Medium)
**Location**: `src/dht/lookup.rs:217-238`
```rust
let results = futures::future::join_all(queries).await;
for (node_info, result) in results {  // Sequential processing
    match result { ... }
}
```
**Impact**: While queries run in parallel (α=3), result processing is sequential. With 10-second lookup timeout and 5-second RPC timeout, a single slow response can delay processing of faster responses.
**Mitigation**: Use `futures::stream::FuturesUnordered` for concurrent result processing.

### 4. Routing Table closest() Sort (Medium)
**Location**: `src/dht/routing_table.rs:298-313`
```rust
pub fn closest(&self, target: &NodeId, count: usize) -> Vec<&NodeEntry> {
    let mut candidates: Vec<&NodeEntry> = self.buckets
        .iter()
        .flat_map(|b| b.nodes())
        .collect();  // Allocates Vec

    candidates.sort_by(|a, b| { ... });  // O(n log n)
    candidates.truncate(count);
    candidates
}
```
**Impact**: Collects all nodes (up to 2048) then sorts, even when we only need K=8 closest. This is called on every FIND_NODE request.
**Mitigation**: Use a heap-based selection algorithm (partial sort) for O(n + k log k) instead of O(n log n).

### 5. Provider Record Linear Search (Low-Medium)
**Location**: `src/dht/provider_store.rs:77`
```rust
if let Some(existing) = providers.iter_mut().find(|p| p.node_id == record.node_id)
```
**Impact**: Linear scan of up to 20 providers per content hash. With many provider updates, this adds up.
**Mitigation**: Use a HashMap keyed by NodeId within each content entry.

### 6. Branch Tracker Memory Growth (Low)
**Location**: `src/discovery/peer_branches.rs:150-158`
**Impact**: `PeerBranchTracker` maintains two HashMaps that grow with peers × branches. No automatic eviction based on memory pressure.
**Mitigation**: Add configurable limits and LRU eviction for branch tracking.

---

## Scalability Concerns

### Network Scale
| Peers | Routing Table | Provider Store | Peer Cache | Branch Tracker |
|-------|---------------|----------------|------------|----------------|
| 100 | ~800 entries | Variable | 100 × 95B = 9.5KB | Minimal |
| 1,000 | ~2,048 entries | Variable | 1,000 × 95B = 95KB | ~100KB |
| 10,000 | ~2,048 entries (saturated) | Variable | 10,000 × 95B = 950KB | ~1MB+ |
| 100,000 | ~2,048 entries | Variable | **Capped at 2,000** | Memory concern |

**Key Observations**:
1. **Routing table** is bounded at 2,048 entries (256 × 8) - scales well
2. **Peer cache** is bounded at 2,000 entries - but eviction is O(n log n)
3. **Provider store** is unbounded - potential memory issue
4. **Branch tracker** is unbounded - potential memory issue

### Horizontal Scaling Limitations
- **Single-node design**: No sharding or distribution of DHT responsibility
- **In-memory state**: Provider store and branch tracker cannot be shared across instances
- **Sled bottleneck**: PeerStore uses single sled database, which is single-writer

---

## Optimization Recommendations

### High Impact

1. **Async DNS Resolution** (Estimated: 5-10x faster bootstrap)
   ```rust
   // Instead of blocking to_socket_addrs()
   pub async fn resolve(&self) -> Vec<SocketAddr> {
       tokio::net::lookup_host(format!("{}:{}", self.domain, self.port))
           .await
           .map(|addrs| addrs.collect())
           .unwrap_or_default()
   }
   ```
   **Location**: `src/discovery/seed_list.rs:160-169`

2. **Heap-based K-closest Selection** (Estimated: 2-3x faster for FIND_NODE)
   ```rust
   pub fn closest(&self, target: &NodeId, count: usize) -> Vec<&NodeEntry> {
       use std::collections::BinaryHeap;
       let mut heap = BinaryHeap::with_capacity(count + 1);
       for entry in self.buckets.iter().flat_map(|b| b.nodes()) {
           heap.push((target.xor_distance(&entry.id), entry));
           if heap.len() > count {
               heap.pop(); // Remove farthest
           }
       }
       heap.into_sorted_vec().into_iter().map(|(_, e)| e).collect()
   }
   ```
   **Location**: `src/dht/routing_table.rs:298-313`

3. **Score Index for Peer Store** (Estimated: 10-100x faster eviction)
   - Add a secondary sled tree indexed by score
   - Or maintain an in-memory sorted set of (score, PeerKey) tuples
   **Location**: `src/discovery/peer_store.rs`

### Medium Impact

4. **Concurrent Lookup Result Processing**
   ```rust
   use futures::stream::{FuturesUnordered, StreamExt};
   let mut results_stream = queries.into_iter()
       .map(|(node, rpc)| async move { (node, rpc.await) })
       .collect::<FuturesUnordered<_>>();

   while let Some((node_info, result)) = results_stream.next().await {
       // Process as they complete
   }
   ```
   **Location**: `src/dht/lookup.rs:207-238`

5. **Provider Store HashMap Optimization**
   - Change `Vec<ProviderRecord>` to `HashMap<NodeId, ProviderRecord>`
   - Makes add/update O(1) instead of O(n)
   **Location**: `src/dht/provider_store.rs:52-58`

6. **Connection Pooling for RPC**
   - Reuse TCP connections for repeated RPC calls
   - Reduces handshake overhead during lookups
   **Location**: External to current implementation

### Low Impact (Quick Wins)

7. **Pre-allocate VecDeque in KBucket**
   ```rust
   nodes: VecDeque::with_capacity(K),  // Already done ✓
   ```
   **Status**: Already implemented in `routing_table.rs:77`

8. **Cache Local Node Info**
   - Cache `NodeInfo::new(self.local_id, self.local_addr)` instead of recreating
   **Location**: `src/dht/manager.rs`

9. **Lazy BranchPath Serialization**
   - Cache serialized form in BranchPath to avoid repeated serialization
   **Location**: `src/discovery/peer_branches.rs:67, 168`

10. **Batch Sled Writes**
    - Use sled's `Batch` for multiple peer updates
    **Location**: `src/discovery/peer_store.rs`

---

## Resource Estimates

### Memory Usage (Typical Node)
| Component | Estimate | Notes |
|-----------|----------|-------|
| Routing Table | ~150-200 KB | 2048 entries × 72 bytes (NodeEntry) |
| Provider Store | ~100 KB - 10 MB | Depends on content hosted |
| Peer Cache (sled) | ~190 KB | 2000 entries × 95 bytes |
| Branch Tracker | ~50-500 KB | Depends on network activity |
| Lookup State | ~10 KB/lookup | BinaryHeap + HashSet per active lookup |
| **Total In-Memory** | ~500 KB - 15 MB | Highly variable |

### Storage (Disk)
| Component | Estimate | Notes |
|-----------|----------|-------|
| Peer Cache (sled) | ~500 KB - 2 MB | Sled overhead + 2000 entries |
| **DHT State** | 0 | Not persisted (in-memory only) |
| **Branch Tracker** | 0 | Not persisted (in-memory only) |

### Network
| Operation | Messages | Bandwidth |
|-----------|----------|-----------|
| Single Lookup | 3-15 RPCs | ~3-10 KB |
| Bootstrap | 3-10 seed queries | ~1-5 KB |
| GETADDR | 1 request + response | ~100 KB max (1000 addrs) |
| Provider Announce | K (8) STORE messages | ~300 bytes × 8 = 2.4 KB |

---

## Performance Test Recommendations

1. **Benchmark `closest()` with Full Table**
   - Measure time with 2048 nodes, compare heap vs sort

2. **Load Test PeerStore Operations**
   - Measure `evict_lowest_scores()` with 2000+ entries
   - Profile sled tree iteration overhead

3. **DNS Resolution Timing**
   - Measure bootstrap time with DNS seeds
   - Compare sync vs async resolution

4. **Lookup Latency Under Load**
   - Measure lookup completion time with varying peer response times
   - Test concurrent lookup performance

5. **Memory Growth Tracking**
   - Monitor provider store and branch tracker growth over time
   - Identify memory pressure thresholds

---

## Conclusion

The DHT & Peer Discovery implementation follows sound algorithmic principles with Kademlia's O(log n) lookup complexity. However, several implementation details create performance bottlenecks that will limit scalability:

- **Blocking DNS** is the most critical issue for startup performance
- **Full table scans** in peer store limit peer cache scaling
- **Sequential result processing** in lookups could be parallelized

The estimated improvements from addressing High Impact items:
- Bootstrap: 5-10x faster (async DNS)
- FIND_NODE handling: 2-3x faster (heap selection)
- Peer eviction: 10-100x faster (score indexing)

Addressing these issues before the network grows beyond a few hundred nodes is recommended.
