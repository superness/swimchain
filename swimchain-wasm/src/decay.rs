//! Content decay calculations for WASM
//!
//! Implements the half-life decay model from SPEC_02 §4.1.
//! Mirrors the algorithm from src/content/decay.rs in the main crate.

use wasm_bindgen::prelude::*;

/// Decay floor duration in seconds (48 hours) - SPEC_02 §4.1
const DECAY_FLOOR_SECS: u64 = 172_800;

/// Decay half-life in seconds (7 days) - SPEC_02 §4.1
const HALF_LIFE_SECS: u64 = 604_800;

/// Decay threshold below which content expires (6.25%) - SPEC_02 §4.1
const DECAY_THRESHOLD: f64 = 0.0625;

/// Result of a decay calculation
///
/// Contains all information about the current decay state of content.
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WasmDecayState {
    /// Current "heat" value (survival probability, 0.0 to 1.0)
    #[wasm_bindgen(js_name = "currentHeat")]
    pub current_heat: f64,
    /// Whether the content has decayed below threshold
    #[wasm_bindgen(js_name = "isDecayed")]
    pub is_decayed: bool,
    /// Whether the content is protected (within floor period or pinned)
    #[wasm_bindgen(js_name = "isProtected")]
    pub is_protected: bool,
    /// Number of half-lives elapsed since last engagement
    #[wasm_bindgen(js_name = "halfLivesElapsed")]
    pub half_lives_elapsed: f64,
    /// Content age in seconds
    #[wasm_bindgen(js_name = "ageSeconds")]
    pub age_seconds: u64,
    /// Seconds since last engagement
    #[wasm_bindgen(js_name = "timeSinceEngagement")]
    pub time_since_engagement: u64,
}

#[wasm_bindgen]
impl WasmDecayState {
    /// Get the decay percentage (100% - current_heat * 100)
    #[wasm_bindgen(js_name = "decayPercent")]
    pub fn decay_percent(&self) -> f64 {
        (1.0 - self.current_heat) * 100.0
    }

    /// Get a human-readable description of the decay state
    pub fn description(&self) -> String {
        if self.is_protected {
            "Protected (within floor period)".to_string()
        } else if self.is_decayed {
            format!(
                "Decayed ({:.2}% heat, below {:.2}% threshold)",
                self.current_heat * 100.0,
                DECAY_THRESHOLD * 100.0
            )
        } else {
            format!(
                "Active ({:.2}% heat after {:.2} half-lives)",
                self.current_heat * 100.0,
                self.half_lives_elapsed
            )
        }
    }

    /// Get the time remaining until content expires (in seconds)
    ///
    /// Returns 0 if content is already decayed.
    /// Returns u64::MAX if content is protected.
    #[wasm_bindgen(js_name = "timeUntilDecay")]
    pub fn time_until_decay(&self) -> u64 {
        if self.is_decayed {
            return 0;
        }
        if self.is_protected {
            return u64::MAX;
        }

        // Calculate half-lives needed to reach threshold
        // threshold = 0.5^half_lives
        // log(threshold) = half_lives * log(0.5)
        // half_lives = log(threshold) / log(0.5)
        let threshold_half_lives = DECAY_THRESHOLD.log2().abs();

        if self.half_lives_elapsed >= threshold_half_lives {
            return 0;
        }

        let remaining_half_lives = threshold_half_lives - self.half_lives_elapsed;
        (remaining_half_lives * HALF_LIFE_SECS as f64) as u64
    }
}

/// Calculate decay state for content
///
/// # Arguments
/// * `created_at_secs` - Content creation timestamp (UNIX seconds)
/// * `last_engagement_secs` - Last engagement timestamp (UNIX seconds)
/// * `now_secs` - Current timestamp (UNIX seconds)
///
/// # Returns
/// `WasmDecayState` with all decay information
///
/// # Example (JavaScript)
/// ```js
/// const nowSecs = Math.floor(Date.now() / 1000);
/// const createdSecs = nowSecs - 86400; // 1 day ago
/// const state = calculate_decay(createdSecs, createdSecs, nowSecs);
/// console.log(state.isProtected); // true (within 48h floor)
/// ```
#[wasm_bindgen]
pub fn calculate_decay(
    created_at_secs: u64,
    last_engagement_secs: u64,
    now_secs: u64,
) -> WasmDecayState {
    calculate_decay_with_half_life(created_at_secs, last_engagement_secs, now_secs, None)
}

/// Calculate decay state with custom half-life
///
/// # Arguments
/// * `created_at_secs` - Content creation timestamp (UNIX seconds)
/// * `last_engagement_secs` - Last engagement timestamp (UNIX seconds)
/// * `now_secs` - Current timestamp (UNIX seconds)
/// * `half_life_secs` - Optional custom half-life (defaults to 7 days)
///
/// # Returns
/// `WasmDecayState` with all decay information
#[wasm_bindgen(js_name = "calculateDecayWithHalfLife")]
pub fn calculate_decay_with_half_life(
    created_at_secs: u64,
    last_engagement_secs: u64,
    now_secs: u64,
    half_life_secs: Option<u64>,
) -> WasmDecayState {
    let half_life = half_life_secs.unwrap_or(HALF_LIFE_SECS);
    let age_seconds = now_secs.saturating_sub(created_at_secs);
    let time_since_engagement = now_secs.saturating_sub(last_engagement_secs);

    // Floor protection: content < 48h old is protected
    if age_seconds < DECAY_FLOOR_SECS {
        return WasmDecayState {
            current_heat: 1.0,
            is_decayed: false,
            is_protected: true,
            half_lives_elapsed: 0.0,
            age_seconds,
            time_since_engagement,
        };
    }

    // Calculate decay
    // effective_decay_time = max(0, time_since_engagement - floor)
    let effective_decay_time = time_since_engagement.saturating_sub(DECAY_FLOOR_SECS);
    let half_lives_elapsed = effective_decay_time as f64 / half_life as f64;
    let survival_probability = 0.5_f64.powf(half_lives_elapsed);
    let is_decayed = survival_probability < DECAY_THRESHOLD;

    WasmDecayState {
        current_heat: survival_probability,
        is_decayed,
        is_protected: false,
        half_lives_elapsed,
        age_seconds,
        time_since_engagement,
    }
}

/// Get the default decay floor in seconds (48 hours)
#[wasm_bindgen(js_name = "getDecayFloorSecs")]
pub fn get_decay_floor_secs() -> u64 {
    DECAY_FLOOR_SECS
}

/// Get the default half-life in seconds (7 days)
#[wasm_bindgen(js_name = "getHalfLifeSecs")]
pub fn get_half_life_secs() -> u64 {
    HALF_LIFE_SECS
}

/// Get the decay threshold (6.25%)
#[wasm_bindgen(js_name = "getDecayThreshold")]
pub fn get_decay_threshold() -> f64 {
    DECAY_THRESHOLD
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_protection() {
        // Content 24h old (within 48h floor)
        let now = 1_000_000;
        let created = now - 24 * 60 * 60; // 24h ago
        let state = calculate_decay(created, created, now);

        assert!(state.is_protected);
        assert!(!state.is_decayed);
        assert_eq!(state.current_heat, 1.0);
        assert_eq!(state.age_seconds, 24 * 60 * 60);
    }

    #[test]
    fn test_32_day_decay() {
        // Content 32 days old with no engagement
        // Per SPEC_02: 32 days = 2,764,800 seconds
        // Effective decay time = 32 days - 2 days = 30 days = 2,592,000 seconds
        // Half-lives = 2,592,000 / 604,800 ≈ 4.286
        // Survival = 0.5^4.286 ≈ 0.051

        let now = 1_000_000u64 + 32 * 24 * 60 * 60;
        let created = 1_000_000u64;
        let state = calculate_decay(created, created, now);

        assert!(!state.is_protected);
        assert!(state.is_decayed);

        // Check half-lives (~4.286)
        let expected_half_lives = (30.0 * 24.0 * 60.0 * 60.0) / HALF_LIFE_SECS as f64;
        assert!((state.half_lives_elapsed - expected_half_lives).abs() < 0.01);

        // Check survival probability (~0.051)
        assert!(state.current_heat < DECAY_THRESHOLD);
        assert!(state.current_heat > 0.04);
        assert!(state.current_heat < 0.06);
    }

    #[test]
    fn test_engagement_resets_decay() {
        // Content created day 0, engaged on day 27, check on day 32
        // Time since engagement = 5 days
        // Effective decay time = 5 days - 2 days = 3 days
        // Half-lives = 3d / 7d ≈ 0.428
        // Survival = 0.5^0.428 ≈ 0.74

        let created = 0u64;
        let engaged = 27 * 24 * 60 * 60;
        let now = 32 * 24 * 60 * 60;
        let state = calculate_decay(created, engaged, now);

        assert!(!state.is_protected);
        assert!(!state.is_decayed);

        // Check half-lives (~0.428)
        let expected_half_lives = (3.0 * 24.0 * 60.0 * 60.0) / HALF_LIFE_SECS as f64;
        assert!((state.half_lives_elapsed - expected_half_lives).abs() < 0.01);

        // Check survival probability (~0.74)
        assert!(state.current_heat > 0.7);
        assert!(state.current_heat < 0.8);
    }

    #[test]
    fn test_custom_half_life() {
        let now = 1_000_000u64 + 14 * 24 * 60 * 60; // 14 days old
        let created = 1_000_000u64;

        // With 7-day half-life
        let state1 = calculate_decay(created, created, now);

        // With 14-day half-life
        let state2 = calculate_decay_with_half_life(created, created, now, Some(14 * 24 * 60 * 60));

        // 14-day half-life should have higher survival
        assert!(state2.current_heat > state1.current_heat);
    }

    #[test]
    fn test_decay_percent() {
        let state = WasmDecayState {
            current_heat: 0.75,
            is_decayed: false,
            is_protected: false,
            half_lives_elapsed: 0.5,
            age_seconds: 100000,
            time_since_engagement: 100000,
        };
        assert!((state.decay_percent() - 25.0).abs() < 0.01);
    }

    #[test]
    fn test_time_until_decay() {
        // Content at 50% heat
        let state = WasmDecayState {
            current_heat: 0.5,
            is_decayed: false,
            is_protected: false,
            half_lives_elapsed: 1.0,
            age_seconds: 1000000,
            time_since_engagement: 1000000,
        };

        // Should have ~3 more half-lives until threshold (0.5^4 = 0.0625)
        let remaining = state.time_until_decay();
        assert!(remaining > 2 * HALF_LIFE_SECS);
        assert!(remaining < 4 * HALF_LIFE_SECS);
    }
}
