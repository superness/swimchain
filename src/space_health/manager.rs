//! Space health manager
//!
//! Coordinates all space health components: swimmer tracking, contribution ranking,
//! risk calculation, and health score computation.
//! Provides caching for computed health data.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::compute::compute_health_score_with_warnings;
use super::contributors::{current_period, ContributorRanker, GENESIS_EPOCH_SECS};
use super::error::SpaceHealthError;
use super::risk::count_posts_at_risk_in_space;
use super::tracker::SpaceSwimmerTracker;
use super::types::{LinearChainWarning, SpaceContributor, SpaceHealth};

/// Cache TTL for space health data (60 seconds)
const CACHE_TTL: Duration = Duration::from_secs(60);

/// Maximum number of top contributors to include in health data
const TOP_CONTRIBUTORS_LIMIT: usize = 10;

/// Bytes per gigabyte for bandwidth calculations
const BYTES_PER_GB: u64 = 1_073_741_824;

/// Cached space health entry.
struct CachedHealth {
    health: SpaceHealth,
    computed_at: Instant,
}

/// Manages space health computation and caching.
///
/// Thread-safe through RwLock for cache.
pub struct SpaceHealthManager {
    tracker: SpaceSwimmerTracker,
    ranker: ContributorRanker,
    cache: RwLock<HashMap<[u8; 16], CachedHealth>>,
}

impl SpaceHealthManager {
    /// Create a new SpaceHealthManager.
    ///
    /// # Arguments
    /// * `db` - Sled database
    pub fn new(db: &sled::Db) -> Result<Self, SpaceHealthError> {
        let tracker = SpaceSwimmerTracker::new(db)?;
        let ranker = ContributorRanker::new(db)?;

        Ok(Self {
            tracker,
            ranker,
            cache: RwLock::new(HashMap::new()),
        })
    }

    /// Get health for a space, using cache if fresh.
    ///
    /// Returns cached health if available and not stale, otherwise
    /// computes health from current data.
    pub fn get_health(&self, space_id: &[u8; 16]) -> Result<SpaceHealth, SpaceHealthError> {
        // Check cache first
        {
            let cache = self.cache.read().unwrap();
            if let Some(cached) = cache.get(space_id) {
                if cached.computed_at.elapsed() < CACHE_TTL {
                    return Ok(cached.health.clone());
                }
            }
        }

        // Cache miss or stale - compute fresh
        let health = self.compute_health(space_id)?;

        // Update cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(
                *space_id,
                CachedHealth {
                    health: health.clone(),
                    computed_at: Instant::now(),
                },
            );
        }

        Ok(health)
    }

    /// Force recompute (cache invalidation).
    ///
    /// Use this when you know the cache is invalid.
    pub fn invalidate(&self, space_id: &[u8; 16]) {
        let mut cache = self.cache.write().unwrap();
        cache.remove(space_id);
    }

    /// Invalidate all cached entries.
    pub fn invalidate_all(&self) {
        let mut cache = self.cache.write().unwrap();
        cache.clear();
    }

    /// Record hosting activity for an identity in a space.
    ///
    /// This triggers cache invalidation for the space.
    pub fn record_activity(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        timestamp: u64,
    ) -> Result<(), SpaceHealthError> {
        self.tracker
            .register_activity(space_id, identity, timestamp)?;
        self.invalidate(space_id);
        Ok(())
    }

    /// Record bandwidth contribution for an identity in a space.
    ///
    /// This triggers cache invalidation for the space.
    pub fn record_contribution(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        bytes: u64,
    ) -> Result<(), SpaceHealthError> {
        let period = self.current_period();
        self.ranker
            .record_bandwidth(space_id, identity, bytes, period)?;
        self.invalidate(space_id);
        Ok(())
    }

    /// Record content served for an identity in a space.
    pub fn record_content_served(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        count: u32,
    ) -> Result<(), SpaceHealthError> {
        let period = self.current_period();
        self.ranker
            .record_content_served(space_id, identity, count, period)?;
        self.invalidate(space_id);
        Ok(())
    }

    /// Get the swimmer tracker reference.
    pub fn tracker(&self) -> &SpaceSwimmerTracker {
        &self.tracker
    }

    /// Get the contributor ranker reference.
    pub fn ranker(&self) -> &ContributorRanker {
        &self.ranker
    }

    /// Compute fresh health data for a space.
    ///
    /// # Note on Linear Chain Warnings
    /// This base implementation returns empty warnings. To populate warnings,
    /// use `compute_health_with_warnings` which takes a slice of warnings
    /// from the linear chain detector.
    fn compute_health(&self, space_id: &[u8; 16]) -> Result<SpaceHealth, SpaceHealthError> {
        self.compute_health_with_warnings(space_id, &[])
    }

    /// Compute fresh health data for a space with linear chain warnings.
    ///
    /// The warnings are incorporated into the health score calculation,
    /// reducing the score by 2 points per warning (max 10 point penalty).
    ///
    /// # Arguments
    /// * `space_id` - The space identifier
    /// * `warnings` - Linear chain warnings for identities in this space
    pub fn compute_health_with_warnings(
        &self,
        space_id: &[u8; 16],
        warnings: &[LinearChainWarning],
    ) -> Result<SpaceHealth, SpaceHealthError> {
        let now_secs = current_timestamp_secs();
        let period = current_period(now_secs);

        // Get active swimmers count
        let active_swimmers = self.tracker.get_active_count(space_id, now_secs)?;

        // Get posts at risk (stub returns 0 until ContentManager integration)
        let posts_at_risk = count_posts_at_risk_in_space(space_id, now_secs)?;

        // Get top contributors
        let top_contributors = self.get_top_contributors_for_health(space_id, period)?;

        // Calculate monthly bandwidth from all contributors (not just top 10)
        let monthly_bandwidth_bytes = self.ranker.get_total_bandwidth(space_id, period)?;
        let monthly_bandwidth_gb = monthly_bandwidth_bytes / BYTES_PER_GB;

        // Get last sync age (placeholder - requires sync system integration)
        // TODO: Integrate with sync status tracking
        let last_sync_age_secs = 0u64;

        // Compute health score with linear chain penalty
        let health_score = compute_health_score_with_warnings(
            active_swimmers,
            posts_at_risk,
            last_sync_age_secs,
            monthly_bandwidth_gb,
            warnings.len() as u32,
        );

        Ok(SpaceHealth {
            space_id: *space_id,
            active_swimmers,
            last_sync_age: Duration::from_secs(last_sync_age_secs),
            posts_at_risk,
            top_contributors,
            health_score,
            linear_chain_warnings: warnings.to_vec(),
        })
    }

    /// Get top contributors formatted for health data.
    fn get_top_contributors_for_health(
        &self,
        space_id: &[u8; 16],
        period: u32,
    ) -> Result<Vec<SpaceContributor>, SpaceHealthError> {
        self.ranker
            .get_top_contributors(space_id, period, TOP_CONTRIBUTORS_LIMIT)
    }

    /// Get current period number.
    fn current_period(&self) -> u32 {
        current_period(current_timestamp_secs())
    }
}

/// Get current Unix timestamp in seconds.
fn current_timestamp_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(GENESIS_EPOCH_SECS))
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> sled::Db {
        sled::Config::new().temporary(true).open().unwrap()
    }

    #[test]
    fn test_cache_ttl_constant() {
        assert_eq!(CACHE_TTL, Duration::from_secs(60));
    }

    #[test]
    fn test_top_contributors_limit() {
        assert_eq!(TOP_CONTRIBUTORS_LIMIT, 10);
    }

    #[test]
    fn test_current_timestamp_secs() {
        let ts = current_timestamp_secs();
        // Should be after genesis
        assert!(ts >= GENESIS_EPOCH_SECS);
        // Should be reasonable (after 2025-01-01)
        assert!(ts > 1700000000);
    }

    // Integration tests require a sled database. The core logic is tested in submodules.
}
