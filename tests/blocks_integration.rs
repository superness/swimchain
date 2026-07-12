//! Integration tests for recursive block hierarchy (SPEC_08)
//!
//! Tests the three-level block hierarchy:
//! - Actions aggregate into content blocks
//! - Content blocks roll up into space blocks
//! - Space blocks roll up into root blocks (~30s target)

use swimchain::blocks::*;

// ============================================================================
// Test Helpers
// ============================================================================

fn make_action(action_type: ActionType, pow_work: u64, timestamp: u64) -> Action {
    Action {
        action_type,
        actor: [1u8; 32],
        timestamp,
        content_hash: Some([2u8; 32]),
        parent_id: if action_type == ActionType::Reply {
            Some([3u8; 32])
        } else {
            None
        },
        pow_nonce: 42,
        pow_work,
        pow_target: [4u8; 32],
        signature: [5u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
        private: false,
    }
}

// ============================================================================
// Action Tests
// ============================================================================

#[test]
fn test_action_serialization_roundtrip() {
    let action = make_action(ActionType::Post, 30, 1000);
    let serialized = action.serialize();

    assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
    assert_eq!(serialized.len(), 217);

    let deserialized = Action::deserialize(&serialized).unwrap();
    assert_eq!(action, deserialized);
}

// ============================================================================
// ContentBlock PoW Aggregation Tests
// ============================================================================

#[test]
fn test_content_block_pow_aggregation() {
    // 3 actions with 30s, 10s, 20s = 60s total
    let action1 = make_action(ActionType::Post, 30, 1000);
    let action2 = make_action(ActionType::Reply, 10, 1001);
    let action3 = make_action(ActionType::Engage, 20, 1002);

    let content_block = ContentBlock::new(
        [1u8; 32], // thread_root_id
        [2u8; 32], // space_id
        vec![action1, action2, action3],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();

    assert_eq!(content_block.total_pow, 60);
    assert_eq!(content_block.action_count(), 3);
    assert!(content_block.verify_pow_sum().is_ok());
}

// ============================================================================
// SpaceBlock PoW Aggregation Tests
// ============================================================================

#[test]
fn test_space_block_pow_aggregation() {
    // Create 3 content blocks with different PoW
    let cb1 = ContentBlock::new(
        [10u8; 32],
        [20u8; 32],
        vec![make_action(ActionType::Post, 100, 1000)],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();

    let cb2 = ContentBlock::new(
        [11u8; 32],
        [20u8; 32],
        vec![make_action(ActionType::Post, 150, 1001)],
        None,
        1001,
        BranchPath::root(),
    )
    .unwrap();

    let cb3 = ContentBlock::new(
        [12u8; 32],
        [20u8; 32],
        vec![make_action(ActionType::Post, 50, 1002)],
        None,
        1002,
        BranchPath::root(),
    )
    .unwrap();

    let space_block = SpaceBlock::from_content_blocks(
        [20u8; 32],
        &[cb1.clone(), cb2.clone(), cb3.clone()],
        None,
        1000,
    );

    assert_eq!(space_block.total_pow, 300); // 100 + 150 + 50
    assert_eq!(space_block.content_block_count(), 3);
    assert!(space_block.verify_pow_sum(&[cb1, cb2, cb3]).is_ok());
}

// ============================================================================
// RootBlock PoW Aggregation Tests
// ============================================================================

#[test]
fn test_root_block_pow_aggregation() {
    // Create 2 space blocks with different PoW
    let action1 = make_action(ActionType::Post, 300, 1000);
    let cb1 = ContentBlock::new(
        [10u8; 32],
        [20u8; 32],
        vec![action1],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();
    let sb1 = SpaceBlock::from_content_blocks([20u8; 32], &[cb1], None, 1000);

    let action2 = make_action(ActionType::Post, 200, 1001);
    let cb2 = ContentBlock::new(
        [11u8; 32],
        [21u8; 32],
        vec![action2],
        None,
        1001,
        BranchPath::root(),
    )
    .unwrap();
    let sb2 = SpaceBlock::from_content_blocks([21u8; 32], &[cb2], None, 1001);

    let root_block = RootBlock::from_space_blocks(
        &[sb1.clone(), sb2.clone()],
        [0u8; 32],
        0,
        1000,
        30,
        1,
        [0u8; 32],
    );

    assert_eq!(root_block.total_pow, 500); // 300 + 200
    assert_eq!(root_block.space_block_count(), 2);
    assert!(root_block.verify_pow_sum(&[sb1, sb2]).is_ok());
}

// ============================================================================
// Root Block Formation Threshold Tests
// ============================================================================

#[test]
fn test_root_block_formation_threshold() {
    let mut builder = BlockBuilder::new(30); // 30s difficulty

    // Add 29s - should not form
    builder.add_action(
        [1u8; 32],
        [2u8; 32],
        make_action(ActionType::Post, 29, 1000),
        BranchPath::root(),
    );
    assert!(!builder.should_form_root());

    // Add 5s more (total 34s) - should form
    builder.add_action(
        [1u8; 32],
        [2u8; 32],
        make_action(ActionType::Engage, 5, 1001),
        BranchPath::root(),
    );
    assert!(builder.should_form_root());
}

// ============================================================================
// Branch Path Tests
// ============================================================================

#[test]
fn test_branch_path_left() {
    // Hash starting with 0x00 means first bit is 0 (Left)
    let hash = [0x00u8; 32];
    assert_eq!(BranchPath::direction_at(&hash, 0), BranchDirection::Left);
}

#[test]
fn test_branch_path_right() {
    // Hash starting with 0x80 means first bit is 1 (Right)
    let mut hash = [0x00u8; 32];
    hash[0] = 0x80;
    assert_eq!(BranchPath::direction_at(&hash, 0), BranchDirection::Right);
}

#[test]
fn test_reply_inherits_parent_path() {
    let parent_path = BranchPath::root()
        .branch(BranchDirection::Left)
        .branch(BranchDirection::Right);

    let reply_path = BranchPath::for_reply(&parent_path);

    assert_eq!(reply_path.depth(), parent_path.depth());
    assert_eq!(reply_path, parent_path);
}

// ============================================================================
// Validation Tests
// ============================================================================

#[test]
fn test_validation_pow_sum_mismatch() {
    let action = make_action(ActionType::Post, 30, 1000);
    let mut block = ContentBlock::new(
        [1u8; 32],
        [2u8; 32],
        vec![action],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();

    // Tamper with total_pow
    block.total_pow = 999;

    let result = block.verify_pow_sum();
    assert!(result.is_err());
}

#[test]
fn test_validation_merkle_mismatch() {
    let action = make_action(ActionType::Post, 30, 1000);
    let cb = ContentBlock::new(
        [1u8; 32],
        [2u8; 32],
        vec![action],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();

    let mut space_block = SpaceBlock::from_content_blocks([2u8; 32], &[cb], None, 1000);

    // Tamper with merkle_root
    space_block.merkle_root = [0xFFu8; 32];

    let result = space_block.verify_merkle_root();
    assert!(result.is_err());
}

// ============================================================================
// Genesis Block Tests
// ============================================================================

#[test]
fn test_genesis_block() {
    let genesis = RootBlock::genesis(1000);

    assert!(genesis.is_genesis());
    assert_eq!(genesis.prev_root_hash, [0u8; 32]);
    assert_eq!(genesis.height(), 0);
    assert!(genesis.verify_genesis().is_ok());
}

// ============================================================================
// Sybil Equivalence Tests
// ============================================================================

#[test]
fn test_sybil_equivalence() {
    // Scenario 1: One user contributes 60s
    let action1 = make_action(ActionType::Post, 60, 1000);
    let cb1 = ContentBlock::new(
        [10u8; 32],
        [20u8; 32],
        vec![action1],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();
    let sb1 = SpaceBlock::from_content_blocks([20u8; 32], &[cb1], None, 1000);
    let rb1 = RootBlock::from_space_blocks(&[sb1], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

    // Scenario 2: 60 users contribute 1s each
    let mut actions: Vec<Action> = Vec::new();
    for i in 0..60 {
        let mut action = make_action(ActionType::Post, 1, 1000 + i);
        action.actor = [i as u8; 32]; // Different actors
        actions.push(action);
    }

    // Create content blocks (one per "user" for this test)
    let content_blocks: Vec<ContentBlock> = actions
        .into_iter()
        .enumerate()
        .map(|(i, action)| {
            ContentBlock::new(
                [(i as u8) + 100; 32],
                [20u8; 32],
                vec![action],
                None,
                1000,
                BranchPath::root(),
            )
            .unwrap()
        })
        .collect();

    let sb2 = SpaceBlock::from_content_blocks([20u8; 32], &content_blocks, None, 1000);
    let rb2 = RootBlock::from_space_blocks(&[sb2], [0u8; 32], 0, 1000, 30, 1, [0u8; 32]);

    // Both should have same total PoW
    assert_eq!(rb1.total_pow, 60);
    assert_eq!(rb2.total_pow, 60);

    // Both should meet difficulty (30s target)
    assert!(rb1.meets_difficulty());
    assert!(rb2.meets_difficulty());
}

// ============================================================================
// Merkle Determinism Tests
// ============================================================================

#[test]
fn test_merkle_determinism() {
    let hashes: Vec<[u8; 32]> = (0..5).map(|i| [i as u8; 32]).collect();

    let root1 = compute_merkle_root(&hashes);
    let root2 = compute_merkle_root(&hashes);

    assert_eq!(root1, root2);
}

// ============================================================================
// Three-Level Chain Building Integration Test
// ============================================================================

#[test]
fn test_three_level_chain_building() {
    // 1. Create actions
    let action1 = make_action(ActionType::Post, 30, 1000);
    let action2 = make_action(ActionType::Reply, 10, 1001);
    let action3 = make_action(ActionType::Engage, 20, 1002);

    // 2. Build content block
    let content_block = ContentBlock::new(
        [1u8; 32], // thread_root_id
        [2u8; 32], // space_id
        vec![action1, action2, action3],
        None,
        1000,
        BranchPath::root(),
    )
    .unwrap();
    assert_eq!(content_block.total_pow, 60);

    // 3. Build space block
    let space_block =
        SpaceBlock::from_content_blocks([2u8; 32], &[content_block.clone()], None, 1000);
    assert_eq!(space_block.total_pow, 60);

    // 4. Build root block
    let root_block = RootBlock::from_space_blocks(
        &[space_block.clone()],
        [0u8; 32],
        0, // prev_cumulative_pow
        1000,
        30, // difficulty target
        1,
        [0u8; 32], // block_creator for tests
    );
    assert_eq!(root_block.total_pow, 60);
    assert!(root_block.meets_difficulty());

    // 5. Validate entire chain
    assert!(validate_content_block(&content_block, 1005).is_ok());
    assert!(validate_space_block(&space_block, Some(&[content_block])).is_ok());
    assert!(validate_root_block(&root_block, None, Some(&[space_block])).is_ok());
}

// ============================================================================
// Block Builder Integration Test
// ============================================================================

#[test]
fn test_block_builder_full_workflow() {
    let mut builder = BlockBuilder::new(30); // 30s difficulty

    // Add actions for thread 1
    builder.add_action(
        [1u8; 32],
        [10u8; 32],
        make_action(ActionType::Post, 15, 1000),
        BranchPath::root(),
    );
    builder.add_action(
        [1u8; 32],
        [10u8; 32],
        make_action(ActionType::Reply, 10, 1001),
        BranchPath::root(),
    );

    // Add actions for thread 2 (same space)
    builder.add_action(
        [2u8; 32],
        [10u8; 32],
        make_action(ActionType::Post, 20, 1002),
        BranchPath::root(),
    );

    // Should be ready to form (15 + 10 + 20 = 45s)
    assert!(builder.should_form_root());
    assert_eq!(builder.total_pow(), 45);
    assert_eq!(builder.pending_thread_count(), 2);
    assert_eq!(builder.pending_action_count(), 3);

    // Build the blocks
    let (root, spaces, contents) = builder.build_root_block(1010, [0u8; 32], None);

    // Verify structure
    assert_eq!(root.height(), 1);
    assert_eq!(root.total_pow, 45);
    assert!(root.meets_difficulty());

    assert_eq!(spaces.len(), 1); // Both threads in same space
    assert_eq!(spaces[0].total_pow, 45);

    assert_eq!(contents.len(), 2); // Two threads
    let total_content_pow: u64 = contents.iter().map(|c| c.total_pow).sum();
    assert_eq!(total_content_pow, 45);

    // Builder should be cleared
    assert_eq!(builder.pending_action_count(), 0);
    assert_eq!(builder.current_height(), 1);
}

// ============================================================================
// Chain Continuity Test
// ============================================================================

#[test]
fn test_chain_continuity_via_builder() {
    let mut builder = BlockBuilder::new(30);

    // First block
    builder.add_action(
        [1u8; 32],
        [10u8; 32],
        make_action(ActionType::Post, 30, 1000),
        BranchPath::root(),
    );
    let (root1, _, _) = builder.build_root_block(1000, [0u8; 32], None);

    // Second block
    builder.add_action(
        [2u8; 32],
        [10u8; 32],
        make_action(ActionType::Post, 30, 1030),
        BranchPath::root(),
    );
    let (root2, _, _) = builder.build_root_block(1030, [0u8; 32], None);

    // Verify chain continuity
    assert_eq!(root2.prev_root_hash, root1.hash());
    assert_eq!(root2.height(), 2);
    assert!(!root2.is_genesis());

    // Verify validation
    let result = validate_root_block(&root2, Some(&root1), None);
    assert!(result.is_ok());
}

// ============================================================================
// Action Types Test
// ============================================================================

#[test]
fn test_action_types() {
    let post = make_action(ActionType::Post, 10, 1000);
    assert!(post.is_thread_root());

    let reply = make_action(ActionType::Reply, 10, 1000);
    assert!(!reply.is_thread_root());
    assert!(reply.parent_id.is_some());

    let engage = make_action(ActionType::Engage, 10, 1000);
    assert!(!engage.is_thread_root());
    assert!(engage.content_hash.is_some());
}
