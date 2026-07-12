//! Availability announcements (SPEC_07 - Milestone 3.5)
//!
//! Handles gossip-based content availability announcements.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::storage::blob::ContentBlobHash;
use crate::types::constants::{
    AVAILABILITY_ANNOUNCE_BATCH_SIZE, AVAILABILITY_MAX_PENDING_PER_SPACE,
    AVAILABILITY_MAX_TTL_SECS, AVAILABILITY_REANNOUNCE_SECS,
};
use crate::types::content::SpaceId;

use super::manager::SeedingManager;

/// AVAILABILITY_ANNOUNCE payload (SPEC_07 §6)
///
/// Announces content availability for a space.
/// Wire format (little-endian):
/// - space_id: 32 bytes
/// - expires_at: 8 bytes (u64, UNIX seconds)
/// - count: 2 bytes (u16, max 100)
/// - hashes: 32 * count bytes
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvailabilityAnnouncePayload {
    /// Space the content belongs to
    pub space_id: [u8; 32],
    /// When this announcement expires (UNIX seconds)
    pub expires_at: u64,
    /// Content hashes being announced (max AVAILABILITY_ANNOUNCE_BATCH_SIZE)
    pub hashes: Vec<[u8; 32]>,
}

impl AvailabilityAnnouncePayload {
    /// Create a new payload
    #[must_use]
    pub fn new(space_id: SpaceId, expires_at: u64, hashes: Vec<ContentBlobHash>) -> Self {
        Self {
            space_id: space_id.0,
            expires_at,
            hashes: hashes.iter().map(|h| *h.as_bytes()).collect(),
        }
    }

    /// Wire format size for serialization
    #[must_use]
    pub fn wire_size(&self) -> usize {
        32 + 8 + 2 + (self.hashes.len() * 32)
    }

    /// Serialize to wire format (little-endian)
    #[must_use]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.wire_size());

        buf.extend_from_slice(&self.space_id);
        buf.extend_from_slice(&self.expires_at.to_le_bytes());
        buf.extend_from_slice(&(self.hashes.len() as u16).to_le_bytes());

        for hash in &self.hashes {
            buf.extend_from_slice(hash);
        }

        buf
    }

    /// Deserialize from wire format
    ///
    /// # Errors
    ///
    /// Returns None if data is malformed or expires_at exceeds max TTL.
    #[must_use]
    pub fn deserialize(data: &[u8]) -> Option<Self> {
        if data.len() < 42 {
            return None;
        }

        let space_id: [u8; 32] = data[0..32].try_into().ok()?;
        let expires_at = u64::from_le_bytes(data[32..40].try_into().ok()?);
        let count = u16::from_le_bytes(data[40..42].try_into().ok()?) as usize;

        // Validate expires_at is not excessively far in the future
        let now = current_timestamp();
        let max_expires = now.saturating_add(AVAILABILITY_MAX_TTL_SECS);
        if expires_at > max_expires {
            return None;
        }

        if count > AVAILABILITY_ANNOUNCE_BATCH_SIZE {
            return None;
        }

        let expected_len = 42 + count * 32;
        if data.len() < expected_len {
            return None;
        }

        let mut hashes = Vec::with_capacity(count);
        for i in 0..count {
            let start = 42 + i * 32;
            let hash: [u8; 32] = data[start..start + 32].try_into().ok()?;
            hashes.push(hash);
        }

        Some(Self {
            space_id,
            expires_at,
            hashes,
        })
    }

    /// Check if announcement has expired
    #[must_use]
    pub fn is_expired(&self) -> bool {
        let now = current_timestamp();
        self.expires_at < now
    }

    /// Get the space ID
    #[must_use]
    pub fn space_id(&self) -> SpaceId {
        SpaceId::from_bytes(self.space_id)
    }

    /// Get content hashes
    pub fn content_hashes(&self) -> impl Iterator<Item = ContentBlobHash> + '_ {
        self.hashes.iter().map(|h| ContentBlobHash::from_bytes(*h))
    }
}

/// Handles availability announcements (SPEC_07 §6)
pub struct AvailabilityHandler {
    seeding_manager: Arc<SeedingManager>,
    /// Last announcement time per space
    last_announced: RwLock<HashMap<SpaceId, Instant>>,
    /// Pending hashes to announce (queued on content storage)
    pending_announcements: RwLock<HashMap<SpaceId, Vec<ContentBlobHash>>>,
}

impl AvailabilityHandler {
    /// Create a new availability handler
    #[must_use]
    pub fn new(seeding_manager: Arc<SeedingManager>) -> Self {
        Self {
            seeding_manager,
            last_announced: RwLock::new(HashMap::new()),
            pending_announcements: RwLock::new(HashMap::new()),
        }
    }

    /// Queue hash for next announcement batch
    ///
    /// Called when new content is stored locally.
    /// Enforces `AVAILABILITY_MAX_PENDING_PER_SPACE` limit with oldest-eviction.
    pub fn on_content_stored(&self, hash: ContentBlobHash, space_id: SpaceId) {
        if let Ok(mut pending) = self.pending_announcements.write() {
            let hashes = pending.entry(space_id).or_default();
            hashes.push(hash);
            // Evict oldest if over limit
            if hashes.len() > AVAILABILITY_MAX_PENDING_PER_SPACE {
                let excess = hashes.len() - AVAILABILITY_MAX_PENDING_PER_SPACE;
                hashes.drain(0..excess);
            }
        }
    }

    /// Queue multiple hashes for next announcement batch
    ///
    /// Enforces `AVAILABILITY_MAX_PENDING_PER_SPACE` limit with oldest-eviction.
    pub fn on_contents_stored(&self, hashes: &[ContentBlobHash], space_id: SpaceId) {
        if let Ok(mut pending) = self.pending_announcements.write() {
            let pending_hashes = pending.entry(space_id).or_default();
            pending_hashes.extend(hashes.iter().copied());
            // Evict oldest if over limit
            if pending_hashes.len() > AVAILABILITY_MAX_PENDING_PER_SPACE {
                let excess = pending_hashes.len() - AVAILABILITY_MAX_PENDING_PER_SPACE;
                pending_hashes.drain(0..excess);
            }
        }
    }

    /// Get pending announcements for a space and clear them
    pub fn take_pending(&self, space_id: &SpaceId) -> Vec<ContentBlobHash> {
        if let Ok(mut pending) = self.pending_announcements.write() {
            pending.remove(space_id).unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    /// Get announcement batches for a space (max 100 hashes each)
    #[must_use]
    pub fn get_announcement_batches(
        &self,
        space_id: SpaceId,
        all_hashes: &[ContentBlobHash],
    ) -> Vec<AvailabilityAnnouncePayload> {
        let expires_at = current_timestamp() + AVAILABILITY_REANNOUNCE_SECS;

        all_hashes
            .chunks(AVAILABILITY_ANNOUNCE_BATCH_SIZE)
            .map(|chunk| AvailabilityAnnouncePayload {
                space_id: space_id.0,
                expires_at,
                hashes: chunk.iter().map(|h| *h.as_bytes()).collect(),
            })
            .collect()
    }

    /// Check if re-announcement is needed for a space
    #[must_use]
    pub fn should_reannounce(&self, space_id: &SpaceId) -> bool {
        if let Ok(last) = self.last_announced.read() {
            match last.get(space_id) {
                Some(t) => t.elapsed().as_secs() >= AVAILABILITY_REANNOUNCE_SECS,
                None => true,
            }
        } else {
            true
        }
    }

    /// Mark space as announced
    pub fn mark_announced(&self, space_id: SpaceId) {
        if let Ok(mut last) = self.last_announced.write() {
            last.insert(space_id, Instant::now());
        }
    }

    /// Get seeding manager reference
    #[must_use]
    pub fn seeding_manager(&self) -> &Arc<SeedingManager> {
        &self.seeding_manager
    }

    /// Clear all pending announcements
    pub fn clear_pending(&self) {
        if let Ok(mut pending) = self.pending_announcements.write() {
            pending.clear();
        }
    }
}

/// Peer availability map entry
#[derive(Debug, Clone)]
pub struct PeerAvailability {
    /// When this entry was recorded
    pub recorded_at: Instant,
    /// Peer ID that announced availability
    pub peer_id: [u8; 32],
}

/// Tracks which peers have announced availability for content
pub struct PeerAvailabilityMap {
    /// Content hash -> list of peers that have it
    entries: RwLock<HashMap<ContentBlobHash, Vec<PeerAvailability>>>,
    /// TTL for entries in seconds
    ttl_secs: u64,
    /// Maximum entries
    max_entries: usize,
}

impl PeerAvailabilityMap {
    /// Create a new peer availability map
    #[must_use]
    pub fn new(ttl_secs: u64, max_entries: usize) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl_secs,
            max_entries,
        }
    }

    /// Record that a peer has content
    pub fn record(&self, hash: ContentBlobHash, peer_id: [u8; 32]) {
        if let Ok(mut entries) = self.entries.write() {
            // Check capacity
            if entries.len() >= self.max_entries {
                // Remove oldest entries
                self.prune_entries(&mut entries);
            }

            let availability = PeerAvailability {
                recorded_at: Instant::now(),
                peer_id,
            };

            entries.entry(hash).or_default().push(availability);
        }
    }

    /// Get peers that have announced content
    #[must_use]
    pub fn get_peers(&self, hash: &ContentBlobHash) -> Vec<[u8; 32]> {
        let now = Instant::now();

        if let Ok(entries) = self.entries.read() {
            if let Some(peers) = entries.get(hash) {
                return peers
                    .iter()
                    .filter(|p| now.duration_since(p.recorded_at).as_secs() < self.ttl_secs)
                    .map(|p| p.peer_id)
                    .collect();
            }
        }

        Vec::new()
    }

    /// Check if any peer has announced content
    #[must_use]
    pub fn has_availability(&self, hash: &ContentBlobHash) -> bool {
        !self.get_peers(hash).is_empty()
    }

    /// Remove expired entries
    pub fn prune(&self) {
        if let Ok(mut entries) = self.entries.write() {
            self.prune_entries(&mut entries);
        }
    }

    /// Internal prune implementation
    fn prune_entries(&self, entries: &mut HashMap<ContentBlobHash, Vec<PeerAvailability>>) {
        let now = Instant::now();

        entries.retain(|_, peers| {
            peers.retain(|p| now.duration_since(p.recorded_at).as_secs() < self.ttl_secs);
            !peers.is_empty()
        });
    }

    /// Get number of tracked content hashes
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.read().map(|e| e.len()).unwrap_or(0)
    }

    /// Check if map is empty
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Get current UNIX timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::identity::IdentityId;

    fn make_handler() -> AvailabilityHandler {
        let user = IdentityId::from_bytes([1u8; 32]);
        let manager = Arc::new(SeedingManager::with_defaults(user));
        AvailabilityHandler::new(manager)
    }

    #[test]
    fn test_payload_serialize_deserialize() {
        let space = SpaceId::from_bytes([1u8; 32]);
        let hashes = vec![
            ContentBlobHash::from_bytes([2u8; 32]),
            ContentBlobHash::from_bytes([3u8; 32]),
        ];

        let payload = AvailabilityAnnouncePayload::new(space, 1234567890, hashes);
        let serialized = payload.serialize();
        let deserialized = AvailabilityAnnouncePayload::deserialize(&serialized).unwrap();

        assert_eq!(payload, deserialized);
    }

    #[test]
    fn test_payload_wire_size() {
        let space = SpaceId::from_bytes([1u8; 32]);
        let hashes = vec![
            ContentBlobHash::from_bytes([2u8; 32]),
            ContentBlobHash::from_bytes([3u8; 32]),
        ];

        let payload = AvailabilityAnnouncePayload::new(space, 1234567890, hashes);

        // 32 (space) + 8 (expires) + 2 (count) + 64 (2 hashes)
        assert_eq!(payload.wire_size(), 106);
        assert_eq!(payload.serialize().len(), 106);
    }

    #[test]
    fn test_get_announcement_batches() {
        let handler = make_handler();
        let space = SpaceId::from_bytes([1u8; 32]);

        // Create 250 hashes
        let hashes: Vec<ContentBlobHash> = (0..250)
            .map(|i| {
                let mut bytes = [0u8; 32];
                bytes[0] = (i % 256) as u8;
                bytes[1] = (i / 256) as u8;
                ContentBlobHash::from_bytes(bytes)
            })
            .collect();

        let batches = handler.get_announcement_batches(space, &hashes);

        // Should get 3 batches: 100, 100, 50
        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0].hashes.len(), 100);
        assert_eq!(batches[1].hashes.len(), 100);
        assert_eq!(batches[2].hashes.len(), 50);
    }

    #[test]
    fn test_on_content_stored() {
        let handler = make_handler();
        let space = SpaceId::from_bytes([1u8; 32]);
        let hash = ContentBlobHash::from_bytes([2u8; 32]);

        handler.on_content_stored(hash, space);

        let pending = handler.take_pending(&space);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0], hash);

        // Should be empty after take
        let pending = handler.take_pending(&space);
        assert!(pending.is_empty());
    }

    #[test]
    fn test_should_reannounce() {
        let handler = make_handler();
        let space = SpaceId::from_bytes([1u8; 32]);

        // Should reannounce initially
        assert!(handler.should_reannounce(&space));

        // Mark announced
        handler.mark_announced(space);

        // Should not reannounce immediately
        assert!(!handler.should_reannounce(&space));
    }

    #[test]
    fn test_payload_is_expired() {
        let space = SpaceId::from_bytes([1u8; 32]);
        let hashes = vec![ContentBlobHash::from_bytes([2u8; 32])];

        // Expired payload
        let expired = AvailabilityAnnouncePayload::new(space, 0, hashes.clone());
        assert!(expired.is_expired());

        // Future payload
        let future = AvailabilityAnnouncePayload::new(space, current_timestamp() + 3600, hashes);
        assert!(!future.is_expired());
    }

    #[test]
    fn test_peer_availability_map() {
        let map = PeerAvailabilityMap::new(300, 1000);
        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let peer = [2u8; 32];

        map.record(hash, peer);

        assert!(map.has_availability(&hash));
        let peers = map.get_peers(&hash);
        assert_eq!(peers.len(), 1);
        assert_eq!(peers[0], peer);
    }

    #[test]
    fn test_peer_availability_map_multiple_peers() {
        let map = PeerAvailabilityMap::new(300, 1000);
        let hash = ContentBlobHash::from_bytes([1u8; 32]);
        let peer1 = [2u8; 32];
        let peer2 = [3u8; 32];

        map.record(hash, peer1);
        map.record(hash, peer2);

        let peers = map.get_peers(&hash);
        assert_eq!(peers.len(), 2);
    }

    #[test]
    fn test_deserialize_invalid() {
        // Too short
        assert!(AvailabilityAnnouncePayload::deserialize(&[0u8; 10]).is_none());

        // Invalid count (too many hashes)
        let mut data = vec![0u8; 42];
        data[40] = 0xFF; // count = 255 (too many)
        data[41] = 0xFF;
        assert!(AvailabilityAnnouncePayload::deserialize(&data).is_none());
    }

    #[test]
    fn test_content_hashes_iterator() {
        let space = SpaceId::from_bytes([1u8; 32]);
        let hashes = vec![
            ContentBlobHash::from_bytes([2u8; 32]),
            ContentBlobHash::from_bytes([3u8; 32]),
        ];

        let payload = AvailabilityAnnouncePayload::new(space, 1234567890, hashes.clone());
        let collected: Vec<_> = payload.content_hashes().collect();

        assert_eq!(collected.len(), 2);
        assert_eq!(collected[0], hashes[0]);
        assert_eq!(collected[1], hashes[1]);
    }

    #[test]
    fn test_pending_announcements_limit() {
        use crate::types::constants::AVAILABILITY_MAX_PENDING_PER_SPACE;

        let handler = make_handler();
        let space = SpaceId::from_bytes([1u8; 32]);

        // Add more hashes than the limit
        let excess = 100;
        let total = AVAILABILITY_MAX_PENDING_PER_SPACE + excess;
        for i in 0..total {
            let mut bytes = [0u8; 32];
            bytes[0] = (i % 256) as u8;
            bytes[1] = ((i / 256) % 256) as u8;
            let hash = ContentBlobHash::from_bytes(bytes);
            handler.on_content_stored(hash, space);
        }

        let pending = handler.take_pending(&space);

        // Should be limited to max
        assert_eq!(pending.len(), AVAILABILITY_MAX_PENDING_PER_SPACE);

        // Should contain the newest hashes (oldest were evicted)
        // The last hash added should be present
        let mut last_bytes = [0u8; 32];
        last_bytes[0] = ((total - 1) % 256) as u8;
        last_bytes[1] = (((total - 1) / 256) % 256) as u8;
        let last_hash = ContentBlobHash::from_bytes(last_bytes);
        assert!(pending.contains(&last_hash));
    }

    #[test]
    fn test_pending_announcements_batch_limit() {
        use crate::types::constants::AVAILABILITY_MAX_PENDING_PER_SPACE;

        let handler = make_handler();
        let space = SpaceId::from_bytes([1u8; 32]);

        // Add more hashes than the limit in a batch
        let excess = 100;
        let total = AVAILABILITY_MAX_PENDING_PER_SPACE + excess;
        let hashes: Vec<ContentBlobHash> = (0..total)
            .map(|i| {
                let mut bytes = [0u8; 32];
                bytes[0] = (i % 256) as u8;
                bytes[1] = ((i / 256) % 256) as u8;
                ContentBlobHash::from_bytes(bytes)
            })
            .collect();

        handler.on_contents_stored(&hashes, space);

        let pending = handler.take_pending(&space);

        // Should be limited to max
        assert_eq!(pending.len(), AVAILABILITY_MAX_PENDING_PER_SPACE);
    }
}
