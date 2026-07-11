//! Subscription manager for real-time events
//!
//! Provides a publish-subscribe mechanism for API events using tokio's broadcast channel.

use tokio::sync::broadcast;

use crate::api::config::ApiConfig;
use crate::api::events::ApiEvent;

/// Manages event subscriptions and distribution
///
/// Uses a tokio broadcast channel to send events to all subscribers.
/// Events are cloned for each subscriber, so all subscribers receive
/// independent copies.
pub struct SubscriptionManager {
    sender: broadcast::Sender<ApiEvent>,
    // Keep a receiver to prevent the channel from closing when no subscribers exist
    _receiver: broadcast::Receiver<ApiEvent>,
}

impl SubscriptionManager {
    /// Create a new subscription manager with the given config
    #[must_use]
    pub fn new(config: &ApiConfig) -> Self {
        let (sender, _receiver) = broadcast::channel(config.event_buffer_size);
        Self { sender, _receiver }
    }

    /// Create a new subscription manager with default buffer size
    #[must_use]
    pub fn with_default_buffer() -> Self {
        Self::new(&ApiConfig::default())
    }

    /// Subscribe to receive events
    ///
    /// Returns a receiver that will receive all events sent after subscription.
    /// Events sent before subscription are not received.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<ApiEvent> {
        self.sender.subscribe()
    }

    /// Send an event to all subscribers
    ///
    /// If there are no subscribers, the event is silently dropped.
    pub fn send(&self, event: ApiEvent) {
        // Ignore send errors - they occur when there are no subscribers
        let _ = self.sender.send(event);
    }

    /// Get a clone of the sender for use in other contexts
    #[must_use]
    pub fn sender(&self) -> broadcast::Sender<ApiEvent> {
        self.sender.clone()
    }

    /// Get the number of active subscribers
    #[must_use]
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::events::{ContentEvent, NetworkEvent};
    use crate::types::content::{ContentId, SpaceId};
    use crate::types::identity::IdentityId;

    #[tokio::test]
    async fn test_subscribe_receives_events() {
        let manager = SubscriptionManager::with_default_buffer();
        let mut rx = manager.subscribe();

        let event = ApiEvent::Network(NetworkEvent::PeerConnected { peer_count: 5 });
        manager.send(event);

        let received = rx.try_recv();
        assert!(received.is_ok());

        if let ApiEvent::Network(NetworkEvent::PeerConnected { peer_count }) = received.unwrap() {
            assert_eq!(peer_count, 5);
        } else {
            panic!("Wrong event type");
        }
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let manager = SubscriptionManager::with_default_buffer();
        let mut rx1 = manager.subscribe();
        let mut rx2 = manager.subscribe();
        let mut rx3 = manager.subscribe();

        let event = ApiEvent::Network(NetworkEvent::PeerConnected { peer_count: 3 });
        manager.send(event);

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
        assert!(rx3.try_recv().is_ok());
    }

    #[tokio::test]
    async fn test_no_panic_when_no_subscribers() {
        let manager = SubscriptionManager::with_default_buffer();

        // Should not panic even with no subscribers
        let event = ApiEvent::Content(ContentEvent::NewPost {
            content_id: ContentId::from_bytes([1u8; 32]),
            space_id: SpaceId::from_bytes([2u8; 32]),
            author_id: IdentityId::from_bytes([3u8; 32]),
        });
        manager.send(event);
    }

    #[tokio::test]
    async fn test_subscriber_count() {
        let manager = SubscriptionManager::with_default_buffer();
        // Note: receiver_count includes the internal receiver kept by SubscriptionManager
        let initial_count = manager.subscriber_count();

        let _rx1 = manager.subscribe();
        assert_eq!(manager.subscriber_count(), initial_count + 1);

        let _rx2 = manager.subscribe();
        assert_eq!(manager.subscriber_count(), initial_count + 2);

        // Note: subscriber_count may not immediately reflect dropped receivers
        // due to the async nature of broadcast channels
    }

    #[tokio::test]
    async fn test_events_are_realtime() {
        let manager = SubscriptionManager::with_default_buffer();
        let mut rx = manager.subscribe();

        let event = ApiEvent::Network(NetworkEvent::PeerConnected { peer_count: 5 });
        manager.send(event);

        let start = std::time::Instant::now();
        let received = rx.try_recv();
        let elapsed = start.elapsed();

        assert!(received.is_ok());
        assert!(elapsed.as_millis() < 10, "Event delivery took too long");
    }

    #[test]
    fn test_sender_cloning() {
        let manager = SubscriptionManager::with_default_buffer();
        let sender = manager.sender();

        // Sender clone should work
        let _ = sender.send(ApiEvent::Network(NetworkEvent::PeerConnected {
            peer_count: 1,
        }));
    }
}
