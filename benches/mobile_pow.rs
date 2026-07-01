//! Mobile PoW Benchmarks (Milestone 4.3)
//!
//! Measures PoW performance under mobile constraints.
//! Uses ForkPoWConfig::mobile() with reduced parallelism (p=2).
//!
//! Run with: cargo bench -- mobile_pow

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use swimchain::crypto::action_pow::{
    compute_pow, verify_pow, ActionType, ForkPoWConfig, PoWChallenge,
};
use swimchain::crypto::sha256;

/// Create a test challenge with given difficulty
fn create_test_challenge(action: ActionType, difficulty: u8) -> PoWChallenge {
    PoWChallenge::generate(
        action,
        b"benchmark content for mobile pow testing",
        &[42u8; 32],
        difficulty,
    )
}

/// Benchmark single hash verification (mobile vs desktop config)
fn bench_single_hash(c: &mut Criterion) {
    let mut group = c.benchmark_group("mobile_single_hash");
    group.sample_size(10); // Low samples due to ~100ms per hash

    // Pre-compute solutions for verification benchmarks
    let mobile_config = ForkPoWConfig::mobile();
    let desktop_config = ForkPoWConfig::production();
    let test_config = ForkPoWConfig::test();

    // Use difficulty 4 to get solutions quickly
    let challenge = create_test_challenge(ActionType::Post, 4);

    let mobile_solution =
        compute_pow(&challenge, &mobile_config).expect("Failed to compute mobile solution");
    let desktop_solution =
        compute_pow(&challenge, &desktop_config).expect("Failed to compute desktop solution");
    let test_solution =
        compute_pow(&challenge, &test_config).expect("Failed to compute test solution");

    let now = swimchain::crypto::current_timestamp;

    // Benchmark verification (single hash computation)
    group.bench_function("mobile_64mib_p2", |b| {
        b.iter(|| verify_pow(&mobile_solution, &mobile_config, now()))
    });

    group.bench_function("desktop_64mib_p4", |b| {
        b.iter(|| verify_pow(&desktop_solution, &desktop_config, now()))
    });

    group.bench_function("test_1mib_p1", |b| {
        b.iter(|| verify_pow(&test_solution, &test_config, now()))
    });

    group.finish();
}

/// Benchmark mining at various difficulties
///
/// This is the critical benchmark for mobile viability.
/// Expected times (at ~100ms/hash):
/// - Difficulty 4: ~1.6s (16 attempts)
/// - Difficulty 6: ~6.4s (64 attempts)
/// - Difficulty 8: ~26s (256 attempts) - TARGET for mobile
fn bench_mining_by_difficulty(c: &mut Criterion) {
    let mut group = c.benchmark_group("mobile_mining");
    group.sample_size(5); // Very low due to long mine times

    let mobile = ForkPoWConfig::mobile();

    // Only test feasible difficulties (4-8)
    // Higher difficulties would take too long for benchmarks
    for difficulty in [4, 6, 8] {
        group.bench_with_input(
            BenchmarkId::from_parameter(difficulty),
            &difficulty,
            |b, &diff| {
                b.iter(|| {
                    let challenge = create_test_challenge(ActionType::Post, diff);
                    compute_pow(&challenge, &mobile)
                });
            },
        );
    }

    group.finish();
}

/// Benchmark mining with test config (for comparison)
fn bench_mining_test_config(c: &mut Criterion) {
    let mut group = c.benchmark_group("test_config_mining");
    group.sample_size(10);

    let test = ForkPoWConfig::test();

    for difficulty in [4, 6, 8, 10, 12] {
        group.bench_with_input(
            BenchmarkId::from_parameter(difficulty),
            &difficulty,
            |b, &diff| {
                b.iter(|| {
                    let challenge = create_test_challenge(ActionType::Post, diff);
                    compute_pow(&challenge, &test)
                });
            },
        );
    }

    group.finish();
}

/// Benchmark different action types at same difficulty
fn bench_action_types(c: &mut Criterion) {
    let mut group = c.benchmark_group("mobile_action_types");
    group.sample_size(5);

    let mobile = ForkPoWConfig::mobile();
    let difficulty = 4; // Low for speed

    for action in [ActionType::Post, ActionType::Reply, ActionType::Engage] {
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{:?}", action)),
            &action,
            |b, &act| {
                b.iter(|| {
                    let challenge = create_test_challenge(act, difficulty);
                    compute_pow(&challenge, &mobile)
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    name = benches;
    config = Criterion::default().sample_size(10);
    targets = bench_single_hash, bench_mining_by_difficulty, bench_mining_test_config, bench_action_types
);

criterion_main!(benches);
