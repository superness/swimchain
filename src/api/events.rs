//! API event types
//!
//! Defines all events that can be emitted by the API layer and received by subscribers.
//! Events are designed for real-time UI updates and are serializable for cross-process
//! communication.

use serde::{Deserialize, Serialize};

use crate::types::content::{ContentId, SpaceId};
use crate::types::identity::IdentityId;

/// Top-level API event enum
///
/// All events are tagged for easy JSON serialization and deserialization.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ApiEvent {
    /// Content-related events
    Content(ContentEvent),
    /// Network-related events
    Network(NetworkEvent),
    /// PoW-related events
    Pow(PowEvent),
    /// Notification-related events
    Notification(NotificationApiEvent),
}

/// Events related to notifications per SPEC_09 §7
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum NotificationApiEvent {
    /// A new notification was generated
    New {
        notification_id: [u8; 16],
        notification_type: String,
        message: String,
    },
    /// A notification was marked as read
    Read { notification_id: [u8; 16] },
    /// Notifications were cleared
    Cleared { count: usize },
}

/// Events related to content creation and lifecycle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ContentEvent {
    /// A new post was created
    NewPost {
        content_id: ContentId,
        space_id: SpaceId,
        author_id: IdentityId,
    },
    /// A new reply was created
    NewReply {
        content_id: ContentId,
        parent_id: ContentId,
        author_id: IdentityId,
    },
    /// Content is approaching decay threshold
    ContentDecaying {
        content_id: ContentId,
        hours_remaining: u64,
    },
    /// Content has fully decayed
    ContentDecayed { content_id: ContentId },
}

/// Events related to network state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum NetworkEvent {
    /// A peer connected
    PeerConnected { peer_count: usize },
    /// A peer disconnected
    PeerDisconnected { peer_count: usize },
    /// Sync has started
    SyncStarted { target_height: u64 },
    /// Sync progress update
    SyncProgress {
        current_height: u64,
        target_height: u64,
        percent: f64,
    },
    /// Sync completed successfully
    SyncCompleted { height: u64, duration_ms: u64 },
    /// Sync failed
    SyncFailed { reason: String },
    /// Fork detected
    ForkDetected { fork_id: [u8; 32], height: u64 },
}

/// Events related to proof-of-work operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PowEvent {
    /// PoW computation started
    Started { action: String, difficulty: u8 },
    /// PoW progress update
    Progress {
        nonces_tried: u64,
        elapsed_ms: u64,
        estimated_remaining_ms: Option<u64>,
    },
    /// PoW completed successfully
    Completed { nonce: u64, elapsed_ms: u64 },
    /// PoW was cancelled
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_serialization() {
        let event = ApiEvent::Content(ContentEvent::NewPost {
            content_id: ContentId::from_bytes([1u8; 32]),
            space_id: SpaceId::from_bytes([2u8; 32]),
            author_id: IdentityId::from_bytes([3u8; 32]),
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"Content\""));
        assert!(json.contains("\"kind\":\"NewPost\""));

        let deserialized: ApiEvent = serde_json::from_str(&json).unwrap();
        match deserialized {
            ApiEvent::Content(ContentEvent::NewPost { content_id, .. }) => {
                assert_eq!(content_id, ContentId::from_bytes([1u8; 32]));
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_network_event_serialization() {
        let event = ApiEvent::Network(NetworkEvent::SyncProgress {
            current_height: 100,
            target_height: 200,
            percent: 50.0,
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"Network\""));
        assert!(json.contains("\"kind\":\"SyncProgress\""));
        assert!(json.contains("\"percent\":50.0"));
    }

    #[test]
    fn test_pow_event_serialization() {
        let event = ApiEvent::Pow(PowEvent::Progress {
            nonces_tried: 1_000_000,
            elapsed_ms: 5000,
            estimated_remaining_ms: Some(10000),
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"Pow\""));
        assert!(json.contains("\"kind\":\"Progress\""));
    }

    #[test]
    fn test_notification_event_serialization() {
        let event = ApiEvent::Notification(NotificationApiEvent::New {
            notification_id: [1u8; 16],
            notification_type: "Streak".to_string(),
            message: "🔥 7-day streak!".to_string(),
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"Notification\""));
        assert!(json.contains("\"kind\":\"New\""));
        assert!(json.contains("Streak"));
    }

    #[test]
    fn test_notification_read_event() {
        let event = ApiEvent::Notification(NotificationApiEvent::Read {
            notification_id: [2u8; 16],
        });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"Read\""));
    }

    #[test]
    fn test_notification_cleared_event() {
        let event = ApiEvent::Notification(NotificationApiEvent::Cleared { count: 5 });

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"Cleared\""));
        assert!(json.contains("\"count\":5"));
    }
}
