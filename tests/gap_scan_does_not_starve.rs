//! An unfillable run of low heights must not hide every height above it.
//!
//! `find_content_gap_heights` and `find_unapplied_heights` both walked
//! `0..=tip` and stopped at their cap. If the lowest `max` results are
//! permanently unfillable — content decayed off the network, or no peer holds
//! it — the scan returns the identical list every 30 seconds for ever and the
//! heights above them are never even examined. Their side effects never run,
//! their content is never requested, and nothing says so.
//!
//! It gets worse as a chain grows, which is exactly the property you do not
//! want in a scan that a node runs on a timer.
//!
//! The scans now resume from a rotating cursor, so per-call work stays bounded
//! while every height is eventually offered.

use swimchain::blocks::action::{Action, ActionType};
use swimchain::blocks::branch_path::BranchPath;
use swimchain::blocks::{ContentBlock, RootBlock, SpaceBlock};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

const SPACE: [u8; 32] = [0x42; 32];

fn action(ts: u64) -> Action {
    Action {
        action_type: ActionType::Reply,
        actor: [0xAA; 32],
        timestamp: ts,
        content_hash: Some([0x11; 32]),
        parent_id: Some([0x99; 32]),
        pow_nonce: ts,
        pow_work: 1,
        pow_target: [0u8; 32],
        signature: [7u8; 64],
        emoji: None,
        display_name: None,
        media_refs: vec![],
        replaces_pending: None,
        private: false,
    }
}

/// A block at `height` whose space block is present but whose CONTENT block is
/// deliberately not stored — i.e. a content gap.
fn block_with_missing_content(store: &ChainStore, height: u64, prev: [u8; 32]) -> RootBlock {
    let content = ContentBlock::new(
        [0x99; 32],
        SPACE,
        vec![action(1_000 + height)],
        None,
        1_000_000 + height,
        BranchPath::root(),
    )
    .expect("content block");
    // NOT stored — this is the gap.
    let content_hash = content.hash();

    let space = SpaceBlock {
        space_id: SPACE,
        merkle_root: content_hash,
        content_block_hashes: vec![content_hash],
        prev_space_hash: None,
        timestamp: 1_000_000 + height,
        total_pow: 1,
        content_block_count: 1,
    };
    let space_hash = store.put_space_block(&space).expect("put space");

    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_000_000 + height,
        merkle_root: space_hash,
        space_block_hashes: vec![space_hash],
        space_block_count: 1,
        total_pow: 1,
        cumulative_pow: height,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        block_creator: [0x11; 32],
    }
}

#[test]
fn a_wall_of_unfillable_low_gaps_does_not_hide_the_high_ones() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    // 40 blocks, EVERY one a content gap — the pathological case. With a cap
    // of 4 and a fixed scan start, heights 0..=3 would be the answer for ever
    // and heights 30-39 would never be seen.
    let mut prev = [0u8; 32];
    for h in 0..40u64 {
        let b = block_with_missing_content(&store, h, prev);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    let mut seen: std::collections::HashSet<u64> = std::collections::HashSet::new();
    for _ in 0..20 {
        for h in store.find_content_gap_heights(4).unwrap() {
            seen.insert(h);
        }
    }

    assert!(
        seen.iter().any(|h| *h >= 30),
        "repeated scans must eventually reach the HIGH heights; a fixed start \
         returns the same unfillable low ones for ever (seen: {seen:?})"
    );
    assert!(
        seen.len() > 4,
        "and must cover more than one capped window over time, got {}",
        seen.len()
    );
}

#[test]
fn each_call_stays_within_its_cap() {
    // Rotation must not cost more per call — this runs on a timer.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    for h in 0..30u64 {
        let b = block_with_missing_content(&store, h, prev);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    for _ in 0..5 {
        let gaps = store.find_content_gap_heights(4).unwrap();
        assert!(gaps.len() <= 4, "cap must hold, got {}", gaps.len());
    }
}

#[test]
fn results_are_sorted_so_a_range_request_makes_sense() {
    // The caller builds a height RANGE from first..last. A rotated, unsorted
    // list would ask for a backwards or absurd span.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    for h in 0..20u64 {
        let b = block_with_missing_content(&store, h, prev);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    for _ in 0..6 {
        let gaps = store.find_content_gap_heights(5).unwrap();
        let mut sorted = gaps.clone();
        sorted.sort_unstable();
        assert_eq!(gaps, sorted, "gap heights must come back ascending");
    }
}

#[test]
fn a_complete_chain_reports_no_gaps_however_often_it_is_asked() {
    // The quiet case: rotation must not manufacture phantom gaps.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    for h in 0..10u64 {
        // Store the content this time — no gaps at all.
        let content = ContentBlock::new(
            [0x99; 32],
            SPACE,
            vec![action(2_000 + h)],
            None,
            1_000_000 + h,
            BranchPath::root(),
        )
        .unwrap();
        let content_hash = store.put_content_block(&content).unwrap();
        let space = SpaceBlock {
            space_id: SPACE,
            merkle_root: content_hash,
            content_block_hashes: vec![content_hash],
            prev_space_hash: None,
            timestamp: 1_000_000 + h,
            total_pow: 1,
            content_block_count: 1,
        };
        let space_hash = store.put_space_block(&space).unwrap();
        let b = RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: prev,
            timestamp: 1_000_000 + h,
            merkle_root: space_hash,
            space_block_hashes: vec![space_hash],
            space_block_count: 1,
            total_pow: 1,
            cumulative_pow: h,
            difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
            height: h,
            block_creator: [0x11; 32],
        };
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    for _ in 0..8 {
        assert!(
            store.find_content_gap_heights(4).unwrap().is_empty(),
            "a complete chain must report nothing, on every call"
        );
    }
}
