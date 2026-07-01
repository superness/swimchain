//! TCP Connection wrapper
//!
//! Encapsulates a TCP connection with state machine, nonces, and peer information.

use std::net::SocketAddr;
use std::time::Instant;

use tokio::net::TcpStream;

use super::framing::{read_envelope, write_envelope};
use super::peer::PeerInfo;
use super::state::{ConnectionDirection, ConnectionState};
use super::TransportError;
use crate::types::network::MessageEnvelope;

/// A TCP connection with handshake state and peer information
pub struct Connection {
    /// The underlying TCP stream
    stream: TcpStream,
    /// Current connection state
    state: ConnectionState,
    /// Direction of connection (who initiated)
    direction: ConnectionDirection,
    /// Our nonce for this connection
    our_nonce: u64,
    /// Peer's nonce (set after VERSION received)
    peer_nonce: Option<u64>,
    /// Peer information (set after VERSION validated)
    peer_info: Option<PeerInfo>,
    /// Remote socket address
    remote_addr: SocketAddr,
    /// When the connection was created
    created_at: Instant,
    /// When VERSION was sent (for timeout calculation)
    version_sent_at: Option<Instant>,
}

impl Connection {
    /// Create a new outbound connection (we initiated)
    pub fn new_outbound(stream: TcpStream, remote_addr: SocketAddr, our_nonce: u64) -> Self {
        Self {
            stream,
            state: ConnectionState::Connected,
            direction: ConnectionDirection::Outbound,
            our_nonce,
            peer_nonce: None,
            peer_info: None,
            remote_addr,
            created_at: Instant::now(),
            version_sent_at: None,
        }
    }

    /// Create a new inbound connection (peer initiated)
    pub fn new_inbound(stream: TcpStream, remote_addr: SocketAddr, our_nonce: u64) -> Self {
        Self {
            stream,
            state: ConnectionState::Connected,
            direction: ConnectionDirection::Inbound,
            our_nonce,
            peer_nonce: None,
            peer_info: None,
            remote_addr,
            created_at: Instant::now(),
            version_sent_at: None,
        }
    }

    /// Check if the connection is established (handshake complete)
    #[must_use]
    pub fn is_established(&self) -> bool {
        self.state.is_established()
    }

    /// Get peer information (only available after successful handshake)
    #[must_use]
    pub fn peer_info(&self) -> Option<&PeerInfo> {
        self.peer_info.as_ref()
    }

    /// Get current connection state
    #[must_use]
    pub fn state(&self) -> ConnectionState {
        self.state
    }

    /// Get remote socket address
    #[must_use]
    pub fn remote_addr(&self) -> SocketAddr {
        self.remote_addr
    }

    /// Get our nonce for this connection
    #[must_use]
    pub fn our_nonce(&self) -> u64 {
        self.our_nonce
    }

    /// Get the peer's nonce (if known)
    #[must_use]
    pub fn peer_nonce(&self) -> Option<u64> {
        self.peer_nonce
    }

    /// Get connection direction
    #[must_use]
    pub fn direction(&self) -> ConnectionDirection {
        self.direction
    }

    /// Get connection age
    #[must_use]
    pub fn age(&self) -> std::time::Duration {
        self.created_at.elapsed()
    }

    /// Transition to a new state (validates the transition)
    pub(crate) fn set_state(&mut self, new_state: ConnectionState) -> Result<(), TransportError> {
        self.state = match self.direction {
            ConnectionDirection::Outbound => self.state.transition_outbound(new_state)?,
            ConnectionDirection::Inbound => self.state.transition_inbound(new_state)?,
        };
        Ok(())
    }

    /// Set peer information after validating VERSION
    pub(crate) fn set_peer_info(&mut self, info: PeerInfo) {
        self.peer_nonce = Some(info.nonce);
        self.peer_info = Some(info);
    }

    /// Record when VERSION was sent
    pub(crate) fn mark_version_sent(&mut self) {
        self.version_sent_at = Some(Instant::now());
    }

    /// Send a message envelope
    pub async fn send(&mut self, envelope: &MessageEnvelope) -> Result<(), TransportError> {
        write_envelope(&mut self.stream, envelope).await
    }

    /// Receive a message envelope
    /// Returns `Ok(None)` if connection was closed cleanly
    pub async fn recv(&mut self) -> Result<Option<MessageEnvelope>, TransportError> {
        read_envelope(&mut self.stream).await
    }

    /// Consume the connection and return the underlying TcpStream
    ///
    /// This is used when handing off a connection to the PeerConnectionPool,
    /// which needs to split the stream for concurrent read/write.
    pub fn into_stream(self) -> TcpStream {
        self.stream
    }
}

impl std::fmt::Debug for Connection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Connection")
            .field("state", &self.state)
            .field("direction", &self.direction)
            .field("remote_addr", &self.remote_addr)
            .field("our_nonce", &self.our_nonce)
            .field("peer_nonce", &self.peer_nonce)
            .field("created_at", &self.created_at)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_new_outbound_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let _ = listener.accept().await.unwrap();
        let stream = client_task.await.unwrap();

        let conn = Connection::new_outbound(stream, addr, 12345);

        assert_eq!(conn.state(), ConnectionState::Connected);
        assert_eq!(conn.direction(), ConnectionDirection::Outbound);
        assert_eq!(conn.our_nonce(), 12345);
        assert!(conn.peer_nonce().is_none());
        assert!(conn.peer_info().is_none());
        assert!(!conn.is_established());
    }

    #[tokio::test]
    async fn test_new_inbound_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let (stream, peer_addr) = listener.accept().await.unwrap();
        let _ = client_task.await.unwrap();

        let conn = Connection::new_inbound(stream, peer_addr, 67890);

        assert_eq!(conn.state(), ConnectionState::Connected);
        assert_eq!(conn.direction(), ConnectionDirection::Inbound);
        assert_eq!(conn.our_nonce(), 67890);
        assert!(!conn.is_established());
    }

    #[tokio::test]
    async fn test_state_transitions() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let _ = listener.accept().await.unwrap();
        let stream = client_task.await.unwrap();

        let mut conn = Connection::new_outbound(stream, addr, 12345);

        // Valid outbound transitions
        assert!(conn.set_state(ConnectionState::VersionSent).is_ok());
        assert_eq!(conn.state(), ConnectionState::VersionSent);

        assert!(conn.set_state(ConnectionState::VerackSent).is_ok());
        assert_eq!(conn.state(), ConnectionState::VerackSent);

        assert!(conn.set_state(ConnectionState::Established).is_ok());
        assert!(conn.is_established());
    }

    #[tokio::test]
    async fn test_invalid_state_transition() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let _ = listener.accept().await.unwrap();
        let stream = client_task.await.unwrap();

        let mut conn = Connection::new_outbound(stream, addr, 12345);

        // Invalid: can't skip to Established
        let result = conn.set_state(ConnectionState::Established);
        assert!(matches!(
            result,
            Err(TransportError::InvalidStateTransition { .. })
        ));
    }

    #[tokio::test]
    async fn test_set_peer_info() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let client_task = tokio::spawn(async move { TcpStream::connect(addr).await.unwrap() });

        let _ = listener.accept().await.unwrap();
        let stream = client_task.await.unwrap();

        let mut conn = Connection::new_outbound(stream, addr, 12345);

        let peer = PeerInfo {
            node_id: [0xab; 32],
            protocol_version: 1,
            services: 0x0001,
            user_agent: "Test/1.0".to_string(),
            start_height: 100,
            relay: true,
            nonce: 67890,
            remote_addr: addr,
            timestamp: 1700000000,
        };

        conn.set_peer_info(peer);

        assert_eq!(conn.peer_nonce(), Some(67890));
        assert!(conn.peer_info().is_some());
        assert_eq!(conn.peer_info().unwrap().user_agent, "Test/1.0");
    }
}
