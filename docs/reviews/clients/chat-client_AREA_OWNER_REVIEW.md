# Area Owner Review: Chat-Client

**Generated**: 2026-01-12
**Overall Health Score**: 64/100
**Status**: Needs Attention

## Executive Summary

The Chat-Client is a Discord-style messaging application with solid foundational architecture but significant gaps requiring attention before production deployment. Core messaging flows work well with proper Swimchain integration (PoW, identity, signatures). However, **critical security vulnerabilities** exist around unencrypted key storage and potential XSS vectors. **Performance bottlenecks** from main-thread PoW mining and lack of virtual scrolling will cause issues at scale. The absence of test coverage (0%) and multiple incomplete features (reactions, presence) create reliability risks. Immediate priorities are: encrypt stored seeds, sanitize message content, move PoW to Web Worker, and add basic test coverage.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 81/100 | :green_circle: |
| Performance | 62/100 | :yellow_circle: |
| Vision Alignment | 84/100 | :green_circle: |
| User Experience | 71/100 | :yellow_circle: |
| Accessibility | 58/100 | :yellow_circle: |
| Quality | 44/100 | :red_circle: |
| Security | 68/100 | :yellow_circle: |
| **Overall** | **64/100** | :yellow_circle: |

Legend: :green_circle: 80+ | :yellow_circle: 50-79 | :red_circle: <50

## Critical Issues (Must Address)

### 1. Private Key (Seed) Stored Unencrypted in localStorage
- **Source**: Security Review
- **Severity**: Critical (CVSS 9.1)
- **Description**: Seeds are stored as plaintext hex in localStorage at `IdentityPage.tsx:52`. Any XSS vulnerability or malicious browser extension can steal user identities permanently.
- **Impact**: Complete identity theft with no recovery possible - users lose all their content ownership
- **Action**: Encrypt seed with user-provided passphrase using PBKDF2/Argon2id key derivation + AES-GCM encryption
- **Effort**: M (4-6 hours)

### 2. XSS Risk via Unsanitized Message Content
- **Source**: Security Review
- **Severity**: Critical (CVSS 8.6)
- **Description**: Message content at `MessageItem.tsx:191` is rendered without sanitization. Combined with the unencrypted seed storage, this enables full identity theft chains.
- **Impact**: Attackers can inject malicious scripts to steal all user credentials
- **Action**: Integrate DOMPurify to sanitize all user-generated content before rendering
- **Effort**: S (1-2 hours)

### 3. PoW Mining Blocks Main Thread (15s UI Freeze)
- **Source**: Performance Review
- **Severity**: Critical
- **Description**: `computePow()` at `useActionPow.ts:104-111` runs on main thread. Every message send freezes the entire UI for ~15 seconds on desktop, 30s+ on mobile.
- **Impact**: Users cannot cancel, navigate, or interact during mining - unacceptable UX
- **Action**: Move PoW computation to a Web Worker; maintain progress reporting via `postMessage`
- **Effort**: M (4-6 hours)

### 4. Mining Modal Has No Cancel Button
- **Source**: Quality Review, Accessibility Review
- **Severity**: Critical
- **Description**: `Chat.tsx:198-212` shows a modal during PoW mining with no dismiss option. Users are trapped with no escape. Also creates keyboard trap (WCAG 2.1.2 violation).
- **Impact**: Users cannot abort unwanted operations; accessibility failure
- **Action**: Add Cancel button that calls `useReplyPow().cancel()`; add Escape key handler for keyboard users
- **Effort**: S (1-2 hours)

### 5. Zero Test Coverage
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: Despite Vitest and Testing Library being configured, no test files exist anywhere in `src/**/*.test.ts`. Core flows are completely unverified.
- **Impact**: No regression protection; risky to refactor; unknown reliability
- **Action**: Add unit tests for: RPC signature auth, PoW state machine, optimistic message updates, message grouping
- **Effort**: L (8-16 hours for 60% coverage)

## High Priority Issues

### 1. Reactions Not Wired Up
- **Source**: Functionality Review
- **Severity**: High
- **Description**: `Chat.tsx:112-115` has `handleReaction` as TODO. UI exists but clicking reactions does nothing - worse than no feature.
- **Impact**: Broken promise to users; engagement system non-functional
- **Action**: Wire `useEngagementPow` hook to `submitEngagement()` RPC; add pooled engagement per SPEC_03
- **Effort**: M (3-4 hours)

### 2. PoW Difficulties Misaligned with Spec
- **Source**: Vision Review
- **Severity**: High
- **Description**: Client uses difficulty 10 for messages (spec: 18) and difficulty 8 for reactions (spec: 16). Spam resistance is 256x weaker than intended.
- **Impact**: Protocol spam protection bypassed; network vulnerable to spam attacks
- **Action**: Update `MESSAGE_DIFFICULTY` to 18, `REACTION_DIFFICULTY` to 16 in constants
- **Effort**: S (30 minutes)

### 3. No Virtual Scrolling for Messages
- **Source**: Performance Review
- **Severity**: High
- **Description**: `ChatArea.tsx:159-178` renders all messages to DOM. Memory grows linearly; 1000+ messages causes lag, 5000+ may crash.
- **Impact**: Application unusable for active channels; memory exhaustion
- **Action**: Implement `react-window` or `react-virtuoso`; only render visible messages
- **Effort**: M (4-6 hours)

### 4. Message Actions Require Mouse Hover
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: `MessageItem.tsx:227-256` shows Reply/Edit/Reaction buttons only on hover. Keyboard and switch users cannot access these features.
- **Impact**: WCAG 2.1.1 failure; features inaccessible to many users
- **Action**: Make actions focusable via Tab; show on focus not just hover; add keyboard shortcuts
- **Effort**: M (3-4 hours)

### 5. Sensitive Seed Metadata Logged to Console
- **Source**: Security Review
- **Severity**: High
- **Description**: `useRpc.tsx:144-149` logs seed presence and length. Any debugging/console access exposes sensitive metadata.
- **Impact**: Information leakage assists attacks; violates security best practices
- **Action**: Remove all console.log statements referencing seed, identity, or key material
- **Effort**: S (30 minutes)

### 6. useRpc.tsx is 1,272 Lines
- **Source**: Quality Review
- **Severity**: High
- **Description**: Single file combines RPC client, context provider, 10+ data-fetching hooks, and utilities. Violates single responsibility principle.
- **Impact**: Hard to maintain, test, or modify; high cognitive load for developers
- **Action**: Split into: `RpcClient.ts`, `RpcProvider.tsx`, `useServers.ts`, `useChannels.ts`, `useMessages.ts`, etc.
- **Effort**: M (4-6 hours)

## Medium Priority Issues

### 1. Channel Creation UI Missing
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `useCreateChannel` hook exists but no form UI. Button in ChannelSidebar is non-functional.
- **Recommendation**: Add CreateChannelModal component with name/description inputs
- **Effort**: M

### 2. Typing Indicators Local-Only
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `useTypingIndicator.ts` tracks local state but never broadcasts to network.
- **Recommendation**: Either remove feature or add RPC method for ephemeral typing broadcast
- **Effort**: M

### 3. Presence Tracking Mock/Inferred
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `usePresence.ts` infers status from activity timestamps, not actual peer presence.
- **Recommendation**: Document limitation clearly; plan for real presence protocol
- **Effort**: S (docs) / L (implementation)

### 4. Status Indicators Use Color Alone
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: `ChannelSidebar.tsx:271` uses only green/orange/gray for online/away/offline status.
- **Recommendation**: Add text labels or icons alongside color indicators (WCAG 1.4.1)
- **Effort**: S

### 5. Muted Text Contrast Below WCAG AA
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Muted text color #72767d has 3.48:1 contrast ratio (requires 4.5:1 for AA).
- **Recommendation**: Change `--text-muted` to #96989d or lighter
- **Effort**: S

### 6. Identity Polling Every 1 Second
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `useRpc.tsx:210-237` checks localStorage every 1 second for identity changes.
- **Recommendation**: Replace with `window.addEventListener('storage', ...)` - zero polling
- **Effort**: S

### 7. Message List Lacks Semantic Structure
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Message list is `<div>` soup without proper ARIA roles.
- **Recommendation**: Add `role="log"` with `aria-live="polite"` for screen reader announcements
- **Effort**: S

### 8. No Message Pagination
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `useMessages.ts:62` fetches all replies. Large channels load slowly.
- **Recommendation**: Add `limit` and `offset` parameters; implement infinite scroll
- **Effort**: M

### 9. No Onboarding Flow
- **Source**: UX Review
- **Severity**: Medium
- **Description**: New users see chat interface with no explanation of Swimchain concepts.
- **Recommendation**: Add welcome tutorial explaining PoW, identity, decay
- **Effort**: M

### 10. Identity Addresses Not Displayed
- **Source**: Vision Review
- **Severity**: Medium
- **Description**: Per SPEC_01, identity addresses should accompany display names to prevent impersonation.
- **Recommendation**: Show truncated identity address alongside display name in UI
- **Effort**: S

## Quick Wins (Low Effort, High Impact)

1. **Remove sensitive console logs** - `grep -r "seed\|identity" --include="*.ts" | grep console` and delete - 30 min
2. **Fix muted text contrast** - Change #72767d to #96989d in globals.css - 5 min
3. **Add Cancel to mining modal** - Wire existing `cancel()` to button in Chat.tsx - 30 min
4. **Update PoW difficulties** - Change constants to spec values (MESSAGE=18, REACTION=16) - 15 min
5. **Replace identity polling** - Use storage event listener instead of setInterval - 1 hour
6. **Add message list ARIA role** - Add `role="log"` and `aria-live="polite"` - 30 min
7. **Memoize MessageItem** - Wrap with `React.memo()` - 15 min
8. **Memoize getAuthorColor** - Use `useMemo` for color generation - 15 min

## Strengths to Preserve

- **Clean Provider Architecture**: Well-structured hierarchy (ErrorBoundary → SwimchainProvider → RpcProvider → IdentityProvider → etc.) enables clean data flow
- **Optimistic UI Pattern**: Messages appear instantly with pending state, then confirm - excellent perceived performance
- **Ed25519 Signature Auth**: Proper cryptographic authentication on all RPC calls with timestamp-based replay protection
- **Discord-Familiar UX**: Reduces learning curve by mapping familiar concepts to decentralized structures
- **Argon2id PoW Integration**: Correct WASM-based proof-of-work implementation for spam prevention
- **TypeScript Throughout**: Strong typing on props, returns, and interfaces provides safety
- **Vim-Style Shortcuts**: Power users can navigate efficiently with j/k/e/r bindings
- **Decay Visualization**: HeatIndicator component shows content freshness - aligns with Swimchain vision

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **SEC-01**: Encrypt seeds with passphrase (PBKDF2 + AES-GCM) - 4-6h
- [ ] **SEC-02**: Integrate DOMPurify for message content sanitization - 1-2h
- [ ] **SEC-03**: Remove all sensitive console.log statements - 30m
- [ ] **PERF-01**: Move PoW mining to Web Worker - 4-6h
- [ ] **UX-01**: Add Cancel button to mining modal + Escape handler - 1h
- [ ] **A11Y-01**: Make message actions keyboard accessible - 3-4h
- [ ] **SPEC-01**: Update PoW difficulties to match spec (18/16) - 15m

### Short Term (Next 2-4 Weeks)
- [ ] Wire up reaction submission with pooled engagement
- [ ] Add basic test suite (target 40% coverage on critical paths)
- [ ] Implement virtual scrolling for messages
- [ ] Split useRpc.tsx into focused modules
- [ ] Add message pagination with infinite scroll
- [ ] Complete channel creation UI
- [ ] Fix muted text contrast and add status indicator labels

### Long Term (Backlog)
- [ ] Increase test coverage to 60%
- [ ] Add onboarding flow for new users
- [ ] Implement offline message queue
- [ ] Add E2E encryption for private spaces
- [ ] Replace polling with WebSockets when available
- [ ] Add mobile responsive navigation
- [ ] Implement DM support
- [ ] Add server discovery page
- [ ] Add notification sounds

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| useRpc.tsx 1,272 lines monolith | M | H | 1 |
| Zero test coverage | L | H | 1 |
| No request deduplication/caching | M | M | 2 |
| Magic numbers scattered in code | S | L | 3 |
| Inline SVG icons (bundle bloat) | S | L | 4 |
| Console.log statements throughout | S | M | 2 |
| Some `any` types in RPC responses | S | M | 3 |
| No error recovery strategies | M | M | 2 |
| Multiple independent polling intervals | M | M | 3 |
| No Page Visibility API handling | S | M | 3 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Identity theft via XSS + localStorage | H | H | Encrypt seeds, sanitize content |
| UI freezes during PoW mining | H | H | Move to Web Worker |
| App crashes with large message history | M | H | Implement virtual scrolling |
| Users unable to use keyboard navigation | M | M | Add focus states, document shortcuts |
| Regressions from refactoring | H | M | Add test coverage before changes |
| Spam attacks due to low PoW difficulty | M | H | Align difficulties with spec |
| Users lose identity (no backup) | M | H | Add backup prompts and export UI |
| Mobile performance issues | M | M | Optimize for low-power devices |

## Appendix: Detailed Review Summaries

### Functionality
**Score: 81/100** - Core messaging (server/channel navigation, message viewing/sending with PoW) works well. Clean hook architecture with proper TypeScript. Main gaps: reactions not wired (placeholder), channel creation incomplete, typing/presence local-only, no tests. Strong Swimchain integration for auth, PoW, decay visualization. Minor issues: message editing/deletion missing, getServerIcon returns undefined.

### Performance
**Score: 62/100** - Reasonable for small usage but significant scalability issues. Critical: PoW mining blocks main thread for 15+ seconds. No virtual scrolling means 5000+ messages may crash. Multiple polling intervals (5s/15s/30s) without Page Visibility handling. Identity checked every 1s (should use storage events). Message grouping O(n), but MessageItem lacks memoization. Bundle ~820KB gzipped with WASM. Needs: Web Worker for PoW, react-window, request deduplication, adaptive polling.

### Vision Alignment
**Score: 84/100** - Strong decentralization: no central server, user-owned identity, PoW spam prevention. Correct implementation of identity-as-keypair and self-custody. Concerns: localhost-only limits deployment, PoW difficulties significantly lower than spec (10 vs 18 for messages), pooled engagement missing per SPEC_03, identity addresses not displayed per SPEC_01. Good architectural fit but 1272-line useRpc.tsx violates single responsibility.

### User Experience
**Score: 71/100** - Discord-familiar interface reduces learning curve. Good: optimistic updates, clear visual hierarchy, keyboard shortcuts. Problems: PoW mining blocks all UI with no cancel, no time estimates shown, reactions don't work (worse than absent), no mobile responsiveness, no onboarding. Identity loss risk not communicated to users. Good auto-scroll and message grouping. Missing: search, favorites, notification sounds.

### Accessibility
**Score: 58/100** - Foundational elements present: skip links, focus-visible styles, ARIA labels on some buttons. Critical failures: message actions require mouse hover (WCAG 2.1.1), mining modal keyboard trap (WCAG 2.1.2), status indicators color-only (WCAG 1.4.1), muted text contrast 3.48:1 (needs 4.5:1). Missing: message list lacks role="log", no aria-live for new messages, keyboard shortcuts undocumented, reaction picker not keyboard accessible.

### Quality
**Score: 44/100** - Good: separation of concerns, consistent naming, JSDoc documentation. Critical: zero test files despite configured infrastructure. Code issues: useRpc.tsx 1272 lines combining too many responsibilities, no retry logic for RPC failures, race conditions in polling unmount. Error handling basic (try/catch exists but no recovery). Console logs contain sensitive metadata. Need: 60% test coverage, split monolithic hooks, add exponential backoff for retries.

### Security
**Score: 68/100** - Good foundations: Ed25519 signature auth, Argon2id PoW via WASM, proper timestamp validation. Critical vulnerabilities: seeds stored unencrypted in localStorage (CVSS 9.1), message content not sanitized enabling XSS (CVSS 8.6), sensitive seed metadata logged to console. Missing: passphrase encryption for keys, idle timeout, memory clearing after key use. Input validation limited - no message length limits, channel name sanitization, or URL validation.

---

*Review synthesized from 7 perspective reviews. Generated 2026-01-12.*
