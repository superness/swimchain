# Area Owner Review: Proof-of-Work Systems

**Generated**: 2026-01-13
**Overall Health Score**: 77/100
**Status**: Needs Attention

## Executive Summary

The Proof-of-Work Systems feature provides a solid dual-PoW architecture (SHA-256 for anti-Sybil identity creation, Argon2id for anti-spam actions) with strong cryptographic foundations and 97+ tests. However, a **critical spec deviation** exists: the documented Swimmer Level difficulty scaling is marked "Complete" in MASTER_FEATURES but is NOT implemented - all users face identical PoW costs regardless of contribution level, breaking the core "give bandwidth, get compute" value proposition. Additionally, **two security vulnerabilities require immediate attention**: verification DoS (50-200ms + 64 MiB per verification with no rate limiting, CVSS 7.5) and potential memory exhaustion from unbounded concurrent Argon2id operations (CVSS 5.3). The feature has excellent test coverage and clean architecture, but these gaps prevent production readiness.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 78/100 | 🟡 |
| Performance | 75/100 | 🟡 |
| Vision Alignment | 87/100 | 🟢 |
| User Experience | 76/100 | 🟡 |
| Accessibility | 76/100 | 🟡 |
| Quality | 82/100 | 🟢 |
| Security | 85/100 | 🟢 |
| **Overall** | **77/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Swimmer Level Difficulty Scaling NOT Implemented
- **Source**: Functionality, Vision, UX Reviews
- **Severity**: Critical
- **Description**: MASTER_FEATURES §2 documents "Difficulty Scaling" as "Status: Complete" with swimmer levels (Guppy: 20 bits → Anchor: 10 bits). However, `get_adjusted_difficulty()` at `src/crypto/action_pow.rs:619-631` returns static values regardless of user level. The `SwimmerLevel` type referenced in `src/api/anti_abuse.rs:25` does not exist in the codebase - no `pub mod level;` in `src/lib.rs`.
- **Impact**: Breaks the core vision of "give bandwidth, get compute" reciprocity. Experienced contributors face the same friction as new users, undermining retention and violating the documented social contract.
- **Action**:
  1. Define `SwimmerLevel` enum in `src/level.rs` and export from `src/lib.rs`
  2. Implement `get_level_adjusted_difficulty(action, level, config)` function
  3. Update MASTER_FEATURES to show actual implementation status ("Planned" not "Complete")
- **Effort**: M (4-8 hours)

### 2. Verification DoS Vulnerability (CVSS 7.5)
- **Source**: Security, Performance Reviews
- **Severity**: Critical
- **Description**: Each `verify_pow()` call at `src/crypto/action_pow.rs:524-585` takes 50-200ms and allocates 64 MiB with no rate limiting. Attacker can submit invalid PoW solutions to exhaust node resources.
- **Impact**: Service unavailability, resource exhaustion. At 100 concurrent requests, server spends 5-20 seconds per batch while attacker spends ~0.
- **Action**:
  1. Add per-IP rate limiting in RPC layer (10 verifications/second/IP)
  2. Add "quick rejection" - check `leading_zeros(hash)` before recomputing Argon2id
  3. Validate timestamp windows before expensive computation
- **Effort**: M (4-6 hours)

### 3. Memory Exhaustion from Concurrent Verifications (CVSS 5.3)
- **Source**: Security, Performance Reviews
- **Severity**: Critical
- **Description**: No limit on concurrent Argon2id verifications at `src/crypto/action_pow.rs:349-367`. Each uses 64 MiB. 16 concurrent requests = 1 GB RAM.
- **Impact**: Node OOM crashes, service unavailability.
- **Action**:
  1. Implement verification semaphore with `tokio::sync::Semaphore` limiting concurrent Argon2id calls (4-8 permits)
  2. Add memory pressure monitoring
  3. Add backpressure when limits reached
- **Effort**: S (2-3 hours)

## High Priority Issues

### 1. Nonce Exhaustion Returns Invalid Proof
- **Source**: Quality, Security Reviews
- **Severity**: High
- **Description**: `pow.rs:113-119` returns `IdentityCreationProof { nonce: 0, pow_hash: [0;32] }` on nonce wraparound instead of error. Invalid proof could propagate.
- **Impact**: Silent failure, invalid proofs accepted by systems not validating hash.
- **Action**: Change return type to `Result<IdentityCreationProof, IdentityError>`, add `NonceSpaceExhausted` variant.
- **Effort**: S (2 hours)

### 2. No Verification Caching
- **Source**: Performance Review
- **Severity**: High
- **Description**: Same PoW may be verified 3+ times (RPC → mempool → block → sync). Each verification costs 50-200ms + 64 MiB.
- **Impact**: 50-80% redundant Argon2id computation, reduced throughput to ~5-20 verifications/sec/core.
- **Action**: Implement LRU cache keyed by `sha256(challenge.serialize() || nonce)`. 10K entries = ~500 KB overhead.
- **Effort**: M (3-4 hours)

### 3. TypeScript Nonce Overflow Risk
- **Source**: Quality, Security Reviews
- **Severity**: High
- **Description**: `action-pow.ts:252` uses `nonce++` which loses precision after 2^53. `solutionToRpcParams()` at line 267 converts BigInt to Number.
- **Impact**: Silent corruption of nonce values, PoW verification failures for large nonces.
- **Action**: Use `nonce = nonce + 1n` (BigInt consistently). Keep nonce as string in RPC params.
- **Effort**: S (30 minutes)

### 4. Non-Constant-Time Hash Comparison (CVSS 3.7)
- **Source**: Security Review
- **Severity**: High
- **Description**: `pow.rs:195` and `action_pow.rs:571` use standard `!=` comparison, not constant-time.
- **Impact**: Theoretical timing side-channel. Violates cryptographic best practices.
- **Action**: Use `subtle::ConstantTimeEq` for all hash/signature comparisons.
- **Effort**: S (1 hour)

### 5. Keyboard Trap During Mining (WCAG 2.1.2 Violation)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: Users cannot navigate away during 30-60 second mining. Form is disabled, creating functional trap.
- **Impact**: Accessibility barrier for users with motor impairments or who need to multitask.
- **Action**: Move mining to Web Worker, allow background continuation with notification on completion.
- **Effort**: L (8-16 hours)

## Medium Priority Issues

### 1. Misleading Progress Bar
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Progress bar caps at 95% (`Math.min(..., 95)` in `PowProgress.tsx:53`) even when mining exceeds expected time.
- **Impact**: User anxiety, confusion when stuck at 95% for minutes.
- **Action**: Show "Still searching..." state with pulsing animation after 100%, display actual vs expected attempts.
- **Effort**: S (2 hours)

### 2. Hash Rate Estimate Uses Wrong Value
- **Source**: UX Review
- **Severity**: Medium
- **Description**: `PowProgress` uses hardcoded 50,000 H/s (SHA-256 rate) for time estimates. Argon2id is ~1-10 H/s.
- **Impact**: Time estimates wildly inaccurate for Action PoW (shows seconds instead of minutes).
- **Action**: Pass actual measured hash rate or use action-type-specific defaults.
- **Effort**: S (1 hour)

### 3. No Reduced Motion Support (WCAG 2.3.3)
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: 2-second rotating cube animation in `PowProgress.css:41-44` ignores `prefers-reduced-motion`.
- **Impact**: Users with vestibular disorders may experience discomfort.
- **Action**: Add `@media (prefers-reduced-motion: reduce) { .spinner-cube { animation: none; } }`.
- **Effort**: S (30 minutes)

### 4. Generic Error Messages
- **Source**: UX, Accessibility Reviews
- **Severity**: Medium
- **Description**: All errors show "An error occurred during mining" with no distinction between types.
- **Impact**: Users can't understand failures or take corrective action.
- **Action**: Map error types: `ChallengeExpired` → "Mining took too long", `MemoryError` → "Device may not have enough memory".
- **Effort**: S (2 hours)

### 5. Missing `ActionType::Invite`
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Per MASTER_FEATURES, invite actions should require PoW but no `ActionType::Invite` variant exists in `action_pow.rs:44-57`.
- **Impact**: Invites likely bypass PoW or use incorrect action type.
- **Action**: Add `Invite = 0x07` with appropriate difficulty (suggest 16 bits).
- **Effort**: S (1 hour)

### 6. WASM Verification Missing Timestamp Validation
- **Source**: Security, Functionality Reviews
- **Severity**: Medium
- **Description**: `swimchain-wasm/src/pow.rs:208-220` only checks difficulty, not timestamp bounds.
- **Impact**: Stockpiled PoW passes browser verification but fails server-side.
- **Action**: Add timestamp bounds checking to WASM verification function.
- **Effort**: S (1 hour)

## Quick Wins (Low Effort, High Impact)

1. **Fix hash rate estimate** - Change from 50,000 H/s to ~5 H/s for Action PoW time estimates - **30 min**
2. **Add reduced motion CSS** - `@media (prefers-reduced-motion: reduce)` for cube animation - **30 min**
3. **Fix TypeScript nonce type** - Change `nonce++` to `nonce = nonce + 1n` - **30 min**
4. **Update MASTER_FEATURES status** - Change "Difficulty Scaling" from "Complete" to "Planned" - **10 min**
5. **Add `role="alert"` to errors** - Improve screen reader error announcements - **30 min**
6. **Escape key to cancel mining** - Add keyboard shortcut for cancellation - **30 min**
7. **Add `#[inline]` to hot paths** - `leading_zeros()`, `verify_pow_difficulty()` - **15 min**

## Strengths to Preserve

- **Dual PoW Architecture**: Clean separation of Identity (SHA-256) and Action (Argon2id) PoW systems with distinct purposes.
- **Memory-Hard ASIC Resistance**: 64 MiB Argon2id with MIN_MEMORY_KIB floor (32 MiB) provides genuine ASIC resistance.
- **Comprehensive Test Suite**: 97+ tests across unit, integration, and spec vector categories with good Rust coverage.
- **Content Binding**: `verify_content_binding()` prevents PoW reuse across different content/authors.
- **Anti-Stockpile Protection**: 24h identity window, 10min action window effectively prevent pre-computation attacks.
- **Cross-Platform Consistency**: Matching implementations in Rust, WASM, and TypeScript with shared design patterns.
- **Progress UX**: Real-time stats, 3D cube animation, educational tips during wait time keep users engaged.
- **Cancellation Support**: All mining operations support clean cancellation via `compute_pow_cancellable()`.

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Add rate limiting to verification endpoints (P0 - DoS prevention, CVSS 7.5)
- [ ] Add verification semaphore for concurrent Argon2id calls (P0 - Memory protection, CVSS 5.3)
- [ ] Update MASTER_FEATURES §2 status: "Difficulty Scaling" → "Planned" (P0 - Spec accuracy)
- [ ] Fix TypeScript nonce overflow (`nonce = nonce + 1n`) (P1)
- [ ] Add quick rejection check before Argon2id recompute (P1)
- [ ] Fix hash rate estimate in PowProgress (30 min quick win)
- [ ] Add reduced motion CSS support (30 min quick win)

### Short Term (Next 2-4 Weeks)
- [ ] Define `SwimmerLevel` enum and fix broken imports in `anti_abuse.rs`
- [ ] Implement actual swimmer level difficulty scaling
- [ ] Add LRU verification cache (50-80% hit rate expected)
- [ ] Fix nonce exhaustion to return `Result` instead of invalid fallback
- [ ] Implement specific error messages for different failure types
- [ ] Add constant-time hash comparison with `subtle` crate
- [ ] Add ARIA live regions for mining progress

### Long Term (Backlog)
- [ ] Background mining via Web Workers (major UX improvement)
- [ ] Add `ActionType::Invite` variant
- [ ] Create shared test vectors across Rust/WASM/TypeScript
- [ ] Add WASM test runner to CI
- [ ] Add TypeScript test coverage (currently 0%)
- [ ] Implement mining checkpoints for resume after browser crash
- [ ] Document Edit ActionType in MASTER_FEATURES difficulty table

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Swimmer Level scaling documented but not implemented | M | H | 1 |
| No verification rate limiting (DoS vector, CVSS 7.5) | M | H | 1 |
| No verification memory limit (CVSS 5.3) | S | H | 1 |
| No verification caching (redundant computation) | M | H | 2 |
| Nonce exhaustion returns invalid fallback | S | M | 2 |
| TypeScript nonce overflow | S | M | 2 |
| Non-constant-time hash comparisons | S | L | 3 |
| SwimmerLevel type missing (broken import) | S | M | 3 |
| Mining loop code duplication (4 implementations) | M | L | 4 |
| Missing WASM/TypeScript test coverage | M | M | 4 |
| 4 ignored integration tests in rpc_pow_validation.rs | M | M | 4 |
| Undocumented Edit ActionType | S | L | 5 |
| Challenge serialization spec mismatch (75 vs 82 bytes) | S | L | 5 |

**Total Estimated Debt Remediation**: ~45-55 hours

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Verification DoS attack | High | High | Add rate limiting + semaphore (URGENT) |
| Memory exhaustion under load | High | High | Implement verification semaphore |
| Swimmer Level feature never implemented | Medium | High | Define timeline, assign ownership, update docs |
| WASM memory limits in browsers | Medium | Medium | Document requirements, test across browsers |
| Timestamp drift causing expired proofs | Low | Medium | Add warning when clock drift detected |
| Challenge window too short for slow devices | Low | Medium | Consider adaptive window or delegation |
| Nonce exhaustion (theoretical) | Very Low | Medium | Fix fallback to return error |
| Spec divergence with SPEC_03 | Low | Low | Update spec to match 82-byte reality |

## Appendix: Detailed Review Summaries

### Functionality (78/100)
The dual PoW architecture is well-implemented with clean APIs, comprehensive error types (`IdentityError`, `ActionPowError`), and cross-platform support. Core mining and verification work correctly per SPEC_01 and SPEC_03. **Critical gap**: Swimmer Level difficulty scaling is documented as "Complete" in MASTER_FEATURES but `get_adjusted_difficulty()` at `action_pow.rs:619-631` returns static values. The `SwimmerLevel` type referenced in `anti_abuse.rs:25` does not exist - indicates incomplete refactor. Missing `ActionType::Invite`, inconsistent timestamp byte ordering (Identity=LE, Action=BE), and nonce exhaustion returning invalid fallback instead of error. Test coverage strong at 97+ tests but missing TypeScript tests.

### Performance (75/100)
Algorithmic complexity is correct: O(1) verification for Identity PoW (<1ms), O(1) with expensive constant for Action PoW (50-200ms + 64 MiB). Mining is probabilistic O(2^difficulty). **Primary bottlenecks**: Verification DoS vector (no rate limiting allows flooding), no verification caching (same PoW verified 3+ times in RPC→mempool→block→sync flow), memory pressure from parallel verifications (10 concurrent = 640 MiB), no quick rejection for invalid PoW (full Argon2id even for obviously wrong hashes). Throughput limited to ~5-20 verifications/sec/core. Key optimizations needed: rate limiting, LRU cache, quick rejection checks, verification semaphore.

### Vision Alignment (87/100)
Strong alignment with Swimchain's decentralization principles. PoW replaces central gatekeeping with cryptographic proof-of-work - anyone can participate without permission. 64 MiB memory-hard Argon2id prevents ASIC/GPU farms from dominating. Content binding prevents PoW markets/reuse. Fork-level configuration enables community customization. **Vision concern**: Missing swimmer level scaling breaks "give bandwidth, get compute" reciprocity model - the documented social contract where contributors earn reduced PoW friction. Verification DoS could pressure centralization by forcing out smaller operators. Equal burden on new vs established users violates documented progressive trust model.

### User Experience (76/100)
Good progress feedback with 3D cube animation, real-time stats (attempts, elapsed time, hash rate), educational tips during wait, and cancellation support. Pre-submission hints show expected mining time. **Major issues**: No Swimmer Level scaling (same 30-60s friction for all users regardless of contribution), misleading progress bar (caps at 95% even when exceeding expected time), wrong hash rate estimate (shows 50K H/s for SHA-256 but Argon2id is ~5 H/s), generic error messages without actionable guidance, no background mining (user stuck on page during entire mining operation). Mining experience above average for blockchain apps but missing swimmer scaling undermines core value proposition.

### Accessibility (76/100)
Good ARIA foundations with proper `role="status"`, `role="progressbar"`, `aria-valuenow/min/max`, and `aria-hidden="true"` on decorative cube. Color contrast meets WCAG AA (15:1, 8:1, 5:1 documented). **WCAG violations**: 2.1.2 keyboard trap (cannot navigate during 30-60s mining), 2.2.1 timing not adjustable (10-min challenge window, no pause/resume), 2.3.3 no reduced motion support for spinning cube animation, 4.1.3 status updates too frequent (may overwhelm screen readers). Generic error messages lack `role="alert"`. Technical jargon ("bits", "hashes/sec") needs plain-language alternatives. Long mining creates functional barriers for users with motor impairments.

### Quality & Reliability (82/100)
Well-structured modules with clear separation (Identity PoW in `pow.rs`, Action PoW in `action_pow.rs`, shared utils in `hash.rs`). Consistent naming (`mine_*`, `verify_*`, `compute_*`), comprehensive spec references (SPEC_01, SPEC_03). Excellent Rust test coverage: 97+ tests including unit, integration, and spec vectors. Good error types with informative messages using thiserror. **Reliability concerns**: Nonce exhaustion returns invalid fallback (should be `Result::Err`), TypeScript nonce overflow risk (BigInt→Number conversion), no rate limiting protection for verification, race conditions in React hooks (stale progress values), timestamp captured at mining start could expire during long mines. Zero TypeScript test coverage is critical gap. 4 integration tests remain ignored/TODO.

### Security (85/100)
Strong cryptographic foundations: SHA-256 for Identity PoW, Argon2id (OWASP recommended) for Action PoW, Ed25519 for signatures, proper OS-provided RNG (OsRng, crypto.getRandomValues). Content binding via `verify_content_binding()` prevents PoW reuse. Anti-stockpile windows (24h identity, 10min action) prevent pre-computation attacks. 64 MiB memory-hardness (with 32 MiB minimum) provides genuine ASIC resistance. **Vulnerabilities**: HIGH - DoS via verification flooding (CVSS 7.5), memory exhaustion from concurrent verifications (CVSS 5.3), nonce exhaustion returns invalid proof, TypeScript nonce overflow. MEDIUM - Non-constant-time hash comparisons (CVSS 3.7), WASM verification missing timestamp checks. Test config (1 MiB) below ASIC resistance floor but acceptable for testing only.

---

*Synthesized: 2026-01-13*
*Sources: 7 perspective reviews (Functionality, Performance, Vision, UX, Accessibility, Quality, Security)*
*Files Analyzed: pow.rs, action_pow.rs, hash.rs, wasm/pow.rs, action-pow.ts, useActionPow.ts, error.rs, rpc/methods.rs, anti_abuse.rs, lib.rs, PowProgress.tsx, PowProgress.css, SPEC_01, SPEC_03, MASTER_FEATURES.md*
*Overall Assessment: Feature has strong architecture and cryptographic design but critical gaps (swimmer scaling not implemented, DoS protection missing) block production readiness*
