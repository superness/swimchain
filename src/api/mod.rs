//! API Layer for Swimchain (Milestone 5.2)
//!
//! Provides a unified interface for GUI and CLI applications to interact with
//! the Swimchain protocol. The API layer includes:
//!
//! - **Event-driven subscriptions**: Real-time notifications for content, network,
//!   and PoW events via broadcast channels
//! - **Request/response queries**: Synchronous reads for content, sync status, etc.
//! - **Command handlers**: Write operations with proof-of-work
//! - **Type-safe bindings**: All types are serializable for cross-process communication
//!
//! # Quick Start
//!
//! ```no_run
//! use swimchain::api::{ApiClient, ApiConfig};
//! use swimchain::storage::{StorageConfig, StorageManager};
//! use swimchain::types::identity::IdentityId;
//! use std::sync::{Arc, RwLock};
//!
//! // Create storage
//! let storage = Arc::new(RwLock::new(
//!     StorageManager::open(
//!         StorageConfig::default(),
//!         IdentityId::from_bytes([0u8; 32])
//!     ).unwrap()
//! ));
//!
//! // Build the API client
//! let client = ApiClient::builder()
//!     .storage(storage)
//!     .build()
//!     .unwrap();
//!
//! // Subscribe to events
//! let mut rx = client.subscribe();
//!
//! // Get sync status
//! let status = client.get_sync_status();
//! ```
//!
//! # Event Subscription
//!
//! Events are delivered via tokio broadcast channels:
//!
//! ```no_run
//! use swimchain::api::{ApiClient, ApiEvent, ContentEvent};
//! use swimchain::storage::{StorageConfig, StorageManager};
//! use swimchain::types::identity::IdentityId;
//! use std::sync::{Arc, RwLock};
//!
//! # let storage = Arc::new(RwLock::new(
//! #     StorageManager::open(
//! #         StorageConfig::with_base_path("/tmp/test".into()),
//! #         IdentityId::from_bytes([0u8; 32])
//! #     ).unwrap()
//! # ));
//! let client = ApiClient::builder()
//!     .storage(storage)
//!     .build()
//!     .unwrap();
//!
//! let mut rx = client.subscribe();
//!
//! // In an async context:
//! // while let Ok(event) = rx.recv().await {
//! //     match event {
//! //         ApiEvent::Content(ContentEvent::NewPost { content_id, .. }) => {
//! //             println!("New post: {:?}", content_id);
//! //         }
//! //         _ => {}
//! //     }
//! // }
//! ```

pub mod anti_abuse;
pub mod client;
pub mod commands;
pub mod config;
pub mod error;
pub mod events;
pub mod queries;
pub mod subscription;
pub mod types;

// Re-exports for convenient access
pub use client::{ApiClient, ApiClientBuilder};
pub use commands::{CommandHandler, PowProgressCallback, PowResult};
pub use config::ApiConfig;
pub use error::ApiError;
pub use events::{ApiEvent, ContentEvent, NetworkEvent, NotificationApiEvent, PowEvent};
pub use queries::QueryHandler;
pub use subscription::SubscriptionManager;
pub use types::{ContentResponse, SyncState, SyncStatusResponse};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{StorageConfig, StorageManager};
    use crate::types::content::{ContentId, SpaceId};
    use crate::types::identity::IdentityId;
    use std::sync::{Arc, RwLock};
    use tempfile::tempdir;

    fn create_test_storage() -> Arc<RwLock<StorageManager>> {
        let dir = tempdir().unwrap();
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let user_id = IdentityId::from_bytes([1u8; 32]);
        Arc::new(RwLock::new(StorageManager::open(config, user_id).unwrap()))
    }

    #[test]
    fn test_builder_requires_storage() {
        let result = ApiClient::builder().build();
        assert!(matches!(
            result,
            Err(ApiError::Internal(msg)) if msg.contains("storage")
        ));
    }

    #[test]
    fn test_builder_with_storage_succeeds() {
        let storage = create_test_storage();
        let result = ApiClient::builder().storage(storage).build();
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_content_not_found() {
        let storage = create_test_storage();
        let client = ApiClient::builder().storage(storage).build().unwrap();
        let id = ContentId::from_bytes([0u8; 32]);
        let result = client.get_content(&id);
        assert!(matches!(result, Err(ApiError::ContentNotFound(_))));
    }

    #[test]
    fn test_create_post_no_identity() {
        let storage = create_test_storage();
        let client = ApiClient::builder()
            .storage(storage)
            .use_test_pow()
            .build()
            .unwrap();
        let space = SpaceId::from_bytes([1u8; 32]);
        let result = client.create_post(space, "test", None);
        assert!(matches!(result, Err(ApiError::NoIdentity)));
    }

    #[tokio::test]
    async fn test_subscribe_receives_events_realtime() {
        let manager = SubscriptionManager::with_default_buffer();
        let mut rx = manager.subscribe();

        let event = ApiEvent::Network(NetworkEvent::PeerConnected { peer_count: 5 });
        manager.send(event);

        let start = std::time::Instant::now();
        let received = rx.try_recv();
        assert!(start.elapsed().as_millis() < 10);
        assert!(received.is_ok());
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let manager = SubscriptionManager::with_default_buffer();
        let mut rx1 = manager.subscribe();
        let mut rx2 = manager.subscribe();
        let mut rx3 = manager.subscribe();

        let event = ApiEvent::Network(NetworkEvent::SyncFailed {
            reason: "test".to_string(),
        });
        manager.send(event);

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
        assert!(rx3.try_recv().is_ok());
    }

    #[test]
    fn test_sync_status_response_idle() {
        let status = SyncStatusResponse::idle();
        assert_eq!(status.state, SyncState::Idle);
        assert_eq!(status.current_height, 0);
        assert_eq!(status.target_height, 0);
        assert_eq!(status.peer_count, 0);
    }

    #[test]
    fn test_api_error_display() {
        let err = ApiError::NoIdentity;
        assert_eq!(format!("{}", err), "No identity set");

        let err = ApiError::ContentNotFound(ContentId::from_bytes([0u8; 32]));
        assert!(format!("{}", err).contains("Content not found"));
    }

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
    fn test_config_defaults() {
        let config = ApiConfig::default();
        assert_eq!(config.event_buffer_size, 100);
        assert_eq!(config.query_timeout_ms, 5000);
    }

    #[test]
    fn test_gui_integration_flow() {
        // This test simulates a typical GUI integration flow

        // 1. Create storage
        let storage = create_test_storage();

        // 2. Build client
        let client = ApiClient::builder()
            .storage(storage)
            .use_test_pow()
            .build()
            .unwrap();

        // 3. Subscribe to events
        let mut rx = client.subscribe();
        // Note: subscriber_count includes the internal receiver, so at least 1
        assert!(client.subscriber_count() >= 1);

        // 4. Check sync status
        let status = client.get_sync_status();
        assert_eq!(status.state, SyncState::Idle);

        // 5. Try to get non-existent content
        let result = client.get_content(&ContentId::from_bytes([0u8; 32]));
        assert!(result.is_err());

        // 6. Emit an event (simulating internal component)
        client.emit_event(ApiEvent::Network(NetworkEvent::PeerConnected {
            peer_count: 1,
        }));

        // 7. Receive the event
        let received = rx.try_recv();
        assert!(received.is_ok());
    }
}
