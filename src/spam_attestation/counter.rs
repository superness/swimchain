//! Counter-attestation for clearing spam flags per SPEC_12 Section 3.4
//!
//! Counter-attestations allow Lifeguard+ members to dispute spam flags
//! and restore normal decay behavior to content.

use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;

use super::types::COUNTER_ATTESTATION_THRESHOLD;

/// Counter-attestation to dispute a spam flag.
///
/// Per SPEC_12 §3.4, 5 Lifeguard+ members can clear a spam flag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CounterAttestation {
    /// Hash of the content being defended
    pub content_hash: [u8; 32],

    /// Public key of the counter-attester (must be Lifeguard+)
    pub counter_attester: [u8; 32],

    /// Unix timestamp when counter-attestation was created
    pub timestamp: u64,

    /// Ed25519 signature over the counter-attestation data
    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
}

impl CounterAttestation {
    /// Size of a serialized CounterAttestation in bytes.
    /// content_hash(32) + counter_attester(32) + timestamp(8) + signature(64) = 136
    pub const SERIALIZED_SIZE: usize = 136;

    /// Create the message bytes for signing.
    ///
    /// Format: "COUNTER_ATTESTATION" || content_hash || timestamp
    pub fn signing_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(59);
        msg.extend_from_slice(b"COUNTER_ATTESTATION");
        msg.extend_from_slice(&self.content_hash);
        msg.extend_from_slice(&self.timestamp.to_le_bytes());
        msg
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::SERIALIZED_SIZE);
        bytes.extend_from_slice(&self.content_hash);
        bytes.extend_from_slice(&self.counter_attester);
        bytes.extend_from_slice(&self.timestamp.to_le_bytes());
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SERIALIZED_SIZE {
            return None;
        }

        let mut content_hash = [0u8; 32];
        content_hash.copy_from_slice(&bytes[0..32]);

        let mut counter_attester = [0u8; 32];
        counter_attester.copy_from_slice(&bytes[32..64]);

        let timestamp = u64::from_le_bytes(bytes[64..72].try_into().ok()?);

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[72..136]);

        Some(Self {
            content_hash,
            counter_attester,
            timestamp,
            signature,
        })
    }
}

/// Stored state of counter-attestations for a piece of content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CounterAttestationState {
    /// Content hash
    pub content_hash: [u8; 32],

    /// Counter-attesters (deduplicated)
    pub counter_attesters: Vec<[u8; 32]>,

    /// Whether the threshold has been reached (content cleared)
    pub is_cleared: bool,

    /// Timestamp when content was cleared (if applicable)
    pub cleared_at: Option<u64>,
}

impl CounterAttestationState {
    /// Create empty state for content.
    pub fn empty(content_hash: [u8; 32]) -> Self {
        Self {
            content_hash,
            counter_attesters: Vec::new(),
            is_cleared: false,
            cleared_at: None,
        }
    }

    /// Add a counter-attestation.
    ///
    /// Returns true if the threshold was just reached.
    pub fn add_counter_attester(&mut self, attester: [u8; 32], timestamp: u64) -> bool {
        // Don't add duplicates
        if self.counter_attesters.contains(&attester) {
            return false;
        }

        self.counter_attesters.push(attester);

        // Check if threshold just reached
        if !self.is_cleared
            && self.counter_attesters.len() >= COUNTER_ATTESTATION_THRESHOLD as usize
        {
            self.is_cleared = true;
            self.cleared_at = Some(timestamp);
            return true;
        }

        false
    }

    /// Get the number of counter-attestations.
    pub fn count(&self) -> u8 {
        self.counter_attesters.len() as u8
    }

    /// Check how many more counter-attestations are needed to clear.
    pub fn remaining_to_clear(&self) -> u8 {
        if self.is_cleared {
            0
        } else {
            COUNTER_ATTESTATION_THRESHOLD.saturating_sub(self.counter_attesters.len() as u8)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_counter_attestation_serialization() {
        let attestation = CounterAttestation {
            content_hash: [1u8; 32],
            counter_attester: [2u8; 32],
            timestamp: 1735689600,
            signature: [3u8; 64],
        };

        let bytes = attestation.to_bytes();
        assert_eq!(bytes.len(), CounterAttestation::SERIALIZED_SIZE);

        let restored = CounterAttestation::from_bytes(&bytes).unwrap();
        assert_eq!(attestation.content_hash, restored.content_hash);
        assert_eq!(attestation.counter_attester, restored.counter_attester);
        assert_eq!(attestation.timestamp, restored.timestamp);
        assert_eq!(attestation.signature, restored.signature);
    }

    #[test]
    fn test_counter_attestation_state_empty() {
        let state = CounterAttestationState::empty([0u8; 32]);
        assert_eq!(state.count(), 0);
        assert!(!state.is_cleared);
        assert_eq!(state.remaining_to_clear(), 5);
    }

    #[test]
    fn test_counter_attestation_state_add() {
        let mut state = CounterAttestationState::empty([0u8; 32]);

        // Add first 4 attesters - not yet cleared
        for i in 0..4 {
            let attester = [i as u8; 32];
            let reached = state.add_counter_attester(attester, 1735689600);
            assert!(!reached);
            assert!(!state.is_cleared);
        }
        assert_eq!(state.count(), 4);
        assert_eq!(state.remaining_to_clear(), 1);

        // Add 5th attester - threshold reached
        let reached = state.add_counter_attester([5u8; 32], 1735689601);
        assert!(reached);
        assert!(state.is_cleared);
        assert_eq!(state.cleared_at, Some(1735689601));
        assert_eq!(state.remaining_to_clear(), 0);
    }

    #[test]
    fn test_counter_attestation_state_no_duplicates() {
        let mut state = CounterAttestationState::empty([0u8; 32]);

        let attester = [1u8; 32];
        state.add_counter_attester(attester, 1735689600);
        state.add_counter_attester(attester, 1735689601);
        state.add_counter_attester(attester, 1735689602);

        assert_eq!(state.count(), 1);
    }

    #[test]
    fn test_counter_attestation_signing_message() {
        let attestation = CounterAttestation {
            content_hash: [1u8; 32],
            counter_attester: [2u8; 32],
            timestamp: 1735689600,
            signature: [0u8; 64],
        };

        let msg = attestation.signing_message();
        assert!(msg.starts_with(b"COUNTER_ATTESTATION"));
        assert_eq!(msg.len(), 19 + 32 + 8); // prefix + hash + timestamp
    }
}
