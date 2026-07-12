//! Cross-posting detection for spam heuristics
//!
//! Tracks when the same content is posted to multiple spaces and flags
//! when it exceeds the configured threshold.

use std::collections::HashMap;

use super::error::SpamHeuristicsError;
use super::types::{
    ContentFingerprint, HeuristicResult, HeuristicViolation, ViolationType, CROSS_POST_WINDOW_SECS,
    MAX_CROSS_POST_SPACES,
};

/// Configuration for cross-posting detection.
#[derive(Debug, Clone)]
pub struct CrossPostingConfig {
    /// Maximum spaces the same content can be posted to
    pub max_spaces: u32,

    /// Time window for cross-posting detection (seconds)
    pub window_secs: u64,
}

impl Default for CrossPostingConfig {
    fn default() -> Self {
        Self {
            max_spaces: MAX_CROSS_POST_SPACES,
            window_secs: CROSS_POST_WINDOW_SECS,
        }
    }
}

/// Tracks cross-posting across spaces.
pub struct CrossPostingTracker {
    config: CrossPostingConfig,

    /// Map from content hash to list of (space_id, timestamp)
    content_spaces: HashMap<[u8; 32], Vec<([u8; 16], u64)>>,

    /// Map from content hash to author (for verification)
    content_authors: HashMap<[u8; 32], [u8; 32]>,
}

impl CrossPostingTracker {
    /// Create a new tracker with default config.
    pub fn new() -> Self {
        Self::with_config(CrossPostingConfig::default())
    }

    /// Create a new tracker with custom config.
    pub fn with_config(config: CrossPostingConfig) -> Self {
        Self {
            config,
            content_spaces: HashMap::new(),
            content_authors: HashMap::new(),
        }
    }

    /// Check content for cross-posting violations.
    ///
    /// Returns a result with any violations found.
    pub fn check(
        &mut self,
        content: &[u8],
        space_id: &[u8; 16],
        author: &[u8; 32],
        current_time: u64,
    ) -> HeuristicResult {
        // Create fingerprint to get content hash
        let fingerprint = ContentFingerprint::from_content(content, space_id, author, current_time);

        // Clean up old entries
        self.cleanup(current_time);

        let mut result = HeuristicResult::clean();

        // Get existing spaces for this content
        let spaces = self.content_spaces.entry(fingerprint.hash).or_default();

        // Check if this is a new space for this content
        let is_new_space = !spaces.iter().any(|(sid, _)| sid == space_id);

        if is_new_space {
            // Count unique spaces (excluding the current one we're about to add)
            let unique_space_count = spaces
                .iter()
                .map(|(sid, _)| sid)
                .collect::<std::collections::HashSet<_>>()
                .len() as u32;

            // If adding this space would exceed the limit, flag it
            if unique_space_count >= self.config.max_spaces {
                result.add_violation(
                    HeuristicViolation::new(
                        ViolationType::CrossPosting,
                        format!(
                            "Content posted to {} spaces (max: {})",
                            unique_space_count + 1,
                            self.config.max_spaces
                        ),
                        ViolationType::CrossPosting.default_weight(),
                    )
                    .with_context(format!("within {} hours", self.config.window_secs / 3600)),
                );
            }

            // Add this space to tracking
            spaces.push((*space_id, current_time));
        }

        // Track author
        self.content_authors.insert(fingerprint.hash, *author);

        result
    }

    /// Check if content would violate cross-posting limits without storing it.
    pub fn would_violate(
        &self,
        content: &[u8],
        space_id: &[u8; 16],
        author: &[u8; 32],
        current_time: u64,
    ) -> Result<(), SpamHeuristicsError> {
        let fingerprint = ContentFingerprint::from_content(content, space_id, author, current_time);

        let cutoff = current_time.saturating_sub(self.config.window_secs);

        if let Some(spaces) = self.content_spaces.get(&fingerprint.hash) {
            // Count unique spaces within the window
            let unique_spaces: std::collections::HashSet<_> = spaces
                .iter()
                .filter(|(_, ts)| *ts >= cutoff)
                .map(|(sid, _)| sid)
                .collect();

            // Check if this is a new space
            let is_new_space = !unique_spaces.contains(space_id);

            if is_new_space && unique_spaces.len() as u32 >= self.config.max_spaces {
                return Err(SpamHeuristicsError::ExcessiveCrossPosting {
                    space_count: unique_spaces.len() as u32 + 1,
                    max_spaces: self.config.max_spaces,
                });
            }
        }

        Ok(())
    }

    /// Get the number of spaces content has been posted to.
    pub fn space_count_for_content(
        &self,
        content: &[u8],
        space_id: &[u8; 16],
        author: &[u8; 32],
        current_time: u64,
    ) -> u32 {
        let fingerprint = ContentFingerprint::from_content(content, space_id, author, current_time);
        let cutoff = current_time.saturating_sub(self.config.window_secs);

        self.content_spaces
            .get(&fingerprint.hash)
            .map(|spaces| {
                spaces
                    .iter()
                    .filter(|(_, ts)| *ts >= cutoff)
                    .map(|(sid, _)| sid)
                    .collect::<std::collections::HashSet<_>>()
                    .len() as u32
            })
            .unwrap_or(0)
    }

    /// Clean up old entries outside the time window.
    fn cleanup(&mut self, current_time: u64) {
        let cutoff = current_time.saturating_sub(self.config.window_secs);

        // Clean up space lists
        for spaces in self.content_spaces.values_mut() {
            spaces.retain(|(_, ts)| *ts >= cutoff);
        }

        // Remove content entries with no spaces
        let empty_hashes: Vec<_> = self
            .content_spaces
            .iter()
            .filter(|(_, spaces)| spaces.is_empty())
            .map(|(hash, _)| *hash)
            .collect();

        for hash in empty_hashes {
            self.content_spaces.remove(&hash);
            self.content_authors.remove(&hash);
        }
    }

    /// Get the number of tracked content hashes.
    pub fn tracked_content_count(&self) -> usize {
        self.content_spaces.len()
    }

    /// Clear all tracked content.
    pub fn clear(&mut self) {
        self.content_spaces.clear();
        self.content_authors.clear();
    }
}

impl Default for CrossPostingTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_author(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn make_space(seed: u8) -> [u8; 16] {
        [seed; 16]
    }

    #[test]
    fn test_first_post_allowed() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        let result = tracker.check(content, &space, &author, 1000);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_same_space_allowed() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        // First post
        tracker.check(content, &space, &author, 1000);

        // Same content, same space - allowed
        let result = tracker.check(content, &space, &author, 1001);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_three_spaces_allowed() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);

        // Post to 3 spaces (the max)
        let result1 = tracker.check(content, &make_space(1), &author, 1000);
        let result2 = tracker.check(content, &make_space(2), &author, 1001);
        let result3 = tracker.check(content, &make_space(3), &author, 1002);

        assert!(!result1.has_violations);
        assert!(!result2.has_violations);
        assert!(!result3.has_violations);
    }

    #[test]
    fn test_fourth_space_flagged() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);

        // Post to 3 spaces
        tracker.check(content, &make_space(1), &author, 1000);
        tracker.check(content, &make_space(2), &author, 1001);
        tracker.check(content, &make_space(3), &author, 1002);

        // 4th space - flagged
        let result = tracker.check(content, &make_space(4), &author, 1003);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::CrossPosting));
    }

    #[test]
    fn test_different_content_allowed() {
        let mut tracker = CrossPostingTracker::new();
        let author = make_author(1);

        // Different content in each space is fine
        tracker.check(b"Content 1", &make_space(1), &author, 1000);
        tracker.check(b"Content 2", &make_space(2), &author, 1001);
        tracker.check(b"Content 3", &make_space(3), &author, 1002);
        let result = tracker.check(b"Content 4", &make_space(4), &author, 1003);

        assert!(!result.has_violations);
    }

    #[test]
    fn test_old_posts_cleaned_up() {
        let mut tracker = CrossPostingTracker::with_config(CrossPostingConfig {
            window_secs: 100,
            ..Default::default()
        });
        let content = b"Hello world!";
        let author = make_author(1);

        // Post to 3 spaces at time 1000
        tracker.check(content, &make_space(1), &author, 1000);
        tracker.check(content, &make_space(2), &author, 1001);
        tracker.check(content, &make_space(3), &author, 1002);

        // Post to 4th space at time 1200 (beyond window) - should be ok
        let result = tracker.check(content, &make_space(4), &author, 1200);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_would_violate() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);

        // Post to 3 spaces
        tracker.check(content, &make_space(1), &author, 1000);
        tracker.check(content, &make_space(2), &author, 1001);
        tracker.check(content, &make_space(3), &author, 1002);

        // Check without adding
        let result = tracker.would_violate(content, &make_space(4), &author, 1003);
        assert!(matches!(
            result,
            Err(SpamHeuristicsError::ExcessiveCrossPosting { .. })
        ));
    }

    #[test]
    fn test_space_count() {
        let mut tracker = CrossPostingTracker::new();
        let content = b"Hello world!";
        let author = make_author(1);

        tracker.check(content, &make_space(1), &author, 1000);
        tracker.check(content, &make_space(2), &author, 1001);

        let count = tracker.space_count_for_content(content, &make_space(1), &author, 1002);
        assert_eq!(count, 2);
    }

    #[test]
    fn test_tracked_content_count() {
        let mut tracker = CrossPostingTracker::new();
        let author = make_author(1);

        tracker.check(b"Content 1", &make_space(1), &author, 1000);
        tracker.check(b"Content 2", &make_space(2), &author, 1001);
        tracker.check(b"Content 3", &make_space(3), &author, 1002);

        assert_eq!(tracker.tracked_content_count(), 3);
    }

    #[test]
    fn test_clear() {
        let mut tracker = CrossPostingTracker::new();
        let author = make_author(1);

        tracker.check(b"Content 1", &make_space(1), &author, 1000);
        assert_eq!(tracker.tracked_content_count(), 1);

        tracker.clear();
        assert_eq!(tracker.tracked_content_count(), 0);
    }
}
