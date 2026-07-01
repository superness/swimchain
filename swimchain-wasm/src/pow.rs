//! Proof-of-Work mining and verification for identity creation
//!
//! Implements SPEC_01 §3.4 and §6.3 for identity creation PoW.
//! Mirrors the algorithm from src/crypto/pow.rs in the main crate.
//!
//! NOTE: This module only implements identity PoW (SHA-256 based).
//! Argon2id action PoW is NOT included due to 64 MiB memory requirements
//! being impractical in WASM environments.

use wasm_bindgen::prelude::*;

use crate::crypto::{leading_zeros_internal, sha256_internal};
use crate::error::{pow_failed, WasmError};

/// Minimum PoW difficulty (sanity check)
const MIN_DIFFICULTY: u8 = 1;

/// Maximum PoW difficulty (prevents infinite loops)
const MAX_DIFFICULTY: u8 = 64;

/// Default identity creation PoW difficulty (SPEC_01 §12.1)
const DEFAULT_IDENTITY_POW_DIFFICULTY: u8 = 20;

/// Result of successful PoW mining
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WasmPowSolution {
    /// The nonce that produced a valid hash
    nonce: u64,
    /// Number of hash attempts made
    attempts: u64,
    /// Time elapsed in milliseconds
    #[wasm_bindgen(js_name = "elapsedMs")]
    pub elapsed_ms: f64,
    /// Timestamp used in the PoW (UNIX seconds)
    timestamp: u64,
    /// The resulting hash (for verification)
    hash: [u8; 32],
}

#[wasm_bindgen]
impl WasmPowSolution {
    /// Get the nonce value
    #[wasm_bindgen(getter)]
    pub fn nonce(&self) -> js_sys::BigInt {
        js_sys::BigInt::from(self.nonce)
    }

    /// Get the number of attempts made
    #[wasm_bindgen(getter)]
    pub fn attempts(&self) -> js_sys::BigInt {
        js_sys::BigInt::from(self.attempts)
    }

    /// Get the timestamp used
    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> js_sys::BigInt {
        js_sys::BigInt::from(self.timestamp)
    }

    /// Get the resulting hash
    pub fn hash(&self) -> Vec<u8> {
        self.hash.to_vec()
    }

    /// Get the number of leading zeros in the hash
    #[wasm_bindgen(js_name = "leadingZeros")]
    pub fn leading_zeros(&self) -> u32 {
        leading_zeros_internal(&self.hash)
    }

    /// Get hash rate (hashes per second)
    #[wasm_bindgen(js_name = "hashRate")]
    pub fn hash_rate(&self) -> f64 {
        if self.elapsed_ms > 0.0 {
            (self.attempts as f64) / (self.elapsed_ms / 1000.0)
        } else {
            0.0
        }
    }
}

/// Mine identity proof-of-work
///
/// Finds a nonce such that SHA-256(pubkey || timestamp || nonce) has at least
/// `difficulty` leading zero bits.
///
/// # Arguments
/// * `public_key` - 32-byte Ed25519 public key
/// * `difficulty` - Number of leading zero bits required (1-64)
///
/// # Returns
/// A `WasmPowSolution` containing the nonce and metadata
///
/// # Errors
/// Returns an error if:
/// - Public key is not 32 bytes
/// - Difficulty is out of range
/// - Maximum attempts exceeded (extremely unlikely)
///
/// # Example (JavaScript)
/// ```js
/// const keypair = new WasmKeypair();
/// const solution = mine_identity_pow(keypair.publicKey(), 8);
/// console.log(solution.elapsedMs);
/// ```
#[wasm_bindgen]
pub fn mine_identity_pow(public_key: &[u8], difficulty: u8) -> Result<WasmPowSolution, JsValue> {
    mine_identity_pow_internal(public_key, difficulty, None).map_err(|e| e.into())
}

/// Mine identity proof-of-work with maximum attempts limit
///
/// Same as `mine_identity_pow` but stops after `max_attempts` hashes.
///
/// # Arguments
/// * `public_key` - 32-byte Ed25519 public key
/// * `difficulty` - Number of leading zero bits required (1-64)
/// * `max_attempts` - Maximum number of hash attempts
///
/// # Returns
/// A `WasmPowSolution` if successful
///
/// # Errors
/// Returns an error if max attempts is exceeded
#[wasm_bindgen(js_name = "mineIdentityPowWithLimit")]
pub fn mine_identity_pow_with_limit(
    public_key: &[u8],
    difficulty: u8,
    max_attempts: u64,
) -> Result<WasmPowSolution, JsValue> {
    mine_identity_pow_internal(public_key, difficulty, Some(max_attempts)).map_err(|e| e.into())
}

fn mine_identity_pow_internal(
    public_key: &[u8],
    difficulty: u8,
    max_attempts: Option<u64>,
) -> Result<WasmPowSolution, WasmError> {
    // Validate inputs
    if public_key.len() != 32 {
        return Err(crate::error::invalid_public_key(format!(
            "Public key must be 32 bytes, got {}",
            public_key.len()
        )));
    }

    if difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY {
        return Err(crate::error::invalid_difficulty(
            MIN_DIFFICULTY,
            MAX_DIFFICULTY,
            difficulty,
        ));
    }

    let start = js_sys::Date::now();
    let timestamp = (start / 1000.0) as u64;
    let max = max_attempts.unwrap_or(u64::MAX);

    // Build data template: pubkey(32) || timestamp_le(8) || nonce_le(8)
    let mut data = [0u8; 48];
    data[..32].copy_from_slice(public_key);
    data[32..40].copy_from_slice(&timestamp.to_le_bytes());

    for nonce in 0..max {
        // Update nonce in data
        data[40..48].copy_from_slice(&nonce.to_le_bytes());

        let hash = sha256_internal(&data);
        if leading_zeros_internal(&hash) >= u32::from(difficulty) {
            return Ok(WasmPowSolution {
                nonce,
                attempts: nonce + 1,
                elapsed_ms: js_sys::Date::now() - start,
                timestamp,
                hash,
            });
        }
    }

    Err(pow_failed(difficulty, max))
}

/// Verify identity proof-of-work
///
/// Validates that SHA-256(pubkey || timestamp || nonce) has at least
/// `difficulty` leading zero bits.
///
/// # Arguments
/// * `pubkey` - 32-byte Ed25519 public key
/// * `timestamp` - Timestamp used in the PoW (UNIX seconds)
/// * `nonce` - The nonce value (as BigInt in JavaScript)
/// * `difficulty` - Required number of leading zero bits
///
/// # Returns
/// `true` if the proof is valid, `false` otherwise
///
/// # Example (JavaScript)
/// ```js
/// const isValid = verify_identity_pow(
///   solution.hash(),
///   solution.timestamp,
///   solution.nonce,
///   8
/// );
/// ```
#[wasm_bindgen]
pub fn verify_identity_pow(pubkey: &[u8], timestamp: u64, nonce: u64, difficulty: u8) -> bool {
    if pubkey.len() != 32 {
        return false;
    }

    let mut data = [0u8; 48];
    data[..32].copy_from_slice(pubkey);
    data[32..40].copy_from_slice(&timestamp.to_le_bytes());
    data[40..48].copy_from_slice(&nonce.to_le_bytes());

    let hash = sha256_internal(&data);
    leading_zeros_internal(&hash) >= u32::from(difficulty)
}

/// Verify identity proof-of-work and return the hash
///
/// Same as `verify_identity_pow` but also returns the computed hash.
///
/// # Returns
/// The hash if valid, null otherwise
#[wasm_bindgen(js_name = "verifyIdentityPowWithHash")]
pub fn verify_identity_pow_with_hash(
    pubkey: &[u8],
    timestamp: u64,
    nonce: u64,
    difficulty: u8,
) -> Option<Vec<u8>> {
    if pubkey.len() != 32 {
        return None;
    }

    let mut data = [0u8; 48];
    data[..32].copy_from_slice(pubkey);
    data[32..40].copy_from_slice(&timestamp.to_le_bytes());
    data[40..48].copy_from_slice(&nonce.to_le_bytes());

    let hash = sha256_internal(&data);
    if leading_zeros_internal(&hash) >= u32::from(difficulty) {
        Some(hash.to_vec())
    } else {
        None
    }
}

/// Get the default identity PoW difficulty
#[wasm_bindgen(js_name = "getDefaultIdentityPowDifficulty")]
pub fn get_default_identity_pow_difficulty() -> u8 {
    DEFAULT_IDENTITY_POW_DIFFICULTY
}

/// Estimate time to mine at a given difficulty
///
/// Based on expected number of attempts: 2^difficulty
/// Assumes approximate hash rate (actual may vary by device).
///
/// # Arguments
/// * `difficulty` - Number of leading zero bits required
/// * `hash_rate` - Estimated hashes per second (optional, defaults to 500000)
///
/// # Returns
/// Estimated time in seconds
#[wasm_bindgen(js_name = "estimateMiningTime")]
pub fn estimate_mining_time(difficulty: u8, hash_rate: Option<f64>) -> f64 {
    let rate = hash_rate.unwrap_or(500_000.0);
    let expected_attempts = 2.0_f64.powi(i32::from(difficulty));
    expected_attempts / rate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_pow_valid() {
        // Use a fixed pubkey and find a low-difficulty solution manually
        let pubkey = [0u8; 32];
        let timestamp = 1234567890u64;

        // Find a nonce that gives at least 4 leading zeros
        for nonce in 0..100000u64 {
            let mut data = [0u8; 48];
            data[..32].copy_from_slice(&pubkey);
            data[32..40].copy_from_slice(&timestamp.to_le_bytes());
            data[40..48].copy_from_slice(&nonce.to_le_bytes());

            let hash = sha256_internal(&data);
            if leading_zeros_internal(&hash) >= 4 {
                assert!(verify_identity_pow(&pubkey, timestamp, nonce, 4));
                return;
            }
        }
        panic!("Could not find valid nonce in test");
    }

    #[test]
    fn test_verify_pow_invalid_nonce() {
        let pubkey = [0u8; 32];
        let timestamp = 1234567890u64;
        // Random nonce unlikely to have 20+ leading zeros
        assert!(!verify_identity_pow(&pubkey, timestamp, 12345, 20));
    }

    #[test]
    fn test_verify_pow_wrong_pubkey_length() {
        assert!(!verify_identity_pow(&[0u8; 31], 0, 0, 4));
        assert!(!verify_identity_pow(&[0u8; 33], 0, 0, 4));
    }

    #[test]
    fn test_estimate_mining_time() {
        // Difficulty 20 = 2^20 = ~1M attempts
        // At 500K h/s = ~2 seconds
        let estimate = estimate_mining_time(20, Some(500_000.0));
        assert!(estimate > 1.0 && estimate < 5.0);
    }
}
