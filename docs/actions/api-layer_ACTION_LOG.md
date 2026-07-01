# Action Log: API Layer Review Implementation

**Date**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/api-layer_AREA_OWNER_REVIEW.md
**Overall Score**: 77/100
**Status**: Needs Attention

## Summary

Parsed the API Layer area owner review and implemented fixes for actionable items. Some critical issues required significant architectural changes and were deferred.

## Actions Taken

### CRITICAL Issues

#### C1: Anti-Abuse Module Completely Disabled
- **Status**: SKIPPED - Requires significant refactoring
- **Reason**: The `anti_abuse.rs` module depends on `SwimmerLevel` from the `level` module, which was removed in recent commit "Remove level system - PoW-only gating". Re-enabling this module requires:
  1. Removing all SwimmerLevel dependencies from anti_abuse.rs
  2. Refactoring rate limiting to use PoW-only gating
  3. Updating API contracts for the new approach
- **Risk**: High - Incorrect refactoring could break rate limiting logic
- **Recommendation**: Create a dedicated task/ticket to refactor anti-abuse for PoW-only gating

#### C2: PoW Cancellation Non-Functional
- **Status**: FIXED
- **Changes Made**:
  - Updated `src/api/commands.rs` to use `compute_pow_cancellable` instead of `compute_pow_with_callback`
  - Added `AtomicBool` flag to track cancellation requests from callback
  - When callback returns `false`, the atomic flag is set and PoW stops at next iteration
  - Returns `ApiError::PowCancelled` on cancellation
- **Files Modified**:
  - `src/api/commands.rs` (lines 10-11, 16-17, 210-250)
- **Testing**: Compiles successfully, logic follows existing pattern in CLI commands

#### C3: Sync Status Returns Placeholder Data
- **Status**: DEFERRED - Architecture decision required
- **Reason**: Wiring sync status requires:
  1. Adding sync manager/progress tracker injection to `QueryHandler`
  2. Extending `ApiClientBuilder` with sync manager support
  3. Making `get_sync_status()` async or using thread-safe status storage
- **Risk**: Medium - API signature changes affect all consumers
- **Recommendation**: Design sync state interface before implementation. Consider adding `sync_status: Option<Arc<RwLock<SyncState>>>` to QueryHandler.

### HIGH Priority Issues

#### H1: Query Timeout Not Enforced
- **Status**: DEFERRED - Async migration required
- **Reason**: Query timeout enforcement requires:
  1. Making `get_content()` async
  2. Using `tokio::time::timeout` wrapper
  3. All callers must become async
- **Risk**: High - Breaking API change
- **Recommendation**: Schedule async API migration as separate task. Consider async-first design for v2.0.

#### H2: RwLock Unwrap Panics in Anti-Abuse Module
- **Status**: SKIPPED - Module disabled
- **Reason**: The anti_abuse module is disabled (commented out in mod.rs). Fixing RwLock unwraps would have no immediate effect.
- **Recommendation**: Fix as part of C1 refactoring when re-enabling the module

### MEDIUM Priority Issues

#### M1: NotificationApiEvent Not Re-exported
- **Status**: FIXED
- **Changes Made**:
  - Added `NotificationApiEvent` to public exports in `src/api/mod.rs`
- **Files Modified**:
  - `src/api/mod.rs` (line 91)

#### M4: No PoW Time Estimates in Progress Events
- **Status**: SKIPPED - Low impact
- **Reason**: Requires profiling to determine average nonces/second for different hardware. The estimate calculation would be `(remaining_nonces / nonces_per_second)` but `remaining_nonces` is probabilistic.
- **Recommendation**: Implement as enhancement when PoW metrics are available

#### M5: Error Messages Use Technical Jargon
- **Status**: FIXED
- **Changes Made**:
  - Updated `Display` implementation in `src/api/error.rs` with user-friendly messages
  - `NoIdentity`: Now explains to set up identity in Settings
  - `ContentNotFound`: Explains content may have decayed or been removed
  - `SpaceNotFound`: Explains space may not exist or access may be denied
  - `PowFailed`: Adds "Please try again" guidance
  - `Storage`: Adds "check disk space and permissions" guidance
  - `Internal`: Adds "try again or report this issue" guidance
- **Files Modified**:
  - `src/api/error.rs` (lines 36-61, 69-79)
- **Tests Updated**: Changed assertions to use `contains()` instead of exact match

## Files Modified

1. **src/api/mod.rs**
   - Added `NotificationApiEvent` to public exports (M1)

2. **src/api/commands.rs**
   - Changed import from `compute_pow_with_callback` to `compute_pow_cancellable` (C2)
   - Added `std::sync::atomic::{AtomicBool, Ordering}` and `Arc` imports (C2)
   - Rewrote `compute_pow_with_optional_callback()` to use atomic cancellation flag (C2)

3. **src/api/error.rs**
   - Updated `Display` impl with user-friendly error messages (M5)
   - Updated tests to use `contains()` assertions (M5)

## Validation

- `cargo check --lib`: PASSED (with unrelated warnings)
- `cargo test --lib api::error::tests`: PASSED (2 tests)
- API module compiles without errors

## Deferred Items Summary

| Issue | Reason | Recommended Action |
|-------|--------|-------------------|
| C1: Anti-Abuse Disabled | SwimmerLevel removed | Refactor for PoW-only gating |
| C3: Sync Status Placeholder | Architecture decision | Design sync state interface |
| H1: Query Timeout | Async migration required | Schedule async API v2.0 |
| H2: RwLock Unwraps | Module disabled | Fix with C1 |
| M4: PoW Time Estimates | Needs profiling | Implement with metrics |

## Risk Assessment

**Low Risk Changes** (Implemented):
- M1: Export re-export is additive, no breaking change
- M5: Error messages are display-only, no behavior change
- C2: Uses existing `compute_pow_cancellable`, follows CLI pattern

**Skipped Due to Risk**:
- C1, H2: Would require significant refactoring of disabled code
- C3, H1: Would require API signature changes

## Next Steps

1. Create task to refactor anti-abuse module for PoW-only gating (C1)
2. Design sync state interface for QueryHandler (C3)
3. Evaluate async API migration for v2.0 (H1)
4. Add PoW metrics collection for time estimates (M4)
