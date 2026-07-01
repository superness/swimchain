//! Spam attestation type definitions
//!
//! Defines SpamAttestation, SpamReason, and threshold constants per SPEC_12 Section 3.

use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;
use std::fmt;

// === SPEC_12 Section 3.2: Spam Attestation Constants ===

/// Number of independent sponsor trees required to flag content as spam (SPEC_12 §4.2)
pub const SPAM_ATTESTATION_THRESHOLD: u8 = 3;

/// Number of Lifeguard+ counter-attestations required to cancel spam flags (SPEC_12 §3.4)
pub const COUNTER_ATTESTATION_THRESHOLD: u8 = 5;

/// Decay half-life for flagged content in seconds (4 hours) (SPEC_12 §4.3)
pub const FLAGGED_DECAY_HALF_LIFE_SECS: u64 = 14_400;

/// PoW difficulty for spam attestation (SPEC_12 §3.2)
pub const SPAM_ATTESTATION_POW_DIFFICULTY: u8 = 12;

/// Rate limit: max attestations per identity per hour (SPEC_12 §4.1)
pub const SPAM_ATTESTATION_RATE_LIMIT_HOURLY: u32 = 10;

/// Rate limit window in seconds (1 hour)
pub const SPAM_ATTESTATION_RATE_LIMIT_WINDOW_SECS: u64 = 3600;

/// Maximum age of attestation timestamp (24 hours) (SPEC_12 §4.1)
pub const SPAM_ATTESTATION_MAX_AGE_SECS: u64 = 86_400;

/// Reason for spam attestation per SPEC_12 Section 3.2.
///
/// These categories are intentionally objective and behaviorally specific
/// to reduce subjective abuse of the flagging system.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SpamReason {
    /// Commercial promotion unrelated to discussion context
    Advertising = 0x01,

    /// Duplicate or near-duplicate content posted multiple times
    Repetitive = 0x02,

    /// Content irrelevant to the space or discussion topic
    OffTopic = 0x03,

    /// Targeted harassment or abuse of another user
    Harassment = 0x04,

    /// Content that may violate laws (CSAM, terrorism, etc.)
    IllegalContent = 0x05,
}

impl SpamReason {
    /// Convert from u8 representation.
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0x01 => Some(Self::Advertising),
            0x02 => Some(Self::Repetitive),
            0x03 => Some(Self::OffTopic),
            0x04 => Some(Self::Harassment),
            0x05 => Some(Self::IllegalContent),
            _ => None,
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get human-readable name of this reason.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Advertising => "Advertising",
            Self::Repetitive => "Repetitive",
            Self::OffTopic => "Off-Topic",
            Self::Harassment => "Harassment",
            Self::IllegalContent => "Illegal Content",
        }
    }

    /// Get description of what this reason means.
    pub fn description(&self) -> &'static str {
        match self {
            Self::Advertising => "Commercial promotion unrelated to discussion context",
            Self::Repetitive => "Duplicate or near-duplicate content posted repeatedly",
            Self::OffTopic => "Content irrelevant to the space or topic",
            Self::Harassment => "Targeted harassment or abuse of another user",
            Self::IllegalContent => "Content that may violate laws",
        }
    }

    /// Get all spam reasons.
    pub fn all() -> &'static [SpamReason] {
        &[
            Self::Advertising,
            Self::Repetitive,
            Self::OffTopic,
            Self::Harassment,
            Self::IllegalContent,
        ]
    }
}

impl fmt::Display for SpamReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

/// Spam attestation structure per SPEC_12 Section 3.2.
///
/// An attestation is a signed declaration that specific content should be
/// treated as spam. Multiple attestations from independent sponsor trees
/// trigger accelerated decay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpamAttestation {
    /// Hash of the content being flagged
    pub content_hash: [u8; 32],

    /// Public key of the attester (must be Resident+)
    pub attester: [u8; 32],

    /// Reason for the spam attestation
    pub reason: SpamReason,

    /// Unix timestamp when attestation was created
    pub timestamp: u64,

    /// PoW nonce proving computational cost
    pub pow_nonce: u64,

    /// Ed25519 signature over the attestation data
    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
}

impl SpamAttestation {
    /// Size of a serialized SpamAttestation in bytes.
    /// content_hash(32) + attester(32) + reason(1) + timestamp(8) + pow_nonce(8) + signature(64) = 145
    pub const SERIALIZED_SIZE: usize = 145;

    /// Create the message bytes for signing.
    ///
    /// Format: "SPAM_ATTESTATION" || content_hash || reason || timestamp
    pub fn signing_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(57);
        msg.extend_from_slice(b"SPAM_ATTESTATION");
        msg.extend_from_slice(&self.content_hash);
        msg.push(self.reason.as_u8());
        msg.extend_from_slice(&self.timestamp.to_le_bytes());
        msg
    }

    /// Create the message bytes for PoW verification.
    ///
    /// Format: content_hash || attester || reason || timestamp
    pub fn pow_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(73);
        msg.extend_from_slice(&self.content_hash);
        msg.extend_from_slice(&self.attester);
        msg.push(self.reason.as_u8());
        msg.extend_from_slice(&self.timestamp.to_le_bytes());
        msg
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::SERIALIZED_SIZE);
        bytes.extend_from_slice(&self.content_hash);
        bytes.extend_from_slice(&self.attester);
        bytes.push(self.reason.as_u8());
        bytes.extend_from_slice(&self.timestamp.to_le_bytes());
        bytes.extend_from_slice(&self.pow_nonce.to_le_bytes());
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

        let mut attester = [0u8; 32];
        attester.copy_from_slice(&bytes[32..64]);

        let reason = SpamReason::from_u8(bytes[64])?;

        let timestamp = u64::from_le_bytes(bytes[65..73].try_into().ok()?);
        let pow_nonce = u64::from_le_bytes(bytes[73..81].try_into().ok()?);

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[81..145]);

        Some(Self {
            content_hash,
            attester,
            reason,
            timestamp,
            pow_nonce,
            signature,
        })
    }
}

/// Stored spam attestation with additional metadata for aggregation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredSpamAttestation {
    /// The attestation itself
    pub attestation: SpamAttestation,

    /// Sponsor tree root of the attester (for Sybil deduplication)
    pub sponsor_tree_root: [u8; 32],

    /// Whether this attestation counts toward threshold
    /// (may be deduplicated if another attester shares the same tree root)
    pub is_deduplicated: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spam_reason_roundtrip() {
        for reason in SpamReason::all() {
            let val = reason.as_u8();
            let restored = SpamReason::from_u8(val).unwrap();
            assert_eq!(*reason, restored);
        }
    }

    #[test]
    fn test_spam_reason_invalid() {
        assert!(SpamReason::from_u8(0x00).is_none());
        assert!(SpamReason::from_u8(0x06).is_none());
        assert!(SpamReason::from_u8(0xFF).is_none());
    }

    #[test]
    fn test_spam_attestation_serialization() {
        let attestation = SpamAttestation {
            content_hash: [1u8; 32],
            attester: [2u8; 32],
            reason: SpamReason::Advertising,
            timestamp: 1735689600,
            pow_nonce: 12345,
            signature: [3u8; 64],
        };

        let bytes = attestation.to_bytes();
        assert_eq!(bytes.len(), SpamAttestation::SERIALIZED_SIZE);

        let restored = SpamAttestation::from_bytes(&bytes).unwrap();
        assert_eq!(attestation.content_hash, restored.content_hash);
        assert_eq!(attestation.attester, restored.attester);
        assert_eq!(attestation.reason, restored.reason);
        assert_eq!(attestation.timestamp, restored.timestamp);
        assert_eq!(attestation.pow_nonce, restored.pow_nonce);
        assert_eq!(attestation.signature, restored.signature);
    }

    #[test]
    fn test_spam_attestation_signing_message() {
        let attestation = SpamAttestation {
            content_hash: [1u8; 32],
            attester: [2u8; 32],
            reason: SpamReason::Harassment,
            timestamp: 1735689600,
            pow_nonce: 0,
            signature: [0u8; 64],
        };

        let msg = attestation.signing_message();
        assert!(msg.starts_with(b"SPAM_ATTESTATION"));
        assert_eq!(msg.len(), 16 + 32 + 1 + 8); // prefix + hash + reason + timestamp
    }

    #[test]
    fn test_threshold_constants() {
        // Verify constants match SPEC_12
        assert_eq!(SPAM_ATTESTATION_THRESHOLD, 3);
        assert_eq!(COUNTER_ATTESTATION_THRESHOLD, 5);
        assert_eq!(FLAGGED_DECAY_HALF_LIFE_SECS, 14_400); // 4 hours
    }
}
