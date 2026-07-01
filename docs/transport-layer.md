# Transport Layer (Milestone 2.2)

This document describes the Swimchain TCP transport layer for peer-to-peer connections.

## Overview

The transport layer provides:
- TCP listener for accepting incoming connections
- Outbound connection establishment
- VERSION/VERACK handshake protocol (SPEC_06 §5.3)
- Message framing with 46-byte envelope headers
- Connection state machine with proper lifecycle management
- PING/PONG keepalive mechanism
- Duplicate/self-connection detection via nonces

## Quick Start

```rust
use swimchain::transport::{TcpTransport, LocalNodeInfo};

// Create local node info
let local_info = LocalNodeInfo::default();

// Bind to an address
let transport = TcpTransport::bind("127.0.0.1:9735".parse().unwrap(), local_info)
    .await?;

// Accept incoming connections (blocks until connection)
let conn = transport.accept().await?;
assert!(conn.is_established());

// Or connect to a peer
let conn = transport.connect("192.168.1.100:9735".parse().unwrap()).await?;
assert!(conn.is_established());

// Send/receive messages after handshake
conn.send(&envelope).await?;
let msg = conn.recv().await?;
```

## Module Structure

The transport layer is implemented in `src/transport/`:

| File | Description |
|------|-------------|
| `mod.rs` | Module exports and documentation |
| `error.rs` | `TransportError` enum with all error variants |
| `state.rs` | `ConnectionState` and `ConnectionDirection` enums |
| `framing.rs` | `read_envelope()` / `write_envelope()` functions |
| `connection.rs` | `Connection` struct with state machine |
| `handshake.rs` | VERSION/VERACK handshake protocol |
| `listener.rs` | `TcpTransport` for binding and connecting |
| `peer.rs` | `PeerInfo`, `LocalNodeInfo`, `PeerEvent` types |
| `keepalive.rs` | PING/PONG background handler |

## Key Types

### TcpTransport

The main entry point for network operations:

```rust
pub struct TcpTransport {
    listener: TcpListener,
    local_addr: SocketAddr,
    local_info: LocalNodeInfo,
    active_nonces: Arc<RwLock<HashSet<u64>>>,
}
```

Methods:
- `bind(addr, local_info)` - Bind to address and create transport
- `accept()` - Accept incoming connection with handshake
- `connect(addr)` - Connect to peer with handshake
- `local_addr()` - Get bound address
- `remove_nonce(nonce)` - Remove nonce on connection close
- `active_connection_count()` - Get number of active connections

### Connection

Represents a TCP connection with handshake state:

```rust
pub struct Connection {
    stream: TcpStream,
    state: ConnectionState,
    direction: ConnectionDirection,
    our_nonce: u64,
    peer_nonce: Option<u64>,
    peer_info: Option<PeerInfo>,
    remote_addr: SocketAddr,
    // ...
}
```

Methods:
- `send(envelope)` - Send a message envelope
- `recv()` - Receive a message envelope
- `is_established()` - Check if handshake complete
- `state()` - Get current state
- `direction()` - Get connection direction (Inbound/Outbound)
- `peer_info()` - Get peer's VERSION information
- `our_nonce()` / `peer_nonce()` - Get connection nonces

### LocalNodeInfo

Configuration for our node's VERSION message:

```rust
pub struct LocalNodeInfo {
    pub services: u64,        // Capability bitmask
    pub height: u32,          // Current block height
    pub user_agent: String,   // e.g., "Swimchain/0.1.0"
    pub relay: bool,          // Accept gossip messages
}
```

### PeerInfo

Information extracted from peer's VERSION:

```rust
pub struct PeerInfo {
    pub node_id: [u8; 32],       // SHA-256(nonce:user_agent)
    pub protocol_version: u32,   // Protocol version (1)
    pub services: u64,           // Capability bitmask
    pub user_agent: String,      // Peer's user agent
    pub start_height: u32,       // Peer's block height
    pub relay: bool,             // Peer wants gossip
    pub nonce: u64,              // Connection nonce
    pub remote_addr: SocketAddr, // Remote address
    pub timestamp: u64,          // VERSION timestamp
}
```

## Connection States

See [connection-lifecycle.md](connection-lifecycle.md) for detailed state machine documentation.

| State | Description |
|-------|-------------|
| `Connected` | TCP connected, no messages yet |
| `VersionSent` | VERSION sent (outbound only) |
| `VersionReceived` | VERSION received (inbound only) |
| `VerackSent` | Both VERSIONs exchanged, VERACK sent |
| `Established` | Handshake complete |
| `Closed` | Connection closed |

## Error Handling

All operations return `Result<T, TransportError>`:

| Error | Cause |
|-------|-------|
| `Io(io::Error)` | I/O operation failed |
| `VersionTimeout(u64)` | VERSION not received within timeout |
| `HandshakeTimeout(u64)` | Handshake not completed in time |
| `ConnectionClosed` | Peer closed connection |
| `VersionMismatch { peer, ours }` | Protocol version incompatible |
| `DuplicateConnection` | Peer nonce already connected |
| `SelfConnection` | Connected to ourselves (nonce match) |
| `Wire(WireError)` | Wire protocol error |
| `InvalidStateTransition` | Invalid state machine transition |
| `MessageTooLarge { size, max }` | Payload exceeds maximum |
| `UnexpectedMessage(String)` | Wrong message type received |
| `PongTimeout` | PONG not received in keepalive |

## Protocol Constants

From `src/types/constants.rs`:

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_PORT` | 9735 | Default network port |
| `HANDSHAKE_TIMEOUT_SECS` | 30 | Total handshake timeout |
| `VERSION_TIMEOUT_SECS` | 10 | VERSION message timeout |
| `PING_INTERVAL_SECS` | 120 | Keepalive ping interval |
| `PONG_TIMEOUT_SECS` | 60 | PONG response timeout |
| `MESSAGE_HEADER_SIZE` | 46 | Envelope header size |
| `MAX_PAYLOAD_SIZE` | 4MB | Maximum message payload |

## Message Framing

Messages are read/written using the 46-byte envelope format:

```rust
use swimchain::transport::framing::{read_envelope, write_envelope};

// Write a message
let envelope = MessageEnvelope::new_fork_agnostic(MessageType::Ping, payload);
write_envelope(&mut stream, &envelope).await?;

// Read a message
match read_envelope(&mut stream).await? {
    Some(envelope) => { /* process message */ }
    None => { /* connection closed */ }
}
```

The framing layer:
- Validates magic bytes ("CSOC")
- Checks payload size against MAX_PAYLOAD_SIZE
- Verifies checksum (first 4 bytes of SHA-256)
- Returns `Ok(None)` on clean EOF

## Keepalive

The `connection_handler` function runs a background loop that:
- Sends PING every `PING_INTERVAL_SECS` (120s)
- Responds to PING with matching PONG
- Disconnects if no PONG within `PONG_TIMEOUT_SECS` (60s)
- Forwards other messages via broadcast channel

```rust
use swimchain::transport::keepalive::connection_handler;
use tokio::sync::{broadcast, oneshot};

let (event_tx, _) = broadcast::channel(100);
let (shutdown_tx, shutdown_rx) = oneshot::channel();

// Run handler (takes ownership of connection)
tokio::spawn(connection_handler(conn, event_tx, shutdown_rx));

// Later, signal shutdown
let _ = shutdown_tx.send(());
```

## Self-Connection Detection

The transport layer prevents self-connections using random nonces:
1. Each connection generates a unique 64-bit nonce
2. Nonces are exchanged in VERSION messages
3. If peer's nonce matches ours, it's a self-connection
4. Self-connections are rejected with `TransportError::SelfConnection`

## Duplicate Connection Detection

Duplicate connections from the same peer are detected:
1. TcpTransport tracks all active peer nonces
2. When a new connection completes handshake, peer's nonce is checked
3. If already connected, returns `TransportError::DuplicateConnection`
4. Call `remove_nonce()` when a connection closes to allow reconnection

## Integration with Wire Protocol

The transport layer builds on Milestone 2.1 (Wire Protocol):
- Uses `MessageEnvelope` for all messages
- Validates using `envelope.validate()` (V-MSG-01 through V-MSG-06)
- Serializes VERSION using existing `VersionPayload` type
- Leverages `ByteWriter`/`ByteReader` for serialization

## Testing

Integration tests are in `tests/transport_integration.rs`:

| Test | Criterion |
|------|-----------|
| `test_two_nodes_connect` | Two nodes can connect |
| `test_handshake_peer_info` | Handshake exchanges info correctly |
| `test_message_exchange` | Messages are sent/received |
| `test_multiple_clients` | Multiple connections work |
| `test_connection_direction` | Direction tracked correctly |
| `test_protocol_version_match` | Version validated |
| `test_empty_payload_message` | Empty payloads work |
| `test_large_payload_message` | Large payloads work |
| `test_nonce_tracking` | Nonce tracking works |

Run tests:
```bash
cargo test --test transport_integration
```

## Related Documentation

- [Wire Protocol](wire-protocol.md) - Message envelope format
- [Message Types](message-types.md) - All message type definitions
- [Connection Lifecycle](connection-lifecycle.md) - State machine details
