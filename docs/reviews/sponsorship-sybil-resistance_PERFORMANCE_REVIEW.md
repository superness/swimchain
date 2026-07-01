# Performance Review: Sponsorship Sybil Resistance

## Summary

The Sponsorship & Sybil Resistance feature has **acceptable performance for typical usage patterns** but contains several algorithmic and resource usage patterns that could become problematic at scale. The main concerns are the BFS-based subtree analysis which loads entire subtrees into memory, non-transactional penalty application, and full-table scans for certain queries. With optimization, this system can scale to 100K+ identities.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | BFS O(n) traversals, some O(n²) patterns in subtree counting |
| Resource Usage | 19 | 25 | Memory allocation for entire subtrees; bincode serialization overhead |
| Scalability | 18 | 25 | Full table scans; no pagination; subtree growth unbounded |
| Optimization Opportunities | 23 | 25 | Many low-hanging optimizations available |
| **Total** | 78 | 100 | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `get_sponsorship(identity)` | O(1) | Sled key lookup - optimal |
| `get_path_to_genesis(identity)` | O(d) | d = tree depth, bounded by MAX_PATH_DEPTH (256) |
| `get_sponsees(sponsor)` | O(s) | s = number of sponsees; loads entire Vec |
| `calculate_subtree_metrics(identity)` | O(n) | n = subtree size; **unbounded memory** |
| `count_flagged_in_subtree(root)` | O(n) | n = subtree size; BFS traversal |
| `propagate_consequences(offender)` | O(d) | d = tree depth; walks to genesis |
| `get_all_pending()` flags | O(f) | f = total flags; **full table scan** |
| `get_offers_by_sponsor()` | O(o) | o = sponsor's offers; uses `scan_prefix` |
| `get_pending_claims(offer)` | O(c) | c = claims for offer; uses `scan_prefix` |
| `clean_expired_penalties()` | O(p×n) | p = penalized identities, n = avg penalties; **full scan** |
| `detect_inactive_sponsors()` | O(N) | N = all identities; **full table scan** |

## Bottlenecks Identified

### 1. **Subtree Analysis Memory Explosion**
**Location**: `storage.rs:509-551` - `calculate_subtree_metrics()`
**Impact**: A genesis identity with 100K+ descendants causes OOM when BFS loads all descendants into a `HashSet<[u8;32]>`.
**Mitigation**: Implement streaming analysis with early termination, or maintain cached subtree counts that update incrementally on sponsorship creation.

### 2. **Full Table Scans for Global Queries**
**Location**: Multiple locations
- `linear_chain.rs:125` - `get_all_pending()` iterates all flags
- `penalty_store.rs:247` - `clean_expired_penalties()` iterates all penalties
- `orphan.rs:322` - `detect_inactive_sponsors()` iterates all sponsorships
- `offer_store.rs:356` - `get_all_public_offers()` iterates all offers

**Impact**: At 100K identities with 10K flags, these operations become multi-second blocking calls.
**Mitigation**: Add secondary indexes (e.g., `pending_flags` tree) or use sled's `scan_prefix` with status-prefixed keys.

### 3. **Non-Atomic Penalty Application**
**Location**: `propagation.rs:70-134` and caller code
**Impact**: `propagate_consequences()` returns a `PropagationResult` with penalties that must be applied separately. If the process crashes mid-application, partial penalties persist.
**Mitigation**: Use sled's `transaction()` API to apply all penalties atomically.

### 4. **Sponsee List Unbounded Growth**
**Location**: `storage.rs:67-84` - `add_to_sponsee_list()`
**Impact**: Each sponsor's sponsees stored as `Vec<[u8;32]>` which must be fully deserialized, checked for duplicates (O(n) linear search), and re-serialized on each new sponsee.
**Mitigation**: Use a separate sled tree with composite keys `(sponsor || sponsee)` for O(1) existence check.

### 5. **BFS Visited Set Memory**
**Location**: `storage.rs:518`, `linear_chain.rs:227,270`
**Impact**: BFS uses `HashSet<[u8;32]>` which allocates 32 bytes per identity plus HashSet overhead (~48 bytes per entry with load factor). For 100K identities: ~8MB.
**Mitigation**: Use bloom filter for visited check when exact count not needed, or streaming iterators with bounded memory.

## Scalability Concerns

### Horizontal Scaling
- **Single-node bottleneck**: All sponsorship data is local to each node. No sharding support.
- **Replication**: No built-in replication; relies on sync layer for eventual consistency.
- **Read scaling**: Sled supports concurrent reads, so read-heavy workloads scale within a node.

### Vertical Scaling Limits
| Metric | Estimate | Concern Level |
|--------|----------|---------------|
| 10K identities | ~5MB memory for full BFS | Low |
| 100K identities | ~50MB memory for full BFS | Medium |
| 1M identities | ~500MB+ memory for full BFS | **Critical** |

### Network Effects
- **Linear chain detection** runs on sponsorship creation - acceptable O(d) per creation
- **Consequence propagation** walks to genesis - acceptable O(d) per misbehavior event
- **Orphan detection** requires full scan - problematic if run frequently

## Optimization Recommendations

### High Impact

1. **Streaming Subtree Analysis with Limits**
   - Modify `calculate_subtree_metrics()` to accept `max_nodes: usize` parameter
   - Return partial metrics with `exceeded_limit: bool` flag
   - Expected improvement: Prevents OOM, caps memory at ~3MB for 100K limit
   ```rust
   pub fn calculate_subtree_metrics_limited(
       &self,
       root: &PublicKey,
       max_nodes: usize,
   ) -> Result<(SubtreeMetrics, bool), SponsorshipError>
   ```

2. **Secondary Index for Pending Flags**
   - Add `pending_flags` tree: `timestamp(8BE) || identity(32) -> ()`
   - On flag creation, insert; on clear/confirm, remove
   - Expected improvement: O(1) pending count, O(k) pending retrieval where k << total flags

3. **Atomic Penalty Transactions**
   - Wrap penalty application in sled transaction
   - Expected improvement: Consistency guarantee, crash safety
   ```rust
   self.db.transaction(|tx| {
       for penalty in &result.sponsor_penalties {
           apply_penalty_tx(&tx, penalty)?;
       }
       Ok(())
   })?;
   ```

### Medium Impact

4. **Sponsee Index as Separate Tree**
   - Replace `by_sponsor: Vec<[u8;32]>` with `sponsee_index: (sponsor(32) || sponsee(32)) -> depth(1)`
   - O(1) existence check, O(s) iteration via `scan_prefix`
   - Expected improvement: No more O(n) duplicate checks, reduced serialization

5. **Incremental Subtree Counts**
   - Maintain `subtree_count: u32` on each `StoredSponsorship`
   - Update on sponsorship creation: increment all ancestors' counts
   - Expected improvement: O(d) update on create, O(1) query

6. **Background Cleanup Jobs**
   - Run `clean_expired_penalties()` as background task with rate limiting
   - Process in batches of 1000 identities
   - Expected improvement: No blocking on hot path

### Low Impact (Quick Wins)

7. **Preallocate Vec Capacity**
   - `signature_message()` already does this (`Vec::with_capacity(40)`) - good
   - Ensure all Vec builders use capacity hints
   - Expected improvement: ~5-10% reduction in allocations

8. **Use `scan_prefix` Range Bounds**
   - For `get_offers_by_sponsor()`, add `expires_at` to key for natural expiry ordering
   - Expected improvement: Avoid deserializing expired offers

9. **Lazy Deserialization for Status Checks**
   - For `is_identity_active()`, deserialize only `status` field (first byte after header)
   - Expected improvement: ~80% reduction in deserialization time for hot path

10. **Cache Hot Sponsorships**
    - LRU cache for frequently accessed genesis identities
    - Expected improvement: Avoid disk reads for ~99% of validations

## Resource Estimates

### Memory (per node)

| Scenario | Baseline | After Optimization |
|----------|----------|-------------------|
| 10K identities, idle | ~20MB | ~15MB |
| 10K identities, active subtree query | ~25MB peak | ~18MB peak (limited) |
| 100K identities, idle | ~200MB | ~150MB |
| 100K identities, active subtree query | ~250MB+ peak | ~155MB peak (limited) |

### Storage (sled on disk)

| Component | Per Identity | 100K Identities |
|-----------|-------------|-----------------|
| `StoredSponsorship` | ~150 bytes | ~15MB |
| `by_sponsor` index | ~40 bytes avg | ~4MB |
| `genesis_slots` | ~34 bytes × 100 | ~3.4KB |
| `penalties` | ~200 bytes per penalized | ~2MB (est. 10K penalized) |
| `linear_chain_flags` | ~100 bytes per flag | ~1MB (est. 10K flags) |
| **Total** | - | **~25MB** |

### Network

| Operation | Messages | Bytes |
|-----------|----------|-------|
| Sponsorship registration | 1 | ~300 bytes (wire format) |
| Offer creation | 1 | ~200 bytes |
| Claim submission | 1 | ~250 bytes |
| Consequence propagation | 0 (local) | N/A (sync layer handles) |

### CPU

| Operation | Est. Time (10K identities) | Est. Time (100K identities) |
|-----------|---------------------------|----------------------------|
| Single sponsorship lookup | <1ms | <1ms |
| Subtree metrics (depth 5 tree) | ~5ms | ~50ms |
| Consequence propagation | <1ms | <1ms |
| Full orphan scan | ~100ms | ~1s |
| Full flag scan | ~50ms | ~500ms |

## Benchmark Recommendations

Add benchmarks for:
1. `calculate_subtree_metrics()` with varying tree sizes (100, 1K, 10K, 100K)
2. `propagate_consequences()` with varying chain depths (5, 10, 20, 50)
3. `clean_expired_penalties()` with varying penalty counts
4. Concurrent sponsorship registrations (10, 100, 1000 parallel)

## Conclusion

The current implementation is suitable for networks up to ~50K identities without optimization. For larger networks, the streaming subtree analysis and secondary indexes are critical improvements. The penalty atomicity issue should be addressed regardless of scale for correctness reasons.

**Priority Fixes:**
1. P0: Streaming subtree analysis (prevents OOM)
2. P0: Atomic penalty application (correctness)
3. P1: Secondary index for pending flags (performance)
4. P2: Background cleanup jobs (responsiveness)
