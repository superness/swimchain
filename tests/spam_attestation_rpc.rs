//! Tests for Spam Attestation RPC methods (SPEC_12 §3)
//!
//! These tests verify the spam attestation system:
//! 1. Content ID format validation (must be 32-byte hex, NOT sha256: prefixed)
//! 2. Spam attestation submission and storage
//! 3. Counter-attestation submission
//! 4. Spam status retrieval
//! 5. Threshold behavior (3 trees to flag, 5 counters to clear)
//!
//! ## Test Categories
//!
//! 1. **Format Tests**: Verify content_id format handling
//! 2. **Storage Tests**: Verify attestations are stored correctly
//! 3. **Threshold Tests**: Verify flagging/clearing thresholds
//! 4. **Integration Tests**: End-to-end spam reporting flow

use swimchain::spam_attestation::{
    counter::CounterAttestationState,
    storage::SpamAttestationStore,
    types::{
        SpamAttestation, SpamReason, StoredSpamAttestation, COUNTER_ATTESTATION_THRESHOLD,
        SPAM_ATTESTATION_THRESHOLD,
    },
};

// =============================================================================
// FORMAT TESTS: Content ID Validation (Critical Bug Fix Tests)
// =============================================================================

/// Simulates the RPC content_id validation logic
/// This MUST reject sha256: prefixed IDs - the original bug!
fn validate_content_id(content_id: &str) -> Result<[u8; 32], &'static str> {
    match hex::decode(content_id) {
        Ok(bytes) if bytes.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            Ok(arr)
        }
        Ok(_) => Err("Invalid content_id: must be 32-byte hex"),
        Err(_) => Err("Invalid content_id: must be 32-byte hex"),
    }
}

/// Helper to strip sha256: prefix (what forum-client SHOULD do before calling RPC)
fn normalize_content_id(content_id: &str) -> &str {
    if content_id.starts_with("sha256:") {
        &content_id[7..]
    } else {
        content_id
    }
}

#[test]
fn test_content_id_accepts_valid_32_byte_hex() {
    // Valid: 64 hex characters (32 bytes)
    let valid_id = "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
    let bytes = hex::decode(valid_id).expect("Should decode valid hex");
    assert_eq!(bytes.len(), 32, "Should be exactly 32 bytes");

    // RPC validation should pass
    assert!(validate_content_id(valid_id).is_ok());
}

#[test]
fn test_content_id_rejects_sha256_prefix() {
    // Invalid: has sha256: prefix - this was the original bug in forum-client!
    // Forum-client was sending this format but RPC expects raw hex
    let prefixed_id = "sha256:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";

    // hex::decode will fail on the colon
    let result = hex::decode(prefixed_id);
    assert!(
        result.is_err(),
        "Should reject sha256: prefix - not valid hex"
    );

    // RPC validation should reject
    assert!(validate_content_id(prefixed_id).is_err());
}

#[test]
fn test_content_id_rejects_short_hex() {
    // Invalid: only 16 bytes (32 hex chars instead of 64)
    let short_id = "abcd1234abcd1234abcd1234abcd1234";
    let bytes = hex::decode(short_id).expect("Valid hex but wrong length");
    assert_ne!(bytes.len(), 32, "Should not be 32 bytes");

    // RPC validation should reject
    assert!(validate_content_id(short_id).is_err());
}

#[test]
fn test_content_id_rejects_invalid_hex() {
    // Invalid: contains non-hex characters
    let invalid_hex = "gggg1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
    let result = hex::decode(invalid_hex);
    assert!(result.is_err(), "Should reject invalid hex characters");

    // RPC validation should reject
    assert!(validate_content_id(invalid_hex).is_err());
}

#[test]
fn test_content_id_case_insensitive() {
    // Both upper and lowercase should work
    let lower = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    let upper = "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

    let lower_bytes = hex::decode(lower).expect("Should decode lowercase");
    let upper_bytes = hex::decode(upper).expect("Should decode uppercase");

    assert_eq!(lower_bytes, upper_bytes, "Case should not matter");

    // Both should pass RPC validation
    assert!(validate_content_id(lower).is_ok());
    assert!(validate_content_id(upper).is_ok());
}

#[test]
fn test_client_should_strip_sha256_prefix() {
    // This tests what forum-client SHOULD do before sending to RPC
    let prefixed = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let normalized = normalize_content_id(prefixed);

    // After normalization, should be valid for RPC
    assert!(
        validate_content_id(normalized).is_ok(),
        "Normalized ID should be valid"
    );
}

#[test]
fn test_client_handles_already_normalized() {
    // If content_id doesn't have prefix, normalization should pass through
    let already_normalized = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let result = normalize_content_id(already_normalized);

    assert_eq!(
        result, already_normalized,
        "Already normalized should pass through"
    );
    assert!(validate_content_id(result).is_ok());
}

// =============================================================================
// STORAGE TESTS: Attestation Storage
// =============================================================================

fn create_test_store() -> SpamAttestationStore {
    let db = sled::Config::new().temporary(true).open().unwrap();
    SpamAttestationStore::open(db)
}

fn make_stored_attestation(
    content_hash: [u8; 32],
    attester: [u8; 32],
    tree_root: [u8; 32],
) -> StoredSpamAttestation {
    StoredSpamAttestation {
        attestation: SpamAttestation {
            content_hash,
            attester,
            reason: SpamReason::Advertising,
            timestamp: 1735689600,
            pow_nonce: 12345,
            signature: [0u8; 64],
        },
        sponsor_tree_root: tree_root,
        is_deduplicated: false,
    }
}

#[test]
fn test_store_and_retrieve_spam_attestation() {
    let store = create_test_store();

    let content_hash = [1u8; 32];
    let attester = [2u8; 32];
    let tree_root = [3u8; 32];

    let attestation = make_stored_attestation(content_hash, attester, tree_root);

    // Store attestation
    let result = store.put_attestation(&attestation);
    assert!(result.is_ok(), "Should store attestation");

    // Retrieve attestations for content
    let attestations = store
        .get_attestations_for_content(&content_hash)
        .expect("Should retrieve attestations");

    assert_eq!(attestations.len(), 1, "Should have 1 attestation");
    assert_eq!(attestations[0].attestation.attester, attester);
}

#[test]
fn test_duplicate_attestation_detected() {
    let store = create_test_store();

    let content_hash = [1u8; 32];
    let attester = [2u8; 32];
    let tree_root = [3u8; 32];

    let attestation = make_stored_attestation(content_hash, attester, tree_root);

    // First store should succeed
    store.put_attestation(&attestation).unwrap();

    // Check if attestation exists (RPC should check this before accepting)
    let exists = store
        .has_attestation(&content_hash, &attester)
        .expect("Should check existence");

    assert!(exists, "Should have attestation from this attester");
}

#[test]
fn test_multiple_attesters_same_content() {
    let store = create_test_store();

    let content_hash = [1u8; 32];

    // Three different attesters from different sponsor trees
    for i in 0..3u8 {
        let attester = [i + 1; 32];
        let tree_root = [i + 10; 32]; // Different tree roots = independent attestations
        let attestation = make_stored_attestation(content_hash, attester, tree_root);
        store.put_attestation(&attestation).unwrap();
    }

    let attestations = store.get_attestations_for_content(&content_hash).unwrap();
    assert_eq!(attestations.len(), 3, "Should have 3 attestations");
}

// =============================================================================
// THRESHOLD TESTS: Flagging and Clearing
// =============================================================================

#[test]
fn test_spam_threshold_is_three() {
    // SPEC_12 §3: Content is flagged after 3 independent sponsor tree attestations
    assert_eq!(SPAM_ATTESTATION_THRESHOLD, 3, "Spam threshold should be 3");
}

#[test]
fn test_counter_threshold_is_five() {
    // SPEC_12 §3.4: Flag is cleared after 5 Lifeguard+ counter-attestations
    assert_eq!(
        COUNTER_ATTESTATION_THRESHOLD, 5,
        "Counter threshold should be 5"
    );
}

#[test]
fn test_counter_state_tracks_progress() {
    let content_hash = [1u8; 32];

    // Create counter state
    let mut state = CounterAttestationState::empty(content_hash);

    assert_eq!(state.count(), 0, "Should start empty");
    assert_eq!(state.remaining_to_clear(), 5, "Should need 5 counters");

    // Add counter-attesters one by one
    state.add_counter_attester([1u8; 32], 1000000);
    assert_eq!(state.count(), 1, "Should have 1 counter");
    assert_eq!(state.remaining_to_clear(), 4, "Should need 4 more");

    state.add_counter_attester([2u8; 32], 1000001);
    assert_eq!(state.count(), 2, "Should have 2 counters");
    assert_eq!(state.remaining_to_clear(), 3, "Should need 3 more");
}

#[test]
fn test_counter_threshold_reached() {
    let content_hash = [1u8; 32];
    let mut state = CounterAttestationState::empty(content_hash);

    // Add 5 counter-attestations
    for i in 0..5u8 {
        let reached_threshold = state.add_counter_attester([i + 1; 32], 1000000 + i as u64);

        if i < 4 {
            assert!(
                !reached_threshold,
                "Should not be cleared before 5 counters"
            );
            assert!(!state.is_cleared);
        } else {
            assert!(reached_threshold, "Should reach threshold on 5th counter");
            assert!(state.is_cleared);
        }
    }

    assert_eq!(state.count(), 5);
    assert_eq!(state.remaining_to_clear(), 0, "Should be cleared");
}

#[test]
fn test_counter_state_rejects_duplicate() {
    let content_hash = [1u8; 32];
    let mut state = CounterAttestationState::empty(content_hash);

    let attester = [1u8; 32];

    // First add - returns false because threshold not reached (not rejection)
    let _ = state.add_counter_attester(attester, 1000000);
    assert_eq!(state.count(), 1, "Should have 1 counter after first add");

    // Second add with same attester should be silently rejected (no count increase)
    let _ = state.add_counter_attester(attester, 1000001);
    assert_eq!(
        state.count(),
        1,
        "Should still have only 1 counter (duplicate rejected)"
    );

    // Third add with same attester
    let _ = state.add_counter_attester(attester, 1000002);
    assert_eq!(
        state.count(),
        1,
        "Count unchanged - duplicates don't accumulate"
    );
}

// =============================================================================
// SPAM REASON TESTS
// =============================================================================

#[test]
fn test_all_spam_reasons_valid() {
    let reasons = SpamReason::all();
    assert_eq!(reasons.len(), 5, "Should have 5 spam reasons");

    // Verify each reason has a name and description
    for reason in reasons {
        assert!(!reason.name().is_empty(), "Reason should have name");
        assert!(
            !reason.description().is_empty(),
            "Reason should have description"
        );
    }
}

#[test]
fn test_spam_reason_serialization() {
    // Test round-trip serialization
    for reason in SpamReason::all() {
        let byte = reason.as_u8();
        let recovered = SpamReason::from_u8(byte);
        assert_eq!(recovered, Some(*reason), "Should round-trip: {:?}", reason);
    }
}

#[test]
fn test_invalid_spam_reason_rejected() {
    // Values outside valid range should return None
    assert!(
        SpamReason::from_u8(0x00).is_none(),
        "Should reject 0x00 (reserved)"
    );
    assert!(
        SpamReason::from_u8(0x06).is_none(),
        "Should reject values > 0x05"
    );
    assert!(
        SpamReason::from_u8(100).is_none(),
        "Should reject arbitrary values"
    );
    assert!(SpamReason::from_u8(255).is_none(), "Should reject 0xFF");
}

// =============================================================================
// ATTESTATION SERIALIZATION TESTS
// =============================================================================

#[test]
fn test_spam_attestation_serialization() {
    let attestation = SpamAttestation {
        content_hash: [42u8; 32],
        attester: [77u8; 32],
        reason: SpamReason::Harassment,
        timestamp: 1234567890,
        pow_nonce: 999999,
        signature: [0xCD; 64],
    };

    let bytes = attestation.to_bytes();
    let recovered = SpamAttestation::from_bytes(&bytes);

    assert!(recovered.is_some(), "Should deserialize");
    let recovered = recovered.unwrap();

    assert_eq!(recovered.content_hash, attestation.content_hash);
    assert_eq!(recovered.attester, attestation.attester);
    assert_eq!(recovered.reason, attestation.reason);
    assert_eq!(recovered.timestamp, attestation.timestamp);
    assert_eq!(recovered.pow_nonce, attestation.pow_nonce);
}

#[test]
fn test_spam_attestation_signing_message_deterministic() {
    let attestation = SpamAttestation {
        content_hash: [1u8; 32],
        attester: [2u8; 32],
        reason: SpamReason::Advertising,
        timestamp: 1000000,
        pow_nonce: 12345,
        signature: [0u8; 64],
    };

    let msg1 = attestation.signing_message();
    let msg2 = attestation.signing_message();

    assert_eq!(msg1, msg2, "Signing message should be deterministic");
    assert!(!msg1.is_empty(), "Signing message should not be empty");
    assert!(
        msg1.starts_with(b"SPAM_ATTESTATION"),
        "Should have correct prefix"
    );
}

// =============================================================================
// RPC PARAMETER VALIDATION TESTS
// =============================================================================

#[test]
fn test_rpc_validates_content_id_format() {
    // Valid format
    let valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert!(validate_content_id(valid).is_ok());

    // Invalid: sha256: prefix (THE BUG WE FIXED!)
    let with_prefix = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert!(
        validate_content_id(with_prefix).is_err(),
        "Should reject sha256: prefix"
    );

    // Invalid: too short
    let short = "0123456789abcdef";
    assert!(validate_content_id(short).is_err());

    // Invalid: too long
    let long = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123";
    assert!(validate_content_id(long).is_err());

    // Invalid: not hex
    let not_hex = "ghijklmnopqrstuv0123456789abcdef0123456789abcdef0123456789abcdef";
    assert!(validate_content_id(not_hex).is_err());
}

#[test]
fn test_rpc_validates_attester_id_format() {
    // Same validation applies to attester_id (32-byte public key)
    let valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert!(validate_content_id(valid).is_ok());

    // Invalid formats
    assert!(validate_content_id("not-a-valid-pubkey").is_err());
}

// =============================================================================
// RATE LIMITING TESTS
// =============================================================================

#[test]
fn test_rate_limit_tracking() {
    let store = create_test_store();
    let attester = [1u8; 32];
    let current_time = 1735689600u64;

    // Initially zero
    assert_eq!(
        store.get_attestation_count_in_window(&attester, current_time),
        0
    );

    // Increment a few times
    for _ in 0..5 {
        store.increment_attestation_count(&attester, current_time);
    }

    assert_eq!(
        store.get_attestation_count_in_window(&attester, current_time),
        5
    );
}

#[test]
fn test_rate_limit_window_reset() {
    let store = create_test_store();
    let attester = [1u8; 32];
    let current_time = 1735689600u64;

    // Add some attestations
    for _ in 0..5 {
        store.increment_attestation_count(&attester, current_time);
    }
    assert_eq!(
        store.get_attestation_count_in_window(&attester, current_time),
        5
    );

    // Move to next window (1 hour later)
    let next_window = current_time + 3601;
    assert_eq!(
        store.get_attestation_count_in_window(&attester, next_window),
        0,
        "Count should reset in new window"
    );
}
