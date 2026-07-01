//! DHT Persistence (H-DHT-2)
//!
//! Persists routing table and provider store to sled database.
//! Data is saved periodically (every 5 minutes) and on graceful shutdown.

use std::net::SocketAddr;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;

use super::constants::{DHT_PERSISTENCE_VERSION, PROVIDER_TTL_SECS};
use super::error::{DhtError, DhtResult};
use super::node_id::NodeId;
use super::provider_store::{ProviderRecord, ProviderStore};
use super::routing_table::{NodeEntry, RoutingTable};

/// Tree name for routing table entries
const TREE_ROUTING_TABLE: &str = "dht_routing_table";

/// Tree name for provider records
const TREE_PROVIDERS: &str = "dht_providers";

/// Tree name for local content (content we're providing)
const TREE_LOCAL_CONTENT: &str = "dht_local_content";

/// Tree name for metadata (version, local_id, etc.)
const TREE_METADATA: &str = "dht_metadata";

/// Key for local node ID
const KEY_LOCAL_ID: &[u8] = b"local_id";

/// Key for persistence version
const KEY_VERSION: &[u8] = b"version";

/// Key for last save timestamp
const KEY_LAST_SAVE: &[u8] = b"last_save";

/// Serializable node entry for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedNodeEntry {
    /// Node ID bytes
    id: [u8; 32],
    /// Socket address as string (for portability)
    addr: String,
    /// Timestamp when first seen (seconds since UNIX epoch)
    first_seen_secs: u64,
    /// Failure count
    failure_count: u32,
}

impl PersistedNodeEntry {
    fn from_entry(entry: &NodeEntry) -> Self {
        // Convert first_seen Instant to absolute timestamp
        let first_seen_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_sub(entry.first_seen.elapsed().as_secs());

        Self {
            id: *entry.id.as_bytes(),
            addr: entry.addr.to_string(),
            first_seen_secs,
            failure_count: entry.failure_count,
        }
    }

    fn to_entry(&self) -> Option<NodeEntry> {
        let addr: SocketAddr = self.addr.parse().ok()?;
        let id = NodeId::from_bytes(self.id);

        // Reconstruct first_seen as Instant relative to now
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let age_secs = now_secs.saturating_sub(self.first_seen_secs);

        let mut entry = NodeEntry::new(id, addr);
        // Approximate first_seen by adjusting backwards from now
        // This is inherently imprecise but preserves relative ordering
        entry.first_seen = std::time::Instant::now() - Duration::from_secs(age_secs);
        entry.failure_count = self.failure_count;
        Some(entry)
    }
}

/// Serializable provider record for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedProviderRecord {
    /// Node ID bytes
    node_id: [u8; 32],
    /// Socket address as string
    addr: String,
    /// Timestamp when record was created (seconds since UNIX epoch)
    timestamp_secs: u64,
    /// Ed25519 public key
    public_key: [u8; 32],
    /// Ed25519 signature
    #[serde(with = "BigArray")]
    signature: [u8; 64],
}

impl PersistedProviderRecord {
    fn from_record(record: &ProviderRecord) -> Self {
        let timestamp_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_sub(record.timestamp.elapsed().as_secs());

        Self {
            node_id: *record.node_id.as_bytes(),
            addr: record.addr.to_string(),
            timestamp_secs,
            public_key: record.public_key,
            signature: record.signature,
        }
    }

    fn to_record(&self) -> Option<ProviderRecord> {
        let addr: SocketAddr = self.addr.parse().ok()?;
        let node_id = NodeId::from_bytes(self.node_id);

        let mut record = ProviderRecord::new(node_id, addr, self.public_key, self.signature);

        // Reconstruct timestamp as Instant relative to now
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let age_secs = now_secs.saturating_sub(self.timestamp_secs);
        record.timestamp = std::time::Instant::now() - Duration::from_secs(age_secs);

        Some(record)
    }
}

/// Persisted local content entry (content hash + last announcement time)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedLocalContent {
    /// Timestamp when last announced (seconds since UNIX epoch)
    announced_secs: u64,
}

/// DHT persistence store using sled
pub struct DhtPersistence {
    /// Sled database handle
    db: sled::Db,
    /// Routing table tree
    routing_tree: sled::Tree,
    /// Providers tree
    providers_tree: sled::Tree,
    /// Local content tree
    local_content_tree: sled::Tree,
    /// Metadata tree
    metadata_tree: sled::Tree,
}

impl DhtPersistence {
    /// Open or create the DHT persistence store
    pub fn open(path: impl AsRef<Path>) -> DhtResult<Self> {
        let db = sled::open(path).map_err(|e| DhtError::StorageError {
            reason: format!("Failed to open sled database: {}", e),
        })?;

        let routing_tree = db.open_tree(TREE_ROUTING_TABLE).map_err(|e| {
            DhtError::StorageError {
                reason: format!("Failed to open routing table tree: {}", e),
            }
        })?;

        let providers_tree =
            db.open_tree(TREE_PROVIDERS)
                .map_err(|e| DhtError::StorageError {
                    reason: format!("Failed to open providers tree: {}", e),
                })?;

        let local_content_tree =
            db.open_tree(TREE_LOCAL_CONTENT)
                .map_err(|e| DhtError::StorageError {
                    reason: format!("Failed to open local content tree: {}", e),
                })?;

        let metadata_tree =
            db.open_tree(TREE_METADATA)
                .map_err(|e| DhtError::StorageError {
                    reason: format!("Failed to open metadata tree: {}", e),
                })?;

        Ok(Self {
            db,
            routing_tree,
            providers_tree,
            local_content_tree,
            metadata_tree,
        })
    }

    /// Get the persisted version number
    pub fn get_version(&self) -> DhtResult<Option<u32>> {
        match self.metadata_tree.get(KEY_VERSION).map_err(|e| {
            DhtError::StorageError {
                reason: format!("Failed to read version: {}", e),
            }
        })? {
            Some(bytes) => {
                if bytes.len() != 4 {
                    return Ok(None);
                }
                let version = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
                Ok(Some(version))
            }
            None => Ok(None),
        }
    }

    /// Set the persistence version
    fn set_version(&self, version: u32) -> DhtResult<()> {
        self.metadata_tree
            .insert(KEY_VERSION, &version.to_be_bytes())
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to write version: {}", e),
            })?;
        Ok(())
    }

    /// Get the persisted local node ID
    pub fn get_local_id(&self) -> DhtResult<Option<NodeId>> {
        match self.metadata_tree.get(KEY_LOCAL_ID).map_err(|e| {
            DhtError::StorageError {
                reason: format!("Failed to read local ID: {}", e),
            }
        })? {
            Some(bytes) => {
                if bytes.len() != 32 {
                    return Err(DhtError::InvalidNodeId {
                        reason: "Persisted local ID has wrong length".to_string(),
                    });
                }
                let mut id_bytes = [0u8; 32];
                id_bytes.copy_from_slice(&bytes);
                Ok(Some(NodeId::from_bytes(id_bytes)))
            }
            None => Ok(None),
        }
    }

    /// Set the local node ID
    fn set_local_id(&self, id: &NodeId) -> DhtResult<()> {
        self.metadata_tree
            .insert(KEY_LOCAL_ID, id.as_bytes().as_slice())
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to write local ID: {}", e),
            })?;
        Ok(())
    }

    /// Save the routing table to persistence
    pub fn save_routing_table(&self, table: &RoutingTable) -> DhtResult<()> {
        // Clear existing entries
        self.routing_tree.clear().map_err(|e| DhtError::StorageError {
            reason: format!("Failed to clear routing table: {}", e),
        })?;

        // Save local ID
        self.set_local_id(table.local_id())?;

        // Save all nodes
        for entry in table.all_nodes() {
            let persisted = PersistedNodeEntry::from_entry(entry);
            let key = entry.id.as_bytes();
            let value = bincode::serialize(&persisted).map_err(|e| DhtError::SerializationError {
                reason: format!("Failed to serialize node entry: {}", e),
            })?;
            self.routing_tree
                .insert(key.as_slice(), value)
                .map_err(|e| DhtError::StorageError {
                    reason: format!("Failed to save node entry: {}", e),
                })?;
        }

        Ok(())
    }

    /// Load routing table entries from persistence
    ///
    /// Returns a list of node entries that can be added to the routing table.
    /// The caller should create a new RoutingTable and add these entries.
    pub fn load_routing_table_entries(&self) -> DhtResult<Vec<NodeEntry>> {
        let mut entries = Vec::new();

        for item in self.routing_tree.iter() {
            let (_, value) = item.map_err(|e| DhtError::StorageError {
                reason: format!("Failed to iterate routing table: {}", e),
            })?;

            let persisted: PersistedNodeEntry =
                bincode::deserialize(&value).map_err(|e| DhtError::SerializationError {
                    reason: format!("Failed to deserialize node entry: {}", e),
                })?;

            if let Some(entry) = persisted.to_entry() {
                entries.push(entry);
            }
        }

        Ok(entries)
    }

    /// Save the provider store to persistence
    pub fn save_provider_store(&self, store: &ProviderStore) -> DhtResult<()> {
        // Clear existing entries
        self.providers_tree
            .clear()
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to clear providers: {}", e),
            })?;

        self.local_content_tree
            .clear()
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to clear local content: {}", e),
            })?;

        // Save provider records
        // Key format: content_hash[32] || node_id[32]
        for content_hash in store.all_content_hashes() {
            for record in store.get_providers(&content_hash, usize::MAX) {
                // Skip expired records
                if record.is_expired() {
                    continue;
                }

                let mut key = Vec::with_capacity(64);
                key.extend_from_slice(&content_hash);
                key.extend_from_slice(record.node_id.as_bytes());

                let persisted = PersistedProviderRecord::from_record(record);
                let value =
                    bincode::serialize(&persisted).map_err(|e| DhtError::SerializationError {
                        reason: format!("Failed to serialize provider record: {}", e),
                    })?;

                self.providers_tree
                    .insert(key, value)
                    .map_err(|e| DhtError::StorageError {
                        reason: format!("Failed to save provider record: {}", e),
                    })?;
            }

            // Check if this is local content
            if store.is_local_content(&content_hash) {
                // Store with current timestamp
                let persisted = PersistedLocalContent {
                    announced_secs: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                };
                let value =
                    bincode::serialize(&persisted).map_err(|e| DhtError::SerializationError {
                        reason: format!("Failed to serialize local content: {}", e),
                    })?;
                self.local_content_tree
                    .insert(&content_hash, value)
                    .map_err(|e| DhtError::StorageError {
                        reason: format!("Failed to save local content: {}", e),
                    })?;
            }
        }

        Ok(())
    }

    /// Load provider records from persistence
    ///
    /// Returns tuples of (content_hash, provider_record).
    pub fn load_provider_records(&self) -> DhtResult<Vec<([u8; 32], ProviderRecord)>> {
        let mut records = Vec::new();
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        for item in self.providers_tree.iter() {
            let (key, value) = item.map_err(|e| DhtError::StorageError {
                reason: format!("Failed to iterate providers: {}", e),
            })?;

            // Key is content_hash[32] || node_id[32]
            if key.len() != 64 {
                continue;
            }

            let mut content_hash = [0u8; 32];
            content_hash.copy_from_slice(&key[..32]);

            let persisted: PersistedProviderRecord =
                bincode::deserialize(&value).map_err(|e| DhtError::SerializationError {
                    reason: format!("Failed to deserialize provider record: {}", e),
                })?;

            // Skip records that would be expired
            let age_secs = now_secs.saturating_sub(persisted.timestamp_secs);
            if age_secs > PROVIDER_TTL_SECS {
                continue;
            }

            if let Some(record) = persisted.to_record() {
                records.push((content_hash, record));
            }
        }

        Ok(records)
    }

    /// Load local content hashes from persistence
    pub fn load_local_content(&self) -> DhtResult<Vec<[u8; 32]>> {
        let mut hashes = Vec::new();

        for item in self.local_content_tree.iter() {
            let (key, _) = item.map_err(|e| DhtError::StorageError {
                reason: format!("Failed to iterate local content: {}", e),
            })?;

            if key.len() != 32 {
                continue;
            }

            let mut hash = [0u8; 32];
            hash.copy_from_slice(&key);
            hashes.push(hash);
        }

        Ok(hashes)
    }

    /// Save all DHT state
    pub fn save_all(&self, table: &RoutingTable, store: &ProviderStore) -> DhtResult<()> {
        self.set_version(DHT_PERSISTENCE_VERSION)?;
        self.save_routing_table(table)?;
        self.save_provider_store(store)?;

        // Update last save timestamp
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.metadata_tree
            .insert(KEY_LAST_SAVE, &now_secs.to_be_bytes())
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to save timestamp: {}", e),
            })?;

        self.flush()?;
        Ok(())
    }

    /// Check if persistence data exists and is valid
    pub fn has_valid_data(&self, expected_local_id: &NodeId) -> DhtResult<bool> {
        // Check version
        let version = self.get_version()?;
        if version != Some(DHT_PERSISTENCE_VERSION) {
            return Ok(false);
        }

        // Check local ID matches
        let persisted_id = self.get_local_id()?;
        if persisted_id.as_ref() != Some(expected_local_id) {
            return Ok(false);
        }

        Ok(true)
    }

    /// Clear all persisted data
    pub fn clear(&self) -> DhtResult<()> {
        self.routing_tree.clear().map_err(|e| DhtError::StorageError {
            reason: format!("Failed to clear routing table: {}", e),
        })?;
        self.providers_tree
            .clear()
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to clear providers: {}", e),
            })?;
        self.local_content_tree
            .clear()
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to clear local content: {}", e),
            })?;
        self.metadata_tree
            .clear()
            .map_err(|e| DhtError::StorageError {
                reason: format!("Failed to clear metadata: {}", e),
            })?;
        self.flush()?;
        Ok(())
    }

    /// Flush all pending writes to disk
    pub fn flush(&self) -> DhtResult<()> {
        self.db.flush().map_err(|e| DhtError::StorageError {
            reason: format!("Failed to flush database: {}", e),
        })?;
        Ok(())
    }

    /// Get database size on disk
    pub fn size_on_disk(&self) -> u64 {
        self.db.size_on_disk().unwrap_or(0)
    }

    /// Get statistics about persisted data
    pub fn stats(&self) -> DhtResult<DhtPersistenceStats> {
        let routing_count = self.routing_tree.len();
        let provider_count = self.providers_tree.len();
        let local_content_count = self.local_content_tree.len();

        Ok(DhtPersistenceStats {
            routing_entries: routing_count,
            provider_records: provider_count,
            local_content_count,
            size_on_disk: self.size_on_disk(),
        })
    }
}

/// Statistics about DHT persistence
#[derive(Debug, Clone)]
pub struct DhtPersistenceStats {
    /// Number of routing table entries
    pub routing_entries: usize,
    /// Number of provider records
    pub provider_records: usize,
    /// Number of local content items
    pub local_content_count: usize,
    /// Size on disk in bytes
    pub size_on_disk: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};
    use tempfile::TempDir;

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

    fn create_temp_persistence() -> (DhtPersistence, TempDir) {
        let tmp = TempDir::new().unwrap();
        let persistence = DhtPersistence::open(tmp.path()).unwrap();
        (persistence, tmp)
    }

    #[test]
    fn test_open_persistence() {
        let (persistence, _tmp) = create_temp_persistence();
        assert!(persistence.get_version().unwrap().is_none());
        assert!(persistence.get_local_id().unwrap().is_none());
    }

    #[test]
    fn test_version_roundtrip() {
        let (persistence, _tmp) = create_temp_persistence();

        persistence.set_version(DHT_PERSISTENCE_VERSION).unwrap();
        let version = persistence.get_version().unwrap();
        assert_eq!(version, Some(DHT_PERSISTENCE_VERSION));
    }

    #[test]
    fn test_local_id_roundtrip() {
        let (persistence, _tmp) = create_temp_persistence();

        let id = make_id(0xab);
        persistence.set_local_id(&id).unwrap();
        let loaded = persistence.get_local_id().unwrap();
        assert_eq!(loaded, Some(id));
    }

    #[test]
    fn test_routing_table_persistence() {
        let tmp = TempDir::new().unwrap();
        let local_id = make_id(0);

        // Create and save routing table
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();
            let mut table = RoutingTable::new(local_id);

            // Add some nodes
            for i in 1u8..5 {
                let _ = table.update(make_id(i), make_addr(8080 + i as u16));
            }

            persistence.save_routing_table(&table).unwrap();
        }

        // Reopen and load
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();
            let entries = persistence.load_routing_table_entries().unwrap();

            assert_eq!(entries.len(), 4);

            let loaded_id = persistence.get_local_id().unwrap();
            assert_eq!(loaded_id, Some(local_id));
        }
    }

    #[test]
    fn test_provider_store_persistence() {
        let tmp = TempDir::new().unwrap();

        // Create and save provider store
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();
            let mut store = ProviderStore::new();

            let hash = make_hash(0xab);
            let record = ProviderRecord::new(
                make_id(1),
                make_addr(8080),
                make_pubkey(1),
                make_signature(1),
            );
            store.add_provider(hash, record);
            store.add_local_content(hash);

            persistence.save_provider_store(&store).unwrap();
        }

        // Reopen and load
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();
            let records = persistence.load_provider_records().unwrap();
            let local_content = persistence.load_local_content().unwrap();

            assert_eq!(records.len(), 1);
            assert_eq!(records[0].0, make_hash(0xab));
            assert_eq!(records[0].1.node_id, make_id(1));

            assert_eq!(local_content.len(), 1);
            assert_eq!(local_content[0], make_hash(0xab));
        }
    }

    #[test]
    fn test_has_valid_data() {
        let (persistence, _tmp) = create_temp_persistence();
        let local_id = make_id(0x42);

        // No data yet
        assert!(!persistence.has_valid_data(&local_id).unwrap());

        // Set version and ID
        persistence.set_version(DHT_PERSISTENCE_VERSION).unwrap();
        persistence.set_local_id(&local_id).unwrap();

        // Now valid
        assert!(persistence.has_valid_data(&local_id).unwrap());

        // Wrong ID is invalid
        assert!(!persistence.has_valid_data(&make_id(0x99)).unwrap());
    }

    #[test]
    fn test_clear() {
        let (persistence, _tmp) = create_temp_persistence();

        // Add some data
        persistence.set_version(DHT_PERSISTENCE_VERSION).unwrap();
        persistence.set_local_id(&make_id(0x42)).unwrap();

        // Clear
        persistence.clear().unwrap();

        // Should be empty
        assert!(persistence.get_version().unwrap().is_none());
        assert!(persistence.get_local_id().unwrap().is_none());
    }

    #[test]
    fn test_stats() {
        let (persistence, _tmp) = create_temp_persistence();

        let stats = persistence.stats().unwrap();
        assert_eq!(stats.routing_entries, 0);
        assert_eq!(stats.provider_records, 0);
        assert_eq!(stats.local_content_count, 0);
    }

    #[test]
    fn test_save_all() {
        let tmp = TempDir::new().unwrap();
        let local_id = make_id(0);

        // Create, populate, and save
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();
            let mut table = RoutingTable::new(local_id);
            let mut store = ProviderStore::new();

            // Add routing entries
            for i in 1u8..3 {
                let _ = table.update(make_id(i), make_addr(8080 + i as u16));
            }

            // Add provider
            let hash = make_hash(0xcd);
            store.add_provider(
                hash,
                ProviderRecord::new(make_id(5), make_addr(9000), make_pubkey(5), make_signature(5)),
            );
            store.add_local_content(hash);

            persistence.save_all(&table, &store).unwrap();
        }

        // Reopen and verify
        {
            let persistence = DhtPersistence::open(tmp.path()).unwrap();

            assert!(persistence.has_valid_data(&local_id).unwrap());

            let entries = persistence.load_routing_table_entries().unwrap();
            assert_eq!(entries.len(), 2);

            let records = persistence.load_provider_records().unwrap();
            assert_eq!(records.len(), 1);

            let local = persistence.load_local_content().unwrap();
            assert_eq!(local.len(), 1);
        }
    }

    #[test]
    fn test_node_entry_serialization_preserves_age() {
        let entry = NodeEntry::new(make_id(1), make_addr(8080));
        // Wait a tiny bit to ensure non-zero age
        std::thread::sleep(std::time::Duration::from_millis(10));

        let persisted = PersistedNodeEntry::from_entry(&entry);
        let restored = persisted.to_entry().unwrap();

        // Age should be approximately preserved (within a second due to timing)
        let original_age = entry.age().as_secs();
        let restored_age = restored.age().as_secs();
        assert!(original_age.abs_diff(restored_age) <= 1);
    }
}
