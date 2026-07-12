//! Achievement type definitions
//!
//! Defines Achievement enum and AchievementRecord per SPEC_09 Section 5.3.
//! All 12 achievement types with unique badges.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Achievement identifier per SPEC_09 §5.3
///
/// Achievements are permanent, non-transferable accomplishments that
/// recognize specific hosting and participation milestones.
///
/// #[repr(u8)] ensures stable wire format for storage and transmission.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Achievement {
    /// First post ever created
    FirstStroke = 0,

    /// First content served to a peer
    FirstServe = 1,

    /// 7-day hosting streak.
    /// DEFERRED: needs a persistent daily hosting-streak ledger that does not yet
    /// exist. Threshold logic is retained for when it lands.
    WeekSwimmer = 2,

    /// 30-day hosting streak.
    /// DEFERRED: see WeekSwimmer — depends on the same daily streak ledger.
    MonthSwimmer = 3,

    /// 100-day hosting streak.
    /// DEFERRED: see WeekSwimmer — depends on the same daily streak ledger.
    Centurion = 4,

    /// Served 100GB lifetime (changed badge from 📡 to 🏅 to avoid duplicate)
    BandwidthBaron = 5,

    /// Served 1TB lifetime
    TerabyteClub = 6,

    /// 30 days at 95%+ uptime.
    /// DEFERRED: requires a persistent daily uptime ledger the node does not yet
    /// keep, so nothing awards this in the live path. The threshold logic exists
    /// for when that ledger lands.
    AlwaysOn = 7,

    /// DEPRECATED: originally "first time reaching Anchor level". The swimmer
    /// level ladder was removed (PoW-only gating), so there is no Anchor level to
    /// reach and nothing awards this. The variant is retained for stable wire
    /// format; its trigger is permanently unsatisfiable.
    AnchorDrop = 8,

    /// Created first space. Re-specified for the PoW-only model: no swimmer-level
    /// gate — creating any space qualifies. Awarded on the space-creation path.
    LaneOpener = 9,

    /// Kept 100+ posts alive through engagement
    KeeperOfTheFlame = 10,

    /// High contribution with low resource use.
    /// DEFERRED: provisional metric with no resource-cost accounting in the node,
    /// so nothing awards it in the live path.
    EfficientSwimmer = 11,
}

impl Achievement {
    /// Convert from u8 representation.
    ///
    /// Returns None if the value is out of range (0-11).
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(Self::FirstStroke),
            1 => Some(Self::FirstServe),
            2 => Some(Self::WeekSwimmer),
            3 => Some(Self::MonthSwimmer),
            4 => Some(Self::Centurion),
            5 => Some(Self::BandwidthBaron),
            6 => Some(Self::TerabyteClub),
            7 => Some(Self::AlwaysOn),
            8 => Some(Self::AnchorDrop),
            9 => Some(Self::LaneOpener),
            10 => Some(Self::KeeperOfTheFlame),
            11 => Some(Self::EfficientSwimmer),
            _ => None,
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get the badge emoji for this achievement.
    ///
    /// Each achievement has a unique badge per SPEC_09 §5.3.
    /// Note: BandwidthBaron uses 🏅 instead of 📡 to avoid duplicate with FirstServe.
    pub fn badge(&self) -> &'static str {
        match self {
            Self::FirstStroke => "🌊",
            Self::FirstServe => "📡",
            Self::WeekSwimmer => "📅",
            Self::MonthSwimmer => "📆",
            Self::Centurion => "💯",
            Self::BandwidthBaron => "🏅", // Changed from 📡 to avoid duplicate
            Self::TerabyteClub => "🏆",
            Self::AlwaysOn => "⚡",
            Self::AnchorDrop => "⚓",
            Self::LaneOpener => "🏗️",
            Self::KeeperOfTheFlame => "🔥",
            Self::EfficientSwimmer => "🌱",
        }
    }

    /// Get the human-readable name of this achievement.
    pub fn name(&self) -> &'static str {
        match self {
            Self::FirstStroke => "First Stroke",
            Self::FirstServe => "First Serve",
            Self::WeekSwimmer => "Week Swimmer",
            Self::MonthSwimmer => "Month Swimmer",
            Self::Centurion => "Centurion",
            Self::BandwidthBaron => "Bandwidth Baron",
            Self::TerabyteClub => "Terabyte Club",
            Self::AlwaysOn => "Always On",
            Self::AnchorDrop => "Anchor Drop",
            Self::LaneOpener => "Lane Opener",
            Self::KeeperOfTheFlame => "Keeper of the Flame",
            Self::EfficientSwimmer => "Efficient Swimmer",
        }
    }

    /// Get a description of what triggers this achievement.
    pub fn description(&self) -> &'static str {
        match self {
            Self::FirstStroke => "Created your first post",
            Self::FirstServe => "Served content to a peer for the first time",
            Self::WeekSwimmer => "Maintained a 7-day hosting streak",
            Self::MonthSwimmer => "Maintained a 30-day hosting streak",
            Self::Centurion => "Maintained a 100-day hosting streak",
            Self::BandwidthBaron => "Served 100GB of content lifetime",
            Self::TerabyteClub => "Served 1TB of content lifetime",
            Self::AlwaysOn => "30 days with 95%+ uptime",
            Self::AnchorDrop => "[DEPRECATED] Reached Anchor level - level system removed",
            Self::LaneOpener => "Created your first space",
            Self::KeeperOfTheFlame => "Kept 100+ posts alive through engagement",
            Self::EfficientSwimmer => "High contribution with low resource usage",
        }
    }

    /// Get all achievement variants.
    pub fn all() -> [Achievement; 12] {
        [
            Self::FirstStroke,
            Self::FirstServe,
            Self::WeekSwimmer,
            Self::MonthSwimmer,
            Self::Centurion,
            Self::BandwidthBaron,
            Self::TerabyteClub,
            Self::AlwaysOn,
            Self::AnchorDrop,
            Self::LaneOpener,
            Self::KeeperOfTheFlame,
            Self::EfficientSwimmer,
        ]
    }

    /// Check if this is a streak-based achievement.
    pub fn is_streak_based(&self) -> bool {
        matches!(
            self,
            Self::WeekSwimmer | Self::MonthSwimmer | Self::Centurion
        )
    }

    /// Check if this is a bandwidth-based achievement.
    pub fn is_bandwidth_based(&self) -> bool {
        matches!(self, Self::BandwidthBaron | Self::TerabyteClub)
    }
}

impl Default for Achievement {
    fn default() -> Self {
        Self::FirstStroke
    }
}

impl fmt::Display for Achievement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.badge(), self.name())
    }
}

/// Record of when an achievement was unlocked.
///
/// Per SPEC_09 §5.3, achievements are permanent once earned.
/// The record captures both the Unix timestamp and the day since genesis
/// for consistent tracking.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AchievementRecord {
    /// The achievement that was unlocked
    pub achievement: Achievement,

    /// Unix timestamp when this achievement was unlocked
    pub unlocked_at_secs: u64,

    /// Days since GENESIS_EPOCH when unlocked
    pub unlocked_day: u32,
}

impl AchievementRecord {
    /// Create a new achievement record.
    pub fn new(achievement: Achievement, unlocked_at_secs: u64, unlocked_day: u32) -> Self {
        Self {
            achievement,
            unlocked_at_secs,
            unlocked_day,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_achievement_count() {
        assert_eq!(Achievement::all().len(), 12);
    }

    #[test]
    fn test_achievement_values() {
        assert_eq!(Achievement::FirstStroke.as_u8(), 0);
        assert_eq!(Achievement::FirstServe.as_u8(), 1);
        assert_eq!(Achievement::WeekSwimmer.as_u8(), 2);
        assert_eq!(Achievement::MonthSwimmer.as_u8(), 3);
        assert_eq!(Achievement::Centurion.as_u8(), 4);
        assert_eq!(Achievement::BandwidthBaron.as_u8(), 5);
        assert_eq!(Achievement::TerabyteClub.as_u8(), 6);
        assert_eq!(Achievement::AlwaysOn.as_u8(), 7);
        assert_eq!(Achievement::AnchorDrop.as_u8(), 8);
        assert_eq!(Achievement::LaneOpener.as_u8(), 9);
        assert_eq!(Achievement::KeeperOfTheFlame.as_u8(), 10);
        assert_eq!(Achievement::EfficientSwimmer.as_u8(), 11);
    }

    #[test]
    fn test_from_u8() {
        for i in 0..12u8 {
            assert!(Achievement::from_u8(i).is_some());
        }
        assert!(Achievement::from_u8(12).is_none());
        assert!(Achievement::from_u8(255).is_none());
    }

    #[test]
    fn test_roundtrip() {
        for achievement in Achievement::all() {
            let val = achievement.as_u8();
            let restored = Achievement::from_u8(val).unwrap();
            assert_eq!(achievement, restored);
        }
    }

    #[test]
    fn test_unique_badges() {
        let badges: HashSet<_> = Achievement::all().iter().map(|a| a.badge()).collect();
        assert_eq!(badges.len(), 12, "All badges must be unique");
    }

    #[test]
    fn test_names_non_empty() {
        for achievement in Achievement::all() {
            assert!(!achievement.name().is_empty());
            assert!(!achievement.description().is_empty());
            assert!(!achievement.badge().is_empty());
        }
    }

    #[test]
    fn test_display() {
        let achievement = Achievement::FirstStroke;
        let display = format!("{}", achievement);
        assert!(display.contains("First Stroke"));
        assert!(display.contains("🌊"));
    }

    #[test]
    fn test_streak_based() {
        assert!(!Achievement::FirstStroke.is_streak_based());
        assert!(Achievement::WeekSwimmer.is_streak_based());
        assert!(Achievement::MonthSwimmer.is_streak_based());
        assert!(Achievement::Centurion.is_streak_based());
    }

    #[test]
    fn test_bandwidth_based() {
        assert!(!Achievement::FirstStroke.is_bandwidth_based());
        assert!(Achievement::BandwidthBaron.is_bandwidth_based());
        assert!(Achievement::TerabyteClub.is_bandwidth_based());
    }

    #[test]
    fn test_achievement_record() {
        let record = AchievementRecord::new(Achievement::FirstStroke, 1735689600, 0);
        assert_eq!(record.achievement, Achievement::FirstStroke);
        assert_eq!(record.unlocked_at_secs, 1735689600);
        assert_eq!(record.unlocked_day, 0);
    }

    #[test]
    fn test_serialization() {
        let record = AchievementRecord::new(Achievement::Centurion, 1740000000, 50);
        let serialized = bincode::serialize(&record).unwrap();
        let deserialized: AchievementRecord = bincode::deserialize(&serialized).unwrap();
        assert_eq!(record, deserialized);
    }

    #[test]
    fn test_hash() {
        // Verify Achievement can be used as HashMap key
        use std::collections::HashMap;
        let mut map: HashMap<Achievement, u32> = HashMap::new();
        map.insert(Achievement::FirstStroke, 1);
        map.insert(Achievement::Centurion, 100);
        assert_eq!(map.get(&Achievement::FirstStroke), Some(&1));
        assert_eq!(map.get(&Achievement::Centurion), Some(&100));
    }
}
