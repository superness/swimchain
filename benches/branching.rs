//! Benchmarks for Branch Management (Milestone 1.7)
//!
//! Measures:
//! 1. Fracture overhead at various thread counts
//! 2. Branch lookup performance at various scales
//! 3. Impact of different threshold values

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use swimchain::blocks::{Action, ActionType, BranchPath, ContentBlock};
use swimchain::branch::{BranchAwareStore, BranchManager, BRANCH_FRACTURE_THRESHOLD};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

/// Create a test action with specified PoW work
fn create_test_action(pow_work: u64) -> Action {
    Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
        timestamp: 1000,
        content_hash: Some([2u8; 32]),
        parent_id: None,
        pow_nonce: 42,
        pow_work,
        pow_target: [3u8; 32],
        signature: [4u8; 64],
        emoji: None,
        display_name: None,
        media_refs: vec![],
        replaces_pending: None,
    }
}

/// Create a content block for testing
fn create_test_block(thread_id: [u8; 32], space_id: [u8; 32]) -> ContentBlock {
    ContentBlock {
        thread_root_id: thread_id,
        space_id,
        actions: vec![create_test_action(10)],
        merkle_root: [0u8; 32],
        prev_content_hash: None,
        timestamp: 1000,
        total_pow: 10,
        branch_path: BranchPath::root(),
        space_metadata: None,
    }
}

/// Populate a space with threads without triggering fracture
fn create_populated_space(store: &ChainStore, num_threads: usize) -> [u8; 32] {
    let space_id = [1u8; 32];
    // Use max threshold to prevent fracture during setup
    let branch_store = BranchAwareStore::with_fracture_threshold(store, u64::MAX);

    for i in 0..num_threads {
        let mut thread_id = [0u8; 32];
        thread_id[..8].copy_from_slice(&(i as u64).to_be_bytes());
        let block = create_test_block(thread_id, space_id);
        let _ = branch_store.put_content_block(block);
    }

    space_id
}

/// Benchmark fracture overhead at various thread counts
fn benchmark_fracture_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("fracture_overhead");

    for thread_count in [100, 500, 1_000] {
        group.bench_with_input(
            BenchmarkId::new("threads", thread_count),
            &thread_count,
            |b, &count| {
                b.iter_with_setup(
                    || {
                        let dir = tempdir().unwrap();
                        let store = ChainStore::open(dir.path()).unwrap();
                        let space_id = create_populated_space(&store, count);
                        (dir, store, space_id)
                    },
                    |(dir, store, space_id)| {
                        let manager = BranchManager::new(&store);
                        // Execute fracture on root branch
                        let result = manager.execute_fracture(&space_id, &BranchPath::root(), 1000);
                        black_box(result);
                        // Keep tempdir alive until end
                        drop(dir);
                    },
                );
            },
        );
    }
    group.finish();
}

/// Benchmark branch lookup performance at various thread counts
fn benchmark_branch_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("branch_lookup");

    for thread_count in [100, 1_000, 5_000] {
        group.bench_with_input(
            BenchmarkId::new("threads", thread_count),
            &thread_count,
            |b, &count| {
                // Setup: create store with threads and trigger fracture
                let dir = tempdir().unwrap();
                let store = ChainStore::open(dir.path()).unwrap();
                let space_id = create_populated_space(&store, count);

                // Force a fracture
                let manager = BranchManager::new(&store);
                let _ = manager.execute_fracture(&space_id, &BranchPath::root(), 1000);

                // Pick a thread to look up
                let mut thread_id = [0u8; 32];
                thread_id[..8].copy_from_slice(&((count / 2) as u64).to_be_bytes());

                b.iter(|| {
                    black_box(manager.get_thread_branch(&space_id, &thread_id).unwrap());
                });
            },
        );
    }
    group.finish();
}

/// Benchmark content block insertion with branch tracking
fn benchmark_insert_with_branch(c: &mut Criterion) {
    let mut group = c.benchmark_group("insert_with_branch");

    // Test with default threshold (50MB) - no fracture during benchmark
    group.bench_function("insert_default_threshold", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::new(&store);
        let space_id = [1u8; 32];
        let mut counter = 0u64;

        b.iter(|| {
            let mut thread_id = [0u8; 32];
            thread_id[..8].copy_from_slice(&counter.to_be_bytes());
            counter += 1;

            let block = create_test_block(thread_id, space_id);
            black_box(branch_store.put_content_block(block).unwrap());
        });
    });

    // Test with small threshold - frequent fractures
    group.bench_function("insert_small_threshold", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let branch_store = BranchAwareStore::with_fracture_threshold(&store, 5000);
        let space_id = [1u8; 32];
        let mut counter = 0u64;

        b.iter(|| {
            let mut thread_id = [0u8; 32];
            thread_id[..8].copy_from_slice(&counter.to_be_bytes());
            counter += 1;

            let block = create_test_block(thread_id, space_id);
            black_box(branch_store.put_content_block(block).unwrap());
        });
    });

    group.finish();
}

/// Benchmark space state lookup
fn benchmark_space_state_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("space_state_lookup");

    group.bench_function("get_space_branch_state", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let space_id = create_populated_space(&store, 100);

        // Trigger fracture to create state
        let manager = BranchManager::new(&store);
        let _ = manager.execute_fracture(&space_id, &BranchPath::root(), 1000);

        b.iter(|| {
            black_box(store.get_space_branch_state(&space_id).unwrap());
        });
    });

    group.finish();
}

/// Benchmark hash-to-branch matching
fn benchmark_hash_branch_matching(c: &mut Criterion) {
    let mut group = c.benchmark_group("hash_branch_matching");

    group.bench_function("assign_branch_unfractured", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);
        let space_id = [1u8; 32];
        let mut counter = 0u64;

        // Initialize space without fracturing
        let _ = manager.register_content_block(&space_id, &[0u8; 32], true, 100, 1000);

        b.iter(|| {
            let mut thread_id = [0u8; 32];
            thread_id[..8].copy_from_slice(&counter.to_be_bytes());
            counter = counter.wrapping_add(1);

            black_box(
                manager
                    .assign_branch_for_new_thread(&space_id, &thread_id)
                    .unwrap(),
            );
        });
    });

    group.bench_function("assign_branch_fractured", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let space_id = create_populated_space(&store, 100);

        // Trigger fracture
        let manager = BranchManager::new(&store);
        let _ = manager.execute_fracture(&space_id, &BranchPath::root(), 1000);

        let mut counter = 0u64;

        b.iter(|| {
            let mut thread_id = [0u8; 32];
            thread_id[..8].copy_from_slice(&counter.to_be_bytes());
            counter = counter.wrapping_add(1);

            black_box(
                manager
                    .assign_branch_for_new_thread(&space_id, &thread_id)
                    .unwrap(),
            );
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    benchmark_fracture_overhead,
    benchmark_branch_lookup,
    benchmark_insert_with_branch,
    benchmark_space_state_lookup,
    benchmark_hash_branch_matching,
);
criterion_main!(benches);
