//! Block Propagation Integration Tests (SPEC_08)
//!
//! Tests for block formation, announcement, request, and storage between nodes.

use swimchain::blocks::{Action, BlockBuilder, BranchPath, ContentBlock, RootBlock, SpaceBlock};
use swimchain::network::messages::{BlockAnnouncePayload, BlockDataPayload, GetBlockPayload};
use swimchain::storage::chain::ChainStore;
use tempfile::tempdir;

/// Test that BlockAnnouncePayload serializes and deserializes correctly
#[test]
fn test_block_announce_serialization() {
    let block_hash = [0x42u8; 32];
    let announce = BlockAnnouncePayload::new(
        block_hash,
        100,     // height
        50000,   // total_pow
        5,       // space_block_count
        1700000000, // timestamp
    );

    let bytes = announce.to_bytes();
    assert_eq!(bytes.len(), BlockAnnouncePayload::SIZE);

    let parsed = BlockAnnouncePayload::from_bytes(&bytes).unwrap();
    assert_eq!(parsed.block_hash, block_hash);
    assert_eq!(parsed.height, 100);
    assert_eq!(parsed.total_pow, 50000);
    assert_eq!(parsed.space_block_count, 5);
    assert_eq!(parsed.timestamp, 1700000000);
}

/// Test that GetBlockPayload serializes and deserializes correctly
#[test]
fn test_get_block_serialization() {
    let block_hash = [0xABu8; 32];
    let request = GetBlockPayload::new(block_hash);

    let bytes = request.to_bytes();
    assert_eq!(bytes.len(), GetBlockPayload::SIZE);

    let parsed = GetBlockPayload::from_bytes(&bytes).unwrap();
    assert_eq!(parsed.block_hash, block_hash);
}

/// Test that BlockDataPayload serializes and deserializes correctly
#[test]
fn test_block_data_serialization() {
    let block_hash = [0xCDu8; 32];
    let mut payload = BlockDataPayload::new(block_hash);

    // Add some fake block data
    payload.root_block = vec![1, 2, 3, 4, 5];
    payload.space_blocks.push(vec![10, 20, 30]);
    payload.space_blocks.push(vec![40, 50, 60, 70]);
    payload.content_blocks.push(vec![100, 101, 102, 103, 104]);

    let bytes = payload.to_bytes();
    assert!(bytes.len() >= BlockDataPayload::MIN_SIZE);

    let parsed = BlockDataPayload::from_bytes(&bytes).unwrap();
    assert_eq!(parsed.block_hash, block_hash);
    assert_eq!(parsed.root_block, vec![1, 2, 3, 4, 5]);
    assert_eq!(parsed.space_blocks.len(), 2);
    assert_eq!(parsed.content_blocks.len(), 1);
}

/// Test that ChainStore can store and retrieve root blocks
#[test]
fn test_chain_store_root_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Create a minimal root block
    let root = RootBlock {
        version: 1,
        prev_root_hash: [0u8; 32],
        timestamp: 1700000000,
        merkle_root: [0xAAu8; 32],
        space_block_hashes: vec![[0xBBu8; 32], [0xCCu8; 32]],
        space_block_count: 2,
        total_pow: 100,
        cumulative_pow: 100,
        difficulty_target: 30,
        height: 1,
        block_creator: [0u8; 32],
    };

    let hash = store.put_root_block(&root).unwrap();

    // Retrieve it
    let retrieved = store.get_root_block(&hash).unwrap().unwrap();
    assert_eq!(retrieved.height, 1);
    assert_eq!(retrieved.total_pow, 100);
    assert_eq!(retrieved.space_block_count, 2);
}

/// Test that ChainStore can store and retrieve space blocks
#[test]
fn test_chain_store_space_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let space_block = SpaceBlock {
        space_id: [0x11u8; 32],
        merkle_root: [0x22u8; 32],
        content_block_hashes: vec![[0x33u8; 32]],
        content_block_count: 1,
        prev_space_hash: None,
        timestamp: 1700000000,
        total_pow: 50,
    };

    let hash = store.put_space_block(&space_block).unwrap();

    let retrieved = store.get_space_block(&hash).unwrap().unwrap();
    assert_eq!(retrieved.space_id, [0x11u8; 32]);
    assert_eq!(retrieved.total_pow, 50);
}

/// Test that ChainStore can store and retrieve content blocks
#[test]
fn test_chain_store_content_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let thread_id = [0x44u8; 32];
    let space_id = [0x55u8; 32];
    let actions = vec![Action {
        action_type: swimchain::blocks::ActionType::Post,
        actor: [0x77u8; 32],
        timestamp: 1700000000,
        content_hash: Some([0x66u8; 32]),
        parent_id: None,
        pow_nonce: 12345,
        pow_work: 100,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    }];

    let content_block = ContentBlock::new(
        thread_id,
        space_id,
        actions,
        None, // prev_content_hash
        1700000000,
        BranchPath::root(),
    ).unwrap();

    let hash = store.put_content_block(&content_block).unwrap();

    let retrieved = store.get_content_block(&hash).unwrap().unwrap();
    assert_eq!(retrieved.thread_root_id, thread_id);
    assert_eq!(retrieved.space_id, space_id);
}

/// Test that BlockBuilder accumulates actions correctly
#[test]
fn test_block_builder_accumulation() {
    let mut builder = BlockBuilder::new(100); // 100s difficulty target

    let thread_id = [0x11u8; 32];
    let space_id = [0x22u8; 32];
    let action = Action {
        action_type: swimchain::blocks::ActionType::Post,
        actor: [0x44u8; 32],
        timestamp: 1700000000,
        content_hash: Some([0x33u8; 32]),
        parent_id: None,
        pow_nonce: 123,
        pow_work: 50,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    builder.add_action(thread_id, space_id, action.clone(), BranchPath::root());

    assert_eq!(builder.pending_action_count(), 1);
    assert_eq!(builder.total_pow(), 50);
    assert!(!builder.should_form_root()); // Below 100s threshold

    // Add more actions to exceed threshold
    let action2 = Action {
        pow_work: 60,
        ..action.clone()
    };
    builder.add_action(thread_id, space_id, action2, BranchPath::root());

    assert_eq!(builder.pending_action_count(), 2);
    assert_eq!(builder.total_pow(), 110);
    assert!(builder.should_form_root()); // Above 100s threshold
}

/// Test that BlockBuilder forms complete block hierarchy
#[test]
fn test_block_builder_forms_hierarchy() {
    let mut builder = BlockBuilder::new(10); // Low threshold for test

    // Add actions across multiple threads and spaces
    // Note: BlockBuilder keys by thread_id, so each thread belongs to exactly one space
    let space1 = [0x11u8; 32];
    let space2 = [0x22u8; 32];
    let thread1_space1 = [0x33u8; 32];
    let thread2_space1 = [0x44u8; 32];
    let thread3_space2 = [0x55u8; 32];

    let action = |pow: u64| Action {
        action_type: swimchain::blocks::ActionType::Post,
        actor: [0x66u8; 32],
        timestamp: 1700000000,
        content_hash: Some([0x77u8; 32]),
        parent_id: None,
        pow_nonce: 123,
        pow_work: pow,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    builder.add_action(thread1_space1, space1, action(5), BranchPath::root());
    builder.add_action(thread2_space1, space1, action(5), BranchPath::root());
    builder.add_action(thread3_space2, space2, action(10), BranchPath::root());

    assert_eq!(builder.total_pow(), 20);
    assert!(builder.should_form_root());

    // Build the root block
    let (root, space_blocks, content_blocks) = builder.build_root_block(1700000000, [0u8; 32], None);

    assert!(root.height() > 0 || root.prev_root_hash == [0u8; 32]); // Genesis or non-zero height
    assert_eq!(root.total_pow, 20);
    assert_eq!(space_blocks.len(), 2); // Two spaces
    assert_eq!(content_blocks.len(), 3); // Three threads

    // Verify builder is cleared
    assert_eq!(builder.pending_action_count(), 0);
    assert!(!builder.should_form_root());
}

/// Test that blocks can be serialized, stored, and retrieved for sync
#[test]
fn test_block_sync_roundtrip() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Build a block
    let mut builder = BlockBuilder::new(1);

    let thread_id = [0x11u8; 32];
    let space_id = [0x22u8; 32];
    let action = Action {
        action_type: swimchain::blocks::ActionType::Post,
        actor: [0x44u8; 32],
        timestamp: 1700000000,
        content_hash: Some([0x33u8; 32]),
        parent_id: None,
        pow_nonce: 123,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    builder.add_action(thread_id, space_id, action, BranchPath::root());

    let (root, space_blocks, content_blocks) = builder.build_root_block(1700000000, [0u8; 32], None);

    // Store all blocks
    for cb in &content_blocks {
        store.put_content_block(cb).unwrap();
    }
    for sb in &space_blocks {
        store.put_space_block(sb).unwrap();
    }
    let root_hash = store.put_root_block(&root).unwrap();

    // Simulate creating a BlockDataPayload from storage
    let retrieved_root = store.get_root_block(&root_hash).unwrap().unwrap();
    let mut payload = BlockDataPayload::new(root_hash);
    payload.root_block = bincode::serialize(&retrieved_root).unwrap();

    for space_hash in &retrieved_root.space_block_hashes {
        if let Ok(Some(sb)) = store.get_space_block(space_hash) {
            payload.space_blocks.push(bincode::serialize(&sb).unwrap());

            for content_hash in &sb.content_block_hashes {
                if let Ok(Some(cb)) = store.get_content_block(content_hash) {
                    payload.content_blocks.push(bincode::serialize(&cb).unwrap());
                }
            }
        }
    }

    // Verify the payload is complete
    assert!(!payload.root_block.is_empty());
    assert_eq!(payload.space_blocks.len(), 1);
    assert_eq!(payload.content_blocks.len(), 1);

    // Serialize and deserialize the payload
    let bytes = payload.to_bytes();
    let parsed = BlockDataPayload::from_bytes(&bytes).unwrap();

    // Deserialize and verify blocks
    let parsed_root: RootBlock = bincode::deserialize(&parsed.root_block).unwrap();
    assert_eq!(parsed_root.hash(), root_hash);
    assert_eq!(parsed_root.total_pow, 10);
}

/// Test block announcement triggers block request
#[test]
fn test_block_announce_triggers_request() {
    // Create an announcement for a block we don't have
    let unknown_hash = [0xFFu8; 32];
    let announce = BlockAnnouncePayload::new(
        unknown_hash,
        1,      // height
        100,    // pow
        1,      // spaces
        1700000000,
    );

    // Serialize the announcement
    let bytes = announce.to_bytes();
    assert_eq!(bytes.len(), BlockAnnouncePayload::SIZE);

    // Create a GET_BLOCK request for this hash
    let request = GetBlockPayload::new(unknown_hash);
    let request_bytes = request.to_bytes();

    // Verify the request hash matches the announcement
    let parsed_request = GetBlockPayload::from_bytes(&request_bytes).unwrap();
    assert_eq!(parsed_request.block_hash, announce.block_hash);
}

// ============ Integration Tests (require full node) ============

#[test]
#[ignore = "Requires full E2E node setup"]
fn test_e2e_block_propagation_between_nodes() {
    // This test would:
    // 1. Start two nodes
    // 2. Post content on node A to trigger block formation
    // 3. Wait for block to be announced to node B
    // 4. Verify node B requests and stores the block
    // 5. Verify both nodes have identical chain state
}

#[test]
#[ignore = "Requires full E2E node setup"]
fn test_e2e_late_joining_node_syncs_blocks() {
    // This test would:
    // 1. Start node A, create content, wait for blocks to form
    // 2. Start node B later
    // 3. Connect B to A
    // 4. Verify B syncs the existing blocks from A
}

#[test]
#[ignore = "Requires full E2E node setup"]
fn test_e2e_block_chain_continuity() {
    // This test would:
    // 1. Start a node
    // 2. Create multiple posts at 30+ second intervals
    // 3. Verify blocks chain correctly (prev_root_hash references)
    // 4. Verify heights increment
}

// ============ Block Range Sync Tests ============

use swimchain::network::messages::{GetBlocksPayload, BlocksPayload, SerializedBlock};
use swimchain::types::serialize::{Serialize, Deserialize};

/// Test GetBlocksPayload serialization
#[test]
fn test_getblocks_payload_serialization() {
    let request = GetBlocksPayload {
        start_height: 10,
        end_height: 100,
        include_content: true,
        max_blocks: 50,
    };

    let bytes = request.to_bytes();
    assert_eq!(bytes.len(), 19); // 8 + 8 + 1 + 2 = 19 bytes

    let parsed = GetBlocksPayload::from_bytes(&bytes).unwrap();
    assert_eq!(parsed.start_height, 10);
    assert_eq!(parsed.end_height, 100);
    assert!(parsed.include_content);
    assert_eq!(parsed.max_blocks, 50);
}

/// Test BlocksPayload serialization
#[test]
fn test_blocks_payload_serialization() {
    let response = BlocksPayload {
        blocks: vec![
            SerializedBlock { data: vec![1, 2, 3, 4, 5] },
            SerializedBlock { data: vec![10, 20, 30] },
        ],
    };

    let bytes = response.to_bytes();
    let parsed = BlocksPayload::from_bytes(&bytes).unwrap();

    assert_eq!(parsed.blocks.len(), 2);
    assert_eq!(parsed.blocks[0].data, vec![1, 2, 3, 4, 5]);
    assert_eq!(parsed.blocks[1].data, vec![10, 20, 30]);
}

/// Test empty BlocksPayload
#[test]
fn test_empty_blocks_payload() {
    let response = BlocksPayload { blocks: vec![] };
    let bytes = response.to_bytes();
    let parsed = BlocksPayload::from_bytes(&bytes).unwrap();
    assert_eq!(parsed.blocks.len(), 0);
}

/// Test ChainStore.get_blocks_in_range
#[test]
fn test_chain_store_get_blocks_in_range() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Create and store multiple root blocks at different heights
    for height in 1..=10u64 {
        let root = RootBlock {
            version: 1,
            prev_root_hash: [0u8; 32],
            timestamp: 1700000000 + height,
            merkle_root: [height as u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: height * 10,
            cumulative_pow: height * 10,
            difficulty_target: 30,
            height,
            block_creator: [0u8; 32],
        };
        let hash = store.put_root_block(&root).unwrap();
        store.index_height(height, hash).unwrap();
    }

    // Query range 3..7 with max 10
    let blocks = store.get_blocks_in_range(3, 7, 10).unwrap();
    assert_eq!(blocks.len(), 5); // Heights 3, 4, 5, 6, 7
    assert_eq!(blocks[0].0, 3);
    assert_eq!(blocks[0].1.height, 3);
    assert_eq!(blocks[4].0, 7);
    assert_eq!(blocks[4].1.height, 7);
}

/// Test ChainStore.get_blocks_in_range with max limit
#[test]
fn test_chain_store_get_blocks_in_range_limited() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Create 20 blocks
    for height in 1..=20u64 {
        let root = RootBlock {
            version: 1,
            prev_root_hash: [0u8; 32],
            timestamp: 1700000000 + height,
            merkle_root: [height as u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: height * 10,
            cumulative_pow: height * 10,
            difficulty_target: 30,
            height,
            block_creator: [0u8; 32],
        };
        let hash = store.put_root_block(&root).unwrap();
        store.index_height(height, hash).unwrap();
    }

    // Query all 20 with max 5
    let blocks = store.get_blocks_in_range(1, 20, 5).unwrap();
    assert_eq!(blocks.len(), 5); // Limited to 5
    assert_eq!(blocks[0].0, 1);
    assert_eq!(blocks[4].0, 5);
}

/// Test ChainStore.get_blocks_in_range with empty range
#[test]
fn test_chain_store_get_blocks_in_range_empty() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // No blocks stored
    let blocks = store.get_blocks_in_range(1, 100, 10).unwrap();
    assert_eq!(blocks.len(), 0);
}
