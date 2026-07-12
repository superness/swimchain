//! Engagement graph types

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Type of engagement action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EngagementType {
    /// Reply to content
    Reply,
    /// Reaction (upvote, etc.)
    Reaction,
    /// Quote/repost
    Quote,
}

impl EngagementType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EngagementType::Reply => "reply",
            EngagementType::Reaction => "reaction",
            EngagementType::Quote => "quote",
        }
    }
}

/// A directed edge in the engagement graph: engager -> author
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngagementEdge {
    /// Who performed the engagement
    pub engager: [u8; 32],
    /// Whose content was engaged with
    pub author: [u8; 32],
    /// Total number of engagements
    pub total_count: u64,
    /// Count by type
    pub reply_count: u32,
    pub reaction_count: u32,
    pub quote_count: u32,
    /// First engagement timestamp (seconds since epoch)
    pub first_engagement: u64,
    /// Most recent engagement timestamp
    pub last_engagement: u64,
    /// Recent engagement timestamps (for rate/pattern analysis)
    /// Keep last N timestamps for sliding window analysis
    /// Uses VecDeque for O(1) pop_front() instead of O(n) Vec::remove(0)
    pub recent_timestamps: VecDeque<u64>,
}

impl EngagementEdge {
    /// Maximum recent timestamps to keep
    pub const MAX_RECENT: usize = 100;

    /// Create a new edge with first engagement
    pub fn new(
        engager: [u8; 32],
        author: [u8; 32],
        engagement_type: EngagementType,
        timestamp: u64,
    ) -> Self {
        let mut edge = Self {
            engager,
            author,
            total_count: 1,
            reply_count: 0,
            reaction_count: 0,
            quote_count: 0,
            first_engagement: timestamp,
            last_engagement: timestamp,
            recent_timestamps: VecDeque::from([timestamp]),
        };
        edge.increment_type(engagement_type);
        edge
    }

    /// Record a new engagement
    pub fn record(&mut self, engagement_type: EngagementType, timestamp: u64) {
        self.total_count += 1;
        self.increment_type(engagement_type);
        self.last_engagement = timestamp;

        // Add to recent timestamps, keeping bounded
        // Uses VecDeque::pop_front() for O(1) removal instead of Vec::remove(0) which is O(n)
        self.recent_timestamps.push_back(timestamp);
        if self.recent_timestamps.len() > Self::MAX_RECENT {
            self.recent_timestamps.pop_front();
        }
    }

    fn increment_type(&mut self, engagement_type: EngagementType) {
        match engagement_type {
            EngagementType::Reply => self.reply_count += 1,
            EngagementType::Reaction => self.reaction_count += 1,
            EngagementType::Quote => self.quote_count += 1,
        }
    }

    /// Get engagement rate (engagements per day) over recent window
    pub fn recent_rate(&self) -> f64 {
        if self.recent_timestamps.len() < 2 {
            return 0.0;
        }
        let first = self.recent_timestamps.front().unwrap();
        let last = self.recent_timestamps.back().unwrap();
        let duration_secs = last.saturating_sub(*first);
        if duration_secs == 0 {
            return 0.0;
        }
        let days = duration_secs as f64 / 86400.0;
        self.recent_timestamps.len() as f64 / days
    }

    /// Check if this looks like self-engagement (same identity)
    pub fn is_self_engagement(&self) -> bool {
        self.engager == self.author
    }
}

/// Aggregate engagement stats for an identity
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EngagementStats {
    /// Identity this stats are for
    pub identity: [u8; 32],

    // Outgoing engagement (this identity engaging with others)
    /// Number of unique authors engaged with
    pub unique_authors_engaged: u32,
    /// Total outgoing engagements
    pub total_outgoing: u64,
    /// Outgoing by type
    pub outgoing_replies: u32,
    pub outgoing_reactions: u32,
    pub outgoing_quotes: u32,

    // Incoming engagement (others engaging with this identity)
    /// Number of unique engagers
    pub unique_engagers: u32,
    /// Total incoming engagements
    pub total_incoming: u64,
    /// Incoming by type
    pub incoming_replies: u32,
    pub incoming_reactions: u32,
    pub incoming_quotes: u32,

    // Self-engagement tracking (for spam detection)
    /// Self-engagement count (engaging with own content)
    pub self_engagement_count: u64,

    /// Last updated timestamp
    pub last_updated: u64,
}

impl EngagementStats {
    pub fn new(identity: [u8; 32]) -> Self {
        Self {
            identity,
            ..Default::default()
        }
    }

    /// Ratio of self-engagement to total incoming
    /// High ratio suggests potential spam/manipulation
    pub fn self_engagement_ratio(&self) -> f64 {
        if self.total_incoming == 0 {
            return 0.0;
        }
        self.self_engagement_count as f64 / self.total_incoming as f64
    }

    /// Engagement diversity score (0-1)
    /// Higher = more diverse engagement from many sources
    /// Lower = concentrated engagement from few sources
    pub fn incoming_diversity(&self) -> f64 {
        if self.total_incoming == 0 || self.unique_engagers == 0 {
            return 0.0;
        }
        // Simple metric: ratio of unique engagers to total engagements
        // Capped at 1.0
        (self.unique_engagers as f64 / self.total_incoming as f64).min(1.0)
    }

    /// Check if engagement pattern looks organic
    /// Returns (is_organic, reason)
    pub fn looks_organic(&self) -> (bool, &'static str) {
        // Need minimum engagement to assess
        if self.total_incoming < 10 {
            return (true, "insufficient_data");
        }

        // High self-engagement is suspicious
        if self.self_engagement_ratio() > 0.3 {
            return (false, "high_self_engagement");
        }

        // Very low diversity is suspicious
        if self.incoming_diversity() < 0.1 {
            return (false, "low_diversity");
        }

        (true, "ok")
    }
}

/// Summary of engagement between two identities (bidirectional)
#[derive(Debug, Clone)]
pub struct MutualEngagement {
    pub identity_a: [u8; 32],
    pub identity_b: [u8; 32],
    /// A engaging with B's content
    pub a_to_b: Option<EngagementEdge>,
    /// B engaging with A's content
    pub b_to_a: Option<EngagementEdge>,
}

impl MutualEngagement {
    /// Check if engagement is mutual (both directions)
    pub fn is_mutual(&self) -> bool {
        self.a_to_b.is_some() && self.b_to_a.is_some()
    }

    /// Total engagements in both directions
    pub fn total(&self) -> u64 {
        let a_to_b = self.a_to_b.as_ref().map(|e| e.total_count).unwrap_or(0);
        let b_to_a = self.b_to_a.as_ref().map(|e| e.total_count).unwrap_or(0);
        a_to_b + b_to_a
    }

    /// Balance ratio (-1 to 1)
    /// 0 = perfectly balanced
    /// Positive = A engages more with B
    /// Negative = B engages more with A
    pub fn balance(&self) -> f64 {
        let a_to_b = self.a_to_b.as_ref().map(|e| e.total_count).unwrap_or(0) as f64;
        let b_to_a = self.b_to_a.as_ref().map(|e| e.total_count).unwrap_or(0) as f64;
        let total = a_to_b + b_to_a;
        if total == 0.0 {
            return 0.0;
        }
        (a_to_b - b_to_a) / total
    }
}
