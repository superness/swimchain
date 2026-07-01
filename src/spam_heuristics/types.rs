//! Core types for spam heuristics

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// === Rate Limit Constants per SPEC_12 Section 7 ===

/// Default daily post limit (unified for all users)
pub const DEFAULT_POSTS_PER_DAY: u32 = 20;

/// Posts per space per hour for preventing space flooding
pub const POSTS_PER_SPACE_PER_HOUR: u32 = 5;

// === Cross-Posting Constants ===

/// Maximum number of spaces the same content can be posted to within 24 hours
pub const MAX_CROSS_POST_SPACES: u32 = 3;

/// Time window for cross-posting detection (24 hours)
pub const CROSS_POST_WINDOW_SECS: u64 = 86_400;

// === Repetition Detection Constants ===

/// Time window for duplicate detection (1 hour)
pub const REPETITION_WINDOW_SECS: u64 = 3_600;

/// Maximum exact duplicates allowed in window
pub const MAX_EXACT_DUPLICATES: u32 = 1;

/// Minimum similarity threshold for near-duplicate detection (0.0 - 1.0)
pub const SIMILARITY_THRESHOLD: f32 = 0.85;

// === Pattern Detection Constants ===

/// Maximum link density before flagging (links / words)
pub const MAX_LINK_DENSITY: f32 = 0.25;

/// Maximum @mention count before flagging
pub const MAX_MENTIONS_PER_POST: u32 = 10;

/// Minimum content length for pattern detection (bytes)
pub const MIN_CONTENT_FOR_PATTERNS: usize = 10;

/// A fingerprint of content for efficient comparison.
///
/// Uses SHA-256 hash of normalized content for exact matching
/// and simhash for near-duplicate detection.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ContentFingerprint {
    /// SHA-256 hash of normalized content (exact matching)
    pub hash: [u8; 32],

    /// Simhash for near-duplicate detection
    pub simhash: u64,

    /// Content length in bytes
    pub length: u32,

    /// Space ID where the content was posted
    pub space_id: [u8; 16],

    /// Author of the content
    pub author: [u8; 32],

    /// Unix timestamp of creation
    pub timestamp: u64,
}

impl ContentFingerprint {
    /// Create a fingerprint from content bytes.
    ///
    /// Normalizes content before hashing:
    /// - Trims whitespace
    /// - Lowercases
    /// - Removes duplicate spaces
    pub fn from_content(content: &[u8], space_id: &[u8; 16], author: &[u8; 32], timestamp: u64) -> Self {
        // Normalize content
        let normalized = normalize_content(content);

        // Compute SHA-256 hash
        let mut hasher = Sha256::new();
        hasher.update(&normalized);
        let hash_result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&hash_result);

        // Compute simhash for near-duplicate detection
        let simhash = compute_simhash(&normalized);

        Self {
            hash,
            simhash,
            length: normalized.len() as u32,
            space_id: *space_id,
            author: *author,
            timestamp,
        }
    }

    /// Check if two fingerprints are exact duplicates.
    pub fn is_exact_duplicate(&self, other: &Self) -> bool {
        self.hash == other.hash
    }

    /// Calculate similarity between two fingerprints using simhash hamming distance.
    ///
    /// Returns a value from 0.0 (completely different) to 1.0 (identical).
    pub fn similarity(&self, other: &Self) -> f32 {
        let hamming_distance = (self.simhash ^ other.simhash).count_ones();
        // 64-bit simhash, so max distance is 64
        1.0 - (hamming_distance as f32 / 64.0)
    }

    /// Check if this fingerprint is similar to another above threshold.
    pub fn is_near_duplicate(&self, other: &Self, threshold: f32) -> bool {
        self.similarity(other) >= threshold
    }
}

/// Normalize content for fingerprinting.
fn normalize_content(content: &[u8]) -> Vec<u8> {
    // Convert to string, handling invalid UTF-8 gracefully
    let text = String::from_utf8_lossy(content);

    // Normalize: lowercase, trim, collapse whitespace
    let normalized = text
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    normalized.into_bytes()
}

/// Compute a simhash for near-duplicate detection.
///
/// Uses character 3-grams as features.
fn compute_simhash(content: &[u8]) -> u64 {
    if content.len() < 3 {
        // Too short for n-grams, just hash the content
        let mut hasher = Sha256::new();
        hasher.update(content);
        let hash = hasher.finalize();
        return u64::from_le_bytes(hash[0..8].try_into().unwrap());
    }

    let mut v = [0i32; 64];

    // Extract 3-grams and update bit vector
    for window in content.windows(3) {
        let mut hasher = Sha256::new();
        hasher.update(window);
        let hash = hasher.finalize();
        let feature_hash = u64::from_le_bytes(hash[0..8].try_into().unwrap());

        for i in 0..64 {
            if (feature_hash >> i) & 1 == 1 {
                v[i] += 1;
            } else {
                v[i] -= 1;
            }
        }
    }

    // Convert to simhash
    let mut simhash = 0u64;
    for (i, &count) in v.iter().enumerate() {
        if count > 0 {
            simhash |= 1 << i;
        }
    }

    simhash
}

/// Result of heuristic evaluation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeuristicResult {
    /// Whether any violations were detected
    pub has_violations: bool,

    /// List of violations found
    pub violations: Vec<HeuristicViolation>,

    /// Overall confidence score (0.0 - 1.0, higher = more suspicious)
    pub confidence: f32,

    /// Whether the content should be flagged for review
    pub should_flag: bool,
}

impl HeuristicResult {
    /// Create an empty result with no violations.
    pub fn clean() -> Self {
        Self {
            has_violations: false,
            violations: Vec::new(),
            confidence: 0.0,
            should_flag: false,
        }
    }

    /// Add a violation to the result.
    pub fn add_violation(&mut self, violation: HeuristicViolation) {
        self.violations.push(violation);
        self.has_violations = true;
        self.recalculate_confidence();
    }

    /// Recalculate overall confidence based on violations.
    fn recalculate_confidence(&mut self) {
        if self.violations.is_empty() {
            self.confidence = 0.0;
            self.should_flag = false;
            return;
        }

        // Combine violation weights
        let total_weight: f32 = self.violations.iter().map(|v| v.weight).sum();
        self.confidence = (total_weight / self.violations.len() as f32).min(1.0);

        // Flag if any high-confidence violation or multiple lower ones
        self.should_flag = self.violations.iter().any(|v| v.weight >= 0.8)
            || total_weight >= 1.5;
    }

    /// Merge another result into this one.
    pub fn merge(&mut self, other: HeuristicResult) {
        for violation in other.violations {
            self.add_violation(violation);
        }
    }
}

/// A specific heuristic violation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeuristicViolation {
    /// Type of violation
    pub violation_type: ViolationType,

    /// Human-readable description
    pub description: String,

    /// Weight of this violation (0.0 - 1.0)
    pub weight: f32,

    /// Additional context (e.g., specific pattern matched)
    pub context: Option<String>,
}

impl HeuristicViolation {
    /// Create a new violation.
    pub fn new(violation_type: ViolationType, description: impl Into<String>, weight: f32) -> Self {
        Self {
            violation_type,
            description: description.into(),
            weight: weight.clamp(0.0, 1.0),
            context: None,
        }
    }

    /// Add context to the violation.
    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.context = Some(context.into());
        self
    }
}

/// Types of heuristic violations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ViolationType {
    /// Duplicate content detected
    Repetition,

    /// Near-duplicate content detected
    NearDuplicate,

    /// Cross-posted to too many spaces
    CrossPosting,

    /// Rate limit exceeded
    RateLimit,

    /// High link density
    HighLinkDensity,

    /// Excessive mentions
    ExcessiveMentions,

    /// All caps content
    AllCaps,

    /// Pattern match (generic)
    SuspiciousPattern,
}

impl ViolationType {
    /// Get the default weight for this violation type.
    pub fn default_weight(&self) -> f32 {
        match self {
            Self::Repetition => 0.9,      // Very suspicious
            Self::NearDuplicate => 0.7,   // Suspicious
            Self::CrossPosting => 0.8,    // Very suspicious
            Self::RateLimit => 1.0,       // Definitive violation
            Self::HighLinkDensity => 0.6, // Moderate
            Self::ExcessiveMentions => 0.5, // Moderate
            Self::AllCaps => 0.3,         // Low
            Self::SuspiciousPattern => 0.5, // Moderate
        }
    }

    /// Get human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Repetition => "Repetition",
            Self::NearDuplicate => "Near-Duplicate",
            Self::CrossPosting => "Cross-Posting",
            Self::RateLimit => "Rate Limit",
            Self::HighLinkDensity => "High Link Density",
            Self::ExcessiveMentions => "Excessive Mentions",
            Self::AllCaps => "All Caps",
            Self::SuspiciousPattern => "Suspicious Pattern",
        }
    }
}

/// Get the default daily post limit.
pub fn default_posts_per_day() -> u32 {
    DEFAULT_POSTS_PER_DAY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_exact_duplicate() {
        let content = b"Hello world";
        let space_id = [1u8; 16];
        let author = [2u8; 32];

        let fp1 = ContentFingerprint::from_content(content, &space_id, &author, 1000);
        let fp2 = ContentFingerprint::from_content(content, &space_id, &author, 1001);

        assert!(fp1.is_exact_duplicate(&fp2));
    }

    #[test]
    fn test_fingerprint_normalization() {
        let content1 = b"  Hello   World  ";
        let content2 = b"hello world";
        let space_id = [1u8; 16];
        let author = [2u8; 32];

        let fp1 = ContentFingerprint::from_content(content1, &space_id, &author, 1000);
        let fp2 = ContentFingerprint::from_content(content2, &space_id, &author, 1000);

        // After normalization, these should be identical
        assert!(fp1.is_exact_duplicate(&fp2));
    }

    #[test]
    fn test_fingerprint_similarity() {
        let content1 = b"The quick brown fox jumps over the lazy dog";
        let content2 = b"The quick brown fox jumps over the lazy cat"; // One word different
        let content3 = b"Completely different content here";
        let space_id = [1u8; 16];
        let author = [2u8; 32];

        let fp1 = ContentFingerprint::from_content(content1, &space_id, &author, 1000);
        let fp2 = ContentFingerprint::from_content(content2, &space_id, &author, 1000);
        let fp3 = ContentFingerprint::from_content(content3, &space_id, &author, 1000);

        let sim_1_2 = fp1.similarity(&fp2);
        let sim_1_3 = fp1.similarity(&fp3);

        // Similar content should have higher similarity
        assert!(sim_1_2 > sim_1_3, "sim_1_2={}, sim_1_3={}", sim_1_2, sim_1_3);
        // Near-duplicates should have high similarity
        assert!(sim_1_2 > 0.7, "sim_1_2={}", sim_1_2);
    }

    #[test]
    fn test_default_posts_per_day() {
        assert_eq!(default_posts_per_day(), DEFAULT_POSTS_PER_DAY);
        assert_eq!(default_posts_per_day(), 20);
    }

    #[test]
    fn test_heuristic_result_clean() {
        let result = HeuristicResult::clean();
        assert!(!result.has_violations);
        assert!(result.violations.is_empty());
        assert_eq!(result.confidence, 0.0);
        assert!(!result.should_flag);
    }

    #[test]
    fn test_heuristic_result_add_violation() {
        let mut result = HeuristicResult::clean();
        result.add_violation(HeuristicViolation::new(
            ViolationType::Repetition,
            "Duplicate detected",
            0.9,
        ));

        assert!(result.has_violations);
        assert_eq!(result.violations.len(), 1);
        assert!(result.should_flag);
    }

    #[test]
    fn test_violation_type_weights() {
        assert_eq!(ViolationType::RateLimit.default_weight(), 1.0);
        assert!(ViolationType::Repetition.default_weight() > ViolationType::AllCaps.default_weight());
    }
}
