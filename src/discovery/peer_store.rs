//! Persistent peer cache using sled (SPEC_06 §4.1)
//!
//! PeerStore provides disk-backed storage for discovered peers,
//! ensuring the peer cache survives node restarts.
//!
//! ## Score Index (M-DHT-2)
//!
//! The store maintains a secondary score index for O(k) eviction operations
//! instead of O(n) full table scans. The index uses composite keys of
//! `(score, peer_key)` to allow efficient range queries by score.

use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use super::error::DiscoveryError;
use super::peer_entry::PeerEntry;
use super::peer_key::PeerKey;
use crate::types::constants::PEER_BAN_THRESHOLD;
use crate::types::serialize::{Deserialize, Serialize};

/// Tree name for peer storage
const TREE_NAME: &str = "discovery_peers";
/// Tree name for score index (M-DHT-2)
const SCORE_INDEX_TREE: &str = "discovery_peers_score_idx";

/// Persistent peer cache backed by sled
///
/// Maintains a secondary score index for efficient eviction operations.
pub struct PeerStore {
    /// Sled tree for peer entries
    tree: sled::Tree,
    /// Score index tree: key = (score as i16 big-endian + peer_key), value = empty
    /// Big-endian ensures lexicographic ordering matches numeric ordering.
    score_index: sled::Tree,
    /// Reference to the database for flushing
    db: Arc<sled::Db>,
}

impl PeerStore {
    /// Open or create a peer store at the given path
    pub fn open(path: &Path) -> Result<Self, DiscoveryError> {
        let db = crate::storage::open_db(path)?;
        let tree = db.open_tree(TREE_NAME)?;
        let score_index = db.open_tree(SCORE_INDEX_TREE)?;
        Ok(Self {
            tree,
            score_index,
            db: Arc::new(db),
        })
    }

    /// Create an in-memory peer store (for testing)
    #[cfg(test)]
    pub fn open_temporary() -> Result<Self, DiscoveryError> {
        let config = sled::Config::new().temporary(true);
        let db = config.open()?;
        let tree = db.open_tree(TREE_NAME)?;
        let score_index = db.open_tree(SCORE_INDEX_TREE)?;
        Ok(Self {
            tree,
            score_index,
            db: Arc::new(db),
        })
    }

    /// Build a score index key from score and peer key.
    ///
    /// Uses offset encoding for i16: adds 32768 to shift range from
    /// [-32768, 32767] to [0, 65535], then stores as big-endian u16.
    /// This ensures lexicographic byte ordering matches numeric ordering.
    fn make_score_index_key(score: i16, peer_key: &PeerKey) -> Vec<u8> {
        // Offset encoding: i16 -> u16 for proper lexicographic ordering
        let offset_score = (score as i32 + 32768) as u16;
        let mut key = Vec::with_capacity(2 + PeerKey::SIZE);
        key.extend_from_slice(&offset_score.to_be_bytes());
        key.extend_from_slice(peer_key.as_bytes());
        key
    }

    /// Extract score from a score index key.
    fn score_from_index_key(key: &[u8]) -> i16 {
        if key.len() < 2 {
            return 0;
        }
        let offset_score = u16::from_be_bytes([key[0], key[1]]);
        (offset_score as i32 - 32768) as i16
    }

    /// Extract peer key from a score index key.
    fn peer_key_from_index_key(key: &[u8]) -> Option<PeerKey> {
        if key.len() < 2 + PeerKey::SIZE {
            return None;
        }
        PeerKey::from_bytes(&key[2..2 + PeerKey::SIZE])
    }

    /// Add entry to score index.
    fn add_to_score_index(&self, score: i16, peer_key: &PeerKey) -> Result<(), DiscoveryError> {
        let index_key = Self::make_score_index_key(score, peer_key);
        self.score_index.insert(index_key, &[])?;
        Ok(())
    }

    /// Remove entry from score index.
    fn remove_from_score_index(
        &self,
        score: i16,
        peer_key: &PeerKey,
    ) -> Result<(), DiscoveryError> {
        let index_key = Self::make_score_index_key(score, peer_key);
        self.score_index.remove(index_key)?;
        Ok(())
    }

    /// Update score in index (remove old, add new).
    fn update_score_index(
        &self,
        old_score: i16,
        new_score: i16,
        peer_key: &PeerKey,
    ) -> Result<(), DiscoveryError> {
        if old_score != new_score {
            self.remove_from_score_index(old_score, peer_key)?;
            self.add_to_score_index(new_score, peer_key)?;
        }
        Ok(())
    }

    /// Store or update a peer entry
    ///
    /// Maintains the score index for O(k) eviction operations.
    pub fn put(&self, entry: &PeerEntry) -> Result<(), DiscoveryError> {
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        // Check if entry exists and get old score for index update
        if let Some(old_bytes) = self.tree.get(key.as_bytes())? {
            let old_entry = PeerEntry::from_bytes(&old_bytes)?;
            self.update_score_index(old_entry.score, entry.score, &key)?;
        } else {
            // New entry - add to score index
            self.add_to_score_index(entry.score, &key)?;
        }

        let value = entry.to_bytes();
        self.tree.insert(key.as_bytes(), value)?;
        Ok(())
    }

    /// Get a peer entry by key
    pub fn get(&self, key: &PeerKey) -> Result<Option<PeerEntry>, DiscoveryError> {
        match self.tree.get(key.as_bytes())? {
            Some(bytes) => {
                let entry = PeerEntry::from_bytes(&bytes)?;
                Ok(Some(entry))
            }
            None => Ok(None),
        }
    }

    /// Get all peer entries
    pub fn get_all(&self) -> Result<Vec<PeerEntry>, DiscoveryError> {
        let mut entries = Vec::new();
        for result in self.tree.iter() {
            let (_key, value) = result?;
            let entry = PeerEntry::from_bytes(&value)?;
            entries.push(entry);
        }
        Ok(entries)
    }

    /// Get peer entries with score >= min_score
    pub fn get_by_min_score(&self, min_score: i16) -> Result<Vec<PeerEntry>, DiscoveryError> {
        let entries = self.get_all()?;
        Ok(entries
            .into_iter()
            .filter(|e| e.score >= min_score)
            .collect())
    }

    /// Record a successful connection for a peer
    ///
    /// Updates the score index when score changes.
    pub fn record_success(&self, key: &PeerKey) -> Result<(), DiscoveryError> {
        let bytes = self
            .tree
            .get(key.as_bytes())?
            .ok_or(DiscoveryError::PeerNotFound)?;

        let mut entry = PeerEntry::from_bytes(&bytes)?;
        let old_score = entry.score;
        let now = current_timestamp();
        entry.record_success(now);

        // Update last_seen on the wire_addr too
        entry.wire_addr.last_seen = now as u32;

        // Update score index if score changed
        self.update_score_index(old_score, entry.score, key)?;

        self.tree.insert(key.as_bytes(), entry.to_bytes())?;
        Ok(())
    }

    /// Record a failed connection for a peer
    ///
    /// Updates the score index when score changes.
    pub fn record_failure(&self, key: &PeerKey) -> Result<(), DiscoveryError> {
        let bytes = self
            .tree
            .get(key.as_bytes())?
            .ok_or(DiscoveryError::PeerNotFound)?;

        let mut entry = PeerEntry::from_bytes(&bytes)?;
        let old_score = entry.score;
        entry.record_failure();

        // Update score index if score changed
        self.update_score_index(old_score, entry.score, key)?;

        self.tree.insert(key.as_bytes(), entry.to_bytes())?;
        Ok(())
    }

    /// Update a peer's score by a delta
    ///
    /// Updates the score index when score changes.
    pub fn update_score(&self, key: &PeerKey, delta: i16) -> Result<(), DiscoveryError> {
        let bytes = self
            .tree
            .get(key.as_bytes())?
            .ok_or(DiscoveryError::PeerNotFound)?;

        let mut entry = PeerEntry::from_bytes(&bytes)?;
        let old_score = entry.score;
        if delta > 0 {
            entry.score = entry.score.saturating_add(delta).min(1000);
        } else {
            entry.score = entry.score.saturating_sub(delta.abs()).max(-1000);
        }

        // Update score index if score changed
        self.update_score_index(old_score, entry.score, key)?;

        self.tree.insert(key.as_bytes(), entry.to_bytes())?;
        Ok(())
    }

    /// Remove a peer from the store
    ///
    /// Also removes from score index.
    pub fn remove(&self, key: &PeerKey) -> Result<(), DiscoveryError> {
        // Get current score to remove from index
        if let Some(bytes) = self.tree.get(key.as_bytes())? {
            let entry = PeerEntry::from_bytes(&bytes)?;
            self.remove_from_score_index(entry.score, key)?;
        }
        self.tree.remove(key.as_bytes())?;
        Ok(())
    }

    /// Count the number of stored peers
    pub fn count(&self) -> Result<usize, DiscoveryError> {
        Ok(self.tree.len())
    }

    /// Evict lowest-scoring peers to reach keep_count
    ///
    /// Uses the score index for O(k) complexity where k is the eviction count,
    /// instead of O(n log n) for the full sort approach.
    ///
    /// Returns the number of peers evicted.
    pub fn evict_lowest_scores(&self, keep_count: usize) -> Result<usize, DiscoveryError> {
        let current_count = self.count()?;
        if current_count <= keep_count {
            return Ok(0);
        }

        let evict_count = current_count - keep_count;
        let mut evicted = 0;

        // Collect keys to evict (lowest scores first via score index ordering)
        let mut to_remove = Vec::with_capacity(evict_count);
        for result in self.score_index.iter() {
            if evicted >= evict_count {
                break;
            }
            let (index_key, _) = result?;
            if let Some(peer_key) = Self::peer_key_from_index_key(&index_key) {
                let score = Self::score_from_index_key(&index_key);
                to_remove.push((score, peer_key));
                evicted += 1;
            }
        }

        // Remove collected entries
        for (score, peer_key) in to_remove {
            self.tree.remove(peer_key.as_bytes())?;
            self.remove_from_score_index(score, &peer_key)?;
        }

        Ok(evicted)
    }

    /// Remove peers with score below the ban threshold
    ///
    /// Uses the score index for O(k) complexity where k is the number of
    /// banned peers, instead of O(n) for the full scan approach.
    pub fn remove_banned(&self) -> Result<usize, DiscoveryError> {
        // Build the upper bound key for ban threshold
        // We want all scores < PEER_BAN_THRESHOLD
        let threshold_key = Self::make_score_index_key(
            PEER_BAN_THRESHOLD,
            &PeerKey::from_bytes(&[0u8; 67]).unwrap(),
        );

        let mut removed = 0;
        let mut to_remove = Vec::new();

        // Iterate from lowest score up to (but not including) threshold
        for result in self.score_index.range(..threshold_key) {
            let (index_key, _) = result?;
            if let Some(peer_key) = Self::peer_key_from_index_key(&index_key) {
                let score = Self::score_from_index_key(&index_key);
                to_remove.push((score, peer_key));
            }
        }

        // Remove collected entries
        for (score, peer_key) in to_remove {
            self.tree.remove(peer_key.as_bytes())?;
            self.remove_from_score_index(score, &peer_key)?;
            removed += 1;
        }

        Ok(removed)
    }

    /// Remove peers that have never connected and are older than max_age_secs
    ///
    /// Note: This still requires O(n) scan since we need to check age and
    /// connection status, which are not indexed. Consider adding a separate
    /// index if this becomes a bottleneck.
    pub fn remove_stale(&self, max_age_secs: u64) -> Result<usize, DiscoveryError> {
        let now = current_timestamp();
        let mut removed = 0;
        let mut to_remove = Vec::new();

        for result in self.tree.iter() {
            let (key_bytes, value) = result?;
            let entry = PeerEntry::from_bytes(&value)?;
            if entry.never_connected() && entry.age_secs(now) > max_age_secs {
                if let Some(peer_key) = PeerKey::from_bytes(&key_bytes) {
                    to_remove.push((entry.score, peer_key));
                }
            }
        }

        // Remove collected entries
        for (score, peer_key) in to_remove {
            self.tree.remove(peer_key.as_bytes())?;
            self.remove_from_score_index(score, &peer_key)?;
            removed += 1;
        }

        Ok(removed)
    }

    /// Flush pending writes to disk
    pub fn flush(&self) -> Result<(), DiscoveryError> {
        self.db.flush()?;
        Ok(())
    }

    /// Clear all entries (for testing)
    #[cfg(test)]
    pub fn clear(&self) -> Result<(), DiscoveryError> {
        self.tree.clear()?;
        self.score_index.clear()?;
        Ok(())
    }

    /// Verify score index consistency (for testing/debugging)
    #[cfg(test)]
    pub fn verify_index_consistency(&self) -> Result<bool, DiscoveryError> {
        // Check that every entry in tree has corresponding index entry
        for result in self.tree.iter() {
            let (key_bytes, value) = result?;
            let entry = PeerEntry::from_bytes(&value)?;
            if let Some(peer_key) = PeerKey::from_bytes(&key_bytes) {
                let index_key = Self::make_score_index_key(entry.score, &peer_key);
                if self.score_index.get(&index_key)?.is_none() {
                    return Ok(false);
                }
            }
        }

        // Check that every index entry has corresponding tree entry
        for result in self.score_index.iter() {
            let (index_key, _) = result?;
            if let Some(peer_key) = Self::peer_key_from_index_key(&index_key) {
                if self.tree.get(peer_key.as_bytes())?.is_none() {
                    return Ok(false);
                }
            }
        }

        // Check counts match
        Ok(self.tree.len() == self.score_index.len())
    }
}

/// Get current UNIX timestamp
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::messages::WireAddr;
    use crate::types::constants::{PEER_FAILURE_PENALTY, PEER_SUCCESS_BONUS};

    fn make_wire_addr(port: u16) -> WireAddr {
        let mut address = [0u8; 64];
        address[0] = 127;
        address[1] = 0;
        address[2] = 0;
        address[3] = 1;
        WireAddr {
            transport: 0x01,
            address,
            port,
            services: 0x01,
            last_seen: 1700000000,
        }
    }

    fn make_entry(port: u16, score: i16) -> PeerEntry {
        let mut entry = PeerEntry::new(make_wire_addr(port), 1700000000);
        entry.score = score;
        entry
    }

    #[test]
    fn test_peer_store_put_get() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();
        let retrieved = store.get(&key).unwrap().unwrap();

        assert_eq!(entry, retrieved);
    }

    #[test]
    fn test_peer_store_get_not_found() {
        let store = PeerStore::open_temporary().unwrap();
        let key = PeerKey::from_wire_addr(&make_wire_addr(9999));

        assert!(store.get(&key).unwrap().is_none());
    }

    #[test]
    fn test_peer_store_persistence() {
        let entries = vec![
            make_entry(9735, 100),
            make_entry(9736, 200),
            make_entry(9737, 50),
        ];

        // Create temp directory for test
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("peer_test");

        // Store entries
        {
            let store = PeerStore::open(&db_path).unwrap();
            for entry in &entries {
                store.put(entry).unwrap();
            }
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let store = PeerStore::open(&db_path).unwrap();
            let retrieved = store.get_all().unwrap();
            assert_eq!(retrieved.len(), 3);

            for entry in &entries {
                let key = PeerKey::from_wire_addr(&entry.wire_addr);
                let retrieved_entry = store.get(&key).unwrap().unwrap();
                assert_eq!(entry.score, retrieved_entry.score);
            }
        }
    }

    #[test]
    fn test_peer_store_get_all() {
        let store = PeerStore::open_temporary().unwrap();

        let entries = vec![
            make_entry(9735, 100),
            make_entry(9736, 200),
            make_entry(9737, 50),
        ];

        for entry in &entries {
            store.put(entry).unwrap();
        }

        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_peer_store_get_by_min_score() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 50)).unwrap();
        store.put(&make_entry(9736, 100)).unwrap();
        store.put(&make_entry(9737, 150)).unwrap();
        store.put(&make_entry(9738, -100)).unwrap();

        let high_score = store.get_by_min_score(100).unwrap();
        assert_eq!(high_score.len(), 2);

        let positive = store.get_by_min_score(0).unwrap();
        assert_eq!(positive.len(), 3);
    }

    #[test]
    fn test_peer_store_record_success() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();
        store.record_success(&key).unwrap();

        let updated = store.get(&key).unwrap().unwrap();
        assert_eq!(updated.score, 100 + PEER_SUCCESS_BONUS);
        assert_eq!(updated.failures, 0);
        assert!(updated.last_success > 0);
    }

    #[test]
    fn test_peer_store_record_failure() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();
        store.record_failure(&key).unwrap();

        let updated = store.get(&key).unwrap().unwrap();
        assert_eq!(updated.score, 100 - PEER_FAILURE_PENALTY);
        assert_eq!(updated.failures, 1);
    }

    #[test]
    fn test_peer_store_record_not_found() {
        let store = PeerStore::open_temporary().unwrap();
        let key = PeerKey::from_wire_addr(&make_wire_addr(9999));

        assert!(matches!(
            store.record_success(&key),
            Err(DiscoveryError::PeerNotFound)
        ));
        assert!(matches!(
            store.record_failure(&key),
            Err(DiscoveryError::PeerNotFound)
        ));
    }

    #[test]
    fn test_peer_store_score_updates() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();

        // 5 successes, 3 failures
        for _ in 0..5 {
            store.record_success(&key).unwrap();
        }
        for _ in 0..3 {
            store.record_failure(&key).unwrap();
        }

        let updated = store.get(&key).unwrap().unwrap();
        // Score = 100 + (5 * 10) - (3 * 20) = 100 + 50 - 60 = 90
        assert_eq!(updated.score, 90);
    }

    #[test]
    fn test_peer_store_remove() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();
        assert!(store.get(&key).unwrap().is_some());

        store.remove(&key).unwrap();
        assert!(store.get(&key).unwrap().is_none());
    }

    #[test]
    fn test_peer_store_count() {
        let store = PeerStore::open_temporary().unwrap();

        assert_eq!(store.count().unwrap(), 0);

        store.put(&make_entry(9735, 100)).unwrap();
        assert_eq!(store.count().unwrap(), 1);

        store.put(&make_entry(9736, 100)).unwrap();
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn test_peer_store_evict_lowest_scores() {
        let store = PeerStore::open_temporary().unwrap();

        // Add 5 entries with different scores
        store.put(&make_entry(9735, 50)).unwrap();
        store.put(&make_entry(9736, 100)).unwrap();
        store.put(&make_entry(9737, 150)).unwrap();
        store.put(&make_entry(9738, 200)).unwrap();
        store.put(&make_entry(9739, 25)).unwrap();

        assert_eq!(store.count().unwrap(), 5);

        // Evict to keep 3
        let evicted = store.evict_lowest_scores(3).unwrap();
        assert_eq!(evicted, 2);
        assert_eq!(store.count().unwrap(), 3);

        // Remaining should be the highest scoring ones
        let remaining = store.get_all().unwrap();
        for entry in remaining {
            assert!(entry.score >= 100);
        }
    }

    #[test]
    fn test_peer_store_evict_no_op() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 100)).unwrap();
        store.put(&make_entry(9736, 100)).unwrap();

        // Already at or below keep_count
        let evicted = store.evict_lowest_scores(3).unwrap();
        assert_eq!(evicted, 0);
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn test_peer_store_remove_banned() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 100)).unwrap();
        store.put(&make_entry(9736, -400)).unwrap();
        store.put(&make_entry(9737, -600)).unwrap(); // Below -500 threshold
        store.put(&make_entry(9738, -501)).unwrap(); // Below -500 threshold

        let removed = store.remove_banned().unwrap();
        assert_eq!(removed, 2);
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn test_peer_store_remove_stale() {
        let store = PeerStore::open_temporary().unwrap();

        // Entry that connected successfully
        let mut connected = make_entry(9735, 100);
        connected.last_success = 1700000000;
        connected.first_seen = 1600000000; // Old

        // Entry that never connected and is old
        let mut stale = make_entry(9736, 100);
        stale.last_success = 0;
        stale.first_seen = 1600000000; // Old

        // Entry that never connected but is new
        let mut new_unconnected = make_entry(9737, 100);
        new_unconnected.last_success = 0;
        new_unconnected.first_seen = current_timestamp() - 100; // Recent

        store.put(&connected).unwrap();
        store.put(&stale).unwrap();
        store.put(&new_unconnected).unwrap();

        // Remove entries older than 30 days that never connected
        let removed = store.remove_stale(30 * 24 * 60 * 60).unwrap();
        assert_eq!(removed, 1); // Only the stale one

        let remaining = store.get_all().unwrap();
        assert_eq!(remaining.len(), 2);
    }

    // ============================================================
    // M-DHT-2: Score Index Tests
    // ============================================================

    #[test]
    fn test_score_index_key_encoding() {
        // Test that score encoding maintains proper ordering
        let peer_key = PeerKey::from_wire_addr(&make_wire_addr(9735));

        // Negative scores should come before positive scores
        let key_neg1000 = PeerStore::make_score_index_key(-1000, &peer_key);
        let key_neg500 = PeerStore::make_score_index_key(-500, &peer_key);
        let key_0 = PeerStore::make_score_index_key(0, &peer_key);
        let key_500 = PeerStore::make_score_index_key(500, &peer_key);
        let key_1000 = PeerStore::make_score_index_key(1000, &peer_key);

        // Lexicographic ordering should match numeric ordering
        assert!(key_neg1000 < key_neg500);
        assert!(key_neg500 < key_0);
        assert!(key_0 < key_500);
        assert!(key_500 < key_1000);

        // Verify roundtrip
        assert_eq!(PeerStore::score_from_index_key(&key_neg1000), -1000);
        assert_eq!(PeerStore::score_from_index_key(&key_neg500), -500);
        assert_eq!(PeerStore::score_from_index_key(&key_0), 0);
        assert_eq!(PeerStore::score_from_index_key(&key_500), 500);
        assert_eq!(PeerStore::score_from_index_key(&key_1000), 1000);
    }

    #[test]
    fn test_score_index_consistency_after_put() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 100)).unwrap();
        store.put(&make_entry(9736, -200)).unwrap();
        store.put(&make_entry(9737, 500)).unwrap();

        assert!(store.verify_index_consistency().unwrap());
    }

    #[test]
    fn test_score_index_consistency_after_update() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();

        // Update score multiple times
        for _ in 0..5 {
            store.record_success(&key).unwrap();
        }
        for _ in 0..3 {
            store.record_failure(&key).unwrap();
        }

        assert!(store.verify_index_consistency().unwrap());
    }

    #[test]
    fn test_score_index_consistency_after_remove() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 100)).unwrap();
        store.put(&make_entry(9736, 200)).unwrap();
        store.put(&make_entry(9737, 300)).unwrap();

        let key = PeerKey::from_wire_addr(&make_wire_addr(9736));
        store.remove(&key).unwrap();

        assert!(store.verify_index_consistency().unwrap());
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn test_score_index_consistency_after_eviction() {
        let store = PeerStore::open_temporary().unwrap();

        // Add 10 entries with varying scores
        for i in 0..10 {
            store
                .put(&make_entry(9735 + i, (i as i16) * 50 - 200))
                .unwrap();
        }

        assert!(store.verify_index_consistency().unwrap());

        // Evict half
        let evicted = store.evict_lowest_scores(5).unwrap();
        assert_eq!(evicted, 5);

        assert!(store.verify_index_consistency().unwrap());
        assert_eq!(store.count().unwrap(), 5);
    }

    #[test]
    fn test_score_index_consistency_after_remove_banned() {
        let store = PeerStore::open_temporary().unwrap();

        store.put(&make_entry(9735, 100)).unwrap();
        store.put(&make_entry(9736, -400)).unwrap();
        store.put(&make_entry(9737, -600)).unwrap();
        store.put(&make_entry(9738, -501)).unwrap();

        assert!(store.verify_index_consistency().unwrap());

        let removed = store.remove_banned().unwrap();
        assert_eq!(removed, 2);

        assert!(store.verify_index_consistency().unwrap());
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn test_score_index_with_score_update_method() {
        let store = PeerStore::open_temporary().unwrap();
        let entry = make_entry(9735, 100);
        let key = PeerKey::from_wire_addr(&entry.wire_addr);

        store.put(&entry).unwrap();

        // Use update_score directly
        store.update_score(&key, 50).unwrap();
        assert!(store.verify_index_consistency().unwrap());

        store.update_score(&key, -30).unwrap();
        assert!(store.verify_index_consistency().unwrap());

        let updated = store.get(&key).unwrap().unwrap();
        // 100 + 50 - 30 = 120
        assert_eq!(updated.score, 120);
    }

    #[test]
    fn test_eviction_order_correctness() {
        let store = PeerStore::open_temporary().unwrap();

        // Add entries with specific scores
        store.put(&make_entry(9735, 500)).unwrap(); // Should survive
        store.put(&make_entry(9736, 100)).unwrap(); // Should be evicted
        store.put(&make_entry(9737, 300)).unwrap(); // Should survive
        store.put(&make_entry(9738, 50)).unwrap(); // Should be evicted
        store.put(&make_entry(9739, 400)).unwrap(); // Should survive

        let evicted = store.evict_lowest_scores(3).unwrap();
        assert_eq!(evicted, 2);

        // Verify remaining entries have scores >= 300
        let remaining = store.get_all().unwrap();
        assert_eq!(remaining.len(), 3);
        for entry in remaining {
            assert!(
                entry.score >= 300,
                "Entry with score {} should have been evicted",
                entry.score
            );
        }
    }

    #[test]
    fn test_score_index_persistence() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("peer_index_test");

        // Create store and add entries
        {
            let store = PeerStore::open(&db_path).unwrap();
            store.put(&make_entry(9735, 100)).unwrap();
            store.put(&make_entry(9736, -200)).unwrap();
            store.put(&make_entry(9737, 500)).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify index consistency
        {
            let store = PeerStore::open(&db_path).unwrap();
            assert!(store.verify_index_consistency().unwrap());

            // Eviction should still work correctly
            let evicted = store.evict_lowest_scores(2).unwrap();
            assert_eq!(evicted, 1);

            // The lowest score (-200) should have been evicted
            let remaining = store.get_all().unwrap();
            for entry in remaining {
                assert!(entry.score >= 100);
            }
        }
    }

    #[test]
    fn test_put_update_existing_maintains_index() {
        let store = PeerStore::open_temporary().unwrap();

        // Add entry
        let mut entry = make_entry(9735, 100);
        store.put(&entry).unwrap();
        assert!(store.verify_index_consistency().unwrap());

        // Update with same key but different score
        entry.score = 200;
        store.put(&entry).unwrap();
        assert!(store.verify_index_consistency().unwrap());

        // Update again
        entry.score = -50;
        store.put(&entry).unwrap();
        assert!(store.verify_index_consistency().unwrap());

        // Verify final state
        let key = PeerKey::from_wire_addr(&entry.wire_addr);
        let retrieved = store.get(&key).unwrap().unwrap();
        assert_eq!(retrieved.score, -50);
    }
}
