# Gossip Protocol

## Overview

The Swimchain gossip protocol implements an epidemic-style message propagation system for distributing content, blocks, and identity updates across the peer-to-peer network. This design ensures rapid, reliable propagation while minimizing redundant transmissions through seen caching and TTL-based hop limiting.

## Protocol Parameters

| Parameter | Value | Description | Reference |
|-----------|-------|-------------|-----------|
| `GOSSIP_FANOUT` | 8 | Number of peers to forward each message to | SPEC_06 §4.3 |
| `GOSSIP_TTL` | 6 | Maximum number of hops a message can travel | SPEC_06 §4.3 |
| `SEEN_CACHE_SIZE` | 10,000 | Maximum entries in duplicate detection cache | SPEC_06 §4.3 |
| `GOSSIP_TIMESTAMP_TOLERANCE_SECS` | 300 | ±5 minute timestamp tolerance | V-GOSSIP-04 |
| `SEEN_CACHE_EXPIRY_SECS` | 120 | Cache entry expiration time | Implementation |
| `GOSSIP_MAX_RETRIES` | 3 | Maximum GETDATA retry attempts | Implementation |

## Message Types

### Gossip Types

| Type | Value | Description |
|------|-------|-------------|
| `BLOCK_ANNOUNCE` | 0x01 | Announce a new block |
| `CONTENT_NEW` | 0x02 | Announce new content |
| `IDENTITY_UPDATE` | 0x03 | Announce identity update |

### Wire Messages (SPEC_06 §5.2)

| Message | ID | Description |
|---------|---|-------------|
| `INV` | 0x20 | Announce available inventory items |
| `GETDATA` | 0x21 | Request specific items |
| `DATA` | 0x22 | Deliver requested items |
| `NOTFOUND` | 0x23 | Indicate unavailable items |
| `GOSSIP` | 0x40 | Direct gossip message |

## Message Flow

### Direct Gossip Flow

```
Node A (Origin)           Node B                    Node C
     |                       |                          |
     |--- GOSSIP (TTL=6) --->|                          |
     |                       |--- GOSSIP (TTL=5) ------>|
     |                       |                          |
```

### INV/GETDATA/DATA Exchange

```
Node A                    Node B
     |                       |
     |<---- INV [items] -----|  "I have these items"
     |                       |
     |-- GETDATA [items] --->|  "Send me items I need"
     |                       |
     |<---- DATA [content] --|  "Here's the content"
     |                       |
     |<-- NOTFOUND [items] --|  (if items unavailable)
```

## Validation Rules

The gossip protocol implements the following validation rules per SPEC_06 §6.4:

### V-GOSSIP-01: TTL Check
- Messages with TTL=0 MUST NOT be forwarded
- Messages are still stored locally even if not forwarded
- TTL is decremented before forwarding

### V-GOSSIP-02: Signature Validation
- All content MUST have valid cryptographic signatures
- Invalid signatures result in immediate rejection
- Peer may be penalized for sending invalid content

### V-GOSSIP-03: Decay Check
- Content that has decayed past the threshold MUST be rejected
- Prevents propagation of expired content
- See SPEC_02 §4 for decay mechanics

### V-GOSSIP-04: Timestamp Tolerance
- Timestamp MUST be within ±5 minutes of current time
- Prevents replay attacks with old messages
- Rejects messages from poorly synchronized nodes

### V-GOSSIP-05: Duplicate Detection
- Content MUST NOT already be in the seen cache
- Duplicates are silently dropped (not an error)
- Seen cache uses LRU eviction with time-based expiration

## Peer Selection Algorithm

When forwarding gossip, peers are selected using weighted random sampling:

```
1. FILTER: Exclude the sender
2. FILTER: Require matching fork_id
3. FILTER: Require positive reputation score
4. WEIGHT: base_score + diversity_bonus
5. SELECT: Weighted random sample of GOSSIP_FANOUT peers
```

### Diversity Bonus

To encourage network diversity, peers receive bonuses based on IP prefix representation:

| Prefix Matches | Bonus |
|----------------|-------|
| 0 (unique) | +50 |
| 1 | +25 |
| 2+ | 0 |

This encourages geographic and ASN diversity in message propagation.

## Seen Cache

The seen cache prevents duplicate message processing:

### LRU Eviction
- When cache reaches `SEEN_CACHE_SIZE`, oldest entries are evicted
- Entries are tracked in insertion order

### Time-based Expiration
- Entries expire after `SEEN_CACHE_EXPIRY_SECS` (120 seconds)
- Expiration is checked on access and periodically cleaned up

### Thread Safety
- Cache is protected by RwLock for concurrent access
- Read operations are non-blocking
- Write operations acquire exclusive lock

## Integration Points

### Sync Module
- Block announcements trigger sync checks via `on_new_block_gossip()`
- Unknown blocks at height > local tip trigger synchronization

### Storage Module
- New content is stored via the handler's local storage
- Content lookup happens for GETDATA requests

### Transport Layer
- TCP transport delivers gossip messages
- Peer connections managed by discovery module

## Error Handling

### Recoverable Errors
- `NoPeersAvailable`: Retry when peers become available
- `PeerError`: Network issue, can retry with different peer

### Non-Recoverable Errors
- `InvalidSignature`: Reject and potentially penalize peer
- `ContentDecayed`: Reject, content is expired
- `TimestampOutOfRange`: Reject, clock sync issue

## Usage Example

```rust
use swimchain::gossip::{GossipManager, gossip_types};

// Create and start the gossip manager
let mut manager = GossipManager::new();
let handle = manager.start();

// Gossip new content
let content_id = [0xab; 32];
let gossip = manager.propagator()
    .gossip_content(content_id, gossip_types::CONTENT_NEW, None)
    .await?;

// Check metrics
let summary = manager.metrics().summary();
println!("Messages sent: {}", summary.messages_sent);

// Stop gracefully
manager.stop().await;
```

## Security Considerations

1. **Rate Limiting**: Implementations should limit gossip rate per peer
2. **Resource Exhaustion**: Seen cache size limits memory usage
3. **Sybil Resistance**: Diversity bonus mitigates Sybil attacks
4. **Replay Prevention**: Timestamp tolerance and seen cache prevent replays
