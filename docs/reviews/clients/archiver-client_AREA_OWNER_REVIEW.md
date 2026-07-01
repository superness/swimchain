# Area Owner Review: Archiver Client

**Generated**: 2026-01-12
**Overall Health Score**: 71/100
**Status**: Needs Attention

## Executive Summary

The Archiver Client demonstrates a solid architectural foundation with well-organized React components, proper TypeScript usage, and correct implementation of Swimchain decay formulas per SPEC_02. However, **the core feature - contributing PoW to save content from decay - is entirely mocked**, meaning users see fake progress animations without any actual work being submitted to the network. Additionally, there are no test files (only test setup), performance bottlenecks at scale, and several UX gaps around onboarding and connection status. Addressing the mocked PoW is the most critical priority as it undermines the entire value proposition of the application.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 78/100 | 🟡 |
| Performance | 65/100 | 🟡 |
| Vision Alignment | 81/100 | 🟢 |
| User Experience | 65/100 | 🟡 |
| Accessibility | 78/100 | 🟡 |
| Quality | 60/100 | 🟡 |
| Security | 82/100 | 🟢 |
| **Overall** | **71/100** | **🟡** |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. PoW Engagement is Completely Mocked
- **Source**: Functionality, Vision, UX Reviews
- **Severity**: Critical
- **Description**: `AutoEngageEngine.engage()` simulates PoW with a 100ms `setTimeout` instead of computing actual Argon2id proof-of-work. The `postHash` parameter is ignored (`postHash: _postHash`).
- **Impact**: Users believe they're preserving content when nothing happens. This defeats the "mining IS paying" vision and renders the core feature useless.
- **Location**: `src/services/AutoEngageEngine.ts:140-148`, `src/components/EngageButton.tsx:47-50`
- **Action**: Integrate `@swimchain/react usePow()` hook or use `hash-wasm` directly for Argon2id computation
- **Effort**: L

### 2. Zero Test Coverage
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: Test framework (Vitest) is configured but `tests/` directory only contains `setup.ts`. No actual test files exist for 3 services totaling 1,000+ lines.
- **Impact**: Any refactoring or bug fixes risk introducing regressions. Core decay calculations have no verification.
- **Location**: `tests/` directory
- **Action**: Add unit tests for `ArchiveStorage`, `AutoEngageEngine`, `ContentMonitor` services targeting 60% coverage
- **Effort**: L

### 3. Dashboard Uses Hardcoded Mock Spaces
- **Source**: Functionality, UX Reviews
- **Severity**: Critical
- **Description**: Dashboard ignores user-configured `targetSpaces` from Settings and uses hardcoded mock data instead.
- **Impact**: Settings changes have no effect; users cannot monitor their chosen spaces.
- **Location**: `src/pages/Dashboard.tsx`
- **Action**: Load `targetSpaces` from localStorage config and pass to `useContentMonitor()`
- **Effort**: S

## High Priority Issues

### 1. No RPC Request Timeouts
- **Source**: Security, Quality Reviews
- **Severity**: High
- **Description**: All fetch calls in `src/lib/rpc.ts` lack `AbortController` timeouts, allowing node unavailability to hang the UI indefinitely.
- **Impact**: Unresponsive UI when node is slow or offline; poor error recovery.
- **Location**: `src/lib/rpc.ts`
- **Action**: Add 10-second timeout via `AbortController` to all RPC calls
- **Effort**: S

### 2. Auto-Archive Trigger Not Implemented
- **Source**: Functionality, Vision Reviews
- **Severity**: High
- **Description**: No code connects `ContentMonitor` to `ArchiveStorage`. Content at risk is never automatically preserved.
- **Impact**: Users must manually archive each piece of content; defeats automation goal.
- **Location**: `src/services/ContentMonitor.ts` polling cycle
- **Action**: Add archive trigger when content drops below `minHeatBeforeArchiving` threshold
- **Effort**: M

### 3. Auto-Engage Toggle Has No Effect
- **Source**: Functionality, UX Reviews
- **Severity**: High
- **Description**: The "Enable Auto-Engage" checkbox in Settings persists to localStorage but is never read by ContentMonitor.
- **Impact**: Users expect automatic engagement but get none regardless of setting.
- **Location**: `src/pages/Settings.tsx`, `src/services/ContentMonitor.ts`
- **Action**: Wire toggle to ContentMonitor; call AutoEngageEngine.engage() during polling when enabled
- **Effort**: M

### 4. BudgetMeter 1-Second Polling
- **Source**: Performance Review
- **Severity**: High
- **Description**: BudgetMeter polls AutoEngageEngine every 1 second via `setInterval`, causing 60 unnecessary re-renders per minute.
- **Impact**: Wasted CPU cycles; poor battery life on mobile; blocks React concurrent features.
- **Location**: `src/components/BudgetMeter.tsx:16-23`
- **Action**: Replace polling with event subscription pattern (pub/sub like ContentMonitor)
- **Effort**: S

### 5. O(n) Full-Table Scan for Search
- **Source**: Performance Review
- **Severity**: High
- **Description**: `ArchiveStorage.searchArchive()` loads ALL entries into memory, then filters with `.includes()`.
- **Impact**: Slow search with 1,000+ entries; high memory usage.
- **Location**: `src/services/ArchiveStorage.ts:201-212`
- **Action**: Implement IndexedDB cursor-based filtering or add client-side search index (flexsearch)
- **Effort**: M

## Medium Priority Issues

### 1. Singleton Race Condition
- **Source**: Quality, Security Reviews
- **Severity**: Medium
- **Description**: `getArchiveStorage()` returns instance before async `init()` completes, potentially allowing operations on uninitialized database.
- **Impact**: Rare but possible crashes on fast renders.
- **Location**: `src/services/ArchiveStorage.ts:406-412`
- **Action**: Use promise-based initialization lock
- **Effort**: S

### 2. No Live Region Announcements
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Dynamic content updates (at-risk list changes, PoW completion) are not announced to screen readers.
- **Impact**: Screen reader users miss important status changes.
- **Location**: `src/components/AtRiskList.tsx`, `src/components/EngageButton.tsx`
- **Action**: Add `aria-live="polite"` region for status updates
- **Effort**: S

### 3. No Connection Status Visibility
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Users cannot see if the node is connected, disconnected, or reconnecting. `useRpc` tracks this but UI doesn't display it.
- **Impact**: Confusing behavior when node is down; users don't know why content isn't loading.
- **Location**: `src/pages/Dashboard.tsx`
- **Action**: Add connection status banner using `useRpc().connected` state
- **Effort**: S

### 4. JSON.parse Without Validation
- **Source**: Security Review
- **Severity**: Medium
- **Description**: Settings page loads config with `JSON.parse(localStorage.getItem())` without try-catch or schema validation.
- **Impact**: Corrupted localStorage crashes the app.
- **Location**: `src/pages/Settings.tsx:22-28`
- **Action**: Wrap in try-catch, validate with zod or manual checks, fallback to defaults
- **Effort**: S

### 5. N+1 RPC Query Pattern
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: ContentMonitor fetches content for each space sequentially instead of in parallel.
- **Impact**: Linear scaling of load time with space count.
- **Location**: `src/services/ContentMonitor.ts:120-153`
- **Action**: Use `Promise.all()` to parallelize space queries
- **Effort**: S

### 6. No First-Run Onboarding
- **Source**: UX Review
- **Severity**: Medium
- **Description**: New users land on Dashboard without explanation of decay, heat, PoW, or how to configure spaces.
- **Impact**: Confusion; users don't understand the app's purpose or how to use it.
- **Action**: Add first-run modal explaining decay system and prompting space configuration
- **Effort**: M

### 7. Missing React Memoization
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `criticalCount` and `warningCount` in `useContentMonitor` are recalculated on every render without `useMemo`.
- **Impact**: Unnecessary computations; wasted CPU.
- **Location**: `src/hooks/useContentMonitor.ts:58-59`
- **Action**: Wrap derived values in `useMemo()`
- **Effort**: S

## Quick Wins (Low Effort, High Impact)

1. **Wire settings to Dashboard**: Load `targetSpaces` from localStorage instead of hardcoding - **S effort, Critical impact**
2. **Add RPC timeouts**: 10-second AbortController on fetch calls - **S effort, High impact**
3. **Replace BudgetMeter polling**: Event subscription instead of 1s setInterval - **S effort, High impact**
4. **Parallelize RPC calls**: `Promise.all()` for multi-space queries - **S effort, Medium impact**
5. **Add memoization**: `useMemo` for derived counts in hooks - **S effort, Medium impact**
6. **Wrap JSON.parse in try-catch**: Prevent crash on corrupt localStorage - **S effort, Medium impact**
7. **Add aria-live region**: Announce status changes to screen readers - **S effort, Medium impact**
8. **Add connection status banner**: Show connected/disconnected state - **S effort, Medium impact**

## Strengths to Preserve

- **Correct decay formula implementation**: SPEC_02 compliant with accurate half-life, floor, and threshold calculations
- **Clean service architecture**: Well-separated singleton services with pub/sub patterns
- **Strong TypeScript usage**: Comprehensive type definitions with branded types for IDs
- **Good IndexedDB implementation**: Schema versioning, quota enforcement, proper transaction handling
- **Proper error boundary**: Catches React errors with WASM-specific hints and recovery options
- **Accessibility foundation**: ARIA roles, keyboard support, focus indicators present throughout
- **Vision alignment**: Local-first, user-empowered design matches decentralization principles
- **Security posture**: No secrets stored, read-only node access, conservative defaults

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **P0**: Implement real PoW via `@swimchain/react usePow()` or `hash-wasm` Argon2id
- [ ] **P0**: Wire Dashboard to use `targetSpaces` from Settings (not hardcoded)
- [ ] **P0**: Add 10-second timeout to all RPC calls
- [ ] **P1**: Add basic test suite for 3 core services (target 60% coverage)
- [ ] **P1**: Replace BudgetMeter polling with event subscription
- [ ] **P1**: Parallelize multi-space RPC queries with `Promise.all()`

### Short Term (Next 2-4 Weeks)
- [ ] Wire auto-engage toggle to ContentMonitor polling cycle
- [ ] Implement auto-archive trigger when content drops below threshold
- [ ] Add connection status banner to Dashboard
- [ ] Add first-run onboarding modal
- [ ] Implement cursor-based or indexed search for archives
- [ ] Add `aria-live` regions for status announcements
- [ ] Fix singleton initialization race condition
- [ ] Add JSON.parse error handling with fallback

### Long Term (Backlog)
- [ ] Add pagination for archive listing (currently loads all)
- [ ] Implement archive export functionality
- [ ] Add `prefers-reduced-motion` support
- [ ] Replace `window.confirm()` with styled accessible modals
- [ ] Add pool window tracking to prevent wasted PoW contributions
- [ ] Consider IndexedDB schema migration strategy for future changes
- [ ] Add real-time search (debounced) instead of button-triggered
- [ ] Implement optimistic updates for better perceived performance

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Mocked PoW implementation | L | H | 1 |
| Zero test coverage | L | H | 1 |
| Hardcoded mock spaces | S | H | 1 |
| No RPC timeouts | S | H | 2 |
| BudgetMeter 1s polling | S | M | 2 |
| N+1 RPC queries | S | M | 3 |
| Singleton race condition | S | M | 3 |
| Missing memoization | S | L | 4 |
| O(n) archive search | M | M | 4 |
| Console logs in production | S | L | 5 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users think they're preserving content (mocked PoW) | H | H | Implement real PoW ASAP |
| App hangs on node unavailability | M | H | Add RPC timeouts |
| Regressions during development | M | M | Add test coverage |
| Performance degradation at scale | M | M | Fix O(n) patterns, add pagination |
| Corrupted localStorage crashes app | L | M | Add try-catch with fallback |
| IndexedDB migration breaks archives | L | H | Plan migration strategy before schema changes |
| Screen reader users miss updates | M | L | Add aria-live regions |

## Appendix: Detailed Review Summaries

### Functionality (78/100)
The archiver demonstrates solid architectural fundamentals with well-layered services, hooks, and components. Core decay calculations correctly implement SPEC_02 with proper half-life formula (7 days), 48-hour floor, and 6.25% threshold. However, the critical gap is that **PoW engagement is entirely mocked** - users see progress animations but no actual proof-of-work is computed or submitted. The `postHash` parameter is explicitly ignored (`postHash: _postHash`). Other gaps include: Dashboard uses hardcoded mock spaces (ignoring Settings), auto-archive trigger not implemented, and auto-engage toggle has no effect. The IndexedDB archive storage is well-implemented with proper quota enforcement, schema versioning, and search capabilities. Priority calculation formula is sound: `(heatUrgency * 0.5) + (replyValue * 0.3) + (poolProgress * 0.2)`.

### Performance (65/100)
Reasonable performance for typical use (hundreds of entries, few spaces) but significant scalability concerns. Key bottlenecks: BudgetMeter polls every 1 second via `setInterval` (60 re-renders/minute), archive search does O(n) full-table scan loading all entries to memory with `.includes()`, ContentMonitor uses N+1 RPC pattern (sequential calls per space), derived values like `criticalCount`/`warningCount` lack `useMemo()`, and O(n^2) array spreading in ArchivedContent (`[...existing, entry]` in loop). Quick wins available: replace polling with subscriptions, parallelize with `Promise.all()`, add `useMemo()` for computed values. For scale, need indexed search (flexsearch) and pagination. Bundle size is acceptable with hash-wasm (~20KB) and react-router-dom (~50KB).

### Vision Alignment (81/100)
Strong alignment with Swimchain's decentralized principles. Local-first architecture with IndexedDB storage, user controls over budgets and spaces, correct decay formula implementation treating computational work as currency via PoW budget visualization. The critical gap is that mocked PoW **defeats the "mining IS paying" principle** - the core vision element where users contribute real computational resources. Additional concerns: no mechanism to re-publish archived content back to the network, pool window tracking needed to prevent wasted contributions (PoW submitted outside window is wasted). Positive: no central servers required, user has full control over preservation priorities, archived content stored locally not on third-party services.

### User Experience (65/100)
Basic flows work with clear urgency communication (color-coded badges for critical/warning/normal, status cards) and proper navigation. However, UX is significantly hampered by: mocked PoW (core feature doesn't work - users see fake progress), hardcoded spaces (Settings has no effect on Dashboard), lack of onboarding for Swimchain concepts (no explanation of decay, heat, PoW), no connection status visibility (users don't know when node is down), auto-engage toggle does nothing, and `window.confirm()` dialogs instead of styled modals. Missing features: bulk engagement selection, keyboard shortcuts, real-time search. Positive elements include good information hierarchy, human-readable time formatting ("1h 30m"), keyboard support with tabIndex and Enter/Space handlers, and expandable item patterns.

### Accessibility (78/100)
Good foundational approach with documented WCAG 2.1 AA goals. Proper ARIA usage on key components: AtRiskList has `role="list"`, `aria-label`, `aria-expanded`; BudgetMeter has `role="progressbar"`, `aria-valuenow`, `aria-valuemax`; StatusCard has `role="status"`. Keyboard navigation with tabIndex and Enter/Space handlers present. Gaps include: missing live region announcements for dynamic content (at-risk list updates, PoW completion not announced to screen readers), pool progress bar missing proper `role="progressbar"` attributes in some places, native `confirm()` dialogs are poor for screen readers and mobile, color contrast on urgency badges needs verification, no `prefers-reduced-motion` check for animations. Skip link CSS class exists but skip link not actually rendered.

### Quality (60/100)
Clean code architecture with well-separated services/hooks/components and comprehensive JSDoc documentation. Strong TypeScript with branded types (`SpaceId`, `ContentHash`), proper async data pattern throughout. However: **zero test files exist** - only `tests/setup.ts` despite 1,000+ lines of service code (ArchiveStorage: 413, AutoEngageEngine: 317, ContentMonitor: 275). Singleton initialization has race conditions (`getArchiveStorage()` async init not protected). No retry logic for failed RPC calls. Mocked PoW undermines reliability claims. Inconsistent state patterns: ContentMonitor uses pub/sub while BudgetMeter uses polling. ErrorBoundary with WASM-specific hints is well done. Missing AbortController for async hooks could cause state updates on unmounted components.

### Security (82/100)
Low-risk profile appropriate for a local-first, read-only monitoring app. No hardcoded secrets, no innerHTML/XSS vectors (React escapes by default), no private keys or PII stored, read-only node access (principle of least privilege). Conservative defaults: 50GB storage, 1 hour daily PoW budget. Minor gaps: no fetch timeouts (hang risk on node unavailability), `JSON.parse(localStorage)` without try-catch (crash risk on corruption), space IDs not validated for bech32m format before adding to config, console logging in production, error messages exposed in production ErrorBoundary. IndexedDB content unencrypted at rest (acceptable for non-sensitive archives). Overall security posture is appropriate - most sensitive operations (actual PoW, signing) would be delegated to WASM modules.

---

*Review synthesized from 7 expert perspectives*
*Overall completion: 84% documented features, 58% fully functional*
*Critical action: Implement real PoW before user-facing release*
