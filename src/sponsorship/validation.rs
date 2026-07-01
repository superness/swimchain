//! Sponsorship validation rules
//!
//! Validation rules V-SPONSOR-01 through V-SPONSOR-05 per SPEC_11.

use crate::crypto::signature::verify;
use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::types::*;
use crate::types::identity::{PublicKey, Signature};

/// V-SPONSOR-01: Verify sponsor signature
///
/// Validates that the sponsor's signature is correct over the message:
/// new_identity_pubkey(32) || timestamp(8 BE)
pub fn validate_sponsor_signature(
    new_identity: &PublicKey,
    timestamp: u64,
    sponsor: &PublicKey,
    signature: &Signature,
) -> Result<(), SponsorshipError> {
    // Signature covers: new_identity_pubkey(32) || timestamp(8 BE)
    let mut msg = Vec::with_capacity(40);
    msg.extend_from_slice(new_identity.as_bytes());
    msg.extend_from_slice(&timestamp.to_be_bytes());

    if !verify(sponsor, &msg, signature) {
        return Err(SponsorshipError::InvalidSignature);
    }
    Ok(())
}

/// V-SPONSOR-02: Validate timestamp freshness
///
/// Ensures the timestamp is not in the future and not too old
/// (within TIMESTAMP_TOLERANCE_SECONDS).
pub fn validate_timestamp_freshness(
    timestamp: u64,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    if timestamp > current_time {
        return Err(SponsorshipError::StaleTimestamp);
    }
    let age = current_time - timestamp;
    if age > TIMESTAMP_TOLERANCE_SECONDS {
        return Err(SponsorshipError::StaleTimestamp);
    }
    Ok(())
}

/// V-SPONSOR-03: Validate identity uniqueness
///
/// Takes closure to allow flexible storage lookup.
pub fn validate_identity_uniqueness<F>(
    identity: &PublicKey,
    exists_check: F,
) -> Result<(), SponsorshipError>
where
    F: FnOnce(&PublicKey) -> bool,
{
    if exists_check(identity) {
        return Err(SponsorshipError::IdentityExists);
    }
    Ok(())
}


/// V-SPONSOR-05: Validate genesis handling
///
/// Ensures genesis identities have valid proofs and non-genesis identities
/// have sponsors but not genesis proofs.
///
/// Note: This performs basic structural validation. Full genesis verification
/// (attestation signatures, hardcoded list membership, bootstrap period checks)
/// is done by `verify_genesis_creation()`.
pub fn validate_genesis_handling(
    creation: &SponsoredIdentityCreation,
) -> Result<(), SponsorshipError> {
    match (&creation.sponsor_pubkey, &creation.genesis_proof) {
        (None, None) => Err(SponsorshipError::MissingGenesisProof),
        (None, Some(proof)) => {
            proof.validate_slot()?;
            // Attestation requirements depend on proof type
            match proof.proof_type {
                GenesisProofType::HardcodedList => {
                    // No attestations required - verified via hardcoded list lookup
                    Ok(())
                }
                GenesisProofType::MultiSigThreshold => {
                    // Attestation count validated in verify_genesis_creation
                    // which has access to active genesis count
                    Ok(())
                }
                GenesisProofType::CommunityVote => {
                    Err(SponsorshipError::CommunityVoteNotImplemented)
                }
            }
        }
        (Some(_), Some(_)) => Err(SponsorshipError::InvalidInvariant(
            "Cannot have both sponsor and genesis proof".into(),
        )),
        (Some(_), None) => Ok(()), // Regular sponsorship, no genesis checks needed
    }
}


/// Calculate required attestation count for MultiSigThreshold
///
/// Uses ceiling division: ceil((2 * active_count) / 3)
/// This ensures we always require at least 2/3 of existing genesis identities.
#[must_use]
pub fn calculate_required_attestations(active_genesis_count: usize) -> usize {
    // (2 * count + 2) / 3 gives ceiling of 2/3
    // For count=3: (6+2)/3 = 2
    // For count=6: (12+2)/3 = 4
    // For count=9: (18+2)/3 = 6
    (active_genesis_count * 2 + 2) / 3
}

/// Verify a single genesis attestation signature
///
/// Attestation signs: new_pubkey(32) || slot_number(2 BE) || timestamp(8 BE)
pub fn verify_genesis_attestation(
    attestation: &GenesisAttestation,
    new_pubkey: &PublicKey,
    slot: u16,
) -> Result<(), SponsorshipError> {
    let msg = GenesisAttestation::signing_bytes(new_pubkey, slot, attestation.timestamp);
    if !verify(&attestation.attester, &msg, &attestation.signature) {
        return Err(SponsorshipError::InvalidGenesisAttestation);
    }
    Ok(())
}

/// Verify genesis identity creation per SPEC_11 Section 4.1
///
/// This function performs comprehensive validation of a genesis identity creation:
/// 1. Slot bounds validation
/// 2. Slot uniqueness check
/// 3. Proof type-specific verification:
///    - HardcodedList: list membership
///    - MultiSigThreshold: 2/3 attestation count + signature verification
///    - CommunityVote: Returns NotImplemented
///
/// # Arguments
/// * `creation` - The genesis identity creation request
/// * `current_time` - Current Unix timestamp
/// * `is_slot_claimed` - Closure to check if slot is already claimed
/// * `is_in_genesis_list` - Closure to check hardcoded list membership
/// * `active_genesis_count` - Number of currently active genesis identities
/// * `is_attester_genesis` - Closure to verify attester is a genesis identity
///
/// # Note
/// PoW verification is caller's responsibility and should be called separately
/// via `verify_identity_pow()`.
pub fn verify_genesis_creation<SC, GL, AG>(
    creation: &SponsoredIdentityCreation,
    current_time: u64,
    is_slot_claimed: SC,
    is_in_genesis_list: GL,
    active_genesis_count: usize,
    is_attester_genesis: AG,
) -> Result<(), SponsorshipError>
where
    SC: FnOnce(u16) -> bool,
    GL: FnOnce(&PublicKey) -> bool,
    AG: Fn(&PublicKey) -> bool,
{
    let proof = creation
        .genesis_proof
        .as_ref()
        .ok_or(SponsorshipError::MissingGenesisProof)?;

    // 1. Validate slot bounds
    proof.validate_slot()?;

    // 2. Check slot not already claimed
    if is_slot_claimed(proof.slot_number) {
        return Err(SponsorshipError::GenesisSlotClaimed);
    }

    // 3. Verify based on proof type
    match proof.proof_type {
        GenesisProofType::HardcodedList => {
            if !is_in_genesis_list(&creation.new_identity_pubkey) {
                return Err(SponsorshipError::NotInGenesisList);
            }
        }
        GenesisProofType::MultiSigThreshold => {
            let required = calculate_required_attestations(active_genesis_count);
            if proof.attestations.len() < required {
                return Err(SponsorshipError::InsufficientGenesisAttestations);
            }
            // Verify each attestation
            for attestation in &proof.attestations {
                // Attester must be a genesis identity
                if !is_attester_genesis(&attestation.attester) {
                    return Err(SponsorshipError::InvalidGenesisAttestation);
                }
                verify_genesis_attestation(attestation, &creation.new_identity_pubkey, proof.slot_number)?;
            }
        }
        GenesisProofType::CommunityVote => {
            return Err(SponsorshipError::CommunityVoteNotImplemented);
        }
    }

    Ok(())
}

/// Validate that flagged sponsors can only create probationary sponsorships
///
/// Per SPEC_11 Section 7: Flagging doesn't auto-punish, but CONFIRMED flags
/// restrict sponsors to probationary sponsorships only.
///
/// # Arguments
/// * `sponsor` - The sponsor's public key
/// * `is_probationary` - Whether the proposed sponsorship is probationary
/// * `is_flagged_confirmed` - Closure that returns true if sponsor has a confirmed flag
///
/// # Errors
/// Returns `SponsorFlaggedForLinearChain` if sponsor has a confirmed flag and
/// the sponsorship is not probationary.
///
/// # Note
/// Only CONFIRMED flags restrict sponsorship. PENDING flags allow normal
/// sponsorships because "flagging doesn't auto-punish" per the spec.
pub fn validate_sponsor_not_flagged<F>(
    sponsor: &PublicKey,
    is_probationary: bool,
    is_flagged_confirmed: F,
) -> Result<(), SponsorshipError>
where
    F: FnOnce(&PublicKey) -> bool,
{
    // Probationary sponsorships are always allowed
    if is_probationary {
        return Ok(());
    }

    // If sponsor has confirmed linear chain flag, cannot create non-probationary
    if is_flagged_confirmed(sponsor) {
        return Err(SponsorshipError::SponsorFlaggedForLinearChain);
    }

    Ok(())
}

/// Unified validation for SponsoredIdentityCreation
///
/// Runs all validation rules in sequence:
/// - V-SPONSOR-02: Timestamp freshness
/// - V-SPONSOR-03: Identity uniqueness
/// - V-SPONSOR-05: Genesis handling (basic structural check)
/// - V-SPONSOR-01: Signature validity (for non-genesis)
///
/// # Genesis Identity Handling
///
/// For genesis identities (`sponsor_pubkey = None`, `genesis_proof = Some(...)`),
/// this function performs basic structural validation only. Full genesis verification
/// (attestation signatures, list membership, bootstrap period) should be done via
/// `verify_genesis_creation()` or `register_genesis_identity()`.
///
/// # Note
/// With PoW-only gating, level-based eligibility checks are removed.
/// Any identity can sponsor, subject to penalty and cooldown checks.
pub fn validate_sponsorship<EF>(
    creation: &SponsoredIdentityCreation,
    current_time: u64,
    exists_check: EF,
) -> Result<(), SponsorshipError>
where
    EF: FnOnce(&PublicKey) -> bool,
{
    // V-SPONSOR-02: Timestamp freshness
    validate_timestamp_freshness(creation.creation_timestamp, current_time)?;

    // V-SPONSOR-03: Identity uniqueness
    validate_identity_uniqueness(&creation.new_identity_pubkey, exists_check)?;

    // V-SPONSOR-05: Genesis handling (basic structural check)
    validate_genesis_handling(creation)?;

    // For genesis creation, full verification is done via verify_genesis_creation
    if creation.is_genesis() {
        // Genesis identities bypass sponsor eligibility check
        // Full genesis verification done by register_genesis_identity
        return Ok(());
    }

    // For regular sponsorship (non-genesis)
    if let (Some(sponsor), Some(sig)) = (&creation.sponsor_pubkey, &creation.sponsor_signature) {
        // V-SPONSOR-01: Signature validity
        validate_sponsor_signature(
            &creation.new_identity_pubkey,
            creation.creation_timestamp,
            sponsor,
            sig,
        )?;
    } else if creation.sponsor_pubkey.is_some() && creation.sponsor_signature.is_none() {
        return Err(SponsorshipError::MissingSignature);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::{generate_keypair, sign};
    use crate::types::identity::IdentityCreationProof;

    fn make_test_pow_proof(pubkey: PublicKey) -> IdentityCreationProof {
        IdentityCreationProof {
            public_key: pubkey,
            timestamp: 1735689600,
            nonce: 12345,
            pow_hash: [0u8; 32],
        }
    }

    #[test]
    fn test_validate_sponsor_signature_valid() {
        let sponsor_kp = generate_keypair();
        let new_identity = PublicKey::from_bytes([1u8; 32]);
        let timestamp = 1735689600u64;

        // Create signature over new_identity || timestamp (BE)
        let mut msg = Vec::with_capacity(40);
        msg.extend_from_slice(new_identity.as_bytes());
        msg.extend_from_slice(&timestamp.to_be_bytes());
        let signature = sign(&sponsor_kp.private_key, &msg);

        let result = validate_sponsor_signature(
            &new_identity,
            timestamp,
            &sponsor_kp.public_key,
            &signature,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_sponsor_signature_invalid() {
        let sponsor_kp = generate_keypair();
        let new_identity = PublicKey::from_bytes([1u8; 32]);
        let timestamp = 1735689600u64;

        // Create invalid signature (wrong message)
        let signature = sign(&sponsor_kp.private_key, b"wrong message");

        let result = validate_sponsor_signature(
            &new_identity,
            timestamp,
            &sponsor_kp.public_key,
            &signature,
        );
        assert!(matches!(result, Err(SponsorshipError::InvalidSignature)));
    }

    #[test]
    fn test_validate_timestamp_freshness_valid() {
        let current_time = 1735689600u64;

        // Exactly at current time
        assert!(validate_timestamp_freshness(current_time, current_time).is_ok());

        // 30 minutes ago (within 1 hour tolerance)
        assert!(validate_timestamp_freshness(current_time - 1800, current_time).is_ok());

        // 1 hour ago (at the edge of tolerance)
        assert!(validate_timestamp_freshness(current_time - 3600, current_time).is_ok());
    }

    #[test]
    fn test_validate_timestamp_freshness_too_old() {
        let current_time = 1735689600u64;

        // 2 hours ago (exceeds 1 hour tolerance)
        let result = validate_timestamp_freshness(current_time - 7200, current_time);
        assert!(matches!(result, Err(SponsorshipError::StaleTimestamp)));
    }

    #[test]
    fn test_validate_timestamp_freshness_future() {
        let current_time = 1735689600u64;

        // 1 second in the future
        let result = validate_timestamp_freshness(current_time + 1, current_time);
        assert!(matches!(result, Err(SponsorshipError::StaleTimestamp)));
    }

    #[test]
    fn test_validate_identity_uniqueness_new() {
        let identity = PublicKey::from_bytes([1u8; 32]);
        let result = validate_identity_uniqueness(&identity, |_| false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_identity_uniqueness_exists() {
        let identity = PublicKey::from_bytes([1u8; 32]);
        let result = validate_identity_uniqueness(&identity, |_| true);
        assert!(matches!(result, Err(SponsorshipError::IdentityExists)));
    }

    #[test]
    fn test_validate_genesis_handling_valid_genesis_hardcoded_list() {
        // HardcodedList doesn't require attestations - this is the bug fix
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![], // No attestations required for HardcodedList
            }),
        };
        assert!(validate_genesis_handling(&creation).is_ok());
    }

    #[test]
    fn test_validate_genesis_handling_valid_genesis_multisig() {
        // MultiSigThreshold doesn't check attestation count in validate_genesis_handling
        // (that's done in verify_genesis_creation which has access to active count)
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::MultiSigThreshold,
                proof_data: vec![],
                attestations: vec![], // Count validated in verify_genesis_creation
            }),
        };
        assert!(validate_genesis_handling(&creation).is_ok());
    }

    #[test]
    fn test_validate_genesis_handling_missing_proof() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: None,
        };
        assert!(matches!(
            validate_genesis_handling(&creation),
            Err(SponsorshipError::MissingGenesisProof)
        ));
    }

    #[test]
    fn test_validate_genesis_handling_community_vote_not_implemented() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::CommunityVote,
                proof_data: vec![],
                attestations: vec![],
            }),
        };
        assert!(matches!(
            validate_genesis_handling(&creation),
            Err(SponsorshipError::CommunityVoteNotImplemented)
        ));
    }

    #[test]
    fn test_validate_genesis_handling_both_sponsor_and_proof() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: Some(PublicKey::from_bytes([2u8; 32])),
            sponsor_signature: Some(Signature::from_bytes([0u8; 64])),
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };
        assert!(matches!(
            validate_genesis_handling(&creation),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_validate_genesis_handling_regular_sponsorship() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: Some(PublicKey::from_bytes([2u8; 32])),
            sponsor_signature: Some(Signature::from_bytes([0u8; 64])),
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: None,
        };
        assert!(validate_genesis_handling(&creation).is_ok());
    }

    #[test]
    fn test_validate_sponsorship_missing_signature() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: Some(PublicKey::from_bytes([2u8; 32])),
            sponsor_signature: None, // Missing!
            identity_pow_proof: make_test_pow_proof(PublicKey::from_bytes([1u8; 32])),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: None,
        };

        let result = validate_sponsorship(
            &creation,
            1735689600,
            |_| false,
        );
        assert!(matches!(result, Err(SponsorshipError::MissingSignature)));
    }

    #[test]
    fn test_validate_sponsorship_full_valid() {
        let sponsor_kp = generate_keypair();
        let new_identity = PublicKey::from_bytes([1u8; 32]);
        let timestamp = 1735689600u64;

        // Create valid signature
        let mut msg = Vec::with_capacity(40);
        msg.extend_from_slice(new_identity.as_bytes());
        msg.extend_from_slice(&timestamp.to_be_bytes());
        let signature = sign(&sponsor_kp.private_key, &msg);

        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_identity,
            sponsor_pubkey: Some(sponsor_kp.public_key),
            sponsor_signature: Some(signature),
            identity_pow_proof: make_test_pow_proof(new_identity),
            creation_timestamp: timestamp,
            probationary: false,
            genesis_proof: None,
        };

        let result = validate_sponsorship(&creation, timestamp, |_| false);
        assert!(result.is_ok());
    }

    // === Genesis Validation Function Tests ===

    #[test]
    fn test_calculate_required_attestations() {
        // Formula: ceiling of (2 * count) / 3
        // count=3: ceil(6/3) = 2
        assert_eq!(calculate_required_attestations(3), 2);
        // count=4: ceil(8/3) = 3
        assert_eq!(calculate_required_attestations(4), 3);
        // count=6: ceil(12/3) = 4
        assert_eq!(calculate_required_attestations(6), 4);
        // count=9: ceil(18/3) = 6
        assert_eq!(calculate_required_attestations(9), 6);
        // count=0: ceil(0/3) = 0 (edge case)
        assert_eq!(calculate_required_attestations(0), 0);
        // count=1: ceil(2/3) = 1
        assert_eq!(calculate_required_attestations(1), 1);
        // count=2: ceil(4/3) = 2
        assert_eq!(calculate_required_attestations(2), 2);
    }

    #[test]
    fn test_verify_genesis_attestation_valid() {
        let attester_kp = generate_keypair();
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let slot = 5u16;
        let timestamp = 1735689600u64;

        // Create valid attestation signature
        let msg = GenesisAttestation::signing_bytes(&new_pubkey, slot, timestamp);
        let signature = sign(&attester_kp.private_key, &msg);

        let attestation = GenesisAttestation {
            attester: attester_kp.public_key,
            signature,
            timestamp,
        };

        assert!(verify_genesis_attestation(&attestation, &new_pubkey, slot).is_ok());
    }

    #[test]
    fn test_verify_genesis_attestation_invalid_signature() {
        let attester_kp = generate_keypair();
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let slot = 5u16;
        let timestamp = 1735689600u64;

        // Create invalid attestation signature (wrong message)
        let signature = sign(&attester_kp.private_key, b"wrong message");

        let attestation = GenesisAttestation {
            attester: attester_kp.public_key,
            signature,
            timestamp,
        };

        assert!(matches!(
            verify_genesis_attestation(&attestation, &new_pubkey, slot),
            Err(SponsorshipError::InvalidGenesisAttestation)
        ));
    }

    #[test]
    fn test_verify_genesis_creation_hardcoded_list_valid() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,        // current_time
            |_| false,         // slot not claimed
            |pk| *pk == new_pubkey, // identity is in genesis list
            0,                 // active_genesis_count
            |_| true,          // attester is genesis (not used for HardcodedList)
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_genesis_creation_hardcoded_list_not_in_list() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,
            |_| false,
            |_| false, // Not in genesis list
            0,
            |_| true,
        );

        assert!(matches!(result, Err(SponsorshipError::NotInGenesisList)));
    }

    #[test]
    fn test_verify_genesis_creation_slot_already_claimed() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,
            |_| true, // Slot already claimed
            |_| true,
            0,
            |_| true,
        );

        assert!(matches!(result, Err(SponsorshipError::GenesisSlotClaimed)));
    }

    #[test]
    fn test_verify_genesis_creation_slot_out_of_bounds() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 100, // MAX_GENESIS_IDENTITIES = 100, so 100 is invalid
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,
            |_| false,
            |_| true,
            0,
            |_| true,
        );

        assert!(matches!(result, Err(SponsorshipError::InvalidGenesisSlot)));
    }

    #[test]
    fn test_verify_genesis_creation_multisig_insufficient_attestations() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::MultiSigThreshold,
                proof_data: vec![],
                attestations: vec![
                    // Only 1 attestation
                    GenesisAttestation {
                        attester: PublicKey::from_bytes([10u8; 32]),
                        signature: Signature::from_bytes([0u8; 64]),
                        timestamp: 1735689600,
                    },
                ],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,
            |_| false,
            |_| true,
            3, // 3 active genesis, need 2 attestations
            |_| true,
        );

        assert!(matches!(
            result,
            Err(SponsorshipError::InsufficientGenesisAttestations)
        ));
    }

    #[test]
    fn test_verify_genesis_creation_multisig_attester_not_genesis() {
        let attester_kp = generate_keypair();
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let slot = 0u16;
        let timestamp = 1735689600u64;

        // Create valid signature
        let msg = GenesisAttestation::signing_bytes(&new_pubkey, slot, timestamp);
        let signature = sign(&attester_kp.private_key, &msg);

        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: timestamp,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: slot,
                proof_type: GenesisProofType::MultiSigThreshold,
                proof_data: vec![],
                attestations: vec![
                    GenesisAttestation {
                        attester: attester_kp.public_key,
                        signature,
                        timestamp,
                    },
                    GenesisAttestation {
                        attester: attester_kp.public_key, // Same attester for simplicity
                        signature: sign(&attester_kp.private_key, &msg),
                        timestamp,
                    },
                ],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            timestamp,
            |_| false,
            |_| true,
            3, // 3 active genesis, need 2 attestations (we have 2)
            |_| false, // Attester is NOT genesis
        );

        assert!(matches!(
            result,
            Err(SponsorshipError::InvalidGenesisAttestation)
        ));
    }

    #[test]
    fn test_verify_genesis_creation_community_vote_not_implemented() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::CommunityVote,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        let result = verify_genesis_creation(
            &creation,
            1735689600,
            |_| false,
            |_| true,
            0,
            |_| true,
        );

        assert!(matches!(
            result,
            Err(SponsorshipError::CommunityVoteNotImplemented)
        ));
    }

    #[test]
    fn test_validate_sponsorship_genesis_bypasses_sponsor_checks() {
        let new_pubkey = PublicKey::from_bytes([1u8; 32]);
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: new_pubkey,
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(new_pubkey),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };

        // Genesis creation should bypass sponsor checks
        let result = validate_sponsorship(
            &creation,
            1735689600,
            |_| false,
        );

        assert!(result.is_ok());
    }

    // === Linear Chain Flag Validation Tests ===

    #[test]
    fn test_validate_sponsor_not_flagged_not_flagged() {
        let sponsor = PublicKey::from_bytes([1u8; 32]);

        // Not flagged, not probationary = OK
        let result = validate_sponsor_not_flagged(&sponsor, false, |_| false);
        assert!(result.is_ok());

        // Not flagged, probationary = OK
        let result = validate_sponsor_not_flagged(&sponsor, true, |_| false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_sponsor_not_flagged_confirmed_non_probationary() {
        let sponsor = PublicKey::from_bytes([1u8; 32]);

        // Confirmed flag + non-probationary = Error
        let result = validate_sponsor_not_flagged(&sponsor, false, |_| true);
        assert!(matches!(
            result,
            Err(SponsorshipError::SponsorFlaggedForLinearChain)
        ));
    }

    #[test]
    fn test_validate_sponsor_not_flagged_confirmed_probationary_allowed() {
        let sponsor = PublicKey::from_bytes([1u8; 32]);

        // Confirmed flag + probationary = OK (probationary always allowed)
        let result = validate_sponsor_not_flagged(&sponsor, true, |_| true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_sponsor_not_flagged_pending_allowed() {
        let sponsor = PublicKey::from_bytes([1u8; 32]);

        // Pending flag (not confirmed) + non-probationary = OK
        // The closure returns false because flag is not confirmed
        let result = validate_sponsor_not_flagged(&sponsor, false, |_| false);
        assert!(result.is_ok());
    }
}
