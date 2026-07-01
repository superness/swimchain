# Performance Review: Feed Client

## Summary

The Feed Client demonstrates **solid foundational performance patterns** with a well-designed three-tier caching system (memory/localStorage/IndexedDB), appropriate use of `useMemo`/`useCallback` for memoization, and IntersectionObserver for efficient infinite scroll. However, there are significant scalability concerns: the feed aggregation fetches all content from all sources upfront without server-side pagination, the FeedList renders all items without virtualization, and media is cached as base64 strings in IndexedDB. These patterns work for typical use (10-20 followed spaces, ~100 items) but will degrade significantly at scale (100+ spaces, thousands of items).

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | O(n) deduplication is good; O(s) parallel fetch is efficient; client-side sort is concerning at scale |
| Resource Usage | 16 | 25 | Base64 media storage wastes 33% space; no virtualization; memory cache unbounded |
| Scalability | 14 | 25 | Fetches all sources upfront; renders all items; no server-side aggregation endpoint |
| Optimization Opportunities | 17 | 25 | Good caching foundation; lazy loading mostly absent; batch opportunities exist |
| **Total** | **65** | **100** | **Grade: D+** |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `fetchFromSources()` | O(s) network, O(n*s) items | Parallel fetch from s spaces, each returning up to 50 items |
| `dedupeAndSort()` | O(n) + O(n log n) | Dedup via Set is O(n), sort is O(n log n) |
| `loadMore()` | O(n) cursor search | Linear scan to find cursor position |
| `getAvatarColor()` | O(k) | k = length of author ID string |
| `isFollowingSpace()` | O(s) | Linear array search via `.some()` |
| `isPostSaved()` | O(p) | Linear array search via `.includes()` |
| `getMediaFromCache()` | O(1) amortized | IndexedDB key lookup |
| `invalidateMemory()` | O(m) | Scans all m memory cache keys |

## Bottlenecks Identified

### 1. **Feed Aggregation Network Fan-Out**
**Location**: `src/hooks/useFeed.ts:184-199`
**Impact**: At 50+ followed spaces, parallel fetches create 50+ concurrent HTTP requests
**Mitigation**: Implement server-side feed aggregation RPC method; add request batching with concurrency limit (e.g., `p-limit`)

```typescript
// Current: 50 parallel requests
const spacePromises = spaces.map(async (space) => {
  return rpc.listSpaceContent(space.id, { limit: FETCH_LIMIT_PER_SOURCE });
});
```

### 2. **Client-Side Memory with Large Feeds**
**Location**: `src/hooks/useFeed.ts:157` (`allItemsRef`)
**Impact**: With 50 spaces * 50 items = 2500 items cached in memory indefinitely
**Mitigation**: Implement LRU eviction for `allItemsRef`; clear on space unfollow

### 3. **Unbounded IndexedDB Media Cache**
**Location**: `src/lib/cache.ts:76-95`
**Impact**: Media cache has no TTL and grows unbounded; 100 images * 1MB = 100MB+ storage
**Mitigation**: Add storage quota monitoring; implement LRU eviction when exceeding threshold

### 4. **Cursor Pagination Edge Case**
**Location**: `src/hooks/useFeed.ts:93-100`
**Impact**: Items with identical timestamps may be skipped or duplicated
**Mitigation**: Use composite cursor (timestamp + id) with proper comparison

```typescript
// Current: Can skip items with same timestamp
const cursorIndex = filtered.findIndex(
  item => item.createdAt <= cursor.timestamp && item.id !== cursor.lastId
);
```

### 5. **Linear Lookup Functions**
**Location**: `src/hooks/useFeedPreferences.ts:213-218, 268-273, 302-304`
**Impact**: `isFollowingSpace()`, `isFollowingUser()`, `isPostSaved()` are O(n) per call
**Mitigation**: Already have computed Sets - use them in lookup functions instead of arrays

### 6. **FeedCard Re-renders on Parent State Change**
**Location**: `src/components/FeedList.tsx:170-181`
**Impact**: When `savedPosts` Set reference changes, all FeedCards re-render
**Mitigation**: Wrap FeedCard in `React.memo()` with custom comparison; use stable Set reference

## Scalability Concerns

1. **No Server-Side Aggregation**: Feed is built entirely client-side by fetching from each followed space. This doesn't scale beyond ~50 spaces due to:
   - Network latency (50+ parallel requests)
   - Client memory (2500+ items)
   - Processing time (dedup + sort)

2. **No Virtualization for Long Lists**: FeedList renders all items; at 500+ items, DOM node count causes scroll jank

3. **Base64 Media Encoding**: Media stored and transmitted as base64 increases size by ~33%; no streaming

4. **Single-User Design**: Feed preferences in localStorage don't sync across devices; no shared state

5. **PoW Mining Blocks Main Thread**: `usePow` runs mining in batches via setTimeout but still blocks between batches:
   ```typescript
   // Mining blocks UI between batches
   setTimeout(mineNextBatch, 0); // 10k hashes, then yield
   ```

## Optimization Recommendations

### High Impact

1. **Implement Server-Side Feed Aggregation**
   - Add `get_aggregated_feed` RPC method to node
   - Accept list of space IDs, return merged & sorted results
   - Expected improvement: 50 requests -> 1 request

2. **Add List Virtualization**
   - Use `react-window` or `react-virtualized` for FeedList
   - Only render visible items + buffer
   - Expected improvement: 500 DOM nodes -> ~20 visible

3. **Move PoW to Web Worker**
   - Mining should not block main thread at all
   - Use `new Worker()` with WASM
   - Expected improvement: No UI jank during mining

### Medium Impact

4. **Implement Request Batching/Throttling**
   - Use `p-limit` with concurrency of 6-10
   - Prevents browser connection limits
   - Expected improvement: More predictable loading

5. **Add Media Cache Eviction**
   - Track total cache size via `getCacheStats()`
   - Evict LRU entries when exceeding 50MB
   - Expected improvement: Bounded storage growth

6. **Use Computed Sets for Lookups**
   - Replace `preferences.followedSpaces.some()` with `followedSpaceIds.has()`
   - Already computed but not used in lookup functions
   - Expected improvement: O(n) -> O(1) lookups

7. **Memoize FeedCard Component**
   ```typescript
   export const FeedCard = React.memo(FeedCardInner, (prev, next) => {
     return prev.item.id === next.item.id &&
            prev.isSaved === next.isSaved &&
            prev.compact === next.compact;
   });
   ```
   - Expected improvement: Fewer re-renders on scroll/save

### Low Impact (Quick Wins)

8. **Add `loading="lazy"` to Media Images** (already done in FeedCard.tsx:193)

9. **Debounce Feed Refresh on Preference Changes**
   - Current: Immediate refetch on any follow/unfollow
   - Add 500ms debounce for batched preference changes
   - Expected improvement: Fewer redundant fetches

10. **Use `requestIdleCallback` for Cache Cleanup**
    - Run `clearDecryptedMediaCache()` during idle time
    - Expected improvement: No jank on passphrase clear

11. **Preload Critical WASM**
    - Add `<link rel="preload">` for WASM binary
    - Expected improvement: Faster initial load

## Resource Estimates

### Memory Usage (Typical)

| Component | Estimate | Notes |
|-----------|----------|-------|
| FeedItems (100 items) | ~200KB | ~2KB per item with metadata |
| FeedItems (500 items) | ~1MB | At scale limit |
| Memory Cache | ~500KB | Spaces + threads with TTL |
| WASM Module | ~500KB | Loaded once |
| React Component Tree | ~2MB | 100 mounted FeedCards |
| **Total Typical** | **~3-4MB** | |

### Storage Usage (IndexedDB + localStorage)

| Store | Estimate | Growth |
|-------|----------|--------|
| Media Cache | 0-100MB | Unbounded (concern) |
| Content Cache | ~5MB | 5min TTL, auto-evicts |
| localStorage | ~100KB | Preferences, identity |
| **Total** | **~10-100MB** | |

### Network Usage (Per Feed Load)

| Scenario | Requests | Data |
|----------|----------|------|
| 5 followed spaces | 5 | ~250KB (50 items/space) |
| 20 followed spaces | 20 | ~1MB |
| 50 followed spaces | 50 | ~2.5MB |

### Bundle Size (Estimated)

| Chunk | Size (gzip) |
|-------|-------------|
| React + React DOM | ~45KB |
| React Router | ~15KB |
| WASM Binary | ~150KB |
| Application Code | ~80KB |
| CSS | ~15KB |
| **Total** | **~305KB** |

## Profiling Recommendations

1. **React DevTools Profiler**: Record feed scroll to identify unnecessary re-renders
2. **Chrome DevTools Memory**: Snapshot before/after loading 500 items
3. **Lighthouse**: Check bundle size impact on First Contentful Paint
4. **IndexedDB Inspector**: Monitor media cache growth over time

## Additional Code-Level Findings

### Good Patterns Verified in Implementation

1. **Efficient Deduplication** (`useFeed.ts:69-77`)
   ```typescript
   const seen = new Set<string>();
   for (const item of items) {
     if (!seen.has(item.id) && (item.body || item.title)) {
       seen.add(item.id);
       unique.push(item);
     }
   }
   ```
   - O(1) Set lookup per item; O(n) total - optimal

2. **Proper Memoization in FeedCard** (`FeedCard.tsx:91-95`)
   ```typescript
   const timeAgo = useMemo(() => formatTimeAgo(item.createdAt), [item.createdAt]);
   const avatarColor = useMemo(() => getAvatarColor(item.authorId), [item.authorId]);
   ```
   - All computed values properly memoized

3. **IntersectionObserver Configuration** (`FeedList.tsx:144-148`)
   ```typescript
   observerRef.current = new IntersectionObserver(observerCallback, {
     root: null,
     rootMargin: '200px', // Load more when 200px from bottom
     threshold: 0,
   });
   ```
   - 200px rootMargin provides good prefetch buffer

4. **TTL-Based Cache Expiration** (`cache.ts:124-127`)
   - Content cache has 5-minute TTL
   - Memory cache checks TTL on access
   - localStorage cache has configurable TTL

5. **Signature Authentication** (`rpc.ts:210-227`)
   - Uses Web Crypto API for SHA-256 (hardware-accelerated)
   - Async/non-blocking signature computation

### Patterns Needing Improvement

1. **No React.memo on FeedCard**
   - FeedCard is rendered in a list but not memoized
   - Any parent state change (savedPosts Set) causes all cards to re-render
   - **Fix**: `export const FeedCard = React.memo(FeedCardComponent)`

2. **Console.log in Production** (`rpc.ts:230-238, 259, 268`)
   - 20+ console.log statements for RPC debugging
   - **Impact**: Slight performance overhead; log noise in production
   - **Fix**: Use conditional logging or remove for production

3. **Dynamic Imports Not Centralized** (`useRpc.tsx:393, 613, 943, 1413, 1477, 1531`)
   - Cache and action-pow imported dynamically in multiple hooks
   - Each import adds async overhead
   - **Fix**: Import once at module level or create a single dynamic loader

4. **No Route-Level Code Splitting** (`App.tsx`)
   - All page components imported synchronously
   - No `React.lazy()` usage for routes
   - **Fix**: `const Feed = lazy(() => import('./pages/Feed'))`

5. **Image Error State Creates New Object** (`FeedCard.tsx:105-107`)
   ```typescript
   setImageError(prev => ({ ...prev, [hash]: true }));
   ```
   - Creates new object on every image error
   - Minor but accumulates with many images

### PoW Mining Performance (`usePow.ts:57-114`)

The PoW mining implementation uses a batched approach:
- **Batch Size**: 10,000 hashes per batch
- **Yielding**: `setTimeout(mineNextBatch, 0)` after each batch
- **Issue**: Still blocks main thread for ~10-50ms per batch
- **Recommendation**: Move to Web Worker for true non-blocking mining

```typescript
// Current: Blocks main thread between batches
const BATCH_SIZE = 10000n; // 10k hashes per batch
// ... mining code ...
setTimeout(mineNextBatch, 0); // Yields, but still runs on main thread
```

### RPC Request Performance (`rpc.ts:197-297`)

Each RPC request includes:
1. SHA-256 hash of params (Web Crypto API - fast)
2. Ed25519 signature via WASM (fast)
3. Fetch with 30-second timeout

**Potential Issue**: No request deduplication
- Same content fetched by multiple components = multiple identical requests
- **Fix**: Add request deduplication layer (SWR pattern)

### Cache Layer Performance Summary

| Layer | Read Latency | Write Latency | Eviction |
|-------|-------------|---------------|----------|
| Memory | ~1μs | ~1μs | TTL only (no size limit) |
| localStorage | ~100μs | ~500μs | TTL only |
| IndexedDB | ~1-5ms | ~5-10ms | Manual only |

**Bottleneck**: IndexedDB async overhead for media; consider Web Workers for cache operations.

## Conclusion

The Feed Client has a solid foundation with proper caching and memoization patterns. The primary scaling limitation is the client-side-only feed aggregation model. For production use with users following 50+ spaces, server-side aggregation should be prioritized. The unbounded media cache is a storage risk that should be addressed before launch.

### Priority Actions

1. **P0 (Critical for Scale)**: Implement server-side feed aggregation
2. **P0 (Critical for UX)**: Move PoW mining to Web Worker
3. **P1 (Important)**: Add list virtualization with react-virtuoso
4. **P1 (Important)**: Add React.memo to FeedCard
5. **P2 (Moderate)**: Implement media cache LRU eviction
6. **P2 (Moderate)**: Add route-level code splitting
7. **P3 (Minor)**: Remove console.log statements for production

---
*Performance Review Updated: 2026-01-12*
*Reviewer: Performance Expert Agent*
