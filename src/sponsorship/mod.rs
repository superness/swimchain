//! Sponsorship system for Sybil resistance per SPEC_11
//!
//! This module implements the sponsorship tree that provides Sybil resistance
//! through a hierarchical trust model. Each identity requires sponsorship from
//! an existing trusted member (except genesis identities).
//!
//! # Genesis Identity System
//!
//! Genesis identities are the trust roots of the sponsorship tree. They:
//! - Have no sponsor (`sponsor = None`)
//! - Have depth 0 in the sponsorship tree
//! - Cannot be revoked (only self-deactivate)
//! - Can sponsor new identities immediately (no Resident requirement)
//!
//! ## Proof Types
//!
//! - **HardcodedList**: Valid only during bootstrap period (first 30 days)
//! - **MultiSigThreshold**: Requires 2/3 of existing genesis attestations
//! - **CommunityVote**: Reserved for future governance
//!
//! See SPEC_11 Section 3.9 and RESEARCH_07 for rationale.
//!
//! # Consequence Propagation
//!
//! When an identity misbehaves, consequences propagate through the sponsorship tree
//! per SPEC_11 Section 4.2 and 4.5:
//!
//! - Direct sponsor (hop 1): 100% of consequence
//! - Sponsor's sponsor (hop 2): 50% of consequence
//! - Beyond hop 2: Warning only (negligible)
//!
//! ## Penalty Types
//! - `RestrictedPosting`: View-only mode
//! - `LostInviteSlots`: Cannot sponsor new identities
//! - `AcceleratedDecay`: Content decays faster
//! - `PermanentRevocation`: Identity revoked forever
//!
//! ## Recovery
//! Penalties can be reduced through contribution during penalty period.
//! Requires MIN_PENALTY_RECOVERY_ATTESTATION_COUNT (3) attestations.

pub mod error;
pub mod genesis_list;
pub mod linear_chain;
pub mod offer_flow;
pub mod offer_store;
pub mod offer_validation;
pub mod orphan;
pub mod penalty;
pub mod penalty_store;
pub mod propagation;
pub mod recovery;
pub mod rights;
pub mod storage;
pub mod types;
pub mod validation;
pub mod wire;

pub use error::*;
pub use genesis_list::{
    get_genesis_category, get_hardcoded_genesis_list, is_in_hardcoded_genesis_list,
    GenesisDistributionCategory,
};
pub use linear_chain::LinearChainDetector;
pub use offer_store::OfferStore;
pub use offer_flow::{
    approve_claim, cancel_offer, claim_public_offer, create_public_offer,
    get_offer_status, reject_claim, OfferStatus,
};
pub use offer_validation::{
    validate_claim_requirements, validate_claim_timestamp, validate_offer_active,
    validate_offer_creation, verify_attestation_signature,
};
pub use penalty::{
    MisbehaviorSeverity, PenaltyRecord, PenaltyType, ABUSE_PENALTY_SECONDS,
    ILLEGAL_PENALTY_SECONDS, MIN_PENALTY_RECOVERY_ATTESTATION_COUNT, SPAM_PENALTY_SECONDS,
    ALL_INVITE_SLOTS,
};
pub use penalty_store::{PenaltyStore, Warning};
pub use propagation::{propagate_consequences, PropagationResult};
pub use recovery::{calculate_recovery, RecoveryResult};
pub use rights::{RightsStore, SponsorshipCapacityInfo, SponsorshipRightsRecord};
pub use storage::SponsorshipStore;
pub use types::*;
pub use validation::*;
pub use wire::{
    deserialize_claim, deserialize_claim_response, deserialize_offer, serialize_claim,
    serialize_claim_response, serialize_offer, ClaimResponse, ClaimResponseType, WireError,
};
pub use orphan::{
    apply_cascade_protection, count_at_risk_identities, execute_adoption, validate_adoption,
    AdoptionRequest, AdoptionResult, OrphanCapabilities, OrphanDetectionTask, OrphanInfo,
    OrphanReason, ORPHAN_SCAN_INTERVAL_SECONDS,
};

use crate::types::identity::PublicKey;

/// Register a new genesis identity
///
/// Orchestrates the full genesis identity creation flow:
/// 1. Verify genesis proof (slot bounds, uniqueness, proof type validation)
/// 2. Claim the genesis slot atomically
/// 3. Store the sponsorship record
///
/// # Arguments
/// * `store` - Sponsorship storage
/// * `creation` - Genesis identity creation request
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// The newly created `StoredSponsorship` on success
///
/// # Errors
/// - `MissingGenesisProof`: No genesis proof provided
/// - `InvalidGenesisSlot`: Slot number out of bounds
/// - `GenesisSlotClaimed`: Slot already taken
/// - `NotInGenesisList`: Identity not in hardcoded list
/// - `InsufficientGenesisAttestations`: Not enough MultiSig attestations
/// - `InvalidGenesisAttestation`: Attestation signature invalid
/// - `CommunityVoteNotImplemented`: CommunityVote proof type used
pub fn register_genesis_identity(
    store: &SponsorshipStore,
    creation: &SponsoredIdentityCreation,
    current_time: u64,
) -> Result<StoredSponsorship, SponsorshipError> {
    let proof = creation
        .genesis_proof
        .as_ref()
        .ok_or(SponsorshipError::MissingGenesisProof)?;

    // 1. Verify genesis creation
    verify_genesis_creation(
        creation,
        current_time,
        |slot| store.is_slot_claimed(slot).unwrap_or(false),
        is_in_hardcoded_genesis_list,
        store.count_active_genesis(),
        |pk| store.is_genesis(pk).unwrap_or(false),
    )?;

    // 2. Claim the genesis slot (atomic via compare-and-swap)
    store.claim_genesis_slot(proof.slot_number, &creation.new_identity_pubkey)?;

    // 3. Create and store sponsorship record
    let sponsorship = StoredSponsorship {
        sponsored_identity: creation.new_identity_pubkey,
        sponsor: None,
        creation_timestamp: creation.creation_timestamp,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };

    store.put(&sponsorship)?;

    Ok(sponsorship)
}

/// Register a new sponsored identity (non-genesis)
///
/// Orchestrates the regular sponsorship creation flow:
/// 1. Validates all sponsorship rules via `validate_sponsorship`
/// 2. Creates and stores the sponsorship record
///
/// # Arguments
/// * `store` - Sponsorship storage
/// * `creation` - Sponsored identity creation request
/// * `current_time` - Current Unix timestamp
/// * `sponsor_depth` - Depth of the sponsor in the tree
/// * `is_sponsor_genesis` - Whether the sponsor is a genesis identity
///
/// # Note
/// The caller is responsible for providing the correct `sponsor_depth`.
/// Genesis identities always have depth 0; sponsored identities have sponsor.depth + 1.
pub fn register_sponsored_identity(
    store: &SponsorshipStore,
    creation: &SponsoredIdentityCreation,
    sponsor_depth: u8,
) -> Result<StoredSponsorship, SponsorshipError> {
    let sponsor = creation
        .sponsor_pubkey
        .ok_or(SponsorshipError::MissingSignature)?;

    let probation_expires = if creation.probationary {
        Some(creation.creation_timestamp + PROBATION_PERIOD_SECONDS)
    } else {
        None
    };

    let sponsorship = StoredSponsorship {
        sponsored_identity: creation.new_identity_pubkey,
        sponsor: Some(sponsor),
        creation_timestamp: creation.creation_timestamp,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: sponsor_depth.saturating_add(1),
        probationary: creation.probationary,
        probation_expires,
        positive_contribution_score: 0,
        is_genesis: false,
        orphaned_at: None,
    };

    store.put(&sponsorship)?;

    Ok(sponsorship)
}

/// Register a new sponsored identity with rights checking
///
/// This is the preferred entry point for creating sponsorships as it
/// enforces cooldown rules per SPEC_11 Section 4.1.
///
/// # Arguments
/// * `store` - Sponsorship storage
/// * `rights_store` - Rights tracking storage
/// * `creation` - Sponsored identity creation request
/// * `sponsor_depth` - Depth of the sponsor in the tree
/// * `is_genesis_sponsor` - If true, bypasses capacity checks (genesis can always sponsor)
/// * `current_time` - Current Unix timestamp
///
/// # Note
/// Genesis identities can sponsor without capacity limits during bootstrap,
/// but their sponsorships are still recorded for tracking purposes.
/// With PoW-only gating, level-based capacity limits are removed.
pub fn register_sponsored_identity_with_rights(
    store: &SponsorshipStore,
    rights_store: &RightsStore,
    creation: &SponsoredIdentityCreation,
    sponsor_depth: u8,
    is_genesis_sponsor: bool,
    current_time: u64,
) -> Result<StoredSponsorship, SponsorshipError> {
    let sponsor = creation
        .sponsor_pubkey
        .ok_or(SponsorshipError::MissingSignature)?;

    // Genesis sponsors bypass capacity checks but still record sponsorships
    if !is_genesis_sponsor {
        // Check capacity using penalty info from sponsorship store
        let capacity_info = rights_store.can_sponsor(
            &sponsor,
            current_time,
            |pk, time| {
                store
                    .get(pk)
                    .ok()
                    .flatten()
                    .map(|s| s.is_under_penalty(time))
                    .unwrap_or(false)
            },
        )?;

        if !capacity_info.can_sponsor {
            return Err(capacity_info
                .denial_reason
                .unwrap_or(SponsorshipError::NoAvailableSlots));
        }
    }

    // Create the sponsorship
    let sponsorship = register_sponsored_identity(store, creation, sponsor_depth)?;

    // Record the sponsorship for capacity tracking
    rights_store.record_sponsorship(&sponsor, current_time)?;

    Ok(sponsorship)
}

/// Register a new sponsored identity with rights checking and linear chain detection
///
/// This is the full-featured entry point that includes all validation and detection:
/// 1. Checks if sponsor has a confirmed linear chain flag (restricts to probationary)
/// 2. Enforces cooldown rules per SPEC_11 Section 4.1
/// 3. Creates the sponsorship record
/// 4. Triggers linear chain detection on the sponsor after the new sponsorship
///
/// # Arguments
/// * `store` - Sponsorship storage
/// * `rights_store` - Rights tracking storage
/// * `detector` - Optional linear chain detector (pass None to skip detection)
/// * `creation` - Sponsored identity creation request
/// * `sponsor_depth` - Depth of the sponsor in the tree
/// * `is_genesis_sponsor` - If true, bypasses capacity checks (genesis can always sponsor)
/// * `current_time` - Current Unix timestamp
///
/// # Detection Behavior
/// After successful registration, the sponsor is checked against linear chain thresholds.
/// If suspicious, a flag is created (status: Pending). Detection errors are logged but
/// don't fail the sponsorship - this is a "fire-and-forget" operation.
///
/// # Confirmed Flag Restriction
/// Sponsors with CONFIRMED linear chain flags can only create probationary sponsorships.
/// PENDING flags don't restrict (flagging doesn't auto-punish per SPEC_11).
pub fn register_sponsored_identity_with_rights_and_detection(
    store: &SponsorshipStore,
    rights_store: &RightsStore,
    detector: Option<&LinearChainDetector>,
    creation: &SponsoredIdentityCreation,
    sponsor_depth: u8,
    is_genesis_sponsor: bool,
    current_time: u64,
) -> Result<StoredSponsorship, SponsorshipError> {
    let sponsor = creation
        .sponsor_pubkey
        .ok_or(SponsorshipError::MissingSignature)?;

    // Check if sponsor is flagged (confirmed) for linear chain
    if let Some(det) = detector {
        validate_sponsor_not_flagged(&sponsor, creation.probationary, |pk| {
            det.get_flag(pk)
                .ok()
                .flatten()
                .map(|f| f.is_confirmed())
                .unwrap_or(false)
        })?;
    }

    // Delegate to existing function for rights checking
    let sponsorship = register_sponsored_identity_with_rights(
        store,
        rights_store,
        creation,
        sponsor_depth,
        is_genesis_sponsor,
        current_time,
    )?;

    // Fire-and-forget: check if sponsor now triggers linear chain detection
    if let Some(det) = detector {
        // Errors logged but don't fail the sponsorship
        if let Err(_e) = det.check_and_flag(store, &sponsor, current_time) {
            // In production: log::warn!("Linear chain detection failed: {}", e);
            // Silently continue - detection failure shouldn't block sponsorship
        }
    }

    Ok(sponsorship)
}

/// Handle misbehavior detection per SPEC_11 Section 9.2
///
/// This is the main callback for when misbehavior is detected. It:
/// 1. Propagates consequences through the sponsor chain
/// 2. Applies penalties to the offender and sponsors
/// 3. Updates the sponsorship store with penalty_until timestamps
/// 4. Records warnings for hop 3+ sponsors
///
/// # Arguments
/// * `sponsorship_store` - Store for sponsorship records
/// * `penalty_store` - Store for penalty records
/// * `offender` - Identity that misbehaved
/// * `severity` - Severity of the misbehavior
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// `PropagationResult` containing all applied penalties and warnings
///
/// # Errors
/// - If severity is `None` (nothing to propagate)
/// - If storage operations fail
pub fn on_misbehavior(
    sponsorship_store: &SponsorshipStore,
    penalty_store: &PenaltyStore,
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    current_time: u64,
) -> Result<PropagationResult, SponsorshipError> {
    // Propagate consequences through the sponsor chain
    let result = propagate_consequences(sponsorship_store, offender, severity, current_time)?;

    // Apply offender penalty
    penalty_store.apply_penalty(&result.offender_penalty)?;

    // Update sponsorship store for quick penalty checks
    if !result.offender_penalty.is_permanent() {
        sponsorship_store.set_penalty(offender, result.offender_penalty.current_expires_at)?;
    } else {
        // Permanent revocation: update status
        sponsorship_store.update_status(offender, SponsorshipStatus::Revoked)?;
    }

    // Apply sponsor penalties
    for penalty in &result.sponsor_penalties {
        penalty_store.apply_penalty(penalty)?;

        // Also update StoredSponsorship.penalty_until for quick checks
        sponsorship_store.set_penalty(&penalty.identity, penalty.current_expires_at)?;
    }

    // Record warnings for hop 3+ (no actual penalty)
    for warning in &result.warnings {
        penalty_store.record_warning(warning)?;
    }

    Ok(result)
}

/// Apply recovery to a penalty based on contribution
///
/// This is a convenience function that combines recovery calculation
/// with actual penalty update.
///
/// # Arguments
/// * `penalty_store` - Store for penalty records
/// * `sponsorship_store` - Store for sponsorship records
/// * `identity` - Identity to recover
/// * `penalty_type` - Type of penalty to recover from
/// * `contribution_during_penalty` - Bandwidth served since penalty started
/// * `expected_contribution_rate` - Normal rate in bytes per second
/// * `attestation_count` - Number of attestations for contribution
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// `RecoveryResult` with recovery details, or error if penalty not found
pub fn apply_recovery_to_penalty(
    penalty_store: &PenaltyStore,
    sponsorship_store: &SponsorshipStore,
    identity: &PublicKey,
    penalty_type: PenaltyType,
    contribution_during_penalty: u64,
    expected_contribution_rate: u64,
    attestation_count: u8,
    current_time: u64,
) -> Result<RecoveryResult, SponsorshipError> {
    // Find the active penalty
    let penalties = penalty_store.get_active_penalties(identity, current_time)?;
    let penalty = penalties
        .iter()
        .find(|p| p.penalty_type == penalty_type)
        .ok_or_else(|| {
            SponsorshipError::InvalidInvariant(format!(
                "No active {} penalty found for identity",
                penalty_type
            ))
        })?;

    // Calculate recovery
    let recovery = calculate_recovery(
        penalty,
        contribution_during_penalty,
        expected_contribution_rate,
        attestation_count,
        current_time,
    );

    // If recovery was accelerated, apply it
    if recovery.accelerated {
        penalty_store.apply_recovery(identity, penalty_type, recovery.new_expires_at)?;

        // Update sponsorship store too
        sponsorship_store.set_penalty(identity, recovery.new_expires_at)?;
    }

    Ok(recovery)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_stores() -> (SponsorshipStore, PenaltyStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let sponsorship_store = SponsorshipStore::from_db(&db).unwrap();
        let penalty_store = PenaltyStore::from_db(&db).unwrap();
        (sponsorship_store, penalty_store, temp_dir)
    }

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    fn make_genesis_sponsorship(identity: PublicKey) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        }
    }

    fn make_regular_sponsorship(
        identity: PublicKey,
        sponsor: PublicKey,
        depth: u8,
    ) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
            sponsor: Some(sponsor),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        }
    }

    #[test]
    fn test_on_misbehavior_spam() {
        let (sponsorship_store, penalty_store, _dir) = create_test_stores();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B (offender)
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2);

        sponsorship_store.put(&make_genesis_sponsorship(genesis)).unwrap();
        sponsorship_store.put(&make_regular_sponsorship(a, genesis, 1)).unwrap();
        sponsorship_store.put(&make_regular_sponsorship(b, a, 2)).unwrap();

        let result = on_misbehavior(
            &sponsorship_store,
            &penalty_store,
            &b,
            MisbehaviorSeverity::Spam,
            time,
        ).unwrap();

        // Offender penalty applied
        assert!(penalty_store.has_active_penalty(&b, time).unwrap());

        // Sponsor penalty applied
        assert!(penalty_store.has_active_penalty(&a, time).unwrap());

        // Sponsorship store updated
        let b_sponsorship = sponsorship_store.get(&b).unwrap().unwrap();
        assert!(b_sponsorship.is_under_penalty(time));

        // Genesis gets warning (hop 2 for spam)
        assert_eq!(result.warnings.len(), 1);
        let warnings = penalty_store.get_warnings(&genesis).unwrap();
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn test_on_misbehavior_illegal_revokes() {
        let (sponsorship_store, penalty_store, _dir) = create_test_stores();
        let time = 1735689600;

        // Create chain: Genesis -> Offender
        let genesis = test_pubkey(0);
        let offender = test_pubkey(1);

        sponsorship_store.put(&make_genesis_sponsorship(genesis)).unwrap();
        sponsorship_store.put(&make_regular_sponsorship(offender, genesis, 1)).unwrap();

        on_misbehavior(
            &sponsorship_store,
            &penalty_store,
            &offender,
            MisbehaviorSeverity::Illegal,
            time,
        ).unwrap();

        // Offender should be revoked
        let sponsorship = sponsorship_store.get(&offender).unwrap().unwrap();
        assert_eq!(sponsorship.status, SponsorshipStatus::Revoked);

        // Penalty should be permanent
        let penalties = penalty_store.get_penalties(&offender).unwrap();
        assert!(penalties[0].is_permanent());
    }

    #[test]
    fn test_apply_recovery_to_penalty() {
        let (sponsorship_store, penalty_store, _dir) = create_test_stores();
        let time = 1735689600;

        // Create genesis identity
        let genesis = test_pubkey(0);
        sponsorship_store.put(&make_genesis_sponsorship(genesis)).unwrap();

        // Apply a spam penalty
        on_misbehavior(
            &sponsorship_store,
            &penalty_store,
            &genesis,
            MisbehaviorSeverity::Spam,
            time,
        ).unwrap();

        // Apply recovery with 2× contribution
        let elapsed = 86400; // 1 day
        let expected_rate = 1000;
        let contribution = expected_rate * elapsed * 2; // 2×

        let recovery = apply_recovery_to_penalty(
            &penalty_store,
            &sponsorship_store,
            &genesis,
            PenaltyType::RestrictedPosting,
            contribution,
            expected_rate,
            3, // attestations
            time + elapsed,
        ).unwrap();

        assert!(recovery.accelerated);
        assert!((recovery.reduction_factor - 0.5).abs() < f32::EPSILON);

        // Check penalty was updated
        let penalties = penalty_store.get_penalties(&genesis).unwrap();
        assert_eq!(penalties[0].current_expires_at, recovery.new_expires_at);
    }
}
