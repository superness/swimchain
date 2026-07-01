//! Network topology abstraction
//!
//! Defines different network topologies for testing propagation behavior
//! under various connectivity scenarios.

/// Network topology configuration
#[derive(Clone, Debug)]
pub enum Topology {
    /// Every node is connected to every other node
    FullMesh,
    /// Nodes are connected in a ring (each node connects to its neighbors)
    Ring,
    /// All nodes connect through a central hub
    Star(usize),
    /// Custom topology defined by explicit edges
    Custom(Vec<(usize, usize)>),
}

impl Topology {
    /// Get all neighbors of a node in this topology
    ///
    /// Returns the node IDs that the given node can directly communicate with.
    pub fn neighbors(&self, node_id: usize, total_nodes: usize) -> Vec<usize> {
        match self {
            Topology::FullMesh => (0..total_nodes).filter(|&n| n != node_id).collect(),
            Topology::Ring => {
                let n = total_nodes;
                if n < 2 {
                    return vec![];
                }
                let prev = if node_id == 0 { n - 1 } else { node_id - 1 };
                let next = (node_id + 1) % n;
                if prev == next {
                    vec![prev]
                } else {
                    vec![prev, next]
                }
            }
            Topology::Star(hub) => {
                if node_id == *hub {
                    (0..total_nodes).filter(|&n| n != *hub).collect()
                } else {
                    vec![*hub]
                }
            }
            Topology::Custom(edges) => edges
                .iter()
                .filter_map(|&(a, b)| {
                    if a == node_id {
                        Some(b)
                    } else if b == node_id {
                        Some(a)
                    } else {
                        None
                    }
                })
                .collect(),
        }
    }

    /// Get the maximum path length (diameter) for this topology
    ///
    /// Returns the maximum number of hops needed to reach any node from any other.
    pub fn diameter(&self, total_nodes: usize) -> usize {
        match self {
            Topology::FullMesh => 1,
            Topology::Ring => total_nodes / 2,
            Topology::Star(_) => 2,
            Topology::Custom(edges) => {
                // For custom topologies, compute using BFS from each node
                let mut max_distance = 0;
                for start in 0..total_nodes {
                    let distances = self.bfs_distances(start, total_nodes, edges);
                    if let Some(&max) = distances.iter().filter(|&&d| d < usize::MAX).max() {
                        max_distance = max_distance.max(max);
                    }
                }
                max_distance
            }
        }
    }

    /// Compute BFS distances from a start node (helper for custom topologies)
    fn bfs_distances(
        &self,
        start: usize,
        total_nodes: usize,
        edges: &[(usize, usize)],
    ) -> Vec<usize> {
        let mut distances = vec![usize::MAX; total_nodes];
        distances[start] = 0;

        let mut queue = std::collections::VecDeque::new();
        queue.push_back(start);

        while let Some(current) = queue.pop_front() {
            let current_dist = distances[current];

            for &(a, b) in edges {
                let neighbor = if a == current {
                    Some(b)
                } else if b == current {
                    Some(a)
                } else {
                    None
                };

                if let Some(n) = neighbor {
                    if distances[n] == usize::MAX {
                        distances[n] = current_dist + 1;
                        queue.push_back(n);
                    }
                }
            }
        }

        distances
    }

    /// Create a random graph with given average connectivity
    pub fn random_connected(total_nodes: usize, avg_edges_per_node: usize, seed: u64) -> Self {
        use std::collections::HashSet;

        // Simple LCG for deterministic randomness
        let mut rng_state = seed;
        let mut next_rand = || {
            rng_state = rng_state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            rng_state
        };

        let mut edges = HashSet::new();

        // First, create a spanning tree to ensure connectivity
        for i in 1..total_nodes {
            let parent = (next_rand() as usize) % i;
            let edge = if i < parent { (i, parent) } else { (parent, i) };
            edges.insert(edge);
        }

        // Add extra edges to reach target connectivity
        let target_edges = (total_nodes * avg_edges_per_node) / 2;
        while edges.len() < target_edges {
            let a = (next_rand() as usize) % total_nodes;
            let b = (next_rand() as usize) % total_nodes;
            if a != b {
                let edge = if a < b { (a, b) } else { (b, a) };
                edges.insert(edge);
            }
        }

        Topology::Custom(edges.into_iter().collect())
    }
}

impl Default for Topology {
    fn default() -> Self {
        Topology::FullMesh
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_mesh_neighbors() {
        let topo = Topology::FullMesh;
        let neighbors = topo.neighbors(0, 5);

        assert_eq!(neighbors.len(), 4);
        assert!(neighbors.contains(&1));
        assert!(neighbors.contains(&2));
        assert!(neighbors.contains(&3));
        assert!(neighbors.contains(&4));
        assert!(!neighbors.contains(&0));
    }

    #[test]
    fn test_ring_neighbors() {
        let topo = Topology::Ring;

        // Node 0 in a 5-node ring
        let neighbors = topo.neighbors(0, 5);
        assert_eq!(neighbors.len(), 2);
        assert!(neighbors.contains(&4)); // prev
        assert!(neighbors.contains(&1)); // next

        // Node 2 in a 5-node ring
        let neighbors = topo.neighbors(2, 5);
        assert_eq!(neighbors.len(), 2);
        assert!(neighbors.contains(&1)); // prev
        assert!(neighbors.contains(&3)); // next
    }

    #[test]
    fn test_ring_small() {
        let topo = Topology::Ring;

        // 2-node ring
        let neighbors = topo.neighbors(0, 2);
        assert_eq!(neighbors.len(), 1);
        assert!(neighbors.contains(&1));

        // 1-node ring
        let neighbors = topo.neighbors(0, 1);
        assert!(neighbors.is_empty());
    }

    #[test]
    fn test_star_hub() {
        let topo = Topology::Star(0);

        // Hub connects to all
        let neighbors = topo.neighbors(0, 5);
        assert_eq!(neighbors.len(), 4);

        // Non-hub only connects to hub
        let neighbors = topo.neighbors(3, 5);
        assert_eq!(neighbors.len(), 1);
        assert!(neighbors.contains(&0));
    }

    #[test]
    fn test_custom_topology() {
        // Triangle: 0-1, 1-2, 2-0
        let edges = vec![(0, 1), (1, 2), (2, 0)];
        let topo = Topology::Custom(edges);

        let neighbors = topo.neighbors(0, 3);
        assert_eq!(neighbors.len(), 2);
        assert!(neighbors.contains(&1));
        assert!(neighbors.contains(&2));
    }

    #[test]
    fn test_diameter_full_mesh() {
        let topo = Topology::FullMesh;
        assert_eq!(topo.diameter(10), 1);
    }

    #[test]
    fn test_diameter_ring() {
        let topo = Topology::Ring;
        assert_eq!(topo.diameter(10), 5); // 10 / 2 = 5
        assert_eq!(topo.diameter(5), 2); // 5 / 2 = 2
    }

    #[test]
    fn test_diameter_star() {
        let topo = Topology::Star(0);
        assert_eq!(topo.diameter(10), 2); // Through hub
    }

    #[test]
    fn test_random_connected_is_connected() {
        let topo = Topology::random_connected(10, 3, 12345);
        if let Topology::Custom(edges) = &topo {
            // Should have at least 9 edges (spanning tree)
            assert!(edges.len() >= 9);

            // Verify connectivity by checking diameter is finite
            let diameter = topo.diameter(10);
            assert!(diameter < 10); // If connected, diameter < total_nodes
        } else {
            panic!("Expected Custom topology");
        }
    }
}
