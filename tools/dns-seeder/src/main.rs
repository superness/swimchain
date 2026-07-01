//! Swimchain DNS Seeder
//!
//! A network crawler that maintains a list of healthy peers and serves them
//! via DNS (like Bitcoin's dns-seed) or HTTP API.
//!
//! This seeder speaks the Swimchain wire protocol to discover peers:
//! 1. Connects to known peers
//! 2. Performs VERSION/VERACK handshake
//! 3. Sends GETADDR to request peer addresses
//! 4. Parses ADDR responses to discover new peers
//!
//! Usage:
//!   swimchain-dns-seeder --bootstrap 1.2.3.4:19735 --dns-port 5353 --http-port 8053
//!
//! DNS queries return A records with peer IPs:
//!   dig @localhost -p 5353 seed.swimchain.net
//!
//! HTTP API returns JSON list:
//!   curl http://localhost:8053/peers

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use clap::Parser;
use log::{debug, error, info, warn};
use rand::seq::SliceRandom;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::RwLock;
use tokio::time::timeout;

// Wire protocol constants
const MAGIC_TESTNET: [u8; 4] = [0x54, 0x45, 0x53, 0x54]; // "TEST"
const MAGIC_MAINNET: [u8; 4] = [0x43, 0x53, 0x4F, 0x43]; // "CSOC"
const PROTOCOL_VERSION: u32 = 1;
const HEADER_SIZE: usize = 46;
const COMPACT_ADDR_SIZE: usize = 26;
const WIRE_ADDR_SIZE: usize = 75;

// Message types
const MSG_VERSION: u8 = 0x00;
const MSG_VERACK: u8 = 0x01;
const MSG_GETADDR: u8 = 0x10;
const MSG_ADDR: u8 = 0x11;

/// Swimchain DNS Seeder - crawls network and serves peer IPs
#[derive(Parser, Debug)]
#[command(name = "swimchain-dns-seeder")]
#[command(about = "DNS seeder for Swimchain network")]
struct Args {
    /// Bootstrap nodes to start crawling from (ip:port)
    #[arg(short, long, required = true)]
    bootstrap: Vec<String>,

    /// DNS server port (UDP)
    #[arg(long, default_value = "5353")]
    dns_port: u16,

    /// HTTP API port
    #[arg(long, default_value = "8053")]
    http_port: u16,

    /// Crawl interval in seconds
    #[arg(long, default_value = "30")]
    crawl_interval: u64,

    /// Connection timeout in seconds
    #[arg(long, default_value = "10")]
    timeout_secs: u64,

    /// Maximum peers to return per query
    #[arg(long, default_value = "25")]
    max_peers: usize,

    /// Use mainnet magic bytes (default: testnet)
    #[arg(long)]
    mainnet: bool,

    /// Include localhost/loopback addresses (for local testing)
    #[arg(long)]
    allow_local: bool,
}

/// Peer state tracked by the seeder
#[derive(Debug, Clone)]
struct PeerInfo {
    addr: SocketAddr,
    last_seen: Instant,
    last_checked: Instant,
    consecutive_failures: u32,
    is_good: bool,
    /// Number of peers this node told us about
    peers_reported: usize,
}

impl PeerInfo {
    fn new(addr: SocketAddr) -> Self {
        Self {
            addr,
            last_seen: Instant::now(),
            last_checked: Instant::now(),
            consecutive_failures: 0,
            is_good: false,
            peers_reported: 0,
        }
    }
}

/// Shared state for the seeder
struct SeederState {
    /// All known peers
    peers: HashMap<SocketAddr, PeerInfo>,
    /// Good peers (recently verified as online and responding to protocol)
    good_peers: HashSet<SocketAddr>,
    /// Magic bytes to use
    magic: [u8; 4],
}

impl SeederState {
    fn new(magic: [u8; 4]) -> Self {
        Self {
            peers: HashMap::new(),
            good_peers: HashSet::new(),
            magic,
        }
    }

    /// Get random good peers for DNS response
    fn get_random_good_peers(&self, count: usize) -> Vec<SocketAddr> {
        let mut peers: Vec<_> = self.good_peers.iter().copied().collect();
        peers.shuffle(&mut rand::thread_rng());
        peers.truncate(count);
        peers
    }

    /// Mark peer as good (online and responding to protocol)
    fn mark_good(&mut self, addr: SocketAddr, peers_reported: usize) {
        if let Some(peer) = self.peers.get_mut(&addr) {
            peer.last_seen = Instant::now();
            peer.last_checked = Instant::now();
            peer.consecutive_failures = 0;
            peer.is_good = true;
            peer.peers_reported = peers_reported;
            self.good_peers.insert(addr);
        }
    }

    /// Mark peer as failed
    fn mark_failed(&mut self, addr: SocketAddr) {
        if let Some(peer) = self.peers.get_mut(&addr) {
            peer.last_checked = Instant::now();
            peer.consecutive_failures += 1;
            if peer.consecutive_failures >= 3 {
                peer.is_good = false;
                self.good_peers.remove(&addr);
            }
        }
    }

    /// Add a new peer to track
    fn add_peer(&mut self, addr: SocketAddr) -> bool {
        if self.peers.contains_key(&addr) {
            return false;
        }
        // Skip localhost and private IPs for public seeding
        if addr.ip().is_loopback() {
            return false;
        }
        info!("[SEEDER] Discovered new peer: {}", addr);
        self.peers.insert(addr, PeerInfo::new(addr));
        true
    }
}

type SharedState = Arc<RwLock<SeederState>>;

/// Build a message envelope
fn build_envelope(magic: &[u8; 4], msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut envelope = Vec::with_capacity(HEADER_SIZE + payload.len());

    // Magic (4 bytes)
    envelope.extend_from_slice(magic);

    // Version (1 byte)
    envelope.push(PROTOCOL_VERSION as u8);

    // Message type (1 byte)
    envelope.push(msg_type);

    // Fork ID (32 bytes - zeros for fork-agnostic)
    envelope.extend_from_slice(&[0u8; 32]);

    // Payload length (4 bytes LE)
    envelope.extend_from_slice(&(payload.len() as u32).to_le_bytes());

    // Checksum (4 bytes - first 4 of SHA256)
    let hash = Sha256::digest(payload);
    envelope.extend_from_slice(&hash[..4]);

    // Payload
    envelope.extend_from_slice(payload);

    envelope
}

/// Build VERSION payload
fn build_version_payload(our_addr: SocketAddr) -> Vec<u8> {
    let mut payload = Vec::with_capacity(128);

    // Protocol version (4 bytes LE)
    payload.extend_from_slice(&PROTOCOL_VERSION.to_le_bytes());

    // Node services (8 bytes LE) - 0 for seeder
    payload.extend_from_slice(&0u64.to_le_bytes());

    // Timestamp (8 bytes LE)
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    payload.extend_from_slice(&timestamp.to_le_bytes());

    // Sender address (26 bytes)
    payload.extend_from_slice(&build_compact_addr(our_addr));

    // Receiver address (26 bytes) - zeros
    payload.extend_from_slice(&[0u8; COMPACT_ADDR_SIZE]);

    // Nonce (8 bytes LE)
    let nonce: u64 = rand::random();
    payload.extend_from_slice(&nonce.to_le_bytes());

    // User agent (1 byte length + string)
    let user_agent = "swimchain-dns-seeder/1.0";
    payload.push(user_agent.len() as u8);
    payload.extend_from_slice(user_agent.as_bytes());

    // Start height (4 bytes LE) - 0 for seeder
    payload.extend_from_slice(&0u32.to_le_bytes());

    // Relay (1 byte) - false for seeder
    payload.push(0);

    payload
}

/// Build compact address (26 bytes)
fn build_compact_addr(addr: SocketAddr) -> [u8; COMPACT_ADDR_SIZE] {
    let mut compact = [0u8; COMPACT_ADDR_SIZE];

    // Transport (1 byte) - TCP over IPv4 = 0x01
    compact[0] = 0x01;

    // Address as IPv4-mapped IPv6 (16 bytes)
    match addr.ip() {
        IpAddr::V4(ipv4) => {
            // IPv4-mapped IPv6: ::ffff:a.b.c.d
            compact[11] = 0xff;
            compact[12] = 0xff;
            compact[13..17].copy_from_slice(&ipv4.octets());
        }
        IpAddr::V6(ipv6) => {
            compact[1..17].copy_from_slice(&ipv6.octets());
        }
    }

    // Port (2 bytes LE)
    compact[17..19].copy_from_slice(&addr.port().to_le_bytes());

    // Services (4 bytes LE) - 0
    // Padding (3 bytes) - already zeros

    compact
}

/// Build GETADDR payload
fn build_getaddr_payload() -> Vec<u8> {
    let mut payload = Vec::with_capacity(34);

    // Fork ID (32 bytes - zeros for any fork)
    payload.extend_from_slice(&[0u8; 32]);

    // Max addresses (2 bytes LE)
    payload.extend_from_slice(&1000u16.to_le_bytes());

    payload
}

/// Parse ADDR payload and extract peer addresses
fn parse_addr_payload(payload: &[u8], allow_local: bool) -> Vec<SocketAddr> {
    let mut addrs = Vec::new();

    if payload.len() < 2 {
        debug!("[SEEDER] ADDR payload too small: {} bytes", payload.len());
        return addrs;
    }

    let count = u16::from_le_bytes([payload[0], payload[1]]) as usize;
    debug!("[SEEDER] ADDR contains {} address entries", count);
    let mut offset = 2;

    for i in 0..count {
        if offset + WIRE_ADDR_SIZE > payload.len() {
            debug!("[SEEDER] ADDR payload truncated at entry {}", i);
            break;
        }

        let wire_addr = &payload[offset..offset + WIRE_ADDR_SIZE];
        offset += WIRE_ADDR_SIZE;

        // Parse WireAddr (75 bytes):
        // transport: 1, address: 64, port: 2, services: 4, last_seen: 4
        let transport = wire_addr[0];
        let addr_bytes = &wire_addr[1..65];
        let port = u16::from_le_bytes([wire_addr[65], wire_addr[66]]);

        // Only handle TCP/IPv4 (0x01) for now
        if transport == 0x01 && port > 0 {
            // Try to extract IPv4 from the 64-byte address field
            // It could be IPv4-mapped IPv6 format or plain IPv4 in first 4 bytes

            let ip = if addr_bytes[10] == 0xff && addr_bytes[11] == 0xff {
                // IPv4-mapped IPv6 (::ffff:a.b.c.d)
                Some(Ipv4Addr::new(
                    addr_bytes[12],
                    addr_bytes[13],
                    addr_bytes[14],
                    addr_bytes[15],
                ))
            } else if addr_bytes[4..64].iter().all(|&b| b == 0) {
                // Plain IPv4 in first 4 bytes
                Some(Ipv4Addr::new(
                    addr_bytes[0],
                    addr_bytes[1],
                    addr_bytes[2],
                    addr_bytes[3],
                ))
            } else {
                debug!("[SEEDER] Entry {}: unknown address format", i);
                None
            };

            if let Some(ip) = ip {
                let skip = ip.is_unspecified() || (!allow_local && ip.is_loopback());
                if skip {
                    debug!("[SEEDER] Entry {}: skipping {}:{} (local/unspecified)", i, ip, port);
                } else {
                    debug!("[SEEDER] Entry {}: found {}:{}", i, ip, port);
                    addrs.push(SocketAddr::new(IpAddr::V4(ip), port));
                }
            }
        } else {
            debug!("[SEEDER] Entry {}: transport=0x{:02x}, port={}", i, transport, port);
        }
    }

    addrs
}

/// Read a message from a stream
async fn read_message(stream: &mut TcpStream, magic: &[u8; 4], timeout_duration: Duration) -> Option<(u8, Vec<u8>)> {
    let mut header = [0u8; HEADER_SIZE];

    match timeout(timeout_duration, stream.read_exact(&mut header)).await {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            debug!("[SEEDER] Read header error: {}", e);
            return None;
        }
        Err(_) => {
            debug!("[SEEDER] Read header timeout");
            return None;
        }
    }

    // Verify magic
    if &header[0..4] != magic {
        debug!("[SEEDER] Invalid magic: {:?}", &header[0..4]);
        return None;
    }

    let msg_type = header[5];
    let payload_len = u32::from_le_bytes([header[38], header[39], header[40], header[41]]) as usize;

    if payload_len > 1_000_000 {
        debug!("[SEEDER] Payload too large: {}", payload_len);
        return None;
    }

    let mut payload = vec![0u8; payload_len];
    if payload_len > 0 {
        match timeout(timeout_duration, stream.read_exact(&mut payload)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                debug!("[SEEDER] Read payload error: {}", e);
                return None;
            }
            Err(_) => {
                debug!("[SEEDER] Read payload timeout");
                return None;
            }
        }
    }

    // Verify checksum
    let hash = Sha256::digest(&payload);
    if &hash[..4] != &header[42..46] {
        debug!("[SEEDER] Invalid checksum");
        return None;
    }

    Some((msg_type, payload))
}

/// Crawl a single peer - perform handshake and get addresses
async fn crawl_peer(addr: SocketAddr, magic: [u8; 4], timeout_secs: u64, allow_local: bool) -> Option<Vec<SocketAddr>> {
    let timeout_duration = Duration::from_secs(timeout_secs);

    // Connect
    let mut stream = match timeout(timeout_duration, TcpStream::connect(addr)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            debug!("[SEEDER] Connect to {} failed: {}", addr, e);
            return None;
        }
        Err(_) => {
            debug!("[SEEDER] Connect to {} timeout", addr);
            return None;
        }
    };

    // Build and send VERSION
    let version_payload = build_version_payload(addr);
    let version_msg = build_envelope(&magic, MSG_VERSION, &version_payload);

    if let Err(e) = timeout(timeout_duration, stream.write_all(&version_msg)).await {
        debug!("[SEEDER] Send VERSION to {} failed: {:?}", addr, e);
        return None;
    }

    // Read VERSION response
    let (msg_type, _) = read_message(&mut stream, &magic, timeout_duration).await?;
    if msg_type != MSG_VERSION {
        debug!("[SEEDER] Expected VERSION from {}, got {}", addr, msg_type);
        return None;
    }

    // Send VERACK
    let verack_msg = build_envelope(&magic, MSG_VERACK, &[]);
    if let Err(e) = timeout(timeout_duration, stream.write_all(&verack_msg)).await {
        debug!("[SEEDER] Send VERACK to {} failed: {:?}", addr, e);
        return None;
    }

    // Read VERACK (might come before or after our VERACK)
    let (msg_type, _) = read_message(&mut stream, &magic, timeout_duration).await?;
    if msg_type != MSG_VERACK {
        debug!("[SEEDER] Expected VERACK from {}, got {}", addr, msg_type);
        return None;
    }

    // Handshake complete! Now request addresses
    let getaddr_payload = build_getaddr_payload();
    let getaddr_msg = build_envelope(&magic, MSG_GETADDR, &getaddr_payload);

    if let Err(e) = timeout(timeout_duration, stream.write_all(&getaddr_msg)).await {
        debug!("[SEEDER] Send GETADDR to {} failed: {:?}", addr, e);
        return None;
    }

    // Read ADDR response (or other messages until we get ADDR)
    // Nodes may flood I_HAVE messages after connection, so read many messages
    let mut msg_count = 0;
    for _ in 0..100 {
        match read_message(&mut stream, &magic, timeout_duration).await {
            Some((MSG_ADDR, payload)) => {
                let addrs = parse_addr_payload(&payload, allow_local);
                debug!("[SEEDER] Got {} addresses from {} (after {} other messages)", addrs.len(), addr, msg_count);
                return Some(addrs);
            }
            Some((other_type, _)) => {
                msg_count += 1;
                // Log first few, then be quiet
                if msg_count <= 3 {
                    debug!("[SEEDER] Got message type 0x{:02x} from {}, waiting for ADDR", other_type, addr);
                }
                continue;
            }
            None => {
                debug!("[SEEDER] No response from {} (read {} messages)", addr, msg_count);
                return Some(vec![]); // Peer is good but has no peers to share
            }
        }
    }

    // If we got here, peer is responsive but didn't send ADDR
    debug!("[SEEDER] {} sent 100 messages but no ADDR", addr);
    Some(vec![])
}

/// Crawl task - periodically crawl peers and discover new ones
async fn crawl_task(state: SharedState, bootstrap: Vec<SocketAddr>, interval: u64, timeout_secs: u64, allow_local: bool) {
    // Add bootstrap nodes
    {
        let mut state = state.write().await;
        for addr in &bootstrap {
            state.peers.insert(*addr, PeerInfo::new(*addr));
        }
    }

    let mut ticker = tokio::time::interval(Duration::from_secs(interval));

    loop {
        ticker.tick().await;

        let (peers_to_check, magic) = {
            let state = state.read().await;
            (state.peers.keys().copied().collect::<Vec<_>>(), state.magic)
        };

        info!("[SEEDER] Crawling {} known peers...", peers_to_check.len());

        let mut good_count = 0;
        let mut failed_count = 0;
        let mut new_peers = 0;

        for addr in peers_to_check {
            match crawl_peer(addr, magic, timeout_secs, allow_local).await {
                Some(discovered) => {
                    let discovered_count = discovered.len();

                    // Add discovered peers
                    {
                        let mut state = state.write().await;
                        for peer_addr in discovered {
                            if state.add_peer(peer_addr) {
                                new_peers += 1;
                            }
                        }
                        state.mark_good(addr, discovered_count);
                    }

                    good_count += 1;
                    debug!("[SEEDER] {} is good, reported {} peers", addr, discovered_count);
                }
                None => {
                    let mut state = state.write().await;
                    state.mark_failed(addr);
                    failed_count += 1;
                }
            }

            // Small delay between connections to avoid overwhelming
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        let state = state.read().await;
        info!(
            "[SEEDER] Crawl complete: {} good, {} failed, {} new peers discovered, {} total known, {} good",
            good_count,
            failed_count,
            new_peers,
            state.peers.len(),
            state.good_peers.len()
        );
    }
}

/// HTTP API handler
async fn http_handler(state: SharedState, port: u16, max_peers: usize) {
    let listener = match TcpListener::bind(format!("0.0.0.0:{}", port)).await {
        Ok(l) => l,
        Err(e) => {
            error!("[SEEDER] Failed to bind HTTP port {}: {}", port, e);
            return;
        }
    };

    info!("[SEEDER] HTTP API listening on port {}", port);

    loop {
        let (mut socket, addr) = match listener.accept().await {
            Ok(s) => s,
            Err(e) => {
                warn!("[SEEDER] Accept error: {}", e);
                continue;
            }
        };

        let state = state.clone();

        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;

            // Get random good peers
            let (peers, total_known, total_good) = {
                let state = state.read().await;
                (
                    state.get_random_good_peers(max_peers),
                    state.peers.len(),
                    state.good_peers.len(),
                )
            };

            // Return as JSON
            let peer_strings: Vec<String> = peers.iter().map(|p| p.to_string()).collect();
            let json = serde_json::json!({
                "peers": peer_strings,
                "count": peer_strings.len(),
                "total_known": total_known,
                "total_good": total_good
            });

            let body = json.to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                body.len(),
                body
            );

            let _ = socket.write_all(response.as_bytes()).await;
            debug!("[SEEDER] HTTP request from {}, returned {} peers", addr, peers.len());
        });
    }
}

/// DNS server handler - responds to DNS A record queries with peer IPs
async fn dns_handler(state: SharedState, port: u16, max_peers: usize) {
    let socket = match UdpSocket::bind(format!("0.0.0.0:{}", port)).await {
        Ok(s) => s,
        Err(e) => {
            error!("[SEEDER] Failed to bind DNS port {}: {}", port, e);
            return;
        }
    };

    info!("[SEEDER] DNS server listening on UDP port {}", port);

    let mut buf = [0u8; 512];

    loop {
        let (len, src) = match socket.recv_from(&mut buf).await {
            Ok(r) => r,
            Err(e) => {
                warn!("[SEEDER] DNS recv error: {}", e);
                continue;
            }
        };

        // Get random good peers (IPv4 only for A records)
        let peers: Vec<Ipv4Addr> = {
            let state = state.read().await;
            state
                .get_random_good_peers(max_peers)
                .into_iter()
                .filter_map(|addr| match addr.ip() {
                    IpAddr::V4(ip) => Some(ip),
                    _ => None,
                })
                .collect()
        };

        // Build DNS response
        let response = build_dns_response(&buf[..len], &peers);

        if let Err(e) = socket.send_to(&response, src).await {
            warn!("[SEEDER] DNS send error: {}", e);
        } else {
            debug!("[SEEDER] DNS query from {}, returned {} peers", src, peers.len());
        }
    }
}

/// Build a DNS response with A records for the given IPs
fn build_dns_response(query: &[u8], peers: &[Ipv4Addr]) -> Vec<u8> {
    let mut response = Vec::with_capacity(512);

    if query.len() < 12 {
        return response;
    }

    // Transaction ID (copy from query)
    response.extend_from_slice(&query[0..2]);

    // Flags: QR=1 (response), OPCODE=0, AA=1, TC=0, RD=1, RA=0, RCODE=0
    response.push(0x85); // 10000101
    response.push(0x00); // 00000000

    // QDCOUNT = 1
    response.extend_from_slice(&[0x00, 0x01]);

    // ANCOUNT = number of peers
    let answer_count = (peers.len() as u16).min(255);
    response.extend_from_slice(&answer_count.to_be_bytes());

    // NSCOUNT = 0, ARCOUNT = 0
    response.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);

    // Copy question section from query
    let question_start = 12;
    let mut i = question_start;
    while i < query.len() && query[i] != 0 {
        i += query[i] as usize + 1;
    }
    i += 5; // null byte + QTYPE (2) + QCLASS (2)
    if i <= query.len() {
        response.extend_from_slice(&query[question_start..i]);
    }

    // Add A records for each peer
    for ip in peers.iter().take(255) {
        // Name pointer to question (offset 0x0c = 12)
        response.extend_from_slice(&[0xc0, 0x0c]);

        // TYPE = A (1)
        response.extend_from_slice(&[0x00, 0x01]);

        // CLASS = IN (1)
        response.extend_from_slice(&[0x00, 0x01]);

        // TTL = 60 seconds
        response.extend_from_slice(&[0x00, 0x00, 0x00, 0x3c]);

        // RDLENGTH = 4
        response.extend_from_slice(&[0x00, 0x04]);

        // RDATA = IP address
        response.extend_from_slice(&ip.octets());
    }

    response
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Args::parse();

    // Parse bootstrap addresses
    let bootstrap: Vec<SocketAddr> = args
        .bootstrap
        .iter()
        .filter_map(|s| s.parse().ok())
        .collect();

    if bootstrap.is_empty() {
        error!("No valid bootstrap addresses provided");
        std::process::exit(1);
    }

    let magic = if args.mainnet { MAGIC_MAINNET } else { MAGIC_TESTNET };

    info!("[SEEDER] Starting Swimchain DNS Seeder");
    info!("[SEEDER] Network: {}", if args.mainnet { "mainnet" } else { "testnet" });
    info!("[SEEDER] Bootstrap nodes: {:?}", bootstrap);
    info!("[SEEDER] DNS port: {}, HTTP port: {}", args.dns_port, args.http_port);
    info!("[SEEDER] Crawl interval: {}s, timeout: {}s", args.crawl_interval, args.timeout_secs);

    let state = Arc::new(RwLock::new(SeederState::new(magic)));

    // Spawn crawler
    let crawler_state = state.clone();
    let crawl_interval = args.crawl_interval;
    let timeout_secs = args.timeout_secs;
    let allow_local = args.allow_local;
    tokio::spawn(async move {
        crawl_task(crawler_state, bootstrap, crawl_interval, timeout_secs, allow_local).await;
    });

    // Spawn HTTP server
    let http_state = state.clone();
    let http_port = args.http_port;
    let http_max_peers = args.max_peers;
    tokio::spawn(async move {
        http_handler(http_state, http_port, http_max_peers).await;
    });

    // Run DNS server on main task
    dns_handler(state, args.dns_port, args.max_peers).await;
}
