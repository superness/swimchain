//! Repetition detection for spam heuristics
//!
//! Detects duplicate or near-duplicate content within a time window.

use std::collections::HashMap;

use super::error::SpamHeuristicsError;
use super::types::{
    ContentFingerprint, HeuristicResult, HeuristicViolation, ViolationType,
    MAX_EXACT_DUPLICATES, REPETITION_WINDOW_SECS, SIMILARITY_THRESHOLD,
};

/// Configuration for repetition detection.
#[derive(Debug, Clone)]
pub struct RepetitionConfig {
    /// Time window for duplicate detection (seconds)
    pub window_secs: u64,

    /// Maximum exact duplicates allowed in window
    pub max_exact_duplicates: u32,

    /// Similarity threshold for near-duplicate detection (0.0 - 1.0)
    pub similarity_threshold: f32,
}

impl Default for RepetitionConfig {
    fn default() -> Self {
        Self {
            window_secs: REPETITION_WINDOW_SECS,
            max_exact_duplicates: MAX_EXACT_DUPLICATES,
            similarity_threshold: SIMILARITY_THRESHOLD,
        }
    }
}

/// Detects duplicate and near-duplicate content.
pub struct RepetitionDetector {
    config: RepetitionConfig,

    /// Recent fingerprints by author, for comparison
    /// Key: author pubkey, Value: list of recent fingerprints
    recent_by_author: HashMap<[u8; 32], Vec<ContentFingerprint>>,

    /// All recent fingerprints for cross-author detection
    recent_all: Vec<ContentFingerprint>,
}

impl RepetitionDetector {
    /// Create a new repetition detector with default config.
    pub fn new() -> Self {
        Self::with_config(RepetitionConfig::default())
    }

    /// Create a new repetition detector with custom config.
    pub fn with_config(config: RepetitionConfig) -> Self {
        Self {
            config,
            recent_by_author: HashMap::new(),
            recent_all: Vec::new(),
        }
    }

    /// Check content for repetition.
    ///
    /// Returns a result with any violations found.
    pub fn check(
        &mut self,
        content: &[u8],
        space_id: &[u8; 16],
        author: &[u8; 32],
        current_time: u64,
    ) -> HeuristicResult {
        // Create fingerprint
        let fingerprint = ContentFingerprint::from_content(content, space_id, author, current_time);

        // Clean up old entries
        self.cleanup(current_time);

        let mut result = HeuristicResult::clean();

        // Check for exact duplicates by this author
        if let Some(author_recent) = self.recent_by_author.get(author) {
            let exact_count = author_recent
                .iter()
                .filter(|fp| fp.is_exact_duplicate(&fingerprint))
                .count() as u32;

            if exact_count >= self.config.max_exact_duplicates {
                result.add_violation(
                    HeuristicViolation::new(
                        ViolationType::Repetition,
                        format!(
                            "Exact duplicate posted {} times in {} seconds",
                            exact_count + 1,
                            self.config.window_secs
                        ),
                        ViolationType::Repetition.default_weight(),
                    )
                    .with_context(format!("author: {:02x}{:02x}...", author[0], author[1])),
                );
            }

            // Check for near-duplicates by this author
            let near_duplicates: Vec<_> = author_recent
                .iter()
                .filter(|fp| {
                    !fp.is_exact_duplicate(&fingerprint)
                        && fp.is_near_duplicate(&fingerprint, self.config.similarity_threshold)
                })
                .collect();

            if !near_duplicates.is_empty() {
                let max_similarity = near_duplicates
                    .iter()
                    .map(|fp| fp.similarity(&fingerprint))
                    .fold(0.0f32, f32::max);

                result.add_violation(
                    HeuristicViolation::new(
                        ViolationType::NearDuplicate,
                        format!(
                            "Near-duplicate content detected ({:.0}% similar)",
                            max_similarity * 100.0
                        ),
                        ViolationType::NearDuplicate.default_weight() * max_similarity,
                    )
                    .with_context(format!("{} similar posts found", near_duplicates.len())),
                );
            }
        }

        // Store this fingerprint
        self.recent_by_author
            .entry(*author)
            .or_default()
            .push(fingerprint.clone());
        self.recent_all.push(fingerprint);

        result
    }

    /// Check if content is a duplicate without storing it.
    pub fn is_duplicate(
        &self,
        content: &[u8],
        space_id: &[u8; 16],
        author: &[u8; 32],
        current_time: u64,
    ) -> Result<(), SpamHeuristicsError> {
        let fingerprint = ContentFingerprint::from_content(content, space_id, author, current_time);

        let cutoff = current_time.saturating_sub(self.config.window_secs);

        if let Some(author_recent) = self.recent_by_author.get(author) {
            let exact_count = author_recent
                .iter()
                .filter(|fp| fp.timestamp >= cutoff && fp.is_exact_duplicate(&fingerprint))
                .count() as u32;

            if exact_count >= self.config.max_exact_duplicates {
                return Err(SpamHeuristicsError::DuplicateContent {
                    occurrence_count: exact_count + 1,
                    window_secs: self.config.window_secs,
                });
            }
        }

        Ok(())
    }

    /// Clean up old entries outside the time window.
    fn cleanup(&mut self, current_time: u64) {
        let cutoff = current_time.saturating_sub(self.config.window_secs);

        // Clean author-specific entries
        for fingerprints in self.recent_by_author.values_mut() {
            fingerprints.retain(|fp| fp.timestamp >= cutoff);
        }

        // Remove authors with no recent fingerprints
        self.recent_by_author.retain(|_, fps| !fps.is_empty());

        // Clean all fingerprints
        self.recent_all.retain(|fp| fp.timestamp >= cutoff);
    }

    /// Get the number of tracked fingerprints.
    pub fn fingerprint_count(&self) -> usize {
        self.recent_all.len()
    }

    /// Clear all tracked fingerprints.
    pub fn clear(&mut self) {
        self.recent_by_author.clear();
        self.recent_all.clear();
    }
}

impl Default for RepetitionDetector {
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
    fn test_no_violation_first_post() {
        let mut detector = RepetitionDetector::new();
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        let result = detector.check(content, &space, &author, 1000);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_exact_duplicate_detected() {
        let mut detector = RepetitionDetector::new();
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        // First post - ok
        let result1 = detector.check(content, &space, &author, 1000);
        assert!(!result1.has_violations);

        // Second post (duplicate) - flagged
        let result2 = detector.check(content, &space, &author, 1001);
        assert!(result2.has_violations);
        assert!(result2.violations.iter().any(|v| v.violation_type == ViolationType::Repetition));
    }

    #[test]
    fn test_different_authors_allowed() {
        let mut detector = RepetitionDetector::new();
        let content = b"Hello world!";
        let author1 = make_author(1);
        let author2 = make_author(2);
        let space = make_space(1);

        // Author 1 posts
        let result1 = detector.check(content, &space, &author1, 1000);
        assert!(!result1.has_violations);

        // Author 2 posts same content - allowed (different author)
        let result2 = detector.check(content, &space, &author2, 1001);
        assert!(!result2.has_violations);
    }

    #[test]
    fn test_near_duplicate_detected() {
        let mut detector = RepetitionDetector::new();
        let content1 = b"The quick brown fox jumps over the lazy dog and runs away fast";
        let content2 = b"The quick brown fox jumps over the lazy cat and runs away fast";
        let author = make_author(1);
        let space = make_space(1);

        // First post
        detector.check(content1, &space, &author, 1000);

        // Similar post
        let result2 = detector.check(content2, &space, &author, 1001);
        assert!(result2.has_violations);
        assert!(result2.violations.iter().any(|v| v.violation_type == ViolationType::NearDuplicate));
    }

    #[test]
    fn test_old_content_cleaned_up() {
        let mut detector = RepetitionDetector::with_config(RepetitionConfig {
            window_secs: 100,
            ..Default::default()
        });
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        // Post at time 1000
        detector.check(content, &space, &author, 1000);

        // Post same content at time 1200 (beyond window) - should be ok
        let result = detector.check(content, &space, &author, 1200);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_is_duplicate_check() {
        let mut detector = RepetitionDetector::new();
        let content = b"Hello world!";
        let author = make_author(1);
        let space = make_space(1);

        // Add first post
        detector.check(content, &space, &author, 1000);

        // Check without adding
        let result = detector.is_duplicate(content, &space, &author, 1001);
        assert!(matches!(result, Err(SpamHeuristicsError::DuplicateContent { .. })));
    }

    #[test]
    fn test_fingerprint_count() {
        let mut detector = RepetitionDetector::new();
        let author = make_author(1);
        let space = make_space(1);

        detector.check(b"Post 1", &space, &author, 1000);
        detector.check(b"Post 2", &space, &author, 1001);
        detector.check(b"Post 3", &space, &author, 1002);

        assert_eq!(detector.fingerprint_count(), 3);
    }

    #[test]
    fn test_clear() {
        let mut detector = RepetitionDetector::new();
        let author = make_author(1);
        let space = make_space(1);

        detector.check(b"Post 1", &space, &author, 1000);
        assert_eq!(detector.fingerprint_count(), 1);

        detector.clear();
        assert_eq!(detector.fingerprint_count(), 0);
    }
}
