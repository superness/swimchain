//! Per-identity preference storage (follows, saved posts).
//!
//! Prefs used to live only in each client's browser localStorage, so a profile
//! wipe lost them even though the node ran on. This store makes the node the
//! single source of truth; clients read and write it over RPC (R2).
//!
//! # Storage Structure
//!
//! - `followed_spaces`: user_pk(32) || space_id(16) → timestamp(8 BE)
//! - `saved_posts`:     user_pk(32) || content_id(32) → timestamp(8 BE)

use std::path::Path;

use sled::Db;

use crate::types::error::StorageError;

/// Per-identity preference store backed by sled
pub struct PrefsStore {
    #[allow(dead_code)]
    db: Db,
    followed_spaces: sled::Tree,
    saved_posts: sled::Tree,
    meta: sled::Tree,
}

/// Meta key: set once the legacy `followed_spaces` list from config.toml has
/// been imported, so an unfollow doesn't resurrect on the next list call.
const META_CONFIG_FOLLOWS_IMPORTED: &[u8] = b"config_follows_imported";

impl PrefsStore {
    /// Open (or create) the prefs database at the given path
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let db = sled::open(path)
            .map_err(|e| StorageError::DatabaseError(format!("Failed to open prefs db: {e}")))?;
        let followed_spaces = db
            .open_tree("followed_spaces")
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        let saved_posts = db
            .open_tree("saved_posts")
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        let meta = db
            .open_tree("meta")
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        Ok(Self {
            db,
            followed_spaces,
            saved_posts,
            meta,
        })
    }

    /// Whether the one-time import of config.toml's followed_spaces ran already.
    pub fn config_follows_imported(&self) -> Result<bool, StorageError> {
        Ok(self
            .meta
            .get(META_CONFIG_FOLLOWS_IMPORTED)
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?
            .is_some())
    }

    /// Mark the config.toml follows import as done.
    pub fn mark_config_follows_imported(&self) -> Result<(), StorageError> {
        self.meta
            .insert(META_CONFIG_FOLLOWS_IMPORTED, &[1u8])
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        Ok(())
    }

    fn follow_key(user_pk: &[u8; 32], space_id: &[u8; 16]) -> [u8; 48] {
        let mut key = [0u8; 48];
        key[..32].copy_from_slice(user_pk);
        key[32..].copy_from_slice(space_id);
        key
    }

    fn save_key(user_pk: &[u8; 32], content_id: &[u8; 32]) -> [u8; 64] {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(user_pk);
        key[32..].copy_from_slice(content_id);
        key
    }

    /// Follow a space. Idempotent; keeps the original follow timestamp.
    pub fn follow_space(
        &self,
        user_pk: &[u8; 32],
        space_id: &[u8; 16],
        timestamp: u64,
    ) -> Result<(), StorageError> {
        let key = Self::follow_key(user_pk, space_id);
        if self
            .followed_spaces
            .get(key)
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?
            .is_none()
        {
            self.followed_spaces
                .insert(key, &timestamp.to_be_bytes())
                .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        }
        Ok(())
    }

    /// Unfollow a space. Idempotent.
    pub fn unfollow_space(
        &self,
        user_pk: &[u8; 32],
        space_id: &[u8; 16],
    ) -> Result<(), StorageError> {
        self.followed_spaces
            .remove(Self::follow_key(user_pk, space_id))
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        Ok(())
    }

    /// All spaces this identity follows, with the follow timestamp.
    pub fn followed_spaces(
        &self,
        user_pk: &[u8; 32],
    ) -> Result<Vec<([u8; 16], u64)>, StorageError> {
        let mut out = Vec::new();
        for result in self.followed_spaces.scan_prefix(user_pk) {
            let (key, value) = result.map_err(|e| StorageError::DatabaseError(e.to_string()))?;
            if key.len() != 48 {
                continue;
            }
            let mut space_id = [0u8; 16];
            space_id.copy_from_slice(&key[32..48]);
            let ts = value
                .as_ref()
                .try_into()
                .map(u64::from_be_bytes)
                .unwrap_or(0);
            out.push((space_id, ts));
        }
        Ok(out)
    }

    /// Save a post. Idempotent; keeps the original save timestamp.
    pub fn save_post(
        &self,
        user_pk: &[u8; 32],
        content_id: &[u8; 32],
        timestamp: u64,
    ) -> Result<(), StorageError> {
        let key = Self::save_key(user_pk, content_id);
        if self
            .saved_posts
            .get(key)
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?
            .is_none()
        {
            self.saved_posts
                .insert(key, &timestamp.to_be_bytes())
                .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        }
        Ok(())
    }

    /// Unsave a post. Idempotent.
    pub fn unsave_post(
        &self,
        user_pk: &[u8; 32],
        content_id: &[u8; 32],
    ) -> Result<(), StorageError> {
        self.saved_posts
            .remove(Self::save_key(user_pk, content_id))
            .map_err(|e| StorageError::DatabaseError(e.to_string()))?;
        Ok(())
    }

    /// All posts this identity saved, newest save first.
    pub fn saved_posts(&self, user_pk: &[u8; 32]) -> Result<Vec<([u8; 32], u64)>, StorageError> {
        let mut out = Vec::new();
        for result in self.saved_posts.scan_prefix(user_pk) {
            let (key, value) = result.map_err(|e| StorageError::DatabaseError(e.to_string()))?;
            if key.len() != 64 {
                continue;
            }
            let mut content_id = [0u8; 32];
            content_id.copy_from_slice(&key[32..64]);
            let ts = value
                .as_ref()
                .try_into()
                .map(u64::from_be_bytes)
                .unwrap_or(0);
            out.push((content_id, ts));
        }
        out.sort_by(|a, b| b.1.cmp(&a.1));
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn pk(b: u8) -> [u8; 32] {
        [b; 32]
    }

    #[test]
    fn follow_unfollow_roundtrip() {
        let dir = TempDir::new().unwrap();
        let store = PrefsStore::open(dir.path()).unwrap();
        let user = pk(1);
        let space = [7u8; 16];

        store.follow_space(&user, &space, 100).unwrap();
        // Idempotent: re-follow keeps the original timestamp.
        store.follow_space(&user, &space, 200).unwrap();
        let follows = store.followed_spaces(&user).unwrap();
        assert_eq!(follows, vec![(space, 100)]);

        // Another identity's follows are isolated.
        assert!(store.followed_spaces(&pk(2)).unwrap().is_empty());

        store.unfollow_space(&user, &space).unwrap();
        assert!(store.followed_spaces(&user).unwrap().is_empty());
        // Unfollow of a non-followed space is a no-op.
        store.unfollow_space(&user, &space).unwrap();
    }

    #[test]
    fn save_unsave_roundtrip() {
        let dir = TempDir::new().unwrap();
        let store = PrefsStore::open(dir.path()).unwrap();
        let user = pk(1);
        let a = [1u8; 32];
        let b = [2u8; 32];

        store.save_post(&user, &a, 100).unwrap();
        store.save_post(&user, &b, 200).unwrap();
        // Newest save first.
        let saved = store.saved_posts(&user).unwrap();
        assert_eq!(saved, vec![(b, 200), (a, 100)]);

        store.unsave_post(&user, &a).unwrap();
        assert_eq!(store.saved_posts(&user).unwrap(), vec![(b, 200)]);
    }
}
