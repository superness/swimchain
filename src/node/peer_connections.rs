//! Peer Connection Pool (SPEC_10 §4.5)
//!
//! Manages active peer connections for message I/O.
//! This is separate from ConnectionManager which tracks metadata only.
//!
//! The PeerConnectionPool stores split read/write streams to allow
//! concurrent read and write operations from multiple tasks without deadlock.

use std::collections::HashMap;
use std::sync::Arc;

use log::{debug, info, warn};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, RwLock};

use crate::network::{NetworkContext, WireError};
use crate::transport::TransportError;
use crate::types::constants::{MAX_PAYLOAD_SIZE, MESSAGE_HEADER_SIZE};
use crate::types::network::{MessageEnvelope, MessageType};

/// Wrapper around a connection for thread-safe message I/O
///
/// Uses split TCP streams to allow concurrent read and write without deadlock.
/// The read half is used by the message loop, while the write half is used
/// for sending responses and broadcasts.
pub struct PeerConnection {
    /// Read half of the TCP stream (protected by mutex)
    reader: Mutex<OwnedReadHalf>,
    /// Write half of the TCP stream (protected by mutex)
    writer: Mutex<OwnedWriteHalf>,
    /// Peer's node ID
    peer_id: [u8; 32],
    /// The peer's socket endpoint (observed source for inbound; dialed addr for
    /// outbound). Post-NAT-reflection this is the peer's public endpoint either way,
    /// so it's usable for introducing peers to each other (hole-punch coordination).
    remote_addr: std::net::SocketAddr,
    /// Whether the connection is established (handshake complete)
    established: std::sync::atomic::AtomicBool,
}

impl PeerConnection {
    /// Create a new PeerConnection from a TcpStream
    ///
    /// Splits the stream into independent read and write halves.
    pub fn new(stream: TcpStream, peer_id: [u8; 32], established: bool) -> Self {
        let remote_addr = stream
            .peer_addr()
            .unwrap_or_else(|_| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));
        let (reader, writer) = stream.into_split();
        Self {
            reader: Mutex::new(reader),
            writer: Mutex::new(writer),
            peer_id,
            remote_addr,
            established: std::sync::atomic::AtomicBool::new(established),
        }
    }

    /// Get the peer ID
    pub fn peer_id(&self) -> [u8; 32] {
        self.peer_id
    }

    /// The peer's socket endpoint (see field docs).
    pub fn remote_addr(&self) -> std::net::SocketAddr {
        self.remote_addr
    }

    /// Send a message to this peer
    ///
    /// This only locks the write half, so it can run concurrently with recv().
    pub async fn send(&self, envelope: &MessageEnvelope) -> Result<(), TransportError> {
        let mut writer = self.writer.lock().await;

        // Build header (46 bytes)
        let mut header = [0u8; MESSAGE_HEADER_SIZE];
        header[0..4].copy_from_slice(&envelope.magic);
        header[4] = envelope.version;
        header[5] = envelope.message_type as u8;
        header[6..38].copy_from_slice(&envelope.fork_id);
        header[38..42].copy_from_slice(&envelope.payload_length.to_le_bytes());
        header[42..46].copy_from_slice(&envelope.checksum);

        // Write header then payload
        writer.write_all(&header).await?;
        writer.write_all(&envelope.payload).await?;
        writer.flush().await?;

        Ok(())
    }

    /// Receive a message from this peer
    ///
    /// This only locks the read half, so it can run concurrently with send().
    /// Returns `Ok(None)` if connection was closed cleanly.
    pub async fn recv(&self) -> Result<Option<MessageEnvelope>, TransportError> {
        let mut reader = self.reader.lock().await;

        // Read 46-byte header
        let mut header = [0u8; MESSAGE_HEADER_SIZE];
        match reader.read_exact(&mut header).await {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(e) => return Err(TransportError::Io(e)),
        }

        // Parse header fields
        let magic = [header[0], header[1], header[2], header[3]];
        if !NetworkContext::validate_magic(magic) {
            return Err(TransportError::Wire(WireError::InvalidMagic(magic)));
        }

        let version = header[4];
        let message_type_byte = header[5];
        let message_type = MessageType::try_from(message_type_byte)
            .map_err(|e| TransportError::Wire(WireError::from(e)))?;

        let mut fork_id = [0u8; 32];
        fork_id.copy_from_slice(&header[6..38]);

        let payload_length = u32::from_le_bytes([header[38], header[39], header[40], header[41]]);
        let checksum = [header[42], header[43], header[44], header[45]];

        // Validate payload size before allocating
        if payload_length > MAX_PAYLOAD_SIZE {
            return Err(TransportError::MessageTooLarge {
                size: payload_length,
                max: MAX_PAYLOAD_SIZE,
            });
        }

        // Read payload
        let mut payload = vec![0u8; payload_length as usize];
        if payload_length > 0 {
            reader.read_exact(&mut payload).await?;
        }

        let envelope = MessageEnvelope {
            magic,
            version,
            message_type,
            fork_id,
            payload_length,
            checksum,
            payload,
        };

        // Validate using existing V-MSG-01 through V-MSG-06
        envelope.validate()?;

        Ok(Some(envelope))
    }

    /// Check if the connection is established
    pub fn is_established(&self) -> bool {
        self.established.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Mark the connection as established
    pub fn set_established(&self, value: bool) {
        self.established
            .store(value, std::sync::atomic::Ordering::Relaxed);
    }
}

/// Pool of active peer connections
///
/// Thread-safe storage of connections indexed by peer_id.
/// Used for sending messages to peers and reading incoming messages.
pub struct PeerConnectionPool {
    /// Active connections by peer_id
    connections: RwLock<HashMap<[u8; 32], Arc<PeerConnection>>>,
    /// Per-peer throttle for the full-content I_HAVE inventory blast. Announcing the entire
    /// blob store to a peer on every connection is O(blobs) filesystem work plus a message
    /// flood; under seed-node connection churn (reconnect every ~30s) it re-scans and
    /// re-floods constantly and pegs the CPU. We only re-send to a given peer after a
    /// cooldown. `node_id -> last time we sent it our inventory`.
    inventory_sent: RwLock<HashMap<[u8; 32], std::time::Instant>>,
}

/// How long to wait before re-announcing our full content inventory to the same peer.
const INVENTORY_THROTTLE: std::time::Duration = std::time::Duration::from_secs(300);

/// Max time a single peer send may take before it's abandoned. A stuck or
/// half-open TCP connection must never hang a caller (e.g. an RPC handler that
/// gossips a self-originated action inline before responding).
const PEER_SEND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

impl PeerConnectionPool {
    /// Create a new empty pool
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            inventory_sent: RwLock::new(HashMap::new()),
        }
    }

    /// Returns `true` (and records "now") if we should send the full content inventory to
    /// this peer — i.e. we have not sent it within [`INVENTORY_THROTTLE`]. This stops
    /// reconnect churn from re-scanning the blob store and re-flooding I_HAVE, which
    /// otherwise pegs a small node's CPU.
    pub async fn should_send_inventory(&self, node_id: &[u8; 32]) -> bool {
        let now = std::time::Instant::now();
        let mut sent = self.inventory_sent.write().await;
        if let Some(at) = sent.get(node_id) {
            if now.duration_since(*at) < INVENTORY_THROTTLE {
                return false;
            }
        }
        sent.insert(*node_id, now);
        // Bound memory: occasionally drop peers we haven't announced to in a while.
        if sent.len() > 1024 {
            sent.retain(|_, t| now.duration_since(*t) < INVENTORY_THROTTLE);
        }
        true
    }

    /// Add a connection to the pool
    ///
    /// Takes a raw TcpStream (post-handshake) and creates a PeerConnection.
    /// Returns the Arc<PeerConnection> for use in message loop.
    pub async fn add(
        &self,
        stream: TcpStream,
        peer_id: [u8; 32],
        established: bool,
    ) -> Arc<PeerConnection> {
        let peer_conn = Arc::new(PeerConnection::new(stream, peer_id, established));
        let mut connections = self.connections.write().await;
        connections.insert(peer_id, peer_conn.clone());
        info!(
            "[PEER-POOL] Added peer {} (total: {})",
            hex::encode(&peer_id[..8]),
            connections.len()
        );
        peer_conn
    }

    /// Remove a connection from the pool
    pub async fn remove(&self, peer_id: &[u8; 32]) -> Option<Arc<PeerConnection>> {
        let mut connections = self.connections.write().await;
        let removed = connections.remove(peer_id);
        if removed.is_some() {
            info!(
                "[PEER-POOL] Removed peer {} (remaining: {})",
                hex::encode(&peer_id[..8]),
                connections.len()
            );
        }
        removed
    }

    /// Get a connection by peer ID
    pub async fn get(&self, peer_id: &[u8; 32]) -> Option<Arc<PeerConnection>> {
        let connections = self.connections.read().await;
        connections.get(peer_id).cloned()
    }

    /// Get all connected peer IDs
    pub async fn peer_ids(&self) -> Vec<[u8; 32]> {
        let connections = self.connections.read().await;
        connections.keys().copied().collect()
    }

    /// Get (node_id, endpoint) for every connected peer whose endpoint is a real
    /// public address — used to introduce peers to each other for hole-punching.
    pub async fn peer_endpoints(&self) -> Vec<([u8; 32], std::net::SocketAddr)> {
        let connections = self.connections.read().await;
        connections
            .iter()
            .map(|(id, conn)| (*id, conn.remote_addr()))
            .collect()
    }

    /// Get the number of active connections
    pub async fn count(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }

    /// Send a message to a specific peer
    ///
    /// Returns `Err` if peer not found or send fails.
    pub async fn send_to(
        &self,
        peer_id: &[u8; 32],
        envelope: &MessageEnvelope,
    ) -> Result<(), SendError> {
        let conn = self.get(peer_id).await.ok_or(SendError::PeerNotFound)?;
        // Bound every peer send: a stuck/half-open TCP connection must never hang
        // the caller (e.g. an RPC handler broadcasting a self-originated action).
        match tokio::time::timeout(PEER_SEND_TIMEOUT, conn.send(envelope)).await {
            Ok(res) => res.map_err(SendError::Transport),
            Err(_) => Err(SendError::Timeout),
        }
    }

    /// Broadcast a message to all connected peers.
    ///
    /// Returns the number of successful sends.
    pub async fn broadcast(&self, envelope: &MessageEnvelope) -> usize {
        self.broadcast_inner(envelope, None).await
    }

    /// Broadcast to all connected peers except one.
    ///
    /// Used for relay without echo - when relaying a message received from a peer,
    /// don't send it back to the peer we received it from.
    ///
    /// Returns the number of successful sends.
    pub async fn broadcast_except(&self, envelope: &MessageEnvelope, exclude: &[u8; 32]) -> usize {
        self.broadcast_inner(envelope, Some(exclude)).await
    }

    /// THE BROADCAST MUST NOT HOLD THE POOL LOCK, AND MUST NOT BE SEQUENTIAL.
    ///
    /// Both properties were load-bearing in the 2026-07-29 outage, in which the
    /// mainnet seed stopped accepting connections entirely and stayed that way:
    ///
    ///     LISTEN 4097 4096  0.0.0.0:9735      <- accept backlog full and static
    ///     WARN [PEER-POOL] Broadcast to c4060cb15281f584 timed out (stuck peer)
    ///
    /// Two of our own nodes had deadlocked against each other: each had filled
    /// the other's TCP receive window and neither was draining, so every send
    /// blocked for the full `PEER_SEND_TIMEOUT`. The old code took
    /// `connections.read()` and held it across those blocking sends. Registering
    /// a newly accepted peer needs `connections.write()`, and tokio's RwLock is
    /// write-preferring, so a waiting writer also blocks new readers: `add()`
    /// never got its window, accepted sockets piled up unregistered, and the
    /// kernel backlog filled. The node looked healthy — process up, RPC serving,
    /// `systemctl` green — while being unreachable to every peer on the network.
    /// It was the only bootstrap node, so nothing new could join at all.
    ///
    /// SNAPSHOT, THEN SEND. The lock is released before any I/O, so a peer that
    /// refuses to drain can never again stall accepts, adds or removals. Cloning
    /// the Arc handles is cheap and the pool may change mid-broadcast — which is
    /// fine and always was: a send to a peer that has since gone simply fails.
    ///
    /// CONCURRENTLY, not one after another. Sequentially, N stuck peers cost
    /// N x PEER_SEND_TIMEOUT and gossip fell behind faster than it could ever
    /// catch up. Concurrently the whole broadcast costs the timeout ONCE, no
    /// matter how many peers are wedged.
    async fn broadcast_inner(
        &self,
        envelope: &MessageEnvelope,
        exclude: Option<&[u8; 32]>,
    ) -> usize {
        let targets: Vec<([u8; 32], Arc<PeerConnection>)> = {
            let connections = self.connections.read().await;
            connections
                .iter()
                .filter(|(peer_id, _)| exclude != Some(*peer_id))
                .map(|(peer_id, conn)| (*peer_id, conn.clone()))
                .collect()
        }; // <- lock released HERE, before a single byte is written

        let sends = targets.into_iter().map(|(peer_id, conn)| async move {
            match tokio::time::timeout(PEER_SEND_TIMEOUT, conn.send(envelope)).await {
                Ok(Ok(())) => true,
                Ok(Err(e)) => {
                    warn!(
                        "[PEER-POOL] Broadcast to {} failed: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                    false
                }
                Err(_) => {
                    warn!(
                        "[PEER-POOL] Broadcast to {} timed out (stuck peer)",
                        hex::encode(&peer_id[..8]),
                    );
                    false
                }
            }
        });

        futures::future::join_all(sends)
            .await
            .into_iter()
            .filter(|ok| *ok)
            .count()
    }
}

impl Default for PeerConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Error when sending to a peer
#[derive(Debug)]
pub enum SendError {
    /// Peer not found in pool
    PeerNotFound,
    /// Transport error during send
    Transport(crate::transport::TransportError),
    /// Send did not complete within PEER_SEND_TIMEOUT (stuck/half-open peer)
    Timeout,
}

impl std::fmt::Display for SendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PeerNotFound => write!(f, "peer not found in connection pool"),
            Self::Transport(e) => write!(f, "transport error: {}", e),
            Self::Timeout => write!(f, "send timed out (stuck peer)"),
        }
    }
}

impl std::error::Error for SendError {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::net::TcpListener;

    /// A live connection in the pool, plus the server end kept alive so the
    /// socket stays open.
    async fn pooled_peer(
        pool: &PeerConnectionPool,
        id: u8,
    ) -> (Arc<PeerConnection>, tokio::net::TcpStream) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let connect = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });
        let (server_side, _) = listener.accept().await.unwrap();
        let client_side = connect.await.unwrap();
        let conn = pool.add(client_side, [id; 32], true).await;
        (conn, server_side)
    }

    fn envelope() -> MessageEnvelope {
        MessageEnvelope::new_fork_agnostic(MessageType::GetMempool, vec![7u8; 64])
    }

    /// WEDGE A PEER DETERMINISTICALLY.
    ///
    /// An earlier version of these tests tried to stick a peer by writing 16 MB
    /// to a socket nobody read. It did not block — loopback buffers swallowed it
    /// whole — so the test passed against the BUGGED implementation too, i.e. it
    /// proved nothing. Holding the connection's own writer lock reproduces the
    /// same observable condition (`send` cannot proceed, `PEER_SEND_TIMEOUT`
    /// fires) with no dependence on kernel buffer sizes or platform.
    async fn wedge(conn: &Arc<PeerConnection>) -> tokio::sync::MutexGuard<'_, OwnedWriteHalf> {
        conn.writer.lock().await
    }

    /// A BROADCAST TO A STUCK PEER MUST NOT BLOCK THE POOL.
    ///
    /// The property whose absence took mainnet's only seed node off the network
    /// for hours on 2026-07-29: `broadcast` held `connections.read()` across
    /// blocking sends, `add()` needs `connections.write()`, and tokio's RwLock is
    /// write-preferring — so newly accepted peers could not be registered, the
    /// kernel accept backlog filled to 4096, and the node was unreachable while
    /// looking perfectly healthy.
    ///
    /// MUTATION-CHECKED: holding the read lock across the sends makes this fail.
    #[tokio::test]
    async fn broadcast_to_a_stuck_peer_does_not_block_add() {
        let pool = Arc::new(PeerConnectionPool::new());
        let (stuck, _keep) = pooled_peer(&pool, 1).await;
        let _wedged = wedge(&stuck).await; // every send to this peer now hangs

        let bcast = pool.clone();
        let broadcasting = tokio::spawn(async move { bcast.broadcast(&envelope()).await });
        tokio::time::sleep(Duration::from_millis(200)).await; // let it enter the send

        // THE ASSERTION: registering a peer must complete promptly while a
        // broadcast is wedged. PEER_SEND_TIMEOUT is 3s; 1s is well below it.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let connect = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });
        let (_server, _) = listener.accept().await.unwrap();
        let fresh = connect.await.unwrap();

        let added =
            tokio::time::timeout(Duration::from_secs(1), pool.add(fresh, [2u8; 32], true)).await;
        assert!(
            added.is_ok(),
            "add() blocked behind a stuck broadcast — the pool lock is held across I/O,              which is exactly what stopped the seed node accepting any connection"
        );

        let removed = tokio::time::timeout(Duration::from_secs(1), pool.remove(&[2u8; 32])).await;
        assert!(removed.is_ok(), "remove() blocked behind a stuck broadcast");

        drop(_wedged);
        let _ = tokio::time::timeout(Duration::from_secs(6), broadcasting).await;
    }

    /// N stuck peers must cost ONE timeout, not N.
    ///
    /// Sequentially, a node with several wedged peers fell behind on gossip
    /// faster than it could catch up.
    #[tokio::test]
    async fn stuck_peers_time_out_concurrently_not_serially() {
        let pool = PeerConnectionPool::new();
        let mut keep = Vec::new();
        let mut conns = Vec::new();
        for i in 0..3u8 {
            let (conn, server) = pooled_peer(&pool, i).await;
            keep.push(server);
            conns.push(conn);
        }
        // `try_lock` avoids borrowing `conns` for the guards' lifetime; the
        // writers are uncontended here so it always succeeds.
        let _guards: Vec<_> = conns.iter().map(|c| c.writer.try_lock().unwrap()).collect();

        let started = std::time::Instant::now();
        let sent = pool.broadcast(&envelope()).await;
        let elapsed = started.elapsed();

        assert_eq!(sent, 0, "a wedged peer must not report a successful send");
        // Serially this is 3 x PEER_SEND_TIMEOUT = 9s; concurrently it is ~3s.
        assert!(
            elapsed < PEER_SEND_TIMEOUT * 2,
            "three stuck peers took {elapsed:?} — sends are serialised, so every              wedged peer costs a full timeout"
        );
    }
}
