# Performance Review: Analytics Client

## Summary

The Analytics Client demonstrates good foundational performance architecture with its singleton service pattern, background polling, and Map-based caching. However, **critical scaling issues** exist: the O(n*m) content fetching algorithm that issues sequential API calls per space, unbounded array growth for alerts and history, and missing pagination will cause performance degradation at network scale. The read-only nature and minimal bundle help, but network I/O patterns are the primary bottleneck.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 14 | 25 | O(n*m) network calls; sorting/filtering well-implemented |
| Resource Usage | 17 | 25 | Good caching; unbounded arrays; localStorage sync concerns |
| Scalability | 12 | 25 | Sequential API calls; no pagination; single-node only |
| Optimization Opportunities | 20 | 25 | Many low-hanging fruit available |
| **Total** | **63** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `fetchNetworkStats()` | O(n*m) | MetricsCollector.ts:394-453 | n spaces * m posts per space; sequential inner loop |
| `collectWatchedSpaces()` | O(k) | MetricsCollector.ts:206-219 | k watched spaces; sequential await in loop |
| `createHeatDistribution()` | O(n) | types/index.ts:245-284 | Filter 10x over heat values; could be O(n) single pass |
| `updateRecentPosts()` | O(n log n) | MetricsCollector.ts:259-275 | Array merge + sort + slice |
| `checkAlerts()` | O(a) | MetricsCollector.ts:300-349 | Linear scan of alerts array for dedup |
| `aggregateHeat` (Dashboard) | O(s*b) | Dashboard.tsx:34-41 | s spaces * b buckets (10); computed every render |
| `sortedSpaces` (Spaces) | O(n log n) | Spaces.tsx:14-17 | Sort on every render without memoization |
| `spacePosts.filter()` | O(p) | SpaceDetail.tsx:15 | Filter all posts on every render |

## Bottlenecks Identified

### 1. **Sequential API Calls in Network Stats**
**Location**: `MetricsCollector.ts:420-435`
**Code Pattern**:
```typescript
for (const space of spaces.spaces) {
  totalPosts += space.post_count;
  try {
    const content = await this.rpcClient.listSpaceContent(space.space_id);
    for (const item of content.items) {
      // Process each item
    }
  } catch { /* ... */ }
}
```
**Impact**: At 100 spaces with 30s timeout, worst case = 50+ minutes per poll cycle
**Scale Threshold**: >10 spaces noticeably degrades; >50 spaces becomes unresponsive
**Mitigation**: Use `Promise.all()` with batching (e.g., 10 concurrent requests)

### 2. **Unbounded Alert Array Growth**
**Location**: `MetricsCollector.ts:339-348`
**Impact**: Memory leak over long sessions; `alerts.filter()` slows linearly
**Scale Threshold**: >1000 alerts (achievable over 24h with flapping metrics)
**Mitigation**: Add `MAX_ALERTS` constant; trim oldest acknowledged alerts

### 3. **No Pagination on Content Queries**
**Location**: `rpc.ts:170-181`
**Impact**: Large spaces return all content; memory spikes; slow responses
**Scale Threshold**: >1000 posts per space
**Mitigation**: Add `limit`/`offset` parameters; implement virtual scrolling

### 4. **Synchronous localStorage Operations**
**Location**: `MetricsCollector.ts:87-117`
**Impact**: Blocks main thread; JSON.stringify/parse for large history arrays
**Scale Threshold**: History at max (288 points) = ~15KB; acceptable but wasteful
**Mitigation**: Debounce saves; consider IndexedDB for larger datasets

### 5. **Missing React Memoization**
**Location**: `Dashboard.tsx:34-41`, `Spaces.tsx:14-17`
**Impact**: Expensive computations run every render
**Scale Threshold**: Noticeable with >100 spaces or frequent updates
**Mitigation**: Wrap in `useMemo()` with proper dependencies

## Scalability Concerns

### Vertical Scaling Limits
- **Single RPC endpoint**: Hard-coded `localhost:3030`; no load balancing
- **Single-threaded polling**: All network calls block each other
- **Browser memory**: No streaming; entire response loaded into memory

### Horizontal Scaling Blockers
- **No multi-node support**: Cannot aggregate from multiple nodes
- **No data sharding**: All spaces processed by single collector
- **WebSocket missing**: Polling only; no push-based updates

### Expected Load vs. Design Capacity

| Metric | Current Design | Estimated Limit | Notes |
|--------|----------------|-----------------|-------|
| Concurrent spaces | All sequential | ~10-20 smoothly | Beyond this, poll interval exceeded |
| Posts per space | Unbounded fetch | ~500 before lag | No pagination |
| History points | 288 (capped) | Good | Properly bounded |
| Active alerts | Unbounded | ~100 before impact | Need pruning |
| Watched spaces | Unlimited config | Same as spaces | Config UI may lag |

## Optimization Recommendations

### High Impact

1. **Parallelize Space Content Fetching**
   - **Current**: Sequential `await` in for-loop
   - **Proposed**: `Promise.all()` with concurrency limit (e.g., 5-10)
   - **Expected Improvement**: 5-10x faster network stats collection
   - **Effort**: Low (refactor single function)
   ```typescript
   // Batch into groups of 5
   const batches = chunk(spaces.spaces, 5);
   for (const batch of batches) {
     await Promise.all(batch.map(s => processSpace(s)));
   }
   ```

2. **Add API Pagination**
   - **Current**: `listSpaceContent()` returns all items
   - **Proposed**: Add `?limit=50&offset=0` support
   - **Expected Improvement**: Bounded memory; faster initial load
   - **Effort**: Medium (requires backend changes)

3. **Implement Content Caching with TTL**
   - **Current**: Fresh fetch every poll interval
   - **Proposed**: Cache content by space with 30-60s TTL; only refetch changed
   - **Expected Improvement**: 50-80% reduction in API calls for stable spaces
   - **Effort**: Medium

### Medium Impact

4. **Add React.memo and useMemo**
   - **Locations**:
     - `Dashboard.tsx:34-41` - aggregateHeat calculation
     - `Spaces.tsx:14-17` - sortedSpaces
     - Component props that don't change frequently
   - **Expected Improvement**: Reduced re-render overhead
   - **Effort**: Low

5. **Cap Alert Array Size**
   - **Current**: Unbounded
   - **Proposed**: `MAX_ALERTS = 100`; FIFO for acknowledged
   - **Expected Improvement**: Bounded memory; consistent filter performance
   - **Effort**: Low

6. **Optimize Heat Distribution Calculation**
   - **Current**: 10 separate `.filter()` calls in `createHeatDistribution()`
   - **Proposed**: Single pass with bucket assignment
   - **Expected Improvement**: O(n) instead of O(10n)
   - **Effort**: Low
   ```typescript
   for (const heat of heatValues) {
     const bucket = Math.min(9, Math.floor(heat / 10));
     buckets[bucket].count++;
   }
   ```

7. **Debounce localStorage Writes**
   - **Current**: Sync write on every history snapshot
   - **Proposed**: Debounce 1-2 seconds; batch writes
   - **Expected Improvement**: Reduced main thread blocking
   - **Effort**: Low

### Low Impact (Quick Wins)

8. **Move formatNumber/formatPercent Outside Component**
   - **Current**: Recreated every render in Dashboard.tsx
   - **Proposed**: Module-level pure functions
   - **Expected Improvement**: Minor; cleaner code
   - **Effort**: Trivial

9. **Add Loading States During Refresh**
   - **Current**: Button disabled but no visual feedback
   - **Proposed**: Spinner or progress indicator
   - **Expected Improvement**: Better perceived performance
   - **Effort**: Low

10. **Lazy Load SpaceDetail Page**
    - **Current**: Bundled with main chunk
    - **Proposed**: `React.lazy()` with Suspense
    - **Expected Improvement**: Faster initial load
    - **Effort**: Low

## Resource Estimates

### Memory Usage (Typical Operation)
| Component | Estimate | Notes |
|-----------|----------|-------|
| React app baseline | ~5-10 MB | React, ReactDOM, router |
| MetricsCollector singleton | ~500 KB | Depends on space count |
| Health history (288 points) | ~15 KB | JSON-serializable |
| Space metrics (100 spaces) | ~200 KB | Map with distributions |
| Recent posts (50) | ~20 KB | Capped array |
| Alerts (uncapped) | 1-100 KB | Depends on session length |
| **Total typical** | **~6-11 MB** | |

### Network Usage (Per Poll Cycle)
| Request | Size | Frequency | Notes |
|---------|------|-----------|-------|
| `/info` | ~200 bytes | Once on connect | |
| `/sync/status` | ~300 bytes | Every poll | |
| `/peers` | ~1-5 KB | Every poll | Depends on peer count |
| `/spaces` | ~2-20 KB | Every poll | List all spaces |
| `/spaces/:id/content` | ~5-50 KB each | Per watched space | **Bottleneck** |

**30-second poll with 10 spaces**: ~50-500 KB/cycle = ~100 KB-1 MB/minute

### Storage Usage
| Key | Max Size | Location |
|-----|----------|----------|
| `analytics-config` | ~500 bytes | localStorage |
| `analytics-history` | ~15 KB | localStorage |
| `analytics-watched-spaces` | ~2 KB | localStorage |
| **Total** | **~20 KB** | localStorage limit is 5-10 MB |

## Bundle Analysis Recommendations

The dependency list is lean:
- `react`, `react-dom`, `react-router-dom` - Standard React stack
- `@swimchain/core`, `@swimchain/react` - Local packages (verify tree-shaking)
- `hash-wasm` - ~50 KB; verify if used (PoW for read-only client?)

**Suggested Bundle Optimizations**:
1. Verify `hash-wasm` is needed (doc mentions read-only, no PoW required)
2. Enable code splitting for routes (Settings, SpaceDetail, Spaces)
3. Add `vite-plugin-compression` for gzip/brotli
4. Consider removing `@swimchain/core` if only RPC client is used

## Performance Testing Gaps

The client has **zero tests** including zero performance tests. Recommended additions:

1. **Unit tests for expensive operations**:
   - `createHeatDistribution()` with 1000+ items
   - `updateRecentPosts()` with merge/sort

2. **Integration tests**:
   - Poll cycle timing under load
   - Memory profile over 24h simulation

3. **Load tests**:
   - 100 spaces response handling
   - Concurrent refresh operations

---

**Review Date**: 2026-01-12
**Reviewer**: Performance Analysis Agent
**Next Review**: After pagination implementation
