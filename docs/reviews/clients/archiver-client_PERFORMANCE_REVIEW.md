# Performance Review: Archiver Client

## Summary
The Archiver Client exhibits reasonable performance for typical use cases (hundreds of archive entries, few monitored spaces), but has significant scalability concerns that will manifest with larger datasets. Key issues include O(n) full-table scans for search, excessive polling intervals, missing React memoization, and N+1 RPC query patterns. The architecture is solid but needs optimization before handling thousands of entries or high-frequency updates.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 16 | 25 | O(n) search, O(n) counting, O(n²) grouping allocations |
| Resource Usage | 17 | 25 | 1s polling, missing memoization, full data re-fetches |
| Scalability | 15 | 25 | N+1 RPC queries, unbounded IndexedDB loads |
| Optimization Opportunities | 17 | 25 | Many quick wins available but not implemented |
| **Total** | **65** | **100** | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `searchArchive()` | O(n) | Full-table scan, loads all entries into memory |
| `getArchivedContent()` | O(n) | IndexedDB `getAll()` loads entire store |
| `groupedBySpace` in ArchivedContent | O(n) | Creates new arrays per group |
| `getAtRiskContent()` | O(s × c) | s = spaces, c = content per space (N+1 queries) |
| `criticalCount/warningCount` calculation | O(2n) | Two separate `.filter()` calls on every render |
| `useNetworkStats` space iteration | O(s × c) | Fetches content for every space sequentially |
| Priority calculation | O(1) | Efficient single-pass formula |
| IndexedDB entry lookup | O(1) | Indexed by primary key |
| Budget state operations | O(1) | localStorage read/write |

## Bottlenecks Identified

### 1. BudgetMeter 1-Second Polling
**Location**: `src/components/BudgetMeter.tsx:16-23`
```typescript
const interval = setInterval(() => {
  setUsed(engine.getUsedBudget());
  setLimit(engine.getBudgetLimit());
}, 1000);
```
**Impact**: Causes 60 React re-renders per minute even when budget hasn't changed. Triggers cascade re-renders in parent components without memoization.
**Mitigation**: Use event subscription pattern from `AutoEngageEngine` instead of polling, or increase interval to 5-10 seconds.

### 2. Full-Table Scan for Archive Search
**Location**: `src/services/ArchiveStorage.ts:201-212`
```typescript
async searchArchive(query: string): Promise<ArchiveEntry[]> {
  const all = await this.getArchivedContent();  // Loads ALL entries
  const lowerQuery = query.toLowerCase().trim();
  return all.filter((entry) =>
    entry.title.toLowerCase().includes(lowerQuery) ||
    entry.body.toLowerCase().includes(lowerQuery)
  );
}
```
**Impact**: At 10,000 entries with 5KB average body, this loads ~50MB into memory per search. Becomes slow above ~1,000 entries.
**Mitigation**: Use IndexedDB cursor-based search, or implement full-text search index (e.g., `flexsearch` or `lunr`).

### 3. N+1 RPC Query Pattern in ContentMonitor
**Location**: `src/services/ContentMonitor.ts:120-153`
```typescript
for (const spaceId of spaces) {
  const result = await this.rpcClient.listSpaceContent(spaceId);
  // ...
}
```
**Impact**: Sequential HTTP requests per space. At 10 spaces × 200ms latency = 2 second delay. Blocks UI during polling.
**Mitigation**: Use `Promise.all()` for parallel fetches, or batch API endpoint if available.

### 4. Unbounded IndexedDB Loads
**Location**: `src/hooks/useArchiveStorage.ts:85-88`
```typescript
const [newStats, newEntries] = await Promise.all([
  storage.getStats(),
  storage.getArchivedContent(spaceId),  // Loads all entries
]);
```
**Impact**: No pagination. Loading 50,000 entries (at storage budget of 50GB) will consume significant memory and cause jank.
**Mitigation**: Implement cursor-based pagination or virtual list rendering.

### 5. Missing React Memoization
**Location**: `src/hooks/useContentMonitor.ts:58-59`
```typescript
const criticalCount = atRiskContent.filter((c) => c.urgency === 'critical').length;
const warningCount = atRiskContent.filter((c) => c.urgency === 'warning').length;
```
**Impact**: Re-calculated on every render even if `atRiskContent` unchanged. Two O(n) passes.
**Mitigation**: Wrap in `useMemo()` with `[atRiskContent]` dependency.

### 6. Array Spreading in Grouping
**Location**: `src/pages/ArchivedContent.tsx:27-30`
```typescript
for (const entry of displayEntries) {
  const existing = groups.get(entry.spaceId) ?? [];
  groups.set(entry.spaceId, [...existing, entry]);  // O(n) copy per entry
}
```
**Impact**: Creates O(n²) allocations in worst case (all entries in same space). At 10,000 entries this creates ~50 million array operations.
**Mitigation**: Use `push()` instead of spreading: `existing.push(entry)`.

## Scalability Concerns

### Data Volume Scaling
- **Current**: Works well at <1,000 archive entries
- **Problem**: `getArchivedContent()` loads entire dataset for every operation
- **At 10,000 entries**: ~50MB memory spike, 1-2 second load times
- **At 50,000 entries**: May exceed browser memory limits

### Space Count Scaling
- **Current**: Hardcoded to 3 mock spaces
- **Problem**: Sequential RPC calls in `getAtRiskContent()`
- **At 50 spaces**: 50× sequential API calls = 10+ second polling cycles

### Concurrent Users (Same Node)
- **Current**: Single client assumed
- **Problem**: 60-second polling creates steady RPC load
- **At 10 clients**: 10 RPC/min each = 100+ RPC calls/min to node

### Real-Time Update Frequency
- **Current**: 60-second content polling, 1-second budget polling
- **Problem**: Budget polling too frequent; content polling may be too slow for time-sensitive archiving
- **Recommendation**: Budget should use events; content polling should be configurable

## Optimization Recommendations

### High Impact

1. **Replace BudgetMeter polling with event subscription** (+10-15% fewer re-renders)
   - Modify `AutoEngageEngine` to emit events on budget change
   - Subscribe in component instead of 1-second interval
   - Expected improvement: Eliminates 60 unnecessary re-renders/minute

2. **Parallelize RPC calls in ContentMonitor** (+50-80% faster polling)
   ```typescript
   const results = await Promise.all(
     spaces.map(spaceId => this.rpcClient.listSpaceContent(spaceId))
   );
   ```
   - Expected improvement: 10 spaces goes from 2s to 200ms

3. **Implement pagination for archive listing** (+90% memory reduction for large datasets)
   - Use IndexedDB cursor with limit/offset
   - Return paginated results to UI
   - Add virtual scrolling with `react-window` or similar

4. **Add full-text search index** (+95% faster search)
   - Index entries on insert using `flexsearch` or similar
   - Query index instead of full-table scan
   - Estimated search time: <10ms for 10,000 entries

### Medium Impact

1. **Memoize derived values in hooks**
   ```typescript
   const criticalCount = useMemo(
     () => atRiskContent.filter((c) => c.urgency === 'critical').length,
     [atRiskContent]
   );
   ```

2. **Fix O(n²) array spreading in grouping**
   ```typescript
   for (const entry of displayEntries) {
     if (!groups.has(entry.spaceId)) groups.set(entry.spaceId, []);
     groups.get(entry.spaceId)!.push(entry);
   }
   ```

3. **Add React.memo to list item components**
   - `AtRiskList` re-renders all items on any state change
   - Extract item into memoized component

4. **Debounce search input**
   - Currently requires button click (good)
   - If changed to real-time, add 300ms debounce

### Low Impact (Quick Wins)

1. **Increase budget polling interval to 5 seconds** (trivial change)
   - Budget rarely changes between seconds
   - Reduces re-renders by 80%

2. **Cache formatBytes results**
   - Called on every render with same inputs
   - Use memoization or cache

3. **Use `useCallback` for event handlers in ArchivedContent**
   - `handleSearch`, `handleClearSearch`, `handleDelete` recreated each render

4. **Add `loading` state during search operations**
   - Prevent multiple concurrent searches
   - Show loading indicator

## Resource Estimates

### Memory Usage (Typical)
| Component | Estimate | Notes |
|-----------|----------|-------|
| React component tree | 2-5 MB | Standard React overhead |
| IndexedDB entries (1000) | 5-10 MB | ~5KB per entry average |
| At-risk content array | 0.5-2 MB | Depends on monitored spaces |
| WASM modules | 1-3 MB | Crypto/PoW modules |
| **Total (typical)** | **10-20 MB** | |

### Memory Usage (Large Dataset)
| Scenario | Estimate | Notes |
|----------|----------|-------|
| 10,000 archive entries | ~50 MB | During full load |
| Search operation | +50 MB peak | Duplicates data |
| 50,000 entries | 250+ MB | May cause OOM |

### Storage
- **IndexedDB**: Up to configured budget (default 50GB)
- **localStorage**: <10 KB (config + budget state)

### Network
| Operation | Frequency | Size | Notes |
|-----------|-----------|------|-------|
| Content polling | Every 60s | 5-50 KB | Per space |
| Sync status | On load | <1 KB | |
| Budget persistence | On change | <100 B | localStorage, not network |

### CPU
| Operation | Typical Duration | Notes |
|-----------|------------------|-------|
| Decay calculation | <1 ms | O(1) math |
| Priority calculation | <1 ms | O(1) math |
| Search (1000 entries) | 50-100 ms | Full scan |
| Search (10000 entries) | 500-1000 ms | Blocking |
| Grouping (1000 entries) | 10-20 ms | With current O(n²) bug |

## Bundle Size Considerations

| Dependency | Estimated Size | Used For |
|------------|----------------|----------|
| react + react-dom | ~40 KB gzip | Core framework |
| react-router-dom | ~12 KB gzip | Routing |
| hash-wasm | ~15 KB gzip | PoW hashing (not used yet) |
| @swimchain/react | Unknown | WASM + React bindings |
| **Estimated Total** | **~80-100 KB gzip** | Without WASM |

### Recommendations for Bundle
1. Code-split pages with `React.lazy()`
2. Defer hash-wasm loading until needed (currently mocked anyway)
3. Consider dynamic import for Settings page

## Conclusion

The Archiver Client has a clean architecture but lacks performance optimizations needed for scale. The most critical issues are:

1. **N+1 RPC queries** - Easy fix with `Promise.all()`
2. **1-second polling** - Replace with event subscription
3. **O(n) search** - Add search index for large datasets
4. **Unbounded loads** - Implement pagination

For the current feature set with <1000 entries and <5 spaces, performance is acceptable. Before production deployment with larger datasets, address high-impact optimizations.
