# H-BLOCK-2: No Mempool Size Limits

**Status**: IMPLEMENTED
**Date**: 2026-01-14
**Files Modified**: `src/blocks/builder.rs`

## Problem

Unbounded mempool enables memory exhaustion attacks. Without size limits, an attacker can flood the mempool with low-PoW actions, consuming arbitrary amounts of memory and potentially crashing the node.

## Implementation Summary

Added mempool size limits with lowest-PoW eviction policy:

1. **Added Constants**:
   - `MAX_MEMPOOL_ACTIONS = 10_000` - Global limit on total pending actions (~10MB at ~1KB/action)
   - `MAX_ACTIONS_PER_SPACE = 2_000` - Per-space limit (20% of total capacity) to prevent single-space monopolization

2. **Added Tracking Fields to BlockBuilder**:
   - `space_action_counts: HashMap<SpaceId, usize>` - Per-space action counts
   - `total_action_count: usize` - Global action count

3. **Implemented Eviction Methods**:
   - `evict_lowest_pow_from_space(&mut self, space_id: &SpaceId) -> Option<u64>` - Evicts action with lowest PoW from specified space
   - `evict_lowest_pow_global(&mut self) -> Option<u64>` - Evicts action with lowest PoW from entire mempool

4. **Integrated Limits into `add_action()`**:
   - Before adding, check if space is at `MAX_ACTIONS_PER_SPACE`
   - If at capacity, evict lowest-PoW action from that space
   - Only accept new action if its PoW > evicted action's PoW
   - Similarly check global `MAX_MEMPOOL_ACTIONS` limit
   - Updated count tracking on successful add

5. **Updated Related Methods**:
   - `add_create_space_action()` - Same capacity checks and count tracking
   - `clear()` - Reset all counts
   - `build_root_block()` - Clear counts when threads are drained
   - `clear_finalized_actions()` - Update counts when actions are removed

## Design Decisions

1. **Lowest-PoW Eviction**: When at capacity, evict the action with lowest PoW work. This ensures higher-quality (higher-effort) content is prioritized. Actions with higher PoW replace lower-PoW actions.

2. **Per-Space Limit at 20%**: Setting `MAX_ACTIONS_PER_SPACE = 2_000` (20% of 10,000) prevents a single popular or attacked space from monopolizing the mempool while allowing significant activity per space.

3. **Lazy Eviction**: Eviction only happens when limits are reached, not preemptively. This minimizes overhead during normal operation.

4. **Count Tracking Consistency**: All paths that add/remove actions update the counts to maintain accurate tracking.

## Tests Added

- `test_action_count_tracking` - Verifies counts are properly tracked on add
- `test_evict_lowest_pow_from_space` - Tests space-specific eviction
- `test_evict_lowest_pow_global` - Tests global eviction
- `test_counts_cleared_on_build_root_block` - Verifies counts cleared after block building
- `test_counts_updated_on_clear_finalized_actions` - Verifies counts updated on finalization
- `test_counts_cleared_on_clear` - Verifies counts cleared on explicit clear

## Validation

```
cargo check - PASS
cargo test --lib blocks::builder:: - 23 passed, 2 failed (pre-existing failures)
```

Note: The 2 failing tests (`test_should_form_root_at_threshold`, `test_should_form_root_above_threshold`) are pre-existing failures related to lazy block formation waiting logic, not this implementation.

## Security Impact

- **Before**: Unbounded memory growth possible via mempool flooding
- **After**: Memory capped at ~10MB for mempool actions, with fair eviction policy

## Memory Bounds

At the configured limits:
- Total mempool: 10,000 actions * ~1KB = ~10MB (bounded)
- Per-space: 2,000 actions * ~1KB = ~2MB max per space
- Tracking overhead: ~64 bytes per space in `space_action_counts` (negligible)

## Documentation

- OUTSTANDING_ACTIONS.md updated: H-BLOCK-2 marked as ✅ COMPLETED
- Phase 2 priority list updated
- Summary table HIGH count updated to (2 completed)
