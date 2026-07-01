# Area Owner Review: Fork System

**Generated**: 2026-01-12
**Overall Health Score**: 70/100
**Status**: Needs Attention

## Executive Summary

The Fork System provides a solid architectural foundation for Swimchain's "exit as power" vision, enabling communities to escape captured chains while preserving cryptographic identity. However, **critical security vulnerabilities** in signature verification (supporter and creator signatures stored but never verified, CVSS 7.5) and **core functionality gaps** (content migration not implemented, CLI fork creation broken) must be addressed before production use. Performance and vision alignment are strong (82/100 each), but UX (62/100), accessibility (59/100), and security (64/100) require significant investment. The feature has good architectural bones but approximately 8-12 hours of focused P0 work is needed to reach production readiness.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 74/100 | 🟡 |
| Performance | 82/100 | 🟢 |
| Vision Alignment | 82/100 | 🟢 |
| User Experience | 62/100 | 🟡 |
| Accessibility | 59/100 | 🔴 |
| Quality | 66/100 | 🟡 |
| Security | 64/100 | 🔴 |
| **Overall** | **70/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Supporter Signature Verification Missing
- **Source**: Security Review, Quality Review, Vision Review
- **Severity**: Critical (CVSS 7.5)
- **Description**: `add_fork_support()` at `src/fork/registry.rs:291-311` stores supporter signatures without cryptographic verification. Anyone can add arbitrary endorsements with fabricated signatures.
- **Impact**: Fork legitimacy can be faked by claiming endorsements from influential identities. Completely undermines the endorsement trust model.
- **Action**: Add Ed25519 signature verification before storing: verify signature against genesis bytes using `crate::identity::verify()`.
- **Effort**: S (2 hours)

### 2. Creator Signature Never Verified on Load
- **Source**: Security Review
- **Severity**: Critical (CVSS 7.1)
- **Description**: When loading fork genesis from storage at `src/fork/storage.rs:66-72`, `creator_sig` is never validated against `creator_id` and genesis bytes.
- **Impact**: Fork genesis can be tampered with post-creation without detection. Excluded bad actors could be removed.
- **Action**: Add verification in `ForkStore::get_genesis()` or create `verify_genesis()` helper.
- **Effort**: S (2 hours)

### 3. Unbounded Deserialization Vectors (DoS)
- **Source**: Security Review
- **Severity**: Critical (CVSS 7.5)
- **Description**: No limits on `excluded_ids` and `supporter_sigs` counts during deserialization at `src/fork/genesis.rs:348-358` and `388-407`. Attacker can craft genesis with billions of entries.
- **Impact**: Remote denial of service via crafted network messages. Node attempts 128GB allocation and crashes.
- **Action**: Add bounds checking: `MAX_EXCLUDED_IDS = 10,000`, `MAX_SUPPORTERS = 1,000`. Return `None` if exceeded.
- **Effort**: S (1 hour)

### 4. CLI Fork Creation Broken
- **Source**: Functionality Review, UX Review
- **Severity**: Critical
- **Description**: The CLI `sw fork create` command at `src/cli/commands/fork.rs:196-202` doesn't pass `secret_key` to RPC, but RPC requires it.
- **Impact**: Users cannot create forks through the primary CLI interface. Feature is unusable via CLI.
- **Action**: Read identity from config file (already checked at `fork.rs:181-183`) and include `secret_key` in RPC params.
- **Effort**: S (1 hour)

### 5. Misleading Inherited Content Count
- **Source**: Functionality Review, UX Review, Vision Review
- **Severity**: Critical
- **Description**: The `inherited_content_count` displayed to users at `src/fork/registry.rs:178-198` is estimation-only. No actual content copying occurs.
- **Impact**: Users believe their content migrates to the fork when it doesn't. Trust-destroying expectation violation.
- **Action**: Either implement content migration OR change output text to "Estimated (content migration not yet implemented)".
- **Effort**: S (15 min for disclaimer) / L (for full implementation)

## High Priority Issues

### 1. RwLock Panics in Production Code
- **Source**: Quality Review, Security Review
- **Severity**: High
- **Description**: `unwrap()` on RwLock guards at `src/fork/registry.rs:115, 216, 227` will panic if lock is poisoned by another thread's panic.
- **Impact**: One panicked thread causes cascading failure of all fork operations.
- **Action**: Replace with `read().unwrap_or_else(|e| e.into_inner())` or proper error propagation.
- **Effort**: S (1 hour)

### 2. Selective Filter Params Not Exposed via RPC
- **Source**: Functionality Review, UX Review
- **Severity**: High
- **Description**: `content_mode: "selective"` via RPC sets all filters to `None` at `src/rpc/methods.rs:5939-6074`, making it equivalent to "all".
- **Impact**: Documented feature is non-functional. Users cannot selectively migrate content.
- **Action**: Expose `space_filter`, `time_filter`, `identity_filter` parameters in RPC schema.
- **Effort**: M (2-3 hours)

### 3. No Fork UI in Web Clients
- **Source**: UX Review, Accessibility Review
- **Severity**: High
- **Description**: Forum-client and chat-client have zero fork functionality. Feature invisible to most users.
- **Impact**: Excludes web users and users who cannot use CLI due to motor impairments (WCAG 2.1.1 violation).
- **Action**: Implement fork indicator in forum-client header with proper ARIA attributes.
- **Effort**: M (4-6 hours)

### 4. min_supporters Threshold Not Enforced
- **Source**: Vision Review
- **Severity**: High
- **Description**: SPEC_05 defines `min_supporters` in ForkConfig, but implementation doesn't enforce this threshold.
- **Impact**: Single actors can create forks, violating FK-S01 governance friction principle.
- **Action**: Check supporter count >= config threshold in `ForkRegistry::create_fork()`.
- **Effort**: S (1 hour)

### 5. Mobile ForkIndicator Accessibility Violations
- **Source**: Accessibility Review
- **Severity**: High (WCAG Level A)
- **Description**: ForkIndicator at `mobile-client/src/components/ForkIndicator.tsx` uses color-only status (green/yellow dots) with no accessibility attributes.
- **Impact**: Screen reader users receive no information. Color blind users cannot distinguish states.
- **Action**: Add `accessibilityLabel`, `accessibilityRole="status"`, and text labels ("Main Chain" / "Minority Fork").
- **Effort**: S (30 min)

### 6. Silent Truncation of Supporter Signatures
- **Source**: Security Review, Quality Review
- **Severity**: High
- **Description**: `from_bytes()` at `src/fork/genesis.rs:394-407` silently accepts truncated supporter data instead of failing.
- **Impact**: Data corruption goes undetected. Fork appears to have fewer endorsements than recorded.
- **Action**: Return `None` if declared supporter count doesn't match actual data.
- **Effort**: S (30 min)

## Medium Priority Issues

### 1. Linear Exclusion Check (O(n) instead of O(1))
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `ForkGenesis::is_excluded()` at `genesis.rs:213-214` uses `Vec::contains()` despite `ForkConfig` using `HashSet`.
- **Impact**: 1000 exclusions = 1000 comparisons per check in hot path.
- **Action**: Convert Vec to HashSet on genesis load and cache.
- **Effort**: S (1 hour)

### 2. No Genesis Cache for is_excluded() Hot Path
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `ForkRegistry::is_excluded()` at `registry.rs:277-289` loads full genesis from disk on every call.
- **Impact**: Disk I/O + deserialization on every exclusion check.
- **Action**: Add LRU cache for genesis (16-64 entries).
- **Effort**: M (2-3 hours)

### 3. N+1 Query Pattern in list_forks RPC
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `list_forks` calls `get_fork_info()` for each fork, resulting in n+1 database reads.
- **Impact**: 100 forks = 101 database reads. Linear degradation.
- **Action**: Add pagination or batch load fork info.
- **Effort**: M (2-3 hours)

### 4. 64-Character Hex IDs Hostile to Users
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Fork IDs displayed and required as 64-char hex. No name-based switching support.
- **Impact**: Users must copy full hex ID to switch forks.
- **Action**: Support name-based switching; display truncated IDs with copy action.
- **Effort**: M (2-3 hours)

### 5. Race Condition in switch_fork()
- **Source**: Security Review, Quality Review
- **Severity**: Medium
- **Description**: Storage and cache updated non-atomically at `registry.rs:212-229`.
- **Impact**: Crash between steps leaves disk and memory inconsistent.
- **Action**: Use sled transaction or single atomic operation.
- **Effort**: M (2 hours)

### 6. No Description Length Limit
- **Source**: Security Review
- **Severity**: Medium
- **Description**: Fork name is limited to 64 chars, but description has no limit.
- **Impact**: Multi-megabyte descriptions can be submitted, bloating storage.
- **Action**: Add description length limit (4096 chars).
- **Effort**: S (30 min)

## Quick Wins (Low Effort, High Impact)

1. **Fix misleading content count**: Change text to "Estimated (migration not implemented)" - 15 min, honesty fix
2. **Add bounds checking**: 2 lines for excluded_ids and supporter_sigs - 1 hour, prevents DoS
3. **Add accessibility labels to ForkIndicator**: 3 lines of code - 30 min, WCAG Level A compliance
4. **Fix silent truncation**: Return `None` instead of `break` - 30 min, data integrity
5. **Support "main" alias everywhere**: Extend to all commands - 30 min, UX improvement
6. **Human-readable timestamps**: Format output - 1 hour, major UX improvement
7. **Add text labels to color indicators**: "Main Chain" / "Minority Fork" - 30 min, accessibility
8. **Convert exclusion Vec to HashSet on load**: O(n) -> O(1) lookups - 1 hour, performance
9. **Add description length limit**: Single validation - 30 min, security hardening
10. **Replace RwLock unwrap**: Change to `unwrap_or_else` - 1 hour, reliability

## Strengths to Preserve

- **Clean builder pattern**: `ForkConfig::builder()` with `#[must_use]` is idiomatic Rust and safe
- **Deterministic fork IDs**: SHA-256 of genesis ensures same config = same ID, enabling verification
- **Ed25519 keypair portability**: Keys work across all forks per Theorem 5.1 - core vision alignment
- **Good error types**: `ForkError` and `ForkStoreError` via `thiserror` provide clear error taxonomy
- **Comprehensive unit tests**: 22+ tests covering core functionality (though integration tests needed)
- **Sled persistence**: Efficient embedded storage with crash recovery
- **Vision alignment**: Core mechanics enable "exit as power" - community escape from captured chains
- **Protocol version field**: `ForkGenesis.version` allows future format changes

## Action Plan for Area Owner

### Immediate (This Sprint) - ~8 hours total
- [ ] **P0**: Add supporter signature verification (`registry.rs:291-311`) - 2h
- [ ] **P0**: Add creator signature verification on genesis load - 2h
- [ ] **P0**: Add bounds checking in `from_bytes()` - 1h
- [ ] **P0**: Fix CLI to pass secret_key (`cli/commands/fork.rs`) - 1h
- [ ] **P0**: Fix misleading inherited content count message - 15min
- [ ] **P0**: Fix silent truncation to return error - 30min
- [ ] **P0**: Add accessibilityLabel to mobile ForkIndicator - 30min
- [ ] **P0**: Replace RwLock `unwrap()` with proper handling - 1h

### Short Term (Next 2-4 Weeks) - ~20 hours total
- [ ] Implement content migration for `ContentSelector::All` mode
- [ ] Expose selective filter params in RPC
- [ ] Add fork indicator to forum-client header with ARIA
- [ ] Enforce min_supporters threshold
- [ ] Support name-based fork switching
- [ ] Add genesis LRU cache for is_excluded() hot path
- [ ] Convert exclusion list to HashSet on load
- [ ] Add confirmation prompts for fork switch
- [ ] Display human-readable timestamps
- [ ] Add integration tests for fork operations

### Long Term (Backlog)
- [ ] Implement full content migration with all ContentSelector modes
- [ ] Add fork network propagation handlers (0x53-0x55 messages)
- [ ] Add cross-fork sync capability
- [ ] Implement fork comparison command
- [ ] Consider client-side signing instead of secret key over RPC
- [ ] Add concurrent access tests with stress testing
- [ ] Migrate manual serialization to bincode/postcard
- [ ] Add fork search/filter for large fork counts

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Missing signature verification | S | H | 1 |
| Unbounded deserialization | S | H | 1 |
| CLI secret_key fix | S | H | 1 |
| RwLock panic on poisoning | S | H | 1 |
| Silent data truncation | S | H | 1 |
| Content migration not implemented | L | H | 2 |
| Linear exclusion check (Vec) | S | M | 3 |
| No genesis cache | M | M | 3 |
| No integration tests | M | M | 3 |
| N+1 query in list_forks | M | M | 4 |
| Manual serialization | M | L | 5 |
| Known forks flat blob storage | M | L | 5 |
| Duplicate Identity type | S | L | 5 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fake endorsements undermine trust | High | High | Implement signature verification (P0) |
| DoS via crafted genesis | Medium | High | Add bounds checking (P0) |
| Users confused by non-migrated content | High | Medium | Fix messaging or implement migration |
| Feature invisible to web users | High | Medium | Add forum-client fork UI |
| CLI unusable - broken create | High | High | Fix secret_key flow (P0) |
| Performance cliff at scale | Medium | Medium | Add caching, pagination, HashSet |
| Secret key exposure via RPC | Medium | High | Consider client-side signing (P2) |
| Race conditions on fork switch | Low | Medium | Make operations atomic |
| Accessibility lawsuits | Low | Medium | Fix WCAG Level A violations |
| Lock poisoning cascade | Low | High | Replace unwrap() with error handling |

## Appendix: Detailed Review Summaries

### Functionality (74/100)
**Completeness: 16/25 | Correctness: 19/25 | API Design: 22/25 | Integration: 17/25**

The Fork System implements core fork mechanics with a clean builder pattern API and robust sled persistence. However, critical gaps exist: content migration is not implemented (estimation only), network propagation handlers are missing (message types exist but no handlers), CLI create is broken (secret_key not passed), and selective filter params aren't exposed via RPC. The API design is strong with idiomatic Rust patterns, proper error types, and well-typed responses. Integration with storage/CLI is good but network integration is incomplete.

### Performance (82/100)
**Algorithmic Complexity: 20/25 | Resource Usage: 21/25 | Scalability: 20/25 | Optimization: 21/25**

Solid performance fundamentals with O(1) core operations, efficient sled persistence, and appropriate RwLock caching. Bottlenecks emerge at scale: linear exclusion check O(n) via Vec instead of HashSet, no genesis cache forcing disk I/O on every is_excluded() call, and N+1 query pattern in list_forks. Typical operations complete in 1-5ms. With 100+ forks or 1000+ exclusions, performance degrades noticeably. Key optimizations: genesis LRU cache (10-100x improvement), HashSet for exclusions (O(1) lookup), pagination for list_forks.

### Vision Alignment (82/100)
**Vision: 26/30 | Spec Compliance: 18/25 | Architecture: 21/25 | Future Compat: 17/20**

Strong philosophical alignment with "exit as power" vision. Ed25519 keypairs work across forks per Theorem 5.1. Zero exit cost - no economic penalty for forking. However, critical spec deviations undermine governance guardrails: supporter signatures never verified (SPEC_05 V-GEN-08), min_supporters not enforced, content migration documented but not implemented, fork_cooldown not enforced. The implementation enables the vision but lacks verification infrastructure.

### User Experience (62/100)
**Usability: 16/30 | Discoverability: 9/20 | Efficiency: 18/25 | Delight: 19/25**

Functional CLI/RPC for technical users but fundamentally fails mainstream adoption. Critical blocking issues: CLI create broken, "inherited content count" misleads users, web clients have zero fork UI, 64-character hex IDs are hostile. Mobile ForkIndicator shows visual polish. Positive elements: "main" alias support, `--json` output, good CLI help text. Feature is invisible to most users and creates false expectations for those who find it.

### Accessibility (59/100)
**Perceivable: 12/25 | Operable: 16/25 | Understandable: 18/25 | Robust: 13/25**

Fails WCAG 2.1 Level AA compliance. Critical violations: color-only status indication (green/yellow dots) violates 1.4.1, missing accessibility attributes on mobile violates 4.1.2, no web UI forces CLI-only access which excludes motor-impaired users (2.1.1). CLI is inherently keyboard accessible. Warning text contrast (~1.4:1) fails 4.5:1 minimum. Screen readers cannot interpret ForkIndicator.

### Quality (66/100)
**Code Quality: 18/25 | Test Coverage: 14/25 | Error Handling: 16/25 | Reliability: 18/25**

Clean module organization, idiomatic Rust patterns (builder, #[must_use]), proper error types via thiserror. 22 unit tests covering happy paths. Critical reliability issues: RwLock unwrap() panics if poisoned, signature verification completely absent, unbounded deserialization enables DoS, zero integration tests. Race conditions exist in fork switching. Technical debt includes manual serialization and duplicate Identity type.

### Security (64/100)
**Auth & Authz: 14/25 | Crypto: 17/25 | Input Validation: 14/25 | Data Protection: 19/25**

Correct cryptographic primitives (Ed25519 via ed25519-dalek, SHA-256 via sha2). Critical failure: signatures are generated but never verified at trust boundaries. Supporter signatures stored without validation (CVSS 7.5). Creator signature never verified on genesis load (CVSS 7.1). Unbounded inputs enable DoS (CVSS 7.5). Secret key over RPC is concerning but mitigated by localhost-only default. Feature is **not safe for production** until P0 security items are fixed.

---

*Area Owner Review generated: 2026-01-12*
*Feature: Fork System (MASTER_FEATURES.md Section 18, src/fork/)*
*Synthesis of 7 perspective reviews*
*Next review: After P0 fixes implemented*
