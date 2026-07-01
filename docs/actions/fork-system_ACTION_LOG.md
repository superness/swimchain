# Action Log: Fork System

**Generated**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/fork-system_AREA_OWNER_REVIEW.md
**Pipeline Run**: fork-system-pipeline-20260113
**Original Score**: 70/100 (Needs Attention)

## Executive Summary

The Fork System implementation pipeline addressed 9 of 17 identified issues across all priority levels. All critical security vulnerabilities were resolved except C4 (CLI fork creation), which requires M-effort changes involving encrypted identity file handling. Signature verification (C1, C2), DoS protection via bounds checking (C3), and data integrity fixes (H6) significantly improve the security posture. The fork module now validates all cryptographic signatures and prevents unbounded deserialization attacks.

## Changes Applied

### Critical Fixes (4 applied, 1 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| C1 | Add supporter signature verification with Ed25519 | `src/fork/registry.rs:318-328` | FIXED |
| C2 | Add creator signature verification on genesis load | `src/fork/storage.rs:74-77, 86-91` | FIXED |
| C3 | Add bounds checking (MAX_EXCLUDED_IDS=10,000, MAX_SUPPORTERS=1,000) | `src/fork/genesis.rs:368-371, 417-420` | FIXED |
| C4 | CLI fork create doesn't pass secret_key to RPC | `src/cli/commands/fork.rs:196-202` | NEEDS_HUMAN_REVIEW |
| C5 | Fix misleading inherited content count message | `src/cli/commands/fork.rs:238-241` | FIXED |

### High Priority Fixes (3 applied, 3 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| H1 | RwLock panics - replaced `unwrap()` with poison recovery | `src/fork/registry.rs:115-119, 219-222, 233-236` | FIXED |
| H2 | Selective filter params not exposed via RPC | `src/rpc/methods.rs` | NEEDS_HUMAN_REVIEW |
| H3 | No fork UI in web clients | `forum-client/`, `chat-client/` | NEEDS_HUMAN_REVIEW |
| H4 | min_supporters threshold not enforced | `src/fork/registry.rs` | NEEDS_HUMAN_REVIEW |
| H5 | Mobile ForkIndicator accessibility violations | `mobile-client/src/components/ForkIndicator.tsx:24-58, 114-119` | FIXED |
| H6 | Silent truncation of supporter signatures | `src/fork/genesis.rs:423-425` | FIXED |

### Medium Priority Fixes (2 applied, 4 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| M1 | Linear exclusion check (O(n) to O(1)) | `src/fork/genesis.rs:163-164, 241-245, 463-464` | FIXED |
| M2 | No genesis cache for is_excluded() hot path | - | NEEDS_HUMAN_REVIEW |
| M3 | N+1 query pattern in list_forks RPC | - | NEEDS_HUMAN_REVIEW |
| M4 | 64-character hex IDs hostile to users | - | NEEDS_HUMAN_REVIEW |
| M5 | Race condition in switch_fork() | - | NEEDS_HUMAN_REVIEW |
| M6 | No description length limit | `src/fork/registry.rs:138-142` | FIXED |

## Validation Results

- **Build (cargo check --lib)**: PASS (warnings only, no errors)
- **Type Check (TypeScript)**: SKIPPED (pre-existing tsconfig issue unrelated to changes)
- **Tests (cargo test fork)**: PASS (39 tests passed, 0 failed)
- **Fork Module Tests (cargo test --lib fork::)**: PASS (24 tests passed, 0 failed)

## Files Modified

```
src/fork/registry.rs
src/fork/storage.rs
src/fork/genesis.rs
src/cli/commands/fork.rs
mobile-client/src/components/ForkIndicator.tsx
```

## Detailed Changes

### C1: Supporter Signature Verification (registry.rs:291-321)
Added Ed25519 signature verification in `add_fork_support()`:
- Changed to accept raw pubkey and signature instead of Identity
- Get genesis bytes for signing via `to_bytes_for_signing()`
- Create PublicKey and Signature from supporter data
- Call `crate::crypto::signature::verify()` before storing
- Return `ForkError::SignatureError` on failure

### C2: Creator Signature Verification (storage.rs:65-89)
Added creator signature verification on genesis load:
- New `verify_creator_signature()` helper function
- Called in `get_genesis()` after deserialization
- Added `SignatureVerificationFailed` error variant
- Returns error on verification failure

### C3: Bounds Checking (genesis.rs:368-371, 417-420)
Added constants and validation:
- `MAX_EXCLUDED_IDS = 10,000`
- `MAX_SUPPORTERS = 1,000`
- Returns `None` from `from_bytes()` if limits exceeded

### C5: Misleading Content Count (cli/commands/fork.rs:238-241)
Changed output text to indicate estimation only:
- From: "Inherited content: ~{}"
- To: "Estimated inherited content: ~{} (content migration not yet implemented)"

### H1: RwLock Panic Prevention (registry.rs:115-119, 219-222, 233-236)
Changed from `unwrap()` to poison recovery:
```rust
.unwrap_or_else(|poisoned| poisoned.into_inner())
```

### H5: Mobile Accessibility (ForkIndicator.tsx:24-58, 114-119)
Added accessibility attributes:
- `accessibilityRole="status"` on container Views
- `accessibilityLabel` with full status description
- `accessibilityElementsHidden={true}` on decorative color indicator
- Visible text label `{statusLabel}` showing "Main Chain" / "Minority Fork"
- New `statusLabel` style for the text label

### H6: Silent Truncation Fix (genesis.rs:423-425)
Changed from `break` to `return None` when supporter data is incomplete:
```rust
if pos + 32 + 64 > bytes.len() {
    return None; // Reject incomplete data
}
```

### M1: HashSet Optimization (genesis.rs:163-164, 175-193, 218, 230, 241-245, 463-464)
- Added `excluded_set: HashSet<[u8; 32]>` field to ForkGenesis struct
- Added manual PartialEq/Eq implementations (excluded_set is derived, not serialized)
- Initialize excluded_set in `new()` and `with_config()`
- Changed `is_excluded()` to use HashSet::contains() for O(1) lookups
- Build excluded_set from Vec in `from_bytes()`

### M6: Description Length Limit (registry.rs:138-142)
Added validation in `create_fork()`:
```rust
if config.description.len() > 4096 {
    return Err(ForkError::InvalidConfig(
        "Fork description too long (max 4096 chars)".into(),
    ));
}
```

## Remaining Items (Need Manual Attention)

### Skipped Issues (Higher Effort)

| Issue | Reason | Suggested Action |
|-------|--------|------------------|
| C4 | M-effort: requires encrypted identity file loading and password prompts | Implement identity loading from config path, decrypt with password prompt, pass secret_key to RPC. Consider client-side signing alternative. |
| H2 | M-effort: multi-file RPC schema changes | Expose `space_filter`, `time_filter`, `identity_filter` parameters in RPC create_fork method |
| H3 | M-L effort: significant frontend work (4-6 hours) | Implement fork indicator component in forum-client header with ARIA attributes |
| H4 | M-effort: requires config field addition | Add min_supporters check in create_fork() comparing supporter count to config threshold |
| M2 | M-effort: LRU cache implementation | Add `lru` crate dependency, create 16-64 entry cache in ForkRegistry for genesis objects |
| M3 | M-effort: batch loading or restructuring | Modify list_forks RPC to batch load fork info or add pagination |
| M4 | M-effort: name-based lookup index | Create name->id mapping in sled, support name-based fork switching in CLI |
| M5 | M-effort: sled transaction API | Use sled transaction for atomic storage + cache updates in switch_fork() |

### Long Term Items (Backlog)

| Item | Notes |
|------|-------|
| Full content migration | Implement ContentSelector::All mode with actual content copying |
| Fork network propagation | Add handlers for 0x53-0x55 message types |
| Cross-fork sync capability | Large architectural feature |
| Client-side signing | Replace secret key over RPC with client-side signing |
| Migration to bincode/postcard | Replace manual serialization |

## Suggested Git Commit

```
fix(fork): Address area owner review feedback - security & integrity

- Fixed 4 critical issues: signature verification, bounds checking
- Fixed 3 high priority issues: RwLock handling, accessibility, truncation
- Fixed 2 medium priority issues: HashSet optimization, description limit

Security improvements:
- Added Ed25519 signature verification for supporter endorsements (C1)
- Added creator signature verification on genesis load (C2)
- Added bounds checking: MAX_EXCLUDED_IDS=10,000, MAX_SUPPORTERS=1,000 (C3)
- Fixed silent truncation to return error (H6)

Remaining: 8 items need manual review (C4, H2-H4, M2-M5)

Review: docs/reviews/fork-system_AREA_OWNER_REVIEW.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Next Steps

1. Review the remaining items above (especially C4 - CLI fork creation)
2. Run full test suite: `cargo test && cd mobile-client && npm test`
3. Manual testing of fork creation, support, and switching operations
4. Create PR with these changes
5. Schedule follow-up sprint for H2 (RPC params), H3 (web UI), H4 (min_supporters)

## Metrics

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Critical Issues | 5 | 1 | -80% |
| High Priority Issues | 6 | 3 | -50% |
| Medium Priority Issues | 6 | 4 | -33% |
| **Total Fixed** | - | 9 | - |
| **Estimated Score** | 70/100 | ~78/100 | +8 pts |

---

*Action Log generated: 2026-01-13*
*Pipeline: fork-system-pipeline-20260113*
*Total fixes applied: 9/17 issues*
