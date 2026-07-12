//! Content Attribution data types (SPEC_09 §6.3)
//!
//! Types for tracking and displaying who keeps content alive through
//! engagement pool contributions.

/// Attribution entry for a single contributor.
///
/// Tracks an individual's contribution to keeping content alive via engagement pools.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttributionEntry {
    /// Contributor's Ed25519 public key (32 bytes)
    pub identity: [u8; 32],

    /// Total PoW contributed in seconds (aggregated across multiple contributions)
    pub pow_contributed: u64,

    /// Timestamp of first contribution to this content (UNIX milliseconds)
    pub first_contribution_timestamp: u64,
}

impl AttributionEntry {
    /// Wire format size: 32 (identity) + 8 (pow) + 8 (timestamp) = 48 bytes
    pub const WIRE_SIZE: usize = 48;

    /// Create a new AttributionEntry
    pub fn new(
        identity: [u8; 32],
        pow_contributed: u64,
        first_contribution_timestamp: u64,
    ) -> Self {
        Self {
            identity,
            pow_contributed,
            first_contribution_timestamp,
        }
    }
}

impl Default for AttributionEntry {
    fn default() -> Self {
        Self {
            identity: [0u8; 32],
            pow_contributed: 0,
            first_contribution_timestamp: 0,
        }
    }
}

/// Attribution data for content display.
///
/// Aggregated attribution information for a piece of content,
/// showing all contributors and totals.
#[derive(Clone, Debug, Default)]
pub struct ContentAttribution {
    /// Content identifier (32 bytes)
    pub content_id: [u8; 32],

    /// Contributors sorted by pow_contributed DESC
    pub contributors: Vec<AttributionEntry>,

    /// Total unique contributors
    pub total_contributors: u32,

    /// Total PoW from all contributors (in seconds)
    pub total_pow_contributed: u64,

    /// Pool completion timestamp if any pool completed (UNIX milliseconds)
    pub pool_completion_timestamp: Option<u64>,
}

impl ContentAttribution {
    /// Create a new ContentAttribution for the given content
    pub fn new(content_id: [u8; 32]) -> Self {
        Self {
            content_id,
            contributors: Vec::new(),
            total_contributors: 0,
            total_pow_contributed: 0,
            pool_completion_timestamp: None,
        }
    }

    /// Check if there are any contributors
    pub fn has_contributors(&self) -> bool {
        !self.contributors.is_empty()
    }
}

/// Decay status for special cases.
///
/// Indicates whether content is actively decaying, protected, or already decayed.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum DecayStatus {
    /// Normal countdown - days > 0
    Active = 0x01,
    /// Protected - floor period or pinned content
    Protected = 0x02,
    /// Already decayed below threshold
    Decayed = 0x03,
}

impl DecayStatus {
    /// Convert to wire format byte
    pub fn to_byte(self) -> u8 {
        self as u8
    }
}

impl TryFrom<u8> for DecayStatus {
    type Error = DecayStatusError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(DecayStatus::Active),
            0x02 => Ok(DecayStatus::Protected),
            0x03 => Ok(DecayStatus::Decayed),
            _ => Err(DecayStatusError::invalid_value(value)),
        }
    }
}

impl Default for DecayStatus {
    fn default() -> Self {
        DecayStatus::Active
    }
}

/// Error for invalid DecayStatus byte
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecayStatusError {
    value: u8,
}

impl DecayStatusError {
    /// Create a new error for an invalid value
    pub fn invalid_value(value: u8) -> Self {
        Self { value }
    }
}

impl std::fmt::Display for DecayStatusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Invalid DecayStatus byte: {:#04x}", self.value)
    }
}

impl std::error::Error for DecayStatusError {}

/// Display-ready attribution data per SPEC_09 §6.3.
///
/// Contains formatted strings ready for UI display:
/// - "KEPT ALIVE BY: @alice, @bob, and 7 others"
/// - "Decays in 12 days without engagement"
#[derive(Clone, Debug)]
pub struct ContentAttributionDisplay {
    /// Content identifier (32 bytes)
    pub content_id: [u8; 32],

    /// Formatted attribution line: "KEPT ALIVE BY: @alice, @bob, and 7 others"
    pub attribution_line: String,

    /// Formatted decay line: "Decays in 12 days without engagement" or special case
    pub decay_line: String,

    /// Days until decay (None = protected or already decayed)
    pub days_until_decay: Option<u16>,

    /// Decay status for special cases
    pub decay_status: DecayStatus,
}

impl ContentAttributionDisplay {
    /// Create a new display with empty/default values
    pub fn new(content_id: [u8; 32]) -> Self {
        Self {
            content_id,
            attribution_line: String::new(),
            decay_line: String::new(),
            days_until_decay: None,
            decay_status: DecayStatus::Active,
        }
    }
}

impl Default for ContentAttributionDisplay {
    fn default() -> Self {
        Self::new([0u8; 32])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attribution_entry_wire_size() {
        // 32 bytes identity + 8 bytes pow + 8 bytes timestamp = 48 bytes
        assert_eq!(AttributionEntry::WIRE_SIZE, 48);
    }

    #[test]
    fn test_attribution_entry_new() {
        let identity = [42u8; 32];
        let entry = AttributionEntry::new(identity, 30, 1735689600000);

        assert_eq!(entry.identity, identity);
        assert_eq!(entry.pow_contributed, 30);
        assert_eq!(entry.first_contribution_timestamp, 1735689600000);
    }

    #[test]
    fn test_attribution_entry_default() {
        let entry = AttributionEntry::default();
        assert_eq!(entry.identity, [0u8; 32]);
        assert_eq!(entry.pow_contributed, 0);
        assert_eq!(entry.first_contribution_timestamp, 0);
    }

    #[test]
    fn test_content_attribution_new() {
        let content_id = [1u8; 32];
        let attr = ContentAttribution::new(content_id);

        assert_eq!(attr.content_id, content_id);
        assert!(attr.contributors.is_empty());
        assert_eq!(attr.total_contributors, 0);
        assert_eq!(attr.total_pow_contributed, 0);
        assert!(attr.pool_completion_timestamp.is_none());
    }

    #[test]
    fn test_content_attribution_has_contributors() {
        let mut attr = ContentAttribution::new([1u8; 32]);
        assert!(!attr.has_contributors());

        attr.contributors
            .push(AttributionEntry::new([2u8; 32], 10, 0));
        assert!(attr.has_contributors());
    }

    #[test]
    fn test_decay_status_to_byte() {
        assert_eq!(DecayStatus::Active.to_byte(), 0x01);
        assert_eq!(DecayStatus::Protected.to_byte(), 0x02);
        assert_eq!(DecayStatus::Decayed.to_byte(), 0x03);
    }

    #[test]
    fn test_decay_status_try_from() {
        assert_eq!(DecayStatus::try_from(0x01).unwrap(), DecayStatus::Active);
        assert_eq!(DecayStatus::try_from(0x02).unwrap(), DecayStatus::Protected);
        assert_eq!(DecayStatus::try_from(0x03).unwrap(), DecayStatus::Decayed);
        assert!(DecayStatus::try_from(0x00).is_err());
        assert!(DecayStatus::try_from(0x04).is_err());
    }

    #[test]
    fn test_decay_status_roundtrip() {
        for status in [
            DecayStatus::Active,
            DecayStatus::Protected,
            DecayStatus::Decayed,
        ] {
            let byte = status.to_byte();
            let restored = DecayStatus::try_from(byte).unwrap();
            assert_eq!(status, restored);
        }
    }

    #[test]
    fn test_content_attribution_display_new() {
        let content_id = [3u8; 32];
        let display = ContentAttributionDisplay::new(content_id);

        assert_eq!(display.content_id, content_id);
        assert!(display.attribution_line.is_empty());
        assert!(display.decay_line.is_empty());
        assert!(display.days_until_decay.is_none());
        assert_eq!(display.decay_status, DecayStatus::Active);
    }
}
