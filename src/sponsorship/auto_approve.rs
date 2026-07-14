//! Sponsor-side claim approval, shared by the RPC layer and the background
//! auto-approve sweep.
//!
//! `execute_claim_approval` is the single chain-based approval path: verify
//! the sponsor may sponsor (genesis fallback included), atomically claim a
//! slot, mark the stored claim approved, and put the on-chain Sponsor action
//! into the mempool + broadcast it. The chain remains the single source of
//! truth for the resulting StoredSponsorship — nothing here writes one
//! directly.
//!
//! The claim is MARKED approved (`sponsor_approval` set) rather than removed:
//! removal let the claimant's 30s re-broadcast race the approval and
//! resurrect the claim as pending on the sponsor (observed live 2026-07-14),
//! where a second manual Approve would double-sponsor. A kept, approved claim
//! makes every re-received copy hit the DuplicateClaim arm instead.

use std::sync::{Arc, RwLock};

use log::info;

use crate::blocks::{Action, BlockBuilder, BranchPath};
use crate::node::peer_connections::PeerConnectionPool;
use crate::sponsorship::offer_store::OfferStore;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::{PublicSponsorshipOffer, SponsorshipClaim, SponsorshipOfferType};
use crate::storage::ChainStore;
use crate::types::identity::Signature;

/// Why an approval could not be executed. Callers map these to their own
/// error surfaces (RPC codes, task log lines).
#[derive(Debug)]
pub enum ClaimApprovalError {
    /// Sponsor has no sponsorship record and is not in the genesis list.
    SponsorNotFound,
    /// Sponsor exists but cannot sponsor right now (penalty/probation rules).
    SponsorRestricted,
    /// Offer has no remaining slots (`increment_claimed_count` guard).
    NoSlots(String),
    /// Storage-layer failure.
    Store(String),
}

impl std::fmt::Display for ClaimApprovalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SponsorNotFound => write!(f, "Sponsor not found"),
            Self::SponsorRestricted => write!(f, "Sponsor cannot sponsor at this time"),
            Self::NoSlots(e) => write!(f, "Offer has no remaining slots: {}", e),
            Self::Store(e) => write!(f, "{}", e),
        }
    }
}

/// Execute a sponsor-signed claim approval (shared RPC + auto-approve path).
///
/// `sponsor_sig_bytes` must be the sponsor's Ed25519 signature over
/// `claimant(32) || timestamp(8 BE)` — the exact message the on-chain Sponsor
/// action carries. Verification of that signature (for client-supplied sigs)
/// is the caller's job; this function only executes.
///
/// Returns `(depth, probationary)` on success.
pub async fn execute_claim_approval(
    offer_store: &OfferStore,
    sponsorship_store: &SponsorshipStore,
    chain_store: Option<&Arc<ChainStore>>,
    block_builder: Option<&Arc<RwLock<BlockBuilder>>>,
    connection_pool: Option<&Arc<PeerConnectionPool>>,
    offer: &PublicSponsorshipOffer,
    claim: &SponsorshipClaim,
    sponsor_sig_bytes: [u8; 64],
    timestamp: u64,
    current_time: u64,
) -> Result<(u8, bool), ClaimApprovalError> {
    let sponsor_pk = offer.sponsor;
    let sponsor_bytes = *sponsor_pk.as_bytes();
    let claimant_bytes = *claim.claimant.as_bytes();

    // Verify sponsor is Active (or in genesis list)
    let sponsor_record = match sponsorship_store.get(&sponsor_pk) {
        Ok(Some(r)) => Some(r),
        Ok(None) => {
            // Genesis identities can sponsor without a store record
            if crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&sponsor_pk) {
                None
            } else {
                return Err(ClaimApprovalError::SponsorNotFound);
            }
        }
        Err(e) => {
            return Err(ClaimApprovalError::Store(format!(
                "Failed to check sponsor: {}",
                e
            )));
        }
    };

    // Genesis identities can always sponsor; others need to pass can_sponsor_basic
    if let Some(ref record) = sponsor_record {
        if !record.can_sponsor_basic(current_time) {
            return Err(ClaimApprovalError::SponsorRestricted);
        }
    }

    // Genesis identities have depth 0, so children get depth 1
    let depth = match &sponsor_record {
        Some(r) => r.depth.saturating_add(1),
        None => 1,
    };
    let probationary = offer.offer_type == SponsorshipOfferType::Probationary;

    // Atomically claim a slot BEFORE any other side effect. This is the
    // over-claim guard: increment_claimed_count uses sled fetch_and_update
    // and fails with OfferFullyClaimed once max_sponsees is reached.
    if let Err(e) = offer_store.increment_claimed_count(&offer.offer_id, offer.max_sponsees) {
        return Err(ClaimApprovalError::NoSlots(e.to_string()));
    }

    // NOTE: Do NOT create StoredSponsorship directly here.
    // The on-chain Sponsor action (created below) will be processed by
    // apply_sponsorship_actions_from_block when the block is formed,
    // which creates the StoredSponsorship on all nodes including this one.
    // This ensures the chain is the single source of truth.

    // Mark the claim approved (kept in the store as the gossip dedup record —
    // see module docs; removal resurrects the claim via claimant re-broadcast).
    {
        let mut approved = claim.clone();
        approved.sponsor_approval = Some(Signature::from_bytes(sponsor_sig_bytes));
        let _ = offer_store.update_claim(&approved);
    }

    // Create on-chain Sponsor action
    {
        // Compute actual pow_work from the claim's PoW proof
        let pow_work = {
            use sha2::{Digest, Sha256};
            let mut pow_input = Vec::with_capacity(40);
            pow_input.extend_from_slice(&claim.pow_nonce_space);
            pow_input.extend_from_slice(&claim.identity_pow_proof.nonce.to_le_bytes());
            let pow_hash = Sha256::digest(&pow_input);
            pow_hash.iter().take_while(|&&b| b == 0).count() as u64
        };

        let action = Action::new_sponsor_with_pow(
            sponsor_bytes,
            claimant_bytes,
            timestamp, // must match the timestamp covered by sponsor_sig_bytes
            sponsor_sig_bytes,
            claim.identity_pow_proof.nonce,
            pow_work,
            claim.pow_nonce_space, // pow_target = the challenge input, not the hash output
        );

        let system_space_id = [0u8; 32];
        let action_hash = action.hash();

        if let Some(bb) = block_builder {
            // New thread in the system space: hash-derived branch (SPEC_08 §4)
            let branch_path = match chain_store {
                Some(store) => crate::branch::BranchManager::new(store)
                    .resolve_mempool_branch_path(
                        &system_space_id,
                        &action_hash,
                        Some(&sponsor_bytes),
                    ),
                None => BranchPath::root(),
            };
            if let Ok(mut builder) = bb.write() {
                builder.add_action(action_hash, system_space_id, action.clone(), branch_path);
            }
        }

        // Broadcast to peers
        if let Some(pool) = connection_pool {
            use crate::network::messages::ActionAnnouncePayload;
            use crate::types::network::{MessageEnvelope, MessageType};

            let action_data = action.serialize();
            let payload = ActionAnnouncePayload::new(action_hash, system_space_id, action_data);
            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::ActionAnnounce,
                payload.to_bytes().to_vec(),
            );
            let peers = pool.peer_ids().await;
            for peer_id in peers {
                let _ = pool.send_to(&peer_id, &envelope).await;
            }
        }
    }

    info!(
        "[SPONSORSHIP] Executed claim approval: {} sponsored by {} (depth={}, offer {})",
        hex::encode(&claimant_bytes[..8]),
        hex::encode(&sponsor_bytes[..8]),
        depth,
        hex::encode(&offer.offer_id[..8]),
    );

    Ok((depth, probationary))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::types::SponsorshipRequirements;
    use crate::types::identity::{IdentityCreationProof, PublicKey};

    fn temp_stores() -> (OfferStore, SponsorshipStore, sled::Db) {
        let db = sled::Config::new().temporary(true).open().unwrap();
        let offers = OfferStore::from_db(&db).unwrap();
        let sponsorships = SponsorshipStore::from_db(&db).unwrap();
        (offers, sponsorships, db)
    }

    fn genesis_sponsor_pk() -> PublicKey {
        // First hardcoded genesis identity — sponsors without a store record.
        crate::sponsorship::genesis_list::get_hardcoded_genesis_list()[0].0
    }

    fn make_offer(sponsor: PublicKey, auto_approve: bool) -> PublicSponsorshipOffer {
        PublicSponsorshipOffer {
            offer_id: [7u8; 16],
            sponsor,
            offer_type: SponsorshipOfferType::Probationary,
            max_sponsees: 1,
            expires_at: u64::MAX,
            created_at: 0,
            requirements: SponsorshipRequirements {
                min_pow_difficulty: 0,
                required_attester: None,
                application_required: false,
            },
            signature: crate::types::identity::Signature::from_bytes([0u8; 64]),
            auto_approve,
        }
    }

    fn make_claim(offer_id: [u8; 16], claimant: PublicKey) -> SponsorshipClaim {
        SponsorshipClaim {
            offer_id,
            claimant,
            claimed_at: 1,
            identity_pow_proof: IdentityCreationProof {
                public_key: claimant,
                timestamp: 1,
                nonce: 0,
                pow_hash: [0u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: crate::types::identity::Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        }
    }

    #[tokio::test]
    async fn approval_marks_claim_approved_and_claims_slot() {
        let (offers, sponsorships, _db) = temp_stores();
        let sponsor = genesis_sponsor_pk();
        let claimant = crate::identity::generate_keypair().public_key;

        let offer = make_offer(sponsor, true);
        offers.create_offer(&offer).unwrap();
        let claim = make_claim(offer.offer_id, claimant);
        offers.submit_claim(&claim).unwrap();
        assert_eq!(offers.get_pending_claims(&offer.offer_id).unwrap().len(), 1);

        let (depth, probationary) = execute_claim_approval(
            &offers,
            &sponsorships,
            None,
            None,
            None,
            &offer,
            &claim,
            [9u8; 64],
            100,
            100,
        )
        .await
        .expect("approval should succeed");
        assert_eq!(depth, 1);
        assert!(probationary);

        // Slot consumed, claim no longer pending but still stored (gossip dedup).
        assert_eq!(offers.get_claimed_count(&offer.offer_id).unwrap(), 1);
        assert!(offers
            .get_pending_claims(&offer.offer_id)
            .unwrap()
            .is_empty());
        let stored = offers
            .get_claim(&offer.offer_id, &claimant)
            .unwrap()
            .expect("claim must remain stored");
        assert!(stored.is_approved());

        // A re-received gossip copy of the (pending) claim must be rejected as
        // a duplicate — this is the ghost-claim fix.
        assert!(matches!(
            offers.submit_claim(&claim),
            Err(crate::sponsorship::error::SponsorshipError::DuplicateClaim)
        ));

        // Second approval attempt fails on the slot guard.
        let again = execute_claim_approval(
            &offers,
            &sponsorships,
            None,
            None,
            None,
            &offer,
            &claim,
            [9u8; 64],
            101,
            101,
        )
        .await;
        assert!(matches!(again, Err(ClaimApprovalError::NoSlots(_))));
    }

    #[tokio::test]
    async fn unknown_sponsor_is_rejected() {
        let (offers, sponsorships, _db) = temp_stores();
        let sponsor = crate::identity::generate_keypair().public_key; // not genesis, no record
        let claimant = crate::identity::generate_keypair().public_key;
        let offer = make_offer(sponsor, true);
        offers.create_offer(&offer).unwrap();
        let claim = make_claim(offer.offer_id, claimant);
        offers.submit_claim(&claim).unwrap();

        let res = execute_claim_approval(
            &offers,
            &sponsorships,
            None,
            None,
            None,
            &offer,
            &claim,
            [9u8; 64],
            100,
            100,
        )
        .await;
        assert!(matches!(res, Err(ClaimApprovalError::SponsorNotFound)));
        // Claim untouched.
        assert_eq!(offers.get_pending_claims(&offer.offer_id).unwrap().len(), 1);
    }
}
