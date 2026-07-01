//! Ed25519 signature operations
//!
//! Provides key generation, signing, and verification per SPEC_01.

use ed25519_dalek::{Signature as Ed25519Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;

use crate::types::constants::{SIGNATURE_FUTURE_TOLERANCE_SECS, SIGNATURE_PAST_TOLERANCE_SECS};
use crate::types::error::SerializeError;
use crate::types::identity::{KeyPair, PrivateKey, PublicKey, Signature, SignatureEnvelope};

/// Generate a new Ed25519 keypair using OS random
#[must_use]
pub fn generate_keypair() -> KeyPair {
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key = signing_key.verifying_key();

    // Private key format: 32-byte seed || 32-byte public key
    let mut private_bytes = [0u8; 64];
    private_bytes[..32].copy_from_slice(&signing_key.to_bytes());
    private_bytes[32..].copy_from_slice(verifying_key.as_bytes());

    KeyPair {
        public_key: PublicKey(*verifying_key.as_bytes()),
        private_key: PrivateKey::from_bytes(private_bytes),
    }
}

/// Sign a message with a private key
#[must_use]
pub fn sign(private_key: &PrivateKey, message: &[u8]) -> Signature {
    let seed = private_key.seed();
    let mut seed_bytes = [0u8; 32];
    seed_bytes.copy_from_slice(seed);
    let signing_key = SigningKey::from_bytes(&seed_bytes);
    let sig = signing_key.sign(message);
    Signature(sig.to_bytes())
}

/// Verify a signature against a message and public key
#[must_use]
pub fn verify(public_key: &PublicKey, message: &[u8], signature: &Signature) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_bytes(&public_key.0) else {
        return false;
    };
    let sig = Ed25519Signature::from_bytes(&signature.0);
    verifying_key.verify(message, &sig).is_ok()
}

/// Sign content with timestamp for envelope
///
/// Creates a signature over: content_hash || timestamp (as 8-byte LE)
#[must_use]
pub fn sign_content(
    private_key: &PrivateKey,
    content_hash: &[u8; 32],
    timestamp: u64,
) -> Signature {
    let mut message = [0u8; 40];
    message[..32].copy_from_slice(content_hash);
    message[32..].copy_from_slice(&timestamp.to_le_bytes());
    sign(private_key, &message)
}

/// Verify a signature envelope with timestamp tolerance checking
///
/// Per SPEC_01 §6.2:
/// - Past tolerance: 1 hour (3600 seconds)
/// - Future tolerance: 5 minutes (300 seconds)
pub fn verify_envelope(
    envelope: &SignatureEnvelope,
    current_time: u64,
) -> Result<bool, SerializeError> {
    // Check timestamp tolerance
    if envelope.timestamp < current_time {
        let age = current_time - envelope.timestamp;
        if age > SIGNATURE_PAST_TOLERANCE_SECS {
            return Err(SerializeError::TimestampTooOld {
                age_secs: age,
                tolerance_secs: SIGNATURE_PAST_TOLERANCE_SECS,
            });
        }
    } else {
        let ahead = envelope.timestamp - current_time;
        if ahead > SIGNATURE_FUTURE_TOLERANCE_SECS {
            return Err(SerializeError::TimestampTooNew {
                ahead_secs: ahead,
                tolerance_secs: SIGNATURE_FUTURE_TOLERANCE_SECS,
            });
        }
    }

    // Construct the signed message
    let mut message = [0u8; 40];
    message[..32].copy_from_slice(&envelope.content_hash);
    message[32..].copy_from_slice(&envelope.timestamp.to_le_bytes());

    Ok(verify(&envelope.signer, &message, &envelope.signature))
}

/// Get the current UNIX timestamp in seconds
///
/// Returns 0 if system time is before UNIX epoch (should never happen
/// in practice, but handles misconfigured systems gracefully).
#[must_use]
pub fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Generate keypair from deterministic seed (for test vectors only)
///
/// WARNING: Only use for testing with SPEC_01 test vectors.
/// Production code should use `generate_keypair()` which uses OS randomness.
///
/// # Arguments
/// * `seed` - 32-byte deterministic seed
///
/// # Returns
/// A `KeyPair` derived from the seed
#[cfg(any(test, feature = "test-vectors"))]
#[must_use]
pub fn generate_keypair_from_seed(seed: [u8; 32]) -> KeyPair {
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();

    // Private key format: 32-byte seed || 32-byte public key
    let mut private_bytes = [0u8; 64];
    private_bytes[..32].copy_from_slice(&signing_key.to_bytes());
    private_bytes[32..].copy_from_slice(verifying_key.as_bytes());

    KeyPair {
        public_key: PublicKey(*verifying_key.as_bytes()),
        private_key: PrivateKey::from_bytes(private_bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::identity::ActionType;

    #[test]
    fn test_generate_keypair() {
        let kp = generate_keypair();
        // Verify public key derivation is consistent
        let id = kp.public_key.to_identity_id();
        assert_ne!(id.0, [0u8; 32]);
    }

    #[test]
    fn test_sign_verify_roundtrip() {
        let kp = generate_keypair();
        let message = b"test message";
        let sig = sign(&kp.private_key, message);
        assert!(verify(&kp.public_key, message, &sig));
    }

    #[test]
    fn test_wrong_key_fails() {
        let kp1 = generate_keypair();
        let kp2 = generate_keypair();
        let message = b"test message";
        let sig = sign(&kp1.private_key, message);
        // Wrong public key should fail
        assert!(!verify(&kp2.public_key, message, &sig));
    }

    #[test]
    fn test_modified_message_fails() {
        let kp = generate_keypair();
        let sig = sign(&kp.private_key, b"hello");
        assert!(!verify(&kp.public_key, b"world", &sig));
    }

    #[test]
    fn test_sign_content_deterministic() {
        let kp = generate_keypair();
        let hash = [0xab; 32];
        let timestamp = 1234567890u64;
        let sig1 = sign_content(&kp.private_key, &hash, timestamp);
        let sig2 = sign_content(&kp.private_key, &hash, timestamp);
        // Ed25519 is deterministic
        assert_eq!(sig1.0, sig2.0);
    }

    #[test]
    fn test_verify_envelope_valid() {
        let kp = generate_keypair();
        let hash = [0xcd; 32];
        let timestamp = 1000000;
        let sig = sign_content(&kp.private_key, &hash, timestamp);

        let envelope = SignatureEnvelope {
            signer: kp.public_key,
            timestamp,
            action_type: ActionType::Post,
            content_hash: hash,
            signature: sig,
        };

        // Verify with same timestamp
        let result = verify_envelope(&envelope, timestamp);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_verify_envelope_timestamp_too_old() {
        let kp = generate_keypair();
        let hash = [0xcd; 32];
        let timestamp = 1000000;
        let sig = sign_content(&kp.private_key, &hash, timestamp);

        let envelope = SignatureEnvelope {
            signer: kp.public_key,
            timestamp,
            action_type: ActionType::Post,
            content_hash: hash,
            signature: sig,
        };

        // Verify 2 hours later (exceeds 1 hour tolerance)
        let result = verify_envelope(&envelope, timestamp + 7200);
        assert!(matches!(
            result,
            Err(SerializeError::TimestampTooOld { .. })
        ));
    }

    #[test]
    fn test_verify_envelope_timestamp_too_new() {
        let kp = generate_keypair();
        let hash = [0xcd; 32];
        let timestamp = 1000000;
        let sig = sign_content(&kp.private_key, &hash, timestamp);

        let envelope = SignatureEnvelope {
            signer: kp.public_key,
            timestamp,
            action_type: ActionType::Post,
            content_hash: hash,
            signature: sig,
        };

        // Verify 10 minutes before (exceeds 5 minute future tolerance)
        let result = verify_envelope(&envelope, timestamp - 600);
        assert!(matches!(
            result,
            Err(SerializeError::TimestampTooNew { .. })
        ));
    }

    #[test]
    fn test_verify_envelope_within_tolerance() {
        let kp = generate_keypair();
        let hash = [0xcd; 32];
        let timestamp = 1000000;
        let sig = sign_content(&kp.private_key, &hash, timestamp);

        let envelope = SignatureEnvelope {
            signer: kp.public_key,
            timestamp,
            action_type: ActionType::Post,
            content_hash: hash,
            signature: sig,
        };

        // 30 minutes in past (within 1 hour tolerance)
        assert!(verify_envelope(&envelope, timestamp + 1800).unwrap());
        // 2 minutes in future (within 5 minute tolerance)
        assert!(verify_envelope(&envelope, timestamp - 120).unwrap());
    }
}
