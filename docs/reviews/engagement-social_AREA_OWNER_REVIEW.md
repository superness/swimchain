# Area Owner Review: Engagement & Social

**Generated**: 2026-01-13
**Overall Health Score**: 73/100
**Status**: Needs Attention

## Executive Summary

The Engagement & Social feature provides a solid social layer foundation for Swimchain with well-designed engagement tracking, achievement systems, and notification infrastructure. However, **critical security and functionality bugs** prevent core features from working correctly. **MOST URGENT**: The `submit_engagement` RPC handler parses signatures but **never cryptographically verifies them** (CVSS 9.1), allowing attackers to submit engagements on behalf of any identity. Additionally, unique engagement counters (`unique_engagers`/`unique_authors_engaged`) are never incremented, completely breaking spam/Sybil detection. Of 12 achievements, 2 are permanently non-functional (AnchorDrop, AlwaysOn), and the achievement system has zero UI visibility. **Immediate action required** on the signature verification vulnerability before any other improvements.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 78/100 | 🟡 |
| Performance | 72/100 | 🟡 |
| Vision Alignment | 80/100 | 🟢 |
| User Experience | 59/100 | 🔴 |
| Accessibility | 73/100 | 🟡 |
| Quality | 69/100 | 🟡 |
| Security | 79/100 | 🟡 |
| **Overall** | **73/100** | **🟡** |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

---

## Critical Issues (Must Address)

### 1. **SECURITY** Signature Not Verified in submit_engagement RPC Handler
- **Source**: Security Review
- **Severity**: Critical (CVSS 9.1)
- **Description**: In `src/rpc/methods.rs:2674-2885` (specifically lines 2749-2761), signatures are parsed from the request but **never cryptographically verified** against the engagement content. The signature field is deserialized but not validated before processing the action.
- **Impact**: **Complete authentication bypass** - attackers can submit engagements on behalf of any identity with fabricated signatures. This undermines the entire identity-based trust model. Any user can impersonate any other user's engagement activity.
- **Action**: Add Ed25519 signature verification before processing the engagement:
  ```rust
  // After parsing signature_bytes at line 2761:
  let author_key = ed25519_dalek::VerifyingKey::from_bytes(&author_bytes)?;
  let message = compute_engagement_message(&content_bytes, params.timestamp);
  let signature = ed25519_dalek::Signature::from_bytes(&signature_bytes);
  if author_key.verify_strict(&message, &signature).is_err() {
      return RpcResponse::error(RpcErrorCode::InvalidSignature, "Invalid signature", id);
  }
  ```
- **Effort**: S (2-4 hours)

### 2. Unique Engagement Counters Never Increment
- **Source**: Functionality Review, Quality Review, Security Review
- **Severity**: Critical
- **Description**: In `src/engagement_graph/storage.rs:231-293`, the `update_stats_outgoing()` and `update_stats_incoming()` functions never increment the `unique_authors_engaged` or `unique_engagers` counters. Line 253-254 has a comment acknowledging this ("this is approximate - we'd need to scan to be exact") but the counters remain at 0.
- **Impact**: The `looks_organic()` spam detection heuristic that checks "incoming diversity < 10%" always fails because `unique_engagers` is always 0. **Spam/Sybil detection is completely broken.**
- **Action**: Track unique engagers using a HashSet or bloom filter, incrementing counters only on first engagement:
  ```rust
  // In record_engagement(), before calling update_stats:
  let edge_existed = self.get_edge(engager, author)?.is_some();
  // In update_stats_outgoing:
  if !edge_existed {
      stats.unique_authors_engaged += 1;
  }
  // In update_stats_incoming:
  if !edge_existed {
      stats.unique_engagers += 1;
  }
  ```
- **Effort**: M (requires data migration or additional tracking structure)

### 3. Achievement System Has Zero UI
- **Source**: UX Review, Accessibility Review
- **Severity**: Critical
- **Description**: 12 achievements are defined in the backend and stored when earned, but no UI component exists to view, track progress, or celebrate achievements.
- **Impact**: Users earn achievements they can never see. The entire gamification value of the achievement system is wasted. Accessibility score for achievements is 0/10.
- **Action**: Create `AchievementGallery` component showing all 12 badges with progress indicators, unlock animations, and accessibility labels (`role="list"`, `aria-label`).
- **Effort**: M (3-5 days)

### 4. Sponsorship Check Bypassed During Node Startup
- **Source**: Security Review
- **Severity**: Critical
- **Description**: If the sponsorship store is not initialized when an engagement is submitted, the check passes via graceful degradation at `src/rpc/methods.rs:394-398`.
- **Impact**: During node restart windows, unsponsored identities can submit engagements, bypassing Sybil resistance.
- **Action**: Block engagement submissions until sponsorship store is initialized, or queue for verification after initialization.
- **Effort**: S (2-4 hours)

---

## High Priority Issues

### 1. AnchorDrop Achievement Permanently Unavailable
- **Source**: Functionality Review, Vision Review
- **Severity**: High
- **Description**: In `src/achievement/triggers.rs:198`, `AnchorDrop` returns `false` unconditionally with comment "Deprecated: level system removed". This achievement (ID 8) cannot be earned - 8.3% of achievements are dead code.
- **Impact**: Users attempting to earn this achievement will be frustrated.
- **Action**: Either remove from `Achievement::all()` display or replace trigger with PoW-based milestone.
- **Effort**: S

### 2. AlwaysOn Achievement Impossible to Earn
- **Source**: Functionality Review, Vision Review
- **Severity**: High
- **Description**: In `src/achievement/triggers.rs:157-159`, checks `days_at_95_percent_uptime >= 30` but `TriggerContext` field is always 0 (line 57: "PLACEHOLDER: 0 until daily tracking implemented"). No uptime tracking exists.
- **Impact**: Another achievement permanently unobtainable.
- **Action**: Implement daily uptime tracking or replace with achievable metric (e.g., "30 consecutive days with at least 1 content serve").
- **Effort**: L (if implementing uptime tracking); S (if deprecating)

### 3. Documentation Threshold Mismatches (4 Instances)
- **Source**: Vision & Spec Review, Functionality Review
- **Severity**: High
- **Description**: Achievement thresholds in docs don't match SPEC_09 or implementation:
  - BandwidthBaron: Doc says 1TB, SPEC/impl is 100GB
  - TerabyteClub: Doc says 10TB, SPEC/impl is 1TB
  - KeeperOfTheFlame: Doc says 1000+, SPEC/impl is 100+
  - AlwaysOn: Doc says 7-day streak, impl is 30 days at 95%+ uptime
- **Impact**: Users attempting to earn achievements using documentation will be confused.
- **Action**: Update MASTER_FEATURES.md and feature doc to match SPEC_09 values.
- **Effort**: S (1 hour)

### 4. Top Engagers Query O(n log n) - Won't Scale
- **Source**: Performance Review
- **Severity**: High
- **Description**: `get_top_engagers()` at `storage.rs:116-128` loads ALL edges for an author, then sorts. At 10K+ engagers: multi-second latency; at 100K+: potential OOM.
- **Impact**: Profile pages for popular users will timeout or crash.
- **Action**: Maintain pre-sorted top-N index updated on each engagement, limit to top 1000.
- **Effort**: M (2-3 days)

### 5. Mutual Connections Has O(n²) Behavior
- **Source**: Performance Review
- **Severity**: High
- **Description**: `find_mutual_connections()` at `storage.rs:131-155` performs set intersection + n `get_mutual()` calls. User with 1K connections = 1M operations.
- **Impact**: Mutual friends feature unusable for active users.
- **Action**: Add mutual connection index computed incrementally on engagement.
- **Effort**: L (1 week)

### 6. No `prefers-reduced-motion` Support
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: Mining spinners, pool fill animations, and hover effects animate without respecting user's motion preference.
- **Impact**: WCAG 2.1 AA violation. Users with vestibular disorders experience discomfort.
- **Action**: Add `@media (prefers-reduced-motion: reduce)` to `globals.css` disabling all animations.
- **Effort**: S (2 hours)

### 7. RPC Param Parsing Silently Swallows Errors
- **Source**: Quality Review, Security Review
- **Severity**: High
- **Description**: `serde_json::from_value(params).unwrap_or_default()` at `src/rpc/methods.rs:6469` silently converts invalid JSON to empty params.
- **Impact**: Malformed requests don't return proper error responses, making debugging difficult.
- **Action**: Return `InvalidParams` error on parse failure instead of using default.
- **Effort**: S (1 hour)

### 8. Self-Engagement Not Blocked
- **Source**: Functionality Review, Vision Review, Security Review
- **Severity**: High
- **Description**: Users can engage with their own content. While tracked for spam detection, it's not prevented.
- **Impact**: Users can game decay timers by self-engaging, undermining organic moderation vision.
- **Action**: Return `SelfEngagementNotAllowed` error in `record_engagement()` when `engager == author`.
- **Effort**: S (1 hour)

---

## Medium Priority Issues

### 1. Adjacency List Contains Check is O(n)
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: Every new engagement to an author with n engagers costs O(n) for `list.contains()` check.
- **Impact**: Popular authors see degraded engagement performance.
- **Action**: Use HashSet or sled secondary index for O(1) membership check.
- **Effort**: M (2-3 days with migration)

### 2. JSON Serialization for Engagement Graph (3-5x Overhead)
- **Source**: Performance Review, Quality Review
- **Severity**: Medium
- **Description**: Engagement edges use JSON serialization while other modules use bincode. JSON is 3-5x larger and 2-3x slower.
- **Impact**: Storage bloat, slower serialization, inconsistent architecture.
- **Action**: Switch to bincode (requires one-time migration).
- **Effort**: M (2 days)

### 3. Emoji Picker Keyboard Inaccessible
- **Source**: Accessibility Review
- **Severity**: Medium (WCAG 2.1.1 Fail)
- **Description**: `ContentStatus.tsx:105-118` emoji picker has no arrow key navigation, Enter to select, or roving tabindex.
- **Impact**: Users who cannot use a mouse cannot react to content.
- **Action**: Implement roving tabindex pattern with arrow key navigation, Enter to select.
- **Effort**: S (4-6 hours)

### 4. Modal Focus Not Trapped
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: ReportModal and InviteModal lack focus trapping and `aria-modal="true"`. Tab order escapes modal.
- **Impact**: WCAG 2.4.3 Focus Order violation. Screen reader users navigate outside modal.
- **Action**: Implement focus trap using `focus-trap-react` or equivalent; add `aria-modal="true"`.
- **Effort**: S (3-4 hours)

### 5. Notification System Has Zero UI
- **Source**: UX Review, Accessibility Review
- **Severity**: Medium
- **Description**: 6 notification types are computed and stored but never displayed to users.
- **Impact**: Users miss streak milestones, achievement unlocks, and content decay warnings.
- **Action**: Build Notification Center component with bell icon, dropdown list, and `role="alert"` for time-sensitive items.
- **Effort**: M (3-5 days)

### 6. Space Health Not Visible in UI
- **Source**: UX Review, Accessibility Review
- **Severity**: Medium
- **Description**: Space health scores (0-100) are computed but not displayed anywhere in the application.
- **Impact**: Users cannot monitor community health despite the metric existing.
- **Action**: Add space health indicator to space header/sidebar with `role="meter"` and `aria-valuenow`.
- **Effort**: S (1 day)

### 7. Weak Notification ID Entropy
- **Source**: Security Review
- **Severity**: Medium
- **Description**: Notification IDs use timestamp + counter instead of cryptographic randomness.
- **Impact**: Potential ID collision attacks in adversarial environments.
- **Action**: Use `rand::thread_rng().gen::<[u8; 16]>()` for notification IDs.
- **Effort**: S (1 hour)

### 8. Non-Atomic Achievement Unlock Pattern
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: Achievement unlock emits events before confirming persistence to storage at `src/achievement/service.rs:84-88`.
- **Impact**: If persistence fails, users receive unlock notification but achievement is not saved.
- **Action**: Move event emission after `self.store.save()` succeeds.
- **Effort**: S (2 hours)

### 9. Vec Sliding Window Inefficient
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `src/engagement_graph/types.rs:77-79` uses `Vec::remove(0)` which shifts all 100 elements on each engagement. O(100) per operation.
- **Impact**: Minor but avoidable CPU overhead on every engagement.
- **Action**: Replace with `VecDeque` for O(1) `pop_front()`.
- **Effort**: S (1 hour)

### 10. Heat/Decay States Use Color Alone
- **Source**: Accessibility Review
- **Severity**: Medium (WCAG 1.4.1 Fail)
- **Description**: `globals.css:30-35` heat states (--heat-full to --heat-decayed) use color alone without text labels.
- **Impact**: Color-blind users cannot distinguish content urgency.
- **Action**: Add text labels: "Fresh", "Cooling", "At Risk", "Decaying" alongside colors.
- **Effort**: S (2-3 hours)

---

## Quick Wins (Low Effort, High Impact)

1. **Fix documentation thresholds** - Update docs to match SPEC_09 values - S (1 hour)
2. **Add emoji validation** - Validate emoji 1-8 range in RPC handler - S (30 minutes)
3. **Replace Vec with VecDeque** - `recent_timestamps` sliding window - S (1 hour)
4. **Fix RPC param parsing** - Return proper error instead of `unwrap_or_default()` - S (1 hour)
5. **Add `prefers-reduced-motion`** - Single CSS media query addition - S (2 hours)
6. **Add notification counter cache** - Atomic counter instead of O(n) scan - S (3 hours)
7. **Block self-engagement** - Return error in `record_engagement()` - S (1 hour)
8. **Move achievement event after persist** - Reorder in service.rs - S (2 hours)
9. **Log dropped broadcast events** - Add warning log when events dropped - S (30 minutes)
10. **Use crypto RNG for notification IDs** - Replace timestamp+counter - S (1 hour)

---

## Strengths to Preserve

- **Decentralized Architecture**: All engagement data stored per-node; no central social graph server - aligns with Swimchain vision
- **Comprehensive Test Coverage**: 100+ unit tests across modules with excellent boundary testing
- **Clean Module Structure**: Consistent types.rs/storage.rs/service.rs pattern across all subsystems
- **PoW Spam Resistance**: Proper Argon2id memory-hard PoW (64 MiB, 3 iterations) prevents spam without central moderation
- **Non-Transferable Achievements**: Bound to Ed25519 identity keys - correctly prevents achievement trading
- **Space Health Caching**: 60s TTL cache prevents repeated expensive computations
- **Notification Throttling**: Multi-layer throttling (per-type, daily limit, quiet hours) prevents notification spam
- **Ed25519/Argon2id Crypto**: Sound cryptographic implementation with proper key zeroization
- **Well-Documented APIs**: Public functions have SPEC references and examples

---

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **SECURITY P0**: Add Ed25519 signature verification to `submit_engagement` RPC handler
- [ ] Fix `unique_engagers`/`unique_authors_engaged` counter increments in `update_stats_outgoing/incoming()`
- [ ] Block self-engagement at submission time
- [ ] Add sponsorship store initialization gate (reject during loading)
- [ ] Replace Vec with VecDeque for `recent_timestamps` (O(100) → O(1))
- [ ] Update MASTER_FEATURES.md achievement thresholds to match SPEC_09
- [ ] Add emoji input validation (1-8 range)
- [ ] Fix RPC param parsing to return proper errors

### Short Term (Next 2-4 Weeks)
- [ ] Create AchievementGallery component with progress tracking
- [ ] Build Notification Center with bell icon and dropdown
- [ ] Add `prefers-reduced-motion` CSS media query
- [ ] Add text labels alongside color-coded decay states
- [ ] Implement roving tabindex in emoji picker
- [ ] Add space health display to space header
- [ ] Implement modal focus trapping
- [ ] Fix notification ID entropy (use crypto RNG)
- [ ] Move achievement event emission after persistence

### Long Term (Backlog)
- [ ] Switch engagement graph from JSON to bincode serialization
- [ ] Implement pre-sorted top engagers index for O(1) reads
- [ ] Add mutual connections index for O(n) retrieval
- [ ] Use HashSet for adjacency membership (O(1) contains)
- [ ] Implement daily uptime tracking for AlwaysOn achievement
- [ ] Replace AnchorDrop with PoW-based milestone
- [ ] Add sled transactions for atomic multi-write operations
- [ ] Add content decay countdown UI
- [ ] Implement WebSocket notification push
- [ ] Add achievement progress API endpoint

---

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| **Add signature verification to RPC** | S | H | **P0** |
| Fix engagement stats counters | M | H | P0 |
| Replace Vec with VecDeque | S | M | P1 |
| Block self-engagement | S | M | P1 |
| Update documentation thresholds | S | H | P1 |
| Add emoji validation | S | M | P2 |
| JSON to bincode migration | M | M | P2 |
| Implement top engagers index | M | H | P2 |
| Build Achievement UI | M | H | P2 |
| Build Notification Center | M | M | P2 |
| Add adjacency HashSet | M | M | P3 |
| Mutual connections index | L | M | P3 |
| Implement AlwaysOn achievement | L | L | P4 |
| Remove deprecated AnchorDrop | S | L | P4 |
| Add sled transactions | M | M | P3 |
| Mobile accessibility improvements | M | H | P2 |

**Total Estimated Debt: ~5-6 weeks of focused work**

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Identity spoofing via unsigned engagements** | **H** | **H** | **Add signature verification immediately - CRITICAL** |
| Spam/Sybil detection broken (unique counters) | H | H | Fix counter increments - requires migration |
| Sponsorship bypass at startup | M | H | Queue/reject actions during startup |
| Scale failure for popular users | H | H | Implement indexed queries |
| Accessibility lawsuit/compliance | L | H | Systematic WCAG remediation |
| User achievement frustration | M | M | Build Achievement UI |
| Documentation trust erosion | M | L | Update thresholds immediately |
| Storage growth unbounded | M | M | Implement data retention policy |
| Node panic from unwrap() | M | M | Replace with safe patterns |

---

## Appendix: Detailed Review Summaries

### Functionality (78/100)
The engagement graph, notification service, space health, and attribution systems are fully implemented and functional. Core APIs follow good patterns (builder pattern, clear naming). However, 2 of 12 achievements are permanently broken (AlwaysOn, AnchorDrop), engagement pools have been deprecated without migration documentation, and the **critical unique counter bug** undermines the entire spam detection system. Documentation has 4 threshold mismatches with implementation. Self-engagement is tracked but not blocked, allowing users to game decay timers.

**Key strengths**: Comprehensive data model, extensive test coverage (100+ tests), multi-layer throttling.
**Key gaps**: Broken achievements, dead deprecated code paths, missing real-time notifications.

### Performance (72/100)
Write paths are well-optimized with O(1) key lookups, but query paths have **6 significant bottlenecks**:
1. `get_top_engagers()` is O(n log n) - loads all edges, sorts in memory
2. `find_mutual_connections()` is O(n²) - set intersection + n× get_mutual calls
3. Adjacency list contains check is O(n) per new engagement
4. `recent_timestamps` Vec sliding window uses O(100) shift on every engagement
5. `mark_read()` notification is O(n) linear scan
6. `get_chain_engagements()` scans entire blockchain

JSON serialization adds 3-5x storage overhead vs bincode. Space health has 60-second caching (good), but cache invalidated on every write. These won't be issues initially but will degrade severely for popular authors (10K+ engagers = 2+ second latency on profile views).

**Key bottlenecks**: Mutual connections O(n²), top engagers O(n log n), full blockchain scan.
**High-impact fixes**: Engagement content index, adjacency HashSet, pre-sorted top-N index.
**Quick wins**: VecDeque replacement (30 min), notification count cache (2 hrs).

### Vision Alignment (80/100)
Strong philosophical alignment with Swimchain's decentralized principles. Identity IS the keypair - achievements are bound to Ed25519 keys and non-transferable. Space health is computed locally without central authority. PoW provides spam resistance. "Kept alive by" attribution makes contribution visible. However, the deprecated level system has residue throughout the codebase (`anti_abuse.rs`, `messages.rs`), and the critical unique counter bug breaks spec-mandated organic pattern detection (SPEC_09 §2.3).

**Strengths**: Non-transferable achievements, local health computation, PoW integration.
**Issues**: Level system residue, spec-violating counter bug, deprecated achievement references.

### User Experience (59/100)
The lowest-scoring perspective. Core mechanics work (reactions, engagement recording), and PoW progress feedback is excellent (3D animation, educational tips). However, **12 achievements have zero UI visibility**, **6 notification types are stored but never displayed**, and space health scores are invisible. This is essentially 60% backend implementation with 40% frontend follow-through. Identity recovery has no backup mechanism or warning about irreversibility.

**Critical gaps**: Achievement invisibility, notification dead end, no space health display.
**Positives**: Good PoW progress UX, WCAG AA compliant color system foundation.

### Accessibility (73/100)
Solid foundational practices in existing components: PowProgress has proper `role="status"` and `aria-live`, EngagementPool has correct `role="group"` and `aria-labelledby`, keyboard navigation supports vim-style shortcuts (j/k/?/n/r). `globals.css` documents contrast ratios (15:1, 8:1, 5:1), includes skip links, and specifies 44px touch targets. However, achievements, notifications, and space health have **no frontend at all**. The emoji picker lacks arrow key navigation, and color-only decay indicators violate WCAG 1.4.1.

**Compliance**: Good ARIA usage in existing components; gaps in new required components.
**Violations**: Emoji picker keyboard nav (2.1.1), color-only indicators (1.4.1).

### Quality (69/100)
Code structure is clean with consistent module organization (types → storage → service). Documentation is comprehensive with inline SPEC_09 references. Error handling follows Rust best practices (thiserror). Test coverage is strong for unit tests (100+) with good boundary value testing. However, **7 integration tests are marked `#[ignore]`**, there are no tests verifying counter increments work, and no concurrent access tests exist. Critical bugs (counter not incrementing, non-atomic achievement unlock) reveal testing gaps for cross-module integration scenarios.

**Strengths**: Clean module separation, comprehensive doc comments, extensive unit tests.
**Gaps**: Ignored integration tests, missing counter verification tests, no retry logic.

### Security (79/100)
Cryptographic foundations are solid: Ed25519, Argon2id, ChaCha20-Poly1305, SHA-256 all properly implemented. PoW anti-stockpile uses 1-hour timestamp window. Sponsorship verification provides Sybil resistance. Key management follows best practices (Argon2id KDF + ChaCha20-Poly1305, zeroize crate). However, the **CRITICAL vulnerability** is that `submit_engagement` **parses signatures but never verifies them** (CVSS 9.1) - attackers can submit engagements on behalf of any identity. Secondary issues include weak notification ID entropy and sponsorship check bypass during startup.

**Critical**: Signature verification missing at RPC entry point.
**High**: Weak notification ID entropy, sponsorship bypass during startup.
**Strengths**: Good crypto primitives, proper PoW validation, key management.

---

*Area Owner Review synthesized from 7 specialist reviews*
*Generated: 2026-01-13*
*Feature Version: 2.0*
