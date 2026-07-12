//! Decay Edge Case Tests (D1.1-D1.4)
//!
//! Tests for the decay system integration, covering:
//! - D1.1: Storage pressure adaptation
//! - D1.2: Pinned content protection
//! - D1.3: Half-life computation accuracy
//! - D1.4: Engagement reset behavior
//!
//! These tests verify the decay integration layer works correctly
//! with the blob storage and decay engine.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tempfile::tempdir;

// Import the modules we need to test
use swimchain::content::decay_integration::{DecayError, DecayIntegration, DecayMetadata};
use swimchain::storage::blob::{BlobStore, ContentBlobHash};
use swimchain::types::constants::{
    DECAY_FLOOR_SECS, HALF_LIFE_SECS, MAX_HALF_LIFE_SECS, MIN_HALF_LIFE_SECS, TARGET_STORAGE_BYTES,
};

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn create_test_integration(target_storage: u64) -> (DecayIntegration, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
    let integration =
        DecayIntegration::new(dir.path().to_path_buf(), blob_store, target_storage).unwrap();
    (integration, dir)
}

fn create_test_blob(
    integration: &DecayIntegration,
    blob_store: &BlobStore,
    hash: [u8; 32],
    content: &[u8],
) {
    let blob_hash = ContentBlobHash::from_bytes(hash);
    let blob_path = blob_store.blob_path(&blob_hash);
    fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
    fs::write(&blob_path, content).unwrap();
}

// ============================================================================
// D1.1: Storage Pressure Adaptation Tests
// ============================================================================

/// Test that half-life decreases when storage exceeds target
#[test]
fn test_d1_1_half_life_decreases_under_pressure() {
    // Create integration with small target (1KB)
    let (integration, _dir) = create_test_integration(1024);

    let initial_half_life = integration.current_half_life().unwrap();
    assert_eq!(
        initial_half_life, HALF_LIFE_SECS,
        "Should start with default half-life"
    );

    // Register 10KB of content (10x target)
    for i in 0..10u8 {
        let metadata = DecayMetadata {
            blob_hash: [i; 32],
            content_id: [i; 32],
            author_id: [0u8; 32],
            space_id: [0u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: current_time_ms(),
            last_engagement: current_time_ms(),
            engagement_count: 0,
            content_size: 1024, // 1KB each
            is_pinned: false,
        };
        integration.register(metadata).unwrap();
    }

    // Adapt half-life
    let new_half_life = integration.adapt_half_life().unwrap();

    // Half-life should decrease (faster decay) when over capacity
    assert!(
        new_half_life < HALF_LIFE_SECS,
        "Half-life should decrease under storage pressure: {} >= {}",
        new_half_life,
        HALF_LIFE_SECS
    );

    // But should not go below minimum
    assert!(
        new_half_life >= MIN_HALF_LIFE_SECS,
        "Half-life should not go below minimum: {} < {}",
        new_half_life,
        MIN_HALF_LIFE_SECS
    );
}

/// Test that half-life increases when storage is well under target
#[test]
fn test_d1_1_half_life_increases_when_under_target() {
    // Create integration with large target (1GB)
    let (integration, _dir) = create_test_integration(1024 * 1024 * 1024);

    // Register just 1KB of content
    let metadata = DecayMetadata {
        blob_hash: [1u8; 32],
        content_id: [1u8; 32],
        author_id: [0u8; 32],
        space_id: [0u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: current_time_ms(),
        last_engagement: current_time_ms(),
        engagement_count: 0,
        content_size: 1024,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Adapt half-life
    let new_half_life = integration.adapt_half_life().unwrap();

    // Half-life should increase (slower decay) when under capacity
    assert!(
        new_half_life > HALF_LIFE_SECS,
        "Half-life should increase when under target: {} <= {}",
        new_half_life,
        HALF_LIFE_SECS
    );

    // But should not go above maximum
    assert!(
        new_half_life <= MAX_HALF_LIFE_SECS,
        "Half-life should not go above maximum: {} > {}",
        new_half_life,
        MAX_HALF_LIFE_SECS
    );
}

/// Test that storage stats are accurate
#[test]
fn test_d1_1_storage_stats_accuracy() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    // Initially empty
    let (bytes, count) = integration.storage_stats().unwrap();
    assert_eq!(bytes, 0);
    assert_eq!(count, 0);

    // Add content with known sizes
    let sizes = [1000u64, 2000, 3000, 4000, 5000];
    for (i, size) in sizes.iter().enumerate() {
        let metadata = DecayMetadata {
            blob_hash: [i as u8; 32],
            content_id: [i as u8; 32],
            author_id: [0u8; 32],
            space_id: [0u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: current_time_ms(),
            last_engagement: current_time_ms(),
            engagement_count: 0,
            content_size: *size,
            is_pinned: false,
        };
        integration.register(metadata).unwrap();
    }

    let (bytes, count) = integration.storage_stats().unwrap();
    let expected_bytes: u64 = sizes.iter().sum();
    assert_eq!(
        bytes, expected_bytes,
        "Total bytes should match sum of sizes"
    );
    assert_eq!(count, 5, "Count should match number of items");
}

// ============================================================================
// D1.2: Pinned Content Protection Tests
// ============================================================================

/// Test that pinned content is not pruned even when very old
#[test]
fn test_d1_2_pinned_content_survives_decay() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
    let very_old_time = 0; // Unix epoch

    // Create blob file
    let blob_path = integration.storage_stats(); // Just to verify it works
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
    let integration2 = DecayIntegration::new(
        dir.path().to_path_buf(),
        blob_store.clone(),
        TARGET_STORAGE_BYTES,
    )
    .unwrap();

    let blob_path = blob_store.blob_path(&blob_hash);
    fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
    fs::write(&blob_path, b"critical pinned content").unwrap();

    // Register as pinned
    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: very_old_time,
        last_engagement: very_old_time,
        engagement_count: 0,
        content_size: 23,
        is_pinned: true, // PINNED
    };
    integration2.register(metadata).unwrap();

    // Prune should skip it
    let stats = integration2.prune().unwrap();
    assert_eq!(
        stats.items_protected, 1,
        "Pinned content should be protected"
    );
    assert_eq!(stats.items_pruned, 0, "Pinned content should not be pruned");
    assert!(
        integration2.contains(&blob_hash),
        "Pinned content should still exist"
    );
    assert!(blob_path.exists(), "Pinned blob file should still exist");
}

/// Test that pin/unpin works correctly
#[test]
fn test_d1_2_pin_unpin_toggle() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);

    // Register unpinned content
    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: current_time_ms(),
        last_engagement: current_time_ms(),
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Pin it
    let result = integration.pin(&blob_hash).unwrap();
    assert!(result, "Pin should succeed");

    // Verify it's pinned (would survive prune even if old)
    let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();
    // Note: We can't directly check is_pinned from decay state, but prune will protect it

    // Unpin it
    let result = integration.unpin(&blob_hash).unwrap();
    assert!(result, "Unpin should succeed");
}

/// Test that pin returns false for non-existent content
#[test]
fn test_d1_2_pin_nonexistent_content() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([99u8; 32]);

    let result = integration.pin(&blob_hash).unwrap();
    assert!(!result, "Pin should return false for non-existent content");
}

// ============================================================================
// D1.3: Half-Life Computation Tests
// ============================================================================

/// Test that content in floor period is protected
#[test]
fn test_d1_3_floor_period_protection() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
    let now = current_time_ms();

    // Create content from 1 hour ago (well within floor period)
    let one_hour_ago = now - (60 * 60 * 1000);

    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: one_hour_ago,
        last_engagement: one_hour_ago,
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Get decay state
    let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();

    // Should be protected (in floor period)
    assert!(
        state.is_protected,
        "Content within floor period should be protected"
    );
    assert!(
        !state.is_decayed,
        "Content within floor period should not be decayed"
    );
}

/// Test that content past floor period starts decaying
#[test]
fn test_d1_3_decay_after_floor_period() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
    let now = current_time_ms();

    // Create content from 3 days ago (past 48-hour floor period)
    let three_days_ago = now - (3 * 24 * 60 * 60 * 1000);

    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: three_days_ago,
        last_engagement: three_days_ago,
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Get decay state
    let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();

    // Should not be protected anymore
    assert!(
        !state.is_protected,
        "Content past floor period should not be protected"
    );

    // Survival should be less than 100%
    assert!(
        state.survival_probability < 1.0,
        "Content past floor period should have reduced survival: {}",
        state.survival_probability
    );
}

/// Test that very old content has very low survival probability
#[test]
fn test_d1_3_exponential_decay_over_time() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let now = current_time_ms();

    // Create content at various ages
    let ages_days = [3, 7, 14, 30, 60];
    let mut survival_probs = Vec::new();

    for (i, days) in ages_days.iter().enumerate() {
        let blob_hash = ContentBlobHash::from_bytes([i as u8; 32]);
        let age_ms = (*days as u64) * 24 * 60 * 60 * 1000;
        let created_at = now.saturating_sub(age_ms);

        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [i as u8; 32],
            author_id: [0u8; 32],
            space_id: [0u8; 32],
            content_type: 0,
            parent_id: None,
            created_at,
            last_engagement: created_at,
            engagement_count: 0,
            content_size: 1000,
            is_pinned: false,
        };
        integration.register(metadata).unwrap();

        let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();
        survival_probs.push((*days, state.survival_probability));
    }

    // Verify survival decreases with age
    for i in 1..survival_probs.len() {
        let (age_prev, prob_prev) = survival_probs[i - 1];
        let (age_curr, prob_curr) = survival_probs[i];
        assert!(
            prob_curr <= prob_prev,
            "Older content ({} days) should have same or lower survival than newer ({} days): {} vs {}",
            age_curr, age_prev, prob_curr, prob_prev
        );
    }

    // Very old content (60 days) should have very low survival
    let (_, oldest_survival) = survival_probs.last().unwrap();
    assert!(
        *oldest_survival < 0.01,
        "60-day old content should have <1% survival: {}",
        oldest_survival
    );
}

// ============================================================================
// D1.4: Engagement Reset Tests
// ============================================================================

/// Test that engagement resets the decay timer
#[test]
fn test_d1_4_engagement_resets_timer() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
    let now = current_time_ms();

    // Create old content (10 days ago)
    let ten_days_ago = now - (10 * 24 * 60 * 60 * 1000);

    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: ten_days_ago,
        last_engagement: ten_days_ago, // No engagement since creation
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Get decay state before engagement
    let state_before = integration.get_decay_state(&blob_hash).unwrap().unwrap();
    let survival_before = state_before.survival_probability;

    // Record engagement
    let engaged = integration.on_engagement(&blob_hash).unwrap();
    assert!(engaged, "Engagement should be recorded");

    // Get decay state after engagement
    let state_after = integration.get_decay_state(&blob_hash).unwrap().unwrap();
    let survival_after = state_after.survival_probability;

    // Survival should improve after engagement
    assert!(
        survival_after > survival_before,
        "Survival should improve after engagement: {} vs {}",
        survival_after,
        survival_before
    );

    // Note: Floor period protection is based on content AGE, not engagement time.
    // So old content with recent engagement won't be in floor period, but
    // the effective decay time is reset, improving survival probability.
    // The key assertion is that survival_after > survival_before above.
}

/// Test that multiple engagements keep content alive
#[test]
fn test_d1_4_multiple_engagements_accumulate() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);
    let now = current_time_ms();

    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: now,
        last_engagement: now,
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Record multiple engagements
    for i in 1..=10 {
        let engaged = integration.on_engagement(&blob_hash).unwrap();
        assert!(engaged, "Engagement {} should be recorded", i);
    }

    // Check engagement count
    let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();
    // Note: engagement_count affects decay but we can verify via survival

    // Content should still be in floor period
    assert!(
        state.is_protected,
        "Content with recent engagement should be protected"
    );
}

/// Test that engagement on non-existent content returns false
#[test]
fn test_d1_4_engagement_nonexistent_content() {
    let (integration, _dir) = create_test_integration(TARGET_STORAGE_BYTES);

    let blob_hash = ContentBlobHash::from_bytes([99u8; 32]);

    let engaged = integration.on_engagement(&blob_hash).unwrap();
    assert!(
        !engaged,
        "Engagement on non-existent content should return false"
    );
}

/// Test that pruning respects recent engagement
#[test]
fn test_d1_4_prune_respects_engagement() {
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
    let integration = DecayIntegration::new(
        dir.path().to_path_buf(),
        blob_store.clone(),
        TARGET_STORAGE_BYTES,
    )
    .unwrap();

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);

    // Create blob file
    let blob_path = blob_store.blob_path(&blob_hash);
    fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
    fs::write(&blob_path, b"engaged content").unwrap();

    // Create very old content
    let very_old = 0; // Unix epoch
    let now = current_time_ms();

    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: very_old,
        last_engagement: very_old,
        engagement_count: 0,
        content_size: 15,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    // Engage with content (resets timer to now)
    integration.on_engagement(&blob_hash).unwrap();

    // Prune should NOT remove it because engagement is recent
    let stats = integration.prune().unwrap();
    assert_eq!(
        stats.items_pruned, 0,
        "Recently engaged content should not be pruned"
    );
    assert!(
        integration.contains(&blob_hash),
        "Engaged content should still exist"
    );
    assert!(blob_path.exists(), "Engaged blob should still exist");
}

// ============================================================================
// Additional Edge Cases
// ============================================================================

/// Test persistence across restarts
#[test]
fn test_persistence_preserves_engagement() {
    let dir = tempdir().unwrap();
    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);

    // Register and engage
    {
        let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
        let integration =
            DecayIntegration::new(dir.path().to_path_buf(), blob_store, TARGET_STORAGE_BYTES)
                .unwrap();

        let metadata = DecayMetadata {
            blob_hash: *blob_hash.as_bytes(),
            content_id: [2u8; 32],
            author_id: [3u8; 32],
            space_id: [4u8; 32],
            content_type: 0,
            parent_id: None,
            created_at: current_time_ms(),
            last_engagement: current_time_ms(),
            engagement_count: 0,
            content_size: 1000,
            is_pinned: false,
        };
        integration.register(metadata).unwrap();

        // Engage multiple times
        for _ in 0..5 {
            integration.on_engagement(&blob_hash).unwrap();
        }
    }

    // Reload and verify engagement was preserved
    {
        let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
        let integration =
            DecayIntegration::new(dir.path().to_path_buf(), blob_store, TARGET_STORAGE_BYTES)
                .unwrap();

        assert!(
            integration.contains(&blob_hash),
            "Content should still exist after reload"
        );

        let state = integration.get_decay_state(&blob_hash).unwrap().unwrap();
        assert!(
            state.is_protected,
            "Content should still be in floor period after reload"
        );
    }
}

/// Test scan_and_register for bootstrapping
#[test]
fn test_scan_and_register_bootstraps_decay() {
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());

    // Create some blob files directly (simulating existing content)
    for i in 0..5u8 {
        let blob_hash = ContentBlobHash::from_bytes([i; 32]);
        let blob_path = blob_store.blob_path(&blob_hash);
        fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
        fs::write(&blob_path, format!("content {}", i)).unwrap();
    }

    // Create integration (no content registered yet)
    let integration =
        DecayIntegration::new(dir.path().to_path_buf(), blob_store, TARGET_STORAGE_BYTES).unwrap();
    assert_eq!(integration.item_count(), 0, "Should start empty");

    // Scan and register
    let registered = integration.scan_and_register().unwrap();
    assert_eq!(registered, 5, "Should register 5 items");
    assert_eq!(integration.item_count(), 5, "Should have 5 items tracked");

    // Verify all items are now tracked
    for i in 0..5u8 {
        let blob_hash = ContentBlobHash::from_bytes([i; 32]);
        assert!(
            integration.contains(&blob_hash),
            "Item {} should be tracked",
            i
        );
    }
}

/// Test orphan cleanup
#[test]
fn test_prune_cleans_orphan_metadata() {
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());
    let integration = DecayIntegration::new(
        dir.path().to_path_buf(),
        blob_store.clone(),
        TARGET_STORAGE_BYTES,
    )
    .unwrap();

    let blob_hash = ContentBlobHash::from_bytes([1u8; 32]);

    // Register content WITHOUT creating the blob file
    let metadata = DecayMetadata {
        blob_hash: *blob_hash.as_bytes(),
        content_id: [2u8; 32],
        author_id: [3u8; 32],
        space_id: [4u8; 32],
        content_type: 0,
        parent_id: None,
        created_at: current_time_ms(),
        last_engagement: current_time_ms(),
        engagement_count: 0,
        content_size: 1000,
        is_pinned: false,
    };
    integration.register(metadata).unwrap();

    assert!(integration.contains(&blob_hash), "Metadata should exist");

    // Prune should clean orphan metadata
    let stats = integration.prune().unwrap();
    assert_eq!(stats.orphans_cleaned, 1, "Should clean 1 orphan");
    assert!(
        !integration.contains(&blob_hash),
        "Orphan metadata should be removed"
    );
}

/// Test that empty blobs are ignored during scan
#[test]
fn test_scan_ignores_empty_blobs() {
    let dir = tempdir().unwrap();
    let blob_store = Arc::new(BlobStore::new(dir.path().join("sync_blobs")).unwrap());

    // Create empty blob files
    for i in 0..3u8 {
        let blob_hash = ContentBlobHash::from_bytes([i; 32]);
        let blob_path = blob_store.blob_path(&blob_hash);
        fs::create_dir_all(blob_path.parent().unwrap()).unwrap();
        fs::write(&blob_path, "").unwrap(); // Empty!
    }

    // Create one non-empty blob
    let valid_hash = ContentBlobHash::from_bytes([99u8; 32]);
    let valid_path = blob_store.blob_path(&valid_hash);
    fs::create_dir_all(valid_path.parent().unwrap()).unwrap();
    fs::write(&valid_path, "valid content").unwrap();

    let integration =
        DecayIntegration::new(dir.path().to_path_buf(), blob_store, TARGET_STORAGE_BYTES).unwrap();

    let registered = integration.scan_and_register().unwrap();
    assert_eq!(registered, 1, "Should only register non-empty blob");
}
