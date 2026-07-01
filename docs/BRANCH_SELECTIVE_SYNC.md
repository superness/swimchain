# Branch-Selective Sync Architecture

## Executive Summary

Swimchain's chain data grows ~6-9GB/year at moderate usage. This is acceptable for the **global network** but unacceptable for **individual nodes**. The solution is **branch-selective sync** where nodes only sync the branches they care about.

**Key Insight**: Global chain size is irrelevant if no single node syncs it all.

---

## 1. The Problem

### 1.1 Chain Growth Math

At moderate usage (50 actions/block, 1 block/minute):
- **Action size**: 218 bytes
- **Block overhead**: ~300 bytes
- **Per block**: ~11 KB
- **Per day**: ~16 MB
- **Per year**: ~5.8 GB

This is for chain data only (action metadata, signatures, hashes) - not content blobs.

### 1.2 Why This Matters

**Target**: 500MB total storage on a 10-year-old smartphone (per VISION.md)

**Current Reality**: Full chain sync would exceed this in ~30 days.

**Solution Required**: Nodes must sync selectively, not comprehensively.

---

## 2. The Solution: Recursive Fracturing + Selective Sync

### 2.1 Recursive BST-Like Structure

Content organizes into a binary tree that keeps splitting:

```
GLOBAL CHAIN
├── Space A (hot) → fractures when >50MB
│   ├── Branch A.L
│   │   ├── Branch A.LL (thread cluster)
│   │   └── Branch A.LR (another cluster)
│   └── Branch A.R
│       ├── Branch A.RL → fractures again if hot
│       │   ├── Branch A.RLL
│       │   └── Branch A.RLR
│       └── Branch A.RR
├── Space B (quiet) → single branch, may decay
└── Space C (massive)
    └── ... (fractures to arbitrary depth)
```

### 2.2 What Triggers Fractures

**Size-Based (Implemented)**:
- Branch exceeds `BRANCH_FRACTURE_THRESHOLD` (50MB)
- Automatic binary split by thread root hash
- Deterministic: same hash → same branch

**Engagement-Based (Future)**:
- Viral thread → split it out for load distribution
- Deep reply chain → fracture for targeted sync
- Engagement graph informs "heat" detection

### 2.3 Node Storage Model

Each node stores:
- **Branch headers** (tiny) for spaces they're aware of
- **Full content** only for subscribed branches
- **Hotswap**: Load/unload branches based on user activity

Example - Joe's node (~500MB):
```
├── /local/boston (Branch L.RL) ─── 50MB
├── /hobbies/fishing (Branch R) ─── 30MB
├── /tech/android (Branch L.L) ──── 40MB
└── ... (12 total branches)
TOTAL: ~400MB + app overhead
```

---

## 3. Current Implementation Status

### 3.1 What Exists (Working)

| Component | Location | Status |
|-----------|----------|--------|
| `BranchPath` data structure | `src/blocks/branch_path.rs` | ✅ Complete |
| `BranchManager` fracturing | `src/branch/manager.rs` | ✅ Complete |
| 50MB threshold trigger | `src/branch/manager.rs:272` | ✅ Complete |
| Parent-anchored threading | `src/branch/manager.rs:165` | ✅ Complete |
| Hash-based placement | `src/blocks/branch_path.rs:89` | ✅ Complete |
| `SpaceBranchState` tracking | `src/branch/metadata.rs` | ✅ Complete |
| Engagement graph storage | `src/engagement_graph/` | ✅ Complete |

### 3.2 What's Missing (Critical Gaps)

| Component | Current State | Required |
|-----------|---------------|----------|
| **Sync filtering** | Height-based only | Branch-filtered requests |
| **Message payloads** | No space/branch fields | Add space_id + branch_path |
| **Peer metadata** | IP + score only | Track which branches peer serves |
| **Discovery** | "Who has hash X?" | "Who serves space/branch Y?" |
| **Request routing** | Broadcast to all | Route to relevant peers |
| **Subscription model** | None | "I want branches X, Y, Z" |

---

## 4. Gap Analysis: Sync Layer

### 4.1 Current Sync Protocol

**Message Types** (from `src/types/constants.rs`):
```
MSG_GETBLOCKS (0x70)        - Height range request
MSG_BLOCKS (0x71)           - Block response
MSG_GETHEADERS (0x72)       - Header range request
MSG_HEADERS (0x73)          - Header response
MSG_GETBLOCKS_LOCATOR (0x78) - Bitcoin-style locator
MSG_GETHEADERS_LOCATOR (0x7A) - Locator for headers
```

**Current Payloads** (no filtering):
```rust
// src/network/messages.rs:204
pub struct GetBlocksPayload {
    pub start_height: u64,      // Height only
    pub end_height: u64,        // No space_id
    pub include_content: bool,  // No branch_path
    pub max_blocks: u16,
}
```

**Problem**: No way to say "give me blocks for branch A.RL only"

### 4.2 Current Peer Discovery

**Peer Entry** (from `src/discovery/peer_entry.rs`):
```rust
pub struct PeerEntry {
    pub wire_addr: WireAddr,    // IP:port
    pub last_success: u64,
    pub failures: u16,
    pub score: i16,
    // MISSING: spaces_served, branches_subscribed
}
```

**Problem**: No way to know which peers serve which content

### 4.3 Current Sync Loop

**From `src/node/tasks.rs:185-303`**:
1. Generate locator from chain tip
2. Send GETBLOCKS_LOCATOR to peers
3. Receive ALL blocks in response
4. Store everything

**Problem**: Downloads entire chain, no selectivity

---

## 5. Target Architecture

### 5.1 New Message Types

```rust
// New message type
pub const MSG_GETBLOCKS_BRANCH: u8 = 0x7B;
pub const MSG_SUBSCRIBE_BRANCH: u8 = 0x7C;
pub const MSG_UNSUBSCRIBE_BRANCH: u8 = 0x7D;

// Enhanced payload
pub struct GetBlocksBranchPayload {
    pub space_id: [u8; 32],
    pub branch_path: BranchPath,
    pub start_height: u64,
    pub end_height: u64,
    pub include_content: bool,
    pub max_blocks: u16,
}

pub struct SubscribeBranchPayload {
    pub space_id: [u8; 32],
    pub branch_path: BranchPath,
}
```

### 5.2 Enhanced Peer Metadata

```rust
pub struct PeerEntry {
    pub wire_addr: WireAddr,
    pub last_success: u64,
    pub failures: u16,
    pub score: i16,
    // NEW: What does this peer serve?
    pub subscribed_branches: Vec<(SpaceId, BranchPath)>,
    pub last_branch_update: u64,
}
```

### 5.3 Branch-Aware Sync Loop

```rust
// New sync model
async fn sync_subscribed_branches(&self) {
    for (space_id, branch_path) in &self.subscriptions {
        // Find peers that serve this branch
        let peers = self.find_peers_for_branch(space_id, branch_path);

        // Request only this branch's blocks
        let request = GetBlocksBranchPayload {
            space_id: *space_id,
            branch_path: branch_path.clone(),
            start_height: self.last_synced_height(space_id, branch_path),
            end_height: u64::MAX,
            include_content: true,
            max_blocks: 100,
        };

        // Send to relevant peers only
        for peer in peers.iter().take(3) {
            peer.send(request.clone()).await;
        }
    }
}
```

### 5.4 Subscription Management

```rust
pub struct BranchSubscriptionManager {
    // Active subscriptions
    subscriptions: HashSet<(SpaceId, BranchPath)>,

    // Storage budget
    max_storage_bytes: u64,
    current_storage_bytes: u64,

    // LRU for hotswap
    last_access: HashMap<(SpaceId, BranchPath), u64>,
}

impl BranchSubscriptionManager {
    /// Subscribe to a branch (will sync its content)
    pub fn subscribe(&mut self, space_id: SpaceId, branch: BranchPath);

    /// Unsubscribe (will stop syncing, may prune)
    pub fn unsubscribe(&mut self, space_id: SpaceId, branch: BranchPath);

    /// Hotswap: unload least-recently-used to make room
    pub fn make_room(&mut self, needed_bytes: u64);

    /// Check if we're subscribed
    pub fn is_subscribed(&self, space_id: &SpaceId, branch: &BranchPath) -> bool;
}
```

---

## 6. Protocol Flow

### 6.1 Initial Sync (New Node)

```
NEW NODE                           SEED PEER
   |                                   |
   |------ CHAINSTATUS --------------->|  "What's your tip?"
   |<----- CHAINSTATUS ----------------|  "Height 50000, tip=abc..."
   |                                   |
   |------ SUBSCRIBE_BRANCH ---------->|  "I want space X, branch L.R"
   |<----- ACK ------------------------|
   |                                   |
   |------ GETBLOCKS_BRANCH ---------->|  "Blocks for X/L.R, height 0-1000"
   |<----- BLOCKS ---------------------|  [blocks for that branch only]
   |                                   |
   |------ GETBLOCKS_BRANCH ---------->|  "Blocks for X/L.R, height 1001-2000"
   |<----- BLOCKS ---------------------|  [more blocks]
   |                                   |
   ...
```

### 6.2 Ongoing Sync

```
NODE                               PEER NETWORK
  |                                    |
  |--- (every 30s) ------------------->|
  |    For each subscribed branch:     |
  |    - Find peers serving it         |
  |    - Request new blocks            |
  |                                    |
  |<--- BLOCK_ANNOUNCE ----------------|  "New block in space Y"
  |                                    |
  |    (if subscribed to Y)            |
  |------ GET_BLOCK ------------------>|
  |<----- BLOCK_DATA ------------------|
```

### 6.3 Hotswap Flow

```
User navigates to new space Z
         |
         v
+-------------------+
| Check storage     |
| budget remaining  |
+-------------------+
         |
         v (if over budget)
+-------------------+
| Find LRU branch   |
| (least recent     |
|  access time)     |
+-------------------+
         |
         v
+-------------------+
| Unsubscribe LRU   |
| Prune local data  |
+-------------------+
         |
         v
+-------------------+
| Subscribe to Z    |
| Begin sync        |
+-------------------+
```

---

## 7. Engagement Graph Integration

### 7.1 How Engagement Informs Sync

The engagement graph (just implemented) feeds into:

1. **Auto-subscription**: "I engage with Alice" → subscribe to her branch
2. **Heat detection**: "This thread is viral" → might fracture soon
3. **Relevance scoring**: Prioritize syncing branches with engaged authors

### 7.2 Future: Engagement-Driven Fracturing

```rust
fn should_fracture(branch: &BranchMetadata, engagement: &EngagementStats) -> bool {
    // Size threshold (current)
    if branch.total_size > BRANCH_FRACTURE_THRESHOLD {
        return true;
    }

    // Engagement velocity (future)
    if engagement.recent_rate() > VIRAL_THRESHOLD {
        return true;
    }

    // Deep reply chain (future)
    if branch.max_thread_depth > DEPTH_THRESHOLD {
        return true;
    }

    false
}
```

---

## 8. Implementation Roadmap

### Phase 1: Message Protocol Enhancement
**Priority: Critical | Effort: Medium**

1. Add new message types to `src/types/constants.rs`:
   - `MSG_GETBLOCKS_BRANCH` (0x7B)
   - `MSG_SUBSCRIBE_BRANCH` (0x7C)
   - `MSG_UNSUBSCRIBE_BRANCH` (0x7D)
   - `MSG_BRANCH_ANNOUNCE` (0x7E)

2. Add payloads to `src/network/messages.rs`:
   - `GetBlocksBranchPayload`
   - `SubscribeBranchPayload`
   - `BranchAnnouncePayload`

3. Add serialization in `src/network/serialize.rs`

**Files**:
- `src/types/constants.rs`
- `src/network/messages.rs`
- `src/network/serialize.rs`

### Phase 2: Peer Metadata Enhancement
**Priority: High | Effort: Medium**

1. Extend `PeerEntry` with subscription tracking
2. Add branch advertisement protocol
3. Implement peer selection by branch

**Files**:
- `src/discovery/peer_entry.rs`
- `src/discovery/manager.rs`
- `src/node/peer_connections.rs`

### Phase 3: Subscription Manager
**Priority: High | Effort: High**

1. Create `src/sync/subscription.rs`
2. Implement subscription lifecycle
3. Add storage budget management
4. Implement LRU hotswap

**Files**:
- `src/sync/subscription.rs` (new)
- `src/sync/mod.rs`
- `src/storage/mod.rs`

### Phase 4: Router & Handler Updates
**Priority: High | Effort: High**

1. Add handlers for new message types
2. Implement branch-filtered block serving
3. Update block announcement routing

**Files**:
- `src/node/router/router.rs`
- `src/node/tasks.rs`

### Phase 5: Sync Loop Refactor
**Priority: Critical | Effort: High**

1. Replace height-based sync with branch-based
2. Implement per-branch sync state
3. Add subscription-aware sync loop

**Files**:
- `src/sync/syncer.rs`
- `src/sync/initial_sync.rs`
- `src/node/tasks.rs`

### Phase 6: Testing & Validation
**Priority: Critical | Effort: High**

1. Unit tests for new message types
2. Integration tests for branch sync
3. Multi-node tests with different subscriptions
4. Storage budget validation tests

**Files**:
- `tests/branch_sync_integration.rs` (new)
- `tests/subscription_tests.rs` (new)

---

## 9. Migration Strategy

### 9.1 Backwards Compatibility

New nodes can fall back to full sync with old nodes:
- If peer doesn't support `MSG_GETBLOCKS_BRANCH`, use `MSG_GETBLOCKS`
- Filter locally after receiving full blocks
- Gradually phase out as network upgrades

### 9.2 Protocol Version Negotiation

```rust
pub struct VersionPayload {
    pub protocol_version: u32,
    pub features: u64,  // Bit flags
    // ...
}

pub const FEATURE_BRANCH_SYNC: u64 = 1 << 8;
```

---

## 10. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Storage per node (active user) | Unbounded | < 500MB |
| Sync time (new node, 10 branches) | N/A | < 5 min |
| Bandwidth (ongoing sync) | All blocks | Only subscribed |
| Mobile viability | No | Yes |

---

## 11. Open Questions

1. **Branch discovery**: How do new users find interesting branches?
2. **Branch popularity**: Should popular branches have more redundancy?
3. **Archiver incentives**: Who stores the full chain long-term?
4. **Cross-branch queries**: How to search across non-subscribed branches?

---

## 12. Related Documents

- `VISION.md` - Original design philosophy
- `specs/SPEC_08_RECURSIVE_BLOCKS.md` - Block structure
- `specs/SPEC_13_ORGANIC_BRANCHING.md` - Behavioral fracturing
- `src/branch/manager.rs` - Current fracturing implementation
- `src/engagement_graph/` - Engagement tracking (just implemented)

---

## Appendix A: Storage Math

### Assumptions
- Action size: 218 bytes
- Block overhead: 300 bytes
- Content blob average: 500 bytes
- Actions per block: 50

### Per-Branch Storage
- 50MB threshold ÷ ~550 bytes/action = ~90,000 actions per branch
- At 50 actions/block = ~1,800 blocks per branch before fracture

### Per-Node Budget
- Target: 500MB
- Reserve for app: 100MB
- Available for content: 400MB
- Branches at 50MB each: ~8 branches
- With partial branches: 10-20 branches

### Network Scale
- 1M users × 10 branches each = 10M branch subscriptions
- If 1000 branches total: 10,000 subscribers per branch average
- Plenty of redundancy for availability
