# Newcomer Onboarding Guide

This guide explains how new users can join the Swimchain network through the public sponsorship offer system.

## Prerequisites

Before joining, newcomers need:

1. **A compatible wallet** that can generate Ed25519 keypairs
2. **Basic computing resources** for Proof-of-Work computation
3. **Network connectivity** to discover and claim offers

## Step 1: Generate Your Identity

Create a new Ed25519 keypair that will serve as your identity:

```rust
use swimchain::types::identity::{PublicKey, IdentityCreationProof};

// Generate keypair (implementation depends on your wallet)
let (secret_key, public_key) = generate_ed25519_keypair();

// Create identity PoW proof
let pow_proof = IdentityCreationProof {
    public_key,
    timestamp: current_unix_timestamp(),
    nonce: compute_pow_nonce(&public_key, difficulty),
    pow_hash: compute_pow_hash(&public_key, nonce),
};
```

## Step 2: Discover Available Offers

Query the network for sponsorship offers you can claim:

### Find All Active Offers
```rust
let offers = offer_store.list_active_offers(current_time)?;
```

### Find Offers Matching Your Capabilities
```rust
// Calculate your PoW capability (leading zero bits you can compute)
let my_pow_capability = 15;  // Can compute ~15 leading zeros

// Optional: if you have an attester willing to vouch for you
let my_attester = Some(&trusted_entity_pubkey);

let compatible_offers = offer_store.get_offers_for_newcomer(
    my_pow_capability,
    my_attester,
    current_time,
)?;
```

### Browse by Type
```rust
// Probationary offers are easier to claim (lower sponsor risk)
let easy_offers = offer_store.filter_by_type(
    SponsorshipOfferType::Probationary,
    current_time,
)?;
```

## Step 3: Prepare Your Claim

Once you find a suitable offer, prepare your claim:

```rust
use swimchain::sponsorship::{SponsorshipClaim};

let claim = SponsorshipClaim {
    // The offer you're claiming
    offer_id: chosen_offer.offer_id,

    // Your new identity
    claimant: my_public_key,
    claimed_at: current_timestamp,

    // Your identity PoW proof (must meet offer's min_pow_difficulty)
    identity_pow_proof: pow_proof,

    // Application text (if required by offer)
    application_text: if offer.requirements.application_required {
        Some("I want to join because...".to_string())
    } else {
        None
    },

    // Attestation from required attester (if specified)
    attestation_signature: offer.requirements.required_attester.map(|_| {
        // Get signature from attester
        attester_signature
    }),

    // Sign the claim
    claimant_signature: sign(&claim.signature_message()),

    // Will be filled by sponsor
    sponsor_approval: None,
};
```

## Step 4: Submit Your Claim

Submit the claim to the network:

```rust
use swimchain::sponsorship::claim_public_offer;

claim_public_offer(&offer_store, &claim, current_time)?;
```

## Step 5: Wait for Sponsor Approval

After submitting:

1. Your claim is stored as "pending"
2. The sponsor reviews pending claims
3. Sponsor either approves or rejects
4. If approved, you receive a sponsorship

### Checking Claim Status

You can check if your claim is still pending:

```rust
let my_claim = offer_store.get_claim(&offer_id, &my_pubkey)?;
if let Some(claim) = my_claim {
    if claim.is_approved() {
        println!("Congratulations! You're sponsored!");
    } else if claim.is_pending() {
        println!("Still waiting for sponsor review...");
    }
}
```

## Understanding Offer Types

### Open Offers
- **Created by**: Anchor-level sponsors (experienced contributors)
- **Result**: Full sponsorship (non-probationary)
- **Best for**: Newcomers with strong vouching or track record
- **Sponsor consequence**: Full responsibility for your behavior

### Probationary Offers
- **Created by**: Resident-level sponsors (regular contributors)
- **Result**: Probationary sponsorship (180 days)
- **Best for**: Most newcomers
- **Sponsor consequence**: Reduced (25%) responsibility
- **Your status**: Probationary for 6 months

### Conditional Offers
- **Created by**: Anchor-level sponsors
- **Result**: Full sponsorship with requirements
- **Requirements may include**:
  - Higher PoW difficulty
  - Attestation from trusted entity
  - Written application

## Meeting Requirements

### PoW Difficulty

If an offer requires PoW difficulty of N, your proof must have N or more leading zero bits:

```rust
use swimchain::sponsorship::count_leading_zero_bits;

let my_zeros = count_leading_zero_bits(&pow_proof.pow_hash);
if my_zeros >= offer.requirements.min_pow_difficulty {
    // You meet the requirement!
}
```

### Attestation

If an offer requires attestation from a specific entity:

1. Contact the required attester
2. Ask them to sign your identity commitment
3. Include their signature in your claim

```rust
// Message the attester signs
let attestation_message = format!(
    "I vouch for identity {} for offer {}",
    hex::encode(my_pubkey.as_bytes()),
    hex::encode(offer.offer_id),
);

// Include in claim
claim.attestation_signature = Some(attester_signature);
```

### Application Text

If required, write a brief explanation (max 2000 bytes):

```rust
claim.application_text = Some(
    "I want to join Swimchain to contribute content about technology. \
     I've been following the project for 3 months and understand the \
     community guidelines."
        .to_string()
);
```

## Probationary Period

If you join through a Probationary offer:

- **Duration**: 180 days from sponsorship creation
- **Impact**: Your sponsor has reduced consequence for your behavior
- **Graduation**: After 180 days, you become a regular member
- **Early end**: Positive contributions can accelerate trust building

During probation:
- Build contribution history
- Follow community guidelines
- Participate constructively

## Troubleshooting

### "OfferExpired"
The offer has passed its expiration time. Find a different offer.

### "OfferFullyClaimed"
All slots are taken. Find a different offer.

### "InsufficientPow"
Your PoW proof doesn't meet the minimum difficulty. Either:
- Recompute with more iterations
- Find an offer with lower requirements

### "ApplicationRequired"
Add application text to your claim.

### "DuplicateClaim"
You've already claimed this offer. Wait for the sponsor's response.

## Best Practices

1. **Be patient**: Sponsors may take time to review claims
2. **Write good applications**: If required, explain your intentions clearly
3. **Meet requirements honestly**: Don't try to game the system
4. **Start with Probationary**: Lower barrier to entry
5. **Build trust over time**: Your behavior reflects on your sponsor
