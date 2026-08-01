//! A partially-fetched fork branch must be able to say what it is missing.
//!
//! THE 2026-08-01 STRANDED BRANCH. After five fixes, the mainnet seed finally
//! asked for the fleet's chain, kept what arrived, and assembled 342 of its
//! blocks. Then it stopped — permanently:
//!
//! ```text
//! root_block_count: 2143   (342 of them the fleet's)
//! latest_height:    1563   (its own, lower chain)
//! $ sw sync now
//! Current sync state: synced
//! Progress: 100%
//! ```
//!
//! It held the TOP of the competing branch and needed ~480 blocks BELOW what
//! it had. Nothing asked for them. Fetching a missing parent was purely
//! event-driven — the router requested one only at the instant a block arrived
//! whose parent was unknown — so on an idle chain, with no further gossip to
//! react to, the branch sat half-built for ever while the node reported itself
//! synced at its own lower tip.
//!
//! Forward assembly had already been given a retry path (#252 put fork tips in
//! the locator, so a peer streams what comes AFTER what we hold). This is the
//! other direction: the branch's ROOT, and the parent hash it is waiting on.

use swimchain::blocks::RootBlock;
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
fn a_branch_missing_its_lower_half_reports_the_parent_it_waits_on() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 10);

    // The seed's exact shape: we hold the TOP of a competing branch (heights
    // 20..=25) and none of what links it to shared history.
    let mut chain: Vec<RootBlock> = Vec::new();
    let mut prev = [0xEE; 32]; // a parent we do NOT hold — the branch's root gap
    let root_gap = prev;
    for h in 20..=25u64 {
        let b = block(h, prev, 0xBB);
        prev = b.hash();
        chain.push(b);
    }
    for b in &chain {
        store.put_root_block(b).unwrap();
    }

    let gaps = store.fork_ancestry_gaps(8);
    assert!(
        gaps.iter().any(|(_, h)| *h == root_gap),
        "the branch's missing parent must be reported so something can fetch it \
         — without this a half-built branch is stranded for ever (2026-08-01)"
    );
    assert_eq!(
        gaps.len(),
        1,
        "only the branch ROOT is missing; its interior links to itself"
    );
}

#[test]
fn a_fully_linked_store_wants_nothing() {
    // The quiet case: no gaps means no requests, so this cannot become a
    // permanent background fetch storm on a healthy node.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let tip = canonical(&store, 20);

    // A competing branch that DOES link to shared history.
    let mut prev = tip;
    for h in 21..=24u64 {
        let b = block(h, prev, 0xBB);
        prev = b.hash();
        store.put_root_block(&b).unwrap();
    }

    assert!(
        store.fork_ancestry_gaps(8).is_empty(),
        "a store whose every block links must ask for nothing"
    );
}

#[test]
fn the_gap_list_is_bounded_and_deterministic() {
    // Branches are cheap for a hostile peer to manufacture; the retry list
    // must not grow with them, and two nodes with the same store must produce
    // the same list.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    canonical(&store, 5);

    for i in 0..20u8 {
        let b = block(100 + u64::from(i), [i.wrapping_add(0x40); 32], 0xCC);
        store.put_root_block(&b).unwrap();
    }

    let first = store.fork_ancestry_gaps(6);
    assert_eq!(first.len(), 6, "the list must respect its limit");
    assert_eq!(first, store.fork_ancestry_gaps(6), "and be deterministic");
}

#[test]
fn filling_a_gap_removes_it_so_the_walk_advances() {
    // The loop this enables: ask for the parent, store it, ask for ITS parent.
    // Each fetch must shrink the list, or a retry loop would spin for ever on
    // the same hash.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let shared = canonical(&store, 10);

    // Branch root at 13, two links above it; 11 and 12 are the missing middle.
    let b11 = block(11, shared, 0xBB);
    let b12 = block(12, b11.hash(), 0xBB);
    let b13 = block(13, b12.hash(), 0xBB);
    store.put_root_block(&b13).unwrap();

    assert_eq!(store.fork_ancestry_gaps(4), vec![(13, b12.hash())]);

    store.put_root_block(&b12).unwrap();
    assert_eq!(
        store.fork_ancestry_gaps(4),
        vec![(12, b11.hash())],
        "filling one gap must expose the next, not repeat the last"
    );

    store.put_root_block(&b11).unwrap();
    assert!(
        store.fork_ancestry_gaps(4).is_empty(),
        "a branch linked to shared history wants nothing more"
    );

    // And now the branch is weighable — the whole point of the exercise.
    assert!(store.chain_weight(&b13).unwrap().is_some());
}
