//! A block we can verify must be kept, even when it sits above our canonical
//! height. Otherwise a fork branch can never grow past its first block.
//!
//! THE 2026-08-01 FORK DEADLOCK, final link. After fixing assembly (#252),
//! the formation gate and startup wedge (#254), deep-reorg re-anchoring
//! (#256), and the escalation gate (#257), a seed holding a 1562-block fork
//! was offered the fleet's 1901-block chain, correctly asked for it (1,623
//! locator syncs where there had been zero), received it — and stored none of
//! it:
//!
//! ```text
//! [BLOCK] Received BLOCKS from peer c4060cb1: 50 blocks
//! [BLOCK] Stored 0/50 root blocks, 0 space blocks, 0 content blocks
//! [BLOCK] REJECTED: Block 91729e78 at height 1564 too far ahead
//!         (our height: 1562) with invalid/null parent
//! ```
//!
//! The branch stored a block as an ORPHAN when its parent was UNKNOWN and
//! REJECTED it otherwise. So the first block of a fork branch (parent unknown)
//! was parked correctly, and the second — whose parent we now held — was
//! discarded as "too far ahead". The branch could never extend, its ancestry
//! never completed, its weight was never computable, and it was never adopted.
//! Every earlier fix in the chain was held shut by this one.
//!
//! A verifiable parent is the entire licence needed to keep a block. Being
//! above our canonical height is a fact about OUR chain, not a defect in
//! theirs.

use swimchain::blocks::RootBlock;
use swimchain::node::router::{far_ahead_disposition, FarAheadDisposition};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn block(height: u64, prev: [u8; 32], tag: u8) -> RootBlock {
    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_700_000_000 + height,
        merkle_root: [tag; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: 1,
        cumulative_pow: height,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        block_creator: [tag; 32],
    }
}

/// Canonical 0..=n, plus the hash of the tip.
fn canonical(store: &ChainStore, n: u64) -> [u8; 32] {
    let mut prev = [0u8; 32];
    for h in 0..=n {
        let b = block(h, prev, 0x11);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }
    prev
}

#[test]
fn a_fork_block_whose_parent_we_hold_is_stored_not_rejected() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let tip = canonical(&store, 10);

    // The fork's first block: parent is our height-5 block... but arriving as
    // a competing branch we park it as an orphan first. Simulate having taken
    // it in (raw, non-canonical) — this is the state after one locator batch.
    let fork_a = block(11, tip, 0xBB);
    store.put_root_block(&fork_a).unwrap();

    // ITS CHILD is the block the old code threw away: height 12 while our
    // canonical height is still 10, yet its parent (fork_a) is right there in
    // storage and verifiable.
    let fork_b = block(12, fork_a.hash(), 0xBB);
    assert_eq!(
        far_ahead_disposition(&store, &fork_b),
        FarAheadDisposition::Store,
        "a block whose parent we hold must be STORED even when it is above our \
         canonical height — rejecting it is what stopped fork branches growing \
         past their first block on 2026-08-01"
    );
}

#[test]
fn a_block_with_an_unknown_parent_is_parked_as_an_orphan() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10);

    // Nothing links this to anything we hold: park it and go fetch the parent.
    let stray = block(40, [0xEE; 32], 0xCC);
    assert_eq!(
        far_ahead_disposition(&store, &stray),
        FarAheadDisposition::Orphan
    );
}

#[test]
fn a_non_genesis_block_claiming_a_null_parent_is_rejected() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10);

    // Malformed: only genesis may have a null parent. This is the one case the
    // original REJECT message was actually describing.
    let bogus = block(50, [0u8; 32], 0xDD);
    assert_eq!(
        far_ahead_disposition(&store, &bogus),
        FarAheadDisposition::Reject
    );
}

#[test]
fn a_whole_fork_branch_can_assemble_one_batch_at_a_time() {
    // The property that actually matters: fed a branch in order, every block
    // after the first is storable, so the ancestry completes and fork choice
    // finally has something to weigh. Pre-fix this stalled at the first child.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10);

    let mut prev = fork_point;
    let mut stored = 0;
    for h in 11..=30u64 {
        let b = block(h, prev, 0xBB);
        match far_ahead_disposition(&store, &b) {
            FarAheadDisposition::Store | FarAheadDisposition::Orphan => {
                store.put_root_block(&b).unwrap();
                stored += 1;
            }
            FarAheadDisposition::Reject => panic!("branch block at {h} was rejected"),
        }
        prev = b.hash();
    }
    assert_eq!(stored, 20, "the whole branch must land, not just its head");

    // And with the ancestry complete, the branch's real weight is computable —
    // the precondition for adoption that the deadlock denied.
    let tip = store.get_root_block(&prev).unwrap().unwrap();
    assert!(
        store.chain_weight(&tip).unwrap().is_some(),
        "an assembled branch must have a computable weight"
    );
}
