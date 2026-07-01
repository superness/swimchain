# Core Data Structures

This document describes the core data structures used in the Swimchain protocol, implemented in Milestone 0.2.

## Overview

The type system is organized into modules:

```
src/types/
├── mod.rs          # Module exports and re-exports
├── constants.rs    # Protocol constants (SPEC_01, SPEC_02, SPEC_06)
├── error.rs        # Error types (SerializeError, AddressError)
├── identity.rs     # Identity types (SPEC_01)
├── content.rs      # Content types (SPEC_02)
├── block.rs        # Block types (SPEC_08)
├── network.rs      # Network types (SPEC_06)
└── serialize.rs    # Serialization helpers

src/crypto/
├── mod.rs          # Crypto module exports
├── hash.rs         # SHA-256, Blake3, merkle trees
├── signature.rs    # Ed25519 operations
└── address.rs      # Bech32m encoding
```

## Identity Types (SPEC_01)

| Type | Size | Description |
|------|------|-------------|
| `IdentityId` | 32 bytes | SHA-256 hash of public key |
| `PublicKey` | 32 bytes | Ed25519 public key |
| `PrivateKey` | 64 bytes | Ed25519 private key (zeroed on drop) |
| `Signature` | 64 bytes | Ed25519 signature |
| `KeyPair` | - | Public + private key pair |
| `IdentityCreationProof` | - | PoW proof for identity creation |
| `IdentityMetadata` | - | Display name, bio, avatar |
| `SignatureEnvelope` | - | Timestamped signature with tolerance checking |

### Identity Address Format

Addresses use Bech32m encoding (BIP-350):
- Human-readable prefix: `cs`
- Version byte: `0` (current)
- Payload: 32-byte identity ID
- Example: `cs1qz5v3y6xqz5v3y6xqz5v3y6xqz5v3y6xqz5v3y6xqz5v3y6xqz5v3y6x8d9f3`

## Content Types (SPEC_02)

| Type | Size | Description |
|------|------|-------------|
| `ContentHash` | 32 bytes | SHA-256 of content |
| `ContentId` | 32 bytes | Unique content identifier |
| `SpaceId` | 32 bytes | Space identifier |
| `ContentType` | 1 byte | Post (0x00), Reply (0x01), Quote (0x02) |
| `MediaType` | 1 byte | JPEG (0x01), PNG (0x02), GIF (0x03), WebP (0x04) |
| `MediaRef` | - | Media attachment reference |
| `ContentItem` | - | Full post/reply structure |
| `EngagementRecord` | - | Engagement action record |
| `Tombstone` | - | Deleted content marker |
| `Manifest` | - | Chunked content manifest |

### Content Timestamps

Content layer uses **UNIX milliseconds** for timestamps:
- `created_at`, `updated_at` in `ContentItem`
- `pin_created`, `pin_expiry` in `PinState`
- `timestamp` in `EngagementRecord`

## Block Types (SPEC_08)

| Type | Size | Description |
|------|------|-------------|
| `BlockHash` | 32 bytes | SHA-256 of block header |
| `ForkId` | 32 bytes | Fork identifier (zeros = main chain) |
| `BlockType` | 1 byte | Root (0x00), Space (0x01), Content (0x02) |
| `BlockHeader` | - | Common block header |
| `RootBlock` | - | Chain coordination block |
| `SpaceBlock` | - | Space management block |
| `ContentBlock` | - | Content actions block |
| `PreservationProof` | - | Content lifetime extension proof |
| `ContentAction` | - | Action enum (Create, Engage, Preserve) |

### Block Timestamps

Chain layer uses **UNIX seconds** for timestamps:
- `timestamp` in `BlockHeader`
- `timestamp` in `SpaceMembershipUpdate`

## Network Types (SPEC_06)

| Type | Size | Description |
|------|------|-------------|
| `NodeId` | 32 bytes | SHA-256 of node's public key |
| `TransportType` | 1 byte | TcpV4, TcpV6, Tor, I2p, Quic |
| `PeerAddress` | - | Network address (various formats) |
| `PeerIdentity` | - | Node identity and capabilities |
| `PeerInfo` | - | Peer information with addresses |
| `MessageType` | 1 byte | 21 message types (see below) |
| `MessageEnvelope` | - | Framed network message |
| `GossipMessage` | - | Gossip propagation message |
| `DhtRecord` | - | DHT storage record |

### Message Types

| Category | Types |
|----------|-------|
| Handshake | Version (0x00), Verack (0x01), Ping (0x02), Pong (0x03) |
| Address | GetAddr (0x10), Addr (0x11) |
| Inventory | Inv (0x20), GetData (0x21), Data (0x22), NotFound (0x23) |
| Sync | GetBlocks (0x30), Blocks (0x31), GetHeaders (0x32), Headers (0x33), ChainStatus (0x34) |
| Gossip | Gossip (0x40) |
| Fork | ForkAnnounce (0x50), ForkQuery (0x51), ForkInfo (0x52) |
| Error | Reject (0x60), Alert (0x61) |

### Capability Bitmask

```rust
pub mod capability {
    pub const FULL_NODE: u32 = 0x0001;
    pub const BLOCK_PRODUCER: u32 = 0x0002;
    pub const RELAY: u32 = 0x0004;
    pub const TOR: u32 = 0x0008;
    pub const I2P: u32 = 0x0010;
    pub const MOBILE: u32 = 0x0020;
}
```

## Serialization Conventions

### Byte Order

All multi-byte integers are **little-endian**:
```rust
let mut w = ByteWriter::new();
w.write_u32_le(0x12345678);
// Produces: [0x78, 0x56, 0x34, 0x12]
```

### Optional Fields

Optional values use a presence byte:
- `0x00` - Value absent
- `0x01` - Value present, followed by serialized value

```rust
// None
w.write_optional::<u32, _>(None, |w, v| w.write_u32_le(*v));
// Produces: [0x00]

// Some(123)
w.write_optional(Some(&123u32), |w, v| w.write_u32_le(*v));
// Produces: [0x01, 0x7B, 0x00, 0x00, 0x00]
```

### Strings

Strings are length-prefixed, **no null terminators**:
- `write_string_u8`: 1-byte length prefix (max 255 bytes)
- `write_string_u16`: 2-byte length prefix (max 65535 bytes)

```rust
w.write_string_u8("hello");
// Produces: [0x05, 'h', 'e', 'l', 'l', 'o']
```

## Timestamp Units

| Layer | Unit | Examples |
|-------|------|----------|
| Identity (SPEC_01) | UNIX seconds | `IdentityCreationProof.timestamp`, `SignatureEnvelope.timestamp` |
| Content (SPEC_02) | UNIX milliseconds | `ContentItem.created_at`, `EngagementRecord.timestamp` |
| Chain (SPEC_08) | UNIX seconds | `BlockHeader.timestamp` |
| Network (SPEC_06) | UNIX seconds | `PeerInfo.last_seen`, `DhtRecord.expiry` |

## Protocol Constants

| Constant | Value | Spec Reference |
|----------|-------|----------------|
| `ADDRESS_HRP` | "cs" | SPEC_01 §3.3 |
| `ADDRESS_VERSION` | 0 | SPEC_01 §3.3 |
| `IDENTITY_POW_DIFFICULTY` | 20 bits | SPEC_01 §3.4 |
| `SIGNATURE_PAST_TOLERANCE_SECS` | 3600 (1h) | SPEC_01 §6.2 |
| `SIGNATURE_FUTURE_TOLERANCE_SECS` | 300 (5m) | SPEC_01 §6.2 |
| `POW_TIMESTAMP_MAX_AGE_SECS` | 86400 (24h) | SPEC_01 §6.3 |
| `MAX_DISPLAY_NAME_BYTES` | 64 | SPEC_01 §3.5 |
| `MAX_BIO_BYTES` | 256 | SPEC_01 §3.5 |
| `INLINE_CONTENT_THRESHOLD` | 1024 | SPEC_02 §3.1 |
| `MAX_BODY_SIZE` | 4096 | SPEC_02 §3.1 |
| `MAX_MEDIA_REFS` | 4 | SPEC_02 §3.3 |
| `DECAY_FLOOR_SECS` | 172800 (48h) | SPEC_02 §4.1 |
| `HALF_LIFE_SECS` | 604800 (7d) | SPEC_02 §4.1 |
| `DECAY_THRESHOLD` | 0.0625 (6.25%) | SPEC_02 §4.1 |
| `MAGIC_BYTES` | "CSOC" | SPEC_06 §3.4 |
| `PROTOCOL_VERSION` | 1 | SPEC_06 §3.4 |
| `DEFAULT_PORT` | 9735 | SPEC_06 §4.1 |
| `GOSSIP_FANOUT` | 8 | SPEC_06 §4.3 |
| `GOSSIP_TTL` | 6 | SPEC_06 §4.3 |
| `MIN_PEERS` | 8 | SPEC_06 §4.2 |
| `TARGET_PEERS` | 25 | SPEC_06 §4.2 |
| `MAX_PEERS` | 100 | SPEC_06 §4.2 |

## Cryptographic Operations

### Hash Functions

- **SHA-256**: Content hashing, PoW hashing, identity derivation
- **Blake3**: Fast internal hashing
- **Merkle root**: Balanced tree with SHA-256, duplicate last hash if odd

### Signatures

- **Algorithm**: Ed25519
- **Content signing**: Signs `content_hash || timestamp` (40 bytes)
- **Verification**: Strict verification with timestamp tolerance checking

### Proof of Work

- **Hash function**: SHA-256
- **Difficulty**: Measured in leading zero bits
- **Verification**: `leading_zeros(hash) >= difficulty`

---

## Changelog

- **2025-12-25 (v1.0.0)**: Initial implementation as part of Milestone 0.2. All core data structures implemented with serialization, 111 tests passing.
