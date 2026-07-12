# Protocol Specification: Node Operations

## Status: DRAFT

## Version: 1.0.0

## 1. Overview

### 1.1 Purpose

The Node Operations System defines how a Swimchain node orchestrates its subsystems to function as a cohesive network participant. While Phases 1-7 built the individual components (identity, PoW, decay, gossip, sync, content distribution, social layer), this specification defines how those components are wired together into a running node.

**The Core Problem:** Every subsystem exists and has been tested in isolation. What's missing is the orchestrator—the central coordinator that:
- Binds to a network port and accepts connections
- Manages peer connections lifecycle
- Routes incoming messages to appropriate handlers
- Triggers outgoing gossip when local content changes
- Runs background tasks (sync loop, decay tick, contribution recording)
- Provides a unified API for the CLI and GUI clients

### 1.2 Relationship to Other Specs

| Spec | Provides | Node Operations Uses |
|------|----------|---------------------|
| SPEC_01 | Identity creation, signing | Signs outgoing messages, verifies incoming |
| SPEC_02 | Content storage, decay | Runs decay tick, manages content lifecycle |
| SPEC_03 | PoW computation | Validates incoming PoW, computes for local actions |
| SPEC_04 | Space definitions | Manages space membership, routes by space |
| SPEC_05 | Fork rules | Handles fork detection, chain selection |
| SPEC_06 | Wire protocol, sync, gossip | Actually connects, syncs, gossips |
| SPEC_07 | Content distribution | Fetches/serves content blobs |
| SPEC_08 | Block hierarchy | Produces blocks, validates chain |
| SPEC_09 | Social layer | Tracks contributions, reputation, and achievements |

**This spec is the glue.** It doesn't introduce new protocol rules—it defines how the existing rules are executed together.

### 1.3 Design Principles

1. **No Hidden State**: All node state is either derivable from the chain or explicitly stored/logged
2. **Graceful Degradation**: Subsystem failures should not crash the node
3. **Observable**: All operations should be loggable/metrifiable
4. **Restartable**: Node can be stopped and restarted without data loss
5. **Concurrent**: Use async I/O throughout; no blocking operations on main thread

---

## 2. Node Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NODE MANAGER                                    │
│                         (Central Orchestrator)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐            │
│   │  Connection   │     │    Message    │     │   Background  │            │
│   │    Manager    │────▶│    Router     │◀────│    Tasks      │            │
│   └───────────────┘     └───────────────┘     └───────────────┘            │
│          │                     │                     │                      │
│          ▼                     ▼                     ▼                      │
│   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐            │
│   │  TcpTransport │     │  Subsystem    │     │  TaskRunner   │            │
│   │   (SPEC_06)   │     │   Dispatch    │     │               │            │
│   └───────────────┘     └───────────────┘     └───────────────┘            │
│                                │                                            │
│          ┌─────────────────────┼─────────────────────┐                      │
│          ▼                     ▼                     ▼                      │
│   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐              │
│   │   GossipMgr │       │  ChainSync  │       │  ContentMgr │              │
│   │  (SPEC_06)  │       │  (SPEC_06)  │       │  (SPEC_07)  │              │
│   └─────────────┘       └─────────────┘       └─────────────┘              │
│          │                     │                     │                      │
│          ▼                     ▼                     ▼                      │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                      STORAGE LAYER                          │          │
│   │  ChainStore │ BlobStore │ LruCache │ ContributionStore      │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility | Reference |
|-----------|---------------|-----------|
| **NodeManager** | Central orchestrator; lifecycle, startup/shutdown | This spec §3 |
| **ConnectionManager** | Peer connection lifecycle, limits, reconnection | This spec §4 |
| **MessageRouter** | Incoming message dispatch to handlers | This spec §5 |
| **BackgroundTasks** | Periodic tasks (sync, decay, contribution) | This spec §6 |
| **TcpTransport** | TCP listener, connections, handshake | SPEC_06, docs/transport-layer.md |
| **GossipManager** | INV/GETDATA/DATA, seen cache, fan-out | SPEC_06, docs/gossip-protocol.md |
| **ChainSyncer** | Header sync, block download, fork handling | SPEC_06, docs/chain-sync.md |
| **ContentManager** | WHO_HAS/I_HAVE/GET/DATA, chunk fetch | SPEC_07, docs/content-retrieval.md |
| **Storage** | Persistent chain, blobs, cache, contributions | docs/storage-layer.md |

---

## 3. NodeManager

### 3.1 State

```rust
pub struct NodeManager {
    // Configuration
    config: NodeConfig,

    // Identity
    identity: Identity,
    local_info: LocalNodeInfo,

    // Network
    transport: TcpTransport,
    connections: ConnectionManager,

    // Subsystems
    chain_store: Arc<ChainStore>,
    blob_store: Arc<BlobStore>,
    gossip: Arc<GossipManager>,
    syncer: Arc<ChainSyncer>,
    content: Arc<ContentRetrievalManager>,
    contribution: Arc<ContributionManager>,

    // Runtime
    tasks: BackgroundTaskRunner,
    shutdown: watch::Sender<bool>,

    // Metrics
    metrics: NodeMetrics,
}
```

### 3.2 Configuration

```rust
pub struct NodeConfig {
    // Network
    pub listen_addr: SocketAddr,           // Default: 0.0.0.0:9735
    pub max_connections: usize,            // Default: 125
    pub connect_timeout: Duration,         // Default: 30s

    // Bootstrap
    pub seeds: Vec<SeedEntry>,             // Seed nodes for discovery
    pub min_peers: usize,                  // Default: 8
    pub target_peers: usize,               // Default: 25

    // Storage
    pub data_dir: PathBuf,                 // Data directory
    pub storage_profile: StorageProfile,   // Budget1GB/Standard5GB/Flagship10GB

    // Sync
    pub sync_interval: Duration,           // Default: 30s
    pub sync_batch_size: usize,            // Default: 500 headers

    // Decay
    pub decay_interval: Duration,          // Default: 60s
    pub storage_target_mb: u64,            // Default: 500 MB

    // Contribution
    pub contribution_enabled: bool,        // Default: true
    pub seeding_mode: SeedingMode,         // Default: ViewedContent
    pub bandwidth_limit_mbps: u32,         // Default: 10

    // Mobile
    pub mobile_mode: bool,                 // Default: false (auto-detect)
    pub wifi_only_sync: bool,              // Default: true for mobile
    pub cellular_budget_mb: u64,           // Default: 100 MB/month
}
```

### 3.3 Lifecycle

#### 3.3.1 Startup Sequence

```
1. LOAD IDENTITY
   ├── Read encrypted identity from data_dir
   ├── Prompt for password (if interactive)
   └── Decrypt and verify keypair

2. OPEN STORAGE
   ├── Open/create ChainStore (sled)
   ├── Open/create BlobStore
   ├── Initialize LruCache with profile
   └── Open/create ContributionStore

3. INITIALIZE SUBSYSTEMS
   ├── Create GossipManager with seen_cache
   ├── Create ChainSyncer with stores
   ├── Create ContentRetrievalManager
   └── Create ContributionManager

4. BIND NETWORK
   ├── Create TcpTransport
   ├── Bind to listen_addr
   ├── Create ConnectionManager
   └── Log listen address

5. BOOTSTRAP
   ├── Load cached peers from PeerStore
   ├── Discover local peers via mDNS (on by default)
   ├── If insufficient, connect to seed nodes
   ├── Query the DHT for additional peers
   ├── Perform peer exchange (GETADDR/ADDR)
   └── Verify minimum peers connected

6. INITIAL SYNC
   ├── Request headers from best peer
   ├── Validate and store headers
   ├── Download relevant blocks
   └── Update chain tip

7. START BACKGROUND TASKS
   ├── Sync loop (continuous)
   ├── Decay tick (periodic)
   ├── Contribution recording (periodic)
   ├── Keepalive ping (periodic)
   └── Peer maintenance (periodic)

8. READY
   └── Accept connections and process messages
```

#### 3.3.2 Shutdown Sequence

```
1. SIGNAL SHUTDOWN
   ├── Set shutdown flag
   └── Cancel all background tasks

2. DRAIN CONNECTIONS
   ├── Stop accepting new connections
   ├── Send graceful disconnect to peers
   └── Wait for pending messages (timeout: 5s)

3. PERSIST STATE
   ├── Flush pending writes to storage
   ├── Save peer cache
   ├── Save contribution records
   └── Sync storage to disk

4. CLOSE RESOURCES
   ├── Close network listener
   ├── Close all connections
   └── Close storage handles

5. EXIT
```

### 3.4 Public API

```rust
impl NodeManager {
    /// Create a new node with configuration
    pub async fn new(config: NodeConfig, identity: Identity) -> Result<Self, NodeError>;

    /// Start the node (non-blocking, returns immediately)
    pub async fn start(&self) -> Result<(), NodeError>;

    /// Run the node (blocking, runs until shutdown)
    pub async fn run(&self) -> Result<(), NodeError>;

    /// Stop the node gracefully
    pub async fn stop(&self) -> Result<(), NodeError>;

    /// Get node status
    pub fn status(&self) -> NodeStatus;

    /// Get peer list
    pub fn peers(&self) -> Vec<PeerInfo>;

    /// Connect to a specific peer
    pub async fn connect(&self, addr: SocketAddr) -> Result<(), NodeError>;

    /// Disconnect from a peer
    pub async fn disconnect(&self, peer_id: &[u8; 32]) -> Result<(), NodeError>;

    /// Submit local content (post, reply, reaction)
    pub async fn submit_content(&self, content: ContentItem) -> Result<ContentId, NodeError>;

    /// Retrieve content by hash
    pub async fn get_content(&self, hash: &ContentBlobHash) -> Result<Option<Vec<u8>>, NodeError>;

    /// Get sync status
    pub fn sync_status(&self) -> SyncStatus;

    /// Get contribution metrics
    pub fn contribution_status(&self) -> ContributionStatus;
}
```

---

## 4. Connection Management

### 4.1 Peer Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| Max inbound | 100 | Prevent resource exhaustion |
| Max outbound | 25 | Active connections we maintain |
| Target peers | 25 | Desired total connections |
| Min peers | 8 | Minimum before bootstrap |

### 4.2 Connection Lifecycle

```
NEW CONNECTION
     │
     ▼
 [HANDSHAKE]─────timeout 30s────▶ [REJECT]
     │
     │ VERSION/VERACK complete
     ▼
 [ESTABLISHED]
     │
     ├── PING/PONG keepalive (120s interval)
     ├── Message processing
     └── Contribution tracking
     │
     ▼ (error, timeout, shutdown)
 [CLOSED]
     │
     └── Remove from peer list
     └── Update peer score
     └── Record contribution
```

### 4.3 Peer Selection

When we need more peers:

```rust
fn select_peers_to_connect(&self) -> Vec<PeerAddress> {
    let mut candidates = self.peer_store.get_all_peers();

    // Filter out already connected
    candidates.retain(|p| !self.is_connected(&p.node_id));

    // Sort by score (descending), then by last_success (descending)
    candidates.sort_by(|a, b| {
        b.score.cmp(&a.score)
            .then(b.last_success.cmp(&a.last_success))
    });

    // Take up to (target_peers - current_peers)
    let needed = self.config.target_peers.saturating_sub(self.connection_count());
    candidates.truncate(needed);

    candidates
}
```

### 4.4 Connection Events

```rust
pub enum ConnectionEvent {
    Connected {
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection,
    },
    Disconnected {
        peer_id: [u8; 32],
        reason: DisconnectReason,
    },
    MessageReceived {
        peer_id: [u8; 32],
        message: MessageEnvelope,
    },
    Error {
        peer_id: [u8; 32],
        error: ConnectionError,
    },
}
```

---

## 5. Message Routing

### 5.1 Message Types and Handlers

| Message Type | Handler | Action |
|--------------|---------|--------|
| PING | Keepalive | Reply with PONG |
| PONG | Keepalive | Update last_seen |
| VERSION | Handshake | Already handled in transport |
| VERACK | Handshake | Already handled in transport |
| GETADDR | Discovery | Return known peers |
| ADDR | Discovery | Store new peers |
| GETBLOCKS | Sync | Return block hashes |
| BLOCKS | Sync | Process block batch |
| GETHEADERS | Sync | Return headers |
| HEADERS | Sync | Process header batch |
| INV | Gossip | Check seen, request missing |
| GETDATA | Gossip | Return requested items |
| DATA | Gossip | Process and forward |
| WHO_HAS | Content | Check local, reply I_HAVE |
| I_HAVE | Content | Update availability map |
| GET | Content | Return content data |
| DATA (content) | Content | Store and verify |
| NOTFOUND | Content | Try next peer |
| CONTRIBUTION_CLAIM | Social | Verify and store |
| CONTRIBUTION_ATTEST | Social | Validate and aggregate |

### 5.2 Router Implementation

```rust
pub struct MessageRouter {
    gossip: Arc<GossipManager>,
    syncer: Arc<ChainSyncer>,
    content: Arc<ContentRetrievalManager>,
    discovery: Arc<DiscoveryManager>,
    contribution: Arc<ContributionManager>,
}

impl MessageRouter {
    pub async fn route(&self, peer_id: &[u8; 32], msg: MessageEnvelope) -> Result<Option<MessageEnvelope>, RouteError> {
        match msg.message_type {
            // Keepalive
            MSG_PING => Ok(Some(create_pong(&msg))),
            MSG_PONG => { self.record_pong(peer_id); Ok(None) }

            // Discovery
            MSG_GETADDR => Ok(Some(self.discovery.handle_getaddr(peer_id).await?)),
            MSG_ADDR => { self.discovery.handle_addr(peer_id, &msg).await?; Ok(None) }

            // Sync
            MSG_GETHEADERS => Ok(Some(self.syncer.handle_getheaders(&msg).await?)),
            MSG_HEADERS => { self.syncer.handle_headers(peer_id, &msg).await?; Ok(None) }
            MSG_GETBLOCKS => Ok(Some(self.syncer.handle_getblocks(&msg).await?)),
            MSG_BLOCKS => { self.syncer.handle_blocks(peer_id, &msg).await?; Ok(None) }

            // Gossip
            MSG_INV => Ok(self.gossip.handle_inv(peer_id, &msg).await?),
            MSG_GETDATA => Ok(self.gossip.handle_getdata(peer_id, &msg).await?),
            MSG_DATA => { self.gossip.handle_data(peer_id, &msg).await?; Ok(None) }

            // Content
            MSG_WHO_HAS => Ok(self.content.handle_who_has(peer_id, &msg).await?),
            MSG_I_HAVE => { self.content.handle_i_have(peer_id, &msg).await?; Ok(None) }
            MSG_GET => Ok(self.content.handle_get(peer_id, &msg).await?),
            MSG_DATA_CONTENT => { self.content.handle_data(peer_id, &msg).await?; Ok(None) }
            MSG_NOTFOUND => { self.content.handle_notfound(peer_id, &msg).await?; Ok(None) }

            // Social Layer
            MSG_CONTRIBUTION_CLAIM => { self.contribution.handle_claim(peer_id, &msg).await?; Ok(None) }
            MSG_CONTRIBUTION_ATTEST => { self.contribution.handle_attest(peer_id, &msg).await?; Ok(None) }

            _ => Err(RouteError::UnknownMessageType(msg.message_type)),
        }
    }
}
```

---

## 6. Background Tasks

### 6.1 Task List

| Task | Interval | Purpose |
|------|----------|---------|
| Sync Loop | 30s | Check for new blocks, sync if behind |
| Decay Tick | 60s | Process content decay, prune if needed |
| Peer Maintenance | 60s | Check peer count, reconnect if needed |
| Contribution Record | 300s (5min) | Sample uptime, record bandwidth |
| Keepalive | 120s | Send PING to idle connections |
| Cache Cleanup | 600s (10min) | Evict old entries if over threshold |
| Availability Announce | 300s (5min) | Announce seeding availability |

### 6.2 Task Runner

```rust
pub struct BackgroundTaskRunner {
    tasks: Vec<JoinHandle<()>>,
    shutdown: watch::Receiver<bool>,
}

impl BackgroundTaskRunner {
    pub fn spawn_all(&mut self, node: &NodeManager) {
        // Sync loop
        self.spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(SYNC_INTERVAL) => {
                        if let Err(e) = node.syncer.sync_once().await {
                            tracing::warn!("Sync error: {}", e);
                        }
                    }
                    _ = shutdown.changed() => break,
                }
            }
        });

        // Decay tick
        self.spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(DECAY_INTERVAL) => {
                        if let Err(e) = node.decay_engine.tick().await {
                            tracing::warn!("Decay tick error: {}", e);
                        }
                    }
                    _ = shutdown.changed() => break,
                }
            }
        });

        // ... other tasks ...
    }

    pub async fn shutdown(&mut self) {
        for task in self.tasks.drain(..) {
            task.abort();
        }
    }
}
```

### 6.3 Sync Loop Details

```
SYNC LOOP (every 30s)
│
├── Check current chain tip
├── Request headers from random peer
│
├── If new headers:
│   ├── Validate header chain
│   ├── If valid: store and continue
│   └── If invalid: disconnect peer, try another
│
├── If behind by > 100 blocks:
│   ├── Enter "initial sync" mode
│   └── Aggressive batching from multiple peers
│
├── If fork detected:
│   ├── Find common ancestor
│   ├── Evaluate fork rules (SPEC_05)
│   └── Switch chain if necessary
│
└── Update sync status for API
```

### 6.4 Decay Tick Details

```
DECAY TICK (every 60s)
│
├── Calculate current storage usage
├── Determine effective decay rate (adaptive, SPEC_02 v0.4.0)
│
├── For each content item:
│   ├── Calculate survival probability
│   ├── If decayed (probability < threshold):
│   │   ├── Create tombstone (if configured)
│   │   └── Mark for deletion
│   └── Update heat based on recent engagement
│
├── If over storage target:
│   ├── Select candidates by eviction priority
│   └── Delete until under threshold
│
└── Log decay statistics
```

---

## 7. Error Handling

### 7.1 Error Categories

| Category | Examples | Recovery |
|----------|----------|----------|
| Network | Connection refused, timeout | Retry with backoff, try other peers |
| Protocol | Invalid message, checksum fail | Disconnect peer, report |
| Storage | I/O error, corruption | Log, attempt recovery, may shutdown |
| Crypto | Invalid signature, PoW fail | Reject message, continue |
| Resource | Memory exhausted, too many files | Reduce connections, evict cache |

### 7.2 Node Error Type

```rust
pub enum NodeError {
    // Lifecycle
    AlreadyRunning,
    NotRunning,
    ShutdownFailed(String),

    // Network
    BindFailed(SocketAddr, io::Error),
    ConnectionFailed(SocketAddr, TransportError),
    NoAvailablePeers,

    // Storage
    StorageOpen(PathBuf, sled::Error),
    StorageWrite(String),
    StorageRead(String),

    // Identity
    IdentityNotFound,
    IdentityDecryptionFailed,

    // Sync
    SyncFailed(SyncError),
    ForkConflict(ForkIdentifier),

    // Content
    ContentNotFound(ContentBlobHash),
    ContentVerificationFailed,

    // Configuration
    InvalidConfig(String),
}
```

### 7.3 Recovery Strategies

```rust
impl NodeManager {
    async fn handle_peer_error(&self, peer_id: &[u8; 32], error: &ConnectionError) {
        match error {
            ConnectionError::Timeout => {
                // Increase timeout for this peer
                self.peer_store.record_slow_peer(peer_id);
            }
            ConnectionError::ProtocolViolation(_) => {
                // Ban peer temporarily
                self.peer_store.record_failure(peer_id);
                if self.peer_store.failure_count(peer_id) > 3 {
                    self.peer_store.ban(peer_id, Duration::from_secs(3600));
                }
            }
            ConnectionError::Closed => {
                // Normal disconnect, no action
            }
        }

        // Ensure we maintain minimum peers
        if self.connection_count() < self.config.min_peers {
            self.bootstrap_more_peers().await;
        }
    }
}
```

---

## 8. Metrics and Observability

### 8.1 Node Metrics

```rust
pub struct NodeMetrics {
    // Uptime
    pub started_at: Instant,

    // Network
    pub peers_connected: usize,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub messages_sent: u64,
    pub messages_received: u64,

    // Sync
    pub chain_height: u64,
    pub chain_tip_hash: [u8; 32],
    pub blocks_synced: u64,
    pub sync_lag_seconds: f64,

    // Content
    pub content_items_stored: u64,
    pub content_bytes_stored: u64,
    pub content_items_served: u64,
    pub content_bytes_served: u64,

    // Decay
    pub items_decayed: u64,
    pub last_decay_tick: Instant,
    pub storage_usage_bytes: u64,
    pub storage_usage_percent: f32,

    // Contribution
    pub achievements_earned: u32,
    pub bandwidth_served_30d: u64,
    pub uptime_ratio: f32,
    pub current_streak: u32,
}
```

### 8.2 Status Endpoint

```rust
pub struct NodeStatus {
    pub state: NodeState,          // Starting, Running, Syncing, Stopping
    pub uptime_seconds: u64,
    pub peers: usize,
    pub chain_height: u64,
    pub sync_percent: f32,         // 0.0-100.0
    pub storage_used_mb: u64,
    pub storage_percent: f32,
    pub achievements_earned: u32,
}

pub enum NodeState {
    Starting,
    Bootstrapping,
    Syncing,
    Running,
    Stopping,
    Stopped,
}
```

### 8.3 Logging

All operations should log at appropriate levels:

| Level | Examples |
|-------|----------|
| ERROR | Storage corruption, unrecoverable errors |
| WARN | Peer disconnect, sync timeout, high latency |
| INFO | Node started, peer connected, sync complete |
| DEBUG | Message received, block validated |
| TRACE | Wire protocol details, cache hits |

---

## 9. CLI Integration

### 9.1 Node Commands

Extend the `cs` CLI with node management commands:

```bash
# Start a node
cs node start [--listen <addr>] [--connect <peer>] [--background]

# Stop a running node
cs node stop

# Check node status
cs node status [--json]

# List connected peers
cs node peers [--json]

# Connect to a specific peer
cs node connect <addr>

# Disconnect from a peer
cs node disconnect <peer_id>

# Sync status
cs node sync [--json]

# Contribution status
cs node contribution [--json]
```

### 9.2 Example Session

```bash
# Terminal 1: Start first node
$ cs node start --listen 127.0.0.1:9735
Node started on 127.0.0.1:9735
Identity: cs1qz8h...
Chain height: 0 (genesis)
Waiting for peers...

# Terminal 2: Start second node, connect to first
$ cs node start --listen 127.0.0.1:9736 --connect 127.0.0.1:9735
Node started on 127.0.0.1:9736
Identity: cs1qy4k...
Connecting to 127.0.0.1:9735...
Connected! Syncing...
Chain height: 0 (synced)

# Terminal 2: Create a post
$ cs post create --content "Hello from node 2!"
Mining PoW... [========>     ] 45%
Post created: sha256:7a4f2e...
Broadcasting to 1 peers...

# Terminal 1: Should see the post propagate
[INFO] Received INV from cs1qy4k... (1 item)
[INFO] Requesting content sha256:7a4f2e...
[INFO] Stored new post sha256:7a4f2e...

# Terminal 1: View the post
$ cs post view sha256:7a4f2e...
Post: sha256:7a4f2e...
Author: cs1qy4k...
Content: Hello from node 2!
Created: 2025-12-26T10:15:23Z
```

---

## 10. Deployment Topologies

### 10.1 Development (Local)

```
[Node A :9735]◄─────►[Node B :9736]
      │
      ▼
[Node C :9737]
```

Three local nodes for basic testing. No external network.

### 10.2 Testnet (Seed Nodes)

```
                    [Seed 1 (DigitalOcean)]
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
[Seed 2 (Vultr)]   [Seed 3 (Linode)]  [Seed 4 (Hetzner)]
         │                 │                 │
         └────────┬────────┴────────┬────────┘
                  ▼                 ▼
            [User Node]       [User Node]
```

Seed nodes on cheap VPS instances (~$5/month each). Geographic distribution for resilience.

### 10.3 Production (Self-Sustaining)

```
                      DHT / Peer Exchange
                             │
    ┌────────────┬───────────┼───────────┬────────────┐
    ▼            ▼           ▼           ▼            ▼
[Desktop]   [Desktop]   [Mobile]    [Desktop]   [Mobile]
    │            │           │           │            │
    └────────────┴───────────┴───────────┴────────────┘
                    Mesh Connections
```

No special nodes. Every participant is equal. Seeds may be retired once network is self-sustaining.

---

## 11. Security Considerations

### 11.1 Network-Level

| Threat | Mitigation |
|--------|------------|
| Eclipse attack | Diverse peer selection, reputation scoring |
| DoS (connection flood) | Max connection limits, rate limiting |
| DoS (message flood) | Seen cache, peer banning |
| Sybil peers | Contribution-based scoring, identity PoW |
| Man-in-middle | Message signatures, optional TLS |

### 11.2 Resource Protection

| Resource | Protection |
|----------|------------|
| CPU | PoW verification limits, async processing |
| Memory | Bounded caches, connection limits |
| Disk | Storage profiles, decay, eviction |
| Bandwidth | Rate limiting, seeding caps |

### 11.3 Privacy

| Concern | Approach |
|---------|----------|
| IP disclosure | Optional Tor/I2P transport |
| Activity correlation | No metadata leakage in protocol |
| Content visibility | All content is public by design |

---

## 12. Testing Requirements

### 12.1 Unit Tests

- NodeManager lifecycle (start/stop/restart)
- ConnectionManager limits and selection
- MessageRouter dispatch
- Background task scheduling
- Error recovery

### 12.2 Integration Tests

- Two-node connection and sync
- Three-node gossip propagation
- Partition and recovery
- Mobile simulation (throttled CPU/bandwidth)

### 12.3 Stress Tests

- 100 simultaneous connections
- 10,000 messages per second
- Chain sync from 100K blocks
- Content retrieval under high load

---

## 13. Implementation Milestones

See ROADMAP.md Phase 8 for detailed milestones:

| Milestone | Description | Deliverables |
|-----------|-------------|--------------|
| 8.1 | Node Core | NodeManager, NodeConfig, lifecycle |
| 8.2 | Connection Management | ConnectionManager, limits, reconnection |
| 8.3 | Message Routing | MessageRouter, handler dispatch |
| 8.4 | Background Tasks | TaskRunner, sync loop, decay tick |
| 8.5 | CLI Integration | `cs node` commands |
| 8.6 | Multi-Node Testing | Local network, integration tests |
| 8.7 | Seed Node Deployment | VPS setup, geographic distribution |
| 8.8 | Testnet Launch | Public seed nodes, documentation |

---

## 14. Open Questions

### 14.1 Resolved

- Q: How do subsystems communicate?
- A: Through the NodeManager facade. Subsystems receive Arc references to shared state.

### 14.2 Pending

- Q: How to handle node identity vs user identity?
  - Currently: Node uses same identity as user
  - Alternative: Separate ephemeral node identity

- Q: Background vs foreground mode?
  - Currently: Single mode (blocking run)
  - Alternative: Daemon mode with IPC

- Q: Hot restart (identity swap)?
  - Currently: Requires full restart
  - Alternative: Support identity change at runtime

---

## Appendix A: Message Flow Diagrams

### A.1 Content Creation Flow

```
User creates post via CLI/API
         │
         ▼
NodeManager.submit_content()
         │
         ├── Compute PoW (local)
         ├── Sign content (local)
         ├── Store in ChainStore
         ├── Store blob in BlobStore
         │
         ▼
GossipManager.broadcast()
         │
         ├── Create INV message
         ├── Select GOSSIP_FANOUT peers
         └── Send INV to each
         │
         ▼
Peer receives INV
         │
         ├── Check seen_cache
         ├── If new: send GETDATA
         └── Receive DATA, verify, forward
```

### A.2 Content Retrieval Flow

```
User requests content via CLI/API
         │
         ▼
NodeManager.get_content(hash)
         │
         ├── Check BlobStore (local cache)
         │   └── If found: return immediately
         │
         ▼
ContentManager.fetch(hash)
         │
         ├── Check PeerAvailabilityMap
         │   └── If known peers: skip WHO_HAS
         │
         ├── Send WHO_HAS to connected peers
         ├── Receive I_HAVE responses
         │
         ├── Select peer (prefer high score)
         ├── Send GET request
         │
         ▼
Receive DATA
         │
         ├── Verify hash matches content
         ├── Store in BlobStore
         └── Return to caller
```

---

## Appendix B: Configuration Reference

### B.1 Default Values

| Config | Default | Range | Description |
|--------|---------|-------|-------------|
| listen_addr | 0.0.0.0:9735 | valid addr | Bind address |
| max_connections | 125 | 10-1000 | Max total connections |
| min_peers | 8 | 1-100 | Minimum peers |
| target_peers | 25 | 8-200 | Target peer count |
| sync_interval | 30s | 10s-5min | Sync loop interval |
| decay_interval | 60s | 30s-5min | Decay tick interval |
| storage_target_mb | 500 | 100-10000 | Target storage |
| bandwidth_limit_mbps | 10 | 1-100 | Upload limit |

### B.2 Environment Variables

```bash
# Override data directory
CHAINSOCIAL_DATA_DIR=/path/to/data

# Override listen address
CHAINSOCIAL_LISTEN_ADDR=0.0.0.0:9735

# Log level
RUST_LOG=swimchain=debug,swimchain::gossip=trace

# Mobile mode
CHAINSOCIAL_MOBILE=true
```

---

*Document created: 2025-12-26*
*Last updated: 2025-12-26*
*Status: Draft - ready for implementation*
