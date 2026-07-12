//! Behavioral branching — content-layer community detection (pure core, SPEC_13).
//!
//! This is the exact detection math the node runs, lifted out of the
//! storage-backed path so it can also run in the browser simulation: given an
//! interaction graph, discover the cluster (BFS over the real edge threshold),
//! compute the four §2.1 metrics, and apply the §2.2 insularity + minority gates.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};

// ── SPEC_13 §2.2 thresholds (identical to src/branch/behavioral.rs) ──────────
pub const MIN_ENGAGEMENT_DIVERSITY: f64 = 0.30;
pub const MAX_EXTERNAL_INTERACTION: f64 = 0.20;
pub const MIN_INTERNAL_COHESION: f64 = 0.80;
pub const MIN_COMMUNITY_SIZE: usize = 3;
pub const MIN_PATTERN_AGE_BLOCKS: u64 = 20160;
pub const SPAM_CLUSTER_SIZE: usize = 1;
pub const MAX_CLUSTER_SPACE_FRACTION: f64 = 0.5;
pub const MIN_INTERACTION_COUNT_FOR_EDGE: u64 = 3;
pub const MIN_INTERACTIONS_FOR_DETECTION: u64 = 100;

/// One identity's per-space activity — the pure equivalent of the node's stored
/// `IdentitySpaceMetrics`, keyed by a small integer id for the simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberActivity {
    pub id: u32,
    /// Engagements this identity received (denominator of diversity/external).
    pub engagements_received: u64,
    /// Distinct identities that engaged this one.
    pub unique_engagers: Vec<u32>,
    /// Block height of this identity's first activity.
    pub first_activity_height: u64,
    /// Directed outgoing interaction counts: `(other_id, count)`.
    pub interactions: Vec<(u32, u64)>,
}

/// Cluster-level metrics (§2.1) — same shape/formulas as the node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClusterMetrics {
    pub engagement_diversity: f64,
    pub external_interaction: f64,
    pub internal_cohesion: f64,
    pub member_count: usize,
    pub age_blocks: u64,
}

/// BFS the connected cluster from `start`, following outgoing edges whose count
/// is `>= MIN_INTERACTION_COUNT_FOR_EDGE` (§3.4). Real node logic, pure inputs.
#[must_use]
pub fn connected_cluster(members: &[MemberActivity], start: u32) -> Vec<u32> {
    let index: BTreeMap<u32, &MemberActivity> = members.iter().map(|m| (m.id, m)).collect();
    let mut cluster: BTreeSet<u32> = BTreeSet::new();
    let mut queue: VecDeque<u32> = VecDeque::new();
    queue.push_back(start);
    while let Some(id) = queue.pop_front() {
        if cluster.insert(id) {
            if let Some(m) = index.get(&id) {
                for (other, count) in &m.interactions {
                    if *count >= MIN_INTERACTION_COUNT_FOR_EDGE && !cluster.contains(other) {
                        queue.push_back(*other);
                    }
                }
            }
        }
    }
    cluster.into_iter().collect()
}

/// Compute the §2.1 metrics for `cluster` from member activity — identical
/// formula to the node's `compute_cluster_metrics`, pure inputs.
#[must_use]
pub fn compute_metrics(
    members: &[MemberActivity],
    cluster: &[u32],
    current_height: u64,
) -> ClusterMetrics {
    let index: BTreeMap<u32, &MemberActivity> = members.iter().map(|m| (m.id, m)).collect();
    let set: BTreeSet<u32> = cluster.iter().copied().collect();

    let mut total_received: u64 = 0;
    let mut within_cluster: u64 = 0;
    let mut total_outgoing: u64 = 0;
    let mut unique_engagers: BTreeSet<u32> = BTreeSet::new();
    let mut newest_first_activity: u64 = 0;

    for member in &set {
        let Some(m) = index.get(member) else { continue };
        total_received += m.engagements_received;
        unique_engagers.extend(m.unique_engagers.iter().copied());
        newest_first_activity = newest_first_activity.max(m.first_activity_height);
        for (other, count) in &m.interactions {
            total_outgoing += count;
            if set.contains(other) {
                within_cluster += count;
            }
        }
    }

    let engagement_diversity = if total_received == 0 {
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

    ClusterMetrics {
        engagement_diversity,
        external_interaction,
        internal_cohesion,
        member_count: set.len(),
        age_blocks,
    }
}

/// The four §2.2 insularity gates (identical to the node).
#[must_use]
pub fn crosses_insularity_gates(m: &ClusterMetrics) -> bool {
    m.engagement_diversity < MIN_ENGAGEMENT_DIVERSITY
        && m.external_interaction < MAX_EXTERNAL_INTERACTION
        && m.internal_cohesion > MIN_INTERNAL_COHESION
        && m.age_blocks >= MIN_PATTERN_AGE_BLOCKS
}

/// The §2.2 minority gate: `cluster_size / participants <= 0.5`, exact integer.
#[must_use]
pub fn is_minority_of_space(cluster_size: usize, space_participants: usize) -> bool {
    if space_participants == 0 {
        return false;
    }
    cluster_size.saturating_mul(2) <= space_participants
}

/// Per-gate pass/fail plus the classified outcome — exactly what the simulation
/// renders (so every checkmark reflects the real threshold).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterEvaluation {
    pub cluster: Vec<u32>,
    pub metrics: ClusterMetrics,
    pub space_participants: usize,
    pub gate_diversity: bool,
    pub gate_external: bool,
    pub gate_cohesion: bool,
    pub gate_age: bool,
    pub gate_minority: bool,
    pub gate_size: bool,
    /// One of: "community", "spam", "none".
    pub outcome: &'static str,
    pub reason: &'static str,
}

/// Full evaluation for the identity `start`: discover its cluster, compute
/// metrics, and classify (§3.3 gating order → §6.1 outcome). `participants` is
/// the number of distinct identities active in the space.
#[must_use]
pub fn evaluate_cluster(
    members: &[MemberActivity],
    start: u32,
    participants: usize,
    current_height: u64,
) -> ClusterEvaluation {
    let cluster = connected_cluster(members, start);
    let metrics = compute_metrics(members, &cluster, current_height);
    let size = cluster.len();

    let gate_diversity = metrics.engagement_diversity < MIN_ENGAGEMENT_DIVERSITY;
    let gate_external = metrics.external_interaction < MAX_EXTERNAL_INTERACTION;
    let gate_cohesion = metrics.internal_cohesion > MIN_INTERNAL_COHESION;
    let gate_age = metrics.age_blocks >= MIN_PATTERN_AGE_BLOCKS;
    let insular = gate_diversity && gate_external && gate_cohesion && gate_age;
    let gate_minority = is_minority_of_space(size, participants);
    let gate_size = size >= MIN_COMMUNITY_SIZE;

    let (outcome, reason) = if !insular {
        (
            "none",
            "not insular enough — one of diversity/external/cohesion/age gates fails",
        )
    } else if size == SPAM_CLUSTER_SIZE {
        ("spam", "a lone self-engager: a community of one (spam signal)")
    } else if !gate_size {
        ("none", "insular but below the minimum community size of 3")
    } else if !gate_minority {
        (
            "none",
            "insular, but the cluster is a majority of the space — regulars can't be split from their own space",
        )
    } else {
        (
            "community",
            "insular minority cluster of 3+ — graduates to its own space",
        )
    };

    ClusterEvaluation {
        cluster,
        metrics,
        space_participants: participants,
        gate_diversity,
        gate_external,
        gate_cohesion,
        gate_age,
        gate_minority,
        gate_size,
        outcome,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minority_gate_exact_boundary() {
        assert!(is_minority_of_space(2, 4)); // 50% ok
        assert!(!is_minority_of_space(3, 4)); // majority rejected
        assert!(!is_minority_of_space(1, 0)); // no participants
    }

    #[test]
    fn insular_minority_triad_graduates() {
        // 3 members engaging only each other, old, minority of a 10-person space.
        let mk = |id: u32, others: &[u32]| MemberActivity {
            id,
            engagements_received: 10,
            unique_engagers: others.to_vec(),
            first_activity_height: 0,
            interactions: others.iter().map(|o| (*o, 5u64)).collect(),
        };
        let members = vec![mk(1, &[2, 3]), mk(2, &[1, 3]), mk(3, &[1, 2])];
        let ev = evaluate_cluster(&members, 1, 10, 30000);
        assert_eq!(ev.cluster.len(), 3);
        assert_eq!(ev.outcome, "community");
    }
}
