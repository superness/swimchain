//! Network partition controller
//!
//! Simulates network partitions by blocking communication between groups of nodes.
//! Used to test partition tolerance and healing behavior.

use std::collections::HashSet;

/// Controls network partitions in the test network
#[derive(Debug, Default)]
pub struct PartitionController {
    /// Set of blocked node pairs (normalized so a < b)
    blocked_pairs: HashSet<(usize, usize)>,
}

impl PartitionController {
    /// Create a new partition controller with no partitions
    pub fn new() -> Self {
        Self::default()
    }

    /// Normalize a pair so the smaller ID comes first
    fn normalize(a: usize, b: usize) -> (usize, usize) {
        if a < b {
            (a, b)
        } else {
            (b, a)
        }
    }

    /// Create a partition between two groups of nodes
    ///
    /// All communication between nodes in group_a and nodes in group_b
    /// will be blocked.
    pub fn partition(&mut self, group_a: &[usize], group_b: &[usize]) {
        for &a in group_a {
            for &b in group_b {
                self.blocked_pairs.insert(Self::normalize(a, b));
            }
        }
    }

    /// Heal all partitions (clear all blocked pairs)
    pub fn heal(&mut self) {
        self.blocked_pairs.clear();
    }

    /// Check if communication between two nodes is blocked
    pub fn is_blocked(&self, a: usize, b: usize) -> bool {
        self.blocked_pairs.contains(&Self::normalize(a, b))
    }

    /// Isolate a single node from all others
    pub fn isolate_node(&mut self, node: usize, total_nodes: usize) {
        for other in 0..total_nodes {
            if other != node {
                self.blocked_pairs.insert(Self::normalize(node, other));
            }
        }
    }

    /// Remove isolation for a specific node
    pub fn reconnect_node(&mut self, node: usize, total_nodes: usize) {
        for other in 0..total_nodes {
            if other != node {
                self.blocked_pairs.remove(&Self::normalize(node, other));
            }
        }
    }

    /// Block a specific pair of nodes
    pub fn block_pair(&mut self, a: usize, b: usize) {
        self.blocked_pairs.insert(Self::normalize(a, b));
    }

    /// Unblock a specific pair of nodes
    pub fn unblock_pair(&mut self, a: usize, b: usize) {
        self.blocked_pairs.remove(&Self::normalize(a, b));
    }

    /// Get the number of blocked pairs
    pub fn blocked_count(&self) -> usize {
        self.blocked_pairs.len()
    }

    /// Check if there are any active partitions
    pub fn has_partitions(&self) -> bool {
        !self.blocked_pairs.is_empty()
    }

    /// Create a "split brain" partition: divide network in half
    pub fn split_in_half(&mut self, total_nodes: usize) {
        let mid = total_nodes / 2;
        let group_a: Vec<usize> = (0..mid).collect();
        let group_b: Vec<usize> = (mid..total_nodes).collect();
        self.partition(&group_a, &group_b);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_has_no_partitions() {
        let controller = PartitionController::new();
        assert!(!controller.has_partitions());
        assert_eq!(controller.blocked_count(), 0);
    }

    #[test]
    fn test_partition_blocks_groups() {
        let mut controller = PartitionController::new();

        // Partition [0, 1] from [2, 3]
        controller.partition(&[0, 1], &[2, 3]);

        // Cross-group pairs should be blocked
        assert!(controller.is_blocked(0, 2));
        assert!(controller.is_blocked(0, 3));
        assert!(controller.is_blocked(1, 2));
        assert!(controller.is_blocked(1, 3));
        // Order shouldn't matter
        assert!(controller.is_blocked(2, 0));

        // Within-group pairs should not be blocked
        assert!(!controller.is_blocked(0, 1));
        assert!(!controller.is_blocked(2, 3));
    }

    #[test]
    fn test_heal_clears_partitions() {
        let mut controller = PartitionController::new();
        controller.partition(&[0, 1], &[2, 3]);

        assert!(controller.has_partitions());
        controller.heal();
        assert!(!controller.has_partitions());
        assert!(!controller.is_blocked(0, 2));
    }

    #[test]
    fn test_isolate_node() {
        let mut controller = PartitionController::new();
        controller.isolate_node(2, 5);

        // Node 2 should be blocked from all others
        assert!(controller.is_blocked(2, 0));
        assert!(controller.is_blocked(2, 1));
        assert!(controller.is_blocked(2, 3));
        assert!(controller.is_blocked(2, 4));

        // Other nodes should still communicate
        assert!(!controller.is_blocked(0, 1));
        assert!(!controller.is_blocked(0, 3));
    }

    #[test]
    fn test_reconnect_node() {
        let mut controller = PartitionController::new();
        controller.isolate_node(2, 5);

        assert!(controller.is_blocked(2, 0));

        controller.reconnect_node(2, 5);

        assert!(!controller.is_blocked(2, 0));
        assert!(!controller.has_partitions());
    }

    #[test]
    fn test_block_unblock_pair() {
        let mut controller = PartitionController::new();

        controller.block_pair(1, 3);
        assert!(controller.is_blocked(1, 3));
        assert!(controller.is_blocked(3, 1)); // Order doesn't matter

        controller.unblock_pair(1, 3);
        assert!(!controller.is_blocked(1, 3));
    }

    #[test]
    fn test_split_in_half() {
        let mut controller = PartitionController::new();
        controller.split_in_half(6);

        // Nodes 0,1,2 vs 3,4,5
        assert!(controller.is_blocked(0, 3));
        assert!(controller.is_blocked(1, 4));
        assert!(controller.is_blocked(2, 5));

        // Same side should not be blocked
        assert!(!controller.is_blocked(0, 1));
        assert!(!controller.is_blocked(3, 4));
    }

    #[test]
    fn test_blocked_count() {
        let mut controller = PartitionController::new();

        // Partition [0, 1] from [2] = 2 blocked pairs
        controller.partition(&[0, 1], &[2]);
        assert_eq!(controller.blocked_count(), 2);

        // Add more
        controller.block_pair(3, 4);
        assert_eq!(controller.blocked_count(), 3);
    }
}
