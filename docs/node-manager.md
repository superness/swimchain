# Node Manager Design Document

This document describes the design of the Swimchain Node Manager - the central orchestrator that connects all subsystems into a running network node.

## Overview

The Node Manager is the "main loop" of a Swimchain node. It:

1. **Orchestrates** existing subsystems (transport, gossip, sync, content, social layer)
2. **Manages** network connections and peer lifecycle
3. **Routes** incoming messages to appropriate handlers
4. **Schedules** background tasks (sync, decay, contribution tracking)
5. **Provides** a unified API for CLI and GUI clients

## Problem Statement

As of Phase 7, Swimchain has all the building blocks:

| Component | Location | Status |
|-----------|----------|--------|
| Identity System | `src/identity/` | ✅ Complete |
| PoW Engine | `src/crypto/` | ✅ Complete |
| Decay Engine | `src/content/decay.rs` | ✅ Complete |
| Block Production | `src/blocks/` | ✅ Complete |
| Storage Layer | `src/storage/` | ✅ Complete |
| Wire Protocol | `src/network/` | ✅ Complete |
| TCP Transport | `src/transport/` | ✅ Complete |
| Peer Discovery | `src/discovery/` | ✅ Complete |
| Chain Sync | `src/sync/` | ✅ Complete |
| Gossip Protocol | `src/gossip/` | ✅ Complete |
| Content Distribution | `src/content/` | ✅ Complete |
| Social Layer | `src/contribution/`, `src/level/` | ✅ Complete |

**What's missing:** The code that ties these together and runs continuously.

Currently:
- `cs identity create` creates an identity (works)
- `cs post create` creates a post locally (works)
- `cs sync status` returns "Network integration pending"

We can create content but can't share it with anyone.

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────┐
│                     NodeManager                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Connection  │  │   Message    │  │  Background  │   │
│  │   Manager    │  │    Router    │  │    Tasks     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │            │
│         ▼                 ▼                 ▼            │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 Subsystem Layer                   │   │
│  │                                                   │   │
│  │  Transport │ Gossip │ Sync │ Content │ Social    │   │
│  └──────────────────────────────────────────────────┘   │
│         │                 │                 │            │
│         ▼                 ▼                 ▼            │
│  ┌──────────────────────────────────────────────────┐   │
│  │                  Storage Layer                    │   │
│  │                                                   │   │
│  │    ChainStore │ BlobStore │ LruCache │ PeerStore │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Module Layout

```
src/
├── node/
│   ├── mod.rs              // Module exports
│   ├── manager.rs          // NodeManager struct and lifecycle
│   ├── config.rs           // NodeConfig
│   ├── connections.rs      // ConnectionManager
│   ├── router.rs           // MessageRouter
│   ├── tasks.rs            // BackgroundTaskRunner
│   ├── metrics.rs          // NodeMetrics
│   └── error.rs            // NodeError
└── bin/
    └── cs.rs               // CLI binary (add node commands)
```

## Component Details

### NodeManager

The central struct that owns all subsystems:

```rust
pub struct NodeManager {
    config: NodeConfig,
    identity: Identity,

    // Network layer
    transport: TcpTransport,
    connections: ConnectionManager,

    // Protocol layers (Arc for sharing across async tasks)
    gossip: Arc<GossipManager>,
    syncer: Arc<ChainSyncer>,
    content: Arc<ContentRetrievalManager>,

    // Social layer
    contribution: Arc<ContributionManager>,
    level: Arc<LevelManager>,

    // Storage
    chain_store: Arc<ChainStore>,
    blob_store: Arc<BlobStore>,
    peer_store: Arc<PeerStore>,

    // Runtime
    tasks: BackgroundTaskRunner,
    shutdown_tx: watch::Sender<bool>,
    shutdown_rx: watch::Receiver<bool>,

    // State
    state: RwLock<NodeState>,
    metrics: RwLock<NodeMetrics>,
}
```

### Lifecycle

```
new() → start() → run() → stop()
  │        │        │        │
  │        │        │        └─ Graceful shutdown
  │        │        └─ Main loop (blocking)
  │        └─ Start background tasks
  └─ Initialize subsystems
```

#### Startup Sequence

```rust
impl NodeManager {
    pub async fn start(&self) -> Result<(), NodeError> {
        // 1. Bind network
        self.transport.bind(&self.config.listen_addr).await?;
        tracing::info!("Listening on {}", self.config.listen_addr);

        // 2. Bootstrap peers
        self.bootstrap_peers().await?;

        // 3. Initial sync
        self.initial_sync().await?;

        // 4. Start background tasks
        self.tasks.spawn_all(self);

        // 5. Mark as running
        *self.state.write().await = NodeState::Running;

        Ok(())
    }
}
```

### ConnectionManager

Manages peer connections with limits and lifecycle:

```rust
pub struct ConnectionManager {
    connections: RwLock<HashMap<[u8; 32], Connection>>,
    max_inbound: usize,
    max_outbound: usize,
    target_peers: usize,
    min_peers: usize,
}

impl ConnectionManager {
    /// Accept an incoming connection (if under limit)
    pub async fn accept(&self, conn: Connection) -> Result<(), ConnectionError>;

    /// Initiate outbound connection
    pub async fn connect(&self, addr: SocketAddr) -> Result<(), ConnectionError>;

    /// Get all active connections
    pub fn active(&self) -> Vec<&Connection>;

    /// Send message to specific peer
    pub async fn send(&self, peer_id: &[u8; 32], msg: MessageEnvelope) -> Result<(), ConnectionError>;

    /// Broadcast message to all peers
    pub async fn broadcast(&self, msg: MessageEnvelope);

    /// Disconnect a peer
    pub async fn disconnect(&self, peer_id: &[u8; 32], reason: DisconnectReason);
}
```

### MessageRouter

Dispatches incoming messages to handlers:

```rust
pub struct MessageRouter {
    gossip: Arc<GossipManager>,
    syncer: Arc<ChainSyncer>,
    content: Arc<ContentRetrievalManager>,
    discovery: Arc<DiscoveryManager>,
    contribution: Arc<ContributionManager>,
    level: Arc<LevelManager>,
}

impl MessageRouter {
    pub async fn route(
        &self,
        peer_id: &[u8; 32],
        msg: MessageEnvelope,
    ) -> Result<Option<MessageEnvelope>, RouteError> {
        match msg.message_type {
            // Return response to send, or None if handled
            MSG_PING => Ok(Some(self.handle_ping(&msg))),
            MSG_GETADDR => Ok(Some(self.discovery.handle_getaddr(peer_id).await?)),
            MSG_INV => Ok(self.gossip.handle_inv(peer_id, &msg).await?),
            // ... etc
        }
    }
}
```

### Background Tasks

Periodic operations that run in the background:

```rust
pub struct BackgroundTaskRunner {
    handles: Vec<JoinHandle<()>>,
    shutdown: watch::Receiver<bool>,
}

impl BackgroundTaskRunner {
    pub fn spawn_all(&mut self, node: &NodeManager) {
        self.spawn_sync_loop(node);
        self.spawn_decay_tick(node);
        self.spawn_peer_maintenance(node);
        self.spawn_contribution_recorder(node);
        self.spawn_keepalive(node);
        self.spawn_availability_announcer(node);
    }

    fn spawn_sync_loop(&mut self, node: &NodeManager) {
        let syncer = node.syncer.clone();
        let mut shutdown = self.shutdown.clone();

        self.handles.push(tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if let Err(e) = syncer.sync_once().await {
                            tracing::warn!("Sync error: {}", e);
                        }
                    }
                    _ = shutdown.changed() => break,
                }
            }
        }));
    }
}
```

## Main Loop

The core event loop that processes network events:

```rust
impl NodeManager {
    pub async fn run(&self) -> Result<(), NodeError> {
        let mut shutdown = self.shutdown_rx.clone();

        loop {
            tokio::select! {
                // Accept new connection
                conn = self.transport.accept() => {
                    if let Ok(conn) = conn {
                        self.handle_new_connection(conn).await;
                    }
                }

                // Process message from existing connection
                event = self.connections.next_event() => {
                    match event {
                        ConnectionEvent::Message { peer_id, msg } => {
                            self.handle_message(&peer_id, msg).await;
                        }
                        ConnectionEvent::Disconnected { peer_id, reason } => {
                            self.handle_disconnect(&peer_id, reason).await;
                        }
                        ConnectionEvent::Error { peer_id, error } => {
                            self.handle_error(&peer_id, error).await;
                        }
                    }
                }

                // Shutdown signal
                _ = shutdown.changed() => {
                    break;
                }
            }
        }

        self.shutdown_gracefully().await
    }

    async fn handle_message(&self, peer_id: &[u8; 32], msg: MessageEnvelope) {
        match self.router.route(peer_id, msg).await {
            Ok(Some(response)) => {
                // Send response back to peer
                if let Err(e) = self.connections.send(peer_id, response).await {
                    tracing::warn!("Failed to send response: {}", e);
                }
            }
            Ok(None) => {
                // Message handled, no response needed
            }
            Err(e) => {
                tracing::warn!("Route error from {}: {}", hex::encode(peer_id), e);
            }
        }
    }
}
```

## CLI Integration

The `cs node` command group:

```
cs node start     Start the node
cs node stop      Stop a running node
cs node status    Show node status
cs node peers     List connected peers
cs node connect   Connect to a peer
cs node sync      Show sync status
```

### Example Implementation

```rust
// src/cli/commands/node.rs

#[derive(Subcommand)]
pub enum NodeCommands {
    /// Start the node
    Start {
        /// Address to listen on
        #[arg(short, long, default_value = "0.0.0.0:9735")]
        listen: SocketAddr,

        /// Peer to connect to
        #[arg(short, long)]
        connect: Option<SocketAddr>,

        /// Run in background
        #[arg(long)]
        background: bool,
    },

    /// Stop a running node
    Stop,

    /// Show node status
    Status {
        #[arg(long)]
        json: bool,
    },

    /// List connected peers
    Peers {
        #[arg(long)]
        json: bool,
    },

    /// Connect to a specific peer
    Connect {
        addr: SocketAddr,
    },
}

pub async fn execute(cmd: NodeCommands, config: &CliConfig) -> Result<()> {
    match cmd {
        NodeCommands::Start { listen, connect, background } => {
            let identity = load_identity(&config)?;
            let node_config = NodeConfig {
                listen_addr: listen,
                ..Default::default()
            };

            let node = NodeManager::new(node_config, identity).await?;
            node.start().await?;

            if let Some(peer) = connect {
                node.connect(peer).await?;
            }

            println!("Node started on {}", listen);

            if background {
                // Daemonize
            } else {
                // Block until Ctrl+C
                node.run().await?;
            }
        }

        NodeCommands::Status { json } => {
            let status = get_node_status().await?;
            if json {
                println!("{}", serde_json::to_string_pretty(&status)?);
            } else {
                println!("State: {:?}", status.state);
                println!("Uptime: {}s", status.uptime_seconds);
                println!("Peers: {}", status.peers);
                println!("Chain Height: {}", status.chain_height);
                println!("Sync: {:.1}%", status.sync_percent);
            }
        }

        // ... other commands
    }
    Ok(())
}
```

## Testing Strategy

### Unit Tests

```rust
#[tokio::test]
async fn test_node_lifecycle() {
    let config = NodeConfig::default();
    let identity = Identity::generate_test();
    let node = NodeManager::new(config, identity).await.unwrap();

    // Start
    node.start().await.unwrap();
    assert_eq!(node.status().state, NodeState::Running);

    // Stop
    node.stop().await.unwrap();
    assert_eq!(node.status().state, NodeState::Stopped);
}

#[tokio::test]
async fn test_message_routing() {
    let router = MessageRouter::new(/* ... */);

    let ping = MessageEnvelope::new_fork_agnostic(MSG_PING, vec![1, 2, 3, 4, 5, 6, 7, 8]);
    let result = router.route(&[0u8; 32], ping).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().message_type, MSG_PONG);
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_two_nodes_connect() {
    let node1 = spawn_test_node(9735).await;
    let node2 = spawn_test_node(9736).await;

    node2.connect("127.0.0.1:9735".parse().unwrap()).await.unwrap();

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(node1.peers().len(), 1);
    assert_eq!(node2.peers().len(), 1);
}

#[tokio::test]
async fn test_content_propagation() {
    let node1 = spawn_test_node(9735).await;
    let node2 = spawn_test_node(9736).await;
    node2.connect("127.0.0.1:9735".parse().unwrap()).await.unwrap();

    // Create post on node1
    let content = ContentItem::new_post("Hello, network!");
    let content_id = node1.submit_content(content).await.unwrap();

    // Wait for propagation
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Should be visible on node2
    let retrieved = node2.get_content(&content_id).await.unwrap();
    assert!(retrieved.is_some());
}
```

## Performance Considerations

### Connection Limits

| Scenario | Max Connections | Rationale |
|----------|----------------|-----------|
| Desktop | 125 | Good balance of connectivity and resources |
| Mobile | 25 | Limited CPU/battery |
| Testnet seed | 500 | Serve many bootstrap requests |

### Task Scheduling

| Task | Interval | Notes |
|------|----------|-------|
| Sync loop | 30s | Main sync cadence |
| Decay tick | 60s | CPU-intensive, don't run too often |
| Peer maintenance | 60s | Check peer count |
| Contribution | 300s | Sample uptime, record stats |
| Keepalive | 120s | PING idle connections |
| Availability | 300s | Announce seedable content |

### Memory Budget

| Component | Estimate | Notes |
|-----------|----------|-------|
| Connections (125) | ~25 MB | ~200KB per connection buffer |
| Seen cache (10K) | ~5 MB | 32-byte hash + timestamp |
| Peer store (1000) | ~1 MB | Cached peer info |
| Message buffers | ~10 MB | In-flight messages |
| **Total node overhead** | **~40-50 MB** | Excluding storage caches |

## Error Handling

### Recovery Matrix

| Error | Action |
|-------|--------|
| Peer timeout | Disconnect, lower score, try next |
| Invalid message | Disconnect, lower score |
| Storage error | Log, attempt retry, may shutdown |
| Sync failure | Retry with different peer |
| PoW invalid | Reject message, continue |
| No peers | Attempt bootstrap |

### Graceful Degradation

The node should continue operating even if some subsystems fail:

```rust
impl NodeManager {
    async fn sync_loop_iteration(&self) {
        match self.syncer.sync_once().await {
            Ok(_) => {}
            Err(SyncError::NoPeers) => {
                // Try to bootstrap more peers
                if let Err(e) = self.bootstrap_peers().await {
                    tracing::warn!("Bootstrap failed: {}", e);
                }
            }
            Err(SyncError::Timeout) => {
                // Try a different peer next time
                self.syncer.rotate_sync_peer();
            }
            Err(e) => {
                // Log but don't crash
                tracing::error!("Sync error: {}", e);
            }
        }
    }
}
```

## Future Considerations

### Daemon Mode

For production, support running as a system daemon:
- PID file management
- Signal handling (SIGHUP for reload, SIGTERM for shutdown)
- Log rotation
- Health endpoint (HTTP /health)

### IPC

For GUI clients to communicate with a running node:
- Unix domain socket (Linux/macOS)
- Named pipe (Windows)
- JSON-RPC protocol

### Metrics Export

For monitoring dashboards:
- Prometheus metrics endpoint
- StatsD integration
- Custom metrics API

## Related Documents

- [SPEC_10_NODE_OPERATIONS.md](../specs/SPEC_10_NODE_OPERATIONS.md) - Formal specification
- [transport-layer.md](transport-layer.md) - TCP transport details
- [chain-sync.md](chain-sync.md) - Sync protocol
- [gossip-protocol.md](gossip-protocol.md) - Gossip mechanics
- [deployment.md](deployment.md) - Deployment guide

---

*Created: 2025-12-26*
