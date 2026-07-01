//! TCP Transport listener (SPEC_06 §5.3)
//!
//! Provides TCP listening and connection establishment with automatic handshake.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;

use rand::Rng;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;

use super::connection::Connection;
use super::handshake::{perform_inbound_handshake, perform_outbound_handshake};
use super::peer::LocalNodeInfo;
use super::TransportError;

/// TCP transport for peer-to-peer connections
///
/// Handles binding, accepting, and connecting with automatic VERSION/VERACK handshake.
pub struct TcpTransport {
    /// The underlying TCP listener
    listener: TcpListener,
    /// Local address we're bound to
    local_addr: SocketAddr,
    /// Local node information for VERSION messages
    local_info: LocalNodeInfo,
    /// Set of active peer nonces (for duplicate detection)
    active_nonces: Arc<RwLock<HashSet<u64>>>,
}

impl TcpTransport {
    /// Bind to an address and create a new transport
    ///
    /// # Errors
    /// Returns an error if binding fails.
    pub async fn bind(addr: SocketAddr, local_info: LocalNodeInfo) -> Result<Self, TransportError> {
        let listener = TcpListener::bind(addr).await?;
        let local_addr = listener.local_addr()?;

        Ok(Self {
            listener,
            local_addr,
            local_info,
            active_nonces: Arc::new(RwLock::new(HashSet::new())),
        })
    }

    /// Get the local address we're bound to
    #[must_use]
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Get the local node info
    #[must_use]
    pub fn local_info(&self) -> &LocalNodeInfo {
        &self.local_info
    }

    /// Accept an incoming connection and complete handshake
    ///
    /// This blocks until a connection is accepted and the handshake completes.
    ///
    /// # Errors
    /// Returns an error if:
    /// - Accept fails
    /// - Handshake fails or times out
    /// - Duplicate connection detected (nonce collision)
    pub async fn accept(&self) -> Result<Connection, TransportError> {
        let (stream, remote_addr) = self.listener.accept().await?;
        let our_nonce = generate_nonce();

        let mut conn = Connection::new_inbound(stream, remote_addr, our_nonce);
        let peer_info =
            perform_inbound_handshake(&mut conn, &self.local_info, self.local_addr).await?;

        // Check for duplicate nonce
        {
            let mut nonces = self.active_nonces.write().await;
            if nonces.contains(&peer_info.nonce) {
                return Err(TransportError::DuplicateConnection);
            }
            nonces.insert(peer_info.nonce);
        }

        Ok(conn)
    }

    /// Connect to a remote address and complete handshake
    ///
    /// # Errors
    /// Returns an error if:
    /// - Connection fails
    /// - Handshake fails or times out
    /// - Duplicate connection detected (nonce collision)
    pub async fn connect(&self, addr: SocketAddr) -> Result<Connection, TransportError> {
        let stream = TcpStream::connect(addr).await?;
        let our_nonce = generate_nonce();

        let mut conn = Connection::new_outbound(stream, addr, our_nonce);
        let peer_info =
            perform_outbound_handshake(&mut conn, &self.local_info, self.local_addr).await?;

        // Check for duplicate nonce
        {
            let mut nonces = self.active_nonces.write().await;
            if nonces.contains(&peer_info.nonce) {
                return Err(TransportError::DuplicateConnection);
            }
            nonces.insert(peer_info.nonce);
        }

        Ok(conn)
    }

    /// Remove a nonce when connection closes
    ///
    /// Call this when a connection is dropped to allow reconnection.
    pub async fn remove_nonce(&self, nonce: u64) {
        let mut nonces = self.active_nonces.write().await;
        nonces.remove(&nonce);
    }

    /// Get the number of active connections (by nonce count)
    pub async fn active_connection_count(&self) -> usize {
        let nonces = self.active_nonces.read().await;
        nonces.len()
    }

    /// Check if a nonce is already connected
    pub async fn has_nonce(&self, nonce: u64) -> bool {
        let nonces = self.active_nonces.read().await;
        nonces.contains(&nonce)
    }
}

/// Generate a random nonce for connection identification
fn generate_nonce() -> u64 {
    use rand::rngs::OsRng;
    OsRng.gen()
}

impl std::fmt::Debug for TcpTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TcpTransport")
            .field("local_addr", &self.local_addr)
            .field("local_info", &self.local_info)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bind_success() {
        let local_info = LocalNodeInfo::default();
        let transport = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap();

        assert!(transport.local_addr().port() > 0);
        assert_eq!(transport.active_connection_count().await, 0);
    }

    #[tokio::test]
    async fn test_connect_and_accept() {
        let local_info = LocalNodeInfo::default();

        // Server
        let server = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info.clone())
            .await
            .unwrap();
        let server_addr = server.local_addr();

        // Client
        let client = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap();

        // Accept in background
        let server_task = tokio::spawn(async move { server.accept().await });

        // Connect
        let client_conn = client.connect(server_addr).await.unwrap();
        let server_conn = server_task.await.unwrap().unwrap();

        // Both connections should be established
        assert!(client_conn.is_established());
        assert!(server_conn.is_established());

        // They should see each other's nonces
        assert_eq!(server_conn.peer_nonce(), Some(client_conn.our_nonce()));
        assert_eq!(client_conn.peer_nonce(), Some(server_conn.our_nonce()));
    }

    #[tokio::test]
    async fn test_active_nonce_tracking() {
        let local_info = LocalNodeInfo::default();

        let server = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info.clone())
            .await
            .unwrap();
        let server_addr = server.local_addr();

        let client = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap();

        assert_eq!(server.active_connection_count().await, 0);
        assert_eq!(client.active_connection_count().await, 0);

        let server_task = tokio::spawn(async move {
            let conn = server.accept().await.unwrap();
            (server, conn)
        });

        let client_conn = client.connect(server_addr).await.unwrap();
        let (server, server_conn) = server_task.await.unwrap();

        // Both should have 1 active connection tracked
        assert_eq!(server.active_connection_count().await, 1);
        assert_eq!(client.active_connection_count().await, 1);

        // Verify nonce tracking
        let client_peer_nonce = client_conn.peer_nonce().unwrap();
        assert!(server.has_nonce(client_conn.our_nonce()).await);
        assert!(client.has_nonce(server_conn.our_nonce()).await);

        // Remove nonce
        client.remove_nonce(client_peer_nonce).await;
        assert!(!client.has_nonce(client_peer_nonce).await);
    }

    #[tokio::test]
    async fn test_generate_nonce_uniqueness() {
        let nonces: Vec<u64> = (0..1000).map(|_| generate_nonce()).collect();

        // Check that all nonces are unique (extremely high probability)
        let unique: HashSet<u64> = nonces.iter().copied().collect();
        assert_eq!(unique.len(), nonces.len());
    }

    #[tokio::test]
    async fn test_multiple_connections() {
        let local_info = LocalNodeInfo::default();

        let server = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info.clone())
            .await
            .unwrap();
        let server_addr = server.local_addr();

        let client1 = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info.clone())
            .await
            .unwrap();
        let client2 = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap();

        // Accept two connections
        let server = Arc::new(server);
        let server_clone = Arc::clone(&server);

        let accept_task1 = tokio::spawn({
            let server = Arc::clone(&server);
            async move { server.accept().await }
        });
        let accept_task2 = tokio::spawn({
            let server = Arc::clone(&server_clone);
            async move { server.accept().await }
        });

        // Connect both clients
        let conn1 = client1.connect(server_addr).await.unwrap();
        let conn2 = client2.connect(server_addr).await.unwrap();

        let server_conn1 = accept_task1.await.unwrap().unwrap();
        let server_conn2 = accept_task2.await.unwrap().unwrap();

        // All connections should be established
        assert!(conn1.is_established());
        assert!(conn2.is_established());
        assert!(server_conn1.is_established());
        assert!(server_conn2.is_established());

        // Server should have 2 active connections
        assert_eq!(server.active_connection_count().await, 2);
    }
}
