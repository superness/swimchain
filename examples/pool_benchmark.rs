//! Pool performance benchmark
//! Run with: cargo run --example pool_benchmark

use std::time::Instant;
use swimchain::content::pool::{compute_pool_pow_target, PoolContribution, PoolManager};
use swimchain::crypto::action_pow::ForkPoWConfig;

fn make_test_contribution(
    contributor: [u8; 32],
    pow_work: u64,
    timestamp: u64,
    pow_target: [u8; 32],
) -> PoolContribution {
    PoolContribution {
        contributor,
        pow_nonce: 12345,
        pow_work,
        pow_target,
        timestamp,
        signature: [0u8; 64],
        nonce_space: [0u8; 8],
        emoji: None,
    }
}

fn main() {
    println!("=== Pool System Benchmarks ===\n");

    // METRIC 1: Pool contribution overhead
    println!("METRIC: Pool Contribution Overhead");
    let iterations = 1000;
    let mut total_time_ns: u128 = 0;

    for i in 0..iterations {
        let mut manager = PoolManager::new();
        let content = [i as u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        let contribution = make_test_contribution([1u8; 32], 30, 1000, pow_target);

        let start = Instant::now();
        manager
            .add_contribution(pool_id, contribution, 5000, &config)
            .unwrap();
        total_time_ns += start.elapsed().as_nanos();
    }

    let avg_ns = total_time_ns / iterations as u128;
    println!("  Iterations: {}", iterations);
    println!(
        "  Average: {} ns ({:.3} µs)",
        avg_ns,
        avg_ns as f64 / 1000.0
    );

    // METRIC 2: Pool completion verification
    println!("\nMETRIC: Pool Completion Verification");
    let mut total_time_ns: u128 = 0;

    for i in 0..iterations {
        let mut manager = PoolManager::new();
        let content = [i as u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        for j in 0..6 {
            let contribution =
                make_test_contribution([j as u8; 32], 10, 1000 + j as u64 * 100, pow_target);
            manager
                .add_contribution(pool_id, contribution, 5000, &config)
                .unwrap();
        }

        let start = Instant::now();
        let _result = manager.check_completion(pool_id).unwrap();
        total_time_ns += start.elapsed().as_nanos();
    }

    let avg_ns = total_time_ns / iterations as u128;
    println!("  Iterations: {}", iterations);
    println!(
        "  Average: {} ns ({:.3} µs)",
        avg_ns,
        avg_ns as f64 / 1000.0
    );

    // METRIC 3: Storage cost per pool
    println!("\nMETRIC: Storage Cost Per Pool");
    let contribution_size = std::mem::size_of::<PoolContribution>();
    let pool_base_size = 32 + 32 + 8 + 8 + 8 + 1; // id + content + required + start + end + status
    let vec_overhead = 24;

    println!("  PoolContribution size: {} bytes", contribution_size);
    println!("  Pool base: {} bytes", pool_base_size + vec_overhead);

    let typical_pool_size = pool_base_size + vec_overhead + 6 * contribution_size;
    println!(
        "  Typical pool (6 contributions): {} bytes",
        typical_pool_size
    );

    let max_pool_size = pool_base_size + vec_overhead + 60 * contribution_size;
    println!("  Max pool (60 contributions): {} bytes", max_pool_size);
    println!(
        "  1000 pools (typical): {:.2} KB",
        (1000 * typical_pool_size) as f64 / 1024.0
    );
    println!(
        "  1000 pools (max): {:.2} KB",
        (1000 * max_pool_size) as f64 / 1024.0
    );

    // METRIC 4: Pool creation overhead
    println!("\nMETRIC: Pool Creation Overhead");
    let iterations = 10000;
    let mut manager = PoolManager::new();

    let start = Instant::now();
    for i in 0..iterations {
        let content = [(i & 0xFF) as u8; 32];
        manager.create_pool(content, [0u8; 32], i as u64);
    }
    let total_time = start.elapsed();

    let avg_ns = total_time.as_nanos() / iterations as u128;
    println!("  Iterations: {}", iterations);
    println!(
        "  Average: {} ns ({:.3} µs)",
        avg_ns,
        avg_ns as f64 / 1000.0
    );

    // METRIC 5: Pool expiry batch processing
    println!("\nMETRIC: Pool Expiry Batch Processing (1000 pools)");
    let mut manager = PoolManager::new();

    for i in 0..1000 {
        let content = [i as u8; 32];
        manager.create_pool(content, [0u8; 32], 0);
    }

    let start = Instant::now();
    let expired = manager.expire_pools(700_000);
    let elapsed = start.elapsed();

    println!("  Pools expired: {}", expired.len());
    println!("  Time: {:.3} µs", elapsed.as_nanos() as f64 / 1000.0);

    println!("\n=== Benchmark Complete ===");
}
