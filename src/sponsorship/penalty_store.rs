//! Penalty storage using sled
//!
//! Persists penalty records to disk with support for stacking rules per SPEC_11 Section 3.5.

use sled::{Db, Tree};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::penalty::{MisbehaviorSeverity, PenaltyRecord, PenaltyType};
use crate::types::identity::PublicKey;

use serde::{Deserialize, Serialize};

/// Warning for identities at hop 3+ (no actual penalty applied)
///
/// Per SPEC_11 §3.5, consequences beyond hop 2 are negligible (decay = 0.0),
/// but we record warnings for audit purposes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Warning {
    /// Identity receiving the warning
    pub identity: PublicKey,
    /// Identity that caused the warning
    pub caused_by: PublicKey,
    /// Severity of the original misbehavior
    pub severity: MisbehaviorSeverity,
    /// When the warning was recorded (UNIX seconds)
    pub timestamp: u64,
    /// Hop distance from offender
    pub hop_distance: u8,
}

/// Secondary index entry for by_cause lookups
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PenaltyReference {
    identity_bytes: [u8; 32],
    penalty_type: u8,
}

/// Penalty storage backed by sled
///
/// Manages penalty records with support for:
/// - Primary storage by identity
/// - Secondary index by cause (offender)
/// - Warning storage for hop 3+ cases
/// - Stacking rules per SPEC_11 §3.5
pub struct PenaltyStore {
    /// The sled database
    #[allow(dead_code)]
    db: Db,
    /// Primary: identity(32) -> bincode Vec<PenaltyRecord>
    penalties: Tree,
    /// Index: caused_by(32) -> bincode Vec<PenaltyReference>
    by_cause: Tree,
    /// Warnings for hop 3+: identity(32) -> bincode Vec<Warning>
    warnings: Tree,
}

impl PenaltyStore {
    /// Open or create from existing database
    pub fn from_db(db: &Db) -> Result<Self, SponsorshipError> {
        Ok(Self {
            db: db.clone(),
            penalties: db.open_tree("penalties")?,
            by_cause: db.open_tree("penalties_by_cause")?,
            warnings: db.open_tree("penalty_warnings")?,
        })
    }

    /// Get all penalties for an identity
    pub fn get_penalties(
        &self,
        identity: &PublicKey,
    ) -> Result<Vec<PenaltyRecord>, SponsorshipError> {
        match self.penalties.get(identity.as_bytes())? {
            Some(data) => Ok(bincode::deserialize(&data)?),
            None => Ok(Vec::new()),
        }
    }

    /// Get only active (non-expired) penalties for an identity
    pub fn get_active_penalties(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<Vec<PenaltyRecord>, SponsorshipError> {
        let penalties = self.get_penalties(identity)?;
        Ok(penalties
            .into_iter()
            .filter(|p| !p.is_expired(current_time))
            .collect())
    }

    /// Check if identity has any active penalty
    pub fn has_active_penalty(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<bool, SponsorshipError> {
        Ok(!self
            .get_active_penalties(identity, current_time)?
            .is_empty())
    }

    /// Check if identity has specific penalty type active
    pub fn has_penalty_type(
        &self,
        identity: &PublicKey,
        penalty_type: PenaltyType,
        current_time: u64,
    ) -> Result<bool, SponsorshipError> {
        let penalties = self.get_active_penalties(identity, current_time)?;
        Ok(penalties.iter().any(|p| p.penalty_type == penalty_type))
    }

    /// Store penalties for an identity (internal use)
    fn store_penalties(
        &self,
        identity: &PublicKey,
        penalties: &[PenaltyRecord],
    ) -> Result<(), SponsorshipError> {
        if penalties.is_empty() {
            self.penalties.remove(identity.as_bytes())?;
        } else {
            self.penalties
                .insert(identity.as_bytes(), bincode::serialize(penalties)?)?;
        }
        Ok(())
    }

    /// Apply a penalty with stacking rules per SPEC_11 §3.5
    ///
    /// Stacking rules:
    /// - If existing penalty of same type: extend if new.base_expires_at > existing.current_expires_at
    /// - Different penalty types: maintain separate records
    /// - Never extend beyond base_expires_at (invariant: current <= base)
    /// - PermanentRevocation: no stacking (already permanent)
    pub fn apply_penalty(&self, new_penalty: &PenaltyRecord) -> Result<(), SponsorshipError> {
        // Validate invariants
        new_penalty.validate_invariants()?;

        // Handle permanent revocation specially
        if new_penalty.penalty_type == PenaltyType::PermanentRevocation {
            let existing = self.get_penalties(&new_penalty.identity)?;
            if existing
                .iter()
                .any(|p| p.penalty_type == PenaltyType::PermanentRevocation)
            {
                // Already permanently revoked, no-op
                return Ok(());
            }
        }

        let mut penalties = self.get_penalties(&new_penalty.identity)?;
        let mut found = false;

        for p in &mut penalties {
            if p.penalty_type == new_penalty.penalty_type {
                // Same type: extend if beneficial
                if new_penalty.base_expires_at > p.current_expires_at {
                    // Extend to new penalty's base, but never exceed our original base
                    p.current_expires_at = new_penalty.base_expires_at.min(p.base_expires_at);

                    // If new penalty has later base, update our base too
                    if new_penalty.base_expires_at > p.base_expires_at {
                        p.base_expires_at = new_penalty.base_expires_at;
                        p.current_expires_at = new_penalty.base_expires_at;
                    }
                }
                found = true;
                break;
            }
        }

        if !found {
            penalties.push(new_penalty.clone());
        }

        self.store_penalties(&new_penalty.identity, &penalties)?;

        // Update by_cause index if applicable
        if let Some(ref caused_by) = new_penalty.caused_by {
            self.add_to_cause_index(caused_by, &new_penalty.identity, new_penalty.penalty_type)?;
        }

        Ok(())
    }

    /// Add entry to the by_cause index
    fn add_to_cause_index(
        &self,
        caused_by: &PublicKey,
        identity: &PublicKey,
        penalty_type: PenaltyType,
    ) -> Result<(), SponsorshipError> {
        let key = caused_by.as_bytes();
        let mut refs: Vec<PenaltyReference> = match self.by_cause.get(key)? {
            Some(data) => bincode::deserialize(&data)?,
            None => Vec::new(),
        };

        let new_ref = PenaltyReference {
            identity_bytes: *identity.as_bytes(),
            penalty_type: penalty_type as u8,
        };

        // Avoid duplicates
        if !refs.iter().any(|r| {
            r.identity_bytes == new_ref.identity_bytes && r.penalty_type == new_ref.penalty_type
        }) {
            refs.push(new_ref);
            self.by_cause.insert(key, bincode::serialize(&refs)?)?;
        }

        Ok(())
    }

    /// Get all penalties caused by an offender
    pub fn get_penalties_caused_by(
        &self,
        offender: &PublicKey,
    ) -> Result<Vec<PenaltyRecord>, SponsorshipError> {
        let refs: Vec<PenaltyReference> = match self.by_cause.get(offender.as_bytes())? {
            Some(data) => bincode::deserialize(&data)?,
            None => return Ok(Vec::new()),
        };

        let mut result = Vec::new();
        for r in refs {
            let identity = PublicKey::from_bytes(r.identity_bytes);
            let penalties = self.get_penalties(&identity)?;

            for p in penalties {
                if p.caused_by == Some(*offender) {
                    result.push(p);
                }
            }
        }

        Ok(result)
    }

    /// Remove expired penalties (cleanup operation)
    ///
    /// Returns the number of expired penalties removed.
    pub fn remove_expired_penalties(&self, current_time: u64) -> Result<usize, SponsorshipError> {
        let mut removed_count = 0;

        for item in self.penalties.iter() {
            let (key, value) = item?;
            let penalties: Vec<PenaltyRecord> = bincode::deserialize(&value)?;

            let active: Vec<PenaltyRecord> = penalties
                .into_iter()
                .filter(|p| {
                    let expired = p.is_expired(current_time);
                    if expired {
                        removed_count += 1;
                    }
                    !expired
                })
                .collect();

            if active.is_empty() {
                self.penalties.remove(&key)?;
            } else {
                self.penalties.insert(&key, bincode::serialize(&active)?)?;
            }
        }

        Ok(removed_count)
    }

    /// Record a warning for hop 3+ cases
    pub fn record_warning(&self, warning: &Warning) -> Result<(), SponsorshipError> {
        let key = warning.identity.as_bytes();
        let mut warnings: Vec<Warning> = match self.warnings.get(key)? {
            Some(data) => bincode::deserialize(&data)?,
            None => Vec::new(),
        };

        warnings.push(warning.clone());
        self.warnings.insert(key, bincode::serialize(&warnings)?)?;

        Ok(())
    }

    /// Get all warnings for an identity
    pub fn get_warnings(&self, identity: &PublicKey) -> Result<Vec<Warning>, SponsorshipError> {
        match self.warnings.get(identity.as_bytes())? {
            Some(data) => Ok(bincode::deserialize(&data)?),
            None => Ok(Vec::new()),
        }
    }

    /// Apply recovery by updating the current_expires_at for a penalty
    ///
    /// Returns true if the penalty was found and updated.
    pub fn apply_recovery(
        &self,
        identity: &PublicKey,
        penalty_type: PenaltyType,
        new_expires_at: u64,
    ) -> Result<bool, SponsorshipError> {
        let mut penalties = self.get_penalties(identity)?;
        let mut found = false;

        for p in &mut penalties {
            if p.penalty_type == penalty_type {
                // Don't allow recovery on permanent revocations
                if p.is_permanent() {
                    return Ok(false);
                }

                // Set new expiration (clamped to base)
                p.set_current_expires_at(new_expires_at);
                found = true;
                break;
            }
        }

        if found {
            self.store_penalties(identity, &penalties)?;
        }

        Ok(found)
    }

    /// Get total number of penalty records across all identities
    pub fn total_penalty_count(&self) -> Result<usize, SponsorshipError> {
        let mut count = 0;
        for item in self.penalties.iter() {
            let (_, value) = item?;
            let penalties: Vec<PenaltyRecord> = bincode::deserialize(&value)?;
            count += penalties.len();
        }
        Ok(count)
    }

    /// Get total number of warnings
    pub fn total_warning_count(&self) -> Result<usize, SponsorshipError> {
        let mut count = 0;
        for item in self.warnings.iter() {
            let (_, value) = item?;
            let warnings: Vec<Warning> = bincode::deserialize(&value)?;
            count += warnings.len();
        }
        Ok(count)
    }

    /// Flush to disk
    pub fn flush(&self) -> Result<(), SponsorshipError> {
        self.penalties.flush()?;
        self.by_cause.flush()?;
        self.warnings.flush()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::penalty::{ABUSE_PENALTY_SECONDS, SPAM_PENALTY_SECONDS};
    use tempfile::TempDir;

    fn create_test_store() -> (PenaltyStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = PenaltyStore::from_db(&db).unwrap();
        (store, temp_dir)
    }

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    #[test]
    fn test_apply_and_get_penalty() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        store.apply_penalty(&penalty).unwrap();

        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert_eq!(penalties.len(), 1);
        assert_eq!(penalties[0].penalty_type, PenaltyType::RestrictedPosting);
    }

    #[test]
    fn test_get_active_penalties() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        store.apply_penalty(&penalty).unwrap();

        // Before expiration
        let active = store.get_active_penalties(&test_pubkey(1), time).unwrap();
        assert_eq!(active.len(), 1);

        // After expiration
        let active = store
            .get_active_penalties(&test_pubkey(1), time + SPAM_PENALTY_SECONDS + 1)
            .unwrap();
        assert!(active.is_empty());
    }

    #[test]
    fn test_has_active_penalty() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        assert!(!store.has_active_penalty(&test_pubkey(1), time).unwrap());

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty).unwrap();

        assert!(store.has_active_penalty(&test_pubkey(1), time).unwrap());
        assert!(!store
            .has_active_penalty(&test_pubkey(1), time + SPAM_PENALTY_SECONDS + 1)
            .unwrap());
    }

    #[test]
    fn test_penalty_stacking_same_type_extends() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // First spam penalty
        let penalty1 = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty1).unwrap();

        // Second spam penalty at later time
        let penalty2 =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time + 1000);
        store.apply_penalty(&penalty2).unwrap();

        // Should still be one penalty, but extended
        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert_eq!(penalties.len(), 1);
        assert_eq!(
            penalties[0].base_expires_at,
            time + 1000 + SPAM_PENALTY_SECONDS
        );
    }

    #[test]
    fn test_penalty_stacking_different_types() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        // RestrictedPosting penalty
        let penalty1 = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty1).unwrap();

        // LostInviteSlots penalty
        let penalty2 = PenaltyRecord::for_sponsor(
            test_pubkey(1),
            test_pubkey(2),
            MisbehaviorSeverity::Spam,
            1,
            SPAM_PENALTY_SECONDS,
            time,
        );
        store.apply_penalty(&penalty2).unwrap();

        // Should have two separate penalties
        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert_eq!(penalties.len(), 2);
    }

    #[test]
    fn test_permanent_revocation_no_stacking() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty1 =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);
        store.apply_penalty(&penalty1).unwrap();

        // Try to apply another permanent revocation
        let penalty2 =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time + 1000);
        store.apply_penalty(&penalty2).unwrap();

        // Should still be just one
        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert_eq!(penalties.len(), 1);
    }

    #[test]
    fn test_get_penalties_caused_by() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let offender = test_pubkey(1);
        let sponsor1 = test_pubkey(2);
        let sponsor2 = test_pubkey(3);

        // Sponsor penalties caused by offender
        let penalty1 = PenaltyRecord::for_sponsor(
            sponsor1,
            offender,
            MisbehaviorSeverity::Abuse,
            1,
            ABUSE_PENALTY_SECONDS,
            time,
        );
        let penalty2 = PenaltyRecord::for_sponsor(
            sponsor2,
            offender,
            MisbehaviorSeverity::Abuse,
            2,
            SPAM_PENALTY_SECONDS,
            time,
        );

        store.apply_penalty(&penalty1).unwrap();
        store.apply_penalty(&penalty2).unwrap();

        let caused = store.get_penalties_caused_by(&offender).unwrap();
        assert_eq!(caused.len(), 2);
    }

    #[test]
    fn test_remove_expired_penalties() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty).unwrap();

        // Before expiration
        let removed = store.remove_expired_penalties(time).unwrap();
        assert_eq!(removed, 0);

        // After expiration
        let removed = store
            .remove_expired_penalties(time + SPAM_PENALTY_SECONDS + 1)
            .unwrap();
        assert_eq!(removed, 1);

        // Should be gone
        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert!(penalties.is_empty());
    }

    #[test]
    fn test_record_and_get_warnings() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let warning = Warning {
            identity: test_pubkey(1),
            caused_by: test_pubkey(2),
            severity: MisbehaviorSeverity::Spam,
            timestamp: time,
            hop_distance: 3,
        };

        store.record_warning(&warning).unwrap();

        let warnings = store.get_warnings(&test_pubkey(1)).unwrap();
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].hop_distance, 3);
    }

    #[test]
    fn test_apply_recovery() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);
        store.apply_penalty(&penalty).unwrap();

        // Apply recovery (50% reduction)
        let new_expires = time + ABUSE_PENALTY_SECONDS / 2;
        let updated = store
            .apply_recovery(&test_pubkey(1), PenaltyType::RestrictedPosting, new_expires)
            .unwrap();
        assert!(updated);

        let penalties = store.get_penalties(&test_pubkey(1)).unwrap();
        assert_eq!(penalties[0].current_expires_at, new_expires);
        // Base should be unchanged
        assert_eq!(penalties[0].base_expires_at, time + ABUSE_PENALTY_SECONDS);
    }

    #[test]
    fn test_apply_recovery_no_permanent() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);
        store.apply_penalty(&penalty).unwrap();

        // Try to apply recovery to permanent revocation
        let updated = store
            .apply_recovery(
                &test_pubkey(1),
                PenaltyType::PermanentRevocation,
                time + 1000,
            )
            .unwrap();
        assert!(!updated);
    }

    #[test]
    fn test_has_penalty_type() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty).unwrap();

        assert!(store
            .has_penalty_type(&test_pubkey(1), PenaltyType::RestrictedPosting, time)
            .unwrap());
        assert!(!store
            .has_penalty_type(&test_pubkey(1), PenaltyType::LostInviteSlots, time)
            .unwrap());
    }

    #[test]
    fn test_total_counts() {
        let (store, _dir) = create_test_store();
        let time = 1735689600;

        assert_eq!(store.total_penalty_count().unwrap(), 0);
        assert_eq!(store.total_warning_count().unwrap(), 0);

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);
        store.apply_penalty(&penalty).unwrap();

        let warning = Warning {
            identity: test_pubkey(2),
            caused_by: test_pubkey(1),
            severity: MisbehaviorSeverity::Spam,
            timestamp: time,
            hop_distance: 3,
        };
        store.record_warning(&warning).unwrap();

        assert_eq!(store.total_penalty_count().unwrap(), 1);
        assert_eq!(store.total_warning_count().unwrap(), 1);
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let identity = test_pubkey(1);
        let time = 1735689600;

        // Create store and add penalty
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = PenaltyStore::from_db(&db).unwrap();

            let penalty = PenaltyRecord::for_offender(identity, MisbehaviorSeverity::Abuse, time);
            store.apply_penalty(&penalty).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = PenaltyStore::from_db(&db).unwrap();

            let penalties = store.get_penalties(&identity).unwrap();
            assert_eq!(penalties.len(), 1);
            assert_eq!(penalties[0].severity, MisbehaviorSeverity::Abuse);
        }
    }
}
