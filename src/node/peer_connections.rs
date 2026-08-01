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
use tokio::sync::{Mutex, Notify, RwLock};

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
    /// CONSECUTIVE failed/timed-out sends, reset to zero by any success — so
    /// this counts a peer that is persistently unreachable, not one that had a
    /// bad moment. At `MAX_SEND_STRIKES` the peer is dropped from the pool.
    send_strikes: std::sync::atomic::AtomicU32,
    /// Set by [`close`](Self::close), observed by [`recv`](Self::recv). A
    /// connection evicted from the pool (replaced by a redial, or dropped for
    /// send strikes) has its read task parked in `recv()` holding the LAST Arc
    /// — on a socket nobody will write to or close again. Without an abort
    /// signal that task never exits, the Arc never drops, and the socket fd
    /// leaks: ~33 fds/hour on the 2026-07-31 mainnet seed, EMFILE at the
    /// 1024-fd rlimit, and no peer could join the network for two hours.
    closed: std::sync::atomic::AtomicBool,
    /// Wakes any parked `recv()` when `close()` fires (see `closed`).
    close_signal: Notify,
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
            send_strikes: std::sync::atomic::AtomicU32::new(0),
            closed: std::sync::atomic::AtomicBool::new(false),
            close_signal: Notify::new(),
        }
    }

    /// Abort this connection: any parked or future `recv()` returns `Ok(None)`
    /// so the owning read task exits and drops its Arc — which is what actually
    /// releases the socket fd. Must be called whenever the connection leaves
    /// the pool while its read task may still be alive (replacement by a
    /// redial, strike eviction). Idempotent.
    ///
    /// Ordering contract with `recv()`: the flag is stored BEFORE the wakeup,
    /// and `recv()` registers for the wakeup BEFORE loading the flag — so a
    /// close can never fall between the load and the park and be missed.
    pub fn close(&self) {
        self.closed.store(true, std::sync::atomic::Ordering::SeqCst);
        self.close_signal.notify_waiters();
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
    /// Returns `Ok(None)` if the connection was closed cleanly — by the remote
    /// end, or locally via [`close`](Self::close).
    pub async fn recv(&self) -> Result<Option<MessageEnvelope>, TransportError> {
        // Register for the close wakeup BEFORE loading the flag (see close()'s
        // ordering contract): a close between the load and the await would
        // otherwise be missed and park this task forever — the exact leak this
        // mechanism exists to end.
        let closed = self.close_signal.notified();
        if self.closed.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok(None);
        }
        tokio::select! {
            _ = closed => Ok(None),
            r = self.recv_inner() => r,
        }
    }

    /// The blocking read path of [`recv`](Self::recv). Cancellation-unsafe
    /// mid-message (a partial header read is lost), which is fine: the only
    /// cancellation is `close()`, after which the socket is dead anyway.
    async fn recv_inner(&self) -> Result<Option<MessageEnvelope>, TransportError> {
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

/// Consecutive failed sends before a peer is dropped from the pool.
///
/// A peer that will not take data is not a peer. Before this, a wedged
/// connection was retried on every broadcast forever: on 2026-07-29 the seed
/// logged 89 timeouts to the SAME peer id in 20 minutes, each costing
/// PEER_SEND_TIMEOUT, and the only cure was a manual restart — after which it
/// re-wedged inside 90 seconds.
///
/// Three, not one: a single timeout can be a slow link or a GC pause, and
/// dropping a healthy peer costs a reconnect and a resync. Three consecutive
/// failures with no success between them is not bad luck.
const MAX_SEND_STRIKES: u32 = 3;

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
        if let Some(replaced) = connections.insert(peer_id, peer_conn.clone()) {
            // A redial to a peer we already hold. The map no longer references
            // the old connection, but its read task does — abort it, or the
            // socket fd leaks for the life of the process (2026-07-31 outage:
            // the seed EMFILE'd after ~30h of this, one fd per redial).
            replaced.close();
            info!(
                "[PEER-POOL] Replaced connection to {} — closed the old socket",
                hex::encode(&peer_id[..8]),
            );
        }
        info!(
            "[PEER-POOL] Added peer {} (total: {})",
            hex::encode(&peer_id[..8]),
            connections.len()
        );
        peer_conn
    }

    /// Remove a connection from the pool.
    ///
    /// Also closes it: eviction must release the socket fd, not just the map
    /// entry — the connection's read task holds the last Arc and stays parked
    /// in `recv()` until closed (see [`PeerConnection::close`]).
    pub async fn remove(&self, peer_id: &[u8; 32]) -> Option<Arc<PeerConnection>> {
        let mut connections = self.connections.write().await;
        let removed = connections.remove(peer_id);
        if let Some(conn) = &removed {
            conn.close();
            info!(
                "[PEER-POOL] Removed peer {} (remaining: {})",
                hex::encode(&peer_id[..8]),
                connections.len()
            );
        }
        removed
    }

    /// Remove `peer_id`'s entry ONLY if it is the very connection `conn` —
    /// the read-loop cleanup path. A loop whose connection was REPLACED by a
    /// redial must not touch the pool at all: removing by peer id alone would
    /// evict (and, since eviction closes, kill) the replacement that just took
    /// the slot. Returns the removed connection, or `None` if the entry is
    /// absent or belongs to a different connection.
    pub async fn remove_if_same(
        &self,
        peer_id: &[u8; 32],
        conn: &Arc<PeerConnection>,
    ) -> Option<Arc<PeerConnection>> {
        let mut connections = self.connections.write().await;
        match connections.get(peer_id) {
            Some(current) if Arc::ptr_eq(current, conn) => {
                let removed = connections.remove(peer_id);
                if let Some(c) = &removed {
                    c.close();
                    info!(
                        "[PEER-POOL] Removed peer {} (remaining: {})",
                        hex::encode(&peer_id[..8]),
                        connections.len()
                    );
                }
                removed
            }
            _ => None,
        }
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
        //
        // STRIKES COUNT HERE TOO. `broadcast` learned to drop a peer that will
        // not take data, but this path — which carries PING, DHT I_HAVE,
        // BOOTSTRAP I_HAVE, header/backfill sync and every other targeted send,
        // a dozen call sites in all — kept score of nothing. A peer wedged
        // against those paths alone was retried forever exactly as before, which
        // is precisely what client2 was still logging after the fleet was
        // upgraded:
        //     [PING] Failed to send to a08a5c2f...: send timed out (stuck peer)
        //     [DHT-DISCOVERY] Failed to send I_HAVE: send timed out (stuck peer)
        // Eviction has to be a property of SENDING, not of one caller.
        let result = match tokio::time::timeout(PEER_SEND_TIMEOUT, conn.send(envelope)).await {
            Ok(res) => res.map_err(SendError::Transport),
            Err(_) => Err(SendError::Timeout),
        };
        self.note_send(peer_id, &conn, result.is_ok()).await;
        result
    }

    /// Record the outcome of one send and drop the peer if it has failed
    /// `MAX_SEND_STRIKES` times in a row.
    ///
    /// Consecutive is the load-bearing word: any success resets the counter, so
    /// a peer is dropped for being persistently dead and never for one bad
    /// moment. Shared by `send_to` and `broadcast_inner` so the two can never
    /// disagree about when a peer is finished.
    async fn note_send(&self, peer_id: &[u8; 32], conn: &Arc<PeerConnection>, ok: bool) {
        if ok {
            conn.send_strikes
                .store(0, std::sync::atomic::Ordering::Relaxed);
            return;
        }
        let strikes = conn
            .send_strikes
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            + 1;
        if strikes >= MAX_SEND_STRIKES {
            warn!(
                "[PEER-POOL] Dropping {} after {} consecutive failed sends",
                hex::encode(&peer_id[..8]),
                strikes
            );
            self.remove(peer_id).await;
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
            let ok = match tokio::time::timeout(PEER_SEND_TIMEOUT, conn.send(envelope)).await {
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
            };
            (peer_id, conn, ok)
        });

        let results = futures::future::join_all(sends).await;

        // SCORE AND EVICT AFTER the lock-free sends, through the same helper
        // `send_to` uses — so the two paths can never disagree about when a peer
        // is finished. `remove` takes the write lock only briefly, so this
        // cannot reintroduce the stall this function exists to prevent.
        for (peer_id, conn, ok) in &results {
            self.note_send(peer_id, conn, *ok).await;
        }

        results.into_iter().filter(|(_, _, ok)| *ok).count()
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

    /// A PEER THAT WILL NOT TAKE DATA MUST BE DROPPED, NOT RETRIED FOREVER.
    ///
    /// On 2026-07-29 the seed logged 89 timeouts to the SAME peer id in 20
    /// minutes, each costing PEER_SEND_TIMEOUT. A restart cleared it and it
    /// re-wedged inside 90 seconds, because nothing ever removed the peer.
    #[tokio::test]
    async fn a_persistently_stuck_peer_is_evicted() {
        let pool = PeerConnectionPool::new();
        let (stuck, _keep) = pooled_peer(&pool, 1).await;
        let _wedged = stuck.writer.try_lock().unwrap();

        assert_eq!(pool.peer_ids().await.len(), 1);

        // Below the threshold it must SURVIVE: one bad moment is not a dead
        // peer, and dropping a healthy one costs a reconnect and a resync.
        for i in 1..MAX_SEND_STRIKES {
            pool.broadcast(&envelope()).await;
            assert_eq!(
                pool.peer_ids().await.len(),
                1,
                "evicted after only {i} consecutive failures (threshold {MAX_SEND_STRIKES})"
            );
        }

        // The strike that reaches the threshold drops it.
        pool.broadcast(&envelope()).await;
        assert!(
            pool.peer_ids().await.is_empty(),
            "a peer that failed {MAX_SEND_STRIKES} consecutive sends is still pooled —              it will be retried on every broadcast for the life of the process"
        );
    }

    /// EVICTION MUST BE A PROPERTY OF SENDING, NOT OF ONE CALLER.
    ///
    /// `broadcast` learned to drop an undrainable peer; `send_to` did not, and
    /// it carries PING, DHT I_HAVE, BOOTSTRAP I_HAVE and every targeted sync
    /// send — a dozen call sites. A peer wedged against only those paths was
    /// retried forever, which is what a droplet was still logging after the
    /// fleet had been upgraded.
    #[tokio::test]
    async fn send_to_also_evicts_a_persistently_stuck_peer() {
        let pool = PeerConnectionPool::new();
        let (stuck, _keep) = pooled_peer(&pool, 1).await;
        let _wedged = stuck.writer.try_lock().unwrap();

        for i in 1..MAX_SEND_STRIKES {
            let r = pool.send_to(&[1u8; 32], &envelope()).await;
            assert!(
                matches!(r, Err(SendError::Timeout)),
                "expected a timeout on strike {i}"
            );
            assert_eq!(
                pool.peer_ids().await.len(),
                1,
                "evicted early, on strike {i}"
            );
        }

        let r = pool.send_to(&[1u8; 32], &envelope()).await;
        assert!(matches!(r, Err(SendError::Timeout)));
        assert!(
            pool.peer_ids().await.is_empty(),
            "send_to failed {MAX_SEND_STRIKES} times consecutively and the peer is still              pooled — PING/DHT/BOOTSTRAP will retry it for the life of the process"
        );
    }

    /// The two paths must share one counter. Strikes from `send_to` and from
    /// `broadcast` are the same peer failing, and must add up — otherwise a peer
    /// that alternates between the two never reaches the threshold on either.
    #[tokio::test]
    async fn strikes_accumulate_across_send_to_and_broadcast() {
        let pool = PeerConnectionPool::new();
        let (stuck, _keep) = pooled_peer(&pool, 1).await;
        let _wedged = stuck.writer.try_lock().unwrap();

        // MAX_SEND_STRIKES is 3: two via one path, the decisive one via the other.
        let _ = pool.send_to(&[1u8; 32], &envelope()).await;
        pool.broadcast(&envelope()).await;
        assert_eq!(
            pool.peer_ids().await.len(),
            1,
            "evicted before the threshold"
        );

        let _ = pool.send_to(&[1u8; 32], &envelope()).await;
        assert!(
            pool.peer_ids().await.is_empty(),
            "strikes did not accumulate across send_to and broadcast — a peer failing              alternately on both paths would never be dropped by either"
        );
    }

    /// A SUCCESS WIPES THE SLATE. Strikes must be CONSECUTIVE, or a long-lived
    /// healthy peer accumulates unrelated blips and is eventually evicted.
    #[tokio::test]
    async fn intermittent_failures_do_not_evict() {
        let pool = PeerConnectionPool::new();
        let (peer, mut server) = pooled_peer(&pool, 1).await;

        for _ in 0..(MAX_SEND_STRIKES * 3) {
            {
                let _wedged = peer.writer.try_lock().unwrap();
                pool.broadcast(&envelope()).await; // fails
            } // guard dropped — the next send can succeed
            let mut buf = [0u8; 4096];
            let _ = tokio::time::timeout(
                Duration::from_millis(50),
                tokio::io::AsyncReadExt::read(&mut server, &mut buf),
            )
            .await;
            pool.broadcast(&envelope()).await; // succeeds, resetting strikes
            assert_eq!(
                pool.peer_ids().await.len(),
                1,
                "a peer alternating failure and success was evicted — strikes are not                  reset by success, so any long-lived peer eventually dies"
            );
        }
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

    /// A REPLACED CONNECTION MUST DIE, NOT LINGER.
    ///
    /// 2026-07-31 mainnet outage: a redial to an already-connected peer replaces
    /// the pool entry (`HashMap::insert`), but the OLD connection's read task
    /// stays parked in `recv()` on a socket that nobody will ever write to or
    /// close again — the task holds the last Arc, so the fd never closes. One
    /// leaked fd per redial, per side; the seed hit its 1024-fd rlimit in ~30h
    /// and EMFILE'd every accept. Replacing a connection must abort the replaced
    /// connection's pending recv so its read task exits.
    #[tokio::test]
    async fn replacing_a_connection_aborts_the_replaced_read_task() {
        let pool = PeerConnectionPool::new();
        let (old, _keep_old) = pooled_peer(&pool, 1).await;

        // Production shape: the read loop holds the only clone, parked in recv().
        let parked = tokio::spawn(async move { old.recv().await });
        tokio::time::sleep(Duration::from_millis(100)).await; // let it enter recv

        // The redial: same peer id, fresh socket, replaces the pool entry.
        let (_new, _keep_new) = pooled_peer(&pool, 1).await;

        let joined = tokio::time::timeout(Duration::from_secs(2), parked).await;
        let recv_result = joined
            .expect(
                "the replaced connection's recv() is still parked — its read task will hold                  the socket fd for the life of the process (the 2026-07-31 fd leak)",
            )
            .expect("read task panicked");
        assert!(
            matches!(recv_result, Ok(None)),
            "aborted recv must report a clean close, got {recv_result:?}"
        );
    }

    /// THE REPLACED SOCKET'S FD MUST ACTUALLY CLOSE — the remote end sees EOF.
    ///
    /// The companion to the test above: exiting the read task is only the means;
    /// the outcome that ends the fd leak is the socket closing. The old
    /// connection's remote end observing EOF proves the fd was released (which
    /// is also what unwedges an UNPATCHED remote still parked on this socket).
    #[tokio::test]
    async fn replacing_a_connection_closes_the_replaced_socket() {
        let pool = PeerConnectionPool::new();
        let (old, mut old_server) = pooled_peer(&pool, 1).await;

        let parked = tokio::spawn(async move { old.recv().await });
        tokio::time::sleep(Duration::from_millis(100)).await;

        let (_new, _keep_new) = pooled_peer(&pool, 1).await;

        let mut buf = [0u8; 1];
        let n = tokio::time::timeout(Duration::from_secs(2), old_server.read(&mut buf)).await;
        assert!(
            matches!(n, Ok(Ok(0))),
            "the remote end of a replaced connection did not see EOF (got {n:?}) —              the old socket's fd is still open"
        );
        let _ = parked.await;
    }

    /// A DEAD READ LOOP'S CLEANUP MUST NOT EVICT ITS REPLACEMENT.
    ///
    /// Now that replaced connections close (tests above), their read tasks
    /// EXIT — and the read loop's cleanup removed its peer id from the pool
    /// unconditionally, which would tear down the REPLACEMENT that had just
    /// taken the slot: every redial would kill the fresh connection moments
    /// after it was added. Cleanup must remove the entry only if it is still
    /// the very connection the exiting loop owned.
    #[tokio::test]
    async fn a_dead_read_loops_cleanup_does_not_evict_the_replacement() {
        let pool = PeerConnectionPool::new();
        let (old, _keep_old) = pooled_peer(&pool, 1).await;
        let (new_conn, _keep_new) = pooled_peer(&pool, 1).await; // replaces `old`

        // The OLD loop's cleanup must be a no-op: the entry is no longer its.
        assert!(
            pool.remove_if_same(&[1u8; 32], &old).await.is_none(),
            "cleanup of a replaced connection removed the pool entry — it just              evicted its own replacement"
        );
        let current = pool
            .get(&[1u8; 32])
            .await
            .expect("replacement missing from the pool after the old loop's cleanup");
        assert!(
            Arc::ptr_eq(&current, &new_conn),
            "pool entry is not the replacement connection"
        );

        // The CURRENT connection's own cleanup must still remove it.
        assert!(
            pool.remove_if_same(&[1u8; 32], &new_conn).await.is_some(),
            "a connection's own cleanup failed to remove it"
        );
        assert!(pool.get(&[1u8; 32]).await.is_none());
    }

    /// EVICTION MUST RELEASE THE FD, NOT JUST THE POOL ENTRY.
    ///
    /// `note_send` drops a peer after MAX_SEND_STRIKES by removing it from the
    /// pool map — but the read task still holds the last Arc, parked in recv(),
    /// so every strike-eviction leaks the connection's fd exactly like a
    /// replacement does. remove() must abort the connection's pending recv.
    #[tokio::test]
    async fn removing_a_connection_aborts_its_read_task() {
        let pool = PeerConnectionPool::new();
        let (conn, _keep) = pooled_peer(&pool, 1).await;

        let parked = tokio::spawn(async move { conn.recv().await });
        tokio::time::sleep(Duration::from_millis(100)).await;

        pool.remove(&[1u8; 32]).await;

        let joined = tokio::time::timeout(Duration::from_secs(2), parked).await;
        let recv_result = joined
            .expect(
                "the removed connection's recv() is still parked — strike-eviction leaks                  the fd it was supposed to reclaim",
            )
            .expect("read task panicked");
        assert!(
            matches!(recv_result, Ok(None)),
            "aborted recv must report a clean close, got {recv_result:?}"
        );
    }
}
