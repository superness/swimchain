# Pending System Integrations

This document describes systems that are implemented but not fully integrated into the ChainSocial node. Each section describes the feature, what's already built, what's missing, and the tests we'll write before integration.

---

## 1. PoW Validation in RPC (Security Critical)

### Current State
- PoW proof is computed by CLI when creating posts/replies
- PoW proof is included in RPC requests (`SubmitPostParams.pow_proof`)
- **RPC handler does NOT validate the proof** - has TODO comment

### Why This Matters
Without PoW validation, the RPC endpoint bypasses the entire friction system. Anyone with cookie authentication can submit unlimited content instantly. This defeats the core thesis of ChainSocial - that computational friction prevents spam and forces intentional posting.

### What Needs Integration
1. Call `crate::crypto::action_pow::verify_action_pow()` in `submit_post` and `submit_reply`
2. Reject submissions with invalid or insufficient proof
3. Verify proof matches the content hash and meets difficulty target

### Tests to Write

```
tests/rpc_pow_validation.rs
```

**Unit Tests:**
- `test_submit_post_valid_pow` - Post with valid PoW succeeds
- `test_submit_post_missing_pow` - Post without PoW rejected
- `test_submit_post_insufficient_difficulty` - Post with too-easy PoW rejected
- `test_submit_post_wrong_content_hash` - PoW computed for different content rejected
- `test_submit_post_reused_nonce` - Same PoW proof can't be submitted twice
- `test_submit_reply_valid_pow` - Reply with valid PoW succeeds
- `test_submit_reply_scaled_difficulty` - Reply PoW uses lower difficulty than posts

**Integration Tests (testnet):**
- `test_cli_post_does_pow` - CLI actually computes PoW before RPC call
- `test_rapid_posting_blocked` - Can't submit multiple posts faster than PoW allows
- `test_pow_difficulty_enforcement` - Network rejects under-difficulty proofs

---

## 2. ContributionManager → Network Integration (Core Feature)

### Current State
- `ContributionManager` exists with full contribution tracking logic
- Uptime is being sampled every 5 minutes via `spawn_contribution_recorder`
- Bandwidth served is NOT being tracked
- Content requests served is NOT being tracked
- Contribution data is NOT used to compute swimmer levels

### Why This Matters
The entire ChainSocial economy is based on "hosting as work" - swimmers earn contribution by:
1. Being online (uptime) - **Implemented, integrated**
2. Serving content to peers (bandwidth) - **Implemented, NOT integrated**
3. Responding to content requests (service) - **Implemented, NOT integrated**

Without tracking bandwidth and content served, the contribution system only measures uptime. This makes it trivial to farm levels by running idle nodes.

### What Needs Integration

**In `src/node/tasks.rs` or router:**
1. When sending DATA_CONTENT response, call `record_bandwidth_served(bytes)`
2. When handling GET_CONTENT request, call `record_content_served(space_id, content_count)`

**In `src/rpc/methods.rs`:**
1. When handling `submit_post`, the content is broadcast to peers - this should NOT count as contribution (it's your own content)

**In NodeManager:**
1. Pass `ContributionManager` to router so it can record contributions
2. Ensure contribution records are finalized at period boundaries

### Tests to Write

```
tests/contribution_tracking.rs
```

**Unit Tests:**
- `test_uptime_sampling_records_correctly` - 5-min samples create contribution records
- `test_bandwidth_served_accumulates` - Multiple DATA_CONTENT responses accumulate bandwidth
- `test_content_served_tracks_distinct_requests` - Same content requested twice counts as two services
- `test_own_content_not_counted` - Broadcasting your own post doesn't count as contribution
- `test_period_finalization_creates_hash_chain` - Periods link correctly
- `test_contribution_persists_across_restart` - Contribution records survive node restart

**Integration Tests (testnet):**
- `test_two_node_contribution_from_sync`:
  1. Node A creates post
  2. Node B connects and syncs content from A
  3. Node A's contribution manager shows bandwidth served
  4. Node B's contribution shows content received (NOT served)

- `test_level_progression_from_hosting`:
  1. Node A has content
  2. Nodes B, C, D connect and request content from A
  3. After sufficient contribution, A's level increases
  4. A can now create spaces (requires Resident level)

- `test_idle_node_minimal_contribution`:
  1. Node A runs for 1 hour with no peers
  2. Node A only has uptime contribution
  3. Node A remains at low level

---

## 3. LevelManager Integration (Social Gating)

### Current State
- `LevelManager` exists with full level computation logic
- Level thresholds are defined in level config
- Genesis identities auto-get Resident level
- **CLI uses `get_author_level_placeholder()` which returns a hardcoded level**
- Space creation checks level but uses placeholder
- Sponsorship checks level but uses placeholder

### Why This Matters
The swimmer level system gates social actions:
- New Swimmer: Can post in existing spaces, can receive sponsorships
- Swimmer: Can create public spaces
- Resident: Can sponsor others, create private spaces
- Veteran: Higher sponsorship capacity

Without real level integration, these gates are meaningless. Anyone can create spaces or sponsor others.

### What Needs Integration

**In NodeManager:**
1. Create `LevelManager` instance during startup
2. Pass it to CLI commands via RPC or local lookup

**In `src/cli/commands/space.rs`:**
1. Replace `get_author_level_placeholder()` with actual level lookup
2. Query node RPC or local contribution store for current level

**In `src/cli/commands/sponsor.rs`:**
1. Replace placeholder with actual level lookup
2. Verify sponsor has sufficient level for action

**New RPC method:**
- `get_my_level` - Returns current swimmer level based on contributions

### Tests to Write

```
tests/level_integration.rs
```

**Unit Tests:**
- `test_level_computed_from_contributions` - Contribution records map to correct levels
- `test_genesis_identity_is_resident` - Genesis pubkey automatically Resident
- `test_level_caching_with_staleness` - Cache invalidates when contributions change
- `test_level_thresholds_respected` - Each level requires correct contribution amounts

**Integration Tests (testnet):**
- `test_new_identity_cannot_create_space`:
  1. Create fresh identity
  2. Attempt to create space
  3. Rejected with "requires Swimmer level"

- `test_contributed_node_can_create_space`:
  1. Node A serves content to many peers
  2. After sufficient contribution, A reaches Swimmer level
  3. A can now create spaces

- `test_level_displayed_in_identity_show`:
  1. Run `sw identity show`
  2. Output includes current level and progress to next

- `test_sponsorship_requires_resident`:
  1. Swimmer-level node tries to sponsor
  2. Rejected with "requires Resident level"

---

## 4. PeerStore → Router Integration (Network Resilience)

### Current State
- `PeerStore` exists with full sled-backed persistence
- Peer scoring tracks connection success/failure
- Eviction logic for low-scoring peers
- **Router's GETADDR handler returns empty list**
- **Router's ADDR handler logs but doesn't store**
- **Peer maintenance loop has TODO for reconnect logic**

### Why This Matters
Without persistent peer storage:
1. Every restart requires re-discovery from seeds
2. Good peers aren't remembered
3. Bad peers aren't avoided
4. Network is more vulnerable to eclipse attacks

### What Needs Integration

**In `src/node/router/router.rs`:**
1. Add `PeerStore` to `MessageRouter`
2. In `handle_getaddr`: Query PeerStore for good peers, return them
3. In `handle_addr`: Store received addresses in PeerStore with initial score

**In `src/node/tasks.rs`:**
1. Implement `reconnect_to_best_peers()` in peer maintenance loop
2. On connection success, update peer score positively
3. On connection failure, update peer score negatively

**In NodeManager:**
1. Pass `PeerStore` to router
2. Ensure PeerStore is opened before network starts

### Tests to Write

```
tests/peer_store_integration.rs
```

**Unit Tests:**
- `test_peer_stored_on_connection` - Successful connections are stored
- `test_peer_score_increases_on_success` - Multiple successes raise score
- `test_peer_score_decreases_on_failure` - Failures lower score
- `test_low_score_peers_evicted` - Below-threshold peers removed
- `test_stale_peers_removed` - Peers not seen for weeks removed
- `test_getaddr_returns_good_peers` - GETADDR response includes high-scoring peers
- `test_addr_stores_new_peers` - ADDR message adds peers to store

**Integration Tests (testnet):**
- `test_peers_persist_across_restart`:
  1. Node A connects to B and C
  2. Restart A
  3. A reconnects to B and C without re-discovering

- `test_bad_peer_avoided`:
  1. Node A connects to B (simulated failures)
  2. B's score drops
  3. A stops trying to connect to B

- `test_peer_exchange_populates_store`:
  1. A knows B, B knows C
  2. A requests GETADDR from B
  3. A receives C's address
  4. A can now connect to C

---

## 5. Space Health Tracking (Monitoring)

### Current State
- `SpaceHealthManager` exists with health computation
- Risk scoring implemented
- Contributor tracking implemented
- **ContentManager.iter_space() API doesn't exist** (TODO in risk.rs)
- **Sync status tracking not implemented** (TODO in manager.rs)

### Why This Matters
Space health tells moderators/viewers about community vitality:
- Decay risk (will content disappear?)
- Contributor diversity (is it one person talking?)
- Engagement patterns (is it active?)

Without this, users can't assess community health before joining.

### What Needs Integration

**In `src/content/mod.rs`:**
1. Add `iter_space(space_id)` method to iterate content in a space

**In `SpaceHealthManager`:**
1. Wire up content iteration for decay risk calculation
2. Add sync status tracking

**New RPC method:**
- `get_space_health(space_id)` - Returns health metrics

### Tests to Write

```
tests/space_health_integration.rs
```

**Unit Tests:**
- `test_healthy_space_metrics` - Active space with many contributors scores high
- `test_decaying_space_detection` - Space with old, unengaged content shows decay risk
- `test_single_contributor_warning` - Space dominated by one author flagged
- `test_engagement_ratio_computed` - Posts vs replies ratio correct

**Integration Tests:**
- `test_space_health_via_rpc`:
  1. Create space with various content patterns
  2. Query health via RPC
  3. Metrics reflect actual content state

---

## 6. BlockBuilder Integration (Action → Block Aggregation)

### Current State
- `BlockBuilder` exists in `src/blocks/builder.rs` with complete implementation
- Accumulates actions and forms blocks when PoW threshold met
- Creates content blocks per thread, space blocks per space, root blocks per chain
- **NOT integrated into NodeManager** - actions are NOT being accumulated
- **NOT integrated into gossip** - blocks are NOT being formed or propagated

### Why This Matters
Per the thesis (SPEC_08), individual actions should accumulate into blocks:
1. Actions are accumulated in memory
2. When total PoW reaches ~30 seconds, a root block is formed
3. Root blocks contain space blocks which contain content blocks
4. This hierarchical structure enables efficient sync and pruning

Without block building:
- The chain doesn't have proper block structure
- Syncing requires downloading every individual action
- There's no consensus on action ordering
- Block-based features (cross-block references, finality) don't work

### What Needs Integration

**In NodeManager:**
1. Create `BlockBuilder` instance during startup
2. Pass it to the router or create a dedicated accumulator task

**In router or new task:**
1. When receiving GOSSIP with new action:
   - Add action to `BlockBuilder.add_action(thread_id, space_id, action)`
2. Periodically check `builder.should_form_root()`
3. If ready, call `builder.build_root_block(timestamp)`
4. Store resulting blocks in ChainStore
5. Broadcast new blocks to peers

**New message types needed:**
- `BLOCK_ANNOUNCE` - Announce new block hash
- `GET_BLOCK` - Request block by hash
- `BLOCK_DATA` - Full block contents

### Tests to Write

```
tests/block_building.rs
```

**Unit Tests (builder has these already):**
- `test_builder_accumulates_actions` - Actions are added correctly
- `test_should_form_root_at_threshold` - Block forms when PoW met
- `test_multi_space_blocks` - Actions from different spaces create separate space blocks
- `test_chain_continuity` - Sequential root blocks link correctly

**Integration Tests:**
- `test_actions_accumulate_into_block`:
  1. Submit multiple posts
  2. Total PoW exceeds threshold
  3. Root block is formed
  4. Block contains all submitted actions

- `test_block_propagates_to_peers`:
  1. Node A forms a block
  2. Node B receives block announcement
  3. Node B requests and receives full block

- `test_sync_via_blocks`:
  1. Node A has 10 blocks
  2. Node B connects
  3. B syncs blocks (not individual actions)
  4. B has same state as A

---

## 7. PoolManager / Multi-User Engagement (Pooled PoW)

### Current State
- `PoolManager` exists in `src/content/pool.rs` with complete implementation
- Supports pool creation, contributions, expiry, completion
- Sybil-resistant: 60 users × 1s = 1 user × 60s (same total work)
- **NOT integrated into NodeManager** - pools aren't being tracked
- **NOT integrated into RPC** - no way to create/contribute to pools
- **NOT integrated into gossip** - pools aren't discovered or shared

### Why This Matters
Per the thesis (SPEC_03 §7), pooled engagement allows:
1. Multiple users to collaborate on preserving content
2. Small contributions from many people = large engagement
3. Content that would otherwise decay can be preserved by community effort

This is a core social feature - communities can collectively decide what persists.

### What Needs Integration

**In NodeManager:**
1. Create `PoolManager` instance during startup
2. Pass to relevant subsystems (router, RPC)

**New RPC methods:**
- `create_pool(content_hash)` - Start a pool for specific content
- `get_pool_info(pool_id)` - Query pool status
- `get_pools_for_content(content_hash)` - Find active pools for content
- `contribute_to_pool(pool_id, pow_proof)` - Add PoW to pool

**In gossip/network:**
- `POOL_ANNOUNCE` - Announce new pool
- `POOL_CONTRIBUTION` - Broadcast contribution
- `POOL_COMPLETED` - Announce pool completion

**In decay integration:**
- When pool completes, call `on_engagement()` for the target content

### Tests to Write

```
tests/engagement_pools.rs
```

**Unit Tests (pool.rs has these already):**
- `test_pool_creation` - Pool created with correct parameters
- `test_multi_contributor_pool` - Multiple contributors complete pool
- `test_sybil_equivalence` - 60×1s = 1×60s
- `test_pool_expiry` - Incomplete pools expire after 10 minutes
- `test_content_specific_pow` - PoW must target specific content

**Integration Tests:**
- `test_pool_created_via_rpc`:
  1. Query content via RPC
  2. Create pool via RPC
  3. Pool appears in get_pools_for_content

- `test_multi_user_pool_completion`:
  1. User A creates pool for content
  2. Users B, C, D each contribute 20s PoW
  3. Pool completes (60s total)
  4. Content's decay timer resets

- `test_pool_discovery`:
  1. Node A creates pool
  2. Node B discovers pool via gossip
  3. B can contribute to the pool

- `test_pool_expiry_lost_work`:
  1. Create pool, contribute 30s
  2. Wait 11 minutes (past window)
  3. Pool expired, work lost
  4. Content continues decaying

- `test_pool_completion_resets_decay`:
  1. Content is 5 days old, about to decay
  2. Pool completes for that content
  3. Content's last_engagement updated
  4. Content no longer at risk of decay

---

## 8. Fork Mechanics (Future)

### Current State
- Fork detection logic exists
- Fork ID in message envelopes
- Genesis block structure defined
- **No CLI commands for forking**
- **No fork migration workflow**

### Why This Matters
Forking is the core escape valve in ChainSocial - when communities disagree, they split rather than fight. Without fork tooling, this theoretical benefit is inaccessible.

### What Needs Integration
This is a larger project requiring:
1. `sw fork create` - Create new fork from current state
2. `sw fork migrate` - Move identity/content to different fork
3. Fork discovery mechanism
4. Cross-fork identity linking (optional)

### Tests to Write (Future)
- Fork creation preserves content up to fork point
- Fork creates new genesis with different ID
- Nodes on different forks don't sync
- Identity can exist on multiple forks
- Fork can be joined from scratch

---

## Implementation Order

Based on priority:

### Phase 1: Security (Immediate) ✅ DONE
1. **PoW Validation in RPC** - Fixes bypass of core friction system

### Phase 2: Core Economy (High Priority) ✅ DONE
2. **ContributionManager → Network** - Enables "hosting as work"
3. **LevelManager Integration** - Enables social gating

### Phase 3: Network Resilience (Medium Priority) ✅ DONE
4. **PeerStore → Router** - Improves network stability

### Phase 4: Block & Engagement (Core Protocol) 🔴 NEXT
5. **BlockBuilder Integration** - Proper chain structure
6. **PoolManager Integration** - Multi-user engagement pools

### Phase 5: Monitoring (Lower Priority)
7. **Space Health Tracking** - Nice-to-have visibility

### Phase 6: Advanced (Future)
8. **Fork Mechanics** - Major project, defer until core is solid

---

## Test Infrastructure Needed

To run these integration tests, we need:

1. **Multi-node test harness** - Already have scripts, may need programmatic version
2. **Contribution simulation** - Ability to advance time or force contribution recording
3. **Level progression simulation** - Ability to grant/verify levels
4. **Mock peer failures** - Simulate network issues for peer scoring tests

---

## Next Steps

1. Create test files with placeholder tests
2. Run tests (they should fail)
3. Implement integration code
4. Tests pass
5. Run full testnet E2E to verify no regressions
