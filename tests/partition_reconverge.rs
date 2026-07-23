//! Partition + reconverge — measured behavior of the global heaviest-work fork
//! choice, driving the REAL router/reorg path (not a model).
//!
//! Two chains diverge from a common prefix, the heavier tip is delivered to the
//! node holding the lighter one, and we assert (a) the tip switches to the heavier
//! chain and (b) the losing tip's actions come back via the mempool (re-anchor),
//! nothing is destroyed. One chain, one rule for everyone.

use std::sync::{Arc, RwLock};

use swimchain::blocks::{
    Action, ActionType, BlockBuilder, BranchPath, ContentBlock, RootBlock, SpaceBlock,
};
use swimchain::network::messages::BlockDataPayload;
use swimchain::node::metrics::NodeMetrics;
use swimchain::node::MessageRouter;
use swimchain::storage::chain::ChainStore;
use swimchain::types::constants::MSG_BLOCK_DATA;
use tempfile::tempdir;

const SPACE_ID: [u8; 32] = [0x55; 32];
const THREAD_ID: [u8; 32] = [0x44; 32];

fn post(actor: u8, content: u8) -> Action {
    Action {
        action_type: ActionType::Post,
        actor: [actor; 32],
        timestamp: 1_700_000_000,
        content_hash: Some([content; 32]),
        parent_id: None,
        pow_nonce: u64::from(content),
        pow_work: 100,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
        private: false,
    }
}

/// Build a full block (content + space + root) at `height` on `prev` with an
/// explicit `cumulative_pow`, carrying `actions`. Returns the root and the
/// serialized `BlockDataPayload` bytes to feed the router.
fn build_block(
    prev: [u8; 32],
    height: u64,
    cumulative_pow: u64,
    actions: Vec<Action>,
) -> (RootBlock, Vec<u8>) {
    let ts = 1_700_000_000 + height;
    let total_pow = if height == 0 { cumulative_pow } else { 100 };
    let cb = ContentBlock::new(THREAD_ID, SPACE_ID, actions, None, ts, BranchPath::root()).unwrap();
    let sb = SpaceBlock {
        space_id: SPACE_ID,
        merkle_root: [0u8; 32],
        content_block_hashes: vec![cb.hash()],
        content_block_count: 1,
        prev_space_hash: None,
        timestamp: ts,
        total_pow,
    };
    let root = RootBlock {
        version: 1,
        prev_root_hash: prev,
        timestamp: ts,
        merkle_root: [0u8; 32],
        space_block_hashes: vec![sb.hash()],
        space_block_count: 1,
        total_pow,
        cumulative_pow,
        difficulty_target: 30,
        height,
        block_creator: [0u8; 32],
    };
    let mut payload = BlockDataPayload::new(root.hash());
    payload.root_block = bincode::serialize(&root).unwrap();
    payload.space_blocks.push(bincode::serialize(&sb).unwrap());
    payload
        .content_blocks
        .push(bincode::serialize(&cb).unwrap());
    (root, payload.to_bytes())
}

#[tokio::test]
async fn heavier_tip_wins_and_loser_actions_reanchor() {
    let dir = tempdir().unwrap();
    let store = Arc::new(ChainStore::open(dir.path()).unwrap());
    let builder = Arc::new(RwLock::new(BlockBuilder::new(30)));
    let router = MessageRouter::builder()
        .metrics(Arc::new(NodeMetrics::new()))
        .chain_store(store.clone())
        .block_builder(builder.clone())
        .build();

    let peer = [1u8; 32];
    let fork_id = [0u8; 32];

    // ---- common prefix: heights 0 and 1 ----
    let (g, g_bytes) = build_block([0u8; 32], 0, 100, vec![post(0x01, 0x10)]);
    router
        .route(&peer, MSG_BLOCK_DATA, &fork_id, &g_bytes)
        .await
        .unwrap();
    let (h1, h1_bytes) = build_block(g.hash(), 1, 200, vec![post(0x01, 0x11)]);
    router
        .route(&peer, MSG_BLOCK_DATA, &fork_id, &h1_bytes)
        .await
        .unwrap();
    assert_eq!(
        store.get_latest_height().unwrap(),
        Some(1),
        "prefix tip is height 1"
    );

    // ---- light tip at height 2 (partition A) ----
    let light_actions = vec![post(0xA1, 0xA1), post(0xA2, 0xA2)];
    let (light, light_bytes) = build_block(h1.hash(), 2, 300, light_actions.clone());
    router
        .route(&peer, MSG_BLOCK_DATA, &fork_id, &light_bytes)
        .await
        .unwrap();
    assert_eq!(
        store.get_root_hash_at_height(2).unwrap(),
        Some(light.hash()),
        "light tip is canonical at height 2 before the heavier competitor arrives"
    );

    // ---- heavier competitor at height 2 (partition B bridges in) ----
    // Disjoint actions so the loser's set isn't re-finalized by storing the winner.
    let heavy_actions = vec![post(0xB1, 0xB1), post(0xB2, 0xB2), post(0xB3, 0xB3)];
    let (heavy, heavy_bytes) = build_block(h1.hash(), 2, 500, heavy_actions.clone());
    router
        .route(&peer, MSG_BLOCK_DATA, &fork_id, &heavy_bytes)
        .await
        .unwrap();

    // (a) tip switched to the heavier chain
    assert_eq!(
        store.get_root_hash_at_height(2).unwrap(),
        Some(heavy.hash()),
        "heavier tip won fork choice at height 2"
    );
    assert_eq!(
        store.get_best_tip().unwrap(),
        Some(heavy.hash()),
        "best_tip points at the heavier chain"
    );

    // (b) the losing tip's actions came back via the mempool (re-anchor, not destroyed)
    let pending = builder.read().unwrap().pending_action_count();
    assert_eq!(
        pending,
        light_actions.len(),
        "the {} orphaned light-tip actions were returned to the mempool (heavy actions finalized into the winner)",
        light_actions.len()
    );
}
