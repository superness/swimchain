//! Reputation storage using sled database
//!
//! Provides persistent storage for PosterReputation records.

use sled::Db;

use super::error::ReputationError;
use super::types::PosterReputation;

/// Sled tree name for reputation records
const REPUTATION_TREE: &str = "identity_reputation";

/// Reputation storage backed by sled database.
pub struct ReputationStore {
    /// Reputation records tree
    reputations: sled::Tree,
}

impl ReputationStore {
    /// Open a reputation store with the given database.
    pub fn open(db: Db) -> Self {
        let reputations = db.open_tree(REPUTATION_TREE).expect("Failed to open reputation tree");
        Self { reputations }
    }

    /// Get the reputation record for an identity.
    ///
    /// Returns `Ok(None)` if no record exists.
    pub fn get(&self, identity: &[u8; 32]) -> Result<Option<PosterReputation>, ReputationError> {
        match self.reputations.get(identity)? {
            Some(bytes) => {
                let rep = PosterReputation::from_bytes(&bytes)
                    .ok_or_else(|| ReputationError::StorageError("Invalid reputation bytes".into()))?;
                Ok(Some(rep))
            }
            None => Ok(None),
        }
    }

    /// Get the reputation record for an identity, creating a new one if it doesn't exist.
    pub fn get_or_create(&self, identity: &[u8; 32]) -> Result<PosterReputation, ReputationError> {
        match self.get(identity)? {
            Some(rep) => Ok(rep),
            None => {
                let rep = PosterReputation::new(*identity);
                self.put(&rep)?;
                Ok(rep)
            }
        }
    }

    /// Store a reputation record.
    pub fn put(&self, rep: &PosterReputation) -> Result<(), ReputationError> {
        let bytes = rep.to_bytes();
        self.reputations.insert(&rep.identity, bytes)?;
        Ok(())
    }

    /// Update reputation with a function.
    ///
    /// This atomically reads, modifies, and writes the reputation.
    pub fn update<F>(&self, identity: &[u8; 32], f: F) -> Result<PosterReputation, ReputationError>
    where
        F: FnOnce(&mut PosterReputation),
    {
        let mut rep = self.get_or_create(identity)?;
        f(&mut rep);
        self.put(&rep)?;
        Ok(rep)
    }

    /// Record a spam flag against an identity.
    pub fn record_spam_flag(
        &self,
        identity: &[u8; 32],
        timestamp: u64,
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.receive_spam_flag(timestamp);
        })
    }

    /// Record a counter-attestation clearing a spam flag.
    pub fn record_counter(
        &self,
        identity: &[u8; 32],
        timestamp: u64,
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.receive_counter(timestamp);
        })
    }

    /// Record an illegal content flag against an identity.
    pub fn record_illegal_flag(
        &self,
        identity: &[u8; 32],
        timestamp: u64,
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.receive_illegal_flag(timestamp);
        })
    }

    /// Record that this identity's attestation was countered.
    pub fn record_attestation_countered(
        &self,
        identity: &[u8; 32],
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.attestation_countered();
        })
    }

    /// Record that this identity successfully counter-attested.
    pub fn record_counter_success(
        &self,
        identity: &[u8; 32],
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.counter_success();
        })
    }

    /// Record a quality attestation for an identity.
    pub fn record_quality_attestation(
        &self,
        identity: &[u8; 32],
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.receive_quality_attestation();
        })
    }

    /// Update identity age.
    pub fn update_age(
        &self,
        identity: &[u8; 32],
        age_days: u32,
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.update_age(age_days);
        })
    }

    /// Record a new post by this identity.
    pub fn record_post(&self, identity: &[u8; 32]) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.record_post();
        })
    }

    /// Record an engagement by this identity.
    pub fn record_engagement(
        &self,
        identity: &[u8; 32],
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.record_engagement();
        })
    }

    /// Update reputation score based on current time.
    ///
    /// Call this periodically to include time-based recovery bonus.
    pub fn refresh_score(
        &self,
        identity: &[u8; 32],
        current_time: u64,
    ) -> Result<PosterReputation, ReputationError> {
        self.update(identity, |rep| {
            rep.update_score(current_time);
        })
    }

    /// Get the current reputation score for an identity.
    ///
    /// Returns 100 (base score) if no record exists.
    pub fn get_score(&self, identity: &[u8; 32]) -> Result<i32, ReputationError> {
        match self.get(identity)? {
            Some(rep) => Ok(rep.cached_score),
            None => Ok(100), // Default base score
        }
    }

    /// Check if identity is at or below a score threshold.
    pub fn is_below_threshold(&self, identity: &[u8; 32], threshold: i32) -> Result<bool, ReputationError> {
        let score = self.get_score(identity)?;
        Ok(score <= threshold)
    }

    /// Check if identity has any illegal content flags.
    pub fn has_illegal_flags(&self, identity: &[u8; 32]) -> Result<bool, ReputationError> {
        match self.get(identity)? {
            Some(rep) => Ok(rep.has_illegal_flags()),
            None => Ok(false),
        }
    }

    /// Get all identities with reputation below a threshold.
    ///
    /// Useful for identifying problematic accounts.
    pub fn get_identities_below_threshold(
        &self,
        threshold: i32,
    ) -> Result<Vec<[u8; 32]>, ReputationError> {
        let mut result = Vec::new();

        for item in self.reputations.iter() {
            let (key, value) = item?;
            if let Some(rep) = PosterReputation::from_bytes(&value) {
                if rep.cached_score <= threshold {
                    let mut identity = [0u8; 32];
                    identity.copy_from_slice(&key);
                    result.push(identity);
                }
            }
        }

        Ok(result)
    }

    /// Get count of all reputation records.
    pub fn count(&self) -> usize {
        self.reputations.len()
    }

    /// Check if a reputation record exists for identity.
    pub fn exists(&self, identity: &[u8; 32]) -> Result<bool, ReputationError> {
        Ok(self.reputations.contains_key(identity)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_store() -> ReputationStore {
        let db = sled::Config::new().temporary(true).open().unwrap();
        ReputationStore::open(db)
    }

    #[test]
    fn test_get_nonexistent() {
        let store = create_test_store();
        let result = store.get(&[1u8; 32]).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_or_create() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.get_or_create(&identity).unwrap();
        assert_eq!(rep.identity, identity);
        assert_eq!(rep.cached_score, 100);

        // Second call should return the same record
        let rep2 = store.get_or_create(&identity).unwrap();
        assert_eq!(rep.identity, rep2.identity);
    }

    #[test]
    fn test_put_and_get() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let mut rep = PosterReputation::new(identity);
        rep.spam_flags_received = 5;
        rep.quality_attestations = 10;

        store.put(&rep).unwrap();

        let loaded = store.get(&identity).unwrap().unwrap();
        assert_eq!(loaded.spam_flags_received, 5);
        assert_eq!(loaded.quality_attestations, 10);
    }

    #[test]
    fn test_record_spam_flag() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.record_spam_flag(&identity, 1735689600).unwrap();
        assert_eq!(rep.spam_flags_received, 1);
        assert_eq!(rep.cached_score, 80); // 100 - 20
    }

    #[test]
    fn test_record_counter() {
        let store = create_test_store();
        let identity = [1u8; 32];

        // First get a spam flag
        store.record_spam_flag(&identity, 1735689600).unwrap();

        // Then counter it
        let rep = store.record_counter(&identity, 1735689700).unwrap();
        assert_eq!(rep.spam_flags_countered, 1);
        assert_eq!(rep.cached_score, 105); // 100 - 20 + 15 + 10
    }

    #[test]
    fn test_record_illegal_flag() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.record_illegal_flag(&identity, 1735689600).unwrap();
        assert_eq!(rep.illegal_content_flags, 1);
        assert!(rep.has_illegal_flags());
        assert_eq!(rep.cached_score, -900); // 100 - 1000
    }

    #[test]
    fn test_record_attestation_countered() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.record_attestation_countered(&identity).unwrap();
        assert_eq!(rep.attester_countered_count, 1);
        assert_eq!(rep.cached_score, 70); // 100 - 30
    }

    #[test]
    fn test_record_counter_success() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.record_counter_success(&identity).unwrap();
        assert_eq!(rep.counter_attestation_successes, 1);
        assert_eq!(rep.cached_score, 103); // 100 + 3
    }

    #[test]
    fn test_record_quality_attestation() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.record_quality_attestation(&identity).unwrap();
        assert_eq!(rep.quality_attestations, 1);
        assert_eq!(rep.cached_score, 105); // 100 + 5
    }

    #[test]
    fn test_update_age() {
        let store = create_test_store();
        let identity = [1u8; 32];

        let rep = store.update_age(&identity, 100).unwrap();
        assert_eq!(rep.identity_age_days, 100);
        assert_eq!(rep.cached_score, 200); // 100 + 100
    }

    #[test]
    fn test_record_post() {
        let store = create_test_store();
        let identity = [1u8; 32];

        store.record_post(&identity).unwrap();
        store.record_post(&identity).unwrap();

        let rep = store.get(&identity).unwrap().unwrap();
        assert_eq!(rep.total_posts, 2);
    }

    #[test]
    fn test_record_engagement() {
        let store = create_test_store();
        let identity = [1u8; 32];

        store.record_engagement(&identity).unwrap();
        let rep = store.get(&identity).unwrap().unwrap();
        assert_eq!(rep.total_engagements, 1);
    }

    #[test]
    fn test_get_score() {
        let store = create_test_store();
        let identity = [1u8; 32];

        // Non-existent returns base score
        assert_eq!(store.get_score(&identity).unwrap(), 100);

        // After modification
        store.record_spam_flag(&identity, 1735689600).unwrap();
        assert_eq!(store.get_score(&identity).unwrap(), 80);
    }

    #[test]
    fn test_is_below_threshold() {
        let store = create_test_store();
        let identity = [1u8; 32];

        // Base score is 100
        assert!(!store.is_below_threshold(&identity, 50).unwrap());

        // Add spam flags to lower score
        store.record_spam_flag(&identity, 1735689600).unwrap();
        store.record_spam_flag(&identity, 1735689600).unwrap();
        store.record_spam_flag(&identity, 1735689600).unwrap();
        // Score is now 40 (100 - 60)

        assert!(store.is_below_threshold(&identity, 50).unwrap());
    }

    #[test]
    fn test_has_illegal_flags() {
        let store = create_test_store();
        let identity = [1u8; 32];

        assert!(!store.has_illegal_flags(&identity).unwrap());

        store.record_illegal_flag(&identity, 1735689600).unwrap();
        assert!(store.has_illegal_flags(&identity).unwrap());
    }

    #[test]
    fn test_get_identities_below_threshold() {
        let store = create_test_store();

        // Create a few identities with different scores
        store.get_or_create(&[1u8; 32]).unwrap(); // 100
        store.record_spam_flag(&[2u8; 32], 1735689600).unwrap(); // 80
        store.record_spam_flag(&[3u8; 32], 1735689600).unwrap();
        store.record_spam_flag(&[3u8; 32], 1735689600).unwrap();
        store.record_spam_flag(&[3u8; 32], 1735689600).unwrap(); // 40

        let below_50 = store.get_identities_below_threshold(50).unwrap();
        assert_eq!(below_50.len(), 1);
        assert_eq!(below_50[0], [3u8; 32]);

        let below_90 = store.get_identities_below_threshold(90).unwrap();
        assert_eq!(below_90.len(), 2);
    }

    #[test]
    fn test_count() {
        let store = create_test_store();

        assert_eq!(store.count(), 0);

        store.get_or_create(&[1u8; 32]).unwrap();
        store.get_or_create(&[2u8; 32]).unwrap();

        assert_eq!(store.count(), 2);
    }

    #[test]
    fn test_exists() {
        let store = create_test_store();
        let identity = [1u8; 32];

        assert!(!store.exists(&identity).unwrap());

        store.get_or_create(&identity).unwrap();

        assert!(store.exists(&identity).unwrap());
    }

    #[test]
    fn test_refresh_score_with_recovery() {
        let store = create_test_store();
        let identity = [1u8; 32];

        // Get spam flag
        store.record_spam_flag(&identity, 1735689600).unwrap();
        assert_eq!(store.get_score(&identity).unwrap(), 80);

        // 30 days later - should include recovery
        let later = 1735689600 + 30 * 86400;
        let rep = store.refresh_score(&identity, later).unwrap();

        // Score should include recovery: 100 - 20 + 30 = 110
        assert_eq!(rep.cached_score, 110);
    }
}
