//! Flow 4: Decay and Pruning
//!
//! Tests the content decay and pruning lifecycle:
//!
//! 1. Content is created with various ages and engagement patterns
//! 2. Decay states are calculated based on half-life model
//! 3. Decayed content is pruned (deleted or tombstoned)
//! 4. Thread coherence is maintained via tombstones
//!
//! Per SPEC_02 (Content & Decay):
//! - DECAY_FLOOR_SECS = 172,800 (48 hours)
//! - HALF_LIFE_SECS = 604,800 (7 days)
//! - DECAY_THRESHOLD = 0.0625 (6.25%)

use std::time::{Duration, Instant};

use swimchain::content::{
    calculate_decay_state, prune_decayed_content, ContentStore, InMemoryContentStore,
};
use swimchain::types::constants::{DECAY_FLOOR_SECS, DECAY_THRESHOLD, HALF_LIFE_SECS};
use swimchain::types::content::{ContentId, ContentItem, ContentType, SpaceId};
use swimchain::types::identity::{IdentityId, Signature};

use super::timing::TimingCollector;

/// Create a test content item with specified age and engagement
fn make_test_content(
    id: [u8; 32],
    parent: Option<ContentId>,
    created_at_ms: u64,
    last_engagement_ms: u64,
) -> ContentItem {
    ContentItem {
        content_id: ContentId::from_bytes(id),
        author_id: IdentityId::from_bytes([1u8; 32]),
        content_type: ContentType::Post,
        space_id: SpaceId::from_bytes([2u8; 32]),
        parent_id: parent,
        created_at: created_at_ms,
        last_engagement: last_engagement_ms,
        body_inline: Some("Test content for decay".to_string()),
        content_hash: None,
        content_size: None,
        content_type_mime: None,
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature: Signature::from_bytes([0u8; 64]),
        pow_nonce: 0,
        pow_difficulty: 0,
        preservation_pow: None,
        display_name: None,
    }
}

/// Test: Decay floor protection (48h)
#[test]
fn test_flow4_decay_floor_protection() {
    let mut timing = TimingCollector::new();

    // Use fixed "current time" for reproducibility: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Content created 1 day ago (within 48h floor)
    let created_1_day_ago = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let content = make_test_content([1u8; 32], None, created_1_day_ago, created_1_day_ago);

    let calc_start = Instant::now();
    let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);
    timing.record("decay_calculation", calc_start.elapsed());

    // Assert floor protection
    assert!(state.is_protected, "Content <48h old should be protected");
    assert!(!state.is_decayed, "Protected content should not be decayed");
    assert_eq!(
        state.survival_probability, 1.0,
        "Protected content has 100% survival"
    );
    assert_eq!(
        state.half_lives_elapsed, 0.0,
        "No half-lives elapsed for protected content"
    );

    println!("Flow 4a - Decay Floor Protection:\n{}", timing.summary());
    println!(
        "  Age: {} seconds (< {} floor)",
        state.age_seconds, DECAY_FLOOR_SECS
    );
    println!("  Protected: {}", state.is_protected);
    println!("  Survival: {:.2}%", state.survival_probability * 100.0);
}

/// Test: Decay after floor period
#[test]
fn test_flow4_decay_after_floor() {
    let mut timing = TimingCollector::new();

    // Current time: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Content created 32 days ago, no engagement since
    // Per SPEC_02: effective_decay_time = 32 - 2 = 30 days
    // half_lives = 30 / 7 ≈ 4.286
    // survival = 0.5^4.286 ≈ 0.051 < 0.0625 (DECAYED)
    let created_32_days_ago = (current_time_secs - 32 * 24 * 60 * 60) * 1000;
    let content = make_test_content([1u8; 32], None, created_32_days_ago, created_32_days_ago);

    let calc_start = Instant::now();
    let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);
    timing.record("decay_calculation", calc_start.elapsed());

    // Assert decayed
    assert!(!state.is_protected, "Old content should not be protected");
    assert!(state.is_decayed, "32-day old content should be decayed");
    assert!(
        state.survival_probability < DECAY_THRESHOLD,
        "Survival {} should be < {}",
        state.survival_probability,
        DECAY_THRESHOLD
    );

    // Check half-lives calculation
    // effective_decay = 30 days = 30 * 24 * 60 * 60 = 2,592,000 seconds
    // half_lives = 2,592,000 / 604,800 ≈ 4.286
    let expected_half_lives = (30.0 * 24.0 * 60.0 * 60.0) / HALF_LIFE_SECS as f64;
    assert!(
        (state.half_lives_elapsed - expected_half_lives).abs() < 0.01,
        "Half-lives {} should be ≈ {}",
        state.half_lives_elapsed,
        expected_half_lives
    );

    println!("Flow 4b - Decay After Floor:\n{}", timing.summary());
    println!("  Age: {} seconds (32 days)", state.age_seconds);
    println!("  Half-lives elapsed: {:.3}", state.half_lives_elapsed);
    println!("  Survival: {:.3}%", state.survival_probability * 100.0);
    println!("  Is decayed: {}", state.is_decayed);
}

/// Test: Engagement resets decay timer
#[test]
fn test_flow4_engagement_resets_decay() {
    let mut timing = TimingCollector::new();

    // Current time: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Content created 60 days ago, but engaged 1 day ago
    // Time since engagement = 1 day < floor, so protected
    let created_60_days_ago = (current_time_secs - 60 * 24 * 60 * 60) * 1000;
    let engaged_1_day_ago = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let content = make_test_content([1u8; 32], None, created_60_days_ago, engaged_1_day_ago);

    let calc_start = Instant::now();
    let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);
    timing.record("decay_calculation", calc_start.elapsed());

    // Assert not decayed due to recent engagement
    assert!(
        !state.is_decayed,
        "Recently engaged content should not be decayed"
    );
    assert!(
        state.survival_probability > DECAY_THRESHOLD,
        "Survival should be above threshold"
    );

    // Age should be 60 days, but time since engagement only 1 day
    assert_eq!(state.age_seconds, 60 * 24 * 60 * 60);
    assert_eq!(state.time_since_engagement, 1 * 24 * 60 * 60);

    println!("Flow 4c - Engagement Resets Decay:\n{}", timing.summary());
    println!("  Age: {} days", state.age_seconds / 86400);
    println!(
        "  Time since engagement: {} day",
        state.time_since_engagement / 86400
    );
    println!("  Survival: {:.2}%", state.survival_probability * 100.0);
    println!("  Not decayed despite 60-day age");
}

/// Test: Pruning removes decayed content
#[test]
fn test_flow4_prune_decayed_content() {
    let mut timing = TimingCollector::new();

    let mut store = InMemoryContentStore::new();

    // Current time: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Create old decayed content (60 days ago, no engagement)
    let old_time = (current_time_secs - 60 * 24 * 60 * 60) * 1000;
    let old_content = make_test_content([1u8; 32], None, old_time, old_time);
    let old_id = old_content.content_id;
    store.put(old_content).unwrap();

    // Create recent protected content (1 day ago)
    let recent_time = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let recent_content = make_test_content([2u8; 32], None, recent_time, recent_time);
    store.put(recent_content).unwrap();

    assert_eq!(store.len(), 2, "Should have 2 items before prune");

    // Run pruning
    let prune_start = Instant::now();
    let stats = prune_decayed_content(&mut store, current_time_ms, HALF_LIFE_SECS);
    timing.record("prune_operation", prune_start.elapsed());

    // Verify results
    assert_eq!(stats.items_checked, 2);
    assert_eq!(stats.items_pruned, 1, "Should prune 1 decayed item");
    assert_eq!(
        stats.tombstones_created, 0,
        "No children means no tombstone"
    );

    assert_eq!(store.len(), 1, "Should have 1 item after prune");
    assert!(
        store.get(&old_id).is_none(),
        "Old content should be deleted"
    );
    assert!(
        store.get(&ContentId::from_bytes([2u8; 32])).is_some(),
        "Recent content should remain"
    );

    println!("Flow 4d - Prune Decayed Content:\n{}", timing.summary());
    println!("  Items checked: {}", stats.items_checked);
    println!("  Items pruned: {}", stats.items_pruned);
    println!("  Tombstones created: {}", stats.tombstones_created);
}

/// Test: Tombstone creation for parent with active children
#[test]
fn test_flow4_tombstone_for_parent_with_children() {
    let mut timing = TimingCollector::new();

    let mut store = InMemoryContentStore::new();

    // Current time: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Parent: created 60 days ago (decayed)
    let parent_time = (current_time_secs - 60 * 24 * 60 * 60) * 1000;
    let parent = make_test_content([1u8; 32], None, parent_time, parent_time);
    let parent_id = parent.content_id;
    store.put(parent).unwrap();

    // Child: created 1 day ago (protected, within floor)
    let child_time = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let child = make_test_content([2u8; 32], Some(parent_id), child_time, child_time);
    store.put(child).unwrap();

    assert_eq!(store.len(), 2);

    // Run pruning
    let prune_start = Instant::now();
    let stats = prune_decayed_content(&mut store, current_time_ms, HALF_LIFE_SECS);
    timing.record("prune_operation", prune_start.elapsed());

    // Verify parent was tombstoned (not fully deleted)
    assert_eq!(stats.items_pruned, 1);
    assert_eq!(
        stats.tombstones_created, 1,
        "Parent with active child should be tombstoned"
    );

    // Parent content should be gone
    assert!(
        store.get(&parent_id).is_none(),
        "Parent content should be deleted"
    );

    // But tombstone should exist
    let tombstone = store.get_tombstone(&parent_id);
    assert!(tombstone.is_some(), "Tombstone should exist for parent");

    // Child should still be present
    assert_eq!(store.len(), 1, "Child should remain");
    assert!(
        store.get(&ContentId::from_bytes([2u8; 32])).is_some(),
        "Child should remain"
    );

    println!(
        "Flow 4e - Tombstone for Parent with Children:\n{}",
        timing.summary()
    );
    println!("  Parent tombstoned: true");
    println!("  Child preserved: true");
    println!("  Thread coherence maintained");
}

/// Test: Decay calculation performance
#[test]
fn test_flow4_decay_calculation_performance() {
    let mut timing = TimingCollector::new();

    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // Create 100 test items with varying ages
    let items: Vec<ContentItem> = (0..100)
        .map(|i| {
            let age_days = (i % 60) + 1; // Ages 1-60 days
            let created = (current_time_secs - age_days as u64 * 24 * 60 * 60) * 1000;
            make_test_content([i as u8; 32], None, created, created)
        })
        .collect();

    // Calculate decay for all items
    let calc_start = Instant::now();
    let mut decayed_count = 0;
    for item in &items {
        let state = calculate_decay_state(item, current_time_ms, HALF_LIFE_SECS);
        if state.is_decayed {
            decayed_count += 1;
        }
    }
    let elapsed = calc_start.elapsed();
    timing.record("calculate_100_items", elapsed);

    // Performance assertion: <100ms for 100 items
    assert!(
        elapsed < Duration::from_millis(100),
        "100 decay calculations should be <100ms, was {:?}",
        elapsed
    );

    println!("Flow 4f - Decay Performance:\n{}", timing.summary());
    println!("  Items processed: 100");
    println!("  Decayed count: {}", decayed_count);
    println!("  Time per item: {:?}", elapsed / 100);
}

/// Test: Complete decay and prune flow
#[test]
fn test_flow4_complete_decay_prune_flow() {
    let mut timing = TimingCollector::new();
    let flow_start = Instant::now();

    let mut store = InMemoryContentStore::new();

    // Current time: 100 days from epoch
    let current_time_ms: u64 = 100 * 24 * 60 * 60 * 1000;
    let current_time_secs = current_time_ms / 1000;

    // === Create 5 content items with varied ages ===
    let populate_start = Instant::now();

    // 1. old_no_engagement: 60 days ago, no engagement → DECAYED
    let old_no_engagement_time = (current_time_secs - 60 * 24 * 60 * 60) * 1000;
    let old_no_engagement = make_test_content(
        [1u8; 32],
        None,
        old_no_engagement_time,
        old_no_engagement_time,
    );
    let old_no_engagement_id = old_no_engagement.content_id;
    store.put(old_no_engagement).unwrap();

    // 2. old_with_child: 60 days ago, has active child → TOMBSTONED
    let old_with_child = make_test_content(
        [2u8; 32],
        None,
        old_no_engagement_time,
        old_no_engagement_time,
    );
    let old_with_child_id = old_with_child.content_id;
    store.put(old_with_child).unwrap();

    // 3. active_child: 1 day ago, child of old_with_child → PROTECTED
    let active_child_time = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let active_child = make_test_content(
        [3u8; 32],
        Some(old_with_child_id),
        active_child_time,
        active_child_time,
    );
    store.put(active_child).unwrap();

    // 4. recent: 1 day ago, standalone → PROTECTED
    let recent = make_test_content([4u8; 32], None, active_child_time, active_child_time);
    store.put(recent).unwrap();

    // 5. engaged: 30 days ago, but engaged 1 day ago → NOT DECAYED
    let engaged_create_time = (current_time_secs - 30 * 24 * 60 * 60) * 1000;
    let engaged_last_time = (current_time_secs - 1 * 24 * 60 * 60) * 1000;
    let engaged = make_test_content([5u8; 32], None, engaged_create_time, engaged_last_time);
    store.put(engaged).unwrap();

    timing.record("populate_content", populate_start.elapsed());
    assert_eq!(store.len(), 5);

    // === Calculate decay states ===
    let decay_start = Instant::now();

    let state1 = calculate_decay_state(
        store.get(&old_no_engagement_id).unwrap(),
        current_time_ms,
        HALF_LIFE_SECS,
    );
    let state2 = calculate_decay_state(
        store.get(&old_with_child_id).unwrap(),
        current_time_ms,
        HALF_LIFE_SECS,
    );
    let state3 = calculate_decay_state(
        store.get(&ContentId::from_bytes([3u8; 32])).unwrap(),
        current_time_ms,
        HALF_LIFE_SECS,
    );
    let state4 = calculate_decay_state(
        store.get(&ContentId::from_bytes([4u8; 32])).unwrap(),
        current_time_ms,
        HALF_LIFE_SECS,
    );
    let state5 = calculate_decay_state(
        store.get(&ContentId::from_bytes([5u8; 32])).unwrap(),
        current_time_ms,
        HALF_LIFE_SECS,
    );

    timing.record("decay_calculation", decay_start.elapsed());

    // Verify decay states
    assert!(state1.is_decayed, "old_no_engagement should be decayed");
    assert!(state2.is_decayed, "old_with_child should be decayed");
    assert!(state3.is_protected, "active_child should be protected");
    assert!(state4.is_protected, "recent should be protected");
    assert!(!state5.is_decayed, "engaged should not be decayed");

    // === Run pruning ===
    let prune_start = Instant::now();
    let stats = prune_decayed_content(&mut store, current_time_ms, HALF_LIFE_SECS);
    timing.record("prune_operation", prune_start.elapsed());

    // === Verify results ===
    let verify_start = Instant::now();

    // Verify prune stats
    assert_eq!(stats.items_checked, 5);
    assert_eq!(
        stats.items_pruned, 2,
        "2 items should be pruned (old_no_engagement + old_with_child)"
    );
    assert_eq!(
        stats.tombstones_created, 1,
        "1 tombstone for parent with active child"
    );

    // Verify store state
    assert!(
        store.get(&old_no_engagement_id).is_none(),
        "old_no_engagement should be deleted"
    );
    assert!(
        store.get(&old_with_child_id).is_none(),
        "old_with_child should be deleted (content)"
    );
    assert!(
        store.get_tombstone(&old_with_child_id).is_some(),
        "old_with_child should be tombstoned"
    );
    assert!(
        store.get(&ContentId::from_bytes([3u8; 32])).is_some(),
        "active_child should remain"
    );
    assert!(
        store.get(&ContentId::from_bytes([4u8; 32])).is_some(),
        "recent should remain"
    );
    assert!(
        store.get(&ContentId::from_bytes([5u8; 32])).is_some(),
        "engaged should remain"
    );

    // Final counts: 3 items remain + 1 tombstone
    assert_eq!(store.len(), 3);
    assert_eq!(store.tombstone_count(), 1);

    timing.record("verification", verify_start.elapsed());
    timing.record("total_flow", flow_start.elapsed());

    // === Performance assertions ===
    timing.assert_under("decay_calculation", Duration::from_millis(10));
    timing.assert_under("prune_operation", Duration::from_secs(1));

    println!("\n=== Flow 4 Complete Decay/Prune Summary ===");
    println!("{}", timing.summary());
    println!("Content states:");
    println!("  old_no_engagement: DELETED (decayed, no children)");
    println!("  old_with_child: TOMBSTONED (decayed, has active child)");
    println!("  active_child: PRESERVED (protected by floor)");
    println!("  recent: PRESERVED (protected by floor)");
    println!("  engaged: PRESERVED (recent engagement)");
    println!("\nPrune stats:");
    println!("  Items checked: {}", stats.items_checked);
    println!("  Items pruned: {}", stats.items_pruned);
    println!("  Tombstones: {}", stats.tombstones_created);
    println!("✓ All decay states correct");
    println!("✓ Thread coherence maintained");
    println!("✓ Timing requirements met");
}
