//! Request tracker for V-SYNC-06 validation (SPEC_06 - Chain Sync)
//!
//! Tracks pending sync requests to validate that responses match registered requests.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Default maximum number of pending requests to prevent memory exhaustion.
/// At ~100 bytes per request, 10,000 requests = ~1MB max memory.
pub const DEFAULT_MAX_PENDING_REQUESTS: usize = 10_000;

/// A pending sync request
#[derive(Debug, Clone)]
pub struct PendingRequest {
    /// Unique request ID
    pub request_id: u64,
    /// Peer ID that the request was sent to
    pub peer_id: [u8; 32],
    /// Start height of the request
    pub start_height: u64,
    /// End height of the request
    pub end_height: u64,
    /// When the request was created
    pub created_at: Instant,
}

/// Request key: (peer_id, start_height, end_height)
type RequestKey = ([u8; 32], u64, u64);

/// Tracks pending sync requests for V-SYNC-06 validation
///
/// This tracker ensures that we only accept responses that match
/// requests we actually made, preventing unsolicited data attacks.
///
/// The tracker enforces a maximum number of pending requests to prevent
/// memory exhaustion attacks from slow or malicious peers.
pub struct RequestTracker {
    /// Next request ID to assign
    next_id: AtomicU64,
    /// Map of pending requests by key
    pending: RwLock<HashMap<RequestKey, PendingRequest>>,
    /// Maximum number of pending requests (memory bound)
    max_pending: usize,
}

impl RequestTracker {
    /// Create a new request tracker with default maximum pending requests.
    #[must_use]
    pub fn new() -> Self {
        Self::with_max_pending(DEFAULT_MAX_PENDING_REQUESTS)
    }

    /// Create a new request tracker with a custom maximum pending limit.
    #[must_use]
    pub fn with_max_pending(max_pending: usize) -> Self {
        Self {
            next_id: AtomicU64::new(1),
            pending: RwLock::new(HashMap::new()),
            max_pending,
        }
    }

    /// Register a new request
    ///
    /// Returns the request ID for tracking, or `None` if the maximum
    /// pending request limit has been reached.
    ///
    /// When the limit is reached, the oldest requests are evicted to make room.
    pub fn register_request(&self, peer_id: [u8; 32], start: u64, end: u64) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let request = PendingRequest {
            request_id: id,
            peer_id,
            start_height: start,
            end_height: end,
            created_at: Instant::now(),
        };

        let key = (peer_id, start, end);
        let mut pending = self.pending.write().expect("RequestTracker lock poisoned");

        // Evict oldest requests if at capacity
        if pending.len() >= self.max_pending {
            // Find and remove the oldest request
            if let Some(oldest_key) = pending
                .iter()
                .min_by_key(|(_, req)| req.created_at)
                .map(|(k, _)| *k)
            {
                pending.remove(&oldest_key);
                log::debug!(
                    "RequestTracker: evicted oldest request to make room (limit: {})",
                    self.max_pending
                );
            }
        }

        pending.insert(key, request);
        id
    }

    /// Validate that a response matches a registered request
    ///
    /// Returns the request ID if valid, None if unregistered (V-SYNC-06 violation).
    #[must_use]
    pub fn validate_response(&self, peer_id: [u8; 32], start: u64, end: u64) -> Option<u64> {
        let key = (peer_id, start, end);
        let pending = self.pending.read().expect("RequestTracker lock poisoned");
        pending.get(&key).map(|r| r.request_id)
    }

    /// Mark a request as completed and remove it
    pub fn complete_request(&self, peer_id: [u8; 32], start: u64, end: u64) {
        let key = (peer_id, start, end);
        self.pending.write().expect("RequestTracker lock poisoned").remove(&key);
    }

    /// Get a pending request's details
    #[must_use]
    pub fn get_request(&self, peer_id: [u8; 32], start: u64, end: u64) -> Option<PendingRequest> {
        let key = (peer_id, start, end);
        let pending = self.pending.read().expect("RequestTracker lock poisoned");
        pending.get(&key).cloned()
    }

    /// Cleanup requests older than the given timeout
    ///
    /// Returns the number of stale requests removed.
    pub fn cleanup_stale(&self, timeout: Duration) -> usize {
        let mut pending = self.pending.write().expect("RequestTracker lock poisoned");
        let before_count = pending.len();
        pending.retain(|_, req| req.created_at.elapsed() < timeout);
        before_count - pending.len()
    }

    /// Get number of pending requests
    #[must_use]
    pub fn pending_count(&self) -> usize {
        self.pending.read().expect("RequestTracker lock poisoned").len()
    }

    /// Get all pending requests for a specific peer
    #[must_use]
    pub fn requests_for_peer(&self, peer_id: [u8; 32]) -> Vec<PendingRequest> {
        let pending = self.pending.read().expect("RequestTracker lock poisoned");
        pending
            .values()
            .filter(|r| r.peer_id == peer_id)
            .cloned()
            .collect()
    }

    /// Clear all pending requests
    pub fn clear(&self) {
        self.pending.write().expect("RequestTracker lock poisoned").clear();
    }

    /// Get the maximum pending requests limit
    #[must_use]
    pub fn max_pending(&self) -> usize {
        self.max_pending
    }
}

impl Default for RequestTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_request_incrementing_ids() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        let id1 = tracker.register_request(peer, 0, 100);
        let id2 = tracker.register_request(peer, 100, 200);
        let id3 = tracker.register_request(peer, 200, 300);

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(id3, 3);
    }

    #[test]
    fn test_validate_registered_request() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        let id = tracker.register_request(peer, 50, 100);
        let validated = tracker.validate_response(peer, 50, 100);

        assert_eq!(validated, Some(id));
    }

    #[test]
    fn test_validate_unregistered_request() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        // Don't register any request
        let validated = tracker.validate_response(peer, 50, 100);

        assert_eq!(validated, None);
    }

    #[test]
    fn test_complete_request() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        tracker.register_request(peer, 0, 100);
        assert_eq!(tracker.pending_count(), 1);

        tracker.complete_request(peer, 0, 100);
        assert_eq!(tracker.pending_count(), 0);

        // Validate should now fail
        assert!(tracker.validate_response(peer, 0, 100).is_none());
    }

    #[test]
    fn test_cleanup_stale() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        tracker.register_request(peer, 0, 100);
        assert_eq!(tracker.pending_count(), 1);

        // Use a very short timeout to simulate staleness
        std::thread::sleep(Duration::from_millis(50));
        let removed = tracker.cleanup_stale(Duration::from_millis(10));

        assert_eq!(removed, 1);
        assert_eq!(tracker.pending_count(), 0);
    }

    #[test]
    fn test_cleanup_keeps_fresh() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        tracker.register_request(peer, 0, 100);

        // Use a long timeout, request should remain
        let removed = tracker.cleanup_stale(Duration::from_secs(3600));

        assert_eq!(removed, 0);
        assert_eq!(tracker.pending_count(), 1);
    }

    #[test]
    fn test_requests_for_peer() {
        let tracker = RequestTracker::new();
        let peer1 = [1u8; 32];
        let peer2 = [2u8; 32];

        tracker.register_request(peer1, 0, 100);
        tracker.register_request(peer1, 100, 200);
        tracker.register_request(peer2, 0, 50);

        let peer1_requests = tracker.requests_for_peer(peer1);
        let peer2_requests = tracker.requests_for_peer(peer2);

        assert_eq!(peer1_requests.len(), 2);
        assert_eq!(peer2_requests.len(), 1);
    }

    #[test]
    fn test_clear() {
        let tracker = RequestTracker::new();
        let peer = [1u8; 32];

        tracker.register_request(peer, 0, 100);
        tracker.register_request(peer, 100, 200);

        assert_eq!(tracker.pending_count(), 2);
        tracker.clear();
        assert_eq!(tracker.pending_count(), 0);
    }

    #[test]
    fn test_different_peers_same_range() {
        let tracker = RequestTracker::new();
        let peer1 = [1u8; 32];
        let peer2 = [2u8; 32];

        let id1 = tracker.register_request(peer1, 0, 100);
        let id2 = tracker.register_request(peer2, 0, 100);

        // Same range but different peers - both should be tracked
        assert_ne!(id1, id2);
        assert!(tracker.validate_response(peer1, 0, 100).is_some());
        assert!(tracker.validate_response(peer2, 0, 100).is_some());
    }

    #[test]
    fn test_max_pending_requests_eviction() {
        let tracker = RequestTracker::with_max_pending(3);
        let peer = [1u8; 32];

        // Register 3 requests (at capacity)
        tracker.register_request(peer, 0, 100);
        std::thread::sleep(Duration::from_millis(10));
        tracker.register_request(peer, 100, 200);
        std::thread::sleep(Duration::from_millis(10));
        tracker.register_request(peer, 200, 300);

        assert_eq!(tracker.pending_count(), 3);

        // Register a 4th request - oldest should be evicted
        tracker.register_request(peer, 300, 400);
        assert_eq!(tracker.pending_count(), 3);

        // First request should have been evicted
        assert!(tracker.validate_response(peer, 0, 100).is_none());
        // Later requests should still exist
        assert!(tracker.validate_response(peer, 100, 200).is_some());
        assert!(tracker.validate_response(peer, 200, 300).is_some());
        assert!(tracker.validate_response(peer, 300, 400).is_some());
    }

    #[test]
    fn test_max_pending_getter() {
        let tracker = RequestTracker::with_max_pending(5000);
        assert_eq!(tracker.max_pending(), 5000);

        let default_tracker = RequestTracker::new();
        assert_eq!(default_tracker.max_pending(), DEFAULT_MAX_PENDING_REQUESTS);
    }
}
