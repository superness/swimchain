//! A peer's headers must not become our canonical chain by arriving.
//!
//! `handle_headers` used to `put_root_block` each header and then call
//! `index_height` directly — splicing a peer's claimed chain into OUR
//! canonical height index with no weight comparison, no check that it links
//! to anything we hold, and no best-tip update. `verify_header_chain`
//! validates the batch's INTERNAL linkage, not its relationship to us.
//!
//! The damage is quiet and compounding:
//!
//! - `get_latest_height` jumps to a height whose ancestry we do not have;
//! - `best_tip` and the height index now disagree;
//! - `chain_weight` returns None for our OWN tip, because its ancestry has a
//!   hole — which drops `is_heavier_than_best_tip` into the `cumulative_pow`
//!   fallback, the one field this entire family of fixes exists to distrust;
//! - the inflated height feeds the far-ahead tests that decide whether an
//!   incoming block is stored at all.
//!
//! Fork resolution already knows how to do this safely, so headers now go
//! through it: stored always, canonical only on complete ancestry and greater
//! real weight.

use swimchain::blocks::RootBlock;
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

/// What the handler does now: store through fork resolution, never index
/// directly.
fn accept_header(store: &ChainStore, header: &RootBlock) {
    store
        .put_root_block_with_fork_resolution_reporting(header)
        .unwrap();
}

#[test]
fn unlinked_headers_do_not_become_our_canonical_chain() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 100);
    assert_eq!(store.get_latest_height().unwrap(), Some(10));

    // A peer's headers for a chain we hold NOTHING of: internally consistent,
    // far above us, and claiming a huge weight.
    let mut prev = [0xEE; 32];
    for h in 50..=60u64 {
        let header = block(h, prev, 1, u64::MAX, 0xBB);
        prev = header.hash();
        accept_header(&store, &header);
    }

    assert_eq!(
        store.get_latest_height().unwrap(),
        Some(10),
        "a peer's unlinked headers must NOT advance our canonical height — \
         doing so put a hole in our own tip's ancestry and dropped fork \
         choice into the cumulative_pow fallback"
    );
    let tip = store.get_best_tip_block().unwrap().unwrap();
    assert_eq!(tip.height, 10, "and must not move the best tip");
    assert!(
        store.chain_weight(&tip).unwrap().is_some(),
        "our own tip must remain weighable — the corruption this prevents"
    );
}

#[test]
fn headers_that_link_and_outweigh_us_are_adopted_normally() {
    // The feature must still work: headers-first sync exists so a node can
    // learn the chain shape before fetching bodies.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let fork_point = canonical(&store, 10, 5);

    let mut prev = fork_point;
    for h in 11..=20u64 {
        let header = block(h, prev, 50, 1, 0xBB); // real work, modest claim
        prev = header.hash();
        accept_header(&store, &header);
    }

    assert_eq!(
        store.get_latest_height().unwrap(),
        Some(20),
        "headers that link to us and carry more real work are adopted"
    );
}

#[test]
fn headers_are_still_stored_so_they_can_be_reconsidered() {
    // Refusing to make them canonical must not mean throwing them away: they
    // are the branch the ancestry backfill will complete, and the periodic
    // adoption pass will then weigh.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 100);

    let stray = block(50, [0xEE; 32], 1, 999, 0xBB);
    accept_header(&store, &stray);

    assert!(
        store.get_root_block(&stray.hash()).unwrap().is_some(),
        "an unlinked header must be KEPT — it is a branch under assembly"
    );
    assert!(
        !store.fork_ancestry_gaps(8).is_empty(),
        "and it must register as ancestry we are missing"
    );
}

#[test]
fn a_lighter_linked_header_chain_does_not_displace_us() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10, 100);

    // Links to our height 5, but carries far less work while claiming more.
    let low = store.get_root_hash_at_height(5).unwrap().unwrap();
    let mut prev = low;
    for h in 6..=12u64 {
        let header = block(h, prev, 1, u64::MAX, 0xCC);
        prev = header.hash();
        accept_header(&store, &header);
    }

    assert_eq!(
        store.get_latest_height().unwrap(),
        Some(10),
        "a linked but lighter header chain must not win on its claim"
    );
}
