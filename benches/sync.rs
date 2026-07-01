//! Sync benchmarks (SPEC_06 - Chain Sync)
//!
//! Benchmarks for chain synchronization operations.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use swimchain::blocks::RootBlock;
use swimchain::sync::block_download::identify_relevant_blocks;
use swimchain::sync::header_sync::verify_header_chain;
use swimchain::types::constants::DECAY_FLOOR_SECS;

/// Generate a valid header chain for benchmarking
///
/// Sets total_pow = difficulty_target to pass validation.
fn generate_valid_header_chain(count: usize) -> Vec<RootBlock> {
    let mut headers = Vec::with_capacity(count);
    let mut prev_hash = [0u8; 32]; // Genesis
    let base_timestamp = 1_000_000u64;
    let difficulty = 30u64;

    let mut cumulative = 0u64;
    for i in 0..count {
        cumulative += difficulty;
        let header = RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: prev_hash,
            timestamp: base_timestamp + (i as u64 * 30), // 30s between blocks
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: difficulty, // Exactly meets difficulty
            cumulative_pow: cumulative,
            difficulty_target: difficulty,
            height: i as u64,
            block_creator: [0u8; 32],
        };
        prev_hash = header.hash();
        headers.push(header);
    }

    headers
}

fn bench_verify_header_chain(c: &mut Criterion) {
    let mut group = c.benchmark_group("verify_header_chain");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        let headers = generate_valid_header_chain(*size);

        group.bench_with_input(BenchmarkId::from_parameter(size), &headers, |b, headers| {
            b.iter(|| verify_header_chain(black_box(headers)))
        });
    }

    group.finish();
}

fn bench_identify_relevant_blocks(c: &mut Criterion) {
    let mut group = c.benchmark_group("identify_relevant_blocks");

    // Generate headers where some are relevant (recent) and some are decayed (old)
    for size in [1_000, 10_000, 100_000].iter() {
        let headers = generate_valid_header_chain(*size);
        // Current time is 1000 seconds after the last block
        let current_time = headers.last().unwrap().timestamp + 1000;

        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &(headers, current_time),
            |b, (headers, current_time)| {
                b.iter(|| identify_relevant_blocks(black_box(headers), *current_time))
            },
        );
    }

    group.finish();
}

fn bench_header_hash(c: &mut Criterion) {
    let header = RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: [1u8; 32],
        timestamp: 1_000_000,
        merkle_root: [2u8; 32],
        space_block_hashes: vec![[3u8; 32]; 10],
        space_block_count: 10,
        total_pow: 100,
        cumulative_pow: 100,
        difficulty_target: 30,
        height: 1000,
        block_creator: [0u8; 32],
    };

    c.bench_function("header_hash", |b| b.iter(|| black_box(&header).hash()));
}

fn bench_meets_difficulty(c: &mut Criterion) {
    let header = RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: [1u8; 32],
        timestamp: 1_000_000,
        merkle_root: [2u8; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: 100,
        cumulative_pow: 100,
        difficulty_target: 30,
        height: 1000,
        block_creator: [0u8; 32],
    };

    c.bench_function("meets_difficulty", |b| {
        b.iter(|| black_box(&header).meets_difficulty())
    });
}

criterion_group!(
    benches,
    bench_verify_header_chain,
    bench_identify_relevant_blocks,
    bench_header_hash,
    bench_meets_difficulty,
);
criterion_main!(benches);
