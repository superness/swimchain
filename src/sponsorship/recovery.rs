//! Penalty recovery mechanism
//!
//! Implements SPEC_11 Section 4.5: Recovery from penalties through positive contribution.
//!
//! Identities can reduce their penalty duration by contributing during the penalty period:
//! - 2× expected contribution: 50% reduction
//! - 1.5× expected contribution: 25% reduction
//! - Requires at least MIN_PENALTY_RECOVERY_ATTESTATION_COUNT (3) attestations

use crate::sponsorship::penalty::{PenaltyRecord, MIN_PENALTY_RECOVERY_ATTESTATION_COUNT};

/// Threshold for 50% reduction (2× expected contribution)
const CONTRIBUTION_THRESHOLD_50_PERCENT: f64 = 2.0;

/// Threshold for 25% reduction (1.5× expected contribution)
const CONTRIBUTION_THRESHOLD_25_PERCENT: f64 = 1.5;

/// Reduction factor for 2× contribution
const REDUCTION_FACTOR_2X: f32 = 0.5;

/// Reduction factor for 1.5× contribution
const REDUCTION_FACTOR_1_5X: f32 = 0.25;

/// Result of calculating recovery for a penalty
#[derive(Debug, Clone, PartialEq)]
pub struct RecoveryResult {
    /// New expiration timestamp (may be same as original if no reduction)
    pub new_expires_at: u64,
    /// Whether the penalty has fully expired (time-based)
    pub fully_recovered: bool,
    /// Reduction factor applied (0.0, 0.25, or 0.5)
    pub reduction_factor: f32,
    /// Whether recovery was accelerated by contribution
    pub accelerated: bool,
}

impl RecoveryResult {
    /// Create a result indicating no recovery is possible
    fn no_recovery(penalty: &PenaltyRecord) -> Self {
        Self {
            new_expires_at: penalty.current_expires_at,
            fully_recovered: false,
            reduction_factor: 0.0,
            accelerated: false,
        }
    }

    /// Create a result indicating full time-based recovery
    fn full_recovery(penalty: &PenaltyRecord) -> Self {
        Self {
            new_expires_at: penalty.current_expires_at,
            fully_recovered: true,
            reduction_factor: 0.0,
            accelerated: false,
        }
    }
}

/// Calculate potential recovery for a penalty per SPEC_11 Section 4.5
///
/// # Algorithm
/// 1. Permanent revocation: No recovery possible
/// 2. Time-based: If current_time >= base_expires_at, fully recovered
/// 3. Check attestation count >= MIN_PENALTY_RECOVERY_ATTESTATION_COUNT (3)
/// 4. If insufficient attestations: No acceleration
/// 5. Calculate contribution_ratio = contribution / (expected_rate × elapsed_time)
/// 6. Reduction: ≥2.0× = 50%, ≥1.5× = 25%, else 0%
/// 7. new_duration = base_duration × (1.0 - reduction_factor)
/// 8. new_expires_at = started_at + new_duration
///
/// # Arguments
/// * `penalty` - The penalty to potentially recover from
/// * `contribution_during_penalty` - Bandwidth served since penalty started (bytes)
/// * `expected_contribution_rate` - Normal contribution rate (bytes per second)
/// * `attestation_count` - Number of attestations for contribution during penalty
/// * `current_time` - Current Unix timestamp
///
/// # Returns
/// `RecoveryResult` with new expiration time and recovery details
pub fn calculate_recovery(
    penalty: &PenaltyRecord,
    contribution_during_penalty: u64,
    expected_contribution_rate: u64,
    attestation_count: u8,
    current_time: u64,
) -> RecoveryResult {
    // Step 1: Permanent revocation → no recovery
    if penalty.is_permanent() {
        return RecoveryResult::no_recovery(penalty);
    }

    // Step 2: Time-based recovery check
    if current_time >= penalty.base_expires_at {
        return RecoveryResult::full_recovery(penalty);
    }

    // Step 3 & 4: Check attestation count
    if attestation_count < MIN_PENALTY_RECOVERY_ATTESTATION_COUNT {
        return RecoveryResult::no_recovery(penalty);
    }

    // Step 5: Calculate contribution ratio
    let elapsed_time = current_time.saturating_sub(penalty.started_at);
    if elapsed_time == 0 || expected_contribution_rate == 0 {
        return RecoveryResult::no_recovery(penalty);
    }

    let expected_contribution = expected_contribution_rate.saturating_mul(elapsed_time);
    if expected_contribution == 0 {
        return RecoveryResult::no_recovery(penalty);
    }

    let contribution_ratio = contribution_during_penalty as f64 / expected_contribution as f64;

    // Step 6: Determine reduction factor
    let reduction_factor = if contribution_ratio >= CONTRIBUTION_THRESHOLD_50_PERCENT {
        REDUCTION_FACTOR_2X
    } else if contribution_ratio >= CONTRIBUTION_THRESHOLD_25_PERCENT {
        REDUCTION_FACTOR_1_5X
    } else {
        0.0
    };

    if reduction_factor < f32::EPSILON {
        return RecoveryResult::no_recovery(penalty);
    }

    // Step 7: Calculate new duration
    let base_duration = penalty.base_expires_at.saturating_sub(penalty.started_at);

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let new_duration = (base_duration as f64 * (1.0 - reduction_factor as f64)) as u64;

    // Step 8: Calculate new expires_at
    let new_expires_at = penalty.started_at.saturating_add(new_duration);

    // Ensure we don't exceed base (shouldn't happen but safety check)
    let final_expires_at = new_expires_at.min(penalty.base_expires_at);

    RecoveryResult {
        new_expires_at: final_expires_at,
        fully_recovered: current_time >= final_expires_at,
        reduction_factor,
        accelerated: true,
    }
}

/// Check if an identity qualifies for recovery based on current conditions
///
/// This is a simplified check that doesn't compute the actual new expiration.
pub fn qualifies_for_recovery(
    penalty: &PenaltyRecord,
    contribution_ratio: f64,
    attestation_count: u8,
) -> bool {
    // Permanent penalties never qualify
    if penalty.is_permanent() {
        return false;
    }

    // Need sufficient attestations
    if attestation_count < MIN_PENALTY_RECOVERY_ATTESTATION_COUNT {
        return false;
    }

    // Need at least 1.5× contribution
    contribution_ratio >= CONTRIBUTION_THRESHOLD_25_PERCENT
}

/// Calculate the contribution ratio needed for a specific reduction level
///
/// Returns the minimum contribution ratio required for the given reduction.
pub fn contribution_ratio_for_reduction(reduction: f32) -> Option<f64> {
    if reduction >= REDUCTION_FACTOR_2X {
        Some(CONTRIBUTION_THRESHOLD_50_PERCENT)
    } else if reduction >= REDUCTION_FACTOR_1_5X {
        Some(CONTRIBUTION_THRESHOLD_25_PERCENT)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sponsorship::penalty::{
        MisbehaviorSeverity, PenaltyRecord, ABUSE_PENALTY_SECONDS, SPAM_PENALTY_SECONDS,
    };
    use crate::types::identity::PublicKey;

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    #[test]
    fn test_permanent_revocation_no_recovery() {
        let time = 1735689600;
        let penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);

        let result = calculate_recovery(
            &penalty,
            1_000_000, // High contribution
            100,       // Expected rate
            5,         // Enough attestations
            time + 1000,
        );

        assert!(!result.fully_recovered);
        assert!(!result.accelerated);
        assert_eq!(result.new_expires_at, penalty.current_expires_at);
    }

    #[test]
    fn test_time_based_full_recovery() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        // Check after penalty expires
        let result = calculate_recovery(
            &penalty,
            0, // No contribution
            100,
            0, // No attestations
            time + SPAM_PENALTY_SECONDS + 1,
        );

        assert!(result.fully_recovered);
        assert!(!result.accelerated);
    }

    #[test]
    fn test_insufficient_attestations_no_acceleration() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        // 1.5× contribution but only 2 attestations (need 3)
        let elapsed = 1000;
        let expected_rate = 100;
        let contribution = (expected_rate * elapsed * 15) / 10; // 1.5×

        let result = calculate_recovery(
            &penalty,
            contribution,
            expected_rate,
            2, // Only 2 attestations
            time + elapsed,
        );

        assert!(!result.accelerated);
        assert_eq!(result.reduction_factor, 0.0);
        assert_eq!(result.new_expires_at, penalty.current_expires_at);
    }

    #[test]
    fn test_contribution_2x_gives_50_percent_reduction() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        let elapsed = 1000;
        let expected_rate = 100;
        let contribution = expected_rate * elapsed * 2; // 2×

        let result = calculate_recovery(
            &penalty,
            contribution,
            expected_rate,
            3, // Enough attestations
            time + elapsed,
        );

        assert!(result.accelerated);
        assert!((result.reduction_factor - 0.5).abs() < f32::EPSILON);

        // New duration should be 50% of base
        let expected_new_expires = time + (ABUSE_PENALTY_SECONDS / 2);
        assert_eq!(result.new_expires_at, expected_new_expires);
    }

    #[test]
    fn test_contribution_1_5x_gives_25_percent_reduction() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        let elapsed = 1000;
        let expected_rate = 100;
        // 1.5× contribution
        let contribution = (expected_rate * elapsed * 15) / 10;

        let result = calculate_recovery(&penalty, contribution, expected_rate, 3, time + elapsed);

        assert!(result.accelerated);
        assert!((result.reduction_factor - 0.25).abs() < f32::EPSILON);

        // New duration should be 75% of base
        let expected_new_expires = time + (ABUSE_PENALTY_SECONDS * 3 / 4);
        assert_eq!(result.new_expires_at, expected_new_expires);
    }

    #[test]
    fn test_contribution_below_threshold_no_reduction() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        let elapsed = 1000;
        let expected_rate = 100;
        let contribution = expected_rate * elapsed; // 1.0× (below 1.5× threshold)

        let result = calculate_recovery(&penalty, contribution, expected_rate, 3, time + elapsed);

        assert!(!result.accelerated);
        assert_eq!(result.reduction_factor, 0.0);
    }

    #[test]
    fn test_zero_expected_rate_no_recovery() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        let result = calculate_recovery(
            &penalty,
            1000,
            0, // Zero expected rate
            3,
            time + 1000,
        );

        assert!(!result.accelerated);
        assert_eq!(result.reduction_factor, 0.0);
    }

    #[test]
    fn test_zero_elapsed_time_no_recovery() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        let result = calculate_recovery(
            &penalty, 1000, 100, 3, time, // No elapsed time
        );

        assert!(!result.accelerated);
        assert_eq!(result.reduction_factor, 0.0);
    }

    #[test]
    fn test_qualifies_for_recovery() {
        let time = 1735689600;

        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        // Qualifies: 2× contribution, 3 attestations
        assert!(qualifies_for_recovery(&penalty, 2.0, 3));

        // Qualifies: 1.5× contribution, 4 attestations
        assert!(qualifies_for_recovery(&penalty, 1.5, 4));

        // Doesn't qualify: 1× contribution
        assert!(!qualifies_for_recovery(&penalty, 1.0, 3));

        // Doesn't qualify: 2 attestations
        assert!(!qualifies_for_recovery(&penalty, 2.0, 2));
    }

    #[test]
    fn test_qualifies_for_recovery_permanent() {
        let time = 1735689600;

        let penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);

        // Permanent never qualifies
        assert!(!qualifies_for_recovery(&penalty, 10.0, 10));
    }

    #[test]
    fn test_contribution_ratio_for_reduction() {
        // 50% reduction needs 2×
        assert_eq!(contribution_ratio_for_reduction(0.5), Some(2.0));

        // 25% reduction needs 1.5×
        assert_eq!(contribution_ratio_for_reduction(0.25), Some(1.5));

        // No reduction
        assert!(contribution_ratio_for_reduction(0.0).is_none());

        // Values between thresholds
        assert_eq!(contribution_ratio_for_reduction(0.30), Some(1.5));
        assert_eq!(contribution_ratio_for_reduction(0.6), Some(2.0));
    }

    #[test]
    fn test_recovery_result_fields() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        // Test no recovery result
        let no_recovery = RecoveryResult::no_recovery(&penalty);
        assert_eq!(no_recovery.new_expires_at, penalty.current_expires_at);
        assert!(!no_recovery.fully_recovered);
        assert!(!no_recovery.accelerated);
        assert_eq!(no_recovery.reduction_factor, 0.0);

        // Test full recovery result
        let full_recovery = RecoveryResult::full_recovery(&penalty);
        assert!(full_recovery.fully_recovered);
        assert!(!full_recovery.accelerated);
    }

    #[test]
    fn test_recovery_calculation_math() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(
            test_pubkey(1),
            MisbehaviorSeverity::Abuse, // 30 days
            time,
        );

        // Verify exact math for 50% reduction
        let elapsed = 86400; // 1 day
        let expected_rate = 1000;
        let contribution = expected_rate * elapsed * 2; // 2×

        let result = calculate_recovery(&penalty, contribution, expected_rate, 3, time + elapsed);

        // 30 days * 0.5 = 15 days
        let expected_duration = ABUSE_PENALTY_SECONDS / 2;
        let expected_expires = time + expected_duration;

        assert_eq!(result.new_expires_at, expected_expires);
    }
}
