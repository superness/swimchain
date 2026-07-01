//! Sync configuration (SPEC_06 - Chain Sync)
//!
//! Configuration parameters for chain synchronization.

use crate::types::constants;

/// Configuration for chain synchronization
#[derive(Debug, Clone)]
pub struct SyncConfig {
    /// Sync check interval in seconds (default: 30s per SPEC_06 §4.5)
    pub sync_interval_secs: u64,

    /// Block request timeout in milliseconds (default: 10s per SPEC_06 §4.5)
    pub block_request_timeout_ms: u64,

    /// Maximum headers per request batch (default: 2000 per SPEC_06)
    pub header_batch_size: u16,

    /// Number of peers to query for chain status (default: 8 per SPEC_06 §4.5)
    pub query_peer_count: usize,

    /// Number of parallel block downloads (default: 1, sequential)
    pub parallel_downloads: usize,

    /// Maximum retries per peer before switching
    pub max_retries_per_peer: u32,

    /// Whether to verify merkle roots during sync
    pub verify_merkle_roots: bool,

    /// Whether to verify PoW during sync
    pub verify_pow: bool,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            sync_interval_secs: constants::SYNC_INTERVAL_SECS,
            block_request_timeout_ms: constants::BLOCK_REQUEST_TIMEOUT_MS,
            header_batch_size: constants::MAX_HEADERS_PER_MESSAGE as u16,
            query_peer_count: constants::SYNC_QUERY_PEER_COUNT,
            parallel_downloads: 1, // Start sequential for safety
            max_retries_per_peer: 3,
            verify_merkle_roots: true,
            verify_pow: true,
        }
    }
}

impl SyncConfig {
    /// Create a new configuration with default values
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a fast configuration for testing
    #[must_use]
    pub fn fast() -> Self {
        Self {
            sync_interval_secs: 5,
            block_request_timeout_ms: 5_000,
            header_batch_size: 500,
            query_peer_count: 3,
            parallel_downloads: 4,
            max_retries_per_peer: 1,
            verify_merkle_roots: true,
            verify_pow: true,
        }
    }

    /// Create a configuration that skips validation (for benchmarks only)
    ///
    /// # Safety
    /// This configuration disables all security checks. Only use for benchmarks
    /// and testing. NEVER use in production as it accepts invalid blocks.
    #[must_use]
    pub fn no_validation() -> Self {
        log::warn!(
            "SyncConfig::no_validation() called - ALL SECURITY CHECKS DISABLED. \
             This should ONLY be used for benchmarks. Using in production will accept invalid blocks!"
        );
        Self {
            verify_merkle_roots: false,
            verify_pow: false,
            ..Self::default()
        }
    }

    /// Set sync interval
    #[must_use]
    pub fn with_sync_interval(mut self, secs: u64) -> Self {
        self.sync_interval_secs = secs;
        self
    }

    /// Set block request timeout
    #[must_use]
    pub fn with_timeout(mut self, ms: u64) -> Self {
        self.block_request_timeout_ms = ms;
        self
    }

    /// Set header batch size
    #[must_use]
    pub fn with_batch_size(mut self, size: u16) -> Self {
        self.header_batch_size = size;
        self
    }

    /// Set query peer count
    #[must_use]
    pub fn with_peer_count(mut self, count: usize) -> Self {
        self.query_peer_count = count;
        self
    }

    /// Set parallel downloads count
    #[must_use]
    pub fn with_parallel_downloads(mut self, count: usize) -> Self {
        self.parallel_downloads = count.max(1); // At least 1
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SyncConfig::default();
        assert_eq!(config.sync_interval_secs, 30);
        assert_eq!(config.block_request_timeout_ms, 10_000);
        assert_eq!(config.header_batch_size, 2000);
        assert_eq!(config.query_peer_count, 8);
        assert!(config.verify_merkle_roots);
        assert!(config.verify_pow);
    }

    #[test]
    fn test_fast_config() {
        let config = SyncConfig::fast();
        assert_eq!(config.sync_interval_secs, 5);
        assert_eq!(config.parallel_downloads, 4);
    }

    #[test]
    fn test_no_validation_config() {
        let config = SyncConfig::no_validation();
        assert!(!config.verify_merkle_roots);
        assert!(!config.verify_pow);
    }

    #[test]
    fn test_builder_pattern() {
        let config = SyncConfig::new()
            .with_sync_interval(60)
            .with_timeout(20_000)
            .with_batch_size(1000)
            .with_peer_count(4);

        assert_eq!(config.sync_interval_secs, 60);
        assert_eq!(config.block_request_timeout_ms, 20_000);
        assert_eq!(config.header_batch_size, 1000);
        assert_eq!(config.query_peer_count, 4);
    }

    #[test]
    fn test_parallel_downloads_minimum() {
        let config = SyncConfig::new().with_parallel_downloads(0);
        assert_eq!(config.parallel_downloads, 1);
    }
}
