//! Public sponsorship offer storage using sled
//!
//! Persists sponsorship offers and claims to disk. Uses sled trees for efficient
//! queries on offer relationships.
//!
//! # Storage Layout
//!
//! - `offers`: offer_id(16) -> bincode(PublicSponsorshipOffer)
//! - `by_sponsor`: sponsor_pubkey(32) ++ offer_id(16) -> ()
//! - `claims`: offer_id(16) ++ claimant_pubkey(32) -> bincode(SponsorshipClaim)
//! - `claimed_counts`: offer_id(16) -> u8 (atomic counter)

use sled::{Db, Tree};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::types::{PublicSponsorshipOffer, SponsorshipClaim, SponsorshipOfferType};
use crate::types::identity::PublicKey;

/// Public sponsorship offer storage backed by sled
pub struct OfferStore {
    /// The sled database
    db: Db,
    /// Primary storage: offer_id(16) -> bincode(PublicSponsorshipOffer)
    offers: Tree,
    /// Secondary index: sponsor_pubkey(32) ++ offer_id(16) -> ()
    by_sponsor: Tree,
    /// Claims storage: offer_id(16) ++ claimant_pubkey(32) -> bincode(SponsorshipClaim)
    claims: Tree,
    /// Claimed count: offer_id(16) -> u8 (atomic counter)
    claimed_counts: Tree,
    /// Cancellation tombstones: offer_id(16) -> cancel timestamp (8, big-endian).
    /// A cancelled offer must STAY cancelled — offer-sync re-shares offers between
    /// peers, so a plain delete gets re-learned (even by the canceller from a
    /// peer). The tombstone makes the delete stick: receive/sync paths refuse to
    /// (re-)store a tombstoned offer, and the offer-list responder omits it.
    cancelled_offers: Tree,
}

impl OfferStore {
    /// Open or create from existing database
    pub fn from_db(db: &Db) -> Result<Self, SponsorshipError> {
        Ok(Self {
            db: db.clone(),
            offers: db.open_tree("sponsorship_offers")?,
            by_sponsor: db.open_tree("sponsorship_offers_by_sponsor")?,
            claims: db.open_tree("sponsorship_offer_claims")?,
            claimed_counts: db.open_tree("sponsorship_offer_claimed_counts")?,
            cancelled_offers: db.open_tree("sponsorship_offers_cancelled")?,
        })
    }

    // === Cancellation tombstones ===

    /// Mark an offer cancelled (tombstone) so it can't be re-learned via sync.
    /// Idempotent; keeps the earliest cancel timestamp seen.
    pub fn tombstone_offer(
        &self,
        offer_id: &[u8; 16],
        cancelled_at: u64,
    ) -> Result<(), SponsorshipError> {
        if self.cancelled_offers.get(offer_id)?.is_none() {
            self.cancelled_offers
                .insert(offer_id, &cancelled_at.to_be_bytes())?;
            self.db.flush()?;
        }
        Ok(())
    }

    /// Whether this offer has been cancelled (tombstoned) on this node.
    pub fn is_offer_cancelled(&self, offer_id: &[u8; 16]) -> Result<bool, SponsorshipError> {
        Ok(self.cancelled_offers.contains_key(offer_id)?)
    }

    /// Get reference to underlying database
    pub fn db(&self) -> &Db {
        &self.db
    }

    // === Offer CRUD ===

    /// Create a new offer
    ///
    /// Stores the offer and adds to the by_sponsor index.
    pub fn create_offer(&self, offer: &PublicSponsorshipOffer) -> Result<(), SponsorshipError> {
        let key = &offer.offer_id;
        let value = bincode::serialize(offer)?;

        // Check if offer already exists
        if self.offers.contains_key(key)? {
            return Err(SponsorshipError::InvalidInvariant(
                "offer_id already exists".into(),
            ));
        }

        // Store offer
        self.offers.insert(key, value)?;

        // Add to by_sponsor index
        let mut sponsor_key = Vec::with_capacity(48);
        sponsor_key.extend_from_slice(offer.sponsor.as_bytes());
        sponsor_key.extend_from_slice(&offer.offer_id);
        self.by_sponsor.insert(sponsor_key, &[])?;

        // Initialize claimed count to 0
        self.claimed_counts.insert(key, &[0u8])?;

        // Offers must survive process kills (mobile force-stop): sled's
        // background flush has been observed not to persist there.
        self.db.flush()?;

        Ok(())
    }

    /// Get an offer by ID
    pub fn get_offer(
        &self,
        offer_id: &[u8; 16],
    ) -> Result<Option<PublicSponsorshipOffer>, SponsorshipError> {
        match self.offers.get(offer_id)? {
            // A decode failure here means a legacy offer written by an older
            // binary whose `PublicSponsorshipOffer` layout predates a trailing
            // field (e.g. `space_scope`). Treat it as gone rather than erroring
            // the whole lookup — the node self-heals and the offer is simply
            // re-issued under the new layout. See list_active_offers.
            Some(data) => match bincode::deserialize(&data) {
                Ok(offer) => Ok(Some(offer)),
                Err(e) => {
                    log::warn!(
                        "dropping undecodable legacy sponsorship offer {}: {}",
                        hex::encode(offer_id),
                        e
                    );
                    Ok(None)
                }
            },
            None => Ok(None),
        }
    }

    /// Delete an offer
    ///
    /// Removes from both primary storage and by_sponsor index.
    /// Also removes all claims for this offer.
    pub fn delete_offer(&self, offer_id: &[u8; 16]) -> Result<(), SponsorshipError> {
        // Get the offer to find sponsor
        let offer = self
            .get_offer(offer_id)?
            .ok_or(SponsorshipError::OfferNotFound)?;

        // Remove from offers tree
        self.offers.remove(offer_id)?;

        // Remove from by_sponsor index
        let mut sponsor_key = Vec::with_capacity(48);
        sponsor_key.extend_from_slice(offer.sponsor.as_bytes());
        sponsor_key.extend_from_slice(offer_id);
        self.by_sponsor.remove(sponsor_key)?;

        // Remove claimed count
        self.claimed_counts.remove(offer_id)?;

        // Remove all claims for this offer
        let prefix = offer_id.as_slice();
        let claims_to_remove: Vec<_> = self
            .claims
            .scan_prefix(prefix)
            .filter_map(|r| r.ok())
            .map(|(k, _)| k)
            .collect();

        for key in claims_to_remove {
            self.claims.remove(key)?;
        }

        Ok(())
    }

    /// Check if an offer exists
    pub fn offer_exists(&self, offer_id: &[u8; 16]) -> Result<bool, SponsorshipError> {
        Ok(self.offers.contains_key(offer_id)?)
    }

    // === Sponsor-based Queries ===

    /// List all offers created by a sponsor
    pub fn list_by_sponsor(
        &self,
        sponsor: &PublicKey,
    ) -> Result<Vec<PublicSponsorshipOffer>, SponsorshipError> {
        let prefix = sponsor.as_bytes().as_slice();
        let mut offers = Vec::new();

        for item in self.by_sponsor.scan_prefix(prefix) {
            let (key, _) = item?;

            // Extract offer_id from key (last 16 bytes)
            if key.len() == 48 {
                let offer_id: [u8; 16] = key[32..48]
                    .try_into()
                    .map_err(|_| SponsorshipError::StorageError("invalid by_sponsor key".into()))?;

                if let Some(offer) = self.get_offer(&offer_id)? {
                    offers.push(offer);
                }
            }
        }

        Ok(offers)
    }

    // === Claimed Count Management ===

    /// Get the current claimed count for an offer
    pub fn get_claimed_count(&self, offer_id: &[u8; 16]) -> Result<u8, SponsorshipError> {
        match self.claimed_counts.get(offer_id)? {
            Some(data) => {
                if data.len() == 1 {
                    Ok(data[0])
                } else {
                    Err(SponsorshipError::StorageError(
                        "invalid claimed_count data".into(),
                    ))
                }
            }
            None => Ok(0),
        }
    }

    /// Atomically increment claimed count, returning the new count
    ///
    /// Fails with `OfferFullyClaimed` if count would exceed max.
    pub fn increment_claimed_count(
        &self,
        offer_id: &[u8; 16],
        max: u8,
    ) -> Result<u8, SponsorshipError> {
        // Use fetch_and_update for atomic increment
        let result = self.claimed_counts.fetch_and_update(offer_id, |old| {
            let current = old.map(|d| d[0]).unwrap_or(0);
            if current >= max {
                None // Return None to indicate failure (no update)
            } else {
                Some(vec![current + 1])
            }
        })?;

        // If fetch_and_update returned None, the update failed
        match result {
            Some(old_data) => {
                let old_count = if old_data.is_empty() { 0 } else { old_data[0] };
                let new_count = old_count + 1;
                if new_count > max {
                    Err(SponsorshipError::OfferFullyClaimed)
                } else {
                    Ok(new_count)
                }
            }
            None => {
                // First insert case - count was 0, now 1
                // Check if we just couldn't increment because it's full
                let current = self.get_claimed_count(offer_id)?;
                if current >= max {
                    Err(SponsorshipError::OfferFullyClaimed)
                } else {
                    // This shouldn't happen in normal operation
                    Ok(current)
                }
            }
        }
    }

    /// Raise the claimed count to at least `at_least` (monotonic max-merge).
    ///
    /// Used by offer-sync convergence (N3 follow-up): a claim/approval consumes
    /// a slot only on the node that processed it, so `claimed_count` is stale on
    /// other nodes (they show an offer as more open than it is). Peers gossip
    /// their claimed_count in the offer-list; each node raises its own to the
    /// max seen. Never lowers the count — an over-claim guard must not relax.
    /// Returns the resulting count.
    pub fn bump_claimed_count_to(
        &self,
        offer_id: &[u8; 16],
        at_least: u8,
    ) -> Result<u8, SponsorshipError> {
        let result = self.claimed_counts.fetch_and_update(offer_id, |old| {
            let current = old.map(|d| d[0]).unwrap_or(0);
            Some(vec![current.max(at_least)])
        })?;
        let prev = result
            .map(|d| if d.is_empty() { 0 } else { d[0] })
            .unwrap_or(0);
        Ok(prev.max(at_least))
    }

    /// Decrement claimed count (for rollback on failure)
    pub fn decrement_claimed_count(&self, offer_id: &[u8; 16]) -> Result<u8, SponsorshipError> {
        let result = self.claimed_counts.fetch_and_update(offer_id, |old| {
            let current = old.map(|d| d[0]).unwrap_or(0);
            Some(vec![current.saturating_sub(1)])
        })?;

        match result {
            Some(old_data) => {
                let old_count = if old_data.is_empty() { 0 } else { old_data[0] };
                Ok(old_count.saturating_sub(1))
            }
            None => Ok(0),
        }
    }

    // === Claim Management ===

    /// Submit a claim for an offer
    ///
    /// Fails with `DuplicateClaim` if claimant already has a claim for this offer.
    pub fn submit_claim(&self, claim: &SponsorshipClaim) -> Result<(), SponsorshipError> {
        let key = self.claim_key(&claim.offer_id, &claim.claimant);

        // Check for duplicate
        if self.claims.contains_key(&key)? {
            return Err(SponsorshipError::DuplicateClaim);
        }

        let value = bincode::serialize(claim)?;
        self.claims.insert(key, value)?;

        // Claims must survive process kills (mobile force-stop).
        self.db.flush()?;

        Ok(())
    }

    /// Get a specific claim
    pub fn get_claim(
        &self,
        offer_id: &[u8; 16],
        claimant: &PublicKey,
    ) -> Result<Option<SponsorshipClaim>, SponsorshipError> {
        let key = self.claim_key(offer_id, claimant);

        match self.claims.get(key)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Remove a claim
    pub fn remove_claim(
        &self,
        offer_id: &[u8; 16],
        claimant: &PublicKey,
    ) -> Result<(), SponsorshipError> {
        let key = self.claim_key(offer_id, claimant);
        self.claims.remove(key)?;
        Ok(())
    }

    /// Update a claim (e.g., to add sponsor approval)
    pub fn update_claim(&self, claim: &SponsorshipClaim) -> Result<(), SponsorshipError> {
        let key = self.claim_key(&claim.offer_id, &claim.claimant);

        // Check claim exists
        if !self.claims.contains_key(&key)? {
            return Err(SponsorshipError::ClaimNotFound);
        }

        let value = bincode::serialize(claim)?;
        self.claims.insert(key, value)?;

        Ok(())
    }

    /// Get all pending claims for an offer
    pub fn get_pending_claims(
        &self,
        offer_id: &[u8; 16],
    ) -> Result<Vec<SponsorshipClaim>, SponsorshipError> {
        let prefix = offer_id.as_slice();
        let mut claims = Vec::new();

        for item in self.claims.scan_prefix(prefix) {
            let (_, value) = item?;
            let claim: SponsorshipClaim = bincode::deserialize(&value)?;
            if claim.is_pending() {
                claims.push(claim);
            }
        }

        Ok(claims)
    }

    /// Get all claims for an offer (pending and approved)
    pub fn get_all_claims(
        &self,
        offer_id: &[u8; 16],
    ) -> Result<Vec<SponsorshipClaim>, SponsorshipError> {
        let prefix = offer_id.as_slice();
        let mut claims = Vec::new();

        for item in self.claims.scan_prefix(prefix) {
            let (_, value) = item?;
            let claim: SponsorshipClaim = bincode::deserialize(&value)?;
            claims.push(claim);
        }

        Ok(claims)
    }

    /// Get this node's own still-pending claims (claimant == `me`, no sponsor
    /// approval yet). Used by the claimant-side re-broadcast task so a claim
    /// reaches the sponsor even if the one-shot broadcast at submit time missed
    /// them — claims are not relayed or pull-synced by other nodes (SPEC_11).
    pub fn get_own_pending_claims(
        &self,
        me: &PublicKey,
    ) -> Result<Vec<SponsorshipClaim>, SponsorshipError> {
        let mut claims = Vec::new();
        for item in self.claims.iter() {
            let (_, value) = item?;
            let claim: SponsorshipClaim = bincode::deserialize(&value)?;
            if claim.is_pending() && claim.claimant == *me {
                claims.push(claim);
            }
        }
        Ok(claims)
    }

    /// Check if a claimant has already claimed an offer
    pub fn has_claimed(
        &self,
        offer_id: &[u8; 16],
        claimant: &PublicKey,
    ) -> Result<bool, SponsorshipError> {
        let key = self.claim_key(offer_id, claimant);
        Ok(self.claims.contains_key(key)?)
    }

    // === Discovery and Listing ===

    /// List all active offers (not expired, has capacity)
    pub fn list_active_offers(
        &self,
        current_time: u64,
    ) -> Result<Vec<PublicSponsorshipOffer>, SponsorshipError> {
        let mut result = Vec::new();

        for item in self.offers.iter() {
            let (key, value) = item?;
            // Skip (don't fail the whole listing on) legacy offers written by an
            // older binary whose struct layout predates a trailing field. One
            // undecodable row must not take down onboarding for every offer.
            let offer: PublicSponsorshipOffer = match bincode::deserialize(&value) {
                Ok(o) => o,
                Err(e) => {
                    log::warn!(
                        "skipping undecodable legacy sponsorship offer {}: {}",
                        hex::encode(&key),
                        e
                    );
                    continue;
                }
            };

            // Check not expired
            if offer.expires_at < current_time {
                continue;
            }

            // Check has capacity
            let count = self.get_claimed_count(&offer.offer_id)?;
            if count >= offer.max_sponsees {
                continue;
            }

            result.push(offer);
        }

        Ok(result)
    }

    /// Filter active offers by type
    pub fn filter_by_type(
        &self,
        offer_type: SponsorshipOfferType,
        current_time: u64,
    ) -> Result<Vec<PublicSponsorshipOffer>, SponsorshipError> {
        let offers = self.list_active_offers(current_time)?;
        Ok(offers
            .into_iter()
            .filter(|o| o.offer_type == offer_type)
            .collect())
    }

    /// Find offers a newcomer can claim based on their capabilities
    pub fn get_offers_for_newcomer(
        &self,
        pow_capability: u8,
        attester: Option<&PublicKey>,
        current_time: u64,
    ) -> Result<Vec<PublicSponsorshipOffer>, SponsorshipError> {
        let offers = self.list_active_offers(current_time)?;

        Ok(offers
            .into_iter()
            .filter(|o| {
                // Check PoW requirement
                o.requirements.min_pow_difficulty <= pow_capability
                    // Check attester requirement
                    && (o.requirements.required_attester.is_none()
                        || o.requirements.required_attester.as_ref() == attester)
            })
            .collect())
    }

    /// Paginated listing of active offers
    pub fn list_active_offers_paginated(
        &self,
        current_time: u64,
        offset: usize,
        limit: usize,
    ) -> Result<(Vec<PublicSponsorshipOffer>, bool), SponsorshipError> {
        let all = self.list_active_offers(current_time)?;
        let has_more = all.len() > offset + limit;
        let page: Vec<_> = all.into_iter().skip(offset).take(limit).collect();
        Ok((page, has_more))
    }

    /// Count total offers
    pub fn total_offer_count(&self) -> usize {
        self.offers.len()
    }

    /// Count total claims
    pub fn total_claim_count(&self) -> usize {
        self.claims.len()
    }

    /// Flush to disk
    pub fn flush(&self) -> Result<(), SponsorshipError> {
        self.db.flush()?;
        Ok(())
    }

    // === Internal Helpers ===

    /// Create a claim key from offer_id and claimant
    fn claim_key(&self, offer_id: &[u8; 16], claimant: &PublicKey) -> Vec<u8> {
        let mut key = Vec::with_capacity(48);
        key.extend_from_slice(offer_id);
        key.extend_from_slice(claimant.as_bytes());
        key
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::types::SponsorshipRequirements;
    use crate::types::identity::{IdentityCreationProof, Signature};
    use tempfile::TempDir;

    fn create_test_store() -> (OfferStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db = sled::open(temp_dir.path()).unwrap();
        let store = OfferStore::from_db(&db).unwrap();
        (store, temp_dir)
    }

    fn make_test_offer(sponsor: [u8; 32], offer_id: [u8; 16]) -> PublicSponsorshipOffer {
        PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes(sponsor),
            offer_id,
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Open,
            requirements: SponsorshipRequirements::default(),
            signature: Signature::from_bytes([0u8; 64]),
            auto_approve: false,
            space_scope: None,
        }
    }

    fn make_test_claim(offer_id: [u8; 16], claimant: [u8; 32]) -> SponsorshipClaim {
        SponsorshipClaim {
            offer_id,
            claimant: PublicKey::from_bytes(claimant),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes(claimant),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [0u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        }
    }

    #[test]
    fn test_offer_roundtrip() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();
        let retrieved = store.get_offer(&offer.offer_id).unwrap().unwrap();

        assert_eq!(offer, retrieved);
    }

    #[test]
    fn test_offer_not_found() {
        let (store, _dir) = create_test_store();
        let result = store.get_offer(&[99u8; 16]).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_duplicate_offer_id() {
        let (store, _dir) = create_test_store();
        let offer1 = make_test_offer([1u8; 32], [2u8; 16]);
        let offer2 = make_test_offer([3u8; 32], [2u8; 16]); // Same offer_id

        store.create_offer(&offer1).unwrap();
        let result = store.create_offer(&offer2);

        assert!(matches!(result, Err(SponsorshipError::InvalidInvariant(_))));
    }

    #[test]
    fn test_delete_offer() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();
        assert!(store.offer_exists(&offer.offer_id).unwrap());

        store.delete_offer(&offer.offer_id).unwrap();
        assert!(!store.offer_exists(&offer.offer_id).unwrap());
    }

    #[test]
    fn test_list_by_sponsor() {
        let (store, _dir) = create_test_store();
        let sponsor = [1u8; 32];

        // Create 3 offers from same sponsor
        for i in 0..3u8 {
            let mut offer_id = [0u8; 16];
            offer_id[0] = i;
            let offer = make_test_offer(sponsor, offer_id);
            store.create_offer(&offer).unwrap();
        }

        // Create offer from different sponsor
        let other_offer = make_test_offer([99u8; 32], [99u8; 16]);
        store.create_offer(&other_offer).unwrap();

        let sponsor_offers = store
            .list_by_sponsor(&PublicKey::from_bytes(sponsor))
            .unwrap();
        assert_eq!(sponsor_offers.len(), 3);

        // Check other sponsor
        let other_offers = store
            .list_by_sponsor(&PublicKey::from_bytes([99u8; 32]))
            .unwrap();
        assert_eq!(other_offers.len(), 1);
    }

    #[test]
    fn test_claimed_count_basic() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();

        // Initial count is 0
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 0);

        // Increment
        let new_count = store.increment_claimed_count(&offer.offer_id, 5).unwrap();
        assert_eq!(new_count, 1);
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 1);

        // Increment again
        let new_count = store.increment_claimed_count(&offer.offer_id, 5).unwrap();
        assert_eq!(new_count, 2);
    }

    #[test]
    fn test_claimed_count_max_enforcement() {
        let (store, _dir) = create_test_store();
        let mut offer = make_test_offer([1u8; 32], [2u8; 16]);
        offer.max_sponsees = 2;

        store.create_offer(&offer).unwrap();

        // Increment to max
        store.increment_claimed_count(&offer.offer_id, 2).unwrap();
        store.increment_claimed_count(&offer.offer_id, 2).unwrap();

        // Third should fail
        let result = store.increment_claimed_count(&offer.offer_id, 2);
        assert!(matches!(result, Err(SponsorshipError::OfferFullyClaimed)));
    }

    #[test]
    fn test_bump_claimed_count_monotonic() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        store.create_offer(&offer).unwrap();

        // Raises from 0 to a peer's higher count.
        assert_eq!(store.bump_claimed_count_to(&offer.offer_id, 3).unwrap(), 3);
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 3);

        // A lower peer count never lowers ours (over-claim guard must not relax).
        assert_eq!(store.bump_claimed_count_to(&offer.offer_id, 1).unwrap(), 3);
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 3);

        // Equal or higher raises.
        assert_eq!(store.bump_claimed_count_to(&offer.offer_id, 5).unwrap(), 5);
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 5);
    }

    #[test]
    fn test_decrement_claimed_count() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();

        // Increment twice
        store.increment_claimed_count(&offer.offer_id, 5).unwrap();
        store.increment_claimed_count(&offer.offer_id, 5).unwrap();
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 2);

        // Decrement
        let new_count = store.decrement_claimed_count(&offer.offer_id).unwrap();
        assert_eq!(new_count, 1);
        assert_eq!(store.get_claimed_count(&offer.offer_id).unwrap(), 1);
    }

    #[test]
    fn test_claim_roundtrip() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        let claim = make_test_claim([2u8; 16], [3u8; 32]);

        store.create_offer(&offer).unwrap();
        store.submit_claim(&claim).unwrap();

        let retrieved = store
            .get_claim(&claim.offer_id, &claim.claimant)
            .unwrap()
            .unwrap();
        assert_eq!(claim, retrieved);
    }

    #[test]
    fn test_duplicate_claim() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        let claim = make_test_claim([2u8; 16], [3u8; 32]);

        store.create_offer(&offer).unwrap();
        store.submit_claim(&claim).unwrap();

        let result = store.submit_claim(&claim);
        assert!(matches!(result, Err(SponsorshipError::DuplicateClaim)));
    }

    #[test]
    fn test_has_claimed() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        let claimant = PublicKey::from_bytes([3u8; 32]);

        store.create_offer(&offer).unwrap();

        assert!(!store.has_claimed(&offer.offer_id, &claimant).unwrap());

        let claim = make_test_claim([2u8; 16], [3u8; 32]);
        store.submit_claim(&claim).unwrap();

        assert!(store.has_claimed(&offer.offer_id, &claimant).unwrap());
    }

    #[test]
    fn test_get_pending_claims() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();

        // Add 3 pending claims
        for i in 0..3u8 {
            let mut claimant = [0u8; 32];
            claimant[0] = i + 10;
            let claim = make_test_claim([2u8; 16], claimant);
            store.submit_claim(&claim).unwrap();
        }

        // Add 1 approved claim
        let mut approved_claim = make_test_claim([2u8; 16], [99u8; 32]);
        approved_claim.sponsor_approval = Some(Signature::from_bytes([1u8; 64]));
        store.submit_claim(&approved_claim).unwrap();

        let pending = store.get_pending_claims(&offer.offer_id).unwrap();
        assert_eq!(pending.len(), 3);

        let all = store.get_all_claims(&offer.offer_id).unwrap();
        assert_eq!(all.len(), 4);
    }

    #[test]
    fn test_get_own_pending_claims() {
        use crate::types::identity::PublicKey;
        let (store, _dir) = create_test_store();
        for id in [[2u8; 16], [7u8; 16], [8u8; 16]] {
            store.create_offer(&make_test_offer([1u8; 32], id)).unwrap();
        }
        let me = [42u8; 32];
        let other = [43u8; 32];

        store.submit_claim(&make_test_claim([2u8; 16], me)).unwrap(); // mine, pending
        store.submit_claim(&make_test_claim([7u8; 16], me)).unwrap(); // mine, pending
        store
            .submit_claim(&make_test_claim([2u8; 16], other))
            .unwrap(); // other's, pending
        let mut approved = make_test_claim([8u8; 16], me);
        approved.sponsor_approval = Some(Signature::from_bytes([1u8; 64]));
        store.submit_claim(&approved).unwrap(); // mine, already approved

        let mine = store
            .get_own_pending_claims(&PublicKey::from_bytes(me))
            .unwrap();
        assert_eq!(mine.len(), 2, "only my two still-pending claims");
        assert!(mine
            .iter()
            .all(|c| c.claimant == PublicKey::from_bytes(me) && c.is_pending()));
    }

    #[test]
    fn test_remove_claim() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        let claim = make_test_claim([2u8; 16], [3u8; 32]);

        store.create_offer(&offer).unwrap();
        store.submit_claim(&claim).unwrap();

        assert!(store
            .get_claim(&claim.offer_id, &claim.claimant)
            .unwrap()
            .is_some());

        store
            .remove_claim(&claim.offer_id, &claim.claimant)
            .unwrap();

        assert!(store
            .get_claim(&claim.offer_id, &claim.claimant)
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_update_claim() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        let mut claim = make_test_claim([2u8; 16], [3u8; 32]);

        store.create_offer(&offer).unwrap();
        store.submit_claim(&claim).unwrap();

        // Update with approval
        claim.sponsor_approval = Some(Signature::from_bytes([1u8; 64]));
        store.update_claim(&claim).unwrap();

        let retrieved = store
            .get_claim(&claim.offer_id, &claim.claimant)
            .unwrap()
            .unwrap();
        assert!(retrieved.is_approved());
    }

    #[test]
    fn test_list_active_offers() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600u64;

        // Active offer (not expired, has capacity)
        let active_offer = make_test_offer([1u8; 32], [1u8; 16]);
        store.create_offer(&active_offer).unwrap();

        // Expired offer
        let mut expired_offer = make_test_offer([2u8; 32], [2u8; 16]);
        expired_offer.expires_at = current_time - 1000;
        store.create_offer(&expired_offer).unwrap();

        // Full offer (max_sponsees = 1, claimed = 1)
        let mut full_offer = make_test_offer([3u8; 32], [3u8; 16]);
        full_offer.max_sponsees = 1;
        store.create_offer(&full_offer).unwrap();
        store
            .increment_claimed_count(&full_offer.offer_id, 1)
            .unwrap();

        let active = store.list_active_offers(current_time).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].offer_id, [1u8; 16]);
    }

    #[test]
    fn test_filter_by_type() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600u64;

        // Open offer
        let mut open_offer = make_test_offer([1u8; 32], [1u8; 16]);
        open_offer.offer_type = SponsorshipOfferType::Open;
        store.create_offer(&open_offer).unwrap();

        // Probationary offer
        let mut prob_offer = make_test_offer([2u8; 32], [2u8; 16]);
        prob_offer.offer_type = SponsorshipOfferType::Probationary;
        store.create_offer(&prob_offer).unwrap();

        // Conditional offer
        let mut cond_offer = make_test_offer([3u8; 32], [3u8; 16]);
        cond_offer.offer_type = SponsorshipOfferType::Conditional;
        store.create_offer(&cond_offer).unwrap();

        let open = store
            .filter_by_type(SponsorshipOfferType::Open, current_time)
            .unwrap();
        assert_eq!(open.len(), 1);

        let prob = store
            .filter_by_type(SponsorshipOfferType::Probationary, current_time)
            .unwrap();
        assert_eq!(prob.len(), 1);
    }

    #[test]
    fn test_get_offers_for_newcomer() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600u64;

        // Low PoW requirement (10)
        let mut low_pow = make_test_offer([1u8; 32], [1u8; 16]);
        low_pow.requirements.min_pow_difficulty = 10;
        store.create_offer(&low_pow).unwrap();

        // High PoW requirement (20)
        let mut high_pow = make_test_offer([2u8; 32], [2u8; 16]);
        high_pow.requirements.min_pow_difficulty = 20;
        store.create_offer(&high_pow).unwrap();

        // Requires specific attester
        let mut attester_req = make_test_offer([3u8; 32], [3u8; 16]);
        attester_req.requirements.required_attester = Some(PublicKey::from_bytes([99u8; 32]));
        store.create_offer(&attester_req).unwrap();

        // Newcomer can do difficulty 15
        let offers = store
            .get_offers_for_newcomer(15, None, current_time)
            .unwrap();
        assert_eq!(offers.len(), 1);
        assert_eq!(offers[0].offer_id, [1u8; 16]);

        // Newcomer with difficulty 20+ can access both non-attester offers
        let offers = store
            .get_offers_for_newcomer(25, None, current_time)
            .unwrap();
        assert_eq!(offers.len(), 2);

        // Newcomer with attester
        let attester = PublicKey::from_bytes([99u8; 32]);
        let offers = store
            .get_offers_for_newcomer(25, Some(&attester), current_time)
            .unwrap();
        assert_eq!(offers.len(), 3);
    }

    #[test]
    fn test_paginated_listing() {
        let (store, _dir) = create_test_store();
        let current_time = 1735689600u64;

        // Create 10 offers
        for i in 0..10u8 {
            let mut offer_id = [0u8; 16];
            offer_id[0] = i;
            let mut sponsor = [0u8; 32];
            sponsor[0] = i;
            let offer = make_test_offer(sponsor, offer_id);
            store.create_offer(&offer).unwrap();
        }

        // First page
        let (page1, has_more1) = store
            .list_active_offers_paginated(current_time, 0, 3)
            .unwrap();
        assert_eq!(page1.len(), 3);
        assert!(has_more1);

        // Middle page
        let (page2, has_more2) = store
            .list_active_offers_paginated(current_time, 3, 3)
            .unwrap();
        assert_eq!(page2.len(), 3);
        assert!(has_more2);

        // Last page
        let (page3, has_more3) = store
            .list_active_offers_paginated(current_time, 8, 3)
            .unwrap();
        assert_eq!(page3.len(), 2);
        assert!(!has_more3);
    }

    #[test]
    fn test_delete_offer_removes_claims() {
        let (store, _dir) = create_test_store();
        let offer = make_test_offer([1u8; 32], [2u8; 16]);

        store.create_offer(&offer).unwrap();

        // Add claims
        for i in 0..3u8 {
            let mut claimant = [0u8; 32];
            claimant[0] = i + 10;
            let claim = make_test_claim([2u8; 16], claimant);
            store.submit_claim(&claim).unwrap();
        }

        assert_eq!(store.get_all_claims(&offer.offer_id).unwrap().len(), 3);

        // Delete offer
        store.delete_offer(&offer.offer_id).unwrap();

        // Claims should be gone too
        assert_eq!(store.get_all_claims(&offer.offer_id).unwrap().len(), 0);
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let offer_id = [42u8; 16];

        // Create and populate store
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = OfferStore::from_db(&db).unwrap();

            let offer = make_test_offer([1u8; 32], offer_id);
            store.create_offer(&offer).unwrap();

            let claim = make_test_claim(offer_id, [2u8; 32]);
            store.submit_claim(&claim).unwrap();

            store.flush().unwrap();
        }

        // Reopen and verify
        {
            let db = sled::open(temp_dir.path()).unwrap();
            let store = OfferStore::from_db(&db).unwrap();

            let offer = store.get_offer(&offer_id).unwrap();
            assert!(offer.is_some());

            let claim = store
                .get_claim(&offer_id, &PublicKey::from_bytes([2u8; 32]))
                .unwrap();
            assert!(claim.is_some());
        }
    }

    #[test]
    fn test_counts() {
        let (store, _dir) = create_test_store();

        assert_eq!(store.total_offer_count(), 0);
        assert_eq!(store.total_claim_count(), 0);

        let offer = make_test_offer([1u8; 32], [2u8; 16]);
        store.create_offer(&offer).unwrap();
        assert_eq!(store.total_offer_count(), 1);

        let claim = make_test_claim([2u8; 16], [3u8; 32]);
        store.submit_claim(&claim).unwrap();
        assert_eq!(store.total_claim_count(), 1);
    }
}
