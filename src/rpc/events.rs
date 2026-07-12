//! RPC Real-Time Events (H-RPC-2)
//!
//! Provides WebSocket-based real-time event streaming for clients.
//!
//! # Event Types
//!
//! - `content_new`: New content (post/reply) created
//! - `content_engaged`: Content received engagement
//! - `sync_status`: Sync state changed
//! - `peer_connected`: New peer connected
//! - `peer_disconnected`: Peer disconnected
//! - `block_created`: New block added to chain
//!
//! # Subscription Model
//!
//! Clients subscribe to event types via JSON-RPC over WebSocket:
//! ```json
//! {"jsonrpc":"2.0","method":"subscribe","params":{"events":["content_new","sync_status"]},"id":1}
//! ```
//!
//! Events are pushed as JSON-RPC notifications (no id):
//! ```json
//! {"jsonrpc":"2.0","method":"event","params":{"type":"content_new","data":{...}}}
//! ```

use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{broadcast, RwLock};

/// Maximum number of concurrent WebSocket connections per IP
pub const MAX_WS_CONNECTIONS_PER_IP: usize = 5;

/// Maximum number of total WebSocket connections
pub const MAX_WS_CONNECTIONS_TOTAL: usize = 1000;

/// Event broadcast channel capacity
pub const EVENT_CHANNEL_CAPACITY: usize = 1024;

/// Event types that clients can subscribe to
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    /// New content created (post or reply)
    ContentNew,
    /// Content received engagement
    ContentEngaged,
    /// Sync status changed
    SyncStatus,
    /// New peer connected
    PeerConnected,
    /// Peer disconnected
    PeerDisconnected,
    /// New block created
    BlockCreated,
    /// Space content updated
    SpaceUpdated,
    /// Mempool changed (action added/removed)
    MempoolChanged,
}

impl EventType {
    /// Parse event type from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "content_new" => Some(Self::ContentNew),
            "content_engaged" => Some(Self::ContentEngaged),
            "sync_status" => Some(Self::SyncStatus),
            "peer_connected" => Some(Self::PeerConnected),
            "peer_disconnected" => Some(Self::PeerDisconnected),
            "block_created" => Some(Self::BlockCreated),
            "space_updated" => Some(Self::SpaceUpdated),
            "mempool_changed" => Some(Self::MempoolChanged),
            _ => None,
        }
    }

    /// Convert to string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ContentNew => "content_new",
            Self::ContentEngaged => "content_engaged",
            Self::SyncStatus => "sync_status",
            Self::PeerConnected => "peer_connected",
            Self::PeerDisconnected => "peer_disconnected",
            Self::BlockCreated => "block_created",
            Self::SpaceUpdated => "space_updated",
            Self::MempoolChanged => "mempool_changed",
        }
    }
}

/// Real-time event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Event type
    #[serde(rename = "type")]
    pub event_type: EventType,
    /// Event timestamp (Unix milliseconds)
    pub timestamp: u64,
    /// Event-specific data
    pub data: Value,
}

impl Event {
    /// Create a new event
    pub fn new(event_type: EventType, data: Value) -> Self {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Self {
            event_type,
            timestamp,
            data,
        }
    }

    /// Create a content_new event
    ///
    /// `thread_id` is the content ID of the thread root (parent for replies, self for
    /// posts) so chat-style clients can filter events to the active channel.
    pub fn content_new(
        content_id: &str,
        content_type: &str,
        space_id: &str,
        author_id: &str,
        thread_id: Option<&str>,
    ) -> Self {
        Self::new(
            EventType::ContentNew,
            json!({
                "content_id": content_id,
                "content_type": content_type,
                "space_id": space_id,
                "author_id": author_id,
                "thread_id": thread_id,
            }),
        )
    }

    /// Create a content_engaged event
    ///
    /// `space_id` / `thread_id` are included when known so clients can filter
    /// engagement events to the space/thread they are currently viewing.
    pub fn content_engaged(
        content_id: &str,
        engager_id: &str,
        emoji: Option<u8>,
        space_id: Option<&str>,
        thread_id: Option<&str>,
    ) -> Self {
        Self::new(
            EventType::ContentEngaged,
            json!({
                "content_id": content_id,
                "engager_id": engager_id,
                "emoji": emoji,
                "space_id": space_id,
                "thread_id": thread_id,
            }),
        )
    }

    /// Create a sync_status event
    pub fn sync_status(state: &str, chain_percent: u8, peer_count: u64) -> Self {
        Self::new(
            EventType::SyncStatus,
            json!({
                "state": state,
                "chain_percent": chain_percent,
                "peer_count": peer_count,
            }),
        )
    }

    /// Create a peer_connected event
    pub fn peer_connected(peer_id: &str, address: &str) -> Self {
        Self::new(
            EventType::PeerConnected,
            json!({
                "peer_id": peer_id,
                "address": address,
            }),
        )
    }

    /// Create a peer_disconnected event
    pub fn peer_disconnected(peer_id: &str, reason: &str) -> Self {
        Self::new(
            EventType::PeerDisconnected,
            json!({
                "peer_id": peer_id,
                "reason": reason,
            }),
        )
    }

    /// Create a block_created event
    pub fn block_created(height: u64, hash: &str, action_count: usize) -> Self {
        Self::new(
            EventType::BlockCreated,
            json!({
                "height": height,
                "hash": hash,
                "action_count": action_count,
            }),
        )
    }

    /// Create a space_updated event
    pub fn space_updated(space_id: &str, update_type: &str) -> Self {
        Self::new(
            EventType::SpaceUpdated,
            json!({
                "space_id": space_id,
                "update_type": update_type,
            }),
        )
    }

    /// Create a mempool_changed event
    pub fn mempool_changed(action: &str, content_id: Option<&str>, pending_count: usize) -> Self {
        Self::new(
            EventType::MempoolChanged,
            json!({
                "action": action,
                "content_id": content_id,
                "pending_count": pending_count,
            }),
        )
    }

    /// Format as JSON-RPC notification
    pub fn to_notification(&self) -> Value {
        json!({
            "jsonrpc": "2.0",
            "method": "event",
            "params": self,
        })
    }
}

/// Subscription request from client
#[derive(Debug, Clone, Deserialize)]
pub struct SubscribeParams {
    /// Event types to subscribe to
    pub events: Vec<String>,
    /// Optional: filter by space ID
    #[serde(default)]
    pub space_id: Option<String>,
}

/// Subscription response
#[derive(Debug, Clone, Serialize)]
pub struct SubscribeResult {
    /// Subscription ID
    pub subscription_id: String,
    /// Events subscribed to
    pub subscribed: Vec<String>,
    /// Events that were not recognized
    pub unrecognized: Vec<String>,
}

/// Unsubscribe request
#[derive(Debug, Clone, Deserialize)]
pub struct UnsubscribeParams {
    /// Subscription ID to cancel
    pub subscription_id: String,
}

/// Client subscription state
#[derive(Debug)]
struct ClientSubscription {
    /// Subscribed event types
    events: HashSet<EventType>,
    /// Optional space filter
    space_id: Option<String>,
    /// Client IP for rate limiting
    #[allow(dead_code)]
    client_ip: IpAddr,
}

/// Event manager for broadcasting events to subscribed clients
pub struct EventManager {
    /// Event broadcast channel sender
    event_tx: broadcast::Sender<Event>,
    /// Active subscriptions (subscription_id -> subscription)
    subscriptions: RwLock<HashMap<String, ClientSubscription>>,
    /// Connection count per IP
    connections_per_ip: RwLock<HashMap<IpAddr, usize>>,
    /// Total connection count
    total_connections: AtomicU64,
    /// Next subscription ID
    next_subscription_id: AtomicU64,
}

impl EventManager {
    /// Create a new event manager
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        Self {
            event_tx,
            subscriptions: RwLock::new(HashMap::new()),
            connections_per_ip: RwLock::new(HashMap::new()),
            total_connections: AtomicU64::new(0),
            next_subscription_id: AtomicU64::new(1),
        }
    }

    /// Get the event broadcast sender for publishing events
    pub fn sender(&self) -> broadcast::Sender<Event> {
        self.event_tx.clone()
    }

    /// Subscribe to receive events
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.event_tx.subscribe()
    }

    /// Publish an event to all subscribers
    pub fn publish(&self, event: Event) {
        // Ignore send errors (no subscribers)
        let _ = self.event_tx.send(event);
    }

    /// Publish a content_new event
    pub fn publish_content_new(
        &self,
        content_id: &str,
        content_type: &str,
        space_id: &str,
        author_id: &str,
        thread_id: Option<&str>,
    ) {
        self.publish(Event::content_new(
            content_id,
            content_type,
            space_id,
            author_id,
            thread_id,
        ));
    }

    /// Publish a content_engaged event
    pub fn publish_content_engaged(
        &self,
        content_id: &str,
        engager_id: &str,
        emoji: Option<u8>,
        space_id: Option<&str>,
        thread_id: Option<&str>,
    ) {
        self.publish(Event::content_engaged(
            content_id, engager_id, emoji, space_id, thread_id,
        ));
    }

    /// Publish a sync_status event
    pub fn publish_sync_status(&self, state: &str, chain_percent: u8, peer_count: u64) {
        self.publish(Event::sync_status(state, chain_percent, peer_count));
    }

    /// Publish a peer_connected event
    pub fn publish_peer_connected(&self, peer_id: &str, address: &str) {
        self.publish(Event::peer_connected(peer_id, address));
    }

    /// Publish a peer_disconnected event
    pub fn publish_peer_disconnected(&self, peer_id: &str, reason: &str) {
        self.publish(Event::peer_disconnected(peer_id, reason));
    }

    /// Publish a block_created event
    pub fn publish_block_created(&self, height: u64, hash: &str, action_count: usize) {
        self.publish(Event::block_created(height, hash, action_count));
    }

    /// Publish a space_updated event
    pub fn publish_space_updated(&self, space_id: &str, update_type: &str) {
        self.publish(Event::space_updated(space_id, update_type));
    }

    /// Publish a mempool_changed event
    pub fn publish_mempool_changed(
        &self,
        action: &str,
        content_id: Option<&str>,
        pending_count: usize,
    ) {
        self.publish(Event::mempool_changed(action, content_id, pending_count));
    }

    /// Check if a new connection can be accepted
    pub async fn can_accept_connection(&self, client_ip: IpAddr) -> bool {
        // Check total connection limit
        if self.total_connections.load(Ordering::Relaxed) >= MAX_WS_CONNECTIONS_TOTAL as u64 {
            return false;
        }

        // Check per-IP limit
        let connections = self.connections_per_ip.read().await;
        if let Some(&count) = connections.get(&client_ip) {
            if count >= MAX_WS_CONNECTIONS_PER_IP {
                return false;
            }
        }

        true
    }

    /// Record a new connection
    pub async fn record_connection(&self, client_ip: IpAddr) {
        self.total_connections.fetch_add(1, Ordering::Relaxed);
        let mut connections = self.connections_per_ip.write().await;
        *connections.entry(client_ip).or_insert(0) += 1;
    }

    /// Record a connection close
    pub async fn record_disconnection(&self, client_ip: IpAddr) {
        self.total_connections.fetch_sub(1, Ordering::Relaxed);
        let mut connections = self.connections_per_ip.write().await;
        if let Some(count) = connections.get_mut(&client_ip) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                connections.remove(&client_ip);
            }
        }
    }

    /// Create a new subscription
    pub async fn create_subscription(
        &self,
        params: SubscribeParams,
        client_ip: IpAddr,
    ) -> SubscribeResult {
        let subscription_id = format!(
            "sub_{}",
            self.next_subscription_id.fetch_add(1, Ordering::Relaxed)
        );

        let mut events = HashSet::new();
        let mut subscribed = Vec::new();
        let mut unrecognized = Vec::new();

        for event_str in &params.events {
            if let Some(event_type) = EventType::from_str(event_str) {
                events.insert(event_type);
                subscribed.push(event_type.as_str().to_string());
            } else {
                unrecognized.push(event_str.clone());
            }
        }

        let subscription = ClientSubscription {
            events,
            space_id: params.space_id,
            client_ip,
        };

        self.subscriptions
            .write()
            .await
            .insert(subscription_id.clone(), subscription);

        SubscribeResult {
            subscription_id,
            subscribed,
            unrecognized,
        }
    }

    /// Remove a subscription
    pub async fn remove_subscription(&self, subscription_id: &str) -> bool {
        self.subscriptions
            .write()
            .await
            .remove(subscription_id)
            .is_some()
    }

    /// Check if an event matches a subscription
    pub async fn matches_subscription(&self, subscription_id: &str, event: &Event) -> bool {
        let subscriptions = self.subscriptions.read().await;
        if let Some(sub) = subscriptions.get(subscription_id) {
            // Check event type
            if !sub.events.contains(&event.event_type) {
                return false;
            }

            // Check space filter if applicable
            if let Some(ref filter_space) = sub.space_id {
                if let Some(event_space) = event.data.get("space_id").and_then(|v| v.as_str()) {
                    if event_space != filter_space {
                        return false;
                    }
                }
            }

            true
        } else {
            false
        }
    }

    /// Get current connection stats
    pub fn connection_stats(&self) -> (u64, usize) {
        (
            self.total_connections.load(Ordering::Relaxed),
            MAX_WS_CONNECTIONS_TOTAL,
        )
    }
}

impl Default for EventManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    fn test_ip() -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))
    }

    #[test]
    fn test_event_type_parsing() {
        assert_eq!(
            EventType::from_str("content_new"),
            Some(EventType::ContentNew)
        );
        assert_eq!(
            EventType::from_str("sync_status"),
            Some(EventType::SyncStatus)
        );
        assert_eq!(EventType::from_str("invalid"), None);
    }

    #[test]
    fn test_event_creation() {
        let event = Event::content_new(
            "sha256:abc",
            "post",
            "sp1xyz",
            "author123",
            Some("sha256:abc"),
        );
        assert_eq!(event.event_type, EventType::ContentNew);
        assert_eq!(event.data["content_id"], "sha256:abc");
        assert_eq!(event.data["content_type"], "post");
    }

    #[test]
    fn test_event_notification_format() {
        let event = Event::sync_status("syncing", 50, 5);
        let notification = event.to_notification();
        assert_eq!(notification["jsonrpc"], "2.0");
        assert_eq!(notification["method"], "event");
        assert!(notification["params"]["data"]["state"].is_string());
    }

    #[tokio::test]
    async fn test_event_manager_subscription() {
        let manager = EventManager::new();
        let ip = test_ip();

        let params = SubscribeParams {
            events: vec!["content_new".to_string(), "invalid".to_string()],
            space_id: None,
        };

        let result = manager.create_subscription(params, ip).await;
        assert!(result.subscription_id.starts_with("sub_"));
        assert_eq!(result.subscribed.len(), 1);
        assert_eq!(result.unrecognized.len(), 1);
    }

    #[tokio::test]
    async fn test_connection_limits() {
        let manager = EventManager::new();
        let ip = test_ip();

        // Should accept initial connections
        assert!(manager.can_accept_connection(ip).await);

        // Record connections up to limit
        for _ in 0..MAX_WS_CONNECTIONS_PER_IP {
            manager.record_connection(ip).await;
        }

        // Should reject after limit
        assert!(!manager.can_accept_connection(ip).await);

        // Different IP should still work
        let ip2 = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 2));
        assert!(manager.can_accept_connection(ip2).await);
    }

    #[tokio::test]
    async fn test_subscription_matching() {
        let manager = EventManager::new();
        let ip = test_ip();

        let params = SubscribeParams {
            events: vec!["content_new".to_string()],
            space_id: Some("sp1test".to_string()),
        };

        let result = manager.create_subscription(params, ip).await;
        let sub_id = result.subscription_id;

        // Matching event
        let event = Event::content_new("sha256:abc", "post", "sp1test", "author", None);
        assert!(manager.matches_subscription(&sub_id, &event).await);

        // Non-matching event type
        let event2 = Event::sync_status("syncing", 50, 5);
        assert!(!manager.matches_subscription(&sub_id, &event2).await);

        // Non-matching space
        let event3 = Event::content_new("sha256:abc", "post", "sp1other", "author", None);
        assert!(!manager.matches_subscription(&sub_id, &event3).await);
    }

    #[tokio::test]
    async fn test_event_broadcast() {
        let manager = EventManager::new();
        let mut rx = manager.subscribe();

        // Publish an event
        manager.publish_content_new("sha256:test", "post", "sp1test", "author123", None);

        // Receive the event
        let event = rx.recv().await.unwrap();
        assert_eq!(event.event_type, EventType::ContentNew);
        assert_eq!(event.data["content_id"], "sha256:test");
    }

    #[tokio::test]
    async fn test_disconnection_tracking() {
        let manager = EventManager::new();
        let ip = test_ip();

        manager.record_connection(ip).await;
        manager.record_connection(ip).await;

        let (total, _) = manager.connection_stats();
        assert_eq!(total, 2);

        manager.record_disconnection(ip).await;
        let (total, _) = manager.connection_stats();
        assert_eq!(total, 1);
    }
}
