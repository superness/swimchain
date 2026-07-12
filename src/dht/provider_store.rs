//! Provider Record Store (SPEC_06 §3.8)
//!
//! Stores mappings from content hashes to provider nodes.
//! This is how the DHT answers "who has content X?"

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use super::constants::{MAX_PROVIDERS, PROVIDER_TTL_SECS};
use super::node_id::NodeId;

/// A single provider record for a piece of content
#[derive(Debug, Clone)]
pub struct ProviderRecord {
    /// The provider node's ID
    pub node_id: NodeId,
    /// Network address of the provider
    pub addr: SocketAddr,
    /// When this record was created/refreshed
    pub timestamp: Instant,
    /// Ed25519 public key of the provider (proves ownership of node_id)
    pub public_key: [u8; 32],
    /// Ed25519 signature over the provider claim
    pub signature: [u8; 64],
}

/// Magic prefix for provider record signing message
const PROVIDER_RECORD_PREFIX: &[u8] = b"PROVIDER_RECORD";

impl ProviderRecord {
    /// Create a new provider record with signature
    pub fn new(
        node_id: NodeId,
        addr: SocketAddr,
        public_key: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            node_id,
            addr,
            timestamp: Instant::now(),
            public_key,
            signature,
        }
    }

    /// Create the canonical signing message for a provider record
    ///
    /// Format: "PROVIDER_RECORD" || content_hash[32] || node_id[32] || addr_bytes
    ///
    /// This binds the signature to:
    /// - A unique domain prefix
    /// - The content being claimed
    /// - The node's identity
    /// - The network address
    pub fn signing_message(
        content_hash: &[u8; 32],
        node_id: &NodeId,
        addr: &SocketAddr,
    ) -> Vec<u8> {
        let mut msg = Vec::with_capacity(128);
        msg.extend_from_slice(PROVIDER_RECORD_PREFIX);
        msg.extend_from_slice(content_hash);
        msg.extend_from_slice(node_id.as_bytes());
        // Serialize address in a canonical format
        match addr.ip() {
            std::net::IpAddr::V4(ip) => {
                msg.push(4);
                msg.extend_from_slice(&ip.octets());
            }
            std::net::IpAddr::V6(ip) => {
                msg.push(6);
                msg.extend_from_slice(&ip.octets());
            }
        }
        msg.extend_from_slice(&addr.port().to_be_bytes());
        msg
    }

    /// Check if this record has expired
    pub fn is_expired(&self) -> bool {
        self.timestamp.elapsed() > Duration::from_secs(PROVIDER_TTL_SECS)
    }

    /// Refresh the timestamp
    pub fn refresh(&mut self) {
        self.timestamp = Instant::now();
    }

    /// Get the age of this record in seconds
    pub fn age_secs(&self) -> u64 {
        self.timestamp.elapsed().as_secs()
    }
}

/// Store for provider records
#[derive(Debug)]
pub struct ProviderStore {
    /// Content hash → list of providers
    providers: HashMap<[u8; 32], Vec<ProviderRecord>>,
    /// Our own content (that we're providing)
    /// Used for periodic re-announcement
    local_content: HashMap<[u8; 32], Instant>,
}

impl ProviderStore {
    /// Create a new empty provider store
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            local_content: HashMap::new(),
        }
    }

    /// Add a provider for a content hash
    ///
    /// If the provider already exists, refreshes the timestamp.
    /// Limits to MAX_PROVIDERS per content hash.
    pub fn add_provider(&mut self, content_hash: [u8; 32], record: ProviderRecord) {
        let providers = self.providers.entry(content_hash).or_insert_with(Vec::new);

        // Check if provider already exists
        if let Some(existing) = providers.iter_mut().find(|p| p.node_id == record.node_id) {
            existing.refresh();
            return;
        }

        // Remove expired providers first
        providers.retain(|p| !p.is_expired());

        // Add if not at capacity
        if providers.len() < MAX_PROVIDERS {
            providers.push(record);
        } else {
            // Replace oldest provider
            if let Some(oldest_idx) = providers
                .iter()
                .enumerate()
                .max_by_key(|(_, p)| p.age_secs())
                .map(|(i, _)| i)
            {
                providers[oldest_idx] = record;
            }
        }
    }

    /// Get providers for a content hash
    ///
    /// Returns up to `limit` providers, filtering expired ones.
    pub fn get_providers(&self, content_hash: &[u8; 32], limit: usize) -> Vec<&ProviderRecord> {
        self.providers
            .get(content_hash)
            .map(|providers| {
                providers
                    .iter()
                    .filter(|p| !p.is_expired())
                    .take(limit)
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Check if we have any providers for a content hash
    pub fn has_providers(&self, content_hash: &[u8; 32]) -> bool {
        self.providers
            .get(content_hash)
            .map(|providers| providers.iter().any(|p| !p.is_expired()))
            .unwrap_or(false)
    }

    /// Remove a specific provider
    pub fn remove_provider(&mut self, content_hash: &[u8; 32], node_id: &NodeId) {
        if let Some(providers) = self.providers.get_mut(content_hash) {
            providers.retain(|p| &p.node_id != node_id);
            if providers.is_empty() {
                self.providers.remove(content_hash);
            }
        }
    }

    /// Record that we're providing content (for re-announcement)
    pub fn add_local_content(&mut self, content_hash: [u8; 32]) {
        self.local_content.insert(content_hash, Instant::now());
    }

    /// Remove local content (we no longer have it)
    pub fn remove_local_content(&mut self, content_hash: &[u8; 32]) {
        self.local_content.remove(content_hash);
    }

    /// Check if we're providing content
    pub fn is_local_content(&self, content_hash: &[u8; 32]) -> bool {
        self.local_content.contains_key(content_hash)
    }

    /// Get all local content hashes that need re-announcement
    ///
    /// Returns content hashes whose announcement is older than `refresh_after` seconds.
    pub fn content_needing_refresh(&self, refresh_after: Duration) -> Vec<[u8; 32]> {
        self.local_content
            .iter()
            .filter(|(_, announced_at)| announced_at.elapsed() > refresh_after)
            .map(|(hash, _)| *hash)
            .collect()
    }

    /// Refresh the announcement timestamp for local content
    pub fn refresh_local_content(&mut self, content_hash: &[u8; 32]) {
        if let Some(announced_at) = self.local_content.get_mut(content_hash) {
            *announced_at = Instant::now();
        }
    }

    /// Clean up expired provider records
    ///
    /// Returns number of records removed.
    pub fn cleanup_expired(&mut self) -> usize {
        let mut removed = 0;

        self.providers.retain(|_, providers| {
            let before = providers.len();
            providers.retain(|p| !p.is_expired());
            removed += before - providers.len();
            !providers.is_empty()
        });

        removed
    }

    /// Get total number of provider records
    pub fn total_providers(&self) -> usize {
        self.providers.values().map(|p| p.len()).sum()
    }

    /// Get number of unique content hashes with providers
    pub fn total_content(&self) -> usize {
        self.providers.len()
    }

    /// Get number of local content items
    pub fn local_content_count(&self) -> usize {
        self.local_content.len()
    }

    /// Get all content hashes we know about
    pub fn all_content_hashes(&self) -> Vec<[u8; 32]> {
        self.providers.keys().copied().collect()
    }
}

impl Default for ProviderStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};
    use std::thread::sleep;

    fn make_addr(port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port)
    }

    fn make_id(byte: u8) -> NodeId {
        NodeId::from_bytes([byte; 32])
    }

    fn make_hash(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn make_pubkey(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn make_signature(byte: u8) -> [u8; 64] {
        [byte; 64]
    }

    fn make_record(id_byte: u8, port: u16) -> ProviderRecord {
        ProviderRecord::new(
            make_id(id_byte),
            make_addr(port),
            make_pubkey(id_byte),
            make_signature(id_byte),
        )
    }

    #[test]
    fn test_add_and_get_provider() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);
        let record = make_record(1, 8080);

        store.add_provider(hash, record);

        let providers = store.get_providers(&hash, 10);
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].node_id, make_id(1));
    }

    #[test]
    fn test_multiple_providers() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);

        for i in 0..5 {
            let record = make_record(i, 8080 + i as u16);
            store.add_provider(hash, record);
        }

        let providers = store.get_providers(&hash, 10);
        assert_eq!(providers.len(), 5);
    }

    #[test]
    fn test_provider_limit() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);

        // Add more than MAX_PROVIDERS
        for i in 0..(MAX_PROVIDERS + 5) as u8 {
            let record = make_record(i, 8080 + i as u16);
            store.add_provider(hash, record);
        }

        let providers = store.get_providers(&hash, MAX_PROVIDERS + 10);
        assert!(providers.len() <= MAX_PROVIDERS);
    }

    #[test]
    fn test_provider_refresh() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);
        let record = make_record(1, 8080);

        store.add_provider(hash, record.clone());
        store.add_provider(hash, record);

        // Should still be just one provider
        let providers = store.get_providers(&hash, 10);
        assert_eq!(providers.len(), 1);
    }

    #[test]
    fn test_remove_provider() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);
        let id = make_id(1);
        let record = make_record(1, 8080);

        store.add_provider(hash, record);
        assert!(store.has_providers(&hash));

        store.remove_provider(&hash, &id);
        assert!(!store.has_providers(&hash));
    }

    #[test]
    fn test_signing_message() {
        let content_hash = make_hash(0xab);
        let node_id = make_id(0xcd);
        let addr = make_addr(8080);

        let msg = ProviderRecord::signing_message(&content_hash, &node_id, &addr);

        // Verify structure: prefix + content_hash + node_id + addr
        assert!(msg.starts_with(PROVIDER_RECORD_PREFIX));
        assert!(msg.len() >= PROVIDER_RECORD_PREFIX.len() + 32 + 32 + 1 + 4 + 2);
    }

    #[test]
    fn test_provider_record_has_signature_fields() {
        let record = make_record(1, 8080);
        assert_eq!(record.public_key, make_pubkey(1));
        assert_eq!(record.signature, make_signature(1));
    }

    #[test]
    fn test_local_content() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);

        assert!(!store.is_local_content(&hash));
        store.add_local_content(hash);
        assert!(store.is_local_content(&hash));
        store.remove_local_content(&hash);
        assert!(!store.is_local_content(&hash));
    }

    #[test]
    fn test_content_needing_refresh() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);

        store.add_local_content(hash);

        // Should need refresh after 0 seconds
        let needing = store.content_needing_refresh(Duration::from_secs(0));
        assert!(needing.contains(&hash));

        // Should not need refresh after long time
        let needing = store.content_needing_refresh(Duration::from_secs(3600));
        assert!(!needing.contains(&hash));
    }

    #[test]
    fn test_cleanup() {
        let mut store = ProviderStore::new();
        let hash = make_hash(1);

        // Create a record
        let record = make_record(1, 8080);
        // Can't actually make it expired without mocking time
        // Just verify cleanup works with non-expired records
        store.add_provider(hash, record);

        let removed = store.cleanup_expired();
        // Nothing should be removed since nothing is actually expired
        assert_eq!(removed, 0);
    }

    #[test]
    fn test_stats() {
        let mut store = ProviderStore::new();

        assert_eq!(store.total_providers(), 0);
        assert_eq!(store.total_content(), 0);

        let hash1 = make_hash(1);
        let hash2 = make_hash(2);

        store.add_provider(hash1, make_record(1, 8080));
        store.add_provider(hash1, make_record(2, 8081));
        store.add_provider(hash2, make_record(3, 8082));

        assert_eq!(store.total_providers(), 3);
        assert_eq!(store.total_content(), 2);
    }
}
