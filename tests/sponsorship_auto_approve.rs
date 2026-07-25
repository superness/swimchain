//! Integration tests for auto-approve sponsorship offers (SWIM-INV-1)
//!
//! Auto-approve offers power invite-link onboarding: the sponsor creates an
//! offer with `auto_approve = true`, and a claim on that offer runs the
//! approval path immediately, so the newcomer is sponsored in one step.
//!
//! These tests exercise the storage/flow layer that the RPC handlers
//! (`create_sponsorship_offer` / `claim_sponsorship_offer` with auto-approve)
//! are built on:
//! - the `auto_approve` flag round-trips through the offer store and wire format
//! - claim + immediate approval marks the claimant sponsored
//! - slot accounting decrements exactly, and a second claim on a slots=1
//!   offer fails (`OfferFullyClaimed`)

use swimchain::sponsorship::error::SponsorshipError;
use swimchain::sponsorship::offer_flow::{approve_claim, claim_public_offer};
use swimchain::sponsorship::offer_store::OfferStore;
use swimchain::sponsorship::rights::RightsStore;
use swimchain::sponsorship::storage::SponsorshipStore;
use swimchain::sponsorship::types::{
    PublicSponsorshipOffer, SponsorshipClaim, SponsorshipOfferType, SponsorshipRequirements,
    SponsorshipStatus, StoredSponsorship,
};
use swimchain::sponsorship::wire::{deserialize_offer, serialize_offer};
use swimchain::types::identity::{IdentityCreationProof, PublicKey, Signature};

use tempfile::TempDir;

const NOW: u64 = 1_735_689_600;

fn create_test_stores() -> (OfferStore, SponsorshipStore, RightsStore, TempDir) {
    let temp_dir = TempDir::new().unwrap();
    let db = sled::open(temp_dir.path()).unwrap();
    let offer_store = OfferStore::from_db(&db).unwrap();
    let sponsorship_store = SponsorshipStore::from_db(&db).unwrap();
    let rights_store = RightsStore::from_db(&db).unwrap();
    (offer_store, sponsorship_store, rights_store, temp_dir)
}

/// A space every auto-approve fixture is scoped to.
const TEST_SPACE: [u8; 32] = [0xAB; 32];

fn make_auto_approve_offer(
    sponsor: [u8; 32],
    offer_id: [u8; 16],
    slots: u8,
) -> PublicSponsorshipOffer {
    PublicSponsorshipOffer {
        sponsor: PublicKey::from_bytes(sponsor),
        offer_id,
        created_at: NOW,
        expires_at: NOW + 7 * 86_400,
        max_sponsees: slots,
        offer_type: SponsorshipOfferType::Open,
        requirements: SponsorshipRequirements::default(),
        signature: Signature::from_bytes([0u8; 64]),
        auto_approve: true,
        // Auto-approve offers MUST carry a scope — `OfferStore::create_offer`
        // rejects the unscoped combination outright (see the tests at the
        // bottom of this file for why).
        space_scope: Some(TEST_SPACE),
    }
}

fn make_claim(offer_id: [u8; 16], claimant: [u8; 32]) -> SponsorshipClaim {
    SponsorshipClaim {
        offer_id,
        claimant: PublicKey::from_bytes(claimant),
        claimed_at: NOW,
        identity_pow_proof: IdentityCreationProof {
            public_key: PublicKey::from_bytes(claimant),
            timestamp: NOW,
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
        creation_timestamp: NOW,
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

#[test]
fn test_auto_approve_flag_persists_in_offer_store() {
    let (offer_store, _, _, _dir) = create_test_stores();

    let offer = make_auto_approve_offer([1u8; 32], [2u8; 16], 1);
    offer_store.create_offer(&offer).unwrap();

    let stored = offer_store.get_offer(&offer.offer_id).unwrap().unwrap();
    assert!(
        stored.auto_approve,
        "auto_approve must survive storage round-trip"
    );

    // And a plain offer stays non-auto-approve
    let mut plain = make_auto_approve_offer([3u8; 32], [4u8; 16], 1);
    plain.auto_approve = false;
    offer_store.create_offer(&plain).unwrap();
    let stored = offer_store.get_offer(&plain.offer_id).unwrap().unwrap();
    assert!(!stored.auto_approve);
}

#[test]
fn test_auto_approve_flag_wire_roundtrip_and_legacy_compat() {
    let offer = make_auto_approve_offer([1u8; 32], [2u8; 16], 3);

    let bytes = serialize_offer(&offer).unwrap();
    let decoded = deserialize_offer(&bytes).unwrap();
    assert!(decoded.auto_approve);
    assert_eq!(
        decoded.space_scope,
        Some(TEST_SPACE),
        "scope must round-trip"
    );

    // Legacy wire format: a peer predating BOTH optional trailing fields stops
    // after the signature. The tail is auto_approve(1) + scope_presence(1)
    // [+ 32], so this must be built from an unscoped offer and truncated by
    // two — popping a single byte off a scoped offer clips the scope instead
    // and leaves auto_approve set, which is what this test used to do.
    //
    // The unscoped offer here is constructed in memory only and never stored;
    // `OfferStore::create_offer` rejects the unscoped auto-approve combination.
    let mut legacy_src = make_auto_approve_offer([1u8; 32], [2u8; 16], 3);
    legacy_src.space_scope = None;
    let mut legacy = serialize_offer(&legacy_src).unwrap();
    legacy.truncate(legacy.len() - 2);

    let decoded = deserialize_offer(&legacy).unwrap();
    assert!(
        !decoded.auto_approve,
        "a legacy offer must never decode as auto-approving"
    );
    assert_eq!(decoded.space_scope, None);
    assert_eq!(decoded.offer_id, offer.offer_id);
}

/// The invite-link happy path: create auto_approve offer -> claim -> immediate
/// approval -> claimant is sponsored right away, and the slot is consumed.
#[test]
fn test_auto_approve_claim_sponsors_immediately_and_decrements_slots() {
    let (offer_store, sponsorship_store, rights_store, _dir) = create_test_stores();

    let sponsor = [1u8; 32];
    sponsorship_store
        .put(&make_genesis_sponsorship(sponsor))
        .unwrap();

    // Sponsor creates a single-slot auto-approve invite
    let offer = make_auto_approve_offer(sponsor, [2u8; 16], 1);
    offer_store.create_offer(&offer).unwrap();

    // Newcomer claims the invite
    let claimant = [3u8; 32];
    let claim = make_claim(offer.offer_id, claimant);
    claim_public_offer(&offer_store, &claim, NOW).unwrap();

    // Auto-approve: the approval path runs immediately at claim time
    // (this is what claim_sponsorship_offer does for auto_approve offers)
    let approval_sig = Signature::from_bytes([9u8; 64]);
    let sponsorship = approve_claim(
        &offer_store,
        &sponsorship_store,
        &rights_store,
        &offer.offer_id,
        &claim.claimant,
        &approval_sig,
        NOW,
    )
    .unwrap();

    // Claimant is sponsored immediately (what get_sponsorship_info reads)
    assert_eq!(sponsorship.sponsored_identity, claim.claimant);
    assert_eq!(sponsorship.status, SponsorshipStatus::Active);
    assert_eq!(sponsorship.depth, 1); // genesis sponsor is depth 0
    assert!(!sponsorship.probationary); // Open offer => full sponsorship

    let stored = sponsorship_store
        .get(&claim.claimant)
        .unwrap()
        .expect("claimant must be in the sponsorship store immediately after claim");
    assert_eq!(stored.sponsor, Some(PublicKey::from_bytes(sponsor)));

    // Slot accounting: exactly one slot consumed, offer now full
    assert_eq!(offer_store.get_claimed_count(&offer.offer_id).unwrap(), 1);

    // Pending claim was removed
    assert!(offer_store
        .get_claim(&offer.offer_id, &claim.claimant)
        .unwrap()
        .is_none());
}

/// A second claim on a fully-claimed slots=1 invite must fail.
#[test]
fn test_second_claim_on_single_slot_invite_fails() {
    let (offer_store, sponsorship_store, rights_store, _dir) = create_test_stores();

    let sponsor = [1u8; 32];
    sponsorship_store
        .put(&make_genesis_sponsorship(sponsor))
        .unwrap();

    let offer = make_auto_approve_offer(sponsor, [2u8; 16], 1);
    offer_store.create_offer(&offer).unwrap();

    // First claimant takes the only slot
    let first = make_claim(offer.offer_id, [3u8; 32]);
    claim_public_offer(&offer_store, &first, NOW).unwrap();
    approve_claim(
        &offer_store,
        &sponsorship_store,
        &rights_store,
        &offer.offer_id,
        &first.claimant,
        &Signature::from_bytes([9u8; 64]),
        NOW,
    )
    .unwrap();

    // Second claimant is rejected: no slots remain
    let second = make_claim(offer.offer_id, [4u8; 32]);
    let result = claim_public_offer(&offer_store, &second, NOW);
    assert!(
        matches!(result, Err(SponsorshipError::OfferFullyClaimed)),
        "second claim on a slots=1 invite must fail, got {:?}",
        result
    );

    // Even a claim that slipped in before approval cannot over-claim:
    // the atomic claimed-count increment enforces the cap.
    let result = offer_store.increment_claimed_count(&offer.offer_id, offer.max_sponsees);
    assert!(matches!(result, Err(SponsorshipError::OfferFullyClaimed)));

    // Second claimant is NOT sponsored
    assert!(sponsorship_store.get(&second.claimant).unwrap().is_none());
}

// =============================================================================
// An auto-approving offer with NO space scope is an open door: anyone who
// claims it is sponsored globally, without review, and can then write anywhere
// on the network. Neither half is dangerous alone — scoped auto-approve is how
// game onboarding works, and unscoped is fine when a human approves each claim.
//
// The check lives in `OfferStore::create_offer` because that is the one
// function every path converges on: local RPC creation, gossip ingest from a
// peer, and offer-sync. A peer on an older or modified node therefore cannot
// propagate the combination into our store.
// =============================================================================

#[test]
fn test_unscoped_auto_approve_offer_is_rejected() {
    let (offers, _sponsorships, _rights, _dir) = create_test_stores();

    let mut wide_open = make_auto_approve_offer([1u8; 32], [2u8; 16], 100);
    wide_open.space_scope = None;

    let err = offers
        .create_offer(&wide_open)
        .expect_err("an unscoped auto-approve offer must never be stored");
    assert!(
        format!("{err}").contains("space_scope"),
        "the error must name the missing scope, got: {err}"
    );

    // And it must genuinely not be there — a rejection that still stored the
    // offer would be worse than no check at all.
    assert!(
        !offers.offer_exists(&[2u8; 16]).unwrap(),
        "rejected offer must not be persisted"
    );
}

#[test]
fn test_scoped_auto_approve_and_unscoped_manual_are_both_allowed() {
    let (offers, _sponsorships, _rights, _dir) = create_test_stores();

    // Scoped + auto-approve: game onboarding. Allowed.
    let scoped = make_auto_approve_offer([1u8; 32], [2u8; 16], 100);
    assert!(scoped.space_scope.is_some());
    offers
        .create_offer(&scoped)
        .expect("scoped auto-approve is the game-onboarding case and must be allowed");

    // Unscoped + manual approval: a human vets each claim. Allowed.
    let mut manual = make_auto_approve_offer([3u8; 32], [4u8; 16], 10);
    manual.auto_approve = false;
    manual.space_scope = None;
    offers
        .create_offer(&manual)
        .expect("an unscoped offer is fine when claims are reviewed by a human");
}

#[test]
fn test_peer_cannot_gossip_in_an_unscoped_auto_approve_offer() {
    // Gossip ingest deserializes a peer's offer and calls create_offer, so the
    // wire path is covered by the same invariant. Round-trip through the wire
    // format to prove the flag survives serialization and is still caught.
    let (offers, _sponsorships, _rights, _dir) = create_test_stores();

    let mut hostile = make_auto_approve_offer([9u8; 32], [8u8; 16], 100);
    hostile.space_scope = None;

    let bytes = serialize_offer(&hostile).expect("serialize");
    let decoded = deserialize_offer(&bytes).expect("deserialize");
    assert!(decoded.auto_approve && decoded.space_scope.is_none());

    assert!(
        offers.create_offer(&decoded).is_err(),
        "a peer must not be able to gossip an unscoped auto-approve offer into our store"
    );
}
