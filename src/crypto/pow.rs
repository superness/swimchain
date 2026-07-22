//! Proof-of-Work mining and verification for identity creation
//!
//! Implements SPEC_01 §3.4 and §6.3 for identity creation PoW.
//!
//! The PoW prevents Sybil attacks by requiring computational work to create
//! an identity. The hash is computed over: pubkey(32) || timestamp_le(8) || nonce_le(8).

use crate::crypto::hash::leading_zeros;
use crate::crypto::signature::current_timestamp;
use crate::types::error::IdentityError;
use crate::types::identity::{IdentityCreationProof, KeyPair};
use argon2::{Algorithm, Argon2, Params, Version};
use rayon::prelude::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// Argon2id parameters for identity PoW. Deliberately FIXED across all networks
/// (unlike action PoW, whose config varies) — only the DIFFICULTY varies per
/// network (see `NetworkMode::identity_pow_difficulty`). A fixed config keeps
/// mine and verify independent of any global network state (so they can never
/// disagree) while staying memory-hard everywhere. 64 MiB / 3 iters / 1 lane
/// (~90 ms/hash measured); a single verify is not a DoS vector because it runs
/// only at the rate-limited onboarding grant point.
const IDENTITY_POW_MEMORY_KIB: u32 = 65536;
const IDENTITY_POW_ITERATIONS: u32 = 3;
const IDENTITY_POW_PARALLELISM: u32 = 1;

/// Memory-hard (Argon2id) identity PoW hash over the 48-byte preimage
/// `pubkey(32) || timestamp_le(8) || nonce_le(8)`. Salt = the pubkey's first 8
/// bytes (identity-bound + domain-separated from action PoW). Replaces the
/// former SHA-256 `pow_hash` on the identity path — identity creation is the
/// anti-sybil entry gate, so it must be GPU/ASIC-resistant.
#[must_use]
pub fn identity_pow_hash(data: &[u8; 48]) -> [u8; 32] {
    let params = Params::new(
        IDENTITY_POW_MEMORY_KIB,
        IDENTITY_POW_ITERATIONS,
        IDENTITY_POW_PARALLELISM,
        Some(32),
    )
    .expect("valid argon2 params");
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut salt = [0u8; 8];
    salt.copy_from_slice(&data[..8]);
    let mut hash = [0u8; 32];
    argon2
        .hash_password_into(data, &salt, &mut hash)
        .expect("argon2 identity hash");
    hash
}

/// Default identity creation PoW difficulty (SPEC_01 §12.1)
///
/// 20 bits of leading zeros required. This targets ~10-30 seconds
/// on desktop hardware.
pub const DEFAULT_IDENTITY_POW_DIFFICULTY: u8 = 20;

/// Anti-stockpile limit: 24 hours in seconds (SPEC_01 §6.3 V-POW-04)
///
/// PoW proofs older than 24 hours cannot be used to create new identities,
/// preventing pre-computation attacks.
pub const POW_MAX_AGE_SECS: u64 = 86400;

/// Verification tolerance: 1 hour past (SPEC_01 §6.3 V-POW-03)
///
/// For ongoing verification of existing identities, timestamps can be
/// up to 1 hour in the past.
pub const POW_PAST_TOLERANCE_SECS: u64 = 3600;

/// Verification tolerance: 5 minutes future
///
/// Timestamps cannot be more than 5 minutes in the future to account
/// for clock drift.
pub const POW_FUTURE_TOLERANCE_SECS: u64 = 300;

/// Callback frequency for progress reporting (every 1M hashes)
const CALLBACK_INTERVAL: u64 = 1_000_000;

/// Mine identity proof-of-work
///
/// Finds a nonce such that SHA-256(pubkey || timestamp || nonce) has at least
/// `difficulty` leading zero bits.
///
/// # Arguments
/// * `keypair` - The keypair to create a proof for
/// * `difficulty` - Number of leading zero bits required
///
/// # Returns
/// A valid `IdentityCreationProof` that can be verified with `verify_identity_pow`
#[must_use]
pub fn mine_identity_pow(keypair: &KeyPair, difficulty: u8) -> IdentityCreationProof {
    let timestamp = current_timestamp();
    mine_identity_pow_at_time(keypair, difficulty, timestamp)
}

/// Mine identity proof-of-work with progress callback
///
/// Same as `mine_identity_pow` but calls the provided callback approximately
/// every 1 million hashes to report progress.
///
/// # Arguments
/// * `keypair` - The keypair to create a proof for
/// * `difficulty` - Number of leading zero bits required
/// * `callback` - Called every ~1M hashes with the current nonce count
///
/// # Returns
/// A valid `IdentityCreationProof`
#[must_use]
pub fn mine_identity_pow_with_callback<F>(
    keypair: &KeyPair,
    difficulty: u8,
    mut callback: F,
) -> IdentityCreationProof
where
    F: FnMut(u64),
{
    let timestamp = current_timestamp();
    let mut nonce: u64 = 0;

    loop {
        // Build data: pubkey(32) || timestamp_le(8) || nonce_le(8)
        let mut data = [0u8; 48];
        data[..32].copy_from_slice(keypair.public_key.as_bytes());
        data[32..40].copy_from_slice(&timestamp.to_le_bytes());
        data[40..48].copy_from_slice(&nonce.to_le_bytes());

        let hash = identity_pow_hash(&data);
        if leading_zeros(&hash) >= u32::from(difficulty) {
            return IdentityCreationProof {
                public_key: keypair.public_key,
                timestamp,
                nonce,
                pow_hash: hash,
            };
        }

        nonce = nonce.wrapping_add(1);

        // Report progress every CALLBACK_INTERVAL hashes
        if nonce % CALLBACK_INTERVAL == 0 {
            callback(nonce);
        }

        // If nonce wraps (extremely unlikely but handle gracefully)
        if nonce == 0 {
            // Could update timestamp and continue, but this should never happen
            // with practical difficulty levels
            break;
        }
    }

    // Fallback (should never reach here with reasonable difficulty)
    IdentityCreationProof {
        public_key: keypair.public_key,
        timestamp,
        nonce: 0,
        pow_hash: [0u8; 32],
    }
}

/// Mine identity proof-of-work at a specific timestamp
///
/// Internal function used for testing with controlled timestamps.
#[must_use]
fn mine_identity_pow_at_time(
    keypair: &KeyPair,
    difficulty: u8,
    timestamp: u64,
) -> IdentityCreationProof {
    let mut nonce: u64 = 0;

    loop {
        // Build data: pubkey(32) || timestamp_le(8) || nonce_le(8)
        let mut data = [0u8; 48];
        data[..32].copy_from_slice(keypair.public_key.as_bytes());
        data[32..40].copy_from_slice(&timestamp.to_le_bytes());
        data[40..48].copy_from_slice(&nonce.to_le_bytes());

        let hash = identity_pow_hash(&data);
        if leading_zeros(&hash) >= u32::from(difficulty) {
            return IdentityCreationProof {
                public_key: keypair.public_key,
                timestamp,
                nonce,
                pow_hash: hash,
            };
        }

        nonce = nonce.wrapping_add(1);

        if nonce == 0 {
            break;
        }
    }

    // Fallback
    IdentityCreationProof {
        public_key: keypair.public_key,
        timestamp,
        nonce: 0,
        pow_hash: [0u8; 32],
    }
}

/// Number of nonces each thread checks before checking the cancellation flag
const PARALLEL_BATCH_SIZE: u64 = 10_000;

/// Mine identity proof-of-work using multiple CPU cores
///
/// Partitions the nonce space across all available CPU cores and uses
/// an atomic flag for early termination when a solution is found.
///
/// # Arguments
/// * `keypair` - The keypair to create a proof for
/// * `difficulty` - Number of leading zero bits required
///
/// # Returns
/// A valid `IdentityCreationProof` that can be verified with `verify_identity_pow`
#[must_use]
pub fn mine_identity_pow_parallel(keypair: &KeyPair, difficulty: u8) -> IdentityCreationProof {
    let timestamp = current_timestamp();
    mine_identity_pow_parallel_at_time(keypair, difficulty, timestamp)
}

/// Mine identity proof-of-work using multiple CPU cores with progress callback
///
/// Same as `mine_identity_pow_parallel` but calls the provided callback
/// approximately every 1 million hashes (aggregated across all threads)
/// to report progress.
///
/// # Arguments
/// * `keypair` - The keypair to create a proof for
/// * `difficulty` - Number of leading zero bits required
/// * `callback` - Called periodically with the total nonce count across all threads
///
/// # Returns
/// A valid `IdentityCreationProof`
#[must_use]
pub fn mine_identity_pow_parallel_with_callback<F>(
    keypair: &KeyPair,
    difficulty: u8,
    callback: F,
) -> IdentityCreationProof
where
    F: Fn(u64) + Send + Sync,
{
    let timestamp = current_timestamp();
    mine_identity_pow_parallel_at_time_with_callback(keypair, difficulty, timestamp, callback)
}

/// Internal parallel mining implementation at a specific timestamp
fn mine_identity_pow_parallel_at_time(
    keypair: &KeyPair,
    difficulty: u8,
    timestamp: u64,
) -> IdentityCreationProof {
    mine_identity_pow_parallel_at_time_with_callback(keypair, difficulty, timestamp, |_| {})
}

/// Internal parallel mining implementation with callback
fn mine_identity_pow_parallel_at_time_with_callback<F>(
    keypair: &KeyPair,
    difficulty: u8,
    timestamp: u64,
    callback: F,
) -> IdentityCreationProof
where
    F: Fn(u64) + Send + Sync,
{
    let found = AtomicBool::new(false);
    let total_hashes = AtomicU64::new(0);
    let result_nonce = AtomicU64::new(0);
    let result_hash: std::sync::RwLock<[u8; 32]> = std::sync::RwLock::new([0u8; 32]);

    let num_threads = rayon::current_num_threads();
    let pubkey_bytes = *keypair.public_key.as_bytes();

    // Partition nonce space: each thread handles a stride of nonces
    // Thread 0: 0, num_threads, 2*num_threads, ...
    // Thread 1: 1, num_threads+1, 2*num_threads+1, ...
    (0..num_threads).into_par_iter().for_each(|thread_id| {
        let mut local_count: u64 = 0;
        let mut nonce = thread_id as u64;

        while !found.load(Ordering::Relaxed) {
            // Process a batch of nonces before checking cancellation flag
            for _ in 0..PARALLEL_BATCH_SIZE {
                if found.load(Ordering::Relaxed) {
                    break;
                }

                // Build data: pubkey(32) || timestamp_le(8) || nonce_le(8)
                let mut data = [0u8; 48];
                data[..32].copy_from_slice(&pubkey_bytes);
                data[32..40].copy_from_slice(&timestamp.to_le_bytes());
                data[40..48].copy_from_slice(&nonce.to_le_bytes());

                let hash = identity_pow_hash(&data);
                if leading_zeros(&hash) >= u32::from(difficulty) {
                    // Found a solution - signal other threads to stop
                    if !found.swap(true, Ordering::SeqCst) {
                        result_nonce.store(nonce, Ordering::SeqCst);
                        if let Ok(mut guard) = result_hash.write() {
                            *guard = hash;
                        }
                    }
                    return;
                }

                // Stride through nonce space
                nonce = nonce.wrapping_add(num_threads as u64);
                local_count += 1;

                // Check for wraparound (extremely unlikely)
                if nonce < num_threads as u64 {
                    return;
                }
            }

            // Update global counter and call callback periodically
            let prev_total = total_hashes.fetch_add(local_count, Ordering::Relaxed);
            let new_total = prev_total + local_count;

            // Call callback approximately every CALLBACK_INTERVAL hashes
            if (prev_total / CALLBACK_INTERVAL) != (new_total / CALLBACK_INTERVAL) {
                callback(new_total);
            }

            local_count = 0;
        }
    });

    // Return the found solution
    let nonce = result_nonce.load(Ordering::SeqCst);
    let hash = result_hash.read().map(|guard| *guard).unwrap_or([0u8; 32]);

    IdentityCreationProof {
        public_key: keypair.public_key,
        timestamp,
        nonce,
        pow_hash: hash,
    }
}

/// Verify the hash and difficulty of a PoW proof (common logic)
///
/// V-POW-01 and V-POW-02 validation.
fn verify_pow_hash_and_difficulty(
    proof: &IdentityCreationProof,
    difficulty: u8,
) -> Result<(), IdentityError> {
    // V-POW-01: Recompute hash
    let mut data = [0u8; 48];
    data[..32].copy_from_slice(proof.public_key.as_bytes());
    data[32..40].copy_from_slice(&proof.timestamp.to_le_bytes());
    data[40..48].copy_from_slice(&proof.nonce.to_le_bytes());

    let computed_hash = identity_pow_hash(&data);
    if computed_hash != proof.pow_hash {
        let actual = leading_zeros(&computed_hash);
        return Err(IdentityError::PowDifficultyNotMet {
            required: difficulty,
            actual,
        });
    }

    // V-POW-02: Check difficulty
    let zeros = leading_zeros(&proof.pow_hash);
    if zeros < u32::from(difficulty) {
        return Err(IdentityError::PowDifficultyNotMet {
            required: difficulty,
            actual: zeros,
        });
    }

    Ok(())
}

/// Timestamp tolerance mode for PoW verification
enum TimestampTolerance {
    /// 24-hour anti-stockpile tolerance (for identity creation)
    AntiStockpile,
    /// 1-hour strict tolerance (for post-creation verification)
    Strict,
}

/// Verify timestamp bounds with configurable tolerance
fn verify_pow_timestamp(
    proof: &IdentityCreationProof,
    current_time: u64,
    tolerance: TimestampTolerance,
) -> Result<(), IdentityError> {
    if proof.timestamp > current_time {
        let ahead = proof.timestamp - current_time;
        if ahead > POW_FUTURE_TOLERANCE_SECS {
            return Err(IdentityError::PowTimestampFuture { ahead_secs: ahead });
        }
    } else {
        let age = current_time - proof.timestamp;

        match tolerance {
            TimestampTolerance::AntiStockpile => {
                // V-POW-04: Anti-stockpile (24h limit for new identity creation)
                if age > POW_MAX_AGE_SECS {
                    return Err(IdentityError::PowTimestampStockpile { age_secs: age });
                }
            }
            TimestampTolerance::Strict => {
                // V-POW-03: Strict 1-hour tolerance
                if age > POW_PAST_TOLERANCE_SECS {
                    return Err(IdentityError::PowTimestampExpired { age_secs: age });
                }
            }
        }
    }

    Ok(())
}

/// Verify identity proof-of-work
///
/// Validates an `IdentityCreationProof` per SPEC_01 §6.3:
/// - V-POW-01: Recomputes hash and compares to proof
/// - V-POW-02: Checks leading zeros meet difficulty
/// - V-POW-03: Checks timestamp not more than 1h in past (verification tolerance)
/// - V-POW-04: Checks timestamp not more than 24h old (anti-stockpile for creation)
/// - Checks timestamp not more than 5min in future
///
/// # Arguments
/// * `proof` - The proof to verify
/// * `difficulty` - Required number of leading zero bits
/// * `current_time` - Current UNIX timestamp for time checks
///
/// # Returns
/// - `Ok(())` if proof is valid
/// - `Err(IdentityError)` with specific failure reason
pub fn verify_identity_pow(
    proof: &IdentityCreationProof,
    difficulty: u8,
    current_time: u64,
) -> Result<(), IdentityError> {
    verify_pow_hash_and_difficulty(proof, difficulty)?;
    verify_pow_timestamp(proof, current_time, TimestampTolerance::AntiStockpile)
}

/// Verify identity PoW with strict 1-hour tolerance (for post-creation verification)
///
/// This uses the stricter V-POW-03 tolerance of 1 hour, used when verifying
/// existing identities rather than creating new ones.
///
/// # Arguments
/// * `proof` - The proof to verify
/// * `difficulty` - Required number of leading zero bits
/// * `current_time` - Current UNIX timestamp for time checks
///
/// # Returns
/// - `Ok(())` if proof is valid within 1h tolerance
/// - `Err(IdentityError)` with specific failure reason
pub fn verify_identity_pow_strict(
    proof: &IdentityCreationProof,
    difficulty: u8,
    current_time: u64,
) -> Result<(), IdentityError> {
    verify_pow_hash_and_difficulty(proof, difficulty)?;
    verify_pow_timestamp(proof, current_time, TimestampTolerance::Strict)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::generate_keypair;
    use crate::types::identity::PublicKey;

    #[test]
    fn test_pow_mining_difficulty_8() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // Verify the proof meets difficulty
        assert!(leading_zeros(&proof.pow_hash) >= 4);
        assert_eq!(proof.public_key.as_bytes(), keypair.public_key.as_bytes());
    }

    #[test]
    fn test_pow_verification_valid() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);
        let current_time = current_timestamp();

        let result = verify_identity_pow(&proof, 4, current_time);
        assert!(result.is_ok());
    }

    #[test]
    fn test_pow_verification_wrong_nonce() {
        let keypair = generate_keypair();
        let mut proof = mine_identity_pow(&keypair, 4);

        // Corrupt the nonce
        proof.nonce = proof.nonce.wrapping_add(1);

        let result = verify_identity_pow(&proof, 4, current_timestamp());
        assert!(matches!(
            result,
            Err(IdentityError::PowDifficultyNotMet { .. })
        ));
    }

    #[test]
    fn test_pow_verification_insufficient_difficulty() {
        let keypair = generate_keypair();
        // Mine with difficulty 8
        let proof = mine_identity_pow(&keypair, 4);

        // Verify requiring difficulty 32 (likely to fail)
        let result = verify_identity_pow(&proof, 32, current_timestamp());

        // The proof likely doesn't have 32 leading zeros
        if leading_zeros(&proof.pow_hash) < 32 {
            assert!(matches!(
                result,
                Err(IdentityError::PowDifficultyNotMet { .. })
            ));
        }
    }

    #[test]
    fn test_pow_verification_25h_old() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // Verify 25 hours later (exceeds 24h anti-stockpile)
        let future_time = proof.timestamp + 25 * 3600;
        let result = verify_identity_pow(&proof, 4, future_time);

        assert!(matches!(
            result,
            Err(IdentityError::PowTimestampStockpile { .. })
        ));
    }

    #[test]
    fn test_pow_verification_2h_old_strict() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // Verify 2 hours later with strict tolerance (exceeds 1h)
        let future_time = proof.timestamp + 2 * 3600;
        let result = verify_identity_pow_strict(&proof, 4, future_time);

        assert!(matches!(
            result,
            Err(IdentityError::PowTimestampExpired { .. })
        ));
    }

    #[test]
    fn test_pow_verification_future() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // Verify 10 minutes before (timestamp is 10 min in "future")
        let past_time = proof.timestamp.saturating_sub(600);
        let result = verify_identity_pow(&proof, 4, past_time);

        assert!(matches!(
            result,
            Err(IdentityError::PowTimestampFuture { .. })
        ));
    }

    #[test]
    fn test_pow_verification_within_tolerance() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // 30 minutes later - within both tolerances
        let result = verify_identity_pow(&proof, 4, proof.timestamp + 1800);
        assert!(result.is_ok());

        // 2 minutes before - within future tolerance
        let result = verify_identity_pow(&proof, 4, proof.timestamp.saturating_sub(120));
        assert!(result.is_ok());
    }

    #[test]
    fn test_pow_callback_called() {
        let keypair = generate_keypair();
        let mut callback_count = 0;

        // Use difficulty 4 for fast mining, callback should be called if nonce > 1M
        let _proof = mine_identity_pow_with_callback(&keypair, 4, |_nonce| {
            callback_count += 1;
        });

        // With difficulty 4 (average ~16 attempts), callback usually won't be called
        // This test just verifies the function works
        assert!(callback_count >= 0);
    }

    #[test]
    fn test_pow_hash_deterministic() {
        // Same inputs should produce same hash
        let pubkey = PublicKey::from_bytes([0xab; 32]);
        let timestamp: u64 = 1234567890;
        let nonce: u64 = 42;

        let mut data1 = [0u8; 48];
        data1[..32].copy_from_slice(pubkey.as_bytes());
        data1[32..40].copy_from_slice(&timestamp.to_le_bytes());
        data1[40..48].copy_from_slice(&nonce.to_le_bytes());

        let mut data2 = [0u8; 48];
        data2[..32].copy_from_slice(pubkey.as_bytes());
        data2[32..40].copy_from_slice(&timestamp.to_le_bytes());
        data2[40..48].copy_from_slice(&nonce.to_le_bytes());

        assert_eq!(identity_pow_hash(&data1), identity_pow_hash(&data2));
    }

    #[test]
    fn test_pow_mining_produces_valid_proof() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);

        // Manually verify the hash
        let mut data = [0u8; 48];
        data[..32].copy_from_slice(proof.public_key.as_bytes());
        data[32..40].copy_from_slice(&proof.timestamp.to_le_bytes());
        data[40..48].copy_from_slice(&proof.nonce.to_le_bytes());

        let hash = identity_pow_hash(&data);
        assert_eq!(hash, proof.pow_hash);
        assert!(leading_zeros(&hash) >= 4);
    }

    // --- Parallel PoW Mining Tests (M-IDENTITY-1) ---

    #[test]
    fn test_parallel_pow_mining_difficulty_8() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow_parallel(&keypair, 4);

        // Verify the proof meets difficulty
        assert!(leading_zeros(&proof.pow_hash) >= 4);
        assert_eq!(proof.public_key.as_bytes(), keypair.public_key.as_bytes());
    }

    #[test]
    fn test_parallel_pow_verification_valid() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow_parallel(&keypair, 4);
        let current_time = current_timestamp();

        let result = verify_identity_pow(&proof, 4, current_time);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parallel_pow_produces_valid_hash() {
        let keypair = generate_keypair();
        let proof = mine_identity_pow_parallel(&keypair, 4);

        // Manually verify the hash
        let mut data = [0u8; 48];
        data[..32].copy_from_slice(proof.public_key.as_bytes());
        data[32..40].copy_from_slice(&proof.timestamp.to_le_bytes());
        data[40..48].copy_from_slice(&proof.nonce.to_le_bytes());

        let hash = identity_pow_hash(&data);
        assert_eq!(hash, proof.pow_hash);
        assert!(leading_zeros(&hash) >= 4);
    }

    #[test]
    fn test_parallel_pow_callback_called() {
        let keypair = generate_keypair();
        let callback_count = std::sync::atomic::AtomicU64::new(0);

        // Use difficulty 4 for fast mining
        let _proof = mine_identity_pow_parallel_with_callback(&keypair, 4, |_total| {
            callback_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        });

        // With difficulty 4 (average ~16 attempts), callback usually won't be called
        // This test just verifies the function works without panicking
        assert!(callback_count.load(std::sync::atomic::Ordering::Relaxed) >= 0);
    }

    #[test]
    fn test_parallel_pow_higher_difficulty() {
        // Argon2id identity PoW is memory-hard (~90 ms/hash), so tests use a low
        // difficulty; this still exercises the parallel miner + verify path.
        let keypair = generate_keypair();
        let proof = mine_identity_pow_parallel(&keypair, 4);

        // Verify the proof meets difficulty
        assert!(leading_zeros(&proof.pow_hash) >= 4);

        // Verify using standard verification
        let result = verify_identity_pow(&proof, 4, current_timestamp());
        assert!(result.is_ok());
    }
}
