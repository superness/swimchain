# M-DHT-2: O(n) Full Table Scans in PeerStore

**Issue ID**: M-DHT-2
**Priority**: Medium
**Effort**: M (3-5 hours)
**Status**: IMPLEMENTED
**Date**: 2026-01-14

## Problem

The `PeerStore` in `src/discovery/peer_store.rs` performed O(n) full table scans for eviction operations:

1. `evict_lowest_scores()` - Called `get_all()` then sorted all peers O(n log n)
2. `remove_banned()` - Scanned all peers to find those below ban threshold O(n)
3. `get_by_min_score()` - Loaded all peers then filtered O(n)

This became a performance bottleneck with large peer tables (1000+ peers).

## Solution

Added a secondary score index using a separate sled tree that maintains sorted order by score. The index uses composite keys of `(score, peer_key)` with offset encoding for correct lexicographic ordering of signed integers.

### Key Technical Details

**Score Index Key Encoding**:
- i16 scores are offset-encoded: `(score + 32768)` shifts range from [-32768, 32767] to [0, 65535]
- Stored as big-endian u16 to ensure lexicographic ordering matches numeric ordering
- Key format: `[2 bytes score][67 bytes peer_key]`

**Index Maintenance**:
- `put()` - Updates index when storing/updating entries
- `record_success()` / `record_failure()` - Updates index when score changes
- `update_score()` - Updates index when score modified directly
- `remove()` - Removes from index when peer deleted

**Optimized Operations**:
- `evict_lowest_scores(keep_count)` - Now O(k) where k = eviction count; iterates score index from lowest
- `remove_banned()` - Now O(k) where k = banned count; uses range query on score index

## Changes Made

### File: `src/discovery/peer_store.rs`

1. **Added score index tree** (lines 24-25, 32-35):
   ```rust
   const SCORE_INDEX_TREE: &str = "discovery_peers_score_idx";

   pub struct PeerStore {
       tree: sled::Tree,
       score_index: sled::Tree,  // New index tree
       db: Arc<sled::Db>,
   }
   ```

2. **Added index helper methods** (lines 67-124):
   - `make_score_index_key()` - Build composite key with offset encoding
   - `score_from_index_key()` - Extract score from index key
   - `peer_key_from_index_key()` - Extract peer key from index key
   - `add_to_score_index()` - Add entry to index
   - `remove_from_score_index()` - Remove entry from index
   - `update_score_index()` - Update entry when score changes

3. **Updated data modification methods**:
   - `put()` - Now maintains score index on insert/update
   - `record_success()` - Updates index when score increases
   - `record_failure()` - Updates index when score decreases
   - `update_score()` - Updates index when score modified
   - `remove()` - Removes from score index

4. **Refactored eviction methods**:
   - `evict_lowest_scores()` - Uses index iterator, O(k) instead of O(n log n)
   - `remove_banned()` - Uses range query, O(k) instead of O(n)
   - `remove_stale()` - Still O(n) as it needs age check (not indexed)

5. **Updated test helper**:
   - `clear()` - Now clears both trees
   - `verify_index_consistency()` - New test helper to verify index integrity

## Complexity Analysis

| Operation | Before | After |
|-----------|--------|-------|
| `put()` | O(1) | O(log n) - index lookup |
| `evict_lowest_scores(k)` | O(n log n) | O(k) |
| `remove_banned()` | O(n) | O(k) |
| `record_success/failure()` | O(1) | O(log n) |
| `remove()` | O(1) | O(log n) |

Trade-off: Slightly slower individual updates in exchange for dramatically faster eviction operations.

## Tests Added

12 new tests for score index functionality:

1. `test_score_index_key_encoding` - Verifies offset encoding maintains sort order
2. `test_score_index_consistency_after_put` - Index consistent after inserts
3. `test_score_index_consistency_after_update` - Index consistent after score changes
4. `test_score_index_consistency_after_remove` - Index consistent after deletions
5. `test_score_index_consistency_after_eviction` - Index consistent after eviction
6. `test_score_index_consistency_after_remove_banned` - Index consistent after ban removal
7. `test_score_index_with_score_update_method` - Tests update_score() index maintenance
8. `test_eviction_order_correctness` - Verifies lowest scores evicted first
9. `test_score_index_persistence` - Index persists across restarts
10. `test_put_update_existing_maintains_index` - Updating existing entry updates index

## Validation

```
cargo check - PASS (no errors)
cargo test --lib peer_store::tests - PASS (25/25 tests)
```

All 13 existing peer_store tests pass.
All 12 new M-DHT-2 tests pass.

## Notes

- `remove_stale()` still requires O(n) scan because it checks `never_connected()` and `age_secs()` which are not indexed. A separate index could be added if this becomes a bottleneck.
- The score index persists across node restarts via sled.
- Index consistency is verified in tests using `verify_index_consistency()`.
