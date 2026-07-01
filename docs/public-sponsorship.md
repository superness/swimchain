# Public Sponsorship Offers

This document describes the public sponsorship offer system implemented per SPEC_11 Section 3.11.

## Overview

Public sponsorship offers enable existing network members to create discoverable offers that newcomers can claim to join the network. This provides an alternative to direct sponsorship, allowing broader network growth while maintaining Sybil resistance.

## Offer Types

### Open Offers (Anchor+ Only)
- Creates **non-probationary** sponsorships
- Requires Anchor level or higher to create
- Best for established sponsors who want to bring in trusted newcomers
- No consequence reduction for sponsor

### Probationary Offers (Resident+)
- Creates **probationary** sponsorships (180-day period)
- Requires Resident level or higher to create
- Sponsors receive reduced consequences (25%) for sponsee misbehavior
- Probation period allows network to observe new member behavior

### Conditional Offers (Anchor+)
- Creates non-probationary sponsorships with additional requirements
- Requires Anchor level or higher to create
- Can specify:
  - Minimum PoW difficulty
  - Required attester (trusted voucher)
  - Application text requirement

## Creating an Offer

```rust
use swimchain::sponsorship::{
    create_public_offer, PublicSponsorshipOffer, SponsorshipOfferType,
    SponsorshipRequirements, OfferStore, SponsorshipStore,
};
use swimchain::level::types::SwimmerLevel;

// Create an offer
let offer = PublicSponsorshipOffer {
    sponsor: my_public_key,
    offer_id: generate_offer_id(),  // 16-byte unique ID
    created_at: current_timestamp,
    expires_at: current_timestamp + 30 * 24 * 3600,  // 30 days
    max_sponsees: 5,
    offer_type: SponsorshipOfferType::Probationary,
    requirements: SponsorshipRequirements {
        min_pow_difficulty: 12,
        required_attester: None,
        application_required: true,
    },
    signature: sign_offer(&offer),
};

// Store the offer
create_public_offer(
    &offer_store,
    &sponsorship_store,
    &offer,
    SwimmerLevel::Resident,
    current_time,
)?;
```

## Claiming an Offer

Newcomers discover and claim offers by:

1. **Discovering offers** via the discovery API
2. **Preparing a claim** with required proofs
3. **Submitting the claim** for sponsor review

```rust
use swimchain::sponsorship::{
    claim_public_offer, SponsorshipClaim, OfferStore,
};

let claim = SponsorshipClaim {
    offer_id,
    claimant: my_new_public_key,
    claimed_at: current_timestamp,
    identity_pow_proof,  // PoW proving identity commitment
    application_text: Some("I want to contribute...".to_string()),
    attestation_signature: Some(attester_signature),  // If required
    claimant_signature: sign_claim(&claim),
    sponsor_approval: None,  // Set by sponsor later
};

claim_public_offer(&offer_store, &claim, current_time)?;
```

## Approving Claims

Sponsors review pending claims and approve or reject them:

```rust
use swimchain::sponsorship::{approve_claim, reject_claim};

// Approve a claim
let sponsorship = approve_claim(
    &offer_store,
    &sponsorship_store,
    &rights_store,
    &offer_id,
    &claimant_pubkey,
    &approval_signature,
    sponsor_level,
    current_time,
)?;

// Or reject it
reject_claim(&offer_store, &offer_id, &claimant_pubkey, &sponsor_pubkey)?;
```

## Offer Discovery

The system provides several discovery methods for newcomers:

### List All Active Offers
```rust
let offers = offer_store.list_active_offers(current_time)?;
```

### Filter by Type
```rust
let probationary_offers = offer_store.filter_by_type(
    SponsorshipOfferType::Probationary,
    current_time,
)?;
```

### Find Compatible Offers
```rust
// For a newcomer with specific capabilities
let compatible = offer_store.get_offers_for_newcomer(
    15,  // PoW capability (leading zero bits)
    Some(&attester_pubkey),  // Optional attester
    current_time,
)?;
```

### Paginated Listing
```rust
let (page, has_more) = offer_store.list_active_offers_paginated(
    current_time,
    0,   // offset
    10,  // limit
)?;
```

## Wire Protocol

Public sponsorship offers use the following message types:

| Message | ID | Description |
|---------|-----|-------------|
| SPONSORSHIP_OFFER | 0x49 | Broadcast a new offer |
| SPONSORSHIP_OFFER_CLAIM | 0x4A | Submit a claim |
| SPONSORSHIP_CLAIM_RESPONSE | 0x4B | Approve/reject a claim |
| SPONSORSHIP_OFFER_QUERY | 0x4C | Query available offers |
| SPONSORSHIP_OFFER_LIST | 0x4D | Response with offer list |

### Serialization

```rust
use swimchain::sponsorship::{
    serialize_offer, deserialize_offer,
    serialize_claim, deserialize_claim,
    serialize_claim_response, deserialize_claim_response,
};

// Serialize for network transmission
let bytes = serialize_offer(&offer)?;

// Deserialize received message
let offer = deserialize_offer(&bytes)?;
```

## Probationary Consequence Reduction

When a probationary sponsee misbehaves, the sponsor's consequence is reduced:

- **Normal sponsorship**: Sponsor receives 100% consequence at hop 1
- **Probationary sponsorship**: Sponsor receives 25% consequence (PROBATION_CONSEQUENCE_MULTIPLIER = 0.25)

This incentivizes sponsors to use probationary offers for less certain sponsees.

## Requirements Validation

Offers can specify requirements that claims must meet:

### PoW Difficulty
```rust
requirements.min_pow_difficulty = 15;  // Require 15+ leading zero bits
```

### Required Attester
```rust
requirements.required_attester = Some(trusted_entity_pubkey);
```

### Application Text
```rust
requirements.application_required = true;  // Require explanation
```

## Error Handling

Common errors when working with offers:

| Error | Meaning |
|-------|---------|
| `OfferExpired` | Offer has passed its `expires_at` timestamp |
| `OfferFullyClaimed` | All `max_sponsees` slots are used |
| `InsufficientPow` | Claim PoW below `min_pow_difficulty` |
| `ApplicationRequired` | Offer requires application text |
| `InsufficientLevelForOfferType` | Sponsor level too low for offer type |
| `DuplicateClaim` | Claimant already submitted a claim |

## Best Practices

1. **Choose appropriate offer type**: Use Probationary for unknown newcomers
2. **Set reasonable expiration**: 30 days is default, adjust based on needs
3. **Limit max_sponsees**: Don't exceed your capacity to review claims
4. **Require applications for Conditional**: Helps filter serious applicants
5. **Monitor pending claims**: Review and respond promptly
