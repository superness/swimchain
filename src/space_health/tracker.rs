//! Space swimmer activity tracker
//!
//! Tracks hosting activity per identity per space to count active swimmers.
//! Active swimmers are identities with activity within the last 7 days.

use sled::Tree;

use super::error::SpaceHealthError;

/// Activity window for counting active swimmers (7 days in seconds)
pub const ACTIVITY_WINDOW_SECS: u64 = 604_800; // 7 * 24 * 60 * 60

/// Sled tree name for space swimmer activity
const TREE_NAME: &str = "space_swimmers";

/// Tracks hosting activity per identity per space.
///
/// Key format: space_id(16) || identity(32) = 48 bytes
/// Value format: last_activity_timestamp(8) as u64 LE
pub struct SpaceSwimmerTracker {
    tree: Tree,
}

impl SpaceSwimmerTracker {
    /// Create a new SpaceSwimmerTracker.
    ///
    /// # Arguments
    /// * `db` - Sled database
    pub fn new(db: &sled::Db) -> Result<Self, SpaceHealthError> {
        let tree = db.open_tree(TREE_NAME)?;
        Ok(Self { tree })
    }

    /// Record hosting activity for an identity in a space.
    ///
    /// # Arguments
    /// * `space_id` - 16-byte space identifier
    /// * `identity` - 32-byte Ed25519 public key
    /// * `timestamp` - Unix timestamp of the activity
    pub fn register_activity(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        timestamp: u64,
    ) -> Result<(), SpaceHealthError> {
        let key = Self::make_key(space_id, identity);
        self.tree.insert(&key, &timestamp.to_le_bytes())?;
        Ok(())
    }

    /// Count identities with activity in last 7 days.
    ///
    /// # Arguments
    /// * `space_id` - 16-byte space identifier
    /// * `now` - Current Unix timestamp
    ///
    /// # Returns
    /// Number of active swimmers in the space
    pub fn get_active_count(&self, space_id: &[u8; 16], now: u64) -> Result<u32, SpaceHealthError> {
        let cutoff = now.saturating_sub(ACTIVITY_WINDOW_SECS);
        let prefix = space_id.as_slice();

        let mut count = 0u32;
        for result in self.tree.scan_prefix(prefix) {
            let (key, value) = result?;

            // Skip if key is too short (shouldn't happen with valid data)
            if key.len() < 48 {
                continue;
            }

            // Parse last activity timestamp
            let timestamp_bytes: [u8; 8] = value.as_ref().try_into().unwrap_or([0; 8]);
            let last_activity = u64::from_le_bytes(timestamp_bytes);

            // Check if activity is within window
            if last_activity >= cutoff {
                count += 1;
            }
        }
        Ok(count)
    }

    /// Get all active swimmers for a space.
    ///
    /// Returns a list of (identity, last_activity) tuples for swimmers with
    /// activity within the last 7 days.
    pub fn get_active_swimmers(
        &self,
        space_id: &[u8; 16],
        now: u64,
    ) -> Result<Vec<([u8; 32], u64)>, SpaceHealthError> {
        let cutoff = now.saturating_sub(ACTIVITY_WINDOW_SECS);
        let prefix = space_id.as_slice();

        let mut swimmers = Vec::new();
        for result in self.tree.scan_prefix(prefix) {
            let (key, value) = result?;

            if key.len() < 48 {
                continue;
            }

            let timestamp_bytes: [u8; 8] = value.as_ref().try_into().unwrap_or([0; 8]);
            let last_activity = u64::from_le_bytes(timestamp_bytes);

            if last_activity >= cutoff {
                let mut identity = [0u8; 32];
                identity.copy_from_slice(&key[16..48]);
                swimmers.push((identity, last_activity));
            }
        }
        Ok(swimmers)
    }

    /// Remove stale activity records (older than 2x activity window).
    ///
    /// This is a maintenance operation to prevent unbounded growth.
    pub fn prune_stale_records(&self, now: u64) -> Result<usize, SpaceHealthError> {
        let cutoff = now.saturating_sub(ACTIVITY_WINDOW_SECS * 2);
        let mut removed = 0;

        let mut to_remove = Vec::new();
        for result in self.tree.iter() {
            let (key, value) = result?;

            let timestamp_bytes: [u8; 8] = value.as_ref().try_into().unwrap_or([0; 8]);
            let last_activity = u64::from_le_bytes(timestamp_bytes);

            if last_activity < cutoff {
                to_remove.push(key);
            }
        }

        for key in to_remove {
            self.tree.remove(&key)?;
            removed += 1;
        }

        Ok(removed)
    }

    /// Create a key from space_id and identity.
    fn make_key(space_id: &[u8; 16], identity: &[u8; 32]) -> [u8; 48] {
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..48].copy_from_slice(identity);
        key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(dead_code)]
    fn test_db() -> sled::Db {
        sled::Config::new().temporary(true).open().unwrap()
    }

    #[test]
    fn test_make_key() {
        let space_id = [1u8; 16];
        let identity = [2u8; 32];
        let key = SpaceSwimmerTracker::make_key(&space_id, &identity);

        assert_eq!(key.len(), 48);
        assert_eq!(&key[..16], &space_id);
        assert_eq!(&key[16..48], &identity);
    }

    #[test]
    fn test_make_key_unique() {
        let space1 = [1u8; 16];
        let space2 = [2u8; 16];
        let identity = [3u8; 32];

        let key1 = SpaceSwimmerTracker::make_key(&space1, &identity);
        let key2 = SpaceSwimmerTracker::make_key(&space2, &identity);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_activity_window_constant() {
        // 7 days = 604,800 seconds
        assert_eq!(ACTIVITY_WINDOW_SECS, 7 * 24 * 60 * 60);
    }
}
