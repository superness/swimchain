//! Performance benchmarks for Swimchain identity system
//!
//! Run with: cargo bench
//! Results saved to: target/criterion/

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};

use swimchain::crypto::action_pow::{
    compute_pow, verify_pow, ActionType, ForkPoWConfig, PoWChallenge,
};
use swimchain::crypto::address::{decode_address_to_pubkey, encode_address_from_pubkey};
use swimchain::crypto::pow::mine_identity_pow;
use swimchain::crypto::sha256;
use swimchain::crypto::signature::{current_timestamp, generate_keypair, sign, verify};
use swimchain::identity::{
    decrypt_private_key, encrypt_private_key, export_identity, import_identity,
};

/// Benchmark keypair generation
fn bench_keypair_generation(c: &mut Criterion) {
    c.bench_function("keypair_generation", |b| b.iter(generate_keypair));
}

/// Benchmark message signing with 32-byte message
fn bench_signing_32bytes(c: &mut Criterion) {
    let keypair = generate_keypair();
    let message = [0u8; 32];

    c.bench_function("sign_32bytes", |b| {
        b.iter(|| sign(&keypair.private_key, &message))
    });
}

/// Benchmark message signing with 1KB message
fn bench_signing_1kb(c: &mut Criterion) {
    let keypair = generate_keypair();
    let message = [0u8; 1024];

    c.bench_function("sign_1kb", |b| {
        b.iter(|| sign(&keypair.private_key, &message))
    });
}

/// Benchmark signature verification
fn bench_verification(c: &mut Criterion) {
    let keypair = generate_keypair();
    let message = [0u8; 32];
    let signature = sign(&keypair.private_key, &message);

    c.bench_function("verify_signature", |b| {
        b.iter(|| verify(&keypair.public_key, &message, &signature))
    });
}

/// Benchmark address encoding
fn bench_address_encoding(c: &mut Criterion) {
    let keypair = generate_keypair();

    c.bench_function("encode_address", |b| {
        b.iter(|| encode_address_from_pubkey(&keypair.public_key))
    });
}

/// Benchmark address decoding
fn bench_address_decoding(c: &mut Criterion) {
    let keypair = generate_keypair();
    let address = encode_address_from_pubkey(&keypair.public_key);

    c.bench_function("decode_address", |b| {
        b.iter(|| decode_address_to_pubkey(&address))
    });
}

/// Benchmark PoW mining at various difficulties
///
/// NOTE: These benchmarks can take significant time for higher difficulties.
/// - Difficulty 8: ~1ms average (256 attempts)
/// - Difficulty 12: ~16ms average (4096 attempts)
/// - Difficulty 16: ~260ms average (65536 attempts)
/// - Difficulty 20: ~4s average (1M attempts) - PRODUCTION DEFAULT
fn bench_pow_mining(c: &mut Criterion) {
    let mut group = c.benchmark_group("pow_mining");

    // Reduce sample size for PoW benchmarks (they're slow)
    group.sample_size(10);

    for difficulty in [8, 12, 16] {
        group.bench_with_input(
            BenchmarkId::from_parameter(difficulty),
            &difficulty,
            |b, &diff| {
                b.iter(|| {
                    let kp = generate_keypair();
                    mine_identity_pow(&kp, diff)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark PoW at production difficulty (20 bits)
///
/// This is a separate function because it takes significantly longer.
/// Run with: cargo bench -- pow_mining_production
fn bench_pow_mining_production(c: &mut Criterion) {
    let mut group = c.benchmark_group("pow_mining_production");

    // Very few samples for production difficulty
    group.sample_size(10);
    group.measurement_time(std::time::Duration::from_secs(60));

    group.bench_function("difficulty_20", |b| {
        b.iter(|| {
            let kp = generate_keypair();
            mine_identity_pow(&kp, 20)
        })
    });

    group.finish();
}

/// Benchmark private key encryption
fn bench_key_encryption(c: &mut Criterion) {
    let keypair = generate_keypair();
    let passphrase = "benchmark-passphrase-123";

    // Argon2 is intentionally slow, so this benchmark measures the
    // full cost of encrypting a key with a passphrase
    c.bench_function("encrypt_private_key", |b| {
        b.iter(|| encrypt_private_key(&keypair.private_key, passphrase))
    });
}

/// Benchmark private key decryption
fn bench_key_decryption(c: &mut Criterion) {
    let keypair = generate_keypair();
    let passphrase = "benchmark-passphrase-123";
    let encrypted = encrypt_private_key(&keypair.private_key, passphrase).unwrap();

    c.bench_function("decrypt_private_key", |b| {
        b.iter(|| decrypt_private_key(&encrypted, passphrase))
    });
}

/// Benchmark identity export (encryption + serialization)
fn bench_identity_export(c: &mut Criterion) {
    let (keypair, proof) = swimchain::identity::create_identity_with_difficulty(4);
    let passphrase = "export-passphrase";

    c.bench_function("export_identity", |b| {
        b.iter(|| export_identity(&keypair, Some(&proof), passphrase))
    });
}

/// Benchmark identity import (decryption + deserialization)
fn bench_identity_import(c: &mut Criterion) {
    let (keypair, proof) = swimchain::identity::create_identity_with_difficulty(4);
    let passphrase = "import-passphrase";
    let portable = export_identity(&keypair, Some(&proof), passphrase).unwrap();

    c.bench_function("import_identity", |b| {
        b.iter(|| import_identity(&portable, passphrase))
    });
}

// Group benchmarks for convenience
criterion_group!(
    name = identity_benches;
    config = Criterion::default();
    targets =
        bench_keypair_generation,
        bench_signing_32bytes,
        bench_signing_1kb,
        bench_verification,
        bench_address_encoding,
        bench_address_decoding
);

criterion_group!(
    name = pow_benches;
    config = Criterion::default()
        .sample_size(10);
    targets =
        bench_pow_mining
);

criterion_group!(
    name = storage_benches;
    config = Criterion::default()
        .sample_size(10);  // Argon2 is slow
    targets =
        bench_key_encryption,
        bench_key_decryption,
        bench_identity_export,
        bench_identity_import
);

// Note: bench_pow_mining_production is excluded from default runs
// Run it explicitly with: cargo bench -- pow_mining_production

// ============================================================================
// Action PoW Benchmarks (SPEC_03)
// ============================================================================

/// Benchmark single Argon2id hash at production parameters
///
/// This measures the verification time - which is constant regardless of difficulty
/// because it only computes one hash.
fn bench_action_pow_verification_production(c: &mut Criterion) {
    // Pre-compute a valid solution with test config for speed
    let test_config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"bench"),
        author_id: [0; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0; 8],
    };
    let solution = compute_pow(&challenge, &test_config).unwrap();

    // Now benchmark verification at production parameters (64 MiB)
    let prod_config = ForkPoWConfig::production();

    c.bench_function("action_pow_verify_64mib", |b| {
        b.iter(|| verify_pow(&solution, &prod_config, current_timestamp()))
    });
}

/// Benchmark action PoW verification at test parameters (1 MiB)
fn bench_action_pow_verification_test(c: &mut Criterion) {
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Reply,
        content_hash: sha256(b"verify-bench"),
        author_id: [1; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [1; 8],
    };
    let solution = compute_pow(&challenge, &config).unwrap();

    c.bench_function("action_pow_verify_1mib", |b| {
        b.iter(|| verify_pow(&solution, &config, current_timestamp()))
    });
}

/// Benchmark action PoW verification at mobile parameters (64 MiB, p=2)
fn bench_action_pow_verification_mobile(c: &mut Criterion) {
    // Pre-compute a valid solution with test config
    let test_config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"mobile-bench"),
        author_id: [2; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [2; 8],
    };
    let solution = compute_pow(&challenge, &test_config).unwrap();

    // Benchmark at mobile config
    let mobile_config = ForkPoWConfig::mobile();

    c.bench_function("action_pow_verify_mobile", |b| {
        b.iter(|| verify_pow(&solution, &mobile_config, current_timestamp()))
    });
}

/// Benchmark action PoW mining at test difficulties (using test config for speed)
///
/// NOTE: This uses test config (1 MiB) to keep benchmarks reasonable.
/// For production timing estimates, run bench_action_pow_mining_production.
fn bench_action_pow_mining_test(c: &mut Criterion) {
    let mut group = c.benchmark_group("action_pow_mining_test");
    group.sample_size(10);

    let config = ForkPoWConfig::test();

    for difficulty in [4, 8, 10, 12] {
        group.bench_with_input(
            BenchmarkId::from_parameter(difficulty),
            &difficulty,
            |b, &diff| {
                b.iter(|| {
                    let challenge = PoWChallenge {
                        action_type: ActionType::Post,
                        content_hash: sha256(b"mine"),
                        author_id: [0; 32],
                        timestamp: current_timestamp(),
                        difficulty: diff,
                        nonce_space: rand::random(),
                    };
                    compute_pow(&challenge, &config)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark action PoW mining at production parameters
///
/// WARNING: This is VERY SLOW. Each hash at 64 MiB takes ~50-200ms.
/// - Difficulty 8: ~256 attempts * 100ms = ~25 seconds
/// - Difficulty 12: ~4096 attempts * 100ms = ~7 minutes
///
/// Run explicitly with: cargo bench -- action_pow_production
fn bench_action_pow_mining_production(c: &mut Criterion) {
    let mut group = c.benchmark_group("action_pow_production");
    group.sample_size(10);
    group.measurement_time(std::time::Duration::from_secs(120));

    let config = ForkPoWConfig::production();

    // Only benchmark very low difficulty at production params
    group.bench_function("difficulty_4", |b| {
        b.iter(|| {
            let challenge = PoWChallenge {
                action_type: ActionType::Engage, // Lowest difficulty action
                content_hash: sha256(b"production-bench"),
                author_id: [0; 32],
                timestamp: current_timestamp(),
                difficulty: 4,
                nonce_space: rand::random(),
            };
            compute_pow(&challenge, &config)
        })
    });

    group.finish();
}

/// Benchmark comparing all three configurations for a single hash
fn bench_action_pow_config_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("action_pow_config_comparison");
    group.sample_size(20);

    // Prepare a challenge
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"config-compare"),
        author_id: [0; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0; 8],
    };

    // Test config (1 MiB)
    let test_config = ForkPoWConfig::test();
    let test_solution = compute_pow(&challenge, &test_config).unwrap();
    group.bench_function("test_1mib", |b| {
        b.iter(|| verify_pow(&test_solution, &test_config, current_timestamp()))
    });

    // Mobile config (64 MiB, p=2)
    let mobile_config = ForkPoWConfig::mobile();
    group.bench_function("mobile_64mib_p2", |b| {
        b.iter(|| verify_pow(&test_solution, &mobile_config, current_timestamp()))
    });

    // Production config (64 MiB, p=4)
    let prod_config = ForkPoWConfig::production();
    group.bench_function("prod_64mib_p4", |b| {
        b.iter(|| verify_pow(&test_solution, &prod_config, current_timestamp()))
    });

    group.finish();
}

criterion_group!(
    name = action_pow_benches;
    config = Criterion::default().sample_size(10);
    targets =
        bench_action_pow_verification_test,
        bench_action_pow_mining_test
);

criterion_group!(
    name = action_pow_config_benches;
    config = Criterion::default().sample_size(20);
    targets =
        bench_action_pow_verification_production,
        bench_action_pow_verification_mobile,
        bench_action_pow_config_comparison
);

// Note: bench_action_pow_mining_production is excluded from default runs
// Run it explicitly with: cargo bench -- action_pow_production

criterion_main!(
    identity_benches,
    pow_benches,
    storage_benches,
    action_pow_benches,
    action_pow_config_benches
);
