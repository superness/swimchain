# Area Owner Review: Search Client

**Generated**: 2026-01-12
**Overall Health Score**: 68/100
**Status**: Needs Attention

## Executive Summary

The Search Client is a well-architected Google-style search interface with solid core functionality including advanced query syntax, XSS-safe highlighting, and Ed25519 signature authentication. However, **critical security gaps** (plaintext private key storage, missing postMessage origin validation) and **zero test coverage** prevent production readiness. The client strongly aligns with Swimchain's decentralization vision but is missing key spec requirements (heat/decay visualization, engagement pool display). Immediate priorities are encrypting identity storage, fixing accessibility gaps in the combobox pattern, and addressing the missing useEffect dependencies causing potential stale closure bugs.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 82/100 | 🟢 |
| Performance | 65/100 | 🟡 |
| Vision Alignment | 80/100 | 🟢 |
| User Experience | 70/100 | 🟡 |
| Accessibility | 72/100 | 🟡 |
| Quality & Reliability | 55/100 | 🟡 |
| Security | 68/100 | 🟡 |
| **Overall** | **68/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Plaintext Private Key Storage
- **Source**: Security Review
- **Severity**: Critical (CVSS 8.1)
- **Description**: Identity seed (private key) stored in localStorage as plaintext hex. Any XSS vulnerability or malicious browser extension can extract the key.
- **Impact**: Complete identity compromise - attacker can permanently impersonate user with no recovery possible.
- **Action**: Encrypt seed with user passphrase using PBKDF2 + AES-GCM before localStorage storage.
- **Effort**: M
- **Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:124-125`

### 2. Missing postMessage Origin Validation
- **Source**: Security Review, Functionality Review
- **Severity**: Critical (CVSS 7.4)
- **Description**: When running in an iframe, any parent frame can inject RPC config via postMessage, redirecting all traffic to attacker-controlled server.
- **Impact**: Search queries leak to attacker, fake results returned, signature analysis possible.
- **Action**: Whitelist allowed parent origins before accepting SWIMCHAIN_RPC_CONFIG messages.
- **Effort**: S
- **Location**: `search-client/src/hooks/useParentRpcConfig.ts:25-41`

### 3. useEffect Missing Dependencies
- **Source**: Quality Review, Functionality Review
- **Severity**: Critical
- **Description**: The tab/sort change useEffect is missing `query`, `parsedQuery`, `filters`, `rpc`, and `buildSearchParams` from its dependency array, causing stale closures.
- **Impact**: Search may use outdated query/filter values, producing incorrect results.
- **Action**: Add all dependencies to the array or restructure to avoid stale closures.
- **Effort**: S
- **Location**: `useSearch.ts:275-296`

### 4. Missing ARIA Controls Linking (WCAG 4.1.2)
- **Source**: Accessibility Review
- **Severity**: Critical
- **Description**: Combobox input missing `aria-controls`, suggestion listbox missing `id`. Screen reader users cannot associate input with suggestions.
- **Impact**: Screen reader users cannot effectively use autocomplete functionality.
- **Action**: Add `aria-controls="search-suggestions-listbox"` to input, add `id="search-suggestions-listbox"` to listbox.
- **Effort**: S
- **Location**: `SearchBar.tsx:181-198,224`

### 5. No AbortController in Tab/Sort Re-search
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: When user rapidly changes tabs or sort, previous searches are not cancelled, causing race conditions.
- **Impact**: Stale results may overwrite newer results.
- **Action**: Add AbortController to the tab/sort useEffect with cleanup.
- **Effort**: S
- **Location**: `useSearch.ts:275-296`

## High Priority Issues

### 1. Zero Test Coverage
- **Source**: Quality Review
- **Severity**: High
- **Description**: Vitest + React Testing Library configured but no test files exist. Pure functions like queryParser and highlighter are easy wins.
- **Impact**: Cannot safely refactor; regressions go undetected.
- **Action**: Add unit tests for `queryParser.ts` and `highlighter.ts` as priority targets.
- **Effort**: M
- **Location**: `src/lib/__tests__/`

### 2. Missing Heat/Decay Visualization
- **Source**: Vision Review
- **Severity**: High
- **Description**: CLIENT_DESIGN.md spec mandates heat % display with visual states (100%, 60%, 20%, 5%, decayed) on result cards. Not implemented.
- **Impact**: Users cannot see content health - core Swimchain differentiator missing.
- **Action**: Add heat display to result cards with visual degradation states.
- **Effort**: M
- **Location**: `ResultCard/*.tsx`

### 3. Missing Engagement Pool Display
- **Source**: Vision Review
- **Severity**: High
- **Description**: Spec shows "45s/60s, 12 contributors" engagement pool progress. Not implemented.
- **Impact**: Users cannot see engagement status - core Swimchain feature missing.
- **Action**: Display pool progress and contributor count on result cards.
- **Effort**: M
- **Location**: `ResultCard/*.tsx`

### 4. No Skip-to-Main Link (WCAG 2.4.1)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: No skip link for keyboard users to bypass header navigation.
- **Impact**: Keyboard users must tab through entire header on every page.
- **Action**: Add visually hidden skip link that becomes visible on focus.
- **Effort**: S
- **Location**: `Home.tsx`, `Results.tsx`

### 5. HTTP Endpoints for Remote Seeds
- **Source**: Security Review
- **Severity**: High (CVSS 5.9)
- **Description**: Remote testnet seeds use HTTP, allowing MITM attacks.
- **Impact**: Attackers can modify search results or capture signatures.
- **Action**: Change to HTTPS endpoints; add TLS cert on servers.
- **Effort**: S (client) / M (server)
- **Location**: `rpc.ts:414-420`

### 6. No Component Memoization
- **Source**: Performance Review
- **Severity**: High
- **Description**: Result cards lack React.memo, causing unnecessary re-renders on any state change.
- **Impact**: At 20+ results, all cards re-render when tab, sort, or loading changes.
- **Action**: Wrap result components in React.memo with custom comparator.
- **Effort**: S
- **Location**: `ResultCard/*.tsx`

### 7. Identity Polling Every 1 Second
- **Source**: Performance Review
- **Severity**: High
- **Description**: Identity check polls localStorage every 1 second instead of using storage event.
- **Impact**: Continuous localStorage reads, potential battery drain on mobile.
- **Action**: Replace polling with `window.addEventListener('storage', ...)`.
- **Effort**: M
- **Location**: `useRpc.tsx:167-186`

### 8. No Identity Backup/Export
- **Source**: UX Review
- **Severity**: High
- **Description**: Users cannot backup their identity seed phrase. If browser data cleared, identity is lost forever.
- **Impact**: Users permanently lose on-chain reputation with no recovery path.
- **Action**: Add seed phrase display after generation and "Export Identity" button.
- **Effort**: M
- **Location**: `IdentityPage.tsx`

## Medium Priority Issues

### 1. Date Range Filter Non-Functional
- **Source**: UX Review, Functionality Review
- **Severity**: Medium
- **Description**: Date range filter UI exists and is interactive, but `onDateRangeChange` not wired.
- **Impact**: Filter appears broken to users.
- **Action**: Connect handler in Results.tsx, update useSearch.
- **Effort**: S
- **Location**: `SearchFilters.tsx:40-57`, `Results.tsx`

### 2. No Loading Skeletons
- **Source**: UX Review, Performance Review
- **Severity**: Medium
- **Description**: Only shows spinner during search. Jarring layout shift when results appear.
- **Impact**: Poor perceived performance.
- **Action**: Create skeleton versions of result cards; show during loading.
- **Effort**: M
- **Location**: `SearchResults.tsx:149-154`

### 3. Missing prefers-reduced-motion Support
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: CSS animations don't respect motion preferences.
- **Impact**: Users with vestibular disorders affected by transitions.
- **Action**: Add media query to disable animations when reduced motion preferred.
- **Effort**: S
- **Location**: `globals.css`

### 4. Page Numbers Not Clickable
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Page number buttons are rendered and styled but only "Next" button works.
- **Impact**: Confusing UI - pagination appears broken.
- **Action**: Add onClick handlers or switch to infinite scroll.
- **Effort**: S
- **Location**: `Pagination.tsx:81-90`

### 5. No Result Caching
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: Identical searches within session always hit network.
- **Impact**: Wasted bandwidth, slower repeated searches.
- **Action**: Add LRU cache with 5-minute TTL for search results.
- **Effort**: M
- **Location**: `useSearch.ts`

### 6. Comparison Operators Lose Semantics
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `replies:<5` and `replies:>5` both return 5 as minimum - operator ignored.
- **Impact**: Unexpected search results for advanced users.
- **Action**: Return `{ operator, value }` structure from parser.
- **Effort**: S
- **Location**: `queryParser.ts:196-198`

### 7. excludeTerms Not Sent to RPC
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Exclude terms (`-term`) are parsed but never included in search params.
- **Impact**: Exclude operator silently fails.
- **Action**: Add excludeTerms to buildSearchParams.
- **Effort**: S
- **Location**: `useSearch.ts:72-153`

### 8. No Connection Status Indicator
- **Source**: Quality Review, UX Review
- **Severity**: Medium
- **Description**: Hook exists but no UI shows connection/sync status.
- **Impact**: Users don't know if node is reachable or synced.
- **Action**: Add connection status component to header.
- **Effort**: M
- **Location**: New component

### 9. No Session Timeout
- **Source**: Security Review
- **Severity**: Medium
- **Description**: Once authenticated, session never expires.
- **Impact**: If user leaves browser open, identity remains accessible.
- **Action**: Add configurable timeout that clears keypair after inactivity.
- **Effort**: M
- **Location**: `useRpc.tsx`

### 10. Missing lang Attribute (WCAG 3.1.1)
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: `<html>` element missing `lang` attribute.
- **Impact**: Screen readers may use wrong pronunciation.
- **Action**: Add `lang="en"` to index.html.
- **Effort**: S
- **Location**: `index.html`

## Quick Wins (Low Effort, High Impact)

1. **Add lang="en" to index.html** - Fixes WCAG 3.1.1 - 5 min
2. **Add aria-controls and id to combobox/listbox** - Fixes screen reader navigation - 15 min
3. **Add prefers-reduced-motion CSS** - Accessibility improvement - 10 min
4. **Remove unused _buildQueryString import** - Dead code cleanup - 2 min
5. **Add skip-to-main link** - Keyboard accessibility - 20 min
6. **Wrap result cards in React.memo** - Performance boost - 30 min
7. **Fix pagination onClick handlers** - Fixes broken UI - 20 min
8. **Add role="status" to result count** - Screen reader announcement - 10 min
9. **Validate postMessage origin** - Critical security fix - 30 min
10. **Wire date range filter handler** - Fixes "broken" filter - 30 min

## Strengths to Preserve

- **XSS-Safe Highlighting**: `highlightToReactParts()` returns structured data instead of HTML, avoiding `dangerouslySetInnerHTML` entirely
- **Ed25519 Signature Auth**: Correct cryptographic primitives with timestamp to prevent replay attacks
- **Advanced Query Parser**: 10 operators with relative date support, cleanly implemented
- **Strong Decentralization**: Connects to any node, no central server, local-only history
- **Clean Component Architecture**: Single-responsibility, hooks encapsulate business logic, CSS co-located
- **TypeScript Strict Mode**: Full type safety with discriminated unions
- **AbortController Usage**: Proper request cancellation prevents race conditions (in main search)
- **Keyboard Navigation**: Full Arrow/Tab/Enter/Escape support in SearchBar
- **Error Boundary**: Root-level protection against crashes
- **Fallback Patterns**: Trending searches gracefully degrade to static content

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Encrypt identity seed in localStorage with PBKDF2 + AES-GCM
- [ ] Add postMessage origin validation (whitelist allowed origins)
- [ ] Fix useEffect missing dependencies in useSearch.ts:275-296
- [ ] Add AbortController to tab/sort re-search useEffect
- [ ] Add aria-controls and id to combobox/listbox pattern
- [ ] Add lang="en" to index.html
- [ ] Add skip-to-main link

### Short Term (Next 2-4 Weeks)
- [ ] Add unit tests for queryParser.ts and highlighter.ts
- [ ] Add heat/decay visualization to result cards (per spec)
- [ ] Add engagement pool display to result cards (per spec)
- [ ] Replace identity polling with storage event listener
- [ ] Add React.memo to result card components
- [ ] Add loading skeletons for perceived performance
- [ ] Wire date range filter functionality
- [ ] Add connection status indicator component
- [ ] Add identity export/backup functionality
- [ ] Enforce HTTPS for remote endpoints

### Long Term (Backlog)
- [ ] Add result caching with TTL
- [ ] Add list virtualization for large result sets
- [ ] Implement exponential backoff for connection retry
- [ ] Add request deduplication
- [ ] Refactor global RPC singleton to context-only
- [ ] Add session timeout for security
- [ ] Add "Hot" and "Decaying" tabs per spec
- [ ] Expose ranking factor breakdown UI per spec
- [ ] Create saved searches feature
- [ ] Add multi-node search aggregation

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Zero test coverage | H | H | 1 |
| Global RPC singleton outside React | M | M | 3 |
| Duplicate formatTimeAgo across result cards | S | L | 4 |
| useEffect missing dependencies | S | H | 1 |
| Fixed 5s retry interval (no backoff) | S | L | 5 |
| ErrorBoundary inline in main.tsx | S | L | 5 |
| localStorage writes not debounced | S | L | 4 |
| useSearch hook at 200+ lines | M | M | 3 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Key theft via XSS | M | Critical | Encrypt localStorage keys (P0) |
| RPC hijacking via postMessage | M | H | Validate message origins (P0) |
| Stale closure bugs | H | M | Fix useEffect dependencies (P0) |
| Screen reader users blocked | M | M | Complete ARIA patterns (P0) |
| MITM on HTTP endpoints | M | H | Enforce HTTPS (P1) |
| Identity permanent loss | H | H | Add export/backup (P1) |
| Performance degradation at scale | M | M | Add memoization/virtualization (P1) |
| Regressions without tests | H | M | Add unit tests (P1) |

## Appendix: Detailed Review Summaries

### Functionality (82/100)
The Search Client implements comprehensive search functionality including full-text search across all content types, advanced query syntax with 10 operators, autocomplete with debouncing, persistent search history, and keyboard navigation. Core features work correctly with proper TypeScript typing and clean API design. Key gaps include: useEffect missing dependencies causing stale closures, excludeTerms parsed but not sent to RPC, comparison operators losing semantics (< and > both treated as minimum), and OR operator documented but not implemented.

### Performance (65/100)
The client has reasonable algorithmic efficiency (O(n) query parsing, O(n*m) highlighting) but lacks production optimizations. No component memoization causes unnecessary re-renders. Identity polling every 1 second creates overhead. No result caching means repeated searches always hit network. Network status polling every 10 seconds even when idle. Regex patterns rebuilt on every highlight call instead of being cached. No virtualization for large result sets.

### Vision Alignment (80/100)
Strong alignment with Swimchain's decentralization principles: connects directly to user-chosen node, no central server dependency, keypair-based identity with PoW, local-only search history, no tracking or personalization. Critical spec gaps: missing heat/decay visualization mandated by CLIENT_DESIGN.md, missing engagement pool display, missing "Hot" and "Decaying" tabs, ranking transparency not exposed to users.

### User Experience (70/100)
Google-familiar interface with excellent keyboard navigation, contextual icons for history vs suggestions, and search tips on homepage. PoW identity creation has excellent progress feedback. Key friction points: no loading skeletons (jarring transitions), date range filter non-functional, page numbers not clickable, no identity backup/export mechanism, no network status visibility.

### Accessibility (72/100)
Baseline accessibility with ARIA landmarks, role assignments, and visible focus indicators. Critical gaps: combobox missing aria-controls (WCAG 4.1.2), no skip-to-main link (WCAG 2.4.1), missing lang attribute (WCAG 3.1.1), result count not announced to screen readers, no prefers-reduced-motion support. Keyboard navigation is good but tab panel pattern incomplete.

### Quality & Reliability (55/100)
Clean code structure with single-responsibility components, TypeScript strict mode, and ErrorBoundary at root level. Major gaps: zero test coverage despite configured infrastructure, useEffect missing dependencies, inconsistent error recovery (RPC errors shown but localStorage failures silent), no retry button on search failure, no exponential backoff on connection retry.

### Security (68/100)
Correct cryptographic primitives (Ed25519, SHA-256 via Web Crypto), XSS-safe highlighting, escapeRegex prevents ReDoS, timestamp in signatures prevents replay attacks. Critical vulnerabilities: plaintext private key in localStorage (CVSS 8.1), missing postMessage origin validation (CVSS 7.4), HTTP endpoints for remote seeds (MITM vulnerable). No session timeout, basic auth credentials in memory.
