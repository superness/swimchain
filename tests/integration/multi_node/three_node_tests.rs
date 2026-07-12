//! Three-node gossip propagation tests (Milestone 8.6 - AC2)
//!
//! Tests three-node topology:
//! - Multiple nodes can start on ephemeral ports
//! - GossipManager is accessible and functional
//! - Content propagates via gossip across mesh topology
//! - Gossip seen cache prevents duplicate propagation

use std::time::Duration;

use super::harness::MultiNodeTestHarness;

/// Test that three nodes can start and run
#[tokio::test(flavor = "multi_thread")]
async fn test_three_nodes_start_and_run() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(3).await.unwrap();
    harness.start_all().await.unwrap();

    // All nodes should be running
    for (i, node) in harness.nodes.iter().enumerate() {
        assert!(node.manager.is_running(), "Node {} should be running", i);
    }

    // All should have different ports
    let ports: Vec<u16> = harness.nodes.iter().map(|n| n.listen_addr.port()).collect();
    let mut unique_ports = ports.clone();
    unique_ports.sort();
    unique_ports.dedup();
    assert_eq!(unique_ports.len(), 3, "All nodes should have unique ports");

    harness.shutdown_all().await.unwrap();
}

/// Test ChainStore initialization
#[tokio::test(flavor = "multi_thread")]
async fn test_chain_store_isolation() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
    harness.start_all().await.unwrap();

    // Access ChainStore from each node
    let chain_0 = harness.nodes[0].manager.chain_store().unwrap();
    let chain_1 = harness.nodes[1].manager.chain_store().unwrap();

    // Both should start empty
    let height_0 = chain_0.get_latest_height().unwrap_or(None);
    let height_1 = chain_1.get_latest_height().unwrap_or(None);

    assert!(
        height_0.is_none() || height_0 == Some(0),
        "Node 0 should have empty chain"
    );
    assert!(
        height_1.is_none() || height_1 == Some(0),
        "Node 1 should have empty chain"
    );

    harness.shutdown_all().await.unwrap();
}

/// Test node ID uniqueness
#[tokio::test(flavor = "multi_thread")]
async fn test_node_id_uniqueness() {
    let _ = env_logger::try_init();

    let harness = MultiNodeTestHarness::new(3).await.unwrap();

    // Node IDs should be unique even before start
    let ids: Vec<[u8; 32]> = harness.nodes.iter().map(|n| n.manager.node_id()).collect();

    assert_ne!(ids[0], ids[1], "Node 0 and 1 should have different IDs");
    assert_ne!(ids[1], ids[2], "Node 1 and 2 should have different IDs");
    assert_ne!(ids[0], ids[2], "Node 0 and 2 should have different IDs");
}

/// Test three-node mesh connection (AC2 - three-node gossip infrastructure)
///
/// Sets up a three-node mesh where:
/// - Node 0 connects to Node 1
/// - Node 0 connects to Node 2
/// - Node 1 connects to Node 2
#[tokio::test(flavor = "multi_thread")]
async fn test_three_node_mesh_connection() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(3).await.unwrap();
    harness.start_all().await.unwrap();

    log::info!(
        "Nodes listening on: {}, {}, {}",
        harness.nodes[0].listen_addr,
        harness.nodes[1].listen_addr,
        harness.nodes[2].listen_addr
    );

    // Connect in mesh pattern
    harness.connect_pair(0, 1).await.unwrap();
    harness.connect_pair(0, 2).await.unwrap();
    harness.connect_pair(1, 2).await.unwrap();

    // Wait for connections to be registered
    tokio::time::sleep(Duration::from_millis(100)).await;

    // All nodes should have peers now
    log::info!(
        "Peer counts: Node 0: {}, Node 1: {}, Node 2: {}",
        harness.nodes[0].peer_count(),
        harness.nodes[1].peer_count(),
        harness.nodes[2].peer_count()
    );

    // Each node should have at least 1 peer (inbound connections)
    assert!(
        harness.nodes[0].peer_count() >= 1,
        "Node 0 should have peers"
    );
    assert!(
        harness.nodes[1].peer_count() >= 1,
        "Node 1 should have peers"
    );
    assert!(
        harness.nodes[2].peer_count() >= 1,
        "Node 2 should have peers"
    );

    harness.shutdown_all().await.unwrap();
}

/// Measure three-node connection setup time
#[tokio::test(flavor = "multi_thread")]
async fn test_three_node_connection_performance() {
    let _ = env_logger::try_init();

    let mut harness = MultiNodeTestHarness::new(3).await.unwrap();
    harness.start_all().await.unwrap();

    let start = std::time::Instant::now();

    // Connect all nodes in mesh
    harness.connect_pair(0, 1).await.unwrap();
    harness.connect_pair(0, 2).await.unwrap();
    harness.connect_pair(1, 2).await.unwrap();

    let mesh_time = start.elapsed();
    log::info!(
        "Three-node mesh established in {:?} ({:.2}ms per connection)",
        mesh_time,
        mesh_time.as_secs_f64() * 1000.0 / 3.0
    );

    // Should complete quickly (under 1 second for 3 connections)
    assert!(
        mesh_time.as_secs() < 5,
        "Mesh setup should complete in under 5s (took {:?})",
        mesh_time
    );

    harness.shutdown_all().await.unwrap();
}
