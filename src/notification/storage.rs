//! Notification storage using sled database
//!
//! Provides persistent storage for notifications with 30-day expiry.
//! Key format enables efficient range scans per identity.

use sled::{Db, Tree};

use super::error::NotificationError;
use super::types::{Notification, NotificationId};

/// Sled tree name for notification storage.
pub const NOTIFICATIONS_TREE: &str = "notifications";

/// Expiry time for old notifications (30 days in milliseconds).
pub const NOTIFICATION_EXPIRY_MS: u64 = 30 * 24 * 60 * 60 * 1000;

/// Maximum notifications to store per identity.
const MAX_NOTIFICATIONS_PER_IDENTITY: usize = 100;

/// Persistent storage for notifications.
///
/// Stores notifications per identity with automatic expiry.
/// Key format: identity[32] + created_at_ms[8 BE] + notification_id[16] = 56 bytes
/// Big-endian timestamp enables efficient range scans for newest-first ordering.
pub struct NotificationStore {
    tree: Tree,
}

impl NotificationStore {
    /// Create a new notification store using the given sled database.
    ///
    /// Opens or creates the "notifications" tree.
    pub fn new(db: &Db) -> Result<Self, NotificationError> {
        let tree = db.open_tree(NOTIFICATIONS_TREE)?;
        Ok(Self { tree })
    }

    /// Build a storage key from components.
    fn make_key(identity: &[u8; 32], created_at_ms: u64, notification_id: &NotificationId) -> [u8; 56] {
        let mut key = [0u8; 56];
        key[0..32].copy_from_slice(identity);
        // Use big-endian for natural ordering (newest first when reversed)
        key[32..40].copy_from_slice(&created_at_ms.to_be_bytes());
        key[40..56].copy_from_slice(notification_id);
        key
    }

    /// Build a prefix for scanning an identity's notifications.
    fn make_prefix(identity: &[u8; 32]) -> [u8; 32] {
        *identity
    }

    /// Store a notification.
    ///
    /// Returns the notification ID.
    pub fn store(
        &self,
        identity: &[u8; 32],
        notification: &Notification,
    ) -> Result<NotificationId, NotificationError> {
        let key = Self::make_key(identity, notification.created_at_ms, &notification.id);
        let value = bincode::serialize(notification)?;
        self.tree.insert(&key, value)?;
        self.tree.flush()?;
        Ok(notification.id)
    }

    /// Get unread notifications for an identity (newest first).
    ///
    /// Returns up to `limit` notifications.
    pub fn get_unread(
        &self,
        identity: &[u8; 32],
        limit: usize,
    ) -> Result<Vec<Notification>, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let mut notifications = Vec::new();

        // Iterate in reverse (newest first due to BE timestamp)
        for result in self.tree.scan_prefix(&prefix).rev() {
            let (_, value) = result?;
            let notification: Notification = bincode::deserialize(&value)?;

            if !notification.read {
                notifications.push(notification);
                if notifications.len() >= limit {
                    break;
                }
            }
        }

        Ok(notifications)
    }

    /// Get all notifications for an identity (newest first).
    ///
    /// Returns up to `limit` notifications, including read ones.
    pub fn get_all(
        &self,
        identity: &[u8; 32],
        limit: usize,
    ) -> Result<Vec<Notification>, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let mut notifications = Vec::new();

        for result in self.tree.scan_prefix(&prefix).rev() {
            let (_, value) = result?;
            let notification: Notification = bincode::deserialize(&value)?;
            notifications.push(notification);
            if notifications.len() >= limit {
                break;
            }
        }

        Ok(notifications)
    }

    /// Mark a notification as read.
    ///
    /// Returns true if the notification was found and updated.
    pub fn mark_read(
        &self,
        identity: &[u8; 32],
        notification_id: NotificationId,
    ) -> Result<bool, NotificationError> {
        let prefix = Self::make_prefix(identity);

        // Find the notification
        for result in self.tree.scan_prefix(&prefix) {
            let (key, value) = result?;
            let mut notification: Notification = bincode::deserialize(&value)?;

            if notification.id == notification_id {
                notification.read = true;
                let updated = bincode::serialize(&notification)?;
                self.tree.insert(&key, updated)?;
                self.tree.flush()?;
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Mark all notifications as read for an identity.
    ///
    /// Returns the count of notifications marked read.
    pub fn mark_all_read(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let mut count = 0;

        for result in self.tree.scan_prefix(&prefix) {
            let (key, value) = result?;
            let mut notification: Notification = bincode::deserialize(&value)?;

            if !notification.read {
                notification.read = true;
                let updated = bincode::serialize(&notification)?;
                self.tree.insert(&key, updated)?;
                count += 1;
            }
        }

        if count > 0 {
            self.tree.flush()?;
        }

        Ok(count)
    }

    /// Clear all notifications for an identity.
    ///
    /// Returns the count of notifications removed.
    pub fn clear(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let mut count = 0;

        // Collect keys to remove
        let keys: Vec<_> = self
            .tree
            .scan_prefix(&prefix)
            .filter_map(|r| r.ok().map(|(k, _)| k))
            .collect();

        for key in keys {
            self.tree.remove(&key)?;
            count += 1;
        }

        if count > 0 {
            self.tree.flush()?;
        }

        Ok(count)
    }

    /// Prune expired notifications for an identity.
    ///
    /// Removes notifications older than 30 days.
    /// Returns the count of notifications pruned.
    pub fn prune_expired_for_identity(
        &self,
        identity: &[u8; 32],
        now_ms: u64,
    ) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let cutoff = now_ms.saturating_sub(NOTIFICATION_EXPIRY_MS);
        let mut count = 0;

        // Collect expired keys
        let expired_keys: Vec<_> = self
            .tree
            .scan_prefix(&prefix)
            .filter_map(|r| {
                let (key, value) = r.ok()?;
                let notification: Notification = bincode::deserialize(&value).ok()?;
                if notification.created_at_ms < cutoff {
                    Some(key)
                } else {
                    None
                }
            })
            .collect();

        for key in expired_keys {
            self.tree.remove(&key)?;
            count += 1;
        }

        if count > 0 {
            self.tree.flush()?;
        }

        Ok(count)
    }

    /// Prune old notifications to stay under per-identity limit.
    ///
    /// Keeps the newest MAX_NOTIFICATIONS_PER_IDENTITY notifications.
    /// Returns the count of notifications pruned.
    pub fn prune_overflow(
        &self,
        identity: &[u8; 32],
    ) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);

        // Collect all keys (oldest to newest due to BE timestamp)
        let keys: Vec<_> = self
            .tree
            .scan_prefix(&prefix)
            .filter_map(|r| r.ok().map(|(k, _)| k))
            .collect();

        if keys.len() <= MAX_NOTIFICATIONS_PER_IDENTITY {
            return Ok(0);
        }

        // Remove oldest ones
        let remove_count = keys.len() - MAX_NOTIFICATIONS_PER_IDENTITY;
        for key in keys.iter().take(remove_count) {
            self.tree.remove(key)?;
        }

        self.tree.flush()?;
        Ok(remove_count)
    }

    /// Count unread notifications for an identity.
    pub fn count_unread(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let mut count = 0;

        for result in self.tree.scan_prefix(&prefix) {
            let (_, value) = result?;
            let notification: Notification = bincode::deserialize(&value)?;
            if !notification.read {
                count += 1;
            }
        }

        Ok(count)
    }

    /// Count total notifications for an identity.
    pub fn count_all(&self, identity: &[u8; 32]) -> Result<usize, NotificationError> {
        let prefix = Self::make_prefix(identity);
        let count = self.tree.scan_prefix(&prefix).count();
        Ok(count)
    }

    /// Get total notification count across all identities.
    pub fn total_count(&self) -> usize {
        self.tree.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notification::types::NotificationType;
    use tempfile::TempDir;

    fn create_test_db() -> (TempDir, Db) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        (temp_dir, db)
    }

    fn create_test_notification(msg: &str, created_at_ms: u64) -> Notification {
        Notification::new(NotificationType::Streak, msg, created_at_ms)
    }

    const BASE_MS: u64 = 1735689600000;

    #[test]
    fn test_store_creation() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();
        assert_eq!(store.total_count(), 0);
    }

    #[test]
    fn test_store_and_retrieve() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let notification = create_test_notification("Test message", BASE_MS);
        let id = notification.id;

        store.store(&identity, &notification).unwrap();

        let unread = store.get_unread(&identity, 10).unwrap();
        assert_eq!(unread.len(), 1);
        assert_eq!(unread[0].id, id);
        assert_eq!(unread[0].message, "Test message");
    }

    #[test]
    fn test_newest_first() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        // Store in chronological order
        for i in 0..5u64 {
            let notification = create_test_notification(&format!("Message {}", i), BASE_MS + i * 1000);
            store.store(&identity, &notification).unwrap();
        }

        // Should retrieve in reverse order (newest first)
        let all = store.get_all(&identity, 10).unwrap();
        assert_eq!(all.len(), 5);
        assert!(all[0].message.contains("4"));
        assert!(all[4].message.contains("0"));
    }

    #[test]
    fn test_mark_read() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let notification = create_test_notification("Test", BASE_MS);
        let id = notification.id;

        store.store(&identity, &notification).unwrap();

        // Should be unread
        assert_eq!(store.count_unread(&identity).unwrap(), 1);

        // Mark as read
        assert!(store.mark_read(&identity, id).unwrap());

        // Should be read
        assert_eq!(store.count_unread(&identity).unwrap(), 0);

        // All should still show it
        let all = store.get_all(&identity, 10).unwrap();
        assert_eq!(all.len(), 1);
        assert!(all[0].read);
    }

    #[test]
    fn test_mark_all_read() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        for i in 0..5 {
            let notification = create_test_notification(&format!("Message {}", i), BASE_MS + i * 1000);
            store.store(&identity, &notification).unwrap();
        }

        assert_eq!(store.count_unread(&identity).unwrap(), 5);

        let marked = store.mark_all_read(&identity).unwrap();
        assert_eq!(marked, 5);

        assert_eq!(store.count_unread(&identity).unwrap(), 0);
    }

    #[test]
    fn test_clear() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        for i in 0..3 {
            let notification = create_test_notification(&format!("Message {}", i), BASE_MS + i * 1000);
            store.store(&identity, &notification).unwrap();
        }

        assert_eq!(store.count_all(&identity).unwrap(), 3);

        let cleared = store.clear(&identity).unwrap();
        assert_eq!(cleared, 3);

        assert_eq!(store.count_all(&identity).unwrap(), 0);
    }

    #[test]
    fn test_prune_expired() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        // Old notification (31 days ago)
        let old = create_test_notification("Old", 0);
        store.store(&identity, &old).unwrap();

        // New notification
        let new = create_test_notification("New", BASE_MS);
        store.store(&identity, &new).unwrap();

        assert_eq!(store.count_all(&identity).unwrap(), 2);

        // Prune with "now" = BASE_MS
        let now = BASE_MS;
        let pruned = store.prune_expired_for_identity(&identity, now).unwrap();
        assert_eq!(pruned, 1);

        assert_eq!(store.count_all(&identity).unwrap(), 1);

        let remaining = store.get_all(&identity, 10).unwrap();
        assert_eq!(remaining[0].message, "New");
    }

    #[test]
    fn test_limit() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        for i in 0..10 {
            let notification = create_test_notification(&format!("Message {}", i), BASE_MS + i * 1000);
            store.store(&identity, &notification).unwrap();
        }

        // Request with limit
        let limited = store.get_unread(&identity, 5).unwrap();
        assert_eq!(limited.len(), 5);

        // Should be newest 5
        assert!(limited[0].message.contains("9"));
        assert!(limited[4].message.contains("5"));
    }

    #[test]
    fn test_multiple_identities() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];

        // Store for identity1
        for i in 0..3 {
            let notification = create_test_notification(&format!("ID1 Message {}", i), BASE_MS + i);
            store.store(&identity1, &notification).unwrap();
        }

        // Store for identity2
        for i in 0..5 {
            let notification = create_test_notification(&format!("ID2 Message {}", i), BASE_MS + i);
            store.store(&identity2, &notification).unwrap();
        }

        assert_eq!(store.count_all(&identity1).unwrap(), 3);
        assert_eq!(store.count_all(&identity2).unwrap(), 5);
        assert_eq!(store.total_count(), 8);

        // Clear one identity
        store.clear(&identity1).unwrap();
        assert_eq!(store.count_all(&identity1).unwrap(), 0);
        assert_eq!(store.count_all(&identity2).unwrap(), 5);
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let identity = [42u8; 32];

        // First session
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = NotificationStore::new(&db).unwrap();

            let notification = create_test_notification("Persistent", BASE_MS);
            store.store(&identity, &notification).unwrap();
        }

        // Second session
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = NotificationStore::new(&db).unwrap();

            let all = store.get_all(&identity, 10).unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!(all[0].message, "Persistent");
        }
    }

    #[test]
    fn test_mark_read_not_found() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let fake_id = [0u8; 16];

        let result = store.mark_read(&identity, fake_id).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_get_unread_excludes_read() {
        let (_temp, db) = create_test_db();
        let store = NotificationStore::new(&db).unwrap();

        let identity = [1u8; 32];

        let n1 = create_test_notification("Unread", BASE_MS);
        let n1_id = n1.id;
        store.store(&identity, &n1).unwrap();

        let n2 = create_test_notification("Also unread", BASE_MS + 1000);
        store.store(&identity, &n2).unwrap();

        // Mark first as read
        store.mark_read(&identity, n1_id).unwrap();

        // get_unread should only return the second one
        let unread = store.get_unread(&identity, 10).unwrap();
        assert_eq!(unread.len(), 1);
        assert_eq!(unread[0].message, "Also unread");
    }
}
