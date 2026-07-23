//! Block Building Integration Tests
//!
//! Tests that individual actions accumulate into blocks correctly.
//! Per SPEC_08, the block hierarchy is:
//! - RootBlock (formed when total PoW reaches threshold)
//!   - SpaceBlock (per space with activity)
//!     - ContentBlock (per thread with actions)
//!       - Actions (individual posts, replies, engagements)

use swimchain::blocks::action::{Action, ActionType};
use swimchain::blocks::branch_path::BranchPath;
use swimchain::blocks::builder::BlockBuilder;

// ============================================================================
// Unit Tests - BlockBuilder Core Logic
// ============================================================================

fn make_test_action(actor: [u8; 32], pow_work: u64, timestamp: u64) -> Action {
    Action {
        action_type: ActionType::Post,
        actor,
        timestamp,
        content_hash: Some([0u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
        private: false,
    }
}

#[test]
fn test_single_action_accumulation() {
    let mut builder = BlockBuilder::new(30); // 30s threshold

    let action = make_test_action([1u8; 32], 10, 1000);
    builder.add_action([1u8; 32], [2u8; 32], action, BranchPath::root());

    assert_eq!(builder.pending_action_count(), 1);
    assert_eq!(builder.pending_thread_count(), 1);
    assert_eq!(builder.total_pow(), 10);
    assert!(!builder.is_threshold_met());
}

#[test]
fn test_multiple_actions_same_thread() {
    let mut builder = BlockBuilder::new(30);
    let thread_id = [1u8; 32];
    let space_id = [2u8; 32];

    // Add 3 actions to same thread
    for i in 0..3 {
        let action = make_test_action([i as u8; 32], 10, 1000 + i);
        builder.add_action(thread_id, space_id, action, BranchPath::root());
    }

    assert_eq!(builder.pending_action_count(), 3);
    assert_eq!(builder.pending_thread_count(), 1); // All in same thread
    assert_eq!(builder.total_pow(), 30);
    assert!(builder.is_threshold_met()); // Threshold met
}

#[test]
fn test_multiple_threads_same_space() {
    let mut builder = BlockBuilder::new(50);
    let space_id = [1u8; 32];

    // Thread A with 20s PoW
    builder.add_action(
        [10u8; 32], // thread A
        space_id,
        make_test_action([1u8; 32], 20, 1000),
        BranchPath::root(),
    );

    // Thread B with 30s PoW
    builder.add_action(
        [20u8; 32], // thread B
        space_id,
        make_test_action([2u8; 32], 30, 1001),
        BranchPath::root(),
    );

    assert_eq!(builder.pending_thread_count(), 2);
    assert_eq!(builder.total_pow(), 50);
    assert_eq!(builder.space_pow(&space_id), 50);
    assert!(builder.is_threshold_met());
}

#[test]
fn test_multiple_spaces() {
    let mut builder = BlockBuilder::new(100);

    // Space A, Thread 1
    builder.add_action(
        [10u8; 32],
        [1u8; 32], // Space A
        make_test_action([1u8; 32], 25, 1000),
        BranchPath::root(),
    );

    // Space A, Thread 2
    builder.add_action(
        [20u8; 32],
        [1u8; 32], // Space A
        make_test_action([2u8; 32], 25, 1001),
        BranchPath::root(),
    );

    // Space B, Thread 3
    builder.add_action(
        [30u8; 32],
        [2u8; 32], // Space B
        make_test_action([3u8; 32], 50, 1002),
        BranchPath::root(),
    );

    assert_eq!(builder.space_pow(&[1u8; 32]), 50); // Space A
    assert_eq!(builder.space_pow(&[2u8; 32]), 50); // Space B
    assert_eq!(builder.total_pow(), 100);
    assert!(builder.is_threshold_met());
}

#[test]
fn test_root_block_formation() {
    let mut builder = BlockBuilder::new(30);

    // Add enough PoW to trigger block formation
    builder.add_action(
        [1u8; 32],
        [2u8; 32],
        make_test_action([1u8; 32], 15, 1000),
        BranchPath::root(),
    );
    builder.add_action(
        [1u8; 32],
        [2u8; 32],
        make_test_action([2u8; 32], 15, 1001),
        BranchPath::root(),
    );

    assert!(builder.is_threshold_met());

    let (root, spaces, contents) = builder.build_root_block(1002, [0u8; 32], None);

    assert_eq!(root.height, 1);
    assert_eq!(root.total_pow, 30);
    assert_eq!(spaces.len(), 1);
    assert_eq!(contents.len(), 1); // Both actions in same thread

    // Builder should be cleared
    assert_eq!(builder.pending_action_count(), 0);
    assert_eq!(builder.current_height(), 1);
}

#[test]
fn test_block_chain_continuity() {
    let mut builder = BlockBuilder::new(30);

    // First block
    builder.add_action(
        [1u8; 32],
        [1u8; 32],
        make_test_action([1u8; 32], 30, 1000),
        BranchPath::root(),
    );
    let (root1, _, _) = builder.build_root_block(1000, [0u8; 32], None);

    // Second block
    builder.add_action(
        [2u8; 32],
        [1u8; 32],
        make_test_action([2u8; 32], 35, 2000),
        BranchPath::root(),
    );
    let (root2, _, _) = builder.build_root_block(2000, [0u8; 32], None);

    // Third block
    builder.add_action(
        [3u8; 32],
        [2u8; 32],
        make_test_action([3u8; 32], 40, 3000),
        BranchPath::root(),
    );
    let (root3, _, _) = builder.build_root_block(3000, [0u8; 32], None);

    // Verify chain continuity
    assert_eq!(root2.prev_root_hash, root1.hash());
    assert_eq!(root3.prev_root_hash, root2.hash());
    assert_eq!(root1.height, 1);
    assert_eq!(root2.height, 2);
    assert_eq!(root3.height, 3);
}

#[test]
fn test_content_block_per_thread() {
    let mut builder = BlockBuilder::new(100);
    let space_id = [1u8; 32];

    // Thread A: 2 actions
    builder.add_action(
        [10u8; 32],
        space_id,
        make_test_action([1u8; 32], 20, 1000),
        BranchPath::root(),
    );
    builder.add_action(
        [10u8; 32],
        space_id,
        make_test_action([2u8; 32], 20, 1001),
        BranchPath::root(),
    );

    // Thread B: 1 action
    builder.add_action(
        [20u8; 32],
        space_id,
        make_test_action([3u8; 32], 30, 1002),
        BranchPath::root(),
    );

    // Thread C: 1 action
    builder.add_action(
        [30u8; 32],
        space_id,
        make_test_action([4u8; 32], 30, 1003),
        BranchPath::root(),
    );

    let (root, spaces, contents) = builder.build_root_block(1004, [0u8; 32], None);

    assert_eq!(spaces.len(), 1); // All in same space
    assert_eq!(contents.len(), 3); // 3 threads = 3 content blocks

    // Content blocks should have correct action counts
    let thread_a_block = contents
        .iter()
        .find(|c| c.thread_root_id == [10u8; 32])
        .unwrap();
    assert_eq!(thread_a_block.action_count(), 2);
}

#[test]
fn test_space_block_aggregates_content_blocks() {
    let mut builder = BlockBuilder::new(100);

    // Space A: 2 threads
    builder.add_action(
        [10u8; 32],
        [1u8; 32],
        make_test_action([1u8; 32], 25, 1000),
        BranchPath::root(),
    );
    builder.add_action(
        [20u8; 32],
        [1u8; 32],
        make_test_action([2u8; 32], 25, 1001),
        BranchPath::root(),
    );

    // Space B: 1 thread
    builder.add_action(
        [30u8; 32],
        [2u8; 32],
        make_test_action([3u8; 32], 50, 1002),
        BranchPath::root(),
    );

    let (_root, spaces, contents) = builder.build_root_block(1003, [0u8; 32], None);

    assert_eq!(spaces.len(), 2);
    assert_eq!(contents.len(), 3);

    // Space A should have 2 content hashes
    let space_a = spaces.iter().find(|s| s.space_id == [1u8; 32]).unwrap();
    assert_eq!(space_a.content_block_hashes.len(), 2);

    // Space B should have 1 content hash
    let space_b = spaces.iter().find(|s| s.space_id == [2u8; 32]).unwrap();
    assert_eq!(space_b.content_block_hashes.len(), 1);
}

#[test]
fn test_difficulty_target_customization() {
    let mut builder = BlockBuilder::new(100);
    assert_eq!(builder.difficulty_target(), 100);

    builder.set_difficulty_target(50);
    assert_eq!(builder.difficulty_target(), 50);

    // Now 50s PoW should trigger formation
    builder.add_action(
        [1u8; 32],
        [1u8; 32],
        make_test_action([1u8; 32], 50, 1000),
        BranchPath::root(),
    );
    assert!(builder.is_threshold_met());
}

#[test]
fn test_from_chain_state() {
    // Resume from existing chain state
    let prev_hash = [5u8; 32];
    let builder = BlockBuilder::from_chain_state(30, 100, prev_hash, 500);

    assert_eq!(builder.difficulty_target(), 30);
    assert_eq!(builder.current_height(), 100);
}

#[test]
fn test_clear_builder() {
    let mut builder = BlockBuilder::new(100);

    builder.add_action(
        [1u8; 32],
        [1u8; 32],
        make_test_action([1u8; 32], 50, 1000),
        BranchPath::root(),
    );
    assert_eq!(builder.pending_action_count(), 1);

    builder.clear();
    assert_eq!(builder.pending_action_count(), 0);
    assert_eq!(builder.pending_thread_count(), 0);
    assert_eq!(builder.total_pow(), 0);
}

// ============================================================================
// Integration Tests - Block Building in Node Context
// ============================================================================

/// Test that actions submitted via RPC are accumulated
#[test]
#[ignore = "requires node integration"]
fn test_rpc_posts_accumulated_into_block() {
    // 1. Start node
    // 2. Submit multiple posts via RPC
    // 3. Verify BlockBuilder has accumulated actions
    // 4. Once PoW threshold met, block is formed
    // 5. Block is stored in ChainStore
    todo!("Implement after BlockBuilder node integration")
}

/// Test that blocks propagate to peers
#[test]
#[ignore = "requires node integration"]
fn test_block_announcement_to_peers() {
    // 1. Node A forms a block
    // 2. Node B is connected
    // 3. A sends BLOCK_ANNOUNCE to B
    // 4. B requests block via GET_BLOCK
    // 5. A responds with BLOCK_DATA
    // 6. B has the block
    todo!("Implement after BlockBuilder node integration")
}

/// Test that new nodes sync via blocks
#[test]
#[ignore = "requires node integration"]
fn test_sync_via_blocks() {
    // 1. Node A has 10 blocks
    // 2. Node B connects (fresh)
    // 3. B syncs block headers
    // 4. B requests block content
    // 5. B verifies block chain
    // 6. B has same state as A
    todo!("Implement after BlockBuilder node integration")
}

/// Test that actions before block sync are properly ordered
#[test]
#[ignore = "requires node integration"]
fn test_action_ordering_within_block() {
    // 1. Submit 5 actions in specific order
    // 2. Form block
    // 3. Verify actions in block match submission order
    // 4. Verify timestamps are preserved
    todo!("Implement after BlockBuilder node integration")
}

/// Test that block formation doesn't lose actions during restart
#[test]
#[ignore = "requires node integration"]
fn test_pending_actions_survive_restart() {
    // 1. Accumulate actions (below threshold)
    // 2. Stop node
    // 3. Restart node
    // 4. Pending actions restored
    // 5. Add more actions
    // 6. Block forms correctly
    todo!("Implement after BlockBuilder node integration")
}
