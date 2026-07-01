//! DHT Manager (SPEC_06 §3.8)
//!
//! High-level interface for DHT operations.

use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use log::{info, warn};
use tokio::sync::{Mutex, RwLock};

use super::constants::{K, MAX_PROVIDERS, MAX_PROVIDERS_PER_SENDER, MAX_STORES_PER_SENDER_PER_MIN, PROVIDER_REFRESH_SECS};
use super::error::{DhtError, DhtResult};
use super::lookup::LookupCoordinator;
use super::messages::{AuthenticatedDhtMessage, DhtMessage, DhtMessageType, NodeInfo, SignedProviderInfo};
use super::node_id::NodeId;
use super::persistence::{DhtPersistence, DhtPersistenceStats};
use super::provider_store::{ProviderRecord, ProviderStore};
use super::routing_table::RoutingTable;
use super::store_rate_limiter::{StoreRateLimiter, StoreCheckResult};

/// Manages all DHT operations
pub struct DhtManager {
    /// Our local node ID
    local_id: NodeId,
    /// Our network address
    local_addr: SocketAddr,
    /// Kademlia routing table
    routing_table: Arc<RwLock<RoutingTable>>,
    /// Content provider records
    provider_store: Arc<RwLock<ProviderStore>>,
    /// Lookup coordinator
    lookup: LookupCoordinator,
    /// STORE request rate limiter (H-DHT-1)
    store_rate_limiter: Arc<Mutex<StoreRateLimiter>>,
    /// Optional persistence layer (H-DHT-2)
    persistence: Option<Arc<DhtPersistence>>,
}

impl DhtManager {
    /// Create a new DHT manager without persistence
    pub fn new(local_id: NodeId, local_addr: SocketAddr) -> Self {
        let routing_table = Arc::new(RwLock::new(RoutingTable::new(local_id)));
        let provider_store = Arc::new(RwLock::new(ProviderStore::new()));
        let lookup = LookupCoordinator::new(Arc::clone(&routing_table));
        let store_rate_limiter = Arc::new(Mutex::new(StoreRateLimiter::new()));

        Self {
            local_id,
            local_addr,
            routing_table,
            provider_store,
            lookup,
            store_rate_limiter,
            persistence: None,
        }
    }

    /// Create a new DHT manager with persistence (H-DHT-2)
    ///
    /// If valid persisted data exists, restores routing table and provider store.
    /// Otherwise starts fresh.
    pub fn with_persistence(
        local_id: NodeId,
        local_addr: SocketAddr,
        persistence_path: impl AsRef<Path>,
    ) -> DhtResult<Self> {
        let persistence = DhtPersistence::open(persistence_path)?;
        let mut routing_table = RoutingTable::new(local_id);
        let mut provider_store = ProviderStore::new();

        // Try to restore from persistence if valid
        if persistence.has_valid_data(&local_id)? {
            info!("Restoring DHT from persistence...");

            // Restore routing table entries
            let entries = persistence.load_routing_table_entries()?;
            let entry_count = entries.len();
            for entry in entries {
                // Skip stale entries
                if !entry.should_evict() {
                    let _ = routing_table.update(entry.id, entry.addr);
                }
            }
            info!("Restored {} routing table entries", entry_count);

            // Restore provider records
            let records = persistence.load_provider_records()?;
            let record_count = records.len();
            for (content_hash, record) in records {
                provider_store.add_provider(content_hash, record);
            }
            info!("Restored {} provider records", record_count);

            // Restore local content
            let local_content = persistence.load_local_content()?;
            let local_count = local_content.len();
            for hash in local_content {
                provider_store.add_local_content(hash);
            }
            info!("Restored {} local content items", local_count);
        } else {
            info!("No valid DHT persistence data found, starting fresh");
        }

        let routing_table = Arc::new(RwLock::new(routing_table));
        let provider_store = Arc::new(RwLock::new(provider_store));
        let lookup = LookupCoordinator::new(Arc::clone(&routing_table));
        let store_rate_limiter = Arc::new(Mutex::new(StoreRateLimiter::new()));

        Ok(Self {
            local_id,
            local_addr,
            routing_table,
            provider_store,
            lookup,
            store_rate_limiter,
            persistence: Some(Arc::new(persistence)),
        })
    }

    /// Get our local node ID
    pub fn local_id(&self) -> NodeId {
        self.local_id
    }

    /// Get our local address
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    // ========== Routing Table Operations ==========

    /// Add or update a node in the routing table
    ///
    /// Called when we receive any message from a peer.
    pub async fn on_node_seen(&self, id: NodeId, addr: SocketAddr) -> DhtResult<()> {
        let mut table = self.routing_table.write().await;
        let _ = table.update(id, addr)?;
        Ok(())
    }

    /// Record a failed RPC to a node
    pub async fn on_node_failed(&self, id: &NodeId) {
        let mut table = self.routing_table.write().await;
        table.record_failure(id);
    }

    /// Get the K closest nodes to a target from our routing table
    pub async fn get_closest_nodes(&self, target: &NodeId, count: usize) -> Vec<NodeInfo> {
        let table = self.routing_table.read().await;
        table
            .closest(target, count)
            .into_iter()
            .map(|e| NodeInfo::new(e.id, e.addr))
            .collect()
    }

    /// Get the current size of the routing table
    pub async fn routing_table_size(&self) -> usize {
        let table = self.routing_table.read().await;
        table.size()
    }

    // ========== Provider Operations ==========

    /// Record that a node has content (with signature verification)
    ///
    /// The `verify_signature` callback should verify that the signature
    /// was produced by the public key over the message.
    /// Signature format: (public_key, message, signature) -> bool
    pub async fn add_provider<F>(
        &self,
        content_hash: [u8; 32],
        node_id: NodeId,
        addr: SocketAddr,
        public_key: [u8; 32],
        signature: [u8; 64],
        verify_signature: F,
    ) -> DhtResult<()>
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Build the signing message and verify signature
        let signing_message = ProviderRecord::signing_message(&content_hash, &node_id, &addr);
        if !verify_signature(&public_key, &signing_message, &signature) {
            return Err(DhtError::InvalidProviderSignature {
                content_hash,
                provider: *node_id.as_bytes(),
            });
        }

        let record = ProviderRecord::new(node_id, addr, public_key, signature);
        let mut store = self.provider_store.write().await;
        store.add_provider(content_hash, record);
        Ok(())
    }

    /// Record that a node has content (internal use, skips signature verification)
    ///
    /// Used when we are the provider (we trust ourselves).
    async fn add_provider_unchecked(
        &self,
        content_hash: [u8; 32],
        node_id: NodeId,
        addr: SocketAddr,
        public_key: [u8; 32],
        signature: [u8; 64],
    ) {
        let record = ProviderRecord::new(node_id, addr, public_key, signature);
        let mut store = self.provider_store.write().await;
        store.add_provider(content_hash, record);
    }

    /// Get providers for content from our local store
    pub async fn get_local_providers(&self, content_hash: &[u8; 32]) -> Vec<SignedProviderInfo> {
        let store = self.provider_store.read().await;
        store
            .get_providers(content_hash, MAX_PROVIDERS)
            .into_iter()
            .map(|p| SignedProviderInfo::new(p.node_id, p.addr, p.public_key, p.signature))
            .collect()
    }

    /// Check if we have local provider records for content
    pub async fn has_local_providers(&self, content_hash: &[u8; 32]) -> bool {
        let store = self.provider_store.read().await;
        store.has_providers(content_hash)
    }

    /// Check if a specific node is already a provider for content
    async fn has_provider_for_content(&self, content_hash: &[u8; 32], node_id: &NodeId) -> bool {
        let store = self.provider_store.read().await;
        store
            .get_providers(content_hash, MAX_PROVIDERS)
            .iter()
            .any(|p| &p.node_id == node_id)
    }

    /// Record that WE have content (for re-announcement)
    ///
    /// Uses zero signature since local content doesn't need verification.
    /// The caller should sign the provider record when announcing to the network.
    pub async fn add_local_content(&self, content_hash: [u8; 32]) {
        let mut store = self.provider_store.write().await;
        store.add_local_content(content_hash);
        // Also add ourselves as a provider (no verification needed - we trust ourselves)
        // Use zero bytes for signature fields - these will be properly signed when announcing
        let record = ProviderRecord::new(self.local_id, self.local_addr, [0u8; 32], [0u8; 64]);
        store.add_provider(content_hash, record);
    }

    /// Remove local content (we no longer have it)
    pub async fn remove_local_content(&self, content_hash: &[u8; 32]) {
        let mut store = self.provider_store.write().await;
        store.remove_local_content(content_hash);
        store.remove_provider(content_hash, &self.local_id);
    }

    /// Get content hashes that need re-announcement
    pub async fn content_needing_refresh(&self) -> Vec<[u8; 32]> {
        let store = self.provider_store.read().await;
        store.content_needing_refresh(Duration::from_secs(PROVIDER_REFRESH_SECS))
    }

    /// Mark content as freshly announced
    pub async fn mark_content_announced(&self, content_hash: &[u8; 32]) {
        let mut store = self.provider_store.write().await;
        store.refresh_local_content(content_hash);
    }

    // ========== Message Handling ==========

    /// Handle an incoming DHT message
    ///
    /// Returns an optional response message.
    ///
    /// The `verify_signature` callback is used to verify Ed25519 signatures
    /// on provider records. It should verify that the signature was produced
    /// by the public key over the message.
    pub async fn handle_message<F>(
        &self,
        msg: DhtMessage,
        sender_id: NodeId,
        sender_addr: SocketAddr,
        verify_signature: F,
    ) -> DhtResult<Option<DhtMessage>>
    where
        F: Fn(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Update routing table with sender
        self.on_node_seen(sender_id, sender_addr).await?;

        match msg {
            DhtMessage::Ping { nonce } => {
                // Respond with PONG
                Ok(Some(DhtMessage::Pong { nonce }))
            }

            DhtMessage::Pong { .. } => {
                // Just a response, no further action
                Ok(None)
            }

            DhtMessage::FindNode { target } => {
                // Return K closest nodes to target
                let nodes = self.get_closest_nodes(&target, K).await;
                Ok(Some(DhtMessage::Nodes { nodes }))
            }

            DhtMessage::Nodes { nodes } => {
                // Add nodes to our routing table
                for node in nodes {
                    let _ = self.on_node_seen(node.id, node.addr).await;
                }
                Ok(None)
            }

            DhtMessage::FindValue { content_hash } => {
                // Check if we have providers
                let providers = self.get_local_providers(&content_hash).await;
                let has_value = {
                    let store = self.provider_store.read().await;
                    store.is_local_content(&content_hash)
                };

                if !providers.is_empty() || has_value {
                    // Return providers
                    Ok(Some(DhtMessage::Providers {
                        content_hash,
                        providers,
                        has_value,
                    }))
                } else {
                    // Return closest nodes (fallback to FIND_NODE behavior)
                    let target = NodeId::from_bytes(content_hash);
                    let nodes = self.get_closest_nodes(&target, K).await;
                    Ok(Some(DhtMessage::Nodes { nodes }))
                }
            }

            DhtMessage::Providers {
                content_hash,
                providers,
                ..
            } => {
                // Store provider records (with signature verification)
                for provider in providers {
                    // Verify each provider's signature before storing
                    match self
                        .add_provider(
                            content_hash,
                            provider.id,
                            provider.addr,
                            provider.public_key,
                            provider.signature,
                            &verify_signature,
                        )
                        .await
                    {
                        Ok(()) => {}
                        Err(DhtError::InvalidProviderSignature { .. }) => {
                            // Skip invalid providers, don't fail the whole message
                            warn!(
                                "Skipping provider with invalid signature: {}",
                                hex::encode(&provider.id.as_bytes()[..8])
                            );
                        }
                        Err(e) => return Err(e),
                    }
                }
                Ok(None)
            }

            DhtMessage::Store {
                content_hash,
                public_key,
                signature,
                ..
            } => {
                // H-DHT-1: Check rate limiting before accepting STORE
                {
                    let mut rate_limiter = self.store_rate_limiter.lock().await;
                    match rate_limiter.check_store_allowed(&sender_id) {
                        StoreCheckResult::Allowed => {} // Continue processing
                        StoreCheckResult::RateLimited { limit_per_min } => {
                            warn!(
                                "STORE rate limited: sender {} exceeded {} requests/min",
                                hex::encode(&sender_id.as_bytes()[..8]),
                                limit_per_min
                            );
                            return Ok(Some(DhtMessage::StoreAck {
                                content_hash,
                                accepted: false,
                            }));
                        }
                        StoreCheckResult::ProviderLimitExceeded { limit } => {
                            warn!(
                                "STORE rejected: sender {} exceeded provider limit of {}",
                                hex::encode(&sender_id.as_bytes()[..8]),
                                limit
                            );
                            return Ok(Some(DhtMessage::StoreAck {
                                content_hash,
                                accepted: false,
                            }));
                        }
                    }
                }

                // Check if this is a new provider or refresh
                let is_new_provider = !self.has_provider_for_content(&content_hash, &sender_id).await;

                // Record that sender has this content (with signature verification)
                match self
                    .add_provider(
                        content_hash,
                        sender_id,
                        sender_addr,
                        public_key,
                        signature,
                        verify_signature,
                    )
                    .await
                {
                    Ok(()) => {
                        // Record successful store in rate limiter
                        let mut rate_limiter = self.store_rate_limiter.lock().await;
                        rate_limiter.record_store(&sender_id, is_new_provider);
                        Ok(Some(DhtMessage::StoreAck {
                            content_hash,
                            accepted: true,
                        }))
                    }
                    Err(DhtError::InvalidProviderSignature { .. }) => {
                        // Reject the store request
                        Ok(Some(DhtMessage::StoreAck {
                            content_hash,
                            accepted: false,
                        }))
                    }
                    Err(e) => Err(e),
                }
            }

            DhtMessage::StoreAck { .. } => {
                // Acknowledgment, no further action
                Ok(None)
            }
        }
    }

    /// Handle an incoming authenticated DHT message (H-DHT-3)
    ///
    /// This version verifies the message-level signature before processing.
    /// The sender's public key must match the claimed sender_id.
    ///
    /// The `verify_signature` callback verifies Ed25519 signatures:
    /// `(public_key, message, signature) -> bool`
    ///
    /// The `current_time_ms` parameter should be the current Unix timestamp
    /// in milliseconds (used for replay attack prevention).
    pub async fn handle_authenticated_message<F>(
        &self,
        auth_msg: AuthenticatedDhtMessage,
        sender_id: NodeId,
        sender_addr: SocketAddr,
        current_time_ms: u64,
        verify_signature: F,
    ) -> DhtResult<Option<AuthenticatedDhtMessage>>
    where
        F: Fn(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Step 1: Verify sender_id matches public key
        // The node ID should be derived from the public key
        // For simplicity, we check that the public key hashes to the node ID
        // (This may vary based on how node IDs are actually derived)
        let expected_id = NodeId::from_bytes(auth_msg.sender_pubkey);
        if sender_id != expected_id {
            warn!(
                "Message sender_id {} doesn't match public key {}",
                hex::encode(&sender_id.as_bytes()[..8]),
                hex::encode(&auth_msg.sender_pubkey[..8])
            );
            return Err(DhtError::InvalidMessageSignature {
                sender: *sender_id.as_bytes(),
                reason: "sender_id doesn't match public key".to_string(),
            });
        }

        // Step 2: Verify timestamp is valid
        if !auth_msg.is_timestamp_valid(current_time_ms) {
            warn!(
                "Message timestamp invalid from {}: {} vs current {}",
                hex::encode(&sender_id.as_bytes()[..8]),
                auth_msg.timestamp,
                current_time_ms
            );
            return Err(DhtError::MessageTimestampInvalid {
                sender: *sender_id.as_bytes(),
                timestamp: auth_msg.timestamp,
                current_time: current_time_ms,
            });
        }

        // Step 3: Verify signature
        let signing_payload = auth_msg.get_signing_payload();
        if !verify_signature(&auth_msg.sender_pubkey, &signing_payload, &auth_msg.signature) {
            warn!(
                "Invalid message signature from {}",
                hex::encode(&sender_id.as_bytes()[..8])
            );
            return Err(DhtError::InvalidMessageSignature {
                sender: *sender_id.as_bytes(),
                reason: "signature verification failed".to_string(),
            });
        }

        // Step 4: Process the inner message
        let response = self
            .handle_message(
                auth_msg.message,
                sender_id,
                sender_addr,
                |pk, msg, sig| verify_signature(pk, msg, sig),
            )
            .await?;

        // If there's a response, it will need to be signed by the caller
        // Return the raw response message; caller is responsible for wrapping in AuthenticatedDhtMessage
        Ok(response.map(|msg| {
            // Create an unsigned authenticated message wrapper
            // The caller must sign this before sending
            AuthenticatedDhtMessage::new(
                msg,
                [0u8; 32], // Placeholder - caller fills in their pubkey
                current_time_ms,
                [0u8; 64], // Placeholder - caller must sign
            )
        }))
    }

    /// Create an authenticated message wrapper for a response
    ///
    /// Helper method to wrap a DhtMessage in an AuthenticatedDhtMessage.
    /// The caller must provide the signing key and sign the message.
    pub fn create_authenticated_response(
        &self,
        message: DhtMessage,
        sender_pubkey: [u8; 32],
        timestamp: u64,
    ) -> (AuthenticatedDhtMessage, Vec<u8>) {
        let payload = message.to_bytes();
        let signing_msg = AuthenticatedDhtMessage::signing_message(
            message.msg_type(),
            &payload,
            timestamp,
        );
        let auth_msg = AuthenticatedDhtMessage::new(
            message,
            sender_pubkey,
            timestamp,
            [0u8; 64], // Placeholder - caller must sign
        );
        (auth_msg, signing_msg)
    }

    // ========== Active Lookups ==========

    /// Find nodes close to a target (FIND_NODE operation)
    ///
    /// This performs an iterative Kademlia lookup.
    /// The caller must provide a function to send FIND_NODE RPCs.
    pub async fn find_node<F, Fut>(&self, target: NodeId, send_rpc: F) -> DhtResult<Vec<NodeInfo>>
    where
        F: Fn(NodeInfo) -> Fut,
        Fut: std::future::Future<Output = DhtResult<Vec<NodeInfo>>>,
    {
        let result = self.lookup.find_node(target, send_rpc).await?;
        Ok(result.closest)
    }

    /// Find providers for content (FIND_VALUE operation)
    ///
    /// This performs an iterative Kademlia lookup.
    /// The caller must provide a function to send FIND_VALUE RPCs.
    pub async fn find_providers<F, Fut>(
        &self,
        content_hash: [u8; 32],
        send_rpc: F,
    ) -> DhtResult<Vec<NodeInfo>>
    where
        F: Fn(NodeInfo, [u8; 32]) -> Fut,
        Fut: std::future::Future<Output = DhtResult<(Vec<NodeInfo>, bool)>>,
    {
        // First check local store
        let local_providers = self.get_local_providers(&content_hash).await;
        if !local_providers.is_empty() {
            // Convert SignedProviderInfo to NodeInfo for return type compatibility
            return Ok(local_providers
                .into_iter()
                .map(|p| NodeInfo::new(p.id, p.addr))
                .collect());
        }

        // Do iterative lookup
        let result = self.lookup.find_value(content_hash, send_rpc).await?;

        if !result.providers.is_empty() {
            Ok(result.providers)
        } else if !result.closest.is_empty() {
            // No providers found, but return closest nodes
            // (caller might want to ask them directly)
            Err(DhtError::NoProviders { content_hash })
        } else {
            Err(DhtError::NoProviders { content_hash })
        }
    }

    // ========== Maintenance ==========

    /// Clean up expired provider records
    pub async fn cleanup_expired_providers(&self) -> usize {
        let mut store = self.provider_store.write().await;
        store.cleanup_expired()
    }

    /// Get statistics about the DHT
    pub async fn get_stats(&self) -> DhtStats {
        let table = self.routing_table.read().await;
        let store = self.provider_store.read().await;

        DhtStats {
            local_id: *self.local_id.as_bytes(),
            total_nodes: table.size(),
            non_empty_buckets: table.non_empty_buckets().len(),
            provider_count: store.total_providers(),
        }
    }

    /// Get all nodes in the routing table (for debugging)
    pub async fn get_routing_table_nodes(&self) -> Vec<(NodeId, std::net::SocketAddr)> {
        let table = self.routing_table.read().await;
        table.all_nodes()
            .map(|entry| (entry.id, entry.addr))
            .collect()
    }

    // ========== Persistence Operations (H-DHT-2) ==========

    /// Save DHT state to persistence
    ///
    /// Should be called periodically (every 5 minutes) and on graceful shutdown.
    pub async fn save(&self) -> DhtResult<()> {
        if let Some(persistence) = &self.persistence {
            let table = self.routing_table.read().await;
            let store = self.provider_store.read().await;
            persistence.save_all(&table, &store)?;
            info!(
                "DHT persistence saved: {} nodes, {} providers",
                table.size(),
                store.total_providers()
            );
        }
        Ok(())
    }

    /// Check if persistence is enabled
    pub fn has_persistence(&self) -> bool {
        self.persistence.is_some()
    }

    /// Get persistence statistics
    pub fn persistence_stats(&self) -> DhtResult<Option<DhtPersistenceStats>> {
        match &self.persistence {
            Some(persistence) => Ok(Some(persistence.stats()?)),
            None => Ok(None),
        }
    }

    /// Clear all persisted data (for testing or reset)
    pub fn clear_persistence(&self) -> DhtResult<()> {
        if let Some(persistence) = &self.persistence {
            persistence.clear()?;
        }
        Ok(())
    }
}

/// Statistics about the DHT
#[derive(Debug, Clone)]
pub struct DhtStats {
    /// Our local node ID
    pub local_id: [u8; 32],
    /// Number of nodes in routing table
    pub total_nodes: usize,
    /// Number of non-empty k-buckets
    pub non_empty_buckets: usize,
    /// Total provider records
    pub provider_count: usize,
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

    fn make_pubkey(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn make_signature(byte: u8) -> [u8; 64] {
        [byte; 64]
    }

    /// Always-valid signature verifier for tests
    fn always_valid(_pubkey: &[u8; 32], _msg: &[u8], _sig: &[u8; 64]) -> bool {
        true
    }

    /// Always-invalid signature verifier for tests
    fn always_invalid(_pubkey: &[u8; 32], _msg: &[u8], _sig: &[u8; 64]) -> bool {
        false
    }

    #[tokio::test]
    async fn test_dht_manager_creation() {
        let local_id = make_id(42);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        assert_eq!(manager.local_id(), local_id);
        assert_eq!(manager.local_addr(), local_addr);
    }

    #[tokio::test]
    async fn test_routing_table_update() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        // Add a node
        let node_id = make_id(1);
        let node_addr = make_addr(8081);
        manager.on_node_seen(node_id, node_addr).await.unwrap();

        assert_eq!(manager.routing_table_size().await, 1);
    }

    #[tokio::test]
    async fn test_provider_operations_with_valid_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let content_hash = [0xab; 32];
        let provider_id = make_id(1);
        let provider_addr = make_addr(8081);
        let public_key = make_pubkey(1);
        let signature = make_signature(1);

        // Add provider with valid signature
        manager
            .add_provider(
                content_hash,
                provider_id,
                provider_addr,
                public_key,
                signature,
                always_valid,
            )
            .await
            .unwrap();

        // Check providers
        assert!(manager.has_local_providers(&content_hash).await);
        let providers = manager.get_local_providers(&content_hash).await;
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, provider_id);
    }

    #[tokio::test]
    async fn test_provider_operations_with_invalid_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let content_hash = [0xab; 32];
        let provider_id = make_id(1);
        let provider_addr = make_addr(8081);
        let public_key = make_pubkey(1);
        let signature = make_signature(1);

        // Add provider with invalid signature - should fail
        let result = manager
            .add_provider(
                content_hash,
                provider_id,
                provider_addr,
                public_key,
                signature,
                always_invalid,
            )
            .await;

        assert!(matches!(
            result,
            Err(DhtError::InvalidProviderSignature { .. })
        ));

        // No provider should be stored
        assert!(!manager.has_local_providers(&content_hash).await);
    }

    #[tokio::test]
    async fn test_local_content() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let content_hash = [0xcd; 32];

        // Add local content
        manager.add_local_content(content_hash).await;

        // Check it's tracked
        let store = manager.provider_store.read().await;
        assert!(store.is_local_content(&content_hash));
        drop(store);

        // We should be our own provider
        let providers = manager.get_local_providers(&content_hash).await;
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, local_id);
    }

    #[tokio::test]
    async fn test_handle_ping() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let msg = DhtMessage::Ping { nonce: 12345 };
        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);

        let response = manager
            .handle_message(msg, sender_id, sender_addr, always_valid)
            .await
            .unwrap();

        match response {
            Some(DhtMessage::Pong { nonce }) => assert_eq!(nonce, 12345),
            _ => panic!("Expected Pong response"),
        }

        // Sender should be in routing table
        assert_eq!(manager.routing_table_size().await, 1);
    }

    #[tokio::test]
    async fn test_handle_find_node() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        // Add some nodes first
        for i in 1..5 {
            manager
                .on_node_seen(make_id(i), make_addr(8080 + i as u16))
                .await
                .unwrap();
        }

        let msg = DhtMessage::FindNode {
            target: make_id(10),
        };
        let sender_id = make_id(100);
        let sender_addr = make_addr(9000);

        let response = manager
            .handle_message(msg, sender_id, sender_addr, always_valid)
            .await
            .unwrap();

        match response {
            Some(DhtMessage::Nodes { nodes }) => {
                assert!(!nodes.is_empty());
            }
            _ => panic!("Expected Nodes response"),
        }
    }

    #[tokio::test]
    async fn test_handle_store_with_valid_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let content_hash = [0xef; 32];
        let public_key = make_pubkey(1);
        let signature = make_signature(1);
        let msg = DhtMessage::Store {
            content_hash,
            ttl: 3600,
            public_key,
            signature,
        };
        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);

        let response = manager
            .handle_message(msg, sender_id, sender_addr, always_valid)
            .await
            .unwrap();

        match response {
            Some(DhtMessage::StoreAck {
                content_hash: h,
                accepted,
            }) => {
                assert_eq!(h, content_hash);
                assert!(accepted);
            }
            _ => panic!("Expected StoreAck response"),
        }

        // Sender should be recorded as provider
        assert!(manager.has_local_providers(&content_hash).await);
    }

    #[tokio::test]
    async fn test_handle_store_with_invalid_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let content_hash = [0xef; 32];
        let public_key = make_pubkey(1);
        let signature = make_signature(1);
        let msg = DhtMessage::Store {
            content_hash,
            ttl: 3600,
            public_key,
            signature,
        };
        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);

        let response = manager
            .handle_message(msg, sender_id, sender_addr, always_invalid)
            .await
            .unwrap();

        match response {
            Some(DhtMessage::StoreAck {
                content_hash: h,
                accepted,
            }) => {
                assert_eq!(h, content_hash);
                assert!(!accepted); // Should be rejected
            }
            _ => panic!("Expected StoreAck response"),
        }

        // Sender should NOT be recorded as provider
        assert!(!manager.has_local_providers(&content_hash).await);
    }

    #[tokio::test]
    async fn test_stats() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        // Add some data
        manager
            .on_node_seen(make_id(1), make_addr(8081))
            .await
            .unwrap();
        manager.add_local_content([0xab; 32]).await;

        let stats = manager.get_stats().await;
        assert_eq!(stats.total_nodes, 1);
        assert!(stats.provider_count >= 1); // add_local_content adds us as provider
    }

    // ========== H-DHT-1: STORE Rate Limiting Tests ==========

    #[tokio::test]
    async fn test_store_rate_limiting_allows_normal_usage() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);

        // Send several STORE requests - should all be accepted
        for i in 0u8..5 {
            let content_hash = [i; 32];
            let msg = DhtMessage::Store {
                content_hash,
                ttl: 3600,
                public_key: make_pubkey(1),
                signature: make_signature(1),
            };

            let response = manager
                .handle_message(msg, sender_id, sender_addr, always_valid)
                .await
                .unwrap();

            match response {
                Some(DhtMessage::StoreAck { accepted, .. }) => {
                    assert!(accepted, "Store {} should be accepted", i);
                }
                _ => panic!("Expected StoreAck"),
            }
        }
    }

    #[tokio::test]
    async fn test_store_rate_limiting_enforced() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);

        // Spam STORE requests until rate limited
        // Default limit is MAX_STORES_PER_SENDER_PER_MIN (60)
        let mut accepted_count = 0;
        let mut rejected_count = 0;

        for i in 0u8..70 {
            let content_hash = [i; 32];
            let msg = DhtMessage::Store {
                content_hash,
                ttl: 3600,
                public_key: make_pubkey(1),
                signature: make_signature(1),
            };

            let response = manager
                .handle_message(msg, sender_id, sender_addr, always_valid)
                .await
                .unwrap();

            match response {
                Some(DhtMessage::StoreAck { accepted, .. }) => {
                    if accepted {
                        accepted_count += 1;
                    } else {
                        rejected_count += 1;
                    }
                }
                _ => panic!("Expected StoreAck"),
            }
        }

        // Should have accepted 60 and rejected 10
        assert_eq!(
            accepted_count,
            super::super::constants::MAX_STORES_PER_SENDER_PER_MIN as usize,
            "Should accept exactly MAX_STORES_PER_SENDER_PER_MIN requests"
        );
        assert!(rejected_count > 0, "Should have rejected some requests");
    }

    #[tokio::test]
    async fn test_store_different_senders_independent() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        // Sender 1 sends many requests
        let sender1_id = make_id(1);
        let sender1_addr = make_addr(8081);
        for i in 0u8..50 {
            let msg = DhtMessage::Store {
                content_hash: [i; 32],
                ttl: 3600,
                public_key: make_pubkey(1),
                signature: make_signature(1),
            };
            let _ = manager
                .handle_message(msg, sender1_id, sender1_addr, always_valid)
                .await;
        }

        // Sender 2 should still be able to send
        let sender2_id = make_id(2);
        let sender2_addr = make_addr(8082);
        let msg = DhtMessage::Store {
            content_hash: [0xff; 32],
            ttl: 3600,
            public_key: make_pubkey(2),
            signature: make_signature(2),
        };

        let response = manager
            .handle_message(msg, sender2_id, sender2_addr, always_valid)
            .await
            .unwrap();

        match response {
            Some(DhtMessage::StoreAck { accepted, .. }) => {
                assert!(accepted, "Different sender should not be rate limited");
            }
            _ => panic!("Expected StoreAck"),
        }
    }

    #[tokio::test]
    async fn test_store_refresh_same_content_allowed() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let content_hash = [0xab; 32];

        // First store
        let msg = DhtMessage::Store {
            content_hash,
            ttl: 3600,
            public_key: make_pubkey(1),
            signature: make_signature(1),
        };
        let response = manager
            .handle_message(msg.clone(), sender_id, sender_addr, always_valid)
            .await
            .unwrap();
        assert!(matches!(
            response,
            Some(DhtMessage::StoreAck { accepted: true, .. })
        ));

        // Refresh same content - should be accepted (doesn't count as new provider)
        let response = manager
            .handle_message(msg, sender_id, sender_addr, always_valid)
            .await
            .unwrap();
        assert!(matches!(
            response,
            Some(DhtMessage::StoreAck { accepted: true, .. })
        ));
    }

    // ========== H-DHT-2: Persistence Tests ==========

    #[tokio::test]
    async fn test_persistence_creation() {
        let tmp = tempfile::TempDir::new().unwrap();
        let local_id = make_id(0x42);
        let local_addr = make_addr(8080);

        let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();

        assert!(manager.has_persistence());
        assert_eq!(manager.local_id(), local_id);
    }

    #[tokio::test]
    async fn test_persistence_save_and_restore() {
        let tmp = tempfile::TempDir::new().unwrap();
        let local_id = make_id(0);
        let local_addr = make_addr(8080);

        // Create manager, add data, and save
        {
            let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();

            // Add nodes to routing table
            for i in 1u8..5 {
                manager
                    .on_node_seen(make_id(i), make_addr(8080 + i as u16))
                    .await
                    .unwrap();
            }

            // Add local content
            manager.add_local_content([0xab; 32]).await;

            // Add provider
            manager
                .add_provider(
                    [0xcd; 32],
                    make_id(10),
                    make_addr(9000),
                    make_pubkey(10),
                    make_signature(10),
                    always_valid,
                )
                .await
                .unwrap();

            // Save
            manager.save().await.unwrap();
        }

        // Reopen and verify restoration
        {
            let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();

            // Should have restored routing table (4 nodes)
            assert_eq!(manager.routing_table_size().await, 4);

            // Should have restored local content
            assert!(manager.has_local_providers(&[0xab; 32]).await);

            // Should have restored provider
            assert!(manager.has_local_providers(&[0xcd; 32]).await);
        }
    }

    #[tokio::test]
    async fn test_persistence_different_node_id_starts_fresh() {
        let tmp = tempfile::TempDir::new().unwrap();
        let local_addr = make_addr(8080);

        // Create manager with one ID and save
        {
            let manager =
                DhtManager::with_persistence(make_id(1), local_addr, tmp.path()).unwrap();
            manager
                .on_node_seen(make_id(10), make_addr(9000))
                .await
                .unwrap();
            manager.save().await.unwrap();
        }

        // Reopen with different ID - should start fresh
        {
            let manager =
                DhtManager::with_persistence(make_id(2), local_addr, tmp.path()).unwrap();
            // Should have no nodes since ID changed
            assert_eq!(manager.routing_table_size().await, 0);
        }
    }

    #[tokio::test]
    async fn test_persistence_clear() {
        let tmp = tempfile::TempDir::new().unwrap();
        let local_id = make_id(0);
        let local_addr = make_addr(8080);

        // Create, save, then clear
        {
            let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();
            manager
                .on_node_seen(make_id(1), make_addr(8081))
                .await
                .unwrap();
            manager.save().await.unwrap();
            manager.clear_persistence().unwrap();
        }

        // Reopen - should start fresh since we cleared
        {
            let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();
            assert_eq!(manager.routing_table_size().await, 0);
        }
    }

    #[tokio::test]
    async fn test_persistence_stats() {
        let tmp = tempfile::TempDir::new().unwrap();
        let local_id = make_id(0);
        let local_addr = make_addr(8080);

        let manager = DhtManager::with_persistence(local_id, local_addr, tmp.path()).unwrap();

        // Add data and save
        manager
            .on_node_seen(make_id(1), make_addr(8081))
            .await
            .unwrap();
        manager.add_local_content([0xab; 32]).await;
        manager.save().await.unwrap();

        let stats = manager.persistence_stats().unwrap().unwrap();
        assert_eq!(stats.routing_entries, 1);
        assert!(stats.local_content_count >= 1);
    }

    // ========== H-DHT-3: Message Authentication Tests ==========

    #[tokio::test]
    async fn test_handle_authenticated_message_valid() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let sender_pubkey = [1u8; 32]; // Must match sender_id bytes
        let current_time = 1704067200000u64;

        // Create authenticated ping message
        let inner_msg = DhtMessage::Ping { nonce: 12345 };
        let auth_msg = AuthenticatedDhtMessage::new(
            inner_msg,
            sender_pubkey,
            current_time,
            make_signature(1),
        );

        // Handle with always-valid signature verifier
        let response = manager
            .handle_authenticated_message(
                auth_msg,
                sender_id,
                sender_addr,
                current_time,
                always_valid,
            )
            .await
            .unwrap();

        // Should get a PONG response
        assert!(response.is_some());
        match &response.unwrap().message {
            DhtMessage::Pong { nonce } => assert_eq!(*nonce, 12345),
            _ => panic!("Expected Pong response"),
        }
    }

    #[tokio::test]
    async fn test_handle_authenticated_message_sender_id_mismatch() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let wrong_pubkey = [2u8; 32]; // Doesn't match sender_id
        let current_time = 1704067200000u64;

        let inner_msg = DhtMessage::Ping { nonce: 12345 };
        let auth_msg = AuthenticatedDhtMessage::new(
            inner_msg,
            wrong_pubkey,
            current_time,
            make_signature(1),
        );

        let result = manager
            .handle_authenticated_message(
                auth_msg,
                sender_id,
                sender_addr,
                current_time,
                always_valid,
            )
            .await;

        assert!(matches!(
            result,
            Err(DhtError::InvalidMessageSignature { .. })
        ));
    }

    #[tokio::test]
    async fn test_handle_authenticated_message_expired_timestamp() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let sender_pubkey = [1u8; 32];
        let current_time = 1704067200000u64;
        let old_timestamp = current_time - 600_000; // 10 minutes ago

        let inner_msg = DhtMessage::Ping { nonce: 12345 };
        let auth_msg = AuthenticatedDhtMessage::new(
            inner_msg,
            sender_pubkey,
            old_timestamp,
            make_signature(1),
        );

        let result = manager
            .handle_authenticated_message(
                auth_msg,
                sender_id,
                sender_addr,
                current_time,
                always_valid,
            )
            .await;

        assert!(matches!(
            result,
            Err(DhtError::MessageTimestampInvalid { .. })
        ));
    }

    #[tokio::test]
    async fn test_handle_authenticated_message_invalid_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let sender_pubkey = [1u8; 32];
        let current_time = 1704067200000u64;

        let inner_msg = DhtMessage::Ping { nonce: 12345 };
        let auth_msg = AuthenticatedDhtMessage::new(
            inner_msg,
            sender_pubkey,
            current_time,
            make_signature(1),
        );

        // Use invalid signature verifier
        let result = manager
            .handle_authenticated_message(
                auth_msg,
                sender_id,
                sender_addr,
                current_time,
                always_invalid,
            )
            .await;

        assert!(matches!(
            result,
            Err(DhtError::InvalidMessageSignature { .. })
        ));
    }

    #[tokio::test]
    async fn test_handle_authenticated_message_store_with_signature() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let sender_id = make_id(1);
        let sender_addr = make_addr(8081);
        let sender_pubkey = [1u8; 32];
        let current_time = 1704067200000u64;
        let content_hash = [0xab; 32];

        // Create authenticated STORE message
        let inner_msg = DhtMessage::Store {
            content_hash,
            ttl: 3600,
            public_key: make_pubkey(1),
            signature: make_signature(1),
        };
        let auth_msg = AuthenticatedDhtMessage::new(
            inner_msg,
            sender_pubkey,
            current_time,
            make_signature(1),
        );

        let response = manager
            .handle_authenticated_message(
                auth_msg,
                sender_id,
                sender_addr,
                current_time,
                always_valid,
            )
            .await
            .unwrap();

        // Should get a StoreAck response
        assert!(response.is_some());
        match &response.unwrap().message {
            DhtMessage::StoreAck { accepted, .. } => assert!(accepted),
            _ => panic!("Expected StoreAck response"),
        }

        // Provider should be stored
        assert!(manager.has_local_providers(&content_hash).await);
    }

    #[tokio::test]
    async fn test_create_authenticated_response() {
        let local_id = make_id(0);
        let local_addr = make_addr(8080);
        let manager = DhtManager::new(local_id, local_addr);

        let response_msg = DhtMessage::Pong { nonce: 12345 };
        let sender_pubkey = [0u8; 32]; // local node's pubkey
        let timestamp = 1704067200000u64;

        let (auth_msg, signing_msg) =
            manager.create_authenticated_response(response_msg, sender_pubkey, timestamp);

        // Verify the auth_msg structure
        assert_eq!(auth_msg.sender_pubkey, sender_pubkey);
        assert_eq!(auth_msg.timestamp, timestamp);
        match auth_msg.message {
            DhtMessage::Pong { nonce } => assert_eq!(nonce, 12345),
            _ => panic!("Wrong message type"),
        }

        // Verify signing_msg contains correct data
        assert!(signing_msg.starts_with(b"DHT_MESSAGE_V1"));
    }
}
