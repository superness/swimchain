# C-BLOCKLIST-2 Implementation Log

## Issue Details

- **ID**: C-BLOCKLIST-2
- **Priority**: Critical
- **Effort**: M (4-6 hours)
- **Status**: **IMPLEMENTED** - 2026-01-13

## Problem

Router cannot store network updates because `BlocklistStore` is `Option<Arc<BlocklistStore>>` but router needs write access. The `BlocklistStore` methods `add()`, `add_or_update()`, and `remove()` require `&mut self`, but the router only had immutable access through `Arc<BlocklistStore>`.

This meant that blocklist updates received via the gossip protocol could not be stored locally - they were only logged but not persisted. The handler at `src/node/router/router.rs:handle_blocklist_update()` contained a comment:

```rust
// Note: BlocklistStore requires &mut self for add(), but we have Arc<BlocklistStore>.
// The router validates incoming content against the blocklist but doesn't modify it.
// Blocklist updates should go through RPC or consensus mechanisms that have mutable access.
```

## Solution

Changed `Option<Arc<BlocklistStore>>` to `Option<Arc<RwLock<BlocklistStore>>>` across all components that reference the blocklist, enabling concurrent read access for content validation while allowing exclusive write access for gossip updates.

## Files Modified

### 1. `src/node/router/router.rs`
- **Line 115-116**: Changed `blocklist` field type from `Option<Arc<BlocklistStore>>` to `Option<Arc<RwLock<BlocklistStore>>>`
- **Line 52**: Added `entry_from_update` to imports from `crate::blocklist::gossip`
- **Line 1005-1014**: Updated DATA_CONTENT handler to use `blocklist.read().unwrap()` before calling `is_blocked()`
- **Lines 4488-4521**: Rewrote `handle_blocklist_update()` to:
  - Use read lock to check if hash is already blocked
  - Use write lock to store the update via `store.add_or_update(entry_from_update(&update))`
  - Return proper error on storage failure
- **Lines 4559-4563**: Updated `handle_blocklist_sync()` to use read lock for `merkle_root()` call
- **Lines 4616-4620**: Updated `handle_blocklist_request()` to use read lock for `is_blocked()` calls

### 2. `src/node/router/router.rs` (MessageRouterBuilder)
- **Line 5343**: Changed builder field type to `Option<Arc<RwLock<BlocklistStore>>>`
- **Lines 5418-5422**: Updated `blocklist()` builder method signature to accept `Arc<RwLock<BlocklistStore>>`

### 3. `src/node/manager.rs`
- **Line 92**: Changed `blocklist` field type to `Option<Arc<RwLock<BlocklistStore>>>`
- **Lines 413-432**: Updated blocklist initialization to wrap in `RwLock::new()` before `Arc::new()`
- **Lines 1478-1484**: Updated `blocklist()` accessor method return type to `Option<Arc<RwLock<BlocklistStore>>>`

### 4. `src/rpc/methods.rs`
- **Lines 324-326**: Changed `NodeRef.blocklist` field type to `Option<Arc<std::sync::RwLock<BlocklistStore>>>`
- **Lines 1448-1460**: Updated POST blocklist check to use read lock
- **Lines 1850-1862**: Updated MEDIA blocklist check to use read lock
- **Lines 2015-2027**: Updated REPLY blocklist check to use read lock
- **Lines 2520-2528**: Updated EDIT blocklist check to use read lock

## Pattern Used

This implementation follows the existing pattern used for other stores in the codebase that require concurrent mutable access:
- `block_builder: Option<Arc<RwLock<BlockBuilder>>>`
- `pool_manager: Option<Arc<RwLock<PoolManager>>>`
- `branch_subscription_manager: Option<Arc<RwLock<BranchSubscriptionManager>>>`

The pattern uses:
- `store.read().unwrap()` for read-only operations like `is_blocked()` and `merkle_root()`
- `store.write().unwrap()` for mutations like `add_or_update()`

## Validation

- `cargo check` passes with no errors (only pre-existing warnings)
- All existing blocklist functionality preserved:
  - Content validation still works via read lock
  - Gossip updates can now be stored via write lock

## Related Issues

- **C-BLOCKLIST-1** (completed): Added Ed25519 signature verification to `validate_update()`
- **H-BLOCKLIST-2** (pending): Forward blocklist updates to peers after validation

## Additional Fix (Part 2)

**Date**: 2026-01-13

While the RwLock wrapper was correctly added to the blocklist field types, an additional bug was discovered: the blocklist was not being passed to the router builder during initialization.

### Missing Wiring

At `src/node/manager.rs` (lines 569-609), the router builder was configured with many subsystems but **the blocklist was never passed to it**:

Before:
```rust
// Router received peer_store, chain_store, content_store, dht, block_builder,
// spam_attestation_store, engagement_graph, aggregation_cache
// BUT NOT blocklist!
```

### Fix Applied

Added at `src/node/manager.rs:604-607`:
```rust
// C-BLOCKLIST-2: Pass blocklist store to router for network gossip updates
if let Some(ref blocklist) = self.blocklist {
    router_builder = router_builder.blocklist(blocklist.clone());
}
```

This follows the existing pattern for other optional subsystems.

### Impact

Without this fix:
- Router's `blocklist` field was always `None`
- Blocklist gossip handlers returned `SubsystemUnavailable("blocklist")` errors
- Network blocklist updates were silently ignored

With this fix:
- Router receives the BlocklistStore reference
- `handle_blocklist_update()` can store updates from network peers
- Blocklist sync and request handlers can respond to peer queries

## Notes

The fix enables full blocklist gossip propagation where nodes can now store blocklist updates received from the network. The `handle_blocklist_update()` handler:
1. Validates the incoming update (signature verification done in C-BLOCKLIST-1)
2. Checks if the hash is already blocked (read lock)
3. Converts the update to a `BlocklistEntry` using `entry_from_update()`
4. Stores it using `add_or_update()` (write lock)
5. TODO: Forward to other peers (H-BLOCKLIST-2)

## Final Verification

**Date**: 2026-01-13

- **cargo check**: Passes with no errors (only pre-existing warnings)
- **cargo build --examples**: Passes
- **cargo test storage::tests**: 124 tests passed, 0 failed
- **Code inspection**: All fixes verified in place
  - `src/node/router/router.rs:116`: RwLock wrapper confirmed
  - `src/node/router/router.rs:4489-4518`: Handler stores updates using write lock
  - `src/node/manager.rs:604-607`: Blocklist passed to router builder
  - `src/rpc/methods.rs:326`: RwLock wrapper in NodeRef confirmed

## Documentation Status

**Date**: 2026-01-13
**Status**: ✅ DOCUMENTED

### Summary
C-BLOCKLIST-2 has been fully implemented and validated. The fix enables the router to store blocklist updates received via network gossip by:

1. Wrapping `BlocklistStore` in `Arc<RwLock<...>>` for concurrent read/write access
2. Wiring the blocklist through to the router builder in NodeManager
3. Updating all blocklist access points to use appropriate read/write locks

### Files Modified (3 files, +64/-33 lines)
| File | Changes |
|------|---------|
| `src/node/router/router.rs` | Changed blocklist type to RwLock, updated handlers |
| `src/node/manager.rs` | Added RwLock wrapper, wired blocklist to router builder |
| `src/rpc/methods.rs` | Updated NodeRef and RPC methods to use read locks |

### Validation Results
- ✅ `cargo check` - Pass
- ✅ `cargo build --examples` - Pass
- ✅ `cargo test storage::tests` - 124 tests pass

### Related Work
- **C-BLOCKLIST-1** (completed): Prerequisite - Ed25519 signature verification
- **H-BLOCKLIST-2** (pending): Follow-up - Forward updates to peers after validation
