//! Blocklist error types

use std::fmt;

/// Errors that can occur in the blocklist system.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlocklistError {
    /// Content hash is already in the blocklist
    AlreadyBlocked {
        content_hash: [u8; 32],
    },

    /// Content hash is not in the blocklist
    NotBlocked {
        content_hash: [u8; 32],
    },

    /// Not enough attestations to add to blocklist
    InsufficientAttestations {
        required: u8,
        provided: u8,
    },

    /// Attestation is not for illegal content
    NotIllegalContentAttestation,

    /// Attester level is too low
    AttesterLevelTooLow {
        required_level: &'static str,
        actual_level: &'static str,
    },

    /// Invalid signature on blocklist update
    InvalidSignature,

    /// Invalid blocklist update message
    InvalidUpdateMessage(String),

    /// Storage error
    StorageError(String),

    /// Merkle verification failed
    MerkleVerificationFailed,

    /// Update timestamp is too old
    UpdateTooOld {
        max_age_secs: u64,
    },

    /// Removal requires Anchor-level counter-attestation
    RemovalRequiresAnchor,

    /// Not enough counter-attestations to remove
    InsufficientCounterAttestations {
        required: u8,
        provided: u8,
    },

    /// Duplicate attestation from same sponsor tree
    DuplicateSponsorTree,

    /// Cannot verify attestation (missing sponsor info)
    CannotVerifyAttester,
}

impl fmt::Display for BlocklistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyBlocked { .. } => write!(f, "Content is already in blocklist"),
            Self::NotBlocked { .. } => write!(f, "Content is not in blocklist"),
            Self::InsufficientAttestations { required, provided } => {
                write!(
                    f,
                    "Insufficient attestations: {} required, {} provided",
                    required, provided
                )
            }
            Self::NotIllegalContentAttestation => {
                write!(f, "Attestation is not for illegal content")
            }
            Self::AttesterLevelTooLow {
                required_level,
                actual_level,
            } => {
                write!(
                    f,
                    "Attester level too low: {} required, {} actual",
                    required_level, actual_level
                )
            }
            Self::InvalidSignature => write!(f, "Invalid signature on blocklist update"),
            Self::InvalidUpdateMessage(msg) => write!(f, "Invalid update message: {}", msg),
            Self::StorageError(msg) => write!(f, "Storage error: {}", msg),
            Self::MerkleVerificationFailed => write!(f, "Merkle verification failed"),
            Self::UpdateTooOld { max_age_secs } => {
                write!(f, "Update too old (max age: {} seconds)", max_age_secs)
            }
            Self::RemovalRequiresAnchor => {
                write!(f, "Blocklist removal requires Anchor-level counter-attestation")
            }
            Self::InsufficientCounterAttestations { required, provided } => {
                write!(
                    f,
                    "Insufficient counter-attestations: {} required, {} provided",
                    required, provided
                )
            }
            Self::DuplicateSponsorTree => {
                write!(f, "Duplicate attestation from same sponsor tree")
            }
            Self::CannotVerifyAttester => write!(f, "Cannot verify attester eligibility"),
        }
    }
}

impl std::error::Error for BlocklistError {}

/// Result type for blocklist operations.
pub type BlocklistResult<T> = Result<T, BlocklistError>;
