//! Multi-node benchmarks (Milestone 8.6)
//!
//! Benchmarks for multi-node operations:
//! - Node startup/shutdown time
//! - Connection establishment time
//! - Gossip propagation latency
//! - Sync performance
//!
//! Note: Some benchmarks require the message routing event loop
//! to be implemented for accurate measurements.

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::time::Duration;
use tempfile::TempDir;

use swimchain::crypto::signature::generate_keypair;
use swimchain::node::{NodeConfig, NodeManager};

/// Create a test node with ephemeral port
fn create_test_node() -> (NodeManager, TempDir) {
    let keypair = generate_keypair();
    let data_dir = TempDir::new().unwrap();

    let config = NodeConfig {
        listen_addr: "127.0.0.1:0".parse().unwrap(),
        data_dir: data_dir.path().to_path_buf(),
        min_peers: 0,
        target_peers: 8,
        seeds: vec![],
        // These benches never talk RPC, and with rpc_port unset every node
        // binds the same fixed default port - concurrent nodes in
        // harness_creation then collide with "Address already in use".
        rpc_enabled: false,
        ..NodeConfig::default()
    };

    let node = NodeManager::new(config, keypair).unwrap();
    (node, data_dir)
}

/// Benchmark node startup time
fn bench_node_startup(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("node_startup", |b| {
        b.iter(|| {
            rt.block_on(async {
                let (mut node, _dir) = create_test_node();
                node.start().await.unwrap();
                node.stop().await.unwrap();
            });
        });
    });
}

/// Benchmark node shutdown time
fn bench_node_shutdown(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("node_shutdown", |b| {
        b.iter_custom(|iters| {
            let mut total = Duration::ZERO;
            for _ in 0..iters {
                let (mut node, _dir) = create_test_node();
                rt.block_on(async {
                    node.start().await.unwrap();
                });

                let start = std::time::Instant::now();
                rt.block_on(async {
                    node.stop().await.unwrap();
                });
                total += start.elapsed();
            }
            total
        });
    });
}

/// Benchmark multi-node harness creation
fn bench_harness_creation(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("harness_creation");

    for node_count in [2, 3, 5, 10].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(node_count),
            node_count,
            |b, &n| {
                b.iter(|| {
                    rt.block_on(async {
                        let mut nodes = Vec::with_capacity(n);
                        let mut dirs = Vec::with_capacity(n);

                        for _ in 0..n {
                            let (node, dir) = create_test_node();
                            nodes.push(node);
                            dirs.push(dir);
                        }

                        // Start all
                        for node in &mut nodes {
                            node.start().await.unwrap();
                        }

                        // Stop all
                        for node in &mut nodes {
                            node.stop().await.unwrap();
                        }
                    });
                });
            },
        );
    }

    group.finish();
}

/// Benchmark subsystem accessor overhead
fn bench_subsystem_access(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (mut node, _dir) = create_test_node();
    rt.block_on(async { node.start().await.unwrap() });

    c.bench_function("chain_store_access", |b| {
        b.iter(|| {
            let _ = node.chain_store();
        });
    });

    c.bench_function("connection_manager_access", |b| {
        b.iter(|| {
            let _ = node.connection_manager();
        });
    });

    rt.block_on(async { node.stop().await.unwrap() });
}

criterion_group!(
    multi_node_benches,
    bench_node_startup,
    bench_node_shutdown,
    bench_harness_creation,
    bench_subsystem_access,
);

criterion_main!(multi_node_benches);
