//! Test helper functions
//!
//! Utility functions for setting up and asserting on test networks.

use super::{
    mock_chain::MockBlock,
    test_network::{PropagationResult, TestNetwork, TestNetworkConfig},
};

/// Create a test network and propagate a genesis block
pub fn setup_network_with_genesis(config: TestNetworkConfig) -> (TestNetwork, MockBlock) {
    let mut network = TestNetwork::new(config);
    let genesis = MockBlock::genesis(1);
    network.propagate_block(&genesis, 0);
    (network, genesis)
}

/// Create a default 10-node mesh with genesis propagated
pub fn default_mesh_with_genesis() -> (TestNetwork, MockBlock) {
    setup_network_with_genesis(TestNetworkConfig::default())
}

/// Create a chain of N blocks and propagate through network
pub fn setup_network_with_chain(
    config: TestNetworkConfig,
    chain_length: usize,
) -> (TestNetwork, Vec<MockBlock>) {
    let mut network = TestNetwork::new(config);
    let chain = MockBlock::create_chain(1, chain_length);

    for block in &chain {
        network.propagate_block(block, 0);
    }

    (network, chain)
}

/// Assert all nodes have converged to the same tip
pub fn assert_converged(network: &TestNetwork) {
    assert!(
        network.all_converged(),
        "Network not converged: different tips found"
    );
}

/// Assert all nodes have the expected tip hash
pub fn assert_all_at_tip(network: &TestNetwork, expected_hash: &[u8; 32]) {
    for (i, node) in network.nodes().iter().enumerate() {
        assert_eq!(
            &node.chain_tip().hash,
            expected_hash,
            "Node {} has wrong tip",
            i
        );
    }
}

/// Assert all nodes have the expected height
pub fn assert_all_at_height(network: &TestNetwork, expected_height: u64) {
    for (i, node) in network.nodes().iter().enumerate() {
        assert_eq!(
            node.height(),
            expected_height,
            "Node {} at height {} expected {}",
            i,
            node.height(),
            expected_height
        );
    }
}

/// Assert propagation reached all nodes
pub fn assert_full_propagation(result: &PropagationResult, expected_nodes: usize) {
    assert_eq!(
        result.nodes_reached, expected_nodes,
        "Expected {} nodes reached, got {}",
        expected_nodes, result.nodes_reached
    );
}

/// Assert propagation time is within bounds
pub fn assert_latency_bounded(result: &PropagationResult, max_ms: u64) {
    assert!(
        result.elapsed_simulated_ms <= max_ms,
        "Propagation took {}ms, expected <= {}ms",
        result.elapsed_simulated_ms,
        max_ms
    );
}

/// Create partition groups: first half vs second half
pub fn partition_halves(total: usize) -> (Vec<usize>, Vec<usize>) {
    let mid = total / 2;
    ((0..mid).collect(), (mid..total).collect())
}

/// Assert only nodes in specified group received the block
pub fn assert_group_received(network: &TestNetwork, group: &[usize], block_hash: &[u8; 32]) {
    for (i, node) in network.nodes().iter().enumerate() {
        if group.contains(&i) {
            assert!(
                node.has_block(block_hash),
                "Node {} in group should have block",
                i
            );
        } else {
            assert!(
                !node.has_block(block_hash),
                "Node {} not in group should not have block",
                i
            );
        }
    }
}

/// Calculate expected hops for full mesh propagation
pub fn expected_full_mesh_hops(node_count: usize) -> usize {
    // In full mesh, origin sends to min(fanout, neighbors) = min(8, 9) = 8 for 10 nodes
    // Then those 8 try to send to 8 each, but most are already seen
    // So total is roughly node_count - 1 for first hop, then duplicates
    node_count - 1
}

/// Create a scenario with two competing chains
pub struct ForkScenario {
    pub chain_a: Vec<MockBlock>,
    pub chain_b: Vec<MockBlock>,
}

impl ForkScenario {
    /// Create a fork where both chains share the same genesis but diverge at height 1
    pub fn new(fork_length: usize) -> Self {
        let genesis = MockBlock::genesis(1);

        let mut chain_a = vec![genesis.clone()];
        let mut chain_b = vec![genesis.clone()];

        // Diverge with different producers
        for i in 1..fork_length {
            chain_a.push(chain_a[i - 1].next(10)); // Producer 10
            chain_b.push(chain_b[i - 1].next(20)); // Producer 20
        }

        Self { chain_a, chain_b }
    }
}

/// Statistics about network state
#[derive(Debug, Default)]
pub struct NetworkStats {
    pub total_nodes: usize,
    pub nodes_online: usize,
    pub nodes_at_max_height: usize,
    pub max_height: u64,
    pub min_height: u64,
    pub avg_height: f64,
    pub unique_tips: usize,
}

impl NetworkStats {
    /// Compute statistics for the current network state
    pub fn compute(network: &TestNetwork) -> Self {
        use std::collections::HashSet;

        let nodes = network.nodes();
        if nodes.is_empty() {
            return Self::default();
        }

        let heights: Vec<u64> = nodes.iter().map(|n| n.height()).collect();
        let max_height = *heights.iter().max().unwrap();
        let min_height = *heights.iter().min().unwrap();
        let avg_height = heights.iter().sum::<u64>() as f64 / heights.len() as f64;

        let unique_tips: HashSet<[u8; 32]> = nodes.iter().map(|n| n.chain_tip().hash).collect();

        Self {
            total_nodes: nodes.len(),
            nodes_online: nodes.iter().filter(|n| !n.is_offline()).count(),
            nodes_at_max_height: heights.iter().filter(|&&h| h == max_height).count(),
            max_height,
            min_height,
            avg_height,
            unique_tips: unique_tips.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_mesh_with_genesis() {
        let (network, genesis) = default_mesh_with_genesis();
        assert_converged(&network);
        assert_all_at_tip(&network, &genesis.hash);
    }

    #[test]
    fn test_partition_halves() {
        let (a, b) = partition_halves(10);
        assert_eq!(a, vec![0, 1, 2, 3, 4]);
        assert_eq!(b, vec![5, 6, 7, 8, 9]);
    }

    #[test]
    fn test_fork_scenario() {
        let fork = ForkScenario::new(5);

        // Both share genesis
        assert_eq!(fork.chain_a[0].hash, fork.chain_b[0].hash);

        // But diverge at height 1
        assert_ne!(fork.chain_a[1].hash, fork.chain_b[1].hash);

        // Both have same length
        assert_eq!(fork.chain_a.len(), fork.chain_b.len());
    }

    #[test]
    fn test_network_stats() {
        let (mut network, _) = setup_network_with_chain(TestNetworkConfig::default(), 5);

        let stats = NetworkStats::compute(&network);
        assert_eq!(stats.total_nodes, 10);
        assert_eq!(stats.nodes_online, 10);
        assert_eq!(stats.max_height, 4);
        assert_eq!(stats.unique_tips, 1);

        // Offline one node
        network.node_mut(5).set_offline(true);
        let stats = NetworkStats::compute(&network);
        assert_eq!(stats.nodes_online, 9);
    }
}
