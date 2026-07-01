# Peer Attestation Protocol

This document describes the peer attestation protocol for validating contribution claims in Swimchain. The protocol enables decentralized verification of node contributions without relying on trusted authorities.

## Overview

Peer attestation solves the problem of verifying self-reported contribution claims. When a node claims to have served bandwidth, relayed content, or maintained uptime, how do we verify these claims without a central authority?

The answer is peer attestation: other nodes that directly interacted with the claiming node can attest to the contributions they observed.

## Protocol Flow

```
┌─────────────────┐                    ┌─────────────────┐
│   Node A        │                    │   Node B, C, D  │
│   (Claimer)     │                    │   (Attesters)   │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. CONTRIBUTION_CLAIM (0x30)        │
         │  [ContributionRecord for period N]   │
         │─────────────────────────────────────>│
         │                                      │
         │                                      │ 2. Verify: Did I observe
         │                                      │    contributions from A?
         │                                      │
         │  3. CONTRIBUTION_ATTEST (0x31)       │
         │  [target=A, period=N, attestation]   │
         │<─────────────────────────────────────│
         │                                      │
         │  4. Collect attestations             │
         │                                      │
         │  5. Validate contribution            │
         │  - MIN_ATTESTERS (3) required        │
         │  - All attesters established         │
         │  - Variance < 20%                    │
         │  - Use median value                  │
         │                                      │
         ▼                                      ▼
   ┌─────────────────────────────────────────────┐
   │          ValidatedContribution              │
   │  - confirmed_bandwidth: median of values    │
   │  - attestation_count: number of attesters   │
   └─────────────────────────────────────────────┘
```

## Message Types

### CONTRIBUTION_CLAIM (0x30)

Sent when a node wants to publish a contribution record for attestation.

```rust
pub struct ContributionClaimPayload {
    pub record: ContributionRecord,
}
```

The record contains:
- `identity`: 32-byte Ed25519 public key
- `period`: Period number (weeks since genesis)
- `bandwidth_served`: Total bandwidth in bytes
- `uptime_ratio`: 0-10000 (0.00%-100.00%)
- `content_served_count`: Number of content requests served
- `posts_supported`: Posts kept alive through seeding
- `spaces_active`: Distinct spaces with activity
- `signature`: Ed25519 signature over the record

### CONTRIBUTION_ATTEST (0x31)

Sent by peers who observed the claimed contributions.

```rust
pub struct ContributionAttestPayload {
    pub target: [u8; 32],     // Target identity
    pub period: u32,          // Period being attested
    pub attestation: Attestation,
}

pub struct Attestation {
    pub attester: [u8; 32],           // Attesting peer's public key
    pub attestation_type: AttestationType,
    pub observed_value: u64,          // What they observed
    pub timestamp: u64,               // When they observed it
    pub signature: [u8; 64],          // Ed25519 signature
}

pub enum AttestationType {
    Bandwidth = 0x01,            // Bytes served
    Uptime = 0x02,               // Uptime ratio × 10000
    ContentAvailability = 0x03,  // Content hashes served
}
```

## Attestation Lifecycle

1. **Period Ends**: At the end of each contribution period (1 week), nodes finalize their contribution records.

2. **Claim Publication**: Nodes broadcast their `CONTRIBUTION_CLAIM` to peers they interacted with during the period.

3. **Attestation Generation**: Peers who observed contributions from the claimer generate attestations based on their local records.

4. **Attestation Collection**: The claimer collects attestations from peers.

5. **Validation**: Once enough attestations are collected, the contribution is validated using median aggregation.

## Validation Rules

A contribution claim is validated when:

1. **Minimum Attesters**: At least `MIN_ATTESTERS` (3) attestations received
2. **Established Attesters**: Each attester must be an established identity
3. **Recent Attestations**: Attestations must be within `ATTESTATION_PERIOD_WINDOW_SECS` (7 days)
4. **Low Variance**: Attestation values must have variance < 20% of median
5. **No Duplicates**: Each attester can only attest once per claim
6. **No Self-Attestation**: Target cannot attest their own claim

## Median Value Calculation

The protocol uses median instead of mean to resist outliers:

```
Attestation values: [100, 100, 10000, 100, 100]
Sorted: [100, 100, 100, 100, 10000]
Median: 100 (the outlier 10000 has no effect)
```

This makes it impossible for a minority of malicious attesters to significantly inflate the validated contribution.

## Storage

Attestations are stored in a sled database with composite keys:

```
Key: target[32] || period[4 BE] || attester[32] = 68 bytes
Value: bincode-serialized Attestation
```

This enables efficient prefix scans to retrieve all attestations for a given target and period.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_ATTESTERS` | 3 | Minimum attesters required |
| `MAX_ATTESTATION_VARIANCE_PERCENT` | 20 | Maximum allowed variance |
| `ATTESTATION_PERIOD_WINDOW_SECS` | 604,800 | Validity window (7 days) |
| `MIN_IDENTITY_AGE_SECS` | 604,800 | Minimum attester identity age |
| `MIN_ATTESTER_CONTRIBUTION_PERIODS` | 1 | Minimum contribution history |

## Integration with Contribution Tracking

The peer attestation system builds on the contribution tracking system (Milestone 7.1):

- `ContributionRecord` from `src/contribution/types.rs` is the claimed data
- `Attestation` from `src/attestation/types.rs` is the verification data
- `ValidatedContribution` is the result after successful validation

The separation allows:
- Self-reported claims to be stored immediately (Phase 1)
- Attestations to be collected asynchronously
- Validation to occur when enough attestations are gathered

## API

### Storing Attestations

```rust
use swimchain::attestation::{AttestationStore, Attestation};

let store = AttestationStore::open("path/to/db")?;
store.put_attestation(&target, period, &attestation)?;
```

### Retrieving Attestations

```rust
let attestations = store.get_attestations_for_claim(&target, period)?;
```

### Validating Contributions

```rust
use swimchain::attestation::{validate_contribution, AttesterInfo};

let result = validate_contribution(
    &target_identity,
    target_period,
    &attestations,
    |attester| lookup_attester_info(attester),
    current_time,
)?;
```

## See Also

- [Attestation Security](attestation-security.md) - Threat model and anti-gaming measures
- [Contribution Tracking](contribution-tracking.md) - Self-reported contribution metrics
- SPEC_09: Social Layer specification
- RESEARCH_01: Sybil Resistance research
