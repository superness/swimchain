# Performance Review: React SDK

## Summary

The React SDK has a mixed performance profile. Core cryptographic operations leverage efficient WebCrypto APIs and noble-curves libraries, but the Action PoW implementation contains a **critical main-thread blocking loop** that freezes UI during mining. Content hooks show reasonable O(n) complexity for reply tree building, but polling patterns create unnecessary network overhead. The multi-layer caching system is well-designed but lacks automatic eviction policies.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | Reply tree O(n), but some O(n^2) in cache cleanup |
| Resource Usage | 17 | 25 | Memory-heavy PoW (64MB), redundant allocations |
| Scalability | 18 | 25 | Single RPC connection limits scaling |
| Optimization Opportunities | 19 | 25 | Many low-hanging fruit available |
| **Total** | **72** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `buildReplyTree` | O(n) | useContent.ts:528 | Two passes: Map build + tree construction |
| `sortChildren` | O(n log n) per level | useContent.ts:566-570 | Recursive sort on each tree level |
| `pollForContent` | O(polls * n) | useContent.ts:591-637 | Up to 15 polls, filtering each time |
| `pollForSingleContent` | O(polls) | useContent.ts:639-664 | Up to 30 retries at 1s intervals |
| `computePow` (Action) | O(2^difficulty) | action-pow.ts:316-362 | **Blocks main thread** |
| `invalidateMemory` | O(n) | cache.ts:208-214 | Iterates all cache keys |
| `clearDecryptedMediaCache` | O(n) | cache.ts:303-349 | Full IndexedDB scan + delete |
| `deriveKey` (PBKDF2) | O(100,000 iterations) | encryption.ts:50-72 | CPU-intensive key derivation |
| `ed25519PublicToX25519` | O(32 * bigint ops) | x25519.ts:68-96 | BigInt modular arithmetic loop |
| `hexToBytes` / `bytesToHex` | O(n) | multiple files | Simple byte conversion |

## Bottlenecks Identified

### 1. **Critical: Action PoW Blocks Main Thread**
**Location**: `swimchain-react/src/lib/action-pow.ts:332`
**Code**:
```typescript
while (true) {
  if (isCancelled?.()) {
    throw new Error('Mining cancelled');
  }
  // ... synchronous Argon2id computation
  nonce++;
}
```
**Impact**: UI freezes during any content submission (posts, replies, engagements). On production difficulty (20 bits), this could block for 10-60+ seconds.
**Mitigation**: Move to Web Worker like Identity PoW does in `usePow.ts`.

### 2. **High: Polling Creates Network Overhead**
**Location**: `swimchain-react/src/hooks/useContent.ts:591-637`
**Impact**: Up to 15 polls at 2-second intervals (30 seconds total) for missing content. Each poll re-fetches entire space content list.
**Mitigation**: Use WebSocket for real-time content arrival notifications instead of polling.

### 3. **Medium: Memory-Heavy PoW Configuration**
**Location**: `swimchain-react/src/lib/action-pow.ts:84-88`
**Code**:
```typescript
export const PRODUCTION_CONFIG: PoWConfig = {
  memoryKib: 65536,  // 64 MiB
  iterations: 3,
  parallelism: 4,
};
```
**Impact**: Each PoW computation allocates 64MB. Combined with main-thread blocking, causes memory pressure on mobile devices.
**Mitigation**: Consider streaming/chunked Argon2id or reduce memory for mobile clients.

### 4. **Medium: IndexedDB Full Table Scan**
**Location**: `swimchain-react/src/lib/cache.ts:303-349`
**Code**:
```typescript
const request = store.openCursor();
request.onsuccess = (event) => {
  const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
  if (cursor) {
    if (cursor.key.toString().includes(':decrypted')) {
      keysToDelete.push(cursor.key.toString());
    }
    cursor.continue();  // Full scan
  }
};
```
**Impact**: Grows linearly with cached media count. 1000+ cached items = noticeable delay.
**Mitigation**: Use secondary index on key pattern or separate store for decrypted items.

### 5. **Low: Redundant Array Allocations**
**Location**: Multiple files (encryption.ts, action-pow.ts)
**Pattern**:
```typescript
// Unnecessary intermediate allocations
const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
const plainBuffer = new ArrayBuffer(bytes.length);  // Allocation #1
new Uint8Array(plainBuffer).set(bytes);              // Allocation #2
```
**Impact**: Extra GC pressure on large media files.
**Mitigation**: Check if buffer is already detached before copying.

## Scalability Concerns

### Single RPC Connection Limitation
- `RpcProvider` manages exactly one connection (`swimchain-react/src/hooks/useRpc.tsx:92`)
- No connection pooling or load balancing across multiple nodes
- Applications needing multiple node connections must create separate provider trees

### Content List Pagination
- Default limits are reasonable (50-100 items per page)
- However, no cursor-based pagination - offset grows unbounded
- Large offsets (1000+) may impact server performance

### Memory Cache Unbounded Growth
- `memoryCache` Map (`cache.ts:186`) has no maximum size
- No LRU eviction - entries only removed on TTL expiry or prefix invalidation
- Long-running sessions could accumulate thousands of entries

### Reply Tree Depth
- Recursive `sortChildren` function (`useContent.ts:566-570`)
- Deep nesting (100+ levels) could cause stack overflow
- No depth limiting or iterative fallback

## Optimization Recommendations

### High Impact

1. **Move Action PoW to Web Worker**
   - Expected improvement: UI remains responsive during all submissions
   - Effort: Medium (pattern exists in `usePow.ts` for Identity PoW)
   - Create `ActionPowWorker` class mirroring `PowWorker` from @swimchain/core

2. **Replace Polling with WebSocket**
   - Expected improvement: Eliminate 15x network calls per content fetch
   - Effort: High (requires backend WebSocket support)
   - Implement subscription model for content arrival events

3. **Add LRU Cache Eviction**
   - Expected improvement: Bounded memory in long sessions
   - Effort: Low
   - Implement max-entries limit with LRU tracking

### Medium Impact

1. **Batch Content Requests**
   - Currently: Individual `requestContent()` calls (`useContent.ts:580-588`)
   - Improvement: Batch RPC endpoint for multiple content IDs
   - Expected: Reduce network round-trips from N to 1

2. **Lazy Decrypt on Scroll**
   - Currently: All visible encrypted content decrypted immediately
   - Improvement: Intersection Observer to decrypt only visible items
   - Expected: Reduce initial load PBKDF2 operations

3. **Add IndexedDB Index for Decrypted Media**
   - Currently: Full cursor scan with string matching
   - Improvement: Boolean index on `isDecrypted` field
   - Expected: O(log n) lookup instead of O(n) scan

### Low Impact (Quick Wins)

1. **Memoize `hexToBytes`/`bytesToHex` Results**
   - Same hex strings converted repeatedly
   - Use WeakMap cache for recently converted values

2. **Debounce Decay Updates**
   - `requestAnimationFrame` runs at 60fps but throttled to 1000ms
   - Use `setTimeout` instead when `updateInterval >= 500ms`

3. **Pre-allocate Reply Arrays**
   - `const rootReplies: Reply[] = []` grows dynamically
   - Pre-size based on `flatReplies.length`

4. **Reuse TextEncoder/TextDecoder**
   - New instances created per encryption/decryption call
   - Store as module-level singletons

## Resource Estimates

### Memory
| Scenario | Estimate |
|----------|----------|
| Idle (WASM loaded) | ~5-10 MB |
| During Action PoW (production) | +64 MB (temporary) |
| During Action PoW (testnet) | +8 MB (temporary) |
| Memory cache (100 entries) | ~500 KB - 2 MB |
| IndexedDB media cache (100 images) | ~50-200 MB |

### Storage (IndexedDB)
| Data Type | Size Per Item | Typical Count |
|-----------|---------------|---------------|
| Cached content | 1-5 KB | 100-500 |
| Cached media | 50 KB - 5 MB | 10-100 |
| localStorage identity | ~500 bytes | 1 |

### Network
| Operation | Requests | Latency Impact |
|-----------|----------|----------------|
| Initial load (spaces) | 1 | 50-200ms |
| Thread + replies | 2-3 | 100-300ms |
| Missing content poll | 1-15 | 2-30 seconds |
| Sync status poll | 1 per 10s | Minimal |

## Performance Testing Recommendations

1. **Benchmark Action PoW on Low-End Devices**
   - Test on 2GB RAM mobile devices
   - Measure UI freeze duration at various difficulty levels

2. **Profile Memory During Long Sessions**
   - Monitor heap growth over 1-hour sessions
   - Identify memory leaks in cache layers

3. **Load Test Content Hooks**
   - Test `useSpaceThreads` with 1000+ posts
   - Measure render performance of deep reply trees (50+ depth)

4. **Network Condition Testing**
   - Test polling behavior on 3G/slow connections
   - Verify timeout handling doesn't cascade failures

---
*Review Date: 2026-01-12*
*Reviewer: Performance Analysis Agent*
*Files Analyzed: 15 source files in swimchain-react/src/*
