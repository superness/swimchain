//! Token bucket rate limiter (SPEC_07 - Milestone 3.5)
//!
//! Implements a lock-free token bucket algorithm for bandwidth control.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Token bucket rate limiter for bandwidth control (SPEC_07 §5)
///
/// Uses atomic operations for lock-free access in multi-threaded contexts.
/// Tokens represent bytes of bandwidth that can be consumed.
pub struct TokenBucketLimiter {
    /// Maximum tokens (burst capacity = 1 second of bandwidth)
    max_tokens: u64,
    /// Current token count
    tokens: AtomicU64,
    /// Token refill rate (bytes per second)
    rate_bytes_per_sec: AtomicU64,
    /// Last refill timestamp (nanoseconds since init)
    last_refill_nanos: AtomicU64,
    /// Initialization instant for time reference
    init_instant: Instant,
}

impl TokenBucketLimiter {
    /// Create a new rate limiter with specified Mbps limit
    ///
    /// The bucket starts full (burst capacity = 1 second of bandwidth).
    #[must_use]
    pub fn new_mbps(mbps: u32) -> Self {
        let rate_bytes_per_sec = u64::from(mbps) * 125_000; // Mbps → bytes/sec
        let max_tokens = rate_bytes_per_sec; // 1 second burst capacity

        Self {
            max_tokens,
            tokens: AtomicU64::new(max_tokens),
            rate_bytes_per_sec: AtomicU64::new(rate_bytes_per_sec),
            last_refill_nanos: AtomicU64::new(0),
            init_instant: Instant::now(),
        }
    }

    /// Try to acquire tokens (bytes) for transmission
    ///
    /// Returns the number of tokens actually acquired (may be less than requested).
    /// This is a non-blocking operation.
    pub fn try_acquire(&self, requested: u64) -> u64 {
        // Refill first
        self.refill();

        // CAS loop to acquire tokens
        loop {
            let current = self.tokens.load(Ordering::Acquire);
            let acquire = requested.min(current);

            if acquire == 0 {
                return 0;
            }

            let new = current - acquire;
            match self.tokens.compare_exchange_weak(
                current,
                new,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => return acquire,
                Err(_) => continue,
            }
        }
    }

    /// Get the current available tokens without consuming any
    #[must_use]
    pub fn available(&self) -> u64 {
        self.refill();
        self.tokens.load(Ordering::Acquire)
    }

    /// Get the maximum tokens (burst capacity)
    #[must_use]
    pub fn max_tokens(&self) -> u64 {
        self.max_tokens
    }

    /// Get the current rate in bytes per second
    #[must_use]
    pub fn rate_bytes_per_sec(&self) -> u64 {
        self.rate_bytes_per_sec.load(Ordering::Relaxed)
    }

    /// Update the rate limit (Mbps)
    ///
    /// Takes effect on the next refill. Current tokens are preserved
    /// but capped at the new max_tokens if lower.
    pub fn update_rate(&self, mbps: u32) {
        let new_rate = u64::from(mbps) * 125_000;
        self.rate_bytes_per_sec.store(new_rate, Ordering::Release);

        // Cap current tokens at new rate (in case rate was reduced)
        loop {
            let current = self.tokens.load(Ordering::Acquire);
            if current <= new_rate {
                break;
            }
            match self.tokens.compare_exchange_weak(
                current,
                new_rate,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(_) => continue,
            }
        }
    }

    /// Refill tokens based on elapsed time
    fn refill(&self) {
        let rate = self.rate_bytes_per_sec.load(Ordering::Relaxed);
        if rate == 0 {
            return;
        }

        let now_nanos = self.init_instant.elapsed().as_nanos() as u64;

        loop {
            let last_refill = self.last_refill_nanos.load(Ordering::Acquire);
            let elapsed_nanos = now_nanos.saturating_sub(last_refill);

            // Calculate tokens to add (rate * elapsed_time)
            // tokens_to_add = rate_bytes_per_sec * elapsed_nanos / 1_000_000_000
            let tokens_to_add = rate.saturating_mul(elapsed_nanos) / 1_000_000_000;

            if tokens_to_add == 0 {
                return;
            }

            // Try to update last_refill timestamp
            match self.last_refill_nanos.compare_exchange_weak(
                last_refill,
                now_nanos,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => {
                    // Add tokens, capped at max
                    loop {
                        let current = self.tokens.load(Ordering::Acquire);
                        let new = (current + tokens_to_add).min(rate);
                        match self.tokens.compare_exchange_weak(
                            current,
                            new,
                            Ordering::AcqRel,
                            Ordering::Relaxed,
                        ) {
                            Ok(_) => return,
                            Err(_) => continue,
                        }
                    }
                }
                Err(_) => continue,
            }
        }
    }

    /// Reset the limiter (fills bucket to max)
    pub fn reset(&self) {
        let rate = self.rate_bytes_per_sec.load(Ordering::Relaxed);
        self.tokens.store(rate, Ordering::Release);
        let now_nanos = self.init_instant.elapsed().as_nanos() as u64;
        self.last_refill_nanos.store(now_nanos, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_limiter_initial_state() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // 10 Mbps = 1,250,000 bytes/sec
        assert_eq!(limiter.max_tokens(), 1_250_000);
        assert_eq!(limiter.rate_bytes_per_sec(), 1_250_000);
        assert_eq!(limiter.available(), 1_250_000);
    }

    #[test]
    fn test_limiter_acquire_within_burst() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Should be able to acquire up to burst capacity
        let acquired = limiter.try_acquire(1_000_000);
        assert_eq!(acquired, 1_000_000);
    }

    #[test]
    fn test_limiter_acquire_exceeds_available() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Try to acquire more than available
        let acquired = limiter.try_acquire(2_000_000);
        assert_eq!(acquired, 1_250_000); // Capped at max
    }

    #[test]
    fn test_limiter_acquire_exhausts_tokens() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Exhaust tokens - acquire all at once
        let first = limiter.try_acquire(1_250_000);
        assert_eq!(first, 1_250_000);

        // Immediately try again - may get a small amount due to refill
        // Just verify we get much less than the full burst
        let second = limiter.try_acquire(1_250_000);
        assert!(
            second < 100_000,
            "Expected much less than burst, got {}",
            second
        );
    }

    #[test]
    fn test_limiter_refill_over_time() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Exhaust tokens
        let first = limiter.try_acquire(1_250_000);
        assert_eq!(first, 1_250_000);

        // Wait 100ms for refill (should add ~125,000 bytes)
        thread::sleep(Duration::from_millis(100));

        let available = limiter.available();
        // Allow generous tolerance for timing variability in tests
        assert!(
            available >= 50_000 && available <= 200_000,
            "Expected ~125,000 bytes after 100ms, got {}",
            available
        );
    }

    #[test]
    fn test_limiter_update_rate() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Update to 20 Mbps
        limiter.update_rate(20);

        assert_eq!(limiter.rate_bytes_per_sec(), 2_500_000);
    }

    #[test]
    fn test_limiter_update_rate_caps_tokens() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Reduce to 1 Mbps
        limiter.update_rate(1);

        // Available should be capped
        let available = limiter.available();
        assert_eq!(available, 125_000);
    }

    #[test]
    fn test_limiter_concurrent_access() {
        use std::sync::Arc;

        let limiter = Arc::new(TokenBucketLimiter::new_mbps(10));
        let mut handles = vec![];

        // Spawn 10 threads each trying to acquire 100KB
        for _ in 0..10 {
            let limiter = Arc::clone(&limiter);
            handles.push(thread::spawn(move || limiter.try_acquire(100_000)));
        }

        let total_acquired: u64 = handles.into_iter().map(|h| h.join().unwrap()).sum();

        // Total acquired should not exceed max tokens
        assert!(
            total_acquired <= 1_250_000,
            "Total acquired {} exceeds max {}",
            total_acquired,
            1_250_000
        );
    }

    #[test]
    fn test_limiter_reset() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        // Exhaust tokens
        let first = limiter.try_acquire(1_250_000);
        assert_eq!(first, 1_250_000);

        // Reset and verify we have full bucket again
        limiter.reset();
        let available = limiter.available();
        // After reset, should have full bucket (may have tiny refill)
        assert!(
            available >= 1_200_000,
            "Expected full bucket after reset, got {}",
            available
        );
    }

    #[test]
    fn test_limiter_zero_request() {
        let limiter = TokenBucketLimiter::new_mbps(10);

        let acquired = limiter.try_acquire(0);
        assert_eq!(acquired, 0);
    }

    #[test]
    fn test_limiter_1mbps() {
        let limiter = TokenBucketLimiter::new_mbps(1);

        // 1 Mbps = 125,000 bytes/sec
        assert_eq!(limiter.max_tokens(), 125_000);
    }

    #[test]
    fn test_limiter_100mbps() {
        let limiter = TokenBucketLimiter::new_mbps(100);

        // 100 Mbps = 12,500,000 bytes/sec
        assert_eq!(limiter.max_tokens(), 12_500_000);
    }
}
