# Performance Review: RPC API

## Summary

The RPC API exhibits mixed performance characteristics. While the core request-response pipeline is well-designed using async Rust with hyper, there are significant scalability concerns in several key operations. The storage layer has proper indexing (O(log n) via sled B-trees), but several RPC methods still perform full table scans unnecessarily. The 9,435-line `methods.rs` file creates compilation and maintenance overhead. Memory allocation patterns show excessive cloning, and the lack of connection pooling in the client creates unnecessary TCP overhead.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 17 | 25 | Several O(n) full scans where indexed lookups exist |
| Resource Usage | 18 | 25 | Excessive cloning, no connection pooling, per-request TCP |
| Scalability | 18 | 25 | Bottlenecks in list_spaces, search, get_chain_engagements |
| Optimization Opportunities | 22 | 25 | Good foundation with indexes; many low-hanging fruit |
| **Total** | **75** | **100** | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `dispatch()` | O(1) | Match-based method routing - efficient |
| `get_info()` | O(1) | Simple state reads |
| `get_peers()` | O(p) | p = peer count (typically small) |
| `get_sync_status()` | O(n) | Iterates recent blocks for timestamps (lines 883-895) |
| `get_chain_stats()` | O(s) | `list_spaces().count()` full scan (line 990) |
| `list_spaces()` | O(r + s + c + content) | Iterates root blocks, space registry, content blocks, AND content store (lines 3538-3641) |
| `search()` | O(s + min(500, content)) | Full content store scan with 500 item cap (lines 3471-3508) |
| `list_space_content()` | O(limit + offset) | Uses indexed `get_posts_for_space()` - efficient |
| `list_space_posts()` | O(limit + offset) | Uses indexed lookup - efficient |
| `get_replies()` | O(limit + offset) | Uses `replies_by_parent_index` - efficient |
| `get_chain_engagements()` | O(blocks * actions) | Full content block scan (line 6492) |
| `rebuild_reactions()` | O(blocks * actions) | Full content block scan (line 6633) |
| `verify_action_finalized()` | O(blocks * actions) | Full content block scan (line 6875) |
| `submit_post()` | O(1) | Amortized - adds to mempool |
| `create_space()` | O(1) | Direct registry insert |
| Authentication (signature) | O(1) | Ed25519 verify + SHA256 |
| Authentication (cookie) | O(1) | String comparison (non-constant-time) |
| PoW verification | O(1) | Argon2id verification |

## Bottlenecks Identified

### 1. `list_spaces()` Triple Full Scan
**Location**: `src/rpc/methods.rs:3538-3641`
**Impact**: Becomes problematic at ~1000+ spaces with ~10000+ content items
**Description**: Iterates root blocks, then space registry, then ALL content blocks, then ALL content store items to build space statistics. Each data source is scanned fully.

```rust
// Source 0: Full root block iteration (line 3538)
for result in chain_store.iter_root_blocks() { ... }
// Source 1: Full space registry iteration (line 3587)
for result in chain_store.list_spaces() { ... }
// Source 2: Full content block iteration (line 3606)
for result in chain_store.iter_content_blocks() { ... }
// Source 3: Full content store iteration (line 3627)
for result in content_store.iter_content() { ... }
```

**Mitigation**: Use pre-aggregated space statistics stored in the space registry, or maintain a space_stats index updated on writes.

### 2. `search()` Full Content Scan
**Location**: `src/rpc/methods.rs:3471-3508`
**Impact**: Performance degrades linearly with content count, capped at 500 items
**Description**: Performs naive substring search across all content bodies without any indexing.

```rust
for result in content_store.iter_content() {
    if count >= 500 { break; }
    // Substring match on body_lower
    let matches = search_terms.iter().any(|term| body_lower.contains(term));
}
```

**Mitigation**: Implement full-text search index (tantivy, meilisearch) or at minimum use trigram indexes.

### 3. `get_chain_engagements()` Full Block Scan
**Location**: `src/rpc/methods.rs:6492-6544`
**Impact**: Linear with total actions across all blocks
**Description**: Iterates every content block and every action to aggregate engagement stats.

**Mitigation**: Maintain engagement aggregation index updated on block insertion.

### 4. Client Per-Request TCP Connection
**Location**: `src/rpc/client.rs:142-157`
**Impact**: ~100ms latency overhead per request (TCP handshake)
**Description**: Each `send_request()` opens a new TCP connection via `TcpStream::connect_timeout()`.

```rust
fn send_request(&self, request: &RpcRequest) -> Result<RpcResponse, RpcError> {
    let stream = TcpStream::connect_timeout(&self.config.addr, self.config.timeout)?;
    // ... uses stream for single request
}
```

**Mitigation**: Implement HTTP keep-alive or connection pooling.

### 5. Excessive Data Cloning
**Location**: Multiple locations throughout `methods.rs`
**Impact**: Memory allocation pressure, GC pauses
**Description**: 84 `.clone()` calls across the RPC module. Many clone entire data structures when borrowing would suffice.

**Mitigation**: Use references and lifetime annotations; clone only when ownership transfer is required.

### 6. Large Monolithic File
**Location**: `src/rpc/methods.rs` (9,435 lines)
**Impact**: Slow compilation, difficult maintenance, IDE performance
**Description**: All 63 RPC methods in single file creates compilation bottleneck.

**Mitigation**: Split into category modules: `methods/node.rs`, `methods/content.rs`, `methods/identity.rs`, etc.

## Scalability Concerns

### Horizontal Scaling
- **Not currently supported**: RPC server is single-node bound
- **Blocker**: State stored in local sled database, no distributed coordination
- **Recommendation**: For read scaling, consider read replicas or caching layer

### Vertical Scaling
- **CPU**: Async design scales well with cores for concurrent requests
- **Memory**: No evident memory caps besides `max_body_size` (7MB)
- **Disk I/O**: sled uses memory-mapped files; scales with available RAM

### Concurrent Request Handling
- **Design**: Good - each request handled in separate tokio task
- **Concern**: Long-running operations (search, list_spaces) can block other requests to same node
- **Recommendation**: Add request timeout enforcement

### Data Growth Projections

| Scale | Spaces | Posts | Blocks | Expected `list_spaces()` Time |
|-------|--------|-------|--------|------------------------------|
| Small | 100 | 10K | 100 | ~50ms |
| Medium | 1K | 100K | 1K | ~500ms |
| Large | 10K | 1M | 10K | ~5s (unacceptable) |

## Optimization Recommendations

### High Impact

1. **Pre-aggregate space statistics** (Est. 10x improvement on `list_spaces`)
   - Store `post_count` and `last_activity` directly in space registry
   - Update on content block insertion
   - Eliminates triple full-scan

2. **Add full-text search index** (Est. 100x improvement on `search`)
   - Integrate tantivy or maintain trigram index
   - Index content body on insertion
   - Query index instead of full scan

3. **Client connection pooling** (Est. 2-5x improvement on CLI throughput)
   - Keep TCP connection open for multiple requests
   - Implement HTTP/1.1 keep-alive

### Medium Impact

4. **Cache engagement aggregations** (Est. 50x improvement on `get_chain_engagements`)
   - Maintain `content_hash -> engagement_stats` cache
   - Update incrementally on new engagement actions

5. **Split `methods.rs` into modules** (Improved compile times, maintainability)
   - Create `methods/mod.rs` with category submodules
   - Each category ~500-1000 lines

6. **Add request-level timeouts** (Improved reliability)
   - Enforce max execution time per request
   - Return timeout error rather than hanging

### Low Impact (Quick Wins)

7. **Replace `list_spaces().count()` in `get_chain_stats()`**
   - Use `space_registry.len()` which is O(1) in sled
   - Current: O(n) full iteration

8. **Reduce cloning in hot paths**
   - Profile to identify top cloning sites
   - Use `Arc<T>` or references where possible

9. **Add pagination defaults validation**
   - Cap maximum `limit` parameter (e.g., 1000)
   - Prevent DoS via unbounded result sets

10. **Batch JSON serialization**
    - Use `serde_json::to_writer` instead of `to_vec` for large responses
    - Reduces memory allocation

## Resource Estimates

### Memory Usage (Per Request)
- **Simple queries** (`get_info`, `get_peers`): ~1-5 KB
- **Content queries** (`get_content`, `list_space_posts`): ~10-100 KB
- **Heavy queries** (`list_spaces`, `search`): ~1-10 MB
- **Media upload** (`upload_media`): Up to 7 MB (body limit)

### Storage Access Patterns
- **sled B-tree lookups**: O(log n), ~10-100 microseconds
- **sled prefix scans**: O(k) where k = matching items
- **Full iterations**: O(n), should be avoided in hot paths

### Network Overhead
- **Request overhead**: ~200-500 bytes (JSON-RPC envelope + headers)
- **Response overhead**: ~100-200 bytes (JSON-RPC envelope)
- **Per-request TCP**: ~100ms (should be pooled)
- **CORS preflight**: Cached for 86400 seconds (good)

## Performance Testing Recommendations

1. **Benchmark critical paths**:
   - `list_spaces` with 100/1K/10K spaces
   - `search` with 10K/100K/1M content items
   - `submit_post` under concurrent load

2. **Add performance regression tests**:
   - Track p50/p95/p99 latencies
   - Alert on >20% regression

3. **Profile memory allocation**:
   - Use `heaptrack` or similar to identify allocation hotspots
   - Target: <100MB peak for typical workloads

---

*Generated: 2026-01-12*
*Reviewer: Performance Analysis Agent*
