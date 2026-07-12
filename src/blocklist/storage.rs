//! Blocklist storage implementation
//!
//! Provides persistent storage for blocklist entries using sled.

use sled::Db;
use std::sync::Arc;

use super::bundle::{BlocklistBundle, BundleEntry};
use super::error::{BlocklistError, BlocklistResult};
use super::import::ImportRecord;
use super::merkle::{IncrementalMerkleTree, SyncState};
use super::types::{BlocklistEntry, BlocklistReason};

/// Sled tree name for blocklist entries
const BLOCKLIST_TREE: &str = "blocklist_entries";

/// Sled tree name for blocklist metadata
const BLOCKLIST_META_TREE: &str = "blocklist_meta";

/// Sled tree name for auxiliary SHA-1 digest index (20-byte key -> reason byte).
///
/// Populated from external-list imports / bundles so content whose SHA-1
/// (recomputed at ingest) matches a known illegal file is refused, even when
/// the industry list did not ship a SHA-256.
const BLOCKLIST_SHA1_TREE: &str = "blocklist_sha1";

/// Sled tree name for auxiliary MD5 digest index (16-byte key -> reason byte).
const BLOCKLIST_MD5_TREE: &str = "blocklist_md5";

/// Key for storing the Merkle root
const MERKLE_ROOT_KEY: &[u8] = b"merkle_root";

/// Key for storing the entry count
const ENTRY_COUNT_KEY: &[u8] = b"entry_count";

/// Key for storing the last update timestamp
const LAST_UPDATE_KEY: &[u8] = b"last_update";

/// Key for storing the highest applied signed-bundle version.
const BUNDLE_VERSION_KEY: &[u8] = b"bundle_version";

/// Summary of an import / bundle-apply operation.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportStats {
    /// New SHA-256 primary entries added.
    pub sha256_added: u64,
    /// SHA-256 records skipped because already present.
    pub sha256_skipped: u64,
    /// SHA-1 auxiliary digests indexed.
    pub sha1_indexed: u64,
    /// MD5 auxiliary digests indexed.
    pub md5_indexed: u64,
}

/// Persistent blocklist storage.
pub struct BlocklistStore {
    /// Sled database
    db: Arc<Db>,

    /// Blocklist entries tree
    entries: sled::Tree,

    /// Metadata tree
    meta: sled::Tree,

    /// Auxiliary SHA-1 digest index (20-byte key -> reason byte)
    sha1_index: sled::Tree,

    /// Auxiliary MD5 digest index (16-byte key -> reason byte)
    md5_index: sled::Tree,

    /// Cached sync state
    sync_state: SyncState,

    /// Incremental Merkle tree for efficient root updates
    merkle_tree: IncrementalMerkleTree,
}

impl BlocklistStore {
    /// Open or create a blocklist store.
    pub fn open(db: Arc<Db>) -> BlocklistResult<Self> {
        let entries = db
            .open_tree(BLOCKLIST_TREE)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        let meta = db
            .open_tree(BLOCKLIST_META_TREE)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        let sha1_index = db
            .open_tree(BLOCKLIST_SHA1_TREE)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        let md5_index = db
            .open_tree(BLOCKLIST_MD5_TREE)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        let mut store = Self {
            db,
            entries,
            meta,
            sha1_index,
            md5_index,
            sync_state: SyncState::new(),
            merkle_tree: IncrementalMerkleTree::new(),
        };

        // Load sync state and merkle tree from storage
        store.load_sync_state()?;

        Ok(store)
    }

    /// Check if a content hash is in the blocklist.
    pub fn is_blocked(&self, content_hash: &[u8; 32]) -> bool {
        self.entries.contains_key(content_hash).unwrap_or(false)
    }

    /// Get a blocklist entry by content hash.
    pub fn get(&self, content_hash: &[u8; 32]) -> BlocklistResult<Option<BlocklistEntry>> {
        match self.entries.get(content_hash) {
            Ok(Some(bytes)) => {
                let entry: BlocklistEntry = bincode::deserialize(&bytes)
                    .map_err(|e| BlocklistError::StorageError(e.to_string()))?;
                Ok(Some(entry))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(BlocklistError::StorageError(e.to_string())),
        }
    }

    /// Add an entry to the blocklist.
    pub fn add(&mut self, entry: BlocklistEntry) -> BlocklistResult<bool> {
        let content_hash = entry.content_hash;

        // Check if already exists
        if self.is_blocked(&content_hash) {
            return Err(BlocklistError::AlreadyBlocked { content_hash });
        }

        // Serialize and store
        let bytes =
            bincode::serialize(&entry).map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.entries
            .insert(&content_hash, bytes)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        // Incrementally update Merkle tree
        self.merkle_tree.insert(content_hash);

        // Update sync state using incremental tree
        self.update_sync_state_incremental(entry.added_at)?;

        Ok(true)
    }

    /// Add or update an entry (for confirmation increments).
    pub fn add_or_update(&mut self, mut entry: BlocklistEntry) -> BlocklistResult<()> {
        let content_hash = entry.content_hash;
        let is_new = !self.is_blocked(&content_hash);

        // If exists, increment confirmation count
        if let Some(existing) = self.get(&content_hash)? {
            entry.propagation_confirmations = existing.propagation_confirmations.saturating_add(1);
            // Keep earliest added_at
            entry.added_at = entry.added_at.min(existing.added_at);
        }

        let bytes =
            bincode::serialize(&entry).map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.entries
            .insert(&content_hash, bytes)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        // Only update Merkle tree if this is a new entry
        if is_new {
            self.merkle_tree.insert(content_hash);
        }

        self.update_sync_state_incremental(entry.added_at)?;

        Ok(())
    }

    /// Remove an entry from the blocklist.
    ///
    /// This is only allowed after proper counter-attestation verification.
    pub fn remove(&mut self, content_hash: &[u8; 32], timestamp: u64) -> BlocklistResult<bool> {
        if !self.is_blocked(content_hash) {
            return Err(BlocklistError::NotBlocked {
                content_hash: *content_hash,
            });
        }

        self.entries
            .remove(content_hash)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        // Incrementally update Merkle tree
        self.merkle_tree.remove(content_hash);

        self.update_sync_state_incremental(timestamp)?;

        Ok(true)
    }

    /// Get all blocklist entries.
    pub fn get_all(&self) -> BlocklistResult<Vec<BlocklistEntry>> {
        let mut entries = Vec::new();

        for result in self.entries.iter() {
            let (_, bytes) = result.map_err(|e| BlocklistError::StorageError(e.to_string()))?;

            let entry: BlocklistEntry = bincode::deserialize(&bytes)
                .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

            entries.push(entry);
        }

        Ok(entries)
    }

    /// Get all content hashes in the blocklist.
    pub fn get_all_hashes(&self) -> BlocklistResult<Vec<[u8; 32]>> {
        let mut hashes = Vec::new();

        for result in self.entries.iter() {
            let (key, _) = result.map_err(|e| BlocklistError::StorageError(e.to_string()))?;

            if key.len() == 32 {
                let mut hash = [0u8; 32];
                hash.copy_from_slice(&key);
                hashes.push(hash);
            }
        }

        Ok(hashes)
    }

    /// Get entries added since a timestamp.
    pub fn get_since(&self, timestamp: u64) -> BlocklistResult<Vec<BlocklistEntry>> {
        self.get_all().map(|entries| {
            entries
                .into_iter()
                .filter(|e| e.added_at >= timestamp)
                .collect()
        })
    }

    /// Get entries by reason.
    pub fn get_by_reason(&self, reason: BlocklistReason) -> BlocklistResult<Vec<BlocklistEntry>> {
        self.get_all()
            .map(|entries| entries.into_iter().filter(|e| e.reason == reason).collect())
    }

    /// Get the current entry count.
    pub fn count(&self) -> u32 {
        self.sync_state.local_count
    }

    /// Get the current Merkle root.
    pub fn merkle_root(&self) -> [u8; 32] {
        self.sync_state.local_root
    }

    /// Get the sync state.
    pub fn sync_state(&self) -> &SyncState {
        &self.sync_state
    }

    /// Get a mutable reference to the sync state.
    pub fn sync_state_mut(&mut self) -> &mut SyncState {
        &mut self.sync_state
    }

    /// Begin a batch operation.
    ///
    /// During a batch, Merkle root recomputation is deferred until
    /// `commit_batch()` is called. This is useful for bulk imports.
    pub fn begin_batch(&mut self) {
        // No-op for now - the incremental tree naturally defers computation
        // until root() is called. This method exists for API clarity.
    }

    /// Add an entry during a batch operation (no immediate sync update).
    pub fn add_batched(&mut self, entry: BlocklistEntry) -> BlocklistResult<bool> {
        let content_hash = entry.content_hash;

        if self.is_blocked(&content_hash) {
            return Err(BlocklistError::AlreadyBlocked { content_hash });
        }

        let bytes =
            bincode::serialize(&entry).map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.entries
            .insert(&content_hash, bytes)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        // Update tree structure but don't recompute root yet
        self.merkle_tree.insert(content_hash);

        Ok(true)
    }

    /// Commit a batch operation, updating sync state.
    pub fn commit_batch(&mut self, timestamp: u64) -> BlocklistResult<()> {
        self.update_sync_state_incremental(timestamp)
    }

    /// Update the sync state incrementally using the Merkle tree.
    ///
    /// This only recomputes affected branches, not the entire tree.
    fn update_sync_state_incremental(&mut self, timestamp: u64) -> BlocklistResult<()> {
        // Get root from incremental tree (only recomputes dirty paths)
        self.sync_state.local_root = self.merkle_tree.root();
        self.sync_state.local_count = self.merkle_tree.len() as u32;

        // Persist to storage
        self.meta
            .insert(MERKLE_ROOT_KEY, &self.sync_state.local_root)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.meta
            .insert(ENTRY_COUNT_KEY, &self.sync_state.local_count.to_le_bytes())
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.meta
            .insert(LAST_UPDATE_KEY, &timestamp.to_le_bytes())
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Update the sync state from current entries (full rebuild).
    ///
    /// Only used during initialization or recovery.
    #[allow(dead_code)]
    fn update_sync_state(&mut self, timestamp: u64) -> BlocklistResult<()> {
        let hashes = self.get_all_hashes()?;
        self.merkle_tree = IncrementalMerkleTree::from_hashes(&hashes);
        self.sync_state.local_root = self.merkle_tree.root();
        self.sync_state.local_count = self.merkle_tree.len() as u32;

        // Persist to storage
        self.meta
            .insert(MERKLE_ROOT_KEY, &self.sync_state.local_root)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.meta
            .insert(ENTRY_COUNT_KEY, &self.sync_state.local_count.to_le_bytes())
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        self.meta
            .insert(LAST_UPDATE_KEY, &timestamp.to_le_bytes())
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Load sync state from storage.
    fn load_sync_state(&mut self) -> BlocklistResult<()> {
        // Load Merkle root
        if let Some(bytes) = self
            .meta
            .get(MERKLE_ROOT_KEY)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?
        {
            if bytes.len() == 32 {
                self.sync_state.local_root.copy_from_slice(&bytes);
            }
        }

        // Load entry count
        if let Some(bytes) = self
            .meta
            .get(ENTRY_COUNT_KEY)
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?
        {
            if bytes.len() == 4 {
                self.sync_state.local_count =
                    u32::from_le_bytes(bytes.as_ref().try_into().unwrap_or([0; 4]));
            }
        }

        // Always load hashes into incremental Merkle tree for future updates
        let hashes = self.get_all_hashes()?;
        self.merkle_tree = IncrementalMerkleTree::from_hashes(&hashes);

        // Verify count matches actual entries
        let actual_count = self.entries.len() as u32;
        if actual_count != self.sync_state.local_count {
            // Recalculate from tree
            self.sync_state.local_root = self.merkle_tree.root();
            self.sync_state.local_count = self.merkle_tree.len() as u32;
        }

        Ok(())
    }

    /// Flush all pending writes to disk.
    pub fn flush(&self) -> BlocklistResult<()> {
        self.db
            .flush()
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;
        Ok(())
    }

    /// Get database statistics.
    pub fn stats(&self) -> BlocklistStats {
        BlocklistStats {
            entry_count: self.sync_state.local_count,
            merkle_root: self.sync_state.local_root,
            storage_bytes: self.entries.len() as u64 * 512, // Rough estimate
        }
    }

    // ===== Multi-hash matching (SPEC_12 external-list seeding) =====

    /// Check whether a SHA-1 file digest is in the auxiliary index.
    ///
    /// Used at content ingest: the node recomputes SHA-1 over received content
    /// and refuses it if the digest matches a seeded illegal-content entry.
    pub fn is_blocked_sha1(&self, digest: &[u8; 20]) -> bool {
        self.sha1_index.contains_key(digest).unwrap_or(false)
    }

    /// Check whether an MD5 file digest is in the auxiliary index.
    pub fn is_blocked_md5(&self, digest: &[u8; 16]) -> bool {
        self.md5_index.contains_key(digest).unwrap_or(false)
    }

    /// Index a SHA-1 auxiliary digest with its reason. Returns true if newly added.
    fn index_sha1(&self, digest: &[u8; 20], reason: BlocklistReason) -> BlocklistResult<bool> {
        let prev = self
            .sha1_index
            .insert(digest, &[reason.as_u8()][..])
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;
        Ok(prev.is_none())
    }

    /// Index an MD5 auxiliary digest with its reason. Returns true if newly added.
    fn index_md5(&self, digest: &[u8; 16], reason: BlocklistReason) -> BlocklistResult<bool> {
        let prev = self
            .md5_index
            .insert(digest, &[reason.as_u8()][..])
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;
        Ok(prev.is_none())
    }

    /// Bulk-load parsed import records into the store with `ExternalList`-class
    /// provenance (the reason carried by each record; defaults to
    /// `ExternalList` at parse time).
    ///
    /// SHA-256 records become primary [`BlocklistEntry`]s (participating in the
    /// Merkle root / gossip / bundles). Any SHA-1 / MD5 digests are additionally
    /// placed in the auxiliary indexes for recompute-and-match at ingest.
    /// Records that already exist are counted as skipped, not errors.
    pub fn import_records(
        &mut self,
        records: &[ImportRecord],
        source_node: [u8; 32],
        timestamp: u64,
    ) -> BlocklistResult<ImportStats> {
        let mut stats = ImportStats::default();

        for rec in records {
            if let Some(sha256) = rec.sha256 {
                if self.is_blocked(&sha256) {
                    stats.sha256_skipped += 1;
                } else {
                    let entry = BlocklistEntry::new(
                        sha256,
                        rec.reason,
                        Vec::new(), // seeded entry: no community attestations
                        source_node,
                        timestamp,
                    );
                    self.add_batched(entry)?;
                    stats.sha256_added += 1;
                }
            }
            if let Some(sha1) = rec.sha1 {
                if self.index_sha1(&sha1, rec.reason)? {
                    stats.sha1_indexed += 1;
                }
            }
            if let Some(md5) = rec.md5 {
                if self.index_md5(&md5, rec.reason)? {
                    stats.md5_indexed += 1;
                }
            }
        }

        // Commit the deferred Merkle/sync-state update once for the whole batch.
        self.commit_batch(timestamp)?;
        self.flush()?;
        Ok(stats)
    }

    // ===== Signed, versioned bundles (SPEC_12 A.3) =====

    /// Highest signed-bundle version this store has applied (0 if none).
    pub fn bundle_version(&self) -> u64 {
        self.meta
            .get(BUNDLE_VERSION_KEY)
            .ok()
            .flatten()
            .and_then(|b| b.as_ref().try_into().ok().map(u64::from_le_bytes))
            .unwrap_or(0)
    }

    /// Persist the highest applied bundle version.
    fn set_bundle_version(&self, version: u64) -> BlocklistResult<()> {
        self.meta
            .insert(BUNDLE_VERSION_KEY, &version.to_le_bytes())
            .map_err(|e| BlocklistError::StorageError(e.to_string()))?;
        Ok(())
    }

    /// Apply the entries of a *pre-validated* signed bundle.
    ///
    /// The caller MUST have already verified the maintainer signature against
    /// the trusted-key set (see [`BlocklistBundle::validate`]). Applies only if
    /// the bundle version is strictly newer than the stored version; otherwise
    /// returns `Ok(None)` (idempotent / stale bundle).
    pub fn apply_bundle(
        &mut self,
        bundle: &BlocklistBundle,
    ) -> BlocklistResult<Option<ImportStats>> {
        if bundle.bundle_version <= self.bundle_version() {
            return Ok(None);
        }

        let mut stats = ImportStats::default();
        for entry in &bundle.entries {
            if self.is_blocked(&entry.content_hash) {
                stats.sha256_skipped += 1;
            } else {
                let bl_entry = BlocklistEntry::new(
                    entry.content_hash,
                    entry.reason,
                    Vec::new(),
                    bundle.maintainer,
                    bundle.timestamp,
                );
                self.add_batched(bl_entry)?;
                stats.sha256_added += 1;
            }
            if let Some(sha1) = entry.sha1 {
                if self.index_sha1(&sha1, entry.reason)? {
                    stats.sha1_indexed += 1;
                }
            }
            if let Some(md5) = entry.md5 {
                if self.index_md5(&md5, entry.reason)? {
                    stats.md5_indexed += 1;
                }
            }
        }

        self.commit_batch(bundle.timestamp)?;
        self.set_bundle_version(bundle.bundle_version)?;
        self.flush()?;
        Ok(Some(stats))
    }

    /// Snapshot the current SHA-256 entries into an unsigned bundle at
    /// `bundle_version`. The caller signs it with a maintainer key before
    /// distribution. Auxiliary SHA-1/MD5 digests are not reverse-mapped per
    /// entry here, so exported bundle entries carry SHA-256 + reason only.
    pub fn build_bundle(
        &self,
        bundle_version: u64,
        timestamp: u64,
        maintainer: [u8; 32],
    ) -> BlocklistResult<BlocklistBundle> {
        let entries: Vec<BundleEntry> = self
            .get_all()?
            .into_iter()
            .map(|e| BundleEntry {
                content_hash: e.content_hash,
                reason: e.reason,
                sha1: None,
                md5: None,
            })
            .collect();
        Ok(BlocklistBundle::new(
            bundle_version,
            timestamp,
            maintainer,
            entries,
        ))
    }
}

/// Statistics about the blocklist.
#[derive(Debug, Clone)]
pub struct BlocklistStats {
    /// Number of entries
    pub entry_count: u32,
    /// Current Merkle root
    pub merkle_root: [u8; 32],
    /// Estimated storage size in bytes
    pub storage_bytes: u64,
}

/// In-memory blocklist for testing or lightweight use.
pub struct MemoryBlocklistStore {
    entries: std::collections::HashMap<[u8; 32], BlocklistEntry>,
    sync_state: SyncState,
    merkle_tree: IncrementalMerkleTree,
}

impl MemoryBlocklistStore {
    /// Create a new in-memory blocklist store.
    pub fn new() -> Self {
        Self {
            entries: std::collections::HashMap::new(),
            sync_state: SyncState::new(),
            merkle_tree: IncrementalMerkleTree::new(),
        }
    }

    /// Check if a content hash is blocked.
    pub fn is_blocked(&self, content_hash: &[u8; 32]) -> bool {
        self.entries.contains_key(content_hash)
    }

    /// Get a blocklist entry.
    pub fn get(&self, content_hash: &[u8; 32]) -> Option<&BlocklistEntry> {
        self.entries.get(content_hash)
    }

    /// Add an entry to the blocklist.
    pub fn add(&mut self, entry: BlocklistEntry) -> BlocklistResult<bool> {
        let content_hash = entry.content_hash;

        if self.entries.contains_key(&content_hash) {
            return Err(BlocklistError::AlreadyBlocked { content_hash });
        }

        self.entries.insert(content_hash, entry);
        self.merkle_tree.insert(content_hash);
        self.update_sync_state();
        Ok(true)
    }

    /// Add or update an entry.
    pub fn add_or_update(&mut self, mut entry: BlocklistEntry) {
        let content_hash = entry.content_hash;
        let is_new = !self.entries.contains_key(&content_hash);

        if let Some(existing) = self.entries.get(&content_hash) {
            entry.propagation_confirmations = existing.propagation_confirmations.saturating_add(1);
            entry.added_at = entry.added_at.min(existing.added_at);
        }

        self.entries.insert(content_hash, entry);
        if is_new {
            self.merkle_tree.insert(content_hash);
        }
        self.update_sync_state();
    }

    /// Remove an entry.
    pub fn remove(&mut self, content_hash: &[u8; 32]) -> BlocklistResult<bool> {
        if self.entries.remove(content_hash).is_some() {
            self.merkle_tree.remove(content_hash);
            self.update_sync_state();
            Ok(true)
        } else {
            Err(BlocklistError::NotBlocked {
                content_hash: *content_hash,
            })
        }
    }

    /// Get all entries.
    pub fn get_all(&self) -> Vec<&BlocklistEntry> {
        self.entries.values().collect()
    }

    /// Get all hashes.
    pub fn get_all_hashes(&self) -> Vec<[u8; 32]> {
        self.entries.keys().copied().collect()
    }

    /// Get entry count.
    pub fn count(&self) -> u32 {
        self.entries.len() as u32
    }

    /// Get Merkle root.
    pub fn merkle_root(&self) -> [u8; 32] {
        self.sync_state.local_root
    }

    /// Get sync state.
    pub fn sync_state(&self) -> &SyncState {
        &self.sync_state
    }

    fn update_sync_state(&mut self) {
        // Use incremental tree for efficient root computation
        self.sync_state.local_root = self.merkle_tree.root();
        self.sync_state.local_count = self.merkle_tree.len() as u32;
    }
}

impl Default for MemoryBlocklistStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spam_attestation::{SpamAttestation, SpamReason};
    use tempfile::tempdir;

    fn make_entry(seed: u8) -> BlocklistEntry {
        BlocklistEntry::new(
            [seed; 32],
            BlocklistReason::CSAM,
            vec![SpamAttestation {
                content_hash: [seed; 32],
                attester: [seed + 10; 32],
                reason: SpamReason::IllegalContent,
                timestamp: 1735689600,
                pow_nonce: 12345,
                signature: [seed + 20; 64],
            }],
            [seed + 100; 32],
            1735689600,
        )
    }

    #[test]
    fn test_memory_store_add() {
        let mut store = MemoryBlocklistStore::new();

        let entry = make_entry(1);
        assert!(store.add(entry.clone()).is_ok());
        assert!(store.is_blocked(&[1u8; 32]));

        // Duplicate should fail
        assert!(matches!(
            store.add(entry),
            Err(BlocklistError::AlreadyBlocked { .. })
        ));
    }

    #[test]
    fn test_memory_store_get() {
        let mut store = MemoryBlocklistStore::new();

        let entry = make_entry(1);
        store.add(entry).unwrap();

        let retrieved = store.get(&[1u8; 32]).unwrap();
        assert_eq!(retrieved.reason, BlocklistReason::CSAM);
        assert_eq!(retrieved.attestations.len(), 1);
    }

    #[test]
    fn test_memory_store_remove() {
        let mut store = MemoryBlocklistStore::new();

        let entry = make_entry(1);
        store.add(entry).unwrap();
        assert!(store.is_blocked(&[1u8; 32]));

        assert!(store.remove(&[1u8; 32]).is_ok());
        assert!(!store.is_blocked(&[1u8; 32]));

        // Double remove should fail
        assert!(matches!(
            store.remove(&[1u8; 32]),
            Err(BlocklistError::NotBlocked { .. })
        ));
    }

    #[test]
    fn test_memory_store_merkle_root() {
        let mut store = MemoryBlocklistStore::new();

        let root1 = store.merkle_root();
        assert_eq!(root1, [0u8; 32]); // Empty

        store.add(make_entry(1)).unwrap();
        let root2 = store.merkle_root();
        assert_ne!(root2, root1);

        store.add(make_entry(2)).unwrap();
        let root3 = store.merkle_root();
        assert_ne!(root3, root2);
    }

    #[test]
    fn test_memory_store_add_or_update() {
        let mut store = MemoryBlocklistStore::new();

        let entry = make_entry(1);
        store.add_or_update(entry.clone());
        assert_eq!(store.get(&[1u8; 32]).unwrap().propagation_confirmations, 1);

        // Update should increment confirmations
        store.add_or_update(entry);
        assert_eq!(store.get(&[1u8; 32]).unwrap().propagation_confirmations, 2);
    }

    #[test]
    fn test_persistent_store() {
        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());

        // Create and populate store
        {
            let mut store = BlocklistStore::open(db.clone()).unwrap();
            store.add(make_entry(1)).unwrap();
            store.add(make_entry(2)).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let store = BlocklistStore::open(db).unwrap();
            assert!(store.is_blocked(&[1u8; 32]));
            assert!(store.is_blocked(&[2u8; 32]));
            assert!(!store.is_blocked(&[3u8; 32]));
            assert_eq!(store.count(), 2);
        }
    }

    #[test]
    fn test_persistent_store_get_all() {
        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());

        let mut store = BlocklistStore::open(db).unwrap();
        store.add(make_entry(1)).unwrap();
        store.add(make_entry(2)).unwrap();
        store.add(make_entry(3)).unwrap();

        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 3);

        let hashes = store.get_all_hashes().unwrap();
        assert_eq!(hashes.len(), 3);
    }

    #[test]
    fn test_persistent_store_get_by_reason() {
        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());

        let mut store = BlocklistStore::open(db).unwrap();

        // Add CSAM entry
        store.add(make_entry(1)).unwrap();

        // Add Terrorism entry
        let mut terrorism_entry = make_entry(2);
        terrorism_entry.reason = BlocklistReason::Terrorism;
        store.add(terrorism_entry).unwrap();

        let csam = store.get_by_reason(BlocklistReason::CSAM).unwrap();
        assert_eq!(csam.len(), 1);

        let terrorism = store.get_by_reason(BlocklistReason::Terrorism).unwrap();
        assert_eq!(terrorism.len(), 1);

        let external = store.get_by_reason(BlocklistReason::ExternalList).unwrap();
        assert_eq!(external.len(), 0);
    }

    #[test]
    fn test_store_stats() {
        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());

        let mut store = BlocklistStore::open(db).unwrap();
        store.add(make_entry(1)).unwrap();
        store.add(make_entry(2)).unwrap();

        let stats = store.stats();
        assert_eq!(stats.entry_count, 2);
        assert_ne!(stats.merkle_root, [0u8; 32]);
    }

    // ===== External-list import + multi-hash matching =====

    #[test]
    fn test_import_records_blocks_matching_content() {
        use crate::blocklist::import::parse_import;

        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());
        let mut store = BlocklistStore::open(db).unwrap();

        // Compute real digests over some "known illegal" content bytes so the
        // ingest-side recompute path matches exactly what an operator imported.
        let content = b"synthetic-test-content-not-real-csam";
        let sha256 = crate::crypto::sha256(content);
        let sha1 = crate::crypto::sha1(content);
        let md5 = crate::crypto::md5(content);

        let list = format!(
            "sha256:{},sha1:{},md5:{} csam\n",
            hex::encode(sha256),
            hex::encode(sha1),
            hex::encode(md5),
        );
        let records = parse_import(&list).unwrap();
        let stats = store
            .import_records(&records, [7u8; 32], 1_700_000_000)
            .unwrap();

        assert_eq!(stats.sha256_added, 1);
        assert_eq!(stats.sha1_indexed, 1);
        assert_eq!(stats.md5_indexed, 1);

        // Primary SHA-256 match (the refuse-to-store path in the router).
        assert!(store.is_blocked(&sha256));
        // Recompute-and-match on the legacy digests.
        assert!(store.is_blocked_sha1(&sha1));
        assert!(store.is_blocked_md5(&md5));

        // Unrelated content is not blocked.
        let other = crate::crypto::sha256(b"benign");
        assert!(!store.is_blocked(&other));

        // Entry carries ExternalList-family provenance (CSAM reason here).
        let entry = store.get(&sha256).unwrap().unwrap();
        assert_eq!(entry.reason, BlocklistReason::CSAM);
        assert!(entry.attestations.is_empty());
    }

    #[test]
    fn test_import_md5_only_record() {
        use crate::blocklist::import::parse_import;

        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());
        let mut store = BlocklistStore::open(db).unwrap();

        let content = b"md5-only-industry-entry";
        let md5 = crate::crypto::md5(content);
        let records = parse_import(&format!("md5:{}\n", hex::encode(md5))).unwrap();
        let stats = store.import_records(&records, [0u8; 32], 1).unwrap();

        // No SHA-256 → no primary entry, but the md5 is matchable locally.
        assert_eq!(stats.sha256_added, 0);
        assert_eq!(stats.md5_indexed, 1);
        assert!(store.is_blocked_md5(&md5));
    }

    #[test]
    fn test_import_skips_duplicates() {
        use crate::blocklist::import::parse_import;

        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());
        let mut store = BlocklistStore::open(db).unwrap();

        let sha256 = crate::crypto::sha256(b"dup");
        let list = format!("sha256:{}\n", hex::encode(sha256));
        let records = parse_import(&list).unwrap();

        let s1 = store.import_records(&records, [0u8; 32], 1).unwrap();
        assert_eq!(s1.sha256_added, 1);
        let s2 = store.import_records(&records, [0u8; 32], 2).unwrap();
        assert_eq!(s2.sha256_added, 0);
        assert_eq!(s2.sha256_skipped, 1);
    }

    // ===== Signed bundle application + versioning =====

    #[test]
    fn test_apply_bundle_versions_monotonically() {
        use crate::blocklist::bundle::{BlocklistBundle, BundleEntry};

        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());
        let mut store = BlocklistStore::open(db).unwrap();

        assert_eq!(store.bundle_version(), 0);

        let entry = BundleEntry {
            content_hash: [42u8; 32],
            reason: BlocklistReason::CSAM,
            sha1: Some([42u8; 20]),
            md5: None,
        };
        let bundle = BlocklistBundle::new(5, 1_700_000_000, [9u8; 32], vec![entry]);

        // First apply lands.
        let stats = store.apply_bundle(&bundle).unwrap().unwrap();
        assert_eq!(stats.sha256_added, 1);
        assert_eq!(stats.sha1_indexed, 1);
        assert!(store.is_blocked(&[42u8; 32]));
        assert!(store.is_blocked_sha1(&[42u8; 20]));
        assert_eq!(store.bundle_version(), 5);

        // Re-applying same or older version is a no-op.
        assert!(store.apply_bundle(&bundle).unwrap().is_none());
        assert_eq!(store.bundle_version(), 5);

        // A strictly-newer version applies again.
        let entry2 = BundleEntry {
            content_hash: [43u8; 32],
            reason: BlocklistReason::CSAM,
            sha1: None,
            md5: None,
        };
        let bundle2 = BlocklistBundle::new(6, 1_700_000_001, [9u8; 32], vec![entry2]);
        assert!(store.apply_bundle(&bundle2).unwrap().is_some());
        assert_eq!(store.bundle_version(), 6);
    }

    #[test]
    fn test_build_bundle_snapshots_entries() {
        let dir = tempdir().unwrap();
        let db = Arc::new(sled::open(dir.path()).unwrap());
        let mut store = BlocklistStore::open(db).unwrap();
        store.add(make_entry(1)).unwrap();
        store.add(make_entry(2)).unwrap();

        let bundle = store.build_bundle(1, 100, [5u8; 32]).unwrap();
        assert_eq!(bundle.entries.len(), 2);
        assert_eq!(bundle.bundle_version, 1);
        assert_eq!(bundle.maintainer, [5u8; 32]);
    }
}
