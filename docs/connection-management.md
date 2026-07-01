# Connection Management (SPEC_10 §4)

This document describes the Connection Management system implemented in Milestone 8.2.

## Overview

The Connection Manager is responsible for:
- Tracking active peer connections
- Enforcing connection limits (inbound/outbound/total)
- Managing peer selection for new connections
- Handling reconnection with exponential backoff
- Emitting connection lifecycle events
- Integrating with PeerStore for score updates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       NodeManager                            │
│  ┌───────────────────┐  ┌───────────────────────────────┐  │
│  │   TcpTransport    │  │     ConnectionManager          │  │
│  │   - connect()     │──│  - connections HashMap         │  │
│  │   - accept()      │  │  - reconnect_state             │  │
│  │                   │  │  - banned_until                │  │
│  └───────────────────┘  │  - event broadcast channel     │  │
│                         └──────────────┬────────────────┘  │
│                                        │                    │
│  ┌───────────────────┐                 │                    │
│  │    PeerStore      │◄────────────────┘                    │
│  │  - score updates  │                                      │
│  │  - peer selection │                                      │
│  └───────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### ConnectionConfig

| Field | Default | Description |
|-------|---------|-------------|
| `max_inbound` | 100 | Maximum inbound connections (SPEC_10 §4.1) |
| `max_outbound` | 25 | Maximum outbound connections (SPEC_10 §4.1) |
| `target_peers` | 25 | Target number of peers (SPEC_10 §4.1) |
| `min_peers` | 8 | Minimum peers before bootstrap (SPEC_10 §4.1) |
| `max_connections` | 125 | Maximum total connections (SPEC_10 §3.2) |

## Connection Lifecycle

```
                                 ┌─────────┐
                                 │  START  │
                                 └────┬────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
        ┌───────────┐          ┌───────────┐          ┌───────────┐
        │  INBOUND  │          │ OUTBOUND  │          │  BANNED   │
        │ (accept)  │          │ (connect) │          │ (reject)  │
        └─────┬─────┘          └─────┬─────┘          └───────────┘
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  HANDSHAKE  │
                   │  (VERSION)  │
                   └──────┬──────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ SUCCESS │  │ TIMEOUT │  │  ERROR  │
        └────┬────┘  └────┬────┘  └────┬────┘
             │            │            │
             ▼            └────┬───────┘
       ┌───────────┐           │
       │ESTABLISHED│           ▼
       └─────┬─────┘    ┌─────────────┐
             │          │ SCHEDULE    │
             │          │ RECONNECT   │
             ▼          └─────────────┘
       ┌───────────┐
       │  NORMAL   │
       │DISCONNECT │
       └───────────┘
```

## Peer Selection Algorithm

The peer selection algorithm prioritizes peers based on their score and recent activity:

```rust
fn select_peers_to_connect(&self) -> Vec<PeerEntry> {
    // 1. Get all peers from store
    let candidates = peer_store.get_all();

    // 2. Filter out already connected peers
    candidates.retain(|p| !is_connected(p.addr));

    // 3. Sort by:
    //    - Score (descending) - higher scored peers first
    //    - Last success time (descending) - recently successful peers preferred
    candidates.sort_by(|a, b| {
        b.score.cmp(&a.score)
            .then(b.last_success.cmp(&a.last_success))
    });

    // 4. Take up to (target_peers - current_peers)
    let needed = target_peers - current_count;
    candidates.truncate(needed);

    candidates
}
```

## Reconnection Backoff

Failed connections are retried with exponential backoff to prevent network spam:

### Formula

```
delay = min(base * factor^attempts, max_delay)
delay = delay ± (delay * jitter_percent / 100)
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `RECONNECT_BASE_DELAY_SECS` | 1 | Initial delay |
| `RECONNECT_MAX_DELAY_SECS` | 1800 | Maximum delay (30 minutes) |
| `RECONNECT_FACTOR` | 2 | Exponential factor |
| `RECONNECT_JITTER_PERCENT` | 25 | ±25% jitter |

### Example Delays

| Attempt | Base Delay | With Jitter Range |
|---------|------------|-------------------|
| 0 | 1s | 0.75s - 1.25s |
| 1 | 2s | 1.5s - 2.5s |
| 2 | 4s | 3s - 5s |
| 3 | 8s | 6s - 10s |
| 4 | 16s | 12s - 20s |
| ... | ... | ... |
| 10+ | 1800s | 1350s - 2250s (capped) |

## Connection Events

The ConnectionManager emits events through a broadcast channel:

### Event Types

```rust
pub enum ConnectionEvent {
    /// A new peer connection was established
    Connected {
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection,
    },

    /// A peer connection was closed
    Disconnected {
        peer_id: [u8; 32],
        reason: DisconnectReason,
    },

    /// A message was received from a peer
    MessageReceived {
        peer_id: [u8; 32],
        message_type: u16,
    },

    /// A connection error occurred
    Error {
        peer_id: [u8; 32],
        error: ConnectionError,
    },
}
```

### Subscribing to Events

```rust
// Subscribe to connection events
let mut rx = node.subscribe_connection_events().unwrap();

// Process events
loop {
    match rx.recv().await {
        Ok(event) => match event {
            ConnectionEvent::Connected { peer_id, addr, direction } => {
                println!("Peer connected: {} from {}", hex::encode(&peer_id[..8]), addr);
            }
            ConnectionEvent::Disconnected { peer_id, reason } => {
                println!("Peer disconnected: {} - {}", hex::encode(&peer_id[..8]), reason);
            }
            _ => {}
        },
        Err(_) => break,
    }
}
```

## Disconnect Reasons

| Reason | Description | Score Impact |
|--------|-------------|--------------|
| `Normal` | Graceful disconnect | None |
| `Timeout` | Connection/keepalive timeout | -20 |
| `ProtocolViolation` | Invalid message format | -20 + possible ban |
| `ConnectionError` | I/O or network error | -20 |
| `PeerBanned` | Peer is banned | None |
| `LimitExceeded` | Connection limit reached | None |
| `Shutdown` | Node shutting down | None |

## Ban Mechanism

Peers are automatically banned after repeated protocol violations:

| Constant | Value | Description |
|----------|-------|-------------|
| `PROTOCOL_VIOLATION_BAN_THRESHOLD` | 3 | Violations before ban |
| `BAN_DURATION_SECS` | 3600 | Ban duration (1 hour) |

When a peer reaches the violation threshold:
1. The peer is added to the banned_until map
2. Connection attempts from/to that peer are rejected
3. The ban expires after BAN_DURATION_SECS

## PeerStore Integration

The ConnectionManager updates PeerStore on connection events:

| Event | PeerStore Action |
|-------|------------------|
| Successful connection | `record_success()` (+10 score) |
| Timeout disconnect | `record_failure()` (-20 score) |
| Protocol violation | `record_failure()` (-20 score) + check ban |
| Connection error | `record_failure()` (-20 score) |
| Normal disconnect | No score change |
| Shutdown | No score change |

## API Reference

### ConnectionManager

```rust
impl ConnectionManager {
    // Creation
    pub fn new(config: ConnectionConfig, peer_store: Arc<PeerStore>) -> Self;

    // Event subscription
    pub fn subscribe(&self) -> broadcast::Receiver<ConnectionEvent>;

    // Connection counts
    pub fn inbound_count(&self) -> usize;
    pub fn outbound_count(&self) -> usize;
    pub fn connection_count(&self) -> usize;

    // Limit checking
    pub fn can_accept_inbound(&self) -> bool;
    pub fn can_connect_outbound(&self) -> bool;
    pub fn is_connected(&self, peer_id: &[u8; 32]) -> bool;
    pub fn needs_more_peers(&self) -> bool;
    pub fn needs_bootstrap(&self) -> bool;

    // Connection management
    pub fn add_connection(
        &self,
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection
    ) -> Result<(), ConnectionManagerError>;

    pub fn remove_connection(
        &self,
        peer_id: &[u8; 32],
        reason: DisconnectReason
    ) -> Option<ConnectionHandle>;

    pub fn get_connections(&self) -> Vec<ConnectionHandle>;
    pub fn get_connection(&self, peer_id: &[u8; 32]) -> Option<ConnectionHandle>;

    // Ban management
    pub fn is_banned(&self, peer_id: &[u8; 32]) -> bool;
    pub fn ban_peer(&self, peer_id: [u8; 32], duration: Duration);
    pub fn unban_peer(&self, peer_id: &[u8; 32]);
    pub fn cleanup_expired_bans(&self);

    // Peer selection
    pub fn select_peers_to_connect(&self) -> Vec<PeerEntry>;

    // Reconnection
    pub fn schedule_reconnect(&self, peer_key: PeerKey, error: Option<ConnectionError>);
    pub fn get_peers_to_reconnect(&self) -> Vec<PeerKey>;
    pub fn clear_reconnect_state(&self, peer_key: &PeerKey);

    // Event emission
    pub fn emit_message_received(&self, peer_id: [u8; 32], message_type: u16);
    pub fn emit_error(&self, peer_id: [u8; 32], error: ConnectionError);
}
```

### NodeManager Integration

```rust
impl NodeManager {
    // Connection management
    pub fn peer_count(&self) -> usize;
    pub fn needs_more_peers(&self) -> bool;
    pub fn peers(&self) -> Vec<PeerInfo>;

    // Event subscription
    pub fn subscribe_connection_events(&self) -> Option<broadcast::Receiver<ConnectionEvent>>;

    // Connection control
    pub async fn connect(&self, addr: SocketAddr) -> Result<(), NodeError>;
    pub async fn disconnect(&self, peer_id: &[u8; 32]) -> Result<(), NodeError>;

    // Registration (called by transport layer after handshake)
    pub fn register_connection(
        &self,
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection
    ) -> Result<(), ConnectionManagerError>;

    // Access to ConnectionManager
    pub fn connection_manager(&self) -> Option<Arc<ConnectionManager>>;
}
```

## Thread Safety

The ConnectionManager uses `Arc<RwLock<ConnectionManagerInner>>` for thread-safe access:

- Read operations (counts, checks) acquire read locks
- Write operations (add, remove, ban) acquire write locks
- Events are emitted outside of locks to prevent deadlocks
- Lock ordering: Always acquire ConnectionManager lock before PeerStore lock

## Testing

Run the connection management tests:

```bash
cargo test --lib node::connection_manager
cargo test --lib node::connection_event
```

## See Also

- [SPEC_10 - Node Operations](../specs/SPEC_10_NODE_OPERATIONS.md)
- [SPEC_06 - Network Protocol](../specs/SPEC_06_NETWORK.md)
- [PeerStore Documentation](./peer-discovery.md)
