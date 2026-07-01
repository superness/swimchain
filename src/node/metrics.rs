//! Node metrics
//!
//! Provides atomic counters for tracking node operational metrics.
//! Used for status reporting and observability.
//!
//! See SPEC_10 §8.1 for field definitions.

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::RwLock;
use std::time::Instant;

use crate::node::state::{NodeState, NodeStatus};

/// Node operational metrics
///
/// Thread-safe counters for tracking node performance and status.
/// Uses atomic operations for lock-free updates.
///
/// # Example
///
/// ```
/// use swimchain::node::NodeMetrics;
///
/// let metrics = NodeMetrics::new();
/// metrics.record_bytes_sent(1024);
/// assert_eq!(metrics.bytes_sent.load(std::sync::atomic::Ordering::Relaxed), 1024);
/// ```
pub struct NodeMetrics {
    /// Timestamp when node started
    started_at: RwLock<Option<Instant>>,

    // ========== Network Metrics ==========
    /// Number of connected peers
    pub peers_connected: AtomicUsize,

    /// Total bytes sent to peers
    pub bytes_sent: AtomicU64,

    /// Total bytes received from peers
    pub bytes_received: AtomicU64,

    /// Total messages sent
    pub messages_sent: AtomicU64,

    /// Total messages received
    pub messages_received: AtomicU64,

    // ========== Sync Metrics ==========
    /// Current chain height
    pub chain_height: AtomicU64,

    /// Current chain tip hash
    pub chain_tip_hash: RwLock<[u8; 32]>,

    /// Total blocks synced
    pub blocks_synced: AtomicU64,

    // ========== Content Metrics ==========
    /// Content items stored locally
    pub content_items_stored: AtomicU64,

    /// Content bytes stored locally
    pub content_bytes_stored: AtomicU64,

    /// Content items served to peers
    pub content_items_served: AtomicU64,

    /// Content bytes served to peers
    pub content_bytes_served: AtomicU64,

    // ========== Decay Metrics ==========
    /// Items removed by decay
    pub items_decayed: AtomicU64,

    /// Last decay tick timestamp
    pub last_decay_tick: RwLock<Option<Instant>>,

    /// Current storage usage in bytes
    pub storage_usage_bytes: AtomicU64,

    // ========== Contribution Metrics ==========
    /// Bandwidth served in last 30 days (bytes)
    pub bandwidth_served_30d: AtomicU64,

    /// Current contribution streak (days)
    pub current_streak: AtomicU64,

    // ========== Routing Metrics (SPEC_10 §5) ==========
    /// Messages received by router
    pub routing_received: AtomicU64,

    /// Messages successfully processed
    pub routing_processed: AtomicU64,

    /// Messages that failed to process
    pub routing_failed: AtomicU64,

    /// Response messages generated
    pub routing_responses: AtomicU64,
}

impl NodeMetrics {
    /// Create a new NodeMetrics instance with all counters at zero
    pub fn new() -> Self {
        Self {
            started_at: RwLock::new(None),
            peers_connected: AtomicUsize::new(0),
            bytes_sent: AtomicU64::new(0),
            bytes_received: AtomicU64::new(0),
            messages_sent: AtomicU64::new(0),
            messages_received: AtomicU64::new(0),
            chain_height: AtomicU64::new(0),
            chain_tip_hash: RwLock::new([0u8; 32]),
            blocks_synced: AtomicU64::new(0),
            content_items_stored: AtomicU64::new(0),
            content_bytes_stored: AtomicU64::new(0),
            content_items_served: AtomicU64::new(0),
            content_bytes_served: AtomicU64::new(0),
            items_decayed: AtomicU64::new(0),
            last_decay_tick: RwLock::new(None),
            storage_usage_bytes: AtomicU64::new(0),
            bandwidth_served_30d: AtomicU64::new(0),
            current_streak: AtomicU64::new(0),
            routing_received: AtomicU64::new(0),
            routing_processed: AtomicU64::new(0),
            routing_failed: AtomicU64::new(0),
            routing_responses: AtomicU64::new(0),
        }
    }

    /// Mark the node as started (records start time)
    pub fn mark_started(&self) {
        *self.started_at.write().unwrap() = Some(Instant::now());
    }

    /// Mark the node as stopped (clears start time)
    pub fn mark_stopped(&self) {
        *self.started_at.write().unwrap() = None;
    }

    /// Get uptime in seconds (0 if not running)
    pub fn uptime_seconds(&self) -> u64 {
        self.started_at
            .read()
            .ok()
            .and_then(|opt| opt.map(|i| i.elapsed().as_secs()))
            .unwrap_or(0)
    }

    /// Convert metrics to a NodeStatus snapshot
    pub fn to_status(&self, state: NodeState, storage_target_mb: u64) -> NodeStatus {
        let storage_used = self.storage_usage_bytes.load(Ordering::Relaxed) / 1_000_000;
        let storage_percent = if storage_target_mb > 0 {
            (storage_used as f32 / storage_target_mb as f32) * 100.0
        } else {
            0.0
        };

        NodeStatus {
            state,
            uptime_seconds: self.uptime_seconds(),
            peers: self.peers_connected.load(Ordering::Relaxed),
            chain_height: self.chain_height.load(Ordering::Relaxed),
            sync_percent: 100.0, // Placeholder until sync integration
            storage_used_mb: storage_used,
            storage_percent,
        }
    }

    // ========== Convenience Methods ==========

    /// Record bytes sent to network
    pub fn record_bytes_sent(&self, bytes: u64) {
        self.bytes_sent.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record bytes received from network
    pub fn record_bytes_received(&self, bytes: u64) {
        self.bytes_received.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record a message sent
    pub fn record_message_sent(&self) {
        self.messages_sent.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a message received
    pub fn record_message_received(&self) {
        self.messages_received.fetch_add(1, Ordering::Relaxed);
    }

    /// Set the current peer count
    pub fn set_peers(&self, count: usize) {
        self.peers_connected.store(count, Ordering::Relaxed);
    }

    /// Increment peer count
    pub fn peer_connected(&self) {
        self.peers_connected.fetch_add(1, Ordering::Relaxed);
    }

    /// Decrement peer count
    pub fn peer_disconnected(&self) {
        self.peers_connected.fetch_sub(1, Ordering::Relaxed);
    }

    /// Set the current chain height
    pub fn set_chain_height(&self, height: u64) {
        self.chain_height.store(height, Ordering::Relaxed);
    }

    /// Set the chain tip hash
    pub fn set_chain_tip(&self, hash: [u8; 32]) {
        *self.chain_tip_hash.write().unwrap() = hash;
    }

    /// Record a block synced
    pub fn record_block_synced(&self) {
        self.blocks_synced.fetch_add(1, Ordering::Relaxed);
    }

    /// Record content stored
    pub fn record_content_stored(&self, bytes: u64) {
        self.content_items_stored.fetch_add(1, Ordering::Relaxed);
        self.content_bytes_stored.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record content served to peer
    pub fn record_content_served(&self, bytes: u64) {
        self.content_items_served.fetch_add(1, Ordering::Relaxed);
        self.content_bytes_served.fetch_add(bytes, Ordering::Relaxed);
        self.bandwidth_served_30d.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record items decayed
    pub fn record_decay(&self, items: u64) {
        self.items_decayed.fetch_add(items, Ordering::Relaxed);
        *self.last_decay_tick.write().unwrap() = Some(Instant::now());
    }

    /// Set storage usage
    pub fn set_storage_usage(&self, bytes: u64) {
        self.storage_usage_bytes.store(bytes, Ordering::Relaxed);
    }

    /// Set current streak
    pub fn set_streak(&self, days: u64) {
        self.current_streak.store(days, Ordering::Relaxed);
    }

    // ========== Routing Metric Methods ==========

    /// Record a message received by the router
    pub fn record_route_received(&self) {
        self.routing_received.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a message successfully processed
    pub fn record_route_processed(&self) {
        self.routing_processed.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a message that failed to process
    pub fn record_route_failed(&self) {
        self.routing_failed.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a response message generated
    pub fn record_route_response(&self) {
        self.routing_responses.fetch_add(1, Ordering::Relaxed);
    }

    /// Reset all counters (for testing)
    pub fn reset(&self) {
        self.peers_connected.store(0, Ordering::Relaxed);
        self.bytes_sent.store(0, Ordering::Relaxed);
        self.bytes_received.store(0, Ordering::Relaxed);
        self.messages_sent.store(0, Ordering::Relaxed);
        self.messages_received.store(0, Ordering::Relaxed);
        self.chain_height.store(0, Ordering::Relaxed);
        *self.chain_tip_hash.write().unwrap() = [0u8; 32];
        self.blocks_synced.store(0, Ordering::Relaxed);
        self.content_items_stored.store(0, Ordering::Relaxed);
        self.content_bytes_stored.store(0, Ordering::Relaxed);
        self.content_items_served.store(0, Ordering::Relaxed);
        self.content_bytes_served.store(0, Ordering::Relaxed);
        self.items_decayed.store(0, Ordering::Relaxed);
        *self.last_decay_tick.write().unwrap() = None;
        self.storage_usage_bytes.store(0, Ordering::Relaxed);
        self.bandwidth_served_30d.store(0, Ordering::Relaxed);
        self.current_streak.store(0, Ordering::Relaxed);
        self.routing_received.store(0, Ordering::Relaxed);
        self.routing_processed.store(0, Ordering::Relaxed);
        self.routing_failed.store(0, Ordering::Relaxed);
        self.routing_responses.store(0, Ordering::Relaxed);
        *self.started_at.write().unwrap() = None;
    }
}

impl Default for NodeMetrics {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_metrics() {
        let metrics = NodeMetrics::new();
        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 0);
        assert_eq!(metrics.bytes_sent.load(Ordering::Relaxed), 0);
        assert_eq!(metrics.chain_height.load(Ordering::Relaxed), 0);
        assert_eq!(metrics.uptime_seconds(), 0);
    }

    #[test]
    fn test_mark_started() {
        let metrics = NodeMetrics::new();
        assert_eq!(metrics.uptime_seconds(), 0);

        metrics.mark_started();
        std::thread::sleep(std::time::Duration::from_millis(100));
        assert!(metrics.uptime_seconds() >= 0); // At least 0 seconds
    }

    #[test]
    fn test_mark_stopped() {
        let metrics = NodeMetrics::new();
        metrics.mark_started();
        assert!(metrics.started_at.read().unwrap().is_some());

        metrics.mark_stopped();
        assert!(metrics.started_at.read().unwrap().is_none());
        assert_eq!(metrics.uptime_seconds(), 0);
    }

    #[test]
    fn test_record_bytes_sent() {
        let metrics = NodeMetrics::new();
        metrics.record_bytes_sent(1000);
        assert_eq!(metrics.bytes_sent.load(Ordering::Relaxed), 1000);

        metrics.record_bytes_sent(500);
        assert_eq!(metrics.bytes_sent.load(Ordering::Relaxed), 1500);
    }

    #[test]
    fn test_record_bytes_received() {
        let metrics = NodeMetrics::new();
        metrics.record_bytes_received(2000);
        assert_eq!(metrics.bytes_received.load(Ordering::Relaxed), 2000);
    }

    #[test]
    fn test_peer_tracking() {
        let metrics = NodeMetrics::new();
        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 0);

        metrics.peer_connected();
        metrics.peer_connected();
        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 2);

        metrics.peer_disconnected();
        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 1);

        metrics.set_peers(10);
        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 10);
    }

    #[test]
    fn test_chain_metrics() {
        let metrics = NodeMetrics::new();

        metrics.set_chain_height(1000);
        assert_eq!(metrics.chain_height.load(Ordering::Relaxed), 1000);

        let tip = [42u8; 32];
        metrics.set_chain_tip(tip);
        assert_eq!(*metrics.chain_tip_hash.read().unwrap(), tip);

        metrics.record_block_synced();
        metrics.record_block_synced();
        assert_eq!(metrics.blocks_synced.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn test_content_metrics() {
        let metrics = NodeMetrics::new();

        metrics.record_content_stored(1024);
        assert_eq!(metrics.content_items_stored.load(Ordering::Relaxed), 1);
        assert_eq!(metrics.content_bytes_stored.load(Ordering::Relaxed), 1024);

        metrics.record_content_served(2048);
        assert_eq!(metrics.content_items_served.load(Ordering::Relaxed), 1);
        assert_eq!(metrics.content_bytes_served.load(Ordering::Relaxed), 2048);
        assert_eq!(metrics.bandwidth_served_30d.load(Ordering::Relaxed), 2048);
    }

    #[test]
    fn test_decay_metrics() {
        let metrics = NodeMetrics::new();
        assert!(metrics.last_decay_tick.read().unwrap().is_none());

        metrics.record_decay(10);
        assert_eq!(metrics.items_decayed.load(Ordering::Relaxed), 10);
        assert!(metrics.last_decay_tick.read().unwrap().is_some());
    }

    #[test]
    fn test_storage_metrics() {
        let metrics = NodeMetrics::new();

        metrics.set_storage_usage(500_000_000); // 500 MB
        assert_eq!(
            metrics.storage_usage_bytes.load(Ordering::Relaxed),
            500_000_000
        );
    }

    #[test]
    fn test_contribution_metrics() {
        let metrics = NodeMetrics::new();

        metrics.set_streak(30);
        assert_eq!(metrics.current_streak.load(Ordering::Relaxed), 30);
    }

    #[test]
    fn test_to_status() {
        let metrics = NodeMetrics::new();
        metrics.mark_started();
        metrics.set_peers(5);
        metrics.set_chain_height(1000);
        metrics.set_storage_usage(250_000_000); // 250 MB

        let status = metrics.to_status(NodeState::Running, 500);

        assert_eq!(status.state, NodeState::Running);
        assert_eq!(status.peers, 5);
        assert_eq!(status.chain_height, 1000);
        assert_eq!(status.storage_used_mb, 250);
        assert!((status.storage_percent - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_to_status_zero_target() {
        let metrics = NodeMetrics::new();
        let status = metrics.to_status(NodeState::Stopped, 0);
        assert_eq!(status.storage_percent, 0.0);
    }

    #[test]
    fn test_reset() {
        let metrics = NodeMetrics::new();
        metrics.mark_started();
        metrics.set_peers(10);
        metrics.record_bytes_sent(1000);
        metrics.set_chain_height(500);

        metrics.reset();

        assert_eq!(metrics.peers_connected.load(Ordering::Relaxed), 0);
        assert_eq!(metrics.bytes_sent.load(Ordering::Relaxed), 0);
        assert_eq!(metrics.chain_height.load(Ordering::Relaxed), 0);
        assert!(metrics.started_at.read().unwrap().is_none());
    }
}
