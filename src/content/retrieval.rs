//! Content Retrieval Protocol (SPEC_07 §4 - Milestone 3.3)
//!
//! Implements peer-to-peer content retrieval with:
//! - WHO_HAS/I_HAVE peer discovery
//! - GET/DATA content exchange
//! - Parallel chunk fetching
//! - Retry logic with peer rotation
//!
//! # Protocol Flow
//!
//! ```text
//! Requester                           Peer Network
//!     |                                    |
//!     |------ WHO_HAS(content_hash) ------>| (broadcast)
//!     |                                    |
//!     |<----- I_HAVE(content_hash) --------| (from peers who have it)
//!     |                                    |
//!     |------ GET(content_hash) ---------->| (to selected peer)
//!     |                                    |
//!     |<----- DATA(content) ---------------| (content bytes)
//!     |       or NOTFOUND -----------------| (peer doesn't have it)
//! ```
//!
//! # Parallel Chunk Fetching
//!
//! For chunked content, the manager fetches multiple chunks concurrently:
//! - Default: 4 concurrent requests
//! - Automatic retry on failure
//! - Peer rotation on NOTFOUND

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::content::chunking::{ChunkAvailability, ChunkedContentStore, Manifest};
use crate::network::messages::{
    DataPayload, GetPayload, IHavePayload, InvItem, NotFoundPayload, WhoHasPayload,
};
use crate::seeding::SeedingManager;
use crate::storage::blob::{BlobStore, ContentBlobHash};
use crate::storage::CachingContentStore;
use crate::types::constants;
use crate::types::content::SpaceId;
use crate::types::error::StorageError;
use crate::types::identity::IdentityId;

// ============================================================================
// Type Aliases
// ============================================================================

/// Peer identifier (32-byte public key hash)
pub type PeerId = [u8; 32];

// ============================================================================
// Error Types
// ============================================================================

/// Errors that can occur during content retrieval
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ContentRetrievalError {
    /// Content not found locally or on network
    #[error("content not found: {hash}")]
    NotFound {
        /// Hash that was not found
        hash: String,
    },

    /// No peers have the requested content
    #[error("no peers have content: {hash}")]
    NoPeersAvailable {
        /// Hash that no peers have
        hash: String,
    },

    /// Request timed out
    #[error("request timed out after {timeout_secs}s")]
    Timeout {
        /// Timeout duration in seconds
        timeout_secs: u64,
    },

    /// Maximum retries exhausted
    #[error("max retries ({max}) exhausted")]
    MaxRetriesExhausted {
        /// Maximum retry count that was reached
        max: usize,
    },

    /// Hash mismatch between expected and received data
    #[error("hash mismatch: expected {expected}, got {actual}")]
    HashMismatch {
        /// Expected hash
        expected: String,
        /// Actual computed hash
        actual: String,
    },

    /// Storage layer error
    #[error("storage error: {0}")]
    Storage(#[from] StorageError),

    /// Chunking operation failed
    #[error("chunking error: {0}")]
    Chunking(String),
}

// ============================================================================
// Configuration
// ============================================================================

/// Configuration for content retrieval
#[derive(Debug, Clone)]
pub struct ContentRetrievalConfig {
    /// Maximum concurrent chunk requests (default: 4)
    pub max_concurrent_requests: usize,
    /// Timeout for individual requests (default: 30s)
    pub request_timeout: Duration,
    /// Maximum retry attempts per chunk (default: 3)
    pub max_retries: usize,
    /// TTL for peer availability cache (default: 5 minutes)
    pub availability_cache_ttl: Duration,
    /// Maximum entries in peer availability map
    pub max_availability_entries: usize,
    /// TTL for WHO_HAS seen cache (default: 60s)
    pub who_has_seen_ttl: Duration,
}

impl Default for ContentRetrievalConfig {
    fn default() -> Self {
        Self {
            max_concurrent_requests: constants::MAX_CONCURRENT_CHUNK_REQUESTS,
            request_timeout: Duration::from_secs(constants::CONTENT_REQUEST_TIMEOUT_SECS),
            max_retries: constants::CONTENT_MAX_RETRIES,
            availability_cache_ttl: Duration::from_secs(constants::PEER_AVAILABILITY_TTL_SECS),
            max_availability_entries: constants::MAX_PEER_AVAILABILITY_ENTRIES,
            who_has_seen_ttl: Duration::from_secs(constants::WHO_HAS_SEEN_TTL_SECS),
        }
    }
}

// ============================================================================
// Content Metadata (Milestone 3.4)
// ============================================================================

/// Metadata needed to create a cache entry for retrieved content
///
/// The caller is responsible for looking up the chain record to obtain
/// this metadata. This separation ensures the retrieval layer does not
/// depend on the chain layer.
#[derive(Debug, Clone)]
pub struct ContentMetadata {
    /// Owner of the content (from chain record)
    pub owner_id: IdentityId,
    /// Space the content belongs to (from chain record)
    pub space_id: SpaceId,
    /// Creation timestamp (from chain record)
    pub created_at: u64,
}

impl ContentMetadata {
    /// Create new content metadata
    #[must_use]
    pub const fn new(owner_id: IdentityId, space_id: SpaceId, created_at: u64) -> Self {
        Self {
            owner_id,
            space_id,
            created_at,
        }
    }
}

// ============================================================================
// Peer Availability Map
// ============================================================================

/// Entry in the peer availability map
#[derive(Debug, Clone)]
struct AvailabilityEntry {
    /// Peers that have this content
    peers: HashSet<PeerId>,
    /// When this entry was last updated
    last_updated: Instant,
}

/// Tracks which peers have which content
#[derive(Debug)]
struct PeerAvailabilityMap {
    /// content_hash -> availability entry
    inner: HashMap<ContentBlobHash, AvailabilityEntry>,
    /// Maximum entries to prevent unbounded growth
    max_entries: usize,
}

impl PeerAvailabilityMap {
    fn new(max_entries: usize) -> Self {
        Self {
            inner: HashMap::new(),
            max_entries,
        }
    }

    /// Add a peer as having content
    fn add_peer(&mut self, hash: ContentBlobHash, peer: PeerId) {
        let now = Instant::now();

        // Enforce max entries by removing oldest if at capacity
        if self.inner.len() >= self.max_entries && !self.inner.contains_key(&hash) {
            // Find and remove oldest entry
            if let Some(oldest_key) = self
                .inner
                .iter()
                .min_by_key(|(_, v)| v.last_updated)
                .map(|(k, _)| *k)
            {
                self.inner.remove(&oldest_key);
            }
        }

        let entry = self.inner.entry(hash).or_insert_with(|| AvailabilityEntry {
            peers: HashSet::new(),
            last_updated: now,
        });

        entry.peers.insert(peer);
        entry.last_updated = now;
    }

    /// Remove a peer from availability for a content hash
    fn remove_peer(&mut self, hash: &ContentBlobHash, peer: &PeerId) {
        if let Some(entry) = self.inner.get_mut(hash) {
            entry.peers.remove(peer);
            // Clean up empty entries
            if entry.peers.is_empty() {
                self.inner.remove(hash);
            }
        }
    }

    /// Get peers that have content
    fn get_peers(&self, hash: &ContentBlobHash) -> Vec<PeerId> {
        self.inner
            .get(hash)
            .map(|e| e.peers.iter().copied().collect())
            .unwrap_or_default()
    }

    /// Remove entries older than max_age
    fn expire_old_entries(&mut self, max_age: Duration) {
        let now = Instant::now();
        self.inner
            .retain(|_, v| now.duration_since(v.last_updated) < max_age);
    }

    /// Get number of tracked content hashes
    fn len(&self) -> usize {
        self.inner.len()
    }
}

// ============================================================================
// WHO_HAS Seen Cache
// ============================================================================

/// Tracks recently seen WHO_HAS queries to prevent duplicate responses
#[derive(Debug)]
struct WhoHasSeenCache {
    /// (content_hash, peer_id) -> when we last responded
    seen: HashMap<(ContentBlobHash, PeerId), Instant>,
    /// Maximum entries before cleanup
    max_entries: usize,
    /// TTL for entries
    ttl: Duration,
}

impl WhoHasSeenCache {
    fn new(ttl: Duration) -> Self {
        Self {
            seen: HashMap::new(),
            max_entries: 1000,
            ttl,
        }
    }

    /// Check if we should respond to a WHO_HAS from this peer for this hash
    /// Returns true if we should respond, false if we recently responded
    fn should_respond(&mut self, hash: &ContentBlobHash, sender: &PeerId) -> bool {
        let key = (*hash, *sender);
        let now = Instant::now();

        // Clean old entries periodically
        if self.seen.len() > self.max_entries {
            self.seen.retain(|_, v| now.duration_since(*v) < self.ttl);
        }

        if let Some(last_response) = self.seen.get(&key) {
            if now.duration_since(*last_response) < self.ttl {
                return false;
            }
        }

        self.seen.insert(key, now);
        true
    }
}

// ============================================================================
// Pending Request Tracking
// ============================================================================

/// Tracks an in-flight GET request
#[derive(Debug, Clone)]
struct PendingChunkRequest {
    /// Hash of content being requested
    hash: ContentBlobHash,
    /// Peer we sent the request to
    peer_id: PeerId,
    /// When request was sent
    requested_at: Instant,
    /// Number of retries so far
    retry_count: usize,
}

// ============================================================================
// Parallel Fetcher
// ============================================================================

/// Status of a chunk during parallel fetch
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChunkFetchStatus {
    /// Chunk not yet requested (with retry count for tracking retries)
    Pending {
        /// Number of previous retry attempts (0 for first attempt)
        retry_count: usize,
    },
    /// Chunk request in flight
    InFlight {
        /// Peer handling the request
        peer: PeerId,
        /// When request started
        started: Instant,
        /// Number of previous retry attempts
        retry_count: usize,
    },
    /// Chunk received and stored
    Received,
    /// Chunk fetch failed permanently
    Failed {
        /// Number of retry attempts made
        retry_count: usize,
    },
}

/// Orchestrates parallel chunk downloads for a manifest
#[derive(Debug)]
pub struct ParallelFetcher {
    /// Hash of the manifest being fetched
    manifest_hash: ContentBlobHash,
    /// Status of each chunk (index corresponds to chunk index)
    chunk_status: Vec<(ContentBlobHash, ChunkFetchStatus)>,
    /// Current number of in-flight requests
    in_flight_count: usize,
    /// Maximum concurrent requests
    max_concurrent: usize,
    /// Number of chunks successfully received
    completed_count: usize,
    /// Number of chunks that permanently failed
    failed_count: usize,
}

impl ParallelFetcher {
    /// Create a new parallel fetcher for a manifest
    pub fn new(manifest: &Manifest, max_concurrent: usize) -> Self {
        let chunk_status = manifest
            .chunks
            .iter()
            .map(|info| (info.hash, ChunkFetchStatus::Pending { retry_count: 0 }))
            .collect();

        Self {
            manifest_hash: manifest.compute_hash().unwrap_or_default(),
            chunk_status,
            in_flight_count: 0,
            max_concurrent,
            completed_count: 0,
            failed_count: 0,
        }
    }

    /// Create from a list of missing chunk hashes
    pub fn from_missing_hashes(hashes: &[ContentBlobHash], max_concurrent: usize) -> Self {
        let chunk_status = hashes
            .iter()
            .map(|h| (*h, ChunkFetchStatus::Pending { retry_count: 0 }))
            .collect();

        Self {
            manifest_hash: ContentBlobHash::default(),
            chunk_status,
            in_flight_count: 0,
            max_concurrent,
            completed_count: 0,
            failed_count: 0,
        }
    }

    /// Get next chunks to request (up to available concurrent slots)
    pub fn get_next_chunks(&self) -> Vec<ContentBlobHash> {
        let slots_available = self.max_concurrent.saturating_sub(self.in_flight_count);
        self.chunk_status
            .iter()
            .filter(|(_, status)| matches!(status, ChunkFetchStatus::Pending { .. }))
            .take(slots_available)
            .map(|(hash, _)| *hash)
            .collect()
    }

    /// Mark chunk as in-flight
    ///
    /// Only transitions from Pending state. Failed or Received chunks are not changed.
    pub fn mark_in_flight(&mut self, hash: &ContentBlobHash, peer: PeerId) {
        if let Some((_, status)) = self.chunk_status.iter_mut().find(|(h, _)| h == hash) {
            // Only transition from Pending state
            if let ChunkFetchStatus::Pending { retry_count } = *status {
                *status = ChunkFetchStatus::InFlight {
                    peer,
                    started: Instant::now(),
                    retry_count,
                };
                self.in_flight_count += 1;
            }
            // If already InFlight, Received, or Failed, do nothing
        }
    }

    /// Mark chunk as received
    pub fn mark_received(&mut self, hash: &ContentBlobHash) {
        if let Some((_, status)) = self.chunk_status.iter_mut().find(|(h, _)| h == hash) {
            if matches!(status, ChunkFetchStatus::InFlight { .. }) {
                self.in_flight_count = self.in_flight_count.saturating_sub(1);
            }
            *status = ChunkFetchStatus::Received;
            self.completed_count += 1;
        }
    }

    /// Mark chunk as failed, returns true if should retry
    ///
    /// Only processes InFlight chunks. Already Failed, Received, or Pending chunks are ignored.
    pub fn mark_failed(&mut self, hash: &ContentBlobHash, max_retries: usize) -> bool {
        if let Some((_, status)) = self.chunk_status.iter_mut().find(|(h, _)| h == hash) {
            // Only process InFlight chunks
            if let ChunkFetchStatus::InFlight { retry_count, .. } = *status {
                self.in_flight_count = self.in_flight_count.saturating_sub(1);

                // Increment retry count for this failure
                let new_retry_count = retry_count + 1;

                if new_retry_count < max_retries {
                    // Reset to pending with incremented retry count
                    *status = ChunkFetchStatus::Pending {
                        retry_count: new_retry_count,
                    };
                    return true;
                } else {
                    // Max retries exhausted
                    *status = ChunkFetchStatus::Failed {
                        retry_count: new_retry_count,
                    };
                    self.failed_count += 1;
                }
            }
            // If already Failed, Received, or Pending, do nothing
        }
        false
    }

    /// Check if all chunks are complete
    pub fn is_complete(&self) -> bool {
        self.completed_count == self.chunk_status.len()
    }

    /// Check if any chunks permanently failed
    pub fn has_failures(&self) -> bool {
        self.failed_count > 0
    }

    /// Get number of in-flight requests
    pub fn in_flight(&self) -> usize {
        self.in_flight_count
    }

    /// Get number of pending chunks
    pub fn pending_count(&self) -> usize {
        self.chunk_status
            .iter()
            .filter(|(_, s)| matches!(s, ChunkFetchStatus::Pending { .. }))
            .count()
    }

    /// Get total number of chunks
    pub fn total_chunks(&self) -> usize {
        self.chunk_status.len()
    }

    /// Get number of completed chunks
    pub fn completed(&self) -> usize {
        self.completed_count
    }

    /// Get chunks that have timed out
    pub fn get_timed_out_chunks(&self, timeout: Duration) -> Vec<ContentBlobHash> {
        let now = Instant::now();
        self.chunk_status
            .iter()
            .filter_map(|(hash, status)| {
                if let ChunkFetchStatus::InFlight { started, .. } = status {
                    if now.duration_since(*started) > timeout {
                        return Some(*hash);
                    }
                }
                None
            })
            .collect()
    }

    /// Get manifest hash
    pub fn manifest_hash(&self) -> &ContentBlobHash {
        &self.manifest_hash
    }
}

// ============================================================================
// Content Retrieval Manager
// ============================================================================

/// Manager for P2P content retrieval
///
/// Handles:
/// - WHO_HAS/I_HAVE protocol for discovering content
/// - GET/DATA exchange for fetching content
/// - Parallel chunk fetching for large files
/// - Retry logic with peer rotation
pub struct ContentRetrievalManager {
    /// Blob storage for content
    blob_store: Arc<BlobStore>,
    /// Chunked content store for large files
    chunked_store: Arc<ChunkedContentStore>,
    /// Map of which peers have which content
    availability: RwLock<PeerAvailabilityMap>,
    /// Pending GET requests
    pending_requests: RwLock<HashMap<ContentBlobHash, PendingChunkRequest>>,
    /// Cache for WHO_HAS deduplication
    who_has_seen: RwLock<WhoHasSeenCache>,
    /// Content that user explicitly requested (for auto-fetching on I_HAVE)
    wanted_content: RwLock<HashSet<ContentBlobHash>>,
    /// Configuration
    config: ContentRetrievalConfig,
}

impl ContentRetrievalManager {
    /// Create a new content retrieval manager
    pub fn new(
        blob_store: Arc<BlobStore>,
        chunked_store: Arc<ChunkedContentStore>,
        config: ContentRetrievalConfig,
    ) -> Self {
        Self {
            blob_store,
            chunked_store,
            availability: RwLock::new(PeerAvailabilityMap::new(config.max_availability_entries)),
            pending_requests: RwLock::new(HashMap::new()),
            who_has_seen: RwLock::new(WhoHasSeenCache::new(config.who_has_seen_ttl)),
            wanted_content: RwLock::new(HashSet::new()),
            config,
        }
    }

    /// Create with default configuration
    pub fn with_defaults(
        blob_store: Arc<BlobStore>,
        chunked_store: Arc<ChunkedContentStore>,
    ) -> Self {
        Self::new(blob_store, chunked_store, ContentRetrievalConfig::default())
    }

    // ========================================================================
    // Local Content Checks
    // ========================================================================

    /// Check if we have content locally
    pub fn has_content(&self, hash: &ContentBlobHash) -> bool {
        self.blob_store.exists(hash)
    }

    /// Get content from local storage if available
    pub fn get_local(&self, hash: &ContentBlobHash) -> Option<Vec<u8>> {
        self.blob_store.get(hash).ok()
    }

    // ========================================================================
    // Peer Availability
    // ========================================================================

    /// Record that a peer has content
    pub fn record_peer_availability(&self, hash: ContentBlobHash, peer: PeerId) {
        if let Ok(mut avail) = self.availability.write() {
            avail.add_peer(hash, peer);
        }
    }

    /// Get peers that have content
    pub fn get_peers_with_content(&self, hash: &ContentBlobHash) -> Vec<PeerId> {
        self.availability
            .read()
            .map(|a| a.get_peers(hash))
            .unwrap_or_default()
    }

    /// Get any single peer that has content (for relay purposes)
    pub fn get_any_peer_with_content(&self, hash: &[u8; 32]) -> Option<PeerId> {
        let content_hash = ContentBlobHash::from_bytes(*hash);
        self.availability
            .read()
            .ok()
            .and_then(|a| a.get_peers(&content_hash).into_iter().next())
    }

    /// Select a peer for content, excluding certain peers
    pub fn select_peer(&self, hash: &ContentBlobHash, exclude: &[PeerId]) -> Option<PeerId> {
        let peers = self.get_peers_with_content(hash);
        peers.into_iter().find(|p| !exclude.contains(p))
    }

    /// Expire old availability entries
    pub fn expire_availability(&self) {
        if let Ok(mut avail) = self.availability.write() {
            avail.expire_old_entries(self.config.availability_cache_ttl);
        }
    }

    /// Get number of tracked content hashes in availability map
    pub fn availability_count(&self) -> usize {
        self.availability.read().map(|a| a.len()).unwrap_or(0)
    }

    // ========================================================================
    // WHO_HAS / I_HAVE Protocol Handlers
    // ========================================================================

    /// Handle incoming WHO_HAS query
    ///
    /// Returns Some(I_HAVE) if we have the content and should respond, None otherwise.
    /// Uses seen cache to prevent duplicate responses.
    pub fn on_who_has(&self, payload: &WhoHasPayload, sender: PeerId) -> Option<IHavePayload> {
        let hash = ContentBlobHash::from_bytes(payload.hash);

        // Check if we should respond (deduplication)
        if let Ok(mut seen) = self.who_has_seen.write() {
            if !seen.should_respond(&hash, &sender) {
                return None;
            }
        }

        // Check if we have the content
        if self.has_content(&hash) {
            Some(IHavePayload::new(payload.hash))
        } else {
            None
        }
    }

    /// Handle WHO_HAS with seeding policy checks (Milestone 3.5)
    ///
    /// Unlike on_who_has(), this method applies seeding filters:
    /// - Space filtering (only respond for seeded spaces)
    /// - Duration filtering (only respond for content within seed_duration_hours)
    /// - Own content override
    ///
    /// # Arguments
    /// * `payload` - The WHO_HAS request
    /// * `sender` - Peer who sent the request
    /// * `metadata` - Content metadata for seeding decision (optional)
    /// * `seeding_manager` - Seeding manager for policy checks
    pub fn on_who_has_with_seeding(
        &self,
        payload: &WhoHasPayload,
        sender: PeerId,
        metadata: Option<&ContentMetadata>,
        seeding_manager: &SeedingManager,
    ) -> Option<IHavePayload> {
        let hash = ContentBlobHash::from_bytes(payload.hash);

        // Check if we should respond (deduplication)
        if let Ok(mut seen) = self.who_has_seen.write() {
            if !seen.should_respond(&hash, &sender) {
                return None;
            }
        }

        // Check if we have the content
        if !self.has_content(&hash) {
            return None;
        }

        // Apply seeding policy check
        if let Some(meta) = metadata {
            if !seeding_manager.should_seed(&hash, meta.space_id, meta.owner_id, meta.created_at) {
                return None;
            }
        }

        Some(IHavePayload::new(payload.hash))
    }

    /// Handle incoming I_HAVE response
    ///
    /// Records the peer as having the content.
    /// Returns true if this content was in our wanted set (user explicitly requested it).
    pub fn on_i_have(&self, payload: &IHavePayload, sender: PeerId) -> bool {
        let hash = ContentBlobHash::from_bytes(payload.hash);

        // Use provider_id if specified (non-zero), otherwise use sender
        let actual_provider = if payload.is_self_announcement() {
            sender
        } else {
            payload.provider_id
        };
        self.record_peer_availability(hash, actual_provider);

        // Also record the sender as a relay path (they can forward GET to provider)
        // This is important for multi-hop routing - if we can't reach the provider,
        // we can relay GET through the peer that told us about the content
        if actual_provider != sender {
            self.record_peer_availability(hash, sender);
        }

        // Check if this was content we explicitly requested
        if let Ok(wanted) = self.wanted_content.read() {
            wanted.contains(&hash)
        } else {
            false
        }
    }

    /// Mark content as wanted (user explicitly requested it via RPC)
    /// When we receive I_HAVE for wanted content, we should auto-fetch it
    pub fn mark_wanted(&self, hash: &ContentBlobHash) {
        if let Ok(mut wanted) = self.wanted_content.write() {
            wanted.insert(*hash);
        }
    }

    /// Clear content from wanted set (after we've fetched it or given up)
    pub fn clear_wanted(&self, hash: &ContentBlobHash) {
        if let Ok(mut wanted) = self.wanted_content.write() {
            wanted.remove(hash);
        }
    }

    /// Check if content is in wanted set
    pub fn is_wanted(&self, hash: &ContentBlobHash) -> bool {
        if let Ok(wanted) = self.wanted_content.read() {
            wanted.contains(hash)
        } else {
            false
        }
    }

    /// Create a WHO_HAS query for broadcasting
    pub fn create_who_has_query(&self, hash: &ContentBlobHash) -> WhoHasPayload {
        WhoHasPayload::new(*hash.as_bytes())
    }

    // ========================================================================
    // GET / DATA Protocol Handlers
    // ========================================================================

    /// Handle incoming GET request
    ///
    /// Returns Ok(DataPayload) if content found, Err(NotFoundPayload) otherwise.
    ///
    /// Note: Uses get_unchecked because the content_id is derived from the post body,
    /// not the full serialized ContentItem. The hash mismatch is expected.
    pub fn on_get(&self, payload: &GetPayload) -> Result<DataPayload, NotFoundPayload> {
        let hash = ContentBlobHash::from_bytes(payload.hash);

        // Use get_unchecked because content_id is from body, not serialized data
        match self.blob_store.get_unchecked(&hash) {
            Ok(data) => {
                // Build DATA payload with hash + length + data
                let mut response_data = Vec::with_capacity(32 + 4 + data.len());
                response_data.extend_from_slice(&payload.hash);
                response_data.extend_from_slice(&(data.len() as u32).to_le_bytes());
                response_data.extend_from_slice(&data);

                Ok(DataPayload {
                    data: response_data,
                })
            }
            Err(_) => Err(NotFoundPayload {
                items: vec![InvItem::content(payload.hash)],
            }),
        }
    }

    /// Handle GET request with bandwidth limiting (Milestone 3.5)
    ///
    /// Returns Ok((DataPayload, bytes_served)) on success, Err(NotFoundPayload) on failure.
    /// Applies bandwidth limit and records statistics.
    ///
    /// # Arguments
    /// * `payload` - The GET request
    /// * `space_id` - Space the content belongs to (for statistics)
    /// * `seeding_manager` - Seeding manager for bandwidth limiting
    ///
    /// # Note
    /// If bandwidth is exhausted, this returns NotFoundPayload to avoid partial sends.
    /// The caller should implement backoff or wait for bandwidth to refill.
    pub fn on_get_with_seeding(
        &self,
        payload: &GetPayload,
        space_id: SpaceId,
        seeding_manager: &SeedingManager,
    ) -> Result<(DataPayload, u64), NotFoundPayload> {
        let hash = ContentBlobHash::from_bytes(payload.hash);

        // Get content
        let data = match self.blob_store.get(&hash) {
            Ok(d) => d,
            Err(_) => {
                return Err(NotFoundPayload {
                    items: vec![InvItem::content(payload.hash)],
                })
            }
        };

        // Check bandwidth
        let data_len = data.len() as u64;
        let acquired = seeding_manager.try_acquire_bandwidth(data_len);
        if acquired < data_len {
            // Bandwidth exhausted - record denied and return not found
            seeding_manager.record_denied();
            return Err(NotFoundPayload {
                items: vec![InvItem::content(payload.hash)],
            });
        }

        // Record stats
        seeding_manager.record_served(data_len, space_id);

        // Build response
        let mut response_data = Vec::with_capacity(32 + 4 + data.len());
        response_data.extend_from_slice(&payload.hash);
        response_data.extend_from_slice(&(data.len() as u32).to_le_bytes());
        response_data.extend_from_slice(&data);

        Ok((
            DataPayload {
                data: response_data,
            },
            data_len,
        ))
    }

    /// Handle incoming DATA response
    ///
    /// Stores content using the expected_hash as the key.
    ///
    /// Note: Does NOT validate that the data hash matches expected_hash because
    /// content_id is derived from the post body, not the serialized ContentItem.
    /// The data is stored in the sharded format directly.
    pub fn on_data(
        &self,
        expected_hash: &ContentBlobHash,
        data: &[u8],
    ) -> Result<(), ContentRetrievalError> {
        // Store using the blob store's internal path structure
        // We use the expected_hash as the key, even though the data hash may differ
        // (content_id is from post body, not serialized ContentItem)
        let blob_path = self.blob_store.blob_path(expected_hash);

        // Create parent directory
        if let Some(parent) = blob_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| StorageError::IoError(e.to_string()))?;
        }

        // Write the file
        std::fs::write(&blob_path, data)
            .map_err(|e| StorageError::IoError(e.to_string()))?;

        // Clear pending request
        if let Ok(mut pending) = self.pending_requests.write() {
            pending.remove(expected_hash);
        }

        // Clear from wanted set (content has been received)
        if let Ok(mut wanted) = self.wanted_content.write() {
            wanted.remove(expected_hash);
        }

        Ok(())
    }

    /// Handle incoming DATA response with caching (Milestone 3.4)
    ///
    /// Validates hash, stores content via CachingContentStore with proper metadata.
    /// This method should be used instead of `on_data()` when cache integration is desired.
    ///
    /// # Arguments
    /// * `expected_hash` - Hash we expect the data to match
    /// * `data` - Raw content bytes
    /// * `metadata` - Metadata from chain record lookup (caller responsibility)
    /// * `caching_store` - Cache-aware store for persistence
    ///
    /// # Note
    /// The caller must look up the chain record to obtain ContentMetadata.
    /// This is intentional: the retrieval layer should not depend on chain layer.
    ///
    /// # Errors
    ///
    /// Returns error if hash doesn't match or storage fails.
    pub fn on_data_with_cache(
        &self,
        expected_hash: &ContentBlobHash,
        data: &[u8],
        metadata: &ContentMetadata,
        caching_store: &CachingContentStore,
    ) -> Result<(), ContentRetrievalError> {
        // Verify hash matches
        let computed = ContentBlobHash::compute(data);
        if computed != *expected_hash {
            return Err(ContentRetrievalError::HashMismatch {
                expected: expected_hash.to_hash_string(),
                actual: computed.to_hash_string(),
            });
        }

        // Store via caching store (handles eviction)
        caching_store.put_with_metadata(
            data,
            metadata.owner_id,
            metadata.space_id,
            metadata.created_at,
        )?;

        // Clear pending request
        if let Ok(mut pending) = self.pending_requests.write() {
            pending.remove(expected_hash);
        }

        Ok(())
    }

    /// Handle NOTFOUND response
    ///
    /// Removes peer from availability and returns next peer to try if retries available.
    pub fn on_not_found(&self, hash: &ContentBlobHash, sender: PeerId) -> Option<PeerId> {
        // Remove sender from availability for this hash
        if let Ok(mut avail) = self.availability.write() {
            avail.remove_peer(hash, &sender);
        }

        // Check if we should retry with a different peer
        if let Ok(mut pending) = self.pending_requests.write() {
            if let Some(req) = pending.get_mut(hash) {
                if req.retry_count < self.config.max_retries {
                    req.retry_count += 1;
                    // Return next available peer (excluding the one that failed)
                    return self.select_peer(hash, &[sender]);
                } else {
                    pending.remove(hash);
                }
            }
        }
        None
    }

    /// Register a pending request before sending GET
    pub fn register_pending(&self, hash: ContentBlobHash, peer: PeerId) {
        if let Ok(mut pending) = self.pending_requests.write() {
            pending.insert(
                hash,
                PendingChunkRequest {
                    hash,
                    peer_id: peer,
                    requested_at: Instant::now(),
                    retry_count: 0,
                },
            );
        }
    }

    /// Create GET payload for requesting content
    pub fn create_get_request(&self, hash: &ContentBlobHash) -> GetPayload {
        GetPayload::new(*hash.as_bytes())
    }

    // ========================================================================
    // Timeout and Retry Logic
    // ========================================================================

    /// Check for timed-out requests
    ///
    /// Returns list of (hash, peer_id) that have timed out.
    pub fn check_timeouts(&self) -> Vec<(ContentBlobHash, PeerId)> {
        let mut timed_out = Vec::new();
        let now = Instant::now();
        let timeout = self.config.request_timeout;

        if let Ok(mut pending) = self.pending_requests.write() {
            let expired: Vec<ContentBlobHash> = pending
                .iter()
                .filter(|(_, req)| now.duration_since(req.requested_at) > timeout)
                .map(|(hash, _)| *hash)
                .collect();

            for hash in expired {
                if let Some(req) = pending.remove(&hash) {
                    timed_out.push((hash, req.peer_id));
                }
            }
        }

        timed_out
    }

    /// Get number of pending requests
    pub fn pending_count(&self) -> usize {
        self.pending_requests.read().map(|p| p.len()).unwrap_or(0)
    }

    // ========================================================================
    // Chunked Content Retrieval
    // ========================================================================

    /// Create a parallel fetcher for missing chunks of a manifest
    pub fn create_parallel_fetcher(&self, manifest: &Manifest) -> ParallelFetcher {
        ParallelFetcher::new(manifest, self.config.max_concurrent_requests)
    }

    /// Create a parallel fetcher from chunk availability
    pub fn create_fetcher_for_missing(&self, availability: &ChunkAvailability) -> ParallelFetcher {
        let missing = self.chunked_store.get_missing_chunk_hashes(availability);
        ParallelFetcher::from_missing_hashes(&missing, self.config.max_concurrent_requests)
    }

    /// Load manifest from blob store
    pub fn load_manifest(&self, hash: &ContentBlobHash) -> Result<Manifest, ContentRetrievalError> {
        Manifest::load(hash, &self.blob_store)
            .map_err(|e| ContentRetrievalError::Chunking(e.to_string()))
    }

    /// Check if manifest is locally available
    pub fn has_manifest(&self, hash: &ContentBlobHash) -> bool {
        self.blob_store.exists(hash)
    }

    /// Get chunk availability for a manifest
    pub fn check_chunk_availability(&self, manifest: &Manifest) -> ChunkAvailability {
        self.chunked_store
            .check_availability_from_manifest(manifest)
    }

    /// Reassemble content from a complete manifest
    pub fn reassemble_content(
        &self,
        manifest: &Manifest,
    ) -> Result<Vec<u8>, ContentRetrievalError> {
        self.chunked_store
            .reassemble_from_manifest(manifest)
            .map_err(|e| ContentRetrievalError::Chunking(e.to_string()))
    }

    // ========================================================================
    // Configuration Access
    // ========================================================================

    /// Get configuration
    pub fn config(&self) -> &ContentRetrievalConfig {
        &self.config
    }

    /// Get max concurrent requests
    pub fn max_concurrent(&self) -> usize {
        self.config.max_concurrent_requests
    }

    /// Get request timeout
    pub fn request_timeout(&self) -> Duration {
        self.config.request_timeout
    }

    /// Get max retries
    pub fn max_retries(&self) -> usize {
        self.config.max_retries
    }
}

// ============================================================================
// Message Types for Network Integration
// ============================================================================

/// Message that can be sent for content retrieval
#[derive(Debug, Clone)]
pub enum ContentRetrievalMessage {
    /// WHO_HAS query (broadcast)
    WhoHas(WhoHasPayload),
    /// I_HAVE response (to requester)
    IHave(IHavePayload),
    /// GET request (to specific peer)
    Get(GetPayload),
    /// DATA response (content bytes)
    Data(ContentBlobHash, Vec<u8>),
    /// NOTFOUND response
    NotFound(ContentBlobHash),
}

/// Trait for sending content retrieval messages
///
/// Implement this trait to integrate with the network layer.
pub trait ContentMessageSender: Send + Sync {
    /// Send message to a specific peer
    fn send_to_peer(&self, peer: PeerId, msg: ContentRetrievalMessage);

    /// Broadcast message to all connected peers
    fn broadcast(&self, msg: ContentRetrievalMessage);
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_manager() -> (ContentRetrievalManager, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let chunked_store = Arc::new(ChunkedContentStore::new(
            BlobStore::new(dir.path().join("chunks")).unwrap(),
        ));

        let manager = ContentRetrievalManager::with_defaults(blob_store, chunked_store);
        (manager, dir)
    }

    // ========================================================================
    // Manager Creation Tests
    // ========================================================================

    #[test]
    fn test_manager_creation() {
        let (manager, _dir) = create_test_manager();
        assert_eq!(manager.availability_count(), 0);
        assert_eq!(manager.pending_count(), 0);
    }

    #[test]
    fn test_manager_with_custom_config() {
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let chunked_store = Arc::new(ChunkedContentStore::new(
            BlobStore::new(dir.path().join("chunks")).unwrap(),
        ));

        let config = ContentRetrievalConfig {
            max_concurrent_requests: 8,
            request_timeout: Duration::from_secs(60),
            max_retries: 5,
            ..Default::default()
        };

        let manager = ContentRetrievalManager::new(blob_store, chunked_store, config);
        assert_eq!(manager.max_concurrent(), 8);
        assert_eq!(manager.request_timeout(), Duration::from_secs(60));
        assert_eq!(manager.max_retries(), 5);
    }

    // ========================================================================
    // Local Content Tests
    // ========================================================================

    #[test]
    fn test_has_content_local() {
        let (manager, _dir) = create_test_manager();

        // Store content
        let data = b"test content data";
        let hash = manager.blob_store.put(data).unwrap();

        // Verify has_content returns true
        assert!(manager.has_content(&hash));

        // Non-existent content returns false
        let fake_hash = ContentBlobHash::from_bytes([0xab; 32]);
        assert!(!manager.has_content(&fake_hash));
    }

    #[test]
    fn test_get_local() {
        let (manager, _dir) = create_test_manager();

        let data = b"local content";
        let hash = manager.blob_store.put(data).unwrap();

        let retrieved = manager.get_local(&hash);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap(), data.to_vec());
    }

    // ========================================================================
    // Peer Availability Tests
    // ========================================================================

    #[test]
    fn test_peer_availability_tracking() {
        let (manager, _dir) = create_test_manager();

        let hash = ContentBlobHash::from_bytes([0x11; 32]);
        let peer1: PeerId = [0x01; 32];
        let peer2: PeerId = [0x02; 32];

        // Initially no peers
        assert!(manager.get_peers_with_content(&hash).is_empty());

        // Add peers
        manager.record_peer_availability(hash, peer1);
        manager.record_peer_availability(hash, peer2);

        let peers = manager.get_peers_with_content(&hash);
        assert_eq!(peers.len(), 2);
        assert!(peers.contains(&peer1));
        assert!(peers.contains(&peer2));
    }

    #[test]
    fn test_select_peer_excludes() {
        let (manager, _dir) = create_test_manager();

        let hash = ContentBlobHash::from_bytes([0x22; 32]);
        let peer1: PeerId = [0x01; 32];
        let peer2: PeerId = [0x02; 32];

        manager.record_peer_availability(hash, peer1);
        manager.record_peer_availability(hash, peer2);

        // Exclude peer1
        let selected = manager.select_peer(&hash, &[peer1]);
        assert!(selected.is_some());
        assert_eq!(selected.unwrap(), peer2);

        // Exclude both
        let selected = manager.select_peer(&hash, &[peer1, peer2]);
        assert!(selected.is_none());
    }

    // ========================================================================
    // WHO_HAS / I_HAVE Tests
    // ========================================================================

    #[test]
    fn test_on_who_has_with_content() {
        let (manager, _dir) = create_test_manager();

        // Store content
        let data = b"who has test";
        let hash = manager.blob_store.put(data).unwrap();

        let sender: PeerId = [0x10; 32];
        let payload = WhoHasPayload::new(*hash.as_bytes());

        // Should return I_HAVE
        let response = manager.on_who_has(&payload, sender);
        assert!(response.is_some());
        assert_eq!(response.unwrap().hash, *hash.as_bytes());
    }

    #[test]
    fn test_on_who_has_without_content() {
        let (manager, _dir) = create_test_manager();

        let sender: PeerId = [0x10; 32];
        let payload = WhoHasPayload::new([0xab; 32]); // Non-existent content

        let response = manager.on_who_has(&payload, sender);
        assert!(response.is_none());
    }

    #[test]
    fn test_who_has_deduplication() {
        let (manager, _dir) = create_test_manager();

        let data = b"dedup test";
        let hash = manager.blob_store.put(data).unwrap();

        let sender: PeerId = [0x10; 32];
        let payload = WhoHasPayload::new(*hash.as_bytes());

        // First query should respond
        let response1 = manager.on_who_has(&payload, sender);
        assert!(response1.is_some());

        // Second query from same peer within TTL should not respond
        let response2 = manager.on_who_has(&payload, sender);
        assert!(response2.is_none());

        // Different peer should still get response
        let other_peer: PeerId = [0x20; 32];
        let response3 = manager.on_who_has(&payload, other_peer);
        assert!(response3.is_some());
    }

    #[test]
    fn test_on_i_have_records_peer() {
        let (manager, _dir) = create_test_manager();

        let hash_bytes = [0x33; 32];
        let sender: PeerId = [0x30; 32];
        let payload = IHavePayload::new(hash_bytes);

        manager.on_i_have(&payload, sender);

        let hash = ContentBlobHash::from_bytes(hash_bytes);
        let peers = manager.get_peers_with_content(&hash);
        assert_eq!(peers.len(), 1);
        assert!(peers.contains(&sender));
    }

    // ========================================================================
    // GET / DATA Tests
    // ========================================================================

    #[test]
    fn test_on_get_found() {
        let (manager, _dir) = create_test_manager();

        let data = b"get test content";
        let hash = manager.blob_store.put(data).unwrap();

        let payload = GetPayload::new(*hash.as_bytes());
        let response = manager.on_get(&payload);

        assert!(response.is_ok());
        let data_payload = response.unwrap();
        // Verify format: hash[32] + length[4] + data[...]
        assert!(data_payload.data.len() >= 36);
        assert_eq!(&data_payload.data[0..32], hash.as_bytes());
    }

    #[test]
    fn test_on_get_not_found() {
        let (manager, _dir) = create_test_manager();

        let payload = GetPayload::new([0xcc; 32]);
        let response = manager.on_get(&payload);

        assert!(response.is_err());
        let not_found = response.unwrap_err();
        assert_eq!(not_found.items.len(), 1);
        assert_eq!(not_found.items[0].hash, [0xcc; 32]);
    }

    #[test]
    fn test_on_data_stores_content() {
        let (manager, _dir) = create_test_manager();

        let data = b"received data";
        let hash = ContentBlobHash::compute(data);

        // Initially not stored
        assert!(!manager.has_content(&hash));

        // Process DATA
        let result = manager.on_data(&hash, data);
        assert!(result.is_ok());

        // Now should be stored
        assert!(manager.has_content(&hash));
    }

    #[test]
    fn test_on_data_stores_without_hash_validation() {
        // Note: on_data() deliberately does NOT validate hashes because
        // content_id is derived from post body, not serialized ContentItem.
        // Use on_data_with_cache() for hash validation.
        let (manager, _dir) = create_test_manager();

        let expected_hash = ContentBlobHash::from_bytes([0xdd; 32]);
        let bad_data = b"this doesn't match the hash";

        // on_data stores regardless of hash match - this is intentional
        let result = manager.on_data(&expected_hash, bad_data);
        assert!(result.is_ok());
    }

    #[test]
    fn test_on_data_with_cache_stores_and_tracks() {
        use crate::storage::{CachingContentStore, LruCache, StorageConfig, StorageProfile};
        use std::sync::RwLock;

        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let chunked_store = Arc::new(ChunkedContentStore::new(
            BlobStore::new(dir.path().join("chunks")).unwrap(),
        ));

        let user = crate::types::identity::IdentityId::from_bytes([1u8; 32]);
        let cache = Arc::new(RwLock::new(
            LruCache::open(dir.path().join("cache_index.json"), 10_000_000, 0.9, user).unwrap(),
        ));

        let config = StorageConfig::from_profile(StorageProfile::Standard5GB);
        let caching_store = CachingContentStore::new_without_reconcile(
            Arc::clone(&blob_store),
            Arc::clone(&cache),
            config,
            user,
        );

        let manager = ContentRetrievalManager::with_defaults(blob_store, chunked_store);

        let data = b"cached content via on_data_with_cache";
        let hash = ContentBlobHash::compute(data);
        let metadata = ContentMetadata::new(
            crate::types::identity::IdentityId::from_bytes([2u8; 32]),
            crate::types::content::SpaceId::from_bytes([3u8; 32]),
            1234567890,
        );

        // Process DATA with caching
        let result = manager.on_data_with_cache(&hash, data, &metadata, &caching_store);
        assert!(result.is_ok());

        // Verify content stored in caching store
        assert!(caching_store.exists(&hash));
        let retrieved = caching_store.get(&hash).unwrap();
        assert_eq!(retrieved, data.to_vec());

        // Verify cache tracks it
        assert!(cache.read().unwrap().contains(&hash));
    }

    #[test]
    fn test_on_not_found_removes_peer() {
        let (manager, _dir) = create_test_manager();

        let hash = ContentBlobHash::from_bytes([0xee; 32]);
        let peer: PeerId = [0x40; 32];

        // Add peer
        manager.record_peer_availability(hash, peer);
        assert_eq!(manager.get_peers_with_content(&hash).len(), 1);

        // Process NOTFOUND
        manager.on_not_found(&hash, peer);

        // Peer should be removed
        assert!(manager.get_peers_with_content(&hash).is_empty());
    }

    #[test]
    fn test_on_not_found_returns_alternate_peer() {
        let (manager, _dir) = create_test_manager();

        let hash = ContentBlobHash::from_bytes([0xff; 32]);
        let peer1: PeerId = [0x50; 32];
        let peer2: PeerId = [0x60; 32];

        // Add both peers
        manager.record_peer_availability(hash, peer1);
        manager.record_peer_availability(hash, peer2);

        // Register pending request
        manager.register_pending(hash, peer1);

        // Process NOTFOUND from peer1
        let next_peer = manager.on_not_found(&hash, peer1);

        // Should return peer2 as alternate
        assert!(next_peer.is_some());
        assert_eq!(next_peer.unwrap(), peer2);
    }

    // ========================================================================
    // Pending Request Tests
    // ========================================================================

    #[test]
    fn test_register_pending() {
        let (manager, _dir) = create_test_manager();

        let hash = ContentBlobHash::from_bytes([0x77; 32]);
        let peer: PeerId = [0x70; 32];

        assert_eq!(manager.pending_count(), 0);

        manager.register_pending(hash, peer);

        assert_eq!(manager.pending_count(), 1);
    }

    #[test]
    fn test_check_timeouts() {
        let (manager, _dir) = create_test_manager();

        // Create manager with very short timeout for testing
        let dir = tempdir().unwrap();
        let blob_store = Arc::new(BlobStore::new(dir.path().join("blobs")).unwrap());
        let chunked_store = Arc::new(ChunkedContentStore::new(
            BlobStore::new(dir.path().join("chunks")).unwrap(),
        ));

        let config = ContentRetrievalConfig {
            request_timeout: Duration::from_millis(1),
            ..Default::default()
        };

        let manager = ContentRetrievalManager::new(blob_store, chunked_store, config);

        let hash = ContentBlobHash::from_bytes([0x88; 32]);
        let peer: PeerId = [0x80; 32];

        manager.register_pending(hash, peer);

        // Wait for timeout
        std::thread::sleep(Duration::from_millis(5));

        let timed_out = manager.check_timeouts();
        assert_eq!(timed_out.len(), 1);
        assert_eq!(timed_out[0].0, hash);
        assert_eq!(timed_out[0].1, peer);
    }

    // ========================================================================
    // Parallel Fetcher Tests
    // ========================================================================

    #[test]
    fn test_parallel_fetcher_basic() {
        let hashes: Vec<ContentBlobHash> = (0..4)
            .map(|i| ContentBlobHash::from_bytes([i as u8; 32]))
            .collect();

        let mut fetcher = ParallelFetcher::from_missing_hashes(&hashes, 2);

        assert_eq!(fetcher.total_chunks(), 4);
        assert_eq!(fetcher.completed(), 0);
        assert_eq!(fetcher.pending_count(), 4);
        assert!(!fetcher.is_complete());
    }

    #[test]
    fn test_parallel_fetcher_max_concurrent() {
        let hashes: Vec<ContentBlobHash> = (0..10)
            .map(|i| ContentBlobHash::from_bytes([i as u8; 32]))
            .collect();

        let fetcher = ParallelFetcher::from_missing_hashes(&hashes, 2);

        // Should only return up to max_concurrent
        let next = fetcher.get_next_chunks();
        assert_eq!(next.len(), 2);
    }

    #[test]
    fn test_parallel_fetcher_mark_in_flight_and_received() {
        let hashes: Vec<ContentBlobHash> = (0..4)
            .map(|i| ContentBlobHash::from_bytes([i as u8; 32]))
            .collect();

        let mut fetcher = ParallelFetcher::from_missing_hashes(&hashes, 2);
        let peer: PeerId = [0x99; 32];

        // Mark first chunk in flight
        fetcher.mark_in_flight(&hashes[0], peer);
        assert_eq!(fetcher.in_flight(), 1);
        assert_eq!(fetcher.pending_count(), 3);

        // Mark received
        fetcher.mark_received(&hashes[0]);
        assert_eq!(fetcher.in_flight(), 0);
        assert_eq!(fetcher.completed(), 1);
    }

    #[test]
    fn test_parallel_fetcher_retry() {
        let hash = ContentBlobHash::from_bytes([0xaa; 32]);
        let mut fetcher = ParallelFetcher::from_missing_hashes(&[hash], 2);
        let peer: PeerId = [0xaa; 32];

        // Mark in flight then fail
        fetcher.mark_in_flight(&hash, peer);
        let should_retry = fetcher.mark_failed(&hash, 3);
        assert!(should_retry);

        // Should be back to pending
        assert_eq!(fetcher.pending_count(), 1);
        assert!(!fetcher.has_failures());
    }

    #[test]
    fn test_parallel_fetcher_exhausted_retries() {
        let hash = ContentBlobHash::from_bytes([0xbb; 32]);
        let mut fetcher = ParallelFetcher::from_missing_hashes(&[hash], 2);
        let peer: PeerId = [0xbb; 32];

        // Fail multiple times
        for _ in 0..3 {
            fetcher.mark_in_flight(&hash, peer);
            fetcher.mark_failed(&hash, 3);
        }

        // Fourth failure should not allow retry
        fetcher.mark_in_flight(&hash, peer);
        let should_retry = fetcher.mark_failed(&hash, 3);
        assert!(!should_retry);
        assert!(fetcher.has_failures());
    }

    #[test]
    fn test_parallel_fetcher_complete() {
        let hashes: Vec<ContentBlobHash> = (0..3)
            .map(|i| ContentBlobHash::from_bytes([i as u8; 32]))
            .collect();

        let mut fetcher = ParallelFetcher::from_missing_hashes(&hashes, 4);
        let peer: PeerId = [0xcc; 32];

        // Complete all chunks
        for hash in &hashes {
            fetcher.mark_in_flight(hash, peer);
            fetcher.mark_received(hash);
        }

        assert!(fetcher.is_complete());
        assert_eq!(fetcher.completed(), 3);
    }

    #[test]
    fn test_parallel_fetcher_timeout_detection() {
        let hash = ContentBlobHash::from_bytes([0xdd; 32]);
        let mut fetcher = ParallelFetcher::from_missing_hashes(&[hash], 2);
        let peer: PeerId = [0xdd; 32];

        fetcher.mark_in_flight(&hash, peer);

        // Immediate check - not timed out
        let timed_out = fetcher.get_timed_out_chunks(Duration::from_secs(30));
        assert!(timed_out.is_empty());

        // Wait and check with very short timeout
        std::thread::sleep(Duration::from_millis(5));
        let timed_out = fetcher.get_timed_out_chunks(Duration::from_millis(1));
        assert_eq!(timed_out.len(), 1);
        assert_eq!(timed_out[0], hash);
    }

    // ========================================================================
    // Availability Map Tests
    // ========================================================================

    #[test]
    fn test_availability_map_expiry() {
        let mut map = PeerAvailabilityMap::new(100);

        let hash = ContentBlobHash::from_bytes([0x11; 32]);
        let peer: PeerId = [0x11; 32];

        map.add_peer(hash, peer);
        assert_eq!(map.get_peers(&hash).len(), 1);

        // Expire with very short TTL
        map.expire_old_entries(Duration::from_millis(0));

        assert!(map.get_peers(&hash).is_empty());
    }

    #[test]
    fn test_availability_map_max_entries() {
        let mut map = PeerAvailabilityMap::new(3);

        // Add 4 entries, should evict oldest
        for i in 0..4u8 {
            let hash = ContentBlobHash::from_bytes([i; 32]);
            let peer: PeerId = [i; 32];
            map.add_peer(hash, peer);
            // Small sleep to ensure different timestamps
            std::thread::sleep(Duration::from_millis(1));
        }

        assert_eq!(map.len(), 3);
        // First entry should be evicted
        let first = ContentBlobHash::from_bytes([0; 32]);
        assert!(map.get_peers(&first).is_empty());
    }
}
