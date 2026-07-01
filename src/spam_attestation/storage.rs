//! Spam attestation storage per SPEC_12 Section 3.5
//!
//! Provides persistent storage for spam attestations and counter-attestations.
//! Uses sled database for efficient key-value storage.

use sled::Db;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use super::counter::CounterAttestationState;
use super::error::SpamAttestationError;
use super::types::{StoredSpamAttestation, SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS};

/// Storage key prefixes
const ATTESTATION_PREFIX: &[u8] = b"spam:attest:";
const COUNTER_PREFIX: &[u8] = b"spam:counter:";
const RATE_LIMIT_PREFIX: &[u8] = b"spam:rate:";

/// Storage for spam attestations and counter-attestations.
pub struct SpamAttestationStore {
    /// Database handle
    db: Db,

    /// Rate limit cache: attester -> (count, window_start)
    rate_limits: Arc<RwLock<HashMap<[u8; 32], (u32, u64)>>>,
}

impl SpamAttestationStore {
    /// Open or create a spam attestation store.
    pub fn open(db: Db) -> Self {
        Self {
            db,
            rate_limits: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Store a spam attestation.
    ///
    /// Key format: spam:attest:<content_hash>:<attester>
    pub fn put_attestation(
        &self,
        attestation: &StoredSpamAttestation,
    ) -> Result<(), SpamAttestationError> {
        let mut key = Vec::with_capacity(ATTESTATION_PREFIX.len() + 64);
        key.extend_from_slice(ATTESTATION_PREFIX);
        key.extend_from_slice(&attestation.attestation.content_hash);
        key.extend_from_slice(&attestation.attestation.attester);

        let value =
            bincode::serialize(attestation).map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

        self.db
            .insert(key, value)
            .map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Get all attestations for a content hash.
    pub fn get_attestations_for_content(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<Vec<StoredSpamAttestation>, SpamAttestationError> {
        let mut prefix = Vec::with_capacity(ATTESTATION_PREFIX.len() + 32);
        prefix.extend_from_slice(ATTESTATION_PREFIX);
        prefix.extend_from_slice(content_hash);

        let mut attestations = Vec::new();

        for result in self.db.scan_prefix(&prefix) {
            let (_key, value) =
                result.map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

            let attestation: StoredSpamAttestation = bincode::deserialize(&value)
                .map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

            attestations.push(attestation);
        }

        Ok(attestations)
    }

    /// Check if an attester has already attested to content.
    pub fn has_attestation(
        &self,
        content_hash: &[u8; 32],
        attester: &[u8; 32],
    ) -> Result<bool, SpamAttestationError> {
        let mut key = Vec::with_capacity(ATTESTATION_PREFIX.len() + 64);
        key.extend_from_slice(ATTESTATION_PREFIX);
        key.extend_from_slice(content_hash);
        key.extend_from_slice(attester);

        self.db
            .contains_key(key)
            .map_err(|e| SpamAttestationError::StorageError(e.to_string()))
    }

    /// Get the counter-attestation state for content.
    pub fn get_counter_state(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<CounterAttestationState, SpamAttestationError> {
        let mut key = Vec::with_capacity(COUNTER_PREFIX.len() + 32);
        key.extend_from_slice(COUNTER_PREFIX);
        key.extend_from_slice(content_hash);

        match self
            .db
            .get(&key)
            .map_err(|e| SpamAttestationError::StorageError(e.to_string()))?
        {
            Some(value) => {
                bincode::deserialize(&value).map_err(|e| SpamAttestationError::StorageError(e.to_string()))
            }
            None => Ok(CounterAttestationState::empty(*content_hash)),
        }
    }

    /// Store counter-attestation state.
    pub fn put_counter_state(
        &self,
        state: &CounterAttestationState,
    ) -> Result<(), SpamAttestationError> {
        let mut key = Vec::with_capacity(COUNTER_PREFIX.len() + 32);
        key.extend_from_slice(COUNTER_PREFIX);
        key.extend_from_slice(&state.content_hash);

        let value =
            bincode::serialize(state).map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

        self.db
            .insert(key, value)
            .map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Get attestation count for an attester in the current rate limit window.
    pub fn get_attestation_count_in_window(
        &self,
        attester: &[u8; 32],
        current_time: u64,
    ) -> u32 {
        let rate_limits = self.rate_limits.read().unwrap_or_else(|p| p.into_inner());

        if let Some((count, window_start)) = rate_limits.get(attester) {
            // Check if we're still in the same window
            if current_time < *window_start + SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS {
                return *count;
            }
        }

        0
    }

    /// Increment attestation count for rate limiting.
    pub fn increment_attestation_count(&self, attester: &[u8; 32], current_time: u64) {
        let mut rate_limits = self.rate_limits.write().unwrap_or_else(|p| p.into_inner());

        let entry = rate_limits.entry(*attester).or_insert((0, current_time));

        // Reset if window expired
        if current_time >= entry.1 + SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS {
            entry.0 = 0;
            entry.1 = current_time;
        }

        entry.0 += 1;
    }

    /// Clean up expired rate limit entries.
    pub fn cleanup_rate_limits(&self, current_time: u64) {
        let mut rate_limits = self.rate_limits.write().unwrap_or_else(|p| p.into_inner());

        rate_limits.retain(|_, (_, window_start)| {
            current_time < *window_start + SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS * 2
        });
    }

    /// Get content hashes that have reached the spam threshold.
    ///
    /// Returns content hashes that should have accelerated decay applied.
    pub fn get_flagged_content(&self) -> Result<Vec<[u8; 32]>, SpamAttestationError> {
        use super::aggregation::aggregate_attestations;
        use std::collections::HashSet;

        let mut seen_content: HashSet<[u8; 32]> = HashSet::new();
        let mut flagged: Vec<[u8; 32]> = Vec::new();

        // Scan all attestations and aggregate
        for result in self.db.scan_prefix(ATTESTATION_PREFIX) {
            let (key, _value) =
                result.map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;

            // Extract content hash from key
            if key.len() >= ATTESTATION_PREFIX.len() + 32 {
                let mut content_hash = [0u8; 32];
                content_hash.copy_from_slice(
                    &key[ATTESTATION_PREFIX.len()..ATTESTATION_PREFIX.len() + 32],
                );

                if !seen_content.contains(&content_hash) {
                    seen_content.insert(content_hash);

                    // Get all attestations and check threshold
                    let attestations = self.get_attestations_for_content(&content_hash)?;
                    let counter_state = self.get_counter_state(&content_hash)?;
                    let aggregation =
                        aggregate_attestations(content_hash, &attestations, counter_state.is_cleared);

                    if aggregation.should_accelerate_decay {
                        flagged.push(content_hash);
                    }
                }
            }
        }

        Ok(flagged)
    }

    /// Delete all attestations for content (for pruning expired content).
    pub fn delete_attestations_for_content(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<u32, SpamAttestationError> {
        let mut prefix = Vec::with_capacity(ATTESTATION_PREFIX.len() + 32);
        prefix.extend_from_slice(ATTESTATION_PREFIX);
        prefix.extend_from_slice(content_hash);

        let mut count = 0u32;

        for result in self.db.scan_prefix(&prefix) {
            let (key, _) =
                result.map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;
            self.db
                .remove(key)
                .map_err(|e| SpamAttestationError::StorageError(e.to_string()))?;
            count += 1;
        }

        // Also delete counter-attestation state
        let mut counter_key = Vec::with_capacity(COUNTER_PREFIX.len() + 32);
        counter_key.extend_from_slice(COUNTER_PREFIX);
        counter_key.extend_from_slice(content_hash);
        let _ = self.db.remove(counter_key);

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spam_attestation::types::{SpamAttestation, SpamReason};

    fn create_test_store() -> SpamAttestationStore {
        let db = sled::Config::new().temporary(true).open().unwrap();
        SpamAttestationStore::open(db)
    }

    fn make_stored_attestation(
        content_hash: [u8; 32],
        attester: [u8; 32],
        tree_root: [u8; 32],
    ) -> StoredSpamAttestation {
        StoredSpamAttestation {
            attestation: SpamAttestation {
                content_hash,
                attester,
                reason: SpamReason::Advertising,
                timestamp: 1735689600,
                pow_nonce: 0,
                signature: [0u8; 64],
            },
            sponsor_tree_root: tree_root,
            is_deduplicated: false,
        }
    }

    #[test]
    fn test_put_and_get_attestation() {
        let store = create_test_store();
        let content_hash = [1u8; 32];
        let attester = [2u8; 32];
        let tree_root = [3u8; 32];

        let attestation = make_stored_attestation(content_hash, attester, tree_root);
        store.put_attestation(&attestation).unwrap();

        let retrieved = store.get_attestations_for_content(&content_hash).unwrap();
        assert_eq!(retrieved.len(), 1);
        assert_eq!(retrieved[0].attestation.attester, attester);
    }

    #[test]
    fn test_has_attestation() {
        let store = create_test_store();
        let content_hash = [1u8; 32];
        let attester = [2u8; 32];

        assert!(!store.has_attestation(&content_hash, &attester).unwrap());

        let attestation = make_stored_attestation(content_hash, attester, [3u8; 32]);
        store.put_attestation(&attestation).unwrap();

        assert!(store.has_attestation(&content_hash, &attester).unwrap());
        assert!(!store
            .has_attestation(&content_hash, &[99u8; 32])
            .unwrap());
    }

    #[test]
    fn test_counter_state() {
        let store = create_test_store();
        let content_hash = [1u8; 32];

        // Initially empty
        let state = store.get_counter_state(&content_hash).unwrap();
        assert!(!state.is_cleared);
        assert_eq!(state.count(), 0);

        // Add some counter-attestations
        let mut state = state;
        state.add_counter_attester([10u8; 32], 1735689600);
        state.add_counter_attester([11u8; 32], 1735689600);
        store.put_counter_state(&state).unwrap();

        // Retrieve and verify
        let retrieved = store.get_counter_state(&content_hash).unwrap();
        assert_eq!(retrieved.count(), 2);
        assert!(!retrieved.is_cleared);
    }

    #[test]
    fn test_rate_limiting() {
        let store = create_test_store();
        let attester = [1u8; 32];
        let current_time = 1735689600;

        assert_eq!(store.get_attestation_count_in_window(&attester, current_time), 0);

        store.increment_attestation_count(&attester, current_time);
        assert_eq!(store.get_attestation_count_in_window(&attester, current_time), 1);

        store.increment_attestation_count(&attester, current_time);
        assert_eq!(store.get_attestation_count_in_window(&attester, current_time), 2);

        // New window resets count
        let new_window = current_time + 3601; // 1 hour + 1 second
        assert_eq!(store.get_attestation_count_in_window(&attester, new_window), 0);
    }

    #[test]
    fn test_delete_attestations() {
        let store = create_test_store();
        let content_hash = [1u8; 32];

        // Add several attestations
        for i in 0..5 {
            let attestation = make_stored_attestation(content_hash, [i as u8; 32], [i as u8; 32]);
            store.put_attestation(&attestation).unwrap();
        }

        // Also add counter state
        let mut state = CounterAttestationState::empty(content_hash);
        state.add_counter_attester([10u8; 32], 1735689600);
        store.put_counter_state(&state).unwrap();

        // Verify they exist
        assert_eq!(store.get_attestations_for_content(&content_hash).unwrap().len(), 5);
        assert_eq!(store.get_counter_state(&content_hash).unwrap().count(), 1);

        // Delete
        let count = store.delete_attestations_for_content(&content_hash).unwrap();
        assert_eq!(count, 5);

        // Verify deleted
        assert_eq!(store.get_attestations_for_content(&content_hash).unwrap().len(), 0);
        assert_eq!(store.get_counter_state(&content_hash).unwrap().count(), 0);
    }
}
