//! Achievement trigger detection
//!
//! Defines thresholds and trigger logic for all 12 achievements per SPEC_09 §5.3.

use super::tracker::AchievementTracker;
use super::types::Achievement;

// === SPEC_09 §5.3: Achievement Threshold Constants ===

/// Streak threshold for WeekSwimmer achievement (7 days)
pub const WEEK_STREAK_THRESHOLD: u32 = 7;

/// Streak threshold for MonthSwimmer achievement (30 days)
pub const MONTH_STREAK_THRESHOLD: u32 = 30;

/// Streak threshold for Centurion achievement (100 days)
pub const CENTURION_STREAK_THRESHOLD: u32 = 100;

/// Bandwidth threshold for BandwidthBaron achievement (100 GiB)
pub const BANDWIDTH_BARON_BYTES: u64 = 100 * 1024 * 1024 * 1024; // 107,374,182,400 bytes

/// Bandwidth threshold for TerabyteClub achievement (1 TiB)
pub const TERABYTE_CLUB_BYTES: u64 = 1024 * 1024 * 1024 * 1024; // 1,099,511,627,776 bytes

/// Days at 95%+ uptime for AlwaysOn achievement
pub const ALWAYS_ON_DAYS: u32 = 30;

/// Posts kept alive for KeeperOfTheFlame achievement
pub const KEEPER_OF_FLAME_POSTS: u64 = 100;

/// Efficiency ratio for EfficientSwimmer achievement (provisional)
/// contribution_score / resource_cost >= this ratio
pub const EFFICIENT_SWIMMER_RATIO: f64 = 2.0;

/// Context for evaluating achievement triggers.
///
/// This structure contains all the metrics needed to determine
/// which achievements should be unlocked.
#[derive(Debug, Clone, Default)]
pub struct TriggerContext {
    /// Total post count from identity's chain data
    pub post_count: u64,

    /// Total bandwidth ever served (bytes)
    pub lifetime_bandwidth_served: u64,

    /// Current hosting streak from StreakTracker
    pub current_streak: u32,

    /// Number of spaces created by this identity
    pub spaces_created: u32,

    /// Lifetime posts supported/kept alive through engagement
    pub lifetime_posts_supported: u64,

    /// Days at 95%+ uptime (PLACEHOLDER: 0 until daily tracking implemented)
    pub days_at_95_percent_uptime: u32,

    /// Total contribution score
    pub contribution_score: u64,

    /// Total resource cost (simplified: battery_mah + data_bytes)
    pub resource_cost: u64,
}

impl TriggerContext {
    /// Create a new empty trigger context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Builder method: set post count.
    pub fn with_post_count(mut self, count: u64) -> Self {
        self.post_count = count;
        self
    }

    /// Builder method: set lifetime bandwidth.
    pub fn with_bandwidth(mut self, bytes: u64) -> Self {
        self.lifetime_bandwidth_served = bytes;
        self
    }

    /// Builder method: set current streak.
    pub fn with_streak(mut self, days: u32) -> Self {
        self.current_streak = days;
        self
    }

    /// Builder method: set spaces created.
    pub fn with_spaces_created(mut self, count: u32) -> Self {
        self.spaces_created = count;
        self
    }

    /// Builder method: set lifetime posts supported.
    pub fn with_posts_supported(mut self, count: u64) -> Self {
        self.lifetime_posts_supported = count;
        self
    }

    /// Builder method: set days at 95% uptime.
    pub fn with_uptime_days(mut self, days: u32) -> Self {
        self.days_at_95_percent_uptime = days;
        self
    }

    /// Builder method: set contribution score and resource cost for efficiency.
    pub fn with_efficiency(mut self, contribution: u64, cost: u64) -> Self {
        self.contribution_score = contribution;
        self.resource_cost = cost;
        self
    }
}

/// Check which achievements are newly unlockable given the context.
///
/// Returns a list of achievements that should be unlocked.
/// Already-earned achievements are filtered out.
pub fn check_triggers(ctx: &TriggerContext, tracker: &AchievementTracker) -> Vec<Achievement> {
    let mut newly_unlockable = Vec::new();

    // FirstStroke: first post ever
    if ctx.post_count >= 1 && !tracker.has(Achievement::FirstStroke) {
        newly_unlockable.push(Achievement::FirstStroke);
    }

    // FirstServe: served any bandwidth
    if ctx.lifetime_bandwidth_served > 0 && !tracker.has(Achievement::FirstServe) {
        newly_unlockable.push(Achievement::FirstServe);
    }

    // Streak achievements
    if ctx.current_streak >= WEEK_STREAK_THRESHOLD && !tracker.has(Achievement::WeekSwimmer) {
        newly_unlockable.push(Achievement::WeekSwimmer);
    }
    if ctx.current_streak >= MONTH_STREAK_THRESHOLD && !tracker.has(Achievement::MonthSwimmer) {
        newly_unlockable.push(Achievement::MonthSwimmer);
    }
    if ctx.current_streak >= CENTURION_STREAK_THRESHOLD && !tracker.has(Achievement::Centurion) {
        newly_unlockable.push(Achievement::Centurion);
    }

    // Bandwidth achievements
    if ctx.lifetime_bandwidth_served >= BANDWIDTH_BARON_BYTES
        && !tracker.has(Achievement::BandwidthBaron)
    {
        newly_unlockable.push(Achievement::BandwidthBaron);
    }
    if ctx.lifetime_bandwidth_served >= TERABYTE_CLUB_BYTES
        && !tracker.has(Achievement::TerabyteClub)
    {
        newly_unlockable.push(Achievement::TerabyteClub);
    }

    // AlwaysOn: 30 days at 95%+ uptime (PLACEHOLDER - needs daily tracking)
    if ctx.days_at_95_percent_uptime >= ALWAYS_ON_DAYS && !tracker.has(Achievement::AlwaysOn) {
        newly_unlockable.push(Achievement::AlwaysOn);
    }

    // LaneOpener: created space (PoW-gated, no level requirement)
    if ctx.spaces_created >= 1 && !tracker.has(Achievement::LaneOpener) {
        newly_unlockable.push(Achievement::LaneOpener);
    }

    // KeeperOfTheFlame: 100+ posts supported
    if ctx.lifetime_posts_supported >= KEEPER_OF_FLAME_POSTS
        && !tracker.has(Achievement::KeeperOfTheFlame)
    {
        newly_unlockable.push(Achievement::KeeperOfTheFlame);
    }

    // EfficientSwimmer: ratio >= 2.0 (provisional)
    if ctx.resource_cost > 0 {
        let ratio = ctx.contribution_score as f64 / ctx.resource_cost as f64;
        if ratio >= EFFICIENT_SWIMMER_RATIO && !tracker.has(Achievement::EfficientSwimmer) {
            newly_unlockable.push(Achievement::EfficientSwimmer);
        }
    }

    newly_unlockable
}

/// Check if a specific achievement trigger is satisfied.
///
/// Unlike check_triggers, this doesn't filter out already-earned achievements.
/// Useful for UI display of progress.
pub fn is_trigger_satisfied(achievement: Achievement, ctx: &TriggerContext) -> bool {
    match achievement {
        Achievement::FirstStroke => ctx.post_count >= 1,
        Achievement::FirstServe => ctx.lifetime_bandwidth_served > 0,
        Achievement::WeekSwimmer => ctx.current_streak >= WEEK_STREAK_THRESHOLD,
        Achievement::MonthSwimmer => ctx.current_streak >= MONTH_STREAK_THRESHOLD,
        Achievement::Centurion => ctx.current_streak >= CENTURION_STREAK_THRESHOLD,
        Achievement::BandwidthBaron => ctx.lifetime_bandwidth_served >= BANDWIDTH_BARON_BYTES,
        Achievement::TerabyteClub => ctx.lifetime_bandwidth_served >= TERABYTE_CLUB_BYTES,
        Achievement::AlwaysOn => ctx.days_at_95_percent_uptime >= ALWAYS_ON_DAYS,
        Achievement::AnchorDrop => false, // Deprecated: level system removed
        Achievement::LaneOpener => ctx.spaces_created >= 1,
        Achievement::KeeperOfTheFlame => ctx.lifetime_posts_supported >= KEEPER_OF_FLAME_POSTS,
        Achievement::EfficientSwimmer => {
            if ctx.resource_cost > 0 {
                let ratio = ctx.contribution_score as f64 / ctx.resource_cost as f64;
                ratio >= EFFICIENT_SWIMMER_RATIO
            } else {
                false
            }
        }
    }
}

/// Get the progress percentage toward an achievement (0.0 to 1.0).
///
/// Returns None for achievements without numerical progress (e.g., AnchorDrop).
pub fn get_progress(achievement: Achievement, ctx: &TriggerContext) -> Option<f64> {
    match achievement {
        Achievement::FirstStroke => {
            if ctx.post_count >= 1 {
                Some(1.0)
            } else {
                Some(0.0)
            }
        }
        Achievement::FirstServe => {
            if ctx.lifetime_bandwidth_served > 0 {
                Some(1.0)
            } else {
                Some(0.0)
            }
        }
        Achievement::WeekSwimmer => {
            Some((ctx.current_streak as f64 / WEEK_STREAK_THRESHOLD as f64).min(1.0))
        }
        Achievement::MonthSwimmer => {
            Some((ctx.current_streak as f64 / MONTH_STREAK_THRESHOLD as f64).min(1.0))
        }
        Achievement::Centurion => {
            Some((ctx.current_streak as f64 / CENTURION_STREAK_THRESHOLD as f64).min(1.0))
        }
        Achievement::BandwidthBaron => {
            Some((ctx.lifetime_bandwidth_served as f64 / BANDWIDTH_BARON_BYTES as f64).min(1.0))
        }
        Achievement::TerabyteClub => {
            Some((ctx.lifetime_bandwidth_served as f64 / TERABYTE_CLUB_BYTES as f64).min(1.0))
        }
        Achievement::AlwaysOn => {
            Some((ctx.days_at_95_percent_uptime as f64 / ALWAYS_ON_DAYS as f64).min(1.0))
        }
        Achievement::AnchorDrop => None, // Binary: either first time Anchor or not
        Achievement::LaneOpener => None, // Binary: space created at Resident+ or not
        Achievement::KeeperOfTheFlame => {
            Some((ctx.lifetime_posts_supported as f64 / KEEPER_OF_FLAME_POSTS as f64).min(1.0))
        }
        Achievement::EfficientSwimmer => {
            if ctx.resource_cost > 0 {
                let ratio = ctx.contribution_score as f64 / ctx.resource_cost as f64;
                Some((ratio / EFFICIENT_SWIMMER_RATIO).min(1.0))
            } else {
                Some(0.0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_tracker() -> AchievementTracker {
        AchievementTracker::new()
    }

    // === FirstStroke tests ===
    #[test]
    fn test_first_stroke_not_triggered_at_zero() {
        let ctx = TriggerContext::new().with_post_count(0);
        let triggers = check_triggers(&ctx, &empty_tracker());
        assert!(!triggers.contains(&Achievement::FirstStroke));
    }

    #[test]
    fn test_first_stroke_triggered_at_one() {
        let ctx = TriggerContext::new().with_post_count(1);
        let triggers = check_triggers(&ctx, &empty_tracker());
        assert!(triggers.contains(&Achievement::FirstStroke));
    }

    // === FirstServe tests ===
    #[test]
    fn test_first_serve_not_triggered_at_zero() {
        let ctx = TriggerContext::new().with_bandwidth(0);
        let triggers = check_triggers(&ctx, &empty_tracker());
        assert!(!triggers.contains(&Achievement::FirstServe));
    }

    #[test]
    fn test_first_serve_triggered_at_one_byte() {
        let ctx = TriggerContext::new().with_bandwidth(1);
        let triggers = check_triggers(&ctx, &empty_tracker());
        assert!(triggers.contains(&Achievement::FirstServe));
    }

    // === Streak achievement boundary tests ===
    #[test]
    fn test_week_swimmer_boundary() {
        let ctx_below = TriggerContext::new().with_streak(6);
        assert!(!check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::WeekSwimmer));

        let ctx_at = TriggerContext::new().with_streak(7);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::WeekSwimmer));
    }

    #[test]
    fn test_month_swimmer_boundary() {
        let ctx_below = TriggerContext::new().with_streak(29);
        assert!(!check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::MonthSwimmer));

        let ctx_at = TriggerContext::new().with_streak(30);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::MonthSwimmer));
    }

    #[test]
    fn test_centurion_boundary() {
        let ctx_below = TriggerContext::new().with_streak(99);
        assert!(!check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::Centurion));

        let ctx_at = TriggerContext::new().with_streak(100);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::Centurion));
    }

    // === Bandwidth achievement boundary tests ===
    #[test]
    fn test_bandwidth_baron_boundary() {
        // Just below threshold
        let ctx_below = TriggerContext::new().with_bandwidth(BANDWIDTH_BARON_BYTES - 1);
        assert!(
            !check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::BandwidthBaron)
        );

        // At threshold
        let ctx_at = TriggerContext::new().with_bandwidth(BANDWIDTH_BARON_BYTES);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::BandwidthBaron));
    }

    #[test]
    fn test_terabyte_club_boundary() {
        let ctx_below = TriggerContext::new().with_bandwidth(TERABYTE_CLUB_BYTES - 1);
        assert!(!check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::TerabyteClub));

        let ctx_at = TriggerContext::new().with_bandwidth(TERABYTE_CLUB_BYTES);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::TerabyteClub));
    }

    // === AlwaysOn tests ===
    #[test]
    fn test_always_on_boundary() {
        let ctx_below = TriggerContext::new().with_uptime_days(29);
        assert!(!check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::AlwaysOn));

        let ctx_at = TriggerContext::new().with_uptime_days(30);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::AlwaysOn));
    }

    // === LaneOpener tests ===
    #[test]
    fn test_lane_opener() {
        // No space created
        let ctx_no_space = TriggerContext::new().with_spaces_created(0);
        assert!(!check_triggers(&ctx_no_space, &empty_tracker()).contains(&Achievement::LaneOpener));

        // Space created (PoW-gated, no level requirement)
        let ctx_with_space = TriggerContext::new().with_spaces_created(1);
        assert!(check_triggers(&ctx_with_space, &empty_tracker()).contains(&Achievement::LaneOpener));
    }

    // === KeeperOfTheFlame tests ===
    #[test]
    fn test_keeper_of_flame_boundary() {
        let ctx_below = TriggerContext::new().with_posts_supported(99);
        assert!(
            !check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::KeeperOfTheFlame)
        );

        let ctx_at = TriggerContext::new().with_posts_supported(100);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::KeeperOfTheFlame));
    }

    // === EfficientSwimmer tests ===
    #[test]
    fn test_efficient_swimmer_boundary() {
        // Ratio = 1.9 (below threshold)
        let ctx_below = TriggerContext::new().with_efficiency(190, 100);
        assert!(
            !check_triggers(&ctx_below, &empty_tracker()).contains(&Achievement::EfficientSwimmer)
        );

        // Ratio = 2.0 (at threshold)
        let ctx_at = TriggerContext::new().with_efficiency(200, 100);
        assert!(check_triggers(&ctx_at, &empty_tracker()).contains(&Achievement::EfficientSwimmer));

        // Zero cost (avoid division by zero)
        let ctx_zero = TriggerContext::new().with_efficiency(1000, 0);
        assert!(
            !check_triggers(&ctx_zero, &empty_tracker()).contains(&Achievement::EfficientSwimmer)
        );
    }

    // === Already-earned filtering ===
    #[test]
    fn test_already_earned_not_triggered() {
        let mut tracker = AchievementTracker::new();
        tracker.unlock(Achievement::FirstStroke, 1735689600);

        let ctx = TriggerContext::new().with_post_count(100);
        let triggers = check_triggers(&ctx, &tracker);

        // FirstStroke should not be in triggers since already earned
        assert!(!triggers.contains(&Achievement::FirstStroke));
    }

    // === Progress tests ===
    #[test]
    fn test_progress_streak() {
        let ctx = TriggerContext::new().with_streak(50);

        assert_eq!(get_progress(Achievement::WeekSwimmer, &ctx), Some(1.0)); // 50/7 capped at 1.0
        assert_eq!(get_progress(Achievement::MonthSwimmer, &ctx), Some(1.0)); // 50/30 capped at 1.0
        assert!((get_progress(Achievement::Centurion, &ctx).unwrap() - 0.5).abs() < 0.01);
        // 50/100
    }

    #[test]
    fn test_progress_binary() {
        let ctx = TriggerContext::new();
        assert_eq!(get_progress(Achievement::AnchorDrop, &ctx), None);
        assert_eq!(get_progress(Achievement::LaneOpener, &ctx), None);
    }

    // === is_trigger_satisfied tests ===
    #[test]
    fn test_is_trigger_satisfied() {
        let ctx = TriggerContext::new().with_post_count(1).with_streak(10);

        assert!(is_trigger_satisfied(Achievement::FirstStroke, &ctx));
        assert!(is_trigger_satisfied(Achievement::WeekSwimmer, &ctx));
        assert!(!is_trigger_satisfied(Achievement::MonthSwimmer, &ctx));
    }

    // === Threshold constant tests ===
    #[test]
    fn test_threshold_constants() {
        assert_eq!(WEEK_STREAK_THRESHOLD, 7);
        assert_eq!(MONTH_STREAK_THRESHOLD, 30);
        assert_eq!(CENTURION_STREAK_THRESHOLD, 100);
        assert_eq!(BANDWIDTH_BARON_BYTES, 100 * 1024 * 1024 * 1024);
        assert_eq!(TERABYTE_CLUB_BYTES, 1024 * 1024 * 1024 * 1024);
        assert_eq!(ALWAYS_ON_DAYS, 30);
        assert_eq!(KEEPER_OF_FLAME_POSTS, 100);
        assert!((EFFICIENT_SWIMMER_RATIO - 2.0).abs() < 0.001);
    }
}
