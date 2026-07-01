//! Tests for PoW validation in RPC submit methods
//!
//! These tests verify that the RPC endpoint properly validates proof-of-work
//! before accepting content submissions. Without this validation, the entire
//! friction system can be bypassed.
//!
//! ## Test Categories
//!
//! 1. **Unit Tests**: Verify PoW validation logic in isolation
//! 2. **Integration Tests**: Verify CLI and multi-node behavior
//! 3. **Security Tests**: Verify replay attack prevention
//!
//! ## Status
//!
//! These tests should FAIL until PoW validation is implemented in RPC.
//! Once implemented, they verify the security properties.

use std::time::{Duration, Instant};
use swimchain::crypto::action_pow::{
    compute_pow, verify_content_binding, verify_pow, ActionType, ForkPoWConfig, PoWChallenge,
    PoWSolution,
};
use swimchain::crypto::{current_timestamp, sha256};
use swimchain::types::error::ActionPowError;

// =============================================================================
// UNIT TESTS: PoW Validation Logic
// =============================================================================

#[test]
fn test_pow_rejects_missing_nonce() {
    // When a post is submitted with nonce = 0 and no actual PoW work,
    // the verification should fail because the hash won't meet difficulty
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: current_timestamp(),
        difficulty: 8, // Low but non-zero
        nonce_space: [0u8; 8],
    };

    // Create a fake solution with nonce = 0 (not actually computed)
    let fake_solution = PoWSolution {
        challenge: challenge.clone(),
        nonce: 0,
        hash: [0u8; 32], // Clearly wrong hash
    };

    // Verification should fail because hash doesn't match
    let result = verify_pow(&fake_solution, &config, current_timestamp());
    assert!(result.is_err(), "Should reject invalid PoW with zero nonce");
}

#[test]
fn test_pow_rejects_garbage_proof() {
    // Random garbage in the hash field should be rejected
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: current_timestamp(),
        difficulty: 8,
        nonce_space: [0u8; 8],
    };

    // Create solution with random hash that doesn't match computation
    let garbage_solution = PoWSolution {
        challenge: challenge.clone(),
        nonce: 12345,
        hash: [0xAB; 32], // Garbage hash
    };

    let result = verify_pow(&garbage_solution, &config, current_timestamp());
    assert!(result.is_err(), "Should reject garbage hash");
}

#[test]
fn test_pow_accepts_valid_proof() {
    // A properly computed PoW should be accepted
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: current_timestamp(),
        difficulty: 4, // Very low for fast test
        nonce_space: [0u8; 8],
    };

    // Actually compute valid PoW
    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Verification should succeed
    let result = verify_pow(&solution, &config, current_timestamp());
    assert!(result.is_ok(), "Should accept valid PoW: {:?}", result);
}

#[test]
fn test_pow_enforces_minimum_difficulty() {
    // A proof that meets lower difficulty should fail if higher difficulty required
    let config = ForkPoWConfig::test();

    // Compute with difficulty 4
    let challenge_low = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge_low, &config).expect("Should compute PoW");

    // Now create a challenge claiming higher difficulty
    let challenge_high = PoWChallenge {
        difficulty: 16, // Higher requirement
        ..challenge_low.clone()
    };

    // Create fake solution claiming high difficulty
    let fake_high_solution = PoWSolution {
        challenge: challenge_high,
        nonce: solution.nonce,
        hash: solution.hash,
    };

    // Verification should fail because hash doesn't meet difficulty 16
    let result = verify_pow(&fake_high_solution, &config, current_timestamp());
    assert!(
        result.is_err(),
        "Should reject proof that doesn't meet claimed difficulty"
    );
}

#[test]
fn test_pow_reply_difficulty_lower_than_post() {
    // Per SPEC_03, replies have lower difficulty than posts
    let config = ForkPoWConfig::production();

    let post_difficulty = config.get_difficulty(ActionType::Post);
    let reply_difficulty = config.get_difficulty(ActionType::Reply);

    assert!(
        reply_difficulty < post_difficulty,
        "Reply difficulty ({}) should be lower than post difficulty ({})",
        reply_difficulty,
        post_difficulty
    );
}

#[test]
fn test_pow_space_creation_highest_difficulty() {
    // Space creation should have the highest difficulty
    let config = ForkPoWConfig::production();

    let space_difficulty = config.get_difficulty(ActionType::SpaceCreation);
    let post_difficulty = config.get_difficulty(ActionType::Post);
    let reply_difficulty = config.get_difficulty(ActionType::Reply);
    let engage_difficulty = config.get_difficulty(ActionType::Engage);

    assert!(
        space_difficulty >= post_difficulty,
        "Space creation should have highest difficulty"
    );
    assert!(space_difficulty >= reply_difficulty);
    assert!(space_difficulty >= engage_difficulty);
}

#[test]
fn test_pow_rejects_expired_challenge() {
    // Challenge older than 10 minutes should be rejected
    let config = ForkPoWConfig::test();
    let old_timestamp = current_timestamp() - (11 * 60); // 11 minutes ago

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: old_timestamp,
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Should be rejected due to timestamp
    let result = verify_pow(&solution, &config, current_timestamp());
    assert!(
        matches!(result, Err(ActionPowError::ChallengeExpired { .. })),
        "Should reject expired challenge: {:?}",
        result
    );
}

#[test]
fn test_pow_rejects_future_challenge() {
    // Challenge too far in the future should be rejected
    let config = ForkPoWConfig::test();
    let future_timestamp = current_timestamp() + (5 * 60); // 5 minutes in future

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: future_timestamp,
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Should be rejected - too far in future
    let result = verify_pow(&solution, &config, current_timestamp());
    assert!(
        matches!(result, Err(ActionPowError::ChallengeFuture { .. })),
        "Should reject future challenge: {:?}",
        result
    );
}

#[test]
fn test_pow_allows_slight_future_tolerance() {
    // Small clock drift (under 1 minute) should be allowed
    let config = ForkPoWConfig::test();
    let slight_future = current_timestamp() + 30; // 30 seconds ahead

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32],
        timestamp: slight_future,
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Should be accepted - within tolerance
    let result = verify_pow(&solution, &config, current_timestamp());
    assert!(result.is_ok(), "Should accept slight future timestamp");
}

// =============================================================================
// CONTENT BINDING TESTS
// =============================================================================

#[test]
fn test_pow_content_binding_prevents_reuse() {
    // PoW computed for one piece of content should not work for another
    let config = ForkPoWConfig::test();

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"original content"),
        author_id: [1u8; 32],
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Try to use this proof for different content
    let result = verify_content_binding(&solution, b"different content", &[1u8; 32]);
    assert!(
        matches!(result, Err(ActionPowError::ContentMismatch)),
        "Should reject PoW for different content: {:?}",
        result
    );
}

#[test]
fn test_pow_author_binding_prevents_impersonation() {
    // PoW computed for one author should not work for another
    let config = ForkPoWConfig::test();

    let challenge = PoWChallenge {
        action_type: ActionType::Post,
        content_hash: sha256(b"test content"),
        author_id: [1u8; 32], // Author 1
        timestamp: current_timestamp(),
        difficulty: 4,
        nonce_space: [0u8; 8],
    };

    let solution = compute_pow(&challenge, &config).expect("Should compute PoW");

    // Try to use this proof for different author
    let result = verify_content_binding(&solution, b"test content", &[2u8; 32]); // Author 2
    assert!(
        matches!(result, Err(ActionPowError::ContentMismatch)),
        "Should reject PoW for different author: {:?}",
        result
    );
}

// =============================================================================
// REPLAY ATTACK PREVENTION TESTS
// =============================================================================

#[test]
fn test_pow_nonce_space_uniqueness() {
    // Each challenge should have unique nonce_space to prevent replay
    let content = b"test content";
    let author = [1u8; 32];

    let challenge1 = PoWChallenge::generate(ActionType::Post, content, &author, 4);
    let challenge2 = PoWChallenge::generate(ActionType::Post, content, &author, 4);

    // nonce_space should be different (random)
    assert_ne!(
        challenge1.nonce_space, challenge2.nonce_space,
        "Each challenge should have unique random nonce_space"
    );
}

#[test]
fn test_pow_each_post_needs_own_proof() {
    // Computing PoW once should not allow multiple posts
    let config = ForkPoWConfig::test();
    let content = b"test content";
    let author = [1u8; 32];

    // Compute PoW for first challenge
    let challenge1 = PoWChallenge::generate(ActionType::Post, content, &author, 4);
    let solution1 = compute_pow(&challenge1, &config).expect("Should compute PoW");

    // Verify first works
    assert!(verify_pow(&solution1, &config, current_timestamp()).is_ok());

    // Generate second challenge (would be done for second post)
    let challenge2 = PoWChallenge::generate(ActionType::Post, content, &author, 4);

    // Try to reuse solution1's nonce for challenge2
    let fake_solution2 = PoWSolution {
        challenge: challenge2,
        nonce: solution1.nonce,
        hash: solution1.hash,
    };

    // Should fail because hash won't match with different nonce_space
    let result = verify_pow(&fake_solution2, &config, current_timestamp());
    assert!(
        result.is_err(),
        "Should not allow reusing PoW proof for different challenge"
    );
}

// =============================================================================
// ACTION TYPE TESTS
// =============================================================================

#[test]
fn test_pow_action_type_serialization() {
    // Verify action types serialize correctly
    assert_eq!(ActionType::SpaceCreation as u8, 0x01);
    assert_eq!(ActionType::Post as u8, 0x02);
    assert_eq!(ActionType::Reply as u8, 0x03);
    assert_eq!(ActionType::Engage as u8, 0x04);
    assert_eq!(ActionType::IdentityUpdate as u8, 0x05);
}

#[test]
fn test_pow_action_type_affects_challenge() {
    // Same content with different action types should produce different challenges
    let content = b"test";
    let author = [1u8; 32];

    let post_challenge = PoWChallenge::generate(ActionType::Post, content, &author, 4);
    let reply_challenge = PoWChallenge::generate(ActionType::Reply, content, &author, 4);

    // Serialize and compare - action type is first byte
    let post_bytes = post_challenge.serialize();
    let reply_bytes = reply_challenge.serialize();

    assert_ne!(post_bytes[0], reply_bytes[0], "Action type should differ");
}

#[test]
fn test_pow_difficulty_levels() {
    // Verify difficulty configuration for different action types
    // Expected difficulties (from SPEC_03):
    // - Space creation: 22 (~60 seconds)
    // - Post: 20 (~30 seconds)
    // - Reply: 18 (~15 seconds)
    // - Engage: 16 (~5-60 seconds pooled)

    let config = ForkPoWConfig::production();

    assert_eq!(config.get_difficulty(ActionType::SpaceCreation), 22);
    assert_eq!(config.get_difficulty(ActionType::Post), 20);
    assert_eq!(config.get_difficulty(ActionType::Reply), 18);
    assert_eq!(config.get_difficulty(ActionType::Engage), 16);
}

// =============================================================================
// CONFIGURATION TESTS
// =============================================================================

#[test]
fn test_pow_testnet_config_faster() {
    // Testnet config should allow faster PoW for testing
    let testnet = ForkPoWConfig::testnet();
    let production = ForkPoWConfig::production();

    // Testnet should have less memory or iterations
    assert!(
        testnet.memory_kib < production.memory_kib || testnet.iterations < production.iterations,
        "Testnet config should be faster than production"
    );
}

#[test]
fn test_pow_test_config_fast_enough_for_tests() {
    // Test config should compute in under 5 seconds with low difficulty
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge::generate(ActionType::Post, b"test", &[1u8; 32], 4);

    let start = Instant::now();
    let _solution = compute_pow(&challenge, &config).expect("Should compute");
    let elapsed = start.elapsed();

    assert!(
        elapsed < Duration::from_secs(5),
        "Test PoW should complete in under 5 seconds, took {:?}",
        elapsed
    );
}

#[test]
fn test_pow_provides_meaningful_friction() {
    // PoW at post difficulty should take measurable time (at least some iterations)
    let config = ForkPoWConfig::test();
    // Use difficulty 8 which requires ~256 attempts on average
    let challenge = PoWChallenge::generate(ActionType::Post, b"test", &[1u8; 32], 8);

    let start = Instant::now();
    let solution = compute_pow(&challenge, &config).expect("Should compute");
    let elapsed = start.elapsed();

    // The nonce should be > 0 indicating work was done
    assert!(
        solution.nonce > 0 || swimchain::crypto::leading_zeros(&solution.hash) >= 8,
        "PoW should require actual computation"
    );

    // Should take at least a few milliseconds
    assert!(
        elapsed > Duration::from_millis(1),
        "PoW should take measurable time: {:?}",
        elapsed
    );
}

// =============================================================================
// ERROR TYPE TESTS
// =============================================================================

#[test]
fn test_pow_error_types_are_distinct() {
    // These should all be distinct error types for proper error handling
    let difficulty_error = ActionPowError::DifficultyNotMet {
        required: 20,
        actual: 8,
    };
    let hash_error = ActionPowError::HashMismatch;
    let expired_error = ActionPowError::ChallengeExpired { age_secs: 700 };
    let future_error = ActionPowError::ChallengeFuture { ahead_secs: 120 };
    let content_error = ActionPowError::ContentMismatch;

    // Verify error messages are informative
    assert!(
        format!("{:?}", difficulty_error).contains("20"),
        "DifficultyNotMet should show required"
    );
    assert!(
        format!("{:?}", expired_error).contains("700"),
        "ChallengeExpired should show age"
    );
    assert!(
        format!("{:?}", future_error).contains("120"),
        "ChallengeFuture should show ahead"
    );
    assert!(!format!("{:?}", hash_error).is_empty());
    assert!(!format!("{:?}", content_error).is_empty());
}

#[test]
fn test_pow_challenge_serialization_roundtrip() {
    // Verify challenge can be serialized and deserialized
    let original = PoWChallenge {
        action_type: ActionType::Reply,
        content_hash: [0xab; 32],
        author_id: [0xcd; 32],
        timestamp: 1234567890,
        difficulty: 18,
        nonce_space: [0xef; 8],
    };

    let serialized = original.serialize();
    assert_eq!(serialized.len(), 82, "Challenge should be 82 bytes");

    let deserialized = PoWChallenge::deserialize(&serialized).expect("Should deserialize");
    assert_eq!(original, deserialized);
}

// =============================================================================
// RPC PARAMETER COMPATIBILITY TESTS
// =============================================================================

#[test]
fn test_pow_solution_contains_required_rpc_fields() {
    // Verify PoWSolution has all fields needed for RPC
    let config = ForkPoWConfig::test();
    let challenge = PoWChallenge::generate(ActionType::Post, b"content", &[1u8; 32], 4);
    let solution = compute_pow(&challenge, &config).expect("Should compute");

    // For RPC, we need these fields
    let _pow_nonce: u64 = solution.nonce;
    let _pow_difficulty: u8 = solution.challenge.difficulty;
    let _timestamp: u64 = solution.challenge.timestamp;
    let _content_hash: [u8; 32] = solution.challenge.content_hash;
    let _author_id: [u8; 32] = solution.challenge.author_id;
    let _hash: [u8; 32] = solution.hash;
    let _nonce_space: [u8; 8] = solution.challenge.nonce_space;

    // All fields accessible - type system verifies compatibility
}

#[test]
fn test_pow_rpc_validation_sequence() {
    // Simulate the RPC validation sequence
    let config = ForkPoWConfig::test();

    // 1. Client creates content and challenge
    let content = b"Hello, world!";
    let author_id = [42u8; 32];
    let challenge = PoWChallenge::generate(ActionType::Post, content, &author_id, 4);

    // 2. Client computes PoW (this takes time - intentional friction)
    let solution = compute_pow(&challenge, &config).expect("Should compute");

    // 3. Server receives RPC with: content, pow_nonce, pow_difficulty, timestamp, signature
    // 4. Server reconstructs challenge and verifies

    // Verify the proof is valid
    let verify_result = verify_pow(&solution, &config, current_timestamp());
    assert!(verify_result.is_ok(), "Should verify: {:?}", verify_result);

    // Verify content binding
    let binding_result = verify_content_binding(&solution, content, &author_id);
    assert!(binding_result.is_ok(), "Should bind: {:?}", binding_result);
}

// =============================================================================
// INTEGRATION TESTS (require running node - marked #[ignore])
// =============================================================================

#[test]
#[ignore] // Integration test - requires running node
fn test_rpc_rejects_post_without_valid_pow() {
    // GIVEN: A running node with RPC
    // WHEN: submit_post is called with pow_nonce=0, pow_difficulty=0
    // THEN: RPC should return error "invalid proof of work"

    // TODO: Implement when RPC validation is added
    // 1. Start test node
    // 2. Create RPC client
    // 3. Submit post with invalid PoW
    // 4. Assert error response

    todo!("Implement after RPC PoW validation is added")
}

#[test]
#[ignore] // Integration test - requires running node
fn test_rpc_accepts_post_with_valid_pow() {
    // GIVEN: A running node with RPC
    // WHEN: submit_post is called with properly computed PoW
    // THEN: Post is accepted and broadcast

    // TODO: Implement when RPC validation is added
    // 1. Start test node
    // 2. Create content and compute PoW
    // 3. Submit via RPC
    // 4. Assert success response

    todo!("Implement after RPC PoW validation is added")
}

#[test]
#[ignore] // Integration test - requires running node
fn test_cli_post_computes_pow_before_rpc() {
    // GIVEN: A running node with RPC
    // WHEN: User runs `sw post create --title "test" --body "test"`
    // THEN: CLI computes PoW before submitting (takes measurable time)

    // This verifies the full flow:
    // 1. Start test node
    // 2. Run CLI post create command
    // 3. Observe that command takes time (PoW computation)
    // 4. Post is successfully created

    todo!("Implement after RPC PoW validation is added")
}

#[test]
#[ignore] // Integration test - requires running node
fn test_rapid_posting_blocked_without_pow() {
    // GIVEN: A running node
    // WHEN: Attempting to submit multiple posts rapidly with no PoW
    // THEN: All are rejected

    // This test tries to abuse the RPC directly:
    // 1. Start test node
    // 2. Try to submit 10 posts in 1 second with pow_nonce=0
    // 3. All should be rejected
    // 4. Then submit 1 post with valid PoW
    // 5. That one should be accepted

    todo!("Implement after RPC PoW validation is added")
}
