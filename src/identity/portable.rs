//! Portable identity format for export/import
//!
//! Provides a binary format for exporting and importing identities between
//! devices or for backup. The format includes the encrypted private key,
//! optional PoW proof, and optional metadata.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

use crate::types::error::IdentityError;
use crate::types::identity::{IdentityCreationProof, IdentityMetadata, PublicKey};

/// Magic bytes for portable identity format
pub const PORTABLE_MAGIC: &[u8; 4] = b"CSID";

/// Current portable format version
pub const PORTABLE_VERSION: u8 = 1;

/// Portable identity for export/import
///
/// Binary format:
/// ```text
/// CSID                           4 bytes  magic
/// version                        1 byte   format version (1)
/// pubkey                        32 bytes  Ed25519 public key
/// enc_priv_len                   2 bytes  u16 LE, encrypted private key length
/// enc_priv                       N bytes  encrypted private key blob
/// has_proof                      1 byte   0x00=no, 0x01=yes
/// proof                          ? bytes  if has_proof, serialized proof (88 bytes)
/// has_meta                       1 byte   0x00=no, 0x01=yes
/// meta                           ? bytes  if has_meta, serialized metadata
/// ```
#[derive(Debug, Clone)]
pub struct PortableIdentity {
    /// Format version (currently 1)
    pub version: u8,
    /// Raw 32-byte public key
    pub public_key: [u8; 32],
    /// Encrypted private key: salt(16) || nonce(12) || ciphertext(64) || tag(16)
    pub encrypted_private_key: Vec<u8>,
    /// Optional creation proof
    pub creation_proof: Option<IdentityCreationProof>,
    /// Optional metadata snapshot
    pub metadata: Option<IdentityMetadata>,
}

impl PortableIdentity {
    /// Create a new portable identity
    #[must_use]
    pub fn new(public_key: [u8; 32], encrypted_private_key: Vec<u8>) -> Self {
        Self {
            version: PORTABLE_VERSION,
            public_key,
            encrypted_private_key,
            creation_proof: None,
            metadata: None,
        }
    }

    /// Set the creation proof
    #[must_use]
    pub fn with_proof(mut self, proof: IdentityCreationProof) -> Self {
        self.creation_proof = Some(proof);
        self
    }

    /// Set the metadata
    #[must_use]
    pub fn with_metadata(mut self, metadata: IdentityMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Serialize a portable identity to binary format
#[must_use]
pub fn serialize_portable(identity: &PortableIdentity) -> Vec<u8> {
    // Calculate size estimate
    let mut size = 4 + 1 + 32 + 2 + identity.encrypted_private_key.len() + 2;
    if identity.creation_proof.is_some() {
        size += 88; // pubkey(32) + timestamp(8) + nonce(8) + hash(32) + length prefix(8)
    }
    if identity.metadata.is_some() {
        size += 512; // estimate for metadata
    }

    let mut data = Vec::with_capacity(size);

    // Magic bytes
    data.extend_from_slice(PORTABLE_MAGIC);

    // Version
    data.push(identity.version);

    // Public key
    data.extend_from_slice(&identity.public_key);

    // Encrypted private key length and data
    let enc_len = identity.encrypted_private_key.len() as u16;
    data.extend_from_slice(&enc_len.to_le_bytes());
    data.extend_from_slice(&identity.encrypted_private_key);

    // Creation proof
    if let Some(ref proof) = identity.creation_proof {
        data.push(0x01); // has_proof = true
        serialize_proof_into(&mut data, proof);
    } else {
        data.push(0x00); // has_proof = false
    }

    // Metadata
    if let Some(ref metadata) = identity.metadata {
        data.push(0x01); // has_meta = true
        serialize_metadata_into(&mut data, metadata);
    } else {
        data.push(0x00); // has_meta = false
    }

    data
}

/// Deserialize a portable identity from binary format
pub fn deserialize_portable(data: &[u8]) -> Result<PortableIdentity, IdentityError> {
    let mut offset = 0;

    // Check minimum length: magic(4) + version(1) + pubkey(32) + enc_len(2) + flags(2)
    if data.len() < 41 {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "data too short".to_string(),
        });
    }

    // Magic bytes
    if &data[offset..offset + 4] != PORTABLE_MAGIC {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "invalid magic bytes".to_string(),
        });
    }
    offset += 4;

    // Version
    let version = data[offset];
    if version != PORTABLE_VERSION {
        return Err(IdentityError::InvalidPortableFormat {
            reason: format!("unsupported version: {version}"),
        });
    }
    offset += 1;

    // Public key
    let mut public_key = [0u8; 32];
    public_key.copy_from_slice(&data[offset..offset + 32]);
    offset += 32;

    // Encrypted private key
    if offset + 2 > data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing encrypted key length".to_string(),
        });
    }
    let enc_len = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;

    if offset + enc_len > data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "encrypted key data truncated".to_string(),
        });
    }
    let encrypted_private_key = data[offset..offset + enc_len].to_vec();
    offset += enc_len;

    // Creation proof
    if offset >= data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing proof flag".to_string(),
        });
    }
    let has_proof = data[offset] == 0x01;
    offset += 1;

    let creation_proof = if has_proof {
        let (proof, consumed) = deserialize_proof(&data[offset..])?;
        offset += consumed;
        Some(proof)
    } else {
        None
    };

    // Metadata
    if offset >= data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing metadata flag".to_string(),
        });
    }
    let has_meta = data[offset] == 0x01;
    offset += 1;

    let metadata = if has_meta {
        let (meta, _consumed) = deserialize_metadata(&data[offset..])?;
        Some(meta)
    } else {
        None
    };

    Ok(PortableIdentity {
        version,
        public_key,
        encrypted_private_key,
        creation_proof,
        metadata,
    })
}

/// Encode a portable identity as base64 for text transport
#[must_use]
pub fn to_base64(identity: &PortableIdentity) -> String {
    let bytes = serialize_portable(identity);
    BASE64.encode(bytes)
}

/// Decode a portable identity from base64
pub fn from_base64(encoded: &str) -> Result<PortableIdentity, IdentityError> {
    let bytes = BASE64
        .decode(encoded)
        .map_err(|e| IdentityError::InvalidPortableFormat {
            reason: format!("invalid base64: {e}"),
        })?;
    deserialize_portable(&bytes)
}

// Helper: serialize proof into buffer
fn serialize_proof_into(data: &mut Vec<u8>, proof: &IdentityCreationProof) {
    // pubkey(32) + timestamp(8) + nonce(8) + hash(32)
    data.extend_from_slice(proof.public_key.as_bytes());
    data.extend_from_slice(&proof.timestamp.to_le_bytes());
    data.extend_from_slice(&proof.nonce.to_le_bytes());
    data.extend_from_slice(&proof.pow_hash);
}

// Helper: deserialize proof from buffer
fn deserialize_proof(data: &[u8]) -> Result<(IdentityCreationProof, usize), IdentityError> {
    // Need at least 80 bytes: pubkey(32) + timestamp(8) + nonce(8) + hash(32)
    if data.len() < 80 {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "proof data too short".to_string(),
        });
    }

    let mut offset = 0;

    // Public key
    let mut pubkey_bytes = [0u8; 32];
    pubkey_bytes.copy_from_slice(&data[offset..offset + 32]);
    offset += 32;

    // Timestamp
    let mut ts_bytes = [0u8; 8];
    ts_bytes.copy_from_slice(&data[offset..offset + 8]);
    let timestamp = u64::from_le_bytes(ts_bytes);
    offset += 8;

    // Nonce
    let mut nonce_bytes = [0u8; 8];
    nonce_bytes.copy_from_slice(&data[offset..offset + 8]);
    let nonce = u64::from_le_bytes(nonce_bytes);
    offset += 8;

    // Hash
    let mut pow_hash = [0u8; 32];
    pow_hash.copy_from_slice(&data[offset..offset + 32]);
    offset += 32;

    Ok((
        IdentityCreationProof {
            public_key: PublicKey::from_bytes(pubkey_bytes),
            timestamp,
            nonce,
            pow_hash,
        },
        offset,
    ))
}

// Helper: serialize metadata into buffer
fn serialize_metadata_into(data: &mut Vec<u8>, metadata: &IdentityMetadata) {
    // identity(32) + updated_at(8) + signature(64) + optional fields
    data.extend_from_slice(metadata.identity.as_bytes());
    data.extend_from_slice(&metadata.updated_at.to_le_bytes());
    data.extend_from_slice(metadata.signature.as_bytes());

    // Display name (length-prefixed)
    if let Some(ref name) = metadata.display_name {
        data.push(0x01);
        let name_bytes = name.as_bytes();
        data.push(name_bytes.len() as u8);
        data.extend_from_slice(name_bytes);
    } else {
        data.push(0x00);
    }

    // Avatar CID
    if let Some(ref cid) = metadata.avatar_cid {
        data.push(0x01);
        data.extend_from_slice(cid);
    } else {
        data.push(0x00);
    }

    // Bio (length-prefixed with u16)
    if let Some(ref bio) = metadata.bio {
        data.push(0x01);
        let bio_bytes = bio.as_bytes();
        let len = bio_bytes.len().min(u16::MAX as usize) as u16;
        data.extend_from_slice(&len.to_le_bytes());
        data.extend_from_slice(&bio_bytes[..len as usize]);
    } else {
        data.push(0x00);
    }
}

// Helper: deserialize metadata from buffer
fn deserialize_metadata(data: &[u8]) -> Result<(IdentityMetadata, usize), IdentityError> {
    use crate::types::identity::{IdentityId, Signature};

    // Need at least 104 bytes: identity(32) + updated_at(8) + signature(64)
    if data.len() < 104 {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "metadata too short".to_string(),
        });
    }

    let mut offset = 0;

    // Identity
    let mut id_bytes = [0u8; 32];
    id_bytes.copy_from_slice(&data[offset..offset + 32]);
    let identity = IdentityId::from_bytes(id_bytes);
    offset += 32;

    // Updated at
    let mut ts_bytes = [0u8; 8];
    ts_bytes.copy_from_slice(&data[offset..offset + 8]);
    let updated_at = u64::from_le_bytes(ts_bytes);
    offset += 8;

    // Signature
    let mut sig_bytes = [0u8; 64];
    sig_bytes.copy_from_slice(&data[offset..offset + 64]);
    let signature = Signature::from_bytes(sig_bytes);
    offset += 64;

    // Display name
    if offset >= data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing display name flag".to_string(),
        });
    }
    let has_name = data[offset] == 0x01;
    offset += 1;
    let display_name = if has_name {
        if offset >= data.len() {
            return Err(IdentityError::InvalidPortableFormat {
                reason: "missing display name length".to_string(),
            });
        }
        let name_len = data[offset] as usize;
        offset += 1;
        if offset + name_len > data.len() {
            return Err(IdentityError::InvalidPortableFormat {
                reason: "display name truncated".to_string(),
            });
        }
        let name = String::from_utf8(data[offset..offset + name_len].to_vec()).map_err(|e| {
            IdentityError::InvalidPortableFormat {
                reason: format!("invalid display name UTF-8: {e}"),
            }
        })?;
        offset += name_len;
        Some(name)
    } else {
        None
    };

    // Avatar CID
    if offset >= data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing avatar flag".to_string(),
        });
    }
    let has_avatar = data[offset] == 0x01;
    offset += 1;
    let avatar_cid = if has_avatar {
        if offset + 32 > data.len() {
            return Err(IdentityError::InvalidPortableFormat {
                reason: "avatar CID truncated".to_string(),
            });
        }
        let mut cid = [0u8; 32];
        cid.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;
        Some(cid)
    } else {
        None
    };

    // Bio
    if offset >= data.len() {
        return Err(IdentityError::InvalidPortableFormat {
            reason: "missing bio flag".to_string(),
        });
    }
    let has_bio = data[offset] == 0x01;
    offset += 1;
    let bio = if has_bio {
        if offset + 2 > data.len() {
            return Err(IdentityError::InvalidPortableFormat {
                reason: "missing bio length".to_string(),
            });
        }
        let bio_len = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;
        if offset + bio_len > data.len() {
            return Err(IdentityError::InvalidPortableFormat {
                reason: "bio truncated".to_string(),
            });
        }
        let bio_text = String::from_utf8(data[offset..offset + bio_len].to_vec()).map_err(|e| {
            IdentityError::InvalidPortableFormat {
                reason: format!("invalid bio UTF-8: {e}"),
            }
        })?;
        offset += bio_len;
        Some(bio_text)
    } else {
        None
    };

    Ok((
        IdentityMetadata {
            identity,
            display_name,
            avatar_cid,
            bio,
            updated_at,
            signature,
        },
        offset,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::generate_keypair;

    #[test]
    fn test_portable_roundtrip_minimal() {
        let keypair = generate_keypair();
        let encrypted = vec![0x12, 0x34, 0x56, 0x78]; // mock encrypted key

        let portable = PortableIdentity::new(*keypair.public_key.as_bytes(), encrypted.clone());

        let serialized = serialize_portable(&portable);
        let deserialized = deserialize_portable(&serialized).unwrap();

        assert_eq!(deserialized.version, PORTABLE_VERSION);
        assert_eq!(deserialized.public_key, *keypair.public_key.as_bytes());
        assert_eq!(deserialized.encrypted_private_key, encrypted);
        assert!(deserialized.creation_proof.is_none());
        assert!(deserialized.metadata.is_none());
    }

    #[test]
    fn test_portable_roundtrip_with_proof() {
        use crate::crypto::pow::mine_identity_pow;

        let keypair = generate_keypair();
        let proof = mine_identity_pow(&keypair, 4);
        let encrypted = vec![0xab; 108]; // realistic size: salt(16) + nonce(12) + ciphertext(80)

        let portable = PortableIdentity::new(*keypair.public_key.as_bytes(), encrypted.clone())
            .with_proof(proof.clone());

        let serialized = serialize_portable(&portable);
        let deserialized = deserialize_portable(&serialized).unwrap();

        assert!(deserialized.creation_proof.is_some());
        let deser_proof = deserialized.creation_proof.unwrap();
        assert_eq!(
            deser_proof.public_key.as_bytes(),
            proof.public_key.as_bytes()
        );
        assert_eq!(deser_proof.timestamp, proof.timestamp);
        assert_eq!(deser_proof.nonce, proof.nonce);
        assert_eq!(deser_proof.pow_hash, proof.pow_hash);
    }

    #[test]
    fn test_portable_base64_roundtrip() {
        let keypair = generate_keypair();
        let encrypted = vec![0x55; 50];

        let portable = PortableIdentity::new(*keypair.public_key.as_bytes(), encrypted);

        let encoded = to_base64(&portable);
        let decoded = from_base64(&encoded).unwrap();

        assert_eq!(decoded.public_key, *keypair.public_key.as_bytes());
    }

    #[test]
    fn test_invalid_magic() {
        let mut data = serialize_portable(&PortableIdentity::new([0u8; 32], vec![1, 2, 3, 4]));
        data[0] = 0xFF; // corrupt magic

        let result = deserialize_portable(&data);
        assert!(matches!(
            result,
            Err(IdentityError::InvalidPortableFormat { .. })
        ));
    }

    #[test]
    fn test_invalid_version() {
        let mut data = serialize_portable(&PortableIdentity::new([0u8; 32], vec![1, 2, 3, 4]));
        data[4] = 99; // unsupported version

        let result = deserialize_portable(&data);
        assert!(matches!(
            result,
            Err(IdentityError::InvalidPortableFormat { .. })
        ));
    }

    #[test]
    fn test_truncated_data() {
        let data = serialize_portable(&PortableIdentity::new([0u8; 32], vec![1, 2, 3, 4]));

        // Truncate to just magic and version
        let result = deserialize_portable(&data[..10]);
        assert!(matches!(
            result,
            Err(IdentityError::InvalidPortableFormat { .. })
        ));
    }
}
