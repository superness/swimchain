# Integration Roadmap

This document provides a step-by-step implementation plan for integrating pending features into the ChainSocial node. Each phase includes:
1. Writing tests first (TDD approach)
2. Implementing the integration
3. Verification steps

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTEGRATION SEQUENCE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: PoW Validation          Phase 2: Contribution Tracking            │
│  ┌─────────────────────┐          ┌─────────────────────────────┐          │
│  │ • Fix security hole │          │ • Record bandwidth served   │          │
│  │ • Validate all RPC  │          │ • Record content requests   │          │
│  │ • Prevent spam      │    →     │ • Connect to LevelManager   │          │
│  └─────────────────────┘          └─────────────────────────────┘          │
│                                                                             │
│  Phase 3: Level Integration       Phase 4: Peer Persistence                 │
│  ┌─────────────────────┐          ┌─────────────────────────────┐          │
│  │ • Remove placeholders│          │ • GETADDR returns peers    │          │
│  │ • Gate space create  │    →     │ • ADDR stores addresses    │          │
│  │ • Gate sponsorship   │          │ • Reconnect on restart     │          │
│  └─────────────────────┘          └─────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: PoW Validation in RPC (Security Critical)

**Goal:** Ensure all content submission via RPC validates PoW proofs.

**Estimated Scope:** 15-20 tests, ~200 lines of implementation

### Step 1.1: Write Unit Tests for PoW Validation

```rust
// tests/rpc_pow_validation.rs

#[test]
fn test_pow_validation_rejects_missing_proof() {
    // Submit post with no proof → should fail
}

#[test]
fn test_pow_validation_rejects_invalid_proof() {
    // Submit post with garbage proof → should fail
}

#[test]
fn test_pow_validation_accepts_valid_proof() {
    // Submit post with properly computed proof → should succeed
}

#[test]
fn test_pow_validation_enforces_difficulty() {
    // Submit proof below required difficulty → should fail
}

#[test]
fn test_pow_reply_has_lower_difficulty_than_post() {
    // Reply difficulty should be less than post difficulty
}
```

### Step 1.2: Write Integration Tests

```rust
#[test]
fn test_cli_post_create_computes_pow_before_rpc() {
    // CLI should compute PoW locally before submitting via RPC
}

#[test]
fn test_rpc_rejects_replayed_proof() {
    // Same proof submitted twice → second should fail
}

#[test]
fn test_rapid_posting_requires_new_pow_each_time() {
    // Each post needs its own unique PoW
}
```

### Step 1.3: Implementation

**Files to modify:**
- `src/rpc/methods.rs` - Add PoW validation in `submit_post`, `submit_reply`, `submit_engagement`
- `src/crypto/action_pow.rs` - May need helper for verification

**Implementation sketch:**
```rust
// In src/rpc/methods.rs submit_post()

// Before storing content:
let proof = request.pow_proof.ok_or(RpcError::MissingPoWProof)?;

let difficulty = ActionPowDifficulty::for_action(ActionType::Post);
let challenge = compute_challenge(&request.author_id, &request.space_id, &request.body);

if !verify_pow(challenge, proof, difficulty) {
    return Err(RpcError::InvalidPoWProof);
}
```

### Step 1.4: Verification

```bash
# Run the new tests
cargo test rpc_pow_validation

# Run E2E to verify CLI still works
bash scripts/testnet-e2e.sh
```

---

## Phase 2: Contribution Tracking Integration

**Goal:** Record actual hosting work (bandwidth, content served) to enable level progression.

**Estimated Scope:** 20-25 tests, ~300 lines of implementation

### Step 2.1: Write Bandwidth Tracking Tests

```rust
// tests/contribution_tracking.rs

#[test]
fn test_bandwidth_recorded_when_serving_content() {
    // Node A has content
    // Node B requests via GET
    // A's ContributionManager should record bytes served
}

#[test]
fn test_bandwidth_accumulates_across_requests() {
    // Serve 100KB to B, 200KB to C
    // Total bandwidth should be 300KB
}

#[test]
fn test_bandwidth_tracked_per_period() {
    // Serve content
    // Finalize period
    // Start new period
    // Old period data preserved, new period starts fresh
}
```

### Step 2.2: Write Content Served Tests

```rust
#[test]
fn test_content_request_count_incremented() {
    // Each GET request increments content_served count
}

#[test]
fn test_unique_content_ids_tracked() {
    // Serve same content 5 times → count = 5
    // unique_content_ids = 1
}
```

### Step 2.3: Write Level Progression Tests

```rust
#[test]
fn test_hosting_contributes_to_level() {
    // New node starts at level 0
    // Host content for 7 days with good uptime
    // Level should progress based on contributions
}

#[test]
fn test_level_query_reflects_current_contributions() {
    // Run node for simulated period
    // Query level via RPC
    // Level should reflect contribution record
}
```

### Step 2.4: Implementation

**Files to modify:**
- `src/node/router/router.rs` - Record bandwidth in DATA_CONTENT handler
- `src/content/mod.rs` - Track content requests
- `src/node/tasks.rs` - Ensure contribution_manager is passed to router

**Implementation sketch:**
```rust
// In MessageRouter::handle_get_content() after sending DATA_CONTENT

if let Some(ref contrib) = self.contribution_manager {
    contrib.record_bandwidth_served(data_size as u64);
    contrib.record_content_served(content_id);
}
```

### Step 2.5: Verification

```bash
# Run contribution tests
cargo test contribution_tracking

# Run multi-node E2E with contribution checks
bash scripts/testnet-e2e.sh
```

---

## Phase 3: LevelManager Integration

**Goal:** Replace placeholder level checks with actual contribution-based levels.

**Estimated Scope:** 12-15 tests, ~150 lines of implementation

### Step 3.1: Write CLI Integration Tests

```rust
// tests/level_integration.rs (additional tests)

#[test]
fn test_space_create_requires_resident_level() {
    // New identity (level 0) → cannot create space
    // Error message should mention level requirement
}

#[test]
fn test_genesis_identity_can_create_space() {
    // Genesis identity → auto Resident → can create space
}

#[test]
fn test_sponsor_requires_mentor_level() {
    // User at Resident level → cannot sponsor
    // User at Mentor level → can sponsor
}
```

### Step 3.2: Write RPC Level Query Tests

```rust
#[test]
fn test_rpc_get_info_includes_level() {
    // get_info should return current swimmer level
}

#[test]
fn test_level_query_new_identity() {
    // New identity → level = "New Swimmer"
}
```

### Step 3.3: Implementation

**Files to modify:**
- `src/cli/commands/space.rs` - Replace `get_author_level_placeholder()` with actual LevelManager query
- `src/cli/commands/sponsor.rs` - Replace placeholder with actual level check
- `src/rpc/methods.rs` - Add level info to get_info response
- `src/node/manager.rs` - Ensure LevelManager is initialized from ContributionManager data

**Implementation sketch:**
```rust
// In src/cli/commands/space.rs create()

// Instead of: let level = get_author_level_placeholder()?;
let contrib_mgr = ContributionManager::new(config.data_dir(), author_id)?;
let level_mgr = LevelManager::new(contrib_mgr);
let level = level_mgr.current_level()?;

if level < SwimmerLevel::Resident {
    return Err(anyhow!("Space creation requires Resident level (you are {:?})", level));
}
```

### Step 3.4: Verification

```bash
# Run level integration tests
cargo test level_integration

# Test CLI behavior manually
./target/release/sw --testnet space create --name "test"
# Should fail for new identity

# Test with genesis identity
SWIMCHAIN_DATA_DIR=genesis-identity ./target/release/sw --testnet space create --name "test"
# Should succeed
```

---

## Phase 4: Peer Persistence Integration

**Goal:** Persist peer knowledge across restarts and use scoring for connection decisions.

**Estimated Scope:** 20-22 tests, ~250 lines of implementation

### Step 4.1: Write PeerStore Tests

```rust
// tests/peer_store_integration.rs

#[test]
fn test_successful_connection_improves_score() {
    // Connect to peer successfully
    // Score should increase
}

#[test]
fn test_failed_connection_decreases_score() {
    // Fail to connect to peer
    // Score should decrease
}

#[test]
fn test_low_scoring_peers_evicted() {
    // Add many peers with varying scores
    // Eviction should remove lowest scores first
}
```

### Step 4.2: Write Router Handler Tests

```rust
#[test]
fn test_getaddr_returns_known_peers() {
    // Node has peers in PeerStore
    // GETADDR request → returns stored peers
}

#[test]
fn test_addr_stores_received_addresses() {
    // Receive ADDR message
    // Addresses should be stored in PeerStore
}
```

### Step 4.3: Write Peer Maintenance Tests

```rust
#[test]
fn test_reconnect_to_best_peers_on_startup() {
    // Store peers with high scores
    // Restart node
    // Node should reconnect to high-scoring peers
}

#[test]
fn test_stale_peers_removed() {
    // Add peer with old last_seen
    // Run maintenance
    // Stale peer should be removed
}
```

### Step 4.4: Implementation

**Files to modify:**
- `src/node/router/router.rs` - Update GETADDR/ADDR handlers to use PeerStore
- `src/node/tasks.rs` - Implement `reconnect_to_best_peers()`
- `src/node/manager.rs` - Pass PeerStore to router

**Implementation sketch:**
```rust
// In MessageRouter::handle_p2p_message() for GETADDR

Message::GetAddr => {
    if let Some(ref store) = self.peer_store {
        let peers = store.get_best_peers(10)?;
        let addrs: Vec<_> = peers.iter()
            .filter_map(|p| p.addr.parse().ok())
            .collect();
        // Send ADDR response with peers
    }
    RouteAction::None
}
```

### Step 4.5: Verification

```bash
# Run peer store tests
cargo test peer_store_integration

# Test persistence manually
# 1. Run node, connect to peers
# 2. Stop node
# 3. Restart node
# 4. Check that it reconnects to known peers
```

---

## Implementation Timeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Week 1: PoW Validation                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Day 1-2: Write tests (15 tests)                                          │
│ Day 3-4: Implement PoW validation in RPC                                 │
│ Day 5: Verify + E2E tests                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ Week 2: Contribution Tracking                                            │
├──────────────────────────────────────────────────────────────────────────┤
│ Day 1-2: Write tests (25 tests)                                          │
│ Day 3-4: Implement bandwidth/content tracking hooks                      │
│ Day 5: Integration with LevelManager, E2E tests                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Week 3: Level Integration + Peer Persistence                             │
├──────────────────────────────────────────────────────────────────────────┤
│ Day 1-2: Write level integration tests (15 tests)                        │
│ Day 3: Implement level checks in CLI/RPC                                 │
│ Day 4: Write peer persistence tests (20 tests)                           │
│ Day 5: Implement peer persistence, final E2E                             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Test Execution Commands

```bash
# Run all integration tests
cargo test --test rpc_pow_validation
cargo test --test contribution_tracking
cargo test --test level_integration
cargo test --test peer_store_integration

# Run with verbose output
cargo test --test rpc_pow_validation -- --nocapture

# Run specific test
cargo test --test contribution_tracking test_bandwidth_recorded

# Run E2E suite
bash scripts/testnet-e2e.sh
bash scripts/testnet-edge-cases.sh
bash scripts/test-content-management.sh
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] All 15 PoW validation tests pass
- [ ] CLI posts work (compute PoW before RPC)
- [ ] Direct RPC calls without valid PoW fail
- [ ] E2E tests still pass

### Phase 2 Complete When:
- [ ] All 25 contribution tracking tests pass
- [ ] Node logs show bandwidth being recorded when serving content
- [ ] Contribution records include real hosting data
- [ ] Level progression reflects actual contributions

### Phase 3 Complete When:
- [ ] All 15 level integration tests pass
- [ ] New identities cannot create spaces (enforced)
- [ ] Genesis identities can create spaces
- [ ] `get_info` RPC includes current level

### Phase 4 Complete When:
- [ ] All 20 peer persistence tests pass
- [ ] Node reconnects to known peers on restart
- [ ] GETADDR returns stored peers
- [ ] Peer scoring affects connection decisions

---

## Risk Mitigation

### Breaking Changes
- PoW validation will break existing RPC clients that don't send proofs
- Level enforcement will break CLI scripts that assume access

### Mitigation Strategies
1. Add `--skip-pow-validation` flag for testing only (never in production)
2. Ensure testnet genesis identities have proper levels
3. Document migration path for existing users

### Rollback Plan
Each phase is independent. If a phase causes issues:
1. Revert the commits for that phase
2. Investigate in isolation
3. Fix and re-deploy
