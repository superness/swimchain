//! Anti-Abuse API Integration (Milestone 10.7)
//!
//! This module integrates all anti-abuse components into the API layer:
//! - Content type validation
//! - Spam attestation submission
//! - Blocklist verification
//! - Abuse monitoring and metrics
//!
//! # Integration Points
//!
//! 1. **Content Creation Flow**: Content type validation before PoW
//! 2. **Content Retrieval**: Blocklist check before serving content
//! 3. **Decay System**: Spam flagging affects decay rate
//! 4. **Gossip System**: Attestation propagation to peers
//!
//! # Wire Protocol
//!
//! - `0x80 MSG_SPAM_ATTESTATION`: Submit spam attestation
//! - `0x81 MSG_COUNTER_ATTESTATION`: Submit counter-attestation
//! - `0x82 MSG_QUALITY_ATTESTATION`: Quality attestation (future)
//! - `0x83 MSG_REPUTATION_QUERY`: Query poster reputation
//! - `0x84 MSG_REPUTATION_RESPONSE`: Reputation response

use crate::blocklist::{BlocklistEntry, BlocklistReason, MemoryBlocklistStore};
use crate::reputation::{
    get_reputation_effect, PosterReputation, ReputationEffect, ReputationStore,
    REPUTATION_RESTRICTED_THRESHOLD,
};
use crate::spam_attestation::{
    aggregate_attestations, check_attester_eligibility, find_sponsor_tree_root,
    validate_attestation, SpamAttestation, SpamAttestationStore, SpamReason, StoredSpamAttestation,
    SPAM_ATTESTATION_THRESHOLD,
};
use crate::spam_heuristics::{
    default_posts_per_day, CrossPostingTracker, PatternDetector, RateLimitTracker,
    RepetitionDetector, ReviewFlag, ReviewFlagStore,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

// ============================================================================
// Anti-Abuse Handler
// ============================================================================

/// Central handler for anti-abuse operations
///
/// Uses `MemoryBlocklistStore` for in-memory blocklist storage.
/// For persistent storage, use `BlocklistStore` directly with the gossip layer.
pub struct AntiAbuseHandler {
    /// Spam attestation storage
    spam_store: Arc<RwLock<SpamAttestationStore>>,
    /// Blocklist storage (in-memory)
    blocklist_store: Arc<RwLock<MemoryBlocklistStore>>,
    /// Reputation storage
    reputation_store: Arc<ReputationStore>,
    /// Review flag storage
    review_flag_store: Arc<RwLock<ReviewFlagStore>>,
    /// Repetition detector
    repetition_detector: Arc<RwLock<RepetitionDetector>>,
    /// Cross-posting tracker
    cross_posting_tracker: Arc<RwLock<CrossPostingTracker>>,
    /// Rate limit tracker
    rate_limit_tracker: Arc<RwLock<RateLimitTracker>>,
    /// Pattern detector
    pattern_detector: PatternDetector,
    /// Metrics
    metrics: Arc<RwLock<AntiAbuseMetrics>>,
}

impl AntiAbuseHandler {
    /// Create a new anti-abuse handler with storage backends
    pub fn new(
        spam_store: Arc<RwLock<SpamAttestationStore>>,
        blocklist_store: Arc<RwLock<MemoryBlocklistStore>>,
        reputation_store: Arc<ReputationStore>,
        review_flag_store: Arc<RwLock<ReviewFlagStore>>,
    ) -> Self {
        Self {
            spam_store,
            blocklist_store,
            reputation_store,
            review_flag_store,
            repetition_detector: Arc::new(RwLock::new(RepetitionDetector::new())),
            cross_posting_tracker: Arc::new(RwLock::new(CrossPostingTracker::new())),
            rate_limit_tracker: Arc::new(RwLock::new(RateLimitTracker::new())),
            pattern_detector: PatternDetector::new(),
            metrics: Arc::new(RwLock::new(AntiAbuseMetrics::default())),
        }
    }

    // ========================================================================
    // Content Creation Checks
    // ========================================================================

    /// Check if content can be posted (pre-PoW validation)
    ///
    /// Performs all anti-abuse checks before PoW computation:
    /// 1. Rate limit check
    /// 2. Repetition detection
    /// 3. Cross-posting limits
    /// 4. Pattern detection
    /// 5. Reputation check
    pub fn can_post_content(
        &self,
        author_id: &[u8; 32],
        content: &[u8],
        space_id: &[u8; 16],
        current_time: u64,
    ) -> Result<PostingAllowed, AntiAbuseError> {
        let mut warnings = Vec::new();

        // 1. Rate limit check (now uses fixed limit for all users)
        let daily_limit = default_posts_per_day();
        {
            let tracker = self.rate_limit_tracker.read().unwrap();
            if let Err(_e) = tracker.would_exceed(author_id, space_id, current_time) {
                self.record_metric(MetricType::RateLimitHit);
                return Err(AntiAbuseError::RateLimitExceeded {
                    limit: daily_limit as usize,
                    period: "24 hours".to_string(),
                });
            }
        }

        // 2. Repetition detection
        {
            let detector = self.repetition_detector.read().unwrap();
            if let Err(e) = detector.is_duplicate(content, space_id, author_id, current_time) {
                self.record_metric(MetricType::RepetitionDetected);
                return Err(AntiAbuseError::RepetitiveContent {
                    message: e.to_string(),
                });
            }
        }

        // 3. Cross-posting limits
        {
            let tracker = self.cross_posting_tracker.read().unwrap();
            if let Err(e) = tracker.would_violate(content, space_id, author_id, current_time) {
                self.record_metric(MetricType::CrossPostLimitHit);
                return Err(AntiAbuseError::CrossPostLimitExceeded {
                    message: e.to_string(),
                });
            }
        }

        // 4. Pattern detection
        let pattern_result = self.pattern_detector.check(content);
        if pattern_result.should_flag {
            self.record_metric(MetricType::PatternFlagged);
            // Don't reject, but add warning
            for violation in &pattern_result.violations {
                warnings.push(format!("Pattern detected: {}", violation.description));
            }
        }

        // 5. Reputation check
        let reputation_score = self.reputation_store.get_score(author_id).unwrap_or(100);
        let reputation_effect = get_reputation_effect(reputation_score);

        if reputation_effect == ReputationEffect::Untrusted {
            self.record_metric(MetricType::ReputationBlock);
            return Err(AntiAbuseError::PoorReputation {
                score: reputation_score,
                threshold: REPUTATION_RESTRICTED_THRESHOLD,
            });
        }

        // Check if new space posting is blocked for restricted users
        if reputation_effect.blocks_new_space_posting() {
            // We'd need to check if this is a new space for this user
            // For now, just add a warning
            warnings.push("Reputation restricts new space posting".to_string());
        }

        Ok(PostingAllowed {
            allowed: true,
            warnings,
            reputation_effect,
            adjusted_rate_limit: calculate_adjusted_rate_limit(daily_limit, reputation_score),
        })
    }

    /// Register content after successful creation
    ///
    /// Updates tracking systems with the new content.
    pub fn register_content(
        &self,
        author_id: &[u8; 32],
        content: &[u8],
        space_id: &[u8; 16],
        current_time: u64,
    ) {
        // Update repetition detector
        {
            let mut detector = self.repetition_detector.write().unwrap();
            let _ = detector.check(content, space_id, author_id, current_time);
        }

        // Update cross-posting tracker
        {
            let mut tracker = self.cross_posting_tracker.write().unwrap();
            let _ = tracker.check(content, space_id, author_id, current_time);
        }

        // Update rate limit tracker
        {
            let mut tracker = self.rate_limit_tracker.write().unwrap();
            let _ = tracker.check(author_id, space_id, current_time);
        }

        // Update reputation store post count
        let _ = self.reputation_store.record_post(author_id);

        self.record_metric(MetricType::ContentCreated);
    }

    // ========================================================================
    // Spam Attestation
    // ========================================================================

    /// Submit a spam attestation
    ///
    /// # Requirements
    /// - Valid signature and PoW on attestation
    /// - Content must exist
    /// - Rate limit: 10 attestations per hour
    ///
    /// # Arguments
    /// * `attestation` - The spam attestation to submit
    /// * `content_author` - Public key of the content's author (for self-attestation check)
    /// * `attestations_in_window` - Number of attestations this attester has submitted in the current hour
    /// * `verify_signature` - Callback to verify Ed25519 signatures
    /// * `get_sponsor` - Callback to look up sponsor for an identity (returns None for genesis)
    pub fn submit_spam_attestation<F, G>(
        &self,
        attestation: SpamAttestation,
        content_author: &[u8; 32],
        attestations_in_window: u32,
        verify_signature: F,
        get_sponsor: G,
    ) -> Result<SpamAttestationResult, AntiAbuseError>
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
        G: Fn(&[u8; 32]) -> Option<[u8; 32]>,
    {
        // 1. Check rate limit eligibility
        let eligibility = check_attester_eligibility(attestations_in_window);
        if !eligibility.is_eligible {
            return Err(AntiAbuseError::NotEligibleToAttest {
                reason: eligibility
                    .denial_reason
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "Unknown".to_string()),
            });
        }

        // 2. Validate the attestation (signature, PoW, timestamp, self-attestation check)
        let current_time = crate::crypto::current_timestamp();
        validate_attestation(&attestation, current_time, content_author, verify_signature)
            .map_err(|e| AntiAbuseError::Validation(e.to_string()))?;

        // 3. Find the attester's sponsor tree root for Sybil deduplication
        let sponsor_tree_root = find_sponsor_tree_root(&attestation.attester, get_sponsor)
            .map_err(|e| AntiAbuseError::Validation(e.to_string()))?;

        // 4. Store attestation with tree root
        let stored = StoredSpamAttestation {
            attestation: attestation.clone(),
            sponsor_tree_root,
            is_deduplicated: false,
        };

        let content_hash = attestation.content_hash;

        {
            let store = self.spam_store.write().unwrap();
            store
                .put_attestation(&stored)
                .map_err(|e| AntiAbuseError::Storage(e.to_string()))?;
        }

        // 5. Check if threshold reached
        let (aggregation, is_cleared) = {
            let store = self.spam_store.read().unwrap();
            let attestations = store
                .get_attestations_for_content(&content_hash)
                .map_err(|e| AntiAbuseError::Storage(e.to_string()))?;
            let counter_state = store
                .get_counter_state(&content_hash)
                .map_err(|e| AntiAbuseError::Storage(e.to_string()))?;
            let agg = aggregate_attestations(content_hash, &attestations, counter_state.is_cleared);
            (agg, counter_state.is_cleared)
        };

        let threshold_reached =
            aggregation.count.unique_tree_count >= SPAM_ATTESTATION_THRESHOLD && !is_cleared;

        self.record_metric(MetricType::SpamAttestationSubmitted);
        if threshold_reached {
            self.record_metric(MetricType::SpamThresholdReached);

            // Apply reputation penalty to content author
            let _ = self
                .reputation_store
                .record_spam_flag(content_author, crate::crypto::current_timestamp());
        }

        Ok(SpamAttestationResult {
            accepted: true,
            threshold_reached,
            current_count: aggregation.count.unique_tree_count as usize,
            required_count: SPAM_ATTESTATION_THRESHOLD as usize,
        })
    }

    /// Check if content is spam-flagged
    pub fn is_spam_flagged(&self, content_hash: &[u8; 32]) -> bool {
        let store = self.spam_store.read().unwrap();
        let attestations = match store.get_attestations_for_content(content_hash) {
            Ok(a) => a,
            Err(_) => return false,
        };
        let counter_state = store.get_counter_state(content_hash).unwrap_or_else(|_| {
            crate::spam_attestation::CounterAttestationState::empty(*content_hash)
        });
        let agg = aggregate_attestations(*content_hash, &attestations, counter_state.is_cleared);
        agg.count.unique_tree_count >= SPAM_ATTESTATION_THRESHOLD && !agg.is_cleared
    }

    /// Get spam status for content
    pub fn get_spam_status(&self, content_hash: &[u8; 32]) -> SpamStatus {
        let store = self.spam_store.read().unwrap();
        let attestations = match store.get_attestations_for_content(content_hash) {
            Ok(a) => a,
            Err(_) => return SpamStatus::default(),
        };
        let counter_state = store.get_counter_state(content_hash).unwrap_or_else(|_| {
            crate::spam_attestation::CounterAttestationState::empty(*content_hash)
        });
        let agg = aggregate_attestations(*content_hash, &attestations, counter_state.is_cleared);

        SpamStatus {
            is_flagged: agg.count.unique_tree_count >= SPAM_ATTESTATION_THRESHOLD,
            attestation_count: agg.count.unique_tree_count as usize,
            counter_count: counter_state.count() as usize,
            is_cleared: agg.is_cleared,
            reasons: agg.count.reason_counts.keys().copied().collect(),
        }
    }

    // ========================================================================
    // Blocklist Checks
    // ========================================================================

    /// Check if content hash is blocklisted
    ///
    /// Called during content retrieval to prevent serving illegal content.
    pub fn is_blocklisted(&self, content_hash: &[u8; 32]) -> bool {
        let store = self.blocklist_store.read().unwrap();
        store.is_blocked(content_hash)
    }

    /// Get blocklist reason if content is blocked
    pub fn get_blocklist_reason(&self, content_hash: &[u8; 32]) -> Option<BlocklistReason> {
        let store = self.blocklist_store.read().unwrap();
        store.get(content_hash).map(|e| e.reason)
    }

    /// Check content before retrieval
    ///
    /// Returns error if content is blocklisted.
    pub fn check_retrieval_allowed(&self, content_hash: &[u8; 32]) -> Result<(), AntiAbuseError> {
        if self.is_blocklisted(content_hash) {
            self.record_metric(MetricType::BlocklistHit);
            return Err(AntiAbuseError::ContentBlocklisted {
                reason: self
                    .get_blocklist_reason(content_hash)
                    .unwrap_or(BlocklistReason::ExternalList),
            });
        }
        Ok(())
    }

    // ========================================================================
    // Reputation
    // ========================================================================

    /// Get poster reputation
    pub fn get_reputation(&self, identity_id: &[u8; 32]) -> Option<PosterReputation> {
        self.reputation_store.get(identity_id).ok().flatten()
    }

    /// Get reputation score
    pub fn get_reputation_score(&self, identity_id: &[u8; 32]) -> i32 {
        self.reputation_store.get_score(identity_id).unwrap_or(100)
    }

    /// Get reputation effect for an identity
    pub fn get_reputation_effect(&self, identity_id: &[u8; 32]) -> ReputationEffect {
        let score = self.get_reputation_score(identity_id);
        get_reputation_effect(score)
    }

    // ========================================================================
    // Review Flags
    // ========================================================================

    /// Create a review flag for content from heuristic result
    pub fn create_review_flag_from_result(
        &self,
        content_id: [u8; 32],
        space_id: [u8; 16],
        author: [u8; 32],
        result: &crate::spam_heuristics::HeuristicResult,
        timestamp: u64,
    ) {
        if let Some(flag) =
            ReviewFlag::from_heuristic_result(content_id, space_id, author, result, timestamp)
        {
            let mut store = self.review_flag_store.write().unwrap();
            store.add_flag(flag);
        }
    }

    /// Get pending review flags
    pub fn get_pending_flags(&self) -> Vec<ReviewFlag> {
        let store = self.review_flag_store.read().unwrap();
        store.get_pending_flags().into_iter().cloned().collect()
    }

    /// Get pending flag count
    pub fn pending_flag_count(&self) -> usize {
        let store = self.review_flag_store.read().unwrap();
        store.pending_count()
    }

    // ========================================================================
    // Metrics
    // ========================================================================

    fn record_metric(&self, metric_type: MetricType) {
        let mut metrics = self.metrics.write().unwrap();
        metrics.record(metric_type);
    }

    /// Get current metrics snapshot
    pub fn get_metrics(&self) -> AntiAbuseMetrics {
        self.metrics.read().unwrap().clone()
    }

    /// Reset metrics (for testing)
    pub fn reset_metrics(&self) {
        let mut metrics = self.metrics.write().unwrap();
        *metrics = AntiAbuseMetrics::default();
    }
}

/// Calculate adjusted rate limit based on reputation
fn calculate_adjusted_rate_limit(base_limit: u32, reputation_score: i32) -> u32 {
    let effect = get_reputation_effect(reputation_score);
    let multiplier = effect.rate_limit_multiplier();
    ((base_limit as f64) * multiplier).round() as u32
}

// ============================================================================
// Types
// ============================================================================

/// Result of posting permission check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostingAllowed {
    /// Whether posting is allowed
    pub allowed: bool,
    /// Any warnings (e.g., pattern detected but not blocked)
    pub warnings: Vec<String>,
    /// Reputation effect for this poster
    pub reputation_effect: ReputationEffect,
    /// Adjusted rate limit based on reputation
    pub adjusted_rate_limit: u32,
}

/// Result of a spam attestation submission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpamAttestationResult {
    /// Whether the attestation was accepted
    pub accepted: bool,
    /// Whether the spam threshold was reached
    pub threshold_reached: bool,
    /// Current unique tree count
    pub current_count: usize,
    /// Required count for threshold
    pub required_count: usize,
}

/// Spam status for content
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpamStatus {
    /// Whether content is flagged as spam
    pub is_flagged: bool,
    /// Number of unique attestations
    pub attestation_count: usize,
    /// Number of counter-attestations
    pub counter_count: usize,
    /// Whether spam flag was cleared by counters
    pub is_cleared: bool,
    /// Reasons cited in attestations
    pub reasons: Vec<SpamReason>,
}

/// Metrics type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetricType {
    ContentCreated,
    SpamAttestationSubmitted,
    CounterAttestationSubmitted,
    SpamThresholdReached,
    SpamFlagCleared,
    RateLimitHit,
    RepetitionDetected,
    CrossPostLimitHit,
    PatternFlagged,
    ReputationBlock,
    ReputationPenalty,
    BlocklistHit,
}

/// Anti-abuse metrics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AntiAbuseMetrics {
    /// Content created count
    pub content_created: u64,
    /// Spam attestations submitted
    pub spam_attestations: u64,
    /// Counter-attestations submitted
    pub counter_attestations: u64,
    /// Times spam threshold was reached
    pub spam_threshold_reached: u64,
    /// Times spam flag was cleared
    pub spam_flags_cleared: u64,
    /// Rate limit hits
    pub rate_limit_hits: u64,
    /// Repetition detections
    pub repetitions_detected: u64,
    /// Cross-post limit hits
    pub cross_post_limit_hits: u64,
    /// Pattern flags
    pub pattern_flags: u64,
    /// Reputation blocks
    pub reputation_blocks: u64,
    /// Reputation penalties
    pub reputation_penalties: u64,
    /// Blocklist hits
    pub blocklist_hits: u64,
    /// Last reset timestamp
    pub last_reset: u64,
}

impl AntiAbuseMetrics {
    fn record(&mut self, metric_type: MetricType) {
        match metric_type {
            MetricType::ContentCreated => self.content_created += 1,
            MetricType::SpamAttestationSubmitted => self.spam_attestations += 1,
            MetricType::CounterAttestationSubmitted => self.counter_attestations += 1,
            MetricType::SpamThresholdReached => self.spam_threshold_reached += 1,
            MetricType::SpamFlagCleared => self.spam_flags_cleared += 1,
            MetricType::RateLimitHit => self.rate_limit_hits += 1,
            MetricType::RepetitionDetected => self.repetitions_detected += 1,
            MetricType::CrossPostLimitHit => self.cross_post_limit_hits += 1,
            MetricType::PatternFlagged => self.pattern_flags += 1,
            MetricType::ReputationBlock => self.reputation_blocks += 1,
            MetricType::ReputationPenalty => self.reputation_penalties += 1,
            MetricType::BlocklistHit => self.blocklist_hits += 1,
        }
    }

    /// Get total violations
    pub fn total_violations(&self) -> u64 {
        self.rate_limit_hits
            + self.repetitions_detected
            + self.cross_post_limit_hits
            + self.pattern_flags
            + self.reputation_blocks
            + self.blocklist_hits
    }
}

// ============================================================================
// Errors
// ============================================================================

/// Anti-abuse errors
#[derive(Debug, Clone, thiserror::Error)]
pub enum AntiAbuseError {
    #[error("Rate limit exceeded: {limit} posts per {period}")]
    RateLimitExceeded { limit: usize, period: String },

    #[error("Repetitive content: {message}")]
    RepetitiveContent { message: String },

    #[error("Cross-posting limit exceeded: {message}")]
    CrossPostLimitExceeded { message: String },

    #[error("Not eligible to attest: {reason}")]
    NotEligibleToAttest { reason: String },

    #[error("Poor reputation: score {score} below threshold {threshold}")]
    PoorReputation { score: i32, threshold: i32 },

    #[error("Content blocklisted: {reason:?}")]
    ContentBlocklisted { reason: BlocklistReason },

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

// ============================================================================
// Events for Subscription
// ============================================================================

/// Anti-abuse events for subscription
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AntiAbuseEvent {
    /// Spam attestation submitted
    SpamAttestationSubmitted {
        content_hash: [u8; 32],
        attester: [u8; 32],
        reason: SpamReason,
    },
    /// Spam threshold reached
    SpamThresholdReached {
        content_hash: [u8; 32],
        attestation_count: usize,
    },
    /// Counter-attestation submitted
    CounterAttestationSubmitted {
        content_hash: [u8; 32],
        counter_attester: [u8; 32],
    },
    /// Spam flag cleared
    SpamFlagCleared {
        content_hash: [u8; 32],
        counter_count: usize,
    },
    /// Content blocklisted
    ContentBlocklisted {
        content_hash: [u8; 32],
        reason: BlocklistReason,
    },
    /// Reputation penalty applied
    ReputationPenalty {
        identity: [u8; 32],
        old_score: i32,
        new_score: i32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_handler() -> AntiAbuseHandler {
        let db = sled::Config::new().temporary(true).open().unwrap();
        let spam_store = Arc::new(RwLock::new(SpamAttestationStore::open(db.clone())));
        let blocklist_store = Arc::new(RwLock::new(MemoryBlocklistStore::new()));
        let reputation_store = Arc::new(ReputationStore::open(db.clone()));
        let review_flag_store = Arc::new(RwLock::new(ReviewFlagStore::new()));

        AntiAbuseHandler::new(
            spam_store,
            blocklist_store,
            reputation_store,
            review_flag_store,
        )
    }

    fn make_blocklist_entry(content_hash: [u8; 32], reason: BlocklistReason) -> BlocklistEntry {
        BlocklistEntry::new(
            content_hash,
            reason,
            vec![],    // No attestations for test
            [0u8; 32], // Reporter
            crate::crypto::current_timestamp(),
        )
    }

    #[test]
    fn test_can_post_content_allowed() {
        let handler = create_test_handler();
        let author = [1u8; 32];
        let space = [2u8; 16];
        let content = b"Hello world!";

        let result = handler.can_post_content(&author, content, &space, 1000);

        assert!(result.is_ok());
        let allowed = result.unwrap();
        assert!(allowed.allowed);
    }

    #[test]
    fn test_blocklist_check() {
        let handler = create_test_handler();
        let content_hash = [3u8; 32];

        // Not blocklisted
        assert!(!handler.is_blocklisted(&content_hash));
        assert!(handler.check_retrieval_allowed(&content_hash).is_ok());

        // Add to blocklist
        {
            let mut store = handler.blocklist_store.write().unwrap();
            let entry = make_blocklist_entry(content_hash, BlocklistReason::CSAM);
            let _ = store.add(entry);
        }

        // Now blocklisted
        assert!(handler.is_blocklisted(&content_hash));
        assert!(handler.check_retrieval_allowed(&content_hash).is_err());
    }

    #[test]
    fn test_metrics_tracking() {
        let handler = create_test_handler();

        handler.record_metric(MetricType::ContentCreated);
        handler.record_metric(MetricType::ContentCreated);
        handler.record_metric(MetricType::RateLimitHit);

        let metrics = handler.get_metrics();
        assert_eq!(metrics.content_created, 2);
        assert_eq!(metrics.rate_limit_hits, 1);
    }

    #[test]
    fn test_reputation_check() {
        let handler = create_test_handler();
        let identity = [4u8; 32];

        // Default score should be 100
        assert_eq!(handler.get_reputation_score(&identity), 100);
        assert_eq!(
            handler.get_reputation_effect(&identity),
            ReputationEffect::Normal
        );
    }

    #[test]
    fn test_total_violations() {
        let mut metrics = AntiAbuseMetrics::default();
        metrics.rate_limit_hits = 5;
        metrics.repetitions_detected = 3;
        metrics.blocklist_hits = 2;

        assert_eq!(metrics.total_violations(), 10);
    }
}
