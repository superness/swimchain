//! Integration tests for SPEC_13 behavioral branching (Phase A).
//!
//! Synthetic, deterministic interaction graphs exercising:
//! - Loud consolidated cluster -> detection -> cluster-membership fracture
//! - Popular-but-diverse activity -> no trigger (loud != insular)
//! - Single-identity spam cluster -> spam signal, no community
//! - Age gate: same cluster before MIN_PATTERN_AGE_BLOCKS -> no trigger
//! - Determinism: same data -> identical formation decision

use std::collections::BTreeSet;

use swimchain::blocks::{Action, ActionType, BranchDirection, BranchPath, ContentBlock};
use swimchain::branch::behavioral::MIN_PATTERN_AGE_BLOCKS;
use swimchain::branch::{
    BranchAwareStore, BranchManager, ClusterOutcome, ClusteringAction, ClusteringMode,
};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

const SPACE: [u8; 32] = [9u8; 32];

/// Height at which all synthetic activity is seeded.
const SEED_HEIGHT: u64 = 0;
/// Height comfortably past the pattern-age gate.
const AGED_HEIGHT: u64 = MIN_PATTERN_AGE_BLOCKS + 5000;

fn id(n: u8) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[0] = n;
    out[31] = n;
    out
}

/// Thread root hash: distinct per (tag, n), with a controllable first bit so
/// hash-based routing in tests is predictable.
fn thread_id(tag: u8, n: u8, first_bit_one: bool) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[0] = if first_bit_one { 0x80 } else { 0x00 };
    out[1] = tag;
    out[2] = n;
    out
}

fn post_action(author: [u8; 32], content_hash: [u8; 32], timestamp: u64) -> Action {
    Action {
        action_type: ActionType::Post,
        actor: author,
        timestamp,
        content_hash: Some(content_hash),
        parent_id: None,
        pow_nonce: 1,
        pow_work: 10,
        pow_target: [0xFFu8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    }
}

/// Seed a thread through the branch-aware store so both the branch index and
/// the content metadata index (thread author lookup) are populated.
fn seed_thread(store: &ChainStore, thread_root_id: [u8; 32], author: [u8; 32], timestamp: u64) {
    let block = ContentBlock {
        thread_root_id,
        space_id: SPACE,
        actions: vec![post_action(author, thread_root_id, timestamp)],
        merkle_root: [0u8; 32],
        prev_content_hash: None,
        timestamp,
        total_pow: 10,
        branch_path: BranchPath::root(),
        space_metadata: None,
    };
    BranchAwareStore::new(store)
        .put_content_block(block)
        .unwrap();
}

fn reply(
    manager: &BranchManager,
    author: [u8; 32],
    parent_author: [u8; 32],
    height: u64,
) -> ClusterOutcome {
    manager
        .process_action_for_clustering(
            &SPACE,
            &ClusteringAction::Reply {
                author,
                parent_author,
            },
            height,
            1_000_000 + height,
        )
        .unwrap()
}

fn reply_with_mode(
    manager: &BranchManager,
    author: [u8; 32],
    parent_author: [u8; 32],
    height: u64,
    mode: ClusteringMode,
) -> ClusterOutcome {
    manager
        .process_action_for_clustering_with_mode(
            &SPACE,
            &ClusteringAction::Reply {
                author,
                parent_author,
            },
            height,
            1_000_000 + height,
            mode,
        )
        .unwrap()
}

/// Build the "loud consolidated cluster" fixture: 5 members with 120 internal
/// interactions (>= 90% of their activity), a handful of external touches,
/// all seeded at SEED_HEIGHT so the pattern is aged by AGED_HEIGHT.
///
/// Members: id(1)..id(5). Outsider authors: id(101)..id(103) plus thread-only
/// outsiders id(111)..id(116).
fn seed_loud_cluster(store: &ChainStore) -> (Vec<[u8; 32]>, Vec<[u8; 32]>, Vec<[u8; 32]>) {
    let members: Vec<[u8; 32]> = (1..=5).map(id).collect();
    let outsiders: Vec<[u8; 32]> = (101..=103).map(id).collect();

    // One thread per member (first bit varies to show hash bits are ignored
    // by cluster-membership assignment).
    let member_threads: Vec<[u8; 32]> = (0..5).map(|i| thread_id(1, i as u8, i % 2 == 0)).collect();
    for (i, t) in member_threads.iter().enumerate() {
        seed_thread(store, *t, members[i], 1000 + i as u64);
    }

    // Six outsider threads in the same busy space.
    let outsider_threads: Vec<[u8; 32]> =
        (0..6).map(|i| thread_id(2, i as u8, i % 2 == 1)).collect();
    for (i, t) in outsider_threads.iter().enumerate() {
        seed_thread(store, *t, id(111 + i as u8), 2000 + i as u64);
    }

    let manager = BranchManager::new(store);

    // 120 internal interactions: each ordered member pair, 6 replies.
    for a in &members {
        for b in &members {
            if a == b {
                continue;
            }
            for _ in 0..6 {
                let outcome = reply(&manager, *a, *b, SEED_HEIGHT);
                assert_eq!(
                    outcome,
                    ClusterOutcome::None,
                    "nothing may form during un-aged seeding"
                );
            }
        }
    }

    // Light external activity: each member replies once to an outsider
    // (5 outgoing external; cohesion 120/125 = 0.96), and each of the three
    // outsiders replies once to a member (3 incoming external; external
    // ratio 3/123 ~ 0.024, diversity 8/123 ~ 0.065).
    for (i, m) in members.iter().enumerate() {
        reply(&manager, *m, outsiders[i % outsiders.len()], SEED_HEIGHT);
    }
    for (i, o) in outsiders.iter().enumerate() {
        reply(&manager, *o, members[i], SEED_HEIGHT);
    }

    (members, member_threads, outsider_threads)
}

// ============================================================================
// 1. Loud consolidated cluster -> detection -> membership fracture
// ============================================================================

#[test]
fn loud_cluster_forms_community_and_fractures_by_membership() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let (members, member_threads, outsider_threads) = seed_loud_cluster(&store);
    let manager = BranchManager::new(&store);

    // The trigger: one more internal interaction, now past the age gate.
    let outcome = reply(&manager, members[0], members[1], AGED_HEIGHT);

    let formation = match outcome {
        ClusterOutcome::Community(f) => f,
        other => panic!("expected community formation, got {:?}", other),
    };

    // Founding members are exactly the cluster, sorted.
    let expected: BTreeSet<[u8; 32]> = members.iter().copied().collect();
    let actual: BTreeSet<[u8; 32]> = formation.founding_members.iter().copied().collect();
    assert_eq!(actual, expected);
    assert_eq!(formation.founding_members.len(), 5);
    assert!(formation.metrics.engagement_diversity < 0.30);
    assert!(formation.metrics.external_interaction < 0.20);
    assert!(formation.metrics.internal_cohesion > 0.80);
    assert!(formation.metrics.age_blocks >= MIN_PATTERN_AGE_BLOCKS);

    // The fracture: community child is root.Right, remainder root.Left.
    let community_branch = formation.community_branch.clone().expect("branch assigned");
    assert_eq!(
        community_branch,
        BranchPath::root().branch(BranchDirection::Right)
    );
    let remainder_branch = BranchPath::root().branch(BranchDirection::Left);

    let state = store.get_space_branch_state(&SPACE).unwrap().unwrap();
    assert_eq!(state.max_depth, 1);
    assert_eq!(state.active_branches.len(), 2);

    // Exactly the cluster's threads went to the community branch...
    let community_threads: BTreeSet<[u8; 32]> = store
        .get_threads_in_branch(&SPACE, &community_branch)
        .unwrap()
        .into_iter()
        .map(|(t, _)| t)
        .collect();
    assert_eq!(
        community_threads,
        member_threads.iter().copied().collect::<BTreeSet<_>>()
    );

    // ...and everything else went to the remainder.
    let remainder_threads: BTreeSet<[u8; 32]> = store
        .get_threads_in_branch(&SPACE, &remainder_branch)
        .unwrap()
        .into_iter()
        .map(|(t, _)| t)
        .collect();
    assert_eq!(
        remainder_threads,
        outsider_threads.iter().copied().collect::<BTreeSet<_>>()
    );

    // Per-thread branch lookups agree.
    for t in &member_threads {
        assert_eq!(
            manager.get_thread_branch(&SPACE, t).unwrap(),
            community_branch
        );
    }
    for t in &outsider_threads {
        assert_eq!(
            manager.get_thread_branch(&SPACE, t).unwrap(),
            remainder_branch
        );
    }

    // Formation is recorded and members mapped to the community.
    let recorded = store
        .get_community_formation(&formation.community_id)
        .unwrap()
        .expect("formation recorded");
    assert_eq!(recorded, formation);
    for m in &members {
        assert_eq!(
            store.get_identity_community(&SPACE, m).unwrap(),
            Some(formation.community_id)
        );
    }
    assert_eq!(store.get_space_communities(&SPACE).unwrap().len(), 1);
    assert_eq!(
        store
            .get_community_for_branch(&SPACE, &community_branch)
            .unwrap(),
        Some(formation.community_id)
    );

    // No re-fire: further internal interaction does not form again.
    let again = reply(&manager, members[1], members[2], AGED_HEIGHT + 10);
    assert_eq!(again, ClusterOutcome::None);

    // Routing after formation (SPEC_13 §13.2): a member's NEW thread goes to
    // the community branch even though its hash bit points left...
    let member_new_thread = thread_id(3, 0, false); // bit 0 = 0 (left by hash)
    seed_thread(&store, member_new_thread, members[2], 5000);
    assert_eq!(
        manager
            .get_thread_branch(&SPACE, &member_new_thread)
            .unwrap(),
        community_branch
    );

    // ...and an outsider's new thread is redirected OUT of the community
    // subtree even though its hash bit points right.
    let outsider_new_thread = thread_id(3, 1, true); // bit 0 = 1 (right by hash)
    seed_thread(&store, outsider_new_thread, id(120), 5001);
    assert_eq!(
        manager
            .get_thread_branch(&SPACE, &outsider_new_thread)
            .unwrap(),
        remainder_branch
    );
}

// ============================================================================
// 1b. Log-only mode (Phase 1 rollout): same insular cluster records a
//     BehavioralEvent instead of fracturing -- no space/branch is created.
// ============================================================================

#[test]
fn loud_cluster_in_log_only_mode_records_event_and_does_not_fracture() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let (members, _member_threads, _outsider_threads) = seed_loud_cluster(&store);
    let manager = BranchManager::new(&store);

    // Same trigger as the full-mode test, but processed in LogOnly mode.
    let outcome = reply_with_mode(
        &manager,
        members[0],
        members[1],
        AGED_HEIGHT,
        ClusteringMode::LogOnly,
    );

    let formation = match outcome {
        ClusterOutcome::Community(f) => f,
        other => panic!("expected community detection, got {:?}", other),
    };
    // Detection still classifies a real community -- the branch is simply
    // never realized because the caller chose LogOnly.
    assert_eq!(formation.founding_members.len(), 5);
    assert!(formation.community_branch.is_none());

    // No space/branch was created: the space never fractured...
    let state = store.get_space_branch_state(&SPACE).unwrap().unwrap();
    assert_eq!(state.max_depth, 0, "log-only mode must not fracture");
    // ...and no CommunityFormation or identity->community mapping exists.
    assert!(store.get_space_communities(&SPACE).unwrap().is_empty());
    for m in &members {
        assert!(store.get_identity_community(&SPACE, m).unwrap().is_none());
    }

    // The would-be formation IS persisted as a BehavioralEvent, queryable by
    // space and globally.
    let expected_members: BTreeSet<[u8; 32]> = members.iter().copied().collect();
    let space_events = store.get_space_behavioral_events(&SPACE).unwrap();
    assert_eq!(space_events.len(), 1);
    let event = &space_events[0];
    assert_eq!(event.parent_space_id, SPACE);
    let actual_members: BTreeSet<[u8; 32]> = event.cluster_members.iter().copied().collect();
    assert_eq!(actual_members, expected_members);
    assert_eq!(event.detected_height, AGED_HEIGHT);
    assert!(event.metrics.engagement_diversity < 0.30);
    assert!(event.metrics.external_interaction < 0.20);
    assert!(event.metrics.internal_cohesion > 0.80);

    let all_events = store.get_all_behavioral_events().unwrap();
    assert_eq!(all_events.len(), 1);
    assert_eq!(all_events[0], *event);

    let by_id = store.get_behavioral_event(&event.event_id).unwrap();
    assert_eq!(by_id.as_ref(), Some(event));

    // Cooldown still applies in log-only mode: another qualifying action soon
    // after does not produce a second event flood.
    let again = reply_with_mode(
        &manager,
        members[1],
        members[2],
        AGED_HEIGHT + 10,
        ClusteringMode::LogOnly,
    );
    assert_eq!(again, ClusterOutcome::None);
    assert_eq!(store.get_space_behavioral_events(&SPACE).unwrap().len(), 1);
}

// ============================================================================
// 2. Popular-but-diverse -> no trigger (the "loud != insular" case)
// ============================================================================

#[test]
fn popular_but_diverse_cluster_does_not_trigger() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let manager = BranchManager::new(&store);

    let members: Vec<[u8; 32]> = (1..=5).map(id).collect();
    for (i, m) in members.iter().enumerate() {
        seed_thread(&store, thread_id(1, i as u8, false), *m, 1000 + i as u64);
    }

    // Same internal volume as the loud cluster: 120 internal interactions.
    for a in &members {
        for b in &members {
            if a == b {
                continue;
            }
            for _ in 0..6 {
                reply(&manager, *a, *b, SEED_HEIGHT);
            }
        }
    }

    // But this group is genuinely popular AND outward-facing:
    // 65 distinct outsiders engage the members (external received = 65,
    // unique engagers = 70 -> diversity 70/185 ~ 0.38 fails the gate;
    // external 65/185 ~ 0.35 fails the gate)...
    for i in 0..65u8 {
        let outsider = id(120 + (i % 100));
        // distinct identities: offset avoids collisions with members
        let outsider = {
            let mut o = outsider;
            o[1] = i; // ensure all 65 are unique
            o
        };
        reply(&manager, outsider, members[(i % 5) as usize], SEED_HEIGHT);
    }

    // ...and members engage outward too (30 outgoing external, kept at 2 per
    // edge so no outsider joins the BFS cluster; cohesion 120/150 = 0.80
    // fails the strict > 0.80 gate).
    for i in 0..15u8 {
        let target = {
            let mut t = id(200);
            t[1] = i;
            t
        };
        let m = members[(i % 5) as usize];
        reply(&manager, m, target, SEED_HEIGHT);
        reply(&manager, m, target, SEED_HEIGHT);
    }

    // Aged trigger attempt: still no formation.
    let outcome = reply(&manager, members[0], members[1], AGED_HEIGHT);
    assert_eq!(outcome, ClusterOutcome::None);

    // No community state was written; the space never fractured.
    assert!(store.get_space_communities(&SPACE).unwrap().is_empty());
    for m in &members {
        assert!(store.get_identity_community(&SPACE, m).unwrap().is_none());
    }
    let state = store.get_space_branch_state(&SPACE).unwrap().unwrap();
    assert_eq!(state.max_depth, 0, "space must not have fractured");
}

// ============================================================================
// 3. One-identity spam cluster -> spam signal, no community
// ============================================================================

#[test]
fn single_identity_spam_cluster_emits_signal_not_community() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let manager = BranchManager::new(&store);

    let spammer = id(42);
    seed_thread(&store, thread_id(1, 0, false), spammer, 1000);

    // 120 self-replies: a perfectly insular community of one.
    for _ in 0..120 {
        let outcome = reply(&manager, spammer, spammer, SEED_HEIGHT);
        assert_eq!(outcome, ClusterOutcome::None, "age gate holds at height 0");
    }

    // Aged: crossing the gates as a singleton produces a spam signal (§6.1).
    let outcome = reply(&manager, spammer, spammer, AGED_HEIGHT);
    let signal = match outcome {
        ClusterOutcome::SpamSignal(s) => s,
        other => panic!("expected spam signal, got {:?}", other),
    };
    assert_eq!(signal.identity, spammer);
    assert_eq!(signal.space_id, SPACE);
    assert_eq!(signal.metrics.member_count, 1);
    assert!(signal.metrics.internal_cohesion > 0.80);
    assert!(signal.metrics.external_interaction < 0.20);

    // Signal is surfaced for the spam/space-health side...
    let stored = store
        .get_spam_cluster_signal(&SPACE, &spammer)
        .unwrap()
        .expect("signal recorded");
    assert_eq!(stored, signal);
    assert_eq!(store.get_spam_cluster_signals(&SPACE).unwrap().len(), 1);

    // ...but NO community formed and the space did not fracture.
    assert!(store.get_space_communities(&SPACE).unwrap().is_empty());
    assert!(store
        .get_identity_community(&SPACE, &spammer)
        .unwrap()
        .is_none());
    let state = store.get_space_branch_state(&SPACE).unwrap().unwrap();
    assert_eq!(state.max_depth, 0);
}

// ============================================================================
// 4. Age gate: same cluster before MIN_PATTERN_AGE_BLOCKS -> no trigger
// ============================================================================

#[test]
fn age_gate_blocks_young_cluster() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let (members, _, _) = seed_loud_cluster(&store);
    let manager = BranchManager::new(&store);

    // Identical cluster, but the pattern is one block too young.
    let young_height = MIN_PATTERN_AGE_BLOCKS - 1;
    let outcome = reply(&manager, members[0], members[1], young_height);
    assert_eq!(outcome, ClusterOutcome::None);
    assert!(store.get_space_communities(&SPACE).unwrap().is_empty());
    let state = store.get_space_branch_state(&SPACE).unwrap().unwrap();
    assert_eq!(state.max_depth, 0);

    // Exactly at the gate it forms — proving age was the only blocker.
    let outcome = reply(&manager, members[0], members[1], MIN_PATTERN_AGE_BLOCKS);
    assert!(matches!(outcome, ClusterOutcome::Community(_)));
}

// ============================================================================
// 5. Determinism: same chain data -> identical formation decision
// ============================================================================

#[test]
fn same_data_produces_identical_formation() {
    let run = || {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let (members, _, _) = seed_loud_cluster(&store);
        let manager = BranchManager::new(&store);
        match reply(&manager, members[0], members[1], AGED_HEIGHT) {
            ClusterOutcome::Community(f) => f,
            other => panic!("expected community, got {:?}", other),
        }
    };

    let first = run();
    let second = run();

    assert_eq!(first.community_id, second.community_id);
    assert_eq!(first.founding_members, second.founding_members);
    assert_eq!(first.parent_space_id, second.parent_space_id);
    assert_eq!(first.formation_height, second.formation_height);
    assert_eq!(first.community_branch, second.community_branch);
    assert_eq!(
        first.metrics.engagement_diversity,
        second.metrics.engagement_diversity
    );
    assert_eq!(
        first.metrics.external_interaction,
        second.metrics.external_interaction
    );
    assert_eq!(
        first.metrics.internal_cohesion,
        second.metrics.internal_cohesion
    );
    assert_eq!(first.metrics.age_blocks, second.metrics.age_blocks);
}
