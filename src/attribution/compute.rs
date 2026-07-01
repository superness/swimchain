//! Attribution computation functions (SPEC_09 §6.3)
//!
//! Implements contributor extraction from engagement pools and decay countdown calculation.

use crate::content::pool::PoolContribution;
use crate::types::constants::{DECAY_FLOOR_SECS, DECAY_THRESHOLD};
use crate::types::content::ContentItem;
use std::collections::HashMap;

use super::types::{AttributionEntry, ContentAttribution, ContentAttributionDisplay, DecayStatus};

/// Maximum number of contributors to display
pub const MAX_DISPLAY_CONTRIBUTORS: usize = 10;

// ============================================================================
// Contributor Extraction
// ============================================================================

/// Extract and deduplicate contributors from pool contributions.
///
/// Uses HashMap for O(n) deduplication. When the same contributor appears
/// multiple times, their PoW is summed and the earliest timestamp is kept.
///
/// # Arguments
/// * `contributions` - Slice of pool contributions to process
///
/// # Returns
/// Vec of attribution entries sorted by pow_contributed DESC
pub fn extract_contributors_from_pool(contributions: &[PoolContribution]) -> Vec<AttributionEntry> {
    // HashMap: identity -> (total_pow, first_timestamp)
    let mut aggregated: HashMap<[u8; 32], (u64, u64)> = HashMap::new();

    for c in contributions {
        aggregated
            .entry(c.contributor)
            .and_modify(|(pow, ts)| {
                *pow += c.pow_work;
                *ts = (*ts).min(c.timestamp);
            })
            .or_insert((c.pow_work, c.timestamp));
    }

    let mut entries: Vec<AttributionEntry> = aggregated
        .into_iter()
        .map(|(identity, (pow, ts))| AttributionEntry::new(identity, pow, ts))
        .collect();

    // Sort by pow_contributed DESC
    entries.sort_by(|a, b| b.pow_contributed.cmp(&a.pow_contributed));

    entries
}

/// Get display contributors (first N) and overflow count.
///
/// # Arguments
/// * `contributors` - All contributors sorted by contribution
/// * `max_display` - Maximum number to display
///
/// # Returns
/// Tuple of (display_slice, overflow_count)
pub fn get_display_contributors(
    contributors: &[AttributionEntry],
    max_display: usize,
) -> (&[AttributionEntry], usize) {
    if contributors.len() <= max_display {
        (contributors, 0)
    } else {
        (&contributors[..max_display], contributors.len() - max_display)
    }
}

// ============================================================================
// Decay Countdown
// ============================================================================

/// Calculate days until content decays.
///
/// Uses the half-life decay model from SPEC_02 §4.1:
/// - survival_probability = 0.5^(effective_decay_time / half_life)
/// - Content decays when survival < DECAY_THRESHOLD (0.0625 = 4 half-lives)
///
/// # Arguments
/// * `content` - The content item to evaluate
/// * `current_time_ms` - Current time in UNIX milliseconds
/// * `half_life_secs` - Half-life in seconds (default: 604800 = 7 days)
///
/// # Returns
/// Tuple of (days_until_decay, decay_status)
/// - Active: Some(days) where days > 0
/// - Protected: None (floor period or pinned)
/// - Decayed: Some(0) (already below threshold)
pub fn decay_countdown_days(
    content: &ContentItem,
    current_time_ms: u64,
    half_life_secs: u64,
) -> (Option<u16>, DecayStatus) {
    let current_time_secs = current_time_ms / 1000;
    let created_at_secs = content.created_at / 1000;
    let last_engagement_secs = content.last_engagement / 1000;

    let age_seconds = current_time_secs.saturating_sub(created_at_secs);
    let time_since_engagement = current_time_secs.saturating_sub(last_engagement_secs);

    // Floor protection: content < 48h old is protected
    if age_seconds < DECAY_FLOOR_SECS {
        return (None, DecayStatus::Protected);
    }

    // Pin protection
    if let Some(ref pin) = content.pin_state {
        if pin.pin_expiry.map_or(true, |exp| current_time_ms < exp) {
            return (None, DecayStatus::Protected);
        }
    }

    // Calculate effective decay time (time since engagement minus floor)
    let effective_decay_time = time_since_engagement.saturating_sub(DECAY_FLOOR_SECS);
    let half_lives_elapsed = effective_decay_time as f64 / half_life_secs as f64;

    // Content decays at 4 half-lives (survival = 0.0625)
    const HALF_LIVES_TO_DECAY: f64 = 4.0;

    // Already decayed?
    if half_lives_elapsed >= HALF_LIVES_TO_DECAY {
        return (Some(0), DecayStatus::Decayed);
    }

    // Check current survival probability
    let survival_probability = 0.5_f64.powf(half_lives_elapsed);
    if survival_probability < DECAY_THRESHOLD {
        return (Some(0), DecayStatus::Decayed);
    }

    // Calculate days remaining until 4 half-lives from last engagement
    let half_lives_remaining = HALF_LIVES_TO_DECAY - half_lives_elapsed;
    let seconds_remaining = (half_lives_remaining * half_life_secs as f64) as u64;
    let days = (seconds_remaining / 86400) as u16;

    (Some(days), DecayStatus::Active)
}


// ============================================================================
// Display Formatting
// ============================================================================

/// Trait for resolving identity pubkey to display name.
///
/// Implementations may resolve to usernames, display names, or truncated hex.
pub trait IdentityResolver {
    /// Resolve an identity to a display name.
    ///
    /// Returns None if the identity cannot be resolved.
    fn resolve(&self, identity: &[u8; 32]) -> Option<String>;
}

/// Format attribution for display per SPEC_09 §6.3.
///
/// Produces display-ready strings:
/// - Attribution line: "KEPT ALIVE BY: @alice, @bob, and 7 others"
/// - Decay line: "Decays in 12 days without engagement"
///
/// # Arguments
/// * `attribution` - The content attribution data
/// * `decay_days` - Days until decay (None for protected/decayed)
/// * `decay_status` - Current decay status
/// * `identity_resolver` - Optional resolver for identity display names
///
/// # Returns
/// Display-ready attribution data
pub fn format_attribution_display(
    attribution: &ContentAttribution,
    decay_days: Option<u16>,
    decay_status: DecayStatus,
    identity_resolver: Option<&dyn IdentityResolver>,
) -> ContentAttributionDisplay {
    // Format contributors line
    let attribution_line = if attribution.contributors.is_empty() {
        "Not yet engaged".to_string()
    } else {
        let (display, overflow) =
            get_display_contributors(&attribution.contributors, MAX_DISPLAY_CONTRIBUTORS);

        let names: Vec<String> = display
            .iter()
            .map(|c| {
                // Try to resolve to display name, fall back to truncated hex
                identity_resolver
                    .and_then(|r| r.resolve(&c.identity))
                    .unwrap_or_else(|| format!("@{}", hex::encode(&c.identity[..4])))
            })
            .collect();

        if names.is_empty() {
            "Not yet engaged".to_string()
        } else if overflow > 0 {
            format!("KEPT ALIVE BY: {}, and {} others", names.join(", "), overflow)
        } else if names.len() == 1 {
            format!("KEPT ALIVE BY: {}", names[0])
        } else {
            let (last, rest) = names.split_last().unwrap();
            format!("KEPT ALIVE BY: {}, and {}", rest.join(", "), last)
        }
    };

    // Format decay line
    let decay_line = match decay_status {
        DecayStatus::Protected => "New content (protected)".to_string(),
        DecayStatus::Decayed => "Decayed".to_string(),
        DecayStatus::Active => {
            let days = decay_days.unwrap_or(0);
            format!(
                "Decays in {} day{} without engagement",
                days,
                if days == 1 { "" } else { "s" }
            )
        }
    };

    ContentAttributionDisplay {
        content_id: attribution.content_id,
        attribution_line,
        decay_line,
        days_until_decay: decay_days,
        decay_status,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::constants::HALF_LIFE_SECS;
    use crate::types::content::{ContentId, ContentType, SpaceId};
    use crate::types::identity::{IdentityId, Signature};

    fn make_test_content(created_at_ms: u64, last_engagement_ms: u64) -> ContentItem {
        ContentItem {
            content_id: ContentId::from_bytes([1u8; 32]),
            author_id: IdentityId::from_bytes([1u8; 32]),
            content_type: ContentType::Post,
            space_id: SpaceId::from_bytes([2u8; 32]),
            parent_id: None,
            created_at: created_at_ms,
            last_engagement: last_engagement_ms,
            body_inline: Some("Test".to_string()),
            content_hash: None,
            content_size: None,
            content_type_mime: None,
            media_refs: vec![],
            pin_state: None,
            engagement_count: 0,
            signature: Signature::from_bytes([0u8; 64]),
            pow_nonce: 0,
            pow_difficulty: 0,
            preservation_pow: None,
            display_name: None,
        }
    }

    fn make_contribution(contributor: [u8; 32], pow_work: u64, timestamp: u64) -> PoolContribution {
        PoolContribution {
            contributor,
            pow_nonce: 0,
            pow_work,
            pow_target: [0u8; 32],
            timestamp,
            signature: [0u8; 64],
            nonce_space: [0u8; 8],
            emoji: None,
        }
    }

    // ========================================================================
    // Contributor Extraction Tests
    // ========================================================================

    #[test]
    fn test_extract_single_contributor() {
        let alice = [1u8; 32];
        let contributions = vec![make_contribution(alice, 30, 1000)];

        let result = extract_contributors_from_pool(&contributions);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].identity, alice);
        assert_eq!(result[0].pow_contributed, 30);
        assert_eq!(result[0].first_contribution_timestamp, 1000);
    }

    #[test]
    fn test_extract_multiple_contributors_sorted() {
        let alice = [1u8; 32];
        let bob = [2u8; 32];
        let carol = [3u8; 32];

        let contributions = vec![
            make_contribution(alice, 10, 1000),
            make_contribution(bob, 30, 2000),
            make_contribution(carol, 20, 3000),
        ];

        let result = extract_contributors_from_pool(&contributions);

        assert_eq!(result.len(), 3);
        // Sorted by pow DESC: bob(30) > carol(20) > alice(10)
        assert_eq!(result[0].identity, bob);
        assert_eq!(result[0].pow_contributed, 30);
        assert_eq!(result[1].identity, carol);
        assert_eq!(result[1].pow_contributed, 20);
        assert_eq!(result[2].identity, alice);
        assert_eq!(result[2].pow_contributed, 10);
    }

    #[test]
    fn test_contributor_deduplication() {
        let alice = [1u8; 32];

        // Alice contributes twice
        let contributions = vec![
            make_contribution(alice, 20, 2000),
            make_contribution(alice, 40, 1000), // Earlier timestamp
        ];

        let result = extract_contributors_from_pool(&contributions);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].identity, alice);
        assert_eq!(result[0].pow_contributed, 60); // 20 + 40 aggregated
        assert_eq!(result[0].first_contribution_timestamp, 1000); // Earlier timestamp kept
    }

    #[test]
    fn test_extract_empty_contributions() {
        let contributions: Vec<PoolContribution> = vec![];
        let result = extract_contributors_from_pool(&contributions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_display_contributors_within_limit() {
        let entries: Vec<AttributionEntry> = (0..5)
            .map(|i| AttributionEntry::new([i as u8; 32], 10, 0))
            .collect();

        let (display, overflow) = get_display_contributors(&entries, 10);

        assert_eq!(display.len(), 5);
        assert_eq!(overflow, 0);
    }

    #[test]
    fn test_get_display_contributors_overflow() {
        let entries: Vec<AttributionEntry> = (0..15)
            .map(|i| AttributionEntry::new([i as u8; 32], 10, 0))
            .collect();

        let (display, overflow) = get_display_contributors(&entries, 10);

        assert_eq!(display.len(), 10);
        assert_eq!(overflow, 5);
    }

    // ========================================================================
    // Decay Countdown Tests
    // ========================================================================

    #[test]
    fn test_decay_countdown_floor_protection() {
        // Content created 1 day ago (within 48h floor)
        let created_at_ms = 0;
        let current_time_ms = 86_400_000; // 1 day in ms

        let content = make_test_content(created_at_ms, created_at_ms);
        let (days, status) = decay_countdown_days(&content, current_time_ms, HALF_LIFE_SECS);

        assert_eq!(status, DecayStatus::Protected);
        assert!(days.is_none());
    }

    #[test]
    fn test_decay_countdown_fresh_past_floor() {
        // Content created 3 days ago (past 48h floor)
        // With default 7-day half-life, 4 half-lives = 28 days total
        // Fresh content should have ~25 days remaining (28 - 3 = 25)
        let created_at_ms = 0;
        let current_time_ms = 3 * 86_400_000; // 3 days in ms

        let content = make_test_content(created_at_ms, created_at_ms);
        let (days, status) = decay_countdown_days(&content, current_time_ms, HALF_LIFE_SECS);

        assert_eq!(status, DecayStatus::Active);
        // Effective decay time = 3 days - 2 day floor = 1 day
        // Half lives elapsed = 1 day / 7 days = 0.143
        // Half lives remaining = 4 - 0.143 = 3.857
        // Seconds remaining = 3.857 * 604800 = 2,332,929
        // Days = 2,332,929 / 86400 = 26.99 days
        let expected_days = days.unwrap();
        assert!(expected_days >= 26 && expected_days <= 28, "Expected ~27 days, got {}", expected_days);
    }

    #[test]
    fn test_decay_countdown_after_engagement() {
        // Content created 30 days ago, engaged 5 days ago
        let created_at_ms = 0;
        let last_engagement_ms = 25 * 86_400_000; // Engaged at day 25
        let current_time_ms = 30 * 86_400_000; // Current is day 30

        let content = make_test_content(created_at_ms, last_engagement_ms);
        let (days, status) = decay_countdown_days(&content, current_time_ms, HALF_LIFE_SECS);

        assert_eq!(status, DecayStatus::Active);
        // Time since engagement = 5 days
        // Effective decay time = 5 - 2 = 3 days
        // Half lives elapsed = 3/7 = 0.43
        // Half lives remaining = 4 - 0.43 = 3.57
        // Days = 3.57 * 7 = 25 days
        let expected_days = days.unwrap();
        assert!(expected_days >= 23 && expected_days <= 26, "Expected ~25 days, got {}", expected_days);
    }

    #[test]
    fn test_decay_countdown_decayed() {
        // Content with 35 days since engagement (past 4 half-lives = 28 days)
        let created_at_ms = 0;
        let current_time_ms = 40 * 86_400_000; // 40 days
        let last_engagement_ms = 5 * 86_400_000; // Engaged at day 5

        let content = make_test_content(created_at_ms, last_engagement_ms);
        let (days, status) = decay_countdown_days(&content, current_time_ms, HALF_LIFE_SECS);

        assert_eq!(status, DecayStatus::Decayed);
        assert_eq!(days, Some(0));
    }

    // ========================================================================
    // Display Formatting Tests
    // ========================================================================

    struct TestResolver;
    impl IdentityResolver for TestResolver {
        fn resolve(&self, identity: &[u8; 32]) -> Option<String> {
            match identity[0] {
                1 => Some("@alice".to_string()),
                2 => Some("@bob".to_string()),
                3 => Some("@carol".to_string()),
                _ => None,
            }
        }
    }

    #[test]
    fn test_format_display_no_contributors() {
        let attr = ContentAttribution::new([1u8; 32]);
        let display = format_attribution_display(&attr, Some(10), DecayStatus::Active, None);

        assert_eq!(display.attribution_line, "Not yet engaged");
        assert_eq!(display.decay_line, "Decays in 10 days without engagement");
    }

    #[test]
    fn test_format_display_single_contributor() {
        let mut attr = ContentAttribution::new([1u8; 32]);
        attr.contributors.push(AttributionEntry::new([1u8; 32], 30, 0));

        let resolver = TestResolver;
        let display = format_attribution_display(&attr, Some(10), DecayStatus::Active, Some(&resolver));

        assert_eq!(display.attribution_line, "KEPT ALIVE BY: @alice");
        assert_eq!(display.decay_line, "Decays in 10 days without engagement");
    }

    #[test]
    fn test_format_display_multiple_contributors() {
        let mut attr = ContentAttribution::new([1u8; 32]);
        attr.contributors.push(AttributionEntry::new([1u8; 32], 30, 0)); // alice
        attr.contributors.push(AttributionEntry::new([2u8; 32], 20, 0)); // bob
        attr.contributors.push(AttributionEntry::new([3u8; 32], 10, 0)); // carol

        let resolver = TestResolver;
        let display = format_attribution_display(&attr, Some(12), DecayStatus::Active, Some(&resolver));

        assert_eq!(display.attribution_line, "KEPT ALIVE BY: @alice, @bob, and @carol");
    }

    #[test]
    fn test_format_display_overflow() {
        let mut attr = ContentAttribution::new([1u8; 32]);
        // Add 15 contributors
        for i in 0..15u8 {
            attr.contributors.push(AttributionEntry::new([i; 32], 10, 0));
        }

        let display = format_attribution_display(&attr, Some(12), DecayStatus::Active, None);

        // Should show first 10 + "and 5 others"
        assert!(display.attribution_line.contains("and 5 others"));
    }

    #[test]
    fn test_format_display_protected() {
        let attr = ContentAttribution::new([1u8; 32]);
        let display = format_attribution_display(&attr, None, DecayStatus::Protected, None);

        assert_eq!(display.decay_line, "New content (protected)");
        assert_eq!(display.decay_status, DecayStatus::Protected);
    }

    #[test]
    fn test_format_display_decayed() {
        let attr = ContentAttribution::new([1u8; 32]);
        let display = format_attribution_display(&attr, Some(0), DecayStatus::Decayed, None);

        assert_eq!(display.decay_line, "Decayed");
        assert_eq!(display.decay_status, DecayStatus::Decayed);
    }

    #[test]
    fn test_format_display_singular_day() {
        let attr = ContentAttribution::new([1u8; 32]);
        let display = format_attribution_display(&attr, Some(1), DecayStatus::Active, None);

        assert_eq!(display.decay_line, "Decays in 1 day without engagement");
    }

    #[test]
    fn test_format_display_fallback_to_hex() {
        let mut attr = ContentAttribution::new([1u8; 32]);
        attr.contributors.push(AttributionEntry::new([0xab, 0xcd, 0xef, 0x12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 30, 0));

        // No resolver - should fall back to hex
        let display = format_attribution_display(&attr, Some(10), DecayStatus::Active, None);

        assert_eq!(display.attribution_line, "KEPT ALIVE BY: @abcdef12");
    }
}
