//! Spam attestation validation per SPEC_12 Section 4.1
//!
//! Validates attestation eligibility and attestation integrity:
//! - Attester must be Resident+ level
//! - Valid Ed25519 signature
//! - PoW meets difficulty requirement
//! - Timestamp within acceptable window
//! - Rate limit not exceeded
//! - Not self-attestation

use crate::crypto::{leading_zeros, pow_hash};

use super::error::SpamAttestationError;
use super::types::{
    SpamAttestation, SPAM_ATTESTATION_MAX_AGE_SECS, SPAM_ATTESTATION_POW_DIFFICULTY,
    SPAM_ATTESTATION_RATE_LIMIT_HOURLY, SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS,
};

/// Result of attestation eligibility check.
#[derive(Debug, Clone)]
pub struct AttesterEligibility {
    /// Whether the attester is eligible
    pub is_eligible: bool,

    /// Number of attestations made in the current rate limit window
    pub attestation_count_in_window: u32,

    /// Reason for ineligibility, if any
    pub denial_reason: Option<SpamAttestationError>,
}

impl AttesterEligibility {
    /// Create eligibility result for an eligible attester.
    pub fn eligible(attestation_count: u32) -> Self {
        Self {
            is_eligible: true,
            attestation_count_in_window: attestation_count,
            denial_reason: None,
        }
    }

    /// Create eligibility result for an ineligible attester.
    pub fn ineligible(
        attestation_count: u32,
        reason: SpamAttestationError,
    ) -> Self {
        Self {
            is_eligible: false,
            attestation_count_in_window: attestation_count,
            denial_reason: Some(reason),
        }
    }
}

/// Check if an identity is eligible to submit spam attestations.
///
/// Eligibility requirements per SPEC_12 §4.1:
/// - Must not have exceeded rate limit (10/hour)
///
/// # Arguments
/// * `attestations_in_window` - Number of attestations submitted in the current hour
pub fn check_attester_eligibility(
    attestations_in_window: u32,
) -> AttesterEligibility {
    // Check rate limit
    if attestations_in_window >= SPAM_ATTESTATION_RATE_LIMIT_HOURLY {
        return AttesterEligibility::ineligible(
            attestations_in_window,
            SpamAttestationError::RateLimitExceeded {
                count: attestations_in_window,
                limit: SPAM_ATTESTATION_RATE_LIMIT_HOURLY,
                window_secs: SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS,
            },
        );
    }

    AttesterEligibility::eligible(attestations_in_window)
}

/// Check if an identity is eligible to submit counter-attestations.
///
/// Counter-attestations share the same rate limit.
pub fn check_counter_attester_eligibility(
    attestations_in_window: u32,
) -> AttesterEligibility {
    // Counter-attestations share the same rate limit
    if attestations_in_window >= SPAM_ATTESTATION_RATE_LIMIT_HOURLY {
        return AttesterEligibility::ineligible(
            attestations_in_window,
            SpamAttestationError::RateLimitExceeded {
                count: attestations_in_window,
                limit: SPAM_ATTESTATION_RATE_LIMIT_HOURLY,
                window_secs: SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS,
            },
        );
    }

    AttesterEligibility::eligible(attestations_in_window)
}

/// Validate a spam attestation per SPEC_12 §4.1.
///
/// Checks:
/// 1. Signature validity
/// 2. PoW meets difficulty requirement
/// 3. Timestamp within acceptable window
/// 4. Not self-attestation (attester != content author)
///
/// # Arguments
/// * `attestation` - The attestation to validate
/// * `current_time` - Current Unix timestamp
/// * `content_author` - Public key of the content's author
/// * `verify_signature` - Callback to verify Ed25519 signature
pub fn validate_attestation<F>(
    attestation: &SpamAttestation,
    current_time: u64,
    content_author: &[u8; 32],
    verify_signature: F,
) -> Result<(), SpamAttestationError>
where
    F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
{
    // 1. Check self-attestation
    if &attestation.attester == content_author {
        return Err(SpamAttestationError::SelfAttestation);
    }

    // 2. Check timestamp - not too old
    if current_time > attestation.timestamp {
        let age = current_time - attestation.timestamp;
        if age > SPAM_ATTESTATION_MAX_AGE_SECS {
            return Err(SpamAttestationError::TimestampTooOld {
                age_secs: age,
                max_age_secs: SPAM_ATTESTATION_MAX_AGE_SECS,
            });
        }
    } else {
        // Future timestamp - allow small clock skew (5 minutes)
        let future = attestation.timestamp - current_time;
        if future > 300 {
            return Err(SpamAttestationError::TimestampInFuture { future_secs: future });
        }
    }

    // 3. Verify signature
    let signing_message = attestation.signing_message();
    if !verify_signature(&attestation.attester, &signing_message, &attestation.signature) {
        return Err(SpamAttestationError::InvalidSignature);
    }

    // 4. Verify PoW
    let pow_message = attestation.pow_message();
    let mut hash_input = Vec::with_capacity(pow_message.len() + 8);
    hash_input.extend_from_slice(&pow_message);
    hash_input.extend_from_slice(&attestation.pow_nonce.to_le_bytes());
    let hash = pow_hash(&hash_input);
    let zeros = leading_zeros(&hash) as u8;
    if zeros < SPAM_ATTESTATION_POW_DIFFICULTY {
        return Err(SpamAttestationError::InsufficientPoW {
            required: SPAM_ATTESTATION_POW_DIFFICULTY,
            actual: zeros,
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_attester_eligibility_rate_limit() {
        // Under limit - eligible
        let result = check_attester_eligibility(0);
        assert!(result.is_eligible);

        let result = check_attester_eligibility(9);
        assert!(result.is_eligible);

        // At limit - ineligible
        let result = check_attester_eligibility(10);
        assert!(!result.is_eligible);
        assert!(matches!(
            result.denial_reason,
            Some(SpamAttestationError::RateLimitExceeded { .. })
        ));

        // Over limit
        let result = check_attester_eligibility(15);
        assert!(!result.is_eligible);
    }

    #[test]
    fn test_counter_attester_eligibility() {
        // Under rate limit - eligible
        let result = check_counter_attester_eligibility(0);
        assert!(result.is_eligible);

        let result = check_counter_attester_eligibility(9);
        assert!(result.is_eligible);

        // At rate limit - ineligible
        let result = check_counter_attester_eligibility(10);
        assert!(!result.is_eligible);
        assert!(matches!(
            result.denial_reason,
            Some(SpamAttestationError::RateLimitExceeded { .. })
        ));
    }

    #[test]
    fn test_validate_attestation_self_attestation() {
        let author = [1u8; 32];
        let attestation = SpamAttestation {
            content_hash: [0u8; 32],
            attester: author, // Same as author
            reason: super::super::types::SpamReason::Advertising,
            timestamp: 1735689600,
            pow_nonce: 0,
            signature: [0u8; 64],
        };

        let result = validate_attestation(&attestation, 1735689600, &author, |_, _, _| true);
        assert!(matches!(result, Err(SpamAttestationError::SelfAttestation)));
    }

    #[test]
    fn test_validate_attestation_timestamp_old() {
        let author = [1u8; 32];
        let attester = [2u8; 32];
        let attestation = SpamAttestation {
            content_hash: [0u8; 32],
            attester,
            reason: super::super::types::SpamReason::Advertising,
            timestamp: 1735689600,
            pow_nonce: 0,
            signature: [0u8; 64],
        };

        // 2 days later - too old
        let current_time = 1735689600 + 2 * 86400;
        let result = validate_attestation(&attestation, current_time, &author, |_, _, _| true);
        assert!(matches!(
            result,
            Err(SpamAttestationError::TimestampTooOld { .. })
        ));
    }

    #[test]
    fn test_validate_attestation_timestamp_future() {
        let author = [1u8; 32];
        let attester = [2u8; 32];
        let attestation = SpamAttestation {
            content_hash: [0u8; 32],
            attester,
            reason: super::super::types::SpamReason::Advertising,
            timestamp: 1735689600 + 600, // 10 minutes in future
            pow_nonce: 0,
            signature: [0u8; 64],
        };

        let result = validate_attestation(&attestation, 1735689600, &author, |_, _, _| true);
        assert!(matches!(
            result,
            Err(SpamAttestationError::TimestampInFuture { .. })
        ));
    }

    #[test]
    fn test_validate_attestation_invalid_signature() {
        let author = [1u8; 32];
        let attester = [2u8; 32];
        let attestation = SpamAttestation {
            content_hash: [0u8; 32],
            attester,
            reason: super::super::types::SpamReason::Advertising,
            timestamp: 1735689600,
            pow_nonce: 0,
            signature: [0u8; 64],
        };

        // Signature verification fails
        let result = validate_attestation(&attestation, 1735689600, &author, |_, _, _| false);
        assert!(matches!(
            result,
            Err(SpamAttestationError::InvalidSignature)
        ));
    }
}
