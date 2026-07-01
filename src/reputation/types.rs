//! Poster reputation type definitions
//!
//! Defines PosterReputation per SPEC_12 Section 3.4.

use serde::{Deserialize, Serialize};

/// Poster reputation structure per SPEC_12 Section 3.4.
///
/// Tracks an identity's posting history and abuse signals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PosterReputation {
    /// Identity public key
    pub identity: [u8; 32],

    /// Total spam attestations received against this identity's content
    pub spam_flags_received: u32,

    /// Spam flags that were successfully counter-attested
    pub spam_flags_countered: u32,

    /// Illegal content flags (should be 0 for normal operation)
    pub illegal_content_flags: u32,

    /// Positive quality attestations received (future extension)
    pub quality_attestations: u32,

    /// Times this identity's own attestations were counter-attested
    /// (indicates bad-faith attestation behavior)
    pub attester_countered_count: u32,

    /// Times this identity successfully counter-attested for others
    /// (indicates good-faith defense behavior)
    pub counter_attestation_successes: u32,

    /// Age of identity in days
    pub identity_age_days: u32,

    /// Unix timestamp of last spam flag received
    pub last_spam_flag_at: u64,

    /// Unix timestamp of last successful counter-attestation received
    pub last_counter_success_at: u64,

    /// Cached reputation score (recalculated when any field changes)
    pub cached_score: i32,

    /// Total posts created by this identity
    pub total_posts: u32,

    /// Total content engagements (replies, reactions)
    pub total_engagements: u32,
}

impl PosterReputation {
    /// Create a new reputation record for a fresh identity.
    pub fn new(identity: [u8; 32]) -> Self {
        Self {
            identity,
            spam_flags_received: 0,
            spam_flags_countered: 0,
            illegal_content_flags: 0,
            quality_attestations: 0,
            attester_countered_count: 0,
            counter_attestation_successes: 0,
            identity_age_days: 0,
            last_spam_flag_at: 0,
            last_counter_success_at: 0,
            cached_score: 100, // Base score
            total_posts: 0,
            total_engagements: 0,
        }
    }

    /// Create a new reputation record with specified age.
    pub fn with_age(identity: [u8; 32], age_days: u32) -> Self {
        let mut rep = Self::new(identity);
        rep.identity_age_days = age_days;
        rep.recalculate_score(0); // No recovery days yet
        rep
    }

    /// Record receiving a spam flag.
    ///
    /// Updates the spam_flags_received counter and last_spam_flag_at timestamp.
    pub fn receive_spam_flag(&mut self, timestamp: u64) {
        self.spam_flags_received = self.spam_flags_received.saturating_add(1);
        self.last_spam_flag_at = timestamp;
        self.recalculate_score(0); // Reset recovery
    }

    /// Record a spam flag being counter-attested (cleared).
    ///
    /// This triggers fast recovery per SPEC_12 §4.5.
    pub fn receive_counter(&mut self, timestamp: u64) {
        self.spam_flags_countered = self.spam_flags_countered.saturating_add(1);
        self.last_counter_success_at = timestamp;
        self.recalculate_score(0);
    }

    /// Record an illegal content flag.
    ///
    /// This has a devastating impact on reputation (-1000 per flag).
    pub fn receive_illegal_flag(&mut self, timestamp: u64) {
        self.illegal_content_flags = self.illegal_content_flags.saturating_add(1);
        self.last_spam_flag_at = timestamp;
        self.recalculate_score(0);
    }

    /// Record this identity's attestation being counter-attested.
    ///
    /// This indicates bad-faith attestation behavior.
    pub fn attestation_countered(&mut self) {
        self.attester_countered_count = self.attester_countered_count.saturating_add(1);
        self.recalculate_score(0);
    }

    /// Record this identity successfully counter-attesting for someone.
    ///
    /// This grants a reputation bonus per SPEC_12 §2.2.7.
    pub fn counter_success(&mut self) {
        self.counter_attestation_successes = self.counter_attestation_successes.saturating_add(1);
        self.recalculate_score(0);
    }

    /// Record receiving a quality attestation.
    pub fn receive_quality_attestation(&mut self) {
        self.quality_attestations = self.quality_attestations.saturating_add(1);
        self.recalculate_score(0);
    }

    /// Update identity age in days.
    pub fn update_age(&mut self, age_days: u32) {
        self.identity_age_days = age_days;
        self.recalculate_score(self.days_since_last_flag(0));
    }

    /// Record a new post created.
    pub fn record_post(&mut self) {
        self.total_posts = self.total_posts.saturating_add(1);
    }

    /// Record an engagement (reply, reaction).
    pub fn record_engagement(&mut self) {
        self.total_engagements = self.total_engagements.saturating_add(1);
    }

    /// Calculate days since last spam flag.
    fn days_since_last_flag(&self, current_time: u64) -> u32 {
        if self.last_spam_flag_at == 0 || current_time <= self.last_spam_flag_at {
            return 0;
        }
        let seconds = current_time - self.last_spam_flag_at;
        (seconds / 86400) as u32
    }

    /// Recalculate the cached reputation score.
    ///
    /// This implements the formula from SPEC_12 §4.5.
    fn recalculate_score(&mut self, days_since_flag: u32) {
        use super::score::calculate_reputation_score;
        self.cached_score = calculate_reputation_score(self, days_since_flag);
    }

    /// Update score based on current time.
    ///
    /// Call this periodically to include recovery bonus.
    pub fn update_score(&mut self, current_time: u64) {
        let days = self.days_since_last_flag(current_time);
        self.recalculate_score(days);
    }

    /// Check if identity has any illegal content flags.
    pub fn has_illegal_flags(&self) -> bool {
        self.illegal_content_flags > 0
    }

    /// Get the current cached score.
    pub fn score(&self) -> i32 {
        self.cached_score
    }

    /// Get net spam flags (received minus countered).
    pub fn net_spam_flags(&self) -> u32 {
        self.spam_flags_received.saturating_sub(self.spam_flags_countered)
    }

    /// Serialize to bytes for storage.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(128);

        bytes.extend_from_slice(&self.identity);
        bytes.extend_from_slice(&self.spam_flags_received.to_le_bytes());
        bytes.extend_from_slice(&self.spam_flags_countered.to_le_bytes());
        bytes.extend_from_slice(&self.illegal_content_flags.to_le_bytes());
        bytes.extend_from_slice(&self.quality_attestations.to_le_bytes());
        bytes.extend_from_slice(&self.attester_countered_count.to_le_bytes());
        bytes.extend_from_slice(&self.counter_attestation_successes.to_le_bytes());
        bytes.extend_from_slice(&self.identity_age_days.to_le_bytes());
        bytes.extend_from_slice(&self.last_spam_flag_at.to_le_bytes());
        bytes.extend_from_slice(&self.last_counter_success_at.to_le_bytes());
        bytes.extend_from_slice(&self.cached_score.to_le_bytes());
        bytes.extend_from_slice(&self.total_posts.to_le_bytes());
        bytes.extend_from_slice(&self.total_engagements.to_le_bytes());

        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        // Minimum size: 32 (identity) + 7*4 (u32s) + 2*8 (u64s) + 4 (i32) + 2*4 (u32s) = 88 bytes
        if bytes.len() < 88 {
            return None;
        }

        let mut identity = [0u8; 32];
        identity.copy_from_slice(&bytes[0..32]);

        let spam_flags_received = u32::from_le_bytes(bytes[32..36].try_into().ok()?);
        let spam_flags_countered = u32::from_le_bytes(bytes[36..40].try_into().ok()?);
        let illegal_content_flags = u32::from_le_bytes(bytes[40..44].try_into().ok()?);
        let quality_attestations = u32::from_le_bytes(bytes[44..48].try_into().ok()?);
        let attester_countered_count = u32::from_le_bytes(bytes[48..52].try_into().ok()?);
        let counter_attestation_successes = u32::from_le_bytes(bytes[52..56].try_into().ok()?);
        let identity_age_days = u32::from_le_bytes(bytes[56..60].try_into().ok()?);
        let last_spam_flag_at = u64::from_le_bytes(bytes[60..68].try_into().ok()?);
        let last_counter_success_at = u64::from_le_bytes(bytes[68..76].try_into().ok()?);
        let cached_score = i32::from_le_bytes(bytes[76..80].try_into().ok()?);
        let total_posts = u32::from_le_bytes(bytes[80..84].try_into().ok()?);
        let total_engagements = u32::from_le_bytes(bytes[84..88].try_into().ok()?);

        Some(Self {
            identity,
            spam_flags_received,
            spam_flags_countered,
            illegal_content_flags,
            quality_attestations,
            attester_countered_count,
            counter_attestation_successes,
            identity_age_days,
            last_spam_flag_at,
            last_counter_success_at,
            cached_score,
            total_posts,
            total_engagements,
        })
    }
}

/// Compact reputation summary for display.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReputationSummary {
    /// Current reputation score
    pub score: i32,

    /// Reputation effect category
    pub effect: String,

    /// Identity age in days
    pub age_days: u32,

    /// Net spam flags (received - countered)
    pub net_spam_flags: u32,

    /// Whether identity has any illegal content flags
    pub has_illegal_flags: bool,

    /// Total posts created
    pub total_posts: u32,

    /// Badge text for display
    pub badge: String,
}

impl ReputationSummary {
    /// Create a summary from a full reputation record.
    pub fn from_reputation(rep: &PosterReputation) -> Self {
        use super::score::get_reputation_effect;

        let effect = get_reputation_effect(rep.cached_score);

        Self {
            score: rep.cached_score,
            effect: effect.name().to_string(),
            age_days: rep.identity_age_days,
            net_spam_flags: rep.net_spam_flags(),
            has_illegal_flags: rep.has_illegal_flags(),
            total_posts: rep.total_posts,
            badge: effect.badge().to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_reputation() {
        let identity = [1u8; 32];
        let rep = PosterReputation::new(identity);

        assert_eq!(rep.identity, identity);
        assert_eq!(rep.spam_flags_received, 0);
        assert_eq!(rep.cached_score, 100); // Base score
    }

    #[test]
    fn test_with_age() {
        let identity = [1u8; 32];
        let rep = PosterReputation::with_age(identity, 100);

        assert_eq!(rep.identity_age_days, 100);
        // Score should include age bonus: 100 base + 100 age = 200
        assert_eq!(rep.cached_score, 200);
    }

    #[test]
    fn test_receive_spam_flag() {
        let mut rep = PosterReputation::new([1u8; 32]);
        let timestamp = 1735689600;

        rep.receive_spam_flag(timestamp);

        assert_eq!(rep.spam_flags_received, 1);
        assert_eq!(rep.last_spam_flag_at, timestamp);
        // Score should decrease: 100 - 20 (spam penalty) = 80
        assert_eq!(rep.cached_score, 80);
    }

    #[test]
    fn test_receive_counter() {
        let mut rep = PosterReputation::new([1u8; 32]);

        // First get a spam flag
        rep.receive_spam_flag(1735689600);
        assert_eq!(rep.cached_score, 80); // 100 - 20

        // Then counter it
        rep.receive_counter(1735689700);

        assert_eq!(rep.spam_flags_countered, 1);
        // Score: 100 - 20 (spam) + 15 (counter_bonus) + 10 (fast_recovery) = 105
        assert_eq!(rep.cached_score, 105);
    }

    #[test]
    fn test_illegal_flag_devastating() {
        let mut rep = PosterReputation::with_age([1u8; 32], 365);
        // Initial score: 100 + 365 = 465

        rep.receive_illegal_flag(1735689600);

        // Should be devastated: 465 - 1000 = -535, clamped to -535 (not below -1000)
        assert!(rep.cached_score < 0);
        assert!(rep.has_illegal_flags());
    }

    #[test]
    fn test_attester_countered() {
        let mut rep = PosterReputation::new([1u8; 32]);

        rep.attestation_countered();

        assert_eq!(rep.attester_countered_count, 1);
        // Score: 100 - 30 (attester_penalty) = 70
        assert_eq!(rep.cached_score, 70);
    }

    #[test]
    fn test_counter_success_bonus() {
        let mut rep = PosterReputation::new([1u8; 32]);

        rep.counter_success();

        assert_eq!(rep.counter_attestation_successes, 1);
        // Score: 100 + 3 (counter_success_bonus) = 103
        assert_eq!(rep.cached_score, 103);
    }

    #[test]
    fn test_quality_attestation() {
        let mut rep = PosterReputation::new([1u8; 32]);

        rep.receive_quality_attestation();

        assert_eq!(rep.quality_attestations, 1);
        // Score: 100 + 5 (quality_bonus) = 105
        assert_eq!(rep.cached_score, 105);
    }

    #[test]
    fn test_serialization_roundtrip() {
        let mut rep = PosterReputation::with_age([1u8; 32], 100);
        rep.spam_flags_received = 5;
        rep.spam_flags_countered = 2;
        rep.quality_attestations = 10;
        rep.total_posts = 50;

        let bytes = rep.to_bytes();
        let restored = PosterReputation::from_bytes(&bytes).unwrap();

        assert_eq!(rep.identity, restored.identity);
        assert_eq!(rep.spam_flags_received, restored.spam_flags_received);
        assert_eq!(rep.spam_flags_countered, restored.spam_flags_countered);
        assert_eq!(rep.quality_attestations, restored.quality_attestations);
        assert_eq!(rep.identity_age_days, restored.identity_age_days);
        assert_eq!(rep.total_posts, restored.total_posts);
    }

    #[test]
    fn test_net_spam_flags() {
        let mut rep = PosterReputation::new([1u8; 32]);

        rep.spam_flags_received = 5;
        rep.spam_flags_countered = 2;

        assert_eq!(rep.net_spam_flags(), 3);
    }

    #[test]
    fn test_summary() {
        let rep = PosterReputation::with_age([1u8; 32], 100);
        let summary = ReputationSummary::from_reputation(&rep);

        assert_eq!(summary.score, 200);
        assert_eq!(summary.age_days, 100);
        assert!(!summary.has_illegal_flags);
    }

    #[test]
    fn test_record_post_and_engagement() {
        let mut rep = PosterReputation::new([1u8; 32]);

        rep.record_post();
        rep.record_post();
        rep.record_engagement();

        assert_eq!(rep.total_posts, 2);
        assert_eq!(rep.total_engagements, 1);
    }
}
