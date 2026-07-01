# H-BLOCK-1: Unbounded seen_actions Memory Growth

**Status**: IMPLEMENTED
**Date**: 2026-01-14
**Effort**: M (actual: ~1 hour)

## Problem

The `seen_actions` HashSet in `BlockBuilder` grows without bound:
- Each action hash is 32 bytes
- At ~1,500 actions/day, this grows ~46MB/day
- No eviction mechanism existed
- Long-running nodes would eventually exhaust memory

## Solution

Changed `seen_actions` from `HashSet<[u8; 32]>` to `LruCache<[u8; 32], ()>` with a capacity of 100,000 entries.

## Files Modified

### Cargo.toml
- Added `lru = "0.12"` dependency

### src/blocks/builder.rs
- Added imports: `std::num::NonZeroUsize`, `lru::LruCache`
- Added constant: `SEEN_ACTIONS_CAPACITY = 100_000`
- Changed `seen_actions` field type from `HashSet<[u8; 32]>` to `LruCache<[u8; 32], ()>`
- Updated `new()` and `from_chain_state()` to initialize LruCache
- Changed `insert()` calls to `put(hash, ())`
- Changed `remove()` calls to `pop(hash)`
- Updated `remove_action()` return: `pop(action_hash).is_some()`
- Fixed test helper `make_test_action()` to use unique timestamps via atomic counter

## API Changes

- `contains()` - unchanged (works on both HashSet and LruCache)
- Internal: `insert()` → `put()`
- Internal: `remove()` → `pop()`

## Memory Impact

| Metric | Before | After |
|--------|--------|-------|
| Per-entry size | 32 bytes | 32 bytes |
| Max entries | Unbounded | 100,000 |
| Max memory | ~46MB/day growth | ~3.2MB fixed |

## Test Results

- 17 of 19 block builder tests pass
- 2 pre-existing test failures unrelated to this change:
  - `test_should_form_root_at_threshold` - fails because lazy waiting was added after tests were written
  - `test_should_form_root_above_threshold` - same issue

These failures existed before this implementation (verified by stashing changes and running tests).

## Verification

```bash
cargo check  # Success
cargo test --lib blocks::builder  # 17 passed, 2 pre-existing failures
```

## Notes

- The LRU cache evicts oldest entries when at capacity
- This is safe because:
  1. Actions older than the LRU capacity are likely already finalized in blocks
  2. The router checks `is_action_finalized()` before adding to mempool
  3. Finalized actions won't be re-added regardless of LRU eviction
- Fixed a pre-existing bug in tests where `make_test_action()` always created actions with the same hash
