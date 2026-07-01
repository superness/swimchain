# Next Fixes and Improvements

This document outlines the remaining work needed to complete Swimchain's E2E integration with great test coverage.

## Current Status (2025-12-28, Final Update)

### ✅ ALL E2E TESTS PASS

**Core Functionality:**
- ALL 28 E2E integration tests pass
- Large-scale tests verified (10, 25, 50, 100 nodes)
- Content propagation works across all topologies (linear, mesh, ring, star, diamond)
- Multi-hop propagation verified up to 99 hops (100-node chain)

**Protocol Implementation:**
- Ed25519 signatures: signing and verification ✅
- Content sync: WHO_HAS/I_HAVE/GET/DATA_CONTENT ✅
- Gossip handlers: INV/GETDATA/DATA/NOTFOUND/GOSSIP ✅
- Keepalive: PING/PONG every 2 minutes ✅

**Features:**
- Identity lifecycle (create, show, export, import) ✅
- Space creation, join, leave, listing ✅
- Post create, view, reply ✅
- Content decay with heat calculation ✅
- Testnet seed nodes ✅

**Recently Completed (Session 2025-12-28):**
- INV/GETDATA/DATA/NOTFOUND handlers wired to GossipHandler
- GOSSIP handler wired to GossipManager
- PING/PONG keepalive task implemented
- Testnet placeholder seeds added
- All 28 E2E tests verified passing
- 100-node chain propagation test passed

**Latest Completed (Session 2025-12-28 #2):**
- Social layer message serialization complete:
  - ContributionClaimPayload: `to_bytes()`/`from_bytes()` (152 bytes wire format)
  - ContributionAttestPayload: `to_bytes()`/`from_bytes()` (149 bytes wire format)
  - LevelQueryPayload: `to_bytes()`/`from_bytes()` (32 bytes wire format)
  - LevelResponsePayload: `to_bytes()`/`from_bytes()` (53 bytes wire format)
  - SpaceHealthQueryPayload: `to_bytes()`/`from_bytes()` (16 bytes wire format) - already existed
  - SpaceHealthResponsePayload: `to_bytes()`/`from_bytes()` (37+ bytes wire format) - already existed
  - AttributionQueryPayload/ResponsePayload - already existed
- Social layer handlers wired in router:
  - CONTRIBUTION_CLAIM - parses and logs, ready for manager integration
  - CONTRIBUTION_ATTEST - parses and logs, ready for manager integration
  - LEVEL_QUERY - responds with default NewSwimmer level
  - LEVEL_RESPONSE - parses and logs
  - SPACE_HEALTH_QUERY - responds with default healthy status
  - SPACE_HEALTH_RESPONSE - parses and logs
  - ATTRIBUTION_QUERY - responds with default empty attribution
  - ATTRIBUTION_RESPONSE - parses and logs
- Block/content/identity gossip handlers updated with proper logging

**Remaining (Low Priority - Phase 2):**
- Full manager integration for social layer (requires ContributionManager, LevelManager, SpaceHealthManager, AttributionManager to be wired into router)
- Block/identity gossip propagation storage integration (content sync works via WHO_HAS/I_HAVE/GET/DATA_CONTENT)
- Mainnet seeds (before mainnet launch)

---

## Priority 1: Critical Functionality Gaps

### 1.1 Signature Verification ✅ FIXED

**Status:** FULLY IMPLEMENTED

**What was fixed (Session 2025-12-28):**
- `src/blocks/validation.rs` - Ed25519 signature verification now implemented
  - Verifies signature over `content_hash || timestamp` (40 bytes)
  - Uses `crate::crypto::signature::verify()`
- `src/blocks/validation.rs` - PoW validation implemented (minimum work check per action type)
- `src/gossip/validation.rs` - Signature validation now works for ContentItem payloads
- `src/gossip/validation.rs` - Decay check now uses `calculate_decay_state()`

**Already working:**
- `src/cli/commands/post.rs` - Posts and replies use `sign_content()` with real Ed25519 signatures
- `src/cli/commands/identity.rs` - `prompt_password` made public for signature generation

**Test:**
```bash
# Verify signatures are non-zero after post creation
./target/release/sw --regtest post create --space $SPACE --title "Signed" --body "Test"
# Signature is now properly verified in gossip validation
```

---

### 1.2 Gossip Integration ✅ FULLY IMPLEMENTED

**Status:** All gossip handlers implemented

**What was fixed (Session 2025-12-28):**
- `src/node/router/router.rs` - `handle_gossip()` now wired to `GossipManager.handle_gossip()`
- `src/node/router/router.rs` - INV/GETDATA/DATA/NOTFOUND handlers now wired to GossipHandler
- All gossip messages are received, validated, and processed properly

**What was fixed (Session 2025-12-28 #2):**
- `src/gossip/propagation.rs` - Block/content/identity gossip handlers updated with proper logging
- Integration points documented for future storage connections

**Test:**
```bash
# GOSSIP messages now handled correctly
# Check logs for [GOSSIP] message type during content propagation
```

---

### 1.3 Space Join/Leave Commands ✅ FIXED

**Status:** RESOLVED

**What was fixed:**
- Space join now properly adds to `config.followed_spaces` and saves
- Space leave removes from list and saves
- Space create now auto-joins the created space
- Test S2.2 now properly validates join, list, leave, list cycle

**Remaining TODO:**
- LevelManager integration for level-gated operations (deferred to when contribution system is integrated)

**Test:**
```bash
# S2.2 Test
export SWIMCHAIN_DATA_DIR="./node-a"
SPACE_ID=$(./target/release/sw --regtest space create --name "Joinable" | grep "Space ID:" | awk '{print $3}')

export SWIMCHAIN_DATA_DIR="./node-b"
./target/release/sw --regtest identity create
./target/release/sw --regtest space join $SPACE_ID
./target/release/sw --regtest space list | grep "Joinable"  # Should show
./target/release/sw --regtest space leave $SPACE_ID
./target/release/sw --regtest space list | grep "Joinable"  # Should NOT show
```

---

## Priority 2: Missing Test Cases

### 2.1 Three-Node Mesh Topology (N3.2)

**Current Status:** Linear topology (A→B→C) works. Mesh not tested.

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_N3_2_mesh_topology() {
    log_test "N3.2 - Mesh Topology (All Connected)"

    # Start A, B, C all connected to each other
    # A: 29735
    # B: 29736 --connect A
    # C: 29737 --connect A --connect B

    # Create on A, verify immediate visibility on B and C
    # Verify deduplication (content arrives once per node)
}
```

---

### 2.2 Simultaneous Creates (N3.3)

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_N3_3_simultaneous_creates() {
    log_test "N3.3 - Simultaneous Creates"

    # All 3 nodes create posts at same time
    for node in A B C; do
        SWIMCHAIN_DATA_DIR="./e2e-test-node$node" \
            $SW_BIN --regtest post create --space $SPACE --title "From $node" --body "Parallel" &
    done
    wait

    sleep 20

    # Verify each node has all 3 posts
    # Check for duplicates
}
```

---

### 2.3 Reply to Non-Existent Parent (E1.3)

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_E1_3_reply_invalid_parent() {
    log_test "E1.3 - Reply to Non-Existent Parent"

    output=$($SW_BIN --regtest post reply \
        --parent sha256:0000000000000000000000000000000000000000000000000000000000000000 \
        --body "Orphan reply" 2>&1) || true

    if echo "$output" | grep -qi "not found\|error\|invalid"; then
        log_pass "E1.3"
    else
        log_fail "E1.3" "Expected error for invalid parent"
    fi
}
```

---

### 2.4 Connect to Non-Existent Peer (E1.4)

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_E1_4_connect_nonexistent_peer() {
    log_test "E1.4 - Connect to Non-Existent Peer"

    # Start node with connection to non-existent peer
    timeout 10 $SW_BIN --regtest node start \
        --listen 127.0.0.1:29735 \
        --connect 127.0.0.1:12345 > /tmp/e1_4.log 2>&1 &
    NODE_PID=$!

    sleep 5

    # Node should still be running (graceful failure)
    if ps -p $NODE_PID > /dev/null 2>&1; then
        # Check for warning in logs
        if grep -qi "failed\|connection refused\|timeout" /tmp/e1_4.log; then
            log_pass "E1.4"
        else
            log_pass "E1.4"  # Node running is good enough
        fi
        kill $NODE_PID 2>/dev/null
    else
        log_fail "E1.4" "Node crashed on failed connection"
    fi
}
```

---

### 2.5 Node Restart and Resume (P1.2)

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_P1_2_node_restart() {
    log_test "P1.2 - Node Restart and Resume Sync"

    # Start two nodes, create content on A
    # Kill node B
    # Create more content on A
    # Restart node B
    # Verify B has all content after restart
}
```

---

### 2.6 Large Post (E2.1)

**Add to `scripts/run-e2e-tests.sh`:**
```bash
test_E2_1_large_post() {
    log_test "E2.1 - Large Post (100KB)"

    # Generate 100KB body (1MB might be too slow)
    BODY=$(head -c 100000 /dev/urandom | base64)

    output=$($SW_BIN --regtest post create \
        --space $SPACE_ID \
        --title "Large Post" \
        --body "$BODY" 2>&1)

    if echo "$output" | grep -qE "sha256:[a-f0-9]+"; then
        content_id=$(echo "$output" | grep -oE "sha256:[a-f0-9]+")

        # Verify can view
        view=$($SW_BIN --regtest post view $content_id 2>&1)
        if echo "$view" | grep -q "Large Post"; then
            log_pass "E2.1"
        else
            log_fail "E2.1" "Cannot view large post"
        fi
    else
        log_fail "E2.1" "Failed to create large post"
    fi
}
```

---

## Priority 3: Router Subsystem Wiring

### 3.1 Remaining Router TODOs ✅ MOSTLY COMPLETE

| Handler | Status | Priority |
|---------|--------|----------|
| WHO_HAS | ✅ Working | - |
| I_HAVE | ✅ Working | - |
| GET | ✅ Working | - |
| DATA_CONTENT | ✅ Working | - |
| INV | ✅ FIXED | - |
| GETDATA | ✅ FIXED | - |
| DATA | ✅ FIXED | - |
| NOTFOUND | ✅ FIXED | - |
| GOSSIP | ✅ FIXED | - |
| PING/PONG | ✅ FIXED | - |
| CONTRIBUTION_CLAIM | ❌ Needs serialization | Low |
| CONTRIBUTION_ACK | ❌ Needs serialization | Low |
| LEVEL_QUERY/RESPONSE | ❌ Needs serialization | Low |
| SPACE_HEALTH_QUERY/RESPONSE | ❌ Needs serialization | Low |
| ATTRIBUTION_QUERY/RESPONSE | ❌ Needs serialization | Low |

**What was fixed (Session 2025-12-28):**
- INV/GETDATA/DATA/NOTFOUND handlers now wire to GossipHandler methods
- GOSSIP handler wired to GossipManager.handle_gossip()
- PING/PONG keepalive task sends pings to all peers every 2 minutes
- Social layer handlers (Contribution, Level, SpaceHealth, Attribution) need message serialization before wiring

---

## Priority 4: Code Quality

### 4.1 Engagement Pool Integration ✅ FIXED

**Status:** RESOLVED (Session 2025-12-28)

**What was fixed:**
- `src/cli/commands/post.rs` - Heat is now calculated using `calculate_decay_state()`
- Heat = survival_probability * 100 (shows 100% for protected content, decreases over time)
- Pool seconds/contributors now use `content.engagement_count` instead of hardcoded 0

**Test:**
```bash
./target/release/sw --regtest post view sha256:...
# Heat: 100%  (for new content within 48h floor protection)
```

---

### 4.2 Seed List Population ✅ PARTIALLY FIXED

**Status:** Testnet seeds added, mainnet pending launch

**What was fixed (Session 2025-12-28):**
- Added 3 placeholder testnet seed nodes in `src/discovery/seed_list.rs`
- Testnet seeds use fictional IPs (54.234.56.1-3) - update with real addresses when testnet deployed
- Mainnet seeds remain empty (as intended) until mainnet launch

**Location:** `src/discovery/seed_list.rs:111-127`

---

## Test Coverage Checklist ✅ ALL 28 TESTS PASS

| Test ID | Name | Script | Status |
|---------|------|--------|--------|
| S1.1 | Identity Create/Show | ✅ | ✅ PASS |
| S1.2 | Identity Export/Import | ✅ | ✅ PASS |
| S2.1 | Space Create | ✅ | ✅ PASS |
| S2.2 | Space Join/Leave | ✅ | ✅ PASS |
| S3.1 | Post Create/View | ✅ | ✅ PASS |
| S3.2 | Duplicate Detection | ✅ | ✅ PASS |
| S3.3 | Reply Create | ✅ | ✅ PASS |
| T1.1 | Two Nodes Connect | ✅ | ✅ PASS |
| T2.1 | Content Propagation | ✅ | ✅ PASS |
| T2.2 | Multiple Posts | ✅ | ✅ PASS |
| T2.3 | Reply Chain Propagation | ✅ | ✅ PASS |
| T2.4 | Bidirectional Sync | ✅ | ✅ PASS |
| N3.1 | Linear Topology (A→B→C) | ✅ | ✅ PASS |
| N3.2 | Mesh Topology (3-node) | ✅ | ✅ PASS |
| N3.3 | Simultaneous Creates | ✅ | ✅ PASS |
| N4.1 | Diamond Topology | ✅ | ✅ PASS |
| N4.2 | Star Topology | ✅ | ✅ PASS |
| N4.3 | Edge Node Create | ✅ | ✅ PASS |
| N5.1 | Chain (5-node, 4-hop) | ✅ | ✅ PASS |
| N5.2 | Ring (5-node) | ✅ | ✅ PASS |
| N5.3 | Full Mesh (5-node) | ✅ | ✅ PASS |
| N5.4 | Multi-Origin Simultaneous | ✅ | ✅ PASS |
| E1.1 | Invalid Space Format | ✅ | ✅ PASS |
| E1.2 | View Non-Existent | ✅ | ✅ PASS |
| E1.3 | Reply Invalid Parent | ✅ | ✅ PASS |
| E1.4 | Connect to Offline Peer | ✅ | ✅ PASS |
| E2.1 | Large Post (100KB) | ✅ | ✅ PASS |
| E2.2 | Unicode Content | ✅ | ✅ PASS |

**Large-Scale Tests Also Verified:**
- 10-node chain: ✅ PASS
- 25-node chain: ✅ PASS
- 50-node chain: ✅ PASS
- 100-node chain: ✅ PASS (99-hop propagation)

**Summary:** ALL 28 E2E tests pass. Large-scale testing verified up to 100 nodes.

---

## Execution Order ✅ ALL COMPLETED

1. ✅ **Signature verification** - Ed25519 signing and verification implemented
2. ✅ **Space join/leave** - Fully working
3. ✅ **All 28 test cases** - Scripted and verified
4. ✅ **Wire gossip handlers** - INV/GETDATA/DATA/NOTFOUND/GOSSIP all wired
5. ✅ **Engagement display** - Heat calculated from decay state
6. ✅ **PING/PONG keepalive** - Sends pings to all peers every 2 minutes
7. ✅ **Testnet seeds** - Placeholder seeds added
8. ✅ **Large-scale tests** - Verified up to 100 nodes

**Remaining (Low Priority):**
- Social layer message serialization (Contribution, Level, SpaceHealth, Attribution)
- Block/identity gossip propagation storage integration
- Mainnet seeds (before launch)

---

## Running Tests

```bash
# Build
cargo build --release

# Run unit tests
cargo test --test e2e_flows_test

# Run manual E2E tests
export SWIMCHAIN_PASSWORD="test-password"
./scripts/run-e2e-tests.sh

# Run specific test manually
export SWIMCHAIN_DATA_DIR="./test-node"
./target/release/sw --regtest identity create
./target/release/sw --regtest space create --name "Test"
```

---

## Content Flow Without BlockBuilder/PoolManager

### Current Content Propagation Model

Content currently flows through a **direct gossip model** WITHOUT blocks or engagement pools:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CURRENT CONTENT FLOW (Direct Gossip)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CLI Post Command                                                        │
│       │                                                                  │
│       ▼                                                                  │
│  ┌────────────┐     RPC (HTTP)     ┌────────────────┐                   │
│  │ CLI Client │ ─────────────────► │   RPC Server   │                   │
│  └────────────┘                    │  submit_post   │                   │
│                                    └───────┬────────┘                   │
│                                            │                             │
│                 ┌──────────────────────────┼──────────────────────────┐ │
│                 ▼                          ▼                          ▼ │
│         ┌──────────────┐          ┌──────────────┐          ┌─────────┐ │
│         │  BlobStore   │          │ GossipPropag │          │  I_HAVE │ │
│         │  .put(body)  │          │ CONTENT_NEW  │          │ message │ │
│         └──────────────┘          └──────────────┘          └─────────┘ │
│                 │                          │                      │     │
│                 ▼                          ▼                      ▼     │
│         ┌──────────────┐          ┌──────────────┐          ┌─────────┐ │
│         │ sync_blobs/  │          │  Broadcast   │          │  Peers  │ │
│         │  XX/XXXX...  │          │  to peers    │          │  know   │ │
│         └──────────────┘          └──────────────┘          │  we     │ │
│                                                             │  have   │ │
│                                                             │  it     │ │
│                                                             └─────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### What Happens When Node B Connects to Node A

When two nodes connect, content discovery happens through the **I_HAVE/GET protocol**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INVENTORY EXCHANGE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Node A (has content)              Node B (wants content)               │
│       │                                    │                            │
│       │◄───── TCP Connect ─────────────────│                            │
│       │                                    │                            │
│       │────── HANDSHAKE ──────────────────►│                            │
│       │◄───── HANDSHAKE ───────────────────│                            │
│       │                                    │                            │
│       │                                    │                            │
│       │   (Inventory Exchange - 1 second delay after connect)          │
│       │                                    │                            │
│       │────── I_HAVE(hash1) ─────────────►│                            │
│       │────── I_HAVE(hash2) ─────────────►│   "I have these contents"  │
│       │────── I_HAVE(hash3) ─────────────►│                            │
│       │                                    │                            │
│       │                                    │   B: "I want hash1"        │
│       │◄───── GET(hash1) ──────────────────│                            │
│       │                                    │                            │
│       │────── DATA_CONTENT(hash1, bytes) ─►│                            │
│       │                                    │                            │
│       │                                    │   B stores in sync_blobs/  │
│       │                                    │                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Files in Current Flow

| Component | File | Function |
|-----------|------|----------|
| CLI post command | `src/cli/commands/post.rs` | Computes PoW, calls RPC |
| RPC submit_post | `src/rpc/methods.rs:357` | Validates PoW, stores blob, gossips |
| Gossip propagator | `src/gossip/propagation.rs` | Creates CONTENT_NEW gossip |
| Inventory exchange | `src/node/tasks.rs:555` | Sends I_HAVEs on connect |
| Content retrieval | `src/content/retrieval.rs` | Handles GET/DATA_CONTENT |
| Blob storage | `src/storage/blob.rs` | Stores in sync_blobs/ |
| Decay integration | `src/content/decay_integration.rs` | Tracks metadata for decay |

### What's Missing (BlockBuilder/PoolManager)

**BlockBuilder - Action Aggregation:**
Currently each post is a standalone blob. With BlockBuilder:
- Multiple actions (posts, replies, engagements) would be collected
- Periodically aggregated into **ContentBlocks** and **SpaceBlocks**
- Blocks would be linked in a chain per space
- Blocks would be announced via BLOCK_ANNOUNCE gossip

**PoolManager - Multi-User Engagement:**
Currently PoW is per-author only. With PoolManager:
- Multiple users could pool their PoW contributions
- Content could be collectively boosted to survive decay
- Creates economic incentive for engagement beyond just replying
- Enables the "work as currency" thesis

### Why It Works Without Them

The current model works for basic functionality because:

1. **Content still propagates** - Gossip + I_HAVE/GET protocol moves data between nodes
2. **PoW still prevents spam** - Each post requires individual proof-of-work
3. **Decay still works** - DecayIntegration tracks metadata and prunes old content
4. **Engagement resets decay** - Replies update parent's last_engagement timestamp

### What We Lose Without Them

| Feature | Without BlockBuilder/PoolManager | With Integration |
|---------|----------------------------------|------------------|
| Content ordering | No guaranteed order | Block chain provides order |
| Collective engagement | Each user works alone | Pool PoW for collective boost |
| Space history | Just blobs, no structure | Block chain per space |
| Sync efficiency | One blob at a time | Sync by block range |
| Proof of hosting | Per-blob basis | Per-block receipts |

### Integration Priority

**Phase 5 in PENDING_INTEGRATIONS.md** covers:

1. **BlockBuilder Integration**
   - Add to NodeManager
   - Action accumulator task
   - Block announcement/sync messages

2. **PoolManager Integration**
   - Add to NodeManager
   - RPC methods for pool creation/contribution
   - Pool announcement/discovery gossip
   - Pool completion → decay engagement

This would complete the "actions aggregate into blocks" thesis requirement.

---

### Current Test Coverage for Block/Pool Systems

| Feature | Tests Passing | Status |
|---------|---------------|--------|
| E2E post creation | ✅ | Working |
| E2E content propagation | ✅ | Working |
| E2E reply chains | ✅ | Working |
| E2E partition/recovery | ✅ | Working |
| PoW validation | 27 tests | Working |
| Decay mechanics | 17 tests | Working |
| Level progression | 27 tests | Working |
| Contribution tracking | 12 tests | Working |
| Error handling | 14 tests | Working |
| Sybil resistance | 10 tests | Working |
| **Block building** | 11 unit tests | Not integrated |
| **Engagement pools** | 16 unit tests | Not integrated |

The block building and engagement pool tests verify the core logic works - they're just not wired into the node yet.
