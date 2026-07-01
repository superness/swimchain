# SPEC_13: Organic Community Formation (Behavioral Branching)

**Status:** Draft (Under Critical Review)
**Created:** January 2026
**Related:** SPEC_08 (Recursive Blocks), SPEC_04 (Spaces), SPEC_12 (Anti-Abuse)

> **Review Status:** This spec has undergone critical review for scalability and practicality.
> See Section 13 for identified issues and mitigations.

---

## 1. Overview

### 1.1 Purpose

This specification defines behavioral branching—automatic community formation based on interaction patterns. Unlike hash-based fracturing (SPEC_08) which optimizes storage, behavioral branching recognizes organic communities and gives them their own space.

### 1.2 Design Philosophy

**This is NOT moderation.** The system does not judge content quality or punish users. It recognizes natural community boundaries:

- Tight-knit groups that mostly interact with each other → get their own space
- Self-referential content (spam) → becomes a "community of one"
- Both outcomes use the same mechanism with different results

### 1.3 Key Properties

| Property | Description |
|----------|-------------|
| Deterministic | Same chain data → same community detection |
| Consensus-based | Community formation recorded on-chain |
| Non-punitive | Recognition, not punishment |
| Discoverable | New communities are visible and joinable |
| Reversible | Communities can merge back if interaction patterns change |

---

## 2. Detection Metrics

### 2.1 Core Metrics

All metrics are computable from on-chain data by any node.

#### 2.1.1 Engagement Diversity

Measures how many unique identities engage with a content cluster.

```
engagement_diversity = unique_engagers / total_engagements

Example:
- Content has 100 engagements from 5 unique users
- engagement_diversity = 5 / 100 = 0.05

Low diversity (< 0.3) indicates tight-knit or self-referential content.
```

#### 2.1.2 External Interaction Ratio

Measures what percentage of interactions come from outside the detected cluster.

```
external_interaction = engagements_from_outside_cluster / total_engagements

Example:
- Cluster of users {A, B, C}
- 100 total engagements on their content
- 10 from users outside {A, B, C}
- external_interaction = 10 / 100 = 0.10

Low external interaction (< 0.2) indicates an insular community.
```

#### 2.1.3 Internal Cohesion

Measures how strongly cluster members interact with each other vs. the broader space.

```
internal_cohesion = within_cluster_interactions / total_cluster_interactions

Example:
- Users {A, B, C} make 200 interactions total
- 180 are with each other's content
- 20 are with content outside the cluster
- internal_cohesion = 180 / 200 = 0.90

High cohesion (> 0.8) indicates strong community bonds.
```

#### 2.1.4 Cluster Size

Number of unique identities in the detected cluster.

```
cluster_size = count(unique_identities_in_cluster)

Minimum threshold: 1 (allows spam detection)
Legitimate community threshold: 3+ members
```

#### 2.1.5 Pattern Age

How long the interaction pattern has persisted.

```
pattern_age = current_block_height - first_detected_height

Minimum: 7 days (prevents premature detection)
```

### 2.2 Threshold Constants

```rust
/// Minimum engagement diversity to avoid community formation trigger
/// Below this = tight-knit enough to potentially form community
pub const MIN_ENGAGEMENT_DIVERSITY: f64 = 0.30;

/// Maximum external interaction ratio for community detection
/// Above this = too connected to broader space
pub const MAX_EXTERNAL_INTERACTION: f64 = 0.20;

/// Minimum internal cohesion for community detection
pub const MIN_INTERNAL_COHESION: f64 = 0.80;

/// Minimum cluster size for legitimate community (vs spam)
pub const MIN_COMMUNITY_SIZE: usize = 3;

/// Minimum age in blocks before community can form (~7 days)
pub const MIN_PATTERN_AGE_BLOCKS: u64 = 20160; // 7 days at 30s blocks

/// Single-participant clusters are flagged differently
pub const SPAM_CLUSTER_SIZE: usize = 1;
```

---

## 3. Incremental Metric Tracking

### 3.1 Core Principle

**No separate analysis.** Metrics are updated as blocks are processed, using data already on chain.

```rust
/// Called during normal block processing
pub fn process_action_for_clustering(
    chain: &mut ChainStore,
    action: &Action,
    space_id: &[u8; 32],
) {
    // Update cluster metrics incrementally
    match action.action_type {
        ActionType::Reply => {
            chain.increment_interaction(space_id, action.author, action.parent_author);
        }
        ActionType::Engage => {
            chain.increment_interaction(space_id, action.author, action.target_author);
        }
        ActionType::Post => {
            chain.register_author_content(space_id, action.author, action.content_id);
        }
    }

    // Check if any cluster now crosses threshold
    if let Some(formation) = check_threshold_crossing(chain, space_id, &action.author) {
        chain.queue_community_formation(formation);
    }
}
```

### 3.2 On-Chain Metric Storage

Metrics stored as part of normal chain state (not separate index):

```rust
/// Per-identity metrics within a space (stored on chain)
pub struct IdentitySpaceMetrics {
    /// Who this identity interacts with, and how much
    /// Key: other_identity, Value: interaction_count
    pub interactions: BTreeMap<[u8; 32], u64>,

    /// Total content created in this space
    pub content_count: u64,

    /// Total engagements received from others
    pub engagements_received: u64,

    /// Unique identities who engaged with this identity's content
    pub unique_engagers: HashSet<[u8; 32]>,

    /// First activity timestamp (for age calculation)
    pub first_activity_height: u64,
}
```

### 3.3 Threshold Checking

On each interaction, check if cluster metrics cross thresholds:

```rust
pub fn check_threshold_crossing(
    chain: &ChainStore,
    space_id: &[u8; 32],
    updated_identity: &[u8; 32],
) -> Option<CommunityFormation> {
    // Get the cluster this identity belongs to
    let cluster = get_connected_cluster(chain, space_id, updated_identity);

    // Compute metrics from on-chain data
    let metrics = ClusterMetrics {
        engagement_diversity: compute_diversity(chain, &cluster),
        external_interaction: compute_external_ratio(chain, space_id, &cluster),
        internal_cohesion: compute_cohesion(chain, &cluster),
        member_count: cluster.len(),
        age_blocks: compute_cluster_age(chain, &cluster),
    };

    // Check thresholds
    if metrics.engagement_diversity < MIN_ENGAGEMENT_DIVERSITY
        && metrics.external_interaction < MAX_EXTERNAL_INTERACTION
        && metrics.internal_cohesion > MIN_INTERNAL_COHESION
        && metrics.age_blocks >= MIN_PATTERN_AGE_BLOCKS
    {
        Some(CommunityFormation::new(space_id, cluster, metrics))
    } else {
        None
    }
}
```

### 3.4 Connected Cluster Discovery

Find which identities form a connected group:

```rust
/// Find all identities connected to the given identity via interactions
pub fn get_connected_cluster(
    chain: &ChainStore,
    space_id: &[u8; 32],
    start_identity: &[u8; 32],
) -> Vec<[u8; 32]> {
    let mut cluster = HashSet::new();
    let mut queue = vec![*start_identity];

    while let Some(identity) = queue.pop() {
        if cluster.insert(identity) {
            // Get all identities this one interacts with
            let metrics = chain.get_identity_space_metrics(space_id, &identity);
            for (other, count) in &metrics.interactions {
                if *count >= MIN_INTERACTION_COUNT_FOR_EDGE {
                    queue.push(*other);
                }
            }
        }
    }

    cluster.into_iter().collect()
}
```

---

## 4. Consensus Mechanism

### 4.1 On-Chain Recording

Community formation decisions are recorded in root blocks to ensure network-wide consensus.

#### 4.1.1 Community Formation Record

```rust
pub struct CommunityFormation {
    /// Unique identifier for this community
    pub community_id: [u8; 32],

    /// Parent space this community splits from
    pub parent_space_id: [u8; 32],

    /// New space created for this community
    pub new_space_id: [u8; 32],

    /// Member identities at formation time
    pub founding_members: Vec<[u8; 32]>,

    /// Content IDs moved to new space
    pub migrated_content: Vec<ContentId>,

    /// Metrics at time of formation (for verification)
    pub metrics: ClusterMetrics,

    /// Block height when formation was recorded
    pub formation_height: u64,
}
```

#### 4.1.2 Root Block Extension

```rust
pub struct RootBlock {
    // ... existing fields ...

    /// Community formations in this block
    pub community_formations: Vec<CommunityFormation>,
}
```

### 4.2 Validation Rules

Nodes validate community formation records before accepting blocks:

```rust
pub fn validate_community_formation(
    formation: &CommunityFormation,
    chain: &ChainStore,
) -> Result<(), ValidationError> {
    // 1. Recompute metrics from chain data
    let computed_metrics = compute_cluster_metrics_from_chain(
        chain,
        &formation.founding_members,
        formation.formation_height,
    )?;

    // 2. Verify metrics match (within tolerance)
    if !metrics_match(&computed_metrics, &formation.metrics, METRIC_TOLERANCE) {
        return Err(ValidationError::MetricsMismatch);
    }

    // 3. Verify thresholds are met
    if computed_metrics.engagement_diversity >= MIN_ENGAGEMENT_DIVERSITY {
        return Err(ValidationError::ThresholdNotMet("engagement_diversity"));
    }
    if computed_metrics.external_interaction >= MAX_EXTERNAL_INTERACTION {
        return Err(ValidationError::ThresholdNotMet("external_interaction"));
    }
    if computed_metrics.internal_cohesion < MIN_INTERNAL_COHESION {
        return Err(ValidationError::ThresholdNotMet("internal_cohesion"));
    }
    if computed_metrics.age_blocks < MIN_PATTERN_AGE_BLOCKS {
        return Err(ValidationError::ThresholdNotMet("pattern_age"));
    }

    // 4. Verify parent space exists
    if !chain.space_exists(&formation.parent_space_id)? {
        return Err(ValidationError::ParentSpaceNotFound);
    }

    // 5. Verify new space ID is valid (derived from community_id)
    let expected_space_id = derive_community_space_id(
        &formation.parent_space_id,
        &formation.community_id,
    );
    if formation.new_space_id != expected_space_id {
        return Err(ValidationError::InvalidSpaceId);
    }

    Ok(())
}
```

### 4.3 Deterministic Formation

To ensure all nodes reach the same conclusion:

1. **Same algorithm**: All nodes run identical detection code
2. **Same data**: Metrics computed from immutable chain data
3. **Same thresholds**: Constants are protocol-level, not configurable
4. **Block-triggered**: Detection runs at specific block heights (e.g., every 1000 blocks)

```rust
/// Check if community detection should run this block
pub fn should_run_detection(block_height: u64) -> bool {
    block_height % DETECTION_INTERVAL_BLOCKS == 0
}

pub const DETECTION_INTERVAL_BLOCKS: u64 = 1000; // ~8 hours
```

---

## 5. Community Lifecycle

### 5.1 Formation

When a community is detected and recorded:

1. **New space created**: Derived from parent space + community ID
2. **Content migrated**: Existing content from cluster members moved (index update only)
3. **Members notified**: Clients show "Your community now has its own space"
4. **Discoverable**: New space appears in space listings

```rust
pub fn execute_community_formation(
    chain: &mut ChainStore,
    formation: &CommunityFormation,
) -> Result<(), FormationError> {
    // 1. Create new space
    let new_space = Space {
        id: formation.new_space_id,
        name: generate_community_name(&formation),
        parent: Some(formation.parent_space_id),
        formed_from_community: true,
        formation_height: formation.formation_height,
    };
    chain.create_space(&new_space)?;

    // 2. Update content indexes (not data, just pointers)
    for content_id in &formation.migrated_content {
        chain.update_content_space(content_id, &formation.new_space_id)?;
    }

    // 3. Record formation in community registry
    chain.record_community_formation(formation)?;

    Ok(())
}
```

### 5.2 Ongoing Membership

After formation:

- **New posts from members**: Go to community space by default
- **Cross-posting**: Members can still post in parent space
- **New members**: Users who start interacting primarily with community join naturally
- **Leaving**: Interaction patterns shifting outward can trigger departure

### 5.3 Dissolution / Merging

If a community's interaction patterns change significantly:

```rust
pub struct CommunityDissolution {
    pub community_id: [u8; 32],
    pub reason: DissolutionReason,
    pub merge_target: Option<[u8; 32]>, // Space to merge back into
    pub dissolution_height: u64,
}

pub enum DissolutionReason {
    /// Members now interact more with parent space
    ReintegratedWithParent,

    /// Community became inactive (decay)
    Inactive,

    /// Merged with another community
    MergedWith([u8; 32]),
}
```

---

## 6. Special Cases

### 6.1 Single-Participant Clusters (Spam)

When cluster_size == 1:

```rust
pub fn handle_single_participant_cluster(
    chain: &mut ChainStore,
    cluster: &DetectedCluster,
) -> Result<(), Error> {
    // Still forms a "community" but with different properties
    let formation = CommunityFormation {
        community_id: derive_spam_community_id(&cluster.members[0]),
        parent_space_id: cluster.space_id,
        new_space_id: derive_spam_space_id(&cluster),
        founding_members: cluster.members.clone(),
        migrated_content: cluster.content_ids.clone(),
        metrics: cluster.metrics.clone(),
        formation_height: cluster.detected_at,
    };

    // Space is created but:
    // - Not featured in discovery
    // - Not recommended to users
    // - Still accessible if directly navigated
    execute_community_formation(chain, &formation)?;

    Ok(())
}
```

The spammer ends up with:
- Their own space (they "won")
- No visitors (no one discovers it)
- Content decays normally (no engagement from others)
- All their work resulted in talking to themselves

### 6.2 Overlapping Communities

When a user belongs to multiple tight-knit groups:

```rust
pub fn handle_overlapping_membership(
    user: &[u8; 32],
    communities: &[CommunityFormation],
) -> MembershipResolution {
    // User's content goes to the community where they have
    // the highest interaction ratio
    let primary = communities
        .iter()
        .max_by_key(|c| compute_user_affinity(user, c))
        .unwrap();

    MembershipResolution {
        primary_community: primary.community_id,
        secondary_communities: communities
            .iter()
            .filter(|c| c.community_id != primary.community_id)
            .map(|c| c.community_id)
            .collect(),
    }
}
```

### 6.3 Preventing Gaming

To prevent intentional community formation for benefits:

1. **No benefits for small communities**: Communities < 10 members get no special treatment
2. **Minimum activity threshold**: Must have sustained interaction, not burst
3. **Cooldown period**: Can't rapidly form/dissolve communities

```rust
pub const MIN_COMMUNITY_SIZE_FOR_BENEFITS: usize = 10;
pub const MIN_ACTIVITY_PERIODS: u32 = 4; // ~4 weeks of interaction
pub const FORMATION_COOLDOWN_BLOCKS: u64 = 40320; // ~14 days
```

---

## 7. Network Messages

### 7.1 New Message Types

```rust
/// Announce detected community (pre-consensus)
pub const MSG_COMMUNITY_DETECTED: u8 = 0x40;

/// Request community formation status
pub const MSG_GET_COMMUNITY_STATUS: u8 = 0x41;

/// Response with community formation status
pub const MSG_COMMUNITY_STATUS: u8 = 0x42;
```

### 7.2 Payloads

```rust
pub struct CommunityDetectedPayload {
    pub space_id: [u8; 32],
    pub cluster_members: Vec<[u8; 32]>,
    pub metrics: ClusterMetrics,
    pub detected_at_height: u64,
}

pub struct GetCommunityStatusPayload {
    pub community_id: [u8; 32],
}

pub struct CommunityStatusPayload {
    pub community_id: [u8; 32],
    pub status: CommunityStatus,
    pub formation: Option<CommunityFormation>,
}

pub enum CommunityStatus {
    NotDetected,
    Detected { height: u64 },
    Forming { expected_height: u64 },
    Formed { formation_height: u64 },
    Dissolved { dissolution_height: u64 },
}
```

---

## 8. Storage

### 8.1 Principle: No Separate Graph Storage

Interaction data already exists on chain. Metrics are computed from existing chain data during block processing. No separate graph database needed.

**What's already tracked:**
- Actions (posts, replies, engagements) → who interacted with whom
- Content blocks → who authored what
- Space membership → which space each action belongs to

**Added only for community formation:**

```rust
/// Community formation records (created when community forms)
/// Key: community_id[32]
/// Value: CommunityFormation
pub const TREE_COMMUNITIES: &str = "communities";

/// Mapping of identities to their primary community
/// Key: space_id[32] || identity[32]
/// Value: community_id[32]
pub const TREE_IDENTITY_COMMUNITY: &str = "identity_community";

/// Communities by parent space (for discovery)
/// Key: parent_space_id[32] || community_id[32]
/// Value: formation_height[8]
pub const TREE_SPACE_COMMUNITIES: &str = "space_communities";
```

### 8.2 Metric Computation

Metrics are computed on-demand from existing chain data:

```rust
/// Compute interaction count between two identities in a space
fn get_interaction_count(
    chain: &ChainStore,
    space_id: &[u8; 32],
    from: &[u8; 32],
    to: &[u8; 32],
) -> u64 {
    // Query existing action indexes
    chain.count_actions_where(|action| {
        action.space_id == *space_id
            && action.author == *from
            && action.target_author() == Some(*to)
            && matches!(action.action_type, ActionType::Reply | ActionType::Engage)
    })
}
```

This is O(actions in space) but only runs when threshold checking is needed, not on every block.

---

## 9. Client Integration

### 9.1 Discovery

Clients should show organic communities as discoverable subcommunities:

```
Space: /tech
├── Main discussions
├── Subcommunities (organic):
│   ├── /tech/rust-enthusiasts (formed 2 weeks ago, 15 members)
│   ├── /tech/ml-research (formed 1 month ago, 42 members)
│   └── /tech/embedded-systems (formed 3 days ago, 8 members)
```

### 9.2 Notifications

When a user's community forms:

```
"Your discussions with @alice and @bob have grown into their own community!
You're now part of /tech/rust-enthusiasts. Your existing conversations
have been organized there."

[View Community] [Continue in /tech]
```

### 9.3 Spam Handling

When a single-user "community" forms, no notification. The user simply finds their content is now in an obscure space that no one visits.

---

## 10. Security Considerations

### 10.1 Sybil Resistance

Creating fake communities requires:
- Multiple aged identities (7+ days each per SPEC_09)
- Sustained interaction patterns (7+ days)
- Actual PoW for all interactions

Cost scales linearly with community size.

### 10.2 Metric Manipulation

Attempting to avoid community formation by artificially boosting external_interaction:
- Requires engaging with content outside the cluster
- This genuine engagement benefits the network
- "Attack" becomes contribution

### 10.3 Targeted Community Formation

Attempting to force someone else into a community:
- Requires that target's content has low external engagement
- If target has genuine external engagement, metrics won't trigger
- Can't force formation without target's interaction patterns cooperating

---

## 11. Implementation Phases

### Phase 1: Detection Only
- Implement interaction graph
- Implement cluster detection
- Log detected communities (no formation)
- Validate metrics are stable and accurate

### Phase 2: Manual Formation
- Add RPC for manual community formation
- Test formation/migration mechanics
- Validate consensus across nodes

### Phase 3: Automatic Formation
- Enable automatic detection and formation
- Monitor for edge cases
- Tune thresholds based on real data

### Phase 4: Full Lifecycle
- Implement dissolution/merging
- Implement cross-community features
- Production deployment

---

## 12. Open Questions

1. **Naming**: How are organic communities named? User-chosen? Auto-generated?
2. **Governance**: Do communities have any special governance rights?
3. **Cross-community content**: Can content exist in multiple communities?
4. **Formation voting**: Should community members approve formation?
5. **Threshold tuning**: How do we adjust thresholds based on network growth?

---

## Appendix A: Thesis Statement

### Thesis 9: Organic Boundaries Over Imposed Moderation (Score: TBD)

**Statement:** "Algorithmic community detection based on interaction patterns provides content organization and spam isolation without requiring human moderators or central authority. By recognizing natural social boundaries and giving tight-knit groups their own spaces, the network achieves moderation outcomes through structure rather than judgment—turning the spammer's self-referential behavior into self-imposed exile while rewarding genuine communities with autonomy."

**Argument Outline:**

1. **Natural Boundaries Exist**: Social networks naturally form clusters. Users gravitate toward like-minded others. These boundaries are observable in interaction data without subjective judgment.

2. **Structure Over Judgment**: Traditional moderation asks "is this content bad?" Organic branching asks "who interacts with whom?" The latter is objective and computable; the former requires authority.

3. **Spam Self-Selects**: A spammer creating self-referential content triggers community formation with population: 1. They're not banned—they got exactly what they built. The system didn't judge their content; it observed their isolation.

4. **Legitimate Communities Benefit**: Tight-knit groups get autonomy, reduced noise from unrelated content, and natural organization. Community formation is recognition, not punishment.

**Counterarguments:**

- Detection thresholds may incorrectly split legitimate discussions
- Communities might form echo chambers more easily
- Sophisticated spammers could game metrics by minimal external interaction
- New users might feel excluded from established community spaces

**Evidence Needed:**

- Social network analysis research on community detection accuracy
- Case studies of organic community formation in existing platforms
- Simulation of spam patterns and detection effectiveness
- User research on community formation experience

**Key Question:** Can purely structural/algorithmic community detection achieve moderation outcomes that traditionally require human judgment?

---

## 13. Critical Review: Scalability & Practicality

This section documents identified issues and proposed mitigations from critical review.

### 13.1 Issue: Threshold Arbitrariness

**Problem:** Magic numbers with no empirical basis.

**Mitigation: Conservative Defaults + Observability**

```rust
/// Start with conservative thresholds (harder to trigger)
pub const MIN_ENGAGEMENT_DIVERSITY: f64 = 0.15;  // Very tight-knit only
pub const MAX_EXTERNAL_INTERACTION: f64 = 0.10;  // Very insular only
pub const MIN_INTERNAL_COHESION: f64 = 0.90;     // Very cohesive only

/// Minimum interactions before detection eligible
pub const MIN_INTERACTIONS_FOR_DETECTION: u64 = 100;

/// Log near-threshold clusters for tuning (don't act on them)
pub const OBSERVATION_MODE_ENABLED: bool = true;
```

Phase 1 runs in observation mode. Collect data before enabling automatic formation.

### 13.2 Issue: Content Migration Complexity

**Problem:** Thread integrity when cluster splits.

**Mitigation: Only Route New Posts, Not Replies**

```rust
/// When community member creates content:
fn route_new_content(author: &Identity, action: &Action) -> SpaceId {
    match action.action_type {
        // NEW POSTS: route to community space
        ActionType::Post => {
            if let Some(community) = get_author_community(author) {
                community.space_id
            } else {
                action.target_space_id
            }
        }
        // REPLIES: stay with parent thread (wherever it is)
        ActionType::Reply => {
            get_thread_space(action.parent_content_id)
        }
        // ENGAGEMENTS: go to target content's space
        ActionType::Engage => {
            get_content_space(action.target_content_id)
        }
    }
}
```

**Result:**
- New posts from community members → community space
- Replies → stay with parent thread (parent-anchored, as per SPEC_08)
- Thread integrity preserved
- Members can still reply anywhere, but new threads start in their community

### 13.3 Issue: Gaming via Minimal External Interaction

**Problem:** Easy to add fake external interaction to avoid detection.

**Mitigation: Interaction Quality Weighting**

```rust
/// Weight interactions by reciprocity
fn interaction_weight(from: Identity, to: Identity) -> f64 {
    let a_to_b = edge_weight(from, to);
    let b_to_a = edge_weight(to, from);

    // Reciprocal interactions count more
    let reciprocity = min(a_to_b, b_to_a) as f64 / max(a_to_b, b_to_a) as f64;

    // One-way spam interactions count less
    base_weight * (0.5 + 0.5 * reciprocity)
}
```

Spamming external content with non-reciprocal engagement counts for less.

### 13.4 Issue: Discovery Spam

**Problem:** Many single-person "communities" flood discovery.

**Mitigation: Tiered Discovery**

```rust
pub enum DiscoveryTier {
    /// Featured: 10+ members, 30+ days active
    Featured,

    /// Listed: 3+ members, 7+ days active
    Listed,

    /// Unlisted: Single-participant or new
    /// Accessible by direct link only
    Unlisted,
}

fn get_discovery_tier(community: &Community) -> DiscoveryTier {
    if community.member_count >= 10 && community.age_days >= 30 {
        DiscoveryTier::Featured
    } else if community.member_count >= 3 && community.age_days >= 7 {
        DiscoveryTier::Listed
    } else {
        DiscoveryTier::Unlisted
    }
}
```

Single-participant clusters exist but aren't discoverable.

### 13.5 Issue: Dissolution Underspecified

**Problem:** Communities form but dissolution mechanics unclear.

**Mitigation: Clear Dissolution Triggers**

```rust
pub const DISSOLUTION_INACTIVITY_DAYS: u64 = 90;
pub const DISSOLUTION_REINTEGRATION_THRESHOLD: f64 = 0.5;
pub const DISSOLUTION_MIN_EXTERNAL_RATIO: f64 = 0.4;

fn check_dissolution(community: &Community) -> Option<DissolutionReason> {
    let metrics = compute_current_metrics(community);

    // Inactive: no posts in 90 days
    if metrics.last_activity_age_days > DISSOLUTION_INACTIVITY_DAYS {
        return Some(DissolutionReason::Inactive);
    }

    // Reintegrated: now interacting mostly with parent space
    if metrics.external_interaction > DISSOLUTION_MIN_EXTERNAL_RATIO {
        return Some(DissolutionReason::ReintegratedWithParent);
    }

    None
}

/// On dissolution: community space becomes "archived"
/// - No new posts accepted
/// - Existing content remains accessible
/// - Members' new posts go to parent space
```

---

## 13.6 Summary: Simplified Approach

Based on critical review, the final approach:

```
ORGANIC BRANCHING - INCREMENTAL MODEL
═══════════════════════════════════════════════════════════════════════

1. NO SEPARATE GRAPH
   └── Use existing chain data, metrics updated during block processing

2. INCREMENTAL UPDATES
   └── Each action updates metrics; check thresholds on each interaction

3. CONSERVATIVE THRESHOLDS
   └── Start tight (0.15/0.10/0.90), tune based on real data

4. NO CONTENT MIGRATION
   └── Existing content stays; only NEW posts route to community space

5. TIERED DISCOVERY
   └── Spam clusters unlisted; legitimate communities discoverable

6. OBSERVATION MODE FIRST
   └── Log detections without acting; validate before enabling
```

**Key insight:** This is just another chain computation, like PoW aggregation or decay.
No special infrastructure needed—metrics emerge from normal block processing.

---

*Document created: January 2026*
*Status: Draft - pending implementation and testing*
*Critical review: January 2026 - see Section 13*
