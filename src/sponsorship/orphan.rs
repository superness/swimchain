//! Orphan handling for the sponsorship system
//!
//! Implements SPEC_11 Section 3.2: Orphan Handling
//!
//! An identity becomes orphaned when:
//! - Their sponsor becomes permanently inactive (>90 days without activity)
//! - Their sponsor is permanently revoked (illegal content)
//!
//! Orphaned identities have a 30-day grace period during which they retain
//! full capabilities. After the grace period, they remain functional but
//! can only sponsor others if they've reached Anchor level or above.
//!
//! PoolKeeper-level identities can adopt orphaned identities that are past
//! their grace period, giving them a new sponsor and a clean slate.

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::{
    SponsorshipStatus, StoredSponsorship, ORPHAN_GRACE_PERIOD_SECONDS,
    ORPHAN_INACTIVITY_THRESHOLD_SECONDS,
};
use crate::types::identity::{PublicKey, Signature};

/// Interval for orphan detection scans (1 day)
pub const ORPHAN_SCAN_INTERVAL_SECONDS: u64 = 86_400;

/// Reason why an identity became orphaned
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrphanReason {
    /// Sponsor has been inactive beyond threshold (90 days)
    SponsorInactive {
        /// When the sponsor was last active
        last_seen: u64,
    },
    /// Sponsor was permanently revoked (illegal content)
    SponsorRevoked,
}

/// Information about an orphaned identity
#[derive(Debug, Clone)]
pub struct OrphanInfo {
    /// The orphaned identity's public key
    pub identity: PublicKey,
    /// Reason for orphaning
    pub reason: OrphanReason,
    /// When the identity was detected as orphaned
    pub detected_at: u64,
    /// When the grace period expires
    pub grace_expires_at: u64,
    /// Whether the identity is past grace period and eligible for adoption
    pub eligible_for_adoption: bool,
}

impl OrphanInfo {
    /// Create new OrphanInfo
    pub fn new(identity: PublicKey, reason: OrphanReason, current_time: u64) -> Self {
        let grace_expires = current_time + ORPHAN_GRACE_PERIOD_SECONDS;
        Self {
            identity,
            reason,
            detected_at: current_time,
            grace_expires_at: grace_expires,
            eligible_for_adoption: false, // Not eligible until grace expires
        }
    }

    /// Update adoption eligibility based on current time
    pub fn with_adoption_eligibility(mut self, current_time: u64) -> Self {
        self.eligible_for_adoption = current_time >= self.grace_expires_at;
        self
    }
}

/// Capabilities available to orphaned identities
///
/// Per SPEC_11 Section 3.2, orphaned identities retain most capabilities.
/// With PoW-only gating, sponsoring ability is determined by PoW requirements.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OrphanCapabilities {
    /// Can create new posts
    pub can_post: bool,
    /// Can reply to existing posts
    pub can_reply: bool,
    /// Can engage (like, share, etc.)
    pub can_engage: bool,
    /// Can sponsor new identities
    pub can_sponsor: bool,
}

impl OrphanCapabilities {
    /// Capabilities during grace period (full access)
    pub fn during_grace_period() -> Self {
        Self {
            can_post: true,
            can_reply: true,
            can_engage: true,
            can_sponsor: true,
        }
    }

    /// Capabilities after grace period (same as during, per current design)
    pub fn after_grace_period() -> Self {
        Self {
            can_post: true,
            can_reply: true,
            can_engage: true,
            can_sponsor: true,
        }
    }
}

/// Request to adopt an orphaned identity
#[derive(Debug, Clone)]
pub struct AdoptionRequest {
    /// The PoolKeeper adopting the orphan
    pub adopter: PublicKey,
    /// The orphaned identity being adopted
    pub orphan: PublicKey,
    /// Signature from the adopter
    pub signature: Signature,
    /// Timestamp of the request
    pub timestamp: u64,
}

impl AdoptionRequest {
    /// Get the message bytes that the adopter signs
    ///
    /// Format: adopter(32) || orphan(32) || timestamp(8 BE)
    pub fn signature_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(72);
        msg.extend_from_slice(self.adopter.as_bytes());
        msg.extend_from_slice(self.orphan.as_bytes());
        msg.extend_from_slice(&self.timestamp.to_be_bytes());
        msg
    }
}

/// Result of a successful adoption
#[derive(Debug, Clone)]
pub struct AdoptionResult {
    /// The orphan that was adopted
    pub orphan: PublicKey,
    /// The previous sponsor (if any)
    pub old_sponsor: Option<PublicKey>,
    /// The new sponsor (the adopter)
    pub new_sponsor: PublicKey,
    /// The new depth in the sponsorship tree
    pub new_depth: u8,
}

/// Validate an adoption request
///
/// Checks:
/// - Adopter exists and is active
/// - Orphan exists and has Orphaned status
/// - Orphan is past grace period
///
/// Note: Signature verification is delegated to caller with crypto primitives.
pub fn validate_adoption(
    request: &AdoptionRequest,
    sponsorship_store: &SponsorshipStore,
    current_time: u64,
) -> Result<(), SponsorshipError> {
    // 1. Check adopter exists and is active
    let adopter = sponsorship_store
        .get(&request.adopter)?
        .ok_or(SponsorshipError::NotOrphaned)?;

    if adopter.status != SponsorshipStatus::Active {
        return Err(SponsorshipError::SponsorRestricted);
    }

    // 2. Get orphan record
    let orphan = sponsorship_store
        .get(&request.orphan)?
        .ok_or(SponsorshipError::NotOrphaned)?;

    // 3. Check orphan status
    if orphan.status != SponsorshipStatus::Orphaned {
        return Err(SponsorshipError::NotOrphaned);
    }

    // 4. Check past grace period
    if orphan.is_in_grace_period(current_time) {
        let grace_expires = orphan
            .orphaned_at
            .map(|at| at + ORPHAN_GRACE_PERIOD_SECONDS)
            .unwrap_or(current_time);
        return Err(SponsorshipError::OrphanNotEligibleForAdoption {
            grace_expires_at: grace_expires,
        });
    }

    Ok(())
}

/// Execute adoption after validation
///
/// Updates the orphan's sponsorship record with:
/// - New sponsor (the adopter)
/// - New depth (adopter's depth + 1)
/// - Active status
/// - Cleared penalty (clean slate per RESEARCH_07)
pub fn execute_adoption(
    request: &AdoptionRequest,
    sponsorship_store: &SponsorshipStore,
) -> Result<AdoptionResult, SponsorshipError> {
    // Get current orphan state
    let orphan = sponsorship_store
        .get(&request.orphan)?
        .ok_or(SponsorshipError::NotOrphaned)?;
    let old_sponsor = orphan.sponsor;

    // Get adopter's depth
    let adopter = sponsorship_store
        .get(&request.adopter)?
        .ok_or_else(|| SponsorshipError::StorageError("adopter not found".into()))?;
    let new_depth = adopter.depth.saturating_add(1);

    // Clear orphan status with new sponsor
    sponsorship_store.clear_orphan_status(&request.orphan, &request.adopter, new_depth)?;

    Ok(AdoptionResult {
        orphan: request.orphan,
        old_sponsor,
        new_sponsor: request.adopter,
        new_depth,
    })
}

/// Apply orphan cascade protection when a sponsor is permanently revoked
///
/// Only direct sponsees become orphaned. Their sponsees remain Active
/// until their immediate sponsor's grace period expires.
///
/// Returns the list of identities that were newly orphaned.
pub fn apply_cascade_protection(
    sponsorship_store: &SponsorshipStore,
    failed_sponsor: &PublicKey,
    current_time: u64,
) -> Result<Vec<PublicKey>, SponsorshipError> {
    let mut newly_orphaned = Vec::new();

    // Get direct sponsees only (not recursive)
    let sponsees = sponsorship_store.get_sponsees(failed_sponsor)?;

    for sponsee in sponsees {
        // Get sponsee record
        if let Some(record) = sponsorship_store.get(&sponsee)? {
            // Only orphan Active or Restricted (not already orphaned/revoked)
            if record.status == SponsorshipStatus::Active
                || record.status == SponsorshipStatus::Restricted
            {
                sponsorship_store.set_orphan_status(&sponsee, current_time)?;
                newly_orphaned.push(sponsee);
            }
        }
    }

    Ok(newly_orphaned)
}

/// Count identities at risk if a sponsor fails
///
/// Useful for UI warnings to show potential impact of revocation.
pub fn count_at_risk_identities(
    sponsorship_store: &SponsorshipStore,
    potential_failed_sponsor: &PublicKey,
) -> Result<u32, SponsorshipError> {
    let sponsees = sponsorship_store.get_sponsees(potential_failed_sponsor)?;
    Ok(sponsees.len() as u32)
}

/// Background task for detecting orphans from inactive sponsors
pub struct OrphanDetectionTask {
    /// Timestamp of last scan
    last_scan: u64,
}

impl Default for OrphanDetectionTask {
    fn default() -> Self {
        Self::new()
    }
}

impl OrphanDetectionTask {
    /// Create a new orphan detection task
    pub fn new() -> Self {
        Self { last_scan: 0 }
    }

    /// Check if a scan is due based on the interval
    pub fn should_scan(&self, current_time: u64) -> bool {
        current_time >= self.last_scan + ORPHAN_SCAN_INTERVAL_SECONDS
    }

    /// Scan for inactive sponsors and orphan their sponsees
    ///
    /// Takes a callback to check sponsor activity since the sponsorship
    /// module doesn't directly access the contribution store.
    ///
    /// # Arguments
    /// * `sponsorship_store` - The sponsorship storage
    /// * `current_time` - Current Unix timestamp
    /// * `get_sponsor_last_active` - Callback that returns the last active timestamp
    ///   for a given sponsor, or None if unknown
    ///
    /// # Returns
    /// List of identities that were newly orphaned
    pub fn scan_for_inactive_sponsors<F>(
        &mut self,
        sponsorship_store: &SponsorshipStore,
        current_time: u64,
        get_sponsor_last_active: F,
    ) -> Result<Vec<PublicKey>, SponsorshipError>
    where
        F: Fn(&PublicKey) -> Option<u64>,
    {
        self.last_scan = current_time;
        let mut newly_orphaned = Vec::new();

        for result in sponsorship_store.iter_all() {
            let sponsorship = result?;

            // Skip genesis (no sponsor), already orphaned, or revoked
            if sponsorship.is_genesis
                || sponsorship.status == SponsorshipStatus::Orphaned
                || sponsorship.status == SponsorshipStatus::Revoked
            {
                continue;
            }

            // Check if sponsor is inactive
            if let Some(sponsor) = sponsorship.sponsor {
                if let Some(last_active) = get_sponsor_last_active(&sponsor) {
                    let inactive_duration = current_time.saturating_sub(last_active);
                    if inactive_duration >= ORPHAN_INACTIVITY_THRESHOLD_SECONDS {
                        sponsorship_store
                            .set_orphan_status(&sponsorship.sponsored_identity, current_time)?;
                        newly_orphaned.push(sponsorship.sponsored_identity);
                    }
                }
            }
        }

        Ok(newly_orphaned)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_store() -> (SponsorshipStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();
        (store, temp_dir)
    }

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    fn make_genesis_sponsorship(identity: PublicKey) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
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

    fn make_regular_sponsorship(
        identity: PublicKey,
        sponsor: PublicKey,
        depth: u8,
    ) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
            sponsor: Some(sponsor),
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
    fn test_orphan_info_creation() {
        let identity = test_pubkey(1);
        let reason = OrphanReason::SponsorRevoked;
        let current_time = 1735689600;

        let info = OrphanInfo::new(identity, reason, current_time);

        assert_eq!(info.identity, identity);
        assert_eq!(info.reason, OrphanReason::SponsorRevoked);
        assert_eq!(info.detected_at, current_time);
        assert_eq!(
            info.grace_expires_at,
            current_time + ORPHAN_GRACE_PERIOD_SECONDS
        );
        assert!(!info.eligible_for_adoption);
    }

    #[test]
    fn test_orphan_info_adoption_eligibility() {
        let identity = test_pubkey(1);
        let reason = OrphanReason::SponsorRevoked;
        let current_time = 1735689600;

        let info = OrphanInfo::new(identity, reason, current_time);

        // Not eligible during grace period
        let during_grace = info.clone().with_adoption_eligibility(current_time + 100);
        assert!(!during_grace.eligible_for_adoption);

        // Eligible after grace period
        let after_grace = info
            .clone()
            .with_adoption_eligibility(current_time + ORPHAN_GRACE_PERIOD_SECONDS + 1);
        assert!(after_grace.eligible_for_adoption);
    }

    #[test]
    fn test_orphan_capabilities_during_grace() {
        // All orphans have full capabilities with PoW-only gating
        let caps = OrphanCapabilities::during_grace_period();
        assert!(caps.can_post);
        assert!(caps.can_reply);
        assert!(caps.can_engage);
        assert!(caps.can_sponsor);
    }

    #[test]
    fn test_adoption_request_signature_message() {
        let request = AdoptionRequest {
            adopter: test_pubkey(1),
            orphan: test_pubkey(2),
            signature: Signature::from_bytes([0u8; 64]),
            timestamp: 1735689600,
        };

        let msg = request.signature_message();
        assert_eq!(msg.len(), 72); // 32 + 32 + 8
        assert_eq!(&msg[0..32], &[1u8; 32]);
        assert_eq!(&msg[32..64], &[2u8; 32]);
        assert_eq!(&msg[64..72], &1735689600u64.to_be_bytes());
    }

    #[test]
    fn test_validate_adoption_not_orphaned() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600;

        // Create genesis and active identity (not orphaned)
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(1), test_pubkey(0), 1))
            .unwrap();

        let request = AdoptionRequest {
            adopter: test_pubkey(0),
            orphan: test_pubkey(1),
            signature: Signature::from_bytes([0u8; 64]),
            timestamp: current_time,
        };

        let result = validate_adoption(&request, &store, current_time);
        assert!(matches!(result, Err(SponsorshipError::NotOrphaned)));
    }

    #[test]
    fn test_validate_adoption_in_grace_period() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600;
        let orphaned_at = current_time - 100; // Only 100 seconds ago

        // Create genesis and orphaned identity (still in grace period)
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(1), test_pubkey(0), 1))
            .unwrap();
        store
            .set_orphan_status(&test_pubkey(1), orphaned_at)
            .unwrap();

        let request = AdoptionRequest {
            adopter: test_pubkey(0),
            orphan: test_pubkey(1),
            signature: Signature::from_bytes([0u8; 64]),
            timestamp: current_time,
        };

        let result = validate_adoption(&request, &store, current_time);
        assert!(matches!(
            result,
            Err(SponsorshipError::OrphanNotEligibleForAdoption { .. })
        ));
    }

    #[test]
    fn test_validate_adoption_success() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600;
        let orphaned_at = current_time - ORPHAN_GRACE_PERIOD_SECONDS - 100;

        // Create genesis and orphaned identity (past grace period)
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(1), test_pubkey(0), 1))
            .unwrap();
        store
            .set_orphan_status(&test_pubkey(1), orphaned_at)
            .unwrap();

        let request = AdoptionRequest {
            adopter: test_pubkey(0),
            orphan: test_pubkey(1),
            signature: Signature::from_bytes([0u8; 64]),
            timestamp: current_time,
        };

        let result = validate_adoption(&request, &store, current_time);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cascade_protection() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600;

        // Create chain: Genesis(0) -> A(1) -> B(2) -> C(3)
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(1), test_pubkey(0), 1))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(2), test_pubkey(1), 2))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(3), test_pubkey(2), 3))
            .unwrap();

        // Revoke A (identity 1) - only B should be orphaned, not C
        let newly_orphaned =
            apply_cascade_protection(&store, &test_pubkey(1), current_time).unwrap();

        assert_eq!(newly_orphaned.len(), 1);
        assert_eq!(newly_orphaned[0], test_pubkey(2)); // Only B

        // Verify B is orphaned
        let b = store.get(&test_pubkey(2)).unwrap().unwrap();
        assert_eq!(b.status, SponsorshipStatus::Orphaned);
        assert_eq!(b.orphaned_at, Some(current_time));

        // Verify C is still active
        let c = store.get(&test_pubkey(3)).unwrap().unwrap();
        assert_eq!(c.status, SponsorshipStatus::Active);
    }

    #[test]
    fn test_count_at_risk_identities() {
        let (store, _dir) = create_test_store();

        // Genesis sponsors 3 identities
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        for i in 1..=3 {
            store
                .put(&make_regular_sponsorship(test_pubkey(i), test_pubkey(0), 1))
                .unwrap();
        }

        let count = count_at_risk_identities(&store, &test_pubkey(0)).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_orphan_detection_task_should_scan() {
        let mut task = OrphanDetectionTask::new();
        let base_time = ORPHAN_SCAN_INTERVAL_SECONDS + 1000; // Start time after first interval

        // Should scan initially (last_scan = 0, and base_time >= interval)
        assert!(task.should_scan(base_time));

        // Update last scan
        task.last_scan = base_time;

        // Shouldn't scan too soon
        assert!(!task.should_scan(base_time + ORPHAN_SCAN_INTERVAL_SECONDS - 1));

        // Should scan after interval
        assert!(task.should_scan(base_time + ORPHAN_SCAN_INTERVAL_SECONDS));
    }

    #[test]
    fn test_orphan_detection_task_scan() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600;

        // Create genesis and sponsored identity
        store
            .put(&make_genesis_sponsorship(test_pubkey(0)))
            .unwrap();
        store
            .put(&make_regular_sponsorship(test_pubkey(1), test_pubkey(0), 1))
            .unwrap();

        let mut task = OrphanDetectionTask::new();

        // Mock: Genesis (test_pubkey(0)) has been inactive for 91 days
        let sponsor_last_active = |pk: &PublicKey| {
            if *pk == test_pubkey(0) {
                Some(current_time - ORPHAN_INACTIVITY_THRESHOLD_SECONDS - 86_400)
            // 91 days ago
            } else {
                None
            }
        };

        let newly_orphaned = task
            .scan_for_inactive_sponsors(&store, current_time, sponsor_last_active)
            .unwrap();

        assert_eq!(newly_orphaned.len(), 1);
        assert_eq!(newly_orphaned[0], test_pubkey(1));

        // Verify the identity is now orphaned
        let sponsorship = store.get(&test_pubkey(1)).unwrap().unwrap();
        assert_eq!(sponsorship.status, SponsorshipStatus::Orphaned);
        assert_eq!(sponsorship.orphaned_at, Some(current_time));
    }
}
