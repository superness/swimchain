//! Health score computation
//!
//! Per SPEC_09 §6.1 and docs/analytics-client.md, the health score is computed
//! from four components:
//!
//! - Swimmer score (30%): active_swimmers / 10 * 30, capped at 30
//! - Risk score (30%): max(0, 30 - posts_at_risk), capped at 30
//! - Sync score (20%): 20 if last_sync < 5 minutes, else 0
//! - Contribution score (20%): monthly_bandwidth_gb / 100 * 20, capped at 20
//!
//! Total health score ranges from 0-100.
//!
//! Additionally, linear chain warnings reduce the score:
//! - Each warning reduces score by 2 points
//! - Maximum penalty is 10 points (5+ warnings)

/// Sync age threshold for full sync score (5 minutes in seconds)
pub const SYNC_FRESH_THRESHOLD_SECS: u64 = 300;

/// Maximum active swimmers for full swimmer score
pub const MAX_SWIMMERS_FOR_FULL_SCORE: u32 = 10;

/// Maximum bandwidth GB for full contribution score
pub const MAX_BANDWIDTH_FOR_FULL_SCORE: u64 = 100;

/// Maximum health score penalty from linear chain warnings
pub const MAX_LINEAR_CHAIN_PENALTY: u8 = 10;

/// Penalty per linear chain warning
pub const PENALTY_PER_WARNING: u8 = 2;

/// Compute the health score for a space.
///
/// # Arguments
/// - `active_swimmers`: Count of identities with Level >= Regular active in last 7 days
/// - `posts_at_risk`: Count of posts with 6.25% <= survival < 25%
/// - `last_sync_age_secs`: Seconds since last sync was available
/// - `monthly_bandwidth_gb`: Total GB served by space contributors this month
///
/// # Returns
/// Health score 0-100
///
/// # Examples
///
/// ```
/// use swimchain::space_health::compute_health_score;
///
/// // Empty space - only risk score (no at-risk posts = 30 points)
/// assert_eq!(compute_health_score(0, 0, 999, 0), 30);
///
/// // Healthy space - full score
/// assert_eq!(compute_health_score(10, 0, 60, 100), 100);
///
/// // Degraded space
/// // 5 swimmers = 15 points
/// // 10 at-risk = 20 points
/// // stale sync = 0 points
/// // 50GB = 10 points
/// // Total = 45
/// assert_eq!(compute_health_score(5, 10, 600, 50), 45);
/// ```
pub fn compute_health_score(
    active_swimmers: u32,
    posts_at_risk: u32,
    last_sync_age_secs: u64,
    monthly_bandwidth_gb: u64,
) -> u8 {
    // Swimmer score: 30 points max (10+ swimmers = full score)
    let swimmer_score = if active_swimmers >= MAX_SWIMMERS_FOR_FULL_SCORE {
        30
    } else {
        (active_swimmers * 30) / MAX_SWIMMERS_FOR_FULL_SCORE
    };

    // Risk score: 30 points if no posts at risk, decreases by 1 per at-risk post
    let risk_score = if posts_at_risk >= 30 {
        0
    } else {
        30 - posts_at_risk
    };

    // Sync score: 20 points if sync < 5 minutes old
    let sync_score = if last_sync_age_secs < SYNC_FRESH_THRESHOLD_SECS {
        20
    } else {
        0
    };

    // Contribution score: 20 points max (100+ GB/month = full score)
    let contrib_score = if monthly_bandwidth_gb >= MAX_BANDWIDTH_FOR_FULL_SCORE {
        20
    } else {
        ((monthly_bandwidth_gb * 20) / MAX_BANDWIDTH_FOR_FULL_SCORE) as u32
    };

    // Sum and clamp to 0-100
    let total = swimmer_score + risk_score + sync_score + contrib_score;
    std::cmp::min(100, total) as u8
}

/// Compute health score with linear chain penalty
///
/// Same as `compute_health_score` but subtracts penalty for linear chain warnings.
/// Each warning reduces score by 2 points, up to maximum of 10 points.
///
/// # Arguments
/// - `active_swimmers`: Count of identities with Level >= Regular active in last 7 days
/// - `posts_at_risk`: Count of posts with 6.25% <= survival < 25%
/// - `last_sync_age_secs`: Seconds since last sync was available
/// - `monthly_bandwidth_gb`: Total GB served by space contributors this month
/// - `linear_chain_warning_count`: Number of linear chain warnings in the space
///
/// # Returns
/// Health score 0-100
pub fn compute_health_score_with_warnings(
    active_swimmers: u32,
    posts_at_risk: u32,
    last_sync_age_secs: u64,
    monthly_bandwidth_gb: u64,
    linear_chain_warning_count: u32,
) -> u8 {
    let base_score = compute_health_score(
        active_swimmers,
        posts_at_risk,
        last_sync_age_secs,
        monthly_bandwidth_gb,
    );

    let penalty = std::cmp::min(
        (linear_chain_warning_count * PENALTY_PER_WARNING as u32) as u8,
        MAX_LINEAR_CHAIN_PENALTY,
    );

    base_score.saturating_sub(penalty)
}

/// Detailed breakdown of health score components.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HealthScoreBreakdown {
    /// Swimmer component (0-30)
    pub swimmer_score: u8,
    /// Risk component (0-30)
    pub risk_score: u8,
    /// Sync component (0 or 20)
    pub sync_score: u8,
    /// Contribution component (0-20)
    pub contrib_score: u8,
    /// Linear chain penalty (0-10, subtracted from total)
    pub linear_chain_penalty: u8,
    /// Total score (0-100)
    pub total: u8,
}

impl HealthScoreBreakdown {
    /// Compute health score breakdown with component details (no linear chain penalty).
    ///
    /// Use `compute_with_warnings` if you have linear chain warning data.
    pub fn compute(
        active_swimmers: u32,
        posts_at_risk: u32,
        last_sync_age_secs: u64,
        monthly_bandwidth_gb: u64,
    ) -> Self {
        Self::compute_with_warnings(
            active_swimmers,
            posts_at_risk,
            last_sync_age_secs,
            monthly_bandwidth_gb,
            0, // No warnings
        )
    }

    /// Compute health score breakdown including linear chain penalty.
    ///
    /// Each linear chain warning reduces the score by 2 points, up to 10 points max.
    pub fn compute_with_warnings(
        active_swimmers: u32,
        posts_at_risk: u32,
        last_sync_age_secs: u64,
        monthly_bandwidth_gb: u64,
        linear_chain_warning_count: u32,
    ) -> Self {
        let swimmer_score = if active_swimmers >= MAX_SWIMMERS_FOR_FULL_SCORE {
            30
        } else {
            ((active_swimmers * 30) / MAX_SWIMMERS_FOR_FULL_SCORE) as u8
        };

        let risk_score = if posts_at_risk >= 30 {
            0
        } else {
            (30 - posts_at_risk) as u8
        };

        let sync_score = if last_sync_age_secs < SYNC_FRESH_THRESHOLD_SECS {
            20
        } else {
            0
        };

        let contrib_score = if monthly_bandwidth_gb >= MAX_BANDWIDTH_FOR_FULL_SCORE {
            20
        } else {
            ((monthly_bandwidth_gb * 20) / MAX_BANDWIDTH_FOR_FULL_SCORE) as u8
        };

        let linear_chain_penalty = std::cmp::min(
            (linear_chain_warning_count * PENALTY_PER_WARNING as u32) as u8,
            MAX_LINEAR_CHAIN_PENALTY,
        );

        let base_total = std::cmp::min(
            100,
            swimmer_score as u32 + risk_score as u32 + sync_score as u32 + contrib_score as u32,
        ) as u8;

        let total = base_total.saturating_sub(linear_chain_penalty);

        Self {
            swimmer_score,
            risk_score,
            sync_score,
            contrib_score,
            linear_chain_penalty,
            total,
        }
    }

    /// Get the health status category.
    pub fn status(&self) -> HealthStatus {
        match self.total {
            80..=100 => HealthStatus::Healthy,
            60..=79 => HealthStatus::Degraded,
            40..=59 => HealthStatus::Warning,
            _ => HealthStatus::Unhealthy,
        }
    }
}

/// Health status categories per docs/analytics-client.md.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HealthStatus {
    /// Score 80-100: Network is functioning well
    Healthy,
    /// Score 60-79: Some issues, monitor closely
    Degraded,
    /// Score 40-59: Multiple issues present
    Warning,
    /// Score 0-39: Critical issues requiring attention
    Unhealthy,
}

impl HealthStatus {
    /// Get the minimum score for this status.
    pub fn min_score(&self) -> u8 {
        match self {
            Self::Healthy => 80,
            Self::Degraded => 60,
            Self::Warning => 40,
            Self::Unhealthy => 0,
        }
    }

    /// Get the maximum score for this status.
    pub fn max_score(&self) -> u8 {
        match self {
            Self::Healthy => 100,
            Self::Degraded => 79,
            Self::Warning => 59,
            Self::Unhealthy => 39,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_space() {
        // No swimmers, no risk, stale sync, no bandwidth
        // Risk score = 30 (no at-risk posts)
        // All others = 0
        assert_eq!(compute_health_score(0, 0, 999, 0), 30);
    }

    #[test]
    fn test_healthy_space() {
        // 10 swimmers, 0 at-risk, fresh sync, 100GB bandwidth
        // Swimmer = 30, Risk = 30, Sync = 20, Contrib = 20
        assert_eq!(compute_health_score(10, 0, 60, 100), 100);
    }

    #[test]
    fn test_degraded_space() {
        // 5 swimmers (15 pts), 10 at-risk (20 pts), stale sync (0 pts), 50GB (10 pts)
        // Total = 45
        assert_eq!(compute_health_score(5, 10, 600, 50), 45);
    }

    #[test]
    fn test_clamped_to_100() {
        // Overflow values should still clamp to 100
        assert_eq!(compute_health_score(100, 0, 0, 1000), 100);
    }

    #[test]
    fn test_swimmer_score_scaling() {
        // 0 swimmers = 0 points
        assert_eq!(compute_health_score(0, 30, 600, 0), 0);

        // 5 swimmers = 15 points (5/10 * 30)
        assert_eq!(compute_health_score(5, 30, 600, 0), 15);

        // 10 swimmers = 30 points (full)
        assert_eq!(compute_health_score(10, 30, 600, 0), 30);

        // 20 swimmers = 30 points (capped)
        assert_eq!(compute_health_score(20, 30, 600, 0), 30);
    }

    #[test]
    fn test_risk_score_scaling() {
        // 0 at-risk = 30 points
        assert_eq!(compute_health_score(0, 0, 600, 0), 30);

        // 10 at-risk = 20 points
        assert_eq!(compute_health_score(0, 10, 600, 0), 20);

        // 30 at-risk = 0 points
        assert_eq!(compute_health_score(0, 30, 600, 0), 0);

        // 50 at-risk = 0 points (capped at 0)
        assert_eq!(compute_health_score(0, 50, 600, 0), 0);
    }

    #[test]
    fn test_sync_score() {
        // Fresh sync (< 5 min) = 20 points
        assert_eq!(compute_health_score(0, 30, 60, 0), 20);
        assert_eq!(compute_health_score(0, 30, 299, 0), 20);

        // Stale sync (>= 5 min) = 0 points
        assert_eq!(compute_health_score(0, 30, 300, 0), 0);
        assert_eq!(compute_health_score(0, 30, 600, 0), 0);
    }

    #[test]
    fn test_contrib_score_scaling() {
        // 0 GB = 0 points
        assert_eq!(compute_health_score(0, 30, 600, 0), 0);

        // 50 GB = 10 points (50/100 * 20)
        assert_eq!(compute_health_score(0, 30, 600, 50), 10);

        // 100 GB = 20 points (full)
        assert_eq!(compute_health_score(0, 30, 600, 100), 20);

        // 200 GB = 20 points (capped)
        assert_eq!(compute_health_score(0, 30, 600, 200), 20);
    }

    #[test]
    fn test_breakdown_compute() {
        let breakdown = HealthScoreBreakdown::compute(5, 10, 60, 50);

        assert_eq!(breakdown.swimmer_score, 15);  // 5/10 * 30
        assert_eq!(breakdown.risk_score, 20);     // 30 - 10
        assert_eq!(breakdown.sync_score, 20);     // < 5 min
        assert_eq!(breakdown.contrib_score, 10);  // 50/100 * 20
        assert_eq!(breakdown.total, 65);
    }

    #[test]
    fn test_health_status() {
        // Healthy: 10 swimmers (30) + 0 at-risk (30) + fresh sync (20) + 100GB (20) = 100
        assert_eq!(HealthScoreBreakdown::compute(10, 0, 60, 100).status(), HealthStatus::Healthy);

        // Degraded: 5 swimmers (15) + 5 at-risk (25) + fresh sync (20) + 50GB (10) = 70
        assert_eq!(HealthScoreBreakdown::compute(5, 5, 60, 50).status(), HealthStatus::Degraded);

        // Warning: 5 swimmers (15) + 5 at-risk (25) + stale sync (0) + 10GB (2) = 42
        assert_eq!(HealthScoreBreakdown::compute(5, 5, 600, 10).status(), HealthStatus::Warning);

        // Unhealthy: 0 swimmers (0) + 20 at-risk (10) + stale sync (0) + 0GB (0) = 10
        assert_eq!(HealthScoreBreakdown::compute(0, 20, 600, 0).status(), HealthStatus::Unhealthy);
    }

    #[test]
    fn test_health_status_boundaries() {
        // Test exact boundary values
        let mut breakdown = HealthScoreBreakdown::default();

        breakdown.total = 100;
        assert_eq!(breakdown.status(), HealthStatus::Healthy);

        breakdown.total = 80;
        assert_eq!(breakdown.status(), HealthStatus::Healthy);

        breakdown.total = 79;
        assert_eq!(breakdown.status(), HealthStatus::Degraded);

        breakdown.total = 60;
        assert_eq!(breakdown.status(), HealthStatus::Degraded);

        breakdown.total = 59;
        assert_eq!(breakdown.status(), HealthStatus::Warning);

        breakdown.total = 40;
        assert_eq!(breakdown.status(), HealthStatus::Warning);

        breakdown.total = 39;
        assert_eq!(breakdown.status(), HealthStatus::Unhealthy);

        breakdown.total = 0;
        assert_eq!(breakdown.status(), HealthStatus::Unhealthy);
    }

    // === Linear Chain Warning Penalty Tests ===

    #[test]
    fn test_compute_health_score_with_warnings_no_warnings() {
        // No warnings = same as regular score
        let base = compute_health_score(10, 0, 60, 100);
        let with_warnings = compute_health_score_with_warnings(10, 0, 60, 100, 0);
        assert_eq!(base, with_warnings);
        assert_eq!(with_warnings, 100);
    }

    #[test]
    fn test_compute_health_score_with_warnings_one_warning() {
        // 1 warning = -2 points
        let score = compute_health_score_with_warnings(10, 0, 60, 100, 1);
        assert_eq!(score, 98);
    }

    #[test]
    fn test_compute_health_score_with_warnings_multiple_warnings() {
        // 3 warnings = -6 points
        let score = compute_health_score_with_warnings(10, 0, 60, 100, 3);
        assert_eq!(score, 94);
    }

    #[test]
    fn test_compute_health_score_with_warnings_capped() {
        // 5+ warnings = -10 points (capped)
        assert_eq!(compute_health_score_with_warnings(10, 0, 60, 100, 5), 90);
        assert_eq!(compute_health_score_with_warnings(10, 0, 60, 100, 10), 90);
        assert_eq!(compute_health_score_with_warnings(10, 0, 60, 100, 100), 90);
    }

    #[test]
    fn test_compute_health_score_with_warnings_saturating() {
        // Low base score - penalty should not underflow
        // 0 swimmers + 30 at-risk + stale sync + 0GB = 0 base score
        let score = compute_health_score_with_warnings(0, 30, 600, 0, 5);
        assert_eq!(score, 0); // Should saturate at 0, not underflow
    }

    #[test]
    fn test_breakdown_with_warnings() {
        // Test breakdown includes linear chain penalty
        let breakdown = HealthScoreBreakdown::compute_with_warnings(10, 0, 60, 100, 3);

        assert_eq!(breakdown.swimmer_score, 30);
        assert_eq!(breakdown.risk_score, 30);
        assert_eq!(breakdown.sync_score, 20);
        assert_eq!(breakdown.contrib_score, 20);
        assert_eq!(breakdown.linear_chain_penalty, 6); // 3 * 2
        assert_eq!(breakdown.total, 94); // 100 - 6
    }

    #[test]
    fn test_breakdown_with_warnings_capped_penalty() {
        let breakdown = HealthScoreBreakdown::compute_with_warnings(10, 0, 60, 100, 10);

        assert_eq!(breakdown.linear_chain_penalty, 10); // Capped at 10
        assert_eq!(breakdown.total, 90); // 100 - 10
    }

    #[test]
    fn test_breakdown_backwards_compatible() {
        // compute() without warnings should have 0 penalty
        let breakdown = HealthScoreBreakdown::compute(10, 0, 60, 100);

        assert_eq!(breakdown.linear_chain_penalty, 0);
        assert_eq!(breakdown.total, 100);
    }
}
