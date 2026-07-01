//! Content chunking benchmarks (SPEC_07 - Milestone 3.2)
//!
//! Measures performance of chunking operations at various file sizes.
//!
//! # Benchmark Results Format
//!
//! Results are output to docs/benchmarks/chunking.md after running:
//! ```sh
//! cargo bench --bench chunking
//! ```

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use swimchain::content::chunking::{chunk_data, ChunkedContentStore, Manifest};
use swimchain::storage::blob::CHUNK_SIZE;
use tempfile::tempdir;

/// Generate test data with a recognizable pattern
fn generate_test_data(size: usize) -> Vec<u8> {
    (0..size).map(|i| (i % 256) as u8).collect()
}

/// Benchmark chunk_data() function at various file sizes
fn bench_chunk_data(c: &mut Criterion) {
    let mut group = c.benchmark_group("chunk_data");

    // Test sizes: 2MB, 10MB, 50MB, 100MB
    // Note: 1GB would take too long for regular benchmarks
    for size_mb in [2, 10, 50, 100] {
        let size = size_mb * 1_048_576;
        let data = generate_test_data(size);

        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(
            BenchmarkId::new("size", format!("{}MB", size_mb)),
            &data,
            |b, data| {
                b.iter(|| {
                    let result = chunk_data(black_box(data));
                    black_box(result)
                })
            },
        );
    }
    group.finish();
}

/// Benchmark storing chunked content (includes hashing and I/O)
fn bench_store_chunked(c: &mut Criterion) {
    let mut group = c.benchmark_group("store_chunked");

    for size_mb in [2, 10, 50] {
        let size = size_mb * 1_048_576;
        let data = generate_test_data(size);

        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(
            BenchmarkId::new("size", format!("{}MB", size_mb)),
            &data,
            |b, data| {
                let dir = tempdir().unwrap();
                let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

                b.iter(|| {
                    let result = store.store(black_box(data));
                    black_box(result)
                })
            },
        );
    }
    group.finish();
}

/// Benchmark reassembling chunked content (includes I/O and hash verification)
fn bench_reassemble(c: &mut Criterion) {
    let mut group = c.benchmark_group("reassemble");

    for size_mb in [2, 10, 50] {
        let size = size_mb * 1_048_576;
        let data = generate_test_data(size);

        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(
            BenchmarkId::new("size", format!("{}MB", size_mb)),
            &size,
            |b, &_size| {
                let dir = tempdir().unwrap();
                let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();
                let reference = store.store(&data).unwrap();

                b.iter(|| {
                    let result = store.reassemble(black_box(&reference.manifest_hash));
                    black_box(result)
                })
            },
        );
    }
    group.finish();
}

/// Benchmark manifest serialization (JSON encoding)
fn bench_manifest_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("manifest_serialization");

    for chunk_count in [2, 10, 50, 100, 500, 1024] {
        let size = chunk_count * CHUNK_SIZE;
        let data = generate_test_data(size);
        let (manifest, _) = chunk_data(&data).unwrap();

        group.bench_with_input(
            BenchmarkId::new("chunks", chunk_count),
            &manifest,
            |b, manifest| {
                b.iter(|| {
                    let json = manifest.to_json();
                    black_box(json)
                })
            },
        );
    }
    group.finish();
}

/// Benchmark manifest deserialization (JSON parsing)
fn bench_manifest_deserialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("manifest_deserialization");

    for chunk_count in [2, 10, 50, 100, 500, 1024] {
        let size = chunk_count * CHUNK_SIZE;
        let data = generate_test_data(size);
        let (manifest, _) = chunk_data(&data).unwrap();
        let json_bytes = manifest.to_json().unwrap();

        group.bench_with_input(
            BenchmarkId::new("chunks", chunk_count),
            &json_bytes,
            |b, json_bytes| {
                b.iter(|| {
                    let parsed = Manifest::from_json(black_box(json_bytes));
                    black_box(parsed)
                })
            },
        );
    }
    group.finish();
}

/// Measure manifest overhead at various file sizes
/// This is a one-time measurement, not a repeated benchmark
fn measure_manifest_overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("manifest_overhead");
    group.sample_size(10); // Fewer samples since we just need the overhead value

    for size_mb in [1, 10, 100, 500, 1024] {
        let size = size_mb * 1_048_576;
        let data = generate_test_data(size);

        group.bench_with_input(
            BenchmarkId::new("file_size", format!("{}MB", size_mb)),
            &data,
            |b, data| {
                b.iter(|| {
                    let (manifest, _) = chunk_data(black_box(data)).unwrap();
                    let json = manifest.to_json().unwrap();
                    let overhead_percent = (json.len() as f64 / data.len() as f64) * 100.0;
                    black_box((json.len(), overhead_percent))
                })
            },
        );
    }
    group.finish();
}

/// Benchmark checking chunk availability
fn bench_check_availability(c: &mut Criterion) {
    let mut group = c.benchmark_group("check_availability");

    for chunk_count in [10, 50, 100] {
        let size = chunk_count * CHUNK_SIZE;
        let data = generate_test_data(size);

        group.bench_with_input(
            BenchmarkId::new("chunks", chunk_count),
            &chunk_count,
            |b, &_chunk_count| {
                let dir = tempdir().unwrap();
                let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();
                let reference = store.store(&data).unwrap();

                b.iter(|| {
                    let availability =
                        store.check_availability(black_box(&reference.manifest_hash));
                    black_box(availability)
                })
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_chunk_data,
    bench_store_chunked,
    bench_reassemble,
    bench_manifest_serialization,
    bench_manifest_deserialization,
    measure_manifest_overhead,
    bench_check_availability
);
criterion_main!(benches);
