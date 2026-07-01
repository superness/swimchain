//! Action Proof-of-Work integration tests
//!
//! These tests verify the complete PoW workflow including challenge generation,
//! mining, verification, and content binding. They complement the unit tests
//! in `src/crypto/action_pow.rs` and the spec vector tests in `tests/spec_vectors.rs`.

use swimchain::crypto::action_pow::{
    compute_pow, compute_pow_with_callback, verify_content_binding, verify_pow, ActionType,
    ForkPoWConfig, PoWChallenge, CHALLENGE_SERIALIZED_SIZE, CHALLENGE_VALIDITY_SECS,
};
use swimchain::crypto::{current_timestamp, sha256};
use swimchain::types::error::ActionPowError;

/// Test the complete PoW workflow from challenge generation to verification
#[test]
fn test_complete_pow_workflow() {
    let config = ForkPoWConfig::test();
    let content = b"Hello, Swimchain!";
    let author_pubkey = [0x42u8; 32];

    // Step 1: Generate a challenge
    let challenge = PoWChallenge::generate(ActionType::Post, content, &author_pubkey, 4);

    // Verify challenge properties
    assert_eq!(challenge.action_type, ActionType::Post);
    assert_eq!(challenge.content_hash, sha256(content));
    assert_eq!(challenge.author_id, author_pubkey);
    assert_eq!(challenge.difficulty, 4);
    assert_eq!(challenge.serialize().len(), CHALLENGE_SERIALIZED_SIZE);

    // Step 2: Compute the PoW solution
    let solution = compute_pow(&challenge, &config).expect("PoW computation should succeed");

    // Verify solution properties
    assert_eq!(solution.challenge, challenge);
    assert!(swimchain::crypto::leading_zeros(&solution.hash) >= 4);

    // Step 3: Verify the PoW solution
    let now = current_timestamp();
    verify_pow(&solution, &config, now).expect("PoW verification should succeed");

    // Step 4: Verify content binding
    verify_content_binding(&solution, content, &author_pubkey)
        .expect("Content binding verification should succeed");
}

/// Test that PoW is correctly bound to specific content
#[test]
fn test_pow_binds_to_content() {
    let config = ForkPoWConfig::test();
    let content_a = b"Content A - the original";
    let content_b = b"Content B - different content";
    let author_pubkey = [0x01u8; 32];

    // Generate and solve challenge for content A
    let challenge = PoWChallenge::generate(ActionType::Post, content_a, &author_pubkey, 4);
    let solution = compute_pow(&challenge, &config).expect("PoW computation should succeed");

    // Content binding should pass for original content
    let result_a = verify_content_binding(&solution, content_a, &author_pubkey);
    assert!(
        result_a.is_ok(),
        "Original content should pass binding check"
    );

    // Content binding should fail for different content
    let result_b = verify_content_binding(&solution, content_b, &author_pubkey);
    assert!(
        matches!(result_b, Err(ActionPowError::ContentMismatch)),
        "Different content should fail binding check: {:?}",
        result_b
    );

    // Content binding should fail for different author
    let different_author = [0x99u8; 32];
    let result_author = verify_content_binding(&solution, content_a, &different_author);
    assert!(
        matches!(result_author, Err(ActionPowError::ContentMismatch)),
        "Different author should fail binding check: {:?}",
        result_author
    );
}

/// Test that PoW works with progress callbacks
#[test]
fn test_pow_with_progress_callback() {
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Engage,
        content_hash: sha256(b"callback test"),
        author_id: [0x00; 32],
        timestamp: current_timestamp(),
        difficulty: 8, // Higher difficulty to ensure some callbacks
        nonce_space: [0; 8],
    };

    let mut callback_count = 0;
    let mut last_nonce = 0u64;

    let solution = compute_pow_with_callback(&challenge, &config, |nonce| {
        callback_count += 1;
        assert!(nonce > last_nonce, "Nonce should monotonically increase");
        last_nonce = nonce;
    })
    .expect("PoW computation should succeed");

    // Verify the solution is valid
    verify_pow(&solution, &config, current_timestamp()).expect("Solution should verify");

    // Note: callback_count may be 0 if solution found quickly
    // This is expected behavior for low difficulties
}

/// Test serialization roundtrip for challenges
#[test]
fn test_challenge_serialization_roundtrip() {
    let original = PoWChallenge {
        action_type: ActionType::SpaceCreation,
        content_hash: [0xAB; 32],
        author_id: [0xCD; 32],
        timestamp: 1234567890,
        difficulty: 22,
        nonce_space: [0xEF; 8],
    };

    let serialized = original.serialize();
    assert_eq!(serialized.len(), CHALLENGE_SERIALIZED_SIZE);

    let deserialized =
        PoWChallenge::deserialize(&serialized).expect("Deserialization should succeed");
    assert_eq!(original, deserialized);
}

/// Test that each action type has the expected difficulty
#[test]
fn test_action_type_difficulty_mapping() {
    let config = ForkPoWConfig::production();

    // Test all action types have expected difficulties
    let test_cases = [
        (ActionType::SpaceCreation, 22, "SpaceCreation"),
        (ActionType::Post, 20, "Post"),
        (ActionType::Reply, 18, "Reply"),
        (ActionType::Engage, 16, "Engage"),
        (ActionType::IdentityUpdate, 20, "IdentityUpdate"),
    ];

    for (action_type, expected_difficulty, name) in test_cases {
        let difficulty = config.get_difficulty(action_type);
        assert_eq!(
            difficulty, expected_difficulty,
            "{} should have difficulty {}",
            name, expected_difficulty
        );
    }
}

/// Test configuration validation
#[test]
fn test_config_validation() {
    // Valid production config should pass
    let prod = ForkPoWConfig::production();
    assert!(prod.validate().is_ok(), "Production config should be valid");

    // Valid mobile config should pass
    let mobile = ForkPoWConfig::mobile();
    assert!(mobile.validate().is_ok(), "Mobile config should be valid");

    // Test config with low memory (for tests) should fail production validation
    let test = ForkPoWConfig::test();
    assert!(
        test.validate().is_err(),
        "Test config should fail memory validation"
    );

    // 32 MiB (exactly at minimum) should pass
    let min_valid = ForkPoWConfig {
        memory_kib: 32768,
        iterations: 1,
        parallelism: 1,
    };
    assert!(
        min_valid.validate().is_ok(),
        "32 MiB config should pass validation"
    );

    // 31 MiB (just below minimum) should fail
    let below_min = ForkPoWConfig {
        memory_kib: 31744,
        iterations: 1,
        parallelism: 1,
    };
    assert!(
        below_min.validate().is_err(),
        "31 MiB config should fail validation"
    );
}

/// Test timestamp window validation
#[test]
fn test_timestamp_window_validation() {
    let config = ForkPoWConfig::test();
    let now = current_timestamp();

    // Fresh challenge should verify
    let fresh_challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: [0; 32],
        author_id: [0; 32],
        timestamp: now,
        difficulty: 4,
        nonce_space: [0; 8],
    };
    let fresh_solution = compute_pow(&fresh_challenge, &config).unwrap();
    assert!(verify_pow(&fresh_solution, &config, now).is_ok());

    // Challenge 5 minutes old should verify (within 10-minute window)
    let five_min_old_challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: [1; 32],
        author_id: [0; 32],
        timestamp: now - 300,
        difficulty: 4,
        nonce_space: [1; 8],
    };
    let five_min_solution = compute_pow(&five_min_old_challenge, &config).unwrap();
    assert!(verify_pow(&five_min_solution, &config, now).is_ok());

    // Challenge 11 minutes old should fail (outside 10-minute window)
    let eleven_min_old_challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: [2; 32],
        author_id: [0; 32],
        timestamp: now - 660, // 11 minutes
        difficulty: 4,
        nonce_space: [2; 8],
    };
    let eleven_min_solution = compute_pow(&eleven_min_old_challenge, &config).unwrap();
    let result = verify_pow(&eleven_min_solution, &config, now);
    assert!(matches!(
        result,
        Err(ActionPowError::ChallengeExpired { .. })
    ));
}

/// Test that all action type byte values are correct
#[test]
fn test_action_type_byte_values() {
    assert_eq!(ActionType::SpaceCreation as u8, 0x01);
    assert_eq!(ActionType::Post as u8, 0x02);
    assert_eq!(ActionType::Reply as u8, 0x03);
    assert_eq!(ActionType::Engage as u8, 0x04);
    assert_eq!(ActionType::IdentityUpdate as u8, 0x05);

    // Test round-trip conversion
    for byte_val in 0x01u8..=0x05 {
        let action = ActionType::try_from(byte_val).unwrap();
        assert_eq!(action as u8, byte_val);
    }

    // Invalid action types should error
    assert!(ActionType::try_from(0x00).is_err());
    assert!(ActionType::try_from(0x06).is_err());
    assert!(ActionType::try_from(0xFF).is_err());
}

/// Test the validity period constant
#[test]
fn test_validity_period_constant() {
    // Per SPEC_03 §6.1, challenge validity is 10 minutes = 600 seconds
    assert_eq!(CHALLENGE_VALIDITY_SECS, 600);
}

/// Test different difficulty levels with test configuration
#[test]
fn test_varying_difficulty_levels() {
    let config = ForkPoWConfig::test();
    let content = b"difficulty test";
    let author = [0x00; 32];

    // Test difficulties 2, 4, 6, 8 (keeping them low for test speed)
    for difficulty in [2, 4, 6, 8] {
        let challenge = PoWChallenge::generate(ActionType::Engage, content, &author, difficulty);
        let solution = compute_pow(&challenge, &config)
            .expect(&format!("PoW should succeed at difficulty {}", difficulty));

        // Verify the hash meets difficulty requirement
        let zeros = swimchain::crypto::leading_zeros(&solution.hash);
        assert!(
            zeros >= u32::from(difficulty),
            "Difficulty {} requires {} leading zeros, got {}",
            difficulty,
            difficulty,
            zeros
        );

        // Verify solution passes verification
        verify_pow(&solution, &config, current_timestamp()).expect(&format!(
            "Verification should succeed at difficulty {}",
            difficulty
        ));
    }
}
