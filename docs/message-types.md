# Message Types Reference (SPEC_06 §5.2)

This document provides detailed specifications for each wire protocol message type.

## Handshake Messages

### VERSION (0x00)

Initial handshake message sent when establishing a connection.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| protocol_version | u32 | 4 | Protocol version (currently 1) |
| node_services | u64 | 8 | Capability bitmask |
| timestamp | u64 | 8 | Message creation time (UNIX seconds) |
| sender_addr | CompactAddr | 26 | Sender's address info |
| receiver_addr | CompactAddr | 26 | Receiver's address (as seen by sender) |
| nonce | u64 | 8 | Random value for connection dedup |
| user_agent | string (u8 len) | 1+N | User agent (max 256 bytes) |
| start_height | u32 | 4 | Sender's current block height |
| relay | bool | 1 | Whether to receive gossip |

### VERACK (0x01)

Acknowledgment of VERSION message. Empty payload.

### PING (0x02)

Latency measurement request.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| nonce | u64 | 8 | Random value to match with PONG |

### PONG (0x03)

Response to PING with same nonce.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| nonce | u64 | 8 | Nonce from corresponding PING |

## Address Discovery Messages

### GETADDR (0x10)

Request peer addresses.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| fork_id | [u8; 32] | 32 | Fork filter (zeros for any) |
| max_addrs | u16 | 2 | Maximum addresses to return |

### ADDR (0x11)

List of peer addresses.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| count | u16 | 2 | Number of addresses |
| addresses | [WireAddr] | 75*N | List of wire addresses |

**Limit:** Maximum 1000 addresses per message (V-PEER-04).

## Inventory Messages

### INV (0x20)

Announce available inventory.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| count | u32 | 4 | Number of items |
| items | [InvItem] | 33*N | List of inventory items |

**InvItem format (33 bytes):**

| Field | Type | Size | Description |
|-------|------|------|-------------|
| inv_type | u8 | 1 | Item type (1=Block, 2=Content, 3=Identity) |
| hash | [u8; 32] | 32 | Item hash |

**Limit:** Maximum 50000 items per message.

### GETDATA (0x21)

Request specific inventory items. Same format as INV.

### DATA (0x22)

Response containing requested data.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| length | u32 | 4 | Data length |
| data | [u8] | N | Raw data |

### NOTFOUND (0x23)

Indicates requested items are not available. Same format as INV.

## Chain Sync Messages

### GETBLOCKS (0x30)

Request blocks by height range.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| start_height | u64 | 8 | Starting block height |
| end_height | u64 | 8 | Ending block height |
| include_content | bool | 1 | Include content blocks |
| max_blocks | u16 | 2 | Maximum blocks to return |

### BLOCKS (0x31)

Response containing blocks.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| count | u16 | 2 | Number of blocks |
| blocks | [Block] | variable | Serialized blocks (length-prefixed) |

Each block is prefixed with a u32 length.

**Limit:** Maximum 500 blocks per message.

### GETHEADERS (0x32)

Request block headers only.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| start_height | u64 | 8 | Starting block height |
| end_height | u64 | 8 | Ending block height |
| max_headers | u16 | 2 | Maximum headers to return |

### HEADERS (0x33)

Response containing headers. Same format as BLOCKS.

**Limit:** Maximum 2000 headers per message.

### CHAINSTATUS (0x34)

Periodic chain status announcement.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| height | u64 | 8 | Current chain height |
| tip_hash | [u8; 32] | 32 | Hash of tip block |
| cumulative_work | u64 | 8 | Total proof of work |
| pending_content_count | u32 | 4 | Pending content items |
| timestamp | u64 | 8 | Status timestamp |

Total: 60 bytes.

## Gossip Messages

### GOSSIP (0x40)

Gossip message for propagation.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| gossip_type | u8 | 1 | Gossip type |
| content_id | [u8; 32] | 32 | Content/block being gossiped |
| timestamp | u64 | 8 | Gossip creation time |
| ttl | u8 | 1 | Remaining hops |
| has_payload | u8 | 1 | 0x00 or 0x01 |
| payload_len | u32 | 0 or 4 | Length if has_payload |
| payload | [u8] | 0 or N | Optional attached data |

**Gossip Types:**

| Value | Type | Description |
|-------|------|-------------|
| 0x01 | BlockAnnounce | New block announcement |
| 0x02 | ContentNew | New content announcement |
| 0x03 | ContentRequest | Request specific content |
| 0x04 | ContentResponse | Provide requested content |
| 0x05 | PeerAnnounce | Announce peer availability |

## Fork Messages

### FORKANNOUNCE (0x50)

Announce a new fork.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| fork_id | [u8; 32] | 32 | Fork identifier |

### FORKQUERY (0x51)

Request fork information.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| fork_id | [u8; 32] | 32 | Fork identifier |

### FORKINFO (0x52)

Fork information response.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| fork_id | [u8; 32] | 32 | Fork identifier |
| info_len | u32 | 4 | Info data length |
| info | [u8] | N | Fork information |

## Error Messages

### REJECT (0x60)

Message rejection notification.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| rejected_type | u8 | 1 | Type of rejected message |
| code | u8 | 1 | Rejection code |
| reason_len | u8 | 1 | Reason string length |
| reason | string | N | Human-readable reason (max 256) |
| has_hash | u8 | 1 | 0x00 or 0x01 |
| hash | [u8; 32] | 0 or 32 | Hash of rejected item |

**Rejection Codes:**

| Value | Code | Description |
|-------|------|-------------|
| 0x01 | Malformed | Message structure invalid |
| 0x02 | Invalid | Message content invalid |
| 0x03 | Obsolete | Old protocol version |
| 0x04 | Duplicate | Already received |
| 0x05 | NotFound | Referenced item unknown |
| 0x06 | RateLimited | Too many requests |
| 0x07 | Banned | Peer is banned |

### ALERT (0x61)

Network-wide alert message.

| Field | Type | Size | Description |
|-------|------|------|-------------|
| message_len | u8 | 1 | Message length |
| message | string | N | Alert message (max 256) |
| signature | [u8; 64] | 64 | Ed25519 signature |

## Inventory Types

| Value | Type | Description |
|-------|------|-------------|
| 0x01 | Block | Block hash |
| 0x02 | Content | Content item hash |
| 0x03 | Identity | Identity hash |

## Service Flags

Capability bitmask for VERSION messages:

| Bit | Flag | Description |
|-----|------|-------------|
| 0x0001 | FULL_NODE | Complete chain history |
| 0x0002 | BLOCK_PRODUCER | Participates in consensus |
| 0x0008 | TOR | Supports Tor connections |
| 0x0010 | I2P | Supports I2P connections |
| 0x0020 | MOBILE | Mobile client (limited resources) |

Note: There is intentionally no RELAY flag. All nodes are equal participants.
