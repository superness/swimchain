# Protocol Specification: Anti-Abuse Mechanisms

## Status: DRAFT

## Version: 0.3.0

## Depends On
- SPEC_02 (Decay): Content decay mechanics
- SPEC_09 (Social Layer): Swimmer levels and hosting contribution
- SPEC_11 (Sponsorship & Credits): Identity creation and credit system

---

## 1. Overview

### 1.1 Purpose

This specification defines mechanisms to protect the Swimchain network from abuse without introducing central moderation authority. It formalizes the protocol's response to spam, harassment, and illegal content through community-driven attestation rather than platform moderation.

Key functions:
1. **Content type restrictions** - Text and images only, no video
2. **Community-driven spam detection** - Resident-level attestation system
3. **Accelerated decay** - Faster content expiration for attested content
4. **Attack economics** - Making abuse expensive through layered friction
5. **Client-side moderation guidance** - Recommended filtering approaches

The system implements *accelerated ephemerality, not moderation*. Content is never deleted by authority; it is accelerated toward its natural end by community consensus.

### 1.2 Design Philosophy

**Core Principles from Thesis Documents:**

1. **Transparency over neutrality** (THESIS_10): Perfect content neutrality is philosophically incoherent. Any system where humans view content is a system where humans respond to content. Attestation-driven decay brings inevitable community response inside the protocol where it is visible, auditable, and governed.

2. **Friction is the defense** (THESIS_09, VISION.md): Abuse is made expensive, not prohibited. Cost structures deter bad actors without requiring authority to judge content.

3. **Hosting as stake** (THESIS_09): Attestation power flows from infrastructure contribution. Those who host the most have the most to lose from network degradation.

4. **The judges are judged** (THESIS_10): Attesters put their reputation on the line. Bad-faith attestation patterns become visible and costly.

5. **Fork as escape valve** (THESIS_10): If attestation abuse becomes systematic, communities can fork. Ultimate check on any abuse mechanism.

6. **Acceleration, not removal** (THESIS_10): Content is accelerated toward natural death, not executed. A window exists for viewing, replication, and counter-action.

**Philosophical Tension Acknowledged:**

This specification acknowledges the inherent tension between community response and protocol neutrality. We choose transparent community judgment over the fiction of neutrality because:
- Community response happens regardless of protocol support
- External coordination, blocking, and migration occur anyway
- Making response explicit and auditable is more honest than pretending it doesn't happen

### 1.3 Scope

**In Scope:**
- Content type validation and restrictions
- Spam attestation mechanism
- Accelerated decay triggering
- Poster reputation tracking
- Attack scenario defenses
- Client-side moderation recommendations
- Wire protocol for attestation messages
- Blocklist synchronization protocol
- Fork-as-exit implementation guidance

**Out of Scope:**
- Content moderation decisions (no protocol authority)
- Subjective quality judgments (only spam/abuse)
- Historical content archiving (decay is final)
- Cross-fork reputation (fork-specific by default)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

1. **No central moderation authority** - All moderation emerges from protocol rules and community action. There is no entity to contact for takedowns or censorship decisions.

2. **Attestation requires Resident-level status** - Minimum 30 days identity age AND 10GB+ bandwidth served lifetime to attest. This eliminates drive-by accounts.

3. **Three independent attestations trigger acceleration** - 3 Resident-level attesters from different sponsor trees must agree. Attestations from the same sponsor tree count as 1.

4. **Accelerated decay is 4-hour half-life** - Flagged content decays faster but is not deleted. Content still exists during shortened lifetime and remains visible to anyone who looks.

5. **All attestations recorded permanently** - Who attested, when, against what content, with what reason. Fully transparent and auditable.

6. **Hosting is the work, not posting** - Network capacity scales with community because users ARE infrastructure. Per THESIS_09.

7. **Attack capability requires months of sustained hosting** - No pre-mined attack potential. Ongoing contribution required during any attack.

8. **No video content** - Video is permanently excluded from the protocol. Storage economics and moderation complexity make video incompatible with bounded design.

9. **Attestation propagation requirements** - Attestations MUST reach 90% of active nodes within 30 minutes of creation. Nodes MUST prioritize attestation gossip over content gossip.

### 2.2 Soft Constraints (SHOULD)

1. **Attestation reasons provided** - Attesters SHOULD specify a reason from the enumerated categories to make patterns visible and analyzable.

2. **Counter-attestation mechanism** - 5 Lifeguard+ counter-attestations SHOULD cancel a spam flag, allowing recovery from false positives.

3. **Attestation capacity limited** - Attesters SHOULD be limited to 10 attestations per day to force prioritization.

4. **Media gating by swimmer level** - Images SHOULD require Resident level (30 days, 10GB hosted) to post.

5. **Reputation recovery over time** - Users flagged for spam SHOULD be able to recover through sustained good behavior.

6. **Client-side filtering** - Clients SHOULD implement blocking, space migration, and ignore lists as additional layers.

7. **Counter-attester incentive** - Counter-attesters SHOULD receive a small reputation bonus (+3) for successful counter-attestations to incentivize defense of false positives.

### 2.3 Anti-Patterns (MUST NOT)

1. **No deletion** - Content MUST NOT be removed instantly. Always accelerated decay, not removal.

2. **No anonymous attestation** - All attestations MUST be tied to identifiable accounts. Attester reputation is at stake.

3. **No free attestation** - Attestation MUST require status (Resident level), computational cost (PoW), and limited capacity (rate limits).

4. **No Sybil attestation attacks** - Attestations from the same sponsor tree MUST count as 1, not N. Three attesters must be from different sponsor tree roots.

5. **No cheap suppression campaigns** - Cost structure MUST prevent using attestation as a censorship tool. Minimum 270 account-days investment for coordinated suppression.

6. **No central authority for illegal content** - Hash blocklists for CSAM/terrorism are distributed, not human-moderated. Protocol-level blocking, not platform decision.

7. **No persistence without ongoing cost** - Spam MUST require continuous resource expenditure. No "set and forget" attack vectors.

---

## 3. Data Structures

### 3.1 ContentType

```rust
enum ContentType {
    Text,           // All swimmer levels
    Link,           // All levels (rendered as plain text)
    Image,          // Resident+ only (Level 2+)
    // Video intentionally not supported - see §2.1.8
}

const MAX_TEXT_LENGTH: usize = 10_000;        // ~10KB per post
const MAX_IMAGE_SIZE: usize = 500_000;        // 500KB
const MAX_IMAGE_DIMENSION: u32 = 2048;        // pixels (width or height)
const ALLOWED_IMAGE_FORMATS: &[&str] = &["jpeg", "png", "webp"];
```

**Invariants:**
- Text posts MUST NOT exceed MAX_TEXT_LENGTH bytes
- Images MUST NOT exceed MAX_IMAGE_SIZE bytes
- Image dimensions MUST NOT exceed MAX_IMAGE_DIMENSION on either axis
- Image format MUST be one of ALLOWED_IMAGE_FORMATS

### 3.2 SpamAttestation

```rust
struct SpamAttestation {
    content_hash: [u8; 32],      // Hash of content being attested
    attester: PublicKey,         // 32-byte Ed25519 public key
    reason: SpamReason,          // Category of spam
    timestamp: u64,              // Unix timestamp (seconds)
    pow_nonce: u64,              // Proof-of-work nonce (attestation cost)
    signature: [u8; 64],         // Ed25519 signature over all fields
}

enum SpamReason {
    Advertising     = 0x01,      // Commercial spam, product promotion
    Repetitive      = 0x02,      // Same content repeated multiple times
    OffTopic        = 0x03,      // Content clearly misplaced in space
    Harassment      = 0x04,      // Targeting individuals
    IllegalContent  = 0x05,      // CSAM, terrorism content (triggers blocklist)
}
```

**Fields:**
- `content_hash`: SHA-256 hash of the content being flagged
- `attester`: Public key of the attesting identity
- `reason`: Enumerated reason for attestation
- `timestamp`: When attestation was created (Unix seconds)
- `pow_nonce`: Proof-of-work demonstrating computational cost
- `signature`: Cryptographic signature proving attester authorization

**Invariants:**
- Attester MUST be Resident level or higher at time of attestation
- Attester identity age MUST be >= 30 days
- Attester lifetime bandwidth served MUST be >= 10GB
- Signature MUST be valid over (content_hash || attester || reason || timestamp || pow_nonce)
- pow_nonce MUST produce hash with leading zeros >= ATTESTATION_POW_DIFFICULTY

### 3.3 CounterAttestation

```rust
struct CounterAttestation {
    content_hash: [u8; 32],      // Hash of content being defended
    counter_attester: PublicKey, // 32-byte Ed25519 public key
    original_attestations: Vec<[u8; 32]>, // Hashes of attestations being countered
    timestamp: u64,
    pow_nonce: u64,
    signature: [u8; 64],
}
```

**Invariants:**
- Counter-attester MUST be Lifeguard level or higher (Level 3+)
- Counter-attester MUST have >= 50GB/month bandwidth served
- Counter-attester uptime MUST be >= 70%
- 5 valid counter-attestations cancel the spam flag

### 3.4 PosterReputation

```rust
struct PosterReputation {
    identity: PublicKey,
    spam_flags_received: u32,       // Total spam attestations received
    spam_flags_countered: u32,      // Flags that were successfully countered
    illegal_content_flags: u32,     // Should be 0 for normal operation
    quality_attestations: u32,      // Positive signals (future extension)
    attester_countered_count: u32,  // Times this identity's attestations were countered
    counter_attestation_successes: u32, // Times this identity successfully counter-attested
    identity_age_days: u32,
    last_spam_flag_at: u64,         // For recovery calculation
    last_counter_success_at: u64,   // When counter-attestation succeeded (for fast recovery)
    cached_score: i32,              // Cached reputation score
}
```

**Invariants:**
- Score MUST be recalculated when any field changes
- illegal_content_flags > 0 results in permanent minimum score

### 3.5 AttestationStore

```rust
struct StoredAttestations {
    content_hash: [u8; 32],
    attestations: Vec<SpamAttestation>,
    counter_attestations: Vec<CounterAttestation>,
    accelerated_decay_triggered: bool,
    flag_cancelled: bool,
    first_attestation_at: u64,
    threshold_reached_at: Option<u64>,
    counter_threshold_reached_at: Option<u64>,
}
```

**Invariants:**
- accelerated_decay_triggered becomes true when 3 independent attestations received
- flag_cancelled becomes true when 5 Lifeguard+ counter-attestations received
- Once flag_cancelled is true, accelerated_decay_triggered has no effect

### 3.6 BlocklistEntry

```rust
struct BlocklistEntry {
    content_hash: [u8; 32],
    reason: BlocklistReason,
    attestations: Vec<SpamAttestation>,
    added_at: u64,
    source_node: PublicKey,         // Node that first reported
    propagation_confirmations: u32, // Nodes that confirmed receipt
}

enum BlocklistReason {
    CSAM = 0x01,
    Terrorism = 0x02,
    ExternalList = 0x03,            // From known external databases (e.g., NCMEC)
}
```

---

## 4. Algorithms

### 4.1 Attestation Validation

**Purpose:** Verify that a spam attestation meets all requirements before acceptance.

**Input:** `attestation: SpamAttestation`

**Output:** `Result<(), AttestationError>`

**Steps:**

1. Verify signature:
   ```
   message = content_hash || attester || reason || timestamp || pow_nonce
   if !verify_ed25519(attester, message, signature):
       return Err(InvalidSignature)
   ```

2. Verify attester status:
   ```
   attester_info = get_identity_info(attester)
   if attester_info.swimmer_level < SwimmerLevel::Resident:
       return Err(InsufficientLevel)
   if attester_info.age_days < 30:
       return Err(IdentityTooYoung)
   if attester_info.lifetime_bandwidth_served_gb < 10:
       return Err(InsufficientHostingContribution)
   ```

3. Verify proof-of-work:
   ```
   hash = sha256(message || pow_nonce)
   if leading_zeros(hash) < ATTESTATION_POW_DIFFICULTY:
       return Err(InsufficientPoW)
   ```

4. Verify rate limit:
   ```
   today_attestations = count_attestations_today(attester)
   if today_attestations >= MAX_SPAM_ATTESTATIONS_PER_DAY:
       return Err(RateLimitExceeded)
   ```

5. Verify not self-attestation:
   ```
   content_author = get_content_author(content_hash)
   if content_author == attester:
       return Err(CannotSelfAttest)
   ```

6. Verify not attesting against sponsor chain:
   ```
   attester_sponsors = get_sponsor_chain(attester)
   content_author_sponsors = get_sponsor_chain(content_author)
   if attester in content_author_sponsors or content_author in attester_sponsors:
       return Err(CannotAttestSponsorChain)
   ```

7. `return Ok(())`

**Complexity:** O(d) where d is sponsor chain depth (typically < 10)

**Edge Cases:**
- Attester identity revoked during processing: Reject attestation
- Content already fully decayed: Accept but no effect
- Timestamp in future: Reject if > 5 minutes ahead

### 4.2 Sybil Deduplication

**Purpose:** Ensure attestations from the same sponsor tree count as 1, preventing Sybil attestation attacks.

**Input:** `attestations: Vec<SpamAttestation>`

**Output:** `Vec<SpamAttestation>` (deduplicated)

**Steps:**

1. Initialize sponsor tree roots set:
   ```
   seen_roots: HashSet<PublicKey> = HashSet::new()
   result: Vec<SpamAttestation> = Vec::new()
   ```

2. For each attestation, find sponsor tree root:
   ```
   for attestation in attestations:
       root = find_sponsor_tree_root(attestation.attester)
       if root not in seen_roots:
           seen_roots.insert(root)
           result.push(attestation)
   ```

3. `return result`

**Helper: find_sponsor_tree_root**
```
fn find_sponsor_tree_root(identity: PublicKey) -> PublicKey:
    current = identity
    while get_sponsor(current) is Some(sponsor):
        current = sponsor
    return current
```

**Complexity:** O(n * d) where n is attestation count, d is max sponsor chain depth

**Edge Cases:**
- Orphaned identity (no sponsor): Identity is its own root
- Multiple attestations from different branches of same tree: Only first counts
- Attestation order matters: First seen from each tree is kept

### 4.3 Accelerated Decay Calculation

**Purpose:** Determine effective half-life for content based on attestation status.

**Input:** `content_hash: [u8; 32]`

**Output:** `u64` (half-life in seconds)

**Steps:**

1. Get attestation store:
   ```
   store = get_attestation_store(content_hash)
   ```

2. Check if flagged and not cancelled:
   ```
   if store.flag_cancelled:
       return adaptive_half_life()  // Normal decay per SPEC_02

   if store.accelerated_decay_triggered:
       return FLAGGED_DECAY_HALF_LIFE_SECS  // 4 hours = 14400 seconds
   ```

3. Check if threshold reached:
   ```
   deduplicated = deduplicate_attestations(store.attestations)
   if len(deduplicated) >= SPAM_ATTESTATION_THRESHOLD:
       store.accelerated_decay_triggered = true
       store.threshold_reached_at = now()
       return FLAGGED_DECAY_HALF_LIFE_SECS
   ```

4. `return adaptive_half_life()`

**Complexity:** O(n * d) for deduplication

**Edge Cases:**
- Content author revoked for illegal content: Immediate removal (see §4.4)
- Counter-attestation arrives after decay started: Stops further acceleration but doesn't restore
- Content already mostly decayed: Acceleration still applies to remaining availability

### 4.4 Illegal Content Handling

**Purpose:** Handle content matching known illegal hashes (CSAM, terrorism).

**Input:** `content_hash: [u8; 32]`, `illegal_attestation: SpamAttestation` (reason = IllegalContent)

**Output:** `Result<(), Error>`

**Steps:**

1. Verify attestation is for illegal content:
   ```
   if illegal_attestation.reason != SpamReason::IllegalContent:
       return Err(NotIllegalContentAttestation)
   ```

2. Check against distributed blocklist:
   ```
   if content_hash in DISTRIBUTED_BLOCKLIST:
       // Known illegal - immediate action
   else if count_illegal_attestations(content_hash) >= 3:
       // Threshold reached - add to blocklist
       add_to_local_blocklist(content_hash)
       broadcast(BlocklistUpdate { hash: content_hash })
   else:
       // Below threshold - treat as normal attestation for now
       return process_normal_attestation(illegal_attestation)
   ```

3. Remove from local storage:
   ```
   storage.delete(content_hash)
   blocklist.add(content_hash)
   ```

4. Apply sponsor consequences:
   ```
   author = get_content_author(content_hash)
   author_info = get_identity_info(author)
   author_info.illegal_content_flags += 1
   // Sponsor consequences per SPEC_11
   trigger_illegal_content_consequences(author)
   ```

5. Broadcast blocklist update:
   ```
   broadcast(BlocklistUpdate {
       hash: content_hash,
       reason: BlocklistReason::IllegalContent,
       attestations: get_attestations(content_hash)
   })
   ```

6. `return Ok(())`

**Complexity:** O(1) for blocklist check, O(log n) for blocklist update

**Edge Cases:**
- False positive on blocklist: Counter-attestation mechanism applies but requires Anchor level (Level 4+) for illegal content reversals
- Blocklist hash collision: Cryptographically negligible with SHA-256

### 4.5 Reputation Score Calculation

**Purpose:** Calculate an identity's reputation score based on their history.

**Input:** `reputation: PosterReputation`

**Output:** `i32` (reputation score)

**Steps:**

```rust
fn calculate_reputation_score(rep: &PosterReputation) -> i32 {
    // Base score
    let base: i32 = 100;

    // Age bonus: +1 per day, max 365
    let age_bonus = min(rep.identity_age_days, 365) as i32;

    // Quality bonus: +5 per quality attestation
    let quality_bonus = (rep.quality_attestations * 5) as i32;

    // Counter success bonus: +3 per successful counter-attestation made
    let counter_success_bonus = (rep.counter_attestation_successes * 3) as i32;

    // Counter bonus: +15 per successful counter (false flags against you)
    let counter_bonus = (rep.spam_flags_countered * 15) as i32;

    // Spam penalty: -20 per spam flag received
    let spam_penalty = (rep.spam_flags_received * 20) as i32;

    // Attester penalty: -30 per time your attestations were countered
    let attester_penalty = (rep.attester_countered_count * 30) as i32;

    // Illegal content penalty: -1000 per flag (devastating)
    let illegal_penalty = (rep.illegal_content_flags * 1000) as i32;

    // Recovery bonus: +1 per day since last spam flag, max 90
    let days_since_flag = (now() - rep.last_spam_flag_at) / SECONDS_PER_DAY;
    let recovery_bonus = min(days_since_flag, 90) as i32;

    // Fast recovery for counter-attested flags: immediate +10 per counter
    let fast_recovery = (rep.spam_flags_countered * 10) as i32;

    base + age_bonus + quality_bonus + counter_bonus + counter_success_bonus
        + recovery_bonus + fast_recovery
        - spam_penalty - attester_penalty - illegal_penalty
}
```

**Complexity:** O(1)

**Edge Cases:**
- Negative score: Clamped at -1000 minimum
- Overflow: Use saturating arithmetic
- New identity: Starts at 100 + age_bonus

**Recovery Mechanics:**

When a spam flag is successfully counter-attested:
1. **Immediate recovery**: +10 points per counter-attested flag (via `fast_recovery`)
2. **Standard recovery**: +1 point/day continues to accrue
3. **Net effect**: A wrongly flagged user (losing 20 points) regains 10 immediately when countered, then 1/day for remaining recovery

This addresses the concern that false positives take too long to recover from.

### 4.6 Blocklist Gossip Protocol

**Purpose:** Synchronize illegal content blocklists across nodes without central authority.

**Input:** `update: BlocklistUpdate`

**Output:** Network-wide blocklist synchronization

**Protocol Steps:**

1. **Initial broadcast:**
   ```
   When node receives 3 illegal content attestations for hash:
       create BlocklistUpdate message
       sign with node identity
       broadcast to all connected peers
   ```

2. **Peer validation:**
   ```
   When node receives BlocklistUpdate:
       verify all attestation signatures
       verify attesters are Resident+ level
       verify 3 unique sponsor tree roots
       if valid:
           add to local blocklist
           increment propagation_confirmations
           forward to peers not yet seen
   ```

3. **Convergence check:**
   ```
   Blocklist entry is considered "confirmed" when:
       propagation_confirmations >= MIN_BLOCKLIST_CONFIRMATIONS (default: 10)
   ```

4. **Periodic sync:**
   ```
   Every BLOCKLIST_SYNC_INTERVAL (default: 1 hour):
       exchange blocklist checksums with peers
       request missing entries from peers with more complete lists
   ```

**Consistency Model:**
- Eventual consistency with no central authority
- Nodes MAY have temporarily different blocklists
- Convergence expected within 2 hours for well-connected network
- Nodes SHOULD NOT serve content matching their local blocklist regardless of network convergence

**Conflict Resolution:**
- If conflicting updates (add vs. remove for same hash), attestation count wins
- Removal requires Anchor-level counter-attestation (5 Anchors) for illegal content

### 4.7 Attestation Propagation

**Purpose:** Ensure attestations reach network before content decays.

**Requirements:**
- Attestations MUST propagate faster than content decay rate
- 90% of active nodes MUST receive attestation within 30 minutes
- Attestation messages have priority in gossip queue

**Protocol:**

1. **Priority queuing:**
   ```
   message_queue = PriorityQueue {
       attestations: priority = HIGH,
       blocklist_updates: priority = CRITICAL,
       content: priority = NORMAL,
       other: priority = LOW,
   }
   ```

2. **Eager propagation:**
   ```
   When valid attestation received:
       immediately forward to all connected peers
       do not wait for batch window
   ```

3. **Attestation-first sync:**
   ```
   When connecting to new peer:
       exchange attestation summaries before content
       prioritize attestation catchup
   ```

4. **Monitoring:**
   ```
   Track attestation propagation latency
   Alert if 90% threshold not met within 30 minutes
   Log propagation statistics for tuning
   ```

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x50 | MSG_SPAM_ATTESTATION | New spam attestation |
| 0x51 | MSG_COUNTER_ATTESTATION | Counter-attestation to cancel flag |
| 0x52 | MSG_QUALITY_ATTESTATION | Positive attestation (future) |
| 0x53 | MSG_REPUTATION_QUERY | Query reputation for identity |
| 0x54 | MSG_REPUTATION_RESPONSE | Response to reputation query |
| 0x55 | MSG_BLOCKLIST_UPDATE | Illegal content blocklist update |
| 0x56 | MSG_ATTESTATION_SYNC | Bulk attestation sync request |
| 0x57 | MSG_ATTESTATION_SYNC_RESPONSE | Bulk attestation sync response |
| 0x58 | MSG_BLOCKLIST_SYNC | Blocklist checksum exchange |
| 0x59 | MSG_BLOCKLIST_REQUEST | Request specific blocklist entries |

### 5.2 SpamAttestation Message Format (0x50)

```
+---------------+---------------+---------------+---------------+
| 0             | 1             | 2             | 3             |
+---------------+---------------+---------------+---------------+
| Message Type  | Reserved      | Reserved      | Reserved      |
| (0x50)        |               |               |               |
+---------------+---------------+---------------+---------------+
|                                                               |
|                     Content Hash (32 bytes)                   |
|                                                               |
+---------------+---------------+---------------+---------------+
|                                                               |
|                     Attester Pubkey (32 bytes)                |
|                                                               |
+---------------+---------------+---------------+---------------+
| Spam Reason   | Reserved      | Reserved      | Reserved      |
| (1 byte)      |               |               |               |
+---------------+---------------+---------------+---------------+
|                                                               |
|                     Timestamp (8 bytes, big-endian)           |
+---------------+---------------+---------------+---------------+
|                                                               |
|                     PoW Nonce (8 bytes, big-endian)           |
+---------------+---------------+---------------+---------------+
|                                                               |
|                     Signature (64 bytes)                      |
|                                                               |
+---------------+---------------+---------------+---------------+

Total: 148 bytes
```

### 5.3 CounterAttestation Message Format (0x51)

```
+---------------+---------------+---------------+---------------+
| Message Type  | Attestation   | Reserved      | Reserved      |
| (0x51)        | Count (1-255) |               |               |
+---------------+---------------+---------------+---------------+
|                     Content Hash (32 bytes)                   |
+---------------+---------------+---------------+---------------+
|                     Counter Attester Pubkey (32 bytes)        |
+---------------+---------------+---------------+---------------+
|                     Original Attestation Hash 1 (32 bytes)    |
+---------------+---------------+---------------+---------------+
|                     ... (repeated per attestation count)      |
+---------------+---------------+---------------+---------------+
|                     Timestamp (8 bytes)                       |
+---------------+---------------+---------------+---------------+
|                     PoW Nonce (8 bytes)                       |
+---------------+---------------+---------------+---------------+
|                     Signature (64 bytes)                      |
+---------------+---------------+---------------+---------------+

Total: 148 + (32 * attestation_count) bytes
```

### 5.4 BlocklistUpdate Message Format (0x55)

```
+---------------+---------------+---------------+---------------+
| Message Type  | Update Type   | Attestation   | Reserved      |
| (0x55)        | (add/remove)  | Count         |               |
+---------------+---------------+---------------+---------------+
|                     Content Hash (32 bytes)                   |
+---------------+---------------+---------------+---------------+
|                     Reporting Node Pubkey (32 bytes)          |
+---------------+---------------+---------------+---------------+
|                     Attestation 1 (148 bytes)                 |
|                     ...                                       |
+---------------+---------------+---------------+---------------+
|                     Timestamp (8 bytes)                       |
+---------------+---------------+---------------+---------------+
|                     Signature (64 bytes)                      |
+---------------+---------------+---------------+---------------+
```

### 5.5 BlocklistSync Message Format (0x58)

```
+---------------+---------------+---------------+---------------+
| Message Type  | Reserved      | Entry Count   | Entry Count   |
| (0x58)        |               | (high byte)   | (low byte)    |
+---------------+---------------+---------------+---------------+
|                     Blocklist Merkle Root (32 bytes)          |
+---------------+---------------+---------------+---------------+
|                     Last Update Timestamp (8 bytes)           |
+---------------+---------------+---------------+---------------+
|                     Node Signature (64 bytes)                 |
+---------------+---------------+---------------+---------------+
```

---

## 6. Validation Rules

### 6.1 Content Validation

| Rule | Check | Action on Failure |
|------|-------|-------------------|
| V1 | Text length <= 10,000 bytes | Reject content |
| V2 | Image size <= 500KB | Reject content |
| V3 | Image dimension <= 2048px | Reject content |
| V4 | Image format in [jpeg, png, webp] | Reject content |
| V5 | No video content | Reject content |
| V6 | Author is Resident+ for images | Reject content |
| V7 | Content hash not in blocklist | Reject content, do not propagate |

### 6.2 Attestation Validation

| Rule | Check | Action on Failure |
|------|-------|-------------------|
| A1 | Valid Ed25519 signature | Reject attestation |
| A2 | Attester is Resident+ (Level 2+) | Reject attestation |
| A3 | Attester age >= 30 days | Reject attestation |
| A4 | Attester bandwidth >= 10GB lifetime | Reject attestation |
| A5 | Valid PoW nonce | Reject attestation |
| A6 | Rate limit not exceeded (10/day) | Reject attestation |
| A7 | Not self-attestation | Reject attestation |
| A8 | Not attesting sponsor chain | Reject attestation |
| A9 | Reason is valid enum value | Reject attestation |
| A10 | Timestamp within acceptable range | Reject attestation |

### 6.3 Counter-Attestation Validation

| Rule | Check | Action on Failure |
|------|-------|-------------------|
| C1 | Valid Ed25519 signature | Reject counter-attestation |
| C2 | Counter-attester is Lifeguard+ (Level 3+) | Reject counter-attestation |
| C3 | Counter-attester bandwidth >= 50GB/month | Reject counter-attestation |
| C4 | Counter-attester uptime >= 70% | Reject counter-attestation |
| C5 | Referenced attestations exist | Reject counter-attestation |
| C6 | Valid PoW nonce | Reject counter-attestation |

### 6.4 Reputation Effect Thresholds

| Score Range | Effect |
|-------------|--------|
| > 200 | Trusted: content decays 1.5x slower |
| 100-200 | Normal: standard treatment |
| 50-100 | Watched: rate limits reduced 50% |
| 0-50 | Restricted: rate limits reduced 80%, new space posting blocked |
| < 0 | Untrusted: all content starts with accelerated decay |

---

## 7. Security Considerations

### 7.1 Threat Model

**Threats Addressed:**

| Threat | Severity | Defense |
|--------|----------|---------|
| Spam flooding | High | Credit cost, age gates, rate limits, attestation decay |
| Sybil attestation | High | Sponsor tree deduplication, 270 account-day cost |
| Harassment campaigns | Medium | Blocking, migration, attestation patterns visible |
| Illegal content (CSAM) | Critical | Hash blocklists, immediate removal, sponsor devastation |
| Advertiser persistence | Medium | No metrics, no targeting, economic irrationality |
| False positive suppression | Medium | Counter-attestation, attester reputation at stake, fast recovery |

**Threats Acknowledged But Not Fully Addressed:**

| Threat | Why Not Fully Addressed |
|--------|-------------------------|
| State-sponsored attackers | 270 account-days trivially achievable for state actors. 18-24 month infiltration campaigns are possible. This is an honest acknowledgment per THESIS_09. |
| Majority tyranny | If a community decides to systematically suppress viewpoints, mitigations only slow the process. Ultimate protection is fork-as-exit. |
| Patient, well-funded harassment | Persistent attacker with resources can continue. Victims may need to migrate or use filtering. |

### 7.2 Mitigations

**7.2.1 Sybil Attack Mitigation**

Problem: Attacker creates many identities to control attestation.

Defense layers:
1. Each Sybil needs unique sponsor (tree structure)
2. Each sponsor pays 50 credits per invite
3. Attestations from same sponsor tree count as 1
4. 270 account-days minimum for 3 independent attesters
5. Visible attestation patterns enable community response

**7.2.2 Attestation Abuse Mitigation**

Problem: Attestation used as censorship tool against legitimate speech.

Defense layers:
1. Counter-attestation (5 Lifeguard+ can cancel)
2. Attester reputation stake (bad attestations visible, damage reputation)
3. Limited attestation capacity (10/day)
4. Fork as ultimate exit (attestation-free forks possible)
5. Counter-attester incentive bonus (+3 reputation for successful counters)

**7.2.3 Spam Flooding Mitigation**

Problem: Automated mass posting of spam content.

Defense layers:
1. Credit cost: Each post costs 1 credit (per SPEC_11)
2. Age gates: 7-30 days before full posting
3. Rate limits: 50 posts/day, 5/space/hour
4. Cold posting: 1 post/day in new spaces
5. Spam flagging: 3 Residents trigger 4-hour decay
6. Sponsor consequence: Sponsors lose invite privileges

**Net effect:** Sustained spam requires aged identities (weeks of setup), hosting credits (real contribution), disposable sponsors willing to face consequences, and acceptance that content disappears in hours once flagged.

### 7.3 Cryptographic Requirements

- All signatures: Ed25519
- Content hashes: SHA-256
- Attestation PoW: SHA-256 with configurable leading zeros
- Blocklist hashes: SHA-256 (compatible with external databases like NCMEC)

---

## 8. Privacy Considerations

### 8.1 Data Exposed

| Data | Visibility | Retention |
|------|------------|-----------|
| Attestations | Public | Permanent |
| Attester identity | Public | Permanent |
| Attestation patterns | Public | Permanent |
| Counter-attestations | Public | Permanent |
| Reputation scores | Public (cached) | While identity exists |
| Blocklist hashes | Public | Permanent |

### 8.2 Data Protected

| Data | Protection Method |
|------|-------------------|
| Attestation reasoning beyond category | Not collected |
| Viewer behavior | Not tracked at protocol level |
| Private blocking decisions | Client-side only |
| Detailed reputation calculation | Only cached score exposed |

### 8.3 Privacy Trade-offs

The transparency requirement (all attestations recorded) conflicts with attester privacy. This is an intentional design choice:
- Attesters accept public accountability when they attest
- Hidden attestation would enable abuse without consequence
- "The judges are judged" requires visible judgment

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency |
|-----------|------------|
| SPEC_02 (Decay) | Half-life modification for flagged content |
| SPEC_09 (Social Layer) | Swimmer level verification for attestation eligibility |
| SPEC_11 (Sponsorship) | Sponsor tree traversal for Sybil deduplication |
| SPEC_11 (Credits) | Credit cost for posting (spam economics) |
| SPEC_01 (Identity) | Public key verification for signatures |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `create_attestation()` | Create new spam attestation | Clients |
| `create_counter_attestation()` | Create counter-attestation | Clients |
| `get_attestations(content_hash)` | Query attestations for content | Clients, other nodes |
| `get_reputation(identity)` | Query reputation score | Clients, other nodes |
| `check_blocklist(hash)` | Check if content is blocklisted | Storage subsystem |
| `get_effective_half_life(content)` | Get decay rate considering flags | Decay subsystem |
| `sync_blocklist(peer)` | Synchronize blocklist with peer | Network subsystem |

### 9.3 Events Emitted

| Event | Trigger | Subscribers |
|-------|---------|-------------|
| `AttestationReceived` | New valid attestation | Decay, Reputation |
| `ThresholdReached` | 3 independent attestations | Decay (accelerate) |
| `FlagCancelled` | 5 counter-attestations | Decay (restore normal) |
| `BlocklistUpdated` | Illegal content confirmed | Storage, Network |
| `ReputationChanged` | Score crossed threshold | Rate limiting |
| `CounterAttestationSuccess` | Counter-attestation threshold met | Reputation (bonus) |

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Phase 1: Content Type Enforcement**
- Implement ContentType validation
- Enforce MAX_TEXT_LENGTH, MAX_IMAGE_SIZE
- Reject all video content
- Gate images behind Resident level check

**Phase 2: Attestation Infrastructure**
- Implement SpamAttestation creation and validation
- Build attestation storage (Sled tree: `spam_attestations`)
- Implement sponsor tree traversal for deduplication
- Add rate limiting

**Phase 3: Decay Integration**
- Modify decay subsystem to query attestation status
- Implement accelerated decay (4-hour half-life)
- Add flag-cancelled handling

**Phase 4: Reputation System**
- Implement PosterReputation storage
- Add score calculation with fast recovery
- Apply reputation effects to rate limits
- Add counter-attester bonus tracking

**Phase 5: Counter-Attestation**
- Implement CounterAttestation creation and validation
- Add Lifeguard+ level verification
- Implement flag cancellation logic
- Apply reputation bonuses for successful counters

**Phase 6: Illegal Content Handling**
- Implement hash blocklist
- Add distributed blocklist updates
- Implement immediate removal for matches
- Add blocklist gossip protocol

**Phase 7: Propagation Optimization**
- Implement priority message queuing
- Add attestation propagation monitoring
- Tune for 30-minute 90% coverage target

### 10.2 Known Challenges

1. **Sponsor tree depth**: Deep trees increase deduplication cost. Consider caching tree roots.

2. **Attestation propagation**: Must ensure attestations propagate faster than content decay to be effective. Priority queuing and eager forwarding address this.

3. **Blocklist synchronization**: Distributed blocklist updates need consistency without central authority. Merkle root exchange and periodic sync provide eventual consistency.

4. **Clock skew**: Attestation timestamps vulnerable to manipulation. Use peer consensus on time.

5. **Recovery fairness**: Addressed via fast recovery (+10 immediate) for counter-attested cases, plus standard 1/day recovery.

6. **Counter-attestation incentives**: Counter-attesters now receive +3 reputation per successful counter to incentivize defense of false positives.

### 10.3 Storage Layout

```
Sled Database Trees:
├── spam_attestations
│   Key: content_hash (32 bytes)
│   Value: StoredAttestations (serialized)
│
├── identity_reputation
│   Key: identity (32 bytes)
│   Value: PosterReputation (serialized)
│
├── attestation_rate_limits
│   Key: identity || day_number (40 bytes)
│   Value: u32 (attestation count)
│
├── illegal_content_blocklist
│   Key: content_hash (32 bytes)
│   Value: BlocklistEntry (serialized)
│
├── attester_history
│   Key: attester (32 bytes)
│   Value: Vec<AttestationSummary> (serialized)
│
└── sponsor_tree_root_cache
    Key: identity (32 bytes)
    Value: root_identity (32 bytes)
```

---

## 11. Test Vectors

### 11.1 Attestation Signature Verification

**Input:**
```
content_hash: 0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
attester: 0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c
reason: 0x01 (Advertising)
timestamp: 1703980800 (2024-12-31 00:00:00 UTC)
pow_nonce: 0x0000000000123456
```

**Expected signature message (to be signed):**
```
content_hash || attester || reason || timestamp_be || pow_nonce_be
= 0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
  || 0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c
  || 0x01
  || 0x00000000658fff80
  || 0x0000000000123456
```

### 11.2 Sybil Deduplication

**Input:**
```
Attestation 1: attester=A, sponsor_chain=[A -> B -> ROOT1]
Attestation 2: attester=C, sponsor_chain=[C -> D -> ROOT1]
Attestation 3: attester=E, sponsor_chain=[E -> ROOT2]
Attestation 4: attester=F, sponsor_chain=[F -> G -> ROOT2]
Attestation 5: attester=H, sponsor_chain=[H -> ROOT3]
```

**Expected Output:**
```
Deduplicated attestations: [A, E, H]
Unique roots: [ROOT1, ROOT2, ROOT3]
Count: 3 (threshold reached)
```

### 11.3 Reputation Score Calculation

**Input:**
```
PosterReputation {
    identity_age_days: 100,
    spam_flags_received: 2,
    spam_flags_countered: 1,
    illegal_content_flags: 0,
    quality_attestations: 5,
    attester_countered_count: 0,
    counter_attestation_successes: 2,
    days_since_last_flag: 30,
}
```

**Expected Output:**
```
base = 100
age_bonus = 100 (min(100, 365))
quality_bonus = 25 (5 * 5)
counter_success_bonus = 6 (2 * 3)
counter_bonus = 15 (1 * 15)
fast_recovery = 10 (1 * 10)
recovery_bonus = 30 (min(30, 90))
spam_penalty = 40 (2 * 20)
attester_penalty = 0
illegal_penalty = 0

score = 100 + 100 + 25 + 6 + 15 + 10 + 30 - 40 - 0 - 0 = 246 (Trusted)
```

### 11.4 Content Type Validation

**Input:** Image post from NewSwimmer (Level 0)

**Expected Output:** Reject with error `InsufficientLevelForMediaType`

**Input:** Image post from Resident (Level 2), 600KB size

**Expected Output:** Reject with error `ImageSizeTooLarge`

**Input:** Video content (any level)

**Expected Output:** Reject with error `ContentTypeNotSupported`

### 11.5 Fast Recovery Scenario

**Scenario:** User wrongly flagged for spam, then counter-attested

**Initial State:**
```
PosterReputation {
    spam_flags_received: 0,
    spam_flags_countered: 0,
    cached_score: 200,
}
```

**After 2 spam flags:**
```
spam_flags_received: 2
spam_penalty: -40
cached_score: 160
```

**After 1 flag successfully counter-attested:**
```
spam_flags_countered: 1
counter_bonus: +15
fast_recovery: +10
cached_score: 185
```

**Result:** Instead of waiting 40 days to recover to original, user recovers 25 points immediately and only needs 15 days for full recovery.

---

## 12. Open Questions

### 12.1 Attestation Threshold Calibration

**Question:** Is 3 Residents the right threshold? Should it scale with space size or content visibility?

**Options:**
- Fixed 3 (current design)
- Percentage-based (e.g., 0.1% of space residents)
- Reputation-weighted (higher-rep attesters count more)

**Status:** THESIS_10 states "The right answer is empirical." Recommend starting with fixed 3 and adjusting based on observed behavior.

### 12.2 Counter-Attestation Implementation

**Question:** Should positive attestation actively counteract negative, or just cancel the flag?

**Current design:** 5 Lifeguard+ counter-attestations cancel the flag entirely. Content returns to normal decay.

**Alternative:** Counter-attestations reduce accelerated decay proportionally rather than binary cancel.

**Status:** Needs empirical testing.

### 12.3 Decay Acceleration Curve

**Question:** Is 4-hour half-life the right accelerated rate?

**Trade-offs:**
- Faster (1-hour): More responsive to abuse but less time for counter-attestation
- Slower (24-hour): More time for false positive correction but abuse persists longer

**Status:** 4 hours chosen as balance. May need adjustment.

### 12.4 Attestation Against Sponsor Chain

**Question:** Current spec prevents attesting against your own sponsors/sponsees. Is this sufficient Sybil protection?

**Concern:** Attacker could create parallel sponsor trees that aren't related.

**Possible enhancement:** More sophisticated sponsor tree analysis (common ancestors, creation timing patterns).

**Status:** Current approach is MVP. May need strengthening.

### 12.5 Reputation Portability Across Forks

**Question:** Does abuse reputation carry to new forks?

**Concern:** Attackers might fork to reset reputation.

**Options:**
- Reputation is fork-specific (clean slate on fork)
- Reputation follows identity (carry across forks)
- Configurable per fork

**Status:** Recommend fork-specific as default, with fork creators able to import reputation from parent.

### 12.6 Recovery Rate Fairness

**Question:** Is recovery rate now fair with fast recovery mechanism?

**Previous concern:** 1 point/day recovery too slow for false positives.

**Resolution:** Fast recovery (+10 immediate per counter-attested flag) plus counter-attester incentives (+3 per successful counter) address this. Counter-attested flags now recover 25 points immediately.

**Status:** ADDRESSED in v0.3.0. Monitor for effectiveness.

### 12.7 State Actor Threat Model

**Question:** Attestation-driven decay optimizes against casual abuse. What about patient, well-funded attackers?

**Honest answer from THESIS_09:** 18-24 month infiltration campaigns are possible. 270 account-days is "trivially achievable for state actors."

**Design position:** This system optimizes against the threats it can address. State-level attackers require different mitigations (network-level resistance, community awareness, fork-as-exit).

**Status:** Acknowledged limitation. Not a fixable gap in this spec.

---

## 13. Fork-as-Exit Implementation

### 13.1 Purpose

Fork provides ultimate protection against attestation abuse. If community-wide attestation becomes oppressive, dissatisfied users can create alternative networks with different rules.

### 13.2 Fork Options for Attestation

Forks MAY modify attestation rules:

| Fork Type | Attestation Change | Use Case |
|-----------|-------------------|----------|
| No attestation | Remove mechanism entirely | Free speech maximalist community |
| Higher threshold | Require 5+ attesters | More tolerance for controversial content |
| Lower threshold | Require 2 attesters | Stricter community standards |
| Different levels | Anchor-only attestation | Higher barrier to judgment |
| Weighted | Reputation-weighted attestation | Experienced users have more weight |

### 13.3 Fork Mechanics

**Data portability:**
```
Users can export:
- Their identity keypair
- Their content history
- Their social graph (follows, spaces)
- Their hosting contribution records

Users cannot export:
- Others' reputation assessments of them
- Attestations made against their content (by default)
```

**Reputation on fork:**
```
Default: Clean slate (no reputation imports)
Optional: Fork creator can enable reputation import from parent

Import considerations:
- Importing reputation also imports attestation patterns
- Users may dispute imported negative reputation
- Fork SHOULD provide dispute mechanism if importing
```

### 13.4 Fork Signaling

Users contemplating fork should:
1. Publicly announce dissatisfaction with attestation patterns
2. Document specific attestation abuse instances
3. Propose alternative rules
4. Allow community response before forking
5. Provide migration path for interested users

This maximizes fork legitimacy and community coherence.

### 13.5 Costs of Fork

Honest acknowledgment of fork costs:
- **Network effects lost**: Smaller network, less content, fewer users
- **Technical overhead**: Must run own infrastructure
- **Social capital required**: Need critical mass to be viable
- **History fragmentation**: Shared history diverges

Fork is genuine exit, not free exit. It is available but costly, which is the correct design: exit should be possible but not trivial.

---

## 14. Constants Summary

```rust
// Content Type Limits
const MAX_TEXT_LENGTH: usize = 10_000;        // 10KB
const MAX_IMAGE_SIZE: usize = 500_000;        // 500KB
const MAX_IMAGE_DIMENSION: u32 = 2048;        // pixels

// Spam Detection
const SPAM_ATTESTATION_THRESHOLD: u32 = 3;    // 3 unique Residents
const SPAM_ATTESTATION_WINDOW_SECS: u64 = 86_400;  // 24 hours
const MAX_SPAM_ATTESTATIONS_PER_DAY: u32 = 10;
const ATTESTATION_POW_DIFFICULTY: u8 = 16;    // Leading zero bits

// Counter-Attestation
const COUNTER_ATTESTATION_THRESHOLD: u32 = 5; // 5 Lifeguards
const FALSE_POSITIVE_PENALTY_THRESHOLD: u32 = 3;  // Lose attestation privilege
const COUNTER_ATTESTER_REPUTATION_BONUS: i32 = 3; // Per successful counter

// Accelerated Decay
const FLAGGED_DECAY_HALF_LIFE_SECS: u64 = 14_400;  // 4 hours

// Reputation
const REPUTATION_RECOVERY_PER_DAY: i32 = 1;
const REPUTATION_RECOVERY_MAX_DAYS: i32 = 90;
const REPUTATION_FAST_RECOVERY_PER_COUNTER: i32 = 10;
const REPUTATION_TRUSTED_THRESHOLD: i32 = 200;
const REPUTATION_NORMAL_THRESHOLD: i32 = 100;
const REPUTATION_WATCHED_THRESHOLD: i32 = 50;
const REPUTATION_RESTRICTED_THRESHOLD: i32 = 0;
const REPUTATION_MIN_SCORE: i32 = -1000;

// Attester Requirements
const MIN_ATTESTER_AGE_DAYS: u32 = 30;
const MIN_ATTESTER_BANDWIDTH_GB: u64 = 10;
const MIN_COUNTER_ATTESTER_BANDWIDTH_GB: u64 = 50;
const MIN_COUNTER_ATTESTER_UPTIME_PCT: u8 = 70;

// Propagation
const ATTESTATION_PROPAGATION_TARGET_MINS: u32 = 30;
const ATTESTATION_PROPAGATION_COVERAGE_PCT: u32 = 90;

// Blocklist
const MIN_BLOCKLIST_CONFIRMATIONS: u32 = 10;
const BLOCKLIST_SYNC_INTERVAL_SECS: u64 = 3600;  // 1 hour
```

---

## 15. References

### 15.1 Thesis Documents

- **THESIS_10: Attestation-Driven Decay** - Defines core attestation mechanism philosophy
  - §15-22: No central authority, community-driven response
  - §25-41: Content neutrality is impossible argument
  - §44-58: Acceleration vs. removal distinction
  - §66-76: Transparency and auditability requirements
  - §79-90: Cost structure to prevent casual abuse
  - §165-182: Sybil attack analysis (270 account-days)
  - §213-221: Fork as escape valve

- **THESIS_09: Hosting as Proof of Work** - Defines hosting-based participation
  - §17-18: Hosting thresholds (Swimmer, Resident, Anchor)
  - §43-54: Infrastructure symmetry
  - §59-70: Attack economics (months of contribution required)
  - §266-270: State actor limitations (18-24 month infiltration)

### 15.2 Vision Document

- **VISION.md** - Core design principles
  - "Friction over filtering": Abuse made expensive, not prohibited
  - "Decay over deletion": Bad content fades faster, not removed
  - "Exit over enforcement": Communities can migrate away
  - "No central authority": No entity to contact for takedowns

### 15.3 Related Specifications

- **SPEC_02 (Decay)**: Content decay mechanics, half-life modification interface
- **SPEC_09 (Social Layer)**: Swimmer levels, hosting verification
- **SPEC_11 (Sponsorship & Credits)**: Identity creation, sponsor trees, credit system

---

## Changelog

- v0.3.0 (2025-12-27): Enhanced based on review feedback
  - Added fast recovery mechanism for counter-attested flags (+10 immediate)
  - Added counter-attester reputation bonus (+3 per successful counter)
  - Added blocklist gossip protocol (§4.6)
  - Added attestation propagation requirements (§4.7)
  - Added fork-as-exit implementation guidance (§13)
  - Added new wire protocol messages for blocklist sync (0x58, 0x59)
  - Updated test vectors for new reputation calculation
  - Marked recovery rate fairness as ADDRESSED
- v0.2.0 (2025-12-27): Complete specification with algorithms, wire protocol, test vectors
- v0.1.0 (2025-12-26): Initial draft

---

*This specification implements accelerated ephemerality, not moderation. Content is never deleted by authority; it is accelerated toward its natural end by community consensus.*

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-27*
