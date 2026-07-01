//! Content storage layer (SPEC_02)
//!
//! Provides an abstraction for content storage with support for:
//! - Hash-based content addressing
//! - Parent-child relationship tracking
//! - Tombstone management for deleted content with active children
//! - Storage size estimation

use std::collections::HashMap;

use crate::types::content::{ContentId, ContentItem, Tombstone};
use crate::types::error::ContentError;

/// Estimate storage size for a content item (bytes)
///
/// Approximation: fixed overhead + body + media_refs + optional fields
#[must_use]
pub fn estimate_item_size(content: &ContentItem) -> u64 {
    const FIXED_OVERHEAD: u64 = 200; // IDs, timestamps, signature, etc.
    let body_size = content.body_inline.as_ref().map_or(0, |b| b.len()) as u64;
    // 32 hash + 1 type + 4 size + ~31 avg preview
    let media_size = (content.media_refs.len() * 68) as u64;
    FIXED_OVERHEAD + body_size + media_size
}

/// Trait for content storage backends
pub trait ContentStore {
    /// Store a content item, returning error if already exists
    fn put(&mut self, content: ContentItem) -> Result<(), ContentError>;

    /// Get a content item by ID
    fn get(&self, id: &ContentId) -> Option<&ContentItem>;

    /// Get a mutable reference to a content item
    fn get_mut(&mut self, id: &ContentId) -> Option<&mut ContentItem>;

    /// Delete a content item, returning true if it existed
    fn delete(&mut self, id: &ContentId) -> bool;

    /// Iterate over all content items
    fn iter(&self) -> Box<dyn Iterator<Item = &ContentItem> + '_>;

    /// Get the number of content items
    fn len(&self) -> usize;

    /// Check if storage is empty
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get all children of a parent content item
    fn get_children(&self, parent_id: &ContentId) -> Vec<&ContentItem>;

    /// Store a tombstone for deleted content
    fn put_tombstone(&mut self, tombstone: Tombstone) -> Result<(), ContentError>;

    /// Get a tombstone by content ID
    fn get_tombstone(&self, id: &ContentId) -> Option<&Tombstone>;

    /// Get total storage size in bytes (estimated)
    fn total_storage_bytes(&self) -> u64;
}

/// In-memory content storage implementation
#[derive(Debug, Default)]
pub struct InMemoryContentStore {
    content: HashMap<ContentId, ContentItem>,
    tombstones: HashMap<ContentId, Tombstone>,
    children_index: HashMap<ContentId, Vec<ContentId>>,
    total_bytes: u64,
}

impl InMemoryContentStore {
    /// Create a new empty content store
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the number of tombstones
    #[must_use]
    pub fn tombstone_count(&self) -> usize {
        self.tombstones.len()
    }
}

impl ContentStore for InMemoryContentStore {
    fn put(&mut self, content: ContentItem) -> Result<(), ContentError> {
        if self.content.contains_key(&content.content_id) {
            return Err(ContentError::AlreadyExists(content.content_id));
        }

        let size = estimate_item_size(&content);
        let content_id = content.content_id;

        // Update children index
        if let Some(parent_id) = content.parent_id {
            self.children_index
                .entry(parent_id)
                .or_default()
                .push(content_id);
        }

        self.content.insert(content_id, content);
        self.total_bytes += size;

        Ok(())
    }

    fn get(&self, id: &ContentId) -> Option<&ContentItem> {
        self.content.get(id)
    }

    fn get_mut(&mut self, id: &ContentId) -> Option<&mut ContentItem> {
        self.content.get_mut(id)
    }

    fn delete(&mut self, id: &ContentId) -> bool {
        if let Some(content) = self.content.remove(id) {
            let size = estimate_item_size(&content);
            self.total_bytes = self.total_bytes.saturating_sub(size);

            // Remove from parent's children list
            if let Some(parent_id) = content.parent_id {
                if let Some(children) = self.children_index.get_mut(&parent_id) {
                    children.retain(|c| c != id);
                }
            }

            // Remove our children index entry (orphan children - they keep their parent_id)
            self.children_index.remove(id);

            true
        } else {
            false
        }
    }

    fn iter(&self) -> Box<dyn Iterator<Item = &ContentItem> + '_> {
        Box::new(self.content.values())
    }

    fn len(&self) -> usize {
        self.content.len()
    }

    fn get_children(&self, parent_id: &ContentId) -> Vec<&ContentItem> {
        self.children_index
            .get(parent_id)
            .map(|ids| ids.iter().filter_map(|id| self.content.get(id)).collect())
            .unwrap_or_default()
    }

    fn put_tombstone(&mut self, tombstone: Tombstone) -> Result<(), ContentError> {
        // Tombstones can replace existing tombstones
        self.tombstones.insert(tombstone.content_id, tombstone);
        Ok(())
    }

    fn get_tombstone(&self, id: &ContentId) -> Option<&Tombstone> {
        self.tombstones.get(id)
    }

    fn total_storage_bytes(&self) -> u64 {
        self.total_bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::content::{ContentHash, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

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
    fn test_put_and_get() {
        let mut store = InMemoryContentStore::new();
        let content = make_test_content([1u8; 32], None);
        let id = content.content_id;

        store.put(content.clone()).unwrap();

        let retrieved = store.get(&id).unwrap();
        assert_eq!(retrieved.content_id, id);
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn test_duplicate_insert_fails() {
        let mut store = InMemoryContentStore::new();
        let content = make_test_content([1u8; 32], None);

        store.put(content.clone()).unwrap();
        let result = store.put(content);

        assert!(matches!(result, Err(ContentError::AlreadyExists(_))));
    }

    #[test]
    fn test_delete() {
        let mut store = InMemoryContentStore::new();
        let content = make_test_content([1u8; 32], None);
        let id = content.content_id;

        store.put(content).unwrap();
        assert!(store.delete(&id));
        assert!(store.get(&id).is_none());
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn test_children_index() {
        let mut store = InMemoryContentStore::new();

        let parent = make_test_content([1u8; 32], None);
        let parent_id = parent.content_id;

        let child1 = make_test_content([2u8; 32], Some(parent_id));
        let child2 = make_test_content([3u8; 32], Some(parent_id));

        store.put(parent).unwrap();
        store.put(child1).unwrap();
        store.put(child2).unwrap();

        let children = store.get_children(&parent_id);
        assert_eq!(children.len(), 2);
    }

    #[test]
    fn test_storage_size_tracking() {
        let mut store = InMemoryContentStore::new();

        let content = make_test_content([1u8; 32], None);
        let size = estimate_item_size(&content);

        store.put(content.clone()).unwrap();
        assert_eq!(store.total_storage_bytes(), size);

        store.delete(&content.content_id);
        assert_eq!(store.total_storage_bytes(), 0);
    }

    #[test]
    fn test_estimate_item_size() {
        let mut content = make_test_content([1u8; 32], None);
        content.body_inline = Some("Hello world!".to_string());

        let size = estimate_item_size(&content);
        // 200 base + 12 bytes body = 212
        assert_eq!(size, 212);
    }

    #[test]
    fn test_tombstone() {
        let mut store = InMemoryContentStore::new();
        let id = ContentId::from_bytes([1u8; 32]);

        let tombstone = Tombstone {
            content_id: id,
            tombstone_time: 2_000_000,
            author_id: IdentityId::from_bytes([1u8; 32]),
            summary_hash: ContentHash::from_bytes([0u8; 32]),
        };

        store.put_tombstone(tombstone.clone()).unwrap();

        let retrieved = store.get_tombstone(&id).unwrap();
        assert_eq!(retrieved.tombstone_time, 2_000_000);
    }
}
