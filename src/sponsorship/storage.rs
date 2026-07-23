//! Sponsorship storage using sled
//!
//! Persists sponsorship records to disk. Uses sled trees for efficient
//! queries on sponsorship relationships.

use std::collections::{HashSet, VecDeque};
use std::path::Path;

use sled::{Db, Tree};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list;
use crate::sponsorship::types::*;
use crate::types::identity::PublicKey;

/// Maximum path depth to prevent infinite loops on corrupted data
const MAX_PATH_DEPTH: usize = 256;

/// Sponsorship storage backed by sled
pub struct SponsorshipStore {
    /// The sled database
    db: Db,
    /// Primary storage: PublicKey(32) -> bincode StoredSponsorship
    sponsorships: Tree,
    /// Secondary index: sponsor PublicKey(32) -> bincode Vec<[u8; 32]>
    by_sponsor: Tree,
    /// Genesis slots: slot_number(2 BE) -> PublicKey(32)
    genesis_slots: Tree,
    /// Orphan index: PublicKey(32) -> orphaned_at(u64 BE)
    orphans: Tree,
    /// Space-scope index: sponsored PublicKey(32) -> scope space_id(32).
    /// Present ONLY for space-limited grants; absence means a global
    /// (network-wide) grant. Additive side-index so existing records need no
    /// migration — an unscoped identity simply has no entry here.
    scopes: Tree,
}

impl SponsorshipStore {
    /// Open or create sponsorship store at path
    pub fn open(path: impl AsRef<Path>) -> Result<Self, SponsorshipError> {
        let db = crate::storage::open_db(path.as_ref())?;
        Self::from_db(&db)
    }

    /// Open or create from existing database
    pub fn from_db(db: &Db) -> Result<Self, SponsorshipError> {
        Ok(Self {
            db: db.clone(),
            sponsorships: db.open_tree("sponsorships")?,
            by_sponsor: db.open_tree("sponsorships_by_sponsor")?,
            genesis_slots: db.open_tree("genesis_slots")?,
            orphans: db.open_tree("orphans")?,
            scopes: db.open_tree("sponsorship_scopes")?,
        })
    }

    /// Record that a sponsorship is space-limited: the sponsee may only author
    /// actions in `scope`. Absence of an entry means a global grant. Written by
    /// the sponsorship apply path for scoped grants.
    pub fn set_scope(
        &self,
        identity: &PublicKey,
        scope: &[u8; 32],
    ) -> Result<(), SponsorshipError> {
        self.scopes.insert(identity.as_bytes(), scope.as_slice())?;
        self.db.flush()?;
        Ok(())
    }

    /// The space a sponsorship is limited to, or `None` for a global grant.
    pub fn get_scope(&self, identity: &PublicKey) -> Result<Option<[u8; 32]>, SponsorshipError> {
        match self.scopes.get(identity.as_bytes())? {
            Some(v) if v.len() == 32 => {
                let mut s = [0u8; 32];
                s.copy_from_slice(&v);
                Ok(Some(s))
            }
            _ => Ok(None),
        }
    }

    /// Remove any scope entry (e.g. when a grant is upgraded to global).
    pub fn remove_scope(&self, identity: &PublicKey) -> Result<(), SponsorshipError> {
        self.scopes.remove(identity.as_bytes())?;
        Ok(())
    }

    /// Whether `identity` is authorized to author a durable action in `space`:
    /// a genesis identity (anywhere), a globally-sponsored identity (anywhere),
    /// or a space-scoped identity whose scope equals `space`. This is the
    /// on-chain half of the sybil-wall gate; in-block grants are handled by the
    /// caller. A scope read error is treated as global (fail-open on
    /// availability, since scoping is a containment refinement, not the wall).
    pub fn is_authorized_in_space(&self, identity: &PublicKey, space: &[u8; 32]) -> bool {
        if is_in_hardcoded_genesis_list(identity) {
            return true;
        }
        if !self.exists(identity).unwrap_or(false) {
            return false;
        }
        match self.get_scope(identity) {
            Ok(Some(scope)) => &scope == space,
            _ => true, // global grant (or transient read error)
        }
    }

    /// Store a sponsorship (updates secondary index atomically)
    pub fn put(&self, sponsorship: &StoredSponsorship) -> Result<(), SponsorshipError> {
        sponsorship.validate_invariants()?;

        let key = sponsorship.sponsored_identity.as_bytes();
        let value = bincode::serialize(sponsorship)?;
        self.sponsorships.insert(key, value)?;

        // Update by_sponsor index if has sponsor
        if let Some(sponsor) = &sponsorship.sponsor {
            self.add_to_sponsee_list(sponsor, &sponsorship.sponsored_identity)?;
        }

        // Sponsorships are rare, precious writes: flush synchronously. On
        // mobile the process is routinely hard-killed (force-stop/swipe) and
        // sled's background flush has been observed not to persist writes
        // there — an approved sponsorship silently vanished on app restart.
        self.db.flush()?;

        Ok(())
    }

    /// Add sponsee to sponsor's list
    fn add_to_sponsee_list(
        &self,
        sponsor: &PublicKey,
        sponsee: &PublicKey,
    ) -> Result<(), SponsorshipError> {
        let key = sponsor.as_bytes();
        let mut sponsees: Vec<[u8; 32]> = match self.by_sponsor.get(key)? {
            Some(data) => bincode::deserialize(&data)?,
            None => Vec::new(),
        };

        let sponsee_bytes = *sponsee.as_bytes();
        if !sponsees.contains(&sponsee_bytes) {
            sponsees.push(sponsee_bytes);
            self.by_sponsor
                .insert(key, bincode::serialize(&sponsees)?)?;
        }
        Ok(())
    }

    /// Get sponsorship by identity
    pub fn get(&self, identity: &PublicKey) -> Result<Option<StoredSponsorship>, SponsorshipError> {
        match self.sponsorships.get(identity.as_bytes())? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Get sponsor of identity
    pub fn get_sponsor(&self, identity: &PublicKey) -> Result<Option<PublicKey>, SponsorshipError> {
        Ok(self.get(identity)?.and_then(|s| s.sponsor))
    }

    /// Get all sponsees of a sponsor
    pub fn get_sponsees(&self, sponsor: &PublicKey) -> Result<Vec<PublicKey>, SponsorshipError> {
        match self.by_sponsor.get(sponsor.as_bytes())? {
            Some(data) => {
                let bytes: Vec<[u8; 32]> = bincode::deserialize(&data)?;
                Ok(bytes.into_iter().map(PublicKey::from_bytes).collect())
            }
            None => Ok(Vec::new()),
        }
    }

    /// Get path from identity to genesis (inclusive)
    ///
    /// Returns a vector starting with the given identity and ending at
    /// the genesis identity (or the furthest reachable node if corrupted).
    pub fn get_path_to_genesis(
        &self,
        identity: &PublicKey,
    ) -> Result<Vec<PublicKey>, SponsorshipError> {
        let mut path = Vec::new();
        let mut current = *identity;

        for _ in 0..MAX_PATH_DEPTH {
            path.push(current);
            match self.get(&current)? {
                Some(s) if s.is_genesis => break,
                Some(s) => match s.sponsor {
                    Some(sponsor) => current = sponsor,
                    None => break, // Corrupted: non-genesis without sponsor
                },
                None => break, // Identity not found
            }
        }

        Ok(path)
    }

    /// Count direct sponsees
    pub fn count_sponsees(&self, sponsor: &PublicKey) -> Result<u32, SponsorshipError> {
        Ok(self.get_sponsees(sponsor)?.len() as u32)
    }

    /// Check if identity exists
    pub fn exists(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        Ok(self.sponsorships.contains_key(identity.as_bytes())?)
    }

    /// Check if identity is sponsored and in active status
    ///
    /// Returns true if:
    /// - Identity exists in sponsorship store
    /// - Status is Active (not Revoked, Orphaned, or Restricted)
    ///
    /// This is the main gating check for allowing actions on the network.
    pub fn is_identity_active(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        match self.get(identity)? {
            Some(sponsorship) => Ok(sponsorship.status == SponsorshipStatus::Active),
            None => Ok(false),
        }
    }

    /// Check if identity can perform actions (active or restricted with valid penalty)
    ///
    /// Returns true if:
    /// - Identity is in HARDCODED_GENESIS_LIST (always allowed), OR
    /// - Identity is Active, OR
    /// - Identity is Restricted but can still do basic actions
    ///
    /// Restricted identities can post but with limitations (e.g., probationary only sponsorships).
    pub fn can_identity_act(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        // Genesis identities always allowed - check hardcoded list first
        if is_in_hardcoded_genesis_list(identity) {
            return Ok(true);
        }

        match self.get(identity)? {
            Some(sponsorship) => Ok(matches!(
                sponsorship.status,
                SponsorshipStatus::Active | SponsorshipStatus::Restricted
            )),
            None => Ok(false),
        }
    }

    /// Get genesis identity at slot
    pub fn get_genesis_at_slot(&self, slot: u16) -> Result<Option<PublicKey>, SponsorshipError> {
        match self.genesis_slots.get(slot.to_be_bytes())? {
            Some(data) => {
                let bytes: [u8; 32] = data.as_ref().try_into().map_err(|_| {
                    SponsorshipError::StorageError("invalid genesis slot data".into())
                })?;
                Ok(Some(PublicKey::from_bytes(bytes)))
            }
            None => Ok(None),
        }
    }

    /// Claim a genesis slot (fails if already claimed)
    pub fn claim_genesis_slot(
        &self,
        slot: u16,
        identity: &PublicKey,
    ) -> Result<(), SponsorshipError> {
        let key = slot.to_be_bytes();
        let result = self.genesis_slots.compare_and_swap(
            &key,
            None as Option<&[u8]>,
            Some(identity.as_bytes().as_slice()),
        )?;

        match result {
            Ok(()) => Ok(()),
            Err(_existing) => Err(SponsorshipError::GenesisSlotClaimed),
        }
    }

    /// Update an existing sponsorship's status
    ///
    /// Note: Genesis identities cannot be revoked per SPEC_11 Section 3.9.
    /// Attempting to revoke a genesis identity will return `CannotRevokeGenesis`.
    pub fn update_status(
        &self,
        identity: &PublicKey,
        status: SponsorshipStatus,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut sponsorship) = self.get(identity)? {
            // Genesis identities cannot be revoked
            if sponsorship.is_genesis && status == SponsorshipStatus::Revoked {
                return Err(SponsorshipError::CannotRevokeGenesis);
            }
            sponsorship.status = status;
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Set penalty for a sponsorship
    pub fn set_penalty(
        &self,
        identity: &PublicKey,
        penalty_until: u64,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut sponsorship) = self.get(identity)? {
            sponsorship.penalty_until = Some(penalty_until);
            sponsorship.status = SponsorshipStatus::Restricted;
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Clear penalty for a sponsorship
    pub fn clear_penalty(&self, identity: &PublicKey) -> Result<(), SponsorshipError> {
        if let Some(mut sponsorship) = self.get(identity)? {
            sponsorship.penalty_until = None;
            if sponsorship.status == SponsorshipStatus::Restricted {
                sponsorship.status = SponsorshipStatus::Active;
            }
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Update contribution score
    pub fn update_contribution_score(
        &self,
        identity: &PublicKey,
        score: u16,
    ) -> Result<(), SponsorshipError> {
        if score > 1000 {
            return Err(SponsorshipError::InvalidInvariant(
                "Contribution score exceeds 1000".into(),
            ));
        }

        if let Some(mut sponsorship) = self.get(identity)? {
            sponsorship.positive_contribution_score = score;
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Get all genesis identities
    pub fn get_all_genesis_identities(&self) -> Result<Vec<GenesisIdentity>, SponsorshipError> {
        let mut genesis_identities = Vec::new();

        for item in self.genesis_slots.iter() {
            let (key_bytes, value_bytes) = item?;
            let slot = u16::from_be_bytes(
                key_bytes
                    .as_ref()
                    .try_into()
                    .map_err(|_| SponsorshipError::StorageError("invalid slot key".into()))?,
            );
            let identity_bytes: [u8; 32] = value_bytes
                .as_ref()
                .try_into()
                .map_err(|_| SponsorshipError::StorageError("invalid identity data".into()))?;
            let identity = PublicKey::from_bytes(identity_bytes);

            // Get the full sponsorship record if available
            if let Some(sponsorship) = self.get(&identity)? {
                genesis_identities.push(GenesisIdentity {
                    identity,
                    genesis_proof: GenesisProof {
                        slot_number: slot,
                        proof_type: GenesisProofType::HardcodedList,
                        proof_data: vec![],
                        attestations: vec![],
                    },
                    created_at: sponsorship.creation_timestamp,
                    slot_number: slot,
                });
            }
        }

        Ok(genesis_identities)
    }

    /// Get total number of sponsorships
    pub fn total_sponsorship_count(&self) -> usize {
        self.sponsorships.len()
    }

    /// Get total number of claimed genesis slots
    pub fn genesis_slot_count(&self) -> usize {
        self.genesis_slots.len()
    }

    /// Check if genesis identity limit has been reached
    #[must_use]
    pub fn is_genesis_limit_reached(&self) -> bool {
        self.genesis_slot_count() >= MAX_GENESIS_IDENTITIES as usize
    }

    /// Check if an identity is a genesis identity
    pub fn is_genesis(&self, identity: &PublicKey) -> Result<bool, SponsorshipError> {
        Ok(self.get(identity)?.map_or(false, |s| s.is_genesis))
    }

    /// Check if a genesis slot is claimed
    pub fn is_slot_claimed(&self, slot: u16) -> Result<bool, SponsorshipError> {
        Ok(self.get_genesis_at_slot(slot)?.is_some())
    }

    /// Count active genesis identities
    ///
    /// Returns the number of currently claimed genesis slots.
    pub fn count_active_genesis(&self) -> usize {
        self.genesis_slot_count()
    }

    /// Flush to disk
    pub fn flush(&self) -> Result<(), SponsorshipError> {
        self.db.flush()?;
        Ok(())
    }

    /// Get reference to underlying database
    ///
    /// Useful for creating related stores (e.g., LinearChainDetector)
    /// that share the same database.
    pub fn db(&self) -> &Db {
        &self.db
    }

    // === Orphan Handling Methods (SPEC_11 §3.2) ===

    /// Mark an identity as orphaned
    ///
    /// Sets the identity's status to Orphaned and records the orphaned_at timestamp.
    /// Genesis identities cannot be orphaned.
    ///
    /// # Errors
    /// - `CannotOrphanGenesis` if the identity is a genesis identity
    /// - `StorageError` if the identity is not found
    pub fn set_orphan_status(
        &self,
        identity: &PublicKey,
        orphaned_at: u64,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut sponsorship) = self.get(identity)? {
            if sponsorship.is_genesis {
                return Err(SponsorshipError::CannotOrphanGenesis);
            }
            sponsorship.status = SponsorshipStatus::Orphaned;
            sponsorship.orphaned_at = Some(orphaned_at);
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            self.orphans
                .insert(identity.as_bytes(), &orphaned_at.to_be_bytes())?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Clear orphan status after adoption
    ///
    /// Updates the orphan with:
    /// - Active status
    /// - New sponsor
    /// - New depth
    /// - Cleared penalty (clean slate per RESEARCH_07)
    ///
    /// # Errors
    /// - `StorageError` if the identity is not found
    pub fn clear_orphan_status(
        &self,
        identity: &PublicKey,
        new_sponsor: &PublicKey,
        new_depth: u8,
    ) -> Result<(), SponsorshipError> {
        if let Some(mut sponsorship) = self.get(identity)? {
            sponsorship.status = SponsorshipStatus::Active;
            sponsorship.orphaned_at = None;
            sponsorship.sponsor = Some(*new_sponsor);
            sponsorship.depth = new_depth;
            sponsorship.penalty_until = None; // Clean slate per RESEARCH_07
            let value = bincode::serialize(&sponsorship)?;
            self.sponsorships.insert(identity.as_bytes(), value)?;
            self.orphans.remove(identity.as_bytes())?;
            // Update by_sponsor index
            self.add_to_sponsee_list(new_sponsor, identity)?;
            Ok(())
        } else {
            Err(SponsorshipError::StorageError(
                "identity not found".to_string(),
            ))
        }
    }

    /// Get all orphaned identities with their orphaned_at timestamps
    pub fn get_orphans(&self) -> Result<Vec<(PublicKey, u64)>, SponsorshipError> {
        let mut orphans = Vec::new();
        for item in self.orphans.iter() {
            let (key_bytes, value_bytes) = item?;
            let identity_bytes: [u8; 32] = key_bytes
                .as_ref()
                .try_into()
                .map_err(|_| SponsorshipError::StorageError("invalid orphan key".into()))?;
            let orphaned_at_bytes: [u8; 8] = value_bytes
                .as_ref()
                .try_into()
                .map_err(|_| SponsorshipError::StorageError("invalid orphan timestamp".into()))?;
            orphans.push((
                PublicKey::from_bytes(identity_bytes),
                u64::from_be_bytes(orphaned_at_bytes),
            ));
        }
        Ok(orphans)
    }

    /// Get orphans eligible for adoption (past grace period)
    pub fn get_orphans_eligible_for_adoption(
        &self,
        current_time: u64,
    ) -> Result<Vec<(PublicKey, u64)>, SponsorshipError> {
        use crate::sponsorship::types::ORPHAN_GRACE_PERIOD_SECONDS;

        let all_orphans = self.get_orphans()?;
        Ok(all_orphans
            .into_iter()
            .filter(|(_, orphaned_at)| current_time >= orphaned_at + ORPHAN_GRACE_PERIOD_SECONDS)
            .collect())
    }

    /// Iterate all sponsorships (for background scanning)
    ///
    /// Returns an iterator over all stored sponsorships. Useful for
    /// background tasks like orphan detection.
    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = Result<StoredSponsorship, SponsorshipError>> + '_ {
        self.sponsorships.iter().map(|item| {
            let (_key, value) = item.map_err(SponsorshipError::from)?;
            bincode::deserialize(&value).map_err(SponsorshipError::from)
        })
    }

    /// Count total orphaned identities
    pub fn orphan_count(&self) -> usize {
        self.orphans.len()
    }

    /// Calculate subtree metrics for an identity using BFS
    ///
    /// Returns `(total_descendants, max_depth_in_subtree)`.
    /// Used for linear chain detection per SPEC_11 Section 4.3.
    ///
    /// # Arguments
    /// * `root` - The identity to calculate subtree metrics for
    ///
    /// # Returns
    /// Tuple of (total descendant count, maximum depth from root)
    pub fn calculate_subtree_metrics(
        &self,
        root: &PublicKey,
    ) -> Result<(u32, u8), SponsorshipError> {
        let mut total_descendants: u32 = 0;
        let mut max_depth: u8 = 0;

        // BFS queue: (identity, depth_from_root)
        let mut queue: VecDeque<(PublicKey, u8)> = VecDeque::new();
        let mut visited: HashSet<[u8; 32]> = HashSet::new();

        // Mark root as visited
        visited.insert(*root.as_bytes());

        // Seed queue with direct sponsees at depth 1
        for sponsee in self.get_sponsees(root)? {
            queue.push_back((sponsee, 1));
        }

        while let Some((current, depth)) = queue.pop_front() {
            // Skip if already visited (cycle prevention)
            if visited.contains(current.as_bytes()) {
                continue;
            }

            // Depth limit to prevent infinite loops on corrupted data
            if depth as usize >= MAX_PATH_DEPTH {
                break;
            }

            visited.insert(*current.as_bytes());
            total_descendants += 1;
            max_depth = max_depth.max(depth);

            // Add this identity's sponsees to the queue
            for sponsee in self.get_sponsees(&current)? {
                if !visited.contains(sponsee.as_bytes()) {
                    queue.push_back((sponsee, depth.saturating_add(1)));
                }
            }
        }

        Ok((total_descendants, max_depth))
    }

    /// Calculate complete linear chain metrics for an identity
    ///
    /// This computes all metrics needed for linear chain detection:
    /// - sponsorship_depth: The identity's depth in the tree
    /// - subtree_breadth: Total descendants in the subtree
    /// - direct_sponsee_count: Number of immediate sponsees
    /// - linearity_score: depth / max(breadth, 1)
    ///
    /// # Errors
    /// Returns `SponsorshipError::StorageError` if identity not found
    pub fn calculate_linear_chain_metrics(
        &self,
        identity: &PublicKey,
    ) -> Result<LinearChainMetrics, SponsorshipError> {
        let sponsorship = self
            .get(identity)?
            .ok_or_else(|| SponsorshipError::StorageError("identity not found".into()))?;

        let direct_sponsee_count = self.count_sponsees(identity)?;
        let (subtree_breadth, max_subtree_depth) = self.calculate_subtree_metrics(identity)?;

        // Use max subtree depth as avg for simplicity (conservative)
        let avg_depth = max_subtree_depth as f32;

        Ok(LinearChainMetrics::new(
            *identity,
            sponsorship.depth,
            subtree_breadth,
            direct_sponsee_count,
            avg_depth,
        ))
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

    fn make_genesis_sponsorship(identity: [u8; 32]) -> StoredSponsorship {
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

    fn make_regular_sponsorship(
        identity: [u8; 32],
        sponsor: [u8; 32],
        depth: u8,
    ) -> StoredSponsorship {
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
    fn is_authorized_in_space_respects_scope() {
        let (store, _dir) = create_test_store();
        let global = PublicKey::from_bytes([7u8; 32]);
        let scoped = PublicKey::from_bytes([8u8; 32]);
        let unsponsored = PublicKey::from_bytes([9u8; 32]);
        let space_x = [0x01u8; 32];
        let space_y = [0x02u8; 32];

        // A global (unscoped) sponsorship is authorized in any space.
        store
            .put(&make_regular_sponsorship([7u8; 32], [1u8; 32], 1))
            .unwrap();
        assert!(store.is_authorized_in_space(&global, &space_x));
        assert!(store.is_authorized_in_space(&global, &space_y));
        assert_eq!(store.get_scope(&global).unwrap(), None);

        // A space-scoped sponsorship is authorized ONLY in its scope space.
        store
            .put(&make_regular_sponsorship([8u8; 32], [1u8; 32], 1))
            .unwrap();
        store.set_scope(&scoped, &space_x).unwrap();
        assert!(store.is_authorized_in_space(&scoped, &space_x));
        assert!(!store.is_authorized_in_space(&scoped, &space_y));
        assert_eq!(store.get_scope(&scoped).unwrap(), Some(space_x));

        // An unsponsored identity is authorized nowhere.
        assert!(!store.is_authorized_in_space(&unsponsored, &space_x));

        // Scope can be lifted (upgrade to global).
        store.remove_scope(&scoped).unwrap();
        assert!(store.is_authorized_in_space(&scoped, &space_y));
    }

    #[test]
    fn test_sponsorship_roundtrip() {
        let (store, _dir) = create_test_store();
        let sponsorship = make_genesis_sponsorship([1u8; 32]);

        store.put(&sponsorship).unwrap();
        let retrieved = store
            .get(&PublicKey::from_bytes([1u8; 32]))
            .unwrap()
            .unwrap();

        assert_eq!(retrieved, sponsorship);
    }

    #[test]
    fn test_sponsorship_not_found() {
        let (store, _dir) = create_test_store();
        let result = store.get(&PublicKey::from_bytes([1u8; 32])).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_exists() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        assert!(!store.exists(&identity).unwrap());

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        assert!(store.exists(&identity).unwrap());
    }

    #[test]
    fn test_get_sponsor() {
        let (store, _dir) = create_test_store();
        let sponsor = [1u8; 32];
        let sponsee = [2u8; 32];

        // First store genesis sponsor
        store.put(&make_genesis_sponsorship(sponsor)).unwrap();

        // Then store regular sponsorship
        store
            .put(&make_regular_sponsorship(sponsee, sponsor, 1))
            .unwrap();

        let retrieved_sponsor = store
            .get_sponsor(&PublicKey::from_bytes(sponsee))
            .unwrap()
            .unwrap();
        assert_eq!(retrieved_sponsor, PublicKey::from_bytes(sponsor));

        // Genesis has no sponsor
        let genesis_sponsor = store.get_sponsor(&PublicKey::from_bytes(sponsor)).unwrap();
        assert!(genesis_sponsor.is_none());
    }

    #[test]
    fn test_get_sponsees() {
        let (store, _dir) = create_test_store();
        let sponsor = [1u8; 32];

        // Store genesis sponsor
        store.put(&make_genesis_sponsorship(sponsor)).unwrap();

        // Store 3 sponsees
        for i in 2..5 {
            store
                .put(&make_regular_sponsorship([i; 32], sponsor, 1))
                .unwrap();
        }

        let sponsees = store.get_sponsees(&PublicKey::from_bytes(sponsor)).unwrap();
        assert_eq!(sponsees.len(), 3);

        // Verify all sponsees are present
        let sponsee_bytes: Vec<[u8; 32]> = sponsees.iter().map(|s| *s.as_bytes()).collect();
        assert!(sponsee_bytes.contains(&[2u8; 32]));
        assert!(sponsee_bytes.contains(&[3u8; 32]));
        assert!(sponsee_bytes.contains(&[4u8; 32]));
    }

    #[test]
    fn test_count_sponsees() {
        let (store, _dir) = create_test_store();
        let sponsor = [1u8; 32];

        store.put(&make_genesis_sponsorship(sponsor)).unwrap();

        assert_eq!(
            store
                .count_sponsees(&PublicKey::from_bytes(sponsor))
                .unwrap(),
            0
        );

        for i in 2..5 {
            store
                .put(&make_regular_sponsorship([i; 32], sponsor, 1))
                .unwrap();
        }

        assert_eq!(
            store
                .count_sponsees(&PublicKey::from_bytes(sponsor))
                .unwrap(),
            3
        );
    }

    #[test]
    fn test_get_path_to_genesis() {
        let (store, _dir) = create_test_store();

        // Create a chain: genesis -> id1 -> id2 -> id3 -> id4
        let genesis = [0u8; 32];
        let id1 = [1u8; 32];
        let id2 = [2u8; 32];
        let id3 = [3u8; 32];
        let id4 = [4u8; 32];

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(id1, genesis, 1))
            .unwrap();
        store.put(&make_regular_sponsorship(id2, id1, 2)).unwrap();
        store.put(&make_regular_sponsorship(id3, id2, 3)).unwrap();
        store.put(&make_regular_sponsorship(id4, id3, 4)).unwrap();

        let path = store
            .get_path_to_genesis(&PublicKey::from_bytes(id4))
            .unwrap();

        assert_eq!(path.len(), 5);
        assert_eq!(*path[0].as_bytes(), id4);
        assert_eq!(*path[1].as_bytes(), id3);
        assert_eq!(*path[2].as_bytes(), id2);
        assert_eq!(*path[3].as_bytes(), id1);
        assert_eq!(*path[4].as_bytes(), genesis);
    }

    #[test]
    fn test_genesis_slot_claim() {
        let (store, _dir) = create_test_store();
        let id1 = PublicKey::from_bytes([1u8; 32]);
        let id2 = PublicKey::from_bytes([2u8; 32]);

        // First claim succeeds
        assert!(store.claim_genesis_slot(0, &id1).is_ok());

        // Second claim for same slot fails
        let result = store.claim_genesis_slot(0, &id2);
        assert!(matches!(result, Err(SponsorshipError::GenesisSlotClaimed)));

        // Different slot succeeds
        assert!(store.claim_genesis_slot(1, &id2).is_ok());
    }

    #[test]
    fn test_get_genesis_at_slot() {
        let (store, _dir) = create_test_store();
        let id1 = PublicKey::from_bytes([1u8; 32]);

        // Before claiming, returns None
        assert!(store.get_genesis_at_slot(0).unwrap().is_none());

        // After claiming, returns the identity
        store.claim_genesis_slot(0, &id1).unwrap();
        let retrieved = store.get_genesis_at_slot(0).unwrap().unwrap();
        assert_eq!(retrieved, id1);
    }

    #[test]
    fn test_update_status() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        store
            .update_status(&identity, SponsorshipStatus::Restricted)
            .unwrap();

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.status, SponsorshipStatus::Restricted);
    }

    #[test]
    fn test_set_and_clear_penalty() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        // Set penalty
        store.set_penalty(&identity, 1735700000).unwrap();

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.penalty_until, Some(1735700000));
        assert_eq!(retrieved.status, SponsorshipStatus::Restricted);

        // Clear penalty
        store.clear_penalty(&identity).unwrap();

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert!(retrieved.penalty_until.is_none());
        assert_eq!(retrieved.status, SponsorshipStatus::Active);
    }

    #[test]
    fn test_update_contribution_score() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        store.update_contribution_score(&identity, 500).unwrap();

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.positive_contribution_score, 500);
    }

    #[test]
    fn test_update_contribution_score_exceeds_max() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        let result = store.update_contribution_score(&identity, 1001);
        assert!(matches!(result, Err(SponsorshipError::InvalidInvariant(_))));
    }

    #[test]
    fn test_genesis_slot_count() {
        let (store, _dir) = create_test_store();

        assert_eq!(store.genesis_slot_count(), 0);

        store
            .claim_genesis_slot(0, &PublicKey::from_bytes([1u8; 32]))
            .unwrap();
        store
            .claim_genesis_slot(5, &PublicKey::from_bytes([2u8; 32]))
            .unwrap();
        store
            .claim_genesis_slot(10, &PublicKey::from_bytes([3u8; 32]))
            .unwrap();

        assert_eq!(store.genesis_slot_count(), 3);
    }

    #[test]
    fn test_total_sponsorship_count() {
        let (store, _dir) = create_test_store();

        assert_eq!(store.total_sponsorship_count(), 0);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();
        store
            .put(&make_regular_sponsorship([2u8; 32], [1u8; 32], 1))
            .unwrap();
        store
            .put(&make_regular_sponsorship([3u8; 32], [1u8; 32], 1))
            .unwrap();

        assert_eq!(store.total_sponsorship_count(), 3);
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let identity = PublicKey::from_bytes([1u8; 32]);

        // Create store and add data
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = SponsorshipStore::from_db(&db).unwrap();
            store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();
            store.claim_genesis_slot(0, &identity).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify data persists
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = SponsorshipStore::from_db(&db).unwrap();

            let retrieved = store.get(&identity).unwrap();
            assert!(retrieved.is_some());

            let genesis = store.get_genesis_at_slot(0).unwrap();
            assert!(genesis.is_some());
            assert_eq!(genesis.unwrap(), identity);
        }
    }

    #[test]
    fn test_sponsee_list_deduplication() {
        let (store, _dir) = create_test_store();
        let sponsor = [1u8; 32];
        let sponsee = [2u8; 32];

        store.put(&make_genesis_sponsorship(sponsor)).unwrap();

        // Put the same sponsorship twice
        store
            .put(&make_regular_sponsorship(sponsee, sponsor, 1))
            .unwrap();
        store
            .put(&make_regular_sponsorship(sponsee, sponsor, 1))
            .unwrap();

        // Should still only have one sponsee
        let sponsees = store.get_sponsees(&PublicKey::from_bytes(sponsor)).unwrap();
        assert_eq!(sponsees.len(), 1);
    }

    // === Genesis Storage Helper Tests ===

    #[test]
    fn test_is_genesis_limit_reached() {
        let (store, _dir) = create_test_store();

        // Initially not reached
        assert!(!store.is_genesis_limit_reached());

        // Claim some slots (but not all 100)
        for i in 0..10u16 {
            let identity = PublicKey::from_bytes([i as u8; 32]);
            store.claim_genesis_slot(i, &identity).unwrap();
        }

        // Still not reached
        assert!(!store.is_genesis_limit_reached());
    }

    #[test]
    fn test_is_genesis() {
        let (store, _dir) = create_test_store();
        let genesis_id = PublicKey::from_bytes([1u8; 32]);
        let regular_id = PublicKey::from_bytes([2u8; 32]);

        // Store genesis identity
        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();
        // Store regular identity
        store
            .put(&make_regular_sponsorship([2u8; 32], [1u8; 32], 1))
            .unwrap();

        assert!(store.is_genesis(&genesis_id).unwrap());
        assert!(!store.is_genesis(&regular_id).unwrap());

        // Unknown identity returns false
        let unknown = PublicKey::from_bytes([99u8; 32]);
        assert!(!store.is_genesis(&unknown).unwrap());
    }

    #[test]
    fn test_is_slot_claimed() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        // Initially not claimed
        assert!(!store.is_slot_claimed(0).unwrap());

        // Claim the slot
        store.claim_genesis_slot(0, &identity).unwrap();

        // Now claimed
        assert!(store.is_slot_claimed(0).unwrap());
        assert!(!store.is_slot_claimed(1).unwrap()); // Other slots still unclaimed
    }

    #[test]
    fn test_count_active_genesis() {
        let (store, _dir) = create_test_store();

        assert_eq!(store.count_active_genesis(), 0);

        // Claim some slots
        store
            .claim_genesis_slot(0, &PublicKey::from_bytes([1u8; 32]))
            .unwrap();
        store
            .claim_genesis_slot(5, &PublicKey::from_bytes([2u8; 32]))
            .unwrap();
        store
            .claim_genesis_slot(10, &PublicKey::from_bytes([3u8; 32]))
            .unwrap();

        assert_eq!(store.count_active_genesis(), 3);
    }

    #[test]
    fn test_genesis_cannot_be_revoked() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        // Try to revoke genesis identity
        let result = store.update_status(&identity, SponsorshipStatus::Revoked);

        assert!(matches!(result, Err(SponsorshipError::CannotRevokeGenesis)));

        // Verify status unchanged
        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.status, SponsorshipStatus::Active);
    }

    #[test]
    fn test_genesis_can_be_restricted() {
        let (store, _dir) = create_test_store();
        let identity = PublicKey::from_bytes([1u8; 32]);

        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        // Genesis can be restricted (but not revoked)
        let result = store.update_status(&identity, SponsorshipStatus::Restricted);
        assert!(result.is_ok());

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.status, SponsorshipStatus::Restricted);
    }

    #[test]
    fn test_regular_identity_can_be_revoked() {
        let (store, _dir) = create_test_store();
        let genesis = [1u8; 32];
        let regular = [2u8; 32];

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store
            .put(&make_regular_sponsorship(regular, genesis, 1))
            .unwrap();

        // Regular identity can be revoked
        let identity = PublicKey::from_bytes(regular);
        let result = store.update_status(&identity, SponsorshipStatus::Revoked);
        assert!(result.is_ok());

        let retrieved = store.get(&identity).unwrap().unwrap();
        assert_eq!(retrieved.status, SponsorshipStatus::Revoked);
    }

    // === Subtree Metrics Tests ===

    #[test]
    fn test_calculate_subtree_metrics_empty() {
        let (store, _dir) = create_test_store();

        // Genesis with no sponsees
        store.put(&make_genesis_sponsorship([1u8; 32])).unwrap();

        let (total, max_depth) = store
            .calculate_subtree_metrics(&PublicKey::from_bytes([1u8; 32]))
            .unwrap();

        assert_eq!(total, 0);
        assert_eq!(max_depth, 0);
    }

    #[test]
    fn test_calculate_subtree_metrics_linear_chain() {
        let (store, _dir) = create_test_store();

        // Create linear chain: Genesis(0) -> A(1) -> B(2) -> C(3) -> D(4)
        let genesis = [0u8; 32];
        let a = [1u8; 32];
        let b = [2u8; 32];
        let c = [3u8; 32];
        let d = [4u8; 32];

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store.put(&make_regular_sponsorship(a, genesis, 1)).unwrap();
        store.put(&make_regular_sponsorship(b, a, 2)).unwrap();
        store.put(&make_regular_sponsorship(c, b, 3)).unwrap();
        store.put(&make_regular_sponsorship(d, c, 4)).unwrap();

        // From genesis: 4 descendants, max depth 4
        let (total, max_depth) = store
            .calculate_subtree_metrics(&PublicKey::from_bytes(genesis))
            .unwrap();
        assert_eq!(total, 4);
        assert_eq!(max_depth, 4);

        // From A: 3 descendants (B, C, D), max depth 3
        let (total, max_depth) = store
            .calculate_subtree_metrics(&PublicKey::from_bytes(a))
            .unwrap();
        assert_eq!(total, 3);
        assert_eq!(max_depth, 3);

        // From D: 0 descendants (leaf node)
        let (total, max_depth) = store
            .calculate_subtree_metrics(&PublicKey::from_bytes(d))
            .unwrap();
        assert_eq!(total, 0);
        assert_eq!(max_depth, 0);
    }

    #[test]
    fn test_calculate_subtree_metrics_wide_tree() {
        let (store, _dir) = create_test_store();

        // Create wide tree: Genesis -> {A, B, C, D, E}
        let genesis = [0u8; 32];
        store.put(&make_genesis_sponsorship(genesis)).unwrap();

        for i in 1..=5 {
            store
                .put(&make_regular_sponsorship([i; 32], genesis, 1))
                .unwrap();
        }

        // From genesis: 5 descendants, max depth 1
        let (total, max_depth) = store
            .calculate_subtree_metrics(&PublicKey::from_bytes(genesis))
            .unwrap();
        assert_eq!(total, 5);
        assert_eq!(max_depth, 1);
    }

    #[test]
    fn test_calculate_linear_chain_metrics() {
        let (store, _dir) = create_test_store();

        // Create chain: Genesis -> A -> B
        let genesis = [0u8; 32];
        let a = [1u8; 32];
        let b = [2u8; 32];

        store.put(&make_genesis_sponsorship(genesis)).unwrap();
        store.put(&make_regular_sponsorship(a, genesis, 1)).unwrap();
        store.put(&make_regular_sponsorship(b, a, 2)).unwrap();

        // Genesis metrics: depth 0, breadth 2, direct 1
        let metrics = store
            .calculate_linear_chain_metrics(&PublicKey::from_bytes(genesis))
            .unwrap();
        assert_eq!(metrics.sponsorship_depth, 0);
        assert_eq!(metrics.subtree_breadth, 2);
        assert_eq!(metrics.direct_sponsee_count, 1);
        // linearity = 0/2 = 0
        assert!((metrics.linearity_score - 0.0).abs() < f32::EPSILON);

        // A metrics: depth 1, breadth 1, direct 1
        let metrics = store
            .calculate_linear_chain_metrics(&PublicKey::from_bytes(a))
            .unwrap();
        assert_eq!(metrics.sponsorship_depth, 1);
        assert_eq!(metrics.subtree_breadth, 1);
        assert_eq!(metrics.direct_sponsee_count, 1);
        // linearity = 1/1 = 1.0
        assert!((metrics.linearity_score - 1.0).abs() < f32::EPSILON);

        // B metrics: depth 2, breadth 0, direct 0
        let metrics = store
            .calculate_linear_chain_metrics(&PublicKey::from_bytes(b))
            .unwrap();
        assert_eq!(metrics.sponsorship_depth, 2);
        assert_eq!(metrics.subtree_breadth, 0);
        assert_eq!(metrics.direct_sponsee_count, 0);
        // linearity = 2/max(0,1) = 2.0
        assert!((metrics.linearity_score - 2.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_calculate_linear_chain_metrics_not_found() {
        let (store, _dir) = create_test_store();

        let result = store.calculate_linear_chain_metrics(&PublicKey::from_bytes([99u8; 32]));
        assert!(matches!(result, Err(SponsorshipError::StorageError(_))));
    }

    #[test]
    fn test_db_accessor() {
        let (store, _dir) = create_test_store();

        // Should be able to access the database
        let db = store.db();
        // Can open a tree on it
        let tree = db.open_tree("test_tree");
        assert!(tree.is_ok());
    }
}
