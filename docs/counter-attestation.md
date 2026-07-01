# Counter-Attestation System

This document describes the counter-attestation mechanism in Swimchain, which allows trusted community members to dispute spam flags and restore normal visibility to content.

## Overview

Counter-attestation is the appeals process for spam-flagged content. When content receives spam attestations from 3+ independent sponsor trees, it enters accelerated decay (4-hour half-life instead of 7 days). Counter-attestation allows this to be reversed.

**Key Properties:**
- Only Lifeguard+ members (Level 3+) can counter-attest
- 5 independent counter-attestations cancel a spam flag
- Each counter-attestation provides +10 heat bonus (fast recovery)
- Maximum heat bonus is +50 (capped at 5 counter-attestations)
- Same rate limit applies (10 per hour)

## Design Rationale

### Why Lifeguard+ Only?

Counter-attestation requires a higher trust level than spam attestation (Resident+) because:

1. **Asymmetric Impact**: Removing a spam flag has greater impact than adding one (reversing community consensus)
2. **Abuse Prevention**: Spammers have stronger incentive to clear their own flags
3. **Quality Signal**: Lifeguard+ members have demonstrated sustained positive contribution (60+ days, 20GB+ hosting)

### Why 5 Counter-Attestations?

The threshold of 5 is intentionally higher than the spam threshold of 3:

- **Stronger Consensus**: Clearing a flag should require more certainty than setting one
- **Sybil Resistance**: Even with tree deduplication, higher thresholds are more resilient
- **Friction Balance**: High enough to prevent easy abuse, low enough to allow legitimate appeals

### Fast Recovery Mechanism

Instead of waiting for natural decay, counter-attestations provide immediate heat bonuses:

| Counter-Attestations | Heat Bonus | Effect |
|---------------------|------------|--------|
| 1 | +10 | Partial recovery |
| 2 | +20 | Moderate recovery |
| 3 | +30 | Significant recovery |
| 4 | +40 | Near-full recovery |
| 5 | +50 | Flag cleared + max bonus |

This allows content to recover visibility proportionally to community support even before the 5-counter threshold is reached.

## Data Structures

### CounterAttestation

```rust
pub struct CounterAttestation {
    /// Hash of the content being defended
    pub content_hash: [u8; 32],

    /// Public key of the counter-attester (must be Lifeguard+)
    pub counter_attester: [u8; 32],

    /// Unix timestamp when counter-attestation was created
    pub timestamp: u64,

    /// Ed25519 signature over the counter-attestation data
    pub signature: [u8; 64],
}
```

### CounterAttestationState

Tracks the accumulated counter-attestations for a piece of content:

```rust
pub struct CounterAttestationState {
    /// Content hash
    pub content_hash: [u8; 32],

    /// Counter-attesters (deduplicated by public key)
    pub counter_attesters: Vec<[u8; 32]>,

    /// Whether the threshold has been reached (content cleared)
    pub is_cleared: bool,

    /// Timestamp when content was cleared (if applicable)
    pub cleared_at: Option<u64>,
}
```

### CounterAttestationResult

Returned by the manager after processing:

```rust
pub struct CounterAttestationResult {
    /// Whether the counter-attestation was accepted
    pub accepted: bool,

    /// New total count of counter-attestations
    pub total_counter_attestations: u8,

    /// Whether this counter-attestation caused the spam flag to be cleared
    pub flag_cleared: bool,

    /// Heat bonus to apply to content
    pub heat_bonus: u64,

    /// Timestamp when flag was cleared (if flag_cleared is true)
    pub cleared_at: Option<u64>,

    /// Reason for rejection, if any
    pub rejection_reason: Option<SpamAttestationError>,
}
```

## Validation Rules

Counter-attestations are validated against these requirements:

1. **Level Check**: Counter-attester must be Lifeguard+ (Level 3+)
2. **Rate Limit**: Counter-attester has not exceeded 10 attestations/hour
3. **Timestamp**: Within 24-hour window (not too old, not future)
4. **Signature**: Valid Ed25519 signature over signing message
5. **Content Exists**: Content must have existing spam attestations
6. **No Duplicates**: Counter-attester hasn't already counter-attested this content

### Signing Message Format

```
"COUNTER_ATTESTATION" || content_hash || timestamp
```

## Usage

### Check Eligibility

```rust
use swimchain::spam_attestation::{can_counter_attest, required_level_for_counter};
use swimchain::level::SwimmerLevel;

// Check if a user can counter-attest
let level = SwimmerLevel::Lifeguard;
let attestations_this_hour = 5;

if can_counter_attest(level, attestations_this_hour) {
    println!("User is eligible to counter-attest");
}

// Get required level
let required = required_level_for_counter();
assert_eq!(required, SwimmerLevel::Lifeguard);
```

### Process Counter-Attestation

```rust
use swimchain::spam_attestation::{
    CounterAttestationManager, CounterAttestation, SpamAttestationStore
};
use swimchain::level::SwimmerLevel;

let store = SpamAttestationStore::open(db);
let manager = CounterAttestationManager::new(&store);

let counter = CounterAttestation {
    content_hash: content_hash,
    counter_attester: my_pubkey,
    timestamp: current_unix_time,
    signature: sign_counter_attestation(&my_keypair, &content_hash, timestamp),
};

let result = manager.process(
    &counter,
    SwimmerLevel::Lifeguard,
    attestations_in_window,
    current_time,
    |pubkey, message, sig| verify_ed25519(pubkey, message, sig),
);

if result.accepted {
    println!("Counter-attestation accepted!");
    println!("Total: {}", result.total_counter_attestations);
    println!("Heat bonus: +{}", result.heat_bonus);

    if result.flag_cleared {
        println!("Spam flag has been cleared!");
    }
} else {
    println!("Rejected: {:?}", result.rejection_reason);
}
```

### Calculate Heat Bonus

```rust
use swimchain::spam_attestation::calculate_heat_bonus;

// Get heat bonus for any count
let bonus = calculate_heat_bonus(3);  // Returns 30
let bonus = calculate_heat_bonus(7);  // Returns 50 (capped)
```

### Check Content Status

```rust
let manager = CounterAttestationManager::new(&store);

// Check if content has been cleared
if manager.is_content_cleared(&content_hash)? {
    println!("Content has been cleared of spam flags");
}

// Get current heat bonus for content
let bonus = manager.get_heat_bonus(&content_hash)?;
println!("Current heat bonus: +{}", bonus);

// Get full state
let state = manager.get_state(&content_hash)?;
println!("Counter-attestations: {}/5", state.count());
println!("Remaining to clear: {}", state.remaining_to_clear());
```

## Wire Protocol

Counter-attestation messages use the spam attestation message types:

| Type | Name | Description |
|------|------|-------------|
| 0x81 | SPAM_COUNTER_ATTESTATION | Submit a counter-attestation |

### Message Format (0x81)

```
[content_hash: 32 bytes]
[counter_attester: 32 bytes]
[timestamp: 8 bytes, little-endian]
[signature: 64 bytes]
```

Total size: 136 bytes

## Integration with Decay System

Counter-attestations integrate with the heat/decay system:

1. **Without Counter-Attestations**: Spam-flagged content decays with 4-hour half-life
2. **With Partial Counter-Attestations**: Heat bonus offsets decay
3. **With 5 Counter-Attestations**: Content returns to normal 7-day decay

### Heat Bonus Application

When rendering content visibility:

```rust
let base_heat = calculate_base_heat(content);
let counter_bonus = manager.get_heat_bonus(&content.hash)?;
let effective_heat = base_heat + counter_bonus;

// Use effective_heat for visibility calculations
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `COUNTER_ATTESTATION_THRESHOLD` | 5 | Counter-attestations needed to clear |
| `COUNTER_ATTESTATION_HEAT_BONUS` | 10 | Heat per counter-attestation |
| `MAX_COUNTER_ATTESTATION_HEAT_BONUS` | 50 | Maximum heat bonus |
| `MIN_COUNTER_ATTESTER_LEVEL` | Lifeguard | Minimum level required |

## Security Considerations

### Sybil Resistance

Unlike spam attestations which use sponsor tree deduplication, counter-attestations deduplicate by public key only. This is acceptable because:

1. Higher level requirement (Lifeguard+) already provides Sybil resistance
2. Getting 5 Lifeguard+ accounts is significantly harder than 5 Resident+ accounts
3. Each Lifeguard represents 60+ days of legitimate participation

### Rate Limiting

Counter-attestations share the same rate limit as spam attestations (10/hour). This prevents:

- Rapid clearing of multiple spam flags
- Denial of service on the counter-attestation system
- Abuse by compromised high-level accounts

### Gaming Prevention

The system prevents several attack vectors:

1. **Self-Clearing**: Content authors cannot counter-attest their own content (different from spam attestation's self-attestation check, but functionally similar since Sybils from the same tree can't reach Lifeguard quickly)

2. **Collusion**: 5 independent Lifeguard+ members represents significant community consensus

3. **Timing Attacks**: 24-hour timestamp window prevents pre-computation attacks

## See Also

- [SPEC_12: Anti-Abuse Mechanisms](../specs/SPEC_12_ANTI_ABUSE.md)
- [RESEARCH_08: Attestation Mechanisms](../research/RESEARCH_08_ATTESTATION_MECHANISMS.md)
- [Spam Attestation Documentation](./spam-attestation.md)
