//! Posts at risk calculation
//!
//! Per SPEC_02 §4.1, content decays with a half-life model:
//! - DECAY_THRESHOLD = 6.25% - content is considered decayed below this
//! - AT_RISK_THRESHOLD = 25% - content between 6.25% and 25% is "at risk"
//!
//! This module counts posts that are in the "at risk" zone, meaning they
//! are close to being decayed but haven't been pruned yet.

use super::error::SpaceHealthError;

/// Per SPEC_02 §4.1 - threshold below which content is decayed
pub const DECAY_THRESHOLD: f64 = 0.0625; // 6.25%

/// Content is "at risk" when survival probability is below this threshold
/// but above DECAY_THRESHOLD
pub const AT_RISK_THRESHOLD: f64 = 0.25; // 25%

/// A simple representation of content decay state for counting purposes.
#[derive(Clone, Debug)]
pub struct ContentDecayInfo {
    /// Content identifier
    pub content_id: [u8; 32],
    /// Survival probability (0.0 - 1.0)
    pub survival_probability: f64,
    /// Whether the content is protected (pinned or within decay floor)
    pub is_protected: bool,
}

impl ContentDecayInfo {
    /// Check if content is "at risk" (6.25% <= survival < 25%)
    pub fn is_at_risk(&self) -> bool {
        !self.is_protected
            && self.survival_probability >= DECAY_THRESHOLD
            && self.survival_probability < AT_RISK_THRESHOLD
    }

    /// Check if content is decayed (survival < 6.25%)
    pub fn is_decayed(&self) -> bool {
        !self.is_protected && self.survival_probability < DECAY_THRESHOLD
    }
}

/// Count posts in a space that are "at risk" (6.25% <= survival < 25%).
///
/// This function takes an iterator of content decay information and counts
/// how many items are in the at-risk zone.
///
/// # Arguments
/// * `content_iter` - Iterator over content decay information
///
/// # Returns
/// Number of posts at risk
pub fn count_posts_at_risk<I>(content_iter: I) -> u32
where
    I: Iterator<Item = ContentDecayInfo>,
{
    let mut count = 0u32;
    for info in content_iter {
        if info.is_at_risk() {
            count += 1;
        }
    }
    count
}

/// Count posts at risk from a slice of decay info.
pub fn count_posts_at_risk_slice(content: &[ContentDecayInfo]) -> u32 {
    content.iter().filter(|c| c.is_at_risk()).count() as u32
}

/// Result of analyzing content risk in a space.
#[derive(Clone, Debug, Default)]
pub struct RiskAnalysis {
    /// Total number of content items analyzed
    pub total_items: u32,
    /// Number of protected items (pinned or within floor)
    pub protected_items: u32,
    /// Number of items at risk (6.25% <= survival < 25%)
    pub at_risk_items: u32,
    /// Number of decayed items (survival < 6.25%)
    pub decayed_items: u32,
    /// Number of healthy items (survival >= 25%)
    pub healthy_items: u32,
}

impl RiskAnalysis {
    /// Analyze a collection of content decay information.
    pub fn analyze<I>(content_iter: I) -> Self
    where
        I: Iterator<Item = ContentDecayInfo>,
    {
        let mut analysis = Self::default();

        for info in content_iter {
            analysis.total_items += 1;

            if info.is_protected {
                analysis.protected_items += 1;
            } else if info.survival_probability < DECAY_THRESHOLD {
                analysis.decayed_items += 1;
            } else if info.survival_probability < AT_RISK_THRESHOLD {
                analysis.at_risk_items += 1;
            } else {
                analysis.healthy_items += 1;
            }
        }

        analysis
    }
}

/// Stub for future integration with ContentManager.
///
/// This will need to be integrated with the actual ContentManager once
/// it supports querying content by space_id.
///
/// # Note
/// Currently returns 0 as ContentManager doesn't have iter_space() API.
/// This is a documented dependency in the plan.
pub fn count_posts_at_risk_in_space(
    _space_id: &[u8; 16],
    _now_secs: u64,
) -> Result<u32, SpaceHealthError> {
    // TODO: Integration with ContentManager.iter_space() API
    // For now, return 0 as placeholder
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_content_info(survival: f64, protected: bool) -> ContentDecayInfo {
        ContentDecayInfo {
            content_id: [0u8; 32],
            survival_probability: survival,
            is_protected: protected,
        }
    }

    #[test]
    fn test_decay_threshold_constant() {
        assert!((DECAY_THRESHOLD - 0.0625).abs() < 0.0001);
    }

    #[test]
    fn test_at_risk_threshold_constant() {
        assert!((AT_RISK_THRESHOLD - 0.25).abs() < 0.0001);
    }

    #[test]
    fn test_is_at_risk() {
        // Below decay threshold - not at risk (already decayed)
        assert!(!make_content_info(0.05, false).is_at_risk());
        assert!(!make_content_info(0.0625 - 0.001, false).is_at_risk());

        // At risk zone (6.25% <= survival < 25%)
        assert!(make_content_info(0.0625, false).is_at_risk());
        assert!(make_content_info(0.10, false).is_at_risk());
        assert!(make_content_info(0.20, false).is_at_risk());
        assert!(make_content_info(0.24, false).is_at_risk());

        // Above at-risk threshold - healthy
        assert!(!make_content_info(0.25, false).is_at_risk());
        assert!(!make_content_info(0.50, false).is_at_risk());
        assert!(!make_content_info(1.0, false).is_at_risk());

        // Protected content is never at risk
        assert!(!make_content_info(0.10, true).is_at_risk());
    }

    #[test]
    fn test_is_decayed() {
        // Below threshold - decayed
        assert!(make_content_info(0.05, false).is_decayed());
        assert!(make_content_info(0.01, false).is_decayed());

        // At threshold - not decayed
        assert!(!make_content_info(0.0625, false).is_decayed());

        // Above threshold - not decayed
        assert!(!make_content_info(0.10, false).is_decayed());

        // Protected - never decayed
        assert!(!make_content_info(0.01, true).is_decayed());
    }

    #[test]
    fn test_count_posts_at_risk() {
        let content = vec![
            make_content_info(1.0, false),   // Healthy
            make_content_info(0.8, false),   // Healthy
            make_content_info(0.5, false),   // Healthy
            make_content_info(0.3, false),   // Healthy
            make_content_info(0.24, false),  // At risk
            make_content_info(0.20, false),  // At risk
            make_content_info(0.10, false),  // At risk
            make_content_info(0.07, false),  // At risk (just above 6.25%)
            make_content_info(0.05, false),  // Decayed
            make_content_info(0.01, false),  // Decayed
        ];

        let at_risk = count_posts_at_risk(content.into_iter());
        assert_eq!(at_risk, 4);
    }

    #[test]
    fn test_count_with_protected_content() {
        let content = vec![
            make_content_info(0.20, false),  // At risk
            make_content_info(0.20, true),   // Protected (not at risk)
            make_content_info(0.10, false),  // At risk
            make_content_info(0.10, true),   // Protected (not at risk)
        ];

        let at_risk = count_posts_at_risk(content.into_iter());
        assert_eq!(at_risk, 2);
    }

    #[test]
    fn test_risk_analysis() {
        let content = vec![
            make_content_info(1.0, false),   // Healthy
            make_content_info(0.5, false),   // Healthy
            make_content_info(0.3, false),   // Healthy
            make_content_info(0.24, false),  // At risk
            make_content_info(0.10, false),  // At risk
            make_content_info(0.05, false),  // Decayed
            make_content_info(0.20, true),   // Protected
        ];

        let analysis = RiskAnalysis::analyze(content.into_iter());

        assert_eq!(analysis.total_items, 7);
        assert_eq!(analysis.protected_items, 1);
        assert_eq!(analysis.healthy_items, 3);
        assert_eq!(analysis.at_risk_items, 2);
        assert_eq!(analysis.decayed_items, 1);
    }

    #[test]
    fn test_empty_analysis() {
        let analysis = RiskAnalysis::analyze(std::iter::empty());
        assert_eq!(analysis.total_items, 0);
        assert_eq!(analysis.at_risk_items, 0);
    }

    #[test]
    fn test_spec_example() {
        // From the plan:
        // Input: 10 posts with survival [1.0, 0.8, 0.5, 0.3, 0.24, 0.20, 0.10, 0.07, 0.05, 0.01]
        // Expected at_risk: 3 (posts with survival 0.24, 0.20, 0.10)
        // Note: 0.07 > 0.0625 so it's also at risk

        let content = vec![
            make_content_info(1.0, false),
            make_content_info(0.8, false),
            make_content_info(0.5, false),
            make_content_info(0.3, false),
            make_content_info(0.24, false),
            make_content_info(0.20, false),
            make_content_info(0.10, false),
            make_content_info(0.07, false),
            make_content_info(0.05, false),
            make_content_info(0.01, false),
        ];

        let at_risk = count_posts_at_risk(content.into_iter());

        // 0.24, 0.20, 0.10, 0.07 are all in range [0.0625, 0.25)
        assert_eq!(at_risk, 4);
    }
}
