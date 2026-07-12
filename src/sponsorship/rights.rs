//! Sponsorship rights tracking for capacity enforcement
//!
//! Per SPEC_11 Section 4.1, sponsors have cooldown periods between
//! sponsorships. With PoW-only gating, level-based capacity limits
//! are removed.

use serde::{Deserialize, Serialize};
use sled::{Db, Tree};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::types::{SPONSORSHIP_COOLDOWN_SECONDS, SPONSORSHIP_WINDOW_SECONDS};
use crate::types::identity::PublicKey;

/// Tracks sponsorship activity for capacity enforcement
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SponsorshipRightsRecord {
    /// Identity this record tracks
    pub identity: PublicKey,
    /// Start of current 30-day window (Unix timestamp)
    pub window_start: u64,
    /// Number of sponsorships created in current window
    pub sponsorships_in_window: u8,
    /// Timestamp of most recent sponsorship (None if never sponsored)
    pub last_sponsorship_at: Option<u64>,
}

impl SponsorshipRightsRecord {
    /// Create a new record for an identity
    #[must_use]
    pub fn new(identity: PublicKey, current_time: u64) -> Self {
        Self {
            identity,
            window_start: current_time,
            sponsorships_in_window: 0,
            last_sponsorship_at: None,
        }
    }

    /// Check if window has expired and should be reset
    #[must_use]
    pub fn is_window_expired(&self, current_time: u64) -> bool {
        current_time >= self.window_start.saturating_add(SPONSORSHIP_WINDOW_SECONDS)
    }

    /// Check if cooldown is active
    #[must_use]
    pub fn is_cooldown_active(&self, current_time: u64) -> bool {
        self.last_sponsorship_at
            .map(|t| current_time < t.saturating_add(SPONSORSHIP_COOLDOWN_SECONDS))
            .unwrap_or(false)
    }

    /// Get when cooldown expires (None if not on cooldown)
    #[must_use]
    pub fn cooldown_expires_at(&self) -> Option<u64> {
        self.last_sponsorship_at
            .map(|t| t.saturating_add(SPONSORSHIP_COOLDOWN_SECONDS))
    }
}

/// Result of checking if a sponsor can create a new sponsorship
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SponsorshipCapacityInfo {
    /// Whether the sponsor can create a new sponsorship now
    pub can_sponsor: bool,
    /// Remaining slots in current window (None if unlimited)
    pub remaining_slots: Option<u8>,
    /// When next slot becomes available (None if available now or unlimited)
    pub next_available_at: Option<u64>,
    /// Reason sponsorship is denied (None if allowed)
    pub denial_reason: Option<SponsorshipError>,
}

impl SponsorshipCapacityInfo {
    /// Create a "can sponsor" result
    #[must_use]
    pub fn allowed(remaining: Option<u8>) -> Self {
        Self {
            can_sponsor: true,
            remaining_slots: remaining,
            next_available_at: None,
            denial_reason: None,
        }
    }

    /// Create a "cannot sponsor" result
    #[must_use]
    pub fn denied(reason: SponsorshipError, next_available: Option<u64>) -> Self {
        Self {
            can_sponsor: false,
            remaining_slots: Some(0),
            next_available_at: next_available,
            denial_reason: Some(reason),
        }
    }
}

/// Storage for sponsorship rights records
pub struct RightsStore {
    #[allow(dead_code)]
    db: Db,
    rights: Tree,
}

impl RightsStore {
    /// Open or create rights store from existing database
    pub fn from_db(db: &Db) -> Result<Self, SponsorshipError> {
        Ok(Self {
            db: db.clone(),
            rights: db.open_tree("sponsorship_rights")?,
        })
    }

    /// Get rights record for an identity
    pub fn get(
        &self,
        identity: &PublicKey,
    ) -> Result<Option<SponsorshipRightsRecord>, SponsorshipError> {
        match self.rights.get(identity.as_bytes())? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Store a rights record
    pub fn put(&self, record: &SponsorshipRightsRecord) -> Result<(), SponsorshipError> {
        let key = record.identity.as_bytes();
        let value = bincode::serialize(record)?;
        self.rights.insert(key, value)?;
        Ok(())
    }

    /// Get or create rights record, resetting window if expired
    ///
    /// Handles clock skew by treating current_time < window_start as valid
    /// (window hasn't started counting yet from current perspective)
    pub fn get_or_create(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<SponsorshipRightsRecord, SponsorshipError> {
        match self.get(identity)? {
            Some(mut record) => {
                // Reset window if expired
                if record.is_window_expired(current_time) {
                    record.window_start = current_time;
                    record.sponsorships_in_window = 0;
                    // Note: last_sponsorship_at is NOT reset - cooldown persists
                    self.put(&record)?;
                }
                Ok(record)
            }
            None => {
                let record = SponsorshipRightsRecord::new(*identity, current_time);
                self.put(&record)?;
                Ok(record)
            }
        }
    }

    /// Record a new sponsorship (atomic update)
    ///
    /// Uses compare-and-swap to prevent race conditions
    pub fn record_sponsorship(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<(), SponsorshipError> {
        let key = identity.as_bytes();

        loop {
            let old_value = self.rights.get(key)?;
            let mut record = match &old_value {
                Some(data) => bincode::deserialize(data)?,
                None => SponsorshipRightsRecord::new(*identity, current_time),
            };

            // Reset window if expired before incrementing
            if record.is_window_expired(current_time) {
                record.window_start = current_time;
                record.sponsorships_in_window = 0;
            }

            record.sponsorships_in_window = record.sponsorships_in_window.saturating_add(1);
            record.last_sponsorship_at = Some(current_time);

            let new_value = bincode::serialize(&record)?;

            match self.rights.compare_and_swap(
                key,
                old_value.as_ref().map(|v| v.as_ref()),
                Some(new_value),
            )? {
                Ok(()) => return Ok(()),
                Err(_) => continue, // Retry on conflict
            }
        }
    }

    /// Check if a sponsor can create a new sponsorship
    ///
    /// # Arguments
    /// * `sponsor` - The sponsor's public key
    /// * `current_time` - Current Unix timestamp
    /// * `is_under_penalty` - Closure to check if sponsor is under penalty
    ///
    /// # Check Order (per SPEC_11 Section 4.1)
    /// 1. Penalty status
    /// 2. Cooldown (1 hour minimum between sponsorships)
    ///
    /// Note: With PoW-only gating, level-based capacity limits are removed.
    /// All identities can sponsor, subject to cooldown and penalty checks.
    pub fn can_sponsor<F>(
        &self,
        sponsor: &PublicKey,
        current_time: u64,
        is_under_penalty: F,
    ) -> Result<SponsorshipCapacityInfo, SponsorshipError>
    where
        F: FnOnce(&PublicKey, u64) -> bool,
    {
        // 1. Check penalty status
        if is_under_penalty(sponsor, current_time) {
            return Ok(SponsorshipCapacityInfo::denied(
                SponsorshipError::SponsorRestricted,
                None, // Unknown when penalty expires from here
            ));
        }

        // 2. Get/create rights record (handles window reset)
        let record = self.get_or_create(sponsor, current_time)?;

        // 3. Check cooldown
        if record.is_cooldown_active(current_time) {
            let available_at = record.cooldown_expires_at().unwrap_or(current_time);
            return Ok(SponsorshipCapacityInfo::denied(
                SponsorshipError::SponsorOnCooldown { available_at },
                Some(available_at),
            ));
        }

        // All checks passed - unlimited capacity with PoW-only gating
        Ok(SponsorshipCapacityInfo::allowed(None))
    }

    /// Flush to disk
    pub fn flush(&self) -> Result<(), SponsorshipError> {
        self.rights.flush()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;
    use tempfile::TempDir;

    fn setup_test_store() -> (TempDir, RightsStore) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = RightsStore::from_db(&db).unwrap();
        (temp_dir, store)
    }

    fn test_identity() -> PublicKey {
        PublicKey::from_bytes([1u8; 32])
    }

    #[test]
    fn test_can_sponsor_no_restrictions() {
        let (_temp, store) = setup_test_store();
        let identity = test_identity();

        // With PoW-only gating, any identity can sponsor
        let result = store.can_sponsor(&identity, 1000, |_, _| false).unwrap();

        assert!(result.can_sponsor);
        assert_eq!(result.remaining_slots, None); // Unlimited
        assert!(result.denial_reason.is_none());
    }

    #[test]
    fn test_cooldown_active() {
        let (_temp, store) = setup_test_store();
        let identity = test_identity();

        // Record sponsorship at time 1000
        store.record_sponsorship(&identity, 1000).unwrap();

        // Try 30 min later (1800 seconds) - cooldown is 3600 seconds
        let result = store.can_sponsor(&identity, 2800, |_, _| false).unwrap();

        assert!(!result.can_sponsor);
        match &result.denial_reason {
            Some(SponsorshipError::SponsorOnCooldown { available_at }) => {
                assert_eq!(*available_at, 1000 + SPONSORSHIP_COOLDOWN_SECONDS);
            }
            _ => panic!("Expected SponsorOnCooldown error"),
        }
    }

    #[test]
    fn test_cooldown_expired() {
        let (_temp, store) = setup_test_store();
        let identity = test_identity();

        // Record sponsorship at time 1000
        store.record_sponsorship(&identity, 1000).unwrap();

        // Try 2 hours later (7200 seconds) - cooldown is 3600 seconds
        let result = store.can_sponsor(&identity, 8200, |_, _| false).unwrap();

        assert!(result.can_sponsor);
        assert_eq!(result.remaining_slots, None); // Unlimited with PoW-only gating
    }

    #[test]
    fn test_window_reset_exactly_30_days() {
        let (_temp, store) = setup_test_store();
        let identity = test_identity();

        // Record sponsorship at time 1000
        store.record_sponsorship(&identity, 1000).unwrap();

        // Check exactly 30 days later (should reset window)
        let time_at_30_days = 1000 + SPONSORSHIP_WINDOW_SECONDS;
        let result = store
            .can_sponsor(&identity, time_at_30_days, |_, _| false)
            .unwrap();

        assert!(result.can_sponsor);
        assert_eq!(result.remaining_slots, None); // Unlimited with PoW-only gating
    }

    #[test]
    fn test_penalty_blocks_sponsorship() {
        let (_temp, store) = setup_test_store();
        let identity = test_identity();

        let result = store
            .can_sponsor(&identity, 1000, |_, _| true) // penalty
            .unwrap();

        assert!(!result.can_sponsor);
        assert!(matches!(
            result.denial_reason,
            Some(SponsorshipError::SponsorRestricted)
        ));
    }

    #[test]
    fn test_storage_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let identity = test_identity();

        // Create and populate store
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = RightsStore::from_db(&db).unwrap();
            store.record_sponsorship(&identity, 1000).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = RightsStore::from_db(&db).unwrap();
            let record = store.get(&identity).unwrap().unwrap();
            assert_eq!(record.sponsorships_in_window, 1);
            assert_eq!(record.last_sponsorship_at, Some(1000));
        }
    }

    #[test]
    fn test_atomic_record_sponsorship() {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = Arc::new(RightsStore::from_db(&db).unwrap());
        let identity = test_identity();

        let handles: Vec<_> = (0..10)
            .map(|i| {
                let store = Arc::clone(&store);
                let id = identity;
                thread::spawn(move || {
                    store.record_sponsorship(&id, 1000 + i as u64).unwrap();
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        let record = store.get(&identity).unwrap().unwrap();
        assert_eq!(record.sponsorships_in_window, 10);
    }

    #[test]
    fn test_rights_record_serialization() {
        let record = SponsorshipRightsRecord {
            identity: test_identity(),
            window_start: 1000,
            sponsorships_in_window: 5,
            last_sponsorship_at: Some(2000),
        };

        let bytes = bincode::serialize(&record).unwrap();
        let decoded: SponsorshipRightsRecord = bincode::deserialize(&bytes).unwrap();

        assert_eq!(record, decoded);
    }

    #[test]
    fn test_capacity_info_allowed() {
        let info = SponsorshipCapacityInfo::allowed(Some(3));
        assert!(info.can_sponsor);
        assert_eq!(info.remaining_slots, Some(3));
        assert!(info.denial_reason.is_none());
    }

    #[test]
    fn test_capacity_info_denied() {
        let info = SponsorshipCapacityInfo::denied(SponsorshipError::InsufficientLevel, Some(5000));
        assert!(!info.can_sponsor);
        assert_eq!(info.remaining_slots, Some(0));
        assert_eq!(info.next_available_at, Some(5000));
        assert!(info.denial_reason.is_some());
    }
}
