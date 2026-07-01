//! Peer exchange decision logic (SPEC_06 §4.1)
//!
//! Provides logic for deciding when to request peers and creating
//! GETADDR requests.

use crate::network::messages::GetAddrPayload;
use crate::types::constants::{MAX_ADDRS_PER_MESSAGE, TARGET_PEERS};

/// Peer exchange logic for discovery
#[derive(Debug, Clone, Default)]
pub struct PeerExchange;

impl PeerExchange {
    /// Create a new PeerExchange instance
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Determine if we should request peers from a connected peer
    ///
    /// Returns true if:
    /// - The peer has a positive score (trusted)
    /// - We have fewer than TARGET_PEERS connected
    #[must_use]
    pub fn should_request_peers(peer_score: i16, current_peer_count: usize) -> bool {
        peer_score > 0 && current_peer_count < TARGET_PEERS
    }

    /// Create a GETADDR request payload
    ///
    /// Creates a request for any fork (fork_id = zeros) with the maximum
    /// allowed addresses.
    #[must_use]
    pub fn create_getaddr_request() -> GetAddrPayload {
        GetAddrPayload {
            fork_id: [0u8; 32], // Any fork
            max_addrs: MAX_ADDRS_PER_MESSAGE as u16,
        }
    }

    /// Create a GETADDR request for a specific fork
    #[must_use]
    pub fn create_getaddr_for_fork(fork_id: [u8; 32], max_addrs: u16) -> GetAddrPayload {
        GetAddrPayload {
            fork_id,
            max_addrs: max_addrs.min(MAX_ADDRS_PER_MESSAGE as u16),
        }
    }

    /// Calculate peer request priority
    ///
    /// Higher scores and more connected time indicate higher priority.
    /// Returns a score from 0-100.
    #[must_use]
    pub fn request_priority(peer_score: i16, connection_age_secs: u64) -> u8 {
        // Score contributes 0-50 points (scaled from -1000 to 1000 range)
        let score_points = ((peer_score.max(-1000).min(1000) + 1000) as u32 * 50 / 2000) as u8;

        // Connection age contributes 0-50 points (max at 1 hour)
        let age_points = (connection_age_secs.min(3600) * 50 / 3600) as u8;

        score_points + age_points
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_request_peers_positive_score_low_count() {
        assert!(PeerExchange::should_request_peers(100, 5));
        assert!(PeerExchange::should_request_peers(1, 0));
    }

    #[test]
    fn test_should_request_peers_negative_score() {
        assert!(!PeerExchange::should_request_peers(-10, 5));
        assert!(!PeerExchange::should_request_peers(-1, 0));
    }

    #[test]
    fn test_should_request_peers_zero_score() {
        assert!(!PeerExchange::should_request_peers(0, 5));
    }

    #[test]
    fn test_should_request_peers_at_target() {
        // At or above TARGET_PEERS, should not request
        assert!(!PeerExchange::should_request_peers(100, TARGET_PEERS));
        assert!(!PeerExchange::should_request_peers(100, TARGET_PEERS + 10));
    }

    #[test]
    fn test_should_request_peers_just_below_target() {
        assert!(PeerExchange::should_request_peers(100, TARGET_PEERS - 1));
    }

    #[test]
    fn test_create_getaddr_request() {
        let request = PeerExchange::create_getaddr_request();
        assert_eq!(request.fork_id, [0u8; 32]);
        assert_eq!(request.max_addrs, MAX_ADDRS_PER_MESSAGE as u16);
    }

    #[test]
    fn test_create_getaddr_for_fork() {
        let fork_id = [0xab; 32];
        let request = PeerExchange::create_getaddr_for_fork(fork_id, 500);
        assert_eq!(request.fork_id, fork_id);
        assert_eq!(request.max_addrs, 500);
    }

    #[test]
    fn test_create_getaddr_for_fork_clamped() {
        let fork_id = [0xab; 32];
        let request = PeerExchange::create_getaddr_for_fork(fork_id, 5000); // Above limit
        assert_eq!(request.max_addrs, MAX_ADDRS_PER_MESSAGE as u16);
    }

    #[test]
    fn test_request_priority_score_range() {
        // Minimum score
        let min_priority = PeerExchange::request_priority(-1000, 0);
        assert_eq!(min_priority, 0);

        // Maximum score, no connection time
        let max_score_priority = PeerExchange::request_priority(1000, 0);
        assert_eq!(max_score_priority, 50);

        // Neutral score
        let neutral_priority = PeerExchange::request_priority(0, 0);
        assert_eq!(neutral_priority, 25);
    }

    #[test]
    fn test_request_priority_connection_age() {
        // No connection time
        let zero_age = PeerExchange::request_priority(0, 0);

        // 30 minutes
        let half_hour = PeerExchange::request_priority(0, 1800);

        // 1 hour or more
        let one_hour = PeerExchange::request_priority(0, 3600);
        let two_hours = PeerExchange::request_priority(0, 7200);

        assert!(half_hour > zero_age);
        assert!(one_hour > half_hour);
        // Should cap at 1 hour
        assert_eq!(one_hour, two_hours);
        assert_eq!(one_hour, 25 + 50); // neutral score + max age
    }

    #[test]
    fn test_request_priority_combined() {
        // Best case: max score + max age
        let best = PeerExchange::request_priority(1000, 3600);
        assert_eq!(best, 100);

        // Worst case: min score + no age
        let worst = PeerExchange::request_priority(-1000, 0);
        assert_eq!(worst, 0);
    }
}
