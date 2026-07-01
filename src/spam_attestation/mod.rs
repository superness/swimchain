//! Spam Attestation System for Swimchain
//!
//! This module implements SPEC_12 (Anti-Abuse) Sections 3-5: Community spam flagging
//! with Sybil-resistant attestation aggregation.
//!
//! # Key Features
//!
//! - **SpamAttestation**: Content flagging by Resident+ members
//! - **SpamReason**: Objective behavioral categories (Advertising, Repetitive, etc.)
//! - **Sponsor Tree Deduplication**: Multiple attesters from the same sponsor tree count as 1
//! - **3-Attester Threshold**: Content flagged only when 3+ independent trees attest
//! - **Counter-Attestation**: 5 Lifeguard+ can cancel spam flags
//! - **Accelerated Decay**: Flagged content decays with 4-hour half-life
//!
//! # Sybil Resistance Design
//!
//! The system uses sponsor tree roots as the deduplication key, ensuring that
//! even if an attacker creates many identities, they all trace back to the same
//! sponsor tree root and count as a single attestation.
//!
//! See RESEARCH_08 (Attestation Mechanisms) for prior art analysis.

pub mod aggregation;
pub mod counter;
pub mod error;
pub mod manager;
pub mod storage;
pub mod types;
pub mod validation;

pub use aggregation::{
    aggregate_attestations, find_sponsor_tree_root, AttestationAggregation, TreeDeduplicatedCount,
};
pub use counter::{CounterAttestation, CounterAttestationState};
pub use error::SpamAttestationError;
pub use storage::SpamAttestationStore;
pub use types::{
    SpamAttestation, SpamReason, StoredSpamAttestation, COUNTER_ATTESTATION_THRESHOLD,
    FLAGGED_DECAY_HALF_LIFE_SECS, SPAM_ATTESTATION_POW_DIFFICULTY, SPAM_ATTESTATION_THRESHOLD,
};
pub use validation::{check_attester_eligibility, validate_attestation, AttesterEligibility};
pub use manager::{
    calculate_heat_bonus, can_counter_attest, counter_threshold,
    CounterAttestationManager, CounterAttestationResult, COUNTER_ATTESTATION_HEAT_BONUS,
    MAX_COUNTER_ATTESTATION_HEAT_BONUS,
};
