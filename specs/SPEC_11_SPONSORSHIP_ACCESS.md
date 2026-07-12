# Protocol Specification: Sponsorship & Access Control

## Status: DRAFT

## Version: 0.4.3

---

## 1. Overview

### 1.1 Purpose

This specification defines Swimchain's Sybil resistance and access control mechanisms through two integrated systems:

1. **Sponsorship Trees**: Every non-genesis identity must be vouched for by an existing member, creating accountability chains where sponsors face graduated consequences for sponsee misbehavior.

2. **Access Control**: Posting and action rights are gated by proof-of-work (per SPEC_03), identity age gates, and flat per-identity rate limits. Access is never tied to status, reputation, or hosting standing — the limits are the same for everyone.

Together, these mechanisms achieve distributed moderation without central authority by making identity creation require social cost that cannot be parallelized, automated, or purchased.

### 1.2 Design Principles

**From THESIS_08:**

1. **Friction filters for commitment, not access**: Difficulty joining is acceptable; impossibility is not. The barrier filters for commitment, not for social connections.

2. **Accountability is relational, not ranked**: Trust is inherently relational and contextual. The right to sponsor depends on being an identity in good standing, not on any status tier or hosting rank.

3. **Accountability through stake, not authority**: Sponsors naturally become careful because their reputation depends on sponsees' behavior. No moderators required.

4. **Evolution through forking**: Communities with different risk tolerances can fork and adjust sponsorship requirements. No universal "correct" decay function.

5. **Social cost is the defense**: Unlike computational or economic costs, social capital cannot be parallelized, automated, or instantly purchased.

6. **Trust propagation decays with distance**: 1-hop sponsors bear more responsibility than 2-hop. 3-hop is negligible. Matches network science research.

### 1.3 Scope

**In scope:**
- Identity sponsorship requirements and verification
- Consequence propagation through sponsorship trees
- Flat action rate limits and age gates
- Genesis identity bootstrapping
- Penalty and recovery mechanisms
- Linear chain attack detection
- Public sponsorship offers (on-ramps)

**Out of scope:**
- Content moderation policies (see SPEC_09)
- Cryptographic identity creation (see SPEC_01)
- Space-level governance (see SPEC_02)
- Wire protocol for content distribution (see SPEC_03)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

1. **MUST**: Every non-genesis identity requires a sponsor (THESIS_08 §Thesis Statement)

2. **MUST**: Sponsors must be identities in good standing (not revoked and not under an active sponsorship penalty) for all sponsorships (THESIS_08 §Thesis Statement)

3. **MUST**: Consequence propagation must be graduated: 100% at 1-hop, 50% at 2-hop, negligible beyond 3 hops (THESIS_08 §Argument 2)

4. **MUST**: Sponsorship cost cannot be parallelized, automated, or bought (THESIS_08 §Thesis Statement)

5. **MUST**: No central authority for moderation decisions—consequences propagate through protocol rules only (THESIS_08 §Argument 2, VISION.md)

6. **MUST**: Genesis identities must exist to bootstrap the network as multiple roots (forest, not single tree) (THESIS_08 §Argument 4)

7. **MUST**: Social sponsorship is the Sybil resistance mechanism, not computational or economic (THESIS_08 §Argument 1)

8. **MUST**: Behavioral specificity—only spam/abuse/illegal behavior propagates consequences, not controversial opinions (THESIS_08 §Counterargument 2 Response)

9. **MUST**: Genesis identities have `sponsor = None` and are the only identities permitted without a sponsor

### 2.2 Soft Constraints (SHOULD)

1. **SHOULD**: Consequence propagation should be 2-3 levels deep (THESIS_08 §Supporting Evidence)

2. **SHOULD**: Sponsor reputation should be able to recover after sponsee misbehavior (THESIS_08 §Counterargument 2 Response)

3. **SHOULD**: Protocol should reward sponsors whose sponsees contribute positively (THESIS_08 §Counterargument 1 Response)

4. **SHOULD**: Low-reputation users could receive probationary accounts that don't fully affect their sponsor (THESIS_08 §Counterargument 1 Response)

5. **SHOULD**: Genesis identities should diminish in structural influence over time (THESIS_08 §Argument 4)

6. **SHOULD**: Enable public sponsorship offers as on-ramps for newcomers (THESIS_08 §Counterargument 1 Response)

7. **SHOULD**: Allow competing risk tolerances among sponsors (THESIS_08 §Counterargument 2 Response)

8. **SHOULD**: Detect and flag suspiciously linear sponsorship trees (THESIS_08 §Counterargument 3 Response)

### 2.3 Anti-Patterns (MUST NOT)

1. **MUST NOT**: Create purely computational Sybil resistance (purchasable with money/compute) (THESIS_08 §Argument 1)

2. **MUST NOT**: Create economic staking requirements (also purchasable) (THESIS_08 §Thesis Statement)

3. **MUST NOT**: Create centralized identity verification (KYC, captchas) (THESIS_08 §Argument 1)

4. **MUST NOT**: Make consequence propagation infinite or static across all contexts (THESIS_08 §Refined Thesis Position)

5. **MUST NOT**: Punish sponsors for sponsees' controversial opinions—only for spam/abuse/illegal content (THESIS_08 §Counterargument 2 Response)

6. **MUST NOT**: Create a permanent underclass by making joining impossible (THESIS_08 §Counterargument 1)

7. **MUST NOT**: Give genesis identities permanent extra powers beyond being tree roots (THESIS_08 §Argument 4)

---

## 3. Data Structures

### 3.1 SponsoredIdentityCreation

```rust
struct SponsoredIdentityCreation {
    new_identity_pubkey: PublicKey,      // 32 bytes - Ed25519 public key
    sponsor_pubkey: Option<PublicKey>,   // 32 bytes - Sponsor's public key (None for genesis)
    sponsor_signature: Option<Signature>,// 64 bytes - Sponsor signs new pubkey (None for genesis)
    identity_pow_proof: PowProof,        // CPU commitment proof
    creation_timestamp: u64,             // Unix timestamp in seconds
    probationary: bool,                  // True for probationary sponsorship
    genesis_proof: Option<GenesisProof>, // Present only for genesis identities
}
```

**Fields:**
- `new_identity_pubkey`: The Ed25519 public key of the new identity being created
- `sponsor_pubkey`: The public key of the sponsoring identity (None only for genesis identities)
- `sponsor_signature`: Sponsor's Ed25519 signature over `new_identity_pubkey || creation_timestamp` (None for genesis)
- `identity_pow_proof`: CPU proof-of-work per SPEC_01 (commitment mechanism)
- `creation_timestamp`: When the sponsorship occurred
- `probationary`: If true, this is a limited probationary account (see §3.7)
- `genesis_proof`: Proof of genesis status (see §3.9)

**Invariants:**
- If `sponsor_pubkey` is Some, `sponsor_signature` must be valid over `new_identity_pubkey || creation_timestamp`
- If `sponsor_pubkey` is None, `genesis_proof` must be Some and valid
- `creation_timestamp` must be within 1 hour of current time
- `new_identity_pubkey` must not already exist in the network

### 3.2 StoredSponsorship

```rust
struct StoredSponsorship {
    sponsored_identity: PublicKey,       // The sponsored identity
    sponsor: Option<PublicKey>,          // Direct sponsor (None for genesis)
    creation_timestamp: u64,             // When created
    status: SponsorshipStatus,           // Current status
    penalty_until: Option<u64>,          // Active penalty expiration
    depth: u8,                           // Distance from genesis (0 = genesis)
    probationary: bool,                  // Probationary status
    probation_expires: Option<u64>,      // When probation ends
    is_genesis: bool,                    // True if this is a genesis identity
}

enum SponsorshipStatus {
    Active = 0,
    Orphaned = 1,      // Sponsor revoked, sponsee still active
    Restricted = 2,    // Under penalty, limited actions
    Revoked = 3,       // Identity permanently revoked
}
```

**Fields:**
- `sponsored_identity`: The identity that was sponsored
- `sponsor`: Direct sponsor's public key (None for genesis)
- `creation_timestamp`: Unix timestamp of sponsorship
- `status`: Current sponsorship status
- `penalty_until`: If under penalty, when it expires
- `depth`: Distance from nearest genesis identity (genesis = 0)
- `probationary`: Whether this is a probationary sponsorship
- `probation_expires`: When probationary status ends (see §3.6 for constant)
- `is_genesis`: True if this identity was created without a sponsor during genesis

**Invariants:**
- If `is_genesis == true`, then `sponsor == None` and `depth == 0`
- If `is_genesis == false`, then `sponsor` must be Some
- If `sponsor` is Some, `depth` must equal `sponsor.depth + 1`
- If `status == Orphaned`, the identity cannot sponsor new identities until it is adopted back into a sponsorship tree (see §4.6) or its orphan grace period resolves

### 3.3 ContributionRecord

**Purpose:** Record a node's hosting contribution over a measurement window. Hosting is real work (a node hosts what its operator views, per SPEC_06), but it grants no access, capacity, or sponsorship rights. This record is a displayed signal only — it feeds hosting-based achievements and profile display (see SPEC_12), never a gate on posting, attestation, or sponsorship.


```rust
struct ContributionRecord {
    identity: PublicKey,
    period_start: u64,                   // Start of measurement period
    period_end: u64,                     // End of measurement period
    bandwidth_served: u64,               // Bytes served to qualifying peers
    hosting_gb_hours: u64,               // Content hosted over time
    uptime_ratio: u16,                   // 0-10000 (0.00% - 100.00%)
    content_served_count: u32,           // Number of requests served
    unique_peers_served: u32,            // Distinct peers served
    attestation_count: u8,               // Number of peer attestations
}
```

**Fields:**
- `identity`: The identity this record belongs to
- `period_start`, `period_end`: Measurement window (typically 7 or 30 days)
- `bandwidth_served`: Total qualifying bandwidth (excludes self-serving, tree-serving)
- `hosting_gb_hours`: Storage × uptime metric
- `uptime_ratio`: Percentage of period online (scaled to 0-10000)
- `content_served_count`: Number of distinct content requests served
- `unique_peers_served`: Number of distinct identities served
- `attestation_count`: Minimum 3 required for the record to be counted

**Invariants:**
- `attestation_count >= 3` for the contribution record to be counted toward displayed hosting reputation
- Attesters must not be in sponsor relationship with identity
- Bandwidth from self, tree members, or <7 day old identities is excluded

### 3.4 MisbehaviorSeverity

```rust
enum MisbehaviorSeverity {
    None = 0,           // No misbehavior
    Spam = 1,           // Flagged as spam by 3+ independent attesters
    Abuse = 2,          // Pattern of harassment (5+ spam flags in 7 days)
    Illegal = 3,        // CSAM, terrorism content (hash match + 3 attestations)
}

// What DOES propagate consequences
const PROPAGATING_BEHAVIORS: [MisbehaviorSeverity] = [Spam, Abuse, Illegal];

// What does NOT propagate consequences
// - Controversial opinions
// - Unpopular political views
// - Minority religious/cultural content
// - Content some find offensive but is not illegal/abusive
```

**Invariants:**
- Only behaviors in `PROPAGATING_BEHAVIORS` trigger sponsor consequences
- Controversial opinions explicitly excluded from consequence propagation
- Hash blocklist matches (per RESEARCH_05_LEGAL) automatically classify as `Illegal`

### 3.5 PenaltyRecord

```rust
struct PenaltyRecord {
    identity: PublicKey,
    penalty_type: PenaltyType,
    started_at: u64,
    base_expires_at: u64,                // Expiration (when the consequence ages out)
    current_expires_at: u64,             // Same as base_expires_at; consequences only age out
    caused_by: Option<PublicKey>,        // Sponsee who triggered this
    severity: MisbehaviorSeverity,
    hop_distance: u8,                    // 0 = offender, 1 = direct sponsor, etc.
}

enum PenaltyType {
    ReducedSponsorshipSlots = 0,         // Fewer available sponsorship slots
    SuspendedSponsorship = 1,            // Cannot sponsor or take on new sponsees
    RestrictedOfferAcceptance = 2,       // Cannot accept public sponsorship offers
    PermanentRevocation = 3,             // Identity revoked (illegal-content blocklist match only)
}
```

All propagated consequences stay inside the sponsorship domain: they reduce or suspend an identity's ability to sponsor and to accept sponsorship offers. They never touch posting rights, decay, PoW, or rate limits (those are governed by flat anti-abuse rules). `PermanentRevocation` is reserved for identities whose content matches the illegal-content blocklist (see SPEC_12).

**Fields:**
- `identity`: Identity under penalty
- `penalty_type`: Type of restriction applied
- `started_at`: When penalty began
- `base_expires_at`: Penalty duration; the consequence ages out at this time
- `current_expires_at`: Equal to `base_expires_at` — consequences only age out, they are never shortened or extended
- `caused_by`: The sponsee whose behavior triggered this (for sponsors)
- `severity`: What level of misbehavior caused this
- `hop_distance`: Distance from offender (0 = offender themselves)

**Invariants:**
- `hop_distance > 2` should have negligible penalties (warning only)
- `current_expires_at <= base_expires_at` (can only reduce, not extend)
- `PermanentRevocation` has no expiration

### 3.6 Constants

```rust
// Time-based constants
const PROBATION_PERIOD_DAYS: u32 = 90;
const PROBATION_PERIOD_SECONDS: u64 = 90 * 24 * 60 * 60; // 7,776,000 seconds
const TIMESTAMP_TOLERANCE_SECONDS: u64 = 3600; // 1 hour

// Consequence decay constants
const CONSEQUENCE_DECAY_HOP_1: f32 = 1.0;   // 100% at direct sponsor
const CONSEQUENCE_DECAY_HOP_2: f32 = 0.5;   // 50% at sponsor's sponsor
const CONSEQUENCE_DECAY_HOP_3_PLUS: f32 = 0.0; // Negligible beyond

// Sponsorship pacing (flat — identical for every identity in good standing)
const SPONSORSHIP_COOLDOWN_SECONDS: u64 = 3600; // Minimum time between sponsorships (1 hour)

// Probationary sponsorship constant
const PROBATION_CONSEQUENCE_MULTIPLIER: f32 = 0.25; // 25% of normal

// Linear chain detection thresholds
const LINEARITY_SCORE_THRESHOLD: f32 = 0.8;
const LINEAR_CHAIN_MIN_DEPTH: u8 = 4;

// Genesis constants
const MAX_GENESIS_IDENTITIES: u32 = 100;

// Contribution attestation requirements
const MIN_ATTESTATION_COUNT: u8 = 3;
```

### 3.7 DailyRateLimits

```rust
struct DailyRateLimits {
    identity: PublicKey,
    date: u32,                           // YYYYMMDD format
    posts: u32,
    replies: u32,
    engagements: u32,
    spaces_posted_in: Vec<SpaceId>,      // Distinct spaces
    hourly_space_posts: HashMap<SpaceId, Vec<u64>>,  // Timestamps per space
    last_updated: u64,
}

const MAX_POSTS_PER_DAY: u32 = 50;
const MAX_REPLIES_PER_DAY: u32 = 200;
const MAX_ENGAGEMENTS_PER_DAY: u32 = 500;
const MAX_SPACES_JOINED: u32 = 50;
const MAX_POSTS_PER_SPACE_PER_HOUR: u32 = 5;
const MAX_REPLIES_PER_SPACE_PER_HOUR: u32 = 20;
```

**Invariants:**
- Limits are flat: they apply equally to every identity, regardless of age beyond the age gate, hosting contribution, reputation, or sponsorship standing
- `hourly_space_posts` entries older than 1 hour are pruned

### 3.8 ProbationarySponsorship

```rust
struct ProbationarySponsorship {
    sponsee: PublicKey,
    sponsor: PublicKey,
    created_at: u64,
    probation_ends: u64,                 // created_at + PROBATION_PERIOD_SECONDS
    consequence_multiplier: f32,         // PROBATION_CONSEQUENCE_MULTIPLIER (0.25)
    graduated: bool,                     // True when probation complete
}
```

**Purpose:** Reduces risk for sponsors taking chances on unknown newcomers (THESIS_08 §Counterargument 1 Response).

**Fields:**
- `sponsee`: The probationary identity
- `sponsor`: The sponsor
- `created_at`: When probationary sponsorship began
- `probation_ends`: When full sponsorship takes effect (`created_at + PROBATION_PERIOD_SECONDS`)
- `consequence_multiplier`: Penalty multiplier for sponsor (`PROBATION_CONSEQUENCE_MULTIPLIER` = 0.25)
- `graduated`: Set to true when probation successfully completed

**Invariants:**
- Probationary sponsees have the same posting rights and flat rate limits as any other identity past the age gate
- During probation, sponsor bears only 25% of normal consequence for sponsee behavior
- After graduation, consequence multiplier becomes 1.0
- `probation_ends` must equal `created_at + PROBATION_PERIOD_SECONDS`

### 3.9 GenesisIdentity

```rust
struct GenesisIdentity {
    identity: PublicKey,
    genesis_proof: GenesisProof,
    created_at: u64,
    slot_number: u16,                    // 0 to MAX_GENESIS_IDENTITIES-1
}

struct GenesisProof {
    slot_number: u16,                    // Which genesis slot this claims
    proof_type: GenesisProofType,
    proof_data: Vec<u8>,                 // Proof-specific data
    attestations: Vec<GenesisAttestation>, // Other genesis identities attesting
}

enum GenesisProofType {
    HardcodedList = 0,                   // Pubkey in compiled list
    MultiSigThreshold = 1,               // M-of-N existing genesis sign
    CommunityVote = 2,                   // Pre-launch community process
}

struct GenesisAttestation {
    attester: PublicKey,                 // Existing genesis identity
    signature: Signature,                // Signs new genesis pubkey
    timestamp: u64,
}
```

**Purpose:** Bootstrap the network with initial trust roots (THESIS_08 §Argument 4).

**Genesis Creation Rules:**
1. **HardcodedList**: Initial genesis identities have pubkeys compiled into the protocol. No dynamic creation.
2. **MultiSigThreshold**: After launch, new genesis identities require signatures from 2/3 of existing genesis identities.
3. **CommunityVote**: Reserved for pre-launch community governance process.

**Invariants:**
- `slot_number < MAX_GENESIS_IDENTITIES`
- Each slot can only be claimed once
- HardcodedList proofs are only valid during network bootstrap (first 30 days)
- MultiSigThreshold requires 2/3 of existing genesis identities
- Genesis identities have `depth = 0` and cannot be revoked (only self-deactivate)

### 3.10 LinearChainMetrics

```rust
struct LinearChainMetrics {
    identity: PublicKey,
    sponsorship_depth: u8,               // Distance from genesis
    subtree_breadth: u32,                // Total sponsees in subtree
    direct_sponsee_count: u32,           // Immediate sponsees
    avg_subtree_depth: f32,              // Average depth of subtree
    linearity_score: f32,                // 0.0 (branching) to inf (linear)
    flagged_as_suspicious: bool,
}
```

**Purpose:** Detect manufactured trust chains (THESIS_08 §Counterargument 3 Response).

**Calculation:**
```rust
linearity_score = subtree_depth as f32 / max(subtree_breadth, 1) as f32
```

A healthy subtree has breadth >> depth. A manufactured chain has depth >> breadth.

**Invariants:**
- `linearity_score > LINEARITY_SCORE_THRESHOLD (0.8)` triggers `flagged_as_suspicious = true`
- Flagged chains require additional scrutiny before sponsees can sponsor
- Division by zero protected by `max(subtree_breadth, 1)`

### 3.11 PublicSponsorshipOffer

```rust
struct PublicSponsorshipOffer {
    sponsor: PublicKey,
    offer_id: [u8; 16],                  // Random unique identifier
    created_at: u64,
    expires_at: u64,                     // Typically 30 days from creation
    max_sponsees: u8,                    // How many can claim this offer
    claimed_count: u8,                   // How many have claimed
    offer_type: SponsorshipOfferType,
    requirements: SponsorshipRequirements,
    signature: Signature,                // Sponsor signs the offer
}

enum SponsorshipOfferType {
    Open = 0,                            // Anyone can claim
    Probationary = 1,                    // Only probationary sponsorship offered
    Conditional = 2,                     // Must meet requirements
}

struct SponsorshipRequirements {
    min_pow_difficulty: Option<u32>,     // Higher PoW for open offers
    required_attestation: Option<PublicKey>, // Must be attested by specific identity
    required_contribution_proof: Option<ContributionProof>, // Must prove contribution elsewhere
    application_required: bool,          // Sponsor reviews applications
}

struct SponsorshipClaim {
    offer_id: [u8; 16],
    claimant: PublicKey,
    claimed_at: u64,
    identity_pow_proof: PowProof,
    application_text: Option<String>,    // If application_required
    attestation_signature: Option<Signature>, // If required_attestation
    sponsor_approval_signature: Signature, // Sponsor must sign to finalize
}
```

**Purpose:** Provide on-ramps for newcomers without existing connections (THESIS_08 §Counterargument 1 Response).

**Fields:**
- `sponsor`: The identity making the public offer
- `offer_id`: Unique identifier for referencing the offer
- `created_at`, `expires_at`: Validity window
- `max_sponsees`: Maximum claimants (prevents unlimited liability)
- `claimed_count`: Current claimants
- `offer_type`: What kind of sponsorship is offered
- `requirements`: Conditions claimants must meet
- `signature`: Sponsor's signature proving offer authenticity

**Invariants:**
- `claimed_count <= max_sponsees`
- `expires_at > created_at`
- Any identity in good standing may create offers; sponsorships are paced by `SPONSORSHIP_COOLDOWN_SECONDS` between claims
- All claimed sponsorships still require final sponsor signature (prevents automated claiming)

---

## 4. Algorithms

### 4.1 Sponsorship Verification

**Purpose:** Validate a new sponsored identity creation request.

**Input:** `SponsoredIdentityCreation` struct

**Output:** `Result<(), SponsorshipError>`

**Steps:**
```rust
fn verify_sponsorship(creation: &SponsoredIdentityCreation) -> Result<(), SponsorshipError> {
    // 1. Check if this is a genesis identity creation
    if creation.sponsor_pubkey.is_none() {
        return verify_genesis_creation(creation);
    }

    let sponsor_pubkey = creation.sponsor_pubkey.unwrap();
    let sponsor_signature = creation.sponsor_signature
        .ok_or(SponsorshipError::MissingSignature)?;

    // 2. Verify sponsor signature
    let message = creation.new_identity_pubkey || creation.creation_timestamp;
    if !verify_ed25519(sponsor_pubkey, message, sponsor_signature) {
        return Err(SponsorshipError::InvalidSignature);
    }

    // 3. Check timestamp freshness (within 1 hour)
    let now = current_timestamp();
    if creation.creation_timestamp > now ||
       now - creation.creation_timestamp > TIMESTAMP_TOLERANCE_SECONDS {
        return Err(SponsorshipError::StaleTimestamp);
    }

    // 4. Check new identity doesn't exist
    if identity_exists(creation.new_identity_pubkey) {
        return Err(SponsorshipError::IdentityExists);
    }

    // 5. Check sponsor is in good standing (not revoked)
    if get_sponsorship_status(sponsor_pubkey) == SponsorshipStatus::Revoked {
        return Err(SponsorshipError::SponsorRevoked);
    }

    // 6. Check sponsorship cooldown (flat pacing, same for everyone)
    if let Some(last) = last_sponsorship_at(sponsor_pubkey) {
        if now < last + SPONSORSHIP_COOLDOWN_SECONDS {
            return Err(SponsorshipError::SponsorOnCooldown {
                available_at: last + SPONSORSHIP_COOLDOWN_SECONDS,
            });
        }
    }

    // 7. Check sponsor not under a sponsorship penalty
    if is_under_sponsorship_penalty(sponsor_pubkey) {
        return Err(SponsorshipError::SponsorRestricted);
    }

    // 8. Check linear chain detection
    if is_flagged_linear_chain(sponsor_pubkey) {
        // Flagged sponsors can only do probationary sponsorships
        if !creation.probationary {
            return Err(SponsorshipError::LinearChainRestriction);
        }
    }

    // 9. Verify new identity's CPU PoW
    if !verify_identity_pow(creation.identity_pow_proof) {
        return Err(SponsorshipError::InvalidPow);
    }

    Ok(())
}

fn verify_genesis_creation(creation: &SponsoredIdentityCreation) -> Result<(), SponsorshipError> {
    let genesis_proof = creation.genesis_proof
        .as_ref()
        .ok_or(SponsorshipError::MissingGenesisProof)?;

    // 1. Check slot availability
    if genesis_proof.slot_number >= MAX_GENESIS_IDENTITIES as u16 {
        return Err(SponsorshipError::InvalidGenesisSlot);
    }
    if is_genesis_slot_claimed(genesis_proof.slot_number) {
        return Err(SponsorshipError::GenesisSlotClaimed);
    }

    // 2. Verify based on proof type
    match genesis_proof.proof_type {
        GenesisProofType::HardcodedList => {
            // Only valid during bootstrap period
            if network_age_days() > 30 {
                return Err(SponsorshipError::BootstrapPeriodEnded);
            }
            if !is_in_hardcoded_genesis_list(creation.new_identity_pubkey) {
                return Err(SponsorshipError::NotInGenesisList);
            }
        },
        GenesisProofType::MultiSigThreshold => {
            let required_attestations = (count_active_genesis() * 2) / 3;
            if genesis_proof.attestations.len() < required_attestations {
                return Err(SponsorshipError::InsufficientGenesisAttestations);
            }
            // Verify each attestation signature
            for attestation in &genesis_proof.attestations {
                if !verify_genesis_attestation(attestation, creation.new_identity_pubkey) {
                    return Err(SponsorshipError::InvalidGenesisAttestation);
                }
            }
        },
        GenesisProofType::CommunityVote => {
            return Err(SponsorshipError::CommunityVoteNotImplemented);
        },
    }

    // 3. Verify PoW (same as regular identities)
    if !verify_identity_pow(creation.identity_pow_proof) {
        return Err(SponsorshipError::InvalidPow);
    }

    Ok(())
}
```

**Complexity:** O(1) for signature verification, O(log n) for database lookups, O(g) for genesis attestation verification where g = attestation count

**Edge Cases:**
- Sponsor's standing or available capacity changes during verification → recheck at commit time
- New identity pubkey collision → reject with `IdentityExists`
- Clock skew → 1-hour window provides tolerance
- Genesis slot race condition → first valid claim wins

### 4.2 Consequence Propagation

**Purpose:** When a sponsee's content crosses the spam-flag threshold, propagate consequences up the sponsor chain. Every consequence stays inside the sponsorship domain — it reduces or suspends the ability to sponsor and to accept sponsorship offers, nothing else. Consequences attenuate with each hop up the chain and age out over time (each carries an expiry), so a distant or old misbehavior fades from a sponsor's standing on its own.

**Input:** `offender: PublicKey, severity: MisbehaviorSeverity`

**Output:** `Vec<PenaltyRecord>` - penalties applied to sponsor chain

**Steps:**
```rust
fn propagate_consequences(
    offender: PublicKey,
    severity: MisbehaviorSeverity
) -> Vec<PenaltyRecord> {
    let mut penalties = Vec::new();

    // 1. Apply penalty to offender (sponsorship-domain only; the flagged
    //    content itself decays and prunes on the accelerated half-life per SPEC_12)
    let offender_penalty = match severity {
        Spam => PenaltyRecord {
            identity: offender,
            penalty_type: PenaltyType::ReducedSponsorshipSlots,
            base_expires_at: now() + 7 * DAY,
            hop_distance: 0,
            ..
        },
        Abuse => PenaltyRecord {
            identity: offender,
            penalty_type: PenaltyType::SuspendedSponsorship,
            base_expires_at: now() + 30 * DAY,
            hop_distance: 0,
            ..
        },
        Illegal => PenaltyRecord {
            identity: offender,
            penalty_type: PenaltyType::PermanentRevocation,
            hop_distance: 0,
            ..
        },
    };
    penalties.push(offender_penalty);

    // 2. Check if offender is genesis (no sponsor to penalize)
    let sponsorship = get_sponsorship(offender);
    if sponsorship.is_genesis {
        return penalties; // Genesis has no sponsor
    }

    // 3. Get sponsorship chain
    let chain = get_sponsorship_chain(offender); // Returns [sponsor, sponsor's sponsor, ...]

    // 4. Apply graduated consequences up chain
    for (hop, sponsor) in chain.iter().enumerate() {
        let hop_distance = hop + 1; // 1-indexed for sponsors

        // Get consequence multiplier based on hop distance
        let multiplier = match hop_distance {
            1 => CONSEQUENCE_DECAY_HOP_1,   // 100% - direct sponsor
            2 => CONSEQUENCE_DECAY_HOP_2,   // 50% - sponsor's sponsor
            _ => CONSEQUENCE_DECAY_HOP_3_PLUS, // Negligible beyond 2 hops
        };

        if multiplier == 0.0 {
            // Beyond 2 hops: warning only, no penalty
            record_warning(sponsor, offender, severity);
            break;
        }

        // Check for probationary sponsorship reduction
        let probation_multiplier = get_probation_multiplier(sponsor, offender);
        let final_multiplier = multiplier * probation_multiplier;

        let sponsor_penalty = compute_sponsor_penalty(
            sponsor,
            severity,
            hop_distance,
            final_multiplier
        );

        penalties.push(sponsor_penalty);
    }

    penalties
}

fn compute_sponsor_penalty(
    sponsor: PublicKey,
    severity: MisbehaviorSeverity,
    hop_distance: u8,
    multiplier: f32
) -> PenaltyRecord {
    match (severity, hop_distance) {
        // Direct sponsor (hop 1)
        (Spam, 1) => PenaltyRecord {
            penalty_type: PenaltyType::ReducedSponsorshipSlots,
            base_expires_at: now() + (7 * DAY * multiplier as u64),
            slots_lost: 1,
            ..
        },
        (Abuse, 1) => PenaltyRecord {
            penalty_type: PenaltyType::SuspendedSponsorship,
            base_expires_at: now() + (30 * DAY * multiplier as u64),
            slots_lost: ALL,
            ..
        },
        (Illegal, 1) => PenaltyRecord {
            penalty_type: PenaltyType::SuspendedSponsorship,
            base_expires_at: now() + (90 * DAY * multiplier as u64),
            slots_lost: ALL,
            additional: PenaltyType::RestrictedOfferAcceptance,
            ..
        },

        // Sponsor's sponsor (hop 2, 50% severity)
        (Spam, 2) => PenaltyRecord {
            penalty_type: WarningOnly,
            ..
        },
        (Abuse, 2) => PenaltyRecord {
            penalty_type: PenaltyType::ReducedSponsorshipSlots,
            base_expires_at: now() + (7 * DAY * multiplier as u64),
            slots_lost: 1,
            ..
        },
        (Illegal, 2) => PenaltyRecord {
            penalty_type: PenaltyType::ReducedSponsorshipSlots,
            base_expires_at: now() + (30 * DAY * multiplier as u64),
            slots_lost: 1,
            ..
        },

        // Beyond hop 2: no penalty
        _ => PenaltyRecord { penalty_type: WarningOnly, .. },
    }
}
```

**Complexity:** O(d) where d = sponsorship depth (typically < 20)

**Edge Cases:**
- Orphaned offender (sponsor revoked) → only offender penalized
- Genesis identity misbehaves → only offender penalized (no sponsor)
- Concurrent misbehavior from multiple sponsees → penalties stack

### 4.3 Access Check

**Purpose:** Determine if an identity can perform a specific action.

**Input:** `identity: PublicKey, action: ActionType, context: Option<SpaceId>`

**Output:** `AccessResult { allowed: bool, reason: AccessReason, remaining_today: u16 }`

**Steps:**
```rust
fn check_access(
    identity: PublicKey,
    action: ActionType,
    context: Option<SpaceId>
) -> AccessResult {
    // 1. Check if identity is revoked
    let status = get_sponsorship_status(identity);
    if status == Revoked {
        return AccessResult::denied(AccessReason::Revoked);
    }

    // 2. Check age gates
    let age_days = get_identity_age_days(identity);
    let age_limit = get_age_limit_for_action(action);
    if age_days < age_limit.min_age {
        return AccessResult::denied(AccessReason::AgeGate {
            unlocks_at: identity.created_at + age_limit.min_age * DAY
        });
    }

    // 3. Check rate limits
    let daily_limits = get_daily_limits(identity);
    let action_limit = get_limit_for_action(action, age_days);
    if daily_limits.get(action) >= action_limit {
        return AccessResult::denied(AccessReason::RateLimit);
    }

    // 4. Check active penalties relevant to this action. Sponsorship-domain
    //    penalties gate only sponsor/offer-acceptance actions; a PermanentRevocation
    //    is already caught by the status check in step 1.
    if is_under_penalty(identity, action) {
        let penalty = get_active_penalty(identity);
        return AccessResult::denied(AccessReason::Penalty {
            expires_at: penalty.current_expires_at
        });
    }

    // 5. All flat anti-abuse checks passed. Posting, reply, engage, and
    //    space-creation rights are gated only by proof-of-work (SPEC_03), the
    //    age gate, and flat rate limits — never by status, reputation, or
    //    hosting contribution. The limits are identical for every identity.
    let remaining = action_limit - daily_limits.get(action);
    AccessResult::allowed(remaining)
}
```

**Complexity:** O(1) with indexed lookups

**Edge Cases:**
- New identity past the age gate → posts under the same flat rate limits as everyone else
- Space-specific limits → check `hourly_space_posts` for per-space throttling

### 4.4 Linear Chain Detection

**Purpose:** Identify suspiciously linear sponsorship trees that may indicate manufactured trust chains.

**Input:** `identity: PublicKey`

**Output:** `LinearChainMetrics`

**Steps:**
```rust
fn analyze_chain_structure(identity: PublicKey) -> LinearChainMetrics {
    let sponsorship = get_sponsorship(identity);

    // 1. Calculate subtree metrics
    let subtree = get_all_sponsees_recursive(identity);
    let direct_sponsees = get_direct_sponsees(identity);

    let subtree_breadth = subtree.len();
    let subtree_depth = subtree.iter()
        .map(|s| s.depth - sponsorship.depth)
        .max()
        .unwrap_or(0);

    // 2. Calculate linearity score
    // High score = linear chain (suspicious)
    // Low score = branching tree (healthy)
    // NOTE: max(breadth, 1) prevents division by zero
    let linearity_score = subtree_depth as f32 / max(subtree_breadth, 1) as f32;

    // 3. Check for suspicious patterns
    let flagged = linearity_score > LINEARITY_SCORE_THRESHOLD
        || (subtree_depth >= LINEAR_CHAIN_MIN_DEPTH && direct_sponsees.len() <= 1);

    LinearChainMetrics {
        identity,
        sponsorship_depth: sponsorship.depth,
        subtree_breadth: subtree_breadth as u32,
        direct_sponsee_count: direct_sponsees.len() as u32,
        avg_subtree_depth: calculate_avg_depth(subtree),
        linearity_score,
        flagged_as_suspicious: flagged,
    }
}
```

**Thresholds:**
- `linearity_score > LINEARITY_SCORE_THRESHOLD (0.8)` → suspicious
- `subtree_depth >= LINEAR_CHAIN_MIN_DEPTH (4) && direct_sponsees <= 1` → suspicious
- Flagged sponsors can only create probationary sponsorships

**Complexity:** O(s) where s = subtree size

**Edge Cases:**
- New sponsor with zero sponsees → `linearity_score = 0.0`, not flagged
- New sponsor with one sponsee → not flagged (insufficient data, score = 1.0 but depth < 4)
- Legitimate linear mentorship chains → manual review mechanism

### 4.5 Penalty Recovery

**Purpose:** Sponsorship consequences age out on their own. Recovery is purely time-based: when a penalty's duration elapses, it lifts automatically.

**Input:** `identity: PublicKey, penalty: PenaltyRecord`

**Output:** `RecoveryResult { new_expires_at: u64, fully_recovered: bool }`

**Steps:**
```rust
fn calculate_recovery(identity: PublicKey, penalty: &PenaltyRecord) -> RecoveryResult {
    // Permanent revocation (illegal-content blocklist match) never recovers.
    if penalty.penalty_type == PenaltyType::PermanentRevocation {
        return RecoveryResult {
            new_expires_at: u64::MAX,
            fully_recovered: false,
        };
    }

    // Every other consequence simply ages out at its expiry. No standing,
    // reputation, or hosting contribution can speed it up or slow it down.
    RecoveryResult {
        new_expires_at: penalty.base_expires_at,
        fully_recovered: now() >= penalty.base_expires_at,
    }
}
```

**Invariants:**
- Recovery is time-based only; nothing shortens or extends a penalty beyond its original duration
- PermanentRevocation cannot be recovered

**Complexity:** O(1)

### 4.6 Orphan Adoption

**Purpose:** Restore an orphaned identity (one whose sponsor became inactive or was revoked) into an active sponsorship tree so it regains a live accountability chain.

**Input:** `orphan: PublicKey, adopter: PublicKey`

**Output:** `Result<(), SponsorshipError>`

**Steps:**
```rust
fn adopt_orphan(orphan: PublicKey, adopter: PublicKey) -> Result<(), SponsorshipError> {
    let orphan_record = get_sponsorship(orphan);

    // 1. Target must actually be orphaned and past its grace period
    if orphan_record.status != SponsorshipStatus::Orphaned {
        return Err(SponsorshipError::NotOrphaned);
    }

    // 2. Adopter must be an identity in good standing. No level or hosting
    //    rank is required — any identity in good standing may adopt, including
    //    an existing sponsor already in the orphan's former tree.
    if get_sponsorship_status(adopter) == SponsorshipStatus::Revoked
        || is_under_sponsorship_penalty(adopter) {
        return Err(SponsorshipError::AdopterNotInGoodStanding);
    }

    // 3. Adopter must be off sponsorship cooldown
    if is_on_sponsorship_cooldown(adopter) {
        return Err(SponsorshipError::SponsorOnCooldown {
            available_at: cooldown_expires_at(adopter),
        });
    }

    // 4. Re-parent the orphan. Adoption starts from a clean slate (any prior
    //    penalties on the orphan are cleared) and depth is recomputed.
    reparent(orphan, adopter);
    clear_penalties(orphan);
    set_status(orphan, SponsorshipStatus::Active);

    Ok(())
}
```

**Invariants:**
- Genesis identities are never orphaned and cannot be adopted
- Adoption requires only that the adopter be an identity in good standing and off sponsorship cooldown — there is no level or hosting requirement
- After adoption, the orphan's depth equals `adopter.depth + 1` and its consequences reset to a clean slate

**Complexity:** O(d) to recompute subtree depth, where d = subtree size

### 4.7 Public Sponsorship Offer Processing

**Purpose:** Match newcomers with sponsors through public offers (THESIS_08 §Counterargument 1 Response).

**Input:** `offer: PublicSponsorshipOffer, claim: SponsorshipClaim`

**Output:** `Result<SponsoredIdentityCreation, OfferError>`

**Steps:**
```rust
fn process_sponsorship_claim(
    offer: &PublicSponsorshipOffer,
    claim: &SponsorshipClaim
) -> Result<SponsoredIdentityCreation, OfferError> {
    // 1. Validate offer is still active
    if now() > offer.expires_at {
        return Err(OfferError::Expired);
    }
    if offer.claimed_count >= offer.max_sponsees {
        return Err(OfferError::FullyClaimed);
    }

    // 2. Verify offer ID matches
    if claim.offer_id != offer.offer_id {
        return Err(OfferError::InvalidOfferId);
    }

    // 3. Check requirements
    match &offer.requirements {
        req if req.min_pow_difficulty.is_some() => {
            let min_diff = req.min_pow_difficulty.unwrap();
            if !verify_pow_difficulty(claim.identity_pow_proof, min_diff) {
                return Err(OfferError::InsufficientPow);
            }
        },
        req if req.required_attestation.is_some() => {
            let required_attester = req.required_attestation.unwrap();
            let attestation = claim.attestation_signature
                .ok_or(OfferError::MissingAttestation)?;
            if !verify_attestation(required_attester, claim.claimant, attestation) {
                return Err(OfferError::InvalidAttestation);
            }
        },
        req if req.application_required => {
            // Application text must be present; approval is via sponsor signature
            if claim.application_text.is_none() {
                return Err(OfferError::ApplicationRequired);
            }
        },
        _ => {},
    }

    // 4. Verify sponsor approval signature (REQUIRED for all claims)
    let approval_message = claim.offer_id || claim.claimant || claim.claimed_at;
    if !verify_ed25519(offer.sponsor, approval_message, claim.sponsor_approval_signature) {
        return Err(OfferError::MissingSponsorApproval);
    }

    // 5. Create sponsorship
    let is_probationary = offer.offer_type == SponsorshipOfferType::Probationary;

    Ok(SponsoredIdentityCreation {
        new_identity_pubkey: claim.claimant,
        sponsor_pubkey: Some(offer.sponsor),
        sponsor_signature: Some(claim.sponsor_approval_signature),
        identity_pow_proof: claim.identity_pow_proof,
        creation_timestamp: claim.claimed_at,
        probationary: is_probationary,
        genesis_proof: None,
    })
}
```

**Complexity:** O(1)

**Important:** Public offers still require final sponsor signature. This prevents:
- Automated claiming of offers
- Sponsors being surprised by sponsees
- Gaming the "first come first serve" model

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x40 | ACCESS_CHECK | Request: "Can this identity perform this action?" |
| 0x41 | ACCESS_RESULT | Response: allowed/denied with reason |
| 0x42 | SPONSORSHIP_CREATE | Create new sponsored identity |
| 0x43 | SPONSORSHIP_CREATE_ACK | Acknowledgment of sponsorship creation |
| 0x44 | SPONSORSHIP_QUERY | Query sponsorship chain for identity |
| 0x45 | SPONSORSHIP_RESPONSE | Sponsorship chain data |
| 0x46 | PENALTY_NOTIFY | Notification of penalty applied |
| 0x47 | CONTRIBUTION_ATTEST | Peer attestation of contribution |
| 0x48 | LINEAR_CHAIN_ALERT | Alert about suspicious linear chain |
| 0x49 | SPONSORSHIP_OFFER | Publish public sponsorship offer |
| 0x4A | SPONSORSHIP_OFFER_CLAIM | Claim a public sponsorship offer |
| 0x4B | GENESIS_CREATE | Create genesis identity |

### 5.2 Message Formats

**ACCESS_CHECK (0x40):**
```
+------------------+--------+------------------+
| identity (32)    | action | space_id (32)?   |
+------------------+--------+------------------+
```
- `identity`: 32-byte Ed25519 public key
- `action`: 1 byte - 1=post, 2=reply, 3=engage, 4=create_space, 5=invite
- `space_id`: Optional 32-byte space identifier (for space-specific actions)

**ACCESS_RESULT (0x41):**
```
+----------+--------+------------------+------------------+
| allowed  | reason | remaining (2)    | unlock_at (8)?   |
+----------+--------+------------------+------------------+
```
- `allowed`: 1 byte - 0=no, 1=yes
- `reason`: 1 byte - 0=ok, 1=age_gate, 2=rate_limit, 3=penalty, 4=revoked
- `remaining`: 2 bytes - actions remaining today (0xFFFF = unlimited)
- `unlock_at`: Optional 8 bytes - timestamp when restriction lifts

**SPONSORSHIP_CREATE (0x42):**
```
+------------------+------------------+------------------+
| new_identity (32)| sponsor (32)     | signature (64)   |
+------------------+------------------+------------------+
| pow_proof (var)  | timestamp (8)    | probationary (1) |
+------------------+------------------+------------------+
```

**SPONSORSHIP_RESPONSE (0x45):**
```
+------------------+------------------+------------------+
| identity (32)    | sponsor (32)     | created_at (8)   |
+------------------+------------------+------------------+
| depth (1)        | status (1)       | chain_length (1) |
+------------------+------------------+------------------+
| is_genesis (1)   | chain (32 * chain_length)          |
+------------------+------------------------------------+
```
- `depth`: Distance from genesis (0 = genesis)
- `status`: 0=active, 1=orphaned, 2=restricted, 3=revoked
- `chain_length`: Number of sponsors in chain (0-255)
- `is_genesis`: 1 if genesis identity, 0 otherwise
- `chain`: Array of sponsor public keys from direct to genesis

**PENALTY_NOTIFY (0x46):**
```
+------------------+------------------+------------------+
| identity (32)    | penalty_type (1) | severity (1)     |
+------------------+------------------+------------------+
| expires_at (8)   | caused_by (32)?  | hop_distance (1) |
+------------------+------------------+------------------+
```

**LINEAR_CHAIN_ALERT (0x48):**
```
+------------------+------------------+------------------+
| identity (32)    | linearity (4)    | depth (1)        |
+------------------+------------------+------------------+
| breadth (4)      | flagged (1)      |
+------------------+-------------------+
```
- `linearity`: IEEE 754 float32 linearity score
- `flagged`: 0=not flagged, 1=flagged as suspicious

**SPONSORSHIP_OFFER (0x49):**
```
+------------------+------------------+------------------+
| sponsor (32)     | offer_id (16)    | created_at (8)   |
+------------------+------------------+------------------+
| expires_at (8)   | max_sponsees (1) | offer_type (1)   |
+------------------+------------------+------------------+
| requirements_len | requirements...  | signature (64)   |
+------------------+------------------+------------------+
```

**GENESIS_CREATE (0x4B):**
```
+------------------+------------------+------------------+
| identity (32)    | slot_number (2)  | proof_type (1)   |
+------------------+------------------+------------------+
| proof_len (2)    | proof_data...    | pow_proof (var)  |
+------------------+------------------+------------------+
| attestation_count| attestations...  | timestamp (8)    |
+------------------+------------------+------------------+
```

---

## 6. Validation Rules

### 6.1 Sponsorship Validation

1. **Signature validity**: Sponsor signature must verify against sponsor pubkey over `new_identity || timestamp`
2. **Timestamp freshness**: Creation timestamp must be within `TIMESTAMP_TOLERANCE_SECONDS` (1 hour) of current time
3. **Identity uniqueness**: New identity pubkey must not exist in network
4. **Sponsor eligibility**: Sponsor must be an identity in good standing (not revoked, not under an active sponsorship penalty)
5. **Cooldown**: At least `SPONSORSHIP_COOLDOWN_SECONDS` (1 hour) must have passed since the sponsor's previous sponsorship
6. **No active penalty**: Sponsor must not be under sponsorship restriction
7. **Linear chain check**: Flagged sponsors limited to probationary only
8. **PoW validity**: Identity creation PoW must meet SPEC_01 requirements
9. **Genesis handling**: If `sponsor = None`, must have valid `genesis_proof`

### 6.2 Contribution Validation

1. **Attestation count**: Minimum `MIN_ATTESTATION_COUNT` (3) peer attestations required
2. **Attester independence**: Attesters must not be in sponsor relationship with identity
3. **Attester age**: Attesters must be 7+ days old with 1+ contribution period
4. **Value consistency**: Attested values must be within 20% variance of median
5. **Self-exclusion**: No bandwidth from self-serving counted
6. **Tree-exclusion**: No bandwidth from serving tree members (sponsors/sponsees) counted
7. **Age-exclusion**: No bandwidth from serving <7 day old identities counted
8. **Repeat-exclusion**: Same content to same peer within 24h counts once

### 6.3 Action Validation

1. **Identity status**: Revoked identities cannot perform any actions
2. **Age gates**: Identity must meet minimum age for action type
3. **Rate limits**: Must be within the flat daily and hourly limits (identical for every identity)
4. **Penalty status**: For sponsor/offer-acceptance actions, must not be under a relevant sponsorship penalty
5. **Proof-of-work**: The action's proof-of-work must be valid (per SPEC_03)
6. **Space membership**: For space actions, must be space member

### 6.4 Penalty Validation

1. **Severity matching**: Penalty must match misbehavior severity table
2. **Hop distance accuracy**: Hop distance must match actual sponsorship chain length
3. **Graduated decay**: Consequences must follow 100%→50%→negligible pattern
4. **Behavioral specificity**: Only spam/abuse/illegal triggers penalties; opinions do not
5. **Probation adjustment**: Probationary sponsorship penalty multiplied by `PROBATION_CONSEQUENCE_MULTIPLIER` (0.25)

### 6.5 Genesis Validation

1. **Slot uniqueness**: Each genesis slot can only be claimed once
2. **Slot range**: `slot_number < MAX_GENESIS_IDENTITIES`
3. **Proof validity**: Genesis proof must be valid for claimed proof type
4. **Bootstrap period**: HardcodedList proofs only valid during first 30 days
5. **MultiSig threshold**: Requires 2/3 of existing genesis attestations
6. **PoW requirement**: Genesis identities still require valid PoW

---

## 7. Security Considerations

### 7.1 Threat Model

**Attacker Capabilities:**
- Can create arbitrary cryptographic keypairs
- Can run nodes and host content
- Can wait months to build reputation
- Can compromise external accounts (not Swimchain-specific)

**Attack Vectors:**

| Attack | Description | Likelihood |
|--------|-------------|------------|
| Sybil flood | Create many identities for spam | Low (requires sponsors) |
| Linear chain | Manufacture trust chain over time | Medium |
| Sponsor farming | Create identities to sponsor more | Low (flat capacity cap, propagating consequences) |
| Reputation laundering | Use proxies to hide misbehavior | Medium |
| Revenge through compromise | Damage sponsor via compromised sponsee | Low |
| Genesis capture | Control majority of genesis slots | Medium (mitigated by distribution) |
| Public offer abuse | Claim offers to attack sponsors | Low (requires sponsor signature) |

### 7.2 Mitigations

**Sybil Flood:**
- Every identity needs sponsor signature
- Sponsors must be identities in good standing
- The flat sponsorship cooldown (`SPONSORSHIP_COOLDOWN_SECONDS`) paces every identity equally — it cannot be shortened by age, hosting, or status
- Sponsor consequences for sponsee misbehavior propagate up the chain

**Linear Chain Attack:**
- Linearity score calculation flags suspicious chains
- Flagged chains limited to probationary sponsorships
- Behavioral analysis of sponsorship patterns
- Time-to-value: 6-12 months minimum for 3-4 accounts

**Sponsor Farming:**
- Flat capacity cap limits how many sponsees any one identity can hold
- Sponsor consequences propagate up the chain, so farming raises the farmer's own exposure
- Linear chain detection flags manufactured trees

**Reputation Laundering:**
- Consequence propagation up chain
- Pattern detection across sponsees
- Accumulated penalty records

**Revenge Attacks:**
- Key rotation and multi-sig for high-reputation accounts
- Sudden behavioral change detection
- Probationary period limits blast radius

**Genesis Capture:**
- Multiple genesis slots (100)
- Geographic and community diversity in initial selection
- MultiSig threshold for post-bootstrap additions
- Genesis identities have no special powers beyond being tree roots

**Public Offer Abuse:**
- All claims require final sponsor signature
- Sponsors can set requirements (attestation, higher PoW)
- Probationary-only offers limit sponsor risk

### 7.3 Residual Risks

1. **Patient attacker**: 6-12 month investment can yield 3-4 high-reputation accounts. Mitigated by linear chain detection but not eliminated.

2. **Collusion rings**: Groups of real humans coordinating to vouch for each other. Difficult to distinguish from legitimate communities.

3. **Social engineering**: Convincing legitimate sponsors to vouch for attackers. Sponsor consequences create incentive for caution.

---

## 8. Privacy Considerations

### 8.1 Data Exposed

| Data | Visibility | Reason |
|------|------------|--------|
| Sponsor relationship | Public | Accountability requires transparency |
| Sponsorship depth | Public | Verifiable trust distance |
| Sponsorship capacity used | Public | Verifiable capacity under the flat cap |
| Penalty status | Public | Community protection |
| Contribution metrics | Attested peers only | Privacy-preserving verification |
| Linearity score | Public | Attack detection transparency |
| Genesis status | Public | Network bootstrapping transparency |
| Public sponsorship offers | Public | On-ramp discoverability |

### 8.2 Data Protected

| Data | Protection | Reason |
|------|------------|--------|
| Contribution details | Aggregated only | Specific hosting patterns private |
| Attestation content | Hashed | Who served what to whom |
| Penalty reasons (opinions) | Not recorded | Only spam/abuse/illegal tracked |
| Geographic location | Not collected | Decentralized by design |
| IP addresses | Per SPEC_03 transport | Network-level privacy |
| Application text | Sponsor only | Private communication |

### 8.3 Privacy Tradeoffs

Sponsorship trees inherently reduce privacy compared to anonymous systems:
- Your sponsor is visible (social graph edge)
- Your sponsees are visible (accountability chain)
- Your sponsorship penalty status is visible

This is an intentional tradeoff: accountability requires some transparency. However:
- Content you consume is not logged
- Content you host is not attributed (hash-based)
- Your opinions do not trigger penalties

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency | Purpose |
|-----------|------------|---------|
| SPEC_01 (Identity) | Identity creation, pubkey storage | Base identity operations |
| SPEC_03 (PoW) | CPU PoW verification | Identity commitment proof |
| SPEC_09 (Social Layer) | Hosting/contribution tracking | Profile display and achievements (not access) |
| SPEC_02 (Spaces) | Space membership, posting | Context for actions |
| RESEARCH_05 (Legal) | Hash blocklists | Illegal content classification |

### 9.2 Interfaces Exposed

**Identity Subsystem Integration:**
```rust
// Add to SPEC_01 identity record
pub sponsor: Option<PublicKey>,
pub sponsored_at: Option<u64>,
pub sponsorship_depth: u8,
pub is_genesis: bool,
```

**Action Validation Hook:**
```rust
// Called before any action in SPEC_03
fn validate_action(identity: PublicKey, action: ActionType) -> Result<(), AccessError> {
    let access = check_access(identity, action, context);
    if !access.allowed {
        return Err(AccessError::from(access.reason));
    }
    Ok(())
}
```

**Misbehavior Callback:**
```rust
// Called by moderation subsystem when misbehavior detected
fn on_misbehavior(identity: PublicKey, severity: MisbehaviorSeverity) {
    let penalties = propagate_consequences(identity, severity);
    for penalty in penalties {
        apply_penalty(penalty);
    }
}
```

### 9.3 Fork Behavior

Forks may customize:
- Flat rate-limit values (still flat — the same for every identity)
- Consequence decay percentages (within 0-100%)
- Linearity score threshold for flagging
- Probationary period duration
- Sponsorship cooldown duration (`SPONSORSHIP_COOLDOWN_SECONDS`)
- Public offer requirements

Forks must preserve:
- Sponsorship requirement (cannot disable)
- Behavioral specificity (only spam/abuse/illegal)
- Basic graduated decay (cannot make infinite)
- Genesis identity mechanism

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Phase 1: Genesis Bootstrap**
- Implement genesis identity creation with HardcodedList
- Create initial genesis set with diverse distribution
- Store genesis identities with `depth = 0`, `sponsor = None`, `is_genesis = true`
- Genesis identities begin hosting and contributing immediately

**Phase 2: Core Sponsorship**
- Basic sponsorship verification
- Sponsorship storage with proper depth tracking
- Good-standing check and flat `SPONSORSHIP_COOLDOWN_SECONDS` pacing enforcement
- Handle `sponsor = None` edge cases correctly

**Phase 3: Consequence Propagation**
- Penalty records
- Hop-based decay using defined constants
- Time-based recovery
- Penalty queries
- Probationary sponsorship handling

**Phase 4: Access Control**
- Action verification flow
- Rate limit storage
- Age gate enforcement
- Integration with SPEC_03

**Phase 5: Advanced Features**
- Linear chain detection with correct `max(breadth, 1)` guard
- Orphan adoption
- Public sponsorship offers

**Phase 6: Wire Protocol**
- Message serialization for all types including GENESIS_CREATE
- Network handlers
- Cross-node synchronization
- Attestation protocol

### 10.2 Known Challenges

1. **Clock synchronization**: Timestamp validation requires rough clock sync. Use `TIMESTAMP_TOLERANCE_SECONDS` (1 hour) window tolerance.

2. **Contribution verification**: Peer attestation is complex. Minimum `MIN_ATTESTATION_COUNT` (3) attesters, median value, variance check.

3. **Linear chain false positives**: Legitimate mentorship chains may be flagged. Need manual review escape hatch.

4. **Penalty propagation timing**: Penalties should propagate atomically. Use transaction semantics.

5. **Genesis distribution**: Initial genesis identities require out-of-band coordination. Consider geographic/community diversity. Use hardcoded list for bootstrap, MultiSig for later additions.

6. **Fork parameter migration**: When forks change thresholds, existing records need migration strategy.

7. **Public offer spam**: Prevent offer flooding by limiting active offers per sponsor.

### 10.3 Testing Strategy

1. **Unit tests**: Each algorithm in §4 independently tested
2. **Integration tests**: Full sponsorship→misbehavior→penalty flow
3. **Simulation**: Multi-agent simulation of network growth and attack scenarios
4. **Fuzzing**: Message parsing and validation edge cases
5. **Load testing**: Rate limit enforcement under high concurrency
6. **Genesis tests**: Verify bootstrap process and MultiSig additions

---

## 11. Test Vectors

### 11.1 Sponsorship Verification

**Input:**
```
new_identity_pubkey: 0x1234...abcd (32 bytes)
sponsor_pubkey: 0x5678...efgh (32 bytes)
timestamp: 1735300000
signature: (valid Ed25519 signature)
sponsor_status: Active (good standing)
seconds_since_last_sponsorship: 7200
SPONSORSHIP_COOLDOWN_SECONDS: 3600
sponsor_penalty: None
```

**Expected Output:** `Ok(())` - sponsor is in good standing and off cooldown

---

**Input:**
```
(same as above, but sponsor_penalty: SuspendedSponsorship, active)
```

**Expected Output:** `Err(SponsorshipError::SponsorRestricted)` - sponsor under an active sponsorship penalty

---

**Input:**
```
new_identity_pubkey: 0x1234...abcd (32 bytes)
sponsor_pubkey: None
genesis_proof: GenesisProof { slot_number: 42, proof_type: HardcodedList, ... }
network_age_days: 15
```

**Expected Output:** `Ok(())` - valid genesis creation during bootstrap

### 11.2 Consequence Propagation

**Input:**
```
offender: C
sponsorship_chain: [B, A] (B sponsored C, A sponsored B)
severity: Abuse
```

**Expected Output:**
```
[
  PenaltyRecord { identity: C, penalty_type: SuspendedSponsorship, duration: 30 days, hop: 0 },
  PenaltyRecord { identity: B, penalty_type: SuspendedSponsorship (all slots), duration: 30 days, hop: 1 },
  PenaltyRecord { identity: A, penalty_type: ReducedSponsorshipSlots(1), duration: 7 days, hop: 2 },
]
```

---

**Input:**
```
offender: Genesis0 (is_genesis: true)
severity: Spam
```

**Expected Output:**
```
[
  PenaltyRecord { identity: Genesis0, penalty_type: ReducedSponsorshipSlots, duration: 7 days, hop: 0 },
]
```
Note: No sponsor penalties because genesis has no sponsor.

### 11.3 Linear Chain Detection

**Input (suspicious):**
```
identity: D
subtree: [E] (only one sponsee)
sponsorship_chain: [C, B, A, Genesis] (depth = 4)
subtree_depth: 4
subtree_breadth: 1
```

**Expected Output:**
```
LinearChainMetrics {
  depth: 4,
  subtree_breadth: 1,
  linearity_score: 4.0 / max(1, 1) = 4.0,
  flagged_as_suspicious: true,  // 4.0 > 0.8 threshold
}
```

---

**Input (healthy):**
```
identity: A
subtree: [B, C, D, E, F] (5 direct sponsees)
max_depth_in_subtree: 2
subtree_breadth: 5
```

**Expected Output:**
```
LinearChainMetrics {
  depth: 1,
  subtree_breadth: 5,
  linearity_score: 2.0 / max(5, 1) = 0.4,
  flagged_as_suspicious: false,  // 0.4 < 0.8 threshold
}
```

---

**Input (edge case - no sponsees):**
```
identity: X
subtree: [] (no sponsees yet)
subtree_depth: 0
subtree_breadth: 0
```

**Expected Output:**
```
LinearChainMetrics {
  depth: 0,
  subtree_breadth: 0,
  linearity_score: 0.0 / max(0, 1) = 0.0,  // max guard prevents division by zero
  flagged_as_suspicious: false,
}
```

### 11.4 Access Check

**Input:**
```
identity: NewUser (age: 5 days)
action: Post
```

**Expected Output:**
```
AccessResult {
  allowed: false,
  reason: AgeGate { unlocks_at: creation + 7 days },
}
```

---

**Input:**
```
identity: AgedUser (age: 45 days, past the age gate)
action: Post
```

**Expected Output:**
```
AccessResult {
  allowed: true,
  remaining_today: 20,   // Flat limit, identical for every identity
}
```

### 11.5 Probationary Sponsorship

**Input:**
```
sponsor: Alice (in good standing)
sponsee: Bob (new, probationary: true)
Bob misbehavior: Spam
```

**Expected Output:**
```
Alice penalty duration: 7 days * PROBATION_CONSEQUENCE_MULTIPLIER (0.25) = 1.75 days (rounds to 2 days)
```

### 11.6 Penalty Recovery (Time-Based)

**Input:**
```
identity: Carol (under penalty)
penalty: SuspendedSponsorship, started 10 days ago, base_duration 30 days
```

**Expected Output:**
```
RecoveryResult {
  new_expires_at: base_expires_at,   // Consequences only age out
  fully_recovered: false,            // 20 days remain
}
```

---

**Input:**
```
(same as above, but 30+ days have elapsed since the penalty started)
```

**Expected Output:**
```
RecoveryResult {
  new_expires_at: base_expires_at,
  fully_recovered: true,             // Penalty has aged out
}
```

---

## 12. Open Questions

### 12.1 Consequence Depth Calibration

**Question:** The thesis identifies an "unresolvable calibration paradox" - consequences strong enough to deter may be unjustly punitive; consequences fair to innocent sponsors may provide insufficient deterrence.

**Current approach:** 100% → 50% → negligible (using defined constants)

**Alternatives:**
- Context-specific decay functions (per-space or per-fork)
- Dynamic adjustment based on community feedback
- Reputation insurance mechanisms

**Status:** Using static decay for v0.4.0; may revisit based on real-world data. The thesis's refined position acknowledges this is a fundamental tradeoff, not a solvable problem.

### 12.2 Genesis Identity Distribution

**Question:** How many genesis identities? How selected? How to prevent early capture?

**Current approach:** `MAX_GENESIS_IDENTITIES = 100`, HardcodedList for bootstrap, MultiSig for later additions

**Considerations:**
- Geographic distribution
- Community diversity
- Existing reputation in related communities
- Prevention of single-entity capture
- 2/3 threshold for MultiSig additions

**Status:** Requires governance decision before mainnet. Technical mechanism defined; selection criteria need community input.

### 12.3 Cross-Fork Sponsorship

**Question:** Does sponsoring someone in one fork affect their access to other forks?

**Option A:** Sponsorship is global - one sponsorship works everywhere
**Option B:** Sponsorship is per-fork - must be re-sponsored in each fork
**Option C:** Sponsorship travels with identity, but fork-specific penalties

**Status:** Leaning toward Option C, needs specification

### 12.4 Informal Contribution Arrangements

**Question:** How should "I'll host, you post" arrangements be treated?

**Current status:** Not explicitly prohibited, but contribution must be peer-attested by `MIN_ATTESTATION_COUNT` (3) independent attesters

**Consideration:** Some informal cooperation may be healthy; pure delegation is problematic

**Status:** Monitoring for abuse patterns

### 12.5 Breadth Requirements for Sponsors

**Question:** Should sponsors be required to have multiple sponsees before their sponsees can sponsor?

**Purpose:** Makes linear attack chains more expensive

**Trade-off:** May slow legitimate organic growth

**Status:** Not implemented in v0.4.0; consider for v0.5.0

---

## 13. References

- **THESIS_08**: Sponsorship Trees - Accountability Through Vouching
  - §Thesis Statement: Core sponsorship requirements (sponsor must be an identity in good standing)
  - §Argument 1: Sybil Resistance Requires Social Cost
  - §Argument 2: Distributed Moderation Through Consequence Propagation
  - §Argument 3: Trust Networks Mirror Natural Community Formation
  - §Argument 4: The Genesis Problem Has Precedents
  - §Counterargument 1 Response: Probationary sponsorship, public offers
  - §Counterargument 2 Response: Behavioral specificity, recovery mechanisms
  - §Counterargument 3 Response: Linear chain detection
  - §Refined Thesis Position: Calibration paradox acknowledgment

- **VISION.md**: Swimchain Core Principles
  - "No central authority" - distributed moderation requirement
  - "Protocol rules, not platform decisions" - transparent physics

- **SPEC_01**: Identity - Base identity operations, CPU PoW for identity creation

- **SPEC_03**: Proof of Work - CPU PoW specifications (retained for identity/space creation)

- **SPEC_09**: Social Layer - Hosting/contribution tracking and peer attestation (profile display only, not access)

- **RESEARCH_05_LEGAL**: Hash blocklists for illegal content detection

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-27*

---

## Changelog

- v0.4.3 (2025-12-27): **Milestone 9.7 — orphan handling.** OrphanDetectionTask scans for inactive sponsors (ORPHAN_INACTIVITY_THRESHOLD_SECONDS=7,776,000 = 90 days). `SponsorshipStatus::Orphaned` with `orphaned_at` timestamp. 30-day grace period (ORPHAN_GRACE_PERIOD_SECONDS=2,592,000) before adoption eligibility. Adoption is open to any identity in good standing with available capacity, starting the adoptee from a clean slate (penalties cleared). Cascade prevention: only direct sponsees (depth+1) are orphaned. Genesis identities are protected from orphaning.

- v0.4.2 (2025-12-27): **Milestone 9.6 — public sponsorship offers.** `PublicSponsorshipOffer` with three types (Open, Probationary, Conditional), each creatable by any identity in good standing within the flat capacity cap. Claim lifecycle: submit_claim() → pending → approve_claim()/reject_claim(). Wire protocol messages 0x49-0x4D for network discovery. `PROBATION_CONSEQUENCE_MULTIPLIER=0.25`.

- v0.4.1 (2025-12-27): **IMPLEMENTED - Milestone 9.5 Complete.** Linear chain detection fully implemented in `src/sponsorship/linear_chain.rs`. Implementation details: LinearChainDetector with sled persistence, ReviewStatus enum (Pending/Cleared/Confirmed), appeal mechanism, SpaceHealth integration with 2-point penalty per warning (max 10). Detection algorithm matches spec: (linearity_score > 0.8 AND depth >= 4) OR (depth >= 4 AND direct_sponsees <= 1). 203 tests passing.

- v0.4.0 (2025-12-27): Addressed review feedback:
  - Sponsor eligibility framed around identity good standing
  - Added genesis identity handling (§3.1, §3.2, §3.9) with `GenesisIdentity`, `GenesisProof` structures
  - Fixed linearity score calculation to include `max(breadth, 1)` guard consistently (§3.10, §4.4)
  - Added `PublicSponsorshipOffer` data structure (§3.11) and processing algorithm (§4.7)
  - Defined named constants including `PROBATION_PERIOD_DAYS = 90` (§3.6)
  - Added wire protocol messages for public offers and genesis creation
  - Added genesis validation rules (§6.5)
  - Updated test vectors with genesis and edge cases (§11.1, §11.2, §11.3, §11.6)
  - Enhanced security considerations for genesis capture and public offer abuse

- v0.3.0 (2025-12-27): Complete specification rewrite incorporating THESIS_08 requirements. Added: probationary sponsorship (§3.7), linear chain detection (§3.8, §4.4), behavioral specificity enforcement, comprehensive security analysis, test vectors.

- v0.2.0 (2025-12-26): Removed all credit/coin/token language. Reframed action rights around flat anti-abuse rules (proof-of-work, age gates, flat rate limits).

- v0.1.0 (2025-12-26): Initial draft (as SPEC_11_SPONSORSHIP_CREDITS)
