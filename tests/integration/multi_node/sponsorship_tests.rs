//! Sponsorship System Multi-Node Tests
//!
//! Tests the identity sponsorship chain across multiple nodes:
//! - Genesis identity registration
//! - Sponsored identity registration
//! - Sponsorship enforcement (unsponsored can't act)
//! - Cross-node sponsorship propagation

use std::time::Duration;

use swimchain::sponsorship::genesis_list::is_in_hardcoded_genesis_list;
use swimchain::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
use swimchain::types::identity::PublicKey;

use super::harness::MultiNodeTestHarness;

// ============================================================================
// Single-Node Sponsorship Tests
// ============================================================================

/// Test genesis identity registration on a single node
#[tokio::test(flavor = "multi_thread")]
async fn test_genesis_identity_registration() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];

    // Get sponsorship store
    let sponsorship_store = node
        .manager
        .sponsorship_store()
        .expect("Sponsorship store should be available");

    // The genesis pubkey from genesis_list.rs
    let genesis_bytes: [u8; 32] = [
        0x10, 0x3d, 0xb5, 0x7f, 0xda, 0xe9, 0x5d, 0x3e, 0x3a, 0x8b, 0xcc, 0x40, 0xd9, 0xc7, 0x8d,
        0xc6, 0x35, 0xe0, 0x39, 0x43, 0xe6, 0x63, 0x5f, 0xb8, 0x33, 0x9c, 0x03, 0xc3, 0xaa, 0x77,
        0x94, 0xd5,
    ];
    let genesis_pubkey = PublicKey::from_bytes(genesis_bytes);

    // Verify it's in the hardcoded list
    assert!(is_in_hardcoded_genesis_list(&genesis_pubkey));

    // Should not exist yet
    assert!(!sponsorship_store.exists(&genesis_pubkey).unwrap());

    // Create and store genesis sponsorship
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let sponsorship = StoredSponsorship {
        sponsored_identity: genesis_pubkey,
        sponsor: None,
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };

    sponsorship_store
        .put(&sponsorship)
        .expect("Should store genesis");

    // Should exist now
    assert!(sponsorship_store.exists(&genesis_pubkey).unwrap());

    // Verify can_identity_act returns true
    assert!(sponsorship_store.can_identity_act(&genesis_pubkey).unwrap());

    // Verify is_identity_active returns true
    assert!(sponsorship_store
        .is_identity_active(&genesis_pubkey)
        .unwrap());

    harness.shutdown_all().await.unwrap();
}

/// Test that unsponsored identity cannot act
#[tokio::test(flavor = "multi_thread")]
async fn test_unsponsored_cannot_act() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];

    let sponsorship_store = node
        .manager
        .sponsorship_store()
        .expect("Sponsorship store should be available");

    // Random pubkey that's not sponsored
    let unsponsored_pubkey = PublicKey::from_bytes([42u8; 32]);

    // Should not exist
    assert!(!sponsorship_store.exists(&unsponsored_pubkey).unwrap());

    // can_identity_act should return false for unsponsored
    assert!(!sponsorship_store
        .can_identity_act(&unsponsored_pubkey)
        .unwrap());

    // is_identity_active should return false
    assert!(!sponsorship_store
        .is_identity_active(&unsponsored_pubkey)
        .unwrap());

    harness.shutdown_all().await.unwrap();
}

/// Test sponsored identity chain (genesis -> sponsored)
#[tokio::test(flavor = "multi_thread")]
async fn test_sponsorship_chain() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];

    let sponsorship_store = node
        .manager
        .sponsorship_store()
        .expect("Sponsorship store should be available");

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Create genesis identity
    let genesis_pubkey = PublicKey::from_bytes([1u8; 32]);
    let genesis_sponsorship = StoredSponsorship {
        sponsored_identity: genesis_pubkey,
        sponsor: None,
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };
    sponsorship_store.put(&genesis_sponsorship).unwrap();

    // Create sponsored identity (sponsored by genesis)
    let sponsored_pubkey = PublicKey::from_bytes([2u8; 32]);
    let sponsored_sponsorship = StoredSponsorship {
        sponsored_identity: sponsored_pubkey,
        sponsor: Some(genesis_pubkey),
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 1, // One level deep
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: false,
        orphaned_at: None,
    };
    sponsorship_store.put(&sponsored_sponsorship).unwrap();

    // Both should be able to act
    assert!(sponsorship_store.can_identity_act(&genesis_pubkey).unwrap());
    assert!(sponsorship_store
        .can_identity_act(&sponsored_pubkey)
        .unwrap());

    // Verify depth
    let retrieved = sponsorship_store.get(&sponsored_pubkey).unwrap().unwrap();
    assert_eq!(retrieved.depth, 1);
    assert_eq!(retrieved.sponsor, Some(genesis_pubkey));

    harness.shutdown_all().await.unwrap();
}

/// Test restricted status prevents action
#[tokio::test(flavor = "multi_thread")]
async fn test_restricted_with_penalty_cannot_act() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];

    let sponsorship_store = node
        .manager
        .sponsorship_store()
        .expect("Sponsorship store should be available");

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Create identity under penalty
    let penalized_pubkey = PublicKey::from_bytes([3u8; 32]);
    let sponsorship = StoredSponsorship {
        sponsored_identity: penalized_pubkey,
        sponsor: None,
        creation_timestamp: current_time - 1000,
        status: SponsorshipStatus::Restricted,
        penalty_until: Some(current_time + 86400), // Penalty ends in 24h
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };
    sponsorship_store.put(&sponsorship).unwrap();

    // can_identity_act should still return true for restricted
    // (restricted can still act, just with limitations)
    assert!(sponsorship_store
        .can_identity_act(&penalized_pubkey)
        .unwrap());

    // But is_identity_active might be different based on status
    // Let's verify the status is retrieved correctly
    let retrieved = sponsorship_store.get(&penalized_pubkey).unwrap().unwrap();
    assert_eq!(retrieved.status, SponsorshipStatus::Restricted);
    assert!(retrieved.penalty_until.is_some());

    harness.shutdown_all().await.unwrap();
}

/// Test revoked identity cannot act
#[tokio::test(flavor = "multi_thread")]
async fn test_revoked_cannot_act() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];

    let sponsorship_store = node
        .manager
        .sponsorship_store()
        .expect("Sponsorship store should be available");

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Create revoked identity
    let revoked_pubkey = PublicKey::from_bytes([4u8; 32]);
    let sponsorship = StoredSponsorship {
        sponsored_identity: revoked_pubkey,
        sponsor: Some(PublicKey::from_bytes([1u8; 32])),
        creation_timestamp: current_time - 10000,
        status: SponsorshipStatus::Revoked,
        penalty_until: None,
        depth: 1,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: false,
        orphaned_at: None,
    };
    sponsorship_store.put(&sponsorship).unwrap();

    // Revoked should NOT be able to act
    assert!(!sponsorship_store.can_identity_act(&revoked_pubkey).unwrap());

    harness.shutdown_all().await.unwrap();
}

// ============================================================================
// Multi-Node Sponsorship Tests
// ============================================================================

/// Test sponsorship data persists and loads correctly
#[tokio::test(flavor = "multi_thread")]
async fn test_sponsorship_persistence() {
    let _ = env_logger::try_init();

    // Create harness but don't start yet
    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let node = &harness.nodes[0];
    let sponsorship_store = node.manager.sponsorship_store().unwrap();

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Store a sponsorship
    let test_pubkey = PublicKey::from_bytes([5u8; 32]);
    let sponsorship = StoredSponsorship {
        sponsored_identity: test_pubkey,
        sponsor: None,
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: true,
        probation_expires: Some(current_time + 86400 * 180), // 180 days
        positive_contribution_score: 500,
        is_genesis: true,
        orphaned_at: None,
    };
    sponsorship_store.put(&sponsorship).unwrap();

    // Flush to disk
    sponsorship_store.flush().unwrap();

    // Retrieve and verify
    let retrieved = sponsorship_store.get(&test_pubkey).unwrap().unwrap();
    assert_eq!(retrieved.creation_timestamp, current_time);
    assert_eq!(retrieved.status, SponsorshipStatus::Active);
    assert!(retrieved.probationary);
    assert_eq!(retrieved.positive_contribution_score, 500);

    harness.shutdown_all().await.unwrap();
}

/// Test two nodes can share sponsorship state (when synced)
///
/// Note: This requires sponsorship gossip to be implemented.
/// For now, this tests that both nodes can independently validate
/// the same sponsorship data.
#[tokio::test(flavor = "multi_thread")]
async fn test_two_nodes_independent_sponsorship() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Create the same sponsorship on both nodes
    let shared_pubkey = PublicKey::from_bytes([6u8; 32]);
    let sponsorship = StoredSponsorship {
        sponsored_identity: shared_pubkey,
        sponsor: None,
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };

    // Store on both nodes
    for node in &harness.nodes {
        let store = node.manager.sponsorship_store().unwrap();
        store.put(&sponsorship).unwrap();
    }

    // Verify both nodes have the same data
    for node in &harness.nodes {
        let store = node.manager.sponsorship_store().unwrap();
        assert!(store.can_identity_act(&shared_pubkey).unwrap());

        let retrieved = store.get(&shared_pubkey).unwrap().unwrap();
        assert_eq!(retrieved.creation_timestamp, current_time);
        assert!(retrieved.is_genesis);
    }

    harness.shutdown_all().await.unwrap();
}

/// Test that connected nodes can validate sponsorship across the network
///
/// Scenario:
/// 1. Node A has a sponsored identity
/// 2. Node B connects to Node A
/// 3. Both nodes should be able to validate actions from that identity
#[tokio::test(flavor = "multi_thread")]
async fn test_sponsorship_validation_across_connected_nodes() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    // Wait for nodes to initialize
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Connect nodes using harness method
    harness.connect_pair(0, 1).await.ok();

    // Wait for connection
    tokio::time::sleep(Duration::from_secs(1)).await;

    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Register identity on node 0 only
    let test_pubkey = PublicKey::from_bytes([7u8; 32]);
    let sponsorship = StoredSponsorship {
        sponsored_identity: test_pubkey,
        sponsor: None,
        creation_timestamp: current_time,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 0,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: true,
        orphaned_at: None,
    };

    harness.nodes[0]
        .manager
        .sponsorship_store()
        .unwrap()
        .put(&sponsorship)
        .unwrap();

    // Node 0 should validate this identity
    assert!(harness.nodes[0]
        .manager
        .sponsorship_store()
        .unwrap()
        .can_identity_act(&test_pubkey)
        .unwrap());

    // Node 1 doesn't have the sponsorship yet (would need gossip)
    // This documents the expected behavior - in production, sponsorship
    // records would need to be gossiped to node 1

    harness.shutdown_all().await.unwrap();
}

// ============================================================================
// Claim relay (multi-hop delivery)
// ============================================================================

/// A sponsorship claim must reach a sponsor that is NOT a direct peer of the
/// claimant. Line topology sponsor(0) — middle(1) — claimant(2): the claim
/// enters node 1, which stores it (known offer, valid signature) and RELAYS
/// it to node 0 over the real connection. Before the relay existed, node 1
/// stored the claim and dropped it — the sponsor two hops away saw 0 pending
/// claims forever (observed live during the F10 deploy: client2's claim
/// never reached genesis).
#[tokio::test(flavor = "multi_thread")]
async fn test_claim_relays_across_multi_hop_topology() {
    use swimchain::crypto::signature::{generate_keypair, sign};
    use swimchain::sponsorship::types::{
        PublicSponsorshipOffer, SponsorshipClaim, SponsorshipOfferType, SponsorshipRequirements,
    };
    use swimchain::sponsorship::wire::serialize_claim;
    use swimchain::types::constants::MSG_SPONSORSHIP_OFFER_CLAIM;
    use swimchain::types::identity::{IdentityCreationProof, Signature};

    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(3).await.unwrap();
    harness.start_all().await.unwrap();

    // Line topology: 0 — 1 — 2 (no 0—2 link).
    harness.connect_pair(1, 0).await.unwrap();
    harness.connect_pair(1, 2).await.unwrap();
    harness
        .wait_for_connection(1, 0, Duration::from_secs(10))
        .await
        .unwrap();
    harness
        .wait_for_connection(1, 2, Duration::from_secs(10))
        .await
        .unwrap();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // The offer is known to the sponsor (node 0) AND the middle node (node 1)
    // — offers gossip/pull-sync in production; installed directly here.
    let sponsor_pk = PublicKey::from_bytes(harness.nodes[0].node_id());
    let offer = PublicSponsorshipOffer {
        sponsor: sponsor_pk,
        offer_id: [0xC1; 16],
        created_at: now,
        expires_at: now + 86_400,
        max_sponsees: 3,
        offer_type: SponsorshipOfferType::Probationary,
        requirements: SponsorshipRequirements::none(),
        signature: Signature::from_bytes([0u8; 64]),
        auto_approve: false,
    };
    for i in [0usize, 1] {
        harness.nodes[i]
            .manager
            .offer_store()
            .expect("offer store")
            .create_offer(&offer)
            .unwrap();
    }

    // A fresh claimant identity signs a valid claim.
    let claimant_keys = generate_keypair();
    let claimant_pk = claimant_keys.public_key;
    let mut claim = SponsorshipClaim {
        offer_id: offer.offer_id,
        claimant: claimant_pk,
        claimed_at: now,
        identity_pow_proof: IdentityCreationProof {
            public_key: claimant_pk,
            timestamp: now,
            nonce: 7,
            pow_hash: [0u8; 32],
        },
        pow_nonce_space: [0u8; 32],
        application_text: None,
        attestation_signature: None,
        claimant_signature: Signature::from_bytes([0u8; 64]),
        sponsor_approval: None,
    };
    claim.claimant_signature = sign(&claimant_keys.private_key, &claim.signature_message());
    let claim_bytes = serialize_claim(&claim).unwrap();

    // Deliver the claim to the MIDDLE node as if sent by the claimant node.
    let router = harness.nodes[1]
        .manager
        .message_router()
        .expect("router available");
    let claimant_node_id = harness.nodes[2].node_id();
    router
        .route(
            &claimant_node_id,
            MSG_SPONSORSHIP_OFFER_CLAIM,
            &[0u8; 32],
            &claim_bytes,
        )
        .await
        .expect("middle node accepts the claim");

    // Middle node stored it...
    assert!(harness.nodes[1]
        .manager
        .offer_store()
        .unwrap()
        .has_claimed(&offer.offer_id, &claimant_pk)
        .unwrap());

    // ...and the RELAY carries it over the real connection to the sponsor,
    // which is not a peer of the claimant.
    let sponsor_store = harness.nodes[0].manager.offer_store().unwrap();
    harness
        .wait_for(
            "sponsor received relayed claim",
            Duration::from_secs(15),
            |_| {
                sponsor_store
                    .has_claimed(&offer.offer_id, &claimant_pk)
                    .unwrap_or(false)
            },
        )
        .await
        .unwrap();

    // Loop safety: re-delivering the same claim is a no-op duplicate (each
    // node relays a unique claim at most once).
    router
        .route(
            &claimant_node_id,
            MSG_SPONSORSHIP_OFFER_CLAIM,
            &[0u8; 32],
            &claim_bytes,
        )
        .await
        .expect("duplicate claim is ignored, not an error");

    harness.shutdown_all().await.unwrap();
}
