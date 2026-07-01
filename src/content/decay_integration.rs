//! Decay Integration Layer
//!
//! Bridges the file-based blob storage (sync_blobs/) with the decay engine.
//! This module provides:
//! - Persistent decay metadata storage (JSON file)
//! - Registration of content for decay tracking when received from gossip
//! - Periodic pruning of decayed content from both metadata and blob storage
//! - Engagement tracking to reset decay timers
//!
//! # Architecture
//!
//! ```text
//! Gossip Receive ──► DecayIntegration.register() ──► decay_metadata.json
//!                                                        │
//! Engagement ─────► DecayIntegration.on_engagement() ────┘
//!                                                        │
//! Pruning Task ───► DecayIntegration.prune() ────────────┴──► delete from sync_blobs/
//! ```

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};

use crate::content::decay::{calculate_adaptive_half_life, calculate_decay_state, calculate_decay_state_spam_flagged, NodeState};
use crate::spam_attestation::{SpamAttestationStore, aggregate_attestations};
use crate::storage::blob::{BlobStore, ContentBlobHash};
use crate::types::constants::{
    DECAY_FLOOR_SECS, HALF_LIFE_SECS, MAX_HALF_LIFE_SECS, MIN_HALF_LIFE_SECS,
    PRUNE_GRACE_PERIOD_MS, TARGET_STORAGE_BYTES,
};
use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
use crate::types::identity::{IdentityId, Signature};

/// Metadata for a tracked content item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayMetadata {
    /// Content blob hash (for file lookup)
    pub blob_hash: [u8; 32],
    /// Original content ID
    pub content_id: [u8; 32],
    /// Author identity
    pub author_id: [u8; 32],
    /// Space this content belongs to
    pub space_id: [u8; 32],
    /// Content type
    pub content_type: u8, // 0=Post, 1=Reply, 2=Engagement
    /// Parent content ID (for replies)
    pub parent_id: Option<[u8; 32]>,
    /// When content was created (ms since epoch)
    pub created_at: u64,
    /// Last engagement time (ms since epoch)
    pub last_engagement: u64,
    /// Number of engagements received
    pub engagement_count: u32,
    /// Content size in bytes
    pub content_size: u64,
    /// Whether this content is pinned (immune to decay)
    pub is_pinned: bool,
}

impl DecayMetadata {
    /// Create from content blob hash and parsed content
    pub fn from_content(
        blob_hash: ContentBlobHash,
        content_id: ContentId,
        author_id: IdentityId,
        space_id: SpaceId,
        content_type: ContentType,
        parent_id: Option<ContentId>,
        created_at: u64,
        content_size: u64,
    ) -> Self {
        Self {
            blob_hash: *blob_hash.as_bytes(),
            content_id: *content_id.as_bytes(),
            author_id: *author_id.as_bytes(),
            space_id: *space_id.as_bytes(),
            content_type: match content_type {
                ContentType::Post => 0,
                ContentType::Reply => 1,
                ContentType::Quote => 2,
                ContentType::Edit => 3,
            },
            parent_id: parent_id.map(|p| *p.as_bytes()),
            created_at,
            last_engagement: created_at,
            engagement_count: 0,
            content_size,
            is_pinned: false,
        }
    }

    /// Convert to a ContentItem for decay calculation
    fn to_content_item(&self) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(self.content_id),
            author_id: IdentityId::from_bytes(self.author_id),
            content_type: match self.content_type {
                0 => ContentType::Post,
                1 => ContentType::Reply,
                _ => ContentType::Quote,
            },
            space_id: SpaceId::from_bytes(self.space_id),
            parent_id: self.parent_id.map(ContentId::from_bytes),
            created_at: self.created_at,
            last_engagement: self.last_engagement,
            body_inline: None,
            content_hash: None,
            content_size: Some(self.content_size as u32),
            content_type_mime: None,
            media_refs: vec![],
            pin_state: if self.is_pinned {
                Some(crate::types::content::PinState {
                    pin_type: crate::types::content::PinType::Author,
                    pin_created: self.created_at,
                    pin_expiry: None,
                    pin_cost: 0,
                })
            } else {
                None
            },
            engagement_count: self.engagement_count,
            signature: Signature::from_bytes([0u8; 64]),
            pow_nonce: 0,
            pow_difficulty: 0,
            preservation_pow: None,
            display_name: None,
        }
    }
}

/// Persistent decay metadata store
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DecayStore {
    /// Content metadata by blob hash hex
    items: HashMap<String, DecayMetadata>,
    /// Current half-life in seconds
    half_life_secs: u64,
    /// Last adaptive half-life calculation time
    last_adaptation: u64,
}

impl Default for DecayStore {
    fn default() -> Self {
        Self {
            items: HashMap::new(),
            half_life_secs: HALF_LIFE_SECS,
            last_adaptation: 0,
        }
    }
}

/// Statistics from a prune operation
#[derive(Debug, Clone, Default)]
pub struct DecayPruneStats {
    /// Number of items checked
    pub items_checked: usize,
    /// Number of items pruned
    pub items_pruned: usize,
    /// Number of items protected (pinned or in floor period)
    pub items_protected: usize,
    /// Bytes freed by pruning
    pub bytes_freed: u64,
    /// Number of orphan metadata entries cleaned
    pub orphans_cleaned: usize,
}

/// Decay integration manager
///
/// Bridges blob storage with decay tracking, providing:
/// - Content registration when received from gossip
/// - Engagement processing to reset decay timers
/// - Periodic pruning of decayed content
/// - Spam flag checking for accelerated decay (SPEC_12 §3)
pub struct DecayIntegration {
    /// Path to data directory
    data_dir: PathBuf,
    /// Path to decay metadata file
    metadata_path: PathBuf,
    /// In-memory decay store (synced to disk)
    store: Arc<RwLock<DecayStore>>,
    /// Blob store for content
    blob_store: Arc<BlobStore>,
    /// Target storage in bytes
    target_storage_bytes: u64,
    /// Spam attestation store for checking content spam status (SPEC_12 §3)
    spam_attestation_store: Option<Arc<SpamAttestationStore>>,
}

impl DecayIntegration {
    /// Create a new decay integration manager
    pub fn new(
        data_dir: PathBuf,
        blob_store: Arc<BlobStore>,
        target_storage_bytes: u64,
    ) -> Result<Self, DecayError> {
        let metadata_path = data_dir.join("decay_metadata.json");

        // Load existing metadata or create new
        let store = if metadata_path.exists() {
            match fs::read_to_string(&metadata_path) {
                Ok(json) => match serde_json::from_str(&json) {
                    Ok(store) => store,
                    Err(e) => {
                        warn!(
                            "[DECAY] Failed to parse decay metadata: {}, starting fresh",
                            e
                        );
                        DecayStore::default()
                    }
                },
                Err(e) => {
                    warn!(
                        "[DECAY] Failed to read decay metadata: {}, starting fresh",
                        e
                    );
                    DecayStore::default()
                }
            }
        } else {
            DecayStore::default()
        };

        info!(
            "[DECAY] Loaded decay metadata with {} items, half_life={}s",
            store.items.len(),
            store.half_life_secs
        );

        Ok(Self {
            data_dir,
            metadata_path,
            store: Arc::new(RwLock::new(store)),
            blob_store,
            target_storage_bytes,
            spam_attestation_store: None,
        })
    }

    /// Create with default target storage (for testing)
    pub fn with_defaults(data_dir: PathBuf, blob_store: Arc<BlobStore>) -> Result<Self, DecayError> {
        Self::new(data_dir, blob_store, TARGET_STORAGE_BYTES)
    }

    /// Set the spam attestation store for checking content spam status
    pub fn set_spam_attestation_store(&mut self, store: Arc<SpamAttestationStore>) {
        self.spam_attestation_store = Some(store);
    }

    /// Register content for decay tracking with minimal info
    ///
    /// Called when content is received from gossip and stored in blob store.
    /// Uses the blob hash as a proxy for content_id and sets unknown fields to defaults.
    pub fn register_blob(&self, blob_hash: [u8; 32], content_size: u64) -> Result<(), DecayError> {
        let now_ms = current_time_ms();
        let metadata = DecayMetadata {
            blob_hash,
            content_id: blob_hash, // Use hash as ID
            author_id: [0u8; 32],  // Unknown
            space_id: [0u8; 32],   // Unknown
            content_type: 0,       // Assume Post
            parent_id: None,
            created_at: now_ms,
            last_engagement: now_ms,
            engagement_count: 0,
            content_size,
            is_pinned: false,
        };
        self.register(metadata)
    }

    /// Register content for decay tracking with full metadata
    ///
    /// Called when content is received from gossip and stored in blob store.
    pub fn register(&self, metadata: DecayMetadata) -> Result<(), DecayError> {
        let hash_hex = hex::encode(&metadata.blob_hash);

        let mut store = self
            .store
            .write()
            .map_err(|_| DecayError::LockPoisoned)?;

        // Don't overwrite existing entries (preserve engagement data)
        if store.items.contains_key(&hash_hex) {
            debug!(
                "[DECAY] Content {} already registered, skipping",
                &hash_hex[..16]
            );
            return Ok(());
        }

        store.items.insert(hash_hex.clone(), metadata);

        drop(store);

        // Save to disk
        self.persist()?;

        debug!("[DECAY] Registered content {} for decay tracking", &hash_hex[..16]);

        Ok(())
    }

    /// Record engagement on content (resets decay timer)
    ///
    /// Called when a reply or engagement action targets this content.
    pub fn on_engagement(&self, blob_hash: &ContentBlobHash) -> Result<bool, DecayError> {
        let hash_hex = hex::encode(blob_hash.as_bytes());
        let now_ms = current_time_ms();

        let engagement_count = {
            let mut store = self
                .store
                .write()
                .map_err(|_| DecayError::LockPoisoned)?;

            if let Some(metadata) = store.items.get_mut(&hash_hex) {
                metadata.last_engagement = now_ms;
                metadata.engagement_count += 1;
                Some(metadata.engagement_count)
            } else {
                None
            }
        };

        if let Some(count) = engagement_count {
            self.persist()?;

            info!(
                "[DECAY] Engagement recorded for {}, count={}",
                &hash_hex[..16],
                count
            );

            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Prune decayed content
    ///
    /// Removes content that has decayed from both metadata and blob storage.
    /// Should be called periodically (e.g., every minute).
    pub fn prune(&self) -> Result<DecayPruneStats, DecayError> {
        let now_ms = current_time_ms();
        let mut stats = DecayPruneStats::default();

        let mut store = self
            .store
            .write()
            .map_err(|_| DecayError::LockPoisoned)?;

        let half_life_secs = store.half_life_secs;

        // Collect hashes to prune
        let mut to_prune: Vec<String> = Vec::new();

        for (hash_hex, metadata) in store.items.iter() {
            stats.items_checked += 1;

            // Skip pinned content
            if metadata.is_pinned {
                stats.items_protected += 1;
                continue;
            }

            // Calculate decay state
            let content_item = metadata.to_content_item();
            let decay_state = calculate_decay_state(&content_item, now_ms, half_life_secs);

            // Skip protected content (in floor period)
            if decay_state.is_protected {
                stats.items_protected += 1;
                continue;
            }

            // Check if decayed and past grace period
            if decay_state.is_decayed {
                let time_since_engagement = now_ms.saturating_sub(metadata.last_engagement);
                if time_since_engagement >= PRUNE_GRACE_PERIOD_MS {
                    to_prune.push(hash_hex.clone());
                    stats.bytes_freed += metadata.content_size;
                }
            }
        }

        // Execute pruning
        for hash_hex in to_prune {
            // Remove from metadata
            if let Some(metadata) = store.items.remove(&hash_hex) {
                // Delete blob file
                let blob_hash = ContentBlobHash::from_bytes(metadata.blob_hash);
                let blob_path = self.blob_store.blob_path(&blob_hash);

                if blob_path.exists() {
                    if let Err(e) = fs::remove_file(&blob_path) {
                        warn!("[DECAY] Failed to delete blob {}: {}", &hash_hex[..16], e);
                    } else {
                        debug!("[DECAY] Deleted blob {}", &hash_hex[..16]);
                    }
                }

                stats.items_pruned += 1;
            }
        }

        // Clean up orphan metadata (entries without corresponding blobs)
        let orphans: Vec<String> = store
            .items
            .keys()
            .filter(|hash_hex| {
                if let Ok(bytes) = hex::decode(hash_hex) {
                    if bytes.len() == 32 {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&bytes);
                        let blob_hash = ContentBlobHash::from_bytes(arr);
                        let blob_path = self.blob_store.blob_path(&blob_hash);
                        return !blob_path.exists();
                    }
                }
                false
            })
            .cloned()
            .collect();

        for orphan in &orphans {
            store.items.remove(orphan);
            stats.orphans_cleaned += 1;
        }

        drop(store);

        // Persist changes
        self.persist()?;

        if stats.items_pruned > 0 || stats.orphans_cleaned > 0 {
            info!(
                "[DECAY] Pruned {} items ({}KB freed), {} orphans cleaned",
                stats.items_pruned,
                stats.bytes_freed / 1024,
                stats.orphans_cleaned
            );
        }

        Ok(stats)
    }

    /// Adapt half-life based on storage pressure
    ///
    /// Should be called periodically (e.g., every hour).
    pub fn adapt_half_life(&self) -> Result<u64, DecayError> {
        let mut store = self
            .store
            .write()
            .map_err(|_| DecayError::LockPoisoned)?;

        // Calculate current storage
        let total_storage: u64 = store.items.values().map(|m| m.content_size).sum();

        let node_state = NodeState {
            total_storage_bytes: total_storage,
            target_storage_bytes: self.target_storage_bytes,
            current_half_life_secs: store.half_life_secs,
        };

        let new_half_life = calculate_adaptive_half_life(&node_state)
            .max(MIN_HALF_LIFE_SECS)
            .min(MAX_HALF_LIFE_SECS);

        if new_half_life != store.half_life_secs {
            info!(
                "[DECAY] Adapted half-life: {}s -> {}s (storage: {}KB / {}KB target)",
                store.half_life_secs,
                new_half_life,
                total_storage / 1024,
                self.target_storage_bytes / 1024
            );
            store.half_life_secs = new_half_life;
            store.last_adaptation = current_time_ms();
        }

        drop(store);
        self.persist()?;

        Ok(new_half_life)
    }

    /// Get current half-life in seconds
    pub fn current_half_life(&self) -> Result<u64, DecayError> {
        let store = self.store.read().map_err(|_| DecayError::LockPoisoned)?;
        Ok(store.half_life_secs)
    }

    /// Get storage statistics
    pub fn storage_stats(&self) -> Result<(u64, usize), DecayError> {
        let store = self.store.read().map_err(|_| DecayError::LockPoisoned)?;
        let total_bytes: u64 = store.items.values().map(|m| m.content_size).sum();
        Ok((total_bytes, store.items.len()))
    }

    /// Get decay state for specific content
    ///
    /// Checks if content is spam-flagged and applies accelerated decay if so.
    pub fn get_decay_state(
        &self,
        blob_hash: &ContentBlobHash,
    ) -> Result<Option<crate::types::content::DecayState>, DecayError> {
        let hash_hex = hex::encode(blob_hash.as_bytes());
        let store = self.store.read().map_err(|_| DecayError::LockPoisoned)?;

        if let Some(metadata) = store.items.get(&hash_hex) {
            let content_item = metadata.to_content_item();

            // Check if content is spam-flagged
            let is_spam_flagged = self.is_spam_flagged(blob_hash.as_bytes());

            let decay_state = calculate_decay_state_spam_flagged(
                &content_item,
                current_time_ms(),
                is_spam_flagged,
            );
            Ok(Some(decay_state))
        } else {
            Ok(None)
        }
    }

    /// Check if content is flagged as spam (3+ independent sponsor trees attested)
    pub fn is_spam_flagged(&self, content_hash: &[u8; 32]) -> bool {
        let store = match &self.spam_attestation_store {
            Some(s) => s,
            None => return false,
        };

        // Get attestations for this content
        let attestations = match store.get_attestations_for_content(content_hash) {
            Ok(a) => a,
            Err(_) => return false,
        };

        // Get counter state to check if cleared
        let counter_state = match store.get_counter_state(content_hash) {
            Ok(s) => s,
            Err(_) => return false,
        };

        // If cleared by counter-attestations, not flagged
        if counter_state.is_cleared {
            return false;
        }

        // Aggregate and check threshold
        let aggregation = aggregate_attestations(*content_hash, &attestations, counter_state.is_cleared);
        aggregation.should_accelerate_decay
    }

    /// Pin content (makes it immune to decay)
    pub fn pin(&self, blob_hash: &ContentBlobHash) -> Result<bool, DecayError> {
        let hash_hex = hex::encode(blob_hash.as_bytes());

        let mut store = self
            .store
            .write()
            .map_err(|_| DecayError::LockPoisoned)?;

        if let Some(metadata) = store.items.get_mut(&hash_hex) {
            metadata.is_pinned = true;
            drop(store);
            self.persist()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Unpin content
    pub fn unpin(&self, blob_hash: &ContentBlobHash) -> Result<bool, DecayError> {
        let hash_hex = hex::encode(blob_hash.as_bytes());

        let mut store = self
            .store
            .write()
            .map_err(|_| DecayError::LockPoisoned)?;

        if let Some(metadata) = store.items.get_mut(&hash_hex) {
            metadata.is_pinned = false;
            drop(store);
            self.persist()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Check if content exists in decay tracker
    pub fn contains(&self, blob_hash: &ContentBlobHash) -> bool {
        let hash_hex = hex::encode(blob_hash.as_bytes());
        self.store
            .read()
            .map(|s| s.items.contains_key(&hash_hex))
            .unwrap_or(false)
    }

    /// Get number of tracked items
    pub fn item_count(&self) -> usize {
        self.store.read().map(|s| s.items.len()).unwrap_or(0)
    }

    /// Persist metadata to disk
    fn persist(&self) -> Result<(), DecayError> {
        let store = self.store.read().map_err(|_| DecayError::LockPoisoned)?;

        let json =
            serde_json::to_string_pretty(&*store).map_err(|e| DecayError::Serialization(e))?;

        // Write atomically (temp file + rename)
        // Use unique temp file to avoid race conditions with concurrent writers
        let unique_id = std::process::id();
        let thread_id = std::thread::current().id();
        let temp_name = format!("decay_metadata.{}.{:?}.tmp", unique_id, thread_id);
        let temp_path = self.data_dir.join(&temp_name);

        // Ensure data directory exists
        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir).map_err(|e| DecayError::Io(e))?;
        }

        fs::write(&temp_path, &json).map_err(|e| DecayError::Io(e))?;

        // Rename is atomic on most filesystems
        if let Err(e) = fs::rename(&temp_path, &self.metadata_path) {
            // Clean up temp file if rename fails
            let _ = fs::remove_file(&temp_path);
            return Err(DecayError::Io(e));
        }

        Ok(())
    }

    /// Scan sync_blobs directory and register any untracked content
    ///
    /// This is useful for bootstrapping decay tracking on existing content.
    pub fn scan_and_register(&self) -> Result<usize, DecayError> {
        let sync_blobs_path = self.data_dir.join("sync_blobs");
        if !sync_blobs_path.exists() {
            return Ok(0);
        }

        let now_ms = current_time_ms();
        let mut registered = 0;

        // Iterate over prefix directories
        if let Ok(prefix_dirs) = fs::read_dir(&sync_blobs_path) {
            for prefix_entry in prefix_dirs.flatten() {
                let prefix_path = prefix_entry.path();
                if prefix_path.is_dir() {
                    if let Ok(files) = fs::read_dir(&prefix_path) {
                        for file_entry in files.flatten() {
                            let file_path = file_entry.path();
                            if file_path.is_file() {
                                // Get file size
                                let file_size =
                                    fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

                                if file_size == 0 {
                                    continue;
                                }

                                // Parse hash from filename
                                if let Some(filename) = file_path.file_name() {
                                    let filename_str = filename.to_string_lossy();
                                    // Construct full hash from prefix + suffix
                                    let prefix_name = prefix_path
                                        .file_name()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_default();

                                    let full_hash_hex = format!("{}{}", prefix_name, filename_str);

                                    if let Ok(hash_bytes) = hex::decode(&full_hash_hex) {
                                        if hash_bytes.len() == 32 {
                                            let mut arr = [0u8; 32];
                                            arr.copy_from_slice(&hash_bytes);
                                            let blob_hash = ContentBlobHash::from_bytes(arr);

                                            // Check if already tracked
                                            if !self.contains(&blob_hash) {
                                                // Create minimal metadata
                                                let metadata = DecayMetadata {
                                                    blob_hash: arr,
                                                    content_id: arr, // Use hash as ID
                                                    author_id: [0u8; 32], // Unknown
                                                    space_id: [0u8; 32], // Unknown
                                                    content_type: 0, // Assume Post
                                                    parent_id: None,
                                                    created_at: now_ms, // Best estimate
                                                    last_engagement: now_ms,
                                                    engagement_count: 0,
                                                    content_size: file_size,
                                                    is_pinned: false,
                                                };

                                                if self.register(metadata).is_ok() {
                                                    registered += 1;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if registered > 0 {
            info!("[DECAY] Scanned and registered {} untracked content items", registered);
        }

        Ok(registered)
    }
}

/// Decay integration errors
#[derive(Debug, thiserror::Error)]
pub enum DecayError {
    #[error("Lock poisoned")]
    LockPoisoned,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Get current time in milliseconds since epoch
fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_integration() -> (DecayIntegration, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
        let integration = DecayIntegration::with_defaults(dir.path().to_path_buf(), blob_store).unwrap();
        (integration, dir)
    }

    #[test]
    fn test_register_and_contains() {
        let (integration, _dir) = create_test_integration();

        let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: current_time_ms(),
            last_engagement: current_time_ms(),
            engagement_count: 0,
            content_size: 1000,
            is_pinned: false,
        };

        assert!(!integration.contains(&blob_hash));
        integration.register(metadata).unwrap();
        assert!(integration.contains(&blob_hash));
    }

    #[test]
    fn test_engagement_resets_decay() {
        let (integration, _dir) = create_test_integration();

        let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
        let now = current_time_ms();

        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: now - 1000, // Created 1 second ago
            last_engagement: now - 1000,
            engagement_count: 0,
            content_size: 1000,
            is_pinned: false,
        };

        integration.register(metadata).unwrap();

        // Record engagement
        let engaged = integration.on_engagement(&blob_hash).unwrap();
        assert!(engaged);

        // Verify engagement was recorded
        let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();
        assert!(state.is_protected); // Should be in floor period
    }

    #[test]
    fn test_prune_decayed_content() {
        let (integration, dir) = create_test_integration();

        let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
        let very_old_time = 0; // Unix epoch - definitely decayed

        // Create a blob file
        let blob_path = integration.blob_store.blob_path(&blob_hash);
        fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
        fs::write(&blob_path, b"test content").unwrap();

        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: very_old_time,
            last_engagement: very_old_time,
            engagement_count: 0,
            content_size: 12,
            is_pinned: false,
        };

        integration.register(metadata).unwrap();

        // Prune
        let stats = integration.prune().unwrap();
        assert_eq!(stats.items_pruned, 1);
        assert!(!integration.contains(&blob_hash));
        assert!(!blob_path.exists());
    }

    #[test]
    fn test_pinned_content_not_pruned() {
        let (integration, _dir) = create_test_integration();

        let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
        let very_old_time = 0;

        // Create a blob file
        let blob_path = integration.blob_store.blob_path(&blob_hash);
        fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
        fs::write(&blob_path, b"test content").unwrap();

        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: very_old_time,
            last_engagement: very_old_time,
            engagement_count: 0,
            content_size: 12,
            is_pinned: true, // Pinned!
        };

        integration.register(metadata).unwrap();

        // Prune
        let stats = integration.prune().unwrap();
        assert_eq!(stats.items_pruned, 0);
        assert_eq!(stats.items_protected, 1);
        assert!(integration.contains(&blob_hash));
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);

        // Register content
        {
            let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
            let integration = DecayIntegration::with_defaults(dir.path().to_path_buf(), blob_store).unwrap();

            let metadata = DecayMetadata {
                blob_hash: *blob_hash.as_bytes(),
                content_id: [2u8; 32],
                author_id: [3u8; 32],
                space_id: [4u8; 32],
                content_type: 0,
                parent_id: None,
                created_at: current_time_ms(),
                last_engagement: current_time_ms(),
                engagement_count: 0,
                content_size: 1000,
                is_pinned: false,
            };

            integration.register(metadata).unwrap();
        }

        // Reload and verify
        {
            let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
            let integration = DecayIntegration::with_defaults(dir.path().to_path_buf(), blob_store).unwrap();
            assert!(integration.contains(&blob_hash));
        }
    }

    #[test]
    fn test_storage_stats() {
        let (integration, _dir) = create_test_integration();

        let (bytes, count) = integration.storage_stats().unwrap();
        assert_eq!(bytes, 0);
        assert_eq!(count, 0);

        // Register content
        let metadata = DecayMetadata {
            blob_hash: [1u8; 32],
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: current_time_ms(),
            last_engagement: current_time_ms(),
            engagement_count: 0,
            content_size: 5000,
            is_pinned: false,
        };

        integration.register(metadata).unwrap();

        let (bytes, count) = integration.storage_stats().unwrap();
        assert_eq!(bytes, 5000);
        assert_eq!(count, 1);
    }
}
