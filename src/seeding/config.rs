//! Seeding configuration (SPEC_07 - Milestone 3.5)
//!
//! Defines configuration structures for content seeding behavior.

use serde::{Deserialize, Serialize};

use crate::types::constants::{
    SEEDING_DEFAULT_BANDWIDTH_MBPS, SEEDING_DEFAULT_DURATION_HOURS, SEEDING_DEFAULT_STORAGE_GB,
    SEEDING_MAX_BANDWIDTH_MBPS, SEEDING_MAX_DURATION_HOURS, SEEDING_MAX_STORAGE_GB,
    SEEDING_MIN_BANDWIDTH_MBPS, SEEDING_MIN_DURATION_HOURS,
};
use crate::types::content::SpaceId;

/// Seeding operation mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeedingMode {
    /// Seeding disabled
    Disabled,
    /// Only seed own content
    OwnContent,
    /// Seed own + recently viewed content
    ViewedContent,
    /// Seed all content in specified spaces
    FullSpace,
}

impl Default for SeedingMode {
    fn default() -> Self {
        SeedingMode::ViewedContent
    }
}

/// Configuration error
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ConfigError {
    /// Bandwidth limit out of range
    #[error("bandwidth must be {min}-{max} Mbps, got {value}")]
    InvalidBandwidth {
        /// Minimum allowed value
        min: u32,
        /// Maximum allowed value
        max: u32,
        /// Actual value provided
        value: u32,
    },

    /// Storage limit out of range
    #[error("storage must be 1-{max} GB, got {value}")]
    InvalidStorage {
        /// Maximum allowed value
        max: u32,
        /// Actual value provided
        value: u32,
    },

    /// Duration out of range
    #[error("duration must be {min}-{max} hours, got {value}")]
    InvalidDuration {
        /// Minimum allowed value
        min: u32,
        /// Maximum allowed value
        max: u32,
        /// Actual value provided
        value: u32,
    },

    /// Lock poisoned (internal error)
    #[error("internal lock poisoned: {context}")]
    LockPoisoned {
        /// Context describing which lock failed
        context: &'static str,
    },
}

/// Seeding configuration (SPEC_07 §5)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedingConfig {
    /// Whether seeding is enabled
    pub enabled: bool,
    /// Space IDs to seed (empty = all spaces)
    pub spaces: Vec<SpaceId>,
    /// Bandwidth limit in Mbps (1-100)
    pub bandwidth_limit_mbps: u32,
    /// Storage limit in GB (1-1000)
    pub storage_limit_gb: u32,
    /// Seed own content regardless of duration
    pub seed_own_content: bool,
    /// Seed recently viewed content
    pub seed_viewed_content: bool,
    /// Duration to seed viewed content (hours, 1-8760)
    pub seed_duration_hours: u32,
}

impl Default for SeedingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            spaces: Vec::new(),
            bandwidth_limit_mbps: SEEDING_DEFAULT_BANDWIDTH_MBPS,
            storage_limit_gb: SEEDING_DEFAULT_STORAGE_GB,
            seed_own_content: true,
            seed_viewed_content: true,
            seed_duration_hours: SEEDING_DEFAULT_DURATION_HOURS,
        }
    }
}

impl SeedingConfig {
    /// Create a new seeding config with default values
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate the configuration
    ///
    /// # Errors
    ///
    /// Returns error if any values are out of range.
    pub fn validate(&self) -> Result<(), ConfigError> {
        // Validate bandwidth
        if self.bandwidth_limit_mbps < SEEDING_MIN_BANDWIDTH_MBPS
            || self.bandwidth_limit_mbps > SEEDING_MAX_BANDWIDTH_MBPS
        {
            return Err(ConfigError::InvalidBandwidth {
                min: SEEDING_MIN_BANDWIDTH_MBPS,
                max: SEEDING_MAX_BANDWIDTH_MBPS,
                value: self.bandwidth_limit_mbps,
            });
        }

        // Validate storage
        if self.storage_limit_gb == 0 || self.storage_limit_gb > SEEDING_MAX_STORAGE_GB {
            return Err(ConfigError::InvalidStorage {
                max: SEEDING_MAX_STORAGE_GB,
                value: self.storage_limit_gb,
            });
        }

        // Validate duration
        if self.seed_duration_hours < SEEDING_MIN_DURATION_HOURS
            || self.seed_duration_hours > SEEDING_MAX_DURATION_HOURS
        {
            return Err(ConfigError::InvalidDuration {
                min: SEEDING_MIN_DURATION_HOURS,
                max: SEEDING_MAX_DURATION_HOURS,
                value: self.seed_duration_hours,
            });
        }

        Ok(())
    }

    /// Get the current seeding mode based on configuration
    #[must_use]
    pub fn mode(&self) -> SeedingMode {
        if !self.enabled {
            return SeedingMode::Disabled;
        }

        if !self.spaces.is_empty() {
            return SeedingMode::FullSpace;
        }

        if self.seed_viewed_content {
            return SeedingMode::ViewedContent;
        }

        if self.seed_own_content {
            return SeedingMode::OwnContent;
        }

        SeedingMode::Disabled
    }

    /// Create a config that only seeds own content
    #[must_use]
    pub fn own_content_only() -> Self {
        Self {
            enabled: true,
            spaces: Vec::new(),
            bandwidth_limit_mbps: SEEDING_DEFAULT_BANDWIDTH_MBPS,
            storage_limit_gb: SEEDING_DEFAULT_STORAGE_GB,
            seed_own_content: true,
            seed_viewed_content: false,
            seed_duration_hours: SEEDING_DEFAULT_DURATION_HOURS,
        }
    }

    /// Create a disabled seeding config
    #[must_use]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            ..Self::default()
        }
    }
}

/// Mobile-specific configuration (SPEC_07 §8)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileConfig {
    /// Cache limit in GB (default: 2)
    pub cache_limit_gb: f64,
    /// Only serve on WiFi (default: true)
    pub serve_on_wifi_only: bool,
    /// Daily cellular limit in MB for chain sync (default: 100)
    pub cellular_limit_mb_per_day: u32,
    /// Allow background serving (default: false)
    pub background_serving: bool,
}

impl Default for MobileConfig {
    fn default() -> Self {
        Self {
            cache_limit_gb: 2.0,
            serve_on_wifi_only: true,
            cellular_limit_mb_per_day: 100,
            background_serving: false,
        }
    }
}

impl MobileConfig {
    /// Create mobile config suitable for WiFi-only operation
    #[must_use]
    pub fn wifi_only() -> Self {
        Self::default()
    }

    /// Create mobile config that allows some cellular usage
    #[must_use]
    pub fn with_cellular(cellular_limit_mb: u32) -> Self {
        Self {
            serve_on_wifi_only: false,
            cellular_limit_mb_per_day: cellular_limit_mb,
            ..Self::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seeding_config_default() {
        let config = SeedingConfig::default();

        assert!(config.enabled);
        assert_eq!(config.bandwidth_limit_mbps, SEEDING_DEFAULT_BANDWIDTH_MBPS);
        assert_eq!(config.seed_duration_hours, SEEDING_DEFAULT_DURATION_HOURS);
        assert!(config.seed_own_content);
        assert!(config.seed_viewed_content);
        assert!(config.spaces.is_empty());
    }

    #[test]
    fn test_seeding_config_validate_ok() {
        let config = SeedingConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_seeding_config_validate_bandwidth_zero() {
        let mut config = SeedingConfig::default();
        config.bandwidth_limit_mbps = 0;

        let err = config.validate().unwrap_err();
        assert!(matches!(err, ConfigError::InvalidBandwidth { .. }));
    }

    #[test]
    fn test_seeding_config_validate_bandwidth_too_high() {
        let mut config = SeedingConfig::default();
        config.bandwidth_limit_mbps = 101;

        let err = config.validate().unwrap_err();
        assert!(matches!(err, ConfigError::InvalidBandwidth { .. }));
    }

    #[test]
    fn test_seeding_config_validate_duration_zero() {
        let mut config = SeedingConfig::default();
        config.seed_duration_hours = 0;

        let err = config.validate().unwrap_err();
        assert!(matches!(err, ConfigError::InvalidDuration { .. }));
    }

    #[test]
    fn test_seeding_config_validate_duration_too_high() {
        let mut config = SeedingConfig::default();
        config.seed_duration_hours = 9000;

        let err = config.validate().unwrap_err();
        assert!(matches!(err, ConfigError::InvalidDuration { .. }));
    }

    #[test]
    fn test_seeding_mode_disabled() {
        let config = SeedingConfig::disabled();
        assert_eq!(config.mode(), SeedingMode::Disabled);
    }

    #[test]
    fn test_seeding_mode_own_content() {
        let config = SeedingConfig::own_content_only();
        assert_eq!(config.mode(), SeedingMode::OwnContent);
    }

    #[test]
    fn test_seeding_mode_viewed_content() {
        let config = SeedingConfig::default();
        assert_eq!(config.mode(), SeedingMode::ViewedContent);
    }

    #[test]
    fn test_seeding_mode_full_space() {
        let mut config = SeedingConfig::default();
        config.spaces.push(SpaceId::from_bytes([1u8; 32]));
        assert_eq!(config.mode(), SeedingMode::FullSpace);
    }

    #[test]
    fn test_seeding_config_json_roundtrip() {
        let mut config = SeedingConfig::default();
        config.spaces.push(SpaceId::from_bytes([1u8; 32]));
        config.spaces.push(SpaceId::from_bytes([2u8; 32]));
        config.bandwidth_limit_mbps = 50;

        let json = serde_json::to_string(&config).unwrap();
        let parsed: SeedingConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.enabled, config.enabled);
        assert_eq!(parsed.bandwidth_limit_mbps, config.bandwidth_limit_mbps);
        assert_eq!(parsed.spaces.len(), 2);
    }

    #[test]
    fn test_mobile_config_default() {
        let config = MobileConfig::default();

        assert!((config.cache_limit_gb - 2.0).abs() < f64::EPSILON);
        assert!(config.serve_on_wifi_only);
        assert_eq!(config.cellular_limit_mb_per_day, 100);
        assert!(!config.background_serving);
    }

    #[test]
    fn test_mobile_config_with_cellular() {
        let config = MobileConfig::with_cellular(50);

        assert!(!config.serve_on_wifi_only);
        assert_eq!(config.cellular_limit_mb_per_day, 50);
    }
}
