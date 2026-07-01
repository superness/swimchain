//! Seeding statistics (SPEC_07 - Milestone 3.5)
//!
//! Tracks upload/download metrics for seeding operations.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::types::content::SpaceId;

/// Time window for "recent" activity (5 minutes)
const HEALTHY_THRESHOLD_SECS: u64 = 300;

/// Time window for "degraded" activity (60 minutes)
const DEGRADED_THRESHOLD_SECS: u64 = 3600;

/// Rolling window size (1 hour in seconds)
const HOURLY_WINDOW_SECS: u64 = 3600;

/// Per-space seeding statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpaceStats {
    /// Bytes uploaded for this space
    pub bytes_uploaded: u64,
    /// Number of requests served for this space
    pub requests_served: u64,
}

/// Seeding health indicator
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeedingHealth {
    /// Active seeding in last 5 minutes
    Healthy,
    /// Some activity but degraded (5-60 minutes)
    Degraded,
    /// No activity in last 60 minutes
    Inactive,
}

impl Default for SeedingHealth {
    fn default() -> Self {
        SeedingHealth::Inactive
    }
}

/// A sample in the rolling window
struct RollingSample {
    timestamp: Instant,
    bytes: u64,
}

/// Seeding statistics tracker (SPEC_07 §5)
///
/// Tracks seeding activity with atomic counters for lock-free reads
/// and per-space statistics behind RwLock.
pub struct SeedingStatistics {
    // Atomic counters for lock-free reads
    bytes_uploaded: AtomicU64,
    bytes_downloaded: AtomicU64,
    requests_served: AtomicU64,
    requests_denied: AtomicU64,

    // Per-space stats (behind lock)
    space_stats: RwLock<HashMap<SpaceId, SpaceStats>>,

    // Rolling window for hourly calculation (behind lock)
    hourly_samples: RwLock<VecDeque<RollingSample>>,

    // Last activity timestamp
    last_activity: RwLock<Option<Instant>>,

    // When statistics were created
    created_at: Instant,
}

impl Default for SeedingStatistics {
    fn default() -> Self {
        Self::new()
    }
}

impl SeedingStatistics {
    /// Create new statistics tracker
    #[must_use]
    pub fn new() -> Self {
        Self {
            bytes_uploaded: AtomicU64::new(0),
            bytes_downloaded: AtomicU64::new(0),
            requests_served: AtomicU64::new(0),
            requests_denied: AtomicU64::new(0),
            space_stats: RwLock::new(HashMap::new()),
            hourly_samples: RwLock::new(VecDeque::new()),
            last_activity: RwLock::new(None),
            created_at: Instant::now(),
        }
    }

    /// Record an upload (content served to peer)
    pub fn record_upload(&self, bytes: u64, space_id: SpaceId) {
        // Atomic updates
        self.bytes_uploaded.fetch_add(bytes, Ordering::Relaxed);
        self.requests_served.fetch_add(1, Ordering::Relaxed);

        let now = Instant::now();

        // Update per-space stats
        if let Ok(mut stats) = self.space_stats.write() {
            let entry = stats.entry(space_id).or_default();
            entry.bytes_uploaded += bytes;
            entry.requests_served += 1;
        }

        // Add to rolling window
        if let Ok(mut samples) = self.hourly_samples.write() {
            samples.push_back(RollingSample {
                timestamp: now,
                bytes,
            });
            // Prune old samples
            Self::prune_old_samples(&mut samples, now);
        }

        // Update last activity
        if let Ok(mut last) = self.last_activity.write() {
            *last = Some(now);
        }
    }

    /// Record a denied request (rate limited)
    pub fn record_denied(&self) {
        self.requests_denied.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a download (content received from peer)
    pub fn record_download(&self, bytes: u64) {
        self.bytes_downloaded.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Get total bytes uploaded
    #[must_use]
    pub fn bytes_uploaded(&self) -> u64 {
        self.bytes_uploaded.load(Ordering::Relaxed)
    }

    /// Get total bytes downloaded
    #[must_use]
    pub fn bytes_downloaded(&self) -> u64 {
        self.bytes_downloaded.load(Ordering::Relaxed)
    }

    /// Get total requests served
    #[must_use]
    pub fn requests_served(&self) -> u64 {
        self.requests_served.load(Ordering::Relaxed)
    }

    /// Get total requests denied
    #[must_use]
    pub fn requests_denied(&self) -> u64 {
        self.requests_denied.load(Ordering::Relaxed)
    }

    /// Get bytes uploaded in the last hour
    #[must_use]
    pub fn bytes_uploaded_last_hour(&self) -> u64 {
        let now = Instant::now();

        if let Ok(mut samples) = self.hourly_samples.write() {
            Self::prune_old_samples(&mut samples, now);
            samples.iter().map(|s| s.bytes).sum()
        } else {
            0
        }
    }

    /// Get current seeding health
    #[must_use]
    pub fn health(&self) -> SeedingHealth {
        let now = Instant::now();

        if let Ok(last) = self.last_activity.read() {
            if let Some(last_time) = *last {
                let elapsed = now.duration_since(last_time).as_secs();

                if elapsed < HEALTHY_THRESHOLD_SECS {
                    return SeedingHealth::Healthy;
                } else if elapsed < DEGRADED_THRESHOLD_SECS {
                    return SeedingHealth::Degraded;
                }
            }
        }

        SeedingHealth::Inactive
    }

    /// Get statistics for a specific space
    #[must_use]
    pub fn space_stats(&self, space_id: &SpaceId) -> Option<SpaceStats> {
        self.space_stats
            .read()
            .ok()
            .and_then(|stats| stats.get(space_id).cloned())
    }

    /// Get all per-space statistics
    #[must_use]
    pub fn all_space_stats(&self) -> HashMap<SpaceId, SpaceStats> {
        self.space_stats
            .read()
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    /// Get uptime in seconds
    #[must_use]
    pub fn uptime_secs(&self) -> u64 {
        self.created_at.elapsed().as_secs()
    }

    /// Reset all statistics
    pub fn reset(&self) {
        self.bytes_uploaded.store(0, Ordering::Relaxed);
        self.bytes_downloaded.store(0, Ordering::Relaxed);
        self.requests_served.store(0, Ordering::Relaxed);
        self.requests_denied.store(0, Ordering::Relaxed);

        if let Ok(mut stats) = self.space_stats.write() {
            stats.clear();
        }

        if let Ok(mut samples) = self.hourly_samples.write() {
            samples.clear();
        }

        if let Ok(mut last) = self.last_activity.write() {
            *last = None;
        }
    }

    /// Get a snapshot of all statistics
    #[must_use]
    pub fn snapshot(&self) -> StatisticsSnapshot {
        StatisticsSnapshot {
            bytes_uploaded: self.bytes_uploaded(),
            bytes_downloaded: self.bytes_downloaded(),
            requests_served: self.requests_served(),
            requests_denied: self.requests_denied(),
            bytes_uploaded_last_hour: self.bytes_uploaded_last_hour(),
            health: self.health(),
            space_stats: self.all_space_stats(),
            uptime_secs: self.uptime_secs(),
        }
    }

    /// Prune samples older than 1 hour
    fn prune_old_samples(samples: &mut VecDeque<RollingSample>, now: Instant) {
        while let Some(front) = samples.front() {
            if now.duration_since(front.timestamp).as_secs() > HOURLY_WINDOW_SECS {
                samples.pop_front();
            } else {
                break;
            }
        }
    }
}

/// Snapshot of statistics at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticsSnapshot {
    /// Total bytes uploaded
    pub bytes_uploaded: u64,
    /// Total bytes downloaded
    pub bytes_downloaded: u64,
    /// Total requests served
    pub requests_served: u64,
    /// Total requests denied (rate limited)
    pub requests_denied: u64,
    /// Bytes uploaded in last hour
    pub bytes_uploaded_last_hour: u64,
    /// Current health status
    pub health: SeedingHealth,
    /// Per-space statistics
    pub space_stats: HashMap<SpaceId, SpaceStats>,
    /// Uptime in seconds
    pub uptime_secs: u64,
}

impl StatisticsSnapshot {
    /// Format as human-readable summary
    #[must_use]
    pub fn summary(&self) -> String {
        format!(
            "Seeding: {} uploaded ({} last hour), {} requests served, {} denied, health: {:?}",
            format_bytes(self.bytes_uploaded),
            format_bytes(self.bytes_uploaded_last_hour),
            self.requests_served,
            self.requests_denied,
            self.health
        )
    }
}

/// Format bytes as human-readable string
fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_statistics_new() {
        let stats = SeedingStatistics::new();

        assert_eq!(stats.bytes_uploaded(), 0);
        assert_eq!(stats.bytes_downloaded(), 0);
        assert_eq!(stats.requests_served(), 0);
        assert_eq!(stats.requests_denied(), 0);
        assert_eq!(stats.health(), SeedingHealth::Inactive);
    }

    #[test]
    fn test_statistics_record_upload() {
        let stats = SeedingStatistics::new();
        let space_a = SpaceId::from_bytes([1u8; 32]);

        stats.record_upload(1000, space_a);

        assert_eq!(stats.bytes_uploaded(), 1000);
        assert_eq!(stats.requests_served(), 1);
    }

    #[test]
    fn test_statistics_multiple_uploads() {
        let stats = SeedingStatistics::new();
        let space_a = SpaceId::from_bytes([1u8; 32]);

        for _ in 0..10 {
            stats.record_upload(1_000_000, space_a);
        }

        assert_eq!(stats.bytes_uploaded(), 10_000_000);
        assert_eq!(stats.requests_served(), 10);
    }

    #[test]
    fn test_statistics_per_space() {
        let stats = SeedingStatistics::new();
        let space_a = SpaceId::from_bytes([1u8; 32]);
        let space_b = SpaceId::from_bytes([2u8; 32]);

        stats.record_upload(1000, space_a);
        stats.record_upload(2000, space_a);
        stats.record_upload(3000, space_b);

        let a_stats = stats.space_stats(&space_a).unwrap();
        assert_eq!(a_stats.bytes_uploaded, 3000);
        assert_eq!(a_stats.requests_served, 2);

        let b_stats = stats.space_stats(&space_b).unwrap();
        assert_eq!(b_stats.bytes_uploaded, 3000);
        assert_eq!(b_stats.requests_served, 1);
    }

    #[test]
    fn test_statistics_health_after_upload() {
        let stats = SeedingStatistics::new();
        let space = SpaceId::from_bytes([1u8; 32]);

        stats.record_upload(1000, space);

        assert_eq!(stats.health(), SeedingHealth::Healthy);
    }

    #[test]
    fn test_statistics_denied() {
        let stats = SeedingStatistics::new();

        stats.record_denied();
        stats.record_denied();

        assert_eq!(stats.requests_denied(), 2);
    }

    #[test]
    fn test_statistics_download() {
        let stats = SeedingStatistics::new();

        stats.record_download(5000);

        assert_eq!(stats.bytes_downloaded(), 5000);
    }

    #[test]
    fn test_statistics_reset() {
        let stats = SeedingStatistics::new();
        let space = SpaceId::from_bytes([1u8; 32]);

        stats.record_upload(1000, space);
        stats.record_denied();

        stats.reset();

        assert_eq!(stats.bytes_uploaded(), 0);
        assert_eq!(stats.requests_served(), 0);
        assert_eq!(stats.requests_denied(), 0);
        assert!(stats.all_space_stats().is_empty());
    }

    #[test]
    fn test_statistics_snapshot() {
        let stats = SeedingStatistics::new();
        let space = SpaceId::from_bytes([1u8; 32]);

        stats.record_upload(1000, space);
        stats.record_denied();

        let snapshot = stats.snapshot();

        assert_eq!(snapshot.bytes_uploaded, 1000);
        assert_eq!(snapshot.requests_served, 1);
        assert_eq!(snapshot.requests_denied, 1);
        assert_eq!(snapshot.health, SeedingHealth::Healthy);
        assert!(snapshot.uptime_secs <= 1);
    }

    #[test]
    fn test_statistics_bytes_uploaded_last_hour() {
        let stats = SeedingStatistics::new();
        let space = SpaceId::from_bytes([1u8; 32]);

        for _ in 0..5 {
            stats.record_upload(1000, space);
        }

        let last_hour = stats.bytes_uploaded_last_hour();
        assert_eq!(last_hour, 5000);
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1536), "1.50 KB");
        assert_eq!(format_bytes(1_572_864), "1.50 MB");
        assert_eq!(format_bytes(1_610_612_736), "1.50 GB");
    }

    #[test]
    fn test_snapshot_summary() {
        let stats = SeedingStatistics::new();
        let space = SpaceId::from_bytes([1u8; 32]);

        // Use exactly 1 MiB to get "1.00 MB" in output
        stats.record_upload(1_048_576, space);

        let snapshot = stats.snapshot();
        let summary = snapshot.summary();

        // Check that summary contains expected parts
        assert!(
            summary.contains("MB") || summary.contains("KB"),
            "Summary should mention MB or KB: {}",
            summary
        );
        assert!(
            summary.contains("1 requests") || summary.contains("requests served"),
            "Summary should mention requests: {}",
            summary
        );
        assert!(
            summary.contains("Healthy"),
            "Summary should mention Healthy: {}",
            summary
        );
    }
}
