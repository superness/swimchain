//! Public sponsorship offer validation logic
//!
//! Validation functions for offer creation and claim requirements per SPEC_11 §3.11.

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::types::{
    count_leading_zero_bits, PublicSponsorshipOffer, SponsorshipClaim,
    SponsorshipOfferType, SponsorshipRequirements, TIMESTAMP_TOLERANCE_SECONDS,
    MAX_OFFER_SPONSEES, MAX_APPLICATION_TEXT_BYTES,
};
use crate::types::identity::PublicKey;

/// Validate offer creation rules
///
/// Checks:
/// 1. expires_at > created_at
/// 2. max_sponsees in 1..=10
/// 3. Timestamp within tolerance of current_time
///
/// # Arguments
/// * `offer` - The offer to validate
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// Ok(()) if valid, appropriate error otherwise
pub fn validate_offer_creation(
    offer: &PublicSponsorshipOffer,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    // 1. expires_at > created_at
    if offer.expires_at <= offer.created_at {
        return Err(SponsorshipError::StaleTimestamp);
    }

    // 2. max_sponsees in 1..=10
    if offer.max_sponsees == 0 || offer.max_sponsees > MAX_OFFER_SPONSEES {
        return Err(SponsorshipError::InvalidInvariant(format!(
            "max_sponsees must be 1-{}",
            MAX_OFFER_SPONSEES
        )));
    }

    // 3. Timestamp tolerance (+-1 hour from current_time)
    let created_diff = if offer.created_at > current_time {
        offer.created_at - current_time
    } else {
        current_time - offer.created_at
    };

    if created_diff > TIMESTAMP_TOLERANCE_SECONDS {
        return Err(SponsorshipError::StaleTimestamp);
    }

    Ok(())
}

/// Validate claim meets offer requirements
///
/// Checks:
/// 1. PoW difficulty meets minimum
/// 2. Required attester signature present and valid (if required)
/// 3. Application text present (if required) and within length limit
///
/// # Arguments
/// * `claim` - The claim to validate
/// * `offer` - The offer being claimed
///
/// # Returns
/// Ok(()) if valid, appropriate error otherwise
pub fn validate_claim_requirements(
    claim: &SponsorshipClaim,
    offer: &PublicSponsorshipOffer,
) -> Result<(), SponsorshipError> {
    // 1. Check PoW difficulty
    let leading_zeros = count_leading_zero_bits(&claim.identity_pow_proof.pow_hash);
    if leading_zeros < offer.requirements.min_pow_difficulty {
        return Err(SponsorshipError::InsufficientPow {
            required: offer.requirements.min_pow_difficulty,
            provided: leading_zeros,
        });
    }

    // 2. Check required attester
    if offer.requirements.required_attester.is_some() {
        // Attestation signature must be present
        if claim.attestation_signature.is_none() {
            return Err(SponsorshipError::MissingAttestation);
        }
        // Note: Actual signature verification would be done by the caller
        // using the crypto module, as we don't have access to signature
        // verification here. This just checks presence.
    }

    // 3. Check application text
    if offer.requirements.application_required {
        match &claim.application_text {
            None => return Err(SponsorshipError::ApplicationRequired),
            Some(text) if text.len() > MAX_APPLICATION_TEXT_BYTES => {
                return Err(SponsorshipError::ApplicationTooLong {
                    max: MAX_APPLICATION_TEXT_BYTES,
                    provided: text.len(),
                });
            }
            _ => {}
        }
    } else if let Some(text) = &claim.application_text {
        // Even if not required, check length limit
        if text.len() > MAX_APPLICATION_TEXT_BYTES {
            return Err(SponsorshipError::ApplicationTooLong {
                max: MAX_APPLICATION_TEXT_BYTES,
                provided: text.len(),
            });
        }
    }

    Ok(())
}

/// Validate offer is still active (not expired, has capacity)
///
/// # Arguments
/// * `offer` - The offer to check
/// * `current_time` - Current Unix timestamp
/// * `claimed_count` - Current number of claims on this offer
///
/// # Returns
/// Ok(()) if active, appropriate error otherwise
pub fn validate_offer_active(
    offer: &PublicSponsorshipOffer,
    current_time: u64,
    claimed_count: u8,
) -> Result<(), SponsorshipError> {
    if offer.expires_at <= current_time {
        return Err(SponsorshipError::OfferExpired);
    }

    if claimed_count >= offer.max_sponsees {
        return Err(SponsorshipError::OfferFullyClaimed);
    }

    Ok(())
}

/// Validate claim timestamp is within tolerance
///
/// # Arguments
/// * `claim` - The claim to check
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// Ok(()) if timestamp is acceptable, error otherwise
pub fn validate_claim_timestamp(
    claim: &SponsorshipClaim,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    let diff = if claim.claimed_at > current_time {
        claim.claimed_at - current_time
    } else {
        current_time - claim.claimed_at
    };

    if diff > TIMESTAMP_TOLERANCE_SECONDS {
        return Err(SponsorshipError::StaleTimestamp);
    }

    Ok(())
}

/// Check if claimant's PoW proof public key matches the claimant
///
/// # Arguments
/// * `claim` - The claim to check
///
/// # Returns
/// Ok(()) if consistent, error otherwise
pub fn validate_claim_identity_consistency(
    claim: &SponsorshipClaim,
) -> Result<(), SponsorshipError> {
    if claim.identity_pow_proof.public_key != claim.claimant {
        return Err(SponsorshipError::InvalidInvariant(
            "PoW proof public key does not match claimant".into(),
        ));
    }
    Ok(())
}

/// Validate requirements struct is well-formed
///
/// # Arguments
/// * `requirements` - The requirements to validate
///
/// # Returns
/// Ok(()) if valid, error otherwise
pub fn validate_requirements(
    requirements: &SponsorshipRequirements,
) -> Result<(), SponsorshipError> {
    // PoW difficulty should be reasonable (0-255 is valid, but >64 is extreme)
    // We don't enforce a hard limit, just document it's possible

    // No other validation needed for now - all field values are valid by type
    Ok(())
}

/// Verify an attestation signature for a claim
///
/// This function verifies that the attestation signature (if present) is valid
/// for the required attester signing over the claimant's public key.
///
/// # Arguments
/// * `claim` - The claim containing the attestation
/// * `offer` - The offer with required attester
/// * `verify_fn` - Function to verify signature: (public_key, message, signature) -> bool
///
/// # Returns
/// Ok(()) if no attestation required, or if attestation is valid
/// Err(MissingAttestation) if required but not provided
/// Err(InvalidAttestation) if signature doesn't verify
pub fn verify_attestation_signature<F>(
    claim: &SponsorshipClaim,
    offer: &PublicSponsorshipOffer,
    verify_fn: F,
) -> Result<(), SponsorshipError>
where
    F: Fn(&PublicKey, &[u8], &[u8; 64]) -> bool,
{
    let Some(required_attester) = &offer.requirements.required_attester else {
        return Ok(()); // No attestation required
    };

    let Some(attestation_sig) = &claim.attestation_signature else {
        return Err(SponsorshipError::MissingAttestation);
    };

    // Attestation message is the claimant's public key
    let message = claim.claimant.as_bytes();

    if !verify_fn(required_attester, message, attestation_sig.as_bytes()) {
        return Err(SponsorshipError::InvalidAttestation);
    }

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::identity::{IdentityCreationProof, Signature};

    fn make_test_offer() -> PublicSponsorshipOffer {
        PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes([1u8; 32]),
            offer_id: [2u8; 16],
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Open,
            requirements: SponsorshipRequirements::default(),
            signature: Signature::from_bytes([0u8; 64]),
            auto_approve: false,
        }
    }

    fn make_test_claim(offer_id: [u8; 16]) -> SponsorshipClaim {
        SponsorshipClaim {
            offer_id,
            claimant: PublicKey::from_bytes([3u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([3u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [0u8; 32], // All zeros = max difficulty
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        }
    }

    #[test]
    fn test_validate_offer_creation_probationary() {
        let mut offer = make_test_offer();
        offer.offer_type = SponsorshipOfferType::Probationary;
        let current_time = 1735689600;

        let result = validate_offer_creation(&offer, current_time);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_offer_creation_open() {
        let mut offer = make_test_offer();
        offer.offer_type = SponsorshipOfferType::Open;
        let current_time = 1735689600;

        // Without level system, all offer types are allowed
        let result = validate_offer_creation(&offer, current_time);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_offer_creation_stale_timestamp() {
        let mut offer = make_test_offer();
        offer.created_at = 1735689600;
        let current_time = 1735700000; // More than 1 hour later

        let result = validate_offer_creation(&offer, current_time);
        assert!(matches!(result, Err(SponsorshipError::StaleTimestamp)));
    }

    #[test]
    fn test_validate_offer_creation_invalid_expiry() {
        let mut offer = make_test_offer();
        offer.created_at = 1735689600;
        offer.expires_at = 1735689600; // Same as created_at
        let current_time = 1735689600;

        let result = validate_offer_creation(&offer, current_time);
        assert!(matches!(result, Err(SponsorshipError::StaleTimestamp)));
    }

    #[test]
    fn test_validate_offer_creation_invalid_max_sponsees() {
        let mut offer = make_test_offer();
        offer.max_sponsees = 0;
        let current_time = 1735689600;

        let result = validate_offer_creation(&offer, current_time);
        assert!(matches!(
            result,
            Err(SponsorshipError::InvalidInvariant(_))
        ));

        offer.max_sponsees = 11; // > MAX_OFFER_SPONSEES
        let result = validate_offer_creation(&offer, current_time);
        assert!(matches!(
            result,
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_validate_claim_requirements_pow() {
        let mut offer = make_test_offer();
        offer.requirements.min_pow_difficulty = 10;

        let mut claim = make_test_claim(offer.offer_id);
        // All zeros = 256 leading zero bits, should pass
        claim.identity_pow_proof.pow_hash = [0u8; 32];

        let result = validate_claim_requirements(&claim, &offer);
        assert!(result.is_ok());

        // Set hash with insufficient zeros
        claim.identity_pow_proof.pow_hash[0] = 0x80; // 0 leading zeros
        let result = validate_claim_requirements(&claim, &offer);
        assert!(matches!(
            result,
            Err(SponsorshipError::InsufficientPow { required: 10, provided: 0 })
        ));
    }

    #[test]
    fn test_validate_claim_requirements_attestation() {
        let mut offer = make_test_offer();
        offer.requirements.required_attester = Some(PublicKey::from_bytes([99u8; 32]));

        let mut claim = make_test_claim(offer.offer_id);

        // Missing attestation
        let result = validate_claim_requirements(&claim, &offer);
        assert!(matches!(result, Err(SponsorshipError::MissingAttestation)));

        // With attestation (signature verification is done elsewhere)
        claim.attestation_signature = Some(Signature::from_bytes([1u8; 64]));
        let result = validate_claim_requirements(&claim, &offer);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_claim_requirements_application_required() {
        let mut offer = make_test_offer();
        offer.requirements.application_required = true;

        let mut claim = make_test_claim(offer.offer_id);

        // Missing application
        let result = validate_claim_requirements(&claim, &offer);
        assert!(matches!(result, Err(SponsorshipError::ApplicationRequired)));

        // With application
        claim.application_text = Some("I want to join the network".to_string());
        let result = validate_claim_requirements(&claim, &offer);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_claim_requirements_application_too_long() {
        let mut offer = make_test_offer();
        offer.requirements.application_required = true;

        let mut claim = make_test_claim(offer.offer_id);
        claim.application_text = Some("x".repeat(MAX_APPLICATION_TEXT_BYTES + 1));

        let result = validate_claim_requirements(&claim, &offer);
        assert!(matches!(
            result,
            Err(SponsorshipError::ApplicationTooLong { .. })
        ));
    }

    #[test]
    fn test_validate_offer_active() {
        let offer = make_test_offer();
        let current_time = 1735689600;

        // Active offer
        let result = validate_offer_active(&offer, current_time, 0);
        assert!(result.is_ok());

        // Expired offer
        let result = validate_offer_active(&offer, offer.expires_at + 1, 0);
        assert!(matches!(result, Err(SponsorshipError::OfferExpired)));

        // Full offer
        let result = validate_offer_active(&offer, current_time, offer.max_sponsees);
        assert!(matches!(result, Err(SponsorshipError::OfferFullyClaimed)));
    }

    #[test]
    fn test_validate_claim_timestamp() {
        let claim = make_test_claim([2u8; 16]);

        // Within tolerance
        let result = validate_claim_timestamp(&claim, claim.claimed_at);
        assert!(result.is_ok());

        // Just within tolerance
        let result = validate_claim_timestamp(&claim, claim.claimed_at + TIMESTAMP_TOLERANCE_SECONDS);
        assert!(result.is_ok());

        // Outside tolerance
        let result = validate_claim_timestamp(&claim, claim.claimed_at + TIMESTAMP_TOLERANCE_SECONDS + 1);
        assert!(matches!(result, Err(SponsorshipError::StaleTimestamp)));
    }

    #[test]
    fn test_validate_claim_identity_consistency() {
        let mut claim = make_test_claim([2u8; 16]);

        // Consistent
        let result = validate_claim_identity_consistency(&claim);
        assert!(result.is_ok());

        // Inconsistent
        claim.identity_pow_proof.public_key = PublicKey::from_bytes([99u8; 32]);
        let result = validate_claim_identity_consistency(&claim);
        assert!(matches!(
            result,
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_verify_attestation_signature_no_requirement() {
        let offer = make_test_offer();
        let claim = make_test_claim(offer.offer_id);

        // No attestation required
        let result = verify_attestation_signature(&claim, &offer, |_, _, _| false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_attestation_signature_valid() {
        let mut offer = make_test_offer();
        offer.requirements.required_attester = Some(PublicKey::from_bytes([99u8; 32]));

        let mut claim = make_test_claim(offer.offer_id);
        claim.attestation_signature = Some(Signature::from_bytes([1u8; 64]));

        // Verification passes
        let result = verify_attestation_signature(&claim, &offer, |_, _, _| true);
        assert!(result.is_ok());

        // Verification fails
        let result = verify_attestation_signature(&claim, &offer, |_, _, _| false);
        assert!(matches!(result, Err(SponsorshipError::InvalidAttestation)));
    }

}
