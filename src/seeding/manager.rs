//! Seeding manager (SPEC_07 - Milestone 3.5)
//!
//! Coordinates seeding configuration, rate limiting, and statistics.

use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::blob::ContentBlobHash;
use crate::types::content::SpaceId;
use crate::types::identity::IdentityId;

use super::config::{ConfigError, MobileConfig, SeedingConfig};
use super::rate_limiter::TokenBucketLimiter;
use super::statistics::{SeedingStatistics, StatisticsSnapshot};

/// Network state provider callback (for WiFi-only mode)
///
/// Returns true if on WiFi or unrestricted network, false if on cellular.
pub type NetworkStateProvider = Arc<dyn Fn() -> bool + Send + Sync>;

/// Seeding manager (SPEC_07 §5-6)
///
/// Coordinates all seeding-related functionality:
/// - Configuration management
/// - Bandwidth rate limiting
/// - Statistics tracking
/// - Mobile constraints (WiFi-only mode)
pub struct SeedingManager {
    config: RwLock<SeedingConfig>,
    rate_limiter: TokenBucketLimiter,
    statistics: SeedingStatistics,
    mobile_config: RwLock<Option<MobileConfig>>,
    network_state_provider: RwLock<Option<NetworkStateProvider>>,
    current_user: IdentityId,
}

impl SeedingManager {
    /// Create a new seeding manager
    #[must_use]
    pub fn new(config: SeedingConfig, current_user: IdentityId) -> Self {
        let bandwidth = config.bandwidth_limit_mbps;

        Self {
            config: RwLock::new(config),
            rate_limiter: TokenBucketLimiter::new_mbps(bandwidth),
            statistics: SeedingStatistics::new(),
            mobile_config: RwLock::new(None),
            network_state_provider: RwLock::new(None),
            current_user,
        }
    }

    /// Create with default configuration
    #[must_use]
    pub fn with_defaults(current_user: IdentityId) -> Self {
        Self::new(SeedingConfig::default(), current_user)
    }

    /// Set mobile configuration
    pub fn set_mobile_config(&self, config: MobileConfig) {
        if let Ok(mut mc) = self.mobile_config.write() {
            *mc = Some(config);
        }
    }

    /// Clear mobile configuration
    pub fn clear_mobile_config(&self) {
        if let Ok(mut mc) = self.mobile_config.write() {
            *mc = None;
        }
    }

    /// Set network state provider for WiFi-only mode
    pub fn set_network_state_provider(&self, provider: NetworkStateProvider) {
        if let Ok(mut nsp) = self.network_state_provider.write() {
            *nsp = Some(provider);
        }
    }

    /// Check if content should be seeded based on configuration
    ///
    /// Takes into account:
    /// - Seeding enabled/disabled
    /// - WiFi-only mode (mobile)
    /// - Own content override
    /// - Space filter
    /// - Duration for viewed content
    #[must_use]
    pub fn should_seed(
        &self,
        _hash: &ContentBlobHash,
        space_id: SpaceId,
        owner_id: IdentityId,
        created_at: u64,
    ) -> bool {
        let config = match self.config.read() {
            Ok(c) => c,
            Err(_) => return false,
        };

        // 1. Check enabled
        if !config.enabled {
            return false;
        }

        // 2. Check WiFi-only for mobile
        if let Ok(mobile) = self.mobile_config.read() {
            if let Some(ref mc) = *mobile {
                if mc.serve_on_wifi_only {
                    if let Ok(provider) = self.network_state_provider.read() {
                        if let Some(ref is_on_wifi) = *provider {
                            if !is_on_wifi() {
                                return false;
                            }
                        }
                    }
                }
            }
        }

        // 3. Own content override
        if owner_id == self.current_user {
            return config.seed_own_content;
        }

        // 4. Space filter (empty = all spaces)
        if !config.spaces.is_empty() && !config.spaces.contains(&space_id) {
            return false;
        }

        // 5. Duration check for viewed content
        if config.seed_viewed_content {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let max_age_secs = u64::from(config.seed_duration_hours) * 3600;
            return now.saturating_sub(created_at) <= max_age_secs;
        }

        false
    }

    /// Try to acquire bandwidth for transmission
    ///
    /// Returns the number of bytes that can be transmitted (may be less than requested).
    pub fn try_acquire_bandwidth(&self, requested: u64) -> u64 {
        self.rate_limiter.try_acquire(requested)
    }

    /// Record that content was served
    pub fn record_served(&self, bytes: u64, space_id: SpaceId) {
        self.statistics.record_upload(bytes, space_id);
    }

    /// Record that a request was denied (rate limited)
    pub fn record_denied(&self) {
        self.statistics.record_denied();
    }

    /// Get current configuration
    #[must_use]
    pub fn config(&self) -> SeedingConfig {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// Update configuration
    ///
    /// # Errors
    ///
    /// Returns error if new configuration is invalid or lock is poisoned.
    pub fn update_config(&self, new_config: SeedingConfig) -> Result<(), ConfigError> {
        new_config.validate()?;

        // Get old bandwidth for rate limiter update check
        let old_bandwidth = self
            .config
            .read()
            .map(|c| c.bandwidth_limit_mbps)
            .unwrap_or(10);

        let new_bandwidth = new_config.bandwidth_limit_mbps;

        // Write config first - only update rate limiter if config write succeeds
        match self.config.write() {
            Ok(mut config) => {
                *config = new_config;
            }
            Err(_) => {
                return Err(ConfigError::LockPoisoned {
                    context: "config write lock",
                });
            }
        }

        // Update rate limiter after successful config write
        if new_bandwidth != old_bandwidth {
            self.rate_limiter.update_rate(new_bandwidth);
        }

        Ok(())
    }

    /// Get current user identity
    #[must_use]
    pub fn current_user(&self) -> IdentityId {
        self.current_user
    }

    /// Get statistics reference
    #[must_use]
    pub fn statistics(&self) -> &SeedingStatistics {
        &self.statistics
    }

    /// Get statistics snapshot
    #[must_use]
    pub fn statistics_snapshot(&self) -> StatisticsSnapshot {
        self.statistics.snapshot()
    }

    /// Get rate limiter available bandwidth
    #[must_use]
    pub fn available_bandwidth(&self) -> u64 {
        self.rate_limiter.available()
    }

    /// Reset statistics
    pub fn reset_statistics(&self) {
        self.statistics.reset();
    }

    /// Check if seeding is currently enabled
    #[must_use]
    pub fn is_enabled(&self) -> bool {
        self.config.read().map(|c| c.enabled).unwrap_or(false)
    }

    /// Enable seeding
    pub fn enable(&self) {
        if let Ok(mut config) = self.config.write() {
            config.enabled = true;
        }
    }

    /// Disable seeding
    pub fn disable(&self) {
        if let Ok(mut config) = self.config.write() {
            config.enabled = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_manager() -> SeedingManager {
        let user = IdentityId::from_bytes([1u8; 32]);
        SeedingManager::with_defaults(user)
    }

    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    #[test]
    fn test_manager_creation() {
        let manager = make_manager();

        assert!(manager.is_enabled());
        assert_eq!(manager.current_user(), IdentityId::from_bytes([1u8; 32]));
    }

    #[test]
    fn test_should_seed_disabled() {
        let manager = make_manager();
        manager.disable();

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let space = SpaceId::from_bytes([2u8; 32]);
        let owner = IdentityId::from_bytes([3u8; 32]);

        assert!(!manager.should_seed(&hash, space, owner, current_timestamp()));
    }

    #[test]
    fn test_should_seed_own_content() {
        let manager = make_manager();

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let space = SpaceId::from_bytes([2u8; 32]);
        let owner = IdentityId::from_bytes([1u8; 32]); // Same as current user

        // Own content should be seeded regardless of age
        let old_timestamp = current_timestamp().saturating_sub(365 * 24 * 3600);
        assert!(manager.should_seed(&hash, space, owner, old_timestamp));
    }

    #[test]
    fn test_should_seed_own_content_disabled() {
        let manager = make_manager();

        // Disable own content seeding
        if let Ok(mut config) = manager.config.write() {
            config.seed_own_content = false;
        }

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let space = SpaceId::from_bytes([2u8; 32]);
        let owner = IdentityId::from_bytes([1u8; 32]);

        assert!(!manager.should_seed(&hash, space, owner, current_timestamp()));
    }

    #[test]
    fn test_should_seed_space_filter() {
        let manager = make_manager();

        // Add space filter
        let allowed_space = SpaceId::from_bytes([10u8; 32]);
        if let Ok(mut config) = manager.config.write() {
            config.spaces.push(allowed_space);
        }

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let other_owner = IdentityId::from_bytes([3u8; 32]);
        let disallowed_space = SpaceId::from_bytes([20u8; 32]);

        // Content from allowed space should be seeded
        assert!(manager.should_seed(&hash, allowed_space, other_owner, current_timestamp()));

        // Content from other space should not be seeded
        assert!(!manager.should_seed(&hash, disallowed_space, other_owner, current_timestamp()));
    }

    #[test]
    fn test_should_seed_duration_expired() {
        let manager = make_manager();

        // Set short duration
        if let Ok(mut config) = manager.config.write() {
            config.seed_duration_hours = 24; // 24 hours
        }

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let space = SpaceId::from_bytes([2u8; 32]);
        let other_owner = IdentityId::from_bytes([3u8; 32]);

        // Content 48 hours old should not be seeded
        let old_timestamp = current_timestamp().saturating_sub(48 * 3600);
        assert!(!manager.should_seed(&hash, space, other_owner, old_timestamp));

        // Recent content should be seeded
        assert!(manager.should_seed(&hash, space, other_owner, current_timestamp()));
    }

    #[test]
    fn test_should_seed_wifi_only() {
        let manager = make_manager();

        // Set mobile config with WiFi-only
        manager.set_mobile_config(MobileConfig::wifi_only());

        // Set network state provider that returns false (cellular)
        manager.set_network_state_provider(Arc::new(|| false));

        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let space = SpaceId::from_bytes([2u8; 32]);
        let owner = IdentityId::from_bytes([3u8; 32]);

        // Should not seed on cellular
        assert!(!manager.should_seed(&hash, space, owner, current_timestamp()));

        // Update to WiFi
        manager.set_network_state_provider(Arc::new(|| true));
        assert!(manager.should_seed(&hash, space, owner, current_timestamp()));
    }

    #[test]
    fn test_bandwidth_limiting() {
        let manager = make_manager();

        // Default is 10 Mbps = 1,250,000 bytes/sec burst
        let acquired = manager.try_acquire_bandwidth(1_000_000);
        assert_eq!(acquired, 1_000_000);

        // Available should decrease (may have slight refill)
        let available = manager.available_bandwidth();
        assert!(
            available <= 300_000,
            "Expected around 250,000 remaining, got {}",
            available
        );
    }

    #[test]
    fn test_record_served() {
        let manager = make_manager();
        let space = SpaceId::from_bytes([1u8; 32]);

        manager.record_served(1000, space);
        manager.record_served(2000, space);

        let snapshot = manager.statistics_snapshot();
        assert_eq!(snapshot.bytes_uploaded, 3000);
        assert_eq!(snapshot.requests_served, 2);
    }

    #[test]
    fn test_update_config() {
        let manager = make_manager();

        let mut new_config = manager.config();
        new_config.bandwidth_limit_mbps = 50;
        new_config.seed_duration_hours = 48;

        manager.update_config(new_config.clone()).unwrap();

        let current = manager.config();
        assert_eq!(current.bandwidth_limit_mbps, 50);
        assert_eq!(current.seed_duration_hours, 48);
    }

    #[test]
    fn test_update_config_invalid() {
        let manager = make_manager();

        let mut new_config = manager.config();
        new_config.bandwidth_limit_mbps = 0; // Invalid

        let result = manager.update_config(new_config);
        assert!(result.is_err());
    }

    #[test]
    fn test_enable_disable() {
        let manager = make_manager();

        assert!(manager.is_enabled());

        manager.disable();
        assert!(!manager.is_enabled());

        manager.enable();
        assert!(manager.is_enabled());
    }

    #[test]
    fn test_reset_statistics() {
        let manager = make_manager();
        let space = SpaceId::from_bytes([1u8; 32]);

        manager.record_served(1000, space);
        assert_eq!(manager.statistics_snapshot().bytes_uploaded, 1000);

        manager.reset_statistics();
        assert_eq!(manager.statistics_snapshot().bytes_uploaded, 0);
    }
}
