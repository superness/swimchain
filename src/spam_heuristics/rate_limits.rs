//! Rate limiting for spam heuristics
//!
//! Enforces posting limits based on swimmer level as specified in SPEC_12 Section 7.

use std::collections::HashMap;

use super::error::SpamHeuristicsError;
use super::types::{
    HeuristicResult, HeuristicViolation, ViolationType,
    POSTS_PER_SPACE_PER_HOUR, DEFAULT_POSTS_PER_DAY,
};

/// Seconds in a day
const SECS_PER_DAY: u64 = 86_400;

/// Seconds in an hour
const SECS_PER_HOUR: u64 = 3_600;

/// Configuration for rate limiting.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Posts per space per hour limit
    pub posts_per_space_per_hour: u32,

    /// Override daily limits (if None, uses level-based defaults)
    pub daily_limit_override: Option<u32>,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            posts_per_space_per_hour: POSTS_PER_SPACE_PER_HOUR,
            daily_limit_override: None,
        }
    }
}

/// Tracks posting activity for rate limiting.
pub struct RateLimitTracker {
    config: RateLimitConfig,

    /// Daily post counts by author: author -> (day_start_timestamp, count)
    daily_counts: HashMap<[u8; 32], (u64, u32)>,

    /// Hourly post counts by (author, space): (author, space) -> (hour_start_timestamp, count)
    hourly_space_counts: HashMap<([u8; 32], [u8; 16]), (u64, u32)>,
}

impl RateLimitTracker {
    /// Create a new tracker with default config.
    pub fn new() -> Self {
        Self::with_config(RateLimitConfig::default())
    }

    /// Create a new tracker with custom config.
    pub fn with_config(config: RateLimitConfig) -> Self {
        Self {
            config,
            daily_counts: HashMap::new(),
            hourly_space_counts: HashMap::new(),
        }
    }

    /// Check if a post would exceed rate limits.
    ///
    /// Returns a result with any violations found.
    pub fn check(
        &mut self,
        author: &[u8; 32],
        space_id: &[u8; 16],
        current_time: u64,
    ) -> HeuristicResult {
        let mut result = HeuristicResult::clean();

        // Check daily limit (now a fixed limit for all users)
        let daily_limit = self
            .config
            .daily_limit_override
            .unwrap_or(DEFAULT_POSTS_PER_DAY);

        let day_start = current_time - (current_time % SECS_PER_DAY);

        let daily_count = self
            .daily_counts
            .entry(*author)
            .and_modify(|(ts, count)| {
                if *ts != day_start {
                    // New day, reset count
                    *ts = day_start;
                    *count = 0;
                }
            })
            .or_insert((day_start, 0));

        if daily_count.1 >= daily_limit {
            let reset_in = SECS_PER_DAY - (current_time % SECS_PER_DAY);
            result.add_violation(
                HeuristicViolation::new(
                    ViolationType::RateLimit,
                    format!(
                        "Daily limit exceeded: {} posts (max: {})",
                        daily_count.1, daily_limit
                    ),
                    ViolationType::RateLimit.default_weight(),
                )
                .with_context(format!("resets in {} minutes", reset_in / 60)),
            );
        }

        // Check hourly space limit
        let hour_start = current_time - (current_time % SECS_PER_HOUR);

        let hourly_count = self
            .hourly_space_counts
            .entry((*author, *space_id))
            .and_modify(|(ts, count)| {
                if *ts != hour_start {
                    // New hour, reset count
                    *ts = hour_start;
                    *count = 0;
                }
            })
            .or_insert((hour_start, 0));

        if hourly_count.1 >= self.config.posts_per_space_per_hour {
            let reset_in = SECS_PER_HOUR - (current_time % SECS_PER_HOUR);
            result.add_violation(
                HeuristicViolation::new(
                    ViolationType::RateLimit,
                    format!(
                        "Space flooding: {} posts in this space (max: {} per hour)",
                        hourly_count.1, self.config.posts_per_space_per_hour
                    ),
                    ViolationType::RateLimit.default_weight() * 0.8, // Slightly lower weight
                )
                .with_context(format!("resets in {} minutes", reset_in / 60)),
            );
        }

        // Increment counts
        daily_count.1 += 1;
        hourly_count.1 += 1;

        result
    }

    /// Check if posting would exceed rate limits without recording the post.
    pub fn would_exceed(
        &self,
        author: &[u8; 32],
        space_id: &[u8; 16],
        current_time: u64,
    ) -> Result<(), SpamHeuristicsError> {
        let daily_limit = self
            .config
            .daily_limit_override
            .unwrap_or(DEFAULT_POSTS_PER_DAY);

        let day_start = current_time - (current_time % SECS_PER_DAY);

        // Check daily limit
        if let Some((ts, count)) = self.daily_counts.get(author) {
            if *ts == day_start && *count >= daily_limit {
                let reset_in = SECS_PER_DAY - (current_time % SECS_PER_DAY);
                return Err(SpamHeuristicsError::RateLimitExceeded {
                    current_count: *count,
                    max_allowed: daily_limit,
                    reset_in_secs: reset_in,
                });
            }
        }

        let hour_start = current_time - (current_time % SECS_PER_HOUR);

        // Check hourly space limit
        if let Some((ts, count)) = self.hourly_space_counts.get(&(*author, *space_id)) {
            if *ts == hour_start && *count >= self.config.posts_per_space_per_hour {
                let reset_in = SECS_PER_HOUR - (current_time % SECS_PER_HOUR);
                return Err(SpamHeuristicsError::RateLimitExceeded {
                    current_count: *count,
                    max_allowed: self.config.posts_per_space_per_hour,
                    reset_in_secs: reset_in,
                });
            }
        }

        Ok(())
    }

    /// Get current daily count for an author.
    pub fn daily_count(&self, author: &[u8; 32], current_time: u64) -> u32 {
        let day_start = current_time - (current_time % SECS_PER_DAY);

        self.daily_counts
            .get(author)
            .filter(|(ts, _)| *ts == day_start)
            .map(|(_, count)| *count)
            .unwrap_or(0)
    }

    /// Get current hourly count for an author in a specific space.
    pub fn hourly_space_count(
        &self,
        author: &[u8; 32],
        space_id: &[u8; 16],
        current_time: u64,
    ) -> u32 {
        let hour_start = current_time - (current_time % SECS_PER_HOUR);

        self.hourly_space_counts
            .get(&(*author, *space_id))
            .filter(|(ts, _)| *ts == hour_start)
            .map(|(_, count)| *count)
            .unwrap_or(0)
    }

    /// Get remaining daily posts for an author.
    pub fn remaining_daily(&self, author: &[u8; 32], current_time: u64) -> u32 {
        let daily_limit = self
            .config
            .daily_limit_override
            .unwrap_or(DEFAULT_POSTS_PER_DAY);

        let current = self.daily_count(author, current_time);
        daily_limit.saturating_sub(current)
    }

    /// Clean up old entries.
    ///
    /// This removes entries from previous days/hours to prevent unbounded memory growth.
    pub fn cleanup(&mut self, current_time: u64) {
        let day_start = current_time - (current_time % SECS_PER_DAY);
        let hour_start = current_time - (current_time % SECS_PER_HOUR);

        self.daily_counts.retain(|_, (ts, _)| *ts == day_start);
        self.hourly_space_counts
            .retain(|_, (ts, _)| *ts == hour_start);
    }

    /// Clear all tracking data.
    pub fn clear(&mut self) {
        self.daily_counts.clear();
        self.hourly_space_counts.clear();
    }
}

impl Default for RateLimitTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_author(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn make_space(seed: u8) -> [u8; 16] {
        [seed; 16]
    }

    #[test]
    fn test_daily_limit() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let base_time = 100_000u64;

        // Default daily limit is 20 posts per day
        // Use different spaces to avoid the per-space-per-hour limit (5/hour)
        for i in 0..20 {
            let space = make_space(i as u8); // Different space for each post
            let result = tracker.check(&author, &space, base_time + i as u64);
            assert!(!result.has_violations, "Post {} should be allowed", i + 1);
        }

        // 21st post should be flagged (daily limit exceeded)
        let space = make_space(20);
        let result = tracker.check(&author, &space, base_time + 20);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::RateLimit));
    }

    #[test]
    fn test_space_flooding() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let space = make_space(1);
        let base_time = 100_000u64;

        // 5 posts per hour per space is the limit
        for i in 0..5 {
            let result = tracker.check(&author, &space, base_time + i as u64);
            assert!(
                !result.has_violations || result.violations.iter().all(|v| v.description.contains("Space flooding") == false),
                "Post {} should not trigger space flooding", i + 1
            );
        }

        // 6th post in same space within hour should trigger space flooding
        let result = tracker.check(&author, &space, base_time + 5);
        assert!(result.violations.iter().any(|v| v.description.contains("Space flooding")));
    }

    #[test]
    fn test_different_spaces_allowed() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let base_time = 100_000u64;

        // Different spaces don't count toward space flooding
        for i in 0..10 {
            let space = make_space(i);
            let result = tracker.check(&author, &space, base_time + i as u64);
            assert!(
                !result.violations.iter().any(|v| v.description.contains("Space flooding")),
                "Space {} should not trigger flooding", i
            );
        }
    }

    #[test]
    fn test_day_reset() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let space = make_space(1);

        // Use up daily limit on day 0 (use different spaces to avoid hourly limit)
        for i in 0..20 {
            let sp = make_space(i as u8);
            tracker.check(&author, &sp, i as u64);
        }

        // Next day (86400 seconds later), limit should reset
        let result = tracker.check(&author, &space, SECS_PER_DAY);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_hour_reset() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let space = make_space(1);

        // Use up hourly space limit
        for i in 0..5 {
            tracker.check(&author, &space, i as u64);
        }

        // Next hour, space limit should reset
        let result = tracker.check(&author, &space, SECS_PER_HOUR);
        assert!(
            !result.violations.iter().any(|v| v.description.contains("Space flooding")),
            "Hourly limit should have reset"
        );
    }

    #[test]
    fn test_would_exceed() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);

        // Use up daily limit (use different spaces to avoid hourly limit)
        for i in 0..20 {
            let space = make_space(i as u8);
            tracker.check(&author, &space, i as u64);
        }

        // Check without recording
        let space = make_space(20);
        let result = tracker.would_exceed(&author, &space, 20);
        assert!(matches!(
            result,
            Err(SpamHeuristicsError::RateLimitExceeded { .. })
        ));
    }

    #[test]
    fn test_remaining_daily() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let space = make_space(1);

        assert_eq!(tracker.remaining_daily(&author, 0), DEFAULT_POSTS_PER_DAY);

        tracker.check(&author, &space, 0);
        assert_eq!(tracker.remaining_daily(&author, 0), DEFAULT_POSTS_PER_DAY - 1);

        tracker.check(&author, &space, 1);
        tracker.check(&author, &space, 2);
        assert_eq!(tracker.remaining_daily(&author, 2), DEFAULT_POSTS_PER_DAY - 3);
    }

    #[test]
    fn test_cleanup() {
        let mut tracker = RateLimitTracker::new();
        let author = make_author(1);
        let space = make_space(1);

        // Add some entries
        tracker.check(&author, &space, 0);
        assert_eq!(tracker.daily_count(&author, 0), 1);

        // Cleanup with time in a new day
        tracker.cleanup(SECS_PER_DAY);
        assert_eq!(tracker.daily_count(&author, SECS_PER_DAY), 0);
    }
}
