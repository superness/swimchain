//! Attribution Manager (SPEC_09 §6.3)
//!
//! Manages content attribution data with caching for performance.

use std::collections::HashMap;
use std::time::Instant;

use crate::content::pool::{EngagementPool, PoolContribution, PoolStatus};

use super::compute::extract_contributors_from_pool;
use super::types::ContentAttribution;

/// Cache time-to-live in seconds (5 minutes)
const CACHE_TTL_SECS: u64 = 300;

/// Cached attribution data with timestamp
struct CachedAttribution {
    attribution: ContentAttribution,
    cached_at: Instant,
}

/// Manager for content attribution data.
///
/// Provides cached access to attribution information derived from engagement pools.
/// The cache is invalidated after 5 minutes or when explicitly cleared.
pub struct AttributionManager {
    /// Cache of content_id -> attribution data
    cache: HashMap<[u8; 32], CachedAttribution>,
}

impl AttributionManager {
    /// Create a new AttributionManager
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Get attribution for content, computing if not cached or stale.
    ///
    /// # Arguments
    /// * `content_id` - Content to get attribution for
    /// * `pools` - Slice of engagement pools to search
    /// * `current_time_ms` - Current timestamp in milliseconds (unused but reserved)
    ///
    /// # Returns
    /// Attribution data for the content
    pub fn get_attribution(
        &mut self,
        content_id: &[u8; 32],
        pools: &[EngagementPool],
        _current_time_ms: u64,
    ) -> ContentAttribution {
        // Check cache
        if let Some(cached) = self.cache.get(content_id) {
            if cached.cached_at.elapsed().as_secs() < CACHE_TTL_SECS {
                return cached.attribution.clone();
            }
        }

        // Compute fresh attribution
        let attribution = self.compute_attribution(content_id, pools);

        // Cache it
        self.cache.insert(
            *content_id,
            CachedAttribution {
                attribution: attribution.clone(),
                cached_at: Instant::now(),
            },
        );

        attribution
    }

    /// Compute attribution from pool data.
    ///
    /// Finds all completed pools for the content and extracts contributors.
    fn compute_attribution(
        &self,
        content_id: &[u8; 32],
        pools: &[EngagementPool],
    ) -> ContentAttribution {
        let mut all_contributions: Vec<PoolContribution> = Vec::new();
        let mut pool_completion_timestamp: Option<u64> = None;

        // Find all completed pools for this content
        for pool in pools {
            if &pool.target_content == content_id && pool.status == PoolStatus::Completed {
                all_contributions.extend(pool.contributions.clone());
                // Track the latest completion timestamp
                pool_completion_timestamp = Some(
                    pool_completion_timestamp
                        .map_or(pool.window_end, |ts| ts.max(pool.window_end)),
                );
            }
        }

        // Extract and deduplicate contributors
        let contributors = extract_contributors_from_pool(&all_contributions);
        let total_pow = contributors.iter().map(|c| c.pow_contributed).sum();

        ContentAttribution {
            content_id: *content_id,
            contributors: contributors.clone(),
            total_contributors: contributors.len() as u32,
            total_pow_contributed: total_pow,
            pool_completion_timestamp,
        }
    }

    /// Compute attribution from a single pool.
    ///
    /// Useful when you already have a specific pool reference.
    pub fn compute_attribution_from_pool(&self, pool: &EngagementPool) -> ContentAttribution {
        let contributors = extract_contributors_from_pool(&pool.contributions);
        let total_pow = contributors.iter().map(|c| c.pow_contributed).sum();

        let pool_completion_timestamp = if pool.status == PoolStatus::Completed {
            Some(pool.window_end)
        } else {
            None
        };

        ContentAttribution {
            content_id: pool.target_content,
            contributors: contributors.clone(),
            total_contributors: contributors.len() as u32,
            total_pow_contributed: total_pow,
            pool_completion_timestamp,
        }
    }

    /// Invalidate cache for specific content.
    ///
    /// Call this when a pool completes or new contribution is added.
    pub fn invalidate_cache(&mut self, content_id: &[u8; 32]) {
        self.cache.remove(content_id);
    }

    /// Clear all cached entries older than TTL.
    ///
    /// Call periodically to prevent unbounded cache growth.
    pub fn cleanup_stale_cache(&mut self) {
        self.cache
            .retain(|_, v| v.cached_at.elapsed().as_secs() < CACHE_TTL_SECS);
    }

    /// Clear all cache entries.
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Get the number of cached entries.
    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }
}

impl Default for AttributionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    fn make_test_pool(content_id: [u8; 32], status: PoolStatus) -> EngagementPool {
        EngagementPool {
            pool_id: [0u8; 32],
            target_content: content_id,
            required_pow: 60,
            window_start: 1000,
            window_end: 2000,
            contributions: vec![],
            status,
        }
    }

    fn make_contribution(contributor: [u8; 32], pow_work: u64) -> PoolContribution {
        PoolContribution {
            contributor,
            pow_nonce: 0,
            pow_work,
            pow_target: [0u8; 32],
            timestamp: 1500,
            signature: [0u8; 64],
            nonce_space: [0u8; 8],
            emoji: None,
        }
    }

    #[test]
    fn test_manager_new() {
        let manager = AttributionManager::new();
        assert_eq!(manager.cache_size(), 0);
    }

    #[test]
    fn test_compute_attribution_empty() {
        let manager = AttributionManager::new();
        let content_id = [1u8; 32];
        let pools: Vec<EngagementPool> = vec![];

        let attr = manager.compute_attribution(&content_id, &pools);

        assert_eq!(attr.content_id, content_id);
        assert!(attr.contributors.is_empty());
        assert_eq!(attr.total_contributors, 0);
        assert_eq!(attr.total_pow_contributed, 0);
        assert!(attr.pool_completion_timestamp.is_none());
    }

    #[test]
    fn test_compute_attribution_completed_pool() {
        let manager = AttributionManager::new();
        let content_id = [1u8; 32];

        let mut pool = make_test_pool(content_id, PoolStatus::Completed);
        pool.contributions = vec![
            make_contribution([10u8; 32], 30),
            make_contribution([20u8; 32], 30),
        ];

        let pools = vec![pool];
        let attr = manager.compute_attribution(&content_id, &pools);

        assert_eq!(attr.content_id, content_id);
        assert_eq!(attr.contributors.len(), 2);
        assert_eq!(attr.total_contributors, 2);
        assert_eq!(attr.total_pow_contributed, 60);
        assert_eq!(attr.pool_completion_timestamp, Some(2000));
    }

    #[test]
    fn test_compute_attribution_ignores_open_pools() {
        let manager = AttributionManager::new();
        let content_id = [1u8; 32];

        let mut pool = make_test_pool(content_id, PoolStatus::Open);
        pool.contributions = vec![make_contribution([10u8; 32], 30)];

        let pools = vec![pool];
        let attr = manager.compute_attribution(&content_id, &pools);

        // Should be empty because pool is not completed
        assert!(attr.contributors.is_empty());
        assert_eq!(attr.total_pow_contributed, 0);
    }

    #[test]
    fn test_compute_attribution_ignores_other_content() {
        let manager = AttributionManager::new();
        let content_id = [1u8; 32];
        let other_content = [2u8; 32];

        let mut pool = make_test_pool(other_content, PoolStatus::Completed);
        pool.contributions = vec![make_contribution([10u8; 32], 30)];

        let pools = vec![pool];
        let attr = manager.compute_attribution(&content_id, &pools);

        // Should be empty because pool is for different content
        assert!(attr.contributors.is_empty());
    }

    #[test]
    fn test_get_attribution_caches() {
        let mut manager = AttributionManager::new();
        let content_id = [1u8; 32];

        let mut pool = make_test_pool(content_id, PoolStatus::Completed);
        pool.contributions = vec![make_contribution([10u8; 32], 30)];
        let pools = vec![pool];

        // First call - should cache
        let _ = manager.get_attribution(&content_id, &pools, 0);
        assert_eq!(manager.cache_size(), 1);

        // Second call - should use cache
        let attr = manager.get_attribution(&content_id, &pools, 0);
        assert_eq!(attr.total_pow_contributed, 30);
        assert_eq!(manager.cache_size(), 1);
    }

    #[test]
    fn test_invalidate_cache() {
        let mut manager = AttributionManager::new();
        let content_id = [1u8; 32];
        let pools = vec![make_test_pool(content_id, PoolStatus::Completed)];

        let _ = manager.get_attribution(&content_id, &pools, 0);
        assert_eq!(manager.cache_size(), 1);

        manager.invalidate_cache(&content_id);
        assert_eq!(manager.cache_size(), 0);
    }

    #[test]
    fn test_clear_cache() {
        let mut manager = AttributionManager::new();

        // Cache multiple items
        for i in 0..5u8 {
            let content_id = [i; 32];
            let pools = vec![make_test_pool(content_id, PoolStatus::Completed)];
            let _ = manager.get_attribution(&content_id, &pools, 0);
        }

        assert_eq!(manager.cache_size(), 5);

        manager.clear_cache();
        assert_eq!(manager.cache_size(), 0);
    }

    #[test]
    fn test_compute_attribution_from_pool() {
        let manager = AttributionManager::new();

        let mut pool = make_test_pool([1u8; 32], PoolStatus::Completed);
        pool.contributions = vec![
            make_contribution([10u8; 32], 20),
            make_contribution([10u8; 32], 10), // Same contributor, should be aggregated
            make_contribution([20u8; 32], 30),
        ];

        let attr = manager.compute_attribution_from_pool(&pool);

        assert_eq!(attr.total_contributors, 2); // 2 unique contributors
        assert_eq!(attr.total_pow_contributed, 60); // 20 + 10 + 30
        assert_eq!(attr.pool_completion_timestamp, Some(2000));
    }

    #[test]
    fn test_multiple_pools_aggregated() {
        let manager = AttributionManager::new();
        let content_id = [1u8; 32];

        let mut pool1 = make_test_pool(content_id, PoolStatus::Completed);
        pool1.window_end = 1000;
        pool1.contributions = vec![make_contribution([10u8; 32], 30)];

        let mut pool2 = make_test_pool(content_id, PoolStatus::Completed);
        pool2.pool_id = [1u8; 32];
        pool2.window_end = 2000;
        pool2.contributions = vec![
            make_contribution([10u8; 32], 30), // Same contributor
            make_contribution([20u8; 32], 30),
        ];

        let pools = vec![pool1, pool2];
        let attr = manager.compute_attribution(&content_id, &pools);

        // Both pools should be included
        assert_eq!(attr.total_contributors, 2); // 2 unique contributors
        assert_eq!(attr.total_pow_contributed, 90); // 30 + 30 + 30, aggregated
        assert_eq!(attr.pool_completion_timestamp, Some(2000)); // Latest
    }
}
