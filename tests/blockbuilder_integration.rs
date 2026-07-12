//! BlockBuilder Integration Tests (SPEC_08)
//!
//! Tests for integrating BlockBuilder into the node for proper block-based
//! content propagation instead of raw blob gossip.
//!
//! These tests verify:
//! 1. Actions from RPC are accumulated by BlockBuilder
//! 2. Blocks are formed when PoW threshold is met
//! 3. Block announcements are sent to peers
//! 4. Peers can request and receive blocks
//! 5. Block chain structure matches Vision hierarchy

use std::sync::{Arc, RwLock};
use std::time::Duration;

use swimchain::blocks::{
    Action, ActionType, BlockBuilder, BranchPath, ContentBlock, RootBlock, SpaceBlock,
};
use swimchain::network::messages::{BlockAnnouncePayload, BlockDataPayload, GetBlockPayload};
use swimchain::types::constants::{MSG_BLOCK_ANNOUNCE, MSG_BLOCK_DATA, MSG_GET_BLOCK};

// ============================================
// Unit Tests for Block Hierarchy Structure
// ============================================

/// Test that actions accumulate into content blocks correctly
#[test]
fn test_actions_accumulate_into_content_block() {
    let mut builder = BlockBuilder::new(30); // 30s difficulty target

    // Create test action with 10 PoW work
    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 10,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    let thread_id = [10u8; 32];
    let space_id = [20u8; 32];

    builder.add_action(thread_id, space_id, action.clone(), BranchPath::root());
    builder.add_action(thread_id, space_id, action.clone(), BranchPath::root());
    builder.add_action(thread_id, space_id, action.clone(), BranchPath::root());

    assert_eq!(builder.pending_action_count(), 3);
    assert_eq!(builder.total_pow(), 30); // 3 * 10
    assert!(builder.should_form_root());

    // Build and verify content block
    let content_block = builder.build_content_block(&thread_id, 1000);
    assert!(content_block.is_some());
    let cb = content_block.unwrap();
    assert_eq!(cb.total_pow, 30);
    assert_eq!(cb.action_count(), 3);
    assert_eq!(cb.space_id, space_id);
    assert_eq!(cb.thread_root_id, thread_id);
}

/// Test that content blocks aggregate into space blocks
#[test]
fn test_content_blocks_aggregate_into_space_block() {
    let mut builder = BlockBuilder::new(50);

    // Thread 1 with 20 PoW
    let action1 = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 20,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Thread 2 with 30 PoW
    let action2 = Action {
        action_type: ActionType::Post,
        actor: [5u8; 32],
        timestamp: 1001,
        content_hash: Some([6u8; 32]),
        parent_id: None,
        pow_nonce: 43,
        pow_work: 30,
        pow_target: [7u8; 32],
        signature: [8u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    let space_id = [20u8; 32];

    builder.add_action([10u8; 32], space_id, action1, BranchPath::root());
    builder.add_action([11u8; 32], space_id, action2, BranchPath::root());

    assert_eq!(builder.total_pow(), 50);
    assert_eq!(builder.pending_thread_count(), 2);

    // Build root block - should create 2 content blocks and 1 space block
    let (root, space_blocks, content_blocks) = builder.build_root_block(1000, [0u8; 32], None);

    assert_eq!(content_blocks.len(), 2);
    assert_eq!(space_blocks.len(), 1);

    // Space block should aggregate all content block PoW
    let space = &space_blocks[0];
    assert_eq!(space.total_pow, 50); // 20 + 30
    assert_eq!(space.content_block_count(), 2);
    assert_eq!(space.space_id, space_id);
}

/// Test that space blocks aggregate into root blocks
#[test]
fn test_space_blocks_aggregate_into_root_block() {
    let mut builder = BlockBuilder::new(60);

    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 30,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Add to two different spaces
    let space1 = [21u8; 32];
    let space2 = [22u8; 32];

    builder.add_action([10u8; 32], space1, action.clone(), BranchPath::root());
    builder.add_action([11u8; 32], space2, action.clone(), BranchPath::root());

    let (root, space_blocks, content_blocks) = builder.build_root_block(1000, [0u8; 32], None);

    assert_eq!(space_blocks.len(), 2); // Two spaces
    assert_eq!(content_blocks.len(), 2); // One thread per space
    assert_eq!(root.total_pow, 60); // 30 + 30
    assert_eq!(root.space_block_count(), 2);
    assert_eq!(root.height(), 1);
}

/// Test that root blocks form a chain with proper prev_hash
#[test]
fn test_root_block_chain_continuity() {
    let mut builder = BlockBuilder::new(30);

    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 30,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // First block
    builder.add_action([10u8; 32], [20u8; 32], action.clone(), BranchPath::root());
    let (root1, _, _) = builder.build_root_block(1000, [0u8; 32], None);
    assert_eq!(root1.height(), 1);
    assert_eq!(root1.prev_root_hash, [0u8; 32]); // Genesis is [0;32]

    // Second block
    builder.add_action([11u8; 32], [20u8; 32], action.clone(), BranchPath::root());
    let (root2, _, _) = builder.build_root_block(1030, [0u8; 32], None);
    assert_eq!(root2.height(), 2);
    assert_eq!(root2.prev_root_hash, root1.hash());

    // Third block
    builder.add_action([12u8; 32], [20u8; 32], action.clone(), BranchPath::root());
    let (root3, _, _) = builder.build_root_block(1060, [0u8; 32], None);
    assert_eq!(root3.height(), 3);
    assert_eq!(root3.prev_root_hash, root2.hash());
}

// ============================================
// Message Serialization Tests
// ============================================

/// Test BlockAnnouncePayload serialization roundtrip
#[test]
fn test_block_announce_payload_roundtrip() {
    let payload = BlockAnnouncePayload::new([0xab; 32], 100, 500, 5, 1735600000);

    let bytes = payload.to_bytes();
    assert_eq!(bytes.len(), BlockAnnouncePayload::SIZE);

    let restored = BlockAnnouncePayload::from_bytes(&bytes).unwrap();
    assert_eq!(restored.block_hash, payload.block_hash);
    assert_eq!(restored.height, 100);
    assert_eq!(restored.total_pow, 500);
    assert_eq!(restored.space_block_count, 5);
    assert_eq!(restored.timestamp, 1735600000);
}

/// Test GetBlockPayload serialization roundtrip
#[test]
fn test_get_block_payload_roundtrip() {
    let payload = GetBlockPayload::new([0xcd; 32]);

    let bytes = payload.to_bytes();
    assert_eq!(bytes.len(), GetBlockPayload::SIZE);

    let restored = GetBlockPayload::from_bytes(&bytes).unwrap();
    assert_eq!(restored.block_hash, payload.block_hash);
}

/// Test BlockDataPayload serialization roundtrip
#[test]
fn test_block_data_payload_roundtrip() {
    let mut payload = BlockDataPayload::new([0xef; 32]);
    payload.root_block = vec![1, 2, 3, 4, 5];
    payload.space_blocks = vec![vec![10, 11, 12], vec![20, 21, 22, 23]];
    payload.content_blocks = vec![vec![100, 101], vec![200]];

    let bytes = payload.to_bytes();
    let restored = BlockDataPayload::from_bytes(&bytes).unwrap();

    assert_eq!(restored.block_hash, payload.block_hash);
    assert_eq!(restored.root_block, payload.root_block);
    assert_eq!(restored.space_blocks.len(), 2);
    assert_eq!(restored.space_blocks[0], vec![10, 11, 12]);
    assert_eq!(restored.space_blocks[1], vec![20, 21, 22, 23]);
    assert_eq!(restored.content_blocks.len(), 2);
    assert_eq!(restored.content_blocks[0], vec![100, 101]);
    assert_eq!(restored.content_blocks[1], vec![200]);
}

/// Test BlockAnnouncePayload rejects short bytes
#[test]
fn test_block_announce_rejects_short_bytes() {
    let bytes = [0u8; 59]; // 1 byte short
    assert!(BlockAnnouncePayload::from_bytes(&bytes).is_none());
}

/// Test GetBlockPayload rejects short bytes
#[test]
fn test_get_block_rejects_short_bytes() {
    let bytes = [0u8; 31]; // 1 byte short
    assert!(GetBlockPayload::from_bytes(&bytes).is_none());
}

/// Test BlockDataPayload rejects short bytes
#[test]
fn test_block_data_rejects_short_bytes() {
    let bytes = [0u8; 43]; // 1 byte short of minimum
    assert!(BlockDataPayload::from_bytes(&bytes).is_none());
}

// ============================================
// PoW Threshold Tests
// ============================================

/// Test that blocks aren't formed below threshold
#[test]
fn test_block_not_formed_below_threshold() {
    let mut builder = BlockBuilder::new(30);

    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 10, // Only 10, threshold is 30
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    builder.add_action([10u8; 32], [20u8; 32], action, BranchPath::root());

    assert!(!builder.should_form_root());
    assert_eq!(builder.total_pow(), 10);
}

/// Test that blocks are formed at exactly threshold
#[test]
fn test_block_formed_at_threshold() {
    let mut builder = BlockBuilder::new(30);

    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 30, // Exactly threshold
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    builder.add_action([10u8; 32], [20u8; 32], action, BranchPath::root());

    assert!(builder.should_form_root());
}

/// Test multiple small actions reach threshold
#[test]
fn test_multiple_small_actions_reach_threshold() {
    let mut builder = BlockBuilder::new(30);

    for i in 0..6 {
        let action = Action {
            action_type: ActionType::Post,
            actor: [i; 32],
            timestamp: 1000 + i as u64,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: 5, // 5 * 6 = 30
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        };

        builder.add_action([10 + i; 32], [20u8; 32], action, BranchPath::root());
    }

    assert_eq!(builder.total_pow(), 30);
    assert!(builder.should_form_root());
}

// ============================================
// Reply Threading Tests
// ============================================

/// Test that replies stay with their parent thread
#[test]
fn test_replies_stay_with_parent_thread() {
    let mut builder = BlockBuilder::new(60);

    let thread_id = [10u8; 32]; // The parent post defines the thread
    let space_id = [20u8; 32];

    // Original post
    let post_action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some(thread_id), // Post content hash = thread ID
        parent_id: None,
        pow_nonce: 42,
        pow_work: 20,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Reply to the post
    let reply_action = Action {
        action_type: ActionType::Reply,
        actor: [2u8; 32],
        timestamp: 1001,
        content_hash: Some([50u8; 32]), // Reply content
        parent_id: Some(thread_id),     // References parent
        pow_nonce: 43,
        pow_work: 15,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Another reply
    let reply2_action = Action {
        action_type: ActionType::Reply,
        actor: [3u8; 32],
        timestamp: 1002,
        content_hash: Some([51u8; 32]),
        parent_id: Some([50u8; 32]), // Reply to the first reply
        pow_nonce: 44,
        pow_work: 25,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // All belong to the same thread
    builder.add_action(thread_id, space_id, post_action, BranchPath::root());
    builder.add_action(thread_id, space_id, reply_action, BranchPath::root());
    builder.add_action(thread_id, space_id, reply2_action, BranchPath::root());

    assert_eq!(builder.pending_thread_count(), 1); // All in one thread
    assert_eq!(builder.total_pow(), 60);

    // Build and verify single content block with all actions
    let (root, space_blocks, content_blocks) = builder.build_root_block(1000, [0u8; 32], None);

    assert_eq!(content_blocks.len(), 1);
    let cb = &content_blocks[0];
    assert_eq!(cb.action_count(), 3);
    assert_eq!(cb.total_pow, 60);
}

// ============================================
// Concurrent Builder Access Tests
// ============================================

/// Test BlockBuilder can be safely shared between threads
#[test]
fn test_concurrent_builder_access() {
    use std::thread;

    let builder = Arc::new(RwLock::new(BlockBuilder::new(100)));
    let mut handles = vec![];

    // Spawn 10 threads that each add an action
    for i in 0..10 {
        let builder_clone = Arc::clone(&builder);
        let handle = thread::spawn(move || {
            let action = Action {
                action_type: ActionType::Post,
                actor: [i as u8; 32],
                timestamp: 1000 + i,
                content_hash: Some([2u8; 32]),
                parent_id: None,
                pow_nonce: 42,
                pow_work: 10,
                pow_target: [3u8; 32],
                signature: [4u8; 64],
                emoji: None,
                media_refs: vec![],
                display_name: None,
                replaces_pending: None,
            };

            let mut builder = builder_clone.write().unwrap();
            builder.add_action([i as u8; 32], [20u8; 32], action, BranchPath::root());
        });
        handles.push(handle);
    }

    // Wait for all threads
    for handle in handles {
        handle.join().unwrap();
    }

    // Verify all actions were added
    let mut builder = builder.write().unwrap();
    assert_eq!(builder.pending_action_count(), 10);
    assert_eq!(builder.total_pow(), 100);
    assert!(builder.should_form_root());
}

// ============================================
// Integration Tests (Ignored - Need Node)
// ============================================

/// Test that RPC submit_post feeds action to BlockBuilder
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_rpc_post_feeds_blockbuilder() {
    // This test will:
    // 1. Start a node with BlockBuilder
    // 2. Submit a post via RPC
    // 3. Verify action was added to BlockBuilder
    // 4. When threshold is reached, verify block is formed
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

/// Test that block announcements are sent to peers
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_block_announcement_sent_to_peers() {
    // This test will:
    // 1. Start two connected nodes
    // 2. Submit enough posts to form a block on node A
    // 3. Verify node B receives BLOCK_ANNOUNCE
    // 4. Verify node B can request the block with GET_BLOCK
    // 5. Verify node B receives BLOCK_DATA
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

/// Test block-based sync instead of blob-based sync
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_block_based_sync() {
    // This test will:
    // 1. Start node A and create several blocks
    // 2. Start node B and connect to A
    // 3. Verify B syncs via block protocol (not I_HAVE/GET)
    // 4. Verify B has the same chain state as A
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

/// Test block formation timer (30-second intervals)
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_block_formation_timer() {
    // This test will:
    // 1. Start a node with BlockBuilder
    // 2. Submit actions that don't meet threshold
    // 3. Wait for timer (30s or configurable test interval)
    // 4. Verify block is formed even below threshold
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

/// Test orphan block handling
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_orphan_block_handling() {
    // This test will:
    // 1. Start nodes A, B
    // 2. Have both form blocks simultaneously (partition scenario)
    // 3. When they reconnect, verify chain resolution
    // 4. Verify orphan blocks are handled correctly
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

/// Test that blob storage still works for content retrieval
#[test]
#[ignore = "Requires NodeManager integration - implement after wiring BlockBuilder"]
fn test_blob_storage_for_content_retrieval() {
    // This test verifies the concern from the plan review:
    // "blobs should still be stored for content retrieval"
    //
    // This test will:
    // 1. Start a node with BlockBuilder
    // 2. Submit a post
    // 3. Verify post content is in BlobStore (for direct retrieval)
    // 4. Verify post is also in BlockBuilder (for chain structure)
    // 5. Verify content can be retrieved by hash
    todo!("Implement after wiring BlockBuilder into NodeManager")
}

// ============================================
// Vision Document Compliance Tests
// ============================================

/// Test that block hierarchy matches Vision: Content → Space → Root
#[test]
fn test_vision_block_hierarchy() {
    // Vision document states:
    // "Actions (POST, REPLY, ENGAGE) → Content blocks → Space blocks → Root blocks"

    let mut builder = BlockBuilder::new(30);

    // Create an action
    let action = Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work: 30,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    let thread_id = [10u8; 32];
    let space_id = [20u8; 32];

    builder.add_action(thread_id, space_id, action, BranchPath::root());

    let (root, space_blocks, content_blocks) = builder.build_root_block(1000, [0u8; 32], None);

    // Verify hierarchy
    assert_eq!(content_blocks.len(), 1);
    assert_eq!(space_blocks.len(), 1);

    // Content block contains action
    let content = &content_blocks[0];
    assert_eq!(content.action_count(), 1);
    assert_eq!(content.space_id, space_id);

    // Space block references content block
    let space = &space_blocks[0];
    assert!(space.content_block_hashes.contains(&content.hash()));
    assert_eq!(space.space_id, space_id);

    // Root block references space block
    assert!(root.space_block_hashes.contains(&space.hash()));

    // PoW aggregates correctly
    assert_eq!(content.total_pow, 30);
    assert_eq!(space.total_pow, 30);
    assert_eq!(root.total_pow, 30);
}

/// Test that PoW aggregates upward as per Vision
#[test]
fn test_vision_pow_aggregation() {
    // Vision: "PoW aggregates upward through hierarchy"

    let mut builder = BlockBuilder::new(100);

    // Multiple actions with different PoW
    for (i, pow) in [10, 15, 20, 25, 30].iter().enumerate() {
        let action = Action {
            action_type: ActionType::Post,
            actor: [i as u8; 32],
            timestamp: 1000 + i as u64,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: *pow,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        };

        builder.add_action([i as u8; 32], [20u8; 32], action, BranchPath::root());
    }

    let (root, space_blocks, content_blocks) = builder.build_root_block(1000, [0u8; 32], None);

    // Each content block has its own PoW
    let total_content_pow: u64 = content_blocks.iter().map(|c| c.total_pow).sum();
    assert_eq!(total_content_pow, 100);

    // Space block aggregates all content block PoW
    let total_space_pow: u64 = space_blocks.iter().map(|s| s.total_pow).sum();
    assert_eq!(total_space_pow, 100);

    // Root block has total of all PoW
    assert_eq!(root.total_pow, 100);
}
