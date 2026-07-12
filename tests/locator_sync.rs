//! Tests for Headers-First Sync & Locator Pattern (Phase 2)
//!
//! Tests all components:
//! - Locator generation (exponential backoff pattern)
//! - Locator matching (finding common ancestor)
//! - Fork resolution with locators

use swimchain::blocks::RootBlock;
use swimchain::network::messages::{GetBlocksLocatorPayload, GetHeadersLocatorPayload};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

// =========================================================================
// Test Helpers
// =========================================================================

/// Create a simple root block at given height with prev_hash linking
fn create_test_block(height: u64, prev_root_hash: [u8; 32], cumulative_pow: u64) -> RootBlock {
    RootBlock {
        version: 1,
        prev_root_hash,
        timestamp: 1700000000 + height,
        merkle_root: [0u8; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: 10, // 10 PoW per block
        cumulative_pow,
        difficulty_target: 30,
        height,
        block_creator: [0u8; 32],
    }
}

/// Build a chain of N blocks and store them, returning blocks and their hashes
fn build_chain(store: &ChainStore, num_blocks: u64) -> Vec<(RootBlock, [u8; 32])> {
    let mut blocks = Vec::new();
    let mut prev_hash = [0u8; 32]; // Genesis prev_hash
    let mut cumulative = 0u64;

    for height in 0..num_blocks {
        cumulative += 10; // Each block adds 10 PoW
        let block = create_test_block(height, prev_hash, cumulative);
        let hash = block.hash();
        prev_hash = hash;
        store.put_root_block(&block).unwrap();
        // Index the block by height for locator generation
        store.index_height(height, hash).unwrap();
        blocks.push((block, hash));
    }

    blocks
}

// =========================================================================
// Unit Tests: Locator Generation
// =========================================================================

#[test]
fn test_locator_empty_chain() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let locator = store.generate_locator().unwrap();
    assert!(
        locator.is_empty(),
        "Empty chain should produce empty locator"
    );
}

#[test]
fn test_locator_single_block() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let blocks = build_chain(&store, 1);
    let locator = store.generate_locator().unwrap();

    assert_eq!(
        locator.len(),
        1,
        "Single block chain should have 1 locator hash"
    );
    assert_eq!(
        locator[0], blocks[0].1,
        "Locator should contain genesis hash"
    );
}

#[test]
fn test_locator_short_chain() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let blocks = build_chain(&store, 5);
    let locator = store.generate_locator().unwrap();

    // For height 4 (5 blocks): should have tip, then dense, then genesis
    assert!(!locator.is_empty());
    assert_eq!(locator[0], blocks[4].1, "First hash should be tip");
    assert_eq!(
        *locator.last().unwrap(),
        blocks[0].1,
        "Last hash should be genesis"
    );
}

#[test]
fn test_locator_exponential_pattern() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Build a chain of 100 blocks (height 0-99)
    let blocks = build_chain(&store, 100);
    let locator = store.generate_locator().unwrap();

    // Verify locator structure per implementation:
    // tip (99), tip-1 (98), tip-2 (97), then exponential from tip-3
    assert_eq!(locator[0], blocks[99].1, "First should be tip");
    assert_eq!(locator[1], blocks[98].1, "Second should be tip-1");
    assert_eq!(locator[2], blocks[97].1, "Third should be tip-2");

    // Last should always be genesis
    assert_eq!(
        *locator.last().unwrap(),
        blocks[0].1,
        "Last should be genesis"
    );

    // Locator should be logarithmic in size (~15-20 hashes for 100 blocks)
    assert!(
        locator.len() < 20,
        "Locator should be logarithmic, got {} hashes",
        locator.len()
    );
    assert!(
        locator.len() > 5,
        "Locator should have enough hashes for 100 blocks"
    );

    println!(
        "Chain of 100 blocks produced locator with {} hashes",
        locator.len()
    );
}

#[test]
fn test_locator_very_long_chain() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Build chain of 10000 blocks
    let blocks = build_chain(&store, 10000);
    let locator = store.generate_locator().unwrap();

    // Even for 10000 blocks, locator should be small (log2(10000) ≈ 13)
    assert!(
        locator.len() < 25,
        "Locator for 10k blocks should be < 25 hashes, got {}",
        locator.len()
    );

    // First and last should be correct
    assert_eq!(locator[0], blocks[9999].1, "First should be tip");
    assert_eq!(
        *locator.last().unwrap(),
        blocks[0].1,
        "Last should be genesis"
    );

    println!(
        "Chain of 10000 blocks produced locator with {} hashes",
        locator.len()
    );
}

// =========================================================================
// Unit Tests: Locator Matching
// =========================================================================

#[test]
fn test_find_locator_match_same_chain() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    build_chain(&store, 50);
    let locator = store.generate_locator().unwrap();

    // Our own locator should match at tip
    let match_height = store.find_locator_match(&locator).unwrap();
    assert_eq!(match_height, Some(49), "Should match at tip height");
}

#[test]
fn test_find_locator_match_behind() {
    // Node A has 100 blocks, Node B has 50 blocks
    // B's locator should match at height 49 in A's chain

    let dir_a = tempdir().unwrap();
    let store_a = ChainStore::open(dir_a.path()).unwrap();
    let blocks = build_chain(&store_a, 100);

    let dir_b = tempdir().unwrap();
    let store_b = ChainStore::open(dir_b.path()).unwrap();

    // Build B with same first 50 blocks
    for (block, hash) in blocks.iter().take(50) {
        store_b.put_root_block(block).unwrap();
        store_b.index_height(block.height, *hash).unwrap();
    }

    // B generates locator (tip at 49)
    let locator_b = store_b.generate_locator().unwrap();

    // A finds match in B's locator
    let match_height = store_a.find_locator_match(&locator_b).unwrap();
    assert_eq!(
        match_height,
        Some(49),
        "Should match at B's tip (height 49)"
    );
}

#[test]
fn test_find_locator_match_no_common_history() {
    // Two completely different chains
    let dir_a = tempdir().unwrap();
    let store_a = ChainStore::open(dir_a.path()).unwrap();
    build_chain(&store_a, 50);

    let dir_b = tempdir().unwrap();
    let store_b = ChainStore::open(dir_b.path()).unwrap();

    // Build completely different chain for B (different starting hash)
    let mut prev_hash = [0xFFu8; 32]; // Different "genesis" prev
    let mut cumulative = 0u64;
    for height in 0..50 {
        cumulative += 10;
        let mut block = create_test_block(height, prev_hash, cumulative);
        block.merkle_root[0] = 0xEE; // Make hashes different
        block.merkle_root[1] = height as u8;
        let hash = block.hash();
        prev_hash = hash;
        store_b.put_root_block(&block).unwrap();
        store_b.index_height(height, hash).unwrap();
    }

    let locator_b = store_b.generate_locator().unwrap();

    // A should find no match
    let match_height = store_a.find_locator_match(&locator_b).unwrap();
    assert_eq!(match_height, None, "Should find no common ancestor");
}

#[test]
fn test_find_locator_match_fork_scenario() {
    // Two chains that share first 30 blocks, then diverge
    let dir_a = tempdir().unwrap();
    let store_a = ChainStore::open(dir_a.path()).unwrap();

    // Build common prefix
    let common_blocks = build_chain(&store_a, 30);

    // Continue A to height 99
    let mut prev_hash = common_blocks[29].1;
    let mut cumulative = common_blocks[29].0.cumulative_pow;
    for height in 30..100 {
        cumulative += 10;
        let block = create_test_block(height, prev_hash, cumulative);
        let hash = block.hash();
        prev_hash = hash;
        store_a.put_root_block(&block).unwrap();
        store_a.index_height(height, hash).unwrap();
    }

    // Build B with same common prefix, then different continuation
    let dir_b = tempdir().unwrap();
    let store_b = ChainStore::open(dir_b.path()).unwrap();

    for (block, hash) in &common_blocks {
        store_b.put_root_block(block).unwrap();
        store_b.index_height(block.height, *hash).unwrap();
    }

    // B continues differently
    let mut prev_hash = common_blocks[29].1;
    let mut cumulative = common_blocks[29].0.cumulative_pow;
    for height in 30..80 {
        cumulative += 10;
        let mut block = create_test_block(height, prev_hash, cumulative);
        block.merkle_root[0] = 0xBB; // Different fork
        let hash = block.hash();
        prev_hash = hash;
        store_b.put_root_block(&block).unwrap();
        store_b.index_height(height, hash).unwrap();
    }

    // B's locator
    let locator_b = store_b.generate_locator().unwrap();

    // A should find a common ancestor - may not be exact fork point due to exponential spacing
    // B's locator from tip 79: 79, 78, 77, 76, 74, 70, 62, 46, 14, 0 (approximately)
    // Only heights ≤29 will match, highest in locator is 14
    let match_height = store_a.find_locator_match(&locator_b).unwrap();
    assert!(match_height.is_some(), "Should find a common ancestor");
    assert!(
        match_height.unwrap() <= 29,
        "Common ancestor should be at or below fork point"
    );
    // The exact height depends on locator pattern, but should be reasonable
    println!(
        "Fork at 29, locator found common ancestor at {:?}",
        match_height
    );
}

// =========================================================================
// Message Structure Tests
// =========================================================================

#[test]
fn test_getblocks_locator_payload_creation() {
    let mut locator_hashes = Vec::new();
    for i in 0..10 {
        let mut hash = [0u8; 32];
        hash[0] = i;
        locator_hashes.push(hash);
    }

    let payload = GetBlocksLocatorPayload::new(locator_hashes.clone(), 50);

    assert_eq!(payload.locator_hashes.len(), 10);
    assert_eq!(payload.max_blocks, 50);
    for (orig, stored) in locator_hashes.iter().zip(payload.locator_hashes.iter()) {
        assert_eq!(orig, stored);
    }
}

#[test]
fn test_getheaders_locator_payload_creation() {
    let mut locator_hashes = Vec::new();
    for i in 0..15 {
        let mut hash = [0u8; 32];
        hash[0] = i;
        locator_hashes.push(hash);
    }

    let payload = GetHeadersLocatorPayload::new(locator_hashes.clone(), 100);

    assert_eq!(payload.locator_hashes.len(), 15);
    assert_eq!(payload.max_headers, 100);
}

// =========================================================================
// Integration Tests: Get Blocks From Height
// =========================================================================

#[test]
fn test_get_blocks_from_height() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let blocks = build_chain(&store, 100);

    // Get blocks starting from height 50
    let fetched = store.get_blocks_from_height(50, 20).unwrap();

    assert_eq!(fetched.len(), 20);
    assert_eq!(fetched[0].height, 50);
    assert_eq!(fetched[19].height, 69);

    for (i, block) in fetched.iter().enumerate() {
        assert_eq!(block.hash(), blocks[50 + i].1);
    }
}

#[test]
fn test_get_blocks_from_height_at_tip() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    build_chain(&store, 100);

    // Request more blocks than available from near tip
    let fetched = store.get_blocks_from_height(95, 50).unwrap();

    // Should only get 5 blocks (95, 96, 97, 98, 99)
    assert_eq!(fetched.len(), 5);
    assert_eq!(fetched[0].height, 95);
    assert_eq!(fetched[4].height, 99);
}

// =========================================================================
// Fork Resolution Tests
// =========================================================================

#[test]
fn test_fork_resolution_find_common_ancestor() {
    // Simulate two nodes that diverged and need to find common ancestor

    let dir_main = tempdir().unwrap();
    let store_main = ChainStore::open(dir_main.path()).unwrap();

    // Build main chain
    let main_blocks = build_chain(&store_main, 100);

    // Simulate a peer that forked at height 60
    let dir_peer = tempdir().unwrap();
    let store_peer = ChainStore::open(dir_peer.path()).unwrap();

    // Peer has same chain up to height 60
    for (block, hash) in main_blocks.iter().take(61) {
        store_peer.put_root_block(block).unwrap();
        store_peer.index_height(block.height, *hash).unwrap();
    }

    // Peer continued on different fork to height 80
    let mut prev_hash = main_blocks[60].1;
    let mut cumulative = main_blocks[60].0.cumulative_pow;
    for height in 61..81 {
        cumulative += 10;
        let mut block = create_test_block(height, prev_hash, cumulative);
        block.merkle_root[0] = 0xAA; // Peer fork marker
        let hash = block.hash();
        prev_hash = hash;
        store_peer.put_root_block(&block).unwrap();
        store_peer.index_height(height, hash).unwrap();
    }

    // Peer generates locator
    let peer_locator = store_peer.generate_locator().unwrap();

    // Main node finds common ancestor (may not be exact fork point due to locator spacing)
    let common_height = store_main.find_locator_match(&peer_locator).unwrap();

    assert!(common_height.is_some(), "Should find a common ancestor");
    let height = common_height.unwrap();
    assert!(
        height <= 60,
        "Common ancestor should be at or below fork point 60"
    );
    println!("Fork at 60, locator found common ancestor at {}", height);

    // Main can send blocks from common_height+1 onwards
    let blocks_to_send = store_main.get_blocks_from_height(height + 1, 100).unwrap();
    assert!(!blocks_to_send.is_empty(), "Should have blocks to send");
    assert_eq!(blocks_to_send[0].height, height + 1);
}

#[test]
fn test_fork_resolution_peer_ahead() {
    // Main at height 50, peer at height 100 (same chain)
    let dir_main = tempdir().unwrap();
    let store_main = ChainStore::open(dir_main.path()).unwrap();

    let dir_peer = tempdir().unwrap();
    let store_peer = ChainStore::open(dir_peer.path()).unwrap();

    // Build full chain in peer
    let all_blocks = build_chain(&store_peer, 100);

    // Main only has first 50
    for (block, hash) in all_blocks.iter().take(50) {
        store_main.put_root_block(block).unwrap();
        store_main.index_height(block.height, *hash).unwrap();
    }

    // Main generates locator (tip at 49)
    let main_locator = store_main.generate_locator().unwrap();

    // Peer finds match
    let match_height = store_peer.find_locator_match(&main_locator).unwrap();
    assert_eq!(match_height, Some(49));

    // Peer sends blocks from 50 onwards
    let blocks_to_send = store_peer.get_blocks_from_height(50, 100).unwrap();
    assert_eq!(blocks_to_send.len(), 50);
    assert_eq!(blocks_to_send[0].height, 50);
    assert_eq!(blocks_to_send[49].height, 99);
}

#[test]
fn test_fork_resolution_deep_reorg() {
    // Test finding common ancestor with deep fork (only share first 10 blocks)
    let dir_a = tempdir().unwrap();
    let store_a = ChainStore::open(dir_a.path()).unwrap();

    // Build common prefix
    let common = build_chain(&store_a, 10);

    // A continues to 1000
    let mut prev_hash = common[9].1;
    let mut cumulative = common[9].0.cumulative_pow;
    for height in 10..1000 {
        cumulative += 10;
        let block = create_test_block(height, prev_hash, cumulative);
        let hash = block.hash();
        prev_hash = hash;
        store_a.put_root_block(&block).unwrap();
        store_a.index_height(height, hash).unwrap();
    }

    // B has same common prefix, continues to 500
    let dir_b = tempdir().unwrap();
    let store_b = ChainStore::open(dir_b.path()).unwrap();

    for (block, hash) in &common {
        store_b.put_root_block(block).unwrap();
        store_b.index_height(block.height, *hash).unwrap();
    }

    let mut prev_hash = common[9].1;
    let mut cumulative = common[9].0.cumulative_pow;
    for height in 10..500 {
        cumulative += 10;
        let mut block = create_test_block(height, prev_hash, cumulative);
        block.merkle_root[0] = 0xBB;
        let hash = block.hash();
        prev_hash = hash;
        store_b.put_root_block(&block).unwrap();
        store_b.index_height(height, hash).unwrap();
    }

    // B's locator should still find common ancestor despite long chains
    let locator_b = store_b.generate_locator().unwrap();
    let match_height = store_a.find_locator_match(&locator_b).unwrap();

    // Common ancestor should be found at or below fork point (height 9)
    // Due to exponential spacing, might find genesis (0) instead of exact fork point
    assert!(match_height.is_some(), "Should find a common ancestor");
    assert!(
        match_height.unwrap() <= 9,
        "Common ancestor should be at or below fork point 9"
    );
    println!(
        "Fork at 9, locator found common ancestor at {:?}",
        match_height
    );

    // Verify locator is still small
    assert!(
        locator_b.len() < 25,
        "Locator should be logarithmic even for long chain"
    );
}

// =========================================================================
// Edge Cases
// =========================================================================

#[test]
fn test_locator_match_only_genesis() {
    // Two chains that only share genesis
    let dir_a = tempdir().unwrap();
    let store_a = ChainStore::open(dir_a.path()).unwrap();

    let blocks_a = build_chain(&store_a, 50);

    let dir_b = tempdir().unwrap();
    let store_b = ChainStore::open(dir_b.path()).unwrap();

    // B starts with same genesis
    store_b.put_root_block(&blocks_a[0].0).unwrap();
    store_b.index_height(0, blocks_a[0].1).unwrap();

    // B then diverges completely
    let mut prev_hash = blocks_a[0].1;
    let mut cumulative = blocks_a[0].0.cumulative_pow;
    for height in 1..50 {
        cumulative += 10;
        let mut block = create_test_block(height, prev_hash, cumulative);
        block.merkle_root[0] = 0xCC;
        let hash = block.hash();
        prev_hash = hash;
        store_b.put_root_block(&block).unwrap();
        store_b.index_height(height, hash).unwrap();
    }

    let locator_b = store_b.generate_locator().unwrap();
    let match_height = store_a.find_locator_match(&locator_b).unwrap();

    // Should match at genesis (height 0)
    assert_eq!(
        match_height,
        Some(0),
        "Should find genesis as only common block"
    );
}

#[test]
fn test_max_locator_hashes() {
    // Verify locator doesn't exceed reasonable size even for huge chains
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Build very long chain
    build_chain(&store, 50000);

    let locator = store.generate_locator().unwrap();

    // Should be bounded (MAX_LOCATOR_HASHES in protocol)
    assert!(
        locator.len() <= GetBlocksLocatorPayload::MAX_LOCATOR_HASHES,
        "Locator {} exceeds max {}",
        locator.len(),
        GetBlocksLocatorPayload::MAX_LOCATOR_HASHES
    );

    println!(
        "Chain of 50000 blocks produced locator with {} hashes",
        locator.len()
    );
}

#[test]
fn test_locator_heights_are_decreasing() {
    // Verify locator hashes correspond to strictly decreasing heights
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let blocks = build_chain(&store, 200);
    let locator = store.generate_locator().unwrap();

    // Build a map of hash -> height
    let hash_to_height: std::collections::HashMap<[u8; 32], u64> =
        blocks.iter().map(|(b, h)| (*h, b.height)).collect();

    let mut prev_height = u64::MAX;
    for hash in &locator {
        if let Some(&height) = hash_to_height.get(hash) {
            assert!(
                height < prev_height,
                "Locator heights must be strictly decreasing"
            );
            prev_height = height;
        }
    }
}
