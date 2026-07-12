//! Sponsorship misbehavior manager — node-local penalty propagation entry point.
//!
//! This module provides [`SponsorshipManager`], the single object that owns both
//! the [`SponsorshipStore`] and a [`PenaltyStore`] and exposes the misbehavior /
//! consequence-propagation surface to the rest of the node (the P2P router and the
//! RPC layer). Previously `on_misbehavior` / `propagate_consequences` were only ever
//! called from unit tests; this manager is what actually gets wired to a live
//! trigger (see `content`/spam-attestation flagging in the router).
//!
//! # v1 policy: node-local, NOT consensus
//!
//! The consequences applied here are **node-local policy only**. They are:
//!
//! - Derived from *this node's* local view of spam attestations (SPEC_12). Different
//!   nodes may observe a different set of attestations and therefore hold different
//!   penalty state. That is acceptable precisely because none of this is consensus.
//! - Stored only in the node's local sled database (the `penalties` trees and the
//!   `penalty_until`/`status` fields of `StoredSponsorship`). They are **never**
//!   written into blocks and are **not** part of the chain. On restart the
//!   sponsorship tree is rebuilt from chain actions as `Active` (penalty state is
//!   intentionally ephemeral) — a fresh spam-attestation quorum re-applies them.
//! - Confined to the **sponsorship domain**. A penalty here can only cause a node to
//!   *refuse or reduce its own willingness to accept new sponsorships* originating
//!   from a penalized identity (i.e. the `LostInviteSlots` consequence). It must
//!   NEVER change the penalized identity's proof-of-work cost, nor the decay of
//!   their existing content. (Content decay is driven independently by SPEC_12 spam
//!   attestations in `content::decay_integration`, not by this module.)
//!
//! Anything that would make these penalties consensus-relevant (e.g. encoding them
//! in blocks, or gating PoW/decay on them) is explicitly out of scope for v1 and
//! must be flagged before being attempted.
//!
//! # Attenuation & aging (verified against SPEC_11 §4.2 / §3.6)
//!
//! Propagation up the sponsor chain attenuates per hop, and every penalty ages out:
//!
//! - hop 1 (direct sponsor): 100% (`CONSEQUENCE_DECAY_HOP_1 = 1.0`)
//! - hop 2 (sponsor's sponsor): 50% (`CONSEQUENCE_DECAY_HOP_2 = 0.5`)
//! - hop 3+: warning only (`CONSEQUENCE_DECAY_HOP_3_PLUS = 0.0`)
//! - a probationary offender further scales sponsor penalties by
//!   `PROBATION_CONSEQUENCE_MULTIPLIER = 0.25`.
//!
//! Durations are bounded (`SPAM_PENALTY_SECONDS` etc.) and every acceptance check is
//! time-gated against `current_time`, so consequences expire on their own with no
//! sweeper required. The attenuation itself is handled by `propagate_consequences`;
//! this manager just owns the stores and the trigger surface.

use std::sync::Arc;

use crate::sponsorship::penalty::{MisbehaviorSeverity, PenaltyRecord, PenaltyType};
use crate::sponsorship::penalty_store::PenaltyStore;
use crate::sponsorship::propagation::PropagationResult;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
use crate::sponsorship::SponsorshipError;
use crate::types::identity::PublicKey;

/// A snapshot of an identity's sponsorship standing including any active penalties.
///
/// Returned by [`SponsorshipManager::status`] and surfaced over RPC.
#[derive(Debug, Clone)]
pub struct SponsorshipStatusReport {
    /// The stored sponsorship record, if this identity is known to the tree.
    pub sponsorship: Option<StoredSponsorship>,
    /// Active (non-expired) penalty records for this identity.
    pub active_penalties: Vec<PenaltyRecord>,
    /// Whether the identity is currently barred from originating new sponsorships
    /// under this node's local policy (active `LostInviteSlots` penalty, revoked, or
    /// a still-active `penalty_until`).
    pub sponsorship_barred: bool,
}

/// Owns the sponsorship + penalty stores and drives node-local consequence
/// propagation. See the module docs for the (deliberate) non-consensus semantics.
#[derive(Clone)]
pub struct SponsorshipManager {
    sponsorship_store: Arc<SponsorshipStore>,
    penalty_store: Arc<PenaltyStore>,
}

impl SponsorshipManager {
    /// Build a manager over an existing sponsorship store.
    ///
    /// The [`PenaltyStore`] is opened from the *same* sled database as the
    /// sponsorship store, so penalty records live alongside the sponsorship tree
    /// and every `SponsorshipManager` built from the same store shares one
    /// consistent view (sled tree handles are cached per-db).
    pub fn new(sponsorship_store: Arc<SponsorshipStore>) -> Result<Self, SponsorshipError> {
        let penalty_store = Arc::new(PenaltyStore::from_db(sponsorship_store.db())?);
        Ok(Self {
            sponsorship_store,
            penalty_store,
        })
    }

    /// Build a manager from already-constructed stores (mainly for tests).
    pub fn from_stores(
        sponsorship_store: Arc<SponsorshipStore>,
        penalty_store: Arc<PenaltyStore>,
    ) -> Self {
        Self {
            sponsorship_store,
            penalty_store,
        }
    }

    /// Access the underlying sponsorship store.
    #[must_use]
    pub fn sponsorship_store(&self) -> &Arc<SponsorshipStore> {
        &self.sponsorship_store
    }

    /// Access the underlying penalty store.
    #[must_use]
    pub fn penalty_store(&self) -> &Arc<PenaltyStore> {
        &self.penalty_store
    }

    /// Apply and propagate consequences for a detected misbehavior.
    ///
    /// This is the node-local entry point that wires the (previously test-only)
    /// `on_misbehavior` propagation into live triggers. Consequences attenuate up
    /// the sponsor chain and age out; see the module docs.
    pub fn on_misbehavior(
        &self,
        offender: &PublicKey,
        severity: MisbehaviorSeverity,
        current_time: u64,
    ) -> Result<PropagationResult, SponsorshipError> {
        crate::sponsorship::on_misbehavior(
            &self.sponsorship_store,
            &self.penalty_store,
            offender,
            severity,
            current_time,
        )
    }

    /// Trigger for the SPEC_12 spam-flag threshold: the given content author's
    /// content crossed the "flagged as spam by 3+ independent sponsor trees"
    /// threshold (the same event that accelerates decay). We treat that as
    /// [`MisbehaviorSeverity::Spam`] and propagate consequences up the author's
    /// sponsor chain.
    ///
    /// Best-effort by contract: callers should log and continue on error rather
    /// than failing the spam-attestation handler.
    pub fn on_spam_flagged_content(
        &self,
        author: &PublicKey,
        current_time: u64,
    ) -> Result<PropagationResult, SponsorshipError> {
        self.on_misbehavior(author, MisbehaviorSeverity::Spam, current_time)
    }

    /// Active (non-expired) penalties for an identity.
    pub fn active_penalties(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<Vec<PenaltyRecord>, SponsorshipError> {
        self.penalty_store
            .get_active_penalties(identity, current_time)
    }

    /// Node-local policy check: should this node accept a *new* sponsorship
    /// originating from `sponsor` right now?
    ///
    /// Returns `false` when the sponsor carries an active `LostInviteSlots`
    /// penalty (the sponsorship-domain consequence of having sponsored a spammer)
    /// or a still-active `penalty_until` on their sponsorship record. This is the
    /// concrete "refuse/reduce acceptance of sponsorship offers from penalized
    /// identities" rule. It is intentionally the *only* thing a penalty gates —
    /// posting, PoW and content decay are untouched.
    ///
    /// Note: the existing acceptance paths (`create_public_offer`,
    /// `execute_claim_approval`, `register_sponsored_identity_with_rights`) already
    /// reject sponsors whose `StoredSponsorship` is under penalty, because
    /// `on_misbehavior` sets `penalty_until` + `Restricted` status. This method is
    /// the penalty-type-aware superset used for explicit checks and diagnostics.
    #[must_use]
    pub fn accepts_sponsorship_from(&self, sponsor: &PublicKey, current_time: u64) -> bool {
        !self.is_sponsorship_barred(sponsor, current_time)
    }

    /// Inverse of [`Self::accepts_sponsorship_from`]: is the identity barred from
    /// originating new sponsorships under this node's local policy?
    #[must_use]
    pub fn is_sponsorship_barred(&self, identity: &PublicKey, current_time: u64) -> bool {
        // Revoked / active penalty_until on the sponsorship record.
        if let Ok(Some(record)) = self.sponsorship_store.get(identity) {
            if record.status == SponsorshipStatus::Revoked || record.is_under_penalty(current_time)
            {
                return true;
            }
        }
        // Explicit sponsorship-domain penalty types.
        self.penalty_store
            .has_penalty_type(identity, PenaltyType::LostInviteSlots, current_time)
            .unwrap_or(false)
            || self
                .penalty_store
                .has_penalty_type(identity, PenaltyType::PermanentRevocation, current_time)
                .unwrap_or(false)
    }

    /// Build a status report (sponsorship record + active penalties + barred flag).
    pub fn status(
        &self,
        identity: &PublicKey,
        current_time: u64,
    ) -> Result<SponsorshipStatusReport, SponsorshipError> {
        let sponsorship = self.sponsorship_store.get(identity)?;
        let active_penalties = self
            .penalty_store
            .get_active_penalties(identity, current_time)?;
        let sponsorship_barred = self.is_sponsorship_barred(identity, current_time);
        Ok(SponsorshipStatusReport {
            sponsorship,
            active_penalties,
            sponsorship_barred,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
    use tempfile::TempDir;

    fn make_manager() -> (SponsorshipManager, TempDir) {
        let dir = TempDir::new().unwrap();
        let store = Arc::new(SponsorshipStore::open(dir.path()).unwrap());
        (SponsorshipManager::new(store).unwrap(), dir)
    }

    fn pk(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    fn genesis(identity: PublicKey) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
            sponsor: None,
            creation_timestamp: 1_735_689_600,
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

    fn regular(identity: PublicKey, sponsor: PublicKey, depth: u8) -> StoredSponsorship {
        StoredSponsorship {
            sponsored_identity: identity,
            sponsor: Some(sponsor),
            creation_timestamp: 1_735_689_600,
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

    /// The core trigger-wiring test: a spam-flag threshold event on the offender
    /// must penalize the direct sponsor (hop 1, LostInviteSlots) and bar that
    /// sponsor from originating new sponsorships — while leaving the grand-sponsor
    /// with a warning only (hop 2 spam attenuation).
    #[test]
    fn spam_flag_trigger_penalizes_direct_sponsor_and_bars_them() {
        let (mgr, _dir) = make_manager();
        let time = 1_735_689_600;

        // Genesis -> A -> B (offender)
        let g = pk(0);
        let a = pk(1);
        let b = pk(2);
        mgr.sponsorship_store().put(&genesis(g)).unwrap();
        mgr.sponsorship_store().put(&regular(a, g, 1)).unwrap();
        mgr.sponsorship_store().put(&regular(b, a, 2)).unwrap();

        // Before the trigger, the direct sponsor A can sponsor.
        assert!(mgr.accepts_sponsorship_from(&a, time));

        let result = mgr.on_spam_flagged_content(&b, time).unwrap();

        // Offender penalized (RestrictedPosting) — sponsorship domain only.
        assert_eq!(
            result.offender_penalty.penalty_type,
            PenaltyType::RestrictedPosting
        );

        // Direct sponsor A penalized with LostInviteSlots and now barred.
        assert!(mgr
            .penalty_store()
            .has_penalty_type(&a, PenaltyType::LostInviteSlots, time)
            .unwrap());
        assert!(!mgr.accepts_sponsorship_from(&a, time));
        assert!(mgr.is_sponsorship_barred(&a, time));

        // Grand-sponsor genesis (hop 2, spam) gets a warning only, no penalty, not barred.
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].identity, g);
        assert!(mgr.accepts_sponsorship_from(&g, time));
    }

    /// Consequences must age out: after the penalty window the sponsor is
    /// accepted again with no manual cleanup.
    #[test]
    fn penalty_ages_out() {
        use crate::sponsorship::penalty::SPAM_PENALTY_SECONDS;
        let (mgr, _dir) = make_manager();
        let time = 1_735_689_600;

        let g = pk(0);
        let a = pk(1);
        let b = pk(2);
        mgr.sponsorship_store().put(&genesis(g)).unwrap();
        mgr.sponsorship_store().put(&regular(a, g, 1)).unwrap();
        mgr.sponsorship_store().put(&regular(b, a, 2)).unwrap();

        mgr.on_spam_flagged_content(&b, time).unwrap();
        assert!(mgr.is_sponsorship_barred(&a, time));

        // Well past the spam penalty window (hop-1 spam == SPAM_PENALTY_SECONDS).
        let later = time + SPAM_PENALTY_SECONDS + 1;
        assert!(!mgr.is_sponsorship_barred(&a, later));
        assert!(mgr.accepts_sponsorship_from(&a, later));
        assert!(mgr.active_penalties(&a, later).unwrap().is_empty());
    }

    /// The status report reflects the penalty and the barred flag.
    #[test]
    fn status_report_includes_active_penalties() {
        let (mgr, _dir) = make_manager();
        let time = 1_735_689_600;

        let g = pk(0);
        let a = pk(1);
        let b = pk(2);
        mgr.sponsorship_store().put(&genesis(g)).unwrap();
        mgr.sponsorship_store().put(&regular(a, g, 1)).unwrap();
        mgr.sponsorship_store().put(&regular(b, a, 2)).unwrap();

        mgr.on_spam_flagged_content(&b, time).unwrap();

        let report = mgr.status(&a, time).unwrap();
        assert!(report.sponsorship.is_some());
        assert!(report.sponsorship_barred);
        assert!(report
            .active_penalties
            .iter()
            .any(|p| p.penalty_type == PenaltyType::LostInviteSlots));

        // Unknown identity: no record, no penalties, not barred.
        let unknown = mgr.status(&pk(200), time).unwrap();
        assert!(unknown.sponsorship.is_none());
        assert!(unknown.active_penalties.is_empty());
        assert!(!unknown.sponsorship_barred);
    }

    /// An offender with no sponsor (genesis) still gets its own penalty, and the
    /// propagation produces no sponsor penalties or warnings.
    #[test]
    fn genesis_offender_no_sponsor_chain() {
        let (mgr, _dir) = make_manager();
        let time = 1_735_689_600;

        let g = pk(0);
        mgr.sponsorship_store().put(&genesis(g)).unwrap();

        let result = mgr.on_spam_flagged_content(&g, time).unwrap();
        assert_eq!(result.offender_penalty.identity, g);
        assert!(result.sponsor_penalties.is_empty());
        assert!(result.warnings.is_empty());
    }
}
