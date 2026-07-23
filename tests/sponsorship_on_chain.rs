//! Integration tests for on-chain sponsorship propagation (SPEC_11 Phase 6)
//!
//! Tests that sponsorship actions (Sponsor, GenesisRegister) can be:
//! 1. Created and serialized correctly
//! 2. Added to the block builder
//! 3. Stored in the chain store with correct metadata
//! 4. Applied to the SponsorshipStore during block ingestion

use swimchain::blocks::action::{Action, ActionType, ACTION_SERIALIZED_SIZE};
use swimchain::blocks::branch_path::BranchPath;
use swimchain::blocks::builder::BlockBuilder;
use swimchain::blocks::ContentBlock;
use swimchain::sponsorship::storage::SponsorshipStore;
use swimchain::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
use swimchain::storage::chain::ChainStore;
use swimchain::types::identity::PublicKey;

use tempfile::TempDir;

// ============================================================================
// Helpers
// ============================================================================

fn temp_sponsorship_store() -> (TempDir, SponsorshipStore) {
    let dir = TempDir::new().unwrap();
    let store = SponsorshipStore::open(dir.path().join("sponsorship")).unwrap();
    (dir, store)
}

fn temp_chain_store() -> (TempDir, ChainStore) {
    let dir = TempDir::new().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    (dir, store)
}

fn make_genesis_sponsorship(pubkey: [u8; 32]) -> StoredSponsorship {
    StoredSponsorship {
        sponsored_identity: PublicKey::from_bytes(pubkey),
        sponsor: None,
        creation_timestamp: 1000,
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

// ============================================================================
// Action Type Tests
// ============================================================================

#[test]
fn test_sponsor_action_type_roundtrip() {
    let sponsor = [1u8; 32];
    let sponsee = [2u8; 32];
    let action = Action::new_sponsor(sponsor, sponsee, 1000, [4u8; 64]);

    // Serialize and deserialize
    let serialized = action.serialize();
    let deserialized = Action::deserialize(&serialized).unwrap();

    // Verify all fields survive
    assert_eq!(deserialized.action_type, ActionType::Sponsor);
    assert_eq!(deserialized.actor, sponsor);
    assert_eq!(deserialized.content_hash, Some(sponsee));
    assert_eq!(deserialized.timestamp, 1000);
    assert_eq!(deserialized.signature, [4u8; 64]);
    assert!(deserialized.parent_id.is_none());
    assert_eq!(deserialized.pow_nonce, 0);
    assert_eq!(deserialized.pow_work, 0);
}

#[test]
fn test_genesis_register_action_type_roundtrip() {
    let genesis = [1u8; 32];
    let action = Action::new_genesis_register(genesis, 2000, [5u8; 64]);

    let serialized = action.serialize();
    let deserialized = Action::deserialize(&serialized).unwrap();

    assert_eq!(deserialized.action_type, ActionType::GenesisRegister);
    assert_eq!(deserialized.actor, genesis);
    assert_eq!(deserialized.content_hash, Some(genesis)); // self-registration
    assert_eq!(deserialized.timestamp, 2000);
}

// ============================================================================
// Block Builder Tests
// ============================================================================

#[test]
fn test_sponsor_action_in_block_builder() {
    let mut builder = BlockBuilder::new(0); // 0 threshold so any action triggers formation

    let sponsor = [1u8; 32];
    let sponsee = [2u8; 32];
    let action = Action::new_sponsor(sponsor, sponsee, 1000, [4u8; 64]);
    let action_hash = action.hash();

    // System space ID (all zeros) for sponsorship actions
    let system_space_id = [0u8; 32];

    builder.add_action(action_hash, system_space_id, action, BranchPath::root());

    assert_eq!(builder.pending_action_count(), 1);

    // Form the block hierarchy
    let block_creator = [0u8; 32];
    let (root_block, space_blocks, content_blocks) =
        builder.build_root_block(1000, block_creator, None);

    // The root should contain a space block, which contains a content block with the action
    assert!(!root_block.space_block_hashes.is_empty());
    assert!(!space_blocks.is_empty());
    assert!(!content_blocks.is_empty());

    // Verify the content block contains our sponsor action
    let cb = &content_blocks[0];
    assert_eq!(cb.actions.len(), 1);
    assert_eq!(cb.actions[0].action_type, ActionType::Sponsor);
}

// ============================================================================
// Chain Store Indexing Tests
// ============================================================================

#[test]
fn test_sponsor_action_stored_in_chain() {
    let (_dir, chain_store) = temp_chain_store();

    let sponsor = [1u8; 32];
    let sponsee = [2u8; 32];
    let action = Action::new_sponsor(sponsor, sponsee, 1000, [4u8; 64]);

    // Create a content block with the sponsor action
    let content_block = ContentBlock::new(
        action.hash(), // thread_root_id
        [0u8; 32],     // space_id (system space)
        vec![action],
        None, // no space metadata
        1000, // timestamp
        BranchPath::root(),
    )
    .unwrap();

    // Store it
    let hash = chain_store.put_content_block(&content_block).unwrap();

    // Verify we can retrieve it
    let retrieved = chain_store.get_content_block(&hash).unwrap();
    assert!(retrieved.is_some());
    let block = retrieved.unwrap();
    assert_eq!(block.actions.len(), 1);
    assert_eq!(block.actions[0].action_type, ActionType::Sponsor);
}

// ============================================================================
// Sponsorship Application Tests (simulating handle_block_data logic)
// ============================================================================

#[test]
fn test_sponsorship_applied_from_block() {
    let (_dir, sponsorship_store) = temp_sponsorship_store();

    // 1. Set up genesis sponsor
    let genesis_pubkey = [1u8; 32];
    let genesis = make_genesis_sponsorship(genesis_pubkey);
    sponsorship_store.put(&genesis).unwrap();

    // 2. Create a Sponsor action: genesis sponsors sponsee
    let sponsee_pubkey = [2u8; 32];
    let action = Action::new_sponsor(genesis_pubkey, sponsee_pubkey, 2000, [4u8; 64]);

    // 3. Build a content block containing the action
    let content_block = ContentBlock::new(
        action.hash(),
        [0u8; 32],
        vec![action.clone()],
        None,
        2000,
        BranchPath::root(),
    )
    .unwrap();

    // 4. Simulate handle_block_data: iterate actions, find Sponsor type, apply
    for a in &content_block.actions {
        if a.action_type == ActionType::Sponsor {
            if let Some(sponsee_bytes) = a.content_hash {
                let sponsor_bytes = a.actor;
                let sponsee_pk = PublicKey::from_bytes(sponsee_bytes);
                let sponsor_pk = PublicKey::from_bytes(sponsor_bytes);

                // Look up sponsor's depth
                let depth = match sponsorship_store.get(&sponsor_pk) {
                    Ok(Some(sponsor_record)) => sponsor_record.depth.saturating_add(1),
                    _ => 1,
                };

                let stored = StoredSponsorship {
                    sponsored_identity: sponsee_pk,
                    sponsor: Some(sponsor_pk),
                    creation_timestamp: a.timestamp,
                    status: SponsorshipStatus::Active,
                    penalty_until: None,
                    depth,
                    probationary: false,
                    probation_expires: None,
                    positive_contribution_score: 0,
                    is_genesis: false,
                    orphaned_at: None,
                };

                sponsorship_store.put(&stored).unwrap();
            }
        }
    }

    // 5. Verify sponsee exists
    let sponsee_pk = PublicKey::from_bytes(sponsee_pubkey);
    assert!(sponsorship_store.exists(&sponsee_pk).unwrap());

    // 6. Verify correct depth, sponsor, status
    let record = sponsorship_store.get(&sponsee_pk).unwrap().unwrap();
    assert_eq!(record.depth, 1); // genesis(0) + 1
    assert_eq!(record.sponsor, Some(PublicKey::from_bytes(genesis_pubkey)));
    assert_eq!(record.status, SponsorshipStatus::Active);
    assert!(!record.is_genesis);
}

#[test]
fn test_genesis_register_action_in_block() {
    let (_dir, sponsorship_store) = temp_sponsorship_store();

    let genesis_pubkey = [3u8; 32];
    let action = Action::new_genesis_register(genesis_pubkey, 1000, [5u8; 64]);

    let content_block = ContentBlock::new(
        action.hash(),
        [0u8; 32],
        vec![action.clone()],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();

    // Simulate handle_block_data for GenesisRegister
    for a in &content_block.actions {
        if a.action_type == ActionType::GenesisRegister {
            if let Some(genesis_bytes) = a.content_hash {
                let genesis_pk = PublicKey::from_bytes(genesis_bytes);

                let stored = StoredSponsorship {
                    sponsored_identity: genesis_pk,
                    sponsor: None,
                    creation_timestamp: a.timestamp,
                    status: SponsorshipStatus::Active,
                    penalty_until: None,
                    depth: 0,
                    probationary: false,
                    probation_expires: None,
                    positive_contribution_score: 0,
                    is_genesis: true,
                    orphaned_at: None,
                };

                sponsorship_store.put(&stored).unwrap();
            }
        }
    }

    // Verify
    let pk = PublicKey::from_bytes(genesis_pubkey);
    assert!(sponsorship_store.exists(&pk).unwrap());
    let record = sponsorship_store.get(&pk).unwrap().unwrap();
    assert!(record.is_genesis);
    assert_eq!(record.depth, 0);
    assert!(record.sponsor.is_none());
    assert_eq!(record.status, SponsorshipStatus::Active);
}

#[test]
fn test_duplicate_sponsorship_in_block_idempotent() {
    let (_dir, sponsorship_store) = temp_sponsorship_store();

    // Set up genesis sponsor
    let genesis_pubkey = [1u8; 32];
    let genesis = make_genesis_sponsorship(genesis_pubkey);
    sponsorship_store.put(&genesis).unwrap();

    let sponsee_pubkey = [2u8; 32];
    let sponsee_pk = PublicKey::from_bytes(sponsee_pubkey);
    let sponsor_pk = PublicKey::from_bytes(genesis_pubkey);

    // Create sponsorship record
    let stored = StoredSponsorship {
        sponsored_identity: sponsee_pk,
        sponsor: Some(sponsor_pk),
        creation_timestamp: 2000,
        status: SponsorshipStatus::Active,
        penalty_until: None,
        depth: 1,
        probationary: false,
        probation_expires: None,
        positive_contribution_score: 0,
        is_genesis: false,
        orphaned_at: None,
    };

    // Process twice (simulating block re-processing)
    sponsorship_store.put(&stored).unwrap();
    sponsorship_store.put(&stored).unwrap(); // Should not error

    // Verify exactly one record
    assert!(sponsorship_store.exists(&sponsee_pk).unwrap());
    let record = sponsorship_store.get(&sponsee_pk).unwrap().unwrap();
    assert_eq!(record.depth, 1);
}

#[test]
fn test_sponsor_action_serialization_size() {
    let action = Action::new_sponsor([1u8; 32], [2u8; 32], 1000, [4u8; 64]);
    let serialized = action.serialize();
    assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
    // Current fixed wire size is 466 bytes (465-byte legacy + the authenticated
    // `private` bit). ACTION_SERIALIZED_SIZE above is the source of truth; this
    // concrete literal documents the on-wire number.
    assert_eq!(serialized.len(), 466);
}
