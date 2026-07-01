//! Comprehensive tests for consequence propagation per SPEC_11
//!
//! These tests validate:
//! - Penalty propagation through sponsor chain
//! - Severity-based duration calculation
//! - Recovery mechanisms
//! - Penalty stacking rules
//! - Edge cases (genesis misbehavior, hop 3+, probationary)

use swimchain::sponsorship::{
    on_misbehavior, apply_recovery_to_penalty, propagate_consequences,
    calculate_recovery, MisbehaviorSeverity, PenaltyRecord, PenaltyStore,
    PenaltyType, SponsorshipStore, StoredSponsorship, SponsorshipStatus,
    ABUSE_PENALTY_SECONDS, ILLEGAL_PENALTY_SECONDS, SPAM_PENALTY_SECONDS,
    ALL_INVITE_SLOTS,
};
use swimchain::types::identity::PublicKey;
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

fn make_genesis(identity: PublicKey) -> StoredSponsorship {
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

fn make_sponsored(
    identity: PublicKey,
    sponsor: PublicKey,
    depth: u8,
    probationary: bool,
) -> StoredSponsorship {
    StoredSponsorship {
        sponsored_identity: identity,
        sponsor: Some(sponsor),
        creation_timestamp: 1735689600,
        status: SponsorshipStatus::Active,
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

// === Test Case 1: Consequence Propagation Abuse Chain A→B→C ===

#[test]
fn test_consequence_propagation_abuse_chain_abc() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Create chain: Genesis → A → B → C (offender)
    let genesis = test_pubkey(0);
    let a = test_pubkey(1);
    let b = test_pubkey(2);
    let c = test_pubkey(3);

    store.put(&make_genesis(genesis)).unwrap();
    store.put(&make_sponsored(a, genesis, 1, false)).unwrap();
    store.put(&make_sponsored(b, a, 2, false)).unwrap();
    store.put(&make_sponsored(c, b, 3, false)).unwrap();

    let result = on_misbehavior(&store, &penalty_store, &c, MisbehaviorSeverity::Abuse, time)
        .unwrap();

    // C (offender): RestrictedPosting, 30 days, hop=0
    assert_eq!(result.offender_penalty.penalty_type, PenaltyType::RestrictedPosting);
    assert_eq!(result.offender_penalty.hop_distance, 0);
    assert_eq!(result.offender_penalty.base_expires_at, time + ABUSE_PENALTY_SECONDS);

    // B (hop 1): LostInviteSlots(ALL), 30 days
    let b_penalty = result.sponsor_penalties.iter().find(|p| p.identity == b).unwrap();
    assert_eq!(b_penalty.penalty_type, PenaltyType::LostInviteSlots);
    assert_eq!(b_penalty.slots_lost, ALL_INVITE_SLOTS);
    assert_eq!(b_penalty.hop_distance, 1);

    // A (hop 2): LostInviteSlots(1), reduced duration (50%)
    let a_penalty = result.sponsor_penalties.iter().find(|p| p.identity == a).unwrap();
    assert_eq!(a_penalty.penalty_type, PenaltyType::LostInviteSlots);
    assert_eq!(a_penalty.slots_lost, 1);
    assert_eq!(a_penalty.hop_distance, 2);

    // Genesis (hop 3): Warning only
    assert_eq!(result.warnings.len(), 1);
    assert_eq!(result.warnings[0].identity, genesis);
    assert_eq!(result.warnings[0].hop_distance, 3);
}

// === Test Case 2: Severity Determines Duration ===

#[test]
fn test_severity_determines_duration() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Create single-hop chain for each severity
    let genesis = test_pubkey(0);
    store.put(&make_genesis(genesis)).unwrap();

    // Test spam: 7 days
    let spam_offender = test_pubkey(1);
    store.put(&make_sponsored(spam_offender, genesis, 1, false)).unwrap();
    let spam_result = on_misbehavior(&store, &penalty_store, &spam_offender, MisbehaviorSeverity::Spam, time).unwrap();
    assert_eq!(spam_result.offender_penalty.base_expires_at, time + SPAM_PENALTY_SECONDS);

    // Test abuse: 30 days
    let abuse_offender = test_pubkey(2);
    store.put(&make_sponsored(abuse_offender, genesis, 1, false)).unwrap();
    let abuse_result = on_misbehavior(&store, &penalty_store, &abuse_offender, MisbehaviorSeverity::Abuse, time).unwrap();
    assert_eq!(abuse_result.offender_penalty.base_expires_at, time + ABUSE_PENALTY_SECONDS);

    // Test illegal: permanent (u64::MAX)
    let illegal_offender = test_pubkey(3);
    store.put(&make_sponsored(illegal_offender, genesis, 1, false)).unwrap();
    let illegal_result = on_misbehavior(&store, &penalty_store, &illegal_offender, MisbehaviorSeverity::Illegal, time).unwrap();
    assert_eq!(illegal_result.offender_penalty.base_expires_at, u64::MAX);
    assert!(illegal_result.offender_penalty.is_permanent());
}

// === Test Case 3: Recovery After Penalty Expires ===

#[test]
fn test_recovery_after_penalty_expires() {
    let time = 1735689600;

    // Create a spam penalty (7 days)
    let penalty = PenaltyRecord::for_offender(
        test_pubkey(1),
        MisbehaviorSeverity::Spam,
        time,
    );

    // Check at t=8 days (after expiration)
    let check_time = time + SPAM_PENALTY_SECONDS + 86400; // 8 days

    let result = calculate_recovery(
        &penalty,
        0,     // No contribution needed
        100,   // Expected rate
        0,     // No attestations needed
        check_time,
    );

    assert!(result.fully_recovered);
}

// === Test Case 4: Contribution-Based Recovery 2× ===

#[test]
fn test_contribution_based_recovery_2x() {
    let time = 1735689600;

    // Create 30-day penalty
    let penalty = PenaltyRecord::for_offender(
        test_pubkey(1),
        MisbehaviorSeverity::Abuse,
        time,
    );

    let elapsed = 86400 * 5; // 5 days in
    let expected_rate = 1000;
    let contribution = expected_rate * elapsed * 2; // 2× contribution

    let result = calculate_recovery(
        &penalty,
        contribution,
        expected_rate,
        3, // 3 attestations (minimum required)
        time + elapsed,
    );

    // Should get 50% reduction
    assert!(result.accelerated);
    assert!((result.reduction_factor - 0.5).abs() < f32::EPSILON);

    // new_expires_at = started_at + (30 days * 0.5) = started_at + 15 days
    let expected_new_expires = time + (ABUSE_PENALTY_SECONDS / 2);
    assert_eq!(result.new_expires_at, expected_new_expires);
}

// === Test Case 5: Insufficient Attestation No Acceleration ===

#[test]
fn test_insufficient_attestation_no_acceleration() {
    let time = 1735689600;

    // Create 30-day penalty
    let penalty = PenaltyRecord::for_offender(
        test_pubkey(1),
        MisbehaviorSeverity::Abuse,
        time,
    );

    let elapsed = 86400 * 5;
    let expected_rate = 1000;
    let contribution = (expected_rate * elapsed * 15) / 10; // 1.5× contribution

    let result = calculate_recovery(
        &penalty,
        contribution,
        expected_rate,
        2, // Only 2 attestations (need 3)
        time + elapsed,
    );

    // Should NOT get acceleration
    assert!(!result.accelerated);
    assert_eq!(result.reduction_factor, 0.0);
    assert_eq!(result.new_expires_at, penalty.current_expires_at);
}

// === Test Case 6: Penalty Stacking Bounds ===

#[test]
fn test_penalty_stacking_bounds() {
    let (_, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;
    let identity = test_pubkey(1);

    // Apply 3 consecutive spam penalties
    for i in 0..3 {
        let penalty = PenaltyRecord::for_offender(
            identity,
            MisbehaviorSeverity::Spam,
            time + i * 1000,
        );
        penalty_store.apply_penalty(&penalty).unwrap();
    }

    // Should still have only one penalty record (stacked)
    let penalties = penalty_store.get_penalties(&identity).unwrap();
    assert_eq!(penalties.len(), 1);

    // Verify current_expires_at <= base_expires_at
    let p = &penalties[0];
    assert!(p.current_expires_at <= p.base_expires_at);

    // Base should be extended to latest penalty
    assert_eq!(p.base_expires_at, time + 2000 + SPAM_PENALTY_SECONDS);
}

// === Test Case 7: Genesis Identity Misbehavior ===

#[test]
fn test_genesis_identity_misbehavior() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Only genesis identity (no sponsors above)
    let genesis = test_pubkey(0);
    store.put(&make_genesis(genesis)).unwrap();

    let result = on_misbehavior(&store, &penalty_store, &genesis, MisbehaviorSeverity::Spam, time)
        .unwrap();

    // Only offender penalty, no sponsor penalties
    assert_eq!(result.offender_penalty.identity, genesis);
    assert!(result.sponsor_penalties.is_empty());
    assert!(result.warnings.is_empty());
}

// === Test Case 8: Probationary Sponsorship Reduces Consequence ===

#[test]
fn test_probationary_sponsorship_reduces_consequence() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Genesis → Probationary Sponsor → Offender
    let genesis = test_pubkey(0);
    let sponsor = test_pubkey(1);
    let offender = test_pubkey(2);

    store.put(&make_genesis(genesis)).unwrap();
    store.put(&make_sponsored(sponsor, genesis, 1, true)).unwrap(); // Probationary!
    store.put(&make_sponsored(offender, sponsor, 2, false)).unwrap();

    let result = on_misbehavior(&store, &penalty_store, &offender, MisbehaviorSeverity::Spam, time)
        .unwrap();

    // Find sponsor penalty
    let sponsor_penalty = result.sponsor_penalties.iter()
        .find(|p| p.identity == sponsor)
        .unwrap();

    // Should be reduced by probation multiplier (0.25)
    // Normal spam penalty = 7 days, probationary = 7 * 0.25 = 1.75 days
    // But we have a minimum of 1 day
    let duration = sponsor_penalty.base_expires_at - time;
    let expected_max = (SPAM_PENALTY_SECONDS as f64 * 0.25) as u64;

    // Duration should be between 1 day (min) and 1.75 days
    assert!(duration >= 86400, "Duration {} should be at least 1 day", duration);
    assert!(
        duration <= expected_max + 86400, // Allow some margin for minimum floor
        "Duration {} should be at most ~{}", duration, expected_max
    );
}

// === Test Case 9: Permanent Revocation No Recovery ===

#[test]
fn test_permanent_revocation_no_recovery() {
    let time = 1735689600;

    // Create permanent revocation penalty
    let penalty = PenaltyRecord::for_offender(
        test_pubkey(1),
        MisbehaviorSeverity::Illegal,
        time,
    );

    assert!(penalty.is_permanent());

    // Try recovery with maximum contribution
    let result = calculate_recovery(
        &penalty,
        u64::MAX / 2,  // Huge contribution
        1,             // Low expected rate (huge ratio)
        100,           // Many attestations
        time + 1000,
    );

    // Should NOT recover
    assert!(!result.fully_recovered);
    assert!(!result.accelerated);
    assert_eq!(result.new_expires_at, penalty.current_expires_at);
}

// === Test Case 10: Hop 3+ Warning Only ===

#[test]
fn test_hop_3_plus_warning_only() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Create long chain: Genesis → A → B → C → D → E (offender)
    let genesis = test_pubkey(0);
    let a = test_pubkey(1);
    let b = test_pubkey(2);
    let c = test_pubkey(3);
    let d = test_pubkey(4);
    let e = test_pubkey(5);

    store.put(&make_genesis(genesis)).unwrap();
    store.put(&make_sponsored(a, genesis, 1, false)).unwrap();
    store.put(&make_sponsored(b, a, 2, false)).unwrap();
    store.put(&make_sponsored(c, b, 3, false)).unwrap();
    store.put(&make_sponsored(d, c, 4, false)).unwrap();
    store.put(&make_sponsored(e, d, 5, false)).unwrap();

    let result = on_misbehavior(&store, &penalty_store, &e, MisbehaviorSeverity::Abuse, time)
        .unwrap();

    // D (hop 1) and C (hop 2) get penalties
    assert_eq!(result.sponsor_penalties.len(), 2);
    assert!(result.sponsor_penalties.iter().any(|p| p.identity == d));
    assert!(result.sponsor_penalties.iter().any(|p| p.identity == c));

    // B (hop 3), A (hop 4), Genesis (hop 5) get warnings only
    assert_eq!(result.warnings.len(), 3);
    let warning_identities: Vec<_> = result.warnings.iter().map(|w| w.identity).collect();
    assert!(warning_identities.contains(&b));
    assert!(warning_identities.contains(&a));
    assert!(warning_identities.contains(&genesis));

    // Verify no penalties in store for hop 3+
    assert!(!penalty_store.has_active_penalty(&b, time).unwrap());
    assert!(!penalty_store.has_active_penalty(&a, time).unwrap());
    assert!(!penalty_store.has_active_penalty(&genesis, time).unwrap());

    // But warnings are recorded
    assert!(!penalty_store.get_warnings(&b).unwrap().is_empty());
}

// === Additional Test: Illegal Severity Chain ===

#[test]
fn test_illegal_severity_chain_penalties() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Genesis → A → B (offender)
    let genesis = test_pubkey(0);
    let a = test_pubkey(1);
    let b = test_pubkey(2);

    store.put(&make_genesis(genesis)).unwrap();
    store.put(&make_sponsored(a, genesis, 1, false)).unwrap();
    store.put(&make_sponsored(b, a, 2, false)).unwrap();

    let result = on_misbehavior(&store, &penalty_store, &b, MisbehaviorSeverity::Illegal, time)
        .unwrap();

    // B (offender): PermanentRevocation
    assert_eq!(result.offender_penalty.penalty_type, PenaltyType::PermanentRevocation);

    // A (hop 1): LostInviteSlots(ALL) + AcceleratedDecay, 90 days
    let a_penalty = result.sponsor_penalties.iter().find(|p| p.identity == a).unwrap();
    assert_eq!(a_penalty.penalty_type, PenaltyType::LostInviteSlots);
    assert_eq!(a_penalty.slots_lost, ALL_INVITE_SLOTS);
    assert_eq!(a_penalty.additional_penalty, Some(PenaltyType::AcceleratedDecay));

    // Genesis (hop 2): LostInviteSlots(1), 30 days (with 50% decay = 15 days minimum floor)
    let genesis_penalty = result.sponsor_penalties.iter().find(|p| p.identity == genesis).unwrap();
    assert_eq!(genesis_penalty.penalty_type, PenaltyType::LostInviteSlots);
    assert_eq!(genesis_penalty.slots_lost, 1);
}

// === Test: Apply Recovery Integration ===

#[test]
fn test_apply_recovery_integration() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    // Create genesis and apply spam penalty
    let genesis = test_pubkey(0);
    store.put(&make_genesis(genesis)).unwrap();

    on_misbehavior(&store, &penalty_store, &genesis, MisbehaviorSeverity::Spam, time)
        .unwrap();

    // Wait some time and contribute 2×
    let elapsed = 86400; // 1 day
    let expected_rate = 1000;
    let contribution = expected_rate * elapsed * 2;

    let recovery = apply_recovery_to_penalty(
        &penalty_store,
        &store,
        &genesis,
        PenaltyType::RestrictedPosting,
        contribution,
        expected_rate,
        3,
        time + elapsed,
    ).unwrap();

    assert!(recovery.accelerated);
    assert!((recovery.reduction_factor - 0.5).abs() < f32::EPSILON);

    // Verify penalty store was updated
    let penalties = penalty_store.get_penalties(&genesis).unwrap();
    assert_eq!(penalties[0].current_expires_at, recovery.new_expires_at);

    // Verify sponsorship store was updated
    let sponsorship = store.get(&genesis).unwrap().unwrap();
    assert_eq!(sponsorship.penalty_until, Some(recovery.new_expires_at));
}

// === Test: Sponsorship Status Update on Revocation ===

#[test]
fn test_revocation_updates_sponsorship_status() {
    let (store, penalty_store, _dir) = create_test_stores();
    let time = 1735689600;

    let genesis = test_pubkey(0);
    let offender = test_pubkey(1);

    store.put(&make_genesis(genesis)).unwrap();
    store.put(&make_sponsored(offender, genesis, 1, false)).unwrap();

    // Before: Active
    let before = store.get(&offender).unwrap().unwrap();
    assert_eq!(before.status, SponsorshipStatus::Active);

    // Misbehave illegally
    on_misbehavior(&store, &penalty_store, &offender, MisbehaviorSeverity::Illegal, time)
        .unwrap();

    // After: Revoked
    let after = store.get(&offender).unwrap().unwrap();
    assert_eq!(after.status, SponsorshipStatus::Revoked);
}
