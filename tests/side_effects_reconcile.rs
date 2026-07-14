//! Storage-level tests for the content-apply-consistency redesign:
//! side-effects-applied state tracking, reorg unmarking of displaced blocks'
//! finalized actions, and stale-mark detection — the ChainStore half of the
//! reconcile_block_side_effects() design (see
//! docs/handoffs/2026-07-13-content-apply-consistency-and-profile-edit.md).

use swimchain::blocks::action::Action;
use swimchain::blocks::branch_path::BranchPath;
use swimchain::blocks::builder::BlockBuilder;
use swimchain::blocks::{ContentBlock, RootBlock, SpaceBlock};
use swimchain::storage::chain::ChainStore;

use tempfile::TempDir;

fn temp_chain_store() -> (TempDir, ChainStore) {
    let dir = TempDir::new().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();
    (dir, store)
}

/// Full root -> space -> content hierarchy around one Sponsor action.
/// `pow` controls cumulative_pow so tests can build competing forks.
fn build_block(
    seed: u8,
    height: u64,
    prev: [u8; 32],
    pow: u64,
) -> (RootBlock, SpaceBlock, ContentBlock) {
    let sponsor = [seed; 32];
    let sponsee = [seed.wrapping_add(1); 32];
    let action = Action::new_sponsor(sponsor, sponsee, 1_700_000_000 + u64::from(seed), [4u8; 64]);

    let space_id = [0u8; 32];
    let content = ContentBlock::new(
        action.hash(),
        space_id,
        vec![action],
        None,
        1_700_000_000,
        BranchPath::root(),
    )
    .unwrap();

    let space = SpaceBlock::from_content_blocks(
        space_id,
        std::slice::from_ref(&content),
        None,
        1_700_000_000,
    );

    let mut root = RootBlock::from_space_blocks(
        std::slice::from_ref(&space),
        prev,
        0,
        1_700_000_000,
        1,
        height,
        [0u8; 32],
    );
    // from_space_blocks derives cumulative_pow from the space blocks; force
    // the fork weight the test wants.
    root.cumulative_pow = pow;

    (root, space, content)
}

/// Store the full hierarchy and canonicalize the root.
fn store_full(store: &ChainStore, root: &RootBlock, space: &SpaceBlock, content: &ContentBlock) {
    store.put_space_block(space).unwrap();
    store.put_content_block(content).unwrap();
    store.put_root_block_with_fork_resolution(root).unwrap();
}

// ============================================================================
// side_effects_state / applied flag
// ============================================================================

#[test]
fn test_side_effects_state_roundtrip() {
    let (_dir, store) = temp_chain_store();
    let hash = [0xAB; 32];

    assert_eq!(store.side_effects_state(&hash).unwrap(), 0);
    assert!(!store.side_effects_applied(&hash).unwrap());

    store.set_side_effects_state(&hash, 7, 1).unwrap();
    assert_eq!(store.side_effects_state(&hash).unwrap(), 1);
    assert!(!store.side_effects_applied(&hash).unwrap());

    store.set_side_effects_state(&hash, 7, 2).unwrap();
    assert_eq!(store.side_effects_state(&hash).unwrap(), 2);
    assert!(store.side_effects_applied(&hash).unwrap());

    store.clear_side_effects_applied(&hash).unwrap();
    assert_eq!(store.side_effects_state(&hash).unwrap(), 0);
}

#[test]
fn test_root_content_complete() {
    let (_dir, store) = temp_chain_store();
    let (root, space, content) = build_block(0x10, 0, [0u8; 32], 5);

    // Nothing stored: incomplete.
    assert!(!store.root_content_complete(&root).unwrap());

    // Space stored but content missing: still incomplete.
    store.put_space_block(&space).unwrap();
    assert!(!store.root_content_complete(&root).unwrap());

    // Content stored: complete.
    store.put_content_block(&content).unwrap();
    assert!(store.root_content_complete(&root).unwrap());
}

#[test]
fn test_find_unapplied_heights() {
    let (_dir, store) = temp_chain_store();
    let (root, space, content) = build_block(0x20, 0, [0u8; 32], 5);
    store_full(&store, &root, &space, &content);

    // Canonical block with no applied flag shows up.
    assert_eq!(store.find_unapplied_heights(64).unwrap(), vec![0]);

    // Fully applied blocks drop out of the scan.
    store.set_side_effects_state(&root.hash(), 0, 2).unwrap();
    assert!(store.find_unapplied_heights(64).unwrap().is_empty());

    // Stage 1 (sponsorship pending) still needs reconciliation.
    store.set_side_effects_state(&root.hash(), 0, 1).unwrap();
    assert_eq!(store.find_unapplied_heights(64).unwrap(), vec![0]);
}

// ============================================================================
// Reorg unmarking (the cross-height dup-gate poisoning fix)
// ============================================================================

/// A reorg through make_canonical (put_root_block_with_fork_resolution on a
/// heavier competing block) must unmark the displaced block's finalized
/// actions and clear its applied flag — otherwise the displaced marks poison
/// the duplicate gates and the new canonical content is skipped forever (the
/// 30s content-backfill loop observed on the phone).
#[test]
fn test_reorg_unmarks_displaced_block_actions() {
    let (_dir, store) = temp_chain_store();

    // Chain A: canonical block at height 0, actions finalized, side effects applied.
    let (root_a, space_a, content_a) = build_block(0x30, 0, [0u8; 32], 5);
    store_full(&store, &root_a, &space_a, &content_a);
    store
        .mark_content_block_actions_finalized(&content_a, 0)
        .unwrap();
    store.set_side_effects_state(&root_a.hash(), 0, 2).unwrap();

    let action_a_hash = BlockBuilder::action_hash(&content_a.actions[0]);
    assert_eq!(store.is_action_finalized(&action_a_hash).unwrap(), Some(0));

    // Competing heavier block B displaces A at height 0.
    let (root_b, space_b, content_b) = build_block(0x40, 0, [0u8; 32], 50);
    store.put_space_block(&space_b).unwrap();
    store.put_content_block(&content_b).unwrap();
    let (_, is_new_tip) = store.put_root_block_with_fork_resolution(&root_b).unwrap();
    assert!(is_new_tip, "heavier fork must win");

    // Displaced block A: marks gone, applied flag cleared.
    assert_eq!(store.is_action_finalized(&action_a_hash).unwrap(), None);
    assert!(!store.side_effects_applied(&root_a.hash()).unwrap());
}

/// The unmark is height-guarded: an action re-marked at a DIFFERENT height by
/// a surviving block must keep that mark when the old block is displaced.
#[test]
fn test_reorg_unmark_preserves_marks_at_other_heights() {
    let (_dir, store) = temp_chain_store();

    let (root_a, space_a, content_a) = build_block(0x50, 0, [0u8; 32], 5);
    store_full(&store, &root_a, &space_a, &content_a);

    // The same action is (also) finalized at height 9 — e.g. the new chain
    // already re-included and re-marked it.
    let action_hash = BlockBuilder::action_hash(&content_a.actions[0]);
    store.mark_action_finalized(&action_hash, 9).unwrap();

    // Displace A.
    let (root_b, space_b, content_b) = build_block(0x60, 0, [0u8; 32], 50);
    store.put_space_block(&space_b).unwrap();
    store.put_content_block(&content_b).unwrap();
    store.put_root_block_with_fork_resolution(&root_b).unwrap();

    // Mark at height 9 (not A's height 0) survives.
    assert_eq!(store.is_action_finalized(&action_hash).unwrap(), Some(9));
}

// ============================================================================
// Stale-mark detection (canonical_block_contains_action)
// ============================================================================

#[test]
fn test_canonical_block_contains_action() {
    let (_dir, store) = temp_chain_store();
    let (root, space, content) = build_block(0x70, 0, [0u8; 32], 5);

    // No canonical block at the height: unverifiable.
    let action_hash = BlockBuilder::action_hash(&content.actions[0]);
    assert_eq!(
        store
            .canonical_block_contains_action(0, &action_hash)
            .unwrap(),
        None
    );

    // Canonical header without content: still unverifiable (never treat a
    // mark as stale without proof).
    store.put_root_block_with_fork_resolution(&root).unwrap();
    assert_eq!(
        store
            .canonical_block_contains_action(0, &action_hash)
            .unwrap(),
        None
    );

    // Content complete: contained action verifies true, foreign hash false.
    store.put_space_block(&space).unwrap();
    store.put_content_block(&content).unwrap();
    assert_eq!(
        store
            .canonical_block_contains_action(0, &action_hash)
            .unwrap(),
        Some(true)
    );
    assert_eq!(
        store
            .canonical_block_contains_action(0, &[0xEE; 32])
            .unwrap(),
        Some(false)
    );
}
