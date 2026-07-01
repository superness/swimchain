//! GETADDR/ADDR message handler (SPEC_06 §5.2.2-3)
//!
//! Handles incoming GETADDR requests (with rate limiting) and processes
//! incoming ADDR messages (with validation per V-PEER-04).

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use super::error::DiscoveryError;
use super::peer_entry::PeerEntry;
use super::peer_key::PeerKey;
use super::peer_store::PeerStore;
use crate::network::messages::{AddrPayload, GetAddrPayload, WireAddr};
use crate::types::constants::{GETADDR_RATE_LIMIT_SECS, MAX_ADDRS_PER_MESSAGE};

/// Handler for GETADDR/ADDR message processing
pub struct AddrHandler {
    /// Reference to the peer store
    peer_store: std::sync::Arc<PeerStore>,
    /// Rate limit tracking: PeerKey -> last request time
    rate_limits: RwLock<HashMap<Vec<u8>, Instant>>,
}

impl AddrHandler {
    /// Create a new AddrHandler
    pub fn new(peer_store: std::sync::Arc<PeerStore>) -> Self {
        Self {
            peer_store,
            rate_limits: RwLock::new(HashMap::new()),
        }
    }

    /// Handle a GETADDR request from a peer
    ///
    /// Returns addresses to send in response, or an error if rate limited.
    /// Respects V-PEER-04: max 1000 addresses per message.
    pub fn handle_getaddr(
        &self,
        requester: &PeerKey,
        request: &GetAddrPayload,
    ) -> Result<AddrPayload, DiscoveryError> {
        // Check rate limit
        self.check_rate_limit(requester)?;

        // Update rate limit timestamp
        self.update_rate_limit(requester);

        // Determine how many addresses to return
        let max_addrs = (request.max_addrs as usize).min(MAX_ADDRS_PER_MESSAGE);

        // Get peers with positive score
        let mut peers = self.peer_store.get_by_min_score(0)?;

        // Sort by score descending (best peers first)
        peers.sort_by(|a, b| b.score.cmp(&a.score));

        // Convert to WireAddrs, limited by max_addrs and V-PEER-04 limit
        let addresses: Vec<WireAddr> = peers
            .into_iter()
            .take(max_addrs)
            .map(|e| e.wire_addr)
            .collect();

        Ok(AddrPayload { addresses })
    }

    /// Handle an incoming ADDR message
    ///
    /// Validates and stores new peer addresses.
    /// Returns (new_count, duplicate_count).
    pub fn handle_addr(&self, addr: &AddrPayload) -> Result<(usize, usize), DiscoveryError> {
        // V-PEER-04: Reject if too many addresses
        if addr.addresses.len() > MAX_ADDRS_PER_MESSAGE {
            return Err(DiscoveryError::TooManyAddresses {
                count: addr.addresses.len(),
                max: MAX_ADDRS_PER_MESSAGE,
            });
        }

        let mut new_count = 0;
        let mut dup_count = 0;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        for wire_addr in &addr.addresses {
            // Validate transport type
            if !Self::is_valid_transport(wire_addr.transport) {
                continue; // Skip invalid transports
            }

            let key = PeerKey::from_wire_addr(wire_addr);

            // Check if already exists
            if let Ok(Some(existing)) = self.peer_store.get(&key) {
                // Update last_seen if newer
                if wire_addr.last_seen > existing.wire_addr.last_seen {
                    let mut updated = existing;
                    updated.wire_addr.last_seen = wire_addr.last_seen;
                    updated.wire_addr.services = wire_addr.services;
                    self.peer_store.put(&updated)?;
                }
                dup_count += 1;
            } else {
                // New peer
                let entry = PeerEntry::new(wire_addr.clone(), now);
                self.peer_store.put(&entry)?;
                new_count += 1;
            }
        }

        Ok((new_count, dup_count))
    }

    /// Check if the requester is rate limited
    fn check_rate_limit(&self, requester: &PeerKey) -> Result<(), DiscoveryError> {
        let limits = self.rate_limits.read().unwrap();
        let key = requester.as_bytes().to_vec();

        if let Some(last_request) = limits.get(&key) {
            let elapsed = last_request.elapsed().as_secs();
            if elapsed < GETADDR_RATE_LIMIT_SECS {
                return Err(DiscoveryError::RateLimited {
                    elapsed_secs: elapsed,
                    required_secs: GETADDR_RATE_LIMIT_SECS,
                });
            }
        }

        Ok(())
    }

    /// Update the rate limit timestamp for a requester
    fn update_rate_limit(&self, requester: &PeerKey) {
        let mut limits = self.rate_limits.write().unwrap();
        let key = requester.as_bytes().to_vec();
        limits.insert(key, Instant::now());
    }

    /// Clean up stale rate limit entries
    ///
    /// Removes entries older than cleanup_age_secs.
    pub fn cleanup_rate_limits(&self, cleanup_age_secs: u64) {
        let mut limits = self.rate_limits.write().unwrap();
        let cutoff = Duration::from_secs(cleanup_age_secs);
        limits.retain(|_, instant| instant.elapsed() < cutoff);
    }

    /// Validate transport type
    fn is_valid_transport(transport: u8) -> bool {
        matches!(transport, 0x01 | 0x02 | 0x03 | 0x04 | 0x05)
    }

    /// Get the number of tracked rate limits (for testing/monitoring)
    #[cfg(test)]
    pub fn rate_limit_count(&self) -> usize {
        self.rate_limits.read().unwrap().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn make_wire_addr(port: u16) -> WireAddr {
        let mut address = [0u8; 64];
        address[0] = 127;
        address[1] = 0;
        address[2] = 0;
        address[3] = 1;
        WireAddr {
            transport: 0x01,
            address,
            port,
            services: 0x01,
            last_seen: 1700000000,
        }
    }

    fn setup_handler() -> (AddrHandler, Arc<PeerStore>) {
        let store = Arc::new(PeerStore::open_temporary().unwrap());
        let handler = AddrHandler::new(store.clone());
        (handler, store)
    }

    #[test]
    fn test_handle_getaddr_empty_store() {
        let (handler, _store) = setup_handler();
        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let request = GetAddrPayload::default();

        let result = handler.handle_getaddr(&requester, &request).unwrap();
        assert!(result.addresses.is_empty());
    }

    #[test]
    fn test_handle_getaddr_returns_positive_score_peers() {
        let (handler, store) = setup_handler();

        // Add some peers
        let mut entry1 = PeerEntry::new(make_wire_addr(9735), 1700000000);
        entry1.score = 100;
        let mut entry2 = PeerEntry::new(make_wire_addr(9736), 1700000000);
        entry2.score = -50; // Negative, should not be included
        let mut entry3 = PeerEntry::new(make_wire_addr(9737), 1700000000);
        entry3.score = 200;

        store.put(&entry1).unwrap();
        store.put(&entry2).unwrap();
        store.put(&entry3).unwrap();

        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let request = GetAddrPayload::default();

        let result = handler.handle_getaddr(&requester, &request).unwrap();
        assert_eq!(result.addresses.len(), 2);
    }

    #[test]
    fn test_handle_getaddr_respects_max_addrs() {
        let (handler, store) = setup_handler();

        // Add 100 peers
        for i in 0..100 {
            let mut entry = PeerEntry::new(make_wire_addr(9700 + i), 1700000000);
            entry.score = 100;
            store.put(&entry).unwrap();
        }

        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let mut request = GetAddrPayload::default();
        request.max_addrs = 10;

        let result = handler.handle_getaddr(&requester, &request).unwrap();
        assert_eq!(result.addresses.len(), 10);
    }

    #[test]
    fn test_handle_getaddr_rate_limited() {
        let (handler, _store) = setup_handler();
        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let request = GetAddrPayload::default();

        // First request should succeed
        handler.handle_getaddr(&requester, &request).unwrap();

        // Second request immediately after should be rate limited
        let result = handler.handle_getaddr(&requester, &request);
        assert!(matches!(result, Err(DiscoveryError::RateLimited { .. })));
    }

    #[test]
    fn test_handle_getaddr_v_peer_04_limit() {
        let (handler, store) = setup_handler();

        // Add 1500 peers
        for i in 0..1500 {
            let mut entry = PeerEntry::new(make_wire_addr(8000 + i), 1700000000);
            entry.score = 100;
            store.put(&entry).unwrap();
        }

        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let mut request = GetAddrPayload::default();
        request.max_addrs = 2000; // Request more than V-PEER-04 allows

        let result = handler.handle_getaddr(&requester, &request).unwrap();
        assert_eq!(result.addresses.len(), 1000); // Should be capped at 1000
    }

    #[test]
    fn test_handle_addr_new_peers() {
        let (handler, store) = setup_handler();

        let payload = AddrPayload {
            addresses: vec![
                make_wire_addr(9735),
                make_wire_addr(9736),
                make_wire_addr(9737),
            ],
        };

        let (new_count, dup_count) = handler.handle_addr(&payload).unwrap();
        assert_eq!(new_count, 3);
        assert_eq!(dup_count, 0);
        assert_eq!(store.count().unwrap(), 3);
    }

    #[test]
    fn test_handle_addr_duplicate_peers() {
        let (handler, store) = setup_handler();

        // First add some peers
        let payload = AddrPayload {
            addresses: vec![make_wire_addr(9735), make_wire_addr(9736)],
        };
        handler.handle_addr(&payload).unwrap();

        // Now add overlapping set
        let payload2 = AddrPayload {
            addresses: vec![
                make_wire_addr(9735), // duplicate
                make_wire_addr(9737), // new
            ],
        };

        let (new_count, dup_count) = handler.handle_addr(&payload2).unwrap();
        assert_eq!(new_count, 1);
        assert_eq!(dup_count, 1);
        assert_eq!(store.count().unwrap(), 3);
    }

    #[test]
    fn test_handle_addr_v_peer_04_validation() {
        let (handler, _store) = setup_handler();

        // Create payload with too many addresses
        let addresses: Vec<WireAddr> = (0..1001).map(|i| make_wire_addr(8000 + i)).collect();

        let payload = AddrPayload { addresses };

        let result = handler.handle_addr(&payload);
        assert!(matches!(
            result,
            Err(DiscoveryError::TooManyAddresses {
                count: 1001,
                max: 1000
            })
        ));
    }

    #[test]
    fn test_handle_addr_invalid_transport_skipped() {
        let (handler, store) = setup_handler();

        let mut valid = make_wire_addr(9735);
        valid.transport = 0x01; // Valid

        let mut invalid = make_wire_addr(9736);
        invalid.transport = 0xFF; // Invalid

        let payload = AddrPayload {
            addresses: vec![valid, invalid],
        };

        let (new_count, dup_count) = handler.handle_addr(&payload).unwrap();
        assert_eq!(new_count, 1);
        assert_eq!(dup_count, 0);
        assert_eq!(store.count().unwrap(), 1);
    }

    #[test]
    fn test_cleanup_rate_limits() {
        let (handler, _store) = setup_handler();
        let requester = PeerKey::from_wire_addr(&make_wire_addr(9999));
        let request = GetAddrPayload::default();

        // Make a request
        handler.handle_getaddr(&requester, &request).unwrap();
        assert_eq!(handler.rate_limit_count(), 1);

        // Cleanup with short age should remove it
        handler.cleanup_rate_limits(0);
        assert_eq!(handler.rate_limit_count(), 0);
    }

    #[test]
    fn test_is_valid_transport() {
        assert!(AddrHandler::is_valid_transport(0x01)); // TcpV4
        assert!(AddrHandler::is_valid_transport(0x02)); // TcpV6
        assert!(AddrHandler::is_valid_transport(0x03)); // Tor
        assert!(AddrHandler::is_valid_transport(0x04)); // I2P
        assert!(AddrHandler::is_valid_transport(0x05)); // Quic
        assert!(!AddrHandler::is_valid_transport(0x00));
        assert!(!AddrHandler::is_valid_transport(0x06));
        assert!(!AddrHandler::is_valid_transport(0xFF));
    }
}
