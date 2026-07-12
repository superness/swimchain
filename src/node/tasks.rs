//! Background Task Runner (SPEC_10 §6)
//!
//! Manages background tasks that run periodically during node operation:
//! - Sync loop: Check for new blocks every 30s
//! - Decay tick: Process content decay every 60s
//! - Peer maintenance: Check peer count every 60s
//! - Contribution recording: Sample uptime every 5 min
//! - Keepalive: Send PING to idle peers every 2 min
//! - Cache cleanup: Evict old cache entries every 10 min
//! - Availability announce: Announce seeding availability every 5 min
//!
//! All tasks use `tokio::select!` with a shutdown watch channel for graceful termination.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use log::{debug, info, warn};
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::{interval, MissedTickBehavior};

use crate::blocks::BlockBuilder;
use crate::content::decay_integration::DecayIntegration;
use crate::dht::{DhtManager, DhtMessage, NodeId as DhtNodeId};
use crate::discovery::peer_branches::PeerBranchTracker;
use crate::network::messages::{GetBlocksPayload, PingPongPayload};
use crate::sponsorship::offer_store::OfferStore;
use crate::sync::subscription::BranchSubscriptionManager;
use crate::sync::ChainSyncer;
use crate::transport::{ConnectionDirection, TcpTransport};
use crate::types::network::{MessageEnvelope, MessageType};
use crate::types::serialize::Serialize;

use super::connection_event::{ConnectionEvent, DisconnectReason};
use super::connection_manager::ConnectionManager;
use super::peer_connections::{PeerConnection, PeerConnectionPool};
use super::router::MessageRouter;

// ============================================================================
// Task interval constants from SPEC_10 §6.1
// ============================================================================

/// Sync loop interval - check for new blocks
pub const SYNC_INTERVAL_SECS: u64 = 30;

/// Decay tick interval - process content decay
pub const DECAY_TICK_INTERVAL_SECS: u64 = 60;

/// Peer maintenance interval - check peer count
pub const PEER_MAINTENANCE_INTERVAL_SECS: u64 = 60;

/// Contribution recording interval - sample uptime (5 minutes)
pub const CONTRIBUTION_RECORD_INTERVAL_SECS: u64 = 300;

/// Keepalive interval - send PING to idle peers (2 minutes)
pub const KEEPALIVE_INTERVAL_SECS: u64 = 120;

/// Cache cleanup interval - evict old cache entries (10 minutes)
pub const CACHE_CLEANUP_INTERVAL_SECS: u64 = 600;

/// Availability announce interval - announce seeding availability (5 minutes)
pub const AVAILABILITY_ANNOUNCE_INTERVAL_SECS: u64 = 300;

/// Block formation check interval - backup check for PoW threshold (5 minutes)
///
/// Primary block formation is triggered immediately when cumulative PoW in mempool
/// meets the difficulty threshold (see router::try_form_block_if_threshold_met).
/// This timer serves as a backup check only - blocks are NOT forced on timer.
///
/// Design: Blocks form naturally when enough PoW accumulates from pending actions.
/// This is similar to Bitcoin's approach where blocks form based on work, not time.
/// Users see instant updates via mempool gossip; blocks provide finality.
pub const BLOCK_FORMATION_CHECK_INTERVAL_SECS: u64 = 300;

/// DHT peer discovery interval - discover new peers via Kademlia (60 seconds)
/// Per SPEC_06 §4.1: DHT (Kademlia) is a discovery layer for finding peers
pub const DHT_DISCOVERY_INTERVAL_SECS: u64 = 60;

/// Branch-selective sync interval - sync subscribed branches (45 seconds)
/// Per BRANCH_SELECTIVE_SYNC.md §4: Nodes sync only branches they subscribe to
pub const BRANCH_SYNC_INTERVAL_SECS: u64 = 45;

/// Sponsorship offer sync interval - sync offers from peers (2 minutes)
/// Per SPEC_11 §5.1: Query peers for available sponsorship offers during initial sync
pub const SPONSORSHIP_OFFER_SYNC_INTERVAL_SECS: u64 = 120;

/// Hole-punch coordination interval (Layer 2 NAT traversal). Every 30s a well-connected
/// node re-introduces its NAT'd peers to each other. Frequent enough that peers reconnect
/// quickly after a NAT mapping expires, cheap enough to not spam (see MAX_PEERS cap).
pub const HOLE_PUNCH_COORD_INTERVAL_SECS: u64 = 30;

/// Cap on peers considered per coordination round. Bounds the O(n^2) pairwise
/// introductions (10 peers → at most 45 pairs / 90 intro messages per round).
pub const HOLE_PUNCH_MAX_PEERS: usize = 10;

// ============================================================================
// Helper functions
// ============================================================================

/// Convert WireAddr to SocketAddr
fn wire_addr_to_socket_addr(wire_addr: &crate::network::messages::WireAddr) -> Option<SocketAddr> {
    match wire_addr.transport {
        0x01 => {
            // TCPv4
            let ip = Ipv4Addr::new(
                wire_addr.address[0],
                wire_addr.address[1],
                wire_addr.address[2],
                wire_addr.address[3],
            );
            Some(SocketAddr::new(IpAddr::V4(ip), wire_addr.port))
        }
        0x02 => {
            // TCPv6
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&wire_addr.address[..16]);
            let ip = Ipv6Addr::from(bytes);
            Some(SocketAddr::new(IpAddr::V6(ip), wire_addr.port))
        }
        _ => None,
    }
}

/// Encode a `SocketAddr` as a `WireAddr` for an ADDR message (inverse of
/// `wire_addr_to_socket_addr`): IPv4 → transport 0x01 with raw octets in the first 4
/// bytes; IPv6 → transport 0x02 with the 16 address bytes.
fn socket_addr_to_wire(addr: SocketAddr, last_seen: u32) -> crate::network::messages::WireAddr {
    let mut w = crate::network::messages::WireAddr {
        transport: 0x01,
        address: [0u8; 64],
        port: addr.port(),
        services: 0,
        last_seen,
    };
    match addr.ip() {
        IpAddr::V4(v4) => {
            w.transport = 0x01;
            w.address[0..4].copy_from_slice(&v4.octets());
        }
        IpAddr::V6(v6) => {
            w.transport = 0x02;
            w.address[0..16].copy_from_slice(&v6.octets());
        }
    }
    w
}

// ============================================================================
// BackgroundTaskRunner
// ============================================================================

/// Manages background tasks for the node
///
/// The BackgroundTaskRunner spawns and manages periodic background tasks
/// that run during node operation. All tasks respond to a shutdown signal
/// for graceful termination.
///
/// # Example
///
/// ```no_run
/// use tokio::sync::watch;
/// use swimchain::node::tasks::BackgroundTaskRunner;
///
/// async fn example() {
///     let (tx, rx) = watch::channel(false);
///     let mut runner = BackgroundTaskRunner::new(rx);
///
///     // Spawn tasks with available subsystems
///     runner.spawn_all(None, None, None);
///
///     // Later, shutdown
///     tx.send(true).ok();
///     runner.shutdown().await;
/// }
/// ```
pub struct BackgroundTaskRunner {
    /// Task handles for spawned tasks
    handles: Vec<JoinHandle<()>>,
    /// Shutdown signal receiver
    shutdown_rx: watch::Receiver<bool>,
}

impl BackgroundTaskRunner {
    /// Create a new BackgroundTaskRunner
    ///
    /// # Arguments
    ///
    /// * `shutdown_rx` - Watch receiver for shutdown signal
    #[must_use]
    pub fn new(shutdown_rx: watch::Receiver<bool>) -> Self {
        Self {
            handles: Vec::with_capacity(7), // Pre-allocate for 7 tasks
            shutdown_rx,
        }
    }

    /// Shutdown all background tasks
    ///
    /// Aborts all running tasks and waits briefly for cleanup.
    pub async fn shutdown(&mut self) {
        info!("Shutting down {} background tasks", self.handles.len());

        for handle in self.handles.drain(..) {
            handle.abort();
        }

        // Brief wait for graceful cleanup (100ms)
        tokio::time::sleep(Duration::from_millis(100)).await;

        debug!("Background tasks shutdown complete");
    }

    /// Returns the number of running tasks
    #[must_use]
    pub fn task_count(&self) -> usize {
        self.handles.len()
    }

    // ========================================================================
    // Individual task spawners
    // ========================================================================

    /// Spawn the sync loop task
    ///
    /// Checks for new blocks every 30 seconds.
    pub fn spawn_sync_loop(
        &mut self,
        _syncer: Arc<ChainSyncer>,
        connection_pool: Arc<PeerConnectionPool>,
        chain_store: Option<Arc<crate::storage::ChainStore>>,
    ) {
        use crate::network::messages::{GetBlocksLocatorPayload, GetHeadersLocatorPayload};

        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(SYNC_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            // Track whether we've done initial header sync
            let mut initial_headers_fetched = false;

            info!(
                "[SYNC-LOOP] Started with headers-first sync ({}s interval)",
                SYNC_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased; // Check shutdown first

                    _ = shutdown.changed() => {
                        info!("[SYNC-LOOP] Received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        let store = match &chain_store {
                            Some(s) => s,
                            None => {
                                debug!("[SYNC-LOOP] No chain store, skipping sync");
                                continue;
                            }
                        };

                        // Generate Bitcoin-style locator from our chain
                        // Pattern: [tip, tip-1, tip-2, tip-4, tip-8, ..., genesis]
                        let locator_hashes = match store.generate_locator() {
                            Ok(hashes) => hashes,
                            Err(e) => {
                                warn!("[SYNC-LOOP] Failed to generate locator: {}", e);
                                continue;
                            }
                        };

                        let our_height = store.get_latest_height().ok().flatten().unwrap_or(0);

                        // Get connected peers
                        let peer_ids = connection_pool.peer_ids().await;
                        if peer_ids.is_empty() {
                            debug!("[SYNC-LOOP] No peers connected, skipping sync");
                            continue;
                        }

                        debug!(
                            "[SYNC-LOOP] Height={}, locator_hashes={}, peers={}",
                            our_height,
                            locator_hashes.len(),
                            peer_ids.len()
                        );

                        // Headers-first sync on initial startup (height 0 or very low)
                        // Request headers first to verify PoW chain before downloading full blocks
                        if our_height <= 5 && !initial_headers_fetched {
                            info!("[SYNC-LOOP] Initial sync - requesting headers first");
                            let headers_request = GetHeadersLocatorPayload::new(locator_hashes.clone(), 500);

                            let headers_envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                                crate::types::network::MessageType::GetHeadersLocator,
                                headers_request.to_bytes(),
                            );

                            // Send headers request to first peer
                            if let Some(peer_id) = peer_ids.first() {
                                if let Ok(()) = connection_pool.send_to(peer_id, &headers_envelope).await {
                                    info!(
                                        "[SYNC-LOOP] Sent GETHEADERS_LOCATOR to peer {} for initial sync",
                                        hex::encode(&peer_id[..8])
                                    );
                                    initial_headers_fetched = true;
                                }
                            }
                        }

                        // Regular locator-based block sync (always send this)
                        let request = GetBlocksLocatorPayload::new(locator_hashes, 20);

                        let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::GetBlocksLocator,
                            request.to_bytes(),
                        );

                        // Send to up to 3 random peers
                        let mut sent = 0;
                        for peer_id in peer_ids.iter().take(3) {
                            if let Ok(()) = connection_pool.send_to(peer_id, &envelope).await {
                                debug!(
                                    "[SYNC-LOOP] Sent GETBLOCKS_LOCATOR to peer {}",
                                    hex::encode(&peer_id[..8])
                                );
                                sent += 1;
                            }
                        }

                        if sent > 0 {
                            info!(
                                "[SYNC-LOOP] Sent locator sync request to {} peers (height={})",
                                sent,
                                our_height
                            );
                        }

                        // Content backfill: headers-first sync leaves root headers whose
                        // space/content blocks were never downloaded — spaces then show
                        // placeholder names and zero posts. Locator sync can't repair this
                        // (the tip already matches, so peers answer "synced"). Request the
                        // gap heights as full blocks; peers only hold non-decayed content,
                        // so the network itself bounds what comes back.
                        match store.find_content_gap_heights(64) {
                            Ok(gaps) if !gaps.is_empty() => {
                                let start = *gaps.first().unwrap_or(&0);
                                let end = *gaps.last().unwrap_or(&start);
                                info!(
                                    "[SYNC-LOOP] Content backfill: {} gap heights in {}..{}, requesting full blocks",
                                    gaps.len(),
                                    start,
                                    end
                                );
                                let backfill = GetBlocksPayload {
                                    start_height: start,
                                    end_height: end,
                                    include_content: true,
                                    max_blocks: 64,
                                };
                                let backfill_envelope =
                                    crate::types::network::MessageEnvelope::new_fork_agnostic(
                                        crate::types::network::MessageType::GetBlocks,
                                        backfill.to_bytes(),
                                    );
                                if let Some(peer_id) = peer_ids.first() {
                                    if let Ok(()) = connection_pool.send_to(peer_id, &backfill_envelope).await {
                                        info!(
                                            "[SYNC-LOOP] Sent GETBLOCKS backfill to peer {}",
                                            hex::encode(&peer_id[..8])
                                        );
                                    }
                                }
                            }
                            Ok(_) => {}
                            Err(e) => warn!("[SYNC-LOOP] Content gap scan failed: {}", e),
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the branch-selective sync task (BRANCH_SELECTIVE_SYNC.md §4)
    ///
    /// Syncs subscribed branches every 45 seconds by:
    /// 1. Getting list of subscribed branches from BranchSubscriptionManager
    /// 2. Finding peers that serve those branches via PeerBranchTracker
    /// 3. Sending GETBLOCKS_BRANCH requests to appropriate peers
    pub fn spawn_branch_sync(
        &mut self,
        connection_pool: Arc<PeerConnectionPool>,
        branch_subscription_manager: Arc<RwLock<BranchSubscriptionManager>>,
        peer_branch_tracker: Arc<RwLock<PeerBranchTracker>>,
        chain_store: Option<Arc<crate::storage::ChainStore>>,
    ) {
        use crate::network::messages::GetBlocksBranchPayload;
        use crate::types::network::MessageType;

        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(BRANCH_SYNC_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            info!(
                "[BRANCH-SYNC] Started branch-selective sync ({}s interval)",
                BRANCH_SYNC_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        info!("[BRANCH-SYNC] Received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // Get our current height for sync requests
                        let our_height = chain_store.as_ref()
                            .and_then(|s| s.get_latest_height().ok().flatten())
                            .unwrap_or(0);

                        // Get active subscriptions
                        let subscriptions = {
                            let sub_mgr = branch_subscription_manager.read().unwrap();
                            sub_mgr.subscription_list()
                        };

                        if subscriptions.is_empty() {
                            debug!("[BRANCH-SYNC] No active subscriptions, skipping sync");
                            continue;
                        }

                        debug!(
                            "[BRANCH-SYNC] Syncing {} subscribed branches at height {}",
                            subscriptions.len(),
                            our_height
                        );

                        // For each subscribed branch, find peers and request blocks
                        for (space_id, branch_path) in subscriptions {
                            // Find peers serving this branch
                            let peers = {
                                let tracker = peer_branch_tracker.read().unwrap();
                                tracker.peers_for_branch(&space_id, &branch_path)
                            };

                            // Create request for this branch
                            let request = GetBlocksBranchPayload::new(
                                space_id,
                                branch_path.clone(),
                                our_height.saturating_sub(10), // Request recent blocks
                                50, // Max blocks per request
                            );

                            let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                                MessageType::GetBlocksBranch,
                                request.to_bytes(),
                            );

                            if peers.is_empty() {
                                debug!(
                                    "[BRANCH-SYNC] No peers serve space={} branch_depth={}, trying all connected peers",
                                    hex::encode(&space_id[..8]),
                                    branch_path.depth()
                                );

                                // Fall back to sending to any connected peer
                                let all_peers = connection_pool.peer_ids().await;
                                if all_peers.is_empty() {
                                    continue;
                                }

                                // Send to first available peer
                                if let Some(peer_id) = all_peers.first() {
                                    if let Ok(()) = connection_pool.send_to(peer_id, &envelope).await {
                                        debug!(
                                            "[BRANCH-SYNC] Sent GETBLOCKS_BRANCH for space={} to peer {}",
                                            hex::encode(&space_id[..8]),
                                            hex::encode(&peer_id[..8])
                                        );
                                    }
                                }
                            } else {
                                // Send to first peer that serves this branch
                                if let Some(peer_id) = peers.first() {
                                    if let Ok(()) = connection_pool.send_to(peer_id, &envelope).await {
                                        info!(
                                            "[BRANCH-SYNC] Sent GETBLOCKS_BRANCH for space={} branch_depth={} to peer {}",
                                            hex::encode(&space_id[..8]),
                                            branch_path.depth(),
                                            hex::encode(&peer_id[..8])
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the decay tick task
    ///
    /// Processes content decay every 60 seconds.
    /// Prunes decayed content and adapts half-life based on storage pressure.
    pub fn spawn_decay_tick(&mut self, decay_integration: Option<Arc<DecayIntegration>>) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(DECAY_TICK_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut tick_count: u64 = 0;

            debug!(
                "Decay tick started ({}s interval)",
                DECAY_TICK_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        debug!("Decay tick received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        tick_count += 1;

                        if let Some(ref decay) = decay_integration {
                            // Run pruning every tick (60s)
                            match decay.prune() {
                                Ok(stats) => {
                                    if stats.items_pruned > 0 {
                                        info!(
                                            "[DECAY] Pruned {} items ({}KB freed)",
                                            stats.items_pruned,
                                            stats.bytes_freed / 1024
                                        );
                                    } else {
                                        debug!("[DECAY] Prune tick: {} checked, {} protected",
                                            stats.items_checked, stats.items_protected);
                                    }
                                }
                                Err(e) => {
                                    warn!("[DECAY] Prune error: {}", e);
                                }
                            }

                            // Adapt half-life every 60 ticks (roughly every hour)
                            if tick_count % 60 == 0 {
                                match decay.adapt_half_life() {
                                    Ok(new_half_life) => {
                                        debug!("[DECAY] Half-life adapted to {}s", new_half_life);
                                    }
                                    Err(e) => {
                                        warn!("[DECAY] Half-life adaptation error: {}", e);
                                    }
                                }
                            }
                        } else {
                            debug!("Decay tick executed (no decay integration)");
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the peer maintenance task
    ///
    /// Checks peer count and connection health every 60 seconds.
    pub fn spawn_peer_maintenance(&mut self, connection_manager: Arc<ConnectionManager>) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(PEER_MAINTENANCE_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            debug!(
                "Peer maintenance started ({}s interval)",
                PEER_MAINTENANCE_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        debug!("Peer maintenance received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        let count = connection_manager.connection_count();
                        let needs_more = connection_manager.needs_more_peers();

                        debug!(
                            "Peer maintenance: {} connections, needs_more={}",
                            count, needs_more
                        );

                        // TODO: When peer store integration complete:
                        // if needs_more {
                        //     connection_manager.reconnect_to_best_peers().await;
                        // }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the keepalive task
    ///
    /// Sends PING to all connections every 2 minutes to keep them alive
    /// and detect dead connections.
    pub fn spawn_keepalive(
        &mut self,
        connection_manager: Arc<ConnectionManager>,
        connection_pool: Arc<PeerConnectionPool>,
        chain_store: Option<Arc<crate::storage::ChainStore>>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(KEEPALIVE_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut nonce_counter: u64 = 0;
            let mut tip_announce_counter: u64 = 0;

            debug!("Keepalive started ({}s interval)", KEEPALIVE_INTERVAL_SECS);

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        debug!("Keepalive received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        let peer_ids = connection_pool.peer_ids().await;
                        let count = peer_ids.len();

                        if count == 0 {
                            debug!("Keepalive: no connections to ping");
                            continue;
                        }

                        debug!("Keepalive: pinging {} connections", count);

                        // Send PING to all peers
                        for peer_id in peer_ids {
                            nonce_counter = nonce_counter.wrapping_add(1);
                            let ping = PingPongPayload::new(nonce_counter);
                            let envelope = MessageEnvelope::new(
                                MessageType::Ping,
                                [0u8; 32], // PING uses zero fork_id
                                ping.to_bytes(),
                            );

                            match connection_pool.send_to(&peer_id, &envelope).await {
                                Ok(()) => {
                                    debug!(
                                        "[PING] Sent to {} (nonce={})",
                                        hex::encode(&peer_id[..8]),
                                        nonce_counter
                                    );
                                }
                                Err(e) => {
                                    warn!(
                                        "[PING] Failed to send to {}: {}",
                                        hex::encode(&peer_id[..8]),
                                        e
                                    );
                                    // Connection might be dead - ConnectionManager will
                                    // eventually clean it up via error handling
                                }
                            }
                        }

                        info!("Keepalive: sent PING to {} peers", count);

                        // Periodic tip announcement - first tick then every 3rd (6 minutes)
                        // This ensures peers learn about our blocks even if they missed initial announcements
                        tip_announce_counter += 1;
                        if tip_announce_counter == 1 || tip_announce_counter % 3 == 0 {
                            if let Some(ref cs) = chain_store {
                                if let Ok(Some(our_height)) = cs.get_latest_height() {
                                    if our_height > 0 {
                                        if let Ok(Some(tip_hash)) = cs.get_root_hash_at_height(our_height) {
                                            if let Ok(Some(block)) = cs.get_root_block(&tip_hash) {
                                                use crate::network::messages::BlockAnnouncePayload;
                                                use crate::types::serialize::Serialize;

                                                let announce = BlockAnnouncePayload {
                                                    block_hash: tip_hash,
                                                    height: our_height,
                                                    total_pow: block.cumulative_pow,
                                                    space_block_count: block.space_block_hashes.len() as u32,
                                                    timestamp: block.timestamp,
                                                };

                                                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                                                    crate::types::network::MessageType::BlockAnnounce,
                                                    announce.to_bytes().to_vec(),
                                                );

                                                let announced = connection_pool.broadcast(&envelope).await;
                                                info!(
                                                    "[TIP-ANNOUNCE] Broadcast tip height={} hash={} to {} peers",
                                                    our_height,
                                                    hex::encode(&tip_hash[..8]),
                                                    announced
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the sponsorship offer sync task (SPEC_11 §5.1)
    ///
    /// Queries connected peers for sponsorship offers every 2 minutes.
    /// This ensures new nodes receive existing offers that were created
    /// before they joined the network (offers only propagate via TTL-3
    /// gossip when first created).
    ///
    /// The task:
    /// 1. Sends SPONSORSHIP_OFFER_QUERY to up to 3 random peers
    /// 2. Peers respond with SPONSORSHIP_OFFER_LIST containing active offers
    /// 3. The router's handle_sponsorship_offer_list stores new offers
    pub fn spawn_sponsorship_offer_sync(
        &mut self,
        connection_pool: Arc<PeerConnectionPool>,
        offer_store: Arc<OfferStore>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(SPONSORSHIP_OFFER_SYNC_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            // Do initial sync after a short delay to allow connections to establish
            let mut initial_sync_done = false;

            info!(
                "[SPONSORSHIP-SYNC] Started ({}s interval)",
                SPONSORSHIP_OFFER_SYNC_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        info!("[SPONSORSHIP-SYNC] Received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        let peer_ids = connection_pool.peer_ids().await;
                        if peer_ids.is_empty() {
                            debug!("[SPONSORSHIP-SYNC] No peers connected, skipping");
                            continue;
                        }

                        // Check how many offers we already have
                        let current_offer_count = offer_store.total_offer_count();

                        // On initial sync (first tick with peers), query more aggressively
                        let query_count = if !initial_sync_done && current_offer_count == 0 {
                            initial_sync_done = true;
                            peer_ids.len().min(5) // Query up to 5 peers on first sync
                        } else {
                            peer_ids.len().min(2) // Regular sync: query 2 peers
                        };

                        // Build SPONSORSHIP_OFFER_QUERY message (empty payload - just requests all offers)
                        let envelope = MessageEnvelope::new_fork_agnostic(
                            MessageType::SponsorshipOfferQuery,
                            Vec::new(), // Empty payload
                        );

                        let mut sent = 0;
                        for peer_id in peer_ids.iter().take(query_count) {
                            if let Ok(()) = connection_pool.send_to(peer_id, &envelope).await {
                                debug!(
                                    "[SPONSORSHIP-SYNC] Sent SPONSORSHIP_OFFER_QUERY to peer {}",
                                    hex::encode(&peer_id[..8])
                                );
                                sent += 1;
                            }
                        }

                        if sent > 0 {
                            info!(
                                "[SPONSORSHIP-SYNC] Queried {} peers for offers (have {} offers)",
                                sent,
                                current_offer_count
                            );
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the DHT peer discovery task
    ///
    /// Uses Kademlia DHT to discover new peers every 60 seconds.
    /// Per SPEC_06 §4.1: DHT is a discovery layer for finding peers network-wide.
    ///
    /// The task:
    /// 1. Generates a random target NodeId
    /// 2. Queries known nodes for peers close to that target
    /// 3. Adds discovered nodes to the routing table
    /// 4. Connects to new peers if we need more connections
    pub fn spawn_dht_peer_discovery(
        &mut self,
        dht: Arc<DhtManager>,
        connection_pool: Arc<PeerConnectionPool>,
        connection_manager: Arc<ConnectionManager>,
        transport: Arc<TcpTransport>,
        router: Arc<MessageRouter>,
        data_dir: PathBuf,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(DHT_DISCOVERY_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            info!(
                "[DHT-DISCOVERY] Started ({}s interval)",
                DHT_DISCOVERY_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        info!("[DHT-DISCOVERY] Received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // Check if we need more peers
                        let needs_more = connection_manager.needs_more_peers();
                        let current_count = connection_manager.connection_count();

                        if !needs_more {
                            debug!(
                                "[DHT-DISCOVERY] Have {} peers, no discovery needed",
                                current_count
                            );
                            continue;
                        }

                        info!(
                            "[DHT-DISCOVERY] Need more peers (have {}), starting discovery",
                            current_count
                        );

                        // Generate a random target to discover diverse peers
                        let mut random_target = [0u8; 32];
                        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut random_target);
                        let target = DhtNodeId::from_bytes(random_target);

                        // Get nodes from our routing table to query
                        let closest_nodes = dht.get_closest_nodes(&target, 8).await;

                        if closest_nodes.is_empty() {
                            info!("[DHT-DISCOVERY] No nodes in DHT routing table to query");
                            continue;
                        }

                        info!(
                            "[DHT-DISCOVERY] Querying {} nodes in DHT routing table",
                            closest_nodes.len()
                        );

                        // Query each known node for peers close to the target
                        let mut discovered_count = 0;
                        for node in &closest_nodes {
                            // Build FIND_NODE message
                            let find_node_msg = DhtMessage::FindNode { target };
                            let payload = find_node_msg.to_bytes();

                            // Create network envelope
                            let envelope = MessageEnvelope::new_fork_agnostic(
                                MessageType::DhtFindNode,
                                payload,
                            );

                            // Try to send to this node
                            // First check if we're connected to them
                            let node_id_bytes = *node.id.as_bytes();
                            if let Ok(()) = connection_pool.send_to(&node_id_bytes, &envelope).await {
                                debug!(
                                    "[DHT-DISCOVERY] Sent FIND_NODE to {}",
                                    hex::encode(&node_id_bytes[..8])
                                );
                                // Note: Response will come through message router
                                // and be handled by DhtManager.handle_message
                            } else {
                                // Not connected - try to connect
                                debug!(
                                    "[DHT-DISCOVERY] Not connected to {}, trying to connect",
                                    hex::encode(&node_id_bytes[..8])
                                );

                                match transport.connect(node.addr).await {
                                    Ok(conn) => {
                                        let peer_info = conn.peer_info().cloned();
                                        let remote_addr = conn.remote_addr();

                                        if let Some(info) = peer_info {
                                            let peer_id = info.node_id;

                                            // Register with ConnectionManager
                                            if let Err(e) = connection_manager.add_connection(
                                                peer_id,
                                                remote_addr,
                                                ConnectionDirection::Outbound,
                                            ) {
                                                warn!(
                                                    "[DHT-DISCOVERY] Failed to register connection to {}: {}",
                                                    remote_addr, e
                                                );
                                                continue;
                                            }

                                            // Add to connection pool
                                            let established = conn.is_established();
                                            let stream = conn.into_stream();
                                            let peer_conn = connection_pool.add(stream, peer_id, established).await;

                                            // Update DHT routing table with this node
                                            let dht_id = DhtNodeId::from_bytes(peer_id);
                                            if let Err(e) = dht.on_node_seen(dht_id, remote_addr).await {
                                                warn!("[DHT-DISCOVERY] Failed to update routing table: {:?}", e);
                                            }

                                            // Send content inventory to new peer (I_HAVE for all local content)
                                            // This ensures the peer knows what content we have for WHO_HAS queries.
                                            // Throttled per-peer: re-scanning + re-flooding on every (re)connect
                                            // pegs the CPU under seed-node connection churn.
                                            let sync_blobs_path = data_dir.join("sync_blobs");
                                            if sync_blobs_path.exists()
                                                && connection_pool.should_send_inventory(&peer_id).await
                                            {
                                                let mut inventory_count = 0;
                                                if let Ok(prefix_dirs) = std::fs::read_dir(&sync_blobs_path) {
                                                    for prefix_entry in prefix_dirs.flatten() {
                                                        let prefix_path = prefix_entry.path();
                                                        if prefix_path.is_dir() {
                                                            if let Ok(files) = std::fs::read_dir(&prefix_path) {
                                                                let prefix = prefix_path.file_name()
                                                                    .and_then(|f| f.to_str())
                                                                    .unwrap_or("");
                                                                for file_entry in files.flatten() {
                                                                    let file_path = file_entry.path();
                                                                    if file_path.is_file() {
                                                                        let suffix = file_path.file_name()
                                                                            .and_then(|f| f.to_str())
                                                                            .unwrap_or("");
                                                                        let full_hash_hex = format!("{}{}", prefix, suffix);

                                                                        if let Ok(hash_bytes) = hex::decode(&full_hash_hex) {
                                                                            if hash_bytes.len() == 32 {
                                                                                let mut content_hash = [0u8; 32];
                                                                                content_hash.copy_from_slice(&hash_bytes);

                                                                                let envelope = MessageEnvelope::new_fork_agnostic(
                                                                                    MessageType::IHave,
                                                                                    content_hash.to_vec(),
                                                                                );
                                                                                if let Err(e) = connection_pool.send_to(&peer_id, &envelope).await {
                                                                                    warn!("[DHT-DISCOVERY] Failed to send I_HAVE: {}", e);
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
                                                    info!("[DHT-DISCOVERY] Sent {} I_HAVE messages to peer {}", inventory_count, hex::encode(&peer_id[..8]));
                                                }
                                            }

                                            // Request peer's mempool (Bitcoin-style mempool sync)
                                            let getmempool_envelope = MessageEnvelope::new_fork_agnostic(
                                                MessageType::GetMempool,
                                                Vec::new(), // Empty payload
                                            );
                                            if let Err(e) = connection_pool.send_to(&peer_id, &getmempool_envelope).await {
                                                warn!("[DHT-DISCOVERY] Failed to send GETMEMPOOL: {}", e);
                                            } else {
                                                debug!("[DHT-DISCOVERY] Sent GETMEMPOOL to peer {}", hex::encode(&peer_id[..8]));
                                            }

                                            // Spawn message read loop
                                            let router_clone = router.clone();
                                            let pool_clone = connection_pool.clone();
                                            let cm_clone = connection_manager.clone();

                                            tokio::spawn(async move {
                                                Self::message_read_loop(
                                                    peer_conn,
                                                    peer_id,
                                                    router_clone,
                                                    pool_clone,
                                                    cm_clone,
                                                ).await;
                                            });

                                            discovered_count += 1;
                                            info!(
                                                "[DHT-DISCOVERY] Connected to new peer {} ({})",
                                                remote_addr,
                                                hex::encode(&peer_id[..8])
                                            );

                                            // Now send the FIND_NODE to discover more peers
                                            if let Err(e) = connection_pool.send_to(&peer_id, &envelope).await {
                                                warn!(
                                                    "[DHT-DISCOVERY] Failed to send FIND_NODE after connect: {}",
                                                    e
                                                );
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        debug!(
                                            "[DHT-DISCOVERY] Failed to connect to {}: {}",
                                            node.addr, e
                                        );
                                        // Record failure in DHT
                                        dht.on_node_failed(&node.id).await;
                                    }
                                }
                            }
                        }

                        if discovered_count > 0 {
                            info!(
                                "[DHT-DISCOVERY] Discovered and connected to {} new peers",
                                discovered_count
                            );
                        }

                        // Log DHT stats
                        let stats = dht.get_stats().await;
                        debug!(
                            "[DHT-DISCOVERY] Routing table: {} nodes in {} buckets",
                            stats.total_nodes,
                            stats.non_empty_buckets
                        );
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the GETADDR peer discovery task
    ///
    /// Periodically sends GETADDR to connected peers to discover new peers.
    /// Also tries to connect to addresses from the PeerStore when we have few peers.
    /// This complements DHT by using the peer exchange protocol.
    pub fn spawn_getaddr_discovery(
        &mut self,
        connection_pool: Arc<PeerConnectionPool>,
        connection_manager: Arc<ConnectionManager>,
        transport: Arc<TcpTransport>,
        router: Arc<MessageRouter>,
        data_dir: std::path::PathBuf,
    ) {
        use crate::network::messages::GetAddrPayload;
        use crate::types::constants::MSG_GETADDR;
        use crate::types::serialize::Serialize;

        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            // Run every 30 seconds
            let mut ticker = interval(Duration::from_secs(30));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            info!("[GETADDR-DISCOVERY] Started (30s interval)");

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        info!("[GETADDR-DISCOVERY] Received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // Check if we need more peers
                        if !connection_manager.needs_more_peers() {
                            debug!("[GETADDR-DISCOVERY] Have enough peers, skipping");
                            continue;
                        }

                        let current_count = connection_manager.connection_count();
                        info!(
                            "[GETADDR-DISCOVERY] Need more peers (have {})",
                            current_count
                        );

                        // Get list of connected peers
                        let peer_ids = connection_pool.peer_ids().await;

                        // If we have no peers, try to connect from peer store
                        if peer_ids.is_empty() || current_count < 3 {
                            info!("[GETADDR-DISCOVERY] Few/no peers, trying to connect from PeerStore");

                            // Get candidates from connection manager (already filters connected peers)
                            let candidates = connection_manager.select_peers_to_connect();
                            let mut connect_attempts = 0;

                            for entry in candidates.iter().take(10) {
                                // Convert WireAddr to SocketAddr
                                let sock_addr = match wire_addr_to_socket_addr(&entry.wire_addr) {
                                    Some(addr) => addr,
                                    None => continue,
                                };

                                info!("[GETADDR-DISCOVERY] Trying to connect to stored peer {}", sock_addr);

                                // Try to connect
                                match transport.connect(sock_addr).await {
                                    Ok(conn) => {
                                        // Get peer_id from the connection's peer_info
                                        let peer_id = match conn.peer_info() {
                                            Some(info) => info.node_id,
                                            None => {
                                                debug!("[GETADDR-DISCOVERY] Connection has no peer_info");
                                                continue;
                                            }
                                        };

                                        // Register with connection manager
                                        if let Err(e) = connection_manager.add_connection(
                                            peer_id,
                                            sock_addr,
                                            crate::transport::ConnectionDirection::Outbound,
                                        ) {
                                            debug!("[GETADDR-DISCOVERY] Failed to register connection: {}", e);
                                            continue;
                                        }

                                        // Add to connection pool
                                        let stream = conn.into_stream();
                                        let peer_conn = connection_pool.add(stream, peer_id, true).await;

                                        // Request peer's mempool (Bitcoin-style mempool sync)
                                        let getmempool_envelope = MessageEnvelope::new_fork_agnostic(
                                            MessageType::GetMempool,
                                            Vec::new(),
                                        );
                                        if let Err(e) = connection_pool.send_to(&peer_id, &getmempool_envelope).await {
                                            warn!("[GETADDR-DISCOVERY] Failed to send GETMEMPOOL: {}", e);
                                        } else {
                                            debug!("[GETADDR-DISCOVERY] Sent GETMEMPOOL to peer {}", hex::encode(&peer_id[..8]));
                                        }

                                        // Spawn message loop
                                        let router_clone = router.clone();
                                        let pool_clone = connection_pool.clone();
                                        let cm_clone = connection_manager.clone();

                                        tokio::spawn(async move {
                                            Self::message_read_loop(
                                                peer_conn,
                                                peer_id,
                                                router_clone,
                                                pool_clone,
                                                cm_clone,
                                            ).await;
                                        });

                                        connect_attempts += 1;
                                        info!(
                                            "[GETADDR-DISCOVERY] Connected to stored peer {} ({})",
                                            sock_addr,
                                            hex::encode(&peer_id[..8])
                                        );

                                        // Stop after a few successful connections
                                        if connect_attempts >= 3 {
                                            break;
                                        }
                                    }
                                    Err(e) => {
                                        debug!("[GETADDR-DISCOVERY] Failed to connect to {}: {}", sock_addr, e);
                                    }
                                }
                            }

                            if connect_attempts > 0 {
                                info!("[GETADDR-DISCOVERY] Connected to {} peers from PeerStore", connect_attempts);
                            }
                        }

                        // If we have peers now, send GETADDR to them
                        let peer_ids = connection_pool.peer_ids().await;
                        if !peer_ids.is_empty() {
                            // Send GETADDR to first 3 peers
                            let getaddr = GetAddrPayload::default();
                            let envelope = MessageEnvelope::new_fork_agnostic(
                                MessageType::GetAddr,
                                getaddr.to_bytes(),
                            );

                            let mut sent = 0;
                            for peer_id in peer_ids.iter().take(3) {
                                if let Ok(()) = connection_pool.send_to(peer_id, &envelope).await {
                                    info!(
                                        "[GETADDR-DISCOVERY] Sent GETADDR to peer {}",
                                        hex::encode(&peer_id[..8])
                                    );
                                    sent += 1;
                                }
                            }

                            if sent > 0 {
                                info!("[GETADDR-DISCOVERY] Sent GETADDR to {} peers", sent);
                            }

                            // NAT reflection: re-announce our learned public endpoint so
                            // the seed relays a DIALABLE address. During the initial
                            // handshake we could only advertise our stale 0.0.0.0/LAN
                            // address (we hadn't been told our public one yet), so peers
                            // learned an undialable endpoint. Now that we know it, push it.
                            if let Some(ext) = transport.external_addr().await {
                                use crate::network::messages::AddrPayload;
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs() as u32)
                                    .unwrap_or(0);
                                let addr_payload = AddrPayload {
                                    addresses: vec![socket_addr_to_wire(ext, now)],
                                };
                                let addr_env = MessageEnvelope::new_fork_agnostic(
                                    MessageType::Addr,
                                    addr_payload.to_bytes(),
                                );
                                for peer_id in peer_ids.iter().take(3) {
                                    let _ = connection_pool.send_to(peer_id, &addr_env).await;
                                }
                                info!("[NAT] Re-announced public endpoint {} to peers", ext);
                            }
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the hole-punch dialer task (Layer 2 NAT traversal).
    ///
    /// Consumes dial requests the router produces when it receives a HOLE_PUNCH_INTRO,
    /// and attempts an outbound connect to the introduced peer's public endpoint. When
    /// the other introduced peer dials us at the same moment, the two simultaneous
    /// outbound SYNs punch both NAT mappings. On success the connection is registered and
    /// a message loop is spawned, exactly like a peer discovered via GETADDR.
    ///
    /// Best-effort: a failed dial (expected for symmetric NATs — that's Layer 3's job) is
    /// logged at debug and dropped. Disabled entirely when a SOCKS5 proxy is configured
    /// (SWIM-PRIV-2 — hole-punching is meaningless over Tor and would just waste dials).
    pub fn spawn_hole_punch_dialer(
        &mut self,
        mut rx: tokio::sync::mpsc::UnboundedReceiver<super::router::HolePunchRequest>,
        transport: Arc<TcpTransport>,
        router: Arc<MessageRouter>,
        connection_pool: Arc<PeerConnectionPool>,
        connection_manager: Arc<ConnectionManager>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            // SWIM-PRIV-2: never hole-punch when proxied.
            if transport.proxy().is_some() {
                debug!("[NAT] Hole-punch dialer disabled (SOCKS5 proxy configured)");
                return;
            }
            loop {
                tokio::select! {
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            break;
                        }
                    }
                    maybe = rx.recv() => {
                        let (endpoint, target_node_id) = match maybe {
                            Some(req) => req,
                            None => break, // router (sender) dropped
                        };

                        // Might have connected since the router queued this.
                        if connection_pool.get(&target_node_id).await.is_some() {
                            continue;
                        }

                        match transport.connect(endpoint).await {
                            Ok(conn) => {
                                let peer_id = match conn.peer_info() {
                                    Some(info) => info.node_id,
                                    None => {
                                        debug!(
                                            "[NAT] Hole-punch connect to {} had no peer_info",
                                            endpoint
                                        );
                                        continue;
                                    }
                                };

                                // Register (dedups if we raced into a duplicate).
                                if let Err(e) = connection_manager.add_connection(
                                    peer_id,
                                    endpoint,
                                    ConnectionDirection::Outbound,
                                ) {
                                    debug!(
                                        "[NAT] Hole-punch to {}: already connected / register failed: {}",
                                        endpoint, e
                                    );
                                    continue;
                                }

                                let established = conn.is_established();
                                let stream = conn.into_stream();
                                let peer_conn =
                                    connection_pool.add(stream, peer_id, established).await;

                                info!(
                                    "[NAT] Hole-punch to {} SUCCEEDED ({})",
                                    endpoint,
                                    hex::encode(&peer_id[..8])
                                );

                                let router_clone = router.clone();
                                let pool_clone = connection_pool.clone();
                                let cm_clone = connection_manager.clone();
                                tokio::spawn(async move {
                                    Self::message_read_loop(
                                        peer_conn,
                                        peer_id,
                                        router_clone,
                                        pool_clone,
                                        cm_clone,
                                    )
                                    .await;
                                });
                            }
                            Err(e) => {
                                debug!("[NAT] Hole-punch dial to {} failed: {}", endpoint, e);
                            }
                        }
                    }
                }
            }
            debug!("[NAT] Hole-punch dialer stopped");
        });

        self.handles.push(handle);
    }

    /// Spawn the hole-punch coordinator task (Layer 2 NAT traversal).
    ///
    /// Periodically introduces our connected peers to each other so NAT'd peers can form
    /// direct connections. For each pair (A, B) of peers whose observed endpoints are
    /// public and dialable, we tell A about B and B about A back-to-back, so both dial
    /// within milliseconds — the near-simultaneous timing a TCP hole-punch needs.
    ///
    /// Any well-connected node can introduce, but this matters in practice for a public
    /// seed both NAT'd peers reach. A node with fewer than two public-endpoint peers is a
    /// no-op. Disabled when proxied (SWIM-PRIV-2). Receivers dedup against peers they are
    /// already connected to, so re-introducing every round is cheap and self-healing.
    pub fn spawn_hole_punch_coordinator(
        &mut self,
        transport: Arc<TcpTransport>,
        connection_pool: Arc<PeerConnectionPool>,
    ) {
        use crate::network::messages::HolePunchIntroPayload;
        use crate::transport::is_public_addr;

        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            if transport.proxy().is_some() {
                debug!("[NAT] Hole-punch coordinator disabled (SOCKS5 proxy configured)");
                return;
            }
            let mut ticker = interval(Duration::from_secs(HOLE_PUNCH_COORD_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            break;
                        }
                    }
                    _ = ticker.tick() => {
                        // Peers with a public, dialable endpoint. Capped to bound the
                        // O(n^2) pairwise introductions.
                        let peers: Vec<([u8; 32], SocketAddr)> = connection_pool
                            .peer_endpoints()
                            .await
                            .into_iter()
                            .filter(|(_, addr)| is_public_addr(addr))
                            .take(HOLE_PUNCH_MAX_PEERS)
                            .collect();

                        if peers.len() < 2 {
                            continue;
                        }

                        let mut intros = 0usize;
                        for i in 0..peers.len() {
                            for j in (i + 1)..peers.len() {
                                let (a_id, a_addr) = peers[i];
                                let (b_id, b_addr) = peers[j];

                                // Tell A about B, and B about A.
                                let to_a = MessageEnvelope::new_fork_agnostic(
                                    MessageType::HolePunchIntro,
                                    HolePunchIntroPayload::new(b_id, b_addr).to_bytes().to_vec(),
                                );
                                let to_b = MessageEnvelope::new_fork_agnostic(
                                    MessageType::HolePunchIntro,
                                    HolePunchIntroPayload::new(a_id, a_addr).to_bytes().to_vec(),
                                );
                                let _ = connection_pool.send_to(&a_id, &to_a).await;
                                let _ = connection_pool.send_to(&b_id, &to_b).await;
                                intros += 1;
                            }
                        }

                        if intros > 0 {
                            info!(
                                "[NAT] Sent {} hole-punch introduction(s) across {} peers",
                                intros,
                                peers.len()
                            );
                        }
                    }
                }
            }
            debug!("[NAT] Hole-punch coordinator stopped");
        });

        self.handles.push(handle);
    }

    /// Spawn the availability announcer task
    ///
    /// Announces seeding availability every 5 minutes.
    /// Phase 1: Placeholder - SeedingManager integration pending.
    pub fn spawn_availability_announcer(&mut self) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(AVAILABILITY_ANNOUNCE_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            debug!(
                "Availability announcer started ({}s interval)",
                AVAILABILITY_ANNOUNCE_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        debug!("Availability announcer received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // TODO: Integrate with SeedingManager
                        // seeding_manager.broadcast_availability()
                        debug!("Availability announcement (placeholder)");
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the accept loop task
    ///
    /// Accepts incoming connections, completes handshake, and registers with ConnectionManager.
    /// This is the core networking task that enables multi-node connectivity.
    pub fn spawn_accept_loop(
        &mut self,
        transport: Arc<TcpTransport>,
        connection_manager: Arc<ConnectionManager>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            debug!("Accept loop started");

            loop {
                tokio::select! {
                    biased; // Check shutdown first

                    _ = shutdown.changed() => {
                        debug!("Accept loop received shutdown signal");
                        break;
                    }
                    result = transport.accept() => {
                        match result {
                            Ok(conn) => {
                                // Extract peer info before registering
                                let peer_info = conn.peer_info();
                                let remote_addr = conn.remote_addr();

                                if let Some(info) = peer_info {
                                    let peer_id = info.node_id;
                                    let discovery_addr = info.inbound_discovery_addr();
                                    let peer_freq = crate::network::frequency::unpack_node_services(
                                        info.services,
                                    )
                                    .0;

                                    // Register the connection
                                    match connection_manager.add_connection_with_discovery(
                                        peer_id,
                                        remote_addr,
                                        ConnectionDirection::Inbound,
                                        discovery_addr,
                                        peer_freq,
                                    ) {
                                        Ok(_) => {
                                            info!(
                                                "Accepted connection from {} ({})",
                                                remote_addr,
                                                hex::encode(&peer_id[..8])
                                            );
                                        }
                                        Err(e) => {
                                            warn!(
                                                "Failed to register connection from {}: {}",
                                                remote_addr, e
                                            );
                                        }
                                    }
                                } else {
                                    warn!(
                                        "Accepted connection from {} but no peer info available",
                                        remote_addr
                                    );
                                }
                            }
                            Err(e) => {
                                warn!("Accept error: {}", e);
                                // Continue accepting - don't crash on individual errors
                            }
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the accept loop with message routing
    ///
    /// Enhanced version of spawn_accept_loop that:
    /// 1. Stores connections in PeerConnectionPool for message I/O
    /// 2. Spawns per-connection message reading tasks
    /// 3. Routes incoming messages to MessageRouter
    /// 4. Sends response messages back to peers
    ///
    /// This is the core networking task that enables full message propagation.
    ///
    /// If `idle_timeout` is Some, connections will be closed after that duration
    /// of inactivity. This is used for seed nodes to maintain short-term connections.
    pub fn spawn_accept_loop_with_routing(
        &mut self,
        transport: Arc<TcpTransport>,
        connection_manager: Arc<ConnectionManager>,
        connection_pool: Arc<PeerConnectionPool>,
        router: Arc<MessageRouter>,
        dht: Arc<DhtManager>,
        data_dir: std::path::PathBuf,
    ) {
        self.spawn_accept_loop_with_routing_and_timeout(
            transport,
            connection_manager,
            connection_pool,
            router,
            dht,
            data_dir,
            None, // No idle timeout by default
        )
    }

    /// Spawn the accept loop with message routing and optional idle timeout
    ///
    /// Same as `spawn_accept_loop_with_routing` but with configurable idle timeout
    /// for seed nodes that need short-term connections.
    pub fn spawn_accept_loop_with_routing_and_timeout(
        &mut self,
        transport: Arc<TcpTransport>,
        connection_manager: Arc<ConnectionManager>,
        connection_pool: Arc<PeerConnectionPool>,
        router: Arc<MessageRouter>,
        dht: Arc<DhtManager>,
        data_dir: std::path::PathBuf,
        idle_timeout: Option<Duration>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            info!("Accept loop with routing started");

            loop {
                tokio::select! {
                    biased; // Check shutdown first

                    _ = shutdown.changed() => {
                        info!("Accept loop received shutdown signal");
                        break;
                    }
                    result = transport.accept() => {
                        match result {
                            Ok(conn) => {
                                // Extract peer info before storing
                                let peer_info = conn.peer_info().cloned();
                                let remote_addr = conn.remote_addr();

                                if let Some(info) = peer_info {
                                    let peer_id = info.node_id;
                                    // Inbound: `remote_addr` is the peer's ephemeral source port.
                                    // The dialable endpoint is (source IP + advertised listen
                                    // port); use it for discovery so others can actually reach it.
                                    let discovery_addr = info.inbound_discovery_addr();
                                    let peer_freq = crate::network::frequency::unpack_node_services(
                                        info.services,
                                    )
                                    .0;

                                    // Register with ConnectionManager (metadata tracking)
                                    match connection_manager.add_connection_with_discovery(
                                        peer_id,
                                        remote_addr,
                                        ConnectionDirection::Inbound,
                                        discovery_addr,
                                        peer_freq,
                                    ) {
                                        Ok(_) => {
                                            info!(
                                                "[ACCEPT] Connection from {} ({}) registered (advertised {:?})",
                                                remote_addr,
                                                hex::encode(&peer_id[..8]),
                                                discovery_addr
                                            );
                                        }
                                        Err(e) => {
                                            warn!(
                                                "[ACCEPT] Failed to register connection from {}: {}",
                                                remote_addr, e
                                            );
                                            continue; // Skip this connection
                                        }
                                    }

                                    // Store connection in pool for message I/O
                                    // Extract the TcpStream for splitting into read/write halves
                                    let established = conn.is_established();
                                    let stream = conn.into_stream();
                                    let peer_conn = connection_pool.add(stream, peer_id, established).await;

                                    // Add to DHT routing table for peer discovery, keyed by the
                                    // dialable endpoint (not the ephemeral source port).
                                    let dht_id = DhtNodeId::from_bytes(peer_id);
                                    if let Err(e) = dht.on_node_seen(dht_id, discovery_addr.unwrap_or(remote_addr)).await {
                                        warn!("[ACCEPT] Failed to add peer to DHT: {:?}", e);
                                    } else {
                                        debug!("[ACCEPT] Added peer {} to DHT routing table", hex::encode(&peer_id[..8]));
                                    }

                                    // Send content inventory to new peer (I_HAVE for all local content)
                                    // Content is stored in sharded structure: sync_blobs/XX/XXXX...
                                    // Throttled per-peer: re-scanning + re-flooding on every (re)connect
                                    // pegs the CPU under seed-node connection churn.
                                    let sync_blobs_path = data_dir.join("sync_blobs");
                                    if sync_blobs_path.exists()
                                        && connection_pool.should_send_inventory(&peer_id).await
                                    {
                                        let mut inventory_count = 0;
                                        // Iterate over prefix directories (e.g., "a7", "ca")
                                        if let Ok(prefix_dirs) = std::fs::read_dir(&sync_blobs_path) {
                                            for prefix_entry in prefix_dirs.flatten() {
                                                let prefix_path = prefix_entry.path();
                                                if prefix_path.is_dir() {
                                                    // Iterate over files in each prefix directory
                                                    if let Ok(files) = std::fs::read_dir(&prefix_path) {
                                                        for file_entry in files.flatten() {
                                                            let file_path = file_entry.path();
                                                            if file_path.is_file() {
                                                                // Reconstruct hash from prefix + suffix
                                                                let prefix = prefix_path.file_name()
                                                                    .and_then(|f| f.to_str())
                                                                    .unwrap_or("");
                                                                let suffix = file_path.file_name()
                                                                    .and_then(|f| f.to_str())
                                                                    .unwrap_or("");
                                                                let full_hash_hex = format!("{}{}", prefix, suffix);

                                                                if let Ok(hash_bytes) = hex::decode(&full_hash_hex) {
                                                                    if hash_bytes.len() == 32 {
                                                                        let mut content_hash = [0u8; 32];
                                                                        content_hash.copy_from_slice(&hash_bytes);

                                                                        // Send I_HAVE to the new peer
                                                                        let envelope = MessageEnvelope::new_fork_agnostic(
                                                                            MessageType::IHave,
                                                                            content_hash.to_vec(),
                                                                        );
                                                                        if let Err(e) = peer_conn.send(&envelope).await {
                                                                            warn!("[INVENTORY] Failed to send I_HAVE to new peer: {}", e);
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
                                            info!("[INVENTORY] Sent {} I_HAVE messages to new peer {}", inventory_count, hex::encode(&peer_id[..8]));
                                        }
                                    }

                                    // Request peer's mempool (Bitcoin-style mempool sync)
                                    let getmempool_envelope = MessageEnvelope::new_fork_agnostic(
                                        MessageType::GetMempool,
                                        Vec::new(),
                                    );
                                    if let Err(e) = peer_conn.send(&getmempool_envelope).await {
                                        warn!("[ACCEPT] Failed to send GETMEMPOOL: {}", e);
                                    } else {
                                        debug!("[ACCEPT] Sent GETMEMPOOL to peer {}", hex::encode(&peer_id[..8]));
                                    }

                                    // Spawn message reading task for this connection
                                    let router_clone = router.clone();
                                    let pool_clone = connection_pool.clone();
                                    let cm_clone = connection_manager.clone();
                                    let timeout = idle_timeout;

                                    tokio::spawn(async move {
                                        Self::message_read_loop_with_timeout(
                                            peer_conn,
                                            peer_id,
                                            router_clone,
                                            pool_clone,
                                            cm_clone,
                                            timeout,
                                        ).await;
                                    });
                                } else {
                                    warn!(
                                        "[ACCEPT] Connection from {} but no peer info available",
                                        remote_addr
                                    );
                                }
                            }
                            Err(e) => {
                                warn!("[ACCEPT] Accept error: {}", e);
                                // Continue accepting - don't crash on individual errors
                            }
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Message reading loop for a single peer connection
    ///
    /// Reads messages from the peer, routes them to the appropriate handler,
    /// and sends back any response messages.
    ///
    /// This is public so it can be used for both inbound (from accept loop)
    /// and outbound (from connect) connections.
    ///
    /// If `idle_timeout` is Some, the connection will be closed after that duration
    /// of inactivity. This is used for seed nodes to maintain short-term connections.
    pub async fn message_read_loop(
        peer_conn: Arc<PeerConnection>,
        peer_id: [u8; 32],
        router: Arc<MessageRouter>,
        connection_pool: Arc<PeerConnectionPool>,
        connection_manager: Arc<ConnectionManager>,
    ) {
        Self::message_read_loop_with_timeout(
            peer_conn,
            peer_id,
            router,
            connection_pool,
            connection_manager,
            None, // No idle timeout by default
        )
        .await
    }

    /// Message reading loop with optional idle timeout
    ///
    /// Same as `message_read_loop` but with configurable idle timeout for seed nodes.
    pub async fn message_read_loop_with_timeout(
        peer_conn: Arc<PeerConnection>,
        peer_id: [u8; 32],
        router: Arc<MessageRouter>,
        connection_pool: Arc<PeerConnectionPool>,
        connection_manager: Arc<ConnectionManager>,
        idle_timeout: Option<std::time::Duration>,
    ) {
        let peer_id_hex = hex::encode(&peer_id[..8]);
        info!("[MSG-LOOP] Starting message loop for peer {}", peer_id_hex);

        loop {
            // Read next message from peer, with optional timeout
            let recv_result = if let Some(timeout) = idle_timeout {
                match tokio::time::timeout(timeout, peer_conn.recv()).await {
                    Ok(result) => result,
                    Err(_) => {
                        // Timeout - close connection
                        info!(
                            "[MSG-LOOP] Idle timeout ({}s) for peer {}, disconnecting",
                            timeout.as_secs(),
                            peer_id_hex
                        );
                        break;
                    }
                }
            } else {
                peer_conn.recv().await
            };

            match recv_result {
                Ok(Some(envelope)) => {
                    // Convert MessageType to u8 for routing (MessageType is #[repr(u8)])
                    let msg_type_u8: u8 = envelope.message_type as u8;
                    debug!(
                        "[MSG-LOOP] Received msg type 0x{:02x} from {}",
                        msg_type_u8, peer_id_hex
                    );

                    // Route the message
                    match router
                        .route(&peer_id, msg_type_u8, &envelope.fork_id, &envelope.payload)
                        .await
                    {
                        Ok(Some((response_type, response_data))) => {
                            // Convert u8 response type back to MessageType
                            let response_msg_type = match MessageType::try_from(response_type) {
                                Ok(t) => t,
                                Err(_) => {
                                    warn!(
                                        "[MSG-LOOP] Invalid response type 0x{:02x} from router",
                                        response_type
                                    );
                                    continue;
                                }
                            };

                            // Send response back to peer
                            let response_envelope = MessageEnvelope::new(
                                response_msg_type,
                                envelope.fork_id,
                                response_data,
                            );

                            if let Err(e) = peer_conn.send(&response_envelope).await {
                                warn!(
                                    "[MSG-LOOP] Failed to send response to {}: {}",
                                    peer_id_hex, e
                                );
                                break; // Connection broken
                            }

                            debug!(
                                "[MSG-LOOP] Sent response 0x{:02x} to {}",
                                response_type, peer_id_hex
                            );
                        }
                        Ok(None) => {
                            // No response needed
                            debug!("[MSG-LOOP] No response needed for msg from {}", peer_id_hex);
                        }
                        Err(e) => {
                            warn!("[MSG-LOOP] Route error for msg from {}: {}", peer_id_hex, e);
                            // Continue processing - don't drop connection on route errors
                        }
                    }
                }
                Ok(None) => {
                    // Connection closed cleanly
                    info!("[MSG-LOOP] Peer {} disconnected cleanly", peer_id_hex);
                    break;
                }
                Err(e) => {
                    // Connection error
                    warn!("[MSG-LOOP] Read error from {}: {}", peer_id_hex, e);
                    break;
                }
            }
        }

        // Cleanup: remove from pool and manager
        connection_pool.remove(&peer_id).await;
        connection_manager.remove_connection(&peer_id, DisconnectReason::Normal);
        info!("[MSG-LOOP] Cleanup complete for peer {}", peer_id_hex);
    }

    /// Spawn the cache cleanup task
    ///
    /// Evicts old cache entries every 10 minutes.
    /// Phase 1: Placeholder - CachingContentStore integration pending.
    pub fn spawn_cache_cleanup(&mut self) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(CACHE_CLEANUP_INTERVAL_SECS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            debug!(
                "Cache cleanup started ({}s interval)",
                CACHE_CLEANUP_INTERVAL_SECS
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        debug!("Cache cleanup received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // TODO: Integrate with CachingContentStore
                        // cache.cleanup_if_needed()
                        debug!("Cache cleanup (placeholder)");
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    /// Spawn the block formation backup check task (SPEC_08)
    ///
    /// This is a BACKUP check that runs periodically to ensure blocks are formed
    /// when the PoW threshold is met. Primary block formation happens immediately
    /// in the router when actions are received and push cumulative PoW over threshold.
    ///
    /// Blocks are formed ONLY when PoW threshold is met (should_form_root() returns true).
    /// With leader election, the periodic check ensures eligible nodes form blocks
    /// even if no new local content is submitted.
    ///
    /// This approach is similar to Bitcoin: work determines when blocks form, not time.
    /// Users see instant updates via mempool gossip; blocks provide finality.
    pub fn spawn_block_formation(
        &mut self,
        block_builder: Arc<RwLock<BlockBuilder>>,
        connection_pool: Arc<PeerConnectionPool>,
        chain_store: Option<Arc<crate::storage::ChainStore>>,
        node_identity: [u8; 32],
        sponsorship_store: Option<Arc<crate::sponsorship::storage::SponsorshipStore>>,
    ) {
        let mut shutdown = self.shutdown_rx.clone();

        let handle = tokio::spawn(async move {
            // Start with short interval to quickly calculate ETA, then schedule dynamically
            let mut ticker = interval(Duration::from_secs(5));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut block_count: u64 = 0;

            info!(
                "[BLOCKS] Block formation task started with leader election (node={})",
                hex::encode(&node_identity[..8])
            );

            loop {
                tokio::select! {
                    biased;

                    _ = shutdown.changed() => {
                        info!("[BLOCKS] Block formation received shutdown signal");
                        break;
                    }
                    _ = ticker.tick() => {
                        // Check if we should form a block:
                        // 1. PoW threshold must be met
                        // 2. We must be eligible (leader election)
                        // 3. Block doesn't already exist at this height

                        let chain_store = match &chain_store {
                            Some(s) => s,
                            None => continue,
                        };

                        // Check PoW threshold first (cheap check)
                        let should_form = {
                            match block_builder.read() {
                                Ok(builder) => builder.pending_action_count() > 0 && builder.total_pow() >= builder.difficulty_target(),
                                Err(_) => false,
                            }
                        };

                        if !should_form {
                            continue;
                        }

                        // Check if block already exists at expected height
                        let expected_height = match block_builder.read() {
                            Ok(builder) => builder.next_height(),
                            Err(_) => continue,
                        };

                        if let Ok(Some(_)) = chain_store.get_root_hash_at_height(expected_height) {
                            // Block already exists - someone else formed it
                            if let Ok(mut builder) = block_builder.write() {
                                builder.reset_waiting();
                            }
                            debug!("[BLOCKS] Block already exists at height {}, skipping", expected_height);
                            continue;
                        }

                        // Leader election check with dynamic scheduling
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);

                        let (is_eligible, eta_secs) = if let Ok(Some(prev_block)) = chain_store.get_best_tip_block() {
                            // Get recent timestamps for difficulty calculation
                            let recent_timestamps: Vec<u64> = {
                                let tip_height = prev_block.height;
                                let start_height = tip_height.saturating_sub(10);
                                let mut timestamps = Vec::new();
                                for h in start_height..=tip_height {
                                    if let Ok(Some(hash)) = chain_store.get_root_hash_at_height(h) {
                                        if let Ok(Some(block)) = chain_store.get_root_block(&hash) {
                                            timestamps.push(block.timestamp);
                                        }
                                    }
                                }
                                timestamps
                            };

                            let eligibility = crate::blocks::leader::BlockEligibility::new(
                                &prev_block.hash(),
                                prev_block.timestamp,
                                &[0u8; 16], // Global eligibility
                                &recent_timestamps,
                            );

                            let eligible = eligibility.is_eligible(&node_identity, now);
                            let eta = if eligible {
                                0
                            } else {
                                eligibility.when_eligible(&node_identity, now)
                                    .map(|t| t.saturating_sub(now))
                                    .unwrap_or(BLOCK_FORMATION_CHECK_INTERVAL_SECS)
                            };
                            (eligible, eta)
                        } else {
                            // No previous block = genesis = always eligible
                            (true, 0)
                        };

                        if !is_eligible {
                            // Schedule next check for when we become eligible (plus small
                            // buffer), but CAP it: on a small/quiet network `eta_secs` can be
                            // huge, and sleeping that long lets the task miss the moment it
                            // becomes eligible — stalling block formation until a restart.
                            // Re-check at least every 15s so formation can't sleep into a stall.
                            let next_check = std::cmp::max(eta_secs + 1, 5).min(15); // 5..=15s
                            debug!("[BLOCKS] Not eligible yet, scheduling check in {}s (ETA: {}s)", next_check, eta_secs);
                            ticker = interval(Duration::from_secs(next_check));
                            ticker.tick().await; // Consume first immediate tick
                            continue;
                        }

                        // Reset to normal interval after forming block
                        ticker = interval(Duration::from_secs(BLOCK_FORMATION_CHECK_INTERVAL_SECS));

                        info!("[BLOCKS] Leader election passed - forming block");

                        // Form the root block
                        let (root, space_blocks, content_blocks) = {
                            let mut builder = match block_builder.write() {
                                Ok(b) => b,
                                Err(e) => {
                                    warn!("[BLOCKS] Failed to write block builder: {}", e);
                                    continue;
                                }
                            };

                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_secs())
                                .unwrap_or(0);

                            builder.build_root_block(now, node_identity, sponsorship_store.as_ref().map(|s| s.as_ref()))
                        };

                        block_count += 1;
                        let root_hash = root.hash();

                        info!(
                            "[BLOCKS] Formed block #{} (height={}, pow={}, {} spaces, {} threads)",
                            block_count,
                            root.height(),
                            root.total_pow,
                            space_blocks.len(),
                            content_blocks.len()
                        );

                        // VALIDATION: Before storing, validate CreateSpace actions have valid sponsorship
                        // Collect all identities being sponsored in this block
                        let mut identities_sponsored_in_block = std::collections::HashSet::new();
                        for content_block in &content_blocks {
                            for action in &content_block.actions {
                                if action.action_type == crate::blocks::ActionType::Sponsor {
                                    if let Some(sponsee_bytes) = action.content_hash {
                                        identities_sponsored_in_block.insert(sponsee_bytes);
                                    }
                                }
                            }
                        }

                        // Validate CreateSpace actions require valid sponsorship
                        let mut block_is_valid = true;
                        if let Some(ref ss) = sponsorship_store {
                            'validation: for content_block in &content_blocks {
                                for action in &content_block.actions {
                                    if action.action_type == crate::blocks::ActionType::CreateSpace {
                                        let creator_bytes = action.actor;
                                        let creator_pk = crate::types::identity::PublicKey::from_bytes(creator_bytes);

                                        // Check if sponsored on-chain OR in this block OR a
                                        // hardcoded genesis identity (genesis is the sponsor
                                        // root and never has a sponsorship_store record, so
                                        // without this its own CreateSpace actions would fail
                                        // validation and reject the whole block — a bootstrap
                                        // deadlock on a fresh chain).
                                        let is_sponsored_on_chain = ss.exists(&creator_pk).unwrap_or(false);
                                        let is_sponsored_in_block = identities_sponsored_in_block.contains(&creator_bytes);
                                        let is_genesis = crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&creator_pk);

                                        if !is_sponsored_on_chain && !is_sponsored_in_block && !is_genesis {
                                            warn!(
                                                "[BLOCKS] VALIDATION FAILED: Block contains CreateSpace by unsponsored identity {}. Block rejected.",
                                                hex::encode(&creator_bytes[..8])
                                            );
                                            block_is_valid = false;
                                            break 'validation;
                                        }
                                    }
                                }
                            }
                        }

                        // Skip storing if validation failed
                        if !block_is_valid {
                            warn!("[BLOCKS] Skipping invalid block storage, continuing to next tick");
                            continue;
                        }

                        // Store blocks in ChainStore (proper block storage)
                        // (chain_store is already validated at the start of this block)
                        // Store content blocks first (referenced by space blocks).
                        // Branch-aware write: size tracking + 50MB fracture (SPEC_08 §5).
                        let branch_store = crate::branch::BranchAwareStore::new(&chain_store);
                        for content_block in &content_blocks {
                            match branch_store.put_built_content_block(content_block) {
                                Ok(result) if result.fracture_triggered => {
                                    info!(
                                        "[BRANCH] Fracture triggered in space {} at branch depth {}",
                                        hex::encode(&content_block.space_id[..8]),
                                        result.branch_path.depth()
                                    );
                                }
                                Ok(_) => {}
                                Err(e) => {
                                    warn!("[BLOCKS] Failed to store content block: {}", e);
                                }
                            }

                            // SPEC_11 Phase 6: Apply sponsorship actions from locally formed blocks
                            if let Some(ref ss) = sponsorship_store {
                                for action in &content_block.actions {
                                    match action.action_type {
                                        crate::blocks::ActionType::Sponsor => {
                                            if let Some(sponsee_bytes) = action.content_hash {
                                                let sponsor_bytes = action.actor;
                                                let sponsee_pk = crate::types::identity::PublicKey::from_bytes(sponsee_bytes);
                                                let sponsor_pk = crate::types::identity::PublicKey::from_bytes(sponsor_bytes);
                                                if let Ok(false) = ss.exists(&sponsee_pk) {
                                                    let depth = match ss.get(&sponsor_pk) {
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
                                                    if let Err(e) = ss.put(&stored) {
                                                        warn!("[BLOCKS] Failed to store on-chain sponsorship: {}", e);
                                                    } else {
                                                        info!("[BLOCKS] Applied on-chain sponsorship: {} by {} (depth={})",
                                                            hex::encode(&sponsee_bytes[..8]),
                                                            hex::encode(&sponsor_bytes[..8]),
                                                            depth);
                                                    }
                                                }
                                            }
                                        }
                                        crate::blocks::ActionType::GenesisRegister => {
                                            if let Some(genesis_bytes) = action.content_hash {
                                                let genesis_pk = crate::types::identity::PublicKey::from_bytes(genesis_bytes);
                                                if let Ok(false) = ss.exists(&genesis_pk) {
                                                    let stored = crate::sponsorship::types::StoredSponsorship {
                                                        sponsored_identity: genesis_pk,
                                                        sponsor: None,
                                                        creation_timestamp: action.timestamp,
                                                        status: crate::sponsorship::types::SponsorshipStatus::Active,
                                                        penalty_until: None,
                                                        depth: 0,
                                                        probationary: false,
                                                        probation_expires: None,
                                                        positive_contribution_score: 0,
                                                        is_genesis: true,
                                                        orphaned_at: None,
                                                    };
                                                    if let Err(e) = ss.put(&stored) {
                                                        warn!("[BLOCKS] Failed to store on-chain genesis registration: {}", e);
                                                    } else {
                                                        info!("[BLOCKS] Applied on-chain genesis registration: {}",
                                                            hex::encode(&genesis_bytes[..8]));
                                                    }
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        // Store space blocks (referenced by root block)
                        for space_block in &space_blocks {
                            if let Err(e) = chain_store.put_space_block(space_block) {
                                warn!("[BLOCKS] Failed to store space block: {}", e);
                            }
                        }

                        // Store root block with fork resolution
                        match chain_store.put_root_block_with_fork_resolution(&root) {
                            Ok((hash, is_new_tip)) => {
                                if is_new_tip {
                                    info!(
                                        "[BLOCKS] Stored root block {} as NEW CANONICAL TIP (height={}, cumulative_pow={})",
                                        hex::encode(&hash[..8]),
                                        root.height(),
                                        root.cumulative_pow
                                    );
                                } else {
                                    // Our locally formed block was NOT heavier than current tip
                                    warn!(
                                        "[BLOCKS] Stored root block {} but NOT canonical (height={}, cumulative_pow={})",
                                        hex::encode(&hash[..8]),
                                        root.height(),
                                        root.cumulative_pow
                                    );
                                }
                            }
                            Err(e) => {
                                warn!("[BLOCKS] Failed to store root block: {}", e);
                            }
                        }

                        // Announce block to peers (BLOCK_ANNOUNCE)
                        let peer_count = connection_pool.count().await;
                        if peer_count > 0 {
                            use crate::network::messages::BlockAnnouncePayload;
                            use crate::types::network::{MessageEnvelope, MessageType};

                            let announce = BlockAnnouncePayload::new(
                                root_hash,
                                root.height(),
                                root.total_pow,
                                space_blocks.len() as u32,
                                root.timestamp,
                            );

                            // Create envelope with proper BlockAnnounce message type
                            let envelope = MessageEnvelope::new_fork_agnostic(
                                MessageType::BlockAnnounce,
                                announce.to_bytes().to_vec(),
                            );

                            // Broadcast to all peers
                            let sent = connection_pool.broadcast(&envelope).await;
                            info!(
                                "[BLOCKS] Announced block {} (height={}) to {} peers",
                                hex::encode(&root_hash[..8]),
                                root.height(),
                                sent
                            );
                        }
                    }
                }
            }
        });

        self.handles.push(handle);
    }

    // ========================================================================
    // Orchestrator
    // ========================================================================

    /// Spawns all background tasks
    ///
    /// Parameters are optional to allow incremental integration.
    /// Pass None for subsystems not yet ready.
    ///
    /// # Arguments
    ///
    /// * `syncer` - ChainSyncer for sync loop (optional)
    /// * `connection_manager` - ConnectionManager for peer maintenance and keepalive (optional)
    pub fn spawn_all(
        &mut self,
        _syncer: Option<Arc<ChainSyncer>>,
        connection_manager: Option<Arc<ConnectionManager>>,
    ) {
        // Note: Sync loop requires PeerConnectionPool - skipped in minimal mode
        debug!("[SYNC-LOOP] Disabled (no PeerConnectionPool in minimal mode)");

        // Decay tick - no decay integration in minimal mode
        self.spawn_decay_tick(None);

        if let Some(ref cm) = connection_manager {
            self.spawn_peer_maintenance(cm.clone());
        }

        // Note: Keepalive requires PeerConnectionPool - skipped in minimal mode
        // Use spawn_all_with_routing for full keepalive support
        debug!("Keepalive disabled (no PeerConnectionPool in minimal mode)");

        // These have no dependencies for now - always start as placeholders
        self.spawn_availability_announcer();
        self.spawn_cache_cleanup();

        info!("Started {} background tasks", self.handles.len());
    }

    /// Spawns all background tasks including accept loop
    ///
    /// Extended version of `spawn_all` that also starts the accept loop for
    /// accepting incoming connections.
    ///
    /// # Arguments
    ///
    /// * `transport` - TcpTransport for accepting connections
    /// * `syncer` - ChainSyncer for sync loop (optional)
    /// * `connection_manager` - ConnectionManager for peer maintenance and keepalive
    pub fn spawn_all_with_transport(
        &mut self,
        transport: Arc<TcpTransport>,
        _syncer: Option<Arc<ChainSyncer>>,
        connection_manager: Arc<ConnectionManager>,
    ) {
        // Spawn the accept loop first - it's the most important for networking
        self.spawn_accept_loop(transport, connection_manager.clone());

        // Note: Sync loop requires PeerConnectionPool - skipped in basic mode
        debug!("[SYNC-LOOP] Disabled (no PeerConnectionPool in basic mode)");

        // Decay tick - no decay integration in basic mode
        self.spawn_decay_tick(None);

        self.spawn_peer_maintenance(connection_manager.clone());

        // Note: Keepalive requires PeerConnectionPool - skipped in basic mode
        // Use spawn_all_with_routing for full keepalive support
        debug!("Keepalive disabled (no PeerConnectionPool in basic mode)");

        // These have no dependencies for now - always start as placeholders
        self.spawn_availability_announcer();
        self.spawn_cache_cleanup();

        info!(
            "Started {} background tasks (with accept loop)",
            self.handles.len()
        );
    }

    /// Spawns all background tasks with full message routing
    ///
    /// This is the production version that includes:
    /// - Accept loop with message reading and routing
    /// - DHT peer discovery task for finding peers via Kademlia (SPEC_06 §4.1)
    /// - Block formation task for block-based propagation (SPEC_08)
    /// - Decay pruning task for content lifecycle management
    /// - Branch-selective sync task for efficient partial sync (BRANCH_SELECTIVE_SYNC.md)
    /// - All background maintenance tasks
    /// - Full content sync support
    ///
    /// # Arguments
    ///
    /// * `transport` - TcpTransport for accepting connections
    /// * `syncer` - ChainSyncer for sync loop (optional)
    /// * `connection_manager` - ConnectionManager for peer maintenance and keepalive
    /// * `connection_pool` - PeerConnectionPool for storing active connections
    /// * `router` - MessageRouter for routing incoming messages
    /// * `dht` - DhtManager for Kademlia peer/content discovery (SPEC_06 §3.8)
    /// * `data_dir` - Data directory for pending broadcast files
    /// * `decay_integration` - DecayIntegration for content lifecycle (optional)
    /// * `block_builder` - BlockBuilder for block-based content propagation (optional)
    /// * `chain_store` - ChainStore for block storage (optional)
    /// * `seed_idle_timeout` - Optional idle timeout for seed node mode
    /// * `branch_subscription_manager` - BranchSubscriptionManager for selective sync (optional)
    /// * `peer_branch_tracker` - PeerBranchTracker for tracking peer branches (optional)
    /// * `node_identity` - Node's identity for leader election in block formation
    /// * `offer_store` - OfferStore for sponsorship offer sync (optional)
    pub fn spawn_all_with_routing(
        &mut self,
        transport: Arc<TcpTransport>,
        syncer: Option<Arc<ChainSyncer>>,
        connection_manager: Arc<ConnectionManager>,
        connection_pool: Arc<PeerConnectionPool>,
        router: Arc<MessageRouter>,
        dht: Arc<DhtManager>,
        data_dir: std::path::PathBuf,
        decay_integration: Option<Arc<DecayIntegration>>,
        block_builder: Option<Arc<RwLock<BlockBuilder>>>,
        chain_store: Option<Arc<crate::storage::ChainStore>>,
        seed_idle_timeout: Option<Duration>,
        branch_subscription_manager: Option<Arc<RwLock<BranchSubscriptionManager>>>,
        peer_branch_tracker: Option<Arc<RwLock<PeerBranchTracker>>>,
        node_identity: [u8; 32],
        sponsorship_store: Option<Arc<crate::sponsorship::storage::SponsorshipStore>>,
        offer_store: Option<Arc<OfferStore>>,
    ) {
        // Spawn the accept loop with routing - this enables full message propagation
        // If seed_idle_timeout is set, connections will be closed after that duration of inactivity
        self.spawn_accept_loop_with_routing_and_timeout(
            transport.clone(),
            connection_manager.clone(),
            connection_pool.clone(),
            router.clone(),
            dht.clone(),
            data_dir.clone(),
            seed_idle_timeout,
        );

        // Spawn DHT peer discovery task for finding peers via Kademlia (SPEC_06 §4.1)
        // This enables nodes to discover each other network-wide, not just via seeds
        self.spawn_dht_peer_discovery(
            dht,
            connection_pool.clone(),
            connection_manager.clone(),
            transport.clone(),
            router.clone(),
            data_dir.clone(),
        );

        // Spawn GETADDR peer discovery task for peer exchange protocol
        // This complements DHT by asking peers for their known peers
        self.spawn_getaddr_discovery(
            connection_pool.clone(),
            connection_manager.clone(),
            transport,
            router,
            data_dir.clone(),
        );

        // Spawn block formation task for block-based propagation (SPEC_08)
        // Forms blocks when cumulative PoW threshold is met AND leader election passes
        if let Some(bb) = block_builder {
            self.spawn_block_formation(
                bb,
                connection_pool.clone(),
                chain_store.clone(),
                node_identity,
                sponsorship_store.clone(),
            );
        }

        if let Some(s) = syncer {
            self.spawn_sync_loop(s, connection_pool.clone(), chain_store.clone());
        }

        // Branch-selective sync - syncs subscribed branches (BRANCH_SELECTIVE_SYNC.md)
        if let (Some(sub_mgr), Some(tracker)) = (branch_subscription_manager, peer_branch_tracker) {
            self.spawn_branch_sync(
                connection_pool.clone(),
                sub_mgr,
                tracker,
                chain_store.clone(),
            );
        }

        // Decay tick - prunes decayed content and adapts half-life
        self.spawn_decay_tick(decay_integration);

        self.spawn_peer_maintenance(connection_manager.clone());

        self.spawn_keepalive(
            connection_manager,
            connection_pool.clone(),
            chain_store.clone(),
        );

        // Sponsorship offer sync - queries peers for offers during initial sync (SPEC_11 §5.1)
        // This ensures new nodes receive existing offers that were created before they joined
        if let Some(os) = offer_store {
            self.spawn_sponsorship_offer_sync(connection_pool, os);
        }

        // These have no dependencies for now - always start as placeholders
        self.spawn_availability_announcer();
        self.spawn_cache_cleanup();

        info!(
            "Started {} background tasks (with DHT peer discovery)",
            self.handles.len()
        );
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_background_task_runner_creation() {
        let (_tx, rx) = watch::channel(false);
        let runner = BackgroundTaskRunner::new(rx);
        assert_eq!(runner.task_count(), 0);
    }

    #[test]
    fn test_interval_constants_match_spec() {
        // SPEC_10 §6.1 interval requirements
        assert_eq!(SYNC_INTERVAL_SECS, 30);
        assert_eq!(DECAY_TICK_INTERVAL_SECS, 60);
        assert_eq!(PEER_MAINTENANCE_INTERVAL_SECS, 60);
        assert_eq!(CONTRIBUTION_RECORD_INTERVAL_SECS, 300); // 5 min
        assert_eq!(KEEPALIVE_INTERVAL_SECS, 120); // 2 min
        assert_eq!(CACHE_CLEANUP_INTERVAL_SECS, 600); // 10 min
        assert_eq!(AVAILABILITY_ANNOUNCE_INTERVAL_SECS, 300); // 5 min
    }

    #[tokio::test]
    async fn test_spawn_all_with_none_subsystems() {
        let (_tx, rx) = watch::channel(false);
        let mut runner = BackgroundTaskRunner::new(rx);

        runner.spawn_all(None, None);

        // With no subsystems, we get: decay, availability, cache = 3 tasks
        assert_eq!(runner.task_count(), 3);

        // Cleanup
        runner.shutdown().await;
    }

    #[tokio::test]
    async fn test_shutdown_clears_handles() {
        let (_tx, rx) = watch::channel(false);
        let mut runner = BackgroundTaskRunner::new(rx);

        runner.spawn_all(None, None);
        assert!(runner.task_count() > 0);

        runner.shutdown().await;
        assert_eq!(runner.task_count(), 0);
    }

    #[tokio::test]
    async fn test_shutdown_responds_to_signal() {
        let (tx, rx) = watch::channel(false);
        let mut runner = BackgroundTaskRunner::new(rx);

        runner.spawn_all(None, None);

        // Send shutdown signal
        tx.send(true).ok();

        // Small delay for tasks to notice
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Shutdown should complete quickly
        runner.shutdown().await;
        assert_eq!(runner.task_count(), 0);
    }
}
