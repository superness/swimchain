//! Blocklist type definitions
//!
//! Defines BlocklistEntry, BlocklistReason, and related structures per SPEC_12 Section 3.6.

use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;
use std::fmt;

use crate::spam_attestation::SpamAttestation;

// === SPEC_12 Constants ===

/// Minimum confirmations for a blocklist entry to be considered confirmed (SPEC_12 §4.6)
pub const MIN_BLOCKLIST_CONFIRMATIONS: u32 = 10;

/// Blocklist sync interval in seconds (1 hour) (SPEC_12 §4.6)
pub const BLOCKLIST_SYNC_INTERVAL_SECS: u64 = 3600;

/// Number of illegal content attestations required to trigger blocklist addition (SPEC_12 §4.4)
pub const ILLEGAL_CONTENT_ATTESTATION_THRESHOLD: u8 = 3;

/// Number of Anchor-level counter-attestations required to remove from blocklist (SPEC_12 §4.6)
pub const BLOCKLIST_REMOVAL_THRESHOLD: u8 = 5;

/// Maximum attestations allowed in a single BlocklistUpdate message (security limit)
/// Prevents memory exhaustion via crafted messages with excessive attestations.
pub const MAX_ATTESTATIONS_PER_UPDATE: usize = 100;

/// Maximum hashes allowed in a single BlocklistRequest message (security limit)
/// Prevents memory exhaustion via crafted request messages.
pub const MAX_HASHES_PER_REQUEST: usize = 1000;

/// Reason for blocklist entry per SPEC_12 Section 3.6.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BlocklistReason {
    /// Child sexual abuse material
    CSAM = 0x01,

    /// Terrorism-related content
    Terrorism = 0x02,

    /// Content from known external databases (e.g., NCMEC)
    ExternalList = 0x03,
}

impl BlocklistReason {
    /// Convert from u8 representation.
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0x01 => Some(Self::CSAM),
            0x02 => Some(Self::Terrorism),
            0x03 => Some(Self::ExternalList),
            _ => None,
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::CSAM => "CSAM",
            Self::Terrorism => "Terrorism",
            Self::ExternalList => "External List",
        }
    }

    /// Get description of this reason.
    pub fn description(&self) -> &'static str {
        match self {
            Self::CSAM => "Child sexual abuse material",
            Self::Terrorism => "Terrorism-related content",
            Self::ExternalList => "Content from known external database",
        }
    }

    /// Get all blocklist reasons.
    pub fn all() -> &'static [BlocklistReason] {
        &[Self::CSAM, Self::Terrorism, Self::ExternalList]
    }
}

impl fmt::Display for BlocklistReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

/// Blocklist entry per SPEC_12 Section 3.6.
///
/// Represents a content hash that has been identified as illegal content
/// and should be rejected by all nodes in the network.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlocklistEntry {
    /// SHA-256 hash of the blocked content
    pub content_hash: [u8; 32],

    /// Reason for blocking
    pub reason: BlocklistReason,

    /// Attestations that triggered the blocklist entry
    pub attestations: Vec<SpamAttestation>,

    /// Unix timestamp when first added to blocklist
    pub added_at: u64,

    /// Public key of node that first reported
    pub source_node: [u8; 32],

    /// Number of nodes that confirmed receipt
    pub propagation_confirmations: u32,
}

impl BlocklistEntry {
    /// Create a new blocklist entry.
    pub fn new(
        content_hash: [u8; 32],
        reason: BlocklistReason,
        attestations: Vec<SpamAttestation>,
        source_node: [u8; 32],
        timestamp: u64,
    ) -> Self {
        Self {
            content_hash,
            reason,
            attestations,
            added_at: timestamp,
            source_node,
            propagation_confirmations: 1, // Source node counts as first confirmation
        }
    }

    /// Check if this entry is confirmed (has enough propagation confirmations).
    pub fn is_confirmed(&self) -> bool {
        self.propagation_confirmations >= MIN_BLOCKLIST_CONFIRMATIONS
    }

    /// Increment the propagation confirmation count.
    pub fn confirm(&mut self) {
        self.propagation_confirmations = self.propagation_confirmations.saturating_add(1);
    }

    /// Get the number of attestations.
    pub fn attestation_count(&self) -> usize {
        self.attestations.len()
    }
}

/// Update type for blocklist messages.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BlocklistUpdateType {
    /// Add content hash to blocklist
    Add = 0x01,

    /// Remove content hash from blocklist (requires Anchor-level counter-attestation)
    Remove = 0x02,
}

impl BlocklistUpdateType {
    /// Convert from u8 representation.
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0x01 => Some(Self::Add),
            0x02 => Some(Self::Remove),
            _ => None,
        }
    }

    /// Convert to u8 representation.
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }
}

/// Blocklist update message per SPEC_12 Section 5.4.
///
/// Sent when a node adds or removes content from its blocklist,
/// to propagate the update across the network.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlocklistUpdate {
    /// Type of update (add or remove)
    pub update_type: BlocklistUpdateType,

    /// Hash of content being added/removed
    pub content_hash: [u8; 32],

    /// Reason for the blocklist action
    pub reason: BlocklistReason,

    /// Public key of the reporting node
    pub reporting_node: [u8; 32],

    /// Attestations supporting this update
    pub attestations: Vec<SpamAttestation>,

    /// Unix timestamp of this update
    pub timestamp: u64,

    /// Ed25519 signature from reporting node
    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
}

impl BlocklistUpdate {
    /// Create signing message for this update.
    pub fn signing_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(128);
        msg.extend_from_slice(b"BLOCKLIST_UPDATE");
        msg.push(self.update_type.as_u8());
        msg.extend_from_slice(&self.content_hash);
        msg.push(self.reason.as_u8());
        msg.extend_from_slice(&self.timestamp.to_le_bytes());
        // Include attestation count for integrity
        msg.extend_from_slice(&(self.attestations.len() as u32).to_le_bytes());
        msg
    }

    /// Serialize to bytes for network transmission.
    pub fn to_bytes(&self) -> Vec<u8> {
        let attestation_bytes: Vec<u8> = self
            .attestations
            .iter()
            .flat_map(|a| a.to_bytes())
            .collect();

        let mut bytes = Vec::with_capacity(1 + 32 + 1 + 32 + 2 + attestation_bytes.len() + 8 + 64);
        bytes.push(self.update_type.as_u8());
        bytes.extend_from_slice(&self.content_hash);
        bytes.push(self.reason.as_u8());
        bytes.extend_from_slice(&self.reporting_node);
        bytes.extend_from_slice(&(self.attestations.len() as u16).to_le_bytes());
        bytes.extend_from_slice(&attestation_bytes);
        bytes.extend_from_slice(&self.timestamp.to_le_bytes());
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 1 + 32 + 1 + 32 + 2 + 8 + 64 {
            return None;
        }

        let update_type = BlocklistUpdateType::from_u8(bytes[0])?;

        let mut content_hash = [0u8; 32];
        content_hash.copy_from_slice(&bytes[1..33]);

        let reason = BlocklistReason::from_u8(bytes[33])?;

        let mut reporting_node = [0u8; 32];
        reporting_node.copy_from_slice(&bytes[34..66]);

        let attestation_count = u16::from_le_bytes(bytes[66..68].try_into().ok()?) as usize;

        // Security: reject messages with excessive attestations to prevent memory exhaustion
        if attestation_count > MAX_ATTESTATIONS_PER_UPDATE {
            return None;
        }

        let attestation_size = SpamAttestation::SERIALIZED_SIZE;
        let attestation_bytes_len = attestation_count * attestation_size;

        if bytes.len() < 68 + attestation_bytes_len + 8 + 64 {
            return None;
        }

        let mut attestations = Vec::with_capacity(attestation_count);
        for i in 0..attestation_count {
            let start = 68 + i * attestation_size;
            let end = start + attestation_size;
            let attestation = SpamAttestation::from_bytes(&bytes[start..end])?;
            attestations.push(attestation);
        }

        let ts_start = 68 + attestation_bytes_len;
        let timestamp = u64::from_le_bytes(bytes[ts_start..ts_start + 8].try_into().ok()?);

        let sig_start = ts_start + 8;
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[sig_start..sig_start + 64]);

        Some(Self {
            update_type,
            content_hash,
            reason,
            reporting_node,
            attestations,
            timestamp,
            signature,
        })
    }
}

/// Blocklist sync message per SPEC_12 Section 5.5.
///
/// Used for periodic synchronization of blocklist Merkle roots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlocklistSync {
    /// Number of entries in the sender's blocklist
    pub entry_count: u32,

    /// Merkle root of the blocklist
    pub merkle_root: [u8; 32],

    /// Timestamp of last blocklist update
    pub last_update: u64,

    /// Ed25519 signature from sending node
    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
}

impl BlocklistSync {
    /// Serialized size in bytes.
    pub const SERIALIZED_SIZE: usize = 4 + 32 + 8 + 64; // 108 bytes

    /// Create signing message.
    pub fn signing_message(&self) -> Vec<u8> {
        let mut msg = Vec::with_capacity(60);
        msg.extend_from_slice(b"BLOCKLIST_SYNC");
        msg.extend_from_slice(&self.entry_count.to_le_bytes());
        msg.extend_from_slice(&self.merkle_root);
        msg.extend_from_slice(&self.last_update.to_le_bytes());
        msg
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::SERIALIZED_SIZE);
        bytes.extend_from_slice(&self.entry_count.to_le_bytes());
        bytes.extend_from_slice(&self.merkle_root);
        bytes.extend_from_slice(&self.last_update.to_le_bytes());
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::SERIALIZED_SIZE {
            return None;
        }

        let entry_count = u32::from_le_bytes(bytes[0..4].try_into().ok()?);

        let mut merkle_root = [0u8; 32];
        merkle_root.copy_from_slice(&bytes[4..36]);

        let last_update = u64::from_le_bytes(bytes[36..44].try_into().ok()?);

        let mut signature = [0u8; 64];
        signature.copy_from_slice(&bytes[44..108]);

        Some(Self {
            entry_count,
            merkle_root,
            last_update,
            signature,
        })
    }
}

/// Request for specific blocklist entries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlocklistRequest {
    /// Hashes being requested (empty means request all)
    pub requested_hashes: Vec<[u8; 32]>,

    /// Request entries added after this timestamp (0 = all)
    pub since_timestamp: u64,
}

impl BlocklistRequest {
    /// Create a request for all entries since a timestamp.
    pub fn since(timestamp: u64) -> Self {
        Self {
            requested_hashes: Vec::new(),
            since_timestamp: timestamp,
        }
    }

    /// Create a request for specific hashes.
    pub fn for_hashes(hashes: Vec<[u8; 32]>) -> Self {
        Self {
            requested_hashes: hashes,
            since_timestamp: 0,
        }
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(8 + 4 + self.requested_hashes.len() * 32);
        bytes.extend_from_slice(&self.since_timestamp.to_le_bytes());
        bytes.extend_from_slice(&(self.requested_hashes.len() as u32).to_le_bytes());
        for hash in &self.requested_hashes {
            bytes.extend_from_slice(hash);
        }
        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 12 {
            return None;
        }

        let since_timestamp = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
        let hash_count = u32::from_le_bytes(bytes[8..12].try_into().ok()?) as usize;

        // Security: reject requests with excessive hashes to prevent memory exhaustion
        if hash_count > MAX_HASHES_PER_REQUEST {
            return None;
        }

        if bytes.len() < 12 + hash_count * 32 {
            return None;
        }

        let mut requested_hashes = Vec::with_capacity(hash_count);
        for i in 0..hash_count {
            let start = 12 + i * 32;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&bytes[start..start + 32]);
            requested_hashes.push(hash);
        }

        Some(Self {
            requested_hashes,
            since_timestamp,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spam_attestation::SpamReason;

    fn make_attestation() -> SpamAttestation {
        SpamAttestation {
            content_hash: [1u8; 32],
            attester: [2u8; 32],
            reason: SpamReason::IllegalContent,
            timestamp: 1735689600,
            pow_nonce: 12345,
            signature: [3u8; 64],
        }
    }

    #[test]
    fn test_blocklist_reason_roundtrip() {
        for reason in BlocklistReason::all() {
            let val = reason.as_u8();
            let restored = BlocklistReason::from_u8(val).unwrap();
            assert_eq!(*reason, restored);
        }
    }

    #[test]
    fn test_blocklist_reason_invalid() {
        assert!(BlocklistReason::from_u8(0x00).is_none());
        assert!(BlocklistReason::from_u8(0x04).is_none());
        assert!(BlocklistReason::from_u8(0xFF).is_none());
    }

    #[test]
    fn test_blocklist_entry_creation() {
        let attestations = vec![make_attestation()];
        let entry = BlocklistEntry::new(
            [1u8; 32],
            BlocklistReason::CSAM,
            attestations,
            [2u8; 32],
            1735689600,
        );

        assert_eq!(entry.content_hash, [1u8; 32]);
        assert_eq!(entry.reason, BlocklistReason::CSAM);
        assert_eq!(entry.attestation_count(), 1);
        assert_eq!(entry.propagation_confirmations, 1);
        assert!(!entry.is_confirmed()); // Needs 10 confirmations
    }

    #[test]
    fn test_blocklist_entry_confirmation() {
        let mut entry = BlocklistEntry::new(
            [1u8; 32],
            BlocklistReason::CSAM,
            vec![make_attestation()],
            [2u8; 32],
            1735689600,
        );

        assert!(!entry.is_confirmed());

        // Add 9 more confirmations
        for _ in 0..9 {
            entry.confirm();
        }

        assert!(entry.is_confirmed());
        assert_eq!(entry.propagation_confirmations, 10);
    }

    #[test]
    fn test_blocklist_update_type_roundtrip() {
        assert_eq!(
            BlocklistUpdateType::from_u8(0x01),
            Some(BlocklistUpdateType::Add)
        );
        assert_eq!(
            BlocklistUpdateType::from_u8(0x02),
            Some(BlocklistUpdateType::Remove)
        );
        assert!(BlocklistUpdateType::from_u8(0x00).is_none());
    }

    #[test]
    fn test_blocklist_update_serialization() {
        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash: [1u8; 32],
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![make_attestation()],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        let bytes = update.to_bytes();
        let restored = BlocklistUpdate::from_bytes(&bytes).unwrap();

        assert_eq!(update.update_type, restored.update_type);
        assert_eq!(update.content_hash, restored.content_hash);
        assert_eq!(update.reason, restored.reason);
        assert_eq!(update.reporting_node, restored.reporting_node);
        assert_eq!(update.attestations.len(), restored.attestations.len());
        assert_eq!(update.timestamp, restored.timestamp);
        assert_eq!(update.signature, restored.signature);
    }

    #[test]
    fn test_blocklist_sync_serialization() {
        let sync = BlocklistSync {
            entry_count: 42,
            merkle_root: [5u8; 32],
            last_update: 1735689600,
            signature: [6u8; 64],
        };

        let bytes = sync.to_bytes();
        assert_eq!(bytes.len(), BlocklistSync::SERIALIZED_SIZE);

        let restored = BlocklistSync::from_bytes(&bytes).unwrap();
        assert_eq!(sync.entry_count, restored.entry_count);
        assert_eq!(sync.merkle_root, restored.merkle_root);
        assert_eq!(sync.last_update, restored.last_update);
        assert_eq!(sync.signature, restored.signature);
    }

    #[test]
    fn test_blocklist_request_serialization() {
        let request = BlocklistRequest {
            requested_hashes: vec![[1u8; 32], [2u8; 32]],
            since_timestamp: 1735689600,
        };

        let bytes = request.to_bytes();
        let restored = BlocklistRequest::from_bytes(&bytes).unwrap();

        assert_eq!(request.since_timestamp, restored.since_timestamp);
        assert_eq!(request.requested_hashes.len(), restored.requested_hashes.len());
        assert_eq!(request.requested_hashes[0], restored.requested_hashes[0]);
        assert_eq!(request.requested_hashes[1], restored.requested_hashes[1]);
    }

    #[test]
    fn test_blocklist_request_since() {
        let request = BlocklistRequest::since(1735689600);
        assert!(request.requested_hashes.is_empty());
        assert_eq!(request.since_timestamp, 1735689600);
    }

    #[test]
    fn test_blocklist_request_for_hashes() {
        let hashes = vec![[1u8; 32], [2u8; 32]];
        let request = BlocklistRequest::for_hashes(hashes.clone());
        assert_eq!(request.requested_hashes, hashes);
        assert_eq!(request.since_timestamp, 0);
    }

    #[test]
    fn test_constants() {
        assert_eq!(MIN_BLOCKLIST_CONFIRMATIONS, 10);
        assert_eq!(BLOCKLIST_SYNC_INTERVAL_SECS, 3600);
        assert_eq!(ILLEGAL_CONTENT_ATTESTATION_THRESHOLD, 3);
        assert_eq!(BLOCKLIST_REMOVAL_THRESHOLD, 5);
    }
}
