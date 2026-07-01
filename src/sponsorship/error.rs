//! Sponsorship error types
//!
//! Error types for sponsorship operations per SPEC_11.

use std::fmt;

/// Errors from sponsorship operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SponsorshipError {
    /// Sponsor signature is missing
    MissingSignature,
    /// Sponsor signature failed verification
    InvalidSignature,
    /// Timestamp too old or in future
    StaleTimestamp,
    /// Identity already exists in network
    IdentityExists,
    /// Sponsor below Resident level
    InsufficientLevel,
    /// No available genesis slots
    NoAvailableSlots,
    /// Sponsor is under restriction
    SponsorRestricted,
    /// Would create linear chain pattern
    LinearChainRestriction,
    /// PoW proof invalid
    InvalidPow,
    /// Genesis identity requires genesis proof
    MissingGenesisProof,
    /// Genesis slot number out of range
    InvalidGenesisSlot,
    /// Genesis slot already claimed
    GenesisSlotClaimed,
    /// Identity not in genesis list
    NotInGenesisList,
    /// Not enough genesis attestations
    InsufficientGenesisAttestations,
    /// Genesis attestation signature verification failed
    InvalidGenesisAttestation,
    /// Community vote mechanism not yet implemented
    CommunityVoteNotImplemented,
    /// Genesis identities cannot be revoked
    CannotRevokeGenesis,
    /// Monthly sponsorship capacity exhausted
    ExceedsMonthlyCapacity {
        /// Sponsorships used this window
        used: u8,
        /// Maximum allowed
        capacity: u8,
        /// Swimmer level name
        level: String,
    },
    /// Cooldown period still active
    SponsorOnCooldown {
        /// Unix timestamp when cooldown expires
        available_at: u64,
    },
    /// Internal invariant violated
    InvalidInvariant(String),
    /// Storage operation failed
    StorageError(String),
    /// Sponsor is flagged for linear chain pattern (confirmed)
    ///
    /// Per SPEC_11 Section 7: Sponsors with confirmed linear chain flags
    /// can only create probationary sponsorships.
    SponsorFlaggedForLinearChain,

    // === Public Sponsorship Offer Errors (SPEC_11 §3.11) ===

    /// Offer has expired
    OfferExpired,
    /// Offer is fully claimed (claimed_count >= max_sponsees)
    OfferFullyClaimed,
    /// Invalid offer_id format or not found
    InvalidOfferId,
    /// PoW difficulty below requirement
    InsufficientPow {
        /// Required difficulty
        required: u8,
        /// Provided difficulty
        provided: u8,
    },
    /// Required attestation not provided
    MissingAttestation,
    /// Attestation signature invalid
    InvalidAttestation,
    /// Application text required but missing
    ApplicationRequired,
    /// Application text exceeds maximum length
    ApplicationTooLong {
        /// Maximum allowed bytes
        max: usize,
        /// Provided bytes
        provided: usize,
    },
    /// Offer not found in storage
    OfferNotFound,
    /// Offer signature verification failed
    InvalidOfferSignature,
    /// Sponsor level insufficient for offer type
    InsufficientLevelForOfferType {
        /// Required level
        required: String,
        /// Actual level
        actual: String,
    },
    /// Claim not found for approval/rejection
    ClaimNotFound,
    /// Claimant already submitted claim for this offer
    DuplicateClaim,
    /// Claimant signature verification failed
    InvalidClaimantSignature,

    // === Orphan Handling Errors (SPEC_11 §3.2) ===

    /// Sponsor has been inactive too long
    SponsorInactive {
        /// When sponsor was last active (UNIX seconds)
        last_seen: u64,
        /// Required inactivity threshold (UNIX seconds)
        threshold: u64,
    },
    /// Orphan not yet eligible for adoption (still in grace period)
    OrphanNotEligibleForAdoption {
        /// When grace period expires (UNIX seconds)
        grace_expires_at: u64,
    },
    /// Adopter must be PoolKeeper level
    AdopterNotPoolKeeper {
        /// Actual level of the adopter
        actual_level: String,
    },
    /// Identity has already been adopted
    AlreadyAdopted,
    /// Identity is not orphaned
    NotOrphaned,
    /// Cannot orphan genesis identity
    CannotOrphanGenesis,
}

impl fmt::Display for SponsorshipError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingSignature => write!(f, "sponsor signature required"),
            Self::InvalidSignature => write!(f, "sponsor signature verification failed"),
            Self::StaleTimestamp => write!(f, "timestamp outside acceptable window"),
            Self::IdentityExists => write!(f, "identity already exists"),
            Self::InsufficientLevel => write!(f, "sponsor must be Resident level or higher"),
            Self::NoAvailableSlots => write!(f, "no available genesis slots"),
            Self::SponsorRestricted => write!(f, "sponsor is under restriction"),
            Self::LinearChainRestriction => write!(f, "would create suspicious linear chain"),
            Self::InvalidPow => write!(f, "proof of work verification failed"),
            Self::MissingGenesisProof => write!(f, "genesis proof required for genesis identity"),
            Self::InvalidGenesisSlot => write!(f, "genesis slot number out of range"),
            Self::GenesisSlotClaimed => write!(f, "genesis slot already claimed"),
            Self::NotInGenesisList => write!(f, "identity not in hardcoded genesis list"),
            Self::InsufficientGenesisAttestations => write!(f, "insufficient genesis attestations"),
            Self::InvalidGenesisAttestation => {
                write!(f, "genesis attestation verification failed")
            }
            Self::CommunityVoteNotImplemented => {
                write!(f, "community vote mechanism not implemented")
            }
            Self::CannotRevokeGenesis => {
                write!(f, "genesis identities cannot be revoked, only self-deactivate")
            }
            Self::ExceedsMonthlyCapacity {
                used,
                capacity,
                level,
            } => {
                write!(
                    f,
                    "monthly sponsorship capacity ({}/{}) exhausted for {}",
                    used, capacity, level
                )
            }
            Self::SponsorOnCooldown { available_at } => {
                // Format as human-readable relative time
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if *available_at > now {
                    let remaining = available_at - now;
                    let hours = remaining / 3600;
                    let minutes = (remaining % 3600) / 60;
                    if hours > 0 {
                        write!(f, "sponsorship cooldown active, available in {}h {}m", hours, minutes)
                    } else {
                        write!(f, "sponsorship cooldown active, available in {}m", minutes)
                    }
                } else {
                    write!(f, "sponsorship cooldown has expired")
                }
            }
            Self::InvalidInvariant(msg) => write!(f, "invariant violated: {}", msg),
            Self::StorageError(msg) => write!(f, "storage error: {}", msg),
            Self::SponsorFlaggedForLinearChain => {
                write!(
                    f,
                    "sponsor flagged for suspicious linear chain pattern, can only create probationary sponsorships"
                )
            }
            Self::OfferExpired => write!(f, "sponsorship offer has expired"),
            Self::OfferFullyClaimed => {
                write!(f, "sponsorship offer is fully claimed, no slots remaining")
            }
            Self::InvalidOfferId => write!(f, "invalid or missing offer ID"),
            Self::InsufficientPow { required, provided } => {
                write!(
                    f,
                    "PoW difficulty {} below requirement {}",
                    provided, required
                )
            }
            Self::MissingAttestation => write!(f, "required attestation not provided"),
            Self::InvalidAttestation => write!(f, "attestation signature verification failed"),
            Self::ApplicationRequired => write!(f, "application text required but not provided"),
            Self::ApplicationTooLong { max, provided } => {
                write!(
                    f,
                    "application text too long ({} bytes, max {})",
                    provided, max
                )
            }
            Self::OfferNotFound => write!(f, "sponsorship offer not found"),
            Self::InvalidOfferSignature => write!(f, "offer signature verification failed"),
            Self::InsufficientLevelForOfferType { required, actual } => {
                write!(
                    f,
                    "sponsor level {} insufficient for offer type, requires {}",
                    actual, required
                )
            }
            Self::ClaimNotFound => write!(f, "claim not found for this offer"),
            Self::DuplicateClaim => write!(f, "claimant already submitted a claim for this offer"),
            Self::InvalidClaimantSignature => write!(f, "claimant signature verification failed"),
            Self::SponsorInactive {
                last_seen,
                threshold,
            } => {
                // Format as human-readable relative time
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let inactive_secs = now.saturating_sub(*last_seen);
                let inactive_days = inactive_secs / 86400;
                let threshold_days = *threshold / 86400;
                write!(
                    f,
                    "sponsor inactive for {} days (threshold: {} days)",
                    inactive_days, threshold_days
                )
            }
            Self::OrphanNotEligibleForAdoption { grace_expires_at } => {
                // Format as human-readable relative time
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if *grace_expires_at > now {
                    let remaining = grace_expires_at - now;
                    let days = remaining / 86400;
                    let hours = (remaining % 86400) / 3600;
                    write!(
                        f,
                        "orphan not eligible for adoption until grace period expires in {}d {}h",
                        days, hours
                    )
                } else {
                    write!(f, "orphan grace period has expired, eligible for adoption")
                }
            }
            Self::AdopterNotPoolKeeper { actual_level } => {
                write!(
                    f,
                    "adopter must be PoolKeeper level, actual level: {}",
                    actual_level
                )
            }
            Self::AlreadyAdopted => write!(f, "identity has already been adopted"),
            Self::NotOrphaned => write!(f, "identity is not orphaned"),
            Self::CannotOrphanGenesis => write!(f, "genesis identities cannot be orphaned"),
        }
    }
}

impl std::error::Error for SponsorshipError {}

impl From<sled::Error> for SponsorshipError {
    fn from(e: sled::Error) -> Self {
        SponsorshipError::StorageError(e.to_string())
    }
}

impl From<bincode::Error> for SponsorshipError {
    fn from(e: bincode::Error) -> Self {
        SponsorshipError::StorageError(format!("bincode: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        assert_eq!(
            SponsorshipError::MissingSignature.to_string(),
            "sponsor signature required"
        );
        assert_eq!(
            SponsorshipError::InvalidSignature.to_string(),
            "sponsor signature verification failed"
        );
        assert_eq!(
            SponsorshipError::InsufficientLevel.to_string(),
            "sponsor must be Resident level or higher"
        );
    }

    #[test]
    fn test_error_from_sled() {
        // Create a sled error via a path that doesn't exist (simulated)
        let err = SponsorshipError::StorageError("test error".into());
        assert!(err.to_string().contains("storage error"));
    }

    #[test]
    fn test_invariant_error() {
        let err = SponsorshipError::InvalidInvariant("test invariant".into());
        assert!(err.to_string().contains("test invariant"));
    }

    #[test]
    fn test_sponsor_flagged_for_linear_chain_error() {
        let err = SponsorshipError::SponsorFlaggedForLinearChain;
        let msg = err.to_string();
        assert!(msg.contains("flagged"));
        assert!(msg.contains("linear chain"));
        assert!(msg.contains("probationary"));
    }

    // === Public Offer Error Tests ===

    #[test]
    fn test_offer_expired_error() {
        let err = SponsorshipError::OfferExpired;
        assert!(err.to_string().contains("expired"));
    }

    #[test]
    fn test_offer_fully_claimed_error() {
        let err = SponsorshipError::OfferFullyClaimed;
        assert!(err.to_string().contains("fully claimed"));
    }

    #[test]
    fn test_insufficient_pow_error() {
        let err = SponsorshipError::InsufficientPow {
            required: 15,
            provided: 10,
        };
        let msg = err.to_string();
        assert!(msg.contains("15"));
        assert!(msg.contains("10"));
    }

    #[test]
    fn test_application_too_long_error() {
        let err = SponsorshipError::ApplicationTooLong {
            max: 2000,
            provided: 3000,
        };
        let msg = err.to_string();
        assert!(msg.contains("2000"));
        assert!(msg.contains("3000"));
    }

    #[test]
    fn test_insufficient_level_for_offer_type_error() {
        let err = SponsorshipError::InsufficientLevelForOfferType {
            required: "Anchor".into(),
            actual: "Resident".into(),
        };
        let msg = err.to_string();
        assert!(msg.contains("Anchor"));
        assert!(msg.contains("Resident"));
    }

    #[test]
    fn test_offer_error_display() {
        assert!(SponsorshipError::OfferNotFound.to_string().contains("not found"));
        assert!(SponsorshipError::InvalidOfferId.to_string().contains("invalid"));
        assert!(SponsorshipError::MissingAttestation.to_string().contains("attestation"));
        assert!(SponsorshipError::InvalidAttestation.to_string().contains("attestation"));
        assert!(SponsorshipError::ApplicationRequired.to_string().contains("application"));
        assert!(SponsorshipError::InvalidOfferSignature.to_string().contains("signature"));
        assert!(SponsorshipError::ClaimNotFound.to_string().contains("not found"));
        assert!(SponsorshipError::DuplicateClaim.to_string().contains("already"));
        assert!(SponsorshipError::InvalidClaimantSignature.to_string().contains("signature"));
    }
}
