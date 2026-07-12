//! Penalty types and constants for consequence propagation
//!
//! Implements SPEC_11 Section 3.4 (MisbehaviorSeverity), Section 3.5 (PenaltyRecord/PenaltyType),
//! and penalty duration constants per Section 4.2.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::sponsorship::error::SponsorshipError;
use crate::sponsorship::types::MIN_ATTESTATION_COUNT;
use crate::types::identity::PublicKey;

// === SPEC_11 Section 4.2: Penalty Duration Constants ===

/// Seconds per day (for duration calculations)
pub const SECONDS_PER_DAY: u64 = 86_400;

/// Spam penalty duration in days (SPEC_11 §4.2)
pub const SPAM_PENALTY_DAYS: u64 = 7;

/// Abuse penalty duration in days (SPEC_11 §4.2)
pub const ABUSE_PENALTY_DAYS: u64 = 30;

/// Illegal content penalty duration in days (SPEC_11 §4.2)
/// Note: Illegal results in permanent revocation, but this is used for sponsor penalties
pub const ILLEGAL_PENALTY_DAYS: u64 = 90;

/// Spam penalty duration in seconds
pub const SPAM_PENALTY_SECONDS: u64 = SPAM_PENALTY_DAYS * SECONDS_PER_DAY;

/// Abuse penalty duration in seconds
pub const ABUSE_PENALTY_SECONDS: u64 = ABUSE_PENALTY_DAYS * SECONDS_PER_DAY;

/// Illegal penalty duration in seconds (for sponsors, not offender)
pub const ILLEGAL_PENALTY_SECONDS: u64 = ILLEGAL_PENALTY_DAYS * SECONDS_PER_DAY;

/// Minimum attestations required for penalty recovery acceleration (same as MIN_ATTESTATION_COUNT)
pub const MIN_PENALTY_RECOVERY_ATTESTATION_COUNT: u8 = MIN_ATTESTATION_COUNT;

/// Value indicating all invite slots should be lost
pub const ALL_INVITE_SLOTS: u8 = u8::MAX;

// === SPEC_11 Section 3.4: MisbehaviorSeverity ===

/// Severity level of misbehavior per SPEC_11 Section 3.4
///
/// Determines the type and duration of penalties applied to both
/// the offender and their sponsor chain.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MisbehaviorSeverity {
    /// No misbehavior detected
    None = 0,
    /// Spam: Flagged as spam by 3+ Residents
    Spam = 1,
    /// Abuse: Pattern of harassment (5+ spam flags in 7 days)
    Abuse = 2,
    /// Illegal: CSAM, terrorism content (hash match + 3 attestations)
    Illegal = 3,
}

impl MisbehaviorSeverity {
    /// Check if this severity level results in penalties propagating to sponsors
    ///
    /// Only Spam, Abuse, and Illegal trigger consequence propagation.
    #[must_use]
    pub fn is_propagating(&self) -> bool {
        !matches!(self, Self::None)
    }

    /// Get the base penalty duration in seconds for an offender
    ///
    /// Returns `None` for severity levels that don't apply penalties,
    /// or `u64::MAX` for permanent revocation.
    #[must_use]
    pub fn offender_duration_seconds(&self) -> Option<u64> {
        match self {
            Self::None => None,
            Self::Spam => Some(SPAM_PENALTY_SECONDS),
            Self::Abuse => Some(ABUSE_PENALTY_SECONDS),
            Self::Illegal => Some(u64::MAX), // Permanent
        }
    }

    /// Get the base penalty duration in seconds for hop-1 sponsor
    #[must_use]
    pub fn hop1_duration_seconds(&self) -> Option<u64> {
        match self {
            Self::None => None,
            Self::Spam => Some(SPAM_PENALTY_SECONDS),
            Self::Abuse => Some(ABUSE_PENALTY_SECONDS),
            Self::Illegal => Some(ILLEGAL_PENALTY_SECONDS),
        }
    }

    /// Get the base penalty duration in seconds for hop-2 sponsor
    #[must_use]
    pub fn hop2_duration_seconds(&self) -> Option<u64> {
        match self {
            Self::None => None,
            Self::Spam => None, // Warning only for hop 2 on spam
            Self::Abuse => Some(SPAM_PENALTY_SECONDS), // 7 days
            Self::Illegal => Some(ABUSE_PENALTY_SECONDS), // 30 days
        }
    }
}

impl TryFrom<u8> for MisbehaviorSeverity {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::None),
            1 => Ok(Self::Spam),
            2 => Ok(Self::Abuse),
            3 => Ok(Self::Illegal),
            _ => Err(()),
        }
    }
}

impl Default for MisbehaviorSeverity {
    fn default() -> Self {
        Self::None
    }
}

impl fmt::Display for MisbehaviorSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::None => write!(f, "None"),
            Self::Spam => write!(f, "Spam"),
            Self::Abuse => write!(f, "Abuse"),
            Self::Illegal => write!(f, "Illegal"),
        }
    }
}

// === SPEC_11 Section 3.5: PenaltyType ===

/// Type of penalty applied per SPEC_11 Section 3.5
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PenaltyType {
    /// Restricted posting: Identity can only view, not post
    RestrictedPosting = 0,
    /// Lost invite slots: Cannot sponsor new identities
    LostInviteSlots = 1,
    /// Accelerated decay: Content decays faster than normal
    AcceleratedDecay = 2,
    /// Permanent revocation: Identity is permanently banned
    PermanentRevocation = 3,
}

impl TryFrom<u8> for PenaltyType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::RestrictedPosting),
            1 => Ok(Self::LostInviteSlots),
            2 => Ok(Self::AcceleratedDecay),
            3 => Ok(Self::PermanentRevocation),
            _ => Err(()),
        }
    }
}

impl fmt::Display for PenaltyType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RestrictedPosting => write!(f, "RestrictedPosting"),
            Self::LostInviteSlots => write!(f, "LostInviteSlots"),
            Self::AcceleratedDecay => write!(f, "AcceleratedDecay"),
            Self::PermanentRevocation => write!(f, "PermanentRevocation"),
        }
    }
}

// === SPEC_11 Section 3.5: PenaltyRecord ===

/// Record of a penalty applied to an identity per SPEC_11 Section 3.5
///
/// # Invariants
/// - `current_expires_at <= base_expires_at` (recovery can reduce, not extend)
/// - `hop_distance <= 2` for actual penalties (3+ gets warning only)
/// - If `penalty_type == PermanentRevocation`, then `base_expires_at == u64::MAX`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PenaltyRecord {
    /// Identity receiving the penalty
    pub identity: PublicKey,
    /// Type of penalty applied
    pub penalty_type: PenaltyType,
    /// When penalty was applied (UNIX seconds)
    pub started_at: u64,
    /// Original expiration time before any recovery
    pub base_expires_at: u64,
    /// Current expiration time (may be reduced by recovery)
    pub current_expires_at: u64,
    /// Identity that caused this penalty (None for direct offender)
    pub caused_by: Option<PublicKey>,
    /// Severity of the original misbehavior
    pub severity: MisbehaviorSeverity,
    /// Distance from offender (0=offender, 1=sponsor, 2=sponsor's sponsor)
    pub hop_distance: u8,
    /// Number of invite slots lost (1 for minor, `ALL_INVITE_SLOTS` for all)
    pub slots_lost: u8,
    /// Additional penalty type if applicable (e.g., AcceleratedDecay with LostInviteSlots)
    pub additional_penalty: Option<PenaltyType>,
}

impl PenaltyRecord {
    /// Create a new penalty record for an offender (hop distance 0)
    #[must_use]
    pub fn for_offender(
        identity: PublicKey,
        severity: MisbehaviorSeverity,
        current_time: u64,
    ) -> Self {
        let (penalty_type, base_expires_at) = match severity {
            MisbehaviorSeverity::None => {
                // Shouldn't create penalty for None severity
                (PenaltyType::RestrictedPosting, current_time)
            }
            MisbehaviorSeverity::Spam => (
                PenaltyType::RestrictedPosting,
                current_time + SPAM_PENALTY_SECONDS,
            ),
            MisbehaviorSeverity::Abuse => (
                PenaltyType::RestrictedPosting,
                current_time + ABUSE_PENALTY_SECONDS,
            ),
            MisbehaviorSeverity::Illegal => (PenaltyType::PermanentRevocation, u64::MAX),
        };

        Self {
            identity,
            penalty_type,
            started_at: current_time,
            base_expires_at,
            current_expires_at: base_expires_at,
            caused_by: None,
            severity,
            hop_distance: 0,
            slots_lost: 0,
            additional_penalty: None,
        }
    }

    /// Create a penalty record for a sponsor at given hop distance
    #[must_use]
    pub fn for_sponsor(
        identity: PublicKey,
        offender: PublicKey,
        severity: MisbehaviorSeverity,
        hop_distance: u8,
        duration_seconds: u64,
        current_time: u64,
    ) -> Self {
        let (penalty_type, slots_lost, additional_penalty) = match (severity, hop_distance) {
            // Hop 1 penalties per SPEC_11 §4.2
            (MisbehaviorSeverity::Spam, 1) => (PenaltyType::LostInviteSlots, 1, None),
            (MisbehaviorSeverity::Abuse, 1) => {
                (PenaltyType::LostInviteSlots, ALL_INVITE_SLOTS, None)
            }
            (MisbehaviorSeverity::Illegal, 1) => (
                PenaltyType::LostInviteSlots,
                ALL_INVITE_SLOTS,
                Some(PenaltyType::AcceleratedDecay),
            ),
            // Hop 2 penalties per SPEC_11 §4.2
            (MisbehaviorSeverity::Abuse, 2) => (PenaltyType::LostInviteSlots, 1, None),
            (MisbehaviorSeverity::Illegal, 2) => (PenaltyType::LostInviteSlots, 1, None),
            // Other cases (should be warning only or no penalty)
            _ => (PenaltyType::LostInviteSlots, 0, None),
        };

        let base_expires_at = current_time.saturating_add(duration_seconds);

        Self {
            identity,
            penalty_type,
            started_at: current_time,
            base_expires_at,
            current_expires_at: base_expires_at,
            caused_by: Some(offender),
            severity,
            hop_distance,
            slots_lost,
            additional_penalty,
        }
    }

    /// Check if this penalty has expired
    #[must_use]
    pub fn is_expired(&self, current_time: u64) -> bool {
        current_time >= self.current_expires_at
    }

    /// Check if this is a permanent penalty
    #[must_use]
    pub fn is_permanent(&self) -> bool {
        self.penalty_type == PenaltyType::PermanentRevocation || self.base_expires_at == u64::MAX
    }

    /// Get remaining duration in seconds
    #[must_use]
    pub fn remaining_duration(&self, current_time: u64) -> u64 {
        if self.is_permanent() {
            return u64::MAX;
        }
        self.current_expires_at.saturating_sub(current_time)
    }

    /// Validate internal invariants
    pub fn validate_invariants(&self) -> Result<(), SponsorshipError> {
        // Invariant 1: current <= base
        if self.current_expires_at > self.base_expires_at {
            return Err(SponsorshipError::InvalidInvariant(
                "current_expires_at cannot exceed base_expires_at".into(),
            ));
        }

        // Invariant 2: hop_distance <= 2 for actual penalties
        if self.hop_distance > 2 && self.slots_lost > 0 {
            return Err(SponsorshipError::InvalidInvariant(
                "hop_distance > 2 should only have warnings, not penalties".into(),
            ));
        }

        // Invariant 3: PermanentRevocation → base_expires_at == u64::MAX
        if self.penalty_type == PenaltyType::PermanentRevocation && self.base_expires_at != u64::MAX
        {
            return Err(SponsorshipError::InvalidInvariant(
                "PermanentRevocation must have u64::MAX expiration".into(),
            ));
        }

        Ok(())
    }

    /// Update the current expiration time (for recovery)
    ///
    /// Ensures the new time doesn't exceed the base expiration.
    pub fn set_current_expires_at(&mut self, new_expires_at: u64) {
        self.current_expires_at = new_expires_at.min(self.base_expires_at);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pubkey(n: u8) -> PublicKey {
        PublicKey::from_bytes([n; 32])
    }

    #[test]
    fn test_misbehavior_severity_discriminants() {
        assert_eq!(MisbehaviorSeverity::None as u8, 0);
        assert_eq!(MisbehaviorSeverity::Spam as u8, 1);
        assert_eq!(MisbehaviorSeverity::Abuse as u8, 2);
        assert_eq!(MisbehaviorSeverity::Illegal as u8, 3);
    }

    #[test]
    fn test_misbehavior_severity_try_from() {
        assert_eq!(
            MisbehaviorSeverity::try_from(0).unwrap(),
            MisbehaviorSeverity::None
        );
        assert_eq!(
            MisbehaviorSeverity::try_from(1).unwrap(),
            MisbehaviorSeverity::Spam
        );
        assert_eq!(
            MisbehaviorSeverity::try_from(2).unwrap(),
            MisbehaviorSeverity::Abuse
        );
        assert_eq!(
            MisbehaviorSeverity::try_from(3).unwrap(),
            MisbehaviorSeverity::Illegal
        );
        assert!(MisbehaviorSeverity::try_from(4).is_err());
    }

    #[test]
    fn test_misbehavior_severity_is_propagating() {
        assert!(!MisbehaviorSeverity::None.is_propagating());
        assert!(MisbehaviorSeverity::Spam.is_propagating());
        assert!(MisbehaviorSeverity::Abuse.is_propagating());
        assert!(MisbehaviorSeverity::Illegal.is_propagating());
    }

    #[test]
    fn test_penalty_type_discriminants() {
        assert_eq!(PenaltyType::RestrictedPosting as u8, 0);
        assert_eq!(PenaltyType::LostInviteSlots as u8, 1);
        assert_eq!(PenaltyType::AcceleratedDecay as u8, 2);
        assert_eq!(PenaltyType::PermanentRevocation as u8, 3);
    }

    #[test]
    fn test_penalty_type_try_from() {
        assert_eq!(
            PenaltyType::try_from(0).unwrap(),
            PenaltyType::RestrictedPosting
        );
        assert_eq!(
            PenaltyType::try_from(1).unwrap(),
            PenaltyType::LostInviteSlots
        );
        assert_eq!(
            PenaltyType::try_from(2).unwrap(),
            PenaltyType::AcceleratedDecay
        );
        assert_eq!(
            PenaltyType::try_from(3).unwrap(),
            PenaltyType::PermanentRevocation
        );
        assert!(PenaltyType::try_from(4).is_err());
    }

    #[test]
    fn test_penalty_record_for_offender_spam() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        assert_eq!(penalty.penalty_type, PenaltyType::RestrictedPosting);
        assert_eq!(penalty.hop_distance, 0);
        assert_eq!(penalty.base_expires_at, time + SPAM_PENALTY_SECONDS);
        assert!(penalty.caused_by.is_none());
        assert!(!penalty.is_permanent());
        assert!(penalty.validate_invariants().is_ok());
    }

    #[test]
    fn test_penalty_record_for_offender_abuse() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        assert_eq!(penalty.penalty_type, PenaltyType::RestrictedPosting);
        assert_eq!(penalty.base_expires_at, time + ABUSE_PENALTY_SECONDS);
        assert!(!penalty.is_permanent());
    }

    #[test]
    fn test_penalty_record_for_offender_illegal() {
        let time = 1735689600;
        let penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);

        assert_eq!(penalty.penalty_type, PenaltyType::PermanentRevocation);
        assert_eq!(penalty.base_expires_at, u64::MAX);
        assert!(penalty.is_permanent());
        assert!(penalty.validate_invariants().is_ok());
    }

    #[test]
    fn test_penalty_record_for_sponsor_hop1_spam() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_sponsor(
            test_pubkey(2),
            test_pubkey(1),
            MisbehaviorSeverity::Spam,
            1,
            SPAM_PENALTY_SECONDS,
            time,
        );

        assert_eq!(penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(penalty.slots_lost, 1);
        assert_eq!(penalty.hop_distance, 1);
        assert_eq!(penalty.caused_by, Some(test_pubkey(1)));
        assert!(penalty.additional_penalty.is_none());
    }

    #[test]
    fn test_penalty_record_for_sponsor_hop1_illegal() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_sponsor(
            test_pubkey(2),
            test_pubkey(1),
            MisbehaviorSeverity::Illegal,
            1,
            ILLEGAL_PENALTY_SECONDS,
            time,
        );

        assert_eq!(penalty.penalty_type, PenaltyType::LostInviteSlots);
        assert_eq!(penalty.slots_lost, ALL_INVITE_SLOTS);
        assert_eq!(
            penalty.additional_penalty,
            Some(PenaltyType::AcceleratedDecay)
        );
    }

    #[test]
    fn test_penalty_record_is_expired() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        assert!(!penalty.is_expired(time));
        assert!(!penalty.is_expired(time + SPAM_PENALTY_SECONDS - 1));
        assert!(penalty.is_expired(time + SPAM_PENALTY_SECONDS));
        assert!(penalty.is_expired(time + SPAM_PENALTY_SECONDS + 1));
    }

    #[test]
    fn test_penalty_record_remaining_duration() {
        let time = 1735689600;
        let penalty = PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        assert_eq!(penalty.remaining_duration(time), SPAM_PENALTY_SECONDS);
        assert_eq!(
            penalty.remaining_duration(time + 100),
            SPAM_PENALTY_SECONDS - 100
        );
        assert_eq!(penalty.remaining_duration(time + SPAM_PENALTY_SECONDS), 0);
    }

    #[test]
    fn test_penalty_record_permanent_remaining_duration() {
        let time = 1735689600;
        let penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);

        assert_eq!(penalty.remaining_duration(time), u64::MAX);
        assert_eq!(penalty.remaining_duration(time + 1_000_000), u64::MAX);
    }

    #[test]
    fn test_penalty_record_set_current_expires_at() {
        let time = 1735689600;
        let mut penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Abuse, time);

        let original_base = penalty.base_expires_at;

        // Reduce expiration (recovery)
        penalty.set_current_expires_at(time + SPAM_PENALTY_SECONDS);
        assert_eq!(penalty.current_expires_at, time + SPAM_PENALTY_SECONDS);
        assert_eq!(penalty.base_expires_at, original_base); // Base unchanged

        // Try to extend beyond base (should be clamped)
        penalty.set_current_expires_at(original_base + 1000);
        assert_eq!(penalty.current_expires_at, original_base);
    }

    #[test]
    fn test_penalty_record_validate_invariants_invalid_current() {
        let time = 1735689600;
        let mut penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Spam, time);

        // Force invalid state
        penalty.current_expires_at = penalty.base_expires_at + 1;

        assert!(matches!(
            penalty.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_penalty_record_validate_invariants_invalid_hop() {
        let time = 1735689600;
        let mut penalty = PenaltyRecord::for_sponsor(
            test_pubkey(2),
            test_pubkey(1),
            MisbehaviorSeverity::Spam,
            3, // hop 3 should be warning only
            SPAM_PENALTY_SECONDS,
            time,
        );

        // Force slots_lost > 0 at hop 3+
        penalty.slots_lost = 1;

        assert!(matches!(
            penalty.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_penalty_record_validate_invariants_invalid_permanent() {
        let time = 1735689600;
        let mut penalty =
            PenaltyRecord::for_offender(test_pubkey(1), MisbehaviorSeverity::Illegal, time);

        // Force invalid state
        penalty.base_expires_at = time + 1000;

        assert!(matches!(
            penalty.validate_invariants(),
            Err(SponsorshipError::InvalidInvariant(_))
        ));
    }

    #[test]
    fn test_misbehavior_severity_display() {
        assert_eq!(format!("{}", MisbehaviorSeverity::None), "None");
        assert_eq!(format!("{}", MisbehaviorSeverity::Spam), "Spam");
        assert_eq!(format!("{}", MisbehaviorSeverity::Abuse), "Abuse");
        assert_eq!(format!("{}", MisbehaviorSeverity::Illegal), "Illegal");
    }

    #[test]
    fn test_penalty_type_display() {
        assert_eq!(
            format!("{}", PenaltyType::RestrictedPosting),
            "RestrictedPosting"
        );
        assert_eq!(
            format!("{}", PenaltyType::LostInviteSlots),
            "LostInviteSlots"
        );
        assert_eq!(
            format!("{}", PenaltyType::AcceleratedDecay),
            "AcceleratedDecay"
        );
        assert_eq!(
            format!("{}", PenaltyType::PermanentRevocation),
            "PermanentRevocation"
        );
    }

    #[test]
    fn test_penalty_duration_constants() {
        assert_eq!(SPAM_PENALTY_DAYS, 7);
        assert_eq!(ABUSE_PENALTY_DAYS, 30);
        assert_eq!(ILLEGAL_PENALTY_DAYS, 90);
        assert_eq!(SECONDS_PER_DAY, 86_400);
        assert_eq!(SPAM_PENALTY_SECONDS, 7 * 86_400);
        assert_eq!(ABUSE_PENALTY_SECONDS, 30 * 86_400);
        assert_eq!(ILLEGAL_PENALTY_SECONDS, 90 * 86_400);
    }

    #[test]
    fn test_offender_duration_seconds() {
        assert!(MisbehaviorSeverity::None
            .offender_duration_seconds()
            .is_none());
        assert_eq!(
            MisbehaviorSeverity::Spam.offender_duration_seconds(),
            Some(SPAM_PENALTY_SECONDS)
        );
        assert_eq!(
            MisbehaviorSeverity::Abuse.offender_duration_seconds(),
            Some(ABUSE_PENALTY_SECONDS)
        );
        assert_eq!(
            MisbehaviorSeverity::Illegal.offender_duration_seconds(),
            Some(u64::MAX)
        );
    }
}
