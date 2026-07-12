# Protocol Specification: Content & Decay System (Drift)

Content drifts downstream without engagement. Stop swimming, start sinking.

## Status: IMPLEMENTED (Milestone 1.3)

## Version: 0.4.1

## 1. Overview

### 1.1 Purpose

The Content & Decay System defines how content is structured, stored, persisted, and automatically expired within Swimchain. Like objects in water, content drifts away without effort to keep it afloat. It implements "organic moderation" - a mechanism where community engagement determines content persistence rather than human moderators or algorithmic curation.

This system serves dual purposes:
1. **Storage Management**: Bounds chain size to enable full-node participation on consumer hardware
2. **Organic Moderation**: Delegates content persistence decisions to collective community attention

### 1.1.1 Two-Layer Architecture

**IMPORTANT:** Swimchain uses a hybrid architecture (see VISION.md):

| Layer | What It Stores | This Spec Covers |
|-------|----------------|------------------|
| **Authoritative (Chain)** | Post metadata, PoW proofs, signatures, **content hashes** | ✅ Yes |
| **Content (P2P)** | Actual media files (images, large text) | See SPEC_07 |

**Key Insight:** The chain is small because it only stores post records (~500 bytes each), not the actual content blobs. Content blobs are fetched on-demand from peers (like BitTorrent).

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONTENT IN CHAINSOCIAL                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CHAIN RECORD (this spec)         CONTENT BLOB (SPEC_07)       │
│   ────────────────────────         ──────────────────────       │
│   {                                                              │
│     author: pubkey,                Qm7x9abc... → 500KB image    │
│     space: "tech-projects",        ├── Stored by creator        │
│     timestamp: 1703456789,         ├── Cached by viewers        │
│     pow_nonce: 847291,     ──────► └── Seeded by enthusiasts    │
│     content_hash: "Qm7x9abc...",                                │
│     signature: "sig..."                                          │
│   }                                                              │
│                                                                  │
│   SMALL (~500 bytes)               LARGE (KB to GB)             │
│   Everyone has full chain          Fetched on-demand            │
│   Decays per this spec             Availability depends on      │
│                                    seeders (SPEC_07)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Decay applies to the chain record.** When a chain record decays:
- The authoritative proof of posting is removed
- Nodes typically evict the associated content blob (no reason to keep it)
- Content becomes orphaned and gradually disappears from the network

**Content availability is separate from chain decay.** A chain record may exist (not decayed) but its content blob may be unavailable if no peers are seeding it. See SPEC_07 for content distribution.

### 1.2 Design Principles

**Organic Moderation** (THESIS_06): Decay is the moderation system. Content persists only while the community continues to engage with it, avoiding both the storage impossibility of permanent blockchains and the epistemological problem of human arbiters deciding what is true or valuable.

**Technical Necessity as Philosophy** (THESIS_06): Storage constraints transform from limitation to feature. Bounded storage enables true decentralization on consumer hardware (~128GB).

**Impermanence as Virtue** (THESIS_06): Not everything needs to be permanent. Impermanence reduces chilling effects, allows past selves to fade, and manages noise accumulation.

**Active Participation Required** (VISION.md): Users must engage to preserve content. This matches the design assumption of active, not passive, users.

**Collective Memory Management** (THESIS_06): Like oral traditions, content persists through continued engagement/retelling. The community chooses what to remember.

**Friction as Feature** (THESIS_02): The costs associated with content creation and preservation are intentional behavioral interventions, not usability failures.

**Adaptive Self-Regulation** (v0.4.0): Decay is not a fixed parameter - it adapts to meet storage targets. The system self-regulates to maintain bounded storage rather than hoping fixed parameters achieve the target.

### 1.3 Scope

**In Scope:**
- Content data structures (posts, replies, quotes)
- Decay function and timing parameters
- Interaction types that affect decay
- Pruning mechanics for decayed content
- Preservation mechanisms (community pinning, author preservation)
- Chain size implications and bounds

**Out of Scope:**
- Identity system (see SPEC_01_IDENTITY)
- Proof-of-Work mechanics (see SPEC_03_PROOF_OF_WORK)
- Space/community organization (see SPEC_04_SPACES)
- Fork mechanics (see SPEC_05_FORKS_CONSENSUS)
- Network synchronization (see SPEC_06_NETWORK_SYNC)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

| ID | Requirement | Source |
|----|-------------|--------|
| HC-01 | Content persistence MUST be determined by community engagement, not moderator decisions | THESIS_06: Argument 1 |
| HC-02 | Storage MUST remain bounded - chain cannot grow infinitely | VISION.md, THESIS_06: Argument 2 |
| HC-03 | Content MUST have a minimum persistence floor (48 hours) before decay begins | THESIS_06: Decay Mechanics |
| HC-04 | Meaningful interactions MUST reset or extend decay timer | THESIS_06: Engagement Extension |
| HC-05 | Decay MUST be automatic and protocol-enforced - no human arbiters | THESIS_06: Thesis Statement |
| HC-06 | Decayed content MUST be pruned from nodes to achieve storage goals | THESIS_06: Argument 2 |
| HC-07 | There MUST be no algorithmic amplification - engagement is organic only | THESIS_06, VISION.md |
| HC-08 | Decay calculation MUST be deterministic and calculable by any node | Decentralization requirement |
| HC-09 | Content MUST include creation timestamp for decay calculations | Technical requirement |

### 2.2 Soft Constraints (SHOULD)

| ID | Requirement | Source |
|----|-------------|--------|
| SC-01 | Decay curve SHOULD use logarithmic (half-life) model rather than linear | THESIS_06: Base Decay Rate |
| SC-02 | Engagement metrics SHOULD consider community-relative engagement for niche content | THESIS_06: Response to Counterargument 2 |
| SC-03 | Community pinning mechanism SHOULD exist for long-term value content | THESIS_06: Community Pinning |
| SC-04 | Authors SHOULD be able to self-preserve through additional PoW investment | THESIS_06: Author Preservation |
| SC-05 | Active engagement (replies, quotes) SHOULD be weighted higher than passive engagement | THESIS_06: Key Question 1 |
| SC-06 | Decay parameters SHOULD be fork-configurable | VISION.md: New Forks Can Evolve |
| SC-07 | Local archiving SHOULD remain possible even after chain decay | THESIS_06: Response to Counterargument 2 |
| SC-08 | Thread coherence SHOULD be maintained when parent content decays | THESIS_06: Key Question 5 |

### 2.3 Anti-Patterns (MUST NOT)

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| AP-01 | MUST NOT replicate algorithmic engagement-value conflation | THESIS_06: Thesis Statement |
| AP-02 | MUST NOT have permanent storage - technically infeasible and philosophically rejected | THESIS_06: Argument 2 |
| AP-03 | MUST NOT create arbitrary temporal expiration without engagement consideration | THESIS_06: Decay model distinction |
| AP-04 | MUST NOT allow trivial persistence through self-interaction without cost | VISION.md: Moderation Analysis |
| AP-05 | MUST NOT force visibility of persistent content (no feed injection) | VISION.md: persistence ≠ visibility |
| AP-06 | MUST NOT require central infrastructure for storage management | VISION.md: No Infrastructure |
| AP-07 | MUST NOT make decay appealable to a central authority | THESIS_06 |

---

## 3. Data Structures

### 3.1 Content Item (Chain Record)

The fundamental unit of content on Swimchain's authoritative chain. This is a **chain record** - it references content blobs by hash but does not contain them directly.

```
ContentItem {
    // === Identity ===
    content_id:         ContentHash      // SHA-256 hash of canonical record representation
    author_id:          PublicKey        // Ed25519 public key of author
    signature:          Signature        // Ed25519 signature over content_id

    // === Temporal ===
    created_at:         Timestamp        // Unix milliseconds, creation time
    last_engagement:    Timestamp        // Unix milliseconds, last meaningful engagement

    // === Structural ===
    content_type:       ContentType      // POST | REPLY | QUOTE
    parent_id:          ContentHash?     // Optional: parent content (for REPLY/QUOTE)
    space_id:           SpaceHash        // Space this content belongs to

    // === Content Reference (TWO-LAYER MODEL) ===
    // Short text may be inline; larger content is referenced by hash
    body_inline:        Text?            // UTF-8 text ≤1024 bytes (stored in chain)
    content_hash:       ContentHash?     // SHA-256 of content blob (for >1KB content)
    content_size:       uint32?          // Size of content blob in bytes
    content_type_mime:  MimeType?        // MIME type of content blob

    // === Legacy/Compatibility ===
    media_refs:         MediaRef[]       // Optional: additional media references (deprecated, use content_hash)

    // === Proof of Work ===
    pow_nonce:          uint64           // Nonce that satisfies PoW requirement
    pow_difficulty:     uint8            // Difficulty level met

    // === Decay State ===
    engagement_count:   uint32           // Count of meaningful engagements
    pin_state:          PinState?        // Optional: community or author pin
    preservation_pow:   uint64?          // Optional: additional PoW for preservation
}
```

**Two-Layer Content Model:**

| Content Size | Storage | Field Used |
|--------------|---------|------------|
| ≤1024 bytes | Inline in chain | `body_inline` |
| >1024 bytes | Content layer (SPEC_07) | `content_hash` |

For content >1KB:
- `body_inline` is null
- `content_hash` points to the actual content blob
- Clients fetch the blob from peers using SPEC_07 protocol
- If no peers have the blob, content is "unavailable" (but record exists)

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | ContentHash (32 bytes) | Deterministically computed from canonical serialization |
| `author_id` | PublicKey (32 bytes) | Author's Ed25519 public key |
| `signature` | Signature (64 bytes) | Author's signature proving ownership |
| `created_at` | Timestamp (8 bytes) | Creation time, must be within acceptable clock skew |
| `last_engagement` | Timestamp (8 bytes) | Updated when meaningful engagement occurs |
| `content_type` | uint8 | Enumerated: 0=POST, 1=REPLY, 2=QUOTE |
| `parent_id` | ContentHash? (32 bytes) | Required for REPLY/QUOTE, null for POST |
| `space_id` | SpaceHash (32 bytes) | The space containing this content |
| `body` | Text (variable) | UTF-8 text, maximum 4096 bytes |
| `media_refs` | MediaRef[] | Array of content-addressed media references |
| `pow_nonce` | uint64 | PoW solution nonce |
| `pow_difficulty` | uint8 | Achieved difficulty level |
| `engagement_count` | uint32 | Tracks number of meaningful engagements |
| `pin_state` | PinState? | Optional pinning information |
| `preservation_pow` | uint64? | Optional additional PoW for author preservation |

**Invariants:**
- `content_id` MUST equal `SHA256(canonical_serialize(content))` excluding `content_id` field
- `signature` MUST be valid Ed25519 signature of `content_id` by `author_id`
- `created_at` MUST be within ±5 minutes of receiving node's local time
- `last_engagement` MUST be >= `created_at`
- If `content_type` is REPLY or QUOTE, `parent_id` MUST be non-null
- `body` MUST be valid UTF-8 and <= 4096 bytes
- `pow_nonce` MUST satisfy PoW difficulty requirement for the content type

### 3.2 Content Types

```
enum ContentType {
    POST  = 0x00,    // Top-level content in a space
    REPLY = 0x01,    // Response to existing content
    QUOTE = 0x02     // Reference to existing content with commentary
}
```

**Behavioral Differences:**

| Type | PoW Cost | Creates Thread | Extends Parent Decay |
|------|----------|----------------|---------------------|
| POST | Standard (30s target) | Yes | N/A |
| REPLY | Reduced (15s target) | No | Yes |
| QUOTE | Standard (30s target) | Yes | Yes |

### 3.3 Media Reference

```
MediaRef {
    media_hash:     ContentHash    // SHA-256 of media content
    media_type:     MediaType      // MIME type category
    size_bytes:     uint32         // Size in bytes
    inline_preview: bytes?         // Optional: small preview (max 1KB)
}
```

**Supported Media Types:**
```
enum MediaType {
    IMAGE_JPEG  = 0x01,
    IMAGE_PNG   = 0x02,
    IMAGE_GIF   = 0x03,
    IMAGE_WEBP  = 0x04
}
```

**Constraints:**
- Maximum 4 media references per content item
- Maximum image size: 500KB per item (compressed), max dimension 2048px
- Media is content-addressed and stored off-chain
- Nodes MAY refuse to store/propagate media

### 3.4 Pin State

```
PinState {
    pin_type:       PinType        // AUTHOR | COMMUNITY
    pin_created:    Timestamp      // When pin was created
    pin_expiry:     Timestamp?     // Optional: when pin expires
    pin_cost:       uint64         // PoW or stake cost paid
}

enum PinType {
    AUTHOR    = 0x01,    // Author self-preservation
    COMMUNITY = 0x02     // Community governance pin
}
```

### 3.5 Engagement Record

**IMPORTANT: ALL engagement costs PoW.** Engagement is not free - it requires computational work. Each engagement is an individual proof.

```
EngagementRecord {
    content_id:     ContentHash    // Content being engaged with
    engager_id:     PublicKey      // Who engaged
    engagement_type: EngagementType
    timestamp:      Timestamp
    signature:      Signature

    // PoW proof
    pow_nonce:      uint64         // PoW solution nonce
    pow_difficulty: uint8          // Difficulty met (ENGAGE minimum)
}

enum EngagementType {
    REPLY   = 0x01,    // Weight: 1.0 - Created reply (has own PoW cost)
    QUOTE   = 0x02,    // Weight: 1.0 - Quoted content (has own PoW cost)
    ENGAGE  = 0x03     // Engagement proof that resets the decay timer
}
```

**Engagement Economics:**

| Type | Individual PoW | Decay Effect |
|------|----------------|--------------|
| REPLY | ~15s (action cost) | Resets decay (reply itself persists) |
| QUOTE | ~30s (action cost) | Resets decay (quote is separate content) |
| ENGAGE | ~5s (action cost) | Resets decay on a single valid proof |

**Note on Views:** Views are NOT tracked as engagement. This is a deliberate design decision to ensure passive consumption does not preserve content. Only active participation counts.

**Note on Engagement PoW:** Each ENGAGE action is an individual proof bound to the target content (see SPEC_03 Section 7). A single valid proof immediately resets the content's decay timer. Keeping a piece of content alive costs one engagement proof per decay cycle, forever.

### 3.6 Decay State (Computed)

Decay state is not stored but computed on-demand:

```
DecayState {
    content_id:       ContentHash
    age_seconds:      uint64           // Current time - created_at
    time_since_engagement: uint64      // Current time - last_engagement
    half_lives_elapsed: float64        // time_since_engagement / HALF_LIFE
    survival_probability: float64      // 0.5 ^ half_lives_elapsed
    is_decayed:       bool             // survival_probability < DECAY_THRESHOLD
    is_protected:     bool             // Within floor period or pinned
}
```

---

## 4. Algorithms

### 4.1 Decay Function

**Purpose:** Determine whether content has decayed based on engagement history.

**Model:** Logarithmic decay using half-life mechanics.

**Parameters:**
```
DECAY_FLOOR_SECONDS     = 172800     // 48 hours - minimum persistence
HALF_LIFE_SECONDS       = 604800     // 7 days - time to 50% decay probability
DECAY_THRESHOLD         = 0.0625     // 6.25% - below this, content is considered decayed
                                     // (equivalent to 4 half-lives without engagement)
```

**Algorithm:**

```
function calculate_decay_state(content: ContentItem, current_time: Timestamp) -> DecayState:
    age = current_time - content.created_at

    // Check floor protection
    if age < DECAY_FLOOR_SECONDS:
        return DecayState {
            is_decayed: false,
            is_protected: true,
            survival_probability: 1.0,
            ...
        }

    // Check pin protection
    if content.pin_state != null:
        if content.pin_state.pin_expiry == null or current_time < content.pin_state.pin_expiry:
            return DecayState {
                is_decayed: false,
                is_protected: true,
                survival_probability: 1.0,
                ...
            }

    // Calculate decay based on time since last engagement
    time_since_engagement = current_time - content.last_engagement

    // Subtract floor period from decay calculation
    effective_decay_time = max(0, time_since_engagement - DECAY_FLOOR_SECONDS)

    half_lives_elapsed = effective_decay_time / HALF_LIFE_SECONDS
    survival_probability = pow(0.5, half_lives_elapsed)

    is_decayed = survival_probability < DECAY_THRESHOLD

    return DecayState {
        content_id: content.content_id,
        age_seconds: age,
        time_since_engagement: time_since_engagement,
        half_lives_elapsed: half_lives_elapsed,
        survival_probability: survival_probability,
        is_decayed: is_decayed,
        is_protected: false
    }
```

**Decay Timeline Example (no engagement after posting):**

| Days Since Post | Half-Lives | Survival Probability | Status |
|-----------------|------------|---------------------|--------|
| 0-2 | 0 | 100% | Protected (floor) |
| 2 | 0 | 100% | Floor ends, decay begins |
| 9 | 1 | 50% | First half-life |
| 16 | 2 | 25% | Second half-life |
| 23 | 3 | 12.5% | Third half-life |
| 30 | 4 | 6.25% | **DECAYED** (below threshold) |

**Complexity:** O(1) - constant time calculation

### 4.1.1 Adaptive Decay (Storage-Targeted)

**CRITICAL (v0.4.0):** The 7-day half-life is not fixed - it adapts to meet storage targets. This prevents two failure modes:

1. **Fixed decay too slow**: Network activity higher than expected → storage explodes past target
2. **Fixed decay too fast**: Network activity lower than expected → content dies unnecessarily

**The Core Insight:** Rather than asking "will 30-day decay fit in 500MB?", the system asks "what decay rate maintains 500MB?"

**Storage Target Parameters:**
```
TARGET_STORAGE_BYTES     = 524288000    // 500MB default per user
MIN_HALF_LIFE_SECONDS    = 86400        // 1 day - even at high load, minimum content life
MAX_HALF_LIFE_SECONDS    = 2592000      // 30 days - even at low load, content eventually decays
ADAPTATION_INTERVAL      = 3600         // 1 hour - how often to recalculate
ADAPTATION_SMOOTHING     = 0.1          // Prevent oscillation (10% adjustment per interval)
```

**Adaptive Half-Life Calculation:**
```
function calculate_adaptive_half_life(node_state: NodeState) -> uint64:
    current_storage = node_state.total_chain_storage_bytes
    target_storage = node_state.target_storage_bytes  // Default: 500MB

    // Calculate storage pressure
    // > 1.0 means over budget, < 1.0 means under budget
    storage_pressure = current_storage / target_storage

    // Current half-life (starts at default 7 days)
    current_half_life = node_state.current_half_life_seconds

    // Calculate target half-life based on pressure
    if storage_pressure > 1.0:
        // Over budget: decrease half-life (faster decay)
        // Exponential response to pressure
        adjustment_factor = 1.0 / storage_pressure
        target_half_life = current_half_life * adjustment_factor
    else:
        // Under budget: increase half-life (slower decay)
        // More conservative when relaxing
        adjustment_factor = 1.0 + (1.0 - storage_pressure) * 0.5
        target_half_life = current_half_life * adjustment_factor

    // Apply bounds
    target_half_life = clamp(target_half_life, MIN_HALF_LIFE_SECONDS, MAX_HALF_LIFE_SECONDS)

    // Smooth transition to prevent oscillation
    new_half_life = current_half_life + (target_half_life - current_half_life) * ADAPTATION_SMOOTHING

    return round(new_half_life)
```

**Example Scenarios:**

| Current Storage | Target | Pressure | Effect |
|-----------------|--------|----------|--------|
| 750MB | 500MB | 1.5 | Half-life decreases (faster decay) |
| 500MB | 500MB | 1.0 | Half-life stable |
| 300MB | 500MB | 0.6 | Half-life increases (slower decay) |
| 1GB | 500MB | 2.0 | Half-life drops significantly |

**Storage Attack Resistance:**

The 30-day fixed decay window was vulnerable to "stale storage attacks" - an attacker could post garbage that sits around for a month even after being fractures away. Adaptive decay responds:

```
Attacker floods space with 200MB garbage
├── Storage pressure jumps to 1.4 (700MB / 500MB)
├── Half-life adapts: 7 days → 5 days
├── Cold content decays faster
├── Attacker's garbage decays in ~20 days, not 30
├── System returns to equilibrium
└── Attacker paid full PoW for shorter persistence
```

**Fracturing vs. Decay:**

These mechanisms serve different purposes and work together:

| Mechanism | What It Does | When It Helps |
|-----------|--------------|---------------|
| **Fracturing** | Splits spaces so you only sync relevant branches | Reduces sync burden, not storage |
| **Adaptive Decay** | Adjusts content lifetime to meet storage target | Reduces storage directly |

**Fracturing + Decay interaction:**
- Fracturing isolates cold branches (you don't sync them)
- But content IN your branches still occupies storage
- Adaptive decay ensures content in YOUR branches fits YOUR target
- Result: bounded storage regardless of network-wide activity

**Node-Local Adaptation:**

Each node adapts independently based on its own storage:
- Power user with 2TB SSD: sets target to 5GB, enjoys long half-life
- Mobile user with 128GB phone: sets target to 200MB, sees faster decay
- Both participate equally, but storage/persistence tradeoff differs

This is NOT consensus-breaking because:
- Decay state is computed locally for display purposes
- Pruning is local (nodes prune their own storage)
- Consensus only cares about PoW validity, not decay timing
- Content "exists" if any node has it, regardless of local decay settings

**Complexity:** O(1) - runs periodically with simple arithmetic

### 4.1.2 Spam-Flagged Decay

Content that crosses the spam-flag threshold (see SPEC_12) decays on an accelerated half-life of 4 hours instead of the normal 7-day half-life. The accelerated half-life drives both display decay and the prune loop: flagged content fades from view and is removed from node storage far faster than normal content.

```
SPAM_HALF_LIFE_SECONDS = 14400   // 4 hours - accelerated half-life for spam-flagged content
```

A valid counter-attestation clears the spam flag and restores the normal half-life, returning the content to standard decay timing. This lets the community correct false flags without moderators, and it applies to both the display curve and the prune loop.

### 4.2 Engagement Processing

**Purpose:** Update content decay state when meaningful engagement occurs.

**All engagement requires PoW.** The processing differs by engagement type:

**Input:**
- `content`: ContentItem being engaged with
- `engagement`: EngagementRecord

**Output:** Updated ContentItem

**Steps:**

```
function process_engagement(
    content: ContentItem,
    engagement: EngagementRecord
) -> ContentItem:

    // 1. Validate engagement PoW
    if not validate_engagement_pow(engagement):
        return REJECT

    // 2. A single valid proof resets the decay timer, regardless of type
    match engagement.engagement_type:

        REPLY | QUOTE:
            // These have their own PoW cost and create new content
            // They reset parent's decay as a side effect
            content.engagement_count += 1
            content.last_engagement = engagement.timestamp
            return content

        ENGAGE:
            // Individual engagement proof - resets decay immediately
            content.engagement_count += 1
            content.last_engagement = engagement.timestamp
            return content

function validate_engagement_pow(engagement: EngagementRecord) -> bool:
    // All engagement requires PoW proof
    // Verify: H(nonce || content_hash || prev_block) < difficulty
    return verify_pow(
        engagement.pow_nonce,
        engagement.content_id,
        current_block_hash(),
        get_engage_difficulty()
    )
```

**Self-Engagement Economics:**

Self-engagement is allowed - it just costs the same as anyone else:

```
// Self-engagement ALLOWED but COSTS full engagement PoW
if engagement.engager_id == content.author_id:
    // Author computes a full engagement proof per reset
    // No free ride, no special treatment
    // Just expensive self-persistence
```

**Rationale:** Self-engagement is allowed because it is pointless to do cheaply. Each reset costs a full engagement proof regardless of identity, so sockpuppets only multiply your cost. The economic disincentive replaces any identity-based block.

**Complexity:** O(1)

**Edge Cases:**
- **Self-engagement:** Allowed but costs a full engagement proof per reset. No economic advantage.
- **Engagement on decayed content:** Not allowed. Content must be non-decayed to receive engagement.
- **Replayed proofs:** A replayed engagement proof is rejected; each reset requires a fresh proof bound to current chain state.

### 4.3 Deterministic Decay Evaluation

**Purpose:** All nodes must agree on decay state at any given time.

**Requirement:** Decay evaluation must be deterministic given content state and evaluation time.

```
function evaluate_decay_consensus(content: ContentItem, block_time: Timestamp) -> bool:
    // Use block time for consensus, not local node time
    state = calculate_decay_state(content, block_time)
    return state.is_decayed
```

**Block Time:** Decay evaluation for consensus purposes uses the timestamp of the block being validated, not the local node's current time. This ensures all nodes agree.

### 4.4 Content Pruning

**Purpose:** Remove decayed content from node storage.

**Trigger:** Pruning runs periodically (recommended: every 6 hours) or when storage exceeds threshold.

**Algorithm:**

```
function prune_decayed_content(node_storage: Storage, current_time: Timestamp):
    pruned_count = 0

    // 1. Iterate through stored content
    for content in node_storage.iterate_content():
        decay_state = calculate_decay_state(content, current_time)

        // 2. Check if content should be pruned
        if decay_state.is_decayed and not decay_state.is_protected:
            // 3. Check for dependent content (orphan handling)
            if has_non_decayed_children(content):
                // Mark as "tombstone" rather than full delete
                node_storage.mark_tombstone(content.content_id)
            else:
                // Full removal
                node_storage.delete(content.content_id)

            pruned_count += 1

    return pruned_count

function has_non_decayed_children(content: ContentItem) -> bool:
    children = find_content_referencing(content.content_id)
    for child in children:
        if not calculate_decay_state(child, current_time()).is_decayed:
            return true
    return false
```

**Tombstone Record:**
```
Tombstone {
    content_id:     ContentHash    // Original content ID
    tombstone_time: Timestamp      // When tombstoned
    author_id:      PublicKey      // Preserved for attribution
    summary_hash:   ContentHash    // Hash of first 256 bytes for reference
}
```

**Complexity:** O(n) where n is total stored content. Should be run off-peak.

### 4.5 Author Preservation

**Purpose:** Allow authors to extend their content's lifespan through additional PoW investment.

**Mechanism:** Author submits a preservation proof with additional PoW.

```
PreservationProof {
    content_id:     ContentHash
    author_id:      PublicKey
    pow_nonce:      uint64
    pow_difficulty: uint8          // Must be >= PRESERVATION_DIFFICULTY
    extension_days: uint8          // Days to extend (1-30)
    signature:      Signature
}

PRESERVATION_DIFFICULTY = 20       // Higher than standard post difficulty
MAX_PRESERVATION_DAYS = 30         // Maximum extension per proof
MAX_TOTAL_PRESERVATION = 365       // Maximum cumulative preservation

function apply_preservation(content: ContentItem, proof: PreservationProof) -> ContentItem:
    // 1. Validate proof
    if not validate_preservation_proof(proof):
        return REJECT

    // 2. Verify author ownership
    if proof.author_id != content.author_id:
        return REJECT

    // 3. Check cumulative preservation limit
    current_preservation = content.preservation_pow or 0
    if current_preservation >= MAX_TOTAL_PRESERVATION * SECONDS_PER_DAY:
        return REJECT  // Maximum preservation reached

    // 4. Apply extension
    extension_seconds = proof.extension_days * SECONDS_PER_DAY

    // Extend last_engagement forward
    content.last_engagement = max(
        content.last_engagement,
        current_time() + extension_seconds
    )

    // Track cumulative preservation
    content.preservation_pow = current_preservation + extension_seconds

    return content
```

**Cost Scaling:** Each subsequent preservation for the same content requires 2x the PoW difficulty, preventing indefinite preservation without substantial ongoing investment.

### 4.6 Community-Relative Engagement Weighting

**Purpose:** Prevent niche content in small, engaged communities from being unfairly disadvantaged compared to content in large, passive communities. This directly addresses THESIS_06's concern about "replicating algorithmic conflation of popularity with value."

**Problem Statement:** A post in a 50-person niche community with 10 engaged replies represents high community value, while a post in a 10,000-person community with 10 replies represents low relative engagement. Raw engagement counts would unfairly advantage the large community.

**Approach:** Engagement Density Normalization

```
function calculate_effective_engagement(content: ContentItem) -> float:
    // 1. Get space context
    space = get_space(content.space_id)

    // 2. Calculate space engagement baseline
    // Average engagements per content item in this space over last 30 days
    space_avg_engagement = space.rolling_engagement_average

    // 3. Calculate space activity level
    // Posts per day in this space (activity indicator)
    space_activity = space.posts_per_day_average

    // 4. Calculate engagement density
    // How does this content's engagement compare to space average?
    if space_avg_engagement > 0:
        engagement_density = content.engagement_count / space_avg_engagement
    else:
        engagement_density = 1.0  // New spaces default to neutral

    // 5. Apply normalization with bounds
    // Clamp to prevent extreme outliers from gaming
    MIN_DENSITY = 0.1
    MAX_DENSITY = 10.0
    clamped_density = clamp(engagement_density, MIN_DENSITY, MAX_DENSITY)

    // 6. Calculate effective engagement for decay purposes
    // Higher density = engagement counts more toward decay prevention
    effective_weight = 1.0 + log2(clamped_density)

    return content.engagement_count * effective_weight
```

**Space Metrics Required:**
```
SpaceEngagementMetrics {
    rolling_engagement_average: float  // 30-day rolling average engagements per post
    posts_per_day_average: float       // 30-day rolling average posts per day
    last_calculated: Timestamp         // When metrics were last updated
}
```

**Calculation Frequency:** Space metrics are recalculated daily to prevent gaming while remaining responsive to community changes.

**Example Scenarios:**

| Scenario | Raw Engagement | Space Avg | Density | Effective Weight | Result |
|----------|----------------|-----------|---------|------------------|--------|
| Niche: 10 replies, avg 5 | 10 | 5 | 2.0 | 2.0 | Decay extended significantly |
| Large: 10 replies, avg 100 | 10 | 100 | 0.1 | 0.1 | Decay continues normally |
| Average: 10 replies, avg 10 | 10 | 10 | 1.0 | 1.0 | Neutral (no adjustment) |

**Integration with Decay:** The effective engagement weight is applied when determining whether engagement resets the decay timer:

```
function should_reset_decay_timer(content: ContentItem, engagement: EngagementRecord) -> bool:
    base_weight = get_engagement_weight(engagement.engagement_type)
    effective_engagement = calculate_effective_engagement(content)

    // In high-density scenarios, even a single ENGAGE proof can reset timer
    // In low-density scenarios, only high-weight engagements reset
    threshold = 1.0 / (1.0 + log2(max(1.0, effective_engagement / content.engagement_count)))

    return base_weight >= threshold
```

**Anti-Gaming Considerations:**
- Rolling averages resist sudden manipulation
- Clamping prevents extreme density values
- Daily recalculation provides stability
- Self-engagement excluded before density calculation
- Suspiciously coordinated engagement patterns flagged (see Section 7)

**Open Implementation Details:**
- Exact rolling average window (30 days proposed)
- Minimum space age before metrics apply
- New space bootstrapping behavior

### 4.7 Community Pinning

**Purpose:** Allow community governance to preserve content of perceived long-term value.

**Mechanism:** Requires supermajority approval through governance process (see SPEC_04_SPACES for governance details).

```
CommunityPin {
    content_id:     ContentHash
    space_id:       SpaceHash
    pin_type:       COMMUNITY
    approval_count: uint32         // Number of approving members
    approval_threshold: uint32     // Required threshold (e.g., 2/3 majority)
    stake_locked:   uint64         // Collective stake/PoW locked
    duration_days:  uint16         // Pin duration (max 365 days)
    signatures:     Signature[]    // Approving member signatures
}

MAX_PINS_PER_SPACE = 100           // Limit pinned content per space
MIN_PIN_STAKE = STANDARD_POW * 10  // Minimum collective cost

function apply_community_pin(content: ContentItem, pin: CommunityPin) -> ContentItem:
    // 1. Validate pin
    if not validate_community_pin(pin):
        return REJECT

    // 2. Verify content belongs to space
    if content.space_id != pin.space_id:
        return REJECT

    // 3. Check space pin limit
    if count_pins_in_space(pin.space_id) >= MAX_PINS_PER_SPACE:
        return REJECT

    // 4. Apply pin
    content.pin_state = PinState {
        pin_type: COMMUNITY,
        pin_created: current_time(),
        pin_expiry: current_time() + (pin.duration_days * SECONDS_PER_DAY),
        pin_cost: pin.stake_locked
    }

    return content
```

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x20 | CONTENT_NEW | New content item broadcast |
| 0x21 | CONTENT_GET | Request specific content by ID |
| 0x22 | CONTENT_DATA | Content item response |
| 0x23 | CONTENT_NOT_FOUND | Content not found or decayed |
| 0x24 | ENGAGEMENT_NEW | New engagement broadcast |
| 0x25 | PRESERVATION_NEW | Author preservation proof |
| 0x26 | COMMUNITY_PIN | Community pin request |
| 0x27 | CONTENT_SYNC | Bulk content sync request |
| 0x28 | CONTENT_SYNC_RESP | Bulk content sync response |
| 0x29 | DECAY_QUERY | Query decay state |
| 0x2A | DECAY_RESP | Decay state response |

### 5.2 Message Formats

**CONTENT_NEW (0x20):**
```
[1 byte:  message_type = 0x20]
[4 bytes: payload_length]
[variable: ContentItem (serialized)]
```

**CONTENT_GET (0x21):**
```
[1 byte:  message_type = 0x21]
[32 bytes: content_id]
```

**CONTENT_DATA (0x22):**
```
[1 byte:  message_type = 0x22]
[4 bytes: payload_length]
[variable: ContentItem (serialized)]
[8 bytes: decay_state (survival_probability as float64)]
```

**CONTENT_NOT_FOUND (0x23):**
```
[1 byte:  message_type = 0x23]
[32 bytes: content_id]
[1 byte:  reason]  // 0x00 = not found, 0x01 = decayed, 0x02 = pruned
```

**ENGAGEMENT_NEW (0x24):**
```
[1 byte:  message_type = 0x24]
[variable: EngagementRecord (serialized)]
```

**CONTENT_SYNC (0x27):**
```
[1 byte:  message_type = 0x27]
[32 bytes: space_id]
[8 bytes: since_timestamp]
[4 bytes: max_items]
```

**CONTENT_SYNC_RESP (0x28):**
```
[1 byte:  message_type = 0x28]
[4 bytes: item_count]
[variable: ContentItem[] (serialized array)]
[1 byte:  has_more]  // 0x00 = no, 0x01 = yes
```

### 5.3 Content Serialization

ContentItem canonical serialization (for hashing and wire format):

```
function canonical_serialize(content: ContentItem) -> bytes:
    buffer = ByteBuffer()

    // Fixed fields in order
    buffer.write_bytes(content.author_id, 32)
    buffer.write_uint64_be(content.created_at)
    buffer.write_uint8(content.content_type)

    // Optional parent_id
    if content.parent_id != null:
        buffer.write_uint8(0x01)
        buffer.write_bytes(content.parent_id, 32)
    else:
        buffer.write_uint8(0x00)

    buffer.write_bytes(content.space_id, 32)

    // Variable body with length prefix
    body_bytes = utf8_encode(content.body)
    buffer.write_uint16_be(body_bytes.length)
    buffer.write_bytes(body_bytes)

    // Media references
    buffer.write_uint8(content.media_refs.length)
    for ref in content.media_refs:
        buffer.write_bytes(ref.media_hash, 32)
        buffer.write_uint8(ref.media_type)
        buffer.write_uint32_be(ref.size_bytes)

    // PoW
    buffer.write_uint64_be(content.pow_nonce)
    buffer.write_uint8(content.pow_difficulty)

    return buffer.bytes()
```

**Note on Excluded Fields:** The canonical serialization deliberately excludes:
- `content_id` - Derived from the serialization itself
- `signature` - Applied after content_id is computed
- `last_engagement` - Mutable state, not part of content identity
- `engagement_count` - Derived from EngagementRecord processing, node-local count
- `pin_state` - Separate protocol message (PinState), not intrinsic to content

These fields are either computed, mutable, or derived from other protocol messages. They are not part of the canonical content representation used for hashing or consensus.

---

## 6. Validation Rules

### 6.1 Content Validation

**Structural Validation:**
- `content_id` equals SHA256 of canonical serialization
- `signature` is valid Ed25519 signature of `content_id` by `author_id`
- `content_type` is valid enum value (0, 1, or 2)
- `body` is valid UTF-8 and <= 4096 bytes
- `media_refs` has <= 4 entries
- If `content_type` is REPLY or QUOTE, `parent_id` MUST be present and reference existing content

**Temporal Validation:**
- `created_at` within ±5 minutes of node's local time
- `created_at` <= current time (no future dating)
- `last_engagement` >= `created_at`

**PoW Validation:**
- `pow_nonce` satisfies difficulty requirement for `content_type`
- Difficulty meets minimum for content type (see SPEC_03)

**Space Validation:**
- `space_id` references valid, non-decayed space
- Author has permission to post in space (if space has restrictions)

### 6.2 Engagement Validation

**Structural Validation:**
- `content_id` references existing, non-decayed content
- `signature` is valid for `engager_id`
- `engagement_type` is valid enum value
- `pow_nonce` satisfies minimal engagement PoW

**Behavioral Validation:**
- `timestamp` within ±5 minutes of node's local time
- Each engagement proof is bound to current chain state; replayed proofs are rejected

### 6.3 Preservation Validation

**Author Preservation:**
- `author_id` matches content's author
- PoW difficulty >= PRESERVATION_DIFFICULTY
- Cumulative preservation <= MAX_TOTAL_PRESERVATION
- Content is not yet decayed

**Community Pin:**
- `space_id` matches content's space
- Approval count >= approval threshold
- All signatures are valid
- Space pin count < MAX_PINS_PER_SPACE
- Stake meets minimum requirement

### 6.4 Pruning Validation

Nodes MAY prune content that:
- Has `is_decayed` = true
- Is not protected by pin
- Has been decayed for >= 24 hours (grace period for sync)

Nodes MUST retain tombstones for content with non-decayed children until children decay.

---

## 7. Security Considerations

### 7.1 Threat Model

**Decay Gaming Attacks:**
| Threat | Description | Impact |
|--------|-------------|--------|
| Self-interaction spam | Attacker keeps content alive via self-engagement | Medium - wastes attacker resources |
| Bot engagement farms | Automated accounts providing engagement | High - could keep arbitrary content alive |
| Sybil engagement | Multiple identities engaging same content | Low - each identity pays full engagement PoW; work only multiplies |

**Storage Attacks:**
| Threat | Description | Impact |
|--------|-------------|--------|
| Content flood | Create maximum content to consume storage | Medium - bounded by PoW and decay |
| Slow decay via pinning | Abuse pinning to preserve unwanted content | Medium - limited pins, costs stake |
| Orphan creation | Create deep reply chains, let parents decay | Low - tombstones handle |

**Manipulation Attacks:**
| Threat | Description | Impact |
|--------|-------------|--------|
| Timestamp manipulation | Fake timestamps to extend life | Low - clock skew limits |
| Selective propagation | Nodes refuse to propagate to cause decay | Medium - community defense |

### 7.2 Mitigations

**Anti-Gaming Measures:**

1. **Self-engagement costs full PoW:** Engagement from the content author is allowed but costs a full engagement proof per reset, exactly like anyone else. Sockpuppets only multiply the cost, so there is no cheap self-persistence.

2. **Engagement PoW:** Every engagement requires minimal PoW. This makes bot farms economically expensive:
   ```
   Cost to keep content alive indefinitely:
   = engagement_pow_cost * engagements_needed_per_half_life
   = continuous resource expenditure against entropy
   ```

3. **Sybil resistance:** Identity creation requires PoW (see SPEC_01). Creating engagement farm identities has significant computational cost.

4. **No algorithmic reward:** Keeping content alive artificially gains nothing - no feed injection, no trending, no amplification. Attacker fights entropy for zero algorithmic return.

**Storage Protection:**

1. **Decay bounds storage:** At equilibrium, chain size = `post_rate * average_lifetime * average_size`
   - With 10,000 posts/day, 30-day average life, 1KB average size:
   - Equilibrium size ≈ 300 MB (highly manageable)

2. **Pin limits:** MAX_PINS_PER_SPACE prevents unlimited preservation. Pins require stake/cost.

3. **Tombstones are small:** When content decays but has children, only minimal tombstone preserved.

**Timestamp Protection:**

1. **Clock skew limit:** ±5 minutes maximum. Content with future timestamps is rejected.

2. **Monotonic validation:** `last_engagement` >= `created_at` always.

3. **Block time for consensus:** Decay evaluation uses block timestamps for determinism.

---

## 8. Privacy Considerations

### 8.1 Data Exposure

**Publicly Visible:**
- Content body and metadata
- Author public key (pseudonymous)
- Creation and engagement timestamps
- Engagement counts and types
- Decay state (computed)

**Not Tracked:**
- Views/reads (deliberately excluded from engagement)
- IP addresses at protocol level
- Device information
- Reading patterns

### 8.2 Data Protection

**Decay as Privacy Feature:**
Content decays and is pruned. Unlike permanent platforms:
- Past statements eventually disappear
- No permanent searchable archive on-chain
- "Right to be forgotten" implemented automatically

**Local Archiving:**
- Users CAN maintain personal archives
- Protocol does not prevent local storage
- Re-posting decayed content requires new PoW

**Re-posting Decayed Content:**
- Decayed content can be re-posted as new content by any user
- Re-posting requires full PoW (same as new POST)
- New content receives new content_id and fresh decay timer
- No protocol-level connection between original and re-post
- Client applications MAY implement "resurrection" UI patterns

**Author Pseudonymity:**
- No real-name requirements
- Consistent pseudonymous identity possible
- Identity not linked to content after decay + pruning

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency | Description |
|-----------|------------|-------------|
| Identity (SPEC_01) | Author verification | Validate author signatures, prevent Sybil |
| PoW (SPEC_03) | Content creation cost | Enforce posting costs, validate proofs |
| Spaces (SPEC_04) | Content organization | Validate space membership, apply space rules |
| Network (SPEC_06) | Chain propagation | Sync chain records across nodes |
| Forks (SPEC_05) | Fork-specific parameters | Decay parameters may vary by fork |
| **Content Distribution (SPEC_07)** | **Blob storage** | **Store/retrieve content blobs for >1KB content** |

### 9.1.1 Content Layer Integration

When a chain record is created with content >1KB:
1. Content blob is stored in the content layer (SPEC_07)
2. Chain record contains `content_hash` pointing to blob
3. Chain record is gossiped via SPEC_06
4. Content blob is seeded by creator, cached by viewers

When a chain record decays:
1. Chain record is pruned (this spec)
2. Content blob becomes orphaned (no chain record references it)
3. Nodes evict orphaned blobs (SPEC_07)
4. Content effectively disappears from network

**Content Unavailable vs. Record Decayed:**

| Scenario | Chain Record | Content Blob | User Experience |
|----------|--------------|--------------|-----------------|
| Normal | Exists | Available | Full content displayed |
| No seeders | Exists | Unavailable | "Content unavailable - no seeders" |
| Decayed | Pruned | Evicted | Post doesn't exist in listings |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `create_content(content) -> ContentHash` | Create new content | Client applications |
| `get_content(content_id) -> ContentItem?` | Retrieve content | Client applications, other nodes |
| `get_decay_state(content_id) -> DecayState` | Query decay status | Client applications |
| `process_engagement(engagement) -> Result` | Record engagement | Client applications |
| `apply_preservation(proof) -> Result` | Author preservation | Client applications |
| `apply_community_pin(pin) -> Result` | Community pinning | Space governance |
| `prune_decayed() -> PruneStats` | Trigger pruning | Node maintenance |
| `sync_content(space_id, since) -> ContentItem[]` | Bulk sync | Node synchronization |

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Phase 1: Core Decay**
1. Implement ContentItem structure with all required fields
2. Implement deterministic decay calculation
3. Implement basic engagement processing (REPLY, QUOTE only)
4. Implement pruning with tombstone support

**Phase 2: Preservation**
1. Add author preservation with PoW verification
2. Add ENGAGE engagement type
3. Implement preservation cost scaling

**Phase 3: Community Pinning**
1. Integrate with space governance (after SPEC_04)
2. Implement pin limits and expiry
3. Add pin management UI

**Storage Recommendations:**
- Use embedded database (SQLite, LevelDB) for content storage
- Index by: content_id, space_id, created_at, last_engagement
- Periodic compaction after pruning
- Consider separate storage for media references

**Performance Recommendations:**
- Cache decay calculations (invalidate on engagement)
- Batch pruning operations
- Use background thread for pruning
- Lazy evaluation of decay state for query responses

### 10.2 Known Challenges

**Challenge 1: Cross-node Decay Agreement**
- Problem: Nodes may have slightly different views of decay state due to clock drift
- Mitigation: Use block timestamps for consensus-critical decisions; allow grace periods

**Challenge 2: Orphan Thread Coherence**
- Problem: Parent decays, children persist - broken conversation context
- Mitigation: Tombstones preserve minimal context; clients should indicate [parent decayed]

**Challenge 3: Fork Parameter Divergence**
- Problem: Forks may have different decay parameters; cross-fork content references unclear
- Mitigation: Content references include fork ID; decay parameters embedded in fork genesis

**Challenge 4: Media Decay**
- Problem: Media is off-chain; when does it get pruned?
- Mitigation: Media pruning follows referencing content; track media reference counts

**Challenge 5: Engagement Gaming Detection**
- Problem: Distinguishing organic engagement from coordinated gaming
- Mitigation: Community-relative engagement weighting; suspicious pattern detection at client layer

---

## 11. Test Vectors

### 11.1 Decay Calculation

**Test Case: Basic Decay Timeline**

```
Input:
  created_at: 1704067200000 (2024-01-01 00:00:00 UTC)
  last_engagement: 1704067200000 (same as created)
  current_time: 1706832000000 (2024-02-02 00:00:00 UTC, +32 days)

Expected:
  age_seconds: 2764800 (32 days)
  time_since_engagement: 2764800
  effective_decay_time: 2592000 (32 days - 2 day floor = 30 days)
  half_lives_elapsed: 4.29 (30 days / 7 days)
  survival_probability: 0.051 (< 6.25%)
  is_decayed: true
```

**Test Case: Engagement Resets Decay**

```
Input:
  created_at: 1704067200000 (2024-01-01 00:00:00 UTC)
  last_engagement: 1706400000000 (2024-01-28 00:00:00 UTC, day 27)
  current_time: 1706832000000 (2024-02-02 00:00:00 UTC)

Expected:
  time_since_engagement: 432000 (5 days)
  effective_decay_time: 0 (within floor after engagement)
  half_lives_elapsed: 0
  survival_probability: 1.0
  is_decayed: false
```

**Test Case: Floor Protection**

```
Input:
  created_at: 1704067200000 (2024-01-01 00:00:00 UTC)
  last_engagement: 1704067200000
  current_time: 1704153600000 (2024-01-02 00:00:00 UTC, +1 day)

Expected:
  age_seconds: 86400 (1 day < 2 day floor)
  is_protected: true
  is_decayed: false
  survival_probability: 1.0
```

### 11.2 Content Serialization

**Test Case: Minimal POST**

```
Input:
  author_id: 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20
  created_at: 1704067200000
  content_type: POST (0x00)
  parent_id: null
  space_id: 0x2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40
  body: "Hello, Swimchain!"
  media_refs: []
  pow_nonce: 12345678
  pow_difficulty: 16

Expected content_id (SHA256 of canonical serialization):
  0x[computed hash - implementation specific]
```

### 11.3 Engagement Processing

**Test Case: Self-Engagement Allowed**

```
Input:
  content.author_id: 0xAABB...
  content.last_engagement: T
  engagement.engager_id: 0xAABB... (same)
  engagement.type: ENGAGE
  engagement.timestamp: T + 86400
  (valid engagement PoW attached)

Expected:
  last_engagement: T + 86400 (reset to engagement time)
  engagement_count: +1
  Result: decay timer reset; author paid full engagement PoW
```

**Test Case: Valid Engagement**

```
Input:
  content.author_id: 0xAABB...
  content.last_engagement: T
  engagement.engager_id: 0xCCDD... (different)
  engagement.type: REPLY
  engagement.timestamp: T + 86400

Expected:
  last_engagement: T + 86400 (reset to engagement time)
  engagement_count: +1
```

---

## 12. Open Questions

### 12.1 Resolved by This Specification

| Question | Resolution |
|----------|------------|
| What's the decay function? | Logarithmic half-life model, 7-day half-life, 48-hour floor |
| What counts as interaction? | REPLY, QUOTE, ENGAGE (each a single valid proof resets decay); NOT views |
| Can content be preserved? | Yes: author PoW (max 365 days) or community pin (governance) |
| How is decayed content pruned? | Periodic pruning, tombstones for parents with live children |
| Community-relative engagement weighting? | Engagement density normalization (see Section 4.6): content engagement compared to space average, with logarithmic scaling and bounds clamping |

### 12.2 Remaining Open Questions

| Question | Notes |
|----------|-------|
| How does decay interact with forks? | If content is forked, does decay state copy? Reset? Does engagement on one fork extend life on another? Depends on SPEC_05. |
| What are exact PoW difficulty values? | Specified as targets (30s, 15s) but exact difficulty numbers depend on SPEC_03 and hardware benchmarking. |
| How are media references stored/synced? | Content-addressed, but exact off-chain storage protocol TBD. |
| Thread decay coupling? | Current spec: independent decay with tombstones. Alternative: cascade decay with parent. Needs UX testing. |
| Cross-fork content references? | Can QUOTE reference content on another fork? If so, what if source decays on original fork? |
| Replay protection for engagements? | How to prevent replaying old engagements? Timestamp checks help but may not be sufficient. Potential solutions: sequence numbers per engager, or nonce-based uniqueness checks. |

---

## 13. References

### Thesis Documents
- **THESIS_06_DECAY.md**: Content decay is organic moderation without moderators; engagement determines persistence; technical necessity becomes philosophical feature
- **THESIS_02_FRICTION.md**: PoW delays create intentional friction; 10-60 second delays are behavioral interventions, not usability failures

### Vision Document
- **VISION.md**: Decay prevents infinite chain growth; content without engagement fades naturally; storage is bounded; no algorithm

### Related Specifications
- SPEC_01_IDENTITY.md: Author identity and pseudonymity
- SPEC_03_PROOF_OF_WORK.md: PoW mechanics for content creation and preservation
- SPEC_04_SPACES.md: Space organization and governance (for community pinning)
- SPEC_05_FORKS_CONSENSUS.md: Fork mechanics and parameter inheritance
- SPEC_06_NETWORK_SYNC.md: Chain synchronization for post records
- **SPEC_07_CONTENT_DISTRIBUTION.md: BitTorrent-like content blob storage (NEW)**

### External References
- Tim Wu, "The Attention Merchants" - attention economy context
- Yves Citton, "The Ecology of Attention" - collective attention theory
- Tarleton Gillespie, "Custodians of the Internet" - moderation impossibility

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-25*
*Status: IMPLEMENTED - Core decay engine implemented in Milestone 1.3*

**Changelog:**
- v0.4.1 (2025-12-25): **IMPLEMENTED** in Milestone 1.3. Core decay engine with adaptive decay, engagement tracking, pruning with tombstone support. 156 unit tests. Some features deferred: SC-02 (community-relative engagement) to Phase 2, SC-03 (community pinning) to Phase 3, SC-04 (author preservation) fields added but full implementation Phase 2.
- v0.4.0 (2025-12-25): **MAJOR: Adaptive decay.** Half-life is no longer fixed - it adapts to meet storage targets. Prevents stale storage attacks where fixed 30-day decay allows garbage to persist too long. Added Section 4.1.1 with storage-targeted decay algorithm. MIN_HALF_LIFE=1day, MAX_HALF_LIFE=30days. Per-node adaptation based on local storage pressure.
- v0.3.0 (2024-12-25): ALL engagement requires PoW. Each engagement is an individual proof that resets the decay timer. Self-engagement allowed but costs full engagement PoW. Integrated with SPEC_08 recursive blocks.
- v0.2.0 (2024-12-24): Added two-layer architecture, SPEC_07 integration
