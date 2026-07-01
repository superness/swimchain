//! Spam attestation error types
//!
//! Error types for spam attestation validation and processing per SPEC_12 Section 4.

use std::fmt;

/// Error type for spam attestation operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpamAttestationError {
    /// Attester does not meet Resident+ level requirement
    InsufficientLevel {
        required: &'static str,
        actual: &'static str,
    },

    /// Attestation signature is invalid
    InvalidSignature,

    /// Attestation timestamp is too old
    TimestampTooOld { age_secs: u64, max_age_secs: u64 },

    /// Attestation timestamp is in the future
    TimestampInFuture { future_secs: u64 },

    /// PoW does not meet difficulty requirement
    InsufficientPoW { required: u8, actual: u8 },

    /// Attester has exceeded rate limit
    RateLimitExceeded {
        count: u32,
        limit: u32,
        window_secs: u64,
    },

    /// Cannot attest to own content
    SelfAttestation,

    /// Content hash not found
    ContentNotFound,

    /// Attestation already exists from this attester for this content
    DuplicateAttestation,

    /// Invalid spam reason value
    InvalidReason { value: u8 },

    /// Storage error
    StorageError(String),

    /// Attester identity not found in sponsorship tree
    AttesterNotFound,

    /// Sponsor tree lookup failed
    SponsorTreeError(String),

    /// Counter-attestation from non-Lifeguard+
    CounterInsufficientLevel {
        required: &'static str,
        actual: &'static str,
    },
}

impl fmt::Display for SpamAttestationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InsufficientLevel { required, actual } => {
                write!(
                    f,
                    "Attester level {} below required {} for spam attestation",
                    actual, required
                )
            }
            Self::InvalidSignature => write!(f, "Invalid attestation signature"),
            Self::TimestampTooOld { age_secs, max_age_secs } => {
                write!(
                    f,
                    "Attestation timestamp too old: {} seconds (max {})",
                    age_secs, max_age_secs
                )
            }
            Self::TimestampInFuture { future_secs } => {
                write!(f, "Attestation timestamp {} seconds in future", future_secs)
            }
            Self::InsufficientPoW { required, actual } => {
                write!(
                    f,
                    "Insufficient PoW: {} leading zeros (required {})",
                    actual, required
                )
            }
            Self::RateLimitExceeded {
                count,
                limit,
                window_secs,
            } => {
                write!(
                    f,
                    "Rate limit exceeded: {} attestations in {} seconds (limit {})",
                    count, window_secs, limit
                )
            }
            Self::SelfAttestation => write!(f, "Cannot attest to own content"),
            Self::ContentNotFound => write!(f, "Content hash not found"),
            Self::DuplicateAttestation => {
                write!(f, "Attestation already exists from this attester")
            }
            Self::InvalidReason { value } => {
                write!(f, "Invalid spam reason value: 0x{:02x}", value)
            }
            Self::StorageError(msg) => write!(f, "Storage error: {}", msg),
            Self::AttesterNotFound => write!(f, "Attester identity not found in sponsorship tree"),
            Self::SponsorTreeError(msg) => write!(f, "Sponsor tree error: {}", msg),
            Self::CounterInsufficientLevel { required, actual } => {
                write!(
                    f,
                    "Counter-attester level {} below required {} for counter-attestation",
                    actual, required
                )
            }
        }
    }
}

impl std::error::Error for SpamAttestationError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = SpamAttestationError::InsufficientLevel {
            required: "Resident",
            actual: "Regular",
        };
        assert!(err.to_string().contains("Resident"));
        assert!(err.to_string().contains("Regular"));

        let err = SpamAttestationError::RateLimitExceeded {
            count: 15,
            limit: 10,
            window_secs: 3600,
        };
        assert!(err.to_string().contains("15"));
        assert!(err.to_string().contains("10"));
    }
}
