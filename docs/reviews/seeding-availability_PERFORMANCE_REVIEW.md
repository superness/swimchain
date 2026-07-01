# Performance Review: Seeding & Availability

## Summary

The Seeding & Availability feature demonstrates strong performance design with lock-free rate limiting, bounded data structures, and efficient wire protocols. The token bucket rate limiter is correctly implemented using CAS loops for thread-safe access. Key concerns include potential lock contention on statistics tracking under high load and the unbounded pending announcement queue. Overall, the implementation should scale well for typical workloads but may need optimization for high-throughput scenarios.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 22 | 25 | Lock-free O(1) rate limiter, bounded pruning, minor O(n) operations |
| Resource Usage | 21 | 25 | Bounded maps, but some unbounded queues and frequent allocations |
| Scalability | 20 | 25 | Sequential lock acquisition may limit throughput under high concurrency |
| Optimization Opportunities | 18 | 25 | Several low-hanging fruit optimizations available |
| **Total** | **81** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `try_acquire()` | O(1) amortized | `rate_limiter.rs:47-71` | CAS loop may spin under contention |
| `refill()` | O(1) | `rate_limiter.rs:119-165` | Nested CAS loops (timestamp then tokens) |
| `should_seed()` | O(s) | `manager.rs:89-142` | s = number of configured spaces (linear scan) |
| `record_upload()` | O(1) atomics + O(log n) HashMap | `statistics.rs:102-130` | HashMap insertion may resize |
| `prune_old_samples()` | O(k) | `statistics.rs:259-267` | k = expired samples (front-drain) |
| `bytes_uploaded_last_hour()` | O(n) | `statistics.rs:168-177` | n = samples in last hour, iterates all |
| `get_announcement_batches()` | O(n/100) | `availability.rs:173-188` | Creates batch payloads |
| `serialize()` | O(h) | `availability.rs:52-64` | h = number of hashes in payload |
| `deserialize()` | O(h) | `availability.rs:72-101` | Linear parse with bounds checking |
| `record()` (PeerMap) | O(1) avg / O(n) prune | `availability.rs:255-269` | May trigger full prune at capacity |
| `get_peers()` | O(p) | `availability.rs:274-288` | p = peers for hash, filters by TTL |
| `prune_entries()` | O(e × p) | `availability.rs:304-311` | e = entries, p = avg peers per entry |
| `snapshot()` | O(s + n) | `statistics.rs:244-256` | Clones space_stats HashMap + hourly calc |

## Bottlenecks Identified

### 1. Sequential Lock Acquisition in `should_seed()`
**Location**: `src/seeding/manager.rs:96-119`
**Impact**: At 10,000+ concurrent seeding decisions per second, lock contention becomes measurable
**Analysis**:
```rust
// Current implementation acquires 3 read locks sequentially:
let config = self.config.read()?;           // Lock 1
if let Ok(mobile) = self.mobile_config.read() {  // Lock 2
    if let Ok(provider) = self.network_state_provider.read() {  // Lock 3
```
**Mitigation**:
- Combine mobile_config and network_state_provider into a single lock
- Cache the combined "should check wifi" decision to avoid repeated lock acquisition
- Consider using `parking_lot::RwLock` for better fairness under contention

### 2. Statistics HashMap Lock Contention
**Location**: `src/seeding/statistics.rs:110-114`
**Impact**: At high upload rates (>1000/sec), lock contention on `space_stats` degrades throughput
**Analysis**:
```rust
// Write lock acquired on every upload:
if let Ok(mut stats) = self.space_stats.write() {
    let entry = stats.entry(space_id).or_default();
    entry.bytes_uploaded += bytes;
}
```
**Mitigation**:
- Use `DashMap` or sharded HashMap for lock-free concurrent updates
- Batch statistics updates (collect in thread-local, flush periodically)
- Use atomic counters per-space with lazy HashMap population

### 3. Unbounded Pending Announcements Queue
**Location**: `src/seeding/availability.rs:147-149`
**Impact**: Memory grows without bound if content is stored faster than announced
**Analysis**:
```rust
// No bound on pending announcements:
pending.entry(space_id).or_default().push(hash);
```
**Mitigation**:
- Add configurable max_pending limit (e.g., 10,000 hashes)
- Drop oldest pending when limit reached (or use ring buffer)
- Alert when queue grows beyond threshold

### 4. Full HashMap Clone in `snapshot()`
**Location**: `src/seeding/statistics.rs:253`
**Impact**: Large space_stats maps cause allocation spike during snapshot
**Analysis**:
```rust
space_stats: self.all_space_stats(),  // Clones entire HashMap
```
**Mitigation**:
- Use `Arc<HashMap>` with copy-on-write semantics
- Provide iterator-based access instead of full clone
- Cache snapshot and invalidate on changes

### 5. PeerAvailabilityMap Full Prune at Capacity
**Location**: `src/seeding/availability.rs:258-260`
**Impact**: When map reaches 10,000 entries, prune is O(n × p) blocking all readers
**Analysis**:
```rust
if entries.len() >= self.max_entries {
    self.prune_entries(&mut entries);  // Full scan with write lock held
}
```
**Mitigation**:
- Implement incremental pruning (prune a batch per `record()` call)
- Use time-partitioned data structure for O(1) expiration
- Run background pruning task instead of inline

## Scalability Concerns

### Horizontal Scaling
- **Supports**: Multiple nodes can run independently with their own SeedingManager instances
- **Limitation**: No coordination between nodes for load balancing seeding load
- **Concern**: Popular content may cause all seeders to announce simultaneously

### Vertical Scaling (Load on Single Node)
| Metric | Expected Limit | Bottleneck |
|--------|----------------|------------|
| Seeding decisions/sec | ~50,000 | Lock acquisition in `should_seed()` |
| Bandwidth rate limit checks/sec | ~1,000,000 | CAS loop spin under extreme contention |
| Statistics updates/sec | ~10,000 | HashMap write lock contention |
| Peer availability records | 10,000 entries × ~10 peers | Memory and prune latency |
| Announcement payloads/batch | 100 hashes max | Wire format serialization |

### Data Growth Projections
| Data Structure | Growth Pattern | Bounded? | Max Size |
|----------------|---------------|----------|----------|
| `space_stats` | O(spaces) | No | Depends on space creation rate |
| `hourly_samples` | O(uploads/hour) | Yes | ~3600 max samples (1/sec) |
| `last_announced` | O(spaces) | No | One entry per active space |
| `pending_announcements` | O(content stored) | **No** | Unbounded - risk |
| `PeerAvailabilityMap` | O(content × peers) | Yes | 10,000 entries |

## Optimization Recommendations

### High Impact

#### 1. Replace Statistics RwLock with DashMap
**Expected Improvement**: 3-5x throughput improvement under high concurrency
**Location**: `src/seeding/statistics.rs:67`
**Change**:
```rust
// Before:
space_stats: RwLock<HashMap<SpaceId, SpaceStats>>

// After:
space_stats: DashMap<SpaceId, SpaceStats>
```
**Effort**: Low (API compatible)

#### 2. Bound Pending Announcements Queue
**Expected Improvement**: Prevents memory exhaustion under sustained load
**Location**: `src/seeding/availability.rs:147-149`
**Change**: Add max_pending_per_space limit with oldest-eviction policy
**Effort**: Medium

#### 3. Incremental PeerAvailabilityMap Pruning
**Expected Improvement**: Eliminate O(n) blocking prune latency spikes
**Location**: `src/seeding/availability.rs:255-269`
**Change**: Prune 100 entries per `record()` call, use background task for full sweep
**Effort**: Medium

### Medium Impact

#### 4. Cache WiFi Check Result
**Expected Improvement**: Reduce lock acquisitions in `should_seed()` by 2/3
**Location**: `src/seeding/manager.rs:107-119`
**Change**: Compute and cache `is_wifi_required && !is_on_wifi` result, invalidate on config change
**Effort**: Low

#### 5. Pre-allocated Serialization Buffers
**Expected Improvement**: Reduce allocation churn for announcement payloads
**Location**: `src/seeding/availability.rs:52-64`
**Change**: Use buffer pool (e.g., `Arc<RwLock<Vec<Vec<u8>>>>` or `object_pool` crate)
**Effort**: Medium

#### 6. Async-Aware Locking
**Expected Improvement**: Better integration with async runtime, reduced thread blocking
**Location**: Throughout seeding module
**Change**: Replace `std::sync::RwLock` with `tokio::sync::RwLock` where held across await points
**Effort**: Medium (requires async API changes)

### Low Impact (Quick Wins)

#### 7. Use `parking_lot::RwLock`
**Expected Improvement**: ~20% faster lock acquisition/release
**Location**: All RwLock usages in seeding module
**Change**: Replace `std::sync::RwLock` with `parking_lot::RwLock`
**Effort**: Very low (drop-in replacement)

#### 8. Inline Small Methods
**Expected Improvement**: Minor (eliminates function call overhead)
**Location**: `rate_limiter.rs:88-90` (`rate_bytes_per_sec()`)
**Change**: Add `#[inline]` attribute
**Effort**: Trivial

#### 9. Reduce Timestamp Calls
**Expected Improvement**: Avoid repeated syscalls in hot paths
**Location**: `statistics.rs:102-130`
**Change**: Pass timestamp as parameter instead of calling `Instant::now()` multiple times
**Effort**: Low

## Resource Estimates

### Memory (Typical Usage)

| Component | Per-Instance | Typical Total | Notes |
|-----------|--------------|---------------|-------|
| SeedingConfig | ~200 bytes | 200 bytes | Single instance per node |
| SeedingManager | ~400 bytes | 400 bytes | Excludes nested structures |
| TokenBucketLimiter | 48 bytes | 48 bytes | 5 AtomicU64 + Instant |
| SeedingStatistics | ~200 bytes | 200 bytes | Excludes space_stats/samples |
| space_stats HashMap | ~100 bytes × spaces | ~10 KB | Assuming 100 active spaces |
| hourly_samples VecDeque | ~24 bytes × samples | ~86 KB | Max 3600 samples |
| PeerAvailabilityMap | ~64 bytes × entries | ~640 KB | 10,000 entries max |
| pending_announcements | ~36 bytes × pending | **Unbounded** | Risk: no limit |
| **Total (typical)** | - | **~750 KB** | With 100 spaces, moderate activity |

### Storage (Persistent)
Currently no persistent storage. Statistics are in-memory only.
- **If persisted**: ~1 KB per space × active spaces = ~100 KB typical

### Network (Per Announcement Cycle)

| Message | Size | Frequency | Bandwidth |
|---------|------|-----------|-----------|
| AVAILABILITY_ANNOUNCE (max) | 3,242 bytes | Every 5 min | ~10 bytes/sec avg |
| AVAILABILITY_ANNOUNCE (typical) | ~500 bytes | Every 5 min | ~1.7 bytes/sec avg |
| Per content stored | 0 bytes (queued) | On storage | Batched to 5-min cycle |

**Note**: Actual gossip bandwidth depends on number of spaces and content stored.

### CPU (Per Operation)

| Operation | CPU Time (estimated) | Notes |
|-----------|---------------------|-------|
| `try_acquire()` | ~50 ns typical | May spin up to ~1 μs under contention |
| `should_seed()` | ~200 ns typical | 3 lock acquisitions |
| `record_upload()` | ~500 ns typical | Atomic + HashMap update |
| `serialize()` (100 hashes) | ~2 μs | Memory allocation + copy |
| `deserialize()` (100 hashes) | ~3 μs | Validation + allocation |
| `prune_entries()` | ~100 μs at capacity | O(n) scan |

## Benchmark Recommendations

1. **Rate Limiter Stress Test**: 10 threads, each requesting 100K bytes/sec for 60 seconds. Measure actual throughput vs. theoretical.

2. **Statistics Contention Test**: 100 concurrent goroutines recording to 10 spaces. Measure p99 latency.

3. **PeerAvailabilityMap Churn Test**: Fill to capacity, then continuous record+query. Measure latency distribution.

4. **Announcement Serialization Throughput**: Serialize/deserialize 1M payloads. Profile allocations.

5. **End-to-End Seeding Decision**: 100K `should_seed()` calls with varying configurations. Profile lock contention.

---

*Performance Review for Seeding & Availability Feature*
*Reviewer: Performance Expert*
*Date: 2026-01-13*
