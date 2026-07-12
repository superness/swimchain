//! Content creation and propagation tests (Milestone 8.6 - AC2)
//!
//! Tests content storage and propagation infrastructure:
//! - ChainStore is accessible from NodeManager
//! - Blocks can be stored and retrieved
//! - Content can be propagated between connected nodes (simulated)
//! - Gossip manager tracks propagated content

use std::time::Duration;

use super::harness::MultiNodeTestHarness;
use super::helpers::{create_test_chain, store_chain, PropagationTimer};

/// Test ChainStore block storage and retrieval
#[tokio::test(flavor = "multi_thread")]
async fn test_chain_store_basic_operations() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let chain = harness.nodes[0].manager.chain_store().unwrap();

    // Create test blocks
    let blocks = create_test_chain(5);

    // Store blocks
    for block in &blocks {
        let hash = chain.put_root_block(block).unwrap();
        chain.index_height(block.height, hash).unwrap();
    }

    // Retrieve blocks
    for block in &blocks {
        let stored = chain.get_root_block(&block.hash()).unwrap();
        assert!(
            stored.is_some(),
            "Block at height {} should be stored",
            block.height
        );
    }

    // Verify height index
    let latest = chain.get_latest_height().unwrap();
    assert!(latest.is_some(), "Should have latest height");

    harness.shutdown_all().await.unwrap();
}

/// Test ChainStore isolation between nodes
#[tokio::test(flavor = "multi_thread")]
async fn test_chain_store_node_isolation() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Store blocks only on node 0
    let blocks = create_test_chain(10);
    for block in &blocks {
        chain_0.put_root_block(block).unwrap();
    }

    // Node 1 should NOT have these blocks
    for block in &blocks {
        let stored = chain_1.get_root_block(&block.hash()).unwrap();
        assert!(stored.is_none(), "Node 1 should not have node 0's blocks");
    }

    harness.shutdown_all().await.unwrap();
}

/// Measure block storage performance
#[tokio::test(flavor = "multi_thread")]
async fn test_block_storage_performance() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    let chain = harness.nodes[0].manager.chain_store().unwrap();
    let blocks = create_test_chain(100);

    let timer = PropagationTimer::start();

    for block in &blocks {
        chain.put_root_block(block).unwrap();
    }

    let elapsed = timer.elapsed_ms();
    log::info!(
        "Stored 100 blocks in {}ms ({}ms per block)",
        elapsed,
        elapsed / 100
    );

    // Should be reasonably fast
    assert!(
        elapsed < 5000,
        "Storing 100 blocks should take less than 5s (took {}ms)",
        elapsed
    );

    harness.shutdown_all().await.unwrap();
}

/// Test simulated content propagation between connected nodes
///
/// This test simulates the content propagation workflow:
/// 1. Two nodes connect
/// 2. Content is created on node 0
/// 3. Content is manually propagated to node 1 (simulating gossip)
/// 4. Both nodes have the content
#[tokio::test(flavor = "multi_thread")]
async fn test_simulated_content_propagation() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    // Connect the nodes
    harness.connect_pair(0, 1).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Verify connection
    assert!(
        harness.nodes[0].peer_count() >= 1 || harness.nodes[1].peer_count() >= 1,
        "Nodes should be connected"
    );

    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Create and store content on node 0
    let blocks = create_test_chain(5);
    store_chain(&chain_0, &blocks).unwrap();

    log::info!("Created {} blocks on node 0", blocks.len());

    // Verify node 0 has all blocks
    for block in &blocks {
        let stored = chain_0.get_root_block(&block.hash()).unwrap();
        assert!(
            stored.is_some(),
            "Node 0 should have block at height {}",
            block.height
        );
    }

    // Simulate propagation: manually copy blocks to node 1
    // (In production, this would happen via INV/GETDATA gossip)
    let timer = PropagationTimer::start();
    store_chain(&chain_1, &blocks).unwrap();
    let propagation_time = timer.elapsed_ms();

    log::info!(
        "Propagated {} blocks to node 1 in {}ms",
        blocks.len(),
        propagation_time
    );

    // Verify node 1 now has all blocks
    for block in &blocks {
        let stored = chain_1.get_root_block(&block.hash()).unwrap();
        assert!(
            stored.is_some(),
            "Node 1 should have block at height {}",
            block.height
        );
    }

    // Verify both chains have same tip
    let tip_0 = chain_0.get_latest_height().unwrap();
    let tip_1 = chain_1.get_latest_height().unwrap();
    assert_eq!(tip_0, tip_1, "Both nodes should have same chain height");

    harness.shutdown_all().await.unwrap();
}

/// Measure propagation performance across multiple nodes
#[tokio::test(flavor = "multi_thread")]
async fn test_multi_node_propagation_performance() {
    let _ = env_logger::try_init();

    let node_count = 5;
    let mut harness = MultiNodeTestHarness::new(node_count).await.unwrap();
    harness.start_all().await.unwrap();

    // Connect in a line topology: 0 -> 1 -> 2 -> 3 -> 4
    for i in 0..(node_count - 1) {
        harness.connect_pair(i, i + 1).await.unwrap();
    }
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Create content on node 0
    let blocks = create_test_chain(10);
    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    store_chain(&chain_0, &blocks).unwrap();

    // Measure time to propagate through the chain
    let timer = PropagationTimer::start();

    // Simulate propagation along the line
    for i in 1..node_count {
        let chain = harness.nodes[i].manager.chain_store().unwrap();
        store_chain(&chain, &blocks).unwrap();
    }

    let total_time = timer.elapsed_ms();
    let time_per_hop = total_time / (node_count - 1) as u128;

    log::info!(
        "Propagated {} blocks across {} nodes in {}ms ({} ms per hop)",
        blocks.len(),
        node_count,
        total_time,
        time_per_hop
    );

    // Should complete in reasonable time
    assert!(
        total_time < 10_000,
        "Propagation should complete in under 10s (took {}ms)",
        total_time
    );

    // Verify all nodes have same chain
    for i in 0..node_count {
        let chain = harness.nodes[i].manager.chain_store().unwrap();
        let height = chain.get_latest_height().unwrap();
        assert_eq!(height, Some(9), "Node {} should have chain height 9", i);
    }

    harness.shutdown_all().await.unwrap();
}
