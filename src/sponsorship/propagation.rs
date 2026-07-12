//! Consequence propagation through the sponsorship tree
//!
//! Implements SPEC_11 Section 4.2: Graduated consequence propagation.
//!
//! When an identity misbehaves, penalties propagate up the sponsor chain with decay:
//! - Offender (hop 0): Full penalty based on severity
//! - Direct sponsor (hop 1): 100% of consequence
//! - Sponsor's sponsor (hop 2): 50% of consequence
//! - Beyond hop 2: Warning only (0% consequence)

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::penalty::{
    MisbehaviorSeverity, PenaltyRecord, PenaltyType, ABUSE_PENALTY_SECONDS, ALL_INVITE_SLOTS,
    ILLEGAL_PENALTY_SECONDS, SPAM_PENALTY_SECONDS,
};
use crate::sponsorship::penalty_store::Warning;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::{
    CONSEQUENCE_DECAY_HOP_1, CONSEQUENCE_DECAY_HOP_2, CONSEQUENCE_DECAY_HOP_3_PLUS,
    PROBATION_CONSEQUENCE_MULTIPLIER,
};
use crate::types::identity::PublicKey;

/// Result of propagating consequences through the sponsor chain
#[derive(Debug, Clone)]
pub struct PropagationResult {
    /// Penalty applied to the offender
    pub offender_penalty: PenaltyRecord,
    /// Penalties applied to sponsors in the chain
    pub sponsor_penalties: Vec<PenaltyRecord>,
    /// Warnings issued to sponsors at hop 3+ (no actual penalty)
    pub warnings: Vec<Warning>,
}

/// Propagate consequences per SPEC_11 Section 4.2
///
/// # Algorithm
/// 1. Create offender penalty based on severity (hop 0)
/// 2. Walk sponsor chain and compute penalties with decay
/// 3. For hop 3+, issue warning only (decay = 0.0)
///
/// # Arguments
/// * `sponsorship_store` - Store to lookup sponsor chain
/// * `offender` - Identity that misbehaved
/// * `severity` - Severity of the misbehavior
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// `PropagationResult` containing all penalties and warnings to apply
///
/// # Errors
/// Returns error if severity is `None` (nothing to propagate) or storage fails
pub fn propagate_consequences(
    sponsorship_store: &SponsorshipStore,
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    current_time: u64,
) -> Result<PropagationResult, SponsorshipError> {
    // Nothing to propagate for None severity
    if !severity.is_propagating() {
        return Err(SponsorshipError::InvalidInvariant(
            "Cannot propagate consequences for None severity".into(),
        ));
    }

    // Step 1: Create offender penalty
    let offender_penalty = compute_offender_penalty(offender, severity, current_time);

    // Step 2: Get sponsor chain (includes offender at index 0)
    let chain = sponsorship_store.get_path_to_genesis(offender)?;

    let mut sponsor_penalties = Vec::new();
    let mut warnings = Vec::new();

    // Determine if offender is probationary (affects ALL sponsor penalties)
    let offender_is_probationary = sponsorship_store
        .get(offender)?
        .map(|s| s.probationary)
        .unwrap_or(false);
    let probation_multiplier = if offender_is_probationary {
        PROBATION_CONSEQUENCE_MULTIPLIER
    } else {
        1.0
    };

    // Step 3: Walk the chain (skip index 0 which is offender)
    for (idx, sponsor_pk) in chain.iter().enumerate().skip(1) {
        let hop_distance = idx as u8;

        // Get decay multiplier based on hop distance
        let hop_decay = get_hop_decay(hop_distance);

        // Apply both hop decay and probation multiplier (if offender is probationary)
        let total_multiplier = hop_decay * probation_multiplier;

        // If multiplier is effectively 0, record warning only
        if total_multiplier < f32::EPSILON {
            warnings.push(Warning {
                identity: *sponsor_pk,
                caused_by: *offender,
                severity,
                timestamp: current_time,
                hop_distance,
            });
            // Don't break - continue to record warnings for all remaining sponsors
            continue;
        }

        // Compute sponsor penalty
        if let Some(penalty) = compute_sponsor_penalty(
            sponsor_pk,
            offender,
            severity,
            hop_distance,
            total_multiplier,
            current_time,
        ) {
            sponsor_penalties.push(penalty);
        } else {
            // No penalty for this hop (e.g., spam at hop 2), record warning
            warnings.push(Warning {
                identity: *sponsor_pk,
                caused_by: *offender,
                severity,
                timestamp: current_time,
                hop_distance,
            });
        }
    }

    Ok(PropagationResult {
        offender_penalty,
        sponsor_penalties,
        warnings,
    })
}

/// Get the decay multiplier for a given hop distance
///
/// Per SPEC_11 §3.6:
/// - Hop 1: 1.0 (100%)
/// - Hop 2: 0.5 (50%)
/// - Hop 3+: 0.0 (warning only)
fn get_hop_decay(hop_distance: u8) -> f32 {
    match hop_distance {
        1 => CONSEQUENCE_DECAY_HOP_1,
        2 => CONSEQUENCE_DECAY_HOP_2,
        _ => CONSEQUENCE_DECAY_HOP_3_PLUS,
    }
}

/// Compute the penalty for the direct offender (hop 0)
///
/// Per SPEC_11 §4.2:
/// - Spam: RestrictedPosting, 7 days
/// - Abuse: RestrictedPosting, 30 days
/// - Illegal: PermanentRevocation
fn compute_offender_penalty(
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    current_time: u64,
) -> PenaltyRecord {
    PenaltyRecord::for_offender(*offender, severity, current_time)
}

/// Compute the penalty for a sponsor at given hop distance
///
/// Per SPEC_11 §4.2 sponsor penalty table:
///
/// | Severity | Hop 1                                    | Hop 2                    |
/// |----------|------------------------------------------|--------------------------|
/// | Spam     | LostInviteSlots(1), 7 days               | Warning only             |
/// | Abuse    | LostInviteSlots(ALL), 30 days            | LostInviteSlots(1), 7 days|
/// | Illegal  | LostInviteSlots(ALL)+AcceleratedDecay,90d| LostInviteSlots(1), 30 days|
///
/// Duration is scaled by the multiplier (hop_decay * probation_factor).
///
/// Returns `None` if no penalty should be applied (warning only case).
fn compute_sponsor_penalty(
    sponsor: &PublicKey,
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    hop_distance: u8,
    multiplier: f32,
    current_time: u64,
) -> Option<PenaltyRecord> {
    // Determine base penalty parameters based on severity and hop
    let (base_duration, should_penalize) = match (severity, hop_distance) {
        // Hop 1 penalties
        (MisbehaviorSeverity::Spam, 1) => (SPAM_PENALTY_SECONDS, true),
        (MisbehaviorSeverity::Abuse, 1) => (ABUSE_PENALTY_SECONDS, true),
        (MisbehaviorSeverity::Illegal, 1) => (ILLEGAL_PENALTY_SECONDS, true),

        // Hop 2 penalties
        (MisbehaviorSeverity::Spam, 2) => (0, false), // Warning only
        (MisbehaviorSeverity::Abuse, 2) => (SPAM_PENALTY_SECONDS, true),
        (MisbehaviorSeverity::Illegal, 2) => (ABUSE_PENALTY_SECONDS, true),

        // Hop 3+ or None severity: no penalty
        _ => (0, false),
    };

    if !should_penalize {
        return None;
    }

    // Apply multiplier to duration
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let scaled_duration = ((base_duration as f64) * (multiplier as f64)) as u64;

    // Minimum 1 day penalty if there's any penalty at all
    let final_duration = scaled_duration.max(86_400);

    Some(PenaltyRecord::for_sponsor(
        *sponsor,
        *offender,
        severity,
        hop_distance,
        final_duration,
        current_time,
    ))
}

/// Compute total penalty for an offender's misbehavior
///
/// This is a convenience function that returns just the offender's penalty
/// without walking the sponsor chain.
pub fn compute_single_penalty(
    offender: &PublicKey,
    severity: MisbehaviorSeverity,
    current_time: u64,
) -> Result<PenaltyRecord, SponsorshipError> {
    if !severity.is_propagating() {
        return Err(SponsorshipError::InvalidInvariant(
            "Cannot compute penalty for None severity".into(),
        ));
    }

    Ok(compute_offender_penalty(offender, severity, current_time))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_store() -> (SponsorshipStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();
        (store, temp_dir)
    }

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    fn make_genesis_sponsorship(
        identity: PublicKey,
    ) -> crate::sponsorship::types::StoredSponsorship {
        crate::sponsorship::types::StoredSponsorship {
            sponsored_identity: identity,
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

    fn make_regular_sponsorship(
        identity: PublicKey,
        sponsor: PublicKey,
        depth: u8,
        probationary: bool,
    ) -> crate::sponsorship::types::StoredSponsorship {
        crate::sponsorship::types::StoredSponsorship {
            sponsored_identity: identity,
            sponsor: Some(sponsor),
            creation_timestamp: 1735689600,
            status: crate::sponsorship::types::SponsorshipStatus::Active,
            penalty_until: None,
            depth,
            probationary,
            probation_expires: if probationary {
                Some(1735689600 + 7_776_000)
            } else {
                None
            },
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        }
    }

    #[test]
    fn test_propagate_none_severity_error() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let result =
            propagate_consequences(&store, &test_pubkey(1), MisbehaviorSeverity::None, time);

        assert!(result.is_err());
    }

    #[test]
    fn test_propagate_spam_simple_chain() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B (offender)
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2); // offender

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(a, genesis, 1, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(b, a, 2, false))
            .unwrap();

        let result = propagate_consequences(&store, &b, MisbehaviorSeverity::Spam, time).unwrap();

        // Offender gets RestrictedPosting
        assert_eq!(
            result.offender_penalty.penalty_type,
            PenaltyType::RestrictedPosting
        );
        assert_eq!(result.offender_penalty.hop_distance, 0);

        // Sponsor A (hop 1) gets LostInviteSlots(1)
        assert_eq!(result.sponsor_penalties.len(), 1);
        assert_eq!(result.sponsor_penalties[0].identity, a);
        assert_eq!(
            result.sponsor_penalties[0].penalty_type,
            PenaltyType::LostInviteSlots
        );
        assert_eq!(result.sponsor_penalties[0].slots_lost, 1);
        assert_eq!(result.sponsor_penalties[0].hop_distance, 1);

        // Genesis (hop 2) gets warning only for spam
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].identity, genesis);
        assert_eq!(result.warnings[0].hop_distance, 2);
    }

    #[test]
    fn test_propagate_abuse_chain_abc() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B -> C (offender)
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2);
        let c = test_pubkey(3); // offender

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(a, genesis, 1, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(b, a, 2, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(c, b, 3, false))
            .unwrap();

        let result = propagate_consequences(&store, &c, MisbehaviorSeverity::Abuse, time).unwrap();

        // C (offender): RestrictedPosting, 30 days
        assert_eq!(
            result.offender_penalty.penalty_type,
            PenaltyType::RestrictedPosting
        );
        assert_eq!(
            result.offender_penalty.base_expires_at,
            time + ABUSE_PENALTY_SECONDS
        );

        // B (hop 1): LostInviteSlots(ALL), 30 days
        assert_eq!(result.sponsor_penalties.len(), 2);
        let b_penalty = result
            .sponsor_penalties
            .iter()
            .find(|p| p.identity == b)
            .unwrap();
        assert_eq!(b_penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(b_penalty.slots_lost, ALL_INVITE_SLOTS);
        assert_eq!(b_penalty.hop_distance, 1);

        // A (hop 2): LostInviteSlots(1), 7 days (scaled by 0.5)
        let a_penalty = result
            .sponsor_penalties
            .iter()
            .find(|p| p.identity == a)
            .unwrap();
        assert_eq!(a_penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(a_penalty.slots_lost, 1);
        assert_eq!(a_penalty.hop_distance, 2);

        // Genesis (hop 3): Warning only
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].identity, genesis);
    }

    #[test]
    fn test_propagate_illegal_chain() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B (offender)
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2); // offender

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(a, genesis, 1, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(b, a, 2, false))
            .unwrap();

        let result =
            propagate_consequences(&store, &b, MisbehaviorSeverity::Illegal, time).unwrap();

        // B (offender): PermanentRevocation
        assert_eq!(
            result.offender_penalty.penalty_type,
            PenaltyType::PermanentRevocation
        );
        assert!(result.offender_penalty.is_permanent());

        // A (hop 1): LostInviteSlots(ALL) + AcceleratedDecay, 90 days
        assert_eq!(result.sponsor_penalties.len(), 2);
        let a_penalty = result
            .sponsor_penalties
            .iter()
            .find(|p| p.identity == a)
            .unwrap();
        assert_eq!(a_penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(a_penalty.slots_lost, ALL_INVITE_SLOTS);
        assert_eq!(
            a_penalty.additional_penalty,
            Some(PenaltyType::AcceleratedDecay)
        );

        // Genesis (hop 2): LostInviteSlots(1), 30 days (scaled by 0.5)
        let genesis_penalty = result
            .sponsor_penalties
            .iter()
            .find(|p| p.identity == genesis)
            .unwrap();
        assert_eq!(genesis_penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(genesis_penalty.slots_lost, 1);
    }

    #[test]
    fn test_genesis_misbehavior_no_sponsors() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Only genesis identity
        let genesis = test_pubkey(0);
        store.put(&make_genesis_sponsorship(genesis)).unwrap();

        let result =
            propagate_consequences(&store, &genesis, MisbehaviorSeverity::Spam, time).unwrap();

        // Only offender penalty, no sponsor penalties or warnings
        assert_eq!(result.offender_penalty.identity, genesis);
        assert!(result.sponsor_penalties.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_probationary_reduces_penalty() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B (offender, probationary)
        // When B (offender) is probationary, A's penalty is reduced
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2); // offender

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(a, genesis, 1, false))
            .unwrap();
        store.put(&make_regular_sponsorship(b, a, 2, true)).unwrap(); // B (offender) is probationary

        let result = propagate_consequences(&store, &b, MisbehaviorSeverity::Spam, time).unwrap();

        // A (hop 1): Penalty should be 25% of normal because offender B is probationary
        let a_penalty = result
            .sponsor_penalties
            .iter()
            .find(|p| p.identity == a)
            .unwrap();

        // Normal would be 7 days, probationary = 7 days * 0.25 = 1.75 days
        // But we have minimum 1 day floor
        let expected_max = SPAM_PENALTY_SECONDS as f64 * PROBATION_CONSEQUENCE_MULTIPLIER as f64;
        let expected_min = 86_400u64; // 1 day minimum

        let actual_duration = a_penalty.base_expires_at - time;
        assert!(
            actual_duration >= expected_min,
            "Duration {} should be at least minimum {}",
            actual_duration,
            expected_min
        );
        assert!(
            actual_duration <= expected_max as u64 + 1, // Allow small rounding
            "Duration {} should be at most {}",
            actual_duration,
            expected_max
        );
    }

    #[test]
    fn test_hop_3_plus_warning_only() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // Create chain: Genesis -> A -> B -> C -> D -> E (offender)
        let genesis = test_pubkey(0);
        let a = test_pubkey(1);
        let b = test_pubkey(2);
        let c = test_pubkey(3);
        let d = test_pubkey(4);
        let e = test_pubkey(5); // offender

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(a, genesis, 1, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(b, a, 2, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(c, b, 3, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(d, c, 4, false))
            .unwrap();
        store
            .put(&make_regular_sponsorship(e, d, 5, false))
            .unwrap();

        let result = propagate_consequences(&store, &e, MisbehaviorSeverity::Abuse, time).unwrap();

        // D (hop 1) and C (hop 2) get penalties
        assert_eq!(result.sponsor_penalties.len(), 2);

        // B (hop 3), A (hop 4), Genesis (hop 5) get warnings only
        assert_eq!(result.warnings.len(), 3);

        // Verify hop distances in warnings
        let warning_hops: Vec<u8> = result.warnings.iter().map(|w| w.hop_distance).collect();
        assert!(warning_hops.contains(&3));
        assert!(warning_hops.contains(&4));
        assert!(warning_hops.contains(&5));
    }

    #[test]
    fn test_severity_determines_duration() {
        let time = 1735689600;

        // Spam: 7 days
        let spam =
            compute_single_penalty(&test_pubkey(1), MisbehaviorSeverity::Spam, time).unwrap();
        assert_eq!(spam.base_expires_at - time, SPAM_PENALTY_SECONDS);

        // Abuse: 30 days
        let abuse =
            compute_single_penalty(&test_pubkey(2), MisbehaviorSeverity::Abuse, time).unwrap();
        assert_eq!(abuse.base_expires_at - time, ABUSE_PENALTY_SECONDS);

        // Illegal: permanent
        let illegal =
            compute_single_penalty(&test_pubkey(3), MisbehaviorSeverity::Illegal, time).unwrap();
        assert!(illegal.is_permanent());
        assert_eq!(illegal.base_expires_at, u64::MAX);
    }

    #[test]
    fn test_get_hop_decay() {
        assert!((get_hop_decay(1) - 1.0).abs() < f32::EPSILON);
        assert!((get_hop_decay(2) - 0.5).abs() < f32::EPSILON);
        assert!((get_hop_decay(3) - 0.0).abs() < f32::EPSILON);
        assert!((get_hop_decay(4) - 0.0).abs() < f32::EPSILON);
        assert!((get_hop_decay(255) - 0.0).abs() < f32::EPSILON);
    }
}
