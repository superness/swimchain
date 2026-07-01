# Spam Attestation System

This document describes the spam attestation system implemented in Swimchain per SPEC_12 (Anti-Abuse).

## Overview

The spam attestation system provides decentralized content moderation without centralized control. Community members who have demonstrated long-term contribution (Resident+ level) can flag content as spam. When multiple independent attesters flag the same content, it triggers accelerated decay.

## Key Concepts

### Attestation Eligibility

Only **Resident+** level members can submit spam attestations. This requires:
- 30+ days of active participation
- 10GB+ lifetime hosting contribution
- 50%+ uptime ratio

This threshold ensures attesters have "skin in the game" and cannot easily create sockpuppet accounts for abuse.

### Spam Reasons

Attestations must specify an objective, behaviorally-specific reason:

| Code | Reason | Description |
|------|--------|-------------|
| 0x01 | Advertising | Commercial promotion unrelated to discussion |
| 0x02 | Repetitive | Duplicate or near-duplicate content |
| 0x03 | Off-Topic | Content irrelevant to the space |
| 0x04 | Harassment | Targeted abuse of another user |
| 0x05 | Illegal Content | Content that may violate laws |

These categories are intentionally objective to reduce subjective abuse.

### Sponsor Tree Deduplication (Sybil Resistance)

The critical innovation is **sponsor tree deduplication**. Every identity in Swimchain traces back to a genesis sponsor through a tree structure. When counting attestations:

1. For each attestation, find the attester's sponsor tree root
2. Group attestations by their tree root
3. Count unique tree roots, not individual attestations

**Example:**
- Alice (tree root: Genesis-A) attests
- Bob (tree root: Genesis-A) attests (same tree as Alice)
- Carol (tree root: Genesis-B) attests
- Dave (tree root: Genesis-C) attests

Even though 4 people attested, only 3 unique trees are represented. This prevents Sybil attacks where one bad actor creates many identities to amplify their flags.

### 3-Attester Threshold

Content is flagged as spam when **3 independent sponsor trees** attest to it. This threshold is based on prior art:
- Stack Overflow requires 6 flags
- Wikipedia uses 3-revert rule
- Our 3-tree requirement with deduplication provides stronger guarantees

### Accelerated Decay

When the threshold is reached:
- Normal half-life: 7 days (604,800 seconds)
- **Flagged half-life: 4 hours (14,400 seconds)**

This causes flagged content to decay ~42x faster, effectively removing it from circulation within a day rather than a month.

### Counter-Attestation

To prevent abuse of the flagging system:
- **5 Lifeguard+** members can clear a spam flag
- This restores normal decay behavior
- Counter-attesters must be higher level (50GB/month, 70%+ uptime)

## Wire Protocol

| Message | Code | Description |
|---------|------|-------------|
| MSG_SPAM_ATTESTATION | 0x80 | Submit spam attestation |
| MSG_COUNTER_ATTESTATION | 0x81 | Dispute spam flag |
| MSG_QUALITY_ATTESTATION | 0x82 | (Reserved) Positive quality signal |
| MSG_REPUTATION_QUERY | 0x83 | Query attestation state |
| MSG_REPUTATION_RESPONSE | 0x84 | Attestation state response |

## Data Structures

### SpamAttestation

```rust
pub struct SpamAttestation {
    pub content_hash: [u8; 32],    // Content being flagged
    pub attester: [u8; 32],        // Attester's public key
    pub reason: SpamReason,        // Objective reason code
    pub timestamp: u64,            // Unix timestamp
    pub pow_nonce: u64,            // PoW proof (12-bit difficulty)
    pub signature: [u8; 64],       // Ed25519 signature
}
```

### StoredSpamAttestation

```rust
pub struct StoredSpamAttestation {
    pub attestation: SpamAttestation,
    pub sponsor_tree_root: [u8; 32],  // For deduplication
    pub is_deduplicated: bool,        // Counts toward threshold?
}
```

## Validation Rules

1. **Signature**: Must be valid Ed25519 signature over attestation data
2. **PoW**: Must meet 12-bit difficulty (prevents spam of spam flags)
3. **Timestamp**: Within 24 hours (prevents stockpiling)
4. **Rate Limit**: Max 10 attestations per hour per identity
5. **Self-Attestation**: Cannot flag own content
6. **Level Check**: Attester must be Resident+

## Integration with Decay

The decay system checks attestation state when calculating content survival:

```rust
pub fn calculate_decay_state_full(
    content: &ContentItem,
    author_level: SwimmerLevel,
    current_time_ms: u64,
    base_half_life_secs: u64,
    is_spam_flagged: bool,  // <- From attestation aggregation
) -> DecayState
```

Spam flagging overrides level bonuses - even a PoolKeeper's content decays rapidly if flagged.

## Design Rationale

1. **No Central Authority**: Moderation is fully peer-to-peer
2. **Sybil Resistant**: Tree deduplication prevents sockpuppet amplification
3. **Reversible**: Counter-attestations can clear mistakes
4. **Proportional**: Requires multiple independent attesters
5. **Economic**: PoW and level requirements create real cost
6. **Objective Categories**: Reduces subjective abuse

## Implementation Files

- `src/spam_attestation/types.rs` - Data structures and constants
- `src/spam_attestation/validation.rs` - Attestation validation
- `src/spam_attestation/aggregation.rs` - Tree deduplication and counting
- `src/spam_attestation/counter.rs` - Counter-attestation logic
- `src/spam_attestation/storage.rs` - Persistent storage
- `src/spam_attestation/error.rs` - Error types
- `src/content/decay.rs` - Decay integration

## See Also

- [SPEC_12: Anti-Abuse Mechanisms](../specs/SPEC_12_ANTI_ABUSE.md)
- [RESEARCH_08: Attestation Mechanisms](../research/RESEARCH_08_ATTESTATION_MECHANISMS.md)
