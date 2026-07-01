//! Identity types per SPEC_01
//!
//! Core identity primitives including keys, signatures, and identity proofs.

use std::fmt;
use std::hash::{Hash, Hasher};

use serde_big_array::BigArray;

/// Identity identifier - SHA-256 hash of public key (32 bytes)
///
/// This is the canonical identifier for an identity in the protocol.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, serde::Serialize, serde::Deserialize)]
pub struct IdentityId(pub [u8; 32]);

impl IdentityId {
    /// Create from raw bytes
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Debug for IdentityId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "IdentityId(")?;
        for byte in &self.0 {
            write!(f, "{byte:02x}")?;
        }
        write!(f, ")")
    }
}

impl fmt::Display for IdentityId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in &self.0 {
            write!(f, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl AsRef<[u8]> for IdentityId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Ed25519 public key (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct PublicKey(pub [u8; 32]);

impl PublicKey {
    /// Create from raw bytes
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Compute the identity ID from this public key (SHA-256 hash)
    #[must_use]
    pub fn to_identity_id(&self) -> IdentityId {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&self.0);
        let hash: [u8; 32] = hasher.finalize().into();
        IdentityId(hash)
    }
}

impl Hash for PublicKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl fmt::Debug for PublicKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PublicKey(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for PublicKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Ed25519 private key (64 bytes: 32-byte seed + 32-byte public key)
///
/// The private key is stored securely and zeroed on drop to prevent
/// key material from lingering in memory.
pub struct PrivateKey([u8; 64]);

impl PrivateKey {
    /// Create from raw bytes (seed || public_key)
    #[must_use]
    pub fn from_bytes(bytes: [u8; 64]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub fn as_bytes(&self) -> &[u8; 64] {
        &self.0
    }

    /// Get the seed portion (first 32 bytes)
    #[must_use]
    pub fn seed(&self) -> &[u8; 32] {
        self.0[..32].try_into().expect("slice is 32 bytes")
    }
}

impl fmt::Debug for PrivateKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PrivateKey([REDACTED])")
    }
}

impl Drop for PrivateKey {
    fn drop(&mut self) {
        use std::ptr;
        use std::sync::atomic::{compiler_fence, Ordering};
        // Volatile write to prevent optimization
        // SAFETY: We're writing to our own field which is valid
        #[allow(unsafe_code)]
        unsafe {
            ptr::write_volatile(&mut self.0, [0u8; 64]);
        }
        compiler_fence(Ordering::SeqCst);
    }
}

impl Clone for PrivateKey {
    fn clone(&self) -> Self {
        Self(self.0)
    }
}

/// Ed25519 signature (64 bytes)
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Signature(#[serde(with = "BigArray")] pub [u8; 64]);

impl Signature {
    /// Create from raw bytes
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 64]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 64] {
        &self.0
    }
}

impl fmt::Debug for Signature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Signature(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl Default for Signature {
    fn default() -> Self {
        Self([0u8; 64])
    }
}

impl AsRef<[u8]> for Signature {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Key pair containing public and private keys
#[derive(Clone)]
pub struct KeyPair {
    /// The public key
    pub public_key: PublicKey,
    /// The private key
    pub private_key: PrivateKey,
}

impl fmt::Debug for KeyPair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KeyPair")
            .field("public_key", &self.public_key)
            .field("private_key", &self.private_key)
            .finish()
    }
}

/// Action types for first appearance tracking (SPEC_01 §3.7)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionType {
    /// Creating a new post
    Post = 0x00,
    /// Replying to existing content
    Reply = 0x01,
    /// Identity creation (first action)
    IdentityCreation = 0x02,
}

impl TryFrom<u8> for ActionType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(ActionType::Post),
            0x01 => Ok(ActionType::Reply),
            0x02 => Ok(ActionType::IdentityCreation),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Bech32m address representation (SPEC_01 §3.3)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdentityAddress {
    /// Human-readable part (always "cs")
    pub hrp: String,
    /// Address version
    pub version: u8,
    /// 32-byte payload (identity ID)
    pub payload: [u8; 32],
}

impl IdentityAddress {
    /// Create a new identity address
    #[must_use]
    pub fn new(identity_id: &IdentityId) -> Self {
        Self {
            hrp: super::constants::ADDRESS_HRP.to_string(),
            version: super::constants::ADDRESS_VERSION,
            payload: identity_id.0,
        }
    }
}

/// Proof of work for identity creation (SPEC_01 §3.4)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct IdentityCreationProof {
    /// Public key being registered
    pub public_key: PublicKey,
    /// UNIX timestamp in seconds when PoW was computed
    pub timestamp: u64,
    /// Nonce that satisfies difficulty requirement
    pub nonce: u64,
    /// Resulting hash that meets difficulty
    pub pow_hash: [u8; 32],
}

/// Identity metadata (SPEC_01 §3.5)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdentityMetadata {
    /// Identity this metadata belongs to
    pub identity: IdentityId,
    /// Display name (max 64 UTF-8 bytes)
    pub display_name: Option<String>,
    /// Avatar content hash
    pub avatar_cid: Option<[u8; 32]>,
    /// Biography (max 256 UTF-8 bytes)
    pub bio: Option<String>,
    /// Last update timestamp (UNIX seconds)
    pub updated_at: u64,
    /// Signature over metadata
    pub signature: Signature,
}

/// Reputation summary (SPEC_01 §3.6)
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReputationSummary {
    /// Identity this summary is for
    pub identity: IdentityId,
    /// Total number of posts
    pub total_posts: u64,
    /// Total number of replies
    pub total_replies: u64,
    /// Total engagement received
    pub total_engagement_received: u64,
    /// Total engagement given
    pub total_engagement_given: u64,
    /// Age of identity in seconds
    pub identity_age_secs: u64,
    /// Decay-weighted score
    pub weighted_score: u64,
}

/// First appearance record (SPEC_01 §3.7)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FirstAppearance {
    /// Identity that first appeared
    pub identity: IdentityId,
    /// Block height of first appearance
    pub block_height: u64,
    /// Hash of block containing first appearance
    pub block_hash: [u8; 32],
    /// Type of first action
    pub action_type: ActionType,
}

/// Signature envelope for timestamped signatures (SPEC_01 §3.9)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureEnvelope {
    /// Signer's public key
    pub signer: PublicKey,
    /// UNIX timestamp in seconds
    pub timestamp: u64,
    /// Action type being signed
    pub action_type: ActionType,
    /// Hash of content being signed
    pub content_hash: [u8; 32],
    /// The signature
    pub signature: Signature,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_id_display_hex() {
        let id = IdentityId([0xab; 32]);
        let display = format!("{id}");
        assert_eq!(display.len(), 64);
        assert!(display.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_private_key_debug_redacted() {
        let pk = PrivateKey::from_bytes([0x42; 64]);
        let debug = format!("{pk:?}");
        assert!(debug.contains("REDACTED"));
        assert!(!debug.contains("42"));
    }

    #[test]
    fn test_identity_id_default_is_zeros() {
        let id = IdentityId::default();
        assert_eq!(id.0, [0u8; 32]);
    }

    #[test]
    fn test_action_type_discriminants() {
        assert_eq!(ActionType::Post as u8, 0x00);
        assert_eq!(ActionType::Reply as u8, 0x01);
        assert_eq!(ActionType::IdentityCreation as u8, 0x02);
    }

    #[test]
    fn test_action_type_try_from() {
        assert_eq!(ActionType::try_from(0x00).unwrap(), ActionType::Post);
        assert_eq!(ActionType::try_from(0x01).unwrap(), ActionType::Reply);
        assert!(ActionType::try_from(0xFF).is_err());
    }
}
