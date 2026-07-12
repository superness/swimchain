//! Pattern detection for spam heuristics
//!
//! Detects suspicious patterns in content like high link density,
//! excessive mentions, all caps, and other spam indicators.

use super::types::{
    HeuristicResult, HeuristicViolation, ViolationType, MAX_LINK_DENSITY, MAX_MENTIONS_PER_POST,
    MIN_CONTENT_FOR_PATTERNS,
};

/// Types of patterns that can be detected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PatternType {
    /// High ratio of links to words
    HighLinkDensity,

    /// Too many @mentions
    ExcessiveMentions,

    /// All or mostly uppercase text
    AllCaps,

    /// Repeated characters (e.g., "!!!!!!")
    RepeatedChars,

    /// Known spam phrases
    SpamPhrase,
}

impl PatternType {
    /// Get human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::HighLinkDensity => "High Link Density",
            Self::ExcessiveMentions => "Excessive Mentions",
            Self::AllCaps => "All Caps",
            Self::RepeatedChars => "Repeated Characters",
            Self::SpamPhrase => "Spam Phrase",
        }
    }
}

/// A match of a suspicious pattern.
#[derive(Debug, Clone, PartialEq)]
pub struct PatternMatch {
    /// Type of pattern matched
    pub pattern_type: PatternType,

    /// Confidence of the match (0.0 - 1.0)
    pub confidence: f32,

    /// Description of what was matched
    pub description: String,
}

/// Configuration for pattern detection.
#[derive(Debug, Clone)]
pub struct PatternDetectorConfig {
    /// Maximum link density (links / words)
    pub max_link_density: f32,

    /// Maximum mentions per post
    pub max_mentions: u32,

    /// Minimum content length for pattern detection
    pub min_content_length: usize,

    /// Minimum uppercase ratio to flag as all caps (0.0 - 1.0)
    pub all_caps_threshold: f32,

    /// Minimum repeated char sequence length to flag
    pub repeated_char_threshold: usize,
}

impl Default for PatternDetectorConfig {
    fn default() -> Self {
        Self {
            max_link_density: MAX_LINK_DENSITY,
            max_mentions: MAX_MENTIONS_PER_POST,
            min_content_length: MIN_CONTENT_FOR_PATTERNS,
            all_caps_threshold: 0.8,
            repeated_char_threshold: 5,
        }
    }
}

/// Detects suspicious patterns in content.
pub struct PatternDetector {
    config: PatternDetectorConfig,
}

impl PatternDetector {
    /// Create a new pattern detector with default config.
    pub fn new() -> Self {
        Self::with_config(PatternDetectorConfig::default())
    }

    /// Create a new pattern detector with custom config.
    pub fn with_config(config: PatternDetectorConfig) -> Self {
        Self { config }
    }

    /// Check content for suspicious patterns.
    pub fn check(&self, content: &[u8]) -> HeuristicResult {
        let mut result = HeuristicResult::clean();

        // Skip very short content
        if content.len() < self.config.min_content_length {
            return result;
        }

        // Convert to string for analysis
        let text = String::from_utf8_lossy(content);

        // Check each pattern type
        if let Some(m) = self.check_link_density(&text) {
            result.add_violation(self.pattern_to_violation(&m));
        }

        if let Some(m) = self.check_mentions(&text) {
            result.add_violation(self.pattern_to_violation(&m));
        }

        if let Some(m) = self.check_all_caps(&text) {
            result.add_violation(self.pattern_to_violation(&m));
        }

        if let Some(m) = self.check_repeated_chars(&text) {
            result.add_violation(self.pattern_to_violation(&m));
        }

        result
    }

    /// Check for all patterns and return the matches.
    pub fn find_patterns(&self, content: &[u8]) -> Vec<PatternMatch> {
        let mut matches = Vec::new();

        if content.len() < self.config.min_content_length {
            return matches;
        }

        let text = String::from_utf8_lossy(content);

        if let Some(m) = self.check_link_density(&text) {
            matches.push(m);
        }

        if let Some(m) = self.check_mentions(&text) {
            matches.push(m);
        }

        if let Some(m) = self.check_all_caps(&text) {
            matches.push(m);
        }

        if let Some(m) = self.check_repeated_chars(&text) {
            matches.push(m);
        }

        matches
    }

    /// Check for high link density.
    fn check_link_density(&self, text: &str) -> Option<PatternMatch> {
        let words = text.split_whitespace().count();
        if words == 0 {
            return None;
        }

        // Count URL-like patterns
        let link_count = count_links(text);

        if link_count == 0 {
            return None;
        }

        let density = link_count as f32 / words as f32;

        if density > self.config.max_link_density {
            Some(PatternMatch {
                pattern_type: PatternType::HighLinkDensity,
                confidence: (density / self.config.max_link_density).min(1.0),
                description: format!(
                    "{} links in {} words ({:.0}% density)",
                    link_count,
                    words,
                    density * 100.0
                ),
            })
        } else {
            None
        }
    }

    /// Check for excessive mentions.
    fn check_mentions(&self, text: &str) -> Option<PatternMatch> {
        let mention_count = count_mentions(text);

        if mention_count > self.config.max_mentions {
            Some(PatternMatch {
                pattern_type: PatternType::ExcessiveMentions,
                confidence: (mention_count as f32 / self.config.max_mentions as f32).min(1.0),
                description: format!(
                    "{} mentions (max: {})",
                    mention_count, self.config.max_mentions
                ),
            })
        } else {
            None
        }
    }

    /// Check for all caps content.
    fn check_all_caps(&self, text: &str) -> Option<PatternMatch> {
        let letters: Vec<char> = text.chars().filter(|c| c.is_alphabetic()).collect();

        if letters.len() < 10 {
            // Skip short content
            return None;
        }

        let uppercase_count = letters.iter().filter(|c| c.is_uppercase()).count();
        let uppercase_ratio = uppercase_count as f32 / letters.len() as f32;

        if uppercase_ratio >= self.config.all_caps_threshold {
            Some(PatternMatch {
                pattern_type: PatternType::AllCaps,
                confidence: uppercase_ratio,
                description: format!("{:.0}% uppercase", uppercase_ratio * 100.0),
            })
        } else {
            None
        }
    }

    /// Check for repeated characters.
    fn check_repeated_chars(&self, text: &str) -> Option<PatternMatch> {
        let mut max_repeat = 0;
        let mut repeated_char = ' ';
        let mut current_char = '\0';
        let mut current_count = 0;

        for c in text.chars() {
            if c == current_char {
                current_count += 1;
            } else {
                if current_count > max_repeat {
                    max_repeat = current_count;
                    repeated_char = current_char;
                }
                current_char = c;
                current_count = 1;
            }
        }

        // Check the last sequence
        if current_count > max_repeat {
            max_repeat = current_count;
            repeated_char = current_char;
        }

        if max_repeat >= self.config.repeated_char_threshold {
            Some(PatternMatch {
                pattern_type: PatternType::RepeatedChars,
                confidence: (max_repeat as f32
                    / (self.config.repeated_char_threshold as f32 * 2.0))
                    .min(1.0),
                description: format!(
                    "'{}' repeated {} times",
                    if repeated_char.is_whitespace() {
                        "space".to_string()
                    } else {
                        repeated_char.to_string()
                    },
                    max_repeat
                ),
            })
        } else {
            None
        }
    }

    /// Convert a pattern match to a heuristic violation.
    fn pattern_to_violation(&self, m: &PatternMatch) -> HeuristicViolation {
        let violation_type = match m.pattern_type {
            PatternType::HighLinkDensity => ViolationType::HighLinkDensity,
            PatternType::ExcessiveMentions => ViolationType::ExcessiveMentions,
            PatternType::AllCaps => ViolationType::AllCaps,
            PatternType::RepeatedChars | PatternType::SpamPhrase => {
                ViolationType::SuspiciousPattern
            }
        };

        HeuristicViolation::new(
            violation_type,
            m.description.clone(),
            violation_type.default_weight() * m.confidence,
        )
        .with_context(m.pattern_type.name().to_string())
    }
}

impl Default for PatternDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// Count URL-like patterns in text.
fn count_links(text: &str) -> u32 {
    // Deduplicate: count the max of protocol vs domain patterns
    let protocol_count =
        (text.matches("http://").count() + text.matches("https://").count()) as u32;
    let domain_count = (text.matches(".com").count()
        + text.matches(".net").count()
        + text.matches(".org").count()
        + text.matches(".io").count()) as u32;

    // Return the higher of the two as a reasonable link count estimate
    protocol_count.max(domain_count)
}

/// Count @mentions in text.
fn count_mentions(text: &str) -> u32 {
    let mut count = 0;
    let chars: Vec<char> = text.chars().collect();

    for (i, &c) in chars.iter().enumerate() {
        if c == '@' {
            // Check if this looks like a mention (@ followed by alphanumeric)
            if i + 1 < chars.len() && (chars[i + 1].is_alphanumeric() || chars[i + 1] == '_') {
                // Check if @ is at start or preceded by whitespace
                if i == 0 || chars[i - 1].is_whitespace() {
                    count += 1;
                }
            }
        }
    }

    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_content() {
        let detector = PatternDetector::new();
        let content = b"This is a normal post with regular content.";
        let result = detector.check(content);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_high_link_density() {
        let detector = PatternDetector::new();
        let content = b"Check these: https://spam.com https://more.com https://even.more.com word";
        let result = detector.check(content);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::HighLinkDensity));
    }

    #[test]
    fn test_single_link_allowed() {
        let detector = PatternDetector::new();
        let content = b"Check out this interesting article at https://example.com for more information about the topic";
        let result = detector.check(content);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_excessive_mentions() {
        let detector = PatternDetector::new();
        let content =
            b"Hey @user1 @user2 @user3 @user4 @user5 @user6 @user7 @user8 @user9 @user10 @user11 check this!";
        let result = detector.check(content);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::ExcessiveMentions));
    }

    #[test]
    fn test_few_mentions_allowed() {
        let detector = PatternDetector::new();
        let content = b"Hey @alice @bob @charlie, what do you think about this?";
        let result = detector.check(content);
        assert!(!result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::ExcessiveMentions));
    }

    #[test]
    fn test_all_caps() {
        let detector = PatternDetector::new();
        let content = b"THIS IS A VERY LOUD MESSAGE THAT IS ALL IN CAPS AND VERY ANNOYING";
        let result = detector.check(content);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::AllCaps));
    }

    #[test]
    fn test_normal_caps_allowed() {
        let detector = PatternDetector::new();
        let content = b"This is Normal Text with Some Capitalization Here and There.";
        let result = detector.check(content);
        assert!(!result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::AllCaps));
    }

    #[test]
    fn test_repeated_chars() {
        let detector = PatternDetector::new();
        let content = b"This is amazing!!!!!!!!!!! So great!!!!!";
        let result = detector.check(content);
        assert!(result.has_violations);
        assert!(result
            .violations
            .iter()
            .any(|v| v.violation_type == ViolationType::SuspiciousPattern));
    }

    #[test]
    fn test_short_content_skipped() {
        let detector = PatternDetector::new();
        let content = b"Hi!";
        let result = detector.check(content);
        assert!(!result.has_violations);
    }

    #[test]
    fn test_find_patterns() {
        let detector = PatternDetector::new();

        // Test each pattern separately to ensure proper detection

        // All caps: needs 80%+ uppercase letters
        let all_caps = b"THIS IS ALL CAPS TEXT THAT SHOULD BE DETECTED AS LOUD";
        let patterns = detector.find_patterns(all_caps);
        assert!(patterns
            .iter()
            .any(|p| p.pattern_type == PatternType::AllCaps));

        // Repeated chars: needs 5+ repeated chars
        let repeated = b"This has repeated chars!!!!!!!! and that's suspicious";
        let patterns = detector.find_patterns(repeated);
        assert!(patterns
            .iter()
            .any(|p| p.pattern_type == PatternType::RepeatedChars));

        // Excessive mentions: needs more than threshold
        let mentions =
            b"Hey @user1 @user2 @user3 @user4 @user5 @user6 @user7 @user8 @user9 @user10 @user11";
        let patterns = detector.find_patterns(mentions);
        assert!(patterns
            .iter()
            .any(|p| p.pattern_type == PatternType::ExcessiveMentions));
    }

    #[test]
    fn test_count_links() {
        assert_eq!(count_links("https://example.com"), 1);
        assert_eq!(count_links("https://a.com https://b.com"), 2);
        assert_eq!(count_links("no links here"), 0);
        assert_eq!(count_links("www.example.com"), 1);
    }

    #[test]
    fn test_count_mentions() {
        assert_eq!(count_mentions("@user hello"), 1);
        assert_eq!(count_mentions("@alice @bob @charlie"), 3);
        assert_eq!(count_mentions("email@domain.com"), 0); // Not a mention
        assert_eq!(count_mentions("no mentions"), 0);
    }

    #[test]
    fn test_pattern_type_name() {
        assert_eq!(PatternType::HighLinkDensity.name(), "High Link Density");
        assert_eq!(PatternType::ExcessiveMentions.name(), "Excessive Mentions");
        assert_eq!(PatternType::AllCaps.name(), "All Caps");
    }
}
