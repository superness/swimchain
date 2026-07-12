//! Public sponsorship offer flow orchestration
//!
//! Orchestrates the full lifecycle of public sponsorship offers:
//! - Creating offers
//! - Submitting claims
//! - Approving/rejecting claims
//!
//! Per SPEC_11 §3.11.

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::offer_store::OfferStore;
use crate::sponsorship::offer_validation::{
    validate_claim_identity_consistency, validate_claim_requirements, validate_claim_timestamp,
    validate_offer_active, validate_offer_creation,
};
use crate::sponsorship::register_sponsored_identity;
use crate::sponsorship::rights::RightsStore;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::{
    PublicSponsorshipOffer, SponsoredIdentityCreation, SponsorshipClaim, SponsorshipOfferType,
    StoredSponsorship, PROBATION_PERIOD_SECONDS,
};
use crate::types::identity::{PublicKey, Signature};

/// Create a new public sponsorship offer
///
/// Validates the offer creation rules and stores it.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `sponsorship_store` - Storage for sponsorships (to check sponsor status)
/// * `offer` - The offer to create
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// Ok(()) if offer was created successfully
///
/// # Errors
/// - `StaleTimestamp`: Timestamp issues
/// - `InvalidInvariant`: Invalid max_sponsees
/// - `SponsorRestricted`: Sponsor is under penalty
/// - `InvalidOfferSignature`: Signature verification failed (if verify_fn provided)
pub fn create_public_offer(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    offer: &PublicSponsorshipOffer,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    // 1. Validate offer creation rules
    validate_offer_creation(offer, current_time)?;

    // 2. Check sponsor not under penalty
    if let Some(sponsorship) = sponsorship_store.get(&offer.sponsor)? {
        if sponsorship.is_under_penalty(current_time) {
            return Err(SponsorshipError::SponsorRestricted);
        }
    }

    // 3. Verify sponsor signature (caller should verify using crypto module)
    // Note: The offer.signature should be verified against offer.signature_message()
    // We don't do this here since we don't have access to signature verification
    // The caller is responsible for verifying the signature before calling this

    // 4. Store offer
    offer_store.create_offer(offer)?;

    Ok(())
}

/// Create a new public offer with signature verification
///
/// Same as `create_public_offer` but also verifies the sponsor's signature.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `sponsorship_store` - Storage for sponsorships
/// * `offer` - The offer to create
/// * `current_time` - Current Unix timestamp
/// * `verify_fn` - Function to verify signature: (public_key, message, signature) -> bool
pub fn create_public_offer_with_verification<F>(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    offer: &PublicSponsorshipOffer,
    current_time: u64,
    verify_fn: F,
) -> Result<(), SponsorshipError>
where
    F: Fn(&PublicKey, &[u8], &[u8; 64]) -> bool,
{
    // Verify signature first
    let message = offer.signature_message();
    if !verify_fn(&offer.sponsor, &message, offer.signature.as_bytes()) {
        return Err(SponsorshipError::InvalidOfferSignature);
    }

    // Delegate to main function
    create_public_offer(offer_store, sponsorship_store, offer, current_time)
}

/// Submit a claim on a public offer
///
/// Validates the claim requirements and stores it as pending.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `claim` - The claim to submit
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// Ok(()) if claim was submitted successfully
///
/// # Errors
/// - `OfferNotFound`: Offer doesn't exist
/// - `OfferExpired`: Offer has expired
/// - `OfferFullyClaimed`: No slots remaining
/// - `InsufficientPow`: PoW below requirement
/// - `MissingAttestation`: Required attestation not provided
/// - `ApplicationRequired`: Required application text missing
/// - `DuplicateClaim`: Claimant already submitted a claim
/// - `StaleTimestamp`: Claim timestamp outside tolerance
pub fn claim_public_offer(
    offer_store: &OfferStore,
    claim: &SponsorshipClaim,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    // 1. Get offer
    let offer = offer_store
        .get_offer(&claim.offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    // 2. Validate offer is active
    let claimed_count = offer_store.get_claimed_count(&claim.offer_id)?;
    validate_offer_active(&offer, current_time, claimed_count)?;

    // 3. Validate claim timestamp
    validate_claim_timestamp(claim, current_time)?;

    // 4. Validate claim identity consistency
    validate_claim_identity_consistency(claim)?;

    // 5. Validate claim requirements
    validate_claim_requirements(claim, &offer)?;

    // 6. Verify claimant signature (caller should verify)
    // Note: claim.claimant_signature should be verified against claim.signature_message()

    // 7. Submit as pending claim (submit_claim checks for duplicates)
    offer_store.submit_claim(claim)?;

    Ok(())
}

/// Submit a claim with signature verification
///
/// Same as `claim_public_offer` but also verifies the claimant's signature.
pub fn claim_public_offer_with_verification<F>(
    offer_store: &OfferStore,
    claim: &SponsorshipClaim,
    current_time: u64,
    verify_fn: F,
) -> Result<(), SponsorshipError>
where
    F: Fn(&PublicKey, &[u8], &[u8; 64]) -> bool,
{
    // Verify claimant signature
    let message = claim.signature_message();
    if !verify_fn(
        &claim.claimant,
        &message,
        claim.claimant_signature.as_bytes(),
    ) {
        return Err(SponsorshipError::InvalidClaimantSignature);
    }

    // Delegate to main function
    claim_public_offer(offer_store, claim, current_time)
}

/// Approve a pending claim, creating the sponsorship
///
/// This is the final step that creates the actual sponsorship record.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `sponsorship_store` - Storage for sponsorships
/// * `rights_store` - Storage for sponsorship rights (capacity tracking)
/// * `offer_id` - ID of the offer
/// * `claimant` - Public key of the claimant to approve
/// * `sponsor_approval_signature` - Sponsor's signature approving the claim
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// The newly created `StoredSponsorship`
///
/// # Errors
/// - `OfferNotFound`: Offer doesn't exist
/// - `ClaimNotFound`: No pending claim from this claimant
/// - `OfferFullyClaimed`: Race condition - no slots left
pub fn approve_claim(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    rights_store: &RightsStore,
    offer_id: &[u8; 16],
    claimant: &PublicKey,
    sponsor_approval_signature: &Signature,
    current_time: u64,
) -> Result<StoredSponsorship, SponsorshipError> {
    // 1. Get offer
    let offer = offer_store
        .get_offer(offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    // 2. Get claim
    let claim = offer_store
        .get_claim(offer_id, claimant)?
        .ok_or(SponsorshipError::ClaimNotFound)?;

    // 3. Verify sponsor_approval_signature (caller should verify)
    // The message is claim.approval_message()

    // 4. Atomically increment claimed_count (may fail if race to last slot)
    offer_store.increment_claimed_count(offer_id, offer.max_sponsees)?;

    // 5. Determine probationary based on offer_type
    let probationary = offer.offer_type == SponsorshipOfferType::Probationary;

    // 6. Get sponsor depth from sponsorship store
    let sponsor_depth = sponsorship_store
        .get(&offer.sponsor)?
        .map(|s| s.depth)
        .unwrap_or(0);

    // 7. Create SponsoredIdentityCreation
    let creation = SponsoredIdentityCreation {
        new_identity_pubkey: claim.claimant,
        sponsor_pubkey: Some(offer.sponsor),
        sponsor_signature: Some(*sponsor_approval_signature),
        identity_pow_proof: claim.identity_pow_proof.clone(),
        creation_timestamp: current_time,
        probationary,
        genesis_proof: None,
    };

    // 8. Register the sponsorship
    // Note: We use register_sponsored_identity directly since we've already done capacity
    // checks via the offer system. The offer system has its own quota management.
    let sponsorship = register_sponsored_identity(sponsorship_store, &creation, sponsor_depth)?;

    // 9. Record the sponsorship for capacity tracking
    // This ensures the sponsor's capacity is decremented even through the offer system
    rights_store.record_sponsorship(&offer.sponsor, current_time)?;

    // 10. Remove from pending claims
    offer_store.remove_claim(offer_id, claimant)?;

    Ok(sponsorship)
}

/// Approve a claim with signature verification
///
/// Same as `approve_claim` but also verifies the sponsor's approval signature.
pub fn approve_claim_with_verification<F>(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    rights_store: &RightsStore,
    offer_id: &[u8; 16],
    claimant: &PublicKey,
    sponsor_approval_signature: &Signature,
    current_time: u64,
    verify_fn: F,
) -> Result<StoredSponsorship, SponsorshipError>
where
    F: Fn(&PublicKey, &[u8], &[u8; 64]) -> bool,
{
    // Get offer and claim for verification
    let offer = offer_store
        .get_offer(offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    let claim = offer_store
        .get_claim(offer_id, claimant)?
        .ok_or(SponsorshipError::ClaimNotFound)?;

    // Verify sponsor's approval signature
    let message = claim.approval_message();
    if !verify_fn(
        &offer.sponsor,
        &message,
        sponsor_approval_signature.as_bytes(),
    ) {
        return Err(SponsorshipError::InvalidSignature);
    }

    // Delegate to main function
    approve_claim(
        offer_store,
        sponsorship_store,
        rights_store,
        offer_id,
        claimant,
        sponsor_approval_signature,
        current_time,
    )
}

/// Reject a pending claim
///
/// Removes the claim without creating a sponsorship.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `offer_id` - ID of the offer
/// * `claimant` - Public key of the claimant to reject
/// * `sponsor` - Public key of the sponsor (for authorization)
///
/// # Returns
/// Ok(()) if claim was rejected
///
/// # Errors
/// - `OfferNotFound`: Offer doesn't exist
/// - `InvalidSignature`: Caller is not the sponsor
/// - `ClaimNotFound`: No claim from this claimant (already removed or never existed)
pub fn reject_claim(
    offer_store: &OfferStore,
    offer_id: &[u8; 16],
    claimant: &PublicKey,
    sponsor: &PublicKey,
) -> Result<(), SponsorshipError> {
    // 1. Verify offer exists and caller is sponsor
    let offer = offer_store
        .get_offer(offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    if offer.sponsor != *sponsor {
        return Err(SponsorshipError::InvalidSignature);
    }

    // 2. Verify claim exists (optional - remove_claim is idempotent)
    if offer_store.get_claim(offer_id, claimant)?.is_none() {
        return Err(SponsorshipError::ClaimNotFound);
    }

    // 3. Remove claim
    offer_store.remove_claim(offer_id, claimant)?;

    Ok(())
}

/// Cancel an offer (sponsor only)
///
/// Removes the offer and all its pending claims.
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `offer_id` - ID of the offer to cancel
/// * `sponsor` - Public key of the sponsor (for authorization)
///
/// # Returns
/// Ok(()) if offer was cancelled
///
/// # Errors
/// - `OfferNotFound`: Offer doesn't exist
/// - `InvalidSignature`: Caller is not the sponsor
pub fn cancel_offer(
    offer_store: &OfferStore,
    offer_id: &[u8; 16],
    sponsor: &PublicKey,
) -> Result<(), SponsorshipError> {
    // 1. Verify offer exists and caller is sponsor
    let offer = offer_store
        .get_offer(offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    if offer.sponsor != *sponsor {
        return Err(SponsorshipError::InvalidSignature);
    }

    // 2. Delete offer (also removes all claims)
    offer_store.delete_offer(offer_id)?;

    Ok(())
}

/// Get offer status summary
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfferStatus {
    /// The offer
    pub offer: PublicSponsorshipOffer,
    /// Number of slots claimed
    pub claimed_count: u8,
    /// Number of pending claims
    pub pending_claim_count: usize,
    /// Whether offer is expired
    pub is_expired: bool,
    /// Whether offer is fully claimed
    pub is_fully_claimed: bool,
}

/// Get the status of an offer
///
/// # Arguments
/// * `offer_store` - Storage for offers
/// * `offer_id` - ID of the offer
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// `OfferStatus` if offer exists
pub fn get_offer_status(
    offer_store: &OfferStore,
    offer_id: &[u8; 16],
    current_time: u64,
) -> Result<OfferStatus, SponsorshipError> {
    let offer = offer_store
        .get_offer(offer_id)?
        .ok_or(SponsorshipError::OfferNotFound)?;

    let claimed_count = offer_store.get_claimed_count(offer_id)?;
    let pending_claims = offer_store.get_pending_claims(offer_id)?;

    Ok(OfferStatus {
        is_expired: offer.is_expired(current_time),
        is_fully_claimed: claimed_count >= offer.max_sponsees,
        offer,
        claimed_count,
        pending_claim_count: pending_claims.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::types::SponsorshipRequirements;
    use crate::types::identity::IdentityCreationProof;
    use tempfile::TempDir;

    fn create_test_stores() -> (OfferStore, SponsorshipStore, RightsStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let offer_store = OfferStore::from_db(&db).unwrap();
        let sponsorship_store = SponsorshipStore::from_db(&db).unwrap();
        let rights_store = RightsStore::from_db(&db).unwrap();
        (offer_store, sponsorship_store, rights_store, temp_dir)
    }

    fn make_test_offer(sponsor: [u8; 32], offer_id: [u8; 16]) -> PublicSponsorshipOffer {
        PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes(sponsor),
            offer_id,
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Probationary,
            requirements: SponsorshipRequirements::default(),
            signature: Signature::from_bytes([0u8; 64]),
            auto_approve: false,
        }
    }

    fn make_test_claim(offer_id: [u8; 16], claimant: [u8; 32]) -> SponsorshipClaim {
        SponsorshipClaim {
            offer_id,
            claimant: PublicKey::from_bytes(claimant),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes(claimant),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [0u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        }
    }

    fn make_genesis_sponsorship(identity: [u8; 32]) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes(identity),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: crate::sponsorship::types::SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        }
    }

    #[test]
    fn test_create_public_offer_probationary() {
        let (offer_store, sponsorship_store, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        sponsorship_store
            .put(&make_genesis_sponsorship(sponsor))
            .unwrap();

        let offer = make_test_offer(sponsor, [2u8; 16]);
        let result = create_public_offer(&offer_store, &sponsorship_store, &offer, current_time);

        assert!(result.is_ok());
        assert!(offer_store.get_offer(&offer.offer_id).unwrap().is_some());
    }

    #[test]
    fn test_create_public_offer_open() {
        let (offer_store, sponsorship_store, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        sponsorship_store
            .put(&make_genesis_sponsorship(sponsor))
            .unwrap();

        let mut offer = make_test_offer(sponsor, [2u8; 16]);
        offer.offer_type = SponsorshipOfferType::Open;

        let result = create_public_offer(&offer_store, &sponsorship_store, &offer, current_time);

        // Without level system, all offer types are allowed
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_public_offer_sponsor_under_penalty() {
        let (offer_store, sponsorship_store, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        let mut genesis = make_genesis_sponsorship(sponsor);
        genesis.penalty_until = Some(current_time + 3600); // Penalty active
        sponsorship_store.put(&genesis).unwrap();

        let offer = make_test_offer(sponsor, [2u8; 16]);
        let result = create_public_offer(&offer_store, &sponsorship_store, &offer, current_time);

        assert!(matches!(result, Err(SponsorshipError::SponsorRestricted)));
    }

    #[test]
    fn test_claim_public_offer() {
        let (offer_store, sponsorship_store, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        let claim = make_test_claim([2u8; 16], [3u8; 32]);
        let result = claim_public_offer(&offer_store, &claim, current_time);

        assert!(result.is_ok());
        assert!(offer_store
            .get_claim(&offer.offer_id, &claim.claimant)
            .unwrap()
            .is_some());
    }

    #[test]
    fn test_claim_public_offer_expired() {
        let (offer_store, _, _, _dir) = create_test_stores();
        let current_time = 1738281601; // After expiry

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        let claim = make_test_claim([2u8; 16], [3u8; 32]);
        let result = claim_public_offer(&offer_store, &claim, current_time);

        assert!(matches!(result, Err(SponsorshipError::OfferExpired)));
    }

    #[test]
    fn test_claim_public_offer_fully_claimed() {
        let (offer_store, _, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        let mut offer = make_test_offer(sponsor, [2u8; 16]);
        offer.max_sponsees = 1;
        offer_store.create_offer(&offer).unwrap();

        // Fill the offer
        offer_store
            .increment_claimed_count(&offer.offer_id, 1)
            .unwrap();

        let claim = make_test_claim([2u8; 16], [3u8; 32]);
        let result = claim_public_offer(&offer_store, &claim, current_time);

        assert!(matches!(result, Err(SponsorshipError::OfferFullyClaimed)));
    }

    #[test]
    fn test_approve_claim() {
        let (offer_store, sponsorship_store, rights_store, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        sponsorship_store
            .put(&make_genesis_sponsorship(sponsor))
            .unwrap();

        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        let claimant = [3u8; 32];
        let claim = make_test_claim([2u8; 16], claimant);
        offer_store.submit_claim(&claim).unwrap();

        let approval_sig = Signature::from_bytes([1u8; 64]);
        let result = approve_claim(
            &offer_store,
            &sponsorship_store,
            &rights_store,
            &offer.offer_id,
            &claim.claimant,
            &approval_sig,
            current_time,
        );

        assert!(result.is_ok());
        let sponsorship = result.unwrap();
        assert_eq!(sponsorship.sponsored_identity, claim.claimant);
        assert!(sponsorship.probationary);
        assert_eq!(sponsorship.depth, 1); // Genesis is depth 0

        // Claim should be removed
        assert!(offer_store
            .get_claim(&offer.offer_id, &claim.claimant)
            .unwrap()
            .is_none());

        // Claimed count should be incremented
        assert_eq!(offer_store.get_claimed_count(&offer.offer_id).unwrap(), 1);
    }

    #[test]
    fn test_approve_claim_open_offer() {
        let (offer_store, sponsorship_store, rights_store, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        sponsorship_store
            .put(&make_genesis_sponsorship(sponsor))
            .unwrap();

        let mut offer = make_test_offer(sponsor, [2u8; 16]);
        offer.offer_type = SponsorshipOfferType::Open;
        offer_store.create_offer(&offer).unwrap();

        let claimant = [3u8; 32];
        let claim = make_test_claim([2u8; 16], claimant);
        offer_store.submit_claim(&claim).unwrap();

        let approval_sig = Signature::from_bytes([1u8; 64]);
        let result = approve_claim(
            &offer_store,
            &sponsorship_store,
            &rights_store,
            &offer.offer_id,
            &claim.claimant,
            &approval_sig,
            current_time,
        );

        assert!(result.is_ok());
        let sponsorship = result.unwrap();
        assert!(!sponsorship.probationary); // Open = non-probationary
    }

    #[test]
    fn test_reject_claim() {
        let (offer_store, _, _, _dir) = create_test_stores();

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        let claimant = [3u8; 32];
        let claim = make_test_claim([2u8; 16], claimant);
        offer_store.submit_claim(&claim).unwrap();

        let result = reject_claim(
            &offer_store,
            &offer.offer_id,
            &claim.claimant,
            &offer.sponsor,
        );

        assert!(result.is_ok());
        assert!(offer_store
            .get_claim(&offer.offer_id, &claim.claimant)
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_reject_claim_wrong_sponsor() {
        let (offer_store, _, _, _dir) = create_test_stores();

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        let claimant = [3u8; 32];
        let claim = make_test_claim([2u8; 16], claimant);
        offer_store.submit_claim(&claim).unwrap();

        let wrong_sponsor = PublicKey::from_bytes([99u8; 32]);
        let result = reject_claim(
            &offer_store,
            &offer.offer_id,
            &claim.claimant,
            &wrong_sponsor,
        );

        assert!(matches!(result, Err(SponsorshipError::InvalidSignature)));
    }

    #[test]
    fn test_cancel_offer() {
        let (offer_store, _, _, _dir) = create_test_stores();

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        // Add some claims
        for i in 0..3u8 {
            let mut claimant = [0u8; 32];
            claimant[0] = i + 10;
            let claim = make_test_claim([2u8; 16], claimant);
            offer_store.submit_claim(&claim).unwrap();
        }

        let result = cancel_offer(&offer_store, &offer.offer_id, &offer.sponsor);

        assert!(result.is_ok());
        assert!(offer_store.get_offer(&offer.offer_id).unwrap().is_none());
        assert_eq!(
            offer_store.get_all_claims(&offer.offer_id).unwrap().len(),
            0
        );
    }

    #[test]
    fn test_get_offer_status() {
        let (offer_store, _, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        let offer = make_test_offer(sponsor, [2u8; 16]);
        offer_store.create_offer(&offer).unwrap();

        // Add claims
        for i in 0..3u8 {
            let mut claimant = [0u8; 32];
            claimant[0] = i + 10;
            let claim = make_test_claim([2u8; 16], claimant);
            offer_store.submit_claim(&claim).unwrap();
        }

        // Approve one
        offer_store
            .increment_claimed_count(&offer.offer_id, 5)
            .unwrap();

        let status = get_offer_status(&offer_store, &offer.offer_id, current_time).unwrap();

        assert_eq!(status.claimed_count, 1);
        assert_eq!(status.pending_claim_count, 3);
        assert!(!status.is_expired);
        assert!(!status.is_fully_claimed);
    }

    #[test]
    fn test_signature_verification_functions() {
        let (offer_store, sponsorship_store, _, _dir) = create_test_stores();
        let current_time = 1735689600;

        let sponsor = [1u8; 32];
        sponsorship_store
            .put(&make_genesis_sponsorship(sponsor))
            .unwrap();

        let offer = make_test_offer(sponsor, [2u8; 16]);

        // Test with always-fail verifier
        let result = create_public_offer_with_verification(
            &offer_store,
            &sponsorship_store,
            &offer,
            current_time,
            |_, _, _| false,
        );
        assert!(matches!(
            result,
            Err(SponsorshipError::InvalidOfferSignature)
        ));

        // Test with always-pass verifier
        let result = create_public_offer_with_verification(
            &offer_store,
            &sponsorship_store,
            &offer,
            current_time,
            |_, _, _| true,
        );
        assert!(result.is_ok());
    }
}
