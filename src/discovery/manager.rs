//! Discovery manager - unified coordinator (SPEC_06 §4.1)
//!
//! DiscoveryManager coordinates all peer discovery components:
//! - Peer store (cached peers - Layer 0)
//! - mDNS discovery (LAN peers - Layer 1)
//! - Seed list (introduction points - Layer 3)
//! - Address handler (GETADDR/ADDR - Layer 5)
//! - Peer exchange logic

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use super::addr_handler::AddrHandler;
use super::error::DiscoveryError;
use super::mdns::MdnsDiscovery;
use super::peer_entry::PeerEntry;
use super::peer_exchange::PeerExchange;
use super::peer_key::PeerKey;
use super::peer_store::PeerStore;
use super::seed_list::{default_dev_seeds, SeedEntry};
use crate::network::messages::{AddrPayload, GetAddrPayload, WireAddr};
use crate::types::constants::{MAX_CACHED_PEERS, PEER_MAX_AGE_SECS, RATE_LIMIT_CLEANUP_SECS};

/// Unified coordinator for peer discovery
pub struct DiscoveryManager {
    /// Persistent peer cache
    peer_store: Arc<PeerStore>,
    /// Seed list for bootstrap
    seed_list: Vec<SeedEntry>,
    /// GETADDR/ADDR message handler
    addr_handler: Arc<AddrHandler>,
    /// Peer exchange logic (stateless, kept for future use)
    #[allow(dead_code)]
    peer_exchange: PeerExchange,
}

impl DiscoveryManager {
    /// Create a new discovery manager with the given database path
    pub fn new(db_path: &Path) -> Result<Self, DiscoveryError> {
        let peer_store = Arc::new(PeerStore::open(db_path)?);
        let addr_handler = Arc::new(AddrHandler::new(peer_store.clone()));

        Ok(Self {
            peer_store,
            seed_list: default_dev_seeds(),
            addr_handler,
            peer_exchange: PeerExchange::new(),
        })
    }

    /// Create a discovery manager with a custom seed list
    pub fn with_seeds(db_path: &Path, seeds: Vec<SeedEntry>) -> Result<Self, DiscoveryError> {
        let peer_store = Arc::new(PeerStore::open(db_path)?);
        let addr_handler = Arc::new(AddrHandler::new(peer_store.clone()));

        Ok(Self {
            peer_store,
            seed_list: seeds,
            addr_handler,
            peer_exchange: PeerExchange::new(),
        })
    }

    /// Create an in-memory discovery manager (for testing)
    #[cfg(test)]
    pub fn open_temporary() -> Result<Self, DiscoveryError> {
        let peer_store = Arc::new(PeerStore::open_temporary()?);
        let addr_handler = Arc::new(AddrHandler::new(peer_store.clone()));

        Ok(Self {
            peer_store,
            seed_list: default_dev_seeds(),
            addr_handler,
            peer_exchange: PeerExchange::new(),
        })
    }

    /// Bootstrap: get initial peers to connect to
    ///
    /// Returns peers in priority order:
    /// 1. Cached peers with positive score (Layer 0)
    /// 2. Seed nodes if needed (Layer 3)
    pub fn bootstrap(&self) -> Result<Vec<WireAddr>, DiscoveryError> {
        let mut result = Vec::new();

        // First, get cached peers with positive score, sorted by score
        let mut cached = self.peer_store.get_by_min_score(0)?;
        cached.sort_by(|a, b| b.score.cmp(&a.score)); // Highest score first

        for entry in cached {
            result.push(entry.wire_addr);
        }

        // If we don't have enough cached peers, add seeds
        if result.len() < self.seed_list.len() {
            for seed in &self.seed_list {
                let wire_addr = seed.to_wire_addr();
                // Avoid duplicates
                let key = PeerKey::from_wire_addr(&wire_addr);
                let already_included = result.iter().any(|w| PeerKey::from_wire_addr(w) == key);
                if !already_included {
                    result.push(wire_addr);
                }
            }
        }

        Ok(result)
    }

    /// Discover peers via mDNS on the local network (Layer 1)
    ///
    /// This performs a one-shot mDNS query for `_swimchain._tcp.local` services
    /// and returns any discovered peers as WireAddrs.
    ///
    /// Note: This is an async operation that requires a tokio runtime.
    pub async fn discover_mdns(&self) -> Result<Vec<WireAddr>, DiscoveryError> {
        self.discover_mdns_with_timeout(Duration::from_secs(5)).await
    }

    /// Discover peers via mDNS with a custom timeout
    pub async fn discover_mdns_with_timeout(
        &self,
        timeout: Duration,
    ) -> Result<Vec<WireAddr>, DiscoveryError> {
        let mdns = MdnsDiscovery::new();
        let peers = mdns.discover_with_timeout(timeout).await?;

        // Convert to WireAddrs and add to peer store
        let mut result = Vec::new();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        for peer in peers {
            let wire_addr = peer.to_wire_addr();
            let entry = PeerEntry::new(wire_addr.clone(), now);

            // Add to peer store (ignore errors - peer may already exist)
            let _ = self.peer_store.put(&entry);

            result.push(wire_addr);
        }

        Ok(result)
    }

    /// Create a new mDNS discovery service
    ///
    /// Returns an MdnsDiscovery instance that can be used for continuous
    /// discovery in a background task.
    #[must_use]
    pub fn create_mdns_discovery(&self) -> MdnsDiscovery {
        MdnsDiscovery::new()
    }

    /// Handle an incoming GETADDR request
    pub fn handle_getaddr(
        &self,
        requester: &PeerKey,
        request: &GetAddrPayload,
    ) -> Result<AddrPayload, DiscoveryError> {
        self.addr_handler.handle_getaddr(requester, request)
    }

    /// Handle an incoming ADDR message
    pub fn handle_addr(&self, payload: &AddrPayload) -> Result<(usize, usize), DiscoveryError> {
        self.addr_handler.handle_addr(payload)
    }

    /// Check if we should request peers from a connected peer
    pub fn should_request_peers(&self, peer_score: i16, current_peer_count: usize) -> bool {
        PeerExchange::should_request_peers(peer_score, current_peer_count)
    }

    /// Create a GETADDR request
    pub fn create_getaddr_request(&self) -> GetAddrPayload {
        PeerExchange::create_getaddr_request()
    }

    /// Record a successful connection to a peer
    pub fn record_connection_success(&self, addr: &WireAddr) -> Result<(), DiscoveryError> {
        let key = PeerKey::from_wire_addr(addr);
        self.peer_store.record_success(&key)
    }

    /// Record a failed connection to a peer
    pub fn record_connection_failure(&self, addr: &WireAddr) -> Result<(), DiscoveryError> {
        let key = PeerKey::from_wire_addr(addr);
        self.peer_store.record_failure(&key)
    }

    /// Add a new peer to the store
    pub fn add_peer(&self, entry: &PeerEntry) -> Result<(), DiscoveryError> {
        self.peer_store.put(entry)
    }

    /// Get a peer by key
    pub fn get_peer(&self, key: &PeerKey) -> Result<Option<PeerEntry>, DiscoveryError> {
        self.peer_store.get(key)
    }

    /// Get all peers
    pub fn get_all_peers(&self) -> Result<Vec<PeerEntry>, DiscoveryError> {
        self.peer_store.get_all()
    }

    /// Get count of stored peers
    pub fn peer_count(&self) -> Result<usize, DiscoveryError> {
        self.peer_store.count()
    }

    /// Run periodic maintenance
    ///
    /// This should be called periodically (e.g., every 5 minutes) to:
    /// 1. Remove banned peers (score < PEER_BAN_THRESHOLD)
    /// 2. Remove stale peers (never connected, older than PEER_MAX_AGE_SECS)
    /// 3. Evict if over MAX_CACHED_PEERS
    /// 4. Clean up rate limit entries
    pub fn maintenance(&self) -> Result<MaintenanceStats, DiscoveryError> {
        let mut stats = MaintenanceStats::default();

        // Remove banned peers
        stats.banned_removed = self.peer_store.remove_banned()?;

        // Remove stale peers
        stats.stale_removed = self.peer_store.remove_stale(PEER_MAX_AGE_SECS)?;

        // Evict if needed
        let count = self.peer_store.count()?;
        if count > MAX_CACHED_PEERS {
            stats.evicted = self.peer_store.evict_lowest_scores(MAX_CACHED_PEERS)?;
        }

        // Clean up rate limits
        self.addr_handler
            .cleanup_rate_limits(RATE_LIMIT_CLEANUP_SECS);

        stats.remaining_peers = self.peer_store.count()?;
        Ok(stats)
    }

    /// Flush pending writes to disk
    pub fn flush(&self) -> Result<(), DiscoveryError> {
        self.peer_store.flush()
    }

    /// Get reference to peer store (for advanced operations)
    pub fn peer_store(&self) -> &Arc<PeerStore> {
        &self.peer_store
    }

    /// Get reference to addr handler (for advanced operations)
    pub fn addr_handler(&self) -> &Arc<AddrHandler> {
        &self.addr_handler
    }
}

/// Statistics from maintenance run
#[derive(Debug, Clone, Default)]
pub struct MaintenanceStats {
    /// Number of banned peers removed
    pub banned_removed: usize,
    /// Number of stale peers removed
    pub stale_removed: usize,
    /// Number of low-score peers evicted
    pub evicted: usize,
    /// Remaining peer count
    pub remaining_peers: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::constants::DEFAULT_PORT;

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

    fn current_timestamp() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn make_entry(port: u16, score: i16) -> PeerEntry {
        let mut entry = PeerEntry::new(make_wire_addr(port), current_timestamp());
        entry.score = score;
        entry
    }

    #[test]
    fn test_bootstrap_from_seeds_when_empty() {
        let manager = DiscoveryManager::open_temporary().unwrap();
        let peers = manager.bootstrap().unwrap();

        // Should return dev seeds (3 localhost entries)
        assert_eq!(peers.len(), 3);

        // All should be localhost
        for peer in &peers {
            assert_eq!(peer.transport, 0x01);
            assert_eq!(&peer.address[0..4], &[127, 0, 0, 1]);
        }
    }

    #[test]
    fn test_bootstrap_prefers_cached_peers() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        // Add some cached peers with high scores
        for i in 0..10 {
            let entry = make_entry(9800 + i, 100 + i as i16);
            manager.add_peer(&entry).unwrap();
        }

        let peers = manager.bootstrap().unwrap();

        // Should have 10 cached + 3 seeds = 13 total
        // But only if seeds aren't duplicates
        assert!(peers.len() >= 10);

        // First 10 should be the cached peers (sorted by score, highest first)
        for i in 0..10 {
            assert_eq!(peers[i].port, 9809 - i as u16);
        }
    }

    #[test]
    fn test_bootstrap_avoids_duplicate_seeds() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        // Add a cached peer that matches a seed (localhost:9735)
        let entry = make_entry(DEFAULT_PORT, 100);
        manager.add_peer(&entry).unwrap();

        let peers = manager.bootstrap().unwrap();

        // Should have 1 cached + 2 non-duplicate seeds = 3
        assert_eq!(peers.len(), 3);
    }

    #[test]
    fn test_handle_addr_and_get_all() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        let payload = AddrPayload {
            addresses: vec![
                make_wire_addr(9735),
                make_wire_addr(9736),
                make_wire_addr(9737),
            ],
        };

        let (new_count, _) = manager.handle_addr(&payload).unwrap();
        assert_eq!(new_count, 3);

        let all = manager.get_all_peers().unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_record_connection_success_and_failure() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        let entry = make_entry(9735, 100);
        manager.add_peer(&entry).unwrap();

        let addr = make_wire_addr(9735);
        let key = PeerKey::from_wire_addr(&addr);

        // Record success
        manager.record_connection_success(&addr).unwrap();
        let updated = manager.get_peer(&key).unwrap().unwrap();
        assert_eq!(updated.score, 110);

        // Record failure
        manager.record_connection_failure(&addr).unwrap();
        let updated = manager.get_peer(&key).unwrap().unwrap();
        assert_eq!(updated.score, 90);
    }

    #[test]
    fn test_maintenance_removes_banned() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        manager.add_peer(&make_entry(9735, 100)).unwrap();
        manager.add_peer(&make_entry(9736, -600)).unwrap(); // Banned
        manager.add_peer(&make_entry(9737, -501)).unwrap(); // Banned

        let stats = manager.maintenance().unwrap();
        assert_eq!(stats.banned_removed, 2);
        assert_eq!(stats.remaining_peers, 1);
    }

    #[test]
    fn test_maintenance_evicts_when_over_limit() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        // Add MAX_CACHED_PEERS + 10 entries
        for i in 0..(MAX_CACHED_PEERS + 10) as u16 {
            let entry = make_entry(8000 + i, i as i16);
            manager.add_peer(&entry).unwrap();
        }

        assert_eq!(manager.peer_count().unwrap(), MAX_CACHED_PEERS + 10);

        let stats = manager.maintenance().unwrap();
        assert_eq!(stats.evicted, 10);
        assert_eq!(stats.remaining_peers, MAX_CACHED_PEERS);
    }

    #[test]
    fn test_should_request_peers() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        assert!(manager.should_request_peers(100, 5));
        assert!(!manager.should_request_peers(-10, 5));
        assert!(!manager.should_request_peers(100, 30));
    }

    #[test]
    fn test_create_getaddr_request() {
        let manager = DiscoveryManager::open_temporary().unwrap();
        let request = manager.create_getaddr_request();

        assert_eq!(request.fork_id, [0u8; 32]);
        assert_eq!(request.max_addrs, 1000);
    }

    #[test]
    fn test_peer_count() {
        let manager = DiscoveryManager::open_temporary().unwrap();

        assert_eq!(manager.peer_count().unwrap(), 0);

        manager.add_peer(&make_entry(9735, 100)).unwrap();
        assert_eq!(manager.peer_count().unwrap(), 1);

        manager.add_peer(&make_entry(9736, 100)).unwrap();
        assert_eq!(manager.peer_count().unwrap(), 2);
    }
}
