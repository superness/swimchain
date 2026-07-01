//! Linear chain detection and flagging per SPEC_11 Section 7
//!
//! This module implements detection of suspicious linear sponsorship patterns
//! that may indicate manufactured trust chains (Sybil attacks). Key features:
//!
//! - **Detection**: Identifies chains with high linearity score (depth/breadth > 0.8)
//! - **Flagging**: Flags suspicious identities for manual review
//! - **Review System**: Supports Pending → Cleared/Confirmed status transitions
//! - **Appeal Mechanism**: Allows flagged identities to submit appeal reasons
//! - **Non-punitive**: Flagging doesn't auto-punish; only confirmed flags restrict rights
//!
//! Per SPEC_11 Section 4.4, an identity is flagged if EITHER:
//! 1. linearity_score > 0.8 AND depth >= 4
//! 2. depth >= 4 AND direct_sponsee_count <= 1 (single chain pattern)

use std::collections::{HashSet, VecDeque};

use sled::{Db, Tree};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::*;
use crate::types::identity::PublicKey;

/// Detector for suspicious linear sponsorship chains
pub struct LinearChainDetector {
    /// Sled tree: PublicKey(32) -> bincode LinearChainFlag
    flags: Tree,
    /// Configuration thresholds
    config: LinearChainConfig,
}

impl LinearChainDetector {
    /// Create detector from database with default config
    pub fn new(db: &Db) -> Result<Self, SponsorshipError> {
        Self::from_db(db, LinearChainConfig::default())
    }

    /// Create detector from database with custom config
    pub fn from_db(db: &Db, config: LinearChainConfig) -> Result<Self, SponsorshipError> {
        Ok(Self {
            flags: db.open_tree("linear_chain_flags")?,
            config,
        })
    }

    /// Get the current configuration
    pub fn config(&self) -> &LinearChainConfig {
        &self.config
    }

    /// Check identity and flag if suspicious
    ///
    /// Returns `Some(flag)` if newly flagged, `None` if already flagged or not suspicious.
    /// This operation is idempotent - calling multiple times won't create duplicate flags.
    ///
    /// # Arguments
    /// * `store` - The sponsorship store to query for metrics
    /// * `identity` - The identity to check
    /// * `current_time` - Current Unix timestamp
    pub fn check_and_flag(
        &self,
        store: &SponsorshipStore,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<Option<LinearChainFlag>, SponsorshipError> {
        // Already flagged? (idempotent)
        if self.is_flagged(identity)? {
            return Ok(None);
        }

        // Calculate metrics
        let metrics = store.calculate_linear_chain_metrics(identity)?;

        // Check if suspicious based on config
        if !metrics.is_flagged_with_config(&self.config) {
            return Ok(None);
        }

        // Create and store flag
        let flag = LinearChainFlag::new(&metrics, current_time);

        self.flags.insert(
            identity.as_bytes(),
            bincode::serialize(&flag)?,
        )?;

        Ok(Some(flag))
    }

    /// Check if identity is flagged (any status)
    pub fn is_flagged(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        Ok(self.flags.contains_key(identity.as_bytes())?)
    }

    /// Check if identity has pending (unreviewed) flag
    pub fn is_pending_review(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        match self.get_flag(identity)? {
            Some(flag) => Ok(flag.is_pending()),
            None => Ok(false),
        }
    }

    /// Check if identity has a confirmed (verified suspicious) flag
    pub fn is_confirmed(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        match self.get_flag(identity)? {
            Some(flag) => Ok(flag.is_confirmed()),
            None => Ok(false),
        }
    }

    /// Get flag record for an identity
    pub fn get_flag(&self, identity: &PublicKey) -> Result<Option<LinearChainFlag>, SponsorshipError> {
        match self.flags.get(identity.as_bytes())? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Get all pending flags for review
    ///
    /// Returns flags in no particular order. Caller should sort if needed.
    pub fn get_all_pending(&self) -> Result<Vec<LinearChainFlag>, SponsorshipError> {
        let mut pending = Vec::new();
        for item in self.flags.iter() {
            let (_, value) = item?;
            let flag: LinearChainFlag = bincode::deserialize(&value)?;
            if flag.is_pending() {
                pending.push(flag);
            }
        }
        Ok(pending)
    }

    /// Get all flags with any status
    pub fn get_all_flags(&self) -> Result<Vec<LinearChainFlag>, SponsorshipError> {
        let mut flags = Vec::new();
        for item in self.flags.iter() {
            let (_, value) = item?;
            let flag: LinearChainFlag = bincode::deserialize(&value)?;
            flags.push(flag);
        }
        Ok(flags)
    }

    /// Clear flag (legitimate mentorship chain confirmed)
    ///
    /// Marks the flag as reviewed and determined to be legitimate.
    /// Cleared identities regain full sponsorship rights.
    pub fn clear_flag(
        &self,
        identity: &PublicKey,
        reviewer_notes: Option<String>,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut flag) = self.get_flag(identity)? {
            flag.status = ReviewStatus::Cleared;
            flag.reviewer_notes = reviewer_notes;
            self.flags.insert(identity.as_bytes(), bincode::serialize(&flag)?)?;
        }
        Ok(())
    }

    /// Confirm flag (suspicious pattern verified)
    ///
    /// Marks the flag as reviewed and confirmed suspicious.
    /// Confirmed identities can only create probationary sponsorships.
    pub fn confirm_flag(
        &self,
        identity: &PublicKey,
        reviewer_notes: Option<String>,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut flag) = self.get_flag(identity)? {
            flag.status = ReviewStatus::Confirmed;
            flag.reviewer_notes = reviewer_notes;
            self.flags.insert(identity.as_bytes(), bincode::serialize(&flag)?)?;
        }
        Ok(())
    }

    /// Submit appeal for flagged identity
    ///
    /// Allows the flagged identity to provide context for why their
    /// pattern is legitimate (e.g., mentorship chain).
    pub fn submit_appeal(
        &self,
        identity: &PublicKey,
        reason: String,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut flag) = self.get_flag(identity)? {
            flag.appeal_reason = Some(reason);
            self.flags.insert(identity.as_bytes(), bincode::serialize(&flag)?)?;
        }
        Ok(())
    }

    /// Count total flags
    pub fn flag_count(&self) -> usize {
        self.flags.len()
    }

    /// Count pending flags
    pub fn pending_count(&self) -> Result<usize, SponsorshipError> {
        Ok(self.get_all_pending()?.len())
    }

    /// Count flagged identities in a sponsorship subtree
    ///
    /// Useful for space operators to see linear chain warnings in their space.
    ///
    /// # Arguments
    /// * `store` - The sponsorship store to traverse
    /// * `root` - Root of the subtree to count within
    pub fn count_flagged_in_subtree(
        &self,
        store: &SponsorshipStore,
        root: &PublicKey,
    ) -> Result<u32, SponsorshipError> {
        let mut count = 0;

        // Check root
        if self.is_flagged(root)? {
            count += 1;
        }

        // BFS through subtree
        let mut queue: VecDeque<PublicKey> = VecDeque::new();
        let mut visited: HashSet<[u8; 32]> = HashSet::new();

        for sponsee in store.get_sponsees(root)? {
            queue.push_back(sponsee);
        }
        visited.insert(*root.as_bytes());

        while let Some(current) = queue.pop_front() {
            if visited.contains(current.as_bytes()) {
                continue;
            }
            visited.insert(*current.as_bytes());

            if self.is_flagged(&current)? {
                count += 1;
            }

            for sponsee in store.get_sponsees(&current)? {
                if !visited.contains(sponsee.as_bytes()) {
                    queue.push_back(sponsee);
                }
            }
        }

        Ok(count)
    }

    /// Get all flagged identities in a subtree
    ///
    /// Returns all flags (any status) for identities in the subtree rooted at `root`.
    pub fn get_flagged_in_subtree(
        &self,
        store: &SponsorshipStore,
        root: &PublicKey,
    ) -> Result<Vec<LinearChainFlag>, SponsorshipError> {
        let mut flags = Vec::new();

        // Check root
        if let Some(flag) = self.get_flag(root)? {
            flags.push(flag);
        }

        // BFS through subtree
        let mut queue: VecDeque<PublicKey> = VecDeque::new();
        let mut visited: HashSet<[u8; 32]> = HashSet::new();

        for sponsee in store.get_sponsees(root)? {
            queue.push_back(sponsee);
        }
        visited.insert(*root.as_bytes());

        while let Some(current) = queue.pop_front() {
            if visited.contains(current.as_bytes()) {
                continue;
            }
            visited.insert(*current.as_bytes());

            if let Some(flag) = self.get_flag(&current)? {
                flags.push(flag);
            }

            for sponsee in store.get_sponsees(&current)? {
                if !visited.contains(sponsee.as_bytes()) {
                    queue.push_back(sponsee);
                }
            }
        }

        Ok(flags)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_env() -> (SponsorshipStore, LinearChainDetector, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();
        let detector = LinearChainDetector::new(&db).unwrap();
        (store, detector, temp_dir)
    }

    fn make_genesis(identity: [u8; 32]) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes(identity),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        }
    }

    fn make_sponsorship(identity: [u8; 32], sponsor: [u8; 32], depth: u8) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes(identity),
            sponsor: Some(PublicKey::from_bytes(sponsor)),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        }
    }

    #[test]
    fn test_check_and_flag_not_suspicious() {
        let (store, detector, _dir) = create_test_env();

        // Create wide tree: Genesis -> {A, B, C, D, E}
        store.put(&make_genesis([0u8; 32])).unwrap();
        for i in 1..=5 {
            store.put(&make_sponsorship([i; 32], [0u8; 32], 1)).unwrap();
        }

        // Genesis has depth 0 < 4, so not flagged
        let result = detector
            .check_and_flag(&store, &PublicKey::from_bytes([0u8; 32]), 1735689600)
            .unwrap();
        assert!(result.is_none());
        assert!(!detector.is_flagged(&PublicKey::from_bytes([0u8; 32])).unwrap());
    }

    #[test]
    fn test_check_and_flag_linear_chain() {
        let (store, detector, _dir) = create_test_env();

        // Create linear chain: G -> A -> B -> C -> D -> E (depth 5, breadth 1)
        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();
        store.put(&make_sponsorship([5u8; 32], [4u8; 32], 5)).unwrap();

        // Identity at depth 4 with linear subtree should be flagged
        // D (depth 4) has 1 sponsee (E), so linearity = 4/1 = 4.0 > 0.8
        let result = detector
            .check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600)
            .unwrap();

        assert!(result.is_some());
        let flag = result.unwrap();
        assert_eq!(flag.identity_bytes, [4u8; 32]);
        assert_eq!(flag.status, ReviewStatus::Pending);
        assert!(detector.is_flagged(&PublicKey::from_bytes([4u8; 32])).unwrap());
    }

    #[test]
    fn test_check_and_flag_idempotent() {
        let (store, detector, _dir) = create_test_env();

        // Create linear chain
        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();

        let identity = PublicKey::from_bytes([4u8; 32]);

        // First call flags
        let result1 = detector.check_and_flag(&store, &identity, 1735689600).unwrap();
        assert!(result1.is_some());

        // Second call returns None (already flagged)
        let result2 = detector.check_and_flag(&store, &identity, 1735689600).unwrap();
        assert!(result2.is_none());

        // Only one flag in store
        assert_eq!(detector.flag_count(), 1);
    }

    #[test]
    fn test_status_transitions() {
        let (store, detector, _dir) = create_test_env();

        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();

        let identity = PublicKey::from_bytes([4u8; 32]);

        // Flag the identity
        detector.check_and_flag(&store, &identity, 1735689600).unwrap();
        assert!(detector.is_pending_review(&identity).unwrap());
        assert!(!detector.is_confirmed(&identity).unwrap());

        // Clear the flag
        detector.clear_flag(&identity, Some("Legitimate mentorship".into())).unwrap();
        assert!(!detector.is_pending_review(&identity).unwrap());
        assert!(!detector.is_confirmed(&identity).unwrap());

        let flag = detector.get_flag(&identity).unwrap().unwrap();
        assert!(flag.is_cleared());
        assert_eq!(flag.reviewer_notes, Some("Legitimate mentorship".into()));
    }

    #[test]
    fn test_confirm_flag() {
        let (store, detector, _dir) = create_test_env();

        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();

        let identity = PublicKey::from_bytes([4u8; 32]);

        detector.check_and_flag(&store, &identity, 1735689600).unwrap();
        detector.confirm_flag(&identity, Some("Suspicious pattern verified".into())).unwrap();

        assert!(detector.is_confirmed(&identity).unwrap());
        assert!(!detector.is_pending_review(&identity).unwrap());
    }

    #[test]
    fn test_submit_appeal() {
        let (store, detector, _dir) = create_test_env();

        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();

        let identity = PublicKey::from_bytes([4u8; 32]);

        detector.check_and_flag(&store, &identity, 1735689600).unwrap();
        detector.submit_appeal(&identity, "This is a teaching organization chain".into()).unwrap();

        let flag = detector.get_flag(&identity).unwrap().unwrap();
        assert_eq!(flag.appeal_reason, Some("This is a teaching organization chain".into()));
        // Status should remain pending after appeal
        assert!(flag.is_pending());
    }

    #[test]
    fn test_get_all_pending() {
        let (store, detector, _dir) = create_test_env();

        // Create two flaggable identities
        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();
        store.put(&make_sponsorship([5u8; 32], [4u8; 32], 5)).unwrap();

        detector.check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600).unwrap();
        detector.check_and_flag(&store, &PublicKey::from_bytes([5u8; 32]), 1735689600).unwrap();

        // Confirm one
        detector.confirm_flag(&PublicKey::from_bytes([4u8; 32]), None).unwrap();

        // Only one pending
        let pending = detector.get_all_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].identity_bytes, [5u8; 32]);
    }

    #[test]
    fn test_count_flagged_in_subtree() {
        let (store, detector, _dir) = create_test_env();

        // Create tree with some flagged identities
        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();
        store.put(&make_sponsorship([5u8; 32], [4u8; 32], 5)).unwrap();

        // Flag identities at depth 4 and 5
        detector.check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600).unwrap();
        detector.check_and_flag(&store, &PublicKey::from_bytes([5u8; 32]), 1735689600).unwrap();

        // Count from genesis
        let count = detector.count_flagged_in_subtree(&store, &PublicKey::from_bytes([0u8; 32])).unwrap();
        assert_eq!(count, 2);

        // Count from depth 3 (includes 4 and 5)
        let count = detector.count_flagged_in_subtree(&store, &PublicKey::from_bytes([3u8; 32])).unwrap();
        assert_eq!(count, 2);

        // Count from depth 4 (includes self and 5)
        let count = detector.count_flagged_in_subtree(&store, &PublicKey::from_bytes([4u8; 32])).unwrap();
        assert_eq!(count, 2);

        // Count from depth 5 (only self)
        let count = detector.count_flagged_in_subtree(&store, &PublicKey::from_bytes([5u8; 32])).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_custom_config() {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();

        // Create detector with very lenient config (won't flag anything)
        let lenient_config = LinearChainConfig {
            linearity_threshold: 100.0, // Very high threshold - needs linearity > 100
            min_depth: 10,              // Very high depth - needs depth >= 10
            max_linear_breadth: 0,      // Only flag if 0 direct sponsees
        };
        let detector = LinearChainDetector::from_db(&db, lenient_config).unwrap();

        // Create chain that would normally be flagged with default config
        // G -> A -> B -> C -> D -> E (depth 5 at E)
        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();
        store.put(&make_sponsorship([5u8; 32], [4u8; 32], 5)).unwrap();

        // Identity at depth 4 would normally be flagged (depth >= 4, 1 sponsee)
        // But with lenient config: depth 4 < min_depth 10, so neither condition triggers
        let result = detector.check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600).unwrap();
        assert!(result.is_none(), "Identity at depth 4 should not be flagged with min_depth=10");

        // Identity at depth 5 is a leaf (0 sponsees), depth 5 < 10
        let result = detector.check_and_flag(&store, &PublicKey::from_bytes([5u8; 32]), 1735689600).unwrap();
        assert!(result.is_none(), "Identity at depth 5 should not be flagged with min_depth=10");

        // Now create a detector with default config and verify it DOES flag
        let default_detector = LinearChainDetector::new(&db).unwrap();
        let result = default_detector.check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600).unwrap();
        assert!(result.is_some(), "Identity at depth 4 should be flagged with default config");
    }

    #[test]
    fn test_get_flagged_in_subtree() {
        let (store, detector, _dir) = create_test_env();

        store.put(&make_genesis([0u8; 32])).unwrap();
        store.put(&make_sponsorship([1u8; 32], [0u8; 32], 1)).unwrap();
        store.put(&make_sponsorship([2u8; 32], [1u8; 32], 2)).unwrap();
        store.put(&make_sponsorship([3u8; 32], [2u8; 32], 3)).unwrap();
        store.put(&make_sponsorship([4u8; 32], [3u8; 32], 4)).unwrap();

        detector.check_and_flag(&store, &PublicKey::from_bytes([4u8; 32]), 1735689600).unwrap();

        let flags = detector.get_flagged_in_subtree(&store, &PublicKey::from_bytes([0u8; 32])).unwrap();
        assert_eq!(flags.len(), 1);
        assert_eq!(flags[0].identity_bytes, [4u8; 32]);
    }
}
