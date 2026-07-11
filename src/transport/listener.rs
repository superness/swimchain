//! TCP Transport listener (SPEC_06 §5.3)
//!
//! Provides TCP listening and connection establishment with automatic handshake.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;

use rand::Rng;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use tokio_socks::tcp::Socks5Stream;

use super::connection::Connection;
use super::handshake::{perform_inbound_handshake, perform_outbound_handshake};
use super::peer::{LocalNodeInfo, PeerInfo};
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
    /// Optional SOCKS5 proxy for outbound dials (SWIM-PRIV-2).
    ///
    /// When `Some`, every outbound `connect` reaches the peer via a SOCKS5
    /// CONNECT handshake through this proxy (e.g. Tor at `127.0.0.1:9050`)
    /// instead of a direct `TcpStream::connect`, hiding the node's real IP.
    /// When `None`, dials are direct (behavior unchanged from before).
    proxy: Option<SocketAddr>,
    /// Our learned public endpoint (NAT reflection). Peers report the address they
    /// observed us as in their VERSION `receiver_addr`; once we see a stable public
    /// one we advertise it instead of our undialable 0.0.0.0/LAN listen address, so
    /// the seed relays a dialable endpoint and other NAT'd nodes can reach us.
    /// Never adopted when a proxy is set (SWIM-PRIV-2 — must not leak the real IP).
    external_addr: Arc<RwLock<Option<SocketAddr>>>,
}

/// True if `addr` is a globally-routable public address worth advertising — excludes
/// loopback, private (RFC1918), link-local, unspecified, and multicast ranges.
fn is_public_addr(addr: &SocketAddr) -> bool {
    use std::net::IpAddr;
    match addr.ip() {
        IpAddr::V4(ip) => {
            !ip.is_loopback()
                && !ip.is_private()
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.is_broadcast()
                // CGNAT 100.64.0.0/10 is not publicly dialable.
                && !(ip.octets()[0] == 100 && (ip.octets()[1] & 0xc0) == 0x40)
        }
        IpAddr::V6(ip) => {
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                // Unique-local fc00::/7 and link-local fe80::/10.
                && (ip.segments()[0] & 0xfe00) != 0xfc00
                && (ip.segments()[0] & 0xffc0) != 0xfe80
        }
    }
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
            proxy: None,
            external_addr: Arc::new(RwLock::new(None)),
        })
    }

    /// The address we advertise to peers in the VERSION handshake. Prefer a learned
    /// public endpoint (NAT reflection); otherwise fall back to the resolved listen
    /// address. Proxied nodes always advertise unspecified (SWIM-PRIV-2).
    async fn advertised_addr(&self) -> SocketAddr {
        if self.proxy.is_some() {
            return unspecified_like(self.local_addr);
        }
        if let Some(ext) = *self.external_addr.read().await {
            return ext;
        }
        resolve_advertised_addr(self.local_addr)
    }

    /// Adopt the public endpoint a peer observed us as, if it's globally routable and
    /// new. Never runs for proxied nodes (must not leak the real IP).
    async fn adopt_observed(&self, peer_info: &PeerInfo) {
        if self.proxy.is_some() {
            return;
        }
        if let Some(obs) = peer_info.observed_external_addr {
            if is_public_addr(&obs) {
                let mut ext = self.external_addr.write().await;
                if *ext != Some(obs) {
                    log::info!(
                        "[NAT] Learned public endpoint {} (was {:?}) — will advertise it",
                        obs,
                        *ext
                    );
                    *ext = Some(obs);
                }
            }
        }
    }

    /// Our learned public endpoint, if any (for re-announcing to peers).
    #[must_use]
    pub async fn external_addr(&self) -> Option<SocketAddr> {
        *self.external_addr.read().await
    }

    /// Configure a SOCKS5 proxy for outbound dials (SWIM-PRIV-2).
    ///
    /// Passing `Some(addr)` routes all subsequent `connect` calls through the
    /// SOCKS5 proxy at `addr`; passing `None` keeps direct connections. This is
    /// a builder-style setter so `TcpTransport::bind(..).await?.with_proxy(..)`
    /// reads naturally and leaves the no-proxy path untouched.
    #[must_use]
    pub fn with_proxy(mut self, proxy: Option<SocketAddr>) -> Self {
        self.proxy = proxy;
        self
    }

    /// Get the configured SOCKS5 proxy, if any.
    #[must_use]
    pub fn proxy(&self) -> Option<SocketAddr> {
        self.proxy
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
        let advertised = self.advertised_addr().await;
        let peer_info =
            perform_inbound_handshake(&mut conn, &self.local_info, advertised).await?;

        // Check for duplicate nonce
        {
            let mut nonces = self.active_nonces.write().await;
            if nonces.contains(&peer_info.nonce) {
                return Err(TransportError::DuplicateConnection);
            }
            nonces.insert(peer_info.nonce);
        }

        // Learn our public endpoint from what this peer observed (NAT reflection).
        self.adopt_observed(&peer_info).await;

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
        let stream = self.dial(addr).await?;
        let our_nonce = generate_nonce();

        let mut conn = Connection::new_outbound(stream, addr, our_nonce);

        // Advertise our best-known address: a learned public endpoint if we have one,
        // else the resolved listen address — or unspecified when proxied (the helper
        // handles the SWIM-PRIV-2 proxy case so the real IP never leaks).
        let advertised_addr = self.advertised_addr().await;
        let peer_info =
            perform_outbound_handshake(&mut conn, &self.local_info, advertised_addr).await?;

        // Check for duplicate nonce
        {
            let mut nonces = self.active_nonces.write().await;
            if nonces.contains(&peer_info.nonce) {
                return Err(TransportError::DuplicateConnection);
            }
            nonces.insert(peer_info.nonce);
        }

        // Learn our public endpoint from what this peer observed (NAT reflection).
        self.adopt_observed(&peer_info).await;

        Ok(conn)
    }

    /// Dial a peer, either directly or through the configured SOCKS5 proxy.
    ///
    /// A 10 second timeout guards against blocking on unreachable hosts /
    /// proxies. When no proxy is set this is byte-for-byte the original direct
    /// `TcpStream::connect` path; when a proxy is set we perform a SOCKS5
    /// CONNECT to `addr` through it (SWIM-PRIV-2).
    async fn dial(&self, addr: SocketAddr) -> Result<TcpStream, TransportError> {
        match self.proxy {
            None => {
                // Direct path (unchanged behavior when no proxy configured).
                tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    TcpStream::connect(addr),
                )
                .await
                .map_err(|_| {
                    TransportError::Io(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        format!("Connection to {} timed out", addr),
                    ))
                })?
                .map_err(TransportError::Io)
            }
            Some(proxy) => {
                // SOCKS5 CONNECT through the proxy. The resulting stream is a
                // transparent tunnel to `addr`, so we hand its inner TcpStream
                // to the normal handshake path.
                let socks = tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    Socks5Stream::connect(proxy, addr),
                )
                .await
                .map_err(|_| {
                    TransportError::Io(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        format!("SOCKS5 connection to {} via {} timed out", addr, proxy),
                    ))
                })?
                .map_err(|e| {
                    TransportError::Io(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("SOCKS5 proxy dial to {} via {} failed: {}", addr, proxy, e),
                    ))
                })?;
                Ok(socks.into_inner())
            }
        }
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

/// Return an unspecified (all-zero) address of the same IP family as `addr`,
/// with port 0. Used to avoid advertising the real listen address to peers
/// when dialing through a proxy (SWIM-PRIV-2).
fn unspecified_like(addr: SocketAddr) -> SocketAddr {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
    let ip = match addr {
        SocketAddr::V4(_) => IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        SocketAddr::V6(_) => IpAddr::V6(Ipv6Addr::UNSPECIFIED),
    };
    SocketAddr::new(ip, 0)
}

/// Resolve the address to advertise to peers in the VERSION handshake.
///
/// A node bound to `0.0.0.0` (the default) would otherwise advertise
/// `0.0.0.0:<port>`, which no peer can dial — so peers that learn this address
/// via GETADDR relay silently fail to connect. When the listen IP is
/// unspecified, substitute the host's primary LAN IPv4 (keeping the port) so
/// same-LAN peers can reach us directly. If detection fails, fall back to the
/// original address (no worse than before).
fn resolve_advertised_addr(local_addr: SocketAddr) -> SocketAddr {
    if !local_addr.ip().is_unspecified() {
        return local_addr;
    }
    match primary_lan_ipv4() {
        Some(ip) => SocketAddr::new(ip, local_addr.port()),
        None => local_addr,
    }
}

/// Best-effort detection of the host's primary LAN IPv4.
///
/// Uses the standard connected-UDP-socket trick: connecting a UDP socket only
/// selects the outgoing route/interface — no packets are sent — so reading the
/// socket's local address yields the IP of the interface that reaches the
/// internet, i.e. the LAN IP on a home network. Works offline.
fn primary_lan_ipv4() -> Option<std::net::IpAddr> {
    use std::net::{IpAddr, UdpSocket};
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    // 8.8.8.8 is a routing hint only; nothing is transmitted by UDP connect.
    if sock.connect("8.8.8.8:80").is_err() {
        // Fall back to a private-range hint if the default route is unusual.
        sock.connect("192.168.1.1:9").ok()?;
    }
    match sock.local_addr().ok()?.ip() {
        IpAddr::V4(v4) if !v4.is_unspecified() && !v4.is_loopback() => Some(IpAddr::V4(v4)),
        _ => None,
    }
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

    #[test]
    fn test_unspecified_like() {
        let v4: SocketAddr = "192.168.1.5:9735".parse().unwrap();
        assert_eq!(unspecified_like(v4), "0.0.0.0:0".parse().unwrap());
        let v6: SocketAddr = "[2001:db8::1]:9735".parse().unwrap();
        assert_eq!(unspecified_like(v6), "[::]:0".parse().unwrap());
    }

    #[test]
    fn is_public_addr_classification() {
        // Public — worth advertising.
        assert!(is_public_addr(&"8.8.8.8:9735".parse().unwrap()));
        assert!(is_public_addr(&"167.71.241.252:9735".parse().unwrap()));
        assert!(is_public_addr(&"[2606:4700:4700::1111]:9735".parse().unwrap()));
        // Non-public — must never be adopted as our external endpoint.
        assert!(!is_public_addr(&"127.0.0.1:9735".parse().unwrap()));
        assert!(!is_public_addr(&"192.168.1.10:9735".parse().unwrap()));
        assert!(!is_public_addr(&"10.0.0.5:9735".parse().unwrap()));
        assert!(!is_public_addr(&"172.16.3.4:9735".parse().unwrap()));
        assert!(!is_public_addr(&"169.254.1.1:9735".parse().unwrap()));
        assert!(!is_public_addr(&"100.64.0.1:9735".parse().unwrap())); // CGNAT
        assert!(!is_public_addr(&"0.0.0.0:9735".parse().unwrap()));
        assert!(!is_public_addr(&"[fe80::1]:9735".parse().unwrap()));
        assert!(!is_public_addr(&"[::1]:9735".parse().unwrap()));
    }

    #[test]
    fn compact_addr_to_socket_addr_decodes() {
        use crate::network::CompactAddr;
        // IPv4-mapped ::ffff:203.0.113.7
        let mut a = [0u8; 16];
        a[10] = 0xff;
        a[11] = 0xff;
        a[12..16].copy_from_slice(&[203, 0, 113, 7]);
        let v4 = CompactAddr { transport: 0x01, address: a, port: 19735, services: 0 };
        assert_eq!(v4.to_socket_addr(), "203.0.113.7:19735".parse().ok());

        // Native IPv6
        let v6bytes = std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 0x42).octets();
        let v6 = CompactAddr { transport: 0x01, address: v6bytes, port: 5000, services: 0 };
        assert_eq!(v6.to_socket_addr(), "[2001:db8::42]:5000".parse().ok());

        // Zero/unspecified → None
        let zero = CompactAddr { transport: 0x01, address: [0u8; 16], port: 0, services: 0 };
        assert_eq!(zero.to_socket_addr(), None);
    }

    #[test]
    fn resolve_advertised_addr_passes_through_specific_ip() {
        // A concrete bound IP is already dialable — advertise it unchanged.
        let specific: SocketAddr = "192.168.1.42:19735".parse().unwrap();
        assert_eq!(resolve_advertised_addr(specific), specific);
    }

    #[test]
    fn resolve_advertised_addr_replaces_unspecified_keeping_port() {
        // 0.0.0.0 is undialable; the result must not be unspecified and must
        // keep the port. (On a host with a LAN this yields the LAN IP; in a
        // no-network sandbox detection may fail and fall back — accept either,
        // but if it resolved, it must be a usable IP on the same port.)
        let any: SocketAddr = "0.0.0.0:19735".parse().unwrap();
        let out = resolve_advertised_addr(any);
        assert_eq!(out.port(), 19735);
        if out != any {
            assert!(!out.ip().is_unspecified() && !out.ip().is_loopback());
        }
    }

    #[tokio::test]
    async fn test_no_proxy_by_default() {
        let local_info = LocalNodeInfo::default();
        let transport = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap();
        assert!(transport.proxy().is_none());
    }

    #[tokio::test]
    async fn test_with_proxy_sets_proxy() {
        let local_info = LocalNodeInfo::default();
        let proxy: SocketAddr = "127.0.0.1:9050".parse().unwrap();
        let transport = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap()
            .with_proxy(Some(proxy));
        assert_eq!(transport.proxy(), Some(proxy));
    }

    #[tokio::test]
    async fn test_connect_routes_through_proxy_not_direct() {
        // Deterministic, no real Tor: when a proxy is set, `connect` must go
        // through the proxy. We point the proxy at a *closed* port, so the dial
        // fails at the SOCKS layer even though the peer itself is directly
        // reachable — proving the direct path is not used.
        let local_info = LocalNodeInfo::default();

        // A real, directly-reachable peer.
        let peer = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info.clone())
            .await
            .unwrap();
        let peer_addr = peer.local_addr();

        // A guaranteed-closed proxy address (bind then drop to free the port).
        let tmp = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let closed_proxy = tmp.local_addr().unwrap();
        drop(tmp);

        let client = TcpTransport::bind("127.0.0.1:0".parse().unwrap(), local_info)
            .await
            .unwrap()
            .with_proxy(Some(closed_proxy));

        let result = client.connect(peer_addr).await;
        assert!(
            result.is_err(),
            "connect must fail via a closed proxy instead of dialing the peer directly"
        );
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
