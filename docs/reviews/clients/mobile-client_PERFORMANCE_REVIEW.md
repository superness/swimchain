# Performance Review: Mobile Client (Tidal)

## Summary

The Mobile Client demonstrates **good performance fundamentals** with proper FlatList virtualization, React.memo on list items, and native module delegation for PoW. However, significant concerns exist around **N+1 RPC query patterns** in `getRecentContent()`, the **blocking waterfall in HomeScreen**, excessive **re-renders from useRpcConnection hooks**, and **missing caching layer** for RPC responses. The PoW mining at 64 MiB memory + 51 seconds CPU time is inherently resource-intensive but well-managed with cancellation support.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 17 | 25 | N+1 queries, waterfall fetches, O(n) filtering post-fetch |
| Resource Usage | 18 | 25 | 64 MiB PoW, no RPC caching, no image caching |
| Scalability | 15 | 25 | Single RPC endpoint, no pagination, global context re-renders |
| Optimization Opportunities | 20 | 25 | Good FlatList setup, memoization present, clear wins available |
| **Total** | **70** | **100** | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `ThreadList` render | O(n) visible | FlatList virtualization with getItemLayout |
| `getRecentContent()` | O(s * c) | s=spaces, c=content per space - N+1 RPC calls |
| `getPoolsAtRisk()` | O(n) filter | Fetches 50 items, filters in JS |
| `HomeScreen` refresh | O(3) parallel | 3 RPC hooks fetching independently |
| `useRpcConnection` | O(1) connect | But creates new subscription per hook call |
| `categorizeByDepth()` | O(n) | Single pass categorization |
| `calculateDecayPercentage()` | O(1) | Simple math, properly memoized |
| `PoW mining` | O(2^d) | d=difficulty, ~26-102 seconds |
| `hexToBytes()`/`bytesToHex()` | O(n) | Linear conversion per call |

## Bottlenecks Identified

### 1. N+1 Query Pattern in `getRecentContent()`

**Bottleneck**: Sequential RPC calls to each space
**Location**: `SwimchainRpc.ts:287-296`
```typescript
async getRecentContent(limit: number = 20): Promise<{ items: ContentItem[] }> {
  const spacesResult = await this.listSpaces();
  const allItems: ContentItem[] = [];
  for (const space of spacesResult.spaces.slice(0, 5)) {
    const content = await this.listSpaceContent(space.space_id, ...);
    allItems.push(...content.items);
  }
  return { items: allItems.slice(0, limit) };
}
```
**Impact**: At 5 spaces, this is 6 sequential HTTP requests (1 listSpaces + 5 listSpaceContent). At 200ms/request network latency, this is 1.2 seconds minimum load time.
**Mitigation**:
- Add server-side `get_recent_content` RPC method
- Or parallelize with `Promise.all()` for existing API

### 2. Triple Waterfall on HomeScreen Load

**Bottleneck**: Three independent hooks triggering sequential fetches
**Location**: `HomeScreen.tsx:30-34`
```typescript
const { spaces: rpcSpaces, refresh: refreshSpaces } = useSpaces();
const { content: recentContent, refresh: refreshContent } = useRecentContent(20);
const { pools: atRiskContent, refresh: refreshPools } = usePoolsAtRisk(0.1);
```
**Impact**: Each hook creates its own `useRpcConnection()` instance, and waits for `connected` before fetching. Initial load requires: connect -> 3 parallel fetches, but `getRecentContent` and `getPoolsAtRisk` are sequential within themselves.
**Mitigation**: Combine into single data-fetching hook with shared RPC client and parallel Promise.all()

### 3. Duplicate RPC Connection Subscriptions

**Bottleneck**: Each `useRpcConnection()` call adds new listener
**Location**: `useRpc.ts:19-54`
```typescript
export function useRpcConnection() {
  const rpcRef = useRef<SwimchainRpc>(getRpcClient());
  useEffect(() => {
    const unsubscribe = rpc.onConnectionChange(...);
    rpc.startAutoReconnect(5000); // Called multiple times!
```
**Impact**: HomeScreen alone calls this hook 4 times (directly + via useSpaces/useRecentContent/usePoolsAtRisk). This creates 4 connection listeners and may start multiple reconnect timers.
**Mitigation**: Move connection state to React Context, single subscription

### 4. No Response Caching

**Bottleneck**: Every screen mount re-fetches all data
**Location**: All `useRpc.ts` hooks have no cache
**Impact**: Navigating to ThreadViewScreen, back, and to another thread = 4 RPC calls that could be served from cache
**Mitigation**: Add stale-while-revalidate cache with TTL (e.g., react-query, SWR, or custom cache)

### 5. BreathIndicator Wave Point Generation

**Bottleneck**: Generates 41 DOM elements per indicator
**Location**: `BreathIndicator.tsx:233-242`
```typescript
const wavePoints = useMemo(() => {
  const segments = 20;
  for (let i = 0; i <= segments * 2; i++) { // 41 points
```
**Impact**: When integrated, a list of 20 threads with BreathIndicators = 820 additional View elements
**Mitigation**: Use react-native-svg Path instead of individual View points

### 6. TendGesture Progress Interval

**Bottleneck**: 50ms interval during hold gesture
**Location**: `TendGesture.tsx:103`
```typescript
progressInterval.current = setInterval(() => {
  const elapsed = Date.now() - holdStartTime.current;
  // ...state updates every 50ms
}, 50);
```
**Impact**: 20 state updates/second during gesture, causing potential re-renders
**Mitigation**: Use Reanimated's `withTiming` or `useAnimatedReaction` instead of setInterval

## Scalability Concerns

### 1. Single Hardcoded RPC Endpoint
- No node discovery, load balancing, or failover
- All traffic goes to single local node
- At scale: single point of failure and bottleneck

### 2. No Pagination in Data Hooks
- `useSpaces()` fetches all spaces every time
- `useSpaceThreads()` has limit=50 but no cursor pagination
- With 1000+ spaces/threads, memory and performance degrade

### 3. Global Context Re-renders
- `MobileSwimchainProvider` holds: address, networkState, storageProfile, queueCount, pow
- Any change triggers re-render of all consumers
- `pow` includes state that changes during mining (progress updates)

### 4. No Background Data Refresh
- Data only refreshes on pull-to-refresh or screen mount
- No real-time updates or polling for new content
- Stale data between interactions

### 5. AsyncStorage is Synchronous Bottleneck
- Identity loaded via AsyncStorage on app start
- All async operations blocked until identity resolves
- At scale with larger stored data, startup slows

## Optimization Recommendations

### High Impact

#### 1. Implement Server-side Recent Content Endpoint
**Expected Improvement**: 5x faster home feed load (6 requests -> 1)
```typescript
// Server: Add get_recent_content RPC method
// Client: Replace N+1 query pattern
async getRecentContent(limit: number): Promise<{ items: ContentItem[] }> {
  return this.call<{ items: ContentItem[] }>('get_recent_content', { limit });
}
```

#### 2. Add Response Cache Layer
**Expected Improvement**: Instant navigation, 80% fewer RPC calls
```typescript
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

async function cachedCall<T>(key: string, fetcher: () => Promise<T>, ttl: number = 30000): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now(), ttl });
  return data;
}
```

#### 3. Centralize RPC Connection in Context
**Expected Improvement**: Eliminate duplicate subscriptions, single reconnect timer
```typescript
// New: RpcConnectionProvider wrapping app
// Provides: { rpc, connected, connecting } via context
// All hooks use context instead of creating new connections
```

#### 4. Parallelize Space Content Fetches
**Expected Improvement**: 3-5x faster until server endpoint added
```typescript
async getRecentContent(limit: number = 20): Promise<{ items: ContentItem[] }> {
  const spacesResult = await this.listSpaces();
  const contentPromises = spacesResult.spaces.slice(0, 5).map(space =>
    this.listSpaceContent(space.space_id, { limit: 10, sort: 'recent' })
  );
  const results = await Promise.all(contentPromises);
  const allItems = results.flatMap(r => r.items);
  return { items: allItems.slice(0, limit) };
}
```

### Medium Impact

#### 5. Replace Wave Points with SVG Path
**Expected Improvement**: 40x fewer elements in BreathIndicator
```typescript
// Use react-native-svg Path instead of View array
import { Svg, Path } from 'react-native-svg';
const pathD = `M0,${height/2} ${wavePoints.map(p => `L${p.x},${p.y}`).join(' ')}`;
```

#### 6. Use Reanimated for TendGesture Progress
**Expected Improvement**: Eliminate 20 state updates/second
```typescript
// Replace setInterval with Reanimated timing
const elapsed = useSharedValue(0);
useAnimatedReaction(() => elapsed.value, (value) => {
  runOnJS(onTendProgress)(value / maxDuration);
});
```

#### 7. Split MobileSwimchainProvider Context
**Expected Improvement**: Fewer cascading re-renders
```typescript
// Separate contexts:
// - IdentityContext (rarely changes)
// - NetworkContext (moderate changes)
// - PowContext (frequent changes during mining)
```

#### 8. Add Skeleton Loading States
**Expected Improvement**: Better perceived performance
```typescript
// ThreadList shows skeleton cards while loading
// Reduces layout shift and improves perceived speed
```

### Low Impact (Quick Wins)

#### 9. Memoize useMemo Dependencies in HomeScreen
**Location**: `HomeScreen.tsx:37-72`
**Current**: Three separate useMemo transformations
**Improvement**: Combine into single transformation to reduce iterations

#### 10. Add removeClippedSubviews to All Lists
**Location**: Currently only in ThreadList
**Improvement**: Memory reduction for off-screen items

#### 11. Use getItemLayout on DepthFeed SectionList
**Location**: `DepthFeed.tsx:209`
**Current**: No getItemLayout
**Improvement**: Smoother scrolling for depth feed

#### 12. Preload Thread Data on Hover/Press-In
**Improvement**: Start fetch on press-in before navigation completes

## Resource Estimates

### Memory
| Scenario | Estimate | Notes |
|----------|----------|-------|
| Baseline (idle) | 80-100 MB | RN overhead + navigation |
| Home feed (50 threads) | 120-140 MB | FlatList with virtualization |
| Thread view (100 replies) | 140-160 MB | Additional content loaded |
| PoW mining active | 220-280 MB | +64 MiB for Argon2id |
| Peak (mining + images) | 300-350 MB | Memory pressure zone |

### Network
| Operation | Requests | Payload Est. |
|-----------|----------|--------------|
| Initial home load | 6 | ~50 KB |
| Space view load | 1 | ~10 KB |
| Thread + replies load | 2 | ~15 KB |
| Post submission | 3 | ~5 KB (challenge + submit + verify) |
| Pull-to-refresh | 6 | ~50 KB |

### Battery
| Operation | Impact | Duration |
|-----------|--------|----------|
| Idle browsing | Low | Continuous |
| Pull-to-refresh | Minimal | ~2s network |
| PoW difficulty 8 | High | ~26s active CPU |
| PoW difficulty 9 | High | ~51s active CPU |
| Background reconnect | Low | 5s intervals |

### Storage
| Data Type | Size Est. |
|-----------|-----------|
| Identity (AsyncStorage) | ~500 bytes |
| Settings (AsyncStorage) | ~1 KB |
| Cached content (future) | 5-50 MB |
| Images (future) | 10-50 MB |

## Conclusion

The Mobile Client has a solid foundation with proper virtualization, native module delegation for expensive operations, and appropriate use of React.memo. The main performance concerns are:

1. **Critical**: N+1 RPC query pattern causes 6x slower home feed loads
2. **High**: No response caching leads to redundant network requests
3. **Medium**: Duplicate connection subscriptions from hook design
4. **Medium**: Global context re-renders during PoW mining

Addressing the RPC query pattern and adding a caching layer would provide the most significant performance improvements. The PoW mining resource usage (64 MiB, 26-51 seconds) is inherent to the protocol and well-handled with progress tracking and cancellation support.

**Overall Performance Grade: B-** (Solid fundamentals, clear bottlenecks identified)

---

## Supplemental Performance Analysis

### Additional Bottlenecks

#### 7. OfflineQueue Load Pattern

**Bottleneck**: Every queue operation loads entire queue from AsyncStorage
**Location**: `src/services/OfflineQueue.ts:40-53, 108-114`

```typescript
async getNext(): Promise<QueuedAction | null> {
  await this.load(); // Deserializes entire queue
  const pending = this.queue
    .filter((a) => a.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt); // Sorts every time
  return pending[0] || null;
}
```

**Impact**: With 50 queued actions, every operation parses ~10KB JSON and sorts O(n log n). During batch processing, this becomes O(n^2 log n) overall.

**Mitigation**:
- Maintain sorted order on insert
- Cache loaded state and invalidate on write
- Use indexed structure (Map by status)

#### 8. Memory Warning Handler is Stub

**Bottleneck**: `useMemoryWarning` hook doesn't actually clear caches
**Location**: `src/hooks/useMemoryWarning.ts:21-30`

```typescript
const handleMemoryWarning = useCallback(() => {
  console.log('[Memory] Warning received - clearing caches');
  // In a real implementation, this would:
  // 1. Clear image cache
  // 2. Reduce FlatList window size temporarily
  // 3. Release cached data
  onWarning?.();
}, [onWarning]);
```

**Impact**: During PoW mining (64 MiB + app baseline), memory pressure can reach 300 MB. Without actual cache clearing, OOM risk increases on low-memory devices.

**Mitigation**: Implement actual cache clearing:
- Integrate with react-native-fast-image cache control
- Reduce FlatList windowSize during mining
- Clear any response cache

#### 9. HomeScreen ListHeader Recreation

**Bottleneck**: ListHeader function recreated on every render
**Location**: `src/screens/HomeScreen.tsx:109-148`

```typescript
const ListHeader = useCallback(() => ( // useCallback helps but dependencies change often
  <View>
    <SyncStatus ... />
    {poolsAtRisk.length > 0 && <PoolsNeedingHelp ... />}
    <View>{spaces.filter(...).map(...)}</View> // map() in render
  </View>
), [spaces, poolsAtRisk, handleSpacePress, handlePoolPress, connected]);
```

**Impact**: When any dependency changes, entire header re-renders including all SpaceCards. With 10 spaces, this is 10 component re-renders per refresh.

**Mitigation**:
- Extract filtered spaces to useMemo
- Memoize SpaceCard components
- Consider virtualized horizontal list for spaces

#### 10. PoolsNeedingHelp Missing Optimizations

**Bottleneck**: Horizontal FlatList missing virtualization props
**Location**: `src/components/PoolsNeedingHelp.tsx:84-94`

```typescript
<FlatList
  horizontal
  data={pools}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => (
    <PoolItem pool={item} onPress={() => onPoolPress(item)} />
  )}
  // Missing: getItemLayout, initialNumToRender, maxToRenderPerBatch
/>
```

**Impact**: All items rendered at once; no recycling for off-screen items in horizontal scroll.

**Mitigation**:
- Add `getItemLayout` with fixed width (minWidth: 200, maxWidth: 280)
- Add `removeClippedSubviews={true}`
- Add `initialNumToRender={3}` (visible items)

### Detailed Time Complexity Analysis

| Method | Best Case | Average | Worst Case | Notes |
|--------|-----------|---------|------------|-------|
| `SwimchainRpc.call()` | O(1) | O(1) | O(1) | Single HTTP request |
| `getRecentContent()` | O(s) | O(s*c) | O(s*c) | s=5 spaces, c=10 per space |
| `getPoolsAtRisk()` | O(n) | O(n) | O(n) | Filter 50 items |
| `OfflineQueue.getNext()` | O(1) cached | O(n log n) | O(n log n) | Sort on every call |
| `OfflineQueue.add()` | O(1) | O(n) | O(n) | JSON.stringify entire queue |
| `calculateDecayPercentage()` | O(1) | O(1) | O(1) | Simple arithmetic |
| `wavePoints` calculation | O(s) | O(s) | O(s) | s=41 segments |
| `BreathDot` render (all) | O(d) | O(d) | O(d) | d=5 dots per indicator |
| `ThreadCard` render | O(1) | O(1) | O(1) | Memoized, O(1) props |
| `ThreadList` scroll | O(w) | O(w) | O(w) | w=windowSize items |

### Memory Allocation Profile

| Component/Feature | Heap Size | Frequency | GC Impact |
|-------------------|-----------|-----------|-----------|
| RN JS Runtime | ~20 MB | Persistent | None |
| Navigation Stack | ~5 MB | Per screen | Low |
| FlatList Data (50 threads) | ~2 MB | Per list | Medium |
| Argon2 Buffer | 64 MB | During PoW | High |
| SharedValue (animations) | <1 KB | Per animation | Low |
| AsyncStorage Parse | ~10 KB | Per operation | Low |

### Network Waterfall Analysis

**Current HomeScreen Load (Sequential Pattern)**:
```
T=0ms:      connect() ─────────────────────────────────────────────────┐
T=200ms:    listSpaces() ─────────────────────────────────────┐        │
T=400ms:    listSpaceContent(1) ──────────────────────┐       │        │
T=600ms:    listSpaceContent(2) ──────────────────────┤       │        │
T=800ms:    listSpaceContent(3) ──────────────────────┤       │ getRecentContent
T=1000ms:   listSpaceContent(4) ──────────────────────┤       │        │
T=1200ms:   listSpaceContent(5) ──────────────────────┘       │        │
T=1400ms:                                          Total: 1400ms ──────┘
```

**Optimized (Parallel Pattern)**:
```
T=0ms:      connect() ─────────────┐
T=200ms:    listSpaces() ──────────┤
T=400ms:    ┌─ listSpaceContent(1) ─┐
            ├─ listSpaceContent(2) ─┤
            ├─ listSpaceContent(3) ─┤ Promise.all()
            ├─ listSpaceContent(4) ─┤
            └─ listSpaceContent(5) ─┘
T=600ms:                    Total: 600ms (57% faster)
```

### Battery Impact Estimates

| Activity | CPU % | Duration | Battery Drain |
|----------|-------|----------|---------------|
| App cold start | 100% | ~2s | ~0.1% |
| Home feed scroll | 20-40% | Variable | ~2%/hour |
| BreathIndicator animations | 5-10% | Continuous | ~1%/hour |
| Network fetch | 10-15% | ~1s per request | Negligible |
| PoW Difficulty 8 | 100% | ~26s | ~5% |
| PoW Difficulty 9 | 100% | ~51s | ~8% |
| Background reconnect polling | 5% | 5s intervals | ~0.5%/hour |

### Performance Testing Checklist

- [ ] Profile startup time (target: <2s to interactive)
- [ ] Measure home feed TTI (target: <1s cached, <2s cold)
- [ ] FlatList fps during fast scroll (target: 60fps)
- [ ] Memory profile during PoW (target: <350 MB peak)
- [ ] Network waterfall during refresh (target: <3 concurrent)
- [ ] Animation fps for BreathIndicator (target: 60fps)
- [ ] TendGesture responsiveness (target: <16ms per frame)
- [ ] AsyncStorage read time for queue (target: <50ms for 100 items)

---

*Supplemental analysis completed: 2026-01-12*
