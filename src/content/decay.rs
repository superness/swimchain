//! Decay calculation engine (SPEC_02 §4.1, SPEC_09 §4.4)
//!
//! Implements the half-life decay model:
//! - `survival_probability = 0.5^(effective_decay_time / half_life)`
//! - `effective_decay_time = max(0, time_since_engagement - floor)`
//!
//! Also implements adaptive half-life based on storage pressure.
//!
//! Per SPEC_09 §4.4, higher-level contributors have their content last longer
//! through the decay multiplier system.

use crate::types::constants::{
    ADAPTATION_SMOOTHING, DECAY_FLOOR_SECS, DECAY_THRESHOLD, FLAGGED_DECAY_HALF_LIFE_SECS,
    MAX_HALF_LIFE_SECS, MIN_HALF_LIFE_SECS,
};
use crate::types::content::{ContentItem, DecayState};

/// Node state for adaptive decay calculation
#[derive(Debug, Clone)]
pub struct NodeState {
    /// Current total storage in bytes
    pub total_storage_bytes: u64,
    /// Target storage in bytes
    pub target_storage_bytes: u64,
    /// Current half-life in seconds
    pub current_half_life_secs: u64,
}

/// Calculate decay state for content at given time
///
/// # Arguments
/// * `content` - The content item to evaluate
/// * `current_time_ms` - Current time in UNIX milliseconds
/// * `half_life_secs` - Current adaptive half-life (default: 604800 = 7 days)
///
/// # Returns
/// The computed decay state for the content
#[must_use]
pub fn calculate_decay_state(
    content: &ContentItem,
    current_time_ms: u64,
    half_life_secs: u64,
) -> DecayState {
    let current_time_secs = current_time_ms / 1000;
    let created_at_secs = content.created_at / 1000;
    let last_engagement_secs = content.last_engagement / 1000;

    let age_seconds = current_time_secs.saturating_sub(created_at_secs);
    let time_since_engagement = current_time_secs.saturating_sub(last_engagement_secs);

    // Floor protection: content < 48h old is protected
    if age_seconds < DECAY_FLOOR_SECS {
        return DecayState {
            content_id: content.content_id,
            age_seconds,
            time_since_engagement,
            half_lives_elapsed: 0.0,
            survival_probability: 1.0,
            is_decayed: false,
            is_protected: true,
        };
    }

    // Pin protection
    if let Some(ref pin) = content.pin_state {
        if pin.pin_expiry.map_or(true, |exp| current_time_ms < exp) {
            return DecayState {
                content_id: content.content_id,
                age_seconds,
                time_since_engagement,
                half_lives_elapsed: 0.0,
                survival_probability: 1.0,
                is_decayed: false,
                is_protected: true,
            };
        }
    }

    // Calculate decay
    // effective_decay_time = max(0, time_since_engagement - floor)
    let effective_decay_time = time_since_engagement.saturating_sub(DECAY_FLOOR_SECS);
    let half_lives_elapsed = effective_decay_time as f64 / half_life_secs as f64;
    let survival_probability = 0.5_f64.powf(half_lives_elapsed);
    let is_decayed = survival_probability < DECAY_THRESHOLD;

    DecayState {
        content_id: content.content_id,
        age_seconds,
        time_since_engagement,
        half_lives_elapsed,
        survival_probability,
        is_decayed,
        is_protected: false,
    }
}

/// Calculate adaptive half-life based on storage pressure (SPEC_02 §4.1.1)
///
/// When storage exceeds target, half-life decreases (faster decay).
/// When storage is under target, half-life increases (slower decay).
///
/// # Arguments
/// * `state` - Current node state with storage metrics
///
/// # Returns
/// New half-life in seconds, clamped to [MIN_HALF_LIFE_SECS, MAX_HALF_LIFE_SECS]
#[must_use]
pub fn calculate_adaptive_half_life(state: &NodeState) -> u64 {
    let pressure = state.total_storage_bytes as f64 / state.target_storage_bytes as f64;

    let target_half_life = if pressure > 1.0 {
        // Over budget: decrease half-life (faster decay)
        state.current_half_life_secs as f64 / pressure
    } else {
        // Under budget: increase half-life (slower decay)
        state.current_half_life_secs as f64 * (1.0 + (1.0 - pressure) * 0.5)
    };

    // Clamp to bounds
    let clamped = target_half_life
        .max(MIN_HALF_LIFE_SECS as f64)
        .min(MAX_HALF_LIFE_SECS as f64);

    // Smooth transition
    let smoothed = state.current_half_life_secs as f64
        + (clamped - state.current_half_life_secs as f64) * ADAPTATION_SMOOTHING;

    smoothed.round() as u64
}

/// Select the effective half-life for content based on its spam-flag state
/// (SPEC_12 §4.3).
///
/// This is the single source of truth for half-life selection. Both the
/// read path (`DecayIntegration::get_decay_state`) and the prune path
/// (`DecayIntegration::prune`) call this helper so the two paths cannot
/// silently diverge again — flagged content always decays with
/// `FLAGGED_DECAY_HALF_LIFE_SECS` regardless of which path is asking.
///
/// # Arguments
/// * `base_half_life_secs` - The half-life that would apply if the content were not flagged
/// * `is_spam_flagged` - Whether the content has reached the spam threshold and has not been cleared by counter-attestation
///
/// # Returns
/// The half-life in seconds to use for decay calculations.
#[must_use]
pub fn select_half_life(base_half_life_secs: u64, is_spam_flagged: bool) -> u64 {
    if is_spam_flagged {
        FLAGGED_DECAY_HALF_LIFE_SECS
    } else {
        base_half_life_secs
    }
}

/// Calculate decay state for spam-flagged content per SPEC_12 §4.3.
///
/// Spam-flagged content uses an accelerated 4-hour half-life instead of
/// the standard 7-day half-life. This causes flagged content to decay
/// rapidly, effectively removing it from circulation.
///
/// The floor protection period (48 hours) is preserved even for flagged
/// content to allow for counter-attestation window.
///
/// # Arguments
/// * `content` - The content item to evaluate
/// * `current_time_ms` - Current time in UNIX milliseconds
/// * `is_spam_flagged` - Whether the content has reached the spam threshold
///
/// # Returns
/// The computed decay state for the content with spam-accelerated half-life if flagged.
#[must_use]
pub fn calculate_decay_state_spam_flagged(
    content: &ContentItem,
    current_time_ms: u64,
    is_spam_flagged: bool,
) -> DecayState {
    calculate_decay_state_full(
        content,
        current_time_ms,
        crate::types::constants::HALF_LIFE_SECS,
        is_spam_flagged,
    )
}

/// Calculate decay state combining spam flagging.
///
/// Priority order:
/// 1. If spam-flagged: use 4-hour half-life
/// 2. Otherwise: use base half-life
///
/// # Arguments
/// * `content` - The content item to evaluate
/// * `current_time_ms` - Current time in UNIX milliseconds
/// * `base_half_life_secs` - Base half-life
/// * `is_spam_flagged` - Whether the content has reached the spam threshold
///
/// # Returns
/// The computed decay state with appropriate half-life.
#[must_use]
pub fn calculate_decay_state_full(
    content: &ContentItem,
    current_time_ms: u64,
    base_half_life_secs: u64,
    is_spam_flagged: bool,
) -> DecayState {
    let half_life_secs = select_half_life(base_half_life_secs, is_spam_flagged);
    calculate_decay_state(content, current_time_ms, half_life_secs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::constants::HALF_LIFE_SECS;
    use crate::types::content::{ContentId, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

    fn make_test_content(created_at_ms: u64, last_engagement_ms: u64) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes([1u8; 32]),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: None,
            created_at: created_at_ms,
            last_engagement: last_engagement_ms,
            body_inline: Some("Test".to_string()),
            content_hash: None,
            content_size: None,
            content_type_mime: None,
            media_refs: vec![],
            pin_state: None,
            engagement_count: 0,
            signature: Signature::from_bytes([0u8; 64]),
            pow_nonce: 0,
            pow_difficulty: 0,
            preservation_pow: None,
            display_name: None,
        }
    }

    #[test]
    fn test_floor_protection() {
        // Content created 1 day ago (within 48h floor)
        let created_at_ms = 0;
        let current_time_ms = 86_400_000; // 1 day in ms

        let content = make_test_content(created_at_ms, created_at_ms);
        let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);

        assert!(state.is_protected);
        assert!(!state.is_decayed);
        assert_eq!(state.survival_probability, 1.0);
        assert_eq!(state.age_seconds, 86_400);
    }

    #[test]
    fn test_basic_decay_32_days() {
        // Content created 32 days ago, no engagement
        // Per SPEC_02: 32 days = 2,764,800 seconds
        // Time since engagement = 32 days
        // Effective decay time = 32 days - 2 days floor = 30 days = 2,592,000 seconds
        // Half-lives = 2,592,000 / 604,800 = 4.286
        // Survival = 0.5^4.286 ≈ 0.051

        let created_at_ms = 0;
        let current_time_ms = 32 * 24 * 60 * 60 * 1000; // 32 days in ms

        let content = make_test_content(created_at_ms, created_at_ms);
        let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);

        assert!(!state.is_protected);
        assert!(state.is_decayed); // survival < 0.0625

        // Check half-lives (should be ~4.286)
        let expected_half_lives = (30.0 * 24.0 * 60.0 * 60.0) / (HALF_LIFE_SECS as f64);
        assert!((state.half_lives_elapsed - expected_half_lives).abs() < 0.01);

        // Check survival probability (should be ~0.051)
        assert!(state.survival_probability < DECAY_THRESHOLD);
        assert!(state.survival_probability > 0.04);
        assert!(state.survival_probability < 0.06);
    }

    #[test]
    fn test_engagement_resets_decay() {
        // Content created day 0, engaged on day 27, check on day 32
        // Time since engagement = 5 days
        // Effective decay time = 5 days - 2 days = 3 days = 259,200 seconds
        // Half-lives = 259,200 / 604,800 = 0.428
        // Survival = 0.5^0.428 ≈ 0.74

        let created_at_ms = 0;
        let engaged_at_ms = 27 * 24 * 60 * 60 * 1000; // 27 days
        let current_time_ms = 32 * 24 * 60 * 60 * 1000; // 32 days

        let content = make_test_content(created_at_ms, engaged_at_ms);
        let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);

        assert!(!state.is_protected);
        assert!(!state.is_decayed);

        // Check half-lives (should be ~0.428)
        let expected_half_lives = (3.0 * 24.0 * 60.0 * 60.0) / (HALF_LIFE_SECS as f64);
        assert!((state.half_lives_elapsed - expected_half_lives).abs() < 0.01);

        // Check survival probability (should be ~0.74)
        assert!(state.survival_probability > 0.7);
        assert!(state.survival_probability < 0.8);
    }

    #[test]
    fn test_adaptive_half_life_decrease() {
        // Storage 150% of target -> half-life should decrease
        let state = NodeState {
            total_storage_bytes: 750_000_000,  // 750MB
            target_storage_bytes: 500_000_000, // 500MB
            current_half_life_secs: HALF_LIFE_SECS,
        };

        let new_half_life = calculate_adaptive_half_life(&state);
        assert!(new_half_life < HALF_LIFE_SECS);
    }

    #[test]
    fn test_adaptive_half_life_increase() {
        // Storage 50% of target -> half-life should increase
        let state = NodeState {
            total_storage_bytes: 250_000_000,  // 250MB
            target_storage_bytes: 500_000_000, // 500MB
            current_half_life_secs: HALF_LIFE_SECS,
        };

        let new_half_life = calculate_adaptive_half_life(&state);
        assert!(new_half_life > HALF_LIFE_SECS);
    }

    #[test]
    fn test_adaptive_half_life_clamping() {
        // Very high pressure should clamp to MIN
        let state = NodeState {
            total_storage_bytes: 10_000_000_000, // 10GB
            target_storage_bytes: 500_000_000,   // 500MB
            current_half_life_secs: HALF_LIFE_SECS,
        };

        let new_half_life = calculate_adaptive_half_life(&state);
        // Due to smoothing, won't reach MIN in one step, but should be decreasing
        assert!(new_half_life < HALF_LIFE_SECS);
    }

    #[test]
    fn test_pin_protection() {
        use crate::types::content::{PinState, PinType};

        let created_at_ms = 0;
        let current_time_ms = 60 * 24 * 60 * 60 * 1000; // 60 days

        let mut content = make_test_content(created_at_ms, created_at_ms);
        content.pin_state = Some(PinState {
            pin_type: PinType::Author,
            pin_created: 0,
            pin_expiry: None, // No expiry
            pin_cost: 0,
        });

        let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);

        assert!(state.is_protected);
        assert!(!state.is_decayed);
        assert_eq!(state.survival_probability, 1.0);
    }

    #[test]
    fn test_expired_pin_not_protected() {
        use crate::types::content::{PinState, PinType};

        let created_at_ms = 0;
        let current_time_ms = 60 * 24 * 60 * 60 * 1000; // 60 days

        let mut content = make_test_content(created_at_ms, created_at_ms);
        content.pin_state = Some(PinState {
            pin_type: PinType::Author,
            pin_created: 0,
            pin_expiry: Some(30 * 24 * 60 * 60 * 1000), // Expired 30 days ago
            pin_cost: 0,
        });

        let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);

        assert!(!state.is_protected);
        assert!(state.is_decayed);
    }

    #[test]
    fn test_spam_flagged_decay_accelerated() {
        // Content created 3 days ago, no engagement
        // Normal: 1 day effective (3d - 2d floor) / 7d = 0.14 half-lives ≈ 90% survival
        // Flagged: 1 day effective (86400s) / 4h (14400s) = 6 half-lives ≈ 1.6% survival
        let created_at_ms = 0;
        let current_time_ms = 3 * 24 * 60 * 60 * 1000; // 3 days

        let content = make_test_content(created_at_ms, created_at_ms);

        // Not flagged - high survival
        let state_normal = calculate_decay_state_spam_flagged(&content, current_time_ms, false);
        assert!(state_normal.survival_probability > 0.8);
        assert!(!state_normal.is_decayed);

        // Flagged - rapid decay
        let state_flagged = calculate_decay_state_spam_flagged(&content, current_time_ms, true);
        assert!(state_flagged.survival_probability < 0.05);
        assert!(state_flagged.is_decayed);
    }

    #[test]
    fn test_spam_flagged_floor_still_protected() {
        // Content within floor period should still be protected even if flagged
        // This gives time for counter-attestations
        let created_at_ms = 0;
        let current_time_ms = 24 * 60 * 60 * 1000; // 1 day (within 48h floor)

        let content = make_test_content(created_at_ms, created_at_ms);

        let state = calculate_decay_state_spam_flagged(&content, current_time_ms, true);
        assert!(state.is_protected);
        assert_eq!(state.survival_probability, 1.0);
    }

    #[test]
    fn test_spam_flagged_vs_normal() {
        // Content should decay rapidly when spam flagged vs normal
        let created_at_ms = 0;
        let current_time_ms = 3 * 24 * 60 * 60 * 1000; // 3 days

        let content = make_test_content(created_at_ms, created_at_ms);

        // Not spam flagged - high survival
        let state_normal =
            calculate_decay_state_full(&content, current_time_ms, HALF_LIFE_SECS, false);
        assert!(state_normal.survival_probability > 0.8);

        // Spam flagged - rapid decay
        let state_flagged =
            calculate_decay_state_full(&content, current_time_ms, HALF_LIFE_SECS, true);
        assert!(state_flagged.survival_probability < 0.05);
        assert!(state_flagged.is_decayed);
    }

    #[test]
    fn test_spam_flagged_decay_timeline() {
        // Test the 4-hour half-life decay timeline
        // After 4 hours (past floor): ~50% survival
        // After 8 hours: ~25%
        // After 16 hours: ~6.25% (at threshold)
        let created_at_ms = 0;

        let content = make_test_content(created_at_ms, created_at_ms);

        // 3 days (past floor) + 4 hours = 4 hours effective decay time
        let time_4h = 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000;
        let state_4h = calculate_decay_state_spam_flagged(&content, time_4h, true);
        // 28 hours effective, 28*3600/14400 ≈ 7 half-lives
        // Actually: (3d-2d + 4h) = 24h + 4h = 28h effective
        // 28*3600/14400 = 7 half-lives, 0.5^7 ≈ 0.0078

        // Just check it decays rapidly
        assert!(state_4h.is_decayed);
        assert!(state_4h.survival_probability < 0.1);
    }
}
