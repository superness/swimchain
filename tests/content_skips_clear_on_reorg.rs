//! A "deliberately skipped" content mark is a judgement about the chain that
//! made it. A reorg must forget the ones it invalidates.
//!
//! `mark_content_block_skipped` records "these actions are already finalized in
//! another block, so this content need not be fetched". That is true only of
//! the canonical chain at the moment it was written. The tree is PERSISTED and
//! was write-only — no unmark function existed anywhere in the codebase — while
//! `root_content_complete` and `find_content_gap_heights` both treat a skipped
//! block as SATISFIED.
//!
//! So after a reorg: a content block skipped while the losing branch was
//! canonical stays skipped; the node reads a block as complete whose content it
//! does not hold; `reconcile_block_side_effects` "applies" it and marks it
//! done; and the backfill never re-requests it. Silent data loss.
//!
//! It went unnoticed because deep reorgs almost never completed — the eleven
//! fixes of 2026-08-01 are what make this reachable. Fixing convergence
//! without this would have traded a stall for quiet corruption.

use swimchain::storage::ChainStore;
use tempfile::tempdir;

#[test]
fn a_reorg_forgets_skips_made_at_or_above_the_fork_point() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let below = [0xA1; 32]; // skipped while the chain below the fork was built
    let at = [0xB2; 32]; // skipped by a block that is about to be displaced
    let above = [0xC3; 32]; // ditto, higher

    store.mark_content_block_skipped(&below, 5).unwrap();
    store.mark_content_block_skipped(&at, 10).unwrap();
    store.mark_content_block_skipped(&above, 30).unwrap();

    let cleared = store.clear_content_skips_at_or_above(10).unwrap();
    assert_eq!(cleared, 2, "both marks at or above the fork point must go");

    assert!(
        store.is_content_block_skipped(&below).unwrap(),
        "history below the fork point is untouched by the reorg, so its \
         judgements still hold"
    );
    assert!(
        !store.is_content_block_skipped(&at).unwrap(),
        "a skip claimed by a block that just lost must not survive it"
    );
    assert!(!store.is_content_block_skipped(&above).unwrap());
}

#[test]
fn clearing_is_idempotent_and_reports_nothing_the_second_time() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    store.mark_content_block_skipped(&[0xD4; 32], 20).unwrap();

    assert_eq!(store.clear_content_skips_at_or_above(10).unwrap(), 1);
    assert_eq!(
        store.clear_content_skips_at_or_above(10).unwrap(),
        0,
        "a second pass must be a no-op, so a reorg-heavy node does not churn"
    );
}

#[test]
fn a_node_with_no_skips_clears_nothing() {
    // The quiet case: this runs on every reorg, so it must cost nothing when
    // there is nothing to do.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    assert_eq!(store.clear_content_skips_at_or_above(1).unwrap(), 0);
}

#[test]
fn a_skip_marked_at_the_exact_fork_height_is_cleared() {
    // Boundary: the fork point itself is displaced, so a judgement made BY it
    // is invalid. Off-by-one here would leave the most likely stale mark of
    // all in place.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    let exact = [0xE5; 32];
    store.mark_content_block_skipped(&exact, 42).unwrap();

    assert_eq!(store.clear_content_skips_at_or_above(42).unwrap(), 1);
    assert!(!store.is_content_block_skipped(&exact).unwrap());
}
