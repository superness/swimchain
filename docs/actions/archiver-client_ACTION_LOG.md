# Action Log: Archiver Client

**Generated**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/clients/archiver-client_AREA_OWNER_REVIEW.md
**Overall Review Score**: 71/100

---

## Summary

- **Total issues reviewed**: 15 (3 CRITICAL, 5 HIGH, 7 MEDIUM)
- **Auto-fixed (S-effort)**: 8
- **Flagged for review (M/L-effort)**: 7
- **Skipped**: 0

---

## FIXED Issues

### FIXED: C3 - Dashboard Uses Hardcoded Mock Spaces

**Changes Made**
- `src/pages/Dashboard.tsx:16-56`: Replaced hardcoded `MOCK_SPACES` array with `loadTargetSpaces()` function that reads from localStorage config
- Added `useEffect` hook to reload spaces when returning from Settings page (listens to both `storage` and `focus` events)
- Updated all references from `MOCK_SPACES` to `targetSpaces` state variable
- Added prompt when no spaces are configured, directing users to Settings

**Files Modified**
- `archiver-client/src/pages/Dashboard.tsx`

**Status**: FIXED

---

### FIXED: H1 - No RPC Request Timeouts

**Changes Made**
- `src/lib/rpc.ts:22-53`: Added `fetchWithTimeout()` helper function using `AbortController`
- Default timeout set to 10 seconds (`RPC_TIMEOUT_MS = 10_000`)
- Updated all 6 fetch calls in `SwimchainRpc` class to use `fetchWithTimeout()`
- Proper error handling converts `AbortError` to user-friendly timeout message

**Files Modified**
- `archiver-client/src/lib/rpc.ts`

**Status**: FIXED

---

### FIXED: H4 - BudgetMeter 1-Second Polling

**Changes Made**
- `src/services/AutoEngageEngine.ts:21,254-283`: Added `BudgetSubscriber` type and `budgetSubscribers` Set
- Added `subscribeToBudget()` method for event-based subscription
- Added `notifyBudgetSubscribers()` method to broadcast state changes
- Modified `recordEngagement()` and `resetDailyBudgetIfNeeded()` to notify subscribers
- `src/components/BudgetMeter.tsx:16-24`: Replaced `setInterval(1000)` polling with `subscribeToBudget()` subscription

**Files Modified**
- `archiver-client/src/services/AutoEngageEngine.ts`
- `archiver-client/src/components/BudgetMeter.tsx`

**Status**: FIXED

---

### FIXED: M1 - Singleton Race Condition

**Changes Made**
- `src/services/ArchiveStorage.ts:405-427`: Added `_initPromise` variable to track initialization in progress
- `getArchiveStorage()` now checks `isInitialized()` first, then returns pending promise if initialization is in progress
- Uses promise-based lock pattern to prevent multiple concurrent `init()` calls

**Files Modified**
- `archiver-client/src/services/ArchiveStorage.ts`

**Status**: FIXED

---

### FIXED: M2 - No Live Region Announcements

**Changes Made**
- `src/components/EngageButton.tsx:19-31,40,50,68,79,113-116`: Added `getStatusMessage()` helper function
- Added `statusMessage` state that updates during PoW lifecycle
- Added `aria-live="polite"` region with `role="status"` for screen reader announcements
- `src/components/EngageButton.css:68-79`: Added `.sr-only` class for visually hidden but accessible text

**Files Modified**
- `archiver-client/src/components/EngageButton.tsx`
- `archiver-client/src/components/EngageButton.css`

**Status**: FIXED

---

### FIXED: M3 - No Connection Status Visibility

**Changes Made**
- `src/pages/Dashboard.tsx:41,80-98`: Added `connected` and `connecting` from `useRpc()` hook
- Added connection status banner at top of Dashboard with `role="status"` and `aria-live="polite"`
- Shows "Connecting to node..." or "Disconnected from node" messages

**Files Modified**
- `archiver-client/src/pages/Dashboard.tsx`

**Status**: FIXED

---

### FIXED: M5 - N+1 RPC Query Pattern

**Changes Made**
- `src/services/ContentMonitor.ts:118-129`: Replaced sequential `for...of` loop with `Promise.all()` for parallel space fetching
- Each space query now runs concurrently
- Individual failures are caught per-space without blocking others

**Files Modified**
- `archiver-client/src/services/ContentMonitor.ts`

**Status**: FIXED

---

### FIXED: M7 - Missing React Memoization

**Changes Made**
- `src/hooks/useContentMonitor.ts:5`: Added `useMemo` to imports
- `src/hooks/useContentMonitor.ts:57-65`: Wrapped `criticalCount` and `warningCount` calculations in `useMemo()` with `[atRiskContent]` dependency

**Files Modified**
- `archiver-client/src/hooks/useContentMonitor.ts`

**Status**: FIXED

---

## NEEDS_HUMAN_REVIEW Issues

### NEEDS_HUMAN_REVIEW: C1 - PoW Engagement is Completely Mocked

**Why Not Auto-Implemented**
- Effort: L (Large)
- Scope: Core functionality change requiring integration with external PoW library
- Risk: Security-critical feature affecting network integrity

**Recommended Implementation Plan**
1. Install `@swimchain/react` package or `hash-wasm` for Argon2id
2. Create `usePow()` hook wrapper in `src/hooks/usePow.ts`
3. Update `AutoEngageEngine.engage()` to call actual Argon2id computation
4. Update `EngageButton` to use real PoW instead of mocked timeout
5. Add progress tracking based on actual hash iterations
6. Add error handling for WASM loading failures
7. Add comprehensive tests for PoW integration

**Files Involved**
- `src/services/AutoEngageEngine.ts:140-148` (replace mock with real PoW)
- `src/components/EngageButton.tsx:47-50` (use actual postHash)
- New file: `src/hooks/usePow.ts`

**Estimated Effort**: 2-3 days including WASM testing

**Status**: NEEDS_HUMAN_REVIEW

---

### NEEDS_HUMAN_REVIEW: C2 - Zero Test Coverage

**Why Not Auto-Implemented**
- Effort: L (Large)
- Scope: Requires writing 20+ test files covering 1,000+ lines of service code
- Risk: Tests need domain expertise to write meaningful assertions

**Recommended Implementation Plan**
1. Add unit tests for `ArchiveStorage.ts`:
   - `archiveContent()` with quota enforcement
   - `getArchivedContent()` with filtering
   - `searchArchive()` with edge cases
   - `deleteEntry()` with storage recalculation
2. Add unit tests for `AutoEngageEngine.ts`:
   - `calculatePriority()` formula verification
   - `shouldAutoEngage()` policy checks
   - Budget management and daily reset
3. Add unit tests for `ContentMonitor.ts`:
   - `calculateSurvival()` SPEC_02 formula
   - `estimateDecayTime()` calculations
   - `classifyUrgency()` threshold checks
4. Add integration tests for hooks
5. Target 60% coverage minimum

**Files Involved**
- New: `tests/services/ArchiveStorage.test.ts`
- New: `tests/services/AutoEngageEngine.test.ts`
- New: `tests/services/ContentMonitor.test.ts`
- New: `tests/hooks/useContentMonitor.test.ts`

**Estimated Effort**: 3-5 days for 60% coverage

**Status**: NEEDS_HUMAN_REVIEW

---

### NEEDS_HUMAN_REVIEW: H2 - Auto-Archive Trigger Not Implemented

**Why Not Auto-Implemented**
- Effort: M (Medium)
- Scope: Multi-file change connecting ContentMonitor to ArchiveStorage
- Risk: Needs careful design to avoid over-archiving or storage exhaustion

**Recommended Implementation Plan**
1. Add `autoArchiveEnabled` config option
2. Add `archiveContentAtRisk()` method to ContentMonitor
3. In polling cycle, check content below `minHeatBeforeArchiving` threshold
4. Call ArchiveStorage to persist content before it decays
5. Add UI feedback when auto-archive occurs
6. Consider rate limiting to prevent archive storms

**Files Involved**
- `src/services/ContentMonitor.ts` (add archive trigger in polling)
- `src/types/index.ts` (add autoArchiveEnabled config)
- `src/pages/Settings.tsx` (add toggle)

**Estimated Effort**: 1-2 days

**Status**: NEEDS_HUMAN_REVIEW

---

### NEEDS_HUMAN_REVIEW: H3 - Auto-Engage Toggle Has No Effect

**Why Not Auto-Implemented**
- Effort: M (Medium)
- Scope: Multi-file change wiring Settings toggle to ContentMonitor behavior
- Risk: Needs careful integration with mocked PoW (blocked by C1)

**Recommended Implementation Plan**
1. Load `enableAutoEngage` from config in ContentMonitor
2. Add `checkAndAutoEngage()` method called during polling
3. When enabled and content below threshold, call `AutoEngageEngine.engage()`
4. Add rate limiting to prevent budget exhaustion
5. Show indicator when auto-engage is active

**Files Involved**
- `src/services/ContentMonitor.ts` (read config, trigger engagement)
- `src/services/AutoEngageEngine.ts` (may need queue management)

**Estimated Effort**: 1-2 days (blocked by C1 - PoW implementation)

**Status**: NEEDS_HUMAN_REVIEW

---

### NEEDS_HUMAN_REVIEW: H5 - O(n) Full-Table Scan for Search

**Why Not Auto-Implemented**
- Effort: M (Medium)
- Scope: Requires either IndexedDB cursor implementation or adding search library
- Risk: Performance change that needs benchmarking

**Recommended Implementation Plan**

**Option A: IndexedDB Cursor (simpler)**
1. Replace `store.getAll()` with cursor-based iteration
2. Filter during iteration instead of loading all to memory
3. Add early termination when result limit reached

**Option B: Client-Side Search Index (better UX)**
1. Add `flexsearch` or `minisearch` package
2. Build search index on archive load
3. Update index on archive/delete operations
4. Query index instead of scanning IndexedDB

**Files Involved**
- `src/services/ArchiveStorage.ts:201-212`
- Possibly new: `src/services/SearchIndex.ts`

**Estimated Effort**: 1-2 days

**Status**: NEEDS_HUMAN_REVIEW

---

### NEEDS_HUMAN_REVIEW: M4 - JSON.parse Without Validation

**Why Not Auto-Implemented**
- The Settings page already has try-catch wrapping at lines 21-28
- Additional validation (zod schema) would be M-effort

**Current State**
- Settings already has basic try-catch for JSON.parse
- Falls back to defaults on parse error
- No schema validation for individual fields

**Recommended Enhancement (Future)**
1. Add zod schema for ArchiverConfig
2. Validate parsed config against schema
3. Provide field-level error messages

**Status**: ALREADY PARTIALLY HANDLED (basic try-catch exists)

---

### NEEDS_HUMAN_REVIEW: M6 - No First-Run Onboarding

**Why Not Auto-Implemented**
- Effort: M (Medium)
- Scope: New feature requiring modal component, content, and state management
- Risk: UX design decision needed

**Recommended Implementation Plan**
1. Add `hasSeenOnboarding` flag to localStorage
2. Create `OnboardingModal` component explaining:
   - Content decay and heat system
   - How PoW engagement saves content
   - How to configure target spaces
3. Show modal on first visit when flag is false
4. Add "Don't show again" checkbox

**Files Involved**
- New: `src/components/OnboardingModal.tsx`
- New: `src/components/OnboardingModal.css`
- `src/pages/Dashboard.tsx` (render modal conditionally)
- `src/types/constants.ts` (add storage key)

**Estimated Effort**: 1 day

**Status**: NEEDS_HUMAN_REVIEW

---

## Validation

**TypeScript Check**: PASSED

```
$ npx tsc --noEmit
(no errors)
```

**Build Check**: PASSED

```
$ npm run build
✓ 105 modules transformed.
✓ built in 2.31s
```

**ESLint**: PASSED (for modified files)

- Fixed unused variable `_isLoadingStorage` in Dashboard.tsx during validation
- 3 pre-existing lint errors in unmodified files (AtRiskList.tsx, ArchivedContent.tsx)

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Wire settings, connection banner, empty state |
| `src/lib/rpc.ts` | Add 10s timeout to all fetch calls |
| `src/services/AutoEngageEngine.ts` | Add budget subscription system |
| `src/components/BudgetMeter.tsx` | Replace polling with subscription |
| `src/services/ArchiveStorage.ts` | Fix singleton race condition |
| `src/components/EngageButton.tsx` | Add aria-live announcements |
| `src/components/EngageButton.css` | Add .sr-only class |
| `src/services/ContentMonitor.ts` | Parallelize RPC queries |
| `src/hooks/useContentMonitor.ts` | Add useMemo for counts |

---

## Next Steps

1. **Immediate (Blocking)**: Implement real PoW (C1) - this blocks H3 auto-engage
2. **High Priority**: Add test coverage (C2)
3. **Medium Priority**: Wire auto-archive (H2), optimize search (H5)
4. **Nice to Have**: First-run onboarding (M6)

---

*Action log generated by Issue Implementer*
