//! Achievement storage using sled database
//!
//! Provides persistent storage for achievement data per SPEC_09 §5.3.
//! Achievements are stored with permanence - no delete operations.

use serde::{Deserialize, Serialize};
use sled::{Db, Tree};

use super::error::AchievementError;
use super::tracker::AchievementTracker;
use super::types::AchievementRecord;

/// Name of the sled tree for achievement data
const TREE_NAME: &str = "achievements";

/// Stored format for achievements - versioned for future migrations.
///
/// This structure is what gets persisted to sled. The version field
/// allows for forward-compatible schema changes.
#[derive(Debug, Serialize, Deserialize)]
struct StoredAchievements {
    /// Storage format version (currently 1)
    version: u8,

    /// List of achievement records
    records: Vec<AchievementRecord>,
}

impl StoredAchievements {
    /// Current storage format version
    const CURRENT_VERSION: u8 = 1;

    /// Create a new stored achievements from tracker data.
    fn from_tracker(tracker: &AchievementTracker) -> Self {
        Self {
            version: Self::CURRENT_VERSION,
            records: tracker.all_achievements(),
        }
    }

    /// Convert to an achievement tracker.
    fn into_tracker(self) -> AchievementTracker {
        let mut tracker = AchievementTracker::new();

        // Restore achievements
        for record in self.records {
            tracker.unlock(record.achievement, record.unlocked_at_secs);
        }

        tracker
    }
}

/// Persistent storage for achievement data.
///
/// Per SPEC_09 §5.3, achievements are permanent and non-transferable.
/// This store enforces permanence by not providing any delete methods.
pub struct AchievementStore {
    /// The sled tree for achievement storage
    tree: Tree,
}

impl AchievementStore {
    /// Create a new achievement store using the given sled database.
    ///
    /// Opens or creates the "achievements" tree.
    pub fn new(db: &Db) -> Result<Self, AchievementError> {
        let tree = db.open_tree(TREE_NAME)?;
        Ok(Self { tree })
    }

    /// Load an achievement tracker for an identity.
    ///
    /// Returns an empty tracker if no data exists for this identity.
    pub fn load(&self, identity: &[u8; 32]) -> Result<AchievementTracker, AchievementError> {
        match self.tree.get(identity)? {
            None => Ok(AchievementTracker::new()),
            Some(bytes) => {
                let stored: StoredAchievements = bincode::deserialize(&bytes)?;
                Ok(stored.into_tracker())
            }
        }
    }

    /// Save an achievement tracker for an identity.
    ///
    /// This overwrites any existing data. Callers should load first
    /// to merge with existing achievements.
    pub fn save(
        &self,
        identity: &[u8; 32],
        tracker: &AchievementTracker,
    ) -> Result<(), AchievementError> {
        let stored = StoredAchievements::from_tracker(tracker);
        let bytes = bincode::serialize(&stored)?;
        self.tree.insert(identity, bytes)?;
        self.tree.flush()?; // Ensure durability
        Ok(())
    }

    /// Check if an identity has any achievement data.
    pub fn has_data(&self, identity: &[u8; 32]) -> Result<bool, AchievementError> {
        Ok(self.tree.contains_key(identity)?)
    }

    /// Get the count of identities with achievement data.
    pub fn identity_count(&self) -> usize {
        self.tree.len()
    }

    /// Iterate over all identities with achievement data.
    ///
    /// Returns (identity, tracker) pairs.
    pub fn iter(
        &self,
    ) -> impl Iterator<Item = Result<([u8; 32], AchievementTracker), AchievementError>> + '_ {
        self.tree.iter().map(|result| {
            let (key, value) = result?;
            let identity: [u8; 32] = key.as_ref().try_into().map_err(|_| {
                AchievementError::InvalidId(0) // Key was wrong size
            })?;
            let stored: StoredAchievements = bincode::deserialize(&value)?;
            Ok((identity, stored.into_tracker()))
        })
    }

    // NOTE: No delete method - PERMANENCE requirement per SPEC_09 §5.3
    // Achievements once earned are permanent and cannot be revoked.
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::achievement::types::Achievement;
    use tempfile::TempDir;

    fn create_test_db() -> (TempDir, Db) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        (temp_dir, db)
    }

    #[test]
    fn test_store_creation() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();
        assert_eq!(store.identity_count(), 0);
    }

    #[test]
    fn test_load_empty() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();

        let identity = [42u8; 32];
        let tracker = store.load(&identity).unwrap();

        assert!(tracker.is_empty());
        assert!(!store.has_data(&identity).unwrap());
    }

    #[test]
    fn test_save_and_load() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let timestamp = 1735689600 + 86400;

        // Create tracker with achievements
        let mut tracker = AchievementTracker::new();
        tracker.unlock(Achievement::FirstStroke, timestamp);
        tracker.unlock(Achievement::FirstServe, timestamp + 100);

        // Save
        store.save(&identity, &tracker).unwrap();
        assert!(store.has_data(&identity).unwrap());
        assert_eq!(store.identity_count(), 1);

        // Load
        let loaded = store.load(&identity).unwrap();
        assert_eq!(loaded.count(), 2);
        assert!(loaded.has(Achievement::FirstStroke));
        assert!(loaded.has(Achievement::FirstServe));
    }

    #[test]
    fn test_multiple_identities() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();

        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];
        let timestamp = 1735689600;

        let mut tracker1 = AchievementTracker::new();
        tracker1.unlock(Achievement::FirstStroke, timestamp);

        let mut tracker2 = AchievementTracker::new();
        tracker2.unlock(Achievement::Centurion, timestamp);
        tracker2.unlock(Achievement::TerabyteClub, timestamp);

        store.save(&identity1, &tracker1).unwrap();
        store.save(&identity2, &tracker2).unwrap();

        assert_eq!(store.identity_count(), 2);

        let loaded1 = store.load(&identity1).unwrap();
        assert_eq!(loaded1.count(), 1);
        assert!(loaded1.has(Achievement::FirstStroke));

        let loaded2 = store.load(&identity2).unwrap();
        assert_eq!(loaded2.count(), 2);
        assert!(loaded2.has(Achievement::Centurion));
        assert!(loaded2.has(Achievement::TerabyteClub));
    }

    #[test]
    fn test_overwrite() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();

        let identity = [1u8; 32];
        let timestamp = 1735689600;

        // Initial save
        let mut tracker = AchievementTracker::new();
        tracker.unlock(Achievement::FirstStroke, timestamp);
        store.save(&identity, &tracker).unwrap();

        // Add more achievements and save again
        tracker.unlock(Achievement::WeekSwimmer, timestamp + 86400 * 7);
        store.save(&identity, &tracker).unwrap();

        // Load should have both
        let loaded = store.load(&identity).unwrap();
        assert_eq!(loaded.count(), 2);
        assert!(loaded.has(Achievement::FirstStroke));
        assert!(loaded.has(Achievement::WeekSwimmer));
    }

    #[test]
    fn test_iter() {
        let (_temp, db) = create_test_db();
        let store = AchievementStore::new(&db).unwrap();

        let timestamp = 1735689600;

        // Create multiple identities
        for i in 0..5u8 {
            let mut identity = [0u8; 32];
            identity[0] = i;

            let mut tracker = AchievementTracker::new();
            tracker.unlock(Achievement::FirstStroke, timestamp);
            store.save(&identity, &tracker).unwrap();
        }

        // Iterate and count
        let count = store.iter().count();
        assert_eq!(count, 5);

        // Verify all have FirstStroke
        for result in store.iter() {
            let (_, tracker) = result.unwrap();
            assert!(tracker.has(Achievement::FirstStroke));
        }
    }

    #[test]
    fn test_persistence_across_reopen() {
        let temp_dir = TempDir::new().unwrap();
        let identity = [42u8; 32];
        let timestamp = 1735689600;

        // First session: save achievements
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = AchievementStore::new(&db).unwrap();

            let mut tracker = AchievementTracker::new();
            tracker.unlock(Achievement::FirstStroke, timestamp);
            tracker.unlock(Achievement::Centurion, timestamp);
            store.save(&identity, &tracker).unwrap();
        }

        // Second session: load achievements
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = AchievementStore::new(&db).unwrap();

            let loaded = store.load(&identity).unwrap();
            assert_eq!(loaded.count(), 2);
            assert!(loaded.has(Achievement::FirstStroke));
            assert!(loaded.has(Achievement::Centurion));
        }
    }

}
