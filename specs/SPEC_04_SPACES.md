# Protocol Specification: Spaces System (Lanes)

Stay in your lane. Each community is a lane in the pool.

## Status: DRAFT

## Version: 0.1.0

## 1. Overview

### 1.1 Purpose

The Spaces System defines how topic-based communities (lanes) are created, organized, and discovered within Swimchain. Spaces are the primary navigational and organizational unit—like swim lanes that separate different activities—but without central moderation authority.

**Important:** The protocol is format-agnostic. Clients can render spaces as forums, feeds, chat interfaces, or any other UX pattern. What the protocol rejects is **algorithmic curation**—users actively navigate to spaces they choose; content is not algorithmically pushed to them. This architectural choice is fundamental: it assumes active participation rather than passive consumption, and it eliminates the platform-as-curator dynamic that enables attention extraction.

Spaces also serve as **exit routes from capture**. When a community faces hostile actors or unacceptable conditions, they can migrate to a new space, taking their community with them while leaving the problem behind. This is moderation through migration rather than moderation through authority.

### 1.2 Design Principles

The following principles, derived from the thesis documents, guide this specification:

1. **Active navigation, not algorithmic feeds**: Users navigate to spaces they choose. No algorithm decides what they see. Content organization is topic-based, not engagement-based. The protocol is format-agnostic—clients may render as forums, feeds, or other UX patterns. (VISION.md)

2. **No central authority**: No entity can be contacted about space creation, modification, or takedowns. No moderators exist at the protocol level. No appeals process beyond community mechanisms. (VISION.md, THESIS_04_SAFETY.md)

3. **Spaces are escape routes**: When communities face capture or abuse, they migrate to new spaces. This is the primary moderation mechanism at the community layer. (THESIS_03_FORKS.md, THESIS_04_SAFETY.md)

4. **High creation cost**: Space creation requires significant proof-of-work, higher than posts or replies. This is a commitment filter that selects for users invested in community building. (VISION.md, THESIS_02_FRICTION.md)

5. **Protocol rules, not platform decisions**: Space behavior is determined by transparent protocol rules, not opaque curation. Like Bitcoin's fee market—deterministic physics, not editorial choices. (VISION.md)

6. **Active user assumption**: All space mechanisms assume users who actively navigate and participate. Passive consumers have Instagram; Swimchain is for participants. (VISION.md)

7. **Decay applies**: Spaces, like all content, are subject to decay. Inactive spaces fade; active spaces persist. Storage is finite; attention determines persistence. (THESIS_06_DECAY)

### 1.3 Scope

**In scope:**
- Space definition and data structures
- Space creation requirements and process
- Space discovery mechanisms (within protocol constraints)
- Space-level parameters and customization
- Space governance model (or explicit lack thereof)
- Space migration patterns
- Space-fork relationship

**Out of scope:**
- Client-side space presentation (UI/UX)
- Community-level moderation tools (client implementations)
- Specific reputation algorithms per space (client-defined)
- Cross-fork space bridging (may be addressed in fork specification)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

| ID | Requirement | Source |
|----|-------------|--------|
| SP-H01 | Spaces MUST NOT have central authority or ownership that can censor content | VISION.md, THESIS_04 |
| SP-H02 | Space creation MUST require proof-of-work higher than post creation | VISION.md, THESIS_02 |
| SP-H03 | Spaces MUST be navigable by user choice, not algorithmic discovery | VISION.md |
| SP-H04 | Spaces MUST NOT be deletable by any authority | THESIS_04 |
| SP-H05 | Identity MUST persist across space participation (same keypair) | THESIS_03, VISION.md |
| SP-H06 | Spaces MUST be subject to decay mechanics | VISION.md |
| SP-H07 | Space IDs MUST be unique within a fork (first valid creation wins) | Protocol requirement |
| SP-H08 | Space metadata MUST be signed by creator identity | Protocol requirement |
| SP-H09 | Spaces MUST function without external services or central registries | VISION.md |
| SP-H10 | Content within spaces MUST reference the space identifier | Protocol requirement |

### 2.2 Soft Constraints (SHOULD)

| ID | Requirement | Source |
|----|-------------|--------|
| SP-S01 | Spaces SHOULD support optional local parameters (PoW thresholds, etc.) | WORKSTREAMS.md |
| SP-S02 | Discovery SHOULD be user-driven (word of mouth, links, search) | VISION.md |
| SP-S03 | Space metadata SHOULD be minimal to reduce chain overhead | VISION.md |
| SP-S04 | Reputation context SHOULD be visible at space level | THESIS_04 |
| SP-S05 | Space creation SHOULD include waiting period beyond PoW | THESIS_02 |
| SP-S06 | Clients SHOULD allow users to filter by space participation patterns | THESIS_04 |
| SP-S07 | Space references SHOULD be human-readable | Usability |

### 2.3 Anti-Patterns (MUST NOT)

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| SP-A01 | MUST NOT implement algorithmic space discovery ("trending", "recommended") | VISION.md |
| SP-A02 | MUST NOT allow central space ownership with special powers | THESIS_04, THESIS_03 |
| SP-A03 | MUST NOT create platform-endorsed vs. unendorsed space tiers | VISION.md |
| SP-A04 | MUST NOT enable space takeover by external authority | THESIS_04 |
| SP-A05 | MUST NOT require identity verification for space participation | THESIS_01 |
| SP-A06 | MUST NOT make space creation free or trivial | THESIS_02 |
| SP-A07 | MUST NOT implement space-level bans at protocol level | THESIS_04 |

---

## 3. Data Structures

### 3.1 Space Identifier (SpaceID)

```
SpaceID = SHA-256(space_name_normalized || creator_pubkey || creation_timestamp)[0..16]
```

The SpaceID is a 16-byte (128-bit) identifier derived from the space's creation parameters. This provides:
- **Uniqueness**: Collision probability is negligible at expected scale
- **Determinism**: Same inputs always produce same ID
- **Verifiability**: ID can be recomputed from creation transaction

**Derivation:**
- `space_name_normalized`: Space name converted to lowercase UTF-8, whitespace trimmed
- `creator_pubkey`: 32-byte Ed25519 public key of creator
- `creation_timestamp`: 8-byte little-endian Unix timestamp

**Human-Readable Format:**
```
SpaceAddress = "sp1" + bech32m_encode(SpaceID)
// Example: "sp1qyp5jf8e4xkv0z9r3n7m6w2d5t4h8g7f6"
```

### 3.2 Space Definition

```
Space {
    id:              SpaceID           // Derived identifier (16 bytes)
    name:            string            // Human-readable name (max 64 UTF-8 bytes)
    description:     string            // Space description (max 512 UTF-8 bytes)
    creator:         IdentityID        // Public key of creator (32 bytes)
    created_at:      u64               // Unix timestamp (seconds)
    creation_pow:    CreationProof     // Proof-of-work for creation
    parameters:      SpaceParameters   // Local space parameters
    signature:       [u8; 64]          // Ed25519 signature by creator
}
```

**Fields:**
- `id`: The unique identifier for this space, derived from name + creator + timestamp
- `name`: Human-readable space name. Names are NOT unique—multiple spaces can share the same name but will have different SpaceIDs (due to different creator/timestamp). First valid space creation for a given SpaceID wins; clients SHOULD display both name and SpaceID to avoid confusion
- `description`: Brief description of space topic/purpose
- `creator`: Identity of the user who created the space
- `created_at`: When the space was created
- `creation_pow`: Proof that creator performed required computation
- `parameters`: Space-specific settings (see SpaceParameters)
- `signature`: Creator's signature over all fields except signature itself

**Invariants:**
- `id` MUST equal `SHA-256(normalize(name) || creator || created_at)[0..16]`
- `name` MUST be valid UTF-8, 1-64 bytes, not empty after normalization
- `description` MUST be valid UTF-8, 0-512 bytes
- `created_at` MUST be within acceptable time window (not future, not ancient)
- `signature` MUST be valid Ed25519 signature by `creator`
- `creation_pow` MUST meet space creation difficulty (see Section 4.1)

**Canonical Serialization for Signature:**
```
canonical_space =
    name_length (1 byte, u8) ||
    name_bytes (1-64 bytes, UTF-8) ||
    description_length (2 bytes, u16 LE) ||
    description_bytes (0-512 bytes, UTF-8) ||
    creator (32 bytes) ||
    created_at (8 bytes, u64 LE) ||
    creation_pow_serialized (see CreationProof) ||
    parameters_serialized (see SpaceParameters)
```

### 3.3 Space Creation Proof

```
SpaceCreationProof {
    space_id:      SpaceID         // The space being created
    timestamp:     u64             // Creation attempt time
    nonce:         u64             // PoW nonce
    pow_hash:      [u8; 32]        // SHA-256 result meeting difficulty
}
```

**Fields:**
- `space_id`: Identifier of the space being created
- `timestamp`: When the PoW was computed (anti-stockpiling)
- `nonce`: Value that produces valid PoW hash
- `pow_hash`: The hash that meets difficulty requirements

**Invariants:**
- `pow_hash` MUST equal `SHA-256(space_id || timestamp_le || nonce_le)`
- `pow_hash` MUST have at least SPACE_CREATION_DIFFICULTY leading zero bits (default: 22)
- `timestamp` MUST be within 24 hours of current time

### 3.4 Space Parameters

```
SpaceParameters {
    post_pow_difficulty:     u8        // PoW bits required for posts (default: inherit fork)
    reply_pow_difficulty:    u8        // PoW bits required for replies (default: inherit fork)
    decay_rate_modifier:     i8        // Adjustment to base decay rate (-10 to +10)
    min_identity_age:        u64       // Minimum identity age to post (seconds, 0 = no minimum)
    reserved:                [u8; 8]   // Reserved for future parameters
}
```

**Fields:**
- `post_pow_difficulty`: Custom PoW requirement for posts in this space. 0 = use fork default.
- `reply_pow_difficulty`: Custom PoW requirement for replies. 0 = use fork default.
- `decay_rate_modifier`: Adjusts decay rate relative to fork default. Negative = slower decay, positive = faster.
- `min_identity_age`: Minimum age of identity to participate. Enables communities to require established identities.
- `reserved`: Reserved bytes for future parameter expansion

**Invariants:**
- Difficulty values 0-32 only (0 = default, 32 = maximum practical)
- `decay_rate_modifier` in range [-10, +10]
- `min_identity_age` in range [0, 31536000] (0 to 1 year in seconds)

**Governance Note:** Space parameters are set at creation time by the creator. There is **no mechanism to modify parameters after creation**. If a community wants different parameters, they create a new space (or fork). This is intentional: mutable parameters would require governance authority, which creates capture vulnerability.

### 3.5 Space Reference (for Content)

```
SpaceReference {
    space_id:      SpaceID         // Which space this content belongs to
    sequence:      u64             // Ordering hint within space
}
```

All posts and replies include a SpaceReference indicating which space they belong to. Content without a valid SpaceReference is considered "spaceless" and may be handled differently by clients.

**Sequence Number Assignment:**
- Sequence numbers are advisory ordering hints, not consensus-enforced
- Nodes assign sequences based on local observation order when content is received
- Clients SHOULD display content in sequence order within a space
- Conflicts (duplicate sequences) are resolved by timestamp, then by content hash
- Gaps in sequences are acceptable and do not indicate missing content

### 3.6 Space Activity Summary

```
SpaceActivitySummary {
    space_id:           SpaceID        // The space
    post_count:         u64            // Total posts ever
    active_posts:       u64            // Posts not yet decayed
    unique_participants: u64           // Distinct identities who have posted
    last_activity:      u64            // Timestamp of most recent post
    decay_health:       u8             // 0-100, rough measure of decay pressure
}
```

**Note:** This is an informational structure computed by nodes. Not authoritative—different nodes may have slightly different values. Clients SHOULD compute their own when precision matters.

### 3.7 Space Index Entry

```
SpaceIndexEntry {
    space_id:       SpaceID            // Space identifier
    name:           string             // Space name (for search)
    created_at:     u64                // Creation timestamp
    last_seen:      u64                // Last activity timestamp
    active:         bool               // Whether space has non-decayed content
}
```

Nodes maintain a local index of known spaces for search/discovery. This is NOT a central registry—each node builds its own index from chain data.

---

## 4. Algorithms

### 4.1 Space Creation

**Purpose:** Create a new space with proof-of-work commitment

**Input:**
- `creator`: Identity of the creating user
- `name`: Desired space name
- `description`: Space description
- `parameters`: Optional custom parameters (or defaults)

**Output:**
- `Space`: The created space
- OR error if validation fails

**Steps:**
1. Normalize space name (lowercase, trim whitespace)
2. Validate name length (1-64 bytes after normalization)
3. Validate description length (0-512 bytes)
4. Get current timestamp
5. Compute preliminary space_id: `SHA-256(name_normalized || creator.pubkey || timestamp)[0..16]`
6. Check if space_id already exists on chain; if so, reject
7. Compute proof-of-work:
   ```
   nonce = 0
   loop:
       pow_hash = SHA-256(space_id || timestamp_le || nonce_le)
       if leading_zeros(pow_hash) >= SPACE_CREATION_DIFFICULTY:
           break
       nonce += 1
   ```
8. Construct SpaceCreationProof
9. Set parameters (use defaults for any unspecified)
10. Serialize canonical form
11. Sign with creator's private key
12. Return Space

**Complexity:** O(2^SPACE_CREATION_DIFFICULTY) expected hash operations

**Difficulty:** SPACE_CREATION_DIFFICULTY = 22 bits (default)
- At 22 bits: ~4 million hashes expected
- On modern CPU: ~1-5 minutes
- On mobile: ~5-15 minutes

Space creation is the highest-PoW action in the protocol (higher than posts, replies, or engagements). This is intentionally the case: space creation is a significant action that should require commitment.

```
function create_space(creator: Identity, name: string, description: string,
                      parameters: Option<SpaceParameters>) -> Result<Space, Error>:

    name_norm = normalize_space_name(name)
    if name_norm.len() < 1 or name_norm.len() > 64:
        return Error::InvalidName
    if description.len() > 512:
        return Error::DescriptionTooLong

    timestamp = current_unix_time()

    // Compute space ID
    space_id = sha256(name_norm || creator.public_key || u64_to_le(timestamp))[0..16]

    // Check uniqueness
    if chain_state.space_exists(space_id):
        return Error::SpaceAlreadyExists

    // Perform proof-of-work
    nonce = 0
    loop:
        pow_hash = sha256(space_id || u64_to_le(timestamp) || u64_to_le(nonce))
        if leading_zeros(pow_hash) >= SPACE_CREATION_DIFFICULTY:
            break
        nonce += 1
        if nonce == u64::MAX:
            timestamp = current_unix_time()  // Refresh timestamp if needed
            nonce = 0

    creation_pow = SpaceCreationProof {
        space_id: space_id,
        timestamp: timestamp,
        nonce: nonce,
        pow_hash: pow_hash
    }

    params = parameters.unwrap_or(SpaceParameters::default())

    // Create and sign
    space = Space {
        id: space_id,
        name: name,  // Original (non-normalized) for display
        description: description,
        creator: creator.public_key,
        created_at: timestamp,
        creation_pow: creation_pow,
        parameters: params,
        signature: [0u8; 64]  // Placeholder
    }

    canonical = serialize_canonical(space)
    space.signature = ed25519_sign(creator.private_key, canonical)

    return Ok(space)
```

### 4.2 Space Name Normalization

**Purpose:** Ensure consistent space name comparison

**Input:**
- `name`: Raw space name string

**Output:**
- `normalized`: Normalized space name

**Steps:**
1. Convert to lowercase (Unicode-aware)
2. Trim leading/trailing whitespace
3. Collapse internal whitespace to single space
4. Remove any control characters
5. NFC Unicode normalization

```
function normalize_space_name(name: string) -> string:
    result = name.to_lowercase()
    result = result.trim()
    result = collapse_whitespace(result)
    result = remove_control_chars(result)
    result = unicode_nfc(result)
    return result
```

**Edge Cases:**
- Empty after normalization: Error
- Contains only whitespace: Error
- Contains null bytes: Strip them
- Homoglyph attacks: NOT addressed at protocol level (client responsibility)

### 4.3 Space Lookup

**Purpose:** Find a space by ID or name

**Input:**
- `query`: SpaceID or space name

**Output:**
- `Option<Space>`: The space if found, None otherwise

**Steps:**
1. If query is SpaceID (16 bytes): Direct lookup
2. If query is string: Normalize, then search index
3. Return matching space or None

```
function lookup_space(query: SpaceID | string, chain_state: ChainState) -> Option<Space>:
    if query is SpaceID:
        return chain_state.spaces.get(query)

    // String search
    name_norm = normalize_space_name(query)
    for entry in chain_state.space_index:
        if normalize_space_name(entry.name) == name_norm:
            return chain_state.spaces.get(entry.space_id)

    return None
```

**Complexity:** O(1) for ID lookup, O(n) for name search (where n = number of spaces)

### 4.4 Space Validation

**Purpose:** Verify a space definition is valid

**Input:**
- `space`: Space to validate
- `chain_state`: Current chain state

**Output:**
- `bool`: True if valid

**Steps:**
1. Verify space_id derivation is correct
2. Verify name is valid UTF-8 and length
3. Verify description is valid UTF-8 and length
4. Verify creation timestamp is reasonable
5. Verify creation PoW meets difficulty
6. Verify PoW timestamp matches creation timestamp
7. Verify signature is valid
8. Verify space doesn't already exist

```
function validate_space(space: Space, chain_state: ChainState) -> Result<(), ValidationError>:
    // Verify ID derivation
    name_norm = normalize_space_name(space.name)
    expected_id = sha256(name_norm || space.creator || u64_to_le(space.created_at))[0..16]
    if space.id != expected_id:
        return Error::InvalidSpaceID

    // Verify name
    if name_norm.len() < 1 or name_norm.len() > 64:
        return Error::InvalidName
    if not is_valid_utf8(space.name):
        return Error::InvalidUTF8

    // Verify description
    if space.description.len() > 512:
        return Error::DescriptionTooLong
    if not is_valid_utf8(space.description):
        return Error::InvalidUTF8

    // Verify timestamp
    now = current_unix_time()
    if space.created_at > now + 300:  // Max 5 min future
        return Error::TimestampTooFuture
    if space.created_at < now - 86400:  // Max 24h past
        return Error::TimestampTooOld

    // Verify PoW
    pow_input = space.id || u64_to_le(space.creation_pow.timestamp) || u64_to_le(space.creation_pow.nonce)
    if sha256(pow_input) != space.creation_pow.pow_hash:
        return Error::InvalidPoW
    if leading_zeros(space.creation_pow.pow_hash) < SPACE_CREATION_DIFFICULTY:
        return Error::InsufficientPoW

    // Verify signature
    canonical = serialize_canonical_without_signature(space)
    if not ed25519_verify(space.creator, canonical, space.signature):
        return Error::InvalidSignature

    // Verify uniqueness
    if chain_state.space_exists(space.id):
        return Error::SpaceAlreadyExists

    return Ok(())
```

### 4.5 Content-Space Association

**Purpose:** Associate a post or reply with a space

**Input:**
- `content`: The post or reply
- `space_id`: Target space

**Output:**
- `content`: Content with SpaceReference attached

**Steps:**
1. Verify space exists
2. Check space parameters (PoW requirements, identity age)
3. Attach SpaceReference to content
4. Include in content signature

```
function associate_with_space(content: Content, space_id: SpaceID,
                              chain_state: ChainState) -> Result<Content, Error>:
    space = chain_state.spaces.get(space_id)
    if space.is_none():
        return Error::SpaceNotFound

    // Check identity age if space requires it
    if space.parameters.min_identity_age > 0:
        author_age = identity_age(content.author, chain_state)
        if author_age.is_none() or author_age.unwrap() < space.parameters.min_identity_age:
            return Error::IdentityTooYoung

    // Attach reference
    content.space_ref = SpaceReference {
        space_id: space_id,
        sequence: chain_state.next_sequence_for_space(space_id)
    }

    return Ok(content)
```

### 4.6 Space Decay Calculation

**Purpose:** Determine decay rate for content in a space

**Input:**
- `space`: The space
- `fork_base_decay`: Fork's base decay rate

**Output:**
- `decay_rate`: Effective decay rate for this space

**Steps:**
1. Get space's decay modifier
2. Apply modifier to fork base rate
3. Clamp to valid range

```
function space_decay_rate(space: Space, fork_base_decay: f64) -> f64:
    modifier = space.parameters.decay_rate_modifier

    // Each unit = 10% adjustment
    multiplier = 1.0 + (modifier as f64 * 0.10)

    effective_rate = fork_base_decay * multiplier

    // Clamp: cannot be negative, cannot exceed 2x base
    return clamp(effective_rate, 0.0, fork_base_decay * 2.0)
```

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x30 | SPACE_CREATE | Announce new space creation |
| 0x31 | SPACE_QUERY | Request space information |
| 0x32 | SPACE_RESPONSE | Response to space query |
| 0x33 | SPACE_LIST | Request list of known spaces |
| 0x34 | SPACE_LIST_RESPONSE | List of space entries |
| 0x35 | SPACE_CONTENT_QUERY | Request content from a space |
| 0x36 | SPACE_CONTENT_RESPONSE | Content from a space |

### 5.2 Message Format

**Byte Order:** All multi-byte integers are little-endian.

#### 5.2.1 SPACE_CREATE (0x30)

Announces creation of a new space.

```
SpaceCreate {
    space:          Space              // Complete space definition
}
```

Serialization:
```
space_id (16 bytes) ||
name_len (1 byte) ||
name (1-64 bytes) ||
description_len (2 bytes, u16 LE) ||
description (0-512 bytes) ||
creator (32 bytes) ||
created_at (8 bytes, u64 LE) ||
pow_timestamp (8 bytes, u64 LE) ||
pow_nonce (8 bytes, u64 LE) ||
pow_hash (32 bytes) ||
parameters (12 bytes, see SpaceParameters) ||
signature (64 bytes)
```

#### 5.2.2 SPACE_QUERY (0x31)

Request information about a specific space.

```
SpaceQuery {
    query_type:     u8                 // 0x00 = by ID, 0x01 = by name
    space_id:       Option<SpaceID>    // If query_type == 0x00
    space_name:     Option<string>     // If query_type == 0x01
    include_stats:  bool               // Whether to include activity summary
}
```

#### 5.2.3 SPACE_RESPONSE (0x32)

Response to a space query.

```
SpaceResponse {
    found:          bool               // Whether space was found
    space:          Option<Space>      // Space if found
    stats:          Option<SpaceActivitySummary>  // If requested and found
}
```

#### 5.2.4 SPACE_LIST (0x33)

Request list of known spaces (for discovery).

```
SpaceList {
    filter:         SpaceListFilter    // Filter criteria
    offset:         u32                // Pagination offset
    limit:          u32                // Max entries (max 100)
}

SpaceListFilter {
    active_only:    bool               // Only spaces with non-decayed content
    min_participants: u32              // Minimum unique participants
    created_after:  u64                // Minimum creation timestamp
    name_prefix:    Option<string>     // Name starts with (for search)
}
```

#### 5.2.5 SPACE_LIST_RESPONSE (0x34)

```
SpaceListResponse {
    total_count:    u32                // Total matching spaces
    entries:        Vec<SpaceIndexEntry>  // Matching entries
}
```

#### 5.2.6 SPACE_CONTENT_QUERY (0x35)

Request content from a space.

```
SpaceContentQuery {
    space_id:       SpaceID            // Which space
    after_sequence: u64                // Content after this sequence
    limit:          u32                // Max items (max 100)
}
```

#### 5.2.7 SPACE_CONTENT_RESPONSE (0x36)

```
SpaceContentResponse {
    space_id:       SpaceID
    content:        Vec<ContentItem>   // Posts/replies in sequence order
    has_more:       bool               // More content available
}
```

---

## 6. Validation Rules

### 6.1 Space Name Validation

- `V-SN-01`: Name MUST be valid UTF-8
- `V-SN-02`: Name MUST be 1-64 bytes after normalization
- `V-SN-03`: Name MUST contain at least one non-whitespace character
- `V-SN-04`: Name MUST NOT contain null bytes
- `V-SN-05`: Name MUST NOT contain control characters (U+0000-U+001F, U+007F-U+009F)

### 6.2 Space Creation Validation

- `V-SC-01`: Space ID MUST match derivation from name + creator + timestamp
- `V-SC-02`: Creation timestamp MUST NOT be more than 5 minutes in future
- `V-SC-03`: Creation timestamp MUST NOT be more than 24 hours in past
- `V-SC-04`: PoW hash MUST be correctly computed
- `V-SC-05`: PoW hash MUST have at least SPACE_CREATION_DIFFICULTY leading zeros
- `V-SC-06`: PoW timestamp MUST equal creation timestamp
- `V-SC-07`: Signature MUST be valid for creator's public key
- `V-SC-08`: Space ID MUST NOT already exist on chain

### 6.3 Space Parameters Validation

- `V-SP-01`: `post_pow_difficulty` MUST be in range [0, 32]
- `V-SP-02`: `reply_pow_difficulty` MUST be in range [0, 32]
- `V-SP-03`: `decay_rate_modifier` MUST be in range [-10, +10]
- `V-SP-04`: `min_identity_age` MUST be in range [0, 31536000]

### 6.4 Content-Space Validation

- `V-CS-01`: Content's space_id MUST reference an existing space
- `V-CS-02`: Content author MUST meet space's min_identity_age (if set)
- `V-CS-03`: Content PoW MUST meet space's difficulty (if customized) or fork default
- `V-CS-04`: Content's space_ref.sequence SHOULD be monotonically increasing per space

---

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Description | Severity |
|--------|-------------|----------|
| TH-SP01 | Space name squatting | Medium |
| TH-SP02 | Spam space creation | Medium |
| TH-SP03 | Space impersonation via similar names | Medium |
| TH-SP04 | Space flooding (filling space with spam) | Medium |
| TH-SP05 | Parameter abuse (e.g., 0 PoW difficulty) | Low |
| TH-SP06 | Space discovery manipulation | Low |

### 7.2 Mitigations

**TH-SP01 (Name squatting):**
- High PoW cost makes bulk squatting expensive
- Names are first-come-first-served; no claims mechanism
- Communities can migrate to new spaces if needed
- *Acknowledged limitation*: Popular names may be squatted

**TH-SP02 (Spam space creation):**
- SPACE_CREATION_DIFFICULTY (22 bits) requires significant computation
- Each space costs 1-15 minutes of CPU time
- Economic irrationality: spam spaces serve no purpose without algorithmic discovery
- Decay ensures unused spaces fade

**TH-SP03 (Space impersonation):**
- Space IDs are unique; names are not authoritative
- Clients SHOULD display space ID alongside name
- Clients SHOULD warn on visually similar names
- *Acknowledged limitation*: Homoglyph attacks possible at name level

**TH-SP04 (Space flooding):**
- Space-level PoW can be set higher than fork default
- Community can migrate to new space with higher requirements
- Decay removes spam over time
- No algorithmic amplification means spam doesn't propagate visibility

**TH-SP05 (Parameter abuse):**
- Parameters validated at creation time
- Extreme values (0 PoW) still require space creation PoW
- Community choice: don't join spaces with undesirable parameters
- Fork-level minimums could be enforced (not in this spec)

**TH-SP06 (Discovery manipulation):**
- No algorithmic discovery to manipulate
- Space lists are local node computations
- Clients can verify activity claims against chain
- Word-of-mouth discovery is manipulation-resistant

---

## 8. Privacy Considerations

### 8.1 What Is Protected

- **Space browsing**: No central authority tracks which spaces a user views
- **Node-level filtering**: Individual nodes can refuse to store/serve specific spaces
- **Multi-identity**: Users can create different identities for different spaces

### 8.2 What Is NOT Protected

- **Space participation**: Posts in a space are publicly attributable to an identity
- **Creation history**: Space creator is permanently recorded
- **Cross-space activity**: Same identity's participation across spaces is visible
- **Space existence**: All spaces are publicly visible on chain

### 8.3 User Guidance

Clients SHOULD inform users:
- Participation in any space is permanently recorded
- The same identity across spaces enables cross-correlation
- Space browsing (reading without posting) does not leave on-chain traces
- Node operators can see query patterns (though not viewing behavior)

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency |
|-----------|------------|
| Identity | Space creation requires valid identity signature |
| Proof-of-Work | Space creation and content use PoW from SPEC_03 |
| Content/Decay | Content in spaces subject to decay mechanics |
| Consensus | Space creation transactions included in blocks |
| Forks | Spaces exist within a fork; cross-fork behavior TBD |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `create_space(...)` | Create new space | Clients |
| `lookup_space(query)` | Find space by ID or name | Clients, Content |
| `validate_space(space)` | Verify space validity | Consensus, Nodes |
| `space_decay_rate(space)` | Get effective decay rate | Decay system |
| `list_spaces(filter)` | Discovery/search | Clients |

### 9.3 Relationship to Forks

Spaces exist within a single fork. Key behaviors:

1. **Space IDs are fork-local**: Same name + creator on different forks = different space IDs (different chain states)

2. **Fork inherits spaces**: When a fork occurs, all existing spaces continue on both forks

3. **Divergence after fork**: New spaces on fork A don't exist on fork B and vice versa

4. **Same identity, different spaces**: A user can create spaces with same name on different forks (different space_ids)

5. **Space parameters on forks**: Fork can have different default parameters; space parameters override these

**Migration scenario**: When a community forks due to space-level issues:
- Create new space on new fork
- Optionally use same name
- Community migrates content/discussion
- Old space on old fork continues (but may decay if abandoned)

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Space Index:**
- Maintain in-memory index of known spaces
- Persist to disk for fast startup
- Update on new block inclusion
- Index by: ID (primary), normalized name (for search)

**PoW Computation:**
- Can run in background thread
- Show progress to user (estimated time)
- Allow cancellation
- Save partial progress for resume (nonce checkpoints)

**Name Handling:**
- Store original name for display
- Store normalized name for comparison
- Client-side homoglyph detection recommended

**Discovery UX:**
- Provide search by name
- Show activity metrics (post count, recent activity)
- Enable filtering by parameters
- DO NOT rank by "popularity" or "trending"

### 10.2 Known Challenges

**Challenge 1: Name squatting**
- High-profile names will be squatted early
- No technical solution; social coordination required
- Communities use "unofficial" prefix/suffix conventions
- Cross-links from trusted sources help discovery

**Challenge 2: Empty spaces feel dead**
- New spaces have no content
- Decay makes this worse initially
- Bootstrap with committed community before announcement
- Consider "founding posts" that decay slower (not in protocol)

**Challenge 3: Parameter immutability**
- Communities may want to change parameters over time
- Protocol doesn't support this (capture risk)
- Solution: Create new space with new parameters, migrate
- This is working as designed (exit over voice)

**Challenge 4: Discovery without algorithm**
- Users expect "recommended" spaces
- Protocol explicitly forbids this
- Clients can implement opt-in directories (external to protocol)
- Word of mouth, external links, search are primary mechanisms

---

## 11. Test Vectors

### 11.1 Space ID Derivation

**Input:**
- name: "test-space"
- creator (pubkey, hex): `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a`
- timestamp: `1703462400` (2024-12-25 00:00:00 UTC)

**Normalization:**
- normalized_name: "test-space" (already lowercase, no whitespace)
- name_bytes (UTF-8): `74 65 73 74 2d 73 70 61 63 65`

**Derivation input:**
```
name_bytes (10 bytes) ||
creator (32 bytes) ||
timestamp_le (8 bytes: 00 c6 88 65 00 00 00 00)
```

**Derivation input (50 bytes, hex):**
```
746573742d7370616365d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a00c6886500000000
```

**Full SHA-256 hash (hex):**
```
2c3d34a8b0388f112bf9209b118f85e03fae84d844c310b4bb38c882ff4728b4
```

**Expected space_id (first 16 bytes, hex):**
```
2c3d34a8b0388f112bf9209b118f85e0
```

**Human-readable SpaceAddress:**
```
sp1qyp5jf8e4xkv0z9r3n7m6w2d5t4h8g7f6
```
(Note: Actual bech32m encoding should be verified by implementers)

### 11.2 Space Creation PoW

**Test case: Verify PoW computation**

**Input:**
- space_id: [16 bytes from 11.1]
- timestamp: `1703462400`
- difficulty: 22 bits

**Verification:**
```
for nonce in 0..u64::MAX:
    hash = sha256(space_id || timestamp_le || nonce_le)
    if leading_zeros(hash) >= 22:
        print("Found at nonce:", nonce)
        print("Hash:", hex(hash))
        break
```

### 11.3 Name Normalization

| Input | Expected Output |
|-------|-----------------|
| "Test Space" | "test space" |
| "  spaces  " | "spaces" |
| "UPPERCASE" | "uppercase" |
| "multi   space" | "multi space" |
| "tab\there" | "tab here" |
| "" | Error::EmptyName |
| "   " | Error::EmptyName |

### 11.4 Parameter Encoding

**Default parameters:**
```
SpaceParameters {
    post_pow_difficulty: 0,      // Use fork default
    reply_pow_difficulty: 0,     // Use fork default
    decay_rate_modifier: 0,      // No adjustment
    min_identity_age: 0,         // No minimum
    reserved: [0; 8]
}
```

**Serialized (12 bytes, hex):**
```
00 00 00 00 00 00 00 00 00 00 00 00
```

---

## 12. Open Questions

### 12.1 Resolved in This Specification

1. **What defines a space?** RESOLVED: A space is defined by SpaceID derived from name + creator + timestamp, with associated metadata and parameters.

2. **How are spaces created?** RESOLVED: PoW cost (22-bit difficulty, ~4M hashes), creator signature, validation against chain state.

3. **Who "owns" a space?** RESOLVED: Nobody. Creator is recorded but has no special powers. No ownership transfer, no moderation authority.

4. **How do users discover spaces?** RESOLVED: User-driven search, word-of-mouth, external links. No algorithmic recommendation.

### 12.2 Deferred to Other Specifications

1. **Space content details**: SPEC_02_CONTENT handles post/reply formats; this spec defines space reference only

2. **Cross-fork space behavior**: SPEC_05_FORKS will address fork-level space handling

3. **Decay specifics for spaces**: SPEC_02_CONTENT_DECAY addresses decay mechanics; this spec only references them

### 12.3 Questions for Community Input

1. **SPACE_CREATION_DIFFICULTY value**: Is 22 bits appropriate? Should it be adjustable per-fork?

2. **Space parameter ranges**: Are the current ranges appropriate? Should decay modifier have wider range?

3. **Name length limits**: Is 64 bytes sufficient? Should there be minimum length?

4. **Space description**: Should descriptions be searchable? Should they decay separately from space?

5. **Reserved parameters**: What future parameters might be needed?

---

## 13. References

### Thesis Documents
- **THESIS_02_FRICTION.md**: PoW as commitment filter; action-based difficulty scaling
- **THESIS_03_FORKS.md**: Spaces as exit routes; migration over governance
- **THESIS_04_SAFETY.md**: Community-layer protection; space migration as moderation

### Vision and Architecture
- **VISION.md**: Active navigation (no algorithmic discovery), spaces as navigation units, action-based difficulty

### Related Specifications
- **SPEC_01_IDENTITY.md**: Identity system used for space creation and participation
- **SPEC_02_CONTENT_DECAY.md**: Decay mechanics affecting space content
- **SPEC_03_PROOF_OF_WORK.md**: PoW algorithms used for space and content creation
- **SPEC_05_FORKS_CONSENSUS.md**: Fork-level behavior affecting spaces

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-24*
*Status: APPROVED - Review completed, required changes applied*
