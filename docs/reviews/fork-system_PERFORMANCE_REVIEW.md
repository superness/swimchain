# Performance Review: Fork System

## Summary

The Fork System has solid foundational performance characteristics with O(1) operations for most common tasks (fork switching, single fork lookup). The architecture uses appropriate caching (RwLock for active fork) and efficient data structures (HashSet for exclusions in ForkConfig). However, there are notable concerns around the N+1 query pattern in `list_forks` RPC, linear time storage operations for the known forks list, and the lack of caching for frequently accessed fork genesis data. The exclusion check in ForkGenesis uses Vec (linear search) instead of HashSet. Content migration (when implemented) could become a significant bottleneck at scale.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 20 | 25 | O(1) core ops, but N+1 list_forks and linear exclusion check |
| Resource Usage | 21 | 25 | Reasonable allocations, some unnecessary clones, no genesis cache |
| Scalability | 19 | 25 | Known forks list scales poorly, no batch operations |
| Optimization Opportunities | 22 | 25 | Clear low-hanging fruit available |
| **Total** | **82** | **100** | |

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `calculate_fork_id()` | O(n) | n = genesis serialization size, SHA-256 hashing |
| `ForkConfig::builder().build()` | O(1) | Simple struct construction |
| `ForkGenesis::is_excluded()` | O(e) | Uses `Vec::contains()` - linear search, e=excluded count |
| `ForkRegistry::active_fork()` | O(1) | Cached in RwLock, single read |
| `ForkRegistry::create_fork()` | O(e + k) | e=excluded_ids, k=known forks (duplicate check) |
| `ForkRegistry::switch_fork()` | O(1) | Contains check + sled write |
| `ForkRegistry::get_fork()` | O(1) | Single sled lookup + deserialization |
| `ForkRegistry::list_forks()` | O(n) | n = number of known forks |
| `ForkRegistry::get_fork_info()` | O(1) | Single sled lookup |
| `ForkRegistry::is_excluded()` | O(e + d) | Disk read + linear search through Vec (no caching) |
| `ForkStore::add_known_fork()` | O(n) | Reads entire known list, scans for duplicates |
| `ForkStore::delete_fork()` | O(n) | Rebuilds entire known list |
| `ForkStore::list_known_forks()` | O(n) | Reads and parses known list |
| `ForkGenesis::to_bytes()` | O(e + s) | e=excluded_ids, s=supporters |
| `ForkGenesis::from_bytes()` | O(e + s) | Same as to_bytes |
| RPC `list_forks` | O(n * d) | n=forks, d=disk reads (N+1 query pattern) |

## Bottlenecks Identified

### 1. N+1 Query Pattern in `list_forks` RPC

**Bottleneck**: The `list_forks` RPC calls `get_fork_info()` for each fork in the list, resulting in n+1 database reads for n forks.

**Location**: `src/rpc/methods.rs:6155-6168`

```rust
let fork_list: Vec<_> = forks
    .iter()
    .map(|f| {
        let info = fork_registry.get_fork_info(f).ok(); // DB read per fork!
        json!({
            "fork_id": hex::encode(f.as_bytes()),
            "name": info.as_ref().map(|i| i.name.clone()).unwrap_or_default(),
            "is_active": *f == active,
        })
    })
    .collect();
```

**Impact**: With 100 forks, this performs 101 database reads (1 for list + 100 for info). At 1000 forks, ~1000ms latency.

**Mitigation**:
- Add pagination (`offset`, `limit` parameters)
- Batch load fork info during `list_forks()`
- Cache fork info in memory with TTL
- Add `list_forks_with_info()` that returns `Vec<ForkInfo>` directly

### 2. Known Forks List Storage Pattern

**Bottleneck**: Known forks are stored as a contiguous byte array, requiring read-modify-write for any addition or deletion.

**Location**: `src/fork/storage.rs:101-118` (add_known_fork), `src/fork/storage.rs:158-167` (delete_fork)

```rust
// add_known_fork: O(n) - reads entire list, scans, appends
let mut known = self.known_tree.get("known")?.unwrap_or_default().to_vec();
for i in 0..existing_count {
    let start = i * 32;
    if &known[start..start + 32] == fork_id.as_bytes() {
        return Ok(()); // Already known
    }
}
known.extend_from_slice(fork_id.as_bytes());
```

**Impact**: With 1000 forks, each new fork creation reads 32KB, scans linearly, and writes 32KB+32 bytes.

**Mitigation**:
- Use separate sled keys per fork ID for O(1) existence checks
- Store fork IDs as individual sled entries with a common prefix
- Consider a B-tree or sorted structure for efficient operations

### 3. Linear Exclusion Check in ForkGenesis

**Bottleneck**: `ForkGenesis::is_excluded()` performs linear search in a `Vec<[u8; 32]>`, despite `ForkConfig` using `HashSet`.

**Location**: `src/fork/genesis.rs:156,213-215`

```rust
pub excluded_ids: Vec<[u8; 32]>,  // Stored as Vec for serialization
// ...
pub fn is_excluded(&self, id: &[u8; 32]) -> bool {
    self.excluded_ids.contains(id)  // O(n) linear search!
}
```

**Impact**: If a fork excludes 1000 identities, every `is_excluded()` check requires 1000 comparisons. If this is called on every action, it becomes a critical bottleneck.

**Mitigation**:
- Deserialize into `HashSet` when loading genesis
- Cache the `HashSet` alongside Vec for serialization
- Or convert Vec to HashSet lazily on first `is_excluded()` call

### 4. No Genesis Cache for `is_excluded()` Checks

**Bottleneck**: `ForkRegistry::is_excluded()` loads the full genesis from disk on every call.

**Location**: `src/fork/registry.rs:277-289`

```rust
pub fn is_excluded(&self, identity: &[u8; 32]) -> Result<bool, ForkError> {
    let active = self.active_fork();
    // ...
    if let Some(genesis) = self.store.get_genesis(&active)? {  // Disk read!
        Ok(genesis.is_excluded(identity))
    }
    // ...
}
```

**Impact**: If used in content validation hot path, could be called millions of times, each requiring disk I/O + deserialization.

**Mitigation**:
- Cache active fork's genesis in memory
- Use LRU cache for recently accessed forks
- Invalidate cache on `switch_fork()` or `add_fork_support()`

### 5. Genesis Serialization on Every Support Addition

**Bottleneck**: Adding fork support calls `genesis.to_bytes()` for signing, then `store.store_genesis()` which calls `to_bytes()` again.

**Location**: `src/fork/registry.rs:302-309`

```rust
let bytes = genesis.to_bytes();  // First serialization
let signature = identity.sign(&bytes);
genesis.add_supporter(identity.public_key(), signature);
self.store.store_genesis(fork_id, &genesis)?;  // Calls to_bytes() again
```

**Impact**: Double serialization for each supporter added. With large genesis blocks (many exclusions/supporters), this adds unnecessary CPU work.

**Mitigation**: Store genesis bytes alongside the structured data, or pass bytes to store_genesis.

## Scalability Concerns

### Vertical Scaling
- **Memory**: Low concern. `ForkRegistry` only caches active fork ID (32 bytes). Genesis blocks are loaded on-demand.
- **CPU**: Fork creation involves SHA-256 hashing and Ed25519 signing - both are fast (microseconds).
- **Disk I/O**: Sled provides efficient B-tree storage with crash recovery.

### Horizontal Scaling
- **Current State**: Fork registry is local to each node. No cross-node coordination.
- **Concern**: If content migration is implemented, large forks could require massive data transfer between nodes.
- **Network Propagation**: Not implemented. Fork discovery will need efficient gossip protocol.

### Data Growth Patterns
- **Expected Load**: Tens to low hundreds of forks per network
- **Worst Case**: Thousands of forks in a very fragmented ecosystem
- **Storage per Fork**: ~500-5000 bytes per genesis (depends on exclusions, supporters)

| Fork Count | Known List Size | List Operation | Concern Level |
|------------|-----------------|----------------|---------------|
| 10 | 320 bytes | < 1ms | None |
| 100 | 3.2 KB | ~5ms | Low |
| 1,000 | 32 KB | ~50ms | Medium |
| 10,000 | 320 KB | ~500ms | High |

### Cross-Fork Sync (Future)
- Currently switching forks requires full re-sync
- No mechanism for parallel fork tracking
- Potential performance cliff when users frequently switch forks

## Optimization Recommendations

### High Impact

1. **Add Genesis LRU Cache** (Est. 10-50x speedup for `is_excluded()`)
   ```rust
   struct ForkRegistry {
       store: Arc<ForkStore>,
       genesis_cache: RwLock<LruCache<ForkId, ForkGenesis>>,
       // ...
   }
   ```
   - Cache capacity: 16-64 forks
   - Invalidate on `add_fork_support()`, `delete_fork()`
   - Critical if `is_excluded()` is in hot path

2. **Fix N+1 Query in list_forks** (Est. 10-100x speedup)
   - Option A: Return only IDs from `list_forks()`, lazy load info
   - Option B: Add `list_forks_with_info()` that does single pass
   - Option C: Cache fork summaries (id, name) in memory

3. **Convert Exclusion List to HashSet on Load** (O(n) -> O(1) lookups)
   ```rust
   struct LoadedGenesis {
       genesis: ForkGenesis,
       excluded_set: HashSet<[u8; 32]>,
   }
   ```
   - Expected improvement: Up to 1000x for large exclusion lists

### Medium Impact

1. **Refactor Known Forks Storage**
   - Use `genesis_tree.iter().keys()` instead of maintaining separate blob
   - Or store each fork ID as separate sled key: `known:fork_id -> ()`
   - O(1) existence check instead of O(n) scan
   - Expected improvement: 10-100x for fork creation with many existing forks

2. **Avoid Double Serialization in add_fork_support**
   - Pass serialized bytes to `store_genesis` to avoid re-serialization
   - Location: `src/fork/registry.rs:302-309`
   - Expected improvement: 50% reduction in add_support CPU usage

3. **Pre-allocate Serialization Buffers**
   ```rust
   fn to_bytes(&self) -> Vec<u8> {
       let estimated_size = 200 + self.name.len() + self.description.len()
           + (self.excluded_ids.len() * 32) + (self.supporter_sigs.len() * 96);
       let mut bytes = Vec::with_capacity(estimated_size);
       // ...
   }
   ```
   - Location: `src/fork/genesis.rs:224`
   - Expected improvement: Minor (fewer allocations)

4. **Batch Supporter Signatures**
   - Store supporters separately: `fork_supporters/{fork_id}` -> `Vec<(pubkey, sig)>`
   - Append-only writes instead of full genesis rewrite

### Low Impact (Quick Wins)

1. **Avoid String Clones in get_fork_info**
   - Return `Arc<ForkInfo>` or use `Cow<str>` for names
   - Location: `src/rpc/methods.rs:6164` - clones name on every call

2. **Use `parking_lot::RwLock` Instead of `std::sync::RwLock`**
   - `parking_lot` is faster and doesn't poison on panic
   - Location: `src/fork/registry.rs:95`
   - Expected improvement: Slightly faster lock acquisition

3. **Add Fork Count Cache**
   ```rust
   struct ForkStore {
       fork_count: AtomicUsize,  // Increment on add, decrement on delete
   }
   ```
   - Avoids calling `list_known_forks().len()` which is O(n)

4. **Add Fork ID Index by Name**
   - Optional: `name -> fork_id` lookup for CLI convenience
   - Currently must scan all forks to find by name
   - Expected improvement: O(1) name lookup vs O(n)

## Resource Estimates

### Memory

| Component | Typical Usage | Maximum |
|-----------|---------------|---------|
| ForkRegistry struct | ~200 bytes | ~200 bytes |
| Active fork cache (RwLock) | 32 bytes | 32 bytes |
| Single ForkGenesis | 1-10 KB | 50+ KB (large exclusion list) |
| Genesis cache (16 entries, recommended) | 16-160 KB | 800+ KB |
| Known forks blob | 320 B - 3.2 KB | 320 KB (10K forks) |
| Fork name cache (recommended) | 100 bytes/fork | 1 MB for 10K forks |

**Memory per ForkGenesis breakdown**:
```
Fixed fields: ~200 bytes
Name (avg 20 chars): 20 bytes
Description (avg 100 chars): 100 bytes
Per exclusion: 32 bytes
Per supporter: 96 bytes (32 pubkey + 64 sig)

Example: Fork with 100 exclusions, 50 supporters:
  200 + 20 + 100 + (100 * 32) + (50 * 96) = ~8KB
```

**Total (typical node with 100 forks)**: ~200 bytes resident + ~500 KB on-demand

### Storage (Disk/sled)

| Tree | Per-Fork | 100 Forks | 1000 Forks |
|------|----------|-----------|------------|
| fork_genesis | 1-10 KB | 100 KB - 1 MB | 1-10 MB |
| fork_known | 32 B | 3.2 KB | 32 KB |
| fork_active | 32 B | 32 B | 32 B |

**Note**: sled compression may reduce actual disk usage by 30-50%

**Total for 100 forks**: ~100-500 KB sled database

### Network (Future - When Propagation Implemented)

| Message Type | Size | Frequency |
|--------------|------|-----------|
| ForkAnnounce (0x53) | ~2-5 KB | Per fork creation |
| ForkQuery (0x54) | ~36 bytes | On demand |
| ForkInfo (0x55) | ~2-5 KB | Response to query |

**Expected network impact**: Minimal. Fork events are infrequent (not continuous like blocks).

### CPU

| Operation | Est. Time | Notes |
|-----------|-----------|-------|
| SHA-256 fork ID (1KB genesis) | ~1 μs | |
| Ed25519 signature | ~50 μs | |
| Genesis serialization (typical) | ~10 μs | |
| Genesis deserialization | ~20 μs | |
| Sled write (SSD) | ~50-500 μs | |
| Sled read (SSD, cached) | ~10-100 μs | |
| Fork creation (total) | 1-5 ms | SHA-256 + Ed25519 sign + sled write |
| Fork switch | <1 ms | Database write |
| Exclusion check (10 IDs) | ~1 μs | Linear scan |
| Exclusion check (1000 IDs) | ~100 μs | Would benefit from HashSet |

## Profiling Recommendations

1. **Instrument `is_excluded()` call frequency** - If called in hot path, prioritize caching
2. **Monitor `list_forks` RPC latency** - Will grow linearly with fork count
3. **Track sled I/O** - Use sled's built-in metrics or strace
4. **Measure genesis deserialization** - May benefit from lazy field parsing

## Conclusion

The Fork System has a clean architecture with mostly O(1) operations. The main performance risks are:

1. **N+1 query pattern** in `list_forks` RPC - solvable with batch loading or caching
2. **Linear exclusion checks** in `ForkGenesis::is_excluded()` - solvable with HashSet
3. **No genesis caching** for `is_excluded()` - solvable with LRU cache
4. **Flat known-forks blob** - solvable with tree-based storage

These issues won't be noticeable at small scale (<50 forks, <100 exclusions) but will become problematic at scale. The most critical optimization is adding a genesis cache if `is_excluded()` is used in content validation hot paths.

**Priority for optimization**:
1. P0: Genesis cache (if `is_excluded` is hot)
2. P1: HashSet for exclusion checks
3. P1: Paginate/batch `list_forks` RPC
4. P2: Refactor known forks storage

---

*Performance Review completed 2026-01-12*
*Reviewer: Performance Analysis Agent*
