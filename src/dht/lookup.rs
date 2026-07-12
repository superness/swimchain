//! DHT Lookup Operations (SPEC_06 §3.8)
//!
//! Implements iterative Kademlia lookups for:
//! - FIND_NODE: Find K closest nodes to a target
//! - FIND_VALUE: Find providers for content

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashSet};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use futures::stream::{FuturesUnordered, StreamExt};
use tokio::sync::RwLock;
use tokio::time::timeout;

use super::constants::{ALPHA, K, LOOKUP_TIMEOUT_MS, MAX_PROVIDERS};
use super::error::{DhtError, DhtResult};
use super::messages::NodeInfo;
use super::node_id::NodeId;
use super::routing_table::RoutingTable;

/// State of a node during lookup
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeState {
    /// Not yet queried
    Pending,
    /// Query in progress
    Querying,
    /// Query completed successfully
    Responded,
    /// Query failed
    Failed,
}

/// A node being tracked during a lookup
#[derive(Debug, Clone)]
pub struct LookupNode {
    /// Node ID
    pub id: NodeId,
    /// Network address
    pub addr: SocketAddr,
    /// XOR distance from target
    pub distance: NodeId,
    /// Current state
    pub state: NodeState,
}

impl LookupNode {
    /// Create a new lookup node
    pub fn new(id: NodeId, addr: SocketAddr, target: &NodeId) -> Self {
        let distance = target.xor_distance(&id);
        Self {
            id,
            addr,
            distance,
            state: NodeState::Pending,
        }
    }
}

impl PartialEq for LookupNode {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for LookupNode {}

impl PartialOrd for LookupNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for LookupNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // Smaller distance = higher priority (reverse order for max-heap → min-heap)
        other.distance.cmp(&self.distance)
    }
}

/// Result of a lookup operation
#[derive(Debug)]
pub struct LookupResult {
    /// Target that was searched for
    pub target: NodeId,
    /// Closest nodes found
    pub closest: Vec<NodeInfo>,
    /// Providers found (for FIND_VALUE)
    pub providers: Vec<NodeInfo>,
    /// Whether we found a node that has the content
    pub found_value: bool,
    /// Number of RPCs made
    pub rpc_count: usize,
}

/// Coordinates iterative Kademlia lookups
pub struct LookupCoordinator {
    /// Our local routing table
    routing_table: Arc<RwLock<RoutingTable>>,
}

impl LookupCoordinator {
    /// Create a new lookup coordinator
    pub fn new(routing_table: Arc<RwLock<RoutingTable>>) -> Self {
        Self { routing_table }
    }

    /// Perform a FIND_NODE lookup
    ///
    /// Returns the K closest nodes to the target.
    pub async fn find_node<F, Fut>(
        &self,
        target: NodeId,
        send_find_node: F,
    ) -> DhtResult<LookupResult>
    where
        F: Fn(NodeInfo) -> Fut,
        Fut: std::future::Future<Output = DhtResult<Vec<NodeInfo>>>,
    {
        self.do_lookup(target, false, send_find_node).await
    }

    /// Perform a FIND_VALUE lookup
    ///
    /// Returns providers for the content, or closest nodes if not found.
    pub async fn find_value<F, Fut>(
        &self,
        content_hash: [u8; 32],
        send_find_value: F,
    ) -> DhtResult<LookupResult>
    where
        F: Fn(NodeInfo, [u8; 32]) -> Fut,
        Fut: std::future::Future<Output = DhtResult<(Vec<NodeInfo>, bool)>>,
    {
        let target = NodeId::from_bytes(content_hash);

        // Wrap the callback to match expected signature
        let wrapped = |node: NodeInfo| {
            let hash = content_hash;
            let cb = &send_find_value;
            async move {
                let (nodes, has_value) = cb(node, hash).await?;
                Ok((nodes, has_value))
            }
        };

        self.do_lookup_value(target, content_hash, wrapped).await
    }

    /// Core lookup algorithm (iterative)
    async fn do_lookup<F, Fut>(
        &self,
        target: NodeId,
        _find_value: bool,
        send_rpc: F,
    ) -> DhtResult<LookupResult>
    where
        F: Fn(NodeInfo) -> Fut,
        Fut: std::future::Future<Output = DhtResult<Vec<NodeInfo>>>,
    {
        let mut candidates: BinaryHeap<LookupNode> = BinaryHeap::new();
        let mut queried: HashSet<NodeId> = HashSet::new();
        let mut responded: Vec<NodeInfo> = Vec::new();
        let mut rpc_count = 0;

        // Initialize with nodes from our routing table
        {
            let table = self.routing_table.read().await;
            for entry in table.closest(&target, K) {
                let node = LookupNode::new(entry.id, entry.addr, &target);
                candidates.push(node);
            }
        }

        // Iterative lookup loop
        let start = std::time::Instant::now();
        let timeout_duration = Duration::from_millis(LOOKUP_TIMEOUT_MS);

        while start.elapsed() < timeout_duration {
            // Get ALPHA pending nodes closest to target
            let mut to_query: Vec<LookupNode> = Vec::new();
            let mut temp: Vec<LookupNode> = Vec::new();

            while let Some(node) = candidates.pop() {
                if queried.contains(&node.id) {
                    continue;
                }
                if to_query.len() < ALPHA {
                    to_query.push(node);
                } else {
                    temp.push(node);
                }
            }

            // Put back the ones we didn't query
            for node in temp {
                candidates.push(node);
            }

            // If no more nodes to query, we're done
            if to_query.is_empty() {
                break;
            }

            // Query nodes in parallel using FuturesUnordered to process results as they arrive
            let mut pending_queries: FuturesUnordered<_> = to_query
                .into_iter()
                .map(|node| {
                    queried.insert(node.id);
                    let node_info = NodeInfo::new(node.id, node.addr);
                    let rpc = send_rpc(node_info.clone());
                    async move { (node_info, rpc.await) }
                })
                .collect();

            // Process results as they arrive (no waiting for slowest)
            while let Some((node_info, result)) = pending_queries.next().await {
                rpc_count += 1;

                match result {
                    Ok(nodes) => {
                        responded.push(node_info);

                        // Add new nodes to candidates immediately
                        for new_node in nodes {
                            if !queried.contains(&new_node.id) {
                                let lookup_node =
                                    LookupNode::new(new_node.id, new_node.addr, &target);
                                candidates.push(lookup_node);
                            }
                        }
                    }
                    Err(e) => {
                        // Log failed RPC with context for debugging
                        log::debug!(
                            "[DHT-LOOKUP] RPC failed to node {} ({}): {:?}",
                            hex::encode(&node_info.id.as_bytes()[..8]),
                            node_info.addr,
                            e
                        );
                    }
                }
            }

            // Check termination: if we have K responded nodes and the closest
            // responded node is closer than all pending nodes, we're done
            if responded.len() >= K {
                let closest_responded = responded
                    .iter()
                    .min_by_key(|n| target.xor_distance(&n.id))
                    .map(|n| target.xor_distance(&n.id));

                let closest_pending = candidates.peek().map(|n| n.distance);

                if let (Some(resp_dist), Some(pend_dist)) = (closest_responded, closest_pending) {
                    if resp_dist <= pend_dist {
                        break;
                    }
                }
            }
        }

        // Sort by distance and take K closest
        responded.sort_by_key(|n| target.xor_distance(&n.id));
        responded.truncate(K);

        Ok(LookupResult {
            target,
            closest: responded,
            providers: Vec::new(),
            found_value: false,
            rpc_count,
        })
    }

    /// Core lookup algorithm for FIND_VALUE (with provider tracking)
    async fn do_lookup_value<F, Fut>(
        &self,
        target: NodeId,
        content_hash: [u8; 32],
        send_rpc: F,
    ) -> DhtResult<LookupResult>
    where
        F: Fn(NodeInfo) -> Fut,
        Fut: std::future::Future<Output = DhtResult<(Vec<NodeInfo>, bool)>>,
    {
        let mut candidates: BinaryHeap<LookupNode> = BinaryHeap::new();
        let mut queried: HashSet<NodeId> = HashSet::new();
        let mut responded: Vec<NodeInfo> = Vec::new();
        let mut providers: Vec<NodeInfo> = Vec::new();
        let mut rpc_count = 0;

        // Initialize with nodes from our routing table
        {
            let table = self.routing_table.read().await;
            for entry in table.closest(&target, K) {
                let node = LookupNode::new(entry.id, entry.addr, &target);
                candidates.push(node);
            }
        }

        // Iterative lookup loop
        let start = std::time::Instant::now();
        let timeout_duration = Duration::from_millis(LOOKUP_TIMEOUT_MS);

        while start.elapsed() < timeout_duration && providers.len() < MAX_PROVIDERS {
            // Get ALPHA pending nodes closest to target
            let mut to_query: Vec<LookupNode> = Vec::new();
            let mut temp: Vec<LookupNode> = Vec::new();

            while let Some(node) = candidates.pop() {
                if queried.contains(&node.id) {
                    continue;
                }
                if to_query.len() < ALPHA {
                    to_query.push(node);
                } else {
                    temp.push(node);
                }
            }

            // Put back the ones we didn't query
            for node in temp {
                candidates.push(node);
            }

            // If no more nodes to query, we're done
            if to_query.is_empty() {
                break;
            }

            // Query nodes in parallel using FuturesUnordered to process results as they arrive
            let mut pending_queries: FuturesUnordered<_> = to_query
                .into_iter()
                .map(|node| {
                    queried.insert(node.id);
                    let node_info = NodeInfo::new(node.id, node.addr);
                    let rpc = send_rpc(node_info.clone());
                    async move { (node_info, rpc.await) }
                })
                .collect();

            // Process results as they arrive (no waiting for slowest)
            while let Some((node_info, result)) = pending_queries.next().await {
                rpc_count += 1;

                match result {
                    Ok((nodes, has_value)) => {
                        responded.push(node_info.clone());

                        // If this node has the value, add as provider
                        if has_value {
                            providers.push(node_info);
                        }

                        // Add new nodes to candidates immediately
                        for new_node in nodes {
                            if !queried.contains(&new_node.id) {
                                let lookup_node =
                                    LookupNode::new(new_node.id, new_node.addr, &target);
                                candidates.push(lookup_node);
                            }
                        }
                    }
                    Err(e) => {
                        // Log failed RPC with context for debugging
                        log::debug!(
                            "[DHT-LOOKUP] RPC failed to node {} ({}): {:?}",
                            hex::encode(&node_info.id.as_bytes()[..8]),
                            node_info.addr,
                            e
                        );
                    }
                }

                // If we found enough providers, we can stop early (even mid-batch)
                if providers.len() >= 3 {
                    break;
                }
            }

            // If we found providers, we can stop the outer loop too
            if !providers.is_empty() && providers.len() >= 3 {
                break;
            }
        }

        // Sort by distance and take K closest
        responded.sort_by_key(|n| target.xor_distance(&n.id));
        responded.truncate(K);

        let found_value = !providers.is_empty();
        Ok(LookupResult {
            target,
            closest: responded,
            providers,
            found_value,
            rpc_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    fn make_addr(port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port)
    }

    fn make_id(byte: u8) -> NodeId {
        NodeId::from_bytes([byte; 32])
    }

    #[test]
    fn test_lookup_node_ordering() {
        let target = make_id(0);

        // Closer node should have higher priority
        let close = LookupNode::new(make_id(1), make_addr(8080), &target);
        let far = LookupNode::new(make_id(255), make_addr(8081), &target);

        // In a max-heap with reversed ordering, the closer node should come first
        let mut heap: BinaryHeap<LookupNode> = BinaryHeap::new();
        heap.push(far);
        heap.push(close);

        let first = heap.pop().unwrap();
        assert_eq!(first.id, make_id(1)); // Closer node first
    }

    #[tokio::test]
    async fn test_lookup_coordinator_creation() {
        let local_id = make_id(42);
        let table = Arc::new(RwLock::new(RoutingTable::new(local_id)));
        let _coordinator = LookupCoordinator::new(table);
    }
}
