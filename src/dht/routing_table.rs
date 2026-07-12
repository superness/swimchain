//! Kademlia Routing Table (SPEC_06 §3.8)
//!
//! The routing table is organized as 256 k-buckets, where each bucket stores
//! nodes at a specific XOR distance from our own ID.
//!
//! Bucket i contains nodes whose ID differs from ours starting at bit position i.
//! - Bucket 0: nodes differing in the last bit (very close)
//! - Bucket 255: nodes differing in the first bit (very far)

use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

use super::constants::{K, MAX_NODES_PER_SUBNET, NODE_STALE_SECS, NUM_BUCKETS};
use super::error::{DhtError, DhtResult};
use super::node_id::NodeId;

/// Extract /24 subnet from an IP address (first 3 octets for IPv4)
/// For IPv6, uses the first 3 bytes of the address
fn extract_subnet(addr: &SocketAddr) -> [u8; 3] {
    match addr.ip() {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            [octets[0], octets[1], octets[2]]
        }
        IpAddr::V6(ipv6) => {
            let octets = ipv6.octets();
            // Use first 3 bytes for IPv6 (rough subnet approximation)
            [octets[0], octets[1], octets[2]]
        }
    }
}

/// Information about a node in the routing table
#[derive(Debug, Clone)]
pub struct NodeEntry {
    /// The node's DHT ID
    pub id: NodeId,
    /// Network address of the node
    pub addr: SocketAddr,
    /// When we last heard from this node
    pub last_seen: Instant,
    /// When we first added this node (for longevity preference)
    pub first_seen: Instant,
    /// Number of failed RPCs to this node
    pub failure_count: u32,
}

impl NodeEntry {
    /// Create a new node entry
    pub fn new(id: NodeId, addr: SocketAddr) -> Self {
        let now = Instant::now();
        Self {
            id,
            addr,
            last_seen: now,
            first_seen: now,
            failure_count: 0,
        }
    }

    /// Get the /24 subnet of this node's address
    pub fn subnet(&self) -> [u8; 3] {
        extract_subnet(&self.addr)
    }

    /// Get the age of this node (time since first_seen)
    pub fn age(&self) -> Duration {
        self.first_seen.elapsed()
    }

    /// Update the last seen timestamp
    pub fn touch(&mut self) {
        self.last_seen = Instant::now();
        self.failure_count = 0;
    }

    /// Record a failed RPC
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
    }

    /// Check if the node is considered stale
    pub fn is_stale(&self) -> bool {
        self.last_seen.elapsed() > Duration::from_secs(NODE_STALE_SECS)
    }

    /// Check if the node should be evicted (too many failures)
    pub fn should_evict(&self) -> bool {
        self.failure_count >= 3 && self.is_stale()
    }
}

/// Result of attempting to update a k-bucket
#[derive(Debug)]
pub enum UpdateResult {
    /// Node was added or updated successfully
    Success,
    /// Need to ping this node to decide eviction
    PingRequired(NodeEntry),
    /// Subnet limit exceeded - cannot add node
    SubnetLimitExceeded { subnet: [u8; 3], count: usize },
}

/// A single k-bucket containing up to K nodes
#[derive(Debug)]
pub struct KBucket {
    /// Nodes in this bucket, ordered by last seen (most recent at back)
    nodes: VecDeque<NodeEntry>,
    /// Pending node waiting to be inserted if a stale node can be evicted
    pending: Option<NodeEntry>,
    /// Count of nodes per /24 subnet (eclipse attack mitigation)
    subnet_counts: HashMap<[u8; 3], usize>,
}

impl KBucket {
    /// Create an empty k-bucket
    pub fn new() -> Self {
        Self {
            nodes: VecDeque::with_capacity(K),
            pending: None,
            subnet_counts: HashMap::new(),
        }
    }

    /// Get the count of nodes from a given subnet
    pub fn subnet_count(&self, subnet: &[u8; 3]) -> usize {
        *self.subnet_counts.get(subnet).unwrap_or(&0)
    }

    /// Increment the subnet count
    fn increment_subnet(&mut self, subnet: [u8; 3]) {
        *self.subnet_counts.entry(subnet).or_insert(0) += 1;
    }

    /// Decrement the subnet count
    fn decrement_subnet(&mut self, subnet: &[u8; 3]) {
        if let Some(count) = self.subnet_counts.get_mut(subnet) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                self.subnet_counts.remove(subnet);
            }
        }
    }

    /// Number of nodes in this bucket
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    /// Check if the bucket is empty
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Check if the bucket is full
    pub fn is_full(&self) -> bool {
        self.nodes.len() >= K
    }

    /// Get all nodes in this bucket
    pub fn nodes(&self) -> impl Iterator<Item = &NodeEntry> {
        self.nodes.iter()
    }

    /// Get a node by ID
    pub fn get(&self, id: &NodeId) -> Option<&NodeEntry> {
        self.nodes.iter().find(|n| &n.id == id)
    }

    /// Get a mutable reference to a node by ID
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut NodeEntry> {
        self.nodes.iter_mut().find(|n| &n.id == id)
    }

    /// Check if a node is in this bucket
    pub fn contains(&self, id: &NodeId) -> bool {
        self.nodes.iter().any(|n| &n.id == id)
    }

    /// Update or insert a node
    ///
    /// Follows Kademlia's bucket update rules with eclipse attack mitigation:
    /// 1. If node exists, move to back (most recently seen)
    /// 2. Check subnet limit (max MAX_NODES_PER_SUBNET per /24)
    /// 3. If bucket not full, add to back
    /// 4. If bucket full, ping oldest node:
    ///    - If oldest responds, discard new node
    ///    - If oldest fails, evict and add new node
    ///
    /// Returns:
    /// - Success: Node was added or updated
    /// - PingRequired(old_node): Need to ping this node to decide
    /// - SubnetLimitExceeded: Too many nodes from this /24 subnet
    pub fn update(&mut self, entry: NodeEntry) -> UpdateResult {
        let subnet = entry.subnet();

        // Check if node already exists
        if let Some(pos) = self.nodes.iter().position(|n| n.id == entry.id) {
            // Move to back (most recently seen)
            let mut node = self.nodes.remove(pos).unwrap();
            node.touch();
            self.nodes.push_back(node);
            return UpdateResult::Success;
        }

        // Check subnet limit before adding new node (eclipse attack mitigation)
        let current_subnet_count = self.subnet_count(&subnet);
        if current_subnet_count >= MAX_NODES_PER_SUBNET {
            return UpdateResult::SubnetLimitExceeded {
                subnet,
                count: current_subnet_count,
            };
        }

        // Not in bucket - try to add
        if !self.is_full() {
            self.increment_subnet(subnet);
            self.nodes.push_back(entry);
            return UpdateResult::Success;
        }

        // Bucket is full - check if oldest is stale
        if let Some(oldest) = self.nodes.front() {
            if oldest.should_evict() {
                // Evict stale node and add new one
                let evicted = self.nodes.pop_front().unwrap();
                self.decrement_subnet(&evicted.subnet());
                self.increment_subnet(subnet);
                self.nodes.push_back(entry);
                return UpdateResult::Success;
            }

            // Need to ping oldest to decide
            self.pending = Some(entry);
            return UpdateResult::PingRequired(oldest.clone());
        }

        UpdateResult::Success
    }

    /// Handle ping response from oldest node
    ///
    /// If the oldest node responded, discard pending.
    /// If it didn't respond, evict it and add pending.
    pub fn on_ping_result(&mut self, oldest_id: &NodeId, responded: bool) {
        if let Some(pending) = self.pending.take() {
            if responded {
                // Oldest is still alive - move to back, discard pending
                if let Some(pos) = self.nodes.iter().position(|n| &n.id == oldest_id) {
                    let mut node = self.nodes.remove(pos).unwrap();
                    node.touch();
                    self.nodes.push_back(node);
                }
            } else {
                // Oldest is dead - evict and add pending
                if let Some(pos) = self.nodes.iter().position(|n| &n.id == oldest_id) {
                    let evicted = self.nodes.remove(pos).unwrap();
                    self.decrement_subnet(&evicted.subnet());
                    self.increment_subnet(pending.subnet());
                    self.nodes.push_back(pending);
                }
            }
        }
    }

    /// Remove a node from the bucket
    pub fn remove(&mut self, id: &NodeId) -> Option<NodeEntry> {
        if let Some(pos) = self.nodes.iter().position(|n| &n.id == id) {
            let removed = self.nodes.remove(pos)?;
            self.decrement_subnet(&removed.subnet());
            Some(removed)
        } else {
            None
        }
    }

    /// Get the oldest node (for staleness checking)
    pub fn oldest(&self) -> Option<&NodeEntry> {
        self.nodes.front()
    }

    /// Get the most recently seen node
    pub fn newest(&self) -> Option<&NodeEntry> {
        self.nodes.back()
    }

    /// Get N random nodes from this bucket
    pub fn random_nodes(&self, n: usize) -> Vec<&NodeEntry> {
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        let nodes: Vec<_> = self.nodes.iter().collect();
        nodes.choose_multiple(&mut rng, n).copied().collect()
    }
}

impl Default for KBucket {
    fn default() -> Self {
        Self::new()
    }
}

/// The Kademlia routing table
#[derive(Debug)]
pub struct RoutingTable {
    /// Our own node ID
    local_id: NodeId,
    /// The 256 k-buckets
    buckets: Vec<KBucket>,
}

impl RoutingTable {
    /// Create a new routing table for the given local ID
    pub fn new(local_id: NodeId) -> Self {
        let buckets = (0..NUM_BUCKETS).map(|_| KBucket::new()).collect();
        Self { local_id, buckets }
    }

    /// Get our local node ID
    pub fn local_id(&self) -> &NodeId {
        &self.local_id
    }

    /// Get the bucket index for a given node
    pub fn bucket_for(&self, id: &NodeId) -> Option<usize> {
        self.local_id.bucket_index(id)
    }

    /// Get a reference to a bucket by index
    pub fn bucket(&self, index: usize) -> DhtResult<&KBucket> {
        self.buckets
            .get(index)
            .ok_or(DhtError::BucketIndexOutOfRange {
                index,
                max: NUM_BUCKETS - 1,
            })
    }

    /// Get a mutable reference to a bucket by index
    pub fn bucket_mut(&mut self, index: usize) -> DhtResult<&mut KBucket> {
        self.buckets
            .get_mut(index)
            .ok_or(DhtError::BucketIndexOutOfRange {
                index,
                max: NUM_BUCKETS - 1,
            })
    }

    /// Update or insert a node into the routing table
    ///
    /// Returns:
    /// - Ok(None): Node was added or updated successfully
    /// - Ok(Some(oldest_node)): Need to ping the oldest node to decide eviction
    /// - Err(SubnetLimitExceeded): Too many nodes from this /24 subnet
    /// - Err(SelfLookup): Cannot add ourselves
    pub fn update(&mut self, id: NodeId, addr: SocketAddr) -> DhtResult<Option<NodeEntry>> {
        // Can't add ourselves
        if id == self.local_id {
            return Err(DhtError::SelfLookup);
        }

        let bucket_idx = self
            .local_id
            .bucket_index(&id)
            .ok_or(DhtError::SelfLookup)?;

        let bucket = self.bucket_mut(bucket_idx)?;
        let entry = NodeEntry::new(id, addr);

        match bucket.update(entry) {
            UpdateResult::Success => Ok(None),
            UpdateResult::PingRequired(oldest) => Ok(Some(oldest)),
            UpdateResult::SubnetLimitExceeded { subnet, count: _ } => {
                Err(DhtError::SubnetLimitExceeded {
                    subnet,
                    limit: MAX_NODES_PER_SUBNET,
                })
            }
        }
    }

    /// Remove a node from the routing table
    pub fn remove(&mut self, id: &NodeId) -> Option<NodeEntry> {
        if let Some(bucket_idx) = self.local_id.bucket_index(id) {
            if let Ok(bucket) = self.bucket_mut(bucket_idx) {
                return bucket.remove(id);
            }
        }
        None
    }

    /// Find the K closest nodes to a target ID
    ///
    /// This is the core operation for FIND_NODE.
    pub fn closest(&self, target: &NodeId, count: usize) -> Vec<&NodeEntry> {
        let mut candidates: Vec<&NodeEntry> = self.buckets.iter().flat_map(|b| b.nodes()).collect();

        // Sort by XOR distance to target
        candidates.sort_by(|a, b| {
            let dist_a = target.xor_distance(&a.id);
            let dist_b = target.xor_distance(&b.id);
            dist_a.cmp(&dist_b)
        });

        candidates.truncate(count);
        candidates
    }

    /// Get all nodes in the routing table
    pub fn all_nodes(&self) -> impl Iterator<Item = &NodeEntry> {
        self.buckets.iter().flat_map(|b| b.nodes())
    }

    /// Total number of nodes in the routing table
    pub fn size(&self) -> usize {
        self.buckets.iter().map(|b| b.len()).sum()
    }

    /// Get nodes from buckets that need refresh (haven't been updated recently)
    pub fn stale_buckets(&self) -> Vec<usize> {
        self.buckets
            .iter()
            .enumerate()
            .filter(|(_, b)| {
                // A bucket needs refresh if all its nodes are stale
                !b.is_empty() && b.nodes().all(|n| n.is_stale())
            })
            .map(|(i, _)| i)
            .collect()
    }

    /// Record a failed RPC to a node
    pub fn record_failure(&mut self, id: &NodeId) {
        if let Some(bucket_idx) = self.local_id.bucket_index(id) {
            if let Ok(bucket) = self.bucket_mut(bucket_idx) {
                if let Some(node) = bucket.get_mut(id) {
                    node.record_failure();
                }
            }
        }
    }

    /// Handle a response from a node (update last_seen)
    pub fn on_response(&mut self, id: &NodeId) {
        if let Some(bucket_idx) = self.local_id.bucket_index(id) {
            if let Ok(bucket) = self.bucket_mut(bucket_idx) {
                if let Some(node) = bucket.get_mut(id) {
                    node.touch();
                }
            }
        }
    }

    /// Get non-empty bucket indices
    pub fn non_empty_buckets(&self) -> Vec<usize> {
        self.buckets
            .iter()
            .enumerate()
            .filter(|(_, b)| !b.is_empty())
            .map(|(i, _)| i)
            .collect()
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

    fn make_addr_with_subnet(subnet: [u8; 3], port: u16) -> SocketAddr {
        SocketAddr::new(
            IpAddr::V4(Ipv4Addr::new(subnet[0], subnet[1], subnet[2], 1)),
            port,
        )
    }

    #[test]
    fn test_bucket_update_new_node() {
        let mut bucket = KBucket::new();
        let entry = NodeEntry::new(make_id(1), make_addr(8080));

        let result = bucket.update(entry);
        assert!(matches!(result, UpdateResult::Success));
        assert_eq!(bucket.len(), 1);
    }

    #[test]
    fn test_bucket_update_existing_node() {
        let mut bucket = KBucket::new();
        let entry = NodeEntry::new(make_id(1), make_addr(8080));

        bucket.update(entry.clone());
        bucket.update(entry);

        assert_eq!(bucket.len(), 1);
    }

    #[test]
    fn test_bucket_full() {
        let mut bucket = KBucket::new();

        // Fill the bucket with nodes from different subnets
        for i in 0..K {
            let addr = make_addr_with_subnet([10, i as u8, 0], 8080);
            let entry = NodeEntry::new(make_id(i as u8), addr);
            bucket.update(entry);
        }

        assert!(bucket.is_full());
        assert_eq!(bucket.len(), K);
    }

    #[test]
    fn test_subnet_limit_enforcement() {
        let mut bucket = KBucket::new();
        let subnet = [192, 168, 1];

        // Add MAX_NODES_PER_SUBNET nodes from same subnet
        for i in 0..MAX_NODES_PER_SUBNET {
            let addr = make_addr_with_subnet(subnet, 8080 + i as u16);
            let entry = NodeEntry::new(make_id(i as u8), addr);
            let result = bucket.update(entry);
            assert!(matches!(result, UpdateResult::Success));
        }

        // Third node from same subnet should be rejected
        let addr = make_addr_with_subnet(subnet, 9000);
        let entry = NodeEntry::new(make_id(100), addr);
        let result = bucket.update(entry);
        assert!(matches!(result, UpdateResult::SubnetLimitExceeded { .. }));
    }

    #[test]
    fn test_subnet_count_tracking() {
        let mut bucket = KBucket::new();
        let subnet1 = [10, 0, 0];
        let subnet2 = [192, 168, 1];

        // Add node from subnet1
        let entry1 = NodeEntry::new(make_id(1), make_addr_with_subnet(subnet1, 8080));
        bucket.update(entry1);
        assert_eq!(bucket.subnet_count(&subnet1), 1);
        assert_eq!(bucket.subnet_count(&subnet2), 0);

        // Add node from subnet2
        let entry2 = NodeEntry::new(make_id(2), make_addr_with_subnet(subnet2, 8081));
        bucket.update(entry2);
        assert_eq!(bucket.subnet_count(&subnet1), 1);
        assert_eq!(bucket.subnet_count(&subnet2), 1);

        // Remove node from subnet1
        bucket.remove(&make_id(1));
        assert_eq!(bucket.subnet_count(&subnet1), 0);
        assert_eq!(bucket.subnet_count(&subnet2), 1);
    }

    #[test]
    fn test_routing_table_subnet_limit() {
        // Test the subnet limit per bucket. The limit applies within each bucket,
        // so we test at the bucket level where it's enforced.
        let mut bucket = KBucket::new();
        let subnet = [10, 20, 30];

        // Add MAX_NODES_PER_SUBNET nodes from same subnet
        for i in 0..MAX_NODES_PER_SUBNET {
            let addr = make_addr_with_subnet(subnet, 8080 + i as u16);
            let entry = NodeEntry::new(make_id(i as u8), addr);
            let result = bucket.update(entry);
            assert!(matches!(result, UpdateResult::Success));
        }

        // Additional node from same subnet should fail
        let addr = make_addr_with_subnet(subnet, 9000);
        let entry = NodeEntry::new(make_id(100), addr);
        let result = bucket.update(entry);
        assert!(matches!(result, UpdateResult::SubnetLimitExceeded { .. }));

        // But a node from a different subnet should succeed
        let different_subnet = [192, 168, 1];
        let addr2 = make_addr_with_subnet(different_subnet, 9001);
        let entry2 = NodeEntry::new(make_id(200), addr2);
        let result2 = bucket.update(entry2);
        assert!(matches!(result2, UpdateResult::Success));
    }

    #[test]
    fn test_first_seen_preserved() {
        let mut bucket = KBucket::new();
        let entry = NodeEntry::new(make_id(1), make_addr(8080));
        let original_first_seen = entry.first_seen;

        bucket.update(entry);

        // Wait a tiny bit and update again
        std::thread::sleep(std::time::Duration::from_millis(1));
        let entry2 = NodeEntry::new(make_id(1), make_addr(8080));
        bucket.update(entry2);

        // first_seen should not change for existing node
        let node = bucket.get(&make_id(1)).unwrap();
        assert_eq!(node.first_seen, original_first_seen);
    }

    #[test]
    fn test_routing_table_closest() {
        let local_id = make_id(0);
        let mut table = RoutingTable::new(local_id);

        // Add some nodes
        for i in 1..10 {
            let _ = table.update(make_id(i), make_addr(8080 + i as u16));
        }

        let target = make_id(5);
        let closest = table.closest(&target, 3);

        assert!(!closest.is_empty());
        assert!(closest.len() <= 3);
    }

    #[test]
    fn test_routing_table_self_lookup_rejected() {
        let local_id = make_id(42);
        let mut table = RoutingTable::new(local_id);

        let result = table.update(local_id, make_addr(8080));
        assert!(result.is_err());
    }

    #[test]
    fn test_routing_table_size() {
        let local_id = make_id(0);
        let mut table = RoutingTable::new(local_id);

        assert_eq!(table.size(), 0);

        let _ = table.update(make_id(1), make_addr(8080));
        let _ = table.update(make_id(2), make_addr(8081));

        assert_eq!(table.size(), 2);
    }

    #[test]
    fn test_routing_table_remove() {
        let local_id = make_id(0);
        let mut table = RoutingTable::new(local_id);

        let _ = table.update(make_id(1), make_addr(8080));
        assert_eq!(table.size(), 1);

        let removed = table.remove(&make_id(1));
        assert!(removed.is_some());
        assert_eq!(table.size(), 0);
    }

    #[test]
    fn test_bucket_contains() {
        let mut bucket = KBucket::new();
        let id = make_id(42);
        let entry = NodeEntry::new(id, make_addr(8080));

        assert!(!bucket.contains(&id));
        bucket.update(entry);
        assert!(bucket.contains(&id));
    }
}
