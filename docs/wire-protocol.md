# Wire Protocol (SPEC_06 §5)

This document describes the Swimchain wire protocol for peer-to-peer communication.

## Overview

The wire protocol defines how nodes communicate over the network. All messages are
binary-encoded using little-endian byte order for integers.

## Message Envelope

Every message is wrapped in a `MessageEnvelope` with a 46-byte header:

| Field | Size | Description |
|-------|------|-------------|
| magic | 4 bytes | Magic bytes "CSOC" (0x43, 0x53, 0x4F, 0x43) |
| version | 1 byte | Protocol version (currently 1) |
| message_type | 1 byte | Message type discriminant |
| fork_id | 32 bytes | Fork context (zeros for fork-agnostic) |
| payload_length | 4 bytes | Length of payload in bytes (little-endian) |
| checksum | 4 bytes | First 4 bytes of SHA-256(payload) |
| payload | variable | Message-specific payload |

### Fork ID

The `fork_id` field allows messages to be associated with a specific fork context:
- All zeros (`[0u8; 32]`): Fork-agnostic message (applies to any fork)
- Non-zero: Message is specific to the identified fork

## Validation Rules

Per SPEC_06 §6.1, messages MUST be validated:

| Rule | Description |
|------|-------------|
| V-MSG-01 | Magic bytes MUST equal "CSOC" |
| V-MSG-02 | Version MUST be supported (currently only 1) |
| V-MSG-03 | Checksum MUST match SHA-256(payload)[0..4] |
| V-MSG-04 | Payload length MUST match actual payload |
| V-MSG-05 | Message type MUST be known |
| V-MSG-06 | Fork ID MUST be known or zeros |

## Message Types

Messages are grouped by function:

### Handshake (0x00-0x0F)

| Type | Value | Description |
|------|-------|-------------|
| VERSION | 0x00 | Initial handshake |
| VERACK | 0x01 | Version acknowledgment |
| PING | 0x02 | Latency measurement |
| PONG | 0x03 | Ping response |

### Address Discovery (0x10-0x1F)

| Type | Value | Description |
|------|-------|-------------|
| GETADDR | 0x10 | Request peer addresses |
| ADDR | 0x11 | Address list response |

### Inventory (0x20-0x2F)

| Type | Value | Description |
|------|-------|-------------|
| INV | 0x20 | Inventory announcement |
| GETDATA | 0x21 | Request data by hash |
| DATA | 0x22 | Data response |
| NOTFOUND | 0x23 | Requested data not found |

### Chain Sync (0x30-0x3F)

| Type | Value | Description |
|------|-------|-------------|
| GETBLOCKS | 0x30 | Request blocks by height |
| BLOCKS | 0x31 | Blocks response |
| GETHEADERS | 0x32 | Request headers only |
| HEADERS | 0x33 | Headers response |
| CHAINSTATUS | 0x34 | Periodic chain status |

### Gossip (0x40-0x4F)

| Type | Value | Description |
|------|-------|-------------|
| GOSSIP | 0x40 | Gossip message propagation |

### Fork Handling (0x50-0x5F)

| Type | Value | Description |
|------|-------|-------------|
| FORKANNOUNCE | 0x50 | New fork announcement |
| FORKQUERY | 0x51 | Query fork information |
| FORKINFO | 0x52 | Fork information response |

### Error Handling (0x60-0x6F)

| Type | Value | Description |
|------|-------|-------------|
| REJECT | 0x60 | Message rejection |
| ALERT | 0x61 | Network-wide alert |

## Address Formats

### CompactAddr (26 bytes)

Used in VERSION messages for compact address representation:

| Field | Size | Description |
|-------|------|-------------|
| transport | 1 byte | Transport type |
| address | 16 bytes | IPv6 or IPv4-mapped address |
| port | 2 bytes | Port number (little-endian) |
| services | 4 bytes | Service flags (little-endian) |
| padding | 3 bytes | Reserved for alignment |

### WireAddr (75 bytes)

Used in ADDR messages for full address information:

| Field | Size | Description |
|-------|------|-------------|
| transport | 1 byte | Transport type |
| address | 64 bytes | Address (zero-padded) |
| port | 2 bytes | Port number (little-endian) |
| services | 4 bytes | Service flags (little-endian) |
| last_seen | 4 bytes | Last seen timestamp (UNIX seconds) |

## Transport Types

| Value | Transport |
|-------|-----------|
| 0x01 | TCP over IPv4 |
| 0x02 | TCP over IPv6 |
| 0x03 | Tor hidden service |
| 0x04 | I2P |
| 0x05 | QUIC |

## Implementation

The wire protocol is implemented in `src/network/`:

- `error.rs` - Error types (`WireError`)
- `messages.rs` - Payload type definitions
- `serialize.rs` - Serialization/deserialization
- `builder.rs` - High-level `Message` enum and builders

### Example Usage

```rust
use swimchain::network::{Message, PingPongPayload, VersionBuilder};

// Create a ping message
let ping = Message::Ping(PingPongPayload::new(12345));
let envelope = ping.to_envelope_agnostic();

// Validate and parse received envelope
envelope.validate()?;
let message = Message::from_envelope(&envelope)?;
```

## Constants

Key protocol constants from `src/types/constants.rs`:

| Constant | Value | Description |
|----------|-------|-------------|
| MESSAGE_HEADER_SIZE | 46 | Envelope header size |
| WIRE_ADDRESS_SIZE | 75 | Full address size |
| COMPACT_ADDRESS_SIZE | 26 | Compact address size |
| MAX_ADDRS_PER_MESSAGE | 1000 | Maximum addresses in ADDR |
| MAX_INV_ITEMS | 50000 | Maximum inventory items |
| MAX_BLOCKS_PER_MESSAGE | 500 | Maximum blocks per response |
| HANDSHAKE_TIMEOUT_SECS | 30 | Handshake timeout |
| VERSION_TIMEOUT_SECS | 10 | VERSION message timeout |
