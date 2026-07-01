# Performance Review: Private Spaces Encryption

## Summary

The Private Spaces Encryption feature demonstrates solid performance characteristics for small to medium-scale deployments. Storage operations leverage sled's efficient B-tree with appropriate prefix-scan patterns for most queries. However, several O(N) full-table scans and one O(m²) algorithm in the key rotation path create scalability concerns for large spaces (100+ members) or high-volume invite scenarios. Client-side cryptographic operations use hardware-accelerated Web Crypto API, which provides excellent performance.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Algorithmic Complexity | 18 | 25 | O(m²) key rotation verification; O(N) invite scans |
| Resource Usage | 20 | 25 | Good memory patterns; some redundant DB reads |
| Scalability | 17 | 25 | Missing indices; no pagination; single-node only |
| Optimization Opportunities | 20 | 25 | Clear caching and batching opportunities exist |
| **Total** | **75** | **100** | |

## Performance Characteristics

| Operation | Complexity | Location | Notes |
|-----------|------------|----------|-------|
| `add_member` | O(1) | `membership.rs:180-200` | Two sled inserts (primary + index) |
| `remove_member` | O(1) | `membership.rs:203-222` | Two sled deletes |
| `get_member` | O(1) | `membership.rs:225-241` | Single sled lookup |
| `is_member` | O(1) | `membership.rs:244-250` | Single sled contains_key |
| `get_space_members` | O(m) | `membership.rs:253-264` | Prefix scan, m = member count |
| `get_user_spaces` | O(s) | `membership.rs:267-281` | Prefix scan, s = space count |
| `update_member_key` | O(1) | `membership.rs:284-306` | Read-modify-write |
| `member_count` | O(m) | `membership.rs:309-316` | **Full prefix scan just to count** |
| `get_user_invites` | O(i) | `membership.rs:366-385` | Prefix scan + secondary lookup per invite |
| `get_space_invites` | **O(N)** | `membership.rs:388-400` | **Full table scan of all invites** |
| `cleanup_expired_invites` | **O(N)** | `membership.rs:403-429` | **Full table scan of all invites** |
| `get_pending_dm_requests` | O(r) | `membership.rs:499-520` | Prefix scan, r = requests for recipient |
| `kick_member` key rotation | **O(m × k)** | `methods.rs:8926-8952` | **For each key, linear scan of members** |
| `encryptWithSpaceKey` | O(n) | `encryption.ts:361-390` | Linear in content size; HW-accelerated |
| `deriveX25519Keys` | O(1) | `x25519.ts:133-141` | SHA-512 + scalar mult |
| `x25519Box` | O(n) | `x25519.ts:159-180` | Linear in message size |
| `getDMSpaceId` | O(1) | `dm.ts:21-33` | SHA-256 hash |

## Bottlenecks Identified

### 1. Key Rotation Verification O(m²)
**Location**: `src/rpc/methods.rs:8942`
```rust
if remaining_members.iter().any(|m| m.member_pk == member_bytes) {
```
**Impact**: For a space with 100 members, kicking one member triggers ~100 iterations, each scanning up to 99 remaining members = ~9,900 comparisons. At 1,000 members, this becomes ~1M comparisons.
**Mitigation**: Build a `HashSet<[u8; 32]>` from remaining members before the loop. Reduces to O(m + k) where k = number of keys provided.

### 2. `get_space_invites()` Full Table Scan
**Location**: `src/storage/membership.rs:388-400`
```rust
for result in self.pending_invites.iter() {
    // ... filter by space_id
}
```
**Impact**: Scans ALL invites across ALL spaces. With 10,000 pending invites globally, viewing one space's invites scans all 10,000 records.
**Mitigation**: Add `invites_by_space` secondary index tree: `space_id(16) || invite_hash(32) → ()`.

### 3. `cleanup_expired_invites()` Full Table Scan
**Location**: `src/storage/membership.rs:403-429`
**Impact**: Iterates all invites to find expired ones. Should run periodically but expensive at scale.
**Mitigation**: Add `invites_by_expiry` tree: `expires_at(8) || invite_hash(32) → ()` for efficient range queries.

### 4. `member_count()` Full Prefix Scan
**Location**: `src/storage/membership.rs:309-316`
**Impact**: Counts members by iterating all records. Called during `get_my_private_spaces` for each space.
**Mitigation**: Maintain a counter in a separate tree: `space_counts: space_id → count`. Update atomically on add/remove.

### 5. PBKDF2 Iterations (Client-Side)
**Location**: `forum-client/src/lib/encryption.ts:14`
```typescript
const PBKDF2_ITERATIONS = 100000;
```
**Impact**: 100k iterations is intentionally slow (~100-500ms) for passphrase-based encryption. Not an issue for space-key encryption which bypasses PBKDF2.
**Mitigation**: None needed - this is security-appropriate. Document that space-key encryption is O(1) and faster.

### 6. Redundant Member Lookups in `kick_member`
**Location**: `src/rpc/methods.rs:8923`
```rust
let remaining_members = membership_store.get_space_members(&space_id).unwrap_or_default();
```
**Impact**: Fetches all members after already checking membership earlier. The kick target lookup already happened at line 8885.
**Mitigation**: Pass already-fetched member list to key rotation logic, or restructure to avoid double fetch.

## Scalability Concerns

### 1. Single-Node Storage Limitation
The MembershipStore is per-node with no network synchronization. Each node maintains independent membership data. This limits horizontal scaling since:
- Membership changes don't propagate (`broadcast: false`)
- No sharding strategy exists
- All queries are local-only

### 2. No Pagination on List Operations
- `get_space_members` returns ALL members (no limit/offset)
- `get_my_private_spaces` returns ALL spaces
- `get_user_invites` returns ALL pending invites
- Large spaces/active users will return unbounded result sets

### 3. Linear Growth of Secondary Indices
Every member addition creates entries in both `members` and `user_spaces` trees. High-frequency join/leave activity will cause B-tree rebalancing overhead.

### 4. Client-Side Key Storage
Space keys stored in IndexedDB have no size limits enforced. A user in hundreds of spaces will accumulate significant key storage.

### 5. No Query Caching
Every RPC call performs fresh database lookups. Frequently accessed spaces (membership lists, member counts) could benefit from LRU caching.

## Optimization Recommendations

### High Impact

1. **Add HashSet for Key Rotation Verification**
   - Location: `methods.rs:8926-8952`
   - Change: Build `HashSet` from `remaining_members` before loop
   - Expected: O(m²) → O(m + k), ~100x improvement for 100-member spaces
   - Effort: Low (5 lines changed)

2. **Add `invites_by_space` Secondary Index**
   - Location: `membership.rs`
   - Change: New sled tree maintaining space → invite mapping
   - Expected: O(N) → O(i) for `get_space_invites`, where i << N
   - Effort: Medium (new tree + maintain on add/update)

3. **Add Pagination to List Operations**
   - Location: `get_space_members`, `get_my_private_spaces`, etc.
   - Change: Add `limit` and `offset` parameters
   - Expected: Bounded response sizes, reduced memory pressure
   - Effort: Medium (API changes + client updates)

### Medium Impact

4. **Cache Member Counts**
   - Location: `membership.rs`
   - Change: Maintain atomic counter per space
   - Expected: O(m) → O(1) for `member_count`
   - Effort: Low-Medium (new tree + counter maintenance)

5. **Batch Key Rotation Updates**
   - Location: `methods.rs:8943-8950`
   - Change: Use sled batch operation instead of individual updates
   - Expected: Reduced I/O overhead for large rotations
   - Effort: Low

6. **Add LRU Cache for Frequently Accessed Data**
   - Location: `MembershipStore`
   - Change: In-memory cache for member records with TTL
   - Expected: Reduced disk I/O for hot paths
   - Effort: Medium (cache invalidation complexity)

### Low Impact (Quick Wins)

7. **Avoid Double Member Lookup in `kick_member`**
   - Location: `methods.rs:8885-8923`
   - Change: Reuse earlier lookup result
   - Expected: One fewer DB read per kick operation
   - Effort: Very Low

8. **Use `scan_prefix` Count Instead of Iterator**
   - Location: `member_count`
   - Change: Use sled's `len()` if available per-prefix, or maintain counts
   - Expected: Marginal improvement
   - Effort: Very Low

9. **Add `expires_at` Index for Cleanup**
   - Location: `membership.rs`
   - Change: Time-sorted index for expiry queries
   - Expected: Efficient expired invite cleanup
   - Effort: Low

## Resource Estimates

### Memory (per node)
| Component | Estimate | Notes |
|-----------|----------|-------|
| MemberRecord | ~128 bytes | 32 (pk) + 8 (role+time) + 32 (inviter) + ~50 (enc key) + 4 (version) |
| InviteRecord | ~200 bytes | Including encrypted key + optional message |
| DMRequestRecord | ~120 bytes | Including key share |
| 1,000-member space | ~130 KB | Just member records |
| 10,000 global invites | ~2 MB | All pending invites |

### Storage (per node)
| Scenario | Estimate | Notes |
|----------|----------|-------|
| Small deployment (100 spaces, 1K members) | ~5 MB | Members + invites + indices |
| Medium deployment (1K spaces, 10K members) | ~50 MB | Linear growth |
| Large deployment (10K spaces, 100K members) | ~500 MB | May need optimization |

### Network (per operation)
| Operation | Request Size | Response Size | Notes |
|-----------|--------------|---------------|-------|
| create_private_space | ~500 bytes | ~100 bytes | PoW + encrypted key |
| invite_to_space | ~400 bytes | ~80 bytes | Encrypted key transfer |
| kick_member | ~300 + (m × 80) bytes | ~50 bytes | m = remaining members, key rotation payload |
| get_space_members | ~50 bytes | ~130 × m bytes | Scales with member count |

### Client-Side Crypto Performance
| Operation | Time (typical) | Notes |
|-----------|----------------|-------|
| deriveX25519Keys | <1ms | SHA-512 + scalar mult |
| encryptWithSpaceKey (1KB) | <5ms | AES-GCM hardware accelerated |
| encryptWithSpaceKey (1MB) | ~50ms | Linear scaling |
| PBKDF2 key derivation | 100-500ms | Intentional for security |
| getDMSpaceId | <1ms | SHA-256 hash |

## Benchmarking Recommendations

To validate these estimates, consider adding benchmarks for:

1. **Space Member Operations**
   ```rust
   #[bench]
   fn bench_get_space_members_100() { ... }
   fn bench_get_space_members_1000() { ... }
   ```

2. **Key Rotation at Scale**
   ```rust
   #[bench]
   fn bench_kick_member_100_remaining() { ... }
   fn bench_kick_member_1000_remaining() { ... }
   ```

3. **Invite Cleanup**
   ```rust
   #[bench]
   fn bench_cleanup_expired_10k_invites() { ... }
   ```

4. **Client Encryption**
   ```typescript
   // Add to encryption.test.ts
   describe('performance', () => {
     it('encrypts 1MB content in <100ms', async () => { ... });
   });
   ```

## Conclusion

The feature has a solid cryptographic foundation with efficient primitives but needs indexing and pagination improvements before scaling to large deployments. The O(m²) key rotation verification and O(N) full table scans are the most critical issues to address. Most optimizations are straightforward to implement and would provide significant improvements.

---

**Reviewer**: Performance Reviewer
**Date**: 2026-01-12
**Feature Version**: Private Spaces v1.0
