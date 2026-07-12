# SPEC_08: Recursive Block Architecture

**Status:** Implemented
**Version:** 1.0.0
**Created:** 2024-12-25
**Updated:** 2025-12-25
**Depends on:** SPEC_02 (Decay), SPEC_03 (PoW), SPEC_04 (Spaces), SPEC_07 (Content Distribution)

---

## 1. Overview

### 1.1 Purpose

Swimchain uses a **recursive block architecture** where blocks form a hierarchical tree structure mirroring content organization. This design enables:

1. **Content-specific PoW** - Actions target specific content, can't be reused
2. **Individual engagement** - Each engagement is one PoW action that resets shared content's decay
3. **Efficient lookup** - O(log n) binary tree navigation
4. **Parent-anchored threading** - Related content stays together for sync efficiency
5. **Automatic branching** - Tree fractures when branches grow too large

### 1.2 Key Insight: Mining IS Paying

There is no distinction between "mining" and "paying for actions." Users mine to:

- **Post** - Pay PoW, content enters chain
- **Engage** - Pay PoW, content's decay timer resets

The mechanism is identical to Bitcoin - PoW proves work was done. The difference:
- **Not competitive** - All valid PoW counts
- **Reward is the action** - Not a token, but the effect (content posted, content persisted)

### 1.3 Scope

**In Scope:**
- Hierarchical block structure (root → space → content)
- PoW aggregation mechanics
- Block formation on accumulated PoW
- Parent-anchored content placement
- Automatic branching thresholds

**Out of Scope:**
- Individual content decay (see SPEC_02)
- PoW algorithms and parameters (see SPEC_03)
- Space governance (see SPEC_04)
- Content blob storage (see SPEC_07)

---

## 2. Block Hierarchy

### 2.1 Three-Level Structure

```
                    ROOT BLOCK (CHAIN LEVEL)
                    ├── Contains: space block hashes
                    ├── PoW: sum of space block PoWs
                    └── Forms when accumulated PoW crosses threshold
                            │
            ┌───────────────┼───────────────┐
            │               │               │
      SPACE BLOCK     SPACE BLOCK     SPACE BLOCK
      (rust-lang)     (boston)        (fishing)
      ├── Contains:   ├── Contains:   ├── Contains:
      │   content     │   content     │   content
      │   block       │   block       │   block
      │   hashes      │   hashes      │   hashes
      └── PoW: sum    └── PoW: sum    └── PoW: sum
            │               │               │
     ┌──────┴──────┐       ...             ...
     │             │
CONTENT BLOCK  CONTENT BLOCK
(thread X)     (thread Y)
├── Actions:   ├── Actions:
│   post       │   reply
│   engage     │   engage
│   reply      │   engage
└── PoW: sum   └── PoW: sum
```

### 2.2 Block Types

#### Root Block

The chain tip. Forms when accumulated space-block PoW crosses the formation threshold.

```
RootBlock {
    version:            uint8           // Protocol version
    prev_root_hash:     Hash            // Previous root block hash
    timestamp:          Timestamp       // Block timestamp
    merkle_root:        Hash            // Merkle root of space blocks
    space_block_count:  uint32          // Number of space blocks included
    total_pow:          uint64          // Aggregate PoW in seconds
    difficulty_target:  uint64          // Required PoW for this block
}
```

#### Space Block

Contains all activity within a single space accumulated since its previous space block.

```
SpaceBlock {
    space_id:           SpaceHash       // Space this block belongs to
    prev_space_hash:    Hash            // Previous space block for this space
    timestamp:          Timestamp       // Block timestamp
    merkle_root:        Hash            // Merkle root of content blocks
    content_block_count: uint32         // Number of content blocks
    total_pow:          uint64          // Aggregate PoW in seconds
    root_block_ref:     Hash            // Parent root block being contributed to
}
```

#### Content Block

Contains all actions on a specific piece of content (thread).

```
ContentBlock {
    thread_root_id:     ContentHash     // Root post of this thread
    space_id:           SpaceHash       // Space containing this thread
    prev_content_hash:  Hash?           // Previous content block for this thread
    timestamp:          Timestamp       // Block timestamp
    actions:            Action[]        // List of actions (posts, replies, engages)
    total_pow:          uint64          // Aggregate PoW in seconds
    space_block_ref:    Hash            // Parent space block being contributed to
}
```

### 2.3 Action Structure

Individual actions within content blocks:

```
Action {
    action_type:        ActionType      // POST | REPLY | ENGAGE
    actor:              PublicKey       // Who performed the action
    timestamp:          Timestamp       // When action occurred

    // For POST and REPLY
    content_hash:       ContentHash?    // Hash of content (inline or blob reference)
    parent_id:          ContentHash?    // Parent content (for REPLY)

    // PoW proof
    pow_nonce:          uint64          // Nonce that solves PoW
    pow_work:           uint64          // Work amount in seconds
    pow_target:         Hash            // Target that was solved against

    signature:          Signature       // Ed25519 signature
}

enum ActionType {
    POST    = 0x01,     // New thread root
    REPLY   = 0x02,     // Reply to existing content
    ENGAGE  = 0x03      // Engagement (resets content decay)
}
```

---

## 3. Engagement PoW

### 3.1 The Core Concept

**All engagement costs PoW.** This prevents free self-persistence:

| Action | PoW Cost | Effect |
|--------|----------|--------|
| Create space | highest difficulty | One-time space creation |
| Create post (new thread) | high difficulty | Creates new content block |
| Reply | medium difficulty | Adds to existing thread |
| Engage (persist) | lowest difficulty | Resets content decay |

PoW scales by action type only, in the order space > post > reply > engage.

### 3.2 Individual Engagement Mechanics

Each engagement is an **individual PoW action**. A single valid engagement proof immediately resets the target content's decay timer:

```
ENGAGEMENT MODEL

One engagement = one valid PoW proof against the target content
├── Solved by a single identity
├── Recorded as one ENGAGE action in the content block
├── Resets the content's decay timer on acceptance
└── No coordination, no window, no shared total

Example:
├── User A wants a post to persist
├── User A computes one engagement PoW
└── Decay timer reset ✓
```

Keeping a piece of content alive costs one engagement-PoW per item per decay cycle, forever. There is no shared total and no partial credit — every reset is a full, self-contained proof.

### 3.3 Engagement Data Structure

An engagement is an `Action` of type `ENGAGE`, carried inside the target content's content block:

```
Engagement (ENGAGE action) {
    actor:              PublicKey       // Who engaged
    content_hash:       ContentHash     // Content being engaged
    pow_nonce:          uint64          // PoW solution
    pow_work:           uint64          // Work amount in seconds
    pow_target:         Hash            // Target including content hash
    timestamp:          Timestamp       // When engaged
    signature:          Signature       // Ed25519 signature
}
```

### 3.4 Engagement Flow

```
1. INTENT
   ├── User sees content approaching decay
   └── User starts computing an engagement proof

2. PROOF
   ├── User computes PoW against: H(nonce || content_hash || prev_root_hash)
   ├── Engagement broadcast to peers
   └── Peers validate the single proof

3. ACCEPTANCE
   ├── Valid proof accepted into the content block
   ├── Content decay timer reset immediately
   └── Actor recorded in the content block
```

### 3.5 Why Sybils Don't Help

```
ATTACK: Create 100 identities to "split" cost

Reality:
├── Each reset costs one full engagement PoW
├── 100 identities = 100 separate full-cost proofs = 100x the work
├── 1 identity = 1 full-cost proof for the same one reset
└── Sybils multiply cost, they do not amplify effect

Self-engagement is allowed because it is pointless: each reset costs
full engagement PoW regardless of identity, so sockpuppets only
multiply your own cost for no additional benefit.
```

---

## 4. Parent-Anchored Threading

### 4.1 The Problem with Hash-Based Branching

Pure hash-based branch assignment scatters related content:

```
PROBLEM: Hash determines branch

Post X: hash 0x3... → LEFT branch
Reply to X: hash 0xA... → RIGHT branch (different!)

Thread is split across branches:
├── User needs both branches to see full conversation
├── Cross-branch references everywhere
└── Sync optimization defeated
```

### 4.2 Parent-Anchored Placement

Rule: **Content goes to the same branch as its parent (thread root).**

```
PARENT-ANCHORED PLACEMENT

1. New post (no parent):
   └── Branch = hash(post_content)

2. Reply to existing post:
   └── Branch = same as thread root

3. Engagement on any content:
   └── Branch = same as target content

4. Branch fracturing:
   └── Splits by thread root hash, keeps threads intact
```

### 4.3 Complete Thread Locality

```
Thread rooted at Post X (hash 0x3... → LEFT branch):

POST X                 → LEFT (root determines placement)
├── Reply A to X       → LEFT (follows parent)
│   └── Reply B to A   → LEFT (follows thread root)
├── Reply C to X       → LEFT (follows parent)
└── Engagement         → routed to the target content's branch (LEFT)

ALL in same branch. User syncs LEFT, gets complete thread.
```

### 4.4 Content Block Structure (Updated)

```
ContentBlock {
    thread_root_id:     ContentHash     // Root post - determines branch
    branch_path:        BranchPath      // Path in branch tree
    space_id:           SpaceHash       // Space containing thread

    // All actions on this thread
    actions:            Action[]        // Posts, replies, engagements

    // Thread is atomic unit - never split
    ...
}

BranchPath {
    depth:              uint8           // Depth in branch tree
    path:               bytes           // Bit path (LEFT=0, RIGHT=1)
}
```

---

## 5. Automatic Branching

### 5.1 When Branches Split

Spaces grow. When they exceed thresholds, they fracture:

```
FRACTURE TRIGGER

Space block exceeds size threshold:
├── Threshold: configurable, default ~50MB worth of content blocks
├── Fracture: binary split by thread root hash
├── Threads never split (atomic unit)
└── New depth level added to branch tree
```

### 5.2 Fracture Process

```
BEFORE FRACTURE:

Space: rust-lang
└── (all threads in single branch)

AFTER FRACTURE:

Space: rust-lang
├── LEFT (threads with root hash 0x0-0x7)
│   └── (threads that belong here)
└── RIGHT (threads with root hash 0x8-0xF)
    └── (threads that belong here)

Thread assignment is deterministic:
├── First bit of thread_root_id hash
├── 0 → LEFT
├── 1 → RIGHT
└── Consistent across all nodes
```

### 5.3 Recursive Fracturing

Branches can fracture again:

```
DEEP FRACTURE (very active space):

Space: rust-lang
├── LEFT
│   ├── LEFT-LEFT (hashes 0x0-0x3)
│   └── LEFT-RIGHT (hashes 0x4-0x7)
└── RIGHT
    ├── RIGHT-LEFT (hashes 0x8-0xB)
    └── RIGHT-RIGHT (hashes 0xC-0xF)

Lookup: O(log n) where n = number of threads
```

### 5.4 User Sync Optimization

Users sync branches containing their interactions:

```
USER SYNC STRATEGY

User has interactions in:
├── Thread A (hash 0x3... → LEFT-LEFT)
├── Thread B (hash 0x5... → LEFT-RIGHT)
└── Thread C (hash 0xA... → RIGHT-LEFT)

User syncs:
├── LEFT-LEFT (contains Thread A)
├── LEFT-RIGHT (contains Thread B)
├── RIGHT-LEFT (contains Thread C)
└── NOT RIGHT-RIGHT (no interactions there)

Storage: subscribed branches PLUS all chain records
├── A node hosts the content bodies of branches it subscribes to
├── A node keeps ALL chain records (the authoritative metadata)
└── Content in a branch it does not host is fetched on demand when viewed
```

### 5.5 Hybrid Branching (Manual + Automatic)

```
AUTOMATIC (content level):
├── Triggered by size threshold
├── Deterministic split by hash
├── Transparent to users
└── Storage optimization

MANUAL (space level):
├── Community decides to fork space
├── Creates new space entirely
├── Migrates members who want to move
└── Social/governance decision
```

---

## 6. Block Formation

### 6.1 Bottom-Up Aggregation

PoW aggregates from actions up through the hierarchy:

```
LEVEL 0: ACTIONS (atomic)
├── Post: high-difficulty PoW
├── Reply: medium-difficulty PoW
├── Engage: lowest-difficulty PoW
└── Each action has individual PoW proof

LEVEL 1: CONTENT BLOCK
├── Sum of action PoWs
├── Forms when actions accumulate
└── e.g., 30s (post) + 10s (reply) + 10s (reply) + 5s (engage) = 55s

LEVEL 2: SPACE BLOCK
├── Sum of content block PoWs
├── Forms when content blocks accumulate
└── e.g., 55s + 80s + 120s = 255s

LEVEL 3: ROOT BLOCK
├── Sum of space block PoWs
├── Forms when accumulated PoW crosses the 30 PoW-second threshold
└── e.g., 255s + 200s + 150s = 605s
```

### 6.2 Root Block Formation

Root blocks form when accumulated PoW crosses a threshold, not on a wall-clock cadence:

```
ROOT BLOCK FORMATION

Actions queue across all spaces:
├── Space A: content blocks accumulating
├── Space B: content blocks accumulating
├── Space C: content blocks accumulating
└── Total PoW accumulating

When accumulated PoW >= 30 PoW-seconds threshold:
├── Collect pending space blocks
├── Compute merkle root
├── Form root block
├── Broadcast to network
└── New accumulation begins

Threshold behavior:
├── Formation is driven by accumulated proof-of-work, not a timer
├── More activity → threshold reached sooner
├── Less activity → threshold reached later
└── The chain advances exactly as fast as work is done
```

### 6.3 Chain Commitment

Actions commit to chain state, preventing replay:

```
ACTION POW TARGET

H(nonce || action_data || content_hash || prev_root_hash) < difficulty

This means:
├── Action is tied to specific chain state
├── Can't reuse PoW from different chain position
├── Actions form valid block at specific height
└── Chain security through aggregate commitment
```

---

## 7. Validation Rules

### 7.1 Action Validation

```
For each action in a content block:
1. Action type is valid (POST, REPLY, ENGAGE)
2. Actor signature is valid
3. PoW proof is valid against target including:
   - content_hash (content-specific)
   - prev_root_hash (chain-specific)
4. Timestamp within acceptable window
5. For REPLY: parent exists and is not decayed
6. For ENGAGE: target content exists and the single PoW proof is valid
```

### 7.2 Content Block Validation

```
For each content block in a space block:
1. thread_root_id references valid POST action
2. All actions reference this thread (parent-anchored)
3. Sum of action PoWs equals block total_pow
4. Merkle root matches action list
5. Branch path is correct for thread_root_id hash
```

### 7.3 Space Block Validation

```
For each space block in a root block:
1. space_id is valid space
2. Sum of content block PoWs equals block total_pow
3. Merkle root matches content block list
4. All content blocks have correct space_id
```

### 7.4 Root Block Validation

```
For each root block:
1. prev_root_hash matches previous root block
2. Total PoW meets the formation threshold
3. Sum of space block PoWs equals block total_pow
4. Merkle root matches space block list
5. Timestamp is within acceptable window
```

---

## 8. Attack Scenarios

### 8.1 Private Space Storage Abuse

```
ATTACK: Use private space as personal storage

Setup:
├── Attacker creates private space
├── Posts 1000 files
├── Initial cost: 1000 × 30s = 500 minutes

Persistence cost (monthly):
├── Each content needs one engagement PoW per decay cycle
├── Every reset is a full-cost proof paid by the attacker
├── Monthly: 1000 × (one engagement PoW each)
└── Ongoing cost makes this expensive

RESULT: Economically irrational vs. actual hosting ($0.10/month)
```

### 8.2 Hijacking Popular Space

```
ATTACK: Spam popular space

Post spam in "rust-lang" (1000 members):
├── Spam post: 30s PoW
├── Content distributed to members
├── Everyone sees spam

Defense:
├── Spam content has no organic engagement
├── Attacker must pay a full engagement PoW per decay cycle to persist
├── No one else engages it
├── Spam decays without engagement
└── Community visible, can filter/migrate

RESULT: Visible but expensive and temporary
```

### 8.3 Sybil Engagement Attack

```
ATTACK: Create fake identities to cheapen persistence

100 identities engage same content:
├── Each reset still costs one full engagement PoW
├── 100 identities = 100 full-cost proofs = 100x the work
└── The extra identities buy nothing but extra cost

Single identity:
├── One reset costs one full engagement PoW
└── Same one reset, minimum possible cost

RESULT: Sybils multiply cost without amplifying effect. Self-engagement
is allowed precisely because it is pointless.
```

### 8.4 Block Stuffing

```
ATTACK: Spam chain with garbage

Post garbage across spaces:
├── Each post: 30s PoW
├── Increases block rate temporarily
├── Difficulty adjusts UP
├── Now everyone pays more

Garbage outcome:
├── No engagement → decays
├── Attacker paid to increase difficulty
├── Chain returns to normal after decay

RESULT: Self-defeating, attacker funds own difficulty increase
```

---

## 9. Performance Considerations

### 9.1 Lookup Efficiency

```
BINARY TREE LOOKUP: O(log n)

Finding content X:
├── Root block → space block: O(1) hash lookup
├── Space block → branch: O(log branches)
├── Branch → content block: O(log threads)
└── Content block → action: O(actions in thread)

For space with 1M threads:
├── ~20 branch levels max
├── Lookup: ~20 hash comparisons
└── Very efficient
```

### 9.2 Sync Efficiency

```
USER SYNC

User follows 12 spaces × 3 branches average:
├── 36 branch paths to host in full
├── Each branch: latest content blocks
├── Complete threads (parent-anchored)
├── Plus all chain records (authoritative metadata)
└── Unhosted content fetched on demand when viewed

Storage target: 500MB per user
├── Achievable with decay + selective branching
├── Old threads decay → storage reclaimed
└── Active threads persist → complete conversations

Search consistency:
├── Search indexes ALL chain records
├── Every node sees identical search results
└── A hit outside a hosted branch fetches its content on demand
```

### 9.3 Block Size Targets

| Level | Target Size | Notes |
|-------|-------------|-------|
| Root block | ~1KB | Header only, merkle root |
| Space block | ~10KB | Content block references |
| Content block | ~100KB | Thread actions |
| Branch | ~50MB | Fracture threshold |

---

## 10. Wire Protocol

### 10.1 Message Types

| Type | ID | Description |
|------|-----|-------------|
| ROOT_BLOCK | 0x40 | New root block announcement |
| GET_ROOT | 0x41 | Request root block by hash |
| SPACE_BLOCK | 0x42 | Space block data |
| GET_SPACE | 0x43 | Request space block |
| CONTENT_BLOCK | 0x44 | Content block data |
| GET_CONTENT | 0x45 | Request content block |
| ACTION_NEW | 0x49 | New action broadcast (post, reply, engage) |

### 10.2 Action Broadcast

An engagement travels as an ordinary `ACTION_NEW` message; there is no separate engagement message type.

```
ACTION BROADCAST (0x49):
[1 byte: type]
[1 byte: action_type]          // POST | REPLY | ENGAGE
[32 bytes: actor_pubkey]
[32 bytes: content_hash]
[32 bytes: parent_id]          // zero for POST
[8 bytes: pow_nonce]
[8 bytes: pow_work]
[32 bytes: pow_target]
[64 bytes: signature]
```

---

## 11. Integration with Other Specs

### 11.1 SPEC_02 (Decay)

- Decay applies at content level (individual posts)
- A single valid engagement resets the content's decay timer
- Each engagement counts as one reset for decay purposes
- Decayed content blocks can be pruned

### 11.2 SPEC_03 (PoW)

- Action PoW uses same algorithm (Argon2id)
- Difficulty levels by action type (space > post > reply > engage)
- Each engagement is a single self-contained proof

### 11.3 SPEC_04 (Spaces)

- Space blocks aggregate activity per space
- Branch fracturing is per-space
- Manual forking creates new space (different from branch fracture)

### 11.4 SPEC_07 (Content Distribution)

- Content blobs stored in content layer
- Content blocks reference blobs by hash
- Decay of content block orphans associated blobs

---

## 12. Open Questions

### 12.1 To Resolve

1. **Engagement difficulty**: Is the engage difficulty low enough for niche content to stay alive, yet high enough to price out storage abuse?
2. **Decay cycle alignment**: How should the engagement cadence line up with the content decay half-life?

### 12.2 For Prototyping

1. **Branch fracture threshold**: The 50MB fracture threshold is the current value — is it optimal for storage vs. locality?
2. **Formation threshold**: The 30 PoW-second root-block threshold — does it give the right chain cadence under real activity?

---

## 13. References

- SPEC_02_CONTENT_DECAY.md: Content decay mechanics
- SPEC_03_PROOF_OF_WORK.md: PoW algorithm and parameters
- SPEC_04_SPACES.md: Space organization
- SPEC_07_CONTENT_DISTRIBUTION.md: Content blob storage
- VISION.md: Swimchain design principles
- Bitcoin Whitepaper: Original block chain architecture

---

## 14. Changelog

### Version 1.1.0 (2025-12-25)
- **Branch Management (Section 5) implemented:** Milestone 1.7 delivered all 6 deliverables
- **New module:** `src/branch/` (manager.rs, metadata.rs, storage.rs, error.rs)
- **Key features:**
  - Hash-based branch assignment for new posts via `BranchPath::direction_at()`
  - Parent-anchored reply placement via thread lookup
  - Automatic fracturing at 50MB threshold (configurable)
  - Binary split algorithm preserving thread integrity
  - 5 new sled trees: branch_metadata, thread_branch_index, space_branch_state, thread_size, branch_thread_index
  - Cross-branch engagement resolution
- **Test coverage:** 13 integration tests + 375 library tests passing
- **Benchmarks:** `benches/branching.rs` (fracture overhead, lookup performance, insert throughput)
- **Documentation:** `docs/branch-management.md`, `docs/auto-fracture.md`

### Version 1.0.0 (2025-12-25)
- **Status changed:** Draft → Implemented
- **Implementation complete:** Milestone 1.5 delivered all 7 deliverables
- **Module location:** `src/blocks/` (content_block.rs, space_block.rs, root_block.rs, branch_path.rs, validation.rs)
- **Test coverage:** 21 integration tests passing
- **Key validations:**
  - PoW aggregation verified; engagement is individual (each reset is one full-cost proof, so Sybils multiply cost)
  - Parent-anchored threading via BranchPath::for_reply()
  - Genesis block with zero prev_hash and height=0
  - Chain validation at all three levels (content, space, root)
- **Documentation:** `docs/recursive-blocks.md`, `docs/block-production.md`, `docs/chain-validation.md`

### Version 0.1.0 (2024-12-25)
- Initial draft specification

---

*Specification Version: 1.1.0*
*Last Updated: 2025-12-25*
*Authors: Swimchain Protocol Team*
