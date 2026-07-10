//! Content backfill after headers-first sync (fresh-node content gap).
//!
//! Regression tests for the bug where a fresh node header-syncs to the tip,
//! reports synced, and never downloads historical space/content blocks —
//! it ends up with root-block headers whose claimed space blocks are absent,
//! so spaces show placeholder names and zero posts.

use swimchain::blocks::{RootBlock, SpaceBlock};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn space_block(space_id_byte: u8) -> SpaceBlock {
    SpaceBlock {
        space_id: [space_id_byte; 32],
        merkle_root: [0u8; 32],
        content_block_hashes: vec![],
        prev_space_hash: None,
        timestamp: 1_700_000_000,
        total_pow: 10,
        content_block_count: 0,
    }
}

fn root_block(height: u64, prev: [u8; 32], space_hashes: Vec<[u8; 32]>) -> RootBlock {
    RootBlock {
        version: 1,
        prev_root_hash: prev,
        timestamp: 1_700_000_000 + height,
        merkle_root: [0u8; 32],
        space_block_count: space_hashes.len() as u32,
        space_block_hashes: space_hashes,
        total_pow: 10,
        cumulative_pow: 10 * (height + 1),
        difficulty_target: 30,
        height,
        block_creator: [0u8; 32],
    }
}

#[test]
fn detects_heights_with_missing_content_blocks() {
    // The deeper gap seen on real devices: space blocks synced, but the
    // content blocks they claim (which carry space names and posts) absent.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let missing_content_hash = [42u8; 32];
    let mut sb = space_block(1);
    sb.content_block_hashes = vec![missing_content_hash];
    sb.content_block_count = 1;
    let sb_hash = sb.hash();

    let b0 = root_block(0, [0u8; 32], vec![sb_hash]);
    let h0 = store.put_root_block(&b0).unwrap();
    store.index_height(0, h0).unwrap();
    store.put_space_block(&sb).unwrap(); // space block IS stored

    let gaps = store.find_content_gap_heights(16).unwrap();
    assert_eq!(
        gaps,
        vec![0],
        "height 0 has its space block but not the claimed content block"
    );
}

#[test]
fn detects_heights_with_missing_space_blocks() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let sb = space_block(1);
    let sb_hash = sb.hash();

    // height 0: claims no space blocks (nothing to miss)
    let b0 = root_block(0, [0u8; 32], vec![]);
    let h0 = store.put_root_block(&b0).unwrap();
    store.index_height(0, h0).unwrap();

    // height 1: claims a space block we DON'T store (header-only sync state)
    let b1 = root_block(1, h0, vec![sb_hash]);
    let h1 = store.put_root_block(&b1).unwrap();
    store.index_height(1, h1).unwrap();

    let gaps = store.find_content_gap_heights(16).unwrap();
    assert_eq!(gaps, vec![1], "height 1 lacks its claimed space block");

    // Backfill the space block -> gap closes
    store.put_space_block(&sb).unwrap();
    let gaps = store.find_content_gap_heights(16).unwrap();
    assert!(
        gaps.is_empty(),
        "no gaps after space block stored: {gaps:?}"
    );
}

/// Serialize one block in the full BLOCKS wire format the getblocks handlers
/// emit: len-prefixed root, space count, then per-space len-prefixed space
/// block + content count (+ len-prefixed content blocks).
fn full_block_entry(
    root: &RootBlock,
    spaces: &[(SpaceBlock, Vec<swimchain::blocks::ContentBlock>)],
) -> swimchain::network::messages::SerializedBlock {
    let root_bytes = bincode::serialize(root).unwrap();
    let mut data = Vec::new();
    data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&root_bytes);
    data.extend_from_slice(&(spaces.len() as u32).to_le_bytes());
    for (sb, contents) in spaces {
        let space_bytes = bincode::serialize(sb).unwrap();
        data.extend_from_slice(&(space_bytes.len() as u32).to_le_bytes());
        data.extend_from_slice(&space_bytes);
        data.extend_from_slice(&(contents.len() as u32).to_le_bytes());
        for cb in contents {
            let content_bytes = bincode::serialize(cb).unwrap();
            data.extend_from_slice(&(content_bytes.len() as u32).to_le_bytes());
            data.extend_from_slice(&content_bytes);
        }
    }
    swimchain::network::messages::SerializedBlock { data }
}

#[tokio::test(flavor = "multi_thread")]
async fn full_block_response_backfills_content_for_known_header() {
    use std::sync::Arc;
    use swimchain::network::messages::BlocksPayload;
    use swimchain::node::MessageRouter;
    use swimchain::types::constants::MSG_BLOCKS;
    use swimchain::types::Serialize as _;

    let dir = tempdir().unwrap();
    let store = Arc::new(ChainStore::open(dir.path().join("chain")).unwrap());

    // Header-only sync state: node holds the root block that claims a space
    // block, but not the space block itself.
    let sb = space_block(7);
    let sb_hash = sb.hash();
    let b0 = root_block(0, [0u8; 32], vec![sb_hash]);
    let h0 = store.put_root_block(&b0).unwrap();
    store.index_height(0, h0).unwrap();
    assert!(store.get_space_block(&sb_hash).unwrap().is_none());

    // A peer answers a backfill request with the SAME block in full format.
    let payload = BlocksPayload {
        blocks: vec![full_block_entry(&b0, &[(sb.clone(), vec![])])],
    }
    .to_bytes();

    let router = MessageRouter::builder()
        .metrics(Arc::new(swimchain::node::NodeMetrics::new()))
        .chain_store(store.clone())
        .build();
    router
        .route(&[9u8; 32], MSG_BLOCKS, &[0u8; 32], &payload)
        .await
        .expect("route MSG_BLOCKS");

    assert!(
        store.get_space_block(&sb_hash).unwrap().is_some(),
        "space block from a full-block response must be stored even though \
         the root header was already known (content backfill)"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn full_block_response_backfills_missing_content_blocks() {
    use std::sync::Arc;
    use swimchain::blocks::ContentBlock;
    use swimchain::network::messages::BlocksPayload;
    use swimchain::node::MessageRouter;
    use swimchain::types::constants::MSG_BLOCKS;
    use swimchain::types::Serialize as _;

    let dir = tempdir().unwrap();
    let store = Arc::new(ChainStore::open(dir.path().join("chain")).unwrap());

    // The on-device state: root header AND space block synced, but the
    // content block the space claims (space name, posts) is absent.
    let cb = ContentBlock {
        thread_root_id: [3u8; 32],
        space_id: [1u8; 32],
        actions: vec![],
        merkle_root: [0u8; 32],
        prev_content_hash: None,
        timestamp: 1_700_000_000,
        total_pow: 10,
        branch_path: swimchain::blocks::BranchPath::default(),
        space_metadata: None,
    };
    let cb_hash = cb.hash();
    let mut sb = space_block(1);
    sb.content_block_hashes = vec![cb_hash];
    sb.content_block_count = 1;
    let sb_hash = sb.hash();
    let b0 = root_block(0, [0u8; 32], vec![sb_hash]);
    let h0 = store.put_root_block(&b0).unwrap();
    store.index_height(0, h0).unwrap();
    store.put_space_block(&sb).unwrap();
    assert!(store.get_content_block(&cb_hash).unwrap().is_none());

    let payload = BlocksPayload {
        blocks: vec![full_block_entry(&b0, &[(sb.clone(), vec![cb.clone()])])],
    }
    .to_bytes();

    let router = MessageRouter::builder()
        .metrics(Arc::new(swimchain::node::NodeMetrics::new()))
        .chain_store(store.clone())
        .build();
    router
        .route(&[9u8; 32], MSG_BLOCKS, &[0u8; 32], &payload)
        .await
        .expect("route MSG_BLOCKS");

    assert!(
        store.get_content_block(&cb_hash).unwrap().is_some(),
        "content block from a full-block response must be stored even though \
         the root header and space block were already known"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn backfill_skips_revalidation_for_already_accepted_header() {
    // Live failure this reproduces: the phone requested a historical block
    // its accepted header chain already contained, and handle_blocks
    // re-ran leader-election validation on it — REJECTED (rules had
    // evolved since the block was mined), so the content never stored.
    // A hash match against our own chain IS the acceptance proof; the
    // fall-through must go straight to content storage.
    use std::sync::Arc;
    use swimchain::network::messages::BlocksPayload;
    use swimchain::node::MessageRouter;
    use swimchain::types::constants::MSG_BLOCKS;
    use swimchain::types::Serialize as _;

    let dir = tempdir().unwrap();
    let store = Arc::new(ChainStore::open(dir.path().join("chain")).unwrap());

    // Chain of 3: heights 0 and 1 complete, height 2 header-only. Height 2
    // triggers parent/leader validation paths (they apply above height 1),
    // and its creator/pow fixture data would never pass leader election.
    let b0 = root_block(0, [0u8; 32], vec![]);
    let h0 = store.put_root_block(&b0).unwrap();
    store.index_height(0, h0).unwrap();
    let b1 = root_block(1, h0, vec![]);
    let h1 = store.put_root_block(&b1).unwrap();
    store.index_height(1, h1).unwrap();

    let sb = space_block(9);
    let sb_hash = sb.hash();
    let mut b2 = root_block(2, h1, vec![sb_hash]);
    // Non-zero creator so leader-election validation (Check 4) actually
    // runs — a zero creator is skipped as "legacy" and would make this
    // test pass without exercising the revalidation-skip.
    b2.block_creator = [0xEE; 32];
    let h2 = store.put_root_block(&b2).unwrap();
    store.index_height(2, h2).unwrap();
    assert!(store.get_space_block(&sb_hash).unwrap().is_none());

    let payload = BlocksPayload {
        blocks: vec![full_block_entry(&b2, &[(sb.clone(), vec![])])],
    }
    .to_bytes();

    let router = MessageRouter::builder()
        .metrics(Arc::new(swimchain::node::NodeMetrics::new()))
        .chain_store(store.clone())
        .build();
    router
        .route(&[9u8; 32], MSG_BLOCKS, &[0u8; 32], &payload)
        .await
        .expect("route MSG_BLOCKS");

    assert!(
        store.get_space_block(&sb_hash).unwrap().is_some(),
        "backfill for an already-accepted header must store content without \
         re-running leader validation"
    );
}

#[test]
fn placeholder_registration_never_clobbers_real_space_name() {
    // On-device failure: a space's real name (learned via SPACE_META peer
    // exchange) reverted to "Space <hex>" after app restart — several code
    // paths register spaces with placeholder names and the registry accepted
    // blind overwrites. register_space must be upgrade-only for names.
    use swimchain::storage::SpaceInfo;

    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let space_id = [7u8; 16];
    let real = SpaceInfo {
        space_id,
        name: "Minecraft".to_string(),
        description: Some("wiki demo".to_string()),
        creator: [1u8; 32],
        created_at: 1_700_000_000,
        pow_work: 4096,
        is_private: false,
        encrypted_name: None,
        creator_encrypted_key: None,
        key_version: 0,
    };
    store.register_space(&real).unwrap();

    // A placeholder write (gossip/startup path) must NOT erase the real name.
    let placeholder = SpaceInfo {
        name: format!("Space {}", hex::encode(&space_id[..4])),
        description: None,
        ..real.clone()
    };
    store.register_space(&placeholder).unwrap();

    let stored = store
        .get_space(&space_id)
        .unwrap()
        .expect("space registered");
    assert_eq!(
        stored.name, "Minecraft",
        "placeholder registration clobbered the real name"
    );

    // But a real-name update still goes through.
    let renamed = SpaceInfo {
        name: "Minecraft Wiki".to_string(),
        ..real.clone()
    };
    store.register_space(&renamed).unwrap();
    let stored = store.get_space(&space_id).unwrap().unwrap();
    assert_eq!(
        stored.name, "Minecraft Wiki",
        "real-name updates must still apply"
    );
}

#[test]
fn gap_scan_respects_cap() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let mut prev = [0u8; 32];
    for height in 0..10u64 {
        let sb_hash = [height as u8 + 100; 32]; // claimed but never stored
        let b = root_block(height, prev, vec![sb_hash]);
        let h = store.put_root_block(&b).unwrap();
        store.index_height(height, h).unwrap();
        prev = h;
    }

    let gaps = store.find_content_gap_heights(3).unwrap();
    assert_eq!(gaps, vec![0, 1, 2], "cap limits scan results");
}
