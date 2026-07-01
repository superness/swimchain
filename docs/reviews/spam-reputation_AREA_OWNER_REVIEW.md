# Area Owner Review: Spam & Reputation

**Generated**: 2026-01-13
**Overall Health Score**: 74/100
**Status**: Needs Attention

## Executive Summary

The Spam & Reputation feature has a well-designed cryptographic foundation with robust Sybil resistance through sponsor tree deduplication and a comprehensive reputation scoring system. The core algorithms for attestation aggregation, reputation calculation, and spam heuristics are correctly implemented with strong test coverage. However, **critical security vulnerabilities in the RPC layer** - specifically bypassed signature verification (CVSS 9.1), PoW validation, and missing level module - make this feature **NOT production-ready**. The underlying design is sound; the integration layer needs immediate attention before deployment.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 78/100 | 🟡 |
| Performance | 72/100 | 🟡 |
| Vision Alignment | 82/100 | 🟢 |
| User Experience | 68/100 | 🟡 |
| Accessibility | 62/100 | 🟡 |
| Quality | 78/100 | 🟡 |
| Security | 70/100 | 🟡 |
| **Overall** | **74/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. RPC Signature Verification Bypassed
- **Source**: Security Review
- **Severity**: Critical (CVSS 9.1)
- **Description**: The `submit_spam_attestation` RPC endpoint accepts signature bytes but **never verifies them**. Anyone can submit attestations impersonating any identity.
- **Impact**: Complete authentication bypass - attackers can frame innocent users as spam reporters, undermining the entire trust model.
- **Action**: Add `verify()` call in `src/rpc/methods.rs:7065-7072` before storing attestation
- **Effort**: S (< 1 hour)

### 2. RPC PoW Validation Bypassed
- **Source**: Security Review
- **Severity**: Critical (CVSS 7.5)
- **Description**: `pow_nonce` defaults to 0 if omitted, and PoW difficulty is never verified. Combined with signature bypass, enables mass false flagging at zero cost.
- **Impact**: Removes computational cost barrier - rate limit (10/hour) is the only remaining protection.
- **Action**: Make `pow_nonce` required and call `validate_attestation()` with `SPAM_ATTESTATION_POW_DIFFICULTY`
- **Effort**: S (< 1 hour)

### 3. Level Module Missing (Blocks Counter-Attestation Security)
- **Source**: Functionality + Security Review
- **Severity**: Critical (CVSS 7.0)
- **Description**: `src/api/anti_abuse.rs:25` references non-existent `crate::level::SwimmerLevel`. Counter-attestations should require Lifeguard+ level per SPEC_12 §3.4, but level verification cannot be implemented.
- **Impact**: Any identity can counter-attest - graduated trust model completely bypassed.
- **Action**: Implement `src/level/mod.rs` with SwimmerLevel enum and verification logic
- **Effort**: M (1-2 days)

### 4. AntiAbuseHandler Disabled
- **Source**: Functionality Review
- **Severity**: Critical
- **Description**: The comprehensive integration layer at `src/api/mod.rs:75-76` is commented out (`// pub mod anti_abuse;`), meaning pre-PoW validation and full content flow integration are not active.
- **Impact**: Components exist but don't communicate - architectural intent broken.
- **Action**: Re-enable module after level system completion (dependency)
- **Effort**: S (once level module complete)

### 5. RwLock Unwraps in Production Paths
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: 3 `unwrap()` calls on RwLock at `src/spam_attestation/storage.rs:145,159,174`. If a thread panics while holding the lock, subsequent unwraps will cascade to node crash.
- **Impact**: Lock poisoning in high-load scenarios could bring down nodes.
- **Action**: Replace with `.unwrap_or_else(|p| p.into_inner())` or `expect` with recovery
- **Effort**: S (< 1 hour)

## High Priority Issues

### 1. Sponsor Tree Root Placeholder (Sybil Bypass)
- **Source**: Security Review (S4, F3)
- **Severity**: High (CVSS 6.5)
- **Description**: RPC uses attester public key as placeholder instead of calling `find_sponsor_tree_root()`. Multiple Sybil identities under same sponsor each count as separate trees.
- **Impact**: Sybil resistance completely bypassed at RPC layer.
- **Action**: Integrate sponsorship module lookup in `src/rpc/methods.rs:7074-7075`
- **Effort**: S

### 2. Counter-Attestation Signature Not Verified
- **Source**: Security Review (S5)
- **Severity**: High (CVSS 6.0)
- **Description**: Same issue as attestation signatures - stored without verification at `src/rpc/methods.rs:7204-7218`.
- **Impact**: Can clear spam flags while impersonating any Lifeguard.
- **Action**: Add signature verification before processing
- **Effort**: S

### 3. Network Gossip Not Implemented
- **Source**: Vision + Functionality Review (V1, F4)
- **Severity**: High
- **Description**: Wire protocol message types 0x80-0x84 defined but attestation propagation not implemented. Attestations are local-only.
- **Impact**: Each node has independent spam view - creates de facto per-node centralization, undermining decentralization principle.
- **Action**: Implement gossip handlers for MSG_SPAM_ATTESTATION (0x80)
- **Effort**: L (multi-day)

### 4. TOCTOU Race in Counter-Attestation
- **Source**: Quality + Security Review (Q2, S7)
- **Severity**: High
- **Description**: Duplicate check at `manager.rs:143-146` and add at `187-188` are not atomic - concurrent requests could both pass.
- **Impact**: Extra counter-attestations counted, potentially clearing flags with fewer unique identities.
- **Action**: Use sled transaction for atomic check+insert
- **Effort**: S

### 5. Integration Tests Disabled
- **Source**: Quality Review (Q3)
- **Severity**: High
- **Description**: Anti-abuse module disabled means integration tests don't run in CI.
- **Impact**: Bugs may reach production undetected.
- **Action**: Enable conditional compilation for test builds
- **Effort**: S

## Medium Priority Issues

### 1. No Per-Content Rate Limit
- **Source**: Security Review (S6)
- **Description**: Rate limit is per-attester globally (10/hour) but not per-content. Single attester can target 10 different pieces of content from same author.
- **Impact**: Targeted harassment amplification within rate limits.
- **Action**: Add per-attester-per-content limit (1 attestation per content)
- **Effort**: S

### 2. Reputation Recovery Passive Only
- **Source**: Functionality Review (F7)
- **Description**: Recovery bonus (+1/day) only applied on explicit `refresh_score()` call. No background job exists.
- **Impact**: Users don't benefit from recovery without explicit action.
- **Action**: Add background job or hook into sync cycle
- **Effort**: M

### 3. No Reputation Visibility in UI
- **Source**: UX Review (U2)
- **Description**: Reputation score not visible anywhere in forum-client. Users operate blind.
- **Impact**: Users don't know their tier, limits, or recovery progress.
- **Action**: Add reputation dashboard to Identity page
- **Effort**: M

### 4. Defend Button Hidden in Report Modal
- **Source**: UX Review (U1)
- **Description**: Counter-attestation "Defend" button only accessible by clicking "Report" (counter-intuitive).
- **Impact**: Content creators cannot easily defend flagged content.
- **Action**: Surface Defend action directly on flagged content
- **Effort**: S

### 5. Color Contrast Fails WCAG AA
- **Source**: Accessibility Review (A3)
- **Description**: Secondary text #888 on dark background #1a1a2e = 3.95:1 (requires 4.5:1).
- **Impact**: Low vision users cannot read secondary information.
- **Action**: Change #888 to #b0b0b0 or lighter
- **Effort**: S

### 6. Modal Missing ARIA Attributes
- **Source**: Accessibility Review (A1)
- **Description**: ReportModal has no `role="dialog"`, `aria-modal`, or `aria-labelledby`.
- **Impact**: Screen readers don't announce modal opening/closing.
- **Action**: Add proper ARIA attributes to modal component
- **Effort**: S

### 7. Unbounded Rate Limit Cache
- **Source**: Performance + Quality Review (P4, Q4)
- **Description**: In-memory HashMap at `storage.rs:25` grows unbounded - cleanup requires manual call.
- **Impact**: Memory leak in long-running nodes.
- **Action**: Schedule `cleanup_rate_limits()` in node maintenance loop
- **Effort**: S

### 8. Reputation Threshold Drift from Spec
- **Source**: Functionality Review (F8)
- **Description**: Implementation: Trusted >200 vs Spec: Trusted 150+. Similar drift in other tiers.
- **Impact**: Documentation/implementation mismatch causes confusion.
- **Action**: Decide canonical values and update documentation or implementation
- **Effort**: S

## Quick Wins (Low Effort, High Impact)

1. **Add signature verification to RPC** - Single `verify()` call prevents identity impersonation (S, Critical security fix)
2. **Make pow_nonce required** - One parameter change + validation call (S, High security impact)
3. **Fix RwLock unwraps** - Replace 3 `.unwrap()` with `.unwrap_or_else()` (S, Prevents node crashes)
4. **Fix color contrast** - Change #888 to #b0b0b0 (S, WCAG compliance)
5. **Add ARIA to modal** - role="dialog", aria-modal="true" (S, Screen reader support)
6. **Schedule rate limit cleanup** - Add to maintenance loop (S, Prevents memory leak)
7. **Update threshold documentation** - Align spec with implementation values (S, Reduces confusion)

## Strengths to Preserve

- **Sybil Resistance Design**: The sponsor tree deduplication mechanism (`find_sponsor_tree_root()`, `aggregate_attestations()`) is algorithmically correct and well-tested.
- **Comprehensive Reputation Formula**: 10-factor score calculation with saturating arithmetic prevents overflow and matches spec test vectors.
- **Strong Cryptographic Foundation**: Ed25519 signatures, SHA-256 PoW, proper domain separation in signed messages prevent cross-protocol attacks.
- **Advisory-Only Heuristics**: Spam heuristics flag for review without automatic removal - respects human-in-the-loop moderation philosophy.
- **Excellent Documentation**: All constants include SPEC_12 references, comprehensive formula documentation in code comments.
- **Good Test Coverage**: 455+ lines of integration tests, unit tests in all modules with proper isolation using temporary sled databases.

## Action Plan for Area Owner

### Immediate (This Sprint) - BLOCKING PRODUCTION
- [ ] Add signature verification to `submit_spam_attestation` RPC (`methods.rs:7065`)
- [ ] Add signature verification to `submit_counter_attestation` RPC (`methods.rs:7204`)
- [ ] Make `pow_nonce` required and validate PoW difficulty
- [ ] Compute actual sponsor tree root (replace placeholder at `methods.rs:7074`)
- [ ] Fix RwLock unwraps in `storage.rs:145,159,174`
- [ ] Fix TOCTOU race with sled transaction for counter-attestation

### Short Term (Next 2-4 Weeks)
- [ ] Implement `src/level/mod.rs` with SwimmerLevel enum
- [ ] Add Lifeguard+ check to counter-attestation RPC
- [ ] Re-enable anti_abuse module
- [ ] Enable integration tests in CI
- [ ] Implement attestation gossip (wire protocol 0x80-0x84)
- [ ] Add per-content attestation rate limit
- [ ] Schedule rate limit cleanup in node maintenance loop
- [ ] Fix accessibility issues (ARIA, contrast)
- [ ] Surface Defend button outside Report modal

### Long Term (Backlog)
- [ ] Add background reputation refresh job
- [ ] Implement quality attestations (positive feedback)
- [ ] Add reputation dashboard to UI
- [ ] Wire spam flagging into decay engine
- [ ] Add structured audit logging
- [ ] Add stress tests for concurrent access
- [ ] Consider age bonus cap reduction (365 → 180 days)

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Disabled anti_abuse module | M | H | 1 |
| Missing level module | M | H | 1 |
| RPC validation bypasses | S | H | 1 |
| RwLock unwraps | S | H | 1 |
| Network gossip missing | L | H | 2 |
| Integration tests disabled | S | M | 2 |
| Unbounded rate limit cache | S | M | 3 |
| Unbounded fingerprint Vec | S | M | 3 |
| Duplicated timestamp validation | S | L | 4 |
| Generic storage error messages | S | L | 5 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unauthenticated attestation flood | High | Critical | Implement signature + PoW verification in RPC immediately |
| Sybil attestation gaming | High | High | Replace sponsor tree root placeholder with actual lookup |
| Counter-attestation abuse | High | High | Implement level module and Lifeguard+ verification |
| Node crash from lock poisoning | Medium | High | Fix RwLock unwraps with poison recovery |
| Memory exhaustion | Medium | Medium | Schedule cleanup, add entry limits |
| Per-node inconsistent spam view | Medium | Medium | Implement network gossip |
| User confusion from threshold drift | Low | Low | Document canonical values |

## Appendix: Detailed Review Summaries

### Functionality (78/100)
**Strengths**: Robust Sybil resistance design, comprehensive 10-factor reputation formula, strong test coverage (455+ lines integration tests), proper simhash near-duplicate detection.
**Gaps**: Anti-abuse handler disabled, level module missing, network gossip not implemented, RPC doesn't verify signatures/PoW, reputation recovery passive-only.

### Performance (72/100)
**Strengths**: O(1) reputation calculation, bounded sponsor tree traversal (MAX_DEPTH=100), pre-computed tree roots, HashSet deduplication, time-bounded cleanup.
**Bottlenecks**: `get_flagged_content()` full table scan O(A), simhash computation O(k) per content, no aggregation caching, unbounded in-memory caches.

### Vision Alignment (82/100)
**Strengths**: Decentralization preserved (no central authority), identity-is-keypair enforced, PoW for spam resistance, organic content lifecycle via decay, transparent public attestations.
**Concerns**: Missing gossip creates de facto per-node centralization, Lifeguard+ verification bypassed, admin-only visibility functions create information asymmetry.

### User Experience (68/100)
**Strengths**: Well-designed reason selection, mining stats display, success confirmation, keyboard Escape support, clean animations.
**Gaps**: Defend button hidden in Report modal, no reputation visibility, low contrast identity requirement, no PoW time estimate, no flag notifications.

### Accessibility (62/100)
**Pass**: Semantic radio buttons, clear button labels, rem sizing, color+text for status, PowProgress has proper ARIA.
**Fail**: Modal missing role="dialog" (WCAG 4.1.2), keyboard trap during mining (2.1.2), #888 contrast fails AA (1.4.3), error not announced (3.3.1).

### Quality (78/100)
**Strengths**: Excellent code structure, consistent naming, comprehensive documentation, zero panic! macros, proper test isolation.
**Gaps**: 3 RwLock unwraps in production paths, TOCTOU race in counter-attestation, integration tests disabled, unbounded caches.

### Security (70/100)
**Strengths**: Ed25519 signatures, SHA-256 PoW, proper domain separation, timestamp bounds prevent replay, saturating arithmetic in score calculation.
**Critical Gaps**: Signature verification bypassed in RPC (CVSS 9.1), PoW validation bypassed (CVSS 7.5), level module missing (CVSS 7.0), sponsor tree root placeholder (CVSS 6.5).

---

*Review synthesized from 7 expert perspective reviews*
*Security Assessment: NOT PRODUCTION READY - Critical RPC authentication bypass*
*Review date: 2026-01-13*
