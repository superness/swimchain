# Quality & Reliability Review: Archiver Client

## Summary

The Archiver Client demonstrates **solid code quality** with well-structured TypeScript, clean architecture patterns (singleton services, hooks, pub/sub), and comprehensive JSDoc documentation. However, there are **critical gaps in test coverage** (no actual test files exist beyond setup configuration), **partial error handling** (async errors handled gracefully but some edge cases missed), and **reliability concerns** around the mocked PoW integration and race conditions in singleton initialization.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Code Quality | 21 | 25 | Clean architecture, good TypeScript, but some unused vars and hardcoded mocks |
| Test Coverage | 5 | 25 | Setup only - no actual test files |
| Error Handling | 18 | 25 | Good patterns but gaps in RPC and IndexedDB edge cases |
| Reliability | 16 | 25 | Mocked PoW, potential race conditions, no retry logic |
| **Total** | **60** | **100** | Solid foundation, critical testing gap |

---

## Code Quality Assessment

### Structure (Excellent)

The codebase follows a clean, maintainable architecture:

```
src/
  services/     # Singleton business logic (ArchiveStorage, ContentMonitor, AutoEngageEngine)
  hooks/        # React hooks wrapping services (useContentMonitor, useArchiveStorage, useRpc)
  components/   # Presentational components (StatusCard, AtRiskList, EngageButton)
  pages/        # Route-level components (Dashboard, ArchivedContent, Settings)
  types/        # Centralized type definitions
  lib/          # Utilities (RPC client)
```

**Strengths:**
- Clear separation between services (business logic) and hooks (React integration)
- Singleton pattern properly implemented with lazy initialization
- Consistent file naming and module organization
- Good use of TypeScript branded types (`SpaceId`, `ContentHash`, `IdentityAddress`)

**Issues:**
- `Dashboard.tsx:16` - Hardcoded `MOCK_SPACES` should be configurable
- `EngageButton.tsx:23` - Unused parameter `postHash` renamed to `_postHash` (tech debt)

### Naming Conventions (Good)

- **Types**: PascalCase with descriptive names (`AtRiskContent`, `EngagementResult`)
- **Functions**: camelCase with verb prefixes (`calculatePriority`, `getAtRiskContent`)
- **Constants**: SCREAMING_SNAKE_CASE (`HALF_LIFE_SECONDS`, `DECAY_THRESHOLD`)
- **Hooks**: `use` prefix convention followed (`useContentMonitor`, `useArchiveStorage`)

**Minor issues:**
- Some inconsistent abbreviations (`Secs` vs `Seconds`, `Ms` vs `Milliseconds`)

### Documentation (Good)

- All services have file-level JSDoc comments
- Public methods documented with `@param` and `@returns`
- Complex calculations explained with formulas (e.g., `ContentMonitor.ts:31-44`)
- Constants reference spec documents (`constants.ts:6` - "Values sourced from SPEC_02 and SPEC_03")

**Missing:**
- No README.md in component directories explaining patterns
- Some hooks lack usage examples

### Technical Debt

| Item | Location | Effort |
|------|----------|--------|
| Hardcoded mock spaces | `Dashboard.tsx:16` | Low |
| Unused postHash parameter | `EngageButton.tsx:23` | Low |
| Mocked PoW engagement | `AutoEngageEngine.ts:141-148` | High |
| Auto-engage not wired | `ContentMonitor.ts` | Medium |
| Auto-archive placeholder | `ContentMonitor.ts` | Medium |

---

## Test Coverage Analysis

### Test Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| Vitest Configuration | Configured | `vitest.config.ts` with coverage |
| Test Setup | Present | `tests/setup.ts` with mocks |
| localStorage Mock | Present | Full mock implementation |
| IndexedDB Mock | Present | Basic mock (incomplete) |
| matchMedia Mock | Present | For responsive design tests |

### Actual Test Files

| Area | Unit Tests | Integration Tests | Notes |
|------|------------|-------------------|-------|
| ArchiveStorage | **No** | **No** | Service has 413 lines, 0 test lines |
| AutoEngageEngine | **No** | **No** | Service has 317 lines, 0 test lines |
| ContentMonitor | **No** | **No** | Service has 275 lines, 0 test lines |
| useArchiveStorage | **No** | **No** | Hook has 191 lines, 0 test lines |
| useContentMonitor | **No** | **No** | Hook has 111 lines, 0 test lines |
| useRpc | **No** | **No** | Hook has 329 lines, 0 test lines |
| Components | **No** | **No** | 6 components, 0 test files |

**Critical Finding**: The test framework is configured with mocks, but **no actual test files exist**. The `tests/` directory contains only `setup.ts`.

### Missing Tests

1. **ArchiveStorage service tests**
   - IndexedDB initialization success/failure
   - Storage quota enforcement
   - Entry CRUD operations
   - Search functionality
   - Concurrent transaction handling

2. **AutoEngageEngine service tests**
   - Priority calculation with various inputs
   - Daily budget reset at UTC midnight
   - Budget persistence to localStorage
   - Engagement result handling

3. **ContentMonitor service tests**
   - Decay calculation accuracy (SPEC_02 compliance)
   - Urgency classification boundaries
   - Polling start/stop lifecycle
   - Subscriber notification

4. **RPC client tests**
   - Connection success/failure
   - Retry logic
   - Response parsing
   - Error propagation

5. **Component tests**
   - EngageButton state machine transitions
   - AtRiskList keyboard navigation
   - BudgetMeter real-time updates
   - ErrorBoundary recovery

---

## Error Handling Issues

### Critical

1. **Issue**: IndexedDB metadata update race condition
   **Location**: `ArchiveStorage.ts:239-244`
   **Risk**: Storage bytes may be incorrectly calculated during concurrent deletes
   **Fix**: Move `getStorageUsed()` call inside the transaction
   ```typescript
   // Current (problematic):
   archivesStore.delete(postHash);
   this.getStorageUsed().then((currentUsage) => { ... });

   // Fix: Read from transaction
   const metaRequest = metadataStore.get('storage_bytes');
   metaRequest.onsuccess = () => { ... };
   ```

2. **Issue**: No timeout on RPC requests
   **Location**: `rpc.ts:93-111`
   **Risk**: Hung connections can freeze UI indefinitely
   **Fix**: Add AbortController with timeout
   ```typescript
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 10000);
   const response = await fetch(url, { signal: controller.signal });
   ```

### Major

1. **Issue**: Silent failure on RPC connection
   **Location**: `useRpc.tsx:79-90`
   **Risk**: Users unaware of connection issues during retry loop
   **Fix**: Add exponential backoff and user notification after N failures

2. **Issue**: LocalStorage JSON parse without validation
   **Location**: `AutoEngageEngine.ts:274-279`
   **Risk**: Corrupted storage crashes application
   **Fix**: Add schema validation or try/catch with reset to defaults
   ```typescript
   try {
     const state = JSON.parse(saved);
     if (!isValidBudgetState(state)) throw new Error('Invalid state');
     // ... use state
   } catch {
     this.resetToDefaults();
   }
   ```

3. **Issue**: Unhandled promise rejection in subscriber callback
   **Location**: `ContentMonitor.ts:253-259`
   **Risk**: One failing subscriber crashes notification loop
   **Fix**: Already wrapped in try/catch (good)

### Minor

1. **Issue**: Blob size calculation may vary
   **Location**: `ArchiveStorage.ts:98`
   **Risk**: Inconsistent storage accounting across browsers
   **Fix**: Use `TextEncoder().encode(JSON.stringify(content)).length`

2. **Issue**: Missing error info in EngageButton
   **Location**: `EngageButton.tsx:59-68`
   **Risk**: Users see only "X" with no explanation
   **Fix**: Add tooltip with error message

---

## Reliability Concerns

### Race Conditions

1. **Singleton initialization race**
   - Location: `ArchiveStorage.ts:406-412`
   - Issue: Multiple components calling `getArchiveStorage()` simultaneously could create multiple init() calls
   - Impact: Potential duplicate IndexedDB connections
   - Fix: Add initialization lock:
   ```typescript
   let _initPromise: Promise<ArchiveStorage> | null = null;

   export async function getArchiveStorage(): Promise<ArchiveStorage> {
     if (!_initPromise) {
       _initPromise = (async () => {
         const storage = new ArchiveStorage();
         await storage.init();
         return storage;
       })();
     }
     return _initPromise;
   }
   ```

2. **Polling restart on space change**
   - Location: `useContentMonitor.ts:99`
   - Issue: `spaces.join(',')` in dependency array could cause frequent restarts
   - Impact: Multiple concurrent polling loops if spaces change quickly

### Failure Modes

| Scenario | Current Behavior | Recommended |
|----------|-----------------|-------------|
| Node offline | Retries every 5s forever | Add backoff, max retries, offline banner |
| IndexedDB full | Throws error, no recovery | Auto-purge old entries, warn user |
| PoW computation fails | Shows error icon briefly | Show error details, allow retry |
| WASM fails to load | ErrorBoundary catches | Good, but add specific WASM reload button |
| localStorage quota | Silently fails | Warn user, offer export/cleanup |

### Recovery Mechanisms

**Existing (Good):**
- ErrorBoundary with retry button (`ErrorBoundary.tsx:69-83`)
- RPC auto-reconnect (`useRpc.tsx:73-98`)
- Daily budget auto-reset (`AutoEngageEngine.ts:255-266`)

**Missing:**
- No exponential backoff on RPC reconnect (linear 5s intervals)
- No persistence of at-risk content (lost on refresh)
- No offline mode with cached data
- No PoW computation retry on failure

### Timeout Configuration

| Operation | Current Timeout | Recommended |
|-----------|----------------|-------------|
| RPC fetch | None (browser default) | 10s with AbortController |
| IndexedDB transaction | None | 30s with error logging |
| PoW computation | Simulated 1s | Should be configurable |
| Polling interval | 60s | Configurable, dynamic based on load |

---

## Recommendations

### Priority 1: Add Basic Test Suite (Critical)

```bash
# Create essential test files
tests/
  services/
    ArchiveStorage.test.ts
    AutoEngageEngine.test.ts
    ContentMonitor.test.ts
  hooks/
    useArchiveStorage.test.tsx
    useContentMonitor.test.tsx
  components/
    EngageButton.test.tsx
```

Target: 60% code coverage on services, 40% on hooks

### Priority 2: Fix RPC Timeout and Retry Logic (High)

Add timeout to all fetch calls and implement exponential backoff:
```typescript
async connect(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${this.baseUrl}/info`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    // ...
  } finally {
    clearTimeout(timeout);
  }
}
```

### Priority 3: Fix Singleton Race Condition (High)

Implement initialization locking for async singletons:
- `getArchiveStorage()` - add promise-based lock
- `getContentMonitor()` - already synchronous (OK)
- `getAutoEngageEngine()` - already synchronous (OK)

### Priority 4: Add Input Validation (Medium)

Validate localStorage data on load to prevent crashes:
- `ArchiverConfig` - validate all fields have expected types
- `BudgetState` - validate date format and numeric bounds
- Add runtime type guards with TypeScript

### Priority 5: Implement Actual PoW (Medium)

Replace mocked engagement with real `@swimchain/react usePow()`:
- `AutoEngageEngine.engage()` currently simulates with `setTimeout`
- Connect to WASM-based PoW computation
- Add progress reporting from actual PoW

---

## Technical Debt Summary

| Item | Description | Effort | Priority |
|------|-------------|--------|----------|
| No tests | Test framework configured but no test files | 3-5 days | Critical |
| Mocked PoW | `AutoEngageEngine.engage()` is simulated | 1-2 days | High |
| Race conditions | Async singleton init not protected | 0.5 days | High |
| No timeouts | RPC calls can hang indefinitely | 0.5 days | High |
| Auto-engage not wired | Toggle exists but logic not connected | 1 day | Medium |
| Auto-archive placeholder | Detection exists, trigger missing | 1 day | Medium |
| Hardcoded spaces | `MOCK_SPACES` in Dashboard | 0.5 days | Low |
| Unused parameter | `_postHash` in EngageButton | 0.25 days | Low |

---

## Code Examples: Good Patterns Found

### Well-Structured State Machine (EngageButton.tsx)
```typescript
type ButtonState = 'idle' | 'mining' | 'complete' | 'error';
const [state, setState] = useState<ButtonState>('idle');
// Clear state transitions with explicit type
```

### Proper Cleanup in Effect (useContentMonitor.ts:95-98)
```typescript
return () => {
  unsubscribe();
  monitor.stopPolling();
};
```

### Safe Error Handling in Subscriber (ContentMonitor.ts:253-259)
```typescript
this.subscribers.forEach((callback) => {
  try {
    callback(content);
  } catch (error) {
    console.error('[ContentMonitor] Error in subscriber callback:', error);
  }
});
```

### Type-Safe Factory Function (types/index.ts:164-173)
```typescript
export function getDefaultConfig(): ArchiverConfig {
  return {
    targetSpaces: [],
    minHeatBeforeArchiving: 0.05,
    // ... complete typed defaults
  };
}
```

---

## Conclusion

The Archiver Client has a **well-architected codebase** with clean separation of concerns, good TypeScript usage, and comprehensive documentation. However, the **complete absence of test files** is a critical gap that undermines confidence in the implementation. The error handling is generally good but lacks timeouts and robust retry logic for network operations.

**Recommended Actions:**
1. Prioritize test coverage - start with service layer tests
2. Add request timeouts to prevent UI freezes
3. Fix singleton race conditions before scaling
4. Wire up actual PoW integration to complete core functionality

**Risk Assessment:** Medium-High due to lack of test coverage and mocked core feature (PoW engagement).
