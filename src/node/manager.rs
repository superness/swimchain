//! NodeManager - Central orchestrator for a running node
//!
//! The NodeManager connects all subsystems and manages the node lifecycle.
//! It provides the main entry point for starting, running, and stopping a node.
//!
//! See SPEC_10 for the full specification.

use std::net::SocketAddr;
use std::sync::{Arc, RwLock};

use log::{debug, info, warn};
use tokio::sync::{broadcast, watch};

use crate::achievement::{AchievementService, AchievementStore};
use crate::blocklist::BlocklistStore;
use crate::blocks::BlockBuilder;
use crate::cli::search_index::SearchIndex;
use crate::content::chunking::ChunkedContentStore;
use crate::content::decay_integration::DecayIntegration;
use crate::content::retrieval::{ContentRetrievalConfig, ContentRetrievalManager};
use crate::dht::{DhtManager, NodeId as DhtNodeId};
use crate::discovery::peer_branches::PeerBranchTracker;
use crate::discovery::PeerStore;
use crate::engagement_graph::EngagementGraphStore;
use crate::identity::KeyPair;
use crate::reputation::ReputationStore;
use crate::rpc::{NodeRef, RpcMethods, RpcServer, RpcServerConfig};
use crate::spam_attestation::SpamAttestationStore;
use crate::sponsorship::storage::SponsorshipStore;
use crate::storage::blob::BlobStore;
use crate::storage::content::PersistentContentStore;
use crate::storage::membership::MembershipStore;
use crate::storage::{AggregationCache, ChainStore};
use crate::sync::subscription::BranchSubscriptionManager;
use crate::sync::{ChainSyncer, SyncConfig, SyncState};
use crate::transport::{ConnectionDirection, LocalNodeInfo, PeerInfo, TcpTransport};
use crate::types::network::{MessageEnvelope, MessageType};
use crate::VERSION;

use super::config::NodeConfig;
use super::connection_event::{ConnectionEvent, DisconnectReason};
use super::connection_manager::{ConnectionConfig, ConnectionManager, ConnectionManagerError};
use super::error::NodeError;
use super::metrics::NodeMetrics;
use super::peer_connections::PeerConnectionPool;
use super::router::MessageRouter;
use super::state::{NodeState, NodeStatus};
use super::tasks::BackgroundTaskRunner;

/// Central node manager - orchestrates all subsystems
///
/// The NodeManager is the main coordinator for a running Swimchain node.
/// It owns references to all subsystems and manages their lifecycle.
///
/// # Example
///
/// ```no_run
/// use swimchain::node::{NodeManager, NodeConfig};
/// use swimchain::identity::KeyPair;
///
/// async fn run() {
///     let config = NodeConfig::default();
///     let keypair = KeyPair::generate();
///     let mut node = NodeManager::new(config, keypair).unwrap();
///
///     node.start().await.unwrap();
///     println!("Node running on {}", node.config().listen_addr);
///
///     // ... node is running ...
///
///     node.stop().await.unwrap();
/// }
/// ```
pub struct NodeManager {
    // Configuration
    config: NodeConfig,
    keypair: KeyPair,
    local_info: LocalNodeInfo,

    // Network (None until start())
    transport: Option<Arc<TcpTransport>>,

    // Subsystems (None until start())
    peer_store: Option<Arc<PeerStore>>,
    connection_manager: Option<Arc<ConnectionManager>>,
    connection_pool: Option<Arc<PeerConnectionPool>>,
    router: Option<Arc<MessageRouter>>,
    syncer: Option<Arc<ChainSyncer>>,
    chain_store: Option<Arc<ChainStore>>,
    content_store: Option<Arc<PersistentContentStore>>,
    content_retrieval: Option<Arc<ContentRetrievalManager>>,
    decay_integration: Option<Arc<DecayIntegration>>,
    block_builder: Option<Arc<RwLock<BlockBuilder>>>,
    blocklist: Option<Arc<RwLock<BlocklistStore>>>,
    fork_registry: Option<Arc<crate::fork::ForkRegistry>>,
    dht: Option<Arc<DhtManager>>,
    aggregation_cache: Option<Arc<AggregationCache>>,
    spam_attestation_store: Option<Arc<SpamAttestationStore>>,
    /// Identity-level poster reputation store (SPEC_12 §3.4/§4.5).
    reputation_store: Option<Arc<ReputationStore>>,
    membership_store: Option<Arc<MembershipStore>>,
    sponsorship_store: Option<Arc<SponsorshipStore>>,
    /// Sponsorship penalty manager (SPEC_11) — node-local penalty policy
    sponsorship_manager: Option<Arc<crate::sponsorship::manager::SponsorshipManager>>,
    offer_store: Option<Arc<crate::sponsorship::offer_store::OfferStore>>,
    engagement_graph: Option<Arc<EngagementGraphStore>>,
    /// Achievement service — awards recognition badges (SPEC_09 §5.3).
    /// Recognition only: grants no protocol privileges.
    achievement_service: Option<Arc<AchievementService>>,
    /// Notification service (SPEC_09 §7): local-user notifications, incl.
    /// CommunityFormed (SPEC_13 Phase 2).
    notification_service: Option<Arc<crate::notification::NotificationService>>,
    branch_subscription_manager: Option<Arc<RwLock<BranchSubscriptionManager>>>,
    peer_branch_tracker: Option<Arc<RwLock<PeerBranchTracker>>>,
    search_index: Option<Arc<RwLock<SearchIndex>>>,

    /// Shared event manager for real-time WebSocket events (H-RPC-2).
    /// Shared between the message router (gossip ingestion) and the RPC server.
    event_manager: Arc<crate::rpc::EventManager>,

    // Runtime state
    state: Arc<RwLock<NodeState>>,
    sync_state: Arc<tokio::sync::RwLock<SyncState>>,
    metrics: RwLock<NodeMetrics>,
    shutdown_tx: watch::Sender<bool>,
    shutdown_rx: watch::Receiver<bool>,
    rpc_shutdown_tx: Option<broadcast::Sender<()>>,
    start_time: Option<std::time::Instant>,

    // Background tasks
    tasks: Option<BackgroundTaskRunner>,

    // RPC Server address (set after start)
    rpc_addr: Option<std::net::SocketAddr>,
}

/// Stores whose contents belong to one specific network (its magic). Cleared when the
/// data dir is opened under a different magic than it was last written for. Deliberately
/// EXCLUDES `identity.enc`/`config.toml` (network-agnostic) and `blocklist` (a user pref).
const NETWORK_SCOPED_DIRS: &[&str] = &[
    "chain",
    "content",
    "sync_blobs",
    "chunked_blobs",
    "aggregation_cache",
    "search_index_v1",
    "engagement_graph",
    "fork_store",
    "membership",
    "sponsorship",
    "offer_store",
    "reputation",
    "spam_attestations",
    "notifications",
    "achievements",
    "peers",
    "pending_broadcast",
];
/// Network-scoped single files (same treatment as `NETWORK_SCOPED_DIRS`).
const NETWORK_SCOPED_FILES: &[&str] = &["mempool.bin", "decay_metadata.json"];

/// Marker file recording the network magic the data dir was last written for.
const NETWORK_MAGIC_MARKER: &str = "network.magic";

/// Network-magic guard for the data dir (see call site in `start`).
///
/// - marker present and EQUAL to `magic`: same network, no-op.
/// - marker present and DIFFERENT: prior hard-forked network — delete the network-scoped
///   stores so stale content/actions can't be loaded, served, or re-gossiped, then restamp.
/// - marker MISSING: treated as "assume current" — write the marker but do NOT wipe, so
///   simply upgrading to this (marker-aware) binary never destroys a node already on the
///   correct network. (Pre-marker stale data is handled by an explicit one-time wipe.)
///
/// Identity and config are never touched.
fn enforce_network_magic(data_dir: &std::path::Path, magic: [u8; 4]) -> std::io::Result<()> {
    let marker = data_dir.join(NETWORK_MAGIC_MARKER);
    match std::fs::read(&marker) {
        Ok(stored) if stored.as_slice() == magic => return Ok(()),
        Ok(stored) => {
            warn!(
                "[NET] data dir was written for network magic {stored:02x?} but this node is \
                 {magic:02x?}; clearing network-scoped stores (identity/config preserved)"
            );
            for dir in NETWORK_SCOPED_DIRS {
                let _ = std::fs::remove_dir_all(data_dir.join(dir));
            }
            for f in NETWORK_SCOPED_FILES {
                let _ = std::fs::remove_file(data_dir.join(f));
            }
        }
        Err(_) => { /* no marker yet: assume current network, stamp without wiping */ }
    }
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(&marker, magic)
}

impl NodeManager {
    /// Create a new NodeManager with the given configuration
    ///
    /// This validates the configuration and prepares the node for startup,
    /// but does not bind to the network or initialize subsystems.
    ///
    /// # Errors
    ///
    /// Returns `NodeError::InvalidConfig` if the configuration is invalid.
    pub fn new(config: NodeConfig, keypair: KeyPair) -> Result<Self, NodeError> {
        config.validate()?;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let local_info = LocalNodeInfo {
            services: 0, // Full node
            height: 0,
            user_agent: format!("swimchain/{}", VERSION),
            relay: true,
            public_key: *keypair.public_key.as_bytes(),
        };

        Ok(Self {
            config,
            keypair,
            local_info,
            transport: None,
            peer_store: None,
            connection_manager: None,
            connection_pool: None,
            router: None,
            syncer: None,
            chain_store: None,
            content_store: None,
            content_retrieval: None,
            decay_integration: None,
            block_builder: None,
            blocklist: None,
            fork_registry: None,
            dht: None,
            aggregation_cache: None,
            spam_attestation_store: None,
            reputation_store: None,
            membership_store: None,
            sponsorship_store: None,
            sponsorship_manager: None,
            offer_store: None,
            engagement_graph: None,
            achievement_service: None,
            notification_service: None,
            branch_subscription_manager: None,
            peer_branch_tracker: None,
            search_index: None,
            event_manager: Arc::new(crate::rpc::EventManager::new()),
            state: Arc::new(RwLock::new(NodeState::Stopped)),
            sync_state: Arc::new(tokio::sync::RwLock::new(SyncState::Idle)),
            metrics: RwLock::new(NodeMetrics::new()),
            shutdown_tx,
            shutdown_rx,
            rpc_shutdown_tx: None,
            start_time: None,
            tasks: None,
            rpc_addr: None,
        })
    }

    // ========== State Access ==========

    /// Get the current node state
    pub fn state(&self) -> NodeState {
        *self.state.read().unwrap()
    }

    /// Get the state Arc (for RPC)
    pub fn state_arc(&self) -> Arc<RwLock<NodeState>> {
        self.state.clone()
    }

    /// Get the sync state Arc (for RPC)
    pub fn sync_state_arc(&self) -> Arc<tokio::sync::RwLock<SyncState>> {
        self.sync_state.clone()
    }

    /// Check if the node is running
    pub fn is_running(&self) -> bool {
        self.state() == NodeState::Running
    }

    /// Get the node configuration
    pub fn config(&self) -> &NodeConfig {
        &self.config
    }

    /// Get this node's session-level identifier.
    ///
    /// Per SPEC_06 §128 + §154: `node_id = SHA-256(public_key)`. This is the
    /// value peers see in our VERSION handshake (`PeerInfo.node_id`).
    pub fn node_id(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        Sha256::digest(self.keypair.public_key.as_bytes()).into()
    }

    // ========== State Transitions ==========

    fn set_state(&self, new_state: NodeState) {
        let current = self.state();
        if current.can_transition_to(new_state) {
            debug!("State transition: {:?} -> {:?}", current, new_state);
            *self.state.write().unwrap() = new_state;
        } else {
            warn!(
                "Invalid state transition attempt: {:?} -> {:?}",
                current, new_state
            );
        }
    }

    // ========== Lifecycle ==========

    /// Start the node
    ///
    /// This performs the full startup sequence:
    /// 1. Open storage
    /// 2. Initialize subsystems
    /// 3. Bind to network
    /// 4. Bootstrap peers
    /// 5. Start background tasks
    ///
    /// After this returns, the node is in the Running state and ready
    /// to process network messages.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Node is already running (`AlreadyRunning`)
    /// - Storage cannot be opened (`StorageOpen`)
    /// - Network binding fails (`BindFailed`)
    pub async fn start(&mut self) -> Result<(), NodeError> {
        if self.state() != NodeState::Stopped {
            return Err(NodeError::AlreadyRunning);
        }

        self.set_state(NodeState::Starting);

        // 0. Reset shutdown channel for restart support
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        self.shutdown_tx = shutdown_tx;
        self.shutdown_rx = shutdown_rx;

        // 0.5. Network-magic guard. Chain-derived stores belong to one specific network
        // (identified by its 4-byte magic). If the data dir was last written for a
        // DIFFERENT magic — i.e. a prior, hard-forked network (e.g. testnet TEST->TES2) —
        // clear the network-scoped stores so we never load, serve, or re-gossip stale
        // content/actions across the fork. Identity + config are network-agnostic and kept.
        // Runs before ANY store opens.
        if let Err(e) = enforce_network_magic(
            &self.config.data_dir,
            crate::network::NetworkContext::magic_bytes(),
        ) {
            log::warn!("[NET] network-magic guard failed (continuing): {e}");
        }

        // 1. Open peer store
        let peer_path = self.config.peer_store_path();
        std::fs::create_dir_all(&peer_path).ok();
        let peer_store = PeerStore::open(&peer_path)
            .map_err(|e| NodeError::StorageOpen(peer_path.clone(), e.to_string()))?;
        let peer_store = Arc::new(peer_store);
        self.peer_store = Some(peer_store.clone());

        // 2. Initialize connection manager
        let conn_config = ConnectionConfig {
            max_inbound: self.config.max_inbound,
            max_outbound: self.config.max_outbound,
            target_peers: self.config.target_peers,
            min_peers: self.config.min_peers,
            ..ConnectionConfig::default()
        };
        let connection_manager = ConnectionManager::new(conn_config, peer_store);
        self.connection_manager = Some(Arc::new(connection_manager));

        // 3. Initialize chain store
        let chain_path = self.config.data_dir.join("chain");
        std::fs::create_dir_all(&chain_path).ok();
        let chain_store = ChainStore::open(&chain_path)
            .map_err(|e| NodeError::StorageOpen(chain_path.clone(), e.to_string()))?;

        // 3.1. Rebuild space content index if needed (first run after upgrade)
        match chain_store.needs_index_rebuild() {
            Ok(true) => {
                info!("[INDEX] Space content index needs rebuilding, this may take a moment...");
                match chain_store.rebuild_space_content_index() {
                    Ok(count) => {
                        info!(
                            "[INDEX] Successfully indexed {} content items for fast lookup",
                            count
                        );
                    }
                    Err(e) => {
                        warn!("[INDEX] Failed to rebuild space content index: {}", e);
                        // Continue anyway - the old full-scan method will work as fallback
                    }
                }
            }
            Ok(false) => {
                debug!("[INDEX] Space content index is up to date");
            }
            Err(e) => {
                warn!("[INDEX] Failed to check index status: {}", e);
            }
        }

        // 3.1b. Ensure branch placement state is built (SPEC_08 §5).
        // Deterministic rebuild from canonical chain data: runs once per
        // BRANCH_STATE_VERSION (first startup after upgrade / fresh node),
        // so every node derives identical branch placements and fracture
        // points regardless of when it upgraded.
        match crate::branch::ensure_branch_state(
            &chain_store,
            crate::branch::BRANCH_FRACTURE_THRESHOLD,
        ) {
            Ok(Some(stats)) => {
                info!(
                    "[BRANCH] Rebuilt branch state from chain: {} blocks registered, {} fractures ({} errors)",
                    stats.blocks_registered, stats.fractures, stats.errors
                );
            }
            Ok(None) => {
                debug!("[BRANCH] Branch state is up to date");
            }
            Err(e) => {
                warn!("[BRANCH] Failed to ensure branch state: {}. Placement indexes may lag until next restart.", e);
            }
        }

        // 3.2. Validate chain integrity and repair if needed (self-healing)
        // This detects and fixes chain corruption (orphaned blocks in height_index)
        // Store orphaned actions to resubmit to block builder later
        let recovered_actions: Vec<_> = match chain_store.repair_chain() {
            Ok(orphaned_actions) => {
                if !orphaned_actions.is_empty() {
                    info!(
                        "[CHAIN-REPAIR] Recovered {} orphaned actions from corrupted chain segment (will resubmit to mempool)",
                        orphaned_actions.len()
                    );
                }
                orphaned_actions
            }
            Err(e) => {
                warn!("[CHAIN-REPAIR] Failed to validate/repair chain: {}. Continuing with potentially corrupt chain.", e);
                Vec::new()
            }
        };

        let chain_store = Arc::new(chain_store);
        self.chain_store = Some(chain_store.clone());

        // Update local_info.height from chain store so VERSION messages advertise correct height
        if let Ok(Some(height)) = chain_store.get_latest_height() {
            self.local_info.height = height as u32;
            info!("[CHAIN-SYNC] Local chain height: {}", height);
        }

        // 3.1a. Initialize content store for reactions (needed by router for block sync)
        let content_store_path = self.config.data_dir.join("content");
        let sync_blob_path = self.config.data_dir.join("sync_blobs");
        std::fs::create_dir_all(&content_store_path).ok();
        std::fs::create_dir_all(&sync_blob_path).ok();
        match PersistentContentStore::open(&content_store_path, &sync_blob_path) {
            Ok(store) => {
                info!("Opened content store at {:?}", content_store_path);
                self.content_store = Some(Arc::new(store));
            }
            Err(e) => {
                warn!(
                    "Failed to open content store: {}. Reaction sync may be unavailable.",
                    e
                );
            }
        }

        // 3.1b. Initialize search index for full-text search.
        // Reindex existing content when the index is behind the content store — content
        // created on an older build (before indexing), synced from peers via the block
        // path, or a wiped/empty index would otherwise be INVISIBLE to search. (Proven:
        // a node can hold N content items with an empty index → search returns nothing.)
        match SearchIndex::open_or_create(&self.config.data_dir) {
            Ok(mut index) => {
                let docs = index.doc_count();
                if let Some(ref cs) = self.content_store {
                    let content_len = cs.len() as u64;
                    if docs < content_len {
                        info!(
                            "[SEARCH] Index has {} docs but node holds {} content items — reindexing…",
                            docs, content_len
                        );
                        let iter = cs.iter_content().filter_map(|r| r.ok()).map(|item| {
                            // Same mapping the network-receive path uses (title = text
                            // before the first blank line; body = the rest).
                            let (title, body) = match &item.body_inline {
                                Some(bi) => match bi.find("\n\n") {
                                    Some(i) => (bi[..i].to_string(), bi[i + 2..].to_string()),
                                    None => (String::new(), bi.clone()),
                                },
                                None => (String::new(), String::new()),
                            };
                            let space_id = {
                                use bech32::{Bech32m, Hrp};
                                let sb = item.space_id.as_bytes();
                                let mut d = Vec::with_capacity(17);
                                d.push(0);
                                d.extend_from_slice(&sb[..16]);
                                bech32::encode::<Bech32m>(Hrp::parse("sp").expect("valid HRP"), &d)
                                    .unwrap_or_else(|_| hex::encode(&sb[..16]))
                            };
                            crate::cli::search_index::IndexableContent {
                                content_id: format!("sha256:{}", hex::encode(item.content_id.0)),
                                space_id,
                                author: crate::crypto::address::encode_address(&item.author_id),
                                title,
                                body,
                                heat: 100.0,
                                timestamp: item.created_at,
                            }
                        });
                        match index.rebuild(iter) {
                            Ok(n) => info!("[SEARCH] Reindexed {} content items", n),
                            Err(e) => warn!("[SEARCH] Reindex failed: {}", e),
                        }
                    }
                }
                info!(
                    "[SEARCH] Opened search index with {} documents",
                    index.doc_count()
                );
                self.search_index = Some(Arc::new(RwLock::new(index)));
            }
            Err(e) => {
                warn!("[SEARCH] Failed to open search index: {}. Search functionality will be limited.", e);
            }
        }

        // 3.2. Initialize aggregation cache for fast metadata lookups
        let agg_cache_path = self.config.data_dir.join("aggregation_cache");
        std::fs::create_dir_all(&agg_cache_path).ok();
        match AggregationCache::open(&agg_cache_path) {
            Ok(agg_cache) => {
                // Rebuild if needed (version mismatch or first run)
                if agg_cache.needs_rebuild().unwrap_or(true) {
                    info!("[AGGREGATION-CACHE] Rebuilding aggregation cache from blockchain...");
                    if let Err(e) = Self::rebuild_aggregation_cache(&agg_cache, &chain_store) {
                        warn!(
                            "[AGGREGATION-CACHE] Failed to rebuild: {}. Will use fallback lookups.",
                            e
                        );
                    } else {
                        if let Err(e) = agg_cache.mark_rebuilt() {
                            warn!("[AGGREGATION-CACHE] Failed to mark rebuilt: {}", e);
                        }
                        let stats = agg_cache.stats();
                        info!(
                            "[AGGREGATION-CACHE] Rebuilt with {} content entries, {} space entries",
                            stats.content_entries, stats.space_entries
                        );
                    }
                } else {
                    let stats = agg_cache.stats();
                    debug!(
                        "[AGGREGATION-CACHE] Loaded {} content entries, {} space entries",
                        stats.content_entries, stats.space_entries
                    );
                }
                self.aggregation_cache = Some(Arc::new(agg_cache));
            }
            Err(e) => {
                warn!(
                    "[AGGREGATION-CACHE] Failed to open: {}. Using fallback lookups.",
                    e
                );
            }
        }

        // 4. Initialize other subsystems
        self.syncer = Some(Arc::new(ChainSyncer::new(SyncConfig::default())));

        // 4.5. Initialize content retrieval manager with sync blob store
        let sync_blob_path = self.config.data_dir.join("sync_blobs");
        std::fs::create_dir_all(&sync_blob_path).ok();
        let sync_blob_store = Arc::new(
            BlobStore::new(&sync_blob_path)
                .map_err(|e| NodeError::StorageOpen(sync_blob_path.clone(), e.to_string()))?,
        );

        // Create chunked content store for large files (uses same blob store)
        let chunked_blob_path = self.config.data_dir.join("chunked_blobs");
        std::fs::create_dir_all(&chunked_blob_path).ok();
        let chunked_store = ChunkedContentStore::at_path(&chunked_blob_path)
            .map_err(|e| NodeError::StorageOpen(chunked_blob_path.clone(), e.to_string()))?;

        let content_retrieval = Arc::new(ContentRetrievalManager::new(
            sync_blob_store.clone(),
            Arc::new(chunked_store),
            ContentRetrievalConfig::default(),
        ));
        self.content_retrieval = Some(content_retrieval.clone());
        info!("[CONTENT-SYNC] Content retrieval manager initialized");

        // 4.5.1. Initialize decay integration for content lifecycle management
        let target_storage_bytes = (self.config.storage_target_mb as u64) * 1024 * 1024;
        let mut decay_integration = DecayIntegration::new(
            self.config.data_dir.clone(),
            sync_blob_store.clone(),
            target_storage_bytes,
        )
        .map_err(|e| NodeError::StorageOpen(self.config.data_dir.clone(), e.to_string()))?;
        // Scan existing blobs and register them for decay tracking
        if let Err(e) = decay_integration.scan_and_register() {
            warn!("[DECAY] Failed to scan existing blobs: {}", e);
        }
        info!(
            "[DECAY] Decay integration initialized with {}MB target storage",
            self.config.storage_target_mb
        );

        // 4.5.2. Initialize blocklist for CSAM/illegal content filtering
        // Wrapped in RwLock to allow network gossip handlers to store updates (C-BLOCKLIST-2)
        let blocklist_path = self.config.data_dir.join("blocklist");
        std::fs::create_dir_all(&blocklist_path).ok();
        match crate::storage::open_db(&blocklist_path) {
            Ok(blocklist_db) => match BlocklistStore::open(Arc::new(blocklist_db)) {
                Ok(blocklist) => {
                    self.blocklist = Some(Arc::new(RwLock::new(blocklist)));
                    info!("[BLOCKLIST] Blocklist store initialized");
                }
                Err(e) => {
                    warn!("[BLOCKLIST] Failed to open blocklist store: {}", e);
                }
            },
            Err(e) => {
                warn!("[BLOCKLIST] Failed to open blocklist database: {}", e);
            }
        }

        // 4.5.2b. Load operator-configured trusted blocklist maintainer keys
        // (SPEC_12 CSAM seeding): updates/bundles signed by these keys are
        // accepted without community attestations.
        match self.config.load_trusted_blocklist_keys() {
            Ok(n) if n > 0 => info!(
                "[BLOCKLIST] Loaded {} trusted list-maintainer key(s) ({} total)",
                n,
                self.config.trusted_blocklist_keys.len()
            ),
            Ok(_) => {}
            Err(e) => warn!("[BLOCKLIST] Failed to load trusted keys: {}", e),
        }

        // 4.5.3. Initialize spam attestation store for community flagging (SPEC_12 §3)
        let spam_path = self.config.data_dir.join("spam_attestations");
        std::fs::create_dir_all(&spam_path).ok();
        match crate::storage::open_db(&spam_path) {
            Ok(spam_db) => {
                let spam_store = Arc::new(SpamAttestationStore::open(spam_db));
                self.spam_attestation_store = Some(spam_store.clone());

                // Wire spam store to decay integration for accelerated decay of flagged content
                decay_integration.set_spam_attestation_store(spam_store.clone());
                info!("[SPAM] Spam attestation store initialized and wired to decay");
            }
            Err(e) => {
                warn!("[SPAM] Failed to open spam attestation database: {}", e);
            }
        }

        // 4.5.3a. Initialize identity-level poster reputation store (SPEC_12 §3.4/§4.5).
        // Fed from the attestation-processing path: when community spam attestations
        // reach threshold, the content author's reputation decays; it recovers over
        // time and on counter-attestation. Reputation is informational/defensive only —
        // it never reduces PoW cost, extends decay, or raises rate limits.
        let reputation_path = self.config.data_dir.join("reputation");
        std::fs::create_dir_all(&reputation_path).ok();
        match crate::storage::open_db(&reputation_path) {
            Ok(reputation_db) => {
                let reputation_store = Arc::new(ReputationStore::open(reputation_db));
                self.reputation_store = Some(reputation_store);
                info!("[REPUTATION] Poster reputation store initialized");
            }
            Err(e) => {
                warn!("[REPUTATION] Failed to open reputation database: {}", e);
            }
        }

        // Wrap decay_integration in Arc after spam store is wired
        let decay_integration = Arc::new(decay_integration);
        self.decay_integration = Some(decay_integration.clone());

        // 4.5.3b. Initialize engagement graph for tracking who engages with whom
        let engagement_path = self.config.data_dir.join("engagement_graph");
        std::fs::create_dir_all(&engagement_path).ok();
        match crate::storage::open_db(&engagement_path) {
            Ok(engagement_db) => {
                let engagement_graph = Arc::new(EngagementGraphStore::open(engagement_db));
                self.engagement_graph = Some(engagement_graph);
                info!("[ENGAGEMENT] Engagement graph store initialized");
            }
            Err(e) => {
                warn!(
                    "[ENGAGEMENT] Failed to open engagement graph database: {}",
                    e
                );
            }
        }

        // 4.5.3b-ii. Initialize achievement service for recognition badges (SPEC_09 §5.3).
        // Recognition ONLY: awards grant no PoW discount, decay extension, or
        // rate-limit change. Deterministic from local data; permanent once earned.
        let achievement_path = self.config.data_dir.join("achievements");
        match crate::storage::open_db(&achievement_path) {
            Ok(achievement_db) => match AchievementStore::new(&achievement_db) {
                Ok(store) => {
                    let service = Arc::new(AchievementService::new(Arc::new(store)));
                    self.achievement_service = Some(service);
                    info!("[ACHIEVEMENT] Achievement service initialized");
                }
                Err(e) => {
                    warn!("[ACHIEVEMENT] Failed to open achievement store: {}", e);
                }
            },
            Err(e) => {
                warn!("[ACHIEVEMENT] Failed to open achievement database: {}", e);
            }
        }

        // 4.5.3b-iii. Initialize notification service (SPEC_09 §7). Local-only
        // light-touch notifications; Phase 2 adds CommunityFormed (SPEC_13)
        // delivered to founding members on this node.
        let notification_path = self.config.data_dir.join("notifications");
        match crate::storage::open_db(&notification_path) {
            Ok(notification_db) => {
                match crate::notification::NotificationService::new(
                    &notification_db,
                    crate::notification::TriggerSources::default(),
                ) {
                    Ok(service) => {
                        self.notification_service = Some(Arc::new(service));
                        info!("[NOTIFICATION] Notification service initialized");
                    }
                    Err(e) => {
                        warn!("[NOTIFICATION] Failed to open notification service: {}", e);
                    }
                }
            }
            Err(e) => {
                warn!("[NOTIFICATION] Failed to open notification database: {}", e);
            }
        }

        // 4.5.3c. Initialize membership store for private spaces (DMs, group chats)
        let membership_path = self.config.data_dir.join("membership");
        match MembershipStore::open(&membership_path) {
            Ok(membership_store) => {
                self.membership_store = Some(Arc::new(membership_store));
                info!("[MEMBERSHIP] Membership store initialized");
            }
            Err(e) => {
                warn!("[MEMBERSHIP] Failed to open membership database: {}", e);
            }
        }

        // 4.5.3d. Initialize sponsorship store for identity sponsorship chain
        let sponsorship_path = self.config.data_dir.join("sponsorship");
        match SponsorshipStore::open(&sponsorship_path) {
            Ok(sponsorship_store) => {
                self.sponsorship_store = Some(Arc::new(sponsorship_store));
                info!("[SPONSORSHIP] Sponsorship store initialized");

                // Rebuild sponsorship tree from chain on startup
                if let Some(ref chain_store) = self.chain_store {
                    if let Ok(Some(height)) = chain_store.get_latest_height() {
                        info!(
                            "[SPONSORSHIP] Rebuilding sponsorship tree from chain (height {})",
                            height
                        );
                        let mut rebuilt_count = 0;

                        for h in 1..=height {
                            if let Ok(actions) = chain_store.get_actions_at_height(h) {
                                info!(
                                    "[SPONSORSHIP] Found {} actions at height {}",
                                    actions.len(),
                                    h
                                );
                                for (_thread_id, _space_id, action, _branch) in actions {
                                    info!("[SPONSORSHIP] Action type: {:?}", action.action_type);
                                    if action.action_type == crate::blocks::ActionType::Sponsor {
                                        if let Some(sponsee_bytes) = action.content_hash {
                                            let sponsor_pk =
                                                crate::types::identity::PublicKey::from_bytes(
                                                    action.actor,
                                                );
                                            let sponsee_pk =
                                                crate::types::identity::PublicKey::from_bytes(
                                                    sponsee_bytes,
                                                );

                                            // Only add if doesn't already exist
                                            if let Ok(false) = self
                                                .sponsorship_store
                                                .as_ref()
                                                .unwrap()
                                                .exists(&sponsee_pk)
                                            {
                                                let depth = match self
                                                    .sponsorship_store
                                                    .as_ref()
                                                    .unwrap()
                                                    .get(&sponsor_pk)
                                                {
                                                    Ok(Some(rec)) => rec.depth.saturating_add(1),
                                                    _ => 1,
                                                };

                                                let stored = crate::sponsorship::types::StoredSponsorship {
                                                    sponsored_identity: sponsee_pk,
                                                    sponsor: Some(sponsor_pk),
                                                    creation_timestamp: action.timestamp,
                                                    status: crate::sponsorship::types::SponsorshipStatus::Active,
                                                    penalty_until: None,
                                                    depth,
                                                    probationary: false,
                                                    probation_expires: None,
                                                    positive_contribution_score: 0,
                                                    is_genesis: false,
                                                    orphaned_at: None,
                                                };

                                                if let Err(e) = self
                                                    .sponsorship_store
                                                    .as_ref()
                                                    .unwrap()
                                                    .put(&stored)
                                                {
                                                    warn!("[SPONSORSHIP] Failed to rebuild sponsorship for {}: {}",
                                                        hex::encode(sponsee_bytes), e);
                                                } else {
                                                    rebuilt_count += 1;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if rebuilt_count > 0 {
                            info!(
                                "[SPONSORSHIP] Rebuilt {} sponsorships from chain",
                                rebuilt_count
                            );
                        }
                    }
                }
            }
            Err(e) => {
                warn!("[SPONSORSHIP] Failed to open sponsorship database: {}", e);
            }
        }

        // 4.5.3e. Initialize offer store for public sponsorship offer lifecycle
        {
            let offer_db_path = self.config.data_dir.join("offer_store");
            match crate::storage::open_db(&offer_db_path) {
                Ok(offer_db) => {
                    match crate::sponsorship::offer_store::OfferStore::from_db(&offer_db) {
                        Ok(offer_store) => {
                            self.offer_store = Some(Arc::new(offer_store));
                            info!("[SPONSORSHIP] Offer store initialized");
                        }
                        Err(e) => {
                            warn!("[SPONSORSHIP] Failed to create offer store: {}", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("[SPONSORSHIP] Failed to open offer store database: {}", e);
                }
            }
        }

        // 4.5.4. Initialize fork registry (VISION §5)
        let fork_db = crate::storage::open_db(self.config.data_dir.join("fork_store"))
            .map_err(|e| NodeError::StorageOpen(self.config.data_dir.clone(), e.to_string()))?;
        let fork_store = Arc::new(
            crate::fork::ForkStore::open(Arc::new(fork_db))
                .map_err(|e| NodeError::StorageOpen(self.config.data_dir.clone(), e.to_string()))?,
        );
        let fork_registry = Arc::new(crate::fork::ForkRegistry::new(
            fork_store,
            self.chain_store.clone(),
        ));
        self.fork_registry = Some(fork_registry);
        info!("[FORK] Fork registry initialized");

        // 4.5.4. Initialize DHT (Kademlia) for content discovery (SPEC_06 §3.8)
        // DHT node ID is derived from our public key
        let dht_node_id = DhtNodeId::from_public_key(self.keypair.public_key.as_bytes());
        // Use listen address; will be updated after transport binds
        let dht = Arc::new(DhtManager::new(dht_node_id, self.config.listen_addr));
        self.dht = Some(dht.clone());
        info!(
            "[DHT] Kademlia DHT initialized with node ID {:?}",
            dht_node_id
        );

        // 4.6. Initialize connection pool for message I/O
        let connection_pool = Arc::new(PeerConnectionPool::new());
        self.connection_pool = Some(connection_pool.clone());
        info!("[CONTENT-SYNC] Connection pool initialized");

        // 4.7. Initialize BlockBuilder for block-based content propagation (SPEC_08)
        // SWIM-BLOCK-THRESHOLD: scale the block-formation threshold by the network's
        // PoW multiplier so it matches per-action PoW scaling. Without this, on
        // testnet/regtest each action contributes ~10%/0.1% of the PoW toward a full
        // mainnet-sized threshold of 30, so blocks never seal on low-traffic chains and
        // content sits `pending` forever. Values: mainnet 30, testnet 3, regtest 1.
        // The scaled value is stamped into RootBlock.difficulty_target at formation and
        // validated self-referentially (RootBlock::verify_difficulty), so all nodes on
        // a network agree on the threshold without any external constant.
        let block_difficulty_target = crate::network::NetworkContext::mode()
            .scaled_block_difficulty(crate::blocks::INITIAL_DIFFICULTY);
        let block_builder = Arc::new(RwLock::new(BlockBuilder::new(block_difficulty_target)));

        // Enable mempool persistence: pending actions (posts, reactions,
        // sponsorship claims) survive restart and keep propagating until mined.
        // Per-network data dir, so each network keeps its own mempool file.
        if let Ok(mut builder) = block_builder.write() {
            builder.set_persistence(self.config.data_dir.join("mempool.bin"));
        }

        // Sync BlockBuilder with chain state so new blocks continue from current height
        if let Some(ref cs) = self.chain_store {
            if let Ok(Some(height)) = cs.get_latest_height() {
                if let Ok(Some(tip_hash)) = cs.get_root_hash_at_height(height) {
                    // Get cumulative_pow from the tip block for fork resolution
                    let cumulative_pow = cs
                        .get_root_block(&tip_hash)
                        .ok()
                        .flatten()
                        .map(|b| b.cumulative_pow)
                        .unwrap_or(0);

                    if let Ok(mut builder) = block_builder.write() {
                        builder.sync_chain_state(height, tip_hash, cumulative_pow);
                        info!(
                            "[BLOCKS] Synced block builder to chain height {} (tip={})",
                            height,
                            hex::encode(&tip_hash[..8])
                        );
                    }
                }
            }
        }

        self.block_builder = Some(block_builder.clone());
        info!(
            "[BLOCKS] Block builder initialized with difficulty target {}s (network={}, base={}s)",
            block_difficulty_target,
            crate::network::NetworkContext::mode(),
            crate::blocks::INITIAL_DIFFICULTY
        );

        // 4.7.2. Resubmit recovered actions from chain repair to mempool
        if !recovered_actions.is_empty() {
            if let Ok(mut builder) = block_builder.write() {
                let mut resubmitted = 0;
                for (thread_id, space_id, action, _branch_path) in recovered_actions {
                    // Re-resolve placement from current chain state (SPEC_08 §4):
                    // the recovered stamp may predate fractures.
                    let branch_path = crate::branch::BranchManager::new(&chain_store)
                        .resolve_mempool_branch_path(&space_id, &thread_id, Some(&action.actor));
                    builder.add_action(thread_id, space_id, action, branch_path);
                    resubmitted += 1;
                }
                info!(
                    "[CHAIN-REPAIR] Resubmitted {} recovered actions to block builder mempool",
                    resubmitted
                );
            }
        }

        // 4.8. Initialize branch-selective sync subsystems (BRANCH_SELECTIVE_SYNC.md)
        // Default storage budget: 10 GB for mobile-friendly nodes
        let branch_subscription_manager = Arc::new(RwLock::new(BranchSubscriptionManager::new(
            10 * 1024 * 1024 * 1024,
        )));
        self.branch_subscription_manager = Some(branch_subscription_manager.clone());
        let peer_branch_tracker = Arc::new(RwLock::new(PeerBranchTracker::new()));
        self.peer_branch_tracker = Some(peer_branch_tracker.clone());
        info!("[BRANCH-SYNC] Branch subscription manager and peer tracker initialized");

        // 4.8. Initialize message router with all subsystems
        let metrics = Arc::new(NodeMetrics::new());
        // Layer 2 NAT traversal: channel from the router's HOLE_PUNCH_INTRO handler to
        // the hole-punch dialer task (the router has no transport handle to dial itself).
        let (hole_punch_tx, hole_punch_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::node::router::HolePunchRequest>();
        let mut router_builder = MessageRouter::builder()
            .metrics(metrics.clone())
            .event_manager(self.event_manager.clone()) // For real-time WS events (H-RPC-2)
            .content_retrieval(content_retrieval)
            .data_dir(self.config.data_dir.clone()) // For multi-hop propagation
            .decay_integration(decay_integration.clone()) // For decay tracking
            .connection_pool(connection_pool.clone()) // For block relay broadcasting
            .hole_punch_tx(hole_punch_tx) // Layer 2 NAT traversal (hole-punch dial outlet)
            .branch_subscription_manager(branch_subscription_manager) // For branch-selective sync
            .peer_branch_tracker(peer_branch_tracker); // For tracking peer branches

        if let Some(ref peer_store) = self.peer_store {
            router_builder = router_builder.peer_store(peer_store.clone());
        }
        if let Some(ref chain_store) = self.chain_store {
            router_builder = router_builder.chain_store(chain_store.clone());
        }
        if let Some(ref content_store) = self.content_store {
            router_builder = router_builder.content_store(content_store.clone());
        }
        if let Some(ref dht) = self.dht {
            router_builder = router_builder.dht(dht.clone());
        }
        if let Some(ref block_builder) = self.block_builder {
            router_builder = router_builder.block_builder(block_builder.clone());
        }
        if let Some(ref spam_store) = self.spam_attestation_store {
            router_builder = router_builder.spam_attestation_store(spam_store.clone());
        }
        if let Some(ref reputation_store) = self.reputation_store {
            router_builder = router_builder.reputation_store(reputation_store.clone());
        }
        // SPEC_11: penalty manager over the sponsorship store, so spam-flag
        // threshold crossings propagate consequences up the sponsor chain.
        if let Some(ref sponsorship_store) = self.sponsorship_store {
            match crate::sponsorship::manager::SponsorshipManager::new(sponsorship_store.clone()) {
                Ok(mgr) => {
                    let mgr = Arc::new(mgr);
                    self.sponsorship_manager = Some(mgr.clone());
                    router_builder = router_builder.sponsorship_manager(mgr);
                }
                Err(e) => {
                    warn!("[SPONSORSHIP] Penalty manager init failed: {}", e);
                }
            }
        }
        if let Some(ref membership_store) = self.membership_store {
            router_builder = router_builder.membership_store(membership_store.clone());
        }
        router_builder = router_builder.identity_pubkey(*self.keypair.public_key.as_bytes());
        if let Some(ref engagement_graph) = self.engagement_graph {
            router_builder = router_builder.engagement_graph(engagement_graph.clone());
        }
        // Achievement service: award serve/engagement badges from the router's
        // real content-serve and block-processing paths (recognition only).
        if let Some(ref achievement_service) = self.achievement_service {
            router_builder = router_builder.achievement_service(achievement_service.clone());
        }
        // SPEC_13 Phase 2 rollout: behavioral branching mode (Full formation
        // default ON for regtest AND testnet; LogOnly available as explicit
        // config -- docs/handoffs/BEHAVIORAL_BRANCHING_PHASE2.md)
        router_builder =
            router_builder.behavioral_branching_mode(self.config.behavioral_branching_mode());
        // Notification service: CommunityFormed delivery to the local user
        // when they are a founding member (SPEC_13 Phase 2 Lane A #4).
        if let Some(ref notification_service) = self.notification_service {
            router_builder = router_builder.notification_service(notification_service.clone());
        }
        if let Some(ref agg_cache) = self.aggregation_cache {
            router_builder = router_builder.aggregation_cache(agg_cache.clone());
        }
        // C-BLOCKLIST-2: Pass blocklist store to router for network gossip updates
        if let Some(ref blocklist) = self.blocklist {
            router_builder = router_builder.blocklist(blocklist.clone());
        }
        // SPEC_12 CSAM seeding: pass trusted list-maintainer keys so signed
        // updates/bundles from them bypass the community-attestation requirement.
        if !self.config.trusted_blocklist_keys.is_empty() {
            let trusted: std::collections::HashSet<[u8; 32]> =
                self.config.trusted_blocklist_keys.iter().copied().collect();
            router_builder = router_builder.trusted_blocklist_keys(trusted);
        }
        // SPEC_11 Phase 6: Pass sponsorship store to router for on-chain sponsorship processing
        if let Some(ref sponsorship_store) = self.sponsorship_store {
            router_builder = router_builder.sponsorship_store(sponsorship_store.clone());
        }
        // SPEC_11 §3.11: Pass offer store to router for P2P sponsorship offer propagation
        if let Some(ref offer_store) = self.offer_store {
            router_builder = router_builder.offer_store(offer_store.clone());
        }
        // Pass search index to router for indexing network-synced content
        if let Some(ref search_index) = self.search_index {
            router_builder = router_builder.search_index(search_index.clone());
        }

        let router = Arc::new(router_builder.build());
        self.router = Some(router.clone());
        info!("[CONTENT-SYNC] Message router initialized with decay tracking, spam attestation, block relay, and branch-selective sync");

        self.set_state(NodeState::Bootstrapping);

        // 6. Bind transport (wrapped in Arc for sharing with accept loop)
        // SWIM-PRIV-2: route outbound dials through the SOCKS5 proxy when set.
        let transport = TcpTransport::bind(self.config.listen_addr, self.local_info.clone())
            .await
            .map_err(|e| {
                NodeError::BindFailed(
                    self.config.listen_addr,
                    std::io::Error::new(std::io::ErrorKind::Other, e.to_string()),
                )
            })?
            .with_proxy(self.config.proxy);
        if let Some(proxy) = self.config.proxy {
            info!(
                "[PRIVACY] Outbound connections routed through SOCKS5 proxy {}{}",
                proxy,
                if self.config.proxy_only {
                    " (proxy-only: DNS-seed + local discovery disabled)"
                } else {
                    ""
                }
            );
        }
        let actual_addr = transport.local_addr();
        let transport_arc = Arc::new(transport);
        self.transport = Some(transport_arc.clone());
        info!("Listening on {}", actual_addr);

        // 6.5. mDNS LAN discovery (SPEC_06 §4.1 Layer 1): advertise our P2P
        // endpoint and browse for other nodes on the local network. Discovered
        // peers are added to the PeerStore so the outbound-dial loop connects to
        // them — zero-config node-to-node on a LAN, no seed required. Disabled
        // in proxy-only mode (local discovery would leak our real address).
        if !self.config.proxy_only {
            match crate::discovery::MdnsService::start(&self.node_id(), actual_addr.port()) {
                Ok((mdns, mut discovered_rx)) => {
                    let peer_store = self.peer_store.clone();
                    let mut shutdown = self.shutdown_rx.clone();
                    tokio::spawn(async move {
                        // Hold the service so advertising/browsing stay alive for
                        // the task's lifetime; dropping it unregisters mDNS.
                        let _mdns = mdns;
                        loop {
                            tokio::select! {
                                _ = shutdown.changed() => break,
                                maybe = discovered_rx.recv() => {
                                    let Some(addr) = maybe else { break };
                                    let (Some(store), Some(wire)) = (
                                        peer_store.as_ref(),
                                        super::connection_manager::socket_addr_to_wire_addr(&addr),
                                    ) else {
                                        continue;
                                    };
                                    let now = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .map(|d| d.as_secs())
                                        .unwrap_or(0);
                                    let mut entry =
                                        crate::discovery::PeerEntry::new(wire, now);
                                    // mDNS proves the peer is up right now.
                                    entry.record_success(now);
                                    if store.put(&entry).is_ok() {
                                        info!("[mDNS] discovered LAN peer {addr}, added to peer store");
                                    }
                                }
                            }
                        }
                        debug!("[mDNS] discovery task stopped");
                    });
                }
                Err(e) => warn!("[mDNS] failed to start LAN discovery: {e}"),
            }
        }

        // 7. Bootstrap peers
        self.bootstrap_peers().await?;

        // 8. Initial sync phase (placeholder - full sync in 8.4)
        self.set_state(NodeState::Syncing);

        // 9. Start background tasks (with message routing for content sync)
        let mut tasks = BackgroundTaskRunner::new(self.shutdown_rx.clone());

        if let (
            Some(ref cm),
            Some(ref transport),
            Some(ref pool),
            Some(ref router),
            Some(ref dht),
        ) = (
            &self.connection_manager,
            &self.transport,
            &self.connection_pool,
            &self.router,
            &self.dht,
        ) {
            // Use enhanced routing that enables full content sync
            // DHT provides network-wide content discovery per SPEC_07 Option C
            // If running as seed node, use short-term connections
            let seed_idle_timeout = if self.config.seed_node_mode {
                Some(self.config.seed_connection_timeout)
            } else {
                None
            };
            tasks.spawn_all_with_routing(
                transport.clone(),
                self.syncer.clone(),
                cm.clone(),
                pool.clone(),
                router.clone(),
                dht.clone(),
                self.config.data_dir.clone(),
                self.decay_integration.clone(),
                self.block_builder.clone(),
                self.chain_store.clone(),
                seed_idle_timeout,
                self.branch_subscription_manager.clone(),
                self.peer_branch_tracker.clone(),
                self.node_id(),
                self.sponsorship_store.clone(),
                self.offer_store.clone(),
            );
            info!("[CONTENT-SYNC] Started background tasks with message routing, DHT, decay, block formation, and branch-selective sync");

            // Layer 2 NAT traversal: hole-punch dialer (consumes intros routed from
            // HOLE_PUNCH_INTRO) + coordinator (introduces our NAT'd peers to each other).
            tasks.spawn_hole_punch_dialer(
                hole_punch_rx,
                transport.clone(),
                router.clone(),
                pool.clone(),
                cm.clone(),
            );
            tasks.spawn_hole_punch_coordinator(transport.clone(), pool.clone());
            info!("[NAT] Hole-punch coordinator + dialer started (Layer 2)");
        } else if let (Some(ref cm), Some(ref transport)) =
            (&self.connection_manager, &self.transport)
        {
            // Fallback to basic accept loop without routing
            tasks.spawn_all_with_transport(transport.clone(), self.syncer.clone(), cm.clone());
        } else {
            tasks.spawn_all(self.syncer.clone(), self.connection_manager.clone());
        }
        self.tasks = Some(tasks);

        // 10. Start RPC server (if enabled)
        if self.config.rpc_enabled {
            self.start_rpc_server().await?;
        }

        // 11. Mark running
        self.start_time = Some(std::time::Instant::now());
        self.set_state(NodeState::Running);
        self.metrics.write().unwrap().mark_started();
        info!("Node started successfully, listening on {}", actual_addr);

        Ok(())
    }

    /// Stop the node gracefully
    ///
    /// This performs the shutdown sequence:
    /// 1. Signal shutdown to background tasks
    /// 2. Stop subsystems
    /// 3. Close transport
    /// 4. Flush storage
    ///
    /// # Errors
    ///
    /// Returns `NodeError::NotRunning` if the node is not running.
    pub async fn stop(&mut self) -> Result<(), NodeError> {
        if self.state() == NodeState::Stopped {
            return Err(NodeError::NotRunning);
        }

        self.set_state(NodeState::ShuttingDown);
        info!("Shutting down node...");

        // 1. Signal shutdown to all watchers
        let _ = self.shutdown_tx.send(true);

        // 2. Signal RPC server shutdown and wait for it to process
        // The RPC server holds Arc references to chain_store via its methods/state
        if let Some(ref tx) = self.rpc_shutdown_tx {
            let _ = tx.send(());
        }
        self.rpc_shutdown_tx = None;
        self.rpc_addr = None;

        // Give the RPC server and any in-flight requests time to complete
        // This is needed because spawned request handlers hold Arc references
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;

        // 3. Stop background tasks first
        if let Some(ref mut tasks) = self.tasks {
            tasks.shutdown().await;
        }
        self.tasks = None;

        // 4. Stop syncer
        if let Some(syncer) = &self.syncer {
            syncer.stop();
        }

        // 6. Close all connections through ConnectionManager
        if let Some(cm) = &self.connection_manager {
            let connections = cm.get_connections();
            for handle in connections {
                cm.remove_connection(&handle.peer_id, DisconnectReason::Shutdown);
            }
        }

        // 7. Drop transport to close connections
        self.transport = None;

        // 8. Drop subsystems that hold Arc references to stores FIRST
        // This must happen before dropping stores to release all Arc references
        self.router = None;
        self.connection_manager = None;
        self.connection_pool = None;
        self.syncer = None;
        self.decay_integration = None;
        self.content_retrieval = None;
        self.block_builder = None;

        // 9. Flush and drop peer store (releases sled lock)
        if let Some(peer_store) = self.peer_store.take() {
            peer_store
                .flush()
                .map_err(|e| NodeError::StorageWrite(e.to_string()))?;
            // Drop the Arc to release the sled database lock
            drop(peer_store);
        }

        // 10. Flush and drop chain store
        // We need to wait for all Arc references to be released before the sled lock is freed
        if let Some(chain_store) = self.chain_store.take() {
            // Wait for all other references to be dropped (with timeout)
            let start = std::time::Instant::now();
            let timeout = std::time::Duration::from_secs(2);
            loop {
                let strong_count = Arc::strong_count(&chain_store);
                if strong_count == 1 {
                    // We're the only owner, safe to drop
                    debug!("ChainStore Arc is unique, dropping");
                    break;
                }
                if start.elapsed() > timeout {
                    warn!(
                        "ChainStore still has {} references after {:?}, forcing drop",
                        strong_count, timeout
                    );
                    break;
                }
                // Yield to let other tasks finish
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            drop(chain_store);
        }

        // 11. Mark stopped
        self.start_time = None;
        self.metrics.write().unwrap().mark_stopped();
        self.set_state(NodeState::Stopped);
        info!("Node stopped");

        Ok(())
    }

    /// Bootstrap peers from cache and seeds
    ///
    /// For outbound connections, we need to:
    /// 1. Connect via transport
    /// 2. Register with ConnectionManager
    /// 3. Add to connection pool
    /// 4. Spawn message read loop
    async fn bootstrap_peers(&self) -> Result<(), NodeError> {
        // Load cached peers
        if let Some(peer_store) = &self.peer_store {
            let cached = peer_store.get_all().unwrap_or_default();
            debug!("Loaded {} cached peers", cached.len());

            // If we have cached peers, try to connect to best ones
            if !cached.is_empty() {
                // TODO: Connect to cached peers with best scores
            }
        }

        // Try DNS seeds first (scalable peer discovery)
        let dns_seeds = if self.config.network_mode == crate::network::mode::NetworkMode::Testnet {
            crate::discovery::seed_list::default_testnet_dns_seeds()
        } else {
            crate::discovery::seed_list::default_mainnet_dns_seeds()
        };

        // SWIM-PRIV-2: proxy-only mode must not resolve DNS seeds locally, as
        // that would leak DNS lookups (and thus interest in the network) on
        // clearnet even though the peer connections themselves are proxied.
        if self.config.proxy_only && !dns_seeds.is_empty() {
            info!("[BOOTSTRAP] proxy-only mode: skipping DNS-seed resolution to avoid DNS leak");
        }

        if !dns_seeds.is_empty() && !self.config.proxy_only {
            info!("[BOOTSTRAP] Resolving {} DNS seeds...", dns_seeds.len());
            let dns_peers = crate::discovery::seed_list::resolve_dns_seeds(&dns_seeds).await;
            if !dns_peers.is_empty() {
                info!("[BOOTSTRAP] Got {} peers from DNS seeds", dns_peers.len());
                // Convert to SeedConfig format and connect
                for entry in dns_peers.iter().take(8) {
                    // Limit to 8 peers from DNS
                    let addr = match entry.transport {
                        crate::discovery::seed_list::TransportType::TcpV4 => {
                            let ip = std::net::Ipv4Addr::new(
                                entry.address[0],
                                entry.address[1],
                                entry.address[2],
                                entry.address[3],
                            );
                            std::net::SocketAddr::new(std::net::IpAddr::V4(ip), entry.port)
                        }
                        _ => continue, // Skip non-IPv4 for now
                    };

                    if let Some(transport) = &self.transport {
                        // Use 5-second timeout for DNS peer connections to avoid blocking
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(5),
                            transport.connect(addr),
                        )
                        .await
                        {
                            Ok(Ok(conn)) => {
                                info!("[BOOTSTRAP] Connected to DNS peer {}", addr);
                                self.integrate_outbound_connection(conn).await;
                            }
                            Ok(Err(e)) => {
                                debug!("[BOOTSTRAP] Failed to connect to DNS peer {}: {}", addr, e);
                            }
                            Err(_) => {
                                debug!("[BOOTSTRAP] Timeout connecting to DNS peer {}", addr);
                            }
                        }
                    }
                }
            } else {
                info!("[BOOTSTRAP] No peers from DNS seeds, falling back to IP seeds");
            }
        }

        // Connect to seed nodes (--connect peers and hardcoded IP fallback)
        for seed in &self.config.seeds {
            if let Some(transport) = &self.transport {
                match transport.connect(seed.addr).await {
                    Ok(conn) => {
                        info!("Connected to seed {}", seed.addr);

                        // Extract peer info for registration
                        let peer_info = conn.peer_info().cloned();
                        let remote_addr = conn.remote_addr();

                        if let Some(info) = peer_info {
                            let peer_id = info.node_id;

                            // Register with ConnectionManager (metadata tracking)
                            if let Some(ref cm) = self.connection_manager {
                                if let Err(e) = cm.add_connection(
                                    peer_id,
                                    remote_addr,
                                    ConnectionDirection::Outbound,
                                ) {
                                    warn!(
                                        "[BOOTSTRAP] Failed to register outbound connection to {}: {}",
                                        remote_addr, e
                                    );
                                    continue;
                                }
                            }

                            // Add to connection pool for message I/O
                            if let (Some(ref pool), Some(ref router), Some(ref cm)) = (
                                &self.connection_pool,
                                &self.router,
                                &self.connection_manager,
                            ) {
                                let established = conn.is_established();
                                let stream = conn.into_stream();
                                let peer_conn = pool.add(stream, peer_id, established).await;

                                // Add to DHT routing table for peer discovery
                                if let Some(ref dht) = self.dht {
                                    let dht_id = DhtNodeId::from_bytes(peer_id);
                                    if let Err(e) = dht.on_node_seen(dht_id, remote_addr).await {
                                        warn!("[BOOTSTRAP] Failed to add seed to DHT: {:?}", e);
                                    } else {
                                        info!(
                                            "[BOOTSTRAP] Added seed {} to DHT routing table",
                                            hex::encode(&peer_id[..8])
                                        );
                                    }
                                }

                                // Send content inventory to seed (I_HAVE for all local content)
                                // This ensures seeds know what content we have for WHO_HAS relay
                                let sync_blobs_path = self.config.data_dir.join("sync_blobs");
                                if sync_blobs_path.exists() {
                                    let mut inventory_count = 0;
                                    if let Ok(prefix_dirs) = std::fs::read_dir(&sync_blobs_path) {
                                        for prefix_entry in prefix_dirs.flatten() {
                                            let prefix_path = prefix_entry.path();
                                            if prefix_path.is_dir() {
                                                if let Ok(files) = std::fs::read_dir(&prefix_path) {
                                                    let prefix = prefix_path
                                                        .file_name()
                                                        .and_then(|f| f.to_str())
                                                        .unwrap_or("");
                                                    for file_entry in files.flatten() {
                                                        let file_path = file_entry.path();
                                                        if file_path.is_file() {
                                                            let suffix = file_path
                                                                .file_name()
                                                                .and_then(|f| f.to_str())
                                                                .unwrap_or("");
                                                            let full_hash_hex =
                                                                format!("{}{}", prefix, suffix);

                                                            if let Ok(hash_bytes) =
                                                                hex::decode(&full_hash_hex)
                                                            {
                                                                if hash_bytes.len() == 32 {
                                                                    let mut content_hash =
                                                                        [0u8; 32];
                                                                    content_hash.copy_from_slice(
                                                                        &hash_bytes,
                                                                    );

                                                                    let envelope = MessageEnvelope::new_fork_agnostic(
                                                                        MessageType::IHave,
                                                                        content_hash.to_vec(),
                                                                    );
                                                                    if let Err(e) = pool
                                                                        .send_to(
                                                                            &peer_id, &envelope,
                                                                        )
                                                                        .await
                                                                    {
                                                                        warn!("[BOOTSTRAP] Failed to send I_HAVE: {}", e);
                                                                    } else {
                                                                        inventory_count += 1;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if inventory_count > 0 {
                                        info!(
                                            "[BOOTSTRAP] Sent {} I_HAVE messages to seed {}",
                                            inventory_count,
                                            hex::encode(&peer_id[..8])
                                        );
                                    }
                                }

                                // Chain negotiation: Compare heights and sync if peer is ahead
                                if let Some(ref cs) = self.chain_store {
                                    let our_height =
                                        cs.get_latest_height().ok().flatten().unwrap_or(0);
                                    let peer_height = info.start_height as u64;

                                    info!(
                                        "[CHAIN-SYNC] Height comparison: our_height={}, peer_height={} (seed={})",
                                        our_height, peer_height, hex::encode(&peer_id[..8])
                                    );

                                    if peer_height > our_height {
                                        let start_height = our_height.saturating_add(1);
                                        let end_height =
                                            peer_height.min(start_height.saturating_add(99));

                                        use crate::network::messages::GetBlocksPayload;
                                        use crate::types::serialize::Serialize;
                                        let request = GetBlocksPayload {
                                            start_height,
                                            end_height,
                                            max_blocks: 100,
                                            include_content: true,
                                        };

                                        let envelope = MessageEnvelope::new_fork_agnostic(
                                            MessageType::GetBlocks,
                                            request.to_bytes().to_vec(),
                                        );

                                        if let Err(e) = peer_conn.send(&envelope).await {
                                            warn!(
                                                "[CHAIN-SYNC] Failed to send GETBLOCKS to seed {}: {}",
                                                hex::encode(&peer_id[..8]), e
                                            );
                                        } else {
                                            info!(
                                                "[CHAIN-SYNC] Requested blocks {}..{} from seed {} (our height={}, peer height={})",
                                                start_height, end_height, hex::encode(&peer_id[..8]),
                                                our_height, peer_height
                                            );
                                        }
                                    }
                                }

                                // Spawn message read loop for this outbound connection
                                let router_clone = router.clone();
                                let pool_clone = pool.clone();
                                let cm_clone = cm.clone();

                                tokio::spawn(async move {
                                    BackgroundTaskRunner::message_read_loop(
                                        peer_conn,
                                        peer_id,
                                        router_clone,
                                        pool_clone,
                                        cm_clone,
                                    )
                                    .await;
                                });

                                info!(
                                    "[BOOTSTRAP] Outbound connection to {} ({}) fully integrated",
                                    remote_addr,
                                    hex::encode(&peer_id[..8])
                                );
                            }
                        } else {
                            warn!("[BOOTSTRAP] Connection to {} has no peer info", remote_addr);
                        }

                        if let Some(metrics) = self.metrics.write().ok() {
                            metrics.peer_connected();
                        }
                    }
                    Err(e) => {
                        warn!("Failed to connect to seed {}: {}", seed.addr, e);
                    }
                }
            }
        }

        Ok(())
    }

    /// Helper to integrate an outbound connection (register, add to pool, spawn read loop)
    async fn integrate_outbound_connection(&self, conn: crate::transport::Connection) {
        let peer_info = conn.peer_info().cloned();
        let remote_addr = conn.remote_addr();

        if let Some(info) = peer_info {
            let peer_id = info.node_id;

            // Register with ConnectionManager
            if let Some(ref cm) = self.connection_manager {
                if let Err(e) =
                    cm.add_connection(peer_id, remote_addr, ConnectionDirection::Outbound)
                {
                    warn!(
                        "[BOOTSTRAP] Failed to register outbound connection to {}: {}",
                        remote_addr, e
                    );
                    return;
                }
            }

            // Add to connection pool
            if let (Some(ref pool), Some(ref router), Some(ref cm)) = (
                &self.connection_pool,
                &self.router,
                &self.connection_manager,
            ) {
                let established = conn.is_established();
                let stream = conn.into_stream();
                let peer_conn = pool.add(stream, peer_id, established).await;

                // Add to DHT
                if let Some(ref dht) = self.dht {
                    let dht_id = DhtNodeId::from_bytes(peer_id);
                    if let Err(e) = dht.on_node_seen(dht_id, remote_addr).await {
                        warn!("[BOOTSTRAP] Failed to add peer to DHT: {:?}", e);
                    }
                }

                // Send content inventory (I_HAVE for all local content)
                let sync_blobs_path = self.config.data_dir.join("sync_blobs");
                if sync_blobs_path.exists() {
                    let mut inventory_count = 0;
                    if let Ok(prefix_dirs) = std::fs::read_dir(&sync_blobs_path) {
                        for prefix_entry in prefix_dirs.flatten() {
                            let prefix_path = prefix_entry.path();
                            if prefix_path.is_dir() {
                                if let Ok(files) = std::fs::read_dir(&prefix_path) {
                                    let prefix = prefix_path
                                        .file_name()
                                        .and_then(|f| f.to_str())
                                        .unwrap_or("");
                                    for file_entry in files.flatten() {
                                        let file_path = file_entry.path();
                                        if file_path.is_file() {
                                            let suffix = file_path
                                                .file_name()
                                                .and_then(|f| f.to_str())
                                                .unwrap_or("");
                                            let full_hash_hex = format!("{}{}", prefix, suffix);

                                            if let Ok(hash_bytes) = hex::decode(&full_hash_hex) {
                                                if hash_bytes.len() == 32 {
                                                    let mut content_hash = [0u8; 32];
                                                    content_hash.copy_from_slice(&hash_bytes);

                                                    let envelope =
                                                        MessageEnvelope::new_fork_agnostic(
                                                            MessageType::IHave,
                                                            content_hash.to_vec(),
                                                        );
                                                    if let Err(e) =
                                                        pool.send_to(&peer_id, &envelope).await
                                                    {
                                                        warn!(
                                                            "[BOOTSTRAP] Failed to send I_HAVE: {}",
                                                            e
                                                        );
                                                    } else {
                                                        inventory_count += 1;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if inventory_count > 0 {
                        info!(
                            "[BOOTSTRAP] Sent {} I_HAVE messages to peer {}",
                            inventory_count,
                            hex::encode(&peer_id[..8])
                        );
                    }
                }

                // Chain sync if peer is ahead
                if let Some(ref cs) = self.chain_store {
                    let our_height = cs.get_latest_height().ok().flatten().unwrap_or(0);
                    let peer_height = info.start_height as u64;

                    if peer_height > our_height {
                        let start_height = our_height.saturating_add(1);
                        let end_height = peer_height.min(start_height.saturating_add(99));

                        use crate::network::messages::GetBlocksPayload;
                        use crate::types::serialize::Serialize;
                        let request = GetBlocksPayload {
                            start_height,
                            end_height,
                            max_blocks: 100,
                            include_content: true,
                        };

                        let envelope = MessageEnvelope::new_fork_agnostic(
                            MessageType::GetBlocks,
                            request.to_bytes().to_vec(),
                        );

                        if let Err(e) = peer_conn.send(&envelope).await {
                            warn!("[CHAIN-SYNC] Failed to send GETBLOCKS: {}", e);
                        }
                    }
                }

                // Spawn message read loop
                let router_clone = router.clone();
                let pool_clone = pool.clone();
                let cm_clone = cm.clone();

                tokio::spawn(async move {
                    BackgroundTaskRunner::message_read_loop(
                        peer_conn,
                        peer_id,
                        router_clone,
                        pool_clone,
                        cm_clone,
                    )
                    .await;
                });

                info!(
                    "[BOOTSTRAP] Outbound connection to {} ({}) integrated",
                    remote_addr,
                    hex::encode(&peer_id[..8])
                );
            }
        }
    }

    /// Start the RPC server
    ///
    /// Creates the RPC server with node references and starts listening.
    async fn start_rpc_server(&mut self) -> Result<(), NodeError> {
        // Create RPC shutdown channel
        let (rpc_shutdown_tx, _) = broadcast::channel::<()>(1);
        self.rpc_shutdown_tx = Some(rpc_shutdown_tx.clone());

        // Build RPC server config
        let rpc_config = RpcServerConfig {
            bind: self.config.rpc_bind.to_string(),
            port: self.config.rpc_port(),
            data_dir: self.config.data_dir.clone(),
            username: self.config.rpc_user.clone(),
            password: self.config.rpc_password.clone(),
            max_body_size: 1024 * 1024, // 1MB
            tls: Default::default(),    // TLS disabled by default for local development
        };

        // Use content store from self (opened in initialize())
        let content_store_path = self.config.data_dir.join("content");
        let sync_blob_path = self.config.data_dir.join("sync_blobs");

        // Build NodeRef for RPC methods
        let node_ref = Arc::new(NodeRef {
            state: {
                // Convert std RwLock to tokio RwLock for async access
                let state = self.state();
                Arc::new(tokio::sync::RwLock::new(state))
            },
            start_time: self.start_time.unwrap_or_else(std::time::Instant::now),
            network: self.config.network_mode.name().to_string(),
            node_id: hex::encode(self.node_id()),
            p2p_port: self
                .transport
                .as_ref()
                .map(|t| t.local_addr().port())
                .unwrap_or(self.config.network_mode.default_port()),
            rpc_port: self.config.rpc_port(),
            connection_manager: self.connection_manager.clone(),
            connection_pool: self.connection_pool.clone(),
            router: self.router.clone(),
            sync_state: self.sync_state.clone(),
            data_dir: self.config.data_dir.clone(),
            content_store_path: content_store_path,
            sync_blob_path: sync_blob_path,
            content_store: self.content_store.clone(),
            decay_integration: self.decay_integration.clone(),
            block_builder: self.block_builder.clone(),
            content_retrieval: self.content_retrieval.clone(),
            blocklist: self.blocklist.clone(),
            fork_registry: self.fork_registry.clone(),
            chain_store: self.chain_store.clone(),
            transport: self.transport.clone(),
            dht: self.dht.clone(),
            aggregation_cache: self.aggregation_cache.clone(),
            spam_attestation_store: self.spam_attestation_store.clone(),
            reputation_store: self.reputation_store.clone(),
            sponsorship_manager: self.sponsorship_manager.clone(),
            membership_store: self.membership_store.clone(),
            sponsorship_store: self.sponsorship_store.clone(),
            offer_store: self.offer_store.clone(),
            achievement_service: self.achievement_service.clone(),
            notification_service: self.notification_service.clone(),
            branch_subscription_manager: self.branch_subscription_manager.clone(),
            keypair: self.keypair.clone(),
            shutdown_tx: rpc_shutdown_tx,
            identity_name: Arc::new(tokio::sync::RwLock::new(self.config.identity_name.clone())),
            search_index: self.search_index.clone(),
            event_manager: Some(self.event_manager.clone()),
            origin_privacy: self.config.origin_privacy(),
            space_list_cache: std::sync::Mutex::new(None),
            space_count_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
            reply_count_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        });

        // Create RPC methods
        let methods = RpcMethods::new(node_ref);

        // Create and start RPC server
        let server = RpcServer::new(rpc_config, self.shutdown_rx.clone())
            .map_err(|e| NodeError::RpcError(e.to_string()))?;

        let rpc_addr = server
            .start_with_events(methods, self.event_manager.clone())
            .await
            .map_err(|e| NodeError::RpcError(e.to_string()))?;

        self.rpc_addr = Some(rpc_addr);
        info!("RPC server listening on {}", rpc_addr);

        // Write RPC address to file so CLI can find it
        let rpc_addr_file = self.config.data_dir.join(".rpc_addr");
        if let Err(e) = std::fs::write(&rpc_addr_file, rpc_addr.to_string()) {
            warn!("Failed to write RPC address file: {}", e);
        }

        Ok(())
    }

    // ========== Helper Functions ==========

    /// Rebuild aggregation cache from blockchain data
    ///
    /// Iterates through all content blocks and counts replies per parent,
    /// posts per space, etc.
    fn rebuild_aggregation_cache(
        agg_cache: &AggregationCache,
        chain_store: &ChainStore,
    ) -> Result<(), crate::types::error::StorageError> {
        use crate::blocks::ActionType;
        use crate::storage::ContentAggregation;
        use crate::types::content::ContentId;
        use std::collections::HashMap;

        // Clear existing data
        agg_cache.clear()?;

        // Track reply counts and space stats
        let mut reply_counts: HashMap<[u8; 32], u64> = HashMap::new();
        let mut space_post_counts: HashMap<[u8; 16], u64> = HashMap::new();
        let mut space_reply_counts: HashMap<[u8; 16], u64> = HashMap::new();

        // Iterate through all content blocks
        for result in chain_store.iter_content_blocks() {
            if let Ok(block) = result {
                let space_id_16: [u8; 16] = block.space_id[..16].try_into().unwrap_or([0u8; 16]);

                for action in &block.actions {
                    match action.action_type {
                        ActionType::Post => {
                            // Increment post count for space
                            *space_post_counts.entry(space_id_16).or_insert(0) += 1;
                        }
                        ActionType::Reply => {
                            // Increment reply count for parent
                            if let Some(ref parent_id) = action.parent_id {
                                *reply_counts.entry(*parent_id).or_insert(0) += 1;
                            }
                            // Increment reply count for space
                            *space_reply_counts.entry(space_id_16).or_insert(0) += 1;
                        }
                        ActionType::CreateSpace => {
                            // Space creation doesn't affect content counts
                        }
                        ActionType::Engage => {}
                        ActionType::Edit => {
                            // Edits are tracked as modifications, not separate content counts
                        }
                        // Private space actions don't affect content aggregation counts
                        ActionType::Invite
                        | ActionType::Leave
                        | ActionType::Kick
                        | ActionType::RevokeInvite
                        | ActionType::KeyRotation
                        | ActionType::DMRequest
                        | ActionType::AcceptDM
                        | ActionType::DeclineDM => {}
                        // Sponsorship actions don't affect content aggregation counts
                        ActionType::Sponsor | ActionType::GenesisRegister => {}
                        // Space metadata actions don't affect content aggregation counts
                        ActionType::RenameSpace => {}
                    }
                }
            }
        }

        // Batch insert content aggregations
        let content_updates: Vec<_> = reply_counts
            .into_iter()
            .map(|(content_hash, count)| {
                (
                    ContentId::from_bytes(content_hash),
                    ContentAggregation {
                        reply_count: count,
                        engagement_score: 0,
                        last_activity: 0,
                        thread_depth: 0,
                    },
                )
            })
            .collect();

        if !content_updates.is_empty() {
            agg_cache.batch_set_content(&content_updates)?;
        }

        // Batch insert space aggregations
        use crate::storage::SpaceAggregation;
        let mut space_aggs: HashMap<[u8; 16], SpaceAggregation> = HashMap::new();

        for (space_id, post_count) in space_post_counts {
            let agg = space_aggs
                .entry(space_id)
                .or_insert_with(SpaceAggregation::new);
            agg.post_count = post_count;
            agg.total_content_count += post_count;
        }

        for (space_id, reply_count) in space_reply_counts {
            let agg = space_aggs
                .entry(space_id)
                .or_insert_with(SpaceAggregation::new);
            agg.total_reply_count = reply_count;
            agg.total_content_count += reply_count;
        }

        let space_updates: Vec<_> = space_aggs.into_iter().collect();
        if !space_updates.is_empty() {
            agg_cache.batch_set_space(&space_updates)?;
        }

        agg_cache.flush()?;
        Ok(())
    }

    // ========== Public API ==========

    /// Get the current node status
    pub fn status(&self) -> NodeStatus {
        let state = self.state();
        let metrics = self.metrics.read().unwrap();
        let mut status = metrics.to_status(state, self.config.storage_target_mb);
        // Peers: the ConnectionManager is the authoritative count. The
        // metrics counter is event-driven and several connect paths
        // (DNS-seed bootstrap, GETADDR reconnects) historically skipped it,
        // reporting "0 peers" while connected and synced.
        if let Some(ref cm) = self.connection_manager {
            status.peers = cm.connection_count();
        }
        // Chain height: same disease — the metrics counter is only bumped by
        // some ingest paths (sync/backfill skip it), showing "height 0" on a
        // synced node. The chain store is the authoritative height.
        if let Some(ref cs) = self.chain_store {
            if let Ok(Some(height)) = cs.get_latest_height() {
                status.chain_height = height;
            }
        }
        status
    }

    /// Get list of connected peers
    pub fn peers(&self) -> Vec<PeerInfo> {
        // Return connected peers from ConnectionManager
        // Note: PeerInfo contains full handshake data which we don't have in ConnectionHandle
        // For now, return empty - full integration requires transport layer changes
        self.connection_manager
            .as_ref()
            .map(|cm| {
                cm.get_connections()
                    .into_iter()
                    .map(|handle| PeerInfo {
                        node_id: handle.peer_id,
                        protocol_version: 1,
                        services: 0,
                        user_agent: String::new(),
                        start_height: 0,
                        relay: true,
                        nonce: 0,
                        remote_addr: handle.remote_addr,
                        timestamp: 0,
                        observed_external_addr: None,
                        advertised_addr: None,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get the number of connected peers
    pub fn peer_count(&self) -> usize {
        self.connection_manager
            .as_ref()
            .map(|cm| cm.connection_count())
            .unwrap_or(0)
    }

    /// Check if we need more peers
    pub fn needs_more_peers(&self) -> bool {
        self.connection_manager
            .as_ref()
            .map(|cm| cm.needs_more_peers())
            .unwrap_or(true)
    }

    /// Subscribe to connection events
    ///
    /// Returns a broadcast receiver for connection lifecycle events.
    pub fn subscribe_connection_events(&self) -> Option<broadcast::Receiver<ConnectionEvent>> {
        self.connection_manager.as_ref().map(|cm| cm.subscribe())
    }

    /// Get the connection manager (for advanced usage)
    pub fn connection_manager(&self) -> Option<Arc<ConnectionManager>> {
        self.connection_manager.clone()
    }

    /// Get reference to the ChainStore (for testing/advanced usage)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn chain_store(&self) -> Option<Arc<ChainStore>> {
        self.chain_store.clone()
    }

    /// Get reference to the SponsorshipStore (for testing/advanced usage)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn sponsorship_store(&self) -> Option<Arc<SponsorshipStore>> {
        self.sponsorship_store.clone()
    }

    /// Get reference to the AchievementService (for testing/advanced usage)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn achievement_service(&self) -> Option<Arc<AchievementService>> {
        self.achievement_service.clone()
    }

    /// Get reference to the ContentRetrievalManager (for content sync)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn content_retrieval_manager(&self) -> Option<Arc<ContentRetrievalManager>> {
        self.content_retrieval.clone()
    }

    /// Get reference to the PeerConnectionPool (for message I/O)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn connection_pool(&self) -> Option<Arc<PeerConnectionPool>> {
        self.connection_pool.clone()
    }

    /// Get reference to the MessageRouter (for routing incoming messages)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn message_router(&self) -> Option<Arc<MessageRouter>> {
        self.router.clone()
    }

    /// Get reference to the BlockBuilder (for block-based content propagation)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn block_builder(&self) -> Option<Arc<RwLock<BlockBuilder>>> {
        self.block_builder.clone()
    }

    /// Get reference to the BlocklistStore (for CSAM/illegal content filtering)
    ///
    /// Returns None if the node hasn't been started yet.
    /// Wrapped in RwLock to allow network gossip handlers to store updates (C-BLOCKLIST-2)
    pub fn blocklist(&self) -> Option<Arc<RwLock<BlocklistStore>>> {
        self.blocklist.clone()
    }

    /// Get reference to the BranchSubscriptionManager (for branch-selective sync)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn branch_subscription_manager(&self) -> Option<Arc<RwLock<BranchSubscriptionManager>>> {
        self.branch_subscription_manager.clone()
    }

    /// Get reference to the PeerBranchTracker (for tracking peer branches)
    ///
    /// Returns None if the node hasn't been started yet.
    pub fn peer_branch_tracker(&self) -> Option<Arc<RwLock<PeerBranchTracker>>> {
        self.peer_branch_tracker.clone()
    }

    /// Connect to a specific peer
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Node is not running (`NotRunning`)
    /// - Connection limit exceeded
    /// - Connection fails (`ConnectionFailed`)
    pub async fn connect(&self, addr: SocketAddr) -> Result<(), NodeError> {
        let transport = self.transport.as_ref().ok_or(NodeError::NotRunning)?;

        // Check connection limits
        if let Some(cm) = &self.connection_manager {
            if !cm.can_connect_outbound() {
                warn!(
                    "Cannot connect to {}: outbound connection limit reached",
                    addr
                );
                return Err(NodeError::ConnectionFailed(
                    addr,
                    crate::transport::TransportError::ConnectionClosed,
                ));
            }
        }

        let conn = transport
            .connect(addr)
            .await
            .map_err(|e| NodeError::ConnectionFailed(addr, e))?;

        // Get peer info from handshake
        let peer_info = conn.peer_info().cloned();

        if let Some(info) = peer_info {
            let peer_id = info.node_id;

            // Register the outbound connection with ConnectionManager (metadata tracking)
            if let Some(cm) = &self.connection_manager {
                if let Err(e) = cm.add_connection(peer_id, addr, ConnectionDirection::Outbound) {
                    warn!("Failed to register outbound connection: {}", e);
                } else {
                    debug!(
                        "Registered outbound connection to {} ({})",
                        addr,
                        hex::encode(&peer_id[..8])
                    );
                }
            }

            // Add connection to pool for message I/O (if pool available)
            if let (Some(pool), Some(router), Some(cm)) = (
                &self.connection_pool,
                &self.router,
                &self.connection_manager,
            ) {
                // Extract the TcpStream for splitting into read/write halves
                let established = conn.is_established();
                let stream = conn.into_stream();
                let peer_conn = pool.add(stream, peer_id, established).await;
                info!(
                    "[OUTBOUND] Added connection to {} to pool",
                    hex::encode(&peer_id[..8])
                );

                // Chain negotiation: Compare heights and sync if peer is ahead
                // This is the core blockchain sync - if peer has more blocks, request them immediately
                if let Some(ref cs) = self.chain_store {
                    let our_height = cs.get_latest_height().ok().flatten().unwrap_or(0);
                    let peer_height = info.start_height as u64;

                    info!(
                        "[CHAIN-SYNC] Height comparison: our_height={}, peer_height={} (peer={})",
                        our_height,
                        peer_height,
                        hex::encode(&peer_id[..8])
                    );

                    if peer_height > our_height {
                        // Peer has more blocks - request them immediately
                        let start_height = our_height.saturating_add(1);
                        let end_height = peer_height.min(start_height.saturating_add(99));

                        use crate::network::messages::GetBlocksPayload;
                        use crate::types::serialize::Serialize;
                        let request = GetBlocksPayload {
                            start_height,
                            end_height,
                            max_blocks: 100,
                            include_content: true,
                        };

                        let envelope = MessageEnvelope::new_fork_agnostic(
                            MessageType::GetBlocks,
                            request.to_bytes().to_vec(),
                        );

                        if let Err(e) = peer_conn.send(&envelope).await {
                            warn!(
                                "[CHAIN-SYNC] Failed to send GETBLOCKS to outbound peer {}: {}",
                                hex::encode(&peer_id[..8]),
                                e
                            );
                        } else {
                            info!(
                                "[CHAIN-SYNC] Requested blocks {}..{} from outbound peer {} (our height={}, peer height={})",
                                start_height, end_height, hex::encode(&peer_id[..8]),
                                our_height, peer_height
                            );
                        }
                    } else if our_height > peer_height {
                        // We have more blocks - announce our tip so peer can sync from us
                        if let Ok(Some(tip_hash)) = cs.get_root_hash_at_height(our_height) {
                            if let Ok(Some(block)) = cs.get_root_block(&tip_hash) {
                                use crate::network::messages::BlockAnnouncePayload;
                                use crate::types::serialize::Serialize;
                                let announce = BlockAnnouncePayload {
                                    block_hash: tip_hash,
                                    height: our_height,
                                    total_pow: 0, // TODO: Calculate actual total PoW
                                    space_block_count: block.space_block_hashes.len() as u32,
                                    timestamp: block.timestamp,
                                };

                                let envelope = MessageEnvelope::new_fork_agnostic(
                                    MessageType::BlockAnnounce,
                                    announce.to_bytes().to_vec(),
                                );

                                if let Err(e) = peer_conn.send(&envelope).await {
                                    warn!(
                                        "[CHAIN-SYNC] Failed to send BLOCK_ANNOUNCE to outbound peer {}: {}",
                                        hex::encode(&peer_id[..8]), e
                                    );
                                } else {
                                    info!(
                                        "[CHAIN-SYNC] Announced block height {} to outbound peer {} (peer at height {})",
                                        our_height, hex::encode(&peer_id[..8]), peer_height
                                    );
                                }
                            }
                        }
                    } else {
                        info!(
                            "[CHAIN-SYNC] Outbound peer {} at same height {} as us",
                            hex::encode(&peer_id[..8]),
                            our_height
                        );
                    }
                }

                // Spawn message reading task for this outbound connection
                let router_clone = router.clone();
                let pool_clone = pool.clone();
                let cm_clone = cm.clone();

                tokio::spawn(async move {
                    BackgroundTaskRunner::message_read_loop(
                        peer_conn,
                        peer_id,
                        router_clone,
                        pool_clone,
                        cm_clone,
                    )
                    .await;
                });

                info!(
                    "[OUTBOUND] Spawned message loop for {}",
                    hex::encode(&peer_id[..8])
                );
            }

            if let Ok(metrics) = self.metrics.write() {
                metrics.peer_connected();
            }

            info!(
                "Connected to peer {} ({})",
                addr,
                hex::encode(&peer_id[..8])
            );
        } else {
            warn!("Connected to {} but no peer info from handshake", addr);
        }

        Ok(())
    }

    /// Disconnect from a peer
    ///
    /// Removes the peer from the connection manager and updates metrics.
    pub async fn disconnect(&self, peer_id: &[u8; 32]) -> Result<(), NodeError> {
        if let Some(cm) = &self.connection_manager {
            if cm
                .remove_connection(peer_id, DisconnectReason::Normal)
                .is_some()
            {
                if let Ok(metrics) = self.metrics.write() {
                    metrics.peer_disconnected();
                }
                info!("Disconnected from peer {}", hex::encode(&peer_id[..8]));
            }
        }
        Ok(())
    }

    /// Register a new connection (called after successful handshake)
    ///
    /// This should be called by the transport layer after a successful handshake.
    pub fn register_connection(
        &self,
        peer_id: [u8; 32],
        addr: SocketAddr,
        direction: ConnectionDirection,
    ) -> Result<(), ConnectionManagerError> {
        if let Some(cm) = &self.connection_manager {
            cm.add_connection(peer_id, addr, direction)?;
            if let Ok(metrics) = self.metrics.write() {
                metrics.peer_connected();
            }
        }
        Ok(())
    }

    /// Get sync status
    pub fn sync_status(&self) -> SyncState {
        self.syncer
            .as_ref()
            .map(|s| s.state())
            .unwrap_or(SyncState::Idle)
    }

    /// Get the local listen address (P2P)
    pub fn listen_addr(&self) -> Option<SocketAddr> {
        self.transport.as_ref().map(|t| t.local_addr())
    }

    /// Get the RPC server address (if running)
    pub fn rpc_addr(&self) -> Option<SocketAddr> {
        self.rpc_addr
    }
}

impl Drop for NodeManager {
    fn drop(&mut self) {
        // Signal shutdown to any background tasks
        let _ = self.shutdown_tx.send(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::generate_keypair;

    fn test_keypair() -> KeyPair {
        generate_keypair()
    }

    #[test]
    fn network_magic_guard_wipes_only_on_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let dd = dir.path();
        // Seed some network-scoped state + a preserved file.
        std::fs::create_dir_all(dd.join("chain")).unwrap();
        std::fs::write(dd.join("chain/block"), b"old").unwrap();
        std::fs::write(dd.join("mempool.bin"), b"old-actions").unwrap();
        std::fs::write(dd.join("identity.enc"), b"keep-me").unwrap();

        // 1) Missing marker: assume current network — stamp, do NOT wipe.
        enforce_network_magic(dd, *b"TES2").unwrap();
        assert!(dd.join("chain/block").exists(), "missing marker must not wipe");
        assert_eq!(std::fs::read(dd.join(NETWORK_MAGIC_MARKER)).unwrap(), b"TES2");

        // 2) Same magic again: no-op, state preserved.
        enforce_network_magic(dd, *b"TES2").unwrap();
        assert!(dd.join("chain/block").exists());
        assert!(dd.join("mempool.bin").exists());

        // 3) Different magic (a hard fork): network-scoped stores cleared, identity kept.
        enforce_network_magic(dd, *b"TES3").unwrap();
        assert!(!dd.join("chain").exists(), "chain must be cleared on magic change");
        assert!(!dd.join("mempool.bin").exists(), "mempool must be cleared");
        assert_eq!(std::fs::read(dd.join("identity.enc")).unwrap(), b"keep-me");
        assert_eq!(std::fs::read(dd.join(NETWORK_MAGIC_MARKER)).unwrap(), b"TES3");
    }

    #[test]
    fn test_new_with_valid_config() {
        let config = NodeConfig::for_test(0);
        let result = NodeManager::new(config, test_keypair());
        assert!(result.is_ok());
    }

    #[test]
    fn test_new_with_invalid_config() {
        let config = NodeConfig {
            min_peers: 100,
            target_peers: 10, // Invalid: min > target
            ..NodeConfig::for_test(0)
        };
        let result = NodeManager::new(config, test_keypair());
        assert!(result.is_err());
        let err = result.err().unwrap();
        assert!(err.to_string().contains("min_peers"));
    }

    #[test]
    fn status_peers_comes_from_connection_manager_not_metrics_counter() {
        // Several connect paths (DNS-seed bootstrap, GETADDR reconnects)
        // historically forgot to bump the hand-maintained metrics counter,
        // showing "0 peers" while connected and synced. status() must report
        // the ConnectionManager's authoritative count instead.
        let config = NodeConfig::for_test(0);
        let dir = tempfile::tempdir().unwrap();
        let peer_store = Arc::new(crate::discovery::PeerStore::open(dir.path()).unwrap());
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        let cm = Arc::new(ConnectionManager::new(
            ConnectionConfig::default(),
            peer_store,
        ));
        // Register a connection WITHOUT touching metrics — as the buggy
        // connect paths did.
        cm.add_connection(
            [7u8; 32],
            "127.0.0.1:12345".parse().unwrap(),
            ConnectionDirection::Outbound,
        )
        .unwrap();
        node.connection_manager = Some(cm);

        assert_eq!(
            node.status().peers,
            1,
            "status().peers must reflect the ConnectionManager count"
        );
    }

    #[test]
    fn status_chain_height_comes_from_chain_store_not_metrics_counter() {
        // Same disease as the peers counter: metrics.chain_height is
        // event-maintained and the sync/backfill paths don't bump it, so the
        // status strip showed "height 0" on a synced node. status() must
        // report the chain store's authoritative height.
        use crate::blocks::RootBlock;

        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let store = crate::storage::ChainStore::open(dir.path()).unwrap();
        let block = RootBlock {
            version: 1,
            prev_root_hash: [0u8; 32],
            timestamp: 1_700_000_000,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: 10,
            cumulative_pow: 10,
            difficulty_target: 30,
            height: 9,
            block_creator: [0u8; 32],
        };
        let hash = store.put_root_block(&block).unwrap();
        store.index_height(9, hash).unwrap();
        node.chain_store = Some(Arc::new(store));

        assert_eq!(
            node.status().chain_height,
            9,
            "status().chain_height must reflect the chain store"
        );
    }

    #[test]
    fn test_initial_state_is_stopped() {
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, test_keypair()).unwrap();
        assert_eq!(node.state(), NodeState::Stopped);
        assert!(!node.is_running());
    }

    #[test]
    fn test_node_id() {
        let keypair = test_keypair();
        let expected_id = *keypair.public_key.as_bytes();
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, keypair).unwrap();
        assert_eq!(node.node_id(), expected_id);
    }

    #[test]
    fn test_status_when_stopped() {
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, test_keypair()).unwrap();
        let status = node.status();
        assert_eq!(status.state, NodeState::Stopped);
        assert_eq!(status.uptime_seconds, 0);
        assert_eq!(status.peers, 0);
    }

    #[test]
    fn test_sync_status_when_stopped() {
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, test_keypair()).unwrap();
        let status = node.sync_status();
        assert_eq!(status, SyncState::Idle);
    }

    #[test]
    fn test_peers_empty_when_stopped() {
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, test_keypair()).unwrap();
        assert!(node.peers().is_empty());
    }

    #[tokio::test]
    async fn test_start_transitions_to_running() {
        let config = NodeConfig::for_test(0); // Port 0 = random
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        let result = node.start().await;
        assert!(result.is_ok());
        assert_eq!(node.state(), NodeState::Running);
        assert!(node.is_running());
        assert!(node.listen_addr().is_some());

        // Cleanup
        node.stop().await.ok();
    }

    #[tokio::test]
    async fn test_start_on_running_returns_error() {
        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        node.start().await.unwrap();
        let result = node.start().await;

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), NodeError::AlreadyRunning));

        node.stop().await.ok();
    }

    #[tokio::test]
    async fn test_stop_transitions_to_stopped() {
        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        node.start().await.unwrap();
        assert_eq!(node.state(), NodeState::Running);

        node.stop().await.unwrap();
        assert_eq!(node.state(), NodeState::Stopped);
        assert!(!node.is_running());
    }

    #[tokio::test]
    async fn test_stop_on_stopped_returns_error() {
        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        let result = node.stop().await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), NodeError::NotRunning));
    }

    #[tokio::test]
    async fn test_connect_when_not_running() {
        let config = NodeConfig::for_test(0);
        let node = NodeManager::new(config, test_keypair()).unwrap();

        let addr: SocketAddr = "127.0.0.1:9999".parse().unwrap();
        let result = node.connect(addr).await;

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), NodeError::NotRunning));
    }

    #[tokio::test]
    async fn test_status_reflects_running_state() {
        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        assert_eq!(node.status().state, NodeState::Stopped);

        node.start().await.unwrap();
        let status = node.status();
        assert_eq!(status.state, NodeState::Running);
        assert!(status.uptime_seconds >= 0);

        node.stop().await.ok();
    }

    #[tokio::test]
    async fn test_node_restart() {
        let config = NodeConfig::for_test(0);
        let mut node = NodeManager::new(config, test_keypair()).unwrap();

        // Start
        node.start().await.unwrap();
        assert!(node.is_running());
        let addr1 = node.listen_addr();

        // Stop
        node.stop().await.unwrap();
        assert!(!node.is_running());

        // Start again
        node.start().await.unwrap();
        assert!(node.is_running());
        let addr2 = node.listen_addr();

        // Addresses may differ since we use port 0
        assert!(addr1.is_some());
        assert!(addr2.is_some());

        node.stop().await.ok();
    }
}
