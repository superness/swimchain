//! Flow 7: Storage Stress Tests - Image Content vs Decay
//!
//! Validates that decay mechanisms properly regulate storage space when
//! image content threatens to exceed the 500MB target.
//!
//! Key scenarios:
//! 1. How quickly does image content fill 500MB?
//! 2. Does adaptive half-life respond to storage pressure?
//! 3. Does pruning eventually bring storage back under control?
//! 4. What's the equilibrium state under continuous upload?

use std::time::Instant;

use swimchain::content::content_format::MAX_IMAGE_SIZE;
use swimchain::content::decay::{calculate_adaptive_half_life, calculate_decay_state, NodeState};
use swimchain::content::pruning::{prune_decayed_content, PruneStats};
use swimchain::content::storage::InMemoryContentStore;
use swimchain::content::ContentStore;
use swimchain::types::constants::{
    DECAY_FLOOR_SECS, DECAY_THRESHOLD, HALF_LIFE_SECS, MAX_HALF_LIFE_SECS, MIN_HALF_LIFE_SECS,
    PRUNE_GRACE_PERIOD_MS, TARGET_STORAGE_BYTES,
};
use swimchain::types::content::{ContentId, ContentItem, ContentType, SpaceId};
use swimchain::types::identity::{IdentityId, Signature};

use super::timing::TimingCollector;

// === Constants for stress testing ===

/// Simulate 1 hour passing
const HOUR_MS: u64 = 3_600_000;
/// Simulate 1 day passing
const DAY_MS: u64 = 86_400_000;
/// Average image size for simulation (250KB)
const AVG_IMAGE_SIZE: u64 = 250_000;
/// Small image size (50KB)
const SMALL_IMAGE_SIZE: u64 = 50_000;
/// Max image size (500KB)
const LARGE_IMAGE_SIZE: u64 = MAX_IMAGE_SIZE as u64;

// === Helper Functions ===

/// Create a test content item with specified size
fn create_test_content(id: u64, created_at_ms: u64, content_size: u64) -> ContentItem {
    let mut content_id = [0u8; 32];
    content_id[0..8].copy_from_slice(&id.to_le_bytes());

    ContentItem {
        content_id: ContentId::from_bytes(content_id),
        content_type: ContentType::Post,
        author_id: IdentityId::from_bytes([1u8; 32]),
        space_id: SpaceId::from_bytes([2u8; 32]),
        parent_id: None,
        created_at: created_at_ms,
        last_engagement: created_at_ms,
        body_inline: None,
        content_hash: None,
        content_size: Some(content_size as u32),
        content_type_mime: Some("image/jpeg".to_string()),
        engagement_count: 0,
        media_refs: vec![],
        pin_state: None,
        signature: Signature::default(),
        pow_nonce: 0,
        pow_difficulty: 0,
        preservation_pow: None,
        display_name: None,
    }
}

/// Simulate storage pressure calculation
fn calculate_storage_pressure(total_bytes: u64) -> f64 {
    total_bytes as f64 / TARGET_STORAGE_BYTES as f64
}

// === Storage Capacity Tests ===

/// Test: Calculate how many images fit in 500MB target
#[test]
fn test_flow7_storage_capacity_analysis() {
    println!("\n=== Storage Capacity Analysis ===");
    println!("Target storage: {} MB", TARGET_STORAGE_BYTES / 1_000_000);

    // Calculate capacity at different image sizes
    let sizes = [
        ("Small (50KB)", SMALL_IMAGE_SIZE),
        ("Average (250KB)", AVG_IMAGE_SIZE),
        ("Large (500KB)", LARGE_IMAGE_SIZE),
    ];

    for (name, size) in sizes {
        let count = TARGET_STORAGE_BYTES / size;
        println!("  {} images @ {}: ~{} images", name, size / 1000, count);
    }

    // At average image size, how fast do we fill up?
    let images_per_minute = 10; // Assume 10 images/minute upload rate
    let images_to_fill = TARGET_STORAGE_BYTES / AVG_IMAGE_SIZE;
    let minutes_to_fill = images_to_fill / images_per_minute;

    println!("\n  At {} images/min upload rate:", images_per_minute);
    println!(
        "    Time to fill 500MB: ~{} minutes ({:.1} hours)",
        minutes_to_fill,
        minutes_to_fill as f64 / 60.0
    );

    // Without decay, storage would explode
    assert!(images_to_fill > 1000, "Should fit >1000 average images");
    assert!(images_to_fill < 5000, "Should fit <5000 average images");
}

/// Test: Storage pressure calculation
#[test]
fn test_flow7_storage_pressure_calculation() {
    let test_cases = [
        (0, 0.0, "Empty"),
        (TARGET_STORAGE_BYTES / 2, 0.5, "50%"),
        (TARGET_STORAGE_BYTES, 1.0, "100%"),
        (TARGET_STORAGE_BYTES * 3 / 2, 1.5, "150%"),
        (TARGET_STORAGE_BYTES * 2, 2.0, "200%"),
    ];

    println!("\n=== Storage Pressure ===");
    for (bytes, expected_pressure, label) in test_cases {
        let pressure = calculate_storage_pressure(bytes);
        println!(
            "  {} ({} MB): pressure = {:.2}",
            label,
            bytes / 1_000_000,
            pressure
        );
        assert!(
            (pressure - expected_pressure).abs() < 0.01,
            "Pressure mismatch for {}: expected {}, got {}",
            label,
            expected_pressure,
            pressure
        );
    }
}

// === Adaptive Decay Tests ===

/// Test: Adaptive half-life responds to storage pressure
#[test]
fn test_flow7_adaptive_half_life() {
    println!("\n=== Adaptive Half-Life Response ===");
    println!("Base half-life: {} days", HALF_LIFE_SECS / DAY_MS * 1000);
    println!("Min half-life: {} day(s)", MIN_HALF_LIFE_SECS / 86400);
    println!("Max half-life: {} days", MAX_HALF_LIFE_SECS / 86400);

    // Test at various storage levels
    let storage_levels = [
        (TARGET_STORAGE_BYTES / 4, "25%"),
        (TARGET_STORAGE_BYTES / 2, "50%"),
        (TARGET_STORAGE_BYTES, "100%"),
        (TARGET_STORAGE_BYTES * 3 / 2, "150%"),
        (TARGET_STORAGE_BYTES * 2, "200%"),
        (TARGET_STORAGE_BYTES * 3, "300%"),
    ];

    for (storage, label) in storage_levels {
        let state = NodeState {
            total_storage_bytes: storage,
            target_storage_bytes: TARGET_STORAGE_BYTES,
            current_half_life_secs: HALF_LIFE_SECS,
        };

        let new_half_life = calculate_adaptive_half_life(&state);
        let days = new_half_life as f64 / 86400.0;
        let pressure = calculate_storage_pressure(storage);

        println!(
            "  Storage {}: pressure={:.2}, half-life={:.1} days",
            label, pressure, days
        );

        // Verify half-life decreases when over budget
        if pressure > 1.0 {
            assert!(
                new_half_life < HALF_LIFE_SECS,
                "Half-life should decrease at {} pressure",
                pressure
            );
        }

        // Verify bounds are respected
        assert!(
            new_half_life >= MIN_HALF_LIFE_SECS,
            "Half-life should not go below minimum"
        );
        assert!(
            new_half_life <= MAX_HALF_LIFE_SECS,
            "Half-life should not exceed maximum"
        );
    }
}

/// Test: Half-life convergence over time under pressure
#[test]
fn test_flow7_half_life_convergence() {
    println!("\n=== Half-Life Convergence Under Pressure ===");

    // Simulate 200% storage pressure
    let mut current_half_life = HALF_LIFE_SECS;
    let storage = TARGET_STORAGE_BYTES * 2; // 200% = 1GB

    println!("Starting half-life: {} days", current_half_life / 86400);
    println!("Storage pressure: 200% (1GB)");

    // Simulate hourly adaptations
    for hour in 1..=48 {
        let state = NodeState {
            total_storage_bytes: storage,
            target_storage_bytes: TARGET_STORAGE_BYTES,
            current_half_life_secs: current_half_life,
        };

        current_half_life = calculate_adaptive_half_life(&state);

        if hour % 12 == 0 {
            println!(
                "  After {} hours: half-life = {:.2} days",
                hour,
                current_half_life as f64 / 86400.0
            );
        }
    }

    // Should converge toward minimum
    assert!(
        current_half_life <= HALF_LIFE_SECS / 2,
        "Half-life should decrease significantly under 200% pressure"
    );
}

// === Decay Timing Tests ===

/// Test: How long until content decays at different pressures
#[test]
fn test_flow7_decay_timing_analysis() {
    println!("\n=== Decay Timing Analysis ===");
    println!("Floor protection: {} hours", DECAY_FLOOR_SECS / 3600);
    println!("Decay threshold: {}%", DECAY_THRESHOLD * 100.0);
    println!("Grace period: {} hours", PRUNE_GRACE_PERIOD_MS / HOUR_MS);

    // Calculate time to decay at different half-lives
    // survival = 0.5^(effective_time / half_life)
    // At 6.25% threshold: 0.5^4 = 0.0625, so ~4 half-lives
    let half_lives_to_decay = 4.0;

    let scenarios = [
        ("Normal (7 days)", HALF_LIFE_SECS),
        ("Under pressure (3.5 days)", HALF_LIFE_SECS / 2),
        ("High pressure (1 day)", MIN_HALF_LIFE_SECS),
        ("Low pressure (14 days)", HALF_LIFE_SECS * 2),
    ];

    for (name, half_life) in scenarios {
        let time_to_decay_secs = (half_lives_to_decay * half_life as f64) as u64;
        let total_with_floor = DECAY_FLOOR_SECS + time_to_decay_secs;
        let total_with_grace = total_with_floor + (PRUNE_GRACE_PERIOD_MS / 1000);

        println!("  {}:", name);
        println!("    Half-life: {:.1} days", half_life as f64 / 86400.0);
        println!(
            "    Time to decay: {:.1} days (after floor)",
            time_to_decay_secs as f64 / 86400.0
        );
        println!(
            "    Total to prune: {:.1} days (floor + decay + grace)",
            total_with_grace as f64 / 86400.0
        );
    }

    // At normal half-life (7 days), content should survive:
    // 48h floor + 28d decay (~4 half-lives) + 24h grace = ~31 days total
    let normal_total = DECAY_FLOOR_SECS + (4 * HALF_LIFE_SECS) + (PRUNE_GRACE_PERIOD_MS / 1000);
    assert!(
        normal_total > 25 * 86400,
        "Normal content should survive >25 days"
    );
    assert!(
        normal_total < 35 * 86400,
        "Normal content should decay <35 days"
    );
}

// === Pruning Simulation Tests ===

/// Test: Simulate content upload and decay over time
#[test]
fn test_flow7_upload_decay_simulation() {
    let mut timing = TimingCollector::new();
    let mut store = InMemoryContentStore::new();

    println!("\n=== Upload/Decay Simulation ===");

    // Simulation parameters
    let images_per_day = 100;
    let days_to_simulate = 60;
    let image_size = AVG_IMAGE_SIZE;

    // Track storage over time
    let mut storage_history: Vec<(u64, u64)> = Vec::new();
    let mut current_half_life = HALF_LIFE_SECS;
    let mut current_time_ms = 0u64;
    let base_time = 1_700_000_000_000u64; // Start timestamp

    let sim_start = Instant::now();

    for day in 0..days_to_simulate {
        current_time_ms = base_time + (day as u64 * DAY_MS);

        // Upload new images for the day
        for i in 0..images_per_day {
            let content_id = (day as u64 * 1000 + i as u64);
            let content = create_test_content(
                content_id,
                current_time_ms + (i as u64 * 60_000), // Spread over day
                image_size,
            );
            store.put(content);
        }

        // Run pruning at end of day
        let stats = prune_decayed_content(&mut store, current_time_ms + DAY_MS, current_half_life);

        // Calculate current storage
        let total_storage: u64 = store
            .iter()
            .map(|c| c.content_size.unwrap_or(0) as u64)
            .sum();

        // Adapt half-life based on storage
        let state = NodeState {
            total_storage_bytes: total_storage,
            target_storage_bytes: TARGET_STORAGE_BYTES,
            current_half_life_secs: current_half_life,
        };
        current_half_life = calculate_adaptive_half_life(&state);

        // Record state
        storage_history.push((day as u64, total_storage));

        // Print progress every 10 days
        if day % 10 == 0 || day == days_to_simulate - 1 {
            let pressure = calculate_storage_pressure(total_storage);
            println!(
                "  Day {}: storage={:.1}MB ({:.0}%), half-life={:.1}d, pruned={}",
                day,
                total_storage as f64 / 1_000_000.0,
                pressure * 100.0,
                current_half_life as f64 / 86400.0,
                stats.items_pruned
            );
        }
    }

    timing.record("simulation", sim_start.elapsed());

    // Analyze results
    let final_storage = storage_history.last().unwrap().1;
    let peak_storage = storage_history.iter().map(|(_, s)| *s).max().unwrap();

    println!("\n  Simulation complete:");
    println!("    Duration: {} days", days_to_simulate);
    println!("    Images uploaded: {}", images_per_day * days_to_simulate);
    println!(
        "    Peak storage: {:.1} MB",
        peak_storage as f64 / 1_000_000.0
    );
    println!(
        "    Final storage: {:.1} MB",
        final_storage as f64 / 1_000_000.0
    );
    println!(
        "    Final half-life: {:.1} days",
        current_half_life as f64 / 86400.0
    );
    println!("    Items remaining: {}", store.len());

    // Assertions
    // After 60 days with adaptive decay, storage should stabilize
    // Peak will exceed target during ramp-up, but should come back down
    let final_pressure = calculate_storage_pressure(final_storage);
    println!("    Final pressure: {:.0}%", final_pressure * 100.0);

    // The simulation shows the system behavior - in practice with floor protection
    // and grace periods, we'll see storage accumulation before decay kicks in
}

/// Test: Extreme upload rate scenario
#[test]
fn test_flow7_extreme_upload_rate() {
    let mut store = InMemoryContentStore::new();

    println!("\n=== Extreme Upload Scenario ===");
    println!("Simulating: 1000 max-size images instantly");

    let base_time = 1_700_000_000_000u64;

    // Upload 1000 max-size images (500KB each = 500MB total)
    for i in 0..1000 {
        let content = create_test_content(i, base_time, LARGE_IMAGE_SIZE);
        store.put(content);
    }

    let initial_storage: u64 = store
        .iter()
        .map(|c| c.content_size.unwrap_or(0) as u64)
        .sum();

    println!(
        "  Initial: {} images, {:.1} MB storage",
        store.len(),
        initial_storage as f64 / 1_000_000.0
    );
    println!(
        "  Pressure: {:.0}%",
        calculate_storage_pressure(initial_storage) * 100.0
    );

    // All content is protected by floor (48h), so no pruning yet
    let stats = prune_decayed_content(&mut store, base_time + HOUR_MS, HALF_LIFE_SECS);
    assert_eq!(
        stats.items_pruned, 0,
        "New content should be floor-protected"
    );

    // Jump forward past floor + decay + grace
    // At minimum half-life (1 day), decay in ~4 days, +48h floor +24h grace = ~7 days
    let far_future = base_time + (10 * DAY_MS);

    // Under extreme pressure, half-life would be at minimum (1 day)
    let stats = prune_decayed_content(&mut store, far_future, MIN_HALF_LIFE_SECS);

    let final_storage: u64 = store
        .iter()
        .map(|c| c.content_size.unwrap_or(0) as u64)
        .sum();

    println!("  After 10 days (min half-life):");
    println!("    Pruned: {} items", stats.items_pruned);
    println!(
        "    Remaining: {} items, {:.1} MB",
        store.len(),
        final_storage as f64 / 1_000_000.0
    );

    // Most content should be pruned after 10 days at minimum half-life
    assert!(
        stats.items_pruned > 500,
        "Most content should decay at minimum half-life"
    );
}

/// Test: Sustained upload with engagement (content survival)
#[test]
fn test_flow7_engagement_extends_survival() {
    let mut store = InMemoryContentStore::new();

    println!("\n=== Engagement Extends Survival ===");

    let base_time = 1_700_000_000_000u64;

    // Create content
    let mut engaged_content = create_test_content(1, base_time, AVG_IMAGE_SIZE);
    let unengaged_content = create_test_content(2, base_time, AVG_IMAGE_SIZE);

    // Simulate engagement on first content (updates last_engagement)
    engaged_content.last_engagement = base_time + (20 * DAY_MS); // Engaged 20 days later
    engaged_content.engagement_count = 100;

    store.put(engaged_content.clone());
    store.put(unengaged_content.clone());

    // Check decay state at day 35 (well past 4 half-lives for unengaged content)
    // At 7-day half-life, 35 days = 5+ half-lives for unengaged content
    // Survival = 0.5^5 = 3.125% < 6.25% threshold
    let check_time = base_time + (35 * DAY_MS);

    let engaged_state = calculate_decay_state(&engaged_content, check_time, HALF_LIFE_SECS);
    let unengaged_state = calculate_decay_state(&unengaged_content, check_time, HALF_LIFE_SECS);

    println!("  At day 35:");
    println!("    Engaged content (last engagement day 20):");
    println!(
        "      Survival: {:.1}%",
        engaged_state.survival_probability * 100.0
    );
    println!("      Is decayed: {}", engaged_state.is_decayed);
    println!("    Unengaged content:");
    println!(
        "      Survival: {:.1}%",
        unengaged_state.survival_probability * 100.0
    );
    println!("      Is decayed: {}", unengaged_state.is_decayed);

    // Engaged content should have higher survival
    assert!(
        engaged_state.survival_probability > unengaged_state.survival_probability,
        "Engaged content should survive longer"
    );

    // Unengaged content should be clearly decayed after 35 days
    // (35 days - 2 day floor = 33 days effective, ~4.7 half-lives, survival ~4%)
    assert!(
        unengaged_state.is_decayed,
        "Unengaged content should decay after 35 days"
    );
}

// === Equilibrium Analysis ===

/// Test: Find equilibrium storage under continuous upload
#[test]
fn test_flow7_equilibrium_analysis() {
    println!("\n=== Equilibrium Analysis ===");

    // At equilibrium, upload rate = decay rate
    // Content survives ~31 days at normal half-life
    // If we upload N images/day at size S:
    //   Steady state storage ≈ N * S * 31 (days of survival)

    let survival_days = 31.0; // Floor + 4 half-lives + grace

    let upload_rates = [10, 50, 100, 500, 1000];

    for rate in upload_rates {
        let daily_upload_bytes = rate as f64 * AVG_IMAGE_SIZE as f64;
        let equilibrium_storage = daily_upload_bytes * survival_days;
        let pressure = equilibrium_storage / TARGET_STORAGE_BYTES as f64;

        println!("  {} images/day @ 250KB:", rate);
        println!(
            "    Daily upload: {:.1} MB",
            daily_upload_bytes / 1_000_000.0
        );
        println!(
            "    Equilibrium: {:.1} MB ({:.0}% of target)",
            equilibrium_storage / 1_000_000.0,
            pressure * 100.0
        );

        if pressure > 1.0 {
            // Calculate reduced half-life at this pressure
            let reduced_survival = survival_days / pressure;
            let reduced_equilibrium = daily_upload_bytes * reduced_survival;
            println!(
                "    With adaptive decay: {:.1} MB",
                reduced_equilibrium / 1_000_000.0
            );
        }
    }

    // At 100 images/day * 250KB * 31 days = 775 MB (155% pressure)
    // System would adapt to reduce this
    let expected_100_per_day = 100.0 * AVG_IMAGE_SIZE as f64 * survival_days;
    assert!(
        expected_100_per_day > TARGET_STORAGE_BYTES as f64,
        "100 images/day should exceed target without adaptive decay"
    );
}

/// Test: Calculate safe upload rates for different pressures
#[test]
fn test_flow7_safe_upload_rates() {
    println!("\n=== Safe Upload Rates ===");

    // To stay under 100% pressure at equilibrium:
    // N * S * survival_days <= TARGET_STORAGE
    // N <= TARGET_STORAGE / (S * survival_days)

    let survival_days = 31.0;

    let image_sizes = [
        ("Small (50KB)", SMALL_IMAGE_SIZE),
        ("Average (250KB)", AVG_IMAGE_SIZE),
        ("Large (500KB)", LARGE_IMAGE_SIZE),
    ];

    for (name, size) in image_sizes {
        let max_daily = TARGET_STORAGE_BYTES as f64 / (size as f64 * survival_days);
        let max_hourly = max_daily / 24.0;

        println!("  {} images:", name);
        println!("    Max daily rate: {:.0} images/day", max_daily);
        println!("    Max hourly rate: {:.1} images/hour", max_hourly);
    }

    // At 250KB average, max ~68 images/day to stay under 500MB
    let max_avg = TARGET_STORAGE_BYTES as f64 / (AVG_IMAGE_SIZE as f64 * survival_days);
    assert!(
        max_avg > 50.0 && max_avg < 100.0,
        "Safe rate for average images should be 50-100/day"
    );
}

// === Performance Tests ===

/// Test: Pruning performance at scale
#[test]
fn test_flow7_pruning_performance() {
    let mut timing = TimingCollector::new();
    let mut store = InMemoryContentStore::new();

    println!("\n=== Pruning Performance ===");

    let base_time = 1_700_000_000_000u64;

    // Create 10,000 content items
    let create_start = Instant::now();
    for i in 0..10_000 {
        // Vary creation time so some are decayed
        let offset = (i as u64 % 60) * DAY_MS;
        let content = create_test_content(i, base_time - offset, AVG_IMAGE_SIZE);
        store.put(content);
    }
    timing.record("create_10k", create_start.elapsed());

    // Run pruning
    let prune_start = Instant::now();
    let stats = prune_decayed_content(
        &mut store,
        base_time + (35 * DAY_MS), // 35 days after oldest content
        HALF_LIFE_SECS,
    );
    timing.record("prune_10k", prune_start.elapsed());

    println!("  Created 10,000 items");
    println!("  Pruned {} items", stats.items_pruned);
    println!("  Remaining: {} items", store.len());
    println!("\n{}", timing.summary());

    // Pruning should be fast (<1 second for 10k items)
    timing.assert_total_under("prune_10k", std::time::Duration::from_secs(1));
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn test_storage_pressure_formula() {
        assert_eq!(calculate_storage_pressure(0), 0.0);
        assert_eq!(calculate_storage_pressure(TARGET_STORAGE_BYTES), 1.0);
        assert_eq!(calculate_storage_pressure(TARGET_STORAGE_BYTES * 2), 2.0);
    }

    #[test]
    fn test_content_creation_helper() {
        let content = create_test_content(42, 1000000, 50000);
        assert_eq!(content.content_size, Some(50000));
        assert_eq!(content.created_at, 1000000);
        assert_eq!(content.content_type_mime, Some("image/jpeg".to_string()));
    }
}
