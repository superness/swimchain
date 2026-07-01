# Area Owner Review: React SDK

**Generated**: 2026-01-13
**Overall Health Score**: 73/100
**Status**: Needs Attention

## Executive Summary

The React SDK (`@swimchain/react`) is a well-architected library with comprehensive feature coverage, excellent TypeScript support, and solid cryptographic foundations using audited @noble libraries. However, **three critical blockers** require immediate attention before production deployment: (1) zero automated tests despite vitest configuration, (2) identity seeds stored unencrypted in localStorage violating SPEC_01 §7.2, and (3) action PoW computation blocking the main thread, freezing UI for up to 60 seconds during posting/replying. With these issues addressed, the SDK would be production-ready.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 83/100 | 🟢 |
| Performance | 72/100 | 🟡 |
| Vision Alignment | 82/100 | 🟢 |
| User Experience | 70/100 | 🟡 |
| Accessibility | 68/100 | 🟡 |
| Quality | 55/100 | 🔴 |
| Security | 75/100 | 🟡 |
| **Overall** | **73/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Zero Automated Tests (Q-01)
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: Despite vitest v1.0.0 and @testing-library/react v14.1.0 being configured in package.json, no test files exist anywhere in the swimchain-react/ directory.
- **Impact**: Cryptographic operations (encryption, X25519 key exchange, PoW) are completely unverified. Regressions are undetectable. Cannot safely publish to npm.
- **Action**: Create test suite with vitest. Prioritize `lib/encryption.ts`, `lib/x25519.ts`, `lib/action-pow.ts` (cryptographic correctness), then hooks with React Testing Library.
- **Effort**: L (3-5 days for comprehensive coverage)

### 2. Unencrypted Identity Seed Storage (S-01)
- **Source**: Security Review
- **Severity**: Critical (CVSS 9.1)
- **Description**: `useStoredIdentity.ts:124` stores the 32-byte identity seed as plaintext hex in localStorage. Any XSS vulnerability or malicious browser extension can exfiltrate the seed.
- **Impact**: Complete identity takeover. Per SPEC_01, identity cannot be recovered - user loses everything permanently.
- **Action**: Add optional passphrase encryption using PBKDF2→AES-GCM pattern already present in `lib/encryption.ts`. Create `saveIdentityEncrypted(identity, passphrase)` function.
- **Effort**: M (1-2 days)

### 3. Action PoW Blocks Main Thread (P-01/U-01)
- **Source**: Performance & UX Reviews
- **Severity**: Critical
- **Description**: `computePow()` in `action-pow.ts:316-362` runs Argon2id synchronously on the main thread. At testnet difficulty (6-12), this causes 100ms-10s UI freeze. Production difficulty (16-22) could freeze for minutes.
- **Impact**: Users cannot cancel, cannot see progress, cannot interact. Every post/reply operation freezes the browser.
- **Action**: Create `computePowAsync()` using Web Worker (pattern exists in `usePow()` for identity PoW). Create `useActionPow()` hook mirroring identity PoW interface.
- **Effort**: M (2-3 days)

## High Priority Issues

### 1. Custom Ed25519→X25519 Conversion (F-02)
- **Source**: Functionality Review
- **Severity**: High
- **Description**: `lib/x25519.ts:68-96` implements Ed25519→X25519 public key conversion using manual BigInt field arithmetic instead of using @noble library functions.
- **Impact**: Custom cryptographic code without test vectors risks interoperability issues or subtle bugs.
- **Action**: Add test vectors from RFC 8032 to verify conversion, or replace with @noble/ed25519 `toX25519()` when available.
- **Effort**: S (4 hours)

### 2. No CI/CD Test Pipeline (Q-04)
- **Source**: Quality Review
- **Severity**: High
- **Description**: No automated test execution in build pipeline. npm publish could ship broken code.
- **Impact**: Regressions can reach production. Consuming applications may break.
- **Action**: Add test step to build process. Fail build on test failures. Add coverage reporting.
- **Effort**: S (4 hours)

### 3. Missing AbortController Cleanup (F-04)
- **Source**: Functionality Review
- **Severity**: High
- **Description**: Content polling in `useContent.ts:591-637` continues after component unmount. No AbortController to cancel pending requests.
- **Impact**: React state update warnings. Wasted network requests. Potential memory leaks.
- **Action**: Add AbortController to `pollForContent()` and `pollForSingleContent()`. Check mounted state before state updates.
- **Effort**: S (2 hours)

### 4. Unbounded Memory Cache (P-02)
- **Source**: Performance Review
- **Severity**: High
- **Description**: `cache.ts:186` uses unbounded `Map()` for memory cache. No eviction policy.
- **Impact**: Memory grows indefinitely. OOM risk for apps with many spaces/threads.
- **Action**: Add LRU eviction with configurable max entries (default 1000). Consider WeakMap for automatic GC.
- **Effort**: M (1 day)

## Medium Priority Issues

### 1. No Reduced Motion Support (A-03)
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Spinning cube animation and RAF decay updates ignore `prefers-reduced-motion` preference.
- **Impact**: Users with vestibular disorders may experience discomfort.
- **Action**: Add `@media (prefers-reduced-motion: reduce)` to CSS. Add option to `useDecay()` for static mode.
- **Effort**: S (2 hours)

### 2. Modal Focus Not Trapped (A-02)
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Modal dialogs don't trap focus. Tab can escape to background content.
- **Impact**: Screen reader users may Tab into hidden content.
- **Action**: Add focus trap component or use native `<dialog>` element.
- **Effort**: S (3 hours)

### 3. Single RPC Creates Central Dependency (V-04)
- **Source**: Vision Review
- **Severity**: Medium
- **Description**: `RpcProvider` connects to single node. If node is down, application is non-functional.
- **Impact**: Contrary to VISION.md "No Infrastructure" principle.
- **Action**: Add connection failover. Implement peer rotation. Plan local-first architecture.
- **Effort**: L (1 week)

### 4. PBKDF2 Repeated for Same Passphrase (P-05)
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: 100,000 PBKDF2 iterations (~50-200ms) repeated for each decrypt with same passphrase.
- **Impact**: Decrypting N items with same passphrase takes N×100ms unnecessarily.
- **Action**: Cache derived keys per passphrase with short timeout (30 seconds).
- **Effort**: S (2 hours)

### 5. No Time Estimate Before Action PoW (U-02)
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Users commit to posting without knowing time cost. Could take 2 seconds or 2 minutes.
- **Impact**: Poor user experience. Users may abandon mid-mining.
- **Action**: Surface `estimateMiningTime()` before initiating PoW. Show "~30 seconds" with variance disclaimer.
- **Effort**: S (2 hours)

### 6. Duplicate Utility Functions (F-08)
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `hexToBytes`/`bytesToHex` duplicated in 4 files: `action-pow.ts`, `x25519.ts`, `rpc.ts`, `useStoredIdentity.ts`.
- **Impact**: Code duplication. Risk of divergent implementations.
- **Action**: Extract to shared `lib/utils.ts`. Update imports across codebase.
- **Effort**: S (1 hour)

## Quick Wins (Low Effort, High Impact)

1. **Add visibility detection to useDecay** - Pause RAF when tab hidden. 50% CPU reduction. (2 hours)
2. **Extract duplicate hex utilities** - Single source of truth. (1 hour)
3. **Add `aria-describedby` for form errors** - Better screen reader experience. (1 hour)
4. **Cache PBKDF2 derived keys** - 10x faster bulk decryption. (2 hours)
5. **Add request deduplication** - Prevent duplicate RPCs for same content. (3 hours)
6. **Remove unused `userReactions` state** - Clean up dead code in `useContent.ts:377`. (15 minutes)

## Strengths to Preserve

- **Comprehensive API Surface**: 100+ exports covering all Swimchain client operations. Excellent React patterns with consistent hook return shapes.
- **Strong Cryptographic Foundation**: Uses audited @noble libraries. Proper AES-GCM (256-bit keys), PBKDF2 (100K iterations), Argon2id parameters per SPEC_03.
- **WASM Memory Management**: Proper `Keypair.free()` on unmount prevents memory leaks.
- **Real-time Decay Visualization**: RAF-based updates with configurable throttling. Clean `useDecay()` hook API.
- **Two Encryption Modes**: Clear prefix markers (`[ENCRYPTED:v1:`, `[PRIVATE:v1:`) distinguish passphrase-based from space-key encryption.
- **Identity PoW UX**: Web Worker keeps UI responsive. Progress feedback via attempts/elapsed. Cancel support works well.
- **Type Safety**: Full TypeScript coverage with exported interfaces. Developer experience is excellent.

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **Add test suite foundation** - Create vitest setup, add tests for `lib/encryption.ts` round-trips
- [ ] **Test cryptographic functions** - `x25519.ts`, `action-pow.ts` with known test vectors
- [ ] **Add encrypted identity storage** - `saveIdentityEncrypted(identity, passphrase)` function
- [ ] **Move action PoW to Web Worker** - Create `computePowAsync()`, add `useActionPow()` hook
- [ ] **Add AbortController to polling** - Fix unmount cleanup in `useContent.ts`

### Short Term (Next 2-4 Weeks)
- [ ] **Achieve 80% test coverage** - Cover all hooks with React Testing Library
- [ ] **Add CI/CD test pipeline** - Fail build on test failures
- [ ] **Add LRU cache eviction** - Bound memory cache to 1000 entries
- [ ] **Implement reduced motion support** - Honor `prefers-reduced-motion` preference
- [ ] **Add focus trap to modals** - WCAG compliance
- [ ] **Cache PBKDF2 derived keys** - Performance optimization

### Long Term (Backlog)
- [ ] **Add WebSocket transport** - Real-time content updates
- [ ] **Implement offline action queue** - Queue actions when disconnected
- [ ] **Add connection failover** - Reduce single-point-of-failure risk
- [ ] **React Native support** - Separate package with platform-specific bindings
- [ ] **SSR-safe patterns** - Document server-side rendering compatibility

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Zero test coverage | L | H | 1 |
| Unencrypted seed storage | M | H | 1 |
| Main thread PoW blocking | M | H | 1 |
| Custom X25519 conversion unverified | S | H | 2 |
| Duplicate utility functions | S | L | 3 |
| Unused `userReactions` state | S | L | 4 |
| No input validation in RPC client | M | M | 3 |
| No retry logic in RPC | M | M | 3 |
| Unbounded memory cache | M | M | 2 |
| Missing AbortController cleanup | S | M | 2 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Identity theft via XSS | M | H | Encrypt seeds at rest (S-01) |
| Silent cryptographic bugs | H | H | Add test suite with test vectors |
| Production regression | H | H | Add CI/CD pipeline |
| Browser freeze during posting | H | M | Move PoW to Web Worker |
| Memory exhaustion | M | M | Add LRU cache eviction |
| Network dependency failure | M | M | Add connection failover |
| Accessibility lawsuit | L | M | Fix WCAG violations (A-01, A-02) |

## Appendix: Detailed Review Summaries

### Functionality (83/100)
The SDK provides comprehensive coverage of all Swimchain client operations with 100+ exports. Hook patterns follow React best practices (`useCallback`, `useMemo`, cleanup effects). WASM memory management is correct with proper `Keypair.free()` calls. Key gaps: no automated tests, missing `useActionPow()` hook in SDK (exists in forum-client only), custom X25519 conversion needs verification.

### Performance (72/100)
Most operations are O(n) or better. Efficient patterns include challenge pre-allocation, early exit in `leadingZeros()`, and RAF throttling for decay. Critical bottlenecks: Argon2id blocks main thread (O(2^d) expected iterations), unbounded memory cache, polling storm with multiple missing content items, PBKDF2 repeated for same passphrase.

### Vision Alignment (82/100)
Strong alignment with core principles: "Identity IS the keypair" (no recovery), PoW friction properly implemented, encryption without central key escrow. SPEC_03 compliance is excellent (82-byte challenge format correct despite spec header typo). Concerns: single RPC endpoint creates infrastructure dependency, unencrypted seed storage violates SPEC_01 §7.2, no offline capability.

### User Experience (70/100)
Identity PoW has excellent UX (Web Worker, progress, cancel). Action PoW has poor UX (main thread blocking, no time estimate, no effective cancel). Content sync status is opaque ("Loading..." with no progress). Identity loss risk not communicated. Missing optimistic updates pattern.

### Accessibility (68/100)
Good foundations: semantic HTML, proper ARIA attributes, WCAG AA color contrast, keyboard shortcuts, focus management. Critical gaps: action PoW blocks keyboard interaction (A-01), modal focus not trapped (A-02), no `prefers-reduced-motion` support (A-03), emoji picker missing keyboard navigation (A-04).

### Quality (55/100)
TypeScript strict mode enabled. Good code structure with clean separation of concerns. Consistent error handling patterns. **Critical gap**: zero automated tests despite vitest being configured. No CI/CD validation. JSDoc present but incomplete.

### Security (75/100)
Strong cryptographic implementation: audited @noble libraries, proper AES-GCM/PBKDF2/Argon2id parameters, correct IV/nonce generation. Vulnerabilities: plaintext seed storage (S-01, CVSS 9.1), HTTP endpoints for testnet seeds (S-02), no secure memory wiping (S-03). Input validation present but minimal.

---

*Area Owner Review generated by Multi-Perspective Expert Panel*
*Review Date: 2026-01-13*
