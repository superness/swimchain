//! Sponsorship type definitions
//!
//! Core data structures for the sponsorship system per SPEC_11.

use serde::{Deserialize, Serialize};

use crate::sponsorship::error::SponsorshipError;
use crate::types::identity::{IdentityCreationProof, PublicKey, Signature};

// === SPEC_11 Section 3.6: Protocol Constants ===

/// Probation period in days (Milestone 9.6: 180 days)
pub const PROBATION_PERIOD_DAYS: u32 = 180;

/// Probation period in seconds (180 days per Milestone 9.6)
pub const PROBATION_PERIOD_SECONDS: u64 = 15_552_000;

/// Timestamp tolerance for sponsorship creation (1 hour in seconds)
pub const TIMESTAMP_TOLERANCE_SECONDS: u64 = 3600;

/// Consequence decay at 1 hop (sponsor of violator)
pub const CONSEQUENCE_DECAY_HOP_1: f32 = 1.0;

/// Consequence decay at 2 hops (sponsor of sponsor of violator)
pub const CONSEQUENCE_DECAY_HOP_2: f32 = 0.5;

/// Consequence decay at 3+ hops (negligible)
pub const CONSEQUENCE_DECAY_HOP_3_PLUS: f32 = 0.0;

/// Probationary sponsorship consequence multiplier
pub const PROBATION_CONSEQUENCE_MULTIPLIER: f32 = 0.25;

/// Linearity score threshold for suspicious detection
pub const LINEARITY_SCORE_THRESHOLD: f32 = 0.8;

/// Minimum depth for linear chain detection
pub const LINEAR_CHAIN_MIN_DEPTH: u8 = 4;

/// Default maximum breadth to consider linear (single chain)
pub const DEFAULT_MAX_LINEAR_BREADTH: u32 = 1;

/// Maximum number of genesis identities
pub const MAX_GENESIS_IDENTITIES: u32 = 100;

/// Minimum attestations for genesis identity creation
pub const MIN_ATTESTATION_COUNT: u8 = 3;

/// Maximum attestations to store (2/3 of MAX_GENESIS_IDENTITIES)
pub const MAX_ATTESTATION_COUNT: usize = 67;

// === SPEC_11 Section 4.1: Sponsorship Capacity ===

/// Monthly sponsorship capacity for Resident level
/// Note: SPEC_11 does not specify; assumed same as Lifeguard
pub const RESIDENT_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 1;

/// Monthly sponsorship capacity for Lifeguard level (RESEARCH_06)
pub const LIFEGUARD_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 1;

/// Monthly sponsorship capacity for Anchor level (RESEARCH_06)
pub const ANCHOR_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 3;

/// Monthly sponsorship capacity for PoolKeeper level
/// u8::MAX (255) represents effectively unlimited
pub const POOL_KEEPER_MONTHLY_SPONSORSHIP_CAPACITY: u8 = u8::MAX;

/// Minimum time between sponsorships (1 hour in seconds)
pub const SPONSORSHIP_COOLDOWN_SECONDS: u64 = 3600;

/// Sponsorship capacity window (30 days)
pub const SPONSORSHIP_WINDOW_SECONDS: u64 = 2_592_000; // 30 * 24 * 60 * 60

// === SPEC_11 Section 3.2: Orphan Handling Constants ===

/// Threshold for sponsor inactivity before orphaning (90 days)
pub const ORPHAN_INACTIVITY_THRESHOLD_SECONDS: u64 = 7_776_000; // 90 * 24 * 60 * 60

/// Grace period for orphaned identities before adoption eligibility (30 days)
pub const ORPHAN_GRACE_PERIOD_SECONDS: u64 = 2_592_000; // 30 * 24 * 60 * 60


// === SPEC_11 Section 3.1: SponsoredIdentityCreation ===

/// Message for creating a sponsored identity (SPEC_11 Section 3.1)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SponsoredIdentityCreation {
    /// Ed25519 public key of new identity (32 bytes)
    pub new_identity_pubkey: PublicKey,
    /// Sponsor's public key (None for genesis identities)
    pub sponsor_pubkey: Option<PublicKey>,
    /// Sponsor's Ed25519 signature (None for genesis)
    pub sponsor_signature: Option<Signature>,
    /// PoW proof for identity creation
    pub identity_pow_proof: IdentityCreationProof,
    /// Creation timestamp (UNIX seconds)
    pub creation_timestamp: u64,
    /// Whether this is a probationary sponsorship
    pub probationary: bool,
    /// Genesis proof (required if sponsor_pubkey is None)
    pub genesis_proof: Option<GenesisProof>,
}

impl SponsoredIdentityCreation {
    /// Check if this is a genesis identity creation
    #[must_use]
    pub fn is_genesis(&self) -> bool {
        self.sponsor_pubkey.is_none() && self.genesis_proof.is_some()
    }

    /// Get bytes that sponsor signs: new_identity_pubkey(32) || creation_timestamp(8 BE)
    #[must_use]
    pub fn signature_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(40);
        msg.extend_from_slice(self.new_identity_pubkey.as_bytes());
        msg.extend_from_slice(&self.creation_timestamp.to_be_bytes());
        msg
    }
}

// === SPEC_11 Section 3.2: StoredSponsorship ===

/// Sponsorship status (SPEC_11 Section 3.2)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SponsorshipStatus {
    /// Sponsorship is active and in good standing
    Active = 0,
    /// Sponsor was revoked, sponsee now orphaned
    Orphaned = 1,
    /// Sponsor under penalty, sponsee restricted
    Restricted = 2,
    /// Sponsorship explicitly revoked
    Revoked = 3,
}

impl TryFrom<u8> for SponsorshipStatus {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Active),
            1 => Ok(Self::Orphaned),
            2 => Ok(Self::Restricted),
            3 => Ok(Self::Revoked),
            _ => Err(()),
        }
    }
}

impl Default for SponsorshipStatus {
    fn default() -> Self {
        Self::Active
    }
}

/// Persisted sponsorship record (SPEC_11 Section 3.2)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredSponsorship {
    /// The sponsored identity's public key
    pub sponsored_identity: PublicKey,
    /// Sponsor's public key (None for genesis identities)
    pub sponsor: Option<PublicKey>,
    /// When sponsorship was created (UNIX seconds)
    pub creation_timestamp: u64,
    /// Current status of sponsorship
    pub status: SponsorshipStatus,
    /// Penalty expiration timestamp (if under penalty)
    pub penalty_until: Option<u64>,
    /// Tree depth (0 for genesis, sponsor.depth + 1 otherwise)
    pub depth: u8,
    /// Whether probationary sponsorship rules apply
    pub probationary: bool,
    /// When probation expires (UNIX seconds, if probationary)
    pub probation_expires: Option<u64>,
    /// Positive contribution score (0-1000)
    pub positive_contribution_score: u16,
    /// True if this is a genesis identity
    pub is_genesis: bool,
    /// When this identity was orphaned (None = not orphaned)
    pub orphaned_at: Option<u64>,
}

impl StoredSponsorship {
    /// Validate internal invariants
    pub fn validate_invariants(&self) -> Result<(), SponsorshipError> {
        if self.is_genesis {
            if self.sponsor.is_some() {
                return Err(SponsorshipError::InvalidInvariant(
                    "Genesis identity cannot have sponsor".into(),
                ));
            }
            if self.depth != 0 {
                return Err(SponsorshipError::InvalidInvariant(
                    "Genesis identity must have depth 0".into(),
                ));
            }
        } else if self.sponsor.is_none() {
            return Err(SponsorshipError::InvalidInvariant(
                "Non-genesis identity must have sponsor".into(),
            ));
        }
        if self.positive_contribution_score > 1000 {
            return Err(SponsorshipError::InvalidInvariant(
                "Contribution score exceeds 1000".into(),
            ));
        }
        Ok(())
    }

    /// Check if currently under penalty
    #[must_use]
    pub fn is_under_penalty(&self, current_time: u64) -> bool {
        self.penalty_until.is_some_and(|until| current_time < until)
    }

    /// Check if probation period has expired
    #[must_use]
    pub fn is_probation_expired(&self, current_time: u64) -> bool {
        if !self.probationary {
            return true; // Non-probationary is always "expired"
        }
        self.probation_expires
            .is_some_and(|expires| current_time >= expires)
    }

    /// Check if under any active penalty (quick check using penalty_until and status)
    ///
    /// This is a fast check that uses the cached `penalty_until` field.
    /// For detailed penalty information, query the PenaltyStore directly.
    #[must_use]
    pub fn is_under_any_penalty(&self, current_time: u64) -> bool {
        // Revoked status means permanent penalty
        if self.status == SponsorshipStatus::Revoked {
            return true;
        }

        // Check if restricted and penalty is still active
        self.status == SponsorshipStatus::Restricted && self.is_under_penalty(current_time)
    }

    /// Check if this identity can sponsor (not under invite slot penalty)
    ///
    /// Returns false if under penalty or revoked.
    /// For orphaned identities, only Anchor+ can sponsor per SPEC_11 §3.2.
    #[must_use]
    pub fn can_sponsor(&self, current_time: u64) -> bool {
        match self.status {
            SponsorshipStatus::Active => true,
            SponsorshipStatus::Restricted => !self.is_under_penalty(current_time),
            SponsorshipStatus::Orphaned | SponsorshipStatus::Revoked => false,
        }
    }

    /// Check if identity can sponsor (depends on status and penalty status only)
    ///
    /// With PoW-only gating, level is no longer a factor.
    #[must_use]
    pub fn can_sponsor_basic(&self, current_time: u64) -> bool {
        match self.status {
            SponsorshipStatus::Active => true,
            SponsorshipStatus::Restricted => !self.is_under_penalty(current_time),
            SponsorshipStatus::Orphaned => {
                // With PoW-only gating, orphaned identities can still sponsor
                true
            }
            SponsorshipStatus::Revoked => false,
        }
    }

    /// Check if currently in orphan grace period
    ///
    /// During the grace period, the orphaned identity retains full capabilities
    /// but is not yet eligible for adoption.
    #[must_use]
    pub fn is_in_grace_period(&self, current_time: u64) -> bool {
        if self.status != SponsorshipStatus::Orphaned {
            return false;
        }
        self.orphaned_at
            .map(|at| current_time < at + ORPHAN_GRACE_PERIOD_SECONDS)
            .unwrap_or(false)
    }

    /// Get remaining grace period in seconds (0 if not in grace or expired)
    #[must_use]
    pub fn grace_period_remaining(&self, current_time: u64) -> u64 {
        if self.status != SponsorshipStatus::Orphaned {
            return 0;
        }
        self.orphaned_at
            .map(|at| (at + ORPHAN_GRACE_PERIOD_SECONDS).saturating_sub(current_time))
            .unwrap_or(0)
    }

    /// Check if eligible for adoption (orphaned and past grace period)
    #[must_use]
    pub fn is_eligible_for_adoption(&self, current_time: u64) -> bool {
        self.status == SponsorshipStatus::Orphaned && !self.is_in_grace_period(current_time)
    }
}

// === SPEC_11 Section 3.3: GenesisProofType ===

/// Genesis proof types (SPEC_11 Section 3.3)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GenesisProofType {
    /// Hardcoded list of genesis public keys
    HardcodedList = 0,
    /// Multi-signature threshold from existing genesis identities
    MultiSigThreshold = 1,
    /// Community vote (future implementation)
    CommunityVote = 2,
}

impl TryFrom<u8> for GenesisProofType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::HardcodedList),
            1 => Ok(Self::MultiSigThreshold),
            2 => Ok(Self::CommunityVote),
            _ => Err(()),
        }
    }
}

// === SPEC_11 Section 3.4: GenesisAttestation ===

/// Attestation from existing genesis identity (SPEC_11 Section 3.4)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenesisAttestation {
    /// Attesting genesis identity's public key
    pub attester: PublicKey,
    /// Signature over (new_genesis_pubkey || slot_number || timestamp)
    pub signature: Signature,
    /// When attestation was made (UNIX seconds)
    pub timestamp: u64,
}

impl GenesisAttestation {
    /// Get bytes that attester signs: new_pubkey(32) || slot(2 BE) || timestamp(8 BE)
    #[must_use]
    pub fn signing_bytes(new_pubkey: &PublicKey, slot: u16, timestamp: u64) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(42);
        bytes.extend_from_slice(new_pubkey.as_bytes());
        bytes.extend_from_slice(&slot.to_be_bytes());
        bytes.extend_from_slice(&timestamp.to_be_bytes());
        bytes
    }
}

// === SPEC_11 Section 3.5: GenesisProof ===

/// Proof of genesis identity status (SPEC_11 Section 3.5)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenesisProof {
    /// Slot number (0 to MAX_GENESIS_IDENTITIES-1)
    pub slot_number: u16,
    /// Type of proof provided
    pub proof_type: GenesisProofType,
    /// Proof data (interpretation depends on proof_type):
    /// - HardcodedList: empty (slot checked against hardcoded list)
    /// - MultiSigThreshold: threshold signature data
    /// - CommunityVote: vote tally hash
    pub proof_data: Vec<u8>,
    /// Attestations from existing genesis identities
    pub attestations: Vec<GenesisAttestation>,
}

impl GenesisProof {
    /// Validate slot number is within bounds
    pub fn validate_slot(&self) -> Result<(), SponsorshipError> {
        if self.slot_number >= MAX_GENESIS_IDENTITIES as u16 {
            return Err(SponsorshipError::InvalidGenesisSlot);
        }
        Ok(())
    }
}

// === SPEC_11 Section 3.6: GenesisIdentity ===

/// Genesis identity record (SPEC_11 Section 3.6)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenesisIdentity {
    /// The genesis identity's public key
    pub identity: PublicKey,
    /// Proof of genesis status
    pub genesis_proof: GenesisProof,
    /// When genesis identity was created (UNIX seconds)
    pub created_at: u64,
    /// Assigned slot number
    pub slot_number: u16,
}

// === SPEC_11 Section 3.7: SponsorshipTreeNode ===

/// Tree node for sponsorship queries (SPEC_11 Section 3.7)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SponsorshipTreeNode {
    /// This identity's public key
    pub identity: PublicKey,
    /// Parent (sponsor) identity (None for genesis)
    pub sponsor: Option<PublicKey>,
    /// Tree depth (0 for genesis)
    pub depth: u8,
    /// Whether this is a genesis identity
    pub is_genesis: bool,
}

impl SponsorshipTreeNode {
    /// Create from a StoredSponsorship
    #[must_use]
    pub fn from_stored(s: &StoredSponsorship) -> Self {
        Self {
            identity: s.sponsored_identity,
            sponsor: s.sponsor,
            depth: s.depth,
            is_genesis: s.is_genesis,
        }
    }

    /// Get parent identity if exists
    #[must_use]
    pub fn parent(&self) -> Option<PublicKey> {
        self.sponsor
    }

    /// Check if this is a root (genesis) node
    #[must_use]
    pub fn is_root(&self) -> bool {
        self.is_genesis
    }

    /// Get tree depth
    #[must_use]
    pub fn depth(&self) -> u8 {
        self.depth
    }
}

// === SPEC_11 Section 4.3: LinearChainMetrics ===

/// Metrics for detecting manufactured trust chains (SPEC_11 Section 4.3)
#[derive(Debug, Clone, PartialEq)]
pub struct LinearChainMetrics {
    /// Identity being analyzed
    pub identity: PublicKey,
    /// Depth in sponsorship tree
    pub sponsorship_depth: u8,
    /// Width of subtree (total descendants)
    pub subtree_breadth: u32,
    /// Count of direct sponsees
    pub direct_sponsee_count: u32,
    /// Average depth of subtree
    pub avg_subtree_depth: f32,
    /// Linearity score (depth / max(breadth, 1))
    pub linearity_score: f32,
    /// True if flagged as suspicious pattern
    pub flagged_as_suspicious: bool,
}

impl LinearChainMetrics {
    /// Create new metrics with calculation
    #[must_use]
    pub fn new(
        identity: PublicKey,
        depth: u8,
        breadth: u32,
        direct_count: u32,
        avg_depth: f32,
    ) -> Self {
        let linearity = depth as f32 / (breadth.max(1) as f32);
        let suspicious = linearity > LINEARITY_SCORE_THRESHOLD && depth >= LINEAR_CHAIN_MIN_DEPTH;
        Self {
            identity,
            sponsorship_depth: depth,
            subtree_breadth: breadth,
            direct_sponsee_count: direct_count,
            avg_subtree_depth: avg_depth,
            linearity_score: linearity,
            flagged_as_suspicious: suspicious,
        }
    }

    /// Recalculate linearity score
    pub fn calculate_linearity_score(&mut self) {
        self.linearity_score =
            self.sponsorship_depth as f32 / (self.subtree_breadth.max(1) as f32);
    }

    /// Check if suspicious based on current metrics
    #[must_use]
    pub fn is_suspicious(&self) -> bool {
        self.linearity_score > LINEARITY_SCORE_THRESHOLD
            && self.sponsorship_depth >= LINEAR_CHAIN_MIN_DEPTH
    }

    /// Check if suspicious based on custom config
    ///
    /// Per SPEC_11 Section 4.4: Either condition triggers flagging:
    /// 1. High linearity score AND sufficient depth
    /// 2. Sufficient depth AND very few direct sponsees (single chain pattern)
    #[must_use]
    pub fn is_flagged_with_config(&self, config: &LinearChainConfig) -> bool {
        // Condition 1: High linearity with sufficient depth
        let high_linearity = self.linearity_score > config.linearity_threshold
            && self.sponsorship_depth >= config.min_depth;

        // Condition 2: Deep chain with very few direct sponsees (SPEC_11 Section 4.4 OR condition)
        let linear_chain = self.sponsorship_depth >= config.min_depth
            && self.direct_sponsee_count <= config.max_linear_breadth;

        high_linearity || linear_chain
    }
}

// === SPEC_11 Section 7: Linear Chain Detection Types ===

/// Flag review status for linear chain detection
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReviewStatus {
    /// Flag pending manual review
    Pending = 0,
    /// Flag cleared by reviewer (legitimate mentorship)
    Cleared = 1,
    /// Flag confirmed as suspicious pattern
    Confirmed = 2,
}

impl Default for ReviewStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl TryFrom<u8> for ReviewStatus {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Pending),
            1 => Ok(Self::Cleared),
            2 => Ok(Self::Confirmed),
            _ => Err(()),
        }
    }
}

/// Configurable thresholds for linear chain detection
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LinearChainConfig {
    /// Linearity score threshold (default: 0.8)
    pub linearity_threshold: f32,
    /// Minimum depth to trigger flagging (default: 4)
    pub min_depth: u8,
    /// Maximum breadth to consider linear (default: 1)
    pub max_linear_breadth: u32,
}

impl Default for LinearChainConfig {
    fn default() -> Self {
        Self {
            linearity_threshold: LINEARITY_SCORE_THRESHOLD,
            min_depth: LINEAR_CHAIN_MIN_DEPTH,
            max_linear_breadth: DEFAULT_MAX_LINEAR_BREADTH,
        }
    }
}

/// Persisted linear chain flag record
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LinearChainFlag {
    /// Flagged identity (stored as bytes for serialization)
    pub identity_bytes: [u8; 32],
    /// Linearity score at time of flagging (scaled by 1000 for integer storage)
    pub linearity_score_scaled: u16,
    /// Sponsorship depth at time of flagging
    pub sponsorship_depth: u8,
    /// Subtree breadth at time of flagging
    pub subtree_breadth: u32,
    /// Direct sponsee count at time of flagging
    pub direct_sponsee_count: u32,
    /// Current review status
    pub status: ReviewStatus,
    /// When flag was created (UNIX seconds)
    pub created_at: u64,
    /// Optional appeal reason provided by user
    pub appeal_reason: Option<String>,
    /// Optional reviewer notes
    pub reviewer_notes: Option<String>,
}

impl LinearChainFlag {
    /// Create a new flag from metrics
    pub fn new(metrics: &LinearChainMetrics, current_time: u64) -> Self {
        Self {
            identity_bytes: *metrics.identity.as_bytes(),
            linearity_score_scaled: (metrics.linearity_score * 1000.0).min(65535.0) as u16,
            sponsorship_depth: metrics.sponsorship_depth,
            subtree_breadth: metrics.subtree_breadth,
            direct_sponsee_count: metrics.direct_sponsee_count,
            status: ReviewStatus::Pending,
            created_at: current_time,
            appeal_reason: None,
            reviewer_notes: None,
        }
    }

    /// Get the identity as PublicKey
    #[must_use]
    pub fn identity(&self) -> PublicKey {
        PublicKey::from_bytes(self.identity_bytes)
    }

    /// Get the linearity score as float
    #[must_use]
    pub fn linearity_score(&self) -> f32 {
        self.linearity_score_scaled as f32 / 1000.0
    }

    /// Check if this flag is pending review
    #[must_use]
    pub fn is_pending(&self) -> bool {
        self.status == ReviewStatus::Pending
    }

    /// Check if this flag was confirmed as suspicious
    #[must_use]
    pub fn is_confirmed(&self) -> bool {
        self.status == ReviewStatus::Confirmed
    }

    /// Check if this flag was cleared (legitimate)
    #[must_use]
    pub fn is_cleared(&self) -> bool {
        self.status == ReviewStatus::Cleared
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_pow_proof() -> IdentityCreationProof {
        IdentityCreationProof {
            public_key: PublicKey::from_bytes([1u8; 32]),
            timestamp: 1735689600,
            nonce: 12345,
            pow_hash: [0u8; 32],
        }
    }

    #[test]
    fn test_sponsored_identity_creation_regular_serialization() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: Some(PublicKey::from_bytes([2u8; 32])),
            sponsor_signature: Some(Signature::from_bytes([3u8; 64])),
            identity_pow_proof: make_test_pow_proof(),
            creation_timestamp: 1735689600,
            probationary: true,
            genesis_proof: None,
        };

        let bytes = bincode::serialize(&creation).unwrap();
        let decoded: SponsoredIdentityCreation = bincode::deserialize(&bytes).unwrap();
        assert_eq!(creation, decoded);
    }

    #[test]
    fn test_sponsored_identity_creation_genesis() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([1u8; 32]),
            sponsor_pubkey: None,
            sponsor_signature: None,
            identity_pow_proof: make_test_pow_proof(),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: Some(GenesisProof {
                slot_number: 0,
                proof_type: GenesisProofType::HardcodedList,
                proof_data: vec![],
                attestations: vec![],
            }),
        };
        assert!(creation.is_genesis());
    }

    #[test]
    fn test_signature_message_format() {
        let creation = SponsoredIdentityCreation {
            new_identity_pubkey: PublicKey::from_bytes([0xab; 32]),
            sponsor_pubkey: Some(PublicKey::from_bytes([2u8; 32])),
            sponsor_signature: Some(Signature::from_bytes([0u8; 64])),
            identity_pow_proof: make_test_pow_proof(),
            creation_timestamp: 1735689600,
            probationary: false,
            genesis_proof: None,
        };
        let msg = creation.signature_message();
        assert_eq!(msg.len(), 40);
        assert_eq!(&msg[0..32], &[0xab; 32]);
        assert_eq!(&msg[32..40], &1735689600u64.to_be_bytes());
    }

    #[test]
    fn test_stored_sponsorship_genesis_invariants() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
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
        };
        assert!(s.validate_invariants().is_ok());
    }

    #[test]
    fn test_stored_sponsorship_invalid_genesis_with_sponsor() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        };
        assert!(matches!(
            s.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_stored_sponsorship_invalid_non_genesis_without_sponsor() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 1,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        };
        assert!(matches!(
            s.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_stored_sponsorship_invalid_contribution_score() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 1001, // exceeds max
            is_genesis: true,
            orphaned_at: None,
        };
        assert!(matches!(
            s.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_sponsorship_status_discriminants() {
        assert_eq!(SponsorshipStatus::Active as u8, 0);
        assert_eq!(SponsorshipStatus::Orphaned as u8, 1);
        assert_eq!(SponsorshipStatus::Restricted as u8, 2);
        assert_eq!(SponsorshipStatus::Revoked as u8, 3);
    }

    #[test]
    fn test_sponsorship_status_try_from() {
        assert_eq!(
            SponsorshipStatus::try_from(0).unwrap(),
            SponsorshipStatus::Active
        );
        assert_eq!(
            SponsorshipStatus::try_from(1).unwrap(),
            SponsorshipStatus::Orphaned
        );
        assert_eq!(
            SponsorshipStatus::try_from(2).unwrap(),
            SponsorshipStatus::Restricted
        );
        assert_eq!(
            SponsorshipStatus::try_from(3).unwrap(),
            SponsorshipStatus::Revoked
        );
        assert!(SponsorshipStatus::try_from(4).is_err());
    }

    #[test]
    fn test_genesis_proof_type_try_from() {
        assert_eq!(
            GenesisProofType::try_from(0).unwrap(),
            GenesisProofType::HardcodedList
        );
        assert_eq!(
            GenesisProofType::try_from(1).unwrap(),
            GenesisProofType::MultiSigThreshold
        );
        assert_eq!(
            GenesisProofType::try_from(2).unwrap(),
            GenesisProofType::CommunityVote
        );
        assert!(GenesisProofType::try_from(3).is_err());
    }

    #[test]
    fn test_genesis_proof_slot_validation() {
        let valid = GenesisProof {
            slot_number: 99,
            proof_type: GenesisProofType::HardcodedList,
            proof_data: vec![],
            attestations: vec![],
        };
        assert!(valid.validate_slot().is_ok());

        let invalid = GenesisProof {
            slot_number: 100, // equals MAX_GENESIS_IDENTITIES
            proof_type: GenesisProofType::HardcodedList,
            proof_data: vec![],
            attestations: vec![],
        };
        assert!(matches!(
            invalid.validate_slot(),
            Err(SponsorshipError::InvalidGenesisSlot)
        ));
    }

    #[test]
    fn test_genesis_attestation_signing_bytes() {
        let pubkey = PublicKey::from_bytes([0xaa; 32]);
        let slot = 5u16;
        let timestamp = 1735689600u64;

        let bytes = GenesisAttestation::signing_bytes(&pubkey, slot, timestamp);

        assert_eq!(bytes.len(), 42);
        assert_eq!(&bytes[0..32], &[0xaa; 32]);
        assert_eq!(&bytes[32..34], &5u16.to_be_bytes());
        assert_eq!(&bytes[34..42], &1735689600u64.to_be_bytes());
    }

    #[test]
    fn test_sponsorship_tree_node_from_stored() {
        let stored = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 5,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 100,
            is_genesis: false,
            orphaned_at: None,
        };

        let node = SponsorshipTreeNode::from_stored(&stored);

        assert_eq!(node.identity, stored.sponsored_identity);
        assert_eq!(node.sponsor, stored.sponsor);
        assert_eq!(node.depth, 5);
        assert!(!node.is_genesis);
        assert_eq!(node.parent(), stored.sponsor);
        assert!(!node.is_root());
        assert_eq!(node.depth(), 5);
    }

    #[test]
    fn test_sponsorship_tree_node_genesis() {
        let stored = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
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
        };

        let node = SponsorshipTreeNode::from_stored(&stored);
        assert!(node.is_root());
        assert!(node.parent().is_none());
    }

    #[test]
    fn test_linear_chain_metrics_calculation() {
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            10, // depth
            5,  // breadth
            2,  // direct
            8.0, // avg depth
        );
        assert!((m.linearity_score - 2.0).abs() < f32::EPSILON); // 10/5 = 2.0
        assert!(m.flagged_as_suspicious); // 2.0 > 0.8 && 10 >= 4
        assert!(m.is_suspicious());
    }

    #[test]
    fn test_linear_chain_metrics_not_suspicious() {
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            3,  // depth < LINEAR_CHAIN_MIN_DEPTH
            10, // breadth
            5,  // direct
            2.0, // avg depth
        );
        assert!(!m.flagged_as_suspicious);
        assert!(!m.is_suspicious());
    }

    #[test]
    fn test_linear_chain_metrics_breadth_zero() {
        // Test that breadth of 0 doesn't cause division by zero
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            10, // depth
            0,  // breadth (would cause div/0 without max(1))
            0,  // direct
            0.0, // avg depth
        );
        assert!((m.linearity_score - 10.0).abs() < f32::EPSILON); // 10/1 = 10.0
        assert!(m.is_suspicious());
    }

    #[test]
    fn test_stored_sponsorship_penalty_check() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: Some(1735700000),
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        };

        assert!(s.is_under_penalty(1735689600)); // Before penalty ends
        assert!(!s.is_under_penalty(1735700001)); // After penalty ends
    }

    #[test]
    fn test_stored_sponsorship_probation_check() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 1,
            probationary: true,
            probation_expires: Some(1735689600 + PROBATION_PERIOD_SECONDS),
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        };

        assert!(!s.is_probation_expired(1735689600)); // Before probation ends
        assert!(s.is_probation_expired(1735689600 + PROBATION_PERIOD_SECONDS + 1)); // After
    }

    #[test]
    fn test_protocol_constants() {
        assert_eq!(PROBATION_PERIOD_DAYS, 180);
        assert_eq!(PROBATION_PERIOD_SECONDS, 15_552_000);
        assert_eq!(TIMESTAMP_TOLERANCE_SECONDS, 3600);
        assert_eq!(MAX_GENESIS_IDENTITIES, 100);
        assert_eq!(MIN_ATTESTATION_COUNT, 3);
        assert_eq!(MAX_ATTESTATION_COUNT, 67);

        // Verify consequence decay values
        assert!((CONSEQUENCE_DECAY_HOP_1 - 1.0).abs() < f32::EPSILON);
        assert!((CONSEQUENCE_DECAY_HOP_2 - 0.5).abs() < f32::EPSILON);
        assert!((CONSEQUENCE_DECAY_HOP_3_PLUS - 0.0).abs() < f32::EPSILON);
        assert!((PROBATION_CONSEQUENCE_MULTIPLIER - 0.25).abs() < f32::EPSILON);
    }

    #[test]
    fn test_is_under_any_penalty_active() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
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
        };

        // Active with no penalty_until is not under penalty
        assert!(!s.is_under_any_penalty(1735689600));
    }

    #[test]
    fn test_is_under_any_penalty_restricted() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Restricted,
            penalty_until: Some(1735700000),
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        };

        // Restricted with active penalty
        assert!(s.is_under_any_penalty(1735689600));
        // Penalty expired
        assert!(!s.is_under_any_penalty(1735700001));
    }

    #[test]
    fn test_is_under_any_penalty_revoked() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Revoked,
            penalty_until: None,
            depth: 1,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        };

        // Revoked is always under penalty
        assert!(s.is_under_any_penalty(1735689600));
        assert!(s.is_under_any_penalty(u64::MAX - 1));
    }

    #[test]
    fn test_can_sponsor_active() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
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
        };

        assert!(s.can_sponsor(1735689600));
    }

    #[test]
    fn test_can_sponsor_restricted_with_penalty() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: None,
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Restricted,
            penalty_until: Some(1735700000),
            depth: 0,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        };

        // Cannot sponsor during penalty
        assert!(!s.can_sponsor(1735689600));
        // Can sponsor after penalty expires
        assert!(s.can_sponsor(1735700001));
    }

    #[test]
    fn test_can_sponsor_revoked() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Revoked,
            penalty_until: None,
            depth: 1,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        };

        // Revoked can never sponsor
        assert!(!s.can_sponsor(1735689600));
        assert!(!s.can_sponsor(u64::MAX - 1));
    }

    #[test]
    fn test_can_sponsor_orphaned() {
        let s = StoredSponsorship {
            sponsored_identity: PublicKey::from_bytes([1u8; 32]),
            sponsor: Some(PublicKey::from_bytes([2u8; 32])),
            creation_timestamp: 1735689600,
            status: SponsorshipStatus::Orphaned,
            penalty_until: None,
            depth: 1,
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: Some(1735689600),
        };

        // Orphaned cannot sponsor without level (basic check)
        assert!(!s.can_sponsor(1735689600));
    }

    // === Linear Chain Detection Types Tests ===

    #[test]
    fn test_review_status_discriminants() {
        assert_eq!(ReviewStatus::Pending as u8, 0);
        assert_eq!(ReviewStatus::Cleared as u8, 1);
        assert_eq!(ReviewStatus::Confirmed as u8, 2);
    }

    #[test]
    fn test_review_status_try_from() {
        assert_eq!(ReviewStatus::try_from(0).unwrap(), ReviewStatus::Pending);
        assert_eq!(ReviewStatus::try_from(1).unwrap(), ReviewStatus::Cleared);
        assert_eq!(ReviewStatus::try_from(2).unwrap(), ReviewStatus::Confirmed);
        assert!(ReviewStatus::try_from(3).is_err());
    }

    #[test]
    fn test_linear_chain_config_default() {
        let config = LinearChainConfig::default();
        assert!((config.linearity_threshold - LINEARITY_SCORE_THRESHOLD).abs() < f32::EPSILON);
        assert_eq!(config.min_depth, LINEAR_CHAIN_MIN_DEPTH);
        assert_eq!(config.max_linear_breadth, DEFAULT_MAX_LINEAR_BREADTH);
    }

    #[test]
    fn test_is_flagged_with_config_high_linearity() {
        // High linearity + sufficient depth = flagged
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5,  // depth >= 4
            1,  // low breadth -> high linearity (5/1 = 5.0 > 0.8)
            1,
            5.0,
        );
        let config = LinearChainConfig::default();
        assert!(m.is_flagged_with_config(&config));
    }

    #[test]
    fn test_is_flagged_with_config_linear_chain_pattern() {
        // Deep chain with single sponsee = flagged (OR condition)
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            4,  // depth >= 4
            10, // high breadth -> low linearity (4/10 = 0.4 < 0.8)
            1,  // but only 1 direct sponsee
            2.0,
        );
        let config = LinearChainConfig::default();
        // Linearity 0.4 < 0.8, but depth >= 4 AND direct_sponsee_count <= 1
        assert!(m.is_flagged_with_config(&config));
    }

    #[test]
    fn test_is_flagged_with_config_not_flagged_wide_tree() {
        // Wide tree: not flagged even with depth
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5,  // depth >= 4
            20, // high breadth -> low linearity (5/20 = 0.25 < 0.8)
            5,  // multiple direct sponsees (> 1)
            3.0,
        );
        let config = LinearChainConfig::default();
        // Neither condition met
        assert!(!m.is_flagged_with_config(&config));
    }

    #[test]
    fn test_is_flagged_with_config_insufficient_depth() {
        // Depth too low: not flagged
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            3,  // depth < 4
            1,  // single sponsee
            1,
            3.0,
        );
        let config = LinearChainConfig::default();
        assert!(!m.is_flagged_with_config(&config));
    }

    #[test]
    fn test_is_flagged_with_config_custom_threshold() {
        let m = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5,
            2, // linearity = 5/2 = 2.5
            3, // multiple direct sponsees
            4.0,
        );

        // Default config: linearity 2.5 > 0.8 AND depth 5 >= 4 = flagged
        assert!(m.is_flagged_with_config(&LinearChainConfig::default()));

        // Custom config with higher threshold: 2.5 < 5.0 = not flagged
        let strict_config = LinearChainConfig {
            linearity_threshold: 5.0,
            min_depth: 4,
            max_linear_breadth: 1,
        };
        // direct_sponsee_count = 3 > 1, so OR condition also false
        assert!(!m.is_flagged_with_config(&strict_config));
    }

    #[test]
    fn test_linear_chain_flag_new() {
        let metrics = LinearChainMetrics::new(
            PublicKey::from_bytes([42u8; 32]),
            5,
            10,
            3,
            4.0,
        );
        let flag = LinearChainFlag::new(&metrics, 1735689600);

        assert_eq!(flag.identity_bytes, [42u8; 32]);
        assert_eq!(flag.sponsorship_depth, 5);
        assert_eq!(flag.subtree_breadth, 10);
        assert_eq!(flag.direct_sponsee_count, 3);
        assert_eq!(flag.status, ReviewStatus::Pending);
        assert_eq!(flag.created_at, 1735689600);
        assert!(flag.appeal_reason.is_none());
        assert!(flag.reviewer_notes.is_none());
    }

    #[test]
    fn test_linear_chain_flag_identity() {
        let metrics = LinearChainMetrics::new(
            PublicKey::from_bytes([99u8; 32]),
            5, 10, 3, 4.0,
        );
        let flag = LinearChainFlag::new(&metrics, 1735689600);
        assert_eq!(flag.identity(), PublicKey::from_bytes([99u8; 32]));
    }

    #[test]
    fn test_linear_chain_flag_linearity_score_conversion() {
        let metrics = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5,
            2, // linearity = 5/2 = 2.5
            1,
            4.0,
        );
        let flag = LinearChainFlag::new(&metrics, 1735689600);

        // Score should round-trip through scaled integer
        assert!((flag.linearity_score() - 2.5).abs() < 0.01);
    }

    #[test]
    fn test_linear_chain_flag_status_helpers() {
        let metrics = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5, 10, 3, 4.0,
        );
        let mut flag = LinearChainFlag::new(&metrics, 1735689600);

        assert!(flag.is_pending());
        assert!(!flag.is_confirmed());
        assert!(!flag.is_cleared());

        flag.status = ReviewStatus::Confirmed;
        assert!(!flag.is_pending());
        assert!(flag.is_confirmed());
        assert!(!flag.is_cleared());

        flag.status = ReviewStatus::Cleared;
        assert!(!flag.is_pending());
        assert!(!flag.is_confirmed());
        assert!(flag.is_cleared());
    }

    #[test]
    fn test_linear_chain_flag_serialization() {
        let metrics = LinearChainMetrics::new(
            PublicKey::from_bytes([1u8; 32]),
            5, 10, 3, 4.0,
        );
        let flag = LinearChainFlag::new(&metrics, 1735689600);

        // Test bincode round-trip
        let bytes = bincode::serialize(&flag).unwrap();
        let decoded: LinearChainFlag = bincode::deserialize(&bytes).unwrap();
        assert_eq!(flag, decoded);
    }

    #[test]
    fn test_linear_chain_config_serialization() {
        let config = LinearChainConfig {
            linearity_threshold: 0.5,
            min_depth: 3,
            max_linear_breadth: 2,
        };

        let bytes = bincode::serialize(&config).unwrap();
        let decoded: LinearChainConfig = bincode::deserialize(&bytes).unwrap();
        assert_eq!(config, decoded);
    }
}

// === SPEC_11 Section 3.11: Public Sponsorship Offers ===

/// Maximum sponsees per offer (SPEC_11 §3.11)
pub const MAX_OFFER_SPONSEES: u8 = 10;

/// Maximum application text bytes (SPEC_11 §3.11)
pub const MAX_APPLICATION_TEXT_BYTES: usize = 2000;

/// Default offer duration in seconds (30 days)
pub const OFFER_DEFAULT_DURATION_SECS: u64 = 2_592_000;

/// Offer type determines who can claim and sponsorship properties
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SponsorshipOfferType {
    /// Anyone can claim, full sponsorship (requires Anchor+)
    Open = 0,
    /// Reduced consequence for sponsor (Resident+ can create)
    Probationary = 1,
    /// Must meet requirements (requires Anchor+)
    Conditional = 2,
}

impl TryFrom<u8> for SponsorshipOfferType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Open),
            1 => Ok(Self::Probationary),
            2 => Ok(Self::Conditional),
            _ => Err(()),
        }
    }
}

impl Default for SponsorshipOfferType {
    fn default() -> Self {
        Self::Open
    }
}

/// Requirements a claimant must meet
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SponsorshipRequirements {
    /// Minimum PoW difficulty (0 = no requirement)
    pub min_pow_difficulty: u8,
    /// Optional: must have attestation from this identity
    pub required_attester: Option<PublicKey>,
    /// Whether application text is required
    pub application_required: bool,
}

impl SponsorshipRequirements {
    /// Create requirements with no constraints
    #[must_use]
    pub fn none() -> Self {
        Self::default()
    }

    /// Create requirements with minimum PoW difficulty
    #[must_use]
    pub fn with_pow(min_difficulty: u8) -> Self {
        Self {
            min_pow_difficulty: min_difficulty,
            ..Default::default()
        }
    }

    /// Check if any requirements are set
    #[must_use]
    pub fn has_requirements(&self) -> bool {
        self.min_pow_difficulty > 0
            || self.required_attester.is_some()
            || self.application_required
    }

    /// Get SHA-256 hash of requirements for signature
    #[must_use]
    pub fn hash(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update([self.min_pow_difficulty]);
        if let Some(attester) = &self.required_attester {
            hasher.update([1u8]); // has attester
            hasher.update(attester.as_bytes());
        } else {
            hasher.update([0u8]); // no attester
        }
        hasher.update([if self.application_required { 1 } else { 0 }]);
        hasher.finalize().into()
    }
}

/// Public sponsorship offer (SPEC_11 §3.11)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicSponsorshipOffer {
    /// Sponsor creating the offer
    pub sponsor: PublicKey,
    /// Unique offer identifier
    pub offer_id: [u8; 16],
    /// When offer was created (UNIX seconds)
    pub created_at: u64,
    /// When offer expires (UNIX seconds)
    pub expires_at: u64,
    /// Maximum claimants (1-10)
    pub max_sponsees: u8,
    /// Offer type
    pub offer_type: SponsorshipOfferType,
    /// Requirements for claimants
    pub requirements: SponsorshipRequirements,
    /// Sponsor's signature over offer data
    pub signature: Signature,
    /// When true, claims are approved immediately without sponsor review
    /// (invite-link onboarding). Default false.
    #[serde(default)]
    pub auto_approve: bool,
}

impl PublicSponsorshipOffer {
    /// Get bytes that sponsor signs for this offer
    ///
    /// Format: "swimchain-sponsor-offer:" prefix + sponsor(32) + slots(1) + offer_type(1) +
    ///         expires_days(4 BE) + min_pow(1) + app_required(1) + timestamp(8 BE)
    ///
    /// Uses only client-controlled fields so the client can construct and sign
    /// the message before sending. The offer_id is generated server-side after
    /// signature verification.
    #[must_use]
    pub fn signature_message_for_creation(
        sponsor: &[u8; 32],
        slots: u8,
        offer_type: &SponsorshipOfferType,
        expires_days: u32,
        min_pow_difficulty: u8,
        application_required: bool,
        timestamp: u64,
    ) -> Vec<u8> {
        let prefix = b"swimchain-sponsor-offer:";
        let mut msg = Vec::with_capacity(prefix.len() + 48);
        msg.extend_from_slice(prefix);
        msg.extend_from_slice(sponsor);
        msg.push(slots);
        msg.push(*offer_type as u8);
        msg.extend_from_slice(&expires_days.to_be_bytes());
        msg.push(min_pow_difficulty);
        msg.push(if application_required { 1 } else { 0 });
        msg.extend_from_slice(&timestamp.to_be_bytes());
        msg
    }

    /// Signature message for verification (must match what client signed)
    ///
    /// Reconstructs the same message format used during creation:
    /// Format: "swimchain-sponsor-offer:" prefix + sponsor(32) + slots(1) + offer_type(1) +
    ///         expires_days(4 BE) + min_pow(1) + app_required(1) + timestamp(8 BE)
    ///
    /// Note: expires_days is computed from (expires_at - created_at) / 86400
    #[must_use]
    pub fn signature_message(&self) -> Vec<u8> {
        // Compute expires_days from the stored timestamps
        let expires_days = ((self.expires_at - self.created_at) / 86400) as u32;

        Self::signature_message_for_creation(
            self.sponsor.as_bytes(),
            self.max_sponsees,
            &self.offer_type,
            expires_days,
            self.requirements.min_pow_difficulty,
            self.requirements.application_required,
            self.created_at, // created_at is used as timestamp during creation
        )
    }

    /// Check if offer has expired
    #[must_use]
    pub fn is_expired(&self, current_time: u64) -> bool {
        current_time >= self.expires_at
    }

    /// Get remaining time in seconds (0 if expired)
    #[must_use]
    pub fn remaining_time(&self, current_time: u64) -> u64 {
        self.expires_at.saturating_sub(current_time)
    }

    /// Check if offer is probationary type
    #[must_use]
    pub fn is_probationary(&self) -> bool {
        self.offer_type == SponsorshipOfferType::Probationary
    }
}

/// Claim on a public sponsorship offer
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SponsorshipClaim {
    /// Offer being claimed
    pub offer_id: [u8; 16],
    /// Claimant's public key
    pub claimant: PublicKey,
    /// When claim was submitted (UNIX seconds)
    pub claimed_at: u64,
    /// PoW proof for identity
    pub identity_pow_proof: IdentityCreationProof,
    /// PoW nonce space / target (challenge input for PoW verification)
    /// sha256(pow_nonce_space || pow_nonce) must have sufficient leading zeros
    #[serde(default)]
    pub pow_nonce_space: [u8; 32],
    /// Optional application text (max 2000 bytes)
    pub application_text: Option<String>,
    /// Attestation signature if required
    pub attestation_signature: Option<Signature>,
    /// Claimant's signature over claim
    pub claimant_signature: Signature,
    /// Sponsor's approval signature (None = pending)
    pub sponsor_approval: Option<Signature>,
}

impl SponsorshipClaim {
    /// Get bytes that claimant signs for this claim
    ///
    /// Format: offer_id(16) + claimant(32) + claimed_at(8 BE) + pow_hash(32)
    #[must_use]
    pub fn signature_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(88);
        msg.extend_from_slice(&self.offer_id);
        msg.extend_from_slice(self.claimant.as_bytes());
        msg.extend_from_slice(&self.claimed_at.to_be_bytes());
        msg.extend_from_slice(&self.identity_pow_proof.pow_hash);
        msg
    }

    /// Get bytes that sponsor signs for approval
    ///
    /// Format: claimant(32) + offer_id(16)
    #[must_use]
    pub fn approval_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(48);
        msg.extend_from_slice(self.claimant.as_bytes());
        msg.extend_from_slice(&self.offer_id);
        msg
    }

    /// Check if claim is approved
    #[must_use]
    pub fn is_approved(&self) -> bool {
        self.sponsor_approval.is_some()
    }

    /// Check if claim is pending
    #[must_use]
    pub fn is_pending(&self) -> bool {
        self.sponsor_approval.is_none()
    }
}

/// Claim status for querying
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SponsorshipClaimStatus {
    /// Claim submitted, awaiting sponsor approval
    Pending = 0,
    /// Claim approved, sponsorship created
    Approved = 1,
    /// Claim rejected by sponsor
    Rejected = 2,
}

impl TryFrom<u8> for SponsorshipClaimStatus {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Pending),
            1 => Ok(Self::Approved),
            2 => Ok(Self::Rejected),
            _ => Err(()),
        }
    }
}

impl Default for SponsorshipClaimStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// Count leading zero bits in a hash (for PoW difficulty verification)
/// Returns 0-255 (capped at u8 max even though 256 zeros are possible in a 32-byte hash)
#[must_use]
pub fn count_leading_zero_bits(hash: &[u8; 32]) -> u8 {
    let mut count = 0u16; // Use u16 to avoid overflow during counting
    for byte in hash {
        if *byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros() as u16;
            break;
        }
    }
    // Cap at 255 (u8 max) - all zeros would give 256 but that exceeds u8
    count.min(255) as u8
}

#[cfg(test)]
mod public_offer_tests {
    use super::*;

    #[test]
    fn test_sponsorship_offer_type_discriminants() {
        assert_eq!(SponsorshipOfferType::Open as u8, 0);
        assert_eq!(SponsorshipOfferType::Probationary as u8, 1);
        assert_eq!(SponsorshipOfferType::Conditional as u8, 2);
    }

    #[test]
    fn test_sponsorship_offer_type_try_from() {
        assert_eq!(
            SponsorshipOfferType::try_from(0).unwrap(),
            SponsorshipOfferType::Open
        );
        assert_eq!(
            SponsorshipOfferType::try_from(1).unwrap(),
            SponsorshipOfferType::Probationary
        );
        assert_eq!(
            SponsorshipOfferType::try_from(2).unwrap(),
            SponsorshipOfferType::Conditional
        );
        assert!(SponsorshipOfferType::try_from(3).is_err());
    }

    #[test]
    fn test_sponsorship_claim_status_try_from() {
        assert_eq!(
            SponsorshipClaimStatus::try_from(0).unwrap(),
            SponsorshipClaimStatus::Pending
        );
        assert_eq!(
            SponsorshipClaimStatus::try_from(1).unwrap(),
            SponsorshipClaimStatus::Approved
        );
        assert_eq!(
            SponsorshipClaimStatus::try_from(2).unwrap(),
            SponsorshipClaimStatus::Rejected
        );
        assert!(SponsorshipClaimStatus::try_from(3).is_err());
    }

    #[test]
    fn test_sponsorship_requirements_default() {
        let req = SponsorshipRequirements::default();
        assert_eq!(req.min_pow_difficulty, 0);
        assert!(req.required_attester.is_none());
        assert!(!req.application_required);
        assert!(!req.has_requirements());
    }

    #[test]
    fn test_sponsorship_requirements_with_pow() {
        let req = SponsorshipRequirements::with_pow(15);
        assert_eq!(req.min_pow_difficulty, 15);
        assert!(req.has_requirements());
    }

    #[test]
    fn test_sponsorship_requirements_hash_deterministic() {
        let req1 = SponsorshipRequirements {
            min_pow_difficulty: 10,
            required_attester: Some(PublicKey::from_bytes([42u8; 32])),
            application_required: true,
        };
        let req2 = req1.clone();
        assert_eq!(req1.hash(), req2.hash());

        // Different requirements should have different hash
        let req3 = SponsorshipRequirements::default();
        assert_ne!(req1.hash(), req3.hash());
    }

    #[test]
    fn test_public_sponsorship_offer_signature_message() {
        let offer = PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes([1u8; 32]),
            offer_id: [2u8; 16],
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Open,
            requirements: SponsorshipRequirements::default(),
            signature: Signature::from_bytes([0u8; 64]),
            auto_approve: false,
        };

        let msg = offer.signature_message();
        // prefix(24) + sponsor(32) + slots(1) + offer_type(1) + expires_days(4)
        // + min_pow(1) + app_required(1) + timestamp(8)
        assert_eq!(msg.len(), 72);

        // Verify components are in correct order
        let prefix = b"swimchain-sponsor-offer:";
        assert_eq!(&msg[0..24], prefix);
        assert_eq!(&msg[24..56], &[1u8; 32]); // sponsor
        assert_eq!(msg[56], 5); // max_sponsees
        assert_eq!(msg[57], 0); // offer_type (Open)
        // expires_days = (expires_at - created_at) / 86400 = 30
        assert_eq!(&msg[58..62], &30u32.to_be_bytes());
        assert_eq!(msg[62], 0); // min_pow_difficulty
        assert_eq!(msg[63], 0); // application_required
        assert_eq!(&msg[64..72], &1735689600u64.to_be_bytes()); // timestamp (created_at)
    }

    #[test]
    fn test_public_sponsorship_offer_expiration() {
        let offer = PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes([1u8; 32]),
            offer_id: [2u8; 16],
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Open,
            requirements: SponsorshipRequirements::default(),
            signature: Signature::from_bytes([0u8; 64]),
            auto_approve: false,
        };

        assert!(!offer.is_expired(1735689600));
        assert!(!offer.is_expired(1738281599));
        assert!(offer.is_expired(1738281600));
        assert!(offer.is_expired(1738281601));

        assert_eq!(offer.remaining_time(1735689600), 2592000);
        assert_eq!(offer.remaining_time(1738281600), 0);
    }

    #[test]
    fn test_sponsorship_claim_signature_message() {
        let claim = SponsorshipClaim {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([2u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [3u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        };

        let msg = claim.signature_message();
        assert_eq!(msg.len(), 88); // 16 + 32 + 8 + 32

        assert_eq!(&msg[0..16], &[1u8; 16]); // offer_id
        assert_eq!(&msg[16..48], &[2u8; 32]); // claimant
        assert_eq!(&msg[48..56], &1735689600u64.to_be_bytes()); // claimed_at
        assert_eq!(&msg[56..88], &[3u8; 32]); // pow_hash
    }

    #[test]
    fn test_sponsorship_claim_approval_message() {
        let claim = SponsorshipClaim {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([2u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [3u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        };

        let msg = claim.approval_message();
        assert_eq!(msg.len(), 48); // 32 + 16

        assert_eq!(&msg[0..32], &[2u8; 32]); // claimant
        assert_eq!(&msg[32..48], &[1u8; 16]); // offer_id
    }

    #[test]
    fn test_sponsorship_claim_status() {
        let mut claim = SponsorshipClaim {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([2u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [3u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: None,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes([0u8; 64]),
            sponsor_approval: None,
        };

        assert!(claim.is_pending());
        assert!(!claim.is_approved());

        claim.sponsor_approval = Some(Signature::from_bytes([1u8; 64]));

        assert!(!claim.is_pending());
        assert!(claim.is_approved());
    }

    #[test]
    fn test_count_leading_zero_bits() {
        // All zeros = 256 bits
        let all_zeros = [0u8; 32];
        assert_eq!(count_leading_zero_bits(&all_zeros), 255); // Capped at u8::MAX would be 256, but we only loop 32 bytes * 8 = 256

        // First byte is 0x01 = 7 leading zeros
        let mut hash = [0u8; 32];
        hash[0] = 0x01;
        assert_eq!(count_leading_zero_bits(&hash), 7);

        // First byte is 0x80 = 0 leading zeros
        hash[0] = 0x80;
        assert_eq!(count_leading_zero_bits(&hash), 0);

        // First byte is 0x00, second is 0x01 = 8 + 7 = 15 leading zeros
        hash[0] = 0x00;
        hash[1] = 0x01;
        assert_eq!(count_leading_zero_bits(&hash), 15);

        // First two bytes 0x00, third is 0x10 = 16 + 3 = 19 leading zeros
        hash[1] = 0x00;
        hash[2] = 0x10;
        assert_eq!(count_leading_zero_bits(&hash), 19);
    }

    #[test]
    fn test_offer_serialization() {
        let offer = PublicSponsorshipOffer {
            sponsor: PublicKey::from_bytes([1u8; 32]),
            offer_id: [2u8; 16],
            created_at: 1735689600,
            expires_at: 1738281600,
            max_sponsees: 5,
            offer_type: SponsorshipOfferType::Probationary,
            requirements: SponsorshipRequirements {
                min_pow_difficulty: 15,
                required_attester: Some(PublicKey::from_bytes([3u8; 32])),
                application_required: true,
            },
            signature: Signature::from_bytes([4u8; 64]),
            auto_approve: false,
        };

        let bytes = bincode::serialize(&offer).unwrap();
        let decoded: PublicSponsorshipOffer = bincode::deserialize(&bytes).unwrap();
        assert_eq!(offer, decoded);
    }

    #[test]
    fn test_claim_serialization() {
        let claim = SponsorshipClaim {
            offer_id: [1u8; 16],
            claimant: PublicKey::from_bytes([2u8; 32]),
            claimed_at: 1735689600,
            identity_pow_proof: IdentityCreationProof {
                public_key: PublicKey::from_bytes([2u8; 32]),
                timestamp: 1735689600,
                nonce: 12345,
                pow_hash: [3u8; 32],
            },
            pow_nonce_space: [0u8; 32],
            application_text: Some("I want to join".to_string()),
            attestation_signature: Some(Signature::from_bytes([5u8; 64])),
            claimant_signature: Signature::from_bytes([6u8; 64]),
            sponsor_approval: Some(Signature::from_bytes([7u8; 64])),
        };

        let bytes = bincode::serialize(&claim).unwrap();
        let decoded: SponsorshipClaim = bincode::deserialize(&bytes).unwrap();
        assert_eq!(claim, decoded);
    }
}
