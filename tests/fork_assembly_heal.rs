//! A competing fork must be ASSEMBLABLE, and once assembled and genuinely
//! heavier, ADOPTABLE.
//!
//! Regression for the 2026-07-28 fleet split. Two nodes minted height 1081
//! 140 seconds apart (fleet's at 06:47:50 with pow 9, seed's at 06:50:10 with
//! pow 6 — the fleet's was both earlier and heavier). The seed had already
//! moved past 1081 when the fleet's block arrived, so `deep_fork_blocked`
//! refused it as a below-tip displacement, and the two chains ran in parallel
//! for 3.5 days and 700+ blocks. Every user-visible read (content, mempool)
//! gossips across both chains, so nothing surfaced until a restart forced each
//! node to declare a side.
//!
//! Two independent defects kept it from healing, both covered here:
//!
//! 1. ASSEMBLY DEADLOCK. `generate_locator` walked only the canonical height
//!    index, so a peer's common-ancestor search always landed on the fork
//!    POINT (1080) and always streamed the same first batch of fork blocks.
//!    Those stored non-canonically, our canonical chain never moved, and the
//!    next locator was byte-identical — so a fork deeper than one batch could
//!    never be fetched, no matter how many rounds ran. The locator must also
//!    carry the tips of fork branches we are assembling.
//!
//! 2. NO WEIGHT ESCAPE HATCH. `deep_fork_blocked` refused every below-tip
//!    displacement unconditionally — correct for the 2026-07-14 poisoning
//!    (a forged `cumulative_pow` rolled the fleet back 74 blocks), but it
//!    never consulted `chain_weight`, which has walked real ancestry since
//!    2026-07-15 and CANNOT be forged (it sums locally-stored ancestors).
//!    A fork whose real weight we can compute and that genuinely outweighs us
//!    must be adoptable.

use swimchain::blocks::RootBlock;
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn block_at(height: u64, prev: [u8; 32], own_pow: u64, salt: u64) -> RootBlock {
    RootBlock {
        version: 1,
        prev_root_hash: prev,
        timestamp: 1700000000 + height * 10 + salt,
        merkle_root: [0u8; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: own_pow,
        // Deliberately meaningless: this is the field the 2026-07-14 poisoning
        // forged, and nothing in the adoption path may trust it.
        cumulative_pow: 1,
        difficulty_target: 30,
        height,
        block_creator: [salt as u8; 32],
    }
}

/// Canonical chain 0..=n, each block worth `own_pow`.
///
/// The best tip is set explicitly. Without it `get_best_tip_block` returns
/// None and `is_heavier_than_best_tip` answers "no tip yet, anything is
/// heavier" — which made the first draft of the weight tests here pass
/// against a store that had never judged anything. Vacuous tests are how the
/// bug under test survives.
fn build_canonical(store: &ChainStore, n: u64, own_pow: u64) -> Vec<[u8; 32]> {
    let mut hashes = Vec::new();
    let mut prev = [0u8; 32];
    for h in 0..=n {
        let b = block_at(h, prev, own_pow, 0);
        let hash = b.hash();
        store.put_root_block(&b).unwrap();
        store.index_height(h, hash).unwrap();
        prev = hash;
        hashes.push(hash);
    }
    store.set_best_tip(hashes.last().unwrap()).unwrap();
    hashes
}

/// A competing branch off `fork_parent`, stored but NOT height-indexed —
/// exactly how the router files a losing same-height block
/// ("[FORK] Storing non-canonical block ... for orphan resolution").
fn build_fork(
    store: &ChainStore,
    fork_parent: [u8; 32],
    fork_height: u64,
    len: u64,
    own_pow: u64,
) -> Vec<(RootBlock, [u8; 32])> {
    let mut out = Vec::new();
    let mut prev = fork_parent;
    for i in 0..len {
        let b = block_at(fork_height + i, prev, own_pow, 7);
        let hash = b.hash();
        store.put_root_block(&b).unwrap();
        prev = hash;
        out.push((b, hash));
    }
    out
}

// ---------------------------------------------------------------------------
// 1) THE ASSEMBLY DEADLOCK.
// ---------------------------------------------------------------------------

#[test]
fn locator_carries_fork_tips_so_assembly_can_advance() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Canonical 0..=40; a fork off height 20 that we have partially fetched
    // (blocks 21..=30 stored non-canonically).
    let canon = build_canonical(&store, 40, 5);
    let fork = build_fork(&store, canon[20], 21, 10, 9);

    let locator = store.generate_locator().unwrap();

    // The pre-fix locator was canonical-only: a peer holding the full fork
    // would find the common ancestor at 20 and re-send blocks we already have,
    // forever. The deepest fork block we hold must appear, so the peer's
    // search advances to it and streams what comes AFTER.
    let fork_tip = fork.last().unwrap().1;
    assert!(
        locator.contains(&fork_tip),
        "locator must carry the tip of a fork branch being assembled, else the \
         peer restarts from the fork point every round and assembly never advances"
    );

    // Canonical anchors must survive — a locator that lost them could not find
    // a common ancestor with a peer on OUR chain.
    assert!(locator.contains(&canon[40]), "canonical tip must remain");
    assert!(locator.contains(&canon[0]), "genesis must remain");
}

#[test]
fn locator_stays_bounded_with_many_forks() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let canon = build_canonical(&store, 60, 5);

    // Twelve competing branches — a hostile peer can manufacture these cheaply,
    // so the locator must not grow without bound.
    for (i, h) in (5..=55).step_by(4).enumerate() {
        build_fork(&store, canon[h], (h + 1) as u64, 3, 9 + i as u64);
    }

    let locator = store.generate_locator().unwrap();
    assert!(
        locator.len() <= 32,
        "locator must stay bounded regardless of how many forks are stored, got {}",
        locator.len()
    );
}

#[test]
fn locator_entries_are_always_blocks_we_hold() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    build_canonical(&store, 30, 5);

    let locator = store.generate_locator().unwrap();
    assert!(!locator.is_empty(), "sanity");
    for h in locator.iter() {
        assert!(
            store.get_root_block(h).unwrap().is_some(),
            "every locator entry must be a block we actually hold"
        );
    }
}

// ---------------------------------------------------------------------------
// 2) THE WEIGHT ESCAPE HATCH — chain_weight is the only trusted judge.
// ---------------------------------------------------------------------------

#[test]
fn real_weight_sees_through_a_forged_cumulative_pow() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Our chain: 0..=10, five work each.
    let canon = build_canonical(&store, 10, 5);
    let tip = store.get_root_block(&canon[10]).unwrap().unwrap();
    let tip_weight = store.chain_weight(&tip).unwrap().unwrap();

    // The 2026-07-14 attack shape: ONE block off an early ancestor claiming an
    // enormous cumulative_pow. Its real weight is ancestry + its own work.
    let mut liar = block_at(6, canon[5], 1, 9);
    liar.cumulative_pow = u64::MAX;
    store.put_root_block(&liar).unwrap();

    let liar_weight = store.chain_weight(&liar).unwrap().unwrap();
    assert!(
        liar_weight < tip_weight,
        "a forged cumulative_pow must not survive real weight: liar {} vs tip {}",
        liar_weight,
        tip_weight
    );
    assert!(
        !store.is_heavier_than_best_tip(&liar).unwrap(),
        "and the store's comparison must refuse it"
    );
}

#[test]
fn an_assembled_heavier_fork_outweighs_our_tip() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Ours: 0..=10 at 5 work each.
    let canon = build_canonical(&store, 10, 5);
    let tip = store.get_root_block(&canon[10]).unwrap().unwrap();
    let tip_weight = store.chain_weight(&tip).unwrap().unwrap();

    // Theirs: off height 5, ten blocks at 9 work each — the 2026-07-28 shape
    // (their block was heavier AND earlier; ours only won by arriving second).
    let fork = build_fork(&store, canon[5], 6, 10, 9);
    let fork_tip = &fork.last().unwrap().0;
    let fork_weight = store.chain_weight(fork_tip).unwrap().unwrap();

    assert!(
        fork_weight > tip_weight,
        "an assembled fork with more real work must outweigh our tip: {} vs {}",
        fork_weight,
        tip_weight
    );
    assert!(
        store.is_heavier_than_best_tip(fork_tip).unwrap(),
        "and the store's own comparison must agree — this is the adoption trigger"
    );
}

#[test]
fn an_unassembled_fork_is_never_adoptable() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    build_canonical(&store, 10, 5);

    // A block whose parent we do not hold: weight unknowable. Unknowable must
    // read as "not heavier" — never as an invitation to reorg.
    let orphan = block_at(11, [0xAB; 32], 1_000_000, 3);
    store.put_root_block(&orphan).unwrap();

    assert!(
        store.chain_weight(&orphan).unwrap().is_none(),
        "weight must be None while ancestry is missing"
    );
    assert!(
        !store.is_heavier_than_best_tip(&orphan).unwrap(),
        "an un-assembled fork must never be adoptable, whatever it claims"
    );
}
