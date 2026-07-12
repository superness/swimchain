//! Storage configuration module (SPEC_07 - Milestone 1.6)
//!
//! Provides storage profiles for different device capabilities and
//! configuration options for the storage layer.

use std::path::PathBuf;

/// Storage profile for different device capabilities (SPEC_07 Mobile Considerations)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageProfile {
    /// Budget phone: 1GB cache, aggressive eviction
    Budget1GB,
    /// Standard phone: 5GB cache, moderate eviction
    Standard5GB,
    /// Flagship phone: 10GB cache, relaxed eviction
    Flagship10GB,
    /// Desktop: 50GB cache, very relaxed eviction
    Desktop50GB,
    /// Custom: user-defined limits
    Custom,
}

impl StorageProfile {
    /// Get max cache bytes for this profile
    #[must_use]
    pub const fn max_cache_bytes(&self) -> u64 {
        match self {
            Self::Budget1GB => 1_073_741_824,     // 1 * 1024^3
            Self::Standard5GB => 5_368_709_120,   // 5 * 1024^3
            Self::Flagship10GB => 10_737_418_240, // 10 * 1024^3
            Self::Desktop50GB => 53_687_091_200,  // 50 * 1024^3
            Self::Custom => 10_737_418_240,       // Default to 10GB
        }
    }

    /// Get eviction threshold for this profile (Milestone 3.4)
    ///
    /// - Budget: 0.85 (aggressive eviction to stay within tight limits)
    /// - Standard: 0.90 (default)
    /// - Flagship: 0.92 (more relaxed, larger cache)
    /// - Desktop: 0.95 (very relaxed, large storage available)
    #[must_use]
    pub const fn eviction_threshold(&self) -> f64 {
        match self {
            Self::Budget1GB => 0.85,
            Self::Standard5GB => 0.90,
            Self::Flagship10GB => 0.92,
            Self::Desktop50GB => 0.95,
            Self::Custom => 0.90,
        }
    }

    /// Get profile name for display
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Budget1GB => "Budget (1GB)",
            Self::Standard5GB => "Standard (5GB)",
            Self::Flagship10GB => "Flagship (10GB)",
            Self::Desktop50GB => "Desktop (50GB)",
            Self::Custom => "Custom",
        }
    }
}

impl Default for StorageProfile {
    fn default() -> Self {
        Self::Standard5GB
    }
}

/// Main storage configuration
#[derive(Debug, Clone)]
pub struct StorageConfig {
    /// Base path for all storage (~/.swimchain by default)
    pub base_path: PathBuf,
    /// Maximum cache size in bytes
    pub max_cache_bytes: u64,
    /// Eviction trigger threshold (0.0-1.0, default 0.9 = 90%)
    pub eviction_threshold: f64,
    /// Storage profile
    pub profile: StorageProfile,
    /// Flush interval in seconds (0 = flush on every write)
    pub flush_interval_secs: u64,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            base_path: Self::default_base_path(),
            max_cache_bytes: StorageProfile::Standard5GB.max_cache_bytes(),
            eviction_threshold: 0.9,
            profile: StorageProfile::Standard5GB,
            flush_interval_secs: 60,
        }
    }
}

impl StorageConfig {
    /// Create config from profile (Milestone 3.4: now uses profile-specific threshold)
    #[must_use]
    pub fn from_profile(profile: StorageProfile) -> Self {
        Self {
            max_cache_bytes: profile.max_cache_bytes(),
            eviction_threshold: profile.eviction_threshold(),
            profile,
            ..Self::default()
        }
    }

    /// Create config with custom max bytes
    #[must_use]
    pub fn with_max_bytes(max_bytes: u64) -> Self {
        Self {
            max_cache_bytes: max_bytes,
            profile: StorageProfile::Custom,
            ..Self::default()
        }
    }

    /// Create config with custom base path
    #[must_use]
    pub fn with_base_path(path: PathBuf) -> Self {
        Self {
            base_path: path,
            ..Self::default()
        }
    }

    /// Get default base path (~/.swimchain)
    #[must_use]
    pub fn default_base_path() -> PathBuf {
        directories::ProjectDirs::from("io", "swimchain", "swimchain")
            .map(|d| d.data_local_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from(".swimchain"))
    }

    /// Path to chain storage
    #[must_use]
    pub fn chain_path(&self) -> PathBuf {
        self.base_path.join("chain")
    }

    /// Path to content storage
    #[must_use]
    pub fn content_path(&self) -> PathBuf {
        self.base_path.join("content")
    }

    /// Path to blob storage
    #[must_use]
    pub fn blob_path(&self) -> PathBuf {
        self.content_path().join("blobs").join("sha256")
    }

    /// Path to manifest storage
    #[must_use]
    pub fn manifest_path(&self) -> PathBuf {
        self.content_path().join("manifests")
    }

    /// Path to cache index
    #[must_use]
    pub fn cache_index_path(&self) -> PathBuf {
        self.content_path().join("cache_index.json")
    }

    /// Path to content metadata database
    #[must_use]
    pub fn metadata_path(&self) -> PathBuf {
        self.content_path().join("metadata")
    }

    /// Calculate bytes remaining under limit
    #[must_use]
    pub fn bytes_remaining(&self, used: u64) -> u64 {
        self.max_cache_bytes.saturating_sub(used)
    }

    /// Check if usage is over eviction threshold
    #[must_use]
    pub fn is_over_threshold(&self, used: u64) -> bool {
        let threshold_bytes = (self.max_cache_bytes as f64 * self.eviction_threshold) as u64;
        used >= threshold_bytes
    }
}

/// Mobile-specific configuration (SPEC_07)
///
/// DESIGN NOTE: View-to-host model means users only cache content they view.
/// There is intentionally NO prefetch/proactive fetch option - that would
/// contradict the consent-based content hosting model.
#[derive(Debug, Clone)]
pub struct MobileConfig {
    /// Cache limit in gigabytes
    pub cache_limit_gb: f64,
    /// Only serve cached content when on WiFi (saves cellular data)
    pub serve_on_wifi_only: bool,
    /// Daily cellular data limit in MB (for chain sync, NOT content fetch)
    pub cellular_limit_mb_per_day: u32,
    /// Allow background serving of cached content (serve what you HAVE, never fetch)
    /// This is consent-based: you viewed it, you cached it, you can serve it.
    pub background_serving: bool,
}

impl Default for MobileConfig {
    fn default() -> Self {
        Self::standard()
    }
}

impl MobileConfig {
    /// Budget phone config - minimal background activity
    #[must_use]
    pub const fn budget() -> Self {
        Self {
            cache_limit_gb: 1.0,
            serve_on_wifi_only: true,
            cellular_limit_mb_per_day: 50,
            background_serving: false,
        }
    }

    /// Standard phone config - serves cached content on WiFi
    #[must_use]
    pub const fn standard() -> Self {
        Self {
            cache_limit_gb: 5.0,
            serve_on_wifi_only: true,
            cellular_limit_mb_per_day: 100,
            background_serving: true,
        }
    }

    /// Flagship phone config - more generous limits
    #[must_use]
    pub const fn flagship() -> Self {
        Self {
            cache_limit_gb: 10.0,
            serve_on_wifi_only: true,
            cellular_limit_mb_per_day: 200,
            background_serving: true,
        }
    }

    /// Convert cache limit to bytes
    #[must_use]
    pub fn cache_limit_bytes(&self) -> u64 {
        (self.cache_limit_gb * 1_073_741_824.0) as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_profile_bytes() {
        assert_eq!(StorageProfile::Budget1GB.max_cache_bytes(), 1_073_741_824);
        assert_eq!(StorageProfile::Standard5GB.max_cache_bytes(), 5_368_709_120);
        assert_eq!(
            StorageProfile::Flagship10GB.max_cache_bytes(),
            10_737_418_240
        );
        assert_eq!(
            StorageProfile::Desktop50GB.max_cache_bytes(),
            53_687_091_200
        );
    }

    #[test]
    fn test_config_from_profile() {
        let config = StorageConfig::from_profile(StorageProfile::Budget1GB);
        assert_eq!(config.max_cache_bytes, 1_073_741_824);
        assert_eq!(config.profile, StorageProfile::Budget1GB);
    }

    #[test]
    fn test_config_paths() {
        let config = StorageConfig::with_base_path(PathBuf::from("/test"));
        assert_eq!(config.chain_path(), PathBuf::from("/test/chain"));
        assert_eq!(config.content_path(), PathBuf::from("/test/content"));
        assert_eq!(
            config.blob_path(),
            PathBuf::from("/test/content/blobs/sha256")
        );
        assert_eq!(
            config.cache_index_path(),
            PathBuf::from("/test/content/cache_index.json")
        );
    }

    #[test]
    fn test_eviction_threshold() {
        let config = StorageConfig::from_profile(StorageProfile::Budget1GB);
        // 85% of 1GB (Budget profile uses 0.85)
        let threshold = (1_073_741_824_f64 * 0.85) as u64;
        assert!(!config.is_over_threshold(threshold - 1));
        assert!(config.is_over_threshold(threshold));
        assert!(config.is_over_threshold(threshold + 1));
    }

    #[test]
    fn test_profile_eviction_thresholds() {
        // Verify each profile has correct threshold (Milestone 3.4)
        assert!((StorageProfile::Budget1GB.eviction_threshold() - 0.85).abs() < f64::EPSILON);
        assert!((StorageProfile::Standard5GB.eviction_threshold() - 0.90).abs() < f64::EPSILON);
        assert!((StorageProfile::Flagship10GB.eviction_threshold() - 0.92).abs() < f64::EPSILON);
        assert!((StorageProfile::Desktop50GB.eviction_threshold() - 0.95).abs() < f64::EPSILON);
        assert!((StorageProfile::Custom.eviction_threshold() - 0.90).abs() < f64::EPSILON);
    }

    #[test]
    fn test_config_from_profile_uses_threshold() {
        // Budget profile (Milestone 3.4)
        let budget = StorageConfig::from_profile(StorageProfile::Budget1GB);
        assert!((budget.eviction_threshold - 0.85).abs() < f64::EPSILON);
        assert_eq!(budget.max_cache_bytes, 1_073_741_824);

        // Standard profile
        let standard = StorageConfig::from_profile(StorageProfile::Standard5GB);
        assert!((standard.eviction_threshold - 0.90).abs() < f64::EPSILON);
        assert_eq!(standard.max_cache_bytes, 5_368_709_120);

        // Flagship profile
        let flagship = StorageConfig::from_profile(StorageProfile::Flagship10GB);
        assert!((flagship.eviction_threshold - 0.92).abs() < f64::EPSILON);
        assert_eq!(flagship.max_cache_bytes, 10_737_418_240);

        // Desktop profile
        let desktop = StorageConfig::from_profile(StorageProfile::Desktop50GB);
        assert!((desktop.eviction_threshold - 0.95).abs() < f64::EPSILON);
        assert_eq!(desktop.max_cache_bytes, 53_687_091_200);
    }

    #[test]
    fn test_mobile_config_bytes() {
        assert_eq!(MobileConfig::budget().cache_limit_bytes(), 1_073_741_824);
        assert_eq!(MobileConfig::standard().cache_limit_bytes(), 5_368_709_120);
        assert_eq!(MobileConfig::flagship().cache_limit_bytes(), 10_737_418_240);
    }
}
