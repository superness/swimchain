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
    spaces: &[SpaceBlock],
) -> swimchain::network::messages::SerializedBlock {
    let root_bytes = bincode::serialize(root).unwrap();
    let mut data = Vec::new();
    data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&root_bytes);
    data.extend_from_slice(&(spaces.len() as u32).to_le_bytes());
    for sb in spaces {
        let space_bytes = bincode::serialize(sb).unwrap();
        data.extend_from_slice(&(space_bytes.len() as u32).to_le_bytes());
        data.extend_from_slice(&space_bytes);
        data.extend_from_slice(&0u32.to_le_bytes()); // content block count
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
        blocks: vec![full_block_entry(&b0, &[sb.clone()])],
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
