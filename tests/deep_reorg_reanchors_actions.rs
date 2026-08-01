//! A deep reorg must hand back the losing branch's ACTIONS, not just drop them.
//!
//! THE 2026-08-01 DATA LOSS. When the fleet's two mainnet chains were
//! reconciled, 1,387 signed actions existed only on the abandoned branch —
//! 1,230 of them one player's moves on a single table, every one of them
//! valid, paid for with real proof-of-work, and simply gone.
//!
//! The same-height rollback path has always re-anchored correctly:
//! `rollback_block_at_height` returns the orphaned actions and the router
//! calls `requeue_and_regossip_orphans`, so a shallow fork race loses
//! nothing. The DEEP path does not. `reorg_to_heavier_chain`'s own doc
//! comment promises step 4, "Return orphaned blocks for mempool return", and
//! it does return them — but `put_root_block_with_fork_resolution` discards
//! that list and answers `(hash, is_new_tip)`, and
//! `update_best_tip_if_heavier` only logs "N blocks reorged out". Nothing
//! upstream ever sees the displaced blocks, so nothing recovers their work.
//!
//! This matters much more now than it did last week: fork ASSEMBLY was broken
//! until #252 (a competing branch could never be fetched, so it could never be
//! judged), which meant deep reorgs almost never fired. Fixing assembly
//! without fixing this would have made silent data loss MORE likely, not
//! less — it unblocks exactly the path that eats the actions.

use swimchain::blocks::action::{Action, ActionType};
use swimchain::blocks::branch_path::BranchPath;
use swimchain::blocks::{ContentBlock, RootBlock, SpaceBlock};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

const SPACE: [u8; 32] = [0x42; 32];

fn action(actor_tag: u8, ts: u64) -> Action {
    Action {
        action_type: ActionType::Reply,
        actor: [actor_tag; 32],
        timestamp: ts,
        content_hash: Some([actor_tag ^ 0x5A; 32]),
        parent_id: Some([0x99; 32]),
        pow_nonce: ts,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [7u8; 64],
        emoji: None,
        display_name: None,
        media_refs: vec![],
        replaces_pending: None,
        private: false,
    }
}

/// A block at `height` carrying `actions`, fully linked through a space block
/// and a content block so the storage walk can find them.
fn block_with_actions(
    store: &ChainStore,
    height: u64,
    prev: [u8; 32],
    cumulative_pow: u64,
    fork_tag: u8,
    actions: Vec<Action>,
) -> RootBlock {
    let content = ContentBlock::new(
        [0x99; 32],
        SPACE,
        actions,
        None,
        1_000_000 + height,
        BranchPath::root(),
    )
    .expect("content block");
    let content_hash = store.put_content_block(&content).expect("put content");

    let space = SpaceBlock {
        space_id: SPACE,
        // The REAL merkle root, not a constant: with a fixed value two
        // branches' space blocks at the same height hash identically and the
        // later write silently clobbers the earlier one — which made the first
        // draft of this test read one action per block instead of two.
        merkle_root: content_hash,
        content_block_hashes: vec![content_hash],
        prev_space_hash: None,
        timestamp: 1_000_000 + height,
        total_pow: 10,
        content_block_count: 1,
    };
    let space_hash = store.put_space_block(&space).expect("put space");

    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_000_000 + height,
        merkle_root: space_hash,
        space_block_hashes: vec![space_hash],
        space_block_count: 1,
        total_pow: cumulative_pow,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        cumulative_pow,
        block_creator: [fork_tag; 32],
    }
}

#[test]
fn a_deep_reorg_returns_the_losing_branchs_actions() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    // Shared history 0..=5, no actions of interest.
    let mut prev = [0u8; 32];
    for h in 0..=5u64 {
        let b = block_with_actions(&store, h, prev, h, 0x11, vec![action(0x01, 900 + h)]);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }
    let fork_point = prev;

    // LOSING branch, heights 6..=9, carrying one player's moves — the shape of
    // the 1,230 actions that vanished.
    let mut a_prev = fork_point;
    let mut doomed: Vec<Action> = Vec::new();
    for h in 6..=9u64 {
        let acts = vec![action(0xAA, 1_000 + h), action(0xAA, 2_000 + h)];
        doomed.extend(acts.iter().cloned());
        let b = block_with_actions(&store, h, a_prev, h, 0xAA, acts);
        a_prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }
    assert_eq!(store.get_latest_height().unwrap(), Some(9));

    // WINNING branch, heights 6..=12, strictly heavier. Ancestry stored raw
    // first (as a locator sync delivers it), then the tip adopts.
    let mut b_prev = fork_point;
    let mut b_blocks = Vec::new();
    for h in 6..=12u64 {
        let b = block_with_actions(
            &store,
            h,
            b_prev,
            1_000 + h,
            0xBB,
            vec![action(0xBB, 3_000 + h)],
        );
        b_prev = b.hash();
        b_blocks.push(b);
    }
    for b in &b_blocks[..b_blocks.len() - 1] {
        store.put_root_block(b).unwrap();
    }

    let (_hash, is_new_tip, displaced) = store
        .put_root_block_with_fork_resolution_reporting(b_blocks.last().unwrap())
        .unwrap();
    assert!(is_new_tip, "the heavier branch must be adopted");
    assert_eq!(store.get_latest_height().unwrap(), Some(12));

    // THE POINT: the caller must learn WHICH blocks lost, so their work can be
    // put back in the mempool instead of evaporating.
    assert_eq!(
        displaced.len(),
        4,
        "heights 6..=9 of the losing branch must be reported as displaced"
    );

    let recovered = store.orphaned_actions_in_blocks(&displaced);
    assert_eq!(
        recovered.len(),
        doomed.len(),
        "every action from the losing branch must be recoverable for re-anchoring \
         (this is the 1,230 lost moves of 2026-08-01)"
    );
    for a in &doomed {
        assert!(
            recovered
                .iter()
                .any(|(_, _, r, _)| r.actor == a.actor && r.timestamp == a.timestamp),
            "missing a displaced action (actor {:02x?}, ts {})",
            &a.actor[..2],
            a.timestamp
        );
    }
}

#[test]
fn an_ordinary_extension_displaces_nothing() {
    // The quiet case must stay quiet: extending the tip is not a reorg, so
    // there is nothing to requeue and no chance of double-crediting.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    for h in 0..=3u64 {
        let b = block_with_actions(&store, h, prev, h, 0x11, vec![action(0x01, 900 + h)]);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    let next = block_with_actions(&store, 4, prev, 4, 0x11, vec![action(0x01, 904)]);
    let (_h, is_new_tip, displaced) = store
        .put_root_block_with_fork_resolution_reporting(&next)
        .unwrap();
    assert!(is_new_tip);
    assert!(
        displaced.is_empty(),
        "a plain tip extension displaces nothing, so nothing may be requeued"
    );
    assert!(store.orphaned_actions_in_blocks(&displaced).is_empty());
}
