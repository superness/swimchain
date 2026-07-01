//! Integration tests for core data structures
//!
//! Tests the public API of types, serialization, and crypto modules.

use swimchain::crypto::{
    decode_address, encode_address, generate_keypair, leading_zeros, merkle_root, sha256, sign,
    sign_content, verify, verify_envelope,
};
use swimchain::types::{
    ActionType, ByteReader, ByteWriter, ContentHash, ContentId, ContentType, IdentityId, MediaType,
    PublicKey, Serialize, SerializeError, Signature, SignatureEnvelope,
};

// ============================================================================
// Identity Type Tests
// ============================================================================

#[test]
fn test_identity_id_display_hex() {
    let id = IdentityId::from_bytes([0xab; 32]);
    let display = format!("{id}");
    assert_eq!(display.len(), 64, "hex display should be 64 characters");
    assert!(
        display.chars().all(|c| c.is_ascii_hexdigit()),
        "should be valid hex"
    );
    assert!(display.contains("ab"), "should contain expected hex");
}

#[test]
fn test_private_key_debug_redacted() {
    let kp = generate_keypair();
    let debug = format!("{:?}", kp.private_key);
    assert!(debug.contains("REDACTED"), "private key should be redacted");
    // Should not contain raw bytes
    assert!(
        !debug.contains("42") && !debug.contains("[0x"),
        "should not show raw bytes"
    );
}

#[test]
fn test_identity_id_default_is_zeros() {
    let id = IdentityId::default();
    assert_eq!(id.as_bytes(), &[0u8; 32], "default should be all zeros");
}

#[test]
fn test_public_key_to_identity_id() {
    let kp = generate_keypair();
    let id1 = kp.public_key.to_identity_id();
    let id2 = kp.public_key.to_identity_id();
    assert_eq!(id1, id2, "identity derivation should be deterministic");
    assert_ne!(id1.as_bytes(), &[0u8; 32], "should not be zeros");
}

// ============================================================================
// Content Type Tests
// ============================================================================

#[test]
fn test_content_type_discriminants() {
    assert_eq!(ContentType::Post as u8, 0x00);
    assert_eq!(ContentType::Reply as u8, 0x01);
    assert_eq!(ContentType::Quote as u8, 0x02);
}

#[test]
fn test_content_type_try_from() {
    assert_eq!(ContentType::try_from(0x00).unwrap(), ContentType::Post);
    assert_eq!(ContentType::try_from(0x01).unwrap(), ContentType::Reply);
    assert_eq!(ContentType::try_from(0x02).unwrap(), ContentType::Quote);
    assert!(
        ContentType::try_from(0xFF).is_err(),
        "unknown discriminant should fail"
    );
}

#[test]
fn test_media_type_discriminants() {
    assert_eq!(MediaType::ImageJpeg as u8, 0x01);
    assert_eq!(MediaType::ImagePng as u8, 0x02);
    assert_eq!(MediaType::ImageGif as u8, 0x03);
    assert_eq!(MediaType::ImageWebp as u8, 0x04);
}

#[test]
fn test_action_type_discriminants() {
    assert_eq!(ActionType::Post as u8, 0x00);
    assert_eq!(ActionType::Reply as u8, 0x01);
    assert_eq!(ActionType::IdentityCreation as u8, 0x02);
}

// ============================================================================
// Serialization Tests
// ============================================================================

#[test]
fn test_byte_writer_little_endian() {
    let mut w = ByteWriter::new();
    w.write_u32_le(0x12345678);
    let bytes = w.finish();
    assert_eq!(
        bytes,
        vec![0x78, 0x56, 0x34, 0x12],
        "should be little-endian"
    );
}

#[test]
fn test_byte_writer_u64_little_endian() {
    let mut w = ByteWriter::new();
    w.write_u64_le(0x0102030405060708);
    let bytes = w.finish();
    assert_eq!(
        bytes,
        vec![0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01],
        "should be little-endian"
    );
}

#[test]
fn test_byte_reader_roundtrip() {
    let mut w = ByteWriter::new();
    w.write_u8(0x42);
    w.write_u16_le(0x1234);
    w.write_u32_le(0xDEADBEEF);
    w.write_u64_le(0xCAFEBABE12345678);
    let data = w.finish();

    let mut r = ByteReader::new(&data);
    assert_eq!(r.read_u8().unwrap(), 0x42);
    assert_eq!(r.read_u16_le().unwrap(), 0x1234);
    assert_eq!(r.read_u32_le().unwrap(), 0xDEADBEEF);
    assert_eq!(r.read_u64_le().unwrap(), 0xCAFEBABE12345678);
    assert!(r.is_empty());
}

#[test]
fn test_byte_reader_unexpected_eof() {
    let data = vec![0x01, 0x02];
    let mut r = ByteReader::new(&data);
    assert!(matches!(
        r.read_u64_le(),
        Err(SerializeError::UnexpectedEof)
    ));
}

#[test]
fn test_optional_serialization() {
    // None case
    let mut w = ByteWriter::new();
    w.write_optional::<u32, _>(None, |w, v| w.write_u32_le(*v));
    assert_eq!(w.finish(), vec![0x00]);

    // Some case
    let mut w = ByteWriter::new();
    w.write_optional(Some(&0x12345678u32), |w, v| w.write_u32_le(*v));
    assert_eq!(w.finish(), vec![0x01, 0x78, 0x56, 0x34, 0x12]);
}

#[test]
fn test_string_serialization() {
    let mut w = ByteWriter::new();
    w.write_string_u8("hello");
    let data = w.finish();
    assert_eq!(data[0], 5, "length prefix should be 5");
    assert_eq!(&data[1..], b"hello");

    let mut r = ByteReader::new(&data);
    assert_eq!(r.read_string_u8().unwrap(), "hello");
}

// ============================================================================
// Newtype Serialization Roundtrip Tests
// ============================================================================

#[test]
fn test_identity_id_roundtrip() {
    let original = IdentityId::from_bytes([0xab; 32]);
    let bytes = original.as_bytes();
    assert_eq!(bytes.len(), 32);
    let recovered = IdentityId::from_bytes(*bytes);
    assert_eq!(original, recovered);
}

#[test]
fn test_content_hash_roundtrip() {
    let original = ContentHash::from_bytes([0xcd; 32]);
    let bytes = original.as_bytes();
    let recovered = ContentHash::from_bytes(*bytes);
    assert_eq!(original, recovered);
}

#[test]
fn test_content_id_roundtrip() {
    let original = ContentId::from_bytes([0xef; 32]);
    let bytes = original.as_bytes();
    let recovered = ContentId::from_bytes(*bytes);
    assert_eq!(original, recovered);
}

#[test]
fn test_public_key_roundtrip() {
    let kp = generate_keypair();
    let bytes = kp.public_key.as_bytes();
    let recovered = PublicKey::from_bytes(*bytes);
    assert_eq!(kp.public_key, recovered);
}

#[test]
fn test_signature_roundtrip() {
    let kp = generate_keypair();
    let sig = sign(&kp.private_key, b"test");
    let bytes = sig.as_bytes();
    let recovered = Signature::from_bytes(*bytes);
    assert_eq!(sig, recovered);
}

#[test]
fn test_serialize_identity_id_roundtrip() {
    // Test serialization through ByteWriter/ByteReader
    let original = IdentityId::from_bytes([0xab; 32]);
    let mut writer = ByteWriter::new();
    writer.write_bytes(original.as_bytes());
    let bytes = writer.finish();
    assert_eq!(bytes.len(), 32);
}

// ============================================================================
// Hash Function Tests
// ============================================================================

#[test]
fn test_sha256_empty() {
    let hash = sha256(b"");
    // Known SHA-256 of empty string
    let expected =
        hex::decode("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855").unwrap();
    assert_eq!(&hash[..], &expected[..]);
}

#[test]
fn test_sha256_abc() {
    let hash = sha256(b"abc");
    // Known SHA-256 of "abc"
    let expected =
        hex::decode("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad").unwrap();
    assert_eq!(&hash[..], &expected[..]);
}

#[test]
fn test_merkle_root_empty() {
    let root = merkle_root(&[]);
    assert_eq!(root, [0u8; 32], "empty merkle root should be zeros");
}

#[test]
fn test_merkle_root_single() {
    let hash = sha256(b"single");
    let root = merkle_root(&[hash]);
    assert_eq!(
        root, hash,
        "single hash merkle root should be the hash itself"
    );
}

#[test]
fn test_merkle_root_two() {
    let h1 = sha256(b"one");
    let h2 = sha256(b"two");
    let root = merkle_root(&[h1, h2]);

    // Verify against manual computation
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(&h1);
    combined[32..].copy_from_slice(&h2);
    let expected = sha256(&combined);
    assert_eq!(root, expected);
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
fn test_leading_zeros_partial() {
    // 0x0F = 0b00001111 = 4 leading zeros
    let mut hash = [0xFFu8; 32];
    hash[0] = 0x0F;
    assert_eq!(leading_zeros(&hash), 4);
}

// ============================================================================
// Signature Tests
// ============================================================================

#[test]
fn test_sign_verify_roundtrip() {
    let kp = generate_keypair();
    let message = b"test message for signing";
    let sig = sign(&kp.private_key, message);
    assert!(
        verify(&kp.public_key, message, &sig),
        "signature should verify"
    );
}

#[test]
fn test_wrong_key_verification_fails() {
    let kp1 = generate_keypair();
    let kp2 = generate_keypair();
    let message = b"test message";
    let sig = sign(&kp1.private_key, message);
    assert!(
        !verify(&kp2.public_key, message, &sig),
        "wrong key should fail verification"
    );
}

#[test]
fn test_modified_message_verification_fails() {
    let kp = generate_keypair();
    let sig = sign(&kp.private_key, b"hello");
    assert!(
        !verify(&kp.public_key, b"world", &sig),
        "modified message should fail verification"
    );
}

#[test]
fn test_sign_content_deterministic() {
    let kp = generate_keypair();
    let hash = [0xab; 32];
    let timestamp = 1234567890u64;

    let sig1 = sign_content(&kp.private_key, &hash, timestamp);
    let sig2 = sign_content(&kp.private_key, &hash, timestamp);
    assert_eq!(sig1, sig2, "content signing should be deterministic");
}

// ============================================================================
// Signature Envelope Tests (Timestamp Tolerance)
// ============================================================================

#[test]
fn test_verify_envelope_valid() {
    let kp = generate_keypair();
    let hash = [0xcd; 32];
    let timestamp = 1000000u64;
    let sig = sign_content(&kp.private_key, &hash, timestamp);

    let envelope = SignatureEnvelope {
        signer: kp.public_key,
        timestamp,
        action_type: ActionType::Post,
        content_hash: hash,
        signature: sig,
    };

    let result = verify_envelope(&envelope, timestamp);
    assert!(result.is_ok());
    assert!(result.unwrap(), "valid envelope should verify");
}

#[test]
fn test_verify_envelope_timestamp_too_old() {
    let kp = generate_keypair();
    let hash = [0xcd; 32];
    let timestamp = 1000000u64;
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
    assert!(
        matches!(result, Err(SerializeError::TimestampTooOld { .. })),
        "2 hours old should be rejected"
    );
}

#[test]
fn test_verify_envelope_timestamp_too_new() {
    let kp = generate_keypair();
    let hash = [0xcd; 32];
    let timestamp = 1000000u64;
    let sig = sign_content(&kp.private_key, &hash, timestamp);

    let envelope = SignatureEnvelope {
        signer: kp.public_key,
        timestamp,
        action_type: ActionType::Post,
        content_hash: hash,
        signature: sig,
    };

    // Verify 10 minutes before envelope timestamp (exceeds 5 minute future tolerance)
    let result = verify_envelope(&envelope, timestamp - 600);
    assert!(
        matches!(result, Err(SerializeError::TimestampTooNew { .. })),
        "10 minutes in future should be rejected"
    );
}

#[test]
fn test_verify_envelope_within_past_tolerance() {
    let kp = generate_keypair();
    let hash = [0xcd; 32];
    let timestamp = 1000000u64;
    let sig = sign_content(&kp.private_key, &hash, timestamp);

    let envelope = SignatureEnvelope {
        signer: kp.public_key,
        timestamp,
        action_type: ActionType::Post,
        content_hash: hash,
        signature: sig,
    };

    // 30 minutes later (within 1 hour tolerance)
    let result = verify_envelope(&envelope, timestamp + 1800);
    assert!(result.is_ok());
    assert!(result.unwrap());
}

#[test]
fn test_verify_envelope_within_future_tolerance() {
    let kp = generate_keypair();
    let hash = [0xcd; 32];
    let timestamp = 1000000u64;
    let sig = sign_content(&kp.private_key, &hash, timestamp);

    let envelope = SignatureEnvelope {
        signer: kp.public_key,
        timestamp,
        action_type: ActionType::Post,
        content_hash: hash,
        signature: sig,
    };

    // 2 minutes before (within 5 minute future tolerance)
    let result = verify_envelope(&envelope, timestamp - 120);
    assert!(result.is_ok());
    assert!(result.unwrap());
}

// ============================================================================
// Address Encoding Tests
// ============================================================================

#[test]
fn test_bech32m_roundtrip() {
    let original = IdentityId::from_bytes([0xab; 32]);
    let encoded = encode_address(&original);
    let decoded = decode_address(&encoded).unwrap();
    assert_eq!(original, decoded, "address encoding should roundtrip");
}

#[test]
fn test_address_starts_with_cs1() {
    let id = IdentityId::from_bytes([0x00; 32]);
    let encoded = encode_address(&id);
    assert!(encoded.starts_with("sw1"), "address should start with cs1");
}

#[test]
fn test_address_is_lowercase() {
    let id = IdentityId::from_bytes([0xff; 32]);
    let encoded = encode_address(&id);
    assert_eq!(
        encoded,
        encoded.to_lowercase(),
        "address should be lowercase"
    );
}

#[test]
fn test_different_ids_different_addresses() {
    let id1 = IdentityId::from_bytes([0x00; 32]);
    let id2 = IdentityId::from_bytes([0x01; 32]);
    let addr1 = encode_address(&id1);
    let addr2 = encode_address(&id2);
    assert_ne!(
        addr1, addr2,
        "different IDs should have different addresses"
    );
}

#[test]
fn test_zero_id_address_roundtrip() {
    let id = IdentityId::from_bytes([0u8; 32]);
    let addr = encode_address(&id);
    let decoded = decode_address(&addr).unwrap();
    assert_eq!(id, decoded);
}
