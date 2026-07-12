//! End-to-end RPC benchmarks
//!
//! Starts a real regtest node (ephemeral P2P + RPC ports) and measures
//! JSON-RPC round-trips through the same HTTP client path the CLI uses
//! (new TCP connection per call, cookie auth). This tracks how changes to
//! the RPC dispatch, storage, and block-building layers affect what a
//! client actually experiences:
//!
//! - `rpc_read/*` — hot read methods clients poll (get_info, list_spaces, ...)
//! - `rpc_use_case/feed_poll` — one feed-client polling tick (3 calls)
//! - `rpc_use_case/create_space` — full client flow: PoW mine + sign + RPC
//! - `rpc_use_case/submit_post` — full posting flow into an existing space
//! - `rpc_use_case/list_space_content_populated` — listing a space with content
//!
//! The RPC rate-limit backstop is lifted via SWIMCHAIN_RPC_*_PER_MINUTE env
//! vars (see src/rpc/rate_limiter.rs) since the bench loop intentionally
//! exceeds the runaway-client limits.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use criterion::{criterion_group, criterion_main, Criterion};
use serde_json::json;
use tempfile::TempDir;

use swimchain::crypto::action_pow::{compute_pow, ActionType, ForkPoWConfig, PoWChallenge};
use swimchain::crypto::sha256;
use swimchain::crypto::signature::{generate_keypair, sign_content};
use swimchain::identity::{sign, KeyPair};
use swimchain::network::NetworkMode;
use swimchain::node::{NodeConfig, NodeManager};
use swimchain::rpc::{RpcClient, RpcClientConfig, RpcResponse};

/// Regtest action-PoW difficulty (NetworkMode::Regtest.adjusted_difficulty).
const REGTEST_DIFFICULTY: u8 = 4;

/// A running regtest node with an RPC server on an ephemeral port.
struct BenchNode {
    rt: tokio::runtime::Runtime,
    manager: NodeManager,
    keypair: KeyPair,
    data_dir: TempDir,
}

impl BenchNode {
    fn start() -> Self {
        // Lift the localhost rate-limit backstop before the RPC server is built.
        std::env::set_var("SWIMCHAIN_RPC_READ_PER_MINUTE", "100000000");
        std::env::set_var("SWIMCHAIN_RPC_WRITE_PER_MINUTE", "100000000");

        let rt = tokio::runtime::Runtime::new().unwrap();
        let keypair = generate_keypair();
        let data_dir = TempDir::new().unwrap();

        let config = NodeConfig {
            network_mode: NetworkMode::Regtest,
            listen_addr: "127.0.0.1:0".parse().unwrap(),
            data_dir: data_dir.path().to_path_buf(),
            min_peers: 0,
            target_peers: 1,
            seeds: vec![],
            rpc_port: Some(0),
            ..NodeConfig::default()
        };

        let mut manager = NodeManager::new(config, keypair.clone()).unwrap();
        rt.block_on(manager.start()).unwrap();

        Self {
            rt,
            manager,
            keypair,
            data_dir,
        }
    }

    fn client(&self) -> RpcClient {
        let addr = self.manager.rpc_addr().expect("RPC server not listening");
        let config = RpcClientConfig {
            addr,
            timeout: Duration::from_secs(10),
            cookie: None,
            username: None,
            password: None,
        }
        .with_cookie_from(self.data_dir.path())
        .expect("failed to load RPC auth cookie");
        RpcClient::new(config)
    }

    fn stop(mut self) {
        let _ = self.rt.block_on(self.manager.stop());
    }
}

/// Call an RPC method and panic (loudly, with the method name) on any error,
/// so a broken method fails the bench run instead of tracking error-path timings.
fn call_ok(client: &mut RpcClient, method: &str, params: serde_json::Value) -> RpcResponse {
    let response = client
        .call(method, params)
        .unwrap_or_else(|e| panic!("{method} transport error: {e}"));
    if let Some(err) = &response.error {
        panic!("{method} returned error: {} ({})", err.message, err.code);
    }
    response
}

/// Full client-side space creation: mine PoW, sign, submit. Mirrors
/// `sw space create` (src/cli/commands/space.rs). Returns the new space ID.
fn create_space_via_rpc(client: &mut RpcClient, keypair: &KeyPair, name: &str) -> String {
    let challenge = PoWChallenge::generate(
        ActionType::SpaceCreation,
        name.as_bytes(),
        keypair.public_key.as_bytes(),
        REGTEST_DIFFICULTY,
    );
    let solution = compute_pow(&challenge, &ForkPoWConfig::test()).unwrap();

    // Space ID derives from the PoW hash; signature covers space_id || name || timestamp.
    let space_id_bytes: [u8; 16] = solution.hash[..16].try_into().unwrap();
    let timestamp = solution.challenge.timestamp;
    let mut message = Vec::with_capacity(16 + name.len() + 8);
    message.extend_from_slice(&space_id_bytes);
    message.extend_from_slice(name.as_bytes());
    message.extend_from_slice(&timestamp.to_be_bytes());
    let signature = sign(&keypair.private_key, &message);

    let response = call_ok(
        client,
        "create_space",
        json!({
            "name": name,
            "creator_id": hex::encode(keypair.public_key.as_bytes()),
            "pow_nonce": solution.nonce,
            "pow_difficulty": REGTEST_DIFFICULTY,
            "pow_nonce_space": hex::encode(solution.challenge.nonce_space),
            "pow_hash": hex::encode(solution.hash),
            "signature": hex::encode(signature.as_bytes()),
            "timestamp": timestamp,
        }),
    );

    response
        .result
        .and_then(|r| r.get("space_id").and_then(|v| v.as_str().map(String::from)))
        .expect("create_space result missing space_id")
}

/// Full client-side posting flow: mine PoW, sign, submit. Mirrors
/// `sw post create` (src/cli/commands/post.rs). `n` makes content unique
/// (content-addressed storage rejects identical posts).
fn submit_post_via_rpc(client: &mut RpcClient, keypair: &KeyPair, space_id: &str, n: u64) {
    let title = format!("bench post {n}");
    let body = format!("benchmark post body {n}");
    let post_content = format!("{title}\n\n{body}");

    let challenge = PoWChallenge::generate(
        ActionType::Post,
        post_content.as_bytes(),
        keypair.public_key.as_bytes(),
        REGTEST_DIFFICULTY,
    );
    let solution = compute_pow(&challenge, &ForkPoWConfig::test()).unwrap();

    let content_hash = sha256(post_content.as_bytes());
    let timestamp = solution.challenge.timestamp;
    let signature = sign_content(&keypair.private_key, &content_hash, timestamp);

    call_ok(
        client,
        "submit_post",
        json!({
            "space_id": space_id,
            "title": title,
            "body": body,
            "author_id": hex::encode(keypair.public_key.as_bytes()),
            "pow_nonce": solution.nonce,
            "pow_difficulty": REGTEST_DIFFICULTY,
            "pow_nonce_space": hex::encode(solution.challenge.nonce_space),
            "pow_hash": hex::encode(solution.hash),
            "signature": hex::encode(signature.as_bytes()),
            "timestamp": timestamp,
        }),
    );
}

/// Hot read methods on a fresh (empty-chain) node, plus one feed polling tick.
fn bench_rpc_reads(c: &mut Criterion) {
    let node = BenchNode::start();
    let mut client = node.client();

    let mut group = c.benchmark_group("rpc_read");
    for method in [
        "get_info",
        "get_sync_status",
        "get_chain_stats",
        "get_peers",
        "list_spaces",
    ] {
        // Fail fast with a clear message if the method itself is broken.
        call_ok(&mut client, method, json!({}));
        group.bench_function(method, |b| {
            b.iter(|| call_ok(&mut client, method, json!({})));
        });
    }
    group.finish();

    let mut group = c.benchmark_group("rpc_use_case");
    group.bench_function("feed_poll", |b| {
        b.iter(|| {
            call_ok(&mut client, "get_info", json!({}));
            call_ok(&mut client, "get_sync_status", json!({}));
            call_ok(&mut client, "list_spaces", json!({}));
        });
    });
    group.finish();

    node.stop();
}

/// Write-path use cases (PoW mine + sign + submit) and reads over a populated space.
fn bench_rpc_writes(c: &mut Criterion) {
    let node = BenchNode::start();
    let mut client = node.client();
    let counter = AtomicU64::new(0);

    let mut group = c.benchmark_group("rpc_use_case");
    // Write iterations grow the chain store as they run, so keep samples small
    // and let measured time dominate over statistical resolution.
    group.sample_size(10);

    group.bench_function("create_space", |b| {
        b.iter(|| {
            let n = counter.fetch_add(1, Ordering::Relaxed);
            create_space_via_rpc(&mut client, &node.keypair, &format!("bench space {n}"));
        });
    });

    let space_id = create_space_via_rpc(&mut client, &node.keypair, "bench post target");

    // Seed content so the list benchmark below measures a non-trivial space.
    for i in 0..25 {
        submit_post_via_rpc(&mut client, &node.keypair, &space_id, 1_000_000 + i);
    }

    group.bench_function("submit_post", |b| {
        b.iter(|| {
            let n = counter.fetch_add(1, Ordering::Relaxed);
            submit_post_via_rpc(&mut client, &node.keypair, &space_id, n);
        });
    });

    group.bench_function("list_space_content_populated", |b| {
        b.iter(|| {
            call_ok(
                &mut client,
                "list_space_content",
                json!({ "space_id": space_id, "limit": 20 }),
            );
        });
    });

    group.finish();
    node.stop();
}

criterion_group!(rpc_benches, bench_rpc_reads, bench_rpc_writes);
criterion_main!(rpc_benches);
