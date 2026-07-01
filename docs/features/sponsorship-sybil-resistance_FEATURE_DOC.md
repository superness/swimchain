# Sponsorship & Sybil Resistance - Feature Documentation

## Overview

The Sponsorship & Sybil Resistance system provides identity validation and trust propagation through a hierarchical sponsorship tree. New identities must be sponsored (vouched for) by existing members, creating accountability chains that deter bad actors.

**Key Principles:**
- **Trust Roots**: Genesis identities serve as hardcoded trust anchors
- **Hierarchical Vouching**: Sponsors are accountable for their sponsees' behavior
- **Consequence Propagation**: Penalties cascade up the sponsor chain with decay
- **Sybil Resistance**: Sponsorship limits and PoW requirements prevent mass identity creation

**Primary Implementation**: `src/sponsorship/`
**Specification Reference**: `specs/SPEC_11_SPONSORSHIP_ACCESS.md`

## Architecture

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                   Genesis Identities                      │
                    │         (Hardcoded trust roots, depth 0)                  │
                    └──────────────────────────────────────────────────────────┘
                                              │
                           ┌──────────────────┼──────────────────┐
                           ▼                  ▼                  ▼
                    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                    │  Identity A │    │  Identity B │    │  Identity C │
                    │  (depth 1)  │    │  (depth 1)  │    │  (depth 1)  │
                    └─────────────┘    └─────────────┘    └─────────────┘
                           │                  │
              ┌────────────┼────────┐         │
              ▼            ▼        ▼         ▼
         ┌────────┐  ┌────────┐ ┌────────┐ ┌────────┐
         │ A1     │  │ A2     │ │ A3     │ │ B1     │
         │(depth 2│  │(depth 2│ │(depth 2│ │(depth 2│
         └────────┘  └────────┘ └────────┘ └────────┘
```

### Module Structure

```
src/sponsorship/
├── types.rs           # Core data structures (SponsoredIdentityCreation, StoredSponsorship)
├── storage.rs         # Sled-based persistence (SponsorshipStore, tree operations)
├── validation.rs      # Validation rules V-SPONSOR-01 through V-SPONSOR-05
├── penalty.rs         # PenaltyType, MisbehaviorSeverity, PenaltyRecord
├── penalty_store.rs   # Penalty persistence and queries
├── propagation.rs     # Consequence propagation through sponsor chain
├── genesis_list.rs    # Hardcoded genesis identity list
├── rights.rs          # RightsStore (capacity, cooldown tracking)
├── offer_store.rs     # Public sponsorship offer persistence
├── offer_flow.rs      # Offer/claim lifecycle orchestration
├── offer_validation.rs # Offer-specific validation rules
├── orphan.rs          # Orphan handling and adoption
├── linear_chain.rs    # Sybil pattern detection
├── recovery.rs        # Penalty recovery mechanisms
├── wire.rs            # Network serialization format
└── error.rs           # Error types (35+ variants)
```

## Data Structures

### SponsoredIdentityCreation

Message for creating a sponsored identity.

| Field | Type | Description |
|-------|------|-------------|
| `new_identity_pubkey` | `PublicKey` | Ed25519 public key of new identity (32 bytes) |
| `sponsor_pubkey` | `Option<PublicKey>` | Sponsor's public key (None for genesis identities) |
| `sponsor_signature` | `Option<Signature>` | Sponsor's Ed25519 signature (None for genesis) |
| `identity_pow_proof` | `IdentityCreationProof` | PoW proof for identity creation |
| `creation_timestamp` | `u64` | Creation timestamp (UNIX seconds) |
| `probationary` | `bool` | Whether this is a probationary sponsorship |
| `genesis_proof` | `Option<GenesisProof>` | Genesis proof (required if sponsor_pubkey is None) |

**Signature Format**: `new_identity_pubkey(32 bytes) || creation_timestamp(8 bytes BE)`

### StoredSponsorship

Persisted sponsorship record in sled database.

| Field | Type | Description |
|-------|------|-------------|
| `sponsored_identity` | `PublicKey` | The sponsored identity's public key |
| `sponsor` | `Option<PublicKey>` | Sponsor's public key (None for genesis) |
| `creation_timestamp` | `u64` | When sponsorship was created |
| `status` | `SponsorshipStatus` | Current status (Active/Orphaned/Restricted/Revoked) |
| `penalty_until` | `Option<u64>` | Penalty expiration timestamp |
| `depth` | `u8` | Tree depth (0 for genesis, sponsor.depth + 1 otherwise) |
| `probationary` | `bool` | Whether probationary rules apply |
| `probation_expires` | `Option<u64>` | When probation expires |
| `positive_contribution_score` | `u16` | Contribution score (0-1000) |
| `is_genesis` | `bool` | True if this is a genesis identity |
| `orphaned_at` | `Option<u64>` | When identity was orphaned |

**Invariants**:
- Genesis identities: `sponsor == None` and `depth == 0` and `is_genesis == true`
- Non-genesis identities: `sponsor.is_some()`
- `positive_contribution_score <= 1000`

### SponsorshipStatus

```rust
#[repr(u8)]
pub enum SponsorshipStatus {
    Active = 0,     // In good standing
    Orphaned = 1,   // Sponsor was revoked
    Restricted = 2, // Under penalty
    Revoked = 3,    // Permanently banned
}
```

**State Transitions**:
```
Active ─────────────────────────────────────┐
   │                                        │
   ├──(penalty applied)──► Restricted ──────┤
   │                           │            │
   │                    (penalty expires)   │
   │                           │            │
   │                           ▼            │
   │                        Active          │
   │                                        │
   ├──(sponsor revoked)──► Orphaned ────────┤
   │                           │            │
   │                    (adopted)           │
   │                           │            │
   │                           ▼            │
   │                        Active          │
   │                                        │
   └──(illegal content)──► Revoked ◄────────┘
                        (permanent)
```

### MisbehaviorSeverity

```rust
#[repr(u8)]
pub enum MisbehaviorSeverity {
    None = 0,     // No misbehavior
    Spam = 1,     // Flagged as spam by 3+ Residents
    Abuse = 2,    // Pattern of harassment (5+ spam flags in 7 days)
    Illegal = 3,  // CSAM, terrorism content (hash match + 3 attestations)
}
```

**Consequence Durations by Hop**:
| Severity | Offender | Hop-1 Sponsor | Hop-2 Sponsor |
|----------|----------|---------------|---------------|
| Spam | 7 days | 7 days | Warning only |
| Abuse | 30 days | 30 days | 7 days |
| Illegal | Permanent | 90 days | 30 days |

### PenaltyType

```rust
#[repr(u8)]
pub enum PenaltyType {
    RestrictedPosting = 0,    // Identity can only view, not post
    LostInviteSlots = 1,      // Cannot sponsor new identities
    AcceleratedDecay = 2,     // Content decays faster (4-hour half-life)
    PermanentRevocation = 3,  // Identity permanently banned
}
```

**Application Rules**:
- **Offender**: `RestrictedPosting` for Spam/Abuse, `PermanentRevocation` for Illegal
- **Hop-1 Sponsor**: `LostInviteSlots` (1 slot for Spam, ALL slots for Abuse/Illegal)
- **Hop-1 Sponsor (Illegal)**: Additionally receives `AcceleratedDecay`
- **Hop-2 Sponsor**: `LostInviteSlots(1)` for Abuse/Illegal only

### PenaltyRecord

Complete penalty record per SPEC_11 Section 3.5.

| Field | Type | Description |
|-------|------|-------------|
| `identity` | `PublicKey` | Identity receiving the penalty |
| `penalty_type` | `PenaltyType` | Type of penalty applied |
| `started_at` | `u64` | When penalty was applied (UNIX seconds) |
| `base_expires_at` | `u64` | Original expiration time before recovery |
| `current_expires_at` | `u64` | Current expiration time (may be reduced) |
| `caused_by` | `Option<PublicKey>` | Identity that caused this penalty (None for offender) |
| `severity` | `MisbehaviorSeverity` | Severity of original misbehavior |
| `hop_distance` | `u8` | Distance from offender (0=offender, 1=sponsor, 2=sponsor's sponsor) |
| `slots_lost` | `u8` | Number of invite slots lost (1 for minor, 255 for all) |
| `additional_penalty` | `Option<PenaltyType>` | Additional penalty if applicable |

**Invariants**:
- `current_expires_at <= base_expires_at` (recovery can reduce, not extend)
- `hop_distance <= 2` for actual penalties (3+ gets warning only)
- If `penalty_type == PermanentRevocation`, then `base_expires_at == u64::MAX`

### GenesisProof

Proof of genesis identity status.

| Field | Type | Description |
|-------|------|-------------|
| `slot_number` | `u16` | Slot number (0 to MAX_GENESIS_IDENTITIES-1) |
| `proof_type` | `GenesisProofType` | Type of proof provided |
| `proof_data` | `Vec<u8>` | Proof data (interpretation depends on type) |
| `attestations` | `Vec<GenesisAttestation>` | Attestations from existing genesis identities |

**Proof Types**:
- `HardcodedList (0)`: Public key in hardcoded list (bootstrap period only)
- `MultiSigThreshold (1)`: 2/3 attestations from existing genesis identities
- `CommunityVote (2)`: **Not implemented** (returns `CommunityVoteNotImplemented` error)

### PublicSponsorshipOffer

Public sponsorship offer for claim-based sponsorship.

| Field | Type | Description |
|-------|------|-------------|
| `sponsor` | `PublicKey` | Sponsor creating the offer |
| `offer_id` | `[u8; 16]` | Unique offer identifier |
| `created_at` | `u64` | When offer was created |
| `expires_at` | `u64` | When offer expires |
| `max_sponsees` | `u8` | Maximum claimants (1-10) |
| `offer_type` | `SponsorshipOfferType` | Open or Probationary |
| `requirements` | `SponsorshipRequirements` | Requirements for claimants |
| `signature` | `Signature` | Sponsor's signature over offer data |

**Offer Types**:
- `Open`: Full sponsorship, non-probationary
- `Probationary`: Probationary status, reduced sponsor consequences

### LinearChainMetrics

Metrics for detecting manufactured trust chains.

| Field | Type | Description |
|-------|------|-------------|
| `identity` | `PublicKey` | Identity being analyzed |
| `sponsorship_depth` | `u8` | Depth in sponsorship tree |
| `subtree_breadth` | `u32` | Total descendants in subtree |
| `direct_sponsee_count` | `u32` | Number of direct sponsees |
| `avg_subtree_depth` | `f32` | Average depth of subtree |
| `linearity_score` | `f32` | depth / max(breadth, 1) |
| `flagged_as_suspicious` | `bool` | True if flagged for review |

**Flagging Conditions** (either triggers flagging):
1. `linearity_score > 0.8 AND depth >= 4`
2. `depth >= 4 AND direct_sponsee_count <= 1`

## Core APIs

### register_genesis_identity()

**Signature**:
```rust
pub fn register_genesis_identity(
    store: &SponsorshipStore,
    creation: &SponsoredIdentityCreation,
    current_time: u64,
    network_genesis_timestamp: u64,
) -> Result<StoredSponsorship, SponsorshipError>
```

**Purpose**: Register a new genesis identity during bootstrap period.

**Parameters**:
- `store`: Sponsorship storage
- `creation`: Genesis identity creation with proof
- `current_time`: Current Unix timestamp
- `network_genesis_timestamp`: When first genesis was created (0 if none)

**Returns**: The created `StoredSponsorship` record with `depth=0`, `is_genesis=true`.

**Validation**:
- Slot must be within bounds (0-99)
- Slot must not be already claimed
- For `HardcodedList`: Must be in bootstrap period (30 days) and in genesis list
- For `MultiSigThreshold`: Requires 2/3 attestations from existing genesis identities

### register_sponsored_identity()

**Signature**:
```rust
pub fn register_sponsored_identity(
    store: &SponsorshipStore,
    creation: &SponsoredIdentityCreation,
    sponsor_depth: u8,
) -> Result<StoredSponsorship, SponsorshipError>
```

**Purpose**: Register a new sponsored identity.

**Parameters**:
- `store`: Sponsorship storage
- `creation`: Sponsored identity creation with sponsor signature
- `sponsor_depth`: Sponsor's tree depth

**Returns**: The created `StoredSponsorship` record.

**Example**:
```rust
use swimchain::sponsorship::{register_sponsored_identity, SponsoredIdentityCreation};

let creation = SponsoredIdentityCreation {
    new_identity_pubkey: new_pubkey,
    sponsor_pubkey: Some(sponsor_pubkey),
    sponsor_signature: Some(signature),
    identity_pow_proof: pow_proof,
    creation_timestamp: current_time,
    probationary: true,
    genesis_proof: None,
};

let sponsorship = register_sponsored_identity(&store, &creation, sponsor_depth)?;
```

### propagate_consequences()

**Signature**:
```rust
pub fn propagate_consequences(
    sponsorship_store: &SponsorshipStore,
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    current_time: u64,
) -> Result<PropagationResult, SponsorshipError>
```

**Purpose**: Propagate penalties through the sponsor chain when an identity misbehaves.

**Parameters**:
- `sponsorship_store`: Sponsorship storage for chain lookup
- `offender`: Identity that misbehaved
- `severity`: Severity of the misbehavior
- `current_time`: Current Unix timestamp

**Returns**: `PropagationResult` containing:
- `offender_penalty`: Penalty for the offender
- `sponsor_penalties`: Vec of penalties for hop 1-2 sponsors
- `warnings`: Vec of warnings for hop 3+ sponsors

**Example**:
```rust
use swimchain::sponsorship::{propagate_consequences, MisbehaviorSeverity};

let result = propagate_consequences(
    &sponsorship_store,
    &offender_pubkey,
    MisbehaviorSeverity::Spam,
    current_time,
)?;

// Apply offender penalty
penalty_store.apply_penalty(&result.offender_penalty)?;

// Apply sponsor penalties
for penalty in result.sponsor_penalties {
    penalty_store.apply_penalty(&penalty)?;
}

// Record warnings
for warning in result.warnings {
    penalty_store.record_warning(&warning)?;
}
```

### create_public_offer()

**Signature**:
```rust
pub fn create_public_offer(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    offer: &PublicSponsorshipOffer,
    current_time: u64,
) -> Result<(), SponsorshipError>
```

**Purpose**: Create a new public sponsorship offer that claimants can request.

**Errors**:
- `StaleTimestamp`: Timestamp issues
- `InvalidInvariant`: Invalid max_sponsees
- `SponsorRestricted`: Sponsor is under penalty

### claim_public_offer()

**Signature**:
```rust
pub fn claim_public_offer(
    offer_store: &OfferStore,
    claim: &SponsorshipClaim,
    current_time: u64,
) -> Result<(), SponsorshipError>
```

**Purpose**: Submit a claim on a public sponsorship offer.

**Errors**:
- `OfferNotFound`: Offer doesn't exist
- `OfferExpired`: Offer has expired
- `OfferFullyClaimed`: No slots remaining
- `InsufficientPow`: PoW below requirement
- `ApplicationRequired`: Required application text missing
- `DuplicateClaim`: Claimant already submitted a claim

### approve_claim()

**Signature**:
```rust
pub fn approve_claim(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    rights_store: &RightsStore,
    offer_id: &[u8; 16],
    claimant: &PublicKey,
    sponsor_approval_signature: &Signature,
    current_time: u64,
) -> Result<StoredSponsorship, SponsorshipError>
```

**Purpose**: Approve a pending claim, creating the sponsorship.

**Returns**: The newly created `StoredSponsorship` for the claimant.

### reject_claim()

**Signature**:
```rust
pub fn reject_claim(
    offer_store: &OfferStore,
    offer_id: &[u8; 16],
    claimant: &PublicKey,
    sponsor: &PublicKey,
) -> Result<(), SponsorshipError>
```

**Purpose**: Reject a pending claim without creating a sponsorship.

## Behaviors

### Consequence Propagation

When an identity misbehaves, penalties propagate up the sponsor chain with decay.

**Decay Table**:
| Hop | Decay Multiplier | Effect |
|-----|------------------|--------|
| 0 (offender) | N/A | Full penalty based on severity |
| 1 (direct sponsor) | 100% | Full consequence for vouching |
| 2 (sponsor's sponsor) | 50% | Half consequence |
| 3+ | 0% | Warning only (no penalty) |

**Penalty Table by Severity and Hop**:

| Severity | Offender | Hop 1 | Hop 2 |
|----------|----------|-------|-------|
| Spam | RestrictedPosting 7 days | LostInviteSlots(1) 7 days | Warning only |
| Abuse | RestrictedPosting 30 days | LostInviteSlots(ALL) 30 days | LostInviteSlots(1) 7 days |
| Illegal | PermanentRevocation | LostInviteSlots(ALL) + AcceleratedDecay 90 days | LostInviteSlots(1) 30 days |

**Probationary Multiplier**: If the offender has probationary status, all sponsor penalties are reduced by 75% (multiplied by 0.25), with a minimum of 1 day.

### Orphan Lifecycle

When a sponsor is revoked or inactive:

1. **Detection**: Sponsor inactivity threshold is 90 days
2. **Grace Period**: Orphaned identities have 30 days grace period with full capabilities
3. **Adoption Eligibility**: After grace period, identity can be adopted by another sponsor
4. **Adoption**: New sponsor takes over, orphan gets clean slate (penalties cleared)

```
Sponsor Revoked/Inactive
         │
         ▼
   ┌─────────────┐
   │  Orphaned   │ ──► 30-day grace period
   └─────────────┘     (full capabilities)
         │
         │ (grace expires)
         ▼
   ┌─────────────┐
   │  Eligible   │ ──► Can be adopted
   │for Adoption │
   └─────────────┘
         │
         │ (new sponsor adopts)
         ▼
   ┌─────────────┐
   │   Active    │ ──► Clean slate
   └─────────────┘     (new sponsor tree)
```

### Linear Chain Detection

Detects manufactured trust chains (single-file sponsorship patterns for Sybil attacks).

**Detection Flow**:
```
Sponsorship Created
        │
        ▼
 Calculate Metrics
        │
        ▼
 ┌──────────────────┐
 │ Check Thresholds │
 │  - linearity>0.8 │
 │  - depth>=4      │
 │  - breadth<=1    │
 └────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
Not Suspicious  Suspicious
    │               │
    ▼               ▼
No Action      Flag Created
              (Status: Pending)
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
      Appeal     Cleared   Confirmed
                 (OK to    (Restrict to
                sponsor)   probationary)
```

### Public Offer Flow

```
Sponsor                          Claimant
   │                                │
   │ ┌─────────────────────┐        │
   ├─┤ 1. Create Offer     │        │
   │ │    (sign, publish)  │        │
   │ └─────────────────────┘        │
   │                                │
   │    ◄──── share offer_id ────►  │
   │                                │
   │                         ┌──────┴──────┐
   │                         │ 2. Submit   │
   │                         │    Claim    │
   │                         └──────┬──────┘
   │                                │
   │ ┌─────────────────────┐        │
   ├─┤ 3. Review Claims    │◄───────┘
   │ │    (view pending)   │
   │ └─────────────────────┘
   │
   │ ┌─────────────────────┐
   ├─┤ 4. Approve/Reject   │
   │ │    (sign approval)  │
   │ └─────────────────────┘
   │
   ▼
Sponsorship Created (if approved)
```

## Configuration

### Protocol Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_GENESIS_IDENTITIES` | 100 | Maximum number of genesis identities |
| `BOOTSTRAP_PERIOD_SECONDS` | 2,592,000 (30 days) | HardcodedList genesis proof period |
| `PROBATION_PERIOD_SECONDS` | 15,552,000 (180 days) | Probationary sponsorship duration |
| `TIMESTAMP_TOLERANCE_SECONDS` | 3,600 (1 hour) | Sponsorship creation timestamp tolerance |
| `ORPHAN_INACTIVITY_THRESHOLD_SECONDS` | 7,776,000 (90 days) | Sponsor inactivity threshold |
| `ORPHAN_GRACE_PERIOD_SECONDS` | 2,592,000 (30 days) | Orphan grace period |
| `MIN_ATTESTATION_COUNT` | 3 | Minimum attestations for MultiSig genesis |

### Capacity Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `SPONSORSHIP_COOLDOWN_SECONDS` | 3,600 (1 hour) | Minimum time between sponsorships |
| `SPONSORSHIP_WINDOW_SECONDS` | 2,592,000 (30 days) | Monthly capacity window |

### Penalty Durations

| Constant | Value | Description |
|----------|-------|-------------|
| `SPAM_PENALTY_DAYS` | 7 | Spam penalty duration |
| `SPAM_PENALTY_SECONDS` | 604,800 | 7 days in seconds |
| `ABUSE_PENALTY_DAYS` | 30 | Abuse penalty duration |
| `ABUSE_PENALTY_SECONDS` | 2,592,000 | 30 days in seconds |
| `ILLEGAL_PENALTY_DAYS` | 90 | Illegal content sponsor penalty |
| `ILLEGAL_PENALTY_SECONDS` | 7,776,000 | 90 days in seconds |

### Consequence Decay

| Constant | Value | Description |
|----------|-------|-------------|
| `CONSEQUENCE_DECAY_HOP_1` | 1.0 | 100% at hop 1 |
| `CONSEQUENCE_DECAY_HOP_2` | 0.5 | 50% at hop 2 |
| `CONSEQUENCE_DECAY_HOP_3_PLUS` | 0.0 | Warning only at hop 3+ |
| `PROBATION_CONSEQUENCE_MULTIPLIER` | 0.25 | 25% if offender is probationary |

### Linear Chain Detection

| Constant | Value | Description |
|----------|-------|-------------|
| `LINEARITY_SCORE_THRESHOLD` | 0.8 | Threshold for suspicious score |
| `LINEAR_CHAIN_MIN_DEPTH` | 4 | Minimum depth for flagging |
| `DEFAULT_MAX_LINEAR_BREADTH` | 1 | Max breadth to consider linear |

### Public Offer Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_OFFER_SPONSEES` | 10 | Maximum sponsees per offer |
| `MAX_APPLICATION_TEXT_BYTES` | 2,000 | Maximum application text |
| `OFFER_DEFAULT_DURATION_SECS` | 2,592,000 (30 days) | Default offer duration |

## RPC Methods

### register_genesis_identity

Register a genesis identity.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "register_genesis_identity",
  "params": {
    "public_key": "base64-encoded-pubkey",
    "slot_number": 0,
    "proof_type": "HardcodedList",
    "pow_proof": {
      "public_key": "base64-encoded-pubkey",
      "timestamp": 1735689600,
      "nonce": 12345,
      "pow_hash": "base64-encoded-hash"
    }
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
    "depth": 0,
    "is_genesis": true
  },
  "id": 1
}
```

### register_sponsored_identity

Register a sponsored identity.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "register_sponsored_identity",
  "params": {
    "new_identity_pubkey": "base64-encoded-pubkey",
    "sponsor_pubkey": "base64-encoded-sponsor",
    "sponsor_signature": "base64-encoded-sig",
    "pow_proof": {...},
    "probationary": false
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
    "depth": 2,
    "probationary": false
  },
  "id": 1
}
```

### get_sponsorship_info

Get sponsorship information for an identity.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_sponsorship_info",
  "params": {
    "public_key": "base64-encoded-pubkey"
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "is_sponsored": true,
    "is_genesis": false,
    "depth": 2,
    "sponsor": "base64-encoded-sponsor",
    "status": "Active",
    "probationary": false,
    "can_sponsor": true
  },
  "id": 1
}
```

## CLI Commands

### sw sponsor genesis-claim

Claim a genesis slot (genesis identities only).

```bash
sw sponsor genesis-claim --slot 0
```

Claims the specified genesis slot if your identity is in the hardcoded genesis list.

### sw sponsor genesis-status

Check if your identity is in the genesis list.

```bash
sw sponsor genesis-status
```

### sw sponsor offer-create

Create a sponsorship offer.

```bash
sw sponsor offer-create --slots 3 --expires-days 7 --offer-type probationary
sw sponsor offer-create --slots 1 --offer-type open --min-pow 10 --require-application
```

| Option | Default | Description |
|--------|---------|-------------|
| `--slots` | 1 | Maximum users who can claim (1-10) |
| `--offer-type` | probationary | Offer type: `probationary` or `open` |
| `--expires-days` | 30 | Days until offer expires |
| `--min-pow` | 0 | Minimum PoW difficulty required |
| `--require-application` | false | Require application text |

### sw sponsor offer-list

List your sponsorship offers.

```bash
sw sponsor offer-list
sw sponsor offer-list --json
```

### sw sponsor offer-view

View offer details and pending claims.

```bash
sw sponsor offer-view <offer-id>
sw sponsor offer-view <offer-id> --json
```

### sw sponsor offer-cancel

Cancel an offer.

```bash
sw sponsor offer-cancel <offer-id>
```

### sw sponsor claim

Claim a sponsorship offer (for new users).

```bash
sw sponsor claim <offer-id>
sw sponsor claim <offer-id> --application "I want to join because..."
```

### sw sponsor approve

Approve a pending claim.

```bash
sw sponsor approve <offer-id> <claimant-address>
```

### sw sponsor reject

Reject a pending claim.

```bash
sw sponsor reject <offer-id> <claimant-address>
```

### sw sponsor status

View your sponsorship status.

```bash
sw sponsor status
sw sponsor status --json
```

### sw sponsor direct

Directly sponsor an identity (genesis only, for testing).

```bash
sw sponsor direct <address>
sw sponsor direct <address> --probationary
```

This command bypasses the offer/claim flow. Only available to genesis identities.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `MissingSignature` | Sponsor signature not provided | Include valid sponsor signature |
| `InvalidSignature` | Signature verification failed | Verify signature is over correct message |
| `StaleTimestamp` | Timestamp outside tolerance window | Use current timestamp (within 1 hour) |
| `IdentityExists` | Identity already registered | Use existing identity |
| `SponsorRestricted` | Sponsor is under penalty | Wait for penalty to expire |
| `GenesisSlotClaimed` | Genesis slot already taken | Choose different slot |
| `BootstrapPeriodEnded` | HardcodedList only valid 30 days | Use MultiSigThreshold proof |
| `NotInGenesisList` | Identity not in hardcoded list | Get sponsored by existing member |
| `InsufficientGenesisAttestations` | Not enough genesis attestations | Get 2/3 of existing genesis to attest |
| `CommunityVoteNotImplemented` | Feature not yet implemented | Use HardcodedList or MultiSigThreshold |
| `ExceedsMonthlyCapacity` | Sponsorship capacity exhausted | Wait for capacity window reset |
| `SponsorOnCooldown` | Recently sponsored | Wait 1 hour between sponsorships |
| `OfferExpired` | Offer past expiration | Request new offer from sponsor |
| `OfferFullyClaimed` | No slots remaining | Request new offer with more slots |
| `InsufficientPow` | PoW below requirement | Mine higher difficulty PoW |
| `ApplicationRequired` | Application text missing | Provide application text |
| `DuplicateClaim` | Already submitted claim | Wait for sponsor decision |
| `SponsorFlaggedForLinearChain` | Confirmed linear chain flag | Can only create probationary sponsorships |
| `CannotRevokeGenesis` | Genesis identities are permanent | Genesis can only self-deactivate |
| `CannotOrphanGenesis` | Genesis cannot be orphaned | Genesis has no sponsor |
| `OrphanNotEligibleForAdoption` | Still in grace period | Wait for grace period to expire |

## Testing

### Unit Tests

Run sponsorship unit tests:

```bash
cargo test sponsorship --lib
```

### Integration Tests

```bash
# Run sponsorship integration tests
cargo test --test sponsorship_tests

# Run consequence propagation tests
cargo test --test consequence_propagation_test

# Run sybil resistance tests
cargo test --test sybil_resistance
```

### Manual Testing

```bash
# 1. Start a regtest node (allows self-sponsorship for testing)
sw node start --mode regtest

# 2. Create identity
sw identity create

# 3. Check genesis status
sw sponsor genesis-status

# 4. If genesis: claim slot
sw sponsor genesis-claim --slot 0

# 5. Create offer for new user
sw sponsor offer-create --slots 3

# 6. (Other user) Claim the offer
sw sponsor claim <offer-id>

# 7. Approve the claim
sw sponsor approve <offer-id> <claimant-address>

# 8. Verify sponsorship
sw sponsor status
```

## Known Limitations

1. **CommunityVote Not Implemented**: The `GenesisProofType::CommunityVote` returns `CommunityVoteNotImplemented` error. Use `HardcodedList` during bootstrap or `MultiSigThreshold` after.

2. **Regtest Mode Bypass**: In regtest mode, self-sponsorship is allowed for testing purposes. This is controlled by `NetworkContext.mode()` in validation.

3. **Bootstrap Period Limitation**: `HardcodedList` genesis proofs only work during the first 30 days after network genesis. After that, new genesis identities require `MultiSigThreshold` (2/3 attestations).

4. **Linear Chain Flagging is Manual**: Linear chain flags require manual review. There's no automatic penalty - only restriction to probationary sponsorships after confirmation.

5. **No Cross-Node Sponsorship Sync**: Sponsorship records are stored locally. Network-wide propagation relies on the sync layer.

## Future Work

1. **CommunityVote Implementation**: Implement the community vote mechanism for adding new genesis identities after bootstrap period.

2. **Penalty Recovery Acceleration**: Allow positive contributions to reduce remaining penalty duration.

3. **Cross-Node Sponsorship Sync**: Ensure sponsorship records propagate correctly across the network.

4. **Sponsorship Analytics Dashboard**: Add monitoring for sponsorship tree health and Sybil pattern detection.

5. **Mobile Sponsorship Flow**: Streamline offer/claim flow for mobile clients.

## Related Features

- **Identity & Cryptography**: Identity creation and PoW requirements (see §1 in MASTER_FEATURES.md)
- **Proof-of-Work Systems**: Identity PoW (SHA-256) for Sybil resistance (see §2 in MASTER_FEATURES.md)
- **Spam & Reputation**: Related anti-abuse system with attestations (see §9 in MASTER_FEATURES.md)
- **Blocklist Protocol**: Handling of illegal content attestations (see §19 in MASTER_FEATURES.md)
- **DHT & Peer Discovery**: PoW-gated node IDs for Sybil resistance (see §17 in MASTER_FEATURES.md)
