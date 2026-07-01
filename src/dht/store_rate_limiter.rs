//! STORE Rate Limiter (H-DHT-1)
//!
//! Prevents abuse of the DHT STORE mechanism by:
//! 1. Rate limiting STORE requests per sender (requests/minute)
//! 2. Limiting total provider records per sender

use std::collections::HashMap;
use std::time::{Duration, Instant};

use super::constants::{MAX_PROVIDERS_PER_SENDER, MAX_STORES_PER_SENDER_PER_MIN, STORE_RATE_LIMITER_CLEANUP_SECS};
use super::node_id::NodeId;

/// Tracks STORE request rate per sender
#[derive(Debug)]
struct SenderRateEntry {
    /// Timestamps of recent STORE requests (within the last minute)
    request_times: Vec<Instant>,
    /// Total provider records this sender has stored
    provider_count: usize,
}

impl SenderRateEntry {
    fn new() -> Self {
        Self {
            request_times: Vec::new(),
            provider_count: 0,
        }
    }

    /// Prune requests older than 1 minute
    fn prune_old_requests(&mut self, now: Instant) {
        let cutoff = now - Duration::from_secs(60);
        self.request_times.retain(|t| *t > cutoff);
    }

    /// Check if a new request would exceed the rate limit
    fn can_request(&mut self, now: Instant, limit_per_min: u32) -> bool {
        self.prune_old_requests(now);
        (self.request_times.len() as u32) < limit_per_min
    }

    /// Record a new request
    fn record_request(&mut self, now: Instant) {
        self.request_times.push(now);
    }
}

/// Rate limiter for DHT STORE requests
///
/// Tracks per-sender request rates and provider counts to prevent
/// malicious flooding of the DHT with fake provider records.
#[derive(Debug)]
pub struct StoreRateLimiter {
    /// Per-sender rate tracking
    senders: HashMap<NodeId, SenderRateEntry>,
    /// Last cleanup time
    last_cleanup: Instant,
    /// Maximum requests per minute per sender
    max_per_min: u32,
    /// Maximum providers per sender
    max_providers: usize,
}

impl StoreRateLimiter {
    /// Create a new rate limiter with default limits
    pub fn new() -> Self {
        Self {
            senders: HashMap::new(),
            last_cleanup: Instant::now(),
            max_per_min: MAX_STORES_PER_SENDER_PER_MIN,
            max_providers: MAX_PROVIDERS_PER_SENDER,
        }
    }

    /// Create a rate limiter with custom limits (for testing)
    #[cfg(test)]
    pub fn with_limits(max_per_min: u32, max_providers: usize) -> Self {
        Self {
            senders: HashMap::new(),
            last_cleanup: Instant::now(),
            max_per_min,
            max_providers,
        }
    }

    /// Check if a STORE request from this sender should be allowed
    ///
    /// Returns Ok(()) if allowed, or an error describing why not.
    pub fn check_store_allowed(&mut self, sender: &NodeId) -> StoreCheckResult {
        let now = Instant::now();

        // Periodic cleanup of stale entries
        self.maybe_cleanup(now);

        let entry = self.senders.entry(*sender).or_insert_with(SenderRateEntry::new);

        // Check rate limit
        if !entry.can_request(now, self.max_per_min) {
            return StoreCheckResult::RateLimited {
                limit_per_min: self.max_per_min,
            };
        }

        // Check provider count limit
        if entry.provider_count >= self.max_providers {
            return StoreCheckResult::ProviderLimitExceeded {
                limit: self.max_providers,
            };
        }

        StoreCheckResult::Allowed
    }

    /// Record that a STORE was accepted from this sender
    ///
    /// Call this after successfully storing a provider record.
    pub fn record_store(&mut self, sender: &NodeId, is_new_provider: bool) {
        let now = Instant::now();
        let entry = self.senders.entry(*sender).or_insert_with(SenderRateEntry::new);
        entry.record_request(now);
        if is_new_provider {
            entry.provider_count = entry.provider_count.saturating_add(1);
        }
    }

    /// Decrement provider count when a provider record is removed
    pub fn provider_removed(&mut self, sender: &NodeId) {
        if let Some(entry) = self.senders.get_mut(sender) {
            entry.provider_count = entry.provider_count.saturating_sub(1);
        }
    }

    /// Get the current provider count for a sender
    pub fn provider_count(&self, sender: &NodeId) -> usize {
        self.senders.get(sender).map_or(0, |e| e.provider_count)
    }

    /// Get the current request count (in the last minute) for a sender
    pub fn request_count(&self, sender: &NodeId) -> usize {
        self.senders.get(sender).map_or(0, |e| e.request_times.len())
    }

    /// Clean up entries for senders with no recent activity
    fn maybe_cleanup(&mut self, now: Instant) {
        let cleanup_interval = Duration::from_secs(STORE_RATE_LIMITER_CLEANUP_SECS);
        if now.duration_since(self.last_cleanup) < cleanup_interval {
            return;
        }

        self.last_cleanup = now;
        let cutoff = now - Duration::from_secs(60);

        // Remove senders with no recent requests and no providers
        self.senders.retain(|_, entry| {
            entry.prune_old_requests(now);
            !entry.request_times.is_empty() || entry.provider_count > 0
        });
    }

    /// Force cleanup (for testing)
    #[cfg(test)]
    pub fn force_cleanup(&mut self) {
        let now = Instant::now();
        self.last_cleanup = now - Duration::from_secs(STORE_RATE_LIMITER_CLEANUP_SECS + 1);
        self.maybe_cleanup(now);
    }

    /// Get the number of tracked senders
    pub fn sender_count(&self) -> usize {
        self.senders.len()
    }
}

impl Default for StoreRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of checking if a STORE is allowed
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreCheckResult {
    /// STORE is allowed
    Allowed,
    /// Rate limited (too many requests per minute)
    RateLimited { limit_per_min: u32 },
    /// Provider limit exceeded
    ProviderLimitExceeded { limit: usize },
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    fn make_id(byte: u8) -> NodeId {
        NodeId::from_bytes([byte; 32])
    }

    #[test]
    fn test_store_allowed_initially() {
        let mut limiter = StoreRateLimiter::new();
        let sender = make_id(1);

        let result = limiter.check_store_allowed(&sender);
        assert_eq!(result, StoreCheckResult::Allowed);
    }

    #[test]
    fn test_rate_limit_enforced() {
        let mut limiter = StoreRateLimiter::with_limits(3, 100);
        let sender = make_id(1);

        // First 3 requests allowed
        for _ in 0..3 {
            assert_eq!(limiter.check_store_allowed(&sender), StoreCheckResult::Allowed);
            limiter.record_store(&sender, true);
        }

        // 4th request rate limited
        assert_eq!(
            limiter.check_store_allowed(&sender),
            StoreCheckResult::RateLimited { limit_per_min: 3 }
        );
    }

    #[test]
    fn test_provider_limit_enforced() {
        let mut limiter = StoreRateLimiter::with_limits(1000, 5);
        let sender = make_id(1);

        // Record 5 providers
        for _ in 0..5 {
            assert_eq!(limiter.check_store_allowed(&sender), StoreCheckResult::Allowed);
            limiter.record_store(&sender, true);
        }

        // 6th provider exceeds limit
        assert_eq!(
            limiter.check_store_allowed(&sender),
            StoreCheckResult::ProviderLimitExceeded { limit: 5 }
        );
    }

    #[test]
    fn test_refresh_doesnt_increment_provider_count() {
        let mut limiter = StoreRateLimiter::with_limits(1000, 5);
        let sender = make_id(1);

        // Add 4 providers
        for _ in 0..4 {
            limiter.record_store(&sender, true);
        }
        assert_eq!(limiter.provider_count(&sender), 4);

        // Refresh (is_new_provider = false) doesn't increment
        limiter.record_store(&sender, false);
        assert_eq!(limiter.provider_count(&sender), 4);
    }

    #[test]
    fn test_provider_removed_decrements_count() {
        let mut limiter = StoreRateLimiter::with_limits(1000, 100);
        let sender = make_id(1);

        limiter.record_store(&sender, true);
        limiter.record_store(&sender, true);
        assert_eq!(limiter.provider_count(&sender), 2);

        limiter.provider_removed(&sender);
        assert_eq!(limiter.provider_count(&sender), 1);
    }

    #[test]
    fn test_different_senders_independent() {
        let mut limiter = StoreRateLimiter::with_limits(2, 100);
        let sender1 = make_id(1);
        let sender2 = make_id(2);

        // Sender 1 uses their quota
        limiter.record_store(&sender1, true);
        limiter.record_store(&sender1, true);
        assert_eq!(
            limiter.check_store_allowed(&sender1),
            StoreCheckResult::RateLimited { limit_per_min: 2 }
        );

        // Sender 2 still has quota
        assert_eq!(limiter.check_store_allowed(&sender2), StoreCheckResult::Allowed);
    }

    #[test]
    fn test_cleanup_removes_inactive_senders() {
        let mut limiter = StoreRateLimiter::with_limits(100, 100);
        let sender = make_id(1);

        limiter.record_store(&sender, false); // Record request but no provider
        assert_eq!(limiter.sender_count(), 1);

        // Force cleanup - sender with no providers and stale requests should be removed
        // (In practice, we can't easily test time-based cleanup without mocking time,
        // but we can verify the structure is correct)
        limiter.force_cleanup();
        // Sender still tracked because request_times is recent
        assert_eq!(limiter.sender_count(), 1);
    }

    #[test]
    fn test_request_count() {
        let mut limiter = StoreRateLimiter::with_limits(100, 100);
        let sender = make_id(1);

        assert_eq!(limiter.request_count(&sender), 0);

        limiter.record_store(&sender, true);
        limiter.record_store(&sender, true);
        assert_eq!(limiter.request_count(&sender), 2);
    }
}
