//! Merkle tree computation for block hierarchy (SPEC_08 §2.2)
//!
//! Provides SHA-256 based merkle tree computation for:
//! - Content blocks (merkle of action hashes)
//! - Space blocks (merkle of content block hashes)
//! - Root blocks (merkle of space block hashes)

use crate::crypto::sha256;

/// Compute merkle root from a list of hashes
///
/// Uses SHA-256 to combine hashes pairwise until a single root remains.
/// - Empty list → [0u8; 32]
/// - Single element → return unchanged
/// - Two elements → sha256(left || right)
/// - Odd count → duplicate last element for pairing
///
/// # Arguments
/// * `hashes` - List of 32-byte hashes to compute root from
///
/// # Returns
/// 32-byte merkle root
#[must_use]
pub fn compute_merkle_root(hashes: &[[u8; 32]]) -> [u8; 32] {
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

/// Compute merkle proof for an element at a given index
///
/// Returns the list of sibling hashes needed to verify inclusion.
/// Each element is (hash, is_right) where is_right indicates if
/// the sibling should be concatenated on the right.
#[must_use]
pub fn compute_merkle_proof(hashes: &[[u8; 32]], index: usize) -> Vec<([u8; 32], bool)> {
    if hashes.is_empty() || index >= hashes.len() {
        return vec![];
    }
    if hashes.len() == 1 {
        return vec![];
    }

    let mut proof = Vec::new();
    let mut level: Vec<[u8; 32]> = hashes.to_vec();
    let mut idx = index;

    while level.len() > 1 {
        let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };

        // Handle odd-length levels
        let sibling = if sibling_idx < level.len() {
            level[sibling_idx]
        } else {
            // Duplicate last element
            level[level.len() - 1]
        };

        // is_right = true means sibling goes on the right
        let is_right = idx % 2 == 0;
        proof.push((sibling, is_right));

        // Build next level
        let mut next = Vec::with_capacity((level.len() + 1) / 2);
        for chunk in level.chunks(2) {
            let left = &chunk[0];
            let right = chunk.get(1).unwrap_or(&chunk[0]);
            let mut combined = [0u8; 64];
            combined[..32].copy_from_slice(left);
            combined[32..].copy_from_slice(right);
            next.push(sha256(&combined));
        }

        level = next;
        idx /= 2;
    }

    proof
}

/// Verify a merkle proof
///
/// # Arguments
/// * `leaf` - The leaf hash to verify
/// * `proof` - List of (sibling_hash, is_right) pairs
/// * `root` - Expected merkle root
///
/// # Returns
/// true if proof is valid
#[must_use]
pub fn verify_merkle_proof(leaf: &[u8; 32], proof: &[([u8; 32], bool)], root: &[u8; 32]) -> bool {
    let mut current = *leaf;

    for (sibling, is_right) in proof {
        let mut combined = [0u8; 64];
        if *is_right {
            combined[..32].copy_from_slice(&current);
            combined[32..].copy_from_slice(sibling);
        } else {
            combined[..32].copy_from_slice(sibling);
            combined[32..].copy_from_slice(&current);
        }
        current = sha256(&combined);
    }

    current == *root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merkle_root_empty() {
        let root = compute_merkle_root(&[]);
        assert_eq!(root, [0u8; 32]);
    }

    #[test]
    fn test_merkle_root_single() {
        let hash = [1u8; 32];
        let root = compute_merkle_root(&[hash]);
        assert_eq!(root, hash);
    }

    #[test]
    fn test_merkle_root_two() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let root = compute_merkle_root(&[h1, h2]);

        // Manually compute expected
        let mut combined = [0u8; 64];
        combined[..32].copy_from_slice(&h1);
        combined[32..].copy_from_slice(&h2);
        let expected = sha256(&combined);

        assert_eq!(root, expected);
    }

    #[test]
    fn test_merkle_root_three_odd() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let h3 = [3u8; 32];
        let root = compute_merkle_root(&[h1, h2, h3]);

        // With 3 hashes, last is duplicated
        // Level 1: sha256(h1||h2), sha256(h3||h3)
        // Level 2: sha256(above)
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
    fn test_merkle_root_four() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let h3 = [3u8; 32];
        let h4 = [4u8; 32];
        let root = compute_merkle_root(&[h1, h2, h3, h4]);

        // Level 1: sha256(h1||h2), sha256(h3||h4)
        // Level 2: sha256(above)
        let mut c1 = [0u8; 64];
        c1[..32].copy_from_slice(&h1);
        c1[32..].copy_from_slice(&h2);
        let n1 = sha256(&c1);

        let mut c2 = [0u8; 64];
        c2[..32].copy_from_slice(&h3);
        c2[32..].copy_from_slice(&h4);
        let n2 = sha256(&c2);

        let mut c3 = [0u8; 64];
        c3[..32].copy_from_slice(&n1);
        c3[32..].copy_from_slice(&n2);
        let expected = sha256(&c3);

        assert_eq!(root, expected);
    }

    #[test]
    fn test_merkle_determinism() {
        let hashes: Vec<[u8; 32]> = (0..5).map(|i| [i as u8; 32]).collect();
        let root1 = compute_merkle_root(&hashes);
        let root2 = compute_merkle_root(&hashes);
        assert_eq!(root1, root2);
    }

    #[test]
    fn test_merkle_proof_empty() {
        let proof = compute_merkle_proof(&[], 0);
        assert!(proof.is_empty());
    }

    #[test]
    fn test_merkle_proof_single() {
        let hash = [1u8; 32];
        let proof = compute_merkle_proof(&[hash], 0);
        assert!(proof.is_empty());
    }

    #[test]
    fn test_merkle_proof_two_elements() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let hashes = [h1, h2];
        let root = compute_merkle_root(&hashes);

        // Proof for first element
        let proof0 = compute_merkle_proof(&hashes, 0);
        assert_eq!(proof0.len(), 1);
        assert!(verify_merkle_proof(&h1, &proof0, &root));

        // Proof for second element
        let proof1 = compute_merkle_proof(&hashes, 1);
        assert_eq!(proof1.len(), 1);
        assert!(verify_merkle_proof(&h2, &proof1, &root));
    }

    #[test]
    fn test_merkle_proof_four_elements() {
        let hashes: Vec<[u8; 32]> = (0..4).map(|i| [i as u8; 32]).collect();
        let root = compute_merkle_root(&hashes);

        for (i, hash) in hashes.iter().enumerate() {
            let proof = compute_merkle_proof(&hashes, i);
            assert_eq!(proof.len(), 2);
            assert!(verify_merkle_proof(hash, &proof, &root));
        }
    }

    #[test]
    fn test_merkle_proof_invalid() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let hashes = [h1, h2];
        let root = compute_merkle_root(&hashes);
        let proof = compute_merkle_proof(&hashes, 0);

        // Wrong leaf should fail
        let wrong = [99u8; 32];
        assert!(!verify_merkle_proof(&wrong, &proof, &root));
    }

    #[test]
    fn test_merkle_performance_1000_elements() {
        let hashes: Vec<[u8; 32]> = (0..1000).map(|i| [(i % 256) as u8; 32]).collect();
        let start = std::time::Instant::now();
        let _ = compute_merkle_root(&hashes);
        assert!(start.elapsed() < std::time::Duration::from_millis(100));
    }
}
