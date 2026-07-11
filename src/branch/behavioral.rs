//! Behavioral Branching — Organic Community Formation (SPEC_13, Phase A)
//!
//! Implements the detection half of SPEC_13: incremental interaction metrics
//! (§2-3), connected-cluster discovery (§3.4), threshold gates (§2.2 / §3.3),
//! and the spam special-case for single-participant clusters (§6.1).
//!
//! Unlike hash-based fracturing (SPEC_08) which optimizes storage, behavioral
//! branching recognizes organic communities: when a sub-community becomes
//! behaviorally consolidated (low diversity, low external interaction, high
//! internal cohesion, sustained over time), the space fractures along the
//! cluster boundary so the community gets its own branch instead of dominating
//! the parent space.
//!
//! # Phase A scope
//!
//! Implemented:
//! - Per-identity, per-space metrics (§3.2) updated during action processing (§3.1)
//! - BFS connected-cluster discovery over interaction edges (§3.4)
//! - Threshold gates using the §2.2 constants
//! - Outcome A: community detection feeding cluster-membership fracture
//!   (see [`crate::branch::BranchManager::process_action_for_clustering`])
//! - Outcome B: single-participant clusters produce a spam signal (§6.1) for
//!   the spam-attestation / space-health side; no community is formed
//! - Cheap local anti-gaming rules (§6.3): minimum sustained interaction
//!   volume before detection, and a per-space formation cooldown
//!
//! Deferred (documented, not implemented):
//! - §7 network messages / cross-node community announcement. Per §4.3,
//!   formation is deterministic from chain data, so nodes running identical
//!   code over identical chains converge without messages; the config flag
//!   ([`crate::node::NodeConfig::behavioral_branching_enabled`]) keeps
//!   mainnet/testnet safe until §7 lands.
//! - §5.2/§5.3 ongoing membership migration and dissolution/merging
//! - §6.2 overlapping-community resolution (first formation wins in Phase A)
//! - §13.3 reciprocity-weighted interaction quality
//!
//! # Determinism (§4.3)
//!
//! All collections used in detection are ordered (`BTreeMap`/`BTreeSet`),
//! clusters are returned sorted, and the community ID is a hash over the
//! sorted member set. The same chain data therefore always produces the same
//! formation decision. (The spec's §3.2 sketch uses `HashSet` for
//! `unique_engagers`; we use `BTreeSet` for deterministic iteration and
//! serialization.)

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};

use crate::blocks::BranchPath;
use crate::crypto::sha256;
use crate::storage::ChainStore;

use super::error::BranchError;

// ============================================================================
// Threshold constants (SPEC_13 §2.2 — exact values)
// ============================================================================

/// Minimum engagement diversity to avoid community formation trigger.
/// Below this = tight-knit enough to potentially form community. (§2.2)
pub const MIN_ENGAGEMENT_DIVERSITY: f64 = 0.30;

/// Maximum external interaction ratio for community detection.
/// Above this = too connected to broader space. (§2.2)
pub const MAX_EXTERNAL_INTERACTION: f64 = 0.20;

/// Minimum internal cohesion for community detection. (§2.2)
pub const MIN_INTERNAL_COHESION: f64 = 0.80;

/// Minimum cluster size for legitimate community (vs spam). (§2.2)
pub const MIN_COMMUNITY_SIZE: usize = 3;

/// Minimum age in blocks before community can form (~7 days at 30s blocks). (§2.2)
pub const MIN_PATTERN_AGE_BLOCKS: u64 = 20160;

/// Single-participant clusters are flagged differently (spam, §6.1). (§2.2)
pub const SPAM_CLUSTER_SIZE: usize = 1;

/// Minimum directed interaction count for an edge to count in cluster BFS (§3.4).
///
/// SPEC_13 §3.4 references `MIN_INTERACTION_COUNT_FOR_EDGE` but never assigns
/// it a value anywhere in the spec. Chosen: 3 — a single reply or reaction
/// should not bind two identities into a cluster; three sustained directed
/// interactions is the smallest count that implies a deliberate pattern.
pub const MIN_INTERACTION_COUNT_FOR_EDGE: u64 = 3;

// ============================================================================
// Anti-gaming constants (SPEC_13 §6.3, with §13.1 observability guidance)
// ============================================================================

/// Minimum total cluster interactions before detection is eligible.
///
/// Implements the §6.3 "minimum activity threshold" rule using the value
/// suggested in §13.1 (`MIN_INTERACTIONS_FOR_DETECTION`). Prevents tiny
/// bursts from triggering formation.
pub const MIN_INTERACTIONS_FOR_DETECTION: u64 = 100;

/// Cooldown between community formations in the same space (~14 days). (§6.3)
pub const FORMATION_COOLDOWN_BLOCKS: u64 = 40320;

/// Communities below this size get no special treatment. (§6.3)
///
/// Declared for parity with the spec; Phase A grants no community benefits,
/// so this constant is not yet consulted anywhere.
pub const MIN_COMMUNITY_SIZE_FOR_BENEFITS: usize = 10;

// ============================================================================
// Types
// ============================================================================

/// Per-identity metrics within a space, stored as chain state (§3.2, §8.1).
///
/// Updated incrementally during normal action processing — no separate graph
/// storage or offline analysis pass.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdentitySpaceMetrics {
    /// Who this identity interacts with, and how much.
    /// Key: other identity, Value: directed interaction count.
    /// `BTreeMap` for deterministic iteration (§4.3).
    pub interactions: BTreeMap<[u8; 32], u64>,

    /// Total content created in this space.
    pub content_count: u64,

    /// Total engagements received from others (including self-engagement,
    /// which the spam case relies on).
    pub engagements_received: u64,

    /// Unique identities who engaged with this identity's content.
    /// Spec §3.2 sketches `HashSet`; `BTreeSet` used for determinism (§4.3).
    pub unique_engagers: BTreeSet<[u8; 32]>,

    /// First activity block height (for pattern-age calculation, §2.1.5).
    pub first_activity_height: u64,
}

/// Cluster-level metrics computed from on-chain data (§3.3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClusterMetrics {
    /// unique_engagers / total_engagements over cluster content (§2.1.1)
    pub engagement_diversity: f64,
    /// engagements_from_outside_cluster / total_engagements (§2.1.2)
    pub external_interaction: f64,
    /// within_cluster_interactions / total_cluster_interactions (§2.1.3)
    pub internal_cohesion: f64,
    /// Unique identities in the cluster (§2.1.4)
    pub member_count: usize,
    /// Blocks since the pattern could have existed (§2.1.5)
    pub age_blocks: u64,
}

/// Raw interaction totals backing a [`ClusterMetrics`] computation.
///
/// Kept separate so `ClusterMetrics` retains the exact §3.3 shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClusterTotals {
    /// Total engagements received by cluster members (from anyone).
    pub total_received: u64,
    /// Directed interactions from cluster members to cluster members.
    pub within_cluster: u64,
    /// Total outgoing interactions made by cluster members (to anyone).
    pub total_outgoing: u64,
}

impl ClusterTotals {
    /// Combined interaction volume used for the §6.3 minimum-activity gate.
    #[must_use]
    pub fn total_interactions(&self) -> u64 {
        // Outgoing covers within-cluster and member->outside; received adds
        // outside->member engagements not already counted in outgoing.
        self.total_outgoing + self.total_received.saturating_sub(self.within_cluster)
    }
}

/// A community formation decision, recorded on chain state (§4.1.1).
///
/// Phase A differences from the §4.1.1 sketch:
/// - `community_branch` replaces `new_space_id`: Phase A realizes a community
///   as a branch of the parent space (cluster-membership fracture), not a new
///   space. Deriving a real space awaits §7 consensus messages.
/// - `migrated_content` is omitted per the §13.2/§13.6 revision ("NO CONTENT
///   MIGRATION"): thread index pointers are reassigned by the fracture, block
///   data never moves.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommunityFormation {
    /// Unique identifier for this community.
    pub community_id: [u8; 32],
    /// Parent space this community splits from.
    pub parent_space_id: [u8; 32],
    /// Member identities at formation time (sorted; determinism §4.3).
    pub founding_members: Vec<[u8; 32]>,
    /// Metrics at time of formation (for verification, §4.2).
    pub metrics: ClusterMetrics,
    /// Block height when formation was detected.
    pub formation_height: u64,
    /// Branch the community was fractured into (set when the fracture
    /// executes; `None` on a freshly detected, not-yet-applied formation).
    pub community_branch: Option<BranchPath>,
}

impl CommunityFormation {
    /// Derive a deterministic community ID from the sorted member set (§4.3).
    #[must_use]
    pub fn derive_community_id(
        parent_space_id: &[u8; 32],
        sorted_members: &[[u8; 32]],
        formation_height: u64,
    ) -> [u8; 32] {
        let mut buf = Vec::with_capacity(24 + 32 + sorted_members.len() * 32 + 8);
        buf.extend_from_slice(b"swimchain:spec13:community:v1");
        buf.extend_from_slice(parent_space_id);
        for m in sorted_members {
            buf.extend_from_slice(m);
        }
        buf.extend_from_slice(&formation_height.to_be_bytes());
        sha256(&buf)
    }
}

/// A would-be community formation recorded during the Phase 1 log-only
/// rollout (`docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`). Detection and
/// gating are identical to a real [`CommunityFormation`]; the difference is
/// purely in what the caller does with the outcome: log-only mode persists
/// this record instead of executing the fracture, so no space/branch is ever
/// created. Queryable via the `list_behavioral_events` RPC.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BehavioralEvent {
    /// Deterministic event identifier. Uses a distinct domain-separation tag
    /// from [`CommunityFormation::derive_community_id`] so a log-only event
    /// can never collide with a real community ID over identical inputs.
    pub event_id: [u8; 32],
    /// Space the cluster was detected in.
    pub parent_space_id: [u8; 32],
    /// Member identities of the would-be community (sorted; determinism §4.3).
    pub cluster_members: Vec<[u8; 32]>,
    /// Metrics that crossed the §2.2 insularity gates at detection time.
    pub metrics: ClusterMetrics,
    /// Block height when the would-be formation was detected.
    pub detected_height: u64,
    /// Wall-clock timestamp of the triggering action.
    pub timestamp: u64,
}

impl BehavioralEvent {
    /// Derive a deterministic event ID, mirroring
    /// [`CommunityFormation::derive_community_id`] with a distinct domain tag
    /// (§4.3 determinism).
    #[must_use]
    pub fn derive_event_id(
        parent_space_id: &[u8; 32],
        sorted_members: &[[u8; 32]],
        detected_height: u64,
    ) -> [u8; 32] {
        let mut buf = Vec::with_capacity(24 + 32 + sorted_members.len() * 32 + 8);
        buf.extend_from_slice(b"swimchain:spec13:logonly:v1");
        buf.extend_from_slice(parent_space_id);
        for m in sorted_members {
            buf.extend_from_slice(m);
        }
        buf.extend_from_slice(&detected_height.to_be_bytes());
        sha256(&buf)
    }

    /// Build a log-only event from a detected (not-yet-applied) formation.
    #[must_use]
    pub fn from_formation(formation: &CommunityFormation, timestamp: u64) -> Self {
        let event_id = Self::derive_event_id(
            &formation.parent_space_id,
            &formation.founding_members,
            formation.formation_height,
        );
        Self {
            event_id,
            parent_space_id: formation.parent_space_id,
            cluster_members: formation.founding_members.clone(),
            metrics: formation.metrics.clone(),
            detected_height: formation.formation_height,
            timestamp,
        }
    }
}

/// Signal emitted when a single-participant cluster crosses the insularity
/// gates (§6.1). Phase A surfaces this to the spam-attestation / space-health
/// side instead of forming a community-of-one; the unlisted spam space of
/// §6.1 is deferred with §7.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpamClusterSignal {
    /// Space where the pattern was observed.
    pub space_id: [u8; 32],
    /// The self-referential identity.
    pub identity: [u8; 32],
    /// Metrics at detection time.
    pub metrics: ClusterMetrics,
    /// Block height at detection.
    pub detected_height: u64,
}

/// Outcome of processing one action for clustering (§3.1 + §6.1).
#[derive(Debug, Clone, PartialEq)]
pub enum ClusterOutcome {
    /// No threshold crossed (or gated by size/age/cooldown/existing membership).
    None,
    /// A legitimate community formed (cluster_size >= MIN_COMMUNITY_SIZE).
    Community(CommunityFormation),
    /// A single-participant insular cluster — spam signal, no community (§6.1).
    SpamSignal(SpamClusterSignal),
}

/// Normalized view of a chain action for clustering purposes (§3.1).
///
/// The caller resolves target authors (parent author for replies, content
/// author for engagements) from existing chain indexes before invoking the
/// engine — consistent with §8.1: the data already exists on chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClusteringAction {
    /// New thread/post by `author`.
    Post { author: [u8; 32] },
    /// `author` replied to content written by `parent_author`.
    Reply {
        author: [u8; 32],
        parent_author: [u8; 32],
    },
    /// `author` engaged with content written by `target_author`.
    Engage {
        author: [u8; 32],
        target_author: [u8; 32],
    },
}

impl ClusteringAction {
    /// The acting identity (used as the BFS start for threshold checks).
    #[must_use]
    pub fn author(&self) -> [u8; 32] {
        match self {
            ClusteringAction::Post { author }
            | ClusteringAction::Reply { author, .. }
            | ClusteringAction::Engage { author, .. } => *author,
        }
    }
}

// ============================================================================
// Incremental metric tracking (§3.1)
// ============================================================================

/// Update per-identity metrics for one action (§3.1).
///
/// Reply/Engage increment the directed interaction edge author -> target and
/// the target's received-engagement counters; Post registers authored content.
///
/// # Errors
/// Returns an error if chain-state storage fails.
pub fn update_metrics_for_action(
    store: &ChainStore,
    space_id: &[u8; 32],
    action: &ClusteringAction,
    current_height: u64,
) -> Result<(), BranchError> {
    match action {
        ClusteringAction::Post { author } => {
            store.register_author_content(space_id, author, current_height)?;
        }
        ClusteringAction::Reply {
            author,
            parent_author,
        } => {
            store.increment_interaction(space_id, author, parent_author, current_height)?;
        }
        ClusteringAction::Engage {
            author,
            target_author,
        } => {
            store.increment_interaction(space_id, author, target_author, current_height)?;
        }
    }
    Ok(())
}

// ============================================================================
// Connected cluster discovery (§3.4)
// ============================================================================

/// Find all identities connected to `start_identity` via qualifying
/// interaction edges (count >= [`MIN_INTERACTION_COUNT_FOR_EDGE`]).
///
/// BFS over directed outgoing edges per the §3.4 pseudocode. Returns a
/// sorted member list for determinism (§4.3).
///
/// # Errors
/// Returns an error if chain-state reads fail.
pub fn get_connected_cluster(
    store: &ChainStore,
    space_id: &[u8; 32],
    start_identity: &[u8; 32],
) -> Result<Vec<[u8; 32]>, BranchError> {
    let mut cluster: BTreeSet<[u8; 32]> = BTreeSet::new();
    let mut queue: VecDeque<[u8; 32]> = VecDeque::new();
    queue.push_back(*start_identity);

    while let Some(identity) = queue.pop_front() {
        if cluster.insert(identity) {
            let metrics = store
                .get_identity_space_metrics(space_id, &identity)?
                .unwrap_or_default();
            for (other, count) in &metrics.interactions {
                if *count >= MIN_INTERACTION_COUNT_FOR_EDGE && !cluster.contains(other) {
                    queue.push_back(*other);
                }
            }
        }
    }

    Ok(cluster.into_iter().collect())
}

// ============================================================================
// Cluster metric computation (§2.1, §3.3)
// ============================================================================

/// Compute cluster metrics from stored per-identity metrics.
///
/// Pattern age (§2.1.5) is resolved as `current_height - max(first_activity)`
/// over the members: the spec defines age against a per-cluster
/// "first_detected_height" that Phase A does not persist, so we use the
/// youngest member's first activity — a cluster's pattern cannot be older
/// than its newest participant, and this conservative choice prevents one
/// aged identity from carrying a freshly assembled cluster past the age gate.
///
/// # Errors
/// Returns an error if chain-state reads fail.
pub fn compute_cluster_metrics(
    store: &ChainStore,
    space_id: &[u8; 32],
    cluster: &[[u8; 32]],
    current_height: u64,
) -> Result<(ClusterMetrics, ClusterTotals), BranchError> {
    let members: BTreeSet<[u8; 32]> = cluster.iter().copied().collect();

    let mut total_received: u64 = 0;
    let mut within_cluster: u64 = 0;
    let mut total_outgoing: u64 = 0;
    let mut unique_engagers: BTreeSet<[u8; 32]> = BTreeSet::new();
    let mut newest_first_activity: u64 = 0;

    for member in &members {
        let m = store
            .get_identity_space_metrics(space_id, member)?
            .unwrap_or_default();

        total_received += m.engagements_received;
        unique_engagers.extend(m.unique_engagers.iter().copied());
        newest_first_activity = newest_first_activity.max(m.first_activity_height);

        for (other, count) in &m.interactions {
            total_outgoing += count;
            if members.contains(other) {
                within_cluster += count;
            }
        }
    }

    let engagement_diversity = if total_received == 0 {
        // No engagement data: treat as maximally diverse so empty clusters
        // can never pass the "< MIN_ENGAGEMENT_DIVERSITY" gate.
        1.0
    } else {
        unique_engagers.len() as f64 / total_received as f64
    };

    let external_interaction = if total_received == 0 {
        1.0
    } else {
        total_received.saturating_sub(within_cluster) as f64 / total_received as f64
    };

    let internal_cohesion = if total_outgoing == 0 {
        0.0
    } else {
        within_cluster as f64 / total_outgoing as f64
    };

    let age_blocks = current_height.saturating_sub(newest_first_activity);

    Ok((
        ClusterMetrics {
            engagement_diversity,
            external_interaction,
            internal_cohesion,
            member_count: members.len(),
            age_blocks,
        },
        ClusterTotals {
            total_received,
            within_cluster,
            total_outgoing,
        },
    ))
}

/// Check whether cluster metrics cross the §2.2 insularity gates.
#[must_use]
pub fn crosses_insularity_gates(metrics: &ClusterMetrics) -> bool {
    metrics.engagement_diversity < MIN_ENGAGEMENT_DIVERSITY
        && metrics.external_interaction < MAX_EXTERNAL_INTERACTION
        && metrics.internal_cohesion > MIN_INTERNAL_COHESION
        && metrics.age_blocks >= MIN_PATTERN_AGE_BLOCKS
}

// ============================================================================
// Threshold checking (§3.3) and outcome classification (§6.1)
// ============================================================================

/// Check whether the cluster containing `updated_identity` now crosses the
/// formation thresholds, and classify the outcome (§3.3, §6.1).
///
/// Gating order:
/// 1. Insularity gates (§2.2): diversity, external ratio, cohesion, age
/// 2. Minimum sustained activity (§6.3 anti-gaming): total interactions
/// 3. Size classification: `>= MIN_COMMUNITY_SIZE` community, `== 1` spam
///    signal, otherwise nothing (a 2-identity clique is neither a community
///    nor single-participant spam)
/// 4. Existing membership: identities already in a community never re-trigger
/// 5. Per-space formation cooldown (§6.3)
///
/// # Errors
/// Returns an error if chain-state reads fail.
pub fn check_threshold_crossing(
    store: &ChainStore,
    space_id: &[u8; 32],
    updated_identity: &[u8; 32],
    current_height: u64,
) -> Result<ClusterOutcome, BranchError> {
    let cluster = get_connected_cluster(store, space_id, updated_identity)?;
    let (metrics, totals) = compute_cluster_metrics(store, space_id, &cluster, current_height)?;

    if !crosses_insularity_gates(&metrics) {
        return Ok(ClusterOutcome::None);
    }

    // §6.3 anti-gaming: require sustained interaction volume.
    if totals.total_interactions() < MIN_INTERACTIONS_FOR_DETECTION {
        return Ok(ClusterOutcome::None);
    }

    if metrics.member_count >= MIN_COMMUNITY_SIZE {
        // Never re-form around identities that already belong to a community
        // in this space (Phase A resolution of §6.2 overlap: first wins).
        for member in &cluster {
            if store.get_identity_community(space_id, member)?.is_some() {
                return Ok(ClusterOutcome::None);
            }
        }

        // §6.3 cooldown: one behavioral formation per space per window.
        if let Some(last) = store.get_last_formation_height(space_id)? {
            if current_height < last.saturating_add(FORMATION_COOLDOWN_BLOCKS) {
                return Ok(ClusterOutcome::None);
            }
        }

        let community_id =
            CommunityFormation::derive_community_id(space_id, &cluster, current_height);
        Ok(ClusterOutcome::Community(CommunityFormation {
            community_id,
            parent_space_id: *space_id,
            founding_members: cluster,
            metrics,
            formation_height: current_height,
            community_branch: None,
        }))
    } else if metrics.member_count == SPAM_CLUSTER_SIZE {
        // §6.1: community-of-one. Phase A surfaces a spam signal instead of
        // creating an unlisted space.
        Ok(ClusterOutcome::SpamSignal(SpamClusterSignal {
            space_id: *space_id,
            identity: cluster[0],
            metrics,
            detected_height: current_height,
        }))
    } else {
        Ok(ClusterOutcome::None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constants_match_spec_2_2() {
        assert!((MIN_ENGAGEMENT_DIVERSITY - 0.30).abs() < f64::EPSILON);
        assert!((MAX_EXTERNAL_INTERACTION - 0.20).abs() < f64::EPSILON);
        assert!((MIN_INTERNAL_COHESION - 0.80).abs() < f64::EPSILON);
        assert_eq!(MIN_COMMUNITY_SIZE, 3);
        assert_eq!(MIN_PATTERN_AGE_BLOCKS, 20160);
        assert_eq!(SPAM_CLUSTER_SIZE, 1);
    }

    #[test]
    fn test_community_id_is_deterministic() {
        let space = [7u8; 32];
        let members = vec![[1u8; 32], [2u8; 32], [3u8; 32]];
        let a = CommunityFormation::derive_community_id(&space, &members, 100);
        let b = CommunityFormation::derive_community_id(&space, &members, 100);
        assert_eq!(a, b);

        // Different height or member set changes the ID
        let c = CommunityFormation::derive_community_id(&space, &members, 101);
        assert_ne!(a, c);
        let d = CommunityFormation::derive_community_id(&space, &members[..2].to_vec(), 100);
        assert_ne!(a, d);
    }

    #[test]
    fn test_gates_reject_empty_metrics() {
        let empty = ClusterMetrics {
            engagement_diversity: 1.0,
            external_interaction: 1.0,
            internal_cohesion: 0.0,
            member_count: 1,
            age_blocks: 0,
        };
        assert!(!crosses_insularity_gates(&empty));
    }

    #[test]
    fn test_gates_accept_insular_aged_cluster() {
        let insular = ClusterMetrics {
            engagement_diversity: 0.05,
            external_interaction: 0.02,
            internal_cohesion: 0.95,
            member_count: 5,
            age_blocks: MIN_PATTERN_AGE_BLOCKS,
        };
        assert!(crosses_insularity_gates(&insular));
    }

    #[test]
    fn test_gates_reject_diverse_popular_cluster() {
        // High volume but diverse engagement — the "loud but not insular" case.
        let diverse = ClusterMetrics {
            engagement_diversity: 0.45,
            external_interaction: 0.60,
            internal_cohesion: 0.40,
            member_count: 5,
            age_blocks: MIN_PATTERN_AGE_BLOCKS * 2,
        };
        assert!(!crosses_insularity_gates(&diverse));
    }

    #[test]
    fn test_gates_reject_young_cluster() {
        let young = ClusterMetrics {
            engagement_diversity: 0.05,
            external_interaction: 0.02,
            internal_cohesion: 0.95,
            member_count: 5,
            age_blocks: MIN_PATTERN_AGE_BLOCKS - 1,
        };
        assert!(!crosses_insularity_gates(&young));
    }

    #[test]
    fn test_identity_space_metrics_serialization_roundtrip() {
        let mut m = IdentitySpaceMetrics::default();
        m.interactions.insert([1u8; 32], 5);
        m.interactions.insert([2u8; 32], 3);
        m.content_count = 2;
        m.engagements_received = 8;
        m.unique_engagers.insert([1u8; 32]);
        m.first_activity_height = 42;

        let data = bincode::serialize(&m).unwrap();
        let back: IdentitySpaceMetrics = bincode::deserialize(&data).unwrap();
        assert_eq!(m, back);
    }

    #[test]
    fn test_event_id_is_deterministic_and_distinct_from_community_id() {
        let space = [7u8; 32];
        let members = vec![[1u8; 32], [2u8; 32], [3u8; 32]];
        let a = BehavioralEvent::derive_event_id(&space, &members, 100);
        let b = BehavioralEvent::derive_event_id(&space, &members, 100);
        assert_eq!(a, b);

        // Different height or member set changes the ID.
        let c = BehavioralEvent::derive_event_id(&space, &members, 101);
        assert_ne!(a, c);
        let d = BehavioralEvent::derive_event_id(&space, &members[..2].to_vec(), 100);
        assert_ne!(a, d);

        // Distinct domain tag: same inputs never collide with a real
        // CommunityFormation's community_id.
        let community_id = CommunityFormation::derive_community_id(&space, &members, 100);
        assert_ne!(a, community_id);
    }

    #[test]
    fn test_behavioral_event_from_formation() {
        let formation = CommunityFormation {
            community_id: CommunityFormation::derive_community_id(
                &[9u8; 32],
                &[[1u8; 32], [2u8; 32], [3u8; 32]],
                500,
            ),
            parent_space_id: [9u8; 32],
            founding_members: vec![[1u8; 32], [2u8; 32], [3u8; 32]],
            metrics: ClusterMetrics {
                engagement_diversity: 0.05,
                external_interaction: 0.02,
                internal_cohesion: 0.95,
                member_count: 3,
                age_blocks: MIN_PATTERN_AGE_BLOCKS,
            },
            formation_height: 500,
            community_branch: None,
        };

        let event = BehavioralEvent::from_formation(&formation, 1_700_000_000);
        assert_eq!(event.parent_space_id, formation.parent_space_id);
        assert_eq!(event.cluster_members, formation.founding_members);
        assert_eq!(event.metrics, formation.metrics);
        assert_eq!(event.detected_height, formation.formation_height);
        assert_eq!(event.timestamp, 1_700_000_000);
        assert_ne!(event.event_id, formation.community_id);

        let data = bincode::serialize(&event).unwrap();
        let back: BehavioralEvent = bincode::deserialize(&data).unwrap();
        assert_eq!(event, back);
    }
}
