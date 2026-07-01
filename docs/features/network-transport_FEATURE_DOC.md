# Network & Transport - Feature Documentation

> **Section 6 of MASTER_FEATURES.md**
> **Owner Area**: `src/network/`, `src/transport/`
> **Wire Protocol Specification**: SPEC_06

---

## Overview

The Network & Transport layer implements the Swimchain wire protocol for peer-to-peer communication. It provides TCP transport with a 46-byte message envelope format, VERSION/VERACK handshake, and support for 55 message types across multiple protocol categories.

This layer handles all low-level network communication including:
- Wire protocol encoding/decoding with fork-aware message routing
- TCP connection management with state machine
- VERSION/VERACK handshake for peer authentication
- Gossip propagation with TTL-based loop prevention
- Network mode isolation (Mainnet/Testnet/Regtest)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                │
│  (NodeManager, SyncEngine, ContentRetrieval, DHT, EngagementPools)      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ Message enum
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Message Router                                    │
│  - Routes messages to appropriate subsystems                             │
│  - Handles gossip forwarding                                            │
│  - Manages subscriptions                                                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Network Layer (src/network/)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  builder.rs │  │ messages.rs  │  │   gossip.rs   │  │   mode.rs   │  │
│  │  Envelope   │  │  55 Message  │  │  Fanout: 8    │  │  Mainnet/   │  │
│  │  Builder    │  │  Types       │  │  TTL: 6       │  │  Testnet/   │  │
│  │             │  │              │  │  Seen Cache   │  │  Regtest    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  └─────────────┘  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ MessageEnvelope
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Transport Layer (src/transport/)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ listener.rs │  │connection.rs │  │  handshake.rs │  │  framing.rs │  │
│  │  TCP Bind   │  │ State Machine│  │  VERSION/     │  │  Read/Write │  │
│  │  Accept     │  │ Nonce Track  │  │  VERACK       │  │  Envelope   │  │
│  │  Connect    │  │              │  │              │  │  Checksum   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  └─────────────┘  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TCP/IP Stack                                     │
│                    (tokio async networking)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### MessageEnvelope

Wire protocol envelope for all messages (SPEC_06 §3.4).

```rust
pub struct MessageEnvelope {
    pub magic: [u8; 4],          // Network identification (SWIM/TEST/REGT)
    pub version: u8,             // Protocol version (currently 1)
    pub message_type: MessageType,
    pub fork_id: [u8; 32],       // Fork context (zeros = fork-agnostic)
    pub payload_length: u32,     // Payload size in bytes
    pub checksum: [u8; 4],       // First 4 bytes of SHA-256(payload)
    pub payload: Vec<u8>,        // Message payload
}
```

| Field | Type | Size | Description |
|-------|------|------|-------------|
| magic | [u8; 4] | 4 bytes | Network magic bytes (SWIM/TEST/REGT) |
| version | u8 | 1 byte | Protocol version (currently 1) |
| message_type | MessageType | 1 byte | Message type discriminant |
| fork_id | [u8; 32] | 32 bytes | Fork context for routing (zeros = fork-agnostic) |
| payload_length | u32 | 4 bytes | Payload size in bytes |
| checksum | [u8; 4] | 4 bytes | First 4 bytes of SHA-256(payload) |
| payload | Vec<u8> | N bytes | Message payload |

**Wire size**: 46-byte header + variable payload

### Message

High-level typed message wrapper for wire protocol.

```rust
pub enum Message {
    Version(VersionPayload),
    Verack,
    Ping(PingPongPayload),
    Pong(PingPongPayload),
    GetAddr(GetAddrPayload),
    Addr(AddrPayload),
    Inv(InvPayload),
    GetData(InvPayload),
    Data(DataPayload),
    NotFound(NotFoundPayload),
    GetBlocks(GetBlocksPayload),
    GetBlocksLocator(GetBlocksLocatorPayload),
    GetHeadersLocator(GetHeadersLocatorPayload),
    Blocks(BlocksPayload),
    GetHeaders(GetHeadersPayload),
    Headers(HeadersPayload),
    ChainStatus(ChainStatusPayload),
    Gossip(GossipPayload),
    ForkAnnounce(ForkAnnouncePayload),
    ForkQuery(ForkQueryPayload),
    ForkInfo(ForkInfoPayload),
    Reject(RejectPayload),
    Alert(AlertPayload),
    // ... and more (55 total)
}
```

### NetworkMode

Network configuration and isolation.

```rust
pub enum NetworkMode {
    Mainnet,  // Production network, full rules
    Testnet,  // Public test network, relaxed rules
    Regtest,  // Local regression testing, minimal rules
}
```

| Mode | Magic | P2P Port | RPC Port | PoW Multiplier | Min Peers | Address Prefix |
|------|-------|----------|----------|----------------|-----------|----------------|
| Mainnet | SWIM (0x5357494D) | 9735 | 9736 | 1.0 | 8 | sw1 |
| Testnet | TEST (0x54455354) | 19735 | 19736 | 0.1 | 4 | st1 |
| Regtest | REGT (0x52454754) | 29735 | 29736 | 0.001 | 0 | sr1 |

### ConnectionState

Connection state machine (SPEC_06 §5.3).

```rust
pub enum ConnectionState {
    Connected,        // TCP connected, no messages exchanged
    VersionSent,      // VERSION sent (outbound only)
    VersionReceived,  // VERSION received (inbound only)
    VerackSent,       // VERACK sent
    Established,      // Handshake complete
    Closed,           // Connection closed
}
```

### ConnectionDirection

Determines handshake sequence.

```rust
pub enum ConnectionDirection {
    Outbound,  // We initiated the connection
    Inbound,   // Peer initiated the connection
}
```

### VersionPayload

Handshake version exchange.

```rust
pub struct VersionPayload {
    pub protocol_version: u32,      // Currently 1
    pub node_services: u64,         // Capability bitmask
    pub timestamp: u64,             // Message creation time (UNIX seconds)
    pub sender_addr: CompactAddr,   // Our address info (26 bytes)
    pub receiver_addr: CompactAddr, // Peer's address (26 bytes)
    pub nonce: u64,                 // Random connection identifier
    pub user_agent: String,         // Node software (max 256 bytes)
    pub start_height: u32,          // Current block height
    pub relay: bool,                // Wants gossip messages
}
```

| Field | Type | Description |
|-------|------|-------------|
| protocol_version | u32 | Protocol version (currently 1) |
| node_services | u64 | Service capability bitmask |
| timestamp | u64 | Message creation timestamp (UNIX seconds) |
| sender_addr | CompactAddr | Our network address (26 bytes) |
| receiver_addr | CompactAddr | Peer's network address (26 bytes) |
| nonce | u64 | Random identifier for self/duplicate detection |
| user_agent | String | Node software identifier (max 256 bytes) |
| start_height | u32 | Current blockchain height |
| relay | bool | Whether peer wants gossip messages |

### CompactAddr

Compact address format for VERSION message (26 bytes).

```rust
pub struct CompactAddr {
    pub transport: u8,      // TransportType discriminant
    pub address: [u8; 16],  // IPv6 or IPv4-mapped IPv6
    pub port: u16,          // Port number
    pub services: u32,      // Capability bitmask
}
```

### WireAddr

Full address format for ADDR message (75 bytes).

```rust
pub struct WireAddr {
    pub transport: u8,       // TransportType discriminant
    pub address: [u8; 64],   // Zero-padded address
    pub port: u16,           // Port number
    pub services: u32,       // Capability bitmask
    pub last_seen: u32,      // UNIX timestamp
}
```

### PeerInfo

Peer information extracted from VERSION.

```rust
pub struct PeerInfo {
    pub node_id: [u8; 32],       // SHA-256(nonce:user_agent)
    pub protocol_version: u32,
    pub services: u64,
    pub user_agent: String,
    pub start_height: u32,
    pub relay: bool,
    pub nonce: u64,
    pub remote_addr: SocketAddr,
    pub timestamp: u64,
}
```

### Connection

TCP connection wrapper with state machine.

```rust
pub struct Connection {
    stream: TcpStream,
    state: ConnectionState,
    direction: ConnectionDirection,
    our_nonce: u64,
    peer_nonce: Option<u64>,
    peer_info: Option<PeerInfo>,
    remote_addr: SocketAddr,
    created_at: Instant,
    version_sent_at: Option<Instant>,
}
```

---

## Core APIs

### Message Construction

#### Message::to_envelope()

**Signature**: `pub fn to_envelope(&self, fork_id: [u8; 32]) -> MessageEnvelope`

**Purpose**: Convert typed message to wire envelope with fork ID.

**Parameters**:
- `fork_id`: 32-byte fork identifier (zeros for fork-agnostic messages)

**Returns**: Wire-ready `MessageEnvelope`

**Example**:
```rust
let msg = Message::Ping(PingPongPayload { nonce: 12345 });
let envelope = msg.to_envelope([0u8; 32]); // Fork-agnostic
```

#### Message::to_envelope_agnostic()

**Signature**: `pub fn to_envelope_agnostic(&self) -> MessageEnvelope`

**Purpose**: Convert to envelope with zero fork_id (fork-agnostic).

**Returns**: Wire-ready `MessageEnvelope` with zeros for fork_id

#### Message::from_envelope()

**Signature**: `pub fn from_envelope(envelope: &MessageEnvelope) -> Result<Self, WireError>`

**Purpose**: Parse message from wire envelope.

**Parameters**:
- `envelope`: Wire envelope to parse

**Returns**: Typed `Message` or `WireError`

---

### Message Framing

#### read_envelope()

**Signature**: `pub async fn read_envelope(stream: &mut TcpStream) -> Result<Option<MessageEnvelope>, TransportError>`

**Purpose**: Read complete envelope from TCP stream.

**Parameters**:
- `stream`: TCP stream to read from

**Returns**:
- `Ok(Some(envelope))`: Successfully read envelope
- `Ok(None)`: Connection closed gracefully
- `Err(TransportError)`: Read error or validation failure

**Side effects**: Validates magic bytes and checksum

#### write_envelope()

**Signature**: `pub async fn write_envelope(stream: &mut TcpStream, envelope: &MessageEnvelope) -> Result<(), TransportError>`

**Purpose**: Write envelope to TCP stream.

**Parameters**:
- `stream`: TCP stream to write to
- `envelope`: Envelope to send

**Returns**: `Ok(())` on success

**Side effects**: Flushes stream after write

---

### Handshake Protocol

#### perform_outbound_handshake()

**Signature**:
```rust
pub async fn perform_outbound_handshake(
    conn: &mut Connection,
    local_info: &LocalNodeInfo,
    local_addr: SocketAddr,
) -> Result<PeerInfo, TransportError>
```

**Purpose**: Complete outbound handshake sequence.

**Sequence**:
1. Send VERSION
2. Wait for peer VERSION (10s timeout)
3. Validate peer VERSION (check nonce for self-connection)
4. Send VERACK
5. Wait for peer VERACK

**State transitions**: `Connected → VersionSent → VerackSent → Established`

**Example**:
```rust
let conn = tcp_transport.connect(peer_addr).await?;
let peer_info = perform_outbound_handshake(&mut conn, &local_info, local_addr).await?;
println!("Connected to peer: {}", peer_info.user_agent);
```

#### perform_inbound_handshake()

**Signature**:
```rust
pub async fn perform_inbound_handshake(
    conn: &mut Connection,
    local_info: &LocalNodeInfo,
    local_addr: SocketAddr,
) -> Result<PeerInfo, TransportError>
```

**Purpose**: Complete inbound handshake sequence.

**Sequence**:
1. Wait for peer VERSION (10s timeout)
2. Validate peer VERSION
3. Send VERSION + VERACK
4. Wait for peer VERACK

**State transitions**: `Connected → VersionReceived → VerackSent → Established`

---

### TCP Transport

#### TcpTransport::bind()

**Signature**: `pub async fn bind(addr: SocketAddr, local_info: LocalNodeInfo) -> Result<Self, TransportError>`

**Purpose**: Create transport bound to address.

**Parameters**:
- `addr`: Socket address to bind to
- `local_info`: Local node configuration

**Returns**: Bound `TcpTransport`

**Side effects**: Opens TCP listener socket

#### TcpTransport::accept()

**Signature**: `pub async fn accept(&self) -> Result<Connection, TransportError>`

**Purpose**: Accept incoming connection with handshake.

**Returns**: Established `Connection` with peer info

**Side effects**:
- Completes inbound handshake
- Tracks peer nonce for duplicate detection

#### TcpTransport::connect()

**Signature**: `pub async fn connect(&self, addr: SocketAddr) -> Result<Connection, TransportError>`

**Purpose**: Connect to peer with handshake.

**Parameters**:
- `addr`: Peer socket address

**Returns**: Established `Connection` with peer info

**Side effects**:
- Completes outbound handshake
- Tracks peer nonce for duplicate detection

---

### Network Context

#### NetworkContext::set_mode()

**Signature**: `pub fn set_mode(mode: NetworkMode)`

**Purpose**: Set global network mode (once at startup).

**Side effects**: Atomic store to global static

#### NetworkContext::mode()

**Signature**: `pub fn mode() -> NetworkMode`

**Purpose**: Get current network mode.

**Returns**: Current `NetworkMode`

#### NetworkContext::magic_bytes()

**Signature**: `pub fn magic_bytes() -> [u8; 4]`

**Purpose**: Get magic bytes for current network.

**Returns**:
- Mainnet: `[0x53, 0x57, 0x49, 0x4D]` ("SWIM")
- Testnet: `[0x54, 0x45, 0x53, 0x54]` ("TEST")
- Regtest: `[0x52, 0x45, 0x47, 0x54]` ("REGT")

---

## Message Types (55 Total)

### Handshake (0x00-0x03)

| Code | Type | Description |
|------|------|-------------|
| 0x00 | VERSION | Protocol version exchange |
| 0x01 | VERACK | Version acknowledgment |
| 0x02 | PING | Latency measurement |
| 0x03 | PONG | Ping response |

### Address Discovery (0x10-0x11)

| Code | Type | Description |
|------|------|-------------|
| 0x10 | GETADDR | Request peer addresses |
| 0x11 | ADDR | Address list response |

### Inventory (0x20-0x28)

| Code | Type | Description |
|------|------|-------------|
| 0x20 | INV | Inventory announcement |
| 0x21 | GETDATA | Request specific items |
| 0x22 | DATA | Data response |
| 0x23 | NOTFOUND | Item not available |
| 0x24 | WHO_HAS | Content availability query |
| 0x25 | I_HAVE | Content availability response |
| 0x26 | GET | Request content |
| 0x27 | DATA_CONTENT | Content data response |
| 0x28 | NOTFOUND_CONTENT | Content not found |

### Social Layer (0x30-0x35)

| Code | Type | Description |
|------|------|-------------|
| 0x30 | CONTRIBUTION_CLAIM | Announce contribution |
| 0x31 | CONTRIBUTION_ATTEST | Attest peer contribution |
| 0x32 | LEVEL_QUERY | Query swimmer level |
| 0x33 | LEVEL_RESPONSE | Level response |
| 0x34 | SPACE_HEALTH_QUERY | Query space health |
| 0x35 | SPACE_HEALTH_RESPONSE | Health response |

### Gossip (0x40)

| Code | Type | Description |
|------|------|-------------|
| 0x40 | GOSSIP | Message propagation with TTL |

### Fork Handling (0x53-0x55)

| Code | Type | Description |
|------|------|-------------|
| 0x53 | FORK_ANNOUNCE | Fork announcement |
| 0x54 | FORK_QUERY | Fork query |
| 0x55 | FORK_INFO | Fork info response |

### Error/Control (0x60-0x61)

| Code | Type | Description |
|------|------|-------------|
| 0x60 | REJECT | Message rejection |
| 0x61 | ALERT | Network alert |

### Chain Sync (0x70-0x7F)

| Code | Type | Description |
|------|------|-------------|
| 0x70 | GETBLOCKS | Request blocks by hash |
| 0x71 | BLOCKS | Blocks response |
| 0x72 | GETHEADERS | Request headers |
| 0x73 | HEADERS | Headers response |
| 0x74 | CHAINSTATUS | Chain status announcement |
| 0x75 | BLOCK_ANNOUNCE | New block announcement |
| 0x76 | GET_BLOCK | Request specific block |
| 0x77 | BLOCK_DATA | Block data response |
| 0x78 | GETBLOCKS_LOCATOR | Bitcoin-style locator sync |
| 0x7A | GETHEADERS_LOCATOR | Headers-first sync |

### DHT (0x80-0x87)

| Code | Type | Description |
|------|------|-------------|
| 0x80 | DHT_PING | DHT liveness check |
| 0x81 | DHT_PONG | DHT ping response |
| 0x82 | DHT_FIND_NODE | Find k-closest nodes |
| 0x83 | DHT_NODES | Nodes response |
| 0x84 | DHT_FIND_VALUE | Find content providers |
| 0x85 | DHT_PROVIDERS | Providers response |
| 0x86 | DHT_STORE | Announce availability |
| 0x87 | DHT_STORE_ACK | Store acknowledgment |

### Engagement Pools (0x90-0x92)

| Code | Type | Description |
|------|------|-------------|
| 0x90 | POOL_ANNOUNCE | New pool announcement |
| 0x91 | POOL_CONTRIBUTION | PoW contribution |
| 0x92 | POOL_STATUS | Pool status query/response |

### Mempool (0x93-0x94)

| Code | Type | Description |
|------|------|-------------|
| 0x93 | ACTION_ANNOUNCE | Broadcast pending action |
| 0x94 | GET_MEMPOOL | Request mempool inventory |

### Branch Sync (0xA0-0xA4)

| Code | Type | Description |
|------|------|-------------|
| 0xA0 | GET_BLOCKS_BRANCH | Request branch blocks |
| 0xA1 | SUBSCRIBE_BRANCH | Subscribe to branch |
| 0xA2 | UNSUBSCRIBE_BRANCH | Unsubscribe from branch |
| 0xA3 | BRANCH_ANNOUNCE | New branch content |
| 0xA4 | BRANCH_INVENTORY | Branches served |

---

## Behaviors

### Connection State Machine

**Trigger**: TCP connection established

**Process (Outbound)**:
```
┌───────────┐  send VERSION   ┌─────────────┐  recv VERSION  ┌────────────┐
│ Connected │ ───────────────►│ VersionSent │ ──────────────►│ VerackSent │
└───────────┘                 └─────────────┘  send VERACK   └────────────┘
                                                                    │
                              ┌─────────────┐  recv VERACK          │
                              │ Established │◄──────────────────────┘
                              └─────────────┘
```

**Process (Inbound)**:
```
┌───────────┐  recv VERSION   ┌────────────────┐  send VERSION  ┌────────────┐
│ Connected │ ───────────────►│ VersionReceived│ ──────────────►│ VerackSent │
└───────────┘                 └────────────────┘  send VERACK   └────────────┘
                                                                      │
                              ┌─────────────┐  recv VERACK            │
                              │ Established │◄────────────────────────┘
                              └─────────────┘
```

**Any state can transition to `Closed`** on error or disconnect.

### Self-Connection Detection

**Trigger**: VERSION received during handshake

**Process**:
1. Compare peer's nonce with our own nonce
2. If nonces match, we connected to ourselves

**Outcome**: Reject with `TransportError::SelfConnection`

### Duplicate Connection Detection

**Trigger**: Handshake complete

**Process**:
1. Check if peer nonce exists in `active_nonces` set
2. If duplicate, reject the newer connection

**Outcome**: Reject with `TransportError::DuplicateConnection`

### Message Validation (V-MSG-01 through V-MSG-06)

**Trigger**: Message envelope received

**Process**:
| Rule | Description | Error |
|------|-------------|-------|
| V-MSG-01 | Magic bytes must match current network | `WireError::InvalidMagic` |
| V-MSG-02 | Protocol version must be supported (currently only 1) | `WireError::UnsupportedVersion` |
| V-MSG-03 | Checksum must match SHA-256(payload)[0..4] | `WireError::InvalidChecksum` |
| V-MSG-04 | Payload length must match actual payload | `WireError::PayloadLengthMismatch` |
| V-MSG-05 | Message type must be known | `WireError::UnknownMessageType` |
| V-MSG-06 | Fork ID validation (zeros allowed for fork-agnostic) | `WireError::UnknownForkId` |

### Gossip TTL Decrement

**Trigger**: Gossip message received for forwarding

**Process**:
1. Decrement TTL by 1
2. Check message hash against seen cache

**Outcome**:
- If TTL > 0 and not seen: Forward to FANOUT peers
- If TTL = 0 or already seen: Drop message

---

## Configuration

### Network Mode Configuration

| Option | Mainnet | Testnet | Regtest | Description |
|--------|---------|---------|---------|-------------|
| Magic bytes | SWIM | TEST | REGT | Network identification |
| P2P port | 9735 | 19735 | 29735 | Peer-to-peer communication |
| RPC port | 9736 | 19736 | 29736 | JSON-RPC interface |
| PoW multiplier | 1.0 | 0.1 | 0.001 | Difficulty scaling |
| Min peers | 8 | 4 | 0 | Minimum peer requirement |
| Address prefix | sw1 | st1 | sr1 | Bech32 address prefix |

### Network Mode Permissions

| Permission | Mainnet | Testnet | Regtest |
|------------|---------|---------|---------|
| Skip level checks | No | No | Yes |
| Self-sponsorship | No | No | Yes |
| Dev mode | No | Yes | Yes |

### Protocol Constants

| Name | Value | Purpose |
|------|-------|---------|
| `PROTOCOL_VERSION` | 1 | Current protocol version |
| `MESSAGE_HEADER_SIZE` | 46 bytes | Envelope header size |
| `MAX_PAYLOAD_SIZE` | 4 MB | Maximum message payload |

### Peer Management Constants

| Name | Value | Purpose |
|------|-------|---------|
| `MIN_PEERS` | 8 | Minimum peers to maintain |
| `TARGET_PEERS` | 25 | Target peer count |
| `MAX_PEERS` | 100 | Maximum peer connections |
| `MAX_INBOUND_CONNECTIONS` | 400 | Max inbound connections |
| `MAX_OUTBOUND_CONNECTIONS` | 100 | Max outbound connections |

### Timeout Constants

| Name | Value | Purpose |
|------|-------|---------|
| `VERSION_TIMEOUT_SECS` | 10s | VERSION message timeout |
| `HANDSHAKE_TIMEOUT_SECS` | 30s | Total handshake timeout |
| `PING_INTERVAL_SECS` | 120s | Keepalive interval |
| `PONG_TIMEOUT_SECS` | 60s | PONG response timeout |

### Gossip Constants

| Name | Value | Purpose |
|------|-------|---------|
| `GOSSIP_FANOUT` | 8 | Peers to forward to |
| `GOSSIP_TTL` | 6 | Maximum hops |
| `SEEN_CACHE_SIZE` | 10,000 | Deduplication cache |
| `SEEN_CACHE_EXPIRY_SECS` | 120s | Cache entry TTL |

### Wire Size Constants

| Name | Value | Purpose |
|------|-------|---------|
| `COMPACT_ADDRESS_SIZE` | 26 bytes | VERSION address format |
| `WIRE_ADDRESS_SIZE` | 75 bytes | ADDR address format |
| `MAX_USER_AGENT_LEN` | 256 bytes | User agent limit |
| `MAX_ADDRS_PER_MESSAGE` | 1000 | ADDR message limit |

---

## RPC Methods

### get_info

Get node information including network status.

**Request**:
```json
{"jsonrpc": "2.0", "method": "get_info", "params": {}, "id": 1}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "version": "0.1.0",
    "network": "testnet",
    "uptime_seconds": 3600,
    "peer_count": 10,
    "block_height": 50000,
    "node_id": "a1b2c3d4...",
    "rpc_port": 19736,
    "p2p_port": 19735
  },
  "id": 1
}
```

### get_peers

List all connected peers.

**Request**:
```json
{"jsonrpc": "2.0", "method": "get_peers", "params": {}, "id": 1}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "peer_id": "a1b2c3d4e5f6...",
      "address": "192.168.1.100:19735",
      "direction": "Outbound",
      "connected_seconds": 1234,
      "user_agent": ""
    }
  ],
  "id": 1
}
```

### get_sync_status

Get synchronization status.

**Request**:
```json
{"jsonrpc": "2.0", "method": "get_sync_status", "params": {}, "id": 1}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "state": "synced",
    "chain_percent": 100,
    "storage_mb": 250,
    "peer_count": 10
  },
  "id": 1
}
```

### add_peer

Connect to a new peer.

**Request**:
```json
{"jsonrpc": "2.0", "method": "add_peer", "params": {"address": "192.168.1.100:19735"}, "id": 1}
```

**Response**:
```json
{"jsonrpc": "2.0", "result": {"success": true}, "id": 1}
```

### remove_peer

Disconnect from a peer.

**Request**:
```json
{"jsonrpc": "2.0", "method": "remove_peer", "params": {"peer_id": "a1b2c3d4..."}, "id": 1}
```

**Response**:
```json
{"jsonrpc": "2.0", "result": {"success": true}, "id": 1}
```

---

## CLI Commands

### cs node start

Start the node in foreground mode.

```bash
cs node start [OPTIONS]

Options:
  -l, --listen <ADDR>    Listen address (default: 0.0.0.0:9735)
  -c, --connect <ADDR>   Connect to peer(s) after starting (can specify multiple)
      --background       Run in background (not yet implemented)

Examples:
  cs node start
  cs node start --listen 127.0.0.1:9735
  cs node start --connect 192.168.1.100:9735
  cs node start --connect 192.168.1.100:9735 --connect 192.168.1.101:9735
```

### cs node stop

Stop a running node.

```bash
cs node stop

Note: Currently nodes run in foreground only. Use Ctrl+C to stop.
      Background daemon mode with IPC is planned for future release.
```

### cs node status

Show node status.

```bash
cs node status [--json]

Options:
  --json    Output in JSON format

Output includes:
  - State (running/stopped)
  - Uptime
  - Peer count
  - Chain height
  - Sync percentage
  - Storage usage
  - Swimmer level
```

### cs node peers

List connected peers.

```bash
cs node peers [--json]

Options:
  --json    Output in JSON format

Output includes:
  - Node ID (first 8 bytes as hex)
  - Address
  - Chain height
  - Direction (inbound/outbound)
```

### cs node connect

Connect to a specific peer.

```bash
cs node connect <ADDR>

Arguments:
  <ADDR>    Peer address (host:port)

Example:
  cs node connect 192.168.1.100:9735
```

### cs node disconnect

Disconnect from a peer.

```bash
cs node disconnect <PEER_ID>

Arguments:
  <PEER_ID>    Peer ID (hex string, at least 8 characters)

Example:
  cs node disconnect a1b2c3d4e5f6a7b8
```

### cs node sync

Show sync status.

```bash
cs node sync [--json]

Options:
  --json    Output in JSON format

Output includes:
  - Sync state
  - Headers synced
  - Blocks synced
  - Best known height
```

---

## Error Handling

### WireError

| Variant | Description | Resolution |
|---------|-------------|------------|
| `InvalidMagic([u8; 4])` | Magic bytes don't match network (V-MSG-01) | Ensure peer is on same network |
| `UnsupportedVersion(u8)` | Unknown protocol version (V-MSG-02) | Upgrade node software |
| `InvalidChecksum` | Checksum mismatch (V-MSG-03) | Network corruption, retry |
| `PayloadLengthMismatch` | Payload size doesn't match header (V-MSG-04) | Network corruption, retry |
| `UnknownMessageType(u8)` | Unknown message type (V-MSG-05) | Upgrade node software |
| `UnknownForkId([u8; 32])` | Unknown fork ID (V-MSG-06) | Sync fork information |
| `InvalidPayload(String)` | Malformed payload structure | Check message encoding |
| `BufferTooShort` | Not enough bytes to read | Wait for more data |
| `LimitExceeded` | Count exceeds maximum | Peer may be misbehaving |
| `InvalidEnumValue` | Invalid enum discriminant | Protocol error |

### TransportError

| Variant | Description | Resolution |
|---------|-------------|------------|
| `Io(io::Error)` | I/O error | Check network connectivity |
| `VersionTimeout(u64)` | VERSION not received in time | Peer may be unresponsive |
| `HandshakeTimeout(u64)` | Handshake not completed in time | Peer may be unresponsive |
| `ConnectionClosed` | Peer closed connection | Normal disconnect or error |
| `VersionMismatch` | Protocol version incompatible | Upgrade node software |
| `DuplicateConnection` | Same nonce already connected | Normal, connection deduplicated |
| `SelfConnection` | Connected to ourselves | Normal, self-connection prevented |
| `Wire(WireError)` | Wire protocol error | See WireError table |
| `InvalidStateTransition` | Invalid state machine transition | Internal error, report bug |
| `MessageTooLarge` | Message exceeds MAX_PAYLOAD_SIZE | Reduce message size |
| `UnexpectedMessage(String)` | Wrong message type received | Protocol error |
| `PongTimeout` | PONG not received in time | Peer may be unresponsive |

---

## Testing

### Running Unit Tests

```bash
# Run all network/transport tests
cargo test --lib network
cargo test --lib transport

# Run specific test modules
cargo test network::mode::tests
cargo test network::builder::tests
cargo test transport::handshake::tests
cargo test transport::framing::tests
cargo test transport::connection::tests
cargo test transport::listener::tests
```

### Test Coverage

**Network Module Tests (`src/network/`)**:
- `mode.rs`: Network mode ports, magic bytes, permissions, parsing
- `builder.rs`: Message type roundtrips, envelope validation
- `error.rs`: Error display, helper methods
- `messages.rs`: Payload construction and serialization

**Transport Module Tests (`src/transport/`)**:
- `handshake.rs`: Full handshake protocol, address conversion
- `framing.rs`: Envelope roundtrip, empty payload, connection close, invalid magic
- `connection.rs`: State transitions, peer info
- `listener.rs`: Bind, connect/accept, nonce tracking, multiple connections
- `state.rs`: Outbound/inbound transitions, invalid transitions, close from any state

### Integration Testing

```bash
# Start a local testnet node
cs --network testnet node start --listen 127.0.0.1:19735

# In another terminal, start a second node and connect
cs --network testnet node start --listen 127.0.0.1:19745 --connect 127.0.0.1:19735

# Verify connection via RPC
curl -X POST http://localhost:19736 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"get_peers","params":{},"id":1}'
```

---

## Known Limitations

1. **TCP Only**: Currently only TCP transport is implemented. Tor, I2P, and QUIC transports are planned but not yet available.

2. **Foreground Mode**: Node currently runs in foreground only. Background daemon mode with IPC is planned for future release.

3. **No NAT Traversal**: Direct connections only. STUN/TURN or UPnP for NAT traversal not yet implemented.

4. **Fixed Gossip Parameters**: FANOUT and TTL are compile-time constants, not configurable at runtime.

5. **No Connection Encryption**: Messages are not encrypted in transit (relies on future Tor/I2P support for privacy).

---

## Future Work

1. **Alternative Transports**: Implement Tor, I2P, and QUIC transports (TransportType enums already defined).

2. **Background Daemon Mode**: IPC for querying/controlling node from CLI (see SPEC_10 §14.2).

3. **NAT Traversal**: STUN/TURN support for nodes behind NAT.

4. **Connection Encryption**: TLS or Noise Protocol for transport encryption.

5. **Bandwidth Management**: Rate limiting and bandwidth quotas per peer.

6. **IPv6 Full Support**: Full IPv6 address handling and preference configuration.

---

## Related Features

- [Synchronization](./sync_FEATURE_DOC.md) - Uses network layer for block/header sync
- [DHT & Peer Discovery](./dht_FEATURE_DOC.md) - DHT messages (0x80-0x87) for peer discovery
- [Content & Decay Engine](./content-decay_FEATURE_DOC.md) - Content propagation via gossip
- [Block Formation & Consensus](./block-formation_FEATURE_DOC.md) - Block propagation via network
- [Sponsorship & Sybil Resistance](./sponsorship_FEATURE_DOC.md) - Attestation message handling

---

## Document Discrepancies (vs MASTER_FEATURES.md)

The following differences exist between this documentation and Section 6 of MASTER_FEATURES.md:

| Item | MASTER_FEATURES.md | Actual Implementation |
|------|-------------------|----------------------|
| Message types | 22 | 55 |
| Envelope format | `[type:1][flags:1]` | `[version:1][type:1][fork_id:32]` |
| Magic bytes | Not specified | SWIM/TEST/REGT per network |
| Message codes | 0x00-0x34 range | Organized by category (0x00-0xA4) |
| DHT codes | 0x30-0x34 | 0x80-0x87 |
| Pool codes | 0x20-0x22 | 0x90-0x92 |
| File locations | `network/serialize.rs`, `network/handshake.rs` | `transport/framing.rs`, `transport/handshake.rs` |

**Recommendation**: Update MASTER_FEATURES.md Section 6 to align with actual implementation.

---

## Quality Checklist

- [x] Handshake validates peer version (V-MSG-02)
- [x] Message checksums verified (V-MSG-03)
- [x] Gossip doesn't create loops (TTL + seen cache)
- [x] Connection limits enforced (MAX_PEERS = 100)
- [x] Timeout handling correct (VERSION: 10s, Handshake: 30s)
- [x] Self-connection detection via nonce
- [x] Duplicate connection detection via nonce tracking
- [x] State machine prevents invalid transitions
- [x] Network isolation via magic bytes
- [x] Fork context in message envelope

---

*Generated from codebase analysis. Last updated: 2026-01-11*
