//! API Client facade
//!
//! Provides a unified interface for all API operations, combining queries,
//! commands, and subscriptions into a single client.

use std::sync::{Arc, RwLock};

use tokio::sync::broadcast;

use crate::api::commands::{CommandHandler, PowProgressCallback, PowResult};
use crate::api::config::ApiConfig;
use crate::api::error::ApiError;
use crate::api::events::ApiEvent;
use crate::api::queries::QueryHandler;
use crate::api::subscription::SubscriptionManager;
use crate::api::types::{ContentResponse, SyncStatusResponse};
use crate::content::pool::PoolManager;
use crate::identity::PortableIdentity;
use crate::storage::StorageManager;
use crate::types::content::{ContentId, SpaceId};

/// Unified API client for Swimchain operations
///
/// Provides access to:
/// - **Queries**: Read operations like getting content and sync status
/// - **Commands**: Write operations like creating posts and replies
/// - **Subscriptions**: Real-time event streaming
///
/// # Example
///
/// ```no_run
/// use swimchain::api::{ApiClient, ApiConfig};
/// use swimchain::storage::{StorageConfig, StorageManager};
/// use swimchain::types::identity::IdentityId;
/// use std::sync::{Arc, RwLock};
///
/// let storage = Arc::new(RwLock::new(
///     StorageManager::open(
///         StorageConfig::default(),
///         IdentityId::from_bytes([0u8; 32])
///     ).unwrap()
/// ));
///
/// let client = ApiClient::builder()
///     .storage(storage)
///     .build()
///     .unwrap();
/// ```
pub struct ApiClient {
    query_handler: QueryHandler,
    command_handler: CommandHandler,
    subscription_manager: SubscriptionManager,
    #[allow(dead_code)]
    config: ApiConfig,
}

impl ApiClient {
    /// Create a new builder for ApiClient
    #[must_use]
    pub fn builder() -> ApiClientBuilder {
        ApiClientBuilder::default()
    }

    // === Query methods (delegated to query_handler) ===

    /// Get content by ID with decay state
    ///
    /// # Errors
    ///
    /// Returns error if content is not found or storage read fails.
    pub fn get_content(&self, content_id: &ContentId) -> Result<ContentResponse, ApiError> {
        self.query_handler.get_content(content_id)
    }

    /// Get current sync status
    #[must_use]
    pub fn get_sync_status(&self) -> SyncStatusResponse {
        self.query_handler.get_sync_status()
    }

    // === Command methods (delegated to command_handler) ===

    /// Create a new post
    ///
    /// Computes proof-of-work and creates a post in the specified space.
    ///
    /// # Errors
    ///
    /// Returns error if no identity is set or PoW fails.
    pub fn create_post(
        &self,
        space_id: SpaceId,
        body: &str,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        self.command_handler.create_post(space_id, body, progress)
    }

    /// Create a reply to existing content
    ///
    /// Computes proof-of-work and creates a reply to the specified content.
    ///
    /// # Errors
    ///
    /// Returns error if no identity is set or PoW fails.
    pub fn create_reply(
        &self,
        parent_id: ContentId,
        body: &str,
        progress: Option<PowProgressCallback>,
    ) -> Result<PowResult<ContentId>, ApiError> {
        self.command_handler.create_reply(parent_id, body, progress)
    }

    /// Set the identity for signing operations
    pub fn set_identity(&mut self, identity: PortableIdentity) {
        self.command_handler.set_identity(identity);
    }

    /// Clear the current identity
    pub fn clear_identity(&mut self) {
        self.command_handler.clear_identity();
    }

    /// Check if an identity is set
    #[must_use]
    pub fn has_identity(&self) -> bool {
        self.command_handler.has_identity()
    }

    // === Subscription methods ===

    /// Subscribe to receive events
    ///
    /// Returns a receiver that will receive all events sent after subscription.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<ApiEvent> {
        self.subscription_manager.subscribe()
    }

    /// Emit an event to all subscribers
    ///
    /// Used by internal components to publish events.
    pub fn emit_event(&self, event: ApiEvent) {
        self.subscription_manager.send(event);
    }

    /// Get the number of active subscribers
    #[must_use]
    pub fn subscriber_count(&self) -> usize {
        self.subscription_manager.subscriber_count()
    }
}

/// Builder for ApiClient
#[derive(Default)]
pub struct ApiClientBuilder {
    storage: Option<Arc<RwLock<StorageManager>>>,
    pool_manager: Option<Arc<RwLock<PoolManager>>>,
    identity: Option<PortableIdentity>,
    config: Option<ApiConfig>,
    use_test_pow: bool,
}

impl ApiClientBuilder {
    /// Set the storage manager (required)
    #[must_use]
    pub fn storage(mut self, storage: Arc<RwLock<StorageManager>>) -> Self {
        self.storage = Some(storage);
        self
    }

    /// Set the pool manager (optional)
    #[must_use]
    pub fn pool_manager(mut self, pm: Arc<RwLock<PoolManager>>) -> Self {
        self.pool_manager = Some(pm);
        self
    }

    /// Set the initial identity (optional)
    #[must_use]
    pub fn identity(mut self, identity: PortableIdentity) -> Self {
        self.identity = Some(identity);
        self
    }

    /// Set the API configuration (optional)
    #[must_use]
    pub fn config(mut self, config: ApiConfig) -> Self {
        self.config = Some(config);
        self
    }

    /// Use test PoW configuration for faster mining
    #[must_use]
    pub fn use_test_pow(mut self) -> Self {
        self.use_test_pow = true;
        self
    }

    /// Build the ApiClient
    ///
    /// # Errors
    ///
    /// Returns error if storage is not set.
    pub fn build(self) -> Result<ApiClient, ApiError> {
        let storage = self
            .storage
            .ok_or_else(|| ApiError::Internal("storage is required".to_string()))?;

        let config = self.config.unwrap_or_default();

        let mut query_handler = QueryHandler::new(storage);
        if let Some(pm) = self.pool_manager {
            query_handler = query_handler.with_pool_manager(pm);
        }

        let mut command_handler = if self.use_test_pow {
            CommandHandler::with_test_config()
        } else {
            CommandHandler::new()
        };

        if let Some(identity) = self.identity {
            command_handler.set_identity(identity);
        }

        let subscription_manager = SubscriptionManager::new(&config);

        Ok(ApiClient {
            query_handler,
            command_handler,
            subscription_manager,
            config,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::StorageConfig;
    use crate::types::identity::IdentityId;
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

    #[test]
    fn test_identity_management() {
        let storage = create_test_storage();
        let mut client = ApiClient::builder().storage(storage).build().unwrap();

        assert!(!client.has_identity());

        // Create a test identity
        let (keypair, proof) = crate::identity::create_identity_with_difficulty(4);
        let identity =
            crate::identity::export_identity(&keypair, Some(&proof), "test-password").unwrap();

        client.set_identity(identity);
        assert!(client.has_identity());

        client.clear_identity();
        assert!(!client.has_identity());
    }

    #[tokio::test]
    async fn test_subscribe_and_emit() {
        let storage = create_test_storage();
        let client = ApiClient::builder().storage(storage).build().unwrap();

        let mut rx = client.subscribe();
        // subscriber_count includes internal receiver (1) plus our subscription (1) = 2
        assert_eq!(client.subscriber_count(), 2);

        // Emit an event
        client.emit_event(ApiEvent::Network(
            crate::api::events::NetworkEvent::PeerConnected { peer_count: 5 },
        ));

        // Receive the event
        let received = rx.try_recv();
        assert!(received.is_ok());
    }

    #[test]
    fn test_builder_with_all_options() {
        let storage = create_test_storage();
        let pool_manager = Arc::new(RwLock::new(PoolManager::new()));

        let (keypair, proof) = crate::identity::create_identity_with_difficulty(4);
        let identity =
            crate::identity::export_identity(&keypair, Some(&proof), "test-password").unwrap();

        let config = ApiConfig::default().with_buffer_size(200);

        let result = ApiClient::builder()
            .storage(storage)
            .pool_manager(pool_manager)
            .identity(identity)
            .config(config)
            .use_test_pow()
            .build();

        assert!(result.is_ok());
        let client = result.unwrap();
        assert!(client.has_identity());
    }

    #[test]
    fn test_get_sync_status() {
        let storage = create_test_storage();
        let client = ApiClient::builder().storage(storage).build().unwrap();

        let status = client.get_sync_status();
        assert_eq!(status.state, crate::api::types::SyncState::Idle);
    }
}
