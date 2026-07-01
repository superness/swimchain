//! Timing utilities for E2E flow tests
//!
//! Provides timing collection and assertions for validating
//! performance requirements across user flows.

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Collects timing measurements for test operations
pub struct TimingCollector {
    timings: HashMap<String, Vec<Duration>>,
}

impl TimingCollector {
    /// Create a new timing collector
    #[must_use]
    pub fn new() -> Self {
        Self {
            timings: HashMap::new(),
        }
    }

    /// Record a duration for a named operation
    pub fn record(&mut self, name: &str, duration: Duration) {
        self.timings
            .entry(name.to_string())
            .or_default()
            .push(duration);
    }

    /// Time an operation and record the duration
    pub fn time<T, F: FnOnce() -> T>(&mut self, name: &str, f: F) -> T {
        let start = Instant::now();
        let result = f();
        self.record(name, start.elapsed());
        result
    }

    /// Get the average duration for a named operation
    #[must_use]
    pub fn average(&self, name: &str) -> Option<Duration> {
        self.timings.get(name).map(|v| {
            let total: Duration = v.iter().sum();
            total / v.len() as u32
        })
    }

    /// Get the total duration for a named operation
    #[must_use]
    pub fn total(&self, name: &str) -> Option<Duration> {
        self.timings.get(name).map(|v| v.iter().sum())
    }

    /// Get the minimum duration for a named operation
    #[must_use]
    pub fn min(&self, name: &str) -> Option<Duration> {
        self.timings.get(name).and_then(|v| v.iter().min().copied())
    }

    /// Get the maximum duration for a named operation
    #[must_use]
    pub fn max(&self, name: &str) -> Option<Duration> {
        self.timings.get(name).and_then(|v| v.iter().max().copied())
    }

    /// Get number of samples for a named operation
    #[must_use]
    pub fn count(&self, name: &str) -> usize {
        self.timings.get(name).map_or(0, |v| v.len())
    }

    /// Generate a summary string for all recorded timings
    #[must_use]
    pub fn summary(&self) -> String {
        let mut output = String::new();
        let mut names: Vec<_> = self.timings.keys().collect();
        names.sort();

        for name in names {
            if let Some(durations) = self.timings.get(name) {
                let count = durations.len();
                let avg = durations.iter().sum::<Duration>() / count as u32;
                let min = durations.iter().min().copied().unwrap_or(Duration::ZERO);
                let max = durations.iter().max().copied().unwrap_or(Duration::ZERO);

                if count == 1 {
                    output.push_str(&format!("  {}: {:?}\n", name, avg));
                } else {
                    output.push_str(&format!(
                        "  {}: avg={:?}, min={:?}, max={:?}, n={}\n",
                        name, avg, min, max, count
                    ));
                }
            }
        }
        output
    }

    /// Assert that average timing is under a threshold
    pub fn assert_under(&self, name: &str, threshold: Duration) {
        if let Some(avg) = self.average(name) {
            assert!(
                avg < threshold,
                "{} average {:?} exceeds threshold {:?}",
                name,
                avg,
                threshold
            );
        }
    }

    /// Assert that total timing is under a threshold
    pub fn assert_total_under(&self, name: &str, threshold: Duration) {
        if let Some(total) = self.total(name) {
            assert!(
                total < threshold,
                "{} total {:?} exceeds threshold {:?}",
                name,
                total,
                threshold
            );
        }
    }
}

impl Default for TimingCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timing_collector() {
        let mut timing = TimingCollector::new();

        timing.record("test_op", Duration::from_millis(100));
        timing.record("test_op", Duration::from_millis(200));

        assert_eq!(timing.count("test_op"), 2);
        assert_eq!(timing.average("test_op"), Some(Duration::from_millis(150)));
        assert_eq!(timing.min("test_op"), Some(Duration::from_millis(100)));
        assert_eq!(timing.max("test_op"), Some(Duration::from_millis(200)));
    }

    #[test]
    fn test_time_closure() {
        let mut timing = TimingCollector::new();

        let result = timing.time("compute", || {
            std::thread::sleep(Duration::from_millis(10));
            42
        });

        assert_eq!(result, 42);
        assert!(timing.average("compute").unwrap() >= Duration::from_millis(10));
    }
}
