//! Decay simulation benchmarks (SPEC_02)
//!
//! Measures:
//! - Storage size after 10K posts with realistic decay (60 days)
//! - Storage size after 100K posts with realistic decay
//! - CPU cost of a single prune cycle on 10K items

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use rand::prelude::*;

use swimchain::content::lifecycle::ContentManager;
use swimchain::types::content::{
    ContentId, ContentItem, ContentType, EngagementRecord, EngagementType, SpaceId,
};
use swimchain::types::identity::{IdentityId, Signature};

/// Milliseconds per day
const MS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

/// Create a test content item with random ID
fn make_content(rng: &mut impl Rng, created_at_ms: u64) -> ContentItem {
    let mut id = [0u8; 32];
    rng.fill_bytes(&mut id);

    let body_len = rng.gen_range(50..500);
    let body: String = (0..body_len)
        .map(|_| rng.gen_range(b'a'..=b'z') as char)
        .collect();

    ContentItem {
        content_id: ContentId::from_bytes(id),
        author_id: IdentityId::from_bytes([rng.gen(); 32]),
        content_type: ContentType::Post,
        space_id: SpaceId::from_bytes([1u8; 32]),
        parent_id: None,
        created_at: created_at_ms,
        last_engagement: created_at_ms,
        body_inline: Some(body),
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

/// Create an engagement record
fn make_engagement(content_id: ContentId, timestamp: u64, rng: &mut impl Rng) -> EngagementRecord {
    EngagementRecord {
        content_id,
        engager_id: IdentityId::from_bytes([rng.gen(); 32]),
        engagement_type: EngagementType::Reply,
        timestamp,
        pow_nonce: 0,
        pow_work: 0,
        signature: Signature::from_bytes([0u8; 64]),
        emoji: None,
    }
}

/// Simulation result
#[derive(Debug, Clone)]
struct SimulationResult {
    posts_created: usize,
    posts_remaining: usize,
    storage_bytes: u64,
    engagements_processed: usize,
    prune_cycles: usize,
}

/// Run a decay simulation
///
/// Parameters:
/// - `num_posts`: Number of posts to create
/// - `days`: Simulation duration in days
/// - `engagement_rate`: Probability of engagement per post per day
/// - `prune_interval_days`: Days between prune cycles
fn run_simulation(
    num_posts: usize,
    days: u64,
    engagement_rate: f64,
    prune_interval_days: u64,
) -> SimulationResult {
    let mut rng = rand::thread_rng();
    let manager = ContentManager::new();

    let start_time = 0_u64;
    let end_time = days * MS_PER_DAY;

    // Create posts distributed over the first half of the simulation
    let mut content_ids = Vec::with_capacity(num_posts);
    let creation_window = (days / 2) * MS_PER_DAY;

    for i in 0..num_posts {
        let created_at = start_time + (i as u64 * creation_window / num_posts as u64);
        let content = make_content(&mut rng, created_at);
        content_ids.push((content.content_id, created_at));
        let _ = manager.create_content(content, created_at);
    }

    let mut engagements_processed = 0_usize;
    let mut prune_cycles = 0_usize;
    let prune_interval_ms = prune_interval_days * MS_PER_DAY;
    let mut last_prune = start_time;

    // Simulate day by day
    for day in 0..days {
        let current_time = (day + 1) * MS_PER_DAY;

        // Random engagements
        for (content_id, _created_at) in &content_ids {
            if rng.gen::<f64>() < engagement_rate {
                let engagement = make_engagement(*content_id, current_time, &mut rng);
                if manager.process_engagement(engagement, current_time).is_ok() {
                    engagements_processed += 1;
                }
            }
        }

        // Prune at intervals
        if current_time - last_prune >= prune_interval_ms {
            let _ = manager.prune(current_time);
            prune_cycles += 1;
            last_prune = current_time;
        }
    }

    // Final prune
    let _ = manager.prune(end_time);
    prune_cycles += 1;

    let (storage_bytes, posts_remaining) = manager.storage_stats().unwrap();

    SimulationResult {
        posts_created: num_posts,
        posts_remaining,
        storage_bytes,
        engagements_processed,
        prune_cycles,
    }
}

/// Benchmark 10K posts simulation
fn bench_10k_posts_60_days(c: &mut Criterion) {
    let mut group = c.benchmark_group("decay_simulation");
    group.sample_size(10);

    group.bench_function("10k_posts_60_days", |b| {
        b.iter(|| {
            let result = run_simulation(
                black_box(10_000),
                black_box(60),
                black_box(0.005), // ~0.5% engagement per post per day
                black_box(7),     // Weekly prune
            );
            black_box(result)
        });
    });

    group.finish();
}

/// Benchmark 100K posts simulation (longer, fewer samples)
fn bench_100k_posts_60_days(c: &mut Criterion) {
    let mut group = c.benchmark_group("decay_simulation_large");
    group.sample_size(10);

    group.bench_function("100k_posts_60_days", |b| {
        b.iter(|| {
            let result = run_simulation(
                black_box(100_000),
                black_box(60),
                black_box(0.002), // ~0.2% engagement per post per day
                black_box(7),     // Weekly prune
            );
            black_box(result)
        });
    });

    group.finish();
}

/// Benchmark single prune cycle on pre-populated store
fn bench_prune_tick(c: &mut Criterion) {
    let mut group = c.benchmark_group("prune_tick");

    for size in [1_000, 10_000, 50_000] {
        group.bench_with_input(BenchmarkId::from_parameter(size), &size, |b, &size| {
            // Setup: create manager with content
            let mut rng = rand::thread_rng();
            let manager = ContentManager::new();

            // Create posts spanning 30 days
            for i in 0..size {
                let created_at = i as u64 * MS_PER_DAY / 100; // Spread over ~300 days for variety
                let content = make_content(&mut rng, created_at);
                let _ = manager.create_content(content, created_at);
            }

            // Time is 60 days after start
            let current_time = 60 * MS_PER_DAY;

            b.iter(|| black_box(manager.prune(current_time).unwrap()));
        });
    }

    group.finish();
}

/// Run simulations and print results (not a benchmark, but useful for measurement)
#[allow(dead_code)]
fn measure_storage_projections() {
    println!("\n=== Decay Simulation Results ===\n");

    // 10K posts
    let result_10k = run_simulation(10_000, 60, 0.005, 7);
    println!("10K Posts Simulation (60 days, 0.5% engagement/day, weekly prune):");
    println!("  Posts created: {}", result_10k.posts_created);
    println!("  Posts remaining: {}", result_10k.posts_remaining);
    println!(
        "  Storage: {} bytes ({:.2} KB)",
        result_10k.storage_bytes,
        result_10k.storage_bytes as f64 / 1024.0
    );
    println!(
        "  Engagements processed: {}",
        result_10k.engagements_processed
    );
    println!("  Prune cycles: {}", result_10k.prune_cycles);
    println!(
        "  Retention rate: {:.1}%",
        100.0 * result_10k.posts_remaining as f64 / result_10k.posts_created as f64
    );
    println!();

    // 100K posts
    let result_100k = run_simulation(100_000, 60, 0.002, 7);
    println!("100K Posts Simulation (60 days, 0.2% engagement/day, weekly prune):");
    println!("  Posts created: {}", result_100k.posts_created);
    println!("  Posts remaining: {}", result_100k.posts_remaining);
    println!(
        "  Storage: {} bytes ({:.2} MB)",
        result_100k.storage_bytes,
        result_100k.storage_bytes as f64 / 1024.0 / 1024.0
    );
    println!(
        "  Engagements processed: {}",
        result_100k.engagements_processed
    );
    println!("  Prune cycles: {}", result_100k.prune_cycles);
    println!(
        "  Retention rate: {:.1}%",
        100.0 * result_100k.posts_remaining as f64 / result_100k.posts_created as f64
    );
    println!();
}

criterion_group!(
    benches,
    bench_10k_posts_60_days,
    bench_100k_posts_60_days,
    bench_prune_tick,
);

criterion_main!(benches);

// Tests are run as part of the benchmark binary
#[test]
fn test_simulation_runs() {
    let result = run_simulation(100, 10, 0.1, 3);
    assert!(result.posts_created == 100);
    assert!(result.posts_remaining <= 100);
}

#[test]
fn test_no_engagement_all_decay() {
    // With 0% engagement and 60 days, all content should decay
    let result = run_simulation(100, 60, 0.0, 7);
    assert_eq!(result.posts_remaining, 0);
}

#[test]
fn test_high_engagement_retention() {
    // With 100% daily engagement, content should be retained
    let result = run_simulation(100, 30, 1.0, 7);
    // Most content should remain (some will fail due to decay check)
    assert!(result.posts_remaining > 50);
}
