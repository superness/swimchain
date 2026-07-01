//! Per-space contribution tracking
//!
//! Tracks contribution per space per identity per period for ranking top contributors.
//! This extends ContributionRecord with space-specific data.

use sled::Tree;

use super::error::SpaceHealthError;

/// Genesis epoch timestamp (2024-01-01 00:00:00 UTC)
pub const GENESIS_EPOCH_SECS: u64 = 1704067200;

/// Seconds per week for period calculations
pub const SECONDS_PER_WEEK: u64 = 604800;
use super::types::SpaceContributor;

/// Sled tree name for space contributions
const TREE_NAME: &str = "space_contributions";

/// Per-space, per-identity, per-period contribution data.
///
/// This tracks how much an identity has contributed to a specific space.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SpaceContributionData {
    /// Bytes served for this space
    pub bandwidth_served_bytes: u64,

    /// Number of content requests served
    pub content_served_count: u32,

    /// Number of uptime samples taken
    pub uptime_samples: u32,

    /// Number of samples where the node was online
    pub uptime_online_samples: u32,
}

impl SpaceContributionData {
    /// Create new empty contribution data
    pub fn new() -> Self {
        Self::default()
    }

    /// Serialize to bytes for storage
    pub fn to_bytes(&self) -> [u8; 24] {
        let mut bytes = [0u8; 24];
        bytes[0..8].copy_from_slice(&self.bandwidth_served_bytes.to_le_bytes());
        bytes[8..12].copy_from_slice(&self.content_served_count.to_le_bytes());
        bytes[12..16].copy_from_slice(&self.uptime_samples.to_le_bytes());
        bytes[16..20].copy_from_slice(&self.uptime_online_samples.to_le_bytes());
        // 4 bytes padding/reserved
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 20 {
            return None;
        }
        Some(Self {
            bandwidth_served_bytes: u64::from_le_bytes(bytes[0..8].try_into().ok()?),
            content_served_count: u32::from_le_bytes(bytes[8..12].try_into().ok()?),
            uptime_samples: u32::from_le_bytes(bytes[12..16].try_into().ok()?),
            uptime_online_samples: u32::from_le_bytes(bytes[16..20].try_into().ok()?),
        })
    }

    /// Calculate uptime ratio as 0-10000 (0.00%-100.00%)
    pub fn uptime_ratio(&self) -> u16 {
        if self.uptime_samples == 0 {
            return 0;
        }
        let ratio = (self.uptime_online_samples as u64 * 10000) / self.uptime_samples as u64;
        ratio.min(10000) as u16
    }
}

/// Ranks contributors by their contributions to a specific space.
///
/// Key format: space_id(16) || identity(32) || period(4 BE) = 52 bytes
/// Value format: SpaceContributionData serialized (24 bytes)
pub struct ContributorRanker {
    tree: Tree,
}

impl ContributorRanker {
    /// Create a new ContributorRanker.
    pub fn new(db: &sled::Db) -> Result<Self, SpaceHealthError> {
        let tree = db.open_tree(TREE_NAME)?;
        Ok(Self { tree })
    }

    /// Record bytes served for a specific space.
    ///
    /// # Arguments
    /// * `space_id` - 16-byte space identifier
    /// * `identity` - 32-byte Ed25519 public key
    /// * `bytes` - Number of bytes served
    /// * `period` - Period number (weeks since genesis)
    pub fn record_bandwidth(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        bytes: u64,
        period: u32,
    ) -> Result<(), SpaceHealthError> {
        let key = Self::make_key(space_id, identity, period);

        // Atomic update using fetch_and_update
        self.tree.fetch_and_update(&key, |old| {
            let mut data = old
                .and_then(|b| SpaceContributionData::from_bytes(b))
                .unwrap_or_default();
            data.bandwidth_served_bytes = data.bandwidth_served_bytes.saturating_add(bytes);
            Some(data.to_bytes().to_vec())
        })?;

        Ok(())
    }

    /// Record content served for a specific space.
    pub fn record_content_served(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        count: u32,
        period: u32,
    ) -> Result<(), SpaceHealthError> {
        let key = Self::make_key(space_id, identity, period);

        self.tree.fetch_and_update(&key, |old| {
            let mut data = old
                .and_then(|b| SpaceContributionData::from_bytes(b))
                .unwrap_or_default();
            data.content_served_count = data.content_served_count.saturating_add(count);
            Some(data.to_bytes().to_vec())
        })?;

        Ok(())
    }

    /// Record an uptime sample for a specific space.
    pub fn record_uptime_sample(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        is_online: bool,
        period: u32,
    ) -> Result<(), SpaceHealthError> {
        let key = Self::make_key(space_id, identity, period);

        self.tree.fetch_and_update(&key, |old| {
            let mut data = old
                .and_then(|b| SpaceContributionData::from_bytes(b))
                .unwrap_or_default();
            data.uptime_samples = data.uptime_samples.saturating_add(1);
            if is_online {
                data.uptime_online_samples = data.uptime_online_samples.saturating_add(1);
            }
            Some(data.to_bytes().to_vec())
        })?;

        Ok(())
    }

    /// Get top N contributors for a space in a period.
    ///
    /// Sorted by contribution_score DESC, then identity ASC (deterministic).
    ///
    /// # Arguments
    /// * `space_id` - 16-byte space identifier
    /// * `period` - Period number
    /// * `limit` - Maximum number of contributors to return
    pub fn get_top_contributors(
        &self,
        space_id: &[u8; 16],
        period: u32,
        limit: usize,
    ) -> Result<Vec<SpaceContributor>, SpaceHealthError> {
        let mut contributors = Vec::new();

        // Scan all entries for this space
        for result in self.tree.scan_prefix(space_id) {
            let (key, value) = result?;

            // Key must be 52 bytes: space_id(16) || identity(32) || period(4)
            if key.len() < 52 {
                continue;
            }

            // Check period matches (bytes 48..52 BE)
            let key_period = u32::from_be_bytes(
                key[48..52].try_into().unwrap_or([0; 4])
            );
            if key_period != period {
                continue;
            }

            // Extract identity
            let mut identity = [0u8; 32];
            identity.copy_from_slice(&key[16..48]);

            // Parse contribution data
            let data = SpaceContributionData::from_bytes(&value)
                .unwrap_or_default();

            // Calculate contribution score: bandwidth_gb * 100 + content_count / 100
            let bandwidth_gb = data.bandwidth_served_bytes / (1024 * 1024 * 1024);
            let contribution_score = bandwidth_gb * 100 + (data.content_served_count as u64 / 100);

            contributors.push(SpaceContributor {
                identity,
                bandwidth_served_bytes: data.bandwidth_served_bytes,
                uptime_ratio: data.uptime_ratio(),
                contribution_score,
            });
        }

        // Sort: contribution_score DESC, then identity ASC (deterministic)
        contributors.sort_by(|a, b| {
            b.contribution_score.cmp(&a.contribution_score)
                .then_with(|| a.identity.cmp(&b.identity))
        });

        contributors.truncate(limit);
        Ok(contributors)
    }

    /// Get contribution data for a specific space, identity, and period.
    pub fn get_contribution(
        &self,
        space_id: &[u8; 16],
        identity: &[u8; 32],
        period: u32,
    ) -> Result<Option<SpaceContributionData>, SpaceHealthError> {
        let key = Self::make_key(space_id, identity, period);
        match self.tree.get(&key)? {
            Some(value) => Ok(SpaceContributionData::from_bytes(&value)),
            None => Ok(None),
        }
    }

    /// Get total bandwidth served in a space for a period (sum of all contributors).
    pub fn get_total_bandwidth(
        &self,
        space_id: &[u8; 16],
        period: u32,
    ) -> Result<u64, SpaceHealthError> {
        let mut total = 0u64;

        for result in self.tree.scan_prefix(space_id) {
            let (key, value) = result?;

            if key.len() < 52 {
                continue;
            }

            let key_period = u32::from_be_bytes(
                key[48..52].try_into().unwrap_or([0; 4])
            );
            if key_period != period {
                continue;
            }

            if let Some(data) = SpaceContributionData::from_bytes(&value) {
                total = total.saturating_add(data.bandwidth_served_bytes);
            }
        }

        Ok(total)
    }

    /// Create a key from space_id, identity, and period.
    fn make_key(space_id: &[u8; 16], identity: &[u8; 32], period: u32) -> [u8; 52] {
        let mut key = [0u8; 52];
        key[..16].copy_from_slice(space_id);
        key[16..48].copy_from_slice(identity);
        key[48..52].copy_from_slice(&period.to_be_bytes());
        key
    }
}

/// Calculate current period from timestamp.
pub fn current_period(timestamp_secs: u64) -> u32 {
    if timestamp_secs < GENESIS_EPOCH_SECS {
        return 0;
    }
    ((timestamp_secs - GENESIS_EPOCH_SECS) / SECONDS_PER_WEEK) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> sled::Db {
        sled::Config::new().temporary(true).open().unwrap()
    }

    #[test]
    fn test_space_contribution_data_default() {
        let data = SpaceContributionData::default();
        assert_eq!(data.bandwidth_served_bytes, 0);
        assert_eq!(data.content_served_count, 0);
        assert_eq!(data.uptime_samples, 0);
        assert_eq!(data.uptime_online_samples, 0);
    }

    #[test]
    fn test_space_contribution_data_serialization() {
        let data = SpaceContributionData {
            bandwidth_served_bytes: 1_000_000_000,
            content_served_count: 500,
            uptime_samples: 100,
            uptime_online_samples: 85,
        };

        let bytes = data.to_bytes();
        let restored = SpaceContributionData::from_bytes(&bytes).unwrap();

        assert_eq!(data, restored);
    }

    #[test]
    fn test_uptime_ratio_calculation() {
        let mut data = SpaceContributionData::default();

        // No samples = 0%
        assert_eq!(data.uptime_ratio(), 0);

        // 85 out of 100 = 85%
        data.uptime_samples = 100;
        data.uptime_online_samples = 85;
        assert_eq!(data.uptime_ratio(), 8500);

        // 100% uptime
        data.uptime_online_samples = 100;
        assert_eq!(data.uptime_ratio(), 10000);

        // Overflow protection
        data.uptime_online_samples = 200;
        assert_eq!(data.uptime_ratio(), 10000);
    }

    #[test]
    fn test_make_key() {
        let space_id = [1u8; 16];
        let identity = [2u8; 32];
        let period = 42u32;

        let key = ContributorRanker::make_key(&space_id, &identity, period);

        assert_eq!(key.len(), 52);
        assert_eq!(&key[..16], &space_id);
        assert_eq!(&key[16..48], &identity);
        assert_eq!(u32::from_be_bytes(key[48..52].try_into().unwrap()), period);
    }

    #[test]
    fn test_record_and_get_contribution() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let identity = [2u8; 32];
        let period = 5u32;

        // Record bandwidth
        ranker.record_bandwidth(&space_id, &identity, 1_000_000, period).unwrap();
        ranker.record_bandwidth(&space_id, &identity, 500_000, period).unwrap();

        // Get contribution
        let data = ranker.get_contribution(&space_id, &identity, period).unwrap().unwrap();
        assert_eq!(data.bandwidth_served_bytes, 1_500_000);
    }

    #[test]
    fn test_record_content_served() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let identity = [2u8; 32];
        let period = 5u32;

        ranker.record_content_served(&space_id, &identity, 50, period).unwrap();
        ranker.record_content_served(&space_id, &identity, 30, period).unwrap();

        let data = ranker.get_contribution(&space_id, &identity, period).unwrap().unwrap();
        assert_eq!(data.content_served_count, 80);
    }

    #[test]
    fn test_get_top_contributors() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let period = 5u32;

        // Add contributors with different contributions
        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];
        let identity3 = [3u8; 32];

        // identity2 has highest contribution
        ranker.record_bandwidth(&space_id, &identity1, 1_000_000_000, period).unwrap(); // ~1GB = 100 score
        ranker.record_bandwidth(&space_id, &identity2, 5_000_000_000, period).unwrap(); // ~5GB = 500 score
        ranker.record_bandwidth(&space_id, &identity3, 2_000_000_000, period).unwrap(); // ~2GB = 200 score

        let top = ranker.get_top_contributors(&space_id, period, 3).unwrap();

        assert_eq!(top.len(), 3);
        assert_eq!(top[0].identity, identity2); // Highest
        assert_eq!(top[1].identity, identity3); // Second
        assert_eq!(top[2].identity, identity1); // Third
    }

    #[test]
    fn test_top_contributors_limit() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let period = 5u32;

        // Add 5 contributors
        for i in 0..5u8 {
            let mut identity = [0u8; 32];
            identity[0] = i;
            ranker.record_bandwidth(&space_id, &identity, (i as u64 + 1) * 1_000_000_000, period).unwrap();
        }

        // Request top 3
        let top = ranker.get_top_contributors(&space_id, period, 3).unwrap();
        assert_eq!(top.len(), 3);
    }

    #[test]
    fn test_top_contributors_tiebreaker() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let period = 5u32;

        // Two contributors with same contribution score
        let mut identity1 = [0u8; 32];
        identity1[0] = 2;
        let mut identity2 = [0u8; 32];
        identity2[0] = 1;

        ranker.record_bandwidth(&space_id, &identity1, 1_000_000_000, period).unwrap();
        ranker.record_bandwidth(&space_id, &identity2, 1_000_000_000, period).unwrap();

        let top = ranker.get_top_contributors(&space_id, period, 2).unwrap();

        // Should be sorted by identity ASC when scores are equal
        assert_eq!(top[0].identity[0], 1); // Lower identity comes first
        assert_eq!(top[1].identity[0], 2);
    }

    #[test]
    fn test_period_isolation() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let identity = [1u8; 32];

        // Record in different periods
        ranker.record_bandwidth(&space_id, &identity, 1_000_000, 1).unwrap();
        ranker.record_bandwidth(&space_id, &identity, 2_000_000, 2).unwrap();

        // Period 1 should have 1MB
        let data1 = ranker.get_contribution(&space_id, &identity, 1).unwrap().unwrap();
        assert_eq!(data1.bandwidth_served_bytes, 1_000_000);

        // Period 2 should have 2MB
        let data2 = ranker.get_contribution(&space_id, &identity, 2).unwrap().unwrap();
        assert_eq!(data2.bandwidth_served_bytes, 2_000_000);

        // Top contributors for period 1 should not include period 2 data
        let top1 = ranker.get_top_contributors(&space_id, 1, 10).unwrap();
        assert_eq!(top1.len(), 1);
        assert_eq!(top1[0].bandwidth_served_bytes, 1_000_000);
    }

    #[test]
    fn test_get_total_bandwidth() {
        let db = test_db();
        let ranker = ContributorRanker::new(&db).unwrap();

        let space_id = [1u8; 16];
        let period = 5u32;

        let identity1 = [1u8; 32];
        let identity2 = [2u8; 32];

        ranker.record_bandwidth(&space_id, &identity1, 1_000_000, period).unwrap();
        ranker.record_bandwidth(&space_id, &identity2, 2_000_000, period).unwrap();

        let total = ranker.get_total_bandwidth(&space_id, period).unwrap();
        assert_eq!(total, 3_000_000);
    }

    #[test]
    fn test_current_period() {
        // Before genesis
        assert_eq!(current_period(0), 0);
        assert_eq!(current_period(GENESIS_EPOCH_SECS - 1), 0);

        // At genesis
        assert_eq!(current_period(GENESIS_EPOCH_SECS), 0);

        // One week after genesis
        assert_eq!(current_period(GENESIS_EPOCH_SECS + SECONDS_PER_WEEK), 1);

        // Two weeks after genesis
        assert_eq!(current_period(GENESIS_EPOCH_SECS + SECONDS_PER_WEEK * 2), 2);
    }
}
