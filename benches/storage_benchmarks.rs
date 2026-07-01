//! Storage layer benchmarks (SPEC_07 - Milestone 1.6)
//!
//! Measures I/O latency for storage operations.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use swimchain::blocks::{BranchPath, ContentBlock, RootBlock, SpaceBlock, INITIAL_DIFFICULTY};
use swimchain::storage::{
    BlobStore, CacheEntry, ChainStore, ContentBlobHash, LruCache, Manifest, StorageConfig,
    StorageManager, CHUNK_SIZE,
};
use swimchain::types::content::SpaceId;
use swimchain::types::identity::IdentityId;
use tempfile::tempdir;

fn create_test_root_block(height: u64) -> RootBlock {
    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: [height as u8; 32],
        timestamp: 1_000_000 + height,
        merkle_root: [0u8; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: 0,
        difficulty_target: INITIAL_DIFFICULTY,
        height,
    }
}

fn create_test_space_block(id: u8) -> SpaceBlock {
    SpaceBlock {
        space_id: [id; 32],
        merkle_root: [0u8; 32],
        content_block_hashes: vec![],
        prev_space_hash: None,
        timestamp: 1_000_000,
        total_pow: 0,
        content_block_count: 0,
    }
}

fn create_test_content_block(id: u8) -> ContentBlock {
    ContentBlock {
        thread_root_id: [id; 32],
        space_id: [0u8; 32],
        actions: vec![],
        merkle_root: [0u8; 32],
        prev_content_hash: None,
        timestamp: 1_000_000,
        total_pow: 0,
        branch_path: BranchPath::root(),
    }
}

/// Benchmark sequential block writes
fn bench_sequential_write_blocks(c: &mut Criterion) {
    let mut group = c.benchmark_group("sequential_write");
    group.throughput(Throughput::Elements(1));

    group.bench_function("root_block", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();
        let mut height = 0u64;

        b.iter(|| {
            let block = create_test_root_block(height);
            let hash = store.put_root_block(&block).unwrap();
            height += 1;
            black_box(hash)
        })
    });

    group.bench_function("space_block", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();
        let mut id = 0u8;

        b.iter(|| {
            let block = create_test_space_block(id);
            let hash = store.put_space_block(&block).unwrap();
            id = id.wrapping_add(1);
            black_box(hash)
        })
    });

    group.bench_function("content_block", |b| {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();
        let mut id = 0u8;

        b.iter(|| {
            let block = create_test_content_block(id);
            let hash = store.put_content_block(&block).unwrap();
            id = id.wrapping_add(1);
            black_box(hash)
        })
    });

    group.finish();
}

/// Benchmark sequential blob writes
fn bench_sequential_write_blobs(c: &mut Criterion) {
    let mut group = c.benchmark_group("blob_write");

    for size in [1024, 4096, 65536, 1048576].iter() {
        let data: Vec<u8> = (0..*size).map(|i| (i % 256) as u8).collect();

        group.throughput(Throughput::Bytes(*size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), &data, |b, data| {
            let dir = tempdir().unwrap();
            let store = BlobStore::new(dir.path().join("blobs")).unwrap();

            b.iter(|| {
                // Modify data slightly to avoid content-addressed dedup
                let mut modified = data.clone();
                modified[0] = rand::random();
                black_box(store.put(&modified).unwrap())
            })
        });
    }

    group.finish();
}

/// Benchmark random block reads
fn bench_random_read_blocks(c: &mut Criterion) {
    let mut group = c.benchmark_group("random_read");
    group.throughput(Throughput::Elements(1));

    // Pre-populate with blocks
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut hashes = Vec::new();
    for i in 0..1000 {
        let block = create_test_root_block(i);
        let hash = store.put_root_block(&block).unwrap();
        hashes.push(hash);
    }
    store.flush().unwrap();

    group.bench_function("root_block_1000", |b| {
        b.iter(|| {
            let idx = rand::random::<usize>() % hashes.len();
            black_box(store.get_root_block(&hashes[idx]).unwrap())
        })
    });

    group.finish();
}

/// Benchmark random blob reads
fn bench_random_read_blobs(c: &mut Criterion) {
    let mut group = c.benchmark_group("blob_read");

    for size in [1024, 65536, 1048576].iter() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        // Pre-populate with blobs
        let mut hashes = Vec::new();
        for i in 0..100 {
            let data: Vec<u8> = (0..*size).map(|j| ((i + j) % 256) as u8).collect();
            let hash = store.put(&data).unwrap();
            hashes.push(hash);
        }

        group.throughput(Throughput::Bytes(*size as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}_bytes", size)),
            &hashes,
            |b, hashes| {
                b.iter(|| {
                    let idx = rand::random::<usize>() % hashes.len();
                    black_box(store.get(&hashes[idx]).unwrap())
                })
            },
        );
    }

    group.finish();
}

/// Benchmark cache operations
fn bench_cache_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache");

    group.bench_function("add_entry", |b| {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache.json"),
            10_000_000_000,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();
        let mut idx = 0u8;

        b.iter(|| {
            let entry = CacheEntry::new(
                ContentBlobHash::from_bytes([idx; 32]),
                1000,
                IdentityId::from_bytes([2u8; 32]),
                SpaceId::from_bytes([3u8; 32]),
                1_000_000,
            );
            cache.add_entry(entry);
            idx = idx.wrapping_add(1);
        })
    });

    group.bench_function("access", |b| {
        let dir = tempdir().unwrap();
        let mut cache = LruCache::open(
            dir.path().join("cache.json"),
            10_000_000_000,
            0.9,
            IdentityId::from_bytes([1u8; 32]),
        )
        .unwrap();

        // Pre-populate
        let mut hashes = Vec::new();
        for i in 0..1000 {
            let hash = ContentBlobHash::from_bytes([i as u8; 32]);
            let entry = CacheEntry::new(
                hash,
                1000,
                IdentityId::from_bytes([2u8; 32]),
                SpaceId::from_bytes([3u8; 32]),
                1_000_000,
            );
            cache.add_entry(entry);
            hashes.push(hash);
        }

        b.iter(|| {
            let idx = rand::random::<usize>() % hashes.len();
            cache.access(&hashes[idx]);
        })
    });

    group.finish();
}

/// Benchmark eviction performance
fn bench_eviction(c: &mut Criterion) {
    let mut group = c.benchmark_group("eviction");

    for count in [100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(count), count, |b, &count| {
            let dir = tempdir().unwrap();
            let mut cache = LruCache::open(
                dir.path().join("cache.json"),
                1_000_000_000, // 1GB limit
                0.9,
                IdentityId::from_bytes([1u8; 32]),
            )
            .unwrap();

            // Pre-populate with evictable entries
            for i in 0..count {
                let entry = CacheEntry::new(
                    ContentBlobHash::from_bytes([(i % 256) as u8; 32]),
                    10_000, // 10KB each
                    IdentityId::from_bytes([2u8; 32]),
                    SpaceId::from_bytes([3u8; 32]),
                    1_000_000,
                );
                cache.add_entry(entry);
            }

            b.iter(|| {
                // Get eviction candidates for 1MB
                black_box(cache.get_eviction_candidates(1_048_576))
            })
        });
    }

    group.finish();
}

/// Benchmark manifest chunking
fn bench_manifest_chunking(c: &mut Criterion) {
    let mut group = c.benchmark_group("manifest");

    for size in [1_048_576, 5_242_880, 10_485_760].iter() {
        let data: Vec<u8> = (0..*size).map(|i| (i % 256) as u8).collect();

        group.throughput(Throughput::Bytes(*size as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}_bytes", size)),
            &data,
            |b, data| b.iter(|| black_box(Manifest::from_data_default(data))),
        );
    }

    group.finish();
}

/// Benchmark storage manager startup
fn bench_startup(c: &mut Criterion) {
    let mut group = c.benchmark_group("startup");

    group.bench_function("empty_db", |b| {
        b.iter(|| {
            let dir = tempdir().unwrap();
            let config = StorageConfig::with_base_path(dir.path().to_path_buf());
            black_box(StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap())
        })
    });

    // Create a pre-populated database for startup benchmarks
    let dir = tempdir().unwrap();
    {
        let config = StorageConfig::with_base_path(dir.path().to_path_buf());
        let manager = StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap();

        // Add some data
        for i in 0..100 {
            manager
                .chain()
                .put_root_block(&create_test_root_block(i))
                .unwrap();
        }
        for i in 0..1000 {
            let data: Vec<u8> = (0..10000).map(|j| ((i + j) % 256) as u8).collect();
            manager.blobs().put(&data).unwrap();
        }
        manager.flush().unwrap();
    }

    group.bench_function("populated_db", |b| {
        b.iter(|| {
            let config = StorageConfig::with_base_path(dir.path().to_path_buf());
            black_box(StorageManager::open(config, IdentityId::from_bytes([1u8; 32])).unwrap())
        })
    });

    group.finish();
}

/// Benchmark cache persistence
fn bench_cache_persist(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_persist");

    for count in [100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(count), count, |b, &count| {
            let dir = tempdir().unwrap();
            let mut cache = LruCache::open(
                dir.path().join("cache.json"),
                10_000_000_000,
                0.9,
                IdentityId::from_bytes([1u8; 32]),
            )
            .unwrap();

            // Pre-populate
            for i in 0..count {
                let entry = CacheEntry::new(
                    ContentBlobHash::from_bytes([(i % 256) as u8; 32]),
                    1000,
                    IdentityId::from_bytes([2u8; 32]),
                    SpaceId::from_bytes([3u8; 32]),
                    1_000_000,
                );
                cache.add_entry(entry);
            }

            b.iter(|| cache.persist().unwrap())
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_sequential_write_blocks,
    bench_sequential_write_blobs,
    bench_random_read_blocks,
    bench_random_read_blobs,
    bench_cache_operations,
    bench_eviction,
    bench_manifest_chunking,
    bench_startup,
    bench_cache_persist,
);

criterion_main!(benches);
