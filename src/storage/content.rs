//! Persistent content storage (SPEC_07 - Milestone 1.6)
//!
//! Uses sled for ContentItem metadata and BlobStore for large content.
//! Content <= 1KB is stored inline in sled, > 1KB in blob store.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use log::info;
use sled::Db;

use super::blob::BlobStore;
use crate::types::content::{
    ContentId, ContentItem, Reaction, ReactionCounts, ReactionType, Tombstone,
};
use crate::types::error::StorageError;
use crate::types::identity::IdentityId;

/// Inline content threshold (SPEC_07: ≤1KB inline, >1KB in blob store)
pub const INLINE_THRESHOLD: usize = 1024;

/// A reaction stays "live" for 5 days, then decays. Reactions never receive
/// their own keep-alive (nothing engages a reaction), so a reaction only ever
/// ages out — the live set is self-cleaning. While a user's reaction of a given
/// emoji is live, they cannot stack the same emoji on the same content; once it
/// decays they may add it again to renew the post's keep-alive. See
/// docs/superpowers/specs/2026-07-11-decaying-reactions-design.md.
pub const REACTION_LIFETIME_MS: u64 = 5 * 24 * 60 * 60 * 1000;

/// Persistent content storage using sled + filesystem
pub struct PersistentContentStore {
    db: Db,
    content_tree: sled::Tree,
    tombstone_tree: sled::Tree,
    children_tree: sled::Tree,
    reactions_tree: sled::Tree,       // Stores individual reactions
    reaction_counts_tree: sled::Tree, // Stores aggregated counts per content
    blob_store: BlobStore,
    total_bytes: AtomicU64,
}

impl PersistentContentStore {
    /// Open or create persistent content store
    ///
    /// # Errors
    ///
    /// Returns error if database or blob store cannot be opened.
    pub fn open(
        db_path: impl AsRef<Path>,
        blob_path: impl AsRef<Path>,
    ) -> Result<Self, StorageError> {
        let db = crate::storage::open_db(db_path.as_ref())?;
        let content_tree = db.open_tree("content")?;
        let tombstone_tree = db.open_tree("tombstones")?;
        let children_tree = db.open_tree("children")?;
        let reactions_tree = db.open_tree("reactions")?;
        let reaction_counts_tree = db.open_tree("reaction_counts")?;

        let blob_store = BlobStore::new(blob_path)?;

        // Calculate initial total bytes
        let mut total = blob_store.total_bytes();
        for result in content_tree.iter() {
            let (k, v) = result?;
            total += (k.len() + v.len()) as u64;
        }

        Ok(Self {
            db,
            content_tree,
            tombstone_tree,
            children_tree,
            reactions_tree,
            reaction_counts_tree,
            blob_store,
            total_bytes: AtomicU64::new(total),
        })
    }

    /// Store a content item
    ///
    /// # Errors
    ///
    /// Returns error if already exists or storage fails.
    pub fn put(&self, content: &ContentItem) -> Result<(), StorageError> {
        let key = content.content_id.0;

        // Check if already exists
        if self.content_tree.contains_key(&key)? {
            return Err(StorageError::SerializationError(format!(
                "content already exists: {:?}",
                content.content_id
            )));
        }

        // Serialize content
        let data = bincode::serialize(content)?;
        let size = (key.len() + data.len()) as u64;

        self.content_tree.insert(&key, data)?;
        self.total_bytes.fetch_add(size, Ordering::Relaxed);

        // Update children index
        if let Some(parent_id) = content.parent_id {
            self.add_child(&parent_id, &content.content_id)?;
        }

        Ok(())
    }

    /// Get a content item by ID
    ///
    /// # Errors
    ///
    /// Returns error if read or deserialization fails.
    pub fn get(&self, id: &ContentId) -> Result<Option<ContentItem>, StorageError> {
        match self.content_tree.get(&id.0)? {
            Some(data) => {
                let content: ContentItem = bincode::deserialize(&data)?;
                Ok(Some(content))
            }
            None => Ok(None),
        }
    }

    /// Get body content by content hash (blob hash)
    ///
    /// For content with inline body, returns the inline body.
    /// For content with content_hash, reads from blob store.
    /// Returns None if content not found or no body available.
    pub fn get_body_by_hash(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<Option<String>, StorageError> {
        use super::blob::ContentBlobHash;

        // First check if we have a blob with this exact hash
        let blob_hash = ContentBlobHash::from_bytes(*content_hash);
        if self.blob_store.exists(&blob_hash) {
            match self.blob_store.get(&blob_hash) {
                Ok(data) => {
                    return Ok(Some(String::from_utf8_lossy(&data).to_string()));
                }
                Err(_) => {}
            }
        }

        // Fall back to checking content store for inline body
        let content_id = ContentId::from_bytes(*content_hash);
        if let Some(content) = self.get(&content_id)? {
            if let Some(body) = content.body_inline {
                return Ok(Some(body));
            }
        }

        Ok(None)
    }

    /// Check if content exists
    pub fn exists(&self, id: &ContentId) -> Result<bool, StorageError> {
        Ok(self.content_tree.contains_key(&id.0)?)
    }

    /// Delete a content item
    ///
    /// # Errors
    ///
    /// Returns error if operation fails.
    pub fn delete(&self, id: &ContentId) -> Result<bool, StorageError> {
        if let Some(data) = self.content_tree.remove(&id.0)? {
            let content: ContentItem = bincode::deserialize(&data)?;
            let size = (id.0.len() + data.len()) as u64;
            self.total_bytes.fetch_sub(size, Ordering::Relaxed);

            // Remove from parent's children list
            if let Some(parent_id) = content.parent_id {
                self.remove_child(&parent_id, id)?;
            }

            // Note: We don't delete the children index entry because children
            // may still exist and reference this content

            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Update a content item in place
    ///
    /// # Errors
    ///
    /// Returns error if content doesn't exist or operation fails.
    pub fn update(&self, content: &ContentItem) -> Result<(), StorageError> {
        let key = content.content_id.0;

        // Get existing to adjust size
        if let Some(old_data) = self.content_tree.get(&key)? {
            let old_size = (key.len() + old_data.len()) as u64;

            let new_data = bincode::serialize(content)?;
            let new_size = (key.len() + new_data.len()) as u64;

            self.content_tree.insert(&key, new_data)?;

            // Adjust total bytes
            if new_size > old_size {
                self.total_bytes
                    .fetch_add(new_size - old_size, Ordering::Relaxed);
            } else {
                self.total_bytes
                    .fetch_sub(old_size - new_size, Ordering::Relaxed);
            }

            Ok(())
        } else {
            Err(StorageError::SerializationError(format!(
                "content not found for update: {:?}",
                content.content_id
            )))
        }
    }

    /// Update the last_engagement timestamp for a content item
    ///
    /// This is called when a pool completes and the content is preserved.
    ///
    /// # Errors
    ///
    /// Returns error if content doesn't exist or operation fails.
    pub fn update_last_engagement(
        &self,
        id: &ContentId,
        new_timestamp: u64,
    ) -> Result<(), StorageError> {
        let key = id.0;

        // Get existing content
        if let Some(data) = self.content_tree.get(&key)? {
            let mut content: ContentItem = bincode::deserialize(&data)?;
            let old_engagement = content.last_engagement;

            // Only update if new timestamp is newer
            if new_timestamp > old_engagement {
                content.last_engagement = new_timestamp;
                let new_data = bincode::serialize(&content)?;
                self.content_tree.insert(&key, new_data)?;

                info!(
                    "[STORAGE] Updated last_engagement for content {:?}: {} -> {}",
                    id, old_engagement, new_timestamp
                );
            }

            Ok(())
        } else {
            Err(StorageError::SerializationError(format!(
                "content not found for update_last_engagement: {:?}",
                id
            )))
        }
    }

    /// Add a child to parent's children list
    fn add_child(&self, parent_id: &ContentId, child_id: &ContentId) -> Result<(), StorageError> {
        let key = parent_id.0;

        let mut children: HashSet<[u8; 32]> = match self.children_tree.get(&key)? {
            Some(data) => bincode::deserialize(&data)?,
            None => HashSet::new(),
        };

        children.insert(child_id.0);

        let data = bincode::serialize(&children)?;
        self.children_tree.insert(&key, data)?;

        Ok(())
    }

    /// Remove a child from parent's children list
    fn remove_child(
        &self,
        parent_id: &ContentId,
        child_id: &ContentId,
    ) -> Result<(), StorageError> {
        let key = parent_id.0;

        if let Some(data) = self.children_tree.get(&key)? {
            let mut children: HashSet<[u8; 32]> = bincode::deserialize(&data)?;
            children.remove(&child_id.0);

            if children.is_empty() {
                self.children_tree.remove(&key)?;
            } else {
                let data = bincode::serialize(&children)?;
                self.children_tree.insert(&key, data)?;
            }
        }

        Ok(())
    }

    /// Get children of a content item
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_children(&self, parent_id: &ContentId) -> Result<Vec<ContentItem>, StorageError> {
        let key = parent_id.0;

        match self.children_tree.get(&key)? {
            Some(data) => {
                let child_ids: HashSet<[u8; 32]> = bincode::deserialize(&data)?;
                let mut children = Vec::with_capacity(child_ids.len());

                for child_id in child_ids {
                    if let Some(content) = self.get(&ContentId::from_bytes(child_id))? {
                        children.push(content);
                    }
                }

                Ok(children)
            }
            None => Ok(Vec::new()),
        }
    }

    /// Get child IDs (without loading full content)
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_child_ids(&self, parent_id: &ContentId) -> Result<Vec<ContentId>, StorageError> {
        let key = parent_id.0;

        match self.children_tree.get(&key)? {
            Some(data) => {
                let child_ids: HashSet<[u8; 32]> = bincode::deserialize(&data)?;
                Ok(child_ids.into_iter().map(ContentId::from_bytes).collect())
            }
            None => Ok(Vec::new()),
        }
    }

    /// Get child count only (fast - no content loading)
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_child_count(&self, parent_id: &ContentId) -> Result<usize, StorageError> {
        let key = parent_id.0;

        match self.children_tree.get(&key)? {
            Some(data) => {
                let child_ids: HashSet<[u8; 32]> = bincode::deserialize(&data)?;
                Ok(child_ids.len())
            }
            None => Ok(0),
        }
    }

    /// Store a tombstone
    ///
    /// # Errors
    ///
    /// Returns error if operation fails.
    pub fn put_tombstone(&self, tombstone: &Tombstone) -> Result<(), StorageError> {
        let key = tombstone.content_id.0;
        let data = bincode::serialize(tombstone)?;
        self.tombstone_tree.insert(&key, data)?;
        Ok(())
    }

    /// Get a tombstone by content ID
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_tombstone(&self, id: &ContentId) -> Result<Option<Tombstone>, StorageError> {
        match self.tombstone_tree.get(&id.0)? {
            Some(data) => {
                let tombstone: Tombstone = bincode::deserialize(&data)?;
                Ok(Some(tombstone))
            }
            None => Ok(None),
        }
    }

    /// Delete a tombstone
    ///
    /// # Errors
    ///
    /// Returns error if operation fails.
    pub fn delete_tombstone(&self, id: &ContentId) -> Result<bool, StorageError> {
        Ok(self.tombstone_tree.remove(&id.0)?.is_some())
    }

    // =========================================================================
    // Reaction Methods
    // =========================================================================

    /// Create a key for reaction storage
    /// Format: content_id (32 bytes) + reactor_id (32 bytes) + reaction_type (1 byte)
    fn reaction_key(
        content_id: &ContentId,
        reactor_id: &IdentityId,
        reaction_type: ReactionType,
    ) -> [u8; 65] {
        let mut key = [0u8; 65];
        key[..32].copy_from_slice(&content_id.0);
        key[32..64].copy_from_slice(&reactor_id.0);
        key[64] = reaction_type as u8;
        key
    }

    /// Add a reaction from a user to content (decaying, non-stacking).
    ///
    /// A user holds at most one live reaction per (content, emoji). Adding the
    /// same emoji again while the existing one is still within
    /// `REACTION_LIFETIME_MS` is rejected (`Ok(false)`) with no state change.
    /// Once it has decayed, re-adding refreshes the timestamp (renews
    /// keep-alive). Different emojis from the same user are always accepted.
    /// Reaction records are stored per (content, reactor, type) with their
    /// timestamp so counts can be computed over the live window.
    ///
    /// # Errors
    ///
    /// Returns error if storage operation fails.
    pub fn add_reaction_windowed(
        &self,
        reaction: &Reaction,
        now_ms: u64,
    ) -> Result<bool, StorageError> {
        let key = Self::reaction_key(
            &reaction.content_id,
            &reaction.reactor_id,
            reaction.reaction_type,
        );

        // Reject a stacked same-emoji reaction while the existing one is live.
        if let Some(data) = self.reactions_tree.get(&key)? {
            let existing: Reaction = bincode::deserialize(&data)?;
            if now_ms.saturating_sub(existing.timestamp) < REACTION_LIFETIME_MS {
                return Ok(false);
            }
        }

        // Upsert the timestamped record (refreshes on renew after decay).
        let data = bincode::serialize(reaction)?;
        self.reactions_tree.insert(&key, data)?;

        info!(
            "[STORAGE] Added reaction {} from {:?} to {:?}",
            reaction.reaction_type.emoji(),
            reaction.reactor_id,
            reaction.content_id
        );

        Ok(true)
    }

    /// Legacy entry point kept for callers that don't thread a clock; uses the
    /// reaction's own timestamp as "now". Prefer `add_reaction_windowed`.
    ///
    /// # Errors
    ///
    /// Returns error if storage operation fails.
    pub fn add_reaction(&self, reaction: &Reaction) -> Result<bool, StorageError> {
        self.add_reaction_windowed(reaction, reaction.timestamp)
    }

    /// Remove a reaction from a user
    ///
    /// Returns true if reaction was removed, false if it didn't exist.
    ///
    /// # Errors
    ///
    /// Returns error if storage operation fails.
    pub fn remove_reaction(
        &self,
        content_id: &ContentId,
        reactor_id: &IdentityId,
        reaction_type: ReactionType,
    ) -> Result<bool, StorageError> {
        let key = Self::reaction_key(content_id, reactor_id, reaction_type);

        if self.reactions_tree.remove(&key)?.is_some() {
            // Decrement aggregated counts
            self.decrement_reaction_count(content_id, reaction_type)?;

            info!(
                "[STORAGE] Removed reaction {} from {:?} to {:?}",
                reaction_type.emoji(),
                reactor_id,
                content_id
            );

            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Clear all reactions from the store
    ///
    /// This removes both individual reactions and aggregated counts.
    /// Used for rebuilding reactions from chain data.
    ///
    /// # Returns
    ///
    /// Number of entries cleared.
    ///
    /// # Errors
    ///
    /// Returns error if storage operation fails.
    pub fn clear_all_reactions(&self) -> Result<u32, StorageError> {
        let mut count = 0u32;

        // Clear reactions_tree
        for result in self.reactions_tree.iter() {
            if let Ok((key, _)) = result {
                self.reactions_tree.remove(&key)?;
                count += 1;
            }
        }

        // Clear reaction_counts_tree
        for result in self.reaction_counts_tree.iter() {
            if let Ok((key, _)) = result {
                self.reaction_counts_tree.remove(&key)?;
                count += 1;
            }
        }

        self.reactions_tree.flush()?;
        self.reaction_counts_tree.flush()?;

        info!("[STORAGE] Cleared {} reaction entries", count);
        Ok(count)
    }

    /// Check if a user has reacted with a specific emoji
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn has_reaction(
        &self,
        content_id: &ContentId,
        reactor_id: &IdentityId,
        reaction_type: ReactionType,
    ) -> Result<bool, StorageError> {
        let key = Self::reaction_key(content_id, reactor_id, reaction_type);
        Ok(self.reactions_tree.contains_key(&key)?)
    }

    /// Get all reactions a user has made on content
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_user_reactions(
        &self,
        content_id: &ContentId,
        reactor_id: &IdentityId,
    ) -> Result<Vec<ReactionType>, StorageError> {
        let mut reactions = Vec::new();

        for reaction_type in ReactionType::all() {
            if self.has_reaction(content_id, reactor_id, reaction_type)? {
                reactions.push(reaction_type);
            }
        }

        Ok(reactions)
    }

    /// Increment reaction count for a specific type
    fn increment_reaction_count(
        &self,
        content_id: &ContentId,
        reaction_type: ReactionType,
    ) -> Result<(), StorageError> {
        let key = content_id.0;

        let mut counts: ReactionCounts = match self.reaction_counts_tree.get(&key)? {
            Some(data) => bincode::deserialize(&data)?,
            None => ReactionCounts::new(),
        };

        counts.increment(reaction_type);

        let data = bincode::serialize(&counts)?;
        self.reaction_counts_tree.insert(&key, data)?;

        Ok(())
    }

    /// Decrement reaction count for a specific type
    fn decrement_reaction_count(
        &self,
        content_id: &ContentId,
        reaction_type: ReactionType,
    ) -> Result<(), StorageError> {
        let key = content_id.0;

        if let Some(data) = self.reaction_counts_tree.get(&key)? {
            let mut counts: ReactionCounts = bincode::deserialize(&data)?;
            counts.decrement(reaction_type);

            if counts.is_empty() {
                self.reaction_counts_tree.remove(&key)?;
            } else {
                let new_data = bincode::serialize(&counts)?;
                self.reaction_counts_tree.insert(&key, new_data)?;
            }
        }

        Ok(())
    }

    /// Get aggregated reaction counts for content
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_reaction_counts(
        &self,
        content_id: &ContentId,
    ) -> Result<ReactionCounts, StorageError> {
        let now_ms = crate::crypto::current_timestamp() * 1000;
        self.get_reaction_counts_at(content_id, now_ms)
    }

    /// Reaction counts over the live window as of `now_ms`.
    ///
    /// Counts each (reactor, emoji) at most once and excludes reactions older
    /// than `REACTION_LIFETIME_MS` — so a count is "distinct users currently
    /// keeping this alive with that emoji", and decayed reactions (including
    /// old stacked/flood records) drop off automatically.
    ///
    /// # Errors
    ///
    /// Returns error if a read or deserialize fails.
    pub fn get_reaction_counts_at(
        &self,
        content_id: &ContentId,
        now_ms: u64,
    ) -> Result<ReactionCounts, StorageError> {
        let mut counts = ReactionCounts::new();
        for result in self.reactions_tree.scan_prefix(content_id.0) {
            let (_, data) = result?;
            let reaction: Reaction = bincode::deserialize(&data)?;
            // Normalize the stored timestamp to milliseconds. Legacy reactions were
            // materialized with the action's SECONDS timestamp (~1.7e9), while the
            // window is in ms (~1.7e12); without this every old reaction reads as
            // decayed and counts come back empty. A value below 1e12 can only be
            // seconds (1e12 ms is year 2001), so scale those up.
            let ts_ms = if reaction.timestamp < 1_000_000_000_000 {
                reaction.timestamp.saturating_mul(1000)
            } else {
                reaction.timestamp
            };
            if now_ms.saturating_sub(ts_ms) < REACTION_LIFETIME_MS {
                // The reaction_key is unique per (content, reactor, type), so
                // each live reaction contributes exactly one to its emoji.
                counts.increment(reaction.reaction_type);
            }
        }
        Ok(counts)
    }

    /// Get all reactions for a content item (for detailed view)
    ///
    /// # Errors
    ///
    /// Returns error if read fails.
    pub fn get_all_reactions(&self, content_id: &ContentId) -> Result<Vec<Reaction>, StorageError> {
        let prefix = &content_id.0;
        let mut reactions = Vec::new();

        for result in self.reactions_tree.scan_prefix(prefix) {
            let (_, data) = result?;
            let reaction: Reaction = bincode::deserialize(&data)?;
            reactions.push(reaction);
        }

        Ok(reactions)
    }

    // =========================================================================
    // Stats Methods
    // =========================================================================

    /// Get count of content items
    pub fn len(&self) -> usize {
        self.content_tree.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get count of tombstones
    pub fn tombstone_count(&self) -> usize {
        self.tombstone_tree.len()
    }

    /// Get total storage bytes
    pub fn total_bytes(&self) -> u64 {
        self.total_bytes.load(Ordering::Relaxed)
    }

    /// Get blob store reference
    pub fn blobs(&self) -> &BlobStore {
        &self.blob_store
    }

    /// Flush pending writes to disk
    ///
    /// # Errors
    ///
    /// Returns error if flush fails.
    pub fn flush(&self) -> Result<(), StorageError> {
        self.db.flush()?;
        Ok(())
    }

    /// Iterate over all content IDs
    pub fn iter_ids(&self) -> impl Iterator<Item = Result<ContentId, StorageError>> + '_ {
        self.content_tree.iter().map(|result| {
            result.map_err(StorageError::from).and_then(|(key, _)| {
                let bytes: [u8; 32] =
                    key.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes".to_string(),
                            actual: format!("{} bytes", key.len()),
                        })?;
                Ok(ContentId::from_bytes(bytes))
            })
        })
    }

    /// Iterate over all content items
    pub fn iter_content(&self) -> impl Iterator<Item = Result<ContentItem, StorageError>> + '_ {
        self.content_tree.iter().map(|result| {
            result
                .map_err(StorageError::from)
                .and_then(|(_, data)| bincode::deserialize(&data).map_err(StorageError::from))
        })
    }

    /// Batch insert multiple content items
    ///
    /// # Errors
    ///
    /// Returns error if any insert fails.
    pub fn put_batch(&self, items: &[ContentItem]) -> Result<(), StorageError> {
        let mut batch = sled::Batch::default();
        let mut added_bytes = 0u64;
        let mut children_updates: HashMap<ContentId, Vec<ContentId>> = HashMap::new();

        for content in items {
            let key = content.content_id.0;

            // Check if already exists
            if self.content_tree.contains_key(&key)? {
                return Err(StorageError::SerializationError(format!(
                    "content already exists: {:?}",
                    content.content_id
                )));
            }

            let data = bincode::serialize(content)?;
            added_bytes += (key.len() + data.len()) as u64;

            batch.insert(&key, data);

            // Track children updates
            if let Some(parent_id) = content.parent_id {
                children_updates
                    .entry(parent_id)
                    .or_default()
                    .push(content.content_id);
            }
        }

        self.content_tree.apply_batch(batch)?;
        self.total_bytes.fetch_add(added_bytes, Ordering::Relaxed);

        // Apply children updates
        for (parent_id, new_children) in children_updates {
            for child_id in new_children {
                self.add_child(&parent_id, &child_id)?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::content::{ContentHash, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};
    use tempfile::tempdir;

    fn make_test_content(id: [u8; 32], parent: Option<ContentId>) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: parent,
            created_at: 1_000_000,
            last_engagement: 1_000_000,
            body_inline: Some("Test content".to_string()),
            content_hash: None,
            content_size: None,
            content_type_mime: None,
            media_refs: vec![],
            pin_state: None,
            engagement_count: 0,
            signature: Signature::from_bytes([0u8; 64]),
            pow_nonce: 0,
            pow_difficulty: 0,
            preservation_pow: None,
            display_name: None,
        }
    }

    #[test]
    fn test_put_get() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let content = make_test_content([1u8; 32], None);
        store.put(&content).unwrap();

        let retrieved = store.get(&content.content_id).unwrap().unwrap();
        assert_eq!(retrieved.content_id, content.content_id);
    }

    fn make_reaction(
        content: [u8; 32],
        reactor: [u8; 32],
        rtype: ReactionType,
        timestamp_ms: u64,
    ) -> Reaction {
        Reaction {
            content_id: ContentId::from_bytes(content),
            reactor_id: IdentityId::from_bytes(reactor),
            reaction_type: rtype,
            timestamp: timestamp_ms,
            signature: Signature::from_bytes([0u8; 64]),
        }
    }

    #[test]
    fn same_emoji_cannot_stack_while_live() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();
        let cid = ContentId::from_bytes([9u8; 32]);
        let now = 1_700_000_000_000u64; // realistic ms epoch (heuristic treats <1e12 as legacy seconds)

        // First heart accepted.
        assert!(store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Heart, now),
                now
            )
            .unwrap());
        // Same user, same emoji, still within the 5-day window → rejected, no double count.
        assert!(!store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Heart, now + 1000),
                now + 1000
            )
            .unwrap());

        let counts = store.get_reaction_counts_at(&cid, now + 2000).unwrap();
        assert_eq!(counts.heart, 1, "one user's heart counts once, not twice");
    }

    #[test]
    fn different_emojis_from_same_user_both_count() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();
        let cid = ContentId::from_bytes([9u8; 32]);
        let now = 1_700_000_000_000u64; // realistic ms epoch (heuristic treats <1e12 as legacy seconds)

        assert!(store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Heart, now),
                now
            )
            .unwrap());
        assert!(store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Fire, now),
                now
            )
            .unwrap());

        let counts = store.get_reaction_counts_at(&cid, now).unwrap();
        assert_eq!(counts.heart, 1);
        assert_eq!(counts.fire, 1);
    }

    #[test]
    fn same_emoji_reactable_again_after_decay() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();
        let cid = ContentId::from_bytes([9u8; 32]);
        let now = 1_700_000_000_000u64; // realistic ms epoch (heuristic treats <1e12 as legacy seconds)
        let after = now + REACTION_LIFETIME_MS + 1;

        assert!(store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Heart, now),
                now
            )
            .unwrap());
        // The original reaction has decayed → not counted.
        assert_eq!(store.get_reaction_counts_at(&cid, after).unwrap().heart, 0);
        // And the same emoji may be added again (renew keep-alive).
        assert!(store
            .add_reaction_windowed(
                &make_reaction([9u8; 32], [1u8; 32], ReactionType::Heart, after),
                after
            )
            .unwrap());
        assert_eq!(store.get_reaction_counts_at(&cid, after).unwrap().heart, 1);
    }

    #[test]
    fn distinct_users_each_add_one_to_count() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();
        let cid = ContentId::from_bytes([9u8; 32]);
        let now = 1_700_000_000_000u64; // realistic ms epoch (heuristic treats <1e12 as legacy seconds)

        for u in 1u8..=3 {
            assert!(store
                .add_reaction_windowed(
                    &make_reaction([9u8; 32], [u; 32], ReactionType::Thinking, now),
                    now
                )
                .unwrap());
        }
        assert_eq!(store.get_reaction_counts_at(&cid, now).unwrap().thinking, 3);
    }

    #[test]
    fn test_duplicate_insert_fails() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let content = make_test_content([1u8; 32], None);
        store.put(&content).unwrap();

        let result = store.put(&content);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let content = make_test_content([1u8; 32], None);
        store.put(&content).unwrap();

        assert!(store.delete(&content.content_id).unwrap());
        assert!(store.get(&content.content_id).unwrap().is_none());
    }

    #[test]
    fn test_update() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let mut content = make_test_content([1u8; 32], None);
        store.put(&content).unwrap();

        content.engagement_count = 42;
        store.update(&content).unwrap();

        let retrieved = store.get(&content.content_id).unwrap().unwrap();
        assert_eq!(retrieved.engagement_count, 42);
    }

    #[test]
    fn test_children_index() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let parent = make_test_content([1u8; 32], None);
        let parent_id = parent.content_id;
        store.put(&parent).unwrap();

        let child1 = make_test_content([2u8; 32], Some(parent_id));
        let child2 = make_test_content([3u8; 32], Some(parent_id));
        store.put(&child1).unwrap();
        store.put(&child2).unwrap();

        let children = store.get_children(&parent_id).unwrap();
        assert_eq!(children.len(), 2);

        let child_ids = store.get_child_ids(&parent_id).unwrap();
        assert_eq!(child_ids.len(), 2);
    }

    #[test]
    fn test_tombstone() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let id = ContentId::from_bytes([1u8; 32]);
        let tombstone = Tombstone {
            content_id: id,
            tombstone_time: 2_000_000,
            author_id: IdentityId::from_bytes([1u8; 32]),
            summary_hash: ContentHash::from_bytes([0u8; 32]),
        };

        store.put_tombstone(&tombstone).unwrap();

        let retrieved = store.get_tombstone(&id).unwrap().unwrap();
        assert_eq!(retrieved.tombstone_time, 2_000_000);
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("db");
        let blob_path = dir.path().join("blobs");

        let id;
        {
            let store = PersistentContentStore::open(&db_path, &blob_path).unwrap();
            let content = make_test_content([1u8; 32], None);
            id = content.content_id;
            store.put(&content).unwrap();
            store.flush().unwrap();
        }

        // Reopen
        let store = PersistentContentStore::open(&db_path, &blob_path).unwrap();
        let retrieved = store.get(&id).unwrap();
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_iter() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        for i in 0..10 {
            let content = make_test_content([i; 32], None);
            store.put(&content).unwrap();
        }

        let ids: Vec<_> = store.iter_ids().collect();
        assert_eq!(ids.len(), 10);

        let items: Vec<_> = store.iter_content().collect();
        assert_eq!(items.len(), 10);
    }

    #[test]
    fn test_batch_insert() {
        let dir = tempdir().unwrap();
        let store =
            PersistentContentStore::open(dir.path().join("db"), dir.path().join("blobs")).unwrap();

        let items: Vec<_> = (0..10).map(|i| make_test_content([i; 32], None)).collect();

        store.put_batch(&items).unwrap();
        assert_eq!(store.len(), 10);
    }
}
