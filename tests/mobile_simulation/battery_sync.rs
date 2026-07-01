//! Battery-Conscious Sync Simulation for Mobile Devices
//!
//! Tests mobile sync modes that conserve battery and cellular data.
//! Implements SyncMode and SyncBudget from the plan.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use swimchain::storage::config::MobileConfig;
use swimchain::types::content::SpaceId;

// Re-export bandwidth throttle for integrated testing
pub use super::bandwidth_throttle::{BandwidthSimulator, NetworkProfile, HEADER_SIZE};

/// Sync mode for battery-conscious operation
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncMode {
    /// Full sync - headers + all content
    FullSync,
    /// Header-only - sync chain headers, defer content fetching
    HeaderOnly,
    /// Space sync - headers + content for specific spaces only
    SpaceSync { space_ids: Vec<SpaceId> },
}

impl SyncMode {
    /// Get descriptive name
    pub fn name(&self) -> &'static str {
        match self {
            Self::FullSync => "Full Sync",
            Self::HeaderOnly => "Header Only",
            Self::SpaceSync { .. } => "Space Sync",
        }
    }

    /// Check if mode fetches content (not just headers)
    pub fn fetches_content(&self) -> bool {
        matches!(self, Self::FullSync | Self::SpaceSync { .. })
    }
}

/// Sync budget for cellular data management
///
/// Tracks daily cellular usage against MobileConfig limits.
pub struct SyncBudget {
    /// Bytes allowed on cellular per day
    cellular_limit_bytes: u64,
    /// Bytes used today on cellular
    cellular_bytes_used: AtomicU64,
    /// Last reset timestamp (Unix seconds)
    last_reset: AtomicU64,
}

impl SyncBudget {
    /// Create a new sync budget from MobileConfig
    pub fn new(config: &MobileConfig) -> Self {
        Self {
            cellular_limit_bytes: config.cellular_limit_mb_per_day as u64 * 1_024 * 1_024,
            cellular_bytes_used: AtomicU64::new(0),
            last_reset: AtomicU64::new(current_day_timestamp()),
        }
    }

    /// Create a budget with custom limit (for testing)
    pub fn with_limit_mb(limit_mb: u32) -> Self {
        Self {
            cellular_limit_bytes: limit_mb as u64 * 1_024 * 1_024,
            cellular_bytes_used: AtomicU64::new(0),
            last_reset: AtomicU64::new(current_day_timestamp()),
        }
    }

    /// Check if transfer of given bytes is allowed
    pub fn can_transfer(&self, bytes: u64) -> bool {
        self.reset_if_new_day();
        let used = self.cellular_bytes_used.load(Ordering::Relaxed);
        used + bytes <= self.cellular_limit_bytes
    }

    /// Record a transfer (returns true if within limit)
    pub fn record_transfer(&self, bytes: u64) -> bool {
        self.reset_if_new_day();
        let used = self.cellular_bytes_used.fetch_add(bytes, Ordering::Relaxed);
        used + bytes <= self.cellular_limit_bytes
    }

    /// Get remaining bytes in daily budget
    pub fn remaining_bytes(&self) -> u64 {
        self.reset_if_new_day();
        let used = self.cellular_bytes_used.load(Ordering::Relaxed);
        self.cellular_limit_bytes.saturating_sub(used)
    }

    /// Get used bytes today
    pub fn used_bytes(&self) -> u64 {
        self.reset_if_new_day();
        self.cellular_bytes_used.load(Ordering::Relaxed)
    }

    /// Get the daily limit
    pub fn limit_bytes(&self) -> u64 {
        self.cellular_limit_bytes
    }

    /// Reset budget (as if new day started)
    pub fn reset(&self) {
        self.cellular_bytes_used.store(0, Ordering::Relaxed);
        self.last_reset
            .store(current_day_timestamp(), Ordering::Relaxed);
    }

    /// Reset if a new day has started
    fn reset_if_new_day(&self) {
        let current_day = current_day_timestamp();
        let last = self.last_reset.load(Ordering::Relaxed);
        if current_day > last {
            // New day - try to reset (CAS to avoid races)
            if self
                .last_reset
                .compare_exchange(last, current_day, Ordering::AcqRel, Ordering::Relaxed)
                .is_ok()
            {
                self.cellular_bytes_used.store(0, Ordering::Relaxed);
            }
        }
    }
}

/// Get current day timestamp (midnight UTC)
fn current_day_timestamp() -> u64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Round down to start of day (86400 seconds per day)
    (now / 86400) * 86400
}

/// Simulated sync result
#[derive(Debug, Clone)]
pub struct SyncResult {
    /// Number of headers synced
    pub headers_synced: usize,
    /// Bytes transferred for headers
    pub header_bytes: u64,
    /// Number of content items synced
    pub content_items_synced: usize,
    /// Bytes transferred for content
    pub content_bytes: u64,
    /// Total time taken
    pub duration: Duration,
    /// Whether sync was complete or truncated by budget
    pub complete: bool,
}

impl SyncResult {
    /// Get total bytes transferred
    pub fn total_bytes(&self) -> u64 {
        self.header_bytes + self.content_bytes
    }
}

/// Simulated sync manager for testing
pub struct SyncSimulator {
    mode: SyncMode,
    bandwidth: BandwidthSimulator,
    budget: Option<SyncBudget>,
}

impl SyncSimulator {
    /// Create sync simulator with given parameters
    pub fn new(mode: SyncMode, network: NetworkProfile, budget: Option<SyncBudget>) -> Self {
        Self {
            mode,
            bandwidth: BandwidthSimulator::new(network),
            budget,
        }
    }

    /// Simulate syncing headers
    pub fn sync_headers(&self, count: usize) -> SyncResult {
        let start = Instant::now();
        let header_bytes = count as u64 * HEADER_SIZE as u64;

        // Check budget if on cellular
        let allowed_bytes = if let Some(ref budget) = self.budget {
            let remaining = budget.remaining_bytes();
            if remaining < header_bytes {
                // Truncate to budget
                remaining
            } else {
                header_bytes
            }
        } else {
            header_bytes
        };

        let actual_headers = (allowed_bytes / HEADER_SIZE as u64) as usize;
        let actual_bytes = actual_headers as u64 * HEADER_SIZE as u64;

        // Simulate transfer
        let _duration = self.bandwidth.transfer(actual_bytes as usize);

        // Record budget usage
        if let Some(ref budget) = self.budget {
            budget.record_transfer(actual_bytes);
        }

        SyncResult {
            headers_synced: actual_headers,
            header_bytes: actual_bytes,
            content_items_synced: 0,
            content_bytes: 0,
            duration: start.elapsed(),
            complete: actual_headers == count,
        }
    }

    /// Simulate full sync (headers + content)
    pub fn sync_full(
        &self,
        headers: usize,
        content_items: usize,
        avg_content_size: u64,
    ) -> SyncResult {
        let start = Instant::now();
        let header_bytes = headers as u64 * HEADER_SIZE as u64;
        let content_bytes = content_items as u64 * avg_content_size;
        let total_bytes = header_bytes + content_bytes;

        // Check if mode allows content sync
        if !self.mode.fetches_content() {
            // Header-only mode
            return self.sync_headers(headers);
        }

        // Check budget
        let allowed_bytes = if let Some(ref budget) = self.budget {
            budget.remaining_bytes().min(total_bytes)
        } else {
            total_bytes
        };

        // Calculate how much we can sync
        let (actual_headers, actual_header_bytes, actual_content, actual_content_bytes) =
            if allowed_bytes >= header_bytes {
                // Can sync all headers, calculate content
                let content_budget = allowed_bytes - header_bytes;
                let content_count = (content_budget / avg_content_size) as usize;
                let content_count = content_count.min(content_items);
                (
                    headers,
                    header_bytes,
                    content_count,
                    content_count as u64 * avg_content_size,
                )
            } else {
                // Can only sync partial headers
                let h = (allowed_bytes / HEADER_SIZE as u64) as usize;
                (h, h as u64 * HEADER_SIZE as u64, 0, 0)
            };

        // Simulate transfer
        let _duration = self
            .bandwidth
            .transfer((actual_header_bytes + actual_content_bytes) as usize);

        // Record budget
        if let Some(ref budget) = self.budget {
            budget.record_transfer(actual_header_bytes + actual_content_bytes);
        }

        SyncResult {
            headers_synced: actual_headers,
            header_bytes: actual_header_bytes,
            content_items_synced: actual_content,
            content_bytes: actual_content_bytes,
            duration: start.elapsed(),
            complete: actual_headers == headers && actual_content == content_items,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==========================================================================
    // SyncMode Tests
    // ==========================================================================

    #[test]
    fn test_sync_mode_types() {
        let full = SyncMode::FullSync;
        assert!(full.fetches_content());

        let header_only = SyncMode::HeaderOnly;
        assert!(!header_only.fetches_content());

        let space = SyncMode::SpaceSync {
            space_ids: vec![SpaceId::from_bytes([1u8; 32])],
        };
        assert!(space.fetches_content());
    }

    // ==========================================================================
    // SyncBudget Tests
    // ==========================================================================

    #[test]
    fn test_sync_budget_creation() {
        let config = MobileConfig::standard();
        let budget = SyncBudget::new(&config);

        // Standard config: 100 MB/day
        assert_eq!(budget.limit_bytes(), 100 * 1024 * 1024);
        assert_eq!(budget.used_bytes(), 0);
        assert_eq!(budget.remaining_bytes(), 100 * 1024 * 1024);
    }

    #[test]
    fn test_cellular_limit_enforcement() {
        let budget = SyncBudget::with_limit_mb(100); // 100 MB limit

        // Can transfer under limit
        assert!(budget.can_transfer(50 * 1024 * 1024)); // 50 MB

        // Record 80 MB transfer
        assert!(budget.record_transfer(80 * 1024 * 1024));
        assert_eq!(budget.used_bytes(), 80 * 1024 * 1024);
        assert_eq!(budget.remaining_bytes(), 20 * 1024 * 1024);

        // Can't transfer 30 MB more (would exceed)
        assert!(!budget.can_transfer(30 * 1024 * 1024));

        // Can transfer 15 MB (within remaining)
        assert!(budget.can_transfer(15 * 1024 * 1024));
    }

    #[test]
    fn test_cellular_limit_100mb() {
        // Test from plan: 100 MB/day, attempt 150 MB
        let mobile = MobileConfig::standard(); // cellular_limit_mb_per_day = 100
        let budget = SyncBudget::new(&mobile);

        // Attempt to transfer 150 MB
        let first_100mb = 100 * 1024 * 1024u64;
        let next_50mb = 50 * 1024 * 1024u64;

        // First 100 MB should succeed
        assert!(budget.can_transfer(first_100mb));
        budget.record_transfer(first_100mb);

        // Next 50 MB should fail
        assert!(
            !budget.can_transfer(next_50mb),
            "Should not allow exceeding 100 MB limit"
        );
        assert!(budget.remaining_bytes() < next_50mb);
    }

    #[test]
    fn test_budget_reset() {
        let budget = SyncBudget::with_limit_mb(100);

        // Use some budget
        budget.record_transfer(50 * 1024 * 1024);
        assert_eq!(budget.used_bytes(), 50 * 1024 * 1024);

        // Manual reset
        budget.reset();
        assert_eq!(budget.used_bytes(), 0);
        assert_eq!(budget.remaining_bytes(), 100 * 1024 * 1024);
    }

    // ==========================================================================
    // Header-Only Sync Tests
    // ==========================================================================

    #[test]
    fn test_header_only_bandwidth() {
        // Test from plan: 100K headers at 200 bytes = 20 MB
        let sim = SyncSimulator::new(
            SyncMode::HeaderOnly,
            NetworkProfile::Cellular4G,
            None, // No budget limit for this test
        );

        let result = sim.sync_headers(100_000);

        // Should sync all headers
        assert_eq!(result.headers_synced, 100_000);
        assert_eq!(result.header_bytes, 100_000 * HEADER_SIZE as u64); // 20 MB
        assert!(result.complete);

        // No content should be synced in header-only mode
        assert_eq!(result.content_items_synced, 0);
        assert_eq!(result.content_bytes, 0);

        println!(
            "Header-only sync: {} headers, {} MB in {:?}",
            result.headers_synced,
            result.header_bytes as f64 / 1_048_576.0,
            result.duration
        );
    }

    #[test]
    fn test_header_only_no_content() {
        let sim = SyncSimulator::new(SyncMode::HeaderOnly, NetworkProfile::WiFi, None);

        // Try to sync with content - should ignore content
        let result = sim.sync_full(1000, 100, 100_000); // 100 items at 100KB each

        // Only headers synced
        assert_eq!(result.headers_synced, 1000);
        assert_eq!(result.content_items_synced, 0);
        assert_eq!(result.content_bytes, 0);
    }

    // ==========================================================================
    // Full Sync Tests
    // ==========================================================================

    #[test]
    fn test_full_sync_mode() {
        let sim = SyncSimulator::new(SyncMode::FullSync, NetworkProfile::WiFi, None);

        // Sync headers and content
        let result = sim.sync_full(1000, 50, 100_000); // 50 items at 100KB

        assert_eq!(result.headers_synced, 1000);
        assert_eq!(result.content_items_synced, 50);
        assert_eq!(result.content_bytes, 50 * 100_000);
        assert!(result.complete);

        let total = result.total_bytes();
        let expected = (1000 * HEADER_SIZE as u64) + (50 * 100_000);
        assert_eq!(total, expected);
    }

    // ==========================================================================
    // Budget-Limited Sync Tests
    // ==========================================================================

    #[test]
    fn test_sync_with_budget_limit() {
        // 10 MB budget
        let budget = SyncBudget::with_limit_mb(10);

        let sim = SyncSimulator::new(SyncMode::FullSync, NetworkProfile::Cellular4G, Some(budget));

        // Try to sync more than budget allows
        // Headers: 10,000 × 200 = 2 MB
        // Content: 100 × 100 KB = 10 MB
        // Total: 12 MB (over budget)
        let result = sim.sync_full(10_000, 100, 100_000);

        // Should sync all headers (2 MB) but not all content
        assert_eq!(result.headers_synced, 10_000);
        assert_eq!(result.header_bytes, 2_000_000);

        // Content limited by remaining budget (8 MB)
        assert!(result.content_items_synced < 100);
        assert!(result.total_bytes() <= 10 * 1024 * 1024);
        assert!(!result.complete);

        println!(
            "Budget-limited sync: {} headers, {} content items, {:.2} MB total",
            result.headers_synced,
            result.content_items_synced,
            result.total_bytes() as f64 / 1_048_576.0
        );
    }

    #[test]
    fn test_header_sync_truncated_by_budget() {
        // Very small budget: 1 MB
        let budget = SyncBudget::with_limit_mb(1);

        let sim = SyncSimulator::new(
            SyncMode::HeaderOnly,
            NetworkProfile::Cellular3G,
            Some(budget),
        );

        // Try to sync 10,000 headers (2 MB)
        let result = sim.sync_headers(10_000);

        // Should only sync ~5,000 headers (1 MB / 200 bytes)
        let expected_headers = (1 * 1024 * 1024) / HEADER_SIZE as u64;
        assert_eq!(result.headers_synced as u64, expected_headers);
        assert!(!result.complete);
    }

    // ==========================================================================
    // Space Sync Mode Tests
    // ==========================================================================

    #[test]
    fn test_space_sync_mode() {
        let spaces = vec![
            SpaceId::from_bytes([1u8; 32]),
            SpaceId::from_bytes([2u8; 32]),
        ];

        let sim = SyncSimulator::new(
            SyncMode::SpaceSync {
                space_ids: spaces.clone(),
            },
            NetworkProfile::WiFi,
            None,
        );

        // Space sync should fetch content
        let result = sim.sync_full(1000, 50, 50_000);
        assert_eq!(result.content_items_synced, 50);
        assert!(result.complete);
    }

    // ==========================================================================
    // Documentation Tests
    // ==========================================================================

    #[test]
    fn test_sync_mode_documentation() {
        println!("\nSync Modes for Battery Conservation:");
        println!("{:-<60}", "");
        println!(
            "{:<20} {:>20} {:>18}",
            "Mode", "Fetches Content", "Use Case"
        );
        println!("{:-<60}", "");
        println!(
            "{:<20} {:>20} {:>18}",
            SyncMode::FullSync.name(),
            "Yes",
            "WiFi only"
        );
        println!(
            "{:<20} {:>20} {:>18}",
            SyncMode::HeaderOnly.name(),
            "No",
            "Cellular/Low battery"
        );
        println!(
            "{:<20} {:>20} {:>18}",
            SyncMode::SpaceSync { space_ids: vec![] }.name(),
            "Subscribed only",
            "Normal cellular"
        );

        println!("\nRecommendations:");
        println!("- Use HeaderOnly for background sync on cellular");
        println!("- Use SpaceSync for subscribed content on cellular");
        println!("- Use FullSync only on WiFi with charger");
    }

    #[test]
    fn test_budget_scenarios() {
        let scenarios = [
            ("Budget phone", MobileConfig::budget()),
            ("Standard phone", MobileConfig::standard()),
            ("Flagship phone", MobileConfig::flagship()),
        ];

        println!("\nCellular Budget Scenarios (daily limits):");
        println!("{:-<60}", "");
        println!(
            "{:<20} {:>15} {:>22}",
            "Config", "Limit (MB)", "Headers Possible"
        );
        println!("{:-<60}", "");

        for (name, config) in scenarios {
            let headers_possible =
                (config.cellular_limit_mb_per_day as u64 * 1024 * 1024) / HEADER_SIZE as u64;
            println!(
                "{:<20} {:>15} {:>22}",
                name, config.cellular_limit_mb_per_day, headers_possible
            );
        }

        // Key finding: Even budget phone (50 MB/day) can sync 262,144 headers
        // That's enough for years of chain history headers
    }
}
