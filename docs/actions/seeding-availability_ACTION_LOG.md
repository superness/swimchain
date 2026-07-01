# Action Log: Seeding & Availability

**Generated**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/seeding-availability_AREA_OWNER_REVIEW.md
**Pipeline Run**: seeding-availability-pipeline-20260113
**Original Score**: 69/100

## Executive Summary

The implementation pipeline processed 14 actionable issues from the Seeding & Availability area owner review. **4 issues were automatically fixed** (H1, M2, M3, M4), addressing the unbounded pending announcements queue, config update error handling, mode naming inconsistency, and wire format expiry validation. **10 issues require human review** due to scope (multi-file changes), effort (M/L), or design decisions needed. All changes passed validation with `cargo check` and 62 tests passing.

## Changes Applied

### Critical Fixes (0 applied, 4 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| C1 | Background announcement task is placeholder | - | NEEDS_HUMAN_REVIEW |
| C2 | No RPC endpoints for user access | - | NEEDS_HUMAN_REVIEW |
| C3 | Silent lock poisoning failures (~20 sites) | `src/seeding/config.rs`, `src/seeding/manager.rs` | PARTIAL (1 site fixed) |
| C4 | Availability announcements lack signature verification | - | NEEDS_HUMAN_REVIEW |

### High Priority Fixes (1 applied, 3 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| H1 | Unbounded pending announcements queue | `src/seeding/availability.rs`, `src/types/constants.rs` | FIXED |
| H2 | No per-peer rate limiting on announcements | - | NEEDS_HUMAN_REVIEW |
| H3 | Statistics HashMap lock contention | - | NEEDS_HUMAN_REVIEW |
| H4 | No CLI commands | - | NEEDS_HUMAN_REVIEW |

### Medium Priority Fixes (3 applied, 3 remaining)

| Issue | Description | Files Changed | Status |
|-------|-------------|---------------|--------|
| M2 | `update_config()` returns Ok even on write failure | `src/seeding/manager.rs` | FIXED |
| M3 | Mode naming inconsistency | `docs/MASTER_FEATURES.md` | FIXED |
| M4 | No expiry validation in wire format | `src/seeding/availability.rs`, `src/types/constants.rs` | FIXED |
| M1 | `storage_limit_gb` configuration not enforced | - | NEEDS_HUMAN_REVIEW |
| M5 | PeerAvailabilityMap full prune at capacity | - | NEEDS_HUMAN_REVIEW |
| M6 | No statistics persistence | - | NEEDS_HUMAN_REVIEW |

## Validation Results

- Build (`cargo check --lib`): PASS
- Tests (`cargo test --lib seeding::`): PASS (62 passed, 0 failed)
- Type Check: N/A (Rust project)

## Files Modified

```
src/seeding/availability.rs
src/seeding/config.rs
src/seeding/manager.rs
src/types/constants.rs
docs/MASTER_FEATURES.md
```

## Constants Added

| Constant | Value | Location |
|----------|-------|----------|
| `AVAILABILITY_MAX_TTL_SECS` | 3600 (1 hour) | `src/types/constants.rs` |
| `AVAILABILITY_MAX_PENDING_PER_SPACE` | 1000 | `src/types/constants.rs` |

## Detailed Fix Descriptions

### H1: Bounded Pending Announcements Queue
- Added `AVAILABILITY_MAX_PENDING_PER_SPACE = 1000` constant
- Updated `on_content_stored()` to enforce limit with oldest-eviction policy
- Updated `on_contents_stored()` to enforce limit with oldest-eviction policy
- Added 2 new tests for limit enforcement

### M2: Config Update Error Handling
- Added `LockPoisoned` error variant to `SeedingConfigError`
- Reordered operations in `update_config()` to write config first
- Now returns error if config write fails instead of silent success

### M3: Mode Naming Documentation
- Updated `docs/MASTER_FEATURES.md` to document `FullSpace` mode
- Aligns documentation with implementation (was incorrectly referencing `AllFollowed`/`Everything`)

### M4: Wire Format Expiry Validation
- Added `AVAILABILITY_MAX_TTL_SECS = 3600` constant (1 hour max TTL)
- Added validation in `AvailabilityAnnouncePayload::deserialize()`
- Rejects announcements with `expires_at > current_time + MAX_TTL`

## Remaining Items (Need Manual Attention)

### Skipped Issues

| Issue | Reason | Suggested Action |
|-------|--------|------------------|
| C1: Background task placeholder | Core networking integration, M effort | Implement `spawn_availability_announcer()` to call `get_announcement_batches()` and broadcast via gossip at `src/node/tasks.rs:1119-1120` |
| C2: No RPC endpoints | Multi-file API changes, M effort | Implement `get_seeding_config`, `set_seeding_config`, `get_seeding_stats` RPC methods |
| C3: Silent lock poisoning (remaining ~19 sites) | Consider full parking_lot migration | Add logging for all lock failures or migrate to `parking_lot::RwLock` |
| C4: No signature verification | Security-critical, L effort | Require signed announcements with signature verification against peer public key |
| H2: No per-peer rate limiting | Design decisions needed, M effort | Add `peer_announcement_counts` HashMap with exponential backoff |
| H3: Statistics lock contention | Requires dependency approval | Add `dashmap = "5"` to Cargo.toml, replace `RwLock<HashMap>` with `DashMap` |
| H4: No CLI commands | CLI architecture integration | Create `src/cli/commands/seeding.rs` with show/enable/disable/set subcommands |
| M1: storage_limit_gb not enforced | Design decision needed | Either implement disk usage enforcement OR remove config option |
| M5: Full prune at capacity | Algorithm redesign needed | Implement incremental pruning (100 entries per `record()` call) |
| M6: No statistics persistence | File format versioning needed | Add `save_to_disk()`/`load_from_disk()` with periodic background save |

### Low Priority Items (Not Addressed)

| Issue | Effort | Suggested Action |
|-------|--------|------------------|
| L1: Replace RwLock with parking_lot | S (30 min) | Drop-in replacement for ~20% faster locks |
| L2: Add `#[inline]` to hot paths | S (15 min) | Add attribute to `rate_limiter.rs:88-90` |
| L3: Add mode descriptions | S (30 min) | Add `SeedingMode::description()` method |
| L4: Unused `_hash` parameter | S | Remove or use parameter in `should_seed()` |

## Suggested Git Commit

```
fix(seeding): Address area owner review feedback

- Fixed unbounded pending announcements queue with max limit (H1)
- Fixed update_config() silent failure on lock poisoning (M2)
- Fixed mode naming inconsistency in documentation (M3)
- Added expiry validation to wire format parsing (M4)

Added constants:
- AVAILABILITY_MAX_TTL_SECS = 3600
- AVAILABILITY_MAX_PENDING_PER_SPACE = 1000

Remaining: 10 items need manual review (4 critical, 3 high, 3 medium)

Review: docs/reviews/seeding-availability_AREA_OWNER_REVIEW.md
```

## Next Steps

1. **Immediate Priority**: Address C1 (background task placeholder) - the feature is non-functional without it
2. **Security Priority**: Address C4 (signature verification) - prevents peer spoofing attacks
3. **User Access**: Address C2 (RPC endpoints) and H4 (CLI commands) - users cannot interact with the feature
4. Review the remaining items above
5. Run full test suite: `cargo test`
6. Manual testing of affected features
7. Create PR with these changes

## Summary Statistics

| Category | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 4 | 0 | 4 |
| High | 4 | 1 | 3 |
| Medium | 6 | 3 | 3 |
| Low | 4 | 0 | 4 |
| **Total** | **18** | **4** | **14** |

## Test Results

```
running 62 tests
test seeding::config::tests::* ... 12 passed
test seeding::manager::tests::* ... 11 passed
test seeding::availability::tests::* ... 18 passed (including 2 new tests)
test seeding::rate_limiter::tests::* ... 13 passed
test seeding::statistics::tests::* ... 8 passed

test result: ok. 62 passed; 0 failed; 0 ignored
```

---

*Action log generated by implementation pipeline*
*Review source score: 69/100*
*Pipeline completed: 2026-01-13*
