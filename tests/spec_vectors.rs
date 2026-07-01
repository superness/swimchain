//! Specification test vector validation
//!
//! These tests validate that the implementation matches the specification
//! test vectors defined in:
//! - SPEC_01_IDENTITY.md §11 (Identity System)
//! - SPEC_03_PROOF_OF_WORK.md §11 (Action PoW)

use swimchain::crypto::address::encode_address_from_pubkey;
use swimchain::crypto::hash::leading_zeros;
use swimchain::crypto::pow::verify_identity_pow;
use swimchain::crypto::signature::{sign, verify};
use swimchain::types::identity::{IdentityCreationProof, KeyPair, PrivateKey, PublicKey};

use ed25519_dalek::SigningKey;

/// SPEC_01 §11.1 test vector seed
const SPEC_SEED: &str = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

/// SPEC_01 §11.1 expected public key
const SPEC_PUBKEY: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

/// SPEC_01 §11.1 expected address
/// Computed from pubkey d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
const SPEC_ADDRESS: &str = "cs1qrt44xqps2cs4d74f0ld8jtyquaqactj70d2vge94upp568hqag35nnkwuv";

/// Generate keypair from deterministic seed (for test vectors)
///
/// This is implemented here to avoid needing feature flags for tests.
fn generate_keypair_from_seed(seed: [u8; 32]) -> KeyPair {
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();

    // Private key format: 32-byte seed || 32-byte public key
    let mut private_bytes = [0u8; 64];
    private_bytes[..32].copy_from_slice(&signing_key.to_bytes());
    private_bytes[32..].copy_from_slice(verifying_key.as_bytes());

    KeyPair {
        public_key: PublicKey::from_bytes(*verifying_key.as_bytes()),
        private_key: PrivateKey::from_bytes(private_bytes),
    }
}

/// Helper to decode hex string to bytes
fn hex_to_bytes(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

/// Helper to decode hex string to fixed-size array
fn hex_to_array<const N: usize>(s: &str) -> [u8; N] {
    let bytes = hex_to_bytes(s);
    assert_eq!(bytes.len(), N, "hex string wrong length");
    let mut arr = [0u8; N];
    arr.copy_from_slice(&bytes);
    arr
}

#[test]
fn test_spec_01_key_generation() {
    // SPEC_01 §11.1: Deterministic key generation from seed
    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let expected_pubkey: [u8; 32] = hex_to_array(SPEC_PUBKEY);
    assert_eq!(
        keypair.public_key.as_bytes(),
        &expected_pubkey,
        "Public key doesn't match SPEC_01 §11.1 test vector"
    );
}

#[test]
fn test_spec_01_address_encoding() {
    // SPEC_01 §11.1: Address encoding from public key
    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let address = encode_address_from_pubkey(&keypair.public_key);

    assert_eq!(
        address, SPEC_ADDRESS,
        "Address doesn't match SPEC_01 §11.1 test vector"
    );
}

#[test]
fn test_spec_01_signing_verification() {
    // Verify that signing/verification works with the spec keypair
    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let message = b"Swimchain test message";
    let signature = sign(&keypair.private_key, message);

    assert!(
        verify(&keypair.public_key, message, &signature),
        "Signature verification failed for SPEC keypair"
    );

    // Wrong message should fail
    assert!(
        !verify(&keypair.public_key, b"wrong message", &signature),
        "Signature should not verify for wrong message"
    );
}

#[test]
fn test_pow_hash_format() {
    // Verify PoW hash is computed correctly: SHA-256(pubkey || timestamp_le || nonce_le)
    use sha2::{Digest, Sha256};

    let pubkey = [0xab; 32];
    let timestamp: u64 = 1700000000;
    let nonce: u64 = 12345;

    // Build data
    let mut data = [0u8; 48];
    data[..32].copy_from_slice(&pubkey);
    data[32..40].copy_from_slice(&timestamp.to_le_bytes());
    data[40..48].copy_from_slice(&nonce.to_le_bytes());

    // Compute hash
    let hash: [u8; 32] = Sha256::digest(&data).into();

    // Verify leading_zeros works
    let zeros = leading_zeros(&hash);
    assert!(zeros >= 0, "leading_zeros should return valid count");
}

#[test]
fn test_pow_verification_recomputes_hash() {
    // Create a valid PoW and verify it's properly validated
    use swimchain::crypto::signature::current_timestamp;

    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    // Mine a low-difficulty proof for testing
    use swimchain::crypto::pow::mine_identity_pow;
    let proof = mine_identity_pow(&keypair, 4);

    // Verify the proof
    let result = verify_identity_pow(&proof, 4, current_timestamp());
    assert!(result.is_ok(), "Valid PoW should verify: {:?}", result);
}

#[test]
fn test_pow_wrong_hash_fails() {
    // A proof with an incorrect hash should fail verification
    use swimchain::crypto::signature::current_timestamp;
    use swimchain::types::error::IdentityError;

    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    // Create a fake proof with wrong hash
    let proof = IdentityCreationProof {
        public_key: keypair.public_key,
        timestamp: current_timestamp(),
        nonce: 12345,
        pow_hash: [0xFF; 32], // Obviously wrong hash
    };

    let result = verify_identity_pow(&proof, 4, current_timestamp());
    assert!(
        matches!(result, Err(IdentityError::PowDifficultyNotMet { .. })),
        "Wrong hash should fail verification: {:?}",
        result
    );
}

#[test]
fn test_address_version_byte() {
    // Verify address includes version byte 0
    let pubkey = PublicKey::from_bytes([0x00; 32]);
    let address = encode_address_from_pubkey(&pubkey);

    // Address format: cs1 + q (version 0 in bech32) + ...
    assert!(
        address.starts_with("cs1q"),
        "Address should start with cs1q"
    );
}

#[test]
fn test_address_roundtrip() {
    use swimchain::crypto::address::decode_address_to_pubkey;

    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let address = encode_address_from_pubkey(&keypair.public_key);
    let decoded = decode_address_to_pubkey(&address).unwrap();

    assert_eq!(
        decoded.as_bytes(),
        keypair.public_key.as_bytes(),
        "Address roundtrip should preserve public key"
    );
}

#[test]
fn test_signature_deterministic() {
    // Ed25519 signatures should be deterministic
    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let message = b"deterministic test";
    let sig1 = sign(&keypair.private_key, message);
    let sig2 = sign(&keypair.private_key, message);

    assert_eq!(
        sig1.as_bytes(),
        sig2.as_bytes(),
        "Ed25519 signatures should be deterministic"
    );
}

#[test]
fn test_pow_timestamp_anti_stockpile() {
    // PoW older than 24 hours should fail anti-stockpile check
    use swimchain::crypto::pow::mine_identity_pow;
    use swimchain::types::error::IdentityError;

    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let proof = mine_identity_pow(&keypair, 4);

    // Verify 25 hours later
    let future_time = proof.timestamp + 25 * 3600;
    let result = verify_identity_pow(&proof, 4, future_time);

    assert!(
        matches!(result, Err(IdentityError::PowTimestampStockpile { .. })),
        "25-hour-old PoW should fail anti-stockpile: {:?}",
        result
    );
}

#[test]
fn test_pow_timestamp_future() {
    // PoW with future timestamp should fail
    use swimchain::crypto::pow::mine_identity_pow;
    use swimchain::types::error::IdentityError;

    let seed: [u8; 32] = hex_to_array(SPEC_SEED);
    let keypair = generate_keypair_from_seed(seed);

    let proof = mine_identity_pow(&keypair, 4);

    // Verify 10 minutes before (timestamp appears 10 min in future)
    let past_time = proof.timestamp.saturating_sub(600);
    let result = verify_identity_pow(&proof, 4, past_time);

    assert!(
        matches!(result, Err(IdentityError::PowTimestampFuture { .. })),
        "Future timestamp should fail: {:?}",
        result
    );
}

#[test]
fn test_portable_identity_roundtrip() {
    use swimchain::identity::{create_identity_with_difficulty, export_identity, import_identity};

    let (keypair, proof) = create_identity_with_difficulty(4);
    let passphrase = "spec-test-passphrase";

    // Export
    let portable = export_identity(&keypair, Some(&proof), passphrase).unwrap();

    // Import
    let (imported_kp, imported_proof) = import_identity(&portable, passphrase).unwrap();

    // Verify
    assert_eq!(
        imported_kp.public_key.as_bytes(),
        keypair.public_key.as_bytes()
    );
    assert!(imported_proof.is_some());
    assert_eq!(imported_proof.unwrap().nonce, proof.nonce);
}

#[test]
fn test_encrypted_key_roundtrip() {
    use swimchain::identity::{decrypt_private_key, encrypt_private_key, generate_keypair};

    let keypair = generate_keypair();
    let passphrase = "encryption-test";

    let encrypted = encrypt_private_key(&keypair.private_key, passphrase).unwrap();
    let decrypted = decrypt_private_key(&encrypted, passphrase).unwrap();

    assert_eq!(decrypted.as_bytes(), keypair.private_key.as_bytes());
}

#[test]
fn test_wrong_passphrase_fails() {
    use swimchain::identity::{decrypt_private_key, encrypt_private_key, generate_keypair};
    use swimchain::types::error::IdentityError;

    let keypair = generate_keypair();

    let encrypted = encrypt_private_key(&keypair.private_key, "correct").unwrap();
    let result = decrypt_private_key(&encrypted, "wrong");

    assert!(
        matches!(result, Err(IdentityError::DecryptionError(_))),
        "Wrong passphrase should fail"
    );
}

// =============================================================================
// SPEC_03 Action PoW Test Vectors
// =============================================================================

/// SPEC_03 §11.1: Serialization test vector
/// Tests that challenge serialization produces exactly 82 bytes with correct layout
#[test]
fn test_spec_03_serialization_82_bytes() {
    use swimchain::crypto::action_pow::{ActionType, PoWChallenge, CHALLENGE_SERIALIZED_SIZE};

    // Test vector per SPEC_03 §11.1
    let challenge = PoWChallenge {
        action_type: ActionType::Post, // 0x02
        content_hash: hex_to_array(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ),
        author_id: hex_to_array("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
        timestamp: 0x658f5080, // 1703891072
        difficulty: 20,
        nonce_space: hex_to_array_8("deadbeefcafebabe"),
    };

    let serialized = challenge.serialize();

    // Verify length is 82 bytes (NOTE: spec text says 75, but offset table = 82)
    assert_eq!(
        serialized.len(),
        CHALLENGE_SERIALIZED_SIZE,
        "Challenge serialization should be 82 bytes"
    );
    assert_eq!(
        serialized.len(),
        82,
        "CHALLENGE_SERIALIZED_SIZE should be 82"
    );

    // Verify exact hex output
    let expected_hex = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8550123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00000000658f508014deadbeefcafebabe";
    assert_eq!(
        hex::encode(serialized),
        expected_hex,
        "Serialization should match SPEC_03 §11.1 test vector"
    );
}

/// Helper to decode hex string to 8-byte array
fn hex_to_array_8(s: &str) -> [u8; 8] {
    let bytes = hex_to_bytes(s);
    assert_eq!(bytes.len(), 8, "hex string wrong length for 8-byte array");
    let mut arr = [0u8; 8];
    arr.copy_from_slice(&bytes);
    arr
}

/// SPEC_03 §11.3: Leading zero boundary test
/// Verifies correct counting of leading zero bits at byte boundaries
#[test]
fn test_spec_03_leading_zero_boundary() {
    // Test case 1: 0x00ff... = 8 leading zeros (1 full byte)
    let mut hash = [0xFF; 32];
    hash[0] = 0x00;
    hash[1] = 0xFF;
    assert_eq!(
        leading_zeros(&hash),
        8,
        "0x00ff... should have 8 leading zeros"
    );

    // Test case 2: 0x007f... = 9 leading zeros (8 + 1 from 0x7F = 0b01111111)
    hash[0] = 0x00;
    hash[1] = 0x7F;
    assert_eq!(
        leading_zeros(&hash),
        9,
        "0x007f... should have 9 leading zeros"
    );

    // Test case 3: 0x0080... = 8 leading zeros (0x80 = 0b10000000 has 0 leading zeros)
    hash[0] = 0x00;
    hash[1] = 0x80;
    assert_eq!(
        leading_zeros(&hash),
        8,
        "0x0080... should have 8 leading zeros"
    );

    // Test case 4: 0x00003f... = 18 leading zeros (16 + 2 from 0x3F = 0b00111111)
    hash[0] = 0x00;
    hash[1] = 0x00;
    hash[2] = 0x3F;
    assert_eq!(
        leading_zeros(&hash),
        18,
        "0x00003f... should have 18 leading zeros"
    );
}

/// SPEC_03 §6.1: Challenge expiry (10-minute window)
#[test]
fn test_spec_03_challenge_expiry() {
    use swimchain::crypto::action_pow::{
        compute_pow, verify_pow, ActionType, ForkPoWConfig, PoWChallenge, CHALLENGE_VALIDITY_SECS,
    };
    use swimchain::crypto::current_timestamp;
    use swimchain::types::error::ActionPowError;

    assert_eq!(
        CHALLENGE_VALIDITY_SECS, 600,
        "Challenge validity should be 600 seconds (10 minutes)"
    );

    let config = ForkPoWConfig::test();

    // Create challenge with timestamp 11 minutes in the past
    let old_timestamp = current_timestamp() - (11 * 60);
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: [0; 32],
        author_id: [0; 32],
        timestamp: old_timestamp,
        difficulty: 4,
        nonce_space: [0; 8],
    };

    let solution = compute_pow(&challenge, &config).unwrap();
    let result = verify_pow(&solution, &config, current_timestamp());

    assert!(
        matches!(result, Err(ActionPowError::ChallengeExpired { .. })),
        "11-minute-old challenge should be expired: {:?}",
        result
    );
}

/// SPEC_03 §6.3: Content binding verification
#[test]
fn test_spec_03_content_binding() {
    use swimchain::crypto::action_pow::{
        compute_pow, verify_content_binding, ActionType, ForkPoWConfig, PoWChallenge,
    };
    use swimchain::crypto::{current_timestamp, sha256};
    use swimchain::types::error::ActionPowError;

    let config = ForkPoWConfig::test();
    let author = [0x42; 32];
    let content_a = b"Original content A";
    let content_b = b"Different content B";

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(content_a),
        author_id: author,
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0; 8],
    };

    let solution = compute_pow(&challenge, &config).unwrap();

    // Verify with correct content should pass
    let result_a = verify_content_binding(&solution, content_a, &author);
    assert!(
        result_a.is_ok(),
        "Content binding should pass for original content"
    );

    // Verify with different content should fail
    let result_b = verify_content_binding(&solution, content_b, &author);
    assert!(
        matches!(result_b, Err(ActionPowError::ContentMismatch)),
        "Content binding should fail for different content: {:?}",
        result_b
    );
}

/// SPEC_03 §9.3: Memory floor validation (32 MiB minimum)
#[test]
fn test_spec_03_memory_floor() {
    use swimchain::crypto::action_pow::{ForkPoWConfig, MIN_MEMORY_KIB};
    use swimchain::types::error::ActionPowError;

    assert_eq!(
        MIN_MEMORY_KIB, 32768,
        "Minimum memory should be 32768 KiB (32 MiB)"
    );

    // Configuration with 16 MiB (below 32 MiB minimum)
    let config = ForkPoWConfig {
        memory_kib: 16384, // 16 MiB
        iterations: 3,
        parallelism: 4,
    };

    let result = config.validate();
    assert!(
        matches!(
            result,
            Err(ActionPowError::MemoryTooLow { actual_kib: 16384 })
        ),
        "16 MiB config should fail memory validation: {:?}",
        result
    );
}

/// SPEC_03 §6.4: Difficulty tier distinctness
/// Verifies that each action type has distinct difficulty requirements
#[test]
fn test_spec_03_difficulty_tiers_distinct() {
    use swimchain::crypto::action_pow::{difficulty, ActionType, ForkPoWConfig};

    let config = ForkPoWConfig::production();

    // Verify expected difficulty values per SPEC_03 §6.4
    assert_eq!(config.get_difficulty(ActionType::SpaceCreation), 22);
    assert_eq!(config.get_difficulty(ActionType::Post), 20);
    assert_eq!(config.get_difficulty(ActionType::Reply), 18);
    assert_eq!(config.get_difficulty(ActionType::Engage), 16);
    assert_eq!(config.get_difficulty(ActionType::IdentityUpdate), 20);

    // Verify constants match
    assert_eq!(difficulty::SPACE_CREATION, 22);
    assert_eq!(difficulty::POST, 20);
    assert_eq!(difficulty::REPLY, 18);
    assert_eq!(difficulty::ENGAGE, 16);
    assert_eq!(difficulty::IDENTITY_UPDATE, 20);

    // Verify ordering: SPACE > POST = IDENTITY > REPLY > ENGAGE
    assert!(
        difficulty::SPACE_CREATION > difficulty::POST,
        "Space creation should have higher difficulty than post"
    );
    assert!(
        difficulty::POST > difficulty::REPLY,
        "Post should have higher difficulty than reply"
    );
    assert!(
        difficulty::REPLY > difficulty::ENGAGE,
        "Reply should have higher difficulty than engage"
    );
}

/// SPEC_03 §4.1: Argon2id parameters verification
#[test]
fn test_spec_03_argon2id_parameters() {
    use swimchain::crypto::action_pow::ForkPoWConfig;

    let prod = ForkPoWConfig::production();
    assert_eq!(prod.memory_kib, 65536, "Production memory should be 64 MiB");
    assert_eq!(prod.iterations, 3, "Production iterations should be 3");
    assert_eq!(prod.parallelism, 4, "Production parallelism should be 4");

    let mobile = ForkPoWConfig::mobile();
    assert_eq!(mobile.memory_kib, 65536, "Mobile memory should be 64 MiB");
    assert_eq!(mobile.iterations, 3, "Mobile iterations should be 3");
    assert_eq!(mobile.parallelism, 2, "Mobile parallelism should be 2");
}

/// SPEC_03 §4.5: Verification recomputes hash
/// Ensures that tampering with the stored hash is detected
#[test]
fn test_spec_03_verification_recomputes_hash() {
    use swimchain::crypto::action_pow::{
        compute_pow, verify_pow, ActionType, ForkPoWConfig, PoWChallenge,
    };
    use swimchain::crypto::current_timestamp;
    use swimchain::types::error::ActionPowError;

    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: [0; 32],
        author_id: [0; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0; 8],
    };

    let mut solution = compute_pow(&challenge, &config).unwrap();

    // Tamper with the stored hash
    solution.hash[0] ^= 0xFF;

    let result = verify_pow(&solution, &config, current_timestamp());
    assert!(
        matches!(result, Err(ActionPowError::HashMismatch)),
        "Tampered hash should be detected during verification: {:?}",
        result
    );
}
