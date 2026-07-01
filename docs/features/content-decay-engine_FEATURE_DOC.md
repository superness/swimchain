# Content & Decay Engine - Feature Documentation

## Overview

The Content & Decay Engine is the organic moderation system at the heart of Swimchain. Rather than relying on centralized moderation or voting, content naturally expires based on engagement - popular content lives longer while unpopular content fades away. This creates a self-regulating ecosystem where community interest directly determines content visibility and lifespan.

**Key Principles**:
- **Organic moderation**: Content dies naturally without engagement; no central authority needed
- **Half-life model**: Survival probability halves every 7 days (default) without new engagement
- **Engagement resets decay**: Any valid engagement (reaction, reply) resets the decay timer
- **Protection period**: 48-hour decay floor protects new content from immediate decay
- **Adaptive scaling**: Half-life adjusts based on storage pressure (1-30 days range)
- **Spam acceleration**: Flagged content decays faster (4-hour half-life)

**Spec References**: SPEC_02, SPEC_03 (Engagement Pools), SPEC_07 (Content Retrieval), SPEC_12 (Spam Attestation)

**Primary Location**: `src/content/`

## Architecture

```
+-------------------------------------------------------------------------+
|                          Content & Decay Engine                          |
+-------------------------------------------------------------------------+
|                                                                          |
|  +-------------+    +--------------+    +---------------------+          |
|  | ContentItem |--->|  DecayState  |--->| ContentLifecycle    |          |
|  |  (SPEC_02)  |    |  (computed)  |    | (Fresh/Active/...)  |          |
|  +-------------+    +--------------+    +---------------------+          |
|         |                   |                                            |
|         v                   v                                            |
|  +-------------+    +--------------+    +---------------------+          |
|  | Engagement  |    |   Adaptive   |    |     Pruning         |          |
|  | Processing  |--->|   Half-Life  |--->|   (tombstones)      |          |
|  +-------------+    +--------------+    +---------------------+          |
|         |                   |                                            |
|         v                   v                                            |
|  +-------------+    +--------------+                                     |
|  |  Reactions  |    |  NodeState   |                                     |
|  | (emoji PoW) |    |  (storage)   |                                     |
|  +-------------+    +--------------+                                     |
|                                                                          |
+-------------------------------------------------------------------------+
|  Storage Layer                                                           |
|  +------------+  +-------------+  +---------------+  +--------------+    |
|  | Inline     |  | Referenced  |  | Chunked       |  | Retrieval    |    |
|  | (<=1KB)    |  | (1KB-1MB)   |  | (>1MB)        |  | (P2P)        |    |
|  +------------+  +-------------+  +---------------+  +--------------+    |
|                                                                          |
+-------------------------------------------------------------------------+
```

## Data Structures

### ContentItem

The primary content record representing posts, replies, and quotes.

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | `ContentId` | SHA-256 hash of content (32 bytes) |
| `author_id` | `IdentityId` | Author's identity (32 bytes) |
| `content_type` | `ContentType` | Post (0x00), Reply (0x01), Quote (0x02), Edit (0x03) |
| `space_id` | `SpaceId` | Space this content belongs to (32 bytes) |
| `parent_id` | `Option<ContentId>` | Parent content for replies/quotes |
| `created_at` | `u64` | Unix timestamp of creation (milliseconds) |
| `last_engagement` | `u64` | Unix timestamp of last engagement (for decay) |
| `body_inline` | `Option<String>` | Inline content for small posts (<=1KB) |
| `content_hash` | `Option<ContentHash>` | Hash for externally-stored content (>1KB) |
| `content_size` | `Option<u32>` | Size in bytes for external content |
| `content_type_mime` | `Option<String>` | MIME type for media content |
| `media_refs` | `Vec<MediaRef>` | Attached media references (max 4) |
| `pin_state` | `Option<PinState>` | Pin protection if set |
| `display_name` | `Option<String>` | Author's display name (max 64 bytes) |
| `signature` | `Signature` | Ed25519 signature (64 bytes) |
| `pow_nonce` | `u64` | PoW nonce for anti-spam |
| `pow_difficulty` | `u8` | Required PoW difficulty (leading zeros) |
| `preservation_pow` | `Option<u64>` | Author PoW for extended preservation |
| `engagement_count` | `u32` | Cached count of engagements |

**Location**: `src/types/content.rs`

### ContentType

Enum defining the type of content action.

| Variant | Value | Description |
|---------|-------|-------------|
| `Post` | 0x00 | Original post in a space |
| `Reply` | 0x01 | Reply to another content item |
| `Quote` | 0x02 | Quote-post of another content item |
| `Edit` | 0x03 | Edit to existing content |

**Note**: Despite MASTER_FEATURES mentioning `Media` as a variant, the implementation only supports these four types. Media is attached via the `media_refs` field instead.

### DecayState

Computed decay metrics for a content item (not stored, calculated on demand).

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | `ContentId` | Content being evaluated |
| `age_seconds` | `u64` | Current time - created_at |
| `time_since_engagement` | `u64` | Current time - last_engagement |
| `half_lives_elapsed` | `f64` | effective_decay_time / half_life |
| `survival_probability` | `f64` | Current survival probability (0.0-1.0) |
| `is_protected` | `bool` | True if within decay floor period or pinned |
| `is_decayed` | `bool` | True if below decay threshold (6.25%) |

**Location**: `src/content/decay.rs`

### ContentLifecycle

Human-readable lifecycle stages for content.

| Stage | Condition | Description |
|-------|-----------|-------------|
| `Protected` | Within floor or pinned | 48-hour protection period |
| `Active` | survival >= 50% | Healthy content, <1 half-life |
| `Stale` | 6.25% <= survival < 50% | Aging content, 1-4 half-lives |
| `Decayed` | survival < 6.25% | Below threshold, eligible for pruning |

### ContentReference

Classification of how content is stored based on size.

| Variant | Size Range | Description |
|---------|------------|-------------|
| `Inline` | <=1KB | Stored directly in `body_inline` field |
| `Referenced` | 1KB-1MB | Single blob in content-addressed storage |
| `Chunked` | >1MB | Split into 1MB chunks with manifest |

**Location**: `src/content/addressing.rs`

### ReactionType

Emoji reactions available for engagement (PoW-based). This is the **primary engagement mechanism** that replaced the deprecated pool system.

| Variant | Value | Emoji | Description |
|---------|-------|-------|-------------|
| `Heart` | 1 | :heart: | Love/appreciation |
| `ThumbsUp` | 2 | :+1: | Agreement/approval |
| `ThumbsDown` | 3 | :-1: | Disagreement |
| `Laugh` | 4 | :joy: | Humor |
| `Thinking` | 5 | :thinking: | Contemplation |
| `MindBlown` | 6 | :exploding_head: | Amazement |
| `Fire` | 7 | :fire: | Hot/trending |
| `Swimming` | 8 | :swimmer: | Swimchain native |

**Location**: `src/types/content.rs:312-380`

### ReactionCounts

Aggregation structure for tracking reactions on content.

| Field | Type | Description |
|-------|------|-------------|
| `heart` | `u32` | Count of heart reactions |
| `thumbs_up` | `u32` | Count of thumbs up |
| `thumbs_down` | `u32` | Count of thumbs down |
| `laugh` | `u32` | Count of laugh reactions |
| `thinking` | `u32` | Count of thinking reactions |
| `mind_blown` | `u32` | Count of mind blown |
| `fire` | `u32` | Count of fire reactions |
| `swimming` | `u32` | Count of swimming reactions |
| `total` | `u32` | Total reaction count |

**Location**: `src/types/content.rs:398-499`

### NodeState

Tracks storage pressure for adaptive decay calculations.

| Field | Type | Description |
|-------|------|-------------|
| `total_storage_bytes` | `u64` | Current storage usage |
| `target_storage_bytes` | `u64` | Target storage limit (500MB default) |
| `current_half_life_secs` | `u64` | Computed adaptive half-life |

### EngagementPool (Legacy)

**Note**: The engagement pool system has been **deprecated** in favor of direct PoW-based reactions via `submit_engagement`. Pool RPC methods return errors.

| Field | Type | Description |
|-------|------|-------------|
| `pool_id` | `PoolId` | 32-byte unique identifier |
| `target_content` | `[u8; 32]` | Content hash being engaged |
| `required_pow` | `u64` | Total PoW needed (60 seconds) |
| `window_start` | `u64` | UNIX milliseconds |
| `window_end` | `u64` | window_start + 10 minutes |
| `contributions` | `Vec<PoolContribution>` | Individual contributions |
| `status` | `PoolStatus` | Open, Completed, Expired |

**Location**: `src/content/pool.rs`

### MediaRef

Media attachment reference for content.

| Field | Type | Description |
|-------|------|-------------|
| `media_hash` | `ContentHash` | SHA-256 of media content |
| `media_type` | `MediaType` | JPEG, PNG, GIF, WebP |
| `size_bytes` | `u32` | Size in bytes |
| `inline_preview` | `Option<Vec<u8>>` | Max 1024 bytes preview |

**Note**: Video content is explicitly prohibited at the protocol level.

## Core APIs

### Decay Calculation

#### calculate_decay_state()

**Location**: `src/content/decay.rs:39`

**Signature**:
```rust
pub fn calculate_decay_state(
    content: &ContentItem,
    current_time_ms: u64,
    half_life_secs: u64,
) -> DecayState
```

**Purpose**: Core decay calculation implementing the half-life model.

**Algorithm**:
1. If age < 48 hours (`DECAY_FLOOR_SECS`): return Protected (survival = 1.0)
2. If pinned and pin not expired: return Protected (survival = 1.0)
3. `effective_decay_time = time_since_engagement - DECAY_FLOOR_SECS`
4. `half_lives_elapsed = effective_decay_time / half_life`
5. `survival_probability = 0.5^half_lives_elapsed`
6. `is_decayed = survival < 0.0625`

**Decay Formula**:
```
survival_probability = 0.5^(effective_decay_time / half_life)

where:
  effective_decay_time = max(0, current_time - last_engagement - decay_floor)
  half_life = 7 days (604,800 seconds) default
  decay_floor = 48 hours (172,800 seconds)
  decay_threshold = 6.25% (0.0625)
```

**Example**:
```rust
let state = calculate_decay_state(
    &content,
    now + 7 * 24 * 60 * 60 * 1000,  // 7 days later
    HALF_LIFE_SECS,
);
// After 48h floor + 7 days: ~50% survival
// state.survival_probability ≈ 0.5
// state.is_decayed = false (above 6.25% threshold)
```

#### calculate_adaptive_half_life()

**Location**: `src/content/decay.rs:108`

**Signature**:
```rust
pub fn calculate_adaptive_half_life(state: &NodeState) -> u64
```

**Purpose**: Adjust half-life based on storage pressure.

**Algorithm**:
```
pressure = current_storage / target_storage

if pressure > 1.0:
    target_half_life = current_half_life / pressure
else:
    target_half_life = current_half_life * (1 + (1 - pressure) * 0.5)

clamped = clamp(target_half_life, MIN_HALF_LIFE, MAX_HALF_LIFE)
new_half_life = current_half_life + (clamped - current_half_life) * 0.1
```

**Constants**:
- `MIN_HALF_LIFE_SECS`: 86,400 (1 day)
- `MAX_HALF_LIFE_SECS`: 2,592,000 (30 days)
- `ADAPTATION_SMOOTHING`: 0.1 (10% adjustment per interval)
- `ADAPTATION_INTERVAL_SECS`: 3,600 (recalculate hourly)

#### calculate_decay_state_spam_flagged()

**Location**: `src/content/decay.rs:149`

**Signature**:
```rust
pub fn calculate_decay_state_spam_flagged(
    content: &ContentItem,
    current_time_ms: u64,
    is_spam_flagged: bool,
) -> DecayState
```

**Purpose**: Apply accelerated decay (4-hour half-life) for spam-flagged content.

**Behavior**: When `is_spam_flagged` is true, uses `FLAGGED_DECAY_HALF_LIFE_SECS` (14,400 = 4 hours) instead of the normal 7-day half-life. This causes content to decay ~42x faster.

### Content Management

#### ContentManager::create_content()

**Location**: `src/content/lifecycle.rs:71`

**Signature**:
```rust
pub fn create_content(
    &self,
    content: ContentItem,
    current_time_ms: u64,
) -> Result<ContentId, ContentError>
```

**Purpose**: Store new content, initializes `last_engagement` to `created_at`.

**Validation**:
- Content body <= 4KB (`MAX_BODY_SIZE`)
- Display name <= 64 bytes
- Media refs <= 4 (`MAX_MEDIA_REFS`)
- PoW meets difficulty requirement
- Signature valid

#### ContentManager::process_engagement()

**Location**: `src/content/lifecycle.rs:150`

**Signature**:
```rust
pub fn process_engagement(
    &self,
    engagement: EngagementRecord,
    current_time_ms: u64,
) -> Result<EngagementResult, ContentError>
```

**Purpose**: Process an engagement on content, resetting decay timer.

**Behavior**:
1. Validates content not already decayed
2. Updates `last_engagement` timestamp
3. Increments `engagement_count`
4. Records reaction if emoji specified
5. Returns `Accepted` or rejection reason

**Rejection Conditions**:
- Self-engagement (cannot engage with own content)
- Invalid PoW proof
- Content already decayed
- Duplicate engagement within rate limit

### Content Pruning

#### prune_decayed_content()

**Location**: `src/content/pruning.rs:45`

**Signature**:
```rust
pub fn prune_decayed_content<S: ContentStore>(
    storage: &mut S,
    current_time_ms: u64,
    half_life_secs: u64,
) -> PruneStats
```

**Purpose**: Remove content below decay threshold, creating tombstones for parent references.

**Returns**:
```rust
pub struct PruneStats {
    pub pruned_count: u64,
    pub tombstones_created: u64,
    pub bytes_freed: u64,
}
```

**Tombstone Behavior**:
- Content with non-decayed children becomes tombstone (preserves thread structure)
- Content without children is fully deleted
- Tombstones retain only: `content_id`, `parent_id`, `space_id`, `tombstone_at`
- Grace period: 24 hours after crossing threshold before actual pruning

### Content Addressing

#### classify_content()

**Location**: `src/content/addressing.rs:110`

**Signature**:
```rust
pub fn classify_content(data: &[u8]) -> ContentReference
```

**Purpose**: Determine storage strategy based on content size.

**Classification Rules**:
| Size | Classification | Storage |
|------|---------------|---------|
| <=1,024 bytes | `Inline` | `body_inline` field |
| 1,024 - 1,048,576 bytes | `Referenced` | Single blob |
| >1,048,576 bytes | `Chunked` | Manifest + 1MB chunks |

### Content Chunking

#### chunk_data()

**Location**: `src/content/chunking.rs:315`

**Signature**:
```rust
pub fn chunk_data(data: &[u8]) -> Result<(Manifest, Vec<(ChunkInfo, Vec<u8>)>), ChunkingError>
```

**Purpose**: Split large content into 1MB chunks for distributed storage.

**Constants**:
- `CHUNK_SIZE`: 1,048,576 (1MB)
- `MAX_CONTENT_SIZE`: 1,073,741,824 (1GB)
- `MAX_CHUNKS`: 1024

### Content Retrieval

#### ContentRetrievalManager

**Location**: `src/content/retrieval.rs:543`

**Purpose**: Manager for P2P content retrieval with WHO_HAS/I_HAVE/GET/DATA protocol.

**Key Methods**:
```rust
impl ContentRetrievalManager {
    // Local content checks
    pub fn has_content(&self, hash: &ContentBlobHash) -> bool;
    pub fn get_local(&self, hash: &ContentBlobHash) -> Option<Vec<u8>>;

    // WHO_HAS/I_HAVE protocol
    pub fn on_who_has(&self, payload: &WhoHasPayload, sender: PeerId) -> Option<IHavePayload>;
    pub fn on_i_have(&self, payload: &IHavePayload, sender: PeerId) -> bool;

    // GET/DATA exchange
    pub fn on_get(&self, payload: &GetPayload) -> Result<DataPayload, NotFoundPayload>;
    pub fn on_data(&self, expected_hash: &ContentBlobHash, data: &[u8]) -> Result<(), ContentRetrievalError>;

    // Parallel chunk fetching
    pub fn create_parallel_fetcher(&self, manifest: &Manifest) -> ParallelFetcher;
}
```

**Protocol Flow**:
```
Requester                    Peer Network
    |                             |
    |-- WHO_HAS(content_hash) --->| (broadcast)
    |                             |
    |<-- I_HAVE(content_hash) ----| (from peers with content)
    |                             |
    |-- GET(content_hash) ------->| (to selected peer)
    |                             |
    |<-- DATA(content) -----------| (content bytes)
    |       or NOTFOUND           |
```

**Configuration**:
| Option | Default | Description |
|--------|---------|-------------|
| `max_concurrent_requests` | 4 | Parallel chunk downloads |
| `request_timeout` | 30s | Request timeout |
| `max_retries` | 3 | Retry attempts |
| `availability_cache_ttl` | 5m | Peer cache TTL |

## Behaviors

### Decay Lifecycle

Content progresses through lifecycle stages based on engagement:

1. **Creation**: Content created with `created_at` = `last_engagement`
2. **Protection Period**: 48-hour decay floor; survival_probability = 1.0
3. **Active Decay**: After floor, probability halves every half-life
4. **Threshold Check**: Content below 6.25% marked for pruning
5. **Grace Period**: 24 hours after crossing threshold
6. **Pruning**: Expired content removed, tombstones created if needed

**Timeline Example** (7-day half-life, no engagement):
```
Day 0-2:  100% (protected by decay floor)
Day 3:    100% (floor just ended)
Day 9:    50%  (1 half-life elapsed)
Day 16:   25%  (2 half-lives)
Day 23:   12.5% (3 half-lives)
Day 30:   6.25% (4 half-lives) -> PRUNED
```

### Engagement Reset Mechanics

When content receives valid engagement:

1. `last_engagement` updated to current timestamp
2. Decay timer fully resets (back to 100% after floor)
3. Engagement count incremented
4. Attribution recorded ("Kept alive by" list)
5. Reaction counts updated if emoji specified

### Spam-Flagged Accelerated Decay

Content receiving 3+ independent spam attestations (`SPAM_ATTESTATION_THRESHOLD`):

1. Half-life reduced from 7 days to 4 hours (`FLAGGED_DECAY_HALF_LIFE_SECS`)
2. Content decays ~42x faster than normal
3. 5 counter-attestations from Lifeguard+ members can clear flag (`COUNTER_ATTESTATION_THRESHOLD`)
4. Cleared content returns to normal half-life

### Adaptive Half-Life Algorithm

Storage pressure triggers automatic half-life adjustment:

1. Every hour, storage usage evaluated against target (500MB default)
2. Pressure ratio calculated: `current_storage / target_storage`
3. Half-life adjusted by 10% toward equilibrium
4. Clamped to 1-30 day range
5. High pressure -> shorter half-life -> faster decay
6. Low pressure -> longer half-life -> content lives longer

### Tombstone Creation

When decayed content has non-decayed children:

1. Compute `summary_hash` of first 256 bytes
2. Create Tombstone with `content_id`, `author_id`, `timestamp`
3. Delete original content body
4. Store tombstone

**Outcome**: Thread coherence preserved for replies

## Configuration

### Decay Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DECAY_FLOOR_SECS` | 172,800 | 48-hour protection period |
| `HALF_LIFE_SECS` | 604,800 | 7-day default half-life |
| `DECAY_THRESHOLD` | 0.0625 | 6.25% pruning threshold |
| `MIN_HALF_LIFE_SECS` | 86,400 | 1-day minimum half-life |
| `MAX_HALF_LIFE_SECS` | 2,592,000 | 30-day maximum half-life |
| `ADAPTATION_SMOOTHING` | 0.1 | 10% adjustment factor |
| `ADAPTATION_INTERVAL_SECS` | 3,600 | 1-hour recalculation interval |
| `PRUNE_GRACE_PERIOD_MS` | 86,400,000 | 24-hour grace period |
| `FLAGGED_DECAY_HALF_LIFE_SECS` | 14,400 | 4-hour spam half-life |

### Content Size Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `INLINE_CONTENT_THRESHOLD` | 1,024 | 1KB inline threshold |
| `MAX_BODY_SIZE` | 4,096 | 4KB max post body |
| `MAX_MEDIA_SIZE` | 1,048,576 | 1MB max media attachment |
| `MAX_MEDIA_REFS` | 4 | Max media per post |
| `CHUNK_SIZE` | 1,048,576 | 1MB chunk size |
| `MAX_FILE_SIZE` | 1,073,741,824 | 1GB max total size |
| `MAX_TEXT_LENGTH` | 10,000 | 10KB max text content |

### Retrieval Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CONCURRENT_CHUNK_REQUESTS` | 4 | Parallel chunk downloads |
| `CONTENT_REQUEST_TIMEOUT_SECS` | 30 | Request timeout |
| `CONTENT_MAX_RETRIES` | 3 | Retry attempts |
| `PEER_AVAILABILITY_TTL_SECS` | 300 | 5-minute peer cache |
| `MAX_PEER_AVAILABILITY_ENTRIES` | 10,000 | Max tracked content |
| `WHO_HAS_SEEN_TTL_SECS` | 60 | WHO_HAS dedup cache |

### Spam Decay Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SPAM_ATTESTATION_THRESHOLD` | 3 | Attestations to flag |
| `COUNTER_ATTESTATION_THRESHOLD` | 5 | Counter-attestations to clear |

### Legacy Pool Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `POOL_WINDOW_MS` | 600,000 | 10-minute pool window |
| `POOL_REQUIRED_POW_SECS` | 60 | 60 seconds total PoW |
| `MIN_CONTRIBUTION_SECS` | 1 | 1 second minimum |

## RPC Methods

### submit_engagement

Submit a PoW-based engagement (reaction) on content. **This is the primary engagement method**.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_engagement",
  "params": {
    "content_id": "sha256:abc123...",
    "pow_proof": {
      "nonce": 12345678,
      "difficulty": 16,
      "timestamp": 1704067200
    },
    "emoji": 1
  },
  "id": 1
}
```

**Parameters**:
- `content_id`: Target content hash
- `pow_proof`: Proof of work for anti-spam
- `emoji`: Reaction type (1-8, see ReactionType enum)

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "engagement_count": 42
  },
  "id": 1
}
```

### get_content

Retrieve a content item by ID with decay state.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_content",
  "params": {
    "content_id": "sha256:abc123..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content_id": "sha256:abc123...",
    "author_id": "cs1...",
    "content_type": "Post",
    "space_id": "sha256:def456...",
    "body": "Hello, Swimchain!",
    "created_at": 1704067200,
    "last_engagement": 1704326400,
    "engagement_count": 42,
    "decay_state": {
      "survival_probability": 0.75,
      "is_protected": false,
      "is_decayed": false,
      "lifecycle": "Active"
    }
  },
  "id": 1
}
```

### get_reactions

Get reaction counts for a content item.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_reactions",
  "params": {
    "content_id": "sha256:abc123..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content_id": "sha256:abc123...",
    "reactions": {
      "heart": 15,
      "thumbs_up": 8,
      "thumbs_down": 2,
      "laugh": 5,
      "thinking": 3,
      "mind_blown": 1,
      "fire": 7,
      "swimming": 1
    },
    "total": 42
  },
  "id": 1
}
```

### get_user_reactions

Get reactions a specific user has made on content.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_user_reactions",
  "params": {
    "content_id": "sha256:abc123...",
    "user_id": "cs1..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "reactions": ["heart", "fire"]
  },
  "id": 1
}
```

### Deprecated Pool Methods

The following pool-related RPC methods are **deprecated** and return errors:

| Method | Replacement |
|--------|-------------|
| `create_pool` | Use `submit_engagement` with `emoji` param |
| `contribute_to_pool` | Use `submit_engagement` with `emoji` param |
| `get_pool_status` | Use `get_reactions` |
| `list_active_pools` | Use `get_reactions` |

**Error Response**:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Pool system deprecated. Use submit_engagement with emoji param for reactions."
  },
  "id": 1
}
```

## CLI Commands

### cs content get

```bash
cs content get <content_id>
```

Retrieve and display a content item with decay state.

### cs content list

```bash
cs content list --space <space_id> [--limit 50] [--offset 0]
```

List content in a space, sorted by recency.

### cs prune

```bash
cs prune [--dry-run] [--threshold 0.0625]
```

Prune expired content. Use `--dry-run` to preview without deleting.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ContentNotFound` | Content ID doesn't exist or was pruned | Check ID, content may have decayed |
| `ContentDecayed` | Content below decay threshold | Cannot engage with expired content |
| `SelfEngagement` | User tried to engage with own content | Use a different identity |
| `InvalidPow` | PoW proof doesn't meet difficulty | Increase PoW computation |
| `ContentTooLarge` | Content exceeds size limits | Reduce content size or use chunking |
| `TooManyMediaRefs` | More than 4 media attachments | Reduce to 4 or fewer |
| `HashMismatch` | Retrieved content hash doesn't match | Network corruption, retry request |
| `NoPeersAvailable` | No peers have requested content | Content may not be widely available |
| `MaxRetriesExhausted` | Failed to retrieve after 3 attempts | Try again later or different peers |
| `VideoProhibited` | Attempted to upload video | Video content not supported |

## Testing

### Unit Tests

```bash
# Run decay calculation tests
cargo test --package swimchain --lib content::decay::tests

# Run engagement tests
cargo test --package swimchain --lib content::engagement::tests

# Run pruning tests
cargo test --package swimchain --lib content::pruning::tests

# Run pool tests (legacy)
cargo test --package swimchain --lib content::pool::tests
```

### Integration Tests

```bash
# Test decay flow end-to-end
cargo test --test decay_edge_cases

# Test content retrieval protocol
cargo test --test content_retrieval

# Test engagement processing
cargo test --test engagement_pools
```

### Test Coverage Summary

| Area | Test File | Coverage |
|------|-----------|----------|
| Decay calculation | `src/content/decay.rs` | Floor, basic decay, engagement reset, adaptive, spam-flagged |
| Engagement | `src/content/engagement.rs` | Reply/quote reset, pool pending, pool complete, decayed rejection |
| Pools | `src/content/pool.rs` | Creation, multi-contributor, sybil resistance, expiry |
| Pruning | `src/content/pruning.rs` | Basic prune, tombstone creation, grace period |
| Chunking | `src/content/chunking.rs` | Serialization, size thresholds, roundtrip |
| Retrieval | `src/content/retrieval.rs` | Manager creation, local content, peer availability |
| Addressing | `src/content/addressing.rs` | Classification, verification, store/retrieve |
| Edge Cases | `tests/decay_edge_cases.rs` | Storage pressure, pinned content |

## Known Limitations

1. **Engagement Pools Deprecated**: The original engagement pool system (collective PoW contributions) has been deprecated in favor of direct PoW-based reactions. Pool RPC methods return errors. The internal pool infrastructure still exists but is not exposed via RPC.

2. **No ContentType::Media**: Despite MASTER_FEATURES mentioning a Media content type, the implementation only supports Post, Reply, Quote, and Edit. Media is attached via `media_refs` field instead.

3. **Video Prohibited**: The content format validation explicitly rejects video MIME types. Only image formats (JPEG, PNG, GIF, WebP) are supported.

4. **Half-Life Not Configurable Per-Space**: Adaptive half-life is global, not per-space. High-traffic spaces cannot have different decay rates than low-traffic ones.

5. **Tombstone Accumulation**: Tombstones for parent preservation are never pruned, which can accumulate over time.

6. **32-bit Content Size**: The `content_size` field is `u32`, limiting accurate size tracking for content >4GB (though `MAX_CONTENT_SIZE` is 1GB).

7. **Decay Floor Not Configurable**: The 48-hour decay floor is hardcoded and cannot be adjusted per-space or per-content-type.

## Future Work

Based on gap analysis and codebase review:

1. **Per-Space Half-Life**: Allow spaces to configure their own decay parameters within global bounds.

2. **Tombstone Cleanup**: Implement eventual tombstone pruning after a configurable grace period.

3. **Video Support**: Consider allowing video content with appropriate size limits and chunking.

4. **Pin Cost Documentation**: The pin/preservation system needs cost calculation documentation.

5. **Decay Analytics RPC**: Add methods for decay statistics, predictions, and aggregate metrics.

6. **Edit Workflow**: Document the full edit content type workflow and constraints.

7. **Preservation PoW**: Document the author preservation PoW mechanism for extended content lifetime.

## Related Features

- **Storage Layer** - Content blob storage, caching, and eviction
- **Engagement & Social** - Social graph, notifications, attribution ("Kept alive by")
- **Spam Attestation** - Spam flagging and accelerated decay triggers
- **React SDK** - Client-side decay hooks (`useDecay`, `useIsProtected`, `useIsDecayed`)
- **WASM Bindings** - `calculate_decay` function for browser clients
- **API Layer** - `ContentEvent::ContentDecayed` event for notifications

---

*Generated: 2026-01-11*
*Source: Swimchain Content & Decay Engine Implementation*
*Locations: `src/content/`, `src/types/content.rs`, `src/rpc/methods.rs`*
