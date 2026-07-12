//! Review flag storage for spam heuristics
//!
//! Content flagged by heuristics is stored for review rather than
//! automatically removed. This maintains the advisory nature of the
//! heuristic system.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::types::{HeuristicResult, ViolationType};

/// Reason for flagging content for review.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReviewFlagReason {
    /// Repetitive content detected
    Repetition { duplicate_count: u32 },

    /// Near-duplicate content detected
    NearDuplicate { similarity_percent: u8 },

    /// Cross-posted to too many spaces
    CrossPosting { space_count: u32 },

    /// Rate limit exceeded
    RateLimit {
        current_count: u32,
        max_allowed: u32,
    },

    /// High link density
    HighLinkDensity { link_count: u32, word_count: u32 },

    /// Excessive mentions
    ExcessiveMentions { mention_count: u32 },

    /// All caps content
    AllCaps { uppercase_percent: u8 },

    /// Suspicious pattern
    SuspiciousPattern { pattern_description: String },

    /// Multiple heuristic violations
    MultipleViolations { violation_count: u32 },
}

impl ReviewFlagReason {
    /// Get a human-readable description.
    pub fn description(&self) -> String {
        match self {
            Self::Repetition { duplicate_count } => {
                format!("Content posted {} times in window", duplicate_count)
            }
            Self::NearDuplicate { similarity_percent } => {
                format!("{}% similar to recent content", similarity_percent)
            }
            Self::CrossPosting { space_count } => {
                format!("Posted to {} spaces", space_count)
            }
            Self::RateLimit {
                current_count,
                max_allowed,
            } => {
                format!("{} posts (limit: {})", current_count, max_allowed)
            }
            Self::HighLinkDensity {
                link_count,
                word_count,
            } => {
                format!("{} links in {} words", link_count, word_count)
            }
            Self::ExcessiveMentions { mention_count } => {
                format!("{} mentions", mention_count)
            }
            Self::AllCaps { uppercase_percent } => {
                format!("{}% uppercase", uppercase_percent)
            }
            Self::SuspiciousPattern {
                pattern_description,
            } => pattern_description.clone(),
            Self::MultipleViolations { violation_count } => {
                format!("{} heuristic violations", violation_count)
            }
        }
    }

    /// Get the severity level (0.0 - 1.0).
    pub fn severity(&self) -> f32 {
        match self {
            Self::RateLimit { .. } => 1.0,
            Self::Repetition { .. } => 0.9,
            Self::CrossPosting { .. } => 0.8,
            Self::NearDuplicate { .. } => 0.7,
            Self::HighLinkDensity { .. } => 0.6,
            Self::ExcessiveMentions { .. } => 0.5,
            Self::SuspiciousPattern { .. } => 0.5,
            Self::AllCaps { .. } => 0.3,
            Self::MultipleViolations { violation_count } => {
                (0.5 + *violation_count as f32 * 0.1).min(1.0)
            }
        }
    }
}

/// A review flag for content.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewFlag {
    /// Content identifier (hash or ID)
    pub content_id: [u8; 32],

    /// Space where content was posted
    pub space_id: [u8; 16],

    /// Author of the content
    pub author: [u8; 32],

    /// Reasons for flagging
    pub reasons: Vec<ReviewFlagReason>,

    /// Overall confidence score (0.0 - 1.0)
    pub confidence: f32,

    /// Unix timestamp when flagged
    pub timestamp: u64,

    /// Whether this has been reviewed
    pub reviewed: bool,

    /// Review outcome (if reviewed)
    pub review_outcome: Option<ReviewOutcome>,
}

/// Outcome of reviewing a flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReviewOutcome {
    /// Content was determined to be legitimate
    Legitimate,

    /// Content was confirmed as spam
    ConfirmedSpam,

    /// Content is suspicious but not clearly spam
    Suspicious,

    /// Review was inconclusive
    Inconclusive,
}

impl ReviewFlag {
    /// Create a new review flag from a heuristic result.
    pub fn from_heuristic_result(
        content_id: [u8; 32],
        space_id: [u8; 16],
        author: [u8; 32],
        result: &HeuristicResult,
        timestamp: u64,
    ) -> Option<Self> {
        if !result.should_flag {
            return None;
        }

        let reasons: Vec<ReviewFlagReason> = result
            .violations
            .iter()
            .map(|v| violation_to_reason(v))
            .collect();

        if reasons.is_empty() {
            return None;
        }

        Some(Self {
            content_id,
            space_id,
            author,
            reasons,
            confidence: result.confidence,
            timestamp,
            reviewed: false,
            review_outcome: None,
        })
    }

    /// Get the maximum severity among all reasons.
    pub fn max_severity(&self) -> f32 {
        self.reasons
            .iter()
            .map(|r| r.severity())
            .fold(0.0f32, f32::max)
    }

    /// Mark as reviewed with an outcome.
    pub fn mark_reviewed(&mut self, outcome: ReviewOutcome) {
        self.reviewed = true;
        self.review_outcome = Some(outcome);
    }
}

/// Convert a heuristic violation to a review flag reason.
fn violation_to_reason(violation: &super::types::HeuristicViolation) -> ReviewFlagReason {
    match violation.violation_type {
        ViolationType::Repetition => ReviewFlagReason::Repetition { duplicate_count: 2 },
        ViolationType::NearDuplicate => ReviewFlagReason::NearDuplicate {
            similarity_percent: (violation.weight * 100.0) as u8,
        },
        ViolationType::CrossPosting => ReviewFlagReason::CrossPosting { space_count: 4 },
        ViolationType::RateLimit => ReviewFlagReason::RateLimit {
            current_count: 0,
            max_allowed: 0,
        },
        ViolationType::HighLinkDensity => ReviewFlagReason::HighLinkDensity {
            link_count: 0,
            word_count: 0,
        },
        ViolationType::ExcessiveMentions => {
            ReviewFlagReason::ExcessiveMentions { mention_count: 0 }
        }
        ViolationType::AllCaps => ReviewFlagReason::AllCaps {
            uppercase_percent: (violation.weight * 100.0) as u8,
        },
        ViolationType::SuspiciousPattern => ReviewFlagReason::SuspiciousPattern {
            pattern_description: violation.description.clone(),
        },
    }
}

/// In-memory storage for review flags.
pub struct ReviewFlagStore {
    /// Flags by content ID
    flags_by_content: HashMap<[u8; 32], ReviewFlag>,

    /// Flags by author (for quick lookup of an author's flagged content)
    flags_by_author: HashMap<[u8; 32], Vec<[u8; 32]>>,

    /// Pending (unreviewed) flag count
    pending_count: usize,
}

impl ReviewFlagStore {
    /// Create a new empty store.
    pub fn new() -> Self {
        Self {
            flags_by_content: HashMap::new(),
            flags_by_author: HashMap::new(),
            pending_count: 0,
        }
    }

    /// Add a review flag.
    pub fn add_flag(&mut self, flag: ReviewFlag) {
        let content_id = flag.content_id;
        let author = flag.author;

        if !flag.reviewed {
            self.pending_count += 1;
        }

        // Update author index
        self.flags_by_author
            .entry(author)
            .or_default()
            .push(content_id);

        // Store flag
        self.flags_by_content.insert(content_id, flag);
    }

    /// Get a flag by content ID.
    pub fn get_flag(&self, content_id: &[u8; 32]) -> Option<&ReviewFlag> {
        self.flags_by_content.get(content_id)
    }

    /// Get a mutable flag by content ID.
    pub fn get_flag_mut(&mut self, content_id: &[u8; 32]) -> Option<&mut ReviewFlag> {
        self.flags_by_content.get_mut(content_id)
    }

    /// Check if content is flagged.
    pub fn is_flagged(&self, content_id: &[u8; 32]) -> bool {
        self.flags_by_content.contains_key(content_id)
    }

    /// Get all flags for an author.
    pub fn get_flags_for_author(&self, author: &[u8; 32]) -> Vec<&ReviewFlag> {
        self.flags_by_author
            .get(author)
            .map(|content_ids| {
                content_ids
                    .iter()
                    .filter_map(|id| self.flags_by_content.get(id))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get pending (unreviewed) flags.
    pub fn get_pending_flags(&self) -> Vec<&ReviewFlag> {
        self.flags_by_content
            .values()
            .filter(|f| !f.reviewed)
            .collect()
    }

    /// Get pending flags sorted by severity.
    pub fn get_pending_flags_by_severity(&self) -> Vec<&ReviewFlag> {
        let mut flags: Vec<_> = self.get_pending_flags();
        flags.sort_by(|a, b| {
            b.max_severity()
                .partial_cmp(&a.max_severity())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        flags
    }

    /// Mark a flag as reviewed.
    pub fn mark_reviewed(
        &mut self,
        content_id: &[u8; 32],
        outcome: ReviewOutcome,
    ) -> Option<&ReviewFlag> {
        if let Some(flag) = self.flags_by_content.get_mut(content_id) {
            if !flag.reviewed {
                self.pending_count = self.pending_count.saturating_sub(1);
            }
            flag.mark_reviewed(outcome);
            Some(flag)
        } else {
            None
        }
    }

    /// Get the number of pending flags.
    pub fn pending_count(&self) -> usize {
        self.pending_count
    }

    /// Get the total number of flags.
    pub fn total_count(&self) -> usize {
        self.flags_by_content.len()
    }

    /// Get flag count for an author.
    pub fn author_flag_count(&self, author: &[u8; 32]) -> usize {
        self.flags_by_author
            .get(author)
            .map(|ids| ids.len())
            .unwrap_or(0)
    }

    /// Remove old reviewed flags (cleanup).
    pub fn cleanup_reviewed(&mut self, before_timestamp: u64) {
        let to_remove: Vec<[u8; 32]> = self
            .flags_by_content
            .iter()
            .filter(|(_, f)| f.reviewed && f.timestamp < before_timestamp)
            .map(|(id, _)| *id)
            .collect();

        for id in to_remove {
            if let Some(flag) = self.flags_by_content.remove(&id) {
                if let Some(author_flags) = self.flags_by_author.get_mut(&flag.author) {
                    author_flags.retain(|cid| cid != &id);
                }
            }
        }
    }

    /// Clear all flags.
    pub fn clear(&mut self) {
        self.flags_by_content.clear();
        self.flags_by_author.clear();
        self.pending_count = 0;
    }
}

impl Default for ReviewFlagStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_content_id(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn make_author(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn make_space(seed: u8) -> [u8; 16] {
        [seed; 16]
    }

    fn make_flag(content_seed: u8, author_seed: u8) -> ReviewFlag {
        ReviewFlag {
            content_id: make_content_id(content_seed),
            space_id: make_space(1),
            author: make_author(author_seed),
            reasons: vec![ReviewFlagReason::Repetition { duplicate_count: 2 }],
            confidence: 0.9,
            timestamp: 1000,
            reviewed: false,
            review_outcome: None,
        }
    }

    #[test]
    fn test_add_and_get_flag() {
        let mut store = ReviewFlagStore::new();
        let flag = make_flag(1, 1);
        let content_id = flag.content_id;

        store.add_flag(flag);

        assert!(store.is_flagged(&content_id));
        assert!(store.get_flag(&content_id).is_some());
        assert_eq!(store.total_count(), 1);
        assert_eq!(store.pending_count(), 1);
    }

    #[test]
    fn test_get_flags_for_author() {
        let mut store = ReviewFlagStore::new();

        // Add multiple flags for same author
        store.add_flag(make_flag(1, 1));
        store.add_flag(make_flag(2, 1));
        store.add_flag(make_flag(3, 2)); // Different author

        let author1 = make_author(1);
        let author1_flags = store.get_flags_for_author(&author1);
        assert_eq!(author1_flags.len(), 2);

        let author2 = make_author(2);
        let author2_flags = store.get_flags_for_author(&author2);
        assert_eq!(author2_flags.len(), 1);
    }

    #[test]
    fn test_mark_reviewed() {
        let mut store = ReviewFlagStore::new();
        let flag = make_flag(1, 1);
        let content_id = flag.content_id;

        store.add_flag(flag);
        assert_eq!(store.pending_count(), 1);

        store.mark_reviewed(&content_id, ReviewOutcome::ConfirmedSpam);

        let flag = store.get_flag(&content_id).unwrap();
        assert!(flag.reviewed);
        assert_eq!(flag.review_outcome, Some(ReviewOutcome::ConfirmedSpam));
        assert_eq!(store.pending_count(), 0);
    }

    #[test]
    fn test_get_pending_flags() {
        let mut store = ReviewFlagStore::new();

        store.add_flag(make_flag(1, 1));
        store.add_flag(make_flag(2, 1));

        assert_eq!(store.get_pending_flags().len(), 2);

        let content_id = make_content_id(1);
        store.mark_reviewed(&content_id, ReviewOutcome::Legitimate);

        assert_eq!(store.get_pending_flags().len(), 1);
    }

    #[test]
    fn test_severity_sorting() {
        let mut store = ReviewFlagStore::new();

        // Add flags with different severities
        let mut low_severity = make_flag(1, 1);
        low_severity.reasons = vec![ReviewFlagReason::AllCaps {
            uppercase_percent: 90,
        }];

        let mut high_severity = make_flag(2, 1);
        high_severity.reasons = vec![ReviewFlagReason::RateLimit {
            current_count: 10,
            max_allowed: 5,
        }];

        store.add_flag(low_severity);
        store.add_flag(high_severity);

        let sorted = store.get_pending_flags_by_severity();
        assert_eq!(sorted.len(), 2);
        // High severity (RateLimit) should come first
        assert!(sorted[0].max_severity() >= sorted[1].max_severity());
    }

    #[test]
    fn test_cleanup_reviewed() {
        let mut store = ReviewFlagStore::new();

        let mut old_flag = make_flag(1, 1);
        old_flag.timestamp = 100;
        store.add_flag(old_flag);

        let mut new_flag = make_flag(2, 1);
        new_flag.timestamp = 200;
        store.add_flag(new_flag);

        // Mark old one as reviewed
        store.mark_reviewed(&make_content_id(1), ReviewOutcome::Legitimate);

        // Cleanup flags reviewed before timestamp 150
        store.cleanup_reviewed(150);

        assert_eq!(store.total_count(), 1);
        assert!(!store.is_flagged(&make_content_id(1)));
        assert!(store.is_flagged(&make_content_id(2)));
    }

    #[test]
    fn test_review_flag_reason_severity() {
        assert_eq!(
            ReviewFlagReason::RateLimit {
                current_count: 10,
                max_allowed: 5
            }
            .severity(),
            1.0
        );
        assert_eq!(
            ReviewFlagReason::Repetition { duplicate_count: 2 }.severity(),
            0.9
        );
        assert_eq!(
            ReviewFlagReason::AllCaps {
                uppercase_percent: 90
            }
            .severity(),
            0.3
        );
    }

    #[test]
    fn test_review_flag_reason_description() {
        let reason = ReviewFlagReason::CrossPosting { space_count: 5 };
        assert_eq!(reason.description(), "Posted to 5 spaces");

        let reason = ReviewFlagReason::ExcessiveMentions { mention_count: 15 };
        assert_eq!(reason.description(), "15 mentions");
    }

    #[test]
    fn test_author_flag_count() {
        let mut store = ReviewFlagStore::new();

        store.add_flag(make_flag(1, 1));
        store.add_flag(make_flag(2, 1));
        store.add_flag(make_flag(3, 2));

        assert_eq!(store.author_flag_count(&make_author(1)), 2);
        assert_eq!(store.author_flag_count(&make_author(2)), 1);
        assert_eq!(store.author_flag_count(&make_author(3)), 0);
    }

    #[test]
    fn test_clear() {
        let mut store = ReviewFlagStore::new();

        store.add_flag(make_flag(1, 1));
        store.add_flag(make_flag(2, 1));

        assert_eq!(store.total_count(), 2);

        store.clear();

        assert_eq!(store.total_count(), 0);
        assert_eq!(store.pending_count(), 0);
    }
}
