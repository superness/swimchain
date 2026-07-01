//! Cache performance benchmarks (Milestone 3.4)
//!
//! Measures:
//! - Cache hit rate with Zipf distribution (realistic access patterns)
//! - Eviction overhead at various fill levels

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use rand::prelude::*;
use rand_distr::Zipf;
use std::sync::{Arc, RwLock};
use tempfile::tempdir;

use swimchain::storage::blob::{BlobStore, ContentBlobHash};
use swimchain::storage::cache::{CacheEntry, LruCache};
use swimchain::storage::config::StorageProfile;
use swimchain::storage::CachingContentStore;
use swimchain::types::content::SpaceId;
use swimchain::types::identity::IdentityId;

/// Benchmark scenarios for different device profiles
struct BenchScenario {
    name: &'static str,
    profile: StorageProfile,
    num_items: usize,
    num_accesses: usize,
}

const SCENARIOS: &[BenchScenario] = &[
    BenchScenario {
        name: "Budget_1GB",
        profile: StorageProfile::Budget1GB,
        num_items: 2000,
        num_accesses: 10000,
    },
    BenchScenario {
        name: "Standard_5GB",
        profile: StorageProfile::Standard5GB,
        num_items: 10000,
        num_accesses: 50000,
    },
    BenchScenario {
        name: "Flagship_10GB",
        profile: StorageProfile::Flagship10GB,
        num_items: 20000,
        num_accesses: 100000,
    },
];

/// Benchmark cache hit rate with Zipf distribution access pattern
fn bench_cache_hit_rate(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_hit_rate");
    // Limit sample size for faster CI runs
    group.sample_size(10);

    for scenario in SCENARIOS {
        group.bench_with_input(
            BenchmarkId::new("zipf_access", scenario.name),
            scenario,
            |b, scenario| {
                let dir = tempdir().unwrap();
                let user = IdentityId::from_bytes([1u8; 32]);
                let mut cache = LruCache::open(
                    dir.path().join("cache_index.json"),
                    scenario.profile.max_cache_bytes(),
                    scenario.profile.eviction_threshold(),
                    user,
                )
                .unwrap();

                // Pre-fill cache with items
                let items: Vec<ContentBlobHash> = (0..scenario.num_items)
                    .map(|i| {
                        let mut bytes = [0u8; 32];
                        bytes[..8].copy_from_slice(&(i as u64).to_le_bytes());
                        let hash = ContentBlobHash::from_bytes(bytes);
                        let entry = CacheEntry::new(
                            hash,
                            1024, // 1KB each
                            IdentityId::from_bytes([2u8; 32]),
                            SpaceId::from_bytes([3u8; 32]),
                            1_234_567_890,
                        );
                        cache.add_entry(entry);
                        hash
                    })
                    .collect();

                b.iter(|| {
                    let mut rng = rand::thread_rng();
                    let zipf = Zipf::new(scenario.num_items as u64, 1.0).unwrap();

                    cache.reset_statistics();

                    for _ in 0..scenario.num_accesses {
                        let idx = (zipf.sample(&mut rng) as usize)
                            .saturating_sub(1)
                            .min(items.len() - 1);
                        cache.access(&items[idx]);
                    }

                    cache.hit_rate()
                })
            },
        );
    }

    group.finish();
}

/// Benchmark eviction overhead at various fill levels
fn bench_eviction_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("eviction_overhead");
    // Limit sample size for faster CI runs
    group.sample_size(10);

    let fill_levels = [50u8, 75, 90, 95, 99];

    for fill_pct in fill_levels {
        group.bench_with_input(
            BenchmarkId::new("evict_at_fill_pct", fill_pct),
            &fill_pct,
            |b, &fill_pct| {
                let dir = tempdir().unwrap();
                let user = IdentityId::from_bytes([1u8; 32]);
                let max_bytes = 10_000_000u64; // 10MB for faster benchmarking
                let threshold = 0.90;

                let mut cache = LruCache::open(
                    dir.path().join("cache_index.json"),
                    max_bytes,
                    threshold,
                    user,
                )
                .unwrap();

                // Fill to target percentage
                let target_bytes = (max_bytes as f64 * f64::from(fill_pct) / 100.0) as u64;
                let entry_size = 1024u64;
                let num_entries = target_bytes / entry_size;

                for i in 0..num_entries {
                    let mut bytes = [0u8; 32];
                    bytes[..8].copy_from_slice(&i.to_le_bytes());
                    let hash = ContentBlobHash::from_bytes(bytes);
                    let entry = CacheEntry::new(
                        hash,
                        entry_size,
                        IdentityId::from_bytes([2u8; 32]),
                        SpaceId::from_bytes([3u8; 32]),
                        1_234_567_890,
                    );
                    cache.add_entry(entry);
                }

                b.iter(|| {
                    // Try to add 10KB, potentially triggering eviction
                    let _ = cache.evict_if_needed(10_240);
                })
            },
        );
    }

    group.finish();
}

/// Benchmark CachingContentStore put_with_metadata throughput
fn bench_caching_store_put(c: &mut Criterion) {
    let mut group = c.benchmark_group("caching_store_put");
    group.sample_size(10);

    let sizes = [(1024u64, "1KB"), (10_240, "10KB"), (102_400, "100KB")];

    for (size, name) in sizes {
        group.bench_with_input(BenchmarkId::new("put", name), &size, |b, &size| {
            let dir = tempdir().unwrap();
            let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
            let user = IdentityId::from_bytes([1u8; 32]);
            let cache = Arc::new(RwLock::new(
                LruCache::open(
                    dir.path().join("cache_index.json"),
                    100_000_000, // 100MB
                    0.9,
                    user,
                )
                .unwrap(),
            ));
            let config =
                swimchain::storage::StorageConfig::from_profile(StorageProfile::Standard5GB);
            let store = CachingContentStore::new_without_reconcile(blob_store, cache, config, user);

            let mut counter = 0u64;
            let owner = IdentityId::from_bytes([2u8; 32]);
            let space = SpaceId::from_bytes([3u8; 32]);

            b.iter(|| {
                // Generate unique data each time
                let mut data = vec![0u8; size as usize];
                data[..8].copy_from_slice(&counter.to_le_bytes());
                counter += 1;

                store.put_with_metadata(&data, owner, space, 1_234_567_890)
            })
        });
    }

    group.finish();
}

/// Benchmark statistics collection overhead
fn bench_statistics_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("statistics_overhead");

    let entry_counts = [100usize, 1000, 10000];

    for count in entry_counts {
        group.bench_with_input(
            BenchmarkId::new("collect_stats", count),
            &count,
            |b, &count| {
                let dir = tempdir().unwrap();
                let user = IdentityId::from_bytes([1u8; 32]);
                let mut cache = LruCache::open(
                    dir.path().join("cache_index.json"),
                    100_000_000_000, // 100GB to avoid eviction
                    0.99,
                    user,
                )
                .unwrap();

                // Fill with entries
                for i in 0..count {
                    let mut bytes = [0u8; 32];
                    bytes[..8].copy_from_slice(&(i as u64).to_le_bytes());
                    let hash = ContentBlobHash::from_bytes(bytes);
                    let entry = CacheEntry::new(
                        hash,
                        1024,
                        IdentityId::from_bytes([2u8; 32]),
                        SpaceId::from_bytes([3u8; 32]),
                        1_234_567_890,
                    );
                    cache.add_entry(entry);
                }

                b.iter(|| cache.statistics())
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_cache_hit_rate,
    bench_eviction_overhead,
    bench_caching_store_put,
    bench_statistics_overhead
);
criterion_main!(benches);
