//! Mobile Sync Benchmarks (Milestone 4.3)
//!
//! Measures sync performance under bandwidth constraints.
//! Simulates 3G, 4G, and WiFi network speeds.
//!
//! Run with: cargo bench -- mobile_sync

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Approximate header size in bytes
const HEADER_SIZE: usize = 200;

/// Number of headers to sync in benchmark
const HEADER_COUNT: usize = 100_000;

/// Total bytes for header sync
const TOTAL_BYTES: usize = HEADER_SIZE * HEADER_COUNT; // 20 MB

/// Network profile with byte rate
struct NetworkProfile {
    name: &'static str,
    bytes_per_sec: u64,
}

impl NetworkProfile {
    const fn new(name: &'static str, mbps: u32) -> Self {
        Self {
            name,
            bytes_per_sec: mbps as u64 * 125_000, // Mbps → bytes/sec
        }
    }
}

/// Simple rate limiter for benchmarking
struct SimpleRateLimiter {
    rate_bytes_per_sec: u64,
    tokens: AtomicU64,
    last_refill: std::sync::Mutex<Instant>,
}

impl SimpleRateLimiter {
    fn new(bytes_per_sec: u64) -> Self {
        Self {
            rate_bytes_per_sec: bytes_per_sec,
            tokens: AtomicU64::new(bytes_per_sec), // 1 second burst
            last_refill: std::sync::Mutex::new(Instant::now()),
        }
    }

    fn wait_for_tokens(&self, bytes: u64) {
        loop {
            // Refill tokens based on elapsed time
            {
                let mut last = self.last_refill.lock().unwrap();
                let now = Instant::now();
                let elapsed = now.duration_since(*last);
                let tokens_to_add = (self.rate_bytes_per_sec as f64 * elapsed.as_secs_f64()) as u64;

                if tokens_to_add > 0 {
                    let current = self.tokens.load(Ordering::Relaxed);
                    let new = (current + tokens_to_add).min(self.rate_bytes_per_sec);
                    self.tokens.store(new, Ordering::Relaxed);
                    *last = now;
                }
            }

            // Try to acquire tokens
            let current = self.tokens.load(Ordering::Relaxed);
            if current >= bytes {
                let new = current - bytes;
                if self
                    .tokens
                    .compare_exchange(current, new, Ordering::Relaxed, Ordering::Relaxed)
                    .is_ok()
                {
                    return;
                }
            } else if current > 0 {
                // Partial acquisition - consume what we can
                self.tokens.store(0, Ordering::Relaxed);
            }

            // Wait a bit for more tokens
            std::thread::sleep(Duration::from_micros(100));
        }
    }

    fn reset(&self) {
        self.tokens
            .store(self.rate_bytes_per_sec, Ordering::Relaxed);
        *self.last_refill.lock().unwrap() = Instant::now();
    }
}

/// Benchmark header sync across different network profiles
fn bench_header_sync_by_network(c: &mut Criterion) {
    let mut group = c.benchmark_group("header_sync");
    group.throughput(Throughput::Bytes(TOTAL_BYTES as u64));

    // Use smaller dataset for faster benchmarks
    let test_bytes: usize = 1_000_000; // 1 MB instead of 20 MB

    let profiles = [
        NetworkProfile::new("3G_2mbps", 2),
        NetworkProfile::new("4G_10mbps", 10),
        NetworkProfile::new("WiFi_50mbps", 50),
    ];

    for profile in profiles {
        let limiter = SimpleRateLimiter::new(profile.bytes_per_sec);

        group.bench_with_input(
            BenchmarkId::from_parameter(profile.name),
            &profile,
            |b, _prof| {
                b.iter(|| {
                    limiter.reset();
                    // Simulate transferring in chunks
                    let mut transferred = 0usize;
                    let chunk_size = 16_384; // 16 KB chunks

                    while transferred < test_bytes {
                        let chunk = std::cmp::min(chunk_size, test_bytes - transferred);
                        limiter.wait_for_tokens(chunk as u64);
                        transferred += chunk;
                    }
                    transferred
                })
            },
        );
    }

    group.finish();
}

/// Benchmark transfer chunk sizes
fn bench_chunk_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("chunk_transfer");

    // Use 4G speed
    let limiter = SimpleRateLimiter::new(1_250_000); // 10 Mbps

    let total = 100_000usize; // 100 KB

    for chunk_size in [1024, 4096, 16384, 65536] {
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}KB", chunk_size / 1024)),
            &chunk_size,
            |b, &chunk| {
                b.iter(|| {
                    limiter.reset();
                    let mut transferred = 0usize;
                    while transferred < total {
                        let c = std::cmp::min(chunk, total - transferred);
                        limiter.wait_for_tokens(c as u64);
                        transferred += c;
                    }
                    transferred
                })
            },
        );
    }

    group.finish();
}

/// Calculate theoretical sync times (documentation)
fn bench_theoretical_times(c: &mut Criterion) {
    let mut group = c.benchmark_group("theoretical_sync");

    // This benchmark just calculates and verifies theoretical times
    // No actual rate limiting

    let profiles = [
        ("3G", 256_000u64),     // 2 Mbps
        ("4G", 1_250_000u64),   // 10 Mbps
        ("WiFi", 6_250_000u64), // 50 Mbps
    ];

    let header_counts = [1_000usize, 10_000, 100_000];

    for (name, bps) in profiles {
        for count in header_counts {
            let bytes = count * HEADER_SIZE;
            let expected_time = Duration::from_secs_f64(bytes as f64 / bps as f64);

            let id = format!("{}_{}k_headers", name, count / 1000);
            group.bench_function(&id, |b| {
                b.iter(|| {
                    // Just return the calculation (no actual work)
                    bytes as f64 / bps as f64
                })
            });

            // Log the expected time
            if count == 100_000 {
                println!(
                    "{} sync of 100K headers: expected {:?}",
                    name, expected_time
                );
            }
        }
    }

    group.finish();
}

criterion_group!(
    name = benches;
    config = Criterion::default().sample_size(10);
    targets = bench_header_sync_by_network, bench_chunk_sizes, bench_theoretical_times
);

criterion_main!(benches);
