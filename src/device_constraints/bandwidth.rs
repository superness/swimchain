//! Daily bandwidth limiting
//!
//! Implements daily bandwidth caps with midnight UTC reset.
//! Wraps TokenBucketLimiter for rate control within daily limits.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::seeding::rate_limiter::TokenBucketLimiter;

/// Seconds per day
const SECS_PER_DAY: u64 = 86400;

/// Default rate limit in Mbps for contribution
const DEFAULT_RATE_MBPS: u32 = 10;

/// Daily bandwidth limiter with midnight UTC reset
///
/// Combines daily caps with rate limiting to provide:
/// - Daily bandwidth budget enforcement
/// - Burst rate control via token bucket
/// - Automatic reset at midnight UTC
pub struct DailyBandwidthLimiter {
    /// Underlying rate limiter for burst control
    rate_limiter: TokenBucketLimiter,

    /// Daily cap in bytes
    daily_cap_bytes: AtomicU64,

    /// Bytes used today
    bytes_used_today: AtomicU64,

    /// Day start timestamp (Unix seconds, midnight UTC)
    day_start_secs: AtomicU64,
}

impl DailyBandwidthLimiter {
    /// Create a new daily bandwidth limiter
    ///
    /// # Arguments
    /// - `daily_cap_bytes`: Maximum bytes per day
    /// - `rate_mbps`: Rate limit in Mbps
    pub fn new(daily_cap_bytes: u64, rate_mbps: u32) -> Self {
        let now = Self::current_day_start();
        Self {
            rate_limiter: TokenBucketLimiter::new_mbps(rate_mbps),
            daily_cap_bytes: AtomicU64::new(daily_cap_bytes),
            bytes_used_today: AtomicU64::new(0),
            day_start_secs: AtomicU64::new(now),
        }
    }

    /// Create with default rate limit
    pub fn with_default_rate(daily_cap_bytes: u64) -> Self {
        Self::new(daily_cap_bytes, DEFAULT_RATE_MBPS)
    }

    /// Calculate midnight UTC for given timestamp
    fn day_start_for(timestamp_secs: u64) -> u64 {
        (timestamp_secs / SECS_PER_DAY) * SECS_PER_DAY
    }

    /// Get current day start (midnight UTC)
    fn current_day_start() -> u64 {
        Self::day_start_for(Self::now_secs())
    }

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Check if we need to reset for new day
    ///
    /// Uses compare-and-swap to ensure only one thread resets the counter
    /// at the day boundary, preventing race conditions.
    #[inline]
    fn maybe_reset(&self) {
        let current_day = Self::current_day_start();
        let stored_day = self.day_start_secs.load(Ordering::Acquire);

        if current_day > stored_day {
            // New day - try to atomically update the day start
            // Only the thread that wins the compare_exchange resets the counter
            if self
                .day_start_secs
                .compare_exchange(stored_day, current_day, Ordering::Release, Ordering::Relaxed)
                .is_ok()
            {
                self.bytes_used_today.store(0, Ordering::Release);
            }
        }
    }

    /// Check if we can serve the given number of bytes
    ///
    /// Returns true if daily budget allows this transfer.
    /// Does not consume bandwidth - use `try_acquire` for that.
    #[inline]
    #[must_use]
    pub fn can_serve(&self, bytes: u64) -> bool {
        self.maybe_reset();
        let used = self.bytes_used_today.load(Ordering::Relaxed);
        let cap = self.daily_cap_bytes.load(Ordering::Relaxed);
        used.saturating_add(bytes) <= cap
    }

    /// Try to acquire bandwidth for serving
    ///
    /// Returns actual bytes acquired (may be less than requested).
    /// Respects both daily cap and rate limit.
    #[inline]
    pub fn try_acquire(&self, bytes: u64) -> u64 {
        self.maybe_reset();

        // Check daily cap first
        let cap = self.daily_cap_bytes.load(Ordering::Relaxed);
        let used = self.bytes_used_today.load(Ordering::Relaxed);
        let remaining_daily = cap.saturating_sub(used);
        let limited_by_daily = bytes.min(remaining_daily);

        if limited_by_daily == 0 {
            return 0;
        }

        // Then check rate limiter
        let acquired = self.rate_limiter.try_acquire(limited_by_daily);
        if acquired > 0 {
            self.bytes_used_today.fetch_add(acquired, Ordering::Relaxed);
        }
        acquired
    }

    /// Get remaining daily budget
    #[inline]
    #[must_use]
    pub fn remaining_daily_budget(&self) -> u64 {
        self.maybe_reset();
        let cap = self.daily_cap_bytes.load(Ordering::Relaxed);
        let used = self.bytes_used_today.load(Ordering::Relaxed);
        cap.saturating_sub(used)
    }

    /// Get bytes used today
    #[must_use]
    pub fn bytes_used_today(&self) -> u64 {
        self.maybe_reset();
        self.bytes_used_today.load(Ordering::Relaxed)
    }

    /// Get daily cap
    #[must_use]
    pub fn daily_cap(&self) -> u64 {
        self.daily_cap_bytes.load(Ordering::Relaxed)
    }

    /// Update daily cap
    ///
    /// Takes effect immediately. Does not reset current usage.
    pub fn set_daily_cap(&self, cap_bytes: u64) {
        self.daily_cap_bytes.store(cap_bytes, Ordering::Relaxed);
    }

    /// Get percentage of daily budget used
    #[must_use]
    pub fn usage_percent(&self) -> f32 {
        self.maybe_reset();
        let cap = self.daily_cap_bytes.load(Ordering::Relaxed);
        if cap == 0 {
            return 100.0;
        }
        let used = self.bytes_used_today.load(Ordering::Relaxed);
        (used as f32 / cap as f32) * 100.0
    }

    /// Check if daily cap is reached
    #[must_use]
    pub fn is_cap_reached(&self) -> bool {
        self.remaining_daily_budget() == 0
    }

    /// Reset usage (for testing or manual reset)
    pub fn reset_usage(&self) {
        self.bytes_used_today.store(0, Ordering::Relaxed);
        self.day_start_secs
            .store(Self::current_day_start(), Ordering::Relaxed);
    }

    /// Get human-readable remaining budget
    #[must_use]
    pub fn remaining_display(&self) -> String {
        let remaining = self.remaining_daily_budget();
        if remaining >= 1_000_000_000 {
            format!("{:.2}GB", remaining as f64 / 1_000_000_000.0)
        } else if remaining >= 1_000_000 {
            format!("{:.1}MB", remaining as f64 / 1_000_000.0)
        } else if remaining >= 1_000 {
            format!("{:.0}KB", remaining as f64 / 1_000.0)
        } else {
            format!("{}B", remaining)
        }
    }

    /// Manually record usage (for integration with external bandwidth tracking)
    pub fn record_usage(&self, bytes: u64) {
        self.maybe_reset();
        self.bytes_used_today.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Get time until next reset (seconds)
    #[must_use]
    pub fn seconds_until_reset(&self) -> u64 {
        let now = Self::now_secs();
        let next_day_start = Self::day_start_for(now) + SECS_PER_DAY;
        next_day_start.saturating_sub(now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_limiter() {
        let limiter = DailyBandwidthLimiter::new(1_000_000, 10);
        assert_eq!(limiter.daily_cap(), 1_000_000);
        assert_eq!(limiter.bytes_used_today(), 0);
        assert_eq!(limiter.remaining_daily_budget(), 1_000_000);
    }

    #[test]
    fn test_can_serve() {
        let limiter = DailyBandwidthLimiter::new(1000, 10);

        assert!(limiter.can_serve(500));
        assert!(limiter.can_serve(1000));
        assert!(!limiter.can_serve(1001));
    }

    #[test]
    fn test_try_acquire_respects_daily_cap() {
        let limiter = DailyBandwidthLimiter::new(1000, 100); // High rate to not be rate-limited

        // First acquire should succeed
        let acquired = limiter.try_acquire(600);
        assert!(acquired > 0);

        // Record what we got
        let first = acquired;

        // Second acquire should be limited by remaining budget
        let remaining = 1000 - first;
        let second = limiter.try_acquire(500);

        // Total should not exceed cap
        assert!(first + second <= 1000);
    }

    #[test]
    fn test_daily_cap_enforced() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);

        // Use up the cap
        limiter.record_usage(900);
        assert_eq!(limiter.remaining_daily_budget(), 100);

        // Try to get more than remaining
        assert!(!limiter.can_serve(200));
        assert!(limiter.can_serve(100));
    }

    #[test]
    fn test_is_cap_reached() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);

        assert!(!limiter.is_cap_reached());

        limiter.record_usage(1000);
        assert!(limiter.is_cap_reached());
    }

    #[test]
    fn test_usage_percent() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);

        assert_eq!(limiter.usage_percent(), 0.0);

        limiter.record_usage(250);
        assert!((limiter.usage_percent() - 25.0).abs() < 0.1);

        limiter.record_usage(750);
        assert!((limiter.usage_percent() - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_set_daily_cap() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);

        limiter.set_daily_cap(2000);
        assert_eq!(limiter.daily_cap(), 2000);
        assert_eq!(limiter.remaining_daily_budget(), 2000);
    }

    #[test]
    fn test_reset_usage() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);

        limiter.record_usage(500);
        assert_eq!(limiter.bytes_used_today(), 500);

        limiter.reset_usage();
        assert_eq!(limiter.bytes_used_today(), 0);
    }

    #[test]
    fn test_remaining_display() {
        let limiter = DailyBandwidthLimiter::new(5_500_000_000, 100);
        assert!(limiter.remaining_display().contains("GB"));

        let limiter = DailyBandwidthLimiter::new(500_000_000, 100);
        assert!(limiter.remaining_display().contains("MB"));

        let limiter = DailyBandwidthLimiter::new(500_000, 100);
        assert!(limiter.remaining_display().contains("KB"));

        let limiter = DailyBandwidthLimiter::new(500, 100);
        assert!(limiter.remaining_display().contains("B"));
    }

    #[test]
    fn test_seconds_until_reset() {
        let limiter = DailyBandwidthLimiter::new(1000, 100);
        let secs = limiter.seconds_until_reset();

        // Should be less than a full day
        assert!(secs <= SECS_PER_DAY);
        assert!(secs > 0);
    }

    #[test]
    fn test_day_start_calculation() {
        // Test at midnight UTC
        let midnight = SECS_PER_DAY * 1000; // Day 1000 at midnight
        assert_eq!(
            DailyBandwidthLimiter::day_start_for(midnight),
            midnight
        );

        // Test at noon UTC
        let noon = SECS_PER_DAY * 1000 + 43200; // 12:00 UTC on day 1000
        assert_eq!(
            DailyBandwidthLimiter::day_start_for(noon),
            midnight
        );

        // Test just before midnight
        let before_midnight = SECS_PER_DAY * 1001 - 1; // 23:59:59 on day 1000
        assert_eq!(
            DailyBandwidthLimiter::day_start_for(before_midnight),
            midnight
        );
    }

    #[test]
    fn test_zero_cap() {
        let limiter = DailyBandwidthLimiter::new(0, 100);

        assert!(!limiter.can_serve(1));
        assert_eq!(limiter.remaining_daily_budget(), 0);
        assert!(limiter.is_cap_reached());
        assert_eq!(limiter.usage_percent(), 100.0);
    }

    #[test]
    fn test_max_cap() {
        let limiter = DailyBandwidthLimiter::new(u64::MAX, 100);

        assert!(limiter.can_serve(u64::MAX));
        assert!(!limiter.is_cap_reached());
    }

    #[test]
    fn test_concurrent_usage() {
        use std::sync::Arc;
        use std::thread;

        let limiter = Arc::new(DailyBandwidthLimiter::new(1_000_000, 1000));
        let mut handles = vec![];

        // Spawn 10 threads each recording 100KB usage
        for _ in 0..10 {
            let limiter = Arc::clone(&limiter);
            handles.push(thread::spawn(move || {
                for _ in 0..10 {
                    limiter.record_usage(10_000);
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        // Total should be 10 * 10 * 10_000 = 1_000_000
        assert_eq!(limiter.bytes_used_today(), 1_000_000);
    }
}
