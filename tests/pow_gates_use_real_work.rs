//! Every fork decision must rest on REAL accumulated work, never on the
//! `cumulative_pow` field carried in a block header.
//!
//! That field is not chain-cumulative. Canonical blocks carry per-block-ish
//! values while a solo block holding an hour of bot posts carried 8328 against
//! a real tip's 34 — which is exactly how the 2026-07-14 poisoning rolled the
//! fleet back 74 blocks and deleted the suffix. `chain_weight` walks the
//! stored ancestry and sums each block's own work, so it cannot be forged by a
//! number in a header.
//!
//! #257 removed the field from the block-data escalation gate. Two more
//! decisions were still reading it, found by auditing the whole pipeline
//! rather than waiting for the next outage:
//!
//! - the SAME-HEIGHT fork resolution, at both the block-data and blocks-batch
//!   sites — and this one does not merely skip a fetch, it ROLLS BACK a real
//!   block;
//! - the gossip BLOCK_ANNOUNCE trigger, which compared `announce.total_pow`
//!   ("the PoW aggregated in THIS block", tens) against our tip's claimed
//!   cumulative (thousands), so it was false on every real chain and the
//!   gossip path never escalated at all — the same failed-closed silence as
//!   #257, on the other trigger.

use swimchain::blocks::RootBlock;
use swimchain::node::router::{same_height_verdict, SameHeightVerdict};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn block(height: u64, prev: [u8; 32], own_pow: u64, claimed: u64, tag: u8) -> RootBlock {
    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_700_000_000 + height,
        merkle_root: [tag; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: own_pow,
        cumulative_pow: claimed,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        block_creator: [tag; 32],
    }
}

fn canonical(store: &ChainStore, n: u64, own_pow: u64) -> [u8; 32] {
    let mut prev = [0u8; 32];
    for h in 0..=n {
        let b = block(h, prev, own_pow, 10, 0x11);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }
    prev
}

#[test]
fn a_forged_cumulative_pow_cannot_displace_a_heavier_chain() {
    // THE 2026-07-14 SHAPE, at the tip. A solo block claims an enormous
    // cumulative_pow; its real ancestry is short. Believing the claim means
    // rolling back a real chain.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let tip_parent = canonical(&store, 9, 100); // ten blocks x 100 real work

    let existing = block(10, tip_parent, 100, 34, 0x11); // honest, modest claim
    store
        .put_root_block_with_fork_resolution(&existing)
        .unwrap();

    // The liar forks off height 5 — short ancestry, gigantic claim.
    let low = store.get_root_hash_at_height(5).unwrap().unwrap();
    let mut liar_prev = low;
    for h in 6..10u64 {
        let b = block(h, liar_prev, 1, 8328, 0xBB);
        liar_prev = b.hash();
        store.put_root_block(&b).unwrap();
    }
    let liar = block(10, liar_prev, 1, 8328, 0xBB);
    store.put_root_block(&liar).unwrap();

    assert_eq!(
        same_height_verdict(&store, &liar, &existing),
        SameHeightVerdict::ExistingHeavier,
        "a forged cumulative_pow must not win a same-height fork — believing it \
         is what deleted 74 blocks of the fleet's chain on 2026-07-14"
    );
}

#[test]
fn a_genuinely_heavier_same_height_block_still_wins() {
    // The guard must not become a blanket refusal: real work must still be
    // able to displace a lighter block at the same height, or honest forks
    // never resolve.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 5, 10);

    // Existing: one light block on top.
    let existing = block(6, fork_point, 1, 9999, 0x11);
    store
        .put_root_block_with_fork_resolution(&existing)
        .unwrap();

    // Incoming at the same height, same parent, but far more real work — and
    // a deliberately SMALLER claimed field, so only real weight can see it.
    let incoming = block(6, fork_point, 500, 1, 0xBB);
    store.put_root_block(&incoming).unwrap();

    assert_eq!(
        same_height_verdict(&store, &incoming, &existing),
        SameHeightVerdict::IncomingHeavier,
        "real work must still win, even when the claimed field says otherwise"
    );
}

#[test]
fn equal_real_work_is_a_tie_for_the_deterministic_breaker() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 5, 10);

    let a = block(6, fork_point, 50, 111, 0xAA);
    let b = block(6, fork_point, 50, 222, 0xBB);
    store.put_root_block(&a).unwrap();
    store.put_root_block(&b).unwrap();

    assert_eq!(
        same_height_verdict(&store, &a, &b),
        SameHeightVerdict::Tie,
        "equal real work must fall through to the content-aware tiebreak, not \
         be decided by whichever claimed number is larger"
    );
}

#[test]
fn an_unweighable_block_is_a_tie_never_a_win() {
    // Incomplete ancestry means we cannot verify anything about this block's
    // history. That must never buy it a rollback of a real one.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let tip_parent = canonical(&store, 5, 10);

    let existing = block(6, tip_parent, 10, 60, 0x11);
    store
        .put_root_block_with_fork_resolution(&existing)
        .unwrap();

    // Parent unknown => weight unknowable, claim enormous.
    let stranger = block(6, [0xEE; 32], 1, u64::MAX, 0xCC);
    store.put_root_block(&stranger).unwrap();

    assert_eq!(
        same_height_verdict(&store, &stranger, &existing),
        SameHeightVerdict::Tie,
        "a block whose history we cannot verify must never win on its own claim"
    );
}
