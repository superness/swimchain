# Performance Review: API Layer

## Summary

The API Layer demonstrates solid performance characteristics for typical usage patterns with O(1) operations for core queries and efficient event broadcasting via tokio channels. However, critical performance concerns include the CPU-intensive PoW computation (blocking), disabled anti-abuse rate limiting (no protection against abuse), and RwLock contention potential under high subscriber counts. The architecture is well-suited for moderate loads but requires attention for production-scale deployments.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 20 | 25 | Core operations O(1), but PoW is O(2^difficulty) and blocking |
| Resource Usage | 18 | 25 | Good memory patterns, but RwLock contention possible |
| Scalability | 16 | 25 | Event broadcast is O(n) subscribers; no batch APIs |
| Optimization Opportunities | 20 | 25 | Many quick wins available |
| **Total** | **74** | **100** | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `get_content()` | O(1) | Single storage lookup + O(1) decay calculation |
| `get_sync_status()` | O(1) | Returns placeholder (no actual work) |
| `calculate_decay_state()` | O(1) | Pure math: `0.5^(t/half_life)` |
| `get_pool_for_content()` | O(1) | Single pool manager lookup |
| `create_post()` / `create_reply()` | O(2^d) | PoW mining where d=difficulty (20-22 bits) |
| `subscribe()` | O(1) | Creates new broadcast receiver |
| `emit_event()` | O(n) | Clones event to n subscribers |
| `validate_content_format()` | O(len) | Linear scan of content for video MIME detection |
| `is_video_content()` | O(1) | Fixed set of MIME/extension checks |

## Bottlenecks Identified

### 1. **PoW Computation is Blocking**
**Location**: `src/api/commands.rs:105-145`, `src/crypto/action_pow.rs:382-412`
**Impact**: Post creation blocks the calling thread for 15-60 seconds at production difficulty
**Mitigation**:
- PoW should run in a background task with async/await
- Consider web worker offloading for browser contexts
- Test config uses 1MB memory vs 64MB production (may mask real-world perf)

### 2. **RwLock Contention on Storage**
**Location**: `src/api/queries.rs:63-72`
**Impact**: Under high read load, `storage.read()` may contend with write operations
**Scale**: Becomes noticeable with >100 concurrent readers and frequent writes
**Mitigation**:
- Consider read-through cache for hot content
- Use dashmap or other concurrent map for frequently accessed items

### 3. **Event Broadcasting is O(n) Subscribers**
**Location**: `src/api/subscription.rs:47-49`
**Impact**: Each event is cloned to every subscriber; with 1000 subscribers, each event creates 1000 clones
**Scale**: Event broadcast overhead grows linearly with subscriber count
**Mitigation**:
- Consider tiered event filtering so subscribers only receive relevant events
- Implement event batching for high-frequency events (PoW progress)

### 4. **No Rate Limiting (Anti-Abuse Disabled)**
**Location**: `src/api/mod.rs:75-76` - `anti_abuse.rs` commented out
**Impact**: No protection against API abuse; attackers could flood with queries
**Scale**: First request at high load - system unprotected
**Mitigation**: Re-enable and update `AntiAbuseHandler` (709 lines ready but disabled)

### 5. **Query Timeout Not Enforced**
**Location**: `src/api/config.rs:10` - `query_timeout_ms` unused
**Impact**: Slow storage operations can block indefinitely
**Scale**: Any storage slowdown cascades to API layer
**Mitigation**: Wrap storage calls with `tokio::time::timeout()`

## Scalability Concerns

### Vertical Scaling Limits
- **Memory**: PoW uses 64MB per computation; concurrent posts multiply this
- **CPU**: Single-threaded PoW mining is CPU-bound; Argon2id is intentionally slow
- **Locks**: RwLock on `StorageManager` and `PoolManager` creates serialization points

### Horizontal Scaling Challenges
- **Event Consistency**: `SubscriptionManager` is local; no cross-node event propagation
- **State Sharing**: `StorageManager` is node-local with no distributed cache
- **No Batch APIs**: Each content fetch is individual; no multi-get operations

### Expected Load Analysis

| Load Level | Concurrent Users | Events/sec | Concern |
|------------|-----------------|------------|---------|
| Low | <100 | <10 | None |
| Medium | 100-1000 | 10-100 | RwLock contention starts |
| High | 1000-10000 | 100-1000 | Event broadcasting bottleneck |
| Very High | >10000 | >1000 | System needs redesign |

## Optimization Recommendations

### High Impact

1. **Make PoW Computation Async**
   - Move PoW to `spawn_blocking` or dedicated thread pool
   - Return immediately with a job ID, notify via event when complete
   - Expected improvement: Unblocks API for 15-60 seconds per post

2. **Re-Enable Anti-Abuse Module**
   - Update `AntiAbuseHandler` APIs to match current interfaces
   - Provides rate limiting, repetition detection, pattern matching
   - Expected improvement: Prevents abuse-based resource exhaustion

3. **Add Batch Query APIs**
   - `get_contents(ids: &[ContentId])` - single lock acquisition for multiple reads
   - `get_space_content(space_id, limit, offset)` - paginated listing
   - Expected improvement: 10-100x reduction in lock contention for listing views

### Medium Impact

4. **Implement Content Cache**
   - LRU cache for recently accessed `ContentItem`
   - Bypass storage lock for cache hits
   - Expected improvement: 50-90% reduction in storage reads for hot content

5. **Add Event Filtering at Subscribe Time**
   - `subscribe_filtered(event_types: &[EventType])`
   - Only send relevant events to each subscriber
   - Expected improvement: Reduce clone overhead proportionally

6. **Enforce Query Timeouts**
   - Wrap storage operations with configurable timeout
   - Prevents cascading failures from slow storage
   - Expected improvement: Bounded latency guarantees

### Low Impact (Quick Wins)

7. **Pre-allocate Vectors in Commands**
   - `Vec::with_capacity(104)` for `derive_content_id` preimage
   - Already mostly done at line 247: `Vec::with_capacity(32 + 32 + 32 + 8)`
   - Expected improvement: Minor allocation reduction

8. **Cache `current_timestamp()` per Request**
   - Multiple calls to `SystemTime::now()` in single request path
   - Cache at request start and reuse
   - Expected improvement: Minor syscall reduction

9. **Use `Cow` for Event Data**
   - Event fields like `String` in errors could use `Cow<'static, str>`
   - Reduces allocation for static messages
   - Expected improvement: Minor allocation reduction

10. **Inline Hot Validation Functions**
    - `is_video_content()` and `validate_text()` are simple and frequently called
    - Consider `#[inline]` hints
    - Expected improvement: Minor function call overhead reduction

## Resource Estimates

### Memory

| Component | Typical | Peak | Notes |
|-----------|---------|------|-------|
| ApiClient | ~1KB | ~1KB | Fixed size structs |
| QueryHandler | ~200B | ~200B | Arc references only |
| CommandHandler | ~500B | ~500B | Identity + config |
| SubscriptionManager | 100 * 200B = 20KB | Configurable buffer | 100 events buffered |
| PoW Computation | 1MB (test) / 64MB (prod) | Per concurrent mining | Memory-hard by design |
| Event Clone | ~200B each | n * 200B | Per subscriber per event |

**Total baseline**: ~25KB + 64MB per active PoW

### Storage (I/O)

| Operation | Read Bytes | Write Bytes | Notes |
|-----------|------------|-------------|-------|
| get_content | ~500B | 0 | Single item fetch |
| create_post | 0 | 0 | Commands don't store (bug!) |
| subscribe | 0 | 0 | In-memory only |

### Network (Event Broadcasting)

| Subscribers | Events/sec | Bandwidth | Notes |
|-------------|-----------|-----------|-------|
| 10 | 10 | ~20KB/s | Comfortable |
| 100 | 10 | ~200KB/s | Moderate |
| 1000 | 10 | ~2MB/s | Heavy |
| 1000 | 100 | ~20MB/s | Critical |

## Critical Performance Issues Summary

1. **PoW blocks calling thread for 15-60 seconds** - Must be made async
2. **No rate limiting** - Anti-abuse module disabled leaves system vulnerable
3. **Commands don't store content** - Unclear performance benefit from this split
4. **No batch queries** - Forces N+1 query patterns in consumers
5. **Event broadcast is O(n)** - Will become bottleneck at scale

## Recommendations Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Re-enable anti-abuse | Medium | High |
| P0 | Async PoW | Medium | High |
| P1 | Batch query APIs | Medium | High |
| P1 | Enforce query timeouts | Low | Medium |
| P2 | Content cache | Medium | Medium |
| P2 | Event filtering | Medium | Medium |
| P3 | Inline optimizations | Low | Low |
