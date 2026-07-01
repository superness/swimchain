//! Content pruning system (SPEC_02 §6)
//!
//! Removes decayed content while preserving thread coherence:
//! - Content with active children becomes a tombstone
//! - Content without active children is fully deleted
//! - Grace period (24h) before pruning after decay

use sha2::{Digest, Sha256};

use crate::content::decay::calculate_decay_state;
use crate::content::storage::ContentStore;
use crate::types::constants::PRUNE_GRACE_PERIOD_MS;
use crate::types::content::{ContentHash, ContentId, Tombstone};

/// Statistics from a prune operation
#[derive(Debug, Default, Clone)]
pub struct PruneStats {
    /// Number of items checked
    pub items_checked: usize,
    /// Number of items pruned (deleted or tombstoned)
    pub items_pruned: usize,
    /// Number of tombstones created (subset of items_pruned)
    pub tombstones_created: usize,
    /// Bytes freed by pruning
    pub bytes_freed: u64,
}

/// Prune decayed content from storage
///
/// Content is pruned if:
/// 1. It is decayed (survival_probability < DECAY_THRESHOLD)
/// 2. It is not protected (not pinned, not in floor period)
/// 3. Grace period (24h) has passed since decay
///
/// If decayed content has active children, a tombstone is created instead
/// of full deletion to preserve thread coherence.
///
/// # Arguments
/// * `storage` - Mutable reference to content storage
/// * `current_time_ms` - Current time in milliseconds
/// * `half_life_secs` - Current adaptive half-life
///
/// # Returns
/// Statistics about the prune operation
pub fn prune_decayed_content<S: ContentStore>(
    storage: &mut S,
    current_time_ms: u64,
    half_life_secs: u64,
) -> PruneStats {
    let mut stats = PruneStats::default();
    let mut to_prune: Vec<ContentId> = Vec::new();
    let mut to_tombstone: Vec<(ContentId, Tombstone)> = Vec::new();

    // First pass: identify decayed content
    for content in storage.iter() {
        stats.items_checked += 1;
        let decay_state = calculate_decay_state(content, current_time_ms, half_life_secs);

        if decay_state.is_decayed && !decay_state.is_protected {
            // Check grace period (24h after decay)
            // Use time since last engagement as proxy for when decay happened
            let time_since_engagement_ms = current_time_ms.saturating_sub(content.last_engagement);

            // Content decays after effective_decay_time > ~4 half-lives
            // Add grace period on top of that
            if time_since_engagement_ms < PRUNE_GRACE_PERIOD_MS {
                continue; // Within grace period
            }

            // Check for non-decayed children
            let has_active_children = has_non_decayed_children(
                storage,
                &content.content_id,
                current_time_ms,
                half_life_secs,
            );

            if has_active_children {
                // Create tombstone instead of full delete
                let tombstone = Tombstone {
                    content_id: content.content_id,
                    tombstone_time: current_time_ms,
                    author_id: content.author_id.clone(),
                    summary_hash: compute_summary_hash(content.body_inline.as_deref()),
                };
                to_tombstone.push((content.content_id, tombstone));
            } else {
                to_prune.push(content.content_id);
            }
        }
    }

    // Second pass: execute deletions
    for id in to_prune {
        if storage.delete(&id) {
            stats.items_pruned += 1;
        }
    }

    for (id, tombstone) in to_tombstone {
        if storage.delete(&id) {
            let _ = storage.put_tombstone(tombstone);
            stats.items_pruned += 1;
            stats.tombstones_created += 1;
        }
    }

    stats
}

/// Check if content has non-decayed children (recursive)
fn has_non_decayed_children<S: ContentStore>(
    storage: &S,
    parent_id: &ContentId,
    current_time_ms: u64,
    half_life_secs: u64,
) -> bool {
    for child in storage.get_children(parent_id) {
        let decay_state = calculate_decay_state(child, current_time_ms, half_life_secs);
        if !decay_state.is_decayed {
            return true;
        }
        // Recursively check grandchildren
        if has_non_decayed_children(storage, &child.content_id, current_time_ms, half_life_secs) {
            return true;
        }
    }
    false
}

/// Compute summary hash (first 256 bytes of body)
fn compute_summary_hash(body: Option<&str>) -> ContentHash {
    let mut hasher = Sha256::new();
    if let Some(body) = body {
        let bytes = body.as_bytes();
        let summary = &bytes[..bytes.len().min(256)];
        hasher.update(summary);
    }
    ContentHash::from_bytes(hasher.finalize().into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::storage::InMemoryContentStore;
    use crate::types::constants::HALF_LIFE_SECS;
    use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

    fn make_test_content(
        id: [u8; 32],
        parent: Option<ContentId>,
        created_at_ms: u64,
        last_engagement_ms: u64,
    ) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes(id),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: parent,
            created_at: created_at_ms,
            last_engagement: last_engagement_ms,
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
    fn test_prune_removes_decayed_no_children() {
        let mut store = InMemoryContentStore::new();

        // Content from 60 days ago, never engaged
        let old_time = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

        let content = make_test_content([1u8; 32], None, old_time, old_time);
        store.put(content).unwrap();

        let stats = prune_decayed_content(&mut store, current_time, HALF_LIFE_SECS);

        assert_eq!(stats.items_checked, 1);
        assert_eq!(stats.items_pruned, 1);
        assert_eq!(stats.tombstones_created, 0);
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn test_tombstone_for_parent_with_active_child() {
        let mut store = InMemoryContentStore::new();

        // Parent from 60 days ago (decayed)
        let old_time = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

        let parent = make_test_content([1u8; 32], None, old_time, old_time);
        let parent_id = parent.content_id;

        // Child from 1 day ago (active, within floor)
        let child_time = current_time - 24 * 60 * 60 * 1000;
        let child = make_test_content([2u8; 32], Some(parent_id), child_time, child_time);

        store.put(parent).unwrap();
        store.put(child).unwrap();

        let stats = prune_decayed_content(&mut store, current_time, HALF_LIFE_SECS);

        assert_eq!(stats.items_checked, 2);
        assert_eq!(stats.items_pruned, 1);
        assert_eq!(stats.tombstones_created, 1);

        // Child should still exist
        assert_eq!(store.len(), 1);
        // Tombstone should exist
        assert!(store.get_tombstone(&parent_id).is_some());
    }

    #[test]
    fn test_protected_content_not_pruned() {
        let mut store = InMemoryContentStore::new();

        // Content from 1 day ago (within floor protection)
        let current_time = 100_000_000_u64;
        let created_time = current_time - 24 * 60 * 60 * 1000; // 1 day ago

        let content = make_test_content([1u8; 32], None, created_time, created_time);
        store.put(content).unwrap();

        let stats = prune_decayed_content(&mut store, current_time, HALF_LIFE_SECS);

        assert_eq!(stats.items_checked, 1);
        assert_eq!(stats.items_pruned, 0);
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn test_grace_period_protection() {
        let mut store = InMemoryContentStore::new();

        // Content that's barely decayed (just past threshold)
        // Created 35 days ago, engaged 35 days ago
        // Effective decay = 33 days = 2,851,200 seconds
        // Half-lives = 2,851,200 / 604,800 = 4.71
        // Survival = 0.5^4.71 ≈ 0.038 < 0.0625 (decayed)
        // But grace period is 24h from last engagement

        let base_time = 0_u64;
        let current_time = 35 * 24 * 60 * 60 * 1000; // 35 days in ms

        // Last engagement 1 hour ago (within grace period)
        let engagement_time = current_time - 60 * 60 * 1000;

        let content = make_test_content([1u8; 32], None, base_time, engagement_time);
        store.put(content).unwrap();

        let stats = prune_decayed_content(&mut store, current_time, HALF_LIFE_SECS);

        // Should not be pruned due to grace period
        assert_eq!(stats.items_pruned, 0);
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn test_compute_summary_hash() {
        let hash1 = compute_summary_hash(Some("Hello, World!"));
        let hash2 = compute_summary_hash(Some("Hello, World!"));
        let hash3 = compute_summary_hash(Some("Different content"));

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_compute_summary_hash_empty() {
        let hash = compute_summary_hash(None);
        // Should be hash of empty input
        assert_ne!(hash.0, [0u8; 32]);
    }

    #[test]
    fn test_recursive_child_check() {
        let mut store = InMemoryContentStore::new();

        let old_time = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000; // 60 days

        // Grandparent (decayed)
        let grandparent = make_test_content([1u8; 32], None, old_time, old_time);
        let grandparent_id = grandparent.content_id;

        // Parent (decayed)
        let parent = make_test_content([2u8; 32], Some(grandparent_id), old_time, old_time);
        let parent_id = parent.content_id;

        // Grandchild (active, within floor)
        let child_time = current_time - 24 * 60 * 60 * 1000;
        let grandchild = make_test_content([3u8; 32], Some(parent_id), child_time, child_time);

        store.put(grandparent).unwrap();
        store.put(parent).unwrap();
        store.put(grandchild).unwrap();

        let stats = prune_decayed_content(&mut store, current_time, HALF_LIFE_SECS);

        // Grandparent and parent should be tombstoned (have active descendant)
        assert_eq!(stats.items_pruned, 2);
        assert_eq!(stats.tombstones_created, 2);
        assert_eq!(store.len(), 1); // Only grandchild remains

        assert!(store.get_tombstone(&grandparent_id).is_some());
        assert!(store.get_tombstone(&parent_id).is_some());
    }
}
