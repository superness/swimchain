//! RPC method implementations
//!
//! Provides the method dispatch table and implementations for all RPC methods.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use log::{debug, info, warn};
use serde_json::{json, Value};
use tokio::sync::{broadcast, RwLock};

use crate::blocklist::{BlocklistEntry, BlocklistReason, BlocklistStore};
use crate::blocks::{Action, BranchPath};
use crate::content::decay_integration::DecayIntegration;
use crate::content::retrieval::ContentRetrievalManager;
use crate::crypto::action_pow::{
    compute_pow, verify_pow, ActionType, ForkPoWConfig, PoWChallenge, PoWSolution,
};
use crate::identity::KeyPair;
use crate::node::connection_manager::ConnectionManager;
use crate::node::peer_connections::PeerConnectionPool;
use crate::node::router::MessageRouter;
use crate::node::state::NodeState;
use crate::storage::blob::{BlobStore, ContentBlobHash};
use crate::storage::chain::ChainStore;
use crate::storage::membership::MembershipStore;
use crate::storage::AggregationCache;
use crate::sync::SyncState;
use crate::types::content::{ContentId, Reaction, ReactionType};
use crate::types::identity::IdentityId;
use crate::types::space_class::{apply_class, SpaceClass};

/// Map an on-wire emoji code (1..=8) to a `ReactionType`. Returns `None` for
/// unknown codes. Centralizes the mapping duplicated across engage handlers.
fn reaction_type_from_code(code: u8) -> Option<ReactionType> {
    Some(match code {
        1 => ReactionType::Heart,
        2 => ReactionType::ThumbsUp,
        3 => ReactionType::ThumbsDown,
        4 => ReactionType::Laugh,
        5 => ReactionType::Thinking,
        6 => ReactionType::MindBlown,
        7 => ReactionType::Fire,
        8 => ReactionType::Swimming,
        _ => return None,
    })
}
use crate::cli::search_index::{IndexableContent, SearchFilters, SearchIndex};
use crate::crypto::signature::{sign as ed25519_sign, verify as ed25519_verify};
use crate::crypto::{leading_zeros, pow_hash};
use crate::dht::ProviderRecord;
use crate::spam_attestation::{
    aggregate_attestations, find_sponsor_tree_root, CounterAttestation, SpamAttestation,
    SpamAttestationStore, SpamReason, StoredSpamAttestation, SPAM_ATTESTATION_POW_DIFFICULTY,
};
use crate::types::identity::{PublicKey, Signature};
use crate::VERSION;

use super::error::RpcErrorCode;
use super::types::*;

// Space ID constants - using 16 bytes (128 bits) for space identification
const SPACE_HRP: &str = "sp";

/// Decode a space ID to 16 bytes
/// Accepts both formats:
/// - Bech32m: "sp1qqqq..." (preferred, new format)
/// - Short hex: "0002de81" (legacy, 8 char hex for first 4 bytes, zero-padded to 16)
/// - Full hex: "0002de81..." (32 char hex for full 16 bytes)
/// App-namespaced spaces — a general, self-describing space-naming convention (no new
/// protocol primitive). A space whose on-chain name is `@<app>:<display>` (with
/// `app = [a-z0-9-]{1,32}`) belongs to a specialized client "app". The general social
/// clients (forum/feed/chat/search) hide ALL app spaces so specialized content never
/// pollutes the default experience; the matching app client shows only its own.
/// App-space helpers now live in `crate::types::space_class` so the node and the
/// `sw` CLI derive space ids from a single source of truth (see `derive_space_id`).
use crate::types::space_class::{app_space_id_16, parse_app_space_name};

/// Authoritative "is this an app space" check for a `(space_id, name)` pair: the name must
/// be a well-formed marker AND its derived id must match the actual space id. The derivation
/// check doubles as anti-spoof — a normal space that merely happens to be named `@x:y`
/// (and so has a random PoW id) fails the match and stays a normal space.
fn resolve_app_space(space_id_16: &[u8; 16], name: &str) -> Option<(String, String)> {
    let (app, display) = parse_app_space_name(name)?;
    if app_space_id_16(&app, &display) == *space_id_16 {
        Some((app, display))
    } else {
        None
    }
}

#[cfg(test)]
mod app_space_tests {
    use super::{app_space_id_16, parse_app_space_name, resolve_app_space};

    #[test]
    fn parses_well_formed_markers() {
        assert_eq!(
            parse_app_space_name("@wiki:Minecraft"),
            Some(("wiki".to_string(), "Minecraft".to_string()))
        );
        // Display may contain colons and spaces; only the first ':' splits app/display.
        assert_eq!(
            parse_app_space_name("@chess:Ruy Lopez: main line"),
            Some(("chess".to_string(), "Ruy Lopez: main line".to_string()))
        );
    }

    #[test]
    fn rejects_non_markers() {
        assert_eq!(parse_app_space_name("Minecraft"), None); // no @
        assert_eq!(parse_app_space_name("@wiki"), None); // no ':'
        assert_eq!(parse_app_space_name("@:name"), None); // empty app
        assert_eq!(parse_app_space_name("@wiki:"), None); // empty display
        assert_eq!(parse_app_space_name("@Wiki:x"), None); // uppercase app not allowed
        assert_eq!(parse_app_space_name("@a b:x"), None); // space in app not allowed
    }

    #[test]
    fn resolve_requires_derived_id_match() {
        let id = app_space_id_16("wiki", "Minecraft");
        // Correct derived id resolves.
        assert_eq!(
            resolve_app_space(&id, "@wiki:Minecraft"),
            Some(("wiki".to_string(), "Minecraft".to_string()))
        );
        // Same name but a random (non-derived) id is NOT treated as an app space (anti-spoof).
        assert_eq!(resolve_app_space(&[0u8; 16], "@wiki:Minecraft"), None);
        // Derivation is app-scoped: chess id doesn't resolve a wiki-named space.
        let chess_id = app_space_id_16("chess", "Minecraft");
        assert_eq!(resolve_app_space(&chess_id, "@wiki:Minecraft"), None);
    }
}

fn decode_space_id(space_id: &str) -> Result<[u8; 16], String> {
    use bech32::Hrp;

    let mut space_bytes = [0u8; 16];

    // Preferred: real bech32m "sp1q..." (what encode_space_id emits).
    if space_id.starts_with("sp1") {
        if let Ok((decoded_hrp, data)) = bech32::decode(space_id) {
            let hrp = Hrp::parse(SPACE_HRP).map_err(|e| format!("Invalid HRP: {}", e))?;
            if decoded_hrp == hrp && data.len() >= 17 {
                space_bytes.copy_from_slice(&data[1..17]);
                return Ok(space_bytes);
            }
        }
        // Tolerate the malformed "sp1" + raw-hex form some content RPCs emit
        // (e.g. "sp1a06a93a6bac68748bfeebb14e7f4f9f9"): strip the prefix and
        // take the first 16 bytes of hex.
        let hexpart = &space_id[3..];
        if hexpart.len() >= 32 && hexpart[..32].chars().all(|c| c.is_ascii_hexdigit()) {
            let bytes = hex::decode(&hexpart[..32]).map_err(|e| format!("Invalid hex: {}", e))?;
            space_bytes.copy_from_slice(&bytes);
            return Ok(space_bytes);
        }
    }

    // Raw hex. 8 chars = short id (first 4 bytes). Accept 32 OR MORE chars as a
    // full 16-byte id — some content RPCs hex-encode a zero-padded 32-byte
    // space_id (e.g. "00014032…<trailing zeros>"), so take the first 16 bytes
    // rather than rejecting it (this was the "invalid space id format" on
    // tapping a space link from a post).
    if space_id.len() >= 8 && space_id.chars().all(|c| c.is_ascii_hexdigit()) {
        if space_id.len() == 8 {
            let hex_bytes = hex::decode(space_id).map_err(|e| format!("Invalid hex: {}", e))?;
            space_bytes[..4].copy_from_slice(&hex_bytes);
            return Ok(space_bytes);
        } else if space_id.len() >= 32 {
            let hex_bytes =
                hex::decode(&space_id[..32]).map_err(|e| format!("Invalid hex: {}", e))?;
            space_bytes.copy_from_slice(&hex_bytes);
            return Ok(space_bytes);
        }
    }

    Err(format!(
        "Invalid space ID format. Expected bech32m (sp1...) or hex (8 or 32+ chars), got: {}",
        space_id
    ))
}

/// Encode 16 bytes as a bech32m space ID (sp1...)
fn encode_space_id(bytes: &[u8; 16]) -> String {
    use bech32::{Bech32m, Hrp};

    let hrp = Hrp::parse(SPACE_HRP).expect("valid HRP");
    let mut data = Vec::with_capacity(17);
    data.push(0); // version byte
    data.extend_from_slice(bytes);
    bech32::encode::<Bech32m>(hrp, &data).expect("valid encoding")
}

/// Load space names from config.toml in the data directory
fn load_space_names(data_dir: &std::path::Path) -> std::collections::HashMap<String, String> {
    use std::collections::HashMap;

    let config_path = data_dir.join("config.toml");
    if !config_path.exists() {
        return HashMap::new();
    }

    // Parse the config file
    match std::fs::read_to_string(&config_path) {
        Ok(contents) => {
            // Parse TOML to get space_names table
            match toml::from_str::<toml::Value>(&contents) {
                Ok(value) => {
                    if let Some(space_names) = value.get("space_names") {
                        if let Some(table) = space_names.as_table() {
                            return table
                                .iter()
                                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                                .collect();
                        }
                    }
                    HashMap::new()
                }
                Err(_) => HashMap::new(),
            }
        }
        Err(_) => HashMap::new(),
    }
}

/// Verify PoW for an RPC submission
///
/// This validates that the client did the required computational work before
/// allowing content submission. This is the core anti-spam mechanism.
fn verify_pow_submission(
    action_type: ActionType,
    content: &[u8],
    author_id: &str,
    pow_nonce: u64,
    pow_difficulty: u8,
    pow_nonce_space: &str,
    pow_hash: &str,
    timestamp: u64,
    network: &str,
) -> Result<(), (RpcErrorCode, String)> {
    // Parse author_id (32-byte hex)
    let author_bytes: [u8; 32] = hex::decode(author_id)
        .map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("Invalid author_id hex: {}", e),
            )
        })?
        .try_into()
        .map_err(|_| {
            (
                RpcErrorCode::InvalidParams,
                "author_id must be 32 bytes".to_string(),
            )
        })?;

    // Parse nonce_space (8-byte hex)
    let nonce_space_bytes: [u8; 8] = hex::decode(pow_nonce_space)
        .map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("Invalid pow_nonce_space hex: {}", e),
            )
        })?
        .try_into()
        .map_err(|_| {
            (
                RpcErrorCode::InvalidParams,
                "pow_nonce_space must be 8 bytes".to_string(),
            )
        })?;

    // Parse hash (32-byte hex)
    let hash_bytes: [u8; 32] = hex::decode(pow_hash)
        .map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("Invalid pow_hash hex: {}", e),
            )
        })?
        .try_into()
        .map_err(|_| {
            (
                RpcErrorCode::InvalidParams,
                "pow_hash must be 32 bytes".to_string(),
            )
        })?;

    // Compute content hash for verification
    let content_hash = crate::crypto::sha256(content);

    // Build the challenge
    let challenge = PoWChallenge {
        action_type,
        content_hash,
        author_id: author_bytes,
        timestamp,
        difficulty: pow_difficulty,
        nonce_space: nonce_space_bytes,
    };

    // Build the solution
    let solution = PoWSolution {
        challenge,
        nonce: pow_nonce,
        hash: hash_bytes,
    };

    // Get PoW config based on network
    let config = match network {
        "testnet" => ForkPoWConfig::testnet(),
        "regtest" => ForkPoWConfig::test(),
        _ => ForkPoWConfig::production(),
    };

    // Determine network mode for difficulty adjustment
    let network_mode = match network {
        "testnet" => crate::network::NetworkMode::Testnet,
        "regtest" => crate::network::NetworkMode::Regtest,
        _ => crate::network::NetworkMode::Mainnet,
    };

    // Get network-adjusted minimum difficulty for action type
    // Testnet and regtest have reduced difficulty requirements
    let base_difficulty = config.get_difficulty(action_type);
    let min_difficulty = network_mode.adjusted_difficulty(base_difficulty);
    if pow_difficulty < min_difficulty {
        return Err((
            RpcErrorCode::PowInvalid,
            format!(
                "Difficulty {} too low for {:?} on {} (minimum {})",
                pow_difficulty, action_type, network, min_difficulty
            ),
        ));
    }

    // Verify the PoW
    let current_time = crate::crypto::current_timestamp();
    verify_pow(&solution, &config, current_time).map_err(|e| {
        (
            RpcErrorCode::PowInvalid,
            format!("PoW verification failed: {}", e),
        )
    })?;

    info!(
        "[RPC] PoW verified for {:?}: difficulty={}, nonce={}",
        action_type, pow_difficulty, pow_nonce
    );
    Ok(())
}

/// Verify PoW submission with raw bytes for content_hash and author_id
/// Used for engagement where frontend passes raw 32-byte content hash directly
fn verify_pow_submission_raw(
    action_type: ActionType,
    content_hash: &[u8; 32],
    author_id: &[u8; 32],
    pow_nonce: u64,
    pow_difficulty: u8,
    pow_nonce_space: &str,
    pow_hash: &str,
    timestamp: u64,
    network: &str,
) -> Result<(), (RpcErrorCode, String)> {
    // Parse nonce_space (8-byte hex)
    let nonce_space_bytes: [u8; 8] = hex::decode(pow_nonce_space)
        .map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("Invalid pow_nonce_space hex: {}", e),
            )
        })?
        .try_into()
        .map_err(|_| {
            (
                RpcErrorCode::InvalidParams,
                "pow_nonce_space must be 8 bytes".to_string(),
            )
        })?;

    // Parse hash (32-byte hex)
    let hash_bytes: [u8; 32] = hex::decode(pow_hash)
        .map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("Invalid pow_hash hex: {}", e),
            )
        })?
        .try_into()
        .map_err(|_| {
            (
                RpcErrorCode::InvalidParams,
                "pow_hash must be 32 bytes".to_string(),
            )
        })?;

    // Build the challenge (use content_hash directly, no SHA256)
    let challenge = PoWChallenge {
        action_type,
        content_hash: *content_hash,
        author_id: *author_id,
        timestamp,
        difficulty: pow_difficulty,
        nonce_space: nonce_space_bytes,
    };

    // Build the solution
    let solution = PoWSolution {
        challenge,
        nonce: pow_nonce,
        hash: hash_bytes,
    };

    // Get PoW config based on network
    let config = match network {
        "testnet" => ForkPoWConfig::testnet(),
        "regtest" => ForkPoWConfig::test(),
        _ => ForkPoWConfig::production(),
    };

    // Determine network mode for difficulty adjustment
    let network_mode = match network {
        "testnet" => crate::network::NetworkMode::Testnet,
        "regtest" => crate::network::NetworkMode::Regtest,
        _ => crate::network::NetworkMode::Mainnet,
    };

    // Get network-adjusted minimum difficulty for action type
    let base_difficulty = config.get_difficulty(action_type);
    let min_difficulty = network_mode.adjusted_difficulty(base_difficulty);
    if pow_difficulty < min_difficulty {
        return Err((
            RpcErrorCode::PowInvalid,
            format!(
                "Difficulty {} too low for {:?} on {} (minimum {})",
                pow_difficulty, action_type, network, min_difficulty
            ),
        ));
    }

    // Verify the PoW
    let current_time = crate::crypto::current_timestamp();
    verify_pow(&solution, &config, current_time).map_err(|e| {
        (
            RpcErrorCode::PowInvalid,
            format!("PoW verification failed: {}", e),
        )
    })?;

    info!(
        "[RPC] PoW verified for {:?}: difficulty={}, nonce={}",
        action_type, pow_difficulty, pow_nonce
    );
    Ok(())
}

/// Node reference for RPC methods
pub struct NodeRef {
    /// Node state
    pub state: Arc<RwLock<NodeState>>,
    /// Start time for uptime calculation
    pub start_time: Instant,
    /// Network mode (mainnet, testnet, regtest)
    pub network: String,
    /// Node ID (hex)
    pub node_id: String,
    /// P2P port
    pub p2p_port: u16,
    /// RPC port
    pub rpc_port: u16,
    /// Connection manager
    pub connection_manager: Option<Arc<ConnectionManager>>,
    /// Connection pool
    pub connection_pool: Option<Arc<PeerConnectionPool>>,
    /// Message router
    pub router: Option<Arc<MessageRouter>>,
    /// Sync state accessor
    pub sync_state: Arc<RwLock<SyncState>>,
    /// Data directory (contains config.toml, chain, content, etc.)
    pub data_dir: std::path::PathBuf,
    /// Content store path
    pub content_store_path: std::path::PathBuf,
    /// Sync blob store path
    pub sync_blob_path: std::path::PathBuf,
    /// Shared content store (opened once at startup)
    pub content_store: Option<Arc<crate::storage::content::PersistentContentStore>>,
    /// Decay integration for content lifecycle management
    pub decay_integration: Option<Arc<DecayIntegration>>,
    /// Block builder for block-based content propagation (SPEC_08)
    pub block_builder: Option<Arc<std::sync::RwLock<crate::blocks::BlockBuilder>>>,
    /// Content retrieval manager for view-to-host content fetching
    pub content_retrieval: Option<Arc<ContentRetrievalManager>>,
    /// Blocklist store for CSAM/illegal content filtering
    /// Uses RwLock to allow network gossip handlers to store updates (C-BLOCKLIST-2)
    pub blocklist: Option<Arc<std::sync::RwLock<BlocklistStore>>>,
    /// Fork registry for fork mechanics
    pub fork_registry: Option<Arc<crate::fork::ForkRegistry>>,
    /// Chain store for blockchain data (blocks, actions)
    pub chain_store: Option<Arc<ChainStore>>,
    /// Transport for establishing new connections
    pub transport: Option<Arc<crate::transport::TcpTransport>>,
    /// DHT manager for content discovery (SPEC_06 §3.8)
    pub dht: Option<Arc<crate::dht::DhtManager>>,
    /// Aggregation cache for fast reply counts and space stats
    pub aggregation_cache: Option<Arc<AggregationCache>>,
    /// Spam attestation store for community flagging (SPEC_12 §3)
    pub spam_attestation_store: Option<Arc<SpamAttestationStore>>,
    /// Identity-level poster reputation store (SPEC_12 §3.4/§4.5)
    pub reputation_store: Option<Arc<crate::reputation::ReputationStore>>,
    /// Sponsorship penalty manager (SPEC_11) — node-local penalty policy
    pub sponsorship_manager: Option<Arc<crate::sponsorship::manager::SponsorshipManager>>,
    /// Membership store for private spaces (DMs, group chats)
    pub membership_store: Option<Arc<MembershipStore>>,
    /// Sponsorship store for identity chain enforcement
    pub sponsorship_store: Option<Arc<crate::sponsorship::storage::SponsorshipStore>>,
    /// Offer store for public sponsorship offer lifecycle
    pub offer_store: Option<Arc<crate::sponsorship::offer_store::OfferStore>>,
    /// Achievement service for recognition badges (SPEC_09 §5.3).
    /// Recognition ONLY: exposes/awards badges, grants no protocol privileges.
    pub achievement_service: Option<Arc<crate::achievement::AchievementService>>,
    /// Notification service (SPEC_09 §7) — local-user notifications
    /// (CommunityFormed, streaks, achievements, ...) surfaced via
    /// `list_notifications` / `mark_notification_read`.
    pub notification_service: Option<Arc<crate::notification::NotificationService>>,
    /// Branch subscription manager (selective sync; SPEC_06/BRANCH_SELECTIVE_SYNC).
    /// Uses std::sync::RwLock to match manager.rs construction.
    pub branch_subscription_manager:
        Option<Arc<std::sync::RwLock<crate::sync::subscription::BranchSubscriptionManager>>>,
    /// Node's identity keypair for signing
    pub keypair: KeyPair,
    /// Shutdown sender (for stop method)
    pub shutdown_tx: broadcast::Sender<()>,
    /// Display name for this node's identity (passed with actions)
    pub identity_name: Arc<RwLock<Option<String>>>,
    /// Full-text search index (Tantivy) for content search
    pub search_index: Option<Arc<std::sync::RwLock<SearchIndex>>>,
    /// Event manager for publishing real-time WebSocket events (H-RPC-2)
    pub event_manager: Option<Arc<crate::rpc::events::EventManager>>,
    /// Gossip origin-privacy settings (SWIM-PRIV-1). Controls whether/how
    /// self-originated actions are delayed/stem-relayed on their first announce.
    pub origin_privacy: crate::node::OriginPrivacyConfig,
    /// Short-TTL cache of the fully-computed `list_spaces` result (all spaces, sorted, with
    /// app tags). `list_spaces` does full chain + content-store scans to build this; the feed
    /// polls it rapidly, which otherwise pegs every core. Pagination is applied per-request
    /// from the cached list. `(computed_at, full_sorted_spaces)`.
    pub space_list_cache: std::sync::Mutex<Option<(std::time::Instant, Vec<SpaceSummary>)>>,
    /// Short-TTL cache of per-space content counts (`list_space_content` total). The count is
    /// a prefix scan over a space's items and the feed calls it per space repeatedly; bounded
    /// by the (small) number of spaces. `space_id_16 -> (computed_at, count)`.
    pub space_count_cache:
        std::sync::Mutex<std::collections::HashMap<[u8; 16], (std::time::Instant, usize)>>,
    /// Short-TTL cache of per-content reply counts. `count_all_replies` recursively walks a
    /// post's ENTIRE reply subtree; the list endpoints call it once per item and the feed polls
    /// them repeatedly, so an uncached read is O(items x reply-tree) of sled scanning — it
    /// pegged every core on nodes that had synced a lot of content (the aggregation cache is
    /// only populated for locally-submitted replies, not synced ones). `content_hash ->
    /// (computed_at, count)`.
    pub reply_count_cache:
        std::sync::Mutex<std::collections::HashMap<[u8; 32], (std::time::Instant, usize)>>,
}

/// RPC method dispatcher
pub struct RpcMethods {
    node: Arc<NodeRef>,
}

impl RpcMethods {
    /// Create new method dispatcher with node reference
    pub fn new(node: Arc<NodeRef>) -> Self {
        Self { node }
    }

    /// Get the network mode (mainnet, testnet, regtest)
    pub fn network(&self) -> &str {
        &self.node.network
    }

    /// Resolve the branch path to stamp on a mempool action (SPEC_08 §4).
    ///
    /// Threads already indexed on-chain inherit their branch (replies,
    /// engagements and edits stay with their thread); new threads get the
    /// hash-derived active leaf for their space. Deterministic given the
    /// local chain state; falls back to the root path when no chain store
    /// is available (minimal/test configurations).
    fn resolve_branch_path(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        author: Option<&[u8; 32]>,
    ) -> BranchPath {
        match self.node.chain_store {
            Some(ref store) => crate::branch::BranchManager::new(store)
                .resolve_mempool_branch_path(space_id, thread_root_id, author),
            None => BranchPath::root(),
        }
    }

    /// Per-space content count with a short-TTL cache. `count_content_in_space` is a prefix
    /// scan over the space's items; the feed calls `list_space_content` per space repeatedly,
    /// so cache the total for a few seconds to keep those calls cheap.
    fn cached_space_content_count(&self, space_id_16: &[u8; 16]) -> usize {
        const COUNT_TTL: std::time::Duration = std::time::Duration::from_secs(3);
        {
            let guard = self.node.space_count_cache.lock().unwrap();
            if let Some((at, count)) = guard.get(space_id_16) {
                if at.elapsed() < COUNT_TTL {
                    return *count;
                }
            }
        }
        let count = self
            .node
            .chain_store
            .as_ref()
            .and_then(|cs| cs.count_content_in_space(space_id_16).ok())
            .unwrap_or(0);
        self.node
            .space_count_cache
            .lock()
            .unwrap()
            .insert(*space_id_16, (std::time::Instant::now(), count));
        count
    }

    /// Per-content reply count (chain only) with a short-TTL cache. `count_all_replies`
    /// recursively walks a post's whole reply subtree; the list endpoints need it per item and
    /// the feed polls them repeatedly, so without a cache a single feed load is
    /// O(items x reply-tree) of sled scanning — it pegged every core on nodes with a lot of
    /// synced content. Mirrors [`Self::cached_space_content_count`]. Returns 0 when there is no
    /// chain store. Callers add pending-mempool replies separately.
    fn cached_reply_count(&self, content_hash: &[u8; 32]) -> u64 {
        const COUNT_TTL: std::time::Duration = std::time::Duration::from_secs(3);
        {
            let guard = self.node.reply_count_cache.lock().unwrap();
            if let Some((at, count)) = guard.get(content_hash) {
                if at.elapsed() < COUNT_TTL {
                    return *count as u64;
                }
            }
        }
        let count = self
            .node
            .chain_store
            .as_ref()
            .and_then(|cs| cs.count_all_replies(content_hash).ok())
            .unwrap_or(0);
        self.node
            .reply_count_cache
            .lock()
            .unwrap()
            .insert(*content_hash, (std::time::Instant::now(), count));
        count as u64
    }

    /// Gossip a *self-originated* action to peers with origin obfuscation
    /// (SWIM-PRIV-1).
    ///
    /// This is the single choke point for announcing actions this node authored
    /// (post/reply/edit/engage/create-space/invite/accept). Unlike relayed
    /// actions — which `MessageRouter::handle_action_announce` forwards
    /// immediately — a self-originated action's *first* announce is treated per
    /// [`crate::node::route_self_originated`]:
    ///
    /// - Privacy off (default on regtest) or no peers: broadcast to all peers now.
    /// - Privacy on, delay-only: wait a jittered delay, then broadcast to all peers.
    /// - Privacy on, stem+fluff: wait a jittered delay, then send to ONE random
    ///   peer (the stem); that peer diffuses it normally so the origin is one hop
    ///   removed from the observable fan-out.
    ///
    /// The action is already in the local mempool before this is called, so
    /// block formation, decay, PoW and validation are unaffected — only the
    /// timing/target of the first outward announce changes. Delayed/stem
    /// deliveries run on a detached task so the RPC returns promptly.
    async fn gossip_self_originated_action(
        &self,
        envelope: crate::types::network::MessageEnvelope,
    ) {
        use crate::node::{route_self_originated, OriginRoute};

        let pool = match &self.node.connection_pool {
            Some(p) => p.clone(),
            None => return,
        };

        let peers = pool.peer_ids().await;
        if peers.is_empty() {
            return;
        }

        let route = {
            let mut rng = rand::thread_rng();
            route_self_originated(&self.node.origin_privacy, &mut rng, peers.len())
        };

        match route {
            OriginRoute::Immediate => {
                for peer_id in peers {
                    if let Err(e) = pool.send_to(&peer_id, &envelope).await {
                        debug!(
                            "[MEMPOOL] Failed to broadcast self-originated action to peer {}: {}",
                            hex::encode(&peer_id[..8]),
                            e
                        );
                    }
                }
            }
            OriginRoute::Delayed { delay } => {
                info!(
                    "[PRIV] Delaying self-originated action announce by {:?} (origin obfuscation)",
                    delay
                );
                tokio::spawn(async move {
                    tokio::time::sleep(delay).await;
                    let peers = pool.peer_ids().await;
                    for peer_id in peers {
                        let _ = pool.send_to(&peer_id, &envelope).await;
                    }
                });
            }
            OriginRoute::StemDelayed { delay, stem_index } => {
                info!(
                    "[PRIV] Stem-relaying self-originated action after {:?} to 1 random peer (origin obfuscation)",
                    delay
                );
                tokio::spawn(async move {
                    tokio::time::sleep(delay).await;
                    let peers = pool.peer_ids().await;
                    if peers.is_empty() {
                        return;
                    }
                    // Re-derive a valid index against the live peer set: the set
                    // may have changed during the delay.
                    let idx = stem_index % peers.len();
                    let _ = pool.send_to(&peers[idx], &envelope).await;
                });
            }
        }
    }

    /// Check if identity is sponsored and can perform actions.
    ///
    /// Enforces the sponsorship chain requirement for network integrity.
    /// Returns Ok(()) if allowed, Err with response if denied.
    ///
    /// Behavior by network mode:
    /// - Regtest: Always allowed (for testing)
    /// - Testnet/Mainnet: Requires valid sponsorship chain
    fn check_identity_sponsored(&self, author_id: &str, id: &Value) -> Result<(), RpcResponse> {
        use crate::types::identity::PublicKey;

        // Regtest mode allows all identities (for local testing)
        if self.node.network == "regtest" {
            return Ok(());
        }

        // Parse author_id
        let author_bytes: [u8; 32] = match hex::decode(author_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return Err(RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid author_id: must be 32-byte hex",
                    id.clone(),
                ));
            }
        };

        let pubkey = PublicKey::from_bytes(author_bytes);

        // Check sponsorship store
        let sponsorship_store = match &self.node.sponsorship_store {
            Some(store) => store,
            None => {
                // If sponsorship store not initialized, reject action
                // This prevents Sybil attacks during node startup window
                warn!("[SPONSORSHIP] Store not initialized, rejecting action");
                return Err(RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Node is still initializing. Please try again in a few seconds.",
                    id.clone(),
                ));
            }
        };

        match sponsorship_store.can_identity_act(&pubkey) {
            Ok(true) => Ok(()),
            Ok(false) => {
                // Check mempool for pending Sponsor action (SPEC_11 §3.11)
                // This allows newly sponsored identities to act before the block is formed
                if let Some(ref block_builder) = self.node.block_builder {
                    if let Ok(builder) = block_builder.read() {
                        use crate::blocks::action::ActionType;
                        let pending_actions = builder.get_pending_actions();
                        for (_thread_id, _space_id, action) in pending_actions {
                            if action.action_type == ActionType::Sponsor {
                                if let Some(sponsee_bytes) = action.content_hash {
                                    if sponsee_bytes == author_bytes {
                                        log::debug!(
                                            "[SPONSORSHIP] Found pending sponsorship in mempool for {}",
                                            author_id
                                        );
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }

                info!(
                    "[SPONSORSHIP] Rejected action from unsponsored identity: {}",
                    author_id
                );
                Err(RpcResponse::error(
                    RpcErrorCode::IdentityNotSponsored,
                    "Identity is not sponsored. You must be sponsored by an existing member to post.",
                    id.clone(),
                ))
            }
            Err(e) => {
                warn!("[SPONSORSHIP] Error checking sponsorship: {}", e);
                Err(RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to verify sponsorship: {}", e),
                    id.clone(),
                ))
            }
        }
    }

    /// Check if mempool PoW threshold is met and form a block if so.
    ///
    /// This should be called after adding actions to the mempool via RPC.
    /// When cumulative PoW meets/exceeds the difficulty target, we form
    /// and broadcast a block immediately - but only if this node is eligible
    /// based on deterministic leader election.
    async fn try_form_block_if_threshold_met(&self) {
        use crate::blocks::leader::{BlockEligibility, DIFFICULTY_ADJUSTMENT_WINDOW};

        let block_builder = match &self.node.block_builder {
            Some(bb) => bb,
            None => return,
        };

        // Get node identity for leader election
        let node_identity: [u8; 32] = match hex::decode(&self.node.node_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                warn!("[BLOCKS] Invalid node_id, cannot check leader eligibility");
                return;
            }
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

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
            if let Some(ref chain_store) = self.node.chain_store {
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

                // === Leader Election Check ===
                // Get previous block for eligibility calculation
                if let Ok(Some(prev_block)) = chain_store.get_best_tip_block() {
                    // Get recent block timestamps for difficulty adjustment
                    let recent_timestamps: Vec<u64> = {
                        let tip_height = prev_block.height;
                        let start_height =
                            tip_height.saturating_sub(DIFFICULTY_ADJUSTMENT_WINDOW as u64);
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

                    // Create eligibility checker (global, not per-space since root blocks span all spaces)
                    let eligibility = BlockEligibility::new(
                        &prev_block.hash(),
                        prev_block.timestamp,
                        &[0u8; 16], // Global eligibility (not per-space)
                        &recent_timestamps,
                    );

                    if !eligibility.is_eligible(&node_identity, now) {
                        let eligible_pct = eligibility.eligible_percentage_at(now);
                        debug!(
                            "[BLOCKS] Not eligible to form block yet (current: {:.4}% of identities eligible)",
                            eligible_pct
                        );
                        return;
                    }

                    info!(
                        "[BLOCKS] Leader election passed! Node {} is eligible to form block",
                        &self.node.node_id[..16]
                    );
                }
                // If no previous block, we're forming genesis - always eligible
            }

            // Check if ready to form (lazy waiting: waits for network block first)
            if !bb_write.should_form_root() {
                return;
            }

            bb_write.build_root_block(
                now,
                node_identity,
                self.node.sponsorship_store.as_ref().map(|s| s.as_ref()),
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
        if let Some(ref store) = self.node.chain_store {
            // Store content blocks first (referenced by space blocks).
            // Branch-aware write: registers size tracking and runs the 50MB
            // fracture check (SPEC_08 §5) without mutating the built block.
            let branch_store = crate::branch::BranchAwareStore::new(store);
            for content_block in &content_blocks {
                match branch_store.put_built_content_block(content_block) {
                    Ok(result) => {
                        if result.fracture_triggered {
                            info!(
                                "[BRANCH] Fracture triggered in space {} at branch depth {}",
                                hex::encode(&content_block.space_id[..8]),
                                result.branch_path.depth()
                            );
                        }
                    }
                    Err(e) => warn!("[BLOCKS] Failed to store content block: {}", e),
                }
            }

            // Store space blocks (referenced by root block)
            for space_block in &space_blocks {
                if let Err(e) = store.put_space_block(space_block) {
                    warn!("[BLOCKS] Failed to store space block: {}", e);
                }
            }

            // Store root block and update canonical chain tip
            match store.put_root_block_with_fork_resolution(&root) {
                Ok((hash, is_canonical)) => {
                    if is_canonical {
                        info!(
                            "[BLOCKS] Stored root block {} as NEW CANONICAL TIP (height={}, cumulative_pow={})",
                            hex::encode(&hash[..8]),
                            root.height(),
                            root.cumulative_pow
                        );
                    } else {
                        info!(
                            "[BLOCKS] Stored root block {} (height={}, not canonical)",
                            hex::encode(&hash[..8]),
                            root.height()
                        );
                    }
                }
                Err(e) => {
                    warn!("[BLOCKS] Failed to store root block: {}", e);
                }
            }
        }

        // Announce block to peers
        if let Some(ref connection_pool) = self.node.connection_pool {
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

    /// Dispatch a method call
    pub async fn dispatch(&self, method: &str, params: Value, id: Value) -> RpcResponse {
        debug!("RPC method: {} params: {}", method, params);

        match method {
            // Node status
            "get_info" => self.get_info(id).await,
            "get_peers" => self.get_peers(id).await,
            "get_sync_status" => self.get_sync_status(id).await,
            "get_chain_stats" => self.get_chain_stats(id).await,
            "get_block" => self.get_block(params, id).await,
            "get_content_block" => self.get_content_block(params, id).await,
            "stop" => self.stop(id).await,

            // Peer management
            "add_peer" => self.add_peer(params, id).await,
            "remove_peer" => self.remove_peer(params, id).await,

            // Content submission
            "submit_post" => self.submit_post(params, id).await,
            "submit_reply" => self.submit_reply(params, id).await,
            "submit_edit" => self.submit_edit(params, id).await,
            "upload_media" => self.upload_media(params, id).await,
            "get_media" => self.get_media(params, id).await,
            "submit_engagement" => self.submit_engagement(params, id).await,

            // Content query
            "get_content" => self.get_content(params, id).await,
            "list_spaces" => self.list_spaces(params, id).await,
            "create_space" => self.create_space(params, id).await,
            "resolve_space_name" => self.resolve_space_name(params, id).await,
            "list_space_content" => self.list_space_content(params, id).await,
            "list_space_posts" | "list_posts_for_space" => self.list_space_posts(params, id).await,
            "get_user_posts" => self.get_user_posts(params, id).await,
            "request_content" => self.request_content(params, id).await,
            "get_replies" => self.get_replies(params, id).await,

            // Identity methods
            "get_identity_info" => self.get_identity_info(id).await,
            "sign_message" => self.sign_message(params, id).await,
            "get_identity_level" => self.get_identity_level(params, id).await,
            "get_identity_name" => self.get_identity_name(id).await,
            "set_identity_name" => self.set_identity_name(params, id).await,
            "get_user_profile" => self.get_user_profile(params, id).await,
            "get_reputation" => self.get_reputation(params, id).await,
            "get_sponsorship_status" => self.get_sponsorship_status(params, id).await,
            "get_achievements" => self.get_achievements(params, id).await,

            // Reaction methods (reactions come from PoW engagement via submit_engagement)
            "get_reactions" => self.get_reactions(params, id).await,
            "get_user_reactions" => self.get_user_reactions(params, id).await,
            "get_chain_engagements" => self.get_chain_engagements(params, id).await,
            "rebuild_reactions" => self.rebuild_reactions(id).await,

            // Fork methods
            "create_fork" => self.create_fork(params, id).await,
            "switch_fork" => self.switch_fork(params, id).await,
            "list_forks" => self.list_forks(id).await,
            "get_fork_info" => self.get_fork_info(params, id).await,
            "get_active_fork" => self.get_active_fork(id).await,

            // Debug methods
            "dht_status" => self.dht_status(id).await,
            "content_providers" => self.content_providers(params, id).await,

            // Verification methods
            "verify_action_finalized" => self.verify_action_finalized(params, id).await,

            // Spam attestation methods (SPEC_12 §3)
            "submit_spam_attestation" => self.submit_spam_attestation(params, id).await,
            "submit_counter_attestation" => self.submit_counter_attestation(params, id).await,
            "get_spam_status" => self.get_spam_status(params, id).await,

            // Blocklist management methods (SPEC_12 §3.6)
            "list_blocklist" => self.list_blocklist(params, id).await,
            "manage_blocklist" => self.manage_blocklist(params, id).await,
            "import_blocklist" => self.import_blocklist(params, id).await,

            // Behavioral branching methods (SPEC_13 Phase A / Phase 1 log-only rollout)
            "list_behavioral_events" => self.list_behavioral_events(params, id).await,
            "get_space_lineage" => self.get_space_lineage(params, id).await,
            "get_space_tree" => self.get_space_tree(params, id).await,
            "list_notifications" => self.list_notifications(params, id).await,
            "mark_notification_read" => self.mark_notification_read(params, id).await,
            "rename_space" => self.rename_space(params, id).await,

            // Private space methods (DMs, group chats)
            "create_private_space" => self.create_private_space(params, id).await,
            "create_private_space_managed" => self.create_private_space_managed(params, id).await,
            "encrypt_private_content" => self.encrypt_private_content(params, id).await,
            "decrypt_private_content" => self.decrypt_private_content(params, id).await,
            "invite_to_space" => self.invite_to_space(params, id).await,
            "invite_to_space_managed" => self.invite_to_space_managed(params, id).await,
            "create_space_invite_blob" => self.create_space_invite_blob(params, id).await,
            "redeem_space_invite" => self.redeem_space_invite(params, id).await,
            "accept_invite" => self.accept_invite(params, id).await,
            "accept_invite_managed" => self.accept_invite_managed(params, id).await,
            "decline_invite" => self.decline_invite(params, id).await,
            "leave_space" => self.leave_space(params, id).await,
            "kick_member" => self.kick_member(params, id).await,
            "get_my_invites" => self.get_my_invites(params, id).await,
            "get_space_members" => self.get_space_members(params, id).await,
            "get_my_private_spaces" => self.get_my_private_spaces(params, id).await,
            "get_pending_dm_requests" => self.get_pending_dm_requests(params, id).await,
            "get_sent_dm_requests" => self.get_sent_dm_requests(params, id).await,
            "encode_address" => self.encode_address(params, id).await,
            "request_dm" => self.request_dm(params, id).await,
            "request_dm_managed" => self.request_dm_managed(params, id).await,
            "accept_dm" => self.accept_dm(params, id).await,
            "accept_dm_managed" => self.accept_dm_managed(params, id).await,
            "decline_dm_managed" => self.decline_dm_managed(params, id).await,
            "decline_dm" => self.decline_dm(params, id).await,

            // Search methods
            "search" => self.search(params, id).await,
            "search_suggest" => self.search_suggest(params, id).await,
            "trending_searches" => self.trending_searches(params, id).await,
            "rebuild_search_index" => self.rebuild_search_index(params, id).await,

            // Sponsorship methods
            "register_genesis_identity" => self.register_genesis_identity(params, id).await,
            "register_sponsored_identity" => self.register_sponsored_identity(params, id).await,
            "get_sponsorship_info" => self.get_sponsorship_info(params, id).await,

            // Sponsorship offer lifecycle methods
            "list_sponsorship_offers" => self.list_sponsorship_offers(params, id).await,
            "get_sponsorship_offer" => self.get_sponsorship_offer(params, id).await,
            "create_sponsorship_offer" => self.create_sponsorship_offer(params, id).await,
            "claim_sponsorship_offer" => self.claim_sponsorship_offer(params, id).await,
            "approve_sponsorship_claim" => self.approve_sponsorship_claim(params, id).await,
            "reject_sponsorship_claim" => self.reject_sponsorship_claim(params, id).await,
            "cancel_sponsorship_offer" => self.cancel_sponsorship_offer(params, id).await,
            "list_my_sponsorship_offers" => self.list_my_sponsorship_offers(params, id).await,
            "get_my_claim_status" => self.get_my_claim_status(params, id).await,

            // Unknown method
            _ => {
                warn!("Unknown RPC method: {}", method);
                RpcResponse::error(
                    RpcErrorCode::MethodNotFound,
                    &format!("Method not found: {}", method),
                    id,
                )
            }
        }
    }

    // ========================================================================
    // Node Status Methods
    // ========================================================================

    async fn get_info(&self, id: Value) -> RpcResponse {
        let state = *self.node.state.read().await;
        let uptime = self.node.start_time.elapsed().as_secs();
        let peer_count = self
            .node
            .connection_manager
            .as_ref()
            .map(|cm| cm.connection_count())
            .unwrap_or(0);

        // Get actual chain height from chain store
        let block_height = self
            .node
            .chain_store
            .as_ref()
            .and_then(|cs| cs.get_latest_height().ok().flatten())
            .unwrap_or(0);

        let result = GetInfoResult {
            version: VERSION.to_string(),
            network: self.node.network.clone(),
            uptime_seconds: uptime,
            peer_count,
            block_height,
            node_id: self.node.node_id.clone(),
            rpc_port: self.node.rpc_port,
            p2p_port: self.node.p2p_port,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    async fn get_peers(&self, id: Value) -> RpcResponse {
        let peers: Vec<PeerInfoResult> = self
            .node
            .connection_manager
            .as_ref()
            .map(|cm| {
                cm.get_connections()
                    .into_iter()
                    .map(|handle| PeerInfoResult {
                        peer_id: hex::encode(handle.peer_id),
                        address: handle.remote_addr.to_string(),
                        direction: format!("{:?}", handle.direction),
                        connected_seconds: handle.connected_at.elapsed().as_secs(),
                        user_agent: String::new(), // Not tracked in handle currently
                    })
                    .collect()
            })
            .unwrap_or_default();

        RpcResponse::success(serde_json::to_value(peers).unwrap(), id)
    }

    async fn get_sync_status(&self, id: Value) -> RpcResponse {
        let sync_state = *self.node.sync_state.read().await;

        // Get peer count
        let peer_count = self
            .node
            .connection_manager
            .as_ref()
            .map(|cm| cm.get_connections().len() as u64)
            .unwrap_or(0);

        // Calculate chain sync percentage
        let (state, chain_percent) = match sync_state {
            SyncState::Idle => {
                if peer_count == 0 {
                    ("offline".to_string(), 0)
                } else {
                    ("synced".to_string(), 100)
                }
            }
            SyncState::SyncingHeaders { current, target }
            | SyncState::SyncingBlocks { current, target } => {
                let pct = if target > 0 {
                    (current as f64 / target as f64 * 100.0) as u8
                } else {
                    0
                };
                ("syncing".to_string(), pct.min(99)) // Cap at 99% while syncing
            }
            SyncState::Continuous => ("synced".to_string(), 100),
            SyncState::Error => ("behind".to_string(), 0),
        };

        // Calculate storage usage
        let storage_mb = self.calculate_storage_mb().await;

        // Get storage target from config (default 500MB)
        let storage_target_mb = 500u64;

        // Get actual chain height and tip hash from chain store
        let (chain_height, tip_hash) = match &self.node.chain_store {
            Some(cs) => {
                let height = cs.get_latest_height().ok().flatten().unwrap_or(0);
                let hash = if height > 0 {
                    cs.get_root_hash_at_height(height)
                        .ok()
                        .flatten()
                        .map(|h| hex::encode(&h[..8])) // First 8 bytes (16 hex chars) for display
                } else {
                    None
                };
                (height, hash)
            }
            None => (0, None),
        };

        // Last block time - get from the chain tip
        let last_block_time: Option<u64> = match &self.node.chain_store {
            Some(cs) => cs.get_best_tip_block().ok().flatten().map(|b| b.timestamp),
            None => None,
        };

        // Get mempool/block builder status
        let (mempool_pow, mempool_threshold, mempool_actions, mempool_waiting_secs) =
            if let Some(ref bb) = self.node.block_builder {
                if let Ok(bb_read) = bb.read() {
                    let pow = bb_read.total_pow();
                    let threshold = bb_read.difficulty_threshold();
                    let actions = bb_read.pending_action_count() as u64;
                    let waiting = bb_read.waiting_seconds();
                    (pow, threshold, actions, waiting)
                } else {
                    (0, 0, 0, 0)
                }
            } else {
                (0, 0, 0, 0)
            };

        // Compute leader election status
        let (node_identity, leader_distance, leader_threshold, leader_eligible, leader_eta_secs) = {
            // Parse node_id from hex string
            let node_id: [u8; 32] = match hex::decode(&self.node.node_id) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => [0u8; 32], // Fallback if node_id is invalid
            };
            let node_identity_hex = self.node.node_id[..16].to_string(); // First 16 hex chars

            // Get tip hash and timestamp for seed computation
            // We can use just the hash as seed even if block data is corrupt
            if let Some(ref cs) = self.node.chain_store {
                // Try to get tip hash - this works even if block data is corrupt
                let tip_hash_opt = cs.get_best_tip().ok().flatten().or_else(|| {
                    // Fallback: get hash at latest height
                    cs.get_latest_height()
                        .ok()
                        .flatten()
                        .and_then(|h| cs.get_root_hash_at_height(h).ok().flatten())
                });

                // Try to get timestamp from tip block if possible, fallback to current time
                let tip_timestamp = cs
                    .get_best_tip_block()
                    .ok()
                    .flatten()
                    .map(|b| b.timestamp)
                    .unwrap_or_else(|| {
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0)
                    });

                if let Some(tip_hash) = tip_hash_opt {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    // Get recent timestamps for difficulty calculation (if blocks available)
                    // If blocks are corrupt, use empty timestamps (less accurate difficulty, but still works)
                    let recent_timestamps = {
                        let tip_height = cs.get_latest_height().ok().flatten().unwrap_or(0);
                        let start_height = tip_height.saturating_sub(10);
                        let mut timestamps = Vec::new();
                        for h in start_height..=tip_height {
                            if let Ok(Some(hash)) = cs.get_root_hash_at_height(h) {
                                if let Ok(Some(block)) = cs.get_root_block(&hash) {
                                    timestamps.push(block.timestamp);
                                }
                            }
                        }
                        timestamps
                    };

                    // Create eligibility checker (use global space for now)
                    // Use tip_hash directly and tip_timestamp for seed
                    let eligibility = crate::blocks::leader::BlockEligibility::new(
                        &tip_hash,
                        tip_timestamp,
                        &[0u8; 16], // Global space
                        &recent_timestamps,
                    );

                    // Get distance and threshold (first 8 bytes as u64 for display)
                    let distance_bytes = eligibility.distance(&node_id);
                    let threshold_bytes = eligibility.threshold_at(now);

                    // Convert first 8 bytes to u64 for display
                    let distance_u64 = u64::from_be_bytes([
                        distance_bytes[0],
                        distance_bytes[1],
                        distance_bytes[2],
                        distance_bytes[3],
                        distance_bytes[4],
                        distance_bytes[5],
                        distance_bytes[6],
                        distance_bytes[7],
                    ]);
                    let threshold_u64 = u64::from_be_bytes([
                        threshold_bytes[0],
                        threshold_bytes[1],
                        threshold_bytes[2],
                        threshold_bytes[3],
                        threshold_bytes[4],
                        threshold_bytes[5],
                        threshold_bytes[6],
                        threshold_bytes[7],
                    ]);

                    let is_eligible = eligibility.is_eligible(&node_id, now);

                    // Calculate ETA using when_eligible
                    let eta_secs = if is_eligible {
                        0
                    } else {
                        match eligibility.when_eligible(&node_id, now) {
                            Some(eligible_time) => eligible_time.saturating_sub(now),
                            None => 0, // Already eligible
                        }
                    };

                    (
                        Some(node_identity_hex),
                        Some(distance_u64),
                        Some(threshold_u64),
                        Some(is_eligible),
                        Some(eta_secs),
                    )
                } else {
                    (Some(node_identity_hex), None, None, None, None)
                }
            } else {
                (Some(node_identity_hex), None, None, None, None)
            }
        };

        let result = GetSyncStatusResult {
            state,
            chain_percent,
            peer_count,
            chain_height,
            tip_hash,
            storage_mb,
            storage_target_mb,
            last_block_time,
            mempool_pow,
            mempool_threshold,
            mempool_actions,
            mempool_waiting_secs,
            node_identity,
            leader_distance,
            leader_threshold,
            leader_eligible,
            leader_eta_secs,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    async fn get_chain_stats(&self, id: Value) -> RpcResponse {
        use super::error::RpcErrorCode;

        let chain_store = match &self.node.chain_store {
            Some(cs) => cs,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Chain store not available",
                    id,
                );
            }
        };

        // Get latest height
        let latest_height = chain_store.get_latest_height().ok().flatten();

        // Use the built-in count methods which are more efficient
        let root_blocks = chain_store.root_block_count().unwrap_or(0);
        let space_blocks = chain_store.space_block_count().unwrap_or(0);
        let content_blocks = chain_store.content_block_count().unwrap_or(0);
        let total_storage_bytes = chain_store.total_bytes();

        // Get registered spaces count by iterating
        let registered_spaces = chain_store.list_spaces().filter(|r| r.is_ok()).count() as u64;

        let result = super::types::GetChainStatsResult {
            latest_height,
            root_blocks,
            space_blocks,
            content_blocks,
            registered_spaces,
            total_storage_bytes,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    async fn get_block(&self, params: Value, id: Value) -> RpcResponse {
        use super::error::RpcErrorCode;
        use super::types::{GetBlockParams, GetBlockResult, SpaceBlockInfo};

        let params: GetBlockParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let chain_store = match &self.node.chain_store {
            Some(cs) => cs,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Chain store not available",
                    id,
                );
            }
        };

        // Get root block hash at this height
        let root_hash = match chain_store.get_root_hash_at_height(params.height) {
            Ok(Some(hash)) => hash,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::ContentNotFound,
                    &format!("No block at height {}", params.height),
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Storage error: {}", e),
                    id,
                );
            }
        };

        // Get the root block
        let root_block = match chain_store.get_root_block(&root_hash) {
            Ok(Some(block)) => block,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::ContentNotFound,
                    "Root block not found",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Storage error: {}", e),
                    id,
                );
            }
        };

        // Collect space block info
        let mut space_blocks = Vec::new();
        for space_hash in &root_block.space_block_hashes {
            if let Ok(Some(space_block)) = chain_store.get_space_block(space_hash) {
                let content_hashes: Vec<String> = space_block
                    .content_block_hashes
                    .iter()
                    .map(hex::encode)
                    .collect();

                space_blocks.push(SpaceBlockInfo {
                    hash: hex::encode(space_hash),
                    space_id: hex::encode(space_block.space_id),
                    content_block_count: space_block.content_block_count,
                    content_hashes,
                });
            }
        }

        let result = GetBlockResult {
            height: root_block.height,
            hash: hex::encode(root_hash),
            prev_hash: hex::encode(root_block.prev_root_hash),
            timestamp: root_block.timestamp,
            total_pow: root_block.total_pow,
            space_blocks,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get content block by hash
    async fn get_content_block(&self, params: Value, id: Value) -> RpcResponse {
        use super::error::RpcErrorCode;
        use super::types::{ActionInfo, GetContentBlockParams, GetContentBlockResult};
        use crate::blocks::action::ActionType;

        let params: GetContentBlockParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse the hash
        let hash_bytes = match hex::decode(&params.hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            Ok(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Hash must be 32 bytes (64 hex chars)",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid hex: {}", e),
                    id,
                );
            }
        };

        let chain_store = match &self.node.chain_store {
            Some(cs) => cs,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Chain store not available",
                    id,
                );
            }
        };

        // Get the content block
        let content_block = match chain_store.get_content_block(&hash_bytes) {
            Ok(Some(block)) => block,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::ContentNotFound,
                    "Content block not found",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Storage error: {}", e),
                    id,
                );
            }
        };

        // Convert space ID to bech32
        let space_id_bech32 = {
            use bech32::{Bech32m, Hrp};
            let hrp = Hrp::parse("sp").expect("valid HRP");
            let mut data = Vec::with_capacity(17);
            data.push(0); // version byte
            data.extend_from_slice(&content_block.space_id[..16]);
            bech32::encode::<Bech32m>(hrp, &data)
                .unwrap_or_else(|_| hex::encode(&content_block.space_id[..16]))
        };

        // Convert actions to ActionInfo
        let actions: Vec<ActionInfo> = content_block
            .actions
            .iter()
            .map(|action| {
                // Convert actor to bech32 address
                let actor_address = {
                    use bech32::{Bech32m, Hrp};
                    let hrp = Hrp::parse("cs").expect("valid HRP");
                    let mut data = Vec::with_capacity(33);
                    data.push(1); // version byte
                    data.extend_from_slice(&action.actor);
                    bech32::encode::<Bech32m>(hrp, &data)
                        .unwrap_or_else(|_| hex::encode(action.actor))
                };

                let action_type_str = match action.action_type {
                    ActionType::CreateSpace => "CreateSpace",
                    ActionType::Post => "Post",
                    ActionType::Reply => "Reply",
                    ActionType::Engage => "Engage",
                    ActionType::Edit => "Edit",
                    // Private space actions
                    ActionType::Invite => "Invite",
                    ActionType::Leave => "Leave",
                    ActionType::Kick => "Kick",
                    ActionType::RevokeInvite => "RevokeInvite",
                    ActionType::KeyRotation => "KeyRotation",
                    ActionType::DMRequest => "DMRequest",
                    ActionType::AcceptDM => "AcceptDM",
                    ActionType::DeclineDM => "DeclineDM",
                    // Sponsorship actions
                    ActionType::Sponsor => "Sponsor",
                    ActionType::GenesisRegister => "GenesisRegister",
                    // Space metadata actions
                    ActionType::RenameSpace => "RenameSpace",
                };

                ActionInfo {
                    action_type: action_type_str.to_string(),
                    actor: hex::encode(action.actor),
                    actor_address,
                    timestamp: action.timestamp,
                    content_id: action
                        .content_hash
                        .map(|h| format!("sha256:{}", hex::encode(h))),
                    parent_id: action
                        .parent_id
                        .map(|h| format!("sha256:{}", hex::encode(h))),
                    pow_work: action.pow_work,
                    emoji: action.emoji,
                }
            })
            .collect();

        let result = GetContentBlockResult {
            hash: params.hash,
            thread_root_id: format!("sha256:{}", hex::encode(content_block.thread_root_id)),
            space_id: space_id_bech32,
            timestamp: content_block.timestamp,
            total_pow: content_block.total_pow,
            action_count: actions.len(),
            actions,
            merkle_root: hex::encode(content_block.merkle_root),
            prev_content_hash: content_block.prev_content_hash.map(hex::encode),
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Calculate storage usage in MB from data directory
    async fn calculate_storage_mb(&self) -> u64 {
        use std::fs;

        let data_dir = &self.node.data_dir;

        fn dir_size(path: &std::path::Path) -> u64 {
            let mut size = 0u64;
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        size += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    } else if path.is_dir() {
                        size += dir_size(&path);
                    }
                }
            }
            size
        }

        let total_bytes = dir_size(data_dir);
        total_bytes / (1024 * 1024) // Convert to MB
    }

    async fn stop(&self, id: Value) -> RpcResponse {
        // Send shutdown signal
        let _ = self.node.shutdown_tx.send(());

        RpcResponse::success(json!({"stopping": true}), id)
    }

    // ========================================================================
    // Peer Management Methods
    // ========================================================================

    async fn add_peer(&self, params: Value, id: Value) -> RpcResponse {
        let params: AddPeerParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let addr: SocketAddr = match params.address.parse() {
            Ok(a) => a,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid address: {}", e),
                    id,
                );
            }
        };

        // Get transport for establishing connection
        let transport = match &self.node.transport {
            Some(t) => t.clone(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Transport not available",
                    id,
                );
            }
        };

        // Connect to peer
        let conn = match transport.connect(addr).await {
            Ok(c) => c,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to connect to {}: {:?}", addr, e),
                    id,
                );
            }
        };

        info!("[RPC] Connected to peer {}", addr);

        // Get peer info from handshake
        let peer_info = conn.peer_info().cloned();
        let remote_addr = conn.remote_addr();

        let peer_id = match peer_info {
            Some(info) => info.node_id,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Peer handshake failed - no peer info",
                    id,
                );
            }
        };

        // Register with ConnectionManager
        if let Some(ref cm) = self.node.connection_manager {
            if let Err(e) = cm.add_connection(
                peer_id,
                remote_addr,
                crate::transport::ConnectionDirection::Outbound,
            ) {
                warn!("[RPC] Failed to register outbound connection: {}", e);
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to register connection: {}", e),
                    id,
                );
            }
        }

        // Add to connection pool and spawn message read loop
        if let (Some(ref pool), Some(ref router), Some(ref cm)) = (
            &self.node.connection_pool,
            &self.node.router,
            &self.node.connection_manager,
        ) {
            let established = conn.is_established();
            let stream = conn.into_stream();
            let peer_conn = pool.add(stream, peer_id, established).await;

            // Spawn message read loop for this outbound connection
            let router_clone = router.clone();
            let pool_clone = pool.clone();
            let cm_clone = cm.clone();

            tokio::spawn(async move {
                crate::node::tasks::BackgroundTaskRunner::message_read_loop(
                    peer_conn,
                    peer_id,
                    router_clone,
                    pool_clone,
                    cm_clone,
                )
                .await;
            });

            info!(
                "[RPC] Outbound connection to {} ({}) fully integrated",
                remote_addr,
                hex::encode(&peer_id[..8])
            );

            RpcResponse::success(
                json!({
                    "added": true,
                    "address": addr.to_string(),
                    "peer_id": hex::encode(&peer_id[..16])
                }),
                id,
            )
        } else {
            RpcResponse::error(
                RpcErrorCode::InternalError,
                "Connection pool or router not available",
                id,
            )
        }
    }

    async fn remove_peer(&self, params: Value, id: Value) -> RpcResponse {
        let params: RemovePeerParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let peer_id = match hex::decode(&params.peer_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid peer ID (must be 32-byte hex)",
                    id,
                );
            }
        };

        // Remove from connection manager
        if let Some(ref cm) = self.node.connection_manager {
            use crate::node::connection_event::DisconnectReason;
            if cm
                .remove_connection(&peer_id, DisconnectReason::Normal)
                .is_some()
            {
                return RpcResponse::success(json!({"removed": true}), id);
            }
        }

        RpcResponse::error(RpcErrorCode::PeerNotFound, "Peer not found", id)
    }

    // ========================================================================
    // Content Submission Methods
    // ========================================================================

    /// Whether a space is registered as private (`SpaceInfo.is_private`). Returns false if
    /// the space is unknown — enforcement only applies where the node knows the space is
    /// private, which is always true at the authoring node (it created/joined the space).
    fn space_is_private(&self, space_id_16: &[u8; 16]) -> bool {
        self.node
            .chain_store
            .as_ref()
            .and_then(|cs| cs.get_space(space_id_16).ok().flatten())
            .map(|s| s.is_private)
            .unwrap_or(false)
    }

    /// Phase 2 write-side enforcement for private-space confidentiality.
    ///
    /// Returns `Ok(is_private)` when the write may proceed (caller stamps `Action.private`
    /// with the returned bool), or `Err(reason)` when it must be rejected because content
    /// bound for a private space is not encrypted (text OR media). For public spaces this
    /// is a cheap `Ok(false)`. `title` is `None` for replies. `media_hashes` are the raw
    /// 32-byte blob hashes referenced by the write; their bytes are looked up in the blob
    /// store and must each be a `PRVM1` envelope.
    fn check_private_write(
        &self,
        space_id_16: &[u8; 16],
        title: Option<&str>,
        body: &str,
        media_hashes: &[[u8; 32]],
    ) -> Result<bool, String> {
        if !self.space_is_private(space_id_16) {
            return Ok(false);
        }

        // Load each referenced media blob so we can verify it is encrypted. A missing or
        // unreadable blob yields empty bytes, which fails the PRVM1 check (fail closed).
        let blob_store = BlobStore::new(&self.node.sync_blob_path).ok();
        let blobs: Vec<Vec<u8>> = media_hashes
            .iter()
            .map(|h| {
                blob_store
                    .as_ref()
                    .and_then(|bs| bs.get(&ContentBlobHash::from_bytes(*h)).ok())
                    .unwrap_or_default()
            })
            .collect();
        let blob_refs: Vec<&[u8]> = blobs.iter().map(Vec::as_slice).collect();

        match crate::crypto::private_space::private_write_violation(title, body, blob_refs) {
            Some(reason) => Err(reason),
            None => Ok(true),
        }
    }

    async fn submit_post(&self, params: Value, id: Value) -> RpcResponse {
        let params: SubmitPostParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate space ID format. Accept both the bech32m `sp1...` form and hex —
        // `decode_space_id` (below) is the real parser and handles both; this early
        // check only rejects input that can't be a space id in either form, so
        // clients aren't forced to convert to bech32 just to post.
        if let Err(e) = decode_space_id(&params.space_id) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!("Invalid space_id: {}", e),
                id,
            );
        }

        // SPONSORSHIP CHECK: Verify identity is sponsored before allowing action
        if let Err(response) = self.check_identity_sponsored(&params.author_id, &id) {
            return response;
        }

        // Validate signature
        let signature_bytes = match hex::decode(&params.signature) {
            Ok(bytes) if bytes.len() == 64 => bytes,
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature (must be 64-byte hex)",
                    id,
                );
            }
        };

        // Create content hash from post body
        let post_content = format!("{}\n\n{}", params.title, params.body);
        let content_hash = crate::crypto::sha256(post_content.as_bytes());
        let content_id = format!("sha256:{}", hex::encode(content_hash));

        // BLOCKLIST CHECK: Reject content that matches blocklist entries
        // This is the first line of defense against CSAM and illegal content
        if let Some(ref blocklist) = self.node.blocklist {
            let store = blocklist.read().unwrap();
            if store.is_blocked(&content_hash) {
                warn!(
                    "[BLOCKLIST] Rejected POST from {} - content matches blocklist",
                    hex::encode(&content_hash[..8])
                );
                return RpcResponse::error(
                    RpcErrorCode::ContentBlocked,
                    "This content matches the signature of known harmful material. If you believe this is an error, please contact support.",
                    id,
                );
            }
        }

        // Validate PoW - this is the core anti-spam mechanism
        if let Err((code, msg)) = verify_pow_submission(
            ActionType::Post,
            post_content.as_bytes(),
            &params.author_id,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Store in sync blob store
        if let Ok(blob_store) = BlobStore::new(&self.node.sync_blob_path) {
            let _ = blob_store.put(post_content.as_bytes());
        }

        // Parse author_id for BlockBuilder action
        let author_bytes: [u8; 32] = hex::decode(&params.author_id)
            .ok()
            .and_then(|v| v.try_into().ok())
            .unwrap_or([0u8; 32]);

        // Parse space_id from bech32m format (sp1...) to 16-byte identifier
        // Then pad to 32 bytes for internal SpaceId type
        let space_id_16: [u8; 16] = match decode_space_id(&params.space_id) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid space_id: {}", e),
                    id,
                );
            }
        };

        // Validate space exists on-chain before allowing posts.
        //
        // Exception: a user's own PROFILE space. Profile space IDs are
        // deterministic (sha256("profile:v1:<author_pk_hex>")[..16], matching
        // feed-client's getProfileSpaceId) and can never be created via
        // create_space, which derives space IDs from the PoW hash — so the
        // first profile post must be allowed to materialize the space (the
        // block builder creates the space block from the action's space_id,
        // exactly as for any other space).
        let is_own_profile_space = {
            let preimage = format!("profile:v1:{}", params.author_id.to_lowercase());
            let hash = crate::crypto::sha256(preimage.as_bytes());
            apply_class(SpaceClass::Profile, &hash) == space_id_16
        };
        if !is_own_profile_space {
            if let Some(ref chain_store) = self.node.chain_store {
                match chain_store.space_exists(&space_id_16) {
                    Ok(true) => {
                        // Space exists, proceed
                    }
                    Ok(false) => {
                        return RpcResponse::error(
                            RpcErrorCode::SpaceNotFound,
                            &format!(
                                "Space {} does not exist. Create it first with 'space create'.",
                                params.space_id
                            ),
                            id,
                        );
                    }
                    Err(e) => {
                        warn!("Failed to check space existence: {}", e);
                        // On error, fail closed - require space to be verifiable
                        return RpcResponse::error(
                            RpcErrorCode::InternalError,
                            &format!("Failed to verify space existence: {}", e),
                            id,
                        );
                    }
                }
            }
        }

        // Convert 16-byte space_id to 32-byte internal format (padded with zeros)
        let mut space_id_bytes: [u8; 32] = [0u8; 32];
        space_id_bytes[..16].copy_from_slice(&space_id_16);

        // Phase 2: node-enforced private-space confidentiality. If the target space is
        // private, the body must be a [PRIVATE:v1:] envelope, the title must be empty, and
        // every referenced media blob must be a PRVM1 envelope — otherwise reject the write
        // so unencrypted content never enters a private space. `is_private` stamps the
        // authenticated Action.private bit.
        let post_media_hashes: Vec<[u8; 32]> = params
            .media_refs
            .iter()
            .filter_map(|mr| hex::decode(&mr.media_hash).ok()?.try_into().ok())
            .collect();
        let is_private = match self.check_private_write(
            &space_id_16,
            Some(&params.title),
            &params.body,
            &post_media_hashes,
        ) {
            Ok(p) => p,
            Err(reason) => return RpcResponse::error(RpcErrorCode::InvalidParams, &reason, id),
        };

        // Add action to BlockBuilder for block-based propagation (SPEC_08)
        if let Some(ref block_builder) = self.node.block_builder {
            // Create signature bytes
            let mut signature_bytes_arr = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes_arr.copy_from_slice(&sig_bytes);
                }
            }

            // Estimate PoW work (inversely proportional to difficulty)
            let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;

            // Convert params media_refs to ActionMediaRef
            let action_media_refs: Vec<crate::blocks::action::ActionMediaRef> = params
                .media_refs
                .iter()
                .filter_map(|mr| {
                    let hash_bytes = hex::decode(&mr.media_hash).ok()?;
                    if hash_bytes.len() != 32 {
                        return None;
                    }
                    let mut hash_arr = [0u8; 32];
                    hash_arr.copy_from_slice(&hash_bytes);

                    let media_type = match mr.media_type.as_str() {
                        "image/jpeg" => crate::blocks::action::ActionMediaRef::TYPE_JPEG,
                        "image/png" => crate::blocks::action::ActionMediaRef::TYPE_PNG,
                        "image/gif" => crate::blocks::action::ActionMediaRef::TYPE_GIF,
                        "image/webp" => crate::blocks::action::ActionMediaRef::TYPE_WEBP,
                        _ => return None,
                    };

                    Some(crate::blocks::action::ActionMediaRef::new(
                        hash_arr,
                        media_type,
                        mr.size_bytes,
                    ))
                })
                .take(crate::blocks::action::MAX_MEDIA_REFS)
                .collect();

            // Parse replaces_pending if provided (for Replace-In-Mempool)
            let replaces_pending: Option<[u8; 32]> =
                params.replaces_pending.as_ref().and_then(|hex_str| {
                    hex::decode(hex_str).ok().and_then(|bytes| {
                        if bytes.len() == 32 {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(&bytes);
                            Some(arr)
                        } else {
                            None
                        }
                    })
                });

            let action = Action {
                action_type: crate::blocks::ActionType::Post,
                actor: author_bytes,
                timestamp: params.timestamp,
                content_hash: Some(content_hash),
                parent_id: None,
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target: crate::crypto::sha256(&params.pow_hash.as_bytes()),
                signature: signature_bytes_arr,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: action_media_refs,
                replaces_pending,
                private: is_private,
            };

            // AUTHENTICITY: verify the caller actually signed this action before it
            // enters our mempool. Prevents this node from ever building a block with a
            // forged-authorship post (front-door defense; block/gossip ingest re-check).
            if let Err(e) = crate::blocks::validate_content_action_authenticity(&action) {
                // Log the exact preimage components the node verified against so a
                // client-side signing divergence is diagnosable from the node log
                // alone (compare with the client's signed preimage).
                warn!(
                    "[RPC] submit_post authorship FAILED: actor={} content_hash={} ts={} private={} ({:?})",
                    hex::encode(&author_bytes[..8]),
                    hex::encode(content_hash),
                    params.timestamp,
                    is_private,
                    e
                );
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!(
                        "Invalid signature: action authorship verification failed ({:?})",
                        e
                    ),
                    id,
                );
            }

            // Thread ID is the content hash for a new post
            let thread_id = content_hash;

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path =
                self.resolve_branch_path(&space_id_bytes, &thread_id, Some(&author_bytes));

            // Add to block builder
            let added = match block_builder.write() {
                Ok(mut builder) => {
                    let added =
                        builder.add_action(thread_id, space_id_bytes, action.clone(), branch_path);
                    if added {
                        info!(
                            "[BLOCKS] Added POST action to block builder, total_pow={}",
                            builder.total_pow()
                        );
                    }
                    added
                }
                Err(e) => {
                    warn!(
                        "[BLOCKS] Failed to acquire block builder lock for POST: {:?}",
                        e
                    );
                    false
                }
            };

            // Broadcast action to peers (mempool gossip)
            if added {
                if self.node.connection_pool.is_some() {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload =
                        ActionAnnouncePayload::new(thread_id, space_id_bytes, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    // Announce with origin obfuscation (SWIM-PRIV-1): self-originated
                    // actions are delayed/stem-relayed instead of broadcast immediately.
                    self.gossip_self_originated_action(envelope).await;
                    info!(
                        "[MEMPOOL] Announced POST action to peers (thread={})",
                        hex::encode(&thread_id[..8])
                    );

                    // Check if PoW threshold met - form block immediately if so
                    self.try_form_block_if_threshold_met().await;
                }
            }
        } else {
            warn!("[BLOCKS] No block_builder available for POST action");
        }

        // Create and store ContentItem in content store (so get_content and list work)
        if let Some(ref content_store) = self.node.content_store {
            use crate::types::content::{
                ContentHash, ContentId, ContentItem, ContentType, MediaRef, MediaType, SpaceId,
            };
            use crate::types::identity::{IdentityId, Signature};

            // Create Signature from bytes
            let mut sig_arr = [0u8; 64];
            sig_arr.copy_from_slice(&signature_bytes);
            let signature = Signature::from_bytes(sig_arr);

            // Parse media_refs from params
            let media_refs: Vec<MediaRef> = params
                .media_refs
                .iter()
                .filter_map(|mr| {
                    // Parse media hash (hex string to ContentHash)
                    let hash_bytes = hex::decode(&mr.media_hash).ok()?;
                    if hash_bytes.len() != 32 {
                        return None;
                    }
                    let mut hash_arr = [0u8; 32];
                    hash_arr.copy_from_slice(&hash_bytes);
                    let media_hash = ContentHash::from_bytes(hash_arr);

                    // Parse media type
                    let media_type = match mr.media_type.as_str() {
                        "image/jpeg" => MediaType::ImageJpeg,
                        "image/png" => MediaType::ImagePng,
                        "image/gif" => MediaType::ImageGif,
                        "image/webp" => MediaType::ImageWebp,
                        _ => return None,
                    };

                    Some(MediaRef {
                        media_hash,
                        media_type,
                        size_bytes: mr.size_bytes,
                        inline_preview: None, // Could add thumbnail later
                    })
                })
                .collect();

            let now = params.timestamp;
            let content_item = ContentItem {
                content_id: ContentId::from_bytes(content_hash),
                content_type: ContentType::Post,
                author_id: IdentityId::from_bytes(author_bytes),
                space_id: SpaceId::from_bytes(space_id_bytes),
                parent_id: None,
                created_at: now,
                last_engagement: now,
                body_inline: Some(post_content.clone()),
                content_hash: None,
                content_size: Some(post_content.len() as u32),
                content_type_mime: Some("text/plain".to_string()),
                media_refs,
                pin_state: None,
                engagement_count: 0,
                signature,
                pow_nonce: params.pow_nonce,
                pow_difficulty: params.pow_difficulty,
                preservation_pow: None,
                display_name: self.node.identity_name.read().await.clone(),
            };

            match content_store.put(&content_item) {
                Ok(()) => {
                    if let Err(e) = content_store.flush() {
                        warn!("Failed to flush content store after post: {}", e);
                    }
                    info!("[POST] Stored ContentItem for post {}", &content_id[..24]);

                    // Index the content for full-text search
                    if let Some(ref search_index) = self.node.search_index {
                        let indexable = IndexableContent {
                            content_id: content_id.clone(),
                            space_id: params.space_id.clone(),
                            author: params.author_id.clone(),
                            title: params.title.clone(),
                            body: params.body.clone(),
                            heat: 100.0, // New posts start at 100% heat
                            timestamp: params.timestamp,
                        };
                        if let Ok(mut index) = search_index.write() {
                            if let Err(e) = index.add_content(&indexable) {
                                warn!("[SEARCH] Failed to index post: {}", e);
                            } else {
                                debug!("[SEARCH] Indexed post {}", &content_id[..24]);
                            }
                        }
                    }
                }
                Err(e) if e.to_string().contains("already exists") => {
                    debug!("Post already exists in content store: {}", content_id);
                }
                Err(e) => {
                    warn!("Failed to store post ContentItem: {}", e);
                }
            }
        }

        // Register content for decay tracking
        if let Some(ref decay) = self.node.decay_integration {
            use crate::content::decay_integration::DecayMetadata;
            let metadata = DecayMetadata {
                blob_hash: content_hash,
                content_id: content_hash,
                author_id: author_bytes,
                space_id: space_id_bytes,
                content_type: 0, // Post
                parent_id: None,
                created_at: params.timestamp * 1000,
                last_engagement: params.timestamp * 1000,
                engagement_count: 0,
                content_size: post_content.len() as u64,
                is_pinned: false,
            };
            if let Err(e) = decay.register(metadata) {
                warn!("[DECAY] Failed to register post for decay: {}", e);
            } else {
                info!(
                    "[DECAY] Registered post {} for decay tracking",
                    &content_id[..24]
                );
            }
        }

        // Broadcast via DHT + I_HAVE
        let mut recipients = 0;

        // Step 1: Record in local DHT store
        if let Some(ref dht) = self.node.dht {
            dht.add_local_content(content_hash).await;
        }

        // Step 2: Broadcast DHT_STORE and I_HAVE to connected peers
        if let Some(ref pool) = self.node.connection_pool {
            use crate::dht::{constants::MSG_DHT_STORE, DhtMessage, NodeId as DhtNodeId};
            use crate::types::network::{MessageEnvelope, MessageType};

            // Create signed DHT_STORE message for network-wide discoverability (Kademlia STORE)
            let node_id_bytes: [u8; 32] = hex::decode(&self.node.node_id)
                .unwrap_or_default()
                .try_into()
                .unwrap_or([0u8; 32]);
            let node_id = DhtNodeId::from_bytes(node_id_bytes);
            let local_addr = std::net::SocketAddr::from(([0, 0, 0, 0], self.node.p2p_port));
            let public_key = self.node.keypair.public_key.0;

            // Sign the provider claim
            let signing_msg = ProviderRecord::signing_message(&content_hash, &node_id, &local_addr);
            let signature = ed25519_sign(&self.node.keypair.private_key, &signing_msg);

            let dht_store_msg = DhtMessage::Store {
                content_hash,
                ttl: 0,
                public_key,
                signature: signature.0,
            };
            let dht_store_bytes = dht_store_msg.to_bytes();
            let mut dht_payload = vec![MSG_DHT_STORE];
            dht_payload.extend_from_slice(&dht_store_bytes);

            let dht_envelope =
                MessageEnvelope::new_fork_agnostic(MessageType::DhtStore, dht_payload);
            let dht_sent = pool.broadcast(&dht_envelope).await;
            debug!(
                "[POST] Sent DHT_STORE for {} to {} peers",
                &content_id[..24],
                dht_sent
            );

            // Send I_HAVE for immediate availability
            let i_have =
                MessageEnvelope::new_fork_agnostic(MessageType::IHave, content_hash.to_vec());
            recipients = pool.broadcast(&i_have).await;
            info!(
                "[POST] Sent I_HAVE for {} to {} peers",
                &content_id[..24],
                recipients
            );
        }

        // Recognition: the post was accepted (PoW-valid, stored). Award FirstStroke
        // on the author's first accepted post (SPEC_09 §5.3). Recognition ONLY —
        // this does not alter PoW, decay, or rate limits, and never blocks the post.
        if let Some(ref achievements) = self.node.achievement_service {
            match achievements.record_post(&author_bytes, params.timestamp) {
                Ok(unlocked) => {
                    for a in unlocked {
                        info!(
                            "[ACHIEVEMENT] Unlocked {} {} (first post)",
                            a.badge(),
                            a.name()
                        );
                    }
                }
                Err(e) => warn!("[ACHIEVEMENT] Failed to record post: {}", e),
            }
        }

        let result = SubmitPostResult {
            content_id,
            broadcast: recipients > 0,
            recipients,
        };

        // Publish real-time event for WebSocket subscribers (H-RPC-2)
        if let Some(ref events) = self.node.event_manager {
            events.publish_content_new(
                &result.content_id,
                "post",
                &params.space_id,
                &params.author_id,
                Some(&result.content_id), // A post is its own thread root
            );
        }

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Upload media (images) for attachment to posts
    async fn upload_media(&self, params: Value, id: Value) -> RpcResponse {
        use super::types::{UploadMediaParams, UploadMediaResult};
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

        let params: UploadMediaParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate media type
        let _media_type_code = match params.media_type.as_str() {
            "image/jpeg" => 0x01u8,
            "image/png" => 0x02u8,
            "image/gif" => 0x03u8,
            "image/webp" => 0x04u8,
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid media_type: must be image/jpeg, image/png, image/gif, or image/webp",
                    id,
                );
            }
        };

        // Decode base64 data
        let media_bytes = match BASE64.decode(&params.data) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid base64 data: {}", e),
                    id,
                );
            }
        };

        // Validate size (max 1MB per media - protocol enforced)
        use crate::types::constants::MAX_MEDIA_SIZE;
        if media_bytes.len() > MAX_MEDIA_SIZE {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!(
                    "Media too large: {} bytes (max {} bytes)",
                    media_bytes.len(),
                    MAX_MEDIA_SIZE
                ),
                id,
            );
        }

        // BLOCKLIST CHECK: run on the PLAINTEXT bytes (the node can see them at upload
        // time) so known-harmful media is rejected even for private spaces, where the
        // stored ciphertext hash could never match a blocklist entry.
        let plaintext_hash = crate::crypto::sha256(&media_bytes);
        if let Some(ref blocklist) = self.node.blocklist {
            let store = blocklist.read().unwrap();
            if store.is_blocked(&plaintext_hash) {
                warn!(
                    "[BLOCKLIST] Rejected MEDIA from {} - matches blocklist",
                    hex::encode(&plaintext_hash[..8])
                );
                return RpcResponse::error(
                    RpcErrorCode::ContentBlocked,
                    "This media matches the signature of known harmful material. If you believe this is an error, please contact support.",
                    id,
                );
            }
        }

        // Private-space media confidentiality: when a private space id is supplied and the
        // node is a member, encrypt to a PRVM1 envelope BEFORE hashing/storing. The
        // returned media_hash is then the hash of the ENCRYPTED blob, which is what the
        // composer mines PoW over, what the on-chain media_ref carries, and what write-side
        // enforcement re-checks as a stored PRVM1 blob. Public spaces store plaintext.
        let stored_bytes: Vec<u8> = if let Some(ref sid) = params.space_id {
            match Self::parse_space_id_16(sid) {
                Ok(space_id_16) if self.space_is_private(&space_id_16) => {
                    match self.node_space_key(&space_id_16) {
                        Ok(key) => crate::crypto::private_space::encrypt_media_with_space_key(
                            &media_bytes,
                            &key,
                        ),
                        Err((code, msg)) => return RpcResponse::error(code, &msg, id),
                    }
                }
                Ok(_) => media_bytes, // known public space → store plaintext
                Err((code, msg)) => return RpcResponse::error(code, &msg, id),
            }
        } else {
            media_bytes
        };

        // Hash the bytes we actually store (encrypted for private media).
        let media_hash = crate::crypto::sha256(&stored_bytes);
        let media_hash_hex = hex::encode(media_hash);

        // Store in blob store
        if let Ok(blob_store) = BlobStore::new(&self.node.sync_blob_path) {
            if let Err(e) = blob_store.put(&stored_bytes) {
                warn!("[MEDIA] Failed to store media: {}", e);
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Failed to store media",
                    id,
                );
            }
        }

        info!(
            "[MEDIA] Uploaded {} bytes ({}{}) hash={}",
            stored_bytes.len(),
            params.media_type,
            if params.space_id.is_some() {
                ", private?"
            } else {
                ""
            },
            &media_hash_hex[..16]
        );

        let result = UploadMediaResult {
            media_hash: media_hash_hex,
            size_bytes: stored_bytes.len() as u32,
            success: true,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get media blob by hash
    async fn get_media(&self, params: Value, id: Value) -> RpcResponse {
        use super::types::{GetMediaParams, GetMediaResult};
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

        let params: GetMediaParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse media hash
        let hash_bytes = match hex::decode(&params.media_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            Ok(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "media_hash must be 32 bytes (64 hex chars)",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid media_hash hex: {}", e),
                    id,
                );
            }
        };

        // Retrieve from blob store
        let blob_hash = ContentBlobHash::from_bytes(hash_bytes);
        let blob_store = match BlobStore::new(&self.node.sync_blob_path) {
            Ok(bs) => bs,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to open blob store: {}", e),
                    id,
                );
            }
        };

        let media_bytes = match blob_store.get(&blob_hash) {
            Ok(bytes) => bytes,
            Err(_) => {
                // Not stored locally — the image likely belongs to a remote post whose
                // blob hasn't synced yet. Actively request it from peers (mark wanted +
                // broadcast WHO_HAS; I_HAVE → auto-GET stores it), then poll briefly so
                // it loads on first view instead of showing a permanent placeholder.
                if let (Some(ref mgr), Some(ref pool)) =
                    (&self.node.content_retrieval, &self.node.connection_pool)
                {
                    use crate::types::network::{MessageEnvelope, MessageType};
                    mgr.mark_wanted(&blob_hash);
                    let env = MessageEnvelope::new_fork_agnostic(
                        MessageType::WhoHas,
                        hash_bytes.to_vec(),
                    );
                    let _ = pool.broadcast(&env).await;
                    let mut found: Option<Vec<u8>> = None;
                    for _ in 0..25 {
                        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        if let Ok(bytes) = blob_store.get(&blob_hash) {
                            found = Some(bytes);
                            break;
                        }
                    }
                    match found {
                        Some(bytes) => bytes,
                        None => {
                            return RpcResponse::error(
                                RpcErrorCode::ContentNotFound,
                                "Media not available yet (requested from peers — try again shortly)",
                                id,
                            );
                        }
                    }
                } else {
                    return RpcResponse::error(
                        RpcErrorCode::ContentNotFound,
                        "Media not found",
                        id,
                    );
                }
            }
        };

        // Private-space media: if the stored blob is a PRVM1 envelope, it is encrypted.
        // Trial-decrypt with the keys of every private space this node is a member of — the
        // AES-GCM tag authenticates the correct one. A non-member has no key that decrypts,
        // so they get an opaque not-found and never the ciphertext (serve-gating).
        let media_bytes = if crate::crypto::private_space::is_encrypted_media_envelope(&media_bytes)
        {
            let mut plaintext = None;
            for key in self.node_member_space_keys() {
                if let Ok(plain) =
                    crate::crypto::private_space::decrypt_media_with_space_key(&media_bytes, &key)
                {
                    plaintext = Some(plain);
                    break;
                }
            }
            match plaintext {
                Some(plain) => plain,
                None => {
                    return RpcResponse::error(RpcErrorCode::ContentNotFound, "Media not found", id)
                }
            }
        } else {
            media_bytes
        };

        // Detect media type from magic bytes
        let media_type = if media_bytes.len() >= 3 && media_bytes[0..3] == [0xFF, 0xD8, 0xFF] {
            "image/jpeg"
        } else if media_bytes.len() >= 8
            && media_bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        {
            "image/png"
        } else if media_bytes.len() >= 4 && media_bytes[0..4] == [0x47, 0x49, 0x46, 0x38] {
            "image/gif"
        } else if media_bytes.len() >= 4 && media_bytes[0..4] == [0x52, 0x49, 0x46, 0x46] {
            // RIFF header - check for WEBP
            if media_bytes.len() >= 12 && media_bytes[8..12] == [0x57, 0x45, 0x42, 0x50] {
                "image/webp"
            } else {
                "application/octet-stream"
            }
        } else {
            "application/octet-stream"
        };

        let result = GetMediaResult {
            media_hash: params.media_hash,
            media_type: media_type.to_string(),
            data: BASE64.encode(&media_bytes),
            size_bytes: media_bytes.len() as u32,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    async fn submit_reply(&self, params: Value, id: Value) -> RpcResponse {
        let params: SubmitReplyParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate parent content ID
        if !params.parent_id.starts_with("sha256:") {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Invalid parent content ID format",
                id,
            );
        }

        // SPONSORSHIP CHECK: Verify identity is sponsored before allowing action
        if let Err(response) = self.check_identity_sponsored(&params.author_id, &id) {
            return response;
        }

        // Create content hash
        let content_hash = crate::crypto::sha256(params.body.as_bytes());
        let content_id = format!("sha256:{}", hex::encode(content_hash));

        // BLOCKLIST CHECK: Reject content that matches blocklist entries
        if let Some(ref blocklist) = self.node.blocklist {
            let store = blocklist.read().unwrap();
            if store.is_blocked(&content_hash) {
                warn!(
                    "[BLOCKLIST] Rejected REPLY from {} - content matches blocklist",
                    hex::encode(&content_hash[..8])
                );
                return RpcResponse::error(
                    RpcErrorCode::ContentBlocked,
                    "This content matches the signature of known harmful material. If you believe this is an error, please contact support.",
                    id,
                );
            }
        }

        // Validate PoW for reply
        if let Err((code, msg)) = verify_pow_submission(
            ActionType::Reply,
            params.body.as_bytes(),
            &params.author_id,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Store in sync blob store
        if let Ok(blob_store) = BlobStore::new(&self.node.sync_blob_path) {
            let _ = blob_store.put(params.body.as_bytes());
        }

        // Record engagement on parent content (resets decay timer)
        let mut parent_hash_bytes = [0u8; 32];
        if let Some(ref decay) = self.node.decay_integration {
            // Parse parent content ID to get the blob hash
            let parent_hex = &params.parent_id[7..]; // Skip "sha256:"
            if let Ok(parent_bytes) = hex::decode(parent_hex) {
                if parent_bytes.len() == 32 {
                    parent_hash_bytes.copy_from_slice(&parent_bytes);
                    let parent_hash = ContentBlobHash::from_bytes(parent_hash_bytes);
                    if let Err(e) = decay.on_engagement(&parent_hash) {
                        debug!("Failed to record engagement for parent: {}", e);
                    } else {
                        debug!("Recorded engagement for parent {}", &parent_hex[..16]);
                    }
                }
            }
        }

        // Parse author_id for BlockBuilder action
        let author_bytes: [u8; 32] = hex::decode(&params.author_id)
            .ok()
            .and_then(|v| v.try_into().ok())
            .unwrap_or([0u8; 32]);

        // Look up parent content to get its space_id (replies inherit parent's space)
        // We check both the blockchain AND the BlockBuilder's pending actions.
        // This allows replies to content that was just submitted but hasn't been
        // finalized to a block yet (within the 30-second block formation window).
        let space_id_bytes = {
            let mut found_space_id: Option<[u8; 32]> = None;
            let mut found_in_pending = false;

            // First check blockchain (chain_store) using indexed lookup - O(1) instead of O(n)
            if let Some(ref chain_store) = self.node.chain_store {
                if let Ok(Some(metadata)) = chain_store.get_content_metadata(&parent_hash_bytes) {
                    // Found parent in index! Expand 16-byte space_id to 32-byte format
                    let mut space_id_32 = [0u8; 32];
                    space_id_32[..16].copy_from_slice(&metadata.space_id);
                    found_space_id = Some(space_id_32);
                    debug!(
                        "[REPLY] Found parent {} in blockchain index, space_id: {:?}",
                        hex::encode(&parent_hash_bytes[..8]),
                        hex::encode(&metadata.space_id[..8])
                    );
                }
            }

            // If not found in blockchain index, check content_store (synced from network)
            if found_space_id.is_none() {
                if let Some(ref content_store) = self.node.content_store {
                    let content_id = ContentId::from_bytes(parent_hash_bytes);
                    if let Ok(Some(item)) = content_store.get(&content_id) {
                        let mut space_id_32 = [0u8; 32];
                        space_id_32[..].copy_from_slice(item.space_id.as_bytes());
                        found_space_id = Some(space_id_32);
                        debug!(
                            "[REPLY] Found parent {} in content_store, space_id: {:?}",
                            hex::encode(&parent_hash_bytes[..8]),
                            hex::encode(&space_id_32[..8])
                        );
                    }
                }
            }

            // If not found in blockchain, check BlockBuilder's pending actions
            // This handles the case where a post was just submitted but hasn't
            // been finalized to a block yet (within the block formation interval)
            if found_space_id.is_none() {
                if let Some(ref block_builder) = self.node.block_builder {
                    if let Ok(builder) = block_builder.read() {
                        if let Some(space_id) = builder.find_pending_content(&parent_hash_bytes) {
                            found_space_id = Some(space_id);
                            found_in_pending = true;
                            debug!("[REPLY] Found parent {} in pending BlockBuilder actions, space_id: {:?}",
                                   hex::encode(&parent_hash_bytes[..8]),
                                   hex::encode(&space_id[..8]));
                        }
                    }
                }
            }

            match found_space_id {
                Some(space_id) => {
                    // Verify the space exists in registry (defensive check)
                    // Skip this check for pending content since the space may also be pending
                    if !found_in_pending {
                        let space_id_16: [u8; 16] = space_id[..16].try_into().unwrap_or([0u8; 16]);
                        if let Some(ref chain_store) = self.node.chain_store {
                            match chain_store.space_exists(&space_id_16) {
                                Ok(false) => {
                                    warn!(
                                        "[REPLY REJECTED] Parent's space not found in registry. \
                                           This indicates blockchain corruption."
                                    );
                                    return RpcResponse::error(
                                        RpcErrorCode::SpaceNotFound,
                                        "Parent content references unregistered space. This may indicate data corruption.",
                                        id,
                                    );
                                }
                                Err(e) => {
                                    warn!("Failed to verify space existence: {}", e);
                                }
                                Ok(true) => {} // All good
                            }
                        }
                    }
                    space_id
                }
                None => {
                    // Parent not found in blockchain or pending actions - REJECT the reply
                    warn!("[REPLY REJECTED] Parent content {} not found in blockchain or pending actions. \
                           Orphan replies are not allowed.",
                          &params.parent_id);
                    return RpcResponse::error(
                        RpcErrorCode::InvalidContentId,
                        &format!(
                            "Parent content not found in blockchain: {}. \
                                  The parent post must exist before you can reply to it.",
                            &params.parent_id
                        ),
                        id,
                    );
                }
            }
        };

        // Phase 2: node-enforced private-space confidentiality (replies have no title).
        // Reject unencrypted body/media bound for a private space; `is_private` stamps the
        // authenticated Action.private bit.
        let reply_space_id_16: [u8; 16] = space_id_bytes[..16].try_into().unwrap_or([0u8; 16]);
        let reply_media_hashes: Vec<[u8; 32]> = params
            .media_refs
            .iter()
            .filter_map(|mr| hex::decode(&mr.media_hash).ok()?.try_into().ok())
            .collect();
        let is_private = match self.check_private_write(
            &reply_space_id_16,
            None,
            &params.body,
            &reply_media_hashes,
        ) {
            Ok(p) => p,
            Err(reason) => return RpcResponse::error(RpcErrorCode::InvalidParams, &reason, id),
        };

        // Add action to BlockBuilder for block-based propagation (SPEC_08)
        if let Some(ref block_builder) = self.node.block_builder {
            // Create signature bytes
            let mut signature_bytes_arr = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes_arr.copy_from_slice(&sig_bytes);
                }
            }

            // Estimate PoW work (inversely proportional to difficulty)
            let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;

            // Parse replaces_pending if provided (for Replace-In-Mempool)
            let replaces_pending: Option<[u8; 32]> =
                params.replaces_pending.as_ref().and_then(|hex_str| {
                    hex::decode(hex_str).ok().and_then(|bytes| {
                        if bytes.len() == 32 {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(&bytes);
                            Some(arr)
                        } else {
                            None
                        }
                    })
                });

            // Media attachments (images) — mirror submit_post so replies carry them too.
            let action_media_refs: Vec<crate::blocks::action::ActionMediaRef> = params
                .media_refs
                .iter()
                .filter_map(|mr| {
                    let hash_bytes = hex::decode(&mr.media_hash).ok()?;
                    if hash_bytes.len() != 32 {
                        return None;
                    }
                    let mut hash_arr = [0u8; 32];
                    hash_arr.copy_from_slice(&hash_bytes);
                    let media_type = match mr.media_type.as_str() {
                        "image/jpeg" => crate::blocks::action::ActionMediaRef::TYPE_JPEG,
                        "image/png" => crate::blocks::action::ActionMediaRef::TYPE_PNG,
                        "image/gif" => crate::blocks::action::ActionMediaRef::TYPE_GIF,
                        "image/webp" => crate::blocks::action::ActionMediaRef::TYPE_WEBP,
                        _ => return None,
                    };
                    Some(crate::blocks::action::ActionMediaRef::new(
                        hash_arr,
                        media_type,
                        mr.size_bytes,
                    ))
                })
                .take(crate::blocks::action::MAX_MEDIA_REFS)
                .collect();

            let action = Action {
                action_type: crate::blocks::ActionType::Reply,
                actor: author_bytes,
                timestamp: params.timestamp,
                content_hash: Some(content_hash),
                parent_id: Some(parent_hash_bytes),
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target: crate::crypto::sha256(&params.pow_hash.as_bytes()),
                signature: signature_bytes_arr,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: action_media_refs,
                replaces_pending,
                private: is_private,
            };

            // AUTHENTICITY: verify the caller actually signed this reply before it
            // enters our mempool (front-door defense; block/gossip ingest re-check).
            if let Err(e) = crate::blocks::validate_content_action_authenticity(&action) {
                warn!(
                    "[RPC] submit_reply authorship FAILED: actor={} content_hash={} ts={} private={} ({:?})",
                    hex::encode(&author_bytes[..8]),
                    hex::encode(content_hash),
                    params.timestamp,
                    is_private,
                    e
                );
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!(
                        "Invalid signature: action authorship verification failed ({:?})",
                        e
                    ),
                    id,
                );
            }

            // Thread ID is the parent post's hash (replies belong to parent thread)
            let thread_id = parent_hash_bytes;

            // Replies inherit the parent thread's branch (SPEC_08 §4.3)
            let branch_path =
                self.resolve_branch_path(&space_id_bytes, &thread_id, Some(&author_bytes));

            // Add to block builder
            let added = match block_builder.write() {
                Ok(mut builder) => {
                    let added =
                        builder.add_action(thread_id, space_id_bytes, action.clone(), branch_path);
                    if added {
                        info!(
                            "[BLOCKS] Added REPLY action to block builder, total_pow={}",
                            builder.total_pow()
                        );
                    }
                    added
                }
                Err(e) => {
                    warn!(
                        "[BLOCKS] Failed to acquire block builder lock for REPLY: {:?}",
                        e
                    );
                    false
                }
            };

            // Broadcast action to peers (mempool gossip)
            if added {
                if self.node.connection_pool.is_some() {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload =
                        ActionAnnouncePayload::new(thread_id, space_id_bytes, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    // Origin obfuscation (SWIM-PRIV-1): delay/stem self-originated announce.
                    self.gossip_self_originated_action(envelope).await;
                    info!(
                        "[MEMPOOL] Announced REPLY action to peers (thread={})",
                        hex::encode(&thread_id[..8])
                    );

                    // Check if PoW threshold met - form block immediately if so
                    self.try_form_block_if_threshold_met().await;
                }
            }
        } else {
            warn!("[BLOCKS] No block_builder available for REPLY action");
        }

        // Create and store ContentItem in content store (so get_replies works)
        if let Some(ref content_store) = self.node.content_store {
            use crate::types::content::{
                ContentHash, ContentId, ContentItem, ContentType, MediaRef, MediaType, SpaceId,
            };
            use crate::types::identity::{IdentityId, Signature};

            // Create Signature from bytes
            let mut sig_arr = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    sig_arr.copy_from_slice(&sig_bytes);
                }
            }
            let signature = Signature::from_bytes(sig_arr);

            // Parse media_refs so the stored reply references its uploaded images
            // (get_replies returns these; without them the client shows no picture).
            let media_refs: Vec<MediaRef> = params
                .media_refs
                .iter()
                .filter_map(|mr| {
                    let hash_bytes = hex::decode(&mr.media_hash).ok()?;
                    if hash_bytes.len() != 32 {
                        return None;
                    }
                    let mut hash_arr = [0u8; 32];
                    hash_arr.copy_from_slice(&hash_bytes);
                    let media_type = match mr.media_type.as_str() {
                        "image/jpeg" => MediaType::ImageJpeg,
                        "image/png" => MediaType::ImagePng,
                        "image/gif" => MediaType::ImageGif,
                        "image/webp" => MediaType::ImageWebp,
                        _ => return None,
                    };
                    Some(MediaRef {
                        media_hash: ContentHash::from_bytes(hash_arr),
                        media_type,
                        size_bytes: mr.size_bytes,
                        inline_preview: None,
                    })
                })
                .collect();

            let now = params.timestamp;
            let content_item = ContentItem {
                content_id: ContentId::from_bytes(content_hash),
                content_type: ContentType::Reply,
                author_id: IdentityId::from_bytes(author_bytes),
                space_id: SpaceId::from_bytes(space_id_bytes),
                parent_id: Some(ContentId::from_bytes(parent_hash_bytes)),
                created_at: now,
                last_engagement: now,
                body_inline: Some(params.body.clone()),
                content_hash: None,
                content_size: Some(params.body.len() as u32),
                content_type_mime: Some("text/plain".to_string()),
                media_refs,
                pin_state: None,
                engagement_count: 0,
                signature,
                pow_nonce: params.pow_nonce,
                pow_difficulty: params.pow_difficulty,
                preservation_pow: None,
                display_name: self.node.identity_name.read().await.clone(),
            };

            match content_store.put(&content_item) {
                Ok(()) => {
                    if let Err(e) = content_store.flush() {
                        warn!("Failed to flush content store after reply: {}", e);
                    }
                    info!(
                        "[REPLY] Stored ContentItem for reply {} with parent {}",
                        &content_id[..24],
                        &params.parent_id[..24]
                    );

                    // Update aggregation cache to increment parent's reply count
                    if let Some(ref agg_cache) = self.node.aggregation_cache {
                        let parent_content_id = ContentId::from_bytes(parent_hash_bytes);
                        if let Err(e) = agg_cache.increment_reply_count(&parent_content_id) {
                            warn!("[REPLY] Failed to increment reply count for parent: {}", e);
                        } else {
                            debug!(
                                "[REPLY] Incremented reply count for parent {}",
                                &params.parent_id[..24]
                            );
                        }
                    }

                    // Index the reply for full-text search
                    if let Some(ref search_index) = self.node.search_index {
                        // Convert space_id bytes to bech32m format for index
                        let space_id_16: [u8; 16] =
                            space_id_bytes[..16].try_into().unwrap_or([0u8; 16]);
                        let space_id_str = encode_space_id(&space_id_16);

                        let indexable = IndexableContent {
                            content_id: content_id.clone(),
                            space_id: space_id_str,
                            author: params.author_id.clone(),
                            title: String::new(), // Replies don't have titles
                            body: params.body.clone(),
                            heat: 100.0, // New replies start at 100% heat
                            timestamp: params.timestamp,
                        };
                        if let Ok(mut index) = search_index.write() {
                            if let Err(e) = index.add_content(&indexable) {
                                warn!("[SEARCH] Failed to index reply: {}", e);
                            } else {
                                debug!("[SEARCH] Indexed reply {}", &content_id[..24]);
                            }
                        }
                    }
                }
                Err(e) if e.to_string().contains("already exists") => {
                    debug!("Reply already exists in content store: {}", content_id);
                }
                Err(e) => {
                    warn!("Failed to store reply ContentItem: {}", e);
                }
            }
        }

        // Register reply for decay tracking
        if let Some(ref decay) = self.node.decay_integration {
            use crate::content::decay_integration::DecayMetadata;
            let metadata = DecayMetadata {
                blob_hash: content_hash,
                content_id: content_hash,
                author_id: author_bytes,
                space_id: space_id_bytes,
                content_type: 1, // Reply
                parent_id: Some(parent_hash_bytes),
                created_at: params.timestamp * 1000,
                last_engagement: params.timestamp * 1000,
                engagement_count: 0,
                content_size: params.body.len() as u64,
                is_pinned: false,
            };
            if let Err(e) = decay.register(metadata) {
                warn!("[DECAY] Failed to register reply for decay: {}", e);
            } else {
                info!(
                    "[DECAY] Registered reply {} for decay tracking",
                    &content_id[..24]
                );
            }
        }

        // Broadcast via DHT + I_HAVE
        let mut recipients = 0;

        // Step 1: Record in local DHT store
        if let Some(ref dht) = self.node.dht {
            dht.add_local_content(content_hash).await;
        }

        // Step 2: Broadcast DHT_STORE and I_HAVE to connected peers
        if let Some(ref pool) = self.node.connection_pool {
            use crate::dht::{constants::MSG_DHT_STORE, DhtMessage, NodeId as DhtNodeId};
            use crate::types::network::{MessageEnvelope, MessageType};

            // Create signed DHT_STORE message for network-wide discoverability (Kademlia STORE)
            let node_id_bytes: [u8; 32] = hex::decode(&self.node.node_id)
                .unwrap_or_default()
                .try_into()
                .unwrap_or([0u8; 32]);
            let node_id = DhtNodeId::from_bytes(node_id_bytes);
            let local_addr = std::net::SocketAddr::from(([0, 0, 0, 0], self.node.p2p_port));
            let public_key = self.node.keypair.public_key.0;

            // Sign the provider claim
            let signing_msg = ProviderRecord::signing_message(&content_hash, &node_id, &local_addr);
            let signature = ed25519_sign(&self.node.keypair.private_key, &signing_msg);

            let dht_store_msg = DhtMessage::Store {
                content_hash,
                ttl: 0,
                public_key,
                signature: signature.0,
            };
            let dht_store_bytes = dht_store_msg.to_bytes();
            let mut dht_payload = vec![MSG_DHT_STORE];
            dht_payload.extend_from_slice(&dht_store_bytes);

            let dht_envelope =
                MessageEnvelope::new_fork_agnostic(MessageType::DhtStore, dht_payload);
            let dht_sent = pool.broadcast(&dht_envelope).await;
            debug!(
                "[REPLY] Sent DHT_STORE for {} to {} peers",
                &content_id[..24],
                dht_sent
            );

            // Send I_HAVE for immediate availability
            let i_have =
                MessageEnvelope::new_fork_agnostic(MessageType::IHave, content_hash.to_vec());
            recipients = pool.broadcast(&i_have).await;
            info!(
                "[REPLY] Sent I_HAVE for {} to {} peers",
                &content_id[..24],
                recipients
            );
        }

        let result = SubmitPostResult {
            content_id,
            broadcast: recipients > 0,
            recipients,
        };

        // Publish real-time event for WebSocket subscribers (H-RPC-2)
        if let Some(ref events) = self.node.event_manager {
            let space_id_16: [u8; 16] = space_id_bytes[..16].try_into().unwrap_or([0u8; 16]);
            events.publish_content_new(
                &result.content_id,
                "reply",
                &encode_space_id(&space_id_16),
                &params.author_id,
                Some(&params.parent_id), // Thread root = parent content
            );
        }

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Submit an edit to existing content (only original author can edit)
    async fn submit_edit(&self, params: Value, id: Value) -> RpcResponse {
        use crate::rpc::types::SubmitEditParams;

        let params: SubmitEditParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate original content ID format
        if !params.original_content_id.starts_with("sha256:") {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Invalid original content ID format (must start with sha256:)",
                id,
            );
        }

        // Parse original content ID
        let original_hex = &params.original_content_id[7..];
        let original_hash: [u8; 32] = match hex::decode(original_hex)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidContentId,
                    "Invalid original content hash",
                    id,
                );
            }
        };

        // Parse author ID
        let author_bytes: [u8; 32] = match hex::decode(&params.author_id)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid author_id (must be 32-byte hex)",
                    id,
                );
            }
        };

        // Look up original content and verify authorship
        let (space_id_bytes, thread_id, original_author) = {
            let mut found_space_id: Option<[u8; 32]> = None;
            let mut found_thread_id: Option<[u8; 32]> = None;
            let mut found_author: Option<[u8; 32]> = None;

            // Check content store
            if let Some(ref content_store) = self.node.content_store {
                use crate::types::content::ContentId;
                let content_id = ContentId::from_bytes(original_hash);
                if let Ok(Some(item)) = content_store.get(&content_id) {
                    let mut space_id_32 = [0u8; 32];
                    space_id_32[..].copy_from_slice(item.space_id.as_bytes());
                    found_space_id = Some(space_id_32);
                    found_author = Some(*item.author_id.as_bytes());
                    // Thread ID is the original content ID for posts, or parent_id for replies
                    found_thread_id = item
                        .parent_id
                        .map(|p| *p.as_bytes())
                        .or(Some(original_hash));
                }
            }

            // Check blockchain index
            if found_author.is_none() {
                if let Some(ref chain_store) = self.node.chain_store {
                    if let Ok(Some(metadata)) = chain_store.get_content_metadata(&original_hash) {
                        let mut space_id_32 = [0u8; 32];
                        space_id_32[..16].copy_from_slice(&metadata.space_id);
                        found_space_id = Some(space_id_32);
                        found_author = Some(metadata.author);
                        // parent_hash is zero for posts, so use original_hash as thread_id if zero
                        let is_zero = metadata.parent_hash.iter().all(|&b| b == 0);
                        found_thread_id = if is_zero {
                            Some(original_hash)
                        } else {
                            Some(metadata.parent_hash)
                        };
                    }
                }
            }

            match (found_space_id, found_thread_id, found_author) {
                (Some(space_id), Some(thread_id), Some(author)) => (space_id, thread_id, author),
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidContentId,
                        "Original content not found",
                        id,
                    );
                }
            }
        };

        // Verify the editor is the original author
        if author_bytes != original_author {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Only the original author can edit this content",
                id,
            );
        }

        // Create new content hash. An EMPTY title must hash exactly like an
        // absent one: every client computes the signing preimage with JS
        // truthiness (`title ? `${title}\n\n${body}` : body`), so treating
        // Some("") as a real title here produced a "\n\n"-prefixed hash the
        // client never signed — every empty-title edit (feed posts, profile
        // posts) failed with "action authorship verification failed".
        let edit_content = match params.title.as_deref() {
            Some(title) if !title.is_empty() => format!("{}\n\n{}", title, params.body),
            _ => params.body.clone(),
        };
        let new_content_hash = crate::crypto::sha256(edit_content.as_bytes());
        let content_id = format!("sha256:{}", hex::encode(new_content_hash));

        // BLOCKLIST CHECK
        if let Some(ref blocklist) = self.node.blocklist {
            let store = blocklist.read().unwrap();
            if store.is_blocked(&new_content_hash) {
                return RpcResponse::error(
                    RpcErrorCode::ContentBlocked,
                    "This content matches the signature of known harmful material. If you believe this is an error, please contact support.",
                    id,
                );
            }
        }

        // Validate PoW
        if let Err((code, msg)) = verify_pow_submission(
            ActionType::Edit,
            edit_content.as_bytes(),
            &params.author_id,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Store in sync blob store
        if let Ok(blob_store) = BlobStore::new(&self.node.sync_blob_path) {
            let _ = blob_store.put(edit_content.as_bytes());
        }

        // Create signature bytes
        let mut signature_bytes_arr = [0u8; 64];
        if let Ok(sig_bytes) = hex::decode(&params.signature) {
            if sig_bytes.len() == 64 {
                signature_bytes_arr.copy_from_slice(&sig_bytes);
            }
        }

        // Estimate PoW work
        let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;

        // Parse replaces_pending if provided (for Replace-In-Mempool)
        // This is the key use case: coalescing create+edit into a single on-chain action
        let replaces_pending: Option<[u8; 32]> =
            params.replaces_pending.as_ref().and_then(|hex_str| {
                hex::decode(hex_str).ok().and_then(|bytes| {
                    if bytes.len() == 32 {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&bytes);
                        Some(arr)
                    } else {
                        None
                    }
                })
            });

        // Create Edit action
        let action = Action {
            action_type: crate::blocks::ActionType::Edit,
            actor: author_bytes,
            timestamp: params.timestamp,
            content_hash: Some(new_content_hash),
            parent_id: Some(original_hash),
            pow_nonce: params.pow_nonce,
            pow_work,
            pow_target: crate::crypto::sha256(params.pow_hash.as_bytes()),
            signature: signature_bytes_arr,
            emoji: None,
            display_name: self.node.identity_name.read().await.clone(),
            media_refs: vec![],
            replaces_pending,
            private: false,
        };

        // AUTHENTICITY: verify the caller actually signed this edit before it enters
        // our mempool (front-door defense; block/gossip ingest re-check).
        if let Err(e) = crate::blocks::validate_content_action_authenticity(&action) {
            warn!(
                "[RPC] submit_edit authorship FAILED: actor={} content_hash={} ts={} title_empty={} ({:?})",
                hex::encode(&author_bytes[..8]),
                hex::encode(new_content_hash),
                params.timestamp,
                params.title.as_deref().map_or(true, str::is_empty),
                e
            );
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!(
                    "Invalid signature: action authorship verification failed ({:?})",
                    e
                ),
                id,
            );
        }

        // Add to block builder
        if let Some(ref block_builder) = self.node.block_builder {
            // Edits stay with their thread's branch (SPEC_08 §4.3)
            let branch_path =
                self.resolve_branch_path(&space_id_bytes, &thread_id, Some(&author_bytes));
            let added = match block_builder.write() {
                Ok(mut builder) => {
                    let added =
                        builder.add_action(thread_id, space_id_bytes, action.clone(), branch_path);
                    if added {
                        info!(
                            "[BLOCKS] Added EDIT action to block builder, total_pow={}",
                            builder.total_pow()
                        );
                    }
                    added
                }
                Err(e) => {
                    warn!(
                        "[BLOCKS] Failed to acquire block builder lock for EDIT: {:?}",
                        e
                    );
                    false
                }
            };

            // Broadcast action to peers
            if added {
                if self.node.connection_pool.is_some() {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload =
                        ActionAnnouncePayload::new(thread_id, space_id_bytes, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    // Origin obfuscation (SWIM-PRIV-1): delay/stem self-originated announce.
                    self.gossip_self_originated_action(envelope).await;
                    info!(
                        "[MEMPOOL] Announced EDIT action (original={}, new={})",
                        hex::encode(&original_hash[..8]),
                        hex::encode(&new_content_hash[..8])
                    );

                    self.try_form_block_if_threshold_met().await;
                }
            }
        }

        // Store the edit relationship in content store
        if let Some(ref content_store) = self.node.content_store {
            use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
            use crate::types::identity::{IdentityId, Signature};

            let mut sig_arr = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    sig_arr.copy_from_slice(&sig_bytes);
                }
            }

            let content_item = ContentItem {
                content_id: ContentId::from_bytes(new_content_hash),
                content_type: ContentType::Edit,
                author_id: IdentityId::from_bytes(author_bytes),
                space_id: SpaceId::from_bytes(space_id_bytes),
                parent_id: Some(ContentId::from_bytes(original_hash)),
                created_at: params.timestamp,
                last_engagement: params.timestamp,
                body_inline: Some(edit_content.clone()),
                content_hash: None,
                content_size: Some(edit_content.len() as u32),
                content_type_mime: Some("text/plain".to_string()),
                media_refs: vec![],
                pin_state: None,
                engagement_count: 0,
                signature: Signature::from_bytes(sig_arr),
                pow_nonce: params.pow_nonce,
                pow_difficulty: params.pow_difficulty,
                preservation_pow: None,
                display_name: self.node.identity_name.read().await.clone(),
            };

            if let Err(e) = content_store.put(&content_item) {
                warn!("Failed to store edit ContentItem: {}", e);
            } else {
                info!(
                    "[EDIT] Stored edit for content {} -> {}",
                    hex::encode(&original_hash[..8]),
                    hex::encode(&new_content_hash[..8])
                );
            }
        }

        let result = SubmitPostResult {
            content_id,
            broadcast: true,
            recipients: 0,
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    async fn submit_engagement(&self, params: Value, id: Value) -> RpcResponse {
        let params: SubmitEngagementParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate content ID
        if !params.content_id.starts_with("sha256:") {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Invalid content ID format",
                id,
            );
        }

        // SPONSORSHIP CHECK: Verify identity is sponsored before allowing engagement
        if let Err(response) = self.check_identity_sponsored(&params.author_id, &id) {
            return response;
        }

        // Parse content ID
        let content_hex = &params.content_id[7..]; // Skip "sha256:"
        let content_bytes: [u8; 32] = match hex::decode(content_hex)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidContentId,
                    "Invalid content hash",
                    id,
                );
            }
        };

        // Parse author ID
        let author_bytes: [u8; 32] = match hex::decode(&params.author_id)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid author_id format",
                    id,
                );
            }
        };

        // Validate PoW for engagement (uses raw content hash bytes for PoW)
        // Note: We pass the raw content_bytes directly since the frontend uses
        // the raw hash bytes, not SHA256(hash_string)
        if let Err((code, msg)) = verify_pow_submission_raw(
            ActionType::Engage,
            &content_bytes,
            &author_bytes,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Parse signature for reaction storage
        let signature_bytes: [u8; 64] = match hex::decode(&params.signature)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature format",
                    id,
                );
            }
        };

        // Verify Ed25519 signature (C-ENGAGE-1: Critical security fix)
        // Message format matches frontend: "engage:{contentId}:{nonce}:{timestamp}[:emoji]"
        let signing_message = if let Some(emoji) = params.emoji {
            format!(
                "engage:{}:{}:{}:{}",
                params.content_id, params.pow_nonce, params.timestamp, emoji
            )
        } else {
            format!(
                "engage:{}:{}:{}",
                params.content_id, params.pow_nonce, params.timestamp
            )
        };
        let pubkey = PublicKey(author_bytes);
        let sig = Signature(signature_bytes);
        if !ed25519_verify(&pubkey, signing_message.as_bytes(), &sig) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid signature: engagement signature verification failed",
                id,
            );
        }

        // Reactions are NOT materialized into the content store here. They ride
        // the canonical pipeline: mempool (now persisted to disk, survives
        // restart) → gossip → block → apply. get_reactions counts the persisted
        // mempool + the store, so a submitted reaction shows immediately and
        // exactly once. (Earlier this wrote optimistically to the store, which
        // double-counted against the pending mempool entry.)
        let reaction_stored = false;
        info!("[ENGAGE] Processing emoji: {:?}", params.emoji);

        // Record engagement to reset decay timer
        let mut engagement_recorded = false;
        if let Some(ref decay) = self.node.decay_integration {
            let content_hash = ContentBlobHash::from_bytes(content_bytes);
            match decay.on_engagement(&content_hash) {
                Ok(true) => {
                    engagement_recorded = true;
                    debug!("Recorded engagement for content {}", &content_hex[..16]);
                }
                Ok(false) => {
                    debug!("Content {} not registered for decay", &content_hex[..16]);
                }
                Err(e) => {
                    debug!("Failed to record engagement: {}", e);
                }
            }
        }

        // Update content's last_engagement timestamp
        if let Some(ref content_store) = self.node.content_store {
            let content_id = ContentId::from_bytes(content_bytes);
            let _ = content_store.update_last_engagement(&content_id, params.timestamp * 1000);
        }

        // Space/thread context for the content_engaged event (filled in when the
        // target content is found in the content store below)
        let mut event_space_id: Option<String> = None;
        let mut event_thread_id: Option<String> = None;

        // Add ENGAGE action to BlockBuilder for network propagation
        if let Some(ref block_builder) = self.node.block_builder {
            // Look up content to get space_id and thread context
            if let Some(ref content_store) = self.node.content_store {
                let content_id = ContentId::from_bytes(content_bytes);
                match content_store.get(&content_id) {
                    Ok(Some(content)) => {
                        let space_id_bytes = *content.space_id.as_bytes();

                        // Thread ID: for replies, use parent_id; for posts, use content_id itself
                        let thread_id = content
                            .parent_id
                            .map(|p| *p.as_bytes())
                            .unwrap_or(content_bytes);

                        // Capture context for the real-time event
                        let space_id_16: [u8; 16] =
                            space_id_bytes[..16].try_into().unwrap_or([0u8; 16]);
                        event_space_id = Some(encode_space_id(&space_id_16));
                        event_thread_id = Some(format!("sha256:{}", hex::encode(thread_id)));

                        // Estimate PoW work (inversely proportional to difficulty)
                        let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;

                        let action = Action {
                            action_type: crate::blocks::ActionType::Engage,
                            actor: author_bytes,
                            timestamp: params.timestamp,
                            content_hash: Some(content_bytes), // Target content
                            parent_id: None,
                            pow_nonce: params.pow_nonce,
                            pow_work,
                            pow_target: crate::crypto::sha256(&params.pow_hash.as_bytes()),
                            signature: signature_bytes,
                            emoji: params.emoji,
                            display_name: None,
                            media_refs: vec![], // ENGAGE actions don't have media
                            replaces_pending: None,
                            private: false,
                        };

                        // Engagements go to the TARGET content's branch (SPEC_08 §4.3)
                        let branch_path = self.resolve_branch_path(
                            &space_id_bytes,
                            &thread_id,
                            Some(&author_bytes),
                        );
                        let added = if let Ok(mut builder) = block_builder.write() {
                            let added = builder.add_action(
                                thread_id,
                                space_id_bytes,
                                action.clone(),
                                branch_path,
                            );
                            if added {
                                info!("[BLOCKS] Added ENGAGE action to block builder, total_pow={}, emoji={:?}",
                                      builder.total_pow(), params.emoji);
                            }
                            added
                        } else {
                            false
                        };

                        // Broadcast action to peers (mempool gossip)
                        if added {
                            if self.node.connection_pool.is_some() {
                                use crate::network::messages::ActionAnnouncePayload;
                                use crate::types::network::{MessageEnvelope, MessageType};

                                let action_data = action.serialize();
                                let payload = ActionAnnouncePayload::new(
                                    thread_id,
                                    space_id_bytes,
                                    action_data,
                                );
                                let envelope = MessageEnvelope::new_fork_agnostic(
                                    MessageType::ActionAnnounce,
                                    payload.to_bytes().to_vec(),
                                );

                                // Origin obfuscation (SWIM-PRIV-1): delay/stem self-originated announce.
                                self.gossip_self_originated_action(envelope).await;
                                info!(
                                    "[MEMPOOL] Announced ENGAGE action to peers (thread={})",
                                    hex::encode(&thread_id[..8])
                                );

                                // Check if PoW threshold met - form block immediately if so
                                self.try_form_block_if_threshold_met().await;
                            }
                        }
                    }
                    Ok(None) => {
                        warn!("[BLOCKS] Cannot add ENGAGE to block builder: content not found in content_store");
                    }
                    Err(e) => {
                        warn!(
                            "[BLOCKS] Cannot add ENGAGE to block builder: content_store error: {}",
                            e
                        );
                    }
                }
            } else {
                warn!("[BLOCKS] Cannot add ENGAGE to block builder: content_store not available");
            }
        } else {
            warn!("[BLOCKS] No block_builder available for ENGAGE action");
        }

        // Publish real-time event for WebSocket subscribers (H-RPC-2)
        if let Some(ref events) = self.node.event_manager {
            events.publish_content_engaged(
                &params.content_id,
                &params.author_id,
                params.emoji,
                event_space_id.as_deref(),
                event_thread_id.as_deref(),
            );
        }

        RpcResponse::success(
            json!({
                "engaged": engagement_recorded,
                "reaction_stored": reaction_stored,
                "content_id": params.content_id,
                "emoji": params.emoji
            }),
            id,
        )
    }

    // ========================================================================
    // Content Query Methods
    // ========================================================================

    async fn get_content(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate and parse content ID
        let content_hash = if params.content_id.starts_with("sha256:") {
            match hex::decode(&params.content_id[7..]) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidContentId,
                        "Invalid content hash",
                        id,
                    );
                }
            }
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Content ID must start with sha256:",
                id,
            );
        };

        // Use shared content store
        let content_store = match &self.node.content_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    "Content store not available",
                    id,
                );
            }
        };

        let content_id_typed = crate::types::content::ContentId::from_bytes(content_hash);
        let blob_hash = ContentBlobHash::from_bytes(content_hash);

        // First, try PersistentContentStore (for full ContentItem metadata)
        if let Ok(Some(item)) = content_store.get(&content_id_typed) {
            // Get decay state from DecayIntegration (the source of truth)
            let (
                decay_state_str,
                seconds_until_decay_starts,
                seconds_until_pruned,
                survival_probability,
                is_protected,
                time_since_engagement,
            ) = if let Some(ref decay) = self.node.decay_integration {
                if let Ok(Some(decay_state)) = decay.get_decay_state(&blob_hash) {
                    let state_str = if decay_state.is_protected {
                        "protected"
                    } else if decay_state.survival_probability >= 0.5 {
                        "active"
                    } else if decay_state.survival_probability >= 0.0625 {
                        "stale"
                    } else {
                        "decayed"
                    };

                    // Calculate seconds until decay starts (floor protection remaining)
                    let floor_remaining = if decay_state.is_protected {
                        // Floor is 48 hours from last engagement
                        Some(
                            crate::types::constants::DECAY_FLOOR_SECS
                                .saturating_sub(decay_state.time_since_engagement),
                        )
                    } else {
                        None
                    };

                    // Calculate seconds until pruned (when survival < 6.25%)
                    // survival = 0.5^(t/half_life), solve for t when survival = 0.0625
                    // 0.0625 = 0.5^(t/half_life) => t = 4 * half_life
                    // Total time from last engagement: floor + 4*half_life
                    let seconds_until_pruned = if decay_state.is_protected {
                        // From now: floor_remaining + 4*half_life
                        let half_life = crate::types::constants::HALF_LIFE_SECS;
                        Some(
                            crate::types::constants::DECAY_FLOOR_SECS
                                .saturating_sub(decay_state.time_since_engagement)
                                + 4 * half_life,
                        )
                    } else if !decay_state.is_decayed {
                        // Already past floor, calculate remaining time
                        // effective_time = time_since_engagement - floor
                        // survival = 0.5^(effective_time/half_life)
                        // We need to reach survival = 0.0625, so 4 half-lives total
                        let half_life = crate::types::constants::HALF_LIFE_SECS;
                        let effective_time = decay_state
                            .time_since_engagement
                            .saturating_sub(crate::types::constants::DECAY_FLOOR_SECS);
                        let total_time_needed = 4 * half_life; // 4 half-lives = 28 days
                        Some(total_time_needed.saturating_sub(effective_time))
                    } else {
                        Some(0) // Already decayed
                    };

                    (
                        state_str.to_string(),
                        floor_remaining,
                        seconds_until_pruned,
                        decay_state.survival_probability,
                        decay_state.is_protected,
                        decay_state.time_since_engagement,
                    )
                } else {
                    // No decay metadata, calculate from ContentItem directly
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;
                    let time_since = (now_ms - item.last_engagement) / 1000;
                    let is_prot = time_since < crate::types::constants::DECAY_FLOOR_SECS;
                    let floor_rem = if is_prot {
                        Some(crate::types::constants::DECAY_FLOOR_SECS - time_since)
                    } else {
                        None
                    };
                    (
                        "active".to_string(),
                        floor_rem,
                        None,
                        1.0,
                        is_prot,
                        time_since,
                    )
                }
            } else {
                // No decay integration available
                ("active".to_string(), None, None, 1.0, false, 0)
            };

            // Parse title from body (format is "Title\n\nBody")
            let body_text = item.body_inline.as_deref().unwrap_or("");
            let (title, body) = if let Some(idx) = body_text.find("\n\n") {
                let (t, b) = body_text.split_at(idx);
                (
                    Some(t.to_string()),
                    b.trim_start_matches("\n\n").to_string(),
                )
            } else {
                (None, body_text.to_string())
            };

            // Convert media_refs to MediaRefResult
            let media_refs: Vec<MediaRefResult> = item
                .media_refs
                .iter()
                .map(|mr| {
                    let media_type_str = match mr.media_type {
                        crate::types::content::MediaType::ImageJpeg => "image/jpeg",
                        crate::types::content::MediaType::ImagePng => "image/png",
                        crate::types::content::MediaType::ImageGif => "image/gif",
                        crate::types::content::MediaType::ImageWebp => "image/webp",
                    };
                    MediaRefResult {
                        media_hash: hex::encode(mr.media_hash.as_bytes()),
                        media_type: media_type_str.to_string(),
                        size_bytes: mr.size_bytes,
                    }
                })
                .collect();

            // Calculate reply count from chain + mempool
            let reply_count = {
                let mut count = 0u64;

                // Count ALL replies recursively from chain index (short-TTL cached)
                count += self.cached_reply_count(&content_hash);

                // Count pending replies from mempool (recursive)
                if let Some(ref block_builder) = self.node.block_builder {
                    if let Ok(bb) = block_builder.read() {
                        let pending = bb.get_pending_actions();
                        let mut target_parents: std::collections::HashSet<[u8; 32]> =
                            std::collections::HashSet::new();
                        target_parents.insert(content_hash);

                        loop {
                            let mut found_new = false;
                            for (_thread_id, _space_id, action) in &pending {
                                if action.action_type == crate::blocks::action::ActionType::Reply {
                                    if let (Some(parent_id), Some(reply_hash)) =
                                        (action.parent_id, action.content_hash)
                                    {
                                        if target_parents.contains(&parent_id)
                                            && !target_parents.contains(&reply_hash)
                                        {
                                            count += 1;
                                            target_parents.insert(reply_hash);
                                            found_new = true;
                                        }
                                    }
                                }
                            }
                            if !found_new {
                                break;
                            }
                        }
                    }
                }
                count
            };

            // Normalize timestamps to milliseconds
            // Some content was stored with seconds (from network sync), some with ms (from RPC)
            // If timestamp < 10 billion, it's likely seconds; convert to ms
            let created_at_ms = if item.created_at < 10_000_000_000 {
                item.created_at * 1000
            } else {
                item.created_at
            };
            let last_engagement_ms = if item.last_engagement < 10_000_000_000 {
                item.last_engagement * 1000
            } else {
                item.last_engagement
            };

            let result = GetContentResult {
                content_id: params.content_id,
                content_type: format!("{:?}", item.content_type),
                author_id: crate::crypto::address::encode_address(&item.author_id),
                space_id: hex::encode(item.space_id.as_bytes()),
                parent_id: item
                    .parent_id
                    .map(|p: ContentId| format!("sha256:{}", hex::encode(p.as_bytes()))),
                created_at: created_at_ms,
                last_engagement: last_engagement_ms,
                body: Some(body),
                title,
                engagement_count: item.engagement_count as u64,
                decay_state: decay_state_str,
                seconds_until_decay_starts,
                seconds_until_pruned,
                survival_probability,
                is_protected,
                time_since_engagement,
                media_refs,
                reply_count,
                display_name: item.display_name.clone(),
            };
            return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
        }

        // Second, try BlobStore directly (for raw content bytes)
        // This handles the case where content was posted but not yet in ContentItem form
        if let Ok(blob_store) = BlobStore::new(&self.node.sync_blob_path) {
            if let Ok(content_bytes) = blob_store.get(&blob_hash) {
                let body_str = String::from_utf8_lossy(&content_bytes);

                // Try to find metadata from ChainStore
                let mut author_id = String::new();
                let mut space_id = String::new();
                let mut created_at = 0u64;
                let mut content_type = "Post".to_string();
                let mut parent_id_opt: Option<String> = None;
                let mut found_media_refs: Vec<crate::blocks::action::ActionMediaRef> = vec![];

                if let Some(ref chain_store) = self.node.chain_store {
                    // Search for this content in content blocks
                    for result in chain_store.iter_content_blocks() {
                        if let Ok(content_block) = result {
                            for action in &content_block.actions {
                                if let Some(action_hash) = action.content_hash {
                                    if action_hash == content_hash {
                                        // Found the action that created this content
                                        author_id = crate::crypto::address::encode_address(
                                            &crate::types::identity::IdentityId(action.actor),
                                        );
                                        space_id = format!(
                                            "sp1{}",
                                            hex::encode(&content_block.space_id[..16])
                                        );
                                        created_at = action.timestamp;
                                        content_type = match action.action_type {
                                            crate::blocks::ActionType::Post => "Post".to_string(),
                                            crate::blocks::ActionType::Reply => "Reply".to_string(),
                                            _ => "Unknown".to_string(),
                                        };
                                        if let Some(parent) = action.parent_id {
                                            parent_id_opt =
                                                Some(format!("sha256:{}", hex::encode(parent)));
                                        }
                                        // Extract media_refs from the action
                                        found_media_refs = action.media_refs.clone();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // Parse title from body (first line if formatted as "Title\n\nBody")
                let (title, body) = if let Some(idx) = body_str.find("\n\n") {
                    let (t, b) = body_str.split_at(idx);
                    (
                        Some(t.to_string()),
                        b.trim_start_matches("\n\n").to_string(),
                    )
                } else {
                    (None, body_str.to_string())
                };

                // BACKFILL: Store ContentItem in content_store so future get_children works
                // This handles content that was created before content_store was used
                if !author_id.is_empty() && !space_id.is_empty() && created_at > 0 {
                    use crate::types::content::{
                        ContentHash, ContentId, ContentItem, ContentType as CT, MediaRef,
                        MediaType, SpaceId,
                    };
                    use crate::types::identity::{IdentityId, Signature};

                    // Parse author public key from address
                    let author_bytes = crate::crypto::address::decode_address_to_pubkey(&author_id)
                        .map(|pk| {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(pk.as_bytes());
                            arr
                        })
                        .unwrap_or([0u8; 32]);

                    // Parse space_id (skip "sp1" prefix and decode hex)
                    let space_bytes: [u8; 32] = if space_id.starts_with("sp1") {
                        hex::decode(&space_id[3..])
                            .ok()
                            .and_then(|v| {
                                if v.len() >= 16 {
                                    let mut arr = [0u8; 32];
                                    arr[..v.len().min(32)].copy_from_slice(&v[..v.len().min(32)]);
                                    Some(arr)
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(content_hash)
                    } else {
                        content_hash
                    };

                    // Parse parent_id if present
                    let parent_bytes: Option<[u8; 32]> = parent_id_opt.as_ref().and_then(|p| {
                        if p.starts_with("sha256:") {
                            hex::decode(&p[7..]).ok().and_then(|v| {
                                if v.len() == 32 {
                                    let mut arr = [0u8; 32];
                                    arr.copy_from_slice(&v);
                                    Some(arr)
                                } else {
                                    None
                                }
                            })
                        } else {
                            None
                        }
                    });

                    let ct = if content_type == "Reply" {
                        CT::Reply
                    } else {
                        CT::Post
                    };

                    // Convert ActionMediaRef to MediaRef for ContentItem
                    let backfill_media_refs: Vec<MediaRef> = found_media_refs
                        .iter()
                        .map(|amr| {
                            let media_type = match amr.media_type {
                                crate::blocks::action::ActionMediaRef::TYPE_JPEG => {
                                    MediaType::ImageJpeg
                                }
                                crate::blocks::action::ActionMediaRef::TYPE_PNG => {
                                    MediaType::ImagePng
                                }
                                crate::blocks::action::ActionMediaRef::TYPE_GIF => {
                                    MediaType::ImageGif
                                }
                                crate::blocks::action::ActionMediaRef::TYPE_WEBP => {
                                    MediaType::ImageWebp
                                }
                                _ => MediaType::ImageJpeg, // Default fallback
                            };
                            MediaRef {
                                media_hash: ContentHash::from_bytes(amr.media_hash),
                                media_type,
                                size_bytes: amr.size_bytes,
                                inline_preview: None, // Preview not stored in action
                            }
                        })
                        .collect();

                    let content_item = ContentItem {
                        content_id: ContentId::from_bytes(content_hash),
                        content_type: ct,
                        author_id: IdentityId::from_bytes(author_bytes),
                        space_id: SpaceId::from_bytes(space_bytes),
                        parent_id: parent_bytes.map(ContentId::from_bytes),
                        created_at,
                        last_engagement: created_at,
                        body_inline: Some(body_str.to_string()),
                        content_hash: None,
                        content_size: Some(content_bytes.len() as u32),
                        content_type_mime: Some("text/plain".to_string()),
                        media_refs: backfill_media_refs,
                        pin_state: None,
                        engagement_count: 0,
                        signature: Signature::from_bytes([0u8; 64]),
                        pow_nonce: 0,
                        pow_difficulty: 0,
                        preservation_pow: None,
                        display_name: None,
                    };

                    // Try to store in content_store (ignore errors, this is best-effort backfill)
                    match content_store.put(&content_item) {
                        Ok(()) => {
                            info!(
                                "[BACKFILL] Stored ContentItem for {} ({})",
                                &params.content_id[..24],
                                content_type
                            );
                            let _ = content_store.flush();
                        }
                        Err(e) if e.to_string().contains("already exists") => {
                            // Already backfilled, that's fine
                        }
                        Err(e) => {
                            debug!("Backfill failed for {}: {}", &params.content_id[..24], e);
                        }
                    }
                }

                // Get decay state from DecayIntegration for blob-only content
                let (
                    decay_state_str,
                    seconds_until_decay_starts,
                    seconds_until_pruned,
                    survival_probability,
                    is_protected,
                    time_since_engagement,
                ) = if let Some(ref decay) = self.node.decay_integration {
                    if let Ok(Some(decay_state)) = decay.get_decay_state(&blob_hash) {
                        let state_str = if decay_state.is_protected {
                            "protected"
                        } else if decay_state.survival_probability >= 0.5 {
                            "active"
                        } else if decay_state.survival_probability >= 0.0625 {
                            "stale"
                        } else {
                            "decayed"
                        };
                        let floor_remaining = if decay_state.is_protected {
                            Some(
                                crate::types::constants::DECAY_FLOOR_SECS
                                    .saturating_sub(decay_state.time_since_engagement),
                            )
                        } else {
                            None
                        };
                        let half_life = crate::types::constants::HALF_LIFE_SECS;
                        let seconds_until_pruned = if decay_state.is_protected {
                            Some(
                                crate::types::constants::DECAY_FLOOR_SECS
                                    .saturating_sub(decay_state.time_since_engagement)
                                    + 4 * half_life,
                            )
                        } else if !decay_state.is_decayed {
                            let effective_time = decay_state
                                .time_since_engagement
                                .saturating_sub(crate::types::constants::DECAY_FLOOR_SECS);
                            Some((4 * half_life).saturating_sub(effective_time))
                        } else {
                            Some(0)
                        };
                        (
                            state_str.to_string(),
                            floor_remaining,
                            seconds_until_pruned,
                            decay_state.survival_probability,
                            decay_state.is_protected,
                            decay_state.time_since_engagement,
                        )
                    } else {
                        (
                            "active".to_string(),
                            Some(crate::types::constants::DECAY_FLOOR_SECS),
                            None,
                            1.0,
                            true,
                            0,
                        )
                    }
                } else {
                    ("active".to_string(), None, None, 1.0, false, 0)
                };

                // Calculate reply count from chain + mempool
                let reply_count = {
                    let mut count = 0u64;

                    // Count ALL replies recursively from chain index (short-TTL cached)
                    count += self.cached_reply_count(&content_hash);

                    // Count pending replies from mempool (recursive)
                    if let Some(ref block_builder) = self.node.block_builder {
                        if let Ok(bb) = block_builder.read() {
                            let pending = bb.get_pending_actions();
                            let mut target_parents: std::collections::HashSet<[u8; 32]> =
                                std::collections::HashSet::new();
                            target_parents.insert(content_hash);

                            loop {
                                let mut found_new = false;
                                for (_thread_id, _space_id, action) in &pending {
                                    if action.action_type
                                        == crate::blocks::action::ActionType::Reply
                                    {
                                        if let (Some(parent_id), Some(reply_hash)) =
                                            (action.parent_id, action.content_hash)
                                        {
                                            if target_parents.contains(&parent_id)
                                                && !target_parents.contains(&reply_hash)
                                            {
                                                count += 1;
                                                target_parents.insert(reply_hash);
                                                found_new = true;
                                            }
                                        }
                                    }
                                }
                                if !found_new {
                                    break;
                                }
                            }
                        }
                    }
                    count
                };

                // Normalize timestamps to milliseconds
                let created_at_ms = if created_at < 10_000_000_000 {
                    created_at * 1000
                } else {
                    created_at
                };

                // Convert ActionMediaRef to MediaRefResult for response
                let response_media_refs: Vec<MediaRefResult> = found_media_refs
                    .iter()
                    .map(|amr| {
                        let media_type_str = match amr.media_type {
                            crate::blocks::action::ActionMediaRef::TYPE_JPEG => "image/jpeg",
                            crate::blocks::action::ActionMediaRef::TYPE_PNG => "image/png",
                            crate::blocks::action::ActionMediaRef::TYPE_GIF => "image/gif",
                            crate::blocks::action::ActionMediaRef::TYPE_WEBP => "image/webp",
                            _ => "image/jpeg", // Default fallback
                        };
                        MediaRefResult {
                            media_hash: hex::encode(amr.media_hash),
                            media_type: media_type_str.to_string(),
                            size_bytes: amr.size_bytes,
                        }
                    })
                    .collect();

                let result = GetContentResult {
                    content_id: params.content_id,
                    content_type,
                    author_id,
                    space_id,
                    parent_id: parent_id_opt,
                    created_at: created_at_ms,
                    last_engagement: created_at_ms,
                    body: Some(body),
                    title,
                    engagement_count: 0,
                    decay_state: decay_state_str,
                    seconds_until_decay_starts,
                    seconds_until_pruned,
                    survival_probability,
                    is_protected,
                    time_since_engagement,
                    media_refs: response_media_refs,
                    reply_count,
                    display_name: None, // TODO: extract from action if available
                };
                return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
            }
        }

        // Content not found in either store
        RpcResponse::error(RpcErrorCode::ContentNotFound, "Content not found", id)
    }

    /// Search across spaces and content using Tantivy full-text search
    async fn search(&self, params: Value, id: Value) -> RpcResponse {
        let start_time = std::time::Instant::now();

        // Parse params manually to avoid derive issues
        let query = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let types = params.get("types").and_then(|v| v.as_array());
        let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
        let offset = params.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let space_filter = params
            .get("space_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let query_trimmed = query.trim();
        if query_trimmed.is_empty() {
            return RpcResponse::success(
                serde_json::json!({
                    "results": [],
                    "total": 0,
                    "took_ms": 0
                }),
                id,
            );
        }

        let mut results: Vec<serde_json::Value> = Vec::new();

        // Check if we should search spaces (substring matching - spaces aren't in Tantivy)
        let search_spaces = types
            .map(|t| t.iter().any(|x| x.as_str() == Some("space")))
            .unwrap_or(true);
        if search_spaces {
            let query_lower = query_trimmed.to_lowercase();
            let search_terms: Vec<&str> = query_lower.split_whitespace().collect();

            if let Some(ref chain_store) = self.node.chain_store {
                for result in chain_store.list_spaces() {
                    if let Ok(space_info) = result {
                        let name_lower = space_info.name.to_lowercase();
                        let desc_lower = space_info
                            .description
                            .as_ref()
                            .map(|d| d.to_lowercase())
                            .unwrap_or_default();

                        let matches = search_terms
                            .iter()
                            .any(|term| name_lower.contains(term) || desc_lower.contains(term));

                        if matches {
                            results.push(serde_json::json!({
                                "id": hex::encode(&space_info.space_id),
                                "type": "space",
                                "score": 1.0,
                                "highlights": { "name": space_info.name },
                                "data": {
                                    "spaceId": hex::encode(&space_info.space_id),
                                    "name": space_info.name,
                                    "description": space_info.description,
                                    "threadCount": 0,
                                    "memberCount": 0,
                                    "lastActivity": space_info.created_at,
                                    "isActive": true
                                }
                            }));
                        }
                    }
                }
            }
        }

        // Check if we should search threads (using Tantivy full-text search)
        let search_threads = types
            .map(|t| t.iter().any(|x| x.as_str() == Some("thread")))
            .unwrap_or(true);
        if search_threads {
            // Try Tantivy search first (fast, relevance-ranked)
            let tantivy_results = if let Some(ref search_index) = self.node.search_index {
                if let Ok(index) = search_index.read() {
                    let filters = SearchFilters {
                        space_id: space_filter.clone(),
                        min_heat: None,
                        sort: crate::cli::commands::search::SortOrder::Heat,
                    };
                    // Request more results than limit to account for offset
                    match index.search(query_trimmed, filters, limit + offset + 100) {
                        Ok(entries) => Some(entries),
                        Err(e) => {
                            debug!(
                                "[SEARCH] Tantivy search failed, falling back to scan: {}",
                                e
                            );
                            None
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(entries) = tantivy_results {
                // Convert Tantivy results to JSON response format.
                //
                // SEARCH PARITY (SPEC_08 §5 / branch partitioning): the Tantivy
                // index is a GLOBAL metadata index — it is fed from every synced
                // content record regardless of branch subscription (see the
                // DATA_CONTENT handler in node/router) and is never pruned when
                // local blobs decay. Hits may therefore reference content this
                // node no longer (or never) hosts; `hosted: false` tells clients
                // to resolve the hit via `request_content` (view-to-host
                // on-demand fetch) instead of `get_content`.
                for entry in entries {
                    // Parse title and body from snippet (Tantivy stores the full body)
                    let (title, body_preview) = if entry.title.is_empty() {
                        // For replies or posts without separate title, use snippet directly
                        (String::new(), entry.snippet.clone())
                    } else {
                        (entry.title.clone(), entry.snippet.clone())
                    };

                    // Convert space_id from bech32m to hex if possible
                    let space_id_hex = if entry.space_id.starts_with("sp1") {
                        decode_space_id(&entry.space_id)
                            .map(|bytes| hex::encode(bytes))
                            .unwrap_or_else(|_| entry.space_id.clone())
                    } else {
                        entry.space_id.clone()
                    };

                    // Is the content locally available (metadata store or blob layer)?
                    let hosted = {
                        let id_hex = entry.content_id.replace("sha256:", "");
                        match hex::decode(&id_hex).ok().filter(|b| b.len() == 32) {
                            Some(bytes) => {
                                let mut arr = [0u8; 32];
                                arr.copy_from_slice(&bytes);
                                let in_store = self
                                    .node
                                    .content_store
                                    .as_ref()
                                    .and_then(|cs| {
                                        cs.get(&crate::types::content::ContentId::from_bytes(arr))
                                            .ok()
                                            .flatten()
                                    })
                                    .is_some();
                                let in_blobs = self
                                    .node
                                    .content_retrieval
                                    .as_ref()
                                    .map(|mgr| mgr.has_content(&ContentBlobHash::from_bytes(arr)))
                                    .unwrap_or(false);
                                in_store || in_blobs
                            }
                            None => false,
                        }
                    };

                    results.push(serde_json::json!({
                        "id": entry.content_id.replace("sha256:", ""),
                        "type": "thread",
                        "score": entry.score as f64,
                        "hosted": hosted,
                        "highlights": {
                            "content": body_preview,
                            "name": if !entry.title.is_empty() { Some(&entry.title) } else { None }
                        },
                        "data": {
                            "contentId": entry.content_id.replace("sha256:", ""),
                            "spaceId": space_id_hex,
                            "authorId": entry.author,
                            "title": title,
                            "body": body_preview,
                            "createdAt": entry.timestamp,
                            "lastEngagement": entry.timestamp,
                            "replyCount": 0,
                            "reactionCount": 0,
                            "hasMedia": false,
                            "heat": entry.heat
                        }
                    }));
                }
            } else {
                // Fallback to content_store scan if Tantivy not available
                let query_lower = query_trimmed.to_lowercase();
                let search_terms: Vec<&str> = query_lower.split_whitespace().collect();

                if let Some(ref content_store) = self.node.content_store {
                    let mut count = 0;
                    for result in content_store.iter_content() {
                        if count >= 2000 {
                            break;
                        }
                        count += 1;
                        let item = match result {
                            Ok(i) => i,
                            Err(_) => continue,
                        };

                        // Skip replies - only search top-level threads
                        if item.parent_id.is_some() {
                            continue;
                        }

                        // Parse title from body (format is "Title\n\nBody")
                        let body_text = item.body_inline.as_deref().unwrap_or("");
                        let (title, body) = if let Some(idx) = body_text.find("\n\n") {
                            let (t, b) = body_text.split_at(idx);
                            (t.to_string(), b.trim_start_matches('\n').to_string())
                        } else {
                            (String::new(), body_text.to_string())
                        };

                        let title_lower = title.to_lowercase();
                        let body_lower = body.to_lowercase();

                        let title_matches =
                            search_terms.iter().any(|term| title_lower.contains(term));
                        let body_matches =
                            search_terms.iter().any(|term| body_lower.contains(term));

                        if !title_matches && !body_matches {
                            continue;
                        }

                        let title_match_count = search_terms
                            .iter()
                            .filter(|term| title_lower.contains(*term))
                            .count();
                        let body_match_count = search_terms
                            .iter()
                            .filter(|term| body_lower.contains(*term))
                            .count();
                        let score = (title_match_count as f64 * 0.3)
                            + (body_match_count as f64 * 0.1)
                            + if title_matches { 0.5 } else { 0.2 };

                        let content_id_str = hex::encode(item.content_id.as_bytes());
                        let body_preview = if body.len() > 200 {
                            format!("{}...", &body[..200])
                        } else {
                            body.clone()
                        };

                        results.push(serde_json::json!({
                            "id": content_id_str,
                            "type": "thread",
                            "score": score,
                            "highlights": { "content": body_preview, "name": if title_matches { Some(&title) } else { None } },
                            "data": {
                                "contentId": content_id_str,
                                "spaceId": hex::encode(item.space_id.as_bytes()),
                                "authorId": hex::encode(item.author_id.as_bytes()),
                                "title": title,
                                "body": body_preview,
                                "createdAt": item.created_at,
                                "lastEngagement": item.last_engagement,
                                "replyCount": 0,
                                "reactionCount": 0,
                                "hasMedia": false
                            }
                        }));
                    }
                }
            }
        }

        // Sort by score descending for relevance ranking
        results.sort_by(|a, b| {
            let score_a = a.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let score_b = b.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
            score_b
                .partial_cmp(&score_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let total = results.len();
        let took_ms = start_time.elapsed().as_millis() as u64;

        let paginated: Vec<_> = results.into_iter().skip(offset).take(limit).collect();

        RpcResponse::success(
            serde_json::json!({
                "results": paginated,
                "total": total,
                "took_ms": took_ms
            }),
            id,
        )
    }

    /// Resolve a content item's body text from the stores the node actually holds,
    /// mirroring list_space_content: content_store `body_inline` → content_store
    /// `get_body_by_hash` → BlobStore. Returns None when the body isn't held (pull
    /// model), so search only indexes content whose text the node genuinely has.
    fn resolve_content_body(
        &self,
        content_hash: &[u8; 32],
        blob_store: Option<&BlobStore>,
    ) -> Option<String> {
        if let Some(ref cs) = self.node.content_store {
            let cid = crate::types::content::ContentId::from_bytes(*content_hash);
            if let Ok(Some(item)) = cs.get(&cid) {
                if let Some(ref b) = item.body_inline {
                    if !b.is_empty() {
                        return Some(b.clone());
                    }
                }
            }
            if let Ok(Some(b)) = cs.get_body_by_hash(content_hash) {
                if !b.is_empty() {
                    return Some(b);
                }
            }
        }
        if let Some(bs) = blob_store {
            let blob_hash = ContentBlobHash::from_bytes(*content_hash);
            if let Ok(bytes) = bs.get(&blob_hash) {
                if let Ok(text) = String::from_utf8(bytes) {
                    if !text.is_empty() {
                        return Some(text);
                    }
                }
            }
        }
        None
    }

    /// Rebuild the full-text search index from ALL content the node holds
    ///
    /// This is useful when:
    /// - The index is empty or corrupted
    /// - Content was synced from network but not indexed
    /// - A fresh index is needed for testing
    async fn rebuild_search_index(&self, _params: Value, id: Value) -> RpcResponse {
        let start_time = std::time::Instant::now();

        // Check if search index is available
        let search_index = match &self.node.search_index {
            Some(idx) => idx.clone(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Search index not available",
                    id,
                );
            }
        };

        // Collect all content the node holds. Content synced from peers lives in the
        // chain (block) store — NOT the content_store — so iterate content blocks and
        // resolve each body the same way list_space_content does. (The old path scanned
        // content_store, which is empty for synced content, so search only ever found
        // posts this node authored.)
        let mut indexed_count = 0usize;
        let mut error_count = 0usize;

        if let Some(ref chain_store) = self.node.chain_store {
            let blob_store = BlobStore::new(&self.node.sync_blob_path).ok();
            let mut indexables: Vec<IndexableContent> = Vec::new();

            for block_res in chain_store.iter_content_blocks() {
                let block = match block_res {
                    Ok(b) => b,
                    Err(_) => {
                        error_count += 1;
                        continue;
                    }
                };
                let space_id_16: [u8; 16] = block.space_id[..16].try_into().unwrap_or([0u8; 16]);
                let space_id_str = encode_space_id(&space_id_16);

                for action in &block.actions {
                    // Only posts/replies carry searchable text; skip engagements/space acts.
                    if !matches!(
                        action.action_type,
                        crate::blocks::action::ActionType::Post
                            | crate::blocks::action::ActionType::Reply
                    ) {
                        continue;
                    }
                    // Private content bodies are encrypted — indexing them is useless.
                    if action.private {
                        continue;
                    }
                    let content_hash = match action.content_hash {
                        Some(h) => h,
                        None => continue,
                    };
                    // Body not held yet (pull model) → nothing to index for this item.
                    let text = match self.resolve_content_body(&content_hash, blob_store.as_ref()) {
                        Some(t) => t,
                        None => continue,
                    };
                    let (title, body) = match text.find("\n\n") {
                        Some(i) => (text[..i].to_string(), text[(i + 2)..].to_string()),
                        None => (String::new(), text.clone()),
                    };
                    indexables.push(IndexableContent {
                        content_id: format!("sha256:{}", hex::encode(content_hash)),
                        space_id: space_id_str.clone(),
                        author: crate::crypto::address::encode_address(
                            &crate::types::identity::IdentityId(action.actor),
                        ),
                        title,
                        body,
                        heat: 50.0,
                        timestamp: action.timestamp,
                    });
                }
            }

            // Rebuild from scratch so stale/removed content drops out of the index too.
            match search_index.write() {
                Ok(mut index) => match index.rebuild(indexables.into_iter()) {
                    Ok(n) => indexed_count = n,
                    Err(e) => {
                        warn!("[SEARCH] Rebuild failed: {}", e);
                        error_count += 1;
                    }
                },
                Err(_) => error_count += 1,
            }
        }

        let took_ms = start_time.elapsed().as_millis() as u64;
        let doc_count = if let Ok(idx) = search_index.read() {
            idx.doc_count()
        } else {
            0
        };

        info!(
            "[SEARCH] Rebuilt search index: {} items indexed, {} errors, {} total docs, took {}ms",
            indexed_count, error_count, doc_count, took_ms
        );

        RpcResponse::success(
            serde_json::json!({
                "indexed": indexed_count,
                "errors": error_count,
                "total_docs": doc_count,
                "took_ms": took_ms
            }),
            id,
        )
    }

    /// Get autocomplete suggestions for search prefix
    async fn search_suggest(&self, params: Value, id: Value) -> RpcResponse {
        let prefix = params.get("prefix").and_then(|v| v.as_str()).unwrap_or("");
        let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(8) as usize;

        if prefix.len() < 2 {
            return RpcResponse::success(serde_json::json!([]), id);
        }

        let prefix_lower = prefix.to_lowercase();
        let mut suggestions: Vec<String> = Vec::new();

        // Collect space names that match the prefix
        if let Some(ref chain_store) = self.node.chain_store {
            for result in chain_store.list_spaces() {
                if let Ok(space_info) = result {
                    let name_lower = space_info.name.to_lowercase();
                    if name_lower.starts_with(&prefix_lower) || name_lower.contains(&prefix_lower) {
                        suggestions.push(space_info.name.clone());
                        if suggestions.len() >= limit {
                            break;
                        }
                    }
                }
            }
        }

        // Also suggest content-based terms from recent threads
        if suggestions.len() < limit {
            if let Some(ref content_store) = self.node.content_store {
                let mut seen_terms: std::collections::HashSet<String> =
                    suggestions.iter().cloned().collect();
                let mut count = 0;
                for result in content_store.iter_content() {
                    if count >= 100 {
                        break;
                    }
                    count += 1;
                    if let Ok(item) = result {
                        if item.parent_id.is_some() {
                            continue;
                        } // Skip replies
                        if let Some(body) = &item.body_inline {
                            // Extract words that start with the prefix
                            for word in body.split_whitespace() {
                                let word_clean = word
                                    .trim_matches(|c: char| !c.is_alphanumeric())
                                    .to_lowercase();
                                if word_clean.len() >= 3
                                    && word_clean.starts_with(&prefix_lower)
                                    && !seen_terms.contains(&word_clean)
                                {
                                    suggestions.push(word_clean.clone());
                                    seen_terms.insert(word_clean);
                                    if suggestions.len() >= limit {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if suggestions.len() >= limit {
                        break;
                    }
                }
            }
        }

        // Sort by relevance (exact prefix match first, then by length)
        suggestions.sort_by(|a, b| {
            let a_starts = a.to_lowercase().starts_with(&prefix_lower);
            let b_starts = b.to_lowercase().starts_with(&prefix_lower);
            match (a_starts, b_starts) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.len().cmp(&b.len()),
            }
        });

        suggestions.truncate(limit);
        RpcResponse::success(serde_json::json!(suggestions), id)
    }

    /// Get trending/popular search terms
    async fn trending_searches(&self, params: Value, id: Value) -> RpcResponse {
        let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(10) as usize;

        // Collect popular space names and recent thread topics as "trending"
        let mut trending: Vec<(String, u64)> = Vec::new();

        // Get space names with activity counts
        if let Some(ref chain_store) = self.node.chain_store {
            for result in chain_store.list_spaces() {
                if let Ok(space_info) = result {
                    // Use created_at as a proxy for activity (newer = more trending)
                    trending.push((space_info.name.clone(), space_info.created_at));
                }
            }
        }

        // Get recent thread keywords
        if let Some(ref content_store) = self.node.content_store {
            let mut keyword_counts: std::collections::HashMap<String, u64> =
                std::collections::HashMap::new();
            let mut count = 0;
            for result in content_store.iter_content() {
                if count >= 200 {
                    break;
                }
                count += 1;
                if let Ok(item) = result {
                    if item.parent_id.is_some() {
                        continue;
                    } // Skip replies
                    if let Some(body) = &item.body_inline {
                        // Extract significant words (4+ chars, not common)
                        for word in body.split_whitespace().take(20) {
                            let word_clean = word
                                .trim_matches(|c: char| !c.is_alphanumeric())
                                .to_lowercase();
                            if word_clean.len() >= 4 && !is_common_word(&word_clean) {
                                *keyword_counts.entry(word_clean).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            // Add top keywords as trending
            let mut keyword_vec: Vec<_> = keyword_counts.into_iter().collect();
            keyword_vec.sort_by(|a, b| b.1.cmp(&a.1));
            for (word, count) in keyword_vec.into_iter().take(limit) {
                trending.push((word, count));
            }
        }

        // Sort by activity/count and take top results
        trending.sort_by(|a, b| b.1.cmp(&a.1));
        let result: Vec<String> = trending
            .into_iter()
            .map(|(name, _)| name)
            .take(limit)
            .collect();

        RpcResponse::success(serde_json::json!(result), id)
    }

    /// List all known spaces from blockchain data
    async fn list_spaces(&self, params: Value, id: Value) -> RpcResponse {
        let params: ListSpacesParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Fast path: serve from the short-TTL cache. Building the list below does full
        // chain + content-store scans, and the feed polls this rapidly — without the cache
        // that pegs every core and RPC stops responding. Pagination is applied per-request.
        const SPACE_LIST_TTL: std::time::Duration = std::time::Duration::from_secs(3);
        {
            let guard = self.node.space_list_cache.lock().unwrap();
            if let Some((computed_at, ref full)) = *guard {
                if computed_at.elapsed() < SPACE_LIST_TTL {
                    let total = full.len();
                    let page: Vec<_> = full
                        .iter()
                        .skip(params.offset)
                        .take(params.limit)
                        .cloned()
                        .collect();
                    let result = ListSpacesResult {
                        spaces: page,
                        total,
                    };
                    return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                }
            }
        }

        use std::collections::HashMap;
        let mut space_stats: HashMap<[u8; 16], (String, Option<String>, u64, u64, u64)> =
            HashMap::new();
        // space_id_16 -> (name, description, creator_timestamp, post_count, last_activity)
        // Space ids that have an on-chain space block or CreateSpace action — i.e. real
        // public spaces (not profile/derived spaces). Used to distinguish "public space we
        // synced but haven't learned the name of yet" (expose as name_unresolved) from
        // genuinely nameless system spaces (hide).
        let mut has_space_block: std::collections::HashSet<[u8; 16]> =
            std::collections::HashSet::new();

        // Source 0: Space blocks in the chain (spaces are on-chain, no content fetch needed)
        if let Some(ref chain_store) = self.node.chain_store {
            let mut root_block_count = 0u64;
            let mut space_block_count = 0u64;
            for result in chain_store.iter_root_blocks() {
                match result {
                    Ok(root_block) => {
                        root_block_count += 1;
                        debug!("[LIST_SPACES] Found root block at height {} with {} space_block_hashes",
                              root_block.height, root_block.space_block_hashes.len());
                        // Iterate over space block hashes and fetch each space block
                        for space_block_hash in &root_block.space_block_hashes {
                            match chain_store.get_space_block(space_block_hash) {
                                Ok(Some(space_block)) => {
                                    space_block_count += 1;
                                    // Extract first 16 bytes of space_id
                                    let mut space_16: [u8; 16] = [0u8; 16];
                                    space_16.copy_from_slice(&space_block.space_id[..16]);

                                    debug!(
                                        "[LIST_SPACES] Found space {} in block {}",
                                        hex::encode(&space_16[..4]),
                                        root_block.height
                                    );

                                    // Add space if not already present
                                    // Note: post_count starts at 0, will be populated by Source 2 (content blocks)
                                    space_stats.entry(space_16).or_insert((
                                        format!("Space {}", hex::encode(&space_16[..4])), // Default name
                                        None,                 // No description yet
                                        root_block.timestamp, // Use block timestamp as created_at
                                        0, // post_count - will be calculated from content blocks
                                        root_block.timestamp, // last_activity from block
                                    ));
                                    // Real public space (on-chain space block) — may need name resolution.
                                    has_space_block.insert(space_16);
                                }
                                Ok(None) => {
                                    warn!(
                                        "[LIST_SPACES] Space block {} not found in store",
                                        hex::encode(space_block_hash)
                                    );
                                }
                                Err(e) => {
                                    warn!(
                                        "[LIST_SPACES] Error fetching space block {}: {}",
                                        hex::encode(space_block_hash),
                                        e
                                    );
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!("[LIST_SPACES] Error iterating root blocks: {}", e);
                    }
                }
            }
            debug!(
                "[LIST_SPACES] Scanned {} root blocks, found {} space blocks",
                root_block_count, space_block_count
            );
        } else {
            warn!("[LIST_SPACES] No chain_store available!");
        }

        // Source 1: Space Registry (has names/descriptions from content blocks)
        if let Some(ref chain_store) = self.node.chain_store {
            for result in chain_store.list_spaces() {
                if let Ok(space_info) = result {
                    let entry = space_stats.entry(space_info.space_id).or_insert((
                        space_info.name.clone(),
                        space_info.description.clone(),
                        space_info.created_at,
                        0, // post_count (will be filled later)
                        0, // last_activity (will be filled later)
                    ));
                    // Update with registry info (better names/descriptions)
                    entry.0 = space_info.name;
                    entry.1 = space_info.description;
                    entry.2 = space_info.created_at;
                }
            }
        }

        // Source 2: Content blocks (to get post counts and last activity)
        if let Some(ref chain_store) = self.node.chain_store {
            for result in chain_store.iter_content_blocks() {
                if let Ok(content_block) = result {
                    // Extract first 16 bytes of space_id
                    let mut space_16: [u8; 16] = [0u8; 16];
                    space_16.copy_from_slice(&content_block.space_id[..16]);

                    if let Some(entry) = space_stats.get_mut(&space_16) {
                        // Only count for registered spaces
                        for action in &content_block.actions {
                            entry.3 += 1; // post_count
                            if action.timestamp > entry.4 {
                                entry.4 = action.timestamp; // last_activity
                            }
                        }
                    }
                }
            }
        }

        // Source 3: ContentStore (pending content not yet in blocks)
        if let Some(ref content_store) = self.node.content_store {
            for result in content_store.iter_content() {
                if let Ok(item) = result {
                    let space_id = item.space_id.as_bytes();
                    let mut space_16: [u8; 16] = [0u8; 16];
                    space_16.copy_from_slice(&space_id[..16]);

                    if let Some(entry) = space_stats.get_mut(&space_16) {
                        // Only count for registered spaces
                        entry.3 += 1; // post_count
                        if item.created_at > entry.4 {
                            entry.4 = item.created_at; // last_activity
                        }
                    }
                }
            }
        }

        // Source 4: Mempool (pending CreateSpace actions not yet in blocks)
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(builder) = block_builder.read() {
                use crate::blocks::action::ActionType;
                let pending_actions = builder.get_pending_actions();
                for (_thread_id, space_id, action) in pending_actions {
                    if action.action_type == ActionType::CreateSpace {
                        // Extract first 16 bytes of space_id
                        let mut space_16: [u8; 16] = [0u8; 16];
                        space_16.copy_from_slice(&space_id[..16]);

                        // Add space from mempool if not already in chain
                        space_stats.entry(space_16).or_insert((
                            format!("Space {}", hex::encode(&space_16[..4])), // Default name
                            None,                                             // No description yet
                            action.timestamp, // created_at from action
                            0,                // post_count
                            action.timestamp, // last_activity
                        ));
                        // Real public space (pending CreateSpace) — a placeholder name here
                        // just means we don't have the name locally yet.
                        has_space_block.insert(space_16);
                        log::debug!(
                            "[LIST_SPACES] Found pending CreateSpace in mempool for space {}",
                            hex::encode(&space_16[..4])
                        );
                    }
                }
            }
        }

        // Load space names from config.toml (user-defined names take precedence)
        let config_names = load_space_names(&self.node.data_dir);

        // Convert to result, using indexed post counts
        let chain_store_ref = self.node.chain_store.as_ref();
        let mut spaces: Vec<SpaceSummary> = space_stats
            .into_iter()
            .filter_map(
                |(space_id_16, (name, _description, _created_at, _post_count, last_activity))| {
                    let space_id_str = encode_space_id(&space_id_16);
                    use crate::types::space_class::{class_of, SpaceClass};
                    let class = match class_of(&space_id_16) {
                        Some(SpaceClass::Social) => "social",
                        Some(SpaceClass::Profile) => "profile",
                        Some(SpaceClass::Dm) => "dm",
                        Some(SpaceClass::Private) => "private",
                        Some(SpaceClass::App) => "app",
                        None => "unknown",
                    }
                    .to_string();
                    // Identify app-namespaced spaces from the ON-CHAIN name (not any config
                    // override, which is display-only). For an app space, surface the clean
                    // display name (marker stripped) and the app tag so clients can segregate.
                    let (app, resolved_name) = match resolve_app_space(&space_id_16, &name) {
                        Some((app, display)) => (Some(app), display),
                        None => (None, name),
                    };
                    // For an app space the clean display name is authoritative (a config.toml
                    // override still holds the raw "@app:" marker, so ignore it here). For a
                    // normal space, a config override wins over the on-chain/default name.
                    let final_name = if app.is_some() {
                        resolved_name
                    } else {
                        config_names
                            .get(&space_id_str)
                            .cloned()
                            .unwrap_or(resolved_name)
                    };

                    // Hide non-browsable classes from list_spaces' generic listing.
                    // Profile/DM/private spaces are reached by their own flows, not
                    // browse. Social + app spaces are listed (clients filter by class).
                    match class_of(&space_id_16) {
                        Some(SpaceClass::Profile)
                        | Some(SpaceClass::Dm)
                        | Some(SpaceClass::Private) => return None,
                        _ => {}
                    }
                    let trimmed = final_name.trim();
                    let is_placeholder = trimmed.len() == 14
                        && trimmed.starts_with("Space ")
                        && trimmed[6..].chars().all(|c| c.is_ascii_hexdigit());
                    let name_unresolved = is_placeholder;

                    // Get accurate post count from indexed storage
                    let actual_post_count = chain_store_ref
                        .and_then(|cs| cs.count_posts_for_space(&space_id_16).ok())
                        .unwrap_or(0) as u64;

                    // SPEC_13 Phase 2: attach lineage children (behavioral
                    // communities formed under this space). Additive — empty
                    // for spaces with no communities, omitted from JSON.
                    let mut space_id_32 = [0u8; 32];
                    space_id_32[..16].copy_from_slice(&space_id_16);
                    let children: Vec<SpaceChildSummary> = chain_store_ref
                        .and_then(|cs| cs.get_space_children(&space_id_32).ok())
                        .unwrap_or_default()
                        .into_iter()
                        .map(|lineage| {
                            let mut child_16 = [0u8; 16];
                            child_16.copy_from_slice(&lineage.community_id[..16]);
                            SpaceChildSummary {
                                community_id: hex::encode(lineage.community_id),
                                space_id: encode_space_id(&child_16),
                                full_name: format!("{}/{}", final_name, lineage.display_name),
                                name: lineage.display_name,
                                formed_at: lineage.formation_timestamp,
                                formation_height: lineage.formation_height,
                                founding_member_count: lineage.founding_member_count,
                            }
                        })
                        .collect();

                    Some(SpaceSummary {
                        space_id: space_id_str,
                        post_count: actual_post_count,
                        last_activity: if last_activity > 0 {
                            Some(last_activity)
                        } else {
                            None
                        },
                        // Unresolved spaces report a null name (client resolves on demand).
                        name: if name_unresolved {
                            None
                        } else {
                            Some(final_name)
                        },
                        app,
                        name_unresolved,
                        class,
                        children,
                    })
                },
            )
            .collect();

        // Sort by last activity (most recent first), then by name
        spaces.sort_by(|a, b| match (b.last_activity, a.last_activity) {
            (Some(b_time), Some(a_time)) => b_time.cmp(&a_time),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        });

        // Cache the fully-computed, sorted list so rapid follow-up calls (the feed) skip the
        // full scans above for SPACE_LIST_TTL. Pagination is applied per-request below.
        *self.node.space_list_cache.lock().unwrap() =
            Some((std::time::Instant::now(), spaces.clone()));

        // total reflects the public spaces actually returned (after hiding private/system).
        let total = spaces.len();

        // Apply pagination
        let spaces: Vec<_> = spaces
            .into_iter()
            .skip(params.offset)
            .take(params.limit)
            .collect();

        let result = ListSpacesResult { spaces, total };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Create a new space
    ///
    /// Validates the PoW, then generates a space ID and saves to config.
    async fn create_space(&self, params: Value, id: Value) -> RpcResponse {
        use crate::types::identity::PublicKey;

        let params: CreateSpaceParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse creator public key
        let creator_bytes = match hex::decode(&params.creator_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid creator_id: must be 32-byte hex",
                    id,
                );
            }
        };

        let _pubkey = PublicKey::from_bytes(creator_bytes);

        // SPONSORSHIP CHECK: Verify identity is sponsored before allowing space creation
        if let Err(response) = self.check_identity_sponsored(&params.creator_id, &id) {
            return response;
        }

        // Level-based restrictions removed - anyone can create spaces (PoW-gated)

        // Verify PoW
        let pow_nonce_space = match hex::decode(&params.pow_nonce_space) {
            Ok(bytes) if bytes.len() == 8 => {
                let mut arr = [0u8; 8];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid pow_nonce_space: must be 8-byte hex",
                    id,
                );
            }
        };

        let pow_hash = match hex::decode(&params.pow_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid pow_hash: must be 32-byte hex",
                    id,
                );
            }
        };

        // Reconstruct challenge from provided values (do NOT generate new challenge!)
        // The CLI sends the exact challenge parameters used during PoW mining.
        // We must use those same values to verify the hash.
        let content_hash = crate::crypto::sha256(params.name.as_bytes());
        let challenge = PoWChallenge {
            action_type: ActionType::SpaceCreation,
            content_hash,
            author_id: creator_bytes,
            timestamp: params.timestamp,
            difficulty: params.pow_difficulty,
            nonce_space: pow_nonce_space,
        };

        let solution = PoWSolution {
            challenge: challenge.clone(),
            nonce: params.pow_nonce,
            hash: pow_hash,
        };

        // Get PoW config based on network mode
        let pow_config = match self.node.network.as_str() {
            "regtest" => ForkPoWConfig::test(),
            "testnet" => ForkPoWConfig::testnet(),
            _ => ForkPoWConfig::production(),
        };

        // Get current time for timestamp validation
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if let Err(e) = verify_pow(&solution, &pow_config, current_time) {
            return RpcResponse::error(
                RpcErrorCode::PowInvalid,
                &format!("PoW verification failed: {}", e),
                id,
            );
        }

        // Space ID. An app-namespaced space (name `@<app>:<display>`) is name-addressed:
        // its id derives from (app, display) so it's a single shared namespace any client
        // can recognize + segregate. A normal space uses the PoW hash (random, so ids can't
        // be squatted). PoW is verified either way (anti-abuse) — for app spaces it just no
        // longer determines the id.
        let app_marker = parse_app_space_name(&params.name);
        let space_id_bytes: [u8; 16] = if let Some((ref app, ref display)) = app_marker {
            app_space_id_16(app, display)
        } else {
            apply_class(SpaceClass::Social, &pow_hash)
        };
        let space_id = encode_space_id(&space_id_bytes);

        // Server-side guard: the derived space id's class byte must be a known
        // SpaceClass. A well-behaved node derives ids honestly (app-namespaced
        // or `apply_class(SpaceClass::Social, ...)` above) so this should never
        // trip today — it exists to catch future derivation regressions before
        // a malformed id is ever accepted into the mempool/chain.
        if !crate::blocks::validation::space_id_class_is_valid(&space_id_bytes) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!(
                    "Derived space_id has unknown class byte: 0x{:02x}",
                    space_id_bytes[0]
                ),
                id,
            );
        }

        // Check if space already exists on-chain
        if let Some(ref chain_store) = self.node.chain_store {
            match chain_store.space_exists(&space_id_bytes) {
                Ok(true) => {
                    // An app-namespaced space is shared and name-addressed: "already exists"
                    // just means someone registered this name first, so return it
                    // idempotently instead of erroring — the caller can post to it either way.
                    if app_marker.is_some() {
                        info!(
                            "[CREATE_SPACE] App space {} ({}) already registered; returning it",
                            space_id, params.name
                        );
                        let result = CreateSpaceResult {
                            space_id,
                            name: params.name,
                            success: true,
                        };
                        return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                    }
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Space {} already exists", space_id),
                        id,
                    );
                }
                Err(e) => {
                    warn!("Failed to check space existence: {}", e);
                }
                Ok(false) => {} // Good, doesn't exist yet
            }
        }

        // Register space on-chain
        let space_info = crate::storage::SpaceInfo {
            space_id: space_id_bytes,
            name: params.name.clone(),
            description: params.description.clone(),
            creator: creator_bytes,
            created_at: current_time,
            pow_work: 1u64 << params.pow_difficulty.min(63),
            // Private space fields (defaults for public spaces)
            is_private: false,
            encrypted_name: None,
            creator_encrypted_key: None,
            key_version: 0,
        };

        if let Some(ref chain_store) = self.node.chain_store {
            if let Err(e) = chain_store.register_space(&space_info) {
                warn!("Failed to register space on-chain: {}", e);
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Failed to register space: {}", e),
                    id,
                );
            }
            info!("[CREATE_SPACE] Registered space {} on-chain", space_id);
        }

        // Create CreateSpace action for block propagation (SPEC_08)
        if let Some(ref block_builder) = self.node.block_builder {
            // Create signature bytes
            let mut signature_bytes_arr = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes_arr.copy_from_slice(&sig_bytes);
                }
            }

            // Convert 16-byte space_id to 32-byte format for Action
            let mut space_id_32: [u8; 32] = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id_bytes);

            let pow_work = 1u64 << params.pow_difficulty.min(63);

            let action = crate::blocks::Action::new_create_space(
                creator_bytes,
                current_time,
                space_id_32,
                params.pow_nonce,
                pow_work,
                pow_hash,
                signature_bytes_arr,
            );

            // Add to block builder using space_id as thread_id (each space is its own "thread")
            use crate::blocks::content_block::SpaceCreationMetadata;

            let action_clone = action.clone();

            // Space creation uses the space_id as the thread_id; the branch is
            // hash-derived from it like any other new thread (SPEC_08 §4)
            let branch_path =
                self.resolve_branch_path(&space_id_32, &space_id_32, Some(&creator_bytes));

            // Scope the lock to avoid holding it across await
            {
                let mut builder = block_builder.write().unwrap();
                // Include space metadata so other nodes can register the space when syncing
                let metadata = SpaceCreationMetadata {
                    name: params.name.clone(),
                    description: params.description.clone(),
                };
                builder.add_create_space_action(
                    space_id_32,
                    space_id_32,
                    action,
                    branch_path,
                    metadata,
                );
                debug!("[CREATE_SPACE] Added CreateSpace action with metadata to block builder");
            } // Lock released here

            // Broadcast action to peers (mempool gossip)
            if self.node.connection_pool.is_some() {
                use crate::network::messages::ActionAnnouncePayload;
                use crate::types::network::{MessageEnvelope, MessageType};

                let action_data = action_clone.serialize();
                let payload = ActionAnnouncePayload::new(space_id_32, space_id_32, action_data);
                let envelope = MessageEnvelope::new_fork_agnostic(
                    MessageType::ActionAnnounce,
                    payload.to_bytes().to_vec(),
                );

                // Origin obfuscation (SWIM-PRIV-1): delay/stem self-originated announce.
                self.gossip_self_originated_action(envelope).await;
                info!(
                    "[MEMPOOL] Announced CREATE_SPACE action to peers (space={})",
                    space_id
                );

                // Check if PoW threshold met - form block immediately if so
                self.try_form_block_if_threshold_met().await;
            }
        }

        // Also save space to local config for convenience
        let config_path = self.node.data_dir.join("config.toml");
        let mut config_content = std::fs::read_to_string(&config_path).unwrap_or_default();

        // Add to followed_spaces if not present
        if !config_content.contains(&format!("\"{}\"", space_id)) {
            // Simple append - add to followed_spaces array
            if config_content.contains("followed_spaces = [") {
                // Insert before the closing bracket
                config_content = config_content.replace(
                    "followed_spaces = [",
                    &format!("followed_spaces = [\n  \"{}\",", space_id),
                );
            } else {
                // Add new section
                config_content.push_str(&format!("\nfollowed_spaces = [\n  \"{}\"\n]\n", space_id));
            }
        }

        // Add to space_names table
        if config_content.contains("[space_names]") {
            // Insert after the section header
            let insert_pos = config_content.find("[space_names]").unwrap() + "[space_names]".len();
            let (before, after) = config_content.split_at(insert_pos);
            config_content = format!(
                "{}\n\"{}\" = \"{}\"{}",
                before, space_id, params.name, after
            );
        } else {
            // Add new section
            config_content.push_str(&format!(
                "\n[space_names]\n\"{}\" = \"{}\"\n",
                space_id, params.name
            ));
        }

        // Write config (non-fatal if this fails, since on-chain is the source of truth)
        if let Err(e) = std::fs::write(&config_path, &config_content) {
            warn!("Failed to save space to local config (non-fatal): {}", e);
        }

        info!(
            "[CREATE_SPACE] Created space {} ({})",
            space_id, params.name
        );

        // Recognition: space registered successfully. Award LaneOpener on the
        // creator's first space (SPEC_09 §5.3). Re-specified for the PoW-only
        // model — no swimmer-level gate. Recognition ONLY: never blocks creation.
        if let Some(ref achievements) = self.node.achievement_service {
            match achievements.record_space_created(&creator_bytes, current_time) {
                Ok(unlocked) => {
                    for a in unlocked {
                        info!(
                            "[ACHIEVEMENT] Unlocked {} {} (created space)",
                            a.badge(),
                            a.name()
                        );
                    }
                }
                Err(e) => warn!("[ACHIEVEMENT] Failed to record space creation: {}", e),
            }
        }

        let result = CreateSpaceResult {
            space_id,
            name: params.name,
            success: true,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Rename a space or behavioral community (SPEC_13 Phase 2 Lane A #6).
    ///
    /// A PoW-costing, signed action (same cost class as space creation).
    /// Permitted for the space creator, or any founding member of a
    /// behavioral community. Applies locally, then flows through the normal
    /// action mempool/block pipeline (the new name travels via the block's
    /// `space_metadata`, exactly like CreateSpace) so peers converge.
    async fn rename_space(&self, params: Value, id: Value) -> RpcResponse {
        use crate::blocks::content_block::SpaceCreationMetadata;

        let params: RenameSpaceParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // New name validation (mirrors SpaceInfo limits).
        let new_name = params.new_name.trim().to_string();
        if new_name.is_empty() || new_name.len() > 64 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "new_name must be 1-64 bytes UTF-8",
                id,
            );
        }
        // App-namespaced names are name-addressed (id derives from the name);
        // renaming INTO the marker namespace would desync id and name.
        if parse_app_space_name(&new_name).is_some() {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "new_name must not use the @app: namespace marker",
                id,
            );
        }

        // Renamer public key.
        let renamer_bytes: [u8; 32] = match hex::decode(&params.renamer_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid renamer_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Sponsorship gate (same as every other write action).
        if let Err(response) = self.check_identity_sponsored(&params.renamer_id, &id) {
            return response;
        }

        // PoW verification — same cost class as space creation, over the
        // new-name commitment.
        let pow_nonce_space: [u8; 8] = match hex::decode(&params.pow_nonce_space) {
            Ok(bytes) if bytes.len() == 8 => {
                let mut arr = [0u8; 8];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid pow_nonce_space: must be 8-byte hex",
                    id,
                );
            }
        };
        let pow_hash: [u8; 32] = match hex::decode(&params.pow_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid pow_hash: must be 32-byte hex",
                    id,
                );
            }
        };
        let name_hash = crate::crypto::sha256(new_name.as_bytes());
        let challenge = PoWChallenge {
            action_type: ActionType::SpaceCreation,
            content_hash: name_hash,
            author_id: renamer_bytes,
            timestamp: params.timestamp,
            difficulty: params.pow_difficulty,
            nonce_space: pow_nonce_space,
        };
        let solution = PoWSolution {
            challenge,
            nonce: params.pow_nonce,
            hash: pow_hash,
        };
        let pow_config = match self.node.network.as_str() {
            "regtest" => ForkPoWConfig::test(),
            "testnet" => ForkPoWConfig::testnet(),
            _ => ForkPoWConfig::production(),
        };
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Err(e) = verify_pow(&solution, &pow_config, current_time) {
            return RpcResponse::error(
                RpcErrorCode::PowInvalid,
                &format!("PoW verification failed: {}", e),
                id,
            );
        }

        // Resolve the target (space or community).
        let mut target_32 = match Self::decode_space_or_community_id(&params.space_id) {
            Ok(v) => v,
            Err(e) => return RpcResponse::error(RpcErrorCode::InvalidParams, &e, id),
        };
        let Some(chain_store) = &self.node.chain_store else {
            return RpcResponse::error(
                RpcErrorCode::SubsystemUnavailable,
                "Chain store not available",
                id,
            );
        };
        let mut lineage = chain_store
            .get_community_lineage(&target_32)
            .unwrap_or(None);
        if lineage.is_none() && target_32[16..] == [0u8; 16] {
            if let Ok(all) = chain_store.get_all_community_lineages() {
                if let Some(l) = all
                    .into_iter()
                    .find(|l| l.community_id[..16] == target_32[..16])
                {
                    target_32 = l.community_id;
                    lineage = Some(l);
                }
            }
        }

        // Signature over the rename message (verified again by every node
        // that processes the block).
        let mut signature_bytes = [0u8; 64];
        match hex::decode(&params.signature) {
            Ok(sig) if sig.len() == 64 => signature_bytes.copy_from_slice(&sig),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature: must be 64-byte hex",
                    id,
                );
            }
        }
        {
            use ed25519_dalek::{Signature, Verifier, VerifyingKey};
            let msg = crate::blocks::Action::rename_space_signing_message(
                &target_32,
                &name_hash,
                params.timestamp,
            );
            let valid = VerifyingKey::from_bytes(&renamer_bytes)
                .map(|vk| {
                    vk.verify(&msg, &Signature::from_bytes(&signature_bytes))
                        .is_ok()
                })
                .unwrap_or(false);
            if !valid {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Signature does not verify over the rename message",
                    id,
                );
            }
        }

        // Authorization + local apply.
        let block_space_id: [u8; 32];
        if let Some(mut lineage) = lineage {
            // Behavioral community: founding members may rename.
            let is_founder = chain_store
                .get_community_formation(&target_32)
                .ok()
                .flatten()
                .is_some_and(|f| f.founding_members.contains(&renamer_bytes));
            if !is_founder {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Only founding members can rename a behavioral community",
                    id,
                );
            }
            block_space_id = lineage.parent_space_id;
            lineage.display_name = new_name.clone();
            lineage.renamed_at = Some(params.timestamp);
            lineage.renamed_by = Some(renamer_bytes);
            if let Err(e) = chain_store.put_community_lineage(&lineage) {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Failed to persist rename: {}", e),
                    id,
                );
            }
        } else {
            // Registry space: only the creator may rename.
            let mut space_16 = [0u8; 16];
            space_16.copy_from_slice(&target_32[..16]);
            match chain_store.get_space(&space_16) {
                Ok(Some(mut info)) => {
                    if info.creator != renamer_bytes {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Only the space creator can rename a space",
                            id,
                        );
                    }
                    if info.is_private {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Private spaces cannot be renamed via rename_space (names are encrypted)",
                            id,
                        );
                    }
                    if resolve_app_space(&space_16, &info.name).is_some() {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "App-namespaced spaces are name-addressed and cannot be renamed",
                            id,
                        );
                    }
                    info.name = new_name.clone();
                    if let Err(e) = chain_store.register_space(&info) {
                        return RpcResponse::error(
                            RpcErrorCode::StorageError,
                            &format!("Failed to persist rename: {}", e),
                            id,
                        );
                    }
                    block_space_id = target_32;
                }
                Ok(None) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Unknown space/community id",
                        id,
                    );
                }
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::StorageError,
                        &format!("Space lookup failed: {}", e),
                        id,
                    );
                }
            }
        }

        // Flow the action through the normal mempool/block pipeline so all
        // nodes converge (the name travels via space_metadata).
        let pow_work = 1u64 << params.pow_difficulty.min(63);
        let action = crate::blocks::Action::new_rename_space(
            renamer_bytes,
            params.timestamp,
            target_32,
            name_hash,
            params.pow_nonce,
            pow_work,
            pow_hash,
            signature_bytes,
        );
        if let Some(ref block_builder) = self.node.block_builder {
            let action_clone = action.clone();
            let branch_path =
                self.resolve_branch_path(&block_space_id, &target_32, Some(&renamer_bytes));
            {
                let mut builder = block_builder.write().unwrap();
                builder.add_create_space_action(
                    target_32,
                    block_space_id,
                    action,
                    branch_path,
                    SpaceCreationMetadata {
                        name: new_name.clone(),
                        description: None,
                    },
                );
            }
            if self.node.connection_pool.is_some() {
                use crate::network::messages::ActionAnnouncePayload;
                use crate::types::network::{MessageEnvelope, MessageType};
                let action_data = action_clone.serialize();
                let payload = ActionAnnouncePayload::new(target_32, block_space_id, action_data);
                let envelope = MessageEnvelope::new_fork_agnostic(
                    MessageType::ActionAnnounce,
                    payload.to_bytes().to_vec(),
                );
                self.gossip_self_originated_action(envelope).await;
                self.try_form_block_if_threshold_met().await;
            }
        }

        // Invalidate the space-list cache so the new name shows immediately.
        *self.node.space_list_cache.lock().unwrap() = None;

        let mut display_16 = [0u8; 16];
        display_16.copy_from_slice(&target_32[..16]);
        let result = RenameSpaceResult {
            space_id: encode_space_id(&display_16),
            name: new_name,
            success: true,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Resolve a space's display name (Bug #4).
    ///
    /// If we already have a real name locally, return it immediately.
    /// Otherwise broadcast GET_SPACE_META to connected peers and return
    /// `{name: null, status: "queried"}`. The reply, when it arrives, will
    /// upsert the name into the local registry; clients can re-call list_spaces.
    async fn resolve_space_name(&self, params: Value, id: Value) -> RpcResponse {
        #[derive(serde::Deserialize)]
        struct P {
            space_id: String,
        }

        let params: P = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                )
            }
        };

        let space_id_16 = match decode_space_id(&params.space_id) {
            Ok(b) => b,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid space_id: {}", e),
                    id,
                )
            }
        };

        let placeholder = format!("Space {}", hex::encode(&space_id_16[..4]));

        // Step 1: check local registry
        if let Some(ref chain_store) = self.node.chain_store {
            if let Ok(Some(info)) = chain_store.get_space(&space_id_16) {
                if !info.name.is_empty() && info.name != placeholder {
                    return RpcResponse::success(
                        serde_json::json!({
                            "space_id": params.space_id,
                            "name": info.name,
                            "status": "local",
                        }),
                        id,
                    );
                }
            }
        }

        // Step 2: broadcast GET_SPACE_META to peers
        let pool = match &self.node.connection_pool {
            Some(p) => p,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Connection pool not available",
                    id,
                )
            }
        };

        use crate::network::messages::GetSpaceMetaPayload;
        use crate::types::network::{MessageEnvelope, MessageType};
        let req = GetSpaceMetaPayload::new(space_id_16);
        let envelope =
            MessageEnvelope::new_fork_agnostic(MessageType::GetSpaceMeta, req.to_bytes());
        let sent = pool.broadcast(&envelope).await;

        info!(
            "[RESOLVE_SPACE_NAME] Broadcast GET_SPACE_META for {} to {} peers",
            hex::encode(&space_id_16[..4]),
            sent
        );

        RpcResponse::success(
            serde_json::json!({
                "space_id": params.space_id,
                "name": serde_json::Value::Null,
                "status": "queried",
                "peers_asked": sent,
                "message": "Name not local; asked peers. Re-call list_spaces shortly."
            }),
            id,
        )
    }

    async fn list_space_content(&self, params: Value, id: Value) -> RpcResponse {
        let start_time = Instant::now();

        let params: ListSpaceContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Decode bech32m space ID to 16 bytes
        let space_id_16: [u8; 16] = match decode_space_id(&params.space_id) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid space ID format: {}", e),
                    id,
                );
            }
        };

        debug!(
            "[LIST_SPACE_CONTENT] Looking for space: {} (bytes: {:?})",
            params.space_id, &space_id_16
        );

        // Use indexed lookup for fast content retrieval
        let mut items: Vec<ContentSummary> = Vec::new();
        let mut total = 0usize;

        // Create BlobStore ONCE outside the loop for performance
        let blob_store = BlobStore::new(&self.node.sync_blob_path).ok();

        // When filtering by content_type, we need to fetch more items because
        // we filter AFTER fetching. Use a larger limit to ensure we find enough matching items.
        let fetch_limit = if params.content_type.is_some() {
            std::cmp::max(params.limit * 20, 1000) // Fetch 20x more when filtering
        } else {
            params.limit
        };

        if let Some(ref chain_store) = self.node.chain_store {
            // Use the new indexed method (O(log n) instead of O(n) full table scan)
            match chain_store.get_content_for_space(&space_id_16, fetch_limit, params.offset) {
                Ok(indexed_content) => {
                    // Total count for pagination — short-TTL cached (the feed calls this per
                    // space repeatedly; the raw count is a prefix scan over the space's items).
                    total = self.cached_space_content_count(&space_id_16);

                    for (content_hash, metadata) in indexed_content {
                        let content_id = format!("sha256:{}", hex::encode(&content_hash));
                        let actor_id = crate::types::identity::IdentityId(metadata.author);
                        let author_id = crate::crypto::address::encode_address(&actor_id);
                        let content_type = match metadata.content_type {
                            0 => "Post",
                            1 => "Reply",
                            _ => "Engage",
                        };

                        // Get parent_id for replies
                        let parent_id = if metadata.parent_hash == [0u8; 32] {
                            None
                        } else {
                            Some(format!("sha256:{}", hex::encode(&metadata.parent_hash)))
                        };

                        // Try to get body from content_store first (has body_inline for replies),
                        // then fall back to BlobStore (for posts)
                        let (title, body_preview, body) = {
                            let mut text_opt: Option<String> = None;

                            // First try content_store (same approach as get_replies)
                            if let Some(ref cs) = self.node.content_store {
                                let cid =
                                    crate::types::content::ContentId::from_bytes(content_hash);
                                if let Ok(Some(item)) = cs.get(&cid) {
                                    if let Some(ref body_inline) = item.body_inline {
                                        if !body_inline.is_empty() {
                                            text_opt = Some(body_inline.clone());
                                        }
                                    }
                                }
                                // If no body_inline, try get_body_by_hash
                                if text_opt.is_none() {
                                    if let Ok(Some(body_str)) = cs.get_body_by_hash(&content_hash) {
                                        if !body_str.is_empty() {
                                            text_opt = Some(body_str);
                                        }
                                    }
                                }
                            }

                            // Fall back to BlobStore (for posts stored there)
                            if text_opt.is_none() {
                                if let Some(ref bs) = blob_store {
                                    let blob_hash = ContentBlobHash::from_bytes(content_hash);
                                    if let Ok(bytes) = bs.get(&blob_hash) {
                                        if let Ok(text) = String::from_utf8(bytes) {
                                            text_opt = Some(text);
                                        }
                                    }
                                }
                            }

                            // Parse title/body from text
                            if let Some(text) = text_opt {
                                let (parsed_title, parsed_body) = if let Some(idx) =
                                    text.find("\n\n")
                                {
                                    (Some(text[..idx].to_string()), text[(idx + 2)..].to_string())
                                } else {
                                    (None, text.clone())
                                };
                                let preview = if parsed_body.chars().count() > 200 {
                                    format!(
                                        "{}...",
                                        parsed_body.chars().take(200).collect::<String>()
                                    )
                                } else {
                                    parsed_body.clone()
                                };
                                (parsed_title, Some(preview), Some(text))
                            } else {
                                (None, None, None)
                            }
                        };

                        // Get accurate decay from DecayIntegration
                        let content_id_bytes = ContentId::from_bytes(content_hash);
                        let content_blob_hash = ContentBlobHash::from_bytes(content_hash);
                        let (
                            decay_state,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            last_engagement_ms,
                        ) = if let Some(ref decay) = self.node.decay_integration {
                            if let Ok(Some(ds)) = decay.get_decay_state(&content_blob_hash) {
                                let state_str = if ds.is_decayed {
                                    "decayed"
                                } else if ds.survival_probability < 0.25 {
                                    "stale"
                                } else if ds.is_protected {
                                    "protected"
                                } else {
                                    "active"
                                };

                                // Calculate seconds until floor ends (floor = 48h from creation)
                                let floor_secs = if ds.is_protected && ds.age_seconds < 48 * 3600 {
                                    Some((48 * 3600u64).saturating_sub(ds.age_seconds))
                                } else {
                                    None
                                };

                                // Calculate seconds until pruned (decay < 6.25%)
                                let pruned_secs = if ds.is_decayed {
                                    None
                                } else {
                                    let threshold = 0.0625;
                                    if ds.survival_probability > threshold {
                                        let half_life = 7.0 * 24.0 * 3600.0; // 7 days
                                        let time_to_threshold = half_life
                                            * (ds.survival_probability / threshold).log2();
                                        Some(time_to_threshold as u64)
                                    } else {
                                        None
                                    }
                                };

                                // Calculate last_engagement from time_since_engagement
                                let now_ms = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis()
                                    as u64;
                                let last_engagement_ms =
                                    now_ms.saturating_sub(ds.time_since_engagement * 1000);

                                (
                                    state_str.to_string(),
                                    ds.survival_probability,
                                    ds.is_protected,
                                    floor_secs,
                                    pruned_secs,
                                    last_engagement_ms,
                                )
                            } else {
                                // Not in decay integration yet, use creation time
                                let created_at_ms = metadata.timestamp * 1000;
                                (
                                    "protected".to_string(),
                                    1.0,
                                    true,
                                    Some(48 * 3600),
                                    Some(28 * 24 * 3600),
                                    created_at_ms,
                                )
                            }
                        } else {
                            // No decay integration, fallback
                            let created_at_ms = metadata.timestamp * 1000;
                            ("active".to_string(), 1.0, false, None, None, created_at_ms)
                        };

                        // Get reply count from chain (confirmed) + mempool (pending)
                        let reply_count = {
                            let mut count = 0u64;

                            // Count ALL replies recursively (including nested replies), cached
                            count += self.cached_reply_count(&content_hash);

                            // Count pending replies from mempool (recursive)
                            if let Some(ref block_builder) = self.node.block_builder {
                                if let Ok(bb) = block_builder.read() {
                                    let pending = bb.get_pending_actions();
                                    // Build a set of all content hashes we're counting for (root + all replies)
                                    let mut target_parents: std::collections::HashSet<[u8; 32]> =
                                        std::collections::HashSet::new();
                                    target_parents.insert(content_hash);

                                    // Multiple passes to find nested replies
                                    loop {
                                        let mut found_new = false;
                                        for (_thread_id, _space_id, action) in &pending {
                                            if action.action_type
                                                == crate::blocks::action::ActionType::Reply
                                            {
                                                if let (Some(parent_id), Some(reply_hash)) =
                                                    (action.parent_id, action.content_hash)
                                                {
                                                    if target_parents.contains(&parent_id)
                                                        && !target_parents.contains(&reply_hash)
                                                    {
                                                        count += 1;
                                                        target_parents.insert(reply_hash);
                                                        found_new = true;
                                                    }
                                                }
                                            }
                                        }
                                        if !found_new {
                                            break;
                                        }
                                    }
                                }
                            }
                            count
                        };

                        // Pool system removed - engagements are now stored directly
                        let (pool_progress, has_pool, pool_status) =
                            (0.0, false, "none".to_string());

                        // Get media_refs + original authoring timestamp from content_store.
                        // We prefer the ContentItem's created_at (the same value
                        // get_content / the post detail shows) over the on-chain action
                        // time, so the feed/space ordering and displayed time match the
                        // detail. metadata.timestamp is when the action entered THIS chain,
                        // which for bulk-synced/seeded content is import time, not when the
                        // post was authored.
                        let mut item_created_at_ms: Option<u64> = None;
                        let media_refs: Vec<MediaRefResult> =
                            if let Some(ref content_store) = self.node.content_store {
                                if let Ok(Some(item)) = content_store.get(&content_id_bytes) {
                                    if item.created_at > 0 {
                                        item_created_at_ms =
                                            Some(if item.created_at < 10_000_000_000 {
                                                item.created_at * 1000
                                            } else {
                                                item.created_at
                                            });
                                    }
                                    item.media_refs
                                        .iter()
                                        .map(|mr| {
                                            let media_type_str = match mr.media_type {
                                                crate::types::content::MediaType::ImageJpeg => {
                                                    "image/jpeg"
                                                }
                                                crate::types::content::MediaType::ImagePng => {
                                                    "image/png"
                                                }
                                                crate::types::content::MediaType::ImageGif => {
                                                    "image/gif"
                                                }
                                                crate::types::content::MediaType::ImageWebp => {
                                                    "image/webp"
                                                }
                                            };
                                            MediaRefResult {
                                                media_hash: hex::encode(mr.media_hash.as_bytes()),
                                                media_type: media_type_str.to_string(),
                                                size_bytes: mr.size_bytes,
                                            }
                                        })
                                        .collect()
                                } else {
                                    vec![]
                                }
                            } else {
                                vec![]
                            };

                        let created_at_ms = item_created_at_ms.unwrap_or(metadata.timestamp * 1000);

                        items.push(ContentSummary {
                            content_id,
                            content_type: content_type.to_string(),
                            author_id,
                            space_id: params.space_id.clone(),
                            parent_id,
                            created_at: created_at_ms,
                            last_engagement: last_engagement_ms,
                            title,
                            body,
                            body_preview,
                            engagement_count: 0,
                            reply_count,
                            decay_state,
                            seconds_until_decay: seconds_until_pruned,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            pool_progress,
                            has_pool,
                            pool_status,
                            pending: false,
                            media_refs,
                        });
                    }

                    debug!(
                        "[LIST_SPACE_CONTENT] Indexed lookup returned {} items in {:?}",
                        items.len(),
                        start_time.elapsed()
                    );
                }
                Err(e) => {
                    warn!(
                        "[LIST_SPACE_CONTENT] Index lookup failed, falling back to full scan: {}",
                        e
                    );
                    // Fall back to full scan if index fails (shouldn't happen normally)
                }
            }
        }

        // Add pending content from BlockBuilder mempool (Posts, Replies, Engages)
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(bb_read) = block_builder.read() {
                let pending_actions = bb_read.get_pending_actions();
                for (_thread_id, pending_space_id, action) in pending_actions {
                    // Check if this action is for the requested space
                    if pending_space_id[..16] != space_id_16 {
                        continue;
                    }

                    let content_hash = match action.content_hash {
                        Some(h) => h,
                        None => continue,
                    };
                    let content_id = format!("sha256:{}", hex::encode(&content_hash));

                    // Skip if we already have this content on chain
                    if items.iter().any(|i| i.content_id == content_id) {
                        continue;
                    }

                    // Determine content type
                    let (content_type_str, parent_id) = match action.action_type {
                        crate::blocks::action::ActionType::Post => ("Post".to_string(), None),
                        crate::blocks::action::ActionType::Reply => {
                            let parent = action
                                .parent_id
                                .map(|p| format!("sha256:{}", hex::encode(&p)));
                            ("Reply".to_string(), parent)
                        }
                        crate::blocks::action::ActionType::Engage => {
                            let parent = action
                                .parent_id
                                .map(|p| format!("sha256:{}", hex::encode(&p)));
                            ("Engage".to_string(), parent)
                        }
                        _ => continue, // Skip other action types
                    };

                    let actor_id = crate::types::identity::IdentityId(action.actor);
                    let author_id = crate::crypto::address::encode_address(&actor_id);

                    // Get body: try content_store first (for replies), then BlobStore (for posts)
                    let (title, body_preview, body) = {
                        let mut text_opt: Option<String> = None;

                        // First try content_store (has body_inline for replies)
                        if let Some(ref cs) = self.node.content_store {
                            let cid = crate::types::content::ContentId::from_bytes(content_hash);
                            if let Ok(Some(item)) = cs.get(&cid) {
                                if let Some(ref body_inline) = item.body_inline {
                                    if !body_inline.is_empty() {
                                        text_opt = Some(body_inline.clone());
                                    }
                                }
                            }
                            if text_opt.is_none() {
                                if let Ok(Some(body_str)) = cs.get_body_by_hash(&content_hash) {
                                    if !body_str.is_empty() {
                                        text_opt = Some(body_str);
                                    }
                                }
                            }
                        }

                        // Fall back to BlobStore (for posts)
                        if text_opt.is_none() {
                            if let Some(ref bs) = blob_store {
                                let blob_hash = ContentBlobHash::from_bytes(content_hash);
                                if let Ok(bytes) = bs.get(&blob_hash) {
                                    if let Ok(text) = String::from_utf8(bytes) {
                                        text_opt = Some(text);
                                    }
                                }
                            }
                        }

                        // Parse title/body from text
                        if let Some(text) = text_opt {
                            let (parsed_title, parsed_body) = if action.action_type
                                == crate::blocks::action::ActionType::Post
                            {
                                // Post: first line may be title
                                if let Some(idx) = text.find("\n\n") {
                                    (Some(text[..idx].to_string()), text[(idx + 2)..].to_string())
                                } else {
                                    (None, text.clone())
                                }
                            } else {
                                // Reply/Engage: no title
                                (None, text.clone())
                            };
                            let preview = if parsed_body.chars().count() > 200 {
                                format!("{}...", parsed_body.chars().take(200).collect::<String>())
                            } else {
                                parsed_body.clone()
                            };
                            (parsed_title, Some(preview), Some(text))
                        } else {
                            (None, None, None)
                        }
                    };

                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    // Get media_refs from action if available
                    let media_refs: Vec<MediaRefResult> = action
                        .media_refs
                        .iter()
                        .map(|amr| {
                            let media_type_str = match amr.media_type {
                                crate::blocks::action::ActionMediaRef::TYPE_JPEG => "image/jpeg",
                                crate::blocks::action::ActionMediaRef::TYPE_PNG => "image/png",
                                crate::blocks::action::ActionMediaRef::TYPE_GIF => "image/gif",
                                crate::blocks::action::ActionMediaRef::TYPE_WEBP => "image/webp",
                                _ => "image/jpeg",
                            };
                            MediaRefResult {
                                media_hash: hex::encode(&amr.media_hash),
                                media_type: media_type_str.to_string(),
                                size_bytes: amr.size_bytes,
                            }
                        })
                        .collect();

                    items.push(ContentSummary {
                        content_id,
                        content_type: content_type_str,
                        author_id,
                        space_id: params.space_id.clone(),
                        parent_id,
                        created_at: now_ms,
                        last_engagement: now_ms,
                        title,
                        body,
                        body_preview,
                        engagement_count: 0,
                        reply_count: 0,
                        decay_state: "pending".to_string(),
                        seconds_until_decay: None,
                        survival_probability: 1.0,
                        is_protected: true,
                        seconds_until_decay_starts: None,
                        seconds_until_pruned: None,
                        pool_progress: 0.0,
                        has_pool: false,
                        pool_status: "none".to_string(),
                        pending: true,
                        media_refs,
                    });
                }
            }
        }

        // NOTE: We deliberately do NOT fallback to ContentStore here.
        // ContentStore can have stale/orphan content from previous runs that was never
        // committed to the blockchain. Agents and clients should only see authoritative
        // blockchain data. If the chain_store is empty, return empty results.
        //
        // REMOVED: ContentStore fallback that caused orphan content to appear in listings
        if items.is_empty() && false {
            // Disabled fallback
            if let Some(ref content_store) = self.node.content_store {
                for result in content_store.iter_content() {
                    if let Ok(item) = result {
                        // Check if space matches (compare first 16 bytes)
                        let item_space: [u8; 16] =
                            item.space_id.as_bytes()[..16].try_into().unwrap();
                        if item_space == space_id_16 {
                            total += 1;

                            // Skip if before offset
                            if total <= params.offset {
                                continue;
                            }

                            // Stop if at limit
                            if items.len() >= params.limit {
                                continue;
                            }

                            // Create summary
                            let content_id =
                                format!("sha256:{}", hex::encode(item.content_id.as_bytes()));
                            let author_id = crate::crypto::address::encode_address(&item.author_id);

                            // Parse title from body (format is "Title\n\nBody")
                            let body_text = item.body_inline.as_deref().unwrap_or("");
                            let (title, body) = if let Some(idx) = body_text.find("\n\n") {
                                let (t, b) = body_text.split_at(idx);
                                (
                                    Some(t.to_string()),
                                    b.trim_start_matches("\n\n").to_string(),
                                )
                            } else {
                                (None, body_text.to_string())
                            };

                            let body_preview = if body.len() > 200 {
                                Some(format!("{}...", &body[..200]))
                            } else {
                                Some(body.clone())
                            };

                            // Get accurate decay from DecayIntegration
                            let content_blob_hash =
                                ContentBlobHash::from_bytes(*item.content_id.as_bytes());
                            let (
                                decay_state,
                                survival_probability,
                                is_protected,
                                seconds_until_decay_starts,
                                seconds_until_pruned,
                                last_engagement_ms,
                            ) = if let Some(ref decay) = self.node.decay_integration {
                                if let Ok(Some(ds)) = decay.get_decay_state(&content_blob_hash) {
                                    let state_str = if ds.is_decayed {
                                        "decayed"
                                    } else if ds.survival_probability < 0.25 {
                                        "stale"
                                    } else if ds.is_protected {
                                        "protected"
                                    } else {
                                        "active"
                                    };

                                    let floor_secs =
                                        if ds.is_protected && ds.age_seconds < 48 * 3600 {
                                            Some((48 * 3600u64).saturating_sub(ds.age_seconds))
                                        } else {
                                            None
                                        };

                                    let pruned_secs = if ds.is_decayed {
                                        None
                                    } else {
                                        let threshold = 0.0625;
                                        if ds.survival_probability > threshold {
                                            let half_life = 7.0 * 24.0 * 3600.0;
                                            let time_to_threshold = half_life
                                                * (ds.survival_probability / threshold).log2();
                                            Some(time_to_threshold as u64)
                                        } else {
                                            None
                                        }
                                    };

                                    // Calculate last_engagement from time_since_engagement
                                    let now_ms = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis()
                                        as u64;
                                    let last_engagement_ms =
                                        now_ms.saturating_sub(ds.time_since_engagement * 1000);

                                    (
                                        state_str.to_string(),
                                        ds.survival_probability,
                                        ds.is_protected,
                                        floor_secs,
                                        pruned_secs,
                                        last_engagement_ms,
                                    )
                                } else {
                                    (
                                        "protected".to_string(),
                                        1.0,
                                        true,
                                        Some(48 * 3600),
                                        Some(28 * 24 * 3600),
                                        item.last_engagement,
                                    )
                                }
                            } else {
                                (
                                    "active".to_string(),
                                    1.0,
                                    false,
                                    None,
                                    None,
                                    item.last_engagement,
                                )
                            };

                            // Get reply count
                            let reply_count = content_store
                                .get_children(&item.content_id)
                                .map(|children| children.len() as u64)
                                .unwrap_or(0);

                            // Pool system removed - engagements are now stored directly
                            let _content_hash = item.content_id.as_bytes();
                            let (pool_progress, has_pool, pool_status) =
                                (0.0, false, "none".to_string());

                            // Convert media_refs
                            let media_refs: Vec<MediaRefResult> = item
                                .media_refs
                                .iter()
                                .map(|mr| {
                                    let media_type_str = match mr.media_type {
                                        crate::types::content::MediaType::ImageJpeg => "image/jpeg",
                                        crate::types::content::MediaType::ImagePng => "image/png",
                                        crate::types::content::MediaType::ImageGif => "image/gif",
                                        crate::types::content::MediaType::ImageWebp => "image/webp",
                                    };
                                    MediaRefResult {
                                        media_hash: hex::encode(mr.media_hash.as_bytes()),
                                        media_type: media_type_str.to_string(),
                                        size_bytes: mr.size_bytes,
                                    }
                                })
                                .collect();

                            items.push(ContentSummary {
                                content_id,
                                content_type: format!("{:?}", item.content_type),
                                author_id,
                                space_id: params.space_id.clone(),
                                parent_id: item
                                    .parent_id
                                    .map(|p| format!("sha256:{}", hex::encode(p.as_bytes()))),
                                created_at: item.created_at,
                                last_engagement: last_engagement_ms,
                                title,
                                body: Some(body),
                                body_preview,
                                engagement_count: item.engagement_count as u64,
                                reply_count,
                                decay_state,
                                seconds_until_decay: seconds_until_pruned,
                                survival_probability,
                                is_protected,
                                seconds_until_decay_starts,
                                seconds_until_pruned,
                                pool_progress,
                                has_pool,
                                pool_status,
                                pending: false,
                                media_refs,
                            });
                        }
                    }
                }
            }
        }

        // Sort by created_at (most recent first) for "recent" sort
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        // Apply content_type filter if specified
        if let Some(ref filter_type) = params.content_type {
            let filter_type_lower = filter_type.to_lowercase();
            items.retain(|item| item.content_type.to_lowercase() == filter_type_lower);
            // Update total to reflect filtered count
            total = items.len();
            // Apply the original limit after filtering
            items.truncate(params.limit);
        }

        // Log how many items have bodies vs missing
        let with_body = items.iter().filter(|i| i.body.is_some()).count();
        let missing_body = items.iter().filter(|i| i.body.is_none()).count();
        let posts = items.iter().filter(|i| i.content_type == "Post").count();
        let replies = items.iter().filter(|i| i.content_type == "Reply").count();
        let engages = items.iter().filter(|i| i.content_type == "Engage").count();
        info!("[LIST_SPACE_CONTENT] Returning {} items ({} with body, {} missing body, total={}, filter={:?}): {} posts, {} replies, {} engages",
            items.len(), with_body, missing_body, total, params.content_type, posts, replies, engages);

        let result = ListSpaceContentResult { items, total };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// List only Posts (top-level threads) in a space
    ///
    /// This is the efficient method for fetching threads - it filters at the
    /// database level before pagination, so you get exactly `limit` posts.
    ///
    /// Use this instead of `list_space_content` when you only need threads.
    async fn list_space_posts(&self, params: Value, id: Value) -> RpcResponse {
        let params: ListSpaceContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Decode bech32m space ID to 16 bytes
        let space_id_16: [u8; 16] = match decode_space_id(&params.space_id) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid space ID format: {}", e),
                    id,
                );
            }
        };

        debug!(
            "[LIST_SPACE_POSTS] Looking for posts in space: {}",
            params.space_id
        );

        let mut items: Vec<ContentSummary> = Vec::new();
        let blob_store = BlobStore::new(&self.node.sync_blob_path).ok();

        if let Some(ref chain_store) = self.node.chain_store {
            // Use the new indexed method that filters for Posts at the DB level
            match chain_store.get_posts_for_space(&space_id_16, params.limit, params.offset) {
                Ok(posts) => {
                    for (content_hash, metadata) in posts {
                        let content_id = format!("sha256:{}", hex::encode(&content_hash));
                        let actor_id = crate::types::identity::IdentityId(metadata.author);
                        let author_id = crate::crypto::address::encode_address(&actor_id);

                        // Get body from BlobStore
                        let (title, body_preview, body) = if let Some(ref bs) = blob_store {
                            let blob_hash = ContentBlobHash::from_bytes(content_hash);
                            if let Ok(bytes) = bs.get(&blob_hash) {
                                if let Ok(text) = String::from_utf8(bytes.clone()) {
                                    let (parsed_title, parsed_body) =
                                        if let Some(idx) = text.find("\n\n") {
                                            (
                                                Some(text[..idx].to_string()),
                                                text[(idx + 2)..].to_string(),
                                            )
                                        } else {
                                            (None, text.clone())
                                        };
                                    let preview = if parsed_body.chars().count() > 200 {
                                        format!(
                                            "{}...",
                                            parsed_body.chars().take(200).collect::<String>()
                                        )
                                    } else {
                                        parsed_body.clone()
                                    };
                                    (parsed_title, Some(preview), Some(text))
                                } else {
                                    (None, None, None)
                                }
                            } else {
                                (None, None, None)
                            }
                        } else {
                            (None, None, None)
                        };

                        // Get decay info
                        let content_id_bytes = ContentId::from_bytes(content_hash);
                        let content_blob_hash = ContentBlobHash::from_bytes(content_hash);
                        let (
                            decay_state,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            last_engagement_ms,
                        ) = if let Some(ref decay) = self.node.decay_integration {
                            if let Ok(Some(ds)) = decay.get_decay_state(&content_blob_hash) {
                                let state_str = if ds.is_decayed {
                                    "decayed"
                                } else if ds.survival_probability < 0.25 {
                                    "stale"
                                } else if ds.is_protected {
                                    "protected"
                                } else {
                                    "active"
                                };

                                let floor_secs = if ds.is_protected && ds.age_seconds < 48 * 3600 {
                                    Some((48 * 3600u64).saturating_sub(ds.age_seconds))
                                } else {
                                    None
                                };

                                let pruned_secs = if ds.is_decayed {
                                    None
                                } else {
                                    let threshold = 0.0625;
                                    if ds.survival_probability > threshold {
                                        let half_life = 7.0 * 24.0 * 3600.0;
                                        let time_to_threshold = half_life
                                            * (ds.survival_probability / threshold).log2();
                                        Some(time_to_threshold as u64)
                                    } else {
                                        None
                                    }
                                };

                                let now_ms = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis()
                                    as u64;
                                let last_engagement_ms =
                                    now_ms.saturating_sub(ds.time_since_engagement * 1000);

                                (
                                    state_str.to_string(),
                                    ds.survival_probability,
                                    ds.is_protected,
                                    floor_secs,
                                    pruned_secs,
                                    last_engagement_ms,
                                )
                            } else {
                                let created_at_ms = metadata.timestamp * 1000;
                                (
                                    "protected".to_string(),
                                    1.0,
                                    true,
                                    Some(48 * 3600),
                                    Some(28 * 24 * 3600),
                                    created_at_ms,
                                )
                            }
                        } else {
                            let created_at_ms = metadata.timestamp * 1000;
                            ("active".to_string(), 1.0, false, None, None, created_at_ms)
                        };

                        // Get reply count from chain (confirmed) + mempool (pending)
                        let reply_count = {
                            let mut count = 0u64;

                            // Count ALL replies recursively (including nested replies), cached
                            count += self.cached_reply_count(&content_hash);

                            // Count pending replies from mempool (recursive)
                            if let Some(ref block_builder) = self.node.block_builder {
                                if let Ok(bb) = block_builder.read() {
                                    let pending = bb.get_pending_actions();
                                    // Build a set of all content hashes we're counting for (root + all replies)
                                    let mut target_parents: std::collections::HashSet<[u8; 32]> =
                                        std::collections::HashSet::new();
                                    target_parents.insert(content_hash);

                                    // Multiple passes to find nested replies
                                    loop {
                                        let mut found_new = false;
                                        for (_thread_id, _space_id, action) in &pending {
                                            if action.action_type
                                                == crate::blocks::action::ActionType::Reply
                                            {
                                                if let (Some(parent_id), Some(reply_hash)) =
                                                    (action.parent_id, action.content_hash)
                                                {
                                                    if target_parents.contains(&parent_id)
                                                        && !target_parents.contains(&reply_hash)
                                                    {
                                                        count += 1;
                                                        target_parents.insert(reply_hash);
                                                        found_new = true;
                                                    }
                                                }
                                            }
                                        }
                                        if !found_new {
                                            break;
                                        }
                                    }
                                }
                            }
                            count
                        };

                        // Get media_refs + original authoring timestamp from content_store.
                        // We prefer the ContentItem's created_at (the same value
                        // get_content / the post detail shows) over the on-chain action
                        // time, so the feed/space ordering and displayed time match the
                        // detail. metadata.timestamp is when the action entered THIS chain,
                        // which for bulk-synced/seeded content is import time, not when the
                        // post was authored.
                        let mut item_created_at_ms: Option<u64> = None;
                        let media_refs: Vec<MediaRefResult> =
                            if let Some(ref content_store) = self.node.content_store {
                                if let Ok(Some(item)) = content_store.get(&content_id_bytes) {
                                    if item.created_at > 0 {
                                        item_created_at_ms =
                                            Some(if item.created_at < 10_000_000_000 {
                                                item.created_at * 1000
                                            } else {
                                                item.created_at
                                            });
                                    }
                                    item.media_refs
                                        .iter()
                                        .map(|mr| {
                                            let media_type_str = match mr.media_type {
                                                crate::types::content::MediaType::ImageJpeg => {
                                                    "image/jpeg"
                                                }
                                                crate::types::content::MediaType::ImagePng => {
                                                    "image/png"
                                                }
                                                crate::types::content::MediaType::ImageGif => {
                                                    "image/gif"
                                                }
                                                crate::types::content::MediaType::ImageWebp => {
                                                    "image/webp"
                                                }
                                            };
                                            MediaRefResult {
                                                media_hash: hex::encode(mr.media_hash.as_bytes()),
                                                media_type: media_type_str.to_string(),
                                                size_bytes: mr.size_bytes,
                                            }
                                        })
                                        .collect()
                                } else {
                                    vec![]
                                }
                            } else {
                                vec![]
                            };

                        let created_at_ms = item_created_at_ms.unwrap_or(metadata.timestamp * 1000);

                        items.push(ContentSummary {
                            content_id,
                            content_type: "Post".to_string(),
                            author_id,
                            space_id: params.space_id.clone(),
                            parent_id: None,
                            created_at: created_at_ms,
                            last_engagement: last_engagement_ms,
                            title,
                            body,
                            body_preview,
                            engagement_count: 0,
                            reply_count,
                            decay_state,
                            seconds_until_decay: seconds_until_pruned,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            pool_progress: 0.0,
                            has_pool: false,
                            pool_status: "none".to_string(),
                            pending: false,
                            media_refs,
                        });
                    }
                }
                Err(e) => {
                    warn!("[LIST_SPACE_POSTS] Error fetching posts: {}", e);
                }
            }
        }

        // Add pending posts from BlockBuilder mempool
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(bb_read) = block_builder.read() {
                let pending_actions = bb_read.get_pending_actions();
                for (_thread_id, pending_space_id, action) in pending_actions {
                    // Check if this action is for the requested space and is a Post
                    if pending_space_id[..16] == space_id_16 {
                        if action.action_type == crate::blocks::action::ActionType::Post {
                            let content_hash = action.content_hash.unwrap_or([0u8; 32]);
                            let content_id = format!("sha256:{}", hex::encode(&content_hash));

                            // Skip if we already have this content on chain
                            if items.iter().any(|i| i.content_id == content_id) {
                                continue;
                            }

                            let actor_id = crate::types::identity::IdentityId(action.actor);
                            let author_id = crate::crypto::address::encode_address(&actor_id);

                            // Get body from BlobStore if available
                            let (title, body_preview, body) = if let Some(ref bs) = blob_store {
                                let blob_hash = ContentBlobHash::from_bytes(content_hash);
                                if let Ok(bytes) = bs.get(&blob_hash) {
                                    if let Ok(text) = String::from_utf8(bytes.clone()) {
                                        let (parsed_title, parsed_body) =
                                            if let Some(idx) = text.find("\n\n") {
                                                (
                                                    Some(text[..idx].to_string()),
                                                    text[(idx + 2)..].to_string(),
                                                )
                                            } else {
                                                (None, text.clone())
                                            };
                                        let preview = if parsed_body.chars().count() > 200 {
                                            format!(
                                                "{}...",
                                                parsed_body.chars().take(200).collect::<String>()
                                            )
                                        } else {
                                            parsed_body.clone()
                                        };
                                        (parsed_title, Some(preview), Some(text))
                                    } else {
                                        (None, None, None)
                                    }
                                } else {
                                    (None, None, None)
                                }
                            } else {
                                (None, None, None)
                            };

                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            // Get media_refs from content_store if available
                            let media_refs: Vec<MediaRefResult> = if let Some(ref content_store) =
                                self.node.content_store
                            {
                                if let Ok(Some(item)) =
                                    content_store.get(&ContentId::from_bytes(content_hash))
                                {
                                    item.media_refs
                                        .iter()
                                        .map(|mr| {
                                            let media_type_str = match mr.media_type {
                                                crate::types::content::MediaType::ImageJpeg => {
                                                    "image/jpeg"
                                                }
                                                crate::types::content::MediaType::ImagePng => {
                                                    "image/png"
                                                }
                                                crate::types::content::MediaType::ImageGif => {
                                                    "image/gif"
                                                }
                                                crate::types::content::MediaType::ImageWebp => {
                                                    "image/webp"
                                                }
                                            };
                                            MediaRefResult {
                                                media_hash: hex::encode(mr.media_hash.as_bytes()),
                                                media_type: media_type_str.to_string(),
                                                size_bytes: mr.size_bytes,
                                            }
                                        })
                                        .collect()
                                } else {
                                    vec![]
                                }
                            } else {
                                vec![]
                            };

                            items.push(ContentSummary {
                                content_id,
                                content_type: "Post".to_string(),
                                author_id,
                                space_id: params.space_id.clone(),
                                parent_id: None,
                                created_at: now_ms,
                                last_engagement: now_ms,
                                title,
                                body,
                                body_preview,
                                engagement_count: 0,
                                reply_count: 0,
                                decay_state: "pending".to_string(),
                                seconds_until_decay: None,
                                survival_probability: 1.0,
                                is_protected: true,
                                seconds_until_decay_starts: None,
                                seconds_until_pruned: None,
                                pool_progress: 0.0,
                                has_pool: false,
                                pool_status: "none".to_string(),
                                pending: true,
                                media_refs,
                            });
                        }
                    }
                }
            }
        }

        // Get total count for pagination (includes pending)
        let total = if let Some(ref chain_store) = self.node.chain_store {
            chain_store
                .count_posts_for_space(&space_id_16)
                .unwrap_or(items.len())
        } else {
            items.len()
        };

        // Count items with/without body for debugging
        let with_body = items.iter().filter(|i| i.body.is_some()).count();
        let missing_body = items.iter().filter(|i| i.body.is_none()).count();

        info!("[LIST_SPACE_POSTS] Returning {} posts ({} with body, {} missing) (total: {}) for space {}",
            items.len(), with_body, missing_body, total, params.space_id);

        let result = ListSpaceContentResult {
            items: items.clone(),
            total,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get posts by a specific user (for feed-style clients)
    ///
    /// Returns posts (and optionally replies) by a specific author,
    /// ordered by timestamp (newest first).
    async fn get_user_posts(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetUserPostsParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Accept EITHER a 32-byte hex pubkey OR a cs1 address. Feed items carry
        // the author as a cs1 address, so "View Posts" passes an address; hex
        // comes from profile pages. Same normalization get_user_profile uses.
        let author_bytes: [u8; 32] = if params.user_id.len() == 64
            && hex::decode(&params.user_id)
                .map(|b| b.len() == 32)
                .unwrap_or(false)
        {
            let bytes = hex::decode(&params.user_id).unwrap();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            arr
        } else if let Ok(pk) = crate::crypto::address::decode_address_to_pubkey(&params.user_id) {
            pk.0
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid user_id: must be 32-byte hex or a cs1 address",
                id,
            );
        };

        debug!(
            "[GET_USER_POSTS] Looking for content by user: {}",
            &params.user_id[..params.user_id.len().min(16)]
        );

        let mut items: Vec<ContentSummary> = Vec::new();
        let blob_store = BlobStore::new(&self.node.sync_blob_path).ok();

        // Special-purpose spaces to exclude from a "posts by author" view: the
        // author's own profile space (holds PROFILE_INFO/AVATAR records) and any
        // DM space they participate in — both are noise here, not public posts.
        let author_profile_space_16: [u8; 16] = {
            let preimage = format!("profile:v1:{}", hex::encode(author_bytes));
            let h = crate::crypto::sha256(preimage.as_bytes());
            apply_class(SpaceClass::Profile, &h)
        };
        let dm_space_ids: std::collections::HashSet<[u8; 16]> = self
            .node
            .membership_store
            .as_ref()
            .and_then(|ms| ms.get_dm_space_ids(&author_bytes).ok())
            .map(|v| v.into_iter().collect())
            .unwrap_or_default();

        if let Some(ref chain_store) = self.node.chain_store {
            // Use the new author index method
            let content_type_filter = if params.include_replies {
                None
            } else {
                Some(0)
            };
            match chain_store.get_content_by_author(
                &author_bytes,
                params.limit,
                params.offset,
                content_type_filter,
            ) {
                Ok(results) => {
                    for (content_hash, metadata) in results {
                        // Skip profile-space and DM-space content (noise).
                        if metadata.space_id == author_profile_space_16
                            || dm_space_ids.contains(&metadata.space_id)
                        {
                            continue;
                        }
                        let content_id = format!("sha256:{}", hex::encode(&content_hash));
                        let actor_id = crate::types::identity::IdentityId(metadata.author);
                        let author_id = crate::crypto::address::encode_address(&actor_id);
                        let space_id_bech32 = encode_space_id(&metadata.space_id);

                        // Get body from content_store first (for replies), then BlobStore (for posts)
                        let (title, body_preview, body) = {
                            let mut text_opt: Option<String> = None;

                            // First try content_store (has body_inline for replies)
                            if let Some(ref cs) = self.node.content_store {
                                let cid =
                                    crate::types::content::ContentId::from_bytes(content_hash);
                                if let Ok(Some(item)) = cs.get(&cid) {
                                    if let Some(ref body_inline) = item.body_inline {
                                        if !body_inline.is_empty() {
                                            text_opt = Some(body_inline.clone());
                                        }
                                    }
                                }
                                // If no body_inline, try get_body_by_hash
                                if text_opt.is_none() {
                                    if let Ok(Some(body_str)) = cs.get_body_by_hash(&content_hash) {
                                        if !body_str.is_empty() {
                                            text_opt = Some(body_str);
                                        }
                                    }
                                }
                            }

                            // Fall back to BlobStore (for posts stored there)
                            if text_opt.is_none() {
                                if let Some(ref bs) = blob_store {
                                    let blob_hash = ContentBlobHash::from_bytes(content_hash);
                                    if let Ok(bytes) = bs.get(&blob_hash) {
                                        if let Ok(text) = String::from_utf8(bytes) {
                                            text_opt = Some(text);
                                        }
                                    }
                                }
                            }

                            // Parse title/body from text
                            if let Some(text) = text_opt {
                                let (parsed_title, parsed_body) = if metadata.content_type == 0 {
                                    // Post: first line is title
                                    if let Some(idx) = text.find("\n\n") {
                                        (
                                            Some(text[..idx].to_string()),
                                            text[(idx + 2)..].to_string(),
                                        )
                                    } else {
                                        (None, text.clone())
                                    }
                                } else {
                                    // Reply: no title
                                    (None, text.clone())
                                };
                                let preview = if parsed_body.chars().count() > 200 {
                                    format!(
                                        "{}...",
                                        parsed_body.chars().take(200).collect::<String>()
                                    )
                                } else {
                                    parsed_body.clone()
                                };
                                (parsed_title, Some(preview), Some(text))
                            } else {
                                (None, None, None)
                            }
                        };

                        // Get decay info
                        let content_blob_hash = ContentBlobHash::from_bytes(content_hash);
                        let (
                            decay_state,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            last_engagement_ms,
                        ) = if let Some(ref decay) = self.node.decay_integration {
                            if let Ok(Some(ds)) = decay.get_decay_state(&content_blob_hash) {
                                let state_str = if ds.is_decayed {
                                    "decayed"
                                } else if ds.survival_probability < 0.25 {
                                    "stale"
                                } else if ds.is_protected {
                                    "protected"
                                } else {
                                    "active"
                                };

                                let floor_secs = if ds.is_protected && ds.age_seconds < 48 * 3600 {
                                    Some((48 * 3600u64).saturating_sub(ds.age_seconds))
                                } else {
                                    None
                                };

                                let pruned_secs = if ds.is_decayed {
                                    None
                                } else {
                                    let threshold = 0.0625;
                                    if ds.survival_probability > threshold {
                                        let half_life = 7.0 * 24.0 * 3600.0;
                                        let time_to_threshold = half_life
                                            * (ds.survival_probability / threshold).log2();
                                        Some(time_to_threshold as u64)
                                    } else {
                                        None
                                    }
                                };

                                let now_ms = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis()
                                    as u64;
                                let last_engagement_ms =
                                    now_ms.saturating_sub(ds.time_since_engagement * 1000);

                                (
                                    state_str.to_string(),
                                    ds.survival_probability,
                                    ds.is_protected,
                                    floor_secs,
                                    pruned_secs,
                                    last_engagement_ms,
                                )
                            } else {
                                let created_at_ms = metadata.timestamp * 1000;
                                (
                                    "protected".to_string(),
                                    1.0,
                                    true,
                                    Some(48 * 3600),
                                    Some(28 * 24 * 3600),
                                    created_at_ms,
                                )
                            }
                        } else {
                            let created_at_ms = metadata.timestamp * 1000;
                            ("active".to_string(), 1.0, false, None, None, created_at_ms)
                        };

                        // Get reply count (short-TTL cached)
                        let reply_count = self.cached_reply_count(&content_hash);

                        // Get media_refs + original authoring timestamp from content_store.
                        // Prefer the ContentItem's created_at (as get_content/the post
                        // detail does) so feed ordering + shown time match the detail; the
                        // on-chain action time is import time for bulk-synced content.
                        let mut item_created_at_ms: Option<u64> = None;
                        let media_refs: Vec<MediaRefResult> =
                            if let Some(ref content_store) = self.node.content_store {
                                if let Ok(Some(content)) = content_store
                                    .get(&crate::types::ContentId::from_bytes(content_hash))
                                {
                                    if content.created_at > 0 {
                                        item_created_at_ms =
                                            Some(if content.created_at < 10_000_000_000 {
                                                content.created_at * 1000
                                            } else {
                                                content.created_at
                                            });
                                    }
                                    content
                                        .media_refs
                                        .iter()
                                        .map(|mr| {
                                            let media_type_str = match mr.media_type {
                                                crate::types::content::MediaType::ImageJpeg => {
                                                    "image/jpeg"
                                                }
                                                crate::types::content::MediaType::ImagePng => {
                                                    "image/png"
                                                }
                                                crate::types::content::MediaType::ImageGif => {
                                                    "image/gif"
                                                }
                                                crate::types::content::MediaType::ImageWebp => {
                                                    "image/webp"
                                                }
                                            };
                                            MediaRefResult {
                                                media_hash: hex::encode(&mr.media_hash),
                                                media_type: media_type_str.to_string(),
                                                size_bytes: mr.size_bytes,
                                            }
                                        })
                                        .collect()
                                } else {
                                    Vec::new()
                                }
                            } else {
                                Vec::new()
                            };

                        let content_type_str = match metadata.content_type {
                            0 => "post",
                            1 => "reply",
                            _ => "unknown",
                        };

                        let parent_id = if metadata.parent_hash != [0u8; 32] {
                            Some(format!("sha256:{}", hex::encode(&metadata.parent_hash)))
                        } else {
                            None
                        };

                        items.push(ContentSummary {
                            content_id,
                            content_type: content_type_str.to_string(),
                            author_id,
                            space_id: space_id_bech32,
                            parent_id,
                            created_at: item_created_at_ms.unwrap_or(metadata.timestamp * 1000),
                            last_engagement: last_engagement_ms,
                            title,
                            body,
                            body_preview,
                            engagement_count: 0,
                            reply_count,
                            decay_state,
                            seconds_until_decay: seconds_until_pruned,
                            survival_probability,
                            is_protected,
                            seconds_until_decay_starts,
                            seconds_until_pruned,
                            pool_progress: 0.0,
                            has_pool: false,
                            pool_status: "empty".to_string(),
                            pending: false,
                            media_refs,
                        });
                    }
                }
                Err(e) => {
                    warn!("[GET_USER_POSTS] Failed to query author index: {}", e);
                }
            }
        }

        // Add pending content from BlockBuilder mempool (Posts/Replies by this author)
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(bb_read) = block_builder.read() {
                let pending_actions = bb_read.get_pending_actions();
                for (_thread_id, space_id, action) in pending_actions {
                    // Check if this action is by the requested author
                    if action.actor != author_bytes {
                        continue;
                    }

                    // Only include Post and Reply actions (not Engage, CreateSpace, etc.)
                    let content_type_str = match action.action_type {
                        crate::blocks::action::ActionType::Post => {
                            if params.include_replies {
                                "post"
                            } else {
                                // Filter matches - include posts
                                "post"
                            }
                        }
                        crate::blocks::action::ActionType::Reply => {
                            if params.include_replies {
                                "reply"
                            } else {
                                // Filter doesn't match - skip replies
                                continue;
                            }
                        }
                        _ => continue, // Skip other action types
                    };

                    let content_hash = match action.content_hash {
                        Some(h) => h,
                        None => continue,
                    };
                    let content_id = format!("sha256:{}", hex::encode(&content_hash));

                    // Skip if already have this content on chain
                    if items.iter().any(|i| i.content_id == content_id) {
                        continue;
                    }

                    let actor_id = crate::types::identity::IdentityId(action.actor);
                    let author_id = crate::crypto::address::encode_address(&actor_id);
                    let space_id_16: [u8; 16] = {
                        let mut arr = [0u8; 16];
                        arr.copy_from_slice(&space_id[..16]);
                        arr
                    };
                    let space_id_bech32 = encode_space_id(&space_id_16);

                    // Get body from content_store
                    let (title, body_preview, body) = if let Some(ref cs) = self.node.content_store
                    {
                        let cid = crate::types::content::ContentId::from_bytes(content_hash);
                        let text_opt = if let Ok(Some(item)) = cs.get(&cid) {
                            item.body_inline
                                .or_else(|| cs.get_body_by_hash(&content_hash).ok().flatten())
                        } else {
                            cs.get_body_by_hash(&content_hash).ok().flatten()
                        };

                        if let Some(text) = text_opt {
                            let (parsed_title, parsed_body) = if content_type_str == "post" {
                                if let Some(idx) = text.find("\n\n") {
                                    (Some(text[..idx].to_string()), text[(idx + 2)..].to_string())
                                } else {
                                    (None, text.clone())
                                }
                            } else {
                                (None, text.clone())
                            };
                            let preview = if parsed_body.chars().count() > 200 {
                                format!("{}...", parsed_body.chars().take(200).collect::<String>())
                            } else {
                                parsed_body.clone()
                            };
                            (parsed_title, Some(preview), Some(text))
                        } else {
                            (None, None, None)
                        }
                    } else {
                        (None, None, None)
                    };

                    let parent_id = action
                        .parent_id
                        .map(|p| format!("sha256:{}", hex::encode(&p)));
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    items.push(ContentSummary {
                        content_id,
                        content_type: content_type_str.to_string(),
                        author_id,
                        space_id: space_id_bech32,
                        parent_id,
                        created_at: now_ms,
                        last_engagement: now_ms,
                        title,
                        body,
                        body_preview,
                        engagement_count: 0,
                        reply_count: 0,
                        decay_state: "protected".to_string(),
                        seconds_until_decay: None,
                        survival_probability: 1.0,
                        is_protected: true,
                        seconds_until_decay_starts: Some(48 * 3600),
                        seconds_until_pruned: Some(28 * 24 * 3600),
                        pool_progress: 0.0,
                        has_pool: false,
                        pool_status: "none".to_string(),
                        pending: true,
                        media_refs: Vec::new(),
                    });
                }
            }
        }

        // Get counts
        let (total_posts, total_content) = if let Some(ref chain_store) = self.node.chain_store {
            let posts = chain_store
                .count_posts_by_author(&author_bytes)
                .unwrap_or(0);
            let total = chain_store
                .count_content_by_author(&author_bytes)
                .unwrap_or(0);
            (posts, total)
        } else {
            (items.len(), items.len())
        };

        info!(
            "[GET_USER_POSTS] Returning {} items (total_posts: {}, total_content: {}) for user {}",
            items.len(),
            total_posts,
            total_content,
            &params.user_id[..16]
        );

        let result = GetUserPostsResult {
            user_id: params.user_id,
            items,
            total_posts,
            total_content,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Request content from the network (VIEW-TO-HOST)
    ///
    /// This is the ONLY way content should be fetched from peers.
    /// Unlike automatic push behavior, this requires explicit user intent.
    ///
    /// Flow:
    /// 1. Check if we already have it locally
    /// 2. Check if any peers announced having it (from I_HAVE)
    /// 3. If known peers exist, send GET to them
    /// 4. If no known peers, broadcast WHO_HAS query
    async fn request_content(&self, params: Value, id: Value) -> RpcResponse {
        let params: RequestContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate and parse content ID
        if !params.content_id.starts_with("sha256:") {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Invalid content ID format - must start with sha256:",
                id,
            );
        }

        let content_hash_hex = &params.content_id[7..];
        let content_hash: [u8; 32] = match hex::decode(content_hash_hex) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidContentId,
                    "Invalid content hash - must be 32 bytes hex",
                    id,
                );
            }
        };

        let blob_hash = ContentBlobHash::from_bytes(content_hash);

        // Check content retrieval manager
        let content_mgr = match &self.node.content_retrieval {
            Some(mgr) => mgr,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Content retrieval not available - node may not be fully started",
                    id,
                );
            }
        };

        // Step 1: Check if we already have it locally
        if content_mgr.has_content(&blob_hash) {
            return RpcResponse::success(
                json!({
                    "status": "found_locally",
                    "content_id": params.content_id,
                    "message": "Content already available locally"
                }),
                id,
            );
        }

        // Step 2a: Query DHT for content providers (SPEC_06 §3.8)
        // First check local DHT cache, then broadcast DHT_FIND_VALUE to network
        if let Some(ref dht) = self.node.dht {
            // Check local cache first
            let local_providers = dht.get_local_providers(&content_hash).await;
            if !local_providers.is_empty() {
                info!(
                    "Found {} DHT providers in local cache for content {}",
                    local_providers.len(),
                    hex::encode(&content_hash[..8])
                );

                if let Some(ref pool) = self.node.connection_pool {
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let get_envelope =
                        MessageEnvelope::new_fork_agnostic(MessageType::Get, content_hash.to_vec());

                    let sent = pool.broadcast(&get_envelope).await;

                    if sent > 0 {
                        return RpcResponse::success(
                            json!({
                                "status": "requested",
                                "content_id": params.content_id,
                                "dht_providers": local_providers.len(),
                                "recipients": sent,
                                "message": "GET request sent via DHT provider lookup (local cache)"
                            }),
                            id,
                        );
                    }
                }
            }

            // No local providers - broadcast DHT_FIND_VALUE to network
            // This is the actual Kademlia FIND_VALUE operation
            if let Some(ref pool) = self.node.connection_pool {
                use crate::dht::{constants::MSG_DHT_FIND_VALUE, DhtMessage};
                use crate::types::network::{MessageEnvelope, MessageType};

                let dht_find_msg = DhtMessage::FindValue { content_hash };
                let dht_find_bytes = dht_find_msg.to_bytes();
                let mut dht_payload = vec![MSG_DHT_FIND_VALUE];
                dht_payload.extend_from_slice(&dht_find_bytes);

                let dht_envelope =
                    MessageEnvelope::new_fork_agnostic(MessageType::DhtFindValue, dht_payload);
                let dht_sent = pool.broadcast(&dht_envelope).await;
                info!(
                    "[DHT] Sent FIND_VALUE for {} to {} peers",
                    hex::encode(&content_hash[..8]),
                    dht_sent
                );

                // Note: DHT responses are async - the PROVIDERS message will be
                // handled by the router and will populate the local provider store.
                // For now, we continue to WHO_HAS as a fallback.
            }
        }

        // Step 2b: Check if any peers have announced having this content (fallback)
        let known_peers = content_mgr.get_peers_with_content(&blob_hash);

        if !known_peers.is_empty() {
            // We know peers that have it - send GET request
            // Pick the first peer (could be random or based on latency)
            let target_peer = &known_peers[0];

            info!(
                "Requesting content {} from known peer {} (view-to-host fetch)",
                hex::encode(&content_hash[..8]),
                hex::encode(&target_peer[..8])
            );

            // Send GET message via connection pool
            if let Some(ref pool) = self.node.connection_pool {
                use crate::types::network::{MessageEnvelope, MessageType};

                // Create GET envelope with content hash as payload
                let get_envelope =
                    MessageEnvelope::new_fork_agnostic(MessageType::Get, content_hash.to_vec());

                // Broadcast GET (ideally we'd unicast to the specific peer)
                let sent = pool.broadcast(&get_envelope).await;

                if sent > 0 {
                    return RpcResponse::success(
                        json!({
                            "status": "requested",
                            "content_id": params.content_id,
                            "known_peers": known_peers.len(),
                            "recipients": sent,
                            "message": "GET request sent to network"
                        }),
                        id,
                    );
                } else {
                    return RpcResponse::error(
                        RpcErrorCode::NetworkError,
                        "No peers available to send GET request",
                        id,
                    );
                }
            }
        }

        // Step 3: No known peers - broadcast WHO_HAS query
        if let Some(ref pool) = self.node.connection_pool {
            use crate::types::network::{MessageEnvelope, MessageType};

            // Mark content as wanted so when we receive I_HAVE, we auto-fetch it
            content_mgr.mark_wanted(&blob_hash);

            let who_has_payload = content_mgr.create_who_has_query(&blob_hash);

            info!(
                "Broadcasting WHO_HAS query for {} (view-to-host discovery, marked as wanted)",
                hex::encode(&content_hash[..8])
            );

            // Build WHO_HAS message envelope
            let who_has_envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::WhoHas,
                who_has_payload.hash.to_vec(),
            );

            let sent = pool.broadcast(&who_has_envelope).await;

            if sent > 0 {
                RpcResponse::success(
                    json!({
                        "status": "discovering",
                        "content_id": params.content_id,
                        "recipients": sent,
                        "message": "WHO_HAS query broadcast - waiting for peer responses"
                    }),
                    id,
                )
            } else {
                RpcResponse::error(
                    RpcErrorCode::NetworkError,
                    "No peers available for WHO_HAS broadcast",
                    id,
                )
            }
        } else {
            RpcResponse::error(
                RpcErrorCode::SubsystemUnavailable,
                "Connection pool not available - node may not be fully started",
                id,
            )
        }
    }

    // ========================================================================
    // Level/Contribution Methods
    // ========================================================================
    // Identity Methods
    // ========================================================================

    /// Get the node's identity information
    /// Returns public key and address of the node's loaded identity
    async fn get_identity_info(&self, id: Value) -> RpcResponse {
        use super::types::GetIdentityInfoResult;

        let keypair = &self.node.keypair;
        let public_key = hex::encode(keypair.public_key.as_bytes());
        let identity_id = crate::types::identity::IdentityId(*keypair.public_key.as_bytes());
        let address = crate::crypto::address::encode_address(&identity_id);

        let result = GetIdentityInfoResult {
            has_identity: true,
            public_key: Some(public_key),
            address: Some(address),
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Sign a message with the node's identity
    /// Used by clients to sign content submissions using the node's keypair
    async fn sign_message(&self, params: Value, id: Value) -> RpcResponse {
        #[derive(Debug, serde::Deserialize)]
        struct SignMessageParams {
            /// Hex-encoded message to sign
            message: String,
        }

        let params: SignMessageParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Decode the message from hex
        let message_bytes = match hex::decode(&params.message) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid message hex: {}", e),
                    id,
                );
            }
        };

        // Sign with node's keypair
        let signature = crate::identity::sign(&self.node.keypair.private_key, &message_bytes);
        let signature_hex = hex::encode(signature.as_bytes());

        RpcResponse::success(
            json!({
                "signature": signature_hex,
                "public_key": hex::encode(self.node.keypair.public_key.as_bytes()),
            }),
            id,
        )
    }

    async fn get_identity_level(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetIdentityLevelParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse identity ID from hex
        let identity_bytes = match hex::decode(&params.identity_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid identity ID: expected 32-byte hex",
                    id,
                );
            }
        };

        // Check if this is a genesis identity
        use crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list;
        use crate::types::identity::PublicKey;
        let pubkey = PublicKey::from_bytes(identity_bytes);
        let is_genesis = is_in_hardcoded_genesis_list(&pubkey);

        // DEPRECATED: Level system removed - return placeholder values with deprecation warning
        log::warn!("get_identity_level is deprecated and will be removed in a future release");
        let (level, level_name, streak_days, bandwidth_served, contribution_score) =
            (0u8, "N/A".to_string(), 0, 0, 0);

        let result = GetIdentityLevelResult {
            identity_id: params.identity_id,
            level,
            level_name,
            is_genesis,
            streak_days,
            bandwidth_served,
            contribution_score,
            deprecated_warning: Some("DEPRECATED: get_identity_level is deprecated. Level system removed. Only is_genesis is accurate. This method will be removed in a future release.".to_string()),
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get the current display name for this node's identity
    async fn get_identity_name(&self, id: Value) -> RpcResponse {
        let name = self.node.identity_name.read().await.clone();
        RpcResponse::success(
            json!({
                "identity_name": name,
            }),
            id,
        )
    }

    /// Set the display name for this node's identity
    /// This updates both the in-memory value and the config file
    async fn set_identity_name(&self, params: Value, id: Value) -> RpcResponse {
        #[derive(Debug, serde::Deserialize)]
        struct SetIdentityNameParams {
            /// The new display name (max 64 UTF-8 bytes per SPEC_01 §3.5, or null to clear)
            name: Option<String>,
        }

        let params: SetIdentityNameParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate name length (max 64 UTF-8 bytes per SPEC_01 §3.5)
        if let Some(ref name) = params.name {
            if name.len() > 64 {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Display name must be 64 bytes or less",
                    id,
                );
            }
            if name.trim().is_empty() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Display name cannot be empty or whitespace only",
                    id,
                );
            }
        }

        // Update in-memory value
        {
            let mut identity_name = self.node.identity_name.write().await;
            *identity_name = params.name.clone();
        }

        // Update config.toml file
        let config_path = self.node.data_dir.join("config.toml");
        if config_path.exists() {
            // Read existing config
            match std::fs::read_to_string(&config_path) {
                Ok(content) => {
                    let mut new_content = String::new();
                    let mut found_identity_name = false;

                    for line in content.lines() {
                        if line.starts_with("identity_name") {
                            found_identity_name = true;
                            if let Some(ref name) = params.name {
                                new_content.push_str(&format!("identity_name = \"{}\"\n", name));
                            }
                            // If name is None, we skip this line (remove from config)
                        } else {
                            new_content.push_str(line);
                            new_content.push('\n');
                        }
                    }

                    // If identity_name wasn't in the file and we have a new name, add it
                    if !found_identity_name {
                        if let Some(ref name) = params.name {
                            new_content.push_str(&format!("\nidentity_name = \"{}\"\n", name));
                        }
                    }

                    if let Err(e) = std::fs::write(&config_path, new_content) {
                        warn!("Failed to update config.toml: {}", e);
                        // Don't fail - in-memory update still worked
                    }
                }
                Err(e) => {
                    warn!("Failed to read config.toml: {}", e);
                }
            }
        } else {
            // Create new config file with just the identity_name
            if let Some(ref name) = params.name {
                if let Err(e) =
                    std::fs::write(&config_path, format!("identity_name = \"{}\"\n", name))
                {
                    warn!("Failed to create config.toml: {}", e);
                }
            }
        }

        RpcResponse::success(
            json!({
                "success": true,
                "identity_name": params.name,
            }),
            id,
        )
    }

    /// Get a user's profile information
    ///
    /// User profiles are stored as content in a special "profile space"
    /// where the space ID is deterministically derived from the user's public key.
    ///
    /// Params:
    /// - user_id: User's public key (hex string)
    ///
    /// Returns profile info or null if no profile exists.
    async fn get_user_profile(&self, params: Value, id: Value) -> RpcResponse {
        let user_id = match params.get("user_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing user_id parameter",
                    id,
                );
            }
        };

        // Accept EITHER a 32-byte hex pubkey or a cs1 address (forum profile URLs use
        // addresses; chat author_id is an address for still-pending content). The
        // profile space derives from the lowercase hex pubkey, so normalize first.
        let user_id_norm: String = if user_id.len() == 64 && hex::decode(user_id).is_ok() {
            user_id.to_lowercase()
        } else if let Ok(pk) = crate::crypto::address::decode_address_to_pubkey(user_id) {
            hex::encode(pk.0)
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid user_id: must be 32-byte hex or a cs1 address",
                id,
            );
        };

        // Calculate profile space ID: class byte (Profile) ‖ SHA256("profile:v1:<user_id_lowercase>")[..15]
        let preimage = format!("profile:v1:{}", user_id_norm);
        let profile_space_hash = crate::crypto::sha256(preimage.as_bytes());
        let profile_space_id: [u8; 16] = apply_class(SpaceClass::Profile, &profile_space_hash);

        // Look up content in the profile space
        let content_store = match &self.node.content_store {
            Some(store) => store,
            None => {
                // No content store means no profiles
                return RpcResponse::success(serde_json::Value::Null, id);
            }
        };

        // Profile bodies are marked segments joined by "\n---\n". A profile post is
        // stored with an empty title, so body_inline begins with "\n\n"; and when an
        // avatar is set the body is "[PROFILE_AVATAR]{..}\n---\n[PROFILE_INFO]{..}".
        // So we must TRIM and split on the separator, not naively `starts_with` the
        // whole body (which was why profiles never resolved). Mirrors feed-client's
        // decodeMarkedSegment.
        let info_marker = "[PROFILE_INFO]";
        let info_private_marker = "[PROFILE_INFO_PRIVATE]";
        let avatar_marker = "[PROFILE_AVATAR]";

        let mut display_name: Option<String> = None;
        let mut bio: Option<String> = None;
        let mut website: Option<String> = None;
        let mut avatar_content_id: Option<String> = None;
        let mut updated_at: Option<u64> = None;
        let mut best_info_ts: u64 = 0;
        let mut best_avatar_ts: u64 = 0;

        // Iterate the profile space, keeping the NEWEST info and avatar segments
        // (profiles are updated by posting a new version).
        for result in content_store.iter_content() {
            let item = match result {
                Ok(i) => i,
                Err(_) => continue,
            };
            if item.space_id.as_bytes()[..16] != profile_space_id {
                continue;
            }
            let body = match &item.body_inline {
                Some(b) => b.trim(),
                None => continue,
            };
            for raw_segment in body.split("\n---\n") {
                let seg = raw_segment.trim();
                if let Some(json_str) = seg.strip_prefix(info_marker) {
                    if let Ok(info) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                        let ts = info
                            .get("updatedAt")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(item.created_at);
                        if ts >= best_info_ts {
                            best_info_ts = ts;
                            display_name = info
                                .get("displayName")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                            bio = info.get("bio").and_then(|v| v.as_str()).map(str::to_string);
                            website = info
                                .get("website")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                            updated_at = Some(ts);
                        }
                    }
                } else if let Some(json_str) = seg.strip_prefix(info_private_marker) {
                    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                        let ts = meta
                            .get("updatedAt")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(item.created_at);
                        if ts >= best_info_ts {
                            best_info_ts = ts;
                            display_name = meta
                                .get("publicDisplayName")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                            updated_at = Some(ts);
                        }
                    }
                } else if let Some(json_str) = seg.strip_prefix(avatar_marker) {
                    if let Ok(av) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                        let ts = av
                            .get("updatedAt")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(item.created_at);
                        if ts >= best_avatar_ts {
                            best_avatar_ts = ts;
                            avatar_content_id = av
                                .get("contentId")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                        }
                    }
                }
            }
        }

        // If no profile found, return null
        if display_name.is_none()
            && bio.is_none()
            && website.is_none()
            && avatar_content_id.is_none()
        {
            return RpcResponse::success(serde_json::Value::Null, id);
        }

        // Attach the poster's reputation as a trust signal (SPEC_12 §3.4). Purely
        // informational — carries no protocol privilege. Defaults to the neutral
        // base-score summary when no record exists yet.
        let reputation = self.reputation_summary_json(&user_id_norm);

        // Return profile info. avatar_content_id is the content hash of the avatar image;
        // clients fetch it like any media (get_media / getMediaUrl).
        RpcResponse::success(
            json!({
                "display_name": display_name,
                "bio": bio,
                "website": website,
                "avatar_url": avatar_content_id.clone(),
                "avatar_content_id": avatar_content_id,
                "updated_at": updated_at,
                "reputation": reputation,
                "achievements": self.achievements_json(&user_id_norm),
            }),
            id,
        )
    }

    /// Build the achievements JSON array for a hex identity (empty if the
    /// service is unavailable or the id is unparseable). Each entry carries the
    /// stable id, badge emoji, name, and description so clients need no local
    /// achievement table. Recognition metadata ONLY.
    fn achievements_json(&self, user_id_hex: &str) -> Vec<serde_json::Value> {
        let Some(service) = &self.node.achievement_service else {
            return Vec::new();
        };
        let Some(identity) = hex::decode(user_id_hex)
            .ok()
            .and_then(|v| <[u8; 32]>::try_from(v).ok())
        else {
            return Vec::new();
        };
        let tracker = match service.get_tracker(&identity) {
            Ok(t) => t,
            Err(e) => {
                warn!("[ACHIEVEMENT] Failed to load achievements: {}", e);
                return Vec::new();
            }
        };
        // Sort by stable wire id so the badge row order is deterministic.
        let mut records = tracker.all_achievements();
        records.sort_by_key(|r| r.achievement.as_u8());
        records
            .into_iter()
            .map(|r| {
                json!({
                    "id": r.achievement.as_u8(),
                    "key": format!("{:?}", r.achievement),
                    "badge": r.achievement.badge(),
                    "name": r.achievement.name(),
                    "description": r.achievement.description(),
                    "unlocked_at": r.unlocked_at_secs,
                })
            })
            .collect()
    }

    /// get_achievements(user_id) — return the recognition badges an identity has
    /// earned (SPEC_09 §5.3). Read-only, public data. `user_id` may be a 32-byte
    /// hex pubkey or a cs1 address. Recognition ONLY — no protocol effect.
    async fn get_achievements(&self, params: Value, id: Value) -> RpcResponse {
        let user_id = match params.get("user_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing user_id parameter",
                    id,
                );
            }
        };

        // Normalize to a lowercase hex pubkey (accept hex or cs1 address), same
        // as get_user_profile.
        let user_id_norm: String = if user_id.len() == 64 && hex::decode(user_id).is_ok() {
            user_id.to_lowercase()
        } else if let Ok(pk) = crate::crypto::address::decode_address_to_pubkey(user_id) {
            hex::encode(pk.0)
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid user_id: must be 32-byte hex or a cs1 address",
                id,
            );
        };

        if self.node.achievement_service.is_none() {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                "Achievement service not available",
                id,
            );
        }

        let achievements = self.achievements_json(&user_id_norm);
        RpcResponse::success(
            json!({
                "user_id": user_id_norm,
                "achievements": achievements,
            }),
            id,
        )
    }

    /// Build a small reputation JSON object for a hex-encoded identity pubkey, used
    /// to embed reputation in profile responses. Returns `null` if the id is not a
    /// valid 32-byte hex pubkey.
    fn reputation_summary_json(&self, user_id_hex: &str) -> Value {
        let identity: [u8; 32] = match hex::decode(user_id_hex) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => return Value::Null,
        };
        let rep = match &self.node.reputation_store {
            Some(store) => store
                .get(&identity)
                .ok()
                .flatten()
                .unwrap_or_else(|| crate::reputation::PosterReputation::new(identity)),
            None => crate::reputation::PosterReputation::new(identity),
        };
        let summary = crate::reputation::types::ReputationSummary::from_reputation(&rep);
        json!({
            "score": summary.score,
            "effect": summary.effect,
            "badge": summary.badge,
            "age_days": summary.age_days,
            "net_spam_flags": summary.net_spam_flags,
            "has_illegal_flags": summary.has_illegal_flags,
            "total_posts": summary.total_posts,
        })
    }

    /// Get an identity's poster reputation (SPEC_12 §3.4/§4.5).
    ///
    /// Reputation is a public, informational trust signal derived from community
    /// spam attestations and time-based recovery. It is read-only here and carries
    /// NO protocol privileges: a high score never reduces PoW cost, extends content
    /// decay, or raises rate limits — it only reflects standing for display and for
    /// down-weighting abusive attesters (see `spam_attestation::aggregation`).
    ///
    /// Params:
    /// - `identity` (or `user_id`): 32-byte hex pubkey or a cs1 address.
    ///
    /// Returns a reputation summary, or a default (base-score) summary for an
    /// identity that has no record yet.
    async fn get_reputation(&self, params: Value, id: Value) -> RpcResponse {
        let raw = params
            .get("identity")
            .or_else(|| params.get("user_id"))
            .and_then(|v| v.as_str());
        let raw = match raw {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing identity parameter",
                    id,
                );
            }
        };

        // Accept either a 32-byte hex pubkey or a cs1 address.
        let identity: [u8; 32] = if raw.len() == 64 && hex::decode(raw).is_ok() {
            let bytes = hex::decode(raw).unwrap();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            arr
        } else if let Ok(pk) = crate::crypto::address::decode_address_to_pubkey(raw) {
            pk.0
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid identity: must be 32-byte hex or a cs1 address",
                id,
            );
        };

        let summary = match &self.node.reputation_store {
            Some(store) => match store.get(&identity) {
                Ok(Some(rep)) => crate::reputation::types::ReputationSummary::from_reputation(&rep),
                // No record yet: report the neutral base-score summary.
                Ok(None) => crate::reputation::types::ReputationSummary::from_reputation(
                    &crate::reputation::PosterReputation::new(identity),
                ),
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to read reputation: {}", e),
                        id,
                    );
                }
            },
            None => crate::reputation::types::ReputationSummary::from_reputation(
                &crate::reputation::PosterReputation::new(identity),
            ),
        };

        RpcResponse::success(
            json!({
                "identity": hex::encode(identity),
                "score": summary.score,
                "effect": summary.effect,
                "badge": summary.badge,
                "age_days": summary.age_days,
                "net_spam_flags": summary.net_spam_flags,
                "has_illegal_flags": summary.has_illegal_flags,
                "total_posts": summary.total_posts,
            }),
            id,
        )
    }

    /// get_sponsorship_status — sponsorship standing plus active penalties for an
    /// identity (SPEC_11). Penalties are node-local policy, never consensus data.
    async fn get_sponsorship_status(&self, params: Value, id: Value) -> RpcResponse {
        let raw = params
            .get("identity")
            .or_else(|| params.get("user_id"))
            .and_then(|v| v.as_str());
        let raw = match raw {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing identity parameter",
                    id,
                );
            }
        };
        let identity: [u8; 32] = if raw.len() == 64 && hex::decode(raw).is_ok() {
            let bytes = hex::decode(raw).unwrap();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            arr
        } else if let Ok(pk) = crate::crypto::address::decode_address_to_pubkey(raw) {
            pk.0
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid identity: must be 32-byte hex or a cs1 address",
                id,
            );
        };
        let mgr = match &self.node.sponsorship_manager {
            Some(m) => m,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Sponsorship manager not available",
                    id,
                );
            }
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        match mgr.status(&crate::identity::PublicKey(identity), now) {
            Ok(report) => {
                let penalties: Vec<Value> = report
                    .active_penalties
                    .iter()
                    .map(|p| {
                        json!({
                            "penalty_type": format!("{:?}", p.penalty_type),
                            "started_at": p.started_at,
                            "expires_at": p.current_expires_at,
                            "caused_by": p.caused_by.as_ref().map(|c| hex::encode(c.0)),
                        })
                    })
                    .collect();
                RpcResponse::success(
                    json!({
                        "identity": hex::encode(identity),
                        "sponsorship_barred": report.sponsorship_barred,
                        "has_sponsorship": report.sponsorship.is_some(),
                        "active_penalties": penalties,
                    }),
                    id,
                )
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Sponsorship status error: {}", e),
                id,
            ),
        }
    }

    /// Apply a reputation spam-flag penalty to the author of `content_hash` when a
    /// community spam threshold is first reached. Resolves author via the content
    /// store; a no-op if either store is unavailable or the content is unknown.
    ///
    /// This only ever LOWERS reputation (decay on spam). It never grants privileges.
    fn record_spam_flag_for_content(&self, content_hash: &[u8; 32], timestamp: u64) {
        let (rep_store, content_store) =
            match (&self.node.reputation_store, &self.node.content_store) {
                (Some(r), Some(c)) => (r, c),
                _ => return,
            };
        let content_id = ContentId::from_bytes(*content_hash);
        let author = match content_store.get(&content_id) {
            Ok(Some(item)) => item.author_id.0,
            _ => return,
        };
        // SPEC_11: the same threshold crossing propagates a Spam penalty up the
        // author's sponsor chain (node-local policy, best-effort).
        if let Some(ref mgr) = self.node.sponsorship_manager {
            if let Err(e) =
                mgr.on_spam_flagged_content(&crate::identity::PublicKey(author), timestamp)
            {
                warn!("[SPONSORSHIP] Penalty propagation failed: {}", e);
            }
        }
        if let Err(e) = rep_store.record_spam_flag(&author, timestamp) {
            warn!("[REPUTATION] Failed to record spam flag: {}", e);
        } else {
            debug!(
                "[REPUTATION] Spam flag recorded against author {} for content {}",
                hex::encode(&author[..8]),
                hex::encode(&content_hash[..8])
            );
        }
    }

    /// Apply reputation recovery to the author of `content_hash` when its spam flag
    /// is cleared by counter-attestations. No-op if stores/content are unavailable.
    fn record_counter_for_content(&self, content_hash: &[u8; 32], timestamp: u64) {
        let (rep_store, content_store) =
            match (&self.node.reputation_store, &self.node.content_store) {
                (Some(r), Some(c)) => (r, c),
                _ => return,
            };
        let content_id = ContentId::from_bytes(*content_hash);
        let author = match content_store.get(&content_id) {
            Ok(Some(item)) => item.author_id.0,
            _ => return,
        };
        if let Err(e) = rep_store.record_counter(&author, timestamp) {
            warn!("[REPUTATION] Failed to record counter recovery: {}", e);
        }
    }

    /// Aggregate spam attestations for `content_hash`, weighting each attester's
    /// contribution by its poster reputation when a reputation store is available
    /// (SPEC_12 §4.2 + attester weighting). Falls back to plain unique-tree
    /// aggregation when reputation is unavailable.
    ///
    /// Weighting is strictly defensive: a low-reputation attester counts for LESS,
    /// and a high-reputation attester is capped at the default weight (never more).
    fn aggregate_with_reputation(
        &self,
        content_hash: [u8; 32],
        attestations: &[StoredSpamAttestation],
        is_cleared: bool,
    ) -> crate::spam_attestation::AttestationAggregation {
        match &self.node.reputation_store {
            Some(store) => {
                let weight_of = |attester: &[u8; 32]| -> f64 {
                    // Absent record => neutral base score (fresh identity).
                    let score = store
                        .get_score(attester)
                        .unwrap_or(crate::reputation::score::REPUTATION_BASE_SCORE);
                    crate::reputation::score::attester_weight(score)
                };
                crate::spam_attestation::aggregate_attestations_weighted(
                    content_hash,
                    attestations,
                    is_cleared,
                    weight_of,
                )
            }
            None => aggregate_attestations(content_hash, attestations, is_cleared),
        }
    }

    // === Reply Methods ===

    /// Get replies to a content item
    ///
    /// # Parameters
    /// - content_id: The parent content ID (sha256:...)
    ///
    /// # Returns
    /// - parent_id: The parent content ID
    /// - replies: Array of direct replies
    /// - total_count: Total number of replies
    async fn get_replies(&self, params: Value, id: Value) -> RpcResponse {
        use super::types::{GetRepliesParams, GetRepliesResult, MediaRefResult, ReplyInfo};

        let params: GetRepliesParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate content ID format
        if !params.content_id.starts_with("sha256:") {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Invalid content ID format (must start with sha256:)",
                id,
            );
        }

        // Parse content ID
        let content_id_str = params.content_id.clone();
        let content_hex = &content_id_str[7..]; // Skip "sha256:"
        let content_bytes: [u8; 32] = match hex::decode(content_hex) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidContentId,
                    "Invalid content ID hash",
                    id,
                );
            }
        };

        // Use chain store's replies_by_parent_index for efficient lookup
        // This is populated during block sync, unlike content_store.children_tree
        let chain_store = match &self.node.chain_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    "Chain store not available",
                    id,
                );
            }
        };
        let content_store = &self.node.content_store;

        // Get params with defaults
        let limit = params.limit.unwrap_or(1000) as usize;
        let _offset = params.offset.unwrap_or(0) as usize;
        let depth_limit = params.depth_limit.unwrap_or(5) as u32; // Default 5 levels

        // Fetch replies with depth tracking
        // (reply_hash, parent_hash, depth)
        let mut all_replies: Vec<ReplyInfo> = Vec::new();
        let mut to_process: Vec<([u8; 32], [u8; 32], u32)> = Vec::new();

        // Start with direct replies to the root content (depth 0)
        match chain_store.get_replies_for_content(&content_bytes, limit, 0) {
            Ok(direct_replies) => {
                for (reply_hash, _) in direct_replies {
                    to_process.push((reply_hash, content_bytes, 0));
                }
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    &format!("Failed to get replies: {}", e),
                    id,
                );
            }
        };

        // Process replies breadth-first with depth limit
        while let Some((reply_hash, parent_hash, depth)) = to_process.pop() {
            // Get metadata for this reply
            let metadata = match chain_store.get_content_metadata(&reply_hash) {
                Ok(Some(m)) => m,
                Ok(None) => continue,
                Err(_) => continue,
            };

            // Get body, display_name, and attached media from content store.
            let (body, display_name, media_refs) = if let Some(store) = content_store {
                let content_id = crate::types::content::ContentId::from_bytes(reply_hash);
                if let Ok(Some(item)) = store.get(&content_id) {
                    let mrefs: Vec<MediaRefResult> = item
                        .media_refs
                        .iter()
                        .map(|mr| MediaRefResult {
                            media_hash: hex::encode(mr.media_hash.as_bytes()),
                            media_type: match mr.media_type {
                                crate::types::content::MediaType::ImageJpeg => "image/jpeg",
                                crate::types::content::MediaType::ImagePng => "image/png",
                                crate::types::content::MediaType::ImageGif => "image/gif",
                                crate::types::content::MediaType::ImageWebp => "image/webp",
                            }
                            .to_string(),
                            size_bytes: mr.size_bytes,
                        })
                        .collect();
                    (
                        item.body_inline.unwrap_or_default(),
                        item.display_name,
                        mrefs,
                    )
                } else {
                    (
                        store
                            .get_body_by_hash(&reply_hash)
                            .unwrap_or(None)
                            .unwrap_or_default(),
                        None,
                        Vec::new(),
                    )
                }
            } else {
                (String::new(), None, Vec::new())
            };

            // Count children (we always count, even if not fetching them)
            let child_count = chain_store
                .get_replies_for_content(&reply_hash, 1000, 0)
                .map(|c| c.len() as u32)
                .unwrap_or(0);

            let block_height = chain_store
                .get_content_finalized_height(&reply_hash)
                .ok()
                .flatten();

            all_replies.push(ReplyInfo {
                content_id: format!("sha256:{}", hex::encode(&reply_hash)),
                author_id: hex::encode(&metadata.author),
                body,
                parent_id: format!("sha256:{}", hex::encode(&parent_hash)),
                created_at: metadata.timestamp * 1000,
                last_engagement: metadata.timestamp * 1000,
                depth,
                child_count,
                display_name,
                media_refs,
                block_height,
            });

            // Check for limit
            if all_replies.len() >= limit {
                break;
            }

            // Only fetch children if within depth limit
            if depth < depth_limit {
                if let Ok(children) = chain_store.get_replies_for_content(&reply_hash, 100, 0) {
                    for (child_hash, _) in children {
                        to_process.push((child_hash, reply_hash, depth + 1));
                    }
                }
            }
        }

        // Add pending replies from BlockBuilder mempool
        // Use multi-pass approach to handle nested pending replies (reply to reply in mempool)
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(bb_read) = block_builder.read() {
                let pending_actions = bb_read.get_pending_actions();

                // Collect all pending Reply actions with their metadata
                let mut pending_replies: Vec<(crate::blocks::action::Action, [u8; 32], [u8; 32])> =
                    Vec::new();
                for (_thread_id, _pending_space_id, action) in pending_actions {
                    if action.action_type == crate::blocks::action::ActionType::Reply {
                        if let (Some(content_hash), Some(parent_id)) =
                            (action.content_hash, action.parent_id)
                        {
                            pending_replies.push((action.clone(), content_hash, parent_id));
                        }
                    }
                }

                // Build set of known reply hashes (from chain + already added)
                let mut known_hashes: std::collections::HashSet<[u8; 32]> =
                    std::collections::HashSet::new();
                known_hashes.insert(content_bytes); // Root content
                for r in &all_replies {
                    if let Ok(bytes) = hex::decode(&r.content_id[7..]) {
                        if bytes.len() == 32 {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(&bytes);
                            known_hashes.insert(arr);
                        }
                    }
                }

                // Multi-pass: keep adding pending replies until no new ones found
                // This handles chains like A -> B -> C where B and C are both pending
                let mut added_any = true;
                let max_passes = 10; // Prevent infinite loops
                let mut pass = 0;

                while added_any && pass < max_passes {
                    added_any = false;
                    pass += 1;

                    for (action, reply_hash, parent_id) in &pending_replies {
                        // Skip if already known
                        if known_hashes.contains(reply_hash) {
                            continue;
                        }

                        // Check if parent is known (chain reply OR another pending reply we've added)
                        if !known_hashes.contains(parent_id) {
                            continue;
                        }

                        // Calculate depth by walking parent chain
                        let mut depth = 0u32;
                        let mut current_parent = *parent_id;
                        while current_parent != content_bytes && depth < depth_limit {
                            depth += 1;
                            // Find parent in all_replies
                            let parent_hex = format!("sha256:{}", hex::encode(&current_parent));
                            if let Some(parent_reply) =
                                all_replies.iter().find(|r| r.content_id == parent_hex)
                            {
                                if let Ok(bytes) = hex::decode(&parent_reply.parent_id[7..]) {
                                    if bytes.len() == 32 {
                                        current_parent.copy_from_slice(&bytes);
                                        continue;
                                    }
                                }
                            }
                            break;
                        }

                        let reply_id = format!("sha256:{}", hex::encode(reply_hash));
                        // Use pubkey hex to match the finalized path (~line 9059), so a reply's
                        // author_id is stable whether it is pending or finalized (previously
                        // pending used bech32 and finalized used hex — an inconsistency).
                        let author_id = hex::encode(action.actor);

                        // Body: content store first, then the sync blob store. A still-pending
                        // (mempool) reply's body was written to the sync blob store by
                        // submit_reply, not the content store — without this fallback the
                        // mempool reply comes back with an empty body and the move stays
                        // invisible until it finalizes (the block-latency the user felt).
                        let body = content_store
                            .as_ref()
                            .and_then(|s| s.get_body_by_hash(reply_hash).ok().flatten())
                            .filter(|b| !b.is_empty())
                            .or_else(|| {
                                let hash =
                                    crate::storage::blob::ContentBlobHash::from_bytes(*reply_hash);
                                BlobStore::new(&self.node.sync_blob_path)
                                    .ok()
                                    .and_then(|bs| bs.get(&hash).ok())
                                    .and_then(|bytes| String::from_utf8(bytes).ok())
                            })
                            .unwrap_or_default();

                        let now_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;

                        // Media on a still-pending (mempool) reply comes from the action.
                        let media_refs: Vec<MediaRefResult> = action
                            .media_refs
                            .iter()
                            .map(|amr| MediaRefResult {
                                media_hash: hex::encode(amr.media_hash),
                                media_type: match amr.media_type {
                                    crate::blocks::action::ActionMediaRef::TYPE_JPEG => {
                                        "image/jpeg"
                                    }
                                    crate::blocks::action::ActionMediaRef::TYPE_PNG => "image/png",
                                    crate::blocks::action::ActionMediaRef::TYPE_GIF => "image/gif",
                                    crate::blocks::action::ActionMediaRef::TYPE_WEBP => {
                                        "image/webp"
                                    }
                                    _ => "image/jpeg",
                                }
                                .to_string(),
                                size_bytes: amr.size_bytes,
                            })
                            .collect();

                        all_replies.push(ReplyInfo {
                            content_id: reply_id,
                            author_id,
                            body,
                            parent_id: format!("sha256:{}", hex::encode(parent_id)),
                            created_at: now_ms,
                            last_engagement: now_ms,
                            depth,
                            child_count: 0,
                            display_name: action.display_name.clone(),
                            media_refs,
                            block_height: None, // still pending in the mempool — tentative frontier
                        });

                        known_hashes.insert(*reply_hash);
                        added_any = true;
                    }
                }

                if pass > 1 {
                    debug!(
                        "[REPLIES] Multi-pass pending reply resolution took {} passes",
                        pass
                    );
                }
            }
        }

        let total_count = all_replies.len() as u64;

        let result = GetRepliesResult {
            parent_id: params.content_id,
            replies: all_replies,
            total_count,
        };

        info!(
            "[REPLIES] Found {} replies (depth_limit={}) for content {}",
            total_count,
            depth_limit,
            &content_hex[..16]
        );

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    // === Fork Methods ===

    /// Create a new fork from current chain state
    ///
    /// # Parameters
    /// - name: Fork name (required, max 64 chars)
    /// - description: Fork description (optional)
    /// - excluded_ids: Array of hex-encoded identity public keys to exclude
    /// - content_mode: "all" | "none" | "selective" (default: "all")
    /// - pow_multiplier: PoW difficulty adjustment (default: 1.0)
    /// - decay_multiplier: Decay rate adjustment (default: 1.0)
    /// - secret_key: Hex-encoded secret key for signing (required)
    async fn create_fork(&self, params: Value, id: Value) -> RpcResponse {
        let fork_registry = match &self.node.fork_registry {
            Some(registry) => registry,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Fork registry not available",
                    id,
                );
            }
        };

        // Parse parameters
        let name = params
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let description = params
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let secret_key_hex = match params.get("secret_key").and_then(|v| v.as_str()) {
            Some(sk) => sk,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "secret_key is required",
                    id,
                );
            }
        };

        // Parse secret key
        let secret_key_bytes: [u8; 32] = match hex::decode(secret_key_hex) {
            Ok(bytes) if bytes.len() == 32 => bytes.try_into().unwrap(),
            Ok(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "secret_key must be 32 bytes",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid secret_key hex: {}", e),
                    id,
                );
            }
        };

        // Create identity from secret key
        let identity = match crate::fork::Identity::from_secret_key(&secret_key_bytes) {
            Ok(id) => id,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid identity: {}", e),
                    id,
                );
            }
        };

        // Build fork config
        let mut config_builder = crate::fork::ForkConfig::builder()
            .name(name)
            .description(description);

        // Parse excluded IDs
        if let Some(excluded) = params.get("excluded_ids").and_then(|v| v.as_array()) {
            for exc in excluded {
                if let Some(hex_id) = exc.as_str() {
                    if let Ok(bytes) = hex::decode(hex_id) {
                        if bytes.len() == 32 {
                            let mut arr = [0u8; 32];
                            arr.copy_from_slice(&bytes);
                            config_builder = config_builder.exclude_identity(arr);
                        }
                    }
                }
            }
        }

        // Parse content mode
        if let Some(mode) = params.get("content_mode").and_then(|v| v.as_str()) {
            let selector = match mode {
                "all" => crate::fork::ContentSelector::All,
                "none" => crate::fork::ContentSelector::None,
                "selective" => crate::fork::ContentSelector::Selective {
                    space_filter: None,
                    time_filter: None,
                    identity_filter: None,
                },
                _ => crate::fork::ContentSelector::All,
            };
            config_builder = config_builder.content_mode(selector);
        }

        // Parse multipliers
        if let Some(pow_mult) = params.get("pow_multiplier").and_then(|v| v.as_f64()) {
            config_builder = config_builder.pow_multiplier(pow_mult);
        }

        if let Some(decay_mult) = params.get("decay_multiplier").and_then(|v| v.as_f64()) {
            config_builder = config_builder.decay_multiplier(decay_mult);
        }

        let config = config_builder.build();

        // Create the fork
        match fork_registry.create_fork(config, &identity) {
            Ok(result) => {
                info!(
                    "[RPC] Created fork: {:?} name={}",
                    result.fork_id, result.genesis.name
                );

                let response = json!({
                    "fork_id": hex::encode(result.fork_id.as_bytes()),
                    "name": result.genesis.name,
                    "parent_fork": hex::encode(result.genesis.parent_fork.as_bytes()),
                    "parent_height": result.genesis.parent_height,
                    "inherited_content_count": result.inherited_content_count,
                    "excluded_count": result.excluded_count,
                    "timestamp": result.genesis.timestamp,
                });

                RpcResponse::success(response, id)
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to create fork: {}", e),
                id,
            ),
        }
    }

    /// Switch to a different fork
    ///
    /// # Parameters
    /// - fork_id: Hex-encoded fork ID (or "main" for main chain)
    async fn switch_fork(&self, params: Value, id: Value) -> RpcResponse {
        let fork_registry = match &self.node.fork_registry {
            Some(registry) => registry,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Fork registry not available",
                    id,
                );
            }
        };

        let fork_id_str = match params.get("fork_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "fork_id is required", id);
            }
        };

        // Parse fork ID
        let fork_id = if fork_id_str == "main" || fork_id_str.chars().all(|c| c == '0') {
            crate::types::block::ForkId::main_chain()
        } else {
            match hex::decode(fork_id_str) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    crate::types::block::ForkId::from_bytes(arr)
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid fork_id format",
                        id,
                    );
                }
            }
        };

        match fork_registry.switch_fork(fork_id) {
            Ok(()) => {
                info!("[RPC] Switched to fork: {:?}", fork_id);
                RpcResponse::success(
                    json!({
                        "success": true,
                        "active_fork": hex::encode(fork_id.as_bytes()),
                    }),
                    id,
                )
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::ContentNotFound,
                &format!("Failed to switch fork: {}", e),
                id,
            ),
        }
    }

    /// List all known forks
    async fn list_forks(&self, id: Value) -> RpcResponse {
        let fork_registry = match &self.node.fork_registry {
            Some(registry) => registry,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Fork registry not available",
                    id,
                );
            }
        };

        match fork_registry.list_forks() {
            Ok(forks) => {
                let active = fork_registry.active_fork();
                let fork_list: Vec<_> = forks
                    .iter()
                    .map(|f| {
                        let info = fork_registry.get_fork_info(f).ok();
                        json!({
                            "fork_id": hex::encode(f.as_bytes()),
                            "name": info.as_ref().map(|i| i.name.clone()).unwrap_or_default(),
                            "is_active": *f == active,
                        })
                    })
                    .collect();

                // Add main chain
                let mut all_forks = vec![json!({
                    "fork_id": hex::encode([0u8; 32]),
                    "name": "main",
                    "is_active": active == crate::types::block::ForkId::main_chain(),
                })];
                all_forks.extend(fork_list);

                RpcResponse::success(
                    json!({
                        "forks": all_forks,
                        "count": all_forks.len(),
                    }),
                    id,
                )
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to list forks: {}", e),
                id,
            ),
        }
    }

    /// Get detailed information about a fork
    ///
    /// # Parameters
    /// - fork_id: Hex-encoded fork ID (or "main" for main chain)
    async fn get_fork_info(&self, params: Value, id: Value) -> RpcResponse {
        let fork_registry = match &self.node.fork_registry {
            Some(registry) => registry,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Fork registry not available",
                    id,
                );
            }
        };

        let fork_id_str = match params.get("fork_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "fork_id is required", id);
            }
        };

        // Parse fork ID
        let fork_id = if fork_id_str == "main" || fork_id_str.chars().all(|c| c == '0') {
            crate::types::block::ForkId::main_chain()
        } else {
            match hex::decode(fork_id_str) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    crate::types::block::ForkId::from_bytes(arr)
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid fork_id format",
                        id,
                    );
                }
            }
        };

        match fork_registry.get_fork_info(&fork_id) {
            Ok(info) => {
                let is_active = fork_registry.active_fork() == fork_id;
                RpcResponse::success(
                    json!({
                        "fork_id": hex::encode(info.fork_id.as_bytes()),
                        "name": info.name,
                        "description": info.description,
                        "parent_fork": info.parent_fork.map(|p| hex::encode(p.as_bytes())),
                        "parent_height": info.parent_height,
                        "creator": hex::encode(info.creator),
                        "timestamp": info.timestamp,
                        "excluded_count": info.excluded_count,
                        "supporter_count": info.supporter_count,
                        "is_active": is_active,
                    }),
                    id,
                )
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::ContentNotFound,
                &format!("Fork not found: {}", e),
                id,
            ),
        }
    }

    /// Get the currently active fork
    async fn get_active_fork(&self, id: Value) -> RpcResponse {
        let fork_registry = match &self.node.fork_registry {
            Some(registry) => registry,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Fork registry not available",
                    id,
                );
            }
        };

        let active = fork_registry.active_fork();
        let is_main = active == crate::types::block::ForkId::main_chain();

        let info = fork_registry.get_fork_info(&active).ok();

        RpcResponse::success(
            json!({
                "fork_id": hex::encode(active.as_bytes()),
                "name": if is_main { "main".to_string() } else { info.as_ref().map(|i| i.name.clone()).unwrap_or_default() },
                "is_main_chain": is_main,
            }),
            id,
        )
    }

    // ========================================================================
    // Reaction Methods
    // ========================================================================
    /// Get reaction counts for content (from pool contributions)
    async fn get_reactions(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetReactionsParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse content_id
        let content_id_hex = params
            .content_id
            .strip_prefix("sha256:")
            .unwrap_or(&params.content_id);
        let content_id_bytes: [u8; 32] = match hex::decode(content_id_hex)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_id format",
                    id,
                );
            }
        };

        // Get reaction counts from content store
        let content_id = crate::types::content::ContentId::from_bytes(content_id_bytes);
        let mut reaction_counts = if let Some(ref content_store) = self.node.content_store {
            match content_store.get_reaction_counts(&content_id) {
                Ok(counts) => counts,
                Err(_) => crate::types::content::ReactionCounts::new(),
            }
        } else {
            crate::types::content::ReactionCounts::new()
        };

        // Add pending engagements from BlockBuilder mempool (reactions not yet
        // in a block). Dedupe per (actor, emoji): a user holds at most one live
        // reaction per emoji, so a burst of pending same-emoji engagements from
        // one actor counts once — matching the persistent windowed count and
        // preventing a client loop from inflating the display.
        if let Some(ref block_builder) = self.node.block_builder {
            if let Ok(bb_read) = block_builder.read() {
                let mut seen: std::collections::HashSet<([u8; 32], u8)> =
                    std::collections::HashSet::new();
                let pending_actions = bb_read.get_pending_actions();
                for (_thread_id, _pending_space_id, action) in pending_actions {
                    if action.action_type == crate::blocks::action::ActionType::Engage {
                        if let Some(target_hash) = action.content_hash {
                            if target_hash == content_id_bytes {
                                if let Some(emoji_code) = action.emoji {
                                    if !seen.insert((action.actor, emoji_code)) {
                                        continue; // same actor+emoji already counted
                                    }
                                    match emoji_code {
                                        1 => reaction_counts.heart += 1,
                                        2 => reaction_counts.thumbs_up += 1,
                                        3 => reaction_counts.thumbs_down += 1,
                                        4 => reaction_counts.laugh += 1,
                                        5 => reaction_counts.thinking += 1,
                                        6 => reaction_counts.mind_blown += 1,
                                        7 => reaction_counts.fire += 1,
                                        8 => reaction_counts.swimming += 1,
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Emoji code to emoji string mapping
        let emoji_info = [
            (1, "❤️", reaction_counts.heart),
            (2, "👍", reaction_counts.thumbs_up),
            (3, "👎", reaction_counts.thumbs_down),
            (4, "😂", reaction_counts.laugh),
            (5, "🤔", reaction_counts.thinking),
            (6, "🤯", reaction_counts.mind_blown),
            (7, "🔥", reaction_counts.fire),
            (8, "🏊", reaction_counts.swimming),
        ];

        // Build response with non-zero reactions
        let mut total: u32 = 0;
        let reactions: Vec<Value> = emoji_info
            .iter()
            .filter_map(|(code, emoji, count)| {
                if *count > 0 {
                    total += count;
                    Some(json!({
                        "emoji": emoji,
                        "reaction_type": code,
                        "count": count,
                    }))
                } else {
                    None
                }
            })
            .collect();

        RpcResponse::success(
            json!({
                "content_id": params.content_id,
                "reactions": reactions,
                "total": total,
            }),
            id,
        )
    }

    /// Get a user's reactions on content (from content store)
    async fn get_user_reactions(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetUserReactionsParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse content_id
        let content_id_hex = params
            .content_id
            .strip_prefix("sha256:")
            .unwrap_or(&params.content_id);
        let content_id_bytes: [u8; 32] = match hex::decode(content_id_hex)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_id format",
                    id,
                );
            }
        };

        // Parse user_id
        let user_id_bytes: [u8; 32] = match hex::decode(&params.user_id)
            .ok()
            .and_then(|v| v.try_into().ok())
        {
            Some(bytes) => bytes,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid user_id format",
                    id,
                );
            }
        };

        // Get user's emoji reactions from content store
        let content_id = crate::types::content::ContentId::from_bytes(content_id_bytes);
        let reactor_id = crate::types::identity::IdentityId::from_bytes(user_id_bytes);
        let emoji_codes: Vec<u8> = if let Some(ref content_store) = self.node.content_store {
            match content_store.get_user_reactions(&content_id, &reactor_id) {
                Ok(reactions) => reactions.iter().map(|r| *r as u8).collect(),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };

        RpcResponse::success(
            json!({
                "content_id": params.content_id,
                "user_id": params.user_id,
                "reaction_types": emoji_codes,
            }),
            id,
        )
    }

    /// Get all engagement actions from the chain (for debugging sync)
    async fn get_chain_engagements(&self, params: Value, id: Value) -> RpcResponse {
        use std::collections::{HashMap, HashSet};

        let params: GetChainEngagementsParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse content filter if provided
        let filter_bytes: Option<[u8; 32]> = params.content_id.as_ref().and_then(|cid| {
            let clean = cid.strip_prefix("sha256:").unwrap_or(cid);
            hex::decode(clean).ok().and_then(|v| v.try_into().ok())
        });

        let chain_store = match &self.node.chain_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Chain store not available",
                    id,
                );
            }
        };

        // Collect all Engage actions
        let mut actions: Vec<EngageActionInfo> = Vec::new();
        let mut content_stats: HashMap<
            [u8; 32],
            (u32, u64, HashSet<[u8; 32]>, HashMap<String, u32>),
        > = HashMap::new();

        for block_result in chain_store.iter_content_blocks() {
            let block = match block_result {
                Ok(b) => b,
                Err(_) => continue,
            };
            let block_hash = hex::encode(block.hash());

            for action in &block.actions {
                if action.action_type != crate::blocks::ActionType::Engage {
                    continue;
                }

                // Get target content (stored in content_hash field for Engage actions)
                let target = match action.content_hash {
                    Some(h) => h,
                    None => continue,
                };

                // Apply filter if set
                if let Some(filter) = filter_bytes {
                    if target != filter {
                        continue;
                    }
                }

                // Build emoji string
                let emoji_str = action.emoji.map(|e| self.format_emoji(e));

                // Add to actions list
                actions.push(EngageActionInfo {
                    content_hash: hex::encode(target),
                    actor: hex::encode(action.actor),
                    timestamp: action.timestamp,
                    pow_work: action.pow_work,
                    emoji: emoji_str.clone(),
                    block_hash: block_hash.clone(),
                });

                // Update aggregated stats
                let entry = content_stats
                    .entry(target)
                    .or_insert_with(|| (0, 0, HashSet::new(), HashMap::new()));
                entry.0 += 1; // total engagements
                entry.1 += action.pow_work; // total pow work
                entry.2.insert(action.actor); // unique actors

                // Emoji counts
                if let Some(emoji) = action.emoji {
                    let emoji_key = self.format_emoji(emoji);
                    *entry.3.entry(emoji_key).or_insert(0) += 1;
                }
            }
        }

        // Build output
        let mut stats_list: Vec<ContentEngagementStats> = content_stats
            .into_iter()
            .map(
                |(hash, (count, pow, actors, emojis))| ContentEngagementStats {
                    content_hash: hex::encode(hash),
                    total_engagements: count,
                    total_pow_work: pow,
                    unique_actors: actors.len() as u32,
                    emoji_counts: emojis,
                },
            )
            .collect();

        // Sort by total engagements (highest first)
        stats_list.sort_by(|a, b| b.total_engagements.cmp(&a.total_engagements));

        let total_count = actions.len() as u32;

        let result = GetChainEngagementsResult {
            total_engage_actions: total_count,
            content_stats: stats_list,
            actions: if params.verbose { Some(actions) } else { None },
        };

        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Format emoji code to human-readable string
    fn format_emoji(&self, code: u8) -> String {
        match code {
            1 => "❤️ (heart)".to_string(),
            2 => "👍 (thumbsup)".to_string(),
            3 => "👎 (thumbsdown)".to_string(),
            4 => "😂 (laugh)".to_string(),
            5 => "🤔 (thinking)".to_string(),
            6 => "🤯 (mindblown)".to_string(),
            7 => "🔥 (fire)".to_string(),
            8 => "🏊 (swimming)".to_string(),
            _ => format!("(unknown: {})", code),
        }
    }

    /// Rebuild content_store reactions from chain engage actions
    /// This migrates reaction data from the blockchain into the content_store
    /// Clears existing reactions first to remove stale data
    async fn rebuild_reactions(&self, id: Value) -> RpcResponse {
        use crate::types::identity::Signature;

        let chain_store = match &self.node.chain_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Chain store not available",
                    id,
                );
            }
        };

        let content_store = match &self.node.content_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Content store not available",
                    id,
                );
            }
        };

        // Clear existing reactions first to remove stale data
        let cleared = match content_store.clear_all_reactions() {
            Ok(c) => c,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to clear reactions: {}", e),
                    id,
                );
            }
        };
        info!("[REBUILD] Cleared {} existing reaction entries", cleared);

        let mut added = 0u32;
        let mut skipped = 0u32;
        let mut errors = 0u32;

        // Iterate all content blocks and extract Engage actions
        for block_result in chain_store.iter_content_blocks() {
            let block = match block_result {
                Ok(b) => b,
                Err(_) => {
                    errors += 1;
                    continue;
                }
            };

            for action in &block.actions {
                if action.action_type != crate::blocks::ActionType::Engage {
                    continue;
                }

                let emoji = match action.emoji {
                    Some(e) => e,
                    None => continue,
                };

                let reaction_type = match emoji {
                    1 => ReactionType::Heart,
                    2 => ReactionType::ThumbsUp,
                    3 => ReactionType::ThumbsDown,
                    4 => ReactionType::Laugh,
                    5 => ReactionType::Thinking,
                    6 => ReactionType::MindBlown,
                    7 => ReactionType::Fire,
                    8 => ReactionType::Swimming,
                    _ => continue,
                };

                let target_content = match action.content_hash {
                    Some(h) => h,
                    None => continue,
                };

                let reaction = Reaction {
                    content_id: ContentId::from_bytes(target_content),
                    reactor_id: IdentityId::from_bytes(action.actor),
                    reaction_type,
                    // seconds -> milliseconds (reaction store/decay window is ms).
                    timestamp: action.timestamp.saturating_mul(1000),
                    signature: Signature::from_bytes([0u8; 64]),
                };

                match content_store.add_reaction(&reaction) {
                    Ok(true) => added += 1,
                    Ok(false) => skipped += 1, // duplicate
                    Err(_) => errors += 1,
                }
            }
        }

        info!(
            "[REBUILD] Reactions rebuilt: cleared={}, added={}, skipped={}, errors={}",
            cleared, added, skipped, errors
        );

        RpcResponse::success(
            json!({
                "cleared": cleared,
                "added": added,
                "skipped": skipped,
                "errors": errors,
                "message": format!("Rebuilt reactions from chain: {} cleared, {} added, {} duplicates skipped, {} errors", cleared, added, skipped, errors)
            }),
            id,
        )
    }

    // ========================================================================
    // Debug Methods
    // ========================================================================

    /// Get DHT status and routing table info
    async fn dht_status(&self, id: Value) -> RpcResponse {
        let dht = match &self.node.dht {
            Some(dht) => dht,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "DHT not available",
                    id,
                );
            }
        };

        let stats = dht.get_stats().await;

        // Get routing table nodes
        let routing_nodes: Vec<serde_json::Value> = dht
            .get_routing_table_nodes()
            .await
            .into_iter()
            .map(|(node_id, addr)| {
                json!({
                    "node_id": hex::encode(&node_id.as_bytes()[..8]),
                    "address": addr.to_string()
                })
            })
            .collect();

        RpcResponse::success(
            json!({
                "local_id": hex::encode(&stats.local_id[..8]),
                "total_nodes": stats.total_nodes,
                "non_empty_buckets": stats.non_empty_buckets,
                "provider_count": stats.provider_count,
                "routing_table": routing_nodes,
            }),
            id,
        )
    }

    /// Get known providers for a content hash
    async fn content_providers(&self, params: Value, id: Value) -> RpcResponse {
        #[derive(serde::Deserialize)]
        struct Params {
            content_id: String,
        }

        let params: Params = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse content ID
        let content_hash: [u8; 32] = if params.content_id.starts_with("sha256:") {
            match hex::decode(&params.content_id[7..]) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidContentId,
                        "Invalid content hash",
                        id,
                    );
                }
            }
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Content ID must start with sha256:",
                id,
            );
        };

        // Check content retrieval for known peers
        let mut known_peers = Vec::new();
        if let Some(ref content_mgr) = self.node.content_retrieval {
            let blob_hash = crate::storage::ContentBlobHash::from_bytes(content_hash);
            for peer_id in content_mgr.get_peers_with_content(&blob_hash) {
                known_peers.push(hex::encode(&peer_id[..8]));
            }
        }

        // Check DHT for providers
        let mut dht_providers = Vec::new();
        if let Some(ref dht) = self.node.dht {
            for provider in dht.get_local_providers(&content_hash).await {
                dht_providers.push(json!({
                    "node_id": hex::encode(&provider.id.as_bytes()[..8]),
                    "address": provider.addr.to_string()
                }));
            }
        }

        // Check if we have it locally
        let have_locally = if let Some(ref content_mgr) = self.node.content_retrieval {
            let blob_hash = crate::storage::ContentBlobHash::from_bytes(content_hash);
            content_mgr.has_content(&blob_hash)
        } else {
            false
        };

        RpcResponse::success(
            json!({
                "content_id": params.content_id,
                "have_locally": have_locally,
                "known_peers": known_peers,
                "dht_providers": dht_providers,
            }),
            id,
        )
    }

    /// Verify that an action with the given content_id is finalized in the blockchain
    ///
    /// Searches through all content blocks to find an action with matching content_hash.
    /// Returns the block height where it was finalized, or null if not found.
    async fn verify_action_finalized(&self, params: Value, id: Value) -> RpcResponse {
        #[derive(serde::Deserialize)]
        struct VerifyParams {
            content_id: String,
        }

        let params: VerifyParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse content ID (sha256:hex format)
        let content_hash: [u8; 32] = if params.content_id.starts_with("sha256:") {
            match hex::decode(&params.content_id[7..]) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidContentId,
                        "Invalid content hash",
                        id,
                    );
                }
            }
        } else {
            return RpcResponse::error(
                RpcErrorCode::InvalidContentId,
                "Content ID must start with sha256:",
                id,
            );
        };

        let chain_store = match &self.node.chain_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::StorageError,
                    "Chain store not available",
                    id,
                );
            }
        };

        // Iterate through all content blocks to find an action with this content_hash
        // This also gives us the block height information
        let mut found_height: Option<u64> = None;
        let mut found_action_type: Option<String> = None;
        let mut found_actor: Option<String> = None;

        for result in chain_store.iter_content_blocks() {
            match result {
                Ok(content_block) => {
                    for action in &content_block.actions {
                        if let Some(action_content_hash) = action.content_hash {
                            if action_content_hash == content_hash {
                                // Found the action! Now find its block height
                                // Use the action hash to check finalization status
                                let action_hash =
                                    crate::blocks::builder::BlockBuilder::action_hash(action);
                                if let Ok(Some(height)) =
                                    chain_store.is_action_finalized(&action_hash)
                                {
                                    found_height = Some(height);
                                    found_action_type = Some(format!("{:?}", action.action_type));
                                    found_actor = Some(hex::encode(&action.actor[..8]));
                                    break;
                                }
                            }
                        }
                    }
                    if found_height.is_some() {
                        break;
                    }
                }
                Err(e) => {
                    warn!("Error reading content block: {}", e);
                }
            }
        }

        RpcResponse::success(
            json!({
                "content_id": params.content_id,
                "finalized": found_height.is_some(),
                "block_height": found_height,
                "action_type": found_action_type,
                "actor": found_actor,
            }),
            id,
        )
    }

    // ========================================================================
    // Spam Attestation Methods (SPEC_12 §3)
    // ========================================================================

    /// Submit a spam attestation for content
    ///
    /// Required parameters:
    /// - content_id: Content hash (hex string)
    /// - attester_id: Attester public key (hex string)
    /// - reason: Spam reason (advertising, repetitive, off_topic, harassment, illegal_content)
    /// - signature: Ed25519 signature (hex string)
    /// - pow_nonce: PoW nonce (optional, defaults to 0)
    async fn submit_spam_attestation(&self, params: Value, id: Value) -> RpcResponse {
        let store = match &self.node.spam_attestation_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Spam attestation store not available",
                    id,
                );
            }
        };

        // Parse parameters
        let content_id = match params.get("content_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing content_id parameter",
                    id,
                );
            }
        };

        let attester_id = match params.get("attester_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing attester_id parameter",
                    id,
                );
            }
        };

        // Reporting affects the network — spam attestations accelerate content decay —
        // so it requires the same standing as posting. Otherwise unsponsored throwaway
        // identities are free spam-report abuse: each is its own sponsor-tree root, so a
        // handful reach the attestation threshold at only PoW cost, defeating the
        // sponsor-tree Sybil resistance.
        if let Err(response) = self.check_identity_sponsored(attester_id, &id) {
            return response;
        }

        let reason_str = match params.get("reason").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing reason parameter",
                    id,
                );
            }
        };

        let signature = match params.get("signature").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing signature parameter",
                    id,
                );
            }
        };

        let pow_nonce = params
            .get("pow_nonce")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        // Parse content_id
        let content_hash: [u8; 32] = match hex::decode(content_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse attester_id
        let attester: [u8; 32] = match hex::decode(attester_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid attester_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse reason
        let reason = match reason_str.to_lowercase().as_str() {
            "advertising" => SpamReason::Advertising,
            "repetitive" => SpamReason::Repetitive,
            "off_topic" | "offtopic" => SpamReason::OffTopic,
            "harassment" => SpamReason::Harassment,
            "illegal_content" | "illegalcontent" | "illegal" => SpamReason::IllegalContent,
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid reason: must be one of advertising, repetitive, off_topic, harassment, illegal_content",
                    id,
                );
            }
        };

        // Parse signature
        let sig_bytes: [u8; 64] = match hex::decode(signature) {
            Ok(bytes) if bytes.len() == 64 => {
                let mut arr = [0u8; 64];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature: must be 64-byte hex",
                    id,
                );
            }
        };

        // Use the CLIENT's timestamp — the one it signed and mined the PoW over.
        // Using the server clock instead made signing_message/pow_message differ from
        // what the client produced whenever the two clocks crossed a second boundary,
        // so reports failed verification (-32602) nondeterministically. Bound it to a
        // freshness window so a stale/pre-mined attestation can't be replayed.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let timestamp = params
            .get("timestamp")
            .and_then(|v| v.as_u64())
            .unwrap_or(now);
        if timestamp > now.saturating_add(120) || timestamp < now.saturating_sub(600) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid timestamp: must be within ~10 minutes of the current time",
                id,
            );
        }

        // Check for duplicate
        if store
            .has_attestation(&content_hash, &attester)
            .unwrap_or(false)
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Attestation already exists for this content from this attester",
                id,
            );
        }

        // Create attestation
        let attestation = SpamAttestation {
            content_hash,
            attester,
            reason,
            timestamp,
            pow_nonce,
            signature: sig_bytes,
        };

        // Verify signature (C1: Critical security fix)
        let signing_message = attestation.signing_message();
        let pubkey = PublicKey(attester);
        let sig = Signature(sig_bytes);
        if !ed25519_verify(&pubkey, &signing_message, &sig) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid signature: signature verification failed",
                id,
            );
        }

        // Verify PoW (C2: Critical security fix)
        let pow_message = attestation.pow_message();
        let mut hash_input = Vec::with_capacity(pow_message.len() + 8);
        hash_input.extend_from_slice(&pow_message);
        hash_input.extend_from_slice(&pow_nonce.to_le_bytes());
        let hash = pow_hash(&hash_input);
        let zeros = leading_zeros(&hash) as u8;
        if zeros < SPAM_ATTESTATION_POW_DIFFICULTY {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!(
                    "Insufficient PoW: required {} leading zeros, got {}",
                    SPAM_ATTESTATION_POW_DIFFICULTY, zeros
                ),
                id,
            );
        }

        // Look up sponsor tree root for Sybil resistance (H1: Security fix)
        let sponsor_tree_root = match &self.node.sponsorship_store {
            Some(sponsorship_store) => {
                let get_sponsor = |pk: &[u8; 32]| -> Option<[u8; 32]> {
                    sponsorship_store
                        .get_sponsor(&PublicKey::from_bytes(*pk))
                        .ok()
                        .flatten()
                        .map(|s| *s.as_bytes())
                };
                find_sponsor_tree_root(&attester, get_sponsor).unwrap_or(attester)
            }
            // Fallback to self as root if sponsorship store unavailable
            None => attester,
        };

        // Snapshot whether this content was already spam-flagged BEFORE adding this
        // attestation, so we only apply the reputation penalty on the FIRST crossing
        // of the threshold (not once per attestation after it is reached).
        let counter_state_pre = store.get_counter_state(&content_hash).unwrap_or_else(|_| {
            crate::spam_attestation::CounterAttestationState::empty(content_hash)
        });
        let was_flagged = {
            let prior = store
                .get_attestations_for_content(&content_hash)
                .unwrap_or_default();
            self.aggregate_with_reputation(content_hash, &prior, counter_state_pre.is_cleared)
                .should_accelerate_decay
        };

        // Store attestation
        let stored = StoredSpamAttestation {
            attestation: attestation.clone(),
            sponsor_tree_root,
            is_deduplicated: false,
        };

        if let Err(e) = store.put_attestation(&stored) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to store attestation: {}", e),
                id,
            );
        }

        // Check threshold
        let attestations = store
            .get_attestations_for_content(&content_hash)
            .unwrap_or_default();
        let counter_state = store.get_counter_state(&content_hash).unwrap_or_else(|_| {
            crate::spam_attestation::CounterAttestationState::empty(content_hash)
        });
        let aggregation =
            self.aggregate_with_reputation(content_hash, &attestations, counter_state.is_cleared);

        // On the first crossing of the spam threshold, decay the content author's
        // identity-level reputation (SPEC_12 §3.4). Idempotent per crossing.
        if !was_flagged && aggregation.should_accelerate_decay {
            self.record_spam_flag_for_content(&content_hash, timestamp);
        }

        // Increment rate limit
        store.increment_attestation_count(&attester, timestamp);

        info!(
            "[RPC] Spam attestation stored for content {} from attester {} (reason: {:?})",
            hex::encode(&content_hash[..8]),
            hex::encode(&attester[..8]),
            reason
        );

        RpcResponse::success(
            json!({
                "success": true,
                "content_id": content_id,
                "attester_id": attester_id,
                "reason": reason_str,
                "unique_trees": aggregation.count.unique_tree_count,
                "threshold_reached": aggregation.should_accelerate_decay,
                "is_cleared": counter_state.is_cleared,
            }),
            id,
        )
    }

    /// Submit a counter-attestation to dispute a spam flag
    ///
    /// Required parameters:
    /// - content_id: Content hash (hex string)
    /// - counter_attester_id: Counter-attester public key (hex string)
    /// - signature: Ed25519 signature (hex string)
    async fn submit_counter_attestation(&self, params: Value, id: Value) -> RpcResponse {
        let store = match &self.node.spam_attestation_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Spam attestation store not available",
                    id,
                );
            }
        };

        // Parse parameters
        let content_id = match params.get("content_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing content_id parameter",
                    id,
                );
            }
        };

        let counter_attester_id = match params.get("counter_attester_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing counter_attester_id parameter",
                    id,
                );
            }
        };

        let signature = match params.get("signature").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing signature parameter",
                    id,
                );
            }
        };

        // Parse content_id
        let content_hash: [u8; 32] = match hex::decode(content_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse counter_attester_id
        let counter_attester: [u8; 32] = match hex::decode(counter_attester_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid counter_attester_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse signature
        let sig_bytes: [u8; 64] = match hex::decode(signature) {
            Ok(bytes) if bytes.len() == 64 => {
                let mut arr = [0u8; 64];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature: must be 64-byte hex",
                    id,
                );
            }
        };

        // Get current time
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Verify signature (H2: High priority security fix)
        // Create signing message: "COUNTER_ATTESTATION" || content_hash || timestamp
        let mut signing_message = Vec::with_capacity(59);
        signing_message.extend_from_slice(b"COUNTER_ATTESTATION");
        signing_message.extend_from_slice(&content_hash);
        signing_message.extend_from_slice(&timestamp.to_le_bytes());
        let pubkey = PublicKey(counter_attester);
        let sig = Signature(sig_bytes);
        if !ed25519_verify(&pubkey, &signing_message, &sig) {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid signature: counter-attestation signature verification failed",
                id,
            );
        }

        // Get current counter state
        let mut state = match store.get_counter_state(&content_hash) {
            Ok(s) => s,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get counter state: {}", e),
                    id,
                );
            }
        };

        // Check if already cleared
        if state.is_cleared {
            return RpcResponse::success(
                json!({
                    "success": true,
                    "content_id": content_id,
                    "already_cleared": true,
                    "counter_attestations": state.count(),
                }),
                id,
            );
        }

        // Add counter-attestation
        let threshold_reached = state.add_counter_attester(counter_attester, timestamp);

        // Store updated state
        if let Err(e) = store.put_counter_state(&state) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to store counter state: {}", e),
                id,
            );
        }

        info!(
            "[RPC] Counter-attestation stored for content {} from {} ({}/{})",
            hex::encode(&content_hash[..8]),
            hex::encode(&counter_attester[..8]),
            state.count(),
            crate::spam_attestation::COUNTER_ATTESTATION_THRESHOLD
        );

        // When counter-attestations clear the spam flag, credit the content author's
        // reputation with fast recovery (SPEC_12 §4.5). Only on the crossing.
        if threshold_reached {
            self.record_counter_for_content(&content_hash, timestamp);
        }

        RpcResponse::success(
            json!({
                "success": true,
                "content_id": content_id,
                "counter_attester_id": counter_attester_id,
                "counter_attestations": state.count(),
                "threshold_needed": crate::spam_attestation::COUNTER_ATTESTATION_THRESHOLD,
                "is_cleared": state.is_cleared,
                "just_cleared": threshold_reached,
            }),
            id,
        )
    }

    /// Get spam status for content
    ///
    /// Required parameters:
    /// - content_id: Content hash (hex string)
    async fn get_spam_status(&self, params: Value, id: Value) -> RpcResponse {
        let store = match &self.node.spam_attestation_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Spam attestation store not available",
                    id,
                );
            }
        };

        // Parse content_id
        let content_id = match params.get("content_id").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing content_id parameter",
                    id,
                );
            }
        };

        let content_hash: [u8; 32] = match hex::decode(content_id) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_id: must be 32-byte hex",
                    id,
                );
            }
        };

        // Get attestations
        let attestations = store
            .get_attestations_for_content(&content_hash)
            .unwrap_or_default();

        // Get counter state
        let counter_state = store.get_counter_state(&content_hash).unwrap_or_else(|_| {
            crate::spam_attestation::CounterAttestationState::empty(content_hash)
        });

        // Aggregate
        let aggregation =
            aggregate_attestations(content_hash, &attestations, counter_state.is_cleared);

        // Build attestation details
        let attestation_details: Vec<Value> = attestations
            .iter()
            .map(|a| {
                json!({
                    "attester": hex::encode(&a.attestation.attester),
                    "reason": a.attestation.reason.name(),
                    "timestamp": a.attestation.timestamp,
                    "sponsor_tree_root": hex::encode(&a.sponsor_tree_root),
                })
            })
            .collect();

        RpcResponse::success(
            json!({
                "content_id": content_id,
                "is_flagged": aggregation.should_accelerate_decay,
                "is_cleared": counter_state.is_cleared,
                "unique_tree_count": aggregation.count.unique_tree_count,
                "total_attestations": attestations.len(),
                "spam_threshold": crate::spam_attestation::SPAM_ATTESTATION_THRESHOLD,
                "counter_attestations": counter_state.count(),
                "counter_threshold": crate::spam_attestation::COUNTER_ATTESTATION_THRESHOLD,
                "cleared_at": counter_state.cleared_at,
                "attestations": attestation_details,
            }),
            id,
        )
    }

    // ========================================================================
    // Private Space Methods (DMs, Group Chats)
    // ========================================================================

    /// Get pending invites for a user
    async fn get_my_invites(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetMyInvitesParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse user public key
        let user_pk: [u8; 32] = match hex::decode(&params.user) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid user: must be 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get pending invites
        let invites = match membership_store.get_user_invites(&user_pk) {
            Ok(invites) => invites,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get invites: {}", e),
                    id,
                );
            }
        };

        // Convert to RPC response format
        let invite_infos: Vec<InviteInfo> = invites
            .into_iter()
            .map(|inv| InviteInfo {
                invite_hash: hex::encode(&inv.invite_hash),
                space_id: hex::encode(&inv.space_id),
                inviter: hex::encode(&inv.inviter_pk),
                encrypted_space_key: hex::encode(&inv.encrypted_space_key),
                created_at: inv.created_at,
                expires_at: inv.expires_at,
                message: inv.message.map(|m| hex::encode(&m)),
            })
            .collect();

        let result = GetMyInvitesResult {
            invites: invite_infos,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get members of a private space
    async fn get_space_members(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetSpaceMembersParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse space ID (16-byte hex)
        let space_id: [u8; 16] = match hex::decode(&params.space_id) {
            Ok(bytes) if bytes.len() == 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes);
                arr
            }
            Ok(bytes) if bytes.len() == 32 => {
                // Accept 32-byte space_id and take first 16 bytes
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes[..16]);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid space_id: must be 16-byte or 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get space members
        let members = match membership_store.get_space_members(&space_id) {
            Ok(members) => members,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get members: {}", e),
                    id,
                );
            }
        };

        // Convert to RPC response format
        let member_infos: Vec<MemberInfo> = members
            .into_iter()
            .map(|m| MemberInfo {
                member: hex::encode(&m.member_pk),
                role: match m.role {
                    crate::storage::membership::MemberRole::Admin => "admin".to_string(),
                    crate::storage::membership::MemberRole::Moderator => "moderator".to_string(),
                    crate::storage::membership::MemberRole::Member => "member".to_string(),
                },
                joined_at: m.joined_at,
                invited_by: hex::encode(&m.invited_by),
            })
            .collect();

        let result = GetSpaceMembersResult {
            space_id: params.space_id,
            members: member_infos.clone(),
            count: member_infos.len(),
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get all private spaces a user is a member of
    async fn get_my_private_spaces(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetMyPrivateSpacesParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse user public key
        let user_pk: [u8; 32] = match hex::decode(&params.user) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid user: must be 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get user's private spaces
        let space_ids = match membership_store.get_user_spaces(&user_pk) {
            Ok(spaces) => spaces,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get spaces: {}", e),
                    id,
                );
            }
        };

        // Hide special-purpose spaces from the normal private-channel list — they aren't
        // channels people join and have their own UI: the user's own profile space
        // (sha256("profile:v1:<pk>")) and any DM space they participate in.
        let profile_space_id: [u8; 16] = {
            let preimage = format!("profile:v1:{}", params.user.to_lowercase());
            let h = crate::crypto::sha256(preimage.as_bytes());
            apply_class(SpaceClass::Profile, &h)
        };
        let dm_space_ids = membership_store
            .get_dm_space_ids(&user_pk)
            .unwrap_or_default();

        // Build space info for each space
        let mut spaces: Vec<PrivateSpaceInfo> = Vec::new();
        for space_id in space_ids {
            if space_id == profile_space_id || dm_space_ids.contains(&space_id) {
                continue;
            }
            // Get member record for role info
            let member = membership_store
                .get_member(&space_id, &user_pk)
                .ok()
                .flatten();
            let role = member
                .as_ref()
                .map(|m| match m.role {
                    crate::storage::membership::MemberRole::Admin => "admin".to_string(),
                    crate::storage::membership::MemberRole::Moderator => "moderator".to_string(),
                    crate::storage::membership::MemberRole::Member => "member".to_string(),
                })
                .unwrap_or_else(|| "member".to_string());
            let joined_at = member.as_ref().map(|m| m.joined_at).unwrap_or(0);
            let key_version = member.as_ref().map(|m| m.key_version).unwrap_or(0);

            // Get member count
            let member_count = membership_store.member_count(&space_id).unwrap_or(0);

            // Get space info from chain store for encrypted name, and — when this is the
            // node's own membership (node-managed mode) — decrypt the name node-side so
            // desktop clients can show it without ever holding the space key.
            let (encrypted_name, decrypted_name) =
                if let Some(ref chain_store) = self.node.chain_store {
                    if let Ok(Some(space_info)) = chain_store.get_space(&space_id) {
                        let raw = space_info.encrypted_name;
                        let decrypted = if user_pk == self.node.keypair.public_key.0 {
                            match self.node_space_key(&space_id) {
                                Ok(key) => raw.as_ref().and_then(|n| {
                                    crate::crypto::private_space::decrypt_space_name(n, &key).ok()
                                }),
                                Err(_) => None,
                            }
                        } else {
                            None
                        };
                        (raw.map(|n| hex::encode(&n)), decrypted)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

            spaces.push(PrivateSpaceInfo {
                space_id: hex::encode(&space_id),
                space_id_bech32: encode_space_id(&space_id),
                encrypted_name,
                name: decrypted_name,
                role,
                joined_at,
                member_count,
                key_version,
            });
        }

        let result = GetMyPrivateSpacesResult { spaces };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get pending DM requests for a user
    async fn get_pending_dm_requests(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetPendingDMRequestsParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse user public key
        let user_pk: [u8; 32] = match hex::decode(&params.user) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid user: must be 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get pending DM requests
        let requests = match membership_store.get_pending_dm_requests(&user_pk) {
            Ok(reqs) => reqs,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get DM requests: {}", e),
                    id,
                );
            }
        };

        // Convert to RPC response format
        let request_infos: Vec<DMRequestInfo> = requests
            .into_iter()
            .map(|r| DMRequestInfo {
                request_hash: hex::encode(&r.request_hash),
                requester: hex::encode(&r.requester_pk),
                key_share: hex::encode(&r.requester_key_share),
                created_at: r.created_at,
            })
            .collect();

        let result = GetPendingDMRequestsResult {
            requests: request_infos,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// List DM requests SENT by a user (as requester), with their current status.
    /// Lets the requester's client learn when a recipient has accepted (so it can flip
    /// a "pending" DM to an active conversation).
    /// Encode a 32-byte ed25519 public key (hex) as its canonical cs1… address.
    /// Lets clients show a friendly address for a peer they only know by pubkey.
    async fn encode_address(&self, params: Value, id: Value) -> RpcResponse {
        let pk_hex = match params.get("pubkey").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => return RpcResponse::error(RpcErrorCode::InvalidParams, "Missing pubkey", id),
        };
        let pk: [u8; 32] = match hex::decode(pk_hex) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid pubkey: must be 32-byte hex",
                    id,
                )
            }
        };
        let address = crate::crypto::address::encode_address_from_pubkey(
            &crate::types::identity::PublicKey(pk),
        );
        RpcResponse::success(serde_json::json!({ "address": address }), id)
    }

    async fn get_sent_dm_requests(&self, params: Value, id: Value) -> RpcResponse {
        let user_hex = match params.get("user").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing user parameter",
                    id,
                )
            }
        };
        let user_pk: [u8; 32] = match hex::decode(&user_hex) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid user: must be 32-byte hex",
                    id,
                )
            }
        };
        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                )
            }
        };
        let sent = match membership_store.get_sent_dm_requests(&user_pk) {
            Ok(v) => v,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get sent DM requests: {}", e),
                    id,
                )
            }
        };
        let requests: Vec<Value> = sent
            .into_iter()
            .map(|r| {
                let status = match r.status {
                    crate::storage::membership::DMRequestStatus::Pending => "pending",
                    crate::storage::membership::DMRequestStatus::Accepted => "accepted",
                    crate::storage::membership::DMRequestStatus::Declined => "declined",
                };
                serde_json::json!({
                    "recipient": hex::encode(r.recipient_pk),
                    "status": status,
                    "space_id": r.space_id.map(hex::encode),
                    "created_at": r.created_at,
                })
            })
            .collect();
        RpcResponse::success(serde_json::json!({ "requests": requests }), id)
    }

    /// Send a DM request to another user
    ///
    /// Creates a pending DM request that the recipient can accept or decline.
    /// The requester provides their key share for the DH key exchange.
    async fn request_dm(&self, params: Value, id: Value) -> RpcResponse {
        let params: RequestDMParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse requester and recipient public keys
        let requester_pk: [u8; 32] = match hex::decode(&params.requester) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid requester: must be 32-byte hex",
                    id,
                );
            }
        };

        let recipient_pk: [u8; 32] = match hex::decode(&params.recipient) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid recipient: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse key share
        let key_share = match hex::decode(&params.key_share) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid key_share hex: {}", e),
                    id,
                );
            }
        };

        // Validate key_share length (must be exactly 32 bytes for X25519)
        if key_share.len() != 32 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid key_share: must be exactly 32 bytes",
                id,
            );
        }

        // Get membership store
        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Check if a DM request already exists
        match membership_store.dm_request_exists(&requester_pk, &recipient_pk) {
            Ok(true) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "DM request already exists between these users",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check existing DM request: {}", e),
                    id,
                );
            }
            _ => {}
        }

        // Check reverse direction too
        match membership_store.dm_request_exists(&recipient_pk, &requester_pk) {
            Ok(true) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "DM request already exists between these users (reverse)",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check existing DM request: {}", e),
                    id,
                );
            }
            _ => {}
        }

        // Compute request hash
        let request_hash = crate::crypto::sha256(
            &[
                &requester_pk[..],
                &recipient_pk[..],
                &params.timestamp.to_le_bytes(),
            ]
            .concat(),
        );

        // Create the DM request record
        let record = crate::storage::membership::DMRequestRecord {
            request_hash,
            requester_pk,
            recipient_pk,
            requester_key_share: key_share,
            created_at: params.timestamp,
            status: crate::storage::membership::DMRequestStatus::Pending,
            space_id: None,
        };

        // Store the request
        if let Err(e) = membership_store.add_dm_request(&record) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to store DM request: {}", e),
                id,
            );
        }

        info!(
            "[DM] Created DM request from {} to {}",
            &params.requester[..16],
            &params.recipient[..16]
        );

        let result = RequestDMResult {
            request_hash: hex::encode(&request_hash),
            broadcast: false, // Not broadcast yet - requires gossip implementation
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Node-managed DM request (desktop path): the node owns the identity seed, so it
    /// does ALL the crypto — derives the deterministic DM space, generates + wraps the
    /// space key for the recipient, signs the canonical request, mines the anti-spam
    /// PoW, registers the space locally so the sender can already post, and broadcasts
    /// a `DmRequestAnnounce` so the request reaches the recipient's node. The client
    /// only sends the recipient's pubkey.
    async fn request_dm_managed(&self, params: Value, id: Value) -> RpcResponse {
        use crate::crypto::private_space::{
            encrypt_space_name, generate_space_key, wrap_space_key_for,
        };
        use crate::crypto::{leading_zeros, pow_hash, sha256};
        use crate::network::messages::{DmRequestAnnouncePayload, DM_REQUEST_POW_DIFFICULTY};

        let recipient_hex = match params.get("recipient").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing recipient parameter",
                    id,
                )
            }
        };
        // Accept either 32-byte hex or a cs1… bech32 address (what users actually paste).
        let recipient: [u8; 32] = match hex::decode(&recipient_hex) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => match crate::crypto::address::decode_address_to_pubkey(&recipient_hex) {
                Ok(pk) => pk.0,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid recipient: must be 32-byte hex or a cs1 address",
                        id,
                    )
                }
            },
        };
        let me = self.node.keypair.public_key.0;
        if recipient == me {
            return RpcResponse::error(RpcErrorCode::InvalidParams, "Cannot DM yourself", id);
        }

        // DMs are participation — same sponsorship gate as posting.
        if let Err(response) = self.check_identity_sponsored(&hex::encode(me), &id) {
            return response;
        }

        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);

        // Deterministic DM space id (symmetric in the two pubkeys) so both sides agree.
        let mut sorted = [me, recipient];
        sorted.sort();
        let preimage = format!(
            "dm:v1:{}:{}",
            hex::encode(sorted[0]),
            hex::encode(sorted[1])
        );
        let sh = sha256(preimage.as_bytes());
        let space_id = apply_class(SpaceClass::Dm, &sh);

        // DM space key, wrapped for self (so we can read) and for the recipient (the
        // key_share the request carries — only they can unwrap it).
        let space_key = generate_space_key();
        let self_wrap = match wrap_space_key_for(&space_key, &me, &seed) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to wrap DM key: {}", e),
                    id,
                )
            }
        };
        let recipient_wrap = match wrap_space_key_for(&space_key, &recipient, &seed) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to wrap DM key for recipient: {}", e),
                    id,
                )
            }
        };
        let key_share: [u8; 72] = match recipient_wrap.as_slice().try_into() {
            Ok(a) => a,
            Err(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Unexpected wrapped-key size",
                    id,
                )
            }
        };

        let timestamp = crate::crypto::current_timestamp();
        let encrypted_name = encrypt_space_name("Direct message", &space_key);

        // Register the DM space locally + add self as admin member so the requester can
        // post/read immediately (content syncs via normal block sync).
        let space_info = crate::storage::chain::SpaceInfo {
            space_id,
            name: String::new(),
            description: None,
            creator: me,
            created_at: timestamp,
            pow_work: 1,
            is_private: true,
            encrypted_name: Some(encrypted_name),
            creator_encrypted_key: Some(self_wrap.clone()),
            key_version: 0,
        };
        if let Some(ref chain_store) = self.node.chain_store {
            let _ = chain_store.register_space(&space_info);
        }
        if let Some(ref membership_store) = self.node.membership_store {
            let member = crate::storage::membership::MemberRecord {
                member_pk: me,
                role: crate::storage::membership::MemberRole::Admin,
                joined_at: timestamp,
                invited_by: [0u8; 32],
                encrypted_space_key: self_wrap,
                key_version: 0,
            };
            let _ = membership_store.add_member(&space_id, &member);
        }

        // Build the self-authenticating request: sign the canonical message, then mine
        // the anti-spam PoW (fixed 12-bit sha256, ~4096 hashes).
        let mut payload = DmRequestAnnouncePayload {
            requester: me,
            recipient,
            key_share,
            timestamp,
            pow_nonce: 0,
            signature: [0u8; 64],
        };
        payload.signature =
            ed25519_sign(&self.node.keypair.private_key, &payload.signing_message()).0;
        let pow_pre = payload.pow_message();
        let mut nonce: u64 = 0;
        loop {
            let mut inp = pow_pre.clone();
            inp.extend_from_slice(&nonce.to_le_bytes());
            if leading_zeros(&pow_hash(&inp)) >= u32::from(DM_REQUEST_POW_DIFFICULTY) {
                break;
            }
            nonce = nonce.wrapping_add(1);
        }
        payload.pow_nonce = nonce;

        // Record the outgoing request locally (pending) and broadcast it.
        if let Some(ref membership_store) = self.node.membership_store {
            let request_hash =
                sha256(&[&me[..], &recipient[..], &timestamp.to_le_bytes()].concat());
            let record = crate::storage::membership::DMRequestRecord {
                request_hash,
                requester_pk: me,
                recipient_pk: recipient,
                requester_key_share: recipient_wrap,
                created_at: timestamp,
                status: crate::storage::membership::DMRequestStatus::Pending,
                space_id: Some(space_id),
            };
            let _ = membership_store.add_dm_request(&record);
        }

        let mut broadcast = false;
        if let Some(ref pool) = self.node.connection_pool {
            use crate::types::network::{MessageEnvelope, MessageType};
            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::DmRequestAnnounce,
                payload.to_bytes().to_vec(),
            );
            let sent = pool.broadcast(&envelope).await;
            broadcast = sent > 0;
            info!("[DM] Broadcast managed DM request to {} peers", sent);
        }

        RpcResponse::success(
            serde_json::json!({
                "space_id": hex::encode(space_id),
                "space_id_bech32": encode_space_id(&space_id),
                "recipient": hex::encode(recipient),
                "broadcast": broadcast,
            }),
            id,
        )
    }

    /// Accept a DM request from another user
    ///
    /// Completes the key exchange and creates the DM space.
    async fn accept_dm(&self, params: Value, id: Value) -> RpcResponse {
        let params: AcceptDMParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse requester and acceptor public keys
        let requester_pk: [u8; 32] = match hex::decode(&params.requester) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid requester: must be 32-byte hex",
                    id,
                );
            }
        };

        let acceptor_pk: [u8; 32] = match hex::decode(&params.acceptor) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid acceptor: must be 32-byte hex",
                    id,
                );
            }
        };

        // Get membership store
        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get the pending DM request
        let request = match membership_store.get_dm_request(&requester_pk, &acceptor_pk) {
            Ok(Some(req)) => req,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "No pending DM request found from this user",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get DM request: {}", e),
                    id,
                );
            }
        };

        // Check status
        if request.status != crate::storage::membership::DMRequestStatus::Pending {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "DM request is not pending",
                id,
            );
        }

        // Generate deterministic DM space ID from sorted public keys
        let sorted_keys = {
            let mut keys = [requester_pk, acceptor_pk];
            keys.sort();
            keys
        };
        let preimage = format!(
            "dm:v1:{}:{}",
            hex::encode(&sorted_keys[0]),
            hex::encode(&sorted_keys[1])
        );
        let space_hash = crate::crypto::sha256(preimage.as_bytes());
        let space_id = apply_class(SpaceClass::Dm, &space_hash);

        // Update request status to accepted
        if let Err(e) = membership_store.update_dm_request_status(
            &requester_pk,
            &acceptor_pk,
            crate::storage::membership::DMRequestStatus::Accepted,
            Some(space_id),
        ) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to update DM request status: {}", e),
                id,
            );
        }

        // Add both users as members of the DM space
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(params.timestamp);

        // Add requester as member
        let requester_record = crate::storage::membership::MemberRecord {
            member_pk: requester_pk,
            role: crate::storage::membership::MemberRole::Admin,
            joined_at: now,
            invited_by: [0u8; 32],
            encrypted_space_key: Vec::new(), // To be set by client
            key_version: 1,
        };
        if let Err(e) = membership_store.add_member(&space_id, &requester_record) {
            warn!("[DM] Failed to add requester as member: {}", e);
        }

        // Add acceptor as member
        let acceptor_record = crate::storage::membership::MemberRecord {
            member_pk: acceptor_pk,
            role: crate::storage::membership::MemberRole::Admin,
            joined_at: now,
            invited_by: [0u8; 32],
            encrypted_space_key: Vec::new(),
            key_version: 1,
        };
        if let Err(e) = membership_store.add_member(&space_id, &acceptor_record) {
            warn!("[DM] Failed to add acceptor as member: {}", e);
        }

        info!("[DM] Accepted DM request: space {}", hex::encode(&space_id));

        let result = AcceptDMResult {
            space_id: hex::encode(&space_id),
            broadcast: false,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Accept a DM request using the node-held identity (desktop / node-managed mode).
    ///
    /// The node unwraps the space key that the requester sealed for us, re-wraps it for
    /// our own membership record, registers the DM space, and marks the request accepted.
    /// After this, both parties are members of the same deterministic DM space and can
    /// exchange encrypted content through normal private-space sync — no client crypto.
    async fn accept_dm_managed(&self, params: Value, id: Value) -> RpcResponse {
        use crate::crypto::private_space::{
            encrypt_space_name, unwrap_space_key, wrap_space_key_for,
        };

        let requester_hex = match params.get("requester").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing requester parameter",
                    id,
                )
            }
        };
        let requester_pk: [u8; 32] = match hex::decode(&requester_hex) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid requester: must be 32-byte hex",
                    id,
                )
            }
        };

        let me = self.node.keypair.public_key.0;
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                )
            }
        };

        // Look up the pending request addressed to us.
        let request = match membership_store.get_dm_request(&requester_pk, &me) {
            Ok(Some(req)) => req,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "No pending DM request found from this user",
                    id,
                )
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get DM request: {}", e),
                    id,
                )
            }
        };

        // Unwrap the space key the requester sealed for us (invited_by = requester).
        let space_key =
            match unwrap_space_key(&request.requester_key_share, &requester_pk, &me, &seed) {
                Ok(k) => k,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to unwrap DM key: {}", e),
                        id,
                    )
                }
            };

        // Deterministic DM space id (identical derivation on both sides).
        let mut sorted = [requester_pk, me];
        sorted.sort();
        let preimage = format!(
            "dm:v1:{}:{}",
            hex::encode(sorted[0]),
            hex::encode(sorted[1])
        );
        let sh = crate::crypto::sha256(preimage.as_bytes());
        let space_id = apply_class(SpaceClass::Dm, &sh);

        // Re-wrap the key for our own membership so we can read/post going forward.
        let self_wrap = match wrap_space_key_for(&space_key, &me, &seed) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to wrap DM key: {}", e),
                    id,
                )
            }
        };

        let timestamp = crate::crypto::current_timestamp();
        let encrypted_name = encrypt_space_name("Direct message", &space_key);

        // Register the DM space locally + add ourselves as an admin member.
        let space_info = crate::storage::chain::SpaceInfo {
            space_id,
            name: String::new(),
            description: None,
            creator: requester_pk,
            created_at: request.created_at,
            pow_work: 1,
            is_private: true,
            encrypted_name: Some(encrypted_name),
            creator_encrypted_key: None,
            key_version: 0,
        };
        if let Some(ref chain_store) = self.node.chain_store {
            let _ = chain_store.register_space(&space_info);
        }
        // Store a SELF-wrap (invited_by = 0) so node_space_key unwraps it against our
        // own key — exactly how create_private_space_managed records the creator's key.
        let member = crate::storage::membership::MemberRecord {
            member_pk: me,
            role: crate::storage::membership::MemberRole::Admin,
            joined_at: timestamp,
            invited_by: [0u8; 32],
            encrypted_space_key: self_wrap,
            key_version: 0,
        };
        if let Err(e) = membership_store.add_member(&space_id, &member) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to add self as DM member: {}", e),
                id,
            );
        }

        // Mark the request accepted (records the resolved space_id).
        if let Err(e) = membership_store.update_dm_request_status(
            &requester_pk,
            &me,
            crate::storage::membership::DMRequestStatus::Accepted,
            Some(space_id),
        ) {
            warn!("[DM] Failed to update DM request status: {}", e);
        }

        info!(
            "[DM] Accepted managed DM request from {} -> space {}",
            hex::encode(&requester_pk[..8]),
            hex::encode(space_id)
        );

        // Tell the requester (and the network) we accepted, so their node flips the
        // request from Pending to Accepted. Signed by us; no PoW (they only act on it
        // if they hold a matching outgoing request).
        let mut accept = crate::network::messages::DmAcceptAnnouncePayload {
            requester: requester_pk,
            acceptor: me,
            timestamp,
            signature: [0u8; 64],
        };
        accept.signature =
            ed25519_sign(&self.node.keypair.private_key, &accept.signing_message()).0;
        if let Some(ref pool) = self.node.connection_pool {
            use crate::types::network::{MessageEnvelope, MessageType};
            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::DmAcceptAnnounce,
                accept.to_bytes().to_vec(),
            );
            let sent = pool.broadcast(&envelope).await;
            info!("[DM] Broadcast DM acceptance to {} peers", sent);
        }

        RpcResponse::success(
            serde_json::json!({
                "space_id": hex::encode(space_id),
                "space_id_bech32": encode_space_id(&space_id),
                "requester": requester_hex,
            }),
            id,
        )
    }

    /// Decline a DM request using the node-held identity (desktop / node-managed mode).
    /// Marks our incoming request Declined and tells the requester (signed announcement)
    /// so their client can drop the pending DM.
    async fn decline_dm_managed(&self, params: Value, id: Value) -> RpcResponse {
        let requester_hex = match params.get("requester").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing requester parameter",
                    id,
                )
            }
        };
        let requester_pk: [u8; 32] = match hex::decode(&requester_hex) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid requester: must be 32-byte hex",
                    id,
                )
            }
        };
        let me = self.node.keypair.public_key.0;

        if let Some(ref membership_store) = self.node.membership_store {
            let _ = membership_store.update_dm_request_status(
                &requester_pk,
                &me,
                crate::storage::membership::DMRequestStatus::Declined,
                None,
            );
        }

        let timestamp = crate::crypto::current_timestamp();
        let mut decline = crate::network::messages::DmDeclineAnnouncePayload {
            requester: requester_pk,
            decliner: me,
            timestamp,
            signature: [0u8; 64],
        };
        decline.signature =
            ed25519_sign(&self.node.keypair.private_key, &decline.signing_message()).0;
        if let Some(ref pool) = self.node.connection_pool {
            use crate::types::network::{MessageEnvelope, MessageType};
            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::DmDeclineAnnounce,
                decline.to_bytes().to_vec(),
            );
            let sent = pool.broadcast(&envelope).await;
            info!("[DM] Broadcast DM decline to {} peers", sent);
        }

        RpcResponse::success(
            serde_json::json!({ "requester": requester_hex, "declined": true }),
            id,
        )
    }

    /// Decline a DM request from another user
    async fn decline_dm(&self, params: Value, id: Value) -> RpcResponse {
        let params: DeclineDMParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse requester and decliner public keys
        let requester_pk: [u8; 32] = match hex::decode(&params.requester) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid requester: must be 32-byte hex",
                    id,
                );
            }
        };

        let decliner_pk: [u8; 32] = match hex::decode(&params.decliner) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid decliner: must be 32-byte hex",
                    id,
                );
            }
        };

        // Get membership store
        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get the pending DM request
        let request = match membership_store.get_dm_request(&requester_pk, &decliner_pk) {
            Ok(Some(req)) => req,
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "No pending DM request found from this user",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get DM request: {}", e),
                    id,
                );
            }
        };

        // Check status
        if request.status != crate::storage::membership::DMRequestStatus::Pending {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "DM request is not pending",
                id,
            );
        }

        // Update request status to declined
        if let Err(e) = membership_store.update_dm_request_status(
            &requester_pk,
            &decliner_pk,
            crate::storage::membership::DMRequestStatus::Declined,
            None,
        ) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to update DM request status: {}", e),
                id,
            );
        }

        info!("[DM] Declined DM request from {}", &params.requester[..16]);

        let result = DeclineDMResult {
            success: true,
            broadcast: false,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Create a new private (encrypted) space
    async fn create_private_space(&self, params: Value, id: Value) -> RpcResponse {
        let params: CreatePrivateSpaceParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse creator public key
        let creator_pk: [u8; 32] = match hex::decode(&params.creator) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid creator: must be 32-byte hex",
                    id,
                );
            }
        };

        // SPONSORSHIP CHECK: Verify identity is sponsored before allowing private space creation
        if let Err(response) = self.check_identity_sponsored(&params.creator, &id) {
            return response;
        }

        // Parse encrypted key for creator
        let creator_encrypted_key: Vec<u8> = match hex::decode(&params.creator_encrypted_key) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid creator_encrypted_key: {}", e),
                    id,
                );
            }
        };

        // Verify PoW for space creation
        if let Err((code, msg)) = verify_pow_submission(
            ActionType::SpaceCreation,
            params.name.as_bytes(),
            &params.creator,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Generate space_id deterministically from creator + name + timestamp
        let mut space_id_input = Vec::new();
        space_id_input.extend_from_slice(&creator_pk);
        space_id_input.extend_from_slice(params.name.as_bytes());
        space_id_input.extend_from_slice(&params.timestamp.to_le_bytes());
        let space_hash = crate::crypto::sha256(&space_id_input);
        let space_id = apply_class(SpaceClass::Private, &space_hash);

        // Create SpaceInfo (stored encrypted on chain)
        // For private spaces, name is empty string - actual name is in encrypted_name
        let space_info = crate::storage::chain::SpaceInfo {
            space_id,
            name: String::new(), // Private spaces use encrypted_name
            description: None,
            creator: creator_pk,
            created_at: params.timestamp,
            pow_work: (1u64 << params.pow_difficulty.min(63)) / 1000 + 1,
            is_private: true,
            encrypted_name: Some(params.name.as_bytes().to_vec()), // Already encrypted by client
            creator_encrypted_key: Some(creator_encrypted_key.clone()),
            key_version: 0,
        };

        // Register space in chain store
        if let Some(ref chain_store) = self.node.chain_store {
            if let Err(e) = chain_store.register_space(&space_info) {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to register space: {}", e),
                    id,
                );
            }
        }

        // Add creator as admin in membership store
        if let Some(ref membership_store) = self.node.membership_store {
            let member_record = crate::storage::membership::MemberRecord {
                member_pk: creator_pk,
                role: crate::storage::membership::MemberRole::Admin,
                joined_at: params.timestamp,
                invited_by: [0u8; 32], // Creator invites themselves
                encrypted_space_key: creator_encrypted_key,
                key_version: 0,
            };
            if let Err(e) = membership_store.add_member(&space_id, &member_record) {
                warn!("Failed to add creator to membership store: {}", e);
            }
        }

        // Create and broadcast CreateSpace action
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let mut signature_bytes = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes.copy_from_slice(&sig_bytes);
                }
            }

            let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;
            let content_hash = crate::crypto::sha256(params.name.as_bytes());

            let action = Action {
                action_type: crate::blocks::ActionType::CreateSpace,
                actor: creator_pk,
                timestamp: params.timestamp,
                content_hash: Some(content_hash),
                parent_id: None,
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target: crate::crypto::sha256(params.pow_hash.as_bytes()),
                signature: signature_bytes,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // Thread ID is the space_id (padded to 32 bytes)
            let mut thread_id = [0u8; 32];
            thread_id[..16].copy_from_slice(&space_id);

            // Space ID also padded to 32 bytes for action
            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path = self.resolve_branch_path(&space_id_32, &thread_id, Some(&creator_pk));

            // Add to block builder
            let added = match block_builder.write() {
                Ok(mut builder) => {
                    let added =
                        builder.add_action(thread_id, space_id_32, action.clone(), branch_path);
                    if added {
                        info!("[BLOCKS] Added CREATE_PRIVATE_SPACE action to block builder");
                    }
                    added
                }
                Err(e) => {
                    warn!("[BLOCKS] Failed to acquire block builder lock: {:?}", e);
                    false
                }
            };

            // Broadcast action to peers
            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload = ActionAnnouncePayload::new(thread_id, space_id_32, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                    info!("[PRIVATE] Broadcast CreatePrivateSpace to {} peers", sent);
                }
            }
        }

        let result = CreatePrivateSpaceResult {
            space_id: hex::encode(&space_id),
            space_id_bech32: encode_space_id(&space_id),
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Create a private space in NODE-MANAGED mode (desktop app).
    ///
    /// The node owns the identity seed and never exposes it, so — unlike
    /// `create_private_space`, which takes client-encrypted blobs — the client sends
    /// only the plaintext name and the NODE does everything: derives its X25519 keys,
    /// generates the space key, wraps it for itself, encrypts the name, mines the PoW,
    /// and signs the CreateSpace action. Every value is bound to the RAW encrypted-name
    /// blob so the node reads back exactly what it wrote (self-consistent).
    async fn create_private_space_managed(&self, params: Value, id: Value) -> RpcResponse {
        use crate::crypto::private_space::{
            encrypt_space_name, generate_space_key, wrap_space_key_for,
        };

        let params: CreatePrivateSpaceManagedParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };
        let name = params.name.trim();
        if name.is_empty() {
            return RpcResponse::error(RpcErrorCode::InvalidParams, "Space name required", id);
        }

        // The creator is the node's own identity.
        let creator_pk = self.node.keypair.public_key.0;
        let creator_hex = hex::encode(creator_pk);

        // Sponsorship gate (SPEC_11), same as the client-blob path.
        if let Err(response) = self.check_identity_sponsored(&creator_hex, &id) {
            return response;
        }

        // Node identity seed -> everything is derived from it, never exposed.
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);

        // Space key + wraps + encrypted name (all node-side).
        let space_key = generate_space_key();
        let creator_encrypted_key = match wrap_space_key_for(&space_key, &creator_pk, &seed) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to wrap space key: {}", e),
                    id,
                );
            }
        };
        let encrypted_name = encrypt_space_name(name, &space_key);

        let timestamp = crate::crypto::current_timestamp();

        // PoW config, bound to the RAW encrypted-name blob. The actual mining is
        // deferred to a background task (below): testnet SpaceCreation PoW takes
        // ~70s, far past any client RPC timeout, yet none of the values the client
        // needs (space_id, membership) depend on the solution — so we register the
        // space up front, return immediately, and let the miner fill in the
        // on-chain action asynchronously.
        let content_hash = crate::crypto::sha256(&encrypted_name);
        let config = match self.node.network.as_str() {
            "testnet" => ForkPoWConfig::testnet(),
            "regtest" => ForkPoWConfig::test(),
            _ => ForkPoWConfig::production(),
        };
        let network_mode = match self.node.network.as_str() {
            "testnet" => crate::network::NetworkMode::Testnet,
            "regtest" => crate::network::NetworkMode::Regtest,
            _ => crate::network::NetworkMode::Mainnet,
        };
        let difficulty =
            network_mode.adjusted_difficulty(config.get_difficulty(ActionType::SpaceCreation));
        let mut nonce_space = [0u8; 8];
        rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut nonce_space);
        let challenge = PoWChallenge {
            action_type: ActionType::SpaceCreation,
            content_hash,
            author_id: creator_pk,
            timestamp,
            difficulty,
            nonce_space,
        };
        // space_id = sha256(creator || encrypted_name || timestamp)[..16], mirroring
        // create_private_space's derivation (bound to the same encrypted-name blob).
        let mut space_id_input = Vec::new();
        space_id_input.extend_from_slice(&creator_pk);
        space_id_input.extend_from_slice(&encrypted_name);
        space_id_input.extend_from_slice(&timestamp.to_le_bytes());
        let space_hash = crate::crypto::sha256(&space_id_input);
        let space_id = apply_class(SpaceClass::Private, &space_hash);

        // Register the space locally (raw encrypted-name blob so the node can decrypt it).
        let space_info = crate::storage::chain::SpaceInfo {
            space_id,
            name: String::new(),
            description: None,
            creator: creator_pk,
            created_at: timestamp,
            pow_work: (1u64 << difficulty.min(63)) / 1000 + 1,
            is_private: true,
            encrypted_name: Some(encrypted_name.clone()),
            creator_encrypted_key: Some(creator_encrypted_key.clone()),
            key_version: 0,
        };
        if let Some(ref chain_store) = self.node.chain_store {
            if let Err(e) = chain_store.register_space(&space_info) {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to register space: {}", e),
                    id,
                );
            }
        }

        // Creator becomes admin; encrypted_space_key is the self-wrap so the node can
        // recover the space key on demand (invited_by = 0 => self).
        if let Some(ref membership_store) = self.node.membership_store {
            let member_record = crate::storage::membership::MemberRecord {
                member_pk: creator_pk,
                role: crate::storage::membership::MemberRole::Admin,
                joined_at: timestamp,
                invited_by: [0u8; 32],
                encrypted_space_key: creator_encrypted_key.clone(),
                key_version: 0,
            };
            if let Err(e) = membership_store.add_member(&space_id, &member_record) {
                warn!("Failed to add creator to membership store: {}", e);
            }
        }

        // Sign the CreateSpace action now (node-side signing over the same convention
        // the client used: create_private_space:<pubkey>:<timestamp>). The signature
        // is over identity + timestamp only — independent of the PoW solution — so we
        // sign here and hand the raw bytes to the background miner.
        let signing_msg =
            format!("create_private_space:{}:{}", creator_hex, timestamp).into_bytes();
        let signature_bytes = ed25519_sign(&self.node.keypair.private_key, &signing_msg).0;
        let display_name = self.node.identity_name.read().await.clone();

        // Mine the PoW + announce the action in the background. The space is already
        // registered and joined locally, so the RPC returns immediately; the miner
        // fills in the on-chain action once the (slow) argon2id PoW completes. This
        // keeps `create_private_space_managed` well under any client RPC timeout even
        // on testnet/mainnet where SpaceCreation PoW takes tens of seconds.
        let block_builder = self.node.block_builder.clone();
        let connection_pool = self.node.connection_pool.clone();
        let chain_store = self.node.chain_store.clone();
        tokio::spawn(async move {
            let solution =
                match tokio::task::spawn_blocking(move || compute_pow(&challenge, &config)).await {
                    Ok(Ok(s)) => s,
                    Ok(Err(e)) => {
                        warn!("[PRIVATE] Managed CreateSpace PoW failed: {}", e);
                        return;
                    }
                    Err(e) => {
                        warn!("[PRIVATE] Managed CreateSpace PoW task panicked: {}", e);
                        return;
                    }
                };

            let block_builder = match block_builder {
                Some(b) => b,
                None => return,
            };

            let pow_work = (1u64 << difficulty.min(63)) / 1000 + 1;
            let action = Action {
                action_type: crate::blocks::ActionType::CreateSpace,
                actor: creator_pk,
                timestamp,
                content_hash: Some(content_hash),
                parent_id: None,
                pow_nonce: solution.nonce,
                pow_work,
                pow_target: crate::crypto::sha256(hex::encode(solution.hash).as_bytes()),
                signature: signature_bytes,
                emoji: None,
                display_name,
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            let mut thread_id = [0u8; 32];
            thread_id[..16].copy_from_slice(&space_id);
            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path = match chain_store {
                Some(ref store) => crate::branch::BranchManager::new(store)
                    .resolve_mempool_branch_path(&space_id_32, &thread_id, Some(&creator_pk)),
                None => BranchPath::root(),
            };

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(thread_id, space_id_32, action.clone(), branch_path)
                }
                Err(e) => {
                    warn!("[BLOCKS] Failed to acquire block builder lock: {:?}", e);
                    false
                }
            };

            if added {
                if let Some(pool) = connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};
                    let action_data = action.serialize();
                    let payload = ActionAnnouncePayload::new(thread_id, space_id_32, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );
                    let sent = pool.broadcast(&envelope).await;
                    info!(
                        "[PRIVATE] Broadcast managed CreatePrivateSpace to {} peers",
                        sent
                    );
                }
            }
        });

        // Space is registered + joined locally and the action is being mined in the
        // background; broadcast reflects "not yet on the wire" (async).
        let result = CreatePrivateSpaceResult {
            space_id: hex::encode(space_id),
            space_id_bech32: encode_space_id(&space_id),
            broadcast: false,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Recover the space key for a private space the NODE is a member of, by
    /// unwrapping the node's own membership record with its identity seed. Never
    /// stores raw space keys at rest.
    fn node_space_key(&self, space_id: &[u8; 16]) -> Result<[u8; 32], (RpcErrorCode, String)> {
        let membership = self.node.membership_store.as_ref().ok_or((
            RpcErrorCode::InternalError,
            "membership store unavailable".to_string(),
        ))?;
        let me = self.node.keypair.public_key.0;
        let member = membership
            .get_member(space_id, &me)
            .map_err(|e| {
                (
                    RpcErrorCode::InternalError,
                    format!("membership lookup: {e}"),
                )
            })?
            .ok_or((
                RpcErrorCode::InvalidParams,
                "not a member of this private space".to_string(),
            ))?;
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);
        crate::crypto::private_space::unwrap_space_key(
            &member.encrypted_space_key,
            &member.invited_by,
            &me,
            &seed,
        )
        .map_err(|e| {
            (
                RpcErrorCode::InternalError,
                format!("recover space key: {e}"),
            )
        })
    }

    /// Space keys for every private space the node's identity is a member of. Used for
    /// trial-decryption of PRVM1 media on `get_media` so viewing works without the caller
    /// having to name the space — the AES-GCM tag authenticates the one correct key, and
    /// a non-member simply has no key that decrypts (opaque failure).
    fn node_member_space_keys(&self) -> Vec<[u8; 32]> {
        let Some(membership) = self.node.membership_store.as_ref() else {
            return Vec::new();
        };
        let me = self.node.keypair.public_key.0;
        let Ok(spaces) = membership.get_user_spaces(&me) else {
            return Vec::new();
        };
        spaces
            .iter()
            .filter_map(|sid| self.node_space_key(sid).ok())
            .collect()
    }

    /// Parse a hex 16-byte space id from a request field.
    /// Parse a private-space id (16 bytes) from EITHER the bech32m `sp1...` form or
    /// hex (8/32 chars), via the shared `decode_space_id`. Accepting both forms means
    /// a client can use a single id form uniformly across every private-space RPC
    /// (submit/list AND encrypt/decrypt/invite) instead of tracking which form each
    /// call happens to want — removing a whole class of client-side id-mixup bugs.
    fn parse_space_id_16(space_id: &str) -> Result<[u8; 16], (RpcErrorCode, String)> {
        decode_space_id(space_id).map_err(|e| {
            (
                RpcErrorCode::InvalidParams,
                format!("invalid space_id: {e}"),
            )
        })
    }

    /// Encrypt plaintext with a private space's key (node-managed mode). The client
    /// sends plaintext; the node returns `[PRIVATE:v1:...]` framed ciphertext to submit.
    async fn encrypt_private_content(&self, params: Value, id: Value) -> RpcResponse {
        let params: PrivateContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                )
            }
        };
        let space_id = match Self::parse_space_id_16(&params.space_id) {
            Ok(s) => s,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let key = match self.node_space_key(&space_id) {
            Ok(k) => k,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let ciphertext =
            crate::crypto::private_space::encrypt_content_with_space_key(&params.content, &key);
        RpcResponse::success(
            serde_json::to_value(PrivateContentResult {
                content: ciphertext,
            })
            .unwrap(),
            id,
        )
    }

    /// Decrypt `[PRIVATE:v1:...]` content with a private space's key (node-managed mode).
    async fn decrypt_private_content(&self, params: Value, id: Value) -> RpcResponse {
        let params: PrivateContentParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                )
            }
        };
        let space_id = match Self::parse_space_id_16(&params.space_id) {
            Ok(s) => s,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let key = match self.node_space_key(&space_id) {
            Ok(k) => k,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        match crate::crypto::private_space::decrypt_content_with_space_key(&params.content, &key) {
            Ok(plaintext) => RpcResponse::success(
                serde_json::to_value(PrivateContentResult { content: plaintext }).unwrap(),
                id,
            ),
            Err(e) => RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!("decryption failed: {e}"),
                id,
            ),
        }
    }

    /// Produce a SELF-CONTAINED invite blob (node-managed, out-of-band).
    ///
    /// The inviter's node recovers its space key, wraps it for the invitee's ed25519
    /// pubkey, and packs `{space_id, inviter, encrypted_name, encrypted_space_key}` into a
    /// shareable `swiminv1:<base64>` code. This is shared out-of-band (copy/paste/DM), so
    /// no network invite propagation is needed — the invitee redeems it with
    /// `redeem_space_invite`. Space CONTENT still syncs via normal block sync.
    async fn create_space_invite_blob(&self, params: Value, id: Value) -> RpcResponse {
        use base64::Engine as _;
        let params: CreateSpaceInviteBlobParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                )
            }
        };
        let space_id = match Self::parse_space_id_16(&params.space_id) {
            Ok(s) => s,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let invitee_pk: [u8; 32] = match hex::decode(&params.invitee) {
            Ok(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invitee: must be 32-byte hex",
                    id,
                )
            }
        };

        // Must be a member (admin/mod) of the space to invite others.
        let me = self.node.keypair.public_key.0;
        if let Some(ref ms) = self.node.membership_store {
            match ms.get_member(&space_id, &me) {
                Ok(Some(m)) if m.role != crate::storage::membership::MemberRole::Member => {}
                Ok(Some(_)) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Only admins and moderators can create invites",
                        id,
                    )
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "You are not a member of this space",
                        id,
                    )
                }
            }
        }

        // Recover the space key and wrap it for the invitee.
        let key = match self.node_space_key(&space_id) {
            Ok(k) => k,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);
        let encrypted_key =
            match crate::crypto::private_space::wrap_space_key_for(&key, &invitee_pk, &seed) {
                Ok(k) => k,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to wrap space key: {}", e),
                        id,
                    )
                }
            };

        // Carry the encrypted name so the invitee can show the space name on redeem.
        let enc_name = self
            .node
            .chain_store
            .as_ref()
            .and_then(|cs| cs.get_space(&space_id).ok().flatten())
            .and_then(|s| s.encrypted_name)
            .unwrap_or_default();

        let payload = serde_json::json!({
            "v": 1,
            "space_id": hex::encode(space_id),
            "inviter": hex::encode(me),
            "enc_name": hex::encode(&enc_name),
            "enc_key": hex::encode(&encrypted_key),
        });
        let blob = format!(
            "swiminv1:{}",
            base64::engine::general_purpose::STANDARD.encode(payload.to_string().as_bytes())
        );
        RpcResponse::success(
            serde_json::to_value(CreateSpaceInviteBlobResult { blob }).unwrap(),
            id,
        )
    }

    /// Redeem a `swiminv1:<base64>` invite blob: unwrap the space key (proving the blob
    /// is for us), register the space + membership locally so we can read/post. After
    /// this, `node_space_key` recovers the key on demand and content decrypts.
    async fn redeem_space_invite(&self, params: Value, id: Value) -> RpcResponse {
        use base64::Engine as _;
        let params: RedeemSpaceInviteParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                )
            }
        };
        let b64 = match params.blob.trim().strip_prefix("swiminv1:") {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Not a valid invite (expected swiminv1: prefix)",
                    id,
                )
            }
        };
        let json_bytes = match base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
            Ok(b) => b,
            Err(_) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Malformed invite blob", id)
            }
        };
        let v: Value = match serde_json::from_slice(&json_bytes) {
            Ok(v) => v,
            Err(_) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Malformed invite blob", id)
            }
        };
        let getb = |k: &str| -> Option<Vec<u8>> {
            v.get(k)
                .and_then(|x| x.as_str())
                .and_then(|s| hex::decode(s).ok())
        };
        let space_id: [u8; 16] = match getb("space_id") {
            Some(b) if b.len() == 16 => b.try_into().unwrap(),
            _ => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite: bad space_id", id)
            }
        };
        let inviter: [u8; 32] = match getb("inviter") {
            Some(b) if b.len() == 32 => b.try_into().unwrap(),
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite: bad inviter", id),
        };
        let enc_key = getb("enc_key").unwrap_or_default();
        let enc_name = getb("enc_name").unwrap_or_default();

        // Unwrap the space key with OUR seed — fails if this invite wasn't for us.
        let me = self.node.keypair.public_key.0;
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);
        let space_key =
            match crate::crypto::private_space::unwrap_space_key(&enc_key, &inviter, &me, &seed) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "This invite is not for your identity (could not unwrap the space key)",
                        id,
                    )
                }
            };
        let name = if enc_name.is_empty() {
            None
        } else {
            crate::crypto::private_space::decrypt_space_name(&enc_name, &space_key).ok()
        };

        let now = crate::crypto::current_timestamp();

        // Register the space locally (best-effort) so it shows in our private-space list.
        if let Some(ref cs) = self.node.chain_store {
            let space_info = crate::storage::chain::SpaceInfo {
                space_id,
                name: String::new(),
                description: None,
                creator: inviter,
                created_at: now,
                pow_work: 1,
                is_private: true,
                encrypted_name: if enc_name.is_empty() {
                    None
                } else {
                    Some(enc_name)
                },
                creator_encrypted_key: None,
                key_version: 0,
            };
            let _ = cs.register_space(&space_info);
        }

        // Store our membership with the wrapped key (invited_by = inviter) so
        // node_space_key can recover the key on demand.
        if let Some(ref ms) = self.node.membership_store {
            let member = crate::storage::membership::MemberRecord {
                member_pk: me,
                role: crate::storage::membership::MemberRole::Member,
                joined_at: now,
                invited_by: inviter,
                encrypted_space_key: enc_key,
                key_version: 0,
            };
            if let Err(e) = ms.add_member(&space_id, &member) {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to store membership: {}", e),
                    id,
                );
            }
        }

        RpcResponse::success(
            serde_json::to_value(RedeemSpaceInviteResult {
                space_id: hex::encode(space_id),
                space_id_bech32: encode_space_id(&space_id),
                name,
            })
            .unwrap(),
            id,
        )
    }

    /// Invite a user to a private space
    async fn invite_to_space(&self, params: Value, id: Value) -> RpcResponse {
        let params: InviteToSpaceParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse inviter public key
        let inviter_pk: [u8; 32] = match hex::decode(&params.inviter) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid inviter: must be 32-byte hex",
                    id,
                );
            }
        };

        // SPONSORSHIP CHECK: Verify inviter is sponsored before allowing invite
        if let Err(response) = self.check_identity_sponsored(&params.inviter, &id) {
            return response;
        }

        // Parse invitee public key
        let invitee_pk: [u8; 32] = match hex::decode(&params.invitee) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invitee: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse space ID
        let space_id: [u8; 16] = match hex::decode(&params.space_id) {
            Ok(bytes) if bytes.len() >= 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes[..16]);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid space_id: must be at least 16-byte hex",
                    id,
                );
            }
        };

        // Parse encrypted space key
        let encrypted_space_key: Vec<u8> = match hex::decode(&params.encrypted_space_key) {
            Ok(bytes) => bytes,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid encrypted_space_key: {}", e),
                    id,
                );
            }
        };

        // Validate encrypted_space_key length (max 1024 bytes to prevent DoS)
        if encrypted_space_key.len() > 1024 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invalid encrypted_space_key: exceeds maximum length of 1024 bytes",
                id,
            );
        }

        // Check that inviter is a member with invite permissions
        if let Some(ref membership_store) = self.node.membership_store {
            match membership_store.get_member(&space_id, &inviter_pk) {
                Ok(Some(member)) => {
                    if member.role == crate::storage::membership::MemberRole::Member {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Only admins and moderators can invite members",
                            id,
                        );
                    }
                }
                Ok(None) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Inviter is not a member of this space",
                        id,
                    );
                }
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to check membership: {}", e),
                        id,
                    );
                }
            }
        }

        // Verify PoW for invite
        // Note: Using Post difficulty for invites until Invite is added to action_pow
        if let Err((code, msg)) = verify_pow_submission(
            ActionType::Post, // TODO: Add ActionType::Invite to action_pow
            &invitee_pk,
            &params.inviter,
            params.pow_nonce,
            params.pow_difficulty,
            &params.pow_nonce_space,
            &params.pow_hash,
            params.timestamp,
            &self.node.network,
        ) {
            return RpcResponse::error(code, &msg, id);
        }

        // Create invite hash (deterministic)
        let mut invite_input = Vec::new();
        invite_input.extend_from_slice(&space_id);
        invite_input.extend_from_slice(&inviter_pk);
        invite_input.extend_from_slice(&invitee_pk);
        invite_input.extend_from_slice(&params.timestamp.to_le_bytes());
        let invite_hash = crate::crypto::sha256(&invite_input);

        // Store invite in membership store
        if let Some(ref membership_store) = self.node.membership_store {
            let invite_record = crate::storage::membership::InviteRecord {
                invite_hash,
                space_id,
                inviter_pk,
                invitee_pk,
                encrypted_space_key: encrypted_space_key.clone(),
                created_at: params.timestamp,
                expires_at: params.expires_at,
                status: crate::storage::membership::InviteStatus::Pending,
                message: params.message.and_then(|m| hex::decode(&m).ok()),
            };
            if let Err(e) = membership_store.add_invite(&invite_record) {
                warn!("Failed to store invite: {}", e);
            }
        }

        // Create and broadcast Invite action
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let mut signature_bytes = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes.copy_from_slice(&sig_bytes);
                }
            }

            let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;

            let action = Action {
                action_type: crate::blocks::ActionType::Invite,
                actor: inviter_pk,
                timestamp: params.timestamp,
                content_hash: Some(invite_hash), // Invite hash as content reference
                parent_id: Some({
                    let mut parent = [0u8; 32];
                    parent[..16].copy_from_slice(&space_id);
                    parent
                }),
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target: crate::crypto::sha256(params.pow_hash.as_bytes()),
                signature: signature_bytes,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            let mut thread_id = [0u8; 32];
            thread_id.copy_from_slice(&invite_hash);

            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path = self.resolve_branch_path(&space_id_32, &thread_id, Some(&inviter_pk));

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(thread_id, space_id_32, action.clone(), branch_path)
                }
                Err(_) => false,
            };

            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload = ActionAnnouncePayload::new(thread_id, space_id_32, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                }
            }
        }

        let result = InviteToSpaceResult {
            invite_hash: hex::encode(&invite_hash),
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Accept a pending invite to a private space
    async fn accept_invite(&self, params: Value, id: Value) -> RpcResponse {
        let params: AcceptInviteParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse acceptor public key
        let acceptor_pk: [u8; 32] = match hex::decode(&params.acceptor) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid acceptor: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse invite hash
        let invite_hash: [u8; 32] = match hex::decode(&params.invite_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invite_hash: must be 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get the invite
        let invite = match membership_store.get_invite(&invite_hash) {
            Ok(Some(inv)) => inv,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite not found", id);
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get invite: {}", e),
                    id,
                );
            }
        };

        // Verify acceptor is the invitee
        if invite.invitee_pk != acceptor_pk {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Only the invitee can accept this invite",
                id,
            );
        }

        // Check invite status
        if invite.status != crate::storage::membership::InviteStatus::Pending {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invite is no longer pending",
                id,
            );
        }

        // Check expiry
        if let Some(expires_at) = invite.expires_at {
            if params.timestamp > expires_at {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite has expired", id);
            }
        }

        // Update invite status
        if let Err(e) = membership_store.update_invite_status(
            &invite_hash,
            crate::storage::membership::InviteStatus::Accepted,
        ) {
            warn!("Failed to update invite status: {}", e);
        }

        // Add acceptor as member
        let member_record = crate::storage::membership::MemberRecord {
            member_pk: acceptor_pk,
            role: crate::storage::membership::MemberRole::Member,
            joined_at: params.timestamp,
            invited_by: invite.inviter_pk,
            encrypted_space_key: invite.encrypted_space_key,
            key_version: 0, // Will get current version from space
        };
        if let Err(e) = membership_store.add_member(&invite.space_id, &member_record) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to add member: {}", e),
                id,
            );
        }

        // Create and broadcast the accept action (no PoW required for accept per spec).
        // NOTE: The protocol has no dedicated AcceptInvite action type yet, so we reuse
        // ActionType::AcceptDM ("accept membership in a private space"): content_hash =
        // the invite hash being accepted, parent_id = the space joined. No consumer
        // currently interprets AcceptDM chain actions beyond generic indexing.
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let mut signature_bytes = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes.copy_from_slice(&sig_bytes);
                }
            }

            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&invite.space_id);

            let action = Action {
                action_type: crate::blocks::ActionType::AcceptDM,
                actor: acceptor_pk,
                timestamp: params.timestamp,
                content_hash: Some(invite_hash),
                parent_id: Some(space_id_32),
                pow_nonce: 0,
                pow_work: 0, // Accepting is free per SPEC validation rules
                pow_target: [0u8; 32],
                signature: signature_bytes,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // Accept joins the invite's thread branch (SPEC_08 §4)
            let branch_path =
                self.resolve_branch_path(&space_id_32, &invite_hash, Some(&acceptor_pk));

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(invite_hash, space_id_32, action.clone(), branch_path)
                }
                Err(_) => false,
            };

            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let payload =
                        ActionAnnouncePayload::new(invite_hash, space_id_32, action.serialize());
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                }
            }
        }

        let result = AcceptInviteResult {
            space_id: hex::encode(&invite.space_id),
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Node-managed invite to a private space (desktop mode).
    ///
    /// The inviter is the node's own identity. The node recovers the space key from its
    /// membership record, wraps it for the invitee with its identity seed (the client
    /// never touches the seed), mines PoW, and signs/broadcasts the invite. Mirrors
    /// `invite_to_space` for record creation / PoW / broadcast, but sources the
    /// `encrypted_space_key` node-side instead of from the client.
    async fn invite_to_space_managed(&self, params: Value, id: Value) -> RpcResponse {
        use crate::crypto::private_space::wrap_space_key_for;

        let params: InviteToSpaceManagedParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse space ID (16 bytes).
        let space_id = match Self::parse_space_id_16(&params.space_id) {
            Ok(s) => s,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };

        // Parse invitee public key (32 bytes).
        let invitee_pk: [u8; 32] = match hex::decode(&params.invitee) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invitee: must be 32-byte hex",
                    id,
                );
            }
        };

        // The inviter is the node's own identity.
        let inviter_pk = self.node.keypair.public_key.0;
        let inviter_hex = hex::encode(inviter_pk);

        // Sponsorship gate on the node's own identity.
        if let Err(response) = self.check_identity_sponsored(&inviter_hex, &id) {
            return response;
        }

        // The node must be an admin/mod member of the space (same rule as invite_to_space).
        if let Some(ref membership_store) = self.node.membership_store {
            match membership_store.get_member(&space_id, &inviter_pk) {
                Ok(Some(member)) => {
                    if member.role == crate::storage::membership::MemberRole::Member {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Only admins and moderators can invite members",
                            id,
                        );
                    }
                }
                Ok(None) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Inviter is not a member of this space",
                        id,
                    );
                }
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to check membership: {}", e),
                        id,
                    );
                }
            }
        }

        // Recover the node's space key and wrap it for the invitee (all node-side).
        let space_key = match self.node_space_key(&space_id) {
            Ok(k) => k,
            Err((c, m)) => return RpcResponse::error(c, &m, id),
        };
        let seed_slice = self.node.keypair.private_key.seed();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&seed_slice[..32]);
        let encrypted_space_key = match wrap_space_key_for(&space_key, &invitee_pk, &seed) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to wrap space key: {}", e),
                    id,
                );
            }
        };

        let timestamp = crate::crypto::current_timestamp();

        // Invite hash (deterministic), identical derivation to invite_to_space.
        let mut invite_input = Vec::new();
        invite_input.extend_from_slice(&space_id);
        invite_input.extend_from_slice(&inviter_pk);
        invite_input.extend_from_slice(&invitee_pk);
        invite_input.extend_from_slice(&timestamp.to_le_bytes());
        let invite_hash = crate::crypto::sha256(&invite_input);

        // Mine PoW node-side, bound to the invite hash. invite_to_space uses Post
        // difficulty for invites, so we do the same.
        let config = match self.node.network.as_str() {
            "testnet" => ForkPoWConfig::testnet(),
            "regtest" => ForkPoWConfig::test(),
            _ => ForkPoWConfig::production(),
        };
        let network_mode = match self.node.network.as_str() {
            "testnet" => crate::network::NetworkMode::Testnet,
            "regtest" => crate::network::NetworkMode::Regtest,
            _ => crate::network::NetworkMode::Mainnet,
        };
        let difficulty = network_mode.adjusted_difficulty(config.get_difficulty(ActionType::Post));
        let mut nonce_space = [0u8; 8];
        rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut nonce_space);
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: invite_hash,
            author_id: inviter_pk,
            timestamp,
            difficulty,
            nonce_space,
        };
        let solution = match compute_pow(&challenge, &config) {
            Ok(s) => s,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to mine PoW: {}", e),
                    id,
                );
            }
        };

        // Store the invite in the membership store (same as invite_to_space).
        if let Some(ref membership_store) = self.node.membership_store {
            let invite_record = crate::storage::membership::InviteRecord {
                invite_hash,
                space_id,
                inviter_pk,
                invitee_pk,
                encrypted_space_key: encrypted_space_key.clone(),
                created_at: timestamp,
                expires_at: params.expires_at,
                status: crate::storage::membership::InviteStatus::Pending,
                message: None,
            };
            if let Err(e) = membership_store.add_invite(&invite_record) {
                warn!("Failed to store invite: {}", e);
            }
        }

        // Sign + broadcast the Invite action node-side.
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let signing_msg = format!(
                "invite_to_space:{}:{}:{}",
                inviter_hex,
                hex::encode(invitee_pk),
                timestamp
            )
            .into_bytes();
            let signature = ed25519_sign(&self.node.keypair.private_key, &signing_msg);

            let pow_work = (1u64 << difficulty.min(63)) / 1000 + 1;
            let action = Action {
                action_type: crate::blocks::ActionType::Invite,
                actor: inviter_pk,
                timestamp,
                content_hash: Some(invite_hash),
                parent_id: Some({
                    let mut parent = [0u8; 32];
                    parent[..16].copy_from_slice(&space_id);
                    parent
                }),
                pow_nonce: solution.nonce,
                pow_work,
                pow_target: crate::crypto::sha256(hex::encode(solution.hash).as_bytes()),
                signature: signature.0,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            let mut thread_id = [0u8; 32];
            thread_id.copy_from_slice(&invite_hash);
            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path = self.resolve_branch_path(&space_id_32, &thread_id, Some(&inviter_pk));

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(thread_id, space_id_32, action.clone(), branch_path)
                }
                Err(_) => false,
            };

            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};
                    let action_data = action.serialize();
                    let payload = ActionAnnouncePayload::new(thread_id, space_id_32, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );
                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                    info!("[PRIVATE] Broadcast managed invite to {} peers", sent);
                }
            }
        }

        let result = InviteToSpaceResult {
            invite_hash: hex::encode(invite_hash),
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Node-managed accept of a pending invite (desktop mode).
    ///
    /// The acceptor is the node's own identity. The node stores its own MemberRecord
    /// with `encrypted_space_key` = the invite's wrapped key and `invited_by` = the
    /// inviter, so a later `node_space_key(&space_id)` recovers the space key via
    /// `unwrap_space_key` (sender = inviter). This is exactly the
    /// `node_invite_wrap_unwrap_round_trips` path. Mirrors `accept_invite` but sources
    /// the acceptor identity + signature node-side.
    async fn accept_invite_managed(&self, params: Value, id: Value) -> RpcResponse {
        let params: AcceptInviteManagedParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse invite hash.
        let invite_hash: [u8; 32] = match hex::decode(&params.invite_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invite_hash: must be 32-byte hex",
                    id,
                );
            }
        };

        // The acceptor is the node's own identity.
        let acceptor_pk = self.node.keypair.public_key.0;

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get the invite.
        let invite = match membership_store.get_invite(&invite_hash) {
            Ok(Some(inv)) => inv,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite not found", id);
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get invite: {}", e),
                    id,
                );
            }
        };

        // The node must be the invitee.
        if invite.invitee_pk != acceptor_pk {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "This node is not the invitee for this invite",
                id,
            );
        }

        // Check invite status.
        if invite.status != crate::storage::membership::InviteStatus::Pending {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invite is no longer pending",
                id,
            );
        }

        let timestamp = crate::crypto::current_timestamp();

        // Check expiry.
        if let Some(expires_at) = invite.expires_at {
            if timestamp > expires_at {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite has expired", id);
            }
        }

        // Update invite status.
        if let Err(e) = membership_store.update_invite_status(
            &invite_hash,
            crate::storage::membership::InviteStatus::Accepted,
        ) {
            warn!("Failed to update invite status: {}", e);
        }

        // Add the node as a member. Storing the invite's wrapped key + invited_by = the
        // inviter is the invariant that lets node_space_key recover the key later.
        let member_record = crate::storage::membership::MemberRecord {
            member_pk: acceptor_pk,
            role: crate::storage::membership::MemberRole::Member,
            joined_at: timestamp,
            invited_by: invite.inviter_pk,
            encrypted_space_key: invite.encrypted_space_key.clone(),
            key_version: 0,
        };
        if let Err(e) = membership_store.add_member(&invite.space_id, &member_record) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to add member: {}", e),
                id,
            );
        }

        // Sign + broadcast the accept action node-side (reusing AcceptDM like accept_invite).
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let signing_msg =
                format!("accept_invite:{}:{}", hex::encode(acceptor_pk), timestamp).into_bytes();
            let signature = ed25519_sign(&self.node.keypair.private_key, &signing_msg);

            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&invite.space_id);

            let action = Action {
                action_type: crate::blocks::ActionType::AcceptDM,
                actor: acceptor_pk,
                timestamp,
                content_hash: Some(invite_hash),
                parent_id: Some(space_id_32),
                pow_nonce: 0,
                pow_work: 0,
                pow_target: [0u8; 32],
                signature: signature.0,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // Accept joins the invite's thread branch (SPEC_08 §4)
            let branch_path =
                self.resolve_branch_path(&space_id_32, &invite_hash, Some(&acceptor_pk));

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(invite_hash, space_id_32, action.clone(), branch_path)
                }
                Err(_) => false,
            };

            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};
                    let payload =
                        ActionAnnouncePayload::new(invite_hash, space_id_32, action.serialize());
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );
                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                }
            }
        }

        let result = AcceptInviteResult {
            space_id: hex::encode(invite.space_id),
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Decline a pending invite to a private space
    async fn decline_invite(&self, params: Value, id: Value) -> RpcResponse {
        let params: DeclineInviteParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse decliner public key
        let decliner_pk: [u8; 32] = match hex::decode(&params.decliner) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid decliner: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse invite hash
        let invite_hash: [u8; 32] = match hex::decode(&params.invite_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid invite_hash: must be 32-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Get the invite
        let invite = match membership_store.get_invite(&invite_hash) {
            Ok(Some(inv)) => inv,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Invite not found", id);
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get invite: {}", e),
                    id,
                );
            }
        };

        // Verify decliner is the invitee
        if invite.invitee_pk != decliner_pk {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Only the invitee can decline this invite",
                id,
            );
        }

        // Check invite status
        if invite.status != crate::storage::membership::InviteStatus::Pending {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Invite is no longer pending",
                id,
            );
        }

        // Update invite status to declined
        if let Err(e) = membership_store.update_invite_status(
            &invite_hash,
            crate::storage::membership::InviteStatus::Declined,
        ) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to update invite status: {}", e),
                id,
            );
        }

        let result = DeclineInviteResult { success: true };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Leave a private space
    async fn leave_space(&self, params: Value, id: Value) -> RpcResponse {
        let params: LeaveSpaceParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse member public key
        let member_pk: [u8; 32] = match hex::decode(&params.member) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid member: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse space ID
        let space_id: [u8; 16] = match hex::decode(&params.space_id) {
            Ok(bytes) if bytes.len() >= 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes[..16]);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid space_id: must be at least 16-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Check that the user is a member
        match membership_store.get_member(&space_id, &member_pk) {
            Ok(Some(member)) => {
                // Admin cannot leave (they must transfer admin first or delete space)
                if member.role == crate::storage::membership::MemberRole::Admin {
                    // Check if there are other admins
                    let members = membership_store
                        .get_space_members(&space_id)
                        .unwrap_or_default();
                    let admin_count = members
                        .iter()
                        .filter(|m| m.role == crate::storage::membership::MemberRole::Admin)
                        .count();
                    if admin_count == 1 {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Cannot leave: you are the only admin. Transfer admin role first.",
                            id,
                        );
                    }
                }
            }
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "You are not a member of this space",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check membership: {}", e),
                    id,
                );
            }
        }

        // Remove member
        match membership_store.remove_member(&space_id, &member_pk) {
            Ok(true) => {}
            Ok(false) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Failed to remove member",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to remove member: {}", e),
                    id,
                );
            }
        }

        // Create and broadcast the Leave action (no PoW required for leave per spec)
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let mut signature_bytes = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes.copy_from_slice(&sig_bytes);
                }
            }

            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // Deterministic content hash for the leave event:
            // sha256(space_id || member_pk || timestamp)
            let mut leave_input = Vec::with_capacity(16 + 32 + 8);
            leave_input.extend_from_slice(&space_id);
            leave_input.extend_from_slice(&member_pk);
            leave_input.extend_from_slice(&params.timestamp.to_le_bytes());
            let leave_hash = crate::crypto::sha256(&leave_input);

            let action = Action {
                action_type: crate::blocks::ActionType::Leave,
                actor: member_pk,
                timestamp: params.timestamp,
                content_hash: Some(leave_hash),
                parent_id: Some(space_id_32),
                pow_nonce: 0,
                pow_work: 0, // Leaving is free per SPEC validation rules
                pow_target: [0u8; 32],
                signature: signature_bytes,
                emoji: None,
                display_name: self.node.identity_name.read().await.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // New thread: hash-derived branch placement (SPEC_08 §4)
            let branch_path = self.resolve_branch_path(&space_id_32, &leave_hash, Some(&member_pk));

            let added = match block_builder.write() {
                Ok(mut builder) => {
                    builder.add_action(leave_hash, space_id_32, action.clone(), branch_path)
                }
                Err(_) => false,
            };

            if added {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let payload =
                        ActionAnnouncePayload::new(leave_hash, space_id_32, action.serialize());
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let sent = pool.broadcast(&envelope).await;
                    broadcast = sent > 0;
                }
            }
        }

        let result = LeaveSpaceResult {
            success: true,
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Kick a member from a private space (admin only)
    ///
    /// This removes the member and triggers key rotation for security.
    /// The admin must provide new encrypted keys for all remaining members.
    async fn kick_member(&self, params: Value, id: Value) -> RpcResponse {
        let params: KickMemberParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse admin public key
        let admin_pk: [u8; 32] = match hex::decode(&params.admin) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid admin: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse member to kick
        let member_pk: [u8; 32] = match hex::decode(&params.member) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid member: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse space ID
        let space_id: [u8; 16] = match hex::decode(&params.space_id) {
            Ok(bytes) if bytes.len() >= 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes[..16]);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid space_id: must be at least 16-byte hex",
                    id,
                );
            }
        };

        let membership_store = match &self.node.membership_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Membership store not available",
                    id,
                );
            }
        };

        // Check that the admin has admin/mod role
        match membership_store.get_member(&space_id, &admin_pk) {
            Ok(Some(admin_member)) => {
                if admin_member.role != crate::storage::membership::MemberRole::Admin
                    && admin_member.role != crate::storage::membership::MemberRole::Moderator
                {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "You don't have permission to kick members",
                        id,
                    );
                }
            }
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "You are not a member of this space",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check membership: {}", e),
                    id,
                );
            }
        }

        // Check that the target is a member (and not admin if kicker is moderator)
        match membership_store.get_member(&space_id, &member_pk) {
            Ok(Some(target_member)) => {
                // Moderators can't kick admins or other moderators
                let admin_member = membership_store
                    .get_member(&space_id, &admin_pk)
                    .ok()
                    .flatten();
                if let Some(admin) = admin_member {
                    if admin.role == crate::storage::membership::MemberRole::Moderator
                        && target_member.role != crate::storage::membership::MemberRole::Member
                    {
                        return RpcResponse::error(
                            RpcErrorCode::InvalidParams,
                            "Moderators can only kick regular members",
                            id,
                        );
                    }
                }
            }
            Ok(None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Target is not a member of this space",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check membership: {}", e),
                    id,
                );
            }
        }

        // Cannot kick yourself
        if admin_pk == member_pk {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Cannot kick yourself. Use leave_space instead.",
                id,
            );
        }

        // Remove the member
        match membership_store.remove_member(&space_id, &member_pk) {
            Ok(false) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Failed to remove member",
                    id,
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to remove member: {}", e),
                    id,
                );
            }
            _ => {}
        }

        // Update keys for remaining members (key rotation)
        let remaining_members = membership_store
            .get_space_members(&space_id)
            .unwrap_or_default();
        // Build HashSet for O(1) lookup instead of O(n) linear search per key
        let remaining_member_pks: std::collections::HashSet<[u8; 32]> =
            remaining_members.iter().map(|m| m.member_pk).collect();
        let mut keys_updated = 0usize;

        for (member_hex, encrypted_key_hex) in &params.new_encrypted_keys {
            let member_bytes: [u8; 32] = match hex::decode(member_hex) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => continue,
            };

            let encrypted_key = match hex::decode(encrypted_key_hex) {
                Ok(bytes) => bytes,
                Err(_) => continue,
            };

            // Verify this member still exists (O(1) lookup via HashSet)
            if remaining_member_pks.contains(&member_bytes) {
                if let Ok(true) = membership_store.update_member_key(
                    &space_id,
                    &member_bytes,
                    encrypted_key,
                    params.key_version,
                ) {
                    keys_updated += 1;
                }
            }
        }

        // Create and broadcast Kick + KeyRotation actions
        let mut broadcast = false;
        if let Some(ref block_builder) = self.node.block_builder {
            let mut signature_bytes = [0u8; 64];
            if let Ok(sig_bytes) = hex::decode(&params.signature) {
                if sig_bytes.len() == 64 {
                    signature_bytes.copy_from_slice(&sig_bytes);
                }
            }

            let mut space_id_32 = [0u8; 32];
            space_id_32[..16].copy_from_slice(&space_id);

            // Kick and KeyRotation require basic PoW per SPEC validation rules
            let pow_work = (1u64 << params.pow_difficulty.min(63)) / 1000 + 1;
            let pow_target = crate::crypto::sha256(params.pow_hash.as_bytes());
            let display_name = self.node.identity_name.read().await.clone();

            // Kick action: content_hash = kicked member pubkey hash, parent_id = space_id
            let kick_hash = crate::crypto::sha256(&member_pk);
            let kick_action = Action {
                action_type: crate::blocks::ActionType::Kick,
                actor: admin_pk,
                timestamp: params.timestamp,
                content_hash: Some(kick_hash),
                parent_id: Some(space_id_32),
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target,
                signature: signature_bytes,
                emoji: None,
                display_name: display_name.clone(),
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // KeyRotation action: content_hash = hash of the rotation payload
            // (space_id || key_version || sorted encrypted keys), parent_id = space_id
            let mut rotation_input = Vec::new();
            rotation_input.extend_from_slice(&space_id);
            rotation_input.extend_from_slice(&params.key_version.to_le_bytes());
            let mut sorted_keys: Vec<(&String, &String)> =
                params.new_encrypted_keys.iter().collect();
            sorted_keys.sort_by(|a, b| a.0.cmp(b.0));
            for (_, encrypted_key) in &sorted_keys {
                if let Ok(bytes) = hex::decode(encrypted_key) {
                    rotation_input.extend_from_slice(&bytes);
                }
            }
            let rotation_hash = crate::crypto::sha256(&rotation_input);

            let rotation_action = Action {
                action_type: crate::blocks::ActionType::KeyRotation,
                actor: admin_pk,
                timestamp: params.timestamp,
                content_hash: Some(rotation_hash),
                parent_id: Some(space_id_32),
                pow_nonce: params.pow_nonce,
                pow_work,
                pow_target,
                signature: signature_bytes,
                emoji: None,
                display_name,
                media_refs: vec![],
                replaces_pending: None,
                private: false,
            };

            // New threads: hash-derived branch placement (SPEC_08 §4)
            let kick_branch = self.resolve_branch_path(&space_id_32, &kick_hash, Some(&admin_pk));
            let rotation_branch =
                self.resolve_branch_path(&space_id_32, &rotation_hash, Some(&admin_pk));

            // Add both actions to the mempool, then announce whichever were accepted
            let (added_kick, added_rotation) = match block_builder.write() {
                Ok(mut builder) => (
                    builder.add_action(kick_hash, space_id_32, kick_action.clone(), kick_branch),
                    builder.add_action(
                        rotation_hash,
                        space_id_32,
                        rotation_action.clone(),
                        rotation_branch,
                    ),
                ),
                Err(_) => (false, false),
            };

            if added_kick || added_rotation {
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let mut sent = 0usize;
                    if added_kick {
                        let payload = ActionAnnouncePayload::new(
                            kick_hash,
                            space_id_32,
                            kick_action.serialize(),
                        );
                        let envelope = MessageEnvelope::new_fork_agnostic(
                            MessageType::ActionAnnounce,
                            payload.to_bytes().to_vec(),
                        );
                        sent += pool.broadcast(&envelope).await;
                    }
                    if added_rotation {
                        let payload = ActionAnnouncePayload::new(
                            rotation_hash,
                            space_id_32,
                            rotation_action.serialize(),
                        );
                        let envelope = MessageEnvelope::new_fork_agnostic(
                            MessageType::ActionAnnounce,
                            payload.to_bytes().to_vec(),
                        );
                        sent += pool.broadcast(&envelope).await;
                    }
                    broadcast = sent > 0;
                }
            }
        }

        info!(
            "[KICK] Kicked {} from space {}, rotated {} keys to version {}, broadcast: {}",
            &params.member[..16],
            &params.space_id[..16],
            keys_updated,
            params.key_version,
            broadcast
        );

        let result = KickMemberResult {
            success: true,
            key_version: params.key_version,
            broadcast,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    // ========================================================================
    // Blocklist Management Methods (SPEC_12 §3.6)
    // ========================================================================

    /// List all entries in the local blocklist
    ///
    /// Returns every blocklist entry along with the current entry count and
    /// Merkle root, so clients can inspect (and diff) the local blocklist.
    async fn list_blocklist(&self, _params: Value, id: Value) -> RpcResponse {
        let blocklist = match &self.node.blocklist {
            Some(bl) => bl,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Blocklist store not available",
                    id,
                );
            }
        };

        let store = match blocklist.read() {
            Ok(store) => store,
            Err(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Blocklist store lock poisoned",
                    id,
                );
            }
        };

        let entries = match store.get_all() {
            Ok(entries) => entries,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to read blocklist: {}", e),
                    id,
                );
            }
        };

        let entries: Vec<BlocklistEntryInfo> = entries
            .iter()
            .map(|entry| BlocklistEntryInfo {
                content_hash: hex::encode(entry.content_hash),
                reason: entry.reason.name().to_string(),
                added_at: entry.added_at,
                source_node: hex::encode(entry.source_node),
                confirmations: entry.propagation_confirmations,
                attestation_count: entry.attestation_count() as u32,
            })
            .collect();

        let result = ListBlocklistResult {
            count: entries.len() as u32,
            merkle_root: hex::encode(store.merkle_root()),
            entries,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Add or remove a blocklist entry (local node administration)
    ///
    /// # Parameters
    /// - `action`: "add" or "remove"
    /// - `content_hash`: 32-byte hex SHA-256 hash of the content
    /// - `reason`: For "add": "csam", "terrorism", or "external_list" (default)
    async fn manage_blocklist(&self, params: Value, id: Value) -> RpcResponse {
        let params: ManageBlocklistParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let content_hash: [u8; 32] = match hex::decode(&params.content_hash) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid content_hash: must be 32-byte hex",
                    id,
                );
            }
        };

        let blocklist = match &self.node.blocklist {
            Some(bl) => bl,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Blocklist store not available",
                    id,
                );
            }
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut store = match blocklist.write() {
            Ok(store) => store,
            Err(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Blocklist store lock poisoned",
                    id,
                );
            }
        };

        match params.action.as_str() {
            "add" => {
                let reason = match params.reason.as_deref() {
                    None => BlocklistReason::ExternalList,
                    Some(r) => match r.to_ascii_lowercase().as_str() {
                        "csam" => BlocklistReason::CSAM,
                        "terrorism" => BlocklistReason::Terrorism,
                        "external_list" | "external" => BlocklistReason::ExternalList,
                        _ => {
                            return RpcResponse::error(
                                RpcErrorCode::InvalidParams,
                                "Invalid reason: expected csam, terrorism, or external_list",
                                id,
                            );
                        }
                    },
                };

                let entry = BlocklistEntry::new(
                    content_hash,
                    reason,
                    Vec::new(), // Manual admin entry: no attestations
                    *self.node.keypair.public_key.as_bytes(),
                    timestamp,
                );

                if let Err(e) = store.add(entry) {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Failed to add blocklist entry: {}", e),
                        id,
                    );
                }
                info!(
                    "[BLOCKLIST] Added {} (reason: {}) via RPC",
                    &params.content_hash[..16],
                    reason.name()
                );
            }
            "remove" => {
                if let Err(e) = store.remove(&content_hash, timestamp) {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Failed to remove blocklist entry: {}", e),
                        id,
                    );
                }
                info!("[BLOCKLIST] Removed {} via RPC", &params.content_hash[..16]);
            }
            other => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid action '{}': expected \"add\" or \"remove\"", other),
                    id,
                );
            }
        }

        let result = ManageBlocklistResult {
            success: true,
            action: params.action,
            content_hash: params.content_hash,
            count: store.count(),
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Bulk-import external hash-list entries into the blocklist (operator-only).
    ///
    /// Seeds `ExternalList`-family entries (SPEC_12 CSAM hash seeding). The
    /// caller supplies the list body inline (`list`) or a server-side file
    /// (`path`); the format is documented in the operator guide. Imported
    /// SHA-256 entries participate in gossip/bundles; SHA-1/MD5 digests are
    /// indexed for recompute-and-match at content ingest.
    ///
    /// This method is guarded by the RPC server's cookie authentication.
    async fn import_blocklist(&self, params: Value, id: Value) -> RpcResponse {
        let params: ImportBlocklistParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Resolve the list body: inline `list` wins, else read `path`.
        let body = match (params.list, params.path) {
            (Some(list), _) => list,
            (None, Some(path)) => match std::fs::read_to_string(&path) {
                Ok(contents) => contents,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Failed to read list file '{}': {}", path, e),
                        id,
                    );
                }
            },
            (None, None) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Provide either 'list' (inline) or 'path' (server-side file)",
                    id,
                );
            }
        };

        let records = match crate::blocklist::parse_import(&body) {
            Ok(r) => r,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Failed to parse import list: {}", e),
                    id,
                );
            }
        };

        let blocklist = match &self.node.blocklist {
            Some(bl) => bl,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Blocklist store not available",
                    id,
                );
            }
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut store = match blocklist.write() {
            Ok(store) => store,
            Err(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    "Blocklist store lock poisoned",
                    id,
                );
            }
        };

        let source_node = *self.node.keypair.public_key.as_bytes();
        let stats = match store.import_records(&records, source_node, timestamp) {
            Ok(s) => s,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Import failed: {}", e),
                    id,
                );
            }
        };

        info!(
            "[BLOCKLIST] Imported {} records via RPC: +{} sha256, +{} sha1, +{} md5, {} skipped",
            records.len(),
            stats.sha256_added,
            stats.sha1_indexed,
            stats.md5_indexed,
            stats.sha256_skipped
        );

        let result = ImportBlocklistResult {
            sha256_added: stats.sha256_added,
            sha256_skipped: stats.sha256_skipped,
            sha1_indexed: stats.sha1_indexed,
            md5_indexed: stats.md5_indexed,
            count: store.count(),
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    // ========================================================================
    // Behavioral Branching Methods (SPEC_13 Phase A / Phase 1 log-only rollout)
    // ========================================================================

    /// List recorded behavioral-branching events (`docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`
    /// Phase 1): would-be community formations detected while running in
    /// log-only mode. Optionally scoped to one space.
    ///
    /// Optional parameters:
    /// - `space_id`: restrict results to one space (32-byte hex)
    async fn list_behavioral_events(&self, params: Value, id: Value) -> RpcResponse {
        let params: ListBehavioralEventsParams = if params.is_null() {
            ListBehavioralEventsParams { space_id: None }
        } else {
            match serde_json::from_value(params) {
                Ok(p) => p,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Invalid params: {}", e),
                        id,
                    );
                }
            }
        };

        let chain_store = match &self.node.chain_store {
            Some(cs) => cs,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Chain store not available",
                    id,
                );
            }
        };

        let events = if let Some(space_id_hex) = &params.space_id {
            let space_id: [u8; 32] = match hex::decode(space_id_hex) {
                Ok(bytes) if bytes.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    arr
                }
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid space_id: must be 32-byte hex",
                        id,
                    );
                }
            };
            chain_store.get_space_behavioral_events(&space_id)
        } else {
            chain_store.get_all_behavioral_events()
        };

        let mut events = match events {
            Ok(events) => events,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to read behavioral events: {}", e),
                    id,
                );
            }
        };

        // Most recently detected first.
        events.sort_by(|a, b| {
            b.detected_height
                .cmp(&a.detected_height)
                .then_with(|| b.timestamp.cmp(&a.timestamp))
        });

        let events: Vec<BehavioralEventInfo> = events
            .iter()
            .map(|e| BehavioralEventInfo {
                event_id: hex::encode(e.event_id),
                space_id: hex::encode(e.parent_space_id),
                cluster_members: e.cluster_members.iter().map(hex::encode).collect(),
                engagement_diversity: e.metrics.engagement_diversity,
                external_interaction: e.metrics.external_interaction,
                internal_cohesion: e.metrics.internal_cohesion,
                member_count: e.metrics.member_count,
                age_blocks: e.metrics.age_blocks,
                detected_height: e.detected_height,
                timestamp: e.timestamp,
            })
            .collect();

        let result = ListBehavioralEventsResult {
            count: events.len() as u32,
            events,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    // ========================================================================
    // Space Lineage Methods (SPEC_13 Phase 2 — behavioral branching UX)
    // ========================================================================

    /// Resolve the display name for a parent space, if known locally.
    /// Registry names are non-consensus metadata; falls back to
    /// `space-<8 hex>` so composed names are always renderable.
    fn parent_display_name(
        chain_store: &ChainStore,
        parent_space_id: &[u8; 32],
    ) -> (Option<String>, String) {
        let mut parent_16 = [0u8; 16];
        parent_16.copy_from_slice(&parent_space_id[..16]);
        let known = chain_store
            .get_space(&parent_16)
            .ok()
            .flatten()
            .map(|info| info.name)
            .filter(|n| !n.is_empty());
        let label = known
            .clone()
            .unwrap_or_else(|| format!("space-{}", hex::encode(&parent_16[..4])));
        (known, label)
    }

    /// Check if `prefix` is a prefix of (or equal to) `other` in the branch
    /// tree (bitwise path comparison, mirrors BranchManager::is_prefix_of).
    fn branch_is_prefix_of(
        prefix: &crate::blocks::BranchPath,
        other: &crate::blocks::BranchPath,
    ) -> bool {
        if prefix.depth > other.depth {
            return false;
        }
        (0..prefix.depth).all(|d| {
            let byte_index = (d / 8) as usize;
            let bit_index = 7 - (d % 8);
            let p = prefix
                .path
                .get(byte_index)
                .map_or(0, |b| (b >> bit_index) & 1);
            let o = other
                .path
                .get(byte_index)
                .map_or(0, |b| (b >> bit_index) & 1);
            p == o
        })
    }

    /// Build the full lineage view for one community, including the
    /// moved-thread exposure (thread roots currently in the community's
    /// branch subtree) that parent-space views pin continuity banners on.
    fn build_child_info(
        chain_store: &ChainStore,
        lineage: &crate::branch::CommunityLineage,
        parent_label: &str,
    ) -> SpaceChildInfo {
        let mut child_16 = [0u8; 16];
        child_16.copy_from_slice(&lineage.community_id[..16]);
        let mut parent_16 = [0u8; 16];
        parent_16.copy_from_slice(&lineage.parent_space_id[..16]);

        // Locate the community's branch (if the fracture has executed
        // locally) and collect the threads in its subtree — exactly the
        // threads that moved. The subtree matters because a community
        // branch may size-fracture (SPEC_08) after formation.
        let mut branch_path_str: Option<String> = None;
        let mut moved_threads: Vec<String> = Vec::new();
        if let Ok(branches) = chain_store.get_community_branches(&lineage.parent_space_id) {
            if let Some((base, _)) = branches
                .iter()
                .find(|(_, cid)| cid == &lineage.community_id)
            {
                branch_path_str = Some(format!("{}:{}", base.depth, hex::encode(&base.path)));
                if let Ok(Some(state)) =
                    chain_store.get_space_branch_state(&lineage.parent_space_id)
                {
                    let mut thread_ids: Vec<[u8; 32]> = Vec::new();
                    for active in &state.active_branches {
                        if Self::branch_is_prefix_of(base, active) {
                            if let Ok(threads) =
                                chain_store.get_threads_in_branch(&lineage.parent_space_id, active)
                            {
                                thread_ids.extend(threads.into_iter().map(|(t, _)| t));
                            }
                        }
                    }
                    thread_ids.sort_unstable();
                    moved_threads = thread_ids
                        .iter()
                        .map(|t| format!("sha256:{}", hex::encode(t)))
                        .collect();
                }
            }
        }

        SpaceChildInfo {
            community_id: hex::encode(lineage.community_id),
            space_id: encode_space_id(&child_16),
            parent_space_id: encode_space_id(&parent_16),
            full_name: format!("{}/{}", parent_label, lineage.display_name),
            name: lineage.display_name.clone(),
            auto_name: lineage.auto_name.clone(),
            renamed: lineage.renamed_at.is_some(),
            formed_at: lineage.formation_timestamp,
            formation_height: lineage.formation_height,
            founding_member_count: lineage.founding_member_count,
            branch_path: branch_path_str,
            thread_count: moved_threads.len() as u64,
            moved_threads,
        }
    }

    /// Decode a space/community id param: 64-char hex resolves the full
    /// 32-byte id (required to address communities precisely); bech32
    /// (sp1...) and 16-byte hex forms are zero-padded like content-block
    /// space ids.
    fn decode_space_or_community_id(space_id: &str) -> Result<[u8; 32], String> {
        if space_id.len() == 64 && space_id.chars().all(|c| c.is_ascii_hexdigit()) {
            let bytes = hex::decode(space_id).map_err(|e| format!("Invalid hex: {}", e))?;
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            return Ok(arr);
        }
        let space_16 = decode_space_id(space_id)?;
        let mut arr = [0u8; 32];
        arr[..16].copy_from_slice(&space_16);
        Ok(arr)
    }

    /// get_space_lineage: parent + children (+ formation metadata) for a
    /// space or community (SPEC_13 Phase 2 Lane A #2/#3).
    async fn get_space_lineage(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetSpaceLineageParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };
        let chain_store: &ChainStore = match &self.node.chain_store {
            Some(cs) => cs.as_ref(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Chain store not available",
                    id,
                );
            }
        };

        let mut queried_32 = match Self::decode_space_or_community_id(&params.space_id) {
            Ok(v) => v,
            Err(e) => return RpcResponse::error(RpcErrorCode::InvalidParams, &e, id),
        };

        // If a 16-byte form was given, it may still address a community —
        // try to complete it from the per-parent community index.
        let mut own_lineage = chain_store
            .get_community_lineage(&queried_32)
            .unwrap_or(None);
        if own_lineage.is_none() && queried_32[16..] == [0u8; 16] {
            // Scan communities for a matching 16-byte prefix (bounded by the
            // number of communities on this node — small).
            if let Ok(all) = chain_store.get_all_community_lineages() {
                if let Some(lineage) = all
                    .into_iter()
                    .find(|l| l.community_id[..16] == queried_32[..16])
                {
                    queried_32 = lineage.community_id;
                    own_lineage = Some(lineage);
                }
            }
        }

        let mut queried_16 = [0u8; 16];
        queried_16.copy_from_slice(&queried_32[..16]);

        let (parent, community, name) = if let Some(lineage) = &own_lineage {
            // Queried id IS a community: expose its parent + own info.
            let (parent_name, parent_label) =
                Self::parent_display_name(chain_store, &lineage.parent_space_id);
            let mut parent_16 = [0u8; 16];
            parent_16.copy_from_slice(&lineage.parent_space_id[..16]);
            let info = Self::build_child_info(chain_store, lineage, &parent_label);
            (
                Some(SpaceLineageParent {
                    space_id: encode_space_id(&parent_16),
                    name: parent_name,
                }),
                Some(info),
                Some(lineage.display_name.clone()),
            )
        } else {
            let (own_name, _) = Self::parent_display_name(chain_store, &queried_32);
            (None, None, own_name)
        };

        // Children formed under the queried space (communities have no
        // children in Phase 2 — they cannot re-fracture behaviorally).
        let (_, own_label) = Self::parent_display_name(chain_store, &queried_32);
        let children: Vec<SpaceChildInfo> = chain_store
            .get_space_children(&queried_32)
            .unwrap_or_default()
            .iter()
            .map(|lineage| Self::build_child_info(chain_store, lineage, &own_label))
            .collect();

        let result = GetSpaceLineageResult {
            space_id: encode_space_id(&queried_16),
            name,
            parent,
            community,
            children,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// get_space_tree: the lineage tree for navigation (SPEC_13 Phase 2
    /// Lane A #2). Roots are locally registered public spaces; each carries
    /// its behavioral-community children.
    async fn get_space_tree(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetSpaceTreeParams = if params.is_null() {
            GetSpaceTreeParams::default()
        } else {
            match serde_json::from_value(params) {
                Ok(p) => p,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Invalid params: {}", e),
                        id,
                    );
                }
            }
        };
        let chain_store: &ChainStore = match &self.node.chain_store {
            Some(cs) => cs.as_ref(),
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Chain store not available",
                    id,
                );
            }
        };

        let build_node = |space_16: [u8; 16], name: Option<String>| -> SpaceTreeNode {
            let mut space_32 = [0u8; 32];
            space_32[..16].copy_from_slice(&space_16);
            let label = name
                .clone()
                .unwrap_or_else(|| format!("space-{}", hex::encode(&space_16[..4])));
            let children = chain_store
                .get_space_children(&space_32)
                .unwrap_or_default()
                .into_iter()
                .map(|lineage| {
                    let mut child_16 = [0u8; 16];
                    child_16.copy_from_slice(&lineage.community_id[..16]);
                    SpaceTreeNode {
                        space_id: encode_space_id(&child_16),
                        name: Some(format!("{}/{}", label, lineage.display_name)),
                        community_id: Some(hex::encode(lineage.community_id)),
                        formed_at: Some(lineage.formation_timestamp),
                        founding_member_count: Some(lineage.founding_member_count),
                        children: Vec::new(),
                    }
                })
                .collect();
            SpaceTreeNode {
                space_id: encode_space_id(&space_16),
                name,
                community_id: None,
                formed_at: None,
                founding_member_count: None,
                children,
            }
        };

        let roots: Vec<SpaceTreeNode> = if let Some(root_param) = &params.root {
            let root_32 = match Self::decode_space_or_community_id(root_param) {
                Ok(v) => v,
                Err(e) => return RpcResponse::error(RpcErrorCode::InvalidParams, &e, id),
            };
            let mut root_16 = [0u8; 16];
            root_16.copy_from_slice(&root_32[..16]);
            let name = chain_store
                .get_space(&root_16)
                .ok()
                .flatten()
                .map(|i| i.name)
                .filter(|n| !n.is_empty());
            vec![build_node(root_16, name)]
        } else {
            let mut roots = Vec::new();
            for result in chain_store.list_spaces() {
                let Ok(info) = result else { continue };
                // Skip private spaces (encrypted names) and nameless system
                // spaces — same visibility rule as list_spaces.
                if info.is_private || info.name.is_empty() {
                    continue;
                }
                roots.push(build_node(info.space_id, Some(info.name)));
            }
            roots.sort_by(|a, b| a.name.cmp(&b.name));
            roots
        };

        let result = GetSpaceTreeResult { roots };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    // ========================================================================
    // Notification Methods (SPEC_09 §7 / SPEC_13 Phase 2 CommunityFormed)
    // ========================================================================

    /// list_notifications: notifications for the local identity.
    async fn list_notifications(&self, params: Value, id: Value) -> RpcResponse {
        let params: ListNotificationsParams = if params.is_null() {
            ListNotificationsParams {
                unread_only: false,
                limit: 50,
            }
        } else {
            match serde_json::from_value(params) {
                Ok(p) => p,
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        &format!("Invalid params: {}", e),
                        id,
                    );
                }
            }
        };
        let Some(service) = &self.node.notification_service else {
            return RpcResponse::error(
                RpcErrorCode::SubsystemUnavailable,
                "Notification service not available",
                id,
            );
        };
        let identity = *self.node.keypair.public_key.as_bytes();

        let list = if params.unread_only {
            service.get_pending(&identity, params.limit)
        } else {
            service.get_all(&identity, params.limit)
        };
        let mut list = match list {
            Ok(l) => l,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to read notifications: {}", e),
                    id,
                );
            }
        };
        // Newest first.
        list.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));

        let unread_count = service.count_unread(&identity).unwrap_or(0);

        let notifications: Vec<NotificationInfo> = list
            .iter()
            .map(|n| {
                use crate::notification::NotificationContext;
                let type_tag = match n.notification_type {
                    crate::notification::NotificationType::Streak => "streak",
                    crate::notification::NotificationType::LevelUp => "level_up",
                    crate::notification::NotificationType::Achievement => "achievement",
                    crate::notification::NotificationType::SpaceHealth => "space_health",
                    crate::notification::NotificationType::ContentRisk => "content_risk",
                    crate::notification::NotificationType::ContributionThanks => {
                        "contribution_thanks"
                    }
                    crate::notification::NotificationType::CommunityFormed => "community_formed",
                };
                // Client-friendly context: community ids as hex/bech32
                // strings; other contexts pass through serde.
                let context = n.context.as_ref().map(|ctx| match ctx {
                    NotificationContext::CommunityFormed {
                        parent_space_id,
                        community_id,
                        auto_name,
                        founding_member_count,
                    } => {
                        let mut parent_16 = [0u8; 16];
                        parent_16.copy_from_slice(&parent_space_id[..16]);
                        let mut child_16 = [0u8; 16];
                        child_16.copy_from_slice(&community_id[..16]);
                        serde_json::json!({
                            "parent_space_id": encode_space_id(&parent_16),
                            "parent_space_id_hex": hex::encode(parent_space_id),
                            "community_id": hex::encode(community_id),
                            "community_space_id": encode_space_id(&child_16),
                            "auto_name": auto_name,
                            "founding_member_count": founding_member_count,
                        })
                    }
                    other => serde_json::to_value(other).unwrap_or(Value::Null),
                });
                NotificationInfo {
                    id: hex::encode(n.id),
                    notification_type: type_tag.to_string(),
                    message: n.message.clone(),
                    created_at_ms: n.created_at_ms,
                    read: n.read,
                    context,
                }
            })
            .collect();

        let result = ListNotificationsResult {
            notifications,
            unread_count,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// mark_notification_read: mark one (or all) local notifications read.
    async fn mark_notification_read(&self, params: Value, id: Value) -> RpcResponse {
        let params: MarkNotificationReadParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };
        let Some(service) = &self.node.notification_service else {
            return RpcResponse::error(
                RpcErrorCode::SubsystemUnavailable,
                "Notification service not available",
                id,
            );
        };
        let identity = *self.node.keypair.public_key.as_bytes();

        if params.all {
            return match service.mark_all_read(&identity) {
                Ok(count) => RpcResponse::success(serde_json::json!({ "marked": count }), id),
                Err(e) => RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to mark notifications read: {}", e),
                    id,
                ),
            };
        }

        let Some(notification_id_hex) = &params.notification_id else {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "notification_id required (or set all: true)",
                id,
            );
        };
        let notification_id: [u8; 16] = match hex::decode(notification_id_hex) {
            Ok(bytes) if bytes.len() == 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid notification_id: must be 16-byte hex",
                    id,
                );
            }
        };
        match service.mark_read(&identity, notification_id) {
            Ok(marked) => RpcResponse::success(serde_json::json!({ "marked": marked }), id),
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to mark notification read: {}", e),
                id,
            ),
        }
    }

    // ========================================================================
    // Sponsorship Methods
    // ========================================================================

    /// Register a genesis identity (must be in hardcoded genesis list)
    async fn register_genesis_identity(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list;
        use crate::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
        use crate::types::identity::PublicKey;

        let params: RegisterGenesisIdentityParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse identity pubkey
        let identity_bytes: [u8; 32] = match hex::decode(&params.identity_pubkey) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid identity_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };

        let pubkey = PublicKey::from_bytes(identity_bytes);

        // Check if identity is in hardcoded genesis list
        if !is_in_hardcoded_genesis_list(&pubkey) {
            return RpcResponse::error(
                RpcErrorCode::PermissionDenied,
                "Identity is not in the hardcoded genesis list",
                id,
            );
        }

        // Get sponsorship store
        let sponsorship_store = match &self.node.sponsorship_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Sponsorship store not available",
                    id,
                );
            }
        };

        // Check if already registered
        match sponsorship_store.exists(&pubkey) {
            Ok(true) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Identity is already registered",
                    id,
                );
            }
            Ok(false) => {}
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check identity: {}", e),
                    id,
                );
            }
        }

        // Create genesis sponsorship record
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let sponsorship = StoredSponsorship {
            sponsored_identity: pubkey,
            sponsor: None, // Genesis has no sponsor
            creation_timestamp: current_time,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth: 0, // Genesis is depth 0
            probationary: false,
            probation_expires: None,
            positive_contribution_score: 0,
            is_genesis: true,
            orphaned_at: None,
        };

        // Store the sponsorship
        if let Err(e) = sponsorship_store.put(&sponsorship) {
            return RpcResponse::error(
                RpcErrorCode::StorageError,
                &format!("Failed to store genesis sponsorship: {}", e),
                id,
            );
        }

        info!(
            "[SPONSORSHIP] Registered genesis identity: {} slot {}",
            params.identity_pubkey, params.slot_number
        );

        // SPEC_11 Phase 6: Create on-chain GenesisRegister action and add to block builder
        {
            use crate::blocks::action::Action;

            let action = Action::new_genesis_register(
                identity_bytes,
                current_time,
                [0u8; 64], // No PoW signature for sponsorship actions
            );

            // System space ID (all zeros) for sponsorship actions
            let system_space_id = [0u8; 32];
            let action_hash = action.hash();

            if let Some(ref block_builder) = self.node.block_builder {
                // New thread in the system space: hash-derived branch (SPEC_08 §4)
                let branch_path =
                    self.resolve_branch_path(&system_space_id, &action_hash, Some(&identity_bytes));
                match block_builder.write() {
                    Ok(mut builder) => {
                        let added = builder.add_action(
                            action_hash,
                            system_space_id,
                            action.clone(),
                            branch_path,
                        );
                        if added {
                            info!("[SPONSORSHIP] Added GenesisRegister action to block builder");
                        }
                    }
                    Err(e) => {
                        warn!("[SPONSORSHIP] Failed to acquire block builder lock for GenesisRegister: {:?}", e);
                    }
                }

                // Broadcast to peers
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload =
                        ActionAnnouncePayload::new(action_hash, system_space_id, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let peers = pool.peer_ids().await;
                    for peer_id in peers {
                        if let Err(e) = pool.send_to(&peer_id, &envelope).await {
                            log::debug!(
                                "[SPONSORSHIP] Failed to broadcast GenesisRegister to peer {}: {}",
                                hex::encode(&peer_id[..8]),
                                e
                            );
                        }
                    }
                    info!("[SPONSORSHIP] Broadcast GenesisRegister action to peers");
                }
            }
        }

        let result = RegisterGenesisIdentityResult {
            success: true,
            identity_pubkey: params.identity_pubkey,
            slot_number: params.slot_number,
            message: "Genesis identity registered successfully".to_string(),
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Register a new sponsored identity
    ///
    /// The sponsor must be an existing sponsored identity in good standing.
    async fn register_sponsored_identity(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::{
            SponsorshipStatus, StoredSponsorship, PROBATION_PERIOD_SECONDS,
            TIMESTAMP_TOLERANCE_SECONDS,
        };
        use crate::types::identity::PublicKey;

        let params: RegisterSponsoredIdentityParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse new identity pubkey
        let new_identity_bytes: [u8; 32] = match hex::decode(&params.new_identity_pubkey) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid new_identity_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };
        let new_pubkey = PublicKey::from_bytes(new_identity_bytes);

        // Parse sponsor pubkey
        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };
        let sponsor_pubkey = PublicKey::from_bytes(sponsor_bytes);

        // Parse sponsor signature
        let signature_bytes: [u8; 64] = match hex::decode(&params.sponsor_signature) {
            Ok(bytes) if bytes.len() == 64 => {
                let mut arr = [0u8; 64];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_signature: must be 64-byte hex",
                    id,
                );
            }
        };

        // Verify timestamp is within tolerance
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp is too far in the future",
                id,
            );
        }
        if current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS {
            return RpcResponse::error(RpcErrorCode::InvalidParams, "Timestamp is too old", id);
        }

        // Verify onboarding PoW: derive pow_work from the caller's nonce rather than
        // trusting a supplied number, and require at least 1 leading zero byte. A
        // pow=0 Sponsor action can't cross the block-formation threshold or advance
        // cumulative_pow, so it strands on a quiet chain and never finalizes — reject
        // it at the source so onboarding always carries real work (also anti-spam).
        let pow_nonce_space: [u8; 32] = match params
            .pow_nonce_space
            .as_ref()
            .and_then(|s| hex::decode(s).ok())
            .and_then(|b| <[u8; 32]>::try_from(b).ok())
        {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Missing/invalid pow_nonce_space: onboarding requires proof-of-work",
                    id,
                );
            }
        };
        let pow_work = {
            use sha2::{Digest, Sha256};
            let mut input = Vec::with_capacity(40);
            input.extend_from_slice(&pow_nonce_space);
            input.extend_from_slice(&params.pow_nonce.to_le_bytes());
            let hash = Sha256::digest(&input);
            hash.iter().take_while(|&&b| b == 0).count() as u64
        };
        if pow_work < 1 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Insufficient proof-of-work for sponsorship (need >= 1 leading zero byte)",
                id,
            );
        }

        // Get sponsorship store
        let sponsorship_store = match &self.node.sponsorship_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Sponsorship store not available",
                    id,
                );
            }
        };

        // Check new identity is not already registered
        match sponsorship_store.exists(&new_pubkey) {
            Ok(true) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Identity is already registered",
                    id,
                );
            }
            Ok(false) => {}
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check identity: {}", e),
                    id,
                );
            }
        }

        // Get sponsor's sponsorship record, or check if they're in genesis list
        let sponsor_sponsorship = match sponsorship_store.get(&sponsor_pubkey) {
            Ok(Some(s)) => Some(s),
            Ok(None) => {
                // Genesis identities can sponsor even without a store record
                if crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&sponsor_pubkey) {
                    None // Genesis identity - no store record needed
                } else {
                    return RpcResponse::error(
                        RpcErrorCode::PermissionDenied,
                        "Sponsor is not a registered identity",
                        id,
                    );
                }
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get sponsor info: {}", e),
                    id,
                );
            }
        };

        // Check sponsor can sponsor (not revoked/orphaned/under penalty)
        // Genesis identities (None) can always sponsor
        if let Some(ref sponsorship) = sponsor_sponsorship {
            if !sponsorship.can_sponsor_basic(current_time) {
                return RpcResponse::error(
                    RpcErrorCode::PermissionDenied,
                    "Sponsor cannot sponsor new identities (may be under penalty, revoked, or orphaned)",
                    id,
                );
            }
        }

        // Verify sponsor's signature over (new_identity_pubkey || timestamp)
        let mut message = Vec::with_capacity(40);
        message.extend_from_slice(&new_identity_bytes);
        message.extend_from_slice(&params.timestamp.to_be_bytes());

        // Verify signature using ed25519
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        let verifying_key = match VerifyingKey::from_bytes(&sponsor_bytes) {
            Ok(k) => k,
            Err(_) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor public key",
                    id,
                );
            }
        };
        let signature = Signature::from_bytes(&signature_bytes);
        if verifying_key.verify(&message, &signature).is_err() {
            return RpcResponse::error(
                RpcErrorCode::InvalidSignature,
                "Invalid sponsor signature",
                id,
            );
        }

        // Calculate depth (genesis identities have depth 0, so children get depth 1)
        let depth = match &sponsor_sponsorship {
            Some(s) => s.depth.saturating_add(1),
            None => 1, // Genesis sponsor - direct children have depth 1
        };

        // Create sponsorship record
        let sponsorship = StoredSponsorship {
            sponsored_identity: new_pubkey,
            sponsor: Some(sponsor_pubkey),
            creation_timestamp: current_time,
            status: SponsorshipStatus::Active,
            penalty_until: None,
            depth,
            probationary: params.probationary,
            probation_expires: if params.probationary {
                Some(current_time + PROBATION_PERIOD_SECONDS)
            } else {
                None
            },
            positive_contribution_score: 0,
            is_genesis: false,
            orphaned_at: None,
        };

        // Store the sponsorship
        if let Err(e) = sponsorship_store.put(&sponsorship) {
            return RpcResponse::error(
                RpcErrorCode::StorageError,
                &format!("Failed to store sponsorship: {}", e),
                id,
            );
        }

        info!(
            "[SPONSORSHIP] Registered sponsored identity: {} by {} (depth {})",
            params.new_identity_pubkey, params.sponsor_pubkey, depth
        );

        // SPEC_11 Phase 6: Create on-chain Sponsor action and add to block builder
        {
            use crate::blocks::action::Action;

            // Carry the verified PoW: pow_target is the challenge space (matches the
            // claim path), pow_work is the value the node derived above — not a
            // client-supplied number.
            let action = Action::new_sponsor_with_pow(
                sponsor_bytes,
                new_identity_bytes,
                current_time,
                signature_bytes,
                params.pow_nonce,
                pow_work,
                pow_nonce_space,
            );

            // System space ID (all zeros) for sponsorship actions
            let system_space_id = [0u8; 32];
            let action_hash = action.hash();

            if let Some(ref block_builder) = self.node.block_builder {
                // New thread in the system space: hash-derived branch (SPEC_08 §4)
                let branch_path =
                    self.resolve_branch_path(&system_space_id, &action_hash, Some(&sponsor_bytes));
                match block_builder.write() {
                    Ok(mut builder) => {
                        let added = builder.add_action(
                            action_hash,
                            system_space_id,
                            action.clone(),
                            branch_path,
                        );
                        if added {
                            info!("[SPONSORSHIP] Added Sponsor action to block builder");
                        }
                    }
                    Err(e) => {
                        warn!(
                            "[SPONSORSHIP] Failed to acquire block builder lock for Sponsor: {:?}",
                            e
                        );
                    }
                }

                // Broadcast to peers
                if let Some(ref pool) = self.node.connection_pool {
                    use crate::network::messages::ActionAnnouncePayload;
                    use crate::types::network::{MessageEnvelope, MessageType};

                    let action_data = action.serialize();
                    let payload =
                        ActionAnnouncePayload::new(action_hash, system_space_id, action_data);
                    let envelope = MessageEnvelope::new_fork_agnostic(
                        MessageType::ActionAnnounce,
                        payload.to_bytes().to_vec(),
                    );

                    let peers = pool.peer_ids().await;
                    for peer_id in peers {
                        if let Err(e) = pool.send_to(&peer_id, &envelope).await {
                            log::debug!(
                                "[SPONSORSHIP] Failed to broadcast Sponsor to peer {}: {}",
                                hex::encode(&peer_id[..8]),
                                e
                            );
                        }
                    }
                    info!("[SPONSORSHIP] Broadcast Sponsor action to peers");
                }
            }
        }

        let result = RegisterSponsoredIdentityResult {
            success: true,
            identity_pubkey: params.new_identity_pubkey,
            sponsor_pubkey: params.sponsor_pubkey,
            depth,
            message: if params.probationary {
                "Identity registered with probationary sponsorship".to_string()
            } else {
                "Identity registered successfully".to_string()
            },
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Get sponsorship information for an identity
    async fn get_sponsorship_info(&self, params: Value, id: Value) -> RpcResponse {
        use crate::types::identity::PublicKey;

        let params: GetSponsorshipInfoParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse identity pubkey
        let identity_bytes: [u8; 32] = match hex::decode(&params.identity_pubkey) {
            Ok(bytes) if bytes.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid identity_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };
        let pubkey = PublicKey::from_bytes(identity_bytes);

        // Get sponsorship store
        let sponsorship_store = match &self.node.sponsorship_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Sponsorship store not available",
                    id,
                );
            }
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        match sponsorship_store.get(&pubkey) {
            Ok(Some(sponsorship)) => {
                let status_str = match sponsorship.status {
                    crate::sponsorship::types::SponsorshipStatus::Active => "Active",
                    crate::sponsorship::types::SponsorshipStatus::Orphaned => "Orphaned",
                    crate::sponsorship::types::SponsorshipStatus::Restricted => "Restricted",
                    crate::sponsorship::types::SponsorshipStatus::Revoked => "Revoked",
                };

                let result = SponsorshipInfo {
                    is_sponsored: true,
                    status: Some(status_str.to_string()),
                    sponsor_pubkey: sponsorship.sponsor.map(|pk| hex::encode(pk.as_bytes())),
                    depth: sponsorship.depth,
                    is_genesis: sponsorship.is_genesis,
                    is_under_penalty: sponsorship.is_under_penalty(current_time),
                    probationary: sponsorship.probationary,
                    created_at: Some(sponsorship.creation_timestamp),
                };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Ok(None) => {
                // Check mempool for pending Sponsor action (SPEC_11 §3.11).
                // Best-effort: use try_read so a busy block builder (its write lock held
                // during heavy initial sync) never blocks this RPC past the client's
                // timeout — skip the pending-mempool check instead of stalling.
                if let Some(ref block_builder) = self.node.block_builder {
                    if let Ok(builder) = block_builder.try_read() {
                        use crate::blocks::action::ActionType;
                        let pending_actions = builder.get_pending_actions();
                        for (_thread_id, _space_id, action) in pending_actions {
                            if action.action_type == ActionType::Sponsor {
                                if let Some(sponsee_bytes) = action.content_hash {
                                    if sponsee_bytes == identity_bytes {
                                        log::debug!(
                                            "[SPONSORSHIP] Found pending sponsorship in mempool for {}",
                                            params.identity_pubkey
                                        );
                                        let result = SponsorshipInfo {
                                            is_sponsored: true,
                                            status: Some("Pending".to_string()),
                                            sponsor_pubkey: Some(hex::encode(action.actor)),
                                            depth: 0, // Unknown until on-chain
                                            is_genesis: false,
                                            is_under_penalty: false,
                                            probationary: false, // Unknown until on-chain
                                            created_at: Some(action.timestamp),
                                        };
                                        return RpcResponse::success(
                                            serde_json::to_value(result).unwrap(),
                                            id,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }

                // Check hardcoded genesis list (SPEC_11 §3.9)
                if crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&pubkey) {
                    let result = SponsorshipInfo {
                        is_sponsored: true,
                        status: Some("Active".to_string()),
                        sponsor_pubkey: None, // Genesis identities have no sponsor
                        depth: 0,
                        is_genesis: true,
                        is_under_penalty: false,
                        probationary: false,
                        created_at: None,
                    };
                    return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                }

                // In regtest mode, all identities are considered sponsored for easier testing
                // This allows creating spaces/content without needing to set up sponsorship chains
                if self.node.network == "regtest" {
                    log::debug!(
                        "[SPONSORSHIP] Regtest mode: auto-sponsoring identity {}",
                        params.identity_pubkey
                    );
                    let result = SponsorshipInfo {
                        is_sponsored: true,
                        status: Some("Active".to_string()),
                        sponsor_pubkey: None, // Auto-sponsored in regtest
                        depth: 0,
                        is_genesis: false,
                        is_under_penalty: false,
                        probationary: false,
                        created_at: None,
                    };
                    return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                }

                let result = SponsorshipInfo {
                    is_sponsored: false,
                    status: None,
                    sponsor_pubkey: None,
                    depth: 0,
                    is_genesis: false,
                    is_under_penalty: false,
                    probationary: false,
                    created_at: None,
                };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to get sponsorship info: {}", e),
                id,
            ),
        }
    }

    // ========================================================================
    // Sponsorship Offer Lifecycle Methods
    // ========================================================================

    /// List active sponsorship offers (public, no auth required)
    async fn list_sponsorship_offers(&self, params: Value, id: Value) -> RpcResponse {
        let params: ListSponsorshipOffersParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let offer_store = match &self.node.offer_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                );
            }
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let limit = params.limit.min(100);

        // Optional type filter
        let offers_result = if let Some(ref type_str) = params.offer_type {
            let offer_type = match type_str.as_str() {
                "open" => crate::sponsorship::types::SponsorshipOfferType::Open,
                "probationary" => crate::sponsorship::types::SponsorshipOfferType::Probationary,
                _ => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "offer_type must be 'open' or 'probationary'",
                        id,
                    );
                }
            };
            offer_store
                .filter_by_type(offer_type, current_time)
                .map(|offers| {
                    let total = offers.len();
                    let has_more = total > params.offset + limit;
                    let page: Vec<_> = offers.into_iter().skip(params.offset).take(limit).collect();
                    (page, total, has_more)
                })
        } else {
            offer_store
                .list_active_offers_paginated(current_time, params.offset, limit)
                .map(|(page, has_more)| {
                    let total = if has_more {
                        params.offset + page.len() + 1
                    } else {
                        params.offset + page.len()
                    };
                    (page, total, has_more)
                })
        };

        match offers_result {
            Ok((offers, total, has_more)) => {
                let summaries: Vec<SponsorshipOfferSummary> = offers
                    .iter()
                    .map(|o| {
                        let claimed = offer_store.get_claimed_count(&o.offer_id).unwrap_or(0);
                        let type_str = match o.offer_type {
                            crate::sponsorship::types::SponsorshipOfferType::Open => "open",
                            crate::sponsorship::types::SponsorshipOfferType::Probationary => {
                                "probationary"
                            }
                            crate::sponsorship::types::SponsorshipOfferType::Conditional => {
                                "conditional"
                            }
                        };
                        SponsorshipOfferSummary {
                            offer_id: hex::encode(o.offer_id),
                            sponsor_pubkey: hex::encode(o.sponsor.as_bytes()),
                            offer_type: type_str.to_string(),
                            slots_total: o.max_sponsees,
                            slots_remaining: o.max_sponsees.saturating_sub(claimed),
                            expires_at: o.expires_at,
                            created_at: o.created_at,
                            requirements: SponsorshipOfferRequirements {
                                min_pow_difficulty: o.requirements.min_pow_difficulty,
                                application_required: o.requirements.application_required,
                            },
                            auto_approve: o.auto_approve,
                        }
                    })
                    .collect();

                let result = ListSponsorshipOffersResult {
                    offers: summaries,
                    total,
                    has_more,
                };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to list offers: {}", e),
                id,
            ),
        }
    }

    /// Get a single sponsorship offer with optional pending claims (if caller is sponsor)
    async fn get_sponsorship_offer(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetSponsorshipOfferParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let offer_store = match &self.node.offer_store {
            Some(store) => store,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                );
            }
        };

        let offer_id_bytes: [u8; 16] = match hex::decode(&params.offer_id) {
            Ok(b) if b.len() == 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid offer_id: must be 16-byte hex",
                    id,
                );
            }
        };

        match offer_store.get_offer(&offer_id_bytes) {
            Ok(Some(offer)) => {
                let claimed = offer_store.get_claimed_count(&offer_id_bytes).unwrap_or(0);
                let type_str = match offer.offer_type {
                    crate::sponsorship::types::SponsorshipOfferType::Open => "open",
                    crate::sponsorship::types::SponsorshipOfferType::Probationary => "probationary",
                    crate::sponsorship::types::SponsorshipOfferType::Conditional => "conditional",
                };

                // Only show pending claims if caller is the sponsor
                let pending_claims = if let Some(ref caller) = params.caller_pubkey {
                    let sponsor_hex = hex::encode(offer.sponsor.as_bytes());
                    if caller == &sponsor_hex {
                        offer_store
                            .get_pending_claims(&offer_id_bytes)
                            .unwrap_or_default()
                            .into_iter()
                            .map(|c| PendingClaimDetail {
                                claimant_pubkey: hex::encode(c.claimant.as_bytes()),
                                claimed_at: c.claimed_at,
                                application_text: c.application_text,
                            })
                            .collect()
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                };

                let result = GetSponsorshipOfferResult {
                    offer_id: hex::encode(offer.offer_id),
                    sponsor_pubkey: hex::encode(offer.sponsor.as_bytes()),
                    offer_type: type_str.to_string(),
                    slots_total: offer.max_sponsees,
                    slots_remaining: offer.max_sponsees.saturating_sub(claimed),
                    expires_at: offer.expires_at,
                    created_at: offer.created_at,
                    requirements: SponsorshipOfferRequirements {
                        min_pow_difficulty: offer.requirements.min_pow_difficulty,
                        application_required: offer.requirements.application_required,
                    },
                    auto_approve: offer.auto_approve,
                    pending_claims,
                };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Ok(None) => RpcResponse::error(RpcErrorCode::InvalidParams, "Offer not found", id),
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to get offer: {}", e),
                id,
            ),
        }
    }

    /// Create a new sponsorship offer (requires signature auth)
    async fn create_sponsorship_offer(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::{
            PublicSponsorshipOffer, SponsorshipOfferType, SponsorshipRequirements,
            TIMESTAMP_TOLERANCE_SECONDS,
        };
        use crate::types::identity::{PublicKey, Signature};

        let params: CreateSponsorshipOfferParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Validate slots
        if params.slots < 1 || params.slots > 10 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "slots must be between 1 and 10",
                id,
            );
        }

        // Validate expires_days
        if params.expires_days < 1 || params.expires_days > 365 {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "expires_days must be between 1 and 365",
                id,
            );
        }

        // Floor the PoW requirement so claimants can't onboard with a sub-byte
        // (pow_work=0) proof. Below one full leading zero byte the Sponsor action
        // carries no usable work and strands on a quiet chain; also anti-spam.
        if params.min_pow_difficulty < crate::sponsorship::types::MIN_OFFER_POW_DIFFICULTY_BITS {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                &format!(
                    "min_pow_difficulty must be >= {} bits (onboarding requires real proof-of-work)",
                    crate::sponsorship::types::MIN_OFFER_POW_DIFFICULTY_BITS
                ),
                id,
            );
        }

        // Parse offer type
        let offer_type = match params.offer_type.as_str() {
            "open" => SponsorshipOfferType::Open,
            "probationary" => SponsorshipOfferType::Probationary,
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "offer_type must be 'open' or 'probationary'",
                    id,
                );
            }
        };

        // Parse sponsor pubkey
        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse signature
        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut arr = [0u8; 64];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature: must be 64-byte hex",
                    id,
                );
            }
        };

        // Timestamp validation
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        // Verify sponsor is Active
        let sponsorship_store = match &self.node.sponsorship_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Sponsorship store not available",
                    id,
                );
            }
        };

        let sponsor_pk = PublicKey::from_bytes(sponsor_bytes);
        match sponsorship_store.get(&sponsor_pk) {
            Ok(Some(record)) => {
                if !record.can_sponsor_basic(current_time) {
                    return RpcResponse::error(
                        RpcErrorCode::PermissionDenied,
                        "Sponsor cannot create offers (not active or under penalty)",
                        id,
                    );
                }
            }
            Ok(None) => {
                // Fall back to checking hardcoded genesis list (SPEC_11 §3.9)
                // Genesis identities can sponsor without being in the sponsorship store
                if !crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&sponsor_pk) {
                    return RpcResponse::error(
                        RpcErrorCode::PermissionDenied,
                        "Sponsor is not a registered identity",
                        id,
                    );
                }
                log::info!(
                    "[SPONSORSHIP] Sponsor {} is in hardcoded genesis list",
                    hex::encode(sponsor_bytes)
                );
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check sponsor: {}", e),
                    id,
                );
            }
        }

        // Generate offer_id from hash.
        //
        // created_at/expires_at MUST be anchored to the client's signed
        // `params.timestamp`, NOT server `current_time`: peers re-verify a
        // propagated offer via `signature_message()`, which derives the signed
        // timestamp from `created_at`. If we stored server time here, that
        // reconstruction would differ from what the sponsor actually signed, so
        // every other node would reject the offer's signature and it would never
        // propagate (the creating node keeps it because it verified against
        // params.timestamp at creation). The tolerance check above bounds the
        // skew between params.timestamp and current_time to a few minutes.
        let expires_at = params.timestamp + (params.expires_days as u64) * 86400;
        let offer_id: [u8; 16] = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(&sponsor_bytes);
            hasher.update(&current_time.to_be_bytes());
            hasher.update(&[params.slots]);
            let hash = hasher.finalize();
            let mut id_arr = [0u8; 16];
            id_arr.copy_from_slice(&hash[..16]);
            id_arr
        };

        let requirements = SponsorshipRequirements {
            min_pow_difficulty: params.min_pow_difficulty,
            required_attester: None,
            application_required: params.application_required,
        };

        // Build signature message for verification using client-controlled fields only
        // Format: "swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) ||
        //         expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)
        let sig_msg = PublicSponsorshipOffer::signature_message_for_creation(
            &sponsor_bytes,
            params.slots,
            &offer_type,
            params.expires_days,
            params.min_pow_difficulty,
            params.application_required,
            params.timestamp,
        );
        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let vk = match VerifyingKey::from_bytes(&sponsor_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid sponsor public key",
                        id,
                    );
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid sponsor signature",
                    id,
                );
            }
        }

        // Build the offer struct now that signature is verified
        let offer = PublicSponsorshipOffer {
            sponsor: sponsor_pk,
            offer_id,
            // Must equal the signed timestamp (see expires_at note above), so the
            // signature re-verifies when the offer propagates to other nodes.
            created_at: params.timestamp,
            expires_at,
            max_sponsees: params.slots,
            offer_type,
            requirements,
            signature: Signature::from_bytes(sig_bytes),
            auto_approve: params.auto_approve,
        };

        // Store the offer
        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                );
            }
        };

        if let Err(e) = offer_store.create_offer(&offer) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to create offer: {}", e),
                id,
            );
        }

        // Broadcast offer to network peers (SPEC_11 §3.11)
        if let Some(ref pool) = self.node.connection_pool {
            use crate::sponsorship::wire::serialize_offer;
            use crate::types::network::{MessageEnvelope, MessageType};

            if let Ok(offer_bytes) = serialize_offer(&offer) {
                let mut payload = offer_bytes;
                payload.push(3); // TTL = 3 hops
                let envelope = MessageEnvelope::new(
                    MessageType::SponsorshipOffer,
                    [0u8; 32], // fork-agnostic
                    payload,
                );
                let sent = pool.broadcast(&envelope).await;
                log::debug!(
                    "[SPONSORSHIP] Broadcast new offer {} to {} peers",
                    hex::encode(&offer_id[..8]),
                    sent
                );
            }
        }

        info!(
            "[SPONSORSHIP] Created offer {} by {} ({} slots, expires in {} days, auto_approve={})",
            hex::encode(offer_id),
            params.sponsor_pubkey,
            params.slots,
            params.expires_days,
            params.auto_approve
        );

        let result = CreateSponsorshipOfferResult {
            offer_id: hex::encode(offer_id),
            expires_at,
            slots: params.slots,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Claim a sponsorship offer (requires signature from claimant)
    async fn claim_sponsorship_offer(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::{SponsorshipClaim, TIMESTAMP_TOLERANCE_SECONDS};
        use crate::types::identity::{IdentityCreationProof, PublicKey, Signature};

        let params: ClaimSponsorshipOfferParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse offer_id
        let offer_id_bytes: [u8; 16] = match hex::decode(&params.offer_id) {
            Ok(b) if b.len() == 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid offer_id: must be 16-byte hex",
                    id,
                );
            }
        };

        // Parse claimant pubkey
        let claimant_bytes: [u8; 32] = match hex::decode(&params.claimant_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid claimant_pubkey: must be 32-byte hex",
                    id,
                );
            }
        };

        // Parse signature
        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut arr = [0u8; 64];
                arr.copy_from_slice(&b);
                arr
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid signature: must be 64-byte hex",
                    id,
                );
            }
        };

        // Timestamp validation
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        // Validate application text length
        if let Some(ref text) = params.application_text {
            if text.len() > 2000 {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Application text must be 2000 characters or less",
                    id,
                );
            }
        }

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                );
            }
        };

        // Check offer exists and is not expired
        let offer = match offer_store.get_offer(&offer_id_bytes) {
            Ok(Some(o)) => o,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Offer not found", id);
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get offer: {}", e),
                    id,
                );
            }
        };

        if offer.is_expired(current_time) {
            return RpcResponse::error(RpcErrorCode::InvalidParams, "This offer has expired", id);
        }

        // Check claimant is not already sponsored
        if let Some(ref sponsorship_store) = self.node.sponsorship_store {
            let claimant_pk = PublicKey::from_bytes(claimant_bytes);
            match sponsorship_store.exists(&claimant_pk) {
                Ok(true) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "You are already sponsored",
                        id,
                    );
                }
                Ok(false) => {}
                Err(e) => {
                    return RpcResponse::error(
                        RpcErrorCode::InternalError,
                        &format!("Failed to check sponsorship: {}", e),
                        id,
                    );
                }
            }
        }

        // Check claimant hasn't already claimed this offer
        let claimant_pk = PublicKey::from_bytes(claimant_bytes);
        match offer_store.has_claimed(&offer_id_bytes, &claimant_pk) {
            Ok(true) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "You have already claimed this offer",
                    id,
                );
            }
            Ok(false) => {}
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to check existing claim: {}", e),
                    id,
                );
            }
        }

        // Parse PoW fields
        let pow_hash_bytes: [u8; 32] = params
            .pow_hash
            .as_ref()
            .and_then(|h| hex::decode(h).ok())
            .and_then(|b| {
                if b.len() == 32 {
                    let mut a = [0u8; 32];
                    a.copy_from_slice(&b);
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap_or([0u8; 32]);

        let pow_nonce_space_bytes: [u8; 32] = params
            .pow_nonce_space
            .as_ref()
            .and_then(|h| hex::decode(h).ok())
            .and_then(|b| {
                if b.len() == 32 {
                    let mut a = [0u8; 32];
                    a.copy_from_slice(&b);
                    Some(a)
                } else {
                    None
                }
            })
            .unwrap_or([0u8; 32]);

        // Validate claimant PoW: sha256(pow_nonce_space || pow_nonce) must have
        // sufficient leading zero BITS meeting the offer's min_pow_difficulty
        // (or a minimum of 1 if the offer specifies 0). Difficulty is measured
        // in bits everywhere else in the protocol (identity PoW, action PoW,
        // offer_validation::count_leading_zero_bits) — this check previously
        // counted zero BYTES, making it 8x stricter than the block-level
        // validation of the same offer field and rejecting honest claims.
        {
            use sha2::{Digest, Sha256};
            let min_difficulty = if offer.requirements.min_pow_difficulty > 0 {
                offer.requirements.min_pow_difficulty as u32
            } else {
                1 // Network minimum: at least 1 leading zero bit
            };

            let mut pow_input = Vec::with_capacity(40);
            pow_input.extend_from_slice(&pow_nonce_space_bytes);
            pow_input.extend_from_slice(&params.pow_nonce.to_le_bytes());
            let computed_hash = Sha256::digest(&pow_input);
            let mut actual_zero_bits = 0u32;
            for byte in computed_hash.iter() {
                if *byte == 0 {
                    actual_zero_bits += 8;
                } else {
                    actual_zero_bits += byte.leading_zeros();
                    break;
                }
            }

            if actual_zero_bits < min_difficulty {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!(
                        "Insufficient proof-of-work: need {} leading zero bits, got {}",
                        min_difficulty, actual_zero_bits
                    ),
                    id,
                );
            }
        }

        // Verify claimant signature
        // Build signature message: offer_id(16) + claimant(32) + claimed_at(8 BE) + pow_hash(32)
        let mut sig_msg = Vec::with_capacity(88);
        sig_msg.extend_from_slice(&offer_id_bytes);
        sig_msg.extend_from_slice(&claimant_bytes);
        sig_msg.extend_from_slice(&params.timestamp.to_be_bytes());
        sig_msg.extend_from_slice(&pow_hash_bytes);

        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let vk = match VerifyingKey::from_bytes(&claimant_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid claimant public key",
                        id,
                    );
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid claimant signature",
                    id,
                );
            }
        }

        // Check application text requirement
        if offer.requirements.application_required && params.application_text.is_none() {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "This offer requires application text",
                id,
            );
        }

        // Create and store the claim.
        //
        // claimed_at MUST be the client's *signed* `params.timestamp`, not server
        // `current_time`: the claimant signs a message containing this timestamp
        // (verified above via params.timestamp), and peers re-verify a propagated
        // claim through `SponsorshipClaim::signature_message()`, which derives the
        // signed timestamp from `claimed_at`. Storing server time here makes the
        // signature fail on every other node, so the claim never reaches the
        // sponsor (they see 0 pending claims) and auto-approve onboarding stalls —
        // the same class of bug fixed for offer created_at. The tolerance check
        // above bounds the skew.
        let claim = SponsorshipClaim {
            offer_id: offer_id_bytes,
            claimant: claimant_pk,
            claimed_at: params.timestamp,
            identity_pow_proof: IdentityCreationProof {
                public_key: claimant_pk,
                timestamp: params.timestamp,
                nonce: params.pow_nonce,
                pow_hash: pow_hash_bytes,
            },
            pow_nonce_space: pow_nonce_space_bytes,
            application_text: params.application_text,
            attestation_signature: None,
            claimant_signature: Signature::from_bytes(sig_bytes),
            sponsor_approval: None,
        };

        if let Err(e) = offer_store.submit_claim(&claim) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to submit claim: {}", e),
                id,
            );
        }

        // Broadcast claim to network peers so sponsor can see it
        if let Some(ref pool) = self.node.connection_pool {
            use crate::sponsorship::wire::serialize_claim;
            use crate::types::network::{MessageEnvelope, MessageType};

            if let Ok(claim_bytes) = serialize_claim(&claim) {
                let envelope = MessageEnvelope::new(
                    MessageType::SponsorshipOfferClaim,
                    [0u8; 32], // fork-agnostic
                    claim_bytes,
                );
                let sent = pool.broadcast(&envelope).await;
                info!(
                    "[SPONSORSHIP] Broadcast claim {} to {} peers",
                    hex::encode(&offer_id_bytes[..8]),
                    sent
                );
            }
        }

        info!(
            "[SPONSORSHIP] Claim submitted: {} claims offer {}",
            params.claimant_pubkey, params.offer_id
        );

        // SWIM-INV-1: auto-approve offers are approved immediately at claim time,
        // turning invite-link onboarding into a single step. The on-chain Sponsor
        // action requires a signature from the sponsor over
        // (claimant(32) || timestamp(8 BE)), so instant approval is only possible
        // when this node holds the sponsor identity (i.e. the offer was created by
        // this node's identity). Otherwise the claim stays pending as usual.
        if offer.auto_approve {
            if self.node.keypair.public_key.as_bytes() == offer.sponsor.as_bytes() {
                // Sign the exact message approve_sponsorship_claim expects the
                // sponsor's client to sign, then run the same internal approval
                // path the approve RPC uses.
                let mut approval_msg = Vec::with_capacity(40);
                approval_msg.extend_from_slice(&claimant_bytes);
                approval_msg.extend_from_slice(&current_time.to_be_bytes());
                let approval_sig =
                    crate::identity::sign(&self.node.keypair.private_key, &approval_msg);
                let approval_sig_bytes: [u8; 64] = *approval_sig.as_bytes();

                match self
                    .execute_claim_approval(
                        &offer,
                        &claim,
                        approval_sig_bytes,
                        current_time,
                        current_time,
                    )
                    .await
                {
                    Ok((depth, probationary)) => {
                        let claimant_address =
                            crate::crypto::address::encode_address_from_pubkey(&claimant_pk);

                        info!(
                            "[SPONSORSHIP] Auto-approved claim: {} sponsored by {} (depth={}, offer {})",
                            params.claimant_pubkey,
                            hex::encode(offer.sponsor.as_bytes()),
                            depth,
                            params.offer_id
                        );

                        let result = ClaimSponsorshipOfferResult {
                            offer_id: params.offer_id,
                            status: "approved".to_string(),
                            message: "Invite accepted — you are now sponsored.".to_string(),
                            claimant_address: Some(claimant_address),
                            depth: Some(depth),
                            probationary: Some(probationary),
                        };
                        return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                    }
                    Err((code, msg)) => {
                        // Auto-approval failed (e.g. no remaining slots or sponsor
                        // restricted). Remove the pending claim so the claimant is
                        // not left waiting on an approval that will never come.
                        let _ = offer_store.remove_claim(&offer_id_bytes, &claimant_pk);
                        return RpcResponse::error(code, &msg, id);
                    }
                }
            } else {
                log::warn!(
                    "[SPONSORSHIP] Offer {} is auto_approve but this node does not hold \
                     the sponsor identity; claim left pending",
                    params.offer_id
                );
            }
        }

        let result = ClaimSponsorshipOfferResult {
            offer_id: params.offer_id,
            status: "pending".to_string(),
            message: "Claim submitted. The sponsor will review your request.".to_string(),
            claimant_address: None,
            depth: None,
            probationary: None,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Execute the chain-side effects of approving a sponsorship claim.
    ///
    /// This is the single internal approval path (SWIM-INV-1), shared by:
    /// - `approve_sponsorship_claim` — the sponsor calls in with their own
    ///   approval signature, and
    /// - `claim_sponsorship_offer` — when the offer has `auto_approve` set and
    ///   this node holds the sponsor identity, the node signs the same message
    ///   and approves immediately.
    ///
    /// `sponsor_sig_bytes` MUST be a valid Ed25519 signature by `offer.sponsor`
    /// over (claimant(32) || timestamp(8 BE)): it is embedded in the on-chain
    /// Sponsor action and independently re-verified by every node in
    /// `apply_sponsorship_actions_from_block`, so the action carries the same
    /// `timestamp` the signature covers.
    ///
    /// Slot capacity is enforced atomically (sled fetch_and_update) before any
    /// other side effect, so concurrent claims cannot over-claim an offer.
    /// Returns (depth, probationary) on success.
    async fn execute_claim_approval(
        &self,
        offer: &crate::sponsorship::types::PublicSponsorshipOffer,
        claim: &crate::sponsorship::types::SponsorshipClaim,
        sponsor_sig_bytes: [u8; 64],
        timestamp: u64,
        current_time: u64,
    ) -> Result<(u8, bool), (RpcErrorCode, String)> {
        use crate::sponsorship::auto_approve::{self, ClaimApprovalError};

        let offer_store = self.node.offer_store.as_ref().ok_or((
            RpcErrorCode::SubsystemUnavailable,
            "Offer store not available".to_string(),
        ))?;
        let sponsorship_store = self.node.sponsorship_store.as_ref().ok_or((
            RpcErrorCode::SubsystemUnavailable,
            "Sponsorship store not available".to_string(),
        ))?;

        auto_approve::execute_claim_approval(
            offer_store,
            sponsorship_store,
            self.node.chain_store.as_ref(),
            self.node.block_builder.as_ref(),
            self.node.connection_pool.as_ref(),
            offer,
            claim,
            sponsor_sig_bytes,
            timestamp,
            current_time,
        )
        .await
        .map_err(|e| match e {
            ClaimApprovalError::SponsorNotFound | ClaimApprovalError::SponsorRestricted => {
                (RpcErrorCode::PermissionDenied, e.to_string())
            }
            ClaimApprovalError::NoSlots(_) => (RpcErrorCode::InvalidParams, e.to_string()),
            ClaimApprovalError::Store(_) => (RpcErrorCode::InternalError, e.to_string()),
        })
    }

    /// Approve a pending sponsorship claim (sponsor only)
    async fn approve_sponsorship_claim(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::TIMESTAMP_TOLERANCE_SECONDS;
        use crate::types::identity::PublicKey;

        let params: ApproveSponsorshipClaimParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        // Parse IDs
        let offer_id_bytes: [u8; 16] = match hex::decode(&params.offer_id) {
            Ok(b) if b.len() == 16 => {
                let mut a = [0u8; 16];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid offer_id", id),
        };
        let claimant_bytes: [u8; 32] = match hex::decode(&params.claimant_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid claimant_pubkey",
                    id,
                )
            }
        };
        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey",
                    id,
                )
            }
        };
        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut a = [0u8; 64];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid signature", id),
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                )
            }
        };

        // Verify offer exists and sponsor owns it
        let offer = match offer_store.get_offer(&offer_id_bytes) {
            Ok(Some(o)) => o,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Offer not found", id)
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get offer: {}", e),
                    id,
                )
            }
        };

        if offer.sponsor.as_bytes() != &sponsor_bytes {
            return RpcResponse::error(
                RpcErrorCode::PermissionDenied,
                "You are not the sponsor of this offer",
                id,
            );
        }

        // Verify claim exists
        let claimant_pk = PublicKey::from_bytes(claimant_bytes);
        let _claim = match offer_store.get_claim(&offer_id_bytes, &claimant_pk) {
            Ok(Some(c)) => c,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Claim not found", id)
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get claim: {}", e),
                    id,
                )
            }
        };

        // Verify sponsor signature over (claimant(32) || timestamp(8 BE))
        let mut sig_msg = Vec::with_capacity(40);
        sig_msg.extend_from_slice(&claimant_bytes);
        sig_msg.extend_from_slice(&params.timestamp.to_be_bytes());
        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let vk = match VerifyingKey::from_bytes(&sponsor_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid sponsor key",
                        id,
                    )
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid sponsor signature",
                    id,
                );
            }
        }

        // Run the shared approval path (sponsor checks, atomic slot claim,
        // on-chain Sponsor action + broadcast)
        let (depth, probationary) = match self
            .execute_claim_approval(&offer, &_claim, sig_bytes, params.timestamp, current_time)
            .await
        {
            Ok(v) => v,
            Err((code, msg)) => return RpcResponse::error(code, &msg, id),
        };

        info!(
            "[SPONSORSHIP] Approved claim: {} sponsored by {} (depth={})",
            params.claimant_pubkey, params.sponsor_pubkey, depth
        );

        // Generate address
        let claimant_address = crate::crypto::address::encode_address_from_pubkey(
            &PublicKey::from_bytes(claimant_bytes),
        );

        let result = ApproveSponsorshipClaimResult {
            claimant_pubkey: params.claimant_pubkey,
            claimant_address,
            depth,
            probationary,
            status: "Active".to_string(),
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Reject a pending sponsorship claim (sponsor only)
    async fn reject_sponsorship_claim(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::TIMESTAMP_TOLERANCE_SECONDS;
        use crate::types::identity::PublicKey;

        let params: RejectSponsorshipClaimParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let offer_id_bytes: [u8; 16] = match hex::decode(&params.offer_id) {
            Ok(b) if b.len() == 16 => {
                let mut a = [0u8; 16];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid offer_id", id),
        };
        let claimant_bytes: [u8; 32] = match hex::decode(&params.claimant_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid claimant_pubkey",
                    id,
                )
            }
        };
        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey",
                    id,
                )
            }
        };
        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut a = [0u8; 64];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid signature", id),
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                )
            }
        };

        // Verify offer exists and sponsor owns it
        let offer = match offer_store.get_offer(&offer_id_bytes) {
            Ok(Some(o)) => o,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Offer not found", id)
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get offer: {}", e),
                    id,
                )
            }
        };

        if offer.sponsor.as_bytes() != &sponsor_bytes {
            return RpcResponse::error(
                RpcErrorCode::PermissionDenied,
                "You are not the sponsor of this offer",
                id,
            );
        }

        // Verify signature
        let mut sig_msg = Vec::with_capacity(40);
        sig_msg.extend_from_slice(&claimant_bytes);
        sig_msg.extend_from_slice(&params.timestamp.to_be_bytes());
        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let vk = match VerifyingKey::from_bytes(&sponsor_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid sponsor key",
                        id,
                    )
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid sponsor signature",
                    id,
                );
            }
        }

        // Remove the claim
        let claimant_pk = PublicKey::from_bytes(claimant_bytes);
        if let Err(e) = offer_store.remove_claim(&offer_id_bytes, &claimant_pk) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to remove claim: {}", e),
                id,
            );
        }

        info!(
            "[SPONSORSHIP] Rejected claim: {} on offer {}",
            params.claimant_pubkey, params.offer_id
        );

        let result = RejectSponsorshipClaimResult {
            rejected: true,
            offer_id: params.offer_id,
            claimant_pubkey: params.claimant_pubkey,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// Cancel a sponsorship offer (sponsor only)
    async fn cancel_sponsorship_offer(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::TIMESTAMP_TOLERANCE_SECONDS;

        let params: CancelSponsorshipOfferParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let offer_id_bytes: [u8; 16] = match hex::decode(&params.offer_id) {
            Ok(b) if b.len() == 16 => {
                let mut a = [0u8; 16];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid offer_id", id),
        };
        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey",
                    id,
                )
            }
        };
        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut a = [0u8; 64];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid signature", id),
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                )
            }
        };

        // Verify offer exists and sponsor owns it
        let offer = match offer_store.get_offer(&offer_id_bytes) {
            Ok(Some(o)) => o,
            Ok(None) => {
                return RpcResponse::error(RpcErrorCode::InvalidParams, "Offer not found", id)
            }
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InternalError,
                    &format!("Failed to get offer: {}", e),
                    id,
                )
            }
        };

        if offer.sponsor.as_bytes() != &sponsor_bytes {
            return RpcResponse::error(
                RpcErrorCode::PermissionDenied,
                "You are not the sponsor of this offer",
                id,
            );
        }

        // Verify signature over (offer_id(16) || timestamp(8 BE))
        let mut sig_msg = Vec::with_capacity(24);
        sig_msg.extend_from_slice(&offer_id_bytes);
        sig_msg.extend_from_slice(&params.timestamp.to_be_bytes());
        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let vk = match VerifyingKey::from_bytes(&sponsor_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid sponsor key",
                        id,
                    )
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid sponsor signature",
                    id,
                );
            }
        }

        // Delete the offer (also removes all claims)
        if let Err(e) = offer_store.delete_offer(&offer_id_bytes) {
            return RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to delete offer: {}", e),
                id,
            );
        }

        // Tombstone locally so the offer-sync task can't re-learn our own
        // cancelled offer from a peer that hasn't heard the cancellation yet.
        if let Err(e) = offer_store.tombstone_offer(&offer_id_bytes, current_time) {
            warn!("[SPONSORSHIP] Failed to tombstone cancelled offer: {}", e);
        }

        // Gossip the signed cancellation so every node deletes + tombstones it.
        // The signature we just verified IS the cancellation proof.
        if let Some(ref pool) = self.node.connection_pool {
            use crate::sponsorship::wire::{serialize_offer_cancel, OfferCancel};
            use crate::types::network::{MessageEnvelope, MessageType};

            let cancel = OfferCancel {
                offer_id: offer_id_bytes,
                sponsor: sponsor_bytes,
                timestamp: params.timestamp,
                signature: sig_bytes,
            };
            let envelope = MessageEnvelope::new_fork_agnostic(
                MessageType::SponsorshipOfferCancel,
                serialize_offer_cancel(&cancel),
            );
            let sent = pool.broadcast(&envelope).await;
            info!(
                "[SPONSORSHIP] Broadcast cancellation for offer {} to {} peers",
                params.offer_id, sent
            );
        }

        info!("[SPONSORSHIP] Cancelled offer {}", params.offer_id);

        let result = CancelSponsorshipOfferResult {
            cancelled: true,
            offer_id: params.offer_id,
        };
        RpcResponse::success(serde_json::to_value(result).unwrap(), id)
    }

    /// List sponsor's own offers with claim counts (requires signature auth)
    async fn list_my_sponsorship_offers(&self, params: Value, id: Value) -> RpcResponse {
        use crate::sponsorship::types::TIMESTAMP_TOLERANCE_SECONDS;

        let params: ListMySponsorshipOffersParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let sponsor_bytes: [u8; 32] = match hex::decode(&params.sponsor_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid sponsor_pubkey",
                    id,
                )
            }
        };

        let sig_bytes: [u8; 64] = match hex::decode(&params.signature) {
            Ok(b) if b.len() == 64 => {
                let mut a = [0u8; 64];
                a.copy_from_slice(&b);
                a
            }
            _ => return RpcResponse::error(RpcErrorCode::InvalidParams, "Invalid signature", id),
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // Timestamp validation
        if params.timestamp > current_time + TIMESTAMP_TOLERANCE_SECONDS
            || current_time > params.timestamp + TIMESTAMP_TOLERANCE_SECONDS
        {
            return RpcResponse::error(
                RpcErrorCode::InvalidParams,
                "Timestamp out of tolerance",
                id,
            );
        }

        // Verify sponsor signature: "swimchain-list-offers:" || sponsor(32) || timestamp(8 BE)
        {
            use ed25519_dalek::{Signature as DalekSig, Verifier, VerifyingKey};
            let prefix = b"swimchain-list-offers:";
            let mut sig_msg = Vec::with_capacity(prefix.len() + 40);
            sig_msg.extend_from_slice(prefix);
            sig_msg.extend_from_slice(&sponsor_bytes);
            sig_msg.extend_from_slice(&params.timestamp.to_be_bytes());

            let vk = match VerifyingKey::from_bytes(&sponsor_bytes) {
                Ok(k) => k,
                Err(_) => {
                    return RpcResponse::error(
                        RpcErrorCode::InvalidParams,
                        "Invalid sponsor key",
                        id,
                    )
                }
            };
            let sig = DalekSig::from_bytes(&sig_bytes);
            if vk.verify(&sig_msg, &sig).is_err() {
                return RpcResponse::error(
                    RpcErrorCode::InvalidSignature,
                    "Invalid sponsor signature",
                    id,
                );
            }
        }

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                )
            }
        };

        let sponsor_pk = crate::types::identity::PublicKey::from_bytes(sponsor_bytes);
        match offer_store.list_by_sponsor(&sponsor_pk) {
            Ok(offers) => {
                let summaries: Vec<MySponsorshipOfferSummary> = offers
                    .iter()
                    .map(|o| {
                        let claimed = offer_store.get_claimed_count(&o.offer_id).unwrap_or(0);
                        let pending_count = offer_store
                            .get_pending_claims(&o.offer_id)
                            .map(|c| c.len())
                            .unwrap_or(0);
                        let type_str = match o.offer_type {
                            crate::sponsorship::types::SponsorshipOfferType::Open => "open",
                            crate::sponsorship::types::SponsorshipOfferType::Probationary => {
                                "probationary"
                            }
                            crate::sponsorship::types::SponsorshipOfferType::Conditional => {
                                "conditional"
                            }
                        };
                        MySponsorshipOfferSummary {
                            offer_id: hex::encode(o.offer_id),
                            offer_type: type_str.to_string(),
                            slots_total: o.max_sponsees,
                            slots_claimed: claimed,
                            slots_pending: pending_count,
                            expires_at: o.expires_at,
                            created_at: o.created_at,
                            is_expired: o.is_expired(current_time),
                            auto_approve: o.auto_approve,
                        }
                    })
                    .collect();

                let result = ListMySponsorshipOffersResult { offers: summaries };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to list offers: {}", e),
                id,
            ),
        }
    }

    /// Get status of a user's pending claim
    async fn get_my_claim_status(&self, params: Value, id: Value) -> RpcResponse {
        let params: GetMyClaimStatusParams = match serde_json::from_value(params) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    &format!("Invalid params: {}", e),
                    id,
                );
            }
        };

        let claimant_bytes: [u8; 32] = match hex::decode(&params.claimant_pubkey) {
            Ok(b) if b.len() == 32 => {
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            }
            _ => {
                return RpcResponse::error(
                    RpcErrorCode::InvalidParams,
                    "Invalid claimant_pubkey",
                    id,
                )
            }
        };

        let offer_store = match &self.node.offer_store {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    RpcErrorCode::SubsystemUnavailable,
                    "Offer store not available",
                    id,
                )
            }
        };

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let claimant_pk = crate::types::identity::PublicKey::from_bytes(claimant_bytes);

        // Search all active offers for a pending claim from this claimant
        match offer_store.list_active_offers(current_time) {
            Ok(offers) => {
                for o in &offers {
                    match offer_store.get_claim(&o.offer_id, &claimant_pk) {
                        Ok(Some(claim)) if claim.is_pending() => {
                            let result = GetMyClaimStatusResult {
                                has_pending_claim: true,
                                offer_id: Some(hex::encode(o.offer_id)),
                                claimed_at: Some(claim.claimed_at),
                                offer_expires_at: Some(o.expires_at),
                                sponsor_pubkey: Some(hex::encode(o.sponsor.as_bytes())),
                            };
                            return RpcResponse::success(serde_json::to_value(result).unwrap(), id);
                        }
                        _ => continue,
                    }
                }

                // No pending claim found
                let result = GetMyClaimStatusResult {
                    has_pending_claim: false,
                    offer_id: None,
                    claimed_at: None,
                    offer_expires_at: None,
                    sponsor_pubkey: None,
                };
                RpcResponse::success(serde_json::to_value(result).unwrap(), id)
            }
            Err(e) => RpcResponse::error(
                RpcErrorCode::InternalError,
                &format!("Failed to check claim status: {}", e),
                id,
            ),
        }
    }
}

/// Check if a word is a common/stop word that should be excluded from trending
fn is_common_word(word: &str) -> bool {
    const COMMON_WORDS: &[&str] = &[
        "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one",
        "our", "out", "has", "have", "been", "were", "they", "this", "that", "with", "from",
        "will", "would", "there", "their", "what", "about", "which", "when", "make", "like",
        "time", "just", "know", "take", "into", "year", "your", "good", "some", "them", "than",
        "then", "look", "only", "come", "over", "such", "also", "back", "after", "most", "want",
        "here", "these", "thing", "think", "more", "very", "should", "could",
    ];
    COMMON_WORDS.contains(&word)
}
