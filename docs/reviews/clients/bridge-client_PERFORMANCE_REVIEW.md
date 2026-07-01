# Performance Review: Bridge Client

## Summary
The Bridge Client has **critical performance issues** centered around main-thread Proof-of-Work mining that blocks the UI. While data structures and algorithms are generally efficient (O(n) or better), the synchronous Argon2id computation with 8 MiB memory allocation causes multi-second UI freezes. Polling-based architecture creates predictable but non-optimal network overhead. Memory usage is bounded by reasonable limits.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 20 | 25 | O(n) operations; EchoTracker.wasBridgedTo() is O(n) linear scan |
| Resource Usage | 12 | 25 | **Critical**: Main-thread PoW blocks UI; 8 MiB memory per hash |
| Scalability | 18 | 25 | Polling architecture limits; single-space bottleneck |
| Optimization Opportunities | 15 | 25 | Clear path to Web Workers; caching gaps identified |
| **Total** | **65** | 100 | Usable for testnet; production requires PoW offloading |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `EchoTracker.isBridged()` | O(1) | EchoTracker.ts:55 | Map lookup, constant time |
| `EchoTracker.wasBridgedTo()` | O(n) | EchoTracker.ts:77-92 | **Linear scan** of all entries |
| `EchoTracker.cleanup()` | O(n) | EchoTracker.ts:116-123 | Full map iteration |
| `HourlyRateLimiter.canPost()` | O(m) | RateLimiter.ts:37-41 | m = posts in window (max 10) |
| `HourlyRateLimiter.pruneOld()` | O(m) | RateLimiter.ts:121-131 | Filter operation |
| `computePow()` | O(2^d) | action-pow.ts:204-251 | d = difficulty bits; expected 2^10 = 1024 iterations (testnet) |
| `ActivityLog.filter()` | O(n) | ActivityLog.tsx:26-28 | n = log entries (max 500) |
| `getContentSince()` | O(n) | rpc.ts:181-189 | Client-side filter after fetch |
| Matrix poll | O(r * e) | MatrixAdapter.ts:190-220 | r = rooms, e = events per room |

## Bottlenecks Identified

### 1. Main-Thread Proof-of-Work Mining (CRITICAL)
**Location**: `src/lib/action-pow.ts:204-251` and `src/services/BridgeEngine.ts:436-445`

**Impact**: UI completely blocked during PoW computation. With testnet config (8 MiB, difficulty 10), expect ~1-5 second freezes per bridged message. Production config (64 MiB, difficulty 20) would cause 30+ second freezes.

**Current Code**:
```typescript
// BridgeEngine.ts:436-445 - Mining happens on main thread
const solution = await computePow(
  challenge,
  config,
  (attempts, _elapsedMs, hashRate) => {
    if (attempts % 50 === 0) {
      console.log(`[BridgeEngine] Mining: ${attempts} attempts...`);
    }
  }
);
```

**Mitigation**: Move PoW to Web Worker. The `hash-wasm` library supports Worker contexts. Structure:
```typescript
// worker.ts
self.onmessage = async (e) => {
  const { challenge, config } = e.data;
  const solution = await computePow(challenge, config, (p) => self.postMessage({ type: 'progress', ...p }));
  self.postMessage({ type: 'complete', solution });
};
```

### 2. EchoTracker Linear Scan
**Location**: `src/services/EchoTracker.ts:77-92`

**Impact**: `wasBridgedTo()` performs O(n) scan on every incoming Swimchain message. With 1-hour TTL and high activity, this could reach thousands of entries.

**Current Code**:
```typescript
wasBridgedTo(targetId: string): boolean {
  for (const [key, entry] of this.seen) {  // O(n) iteration
    if (entry.targetId === targetId) {
      return true;
    }
  }
  return false;
}
```

**Mitigation**: Add reverse index:
```typescript
private targetIndex = new Map<string, string>(); // targetId -> key
// Update on markBridged(), delete on cleanup
```

### 3. No Message Queue During Mining
**Location**: `src/services/BridgeEngine.ts:410-413`

**Impact**: Messages arriving while mining are silently dropped, causing data loss under load.

**Current Code**:
```typescript
if (this.isMining) {
  console.log('[BridgeEngine] Already mining, queuing message');
  return;  // Message is NOT actually queued - it's dropped!
}
```

**Mitigation**: Implement actual message queue:
```typescript
private messageQueue: BridgeMessage[] = [];
// On message arrival during mining: this.messageQueue.push(message);
// After mining completes: process queue
```

### 4. Polling Architecture Network Overhead
**Location**: Constants defined in `src/types/constants.ts:19-22`

**Impact**: Continuous network requests regardless of activity:
- Matrix: Every 5 seconds = 720 requests/hour
- IRC: Every 1 second = 3600 requests/hour (via proxy)
- Swimchain: Every 10 seconds = 360 requests/hour

**Mitigation**:
- Use exponential backoff during idle periods
- Matrix: Use proper long-polling with `timeout` parameter
- Swimchain: Consider WebSocket subscription if available

### 5. Client-Side Content Filtering
**Location**: `src/lib/rpc.ts:181-189`

**Impact**: `getContentSince()` fetches 50 items then filters client-side. Wastes bandwidth when most content is old.

**Current Code**:
```typescript
async getContentSince(spaceId: string, sinceTimestamp: number): Promise<{ items: ContentItem[] }> {
  const items = await this.listSpaceContent(spaceId, { limit: 50, sort: 'recent' });
  return {
    items: items.items.filter((item) => item.created_at > sinceTimestamp),
  };
}
```

**Mitigation**: Add server-side `since` parameter to REST API, or paginate until finding older content.

## Scalability Concerns

### Message Volume Scaling
- **Rate limit**: 10 posts/hour/space = hard cap
- **PoW budget**: 3600 seconds/day = ~360 posts/day (10s each)
- **Concurrent mining**: Single-threaded, no parallelism

At scale, message bridging becomes heavily bottlenecked by PoW computation time.

### Memory Scaling
- **EchoTracker**: Unbounded within TTL window; ~100 bytes/entry; 1000 msgs/hour = ~100 KB
- **ActivityLog**: Capped at 500 entries; ~500 bytes/entry = ~250 KB
- **RateLimiter**: ~20 bytes/timestamp; 10/space * spaces
- **Argon2id**: 8 MiB per hash operation (testnet), 64 MiB (production)

Total steady-state: ~500 KB + 8 MiB burst during mining

### Network Scaling
- 4680+ requests/hour baseline from polling
- Single Swimchain node connection (no load balancing)
- No connection pooling for Matrix requests

### Storage Scaling
- localStorage limited to ~5-10 MB depending on browser
- No LRU eviction for old data
- JSON serialization overhead

## Optimization Recommendations

### High Impact

1. **Move PoW to Web Worker** (Expected: Eliminate UI freezes)
   - Location: `src/lib/action-pow.ts`
   - Create dedicated worker for Argon2id computation
   - Pass challenge via `postMessage`, receive solution
   - Update `useActionPow` hook to manage Worker lifecycle
   - **Effort**: Medium (4-8 hours)

2. **Implement Message Queue** (Expected: Zero message loss)
   - Location: `src/services/BridgeEngine.ts`
   - Add bounded queue (max 100 messages)
   - Process queue after mining completes
   - Add UI indicator for queue depth
   - **Effort**: Low (2-4 hours)

### Medium Impact

3. **Add Reverse Index to EchoTracker** (Expected: O(1) `wasBridgedTo`)
   - Location: `src/services/EchoTracker.ts`
   - Maintain `targetId -> sourceKey` Map
   - Update index in `markBridged()` and `cleanup()`
   - **Effort**: Low (1-2 hours)

4. **Server-Side Filtering for Content** (Expected: 50-90% bandwidth reduction)
   - Requires: Backend API change to support `since` parameter
   - Update `getContentSince()` to use server-side filtering
   - **Effort**: Medium (depends on backend)

5. **Adaptive Polling Intervals** (Expected: 30-50% request reduction)
   - Increase interval during idle periods (no messages for 5 minutes)
   - Decrease when activity detected
   - Use exponential backoff on errors
   - **Effort**: Low (2-3 hours)

### Low Impact (Quick Wins)

6. **Batch localStorage Writes** (Expected: Reduced I/O contention)
   - Current: Write on every activity log entry
   - Proposed: Debounce writes to every 5 seconds
   - **Effort**: Very Low (30 minutes)

7. **Memoize Activity Log Filtering** (Expected: Smoother UI with many entries)
   - Location: `src/pages/ActivityLog.tsx:26-28`
   - Use `useMemo` with `[entries, filter]` dependency
   - **Effort**: Very Low (15 minutes)

8. **Pre-allocate Argon2id Buffer** (Expected: Fewer allocations during mining)
   - Location: `src/lib/action-pow.ts`
   - Reuse the 90-byte input buffer across iterations
   - Already partially implemented, verify no re-allocation
   - **Effort**: Very Low (30 minutes)

## Resource Estimates

### Memory Usage
| Component | Typical | Peak | Notes |
|-----------|---------|------|-------|
| React Runtime | 5-10 MB | 15 MB | Framework overhead |
| WASM (hash-wasm) | 2-3 MB | 3 MB | Loaded on demand |
| Argon2id Mining | 8 MB | 8 MB | Per hash (testnet) |
| EchoTracker | 50 KB | 200 KB | 1-hour TTL |
| ActivityLog | 150 KB | 250 KB | 500 entry cap |
| Rate Limits | 5 KB | 20 KB | Per-space timestamps |
| **Total** | ~15 MB | ~27 MB | Reasonable for browser |

### Storage Usage (localStorage)
| Key | Size | Notes |
|-----|------|-------|
| bridge_config | 1-2 KB | Settings |
| bridge_activity_log | 50-200 KB | 500 entries max |
| bridge_rate_limits | 1-5 KB | Timestamps |
| bridge_pow_state | 100 bytes | Daily tracking |
| swimchain-bridge-identity | 200 bytes | Keypair (if stored) |
| **Total** | ~250 KB | Well under 5 MB limit |

### Network Usage
| Source | Requests/Hour | Data/Hour | Notes |
|--------|---------------|-----------|-------|
| Matrix Polling | 720 | 2-20 MB | Depends on room size |
| IRC Proxy | 3600 | 100 KB | Lightweight JSON |
| Swimchain Polling | 360 | 1-5 MB | 50 items per poll |
| Post Submissions | 10 (max) | 50 KB | Rate limited |
| **Total** | ~4700 | 3-25 MB | Reasonable |

### CPU Usage
| Operation | Duration | Frequency | Impact |
|-----------|----------|-----------|--------|
| Argon2id Hash | 50-200ms | Per nonce | **High** during mining |
| JSON Parse | <1ms | Every poll | Negligible |
| React Render | 5-20ms | On state change | Low |
| SHA-256 | <1ms | Per submission | Negligible |

## Profiling Recommendations

To further optimize, profile these scenarios:

1. **Mining Session**: Record Performance timeline during PoW computation
   - Identify exact blocking duration
   - Measure memory pressure from Argon2id

2. **High Activity**: Simulate 100 messages in 10 minutes
   - Monitor EchoTracker map size
   - Check for memory leaks in activity handlers

3. **Long Running**: Leave bridge active for 24 hours
   - Watch for memory growth (retained closures, event listeners)
   - Monitor localStorage size

## Comparison with Best Practices

| Practice | Status | Notes |
|----------|--------|-------|
| Web Workers for heavy computation | Missing | Critical gap |
| Virtual scrolling for long lists | Not needed | 500 entry cap sufficient |
| Request deduplication | Partial | Each poll independent |
| Response caching | Missing | Spaces list could be cached |
| Lazy loading | Present | Routes are lazy-loaded |
| Bundle splitting | Present | Vite default config |
| Tree shaking | Present | Via Vite/Rollup |
| Connection keep-alive | Present | HTTP/1.1 default |

## Conclusion

The Bridge Client is **adequate for testnet usage** with low-to-moderate message volume. For production deployment:

1. **Critical**: Move PoW to Web Worker to prevent UI blocking
2. **Important**: Implement actual message queue to prevent data loss
3. **Recommended**: Add reverse index to EchoTracker for high-volume scenarios

Current performance rating: **65/100** - Functional but not production-ready due to main-thread blocking.
