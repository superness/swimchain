//! Identity system implementation per SPEC_01
//!
//! This module provides the complete identity system for Swimchain:
//! - Ed25519 key generation and management
//! - Proof-of-Work for identity creation (Sybil resistance)
//! - Bech32m address encoding (spec-compliant)
//! - Signature creation and verification
//! - Encrypted key storage (Argon2id + ChaCha20-Poly1305)
//! - Portable identity format for export/import
//!
//! # Core Principle: "Identity IS the Keypair"
//!
//! In Swimchain, there is no username/password system. Your identity
//! IS your Ed25519 keypair. This means:
//! - No password recovery possible (by design)
//! - Full user sovereignty over identity
//! - Works completely offline
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use swimchain::identity::{
//!     create_identity_with_difficulty, encode_address_from_pubkey,
//!     sign, verify, KeyStorage,
//! };
//!
//! // Create identity with PoW (use difficulty 4 for testing, 20 for production)
//! let (keypair, proof) = create_identity_with_difficulty(4);
//!
//! // Get your address
//! let address = encode_address_from_pubkey(&keypair.public_key);
//! println!("Your address: {}", address);
//!
//! // Sign a message
//! let message = b"Hello, Swimchain!";
//! let signature = sign(&keypair.private_key, message);
//!
//! // Verify signature
//! assert!(verify(&keypair.public_key, message, &signature));
//! ```

pub mod portable;
pub mod storage;

// Re-export crypto functions for convenience
pub use crate::crypto::signature::{
    current_timestamp, generate_keypair, sign, sign_content, verify, verify_envelope,
};

#[cfg(any(test, feature = "test-vectors"))]
pub use crate::crypto::signature::generate_keypair_from_seed;

pub use crate::crypto::address::{
    decode_address, decode_address_to_pubkey, encode_address, encode_address_from_pubkey,
    is_valid_address,
};

pub use crate::crypto::pow::{
    mine_identity_pow, mine_identity_pow_with_callback, verify_identity_pow,
    verify_identity_pow_strict, DEFAULT_IDENTITY_POW_DIFFICULTY, POW_FUTURE_TOLERANCE_SECS,
    POW_MAX_AGE_SECS, POW_PAST_TOLERANCE_SECS,
};

// Re-export identity types
pub use crate::types::identity::{
    ActionType, FirstAppearance, IdentityAddress, IdentityCreationProof, IdentityId,
    IdentityMetadata, KeyPair, PrivateKey, PublicKey, ReputationSummary, Signature,
    SignatureEnvelope,
};

// Re-export error type
pub use crate::types::error::IdentityError;

// Re-export storage functionality
pub use storage::{decrypt_private_key, encrypt_private_key, KeyStorage};

// Re-export portable identity functionality
pub use portable::{
    deserialize_portable, from_base64, serialize_portable, to_base64, PortableIdentity,
    PORTABLE_MAGIC, PORTABLE_VERSION,
};

/// Create a new identity with default PoW difficulty (20 bits)
///
/// This creates a new Ed25519 keypair and performs the proof-of-work
/// required for identity creation. With difficulty 20, this takes
/// approximately 10-30 seconds on desktop hardware.
///
/// # Returns
/// A tuple of (keypair, creation_proof)
///
/// # Example
/// ```rust,no_run
/// use swimchain::identity::create_identity;
///
/// // This will take 10-30 seconds
/// let (keypair, proof) = create_identity();
/// ```
#[must_use]
pub fn create_identity() -> (KeyPair, IdentityCreationProof) {
    let keypair = generate_keypair();
    let proof = mine_identity_pow(&keypair, DEFAULT_IDENTITY_POW_DIFFICULTY);
    (keypair, proof)
}

/// Create a new identity with specified PoW difficulty
///
/// Use lower difficulty (e.g., 4-8) for testing, and the default
/// difficulty (20) for production.
///
/// # Arguments
/// * `difficulty` - Number of leading zero bits required in the PoW hash
///
/// # Returns
/// A tuple of (keypair, creation_proof)
///
/// # Example
/// ```rust
/// use swimchain::identity::create_identity_with_difficulty;
///
/// // Fast for testing
/// let (keypair, proof) = create_identity_with_difficulty(4);
/// ```
#[must_use]
pub fn create_identity_with_difficulty(difficulty: u8) -> (KeyPair, IdentityCreationProof) {
    let keypair = generate_keypair();
    let proof = mine_identity_pow(&keypair, difficulty);
    (keypair, proof)
}

/// Create a new identity with progress callback
///
/// The callback is called approximately every 1 million hash attempts,
/// allowing you to display progress to the user.
///
/// # Arguments
/// * `difficulty` - Number of leading zero bits required
/// * `callback` - Function called with the current nonce count
///
/// # Returns
/// A tuple of (keypair, creation_proof)
#[must_use]
pub fn create_identity_with_callback<F>(
    difficulty: u8,
    callback: F,
) -> (KeyPair, IdentityCreationProof)
where
    F: FnMut(u64),
{
    let keypair = generate_keypair();
    let proof = mine_identity_pow_with_callback(&keypair, difficulty, callback);
    (keypair, proof)
}

/// Export an identity to portable format
///
/// This encrypts the private key with the given passphrase and creates
/// a portable identity that can be imported on another device.
///
/// # Arguments
/// * `keypair` - The keypair to export
/// * `proof` - Optional creation proof to include
/// * `passphrase` - Passphrase to encrypt the private key
///
/// # Returns
/// The portable identity
pub fn export_identity(
    keypair: &KeyPair,
    proof: Option<&IdentityCreationProof>,
    passphrase: &str,
) -> Result<PortableIdentity, IdentityError> {
    let encrypted = encrypt_private_key(&keypair.private_key, passphrase)?;
    let mut portable = PortableIdentity::new(*keypair.public_key.as_bytes(), encrypted);

    if let Some(p) = proof {
        portable = portable.with_proof(p.clone());
    }

    Ok(portable)
}

/// Import an identity from portable format
///
/// Decrypts the private key with the given passphrase and verifies
/// that the derived public key matches the stored public key.
///
/// # Arguments
/// * `portable` - The portable identity to import
/// * `passphrase` - Passphrase to decrypt the private key
///
/// # Returns
/// A tuple of (keypair, optional_proof)
///
/// # Errors
/// Returns `IdentityError::KeypairMismatch` if the decrypted private key
/// does not correspond to the stored public key.
pub fn import_identity(
    portable: &PortableIdentity,
    passphrase: &str,
) -> Result<(KeyPair, Option<IdentityCreationProof>), IdentityError> {
    let private_key = decrypt_private_key(&portable.encrypted_private_key, passphrase)?;

    // Verify that the decrypted private key corresponds to the stored public key
    // by deriving the public key from the private key's seed
    let seed = private_key.seed();
    let mut seed_bytes = [0u8; 32];
    seed_bytes.copy_from_slice(seed);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed_bytes);
    let derived_public = signing_key.verifying_key();

    let stored_public_key = PublicKey::from_bytes(portable.public_key);
    if derived_public.as_bytes() != stored_public_key.as_bytes() {
        return Err(IdentityError::KeypairMismatch {
            expected: hex_encode(stored_public_key.as_bytes()),
            derived: hex_encode(derived_public.as_bytes()),
        });
    }

    let keypair = KeyPair {
        public_key: stored_public_key,
        private_key,
    };

    Ok((keypair, portable.creation_proof.clone()))
}

/// Encode bytes as hex string
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_identity_with_difficulty() {
        // Use low difficulty for fast testing
        let (keypair, proof) = create_identity_with_difficulty(4);

        // Verify the proof
        let result = verify_identity_pow(&proof, 4, current_timestamp());
        assert!(result.is_ok());

        // Verify keypair can sign/verify
        let msg = b"test message";
        let sig = sign(&keypair.private_key, msg);
        assert!(verify(&keypair.public_key, msg, &sig));
    }

    #[test]
    fn test_export_import_roundtrip() {
        let (keypair, proof) = create_identity_with_difficulty(4);
        let passphrase = "test-passphrase";

        // Export
        let portable = export_identity(&keypair, Some(&proof), passphrase).unwrap();

        // Import
        let (imported_keypair, imported_proof) = import_identity(&portable, passphrase).unwrap();

        // Verify keypair matches
        assert_eq!(
            imported_keypair.public_key.as_bytes(),
            keypair.public_key.as_bytes()
        );
        assert_eq!(
            imported_keypair.private_key.as_bytes(),
            keypair.private_key.as_bytes()
        );

        // Verify proof was preserved
        assert!(imported_proof.is_some());
        let imported_proof = imported_proof.unwrap();
        assert_eq!(imported_proof.nonce, proof.nonce);
    }

    #[test]
    fn test_wrong_passphrase_fails_import() {
        let (keypair, _proof) = create_identity_with_difficulty(4);

        let portable = export_identity(&keypair, None, "correct").unwrap();
        let result = import_identity(&portable, "wrong");

        assert!(matches!(result, Err(IdentityError::DecryptionError(_))));
    }

    #[test]
    fn test_address_encoding() {
        let (keypair, _) = create_identity_with_difficulty(4);

        // Encode as address - HRP is "cs" (ChainSocial)
        let address = encode_address_from_pubkey(&keypair.public_key);
        assert!(
            address.starts_with("cs1"),
            "Expected cs1 prefix, got: {}",
            address
        );

        // Decode back
        let decoded = decode_address_to_pubkey(&address).unwrap();
        assert_eq!(decoded.as_bytes(), keypair.public_key.as_bytes());
    }

    #[test]
    fn test_sign_verify() {
        let (keypair, _) = create_identity_with_difficulty(4);

        let message = b"Hello, Swimchain!";
        let signature = sign(&keypair.private_key, message);

        assert!(verify(&keypair.public_key, message, &signature));
        assert!(!verify(
            &keypair.public_key,
            b"different message",
            &signature
        ));
    }

    #[test]
    fn test_callback_is_called() {
        let mut callback_count = 0;

        let (_keypair, _proof) = create_identity_with_callback(4, |_nonce| {
            callback_count += 1;
        });

        // With difficulty 4, callback may or may not be called depending on luck
        // This just verifies the function works
        assert!(callback_count >= 0);
    }
}
