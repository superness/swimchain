# DHT & Peer Discovery - Feature Documentation

**Generated**: 2026-01-11
**Source**: MASTER_FEATURES.md Section 17 (lines 988-1054)
**Owner Areas**: `src/dht/`, `src/discovery/`

---

## Overview

The DHT & Peer Discovery system provides decentralized node location and content provider discovery for Swimchain. It combines a Kademlia-based Distributed Hash Table (DHT) with a six-layer peer discovery hierarchy to ensure nodes can efficiently find peers and content without relying on central authorities.

**Key capabilities:**
- **Content provider discovery**: Find which nodes have specific content
- **Peer discovery by node ID**: Locate peers in the network
- **Persistent peer caching**: Survive node restarts with sled-backed storage
- **Rate-limited peer exchange**: GETADDR/ADDR protocol with abuse prevention
- **Sybil resistance**: Node IDs derived from PoW-gated Ed25519 identities
- **Branch-selective sync**: Track which peers serve which content branches

---

## Architecture

```
                           ┌─────────────────────────────────────────────┐
                           │              Application Layer               │
                           └────────────────────┬────────────────────────┘
                                                │
           ┌────────────────────────────────────┼────────────────────────────────────┐
           │                                    │                                    │
           ▼                                    ▼                                    ▼
┌─────────────────────────┐      ┌──────────────────────────┐      ┌───────────────────────────┐
│       DHT Module        │      │    Discovery Module      │      │  Branch Tracker Module    │
│      (src/dht/)         │      │    (src/discovery/)      │      │  (peer_branches.rs)       │
├─────────────────────────┤      ├──────────────────────────┤      ├───────────────────────────┤
│ ┌─────────────────────┐ │      │ ┌──────────────────────┐ │      │ ┌───────────────────────┐ │
│ │    DhtManager       │ │      │ │  DiscoveryManager    │ │      │ │  PeerBranchTracker    │ │
│ │  (coordinator)      │ │      │ │   (coordinator)      │ │      │ │  (branch→peer map)    │ │
│ └──────────┬──────────┘ │      │ └──────────┬───────────┘ │      │ └───────────────────────┘ │
│            │            │      │            │             │      └───────────────────────────┘
│ ┌──────────┴──────────┐ │      │ ┌──────────┴───────────┐ │
│ │   RoutingTable      │ │      │ │    PeerStore         │ │
│ │  (256 k-buckets)    │ │      │ │  (sled-backed)       │ │
│ └─────────────────────┘ │      │ └──────────────────────┘ │
│                         │      │                          │
│ ┌─────────────────────┐ │      │ ┌──────────────────────┐ │
│ │   ProviderStore     │ │      │ │    AddrHandler       │ │
│ │ (content→providers) │ │      │ │  (rate limiting)     │ │
│ └─────────────────────┘ │      │ └──────────────────────┘ │
│                         │      │                          │
│ ┌─────────────────────┐ │      │ ┌──────────────────────┐ │
│ │  LookupCoordinator  │ │      │ │    SeedList          │ │
│ │ (iterative lookups) │ │      │ │  (bootstrap nodes)   │ │
│ └─────────────────────┘ │      │ └──────────────────────┘ │
└─────────────────────────┘      └──────────────────────────┘
```

### Six-Layer Discovery Stack

| Layer | Name | Status | Description |
|-------|------|--------|-------------|
| 0 | Cached | Complete | Persistent peer cache (checked first) |
| 1 | mDNS | Planned | Local network discovery |
| 2 | Social | Complete | QR codes, links (handled externally) |
| 3 | Seeds | Complete | Bootstrap introduction points |
| 4 | DHT | Complete | Distributed Kademlia lookup |
| 5 | PEX | Complete | Peer exchange (GETADDR/ADDR) |

---

## Data Structures

### NodeId

A 256-bit DHT node identifier derived from Ed25519 public keys.

**Location**: `src/dht/node_id.rs:17`

| Field | Type | Description |
|-------|------|-------------|
| `0` | `[u8; 32]` | Raw 256-bit identifier bytes |

**Key Properties:**
- Derived via SHA-256 hash of Ed25519 public key
- Provides Sybil resistance through PoW-gated identities
- Used for XOR distance calculations in Kademlia routing

---

### NodeEntry

Information about a node in the DHT routing table.

**Location**: `src/dht/routing_table.rs:19-29`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `NodeId` | The node's DHT identifier |
| `addr` | `SocketAddr` | Network address |
| `last_seen` | `Instant` | When last heard from |
| `failure_count` | `u32` | Failed RPC count |

**Eviction Logic:**
- `is_stale()`: Returns true if `last_seen > NODE_STALE_SECS` (3600s)
- `should_evict()`: Returns true if `failure_count >= 3 AND is_stale()`

---

### KBucket

A single k-bucket containing up to K (8) nodes.

**Location**: `src/dht/routing_table.rs:64-71`

| Field | Type | Description |
|-------|------|-------------|
| `nodes` | `VecDeque<NodeEntry>` | Nodes ordered by last seen (most recent at back) |
| `pending` | `Option<NodeEntry>` | Node waiting for stale eviction decision |

---

### RoutingTable

The Kademlia routing table with 256 k-buckets.

**Location**: `src/dht/routing_table.rs:220-227`

| Field | Type | Description |
|-------|------|-------------|
| `local_id` | `NodeId` | Our own node ID |
| `buckets` | `Vec<KBucket>` | 256 k-buckets indexed by XOR distance |

---

### ProviderRecord

A record mapping content to a provider node.

**Location**: `src/dht/provider_store.rs:14-22`

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `NodeId` | Provider node's ID |
| `addr` | `SocketAddr` | Network address |
| `timestamp` | `Instant` | When created/refreshed |

**Expiration**: Records expire after `PROVIDER_TTL_SECS` (3600 seconds / 1 hour)

---

### ProviderStore

Store for provider records mapping content hashes to providers.

**Location**: `src/dht/provider_store.rs:50-58`

| Field | Type | Description |
|-------|------|-------------|
| `providers` | `HashMap<[u8; 32], Vec<ProviderRecord>>` | Content hash to provider list |
| `local_content` | `HashMap<[u8; 32], Instant>` | Content we provide (for re-announcement) |

---

### LookupResult

Result of a DHT lookup operation.

**Location**: `src/dht/lookup.rs:82-95`

| Field | Type | Description |
|-------|------|-------------|
| `target` | `NodeId` | Target that was searched for |
| `closest` | `Vec<NodeInfo>` | K closest nodes found |
| `providers` | `Vec<NodeInfo>` | Providers found (FIND_VALUE) |
| `found_value` | `bool` | Whether content was found |
| `rpc_count` | `usize` | Number of RPCs made |

---

### PeerKey

Unique 67-byte identifier for peer cache keys.

**Location**: `src/discovery/peer_key.rs:18-19`

**Wire Format** (67 bytes):

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 1 | `transport` | Transport type byte |
| 1 | 64 | `address` | Address bytes (zero-padded) |
| 65 | 2 | `port` | Port (little-endian) |

**Note**: Excludes volatile fields (services, last_seen) to ensure same peer always maps to same key.

---

### PeerEntry

Extended peer data with metadata for persistent cache.

**Location**: `src/discovery/peer_entry.rs:19-31`

**Wire Format** (95 bytes):

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 75 | `wire_addr` | WireAddr structure |
| 75 | 8 | `last_success` | Last successful connection (UNIX timestamp) |
| 83 | 2 | `failures` | Consecutive failure count |
| 85 | 2 | `score` | Reputation score (-1000 to +1000) |
| 87 | 8 | `first_seen` | Discovery timestamp |

---

### SeedEntry

A bootstrap seed node entry.

**Location**: `src/discovery/seed_list.rs:47-56`

| Field | Type | Description |
|-------|------|-------------|
| `transport` | `TransportType` | Transport type (TcpV4, TcpV6, Tor, I2P, Quic) |
| `address` | `[u8; 64]` | Address bytes |
| `port` | `u16` | Port number |

---

### DnsSeed

DNS seed entry for scalable peer discovery.

**Location**: `src/discovery/seed_list.rs:139-145`

| Field | Type | Description |
|-------|------|-------------|
| `domain` | `String` | Domain name (e.g., "seed.swimchain.net") |
| `port` | `u16` | Port for resolved IPs |

---

### PeerBranchInfo

Information about branches a peer serves.

**Location**: `src/discovery/peer_branches.rs:36-47`

| Field | Type | Description |
|-------|------|-------------|
| `peer_id` | `[u8; 32]` | Peer identifier |
| `branches` | `HashMap<[u8; 32], HashSet<Vec<u8>>>` | Space→branches mapping |
| `last_update` | `u64` | Last update timestamp |
| `supports_branch_sync` | `bool` | Branch-selective sync support |

---

### PeerBranchTracker

Tracks branch information for all known peers with efficient lookups.

**Location**: `src/discovery/peer_branches.rs:150-158`

| Field | Type | Description |
|-------|------|-------------|
| `peers` | `HashMap<[u8; 32], PeerBranchInfo>` | Peer ID to branch info |
| `branch_to_peers` | `HashMap<([u8; 32], Vec<u8>), HashSet<[u8; 32]>>` | Reverse index |

---

### BranchCoverageSummary

Summary statistics for branch coverage monitoring.

**Location**: `src/discovery/peer_branches.rs:346-360`

| Field | Type | Description |
|-------|------|-------------|
| `total_peers` | `usize` | Total tracked peers |
| `total_branches` | `usize` | Unique branches tracked |
| `total_spaces` | `usize` | Unique spaces tracked |
| `min_peers_per_branch` | `usize` | Minimum peers serving any branch |
| `max_peers_per_branch` | `usize` | Maximum peers serving any branch |
| `avg_peers_per_branch` | `f64` | Average peers per branch |

---

## Core APIs

### DhtManager

**Location**: `src/dht/manager.rs:19-31`

#### new()
**Signature**: `pub fn new(local_id: NodeId, local_addr: SocketAddr) -> Self`

**Purpose**: Creates a new DHT manager with the specified local node ID and address.

---

#### on_node_seen()
**Signature**: `pub async fn on_node_seen(&self, id: NodeId, addr: SocketAddr) -> DhtResult<()>`

**Purpose**: Updates the routing table when a node is seen.

**Parameters**:
- `id`: The node's DHT identifier
- `addr`: The node's network address

**Returns**: `Ok(())` on success, or `DhtError` on failure

---

#### get_closest_nodes()
**Signature**: `pub async fn get_closest_nodes(&self, target: &NodeId, count: usize) -> Vec<NodeInfo>`

**Purpose**: Returns the K closest nodes to a target from the local routing table.

**Parameters**:
- `target`: Target node ID
- `count`: Maximum nodes to return

**Returns**: Vector of closest NodeInfo entries

---

#### add_provider()
**Signature**: `pub async fn add_provider(&self, content_hash: [u8; 32], node_id: NodeId, addr: SocketAddr)`

**Purpose**: Records that a node has specific content.

---

#### find_providers()
**Signature**: `pub async fn find_providers<F, Fut>(&self, content_hash: [u8; 32], send_rpc: F) -> DhtResult<Vec<NodeInfo>>`

**Purpose**: Performs an iterative FIND_VALUE lookup to find content providers.

**Parameters**:
- `content_hash`: 32-byte content hash to find
- `send_rpc`: Callback function to send FIND_VALUE RPCs

**Returns**: Vector of provider NodeInfo or `DhtError::NoProviders`

**Example**:
```rust
let node_id = NodeId::from_public_key(&public_key);
let dht = DhtManager::new(node_id, "0.0.0.0:9735".parse().unwrap());

// Find content providers
let content_hash = [0xab; 32];
let providers = dht.find_providers(content_hash, |node, hash| async {
    // Send FIND_VALUE RPC to node
    Ok((vec![], false))
}).await?;
```

---

#### handle_message()
**Signature**: `pub async fn handle_message(&self, msg: DhtMessage, sender_id: NodeId, sender_addr: SocketAddr) -> DhtResult<Option<DhtMessage>>`

**Purpose**: Handles incoming DHT messages and returns optional response.

**Message Handling**:

| Message | Response | Side Effects |
|---------|----------|--------------|
| Ping | Pong with same nonce | Updates routing table |
| Pong | None | Updates routing table |
| FindNode | Nodes (K closest) | Updates routing table |
| Nodes | None | Adds nodes to routing table |
| FindValue | Providers OR Nodes | Updates routing table |
| Providers | None | Stores provider records |
| Store | StoreAck(accepted=true) | Adds sender as provider |
| StoreAck | None | None |

---

### NodeId

#### from_public_key()
**Signature**: `pub fn from_public_key(public_key: &[u8; 32]) -> Self`

**Purpose**: Creates a NodeId from SHA-256 hash of an Ed25519 public key.

---

#### xor_distance()
**Signature**: `pub fn xor_distance(&self, other: &NodeId) -> NodeId`

**Purpose**: Calculates XOR distance to another node.

**Properties**:
- Symmetric: d(a, b) = d(b, a)
- Triangle inequality: d(a, c) <= d(a, b) + d(b, c)

---

#### bucket_index()
**Signature**: `pub fn bucket_index(&self, other: &NodeId) -> Option<usize>`

**Purpose**: Returns the k-bucket index for another node.

**Returns**: `Some(bucket_index)` or `None` if same node (distance = 0)

---

### DiscoveryManager

**Location**: `src/discovery/manager.rs:22-33`

#### bootstrap()
**Signature**: `pub fn bootstrap(&self) -> Result<Vec<WireAddr>, DiscoveryError>`

**Purpose**: Returns initial peers to connect to during startup.

**Priority Order**:
1. Cached peers with positive score (sorted by score, highest first)
2. Seed nodes if insufficient cached peers

**Example**:
```rust
let manager = DiscoveryManager::new(Path::new("/data/peers"))?;
let peers = manager.bootstrap()?;
for peer in peers {
    connect_to(peer.address, peer.port);
}
```

---

#### handle_getaddr()
**Signature**: `pub fn handle_getaddr(&self, requester: &PeerKey, request: &GetAddrPayload) -> Result<AddrPayload, DiscoveryError>`

**Purpose**: Handles GETADDR requests with rate limiting.

**Returns**: Up to 1000 addresses per V-PEER-04 compliance

---

#### handle_addr()
**Signature**: `pub fn handle_addr(&self, payload: &AddrPayload) -> Result<(usize, usize), DiscoveryError>`

**Purpose**: Processes incoming ADDR messages.

**Returns**: Tuple of (new_count, duplicate_count)

---

#### maintenance()
**Signature**: `pub fn maintenance(&self) -> Result<MaintenanceStats, DiscoveryError>`

**Purpose**: Runs periodic maintenance tasks.

**Operations**:
1. Removes banned peers (score < PEER_BAN_THRESHOLD)
2. Removes stale peers (never connected, older than PEER_MAX_AGE_SECS)
3. Evicts if over MAX_CACHED_PEERS
4. Cleans up rate limit entries

---

### PeerBranchTracker

**Location**: `src/discovery/peer_branches.rs:150-158`

#### add_branch()
**Signature**: `pub fn add_branch(&mut self, peer_id: [u8; 32], space_id: [u8; 32], branch: BranchPath)`

**Purpose**: Records that a peer serves a specific branch.

---

#### peers_for_branch()
**Signature**: `pub fn peers_for_branch(&self, space_id: &[u8; 32], branch: &BranchPath) -> Vec<[u8; 32]>`

**Purpose**: Returns all peers serving a specific branch.

---

#### update_from_inventory()
**Signature**: `pub fn update_from_inventory(&mut self, peer_id: [u8; 32], branches: Vec<([u8; 32], BranchPath)>)`

**Purpose**: Updates peer branch info from a branch inventory message.

---

## Behaviors

### K-Bucket Update Rules

When a node is seen, Kademlia bucket update rules apply:

1. **Node exists in bucket**: Move to back (most recently seen)
2. **Bucket not full**: Add new node to back
3. **Bucket full**:
   - If oldest node `should_evict()`: Evict oldest, add new
   - Otherwise: Store new node as `pending`, ping oldest
   - If oldest responds: Discard pending, keep oldest
   - If oldest fails: Evict oldest, add pending

**Location**: `src/dht/routing_table.rs:117-161`

---

### Iterative Lookup Algorithm

Both FIND_NODE and FIND_VALUE use iterative lookup:

1. Initialize candidates from local routing table (K closest)
2. Loop until timeout or termination:
   - Select ALPHA (3) closest pending nodes
   - Query nodes in parallel
   - Add discovered nodes to candidates
3. Termination: K responded nodes and closest responded is closer than all pending
4. Return K closest responded nodes

For FIND_VALUE, additionally:
- Track providers from responses with `has_value=true`
- Early termination if 3+ providers found

**Location**: `src/dht/lookup.rs:151-269`

---

### Provider Record Lifecycle

1. **Announcement**: Node calls `add_local_content()` to register content
2. **Publication**: DHT STORE message sent to K closest nodes
3. **Refresh**: Records refreshed every `PROVIDER_REFRESH_SECS` (45 min)
4. **Expiration**: Records expire after `PROVIDER_TTL_SECS` (1 hour)
5. **Cleanup**: Periodic `cleanup_expired()` removes stale records

**Location**: `src/dht/provider_store.rs`

---

### Peer Scoring System

Peers have reputation scores from -1000 to +1000:

| Event | Score Change |
|-------|-------------|
| Successful connection | +`PEER_SUCCESS_BONUS` (10) |
| Failed connection | -`PEER_FAILURE_PENALTY` (20) |

**Ban threshold**: Score < `PEER_BAN_THRESHOLD` (-500)

**Location**: `src/discovery/peer_entry.rs:49-64`

---

### Rate Limiting (GETADDR)

GETADDR requests are rate limited per peer:
- Minimum interval: `GETADDR_RATE_LIMIT_SECS` (60 seconds)
- Tracked via `HashMap<PeerKey, Instant>`
- Rate limit entries cleaned up periodically

**Location**: `src/discovery/addr_handler.rs:117-149`

---

## Configuration

### DHT Parameters

**Location**: `src/dht/constants.rs`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `K` | `usize` | 8 | Nodes per k-bucket (replication factor) |
| `ALPHA` | `usize` | 3 | Parallel lookups (concurrency factor) |
| `ID_BITS` | `usize` | 256 | Bits in node ID (SHA-256) |
| `NUM_BUCKETS` | `usize` | 256 | Number of k-buckets |
| `PROVIDER_TTL_SECS` | `u64` | 3600 | Provider record TTL (1 hour) |
| `PROVIDER_REFRESH_SECS` | `u64` | 2700 | Provider refresh interval (45 min) |
| `LOOKUP_TIMEOUT_MS` | `u64` | 10000 | Lookup timeout (10 seconds) |
| `RPC_TIMEOUT_MS` | `u64` | 5000 | Single RPC timeout (5 seconds) |
| `MAX_PROVIDERS` | `usize` | 20 | Max providers per content hash |
| `ROUTING_REFRESH_SECS` | `u64` | 3600 | Routing table refresh (1 hour) |
| `NODE_STALE_SECS` | `u64` | 3600 | Node stale threshold (1 hour) |

### Discovery Parameters

**Location**: `src/types/constants.rs`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DEFAULT_PORT` | `u16` | 9735 | Default network port |
| `TESTNET_PORT` | `u16` | 19735 | Testnet network port |
| `MAX_ADDRS_PER_MESSAGE` | `usize` | 1000 | V-PEER-04 limit |
| `TARGET_PEERS` | `usize` | 25 | Target peer count |
| `MAX_CACHED_PEERS` | `usize` | 2000 | Max peers in cache |
| `PEER_MAX_AGE_SECS` | `u64` | 2592000 | Stale peer age (30 days) |
| `GETADDR_RATE_LIMIT_SECS` | `u64` | 60 | GETADDR rate limit |
| `PEER_INITIAL_SCORE` | `i16` | 100 | Initial peer score |
| `PEER_SUCCESS_BONUS` | `i16` | 10 | Score increase on success |
| `PEER_FAILURE_PENALTY` | `i16` | 20 | Score decrease on failure |
| `PEER_BAN_THRESHOLD` | `i16` | -500 | Ban threshold |

---

## RPC Methods

### dht_status

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "dht_status",
  "params": {},
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "local_id": "a1b2c3d4...",
    "total_nodes": 42,
    "non_empty_buckets": 15,
    "provider_count": 128
  },
  "id": 1
}
```

---

### content_providers

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "content_providers",
  "params": {
    "content_hash": "abcd1234..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "providers": [
      {"id": "node1...", "addr": "192.168.1.1:9735"},
      {"id": "node2...", "addr": "192.168.1.2:9735"}
    ]
  },
  "id": 1
}
```

---

## CLI Commands

### cs node

```bash
cs node [--port PORT] [--data-dir DIR]
```

Starts a node which initializes DHT and discovery systems. The node will:
1. Load cached peers from `<data-dir>/peers/`
2. Initialize DHT with node ID derived from keypair
3. Bootstrap from cached peers, then seed nodes
4. Begin DHT maintenance tasks

---

## Protocol Messages

### DHT Messages (0x80-0x87)

**Location**: `src/dht/constants.rs:38-62`

| Byte | Constant | Purpose |
|------|----------|---------|
| `0x80` | `MSG_DHT_PING` | Liveness check |
| `0x81` | `MSG_DHT_PONG` | Ping response |
| `0x82` | `MSG_DHT_FIND_NODE` | Find K closest nodes |
| `0x83` | `MSG_DHT_NODES` | Response with node list |
| `0x84` | `MSG_DHT_FIND_VALUE` | Find content providers |
| `0x85` | `MSG_DHT_PROVIDERS` | Response with providers |
| `0x86` | `MSG_DHT_STORE` | Announce content availability |
| `0x87` | `MSG_DHT_STORE_ACK` | Store acknowledgment |

> **Note**: The MASTER_FEATURES.md documentation shows message bytes as 0x40-0x43. The actual implementation uses 0x80-0x87.

### Message Wire Formats

#### PING (0x80)
```
┌─────────────────────────────────┐
│ nonce: u64 (8 bytes, big-endian)│
└─────────────────────────────────┘
```

#### PONG (0x81)
```
┌─────────────────────────────────┐
│ nonce: u64 (8 bytes, big-endian)│
└─────────────────────────────────┘
```

#### FIND_NODE (0x82)
```
┌─────────────────────────────────┐
│ target: NodeId (32 bytes)       │
└─────────────────────────────────┘
```

#### NODES (0x83)
```
┌─────────────────────────────────────────────┐
│ count: u8 (1 byte)                          │
│ nodes: NodeInfo[] (variable, 39-51 each)    │
└─────────────────────────────────────────────┘
```

#### NodeInfo Format
```
┌─────────────────────────────────────────────┐
│ id: NodeId (32 bytes)                       │
│ addr_type: u8 (1 byte, 4=IPv4, 6=IPv6)      │
│ addr: 4 bytes (IPv4) or 16 bytes (IPv6)     │
│ port: u16 (2 bytes, big-endian)             │
└─────────────────────────────────────────────┘
```

#### FIND_VALUE (0x84)
```
┌─────────────────────────────────┐
│ content_hash: [u8; 32]          │
└─────────────────────────────────┘
```

#### PROVIDERS (0x85)
```
┌─────────────────────────────────────────────┐
│ content_hash: [u8; 32]                      │
│ has_value: u8 (0 or 1)                      │
│ count: u8                                   │
│ providers: NodeInfo[] (variable)            │
└─────────────────────────────────────────────┘
```

#### STORE (0x86)
```
┌─────────────────────────────────────────────┐
│ content_hash: [u8; 32]                      │
│ ttl: u32 (4 bytes, big-endian)              │
└─────────────────────────────────────────────┘
```

#### STORE_ACK (0x87)
```
┌─────────────────────────────────────────────┐
│ content_hash: [u8; 32]                      │
│ accepted: u8 (0 or 1)                       │
└─────────────────────────────────────────────┘
```

### Transport Types

**Location**: `src/discovery/seed_list.rs:17-30`

| Byte | Type | Description |
|------|------|-------------|
| `0x01` | TcpV4 | TCP over IPv4 |
| `0x02` | TcpV6 | TCP over IPv6 |
| `0x03` | Tor | Tor hidden service |
| `0x04` | I2P | I2P network |
| `0x05` | Quic | QUIC protocol |

---

## Error Handling

### DHT Errors

**Location**: `src/dht/error.rs`

| Error | Cause | Resolution |
|-------|-------|------------|
| `InvalidNodeId` | Wrong length or zero ID | Ensure 32-byte valid ID |
| `RoutingTableFull` | No stale entries to evict | Wait for nodes to become stale |
| `LookupTimeout` | Lookup exceeded timeout | Retry or check network |
| `NoProviders` | Content not found | Content may not exist or be announced |
| `RpcFailed` | Peer communication failed | Try different peer |
| `SerializationError` | Message encoding/decoding failed | Check message format |
| `BucketIndexOutOfRange` | Invalid bucket index | Internal error |
| `SelfLookup` | Attempted self-lookup | Don't lookup own ID |
| `NetworkError` | Network communication failed | Check connectivity |

### Discovery Errors

**Location**: `src/discovery/error.rs`

| Error | Cause | Resolution |
|-------|-------|------------|
| `Storage` | Sled database error | Check disk space/permissions |
| `Serialize` | Peer entry serialization failed | Check data integrity |
| `RateLimited` | GETADDR too frequent | Wait `required_secs` |
| `TooManyAddresses` | V-PEER-04 violation | Reject message |
| `InvalidTransport` | Unknown transport type | Skip invalid entries |
| `PeerNotFound` | Peer not in store | Add peer first |
| `StoreClosed` | Store already closed | Reopen store |

---

## Testing

### Unit Tests

```bash
# Run all DHT tests
cargo test --package swimchain dht::

# Run all discovery tests
cargo test --package swimchain discovery::

# Run specific test modules
cargo test --package swimchain dht::node_id::tests
cargo test --package swimchain dht::routing_table::tests
cargo test --package swimchain dht::provider_store::tests
cargo test --package swimchain dht::lookup::tests
cargo test --package swimchain dht::manager::tests
cargo test --package swimchain dht::messages::tests
cargo test --package swimchain discovery::peer_store::tests
cargo test --package swimchain discovery::peer_entry::tests
cargo test --package swimchain discovery::peer_key::tests
cargo test --package swimchain discovery::addr_handler::tests
cargo test --package swimchain discovery::peer_exchange::tests
cargo test --package swimchain discovery::seed_list::tests
cargo test --package swimchain discovery::manager::tests
cargo test --package swimchain discovery::peer_branches::tests
```

### Integration Tests

```bash
# Run peer discovery integration tests
cargo test --test peer_store_integration

# Run DHT behavior tests
cargo test --test locator_sync
```

### Manual Testing

```bash
# Start a node
./target/debug/swimchain node --port 9735

# In another terminal, check DHT status via RPC
curl -X POST http://localhost:3030/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"dht_status","params":{},"id":1}'
```

---

## Known Limitations

1. **mDNS not implemented**: Layer 1 (local network discovery) is marked as "Planned" and not yet available.

2. **Message byte discrepancy**: The MASTER_FEATURES.md documentation shows DHT messages as 0x40-0x43, but the actual implementation uses 0x80-0x87.

3. **No DHT persistence**: The DHT routing table and provider store are in-memory only. They reset on node restart. Only the peer discovery cache (PeerStore) persists via sled.

4. **Single-threaded lookups**: While ALPHA=3 queries run in parallel, the lookup coordinator processes results sequentially.

5. **DNS seed resolution blocking**: DNS seed resolution uses synchronous `to_socket_addrs()`, which may block.

6. **Branch tracker not persisted**: `PeerBranchTracker` is in-memory only; branch coverage info is lost on restart.

---

## Future Work

1. **Implement mDNS discovery (Layer 1)**: Add local network peer discovery via multicast DNS for LAN environments.

2. **DHT persistence**: Add sled-backed storage for routing table and provider records to survive restarts.

3. **Fix message byte documentation**: Update MASTER_FEATURES.md to reflect actual 0x80-0x87 message bytes.

4. **Async DNS resolution**: Replace synchronous DNS seed resolution with async implementation.

5. **Branch tracker persistence**: Add disk-backed storage for branch coverage tracking.

6. **Provider record redundancy**: Implement republishing to maintain K copies across network churn.

7. **DHT security hardening**: Add eclipse attack mitigation through bucket diversity requirements.

---

## Related Features

- **Network & Transport** (`docs/features/network-transport_FEATURE_DOC.md`): Wire protocol and message framing
- **Synchronization** (`docs/features/synchronization_FEATURE_DOC.md`): Uses peer discovery for sync operations
- **Sponsorship & Sybil Resistance** (`docs/features/sponsorship-sybil-resistance_FEATURE_DOC.md`): PoW-gated identities used for node IDs
