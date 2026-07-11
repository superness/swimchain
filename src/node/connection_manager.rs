//! Connection Manager (SPEC_10 §4)
//!
//! The ConnectionManager is responsible for:
//! - Tracking active peer connections
//! - Enforcing connection limits (inbound/outbound/total)
//! - Managing peer selection for new connections
//! - Handling reconnection with exponential backoff
//! - Emitting connection lifecycle events
//! - Integrating with PeerStore for score updates
//!
//! # Thread Safety
//!
//! ConnectionManager uses interior mutability with `Arc<RwLock<>>` to allow
//! concurrent access from multiple async tasks.
//!
//! # Example
//!
//! ```no_run
//! use swimchain::node::{ConnectionManager, ConnectionConfig};
//! use swimchain::discovery::PeerStore;
//! use std::sync::Arc;
//!
//! fn example(peer_store: Arc<PeerStore>) {
//!     let config = ConnectionConfig::default();
//!     let manager = ConnectionManager::new(config, peer_store);
//!
//!     // Subscribe to events
//!     let mut rx = manager.subscribe();
//!
//!     // Check connection limits
//!     if manager.can_accept_inbound() {
//!         // Accept new inbound connection...
//!     }
//! }
//! ```

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use log::{debug, info, warn};
use rand::Rng;
use tokio::sync::broadcast;

use crate::discovery::{PeerEntry, PeerKey, PeerStore};
use crate::transport::ConnectionDirection;
use crate::types::constants::{
    BAN_DURATION_SECS, CONNECTION_MIN_PEERS, CONNECTION_TARGET_PEERS, MAX_CONNECTIONS,
    MAX_INBOUND_CONNECTIONS, MAX_OUTBOUND_CONNECTIONS, PROTOCOL_VIOLATION_BAN_THRESHOLD,
    RECONNECT_BASE_DELAY_SECS, RECONNECT_FACTOR, RECONNECT_JITTER_PERCENT,
    RECONNECT_MAX_DELAY_SECS,
};

use super::connection_event::{ConnectionError, ConnectionEvent, DisconnectReason};

/// Configuration for connection management
#[derive(Debug, Clone)]
pub struct ConnectionConfig {
    /// Maximum inbound connections (default: MAX_INBOUND_CONNECTIONS = 400)
    pub max_inbound: usize,
    /// Maximum outbound connections (default: MAX_OUTBOUND_CONNECTIONS = 100)
    pub max_outbound: usize,
    /// Target number of peers (default: CONNECTION_TARGET_PEERS = 25)
    pub target_peers: usize,
    /// Minimum peers before bootstrap (default: CONNECTION_MIN_PEERS = 8)
    pub min_peers: usize,
    /// Maximum total connections (default: MAX_CONNECTIONS = 500)
    pub max_connections: usize,
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        Self {
            max_inbound: MAX_INBOUND_CONNECTIONS,
            max_outbound: MAX_OUTBOUND_CONNECTIONS,
            target_peers: CONNECTION_TARGET_PEERS,
            min_peers: CONNECTION_MIN_PEERS,
            max_connections: MAX_CONNECTIONS,
        }
    }
}

impl ConnectionConfig {
    /// Create a test configuration with lower limits
    #[cfg(test)]
    pub fn for_test() -> Self {
        Self {
            max_inbound: 5,
            max_outbound: 3,
            target_peers: 3,
            min_peers: 1,
            max_connections: 8,
        }
    }
}

/// Handle representing an active connection
#[derive(Debug, Clone)]
pub struct ConnectionHandle {
    /// Peer's node ID (32-byte public key hash)
    pub peer_id: [u8; 32],
    /// Connection direction (inbound/outbound)
    pub direction: ConnectionDirection,
    /// When connection was established
    pub connected_at: Instant,
    /// Remote socket address
    pub remote_addr: SocketAddr,
}

/// State for reconnection with exponential backoff
#[derive(Debug, Clone)]
pub struct ReconnectState {
    /// Peer address key
    pub peer_key: PeerKey,
    /// Number of reconnection attempts
    pub attempt_count: u32,
    /// When next attempt is allowed
    pub next_attempt_at: Instant,
    /// Last connection error
    pub last_error: Option<ConnectionError>,
}

/// Errors from connection management operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionManagerError {
    /// Connection limit exceeded
    LimitExceeded,
    /// Peer is banned
    PeerBanned,
    /// Peer is already connected
    AlreadyConnected,
    /// Peer not found
    PeerNotFound,
}

impl std::fmt::Display for ConnectionManagerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LimitExceeded => write!(f, "connection limit exceeded"),
            Self::PeerBanned => write!(f, "peer is banned"),
            Self::AlreadyConnected => write!(f, "peer already connected"),
            Self::PeerNotFound => write!(f, "peer not found"),
        }
    }
}

impl std::error::Error for ConnectionManagerError {}

/// Inner state protected by RwLock
struct ConnectionManagerInner {
    /// Active connections by peer_id
    connections: HashMap<[u8; 32], ConnectionHandle>,
    /// Reconnection state by peer address
    reconnect_state: HashMap<PeerKey, ReconnectState>,
    /// Time-based bans by peer_id
    banned_until: HashMap<[u8; 32], Instant>,
    /// Protocol violation counts by peer_id
    violation_counts: HashMap<[u8; 32], u16>,
}

impl ConnectionManagerInner {
    fn new() -> Self {
        Self {
            connections: HashMap::new(),
            reconnect_state: HashMap::new(),
            banned_until: HashMap::new(),
            violation_counts: HashMap::new(),
        }
    }
}

/// Connection Manager - tracks peer connections and enforces limits
///
/// The ConnectionManager provides thread-safe management of peer connections
/// with support for:
/// - Inbound/outbound connection limits
/// - Peer selection based on scores
/// - Automatic reconnection with exponential backoff
/// - Connection event broadcasting
/// - PeerStore integration for score updates
pub struct ConnectionManager {
    /// Inner state protected by RwLock
    inner: Arc<RwLock<ConnectionManagerInner>>,
    /// Event broadcast channel sender
    event_tx: broadcast::Sender<ConnectionEvent>,
    /// Configuration
    config: ConnectionConfig,
    /// Reference to PeerStore for score updates
    peer_store: Arc<PeerStore>,
}

impl ConnectionManager {
    /// Broadcast channel capacity
    const EVENT_CHANNEL_CAPACITY: usize = 1024;

    /// Create a new ConnectionManager
    pub fn new(config: ConnectionConfig, peer_store: Arc<PeerStore>) -> Self {
        let (event_tx, _) = broadcast::channel(Self::EVENT_CHANNEL_CAPACITY);

        Self {
            inner: Arc::new(RwLock::new(ConnectionManagerInner::new())),
            event_tx,
            config,
            peer_store,
        }
    }

    /// Subscribe to connection events
    ///
    /// Returns a broadcast receiver for connection lifecycle events.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<ConnectionEvent> {
        self.event_tx.subscribe()
    }

    /// Get the configuration
    #[must_use]
    pub fn config(&self) -> &ConnectionConfig {
        &self.config
    }

    // ========== Connection Counts ==========

    /// Get the number of inbound connections
    #[must_use]
    pub fn inbound_count(&self) -> usize {
        let inner = self.inner.read().unwrap();
        inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Inbound)
            .count()
    }

    /// Get the number of outbound connections
    #[must_use]
    pub fn outbound_count(&self) -> usize {
        let inner = self.inner.read().unwrap();
        inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Outbound)
            .count()
    }

    /// Get the total number of connections
    #[must_use]
    pub fn connection_count(&self) -> usize {
        let inner = self.inner.read().unwrap();
        inner.connections.len()
    }

    /// Check if we can accept a new inbound connection
    #[must_use]
    pub fn can_accept_inbound(&self) -> bool {
        let inner = self.inner.read().unwrap();
        let inbound = inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Inbound)
            .count();
        let total = inner.connections.len();
        inbound < self.config.max_inbound && total < self.config.max_connections
    }

    /// Check if we can make a new outbound connection
    #[must_use]
    pub fn can_connect_outbound(&self) -> bool {
        let inner = self.inner.read().unwrap();
        let outbound = inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Outbound)
            .count();
        let total = inner.connections.len();
        outbound < self.config.max_outbound && total < self.config.max_connections
    }

    /// Check if a peer is connected
    #[must_use]
    pub fn is_connected(&self, peer_id: &[u8; 32]) -> bool {
        let inner = self.inner.read().unwrap();
        inner.connections.contains_key(peer_id)
    }

    /// Check if we need more peers (below target)
    #[must_use]
    pub fn needs_more_peers(&self) -> bool {
        let inner = self.inner.read().unwrap();
        inner.connections.len() < self.config.target_peers
    }

    /// Check if we need bootstrap (below minimum)
    #[must_use]
    pub fn needs_bootstrap(&self) -> bool {
        let inner = self.inner.read().unwrap();
        inner.connections.len() < self.config.min_peers
    }

    // ========== Connection Management ==========

    /// Add a new connection
    ///
    /// This is called after a successful handshake to register the connection.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Connection limits are exceeded
    /// - Peer is banned
    /// - Peer is already connected
    pub fn add_connection(
        &self,
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection,
    ) -> Result<(), ConnectionManagerError> {
        let mut inner = self.inner.write().unwrap();

        // If we already track a connection for this peer, this is a reconnect.
        // The previous socket has almost certainly gone half-open — a NAT'd peer
        // whose old connection wedged, or a stuck handler that never observed the
        // disconnect. A live peer does not open a duplicate, so prefer the NEW
        // connection: drop the stale handle so the caller can register the
        // replacement (ConnectionPool::add overwrites the socket, so later sends
        // use the fresh connection).
        //
        // Previously this returned AlreadyConnected, so a single wedged
        // connection blocked the peer from EVER reconnecting until a restart
        // ("peer already connected" forever) — the seed-node symptom that
        // stranded a mobile peer mid-resync. We deliberately do NOT emit a
        // Disconnected event for the old handle: the replacement emits Connected
        // just below, and firing Disconnected here could race a subscriber into
        // tearing down the fresh connection.
        if let Some(old) = inner.connections.remove(&peer_id) {
            warn!(
                "[CONN] Replacing stale {:?} connection to {} ({}) with new {:?} from {}",
                old.direction,
                hex::encode(&peer_id[..8]),
                old.remote_addr,
                direction,
                addr,
            );
        }

        // Check if banned
        if let Some(&ban_until) = inner.banned_until.get(&peer_id) {
            if Instant::now() < ban_until {
                return Err(ConnectionManagerError::PeerBanned);
            }
            // Ban expired, remove it
            inner.banned_until.remove(&peer_id);
        }

        // Check connection limits
        let inbound_count = inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Inbound)
            .count();
        let outbound_count = inner
            .connections
            .values()
            .filter(|c| c.direction == ConnectionDirection::Outbound)
            .count();
        let total_count = inner.connections.len();

        match direction {
            ConnectionDirection::Inbound => {
                if inbound_count >= self.config.max_inbound {
                    return Err(ConnectionManagerError::LimitExceeded);
                }
            }
            ConnectionDirection::Outbound => {
                if outbound_count >= self.config.max_outbound {
                    return Err(ConnectionManagerError::LimitExceeded);
                }
            }
        }

        if total_count >= self.config.max_connections {
            return Err(ConnectionManagerError::LimitExceeded);
        }

        // Add connection
        let handle = ConnectionHandle {
            peer_id,
            direction,
            connected_at: Instant::now(),
            remote_addr: addr,
        };
        inner.connections.insert(peer_id, handle);

        // Drop lock before emitting event
        drop(inner);

        // Add peer to peer store for GETADDR discovery
        // This ensures other nodes can discover peers we're connected to
        if let Some(wire_addr) = socket_addr_to_wire_addr(&addr) {
            use crate::discovery::PeerEntry;
            use std::time::{SystemTime, UNIX_EPOCH};

            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let mut entry = PeerEntry::new(wire_addr, now);
            entry.record_success(now); // Mark as successful since we connected

            if let Err(e) = self.peer_store.put(&entry) {
                debug!("Failed to add peer to store: {}", e);
            } else {
                debug!("Added connected peer to store: {}", addr);
            }
        }

        // Emit connected event
        let event = ConnectionEvent::Connected {
            peer_id,
            addr,
            direction,
        };
        let _ = self.event_tx.send(event);

        info!(
            "Connection added: peer={}, addr={}, direction={:?}",
            hex::encode(&peer_id[..8]),
            addr,
            direction
        );

        Ok(())
    }

    /// Remove a connection
    ///
    /// Returns the removed connection handle if found.
    pub fn remove_connection(
        &self,
        peer_id: &[u8; 32],
        reason: DisconnectReason,
    ) -> Option<ConnectionHandle> {
        let mut inner = self.inner.write().unwrap();
        let handle = inner.connections.remove(peer_id)?;

        // Track protocol violations
        if let DisconnectReason::ProtocolViolation(_) = &reason {
            let count = inner.violation_counts.entry(*peer_id).or_insert(0);
            *count = count.saturating_add(1);

            // Check if should ban
            if *count >= PROTOCOL_VIOLATION_BAN_THRESHOLD {
                let ban_until = Instant::now() + Duration::from_secs(BAN_DURATION_SECS);
                inner.banned_until.insert(*peer_id, ban_until);
                inner.violation_counts.remove(peer_id);
                warn!(
                    "Peer banned for {} protocol violations: {}",
                    PROTOCOL_VIOLATION_BAN_THRESHOLD,
                    hex::encode(&peer_id[..8])
                );
            }
        }

        // Drop lock before emitting event
        drop(inner);

        // Emit disconnected event
        let event = ConnectionEvent::Disconnected {
            peer_id: *peer_id,
            reason: reason.clone(),
        };
        let _ = self.event_tx.send(event);

        info!(
            "Connection removed: peer={}, reason={}",
            hex::encode(&peer_id[..8]),
            reason
        );

        Some(handle)
    }

    /// Get a copy of all connection handles
    #[must_use]
    pub fn get_connections(&self) -> Vec<ConnectionHandle> {
        let inner = self.inner.read().unwrap();
        inner.connections.values().cloned().collect()
    }

    /// Get a connection handle by peer ID
    #[must_use]
    pub fn get_connection(&self, peer_id: &[u8; 32]) -> Option<ConnectionHandle> {
        let inner = self.inner.read().unwrap();
        inner.connections.get(peer_id).cloned()
    }

    // ========== Ban Management ==========

    /// Check if a peer is banned
    #[must_use]
    pub fn is_banned(&self, peer_id: &[u8; 32]) -> bool {
        let inner = self.inner.read().unwrap();
        if let Some(&ban_until) = inner.banned_until.get(peer_id) {
            Instant::now() < ban_until
        } else {
            false
        }
    }

    /// Ban a peer for a duration
    pub fn ban_peer(&self, peer_id: [u8; 32], duration: Duration) {
        let mut inner = self.inner.write().unwrap();
        let ban_until = Instant::now() + duration;
        inner.banned_until.insert(peer_id, ban_until);
        info!(
            "Peer banned for {}s: {}",
            duration.as_secs(),
            hex::encode(&peer_id[..8])
        );
    }

    /// Unban a peer
    pub fn unban_peer(&self, peer_id: &[u8; 32]) {
        let mut inner = self.inner.write().unwrap();
        inner.banned_until.remove(peer_id);
        inner.violation_counts.remove(peer_id);
    }

    /// Clean up expired bans
    pub fn cleanup_expired_bans(&self) {
        let mut inner = self.inner.write().unwrap();
        let now = Instant::now();
        inner
            .banned_until
            .retain(|_, &mut ban_until| ban_until > now);
    }

    // ========== Peer Selection ==========

    /// Select peers to connect to based on scores
    ///
    /// Returns a list of peer entries, prioritized by:
    /// 1. Score (descending)
    /// 2. Last success time (descending)
    ///
    /// Excludes already-connected peers and banned peers.
    #[must_use]
    pub fn select_peers_to_connect(&self) -> Vec<PeerEntry> {
        let inner = self.inner.read().unwrap();

        // Get all peers from store
        let mut candidates = self.peer_store.get_all().unwrap_or_default();

        // Get connected peer addresses for filtering
        let connected_addrs: std::collections::HashSet<SocketAddr> =
            inner.connections.values().map(|c| c.remote_addr).collect();

        // Filter out connected and banned peers
        // Note: We can't easily check banned by peer_id since PeerEntry doesn't have peer_id
        // The peer_id is only known after handshake, so ban checking happens at connection time
        candidates.retain(|entry| {
            // Check if already connected by address
            let socket_addr = wire_addr_to_socket_addr(&entry.wire_addr);
            if let Some(addr) = socket_addr {
                if connected_addrs.contains(&addr) {
                    return false;
                }
            }
            true
        });

        // Sort by score (descending), then by last_success (descending)
        candidates.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then(b.last_success.cmp(&a.last_success))
        });

        // Take up to (target_peers - current_peers) candidates
        let needed = self
            .config
            .target_peers
            .saturating_sub(inner.connections.len());
        candidates.truncate(needed);

        candidates
    }

    // ========== Reconnection ==========

    /// Schedule a reconnection attempt for a peer
    pub fn schedule_reconnect(&self, peer_key: PeerKey, error: Option<ConnectionError>) {
        let mut inner = self.inner.write().unwrap();

        let state = inner
            .reconnect_state
            .entry(peer_key.clone())
            .or_insert_with(|| ReconnectState {
                peer_key: peer_key.clone(),
                attempt_count: 0,
                next_attempt_at: Instant::now(),
                last_error: None,
            });

        state.attempt_count = state.attempt_count.saturating_add(1);
        state.next_attempt_at = Instant::now() + calculate_backoff(state.attempt_count);
        state.last_error = error;

        debug!(
            "Scheduled reconnect for peer (attempt {})",
            state.attempt_count
        );
    }

    /// Get peers that are ready for reconnection
    #[must_use]
    pub fn get_peers_to_reconnect(&self) -> Vec<PeerKey> {
        let inner = self.inner.read().unwrap();
        let now = Instant::now();

        inner
            .reconnect_state
            .values()
            .filter(|state| state.next_attempt_at <= now)
            .map(|state| state.peer_key.clone())
            .collect()
    }

    /// Clear reconnection state for a peer (called on successful connection)
    pub fn clear_reconnect_state(&self, peer_key: &PeerKey) {
        let mut inner = self.inner.write().unwrap();
        inner.reconnect_state.remove(peer_key);
    }

    /// Get reconnection state for a peer
    #[must_use]
    pub fn get_reconnect_state(&self, peer_key: &PeerKey) -> Option<ReconnectState> {
        let inner = self.inner.read().unwrap();
        inner.reconnect_state.get(peer_key).cloned()
    }

    // ========== Event Emission ==========

    /// Emit a message received event
    pub fn emit_message_received(
        &self,
        peer_id: [u8; 32],
        message_type: u8,
        fork_id: [u8; 32],
        payload: Vec<u8>,
    ) {
        let event = ConnectionEvent::MessageReceived {
            peer_id,
            message_type,
            fork_id,
            payload,
        };
        let _ = self.event_tx.send(event);
    }

    /// Emit a connection error event
    pub fn emit_error(&self, peer_id: [u8; 32], error: ConnectionError) {
        let event = ConnectionEvent::Error { peer_id, error };
        let _ = self.event_tx.send(event);
    }
}

/// Calculate exponential backoff with jitter
fn calculate_backoff(attempts: u32) -> Duration {
    let base = RECONNECT_BASE_DELAY_SECS;
    let max = RECONNECT_MAX_DELAY_SECS;
    let factor = RECONNECT_FACTOR;

    // Exponential backoff: base * factor^attempts, capped at max
    let delay_secs = std::cmp::min(
        base.saturating_mul((factor as u64).saturating_pow(attempts)),
        max,
    );

    // Add jitter: ±RECONNECT_JITTER_PERCENT%
    let jitter_range = delay_secs * RECONNECT_JITTER_PERCENT as u64 / 100;
    if jitter_range > 0 {
        let jitter = rand::thread_rng().gen_range(0..=jitter_range * 2);
        let final_secs = delay_secs
            .saturating_add(jitter)
            .saturating_sub(jitter_range)
            .max(1);
        Duration::from_secs(final_secs)
    } else {
        Duration::from_secs(delay_secs.max(1))
    }
}

/// Convert WireAddr to SocketAddr
fn wire_addr_to_socket_addr(wire_addr: &crate::network::messages::WireAddr) -> Option<SocketAddr> {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    match wire_addr.transport {
        0x01 => {
            // TCPv4
            let ip = Ipv4Addr::new(
                wire_addr.address[0],
                wire_addr.address[1],
                wire_addr.address[2],
                wire_addr.address[3],
            );
            Some(SocketAddr::new(IpAddr::V4(ip), wire_addr.port))
        }
        0x02 => {
            // TCPv6
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&wire_addr.address[..16]);
            let ip = Ipv6Addr::from(bytes);
            Some(SocketAddr::new(IpAddr::V6(ip), wire_addr.port))
        }
        _ => None,
    }
}

/// Convert SocketAddr to WireAddr for peer store
pub(crate) fn socket_addr_to_wire_addr(
    addr: &SocketAddr,
) -> Option<crate::network::messages::WireAddr> {
    use crate::network::messages::WireAddr;
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or(0);

    let mut wire_addr = WireAddr::default();
    wire_addr.port = addr.port();
    wire_addr.last_seen = now;

    match addr {
        SocketAddr::V4(v4) => {
            wire_addr.transport = 0x01; // TCPv4
            let octets = v4.ip().octets();
            wire_addr.address[0..4].copy_from_slice(&octets);
            Some(wire_addr)
        }
        SocketAddr::V6(v6) => {
            wire_addr.transport = 0x02; // TCPv6
            let octets = v6.ip().octets();
            wire_addr.address[0..16].copy_from_slice(&octets);
            Some(wire_addr)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::messages::WireAddr;

    fn test_peer_store() -> Arc<PeerStore> {
        Arc::new(PeerStore::open_temporary().unwrap())
    }

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

    #[test]
    fn test_connection_config_default() {
        let config = ConnectionConfig::default();
        assert_eq!(config.max_inbound, MAX_INBOUND_CONNECTIONS);
        assert_eq!(config.max_outbound, MAX_OUTBOUND_CONNECTIONS);
        assert_eq!(config.target_peers, CONNECTION_TARGET_PEERS);
        assert_eq!(config.min_peers, CONNECTION_MIN_PEERS);
        assert_eq!(config.max_connections, MAX_CONNECTIONS);
    }

    #[test]
    fn test_connection_manager_new() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::default(), peer_store);

        assert_eq!(manager.connection_count(), 0);
        assert_eq!(manager.inbound_count(), 0);
        assert_eq!(manager.outbound_count(), 0);
        assert!(manager.can_accept_inbound());
        assert!(manager.can_connect_outbound());
    }

    #[test]
    fn test_add_connection_success() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Outbound);
        assert!(result.is_ok());
        assert_eq!(manager.connection_count(), 1);
        assert_eq!(manager.outbound_count(), 1);
        assert!(manager.is_connected(&peer_id));
    }

    #[test]
    fn test_add_connection_reconnect_replaces_stale() {
        // A reconnect from an already-tracked peer must REPLACE the stale
        // connection, not be rejected — otherwise a half-open/wedged connection
        // blocks the peer from ever reconnecting until a restart.
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];
        let addr1: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        let addr2: SocketAddr = "127.0.0.1:9999".parse().unwrap();

        manager
            .add_connection(peer_id, addr1, ConnectionDirection::Outbound)
            .unwrap();

        // Reconnect (e.g. a fresh inbound after the old socket wedged) succeeds.
        let result = manager.add_connection(peer_id, addr2, ConnectionDirection::Inbound);
        assert!(result.is_ok(), "reconnect must be accepted, got {result:?}");

        // Still exactly one connection for the peer, now the new one.
        assert_eq!(manager.connection_count(), 1);
        assert!(manager.is_connected(&peer_id));
        assert_eq!(manager.inbound_count(), 1);
        assert_eq!(manager.outbound_count(), 0);
    }

    #[test]
    fn test_add_connection_limit_exceeded_inbound() {
        let peer_store = test_peer_store();
        let mut config = ConnectionConfig::for_test();
        config.max_inbound = 2;
        config.max_connections = 10;
        let manager = ConnectionManager::new(config, peer_store);

        // Add 2 inbound connections
        for i in 0..2 {
            let peer_id = [i; 32];
            let addr: SocketAddr = format!("127.0.0.1:{}", 9735 + i as u16).parse().unwrap();
            manager
                .add_connection(peer_id, addr, ConnectionDirection::Inbound)
                .unwrap();
        }

        // 3rd should fail
        let peer_id = [2; 32];
        let addr: SocketAddr = "127.0.0.1:9737".parse().unwrap();
        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Inbound);
        assert!(matches!(result, Err(ConnectionManagerError::LimitExceeded)));
    }

    #[test]
    fn test_add_connection_limit_exceeded_outbound() {
        let peer_store = test_peer_store();
        let mut config = ConnectionConfig::for_test();
        config.max_outbound = 2;
        config.max_connections = 10;
        let manager = ConnectionManager::new(config, peer_store);

        // Add 2 outbound connections
        for i in 0..2 {
            let peer_id = [i; 32];
            let addr: SocketAddr = format!("127.0.0.1:{}", 9735 + i as u16).parse().unwrap();
            manager
                .add_connection(peer_id, addr, ConnectionDirection::Outbound)
                .unwrap();
        }

        // 3rd should fail
        let peer_id = [2; 32];
        let addr: SocketAddr = "127.0.0.1:9737".parse().unwrap();
        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Outbound);
        assert!(matches!(result, Err(ConnectionManagerError::LimitExceeded)));
    }

    #[test]
    fn test_add_connection_limit_exceeded_total() {
        let peer_store = test_peer_store();
        let mut config = ConnectionConfig::for_test();
        config.max_inbound = 10;
        config.max_outbound = 10;
        config.max_connections = 3;
        let manager = ConnectionManager::new(config, peer_store);

        // Add 3 connections (mixed)
        for i in 0..3 {
            let peer_id = [i; 32];
            let addr: SocketAddr = format!("127.0.0.1:{}", 9735 + i as u16).parse().unwrap();
            let direction = if i % 2 == 0 {
                ConnectionDirection::Inbound
            } else {
                ConnectionDirection::Outbound
            };
            manager.add_connection(peer_id, addr, direction).unwrap();
        }

        // 4th should fail
        let peer_id = [3; 32];
        let addr: SocketAddr = "127.0.0.1:9738".parse().unwrap();
        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Inbound);
        assert!(matches!(result, Err(ConnectionManagerError::LimitExceeded)));
    }

    #[test]
    fn test_add_connection_peer_banned() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        manager.ban_peer(peer_id, Duration::from_secs(3600));
        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Outbound);

        assert!(matches!(result, Err(ConnectionManagerError::PeerBanned)));
    }

    #[test]
    fn test_remove_connection() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        manager
            .add_connection(peer_id, addr, ConnectionDirection::Outbound)
            .unwrap();
        assert_eq!(manager.connection_count(), 1);

        let handle = manager.remove_connection(&peer_id, DisconnectReason::Normal);
        assert!(handle.is_some());
        assert_eq!(manager.connection_count(), 0);
        assert!(!manager.is_connected(&peer_id));
    }

    #[test]
    fn test_protocol_violation_ban() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        // Trigger 3 protocol violations
        for _ in 0..3 {
            manager
                .add_connection(peer_id, addr, ConnectionDirection::Outbound)
                .unwrap();
            manager.remove_connection(
                &peer_id,
                DisconnectReason::ProtocolViolation("test".to_string()),
            );
        }

        // Peer should now be banned
        assert!(manager.is_banned(&peer_id));
        let result = manager.add_connection(peer_id, addr, ConnectionDirection::Outbound);
        assert!(matches!(result, Err(ConnectionManagerError::PeerBanned)));
    }

    #[test]
    fn test_event_subscription() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let mut rx = manager.subscribe();

        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();

        manager
            .add_connection(peer_id, addr, ConnectionDirection::Outbound)
            .unwrap();

        // Should receive connected event
        let event = rx.try_recv().unwrap();
        assert!(matches!(event, ConnectionEvent::Connected { .. }));

        manager.remove_connection(&peer_id, DisconnectReason::Normal);

        // Should receive disconnected event
        let event = rx.try_recv().unwrap();
        assert!(matches!(event, ConnectionEvent::Disconnected { .. }));
    }

    #[test]
    fn test_calculate_backoff() {
        // Test exponential increase
        let d0 = calculate_backoff(0);
        let d1 = calculate_backoff(1);
        let d2 = calculate_backoff(2);
        let d3 = calculate_backoff(3);

        // With jitter, we can only check approximate values
        assert!(d0.as_secs() >= 1);
        assert!(d1.as_secs() >= 1);
        assert!(d2.as_secs() >= 2);
        assert!(d3.as_secs() >= 4);
    }

    #[test]
    fn test_calculate_backoff_max_cap() {
        // Test that backoff is capped at max
        let d20 = calculate_backoff(20);
        assert!(d20.as_secs() <= RECONNECT_MAX_DELAY_SECS + RECONNECT_MAX_DELAY_SECS / 4);
    }

    #[test]
    fn test_reconnect_state() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_key = PeerKey::from_wire_addr(&make_wire_addr(9735));

        // Schedule reconnect
        manager.schedule_reconnect(peer_key.clone(), None);

        // Check state
        let state = manager.get_reconnect_state(&peer_key);
        assert!(state.is_some());
        assert_eq!(state.unwrap().attempt_count, 1);

        // Clear state
        manager.clear_reconnect_state(&peer_key);
        assert!(manager.get_reconnect_state(&peer_key).is_none());
    }

    #[test]
    fn test_needs_more_peers() {
        let peer_store = test_peer_store();
        let mut config = ConnectionConfig::for_test();
        config.target_peers = 3;
        let manager = ConnectionManager::new(config, peer_store);

        assert!(manager.needs_more_peers());

        // Add peers until target
        for i in 0..3 {
            let peer_id = [i; 32];
            let addr: SocketAddr = format!("127.0.0.1:{}", 9735 + i as u16).parse().unwrap();
            manager
                .add_connection(peer_id, addr, ConnectionDirection::Outbound)
                .unwrap();
        }

        assert!(!manager.needs_more_peers());
    }

    #[test]
    fn test_peer_selection_by_score() {
        let peer_store = test_peer_store();

        // Add peers with different scores
        let entry_high = PeerEntry {
            wire_addr: make_wire_addr(9735),
            score: 200,
            failures: 0,
            last_success: 1700000100,
            first_seen: 1700000000,
        };
        let entry_med = PeerEntry {
            wire_addr: make_wire_addr(9736),
            score: 150,
            failures: 0,
            last_success: 1700000100,
            first_seen: 1700000000,
        };
        let entry_low = PeerEntry {
            wire_addr: make_wire_addr(9737),
            score: 100,
            failures: 0,
            last_success: 1700000100,
            first_seen: 1700000000,
        };

        peer_store.put(&entry_high).unwrap();
        peer_store.put(&entry_med).unwrap();
        peer_store.put(&entry_low).unwrap();

        let mut config = ConnectionConfig::for_test();
        config.target_peers = 2;
        let manager = ConnectionManager::new(config, peer_store);

        let selected = manager.select_peers_to_connect();
        assert_eq!(selected.len(), 2);
        // Highest scores should be selected first
        assert_eq!(selected[0].score, 200);
        assert_eq!(selected[1].score, 150);
    }

    #[test]
    fn test_peer_selection_excludes_connected() {
        let peer_store = test_peer_store();

        // Add peers
        let entry1 = PeerEntry {
            wire_addr: make_wire_addr(9735),
            score: 200,
            failures: 0,
            last_success: 1700000100,
            first_seen: 1700000000,
        };
        let entry2 = PeerEntry {
            wire_addr: make_wire_addr(9736),
            score: 150,
            failures: 0,
            last_success: 1700000100,
            first_seen: 1700000000,
        };

        peer_store.put(&entry1).unwrap();
        peer_store.put(&entry2).unwrap();

        let mut config = ConnectionConfig::for_test();
        config.target_peers = 10;
        let manager = ConnectionManager::new(config, peer_store);

        // Connect to first peer
        let peer_id = [0xab; 32];
        let addr: SocketAddr = "127.0.0.1:9735".parse().unwrap();
        manager
            .add_connection(peer_id, addr, ConnectionDirection::Outbound)
            .unwrap();

        // Select should exclude connected peer
        let selected = manager.select_peers_to_connect();
        for entry in &selected {
            let wire_addr_port = entry.wire_addr.port;
            assert_ne!(wire_addr_port, 9735); // Should not include connected peer's port
        }
    }

    #[test]
    fn test_ban_and_unban() {
        let peer_store = test_peer_store();
        let manager = ConnectionManager::new(ConnectionConfig::for_test(), peer_store);

        let peer_id = [0xab; 32];

        assert!(!manager.is_banned(&peer_id));

        manager.ban_peer(peer_id, Duration::from_secs(3600));
        assert!(manager.is_banned(&peer_id));

        manager.unban_peer(&peer_id);
        assert!(!manager.is_banned(&peer_id));
    }

    #[test]
    fn test_wire_addr_to_socket_addr() {
        let wire_addr = make_wire_addr(9735);
        let socket_addr = wire_addr_to_socket_addr(&wire_addr);
        assert!(socket_addr.is_some());
        let addr = socket_addr.unwrap();
        assert_eq!(addr.port(), 9735);
        assert_eq!(addr.ip().to_string(), "127.0.0.1");
    }
}
