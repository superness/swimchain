//! Blocklist gossip protocol implementation
//!
//! Implements SPEC_12 Section 4.6: Distributed blocklist synchronization.

use std::collections::{HashMap, HashSet};

use crate::spam_attestation::{SpamAttestation, SpamReason};

use super::bundle::BlocklistBundle;
use super::error::{BlocklistError, BlocklistResult};
use super::types::{
    BlocklistEntry, BlocklistReason, BlocklistRequest, BlocklistSync, BlocklistUpdate,
    BlocklistUpdateType, ILLEGAL_CONTENT_ATTESTATION_THRESHOLD,
};

// === Wire Protocol Message Types (SPEC_12 Section 5.3) ===
// NOTE: Original values (0x55, 0x58, 0x59) conflicted with fork subsystem messages.
// Values 0x85-0x87 conflicted with DHT messages (MSG_DHT_PROVIDERS, MSG_DHT_STORE, MSG_DHT_STORE_ACK).
// Values 0xA0-0xA2 conflicted with branch sync messages (GetBlocksBranch, SubscribeBranch, UnsubscribeBranch).
// Reassigned to 0xB0-0xB2 range to avoid all conflicts.

/// Message type for blocklist update (0xB0)
pub const MSG_BLOCKLIST_UPDATE: u8 = 0xB0;

/// Message type for blocklist sync (0xB1)
pub const MSG_BLOCKLIST_SYNC: u8 = 0xB1;

/// Message type for blocklist request (0xB2)
pub const MSG_BLOCKLIST_REQUEST: u8 = 0xB2;

/// Message type for a signed, versioned blocklist bundle (0xB3)
pub const MSG_BLOCKLIST_BUNDLE: u8 = 0xB3;

/// Maximum age for blocklist updates (24 hours)
pub const BLOCKLIST_UPDATE_MAX_AGE_SECS: u64 = 86_400;

/// Maximum pending attestations before forced eviction (security limit)
pub const MAX_PENDING_ATTESTATIONS: usize = 10_000;

/// Maximum seen-by-peers entries before forced eviction (security limit)
pub const MAX_SEEN_BY_PEERS: usize = 50_000;

/// A pending attestation with its sponsor tree root for Sybil deduplication.
#[derive(Clone)]
struct PendingAttestation {
    attestation: SpamAttestation,
    sponsor_tree_root: [u8; 32],
}

/// Manages blocklist gossip protocol operations.
pub struct BlocklistGossip {
    /// Pending attestations for content not yet reaching threshold
    /// Keyed by content hash, value is list of (attestation, sponsor_tree_root) pairs
    pending_attestations: HashMap<[u8; 32], Vec<PendingAttestation>>,

    /// Peers that have seen each blocklist update (for forwarding decisions)
    seen_by_peers: HashMap<[u8; 32], HashSet<[u8; 32]>>,

    /// Our node's public key
    local_node_id: [u8; 32],
}

impl BlocklistGossip {
    /// Create a new blocklist gossip manager.
    pub fn new(local_node_id: [u8; 32]) -> Self {
        Self {
            pending_attestations: HashMap::new(),
            seen_by_peers: HashMap::new(),
            local_node_id,
        }
    }

    /// Process an incoming illegal content attestation.
    ///
    /// Returns Some(BlocklistUpdate) if the threshold is reached and
    /// a blocklist update should be broadcast.
    pub fn process_attestation(
        &mut self,
        attestation: SpamAttestation,
        sponsor_tree_root: [u8; 32],
        current_time: u64,
    ) -> BlocklistResult<Option<BlocklistUpdate>> {
        // Must be illegal content attestation
        if attestation.reason != SpamReason::IllegalContent {
            return Err(BlocklistError::NotIllegalContentAttestation);
        }

        let content_hash = attestation.content_hash;

        // Get or create pending attestations for this content
        let pending = self
            .pending_attestations
            .entry(content_hash)
            .or_insert_with(Vec::new);

        // Check for duplicate sponsor tree root (Sybil resistance per SPEC_12 §4.4)
        // Attestations from the same sponsor tree count as 1, not N
        for existing in pending.iter() {
            if existing.sponsor_tree_root == sponsor_tree_root {
                return Err(BlocklistError::DuplicateSponsorTree);
            }
        }

        pending.push(PendingAttestation {
            attestation,
            sponsor_tree_root,
        });

        // Check if threshold reached (3 attestations from different sponsor trees)
        if pending.len() >= ILLEGAL_CONTENT_ATTESTATION_THRESHOLD as usize {
            // Collect attestations from unique sponsor trees
            let pending_attestations = std::mem::take(pending);
            self.pending_attestations.remove(&content_hash);

            let attestations: Vec<SpamAttestation> = pending_attestations
                .into_iter()
                .map(|p| p.attestation)
                .collect();

            // Create blocklist update
            let update = BlocklistUpdate {
                update_type: BlocklistUpdateType::Add,
                content_hash,
                reason: BlocklistReason::CSAM, // Default; could be determined by attestation metadata
                reporting_node: self.local_node_id,
                attestations,
                timestamp: current_time,
                signature: [0u8; 64], // Caller must sign
            };

            Ok(Some(update))
        } else {
            Ok(None)
        }
    }

    /// Validate an incoming blocklist update message.
    ///
    /// Verifies:
    /// 1. Timestamp freshness (not older than 24 hours)
    /// 2. Sufficient attestations (minimum 3 required)
    /// 3. All attestations are for illegal content
    /// 4. All attestation content hashes match the update content hash
    /// 5. Ed25519 signature from reporting node
    ///
    /// # Arguments
    /// * `update` - The blocklist update to validate
    /// * `current_time` - Current Unix timestamp
    /// * `verify_signature` - Callback to verify Ed25519 signature (pubkey, message, signature) -> bool
    pub fn validate_update<F>(
        &self,
        update: &BlocklistUpdate,
        current_time: u64,
        verify_signature: F,
    ) -> BlocklistResult<()>
    where
        F: FnOnce(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Check timestamp freshness
        if current_time > update.timestamp
            && current_time - update.timestamp > BLOCKLIST_UPDATE_MAX_AGE_SECS
        {
            return Err(BlocklistError::UpdateTooOld {
                max_age_secs: BLOCKLIST_UPDATE_MAX_AGE_SECS,
            });
        }

        // Check attestation count
        if update.attestations.len() < ILLEGAL_CONTENT_ATTESTATION_THRESHOLD as usize {
            return Err(BlocklistError::InsufficientAttestations {
                required: ILLEGAL_CONTENT_ATTESTATION_THRESHOLD,
                provided: update.attestations.len() as u8,
            });
        }

        // Verify all attestations are for illegal content
        for attestation in &update.attestations {
            if attestation.reason != SpamReason::IllegalContent {
                return Err(BlocklistError::NotIllegalContentAttestation);
            }
            if attestation.content_hash != update.content_hash {
                return Err(BlocklistError::InvalidUpdateMessage(
                    "Attestation content hash mismatch".to_string(),
                ));
            }
        }

        // Verify Ed25519 signature from reporting node
        let signing_message = update.signing_message();
        if !verify_signature(&update.reporting_node, &signing_message, &update.signature) {
            return Err(BlocklistError::InvalidSignature);
        }

        Ok(())
    }

    /// Validate an incoming blocklist update with a trust-anchor fast path.
    ///
    /// Two acceptance paths (SPEC_12 CSAM-seeding workstream A.2):
    ///
    /// 1. **Trust-anchored:** if `update.reporting_node` is in `trusted_keys`
    ///    (the configured list-maintainer set) and the Ed25519 signature is
    ///    valid, the update is accepted *without* community attestations. This
    ///    lets a signed seed entry propagate network-wide without every node
    ///    importing it manually. Freshness is still enforced.
    /// 2. **Community-attested:** otherwise the update must satisfy the existing
    ///    attestation threshold (delegates to [`Self::validate_update`]).
    ///
    /// This keeps "any peer can gossip a blocklist entry" impossible: an
    /// untrusted key still needs the full attestation set.
    pub fn validate_update_with_trust<F>(
        &self,
        update: &BlocklistUpdate,
        current_time: u64,
        trusted_keys: &HashSet<[u8; 32]>,
        verify_signature: F,
    ) -> BlocklistResult<()>
    where
        F: Fn(&[u8; 32], &[u8], &[u8; 64]) -> bool,
    {
        // Freshness applies to both paths.
        if current_time > update.timestamp
            && current_time - update.timestamp > BLOCKLIST_UPDATE_MAX_AGE_SECS
        {
            return Err(BlocklistError::UpdateTooOld {
                max_age_secs: BLOCKLIST_UPDATE_MAX_AGE_SECS,
            });
        }

        // Trust-anchored fast path.
        if trusted_keys.contains(&update.reporting_node) {
            let signing_message = update.signing_message();
            if verify_signature(&update.reporting_node, &signing_message, &update.signature) {
                return Ok(());
            }
            return Err(BlocklistError::InvalidSignature);
        }

        // Otherwise require the community-attestation path.
        self.validate_update(update, current_time, |pk, msg, sig| {
            verify_signature(pk, msg, sig)
        })
    }

    /// Determine which peers should receive a blocklist update.
    ///
    /// Returns peer IDs that haven't seen this update yet.
    pub fn peers_to_forward(
        &mut self,
        content_hash: &[u8; 32],
        all_peers: &[[u8; 32]],
        sender_peer: Option<[u8; 32]>,
    ) -> Vec<[u8; 32]> {
        let seen = self
            .seen_by_peers
            .entry(*content_hash)
            .or_insert_with(HashSet::new);

        // Mark sender as having seen this
        if let Some(sender) = sender_peer {
            seen.insert(sender);
        }

        // Mark ourselves as having seen this
        seen.insert(self.local_node_id);

        // Return peers that haven't seen it
        all_peers
            .iter()
            .filter(|peer| !seen.contains(*peer))
            .copied()
            .collect()
    }

    /// Record that a peer has seen a blocklist update.
    pub fn mark_peer_seen(&mut self, content_hash: &[u8; 32], peer_id: [u8; 32]) {
        self.seen_by_peers
            .entry(*content_hash)
            .or_insert_with(HashSet::new)
            .insert(peer_id);
    }

    /// Get pending attestation count for a content hash.
    pub fn pending_count(&self, content_hash: &[u8; 32]) -> usize {
        self.pending_attestations
            .get(content_hash)
            .map(|v| v.len())
            .unwrap_or(0)
    }

    /// Clear old pending attestations.
    ///
    /// Removes attestations older than max_age_secs and enforces size limit.
    pub fn cleanup_pending(&mut self, current_time: u64, max_age_secs: u64) {
        // First, remove old entries by timestamp
        self.pending_attestations.retain(|_, attestations| {
            attestations.retain(|p| {
                current_time <= p.attestation.timestamp
                    || current_time - p.attestation.timestamp <= max_age_secs
            });
            !attestations.is_empty()
        });

        // Then, enforce size limit (LRU-like: remove oldest half if over limit)
        if self.pending_attestations.len() > MAX_PENDING_ATTESTATIONS {
            let to_remove: Vec<_> = self
                .pending_attestations
                .keys()
                .take(MAX_PENDING_ATTESTATIONS / 2)
                .copied()
                .collect();
            for key in to_remove {
                self.pending_attestations.remove(&key);
            }
        }
    }

    /// Clear old seen-by-peers tracking data.
    pub fn cleanup_seen(&mut self, max_entries: usize) {
        // Simple LRU-like cleanup: if we have too many entries, remove half
        if self.seen_by_peers.len() > max_entries {
            let to_remove: Vec<_> = self
                .seen_by_peers
                .keys()
                .take(max_entries / 2)
                .copied()
                .collect();
            for key in to_remove {
                self.seen_by_peers.remove(&key);
            }
        }
    }
}

/// Create a blocklist entry from a validated update.
pub fn entry_from_update(update: &BlocklistUpdate) -> BlocklistEntry {
    BlocklistEntry::new(
        update.content_hash,
        update.reason,
        update.attestations.clone(),
        update.reporting_node,
        update.timestamp,
    )
}

/// Parse a blocklist gossip message.
pub fn parse_blocklist_message(msg_type: u8, payload: &[u8]) -> BlocklistResult<BlocklistMessage> {
    match msg_type {
        MSG_BLOCKLIST_UPDATE => {
            let update = BlocklistUpdate::from_bytes(payload).ok_or_else(|| {
                BlocklistError::InvalidUpdateMessage("Failed to parse update".to_string())
            })?;
            Ok(BlocklistMessage::Update(update))
        }
        MSG_BLOCKLIST_SYNC => {
            let sync = BlocklistSync::from_bytes(payload).ok_or_else(|| {
                BlocklistError::InvalidUpdateMessage("Failed to parse sync".to_string())
            })?;
            Ok(BlocklistMessage::Sync(sync))
        }
        MSG_BLOCKLIST_REQUEST => {
            let request = BlocklistRequest::from_bytes(payload).ok_or_else(|| {
                BlocklistError::InvalidUpdateMessage("Failed to parse request".to_string())
            })?;
            Ok(BlocklistMessage::Request(request))
        }
        MSG_BLOCKLIST_BUNDLE => {
            let bundle = BlocklistBundle::from_bytes(payload).ok_or_else(|| {
                BlocklistError::InvalidUpdateMessage("Failed to parse bundle".to_string())
            })?;
            Ok(BlocklistMessage::Bundle(bundle))
        }
        _ => Err(BlocklistError::InvalidUpdateMessage(format!(
            "Unknown message type: 0x{:02X}",
            msg_type
        ))),
    }
}

/// Blocklist gossip message variants.
#[derive(Debug, Clone)]
pub enum BlocklistMessage {
    /// Blocklist update (add or remove)
    Update(BlocklistUpdate),
    /// Blocklist sync (Merkle root exchange)
    Sync(BlocklistSync),
    /// Request for specific blocklist entries
    Request(BlocklistRequest),
    /// Signed, versioned bundle of blocklist entries
    Bundle(BlocklistBundle),
}

impl BlocklistMessage {
    /// Get the message type byte.
    pub fn msg_type(&self) -> u8 {
        match self {
            Self::Update(_) => MSG_BLOCKLIST_UPDATE,
            Self::Sync(_) => MSG_BLOCKLIST_SYNC,
            Self::Request(_) => MSG_BLOCKLIST_REQUEST,
            Self::Bundle(_) => MSG_BLOCKLIST_BUNDLE,
        }
    }

    /// Serialize to bytes (without message type prefix).
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            Self::Update(u) => u.to_bytes(),
            Self::Sync(s) => s.to_bytes(),
            Self::Request(r) => r.to_bytes(),
            Self::Bundle(b) => b.to_bytes(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_illegal_attestation(attester_seed: u8, content_hash: [u8; 32]) -> SpamAttestation {
        SpamAttestation {
            content_hash,
            attester: [attester_seed; 32],
            reason: SpamReason::IllegalContent,
            timestamp: 1735689600,
            pow_nonce: 12345,
            signature: [attester_seed + 100; 64],
        }
    }

    #[test]
    fn test_gossip_creation() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        assert_eq!(gossip.local_node_id, [1u8; 32]);
    }

    #[test]
    fn test_process_single_attestation() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let attestation = make_illegal_attestation(1, content_hash);

        let result = gossip
            .process_attestation(attestation, [100u8; 32], 1735689600)
            .unwrap();

        // Single attestation shouldn't trigger update
        assert!(result.is_none());
        assert_eq!(gossip.pending_count(&content_hash), 1);
    }

    #[test]
    fn test_process_threshold_attestations() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        // Add attestations until threshold
        for i in 1..=3 {
            let attestation = make_illegal_attestation(i, content_hash);
            let result = gossip
                .process_attestation(attestation, [100 + i; 32], 1735689600)
                .unwrap();

            if i < 3 {
                assert!(result.is_none());
            } else {
                // Third attestation triggers update
                let update = result.expect("Should have update");
                assert_eq!(update.content_hash, content_hash);
                assert_eq!(update.attestations.len(), 3);
                assert_eq!(update.update_type, BlocklistUpdateType::Add);
            }
        }

        // Pending should be cleared after threshold reached
        assert_eq!(gossip.pending_count(&content_hash), 0);
    }

    #[test]
    fn test_reject_non_illegal_attestation() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let attestation = SpamAttestation {
            content_hash: [10u8; 32],
            attester: [1u8; 32],
            reason: SpamReason::Advertising, // Not illegal content
            timestamp: 1735689600,
            pow_nonce: 12345,
            signature: [3u8; 64],
        };

        let result = gossip.process_attestation(attestation, [100u8; 32], 1735689600);
        assert!(matches!(
            result,
            Err(BlocklistError::NotIllegalContentAttestation)
        ));
    }

    #[test]
    fn test_reject_duplicate_attester() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let attestation = make_illegal_attestation(1, content_hash);

        // First attestation succeeds
        gossip
            .process_attestation(attestation.clone(), [100u8; 32], 1735689600)
            .unwrap();

        // Duplicate should fail
        let result = gossip.process_attestation(attestation, [100u8; 32], 1735689600);
        assert!(matches!(result, Err(BlocklistError::DuplicateSponsorTree)));
    }

    #[test]
    fn test_validate_update() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
                make_illegal_attestation(3, content_hash),
            ],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        // Valid signature callback
        let result = gossip.validate_update(&update, 1735689600, |_, _, _| true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_trust_anchored_update_bypasses_attestations() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let maintainer = [77u8; 32];

        // Zero attestations — would fail the community path.
        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: maintainer,
            attestations: vec![],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        let mut trusted = HashSet::new();
        trusted.insert(maintainer);

        // Trusted key + valid sig → accepted despite no attestations.
        let ok = gossip.validate_update_with_trust(&update, 1735689600, &trusted, |_, _, _| true);
        assert!(ok.is_ok());

        // Trusted key but bad sig → rejected.
        let bad = gossip.validate_update_with_trust(&update, 1735689600, &trusted, |_, _, _| false);
        assert!(matches!(bad, Err(BlocklistError::InvalidSignature)));
    }

    #[test]
    fn test_untrusted_update_still_requires_attestations() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        // Untrusted reporter with zero attestations → must be rejected even
        // with a valid signature.
        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        let trusted = HashSet::new(); // empty: nobody trusted
        let res = gossip.validate_update_with_trust(&update, 1735689600, &trusted, |_, _, _| true);
        assert!(matches!(
            res,
            Err(BlocklistError::InsufficientAttestations { .. })
        ));
    }

    #[test]
    fn test_validate_update_invalid_signature() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
                make_illegal_attestation(3, content_hash),
            ],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        // Invalid signature callback
        let result = gossip.validate_update(&update, 1735689600, |_, _, _| false);
        assert!(matches!(result, Err(BlocklistError::InvalidSignature)));
    }

    #[test]
    fn test_validate_update_signature_uses_correct_data() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let reporting_node = [2u8; 32];
        let signature = [4u8; 64];

        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node,
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
                make_illegal_attestation(3, content_hash),
            ],
            timestamp: 1735689600,
            signature,
        };

        // Verify the callback receives correct parameters
        let expected_signing_message = update.signing_message();
        let result = gossip.validate_update(&update, 1735689600, |pubkey, msg, sig| {
            assert_eq!(pubkey, &reporting_node);
            assert_eq!(msg, expected_signing_message.as_slice());
            assert_eq!(sig, &signature);
            true
        });
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_update_too_old() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
                make_illegal_attestation(3, content_hash),
            ],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        // Current time is more than 24 hours later
        // Signature check is not reached because timestamp fails first
        let result = gossip.validate_update(&update, 1735689600 + 100_000, |_, _, _| true);
        assert!(matches!(result, Err(BlocklistError::UpdateTooOld { .. })));
    }

    #[test]
    fn test_validate_update_insufficient_attestations() {
        let gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
                // Only 2 attestations, need 3
            ],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        // Signature check is not reached because attestation count fails first
        let result = gossip.validate_update(&update, 1735689600, |_, _, _| true);
        assert!(matches!(
            result,
            Err(BlocklistError::InsufficientAttestations { .. })
        ));
    }

    #[test]
    fn test_peers_to_forward() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let all_peers = [[2u8; 32], [3u8; 32], [4u8; 32]];

        // First call: sender is peer 2
        let to_forward = gossip.peers_to_forward(&content_hash, &all_peers, Some([2u8; 32]));
        assert_eq!(to_forward.len(), 2); // peers 3 and 4
        assert!(!to_forward.contains(&[2u8; 32]));
        assert!(!to_forward.contains(&[1u8; 32])); // local node

        // Second call: peer 3 also seen
        gossip.mark_peer_seen(&content_hash, [3u8; 32]);
        let to_forward = gossip.peers_to_forward(&content_hash, &all_peers, None);
        assert_eq!(to_forward.len(), 1); // only peer 4
        assert!(to_forward.contains(&[4u8; 32]));
    }

    #[test]
    fn test_parse_blocklist_message() {
        let content_hash = [10u8; 32];
        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::CSAM,
            reporting_node: [2u8; 32],
            attestations: vec![make_illegal_attestation(1, content_hash)],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        let bytes = update.to_bytes();
        let parsed = parse_blocklist_message(MSG_BLOCKLIST_UPDATE, &bytes).unwrap();

        match parsed {
            BlocklistMessage::Update(u) => {
                assert_eq!(u.content_hash, content_hash);
            }
            _ => panic!("Expected Update message"),
        }
    }

    #[test]
    fn test_entry_from_update() {
        let content_hash = [10u8; 32];
        let update = BlocklistUpdate {
            update_type: BlocklistUpdateType::Add,
            content_hash,
            reason: BlocklistReason::Terrorism,
            reporting_node: [2u8; 32],
            attestations: vec![
                make_illegal_attestation(1, content_hash),
                make_illegal_attestation(2, content_hash),
            ],
            timestamp: 1735689600,
            signature: [4u8; 64],
        };

        let entry = entry_from_update(&update);
        assert_eq!(entry.content_hash, content_hash);
        assert_eq!(entry.reason, BlocklistReason::Terrorism);
        assert_eq!(entry.attestations.len(), 2);
        assert_eq!(entry.source_node, [2u8; 32]);
        assert_eq!(entry.propagation_confirmations, 1);
    }

    #[test]
    fn test_cleanup_pending() {
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        // Add an old attestation
        let old_attestation = SpamAttestation {
            content_hash,
            attester: [1u8; 32],
            reason: SpamReason::IllegalContent,
            timestamp: 1000, // Old timestamp
            pow_nonce: 12345,
            signature: [3u8; 64],
        };

        gossip.pending_attestations.insert(
            content_hash,
            vec![PendingAttestation {
                attestation: old_attestation,
                sponsor_tree_root: [1u8; 32],
            }],
        );

        // Cleanup with current time much later
        gossip.cleanup_pending(1735689600, 86400);

        // Old attestation should be removed
        assert_eq!(gossip.pending_count(&content_hash), 0);
    }

    #[test]
    fn test_sybil_resistance_same_sponsor_tree() {
        // Two attesters under the same sponsor tree root should count as 1
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];
        let shared_tree_root = [100u8; 32];

        // First attester from tree root 100
        let attestation1 = make_illegal_attestation(1, content_hash);
        gossip
            .process_attestation(attestation1, shared_tree_root, 1735689600)
            .unwrap();

        assert_eq!(gossip.pending_count(&content_hash), 1);

        // Second attester also from tree root 100 - should be rejected
        let attestation2 = make_illegal_attestation(2, content_hash);
        let result = gossip.process_attestation(attestation2, shared_tree_root, 1735689600);

        assert!(matches!(result, Err(BlocklistError::DuplicateSponsorTree)));
        assert_eq!(gossip.pending_count(&content_hash), 1); // Still 1
    }

    #[test]
    fn test_sybil_resistance_different_sponsor_trees() {
        // Attesters from different sponsor trees should all be counted
        let mut gossip = BlocklistGossip::new([1u8; 32]);
        let content_hash = [10u8; 32];

        // Three attesters from three different sponsor tree roots
        let attestation1 = make_illegal_attestation(1, content_hash);
        let attestation2 = make_illegal_attestation(2, content_hash);
        let attestation3 = make_illegal_attestation(3, content_hash);

        // Different sponsor tree roots
        let tree_root1 = [100u8; 32];
        let tree_root2 = [101u8; 32];
        let tree_root3 = [102u8; 32];

        gossip
            .process_attestation(attestation1, tree_root1, 1735689600)
            .unwrap();
        assert_eq!(gossip.pending_count(&content_hash), 1);

        gossip
            .process_attestation(attestation2, tree_root2, 1735689600)
            .unwrap();
        assert_eq!(gossip.pending_count(&content_hash), 2);

        // Third attestation reaches threshold, returns update
        let result = gossip
            .process_attestation(attestation3, tree_root3, 1735689600)
            .unwrap();

        assert!(result.is_some());
        let update = result.unwrap();
        assert_eq!(update.attestations.len(), 3);

        // Pending should be cleared
        assert_eq!(gossip.pending_count(&content_hash), 0);
    }
}
