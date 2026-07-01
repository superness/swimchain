//! Achievement tracker for in-memory tracking
//!
//! Tracks unlocked achievements with permanence guarantees per SPEC_09 §5.3.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::types::{Achievement, AchievementRecord};

/// Genesis epoch timestamp (2025-01-01 00:00:00 UTC)
const GENESIS_EPOCH_SECS: u64 = 1735689600;

/// Tracks achievements for an identity.
///
/// Per SPEC_09 §5.3, achievements are:
/// - Permanent once earned (cannot be revoked)
/// - Non-transferable (tied to identity)
/// - Visible on profile
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AchievementTracker {
    /// Map of unlocked achievements to their records
    unlocked: HashMap<Achievement, AchievementRecord>,
}

impl AchievementTracker {
    /// Create a new empty achievement tracker.
    pub fn new() -> Self {
        Self::default()
    }

    /// Unlock an achievement at the given timestamp.
    ///
    /// Returns true if the achievement was newly unlocked,
    /// false if it was already earned (permanence guarantee).
    pub fn unlock(&mut self, achievement: Achievement, timestamp_secs: u64) -> bool {
        // PERMANENCE: Already earned achievements cannot be re-earned
        if self.unlocked.contains_key(&achievement) {
            return false;
        }

        let day = Self::timestamp_to_day(timestamp_secs);
        self.unlocked.insert(
            achievement,
            AchievementRecord::new(achievement, timestamp_secs, day),
        );
        true
    }

    /// Check if an achievement has been earned.
    pub fn has(&self, achievement: Achievement) -> bool {
        self.unlocked.contains_key(&achievement)
    }

    /// Get the record for a specific achievement.
    pub fn get(&self, achievement: Achievement) -> Option<&AchievementRecord> {
        self.unlocked.get(&achievement)
    }

    /// Get all unlocked achievement records.
    pub fn all_achievements(&self) -> Vec<AchievementRecord> {
        self.unlocked.values().cloned().collect()
    }

    /// Get all unlocked achievement types (without timing info).
    pub fn unlocked_achievements(&self) -> Vec<Achievement> {
        self.unlocked.keys().copied().collect()
    }

    /// Get the count of unlocked achievements.
    pub fn count(&self) -> usize {
        self.unlocked.len()
    }

    /// Convert a Unix timestamp to days since genesis epoch.
    fn timestamp_to_day(ts: u64) -> u32 {
        const SECONDS_PER_DAY: u64 = 86400;
        ((ts.saturating_sub(GENESIS_EPOCH_SECS)) / SECONDS_PER_DAY) as u32
    }

    /// Check if the tracker is empty (no achievements).
    pub fn is_empty(&self) -> bool {
        self.unlocked.is_empty()
    }

    /// Get achievements unlocked on a specific day.
    pub fn achievements_on_day(&self, day: u32) -> Vec<&AchievementRecord> {
        self.unlocked
            .values()
            .filter(|r| r.unlocked_day == day)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_TIMESTAMP: u64 = GENESIS_EPOCH_SECS + 86400 * 10; // Day 10

    #[test]
    fn test_new_tracker() {
        let tracker = AchievementTracker::new();
        assert!(tracker.is_empty());
        assert_eq!(tracker.count(), 0);
    }

    #[test]
    fn test_unlock_achievement() {
        let mut tracker = AchievementTracker::new();

        // First unlock should succeed
        assert!(tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP));
        assert!(tracker.has(Achievement::FirstStroke));
        assert_eq!(tracker.count(), 1);

        // Verify record
        let record = tracker.get(Achievement::FirstStroke).unwrap();
        assert_eq!(record.achievement, Achievement::FirstStroke);
        assert_eq!(record.unlocked_at_secs, TEST_TIMESTAMP);
        assert_eq!(record.unlocked_day, 10);
    }

    #[test]
    fn test_permanence() {
        let mut tracker = AchievementTracker::new();

        // First unlock
        assert!(tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP));

        // Second unlock should fail (already earned)
        assert!(!tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP + 1000));

        // Still only one achievement
        assert_eq!(tracker.count(), 1);

        // Original timestamp preserved
        let record = tracker.get(Achievement::FirstStroke).unwrap();
        assert_eq!(record.unlocked_at_secs, TEST_TIMESTAMP);
    }

    #[test]
    fn test_multiple_achievements() {
        let mut tracker = AchievementTracker::new();

        tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP);
        tracker.unlock(Achievement::FirstServe, TEST_TIMESTAMP + 100);
        tracker.unlock(Achievement::WeekSwimmer, TEST_TIMESTAMP + 86400 * 7);

        assert_eq!(tracker.count(), 3);
        assert!(tracker.has(Achievement::FirstStroke));
        assert!(tracker.has(Achievement::FirstServe));
        assert!(tracker.has(Achievement::WeekSwimmer));
        assert!(!tracker.has(Achievement::Centurion));
    }

    #[test]
    fn test_all_achievements() {
        let mut tracker = AchievementTracker::new();

        tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP);
        tracker.unlock(Achievement::Centurion, TEST_TIMESTAMP + 1000);

        let records = tracker.all_achievements();
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn test_unlocked_achievements() {
        let mut tracker = AchievementTracker::new();

        tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP);
        tracker.unlock(Achievement::FirstServe, TEST_TIMESTAMP);

        let achievements = tracker.unlocked_achievements();
        assert_eq!(achievements.len(), 2);
        assert!(achievements.contains(&Achievement::FirstStroke));
        assert!(achievements.contains(&Achievement::FirstServe));
    }

    #[test]
    fn test_achievements_on_day() {
        let mut tracker = AchievementTracker::new();

        let day_10 = GENESIS_EPOCH_SECS + 86400 * 10;
        let day_20 = GENESIS_EPOCH_SECS + 86400 * 20;

        tracker.unlock(Achievement::FirstStroke, day_10);
        tracker.unlock(Achievement::FirstServe, day_10 + 100); // Same day
        tracker.unlock(Achievement::WeekSwimmer, day_20);

        let day_10_achievements = tracker.achievements_on_day(10);
        assert_eq!(day_10_achievements.len(), 2);

        let day_20_achievements = tracker.achievements_on_day(20);
        assert_eq!(day_20_achievements.len(), 1);

        let day_30_achievements = tracker.achievements_on_day(30);
        assert!(day_30_achievements.is_empty());
    }

    #[test]
    fn test_serialization() {
        let mut tracker = AchievementTracker::new();
        tracker.unlock(Achievement::FirstStroke, TEST_TIMESTAMP);
        tracker.unlock(Achievement::Centurion, TEST_TIMESTAMP + 1000);

        let serialized = bincode::serialize(&tracker).unwrap();
        let deserialized: AchievementTracker = bincode::deserialize(&serialized).unwrap();

        assert_eq!(deserialized.count(), 2);
        assert!(deserialized.has(Achievement::FirstStroke));
        assert!(deserialized.has(Achievement::Centurion));
    }

    #[test]
    fn test_timestamp_to_day() {
        // Genesis is day 0
        assert_eq!(AchievementTracker::timestamp_to_day(GENESIS_EPOCH_SECS), 0);

        // One day after genesis is day 1
        assert_eq!(
            AchievementTracker::timestamp_to_day(GENESIS_EPOCH_SECS + 86400),
            1
        );

        // Before genesis (edge case)
        assert_eq!(AchievementTracker::timestamp_to_day(0), 0);
    }
}
