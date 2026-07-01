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
    /// Whether the connection is established (handshake complete)
    established: std::sync::atomic::AtomicBool,
}

impl PeerConnection {
    /// Create a new PeerConnection from a TcpStream
    ///
    /// Splits the stream into independent read and write halves.
    pub fn new(stream: TcpStream, peer_id: [u8; 32], established: bool) -> Self {
        let (reader, writer) = stream.into_split();
        Self {
            reader: Mutex::new(reader),
            writer: Mutex::new(writer),
            peer_id,
            established: std::sync::atomic::AtomicBool::new(established),
        }
    }

    /// Get the peer ID
    pub fn peer_id(&self) -> [u8; 32] {
        self.peer_id
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
        self.established.store(value, std::sync::atomic::Ordering::Relaxed);
    }
}

/// Pool of active peer connections
///
/// Thread-safe storage of connections indexed by peer_id.
/// Used for sending messages to peers and reading incoming messages.
pub struct PeerConnectionPool {
    /// Active connections by peer_id
    connections: RwLock<HashMap<[u8; 32], Arc<PeerConnection>>>,
}

impl PeerConnectionPool {
    /// Create a new empty pool
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    /// Add a connection to the pool
    ///
    /// Takes a raw TcpStream (post-handshake) and creates a PeerConnection.
    /// Returns the Arc<PeerConnection> for use in message loop.
    pub async fn add(&self, stream: TcpStream, peer_id: [u8; 32], established: bool) -> Arc<PeerConnection> {
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
        conn.send(envelope).await.map_err(SendError::Transport)
    }

    /// Broadcast a message to all connected peers
    ///
    /// Returns the number of successful sends.
    pub async fn broadcast(&self, envelope: &MessageEnvelope) -> usize {
        let connections = self.connections.read().await;
        let mut success_count = 0;

        for (peer_id, conn) in connections.iter() {
            match conn.send(envelope).await {
                Ok(()) => {
                    success_count += 1;
                }
                Err(e) => {
                    warn!(
                        "[PEER-POOL] Broadcast to {} failed: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                }
            }
        }

        success_count
    }

    /// Broadcast a message to all connected peers except one
    ///
    /// Used for relay without echo - when relaying a message received from a peer,
    /// don't send it back to the peer we received it from.
    ///
    /// Returns the number of successful sends.
    pub async fn broadcast_except(&self, envelope: &MessageEnvelope, exclude: &[u8; 32]) -> usize {
        let connections = self.connections.read().await;
        let mut success_count = 0;

        for (peer_id, conn) in connections.iter() {
            if peer_id == exclude {
                continue;
            }
            match conn.send(envelope).await {
                Ok(()) => {
                    success_count += 1;
                }
                Err(e) => {
                    warn!(
                        "[PEER-POOL] Broadcast to {} failed: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                }
            }
        }

        success_count
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
}

impl std::fmt::Display for SendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PeerNotFound => write!(f, "peer not found in connection pool"),
            Self::Transport(e) => write!(f, "transport error: {}", e),
        }
    }
}

impl std::error::Error for SendError {}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests would require setting up TCP connections, similar to transport tests
}
