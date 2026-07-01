//! Attestation aggregation with sponsor tree deduplication per SPEC_12 Section 4.2
//!
//! This module implements the Sybil-resistant attestation counting that uses
//! sponsor tree roots to deduplicate attestations from the same trust lineage.
//!
//! # Algorithm
//!
//! 1. For each attestation, find the attester's sponsor tree root
//! 2. Group attestations by their tree root
//! 3. Count unique tree roots (not individual attestations)
//! 4. Threshold is met when 3+ unique trees have attested
//!
//! This ensures that even if an attacker creates many identities, they all
//! trace back to the same sponsor tree root and count as only 1 attestation.

use std::collections::{HashMap, HashSet};

use super::error::SpamAttestationError;
use super::types::{SpamReason, StoredSpamAttestation, SPAM_ATTESTATION_THRESHOLD};

/// Result of tree-deduplicated attestation counting.
#[derive(Debug, Clone)]
pub struct TreeDeduplicatedCount {
    /// Number of unique sponsor tree roots that have attested
    pub unique_tree_count: u8,

    /// Total number of individual attestations (before deduplication)
    pub total_attestations: u32,

    /// Whether the spam threshold has been reached
    pub threshold_reached: bool,

    /// The unique tree roots that have attested
    pub tree_roots: HashSet<[u8; 32]>,

    /// Breakdown of attestations by reason
    pub reason_counts: HashMap<SpamReason, u8>,
}

impl TreeDeduplicatedCount {
    /// Create an empty count (no attestations).
    pub fn empty() -> Self {
        Self {
            unique_tree_count: 0,
            total_attestations: 0,
            threshold_reached: false,
            tree_roots: HashSet::new(),
            reason_counts: HashMap::new(),
        }
    }
}

/// Result of attestation aggregation for a piece of content.
#[derive(Debug, Clone)]
pub struct AttestationAggregation {
    /// Content hash being aggregated
    pub content_hash: [u8; 32],

    /// Deduplicated count results
    pub count: TreeDeduplicatedCount,

    /// Whether accelerated decay should be applied
    pub should_accelerate_decay: bool,

    /// Most common spam reason (majority vote)
    pub primary_reason: Option<SpamReason>,

    /// Whether content has been counter-attested (cleared)
    pub is_cleared: bool,
}

impl AttestationAggregation {
    /// Create aggregation for content with no attestations.
    pub fn empty(content_hash: [u8; 32]) -> Self {
        Self {
            content_hash,
            count: TreeDeduplicatedCount::empty(),
            should_accelerate_decay: false,
            primary_reason: None,
            is_cleared: false,
        }
    }
}

/// Aggregate attestations for a piece of content using sponsor tree deduplication.
///
/// This is the core Sybil resistance mechanism per SPEC_12 §4.2.
///
/// # Arguments
/// * `content_hash` - Hash of the content being evaluated
/// * `attestations` - List of stored attestations (with pre-computed tree roots)
/// * `is_cleared` - Whether the content has been cleared by counter-attestations
///
/// # Returns
/// Aggregation result including deduplicated count and threshold status
pub fn aggregate_attestations(
    content_hash: [u8; 32],
    attestations: &[StoredSpamAttestation],
    is_cleared: bool,
) -> AttestationAggregation {
    if attestations.is_empty() {
        return AttestationAggregation::empty(content_hash);
    }

    let mut tree_roots: HashSet<[u8; 32]> = HashSet::new();
    let mut reason_counts: HashMap<SpamReason, u8> = HashMap::new();

    for stored in attestations {
        // Add tree root (HashSet automatically deduplicates)
        tree_roots.insert(stored.sponsor_tree_root);

        // Count reasons
        *reason_counts
            .entry(stored.attestation.reason)
            .or_insert(0) += 1;
    }

    let unique_tree_count = tree_roots.len() as u8;
    let threshold_reached = unique_tree_count >= SPAM_ATTESTATION_THRESHOLD;

    // Find primary reason (most common)
    let primary_reason = reason_counts
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(reason, _)| *reason);

    let count = TreeDeduplicatedCount {
        unique_tree_count,
        total_attestations: attestations.len() as u32,
        threshold_reached,
        tree_roots,
        reason_counts,
    };

    AttestationAggregation {
        content_hash,
        count,
        should_accelerate_decay: threshold_reached && !is_cleared,
        primary_reason,
        is_cleared,
    }
}

/// Find the sponsor tree root for an identity.
///
/// Traverses the sponsorship chain from the identity up to the genesis root.
/// The root is used as the deduplication key for Sybil resistance.
///
/// # Arguments
/// * `identity` - Public key of the identity to look up
/// * `get_sponsor` - Callback to get the sponsor of an identity (returns None for genesis)
///
/// # Returns
/// The tree root public key, or error if lookup fails
pub fn find_sponsor_tree_root<F>(
    identity: &[u8; 32],
    get_sponsor: F,
) -> Result<[u8; 32], SpamAttestationError>
where
    F: Fn(&[u8; 32]) -> Option<[u8; 32]>,
{
    let mut current = *identity;

    // Maximum depth to prevent infinite loops (matches SPEC_11 MAX_TREE_DEPTH)
    const MAX_DEPTH: u32 = 100;

    for _ in 0..MAX_DEPTH {
        match get_sponsor(&current) {
            Some(sponsor) => current = sponsor,
            None => {
                // No sponsor means this is a genesis/root identity
                return Ok(current);
            }
        }
    }

    // Exceeded maximum depth - this shouldn't happen with valid sponsorship data
    Err(SpamAttestationError::SponsorTreeError(
        "Exceeded maximum tree depth".to_string(),
    ))
}

/// Check if two attesters share the same sponsor tree root.
///
/// If they share a root, their attestations should be deduplicated.
pub fn share_sponsor_tree<F>(
    attester1: &[u8; 32],
    attester2: &[u8; 32],
    get_sponsor: F,
) -> Result<bool, SpamAttestationError>
where
    F: Fn(&[u8; 32]) -> Option<[u8; 32]>,
{
    let root1 = find_sponsor_tree_root(attester1, &get_sponsor)?;
    let root2 = find_sponsor_tree_root(attester2, &get_sponsor)?;
    Ok(root1 == root2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spam_attestation::types::SpamAttestation;

    fn make_attestation(
        attester: [u8; 32],
        tree_root: [u8; 32],
        reason: SpamReason,
    ) -> StoredSpamAttestation {
        StoredSpamAttestation {
            attestation: SpamAttestation {
                content_hash: [0u8; 32],
                attester,
                reason,
                timestamp: 1735689600,
                pow_nonce: 0,
                signature: [0u8; 64],
            },
            sponsor_tree_root: tree_root,
            is_deduplicated: false,
        }
    }

    #[test]
    fn test_aggregate_empty() {
        let result = aggregate_attestations([0u8; 32], &[], false);
        assert_eq!(result.count.unique_tree_count, 0);
        assert_eq!(result.count.total_attestations, 0);
        assert!(!result.count.threshold_reached);
        assert!(!result.should_accelerate_decay);
    }

    #[test]
    fn test_aggregate_single_tree() {
        // Three attestations from the same tree root
        let tree_root = [1u8; 32];
        let attestations = vec![
            make_attestation([10u8; 32], tree_root, SpamReason::Advertising),
            make_attestation([11u8; 32], tree_root, SpamReason::Advertising),
            make_attestation([12u8; 32], tree_root, SpamReason::Advertising),
        ];

        let result = aggregate_attestations([0u8; 32], &attestations, false);

        // Should count as only 1 unique tree
        assert_eq!(result.count.unique_tree_count, 1);
        assert_eq!(result.count.total_attestations, 3);
        assert!(!result.count.threshold_reached); // Need 3 trees, not 3 attestations
        assert!(!result.should_accelerate_decay);
    }

    #[test]
    fn test_aggregate_three_trees_threshold() {
        // Three attestations from three different tree roots
        let attestations = vec![
            make_attestation([10u8; 32], [1u8; 32], SpamReason::Advertising),
            make_attestation([20u8; 32], [2u8; 32], SpamReason::Advertising),
            make_attestation([30u8; 32], [3u8; 32], SpamReason::Advertising),
        ];

        let result = aggregate_attestations([0u8; 32], &attestations, false);

        assert_eq!(result.count.unique_tree_count, 3);
        assert_eq!(result.count.total_attestations, 3);
        assert!(result.count.threshold_reached);
        assert!(result.should_accelerate_decay);
        assert_eq!(result.primary_reason, Some(SpamReason::Advertising));
    }

    #[test]
    fn test_aggregate_cleared_no_acceleration() {
        // Threshold reached but content is cleared
        let attestations = vec![
            make_attestation([10u8; 32], [1u8; 32], SpamReason::Harassment),
            make_attestation([20u8; 32], [2u8; 32], SpamReason::Harassment),
            make_attestation([30u8; 32], [3u8; 32], SpamReason::Harassment),
        ];

        let result = aggregate_attestations([0u8; 32], &attestations, true);

        assert!(result.count.threshold_reached);
        assert!(!result.should_accelerate_decay); // Cleared!
        assert!(result.is_cleared);
    }

    #[test]
    fn test_aggregate_mixed_reasons() {
        let attestations = vec![
            make_attestation([10u8; 32], [1u8; 32], SpamReason::Advertising),
            make_attestation([20u8; 32], [2u8; 32], SpamReason::Repetitive),
            make_attestation([30u8; 32], [3u8; 32], SpamReason::Advertising),
        ];

        let result = aggregate_attestations([0u8; 32], &attestations, false);

        // Advertising should be primary (2 vs 1)
        assert_eq!(result.primary_reason, Some(SpamReason::Advertising));
        assert_eq!(result.count.reason_counts.get(&SpamReason::Advertising), Some(&2));
        assert_eq!(result.count.reason_counts.get(&SpamReason::Repetitive), Some(&1));
    }

    #[test]
    fn test_find_sponsor_tree_root_genesis() {
        // Genesis identity has no sponsor
        let genesis = [1u8; 32];
        let get_sponsor = |_: &[u8; 32]| None;

        let root = find_sponsor_tree_root(&genesis, get_sponsor).unwrap();
        assert_eq!(root, genesis);
    }

    #[test]
    fn test_find_sponsor_tree_root_chain() {
        // Chain: identity -> sponsor -> genesis
        let genesis = [1u8; 32];
        let sponsor = [2u8; 32];
        let identity = [3u8; 32];

        let get_sponsor = |pk: &[u8; 32]| {
            if *pk == identity {
                Some(sponsor)
            } else if *pk == sponsor {
                Some(genesis)
            } else {
                None // genesis has no sponsor
            }
        };

        let root = find_sponsor_tree_root(&identity, get_sponsor).unwrap();
        assert_eq!(root, genesis);
    }

    #[test]
    fn test_share_sponsor_tree() {
        let genesis = [1u8; 32];
        let sponsor = [2u8; 32];
        let id1 = [10u8; 32];
        let id2 = [11u8; 32];
        let other_genesis = [99u8; 32];
        let id3 = [100u8; 32];

        let get_sponsor = |pk: &[u8; 32]| {
            match *pk {
                x if x == id1 => Some(sponsor),
                x if x == id2 => Some(sponsor),
                x if x == sponsor => Some(genesis),
                x if x == id3 => Some(other_genesis),
                _ => None,
            }
        };

        // id1 and id2 share the same tree (both under genesis via sponsor)
        assert!(share_sponsor_tree(&id1, &id2, &get_sponsor).unwrap());

        // id1 and id3 are from different trees
        assert!(!share_sponsor_tree(&id1, &id3, &get_sponsor).unwrap());
    }
}
