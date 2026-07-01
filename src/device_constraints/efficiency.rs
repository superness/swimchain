//! Efficiency tracking per SPEC_09 §9.3
//!
//! Tracks the ratio of contribution output to resource consumption.
//! High efficiency nodes can earn the "Efficient Swimmer" achievement.

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Threshold for Efficient Swimmer achievement
///
/// A node qualifies for the Efficient Swimmer badge when:
/// - efficiency_score >= EFFICIENT_SWIMMER_THRESHOLD
/// - bandwidth_served > 0
pub const EFFICIENT_SWIMMER_THRESHOLD: f32 = 2.0;

/// Efficiency tracker per SPEC_09 §9.3
///
/// Tracks the ratio of bandwidth served to resources consumed.
/// Higher ratios indicate more efficient contribution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EfficiencyTracker {
    /// Total bandwidth served (bytes) - output metric
    pub bandwidth_served: u64,

    /// Estimated battery consumed (mAh equivalent)
    pub battery_consumed: u64,

    /// Data used (bytes) - upload + download for mobile
    pub data_used: u64,

    /// Period this tracking covers (e.g., epoch number)
    pub period: u32,

    /// Last update timestamp (Unix seconds)
    pub last_update_secs: u64,
}

impl EfficiencyTracker {
    /// Create a new tracker for a given period
    pub fn new(period: u32) -> Self {
        Self {
            bandwidth_served: 0,
            battery_consumed: 0,
            data_used: 0,
            period,
            last_update_secs: 0,
        }
    }

    /// Get current Unix timestamp in seconds
    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Calculate efficiency score per SPEC_09 §9.3
    ///
    /// efficiency = bandwidth_served / (battery_consumed + data_used)
    ///
    /// Returns 0.0 if no resources consumed yet.
    /// Returns bandwidth_served as float if input is effectively zero.
    #[must_use]
    pub fn efficiency_score(&self) -> f32 {
        let output = self.bandwidth_served as f32;
        let input = (self.battery_consumed + self.data_used) as f32;

        // Prevent division by zero - use max(1.0) per spec
        output / input.max(1.0)
    }

    /// Check if eligible for Efficient Swimmer achievement
    ///
    /// Requires:
    /// - efficiency_score >= EFFICIENT_SWIMMER_THRESHOLD (2.0)
    /// - bandwidth_served > 0 (must have actually contributed)
    #[must_use]
    pub fn qualifies_for_efficient_swimmer(&self) -> bool {
        self.efficiency_score() >= EFFICIENT_SWIMMER_THRESHOLD && self.bandwidth_served > 0
    }

    /// Record bandwidth served
    pub fn record_bandwidth(&mut self, bytes: u64) {
        self.bandwidth_served = self.bandwidth_served.saturating_add(bytes);
        self.last_update_secs = Self::now_secs();
    }

    /// Record battery consumption (in mAh equivalent)
    pub fn record_battery(&mut self, mah: u64) {
        self.battery_consumed = self.battery_consumed.saturating_add(mah);
        self.last_update_secs = Self::now_secs();
    }

    /// Record data usage (upload + download bytes)
    pub fn record_data(&mut self, bytes: u64) {
        self.data_used = self.data_used.saturating_add(bytes);
        self.last_update_secs = Self::now_secs();
    }

    /// Reset for a new period
    pub fn reset_for_period(&mut self, period: u32) {
        *self = Self::new(period);
    }

    /// Get total resources consumed
    #[must_use]
    pub fn total_resources(&self) -> u64 {
        self.battery_consumed.saturating_add(self.data_used)
    }

    /// Get human-readable efficiency summary
    #[must_use]
    pub fn summary(&self) -> String {
        let score = self.efficiency_score();
        let rating = if score >= 3.0 {
            "Excellent"
        } else if score >= 2.0 {
            "Good"
        } else if score >= 1.0 {
            "Fair"
        } else if score > 0.0 {
            "Low"
        } else {
            "None"
        };

        format!(
            "Efficiency: {:.2} ({}), Served: {}B, Resources: {}",
            score,
            rating,
            format_bytes(self.bandwidth_served),
            format_bytes(self.total_resources())
        )
    }

    /// Check if tracker has any activity
    #[must_use]
    pub fn has_activity(&self) -> bool {
        self.bandwidth_served > 0 || self.battery_consumed > 0 || self.data_used > 0
    }

    /// Get age of last update in seconds
    #[must_use]
    pub fn age_secs(&self) -> u64 {
        if self.last_update_secs == 0 {
            return 0;
        }
        Self::now_secs().saturating_sub(self.last_update_secs)
    }
}

impl Default for EfficiencyTracker {
    fn default() -> Self {
        Self::new(0)
    }
}

/// Format bytes for display
fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.2}G", bytes as f64 / 1_000_000_000.0)
    } else if bytes >= 1_000_000 {
        format!("{:.1}M", bytes as f64 / 1_000_000.0)
    } else if bytes >= 1_000 {
        format!("{:.0}K", bytes as f64 / 1_000.0)
    } else {
        format!("{}", bytes)
    }
}

/// Period-based efficiency history
///
/// Maintains efficiency data across multiple periods for trend analysis.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EfficiencyHistory {
    /// Historical periods (newest first)
    periods: Vec<EfficiencyTracker>,

    /// Maximum periods to retain
    max_periods: usize,
}

impl EfficiencyHistory {
    /// Create new history with specified retention
    pub fn new(max_periods: usize) -> Self {
        Self {
            periods: Vec::new(),
            max_periods,
        }
    }

    /// Add a completed period
    pub fn add_period(&mut self, tracker: EfficiencyTracker) {
        self.periods.insert(0, tracker);
        if self.periods.len() > self.max_periods {
            self.periods.truncate(self.max_periods);
        }
    }

    /// Get average efficiency across all retained periods
    #[must_use]
    pub fn average_efficiency(&self) -> f32 {
        if self.periods.is_empty() {
            return 0.0;
        }

        let total: f32 = self.periods.iter().map(|p| p.efficiency_score()).sum();
        total / self.periods.len() as f32
    }

    /// Get trend (positive = improving, negative = declining)
    #[must_use]
    pub fn trend(&self) -> f32 {
        if self.periods.len() < 2 {
            return 0.0;
        }

        let recent = self.periods[0].efficiency_score();
        let older = self.periods[1].efficiency_score();

        recent - older
    }

    /// Get all periods
    pub fn periods(&self) -> &[EfficiencyTracker] {
        &self.periods
    }

    /// Get number of periods
    #[must_use]
    pub fn len(&self) -> usize {
        self.periods.len()
    }

    /// Check if empty
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.periods.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_tracker() {
        let tracker = EfficiencyTracker::new(42);
        assert_eq!(tracker.period, 42);
        assert_eq!(tracker.bandwidth_served, 0);
        assert_eq!(tracker.battery_consumed, 0);
        assert_eq!(tracker.data_used, 0);
    }

    #[test]
    fn test_efficiency_score_formula() {
        let mut tracker = EfficiencyTracker::new(1);

        // bandwidth=1000, battery=200, data=300
        // efficiency = 1000 / (200 + 300) = 1000 / 500 = 2.0
        tracker.bandwidth_served = 1000;
        tracker.battery_consumed = 200;
        tracker.data_used = 300;

        assert!((tracker.efficiency_score() - 2.0).abs() < 0.001);
    }

    #[test]
    fn test_efficiency_score_zero_input() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.bandwidth_served = 1000;
        // battery and data are 0

        // Should use max(1.0) for input: 1000 / 1.0 = 1000.0
        assert!((tracker.efficiency_score() - 1000.0).abs() < 0.001);
    }

    #[test]
    fn test_efficiency_score_no_output() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.battery_consumed = 100;
        tracker.data_used = 100;

        // 0 / 200 = 0.0
        assert_eq!(tracker.efficiency_score(), 0.0);
    }

    #[test]
    fn test_qualifies_for_efficient_swimmer() {
        let mut tracker = EfficiencyTracker::new(1);

        // No bandwidth = doesn't qualify
        tracker.battery_consumed = 100;
        tracker.data_used = 100;
        assert!(!tracker.qualifies_for_efficient_swimmer());

        // Add bandwidth but score < 2.0
        tracker.bandwidth_served = 100; // 100 / 200 = 0.5
        assert!(!tracker.qualifies_for_efficient_swimmer());

        // Increase bandwidth for score >= 2.0
        tracker.bandwidth_served = 400; // 400 / 200 = 2.0
        assert!(tracker.qualifies_for_efficient_swimmer());

        // Higher efficiency also qualifies
        tracker.bandwidth_served = 600; // 600 / 200 = 3.0
        assert!(tracker.qualifies_for_efficient_swimmer());
    }

    #[test]
    fn test_record_methods() {
        let mut tracker = EfficiencyTracker::new(1);

        tracker.record_bandwidth(100);
        assert_eq!(tracker.bandwidth_served, 100);
        assert!(tracker.last_update_secs > 0);

        tracker.record_bandwidth(50);
        assert_eq!(tracker.bandwidth_served, 150);

        tracker.record_battery(25);
        assert_eq!(tracker.battery_consumed, 25);

        tracker.record_data(75);
        assert_eq!(tracker.data_used, 75);
    }

    #[test]
    fn test_reset_for_period() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.bandwidth_served = 1000;
        tracker.battery_consumed = 100;
        tracker.data_used = 200;

        tracker.reset_for_period(2);

        assert_eq!(tracker.period, 2);
        assert_eq!(tracker.bandwidth_served, 0);
        assert_eq!(tracker.battery_consumed, 0);
        assert_eq!(tracker.data_used, 0);
    }

    #[test]
    fn test_total_resources() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.battery_consumed = 100;
        tracker.data_used = 200;

        assert_eq!(tracker.total_resources(), 300);
    }

    #[test]
    fn test_has_activity() {
        let mut tracker = EfficiencyTracker::new(1);
        assert!(!tracker.has_activity());

        tracker.bandwidth_served = 1;
        assert!(tracker.has_activity());

        let mut tracker2 = EfficiencyTracker::new(1);
        tracker2.battery_consumed = 1;
        assert!(tracker2.has_activity());
    }

    #[test]
    fn test_summary() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.bandwidth_served = 1_000_000;
        tracker.battery_consumed = 200_000;
        tracker.data_used = 300_000;

        let summary = tracker.summary();
        assert!(summary.contains("Efficiency:"));
        assert!(summary.contains("2.00"));
        assert!(summary.contains("Good"));
    }

    #[test]
    fn test_serialization() {
        let mut tracker = EfficiencyTracker::new(42);
        tracker.bandwidth_served = 1000;
        tracker.battery_consumed = 100;
        tracker.data_used = 200;

        let serialized = bincode::serialize(&tracker).unwrap();
        let deserialized: EfficiencyTracker = bincode::deserialize(&serialized).unwrap();

        assert_eq!(tracker.period, deserialized.period);
        assert_eq!(tracker.bandwidth_served, deserialized.bandwidth_served);
        assert_eq!(tracker.battery_consumed, deserialized.battery_consumed);
        assert_eq!(tracker.data_used, deserialized.data_used);
    }

    #[test]
    fn test_saturating_add() {
        let mut tracker = EfficiencyTracker::new(1);
        tracker.bandwidth_served = u64::MAX - 10;

        // Should saturate instead of overflow
        tracker.record_bandwidth(100);
        assert_eq!(tracker.bandwidth_served, u64::MAX);
    }

    #[test]
    fn test_efficiency_history_new() {
        let history = EfficiencyHistory::new(5);
        assert!(history.is_empty());
        assert_eq!(history.len(), 0);
    }

    #[test]
    fn test_efficiency_history_add() {
        let mut history = EfficiencyHistory::new(3);

        let mut t1 = EfficiencyTracker::new(1);
        t1.bandwidth_served = 100;
        t1.data_used = 50;
        history.add_period(t1);

        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_efficiency_history_max_periods() {
        let mut history = EfficiencyHistory::new(2);

        for i in 0..5 {
            let mut tracker = EfficiencyTracker::new(i);
            tracker.bandwidth_served = (i as u64 + 1) * 100;
            tracker.data_used = 50;
            history.add_period(tracker);
        }

        // Should only have 2 periods
        assert_eq!(history.len(), 2);
        // Newest should be first
        assert_eq!(history.periods()[0].period, 4);
        assert_eq!(history.periods()[1].period, 3);
    }

    #[test]
    fn test_efficiency_history_average() {
        let mut history = EfficiencyHistory::new(3);

        // Add periods with scores: 1.0, 2.0, 3.0
        for (i, score) in [1.0f32, 2.0, 3.0].iter().enumerate() {
            let mut tracker = EfficiencyTracker::new(i as u32);
            tracker.bandwidth_served = (*score * 100.0) as u64;
            tracker.data_used = 100;
            history.add_period(tracker);
        }

        // Average should be 2.0
        assert!((history.average_efficiency() - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_efficiency_history_trend() {
        let mut history = EfficiencyHistory::new(3);

        // Add improving trend: 1.0 -> 2.0
        let mut t1 = EfficiencyTracker::new(1);
        t1.bandwidth_served = 100;
        t1.data_used = 100;
        history.add_period(t1); // score = 1.0

        let mut t2 = EfficiencyTracker::new(2);
        t2.bandwidth_served = 200;
        t2.data_used = 100;
        history.add_period(t2); // score = 2.0

        // Trend should be positive (2.0 - 1.0 = 1.0)
        assert!((history.trend() - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500");
        assert_eq!(format_bytes(1500), "2K");
        assert_eq!(format_bytes(1_500_000), "1.5M");
        assert_eq!(format_bytes(2_500_000_000), "2.50G");
    }

    #[test]
    fn test_threshold_constant() {
        assert_eq!(EFFICIENT_SWIMMER_THRESHOLD, 2.0);
    }
}
