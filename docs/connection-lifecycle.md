# Connection Lifecycle (SPEC_06 §5.3)

This document describes the connection state machine and handshake protocol for Swimchain peer-to-peer connections.

## State Machine

Connections follow a 6-state lifecycle with distinct paths for inbound and outbound connections.

### States

| State | Description |
|-------|-------------|
| `Connected` | TCP connection established, no messages exchanged |
| `VersionSent` | VERSION message sent (outbound connections only) |
| `VersionReceived` | VERSION message received (inbound connections only) |
| `VerackSent` | Both VERSION messages exchanged, VERACK sent |
| `Established` | Handshake complete, ready for application messages |
| `Closed` | Connection closed or failed |

### State Diagram

```
                  OUTBOUND                              INBOUND
                  ========                              =======

              +-----------+                         +-----------+
              | Connected |                         | Connected |
              +-----------+                         +-----------+
                    |                                     |
             send VERSION                          recv VERSION
                    |                                     |
                    v                                     v
              +-------------+                     +----------------+
              | VersionSent |                     | VersionReceived|
              +-------------+                     +----------------+
                    |                                     |
             recv VERSION                     send VERSION + VERACK
             send VERACK                                  |
                    |                                     v
                    v                              +------------+
              +------------+                       | VerackSent |
              | VerackSent |                       +------------+
              +------------+                              |
                    |                              recv VERACK
             recv VERACK                                  |
                    |                                     v
                    v                              +-------------+
              +-------------+                      | Established |
              | Established |                      +-------------+
              +-------------+

        Any state can transition to Closed
```

### Valid Transitions

#### Outbound Connections

| From | To | Trigger |
|------|-----|---------|
| Connected | VersionSent | We send VERSION |
| VersionSent | VerackSent | We receive VERSION, send VERACK |
| VerackSent | Established | We receive VERACK |
| Any | Closed | Connection closed or error |

#### Inbound Connections

| From | To | Trigger |
|------|-----|---------|
| Connected | VersionReceived | We receive VERSION |
| VersionReceived | VerackSent | We send VERSION + VERACK |
| VerackSent | Established | We receive VERACK |
| Any | Closed | Connection closed or error |

## Handshake Protocol

### Outbound Handshake

When we initiate a connection:

```
    Client                              Server
      |                                   |
      |  -------- VERSION -------->>     |
      |                                   |
      |  <<------- VERSION ---------     |
      |                                   |
      |  -------- VERACK --------->>     |
      |                                   |
      |  <<------- VERACK ----------     |
      |                                   |
    [Established]                    [Established]
```

Sequence:
1. **Send VERSION** - Include our protocol version, services, nonce, user agent
2. **Receive VERSION** - Get peer's info, validate compatibility
3. **Send VERACK** - Acknowledge peer's VERSION
4. **Receive VERACK** - Peer acknowledges our VERSION
5. **Established** - Connection ready for application messages

### Inbound Handshake

When we accept a connection:

```
    Server                              Client
      |                                   |
      |  <<------- VERSION ---------     |
      |                                   |
      |  -------- VERSION -------->>     |
      |  -------- VERACK --------->>     |
      |                                   |
      |  <<------- VERACK ----------     |
      |                                   |
    [Established]                    [Established]
```

Sequence:
1. **Receive VERSION** - Get peer's info, validate compatibility
2. **Send VERSION + VERACK** - Send both together (optimization)
3. **Receive VERACK** - Peer acknowledges our VERSION
4. **Established** - Connection ready for application messages

## Timeouts

| Timeout | Duration | Description |
|---------|----------|-------------|
| VERSION_TIMEOUT | 10 seconds | Maximum time to receive VERSION after connecting |
| HANDSHAKE_TIMEOUT | 30 seconds | Maximum time for complete handshake |

If VERSION is not received within 10 seconds, the connection fails with `TransportError::VersionTimeout`.

If the full handshake doesn't complete within 30 seconds, the connection fails with `TransportError::HandshakeTimeout`.

## VERSION Message

The VERSION message contains:

| Field | Type | Description |
|-------|------|-------------|
| protocol_version | u32 | Protocol version (currently 1) |
| node_services | u64 | Capability bitmask |
| timestamp | u64 | Message timestamp (UNIX seconds) |
| sender_addr | CompactAddr | Our network address (26 bytes) |
| receiver_addr | CompactAddr | Peer's address as we see it |
| nonce | u64 | Random value for self-connection detection |
| user_agent | String | Node software identifier |
| start_height | u32 | Our current block height |
| relay | bool | Whether we want gossip messages |

## Validation

During handshake, the following validations are performed:

### Self-Connection Detection

1. Each connection generates a random 64-bit nonce
2. Nonces are exchanged in VERSION messages
3. If `peer_nonce == our_nonce`, connection is rejected
4. Error: `TransportError::SelfConnection`

### Version Compatibility

1. Both nodes must support a compatible protocol version
2. Currently only version 1 is supported
3. If incompatible: `TransportError::VersionMismatch { peer, ours }`

### Duplicate Detection

1. TcpTransport tracks all active peer nonces
2. When handshake completes, peer's nonce is checked
3. If already connected: `TransportError::DuplicateConnection`

## Error Handling

| Error | When | Recovery |
|-------|------|----------|
| `VersionTimeout` | No VERSION within 10s | Close connection |
| `HandshakeTimeout` | Handshake incomplete after 30s | Close connection |
| `SelfConnection` | Nonce match | Close connection, don't retry |
| `VersionMismatch` | Incompatible versions | Close connection |
| `DuplicateConnection` | Already connected to peer | Close new connection |
| `UnexpectedMessage` | Wrong message type received | Close connection |
| `ConnectionClosed` | Peer closed during handshake | Close connection |

## Keepalive

After handshake, connections are kept alive using PING/PONG:

| Constant | Value | Description |
|----------|-------|-------------|
| PING_INTERVAL | 120 seconds | Time between PING messages |
| PONG_TIMEOUT | 60 seconds | Maximum time to receive PONG |

Sequence:
1. Every 120 seconds, send PING with random nonce
2. Peer responds with PONG using same nonce
3. If no PONG within 60 seconds, disconnect

## Implementation

### Using TcpTransport

```rust
use swimchain::transport::{TcpTransport, LocalNodeInfo};

let local_info = LocalNodeInfo::default();
let transport = TcpTransport::bind("0.0.0.0:9735".parse()?, local_info).await?;

// Accept connection (handshake automatic)
let conn = transport.accept().await?;
assert!(conn.is_established());
assert!(conn.peer_info().is_some());

// Connect to peer (handshake automatic)
let conn = transport.connect("192.168.1.100:9735".parse()?).await?;
assert!(conn.is_established());
```

### Manual State Inspection

```rust
// Check connection state
match conn.state() {
    ConnectionState::Established => println!("Ready!"),
    ConnectionState::Closed => println!("Disconnected"),
    _ => println!("Handshake in progress"),
}

// Check direction
match conn.direction() {
    ConnectionDirection::Outbound => println!("We initiated"),
    ConnectionDirection::Inbound => println!("Peer initiated"),
}

// Get peer information
if let Some(peer) = conn.peer_info() {
    println!("Connected to: {}", peer.user_agent);
    println!("Peer height: {}", peer.start_height);
    println!("Peer nonce: {}", peer.nonce);
}
```

### Connection Cleanup

When a connection closes, remove the nonce to allow reconnection:

```rust
// When connection is dropped
if let Some(peer) = conn.peer_info() {
    transport.remove_nonce(peer.nonce).await;
}
```

## Spec Compliance

| Requirement | Implementation |
|-------------|----------------|
| VERSION within 10s (SPEC_06 §5.3) | `VERSION_TIMEOUT_SECS = 10` |
| Full handshake within 30s (V-PEER-02) | `HANDSHAKE_TIMEOUT_SECS = 30` |
| PONG within 60s (V-PEER-03) | `PONG_TIMEOUT_SECS = 60` |
| Nonce-based self-connection detection | `validate_version()` check |
| Nonce-based duplicate detection | `active_nonces` HashSet |
| 46-byte header (SPEC_06 §3.4) | `MESSAGE_HEADER_SIZE = 46` |

## Related Documentation

- [Transport Layer](transport-layer.md) - API reference
- [Wire Protocol](wire-protocol.md) - Message envelope format
- [Message Types](message-types.md) - VERSION, VERACK, PING, PONG
