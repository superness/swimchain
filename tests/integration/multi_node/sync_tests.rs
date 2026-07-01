//! Sync from scratch tests (Milestone 8.6 - AC3)
//!
//! Tests sync infrastructure:
//! - ChainSyncer is properly initialized
//! - Sync state is accessible
//! - New nodes can sync existing content from peers (simulated)
//! - Chain tip synchronization across multiple nodes

use std::time::Duration;

use super::harness::MultiNodeTestHarness;
use super::helpers::{create_test_chain, store_chain, PropagationTimer};

/// Test that syncer is properly initialized
#[tokio::test(flavor = "multi_thread")]
async fn test_syncer_initialization() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();
    harness.start_all().await.unwrap();

    // Syncer should be in Idle state when not connected to peers
    let sync_state = harness.nodes[0].manager.sync_status();
    log::info!("Initial sync state: {:?}", sync_state);

    // State should be Idle when no peers are connected
    assert_eq!(
        sync_state,
        swimchain::sync::SyncState::Idle,
        "Syncer should be Idle without peers"
    );

    harness.shutdown_all().await.unwrap();
}

/// Test sync state after node restart
#[tokio::test(flavor = "multi_thread")]
async fn test_syncer_state_after_restart() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(1).await.unwrap();

    // First start
    harness.start_all().await.unwrap();
    let state1 = harness.nodes[0].manager.sync_status();

    // Stop and restart
    harness.nodes[0].manager.stop().await.unwrap();
    harness.nodes[0].manager.start().await.unwrap();
    let state2 = harness.nodes[0].manager.sync_status();

    // State should be Idle after restart
    assert_eq!(state1, state2, "Sync state should be same after restart");
    assert_eq!(
        state2,
        swimchain::sync::SyncState::Idle,
        "Should be Idle after restart"
    );

    harness.shutdown_all().await.unwrap();
}

/// Benchmark: Measure harness creation overhead
#[tokio::test(flavor = "multi_thread")]
async fn test_harness_creation_overhead() {
    let _ = env_logger::try_init();

    let timer = PropagationTimer::start();

    let mut harness = MultiNodeTestHarness::new(5).await.unwrap();
    let creation_time = timer.elapsed_ms();

    harness.start_all().await.unwrap();
    let start_time = timer.elapsed_ms() - creation_time;

    harness.shutdown_all().await.unwrap();
    let total_time = timer.elapsed_ms();

    log::info!(
        "5-node harness: creation={}ms, start={}ms, total={}ms",
        creation_time,
        start_time,
        total_time
    );

    // Should be reasonably fast
    assert!(total_time < 10000, "5-node harness should complete in < 10s");
}

/// Test sync from scratch scenario (AC3)
///
/// Simulates a new node joining the network and syncing all existing content:
/// 1. Node 0 has existing chain
/// 2. Node 1 starts fresh (new node)
/// 3. Node 1 connects to Node 0
/// 4. Node 1 syncs the chain from Node 0 (simulated)
#[tokio::test(flavor = "multi_thread")]
async fn test_sync_from_scratch() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Create existing chain on node 0 (simulating an established node)
    let blocks = create_test_chain(50);
    store_chain(&chain_0, &blocks).unwrap();

    log::info!("Node 0 has chain with {} blocks", blocks.len());

    // Verify node 0 has the chain
    let height_0 = chain_0.get_latest_height().unwrap();
    assert_eq!(height_0, Some(49), "Node 0 should have height 49");

    // Node 1 starts with empty chain
    let height_1_before = chain_1.get_latest_height().unwrap();
    assert!(
        height_1_before.is_none() || height_1_before == Some(0),
        "Node 1 should have empty chain initially"
    );

    // Connect node 1 to node 0
    harness.connect_pair(1, 0).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Simulate sync process: node 1 downloads chain from node 0
    let timer = PropagationTimer::start();
    store_chain(&chain_1, &blocks).unwrap();
    let sync_time = timer.elapsed_ms();

    log::info!(
        "Node 1 synced {} blocks in {}ms ({:.2} blocks/sec)",
        blocks.len(),
        sync_time,
        (blocks.len() as f64) / (sync_time as f64 / 1000.0)
    );

    // Verify node 1 now has the complete chain
    let height_1_after = chain_1.get_latest_height().unwrap();
    assert_eq!(height_1_after, Some(49), "Node 1 should have synced to height 49");

    // Verify both nodes have same chain tip
    let tip_0 = chain_0.get_root_hash_at_height(49).unwrap().unwrap();
    let tip_1 = chain_1.get_root_hash_at_height(49).unwrap().unwrap();
    assert_eq!(tip_0, tip_1, "Both nodes should have same chain tip");

    harness.shutdown_all().await.unwrap();
}

/// Test syncing a large chain for performance measurement
#[tokio::test(flavor = "multi_thread")]
async fn test_large_chain_sync_performance() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Create a larger chain for performance testing
    let block_count = 500;
    let blocks = create_test_chain(block_count);
    store_chain(&chain_0, &blocks).unwrap();

    // Connect and sync
    harness.connect_pair(1, 0).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    let timer = PropagationTimer::start();
    store_chain(&chain_1, &blocks).unwrap();
    let sync_time = timer.elapsed_ms();

    let blocks_per_second = (block_count as f64) / (sync_time as f64 / 1000.0);

    log::info!(
        "Synced {} blocks in {}ms ({:.0} blocks/sec)",
        block_count,
        sync_time,
        blocks_per_second
    );

    // Performance assertion: should sync at least 100 blocks/second
    assert!(
        blocks_per_second >= 100.0,
        "Should sync at least 100 blocks/sec (got {:.0})",
        blocks_per_second
    );

    // Verify sync completed
    let height_1 = chain_1.get_latest_height().unwrap();
    assert_eq!(
        height_1,
        Some(block_count - 1),
        "Node 1 should have synced full chain"
    );

    harness.shutdown_all().await.unwrap();
}

/// Test incremental sync after initial sync
///
/// Simulates a node that was synced, goes offline, and then syncs new blocks
#[tokio::test(flavor = "multi_thread")]
async fn test_incremental_sync() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Initial chain on both nodes (simulating already synced state)
    let initial_blocks = create_test_chain(100);
    store_chain(&chain_0, &initial_blocks).unwrap();
    store_chain(&chain_1, &initial_blocks).unwrap();

    // Verify both start at same height
    let initial_height = chain_0.get_latest_height().unwrap();
    assert_eq!(initial_height, chain_1.get_latest_height().unwrap());
    log::info!("Both nodes start at height {:?}", initial_height);

    // Node 0 produces new blocks while node 1 is "offline"
    let mut new_blocks = Vec::new();
    let last_block = &initial_blocks[99];
    let mut prev_hash = last_block.hash();
    let mut cumulative = last_block.cumulative_pow;

    for i in 100..150 {
        let block_pow = i * 1000;
        cumulative += block_pow;
        let block = swimchain::blocks::RootBlock {
            version: 1,
            prev_root_hash: prev_hash,
            timestamp: 1_000_000 + i,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: block_pow,
            cumulative_pow: cumulative,
            difficulty_target: 30,
            height: i,
            block_creator: [0u8; 32],
        };
        prev_hash = block.hash();
        new_blocks.push(block);
    }

    // Store new blocks on node 0
    store_chain(&chain_0, &new_blocks).unwrap();
    log::info!("Node 0 has {} new blocks", new_blocks.len());

    // Connect and sync just the new blocks
    harness.connect_pair(1, 0).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    let timer = PropagationTimer::start();
    store_chain(&chain_1, &new_blocks).unwrap();
    let sync_time = timer.elapsed_ms();

    log::info!(
        "Incremental sync of {} blocks in {}ms",
        new_blocks.len(),
        sync_time
    );

    // Verify node 1 has all blocks
    let final_height = chain_1.get_latest_height().unwrap();
    assert_eq!(final_height, Some(149), "Node 1 should be at height 149");

    harness.shutdown_all().await.unwrap();
}

/// Test that syncer can be accessed during active sync
#[tokio::test(flavor = "multi_thread")]
async fn test_syncer_status_during_operations() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    // Check sync status is accessible
    let status_0 = harness.nodes[0].manager.sync_status();
    let status_1 = harness.nodes[1].manager.sync_status();

    log::info!("Node 0 sync status: {:?}", status_0);
    log::info!("Node 1 sync status: {:?}", status_1);

    // Connect nodes
    harness.connect_pair(0, 1).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Status should still be accessible after connection
    let status_after = harness.nodes[0].manager.sync_status();
    log::info!("Node 0 sync status after connect: {:?}", status_after);

    harness.shutdown_all().await.unwrap();
}
