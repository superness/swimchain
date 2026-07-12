//! Engagement processing (SPEC_02 §4.2)
//!
//! Processes engagement records (REPLY, QUOTE, ENGAGE) and updates content decay state.
//! - REPLY and QUOTE reset the decay timer
//! - ENGAGE uses pooled PoW system (SPEC_03 §7)

use crate::content::decay::calculate_decay_state;
use crate::types::constants::ENGAGEMENT_FUTURE_TOLERANCE_MS;
use crate::types::content::{ContentItem, EngagementRecord, EngagementType};

/// Result of processing an engagement
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngagementResult {
    /// Engagement accepted, decay timer reset
    Accepted,
    /// Engagement rejected
    Rejected(EngagementRejection),
    /// ENGAGE type - pool is pending completion
    PoolPending {
        /// Pool identifier
        pool_id: [u8; 32],
        /// Current accumulated PoW in seconds
        current: u64,
        /// Required total PoW in seconds
        required: u64,
    },
    /// Pool completed - decay timer reset for all contributors
    PoolCompleted {
        /// Pool identifier
        pool_id: [u8; 32],
        /// List of contributor public keys
        contributors: Vec<[u8; 32]>,
    },
}

/// Reasons an engagement can be rejected
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngagementRejection {
    /// Content has decayed and cannot be engaged with
    ContentDecayed,
    /// PoW validation failed
    InvalidPow,
    /// Duplicate engagement from same user
    Duplicate,
    /// Engagement timestamp is too far in the future
    InvalidTimestamp,
}

/// Process an engagement record against content
///
/// # Arguments
/// * `content` - Mutable reference to content being engaged with
/// * `engagement` - The engagement record
/// * `current_time_ms` - Current time in milliseconds
/// * `half_life_secs` - Current adaptive half-life
///
/// # Returns
/// * `EngagementResult` indicating outcome
pub fn process_engagement(
    content: &mut ContentItem,
    engagement: &EngagementRecord,
    current_time_ms: u64,
    half_life_secs: u64,
) -> EngagementResult {
    // Validate engagement timestamp is not too far in the future
    // This prevents attackers from manipulating decay timers with future timestamps
    if engagement.timestamp > current_time_ms.saturating_add(ENGAGEMENT_FUTURE_TOLERANCE_MS) {
        return EngagementResult::Rejected(EngagementRejection::InvalidTimestamp);
    }

    // Check if content is decayed
    let decay_state = calculate_decay_state(content, current_time_ms, half_life_secs);
    if decay_state.is_decayed {
        return EngagementResult::Rejected(EngagementRejection::ContentDecayed);
    }

    // Clamp engagement timestamp to current time to prevent future timestamp gaming
    let effective_timestamp = engagement.timestamp.min(current_time_ms);

    match engagement.engagement_type {
        EngagementType::Reply | EngagementType::Quote => {
            // REPLY and QUOTE reset decay timer
            // Note: Self-engagement IS allowed per SPEC_02 §4.2 (costs same PoW)
            content.engagement_count = content.engagement_count.saturating_add(1);
            content.last_engagement = effective_timestamp;
            EngagementResult::Accepted
        }
        EngagementType::Engage => {
            // Direct engagement (reactions) - resets decay timer like other engagement types
            // Pools are deprecated - engagements go directly through submit_engagement RPC
            content.engagement_count = content.engagement_count.saturating_add(1);
            content.last_engagement = effective_timestamp;
            EngagementResult::Accepted
        }
    }
}

/// Process a pool completion event
///
/// Called when an engagement pool completes (total PoW reaches 60s).
/// Resets the content's decay timer and credits all contributors.
///
/// # Arguments
/// * `content` - Mutable reference to the content item
/// * `pool_id` - The completed pool's identifier
/// * `completion_time_ms` - Unix timestamp when pool completed (milliseconds)
/// * `contributors` - List of contributor public keys
pub fn on_pool_complete(
    content: &mut ContentItem,
    _pool_id: [u8; 32],
    completion_time_ms: u64,
    contributors: &[[u8; 32]],
) {
    // Reset decay timer to completion time
    content.last_engagement = completion_time_ms;

    // Credit all contributors (increment engagement count)
    // Each contribution counts as an engagement
    content.engagement_count = content
        .engagement_count
        .saturating_add(contributors.len() as u32);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::constants::{ENGAGEMENT_FUTURE_TOLERANCE_MS, HALF_LIFE_SECS};
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

    fn make_test_engagement(
        content_id: ContentId,
        engagement_type: EngagementType,
        timestamp: u64,
    ) -> EngagementRecord {
        EngagementRecord {
            content_id,
            engager_id: IdentityId::from_bytes([2u8; 32]),
            engagement_type,
            timestamp,
            pow_nonce: 0,
            pow_work: 0,
            signature: Signature::from_bytes([0u8; 64]),
            emoji: None,
        }
    }

    #[test]
    fn test_reply_resets_decay() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        let engagement_time = now + 1_000_000;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, engagement_time);

        let result = process_engagement(&mut content, &engagement, engagement_time, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        assert_eq!(content.last_engagement, engagement_time);
        assert_eq!(content.engagement_count, 1);
    }

    #[test]
    fn test_quote_resets_decay() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        let engagement_time = now + 1_000_000;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Quote, engagement_time);

        let result = process_engagement(&mut content, &engagement, engagement_time, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        assert_eq!(content.last_engagement, engagement_time);
    }

    #[test]
    fn test_engage_resets_decay() {
        // Note: Pools are deprecated per SPEC_03 update. Engage type now directly resets decay.
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        let engagement_time = now + 1_000_000;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Engage, engagement_time);

        let result = process_engagement(&mut content, &engagement, engagement_time, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        assert_eq!(content.last_engagement, engagement_time);
        assert_eq!(content.engagement_count, 1);
    }

    #[test]
    fn test_on_pool_complete() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);
        let pool_id = [1u8; 32];
        let completion_time = now + 5_000_000;
        let contributors = vec![[1u8; 32], [2u8; 32], [3u8; 32]];

        on_pool_complete(&mut content, pool_id, completion_time, &contributors);

        assert_eq!(content.last_engagement, completion_time);
        assert_eq!(content.engagement_count, 3);
    }

    #[test]
    fn test_on_pool_complete_saturates() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);
        content.engagement_count = u32::MAX - 1;
        let pool_id = [1u8; 32];
        let contributors = vec![[1u8; 32], [2u8; 32], [3u8; 32]];

        on_pool_complete(&mut content, pool_id, now + 1000, &contributors);

        assert_eq!(content.engagement_count, u32::MAX); // Saturated, not overflowed
    }

    #[test]
    fn test_decayed_content_rejected() {
        // Content from 60 days ago, never engaged
        let created_at = 0_u64;
        let current_time = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

        let mut content = make_test_content(created_at, created_at);
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, current_time);

        let result = process_engagement(&mut content, &engagement, current_time, HALF_LIFE_SECS);

        assert_eq!(
            result,
            EngagementResult::Rejected(EngagementRejection::ContentDecayed)
        );
    }

    #[test]
    fn test_engagement_count_saturates() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);
        content.engagement_count = u32::MAX;

        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, now + 1000);

        let result = process_engagement(&mut content, &engagement, now + 1000, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        assert_eq!(content.engagement_count, u32::MAX); // Saturated, not overflowed
    }

    #[test]
    fn test_future_timestamp_rejected() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        // Engagement timestamp is more than 1 hour in the future
        let future_time = now + ENGAGEMENT_FUTURE_TOLERANCE_MS + 1;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, future_time);

        let result = process_engagement(&mut content, &engagement, now, HALF_LIFE_SECS);

        assert_eq!(
            result,
            EngagementResult::Rejected(EngagementRejection::InvalidTimestamp)
        );
    }

    #[test]
    fn test_future_timestamp_within_tolerance_accepted() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        // Engagement timestamp is within 1 hour tolerance
        let future_time = now + ENGAGEMENT_FUTURE_TOLERANCE_MS - 1000;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, future_time);

        let result = process_engagement(&mut content, &engagement, now, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        // Timestamp is clamped to current time, not future timestamp
        assert_eq!(content.last_engagement, now);
    }

    #[test]
    fn test_future_timestamp_clamped_to_current() {
        let now = 100_000_000_u64;
        let mut content = make_test_content(now, now);

        // Engagement timestamp is 30 minutes in the future (within tolerance)
        let future_time = now + 30 * 60 * 1000;
        let engagement =
            make_test_engagement(content.content_id, EngagementType::Reply, future_time);

        let result = process_engagement(&mut content, &engagement, now, HALF_LIFE_SECS);

        assert_eq!(result, EngagementResult::Accepted);
        // last_engagement should be clamped to current_time, not future_time
        assert_eq!(content.last_engagement, now);
    }
}
