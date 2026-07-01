# H-BLOCKLIST-2: Incomplete Gossip Forwarding

**Status**: IMPLEMENTED
**Date**: 2026-01-14
**Effort**: M (actual: ~1.5 hours)

## Problem

Blocklist updates weren't forwarded to peers after validation and storage. When a node received a `BLOCKLIST_UPDATE` message from a peer, it would validate and store the update locally but never propagate it to other connected peers. This broke the gossip protocol for blocklist synchronization across the network.

Additionally, the blocklist message type constants (0xA0-0xA2) conflicted with the Branch-Selective Sync message types (GetBlocksBranch, SubscribeBranch, UnsubscribeBranch), which could cause message parsing errors.

## Solution

### 1. Fixed Message Type Conflicts

Changed blocklist message type constants from 0xA0-0xA2 to 0xB0-0xB2 to avoid conflicts:

**File**: `src/blocklist/gossip.rs`
```rust
// Before:
pub const MSG_BLOCKLIST_UPDATE: u8 = 0xA0;
pub const MSG_BLOCKLIST_SYNC: u8 = 0xA1;
pub const MSG_BLOCKLIST_REQUEST: u8 = 0xA2;

// After:
pub const MSG_BLOCKLIST_UPDATE: u8 = 0xB0;
pub const MSG_BLOCKLIST_SYNC: u8 = 0xB1;
pub const MSG_BLOCKLIST_REQUEST: u8 = 0xB2;
```

### 2. Added Blocklist Message Types to Network Enum

Added proper `MessageType` enum variants and `TryFrom` conversions for blocklist messages.

**File**: `src/types/network.rs`
```rust
// Blocklist Gossip (SPEC_12 §4.6)
BlocklistUpdate = 0xB0,
BlocklistSync = 0xB1,
BlocklistRequest = 0xB2,
```

Also added match arm in `src/network/builder.rs` for these message types.

### 3. Added BlocklistGossip to MessageRouter

Integrated `BlocklistGossip` manager into the router for peer-seen tracking:

**File**: `src/node/router/router.rs`

- Added `blocklist_gossip: Option<Arc<RwLock<BlocklistGossip>>>` field to `MessageRouter` struct
- Added corresponding field and builder method to `MessageRouterBuilder`
- Imported `BlocklistGossip` from `crate::blocklist::gossip`

### 4. Implemented Gossip Forwarding

Rewrote `handle_blocklist_update()` to:

1. **Validate signature** using `BlocklistGossip::validate_update()` with Ed25519 verification callback
2. **Store locally** (existing behavior)
3. **Forward to peers** using `BlocklistGossip::peers_to_forward()` to determine which peers haven't seen the update

**Key implementation details**:

```rust
// Validate the update including Ed25519 signature verification (H-BLOCKLIST-2)
let current_time = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();

if let Some(ref blocklist_gossip) = self.blocklist_gossip {
    let gossip = blocklist_gossip.read().unwrap();
    gossip
        .validate_update(&update, current_time, |pubkey, msg, sig| {
            ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        })
        .map_err(|e| RouteError::HandlerError(format!("blocklist validation error: {}", e)))?;
}

// ... store update ...

// Forward to other peers (gossip propagation) - H-BLOCKLIST-2
if let (Some(ref connection_pool), Some(ref blocklist_gossip)) =
    (&self.connection_pool, &self.blocklist_gossip)
{
    let all_peers = connection_pool.peer_ids().await;
    let all_peers_arr: Vec<[u8; 32]> = all_peers.iter().copied().collect();

    let peers_to_forward = {
        let mut gossip = blocklist_gossip.write().unwrap();
        gossip.peers_to_forward(&update.content_hash, &all_peers_arr, Some(*peer_id))
    };

    if !peers_to_forward.is_empty() {
        let envelope = MessageEnvelope::new_fork_agnostic(
            MessageType::BlocklistUpdate,
            payload.to_vec(),
        );

        for target_peer_id in peers_to_forward {
            if let Err(e) = connection_pool.send_to(&target_peer_id, &envelope).await {
                debug!("[BLOCKLIST] Failed to forward update to peer {}: {}", ...);
            } else {
                // Mark peer as having seen the update
                let mut gossip = blocklist_gossip.write().unwrap();
                gossip.mark_peer_seen(&update.content_hash, target_peer_id);
            }
        }
    }
}
```

## Files Changed

1. `src/blocklist/gossip.rs` - Fixed message type constants (0xA0→0xB0, etc.)
2. `src/types/network.rs` - Added `BlocklistUpdate`, `BlocklistSync`, `BlocklistRequest` to `MessageType` enum and `TryFrom` impl
3. `src/network/builder.rs` - Added match arm for blocklist message types
4. `src/node/router/router.rs` - Added `blocklist_gossip` field and implemented gossip forwarding in `handle_blocklist_update()`
5. `src/node/router/tests.rs` - Updated test for deprecated MSG_GOSSIP handling

## Validation

```
cargo check
# Finished `dev` profile [unoptimized + debuginfo] target(s) in 6.34s
# (75 pre-existing warnings, no new errors)

cargo test --lib gossip
# running 21 tests
# test blocklist::gossip::tests::test_gossip_creation ... ok
# test blocklist::gossip::tests::test_entry_from_update ... ok
# test blocklist::gossip::tests::test_peers_to_forward ... ok
# test blocklist::gossip::tests::test_process_threshold_attestations ... ok
# test blocklist::gossip::tests::test_sybil_resistance_different_sponsor_trees ... ok
# test blocklist::gossip::tests::test_sybil_resistance_same_sponsor_tree ... ok
# test blocklist::gossip::tests::test_validate_update ... ok
# test blocklist::gossip::tests::test_validate_update_signature_uses_correct_data ... ok
# ... (21 total tests pass)
# test result: ok. 21 passed; 0 failed;
```

### Additional Test Fix

Updated `src/node/router/tests.rs`:
- Renamed `test_gossip_unavailable` to `test_gossip_deprecated`
- Changed expected behavior: deprecated `MSG_GOSSIP` now returns `Ok(None)` instead of error

## Integration Notes

To enable blocklist gossip forwarding, the `BlocklistGossip` manager must be provided to the router builder:

```rust
let blocklist_gossip = Arc::new(RwLock::new(BlocklistGossip::new(node_id)));
let router = MessageRouter::builder()
    .metrics(metrics)
    .blocklist(blocklist_store)
    .blocklist_gossip(blocklist_gossip)
    .connection_pool(connection_pool)
    .build();
```

If `blocklist_gossip` is not provided, the router will still store updates but won't forward them (graceful degradation).
