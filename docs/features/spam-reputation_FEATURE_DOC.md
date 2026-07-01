# Spam & Reputation - Feature Documentation

## Overview

The Spam & Reputation system provides Swimchain's community-driven content moderation through two interconnected mechanisms:

1. **Spam Attestation System**: Community members flag content as spam using cryptographically signed attestations. Multiple attestations from independent sponsor trees trigger accelerated content decay, while counter-attestations can clear incorrect flags.

2. **Reputation Scoring System**: Tracks identity behavior over time, affecting rate limits, content decay, and posting capabilities. Scores range from -1000 to unbounded positive values, with five effect tiers determining restrictions.

3. **Spam Heuristics**: Automated detection of abuse patterns (duplicate content, rate limit violations, suspicious patterns) that flag content for review without automatic removal.

This system is designed to be Sybil-resistant through sponsor tree deduplication, ensuring attackers cannot create many identities to manipulate spam flags.

## Architecture

```
                          Content Creation
                                 |
                                 v
                   +------------------------+
                   |   Spam Heuristics      |
                   | - Rate Limiting        |
                   | - Repetition Detection |
                   | - Cross-Posting        |
                   | - Pattern Detection    |
                   +-----------+------------+
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
     +------------------+            +-------------------+
     | Review Flag Store|            | Content Storage   |
     | (Advisory Only)  |            | (PoW Validated)   |
     +------------------+            +--------+----------+
                                              |
                                              v
                   +------------------------+----------------+
                   |                                         |
                   v                                         v
          +------------------+                    +-------------------+
          | Spam Attestation |                    | Reputation Store  |
          | Store            |                    |                   |
          | - 3-tree thresh  |<------------------>| - Score tracking  |
          | - Counter attest |                    | - Effect tiers    |
          +------------------+                    +-------------------+
                   |
                   v
          +------------------+
          | Decay Engine     |
          | 4-hour half-life |
          | for flagged      |
          +------------------+
```

### Component Locations

| Component | Location | Purpose |
|-----------|----------|---------|
| Spam Attestation | `src/spam_attestation/` | Community flagging with Sybil resistance |
| Reputation | `src/reputation/` | Identity behavior tracking and scoring |
| Spam Heuristics | `src/spam_heuristics/` | Automated abuse pattern detection |
| Anti-Abuse Handler | `src/api/anti_abuse.rs` | Integration layer (currently disabled) |
| RPC Methods | `src/rpc/methods.rs` | API endpoints for spam operations |

## Data Structures

### SpamAttestation
A signed declaration that content should be treated as spam. Size: 145 bytes.

| Field | Type | Description |
|-------|------|-------------|
| `content_hash` | `[u8; 32]` | SHA-256 hash of the content being flagged |
| `attester` | `[u8; 32]` | Public key of the attester (must be Resident+) |
| `reason` | `SpamReason` | Objective behavioral category for the flag |
| `timestamp` | `u64` | Unix timestamp when attestation was created |
| `pow_nonce` | `u64` | PoW nonce proving computational cost |
| `signature` | `[u8; 64]` | Ed25519 signature over the attestation data |

### SpamReason
Objective behavioral categories for spam classification.

| Value | Name | Description |
|-------|------|-------------|
| `0x01` | Advertising | Commercial promotion unrelated to discussion context |
| `0x02` | Repetitive | Duplicate or near-duplicate content posted repeatedly |
| `0x03` | OffTopic | Content irrelevant to the space or topic |
| `0x04` | Harassment | Targeted harassment or abuse of another user |
| `0x05` | IllegalContent | Content that may violate laws (CSAM, terrorism, etc.) |

### StoredSpamAttestation
Attestation with metadata for Sybil-resistant aggregation.

| Field | Type | Description |
|-------|------|-------------|
| `attestation` | `SpamAttestation` | The attestation itself |
| `sponsor_tree_root` | `[u8; 32]` | Root of attester's sponsor tree (deduplication key) |
| `is_deduplicated` | `bool` | Whether this counts toward threshold |

### CounterAttestation
Defense attestation to clear spam flags. Size: 136 bytes.

| Field | Type | Description |
|-------|------|-------------|
| `content_hash` | `[u8; 32]` | Hash of the content being defended |
| `counter_attester` | `[u8; 32]` | Public key of counter-attester (must be Lifeguard+) |
| `timestamp` | `u64` | Unix timestamp when created |
| `signature` | `[u8; 64]` | Ed25519 signature over the data |

### CounterAttestationState
Tracks counter-attestation progress for content.

| Field | Type | Description |
|-------|------|-------------|
| `content_hash` | `[u8; 32]` | Content being tracked |
| `counter_attesters` | `Vec<[u8; 32]>` | Unique counter-attesters |
| `is_cleared` | `bool` | Whether threshold (5) was reached |
| `cleared_at` | `Option<u64>` | Timestamp when cleared |

### PosterReputation
Complete reputation record for an identity.

| Field | Type | Description |
|-------|------|-------------|
| `identity` | `[u8; 32]` | Identity public key |
| `spam_flags_received` | `u32` | Total spam flags against this identity's content |
| `spam_flags_countered` | `u32` | Flags that were successfully counter-attested |
| `illegal_content_flags` | `u32` | Illegal content flags (should be 0 normally) |
| `quality_attestations` | `u32` | Positive quality attestations received |
| `attester_countered_count` | `u32` | Times this identity's attestations were countered |
| `counter_attestation_successes` | `u32` | Times this identity successfully counter-attested |
| `identity_age_days` | `u32` | Age of identity in days |
| `last_spam_flag_at` | `u64` | Unix timestamp of last spam flag |
| `last_counter_success_at` | `u64` | Unix timestamp of last successful counter |
| `cached_score` | `i32` | Cached reputation score |
| `total_posts` | `u32` | Total posts created |
| `total_engagements` | `u32` | Total engagements (replies, reactions) |

### ReputationEffect
Effect tiers based on reputation score.

| Tier | Score Range | Decay Multiplier | Rate Limit | Effects |
|------|-------------|------------------|------------|---------|
| Trusted | > 200 | 1.5x (slower) | 100% | Full capabilities |
| Normal | 101-200 | 1.0x | 100% | Standard limits |
| Watched | 51-100 | 1.0x | 50% | Reduced rate limits |
| Restricted | 1-50 | 1.0x | 20% | Limited posting, no new spaces |
| Untrusted | <= 0 | 0.25x (4x faster) | 10% | Severe restrictions, accelerated decay |

### ContentFingerprint
Fingerprint for duplicate detection.

| Field | Type | Description |
|-------|------|-------------|
| `hash` | `[u8; 32]` | SHA-256 hash of normalized content |
| `simhash` | `u64` | Simhash for near-duplicate detection |
| `length` | `u32` | Content length in bytes |
| `space_id` | `[u8; 16]` | Space where content was posted |
| `author` | `[u8; 32]` | Author of the content |
| `timestamp` | `u64` | Unix timestamp of creation |

### HeuristicResult
Result of heuristic evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `has_violations` | `bool` | Whether any violations were detected |
| `violations` | `Vec<HeuristicViolation>` | List of violations found |
| `confidence` | `f32` | Overall confidence score (0.0-1.0) |
| `should_flag` | `bool` | Whether content should be flagged for review |

### ViolationType
Types of heuristic violations.

| Type | Default Weight | Description |
|------|----------------|-------------|
| `Repetition` | 0.9 | Duplicate content detected |
| `NearDuplicate` | 0.7 | Near-duplicate content detected |
| `CrossPosting` | 0.8 | Cross-posted to too many spaces |
| `RateLimit` | 1.0 | Rate limit exceeded |
| `HighLinkDensity` | 0.6 | High ratio of links to words |
| `ExcessiveMentions` | 0.5 | Too many @mentions |
| `AllCaps` | 0.3 | All or mostly uppercase text |
| `SuspiciousPattern` | 0.5 | Generic pattern match |

## Core APIs

### Spam Attestation Module

#### aggregate_attestations()
**Signature**: `fn aggregate_attestations(content_hash: [u8; 32], attestations: &[StoredSpamAttestation], is_cleared: bool) -> AttestationAggregation`

**Purpose**: Aggregates spam attestations using sponsor tree deduplication to determine if content exceeds the spam threshold.

**Parameters**:
- `content_hash`: Hash of the content being evaluated
- `attestations`: List of stored attestations with pre-computed tree roots
- `is_cleared`: Whether content has been cleared by counter-attestations

**Returns**: `AttestationAggregation` with deduplicated count and threshold status.

**Example**:
```rust
let attestations = store.get_attestations_for_content(&content_hash)?;
let counter_state = store.get_counter_state(&content_hash)?;
let result = aggregate_attestations(content_hash, &attestations, counter_state.is_cleared);

if result.should_accelerate_decay {
    // Apply 4-hour decay half-life
}
```

#### find_sponsor_tree_root()
**Signature**: `fn find_sponsor_tree_root<F>(identity: &[u8; 32], get_sponsor: F) -> Result<[u8; 32], SpamAttestationError>`

**Purpose**: Traverses sponsorship chain to find the root identity for Sybil deduplication.

**Parameters**:
- `identity`: Public key to look up
- `get_sponsor`: Callback to get sponsor of an identity

**Returns**: Tree root public key or error if lookup fails.

### Reputation Module

#### calculate_reputation_score()
**Signature**: `fn calculate_reputation_score(rep: &PosterReputation, days_since_last_flag: u32) -> i32`

**Purpose**: Calculates reputation score using the comprehensive formula.

**Formula**:
```
score = base + age_bonus + quality_bonus + counter_success_bonus + counter_bonus
        + recovery_bonus + fast_recovery
        - spam_penalty - attester_penalty - illegal_penalty
```

**Score Components**:
| Component | Value | Description |
|-----------|-------|-------------|
| Base | 100 | Starting score for all identities |
| Age Bonus | +1/day (max 365) | Reward for account longevity |
| Quality Bonus | +5 per attestation | Positive signals from community |
| Counter Success | +3 per success | Helping defend falsely flagged content |
| Counter Bonus | +15 per flag | When your spam flags are cleared |
| Recovery Bonus | +1/day (max 90) | Time since last spam flag |
| Fast Recovery | +10 per counter | Immediate recovery for cleared flags |
| Spam Penalty | -20 per flag | Received spam attestations |
| Attester Penalty | -30 per counter | Bad-faith attestation behavior |
| Illegal Penalty | -1000 per flag | Devastating for illegal content |

**Example**:
```rust
let rep = reputation_store.get(&identity)?;
let days = days_since_last_flag(rep.last_spam_flag_at, current_time);
let score = calculate_reputation_score(&rep, days);
let effect = get_reputation_effect(score);
```

#### get_reputation_effect()
**Signature**: `fn get_reputation_effect(score: i32) -> ReputationEffect`

**Purpose**: Maps reputation score to effect tier.

**Returns**: `ReputationEffect` enum variant.

### Spam Heuristics Module

#### RateLimitTracker::check()
**Signature**: `fn check(&mut self, author: &[u8; 32], space_id: &[u8; 16], current_time: u64) -> HeuristicResult`

**Purpose**: Checks if posting would exceed rate limits and increments counters.

#### RepetitionDetector::check()
**Signature**: `fn check(&mut self, content: &[u8], space_id: &[u8; 16], author: &[u8; 32], current_time: u64) -> HeuristicResult`

**Purpose**: Detects exact and near-duplicate content within time window.

#### CrossPostingTracker::check()
**Signature**: `fn check(&mut self, content: &[u8], space_id: &[u8; 16], author: &[u8; 32], current_time: u64) -> HeuristicResult`

**Purpose**: Tracks cross-posting across spaces and flags when threshold exceeded.

#### PatternDetector::check()
**Signature**: `fn check(&self, content: &[u8]) -> HeuristicResult`

**Purpose**: Detects suspicious patterns (high link density, excessive mentions, all caps).

## Behaviors

### Spam Attestation Flow

1. **Content Published**: User publishes content with PoW validation
2. **Attestation Submitted**: Community member (Resident+) submits spam attestation
3. **Sybil Deduplication**: System finds attester's sponsor tree root
4. **Aggregation**: Attestations grouped by tree root
5. **Threshold Check**: If 3+ unique trees attested, flag content
6. **Decay Applied**: Flagged content receives 4-hour decay half-life
7. **Reputation Impact**: Content author receives -20 reputation per flag

**Edge Cases**:
- Same-tree attestations: Multiple attesters from one sponsor tree count as 1
- Rapid attestations: Rate limited to 10 per identity per hour
- Old attestations: Rejected if timestamp > 24 hours old

### Counter-Attestation Flow

1. **Content Flagged**: Content exceeds spam threshold (3+ trees)
2. **Counter Submitted**: Lifeguard+ member submits counter-attestation
3. **Counter Tracked**: Unique counter-attesters accumulated
4. **Threshold Check**: If 5+ Lifeguards counter-attested, clear flag
5. **Flag Cleared**: Content restored to normal decay
6. **Reputation Recovery**: Content author receives +15 per cleared flag + +10 fast recovery
7. **Attester Penalty**: Original attesters receive -30 reputation each

### Reputation Recovery

1. **Daily Passive Recovery**: +1 point per day since last spam flag (max 90 days)
2. **Fast Recovery**: +10 points per counter-attested flag (immediate)
3. **Quality Contributions**: +5 per quality attestation, +3 per successful counter-attestation
4. **Age Bonus**: +1 per day of identity age (max 365)

**Note**: Recovery requires explicit `refresh_score()` or `update_score()` calls - it is not automatically applied.

### Heuristic Detection Flow

1. **Content Submitted**: Pre-PoW validation check
2. **Rate Limit Check**: Daily (20 posts) and per-space-per-hour (5 posts)
3. **Repetition Check**: Exact/near-duplicate within 1-hour window
4. **Cross-Post Check**: Same content in 3+ spaces within 24 hours
5. **Pattern Check**: Link density, mentions, caps, repeated chars
6. **Review Flag**: If violations detected, flag for human review
7. **Advisory Only**: Heuristics never auto-remove content

## Configuration

### Spam Attestation Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SPAM_ATTESTATION_THRESHOLD` | 3 | Unique trees needed to flag content |
| `COUNTER_ATTESTATION_THRESHOLD` | 5 | Lifeguards needed to clear flag |
| `FLAGGED_DECAY_HALF_LIFE_SECS` | 14,400 | 4-hour decay for flagged content |
| `SPAM_ATTESTATION_POW_DIFFICULTY` | 12 | PoW difficulty for attestations |
| `SPAM_ATTESTATION_RATE_LIMIT_HOURLY` | 10 | Max attestations per identity per hour |
| `SPAM_ATTESTATION_MAX_AGE_SECS` | 86,400 | Max attestation age (24 hours) |

### Reputation Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `REPUTATION_BASE_SCORE` | 100 | Starting score for new identities |
| `REPUTATION_RECOVERY_PER_DAY` | 1 | Points recovered per day |
| `REPUTATION_RECOVERY_MAX_DAYS` | 90 | Maximum recovery bonus |
| `REPUTATION_FAST_RECOVERY_PER_COUNTER` | 10 | Fast recovery per cleared flag |
| `REPUTATION_TRUSTED_THRESHOLD` | 200 | Score for Trusted status |
| `REPUTATION_NORMAL_THRESHOLD` | 100 | Score for Normal status |
| `REPUTATION_WATCHED_THRESHOLD` | 50 | Score for Watched status |
| `REPUTATION_RESTRICTED_THRESHOLD` | 0 | Score for Restricted status |
| `REPUTATION_MIN_SCORE` | -1000 | Minimum score floor |

### Spam Heuristics Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_POSTS_PER_DAY` | 20 | Daily post limit |
| `POSTS_PER_SPACE_PER_HOUR` | 5 | Per-space hourly limit |
| `MAX_CROSS_POST_SPACES` | 3 | Max spaces for same content |
| `CROSS_POST_WINDOW_SECS` | 86,400 | 24-hour cross-post window |
| `REPETITION_WINDOW_SECS` | 3,600 | 1-hour duplicate window |
| `MAX_EXACT_DUPLICATES` | 1 | Max exact duplicates allowed |
| `SIMILARITY_THRESHOLD` | 0.85 | Near-duplicate threshold (85%) |
| `MAX_LINK_DENSITY` | 0.25 | Max links/words ratio |
| `MAX_MENTIONS_PER_POST` | 10 | Max @mentions per post |
| `MIN_CONTENT_FOR_PATTERNS` | 10 | Min bytes for pattern detection |

## RPC Methods

### submit_spam_attestation

Submit a spam attestation for content.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_spam_attestation",
  "params": {
    "content_hash": "hex-encoded-32-bytes",
    "attester": "hex-encoded-32-bytes",
    "reason": "advertising|repetitive|off_topic|harassment|illegal_content",
    "timestamp": 1735689600,
    "pow_nonce": 12345,
    "signature": "hex-encoded-64-bytes"
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "threshold_reached": true,
    "current_count": 3,
    "required_count": 3,
    "spam_threshold": 3
  },
  "id": 1
}
```

### submit_counter_attestation

Submit a counter-attestation to defend content.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_counter_attestation",
  "params": {
    "content_hash": "hex-encoded-32-bytes",
    "counter_attester": "hex-encoded-32-bytes",
    "timestamp": 1735689600,
    "signature": "hex-encoded-64-bytes"
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "is_cleared": false,
    "current_counter_count": 3,
    "remaining_to_clear": 2
  },
  "id": 1
}
```

### get_spam_status

Get spam status for content.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_spam_status",
  "params": {
    "content_hash": "hex-encoded-32-bytes"
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "attestation_count": 3,
    "unique_tree_count": 3,
    "threshold_reached": true,
    "is_cleared": false,
    "counter_count": 2,
    "remaining_to_clear": 3,
    "reasons": ["advertising", "repetitive"],
    "spam_threshold": 3
  },
  "id": 1
}
```

## CLI Commands

### cs spam-status

```bash
cs spam-status <content-hash>
```

Get the spam status of specific content, including attestation counts and whether threshold has been reached.

### cs reputation

```bash
cs reputation <identity>
```

Display reputation score and effect tier for an identity.

## Error Handling

### Spam Attestation Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `SponsorTreeError` | Failed to resolve attester's sponsor tree | Verify identity has valid sponsorship chain |
| `StorageError` | Database operation failed | Check database connectivity and disk space |
| `ValidationError` | Invalid attestation format | Verify signature, PoW, and timestamp |
| `RateLimitExceeded` | Too many attestations per hour | Wait for rate limit window to reset |

### Reputation Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `StorageError` | Failed to read/write reputation | Check database connectivity |
| `IdentityNotFound` | No reputation record exists | Will auto-create with base score |

### Heuristics Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `RateLimitExceeded` | Daily/hourly limit reached | Wait for limit reset |
| `DuplicateContent` | Exact duplicate in window | Modify content before reposting |
| `ExcessiveCrossPosting` | Same content in 3+ spaces | Use different content per space |

## Testing

### Unit Tests

```bash
# Run spam attestation tests
cargo test spam_attestation

# Run reputation tests
cargo test reputation

# Run heuristics tests
cargo test spam_heuristics
```

### Integration Tests

```bash
# Run spam attestation RPC tests
cargo test --test spam_attestation_rpc

# Run full anti-abuse integration
cargo test --test anti_abuse
```

### Manual Testing

```bash
# Start a test node
cargo run -- node --data-dir ./test-data

# Submit spam attestation via RPC
curl -X POST http://localhost:8080/rpc -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "method": "get_spam_status",
  "params": {"content_hash": "0000000000000000000000000000000000000000000000000000000000000001"},
  "id": 1
}'
```

## Known Limitations

### Implementation Gaps

1. **Anti-Abuse Module Disabled**: The comprehensive `AntiAbuseHandler` in `src/api/anti_abuse.rs` is currently commented out (`pub mod anti_abuse` disabled in `src/api/mod.rs:76`). This means the integrated content creation flow with pre-PoW validation is not active.

2. **Level Module Missing**: The `SwimmerLevel` enum is referenced in `anti_abuse.rs` but the `level` module does not exist. This prevents level-based rate limiting (e.g., different limits for Guppy vs Lifeguard).

3. **Level-Based Rate Limiting**: Without the level module, all users share the same 20 posts/day limit. The documented level-based limits are not implemented.

4. **Network Gossip Not Implemented**: Wire protocol message types (0x80-0x84) are defined but attestation propagation to peers is not implemented. Attestations are stored locally only.

5. **Reputation Recovery Is Passive**: The "+1 per day" recovery requires explicit `refresh_score()` calls. There is no background job to auto-update scores.

6. **Lifeguard+ Verification**: Counter-attestation requires Lifeguard+ level, but without the level module, this cannot be verified.

### Documentation Discrepancies

| Documented | Actual |
|------------|--------|
| Trusted: 150+ | Implemented as > 200 |
| Normal: 100-149 | Implemented as 101-200 |
| Watched: 50-99 | Implemented as 51-100 |
| Restricted: 25-49 | Implemented as 1-50 |
| Untrusted: 0-24 | Implemented as <= 0 |

## Future Work

1. **Enable Anti-Abuse Module**: Re-enable the integration layer with proper level system support.

2. **Implement Level System**: Create the `SwimmerLevel` module to enable level-based rate limiting and Lifeguard+ verification.

3. **Add Network Gossip**: Implement attestation propagation via the defined wire protocol messages.

4. **Background Score Refresh**: Add a periodic job to refresh reputation scores and apply passive recovery.

5. **Decay Engine Integration**: Wire spam flagging directly into the content decay engine for automatic 4-hour half-life application.

6. **Quality Attestations**: Implement positive quality attestations to reward good content.

7. **Undocumented Heuristics**: Add AllCaps and SuspiciousPattern detection to Master Features documentation.

## Related Features

- **Sponsorship & Sybil Resistance**: Sponsor tree used for attestation deduplication
- **Proof-of-Work Systems**: Action PoW for attestation submission
- **Content & Decay Engine**: Accelerated decay for flagged content
- **Blocklist Protocol**: Related content moderation for illegal content
- **Engagement & Social**: Swimmer levels may influence spam thresholds

## Quality Checklist Status

| Item | Status | Notes |
|------|--------|-------|
| 3-attester threshold enforced | Implemented | `SPAM_ATTESTATION_THRESHOLD = 3` |
| Sponsor tree deduplication works | Implemented | `find_sponsor_tree_root()` with `aggregate_attestations()` |
| Counter-attestation 5-Lifeguard rule | Partial | Threshold implemented, Lifeguard verification needs level module |
| Reputation recovery +1/day | Implemented | Requires explicit `refresh_score()` calls |
| Heuristics don't false-positive | Advisory | Heuristics flag for review only, never auto-remove |
