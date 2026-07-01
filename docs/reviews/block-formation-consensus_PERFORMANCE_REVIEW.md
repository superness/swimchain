# Performance Review: Block Formation & Consensus

## Summary

The Block Formation & Consensus feature demonstrates solid algorithmic design with O(n log n) complexity for most critical operations. The hierarchical block structure (Root → Space → Content) enables efficient PoW aggregation and parallel validation potential. However, several bottlenecks emerge at scale: the mempool's linear search patterns, unbounded memory growth in seen_actions, and branch fracturing's O(n) thread reassignment. The fixed 432-byte action serialization provides predictable memory allocation, which is a performance win.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 19 | 25 | O(n log n) merkle, O(n) mempool search bottlenecks |
| Resource Usage | 18 | 25 | Fixed-size serialization good, unbounded seen_actions concerning |
| Scalability | 17 | 25 | Branch fracturing helps, but lacks mempool limits |
| Optimization Opportunities | 20 | 25 | Clear caching and parallelization opportunities |
| **Total** | **74** | **100** | Functional but needs optimization for scale |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `compute_merkle_root()` | O(n log n) | Pairwise hashing with SHA-256; allocates O(n) vectors per level |
| `verify_merkle_proof()` | O(log n) | Efficient proof verification path |
| `BlockBuilder::add_action()` | O(1) amortized | HashMap insert; HashSet for dedup |
| `BlockBuilder::build_root_block()` | O(n log n) | Dominated by sorting operations |
| `BlockBuilder::clear_finalized_actions()` | O(n × m) | n=finalized, m=pending; HashSet lookup + Vec retain |
| `BlockBuilder::find_pending_content()` | O(n × m) | n=threads, m=actions; linear scan |
| `BlockBuilder::get_pending_action_by_hash()` | O(n × m) | Linear scan through all actions |
| `BranchManager::execute_fracture()` | O(n) | Must update index for all threads in branch |
| `validate_action()` | O(1) | Field validation only |
| `validate_action_signature()` | O(1) | Single Ed25519 verify (~100µs) |
| `BlockEligibility::is_eligible()` | O(1) | XOR distance + threshold comparison |
| `BlockEligibility::when_eligible()` | O(log max_time) | Binary search for eligibility time |
| `Action::serialize()` | O(1) | Fixed 432-byte copy |
| `Action::hash()` | O(1) | SHA-256 of fixed-size buffer |

## Bottlenecks Identified

### 1. **Unbounded `seen_actions` Memory Growth**
   **Location**: `src/blocks/builder.rs:97`
   **Impact**: Memory grows linearly with processed actions; never pruned during operation
   **Scale**: At 1000 actions/minute, ~32KB/minute growth (31.25MB/day)
   **Mitigation**: Add LRU eviction or periodic pruning based on block finalization. Consider bloom filter for historical action dedup.

### 2. **Linear Mempool Searches**
   **Location**: `src/blocks/builder.rs:650-661, 760-769`
   **Impact**: `find_pending_content()` and `get_pending_action_by_hash()` are O(n × m)
   **Scale**: Becomes problematic at >1000 pending actions
   **Mitigation**: Add secondary index `HashMap<[u8;32], (ThreadId, usize)>` for content_hash lookups; already exists for action hashes (`action_locations`)

### 3. **Branch Fracture Thread Reassignment**
   **Location**: `src/branch/manager.rs:300-322`
   **Impact**: O(n) database operations per fracture where n = threads in branch
   **Scale**: At 50MB with avg 10KB/thread = 5000 threads to reassign
   **Mitigation**: Batch database writes; consider lazy reassignment with forwarding pointers

### 4. **Merkle Tree Allocation Pattern**
   **Location**: `src/blocks/merkle.rs:32-48`
   **Impact**: Allocates new Vec each iteration level; log n allocations
   **Scale**: For 1000 leaves: ~10 allocations totaling ~500 entries
   **Mitigation**: Use `Vec::with_capacity()` or arena allocator; consider in-place merkle for power-of-2 inputs

### 5. **Action Sorting During Block Build**
   **Location**: `src/blocks/builder.rs:486-490`
   **Impact**: Sorts by computed hash, requiring hash computation for comparisons
   **Scale**: O(n log n) hash computations during sort
   **Mitigation**: Cache action hashes at insertion time; currently recomputes on every compare

### 6. **Replace-In-Mempool (RIM) Marker Actions**
   **Location**: `src/blocks/builder.rs:280-287`
   **Impact**: Replaced actions not removed, just marked with `pow_work = 0`; still iterated
   **Scale**: High edit frequency increases dead action overhead
   **Mitigation**: Consider Vec remove with index tracking, or tombstone compaction pass

## Scalability Concerns

### Vertical Scaling

- **Memory**: Unbounded seen_actions and no mempool size limits mean memory usage is unpredictable
- **CPU**: Ed25519 signature verification (~100µs/action) could bottleneck at high throughput
- **I/O**: Branch fracturing triggers multiple database writes in a single operation

### Horizontal Scaling

- **Positive**: Branch fracturing enables selective sync - nodes only need branches they care about
- **Positive**: Three-level hierarchy allows parallel validation of content blocks
- **Concern**: No parallel block validation implemented yet (noted in Future Work)
- **Concern**: Single-node mempool design; no mempool sharding for multi-core

### Load Projections

| Metric | Current Design | Bottleneck Point |
|--------|----------------|------------------|
| Pending actions | Unbounded | Memory exhaustion at ~10M actions |
| Actions/block | Limited by difficulty target | ~30 seconds worth of PoW |
| Threads/branch | Limited by 50MB threshold | ~5000 threads per fracture |
| Branch depth | Max 255 | 2^255 addressable branches (not a real limit) |
| Block formation | 30s lazy wait | Fixed latency, not throughput-limited |

## Optimization Recommendations

### High Impact

1. **Add mempool size limits with eviction policy**
   - Expected improvement: Bounded memory, predictable performance
   - Implementation: Add `MAX_PENDING_ACTIONS` constant; evict lowest PoW actions
   - Location: `BlockBuilder::add_action()`

2. **Parallelize content block validation**
   - Expected improvement: N× speedup where N = CPU cores
   - Implementation: Use `rayon::par_iter()` for action validation in `validate_content_block()`
   - Location: `src/blocks/validation.rs:386-388`

3. **Cache action hashes at mempool insertion**
   - Expected improvement: Eliminate O(n log n) hash recomputations during build
   - Implementation: Store `(Action, [u8;32])` tuples; hash once at insertion
   - Location: `PendingThread::actions` field

### Medium Impact

4. **Add content_hash secondary index to BlockBuilder**
   - Expected improvement: O(1) content lookups vs O(n × m)
   - Implementation: `HashMap<[u8;32], (ThreadId, usize)>` for content hashes
   - Location: `BlockBuilder` struct

5. **Batch database writes during fracture**
   - Expected improvement: Reduce I/O syscalls by factor of ~threads_count
   - Implementation: Use RocksDB WriteBatch for thread reassignment
   - Location: `BranchManager::execute_fracture()`

6. **LRU eviction for seen_actions**
   - Expected improvement: Bounded memory for action dedup
   - Implementation: Use `lru` crate with size limit; 10000 entries ~ 320KB
   - Location: `BlockBuilder::seen_actions`

### Low Impact (Quick Wins)

7. **Pre-allocate merkle level vectors**
   - Expected improvement: ~20% reduction in allocations during merkle computation
   - Implementation: `Vec::with_capacity((level.len() + 1) / 2)`
   - Location: `src/blocks/merkle.rs:35` (already has this)

8. **Compact RIM tombstones periodically**
   - Expected improvement: Reduce dead action iteration overhead
   - Implementation: Filter out `pow_work == 0` actions on threshold
   - Location: `BlockBuilder::build_root_block()`

9. **Use `HashSet::contains()` before `HashMap::get()`**
   - Expected improvement: Small constant factor improvement
   - Implementation: Already using HashSet for seen_actions (good)

10. **Profile Ed25519 batch verification**
    - Expected improvement: Up to 2× faster signature verification
    - Implementation: Use `ed25519-dalek` batch verify when validating multiple actions
    - Location: `validate_action_signature()`

## Resource Estimates

### Memory

| Component | Typical Usage | Peak Usage |
|-----------|---------------|------------|
| BlockBuilder (empty) | ~200 bytes | ~200 bytes |
| Per pending action | ~500 bytes | ~500 bytes |
| seen_actions (10K actions) | ~320 KB | Unbounded |
| action_locations (10K) | ~480 KB | Unbounded |
| Branch metadata (per space) | ~100 bytes | ~100 bytes |
| Content block (100 actions) | ~45 KB | Varies |
| Space block (10 content) | ~400 bytes | Varies |
| Root block | ~400 bytes | Varies |

**Typical Node Memory**: ~10-50 MB for mempool with 1000-10000 pending actions

### Storage

| Component | Size |
|-----------|------|
| Action (serialized) | 432 bytes (fixed) |
| Content block header | ~200 bytes |
| Space block | ~400 bytes |
| Root block | ~400 bytes |
| Branch metadata | ~50 bytes |
| Thread index entry | ~80 bytes |

**Estimate**: ~500 bytes per action on-chain including overhead

### Network

| Operation | Bandwidth |
|-----------|-----------|
| Action gossip | 432 bytes + framing |
| Block announcement | ~1 KB header |
| Full block sync | ~500 bytes × actions |
| Mempool INV | 32 bytes × action count |

**Typical block size**: 15-45 KB (30-100 actions at ~450 bytes each)

## Performance Test Recommendations

1. **Mempool stress test**: Add 100K actions, measure memory and `build_root_block()` latency
2. **Fracture performance**: Trigger fracture with 10K threads, measure I/O time
3. **Merkle benchmark**: Compute merkle root for 10K leaves, profile allocations
4. **Signature verification throughput**: Batch verify 1000 signatures, measure CPU time
5. **Concurrent validation**: Parallel validate 100 content blocks, measure speedup

---

*Review generated for Block Formation & Consensus feature*
*Reviewer perspective: Performance*
