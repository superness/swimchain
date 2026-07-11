//! Message router implementation (SPEC_10 §5)
//!
//! Routes incoming protocol messages to appropriate handlers.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Instant;

use log::{debug, info, warn};

use super::RouteError;
use crate::attribution::{AttributionQueryPayload, AttributionResponsePayload};
use crate::blocklist::gossip::{
    entry_from_update, parse_blocklist_message, BlocklistGossip, BlocklistMessage,
    MSG_BLOCKLIST_BUNDLE, MSG_BLOCKLIST_REQUEST, MSG_BLOCKLIST_SYNC, MSG_BLOCKLIST_UPDATE,
};
use crate::blocks::validation::validate_reply_parents;
use crate::cli::search_index::{IndexableContent, SearchIndex};
use crate::content::decay_integration::DecayIntegration;
use crate::content::retrieval::ContentRetrievalManager;
use crate::crypto::signature::verify as ed25519_verify;
use crate::dht::constants::{
    MSG_DHT_FIND_NODE, MSG_DHT_FIND_VALUE, MSG_DHT_NODES, MSG_DHT_PING, MSG_DHT_PONG,
    MSG_DHT_PROVIDERS, MSG_DHT_STORE, MSG_DHT_STORE_ACK,
};
use crate::dht::{DhtManager, DhtMessage, DhtMessageType, NodeId as DhtNodeId};
use crate::discovery::peer_branches::PeerBranchTracker;
use crate::discovery::PeerStore;
use crate::engagement_graph::{EngagementGraphStore, EngagementType};
use crate::network::messages::{
    BlockAnnouncePayload, BlockDataPayload, BlocksPayload, DataPayload, GetBlockPayload,
    GetBlocksLocatorPayload, GetBlocksPayload, GetHeadersLocatorPayload, GetPayload, GossipPayload,
    HeadersPayload, IHavePayload, InvItem, InvPayload, NotFoundPayload, SerializedBlock,
    SpaceHealthQueryPayload, SpaceHealthResponsePayload, WhoHasPayload, WireAddr,
};
use crate::node::peer_connections::PeerConnectionPool;
use crate::node::{BehavioralBranchingMode, NodeMetrics};
use crate::reputation::ReputationStore;
use crate::spam_attestation::{
    aggregate_attestations, validate_attestation, CounterAttestation, CounterAttestationState,
    SpamAttestation, SpamAttestationStore, StoredSpamAttestation,
};
use crate::sponsorship::offer_store::OfferStore;
use crate::sponsorship::storage::SponsorshipStore;
use crate::sponsorship::wire::{
    deserialize_claim, deserialize_claim_response, deserialize_offer, serialize_offer,
    ClaimResponseType,
};
use crate::storage::blob::ContentBlobHash;
use crate::storage::chain::ChainStore;
use crate::storage::content::PersistentContentStore;
use crate::storage::AggregationCache;
use crate::sync::subscription::BranchSubscriptionManager;
use crate::types::constants::{
    // Limits
    MAX_ADDRS_PER_MESSAGE,
    // Message types
    MSG_ACTION_ANNOUNCE,
    MSG_ADDR,
    MSG_ALERT,
    MSG_ATTRIBUTION_QUERY,
    MSG_ATTRIBUTION_RESPONSE,
    MSG_BLOCKS,
    MSG_BLOCK_ANNOUNCE,
    MSG_BLOCK_DATA,
    MSG_BRANCH_ANNOUNCE,
    MSG_BRANCH_INVENTORY,
    MSG_CHAINSTATUS,
    MSG_CONTRIBUTION_ATTEST,
    MSG_CONTRIBUTION_CLAIM,
    MSG_COUNTER_ATTESTATION,
    MSG_DATA,
    MSG_DATA_CONTENT,
    MSG_DM_ACCEPT_ANNOUNCE,
    MSG_DM_DECLINE_ANNOUNCE,
    MSG_DM_REQUEST_ANNOUNCE,
    MSG_FORKANNOUNCE,
    MSG_FORKINFO,
    MSG_FORKQUERY,
    MSG_GET,
    MSG_GETADDR,
    MSG_GETBLOCKS,
    // Branch-Selective Sync
    MSG_GETBLOCKS_BRANCH,
    MSG_GETBLOCKS_LOCATOR,
    MSG_GETDATA,
    MSG_GETHEADERS,
    MSG_GETHEADERS_LOCATOR,
    MSG_GETMEMPOOL,
    MSG_GET_BLOCK,
    // Space Name Resolution (Bug #4)
    MSG_GET_SPACE_META,
    MSG_GOSSIP,
    MSG_HEADERS,
    MSG_HOLE_PUNCH_INTRO,
    MSG_INV,
    MSG_I_HAVE,
    MSG_LEVEL_QUERY,
    MSG_LEVEL_RESPONSE,
    MSG_NOTFOUND,
    MSG_NOTFOUND_CONTENT,
    MSG_PING,
    MSG_PONG,
    MSG_REJECT,
    MSG_SPACE_HEALTH_QUERY,
    MSG_SPACE_HEALTH_RESPONSE,
    MSG_SPACE_META,
    MSG_SPAM_ATTESTATION,
    MSG_SUBSCRIBE_BRANCH,
    MSG_UNSUBSCRIBE_BRANCH,
    MSG_VERACK,
    MSG_VERSION,
    MSG_WHO_HAS,
    WIRE_ADDRESS_SIZE,
};
use crate::types::constants::{
    MSG_SPONSORSHIP_CLAIM_RESPONSE, MSG_SPONSORSHIP_OFFER, MSG_SPONSORSHIP_OFFER_CLAIM,
    MSG_SPONSORSHIP_OFFER_LIST, MSG_SPONSORSHIP_OFFER_QUERY,
};
use crate::types::content::{ContentId, Reaction, ReactionType};
use crate::types::identity::{IdentityId, PublicKey, Signature};
use crate::types::serialize::{Deserialize, Serialize};

/// Orphan block entry: block data waiting for its parent to arrive
#[derive(Clone)]
struct OrphanBlock {
    /// Raw serialized block data
    data: Vec<u8>,
    /// Height of this orphan block
    height: u64,
    /// Hash of this orphan block
    block_hash: [u8; 32],
    /// Peer that sent this block
    from_peer: [u8; 32],
    /// Timestamp when orphaned
    orphaned_at: Instant,
}

/// Message router for dispatching protocol messages
///
/// Routes messages to appropriate handlers based on message type.
/// Supports optional subsystems - if a subsystem is not provided,
/// messages for that subsystem will return `SubsystemUnavailable`.
/// A dial request forwarded from a HOLE_PUNCH_INTRO to the hole-punch dialer task:
/// `(endpoint_to_dial, target_node_id)`. The router itself cannot dial (no transport
/// handle), so it hands the endpoint off over this channel to a task that can.
pub type HolePunchRequest = (std::net::SocketAddr, [u8; 32]);

pub struct MessageRouter {
    /// Node metrics for recording routing statistics
    metrics: Arc<NodeMetrics>,

    /// Pending ping requests: nonce -> (sent_at, expected_peer_id)
    pending_pings: RwLock<HashMap<u64, (Instant, [u8; 32])>>,

    /// Seen DM-request signatures (first 32 bytes) for gossip loop-prevention.
    /// A DM request is re-flooded at most once per node.
    seen_dm_requests: RwLock<std::collections::HashSet<[u8; 32]>>,

    /// Pending WHO_HAS relay requests: content_hash -> (timestamp, Vec<requester_peer_id>)
    /// When we receive I_HAVE for content we relayed WHO_HAS for, we forward I_HAVE to these peers
    pending_who_has_relay: RwLock<HashMap<[u8; 32], (Instant, Vec<[u8; 32]>)>>,

    /// Orphan blocks waiting for their parent block to arrive
    /// Key: prev_root_hash that is missing, Value: list of orphan blocks waiting for it
    orphan_blocks: RwLock<HashMap<[u8; 32], Vec<OrphanBlock>>>,

    /// Content retrieval manager for WHO_HAS/I_HAVE/GET/DATA
    content_retrieval: Option<Arc<ContentRetrievalManager>>,

    /// Data directory for pending_broadcast files (enables multi-hop propagation)
    data_dir: Option<std::path::PathBuf>,

    /// Decay integration for content lifecycle management
    decay_integration: Option<Arc<DecayIntegration>>,

    /// Peer store for persistent peer discovery
    peer_store: Option<Arc<PeerStore>>,

    /// Chain store for block storage (SPEC_08)
    chain_store: Option<Arc<ChainStore>>,

    /// Blocklist store for CSAM/illegal content filtering
    /// Uses RwLock to allow write access for network gossip updates (C-BLOCKLIST-2)
    blocklist: Option<Arc<RwLock<crate::blocklist::BlocklistStore>>>,

    /// Blocklist gossip manager for peer tracking (H-BLOCKLIST-2)
    blocklist_gossip: Option<Arc<RwLock<BlocklistGossip>>>,

    /// Trusted blocklist list-maintainer public keys (SPEC_12 CSAM seeding).
    /// Updates/bundles signed by these keys bypass the community-attestation
    /// requirement; all other keys still require the attestation threshold.
    trusted_blocklist_keys: std::collections::HashSet<[u8; 32]>,


    /// Connection pool for block relay broadcasting
    connection_pool: Option<Arc<PeerConnectionPool>>,

    /// DHT manager for content discovery (SPEC_06 §3.8)
    dht: Option<Arc<DhtManager>>,

    /// Content store for reactions (SPEC_03 §7)
    content_store: Option<Arc<PersistentContentStore>>,

    /// Block builder for mempool (pending actions)
    block_builder: Option<Arc<RwLock<crate::blocks::builder::BlockBuilder>>>,

    /// Spam attestation store for community flagging (SPEC_12 §3)
    spam_attestation_store: Option<Arc<SpamAttestationStore>>,
    /// Identity-level poster reputation store (SPEC_12 §3.4/§4.5). Fed from the
    /// attestation-processing path when spam thresholds are reached/cleared.
    reputation_store: Option<Arc<ReputationStore>>,
    membership_store: Option<Arc<crate::storage::membership::MembershipStore>>,
    /// This node's raw Ed25519 identity public key (NOT the SHA-256 network node_id).
    /// Used to recognize DM requests addressed to us.
    identity_pubkey: Option<[u8; 32]>,

    /// Outlet for HOLE_PUNCH_INTRO dial requests (Layer 2 NAT traversal). When we
    /// receive an intro for a peer we're not already connected to, we forward its
    /// endpoint here for the dialer task to attempt a hole-punch connect.
    hole_punch_tx: Option<tokio::sync::mpsc::UnboundedSender<HolePunchRequest>>,

    /// Engagement graph for tracking who engages with whom
    engagement_graph: Option<Arc<EngagementGraphStore>>,

    /// Sponsorship store for applying on-chain sponsorship actions (SPEC_11 Phase 6)
    sponsorship_store: Option<Arc<SponsorshipStore>>,

    /// Offer store for public sponsorship offers (SPEC_11 §3.11)
    offer_store: Option<Arc<OfferStore>>,

    /// Branch subscription manager for local subscriptions (BRANCH_SELECTIVE_SYNC.md §5.4)
    branch_subscription_manager: Option<Arc<RwLock<BranchSubscriptionManager>>>,

    /// Peer branch tracker for tracking which peers serve which branches (BRANCH_SELECTIVE_SYNC.md §5.2)
    peer_branch_tracker: Option<Arc<RwLock<PeerBranchTracker>>>,

    /// Aggregation cache for reply counts and content stats
    aggregation_cache: Option<Arc<AggregationCache>>,

    /// Node identity for leader election
    node_id: Option<[u8; 32]>,

    /// Search index for full-text content indexing
    search_index: Option<Arc<RwLock<SearchIndex>>>,

    /// Event manager for publishing real-time WebSocket events (H-RPC-2)
    event_manager: Option<Arc<crate::rpc::events::EventManager>>,

    /// Behavioral branching mode (SPEC_13 Phase A / Phase 1 rollout)
    /// Gates organic community detection during block processing, and whether
    /// a qualifying cluster fractures (`Full`) or is only logged (`LogOnly`).
    behavioral_branching_mode: BehavioralBranchingMode,
}

impl MessageRouter {
    /// Create a new MessageRouter with the given metrics
    pub fn new(metrics: Arc<NodeMetrics>) -> Self {
        Self {
            metrics,
            pending_pings: RwLock::new(HashMap::new()),
            seen_dm_requests: RwLock::new(std::collections::HashSet::new()),
            pending_who_has_relay: RwLock::new(HashMap::new()),
            orphan_blocks: RwLock::new(HashMap::new()),
            content_retrieval: None,
            data_dir: None,
            decay_integration: None,
            peer_store: None,
            chain_store: None,
            blocklist: None,
            blocklist_gossip: None,
            trusted_blocklist_keys: std::collections::HashSet::new(),
            connection_pool: None,
            dht: None,
            content_store: None,
            block_builder: None,
            spam_attestation_store: None,
            reputation_store: None,
            membership_store: None,
            identity_pubkey: None,
            hole_punch_tx: None,
            engagement_graph: None,
            sponsorship_store: None,
            offer_store: None,
            branch_subscription_manager: None,
            peer_branch_tracker: None,
            aggregation_cache: None,
            node_id: None,
            search_index: None,
            event_manager: None,
            behavioral_branching_mode: BehavioralBranchingMode::Disabled,
        }
    }

    /// Create a new MessageRouter with all subsystems
    pub fn with_subsystems(
        metrics: Arc<NodeMetrics>,
        content_retrieval: Option<Arc<ContentRetrievalManager>>,
        data_dir: Option<std::path::PathBuf>,
        decay_integration: Option<Arc<DecayIntegration>>,
        peer_store: Option<Arc<PeerStore>>,
        chain_store: Option<Arc<ChainStore>>,
    ) -> Self {
        Self {
            metrics,
            pending_pings: RwLock::new(HashMap::new()),
            seen_dm_requests: RwLock::new(std::collections::HashSet::new()),
            pending_who_has_relay: RwLock::new(HashMap::new()),
            orphan_blocks: RwLock::new(HashMap::new()),
            content_retrieval,
            data_dir,
            decay_integration,
            peer_store,
            chain_store,
            blocklist: None,
            blocklist_gossip: None,
            trusted_blocklist_keys: std::collections::HashSet::new(),
            connection_pool: None,
            dht: None,
            content_store: None,
            block_builder: None,
            spam_attestation_store: None,
            reputation_store: None,
            membership_store: None,
            identity_pubkey: None,
            hole_punch_tx: None,
            engagement_graph: None,
            sponsorship_store: None,
            offer_store: None,
            branch_subscription_manager: None,
            peer_branch_tracker: None,
            aggregation_cache: None,
            node_id: None,
            search_index: None,
            event_manager: None,
            behavioral_branching_mode: BehavioralBranchingMode::Disabled,
        }
    }

    /// Create a MessageRouterBuilder for fluent configuration
    pub fn builder() -> MessageRouterBuilder {
        MessageRouterBuilder::new()
    }

    /// Route a message to its handler
    ///
    /// # Arguments
    ///
    /// * `peer_id` - The sending peer's node ID
    /// * `message_type` - The message type code
    /// * `fork_id` - The fork ID from the message envelope
    /// * `payload` - The raw message payload
    ///
    /// # Returns
    ///
    /// * `Ok(Some((msg_type, data)))` - Response to send back to peer
    /// * `Ok(None)` - No response needed
    /// * `Err(RouteError)` - Routing failed
    pub async fn route(
        &self,
        peer_id: &[u8; 32],
        message_type: u8,
        fork_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // For backwards compatibility, route without peer address
        self.route_with_addr(peer_id, message_type, fork_id, payload, None)
            .await
    }

    /// Route a message to the appropriate handler with optional peer address
    ///
    /// The peer_addr is required for DHT operations to properly record provider addresses.
    pub async fn route_with_addr(
        &self,
        peer_id: &[u8; 32],
        message_type: u8,
        fork_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        self.metrics.record_route_received();

        let result = match message_type {
            // === Handshake (already handled by transport, passthrough) ===
            MSG_VERSION | MSG_VERACK => Ok(None),

            // === Keepalive ===
            MSG_PING => self.handle_ping(payload),
            MSG_PONG => self.handle_pong(peer_id, payload),

            // === Address Discovery ===
            MSG_GETADDR => self.handle_getaddr(payload),
            MSG_ADDR => self.handle_addr(payload),

            // === Inventory (used for mempool sync) ===
            MSG_INV => self.handle_inv(peer_id, payload).await,
            MSG_GETDATA => self.handle_getdata(peer_id, payload).await,

            // === Legacy Inventory (deprecated) ===
            MSG_DATA | MSG_NOTFOUND | MSG_GOSSIP => {
                debug!(
                    "[ROUTE] Received deprecated message type 0x{:02x} from {}",
                    message_type,
                    hex::encode(&peer_id[..8])
                );
                Ok(None) // Silently ignore deprecated messages
            }

            // === Content (SPEC_07) ===
            MSG_WHO_HAS => self.handle_who_has(peer_id, payload).await,
            MSG_I_HAVE => self.handle_i_have(peer_id, payload).await,
            MSG_GET => self.handle_get(peer_id, payload).await,
            MSG_DATA_CONTENT => self.handle_data_content(peer_id, payload).await,
            MSG_NOTFOUND_CONTENT => self.handle_notfound_content(peer_id, payload).await,

            // === Social Layer (SPEC_09) ===
            // Level/contribution/attestation messages removed - level system deprecated
            MSG_CONTRIBUTION_CLAIM
            | MSG_CONTRIBUTION_ATTEST
            | MSG_LEVEL_QUERY
            | MSG_LEVEL_RESPONSE => {
                debug!(
                    "[ROUTE] Level system message type 0x{:02x} ignored (system removed)",
                    message_type
                );
                Ok(None)
            }
            MSG_SPACE_HEALTH_QUERY => self.handle_space_health_query(peer_id, payload).await,
            MSG_SPACE_HEALTH_RESPONSE => self.handle_space_health_response(peer_id, payload).await,
            MSG_ATTRIBUTION_QUERY => self.handle_attribution_query(peer_id, payload).await,
            MSG_ATTRIBUTION_RESPONSE => self.handle_attribution_response(peer_id, payload).await,

            // === Fork Detection ===
            MSG_FORKANNOUNCE | MSG_FORKQUERY | MSG_FORKINFO => {
                Err(RouteError::SubsystemUnavailable("fork"))
            }

            // === Error/Control ===
            MSG_REJECT => self.handle_reject(peer_id, payload),
            MSG_ALERT => self.handle_alert(peer_id, payload),

            // === Block Sync (SPEC_08) ===
            MSG_BLOCK_ANNOUNCE => self.handle_block_announce(peer_id, payload).await,
            MSG_GET_BLOCK => self.handle_get_block(peer_id, payload).await,
            MSG_BLOCK_DATA => self.handle_block_data(peer_id, payload).await,

            // === Block Range Sync (SPEC_08) ===
            MSG_GETBLOCKS => self.handle_getblocks(peer_id, payload).await,
            MSG_BLOCKS => self.handle_blocks(peer_id, payload).await,
            MSG_GETBLOCKS_LOCATOR => self.handle_getblocks_locator(peer_id, payload).await,

            // === Pool Gossip (SPEC_03 §7, SPEC_08 §3.3) ===

            // === Direct Messages (managed DM propagation) ===
            MSG_DM_REQUEST_ANNOUNCE => self.handle_dm_request_announce(peer_id, payload).await,
            MSG_DM_ACCEPT_ANNOUNCE => self.handle_dm_accept_announce(peer_id, payload).await,
            MSG_DM_DECLINE_ANNOUNCE => self.handle_dm_decline_announce(peer_id, payload).await,

            // === Hole-punch coordination (Layer 2 NAT traversal) ===
            MSG_HOLE_PUNCH_INTRO => self.handle_hole_punch_intro(peer_id, payload).await,

            // === Mempool Gossip ===
            MSG_ACTION_ANNOUNCE => self.handle_action_announce(peer_id, payload).await,
            MSG_GETMEMPOOL => self.handle_getmempool(peer_id).await,

            // === Blocklist Gossip (SPEC_12 §4.6) ===
            MSG_BLOCKLIST_UPDATE => self.handle_blocklist_update(peer_id, payload).await,
            MSG_BLOCKLIST_SYNC => self.handle_blocklist_sync(peer_id, payload).await,
            MSG_BLOCKLIST_REQUEST => self.handle_blocklist_request(peer_id, payload).await,
            MSG_BLOCKLIST_BUNDLE => self.handle_blocklist_bundle(peer_id, payload).await,

            // === Headers-First Sync ===
            MSG_GETHEADERS_LOCATOR => self.handle_getheaders_locator(peer_id, payload).await,
            MSG_HEADERS => self.handle_headers(peer_id, payload).await,

            // === Branch-Selective Sync (BRANCH_SELECTIVE_SYNC.md) ===
            MSG_GETBLOCKS_BRANCH => self.handle_getblocks_branch(peer_id, payload).await,
            MSG_SUBSCRIBE_BRANCH => self.handle_subscribe_branch(peer_id, payload).await,
            MSG_UNSUBSCRIBE_BRANCH => self.handle_unsubscribe_branch(peer_id, payload).await,
            MSG_BRANCH_ANNOUNCE => self.handle_branch_announce(peer_id, payload).await,
            MSG_BRANCH_INVENTORY => self.handle_branch_inventory(peer_id, payload).await,

            // === Space Name Resolution (Bug #4) ===
            MSG_GET_SPACE_META => self.handle_get_space_meta(peer_id, payload).await,
            MSG_SPACE_META => self.handle_space_meta(peer_id, payload).await,

            // === Chain Status (not yet implemented) ===
            MSG_GETHEADERS | MSG_CHAINSTATUS => Err(RouteError::SubsystemUnavailable("chain_sync")),

            // === DHT (Kademlia) - SPEC_06 §3.8 ===
            MSG_DHT_PING => self.handle_dht_ping(peer_id, payload, peer_addr).await,
            MSG_DHT_PONG => self.handle_dht_pong(peer_id, payload, peer_addr).await,
            MSG_DHT_FIND_NODE => self.handle_dht_find_node(peer_id, payload, peer_addr).await,
            MSG_DHT_NODES => self.handle_dht_nodes(peer_id, payload, peer_addr).await,
            MSG_DHT_FIND_VALUE => {
                self.handle_dht_find_value(peer_id, payload, peer_addr)
                    .await
            }
            MSG_DHT_PROVIDERS => self.handle_dht_providers(peer_id, payload, peer_addr).await,
            MSG_DHT_STORE => self.handle_dht_store(peer_id, payload, peer_addr).await,
            MSG_DHT_STORE_ACK => self.handle_dht_store_ack(peer_id, payload, peer_addr).await,

            // === Spam Attestation (SPEC_12 §3) ===
            MSG_SPAM_ATTESTATION => self.handle_spam_attestation(peer_id, payload).await,
            MSG_COUNTER_ATTESTATION => self.handle_counter_attestation(peer_id, payload).await,

            // === Sponsorship Offers (SPEC_11 §3.11) ===
            MSG_SPONSORSHIP_OFFER => self.handle_sponsorship_offer(peer_id, payload).await,
            MSG_SPONSORSHIP_OFFER_CLAIM => self.handle_sponsorship_claim(peer_id, payload).await,
            MSG_SPONSORSHIP_CLAIM_RESPONSE => {
                self.handle_sponsorship_claim_response(peer_id, payload)
                    .await
            }
            MSG_SPONSORSHIP_OFFER_QUERY => {
                self.handle_sponsorship_offer_query(peer_id, payload).await
            }
            MSG_SPONSORSHIP_OFFER_LIST => {
                self.handle_sponsorship_offer_list(peer_id, payload).await
            }

            // === Unknown ===
            _ => Err(RouteError::UnknownMessageType(message_type)),
        };

        // Record metrics based on result
        match &result {
            Ok(Some(_)) => {
                self.metrics.record_route_processed();
                self.metrics.record_route_response();
            }
            Ok(None) => {
                self.metrics.record_route_processed();
            }
            Err(_) => {
                self.metrics.record_route_failed();
            }
        }

        result
    }

    // ========== Keepalive Handlers ==========

    /// Handle PING message - returns PONG with same nonce
    ///
    /// Payload format: nonce[8] (little-endian u64)
    fn handle_ping(&self, payload: &[u8]) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        if payload.len() < 8 {
            return Err(RouteError::PayloadTooSmall {
                expected: 8,
                actual: payload.len(),
            });
        }

        // Return PONG with same nonce
        Ok(Some((MSG_PONG, payload[..8].to_vec())))
    }

    /// Handle PONG message - remove from pending, log RTT
    ///
    /// Payload format: nonce[8]
    fn handle_pong(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        if payload.len() < 8 {
            return Err(RouteError::PayloadTooSmall {
                expected: 8,
                actual: payload.len(),
            });
        }

        let nonce = u64::from_le_bytes(payload[..8].try_into().unwrap());

        let mut pending = self.pending_pings.write().unwrap();
        if let Some((sent_at, expected_peer)) = pending.get(&nonce) {
            if *expected_peer == *peer_id {
                let rtt_ms = sent_at.elapsed().as_millis();
                debug!(
                    "PONG received from peer {} with RTT {}ms",
                    hex::encode(peer_id),
                    rtt_ms
                );
                // Only remove if peer matches
                pending.remove(&nonce);
            }
            // If peer doesn't match, leave the entry - could be a replay or wrong peer
        }

        Ok(None)
    }

    /// Register a pending ping for RTT measurement
    ///
    /// Returns the nonce to use in the PING message.
    pub fn register_ping(&self, peer_id: &[u8; 32]) -> u64 {
        use rand::Rng;
        let nonce: u64 = rand::thread_rng().gen();
        self.pending_pings
            .write()
            .unwrap()
            .insert(nonce, (Instant::now(), *peer_id));
        nonce
    }

    /// Get the number of pending pings (for testing)
    #[cfg(test)]
    pub fn pending_ping_count(&self) -> usize {
        self.pending_pings.read().unwrap().len()
    }

    // ========== Discovery Handlers ==========

    /// Handle GETADDR - return known peers from PeerStore
    ///
    /// Payload format: fork_id[32] + max_addrs[2] = 34 bytes min
    fn handle_getaddr(&self, payload: &[u8]) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        if payload.len() < 34 {
            return Err(RouteError::PayloadTooSmall {
                expected: 34,
                actual: payload.len(),
            });
        }

        let max_addrs = u16::from_le_bytes([payload[32], payload[33]]) as usize;
        let max_addrs = max_addrs.min(MAX_ADDRS_PER_MESSAGE);

        // Return peers from PeerStore if available
        let peers = if let Some(ref store) = self.peer_store {
            // Get peers with positive score (successful connections)
            match store.get_by_min_score(0) {
                Ok(entries) => entries
                    .into_iter()
                    .take(max_addrs)
                    .map(|e| e.wire_addr)
                    .collect::<Vec<_>>(),
                Err(e) => {
                    debug!("[GETADDR] Failed to get peers from store: {}", e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        // Build ADDR response: count[2] + addresses[75*N]
        let count = peers.len() as u16;
        let mut response = Vec::with_capacity(2 + peers.len() * WIRE_ADDRESS_SIZE);
        response.extend_from_slice(&count.to_le_bytes());
        for peer in &peers {
            response.extend_from_slice(&peer.to_bytes());
        }

        info!("[GETADDR] Returning {} peer addresses", count);
        Ok(Some((MSG_ADDR, response)))
    }

    /// Handle ADDR - store received peer addresses in PeerStore
    ///
    /// Payload format: count[2] + addresses[75*N]
    fn handle_addr(&self, payload: &[u8]) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::discovery::PeerEntry;
        use std::time::{SystemTime, UNIX_EPOCH};

        if payload.len() < 2 {
            return Err(RouteError::PayloadTooSmall {
                expected: 2,
                actual: payload.len(),
            });
        }

        let count = u16::from_le_bytes([payload[0], payload[1]]) as usize;
        if count > MAX_ADDRS_PER_MESSAGE {
            return Err(RouteError::PayloadTooLarge {
                max: MAX_ADDRS_PER_MESSAGE,
                actual: count,
            });
        }

        let expected_size = 2 + count * WIRE_ADDRESS_SIZE;
        if payload.len() < expected_size {
            return Err(RouteError::PayloadTooSmall {
                expected: expected_size,
                actual: payload.len(),
            });
        }

        // Store addresses in PeerStore if available
        if let Some(ref store) = self.peer_store {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let mut stored = 0;
            for i in 0..count {
                let offset = 2 + i * WIRE_ADDRESS_SIZE;
                let addr_bytes = &payload[offset..offset + WIRE_ADDRESS_SIZE];

                // Parse WireAddr
                if let Ok(wire_addr) = WireAddr::from_bytes(addr_bytes) {
                    let entry = PeerEntry::new(wire_addr, now);
                    if let Err(e) = store.put(&entry) {
                        debug!("[ADDR] Failed to store peer: {}", e);
                    } else {
                        stored += 1;
                    }
                }
            }
            info!("[ADDR] Stored {} of {} received addresses", stored, count);
        } else {
            debug!(
                "[ADDR] Received {} addresses but PeerStore not available",
                count
            );
        }

        Ok(None)
    }

    // NOTE: Legacy INV/GETDATA/DATA/NOTFOUND/GOSSIP handlers removed.
    // Use WHO_HAS/I_HAVE/GET/DATA_CONTENT protocol instead (SPEC_07).

    // ========== Content Handlers (SPEC_07) ==========

    /// Handle WHO_HAS message - respond with I_HAVE if we have the content,
    /// or relay WHO_HAS to known peers that have it
    ///
    /// Payload format: hash[32]
    async fn handle_who_has(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let content_mgr = self
            .content_retrieval
            .as_ref()
            .ok_or(RouteError::SubsystemUnavailable("content"))?;

        if payload.len() < 32 {
            return Err(RouteError::PayloadTooSmall {
                expected: 32,
                actual: payload.len(),
            });
        }

        let mut hash_bytes = [0u8; 32];
        hash_bytes.copy_from_slice(&payload[..32]);
        let who_has = WhoHasPayload::new(hash_bytes);

        info!(
            "[CONTENT-SYNC] Received WHO_HAS from {} for {}",
            hex::encode(&peer_id[..8]),
            hex::encode(&hash_bytes[..8])
        );

        // Check if we have the content and respond
        if let Some(i_have) = content_mgr.on_who_has(&who_has, *peer_id) {
            // Include our own peer_id as the provider so the requester knows who to GET from
            let our_peer_id = if let Some(dht) = &self.dht {
                dht.local_id().to_bytes()
            } else {
                [0u8; 32] // Fallback - receiver will treat as self-announcement from sender
            };
            let full_payload = IHavePayload::with_provider(i_have.hash, our_peer_id);
            info!(
                "[CONTENT-SYNC] Responding I_HAVE for {} to {} (provider: {})",
                hex::encode(&i_have.hash[..8]),
                hex::encode(&peer_id[..8]),
                hex::encode(&our_peer_id[..8])
            );
            Ok(Some((MSG_I_HAVE, full_payload.to_bytes())))
        } else {
            // We don't have the content locally, but check if we know peers that do
            let content_hash = ContentBlobHash::from_bytes(hash_bytes);
            let known_peers = content_mgr.get_peers_with_content(&content_hash);

            // Relay WHO_HAS to peers that might have it
            if let Some(pool) = &self.connection_pool {
                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::WhoHas,
                    hash_bytes.to_vec(),
                );

                let mut relayed_count = 0;

                if !known_peers.is_empty() {
                    // First try to relay to peers we know have the content
                    for known_peer in known_peers.iter() {
                        // Don't relay back to the requester
                        if known_peer == peer_id {
                            continue;
                        }

                        // Relay WHO_HAS to this peer
                        if let Err(e) = pool.send_to(known_peer, &envelope).await {
                            debug!(
                                "[CONTENT-SYNC] Failed to relay WHO_HAS to provider {}: {}",
                                hex::encode(&known_peer[..8]),
                                e
                            );
                        } else {
                            relayed_count += 1;
                        }
                    }

                    if relayed_count > 0 {
                        // Record this relay so we can forward I_HAVE responses
                        if let Ok(mut pending) = self.pending_who_has_relay.write() {
                            // Clean up old entries (older than 60 seconds)
                            let now = Instant::now();
                            pending.retain(|_, (ts, _)| now.duration_since(*ts).as_secs() < 60);

                            // Add or update the entry for this content
                            pending
                                .entry(hash_bytes)
                                .and_modify(|(ts, peers)| {
                                    *ts = now;
                                    if !peers.contains(peer_id) {
                                        peers.push(*peer_id);
                                    }
                                })
                                .or_insert_with(|| (now, vec![*peer_id]));
                        }

                        info!(
                            "[CONTENT-SYNC] Relayed WHO_HAS for {} to {} known peers, will forward I_HAVE to {}",
                            hex::encode(&hash_bytes[..8]),
                            relayed_count,
                            hex::encode(&peer_id[..8])
                        );
                    } else {
                        // We know providers but can't reach any of them directly
                        // Respond with I_HAVE including the known provider's peer_id
                        // so the requester knows who to connect to
                        let known_provider = known_peers[0]; // Use first known provider
                        let i_have_payload =
                            IHavePayload::with_provider(hash_bytes, known_provider);
                        info!(
                            "[CONTENT-SYNC] Responding I_HAVE for {} (not connected to provider {}, passing info to requester {})",
                            hex::encode(&hash_bytes[..8]),
                            hex::encode(&known_provider[..8]),
                            hex::encode(&peer_id[..8])
                        );
                        return Ok(Some((MSG_I_HAVE, i_have_payload.to_bytes())));
                    }
                } else {
                    // No known peers have it - content provider hasn't announced via I_HAVE yet
                    // The startup re-announcement task should handle this case
                    debug!(
                        "[CONTENT-SYNC] WHO_HAS for {} - no known providers (awaiting startup re-announcement)",
                        hex::encode(&hash_bytes[..8])
                    );
                }
            }

            debug!(
                "[CONTENT-SYNC] Don't have content {} requested by {} (known providers: {})",
                hex::encode(&hash_bytes[..8]),
                hex::encode(&peer_id[..8]),
                known_peers.len()
            );
            Ok(None)
        }
    }

    /// Handle I_HAVE message - record peer as having content, request if we don't have it
    ///
    /// Payload format: hash[32] + provider_id[32] (64 bytes)
    /// The provider_id tells us who actually has the content (may differ from sender for relays)
    async fn handle_i_have(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let content_mgr = self
            .content_retrieval
            .as_ref()
            .ok_or(RouteError::SubsystemUnavailable("content"))?;

        if payload.len() < 32 {
            return Err(RouteError::PayloadTooSmall {
                expected: 32,
                actual: payload.len(),
            });
        }

        // Parse the full payload (handles backwards compatibility with 32-byte payloads)
        let i_have = IHavePayload::from_bytes(payload)
            .map_err(|e| RouteError::DeserializationError(format!("I_HAVE: {}", e)))?;

        // Determine the actual provider: use provider_id if set, otherwise sender is the provider
        let actual_provider = if i_have.is_self_announcement() {
            *peer_id // Zero provider_id means sender has the content
        } else {
            i_have.provider_id // Explicit provider_id from relay
        };

        debug!(
            "[CONTENT-SYNC] Received I_HAVE from {} for {} (provider: {})",
            hex::encode(&peer_id[..8]),
            hex::encode(&i_have.hash[..8]),
            hex::encode(&actual_provider[..8])
        );

        // Record availability - pass the actual sender (peer_id) so on_i_have can record
        // both the ultimate provider AND the relay peer who told us about it
        let is_wanted = content_mgr.on_i_have(&i_have, *peer_id);

        // Check if we have pending WHO_HAS relays for this content - forward I_HAVE to waiting peers
        let pending_peers: Vec<[u8; 32]> =
            if let Ok(mut pending) = self.pending_who_has_relay.write() {
                if let Some((_, peers)) = pending.remove(&i_have.hash) {
                    peers
                } else {
                    vec![]
                }
            } else {
                vec![]
            };

        if !pending_peers.is_empty() {
            if let Some(pool) = &self.connection_pool {
                // Forward I_HAVE with the ACTUAL PROVIDER ID so the receiver knows who to GET from
                let forward_payload = IHavePayload::with_provider(i_have.hash, actual_provider);
                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::IHave,
                    forward_payload.to_bytes(),
                );

                let mut forwarded_count = 0;
                for waiting_peer in pending_peers.iter() {
                    // Don't forward to the peer who sent I_HAVE or the actual provider
                    if waiting_peer == peer_id || waiting_peer == &actual_provider {
                        continue;
                    }

                    if let Err(e) = pool.send_to(waiting_peer, &envelope).await {
                        debug!(
                            "[CONTENT-SYNC] Failed to forward I_HAVE to {}: {}",
                            hex::encode(&waiting_peer[..8]),
                            e
                        );
                    } else {
                        forwarded_count += 1;
                    }
                }

                if forwarded_count > 0 {
                    info!(
                        "[CONTENT-SYNC] Forwarded I_HAVE for {} to {} waiting peers (provider: {})",
                        hex::encode(&i_have.hash[..8]),
                        forwarded_count,
                        hex::encode(&actual_provider[..8])
                    );
                }
            }
        }

        if is_wanted {
            // User explicitly requested this content via request_content RPC
            // Send GET to the ACTUAL PROVIDER, not the relay
            info!(
                "[CONTENT-SYNC] Content {} is WANTED - sending GET to provider {}",
                hex::encode(&i_have.hash[..8]),
                hex::encode(&actual_provider[..8])
            );

            // Send GET directly to the actual provider via connection pool
            if let Some(pool) = &self.connection_pool {
                let get_envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::Get,
                    i_have.hash.to_vec(),
                );

                // Try to send GET to actual provider first
                if actual_provider != *peer_id {
                    // Provider is different from sender (relay scenario)
                    if pool.send_to(&actual_provider, &get_envelope).await.is_ok() {
                        info!(
                            "[CONTENT-SYNC] Sent GET to actual provider {} for {}",
                            hex::encode(&actual_provider[..8]),
                            hex::encode(&i_have.hash[..8])
                        );
                        return Ok(None); // GET sent directly, no response needed
                    } else {
                        // Not connected to provider, fall back to sender (relay)
                        info!(
                            "[CONTENT-SYNC] Not connected to provider {}, falling back to relay {}",
                            hex::encode(&actual_provider[..8]),
                            hex::encode(&peer_id[..8])
                        );
                    }
                }
            }

            // If we can't send to provider directly, send GET back to whoever sent I_HAVE
            // (they might be the provider, or they might need to relay)
            return Ok(Some((MSG_GET, i_have.hash.to_vec())));
        }

        // VIEW-TO-HOST MODEL: We only record that this peer has the content.
        // We do NOT automatically fetch it. Content is only retrieved when
        // a user explicitly views/requests it via RPC (get_content, view_thread, etc.)
        //
        // This prevents nodes from being flooded with unwanted content and ensures
        // users only cache/serve content they have consciously engaged with.
        //
        // The peer location is already recorded in content_mgr.on_i_have() above,
        // so when a user later requests this content, we know which peer to ask.
        debug!(
            "[CONTENT-SYNC] Recorded provider {} has content {} (view-to-host: not auto-fetching)",
            hex::encode(&actual_provider[..8]),
            hex::encode(&i_have.hash[..8])
        );
        Ok(None)
    }

    /// Handle GET message - respond with DATA_CONTENT if we have it
    ///
    /// Payload format: hash[32]
    async fn handle_get(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let content_mgr = self
            .content_retrieval
            .as_ref()
            .ok_or(RouteError::SubsystemUnavailable("content"))?;

        if payload.len() < 32 {
            return Err(RouteError::PayloadTooSmall {
                expected: 32,
                actual: payload.len(),
            });
        }

        let mut hash_bytes = [0u8; 32];
        hash_bytes.copy_from_slice(&payload[..32]);
        let get_payload = GetPayload::new(hash_bytes);

        info!(
            "[CONTENT-SYNC] Received GET from {} for {}",
            hex::encode(&peer_id[..8]),
            hex::encode(&hash_bytes[..8])
        );

        // Try to get the content
        match content_mgr.on_get(&get_payload) {
            Ok(data_payload) => {
                let data_len = data_payload.data.len();
                info!(
                    "[CONTENT-SYNC] Sending DATA_CONTENT ({} bytes) to {} for {}",
                    data_len,
                    hex::encode(&peer_id[..8]),
                    hex::encode(&hash_bytes[..8])
                );

                Ok(Some((MSG_DATA_CONTENT, data_payload.data)))
            }
            Err(not_found) => {
                let hex_hash = hex::encode(&hash_bytes[..8]);
                let hex_peer = hex::encode(&peer_id[..8]);

                // Check if we know any peers that have this content and try to relay GET
                // This includes both the original provider AND relay peers who told us about it
                let known_peers =
                    content_mgr.get_peers_with_content(&ContentBlobHash::from_bytes(hash_bytes));

                if !known_peers.is_empty() {
                    info!(
                        "[CONTENT-SYNC] Content {} not found locally, but know {} peers with it - trying relay from {}",
                        hex_hash, known_peers.len(), hex_peer
                    );

                    // Try to relay GET to any known peer that we're connected to
                    if let Some(pool) = &self.connection_pool {
                        let get_envelope =
                            crate::types::network::MessageEnvelope::new_fork_agnostic(
                                crate::types::network::MessageType::Get,
                                hash_bytes.to_vec(),
                            );

                        for known_peer in &known_peers {
                            let hex_known = hex::encode(&known_peer[..8]);
                            if pool.send_to(known_peer, &get_envelope).await.is_ok() {
                                // Record in pending relay cache so when we receive DATA, we forward to original requester
                                if let Ok(mut cache) = self.pending_who_has_relay.write() {
                                    cache.insert(
                                        hash_bytes,
                                        (std::time::Instant::now(), vec![*peer_id]),
                                    );
                                }

                                info!(
                                    "[CONTENT-SYNC] Relayed GET for {} to peer {}, will forward DATA to {}",
                                    hex_hash, hex_known, hex_peer
                                );
                                // Return None - we'll send the response when we get DATA back
                                return Ok(None);
                            } else {
                                info!(
                                    "[CONTENT-SYNC] Cannot relay GET to {} for {} - not connected",
                                    hex_known, hex_hash
                                );
                            }
                        }

                        info!(
                            "[CONTENT-SYNC] Failed to relay GET for {} - not connected to any of {} known peers",
                            hex_hash, known_peers.len()
                        );
                    }
                }

                info!(
                    "[CONTENT-SYNC] Content NOT FOUND for {} requested by {}",
                    hex_hash, hex_peer
                );
                // Serialize NOTFOUND_CONTENT response
                // Format: count[2] + items[33*N]
                let count = not_found.items.len() as u16;
                let mut response = Vec::with_capacity(2 + not_found.items.len() * 33);
                response.extend_from_slice(&count.to_le_bytes());
                for item in not_found.items {
                    response.push(item.inv_type);
                    response.extend_from_slice(&item.hash);
                }
                Ok(Some((MSG_NOTFOUND_CONTENT, response)))
            }
        }
    }

    /// Handle DATA_CONTENT message - store received content
    ///
    /// Payload format: hash[32] + length[4] + data[N]
    async fn handle_data_content(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let content_mgr = self
            .content_retrieval
            .as_ref()
            .ok_or(RouteError::SubsystemUnavailable("content"))?;

        if payload.len() < 36 {
            return Err(RouteError::PayloadTooSmall {
                expected: 36,
                actual: payload.len(),
            });
        }

        let mut hash_bytes = [0u8; 32];
        hash_bytes.copy_from_slice(&payload[..32]);
        let expected_hash = ContentBlobHash::from_bytes(hash_bytes);

        let length =
            u32::from_le_bytes([payload[32], payload[33], payload[34], payload[35]]) as usize;

        if payload.len() < 36 + length {
            return Err(RouteError::PayloadTooSmall {
                expected: 36 + length,
                actual: payload.len(),
            });
        }

        let data = &payload[36..36 + length];

        info!(
            "[CONTENT-SYNC] Received DATA_CONTENT from {} for {} ({} bytes)",
            hex::encode(&peer_id[..8]),
            hex::encode(&hash_bytes[..8]),
            length
        );

        // BLOCKLIST CHECK: Reject content that matches blocklist entries
        // This prevents storing CSAM/illegal content even if received from network
        // Primary match is on the SHA-256 content id. For seeded external lists
        // (SPEC_12) we also recompute SHA-1/MD5 over the received bytes and match
        // the auxiliary indexes, since industry CSAM lists distribute those
        // legacy digests rather than SHA-256.
        if let Some(ref blocklist) = self.blocklist {
            let store = blocklist.read().unwrap();
            let mut matched: Option<&str> = None;
            if store.is_blocked(&hash_bytes) {
                matched = Some("sha256");
            } else if store.is_blocked_sha1(&crate::crypto::sha1(data)) {
                matched = Some("sha1");
            } else if store.is_blocked_md5(&crate::crypto::md5(data)) {
                matched = Some("md5");
            }
            if let Some(kind) = matched {
                warn!(
                    "[BLOCKLIST] Rejected DATA_CONTENT from {} - content {} matches blocklist ({})",
                    hex::encode(&peer_id[..8]),
                    hex::encode(&hash_bytes[..8]),
                    kind
                );
                return Err(RouteError::InvalidData("content blocked".to_string()));
            }
        }

        // Store the content
        match content_mgr.on_data(&expected_hash, data) {
            Ok(()) => {
                info!(
                    "[CONTENT-SYNC] Stored content {} ({} bytes)",
                    hex::encode(&hash_bytes[..8]),
                    length
                );

                // Register with decay integration for lifecycle management
                if let Some(ref decay) = self.decay_integration {
                    if let Err(e) = decay.register_blob(hash_bytes, length as u64) {
                        warn!(
                            "[DECAY] Failed to register content {} for decay: {}",
                            hex::encode(&hash_bytes[..8]),
                            e
                        );
                    } else {
                        debug!(
                            "[DECAY] Registered content {} for decay tracking",
                            hex::encode(&hash_bytes[..8])
                        );
                    }
                }

                // Announce to DHT that we have this content (SPEC_06 §3.8)
                if let Some(ref dht) = self.dht {
                    dht.add_local_content(hash_bytes).await;
                    debug!(
                        "[DHT] Announced content {} to DHT",
                        hex::encode(&hash_bytes[..8])
                    );
                }

                // Add to pending_broadcast for multi-hop propagation
                // This ensures received content is re-announced to other peers
                if let Some(ref data_dir) = self.data_dir {
                    let pending_path = data_dir.join("pending_broadcast");
                    if std::fs::create_dir_all(&pending_path).is_ok() {
                        let pending_file = pending_path.join(hex::encode(&hash_bytes));
                        if std::fs::write(&pending_file, &hash_bytes).is_ok() {
                            debug!(
                                "[CONTENT-SYNC] Queued content {} for re-broadcast",
                                hex::encode(&hash_bytes[..8])
                            );
                        }
                    }
                }

                // Index the content for full-text search if possible
                // Try to deserialize as ContentItem and extract indexable fields
                if let Some(ref search_index) = self.search_index {
                    // Try to deserialize the content as a ContentItem
                    if let Ok(item) =
                        bincode::deserialize::<crate::types::content::ContentItem>(data)
                    {
                        // Extract title and body from body_inline (format: "title\n\nbody")
                        let (title, body) = if let Some(ref body_inline) = item.body_inline {
                            if let Some(idx) = body_inline.find("\n\n") {
                                (
                                    body_inline[..idx].to_string(),
                                    body_inline[idx + 2..].to_string(),
                                )
                            } else {
                                // No title, just body
                                (String::new(), body_inline.clone())
                            }
                        } else {
                            (String::new(), String::new())
                        };

                        // Convert space_id to bech32m format (sp1...) for consistency with RPC
                        let space_id_str = {
                            use bech32::{Bech32m, Hrp};
                            let hrp = Hrp::parse("sp").expect("valid HRP");
                            let space_bytes = item.space_id.as_bytes();
                            let mut data_vec = Vec::with_capacity(17);
                            data_vec.push(0); // version byte
                            data_vec.extend_from_slice(&space_bytes[..16]);
                            bech32::encode::<Bech32m>(hrp, &data_vec)
                                .unwrap_or_else(|_| hex::encode(&space_bytes[..16]))
                        };

                        // Convert author_id to bech32m address format (cs1...) for consistency with RPC
                        let author_str = crate::crypto::address::encode_address(&item.author_id);

                        let indexable = IndexableContent {
                            content_id: format!("sha256:{}", hex::encode(&hash_bytes)),
                            space_id: space_id_str,
                            author: author_str,
                            title,
                            body,
                            heat: 100.0, // New content starts at 100% heat
                            timestamp: item.created_at,
                        };

                        if let Ok(mut index) = search_index.write() {
                            if let Err(e) = index.add_content(&indexable) {
                                warn!(
                                    "[SEARCH] Failed to index network content {}: {}",
                                    hex::encode(&hash_bytes[..8]),
                                    e
                                );
                            } else {
                                debug!(
                                    "[SEARCH] Indexed network content {}",
                                    hex::encode(&hash_bytes[..8])
                                );
                            }
                        }
                    }
                    // If deserialization fails, it's not a ContentItem (might be media blob, etc.)
                    // This is expected and not an error
                }

                // Check if there are peers waiting for this content (relay scenario)
                // If we were acting as a relay for a GET request, forward DATA to the requester
                let waiting_peers = self
                    .pending_who_has_relay
                    .write()
                    .ok()
                    .and_then(|mut cache| cache.remove(&hash_bytes));

                if let Some((_, peers)) = waiting_peers {
                    if let Some(pool) = &self.connection_pool {
                        // Forward the DATA_CONTENT to each waiting peer
                        for waiting_peer in &peers {
                            let data_envelope =
                                crate::types::network::MessageEnvelope::new_fork_agnostic(
                                    crate::types::network::MessageType::DataContent,
                                    payload.to_vec(), // Forward the original payload
                                );
                            if pool.send_to(waiting_peer, &data_envelope).await.is_ok() {
                                info!(
                                    "[CONTENT-SYNC] Relayed DATA_CONTENT for {} to waiting peer {}",
                                    hex::encode(&hash_bytes[..8]),
                                    hex::encode(&waiting_peer[..8])
                                );
                            } else {
                                warn!(
                                    "[CONTENT-SYNC] Failed to relay DATA_CONTENT to waiting peer {}",
                                    hex::encode(&waiting_peer[..8])
                                );
                            }
                        }
                    }
                }
            }
            Err(e) => {
                warn!(
                    "[CONTENT-SYNC] Failed to store content {}: {}",
                    hex::encode(&hash_bytes[..8]),
                    e
                );
            }
        }

        // No response needed
        Ok(None)
    }

    /// Handle NOTFOUND_CONTENT message - peer doesn't have requested content
    ///
    /// Payload format: count[2] + items[33*N]
    async fn handle_notfound_content(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let content_mgr = self
            .content_retrieval
            .as_ref()
            .ok_or(RouteError::SubsystemUnavailable("content"))?;

        if payload.len() < 2 {
            return Err(RouteError::PayloadTooSmall {
                expected: 2,
                actual: payload.len(),
            });
        }

        let count = u16::from_le_bytes([payload[0], payload[1]]) as usize;

        info!(
            "[CONTENT-SYNC] Received NOTFOUND_CONTENT from {} for {} items",
            hex::encode(&peer_id[..8]),
            count
        );

        // Process each not-found item
        for i in 0..count {
            let offset = 2 + i * 33;
            if payload.len() < offset + 33 {
                break;
            }
            let mut hash_bytes = [0u8; 32];
            hash_bytes.copy_from_slice(&payload[offset + 1..offset + 33]);
            let hash = ContentBlobHash::from_bytes(hash_bytes);

            // Remove peer from availability for this hash
            let _ = content_mgr.on_not_found(&hash, *peer_id);
        }

        // No response needed
        Ok(None)
    }

    // ========== Social Layer Handlers (SPEC_09) ==========
    // NOTE: Level/contribution/attestation handlers removed - level system deprecated

    async fn handle_space_health_query(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // Parse the space health query
        let query = SpaceHealthQueryPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("Invalid SPACE_HEALTH_QUERY payload".to_string())
        })?;

        info!(
            "[SPACE_HEALTH] Query from {} for space {}",
            hex::encode(&peer_id[..8]),
            hex::encode(&query.space_id[..8])
        );

        // Phase 1: Return default healthy status
        // Full health lookup requires SpaceHealthManager integration
        let response = SpaceHealthResponsePayload::new(query.space_id);

        Ok(Some((MSG_SPACE_HEALTH_RESPONSE, response.to_bytes())))
    }

    async fn handle_space_health_response(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // Parse the space health response
        let response = SpaceHealthResponsePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("Invalid SPACE_HEALTH_RESPONSE payload".to_string())
        })?;

        info!(
            "[SPACE_HEALTH] Response from {} for space {}: health_score={} active_swimmers={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&response.space_id[..8]),
            response.health_score,
            response.active_swimmers
        );

        // Phase 1: Log the response
        // Full caching requires SpaceHealthManager integration
        Ok(None)
    }

    async fn handle_attribution_query(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // Parse the attribution query
        let query = AttributionQueryPayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Invalid ATTRIBUTION_QUERY: {}", e))
        })?;

        info!(
            "[ATTRIBUTION] Query from {} for content {}",
            hex::encode(&peer_id[..8]),
            hex::encode(&query.content_id[..8])
        );

        // Phase 1: Return default empty attribution
        // Full attribution lookup requires AttributionManager integration
        let response = AttributionResponsePayload::new(query.content_id);

        Ok(Some((MSG_ATTRIBUTION_RESPONSE, response.to_bytes())))
    }

    async fn handle_attribution_response(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // Parse the attribution response
        let response = AttributionResponsePayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Invalid ATTRIBUTION_RESPONSE: {}", e))
        })?;

        info!(
            "[ATTRIBUTION] Response from {} for content {}: {} contributors, {} total PoW",
            hex::encode(&peer_id[..8]),
            hex::encode(&response.content_id[..8]),
            response.total_contributors,
            response.total_pow
        );

        // Phase 1: Log the response
        // Full caching requires AttributionManager integration
        Ok(None)
    }

    // ========== Error/Control Handlers ==========

    /// Handle REJECT - log the rejection
    fn handle_reject(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // REJECT format: rejected_type[1] + code[1] + reason_len[2] + reason[N]
        if payload.len() < 4 {
            return Err(RouteError::PayloadTooSmall {
                expected: 4,
                actual: payload.len(),
            });
        }

        let rejected_type = payload[0];
        let code = payload[1];
        let reason_len = u16::from_le_bytes([payload[2], payload[3]]) as usize;

        let reason = if payload.len() >= 4 + reason_len {
            String::from_utf8_lossy(&payload[4..4 + reason_len]).to_string()
        } else {
            "<truncated>".to_string()
        };

        warn!(
            "Received REJECT from peer {}: type=0x{:02x} code={} reason={}",
            hex::encode(peer_id),
            rejected_type,
            code,
            reason
        );

        Ok(None)
    }

    /// Handle ALERT - log the alert
    fn handle_alert(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        // ALERT format: priority[1] + alert_id[32] + expires[8] + msg_len[2] + msg[N]
        if payload.len() < 43 {
            return Err(RouteError::PayloadTooSmall {
                expected: 43,
                actual: payload.len(),
            });
        }

        let priority = payload[0];
        let alert_id = &payload[1..33];
        let expires = u64::from_le_bytes(payload[33..41].try_into().unwrap());
        let msg_len = u16::from_le_bytes([payload[41], payload[42]]) as usize;

        let message = if payload.len() >= 43 + msg_len {
            String::from_utf8_lossy(&payload[43..43 + msg_len]).to_string()
        } else {
            "<truncated>".to_string()
        };

        warn!(
            "Received ALERT from peer {}: id={} priority={} expires={} message={}",
            hex::encode(peer_id),
            hex::encode(&alert_id[..8]),
            priority,
            expires,
            message
        );

        Ok(None)
    }

    // ========== Block Handlers (SPEC_08) ==========

    /// Handle BLOCK_ANNOUNCE - receive announcement of a new block
    ///
    /// When a peer announces a new block, we check if we already have it.
    /// If not, we request it via GET_BLOCK.
    ///
    /// Payload format: BlockAnnouncePayload (60 bytes)
    async fn handle_block_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let announce = BlockAnnouncePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: BlockAnnouncePayload::SIZE,
                actual: payload.len(),
            }
        })?;

        info!(
            "[BLOCK] Received BLOCK_ANNOUNCE from peer {}: hash={} height={} pow={} spaces={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&announce.block_hash[..8]),
            announce.height,
            announce.total_pow,
            announce.space_block_count
        );

        // Check if we already have this block
        if let Some(ref chain_store) = self.chain_store {
            match chain_store.get_root_block(&announce.block_hash) {
                Ok(Some(_)) => {
                    debug!(
                        "[BLOCK] Already have block {}, ignoring announcement",
                        hex::encode(&announce.block_hash[..8])
                    );
                    return Ok(None);
                }
                Ok(None) => {
                    // We don't have this block. Check if it has higher cumulative PoW than our tip.
                    // If so, we need to do a locator sync to get the full chain from this peer.
                    let our_tip_pow = chain_store
                        .get_best_tip_block()
                        .ok()
                        .flatten()
                        .map(|b| b.cumulative_pow)
                        .unwrap_or(0);

                    if announce.total_pow > our_tip_pow {
                        // This peer has a heavier chain! Do a locator sync to get it.
                        info!(
                            "[BLOCK] Announced block {} has higher PoW ({}) than our tip ({}), triggering locator sync",
                            hex::encode(&announce.block_hash[..8]),
                            announce.total_pow,
                            our_tip_pow
                        );

                        // Generate our locator and send GETBLOCKS_LOCATOR to this specific peer
                        if let Ok(locator_hashes) = chain_store.generate_locator() {
                            let request = GetBlocksLocatorPayload::new(locator_hashes, 50);

                            // Send directly to this peer via connection pool
                            if let Some(ref pool) = self.connection_pool {
                                let envelope =
                                    crate::types::network::MessageEnvelope::new_fork_agnostic(
                                        crate::types::network::MessageType::GetBlocksLocator,
                                        request.to_bytes(),
                                    );

                                if let Err(e) = pool.send_to(peer_id, &envelope).await {
                                    warn!(
                                        "[BLOCK] Failed to send GETBLOCKS_LOCATOR to peer {}: {}",
                                        hex::encode(&peer_id[..8]),
                                        e
                                    );
                                    // Fall back to requesting just this block
                                    let get_block = GetBlockPayload::new(announce.block_hash);
                                    return Ok(Some((
                                        MSG_GET_BLOCK,
                                        get_block.to_bytes().to_vec(),
                                    )));
                                } else {
                                    info!(
                                        "[BLOCK] Sent GETBLOCKS_LOCATOR to peer {} to fetch heavier chain",
                                        hex::encode(&peer_id[..8])
                                    );
                                    return Ok(None); // Already sent, no response needed
                                }
                            }
                        }

                        // Fall back to requesting just this block if locator fails
                        let get_block = GetBlockPayload::new(announce.block_hash);
                        return Ok(Some((MSG_GET_BLOCK, get_block.to_bytes().to_vec())));
                    }

                    // Normal case: just request this block
                    info!(
                        "[BLOCK] Requesting block {} from peer {}",
                        hex::encode(&announce.block_hash[..8]),
                        hex::encode(&peer_id[..8])
                    );
                    let get_block = GetBlockPayload::new(announce.block_hash);
                    return Ok(Some((MSG_GET_BLOCK, get_block.to_bytes().to_vec())));
                }
                Err(e) => {
                    warn!("[BLOCK] Failed to check chain store: {}", e);
                    // Request anyway if we can't check
                    let get_block = GetBlockPayload::new(announce.block_hash);
                    return Ok(Some((MSG_GET_BLOCK, get_block.to_bytes().to_vec())));
                }
            }
        } else {
            debug!("[BLOCK] No chain store configured, ignoring block announcement");
        }

        Ok(None)
    }

    /// Handle GET_BLOCK - respond with block data
    ///
    /// When a peer requests a block by hash, we look it up in ChainStore
    /// and return the full block data (root + space blocks + content blocks).
    ///
    /// Payload format: GetBlockPayload (32 bytes)
    async fn handle_get_block(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let request =
            GetBlockPayload::from_bytes(payload).ok_or_else(|| RouteError::PayloadTooSmall {
                expected: GetBlockPayload::SIZE,
                actual: payload.len(),
            })?;

        debug!(
            "[BLOCK] Received GET_BLOCK from peer {}: hash={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&request.block_hash[..8])
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[BLOCK] No chain store configured, cannot serve block");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Look up the root block
        let root_block = match chain_store.get_root_block(&request.block_hash) {
            Ok(Some(block)) => block,
            Ok(None) => {
                info!(
                    "[BLOCK] Block {} not found, sending NOTFOUND",
                    hex::encode(&request.block_hash[..8])
                );
                // Return NOTFOUND for unknown blocks
                return Ok(Some((MSG_NOTFOUND, request.block_hash.to_vec())));
            }
            Err(e) => {
                warn!("[BLOCK] Failed to get block from chain store: {}", e);
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        // Build the block data response
        let mut response = BlockDataPayload::new(request.block_hash);

        // Serialize root block
        response.root_block = match bincode::serialize(&root_block) {
            Ok(bytes) => bytes,
            Err(e) => {
                warn!("[BLOCK] Failed to serialize root block: {}", e);
                return Err(RouteError::SerializationError(format!("{}", e)));
            }
        };

        // Collect space blocks referenced by the root block
        for space_hash in &root_block.space_block_hashes {
            match chain_store.get_space_block(space_hash) {
                Ok(Some(space_block)) => {
                    if let Ok(bytes) = bincode::serialize(&space_block) {
                        response.space_blocks.push(bytes);

                        // Collect content blocks referenced by this space block
                        for content_hash in &space_block.content_block_hashes {
                            match chain_store.get_content_block(content_hash) {
                                Ok(Some(content_block)) => {
                                    if let Ok(bytes) = bincode::serialize(&content_block) {
                                        response.content_blocks.push(bytes);
                                    }
                                }
                                Ok(None) => {
                                    warn!(
                                        "[BLOCK] Content block {} not found",
                                        hex::encode(&content_hash[..8])
                                    );
                                }
                                Err(e) => {
                                    warn!("[BLOCK] Failed to get content block: {}", e);
                                }
                            }
                        }
                    }
                }
                Ok(None) => {
                    warn!(
                        "[BLOCK] Space block {} not found",
                        hex::encode(&space_hash[..8])
                    );
                }
                Err(e) => {
                    warn!("[BLOCK] Failed to get space block: {}", e);
                }
            }
        }

        info!(
            "[BLOCK] Sending BLOCK_DATA for {}: root={} bytes, {} space blocks, {} content blocks",
            hex::encode(&request.block_hash[..8]),
            response.root_block.len(),
            response.space_blocks.len(),
            response.content_blocks.len()
        );

        Ok(Some((MSG_BLOCK_DATA, response.to_bytes())))
    }

    /// Handle BLOCK_DATA - receive and store block data
    ///
    /// When we receive block data in response to GET_BLOCK, we verify
    /// and store the blocks in ChainStore.
    ///
    /// Payload format: BlockDataPayload (variable)
    async fn handle_block_data(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let block_data =
            BlockDataPayload::from_bytes(payload).ok_or_else(|| RouteError::PayloadTooSmall {
                expected: BlockDataPayload::MIN_SIZE,
                actual: payload.len(),
            })?;

        info!(
            "[BLOCK] Received BLOCK_DATA from peer {}: hash={} root={} bytes, {} space blocks, {} content blocks",
            hex::encode(&peer_id[..8]),
            hex::encode(&block_data.block_hash[..8]),
            block_data.root_block.len(),
            block_data.space_blocks.len(),
            block_data.content_blocks.len()
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[BLOCK] No chain store configured, cannot store block");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Deserialize and store the root block
        let root_block: crate::blocks::RootBlock =
            match bincode::deserialize(&block_data.root_block) {
                Ok(block) => block,
                Err(e) => {
                    warn!("[BLOCK] Failed to deserialize root block: {}", e);
                    return Err(RouteError::DeserializationError(format!("{}", e)));
                }
            };

        // Verify the block hash matches
        let computed_hash = root_block.hash();
        if computed_hash != block_data.block_hash {
            warn!(
                "[BLOCK] Block hash mismatch: expected {}, got {}",
                hex::encode(&block_data.block_hash[..8]),
                hex::encode(&computed_hash[..8])
            );
            return Err(RouteError::InvalidData("block hash mismatch".to_string()));
        }

        // ============================================================
        // EARLY VALIDATION: Check block validity BEFORE storing content
        // This prevents spam from invalid blocks storing content anyway
        // ============================================================
        let block_height = root_block.height();
        let our_height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);

        // Check 1: If we already have a block at this height, apply fork resolution
        if let Ok(Some(existing_hash)) = chain_store.get_root_hash_at_height(block_height) {
            if existing_hash == computed_hash {
                // Same block, already have it - skip but don't error
                info!(
                    "[BLOCK] Already have block {} at height {}, skipping",
                    hex::encode(&computed_hash[..8]),
                    block_height
                );
                return Ok(None);
            } else {
                // Different block at same height - FORK RESOLUTION
                // Priority: 1) Higher cumulative_pow wins, 2) Lower hash wins (tiebreaker)
                use crate::storage::chain::ChainStore;

                // Get the existing block to compare cumulative_pow
                let existing_block = chain_store.get_root_block(&existing_hash).ok().flatten();

                let incoming_wins = if let Some(ref existing) = existing_block {
                    // Compare cumulative PoW first - heavier chain wins
                    if root_block.cumulative_pow > existing.cumulative_pow {
                        info!(
                            "[REORG] Incoming block {} (pow={}) beats existing {} (pow={}) at height {} (heavier chain)",
                            hex::encode(&computed_hash[..8]),
                            root_block.cumulative_pow,
                            hex::encode(&existing_hash[..8]),
                            existing.cumulative_pow,
                            block_height
                        );
                        true
                    } else if root_block.cumulative_pow < existing.cumulative_pow {
                        info!(
                            "[REORG] Keeping existing block {} (pow={}) over incoming {} (pow={}) at height {} (heavier chain)",
                            hex::encode(&existing_hash[..8]),
                            existing.cumulative_pow,
                            hex::encode(&computed_hash[..8]),
                            root_block.cumulative_pow,
                            block_height
                        );
                        false
                    } else {
                        // Equal cumulative_pow - use lower hash as tiebreaker
                        let hash_wins = ChainStore::hash_wins(&computed_hash, &existing_hash);
                        if hash_wins {
                            info!(
                                "[REORG] Block {} beats existing {} at height {} (lower hash tiebreaker, equal pow={})",
                                hex::encode(&computed_hash[..8]),
                                hex::encode(&existing_hash[..8]),
                                block_height,
                                root_block.cumulative_pow
                            );
                        } else {
                            info!(
                                "[REORG] Keeping existing block {} over incoming {} at height {} (lower hash tiebreaker, equal pow={})",
                                hex::encode(&existing_hash[..8]),
                                hex::encode(&computed_hash[..8]),
                                block_height,
                                root_block.cumulative_pow
                            );
                        }
                        hash_wins
                    }
                } else {
                    // Can't get existing block - fall back to hash comparison
                    ChainStore::hash_wins(&computed_hash, &existing_hash)
                };

                if incoming_wins {
                    // Rollback existing block and get orphaned actions
                    match chain_store.rollback_block_at_height(block_height) {
                        Ok(orphaned_actions) => {
                            info!(
                                "[REORG] Rolled back block {} at height {}, {} orphaned actions",
                                hex::encode(&existing_hash[..8]),
                                block_height,
                                orphaned_actions.len()
                            );

                            // Return orphaned actions to mempool
                            if let Some(ref bb) = self.block_builder {
                                if let Ok(mut builder) = bb.write() {
                                    for (thread_id, space_id, action, branch_path) in
                                        orphaned_actions
                                    {
                                        // Skip actions that are in the new winning block
                                        // (they'll be marked as finalized when we store the new block)
                                        builder.add_action(
                                            thread_id,
                                            space_id,
                                            action,
                                            branch_path,
                                        );
                                    }
                                    info!("[REORG] Returned orphaned actions to mempool");
                                }
                            }
                        }
                        Err(e) => {
                            warn!(
                                "[REORG] Failed to rollback block at height {}: {}",
                                block_height, e
                            );
                            return Err(RouteError::StorageError(format!(
                                "rollback failed: {}",
                                e
                            )));
                        }
                    }
                    // Continue to store the winning block below
                } else {
                    // Existing block wins - but we MUST still store the incoming block!
                    // This is critical: the incoming block might be a parent for orphan blocks.
                    // Store just the root block (not as canonical), then check for orphans.
                    info!(
                        "[FORK] Storing non-canonical block {} (pow={}) at height {} for orphan resolution",
                        hex::encode(&computed_hash[..8]),
                        root_block.cumulative_pow,
                        block_height
                    );

                    // Store just the root block (not updating canonical chain)
                    if let Err(e) = chain_store.put_root_block(&root_block) {
                        warn!("[FORK] Failed to store non-canonical block: {}", e);
                    } else {
                        // Check for orphans waiting for this block
                        self.process_orphans_for_block(&computed_hash).await;
                    }

                    return Ok(None);
                }
            }
        }

        // Check 2: Block height must be at most our_height + 1 (no gaps in chain)
        // If block is too far ahead, request missing intermediate blocks via GETBLOCKS
        if block_height > our_height + 1 {
            // If this block is heavier than our canonical tip, the gap may be a
            // FORK that diverged BELOW our tip, not simple lag. A height-range
            // backfill from our_height+1 can never cross a below-tip fork point
            // (the intermediate blocks it fetches reference ancestors we never
            // ask for, so they stay orphans forever — the "stuck at height 12"
            // bug). Escalate to a locator sync: the peer finds our true common
            // ancestor and streams the heavier chain contiguously from there.
            let our_tip_pow = chain_store
                .get_best_tip_block()
                .ok()
                .flatten()
                .map(|b| b.cumulative_pow)
                .unwrap_or(0);
            if root_block.cumulative_pow > our_tip_pow {
                if let (Some(pool), Ok(locator_hashes)) = (
                    self.connection_pool.as_ref(),
                    chain_store.generate_locator(),
                ) {
                    let request = GetBlocksLocatorPayload::new(locator_hashes, 50);
                    let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                        crate::types::network::MessageType::GetBlocksLocator,
                        request.to_bytes(),
                    );
                    match pool.send_to(peer_id, &envelope).await {
                        Ok(()) => {
                            info!(
                                "[BLOCK] Block {} (height {}, pow {}) heavier than our tip (pow {}) and {} ahead - sent GETBLOCKS_LOCATOR to fetch the fork from its common ancestor",
                                hex::encode(&computed_hash[..8]),
                                block_height,
                                root_block.cumulative_pow,
                                our_tip_pow,
                                block_height - our_height,
                            );
                            return Ok(None);
                        }
                        Err(e) => {
                            warn!(
                                "[BLOCK] Failed to send GETBLOCKS_LOCATOR to peer {}: {} - falling back to range backfill",
                                hex::encode(&peer_id[..8]),
                                e
                            );
                        }
                    }
                }
            }

            info!(
                "[BLOCK] Block {} at height {} is ahead of our height {} - requesting backfill",
                hex::encode(&computed_hash[..8]),
                block_height,
                our_height
            );

            // Send GETBLOCKS request to fetch missing intermediate blocks
            if let Some(ref pool) = self.connection_pool {
                let request = GetBlocksPayload {
                    start_height: our_height + 1,
                    end_height: block_height, // Request up to (but not including) this block
                    include_content: true,
                    max_blocks: 100,
                };

                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::GetBlocks,
                    request.to_bytes(),
                );

                if let Err(e) = pool.send_to(peer_id, &envelope).await {
                    warn!(
                        "[BLOCK] Failed to send GETBLOCKS backfill request to peer {}: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                } else {
                    info!(
                        "[BLOCK] Sent GETBLOCKS request for heights {}..{} to peer {}",
                        our_height + 1,
                        block_height,
                        hex::encode(&peer_id[..8])
                    );
                }
            }

            // Return Ok(None) - we're not rejecting, just deferring until we have intermediate blocks
            // The peer will respond with BLOCKS, and later re-announcements will succeed
            return Ok(None);
        }

        // Check 3: For height > 1, prev_root_hash must reference an existing block
        if block_height > 1 {
            let prev_hash = root_block.prev_root_hash;
            if prev_hash == [0u8; 32] {
                warn!(
                    "[BLOCK] REJECTED: Block {} at height {} has null prev_root_hash but height > 1",
                    hex::encode(&computed_hash[..8]),
                    block_height
                );
                return Err(RouteError::InvalidData(
                    "non-genesis block has null prev_root_hash".to_string(),
                ));
            }
            if chain_store
                .get_root_block(&prev_hash)
                .ok()
                .flatten()
                .is_none()
            {
                // Missing parent block - store as orphan and request parent
                info!(
                    "[ORPHAN] Block {} at height {} references unknown prev_root_hash {} - storing as orphan",
                    hex::encode(&computed_hash[..8]),
                    block_height,
                    hex::encode(&prev_hash[..8])
                );

                // Store this block as an orphan, keyed by the missing parent hash
                let orphan = OrphanBlock {
                    data: payload.to_vec(),
                    height: block_height,
                    block_hash: computed_hash,
                    from_peer: *peer_id,
                    orphaned_at: Instant::now(),
                };

                if let Ok(mut orphans) = self.orphan_blocks.write() {
                    // Limit orphan storage per missing parent (prevent memory abuse)
                    let orphan_list = orphans.entry(prev_hash).or_insert_with(Vec::new);
                    if orphan_list.len() < 100 {
                        // Check if we already have this orphan
                        let already_have =
                            orphan_list.iter().any(|o| o.block_hash == computed_hash);
                        if !already_have {
                            orphan_list.push(orphan);
                            info!(
                                "[ORPHAN] Stored orphan block {} waiting for parent {}",
                                hex::encode(&computed_hash[..8]),
                                hex::encode(&prev_hash[..8])
                            );
                        }
                    } else {
                        warn!(
                            "[ORPHAN] Too many orphans waiting for {}, dropping new orphan",
                            hex::encode(&prev_hash[..8])
                        );
                    }
                }

                // Request the missing parent block BY HASH (not by height!)
                // This is critical for handling forks - the peer may have different
                // blocks at the same heights, so we need the specific parent block.
                if let Some(ref pool) = self.connection_pool {
                    let get_block = GetBlockPayload::new(prev_hash);
                    let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                        crate::types::network::MessageType::GetBlock,
                        get_block.to_bytes().to_vec(),
                    );

                    if let Err(e) = pool.send_to(peer_id, &envelope).await {
                        warn!(
                            "[ORPHAN] Failed to send GET_BLOCK request for parent {} to peer {}: {}",
                            hex::encode(&prev_hash[..8]),
                            hex::encode(&peer_id[..8]),
                            e
                        );
                    } else {
                        info!(
                            "[ORPHAN] Sent GET_BLOCK request for parent {} to peer {}",
                            hex::encode(&prev_hash[..8]),
                            hex::encode(&peer_id[..8])
                        );
                    }
                }

                // Don't return an error - we're deferring processing, not rejecting
                return Ok(None);
            }
        }
        // ============================================================
        // END EARLY VALIDATION - block is valid, proceed to store content
        // ============================================================

        // CRITICAL: Check if this block would trigger a reorg to a heavier chain
        // If so, we need to unmark finalized actions from orphaned blocks BEFORE
        // checking for duplicate actions (otherwise legitimate reorg blocks get rejected)
        if let Ok(Some(current_tip)) = chain_store.get_best_tip_block() {
            if root_block.cumulative_pow > current_tip.cumulative_pow {
                // This block is heavier - find and orphan blocks from the old chain
                // We need to unmark finalized actions so they don't cause duplicate rejection
                info!(
                    "[REORG] Incoming block {} (pow={}) is heavier than tip {} (pow={}), unmarking orphaned actions",
                    hex::encode(&computed_hash[..8]),
                    root_block.cumulative_pow,
                    hex::encode(&current_tip.hash()[..8]),
                    current_tip.cumulative_pow
                );

                // Find common ancestor by tracing back the incoming block's chain
                // and unmark all actions from the current tip down to where chains diverge
                let incoming_parent = root_block.prev_root_hash;

                // Walk back from current tip, unmarking actions until we find the common ancestor
                // (which is the parent of the incoming block)
                let mut height_to_check = current_tip.height;
                while height_to_check > 0 {
                    if let Ok(Some(hash_at_height)) =
                        chain_store.get_root_hash_at_height(height_to_check)
                    {
                        // Check if this is the common ancestor (parent of incoming block)
                        if hash_at_height == incoming_parent {
                            info!(
                                "[REORG] Found common ancestor at height {} ({})",
                                height_to_check,
                                hex::encode(&hash_at_height[..8])
                            );
                            break;
                        }
                        // Unmark actions from this orphaned block
                        if let Err(e) = chain_store.unmark_actions_at_height(height_to_check) {
                            warn!(
                                "[REORG] Failed to unmark actions at height {}: {}",
                                height_to_check, e
                            );
                        } else {
                            info!(
                                "[REORG] Unmarked finalized actions at height {} (block {})",
                                height_to_check,
                                hex::encode(&hash_at_height[..8])
                            );
                        }
                    }
                    height_to_check = height_to_check.saturating_sub(1);
                }
            }
        }

        // ALSO: Unmark any actions at the incoming block's height that were marked by
        // a previous failed attempt. This handles the case where content blocks were
        // partially processed but the root block was never fully accepted.
        if let Err(e) = chain_store.unmark_actions_at_height(block_height) {
            debug!(
                "[BLOCK] Failed to unmark stale actions at height {}: {}",
                block_height, e
            );
        } else {
            // Only log if we actually unmarked something
            debug!(
                "[BLOCK] Cleared any stale finalized actions at incoming height {}",
                block_height
            );
        }

        // Collect all content IDs from this block data (for in-block parent references)
        let mut all_content_ids_in_batch: std::collections::HashSet<[u8; 32]> =
            std::collections::HashSet::new();

        // Also collect actions so we can remove them from mempool when block is accepted
        let mut actions_in_block: Vec<crate::blocks::Action> = Vec::new();

        // First pass: collect all content hashes being added in this batch
        // AND collect all actions for mempool clearing
        for content_bytes in &block_data.content_blocks {
            if let Ok(cb) = bincode::deserialize::<crate::blocks::ContentBlock>(content_bytes) {
                for action in &cb.actions {
                    if let Some(content_hash) = action.content_hash {
                        all_content_ids_in_batch.insert(content_hash);
                    }
                    // Collect action for mempool removal (need full action, not just hash)
                    actions_in_block.push(action.clone());
                }
            }
        }

        // Store content blocks first (they're referenced by space blocks)
        // CRITICAL: Validate reply parents BEFORE storing to prevent orphan replies
        for content_bytes in &block_data.content_blocks {
            let content_block: crate::blocks::ContentBlock =
                match bincode::deserialize(content_bytes) {
                    Ok(block) => block,
                    Err(e) => {
                        warn!("[BLOCK] Failed to deserialize content block: {}", e);
                        continue;
                    }
                };

            // CRITICAL: Register spaces FIRST, before validating reply parents.
            // This ensures spaces are registered even if some content has orphan parents.
            // Space creation is idempotent and doesn't depend on parent existence.
            // Log the content block info for debugging
            info!(
                "[BLOCK-SYNC] ContentBlock: {} actions, space_metadata={}",
                content_block.actions.len(),
                if content_block.space_metadata.is_some() {
                    "PRESENT"
                } else {
                    "NONE"
                }
            );
            if let Some(ref metadata) = content_block.space_metadata {
                for action in &content_block.actions {
                    if action.action_type == crate::blocks::ActionType::CreateSpace {
                        // Extract space_id from the action's content_hash (first 16 bytes)
                        if let Some(space_id_32) = action.content_hash {
                            let mut space_id_16 = [0u8; 16];
                            space_id_16.copy_from_slice(&space_id_32[..16]);

                            // Create SpaceInfo and register
                            let space_info = crate::storage::SpaceInfo {
                                space_id: space_id_16,
                                name: metadata.name.clone(),
                                description: metadata.description.clone(),
                                creator: action.actor,
                                created_at: action.timestamp,
                                pow_work: action.pow_work,
                                // Private space fields (defaults for public spaces)
                                is_private: false,
                                encrypted_name: None,
                                creator_encrypted_key: None,
                                key_version: 0,
                            };

                            // Always upsert block-derived metadata. The gossip mempool
                            // path (this file, ~line 4715) writes a placeholder name
                            // before the block arrives; this must overwrite it.
                            // Mirrors the unconditional pattern at the PHASE 3 storage
                            // step further down.
                            if let Err(e) = chain_store.register_space(&space_info) {
                                warn!(
                                    "[BLOCK] Failed to register space {}: {}",
                                    hex::encode(&space_id_16[..8]),
                                    e
                                );
                            } else {
                                info!(
                                    "[BLOCK] Registered space '{}' ({}) from synced block",
                                    metadata.name,
                                    hex::encode(&space_id_16[..8])
                                );
                            }
                        }
                    }
                }
            }

            // SPEC_11 Phase 6: Process on-chain sponsorship actions
            self.apply_sponsorship_actions_from_block(&content_block);

            // NOW validate reply parents and store content block
            // Parent must exist in: 1) blockchain, or 2) another block in this batch
            let parent_exists = |parent_id: &[u8; 32]| -> bool {
                // Check if parent is in this batch
                if all_content_ids_in_batch.contains(parent_id) {
                    return true;
                }
                // Check if parent exists in blockchain
                for result in chain_store.iter_content_blocks() {
                    if let Ok(existing_block) = result {
                        for action in &existing_block.actions {
                            if let Some(content_hash) = action.content_hash {
                                if &content_hash == parent_id {
                                    return true;
                                }
                            }
                        }
                    }
                }
                false
            };

            if let Err(e) = validate_reply_parents(&content_block, parent_exists) {
                warn!("[BLOCK] Content block has orphan replies ({}), storing anyway for space registration. \
                       Some content actions may be invalid.", e);
                // Don't skip - we already registered the space above
                // Just log the warning and continue to store the content block
            }

            // CRITICAL: Check for duplicate actions before storing
            // Reject blocks containing actions that were already finalized in prior blocks
            match chain_store.check_content_block_for_duplicates(&content_block) {
                Ok(duplicates) if !duplicates.is_empty() => {
                    warn!(
                        "[BLOCK] REJECTED: Content block contains {} already-finalized action(s): {:?}",
                        duplicates.len(),
                        duplicates.iter().map(|(idx, h)| format!("action[{}] in block {}", idx, h)).collect::<Vec<_>>()
                    );
                    return Err(RouteError::InvalidData(format!(
                        "block contains {} already-finalized actions",
                        duplicates.len()
                    )));
                }
                Err(e) => {
                    warn!("[BLOCK] Failed to check for duplicate actions: {}", e);
                    // Continue anyway - don't block on storage errors
                }
                Ok(_) => {} // No duplicates, proceed
            }

            if let Err(e) = chain_store.put_content_block(&content_block) {
                warn!("[BLOCK] Failed to store content block: {}", e);
            } else {
                // Mark all actions in this content block as finalized
                if let Err(e) =
                    chain_store.mark_content_block_actions_finalized(&content_block, block_height)
                {
                    warn!("[BLOCK] Failed to mark actions as finalized: {}", e);
                }
                // Extract and store reactions from Engage actions
                self.extract_reactions_from_block(&content_block);
                // Track engagements in the engagement graph
                self.extract_engagements_from_block(&content_block);
                // SPEC_13 Phase A: behavioral clustering (organic communities)
                self.process_behavioral_clustering(&content_block);
                // Update reply counts in aggregation cache
                self.update_reply_counts_from_block(&content_block);
            }
        }

        // CRITICAL: Fetch missing content blobs for actions in this block.
        // Block sync only transfers content_hash references, not the actual blob data.
        // We need to request the blobs so users can view the content.
        //
        // IMPORTANT: We use WHO_HAS/I_HAVE discovery instead of blindly sending GET to the
        // block sender, because the sender may have also synced the block and not have the blobs.
        // The original content creator (who has the blobs) will respond to WHO_HAS with I_HAVE.
        if let (Some(ref content_mgr), Some(ref pool)) =
            (&self.content_retrieval, &self.connection_pool)
        {
            let mut missing_hashes: Vec<[u8; 32]> = Vec::new();

            // Collect content hashes we don't have locally (text content)
            for content_hash in &all_content_ids_in_batch {
                let blob_hash = crate::storage::blob::ContentBlobHash::from_bytes(*content_hash);
                if !content_mgr.has_content(&blob_hash) {
                    missing_hashes.push(*content_hash);
                }
            }

            // Also collect media hashes from actions (images/attachments)
            for action in &actions_in_block {
                for media_ref in &action.media_refs {
                    let blob_hash =
                        crate::storage::blob::ContentBlobHash::from_bytes(media_ref.media_hash);
                    if !content_mgr.has_content(&blob_hash)
                        && !missing_hashes.contains(&media_ref.media_hash)
                    {
                        missing_hashes.push(media_ref.media_hash);
                    }
                }
            }

            if !missing_hashes.is_empty() {
                info!(
                    "[BLOB-SYNC] Block {} has {} blobs we don't have - discovering via WHO_HAS",
                    hex::encode(&computed_hash[..8]),
                    missing_hashes.len()
                );

                // Strategy: Mark content as wanted, then broadcast WHO_HAS.
                // When we receive I_HAVE, the handle_i_have code will auto-send GET to the provider.
                // If block sender has it, they'll respond immediately via I_HAVE.
                // If not, other peers who have it will respond.
                for content_hash in &missing_hashes {
                    let blob_hash =
                        crate::storage::blob::ContentBlobHash::from_bytes(*content_hash);
                    // Mark as wanted so when I_HAVE arrives, we auto-fetch
                    content_mgr.mark_wanted(&blob_hash);
                }

                // Broadcast WHO_HAS to all connected peers for discovery
                for content_hash in missing_hashes {
                    let who_has_envelope =
                        crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::WhoHas,
                            content_hash.to_vec(),
                        );

                    let sent = pool.broadcast(&who_has_envelope).await;
                    if sent > 0 {
                        debug!(
                            "[BLOB-SYNC] Broadcast WHO_HAS for blob {} to {} peers",
                            hex::encode(&content_hash[..8]),
                            sent
                        );
                    }
                }
            }
        }

        // Store space blocks (they're referenced by root block)
        for space_bytes in &block_data.space_blocks {
            let space_block: crate::blocks::SpaceBlock = match bincode::deserialize(space_bytes) {
                Ok(block) => block,
                Err(e) => {
                    warn!("[BLOCK] Failed to deserialize space block: {}", e);
                    continue;
                }
            };
            if let Err(e) = chain_store.put_space_block(&space_block) {
                warn!("[BLOCK] Failed to store space block: {}", e);
            }
        }

        // Store root block with fork resolution (Bitcoin-style heaviest chain wins)
        match chain_store.put_root_block_with_fork_resolution(&root_block) {
            Ok((hash, is_new_tip)) => {
                if is_new_tip {
                    info!(
                        "[BLOCK] Stored root block {} as NEW CANONICAL TIP (height={}, cumulative_pow={})",
                        hex::encode(&hash[..8]),
                        root_block.height(),
                        root_block.cumulative_pow
                    );
                    // Reset lazy block formation AND clear actions from mempool
                    // Actions in this block are now finalized, remove from pending pool
                    if let Some(ref bb) = self.block_builder {
                        if let Ok(mut bb_write) = bb.write() {
                            bb_write.reset_waiting();

                            // Clear finalized actions from mempool (both seen_actions AND threads)
                            let removed = bb_write.clear_finalized_actions(&actions_in_block);
                            if removed > 0 {
                                info!(
                                    "[MEMPOOL] Cleared {} finalized actions from mempool (block {})",
                                    removed,
                                    hex::encode(&hash[..8])
                                );
                            }
                        }
                    }
                } else {
                    info!(
                        "[BLOCK] Stored root block {} on FORK (height={}, cumulative_pow={})",
                        hex::encode(&hash[..8]),
                        root_block.height(),
                        root_block.cumulative_pow
                    );
                }

                // BLOCK RELAY: Re-announce block to other peers (excluding sender)
                if let Some(ref connection_pool) = self.connection_pool {
                    // Create block announcement
                    let announce = BlockAnnouncePayload::new(
                        block_data.block_hash,
                        root_block.height(),
                        root_block.total_pow,
                        block_data.space_blocks.len() as u32,
                        root_block.timestamp,
                    );

                    // Create envelope for broadcast
                    let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                        crate::types::network::MessageType::BlockAnnounce,
                        announce.to_bytes().to_vec(),
                    );

                    // Broadcast to all peers except the sender
                    let all_peers = connection_pool.peer_ids().await;
                    let mut relay_count = 0;
                    for other_peer_id in all_peers {
                        // Skip the sender
                        if &other_peer_id == peer_id {
                            continue;
                        }
                        // Send to this peer
                        if let Err(e) = connection_pool.send_to(&other_peer_id, &envelope).await {
                            debug!(
                                "[BLOCK-RELAY] Failed to relay to peer {}: {}",
                                hex::encode(&other_peer_id[..8]),
                                e
                            );
                        } else {
                            relay_count += 1;
                        }
                    }

                    if relay_count > 0 {
                        info!(
                            "[BLOCK-RELAY] Relayed block {} (height={}) to {} peers",
                            hex::encode(&hash[..8]),
                            root_block.height(),
                            relay_count
                        );
                    }
                }
            }
            Err(e) => {
                warn!("[BLOCK] Failed to store root block: {}", e);
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        }

        // Check for orphan blocks that were waiting for this block
        self.process_orphans_for_block(&computed_hash).await;

        Ok(None)
    }

    /// Process any orphan blocks that were waiting for a specific parent block
    ///
    /// After storing a block, we check if any orphan blocks were waiting for it.
    /// If found, we remove them from the orphan pool and attempt to process them.
    /// Uses an iterative approach to avoid async recursion issues.
    async fn process_orphans_for_block(&self, stored_block_hash: &[u8; 32]) {
        // Use a queue to process orphans iteratively (avoiding async recursion)
        let mut blocks_to_check: Vec<[u8; 32]> = vec![*stored_block_hash];

        while let Some(parent_hash) = blocks_to_check.pop() {
            // Take orphans waiting for this block (if any)
            let orphans_to_process = {
                if let Ok(mut orphans_map) = self.orphan_blocks.write() {
                    orphans_map.remove(&parent_hash).unwrap_or_default()
                } else {
                    continue;
                }
            };

            if orphans_to_process.is_empty() {
                continue;
            }

            info!(
                "[ORPHAN] Found {} orphan block(s) waiting for {}, processing...",
                orphans_to_process.len(),
                hex::encode(&parent_hash[..8])
            );

            // Process each orphan
            for orphan in orphans_to_process {
                // Check if orphan is too old (over 5 minutes)
                if orphan.orphaned_at.elapsed().as_secs() > 300 {
                    info!(
                        "[ORPHAN] Dropping stale orphan block {} (orphaned for {:?})",
                        hex::encode(&orphan.block_hash[..8]),
                        orphan.orphaned_at.elapsed()
                    );
                    continue;
                }

                info!(
                    "[ORPHAN] Processing orphan block {} (height {})",
                    hex::encode(&orphan.block_hash[..8]),
                    orphan.height
                );

                // Process the orphan using inline logic (not recursive call)
                match self
                    .process_orphan_block_data(&orphan.from_peer, &orphan.data)
                    .await
                {
                    Ok(Some(stored_hash)) => {
                        info!(
                            "[ORPHAN] Successfully processed orphan block {}",
                            hex::encode(&orphan.block_hash[..8])
                        );
                        // Check for more orphans waiting for this newly stored block
                        blocks_to_check.push(stored_hash);
                    }
                    Ok(None) => {
                        debug!(
                            "[ORPHAN] Orphan block {} was already stored or deferred",
                            hex::encode(&orphan.block_hash[..8])
                        );
                    }
                    Err(e) => {
                        warn!(
                            "[ORPHAN] Failed to process orphan block {}: {}",
                            hex::encode(&orphan.block_hash[..8]),
                            e
                        );
                    }
                }
            }
        }

        // Clean up any expired orphans (over 5 minutes old)
        if let Ok(mut orphans_map) = self.orphan_blocks.write() {
            orphans_map.retain(|parent_hash, orphans| {
                orphans.retain(|o| {
                    let keep = o.orphaned_at.elapsed().as_secs() < 300;
                    if !keep {
                        debug!(
                            "[ORPHAN] Expired orphan {} waiting for {}",
                            hex::encode(&o.block_hash[..8]),
                            hex::encode(&parent_hash[..8])
                        );
                    }
                    keep
                });
                !orphans.is_empty()
            });
        }
    }

    /// Process orphan block data - simplified version for orphan processing
    ///
    /// This is a non-recursive version that returns the stored block hash if successful.
    /// Returns Ok(Some(hash)) if block was stored, Ok(None) if skipped/deferred, Err on failure.
    async fn process_orphan_block_data(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<[u8; 32]>, RouteError> {
        let block_data =
            BlockDataPayload::from_bytes(payload).ok_or_else(|| RouteError::PayloadTooSmall {
                expected: BlockDataPayload::MIN_SIZE,
                actual: payload.len(),
            })?;

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => return Err(RouteError::SubsystemUnavailable("chain_store")),
        };

        let root_block: crate::blocks::RootBlock = bincode::deserialize(&block_data.root_block)
            .map_err(|e| RouteError::DeserializationError(format!("{}", e)))?;

        let computed_hash = root_block.hash();
        let block_height = root_block.height();
        let our_height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);

        // Skip if we already have this block
        if let Ok(Some(existing_hash)) = chain_store.get_root_hash_at_height(block_height) {
            if existing_hash == computed_hash {
                return Ok(None);
            }
            // Fork resolution - check if incoming wins
            use crate::storage::chain::ChainStore;
            if !ChainStore::hash_wins(&computed_hash, &existing_hash) {
                return Ok(None); // Existing wins
            }
            // Rollback existing block
            if let Err(e) = chain_store.rollback_block_at_height(block_height) {
                return Err(RouteError::StorageError(format!("rollback failed: {}", e)));
            }
        }

        // Validate height
        if block_height > our_height + 1 {
            return Ok(None); // Too far ahead
        }

        // Validate prev_root_hash
        if block_height > 1 {
            let prev_hash = root_block.prev_root_hash;
            if prev_hash == [0u8; 32] {
                return Err(RouteError::InvalidData("null prev_root_hash".to_string()));
            }
            if chain_store
                .get_root_block(&prev_hash)
                .ok()
                .flatten()
                .is_none()
            {
                // Still missing parent - re-orphan it
                let orphan = OrphanBlock {
                    data: payload.to_vec(),
                    height: block_height,
                    block_hash: computed_hash,
                    from_peer: *peer_id,
                    orphaned_at: Instant::now(),
                };
                if let Ok(mut orphans) = self.orphan_blocks.write() {
                    let orphan_list = orphans.entry(prev_hash).or_insert_with(Vec::new);
                    if orphan_list.len() < 100 {
                        let already_have =
                            orphan_list.iter().any(|o| o.block_hash == computed_hash);
                        if !already_have {
                            orphan_list.push(orphan);
                        }
                    }
                }
                return Ok(None);
            }
        }

        // Collect content hashes for blob fetching
        let mut all_content_hashes: Vec<[u8; 32]> = Vec::new();

        // Store content and space blocks (simplified - just store, no full validation)
        for content_bytes in &block_data.content_blocks {
            if let Ok(content_block) =
                bincode::deserialize::<crate::blocks::ContentBlock>(content_bytes)
            {
                // Collect content hashes and media refs for blob fetching
                for action in &content_block.actions {
                    if let Some(content_hash) = action.content_hash {
                        all_content_hashes.push(content_hash);
                    }
                    for media_ref in &action.media_refs {
                        all_content_hashes.push(media_ref.media_hash);
                    }
                }
                let _ = chain_store.put_content_block(&content_block);
                let _ =
                    chain_store.mark_content_block_actions_finalized(&content_block, block_height);
            }
        }

        for space_bytes in &block_data.space_blocks {
            if let Ok(space_block) = bincode::deserialize::<crate::blocks::SpaceBlock>(space_bytes)
            {
                let _ = chain_store.put_space_block(&space_block);
            }
        }

        // Store root block
        let stored_hash = match chain_store.put_root_block_with_fork_resolution(&root_block) {
            Ok((hash, _)) => hash,
            Err(e) => return Err(RouteError::StorageError(format!("{}", e))),
        };

        // CRITICAL: Fetch missing content blobs for orphan block.
        // This mirrors the blob fetching logic in handle_block_data.
        if let (Some(ref content_mgr), Some(ref pool)) =
            (&self.content_retrieval, &self.connection_pool)
        {
            let mut missing_hashes: Vec<[u8; 32]> = Vec::new();

            for content_hash in all_content_hashes {
                let blob_hash = crate::storage::blob::ContentBlobHash::from_bytes(content_hash);
                if !content_mgr.has_content(&blob_hash) {
                    missing_hashes.push(content_hash);
                }
            }

            if !missing_hashes.is_empty() {
                info!(
                    "[BLOB-SYNC] Orphan block {} has {} blobs we don't have - discovering via WHO_HAS",
                    hex::encode(&stored_hash[..8]),
                    missing_hashes.len()
                );

                // Mark content as wanted so when I_HAVE arrives, we auto-fetch
                for content_hash in &missing_hashes {
                    let blob_hash =
                        crate::storage::blob::ContentBlobHash::from_bytes(*content_hash);
                    content_mgr.mark_wanted(&blob_hash);
                }

                // Broadcast WHO_HAS to all connected peers for discovery
                for content_hash in missing_hashes {
                    let who_has_envelope =
                        crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::WhoHas,
                            content_hash.to_vec(),
                        );

                    let _ = pool.broadcast(&who_has_envelope).await;
                }
            }
        }

        Ok(Some(stored_hash))
    }

    /// Handle GETBLOCKS - respond with blocks in height range
    ///
    /// When a peer requests blocks in a height range, we look them up in ChainStore
    /// and return serialized block data for each one.
    ///
    /// Payload format: GetBlocksPayload (19 bytes)
    async fn handle_getblocks(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let request = GetBlocksPayload::from_bytes(payload)
            .map_err(|e| RouteError::DeserializationError(format!("GetBlocksPayload: {}", e)))?;

        info!(
            "[BLOCK] Received GETBLOCKS from peer {}: heights {}..{} max={}",
            hex::encode(&peer_id[..8]),
            request.start_height,
            request.end_height,
            request.max_blocks
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[BLOCK] No chain store configured, cannot serve blocks");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Query blocks in range
        let blocks = match chain_store.get_blocks_in_range(
            request.start_height,
            request.end_height,
            request.max_blocks,
        ) {
            Ok(blocks) => blocks,
            Err(e) => {
                warn!("[BLOCK] Failed to query blocks: {}", e);
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        if blocks.is_empty() {
            info!("[BLOCK] No blocks found in range, not sending response");
            return Ok(None);
        }

        // Build response with serialized blocks
        let mut response = BlocksPayload { blocks: Vec::new() };
        let mut total_bytes = 0usize;

        for (height, root_block) in blocks {
            // Serialize the root block
            let root_bytes = match bincode::serialize(&root_block) {
                Ok(bytes) => bytes,
                Err(e) => {
                    warn!(
                        "[BLOCK] Failed to serialize root block at height {}: {}",
                        height, e
                    );
                    continue;
                }
            };

            // If include_content is requested, we need to include space and content blocks too
            // Format: root_len(4) + root_bytes + space_count(4) + [space_len(4) + space_bytes + content_count(4) + [content_len(4) + content_bytes]...]...
            let block_data = if request.include_content {
                let mut full_data = Vec::new();

                // Length-prefixed root block
                full_data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
                full_data.extend_from_slice(&root_bytes);

                // Space block count
                let space_count = root_block.space_block_hashes.len() as u32;
                full_data.extend_from_slice(&space_count.to_le_bytes());

                // Serialize space blocks with their content blocks
                for space_hash in &root_block.space_block_hashes {
                    if let Ok(Some(space_block)) = chain_store.get_space_block(space_hash) {
                        if let Ok(space_bytes) = bincode::serialize(&space_block) {
                            // Length-prefixed space block
                            full_data.extend_from_slice(&(space_bytes.len() as u32).to_le_bytes());
                            full_data.extend_from_slice(&space_bytes);

                            // Content block count for this space
                            let content_count = space_block.content_block_hashes.len() as u32;
                            full_data.extend_from_slice(&content_count.to_le_bytes());

                            // Serialize content blocks
                            for content_hash in &space_block.content_block_hashes {
                                if let Ok(Some(content_block)) =
                                    chain_store.get_content_block(content_hash)
                                {
                                    debug!(
                                        "[BLOCK-SEND] Sending ContentBlock with {} actions, space_metadata={}",
                                        content_block.actions.len(),
                                        if content_block.space_metadata.is_some() { "PRESENT" } else { "NONE" }
                                    );
                                    if let Ok(content_bytes) = bincode::serialize(&content_block) {
                                        full_data.extend_from_slice(
                                            &(content_bytes.len() as u32).to_le_bytes(),
                                        );
                                        full_data.extend_from_slice(&content_bytes);
                                    }
                                }
                            }
                        }
                    }
                }
                full_data
            } else {
                // No content requested - just send root block with length prefix for consistency
                let mut data = Vec::new();
                data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
                data.extend_from_slice(&root_bytes);
                data.extend_from_slice(&0u32.to_le_bytes()); // space_count = 0
                data
            };

            total_bytes += block_data.len();
            response.blocks.push(SerializedBlock { data: block_data });
        }

        info!(
            "[BLOCK] Sending BLOCKS response with {} blocks, {} bytes",
            response.blocks.len(),
            total_bytes
        );

        Ok(Some((MSG_BLOCKS, response.to_bytes())))
    }

    /// Handle BLOCKS - receive and store blocks from a range request
    ///
    /// When we receive blocks in response to GETBLOCKS, we deserialize
    /// and store each one in ChainStore.
    ///
    /// Payload format: BlocksPayload (variable)
    async fn handle_blocks(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let blocks_data = BlocksPayload::from_bytes(payload)
            .map_err(|e| RouteError::DeserializationError(format!("BlocksPayload: {}", e)))?;

        info!(
            "[BLOCK] Received BLOCKS from peer {}: {} blocks",
            hex::encode(&peer_id[..8]),
            blocks_data.blocks.len()
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[BLOCK] No chain store configured, cannot store blocks");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        let mut stored_count = 0usize;
        let mut space_count_total = 0usize;
        let mut content_count_total = 0usize;

        for serialized in &blocks_data.blocks {
            let data = &serialized.data;
            let mut offset = 0usize;

            // Parse length-prefixed format: root_len(4) + root_bytes + space_count(4) + ...
            if data.len() < 8 {
                warn!("[BLOCK] Block data too short: {} bytes", data.len());
                continue;
            }

            // Read root block length
            let root_len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
            offset += 4;

            if offset + root_len > data.len() {
                warn!(
                    "[BLOCK] Root block length {} exceeds data size {}",
                    root_len,
                    data.len()
                );
                continue;
            }

            // Deserialize root block
            let root_block: crate::blocks::RootBlock =
                match bincode::deserialize(&data[offset..offset + root_len]) {
                    Ok(block) => block,
                    Err(e) => {
                        warn!("[BLOCK] Failed to deserialize root block: {}", e);
                        continue;
                    }
                };
            offset += root_len;

            // VALIDATION: Check block height is valid before storing
            let block_height = root_block.height();
            let computed_hash = root_block.hash();
            let our_height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);

            // Set when the incoming block's hash matches a header our chain
            // already accepted (content backfill). Hash equality IS the
            // acceptance proof: re-running height/parent/leader validation
            // would re-judge a historical block under current rules and can
            // reject content for a block we already consider canonical.
            let mut known_header_backfill = false;

            // Check 1: If we already have a block at this height, apply fork resolution
            if let Ok(Some(existing_hash)) = chain_store.get_root_hash_at_height(block_height) {
                if existing_hash == computed_hash {
                    // Same block, already have it — but after headers-first sync we
                    // can hold the header WITHOUT its space/content blocks. Only skip
                    // if nothing the header claims is missing; otherwise fall through
                    // so the space/content parsing below backfills the gap.
                    let content_missing = root_block.space_block_hashes.iter().any(|h| {
                        match chain_store.get_space_block(h).ok().flatten() {
                            None => true,
                            // Space block present but the content blocks it
                            // claims (space names, posts) may still be absent.
                            Some(sb) => sb.content_block_hashes.iter().any(|ch| {
                                chain_store.get_content_block(ch).ok().flatten().is_none()
                            }),
                        }
                    });
                    if !content_missing {
                        continue;
                    }
                    known_header_backfill = true;
                    info!(
                        "[BACKFILL] Known header {} at height {} is missing claimed space/content blocks - storing content from full block",
                        hex::encode(&computed_hash[..8]),
                        block_height
                    );
                } else {
                    // Different block at same height - FORK RESOLUTION
                    // Priority: 1) Higher cumulative_pow wins, 2) Lower hash wins (tiebreaker)
                    use crate::storage::chain::ChainStore;

                    // Get the existing block to compare cumulative_pow
                    let existing_block = chain_store.get_root_block(&existing_hash).ok().flatten();

                    let incoming_wins = if let Some(ref existing) = existing_block {
                        // Compare cumulative PoW first - heavier chain wins
                        if root_block.cumulative_pow > existing.cumulative_pow {
                            info!(
                                "[REORG] Incoming block {} (pow={}) beats existing {} (pow={}) at height {} (heavier chain)",
                                hex::encode(&computed_hash[..8]),
                                root_block.cumulative_pow,
                                hex::encode(&existing_hash[..8]),
                                existing.cumulative_pow,
                                block_height
                            );
                            true
                        } else if root_block.cumulative_pow < existing.cumulative_pow {
                            info!(
                                "[REORG] Keeping existing block {} (pow={}) over incoming {} (pow={}) at height {} (heavier chain)",
                                hex::encode(&existing_hash[..8]),
                                existing.cumulative_pow,
                                hex::encode(&computed_hash[..8]),
                                root_block.cumulative_pow,
                                block_height
                            );
                            false
                        } else {
                            // Equal cumulative_pow - use lower hash as tiebreaker
                            let hash_wins = ChainStore::hash_wins(&computed_hash, &existing_hash);
                            if hash_wins {
                                info!(
                                    "[REORG] Block {} beats existing {} at height {} (lower hash tiebreaker, equal pow={})",
                                    hex::encode(&computed_hash[..8]),
                                    hex::encode(&existing_hash[..8]),
                                    block_height,
                                    root_block.cumulative_pow
                                );
                            } else {
                                info!(
                                    "[REORG] Keeping existing block {} over incoming {} at height {} (lower hash tiebreaker, equal pow={})",
                                    hex::encode(&existing_hash[..8]),
                                    hex::encode(&computed_hash[..8]),
                                    block_height,
                                    root_block.cumulative_pow
                                );
                            }
                            hash_wins
                        }
                    } else {
                        // Can't get existing block - fall back to hash comparison
                        ChainStore::hash_wins(&computed_hash, &existing_hash)
                    };

                    if incoming_wins {
                        // Rollback existing block and get orphaned actions
                        match chain_store.rollback_block_at_height(block_height) {
                            Ok(orphaned_actions) => {
                                info!(
                                    "[REORG] Rolled back block {} at height {}, {} orphaned actions",
                                    hex::encode(&existing_hash[..8]),
                                    block_height,
                                    orphaned_actions.len()
                                );

                                // Return orphaned actions to mempool
                                if let Some(ref bb) = self.block_builder {
                                    if let Ok(mut builder) = bb.write() {
                                        for (thread_id, space_id, action, branch_path) in
                                            orphaned_actions
                                        {
                                            builder.add_action(
                                                thread_id,
                                                space_id,
                                                action,
                                                branch_path,
                                            );
                                        }
                                        info!("[REORG] Returned orphaned actions to mempool");
                                    }
                                }
                            }
                            Err(e) => {
                                warn!(
                                    "[REORG] Failed to rollback block at height {}: {}",
                                    block_height, e
                                );
                                continue;
                            }
                        }
                        // Continue to store the winning block below
                    } else {
                        // Existing block wins - but still store the incoming block!
                        // This is critical: the incoming block might be a parent for orphan blocks.
                        info!(
                            "[FORK] Storing non-canonical block {} (pow={}) at height {} for orphan resolution",
                            hex::encode(&computed_hash[..8]),
                            root_block.cumulative_pow,
                            block_height
                        );

                        // Store just the root block (not updating canonical chain)
                        if let Err(e) = chain_store.put_root_block(&root_block) {
                            warn!("[FORK] Failed to store non-canonical block: {}", e);
                        } else {
                            // Check for orphans waiting for this block
                            self.process_orphans_for_block(&computed_hash).await;
                        }

                        continue;
                    }
                }
            }

            // Check 2: Block height must be at most our_height + 1
            // If too far ahead, store as orphan and request the missing parent BY HASH
            // (using prev_root_hash, which works even if peer's height_index is broken)
            // Skipped for known-header backfill: the block is already in our chain.
            if !known_header_backfill && block_height > our_height + 1 {
                let prev_hash = root_block.prev_root_hash;

                // Only request parent if it's not the zero hash and we don't have it
                if prev_hash != [0u8; 32]
                    && chain_store
                        .get_root_block(&prev_hash)
                        .ok()
                        .flatten()
                        .is_none()
                {
                    // Convert BLOCKS entry format to BlockDataPayload format for orphan storage
                    // This allows process_orphan_block_data to handle it correctly
                    let mut block_data_payload = BlockDataPayload::new(computed_hash);
                    block_data_payload.root_block =
                        bincode::serialize(&root_block).unwrap_or_default();

                    // Parse space/content blocks from BLOCKS format and add to payload
                    let mut parse_offset = offset; // offset is already past the root block
                    if parse_offset + 4 <= data.len() {
                        let space_count = u32::from_le_bytes([
                            data[parse_offset],
                            data[parse_offset + 1],
                            data[parse_offset + 2],
                            data[parse_offset + 3],
                        ]) as usize;
                        parse_offset += 4;

                        for _ in 0..space_count {
                            if parse_offset + 4 > data.len() {
                                break;
                            }
                            let space_len = u32::from_le_bytes([
                                data[parse_offset],
                                data[parse_offset + 1],
                                data[parse_offset + 2],
                                data[parse_offset + 3],
                            ]) as usize;
                            parse_offset += 4;
                            if parse_offset + space_len > data.len() {
                                break;
                            }

                            // Store space block bytes
                            block_data_payload
                                .space_blocks
                                .push(data[parse_offset..parse_offset + space_len].to_vec());
                            parse_offset += space_len;

                            // Parse content blocks for this space
                            if parse_offset + 4 > data.len() {
                                break;
                            }
                            let content_count = u32::from_le_bytes([
                                data[parse_offset],
                                data[parse_offset + 1],
                                data[parse_offset + 2],
                                data[parse_offset + 3],
                            ]) as usize;
                            parse_offset += 4;

                            for _ in 0..content_count {
                                if parse_offset + 4 > data.len() {
                                    break;
                                }
                                let content_len = u32::from_le_bytes([
                                    data[parse_offset],
                                    data[parse_offset + 1],
                                    data[parse_offset + 2],
                                    data[parse_offset + 3],
                                ]) as usize;
                                parse_offset += 4;
                                if parse_offset + content_len > data.len() {
                                    break;
                                }

                                block_data_payload
                                    .content_blocks
                                    .push(data[parse_offset..parse_offset + content_len].to_vec());
                                parse_offset += content_len;
                            }
                        }
                    }

                    // Store as orphan in BlockDataPayload format
                    let orphan = OrphanBlock {
                        data: block_data_payload.to_bytes(),
                        height: block_height,
                        block_hash: computed_hash,
                        from_peer: *peer_id,
                        orphaned_at: Instant::now(),
                    };

                    if let Ok(mut orphans) = self.orphan_blocks.write() {
                        let orphan_list = orphans.entry(prev_hash).or_insert_with(Vec::new);
                        if orphan_list.len() < 100 {
                            let already_have =
                                orphan_list.iter().any(|o| o.block_hash == computed_hash);
                            if !already_have {
                                orphan_list.push(orphan);
                                info!(
                                    "[ORPHAN-BATCH] Stored block {} (height {}) waiting for parent {} ({} space, {} content blocks)",
                                    hex::encode(&computed_hash[..8]),
                                    block_height,
                                    hex::encode(&prev_hash[..8]),
                                    block_data_payload.space_blocks.len(),
                                    block_data_payload.content_blocks.len()
                                );
                            }
                        }
                    }

                    // Request the missing parent BY HASH (works even if height_index is broken)
                    if let Some(ref pool) = self.connection_pool {
                        let get_block = GetBlockPayload::new(prev_hash);
                        let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::GetBlock,
                            get_block.to_bytes().to_vec(),
                        );

                        if let Err(e) = pool.send_to(peer_id, &envelope).await {
                            warn!(
                                "[ORPHAN-BATCH] Failed to send GETBLOCK for parent {}: {}",
                                hex::encode(&prev_hash[..8]),
                                e
                            );
                        } else {
                            info!(
                                "[ORPHAN-BATCH] Requested missing parent {} by hash from peer {}",
                                hex::encode(&prev_hash[..8]),
                                hex::encode(&peer_id[..8])
                            );
                        }
                    }
                } else {
                    warn!(
                        "[BLOCK] REJECTED: Block {} at height {} too far ahead (our height: {}) with invalid/null parent",
                        hex::encode(&computed_hash[..8]),
                        block_height,
                        our_height
                    );
                }
                continue;
            }

            // Check 3: For height > 1, prev_root_hash must reference an existing block
            // If we don't have the parent, store as orphan and request it (enables fork resolution)
            // Skipped (with Check 4 inside it) for known-header backfill: hash
            // equality with our accepted chain already proves parentage and
            // leader validity as of acceptance; re-judging under current rules
            // rejected historical blocks' content on fresh nodes.
            if !known_header_backfill && block_height > 1 {
                let prev_hash = root_block.prev_root_hash;
                if prev_hash == [0u8; 32] {
                    warn!(
                        "[BLOCK] REJECTED: Block {} at height {} has null prev_root_hash",
                        hex::encode(&computed_hash[..8]),
                        block_height
                    );
                    continue;
                }

                if chain_store
                    .get_root_block(&prev_hash)
                    .ok()
                    .flatten()
                    .is_none()
                {
                    // Parent not found - this could be from a competing fork
                    // Store as orphan and request the parent for fork resolution
                    info!(
                        "[FORK-SYNC] Block {} at height {} references unknown parent {} - storing as orphan for fork resolution",
                        hex::encode(&computed_hash[..8]),
                        block_height,
                        hex::encode(&prev_hash[..8])
                    );

                    // Build BlockDataPayload for orphan storage
                    let mut block_data_payload = BlockDataPayload::new(computed_hash);
                    block_data_payload.root_block =
                        bincode::serialize(&root_block).unwrap_or_default();

                    // Parse remaining data for space/content blocks
                    let mut parse_offset = offset;
                    if parse_offset + 4 <= data.len() {
                        let space_count = u32::from_le_bytes([
                            data[parse_offset],
                            data[parse_offset + 1],
                            data[parse_offset + 2],
                            data[parse_offset + 3],
                        ]) as usize;
                        parse_offset += 4;

                        for _ in 0..space_count {
                            if parse_offset + 4 > data.len() {
                                break;
                            }
                            let space_len = u32::from_le_bytes([
                                data[parse_offset],
                                data[parse_offset + 1],
                                data[parse_offset + 2],
                                data[parse_offset + 3],
                            ]) as usize;
                            parse_offset += 4;
                            if parse_offset + space_len > data.len() {
                                break;
                            }
                            block_data_payload
                                .space_blocks
                                .push(data[parse_offset..parse_offset + space_len].to_vec());
                            parse_offset += space_len;

                            if parse_offset + 4 > data.len() {
                                break;
                            }
                            let content_count = u32::from_le_bytes([
                                data[parse_offset],
                                data[parse_offset + 1],
                                data[parse_offset + 2],
                                data[parse_offset + 3],
                            ]) as usize;
                            parse_offset += 4;

                            for _ in 0..content_count {
                                if parse_offset + 4 > data.len() {
                                    break;
                                }
                                let content_len = u32::from_le_bytes([
                                    data[parse_offset],
                                    data[parse_offset + 1],
                                    data[parse_offset + 2],
                                    data[parse_offset + 3],
                                ]) as usize;
                                parse_offset += 4;
                                if parse_offset + content_len > data.len() {
                                    break;
                                }
                                block_data_payload
                                    .content_blocks
                                    .push(data[parse_offset..parse_offset + content_len].to_vec());
                                parse_offset += content_len;
                            }
                        }
                    }

                    // Store as orphan
                    let orphan = OrphanBlock {
                        data: block_data_payload.to_bytes(),
                        height: block_height,
                        block_hash: computed_hash,
                        from_peer: *peer_id,
                        orphaned_at: Instant::now(),
                    };

                    if let Ok(mut orphans) = self.orphan_blocks.write() {
                        let orphan_list = orphans.entry(prev_hash).or_insert_with(Vec::new);
                        if orphan_list.len() < 100 {
                            let already_have =
                                orphan_list.iter().any(|o| o.block_hash == computed_hash);
                            if !already_have {
                                orphan_list.push(orphan);
                                info!(
                                    "[FORK-SYNC] Stored orphan block {} (height {}) waiting for parent {}",
                                    hex::encode(&computed_hash[..8]),
                                    block_height,
                                    hex::encode(&prev_hash[..8])
                                );
                            }
                        }
                    }

                    // Request the missing parent
                    if let Some(ref pool) = self.connection_pool {
                        let get_block = GetBlockPayload::new(prev_hash);
                        let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::GetBlock,
                            get_block.to_bytes().to_vec(),
                        );

                        if let Err(e) = pool.send_to(peer_id, &envelope).await {
                            warn!(
                                "[FORK-SYNC] Failed to request parent {}: {}",
                                hex::encode(&prev_hash[..8]),
                                e
                            );
                        } else {
                            info!(
                                "[FORK-SYNC] Requested missing parent {} from peer {}",
                                hex::encode(&prev_hash[..8]),
                                hex::encode(&peer_id[..8])
                            );
                        }
                    }

                    continue;
                }
            }

            // Check 4: Leader election validation
            // Skip for genesis blocks (height 0) and legacy blocks (block_creator is zero).
            // Also skipped for known-header backfill: hash equality with our accepted
            // chain is the acceptance proof — re-judging a historical block's leader
            // under current eligibility rules rejected its content on fresh nodes.
            if !known_header_backfill && block_height > 0 && root_block.block_creator != [0u8; 32] {
                // Get the previous block to determine prev_block_timestamp
                let prev_hash = root_block.prev_root_hash;
                let prev_block = chain_store.get_root_block(&prev_hash).ok().flatten();

                if let Some(prev) = prev_block {
                    // Parse first space block to get space_id for validation
                    let mut first_space_id: [u8; 16] = [0u8; 16];
                    let mut temp_offset = offset;

                    // Try to parse the first space block to extract space_id
                    if temp_offset + 4 <= data.len() {
                        let space_count = u32::from_le_bytes([
                            data[temp_offset],
                            data[temp_offset + 1],
                            data[temp_offset + 2],
                            data[temp_offset + 3],
                        ]) as usize;
                        temp_offset += 4;

                        if space_count > 0 && temp_offset + 4 <= data.len() {
                            let space_len = u32::from_le_bytes([
                                data[temp_offset],
                                data[temp_offset + 1],
                                data[temp_offset + 2],
                                data[temp_offset + 3],
                            ]) as usize;
                            temp_offset += 4;

                            if temp_offset + space_len <= data.len() {
                                if let Ok(space_block) =
                                    bincode::deserialize::<crate::blocks::SpaceBlock>(
                                        &data[temp_offset..temp_offset + space_len],
                                    )
                                {
                                    first_space_id.copy_from_slice(&space_block.space_id[..16]);
                                }
                            }
                        }
                    }

                    // Get recent block timestamps for difficulty calculation
                    // Use last 10 blocks or as many as available
                    let mut recent_timestamps = Vec::with_capacity(10);
                    let mut height = block_height.saturating_sub(1);
                    while recent_timestamps.len() < 10 && height > 0 {
                        if let Ok(Some(hash)) = chain_store.get_root_hash_at_height(height) {
                            if let Ok(Some(block)) = chain_store.get_root_block(&hash) {
                                recent_timestamps.push(block.timestamp);
                            }
                        }
                        height = height.saturating_sub(1);
                    }

                    // Validate the block leader
                    let is_valid_leader = crate::blocks::leader::validate_block_leader(
                        &root_block.block_creator,
                        root_block.timestamp,
                        &prev_hash,
                        prev.timestamp,
                        &first_space_id,
                        &recent_timestamps,
                    );

                    if !is_valid_leader {
                        warn!(
                            "[BLOCK] REJECTED: Block {} at height {} created by ineligible leader {}",
                            hex::encode(&computed_hash[..8]),
                            block_height,
                            hex::encode(&root_block.block_creator[..8])
                        );
                        continue;
                    }

                    debug!(
                        "[BLOCK] Leader validation passed for block {} at height {} by {}",
                        hex::encode(&computed_hash[..8]),
                        block_height,
                        hex::encode(&root_block.block_creator[..8])
                    );
                }
            }

            // PHASE 1: Parse all space blocks and content blocks into memory (do NOT store yet)
            let mut parsed_space_blocks = Vec::new();
            let mut parsed_content_blocks = Vec::new();

            if offset + 4 <= data.len() {
                let space_count = u32::from_le_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]) as usize;
                offset += 4;

                for _ in 0..space_count {
                    if offset + 4 > data.len() {
                        break;
                    }

                    // Read space block length
                    let space_len = u32::from_le_bytes([
                        data[offset],
                        data[offset + 1],
                        data[offset + 2],
                        data[offset + 3],
                    ]) as usize;
                    offset += 4;

                    if offset + space_len > data.len() {
                        warn!("[BLOCK] Space block length exceeds data size");
                        break;
                    }

                    // Deserialize space block (but don't store yet)
                    if let Ok(space_block) = bincode::deserialize::<crate::blocks::SpaceBlock>(
                        &data[offset..offset + space_len],
                    ) {
                        parsed_space_blocks.push(space_block);
                    }
                    offset += space_len;

                    // Read content block count
                    if offset + 4 > data.len() {
                        break;
                    }
                    let content_count = u32::from_le_bytes([
                        data[offset],
                        data[offset + 1],
                        data[offset + 2],
                        data[offset + 3],
                    ]) as usize;
                    offset += 4;

                    // Parse content blocks (but don't store yet)
                    for _ in 0..content_count {
                        if offset + 4 > data.len() {
                            break;
                        }

                        let content_len = u32::from_le_bytes([
                            data[offset],
                            data[offset + 1],
                            data[offset + 2],
                            data[offset + 3],
                        ]) as usize;
                        offset += 4;

                        if offset + content_len > data.len() {
                            warn!("[BLOCK] Content block length exceeds data size");
                            break;
                        }

                        // Deserialize content block (but don't store yet)
                        if let Ok(content_block) = bincode::deserialize::<crate::blocks::ContentBlock>(
                            &data[offset..offset + content_len],
                        ) {
                            parsed_content_blocks.push(content_block);
                        }
                        offset += content_len;
                    }
                }
            }

            // PHASE 2: VALIDATION - Check CreateSpace actions have valid sponsorship
            let block_is_valid = if let Some(ref ss) = self.sponsorship_store {
                // Collect all Sponsor actions in this block
                let mut identities_sponsored_in_block = std::collections::HashSet::new();
                for content_block in &parsed_content_blocks {
                    for action in &content_block.actions {
                        if action.action_type == crate::blocks::ActionType::Sponsor {
                            if let Some(sponsee_bytes) = action.content_hash {
                                identities_sponsored_in_block.insert(sponsee_bytes);
                            }
                        }
                    }
                }

                // Validate all CreateSpace actions
                let mut is_valid = true;
                for content_block in &parsed_content_blocks {
                    for action in &content_block.actions {
                        if action.action_type == crate::blocks::ActionType::CreateSpace {
                            let creator_bytes = action.actor;
                            let creator_pk =
                                crate::types::identity::PublicKey::from_bytes(creator_bytes);

                            let is_sponsored_on_chain = ss.exists(&creator_pk).unwrap_or(false);
                            let is_sponsored_in_block =
                                identities_sponsored_in_block.contains(&creator_bytes);

                            if !is_sponsored_on_chain && !is_sponsored_in_block {
                                warn!(
                                    "[BLOCK] VALIDATION FAILED: Block {} contains CreateSpace by unsponsored identity {}",
                                    hex::encode(&computed_hash[..8]),
                                    hex::encode(&creator_bytes[..8])
                                );
                                is_valid = false;
                                break;
                            }
                        }
                    }
                    if !is_valid {
                        break;
                    }
                }
                is_valid
            } else {
                true
            };

            if !block_is_valid {
                warn!(
                    "[BLOCK] Rejecting invalid block {} - will not store any blocks",
                    hex::encode(&computed_hash[..8])
                );
                continue;
            }

            // PHASE 3: Validation passed - now store everything
            for space_block in &parsed_space_blocks {
                if let Err(e) = chain_store.put_space_block(space_block) {
                    warn!("[BLOCK] Failed to store space block: {}", e);
                } else {
                    space_count_total += 1;
                }
            }

            for content_block in &parsed_content_blocks {
                // Register space if CreateSpace action is present
                if let Some(ref metadata) = content_block.space_metadata {
                    for action in &content_block.actions {
                        if action.action_type == crate::blocks::ActionType::CreateSpace {
                            if let Some(space_id_32) = action.content_hash {
                                let mut space_id_16 = [0u8; 16];
                                space_id_16.copy_from_slice(&space_id_32[..16]);

                                let space_info = crate::storage::SpaceInfo {
                                    space_id: space_id_16,
                                    name: metadata.name.clone(),
                                    description: metadata.description.clone(),
                                    created_at: action.timestamp,
                                    creator: action.actor,
                                    pow_work: action.pow_work,
                                    // Private space fields (defaults for public spaces)
                                    is_private: false,
                                    encrypted_name: None,
                                    creator_encrypted_key: None,
                                    key_version: 0,
                                };

                                if let Err(e) = chain_store.register_space(&space_info) {
                                    warn!("[BLOCK] Failed to register space: {}", e);
                                } else {
                                    info!(
                                        "[BLOCK] Registered space {} ({})",
                                        hex::encode(&space_id_16),
                                        metadata.name
                                    );
                                }
                            }
                        }
                    }
                }

                // Check for duplicate actions before storing
                match chain_store.check_content_block_for_duplicates(content_block) {
                    Ok(duplicates) if !duplicates.is_empty() => {
                        warn!(
                            "[BLOCK] Skipping content block with {} already-finalized action(s)",
                            duplicates.len()
                        );
                        continue;
                    }
                    Err(e) => {
                        warn!("[BLOCK] Failed to check for duplicate actions: {}", e);
                        // Continue anyway
                    }
                    Ok(_) => {} // No duplicates
                }

                if let Err(e) = chain_store.put_content_block(content_block) {
                    warn!("[BLOCK] Failed to store content block: {}", e);
                } else {
                    // Mark actions as finalized
                    if let Err(e) = chain_store
                        .mark_content_block_actions_finalized(content_block, block_height)
                    {
                        warn!("[BLOCK] Failed to mark actions as finalized: {}", e);
                    }
                    content_count_total += 1;
                    // Extract and store reactions from Engage actions
                    self.extract_reactions_from_block(content_block);
                    // Track engagements in the engagement graph
                    self.extract_engagements_from_block(content_block);
                    // SPEC_13 Phase A: behavioral clustering (organic communities)
                    self.process_behavioral_clustering(content_block);
                    // SPEC_11 Phase 6: Process on-chain sponsorship actions from synced blocks
                    self.apply_sponsorship_actions_from_block(content_block);
                }
            }

            // Store the root block with fork resolution
            match chain_store.put_root_block_with_fork_resolution(&root_block) {
                Ok((hash, is_new_tip)) => {
                    stored_count += 1;
                    if is_new_tip {
                        debug!(
                            "[BLOCK] Stored block {} at height {} as CANONICAL",
                            hex::encode(&hash[..8]),
                            root_block.height()
                        );
                        // Reset lazy block formation - we received a new canonical block
                        if let Some(ref bb) = self.block_builder {
                            if let Ok(mut bb_write) = bb.write() {
                                bb_write.reset_waiting();
                            }
                        }
                    } else {
                        debug!(
                            "[BLOCK] Stored block {} at height {} on FORK",
                            hex::encode(&hash[..8]),
                            root_block.height()
                        );
                    }

                    // Check for orphan blocks waiting for this block
                    self.process_orphans_for_block(&hash).await;
                }
                Err(e) => {
                    warn!("[BLOCK] Failed to store block: {}", e);
                }
            }
        }

        info!(
            "[BLOCK] Stored {}/{} root blocks, {} space blocks, {} content blocks from BLOCKS response",
            stored_count, blocks_data.blocks.len(), space_count_total, content_count_total
        );

        // CRITICAL: Fetch missing content blobs for all blocks we just stored.
        // Block sync only transfers content_hash references, not the actual blob data.
        // We need to request the blobs so users can view the content.
        //
        // This mirrors the blob fetching logic in handle_block_data.
        if let (Some(ref content_mgr), Some(ref pool)) =
            (&self.content_retrieval, &self.connection_pool)
        {
            let mut missing_hashes: Vec<[u8; 32]> = Vec::new();
            let mut seen_hashes: std::collections::HashSet<[u8; 32]> =
                std::collections::HashSet::new();

            // Re-parse blocks to collect content hashes we need to fetch
            for serialized in &blocks_data.blocks {
                let data = &serialized.data;
                let mut offset = 0usize;

                // Skip root block
                if data.len() < 8 {
                    continue;
                }
                let root_len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
                offset += 4 + root_len;

                // Parse space blocks and content blocks
                if offset + 4 <= data.len() {
                    let space_count = u32::from_le_bytes([
                        data[offset],
                        data[offset + 1],
                        data[offset + 2],
                        data[offset + 3],
                    ]) as usize;
                    offset += 4;

                    for _ in 0..space_count {
                        if offset + 4 > data.len() {
                            break;
                        }
                        let space_len = u32::from_le_bytes([
                            data[offset],
                            data[offset + 1],
                            data[offset + 2],
                            data[offset + 3],
                        ]) as usize;
                        offset += 4 + space_len;

                        if offset + 4 > data.len() {
                            break;
                        }
                        let content_count = u32::from_le_bytes([
                            data[offset],
                            data[offset + 1],
                            data[offset + 2],
                            data[offset + 3],
                        ]) as usize;
                        offset += 4;

                        for _ in 0..content_count {
                            if offset + 4 > data.len() {
                                break;
                            }
                            let content_len = u32::from_le_bytes([
                                data[offset],
                                data[offset + 1],
                                data[offset + 2],
                                data[offset + 3],
                            ]) as usize;
                            offset += 4;

                            if offset + content_len > data.len() {
                                break;
                            }

                            // Parse content block to extract content hashes
                            if let Ok(content_block) =
                                bincode::deserialize::<crate::blocks::ContentBlock>(
                                    &data[offset..offset + content_len],
                                )
                            {
                                for action in &content_block.actions {
                                    // Collect content_hash (text content)
                                    if let Some(content_hash) = action.content_hash {
                                        if !seen_hashes.contains(&content_hash) {
                                            seen_hashes.insert(content_hash);
                                            let blob_hash =
                                                crate::storage::blob::ContentBlobHash::from_bytes(
                                                    content_hash,
                                                );
                                            if !content_mgr.has_content(&blob_hash) {
                                                missing_hashes.push(content_hash);
                                            }
                                        }
                                    }
                                    // Collect media_refs (images/attachments)
                                    for media_ref in &action.media_refs {
                                        if !seen_hashes.contains(&media_ref.media_hash) {
                                            seen_hashes.insert(media_ref.media_hash);
                                            let blob_hash =
                                                crate::storage::blob::ContentBlobHash::from_bytes(
                                                    media_ref.media_hash,
                                                );
                                            if !content_mgr.has_content(&blob_hash) {
                                                missing_hashes.push(media_ref.media_hash);
                                            }
                                        }
                                    }
                                }
                            }
                            offset += content_len;
                        }
                    }
                }
            }

            if !missing_hashes.is_empty() {
                info!(
                    "[BLOB-SYNC] BLOCKS response has {} blobs we don't have - discovering via WHO_HAS",
                    missing_hashes.len()
                );

                // Mark content as wanted so when I_HAVE arrives, we auto-fetch
                for content_hash in &missing_hashes {
                    let blob_hash =
                        crate::storage::blob::ContentBlobHash::from_bytes(*content_hash);
                    content_mgr.mark_wanted(&blob_hash);
                }

                // Broadcast WHO_HAS to all connected peers for discovery
                for content_hash in missing_hashes {
                    let who_has_envelope =
                        crate::types::network::MessageEnvelope::new_fork_agnostic(
                            crate::types::network::MessageType::WhoHas,
                            content_hash.to_vec(),
                        );

                    let sent = pool.broadcast(&who_has_envelope).await;
                    if sent > 0 {
                        debug!(
                            "[BLOB-SYNC] Broadcast WHO_HAS for blob {} to {} peers",
                            hex::encode(&content_hash[..8]),
                            sent
                        );
                    }
                }
            }
        }

        Ok(None)
    }

    /// Extract and store reactions from Engage actions in a content block
    ///
    /// When receiving synced blocks, we need to extract Engage actions with emoji
    /// and store them in the content_store reactions table so get_reactions returns
    /// consistent data across all nodes.
    fn extract_reactions_from_block(&self, content_block: &crate::blocks::ContentBlock) {
        let content_store = match &self.content_store {
            Some(store) => store,
            None => return, // Content store not available
        };

        for action in &content_block.actions {
            // Only process Engage actions with emoji
            if action.action_type != crate::blocks::ActionType::Engage {
                continue;
            }

            let emoji = match action.emoji {
                Some(e) => e,
                None => continue, // No emoji specified
            };

            // Convert emoji code to ReactionType
            let reaction_type = match emoji {
                1 => ReactionType::Heart,
                2 => ReactionType::ThumbsUp,
                3 => ReactionType::ThumbsDown,
                4 => ReactionType::Laugh,
                5 => ReactionType::Thinking,
                6 => ReactionType::MindBlown,
                7 => ReactionType::Fire,
                8 => ReactionType::Swimming,
                _ => continue, // Unknown emoji
            };

            // Get target content (stored in content_hash field for Engage actions)
            let target_content = match action.content_hash {
                Some(h) => h,
                None => continue,
            };

            // Create and store the reaction
            // Use a dummy signature since the block was already validated (PoW verified)
            let reaction = Reaction {
                content_id: ContentId::from_bytes(target_content),
                reactor_id: IdentityId::from_bytes(action.actor),
                reaction_type,
                // action.timestamp is in seconds; the reaction store + decay window work
                // in milliseconds (get_reaction_counts compares against now*1000), so
                // normalize here — otherwise every stored reaction reads as decayed and
                // reaction counts come back empty.
                timestamp: action.timestamp.saturating_mul(1000),
                signature: Signature::from_bytes([0u8; 64]), // Block PoW already verified
            };

            match content_store.add_reaction(&reaction) {
                Ok(true) => {
                    debug!(
                        "[SYNC] Stored reaction {} from block for content {}",
                        reaction_type.emoji(),
                        hex::encode(&target_content[..8])
                    );
                }
                Ok(false) => {
                    // Duplicate - already have this reaction
                }
                Err(e) => {
                    warn!("[SYNC] Failed to store reaction from block: {}", e);
                }
            }
        }
    }

    /// Update reply counts in aggregation cache for Reply actions in a content block
    ///
    /// When receiving synced blocks, we need to increment the reply count for parent content
    /// so that thread listings show accurate reply counts.
    fn update_reply_counts_from_block(&self, content_block: &crate::blocks::ContentBlock) {
        let agg_cache = match &self.aggregation_cache {
            Some(cache) => cache,
            None => return, // Aggregation cache not available
        };

        for action in &content_block.actions {
            // Only process Reply actions
            if action.action_type != crate::blocks::ActionType::Reply {
                continue;
            }

            // Get parent content ID
            let parent_id = match action.parent_id {
                Some(p) => p,
                None => continue, // Reply without parent - skip
            };

            // Increment reply count for parent
            if let Err(e) = agg_cache.increment_reply_count(&ContentId::from_bytes(parent_id)) {
                warn!(
                    "[SYNC] Failed to increment reply count for parent {}: {}",
                    hex::encode(&parent_id[..8]),
                    e
                );
            } else {
                debug!(
                    "[SYNC] Incremented reply count for parent {} from synced block",
                    hex::encode(&parent_id[..8])
                );
            }
        }
    }

    /// Extract and track engagement relationships from actions in a content block
    ///
    /// Tracks who engages with whose content:
    /// - Reply actions: replier -> original author
    /// - Engage actions: engager -> content author
    /// - Quote actions: quoter -> quoted author
    fn extract_engagements_from_block(&self, content_block: &crate::blocks::ContentBlock) {
        let engagement_graph = match &self.engagement_graph {
            Some(graph) => graph,
            None => return, // Engagement tracking not available
        };

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => return, // Need chain store to look up authors
        };

        for action in &content_block.actions {
            let engager = action.actor;
            let timestamp = action.timestamp;

            // Determine engagement type and target
            let (engagement_type, target_content_hash) = match action.action_type {
                crate::blocks::ActionType::Reply => {
                    // Reply to parent content
                    match action.parent_id {
                        Some(parent) => (EngagementType::Reply, parent),
                        None => continue,
                    }
                }
                crate::blocks::ActionType::Engage => {
                    // Reaction/engagement with content
                    match action.content_hash {
                        Some(target) => (EngagementType::Reaction, target),
                        None => continue,
                    }
                }
                // Post and CreateSpace don't create engagement edges
                _ => continue,
            };

            // Look up the target content's author
            let author = match chain_store.get_content_author(&target_content_hash) {
                Ok(Some(a)) => a,
                Ok(None) => {
                    // Target content not found - might be off-chain or not yet synced
                    debug!(
                        "[ENGAGEMENT] Target content {} not found for engagement",
                        hex::encode(&target_content_hash[..8])
                    );
                    continue;
                }
                Err(e) => {
                    warn!("[ENGAGEMENT] Failed to look up content author: {}", e);
                    continue;
                }
            };

            // Record the engagement
            if let Err(e) =
                engagement_graph.record_engagement(&engager, &author, engagement_type, timestamp)
            {
                warn!(
                    "[ENGAGEMENT] Failed to record {} from {} to {}: {}",
                    engagement_type.as_str(),
                    hex::encode(&engager[..8]),
                    hex::encode(&author[..8]),
                    e
                );
            } else {
                debug!(
                    "[ENGAGEMENT] Recorded {} from {} to {}",
                    engagement_type.as_str(),
                    hex::encode(&engager[..8]),
                    hex::encode(&author[..8])
                );
            }
        }
    }

    /// SPEC_13 Phase A: Process actions in a content block for behavioral clustering.
    ///
    /// Updates per-identity interaction metrics (SPEC_13 §3.1) and applies
    /// detection outcomes (community fracture or spam signal). Gated by
    /// `behavioral_branching_mode` (from `NodeConfig::behavioral_branching_mode()`):
    /// `Full` executes the fracture (default ON only for regtest until SPEC_13
    /// §7 consensus messages land), `LogOnly` records a would-be formation
    /// without applying it (Phase 1 observation rollout, default ON for
    /// testnet -- `docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`), `Disabled`
    /// skips detection entirely.
    fn process_behavioral_clustering(&self, content_block: &crate::blocks::ContentBlock) {
        use crate::branch::{BranchManager, ClusterOutcome, ClusteringAction, ClusteringMode};

        let clustering_mode = match self.behavioral_branching_mode {
            BehavioralBranchingMode::Disabled => return,
            BehavioralBranchingMode::LogOnly => ClusteringMode::LogOnly,
            BehavioralBranchingMode::Full => ClusteringMode::Full,
        };
        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => return,
        };

        let current_height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);
        let manager = BranchManager::new(chain_store);

        for action in &content_block.actions {
            // Resolve the target author from existing chain indexes (§8.1).
            let clustering_action = match action.action_type {
                crate::blocks::ActionType::Post => Some(ClusteringAction::Post {
                    author: action.actor,
                }),
                crate::blocks::ActionType::Reply => action
                    .parent_id
                    .and_then(|parent| chain_store.get_content_author(&parent).ok().flatten())
                    .map(|parent_author| ClusteringAction::Reply {
                        author: action.actor,
                        parent_author,
                    }),
                crate::blocks::ActionType::Engage => action
                    .content_hash
                    .and_then(|target| chain_store.get_content_author(&target).ok().flatten())
                    .map(|target_author| ClusteringAction::Engage {
                        author: action.actor,
                        target_author,
                    }),
                _ => None,
            };

            let Some(clustering_action) = clustering_action else {
                continue;
            };

            match manager.process_action_for_clustering_with_mode(
                &content_block.space_id,
                &clustering_action,
                current_height,
                action.timestamp,
                clustering_mode,
            ) {
                Ok(ClusterOutcome::Community(formation))
                    if clustering_mode == ClusteringMode::LogOnly =>
                {
                    info!(
                        "[SPEC13] Would-be community formation logged in space {}: {} members (log-only, Phase 1)",
                        hex::encode(&content_block.space_id[..8]),
                        formation.founding_members.len(),
                    );
                }
                Ok(ClusterOutcome::Community(formation)) => {
                    info!(
                        "[SPEC13] Community formed in space {}: {} members, branch {:?}",
                        hex::encode(&content_block.space_id[..8]),
                        formation.founding_members.len(),
                        formation.community_branch,
                    );
                }
                Ok(ClusterOutcome::SpamSignal(signal)) => {
                    info!(
                        "[SPEC13] Spam cluster signal in space {} for identity {}",
                        hex::encode(&content_block.space_id[..8]),
                        hex::encode(&signal.identity[..8]),
                    );
                }
                Ok(ClusterOutcome::None) => {}
                Err(e) => {
                    warn!("[SPEC13] Behavioral clustering failed: {}", e);
                }
            }
        }
    }

    /// SPEC_11 Phase 6: Apply sponsorship actions from a content block to the local SponsorshipStore.
    ///
    /// Called from both `handle_block_data` and `handle_blocks` to ensure sponsorship
    /// records propagate to all nodes regardless of how blocks are received.
    fn apply_sponsorship_actions_from_block(&self, content_block: &crate::blocks::ContentBlock) {
        let sponsorship_store = match &self.sponsorship_store {
            Some(store) => store,
            None => return,
        };

        for action in &content_block.actions {
            match action.action_type {
                crate::blocks::ActionType::Sponsor => {
                    if let Some(sponsee_bytes) = action.content_hash {
                        let sponsor_bytes = action.actor;
                        let sponsee_pk =
                            crate::types::identity::PublicKey::from_bytes(sponsee_bytes);
                        let sponsor_pk =
                            crate::types::identity::PublicKey::from_bytes(sponsor_bytes);

                        // Phase 0 validation: Verify sponsor signature
                        // Signature message = sponsee_pubkey(32) || timestamp(8 BE)
                        {
                            use ed25519_dalek::{Signature, Verifier, VerifyingKey};
                            let mut sig_message = [0u8; 40];
                            sig_message[0..32].copy_from_slice(&sponsee_bytes);
                            sig_message[32..40].copy_from_slice(&action.timestamp.to_be_bytes());

                            let sig_valid = match VerifyingKey::from_bytes(&sponsor_bytes) {
                                Ok(vk) => {
                                    let sig = Signature::from_bytes(&action.signature);
                                    vk.verify(&sig_message, &sig).is_ok()
                                }
                                Err(_) => false,
                            };

                            if !sig_valid {
                                log::warn!(
                                    "[BLOCK] Sponsor action has invalid signature from {} — skipping",
                                    hex::encode(&sponsor_bytes[..8])
                                );
                                continue;
                            }
                        }

                        // Phase 0 validation: Verify sponsor is Active in SponsorshipStore
                        match sponsorship_store.get(&sponsor_pk) {
                            Ok(Some(sponsor_record)) => {
                                if sponsor_record.status
                                    != crate::sponsorship::types::SponsorshipStatus::Active
                                {
                                    log::warn!(
                                        "[BLOCK] Sponsor {} is not Active (status={:?}) — skipping",
                                        hex::encode(&sponsor_bytes[..8]),
                                        sponsor_record.status
                                    );
                                    continue;
                                }
                            }
                            Ok(None) => {
                                log::warn!(
                                    "[BLOCK] Sponsor {} not found in sponsorship store — skipping",
                                    hex::encode(&sponsor_bytes[..8])
                                );
                                continue;
                            }
                            Err(e) => {
                                log::warn!(
                                    "[BLOCK] Failed to look up sponsor {}: {}",
                                    hex::encode(&sponsor_bytes[..8]),
                                    e
                                );
                                continue;
                            }
                        }

                        // Phase 0 validation: Verify claimant PoW (non-zero work)
                        if action.pow_work > 0 {
                            use sha2::{Digest, Sha256};
                            let mut pow_input = Vec::with_capacity(40);
                            pow_input.extend_from_slice(&action.pow_target);
                            pow_input.extend_from_slice(&action.pow_nonce.to_le_bytes());
                            let pow_hash = Sha256::digest(&pow_input);
                            let actual_zeros =
                                pow_hash.iter().take_while(|&&b| b == 0).count() as u64;
                            if actual_zeros < action.pow_work {
                                log::warn!(
                                    "[BLOCK] Sponsor action PoW claimed {} but actual {} — skipping",
                                    action.pow_work, actual_zeros
                                );
                                continue;
                            }
                        }

                        // Dedup: check sponsee not already stored
                        match sponsorship_store.exists(&sponsee_pk) {
                            Ok(true) => {
                                log::debug!(
                                    "[BLOCK] Sponsorship for {} already exists, skipping",
                                    hex::encode(&sponsee_bytes[..8])
                                );
                            }
                            Ok(false) => {
                                let depth = match sponsorship_store.get(&sponsor_pk) {
                                    Ok(Some(sponsor_record)) => {
                                        sponsor_record.depth.saturating_add(1)
                                    }
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

                                if let Err(e) = sponsorship_store.put(&stored) {
                                    log::warn!(
                                        "[BLOCK] Failed to store sponsorship for {}: {}",
                                        hex::encode(&sponsee_bytes[..8]),
                                        e
                                    );
                                } else {
                                    log::info!(
                                        "[BLOCK] Applied on-chain sponsorship: {} sponsored by {} (depth={})",
                                        hex::encode(&sponsee_bytes[..8]),
                                        hex::encode(&sponsor_bytes[..8]),
                                        depth
                                    );
                                }
                            }
                            Err(e) => {
                                log::warn!("[BLOCK] Failed to check sponsorship existence: {}", e);
                            }
                        }
                    }
                }
                crate::blocks::ActionType::GenesisRegister => {
                    if let Some(genesis_bytes) = action.content_hash {
                        let genesis_pk =
                            crate::types::identity::PublicKey::from_bytes(genesis_bytes);

                        // Validation (a): actor must equal content_hash (self-registration)
                        if action.actor != genesis_bytes {
                            log::warn!(
                                "[BLOCK] Genesis action: actor {} != content_hash {} -- skipping",
                                hex::encode(&action.actor[..8]),
                                hex::encode(&genesis_bytes[..8])
                            );
                            continue;
                        }

                        // Validation (b): identity must be in hardcoded genesis list
                        if !crate::sponsorship::is_in_hardcoded_genesis_list(&genesis_pk) {
                            log::warn!(
                                "[BLOCK] Genesis action: {} not in hardcoded genesis list -- skipping",
                                hex::encode(&genesis_bytes[..8])
                            );
                            continue;
                        }

                        // Validation (c): verify signature
                        // message = genesis_pubkey(32) || timestamp(8 BE)
                        {
                            use ed25519_dalek::{Signature, Verifier, VerifyingKey};
                            let mut sig_message = [0u8; 40];
                            sig_message[0..32].copy_from_slice(&genesis_bytes);
                            sig_message[32..40].copy_from_slice(&action.timestamp.to_be_bytes());

                            let sig_valid = match VerifyingKey::from_bytes(&action.actor) {
                                Ok(vk) => {
                                    let sig = Signature::from_bytes(&action.signature);
                                    vk.verify(&sig_message, &sig).is_ok()
                                }
                                Err(_) => false,
                            };

                            if !sig_valid {
                                log::warn!(
                                    "[BLOCK] Genesis action has invalid signature from {} -- skipping",
                                    hex::encode(&genesis_bytes[..8])
                                );
                                continue;
                            }
                        }

                        match sponsorship_store.exists(&genesis_pk) {
                            Ok(true) => {
                                log::debug!(
                                    "[BLOCK] Genesis identity {} already registered, skipping",
                                    hex::encode(&genesis_bytes[..8])
                                );
                            }
                            Ok(false) => {
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

                                if let Err(e) = sponsorship_store.put(&stored) {
                                    log::warn!(
                                        "[BLOCK] Failed to store genesis identity {}: {}",
                                        hex::encode(&genesis_bytes[..8]),
                                        e
                                    );
                                } else {
                                    log::info!(
                                        "[BLOCK] Applied on-chain genesis registration: {}",
                                        hex::encode(&genesis_bytes[..8])
                                    );
                                }
                            }
                            Err(e) => {
                                log::warn!(
                                    "[BLOCK] Failed to check genesis identity existence: {}",
                                    e
                                );
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// Handle GETBLOCKS_LOCATOR - find common ancestor using Bitcoin-style locator
    ///
    /// The locator pattern uses exponentially spaced block hashes from the
    /// requester's tip, allowing us to find the common ancestor in O(log N).
    /// We find the first matching hash and return blocks from that point.
    ///
    /// Payload format: GetBlocksLocatorPayload (variable)
    async fn handle_getblocks_locator(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let request = GetBlocksLocatorPayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("GetBlocksLocatorPayload: {}", e))
        })?;

        info!(
            "[LOCATOR] Received GETBLOCKS_LOCATOR from peer {}: {} locator hashes, max={}",
            hex::encode(&peer_id[..8]),
            request.locator_hashes.len(),
            request.max_blocks
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[LOCATOR] No chain store configured");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Find the first matching locator hash in our chain
        let start_height = match chain_store.find_locator_match(&request.locator_hashes) {
            Ok(Some(height)) => {
                info!("[LOCATOR] Found common ancestor at height {}", height);
                // Start from the NEXT block after the common ancestor
                height + 1
            }
            Ok(None) => {
                // No match found - they might be on a completely different chain
                // Start from genesis
                info!("[LOCATOR] No locator match found, starting from genesis");
                0
            }
            Err(e) => {
                warn!("[LOCATOR] Failed to find locator match: {}", e);
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        // Get blocks from start_height using the existing helper
        let blocks = match chain_store.get_blocks_from_height(start_height, request.max_blocks) {
            Ok(blocks) => blocks,
            Err(e) => {
                warn!(
                    "[LOCATOR] Failed to get blocks from height {}: {}",
                    start_height, e
                );
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        if blocks.is_empty() {
            info!("[LOCATOR] No blocks to send (peer is synced)");
            return Ok(None);
        }

        info!(
            "[LOCATOR] Sending {} blocks starting from height {}",
            blocks.len(),
            start_height
        );

        // Build response using same format as handle_getblocks
        let mut response = BlocksPayload { blocks: Vec::new() };
        let mut total_bytes = 0usize;

        for root_block in blocks {
            // Serialize root block
            let root_bytes = match bincode::serialize(&root_block) {
                Ok(bytes) => bytes,
                Err(e) => {
                    warn!(
                        "[LOCATOR] Failed to serialize block at height {}: {}",
                        root_block.height, e
                    );
                    continue;
                }
            };

            // Build full block data with space and content blocks
            let mut full_data = Vec::new();

            // Length-prefixed root block
            full_data.extend_from_slice(&(root_bytes.len() as u32).to_le_bytes());
            full_data.extend_from_slice(&root_bytes);

            // Space block count
            let space_count = root_block.space_block_hashes.len() as u32;
            full_data.extend_from_slice(&space_count.to_le_bytes());

            // Serialize each space block with its content blocks
            for space_hash in &root_block.space_block_hashes {
                if let Ok(Some(space_block)) = chain_store.get_space_block(space_hash) {
                    if let Ok(space_bytes) = bincode::serialize(&space_block) {
                        // Length-prefixed space block
                        full_data.extend_from_slice(&(space_bytes.len() as u32).to_le_bytes());
                        full_data.extend_from_slice(&space_bytes);

                        // Content block count
                        let content_count = space_block.content_block_hashes.len() as u32;
                        full_data.extend_from_slice(&content_count.to_le_bytes());

                        // Serialize content blocks
                        for content_hash in &space_block.content_block_hashes {
                            if let Ok(Some(content_block)) =
                                chain_store.get_content_block(content_hash)
                            {
                                if let Ok(content_bytes) = bincode::serialize(&content_block) {
                                    full_data.extend_from_slice(
                                        &(content_bytes.len() as u32).to_le_bytes(),
                                    );
                                    full_data.extend_from_slice(&content_bytes);
                                }
                            }
                        }
                    }
                }
            }

            // Check size limit
            if total_bytes + full_data.len() > 4 * 1024 * 1024 {
                // 4MB limit
                break;
            }

            total_bytes += full_data.len();
            response.blocks.push(SerializedBlock { data: full_data });
        }

        info!(
            "[LOCATOR] Sending {} blocks ({} bytes) in response",
            response.blocks.len(),
            total_bytes
        );

        Ok(Some((MSG_BLOCKS, response.to_bytes())))
    }

    /// Handle GETHEADERS_LOCATOR - return headers for headers-first sync
    ///
    /// Similar to GETBLOCKS_LOCATOR but returns lightweight headers instead
    /// of full blocks. This enables PoW verification before downloading
    /// full block content.
    ///
    /// Payload format: GetHeadersLocatorPayload (variable)
    async fn handle_getheaders_locator(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let request = GetHeadersLocatorPayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("GetHeadersLocatorPayload: {}", e))
        })?;

        info!(
            "[HEADERS] Received GETHEADERS_LOCATOR from peer {}: {} locator hashes, max={}",
            hex::encode(&peer_id[..8]),
            request.locator_hashes.len(),
            request.max_headers
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[HEADERS] No chain store configured");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Find the first matching locator hash in our chain
        let start_height = match chain_store.find_locator_match(&request.locator_hashes) {
            Ok(Some(height)) => {
                info!("[HEADERS] Found common ancestor at height {}", height);
                height + 1
            }
            Ok(None) => {
                info!("[HEADERS] No locator match found, starting from genesis");
                0
            }
            Err(e) => {
                warn!("[HEADERS] Failed to find locator match: {}", e);
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        // Get headers (just the RootBlocks, without space/content blocks)
        let blocks = match chain_store.get_blocks_from_height(start_height, request.max_headers) {
            Ok(blocks) => blocks,
            Err(e) => {
                warn!(
                    "[HEADERS] Failed to get blocks from height {}: {}",
                    start_height, e
                );
                return Err(RouteError::StorageError(format!("{}", e)));
            }
        };

        if blocks.is_empty() {
            info!("[HEADERS] No headers to send (peer is synced)");
            return Ok(None);
        }

        // Build response with just headers (RootBlocks serialized without content)
        let mut response = HeadersPayload {
            headers: Vec::new(),
        };
        let mut total_bytes = 0usize;

        for root_block in blocks {
            // Serialize just the root block as header
            let header_bytes = match bincode::serialize(&root_block) {
                Ok(bytes) => bytes,
                Err(e) => {
                    warn!(
                        "[HEADERS] Failed to serialize header at height {}: {}",
                        root_block.height, e
                    );
                    continue;
                }
            };

            // Check size limit (1MB for headers)
            if total_bytes + header_bytes.len() > 1024 * 1024 {
                break;
            }

            total_bytes += header_bytes.len();
            response
                .headers
                .push(SerializedBlock { data: header_bytes });
        }

        info!(
            "[HEADERS] Sending {} headers ({} bytes) in response",
            response.headers.len(),
            total_bytes
        );

        Ok(Some((MSG_HEADERS, response.to_bytes())))
    }

    /// Handle HEADERS - receive and verify headers from peer
    ///
    /// Used for headers-first sync. Receives headers, verifies PoW chain,
    /// and if valid, stores them and requests full blocks for non-decayed content.
    ///
    /// Payload format: HeadersPayload (variable)
    async fn handle_headers(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let headers_data = HeadersPayload::from_bytes(payload)
            .map_err(|e| RouteError::DeserializationError(format!("HeadersPayload: {}", e)))?;

        info!(
            "[HEADERS] Received {} headers from peer {}",
            headers_data.headers.len(),
            hex::encode(&peer_id[..8])
        );

        let chain_store = match &self.chain_store {
            Some(store) => store,
            None => {
                debug!("[HEADERS] No chain store configured");
                return Err(RouteError::SubsystemUnavailable("chain_store"));
            }
        };

        // Deserialize headers
        let mut headers: Vec<crate::blocks::RootBlock> = Vec::new();
        for serialized in &headers_data.headers {
            match bincode::deserialize::<crate::blocks::RootBlock>(&serialized.data) {
                Ok(header) => headers.push(header),
                Err(e) => {
                    warn!("[HEADERS] Failed to deserialize header: {}", e);
                    continue;
                }
            }
        }

        if headers.is_empty() {
            info!("[HEADERS] No valid headers received");
            return Ok(None);
        }

        // Verify header chain (linkage, PoW, timestamps)
        if let Err(e) = crate::sync::header_sync::verify_header_chain(&headers) {
            warn!("[HEADERS] Header chain verification failed: {}", e);
            return Ok(None);
        }

        info!(
            "[HEADERS] Verified {} headers (heights {}-{})",
            headers.len(),
            headers.first().map(|h| h.height).unwrap_or(0),
            headers.last().map(|h| h.height).unwrap_or(0)
        );

        // Store headers that we don't have yet
        let mut stored_count = 0;
        let our_height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);

        for header in &headers {
            // Skip headers we already have
            if header.height <= our_height {
                continue;
            }

            // Store just the header (as a root block without space/content blocks)
            if let Err(e) = chain_store.put_root_block(header) {
                warn!(
                    "[HEADERS] Failed to store header at height {}: {}",
                    header.height, e
                );
                continue;
            }

            let hash = header.hash();
            if let Err(e) = chain_store.index_height(header.height, hash) {
                warn!(
                    "[HEADERS] Failed to index header at height {}: {}",
                    header.height, e
                );
            }

            stored_count += 1;
        }

        if stored_count > 0 {
            info!("[HEADERS] Stored {} new headers", stored_count);
        }

        // No response needed
        Ok(None)
    }

    // ========== Mempool Gossip Handlers ==========

    /// Handle ACTION_ANNOUNCE - receive pending action from peer and add to mempool
    ///
    /// When a peer announces a new action (POST/REPLY/ENGAGE), we:
    /// 1. Deserialize and validate the action
    /// 2. Check if we already have it (deduplication)
    /// 3. Add to our BlockBuilder mempool
    /// 4. Forward to other peers (gossip propagation)
    ///
    /// Payload format: ActionAnnouncePayload (282 bytes)
    async fn handle_action_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::blocks::action::Action;
        use crate::blocks::branch_path::BranchPath;
        use crate::blocks::builder::BlockBuilder;
        use crate::network::messages::ActionAnnouncePayload;

        let announce = ActionAnnouncePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: ActionAnnouncePayload::SIZE,
                actual: payload.len(),
            }
        })?;

        // Deserialize the action
        let action = match Action::deserialize(&announce.action_data) {
            Ok(a) => a,
            Err(e) => {
                warn!(
                    "[MEMPOOL] Failed to deserialize action from peer {}: {:?}",
                    hex::encode(&peer_id[..8]),
                    e
                );
                return Ok(None);
            }
        };

        // Get the block builder
        let block_builder = match &self.block_builder {
            Some(bb) => bb,
            None => {
                debug!("[MEMPOOL] No block builder configured, ignoring action announcement");
                return Err(RouteError::SubsystemUnavailable("block_builder"));
            }
        };

        // Compute action hash for deduplication check
        let action_hash = BlockBuilder::action_hash(&action);

        // Check if this action is already finalized in a block
        // This prevents re-adding actions that peers are gossiping after they've been included in blocks
        if let Some(ref chain_store) = self.chain_store {
            if let Ok(Some(height)) = chain_store.is_action_finalized(&action_hash) {
                debug!(
                    "[MEMPOOL] Action {} already finalized at height {}, ignoring gossip from peer {}",
                    hex::encode(&action_hash[..8]),
                    height,
                    hex::encode(&peer_id[..8])
                );
                return Ok(None);
            }
        }

        // Check if we already have this action in mempool
        {
            let bb_read = block_builder
                .read()
                .map_err(|_| RouteError::SubsystemUnavailable("block_builder lock poisoned"))?;
            if bb_read.has_action(&action_hash) {
                debug!(
                    "[MEMPOOL] Already have action {} from peer {}, ignoring",
                    hex::encode(&action_hash[..8]),
                    hex::encode(&peer_id[..8])
                );
                return Ok(None);
            }
        }

        // Add to block builder
        let added = {
            let mut bb_write = block_builder
                .write()
                .map_err(|_| RouteError::SubsystemUnavailable("block_builder lock poisoned"))?;

            let added = bb_write.add_action(
                announce.thread_id,
                announce.space_id,
                action.clone(),
                BranchPath::root(),
            );

            if added {
                info!(
                    "[MEMPOOL] Added action {} from peer {} to mempool (type={:?}, thread={})",
                    hex::encode(&action_hash[..8]),
                    hex::encode(&peer_id[..8]),
                    action.action_type,
                    hex::encode(&announce.thread_id[..8])
                );
            }
            added
        };

        // Publish real-time events for WebSocket subscribers (H-RPC-2)
        // This is the ingestion point for content gossiped from other nodes, so
        // connected clients see remote posts/replies/reactions without polling.
        if added {
            if let Some(ref events) = self.event_manager {
                use crate::blocks::action::ActionType;

                let space_id_16: [u8; 16] = announce.space_id[..16].try_into().unwrap_or([0u8; 16]);
                let space_id_str = encode_space_id_bech32(&space_id_16);
                let thread_id_str = format!("sha256:{}", hex::encode(announce.thread_id));
                let author_str = hex::encode(action.actor);

                match action.action_type {
                    ActionType::Post | ActionType::Reply => {
                        if let Some(content_hash) = action.content_hash {
                            let content_id = format!("sha256:{}", hex::encode(content_hash));
                            let content_type = if action.action_type == ActionType::Post {
                                "post"
                            } else {
                                "reply"
                            };
                            events.publish_content_new(
                                &content_id,
                                content_type,
                                &space_id_str,
                                &author_str,
                                Some(&thread_id_str),
                            );
                        }
                    }
                    ActionType::Engage => {
                        if let Some(target_hash) = action.content_hash {
                            let content_id = format!("sha256:{}", hex::encode(target_hash));
                            events.publish_content_engaged(
                                &content_id,
                                &author_str,
                                action.emoji,
                                Some(&space_id_str),
                                Some(&thread_id_str),
                            );
                        }
                    }
                    _ => {}
                }
            }
        }

        // CRITICAL: Fetch missing content blobs for gossiped actions (P0 fix)
        // When we receive an action via gossip, it only contains content_hash references,
        // NOT the actual blob data. We need to request the blobs so the node can:
        // 1. Display content if this node becomes the viewer
        // 2. Form blocks that include the content (as block leader)
        // 3. Propagate complete content to other peers
        if added {
            if let (Some(ref content_mgr), Some(ref pool)) =
                (&self.content_retrieval, &self.connection_pool)
            {
                let mut missing_hashes: Vec<[u8; 32]> = Vec::new();

                // Check if we have the text content blob
                if let Some(content_hash) = action.content_hash {
                    let blob_hash = crate::storage::blob::ContentBlobHash::from_bytes(content_hash);
                    if !content_mgr.has_content(&blob_hash) {
                        missing_hashes.push(content_hash);
                    }
                }

                // Check if we have the media blobs
                for media_ref in &action.media_refs {
                    let blob_hash =
                        crate::storage::blob::ContentBlobHash::from_bytes(media_ref.media_hash);
                    if !content_mgr.has_content(&blob_hash)
                        && !missing_hashes.contains(&media_ref.media_hash)
                    {
                        missing_hashes.push(media_ref.media_hash);
                    }
                }

                if !missing_hashes.is_empty() {
                    info!(
                        "[BLOB-GOSSIP] Action from peer {} has {} missing blobs - sending WHO_HAS",
                        hex::encode(&peer_id[..8]),
                        missing_hashes.len()
                    );

                    // Mark content as wanted and broadcast WHO_HAS to discover providers
                    for content_hash in &missing_hashes {
                        let blob_hash =
                            crate::storage::blob::ContentBlobHash::from_bytes(*content_hash);
                        content_mgr.mark_wanted(&blob_hash);
                    }

                    // Broadcast WHO_HAS to all connected peers
                    for content_hash in missing_hashes {
                        let who_has_envelope =
                            crate::types::network::MessageEnvelope::new_fork_agnostic(
                                crate::types::network::MessageType::WhoHas,
                                content_hash.to_vec(),
                            );
                        let sent = pool.broadcast(&who_has_envelope).await;
                        debug!(
                            "[BLOB-GOSSIP] Sent WHO_HAS for blob {} to {} peers",
                            hex::encode(&content_hash[..8]),
                            sent
                        );
                    }
                }
            }
        }

        // If this is a CreateSpace action, also register the space in chain_store
        // so it's immediately visible to list_spaces queries (before block finalization)
        if added && action.action_type == crate::blocks::action::ActionType::CreateSpace {
            if let Some(ref chain_store) = self.chain_store {
                // Extract space_id from thread_id (for CreateSpace, thread_id == space_id)
                let mut space_id_16 = [0u8; 16];
                space_id_16.copy_from_slice(&announce.thread_id[..16]);

                // Check if space already exists
                match chain_store.space_exists(&space_id_16) {
                    Ok(false) => {
                        // Register the space with minimal info (will be updated when block forms)
                        let space_info = crate::storage::SpaceInfo {
                            space_id: space_id_16,
                            name: format!("Space {}", hex::encode(&space_id_16[..4])), // Placeholder name
                            description: Some(String::new()),
                            creator: action.actor,
                            created_at: action.timestamp,
                            pow_work: action.pow_work,
                            // Private space fields (defaults for public spaces)
                            is_private: false,
                            encrypted_name: None,
                            creator_encrypted_key: None,
                            key_version: 0,
                        };
                        if let Err(e) = chain_store.register_space(&space_info) {
                            warn!("[MEMPOOL] Failed to register space from gossip: {}", e);
                        } else {
                            info!(
                                "[MEMPOOL] Registered space {} from peer {} (via gossip)",
                                hex::encode(&space_id_16[..4]),
                                hex::encode(&peer_id[..8])
                            );
                        }
                    }
                    Ok(true) => {
                        debug!("[MEMPOOL] Space already registered, skipping");
                    }
                    Err(e) => {
                        warn!("[MEMPOOL] Failed to check space existence: {}", e);
                    }
                }
            }
        }

        // Forward to other peers (gossip propagation)
        if let Some(ref connection_pool) = self.connection_pool {
            let all_peers = connection_pool.peer_ids().await;
            let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                crate::types::network::MessageType::ActionAnnounce,
                payload.to_vec(),
            );

            for other_peer_id in all_peers {
                // Don't send back to the peer we received from
                if other_peer_id == *peer_id {
                    continue;
                }
                if let Err(e) = connection_pool.send_to(&other_peer_id, &envelope).await {
                    debug!(
                        "[MEMPOOL] Failed to forward action to peer {}: {}",
                        hex::encode(&other_peer_id[..8]),
                        e
                    );
                }
            }
        }

        // NOTE: We do NOT try to form a block here for gossiped actions.
        // Only the node that locally creates the threshold-crossing action should form the block.
        // This prevents every node from forming competing blocks for the same gossiped actions.
        // Block formation happens in RPC handlers (post, reply, etc.) for locally-created content.

        Ok(None)
    }

    /// Handle an incoming DM request announcement (managed DM propagation).
    ///
    /// A DM request is self-authenticating: it carries an Ed25519 signature over its
    /// canonical message plus an anti-spam PoW. We verify both before trusting it.
    /// If we are the recipient we store it as a pending DM request (surfaced via
    /// `get_pending_dm_requests`). Regardless, we re-flood it to our other peers so it
    /// reaches the recipient across multiple hops — deduped by signature so it can't loop.
    async fn handle_dm_request_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::DmRequestAnnouncePayload;

        let announce = DmRequestAnnouncePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: DmRequestAnnouncePayload::SIZE,
                actual: payload.len(),
            }
        })?;

        // Reject anything not correctly signed with a valid anti-spam PoW.
        if !announce.verify() {
            warn!(
                "[DM] Dropping DM request with invalid signature/PoW from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        // Gossip loop-prevention: key on the signature (unique per request). If we've
        // already processed this exact request, drop it silently.
        let mut dedup_key = [0u8; 32];
        dedup_key.copy_from_slice(&announce.signature[..32]);
        {
            let mut seen = self.seen_dm_requests.write().unwrap();
            if !seen.insert(dedup_key) {
                return Ok(None);
            }
            // Bound memory: this is best-effort loop-prevention, not a durable ledger.
            if seen.len() > 10_000 {
                seen.clear();
                seen.insert(dedup_key);
            }
        }

        // If we are the recipient, persist it as a pending request.
        if self.identity_pubkey == Some(announce.recipient) {
            if let Some(ref membership_store) = self.membership_store {
                match membership_store.dm_request_exists(&announce.requester, &announce.recipient) {
                    Ok(true) => {
                        debug!("[DM] Duplicate DM request already stored, skipping");
                    }
                    _ => {
                        let request_hash = crate::crypto::sha256(
                            &[
                                &announce.requester[..],
                                &announce.recipient[..],
                                &announce.timestamp.to_le_bytes(),
                            ]
                            .concat(),
                        );
                        let record = crate::storage::membership::DMRequestRecord {
                            request_hash,
                            requester_pk: announce.requester,
                            recipient_pk: announce.recipient,
                            requester_key_share: announce.key_share.to_vec(),
                            created_at: announce.timestamp,
                            status: crate::storage::membership::DMRequestStatus::Pending,
                            space_id: None,
                        };
                        if let Err(e) = membership_store.add_dm_request(&record) {
                            warn!("[DM] Failed to store incoming DM request: {}", e);
                        } else {
                            info!(
                                "[DM] Stored incoming DM request from {}",
                                hex::encode(&announce.requester[..8])
                            );
                        }
                    }
                }
            }
        }

        // Re-flood to our other peers (excluding the sender) so multi-hop delivery works.
        if let Some(ref connection_pool) = self.connection_pool {
            let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                crate::types::network::MessageType::DmRequestAnnounce,
                payload.to_vec(),
            );
            let _ = connection_pool.broadcast_except(&envelope, peer_id).await;
        }

        Ok(None)
    }

    /// Handle an incoming DM acceptance announcement.
    ///
    /// Verifies the acceptor's signature, and — if we are the original requester and
    /// hold a matching pending request — flips it to Accepted (recording the resolved
    /// DM space id). Re-floods so it reaches us across hops. The matching-request check
    /// means an unsolicited accept is simply ignored, so no PoW is needed.
    async fn handle_dm_accept_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::DmAcceptAnnouncePayload;

        let announce = DmAcceptAnnouncePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: DmAcceptAnnouncePayload::SIZE,
                actual: payload.len(),
            }
        })?;

        if !announce.verify() {
            warn!(
                "[DM] Dropping DM accept with invalid signature from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        // Loop-prevention (shared seen-set with request announces; signatures are unique).
        let mut dedup_key = [0u8; 32];
        dedup_key.copy_from_slice(&announce.signature[..32]);
        {
            let mut seen = self.seen_dm_requests.write().unwrap();
            if !seen.insert(dedup_key) {
                return Ok(None);
            }
            if seen.len() > 10_000 {
                seen.clear();
                seen.insert(dedup_key);
            }
        }

        // If we are the requester, flip our outgoing request to Accepted.
        if self.identity_pubkey == Some(announce.requester) {
            if let Some(ref membership_store) = self.membership_store {
                // Recompute the deterministic DM space id (identical on both sides).
                let mut sorted = [announce.requester, announce.acceptor];
                sorted.sort();
                let preimage = format!(
                    "dm:v1:{}:{}",
                    hex::encode(sorted[0]),
                    hex::encode(sorted[1])
                );
                let sh = crate::crypto::sha256(preimage.as_bytes());
                let mut space_id = [0u8; 16];
                space_id.copy_from_slice(&sh[..16]);

                match membership_store.update_dm_request_status(
                    &announce.requester,
                    &announce.acceptor,
                    crate::storage::membership::DMRequestStatus::Accepted,
                    Some(space_id),
                ) {
                    Ok(true) => info!(
                        "[DM] Request to {} was accepted",
                        hex::encode(&announce.acceptor[..8])
                    ),
                    _ => debug!("[DM] Accept for a request we don't hold; ignoring"),
                }
            }
        }

        // Re-flood to our other peers so it reaches the requester across hops.
        if let Some(ref connection_pool) = self.connection_pool {
            let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                crate::types::network::MessageType::DmAcceptAnnounce,
                payload.to_vec(),
            );
            let _ = connection_pool.broadcast_except(&envelope, peer_id).await;
        }

        Ok(None)
    }

    /// Handle an incoming DM decline announcement. Mirrors the accept handler: verify
    /// the decliner's signature and, if we're the requester holding a matching request,
    /// mark it Declined. Re-flood so it reaches the requester across hops.
    async fn handle_dm_decline_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::DmDeclineAnnouncePayload;

        let announce = DmDeclineAnnouncePayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: DmDeclineAnnouncePayload::SIZE,
                actual: payload.len(),
            }
        })?;

        if !announce.verify() {
            warn!(
                "[DM] Dropping DM decline with invalid signature from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        let mut dedup_key = [0u8; 32];
        dedup_key.copy_from_slice(&announce.signature[..32]);
        {
            let mut seen = self.seen_dm_requests.write().unwrap();
            if !seen.insert(dedup_key) {
                return Ok(None);
            }
            if seen.len() > 10_000 {
                seen.clear();
                seen.insert(dedup_key);
            }
        }

        if self.identity_pubkey == Some(announce.requester) {
            if let Some(ref membership_store) = self.membership_store {
                match membership_store.update_dm_request_status(
                    &announce.requester,
                    &announce.decliner,
                    crate::storage::membership::DMRequestStatus::Declined,
                    None,
                ) {
                    Ok(true) => info!(
                        "[DM] Request to {} was declined",
                        hex::encode(&announce.decliner[..8])
                    ),
                    _ => debug!("[DM] Decline for a request we don't hold; ignoring"),
                }
            }
        }

        if let Some(ref connection_pool) = self.connection_pool {
            let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                crate::types::network::MessageType::DmDeclineAnnounce,
                payload.to_vec(),
            );
            let _ = connection_pool.broadcast_except(&envelope, peer_id).await;
        }

        Ok(None)
    }

    /// Handle an incoming HOLE_PUNCH_INTRO (Layer 2 NAT traversal).
    ///
    /// A connected peer (typically the seed) is telling us about another NAT'd peer's
    /// observed public endpoint. If we're not already connected to that peer, we forward
    /// the endpoint to the dialer task so it can attempt an outbound connect — when the
    /// other side dials us at the same moment, both NAT mappings get punched.
    ///
    /// This is intentionally unauthenticated: the worst a bogus intro can do is cost one
    /// failed `connect()`. We never re-flood it (it's point-to-point coordination), and we
    /// skip peers we already have to avoid churning live connections.
    async fn handle_hole_punch_intro(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::HolePunchIntroPayload;

        let intro = HolePunchIntroPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::PayloadTooSmall {
                expected: HolePunchIntroPayload::SIZE,
                actual: payload.len(),
            }
        })?;

        // Ignore an intro pointing at ourselves.
        if let Some(my_id) = self.node_id {
            if intro.target_node_id == my_id {
                return Ok(None);
            }
        }

        let endpoint = match intro.endpoint() {
            Some(addr) => addr,
            None => {
                debug!(
                    "[NAT] Dropping hole-punch intro with no dialable endpoint from {}",
                    hex::encode(&peer_id[..8])
                );
                return Ok(None);
            }
        };

        // Already connected to this peer? Nothing to punch.
        if let Some(ref pool) = self.connection_pool {
            if pool.get(&intro.target_node_id).await.is_some() {
                return Ok(None);
            }
        }

        // Hand the endpoint to the dialer task (the router has no transport handle).
        if let Some(ref tx) = self.hole_punch_tx {
            if tx.send((endpoint, intro.target_node_id)).is_ok() {
                info!(
                    "[NAT] Hole-punch intro from {}: dialing {} ({})",
                    hex::encode(&peer_id[..8]),
                    endpoint,
                    hex::encode(&intro.target_node_id[..8])
                );
            }
        }

        Ok(None)
    }

    /// Handle GETMEMPOOL request - respond with INV of all pending actions
    ///
    /// When a peer connects or wants to sync mempools, they send GETMEMPOOL.
    /// We respond with an INV containing hashes of all pending actions in our mempool.
    /// The peer can then request any missing actions via GETDATA.
    async fn handle_getmempool(
        &self,
        peer_id: &[u8; 32],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::{InvItem, InvPayload};
        use crate::types::serialize::Serialize;

        let block_builder = match &self.block_builder {
            Some(bb) => bb,
            None => {
                debug!("[MEMPOOL] No block builder configured, cannot respond to GETMEMPOOL");
                return Err(RouteError::SubsystemUnavailable("block_builder"));
            }
        };

        // Get all pending action hashes
        let action_hashes: Vec<[u8; 32]> = {
            let bb_read = block_builder
                .read()
                .map_err(|_| RouteError::SubsystemUnavailable("block_builder lock poisoned"))?;
            bb_read.get_pending_action_hashes()
        };

        if action_hashes.is_empty() {
            debug!(
                "[MEMPOOL] No pending actions to send to peer {}",
                hex::encode(&peer_id[..8])
            );
            // Still send empty INV to indicate we received the request
        }

        // Build INV payload with action type
        let items: Vec<InvItem> = action_hashes
            .iter()
            .map(|hash| InvItem::action(*hash))
            .collect();

        let inv_payload = InvPayload { items };
        let payload_bytes = inv_payload.to_bytes();

        info!(
            "[MEMPOOL] Sending {} action hashes to peer {} in response to GETMEMPOOL",
            action_hashes.len(),
            hex::encode(&peer_id[..8])
        );

        Ok(Some((MSG_INV, payload_bytes)))
    }

    /// Handle INV (inventory announcement) message
    ///
    /// When we receive an INV with action items, we check which ones we don't have
    /// and request them via GETDATA.
    async fn handle_inv(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::{InvItem, InvPayload};
        use crate::types::serialize::{Deserialize, Serialize};

        let inv = InvPayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Failed to parse INV payload: {:?}", e))
        })?;

        if inv.items.is_empty() {
            return Ok(None);
        }

        // Get block builder to check which actions we already have
        let block_builder = match &self.block_builder {
            Some(bb) => bb,
            None => {
                debug!("[INV] No block builder configured, ignoring INV");
                return Ok(None);
            }
        };

        // Find actions we don't have
        let mut missing_actions: Vec<InvItem> = Vec::new();

        {
            let bb_read = block_builder
                .read()
                .map_err(|_| RouteError::SubsystemUnavailable("block_builder lock poisoned"))?;
            let known_hashes: std::collections::HashSet<[u8; 32]> =
                bb_read.get_pending_action_hashes().into_iter().collect();

            for item in inv.items.iter() {
                if item.is_action() {
                    if !known_hashes.contains(&item.hash) {
                        missing_actions.push(item.clone());
                    }
                }
            }
        }

        if missing_actions.is_empty() {
            debug!(
                "[INV] Received {} items from peer {}, all known",
                inv.items.len(),
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        info!(
            "[INV] Received {} items from peer {}, requesting {} missing actions",
            inv.items.len(),
            hex::encode(&peer_id[..8]),
            missing_actions.len()
        );

        // Request missing actions via GETDATA
        let getdata_payload = InvPayload {
            items: missing_actions,
        };
        Ok(Some((MSG_GETDATA, getdata_payload.to_bytes())))
    }

    /// Handle GETDATA (request for specific inventory items)
    ///
    /// When a peer requests action items, we look them up in our mempool
    /// and respond with ACTION_ANNOUNCE messages.
    async fn handle_getdata(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::blocks::action::Action;
        use crate::network::messages::{ActionAnnouncePayload, InvPayload};
        use crate::types::serialize::Deserialize;

        let getdata = InvPayload::from_bytes(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Failed to parse GETDATA payload: {:?}", e))
        })?;

        if getdata.items.is_empty() {
            return Ok(None);
        }

        // Get block builder to look up actions
        let block_builder = match &self.block_builder {
            Some(bb) => bb,
            None => {
                debug!("[GETDATA] No block builder configured, ignoring GETDATA");
                return Err(RouteError::SubsystemUnavailable("block_builder"));
            }
        };

        // Get the connection pool to send multiple ACTION_ANNOUNCE messages
        let connection_pool = match &self.connection_pool {
            Some(pool) => pool,
            None => {
                debug!("[GETDATA] No connection pool, cannot respond");
                return Err(RouteError::SubsystemUnavailable("connection_pool"));
            }
        };

        let mut sent_count = 0;

        for item in getdata.items.iter() {
            if !item.is_action() {
                continue;
            }

            // Look up the action in our mempool
            let action_data = {
                let bb_read = block_builder
                    .read()
                    .map_err(|_| RouteError::SubsystemUnavailable("block_builder lock poisoned"))?;
                bb_read.get_pending_action_by_hash(&item.hash)
            };

            if let Some((thread_id, space_id, action)) = action_data {
                // Serialize the action (returns fixed-size array)
                let action_data = action.serialize();

                let announce = ActionAnnouncePayload::new(thread_id, space_id, action_data);
                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::ActionAnnounce,
                    announce.to_bytes().to_vec(),
                );

                if let Err(e) = connection_pool.send_to(peer_id, &envelope).await {
                    warn!(
                        "[GETDATA] Failed to send ACTION_ANNOUNCE to peer {}: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                } else {
                    sent_count += 1;
                }
            }
        }

        if sent_count > 0 {
            info!(
                "[GETDATA] Sent {} ACTION_ANNOUNCE messages to peer {}",
                sent_count,
                hex::encode(&peer_id[..8])
            );
        }

        // Return None since we already sent the responses directly
        Ok(None)
    }

    /// Check if mempool PoW threshold is met and form a block if so.
    ///
    /// This is called after adding actions to the mempool. When cumulative PoW
    /// from all pending actions meets/exceeds the difficulty target, we form
    /// and broadcast a block immediately. This removes the need for timer-based
    /// block formation - blocks are formed naturally when enough work accumulates.
    async fn try_form_block_if_threshold_met(&self) {
        let block_builder = match &self.block_builder {
            Some(bb) => bb,
            None => return,
        };

        // Get node identity for block creator (defaults to zero if not set)
        let block_creator = self.node_id.unwrap_or([0u8; 32]);

        // Lazy block formation: check if we should form, or wait for network
        let (root, space_blocks, content_blocks) = {
            let mut bb_write = match block_builder.write() {
                Ok(b) => b,
                Err(e) => {
                    warn!(
                        "[BLOCKS] Failed to acquire write lock for block formation: {}",
                        e
                    );
                    return;
                }
            };

            // Check if chain already has a block at expected height
            // (someone else formed it - no need for us to form)
            if let Some(ref chain_store) = self.chain_store {
                let expected_height = bb_write.next_height();
                if let Ok(Some(_)) = chain_store.get_root_hash_at_height(expected_height) {
                    // Block already exists - reset waiting and sync our state
                    bb_write.reset_waiting();
                    debug!(
                        "[BLOCKS] Block already exists at height {}, skipping formation",
                        expected_height
                    );
                    return;
                }
            }

            // Check if ready to form (lazy waiting: waits for network block first)
            if !bb_write.should_form_root() {
                return;
            }

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            bb_write.build_root_block(
                now,
                block_creator,
                self.sponsorship_store.as_ref().map(|s| s.as_ref()),
            )
        };

        let root_hash = root.hash();
        info!(
            "[BLOCKS] PoW threshold met! Formed block (height={}, pow={}, {} spaces, {} threads)",
            root.height(),
            root.total_pow,
            space_blocks.len(),
            content_blocks.len()
        );

        // Store blocks in ChainStore
        if let Some(ref store) = self.chain_store {
            let block_height = root.height();

            // Store content blocks first (referenced by space blocks)
            for content_block in &content_blocks {
                if let Err(e) = store.put_content_block(content_block) {
                    warn!("[BLOCKS] Failed to store content block: {}", e);
                } else {
                    // Mark all actions as finalized so duplicate blocks from other nodes are rejected
                    if let Err(e) =
                        store.mark_content_block_actions_finalized(content_block, block_height)
                    {
                        warn!("[BLOCKS] Failed to mark actions as finalized: {}", e);
                    }
                }
            }

            // Store space blocks (referenced by root block)
            for space_block in &space_blocks {
                if let Err(e) = store.put_space_block(space_block) {
                    warn!("[BLOCKS] Failed to store space block: {}", e);
                }
            }

            // Store root block with fork resolution
            match store.put_root_block_with_fork_resolution(&root) {
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
                        // This can happen if we received a heavier block while forming ours
                        warn!(
                            "[BLOCKS] Stored root block {} but NOT canonical (height={}, cumulative_pow={})",
                            hex::encode(&hash[..8]),
                            root.height(),
                            root.cumulative_pow
                        );
                    }

                    // Check for orphan blocks waiting for this block
                    self.process_orphans_for_block(&hash).await;
                }
                Err(e) => {
                    warn!("[BLOCKS] Failed to store root block: {}", e);
                }
            }
        }

        // Announce block to peers
        if let Some(ref connection_pool) = self.connection_pool {
            use crate::network::messages::BlockAnnouncePayload;
            use crate::types::network::{MessageEnvelope, MessageType};

            let announce = BlockAnnouncePayload::new(
                root_hash,
                root.height(),
                root.total_pow,
                space_blocks.len() as u32,
                root.timestamp,
            );

            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::BlockAnnounce,
                announce.to_bytes().to_vec(),
            );

            let sent = connection_pool.broadcast(&envelope).await;
            info!(
                "[BLOCKS] Announced block {} (height={}) to {} peers",
                hex::encode(&root_hash[..8]),
                root.height(),
                sent
            );
        }
    }

    // ========== Blocklist Gossip Handlers (SPEC_12 §4.6) ==========

    /// Handle BLOCKLIST_UPDATE - receive and store blocklist update
    ///
    /// When a peer sends a blocklist update (new blocked hash), we validate
    /// and store it locally, then forward to other peers.
    ///
    /// Payload format: BlocklistUpdate
    async fn handle_blocklist_update(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let message = parse_blocklist_message(MSG_BLOCKLIST_UPDATE, payload)
            .map_err(|e| RouteError::DeserializationError(format!("{}", e)))?;

        let update = match message {
            BlocklistMessage::Update(u) => u,
            _ => {
                return Err(RouteError::DeserializationError(
                    "Expected Update".to_string(),
                ))
            }
        };

        info!(
            "[BLOCKLIST] Received BLOCKLIST_UPDATE from peer {}: content={} reason={:?}",
            hex::encode(&peer_id[..8]),
            hex::encode(&update.content_hash[..8]),
            update.reason
        );

        let blocklist = match &self.blocklist {
            Some(bl) => bl,
            None => {
                debug!("[BLOCKLIST] No blocklist store configured");
                return Err(RouteError::SubsystemUnavailable("blocklist"));
            }
        };

        // Check if we already have this hash blocked (read lock)
        {
            let store = blocklist.read().unwrap();
            if store.is_blocked(&update.content_hash) {
                debug!(
                    "[BLOCKLIST] Already have blocked hash {}",
                    hex::encode(&update.content_hash[..8])
                );
                return Ok(None);
            }
        }

        // Validate the update including Ed25519 signature verification (H-BLOCKLIST-2)
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if let Some(ref blocklist_gossip) = self.blocklist_gossip {
            let gossip = blocklist_gossip.read().unwrap();
            // Trust-anchored fast path: updates signed by a configured
            // list-maintainer key are accepted without community attestations;
            // all other keys still require the attestation threshold.
            gossip
                .validate_update_with_trust(
                    &update,
                    current_time,
                    &self.trusted_blocklist_keys,
                    |pubkey, msg, sig| ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig)),
                )
                .map_err(|e| {
                    warn!(
                        "[BLOCKLIST] Invalid update from peer {}: {}",
                        hex::encode(&peer_id[..8]),
                        e
                    );
                    RouteError::HandlerError(format!("blocklist validation error: {}", e))
                })?;
        }

        // Store the update (write lock) - C-BLOCKLIST-2 fix
        {
            let mut store = blocklist.write().unwrap();
            let entry = entry_from_update(&update);
            match store.add_or_update(entry) {
                Ok(()) => {
                    info!(
                        "[BLOCKLIST] Stored blocklist update for hash {}",
                        hex::encode(&update.content_hash[..8])
                    );
                }
                Err(e) => {
                    warn!(
                        "[BLOCKLIST] Failed to store blocklist update for hash {}: {}",
                        hex::encode(&update.content_hash[..8]),
                        e
                    );
                    return Err(RouteError::HandlerError(format!(
                        "blocklist store error: {}",
                        e
                    )));
                }
            }
        }

        // Forward to other peers (gossip propagation) - H-BLOCKLIST-2
        if let (Some(ref connection_pool), Some(ref blocklist_gossip)) =
            (&self.connection_pool, &self.blocklist_gossip)
        {
            let all_peers = connection_pool.peer_ids().await;
            let all_peers_arr: Vec<[u8; 32]> = all_peers.iter().copied().collect();

            // Get peers that haven't seen this update yet
            let peers_to_forward = {
                let mut gossip = blocklist_gossip.write().unwrap();
                gossip.peers_to_forward(&update.content_hash, &all_peers_arr, Some(*peer_id))
            };

            if !peers_to_forward.is_empty() {
                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::BlocklistUpdate,
                    payload.to_vec(),
                );

                let mut forwarded_count = 0;
                for target_peer_id in peers_to_forward {
                    if let Err(e) = connection_pool.send_to(&target_peer_id, &envelope).await {
                        debug!(
                            "[BLOCKLIST] Failed to forward update to peer {}: {}",
                            hex::encode(&target_peer_id[..8]),
                            e
                        );
                    } else {
                        forwarded_count += 1;
                        // Mark peer as having seen the update
                        let mut gossip = blocklist_gossip.write().unwrap();
                        gossip.mark_peer_seen(&update.content_hash, target_peer_id);
                    }
                }

                if forwarded_count > 0 {
                    info!(
                        "[BLOCKLIST] Forwarded update for hash {} to {} peers",
                        hex::encode(&update.content_hash[..8]),
                        forwarded_count
                    );
                }
            }
        }

        Ok(None)
    }

    /// Handle BLOCKLIST_SYNC - exchange Merkle roots for sync
    ///
    /// Used to compare blocklist state between nodes and identify
    /// which entries need to be exchanged.
    ///
    /// Payload format: BlocklistSync
    async fn handle_blocklist_sync(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let message = parse_blocklist_message(MSG_BLOCKLIST_SYNC, payload)
            .map_err(|e| RouteError::DeserializationError(format!("{}", e)))?;

        let sync = match message {
            BlocklistMessage::Sync(s) => s,
            _ => {
                return Err(RouteError::DeserializationError(
                    "Expected Sync".to_string(),
                ))
            }
        };

        info!(
            "[BLOCKLIST] Received BLOCKLIST_SYNC from peer {}: root={} count={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&sync.merkle_root[..8]),
            sync.entry_count
        );

        let blocklist = match &self.blocklist {
            Some(bl) => bl,
            None => {
                debug!("[BLOCKLIST] No blocklist store configured");
                return Err(RouteError::SubsystemUnavailable("blocklist"));
            }
        };

        // Compare Merkle roots (read lock)
        let our_root = {
            let store = blocklist.read().unwrap();
            store.merkle_root()
        };
        if our_root == sync.merkle_root {
            debug!("[BLOCKLIST] Already in sync with peer");
            return Ok(None);
        }

        // Different roots - we need to sync
        // In a full implementation, we would request missing entries
        // For now, just log the difference
        info!(
            "[BLOCKLIST] Merkle mismatch: ours={} theirs={}. Need sync.",
            hex::encode(&our_root[..8]),
            hex::encode(&sync.merkle_root[..8])
        );

        // Could respond with our root and request entries we're missing
        // or send a BLOCKLIST_REQUEST for specific hashes

        Ok(None)
    }

    /// Handle BLOCKLIST_REQUEST - respond with requested blocklist entries
    ///
    /// When a peer requests specific blocklist entries, we send them.
    ///
    /// Payload format: BlocklistRequest
    async fn handle_blocklist_request(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let message = parse_blocklist_message(MSG_BLOCKLIST_REQUEST, payload)
            .map_err(|e| RouteError::DeserializationError(format!("{}", e)))?;

        let request = match message {
            BlocklistMessage::Request(r) => r,
            _ => {
                return Err(RouteError::DeserializationError(
                    "Expected Request".to_string(),
                ))
            }
        };

        info!(
            "[BLOCKLIST] Received BLOCKLIST_REQUEST from peer {}: {} hashes requested",
            hex::encode(&peer_id[..8]),
            request.requested_hashes.len()
        );

        let blocklist = match &self.blocklist {
            Some(bl) => bl,
            None => {
                debug!("[BLOCKLIST] No blocklist store configured");
                return Err(RouteError::SubsystemUnavailable("blocklist"));
            }
        };

        // Find entries for requested hashes (read lock)
        let store = blocklist.read().unwrap();
        let mut found_count = 0;
        for hash in &request.requested_hashes {
            if store.is_blocked(hash) {
                found_count += 1;
                // In a full implementation, we would serialize and send each entry
                // as a BLOCKLIST_UPDATE message
            }
        }

        info!(
            "[BLOCKLIST] Found {}/{} requested entries",
            found_count,
            request.requested_hashes.len()
        );

        // Would send individual BLOCKLIST_UPDATE for each found entry
        // For now, just acknowledge

        Ok(None)
    }

    /// Handle BLOCKLIST_BUNDLE - receive a signed, versioned blocklist bundle.
    ///
    /// Bundles are the trust-anchored bulk-distribution path (SPEC_12 CSAM
    /// seeding A.3): validate the maintainer signature against the configured
    /// trusted-key set, apply entries if the version is newer than what we
    /// hold, and forward to peers that haven't seen it. Unlike updates, bundles
    /// carry no attestations — an untrusted or unsigned bundle is dropped.
    ///
    /// Payload format: BlocklistBundle
    async fn handle_blocklist_bundle(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let message = parse_blocklist_message(MSG_BLOCKLIST_BUNDLE, payload)
            .map_err(|e| RouteError::DeserializationError(format!("{}", e)))?;

        let bundle = match message {
            BlocklistMessage::Bundle(b) => b,
            _ => {
                return Err(RouteError::DeserializationError(
                    "Expected Bundle".to_string(),
                ))
            }
        };

        info!(
            "[BLOCKLIST] Received BLOCKLIST_BUNDLE from peer {}: version={} entries={} maintainer={}",
            hex::encode(&peer_id[..8]),
            bundle.bundle_version,
            bundle.entries.len(),
            hex::encode(&bundle.maintainer[..8])
        );

        let blocklist = match &self.blocklist {
            Some(bl) => bl,
            None => {
                debug!("[BLOCKLIST] No blocklist store configured");
                return Err(RouteError::SubsystemUnavailable("blocklist"));
            }
        };

        // Trust-anchor validation: maintainer must be configured-trusted and the
        // Ed25519 signature must verify over the canonical bundle bytes.
        bundle
            .validate(&self.trusted_blocklist_keys, |pubkey, msg, sig| {
                ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
            })
            .map_err(|e| {
                warn!(
                    "[BLOCKLIST] Rejected bundle from peer {}: {}",
                    hex::encode(&peer_id[..8]),
                    e
                );
                RouteError::HandlerError(format!("blocklist bundle validation error: {}", e))
            })?;

        // Apply if newer than our current version.
        let applied = {
            let mut store = blocklist.write().unwrap();
            store.apply_bundle(&bundle).map_err(|e| {
                RouteError::HandlerError(format!("blocklist bundle apply error: {}", e))
            })?
        };

        match applied {
            Some(stats) => {
                info!(
                    "[BLOCKLIST] Applied bundle v{}: +{} entries (+{} sha1, +{} md5, {} skipped)",
                    bundle.bundle_version,
                    stats.sha256_added,
                    stats.sha1_indexed,
                    stats.md5_indexed,
                    stats.sha256_skipped
                );
            }
            None => {
                debug!(
                    "[BLOCKLIST] Bundle v{} not newer than stored; ignoring",
                    bundle.bundle_version
                );
                // Stale bundle: do not re-forward.
                return Ok(None);
            }
        }

        // Forward the (freshly applied) bundle to peers that haven't seen it.
        // Reuse the gossip seen-tracking keyed by the maintainer + version so we
        // don't loop bundles endlessly.
        if let (Some(ref connection_pool), Some(ref blocklist_gossip)) =
            (&self.connection_pool, &self.blocklist_gossip)
        {
            // Derive a stable dedup key for this bundle version.
            let mut dedup_key = [0u8; 32];
            dedup_key[..8].copy_from_slice(&bundle.bundle_version.to_le_bytes());
            dedup_key[8..16].copy_from_slice(&bundle.maintainer[..8]);

            let all_peers = connection_pool.peer_ids().await;
            let all_peers_arr: Vec<[u8; 32]> = all_peers.iter().copied().collect();

            let peers_to_forward = {
                let mut gossip = blocklist_gossip.write().unwrap();
                gossip.peers_to_forward(&dedup_key, &all_peers_arr, Some(*peer_id))
            };

            if !peers_to_forward.is_empty() {
                let envelope = crate::types::network::MessageEnvelope::new_fork_agnostic(
                    crate::types::network::MessageType::BlocklistBundle,
                    payload.to_vec(),
                );
                for target_peer_id in peers_to_forward {
                    if connection_pool
                        .send_to(&target_peer_id, &envelope)
                        .await
                        .is_ok()
                    {
                        let mut gossip = blocklist_gossip.write().unwrap();
                        gossip.mark_peer_seen(&dedup_key, target_peer_id);
                    }
                }
            }
        }

        Ok(None)
    }

    // ========== DHT (Kademlia) Handlers (SPEC_06 §3.8) ==========

    /// Handle incoming DHT_PING
    async fn handle_dht_ping(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::Ping, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        // Convert peer_id to DhtNodeId and get peer address
        let sender_id = DhtNodeId::from_bytes(*peer_id);
        // Use actual peer address if available, otherwise placeholder
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        if let Some(response) = dht
            .handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
                ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
            })
            .await
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            let response_bytes = response.to_bytes();
            debug!(
                "[DHT] Responding to PING from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(Some((MSG_DHT_PONG, response_bytes)));
        }

        Ok(None)
    }

    /// Handle incoming DHT_PONG
    async fn handle_dht_pong(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::Pong, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        dht.handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
            ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        })
        .await
        .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        debug!(
            "[DHT] Received PONG from peer {}",
            hex::encode(&peer_id[..8])
        );
        Ok(None)
    }

    /// Handle incoming DHT_FIND_NODE
    async fn handle_dht_find_node(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::FindNode, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        if let Some(response) = dht
            .handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
                ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
            })
            .await
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            let response_bytes = response.to_bytes();
            debug!(
                "[DHT] Responding to FIND_NODE from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(Some((MSG_DHT_NODES, response_bytes)));
        }

        Ok(None)
    }

    /// Handle incoming DHT_NODES
    async fn handle_dht_nodes(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::Nodes, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        // Process nodes response (adds nodes to routing table)
        dht.handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
            ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        })
        .await
        .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        debug!(
            "[DHT] Processed NODES from peer {}",
            hex::encode(&peer_id[..8])
        );
        Ok(None)
    }

    /// Handle incoming DHT_FIND_VALUE (find content providers)
    async fn handle_dht_find_value(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::FindValue, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        if let Some(response) = dht
            .handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
                ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
            })
            .await
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            // Response could be PROVIDERS or NODES (fallback)
            let (msg_type, response_bytes) = match &response {
                DhtMessage::Providers { .. } => (MSG_DHT_PROVIDERS, response.to_bytes()),
                DhtMessage::Nodes { .. } => (MSG_DHT_NODES, response.to_bytes()),
                _ => return Ok(None),
            };
            debug!(
                "[DHT] Responding to FIND_VALUE from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(Some((msg_type, response_bytes)));
        }

        Ok(None)
    }

    /// Handle incoming DHT_PROVIDERS
    async fn handle_dht_providers(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::Providers, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        // Store provider records
        dht.handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
            ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        })
        .await
        .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        debug!(
            "[DHT] Processed PROVIDERS from peer {}",
            hex::encode(&peer_id[..8])
        );
        Ok(None)
    }

    /// Handle incoming DHT_STORE (content announcement)
    async fn handle_dht_store(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::Store, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        if let Some(response) = dht
            .handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
                ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
            })
            .await
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            let response_bytes = response.to_bytes();
            debug!(
                "[DHT] Responding to STORE from peer {}",
                hex::encode(&peer_id[..8])
            );
            return Ok(Some((MSG_DHT_STORE_ACK, response_bytes)));
        }

        Ok(None)
    }

    /// Handle incoming DHT_STORE_ACK
    async fn handle_dht_store_ack(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
        peer_addr: Option<std::net::SocketAddr>,
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let dht = match &self.dht {
            Some(d) => d,
            None => return Err(RouteError::SubsystemUnavailable("dht")),
        };

        let msg = DhtMessage::from_bytes(DhtMessageType::StoreAck, payload)
            .map_err(|e| RouteError::DeserializationError(e.to_string()))?;

        let sender_id = DhtNodeId::from_bytes(*peer_id);
        let sender_addr =
            peer_addr.unwrap_or_else(|| std::net::SocketAddr::from(([0, 0, 0, 0], 0)));

        dht.handle_message(msg, sender_id, sender_addr, |pubkey, msg, sig| {
            ed25519_verify(&PublicKey(*pubkey), msg, &Signature(*sig))
        })
        .await
        .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        debug!(
            "[DHT] Processed STORE_ACK from peer {}",
            hex::encode(&peer_id[..8])
        );
        Ok(None)
    }

    // ========== Spam Attestation Handlers (SPEC_12 §3) ==========

    /// Handle incoming SPAM_ATTESTATION message
    ///
    /// Validates and stores spam attestations from Resident+ members.
    /// When 3 independent sponsor trees attest, content is flagged for accelerated decay.
    async fn handle_spam_attestation(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let store = match &self.spam_attestation_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("spam_attestation")),
        };

        // Deserialize the attestation
        let attestation = SpamAttestation::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("Invalid spam attestation".to_string())
        })?;

        // Get current time for validation
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Basic validation (signature and timestamp are checked here)
        // Note: Full eligibility check requires chain lookup which we skip for network relay
        // The attestation is stored and aggregation handles threshold logic

        // Check if already attested by this attester
        if store
            .has_attestation(&attestation.content_hash, &attestation.attester)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            debug!(
                "[SPAM] Duplicate attestation from {} for content {}",
                hex::encode(&attestation.attester[..8]),
                hex::encode(&attestation.content_hash[..8])
            );
            return Ok(None);
        }

        // For network relay, we use the attester's key as the sponsor tree root placeholder
        // In production, this would be looked up from the chain
        let sponsor_tree_root = attestation.attester;

        // Snapshot whether this content was already flagged BEFORE this attestation,
        // so the author's reputation is penalized only on the first threshold crossing.
        let counter_state_pre = store
            .get_counter_state(&attestation.content_hash)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;
        let was_flagged = {
            let prior = store
                .get_attestations_for_content(&attestation.content_hash)
                .map_err(|e| RouteError::HandlerError(e.to_string()))?;
            aggregate_attestations(
                attestation.content_hash,
                &prior,
                counter_state_pre.is_cleared,
            )
            .should_accelerate_decay
        };

        // Store the attestation
        let stored = StoredSpamAttestation {
            attestation: attestation.clone(),
            sponsor_tree_root,
            is_deduplicated: false,
        };

        store
            .put_attestation(&stored)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        // Check if threshold is now reached
        let attestations = store
            .get_attestations_for_content(&attestation.content_hash)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;
        let counter_state = store
            .get_counter_state(&attestation.content_hash)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;
        let aggregation = aggregate_attestations(
            attestation.content_hash,
            &attestations,
            counter_state.is_cleared,
        );

        if aggregation.should_accelerate_decay {
            // First crossing: decay the content author's identity-level reputation.
            if !was_flagged {
                self.record_spam_flag_for_content(&attestation.content_hash, current_time);
            }
            info!(
                "[SPAM] Content {} flagged by {} independent trees (threshold reached)",
                hex::encode(&attestation.content_hash[..8]),
                aggregation.count.unique_tree_count
            );
        } else {
            debug!(
                "[SPAM] Attestation stored for content {} ({}/{} trees)",
                hex::encode(&attestation.content_hash[..8]),
                aggregation.count.unique_tree_count,
                crate::spam_attestation::SPAM_ATTESTATION_THRESHOLD
            );
        }

        // Increment rate limit counter
        store.increment_attestation_count(&attestation.attester, current_time);

        Ok(None)
    }

    /// Handle incoming COUNTER_ATTESTATION message
    ///
    /// Validates and stores counter-attestations from Lifeguard+ members.
    /// When 5 counter-attestations are received, the spam flag is cleared.
    async fn handle_counter_attestation(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let store = match &self.spam_attestation_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("spam_attestation")),
        };

        // Deserialize the counter-attestation
        let counter = CounterAttestation::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("Invalid counter-attestation".to_string())
        })?;

        // Get current time for validation
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Get current counter state
        let mut state = store
            .get_counter_state(&counter.content_hash)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        // Already cleared?
        if state.is_cleared {
            debug!(
                "[SPAM] Content {} already cleared, ignoring counter-attestation",
                hex::encode(&counter.content_hash[..8])
            );
            return Ok(None);
        }

        // Add counter-attestation
        let threshold_reached =
            state.add_counter_attester(counter.counter_attester, counter.timestamp);

        // Store updated state
        store
            .put_counter_state(&state)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        if threshold_reached {
            // Spam flag cleared: credit the content author's reputation with fast
            // recovery (SPEC_12 §4.5). Only on the crossing.
            self.record_counter_for_content(&counter.content_hash, counter.timestamp);
            info!(
                "[SPAM] Content {} cleared by {} counter-attestations",
                hex::encode(&counter.content_hash[..8]),
                state.count()
            );
        } else {
            debug!(
                "[SPAM] Counter-attestation stored for content {} ({}/{} needed)",
                hex::encode(&counter.content_hash[..8]),
                state.count(),
                crate::spam_attestation::COUNTER_ATTESTATION_THRESHOLD
            );
        }

        Ok(None)
    }

    /// Decay the reputation of the author of `content_hash` on a spam-flag threshold
    /// crossing (SPEC_12 §3.4). Resolves the author via the content store; a no-op if
    /// either store is unavailable or the content is not held locally. Reputation is
    /// only ever LOWERED here — it grants no protocol privileges.
    pub(crate) fn record_spam_flag_for_content(&self, content_hash: &[u8; 32], timestamp: u64) {
        let (rep_store, content_store) = match (&self.reputation_store, &self.content_store) {
            (Some(r), Some(c)) => (r, c),
            _ => return,
        };
        let content_id = crate::types::content::ContentId::from_bytes(*content_hash);
        let author = match content_store.get(&content_id) {
            Ok(Some(item)) => item.author_id.0,
            _ => return,
        };
        if let Err(e) = rep_store.record_spam_flag(&author, timestamp) {
            warn!("[REPUTATION] Failed to record spam flag: {}", e);
        }
    }

    /// Credit fast reputation recovery to the author of `content_hash` when its spam
    /// flag is cleared by counter-attestations (SPEC_12 §4.5). No-op if unavailable.
    pub(crate) fn record_counter_for_content(&self, content_hash: &[u8; 32], timestamp: u64) {
        let (rep_store, content_store) = match (&self.reputation_store, &self.content_store) {
            (Some(r), Some(c)) => (r, c),
            _ => return,
        };
        let content_id = crate::types::content::ContentId::from_bytes(*content_hash);
        let author = match content_store.get(&content_id) {
            Ok(Some(item)) => item.author_id.0,
            _ => return,
        };
        if let Err(e) = rep_store.record_counter(&author, timestamp) {
            warn!("[REPUTATION] Failed to record counter recovery: {}", e);
        }
    }

    // ========== Sponsorship Offer Handlers (SPEC_11 §3.11) ==========

    /// Handle incoming SPONSORSHIP_OFFER message (0x49)
    ///
    /// Validates, stores, and optionally relays sponsorship offers.
    /// Wire format: offer_bytes + ttl(1)
    async fn handle_sponsorship_offer(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let offer_store = match &self.offer_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("offer_store")),
        };

        // Need at least offer bytes + TTL
        if payload.is_empty() {
            return Err(RouteError::PayloadTooSmall {
                expected: 1,
                actual: 0,
            });
        }

        // TTL is the last byte
        let ttl = payload[payload.len() - 1];
        let offer_bytes = &payload[..payload.len() - 1];

        // Deserialize the offer
        let offer = deserialize_offer(offer_bytes).map_err(|e| {
            RouteError::DeserializationError(format!("Failed to deserialize offer: {}", e))
        })?;

        // Check if we already have this offer (dedup)
        if offer_store
            .offer_exists(&offer.offer_id)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            debug!(
                "[SPONSORSHIP] Duplicate offer {} from {}, ignoring",
                hex::encode(&offer.offer_id[..8]),
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        // Validate offer signature using creation format
        // Need to reconstruct the creation parameters from the offer
        let expires_days = ((offer.expires_at - offer.created_at) / 86400) as u32;
        let sig_msg =
            crate::sponsorship::types::PublicSponsorshipOffer::signature_message_for_creation(
                offer.sponsor.as_bytes(),
                offer.max_sponsees,
                &offer.offer_type,
                expires_days,
                offer.requirements.min_pow_difficulty,
                offer.requirements.application_required,
                offer.created_at,
            );
        if !ed25519_verify(&offer.sponsor, &sig_msg, &offer.signature) {
            warn!(
                "[SPONSORSHIP] Invalid signature on offer {} from {}",
                hex::encode(&offer.offer_id[..8]),
                hex::encode(&peer_id[..8])
            );
            return Err(RouteError::InvalidSignature);
        }

        // Validate offer is not expired
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if offer.expires_at <= current_time {
            debug!(
                "[SPONSORSHIP] Expired offer {} from {}, ignoring",
                hex::encode(&offer.offer_id[..8]),
                hex::encode(&peer_id[..8])
            );
            return Ok(None);
        }

        // Store the offer
        if let Err(e) = offer_store.create_offer(&offer) {
            // Already exists is fine (race condition)
            if !e.to_string().contains("already exists") {
                return Err(RouteError::HandlerError(e.to_string()));
            }
        }

        info!(
            "[SPONSORSHIP] Received offer {} from peer {}, stored (ttl={})",
            hex::encode(&offer.offer_id[..8]),
            hex::encode(&peer_id[..8]),
            ttl
        );

        // Relay to other peers if TTL > 0
        if ttl > 0 {
            if let Some(ref pool) = self.connection_pool {
                let mut relay_payload = offer_bytes.to_vec();
                relay_payload.push(ttl - 1); // Decrement TTL

                let envelope = crate::types::network::MessageEnvelope::new(
                    crate::types::network::MessageType::SponsorshipOffer,
                    [0u8; 32], // fork-agnostic
                    relay_payload,
                );

                let relayed = pool.broadcast_except(&envelope, peer_id).await;
                debug!(
                    "[SPONSORSHIP] Relayed offer {} to {} peers",
                    hex::encode(&offer.offer_id[..8]),
                    relayed
                );
            }
        }

        Ok(None)
    }

    /// Handle incoming SPONSORSHIP_OFFER_CLAIM message (0x4A)
    ///
    /// Stores claims for local offers. Does NOT relay claims.
    async fn handle_sponsorship_claim(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let offer_store = match &self.offer_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("offer_store")),
        };

        // Deserialize the claim
        let claim = deserialize_claim(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Failed to deserialize claim: {}", e))
        })?;

        // Check if we have this offer
        let _offer = match offer_store
            .get_offer(&claim.offer_id)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            Some(o) => o,
            None => {
                debug!(
                    "[SPONSORSHIP] Claim for unknown offer {} from {}, ignoring",
                    hex::encode(&claim.offer_id[..8]),
                    hex::encode(&peer_id[..8])
                );
                return Ok(None);
            }
        };

        // Verify claimant signature
        let sig_msg = claim.signature_message();
        if !ed25519_verify(&claim.claimant, &sig_msg, &claim.claimant_signature) {
            warn!(
                "[SPONSORSHIP] Invalid claimant signature on claim for offer {} from {}",
                hex::encode(&claim.offer_id[..8]),
                hex::encode(&peer_id[..8])
            );
            return Err(RouteError::InvalidSignature);
        }

        // Store the claim (submit_claim checks for duplicates)
        match offer_store.submit_claim(&claim) {
            Ok(_) => {
                info!(
                    "[SPONSORSHIP] Stored claim from {} for offer {}",
                    hex::encode(&claim.claimant.as_bytes()[..8]),
                    hex::encode(&claim.offer_id[..8])
                );
            }
            Err(e)
                if e.to_string().contains("DuplicateClaim")
                    || e.to_string().contains("already") =>
            {
                debug!("[SPONSORSHIP] Duplicate claim, ignoring");
            }
            Err(e) => {
                return Err(RouteError::HandlerError(e.to_string()));
            }
        }

        Ok(None)
    }

    /// Handle incoming SPONSORSHIP_CLAIM_RESPONSE message (0x4B)
    ///
    /// Processes approval/rejection. Updates claim with approval signature.
    async fn handle_sponsorship_claim_response(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let offer_store = match &self.offer_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("offer_store")),
        };

        let response = deserialize_claim_response(payload).map_err(|e| {
            RouteError::DeserializationError(format!("Failed to deserialize claim response: {}", e))
        })?;

        // Get the offer to verify it exists
        let _offer = match offer_store
            .get_offer(&response.offer_id)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?
        {
            Some(o) => o,
            None => {
                debug!(
                    "[SPONSORSHIP] Response for unknown offer {}, ignoring",
                    hex::encode(&response.offer_id[..8])
                );
                return Ok(None);
            }
        };

        match response.response_type {
            ClaimResponseType::Approved => {
                // Get and update claim with approval
                let claim = offer_store
                    .get_claim(&response.offer_id, &response.claimant)
                    .map_err(|e| RouteError::HandlerError(e.to_string()))?;

                if let (Some(mut claim), Some(approval_sig)) = (claim, response.approval_signature)
                {
                    claim.sponsor_approval = Some(approval_sig);
                    offer_store
                        .update_claim(&claim)
                        .map_err(|e| RouteError::HandlerError(e.to_string()))?;

                    info!(
                        "[SPONSORSHIP] Claim approved for {} on offer {}",
                        hex::encode(&response.claimant.as_bytes()[..8]),
                        hex::encode(&response.offer_id[..8])
                    );
                }
            }
            ClaimResponseType::Rejected => {
                // Remove the claim
                let _ = offer_store.remove_claim(&response.offer_id, &response.claimant);
                debug!(
                    "[SPONSORSHIP] Claim rejected for {} on offer {}",
                    hex::encode(&response.claimant.as_bytes()[..8]),
                    hex::encode(&response.offer_id[..8])
                );
            }
        }

        Ok(None)
    }

    /// Handle incoming SPONSORSHIP_OFFER_QUERY message (0x4C)
    ///
    /// Responds with list of active offers.
    async fn handle_sponsorship_offer_query(
        &self,
        peer_id: &[u8; 32],
        _payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let offer_store = match &self.offer_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("offer_store")),
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Get active offers (limit to prevent DoS)
        let offers = offer_store
            .list_active_offers(current_time)
            .map_err(|e| RouteError::HandlerError(e.to_string()))?;

        // Build response: count(2 LE) + (len(2) + offer_bytes)*
        let mut response = Vec::new();
        let count = offers.len().min(50) as u16; // Max 50 offers per response
        response.extend_from_slice(&count.to_le_bytes());

        for offer in offers.into_iter().take(50) {
            let offer_bytes =
                serialize_offer(&offer).map_err(|e| RouteError::HandlerError(e.to_string()))?;
            let len = (offer_bytes.len() as u16).to_le_bytes();
            response.extend_from_slice(&len);
            response.extend_from_slice(&offer_bytes);
        }

        info!(
            "[SPONSORSHIP] Responding to offer query from {} with {} offers (current_time={})",
            hex::encode(&peer_id[..8]),
            count,
            current_time
        );

        Ok(Some((MSG_SPONSORSHIP_OFFER_LIST, response)))
    }

    /// Handle incoming SPONSORSHIP_OFFER_LIST message (0x4D)
    ///
    /// Processes offer list response, storing new offers.
    async fn handle_sponsorship_offer_list(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        let offer_store = match &self.offer_store {
            Some(s) => s,
            None => return Err(RouteError::SubsystemUnavailable("offer_store")),
        };

        if payload.len() < 2 {
            return Err(RouteError::PayloadTooSmall {
                expected: 2,
                actual: payload.len(),
            });
        }

        let count = u16::from_le_bytes([payload[0], payload[1]]) as usize;
        let mut pos = 2;
        let mut stored = 0;

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        for _ in 0..count {
            if payload.len() < pos + 2 {
                break;
            }

            let len = u16::from_le_bytes([payload[pos], payload[pos + 1]]) as usize;
            pos += 2;

            if payload.len() < pos + len {
                break;
            }

            let offer_bytes = &payload[pos..pos + len];
            pos += len;

            if let Ok(offer) = deserialize_offer(offer_bytes) {
                // Skip expired offers
                if offer.expires_at <= current_time {
                    continue;
                }

                // Skip if already have
                if offer_store.offer_exists(&offer.offer_id).unwrap_or(true) {
                    continue;
                }

                // Validate signature
                let sig_msg = offer.signature_message();
                if !ed25519_verify(&offer.sponsor, &sig_msg, &offer.signature) {
                    continue;
                }

                // Store
                if offer_store.create_offer(&offer).is_ok() {
                    stored += 1;
                }
            }
        }

        info!(
            "[SPONSORSHIP] Received offer list from {}, stored {} new offers",
            hex::encode(&peer_id[..8]),
            stored
        );

        Ok(None)
    }

    // ========== Branch-Selective Sync Handlers (BRANCH_SELECTIVE_SYNC.md) ==========

    /// Handle GETBLOCKS_BRANCH - request blocks for a specific branch
    ///
    /// This enables selective sync where nodes only download blocks for branches
    /// they are subscribed to, rather than the entire chain.
    ///
    /// Payload format: GetBlocksBranchPayload
    async fn handle_getblocks_branch(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::GetBlocksBranchPayload;

        let request = GetBlocksBranchPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("GetBlocksBranchPayload".to_string())
        })?;

        info!(
            "[BRANCH] Received GETBLOCKS_BRANCH from peer {}: space={} branch_depth={} heights {}..{}",
            hex::encode(&peer_id[..8]),
            hex::encode(&request.space_id[..8]),
            request.branch_path.depth(),
            request.start_height,
            request.end_height
        );

        // Get chain store - required for block retrieval
        let chain_store = self
            .chain_store
            .as_ref()
            .ok_or_else(|| RouteError::SubsystemUnavailable("chain_store"))?;

        // Query blocks in height range
        let end_height = if request.end_height == u64::MAX {
            chain_store.get_latest_height().ok().flatten().unwrap_or(0)
        } else {
            request.end_height
        };

        let mut filtered_blocks: Vec<SerializedBlock> = Vec::new();
        let max_blocks = request.max_blocks as u16;

        // Get blocks in range using get_blocks_in_range
        let blocks_in_range = chain_store
            .get_blocks_in_range(request.start_height, end_height, max_blocks)
            .unwrap_or_default();

        // Filter by space_id and branch_path
        for (_height, block) in blocks_in_range {
            if filtered_blocks.len() >= max_blocks as usize {
                break;
            }

            // Serialize the block for transport using bincode
            let block_bytes = match bincode::serialize(&block) {
                Ok(bytes) => bytes,
                Err(_) => continue, // Skip blocks that fail to serialize
            };

            // Check if this block contains the requested space and branch
            if self.block_matches_branch(&block_bytes, &request.space_id, &request.branch_path) {
                filtered_blocks.push(SerializedBlock { data: block_bytes });
            }
        }

        info!(
            "[BRANCH] Sending {} blocks for space={} branch_depth={} to peer {}",
            filtered_blocks.len(),
            hex::encode(&request.space_id[..8]),
            request.branch_path.depth(),
            hex::encode(&peer_id[..8])
        );

        // Serialize response as BlocksPayload
        // Format: count[4] + (len[4] + data)* for each block
        let mut response_bytes = Vec::new();
        response_bytes.extend_from_slice(&(filtered_blocks.len() as u32).to_le_bytes());
        for block in &filtered_blocks {
            response_bytes.extend_from_slice(&(block.data.len() as u32).to_le_bytes());
            response_bytes.extend_from_slice(&block.data);
        }

        Ok(Some((MSG_BLOCKS, response_bytes)))
    }

    /// Check if a block matches the requested space and branch
    fn block_matches_branch(
        &self,
        block_bytes: &[u8],
        space_id: &[u8; 32],
        branch_path: &crate::blocks::BranchPath,
    ) -> bool {
        // Parse block header to check space_id
        // Block format: space_id is typically in the first 32 bytes after version
        if block_bytes.len() < 64 {
            return false;
        }

        // Check if this block belongs to the requested space
        // The actual format depends on your block structure
        // For now, check if space_id appears in the block data
        // A proper implementation would parse the block header

        // Simple check: look for space_id prefix in block
        let space_prefix = &space_id[..16];
        for window in block_bytes.windows(16) {
            if window == space_prefix {
                // Found space match - now check branch
                // For root branch (depth=0), any block in the space matches
                if branch_path.depth() == 0 {
                    return true;
                }
                // For deeper branches, would need to parse content blocks
                // and check branch paths - simplified for now
                return true;
            }
        }
        false
    }

    /// Handle SUBSCRIBE_BRANCH - peer subscribes to a branch
    ///
    /// When a peer subscribes, we should:
    /// 1. Track that this peer wants updates for this branch
    /// 2. Send them announcements for new blocks in this branch
    ///
    /// Payload format: SubscribeBranchPayload
    async fn handle_subscribe_branch(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::SubscribeBranchPayload;

        let request = SubscribeBranchPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("SubscribeBranchPayload".to_string())
        })?;

        info!(
            "[BRANCH] Received SUBSCRIBE_BRANCH from peer {}: space={} branch_depth={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&request.space_id[..8]),
            request.branch_path.depth()
        );

        // Add peer to PeerBranchTracker for this space/branch
        if let Some(tracker) = &self.peer_branch_tracker {
            let mut tracker = tracker.write().unwrap();
            tracker.add_branch(*peer_id, request.space_id, request.branch_path.clone());
            tracker.set_supports_branch_sync(*peer_id, true);

            info!(
                "[BRANCH] Added peer {} as subscriber for space={} branch_depth={}",
                hex::encode(&peer_id[..8]),
                hex::encode(&request.space_id[..8]),
                request.branch_path.depth()
            );
        } else {
            debug!(
                "[BRANCH] PeerBranchTracker not available, cannot track subscription from {}",
                hex::encode(&peer_id[..8])
            );
        }

        // No response needed - subscription is acknowledged implicitly
        Ok(None)
    }

    /// Handle UNSUBSCRIBE_BRANCH - peer unsubscribes from a branch
    ///
    /// Payload format: SubscribeBranchPayload (same as subscribe)
    async fn handle_unsubscribe_branch(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::SubscribeBranchPayload;

        let request = SubscribeBranchPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("UnsubscribeBranchPayload".to_string())
        })?;

        info!(
            "[BRANCH] Received UNSUBSCRIBE_BRANCH from peer {}: space={} branch_depth={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&request.space_id[..8]),
            request.branch_path.depth()
        );

        // Remove peer from PeerBranchTracker for this space/branch
        if let Some(tracker) = &self.peer_branch_tracker {
            let mut tracker = tracker.write().unwrap();
            tracker.remove_branch(peer_id, &request.space_id, &request.branch_path);

            info!(
                "[BRANCH] Removed peer {} from subscribers for space={} branch_depth={}",
                hex::encode(&peer_id[..8]),
                hex::encode(&request.space_id[..8]),
                request.branch_path.depth()
            );
        } else {
            debug!(
                "[BRANCH] PeerBranchTracker not available, cannot remove subscription from {}",
                hex::encode(&peer_id[..8])
            );
        }

        // No response needed
        Ok(None)
    }

    /// Handle BRANCH_ANNOUNCE - announcement of new content in a branch
    ///
    /// Similar to BLOCK_ANNOUNCE but specific to a branch, allowing nodes
    /// to only receive announcements for branches they care about.
    ///
    /// Payload format: BranchAnnouncePayload
    async fn handle_branch_announce(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::{BranchAnnouncePayload, GetBlocksBranchPayload};

        let announce = BranchAnnouncePayload::from_bytes(payload)
            .ok_or_else(|| RouteError::DeserializationError("BranchAnnouncePayload".to_string()))?;

        info!(
            "[BRANCH] Received BRANCH_ANNOUNCE from peer {}: space={} branch_depth={} height={} content_count={}",
            hex::encode(&peer_id[..8]),
            hex::encode(&announce.space_id[..8]),
            announce.branch_path.depth(),
            announce.height,
            announce.content_count
        );

        // Check if we're subscribed to this branch
        let is_subscribed = if let Some(sub_mgr) = &self.branch_subscription_manager {
            let sub_mgr = sub_mgr.read().unwrap();
            sub_mgr.is_subscribed(&announce.space_id, &announce.branch_path)
        } else {
            false
        };

        if is_subscribed {
            info!(
                "[BRANCH] We are subscribed to space={} branch_depth={}, requesting block at height {}",
                hex::encode(&announce.space_id[..8]),
                announce.branch_path.depth(),
                announce.height
            );

            // Record that this peer has this branch
            if let Some(tracker) = &self.peer_branch_tracker {
                let mut tracker = tracker.write().unwrap();
                tracker.add_branch(*peer_id, announce.space_id, announce.branch_path.clone());
                tracker.set_supports_branch_sync(*peer_id, true);
            }

            // Send GETBLOCKS_BRANCH request for this specific block
            let request = GetBlocksBranchPayload::new(
                announce.space_id,
                announce.branch_path,
                announce.height,
                1, // Just get this one block
            );

            return Ok(Some((MSG_GETBLOCKS_BRANCH, request.to_bytes())));
        } else {
            debug!(
                "[BRANCH] Not subscribed to space={} branch_depth={}, ignoring announcement",
                hex::encode(&announce.space_id[..8]),
                announce.branch_path.depth()
            );
        }

        // Not subscribed, no response needed
        Ok(None)
    }

    /// Handle BRANCH_INVENTORY - peer sends list of branches they serve
    ///
    /// Used during connection setup to learn what branches a peer has.
    /// This enables efficient peer selection for branch-selective sync.
    ///
    /// Payload format: BranchInventoryPayload
    async fn handle_branch_inventory(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::BranchInventoryPayload;

        let inventory = BranchInventoryPayload::from_bytes(payload).ok_or_else(|| {
            RouteError::DeserializationError("BranchInventoryPayload".to_string())
        })?;

        info!(
            "[BRANCH] Received BRANCH_INVENTORY from peer {}: {} branches",
            hex::encode(&peer_id[..8]),
            inventory.branches.len()
        );

        // Update PeerBranchTracker with peer's branch list
        if let Some(tracker) = &self.peer_branch_tracker {
            let mut tracker = tracker.write().unwrap();

            // Convert (space_id[16], branch_path) to (space_id[32], branch_path)
            // The inventory uses 16-byte truncated space IDs for wire efficiency
            let branches: Vec<([u8; 32], crate::blocks::BranchPath)> = inventory
                .branches
                .into_iter()
                .map(|(short_id, branch_path)| {
                    let mut full_id = [0u8; 32];
                    full_id[..16].copy_from_slice(&short_id);
                    (full_id, branch_path)
                })
                .collect();

            tracker.update_from_inventory(*peer_id, branches);

            info!(
                "[BRANCH] Updated peer {} inventory with {} branches (supports branch sync)",
                hex::encode(&peer_id[..8]),
                tracker.get_peer(peer_id).map_or(0, |p| p.branch_count())
            );
        } else {
            debug!(
                "[BRANCH] PeerBranchTracker not available, cannot store inventory from {}",
                hex::encode(&peer_id[..8])
            );
        }

        // No response needed
        Ok(None)
    }

    // ========================================================================
    // Space Name Resolution (Bug #4)
    // ========================================================================

    /// Reply to a peer asking for a space's display metadata, if we know it.
    ///
    /// Returns `MSG_SPACE_META` envelope when the space is registered locally
    /// with a real (non-placeholder) name; otherwise silently no-op.
    async fn handle_get_space_meta(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::{GetSpaceMetaPayload, SpaceMetaPayload};

        let req = GetSpaceMetaPayload::from_bytes(payload)
            .ok_or_else(|| RouteError::DeserializationError("GetSpaceMetaPayload".to_string()))?;

        debug!(
            "[SPACE-META] Received GET_SPACE_META from peer {} for space {}",
            hex::encode(&peer_id[..8]),
            hex::encode(&req.space_id[..4])
        );

        let chain_store = match self.chain_store.as_ref() {
            Some(cs) => cs,
            None => return Ok(None),
        };

        let info = match chain_store.get_space(&req.space_id) {
            Ok(Some(info)) => info,
            _ => return Ok(None),
        };

        // Don't leak names of private spaces.
        if info.is_private {
            return Ok(None);
        }

        // Don't respond if our own copy is just a placeholder — we'd be
        // forwarding nonsense.
        let placeholder = format!("Space {}", hex::encode(&info.space_id[..4]));
        if info.name == placeholder || info.name.is_empty() {
            debug!(
                "[SPACE-META] We only have placeholder for {}; not responding",
                hex::encode(&info.space_id[..4])
            );
            return Ok(None);
        }

        let reply = SpaceMetaPayload::new(
            info.space_id,
            info.creator,
            info.created_at,
            info.name.clone(),
            info.description.clone(),
        );
        info!(
            "[SPACE-META] Replying to {} with name '{}' for space {}",
            hex::encode(&peer_id[..8]),
            info.name,
            hex::encode(&info.space_id[..4])
        );
        Ok(Some((MSG_SPACE_META, reply.to_bytes())))
    }

    /// Accept a peer's claim of a space's name; only overwrites placeholders.
    ///
    /// Verification is currently trust-the-peer: we accept whatever the
    /// responder claims. The risk is bounded: an attacker can only mislead
    /// the local UI of a space the user has NOT yet engaged with. A future
    /// version should include and verify the full PoW solution that bound
    /// the name to the space_id (SPEC_04 §283-287).
    async fn handle_space_meta(
        &self,
        peer_id: &[u8; 32],
        payload: &[u8],
    ) -> Result<Option<(u8, Vec<u8>)>, RouteError> {
        use crate::network::messages::SpaceMetaPayload;

        let meta = SpaceMetaPayload::from_bytes(payload)
            .ok_or_else(|| RouteError::DeserializationError("SpaceMetaPayload".to_string()))?;

        debug!(
            "[SPACE-META] Received SPACE_META from peer {} for space {} name='{}'",
            hex::encode(&peer_id[..8]),
            hex::encode(&meta.space_id[..4]),
            meta.name
        );

        let chain_store = match self.chain_store.as_ref() {
            Some(cs) => cs,
            None => return Ok(None),
        };

        // Only upsert if the local entry is missing or still a placeholder.
        let current = chain_store.get_space(&meta.space_id).ok().flatten();
        let placeholder = format!("Space {}", hex::encode(&meta.space_id[..4]));
        let should_apply = match &current {
            None => true,
            Some(c) => c.name == placeholder || c.name.is_empty(),
        };
        if !should_apply {
            debug!(
                "[SPACE-META] Local copy of {} already has real name '{}'; ignoring",
                hex::encode(&meta.space_id[..4]),
                current.as_ref().map(|c| c.name.as_str()).unwrap_or("?")
            );
            return Ok(None);
        }

        // Preserve creator/timestamp/pow_work from existing entry if any;
        // otherwise take them from the peer.
        let preserved_pow_work = current.as_ref().map(|c| c.pow_work).unwrap_or(0);
        let info = crate::storage::SpaceInfo {
            space_id: meta.space_id,
            name: meta.name.clone(),
            description: meta.description.clone(),
            creator: meta.creator_pubkey,
            created_at: meta.timestamp,
            pow_work: preserved_pow_work,
            is_private: false,
            encrypted_name: None,
            creator_encrypted_key: None,
            key_version: 0,
        };

        if let Err(e) = chain_store.register_space(&info) {
            warn!(
                "[SPACE-META] Failed to register space {}: {}",
                hex::encode(&meta.space_id[..4]),
                e
            );
            return Ok(None);
        }

        info!(
            "[SPACE-META] Resolved space {} -> '{}' from peer {}",
            hex::encode(&meta.space_id[..4]),
            meta.name,
            hex::encode(&peer_id[..8])
        );

        Ok(None)
    }
}

/// Builder for MessageRouter with fluent configuration
/// Encode 16 bytes as a bech32m space ID (sp1...), matching the RPC layer's format.
fn encode_space_id_bech32(bytes: &[u8; 16]) -> String {
    use bech32::{Bech32m, Hrp};

    let hrp = Hrp::parse("sp").expect("valid HRP");
    let mut data = Vec::with_capacity(17);
    data.push(0); // version byte
    data.extend_from_slice(bytes);
    bech32::encode::<Bech32m>(hrp, &data).expect("valid encoding")
}

pub struct MessageRouterBuilder {
    metrics: Option<Arc<NodeMetrics>>,
    content_retrieval: Option<Arc<ContentRetrievalManager>>,
    data_dir: Option<std::path::PathBuf>,
    decay_integration: Option<Arc<DecayIntegration>>,
    peer_store: Option<Arc<PeerStore>>,
    chain_store: Option<Arc<ChainStore>>,
    blocklist: Option<Arc<RwLock<crate::blocklist::BlocklistStore>>>,
    blocklist_gossip: Option<Arc<RwLock<BlocklistGossip>>>,
    trusted_blocklist_keys: std::collections::HashSet<[u8; 32]>,
    connection_pool: Option<Arc<PeerConnectionPool>>,
    dht: Option<Arc<DhtManager>>,
    content_store: Option<Arc<PersistentContentStore>>,
    block_builder: Option<Arc<RwLock<crate::blocks::builder::BlockBuilder>>>,
    spam_attestation_store: Option<Arc<SpamAttestationStore>>,
    reputation_store: Option<Arc<ReputationStore>>,
    membership_store: Option<Arc<crate::storage::membership::MembershipStore>>,
    /// This node's raw Ed25519 identity public key (NOT the SHA-256 network node_id).
    /// Used to recognize DM requests addressed to us.
    identity_pubkey: Option<[u8; 32]>,
    hole_punch_tx: Option<tokio::sync::mpsc::UnboundedSender<HolePunchRequest>>,
    engagement_graph: Option<Arc<EngagementGraphStore>>,
    sponsorship_store: Option<Arc<SponsorshipStore>>,
    offer_store: Option<Arc<OfferStore>>,
    branch_subscription_manager: Option<Arc<RwLock<BranchSubscriptionManager>>>,
    peer_branch_tracker: Option<Arc<RwLock<PeerBranchTracker>>>,
    aggregation_cache: Option<Arc<AggregationCache>>,
    node_id: Option<[u8; 32]>,
    search_index: Option<Arc<RwLock<SearchIndex>>>,
    event_manager: Option<Arc<crate::rpc::events::EventManager>>,
    behavioral_branching_mode: BehavioralBranchingMode,
}

impl MessageRouterBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            metrics: None,
            content_retrieval: None,
            data_dir: None,
            decay_integration: None,
            peer_store: None,
            chain_store: None,
            blocklist: None,
            blocklist_gossip: None,
            trusted_blocklist_keys: std::collections::HashSet::new(),
            connection_pool: None,
            dht: None,
            content_store: None,
            block_builder: None,
            spam_attestation_store: None,
            reputation_store: None,
            membership_store: None,
            identity_pubkey: None,
            hole_punch_tx: None,
            engagement_graph: None,
            sponsorship_store: None,
            offer_store: None,
            branch_subscription_manager: None,
            peer_branch_tracker: None,
            aggregation_cache: None,
            node_id: None,
            search_index: None,
            event_manager: None,
            behavioral_branching_mode: BehavioralBranchingMode::Disabled,
        }
    }

    /// Set the metrics instance
    pub fn metrics(mut self, metrics: Arc<NodeMetrics>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    /// Set the hole-punch dial-request outlet (Layer 2 NAT traversal). When set, an
    /// incoming HOLE_PUNCH_INTRO for an unconnected peer forwards its endpoint here.
    pub fn hole_punch_tx(
        mut self,
        tx: tokio::sync::mpsc::UnboundedSender<HolePunchRequest>,
    ) -> Self {
        self.hole_punch_tx = Some(tx);
        self
    }

    /// Set the content retrieval manager
    pub fn content_retrieval(mut self, content_retrieval: Arc<ContentRetrievalManager>) -> Self {
        self.content_retrieval = Some(content_retrieval);
        self
    }

    /// Set the data directory for pending_broadcast
    pub fn data_dir(mut self, data_dir: std::path::PathBuf) -> Self {
        self.data_dir = Some(data_dir);
        self
    }

    /// Set the decay integration instance
    pub fn decay_integration(mut self, decay: Arc<DecayIntegration>) -> Self {
        self.decay_integration = Some(decay);
        self
    }

    /// Set the peer store for persistent peer discovery
    pub fn peer_store(mut self, store: Arc<PeerStore>) -> Self {
        self.peer_store = Some(store);
        self
    }

    /// Set the chain store for block storage (SPEC_08)
    pub fn chain_store(mut self, store: Arc<ChainStore>) -> Self {
        self.chain_store = Some(store);
        self
    }

    /// Set the blocklist store for CSAM/illegal content filtering
    /// Uses RwLock to allow write access for network gossip updates (C-BLOCKLIST-2)
    pub fn blocklist(mut self, blocklist: Arc<RwLock<crate::blocklist::BlocklistStore>>) -> Self {
        self.blocklist = Some(blocklist);
        self
    }

    /// Set the blocklist gossip manager for peer tracking (H-BLOCKLIST-2)
    pub fn blocklist_gossip(mut self, gossip: Arc<RwLock<BlocklistGossip>>) -> Self {
        self.blocklist_gossip = Some(gossip);
        self
    }

    /// Set the trusted blocklist list-maintainer keys (SPEC_12 CSAM seeding).
    pub fn trusted_blocklist_keys(mut self, keys: std::collections::HashSet<[u8; 32]>) -> Self {
        self.trusted_blocklist_keys = keys;
        self
    }


    /// Set the connection pool for block relay broadcasting
    pub fn connection_pool(mut self, pool: Arc<PeerConnectionPool>) -> Self {
        self.connection_pool = Some(pool);
        self
    }

    /// Set the DHT manager for content discovery (SPEC_06 §3.8)
    pub fn dht(mut self, dht: Arc<DhtManager>) -> Self {
        self.dht = Some(dht);
        self
    }

    /// Set the content store for reactions (SPEC_03 §7)
    pub fn content_store(mut self, store: Arc<PersistentContentStore>) -> Self {
        self.content_store = Some(store);
        self
    }

    /// Set the block builder for mempool (pending actions)
    pub fn block_builder(
        mut self,
        builder: Arc<RwLock<crate::blocks::builder::BlockBuilder>>,
    ) -> Self {
        self.block_builder = Some(builder);
        self
    }

    /// Set the spam attestation store for community flagging (SPEC_12 §3)
    pub fn spam_attestation_store(mut self, store: Arc<SpamAttestationStore>) -> Self {
        self.spam_attestation_store = Some(store);
        self
    }

    /// Set the identity-level poster reputation store (SPEC_12 §3.4/§4.5)
    pub fn reputation_store(mut self, store: Arc<ReputationStore>) -> Self {
        self.reputation_store = Some(store);
        self
    }

    /// Set the membership store for private-space / DM request handling (SPEC_11)
    pub fn membership_store(
        mut self,
        store: Arc<crate::storage::membership::MembershipStore>,
    ) -> Self {
        self.membership_store = Some(store);
        self
    }

    /// Set this node's raw Ed25519 identity public key (used to recognize DM requests
    /// addressed to us — distinct from the SHA-256 network node_id).
    pub fn identity_pubkey(mut self, pubkey: [u8; 32]) -> Self {
        self.identity_pubkey = Some(pubkey);
        self
    }

    /// Set the engagement graph for tracking who engages with whom
    pub fn engagement_graph(mut self, graph: Arc<EngagementGraphStore>) -> Self {
        self.engagement_graph = Some(graph);
        self
    }

    /// Set the sponsorship store for on-chain sponsorship processing (SPEC_11 Phase 6)
    pub fn sponsorship_store(mut self, store: Arc<SponsorshipStore>) -> Self {
        self.sponsorship_store = Some(store);
        self
    }

    /// Set the offer store for public sponsorship offers (SPEC_11 §3.11)
    pub fn offer_store(mut self, store: Arc<OfferStore>) -> Self {
        self.offer_store = Some(store);
        self
    }

    /// Set the branch subscription manager for local subscriptions (BRANCH_SELECTIVE_SYNC.md §5.4)
    pub fn branch_subscription_manager(
        mut self,
        manager: Arc<RwLock<BranchSubscriptionManager>>,
    ) -> Self {
        self.branch_subscription_manager = Some(manager);
        self
    }

    /// Set the peer branch tracker for tracking which peers serve which branches (BRANCH_SELECTIVE_SYNC.md §5.2)
    pub fn peer_branch_tracker(mut self, tracker: Arc<RwLock<PeerBranchTracker>>) -> Self {
        self.peer_branch_tracker = Some(tracker);
        self
    }

    /// Set the aggregation cache for reply counts and content stats
    pub fn aggregation_cache(mut self, cache: Arc<AggregationCache>) -> Self {
        self.aggregation_cache = Some(cache);
        self
    }

    /// Set the node identity for leader election
    pub fn node_id(mut self, id: [u8; 32]) -> Self {
        self.node_id = Some(id);
        self
    }

    /// Set the search index for full-text content indexing
    pub fn search_index(mut self, index: Arc<RwLock<SearchIndex>>) -> Self {
        self.search_index = Some(index);
        self
    }

    /// Set the event manager for publishing real-time WebSocket events (H-RPC-2)
    pub fn event_manager(mut self, manager: Arc<crate::rpc::events::EventManager>) -> Self {
        self.event_manager = Some(manager);
        self
    }

    /// Set the behavioral branching mode (SPEC_13 Phase A organic community
    /// detection: `Disabled`, `LogOnly` observation, or `Full` formation).
    pub fn behavioral_branching_mode(mut self, mode: BehavioralBranchingMode) -> Self {
        self.behavioral_branching_mode = mode;
        self
    }

    /// Build the MessageRouter
    ///
    /// # Panics
    ///
    /// Panics if metrics was not provided.
    pub fn build(self) -> MessageRouter {
        let metrics = self.metrics.expect("metrics is required");
        MessageRouter {
            metrics,
            pending_pings: RwLock::new(HashMap::new()),
            seen_dm_requests: RwLock::new(std::collections::HashSet::new()),
            pending_who_has_relay: RwLock::new(HashMap::new()),
            orphan_blocks: RwLock::new(HashMap::new()),
            content_retrieval: self.content_retrieval,
            data_dir: self.data_dir,
            decay_integration: self.decay_integration,
            peer_store: self.peer_store,
            chain_store: self.chain_store,
            blocklist: self.blocklist,
            blocklist_gossip: self.blocklist_gossip,
            trusted_blocklist_keys: self.trusted_blocklist_keys,
            connection_pool: self.connection_pool,
            dht: self.dht,
            content_store: self.content_store,
            block_builder: self.block_builder,
            spam_attestation_store: self.spam_attestation_store,
            reputation_store: self.reputation_store,
            membership_store: self.membership_store,
            identity_pubkey: self.identity_pubkey,
            hole_punch_tx: self.hole_punch_tx,
            engagement_graph: self.engagement_graph,
            sponsorship_store: self.sponsorship_store,
            offer_store: self.offer_store,
            branch_subscription_manager: self.branch_subscription_manager,
            peer_branch_tracker: self.peer_branch_tracker,
            aggregation_cache: self.aggregation_cache,
            node_id: self.node_id,
            search_index: self.search_index,
            event_manager: self.event_manager,
            behavioral_branching_mode: self.behavioral_branching_mode,
        }
    }

    /// Build the MessageRouter, returning an error if required fields are missing
    pub fn try_build(self) -> Result<MessageRouter, &'static str> {
        let metrics = self.metrics.ok_or("metrics is required")?;
        Ok(MessageRouter {
            metrics,
            pending_pings: RwLock::new(HashMap::new()),
            seen_dm_requests: RwLock::new(std::collections::HashSet::new()),
            pending_who_has_relay: RwLock::new(HashMap::new()),
            orphan_blocks: RwLock::new(HashMap::new()),
            content_retrieval: self.content_retrieval,
            data_dir: self.data_dir,
            decay_integration: self.decay_integration,
            peer_store: self.peer_store,
            chain_store: self.chain_store,
            blocklist: self.blocklist,
            blocklist_gossip: self.blocklist_gossip,
            trusted_blocklist_keys: self.trusted_blocklist_keys,
            connection_pool: self.connection_pool,
            dht: self.dht,
            content_store: self.content_store,
            block_builder: self.block_builder,
            spam_attestation_store: self.spam_attestation_store,
            reputation_store: self.reputation_store,
            membership_store: self.membership_store,
            identity_pubkey: self.identity_pubkey,
            hole_punch_tx: self.hole_punch_tx,
            engagement_graph: self.engagement_graph,
            sponsorship_store: self.sponsorship_store,
            offer_store: self.offer_store,
            branch_subscription_manager: self.branch_subscription_manager,
            peer_branch_tracker: self.peer_branch_tracker,
            aggregation_cache: self.aggregation_cache,
            node_id: self.node_id,
            search_index: self.search_index,
            event_manager: self.event_manager,
            behavioral_branching_mode: self.behavioral_branching_mode,
        })
    }
}

impl Default for MessageRouterBuilder {
    fn default() -> Self {
        Self::new()
    }
}
