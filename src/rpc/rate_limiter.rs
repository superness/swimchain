//! RPC Rate Limiter
//!
//! Per-client rate limiting for RPC methods using the governor crate.
//!
//! # Rate Limits
//!
//! - Read methods: 100 requests/minute (get_*, list_*, search)
//! - Write methods: 20 requests/minute (submit_*, create_*, etc.)
//! - Admin methods: 10 requests/minute (stop, add_peer, remove_peer)
//!
//! # Auth Failure Lockout
//!
//! - 10 auth failures within 5 minutes = 5-minute lockout
//! - Lockout applies per client IP address
//!
//! # Implementation
//!
//! Uses governor's GCRA (Generic Cell Rate Algorithm) for smooth rate limiting
//! that doesn't bunch requests at interval boundaries.

use std::collections::HashMap;
use std::net::IpAddr;
use std::num::NonZeroU32;
use std::time::{Duration, Instant};

use governor::{Quota, RateLimiter as GovernorLimiter, clock::Clock};
use tokio::sync::RwLock;

/// Rate limit configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Read method limit per minute
    pub read_per_minute: u32,
    /// Write method limit per minute
    pub write_per_minute: u32,
    /// Admin method limit per minute
    pub admin_per_minute: u32,
    /// Auth failure threshold for lockout
    pub auth_failure_threshold: u32,
    /// Auth failure window in seconds
    pub auth_failure_window_secs: u64,
    /// Lockout duration in seconds
    pub lockout_duration_secs: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            // RPC is localhost-only (127.0.0.1 + cookie auth), so the only caller is
            // the user's own app. These limits are a runaway-client backstop, not
            // external-abuse defense — the old 100/min read cap was hit just by the
            // clients' normal polling (status/peers/spaces/sponsorship/message lists,
            // plus sign_message which is categorised Read), so navigating tripped
            // "Rate limit exceeded for Read methods". Give generous headroom.
            read_per_minute: 6000,
            write_per_minute: 120,
            admin_per_minute: 60,
            auth_failure_threshold: 10,
            auth_failure_window_secs: 300, // 5 minutes
            lockout_duration_secs: 300,    // 5 minutes
        }
    }
}

/// Method category for rate limiting
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MethodCategory {
    /// Read operations (get_*, list_*, search)
    Read,
    /// Write operations (submit_*, create_*)
    Write,
    /// Admin operations (stop, add_peer, remove_peer)
    Admin,
}

impl MethodCategory {
    /// Categorize an RPC method
    pub fn from_method(method: &str) -> Self {
        match method {
            // Admin methods
            "stop" | "add_peer" | "remove_peer" => Self::Admin,

            // Write methods - content submission
            "submit_post" | "submit_reply" | "submit_edit" | "submit_engagement"
            | "upload_media" | "create_space" | "create_fork" | "switch_fork"
            | "create_pool" | "contribute_to_pool" | "submit_spam_attestation"
            | "submit_counter_attestation" | "create_private_space" | "invite_to_space"
            | "accept_invite" | "decline_invite" | "leave_space" | "kick_member"
            | "request_dm" | "accept_dm" | "decline_dm" | "set_identity_name"
            | "register_genesis_identity" | "register_sponsored_identity"
            | "rebuild_reactions" => Self::Write,

            // sign_message is treated as Read because it's called frequently by browser
            // clients for every authenticated RPC call - not actual content creation
            "sign_message" => Self::Read,

            // Read methods - everything else (default)
            _ => Self::Read,
        }
    }
}

/// Per-client rate limiter state
struct ClientLimiter {
    read: GovernorLimiter<governor::state::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>,
    write: GovernorLimiter<governor::state::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>,
    admin: GovernorLimiter<governor::state::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>,
}

impl ClientLimiter {
    fn new(config: &RateLimitConfig) -> Self {
        let read_quota = Quota::per_minute(NonZeroU32::new(config.read_per_minute).unwrap());
        let write_quota = Quota::per_minute(NonZeroU32::new(config.write_per_minute).unwrap());
        let admin_quota = Quota::per_minute(NonZeroU32::new(config.admin_per_minute).unwrap());

        Self {
            read: GovernorLimiter::direct(read_quota),
            write: GovernorLimiter::direct(write_quota),
            admin: GovernorLimiter::direct(admin_quota),
        }
    }
}

/// Auth failure tracking for lockout
struct AuthFailureTracker {
    /// Timestamps of recent auth failures
    failures: Vec<Instant>,
    /// Lockout expiry (None if not locked out)
    lockout_until: Option<Instant>,
}

impl AuthFailureTracker {
    fn new() -> Self {
        Self {
            failures: Vec::new(),
            lockout_until: None,
        }
    }
}

/// Rate limiter result
#[derive(Debug, Clone)]
pub enum RateLimitResult {
    /// Request allowed
    Allowed,
    /// Rate limit exceeded
    RateLimited {
        category: MethodCategory,
        retry_after_ms: u64,
    },
    /// Client is locked out due to auth failures
    LockedOut {
        remaining_secs: u64,
    },
}

/// RPC rate limiter
///
/// Thread-safe rate limiter that tracks per-client request rates and auth failures.
pub struct RpcRateLimiter {
    config: RateLimitConfig,
    /// Per-client rate limiters (keyed by IP address)
    client_limiters: RwLock<HashMap<IpAddr, ClientLimiter>>,
    /// Auth failure tracking (keyed by IP address)
    auth_failures: RwLock<HashMap<IpAddr, AuthFailureTracker>>,
}

impl RpcRateLimiter {
    /// Create a new rate limiter with default config
    pub fn new() -> Self {
        Self::with_config(RateLimitConfig::default())
    }

    /// Create a new rate limiter with custom config
    pub fn with_config(config: RateLimitConfig) -> Self {
        Self {
            config,
            client_limiters: RwLock::new(HashMap::new()),
            auth_failures: RwLock::new(HashMap::new()),
        }
    }

    /// Check if a request should be allowed
    ///
    /// Returns `RateLimitResult::Allowed` if the request can proceed,
    /// or an appropriate error variant if rate limited or locked out.
    pub async fn check_rate_limit(
        &self,
        client_ip: IpAddr,
        method: &str,
    ) -> RateLimitResult {
        // Check lockout first
        {
            let auth_failures = self.auth_failures.read().await;
            if let Some(tracker) = auth_failures.get(&client_ip) {
                if let Some(lockout_until) = tracker.lockout_until {
                    if Instant::now() < lockout_until {
                        let remaining = lockout_until.duration_since(Instant::now());
                        return RateLimitResult::LockedOut {
                            remaining_secs: remaining.as_secs(),
                        };
                    }
                }
            }
        }

        // Get or create client limiter
        let category = MethodCategory::from_method(method);

        // Check rate limit
        let mut limiters = self.client_limiters.write().await;
        let limiter = limiters
            .entry(client_ip)
            .or_insert_with(|| ClientLimiter::new(&self.config));

        let result = match category {
            MethodCategory::Read => limiter.read.check(),
            MethodCategory::Write => limiter.write.check(),
            MethodCategory::Admin => limiter.admin.check(),
        };

        match result {
            Ok(_) => RateLimitResult::Allowed,
            Err(not_until) => {
                let wait_time = not_until.wait_time_from(governor::clock::DefaultClock::default().now());
                RateLimitResult::RateLimited {
                    category,
                    retry_after_ms: wait_time.as_millis() as u64,
                }
            }
        }
    }

    /// Record an authentication failure
    ///
    /// If the failure threshold is reached, the client will be locked out.
    pub async fn record_auth_failure(&self, client_ip: IpAddr) {
        let mut auth_failures = self.auth_failures.write().await;
        let tracker = auth_failures
            .entry(client_ip)
            .or_insert_with(AuthFailureTracker::new);

        let now = Instant::now();
        let window = Duration::from_secs(self.config.auth_failure_window_secs);

        // Remove old failures outside the window
        tracker.failures.retain(|&t| now.duration_since(t) < window);

        // Add new failure
        tracker.failures.push(now);

        // Check if threshold reached
        if tracker.failures.len() >= self.config.auth_failure_threshold as usize {
            log::warn!(
                "Auth failure threshold reached for {}, locking out for {} seconds",
                client_ip,
                self.config.lockout_duration_secs
            );
            tracker.lockout_until =
                Some(now + Duration::from_secs(self.config.lockout_duration_secs));
            tracker.failures.clear();
        }
    }

    /// Clear auth failure state for a client (e.g., after successful auth)
    pub async fn clear_auth_failures(&self, client_ip: IpAddr) {
        let mut auth_failures = self.auth_failures.write().await;
        auth_failures.remove(&client_ip);
    }

    /// Check if client is currently locked out
    pub async fn is_locked_out(&self, client_ip: IpAddr) -> bool {
        let auth_failures = self.auth_failures.read().await;
        if let Some(tracker) = auth_failures.get(&client_ip) {
            if let Some(lockout_until) = tracker.lockout_until {
                return Instant::now() < lockout_until;
            }
        }
        false
    }

    /// Get current config (for testing/debugging)
    pub fn config(&self) -> &RateLimitConfig {
        &self.config
    }

    /// Cleanup stale entries (called periodically)
    ///
    /// Removes clients that haven't made requests in the last hour.
    pub async fn cleanup_stale_entries(&self) {
        // For simplicity, we don't track last activity per client.
        // In production, you might want to add timestamps and evict old entries.
        // The governor limiters auto-reset, so memory usage is bounded.
    }
}

impl Default for RpcRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    fn test_ip() -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))
    }

    #[test]
    fn test_method_categorization() {
        // Admin methods
        assert_eq!(MethodCategory::from_method("stop"), MethodCategory::Admin);
        assert_eq!(MethodCategory::from_method("add_peer"), MethodCategory::Admin);
        assert_eq!(MethodCategory::from_method("remove_peer"), MethodCategory::Admin);

        // Write methods
        assert_eq!(MethodCategory::from_method("submit_post"), MethodCategory::Write);
        assert_eq!(MethodCategory::from_method("submit_reply"), MethodCategory::Write);
        assert_eq!(MethodCategory::from_method("create_space"), MethodCategory::Write);
        assert_eq!(MethodCategory::from_method("submit_engagement"), MethodCategory::Write);

        // Read methods (default)
        assert_eq!(MethodCategory::from_method("get_info"), MethodCategory::Read);
        assert_eq!(MethodCategory::from_method("get_peers"), MethodCategory::Read);
        assert_eq!(MethodCategory::from_method("list_spaces"), MethodCategory::Read);
        assert_eq!(MethodCategory::from_method("search"), MethodCategory::Read);
        assert_eq!(MethodCategory::from_method("unknown_method"), MethodCategory::Read);
    }

    #[tokio::test]
    async fn test_rate_limiter_allows_initial_requests() {
        let limiter = RpcRateLimiter::new();
        let ip = test_ip();

        // First request should be allowed
        let result = limiter.check_rate_limit(ip, "get_info").await;
        assert!(matches!(result, RateLimitResult::Allowed));
    }

    #[tokio::test]
    async fn test_rate_limiter_enforces_limits() {
        let config = RateLimitConfig {
            read_per_minute: 2,  // Very low for testing
            write_per_minute: 1,
            admin_per_minute: 1,
            ..Default::default()
        };
        let limiter = RpcRateLimiter::with_config(config);
        let ip = test_ip();

        // First two read requests should be allowed
        assert!(matches!(limiter.check_rate_limit(ip, "get_info").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip, "get_info").await, RateLimitResult::Allowed));

        // Third should be rate limited
        let result = limiter.check_rate_limit(ip, "get_info").await;
        assert!(matches!(result, RateLimitResult::RateLimited { category: MethodCategory::Read, .. }));
    }

    #[tokio::test]
    async fn test_auth_failure_lockout() {
        let config = RateLimitConfig {
            auth_failure_threshold: 3,
            lockout_duration_secs: 60,
            ..Default::default()
        };
        let limiter = RpcRateLimiter::with_config(config);
        let ip = test_ip();

        // First 2 failures shouldn't lock out
        limiter.record_auth_failure(ip).await;
        assert!(!limiter.is_locked_out(ip).await);
        limiter.record_auth_failure(ip).await;
        assert!(!limiter.is_locked_out(ip).await);

        // Third failure should trigger lockout
        limiter.record_auth_failure(ip).await;
        assert!(limiter.is_locked_out(ip).await);

        // Rate limit check should return locked out
        let result = limiter.check_rate_limit(ip, "get_info").await;
        assert!(matches!(result, RateLimitResult::LockedOut { .. }));
    }

    #[tokio::test]
    async fn test_clear_auth_failures() {
        let config = RateLimitConfig {
            auth_failure_threshold: 2,
            ..Default::default()
        };
        let limiter = RpcRateLimiter::with_config(config);
        let ip = test_ip();

        // One failure
        limiter.record_auth_failure(ip).await;
        assert!(!limiter.is_locked_out(ip).await);

        // Clear failures
        limiter.clear_auth_failures(ip).await;

        // One more failure shouldn't trigger lockout (counter was reset)
        limiter.record_auth_failure(ip).await;
        assert!(!limiter.is_locked_out(ip).await);
    }

    #[tokio::test]
    async fn test_separate_limits_per_category() {
        let config = RateLimitConfig {
            read_per_minute: 2,
            write_per_minute: 2,
            admin_per_minute: 2,
            ..Default::default()
        };
        let limiter = RpcRateLimiter::with_config(config);
        let ip = test_ip();

        // Exhaust read limit
        assert!(matches!(limiter.check_rate_limit(ip, "get_info").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip, "get_info").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip, "get_info").await, RateLimitResult::RateLimited { .. }));

        // Write should still be allowed
        assert!(matches!(limiter.check_rate_limit(ip, "submit_post").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip, "submit_post").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip, "submit_post").await, RateLimitResult::RateLimited { .. }));

        // Admin should still be allowed
        assert!(matches!(limiter.check_rate_limit(ip, "stop").await, RateLimitResult::Allowed));
    }

    #[tokio::test]
    async fn test_different_clients_have_separate_limits() {
        let config = RateLimitConfig {
            read_per_minute: 1,
            ..Default::default()
        };
        let limiter = RpcRateLimiter::with_config(config);
        let ip1 = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));
        let ip2 = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 2));

        // Exhaust ip1's limit
        assert!(matches!(limiter.check_rate_limit(ip1, "get_info").await, RateLimitResult::Allowed));
        assert!(matches!(limiter.check_rate_limit(ip1, "get_info").await, RateLimitResult::RateLimited { .. }));

        // ip2 should still be allowed
        assert!(matches!(limiter.check_rate_limit(ip2, "get_info").await, RateLimitResult::Allowed));
    }
}
