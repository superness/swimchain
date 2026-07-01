//! Mobile Storage Benchmarks (Milestone 4.3)
//!
//! Simulates storage usage over time with PROJECTIONS.md activity model.
//! Validates that decay bounds storage growth for mobile devices.
//!
//! Run with: cargo bench -- mobile_storage

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};

/// Activity model from PROJECTIONS.md
#[derive(Debug, Clone)]
struct ActivityModel {
    /// Number of users
    users: u32,
    /// Posts per user per day
    posts_per_user_per_day: f64,
    /// Percentage of text-only posts
    text_only_percent: f64,
    /// Percentage of posts with images
    image_percent: f64,
    /// Percentage of posts with video
    video_percent: f64,
    /// Average text post size
    avg_text_bytes: u64,
    /// Average image post size
    avg_image_bytes: u64,
    /// Average video post size
    avg_video_bytes: u64,
    /// Decay half-life in days
    decay_half_life_days: u32,
}

impl Default for ActivityModel {
    fn default() -> Self {
        // From PROJECTIONS.md
        Self {
            users: 100,
            posts_per_user_per_day: 0.3,
            text_only_percent: 0.78,
            image_percent: 0.20,
            video_percent: 0.02,
            avg_text_bytes: 1_024,      // 1 KB
            avg_image_bytes: 512_000,   // 500 KB
            avg_video_bytes: 5_242_880, // 5 MB
            decay_half_life_days: 30,   // From SPEC_02
        }
    }
}

/// Storage simulation result
#[derive(Debug, Clone)]
struct StorageSimResult {
    days: u32,
    daily_growth_bytes: u64,
    steady_state_bytes: u64,
    current_bytes: u64,
}

impl ActivityModel {
    /// Calculate average bytes per post
    fn avg_bytes_per_post(&self) -> f64 {
        self.text_only_percent * self.avg_text_bytes as f64
            + self.image_percent * self.avg_image_bytes as f64
            + self.video_percent * self.avg_video_bytes as f64
    }

    /// Calculate daily storage growth (before decay)
    fn daily_growth_bytes(&self) -> u64 {
        let posts_per_day = self.users as f64 * self.posts_per_user_per_day;
        (posts_per_day * self.avg_bytes_per_post()) as u64
    }

    /// Calculate steady state storage with decay
    fn steady_state_bytes(&self) -> u64 {
        let daily = self.daily_growth_bytes() as f64;
        let half_life = self.decay_half_life_days as f64;
        // Steady state = daily_growth * half_life / ln(2)
        (daily * half_life / 0.693) as u64
    }

    /// Simulate storage after N days with decay
    fn simulate_days(&self, days: u32) -> StorageSimResult {
        let daily = self.daily_growth_bytes();
        let steady = self.steady_state_bytes();
        let half_life = self.decay_half_life_days as f64;

        // Approach to steady state:
        // storage(t) = steady_state * (1 - e^(-t/τ))
        // where τ = half_life / ln(2)
        let tau = half_life / 0.693;
        let current = (steady as f64 * (1.0 - (-(days as f64) / tau).exp())) as u64;

        StorageSimResult {
            days,
            daily_growth_bytes: daily,
            steady_state_bytes: steady,
            current_bytes: current,
        }
    }
}

/// Benchmark storage projection calculations
fn bench_storage_projections(c: &mut Criterion) {
    let mut group = c.benchmark_group("storage_projection");

    let user_counts = [12, 100, 1000];
    let day_counts = [7, 14, 30, 60, 90];

    for users in user_counts {
        for days in day_counts {
            let id = format!("users_{}_days_{}", users, days);
            let mut model = ActivityModel::default();
            model.users = users;

            group.bench_function(&id, |b| b.iter(|| model.simulate_days(days)));
        }
    }

    group.finish();
}

/// Benchmark decay calculation
fn bench_decay_calculation(c: &mut Criterion) {
    let mut group = c.benchmark_group("decay_calculation");

    let model = ActivityModel::default();

    // Benchmark the core decay math
    group.bench_function("steady_state", |b| b.iter(|| model.steady_state_bytes()));

    group.bench_function("daily_growth", |b| b.iter(|| model.daily_growth_bytes()));

    group.bench_function("avg_post_size", |b| b.iter(|| model.avg_bytes_per_post()));

    group.finish();
}

/// Benchmark different user scales
fn bench_user_scales(c: &mut Criterion) {
    let mut group = c.benchmark_group("user_scale");

    for users in [10, 100, 1000, 10000] {
        let mut model = ActivityModel::default();
        model.users = users;

        let id = format!("{}_users", users);
        group.bench_function(&id, |b| {
            b.iter(|| {
                // Simulate 90 days
                let result = model.simulate_days(90);
                result.current_bytes
            })
        });
    }

    group.finish();
}

/// Benchmark to document storage requirements
fn bench_storage_requirements(c: &mut Criterion) {
    let mut group = c.benchmark_group("storage_requirements");

    // Budget phone: 1 GB
    const BUDGET_BYTES: u64 = 1_073_741_824;
    // Standard phone: 5 GB
    const STANDARD_BYTES: u64 = 5_368_709_120;
    // Flagship phone: 10 GB
    const FLAGSHIP_BYTES: u64 = 10_737_418_240;

    let profiles = [
        ("budget_1gb", BUDGET_BYTES),
        ("standard_5gb", STANDARD_BYTES),
        ("flagship_10gb", FLAGSHIP_BYTES),
    ];

    for (name, limit) in profiles {
        let model = ActivityModel::default();
        let steady = model.steady_state_bytes();

        group.bench_function(name, |b| {
            b.iter(|| {
                // Check if steady state fits within limit
                steady <= limit
            })
        });

        // Log the result
        let fits = if steady <= limit { "YES" } else { "NO" };
        let percent = (steady as f64 / limit as f64) * 100.0;
        println!(
            "{}: steady state {} bytes ({:.1}% of limit) - fits: {}",
            name, steady, percent, fits
        );
    }

    group.finish();
}

/// Print storage projections (documentation)
fn print_projections() {
    println!("\n=== MOBILE STORAGE PROJECTIONS ===\n");

    let user_counts = [12, 100, 500, 1000, 10000];

    println!(
        "{:<10} {:>15} {:>15} {:>15}",
        "Users", "Daily (MB)", "Steady (MB)", "Profile Needed"
    );
    println!("{:-<60}", "");

    for users in user_counts {
        let mut model = ActivityModel::default();
        model.users = users;

        let daily_mb = model.daily_growth_bytes() as f64 / 1_048_576.0;
        let steady_mb = model.steady_state_bytes() as f64 / 1_048_576.0;

        let profile = if steady_mb < 1024.0 {
            "Budget (1GB)"
        } else if steady_mb < 5120.0 {
            "Standard (5GB)"
        } else if steady_mb < 10240.0 {
            "Flagship (10GB)"
        } else {
            "Desktop only"
        };

        println!(
            "{:<10} {:>15.2} {:>15.2} {:>15}",
            users, daily_mb, steady_mb, profile
        );
    }

    println!("\nKey findings:");
    println!(
        "- 100 users: ~{:.0} MB steady state (fits in Budget 1GB)",
        ActivityModel::default().steady_state_bytes() as f64 / 1_048_576.0
    );
    println!("- Decay is essential for mobile viability");
    println!(
        "- Without decay, storage would grow linearly (~{:.0} MB/day at 100 users)",
        ActivityModel::default().daily_growth_bytes() as f64 / 1_048_576.0
    );
}

criterion_group!(
    name = benches;
    config = Criterion::default().sample_size(100);
    targets = bench_storage_projections, bench_decay_calculation, bench_user_scales, bench_storage_requirements
);

criterion_main!(benches);
