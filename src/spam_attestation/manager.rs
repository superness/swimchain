//! Counter-attestation manager per SPEC_12 Section 5
//!
//! Manages the counter-attestation workflow including:
//! - Validation of counter-attestations
//! - Threshold tracking (5 Lifeguard+ to cancel spam flags)
//! - Fast recovery mechanism (+10 heat per counter-attestation)
//! - Rate limiting

use super::counter::{CounterAttestation, CounterAttestationState};
use super::error::SpamAttestationError;
use super::storage::SpamAttestationStore;
use super::types::{COUNTER_ATTESTATION_THRESHOLD, SPAM_ATTESTATION_MAX_AGE_SECS};
use super::validation::check_counter_attester_eligibility;

// === SPEC_12 Section 4.5: Fast Recovery Constants ===

/// Heat bonus per counter-attestation (SPEC_12 §4.5)
pub const COUNTER_ATTESTATION_HEAT_BONUS: u64 = 10;

/// Maximum heat bonus from counter-attestations
pub const MAX_COUNTER_ATTESTATION_HEAT_BONUS: u64 = 50;

/// PoW difficulty for counter-attestations (same as spam attestations)
pub const COUNTER_ATTESTATION_POW_DIFFICULTY: u8 = 12;

/// Result of processing a counter-attestation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CounterAttestationResult {
    /// Whether the counter-attestation was accepted
    pub accepted: bool,

    /// New total count of counter-attestations
    pub total_counter_attestations: u8,

    /// Whether this counter-attestation caused the spam flag to be cleared
    pub flag_cleared: bool,

    /// Heat bonus to apply to content (SPEC_12 §4.5)
    pub heat_bonus: u64,

    /// Timestamp when flag was cleared (if flag_cleared is true)
    pub cleared_at: Option<u64>,

    /// Reason for rejection, if any
    pub rejection_reason: Option<SpamAttestationError>,
}

impl CounterAttestationResult {
    /// Create a successful result.
    pub fn accepted(
        total: u8,
        flag_cleared: bool,
        heat_bonus: u64,
        cleared_at: Option<u64>,
    ) -> Self {
        Self {
            accepted: true,
            total_counter_attestations: total,
            flag_cleared,
            heat_bonus,
            cleared_at,
            rejection_reason: None,
        }
    }

    /// Create a rejected result.
    pub fn rejected(reason: SpamAttestationError) -> Self {
        Self {
            accepted: false,
            total_counter_attestations: 0,
            flag_cleared: false,
            heat_bonus: 0,
            cleared_at: None,
            rejection_reason: Some(reason),
        }
    }
}

/// Manager for counter-attestation processing.
pub struct CounterAttestationManager<'a> {
    /// Storage for attestations
    store: &'a SpamAttestationStore,
}

impl<'a> CounterAttestationManager<'a> {
    /// Create a new counter-attestation manager.
    pub fn new(store: &'a SpamAttestationStore) -> Self {
        Self { store }
    }

    /// Validate a counter-attestation without processing it.
    ///
    /// # Arguments
    /// * `counter` - The counter-attestation to validate
    /// * `current_time` - Current Unix timestamp
    /// * `verify_signature` - Callback to verify Ed25519 signature
    pub fn validate<F>(
        &self,
        counter: &CounterAttestation,
        attestations_in_window: u32,
        current_time: u64,
        verify_signature: F,
    ) -> Result<(), SpamAttestationError>
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // 1. Check rate limit eligibility
        let eligibility = check_counter_attester_eligibility(attestations_in_window);
        if !eligibility.is_eligible {
            return Err(eligibility.denial_reason.unwrap());
        }

        // 2. Check timestamp - not too old
        if current_time > counter.timestamp {
            let age = current_time - counter.timestamp;
            if age > SPAM_ATTESTATION_MAX_AGE_SECS {
                return Err(SpamAttestationError::TimestampTooOld {
                    age_secs: age,
                    max_age_secs: SPAM_ATTESTATION_MAX_AGE_SECS,
                });
            }
        } else {
            // Future timestamp - allow small clock skew (5 minutes)
            let future = counter.timestamp - current_time;
            if future > 300 {
                return Err(SpamAttestationError::TimestampInFuture { future_secs: future });
            }
        }

        // 3. Verify signature
        let signing_message = counter.signing_message();
        if !verify_signature(&counter.counter_attester, &signing_message, &counter.signature) {
            return Err(SpamAttestationError::InvalidSignature);
        }

        // 4. Check if content actually has spam attestations
        let attestations = self.store.get_attestations_for_content(&counter.content_hash)?;
        if attestations.is_empty() {
            return Err(SpamAttestationError::ContentNotFound);
        }

        // 5. Check for duplicate counter-attestation
        let state = self.store.get_counter_state(&counter.content_hash)?;
        if state.counter_attesters.contains(&counter.counter_attester) {
            return Err(SpamAttestationError::DuplicateAttestation);
        }

        Ok(())
    }

    /// Process a counter-attestation.
    ///
    /// This validates the counter-attestation, updates storage, and calculates
    /// the heat bonus for fast recovery.
    ///
    /// # Arguments
    /// * `counter` - The counter-attestation to process
    /// * `current_time` - Current Unix timestamp
    /// * `verify_signature` - Callback to verify Ed25519 signature
    pub fn process<F>(
        &self,
        counter: &CounterAttestation,
        attestations_in_window: u32,
        current_time: u64,
        verify_signature: F,
    ) -> CounterAttestationResult
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Validate first
        if let Err(e) = self.validate(
            counter,
            attestations_in_window,
            current_time,
            verify_signature,
        ) {
            return CounterAttestationResult::rejected(e);
        }

        // Get current state
        let mut state = match self.store.get_counter_state(&counter.content_hash) {
            Ok(s) => s,
            Err(e) => return CounterAttestationResult::rejected(e),
        };

        // Add counter-attestation
        let threshold_just_reached =
            state.add_counter_attester(counter.counter_attester, counter.timestamp);

        // Save updated state
        if let Err(e) = self.store.put_counter_state(&state) {
            return CounterAttestationResult::rejected(e);
        }

        // Increment rate limit counter
        self.store
            .increment_attestation_count(&counter.counter_attester, current_time);

        // Calculate heat bonus
        let heat_bonus = calculate_heat_bonus(state.count());

        CounterAttestationResult::accepted(
            state.count(),
            threshold_just_reached,
            heat_bonus,
            state.cleared_at,
        )
    }

    /// Check if content has been cleared of spam flags.
    pub fn is_content_cleared(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<bool, SpamAttestationError> {
        let state = self.store.get_counter_state(content_hash)?;
        Ok(state.is_cleared)
    }

    /// Get the current counter-attestation state for content.
    pub fn get_state(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<CounterAttestationState, SpamAttestationError> {
        self.store.get_counter_state(content_hash)
    }

    /// Calculate the heat bonus for content based on counter-attestations.
    ///
    /// Returns 0 if content is not flagged or has no counter-attestations.
    pub fn get_heat_bonus(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<u64, SpamAttestationError> {
        let state = self.store.get_counter_state(content_hash)?;
        Ok(calculate_heat_bonus(state.count()))
    }
}

/// Calculate heat bonus based on counter-attestation count.
///
/// Per SPEC_12 §4.5:
/// - Each counter-attestation adds +10 heat
/// - Maximum bonus is +50 (5 counter-attestations)
pub fn calculate_heat_bonus(counter_attestation_count: u8) -> u64 {
    let bonus = counter_attestation_count as u64 * COUNTER_ATTESTATION_HEAT_BONUS;
    std::cmp::min(bonus, MAX_COUNTER_ATTESTATION_HEAT_BONUS)
}

/// Check if an identity is eligible to counter-attest.
///
/// Requirements:
/// - Must not have exceeded rate limit
pub fn can_counter_attest(attestations_in_window: u32) -> bool {
    check_counter_attester_eligibility(attestations_in_window).is_eligible
}

/// Get the threshold of counter-attestations needed to clear a spam flag.
pub fn counter_threshold() -> u8 {
    COUNTER_ATTESTATION_THRESHOLD
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_store() -> SpamAttestationStore {
        let db = sled::Config::new().temporary(true).open().unwrap();
        SpamAttestationStore::open(db)
    }

    fn create_test_counter(content_hash: [u8; 32], attester: [u8; 32]) -> CounterAttestation {
        CounterAttestation {
            content_hash,
            counter_attester: attester,
            timestamp: 1735689600,
            signature: [0u8; 64],
        }
    }

    fn add_spam_attestation(store: &SpamAttestationStore, content_hash: [u8; 32]) {
        use super::super::types::{SpamAttestation, SpamReason, StoredSpamAttestation};

        let attestation = StoredSpamAttestation {
            attestation: SpamAttestation {
                content_hash,
                attester: [99u8; 32],
                reason: SpamReason::Advertising,
                timestamp: 1735689600,
                pow_nonce: 0,
                signature: [0u8; 64],
            },
            sponsor_tree_root: [100u8; 32],
            is_deduplicated: false,
        };
        store.put_attestation(&attestation).unwrap();
    }

    #[test]
    fn test_calculate_heat_bonus() {
        assert_eq!(calculate_heat_bonus(0), 0);
        assert_eq!(calculate_heat_bonus(1), 10);
        assert_eq!(calculate_heat_bonus(2), 20);
        assert_eq!(calculate_heat_bonus(3), 30);
        assert_eq!(calculate_heat_bonus(4), 40);
        assert_eq!(calculate_heat_bonus(5), 50);
        // Capped at 50
        assert_eq!(calculate_heat_bonus(6), 50);
        assert_eq!(calculate_heat_bonus(10), 50);
    }

    #[test]
    fn test_can_counter_attest() {
        // Under rate limit - can counter-attest
        assert!(can_counter_attest(0));
        assert!(can_counter_attest(5));
        assert!(can_counter_attest(9));

        // At/over rate limit - cannot counter-attest
        assert!(!can_counter_attest(10));
        assert!(!can_counter_attest(15));
    }

    #[test]
    fn test_counter_threshold() {
        assert_eq!(counter_threshold(), 5);
    }

    #[test]
    fn test_validate_success() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        let counter = create_test_counter(content_hash, [2u8; 32]);

        // Should pass with no rate limiting
        let result = manager.validate(&counter, 0, 1735689600, |_, _, _| {
            true
        });
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_rate_limit() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        let counter = create_test_counter(content_hash, [2u8; 32]);

        // At rate limit - should fail
        let result =
            manager.validate(&counter, 10, 1735689600, |_, _, _| true);
        assert!(matches!(
            result,
            Err(SpamAttestationError::RateLimitExceeded { .. })
        ));
    }

    #[test]
    fn test_validate_content_not_found() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        // No spam attestation added
        let content_hash = [1u8; 32];
        let counter = create_test_counter(content_hash, [2u8; 32]);

        let result = manager.validate(&counter, 0, 1735689600, |_, _, _| {
            true
        });
        assert!(matches!(result, Err(SpamAttestationError::ContentNotFound)));
    }

    #[test]
    fn test_validate_duplicate() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        let attester = [2u8; 32];
        add_spam_attestation(&store, content_hash);

        // Add first counter-attestation
        let counter = create_test_counter(content_hash, attester);
        let result =
            manager.process(&counter, 0, 1735689600, |_, _, _| true);
        assert!(result.accepted);

        // Try to add duplicate
        let result =
            manager.validate(&counter, 1, 1735689600, |_, _, _| true);
        assert!(matches!(
            result,
            Err(SpamAttestationError::DuplicateAttestation)
        ));
    }

    #[test]
    fn test_validate_invalid_signature() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        let counter = create_test_counter(content_hash, [2u8; 32]);

        // Signature verification fails
        let result = manager.validate(
            &counter,
            0,
            1735689600,
            |_, _, _| false,
        );
        assert!(matches!(
            result,
            Err(SpamAttestationError::InvalidSignature)
        ));
    }

    #[test]
    fn test_validate_timestamp_old() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        let counter = create_test_counter(content_hash, [2u8; 32]);

        // 2 days later
        let current_time = 1735689600 + 2 * 86400;
        let result = manager.validate(&counter, 0, current_time, |_, _, _| {
            true
        });
        assert!(matches!(
            result,
            Err(SpamAttestationError::TimestampTooOld { .. })
        ));
    }

    #[test]
    fn test_process_counter_attestation() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        // First counter-attestation
        let counter = create_test_counter(content_hash, [2u8; 32]);
        let result =
            manager.process(&counter, 0, 1735689600, |_, _, _| true);

        assert!(result.accepted);
        assert_eq!(result.total_counter_attestations, 1);
        assert!(!result.flag_cleared);
        assert_eq!(result.heat_bonus, 10);
    }

    #[test]
    fn test_process_threshold_reached() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        // Add 5 counter-attestations
        for i in 0u8..5 {
            let counter = create_test_counter(content_hash, [10 + i; 32]);
            let result = manager.process(
                &counter,
                i as u32,
                1735689600 + i as u64,
                |_, _, _| true,
            );

            assert!(result.accepted);
            assert_eq!(result.total_counter_attestations, i + 1);

            if i < 4 {
                assert!(!result.flag_cleared);
            } else {
                assert!(result.flag_cleared);
                assert!(result.cleared_at.is_some());
            }
        }

        // Verify content is cleared
        assert!(manager.is_content_cleared(&content_hash).unwrap());
    }

    #[test]
    fn test_get_heat_bonus() {
        let store = create_test_store();
        let manager = CounterAttestationManager::new(&store);

        let content_hash = [1u8; 32];
        add_spam_attestation(&store, content_hash);

        // No counter-attestations yet
        assert_eq!(manager.get_heat_bonus(&content_hash).unwrap(), 0);

        // Add 3 counter-attestations
        for i in 0u8..3 {
            let counter = create_test_counter(content_hash, [10 + i; 32]);
            manager.process(
                &counter,
                i as u32,
                1735689600,
                |_, _, _| true,
            );
        }

        // Should have +30 heat bonus
        assert_eq!(manager.get_heat_bonus(&content_hash).unwrap(), 30);
    }
}
