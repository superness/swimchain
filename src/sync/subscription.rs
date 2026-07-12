//! Branch Subscription Management (BRANCH_SELECTIVE_SYNC.md §5.4)
//!
//! Manages which branches a node is subscribed to for selective sync.
//! This enables nodes to stay within storage budgets by only syncing
//! the branches they care about.
//!
//! # Key Features
//!
//! - **Subscription tracking**: Track which (space_id, branch_path) pairs are subscribed
//! - **Storage budget**: Enforce maximum storage usage across all subscriptions
//! - **LRU hotswap**: Automatically unload least-recently-used branches when over budget
//! - **Persistence**: Subscription state can be persisted and restored
//!
//! # Example
//!
//! ```no_run
//! use swimchain::sync::subscription::BranchSubscriptionManager;
//! use swimchain::blocks::BranchPath;
//!
//! let mut manager = BranchSubscriptionManager::new(400 * 1024 * 1024); // 400MB budget
//!
//! let space_id = [0u8; 32];
//! let branch = BranchPath::root();
//!
//! // Subscribe to a branch
//! manager.subscribe(space_id, branch.clone());
//!
//! // Check subscription
//! assert!(manager.is_subscribed(&space_id, &branch));
//! ```

use crate::blocks::BranchPath;
use crate::types::constants::{
    DEFAULT_BRANCH_STORAGE_BUDGET, MAX_BRANCH_SUBSCRIPTIONS, MIN_BRANCH_STORAGE_BUDGET,
};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

/// A unique identifier for a branch: (space_id, branch_path)
pub type BranchId = ([u8; 32], BranchPath);

/// Subscription entry with metadata
#[derive(Debug, Clone)]
pub struct SubscriptionEntry {
    /// Space ID this subscription is for
    pub space_id: [u8; 32],
    /// Branch path within the space
    pub branch_path: BranchPath,
    /// When this subscription was created
    pub subscribed_at: u64,
    /// Last time this branch was accessed
    pub last_access: u64,
    /// Current storage usage for this branch (bytes)
    pub storage_bytes: u64,
    /// Last synced block height for this branch
    pub last_synced_height: u64,
    /// Number of content items synced
    pub content_count: u32,
}

impl SubscriptionEntry {
    /// Create a new subscription entry
    pub fn new(space_id: [u8; 32], branch_path: BranchPath) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            space_id,
            branch_path,
            subscribed_at: now,
            last_access: now,
            storage_bytes: 0,
            last_synced_height: 0,
            content_count: 0,
        }
    }

    /// Update the last access time to now
    pub fn touch(&mut self) {
        self.last_access = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }

    /// Get the branch identifier
    pub fn branch_id(&self) -> BranchId {
        (self.space_id, self.branch_path.clone())
    }
}

/// Manager for branch subscriptions with storage budget enforcement
#[derive(Debug)]
pub struct BranchSubscriptionManager {
    /// Active subscriptions keyed by (space_id, branch_path)
    subscriptions: HashMap<[u8; 32], HashMap<Vec<u8>, SubscriptionEntry>>,

    /// Quick lookup set for subscription checks
    subscription_set: HashSet<([u8; 32], Vec<u8>)>,

    /// Maximum storage budget in bytes
    max_storage_bytes: u64,

    /// Current total storage usage in bytes
    current_storage_bytes: u64,

    /// Total subscription count
    subscription_count: usize,
}

impl Default for BranchSubscriptionManager {
    fn default() -> Self {
        Self::new(DEFAULT_BRANCH_STORAGE_BUDGET)
    }
}

impl BranchSubscriptionManager {
    /// Create a new subscription manager with the given storage budget
    pub fn new(max_storage_bytes: u64) -> Self {
        Self {
            subscriptions: HashMap::new(),
            subscription_set: HashSet::new(),
            max_storage_bytes: max_storage_bytes.max(MIN_BRANCH_STORAGE_BUDGET),
            current_storage_bytes: 0,
            subscription_count: 0,
        }
    }

    /// Subscribe to a branch
    ///
    /// Returns `true` if subscription was added, `false` if already subscribed
    /// or at max subscription limit.
    pub fn subscribe(&mut self, space_id: [u8; 32], branch_path: BranchPath) -> bool {
        let path_key = branch_path.serialize();

        // Check if already subscribed
        if self
            .subscription_set
            .contains(&(space_id, path_key.clone()))
        {
            // Touch to update last access time
            if let Some(space_subs) = self.subscriptions.get_mut(&space_id) {
                if let Some(entry) = space_subs.get_mut(&path_key) {
                    entry.touch();
                }
            }
            return false;
        }

        // Check subscription limit
        if self.subscription_count >= MAX_BRANCH_SUBSCRIPTIONS {
            return false;
        }

        // Add subscription
        let entry = SubscriptionEntry::new(space_id, branch_path);
        self.subscriptions
            .entry(space_id)
            .or_default()
            .insert(path_key.clone(), entry);
        self.subscription_set.insert((space_id, path_key));
        self.subscription_count += 1;

        true
    }

    /// Unsubscribe from a branch
    ///
    /// Returns `true` if subscription was removed, `false` if not subscribed.
    pub fn unsubscribe(&mut self, space_id: &[u8; 32], branch_path: &BranchPath) -> bool {
        let path_key = branch_path.serialize();

        if !self.subscription_set.remove(&(*space_id, path_key.clone())) {
            return false;
        }

        if let Some(space_subs) = self.subscriptions.get_mut(space_id) {
            if let Some(entry) = space_subs.remove(&path_key) {
                self.current_storage_bytes = self
                    .current_storage_bytes
                    .saturating_sub(entry.storage_bytes);
                self.subscription_count = self.subscription_count.saturating_sub(1);

                // Clean up empty space entry
                if space_subs.is_empty() {
                    self.subscriptions.remove(space_id);
                }
                return true;
            }
        }

        false
    }

    /// Check if subscribed to a branch
    pub fn is_subscribed(&self, space_id: &[u8; 32], branch_path: &BranchPath) -> bool {
        let path_key = branch_path.serialize();
        self.subscription_set.contains(&(*space_id, path_key))
    }

    /// Get subscription entry for a branch (if subscribed)
    pub fn get_subscription(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Option<&SubscriptionEntry> {
        let path_key = branch_path.serialize();
        self.subscriptions
            .get(space_id)
            .and_then(|space_subs| space_subs.get(&path_key))
    }

    /// Get mutable subscription entry for a branch
    pub fn get_subscription_mut(
        &mut self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Option<&mut SubscriptionEntry> {
        let path_key = branch_path.serialize();
        self.subscriptions
            .get_mut(space_id)
            .and_then(|space_subs| space_subs.get_mut(&path_key))
    }

    /// Touch a subscription to update its last access time
    pub fn touch(&mut self, space_id: &[u8; 32], branch_path: &BranchPath) {
        if let Some(entry) = self.get_subscription_mut(space_id, branch_path) {
            entry.touch();
        }
    }

    /// Update storage usage for a branch
    ///
    /// Returns the new total storage usage.
    pub fn update_storage(
        &mut self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        new_storage_bytes: u64,
    ) -> u64 {
        let path_key = branch_path.serialize();

        // Get old storage value first
        let old_storage = self
            .subscriptions
            .get(space_id)
            .and_then(|space_subs| space_subs.get(&path_key))
            .map(|e| e.storage_bytes)
            .unwrap_or(0);

        // Update the entry's storage
        if let Some(space_subs) = self.subscriptions.get_mut(space_id) {
            if let Some(entry) = space_subs.get_mut(&path_key) {
                entry.storage_bytes = new_storage_bytes;
            }
        }

        // Adjust total storage
        self.current_storage_bytes = self
            .current_storage_bytes
            .saturating_sub(old_storage)
            .saturating_add(new_storage_bytes);

        self.current_storage_bytes
    }

    /// Update sync progress for a branch
    pub fn update_sync_progress(
        &mut self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        height: u64,
        content_count: u32,
    ) {
        if let Some(entry) = self.get_subscription_mut(space_id, branch_path) {
            entry.last_synced_height = height;
            entry.content_count = content_count;
            entry.touch();
        }
    }

    /// Get all subscriptions for a space
    pub fn subscriptions_for_space(&self, space_id: &[u8; 32]) -> Vec<&SubscriptionEntry> {
        self.subscriptions
            .get(space_id)
            .map(|space_subs| space_subs.values().collect())
            .unwrap_or_default()
    }

    /// Get all subscriptions
    pub fn all_subscriptions(&self) -> Vec<&SubscriptionEntry> {
        self.subscriptions
            .values()
            .flat_map(|space_subs| space_subs.values())
            .collect()
    }

    /// Get list of (space_id, branch_path) pairs for all subscriptions
    pub fn subscription_list(&self) -> Vec<BranchId> {
        self.all_subscriptions()
            .into_iter()
            .map(|e| e.branch_id())
            .collect()
    }

    /// Get current storage usage
    pub fn current_storage(&self) -> u64 {
        self.current_storage_bytes
    }

    /// Get storage budget
    pub fn storage_budget(&self) -> u64 {
        self.max_storage_bytes
    }

    /// Get available storage
    pub fn available_storage(&self) -> u64 {
        self.max_storage_bytes
            .saturating_sub(self.current_storage_bytes)
    }

    /// Check if over storage budget
    pub fn is_over_budget(&self) -> bool {
        self.current_storage_bytes > self.max_storage_bytes
    }

    /// Get subscription count
    pub fn subscription_count(&self) -> usize {
        self.subscription_count
    }

    /// Make room for new content by unloading LRU branches
    ///
    /// Returns the list of branches that were unsubscribed.
    pub fn make_room(&mut self, needed_bytes: u64) -> Vec<BranchId> {
        let mut unsubscribed = Vec::new();

        // Calculate how much we need to free
        let target = self.current_storage_bytes.saturating_add(needed_bytes);
        if target <= self.max_storage_bytes {
            return unsubscribed;
        }

        let need_to_free = target - self.max_storage_bytes;
        let mut freed = 0u64;

        // Get all subscriptions sorted by last_access (oldest first)
        let mut entries: Vec<_> = self
            .all_subscriptions()
            .into_iter()
            .map(|e| {
                (
                    e.space_id,
                    e.branch_path.clone(),
                    e.last_access,
                    e.storage_bytes,
                )
            })
            .collect();
        entries.sort_by_key(|(_, _, last_access, _)| *last_access);

        // Unsubscribe oldest until we've freed enough
        for (space_id, branch_path, _, storage) in entries {
            if freed >= need_to_free {
                break;
            }

            if self.unsubscribe(&space_id, &branch_path) {
                freed += storage;
                unsubscribed.push((space_id, branch_path));
            }
        }

        unsubscribed
    }

    /// Find branches that haven't been accessed recently
    ///
    /// Returns branches not accessed within `inactive_threshold_secs`.
    pub fn find_inactive_branches(&self, inactive_threshold_secs: u64) -> Vec<BranchId> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let cutoff = now.saturating_sub(inactive_threshold_secs);

        self.all_subscriptions()
            .into_iter()
            .filter(|e| e.last_access < cutoff)
            .map(|e| e.branch_id())
            .collect()
    }

    /// Serialize subscriptions for persistence
    ///
    /// Format: [count(4)] || [entries...]
    /// Each entry: [space_id(32)] || [branch_path_len(2)] || [branch_path] ||
    ///             [subscribed_at(8)] || [last_access(8)] || [storage(8)] ||
    ///             [height(8)] || [content_count(4)]
    pub fn serialize(&self) -> Vec<u8> {
        let entries = self.all_subscriptions();
        let count = entries.len() as u32;

        let mut buf = Vec::with_capacity(4 + entries.len() * 100);
        buf.extend_from_slice(&count.to_le_bytes());

        for entry in entries {
            buf.extend_from_slice(&entry.space_id);

            let path_bytes = entry.branch_path.serialize();
            buf.extend_from_slice(&(path_bytes.len() as u16).to_le_bytes());
            buf.extend_from_slice(&path_bytes);

            buf.extend_from_slice(&entry.subscribed_at.to_le_bytes());
            buf.extend_from_slice(&entry.last_access.to_le_bytes());
            buf.extend_from_slice(&entry.storage_bytes.to_le_bytes());
            buf.extend_from_slice(&entry.last_synced_height.to_le_bytes());
            buf.extend_from_slice(&entry.content_count.to_le_bytes());
        }

        buf
    }

    /// Deserialize subscriptions from persisted data
    pub fn deserialize(data: &[u8], max_storage_bytes: u64) -> Option<Self> {
        if data.len() < 4 {
            return None;
        }

        let count = u32::from_le_bytes(data[0..4].try_into().ok()?) as usize;
        let mut offset = 4;

        let mut manager = Self::new(max_storage_bytes);

        for _ in 0..count {
            if offset + 32 + 2 > data.len() {
                return None;
            }

            let space_id: [u8; 32] = data[offset..offset + 32].try_into().ok()?;
            offset += 32;

            let path_len = u16::from_le_bytes(data[offset..offset + 2].try_into().ok()?) as usize;
            offset += 2;

            if offset + path_len + 36 > data.len() {
                return None;
            }

            let branch_path = BranchPath::deserialize(&data[offset..offset + path_len])?;
            offset += path_len;

            let subscribed_at = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
            offset += 8;

            let last_access = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
            offset += 8;

            let storage_bytes = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
            offset += 8;

            let last_synced_height = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
            offset += 8;

            let content_count = u32::from_le_bytes(data[offset..offset + 4].try_into().ok()?);
            offset += 4;

            // Create entry with restored metadata
            let path_key = branch_path.serialize();
            let entry = SubscriptionEntry {
                space_id,
                branch_path,
                subscribed_at,
                last_access,
                storage_bytes,
                last_synced_height,
                content_count,
            };

            manager
                .subscriptions
                .entry(space_id)
                .or_default()
                .insert(path_key.clone(), entry);
            manager.subscription_set.insert((space_id, path_key));
            manager.subscription_count += 1;
            manager.current_storage_bytes += storage_bytes;
        }

        Some(manager)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::BranchDirection;

    fn make_space_id(n: u8) -> [u8; 32] {
        let mut id = [0u8; 32];
        id[0] = n;
        id
    }

    #[test]
    fn test_subscribe_unsubscribe() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space_id = make_space_id(1);
        let branch = BranchPath::root();

        // Subscribe
        assert!(manager.subscribe(space_id, branch.clone()));
        assert!(manager.is_subscribed(&space_id, &branch));
        assert_eq!(manager.subscription_count(), 1);

        // Duplicate subscribe returns false
        assert!(!manager.subscribe(space_id, branch.clone()));
        assert_eq!(manager.subscription_count(), 1);

        // Unsubscribe
        assert!(manager.unsubscribe(&space_id, &branch));
        assert!(!manager.is_subscribed(&space_id, &branch));
        assert_eq!(manager.subscription_count(), 0);

        // Duplicate unsubscribe returns false
        assert!(!manager.unsubscribe(&space_id, &branch));
    }

    #[test]
    fn test_multiple_branches_per_space() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space_id = make_space_id(1);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);
        let right = root.branch(BranchDirection::Right);

        manager.subscribe(space_id, root.clone());
        manager.subscribe(space_id, left.clone());
        manager.subscribe(space_id, right.clone());

        assert_eq!(manager.subscription_count(), 3);
        assert_eq!(manager.subscriptions_for_space(&space_id).len(), 3);

        // Unsubscribe one
        manager.unsubscribe(&space_id, &left);
        assert_eq!(manager.subscription_count(), 2);
        assert!(!manager.is_subscribed(&space_id, &left));
        assert!(manager.is_subscribed(&space_id, &root));
        assert!(manager.is_subscribed(&space_id, &right));
    }

    #[test]
    fn test_multiple_spaces() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let branch = BranchPath::root();

        manager.subscribe(space1, branch.clone());
        manager.subscribe(space2, branch.clone());

        assert_eq!(manager.subscription_count(), 2);
        assert!(manager.is_subscribed(&space1, &branch));
        assert!(manager.is_subscribed(&space2, &branch));
    }

    #[test]
    fn test_storage_tracking() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space_id = make_space_id(1);
        let branch = BranchPath::root();

        manager.subscribe(space_id, branch.clone());
        assert_eq!(manager.current_storage(), 0);

        // Update storage
        manager.update_storage(&space_id, &branch, 10 * 1024 * 1024);
        assert_eq!(manager.current_storage(), 10 * 1024 * 1024);
        assert_eq!(manager.available_storage(), 90 * 1024 * 1024);

        // Update again
        manager.update_storage(&space_id, &branch, 20 * 1024 * 1024);
        assert_eq!(manager.current_storage(), 20 * 1024 * 1024);

        // Unsubscribe decreases storage
        manager.unsubscribe(&space_id, &branch);
        assert_eq!(manager.current_storage(), 0);
    }

    #[test]
    fn test_make_room_lru() {
        let mut manager = BranchSubscriptionManager::new(50 * 1024 * 1024); // 50MB budget

        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let space3 = make_space_id(3);
        let branch = BranchPath::root();

        // Subscribe in order (1, 2, 3)
        manager.subscribe(space1, branch.clone());
        manager.subscribe(space2, branch.clone());
        manager.subscribe(space3, branch.clone());

        // Set storage (each 20MB)
        manager.update_storage(&space1, &branch, 20 * 1024 * 1024);
        manager.update_storage(&space2, &branch, 20 * 1024 * 1024);
        manager.update_storage(&space3, &branch, 20 * 1024 * 1024);

        // Currently at 60MB, over budget by 10MB
        assert!(manager.is_over_budget());

        // Touch space2 to make it most recently used
        std::thread::sleep(std::time::Duration::from_millis(10));
        manager.touch(&space2, &branch);

        // Make room for 10MB more (need to free 20MB since we're already 10MB over)
        let unsubscribed = manager.make_room(10 * 1024 * 1024);

        // Should have unsubscribed the oldest (space1 or space3)
        assert!(!unsubscribed.is_empty());

        // space2 should still be subscribed (most recently accessed)
        assert!(manager.is_subscribed(&space2, &branch));
    }

    #[test]
    fn test_serialize_deserialize() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);

        manager.subscribe(space1, root.clone());
        manager.subscribe(space2, left.clone());

        manager.update_storage(&space1, &root, 10 * 1024 * 1024);
        manager.update_sync_progress(&space1, &root, 100, 500);

        // Serialize
        let data = manager.serialize();

        // Deserialize
        let restored = BranchSubscriptionManager::deserialize(&data, 100 * 1024 * 1024).unwrap();

        assert_eq!(restored.subscription_count(), 2);
        assert!(restored.is_subscribed(&space1, &root));
        assert!(restored.is_subscribed(&space2, &left));

        let entry = restored.get_subscription(&space1, &root).unwrap();
        assert_eq!(entry.storage_bytes, 10 * 1024 * 1024);
        assert_eq!(entry.last_synced_height, 100);
        assert_eq!(entry.content_count, 500);
    }

    #[test]
    fn test_subscription_limit() {
        let mut manager = BranchSubscriptionManager::new(1024 * 1024 * 1024); // 1GB

        // Subscribe up to the limit
        for i in 0..MAX_BRANCH_SUBSCRIPTIONS {
            let space_id = make_space_id(i as u8);
            assert!(manager.subscribe(space_id, BranchPath::root()));
        }

        // One more should fail
        let space_id = make_space_id(255);
        assert!(!manager.subscribe(space_id, BranchPath::root()));
    }

    #[test]
    fn test_find_inactive_branches() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let branch = BranchPath::root();

        manager.subscribe(space1, branch.clone());
        manager.subscribe(space2, branch.clone());

        // Both should be active (just subscribed)
        let inactive = manager.find_inactive_branches(1);
        assert!(inactive.is_empty());

        // With 0 threshold, all should be "inactive"
        let inactive = manager.find_inactive_branches(0);
        assert_eq!(inactive.len(), 2);
    }

    #[test]
    fn test_subscription_list() {
        let mut manager = BranchSubscriptionManager::new(100 * 1024 * 1024);

        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);

        manager.subscribe(space1, root.clone());
        manager.subscribe(space2, left.clone());

        let list = manager.subscription_list();
        assert_eq!(list.len(), 2);
    }
}
