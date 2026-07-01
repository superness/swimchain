# Peer Discovery (Milestone 2.3)

This document describes the Swimchain peer discovery and address management system.

## Overview

The discovery layer provides:
- Persistent peer cache with sled-backed storage
- GETADDR/ADDR message handling for peer exchange
- Hardcoded seed list for development and testing
- Peer scoring with reputation tracking
- Rate limiting to prevent abuse (V-PEER-04 compliance)
- Six-layer discovery stack foundation (SPEC_06 Section 4.1)

## Quick Start

```rust
use swimchain::discovery::{DiscoveryManager, PeerStore, PeerEntry};
use std::path::Path;

// Open persistent peer store
let peer_store = PeerStore::open(Path::new("./data/peers"))?;

// Bootstrap: get peers to connect to
let manager = DiscoveryManager::new(peer_store.clone());
let bootstrap_peers = manager.bootstrap()?;

// Process ADDR message from a peer
let (new_count, dup_count) = manager.handle_addr(&sender_key, &addr_payload)?;

// Handle GETADDR request
let response = manager.handle_getaddr(&requester_key, &getaddr_payload)?;

// Periodic maintenance (remove banned/stale peers)
manager.maintenance()?;
```

## Module Structure

The discovery layer is implemented in `src/discovery/`:

| File | Description |
|------|-------------|
| `mod.rs` | Module exports and documentation |
| `error.rs` | `DiscoveryError` enum with all error variants |
| `peer_key.rs` | `PeerKey` 67-byte unique peer identifier |
| `peer_entry.rs` | `PeerEntry` with WireAddr + metadata (95 bytes) |
| `peer_store.rs` | Sled-backed persistent peer cache |
| `seed_list.rs` | `TransportType` and hardcoded seed entries |
| `addr_handler.rs` | GETADDR/ADDR message processing with rate limiting |
| `peer_exchange.rs` | Peer exchange decision logic |
| `manager.rs` | `DiscoveryManager` coordinator |

## Key Types

### PeerKey

Unique identifier for a peer, derived from stable address fields (excludes volatile fields like `last_seen`):

```rust
/// 67-byte peer key: transport(1) + address(64) + port(2)
pub struct PeerKey([u8; 67]);

impl PeerKey {
    pub const SIZE: usize = 67;
    pub fn from_wire_addr(addr: &WireAddr) -> Self;
    pub fn as_bytes(&self) -> &[u8];
}
```

### PeerEntry

Extended peer information with metadata for reputation tracking:

```rust
/// 95-byte serialized entry: WireAddr(75) + metadata(20)
pub struct PeerEntry {
    pub wire_addr: WireAddr,     // Wire address (75 bytes)
    pub last_success: u64,        // Last successful connection (UNIX timestamp)
    pub failures: u16,            // Consecutive failure count
    pub score: i16,               // Reputation score (-1000 to +1000)
    pub first_seen: u64,          // When first discovered (UNIX timestamp)
}
```

### PeerStore

Sled-backed persistent storage for peer entries:

```rust
pub struct PeerStore {
    tree: sled::Tree,
}

impl PeerStore {
    pub fn open(path: &Path) -> Result<Self, DiscoveryError>;
    pub fn put(&self, entry: &PeerEntry) -> Result<(), DiscoveryError>;
    pub fn get(&self, key: &PeerKey) -> Result<Option<PeerEntry>, DiscoveryError>;
    pub fn get_all(&self) -> Result<Vec<PeerEntry>, DiscoveryError>;
    pub fn get_by_min_score(&self, min_score: i16) -> Result<Vec<PeerEntry>, DiscoveryError>;
    pub fn record_success(&self, key: &PeerKey) -> Result<(), DiscoveryError>;
    pub fn record_failure(&self, key: &PeerKey) -> Result<(), DiscoveryError>;
    pub fn remove(&self, key: &PeerKey) -> Result<(), DiscoveryError>;
    pub fn count(&self) -> Result<usize, DiscoveryError>;
    pub fn evict_lowest_scores(&self, keep_count: usize) -> Result<usize, DiscoveryError>;
    pub fn flush(&self) -> Result<(), DiscoveryError>;
}
```

### TransportType

Network transport protocols (SPEC_06 Section 3.2):

```rust
#[repr(u8)]
pub enum TransportType {
    TcpV4 = 0x01,  // IPv4 TCP
    TcpV6 = 0x02,  // IPv6 TCP
    Tor = 0x03,    // Tor onion v3
    I2P = 0x04,    // I2P destination
    Quic = 0x05,   // QUIC over UDP
}
```

### AddrHandler

Handles GETADDR/ADDR message processing with rate limiting:

```rust
pub struct AddrHandler {
    peer_store: Arc<PeerStore>,
    rate_limits: RwLock<HashMap<PeerKey, Instant>>,
}

impl AddrHandler {
    pub fn new(peer_store: Arc<PeerStore>) -> Self;
    pub fn handle_getaddr(&self, requester: &PeerKey, request: &GetAddrPayload)
        -> Result<AddrPayload, DiscoveryError>;
    pub fn handle_addr(&self, sender: &PeerKey, payload: &AddrPayload)
        -> Result<(usize, usize), DiscoveryError>;  // (new_count, dup_count)
    pub fn cleanup_rate_limits(&self);
}
```

### DiscoveryManager

Unified coordinator for peer discovery:

```rust
pub struct DiscoveryManager {
    peer_store: Arc<PeerStore>,
    seed_list: Vec<SeedEntry>,
    addr_handler: Arc<AddrHandler>,
    peer_exchange: PeerExchange,
}

impl DiscoveryManager {
    pub fn new(peer_store: Arc<PeerStore>) -> Self;
    pub fn bootstrap(&self) -> Result<Vec<WireAddr>, DiscoveryError>;
    pub fn maintenance(&self) -> Result<(), DiscoveryError>;
    pub fn handle_getaddr(&self, requester: &PeerKey, request: &GetAddrPayload)
        -> Result<AddrPayload, DiscoveryError>;
    pub fn handle_addr(&self, sender: &PeerKey, payload: &AddrPayload)
        -> Result<(usize, usize), DiscoveryError>;
}
```

## Peer Scoring

Peers are tracked with reputation scores from -1000 to +1000:

| Event | Score Change |
|-------|-------------|
| Initial score | +100 |
| Successful connection | +10 |
| Connection failure | -20 |

| Threshold | Action |
|-----------|--------|
| Score < -500 | Peer banned, removed from store |
| Score < 0 | Not returned in GETADDR responses |

## Rate Limiting

GETADDR requests are rate-limited per peer:

| Parameter | Value |
|-----------|-------|
| `GETADDR_RATE_LIMIT_SECS` | 60 seconds |
| Rate limit cleanup interval | 300 seconds |

## V-PEER-04 Compliance

The ADDR message is limited to prevent resource exhaustion:

| Limit | Enforcement |
|-------|-------------|
| Max addresses per ADDR message | 1000 |
| Validation on receive | Reject ADDR with > 1000 addresses |
| Validation on send | Truncate response to 1000 addresses |

## Protocol Constants

From `src/types/constants.rs`:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CACHED_PEERS` | 2000 | Maximum peers in persistent store |
| `PEER_BAN_THRESHOLD` | -500 | Score at which to ban peer |
| `PEER_INITIAL_SCORE` | 100 | Initial score for new peers |
| `PEER_SUCCESS_BONUS` | 10 | Score bonus for successful connection |
| `PEER_FAILURE_PENALTY` | 20 | Score penalty for connection failure |
| `PEER_MAX_AGE_SECS` | 30 days | Maximum peer age before eviction |
| `GETADDR_RATE_LIMIT_SECS` | 60 | Seconds between GETADDR from same peer |
| `ADDR_RESPONSE_TIMEOUT_SECS` | 30 | Timeout waiting for ADDR response |

## Error Handling

All operations return `Result<T, DiscoveryError>`:

| Error | Cause |
|-------|-------|
| `Storage(sled::Error)` | Sled database operation failed |
| `Serialize(SerializeError)` | Serialization/deserialization failed |
| `RateLimited { elapsed_secs, required_secs }` | GETADDR requested too frequently |
| `TooManyAddresses { count, max }` | ADDR payload exceeds 1000 limit |
| `InvalidTransport(u8)` | Unknown transport type byte |
| `Io(io::Error)` | I/O operation failed |
| `PeerNotFound` | Peer key not in store |

## Maintenance Operations

The `maintenance()` function performs periodic cleanup:

1. **Remove banned peers**: Score < PEER_BAN_THRESHOLD (-500)
2. **Remove stale peers**: Never connected and older than 30 days
3. **Evict overflow**: If count > MAX_CACHED_PEERS, remove lowest-scored peers

## Integration with Transport

The discovery module integrates with the transport layer (Milestone 2.2):

```rust
// After successful connection
peer_store.record_success(&peer_key)?;

// After connection failure
peer_store.record_failure(&peer_key)?;

// When receiving ADDR message
let (new_peers, duplicates) = manager.handle_addr(&sender_key, &payload)?;

// When receiving GETADDR message
let response = manager.handle_getaddr(&requester_key, &request)?;
```

## Testing

Unit tests are in each module file. Key test cases:

| Test | Criterion |
|------|-----------|
| `test_peer_store_persistence` | Peers survive restart |
| `test_handle_getaddr_rate_limited` | Rate limiting enforced |
| `test_handle_addr_v_peer_04_validation` | Rejects > 1000 addresses |
| `test_bootstrap_from_seeds_when_empty` | Seeds used when cache empty |
| `test_bootstrap_prefers_cached_peers` | Cached peers have priority |
| `test_peer_score_updates` | Score changes correctly |
| `test_peer_entry_roundtrip_negative_score` | i16 scores serialize correctly |
| `test_maintenance_removes_banned` | Banned peers removed |

Run tests:
```bash
cargo test --lib discovery
```

## Related Documentation

- [Bootstrap](bootstrap.md) - Six-layer discovery stack
- [Transport Layer](transport-layer.md) - TCP connections and handshakes
- [Wire Protocol](wire-protocol.md) - Message envelope format
- [Message Types](message-types.md) - GETADDR/ADDR message definitions
