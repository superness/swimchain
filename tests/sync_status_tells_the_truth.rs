//! A node that is holding a heavier chain it has not adopted must never
//! report itself synced.
//!
//! THE LIE THAT COST ELEVEN HOURS. `sync_state` is written by NOTHING — it is
//! initialised to `Idle` in node/manager.rs and every other reference in the
//! tree is a read. `get_sync_status` mapped `Idle` + any peer straight to
//! ("synced", 100). So on 2026-08-01 a mainnet seed that was 345 blocks
//! behind, sitting on a minority fork, holding 443 blocks of the heavier
//! chain it had failed to adopt, answered:
//!
//! ```text
//! Current sync state: synced
//! Progress: 100%
//! ```
//!
//! That is why a two-chain fleet ran unnoticed for three and a half days:
//! every user-visible read goes through content and mempool, which gossip
//! across all chains, and the one command an operator would run to check said
//! everything was fine.
//!
//! The node already knows better. These are the facts it can compute at any
//! moment, and this file pins that they are honest.

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
        cumulative_pow: 1, // the forgeable field; nothing here may consult it
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

#[test]
fn a_healthy_node_reports_no_forks_and_no_gaps() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 20, 5);

    assert_eq!(store.fork_branch_count(), 0);
    assert!(store.fork_ancestry_gaps(64).is_empty());
    assert!(store.heaviest_adoptable_fork_tip().is_none());
    // All three quiet => the status line may legitimately say "synced".
}

#[test]
fn a_node_sitting_on_an_unadopted_heavier_chain_is_not_synced() {
    // THE SEED'S EXACT STATE at 18:00 UTC on 2026-08-01.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10, 5);

    // A fully-linked heavier branch we hold and have not adopted.
    let mut prev = fork_point;
    let mut chain = Vec::new();
    for h in 11..=20u64 {
        let b = block(h, prev, 40, 0xBB);
        prev = b.hash();
        chain.push(b);
    }
    for b in chain.iter().rev() {
        store.put_root_block(b).unwrap();
    }

    assert!(
        store.heaviest_adoptable_fork_tip().is_some(),
        "the node is holding a heavier chain — reporting 'synced' here is the \
         bug that hid a two-chain fleet for three and a half days"
    );
    assert!(
        store.fork_branch_count() > 0,
        "and it must admit to the branch"
    );
}

#[test]
fn a_node_mid_assembly_reports_the_gaps_it_is_waiting_on() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 5);

    // The top of a competing branch, unlinked — assembly in progress.
    let mut prev = [0xEE; 32];
    for h in 30..=34u64 {
        let b = block(h, prev, 40, 0xBB);
        prev = b.hash();
        store.put_root_block(&b).unwrap();
    }

    assert!(
        !store.fork_ancestry_gaps(64).is_empty(),
        "an assembling node must report what it is still missing rather than \
         claiming 100%"
    );
    assert!(
        store.heaviest_adoptable_fork_tip().is_none(),
        "and must NOT claim the branch is adoptable while its weight is unknown"
    );
}

#[test]
fn the_signals_clear_once_the_branch_is_adopted() {
    // After a reorg the node is genuinely synced again, and the alarms must
    // fall silent — an alarm that never clears is one nobody reads.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10, 5);

    let mut prev = fork_point;
    let mut chain = Vec::new();
    for h in 11..=20u64 {
        let b = block(h, prev, 40, 0xBB);
        prev = b.hash();
        chain.push(b);
    }
    for b in chain.iter().rev() {
        store.put_root_block(b).unwrap();
    }
    let tip = chain.last().unwrap().clone();

    let (_h, adopted, _displaced) = store
        .put_root_block_with_fork_resolution_reporting(&tip)
        .unwrap();
    assert!(adopted);

    assert!(
        store.heaviest_adoptable_fork_tip().is_none(),
        "nothing left to adopt once we are on the heavier chain"
    );
    assert!(store.fork_ancestry_gaps(64).is_empty());
}
