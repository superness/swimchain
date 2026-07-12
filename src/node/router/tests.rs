//! Router tests (SPEC_10 §5)

use std::sync::atomic::Ordering;
use std::sync::Arc;

use super::error::RouteError;
use super::router::{MessageRouter, MessageRouterBuilder};
use crate::network::messages::GetBlocksPayload;
use crate::node::NodeMetrics;
use crate::types::constants::{
    MSG_ADDR, MSG_GETADDR, MSG_GETBLOCKS, MSG_GOSSIP, MSG_PING, MSG_PONG, MSG_REJECT, MSG_VERSION,
};
use crate::types::serialize::Serialize;

fn make_router() -> MessageRouter {
    let metrics = Arc::new(NodeMetrics::new());
    MessageRouter::builder().metrics(metrics).build()
}

fn make_router_with_metrics() -> (MessageRouter, Arc<NodeMetrics>) {
    let metrics = Arc::new(NodeMetrics::new());
    let router = MessageRouter::builder().metrics(metrics.clone()).build();
    (router, metrics)
}

// ========== PING/PONG Tests ==========

#[tokio::test]
async fn test_ping_roundtrip() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];
    let nonce: [u8; 8] = [1, 2, 3, 4, 5, 6, 7, 8];

    let result = router.route(&peer_id, MSG_PING, &fork_id, &nonce).await;

    match result {
        Ok(Some((msg_type, payload))) => {
            assert_eq!(msg_type, MSG_PONG);
            assert_eq!(payload, nonce.to_vec());
        }
        _ => panic!("Expected PONG response, got {:?}", result),
    }
}

#[tokio::test]
async fn test_ping_too_small() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];
    let short_payload = [1, 2, 3]; // Only 3 bytes, need 8

    let result = router
        .route(&peer_id, MSG_PING, &fork_id, &short_payload)
        .await;

    match result {
        Err(RouteError::PayloadTooSmall { expected, actual }) => {
            assert_eq!(expected, 8);
            assert_eq!(actual, 3);
        }
        _ => panic!("Expected PayloadTooSmall error, got {:?}", result),
    }
}

#[tokio::test]
async fn test_pong_updates_pending() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // Register a ping
    let nonce = router.register_ping(&peer_id);
    assert_eq!(router.pending_ping_count(), 1);

    // Send matching PONG
    let pong_payload = nonce.to_le_bytes();
    let result = router
        .route(&peer_id, MSG_PONG, &fork_id, &pong_payload)
        .await;

    assert!(result.is_ok());
    assert!(result.unwrap().is_none()); // PONG generates no response
    assert_eq!(router.pending_ping_count(), 0);
}

#[tokio::test]
async fn test_pong_wrong_peer() {
    let router = make_router();
    let peer_id1 = [0xab; 32];
    let peer_id2 = [0xcd; 32];
    let fork_id = [0u8; 32];

    // Register ping for peer1
    let nonce = router.register_ping(&peer_id1);

    // Send PONG from wrong peer
    let pong_payload = nonce.to_le_bytes();
    let _ = router
        .route(&peer_id2, MSG_PONG, &fork_id, &pong_payload)
        .await;

    // Pending ping should still be there (wrong peer)
    assert_eq!(router.pending_ping_count(), 1);
}

// ========== Discovery Tests ==========

#[tokio::test]
async fn test_getaddr_response() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // GETADDR payload: fork_id[32] + max_addrs[2]
    let mut payload = Vec::new();
    payload.extend_from_slice(&[0u8; 32]); // fork_id
    payload.extend_from_slice(&100u16.to_le_bytes()); // max_addrs

    let result = router
        .route(&peer_id, MSG_GETADDR, &fork_id, &payload)
        .await;

    match result {
        Ok(Some((msg_type, response))) => {
            assert_eq!(msg_type, MSG_ADDR);
            // Empty response: count = 0
            assert_eq!(response, vec![0, 0]);
        }
        _ => panic!("Expected ADDR response, got {:?}", result),
    }
}

#[tokio::test]
async fn test_getaddr_too_small() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];
    let short_payload = [0u8; 10]; // Only 10 bytes, need 34

    let result = router
        .route(&peer_id, MSG_GETADDR, &fork_id, &short_payload)
        .await;

    match result {
        Err(RouteError::PayloadTooSmall { expected, actual }) => {
            assert_eq!(expected, 34);
            assert_eq!(actual, 10);
        }
        _ => panic!("Expected PayloadTooSmall error, got {:?}", result),
    }
}

#[tokio::test]
async fn test_addr_limit_exceeded() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // ADDR payload with count > MAX_ADDRS_PER_MESSAGE (1000)
    let count: u16 = 1001;
    let payload = count.to_le_bytes().to_vec();

    let result = router.route(&peer_id, MSG_ADDR, &fork_id, &payload).await;

    match result {
        Err(RouteError::PayloadTooLarge { max, actual }) => {
            assert_eq!(max, 1000);
            assert_eq!(actual, 1001);
        }
        _ => panic!("Expected PayloadTooLarge error, got {:?}", result),
    }
}

#[tokio::test]
async fn test_addr_valid_empty() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // ADDR payload with count = 0
    let count: u16 = 0;
    let payload = count.to_le_bytes().to_vec();

    let result = router.route(&peer_id, MSG_ADDR, &fork_id, &payload).await;

    assert!(matches!(result, Ok(None)));
}

// ========== Routing Coverage Tests ==========

#[tokio::test]
async fn test_unknown_message_type() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    let result = router.route(&peer_id, 0xFE, &fork_id, &[]).await;

    match result {
        Err(RouteError::UnknownMessageType(msg_type)) => {
            assert_eq!(msg_type, 0xFE);
        }
        _ => panic!("Expected UnknownMessageType error, got {:?}", result),
    }
}

#[tokio::test]
async fn test_version_passthrough() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    let result = router
        .route(&peer_id, MSG_VERSION, &fork_id, &[1, 2, 3])
        .await;

    assert!(matches!(result, Ok(None)));
}

#[tokio::test]
async fn test_chain_sync_unavailable() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // Build a valid GetBlocksPayload
    let payload = GetBlocksPayload {
        start_height: 0,
        end_height: 10,
        max_blocks: 10,
        include_content: false,
    };

    let result = router
        .route(&peer_id, MSG_GETBLOCKS, &fork_id, &payload.to_bytes())
        .await;

    // GETBLOCKS now works, but chain_store is unavailable in test router
    match result {
        Err(RouteError::SubsystemUnavailable(name)) => {
            assert_eq!(name, "chain_store");
        }
        _ => panic!(
            "Expected SubsystemUnavailable(chain_store) error, got {:?}",
            result
        ),
    }
}

#[tokio::test]
async fn test_gossip_deprecated() {
    // MSG_GOSSIP is deprecated and should be silently ignored
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    let result = router.route(&peer_id, MSG_GOSSIP, &fork_id, &[]).await;

    // Deprecated messages should return Ok(None) - silently ignored
    assert!(
        matches!(result, Ok(None)),
        "Expected Ok(None) for deprecated MSG_GOSSIP, got {:?}",
        result
    );
}

// ========== Metrics Tests ==========

#[tokio::test]
async fn test_metrics_on_success() {
    let (router, metrics) = make_router_with_metrics();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];
    let nonce: [u8; 8] = [1, 2, 3, 4, 5, 6, 7, 8];

    let _ = router.route(&peer_id, MSG_PING, &fork_id, &nonce).await;

    assert_eq!(metrics.routing_received.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_processed.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_responses.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_failed.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn test_metrics_on_failure() {
    let (router, metrics) = make_router_with_metrics();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    let _ = router.route(&peer_id, 0xFE, &fork_id, &[]).await;

    assert_eq!(metrics.routing_received.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_processed.load(Ordering::Relaxed), 0);
    assert_eq!(metrics.routing_responses.load(Ordering::Relaxed), 0);
    assert_eq!(metrics.routing_failed.load(Ordering::Relaxed), 1);
}

#[tokio::test]
async fn test_metrics_on_no_response() {
    let (router, metrics) = make_router_with_metrics();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // VERSION generates no response
    let _ = router.route(&peer_id, MSG_VERSION, &fork_id, &[]).await;

    assert_eq!(metrics.routing_received.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_processed.load(Ordering::Relaxed), 1);
    assert_eq!(metrics.routing_responses.load(Ordering::Relaxed), 0);
    assert_eq!(metrics.routing_failed.load(Ordering::Relaxed), 0);
}

// ========== REJECT/ALERT Tests ==========

#[tokio::test]
async fn test_reject_logged() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // REJECT format: rejected_type[1] + code[1] + reason_len[2] + reason[N]
    let mut payload = Vec::new();
    payload.push(0x02); // rejected_type
    payload.push(0x01); // code
    payload.extend_from_slice(&5u16.to_le_bytes()); // reason_len
    payload.extend_from_slice(b"error"); // reason

    let result = router.route(&peer_id, MSG_REJECT, &fork_id, &payload).await;

    assert!(matches!(result, Ok(None)));
}

#[tokio::test]
async fn test_reject_too_small() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    let result = router.route(&peer_id, MSG_REJECT, &fork_id, &[0, 1]).await;

    match result {
        Err(RouteError::PayloadTooSmall { expected, actual }) => {
            assert_eq!(expected, 4);
            assert_eq!(actual, 2);
        }
        _ => panic!("Expected PayloadTooSmall error, got {:?}", result),
    }
}

// ========== Builder Tests ==========

#[test]
fn test_builder_basic() {
    let metrics = Arc::new(NodeMetrics::new());
    let router = MessageRouter::builder().metrics(metrics).build();

    assert_eq!(router.pending_ping_count(), 0);
}

#[test]
fn test_builder_try_build_success() {
    let metrics = Arc::new(NodeMetrics::new());
    let result = MessageRouter::builder().metrics(metrics).try_build();

    assert!(result.is_ok());
}

#[test]
fn test_builder_try_build_no_metrics() {
    let result = MessageRouterBuilder::new().try_build();

    assert!(result.is_err());
    if let Err(msg) = result {
        assert_eq!(msg, "metrics is required");
    }
}

#[test]
#[should_panic(expected = "metrics is required")]
fn test_builder_build_panics_without_metrics() {
    let _ = MessageRouterBuilder::new().build();
}

// ========== Reputation Wiring Tests (SPEC_12 §3.4) ==========

/// Build a router wired with temp content + reputation stores, plus the author key
/// and the content_hash of a single stored content item authored by that key.
fn make_reputation_router() -> (
    MessageRouter,
    Arc<crate::reputation::ReputationStore>,
    [u8; 32], // author
    [u8; 32], // content_hash
    tempfile::TempDir,
) {
    use crate::storage::content::PersistentContentStore;
    use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

    let dir = tempfile::tempdir().unwrap();
    let content_store = Arc::new(
        PersistentContentStore::open(dir.path().join("content-db"), dir.path().join("blobs"))
            .unwrap(),
    );
    let rep_db = sled::Config::new().temporary(true).open().unwrap();
    let reputation_store = Arc::new(crate::reputation::ReputationStore::open(rep_db));

    let author = [7u8; 32];
    let content_hash = [9u8; 32];
    let item = ContentItem {
        content_id: ContentId::from_bytes(content_hash),
        author_id: IdentityId::from_bytes(author),
        content_type: ContentType::Post,
        space_id: SpaceId::from_bytes([2u8; 32]),
        parent_id: None,
        created_at: 0,
        last_engagement: 0,
        body_inline: Some("hi".to_string()),
        content_hash: None,
        content_size: None,
        content_type_mime: None,
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature: Signature::from_bytes([0u8; 64]),
        pow_nonce: 0,
        pow_difficulty: 0,
        preservation_pow: None,
        display_name: None,
    };
    content_store.put(&item).unwrap();

    let metrics = Arc::new(NodeMetrics::new());
    let router = MessageRouter::builder()
        .metrics(metrics)
        .reputation_store(reputation_store.clone())
        .content_store(content_store)
        .build();

    (router, reputation_store, author, content_hash, dir)
}

/// Score wiring: a spam-flag threshold crossing resolves the content author from the
/// content store and decays their identity-level reputation by exactly one spam-flag
/// penalty (100 -> 80). A subsequent counter-clear credits fast recovery.
///
/// This documents the hard constraint: the only reputation effects wired into the
/// attestation path are a PENALTY (score DOWN) and a RECOVERY (restores standing).
/// Neither reduces PoW cost, extends decay, nor raises rate limits — reputation
/// carries no protocol privilege here.
#[test]
fn test_reputation_penalty_and_recovery_wiring() {
    let (router, reputation_store, author, content_hash, _dir) = make_reputation_router();

    // Baseline: neutral base score.
    assert_eq!(reputation_store.get_score(&author).unwrap(), 100);

    // Spam-flag crossing decays the author by one penalty (100 -> 80).
    router.record_spam_flag_for_content(&content_hash, 1_700_000_000);
    assert_eq!(reputation_store.get_score(&author).unwrap(), 80);

    // Counter-clear credits fast recovery (SPEC_12 §4.5): +15 counter bonus +10 fast
    // recovery on top of the -20 penalty => 105.
    router.record_counter_for_content(&content_hash, 1_700_000_100);
    assert_eq!(reputation_store.get_score(&author).unwrap(), 105);
}

/// The penalty is a no-op when the content author cannot be resolved (content not
/// held locally): unknown content must never mutate any reputation record.
#[test]
fn test_reputation_penalty_noop_for_unknown_content() {
    let (router, reputation_store, author, _content_hash, _dir) = make_reputation_router();

    let unknown = [0xEE; 32];
    router.record_spam_flag_for_content(&unknown, 1_700_000_000);

    // The known author is untouched, and no record was created for the unknown hash.
    assert_eq!(reputation_store.get_score(&author).unwrap(), 100);
    assert_eq!(reputation_store.count(), 0);
}

// ========== CreateSpace class-byte guard (router MSG_BLOCKS path) ==========

/// Build a MSG_BLOCKS payload for a single genesis-height (height 0) root
/// block carrying one space block / content block with a single CreateSpace
/// action. Height 0 sails through handle_blocks' fork/leader checks
/// untouched (no existing chain, no leader validation), landing straight in
/// the PHASE 2 CreateSpace validation this test is targeting.
fn build_create_space_blocks_payload(creator: [u8; 32], space_id_32: [u8; 32]) -> Vec<u8> {
    use crate::blocks::action::{Action, ActionType};
    use crate::blocks::branch_path::BranchPath;
    use crate::blocks::content_block::SpaceCreationMetadata;
    use crate::blocks::{ContentBlock, RootBlock, SpaceBlock};

    let action = Action::new_create_space(
        creator,
        1_700_000_000,
        space_id_32,
        0,
        1,
        [0u8; 32],
        [0u8; 64],
    );
    assert_eq!(action.action_type, ActionType::CreateSpace);

    let content_block = ContentBlock::new_with_space_metadata(
        space_id_32,
        space_id_32,
        vec![action],
        None,
        1_700_000_000,
        BranchPath::root(),
        SpaceCreationMetadata {
            name: "test-space".to_string(),
            description: None,
        },
    )
    .expect("non-empty actions");

    let space_block = SpaceBlock::from_content_blocks(
        space_id_32,
        std::slice::from_ref(&content_block),
        None,
        1_700_000_000,
    );

    let root_block = RootBlock::genesis(1_700_000_000);

    let root_bytes = bincode::serialize(&root_block).unwrap();
    let space_bytes = bincode::serialize(&space_block).unwrap();
    let content_bytes = bincode::serialize(&content_block).unwrap();

    let mut data = Vec::new();
    data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&root_bytes);
    data.extend_from_slice(&1u32.to_le_bytes()); // space_count = 1
    data.extend_from_slice(&(space_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&space_bytes);
    data.extend_from_slice(&1u32.to_le_bytes()); // content_count = 1
    data.extend_from_slice(&(content_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&content_bytes);

    data
}

/// Router wired with a real chain_store + sponsorship_store (both temp sled
/// DBs) so PHASE 2 CreateSpace validation in `handle_blocks` actually runs,
/// plus a pre-sponsored creator identity so only the class-byte check is
/// under test (sponsorship must pass either way).
fn make_blocks_router(
    creator: [u8; 32],
) -> (
    MessageRouter,
    Arc<crate::storage::chain::ChainStore>,
    tempfile::TempDir,
    tempfile::TempDir,
) {
    use crate::sponsorship::storage::SponsorshipStore;
    use crate::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
    use crate::types::identity::PublicKey;

    let chain_dir = tempfile::tempdir().unwrap();
    let chain_store = Arc::new(crate::storage::chain::ChainStore::open(chain_dir.path()).unwrap());

    let sponsorship_dir = tempfile::tempdir().unwrap();
    let sponsorship_store = Arc::new(SponsorshipStore::open(sponsorship_dir.path()).unwrap());
    sponsorship_store
        .put(&StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes(creator),
            sponsor: None,
            creation_timestamp: 1_700_000_000,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        })
        .unwrap();

    let metrics = Arc::new(NodeMetrics::new());
    let router = MessageRouter::builder()
        .metrics(metrics)
        .chain_store(chain_store.clone())
        .sponsorship_store(sponsorship_store)
        .build();

    (router, chain_store, chain_dir, sponsorship_dir)
}

/// A CreateSpace action whose derived space id carries an unknown class byte
/// (0x00) must be rejected on the router MSG_BLOCKS acceptance path, not
/// just by the (dead) `validate_action` predicate. This is the code path a
/// peer's gossiped block actually goes through - see PHASE 2 CreateSpace
/// validation in `handle_blocks`.
#[tokio::test]
async fn test_handle_blocks_rejects_create_space_with_unknown_class_byte() {
    let creator = [0x11u8; 32];
    let (router, chain_store, _chain_dir, _sponsorship_dir) = make_blocks_router(creator);

    // space_id_32[..16] all zero => class byte 0x00, which is not a known
    // SpaceClass (see crate::types::space_class::class_of).
    let bad_space_id_32 = [0u8; 32];
    assert!(!crate::blocks::validation::space_id_class_is_valid(
        &[0u8; 16]
    ));

    let data = build_create_space_blocks_payload(creator, bad_space_id_32);
    let blocks_payload = crate::network::messages::BlocksPayload {
        blocks: vec![crate::network::messages::SerializedBlock { data }],
    };

    let peer_id = [0xabu8; 32];
    let fork_id = [0u8; 32];
    let result = router
        .route(
            &peer_id,
            crate::types::constants::MSG_BLOCKS,
            &fork_id,
            &blocks_payload.to_bytes(),
        )
        .await;

    // Routing itself succeeds (rejection happens inside handle_blocks via
    // `continue`, not by returning an Err) - the important assertion is
    // that nothing got persisted.
    assert!(result.is_ok(), "route() should not error: {:?}", result);

    let latest_height = chain_store.get_latest_height().unwrap();
    assert_eq!(
        latest_height, None,
        "block with malformed CreateSpace class byte must not be stored"
    );

    let bad_space_id_16 = [0u8; 16];
    assert_eq!(
        chain_store.space_exists(&bad_space_id_16).unwrap(),
        false,
        "space with unknown class byte must not be registered"
    );
}

/// Sanity check: the same flow with a well-classed space id (Social, 0x01)
/// is accepted and stored, proving the rejection above is due to the class
/// byte specifically and not some other defect in the test harness.
#[tokio::test]
async fn test_handle_blocks_accepts_create_space_with_known_class_byte() {
    let creator = [0x22u8; 32];
    let (router, chain_store, _chain_dir, _sponsorship_dir) = make_blocks_router(creator);

    let mut good_space_id_32 = [0u8; 32];
    good_space_id_32[0] = 0x01; // SpaceClass::Social
    let mut good_space_id_16 = [0u8; 16];
    good_space_id_16.copy_from_slice(&good_space_id_32[..16]);
    assert!(crate::blocks::validation::space_id_class_is_valid(
        &good_space_id_16
    ));

    let data = build_create_space_blocks_payload(creator, good_space_id_32);
    let blocks_payload = crate::network::messages::BlocksPayload {
        blocks: vec![crate::network::messages::SerializedBlock { data }],
    };

    let peer_id = [0xcdu8; 32];
    let fork_id = [0u8; 32];
    let result = router
        .route(
            &peer_id,
            crate::types::constants::MSG_BLOCKS,
            &fork_id,
            &blocks_payload.to_bytes(),
        )
        .await;

    assert!(result.is_ok(), "route() should not error: {:?}", result);

    let latest_height = chain_store.get_latest_height().unwrap();
    assert_eq!(
        latest_height,
        Some(0),
        "well-classed CreateSpace block should be stored at height 0"
    );

    assert_eq!(
        chain_store.space_exists(&good_space_id_16).unwrap(),
        true,
        "space with known class byte should be registered"
    );
}

// ========== All Message Types Coverage ==========

#[tokio::test]
async fn test_all_known_types_no_panic() {
    let router = make_router();
    let peer_id = [0xab; 32];
    let fork_id = [0u8; 32];

    // Test a sampling of all message type ranges
    let message_types: Vec<u8> = vec![
        0x00, 0x01, 0x02, 0x03, // Handshake, Keepalive
        0x10, 0x11, // Discovery
        0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, // Inventory, Content
        0x30, 0x31, 0x32, 0x33, 0x34, 0x35, // Social Layer (SPEC_09)
        0x40, // Gossip
        0x50, 0x51, // Attribution
        0x53, 0x54, 0x55, // Fork
        0x60, 0x61, // Error
        0x70, 0x71, 0x72, 0x73, 0x74, // Chain Sync
    ];

    for msg_type in message_types {
        // Use a minimal valid payload for types that check size
        let payload = match msg_type {
            0x02 | 0x03 => vec![0u8; 8], // PING/PONG need 8 bytes
            0x10 => vec![0u8; 34],       // GETADDR needs 34 bytes
            0x11 => vec![0u8; 2],        // ADDR needs at least 2 bytes
            0x60 => vec![0u8; 4],        // REJECT needs 4 bytes
            0x61 => vec![0u8; 43],       // ALERT needs 43 bytes
            _ => vec![],
        };

        let result = router.route(&peer_id, msg_type, &fork_id, &payload).await;

        // Should not panic - either Ok or known error
        match result {
            Ok(_) => {}
            Err(RouteError::SubsystemUnavailable(_)) => {}
            Err(RouteError::PayloadTooSmall { .. }) => {}
            Err(RouteError::PayloadTooLarge { .. }) => {}
            Err(RouteError::UnknownMessageType(_)) => {
                // This is acceptable for types we don't handle
            }
            Err(RouteError::DeserializationError(_)) => {
                // Acceptable - invalid/empty payloads for types that require data
            }
            Err(e) => panic!("Unexpected error for type 0x{:02x}: {:?}", msg_type, e),
        }
    }
}
