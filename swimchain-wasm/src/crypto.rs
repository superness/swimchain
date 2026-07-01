//! Cryptographic hash functions for WASM
//!
//! Provides SHA-256 hashing and leading zeros counting for PoW verification.
//! Mirrors the algorithms from src/crypto/hash.rs in the main crate.

use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

/// Compute SHA-256 hash of data
///
/// Returns a 32-byte hash as a Uint8Array in JavaScript.
///
/// # Example (JavaScript)
/// ```js
/// const hash = sha256(new Uint8Array([1, 2, 3]));
/// console.log(hash.length); // 32
/// ```
#[wasm_bindgen]
pub fn sha256(data: &[u8]) -> Vec<u8> {
    sha256_internal(data).to_vec()
}

/// Internal SHA-256 function returning fixed array
pub(crate) fn sha256_internal(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Count leading zero bits in a hash
///
/// Used for proof-of-work difficulty verification.
/// Returns the number of leading zero bits (0-256 for a 32-byte hash).
///
/// # Example (JavaScript)
/// ```js
/// const hash = new Uint8Array(32);
/// hash[0] = 0x0F; // 4 leading zeros
/// console.log(leading_zeros(hash)); // 4
/// ```
#[wasm_bindgen]
pub fn leading_zeros(hash: &[u8]) -> u32 {
    leading_zeros_internal(hash)
}

/// Internal leading zeros function for use in other modules
pub(crate) fn leading_zeros_internal(hash: &[u8]) -> u32 {
    let mut count = 0;
    for byte in hash {
        if *byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros();
            break;
        }
    }
    count
}

/// Verify that a hash meets the required PoW difficulty
///
/// Returns true if the hash has at least `difficulty` leading zero bits.
#[wasm_bindgen]
pub fn verify_pow_difficulty(hash: &[u8], difficulty: u8) -> bool {
    leading_zeros_internal(hash) >= u32::from(difficulty)
}

/// Compute content ID from data
///
/// Returns a content ID in the format "sha256:<hex_hash>".
/// This matches the content addressing scheme used by Swimchain.
///
/// # Example (JavaScript)
/// ```js
/// const data = new TextEncoder().encode("Hello, World!");
/// const id = content_id(data);
/// console.log(id.startsWith("sha256:")); // true
/// ```
#[wasm_bindgen]
pub fn content_id(data: &[u8]) -> String {
    let hash = sha256_internal(data);
    format!("sha256:{}", hex::encode(hash))
}

/// Compute double SHA-256 (SHA-256 of SHA-256)
///
/// Used in some Bitcoin-style protocols for additional security.
#[wasm_bindgen]
pub fn double_sha256(data: &[u8]) -> Vec<u8> {
    let first = sha256_internal(data);
    sha256_internal(&first).to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_empty() {
        let hash = sha256_internal(b"");
        // Known SHA-256 of empty string
        let expected = [
            0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
            0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
            0x78, 0x52, 0xb8, 0x55,
        ];
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_sha256_abc() {
        let hash = sha256_internal(b"abc");
        // Known SHA-256 of "abc"
        let expected = [
            0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
            0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
            0xf2, 0x00, 0x15, 0xad,
        ];
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_leading_zeros_zero_hash() {
        let hash = [0u8; 32];
        assert_eq!(leading_zeros_internal(&hash), 256);
    }

    #[test]
    fn test_leading_zeros_16() {
        // Hash with first 2 bytes zero = 16 leading zeros
        let mut hash = [0xFFu8; 32];
        hash[0] = 0;
        hash[1] = 0;
        assert_eq!(leading_zeros_internal(&hash), 16);
    }

    #[test]
    fn test_leading_zeros_partial_byte() {
        // 0x0F = 0b00001111 = 4 leading zeros
        let mut hash = [0xFFu8; 32];
        hash[0] = 0x0F;
        assert_eq!(leading_zeros_internal(&hash), 4);
    }

    #[test]
    fn test_verify_pow_difficulty() {
        let mut hash = [0xFFu8; 32];
        hash[0] = 0;
        hash[1] = 0;
        // 16 leading zeros
        assert!(verify_pow_difficulty(&hash, 16));
        assert!(verify_pow_difficulty(&hash, 15));
        assert!(!verify_pow_difficulty(&hash, 17));
    }

    #[test]
    fn test_content_id_format() {
        let data = b"test content";
        let id = content_id(data);
        assert!(id.starts_with("sha256:"));
        assert_eq!(id.len(), 7 + 64); // "sha256:" + 64 hex chars
    }

    #[test]
    fn test_double_sha256() {
        let data = b"test";
        let double = double_sha256(data);
        let expected = sha256_internal(&sha256_internal(data));
        assert_eq!(double.as_slice(), expected.as_slice());
    }
}
