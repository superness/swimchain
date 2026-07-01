# Area Owner Review: Content Decay Engine

**Generated**: 2026-01-12
**Overall Health Score**: 79/100
**Status**: Needs Attention

## Executive Summary

The Content Decay Engine is a well-architected core feature that successfully implements Swimchain's vision of organic, decentralized content moderation through a mathematically sound half-life decay model. The implementation demonstrates strong code quality (85/100), excellent vision alignment (89/100), and solid functionality (90/100). However, **critical security and reliability gaps require immediate attention**: timestamp validation is missing in engagement processing (enabling decay manipulation attacks), O(n) pruning operations will cause latency issues at scale, and accessibility gaps prevent users with assistive technologies from perceiving content decay state. The deprecated engagement pool infrastructure (1,371 lines) should be removed to reduce confusion.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 90/100 | 🟢 |
| Performance | 75/100 | 🟡 |
| Vision Alignment | 89/100 | 🟢 |
| User Experience | 75/100 | 🟡 |
| Accessibility | 70/100 | 🟡 |
| Quality | 80/100 | 🟢 |
| Security | 82/100 | 🟢 |
| **Overall** | **79/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Timestamp Validation Missing in Engagement Processing
- **Source**: Security Review, Quality Review
- **Severity**: Critical
- **Description**: The `process_engagement()` function accepts engagement timestamps without validation. An attacker can submit engagements with future timestamps, setting `content.last_engagement` far in the future and making content effectively immortal.
- **Impact**: Complete bypass of the decay mechanism - undermines the entire organic moderation model (CVSS 7.5)
- **Location**: `src/content/engagement.rs:73`
- **Action**: Add timestamp validation before updating `last_engagement`:
  ```rust
  if engagement.timestamp > current_time_ms + TIMESTAMP_TOLERANCE_MS {
      return EngagementResult::Rejected(EngagementRejection::InvalidTimestamp);
  }
  content.last_engagement = engagement.timestamp.min(current_time_ms);
  ```
- **Effort**: S (1-2 hours)

### 2. O(n) Pruning Operation Blocks System
- **Source**: Performance Review, Functionality Review
- **Severity**: Critical
- **Description**: `prune_decayed_content()` iterates ALL content items to find decay candidates. At 100K items, this causes ~200ms latency spikes. Additionally, recursive `has_non_decayed_children()` can stack overflow on deep threads.
- **Impact**: Latency spikes during pruning, potential DoS with deep threads
- **Location**: `src/content/pruning.rs:54-91`, `pruning.rs:112-129`
- **Action**:
  1. Add B-tree decay index sorted by `last_engagement + effective_decay_time`
  2. Convert recursive child check to iterative with explicit stack
- **Effort**: M (4-6 hours)

## High Priority Issues

### 1. Missing Signature Verification on Engagement Records
- **Source**: Security Review
- **Severity**: High
- **Description**: `ContentManager::process_engagement()` accepts `EngagementRecord` structs without verifying the signature field. While RPC layer verifies, internal calls and sync data bypass this check.
- **Impact**: Spoofed engagements from untrusted sync data could manipulate decay timers (CVSS 6.5)
- **Location**: `src/content/lifecycle.rs:150-174`
- **Action**: Add signature verification in `process_engagement()` for defense-in-depth
- **Effort**: S (30 minutes)

### 2. expect() Calls in Production Code Can Panic
- **Source**: Security Review, Quality Review
- **Severity**: High
- **Description**: Two `expect()` calls in manifest serialization paths can panic on malformed data, causing DoS.
- **Impact**: Node crash on specially crafted content (CVSS 5.3)
- **Location**: `src/content/addressing.rs:131-133, 178-180`
- **Action**: Replace with proper error propagation: `let manifest_hash = manifest.compute_hash()?;`
- **Effort**: S (30 minutes)

### 3. No Decay Indicator in Main Forum ThreadView
- **Source**: UX Review
- **Severity**: High
- **Description**: The main forum-client ThreadView component shows NO decay state, hiding the core platform mechanic from users. Other clients (web-gateway, mobile) have heat indicators.
- **Impact**: Users don't understand or engage with the decay system - reduces platform value
- **Location**: `forum-client/src/components/ThreadView.tsx`
- **Action**: Add DecayState display (survival probability, time remaining, heat indicator) to ThreadView
- **Effort**: M (4-6 hours)

### 4. Mobile Heat Components Missing Accessibility Props
- **Source**: Accessibility Review
- **Severity**: High (WCAG A Violation)
- **Description**: Mobile HeatIndicator and HeatBadge components completely lack `accessibilityLabel` and `accessibilityRole` attributes. Screen reader users cannot perceive content decay state.
- **Impact**: WCAG 1.1.1 failure - core feature unusable for assistive technology users
- **Location**: `mobile-client/src/components/HeatIndicator.tsx:65-74`
- **Action**: Add `accessibilityLabel={`Content heat: ${heatLevel}, ${percentage}% remaining`}` and `accessibilityRole="image"`
- **Effort**: S (1 hour)

### 5. Chat Message Actions Hover-Only (Keyboard Inaccessible)
- **Source**: Accessibility Review
- **Severity**: High (WCAG A Violation)
- **Description**: Chat message actions (react, reply, edit) only appear on mouse hover. Keyboard-only users cannot access these functions.
- **Impact**: WCAG 2.1.1 failure - chat reactions inaccessible to keyboard users
- **Location**: `chat-client/src/components/MessageItem.tsx:153-157`
- **Action**: Add `onFocus`/`onBlur` handlers; make message item focusable with `tabIndex={0}`
- **Effort**: S (2 hours)

### 6. Decayed Content Shows Generic Error
- **Source**: UX Review, Accessibility Review
- **Severity**: High
- **Description**: Decayed content shows "Thread Not Found" or "doesn't exist or has decayed" - users cannot distinguish deleted vs. decayed content or learn what happened.
- **Impact**: User confusion, lost context, WCAG 3.3.1 violation
- **Location**: Thread views across clients
- **Action**: Display specific message: "This content decayed on [date]" with tombstone placeholder
- **Effort**: M (4 hours)

## Medium Priority Issues

### 1. Deprecated Pool Code Still Present
- **Source**: Vision Review, Quality Review
- **Severity**: Medium
- **Description**: 1,371 lines of deprecated pool infrastructure in `pool.rs`, `EngagementResult::PoolPending/PoolCompleted` variants still exist, and MASTER_FEATURES.md lists pools as "Complete".
- **Impact**: Developer confusion, maintenance burden, spec inconsistency
- **Action**:
  1. Update MASTER_FEATURES.md to reflect pool deprecation
  2. Remove pool.rs or move to `deprecated/` module
  3. Remove unused enum variants from `EngagementResult`
- **Effort**: M (2-4 hours)

### 2. Unbounded Tombstone Accumulation
- **Source**: Performance Review, Vision Review, Quality Review
- **Severity**: Medium
- **Description**: Tombstones are never pruned, causing indefinite memory/storage growth. This contradicts the "organic lifecycle" philosophy.
- **Impact**: Long-term storage growth, memory exhaustion
- **Location**: `src/content/pruning.rs:100-106`
- **Action**: Implement tombstone TTL (90 days after last child activity) and cleanup in pruning pass
- **Effort**: M (4 hours)

### 3. Reaction PoW Has No Progress Indicator
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Unlike the excellent PowProgress component for identity mining, reactions show only "Reacting..." spinner during 10+ second PoW mining.
- **Impact**: User frustration, unclear if stuck, no cancel option
- **Action**: Reuse PowProgress component (scaled down) for reaction mining
- **Effort**: S (2 hours)

### 4. Color-Only Heat Status Communication
- **Source**: Accessibility Review
- **Severity**: Medium (WCAG AA)
- **Description**: Heat states (emoji indicators) rely on color without text backup. Color-blind users cannot distinguish heat levels.
- **Impact**: WCAG 1.4.1 failure
- **Action**: Add visible text labels (e.g., "Hot", "Warm", "Cold") alongside emoji indicators
- **Effort**: S (2 hours)

### 5. Grace Period Calculation Incorrect
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Grace period uses `time_since_engagement` as proxy for "time since crossing decay threshold", which may prune content too early.
- **Impact**: Content pruned before grace period actually expires
- **Location**: `src/content/pruning.rs:62-67`
- **Action**: Store or compute actual threshold crossing timestamp
- **Effort**: M (3 hours)

### 6. No Decay Prediction API
- **Source**: UX Review, Functionality Review
- **Severity**: Medium
- **Description**: No way for users to know when content will expire. Missing `estimated_expiry_time` in DecayState or RPC API.
- **Impact**: Users can't plan engagement, reduced platform value
- **Action**: Add `get_decay_prediction(content_id)` RPC method returning estimated decay date
- **Effort**: M (4 hours)

### 7. 48-Hour Protection Period Invisible
- **Source**: UX Review
- **Severity**: Medium
- **Description**: New content creators don't know they have a 48-hour grace period. No UI indicator.
- **Impact**: Unnecessary anxiety, missed education opportunity
- **Action**: Show "Protected for 48h" badge on new content with countdown
- **Effort**: S (2 hours)

## Quick Wins (Low Effort, High Impact)

1. **Replace expect() calls** (addressing.rs): Replace 2 expect() calls with proper error handling - **30 min**
2. **Add accessibilityLabel to mobile heat components**: Single file change - **1 hour**
3. **Add timestamp tolerance constant**: Define `TIMESTAMP_FUTURE_TOLERANCE_MS = 3600000` (1 hour) - **15 min**
4. **Update MASTER_FEATURES.md**: Change "Engagement Pools | Complete" to "Deprecated" - **15 min**
5. **Add text labels to heat indicators**: Add "Hot", "Warm", etc. alongside emojis - **2 hours**
6. **Pre-flight self-engagement check**: Validate before starting PoW to avoid wasted computation - **1 hour**

## Strengths to Preserve

- **Rigorous Mathematical Model**: Half-life decay formula with proper saturating arithmetic and edge case handling is mathematically sound and well-tested
- **Layered Protection**: 48-hour floor + pin protection + 24-hour grace period provides robust content safety
- **Strong Type Safety**: Distinct types for ContentId, ContentHash, SpaceId prevent identifier confusion
- **Thread Coherence**: Tombstones preserve reply chain structure when parent content decays
- **Comprehensive Error Types**: Well-designed ContentError enum with specific variants enables good error handling
- **PoW Anti-Spam**: Argon2id memory-hard PoW with 24-hour anti-stockpile prevents gaming
- **Decentralization**: No central authority - each node calculates decay independently

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Add timestamp validation in engagement processing (`engagement.rs:73`)
- [ ] Add signature verification in `ContentManager::process_engagement()`
- [ ] Replace expect() with error propagation (`addressing.rs:131,180`)
- [ ] Add accessibilityLabel to mobile HeatIndicator
- [ ] Update MASTER_FEATURES.md to reflect pool deprecation

### Short Term (Next 2-4 Weeks)
- [ ] Optimize pruning with decay index (B-tree on estimated decay time)
- [ ] Convert recursive child checking to iterative with depth limit
- [ ] Add decay state to forum-client ThreadView
- [ ] Implement "This content decayed on [date]" error messaging
- [ ] Add mini PowProgress for reaction mining
- [ ] Make chat message actions keyboard accessible
- [ ] Add text labels alongside heat emoji indicators

### Long Term (Backlog)
- [ ] Implement tombstone TTL and cleanup
- [ ] Remove deprecated pool infrastructure
- [ ] Add decay prediction API (`get_decay_prediction`)
- [ ] Add decay timeline visualization
- [ ] Implement per-space half-life configuration
- [ ] Add push notifications for content approaching decay
- [ ] Complete ignored integration tests
- [ ] Add property-based/fuzz testing for decay calculations

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Timestamp validation missing | S | H | 1 |
| expect() in production paths | S | H | 2 |
| Deprecated pool code (1371 lines) | M | M | 3 |
| O(n) pruning operation | M | H | 4 |
| Test helper duplication (6 copies) | S | L | 5 |
| Ignored integration tests (7) | L | M | 6 |
| Tombstone accumulation unbounded | M | M | 7 |
| Unused `_current_time_ms` parameter | S | L | 8 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Decay manipulation via future timestamps | High | High | Add timestamp validation (critical fix) |
| Pruning latency at scale (100K+ items) | High | Medium | Add decay index, batch processing |
| Stack overflow on deep threads | Medium | Medium | Convert recursive to iterative |
| Tombstone memory exhaustion | Medium | Medium | Add tombstone TTL |
| Accessibility lawsuit (WCAG violations) | Low | High | Fix mobile a11y props, keyboard nav |
| Pool code confusion for new devs | Medium | Low | Remove deprecated code, update docs |
| Clock skew affects pruning consistency | Low | Low | Use network time consensus |

## Appendix: Detailed Review Summaries

### Functionality (90/100)
The Content Decay Engine implements all core capabilities: half-life decay calculation with proper floor protection, engagement-reset mechanics, adaptive half-life scaling, spam acceleration, and content pruning with tombstones. The API design is clean with strong typing. Critical gaps: timestamp manipulation vulnerability, O(n) pruning, incorrect grace period calculation, unbounded tombstones. Missing features: decay prediction API, per-space half-life configuration.

### Performance (75/100)
Core operations are O(1) (decay calculation, engagement processing). Critical bottlenecks: O(n) pruning iterates all content causing 200ms latency at 100K items; recursive child checking can cause stack overflow. In-memory store limits scale to ~500K items. Recommendations: add B-tree decay index, batch pruning with lock release, convert recursion to iteration, add tombstone cleanup policy.

### Vision Alignment (89/100)
Excellent alignment with Swimchain's decentralized, organic moderation vision. No central authority determines content visibility. Community engagement directly influences lifecycle. PoW prevents Sybil attacks. Minor concerns: adaptive half-life is global not per-space (slight centralization), tombstone accumulation contradicts organic lifecycle. Critical: update MASTER_FEATURES.md for pool deprecation, add engagement timestamp validation.

### User Experience (75/100)
Novel organic moderation UX with heat indicators, but significant gaps: forum-client main view has NO decay indicator; decayed content shows generic error; reaction PoW has no progress indicator (unlike excellent identity mining UX); 48-hour protection invisible; no decay prediction. Positive: good heat indicator design in web-gateway/mobile, excellent PowProgress component, familiar emoji reactions.

### Accessibility (70/100)
Moderate challenges due to novel visual paradigm. Critical WCAG A violations: mobile heat components missing text alternatives (1.1.1), chat actions hover-only (2.1.1), color-only heat communication (1.4.1). Major AA violations: decayed content generic errors (3.3.1), mining progress not announced (4.1.3). Positive patterns: forum-client EngagementPool has exemplary ARIA implementation, good focus indicators.

### Quality (80/100)
Well-structured modules with clear single responsibility. Comprehensive unit tests, but integration tests incomplete (7 ignored). Proper error handling with comprehensive enums, except 2 expect() calls in production. Thread-safe design with RwLock. Technical debt: deprecated pool code (1371 lines), test helper duplication, missing timestamp validation, unbounded tombstones.

### Security (82/100)
Solid cryptographic fundamentals: Ed25519 signatures, SHA-256 hashing, Argon2id PoW with anti-stockpile. Critical vulnerability: timestamp validation missing in engagement processing allows decay bypass (CVSS 7.5). High: missing signature verification at ContentManager level (CVSS 6.5), expect() can panic (CVSS 5.3). Medium: tombstone information leakage, no timestamp bounds on content creation.

---

*Area Owner Review synthesized from 7 expert perspective reviews*
*Generated: 2026-01-12*
*Feature: Content Decay Engine (Section 4, MASTER_FEATURES.md)*
*Owner Area: `src/content/`, `src/types/content.rs`*
