//! Hash functions for Swimchain protocol
//!
//! Provides:
//! - SHA-256: Content hashing, PoW hashing (SPEC_01)
//! - Blake3: Fast hashing for internal operations
//! - Merkle tree root computation
//! - Leading zeros counting for PoW verification

use sha2::{Digest, Sha256};

use crate::types::content::ContentHash;

/// Compute SHA-256 hash of data
#[must_use]
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Compute Blake3 hash of data
#[must_use]
pub fn blake3_hash(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

/// Compute content hash (SHA-256) for content storage
#[must_use]
pub fn content_hash(content: &[u8]) -> ContentHash {
    ContentHash(sha256(content))
}

/// Compute PoW hash (SHA-256) for proof-of-work verification
///
/// Per SPEC_01 §3.4, PoW uses SHA-256.
#[must_use]
pub fn pow_hash(data: &[u8]) -> [u8; 32] {
    sha256(data)
}

/// Compute checksum (first 4 bytes of SHA-256)
#[must_use]
pub fn checksum(data: &[u8]) -> [u8; 4] {
    let hash = sha256(data);
    [hash[0], hash[1], hash[2], hash[3]]
}

/// Compute merkle root from a list of hashes
///
/// Uses SHA-256 to combine hashes pairwise until a single root remains.
/// For odd numbers of hashes, the last hash is duplicated.
/// Returns all zeros for an empty list.
#[must_use]
pub fn merkle_root(hashes: &[[u8; 32]]) -> [u8; 32] {
    if hashes.is_empty() {
        return [0u8; 32];
    }
    if hashes.len() == 1 {
        return hashes[0];
    }

    let mut level: Vec<[u8; 32]> = hashes.to_vec();

    while level.len() > 1 {
        let mut next = Vec::with_capacity((level.len() + 1) / 2);

        for chunk in level.chunks(2) {
            let left = &chunk[0];
            // Duplicate last hash if odd number
            let right = chunk.get(1).unwrap_or(&chunk[0]);

            let mut combined = [0u8; 64];
            combined[..32].copy_from_slice(left);
            combined[32..].copy_from_slice(right);
            next.push(sha256(&combined));
        }

        level = next;
    }

    level[0]
}

/// Count leading zero bits in a hash
///
/// Used for proof-of-work difficulty verification.
/// This is a hot path called during PoW mining and verification.
#[inline]
#[must_use]
pub fn leading_zeros(hash: &[u8; 32]) -> u32 {
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
/// This is a hot path called during PoW verification.
#[inline]
#[must_use]
pub fn verify_pow_difficulty(hash: &[u8; 32], difficulty: u8) -> bool {
    leading_zeros(hash) >= u32::from(difficulty)
}

/// Double SHA-256 (used in some Bitcoin-style protocols)
#[must_use]
pub fn double_sha256(data: &[u8]) -> [u8; 32] {
    sha256(&sha256(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_empty() {
        let hash = sha256(b"");
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
        let hash = sha256(b"abc");
        // Known SHA-256 of "abc"
        let expected = [
            0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
            0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
            0xf2, 0x00, 0x15, 0xad,
        ];
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_blake3_deterministic() {
        let data = b"test data";
        let hash1 = blake3_hash(data);
        let hash2 = blake3_hash(data);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_content_hash_type() {
        let hash = content_hash(b"content");
        assert_eq!(hash.0, sha256(b"content"));
    }

    #[test]
    fn test_checksum_length() {
        let cs = checksum(b"data");
        assert_eq!(cs.len(), 4);
    }

    #[test]
    fn test_merkle_root_empty() {
        let root = merkle_root(&[]);
        assert_eq!(root, [0u8; 32]);
    }

    #[test]
    fn test_merkle_root_single() {
        let hash = sha256(b"single");
        let root = merkle_root(&[hash]);
        assert_eq!(root, hash);
    }

    #[test]
    fn test_merkle_root_two() {
        let h1 = sha256(b"one");
        let h2 = sha256(b"two");
        let root = merkle_root(&[h1, h2]);

        // Manually compute expected
        let mut combined = [0u8; 64];
        combined[..32].copy_from_slice(&h1);
        combined[32..].copy_from_slice(&h2);
        let expected = sha256(&combined);

        assert_eq!(root, expected);
    }

    #[test]
    fn test_merkle_root_three_odd() {
        let h1 = sha256(b"one");
        let h2 = sha256(b"two");
        let h3 = sha256(b"three");
        let root = merkle_root(&[h1, h2, h3]);

        // With 3 hashes, last is duplicated
        // Level 1: hash(h1||h2), hash(h3||h3)
        // Level 2: hash(above)
        let mut c1 = [0u8; 64];
        c1[..32].copy_from_slice(&h1);
        c1[32..].copy_from_slice(&h2);
        let n1 = sha256(&c1);

        let mut c2 = [0u8; 64];
        c2[..32].copy_from_slice(&h3);
        c2[32..].copy_from_slice(&h3); // duplicated
        let n2 = sha256(&c2);

        let mut c3 = [0u8; 64];
        c3[..32].copy_from_slice(&n1);
        c3[32..].copy_from_slice(&n2);
        let expected = sha256(&c3);

        assert_eq!(root, expected);
    }

    #[test]
    fn test_leading_zeros_zero_hash() {
        let hash = [0u8; 32];
        assert_eq!(leading_zeros(&hash), 256);
    }

    #[test]
    fn test_leading_zeros_16() {
        // Hash with first 2 bytes zero = 16 leading zeros
        let mut hash = [0xFFu8; 32];
        hash[0] = 0;
        hash[1] = 0;
        assert_eq!(leading_zeros(&hash), 16);
    }

    #[test]
    fn test_leading_zeros_partial_byte() {
        // 0x0F = 0b00001111 = 4 leading zeros
        let mut hash = [0xFFu8; 32];
        hash[0] = 0x0F;
        assert_eq!(leading_zeros(&hash), 4);
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
    fn test_double_sha256() {
        let data = b"test";
        let double = double_sha256(data);
        let expected = sha256(&sha256(data));
        assert_eq!(double, expected);
    }
}
