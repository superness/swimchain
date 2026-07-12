//! Reputation score calculation per SPEC_12 Section 4.5
//!
//! Implements the comprehensive reputation score formula that balances:
//! - Age bonus (longevity indicates good behavior)
//! - Quality attestations (positive signals)
//! - Spam penalties (negative signals)
//! - Recovery over time (path back from bad behavior)
//! - Fast recovery for counter-attested flags

use super::types::PosterReputation;

// === SPEC_12 Section 14: Reputation Constants ===

/// Base reputation score for new identities
pub const REPUTATION_BASE_SCORE: i32 = 100;

/// Recovery points per day since last spam flag
pub const REPUTATION_RECOVERY_PER_DAY: i32 = 1;

/// Maximum recovery bonus in days
pub const REPUTATION_RECOVERY_MAX_DAYS: i32 = 90;

/// Fast recovery points per counter-attested flag
pub const REPUTATION_FAST_RECOVERY_PER_COUNTER: i32 = 10;

/// Threshold for Trusted status (slower decay)
pub const REPUTATION_TRUSTED_THRESHOLD: i32 = 200;

/// Threshold for Normal status
pub const REPUTATION_NORMAL_THRESHOLD: i32 = 100;

/// Threshold for Watched status
pub const REPUTATION_WATCHED_THRESHOLD: i32 = 50;

/// Threshold for Restricted status
pub const REPUTATION_RESTRICTED_THRESHOLD: i32 = 0;

/// Minimum score (floor)
pub const REPUTATION_MIN_SCORE: i32 = -1000;

// === Score Component Weights ===

/// Age bonus: +1 per day, capped at 365 days
const AGE_BONUS_CAP: u32 = 365;

/// Quality attestation bonus per attestation
const QUALITY_BONUS_PER_ATTESTATION: i32 = 5;

/// Counter-attestation success bonus (when you help others)
const COUNTER_SUCCESS_BONUS: i32 = 3;

/// Bonus when your spam flags are countered (vindication)
const COUNTER_BONUS_PER_FLAG: i32 = 15;

/// Penalty per spam flag received
const SPAM_PENALTY_PER_FLAG: i32 = 20;

/// Penalty when your attestations are countered (bad-faith attestation)
const ATTESTER_PENALTY_PER_COUNTER: i32 = 30;

/// Devastating penalty per illegal content flag
const ILLEGAL_PENALTY_PER_FLAG: i32 = 1000;

/// Calculate reputation score per SPEC_12 Section 4.5.
///
/// # Formula
///
/// ```text
/// score = base + age_bonus + quality_bonus + counter_success_bonus + counter_bonus
///         + recovery_bonus + fast_recovery
///         - spam_penalty - attester_penalty - illegal_penalty
/// ```
///
/// # Components
///
/// - **base**: 100 points (every identity starts here)
/// - **age_bonus**: +1 per day of identity age, max 365
/// - **quality_bonus**: +5 per quality attestation received
/// - **counter_success_bonus**: +3 per successful counter-attestation made
/// - **counter_bonus**: +15 per spam flag that was counter-attested
/// - **recovery_bonus**: +1 per day since last spam flag, max 90
/// - **fast_recovery**: +10 per counter-attested flag (immediate recovery)
/// - **spam_penalty**: -20 per spam flag received
/// - **attester_penalty**: -30 per time own attestations were countered
/// - **illegal_penalty**: -1000 per illegal content flag
///
/// # Arguments
///
/// * `rep` - The poster reputation record
/// * `days_since_last_flag` - Days since the last spam flag (for recovery bonus)
///
/// # Returns
///
/// The calculated reputation score, clamped to [MIN_SCORE, unlimited].
pub fn calculate_reputation_score(rep: &PosterReputation, days_since_last_flag: u32) -> i32 {
    // Base score
    let base: i32 = REPUTATION_BASE_SCORE;

    // Age bonus: +1 per day, max 365
    let age_bonus = std::cmp::min(rep.identity_age_days, AGE_BONUS_CAP) as i32;

    // Quality bonus: +5 per quality attestation
    let quality_bonus = (rep.quality_attestations as i32) * QUALITY_BONUS_PER_ATTESTATION;

    // Counter success bonus: +3 per successful counter-attestation made
    let counter_success_bonus = (rep.counter_attestation_successes as i32) * COUNTER_SUCCESS_BONUS;

    // Counter bonus: +15 per spam flag that was counter-attested
    let counter_bonus = (rep.spam_flags_countered as i32) * COUNTER_BONUS_PER_FLAG;

    // Spam penalty: -20 per spam flag received
    let spam_penalty = (rep.spam_flags_received as i32) * SPAM_PENALTY_PER_FLAG;

    // Attester penalty: -30 per time own attestations were countered
    let attester_penalty = (rep.attester_countered_count as i32) * ATTESTER_PENALTY_PER_COUNTER;

    // Illegal content penalty: -1000 per flag (devastating)
    let illegal_penalty = (rep.illegal_content_flags as i32) * ILLEGAL_PENALTY_PER_FLAG;

    // Recovery bonus: +1 per day since last spam flag, max 90
    let recovery_bonus = std::cmp::min(days_since_last_flag as i32, REPUTATION_RECOVERY_MAX_DAYS);

    // Fast recovery: +10 per counter-attested flag
    let fast_recovery = (rep.spam_flags_countered as i32) * REPUTATION_FAST_RECOVERY_PER_COUNTER;

    // Calculate total (using saturating arithmetic to prevent overflow)
    let score = base
        .saturating_add(age_bonus)
        .saturating_add(quality_bonus)
        .saturating_add(counter_success_bonus)
        .saturating_add(counter_bonus)
        .saturating_add(recovery_bonus)
        .saturating_add(fast_recovery)
        .saturating_sub(spam_penalty)
        .saturating_sub(attester_penalty)
        .saturating_sub(illegal_penalty);

    // Clamp to minimum score
    std::cmp::max(score, REPUTATION_MIN_SCORE)
}

/// Reputation effect based on score thresholds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ReputationEffect {
    /// Score > 200: Content decays 1.5x slower
    Trusted,
    /// Score 100-200: Standard treatment
    Normal,
    /// Score 50-100: Rate limits reduced 50%
    Watched,
    /// Score 0-50: Rate limits reduced 80%, new space posting blocked
    Restricted,
    /// Score < 0: All content starts with accelerated decay
    Untrusted,
}

impl ReputationEffect {
    /// Get the effect name for display.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Trusted => "Trusted",
            Self::Normal => "Normal",
            Self::Watched => "Watched",
            Self::Restricted => "Restricted",
            Self::Untrusted => "Untrusted",
        }
    }

    /// Get a badge emoji for display.
    pub fn badge(&self) -> &'static str {
        match self {
            Self::Trusted => "🛡️",
            Self::Normal => "✓",
            Self::Watched => "⚠️",
            Self::Restricted => "🚫",
            Self::Untrusted => "⛔",
        }
    }

    /// Get the decay multiplier for this effect.
    ///
    /// Values > 1.0 mean slower decay (content lives longer).
    /// Values < 1.0 mean faster decay (content dies faster).
    pub fn decay_multiplier(&self) -> f64 {
        match self {
            Self::Trusted => 1.5,
            Self::Normal => 1.0,
            Self::Watched => 1.0,
            Self::Restricted => 1.0,
            Self::Untrusted => 0.25, // 4x faster decay
        }
    }

    /// Get the rate limit multiplier for this effect.
    ///
    /// Values < 1.0 mean reduced rate limits.
    pub fn rate_limit_multiplier(&self) -> f64 {
        match self {
            Self::Trusted => 1.0,
            Self::Normal => 1.0,
            Self::Watched => 0.5,    // 50% of normal limits
            Self::Restricted => 0.2, // 20% of normal limits
            Self::Untrusted => 0.1,  // 10% of normal limits
        }
    }

    /// Check if new space posting is blocked.
    pub fn blocks_new_space_posting(&self) -> bool {
        matches!(self, Self::Restricted | Self::Untrusted)
    }

    /// Check if content starts with accelerated decay.
    pub fn starts_accelerated_decay(&self) -> bool {
        matches!(self, Self::Untrusted)
    }
}

/// Get the reputation effect for a given score.
pub fn get_reputation_effect(score: i32) -> ReputationEffect {
    if score > REPUTATION_TRUSTED_THRESHOLD {
        ReputationEffect::Trusted
    } else if score > REPUTATION_NORMAL_THRESHOLD {
        ReputationEffect::Normal
    } else if score > REPUTATION_WATCHED_THRESHOLD {
        ReputationEffect::Watched
    } else if score > REPUTATION_RESTRICTED_THRESHOLD {
        ReputationEffect::Restricted
    } else {
        ReputationEffect::Untrusted
    }
}

/// Calculate the effective rate limit based on reputation.
///
/// # Arguments
///
/// * `base_limit` - The base rate limit (e.g., 50 posts/day)
/// * `score` - The reputation score
///
/// # Returns
///
/// The adjusted rate limit (may be lower than base).
pub fn calculate_rate_limit(base_limit: u32, score: i32) -> u32 {
    let effect = get_reputation_effect(score);
    let multiplier = effect.rate_limit_multiplier();
    ((base_limit as f64) * multiplier).round() as u32
}

/// Calculate the effective decay multiplier based on reputation.
///
/// # Arguments
///
/// * `score` - The reputation score
///
/// # Returns
///
/// The decay multiplier (> 1.0 means slower decay, < 1.0 means faster).
pub fn calculate_decay_multiplier(score: i32) -> f64 {
    let effect = get_reputation_effect(score);
    effect.decay_multiplier()
}

// === Attester Weighting (SPEC_12 §4 — attestation weighting, defensive) ===

/// Reputation score at (or above) which an attester's spam attestation carries the
/// full, DEFAULT weight of 1.0. Set to the Trusted threshold: an attester earns full
/// weight once it has established standing (age and/or good behavior), while a fresh
/// identity (base score 100) is intentionally below it.
pub const ATTESTER_FULL_WEIGHT_SCORE: i32 = REPUTATION_TRUSTED_THRESHOLD;

/// Weight an attester's spam attestation should carry, as a function of its reputation
/// score. Used to make attestations from fresh / low-reputation identities count for
/// LESS in the aggregate, blunting attestation-bombing by throwaway or bad-faith
/// accounts (SPEC_12 §4).
///
/// # Invariant (hard constraint)
///
/// The result is ALWAYS in `[0.0, 1.0]`. High reputation can only ever *restore* the
/// default weight of 1.0 — it can never exceed it, so good standing grants no
/// attestation power beyond a well-behaved baseline. This is the attestation-side
/// analogue of "no protocol privileges for good standing".
///
/// # Curve
///
/// ```text
/// score <= 0                          -> 0.0   (Untrusted: attestations don't count)
/// 0 < score < FULL_WEIGHT (200)       -> score / 200   (fresh 100 -> 0.5)
/// score >= FULL_WEIGHT (200)          -> 1.0   (default, capped — never higher)
/// ```
pub fn attester_weight(score: i32) -> f64 {
    if score <= 0 {
        return 0.0;
    }
    let w = score as f64 / ATTESTER_FULL_WEIGHT_SCORE as f64;
    w.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_reputation() -> PosterReputation {
        PosterReputation::new([1u8; 32])
    }

    #[test]
    fn test_base_score() {
        let rep = create_test_reputation();
        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 100); // Just base
    }

    #[test]
    fn test_age_bonus() {
        let mut rep = create_test_reputation();
        rep.identity_age_days = 100;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 200); // 100 base + 100 age

        // Age capped at 365
        rep.identity_age_days = 500;
        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 465); // 100 base + 365 age (capped)
    }

    #[test]
    fn test_quality_bonus() {
        let mut rep = create_test_reputation();
        rep.quality_attestations = 10;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 150); // 100 base + 50 quality (10 * 5)
    }

    #[test]
    fn test_counter_success_bonus() {
        let mut rep = create_test_reputation();
        rep.counter_attestation_successes = 5;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 115); // 100 base + 15 counter_success (5 * 3)
    }

    #[test]
    fn test_counter_bonus() {
        let mut rep = create_test_reputation();
        rep.spam_flags_countered = 2;

        let score = calculate_reputation_score(&rep, 0);
        // 100 base + 30 counter_bonus (2 * 15) + 20 fast_recovery (2 * 10) = 150
        assert_eq!(score, 150);
    }

    #[test]
    fn test_spam_penalty() {
        let mut rep = create_test_reputation();
        rep.spam_flags_received = 3;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 40); // 100 base - 60 spam (3 * 20)
    }

    #[test]
    fn test_attester_penalty() {
        let mut rep = create_test_reputation();
        rep.attester_countered_count = 2;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 40); // 100 base - 60 attester (2 * 30)
    }

    #[test]
    fn test_illegal_penalty() {
        let mut rep = create_test_reputation();
        rep.illegal_content_flags = 1;

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, -900); // 100 base - 1000 illegal
    }

    #[test]
    fn test_recovery_bonus() {
        let mut rep = create_test_reputation();
        rep.spam_flags_received = 1; // -20

        // With 30 days recovery
        let score = calculate_reputation_score(&rep, 30);
        assert_eq!(score, 110); // 100 - 20 + 30 recovery

        // Recovery capped at 90
        let score = calculate_reputation_score(&rep, 120);
        assert_eq!(score, 170); // 100 - 20 + 90 recovery (capped)
    }

    #[test]
    fn test_fast_recovery() {
        let mut rep = create_test_reputation();
        rep.spam_flags_received = 2; // -40
        rep.spam_flags_countered = 1; // +15 counter + 10 fast = +25

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, 85); // 100 - 40 + 25
    }

    #[test]
    fn test_combined_scenario() {
        let mut rep = create_test_reputation();
        rep.identity_age_days = 100;        // +100
        rep.quality_attestations = 5;       // +25
        rep.counter_attestation_successes = 2; // +6
        rep.spam_flags_received = 2;        // -40
        rep.spam_flags_countered = 1;       // +15 + 10 = +25

        let score = calculate_reputation_score(&rep, 30);
        // 100 + 100 + 25 + 6 + 25 + 30 - 40 = 246
        assert_eq!(score, 246);
    }

    #[test]
    fn test_min_score_clamp() {
        let mut rep = create_test_reputation();
        rep.illegal_content_flags = 5; // -5000

        let score = calculate_reputation_score(&rep, 0);
        assert_eq!(score, -1000); // Clamped to minimum
    }

    #[test]
    fn test_reputation_effect_thresholds() {
        assert_eq!(get_reputation_effect(250), ReputationEffect::Trusted);
        assert_eq!(get_reputation_effect(201), ReputationEffect::Trusted);
        assert_eq!(get_reputation_effect(200), ReputationEffect::Normal);
        assert_eq!(get_reputation_effect(150), ReputationEffect::Normal);
        assert_eq!(get_reputation_effect(100), ReputationEffect::Watched);
        assert_eq!(get_reputation_effect(75), ReputationEffect::Watched);
        assert_eq!(get_reputation_effect(50), ReputationEffect::Restricted);
        assert_eq!(get_reputation_effect(25), ReputationEffect::Restricted);
        assert_eq!(get_reputation_effect(0), ReputationEffect::Untrusted);
        assert_eq!(get_reputation_effect(-100), ReputationEffect::Untrusted);
    }

    #[test]
    fn test_decay_multiplier() {
        assert_eq!(ReputationEffect::Trusted.decay_multiplier(), 1.5);
        assert_eq!(ReputationEffect::Normal.decay_multiplier(), 1.0);
        assert_eq!(ReputationEffect::Untrusted.decay_multiplier(), 0.25);
    }

    #[test]
    fn test_rate_limit_multiplier() {
        assert_eq!(ReputationEffect::Trusted.rate_limit_multiplier(), 1.0);
        assert_eq!(ReputationEffect::Watched.rate_limit_multiplier(), 0.5);
        assert_eq!(ReputationEffect::Restricted.rate_limit_multiplier(), 0.2);
        assert_eq!(ReputationEffect::Untrusted.rate_limit_multiplier(), 0.1);
    }

    #[test]
    fn test_calculate_rate_limit() {
        // Base limit 50
        assert_eq!(calculate_rate_limit(50, 250), 50);  // Trusted: 100%
        assert_eq!(calculate_rate_limit(50, 75), 25);   // Watched: 50%
        assert_eq!(calculate_rate_limit(50, 25), 10);   // Restricted: 20%
        assert_eq!(calculate_rate_limit(50, -10), 5);   // Untrusted: 10%
    }

    #[test]
    fn test_blocks_new_space_posting() {
        assert!(!ReputationEffect::Trusted.blocks_new_space_posting());
        assert!(!ReputationEffect::Normal.blocks_new_space_posting());
        assert!(!ReputationEffect::Watched.blocks_new_space_posting());
        assert!(ReputationEffect::Restricted.blocks_new_space_posting());
        assert!(ReputationEffect::Untrusted.blocks_new_space_posting());
    }

    #[test]
    fn test_starts_accelerated_decay() {
        assert!(!ReputationEffect::Trusted.starts_accelerated_decay());
        assert!(!ReputationEffect::Restricted.starts_accelerated_decay());
        assert!(ReputationEffect::Untrusted.starts_accelerated_decay());
    }

    #[test]
    fn test_attester_weight_curve() {
        // Untrusted / non-positive scores contribute nothing.
        assert_eq!(attester_weight(0), 0.0);
        assert_eq!(attester_weight(-50), 0.0);

        // Fresh identity (base score 100) is intentionally below the default weight.
        assert_eq!(attester_weight(100), 0.5);
        assert_eq!(attester_weight(50), 0.25);

        // Full weight is reached at the Trusted threshold (200) and is the maximum.
        assert_eq!(attester_weight(ATTESTER_FULL_WEIGHT_SCORE), 1.0);
    }

    /// Hard constraint: attester weight NEVER exceeds the default of 1.0, no matter
    /// how high the reputation. Good standing only restores the default weight; it
    /// grants no attestation power beyond a well-behaved baseline.
    #[test]
    fn test_attester_weight_high_reputation_never_exceeds_default() {
        for score in [200, 250, 465, 1000, i32::MAX] {
            assert!(
                attester_weight(score) <= 1.0,
                "weight for score {score} exceeded the default 1.0"
            );
            assert_eq!(attester_weight(score), 1.0);
        }
    }

    /// The weight curve is monotonic non-decreasing in score, so a strictly
    /// higher-reputation attester never counts for LESS than a lower one.
    #[test]
    fn test_attester_weight_monotonic() {
        let mut prev = attester_weight(-100);
        for score in (-100..=400).step_by(10) {
            let w = attester_weight(score);
            assert!(w >= prev, "weight decreased at score {score}");
            assert!((0.0..=1.0).contains(&w));
            prev = w;
        }
    }

    #[test]
    fn test_effect_badges() {
        assert_eq!(ReputationEffect::Trusted.badge(), "🛡️");
        assert_eq!(ReputationEffect::Normal.badge(), "✓");
        assert_eq!(ReputationEffect::Watched.badge(), "⚠️");
        assert_eq!(ReputationEffect::Restricted.badge(), "🚫");
        assert_eq!(ReputationEffect::Untrusted.badge(), "⛔");
    }

    #[test]
    fn test_spec_test_vector() {
        // Test vector from SPEC_12 §11.3
        let mut rep = create_test_reputation();
        rep.identity_age_days = 100;
        rep.spam_flags_received = 2;
        rep.spam_flags_countered = 1;
        rep.illegal_content_flags = 0;
        rep.quality_attestations = 5;
        rep.attester_countered_count = 0;
        rep.counter_attestation_successes = 2;

        let score = calculate_reputation_score(&rep, 30);

        // Expected from spec:
        // base = 100
        // age_bonus = 100 (min(100, 365))
        // quality_bonus = 25 (5 * 5)
        // counter_success_bonus = 6 (2 * 3)
        // counter_bonus = 15 (1 * 15)
        // fast_recovery = 10 (1 * 10)
        // recovery_bonus = 30 (min(30, 90))
        // spam_penalty = 40 (2 * 20)
        // score = 100 + 100 + 25 + 6 + 15 + 10 + 30 - 40 = 246

        assert_eq!(score, 246);
        assert_eq!(get_reputation_effect(score), ReputationEffect::Trusted);
    }
}
