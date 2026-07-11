//! RPC request and response types
//!
//! Follows JSON-RPC 2.0 specification.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::RpcErrorCode;

/// JSON-RPC 2.0 request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    /// Must be "2.0"
    pub jsonrpc: String,
    /// Method name
    pub method: String,
    /// Parameters (can be object or array)
    #[serde(default)]
    pub params: Value,
    /// Request ID (can be string, number, or null)
    pub id: Value,
}

impl RpcRequest {
    pub fn new(method: &str, params: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: Value::Number(1.into()),
        }
    }

    pub fn with_id(method: &str, params: Value, id: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id,
        }
    }
}

/// JSON-RPC 2.0 response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    /// Must be "2.0"
    pub jsonrpc: String,
    /// Result (mutually exclusive with error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// Error (mutually exclusive with result)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcResponseError>,
    /// Request ID (must match request)
    pub id: Value,
}

impl RpcResponse {
    pub fn success(result: Value, id: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: Some(result),
            error: None,
            id,
        }
    }

    pub fn error(code: RpcErrorCode, message: &str, id: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(RpcResponseError {
                code: code.code(),
                message: message.to_string(),
                data: None,
            }),
            id,
        }
    }

    pub fn error_with_data(code: RpcErrorCode, message: &str, data: Value, id: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(RpcResponseError {
                code: code.code(),
                message: message.to_string(),
                data: Some(data),
            }),
            id,
        }
    }

    pub fn is_error(&self) -> bool {
        self.error.is_some()
    }
}

/// JSON-RPC 2.0 error object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponseError {
    /// Error code
    pub code: i32,
    /// Error message
    pub message: String,
    /// Optional additional data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// ============================================================================
// Method-specific parameter and result types
// ============================================================================

/// get_info result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetInfoResult {
    /// Node version
    pub version: String,
    /// Network name (mainnet, testnet, regtest)
    pub network: String,
    /// Uptime in seconds
    pub uptime_seconds: u64,
    /// Number of connected peers
    pub peer_count: usize,
    /// Current block height
    pub block_height: u64,
    /// Node public key (hex)
    pub node_id: String,
    /// RPC server port
    pub rpc_port: u16,
    /// P2P server port
    pub p2p_port: u16,
}

/// get_peers result - single peer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfoResult {
    /// Peer ID (hex)
    pub peer_id: String,
    /// Remote address
    pub address: String,
    /// Connection direction
    pub direction: String,
    /// Connection duration in seconds
    pub connected_seconds: u64,
    /// User agent
    pub user_agent: String,
}

/// get_sync_status result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSyncStatusResult {
    /// Sync state (synced, syncing, behind, offline)
    pub state: String,
    /// Sync progress as percentage (0-100)
    pub chain_percent: u8,
    /// Number of connected peers
    pub peer_count: u64,
    /// Current chain height (block count)
    pub chain_height: u64,
    /// Tip block hash (hex string, first 16 chars for display)
    pub tip_hash: Option<String>,
    /// Storage used in MB
    pub storage_mb: u64,
    /// Storage target/limit in MB
    pub storage_target_mb: u64,
    /// Last block timestamp (Unix seconds)
    pub last_block_time: Option<u64>,
    /// Mempool: accumulated PoW (seconds of work)
    pub mempool_pow: u64,
    /// Mempool: threshold PoW needed for block formation
    pub mempool_threshold: u64,
    /// Mempool: number of pending actions
    pub mempool_actions: u64,
    /// Mempool: seconds waiting for block formation
    pub mempool_waiting_secs: u64,
    /// Leader election: node identity (hex, first 16 chars)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_identity: Option<String>,
    /// Leader election: XOR distance from block seed (lower 64 bits)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_distance: Option<u64>,
    /// Leader election: current eligibility threshold
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_threshold: Option<u64>,
    /// Leader election: whether node is currently eligible
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_eligible: Option<bool>,
    /// Leader election: estimated seconds until eligible (0 if already eligible)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_eta_secs: Option<u64>,
}

/// get_chain_stats result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetChainStatsResult {
    /// Latest block height
    pub latest_height: Option<u64>,
    /// Number of root blocks
    pub root_blocks: u64,
    /// Number of space blocks
    pub space_blocks: u64,
    /// Number of content blocks
    pub content_blocks: u64,
    /// Number of registered spaces
    pub registered_spaces: u64,
    /// Total storage in bytes
    pub total_storage_bytes: u64,
}

/// get_block params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetBlockParams {
    /// Block height to retrieve
    pub height: u64,
}

/// get_block result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetBlockResult {
    /// Block height
    pub height: u64,
    /// Block hash (hex)
    pub hash: String,
    /// Previous block hash (hex)
    pub prev_hash: String,
    /// Block timestamp
    pub timestamp: u64,
    /// Total PoW
    pub total_pow: u64,
    /// Space blocks in this root block
    pub space_blocks: Vec<SpaceBlockInfo>,
}

/// Space block info for get_block result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceBlockInfo {
    /// Space block hash (hex)
    pub hash: String,
    /// Space ID (hex)
    pub space_id: String,
    /// Number of content blocks
    pub content_block_count: u32,
    /// Content block hashes (hex)
    pub content_hashes: Vec<String>,
}

/// Media reference for attachments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRefParam {
    /// Media hash (32-byte hex, from upload_media response)
    pub media_hash: String,
    /// Media type: "image/jpeg", "image/png", "image/gif", "image/webp"
    pub media_type: String,
    /// Size in bytes
    pub size_bytes: u32,
}

/// submit_post params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitPostParams {
    /// Space ID (bech32 format)
    pub space_id: String,
    /// Post title
    pub title: String,
    /// Post body
    pub body: String,
    /// Author public key (32-byte hex)
    pub author_id: String,
    /// PoW nonce (pre-computed by client)
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (8-byte hex)
    pub pow_nonce_space: String,
    /// PoW hash (32-byte hex, result of Argon2id)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
    /// Optional media attachments (max 4)
    #[serde(default)]
    pub media_refs: Vec<MediaRefParam>,
    /// Replace-In-Mempool: hash of pending action to replace (32-byte hex)
    /// If set, this action replaces an unconfirmed action from the same author
    #[serde(default)]
    pub replaces_pending: Option<String>,
}

/// submit_post result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitPostResult {
    /// Content ID (sha256:hex)
    pub content_id: String,
    /// Whether content was broadcast
    pub broadcast: bool,
    /// Number of peers that received it
    pub recipients: usize,
}

/// upload_media params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadMediaParams {
    /// Base64-encoded media data
    pub data: String,
    /// Media MIME type: "image/jpeg", "image/png", "image/gif", "image/webp"
    pub media_type: String,
    /// Author public key (32-byte hex) - optional, for tracking purposes
    #[serde(default)]
    pub author_id: Option<String>,
}

/// upload_media result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadMediaResult {
    /// Media hash (32-byte hex) - use this in media_refs when submitting posts
    pub media_hash: String,
    /// Size in bytes
    pub size_bytes: u32,
    /// Whether the upload was successful
    pub success: bool,
}

/// submit_reply params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitReplyParams {
    /// Parent content ID
    pub parent_id: String,
    /// Reply body
    pub body: String,
    /// Author public key (32-byte hex)
    pub author_id: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (8-byte hex)
    pub pow_nonce_space: String,
    /// PoW hash (32-byte hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
    /// Attached media (images) — same shape as submit_post so replies carry pictures.
    #[serde(default)]
    pub media_refs: Vec<MediaRefParam>,
    /// Replace-In-Mempool: hash of pending action to replace (32-byte hex)
    #[serde(default)]
    pub replaces_pending: Option<String>,
}

/// submit_edit params - edit existing content (only original author can edit)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitEditParams {
    /// Original content ID being edited (sha256:... format)
    pub original_content_id: String,
    /// New title (optional, for posts only)
    #[serde(default)]
    pub title: Option<String>,
    /// New body content
    pub body: String,
    /// Author public key (32-byte hex) - must match original content author
    pub author_id: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (8-byte hex)
    pub pow_nonce_space: String,
    /// PoW hash (32-byte hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
    /// Replace-In-Mempool: hash of pending action to replace (32-byte hex)
    /// Useful for coalescing create+edit into a single on-chain action
    #[serde(default)]
    pub replaces_pending: Option<String>,
}

/// submit_engagement params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitEngagementParams {
    /// Content ID to engage with
    pub content_id: String,
    /// Author public key (32-byte hex)
    pub author_id: String,
    /// Engagement PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (8-byte hex)
    pub pow_nonce_space: String,
    /// PoW hash (32-byte hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
    /// Emoji type (1-8, optional)
    /// 1=❤️, 2=👍, 3=👎, 4=😂, 5=🤔, 6=🤯, 7=🔥, 8=🏊
    #[serde(default)]
    pub emoji: Option<u8>,
}

// ============================================================================
// Server-side signing methods (for agent/automated posting)
// ============================================================================

/// signed_post params - server signs and submits post using node's identity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedPostParams {
    /// Space ID (bech32 format)
    pub space_id: String,
    /// Post title
    pub title: String,
    /// Post body
    pub body: String,
}

/// signed_reply params - server signs and submits reply using node's identity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedReplyParams {
    /// Parent content ID
    pub parent_id: String,
    /// Reply body
    pub body: String,
}

/// signed_engage params - server signs and submits engagement using node's identity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedEngageParams {
    /// Content ID to engage with
    pub content_id: String,
    /// Emoji type (1-8, optional)
    #[serde(default)]
    pub emoji: Option<u8>,
}

/// get_identity_info result - returns node's loaded identity info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetIdentityInfoResult {
    /// Whether an identity is loaded
    pub has_identity: bool,
    /// Public key (hex, if identity loaded)
    pub public_key: Option<String>,
    /// Bech32 address (if identity loaded)
    pub address: Option<String>,
}

/// get_content params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContentParams {
    /// Content ID
    pub content_id: String,
}

/// get_content result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContentResult {
    /// Content ID
    pub content_id: String,
    /// Content type (post, reply, engagement)
    pub content_type: String,
    /// Author ID (bech32)
    pub author_id: String,
    /// Space ID (bech32)
    pub space_id: String,
    /// Parent ID (for replies)
    pub parent_id: Option<String>,
    /// Creation timestamp
    pub created_at: u64,
    /// Last engagement timestamp
    pub last_engagement: u64,
    /// Body content
    pub body: Option<String>,
    /// Title (for posts)
    pub title: Option<String>,
    /// Engagement count
    pub engagement_count: u64,
    /// Decay state (protected, active, stale, decayed)
    pub decay_state: String,
    /// Seconds until floor protection ends (if protected)
    pub seconds_until_decay_starts: Option<u64>,
    /// Seconds until content would be pruned (if decaying)
    pub seconds_until_pruned: Option<u64>,
    /// Survival probability 0.0-1.0 (1.0 = fully preserved)
    pub survival_probability: f64,
    /// Whether content is in floor protection period
    pub is_protected: bool,
    /// Time since last engagement in seconds
    pub time_since_engagement: u64,
    /// Media attachments (images)
    #[serde(default)]
    pub media_refs: Vec<MediaRefResult>,
    /// Reply count (all replies including nested)
    #[serde(default)]
    pub reply_count: u64,
    /// Author's display name (if provided when action was created)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// Media reference in content responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRefResult {
    /// Media hash (32-byte hex)
    pub media_hash: String,
    /// Media type: "image/jpeg", "image/png", "image/gif", "image/webp"
    pub media_type: String,
    /// Size in bytes
    pub size_bytes: u32,
}

/// get_media params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMediaParams {
    /// Media hash (32-byte hex, from upload_media or media_refs)
    pub media_hash: String,
}

/// get_media result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMediaResult {
    /// Media hash
    pub media_hash: String,
    /// Media type
    pub media_type: String,
    /// Base64-encoded media data
    pub data: String,
    /// Size in bytes
    pub size_bytes: u32,
}

/// list_space_content params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSpaceContentParams {
    /// Space ID
    pub space_id: String,
    /// Maximum items to return
    #[serde(default = "default_limit")]
    pub limit: usize,
    /// Offset for pagination
    #[serde(default)]
    pub offset: usize,
    /// Sort order (recent, hot, top)
    #[serde(default = "default_sort")]
    pub sort: String,
    /// Filter by content type (Post, Reply, Quote)
    #[serde(default)]
    pub content_type: Option<String>,
}

fn default_limit() -> usize {
    50
}

fn default_sort() -> String {
    "recent".to_string()
}

/// add_peer params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddPeerParams {
    /// Peer address (ip:port)
    pub address: String,
}

/// remove_peer params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemovePeerParams {
    /// Peer ID (hex)
    pub peer_id: String,
}

/// request_content params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestContentParams {
    /// Content ID to request from network
    pub content_id: String,
}

/// get_identity_level params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetIdentityLevelParams {
    /// Identity public key (32-byte hex)
    pub identity_id: String,
}

/// get_identity_level result
///
/// **DEPRECATED**: The identity level system has been removed. This method
/// returns placeholder values for backwards compatibility. Fields like
/// `level`, `streak_days`, `bandwidth_served`, and `contribution_score`
/// will always return 0 or "N/A". Only `is_genesis` is accurate.
/// This method will be removed in a future release.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetIdentityLevelResult {
    /// Identity public key (hex)
    pub identity_id: String,
    /// Swimmer level (0=NewSwimmer, 1=Swimmer, 2=Resident, etc.)
    /// **DEPRECATED**: Always returns 0
    pub level: u8,
    /// Level name for display
    /// **DEPRECATED**: Always returns "N/A"
    pub level_name: String,
    /// Whether this is a genesis identity (still accurate)
    pub is_genesis: bool,
    /// Current streak days
    /// **DEPRECATED**: Always returns 0
    pub streak_days: u16,
    /// Total bandwidth served (bytes)
    /// **DEPRECATED**: Always returns 0
    pub bandwidth_served: u64,
    /// Current period's contribution score
    /// **DEPRECATED**: Always returns 0
    pub contribution_score: u64,
    /// Deprecation warning message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecated_warning: Option<String>,
}

// ============================================================================
// Engagement Pool Types (SPEC_03 §7)
// ============================================================================

/// create_pool params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePoolParams {
    /// Content ID to create pool for (sha256:xxx format)
    pub content_id: String,
    /// Initiator identity (32-byte hex)
    pub initiator_id: String,
}

/// create_pool result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePoolResult {
    /// Pool ID (32-byte hex)
    pub pool_id: String,
    /// Target content ID
    pub content_id: String,
    /// Pool expires at (unix ms)
    pub expires_at: u64,
    /// Required PoW total (seconds)
    pub required_pow: u64,
}

/// contribute_to_pool params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributeToPoolParams {
    /// Pool ID (32-byte hex)
    pub pool_id: String,
    /// Contributor identity (32-byte hex)
    pub contributor_id: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW work done (seconds)
    pub pow_work: u64,
    /// PoW target hash (32-byte hex)
    pub pow_target: String,
    /// Nonce space (8-byte hex)
    pub nonce_space: String,
    /// Signature (64-byte hex)
    pub signature: String,
    /// Optional emoji code (1-8) for the reaction
    #[serde(default)]
    pub emoji: Option<u8>,
}

/// contribute_to_pool result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributeToPoolResult {
    /// Whether contribution was accepted
    pub accepted: bool,
    /// Current total PoW in pool (seconds)
    pub total_pow: u64,
    /// Whether pool is now complete
    pub pool_complete: bool,
    /// Pool status ("open", "completed", "expired")
    pub status: String,
}

/// get_pool_info params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPoolInfoParams {
    /// Pool ID (32-byte hex)
    pub pool_id: String,
}

/// get_pool_for_content params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPoolForContentParams {
    /// Content ID (e.g., "sha256:abc123...")
    pub content_id: String,
}

/// get_pool_for_content result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPoolForContentResult {
    /// Whether a pool exists for this content
    pub has_pool: bool,
    /// Pool ID if exists (32-byte hex)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_id: Option<String>,
    /// Current total PoW (seconds)
    #[serde(default)]
    pub total_pow: u64,
    /// Required PoW (seconds)
    #[serde(default)]
    pub required_pow: u64,
    /// Pool status ("open", "completed", "expired", or "none")
    pub status: String,
    /// Number of contributors
    #[serde(default)]
    pub contributor_count: u64,
    /// Pool expires at (unix ms) - 0 if no pool
    #[serde(default)]
    pub expires_at: u64,
}

/// get_pool_info result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPoolInfoResult {
    /// Pool ID (32-byte hex)
    pub pool_id: String,
    /// Target content ID
    pub content_id: String,
    /// Current total PoW (seconds)
    pub total_pow: u64,
    /// Required PoW (seconds)
    pub required_pow: u64,
    /// Pool status
    pub status: String,
    /// Number of contributors
    pub contributor_count: u64,
    /// Pool expires at (unix ms)
    pub expires_at: u64,
}

// ============================================================================
// Reply Types
// ============================================================================

/// get_replies params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetRepliesParams {
    /// Content ID to get replies for (parent content)
    pub content_id: String,
    /// Maximum number of replies to return (default 100)
    #[serde(default)]
    pub limit: Option<u32>,
    /// Number of replies to skip (default 0)
    #[serde(default)]
    pub offset: Option<u32>,
    /// Maximum depth of nested replies to fetch (default 5, 0 = direct children only)
    #[serde(default)]
    pub depth_limit: Option<u32>,
}

/// A single reply in the response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyInfo {
    /// Reply content ID
    pub content_id: String,
    /// Author public key (hex)
    pub author_id: String,
    /// Reply body text
    pub body: String,
    /// Parent content ID (what this is replying to)
    pub parent_id: String,
    /// Creation timestamp (unix ms)
    pub created_at: u64,
    /// Last engagement timestamp (unix ms)
    pub last_engagement: u64,
    /// Depth in the reply tree (0 = direct reply to root)
    pub depth: u32,
    /// Number of child replies (not fetched if beyond depth_limit)
    pub child_count: u32,
    /// Author's display name (if provided when reply was created)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Attached media (images) on this reply.
    #[serde(default)]
    pub media_refs: Vec<MediaRefResult>,
}

/// get_replies result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetRepliesResult {
    /// Parent content ID
    pub parent_id: String,
    /// List of direct replies
    pub replies: Vec<ReplyInfo>,
    /// Total number of replies (including nested)
    pub total_count: u64,
}

// ============================================================================
// Space Listing Types
// ============================================================================

/// list_spaces params
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ListSpacesParams {
    /// Maximum spaces to return
    #[serde(default = "default_spaces_limit")]
    pub limit: usize,
    /// Offset for pagination
    #[serde(default)]
    pub offset: usize,
}

fn default_spaces_limit() -> usize {
    100
}

/// Space summary info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceSummary {
    /// Space ID (bech32 format)
    pub space_id: String,
    /// Number of posts in this space
    pub post_count: u64,
    /// Most recent post timestamp
    pub last_activity: Option<u64>,
    /// Space name (if any). For app-namespaced spaces this is the CLEAN display name
    /// (the `@<app>:` marker is stripped).
    pub name: Option<String>,
    /// App namespace tag, if this is an app-namespaced space (see `parse_app_space_name`).
    /// `None` = a normal public space shown by the general social clients. `Some("wiki")`,
    /// `Some("chess")`, … = a specialized space: the general clients (forum/feed/chat/search)
    /// hide ALL app spaces so they never pollute the default experience, and the matching
    /// app client (wiki-client, etc.) shows only spaces whose `app` equals its own.
    #[serde(default)]
    pub app: Option<String>,
}

/// list_spaces result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSpacesResult {
    /// List of spaces
    pub spaces: Vec<SpaceSummary>,
    /// Total number of spaces
    pub total: usize,
}

/// Content item summary for list_space_content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSummary {
    /// Content ID (sha256:xxx format)
    pub content_id: String,
    /// Content type
    pub content_type: String,
    /// Author ID (bech32)
    pub author_id: String,
    /// Space ID (sp1xxx format)
    pub space_id: String,
    /// Parent ID (sha256:xxx format) for replies, null for posts
    pub parent_id: Option<String>,
    /// Creation timestamp (milliseconds)
    pub created_at: u64,
    /// Last engagement timestamp (milliseconds) - defaults to created_at if no engagements
    pub last_engagement: u64,
    /// Title (for posts)
    pub title: Option<String>,
    /// Body (if available)
    pub body: Option<String>,
    /// Body preview (truncated)
    pub body_preview: Option<String>,
    /// Engagement count
    pub engagement_count: u64,
    /// Reply count
    pub reply_count: u64,
    /// Decay state (e.g., "protected", "active", "stale", "decayed")
    pub decay_state: String,
    /// Seconds until content decays (null if already decayed)
    pub seconds_until_decay: Option<u64>,
    /// Survival probability (0.0 to 1.0, from DecayIntegration)
    pub survival_probability: f64,
    /// Whether content is in the 48-hour protection floor
    pub is_protected: bool,
    /// Seconds until floor protection ends (null if not in floor)
    pub seconds_until_decay_starts: Option<u64>,
    /// Seconds until content would be pruned (null if already decayed)
    pub seconds_until_pruned: Option<u64>,
    /// Pool progress (0.0 to 1.0, ratio of total_pow / required_pow)
    pub pool_progress: f64,
    /// Whether this content has an active pool
    pub has_pool: bool,
    /// Pool status ("empty", "partial", "completed")
    pub pool_status: String,
    /// Whether this content is pending in mempool (not yet on chain)
    #[serde(default)]
    pub pending: bool,
    /// Media attachments (images)
    #[serde(default)]
    pub media_refs: Vec<MediaRefResult>,
}

/// list_space_content result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSpaceContentResult {
    /// Content items
    pub items: Vec<ContentSummary>,
    /// Total items in space
    pub total: usize,
}

// =========================================================================
// Reaction Types (reactions come from PoW engagement via submit_engagement)
// =========================================================================

/// get_reactions params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetReactionsParams {
    /// Content ID
    pub content_id: String,
}

/// Single emoji reaction count
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmojiCount {
    /// Emoji character
    pub emoji: String,
    /// Reaction type code
    pub reaction_type: u8,
    /// Count of users who reacted with this emoji
    pub count: u32,
}

/// get_reactions result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetReactionsResult {
    /// Content ID
    pub content_id: String,
    /// Reaction counts by emoji (only includes non-zero counts)
    pub reactions: Vec<EmojiCount>,
    /// Total reaction count across all types
    pub total: u64,
}

/// get_user_reactions params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetUserReactionsParams {
    /// Content ID
    pub content_id: String,
    /// User's public key (hex)
    pub user_id: String,
}

/// get_user_reactions result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetUserReactionsResult {
    /// Content ID
    pub content_id: String,
    /// User ID
    pub user_id: String,
    /// Reaction types the user has added (1-8)
    pub reaction_types: Vec<u8>,
}

// ============================================================================
// Chain Engagement Types (for debugging engagement sync)
// ============================================================================

/// get_chain_engagements params
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GetChainEngagementsParams {
    /// Filter by content ID (optional)
    #[serde(default)]
    pub content_id: Option<String>,
    /// Include individual actions (verbose mode)
    #[serde(default)]
    pub verbose: bool,
}

/// Individual engage action info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngageActionInfo {
    /// Target content hash
    pub content_hash: String,
    /// Actor public key (hex)
    pub actor: String,
    /// Unix timestamp
    pub timestamp: u64,
    /// PoW work in seconds
    pub pow_work: u64,
    /// Emoji name (if any)
    pub emoji: Option<String>,
    /// Block hash containing this action
    pub block_hash: String,
}

/// Engagement stats per content item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentEngagementStats {
    /// Content hash
    pub content_hash: String,
    /// Total engagement actions
    pub total_engagements: u32,
    /// Total PoW work in seconds
    pub total_pow_work: u64,
    /// Number of unique actors
    pub unique_actors: u32,
    /// Emoji counts by emoji name
    pub emoji_counts: std::collections::HashMap<String, u32>,
}

/// get_chain_engagements result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetChainEngagementsResult {
    /// Total engage actions on chain
    pub total_engage_actions: u32,
    /// Stats per content item
    pub content_stats: Vec<ContentEngagementStats>,
    /// Individual actions (if verbose)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<EngageActionInfo>>,
}

// ============================================================================
// Space Creation Types
// ============================================================================

/// create_space params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpaceParams {
    /// Space name for display
    pub name: String,
    /// Optional description (max 256 bytes)
    #[serde(default)]
    pub description: Option<String>,
    /// Creator public key (32-byte hex)
    pub creator_id: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (8-byte hex)
    pub pow_nonce_space: String,
    /// PoW hash (32-byte hex, result of Argon2id)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// create_space result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpaceResult {
    /// Space ID (bech32 format sp1...)
    pub space_id: String,
    /// Space name
    pub name: String,
    /// Whether the space was created successfully
    pub success: bool,
}

// ============================================================================
// Content Block Types
// ============================================================================

/// get_content_block params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContentBlockParams {
    /// Content block hash (64 hex chars = 32 bytes)
    pub hash: String,
}

/// Action info within a content block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionInfo {
    /// Action type (CreateSpace, Post, Reply, Engage)
    pub action_type: String,
    /// Actor public key (hex)
    pub actor: String,
    /// Actor address (bech32 cs1...)
    pub actor_address: String,
    /// Timestamp (unix seconds)
    pub timestamp: u64,
    /// Content hash (sha256:xxx format) - for Post/Reply
    pub content_id: Option<String>,
    /// Parent content ID (sha256:xxx format) - for Reply
    pub parent_id: Option<String>,
    /// PoW work in seconds
    pub pow_work: u64,
    /// Emoji code (1-8) - for Engage actions
    pub emoji: Option<u8>,
}

/// get_content_block result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetContentBlockResult {
    /// Content block hash (hex)
    pub hash: String,
    /// Thread root content ID (sha256:xxx format)
    pub thread_root_id: String,
    /// Space ID (bech32 sp1... format)
    pub space_id: String,
    /// Block timestamp
    pub timestamp: u64,
    /// Total PoW in seconds
    pub total_pow: u64,
    /// Number of actions
    pub action_count: usize,
    /// Actions in this block
    pub actions: Vec<ActionInfo>,
    /// Merkle root of action hashes (hex)
    pub merkle_root: String,
    /// Previous content block hash (hex, null for first)
    pub prev_content_hash: Option<String>,
}

// ============================================================================
// Private Space RPC Types
// ============================================================================

/// create_private_space params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePrivateSpaceParams {
    /// Space name (will be encrypted)
    pub name: String,
    /// Optional description (will be encrypted)
    pub description: Option<String>,
    /// Creator's public key (hex)
    pub creator: String,
    /// Encrypted space key for creator (hex, X25519 box)
    pub creator_encrypted_key: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (hex)
    pub pow_nonce_space: String,
    /// PoW hash (hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// create_private_space_managed params (node-managed / desktop mode).
///
/// The node owns the identity seed and never exposes it, so the CLIENT sends only the
/// plaintext name and the NODE performs all crypto (space-key gen + wrap, name
/// encryption), signs, and mines PoW itself. Used by embedded desktop clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePrivateSpaceManagedParams {
    /// Space name (plaintext; the node encrypts it).
    pub name: String,
    /// Optional description (plaintext).
    pub description: Option<String>,
}

/// encrypt_private_content / decrypt_private_content params (node-managed mode).
///
/// The node holds the space key (recovered on demand from the caller's membership
/// record), so embedded clients delegate the space-key crypto they'd otherwise do
/// with the raw seed. `content` is the plaintext (encrypt) or `[PRIVATE:v1:...]`
/// ciphertext (decrypt).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateContentParams {
    /// Space ID (hex, 16-byte).
    pub space_id: String,
    /// Plaintext to encrypt, or `[PRIVATE:v1:...]` framed content to decrypt.
    pub content: String,
}

/// Result carrying a single content string (encrypted or decrypted).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateContentResult {
    /// The resulting content (ciphertext for encrypt, plaintext for decrypt).
    pub content: String,
}

/// create_private_space result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePrivateSpaceResult {
    /// Created space ID (hex)
    pub space_id: String,
    /// Space ID in bech32 format
    pub space_id_bech32: String,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// invite_to_space params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteToSpaceParams {
    /// Space ID (hex)
    pub space_id: String,
    /// Inviter's public key (hex)
    pub inviter: String,
    /// Invitee's public key (hex)
    pub invitee: String,
    /// Encrypted space key for invitee (hex, X25519 box)
    pub encrypted_space_key: String,
    /// Optional expiry timestamp (Unix seconds)
    pub expires_at: Option<u64>,
    /// Optional invite message (encrypted, hex)
    pub message: Option<String>,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (hex)
    pub pow_nonce_space: String,
    /// PoW hash (hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// invite_to_space result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteToSpaceResult {
    /// Invite action hash (hex)
    pub invite_hash: String,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// invite_to_space_managed params (node-managed / desktop mode).
///
/// The inviter is the node's own identity. The node recovers the space key from its
/// membership record, wraps it for the invitee itself (the client never touches the
/// seed), mines PoW, and signs/broadcasts the invite. The client sends only the
/// invitee's public key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteToSpaceManagedParams {
    /// Space ID (hex, 16-byte).
    pub space_id: String,
    /// Invitee's public key (hex, 32-byte ed25519).
    pub invitee: String,
    /// Optional expiry timestamp (Unix seconds).
    pub expires_at: Option<u64>,
}

/// accept_invite params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptInviteParams {
    /// Invite hash to accept (hex)
    pub invite_hash: String,
    /// Acceptor's public key (hex)
    pub acceptor: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// accept_invite result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptInviteResult {
    /// Space ID joined (hex)
    pub space_id: String,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// accept_invite_managed params (node-managed / desktop mode).
///
/// The acceptor is the node's own identity. The node stores its own membership record
/// using the invite's wrapped key (invited_by = inviter), so `node_space_key` can later
/// recover the space key. The client sends only the invite hash.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptInviteManagedParams {
    /// Invite hash to accept (hex, 32-byte).
    pub invite_hash: String,
}

/// create_space_invite_blob params (node-managed, out-of-band invite).
///
/// The node produces a SELF-CONTAINED invite the inviter shares out-of-band (copy/paste,
/// DM, link). It carries the space key wrapped for the invitee, so no network invite
/// propagation is needed — the invitee redeems it directly. (Space CONTENT still syncs
/// via normal block sync.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpaceInviteBlobParams {
    /// Space ID (hex, 16-byte).
    pub space_id: String,
    /// Invitee's public key (hex, 32-byte ed25519).
    pub invitee: String,
}

/// create_space_invite_blob result — a shareable `swiminv1:<base64>` code.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpaceInviteBlobResult {
    /// The shareable invite blob.
    pub blob: String,
}

/// redeem_space_invite params.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemSpaceInviteParams {
    /// The `swiminv1:<base64>` invite blob to redeem.
    pub blob: String,
}

/// redeem_space_invite result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemSpaceInviteResult {
    /// Joined space ID (hex).
    pub space_id: String,
    /// Space ID (bech32).
    pub space_id_bech32: String,
    /// Decrypted space name (if the blob carried it).
    pub name: Option<String>,
}

/// decline_invite params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclineInviteParams {
    /// Invite hash to decline (hex)
    pub invite_hash: String,
    /// Decliner's public key (hex)
    pub decliner: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// decline_invite result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclineInviteResult {
    /// Whether the decline was processed
    pub success: bool,
}

/// leave_space params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveSpaceParams {
    /// Space ID to leave (hex)
    pub space_id: String,
    /// Member's public key (hex)
    pub member: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// leave_space result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveSpaceResult {
    /// Whether the leave was processed
    pub success: bool,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// kick_member params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickMemberParams {
    /// Space ID (hex)
    pub space_id: String,
    /// Admin's public key (hex)
    pub admin: String,
    /// Member to kick (public key, hex)
    pub member: String,
    /// New encrypted keys for remaining members (map of pubkey hex → encrypted key hex)
    pub new_encrypted_keys: std::collections::HashMap<String, String>,
    /// New key version
    pub key_version: u32,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (hex)
    pub pow_nonce_space: String,
    /// PoW hash (hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// kick_member result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickMemberResult {
    /// Whether the kick was processed
    pub success: bool,
    /// New key version
    pub key_version: u32,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// Blocklist entry info for list_blocklist result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlocklistEntryInfo {
    /// SHA-256 hash of the blocked content (hex)
    pub content_hash: String,
    /// Reason for blocking ("CSAM", "Terrorism", "External List")
    pub reason: String,
    /// Unix timestamp when first added
    pub added_at: u64,
    /// Public key of node that first reported (hex)
    pub source_node: String,
    /// Number of propagation confirmations
    pub confirmations: u32,
    /// Number of attestations backing the entry
    pub attestation_count: u32,
}

/// list_blocklist result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBlocklistResult {
    /// All blocklist entries
    pub entries: Vec<BlocklistEntryInfo>,
    /// Total number of entries
    pub count: u32,
    /// Merkle root over all entry hashes (hex)
    pub merkle_root: String,
}

/// manage_blocklist params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManageBlocklistParams {
    /// Action to perform: "add" or "remove"
    pub action: String,
    /// SHA-256 hash of the content (32-byte hex)
    pub content_hash: String,
    /// Reason for adding: "csam", "terrorism", or "external_list" (default)
    #[serde(default)]
    pub reason: Option<String>,
}

/// manage_blocklist result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManageBlocklistResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// The action performed
    pub action: String,
    /// The content hash affected (hex)
    pub content_hash: String,
    /// Total blocklist entry count after the operation
    pub count: u32,
}

/// get_my_invites params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMyInvitesParams {
    /// User's public key (hex)
    pub user: String,
}

/// Invite info for get_my_invites result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteInfo {
    /// Invite hash (hex)
    pub invite_hash: String,
    /// Space ID (hex)
    pub space_id: String,
    /// Inviter's public key (hex)
    pub inviter: String,
    /// Encrypted space key (hex)
    pub encrypted_space_key: String,
    /// When created (Unix seconds)
    pub created_at: u64,
    /// When expires (Unix seconds, null if never)
    pub expires_at: Option<u64>,
    /// Optional invite message (encrypted, hex)
    pub message: Option<String>,
}

/// get_my_invites result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMyInvitesResult {
    /// List of pending invites
    pub invites: Vec<InviteInfo>,
}

/// get_space_members params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSpaceMembersParams {
    /// Space ID (hex)
    pub space_id: String,
}

/// Member info for get_space_members result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberInfo {
    /// Member's public key (hex)
    pub member: String,
    /// Role: "admin", "moderator", or "member"
    pub role: String,
    /// When joined (Unix seconds)
    pub joined_at: u64,
    /// Who invited them (hex, zeroed for creator)
    pub invited_by: String,
}

/// get_space_members result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSpaceMembersResult {
    /// Space ID (hex)
    pub space_id: String,
    /// List of members
    pub members: Vec<MemberInfo>,
    /// Total count
    pub count: usize,
}

/// request_dm params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestDMParams {
    /// Requester's public key (hex)
    pub requester: String,
    /// Recipient's public key (hex)
    pub recipient: String,
    /// Requester's key share for DH (hex)
    pub key_share: String,
    /// PoW nonce
    pub pow_nonce: u64,
    /// PoW difficulty
    pub pow_difficulty: u8,
    /// PoW nonce space (hex)
    pub pow_nonce_space: String,
    /// PoW hash (hex)
    pub pow_hash: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// request_dm result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestDMResult {
    /// DM request hash (hex)
    pub request_hash: String,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// accept_dm params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptDMParams {
    /// Requester's public key (hex)
    pub requester: String,
    /// Acceptor's public key (hex)
    pub acceptor: String,
    /// Acceptor's key share for completing DH (hex)
    pub key_share: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// accept_dm result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptDMResult {
    /// Created DM space ID (hex)
    pub space_id: String,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// decline_dm params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclineDMParams {
    /// Requester's public key (hex)
    pub requester: String,
    /// Decliner's public key (hex)
    pub decliner: String,
    /// Signature (hex)
    pub signature: String,
    /// Timestamp
    pub timestamp: u64,
}

/// decline_dm result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclineDMResult {
    /// Whether the decline was processed
    pub success: bool,
    /// Whether the action was broadcast
    pub broadcast: bool,
}

/// get_pending_dm_requests params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPendingDMRequestsParams {
    /// User's public key (hex)
    pub user: String,
}

/// DM request info for get_pending_dm_requests result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DMRequestInfo {
    /// Request hash (hex)
    pub request_hash: String,
    /// Requester's public key (hex)
    pub requester: String,
    /// Requester's key share (hex)
    pub key_share: String,
    /// When created (Unix seconds)
    pub created_at: u64,
}

/// get_pending_dm_requests result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPendingDMRequestsResult {
    /// List of pending DM requests
    pub requests: Vec<DMRequestInfo>,
}

/// get_my_private_spaces params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMyPrivateSpacesParams {
    /// User's public key (hex)
    pub user: String,
}

/// Private space info for get_my_private_spaces result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateSpaceInfo {
    /// Space ID (hex)
    pub space_id: String,
    /// Space ID (bech32)
    pub space_id_bech32: String,
    /// Encrypted space name (hex)
    pub encrypted_name: Option<String>,
    /// Decrypted space name — populated only in node-managed mode, when the node holds
    /// the space key (i.e. the requesting user is the node's own identity). None for
    /// browser clients, which decrypt the name themselves with their local space key.
    pub name: Option<String>,
    /// User's role in the space
    pub role: String,
    /// When joined
    pub joined_at: u64,
    /// Member count
    pub member_count: usize,
    /// Current key version
    pub key_version: u32,
}

/// get_my_private_spaces result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMyPrivateSpacesResult {
    /// List of private spaces user is a member of
    pub spaces: Vec<PrivateSpaceInfo>,
}

// ============================================================================
// Sponsorship Methods
// ============================================================================

/// register_genesis_identity params
///
/// Registers a genesis identity that is in the hardcoded genesis list.
/// Only valid during the bootstrap period.
#[derive(Debug, Clone, Deserialize)]
pub struct RegisterGenesisIdentityParams {
    /// Public key of the identity to register (hex)
    pub identity_pubkey: String,
    /// Genesis slot number (0-99)
    pub slot_number: u16,
    /// Optional: Ed25519 signature proving identity ownership
    pub ownership_signature: Option<String>,
    /// Timestamp for signature verification
    pub timestamp: u64,
}

/// register_sponsored_identity params
///
/// Registers a new identity sponsored by an existing sponsored identity.
#[derive(Debug, Clone, Deserialize)]
pub struct RegisterSponsoredIdentityParams {
    /// New identity public key (hex)
    pub new_identity_pubkey: String,
    /// Sponsor's public key (hex) - must be an existing sponsored identity
    pub sponsor_pubkey: String,
    /// Sponsor's signature over (new_identity_pubkey || timestamp)
    pub sponsor_signature: String,
    /// Creation timestamp
    pub timestamp: u64,
    /// Whether this is a probationary sponsorship
    #[serde(default)]
    pub probationary: bool,
    /// Claimant's PoW nonce (optional, for on-chain anti-spam proof)
    #[serde(default)]
    pub pow_nonce: u64,
    /// Claimant's PoW work (leading zeros count)
    #[serde(default)]
    pub pow_work: u64,
    /// Claimant's PoW target hash (hex, 32 bytes)
    #[serde(default)]
    pub pow_target: Option<String>,
}

/// get_sponsorship_info params
#[derive(Debug, Clone, Deserialize)]
pub struct GetSponsorshipInfoParams {
    /// Identity public key to check (hex)
    pub identity_pubkey: String,
}

/// Sponsorship info result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorshipInfo {
    /// Whether the identity is sponsored
    pub is_sponsored: bool,
    /// Sponsorship status (Active, Orphaned, Restricted, Revoked)
    pub status: Option<String>,
    /// Sponsor's public key (hex), None if genesis
    pub sponsor_pubkey: Option<String>,
    /// Tree depth (0 for genesis)
    pub depth: u8,
    /// Whether this is a genesis identity
    pub is_genesis: bool,
    /// Whether currently under penalty
    pub is_under_penalty: bool,
    /// Whether probationary
    pub probationary: bool,
    /// When sponsorship was created (UNIX timestamp)
    pub created_at: Option<u64>,
}

/// register_genesis_identity result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterGenesisIdentityResult {
    /// Whether registration was successful
    pub success: bool,
    /// The registered identity pubkey
    pub identity_pubkey: String,
    /// Assigned genesis slot
    pub slot_number: u16,
    /// Message describing the result
    pub message: String,
}

/// register_sponsored_identity result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterSponsoredIdentityResult {
    /// Whether registration was successful
    pub success: bool,
    /// The registered identity pubkey
    pub identity_pubkey: String,
    /// The sponsor's pubkey
    pub sponsor_pubkey: String,
    /// Tree depth
    pub depth: u8,
    /// Message describing the result
    pub message: String,
}

// ============================================================================
// Sponsorship Offer Lifecycle Types
// ============================================================================

/// list_sponsorship_offers params
#[derive(Debug, Clone, Deserialize)]
pub struct ListSponsorshipOffersParams {
    /// Pagination offset
    #[serde(default)]
    pub offset: usize,
    /// Max results per page
    #[serde(default = "default_offer_limit")]
    pub limit: usize,
    /// Optional type filter: "open" | "probationary"
    pub offer_type: Option<String>,
}

fn default_offer_limit() -> usize {
    20
}

/// Single offer in list result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorshipOfferSummary {
    pub offer_id: String,
    pub sponsor_pubkey: String,
    pub offer_type: String,
    pub slots_total: u8,
    pub slots_remaining: u8,
    pub expires_at: u64,
    pub created_at: u64,
    pub requirements: SponsorshipOfferRequirements,
    /// True if claims on this offer are approved instantly (invite links)
    #[serde(default)]
    pub auto_approve: bool,
}

/// Requirements sub-object for offer summaries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorshipOfferRequirements {
    pub min_pow_difficulty: u8,
    pub application_required: bool,
}

/// list_sponsorship_offers result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSponsorshipOffersResult {
    pub offers: Vec<SponsorshipOfferSummary>,
    pub total: usize,
    pub has_more: bool,
}

/// get_sponsorship_offer params
#[derive(Debug, Clone, Deserialize)]
pub struct GetSponsorshipOfferParams {
    pub offer_id: String,
    /// Caller pubkey (optional, for seeing pending claims on own offers)
    pub caller_pubkey: Option<String>,
}

/// Pending claim detail (only visible to the offer's sponsor)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingClaimDetail {
    pub claimant_pubkey: String,
    pub claimed_at: u64,
    pub application_text: Option<String>,
}

/// get_sponsorship_offer result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetSponsorshipOfferResult {
    pub offer_id: String,
    pub sponsor_pubkey: String,
    pub offer_type: String,
    pub slots_total: u8,
    pub slots_remaining: u8,
    pub expires_at: u64,
    pub created_at: u64,
    pub requirements: SponsorshipOfferRequirements,
    /// True if claims on this offer are approved instantly (invite links)
    #[serde(default)]
    pub auto_approve: bool,
    pub pending_claims: Vec<PendingClaimDetail>,
}

/// create_sponsorship_offer params
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSponsorshipOfferParams {
    pub sponsor_pubkey: String,
    pub slots: u8,
    pub offer_type: String,
    pub expires_days: u32,
    #[serde(default)]
    pub min_pow_difficulty: u8,
    #[serde(default)]
    pub application_required: bool,
    /// When true, claims on this offer are approved immediately without
    /// sponsor review (one-step invite-link onboarding). Default false.
    #[serde(default)]
    pub auto_approve: bool,
    pub signature: String,
    pub timestamp: u64,
}

/// create_sponsorship_offer result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSponsorshipOfferResult {
    pub offer_id: String,
    pub expires_at: u64,
    pub slots: u8,
}

/// claim_sponsorship_offer params
#[derive(Debug, Clone, Deserialize)]
pub struct ClaimSponsorshipOfferParams {
    pub offer_id: String,
    pub claimant_pubkey: String,
    pub application_text: Option<String>,
    #[serde(default)]
    pub pow_nonce: u64,
    #[serde(default)]
    pub pow_difficulty: u64,
    pub pow_nonce_space: Option<String>,
    pub pow_hash: Option<String>,
    pub signature: String,
    pub timestamp: u64,
}

/// claim_sponsorship_offer result
///
/// `status` is "pending" for normal offers. For auto-approve offers the claim
/// is approved immediately: `status` is "approved" and the approval fields
/// (`claimant_address`, `depth`, `probationary`) are populated.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimSponsorshipOfferResult {
    pub offer_id: String,
    pub status: String,
    pub message: String,
    /// Bech32m address of the claimant (present when status == "approved")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claimant_address: Option<String>,
    /// Sponsorship tree depth (present when status == "approved")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub depth: Option<u8>,
    /// Whether the sponsorship is probationary (present when status == "approved")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub probationary: Option<bool>,
}

/// approve_sponsorship_claim params
#[derive(Debug, Clone, Deserialize)]
pub struct ApproveSponsorshipClaimParams {
    pub offer_id: String,
    pub claimant_pubkey: String,
    pub sponsor_pubkey: String,
    pub signature: String,
    pub timestamp: u64,
}

/// approve_sponsorship_claim result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApproveSponsorshipClaimResult {
    pub claimant_pubkey: String,
    pub claimant_address: String,
    pub depth: u8,
    pub probationary: bool,
    pub status: String,
}

/// reject_sponsorship_claim params
#[derive(Debug, Clone, Deserialize)]
pub struct RejectSponsorshipClaimParams {
    pub offer_id: String,
    pub claimant_pubkey: String,
    pub sponsor_pubkey: String,
    pub signature: String,
    pub timestamp: u64,
}

/// reject_sponsorship_claim result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectSponsorshipClaimResult {
    pub rejected: bool,
    pub offer_id: String,
    pub claimant_pubkey: String,
}

/// cancel_sponsorship_offer params
#[derive(Debug, Clone, Deserialize)]
pub struct CancelSponsorshipOfferParams {
    pub offer_id: String,
    pub sponsor_pubkey: String,
    pub signature: String,
    pub timestamp: u64,
}

/// cancel_sponsorship_offer result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelSponsorshipOfferResult {
    pub cancelled: bool,
    pub offer_id: String,
}

/// list_my_sponsorship_offers params
#[derive(Debug, Clone, Deserialize)]
pub struct ListMySponsorshipOffersParams {
    pub sponsor_pubkey: String,
    pub signature: String,
    pub timestamp: u64,
}

/// Single offer in my-offers list
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySponsorshipOfferSummary {
    pub offer_id: String,
    pub offer_type: String,
    pub slots_total: u8,
    pub slots_claimed: u8,
    pub slots_pending: usize,
    pub expires_at: u64,
    pub created_at: u64,
    pub is_expired: bool,
    /// True if claims on this offer are approved instantly (invite links)
    #[serde(default)]
    pub auto_approve: bool,
}

/// list_my_sponsorship_offers result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListMySponsorshipOffersResult {
    pub offers: Vec<MySponsorshipOfferSummary>,
}

/// get_my_claim_status params
#[derive(Debug, Clone, Deserialize)]
pub struct GetMyClaimStatusParams {
    pub claimant_pubkey: String,
}

/// get_my_claim_status result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMyClaimStatusResult {
    pub has_pending_claim: bool,
    pub offer_id: Option<String>,
    pub claimed_at: Option<u64>,
    pub offer_expires_at: Option<u64>,
    pub sponsor_pubkey: Option<String>,
}

// ============================================================================
// User Content Types (Feed-style queries)
// ============================================================================

/// get_user_posts params
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetUserPostsParams {
    /// User's public key (32-byte hex)
    pub user_id: String,
    /// Maximum posts to return (default 50)
    #[serde(default = "default_user_posts_limit")]
    pub limit: usize,
    /// Offset for pagination
    #[serde(default)]
    pub offset: usize,
    /// Include replies in addition to posts (default false)
    #[serde(default)]
    pub include_replies: bool,
}

fn default_user_posts_limit() -> usize {
    50
}

/// get_user_posts result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetUserPostsResult {
    /// User's public key (hex)
    pub user_id: String,
    /// Content items by this user
    pub items: Vec<ContentSummary>,
    /// Total posts by this user
    pub total_posts: usize,
    /// Total content items by this user (posts + replies)
    pub total_content: usize,
}
