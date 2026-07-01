//! Attribution wire protocol handler (SPEC_09 §6.3)
//!
//! Handles MSG_ATTRIBUTION_QUERY (0x50) and MSG_ATTRIBUTION_RESPONSE (0x51) messages.

use crate::content::pool::EngagementPool;
use crate::types::constants::HALF_LIFE_SECS;
use crate::types::content::ContentItem;

use super::compute::{decay_countdown_days, get_display_contributors, MAX_DISPLAY_CONTRIBUTORS};
use super::error::AttributionError;
use super::manager::AttributionManager;
use super::types::{AttributionEntry, DecayStatus};

// ============================================================================
// Wire Protocol Payload Types
// ============================================================================

/// Query attribution for content.
///
/// Wire format: content_id (32 bytes)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttributionQueryPayload {
    /// Content to query attribution for
    pub content_id: [u8; 32],
}

impl AttributionQueryPayload {
    /// Wire format size: 32 bytes
    pub const WIRE_SIZE: usize = 32;

    /// Create a new query payload
    pub fn new(content_id: [u8; 32]) -> Self {
        Self { content_id }
    }

    /// Serialize to wire format
    pub fn to_bytes(&self) -> Vec<u8> {
        self.content_id.to_vec()
    }

    /// Deserialize from wire format
    pub fn from_bytes(data: &[u8]) -> Result<Self, AttributionError> {
        if data.len() < Self::WIRE_SIZE {
            return Err(AttributionError::InvalidWireFormat(format!(
                "Expected {} bytes, got {}",
                Self::WIRE_SIZE,
                data.len()
            )));
        }

        let mut content_id = [0u8; 32];
        content_id.copy_from_slice(&data[..32]);

        Ok(Self { content_id })
    }
}

/// Response with attribution data.
///
/// Wire format:
/// - content_id: 32 bytes
/// - decay_status: 1 byte (DecayStatus enum)
/// - days_remaining: 2 bytes (u16, 0xFFFF = N/A for Protected)
/// - total_contributors: 4 bytes (u32)
/// - total_pow: 8 bytes (u64)
/// - has_completion_ts: 1 byte (0 or 1)
/// - completion_ts: 8 bytes (if has_completion_ts == 1)
/// - contributor_count: 1 byte (0-255, display contributors)
/// - contributors: N × 48 bytes (AttributionEntry)
///
/// Fixed portion: 32 + 1 + 2 + 4 + 8 + 1 + 1 = 49 bytes (no completion ts)
/// Or: 49 + 8 = 57 bytes (with completion ts)
/// Per contributor: 48 bytes
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttributionResponsePayload {
    /// Content identifier
    pub content_id: [u8; 32],
    /// Decay status
    pub decay_status: DecayStatus,
    /// Days until decay (0xFFFF if N/A)
    pub days_remaining: u16,
    /// Total unique contributors
    pub total_contributors: u32,
    /// Total PoW from all contributors
    pub total_pow: u64,
    /// Pool completion timestamp (if any)
    pub pool_completion_timestamp: Option<u64>,
    /// Display contributors (max 255)
    pub contributors: Vec<AttributionEntry>,
}

impl AttributionResponsePayload {
    /// Minimum wire size (no completion timestamp, no contributors)
    pub const MIN_WIRE_SIZE: usize = 49;

    /// Create a new response payload
    pub fn new(content_id: [u8; 32]) -> Self {
        Self {
            content_id,
            decay_status: DecayStatus::Active,
            days_remaining: 0,
            total_contributors: 0,
            total_pow: 0,
            pool_completion_timestamp: None,
            contributors: Vec::new(),
        }
    }

    /// Serialize to wire format
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::MIN_WIRE_SIZE);

        // content_id (32 bytes)
        bytes.extend_from_slice(&self.content_id);

        // decay_status (1 byte)
        bytes.push(self.decay_status.to_byte());

        // days_remaining (2 bytes, little-endian)
        bytes.extend_from_slice(&self.days_remaining.to_le_bytes());

        // total_contributors (4 bytes, little-endian)
        bytes.extend_from_slice(&self.total_contributors.to_le_bytes());

        // total_pow (8 bytes, little-endian)
        bytes.extend_from_slice(&self.total_pow.to_le_bytes());

        // has_completion_ts (1 byte)
        if let Some(ts) = self.pool_completion_timestamp {
            bytes.push(1);
            bytes.extend_from_slice(&ts.to_le_bytes());
        } else {
            bytes.push(0);
        }

        // contributor_count (1 byte)
        let count = self.contributors.len().min(255) as u8;
        bytes.push(count);

        // contributors (N × 48 bytes)
        for contributor in self.contributors.iter().take(255) {
            bytes.extend_from_slice(&contributor.identity);
            bytes.extend_from_slice(&contributor.pow_contributed.to_le_bytes());
            bytes.extend_from_slice(&contributor.first_contribution_timestamp.to_le_bytes());
        }

        bytes
    }

    /// Deserialize from wire format
    pub fn from_bytes(data: &[u8]) -> Result<Self, AttributionError> {
        if data.len() < Self::MIN_WIRE_SIZE {
            return Err(AttributionError::InvalidWireFormat(format!(
                "Expected at least {} bytes, got {}",
                Self::MIN_WIRE_SIZE,
                data.len()
            )));
        }

        let mut offset = 0;

        // content_id (32 bytes)
        let mut content_id = [0u8; 32];
        content_id.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // decay_status (1 byte)
        let decay_status = DecayStatus::try_from(data[offset]).map_err(|e| {
            AttributionError::InvalidWireFormat(format!("Invalid decay status: {}", e))
        })?;
        offset += 1;

        // days_remaining (2 bytes)
        let days_remaining = u16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2;

        // total_contributors (4 bytes)
        let total_contributors = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // total_pow (8 bytes)
        let total_pow = u64::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]);
        offset += 8;

        // has_completion_ts (1 byte)
        let has_completion_ts = data[offset] != 0;
        offset += 1;

        // completion_ts (8 bytes if present)
        let pool_completion_timestamp = if has_completion_ts {
            if data.len() < offset + 8 {
                return Err(AttributionError::InvalidWireFormat(
                    "Missing completion timestamp".to_string(),
                ));
            }
            let ts = u64::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
                data[offset + 4],
                data[offset + 5],
                data[offset + 6],
                data[offset + 7],
            ]);
            offset += 8;
            Some(ts)
        } else {
            None
        };

        // contributor_count (1 byte)
        if data.len() < offset + 1 {
            return Err(AttributionError::InvalidWireFormat(
                "Missing contributor count".to_string(),
            ));
        }
        let contributor_count = data[offset] as usize;
        offset += 1;

        // contributors (N × 48 bytes)
        let expected_size = offset + contributor_count * AttributionEntry::WIRE_SIZE;
        if data.len() < expected_size {
            return Err(AttributionError::InvalidWireFormat(format!(
                "Expected {} bytes for {} contributors, got {}",
                expected_size,
                contributor_count,
                data.len()
            )));
        }

        let mut contributors = Vec::with_capacity(contributor_count);
        for _ in 0..contributor_count {
            let mut identity = [0u8; 32];
            identity.copy_from_slice(&data[offset..offset + 32]);
            offset += 32;

            let pow_contributed = u64::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
                data[offset + 4],
                data[offset + 5],
                data[offset + 6],
                data[offset + 7],
            ]);
            offset += 8;

            let first_contribution_timestamp = u64::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
                data[offset + 4],
                data[offset + 5],
                data[offset + 6],
                data[offset + 7],
            ]);
            offset += 8;

            contributors.push(AttributionEntry::new(
                identity,
                pow_contributed,
                first_contribution_timestamp,
            ));
        }

        Ok(Self {
            content_id,
            decay_status,
            days_remaining,
            total_contributors,
            total_pow,
            pool_completion_timestamp,
            contributors,
        })
    }
}

// ============================================================================
// Handler
// ============================================================================

/// Handler for attribution queries.
pub struct AttributionHandler;

impl AttributionHandler {
    /// Handle an attribution query.
    ///
    /// # Arguments
    /// * `payload` - The query payload
    /// * `attribution_manager` - Manager for attribution data
    /// * `pools` - Available engagement pools
    /// * `content` - The content item (for decay calculation)
    /// * `current_time_ms` - Current timestamp
    ///
    /// # Returns
    /// Response payload or error
    pub fn handle_query(
        payload: &AttributionQueryPayload,
        attribution_manager: &mut AttributionManager,
        pools: &[EngagementPool],
        content: Option<&ContentItem>,
        current_time_ms: u64,
    ) -> Result<AttributionResponsePayload, AttributionError> {
        // Get content for decay calculation
        let content = content.ok_or(AttributionError::ContentNotFound)?;

        // Verify content ID matches
        if content.content_id.as_bytes() != &payload.content_id {
            return Err(AttributionError::ContentNotFound);
        }

        // Get attribution
        let attribution =
            attribution_manager.get_attribution(&payload.content_id, pools, current_time_ms);

        // Calculate decay countdown
        let (days, status) = decay_countdown_days(content, current_time_ms, HALF_LIFE_SECS);

        // Get display contributors
        let (display_contributors, _) =
            get_display_contributors(&attribution.contributors, MAX_DISPLAY_CONTRIBUTORS);

        Ok(AttributionResponsePayload {
            content_id: payload.content_id,
            decay_status: status,
            days_remaining: days.unwrap_or(0xFFFF),
            total_contributors: attribution.total_contributors,
            total_pow: attribution.total_pow_contributed,
            pool_completion_timestamp: attribution.pool_completion_timestamp,
            contributors: display_contributors.to_vec(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // Query Payload Tests
    // ========================================================================

    #[test]
    fn test_query_payload_roundtrip() {
        let content_id = [42u8; 32];
        let payload = AttributionQueryPayload::new(content_id);

        let bytes = payload.to_bytes();
        assert_eq!(bytes.len(), AttributionQueryPayload::WIRE_SIZE);

        let restored = AttributionQueryPayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored, payload);
    }

    #[test]
    fn test_query_payload_too_short() {
        let data = [0u8; 16];
        let result = AttributionQueryPayload::from_bytes(&data);
        assert!(matches!(result, Err(AttributionError::InvalidWireFormat(_))));
    }

    // ========================================================================
    // Response Payload Tests
    // ========================================================================

    #[test]
    fn test_response_payload_minimal() {
        let payload = AttributionResponsePayload::new([1u8; 32]);

        let bytes = payload.to_bytes();
        // 32 + 1 + 2 + 4 + 8 + 1 + 1 = 49 bytes (no completion ts, 0 contributors)
        assert_eq!(bytes.len(), 49);

        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored.content_id, payload.content_id);
        assert_eq!(restored.decay_status, DecayStatus::Active);
        assert_eq!(restored.contributors.len(), 0);
    }

    #[test]
    fn test_response_payload_with_completion_ts() {
        let mut payload = AttributionResponsePayload::new([1u8; 32]);
        payload.pool_completion_timestamp = Some(1735689600000);

        let bytes = payload.to_bytes();
        // 49 + 8 = 57 bytes (with completion ts)
        assert_eq!(bytes.len(), 57);

        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored.pool_completion_timestamp, Some(1735689600000));
    }

    #[test]
    fn test_response_payload_with_contributors() {
        let mut payload = AttributionResponsePayload::new([1u8; 32]);
        payload.contributors = vec![
            AttributionEntry::new([10u8; 32], 30, 1000),
            AttributionEntry::new([20u8; 32], 20, 2000),
        ];

        let bytes = payload.to_bytes();
        // 49 + 2*48 = 145 bytes
        assert_eq!(bytes.len(), 145);

        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();
        assert_eq!(restored.contributors.len(), 2);
        assert_eq!(restored.contributors[0].pow_contributed, 30);
        assert_eq!(restored.contributors[1].pow_contributed, 20);
    }

    #[test]
    fn test_response_payload_full_roundtrip() {
        let payload = AttributionResponsePayload {
            content_id: [42u8; 32],
            decay_status: DecayStatus::Active,
            days_remaining: 12,
            total_contributors: 15,
            total_pow: 900,
            pool_completion_timestamp: Some(1735689600000),
            contributors: vec![
                AttributionEntry::new([10u8; 32], 30, 1000),
                AttributionEntry::new([20u8; 32], 20, 2000),
                AttributionEntry::new([30u8; 32], 10, 3000),
            ],
        };

        let bytes = payload.to_bytes();
        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();

        assert_eq!(restored.content_id, payload.content_id);
        assert_eq!(restored.decay_status, payload.decay_status);
        assert_eq!(restored.days_remaining, payload.days_remaining);
        assert_eq!(restored.total_contributors, payload.total_contributors);
        assert_eq!(restored.total_pow, payload.total_pow);
        assert_eq!(
            restored.pool_completion_timestamp,
            payload.pool_completion_timestamp
        );
        assert_eq!(restored.contributors.len(), 3);
    }

    #[test]
    fn test_response_payload_decay_status_protected() {
        let mut payload = AttributionResponsePayload::new([1u8; 32]);
        payload.decay_status = DecayStatus::Protected;
        payload.days_remaining = 0xFFFF;

        let bytes = payload.to_bytes();
        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();

        assert_eq!(restored.decay_status, DecayStatus::Protected);
        assert_eq!(restored.days_remaining, 0xFFFF);
    }

    #[test]
    fn test_response_payload_decay_status_decayed() {
        let mut payload = AttributionResponsePayload::new([1u8; 32]);
        payload.decay_status = DecayStatus::Decayed;
        payload.days_remaining = 0;

        let bytes = payload.to_bytes();
        let restored = AttributionResponsePayload::from_bytes(&bytes).unwrap();

        assert_eq!(restored.decay_status, DecayStatus::Decayed);
        assert_eq!(restored.days_remaining, 0);
    }

    #[test]
    fn test_response_payload_too_short() {
        let data = [0u8; 20];
        let result = AttributionResponsePayload::from_bytes(&data);
        assert!(matches!(result, Err(AttributionError::InvalidWireFormat(_))));
    }

    #[test]
    fn test_response_payload_missing_contributors() {
        // Create valid header but claim 5 contributors without data
        let mut bytes = vec![0u8; 49];
        bytes[48] = 5; // claim 5 contributors

        let result = AttributionResponsePayload::from_bytes(&bytes);
        assert!(matches!(result, Err(AttributionError::InvalidWireFormat(_))));
    }
}
