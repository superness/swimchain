//! Regression tests for the "colliding block creators" fork race.
//!
//! Root-cause writeup: docs/CONSENSUS_ACTION_LOSS.md (the height-365 incident,
//! 2026-07-15). Two nodes forged competing blocks at the same height carrying
//! overlapping-but-different action sets. Because `pow_work` is a per-difficulty
//! constant (every difficulty-8 action is worth exactly 1), the blocks tied
//! EXACTLY on cumulative PoW and the content-blind lowest-hash tiebreak orphaned
//! one of them — and the loser's unique actions sat in "orphan limbo" for
//! minutes. These tests pin the two fixes:
//!
//! 1. `fork_race_tie_orphans_are_reincluded_in_next_block` — the full collision
//!    scenario at the storage/builder level: equal-work tie, rollback, orphan
//!    requeue (mirroring the router's `requeue_and_regossip_orphans` order of
//!    operations), and MUST-inclusion in the very next built block.
//! 2. `eligibility_window_staggers_forgers_on_bursty_traffic` — the leader
//!    filter must not be fully open by the time a typical bursty action arrives
//!    (the old 45s testnet window made every node eligible at once, which is
//!    what created simultaneous forgers in the first place).

use swimchain::blocks::builder::BlockBuilder;
use swimchain::blocks::{Action, ActionType, BranchPath, ContentBlock, RootBlock, SpaceBlock};
use swimchain::storage::chain::ChainStore;
use tempfile::tempdir;

const SPACE_ID: [u8; 32] = [0xAA; 32];
const THREAD_ID: [u8; 32] = [0xBB; 32];
const TS: u64 = 1_784_162_720; // quantized (multiple of 10), same for both forgers

/// A difficulty-8-style reply: pow_work = 1, like every reef/chess/comment
/// action on the testnet. `tag` makes the content unique.
fn reply_action(tag: u8) -> Action {
    Action {
        action_type: ActionType::Reply,
        actor: [tag; 32],
        timestamp: TS - 10,
        content_hash: Some([tag; 32]),
        parent_id: Some(THREAD_ID),
        pow_nonce: 0,
        pow_work: 1,
        pow_target: [0u8; 32],
        signature: [tag; 64],
        emoji: None,
        display_name: None,
        media_refs: vec![],
        replaces_pending: None,
        private: false,
    }
}

/// Build a root block at `height` on `parent`, carrying `actions` in a single
/// content block, forged by `creator`. Returns (root, space, content).
fn forge_block(
    parent_hash: [u8; 32],
    parent_cumulative_pow: u64,
    height: u64,
    creator: [u8; 32],
    actions: Vec<Action>,
) -> (RootBlock, SpaceBlock, ContentBlock) {
    let content = ContentBlock::new(THREAD_ID, SPACE_ID, actions, None, TS, BranchPath::root())
        .expect("content block");
    let space = SpaceBlock::from_content_blocks(SPACE_ID, &[content.clone()], None, TS);
    let root = RootBlock::from_space_blocks(
        &[space.clone()],
        parent_hash,
        parent_cumulative_pow,
        TS,
        1, // difficulty_target: tiny, both blocks meet it
        height,
        creator,
    );
    (root, space, content)
}

fn store_block_bodies(store: &ChainStore, space: &SpaceBlock, content: &ContentBlock) {
    store.put_content_block(content).expect("put content");
    store.put_space_block(space).expect("put space");
}

#[test]
fn fork_race_tie_orphans_are_reincluded_in_next_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    // Genesis (empty) so height 1 has a parent.
    let genesis = RootBlock::from_space_blocks(&[], [0u8; 32], 0, TS - 600, 0, 0, [0u8; 32]);
    store
        .put_root_block_with_fork_resolution(&genesis)
        .expect("store genesis");

    // The height-365 shape: a shared action that gossiped everywhere, plus one
    // action unique to each forger's mempool (submitted seconds before the race).
    let shared = reply_action(1);
    let unique_a = reply_action(2);
    let unique_b = reply_action(3);

    let (block_a, space_a, content_a) = forge_block(
        genesis.hash(),
        genesis.cumulative_pow,
        1,
        [0xA1; 32],
        vec![shared.clone(), unique_a.clone()],
    );
    let (block_b, space_b, content_b) = forge_block(
        genesis.hash(),
        genesis.cumulative_pow,
        1,
        [0xB2; 32],
        vec![shared.clone(), unique_b.clone()],
    );

    // THE STRUCTURAL TIE: same action count => exactly equal work, despite
    // different contents. This is why fork races here are decided by the
    // content-blind hash coin flip, not by weight.
    assert_eq!(block_a.total_pow, 2);
    assert_eq!(block_a.cumulative_pow, block_b.cumulative_pow);
    assert_ne!(block_a.hash(), block_b.hash());

    // Decide winner/loser exactly like the router: lowest hash wins the tie.
    let a_wins = ChainStore::hash_wins(&block_a.hash(), &block_b.hash());
    let (winner, winner_space, winner_content, loser, loser_space, loser_content) = if a_wins {
        (
            &block_a, &space_a, &content_a, &block_b, &space_b, &content_b,
        )
    } else {
        (
            &block_b, &space_b, &content_b, &block_a, &space_a, &content_a,
        )
    };
    let loser_unique = if a_wins { &unique_b } else { &unique_a };

    // The losing node's view: its own block confirmed first and its actions
    // were marked finalized (the winner's block hasn't arrived yet).
    store_block_bodies(&store, loser_space, loser_content);
    store
        .put_root_block_with_fork_resolution(loser)
        .expect("store loser");
    for action in &loser_content.actions {
        store
            .mark_action_finalized(&BlockBuilder::action_hash(action), 1)
            .expect("finalize");
    }
    assert_eq!(
        store.get_root_hash_at_height(1).unwrap(),
        Some(loser.hash())
    );

    // The winner's block arrives: equal pow, lower hash -> rollback, exactly
    // like router handle_block_data. Rollback must return the loser's actions
    // and unmark them.
    let orphans = store.rollback_block_at_height(1).expect("rollback");
    let orphan_actions: Vec<&Action> = orphans.iter().map(|(_, _, a, _)| a).collect();
    assert_eq!(orphan_actions.len(), 2, "both loser actions orphaned");
    assert!(
        store
            .is_action_finalized(&BlockBuilder::action_hash(loser_unique))
            .unwrap()
            .is_none(),
        "rollback must unmark orphaned actions"
    );

    // Requeue orphans into the mempool — mirrors requeue_and_regossip_orphans:
    // this happens BEFORE the winner block is stored/finalized, so both orphans
    // (shared + unique) re-enter the mempool; the guard only skips actions
    // still finalized in a SURVIVING block.
    let mut builder = BlockBuilder::new(1);
    for (thread_id, space_id, action, branch_path) in orphans {
        if store
            .is_action_finalized(&BlockBuilder::action_hash(&action))
            .unwrap()
            .is_some()
        {
            continue;
        }
        assert!(
            builder.add_action(thread_id, space_id, action, branch_path),
            "orphan must re-enter the mempool"
        );
    }
    assert_eq!(builder.pending_action_count(), 2);

    // Winner block is now stored and becomes canonical; its actions finalize
    // and are cleared from the mempool (router does clear_finalized_actions).
    store_block_bodies(&store, winner_space, winner_content);
    store
        .put_root_block_with_fork_resolution(winner)
        .expect("store winner");
    assert_eq!(
        store.get_root_hash_at_height(1).unwrap(),
        Some(winner.hash()),
        "lower-hash winner is canonical"
    );
    for action in &winner_content.actions {
        store
            .mark_action_finalized(&BlockBuilder::action_hash(action), 1)
            .expect("finalize winner");
    }
    let cleared = builder.clear_finalized_actions(&winner_content.actions);
    assert_eq!(cleared, 1, "the shared action leaves the mempool");

    // THE GUARANTEE: the very next built block carries the loser's unique
    // action. This is the invariant that was violated in the height-365
    // incident (the action waited minutes for a holder to win a block).
    builder.reset_to_chain_tip(1, winner.hash(), winner.cumulative_pow);
    let (next_root, _, next_contents) = builder.build_root_block(TS + 60, [0xC3; 32], None);
    assert_eq!(next_root.height, 2);
    let next_actions: Vec<&Action> = next_contents.iter().flat_map(|c| &c.actions).collect();
    assert!(
        next_actions
            .iter()
            .any(|a| a.content_hash == loser_unique.content_hash),
        "loser's unique action MUST be in the next block — no orphan limbo"
    );
    assert!(
        !next_actions
            .iter()
            .any(|a| a.content_hash == shared.content_hash),
        "already-canonical action must NOT be re-mined (double inclusion)"
    );
}

#[test]
fn eligibility_window_staggers_forgers_on_bursty_traffic() {
    use swimchain::blocks::leader::{
        bytes_less_than, threshold_at_elapsed, threshold_for_percentage, BASE_STARTING_PCT,
        MAX_ELIGIBILITY_TIME,
    };

    // The old testnet window (45s): an action arriving 300s after the previous
    // block (a normal gap between play bursts) found the threshold at 100% —
    // EVERY node eligible, collision effectively guaranteed. This is the
    // regression we must never reintroduce on a multi-forger network.
    assert_eq!(
        threshold_at_elapsed(300, BASE_STARTING_PCT, 45),
        [0xFF; 32],
        "a 45s window is fully open at 300s — the collision regime"
    );

    // The mainnet-length window (8 min): at the same 300s, only a small slice
    // of the keyspace is eligible, so simultaneous forgers are the exception.
    let t = threshold_at_elapsed(300, BASE_STARTING_PCT, MAX_ELIGIBILITY_TIME);
    assert!(
        bytes_less_than(&t, &threshold_for_percentage(5.0)),
        "at 300s the 8-min window must keep eligibility under 5% of keyspace"
    );

    // And it still guarantees liveness: fully open once the window elapses.
    assert_eq!(
        threshold_at_elapsed(
            MAX_ELIGIBILITY_TIME,
            BASE_STARTING_PCT,
            MAX_ELIGIBILITY_TIME
        ),
        [0xFF; 32]
    );
}
