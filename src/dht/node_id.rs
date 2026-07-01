//! DHT Node ID (SPEC_06 §3.8, RESEARCH_02)
//!
//! Node IDs in SwimChain's DHT are derived from Ed25519 public keys.
//! This provides natural Sybil resistance since creating a valid identity
//! requires PoW, and the public key can be verified.

use super::constants::ID_BITS;
use super::error::{DhtError, DhtResult};

/// A 256-bit DHT node identifier
///
/// Node IDs are used for:
/// - Routing (XOR distance metric)
/// - Peer identification
/// - Content addressing (content hashes use the same ID space)
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId([u8; 32]);

impl NodeId {
    /// Create a NodeId from raw bytes
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Create a NodeId from a slice (must be 32 bytes)
    pub fn from_slice(slice: &[u8]) -> DhtResult<Self> {
        if slice.len() != 32 {
            return Err(DhtError::InvalidNodeId {
                reason: format!("Expected 32 bytes, got {}", slice.len()),
            });
        }
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(slice);
        Ok(Self(bytes))
    }

    /// Create a NodeId from an Ed25519 public key
    ///
    /// The node ID is the SHA-256 hash of the public key.
    /// This ties DHT identity to SwimChain identity.
    pub fn from_public_key(public_key: &[u8; 32]) -> Self {
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(public_key);
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&hash);
        Self(bytes)
    }

    /// Get the raw bytes of the node ID
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Convert to owned byte array
    pub fn to_bytes(self) -> [u8; 32] {
        self.0
    }

    /// Calculate XOR distance to another node ID
    ///
    /// XOR distance is the fundamental metric in Kademlia:
    /// - d(a, b) = a XOR b
    /// - Symmetric: d(a, b) = d(b, a)
    /// - Triangle inequality: d(a, c) <= d(a, b) + d(b, c)
    pub fn xor_distance(&self, other: &NodeId) -> NodeId {
        let mut result = [0u8; 32];
        for i in 0..32 {
            result[i] = self.0[i] ^ other.0[i];
        }
        NodeId(result)
    }

    /// Get the bucket index for a distance
    ///
    /// The bucket index is 255 - (position of highest set bit).
    /// This means closer nodes (smaller XOR distance) go in higher-numbered buckets.
    ///
    /// Returns None if the distance is zero (same node).
    pub fn bucket_index(&self, other: &NodeId) -> Option<usize> {
        let distance = self.xor_distance(other);

        // Find the first non-zero byte
        for (byte_idx, &byte) in distance.0.iter().enumerate() {
            if byte != 0 {
                // Find the position of the highest bit in this byte
                let bit_pos = 7 - byte.leading_zeros() as usize;
                // Calculate bucket index
                let bucket = (ID_BITS - 1) - (byte_idx * 8 + (7 - bit_pos));
                return Some(bucket);
            }
        }

        // All bytes are zero - same node
        None
    }

    /// Compare distances: is d(self, a) < d(self, b)?
    ///
    /// Used for sorting nodes by distance from a target.
    pub fn is_closer(&self, a: &NodeId, b: &NodeId) -> bool {
        let dist_a = self.xor_distance(a);
        let dist_b = self.xor_distance(b);

        // Compare byte by byte (big-endian)
        for i in 0..32 {
            match dist_a.0[i].cmp(&dist_b.0[i]) {
                std::cmp::Ordering::Less => return true,
                std::cmp::Ordering::Greater => return false,
                std::cmp::Ordering::Equal => continue,
            }
        }
        false // Equal distance
    }

    /// Get the leading zeros in the node ID
    pub fn leading_zeros(&self) -> u32 {
        let mut count = 0u32;
        for &byte in &self.0 {
            if byte == 0 {
                count += 8;
            } else {
                count += byte.leading_zeros();
                break;
            }
        }
        count
    }

    /// Check if this is a zero ID
    pub fn is_zero(&self) -> bool {
        self.0 == [0u8; 32]
    }
}

impl std::fmt::Debug for NodeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "NodeId({})", hex::encode(&self.0[..8]))
    }
}

impl std::fmt::Display for NodeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", hex::encode(&self.0[..8]))
    }
}

impl From<[u8; 32]> for NodeId {
    fn from(bytes: [u8; 32]) -> Self {
        Self::from_bytes(bytes)
    }
}

impl From<NodeId> for [u8; 32] {
    fn from(id: NodeId) -> Self {
        id.0
    }
}

impl AsRef<[u8]> for NodeId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl PartialOrd for NodeId {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for NodeId {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_bytes() {
        let bytes = [0xab; 32];
        let id = NodeId::from_bytes(bytes);
        assert_eq!(id.as_bytes(), &bytes);
    }

    #[test]
    fn test_from_slice() {
        let bytes = [0xcd; 32];
        let id = NodeId::from_slice(&bytes).unwrap();
        assert_eq!(id.as_bytes(), &bytes);
    }

    #[test]
    fn test_from_slice_wrong_length() {
        let result = NodeId::from_slice(&[1, 2, 3]);
        assert!(result.is_err());
    }

    #[test]
    fn test_xor_distance_symmetric() {
        let a = NodeId::from_bytes([1; 32]);
        let b = NodeId::from_bytes([2; 32]);

        assert_eq!(a.xor_distance(&b), b.xor_distance(&a));
    }

    #[test]
    fn test_xor_distance_self_is_zero() {
        let a = NodeId::from_bytes([0xab; 32]);
        let distance = a.xor_distance(&a);
        assert!(distance.is_zero());
    }

    #[test]
    fn test_bucket_index_same_node() {
        let a = NodeId::from_bytes([0xab; 32]);
        assert_eq!(a.bucket_index(&a), None);
    }

    #[test]
    fn test_bucket_index_adjacent() {
        // Two nodes that differ only in the last bit
        let mut a_bytes = [0u8; 32];
        let mut b_bytes = [0u8; 32];
        a_bytes[31] = 0b00000000;
        b_bytes[31] = 0b00000001;

        let a = NodeId::from_bytes(a_bytes);
        let b = NodeId::from_bytes(b_bytes);

        // Differ in last bit = bucket 0
        assert_eq!(a.bucket_index(&b), Some(0));
    }

    #[test]
    fn test_bucket_index_far() {
        // Two nodes that differ in the first bit
        let mut a_bytes = [0u8; 32];
        let mut b_bytes = [0u8; 32];
        a_bytes[0] = 0b00000000;
        b_bytes[0] = 0b10000000;

        let a = NodeId::from_bytes(a_bytes);
        let b = NodeId::from_bytes(b_bytes);

        // Differ in first bit = bucket 255
        assert_eq!(a.bucket_index(&b), Some(255));
    }

    #[test]
    fn test_is_closer() {
        let target = NodeId::from_bytes([0u8; 32]);

        let mut close_bytes = [0u8; 32];
        close_bytes[31] = 1; // Very close to target
        let close = NodeId::from_bytes(close_bytes);

        let mut far_bytes = [0u8; 32];
        far_bytes[0] = 0xFF; // Far from target
        let far = NodeId::from_bytes(far_bytes);

        assert!(target.is_closer(&close, &far));
        assert!(!target.is_closer(&far, &close));
    }

    #[test]
    fn test_leading_zeros() {
        let mut bytes = [0u8; 32];
        bytes[2] = 0b00001111;
        let id = NodeId::from_bytes(bytes);
        // 2 bytes of zeros (16 bits) + 4 leading zeros in third byte = 20
        assert_eq!(id.leading_zeros(), 20);
    }

    #[test]
    fn test_from_public_key() {
        use sha2::{Digest, Sha256};

        let pubkey = [0x42; 32];
        let id = NodeId::from_public_key(&pubkey);

        let expected_hash = Sha256::digest(&pubkey);
        assert_eq!(id.as_bytes(), expected_hash.as_slice());
    }
}
