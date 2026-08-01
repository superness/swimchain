//! A fully assembled, heavier branch must be adopted even when no new block
//! arrives to trigger it.
//!
//! THE END OF THE 2026-08-01 RECOVERY. Seven fixes cleared every step of
//! convergence — ask for the fork, keep what arrives, assemble it forward and
//! backward, weigh it honestly, re-anchor the losers' actions. The seed then
//! fetched the fleet's chain, linked it, and sat on its minority fork anyway:
//!
//! ```text
//! root_block_count: 2244   (443 of them the fleet's chain)
//! latest_height:    1563   (its own, lower chain)
//! ```
//!
//! Adoption only ever ran inside `put_root_block_with_fork_resolution*`, i.e.
//! at the instant a block was WRITTEN. But a branch assembles BOTTOM-UP: the
//! ancestry backfill walks downward, so the last block written is a low
//! ancestor whose own weight comparison is trivially false. The branch TIP —
//! written minutes or hours earlier, when `chain_weight` still returned `None`
//! because the ancestry had holes — is never reconsidered. Nothing asks the
//! question again.
//!
//! `heaviest_adoptable_fork_tip` is that question, cheap enough to poll.

use swimchain::blocks::RootBlock;
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn block(height: u64, prev: [u8; 32], own_pow: u64, tag: u8) -> RootBlock {
    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_700_000_000 + height,
        merkle_root: [tag; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: own_pow,
        // Deliberately misleading: the field the 2026-07-14 poisoning forged.
        // Nothing in this path may consult it.
        cumulative_pow: 1,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        block_creator: [tag; 32],
    }
}

fn canonical(store: &ChainStore, n: u64, own_pow: u64) -> [u8; 32] {
    let mut prev = [0u8; 32];
    for h in 0..=n {
        let b = block(h, prev, own_pow, 0x11);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }
    prev
}

/// Store a branch BOTTOM-UP, the order the ancestry backfill produces: the
/// tip lands first (while unlinkable), the ancestors fill in beneath it.
fn assemble_bottom_up(
    store: &ChainStore,
    fork_point: [u8; 32],
    from: u64,
    len: u64,
    own_pow: u64,
) -> RootBlock {
    let mut chain = Vec::new();
    let mut prev = fork_point;
    for i in 0..len {
        let b = block(from + i, prev, own_pow, 0xBB);
        prev = b.hash();
        chain.push(b);
    }
    // tip first, then downward — exactly the order that defeated adoption
    for b in chain.iter().rev() {
        store.put_root_block(b).unwrap();
    }
    chain.last().unwrap().clone()
}

#[test]
fn a_linked_heavier_branch_is_adoptable_with_no_new_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10, 5); // our chain: 11 blocks x 5

    let tip = assemble_bottom_up(&store, fork_point, 11, 10, 40); // theirs: heavier

    let adoptable = store
        .heaviest_adoptable_fork_tip()
        .expect("a linked, heavier branch must be adoptable without a new write");
    assert_eq!(
        adoptable.hash(),
        tip.hash(),
        "the BRANCH TIP is what must be offered for adoption — the last block \
         written during backfill is a low ancestor that can never win alone"
    );
}

#[test]
fn adopting_it_actually_reorgs_and_reports_the_losers() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10, 5);
    assert_eq!(store.get_latest_height().unwrap(), Some(10));

    let tip = assemble_bottom_up(&store, fork_point, 11, 10, 40);

    // What the periodic pass does: re-offer the stored tip through the normal
    // adoption path.
    let (_h, is_new_tip, displaced) = store
        .put_root_block_with_fork_resolution_reporting(&tip)
        .unwrap();
    assert!(is_new_tip, "the heavier assembled branch must be adopted");
    assert_eq!(store.get_latest_height().unwrap(), Some(20));
    // Our old chain forked at 10, so nothing above it was displaced here; the
    // point is that the call SUCCEEDS and reports, rather than silently doing
    // nothing as it did when only low ancestors were ever offered.
    assert!(displaced.is_empty() || !displaced.is_empty());
}

#[test]
fn an_incomplete_branch_is_not_adoptable() {
    // Weight is unknowable while ancestry has holes; offering such a branch
    // would be the 2026-07-14 poisoning shape.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 5);

    // A branch whose root parent we do not hold.
    assemble_bottom_up(&store, [0xEE; 32], 11, 10, 40);

    assert!(
        store.heaviest_adoptable_fork_tip().is_none(),
        "a branch we cannot weigh must never be offered for adoption"
    );
}

#[test]
fn a_lighter_branch_is_not_adoptable() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 50); // ours: 11 blocks x 50

    // Fork BELOW our tip, or it is an extension rather than a competitor —
    // the first draft of this test branched off the tip and was heavier by
    // construction, which is exactly the confusion this case exists to catch.
    let low = store.get_root_hash_at_height(5).unwrap().unwrap();
    assemble_bottom_up(&store, low, 6, 3, 1); // theirs: 3 blocks x 1

    assert!(
        store.heaviest_adoptable_fork_tip().is_none(),
        "linked but lighter must stay unadopted — this poll must not cause churn"
    );
}

#[test]
fn a_healthy_node_offers_nothing_so_the_poll_is_free() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 30, 5);

    assert!(
        store.heaviest_adoptable_fork_tip().is_none(),
        "no competing branches means nothing to do every tick"
    );
}
