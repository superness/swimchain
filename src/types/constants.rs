//! Protocol constants
//!
//! All constants are grouped by their source specification and include references
//! to the relevant sections for traceability.

// === SPEC_01: Identity ===

/// Human-readable prefix for Bech32m addresses (SPEC_01 §3.3)
pub const ADDRESS_HRP: &str = "cs";

/// Current address version byte (SPEC_01 §3.3)
pub const ADDRESS_VERSION: u8 = 0;

/// Minimum leading zero bits required for identity creation PoW (SPEC_01 §3.4)
pub const IDENTITY_POW_DIFFICULTY: u8 = 20;

/// Maximum age of signature timestamp in past (seconds) (SPEC_01 §6.2)
pub const SIGNATURE_PAST_TOLERANCE_SECS: u64 = 3600; // 1 hour

/// Maximum age of signature timestamp in future (seconds) (SPEC_01 §6.2)
pub const SIGNATURE_FUTURE_TOLERANCE_SECS: u64 = 300; // 5 minutes

/// Maximum age of PoW timestamp (seconds) (SPEC_01 §6.3)
pub const POW_TIMESTAMP_MAX_AGE_SECS: u64 = 86400; // 24 hours

/// Maximum display name length in bytes (SPEC_01 §3.5)
pub const MAX_DISPLAY_NAME_BYTES: usize = 64;

/// Maximum bio length in bytes (SPEC_01 §3.5)
pub const MAX_BIO_BYTES: usize = 256;

// === SPEC_02: Content & Decay ===

/// Threshold for inline vs external content storage (bytes) (SPEC_02 §3.1)
pub const INLINE_CONTENT_THRESHOLD: usize = 1024;

/// Maximum post body size in bytes (SPEC_02 §3.1)
pub const MAX_BODY_SIZE: usize = 4096;

/// Maximum number of media references per post (SPEC_02 §3.3)
pub const MAX_MEDIA_REFS: usize = 4;

/// Maximum size per media attachment in bytes (1MB)
pub const MAX_MEDIA_SIZE: usize = 1_048_576;

/// Decay floor duration in seconds (48 hours) (SPEC_02 §4.1)
pub const DECAY_FLOOR_SECS: u64 = 172_800;

/// Decay half-life in seconds (7 days) (SPEC_02 §4.1)
pub const HALF_LIFE_SECS: u64 = 604_800;

/// Decay threshold below which content expires (6.25%) (SPEC_02 §4.1)
pub const DECAY_THRESHOLD: f64 = 0.0625;

// === SPEC_02: Adaptive Decay (§4.1.1) ===

/// Target storage per node in bytes (500MB default) (SPEC_02 §4.1.1)
pub const TARGET_STORAGE_BYTES: u64 = 524_288_000;

/// Minimum half-life in seconds (1 day) (SPEC_02 §4.1.1)
pub const MIN_HALF_LIFE_SECS: u64 = 86_400;

/// Maximum half-life in seconds (30 days) (SPEC_02 §4.1.1)
pub const MAX_HALF_LIFE_SECS: u64 = 2_592_000;

/// Adaptation interval in seconds (1 hour) (SPEC_02 §4.1.1)
pub const ADAPTATION_INTERVAL_SECS: u64 = 3_600;

/// Smoothing factor for half-life adaptation (10%) (SPEC_02 §4.1.1)
pub const ADAPTATION_SMOOTHING: f64 = 0.1;

/// Maximum author preservation days per proof (SPEC_02 §4.5)
pub const MAX_PRESERVATION_DAYS: u64 = 30;

/// Maximum cumulative preservation days (SPEC_02 §4.5)
pub const MAX_TOTAL_PRESERVATION_DAYS: u64 = 365;

/// Maximum pinned content per space (SPEC_02 §4.7)
pub const MAX_PINS_PER_SPACE: usize = 100;

/// Grace period before pruning in milliseconds (24 hours per §6.4)
pub const PRUNE_GRACE_PERIOD_MS: u64 = 86_400_000;

/// Maximum engagement timestamp tolerance in milliseconds (1 hour into future)
/// Engagements with timestamps beyond this into the future are rejected to prevent
/// decay timer manipulation attacks (SPEC_02 §4.2 Security).
pub const ENGAGEMENT_FUTURE_TOLERANCE_MS: u64 = 3_600_000;

// === SPEC_06: Network ===

/// Magic bytes for message framing ("CSOC") (SPEC_06 §3.4)
pub const MAGIC_BYTES: [u8; 4] = [0x43, 0x53, 0x4F, 0x43];

/// Current protocol version (SPEC_06 §3.4)
pub const PROTOCOL_VERSION: u8 = 1;

/// Default network port (SPEC_06 §4.1)
pub const DEFAULT_PORT: u16 = 9735;

/// Gossip fanout (number of peers to forward to) (SPEC_06 §4.3)
pub const GOSSIP_FANOUT: usize = 8;

/// Gossip TTL (maximum hops) (SPEC_06 §4.3)
pub const GOSSIP_TTL: u8 = 6;

/// Minimum number of peers to maintain (SPEC_06 §4.2)
pub const MIN_PEERS: usize = 8;

/// Target number of peers (SPEC_06 §4.2)
pub const TARGET_PEERS: usize = 25;

/// Maximum number of peers (SPEC_06 §4.2)
pub const MAX_PEERS: usize = 100;

// === SPEC_06: Wire Protocol ===

/// Message envelope header size (bytes) (SPEC_06 §3.4)
/// Format: magic(4) + version(1) + type(1) + fork_id(32) + length(4) + checksum(4) = 46
pub const MESSAGE_HEADER_SIZE: usize = 46;

/// Wire address size (bytes) (SPEC_06 §5.2.3)
/// Format: transport(1) + address(64) + port(2) + services(4) + last_seen(4) = 75
pub const WIRE_ADDRESS_SIZE: usize = 75;

/// Compact address size for VERSION message (bytes)
/// Format: transport(1) + address(16) + port(2) + services(4) + padding(3) = 26
pub const COMPACT_ADDRESS_SIZE: usize = 26;

/// Maximum user agent length (bytes)
pub const MAX_USER_AGENT_LEN: usize = 256;

/// Maximum addresses per ADDR message (V-PEER-04)
pub const MAX_ADDRS_PER_MESSAGE: usize = 1000;

/// Maximum inventory items per message
pub const MAX_INV_ITEMS: usize = 50000;

/// Maximum blocks per BLOCKS message
pub const MAX_BLOCKS_PER_MESSAGE: usize = 500;

/// Maximum headers per HEADERS message
pub const MAX_HEADERS_PER_MESSAGE: usize = 2000;

/// Maximum reject reason length (bytes)
pub const MAX_REASON_LEN: usize = 256;

/// Handshake timeout in seconds (V-PEER-02)
pub const HANDSHAKE_TIMEOUT_SECS: u64 = 30;

/// VERSION message timeout in seconds (SPEC_06 §5.3)
pub const VERSION_TIMEOUT_SECS: u64 = 10;

/// Ping interval in seconds (SPEC_06 §5.3)
pub const PING_INTERVAL_SECS: u64 = 120;

/// PONG timeout in seconds (V-PEER-03)
pub const PONG_TIMEOUT_SECS: u64 = 60;

/// Maximum payload size (4MB) per transport message
pub const MAX_PAYLOAD_SIZE: u32 = 4 * 1024 * 1024;

// === SPEC_06: Peer Discovery (§4.1, §4.6) ===

/// Maximum cached peers in persistent store
pub const MAX_CACHED_PEERS: usize = 2000;

/// Peer score at which to ban (SPEC_06 §3.3)
pub const PEER_BAN_THRESHOLD: i16 = -500;

/// Initial score for new peers (SPEC_06 §4.6)
pub const PEER_INITIAL_SCORE: i16 = 100;

/// Score bonus for successful connection
pub const PEER_SUCCESS_BONUS: i16 = 10;

/// Score penalty for connection failure
pub const PEER_FAILURE_PENALTY: i16 = 20;

/// Maximum peer age before eviction (30 days, seconds)
pub const PEER_MAX_AGE_SECS: u64 = 30 * 24 * 60 * 60;

/// Minimum seconds between GETADDR requests from same peer
pub const GETADDR_RATE_LIMIT_SECS: u64 = 60;

/// Timeout waiting for ADDR response (seconds)
pub const ADDR_RESPONSE_TIMEOUT_SECS: u64 = 30;

/// Cleanup interval for rate limit entries (seconds)
pub const RATE_LIMIT_CLEANUP_SECS: u64 = 300;

// === SPEC_08: Blocks ===

/// Block version for current protocol (SPEC_08 §3.1)
pub const BLOCK_VERSION: u8 = 1;

/// Maximum actions per content block (SPEC_08 §3.3)
pub const MAX_BLOCK_ACTIONS: usize = 1000;

/// Maximum block size in bytes (SPEC_08 §3.1)
pub const MAX_BLOCK_SIZE: usize = 1_048_576; // 1 MB

// === SPEC_03: Engagement Pools (§6.4) ===

/// Pool window duration in seconds (10 minutes) (SPEC_03 §6.4)
pub const POOL_WINDOW_SECS: u64 = 600;

/// Pool window duration in milliseconds (SPEC_03 §6.4)
pub const POOL_WINDOW_MS: u64 = 600_000;

/// Total PoW required per engagement pool in seconds (SPEC_03 §6.4)
pub const POOL_REQUIRED_POW_SECS: u64 = 60;

/// Minimum contribution per pool entry in seconds (SPEC_03 §6.4)
pub const MIN_CONTRIBUTION_SECS: u64 = 1;

// === SPEC_06: Chain Sync (§4.5) ===

/// Sync check interval in seconds (SPEC_06 §4.5)
pub const SYNC_INTERVAL_SECS: u64 = 30;

/// Block request timeout in milliseconds (SPEC_06 §4.5)
pub const BLOCK_REQUEST_TIMEOUT_MS: u64 = 10_000;

/// Number of peers to query for chain status (SPEC_06 §4.5)
pub const SYNC_QUERY_PEER_COUNT: usize = 8;

// === SPEC_06: Gossip Protocol (§4.3, §6.4) ===

/// Size of the seen message cache (SPEC_06 §4.3)
pub const SEEN_CACHE_SIZE: usize = 10_000;

/// Gossip timestamp tolerance in seconds (±5 minutes) (V-GOSSIP-04)
pub const GOSSIP_TIMESTAMP_TOLERANCE_SECS: u64 = 300;

/// Seen cache entry expiry in seconds (TTL * avg_hop_time * safety_margin)
/// Formula: 6 hops * 2 sec/hop * 10 = 120 seconds
pub const SEEN_CACHE_EXPIRY_SECS: u64 = 120;

/// Maximum retry attempts for GETDATA requests
pub const GOSSIP_MAX_RETRIES: usize = 3;

// === SPEC_07: Content Retrieval (§4) ===

/// WHO_HAS message type (content availability query)
pub const MSG_WHO_HAS: u8 = 0x24;

/// I_HAVE message type (content availability response)
pub const MSG_I_HAVE: u8 = 0x25;

/// GET message type (content request)
pub const MSG_GET: u8 = 0x26;

/// Content request timeout in seconds (matches gossip timeout)
pub const CONTENT_REQUEST_TIMEOUT_SECS: u64 = 30;

/// Maximum retry attempts for content requests
pub const CONTENT_MAX_RETRIES: usize = 3;

/// Maximum concurrent chunk downloads
pub const MAX_CONCURRENT_CHUNK_REQUESTS: usize = 4;

/// Peer availability cache TTL in seconds (5 minutes)
pub const PEER_AVAILABILITY_TTL_SECS: u64 = 300;

/// Maximum entries in the peer availability map
pub const MAX_PEER_AVAILABILITY_ENTRIES: usize = 10_000;

/// WHO_HAS deduplication cache TTL in seconds
pub const WHO_HAS_SEEN_TTL_SECS: u64 = 60;

// === SPEC_07: Seeding & Availability (§5-6) ===

/// Default bandwidth limit in Mbps (SPEC_07 §5)
pub const SEEDING_DEFAULT_BANDWIDTH_MBPS: u32 = 10;

/// Minimum bandwidth limit in Mbps (SPEC_07 §5)
pub const SEEDING_MIN_BANDWIDTH_MBPS: u32 = 1;

/// Maximum bandwidth limit in Mbps (SPEC_07 §5)
pub const SEEDING_MAX_BANDWIDTH_MBPS: u32 = 100;

/// Default storage limit in GB (SPEC_07 §5)
pub const SEEDING_DEFAULT_STORAGE_GB: u32 = 50;

/// Maximum storage limit in GB (SPEC_07 §5)
pub const SEEDING_MAX_STORAGE_GB: u32 = 1000;

/// Default seeding duration in hours (7 days) (SPEC_07 §5)
pub const SEEDING_DEFAULT_DURATION_HOURS: u32 = 168;

/// Minimum seeding duration in hours (SPEC_07 §5)
pub const SEEDING_MIN_DURATION_HOURS: u32 = 1;

/// Maximum seeding duration in hours (1 year) (SPEC_07 §5)
pub const SEEDING_MAX_DURATION_HOURS: u32 = 8760;

/// Maximum hashes per availability announcement (SPEC_07 §6)
pub const AVAILABILITY_ANNOUNCE_BATCH_SIZE: usize = 100;

/// Re-announcement interval in seconds (5 minutes) (SPEC_07 §6)
pub const AVAILABILITY_REANNOUNCE_SECS: u64 = 300;

/// Maximum TTL for availability announcements (1 hour) (SPEC_07 §6)
/// Announcements with expires_at beyond current_time + MAX_TTL are rejected.
pub const AVAILABILITY_MAX_TTL_SECS: u64 = 3600;

/// Maximum pending announcements per space (SPEC_07 §6)
/// Prevents unbounded memory growth when content is stored faster than announced.
/// Oldest hashes are evicted when this limit is reached.
pub const AVAILABILITY_MAX_PENDING_PER_SPACE: usize = 1000;

/// AVAILABILITY_ANNOUNCE message type (SPEC_07 §6)
pub const MSG_AVAILABILITY_ANNOUNCE: u8 = 0x29;

// === SPEC_09: Contribution Tracking (§2) ===

/// Genesis epoch: January 1, 2025 00:00:00 UTC (SPEC_09 §2)
/// Used as the reference point for period and streak calculations.
pub const GENESIS_EPOCH_SECS: u64 = 1735689600;

/// Seconds per week for contribution period calculation (SPEC_09 §2)
pub const CONTRIBUTION_SECONDS_PER_WEEK: u64 = 604_800;

/// Uptime sample interval in seconds (5 minutes) (SPEC_09 §2)
pub const UPTIME_SAMPLE_INTERVAL_SECS: u64 = 300;

/// Bytes per gigabyte for contribution score calculation (SPEC_09 §2.3)
pub const CONTRIBUTION_BYTES_PER_GB: u64 = 1_073_741_824;

// === SPEC_09: Peer Attestation Protocol (§11) ===

/// CONTRIBUTION_CLAIM message type (SPEC_09 §11)
/// Publish a contribution record for peer attestation.
pub const MSG_CONTRIBUTION_CLAIM: u8 = 0x30;

/// CONTRIBUTION_ATTEST message type (SPEC_09 §11)
/// Attest to a peer's contribution claim.
pub const MSG_CONTRIBUTION_ATTEST: u8 = 0x31;

/// LEVEL_QUERY message type (SPEC_09 §11)
/// Query for an identity's swimmer level.
pub const MSG_LEVEL_QUERY: u8 = 0x32;

/// LEVEL_RESPONSE message type (SPEC_09 §11)
/// Response with swimmer level information.
pub const MSG_LEVEL_RESPONSE: u8 = 0x33;

/// SPACE_HEALTH_QUERY message type (SPEC_09 §11)
/// Query for a space's health indicators.
pub const MSG_SPACE_HEALTH_QUERY: u8 = 0x34;

/// SPACE_HEALTH_RESPONSE message type (SPEC_09 §11)
/// Response with space health information.
pub const MSG_SPACE_HEALTH_RESPONSE: u8 = 0x35;

// === SPEC_09: Content Attribution (§6.3) ===

/// ATTRIBUTION_QUERY message type (SPEC_09 §6.3)
/// Query attribution data for content.
pub const MSG_ATTRIBUTION_QUERY: u8 = 0x50;

/// ATTRIBUTION_RESPONSE message type (SPEC_09 §6.3)
/// Response with content attribution data.
pub const MSG_ATTRIBUTION_RESPONSE: u8 = 0x51;

// === SPEC_10: Connection Management (§4.1) ===

/// Maximum inbound connections (SPEC_10 §4.1)
pub const MAX_INBOUND_CONNECTIONS: usize = 400;

/// Maximum outbound connections (SPEC_10 §4.1)
pub const MAX_OUTBOUND_CONNECTIONS: usize = 100;

/// Maximum total connections (SPEC_10 §3.2)
pub const MAX_CONNECTIONS: usize = 500;

/// Target number of outbound peers (SPEC_10 §4.1)
pub const CONNECTION_TARGET_PEERS: usize = 25;

/// Minimum peers before bootstrap (SPEC_10 §4.1)
pub const CONNECTION_MIN_PEERS: usize = 8;

// === SPEC_10: Reconnection Backoff (§4.2) ===

/// Base reconnection delay in seconds
pub const RECONNECT_BASE_DELAY_SECS: u64 = 1;

/// Maximum reconnection delay in seconds (30 minutes)
pub const RECONNECT_MAX_DELAY_SECS: u64 = 1800;

/// Reconnection backoff factor
pub const RECONNECT_FACTOR: u32 = 2;

/// Jitter percentage for reconnection (±25%)
pub const RECONNECT_JITTER_PERCENT: u32 = 25;

// === SPEC_10: Ban Thresholds (§7.3) ===

/// Number of protocol violations before ban
pub const PROTOCOL_VIOLATION_BAN_THRESHOLD: u16 = 3;

/// Ban duration in seconds (1 hour)
pub const BAN_DURATION_SECS: u64 = 3600;

// === SPEC_06: Wire Protocol Message Types (§5) ===
// Note: Message IDs for chain sync (0x70-0x74) and fork (0x53-0x55) are
// relocated from their original positions to avoid conflict with SPEC_09
// social layer messages (0x30-0x35).

// --- Handshake (handled by transport layer) ---
/// VERSION message type - protocol version exchange
pub const MSG_VERSION: u8 = 0x00;
/// VERACK message type - version acknowledgment
pub const MSG_VERACK: u8 = 0x01;

// --- Keepalive ---
/// PING message type - connection liveness check
pub const MSG_PING: u8 = 0x02;
/// PONG message type - response to PING
pub const MSG_PONG: u8 = 0x03;

// --- Address Discovery (§5.2.3) ---
/// GETADDR message type - request peer addresses
pub const MSG_GETADDR: u8 = 0x10;
/// ADDR message type - send peer addresses
pub const MSG_ADDR: u8 = 0x11;

// --- Inventory/Data Exchange (§5.2.4) ---
/// INV message type - announce available items
pub const MSG_INV: u8 = 0x20;
/// GETDATA message type - request specific items
pub const MSG_GETDATA: u8 = 0x21;
/// DATA message type - send requested items
pub const MSG_DATA: u8 = 0x22;
/// NOTFOUND message type - requested item not available
pub const MSG_NOTFOUND: u8 = 0x23;

// --- Content (SPEC_07 §4) ---
// Note: MSG_WHO_HAS (0x24), MSG_I_HAVE (0x25), MSG_GET (0x26) defined above
/// DATA_CONTENT message type - send content data in response to GET
pub const MSG_DATA_CONTENT: u8 = 0x27;
/// NOTFOUND_CONTENT message type - content not available
pub const MSG_NOTFOUND_CONTENT: u8 = 0x28;

// --- Gossip (§4.3) ---
/// GOSSIP message type - propagate gossip payload
pub const MSG_GOSSIP: u8 = 0x40;

// --- Fork Detection (relocated from 0x50-0x52) ---
/// FORKANNOUNCE message type - announce detected fork
pub const MSG_FORKANNOUNCE: u8 = 0x53;
/// FORKQUERY message type - query fork information
pub const MSG_FORKQUERY: u8 = 0x54;
/// FORKINFO message type - fork information response
pub const MSG_FORKINFO: u8 = 0x55;

// --- Error/Control (§5.2.5) ---
/// REJECT message type - reject a message
pub const MSG_REJECT: u8 = 0x60;
/// ALERT message type - network alert
pub const MSG_ALERT: u8 = 0x61;

// --- Chain Sync (relocated from 0x30-0x34 to avoid SPEC_09 conflict) ---
/// GETBLOCKS message type - request block hashes
pub const MSG_GETBLOCKS: u8 = 0x70;
/// BLOCKS message type - send block hashes
pub const MSG_BLOCKS: u8 = 0x71;
/// GETHEADERS message type - request block headers
pub const MSG_GETHEADERS: u8 = 0x72;
/// HEADERS message type - send block headers
pub const MSG_HEADERS: u8 = 0x73;
/// CHAINSTATUS message type - chain tip information
pub const MSG_CHAINSTATUS: u8 = 0x74;
/// BLOCK_ANNOUNCE message type - announce a new block (SPEC_08)
/// Sent when a node forms a new root block to announce it to peers.
pub const MSG_BLOCK_ANNOUNCE: u8 = 0x75;
/// GET_BLOCK message type - request a specific block by hash (SPEC_08)
pub const MSG_GET_BLOCK: u8 = 0x76;
/// BLOCK_DATA message type - send block data in response to GET_BLOCK (SPEC_08)
pub const MSG_BLOCK_DATA: u8 = 0x77;

/// GETBLOCKS_LOCATOR message type - request blocks using locator hashes
/// Bitcoin-style sync: send hashes at exponential intervals, peer responds
/// with blocks from first matching hash onwards.
pub const MSG_GETBLOCKS_LOCATOR: u8 = 0x78;

/// BLOCKS_LOCATOR message type - response to GETBLOCKS_LOCATOR
/// Contains blocks starting from common ancestor.
pub const MSG_BLOCKS_LOCATOR: u8 = 0x79;

/// GETHEADERS_LOCATOR message type - request headers using locator hashes
/// Similar to GETBLOCKS_LOCATOR but returns lightweight headers only.
/// Used for headers-first sync to verify PoW before downloading full blocks.
pub const MSG_GETHEADERS_LOCATOR: u8 = 0x7A;

// === Branch-Selective Sync Protocol ===
// Enables nodes to sync only specific space/branch combinations
// rather than the entire chain. See docs/BRANCH_SELECTIVE_SYNC.md

/// GETBLOCKS_BRANCH message type - request blocks for specific space+branch
/// Allows selective sync of only subscribed branches.
pub const MSG_GETBLOCKS_BRANCH: u8 = 0x7B;

/// SUBSCRIBE_BRANCH message type - subscribe to branch announcements
/// Tells peer we want to receive BRANCH_ANNOUNCE for this branch.
pub const MSG_SUBSCRIBE_BRANCH: u8 = 0x7C;

/// UNSUBSCRIBE_BRANCH message type - unsubscribe from branch
/// Stops receiving BRANCH_ANNOUNCE for this branch.
pub const MSG_UNSUBSCRIBE_BRANCH: u8 = 0x7D;

/// BRANCH_ANNOUNCE message type - announce new content in branch
/// Gossip message sent to subscribers when new content arrives.
pub const MSG_BRANCH_ANNOUNCE: u8 = 0x7E;

/// BRANCH_INVENTORY message type - advertise served branches
/// Sent to peers to indicate which branches this node serves.
pub const MSG_BRANCH_INVENTORY: u8 = 0x7F;

// === Space Name Resolution (Bug #4) ===
// Lightweight, view-driven protocol that lets a node ask peers for a single
// space's display name when it only has the chain-skeleton commitment.
// Avoids bulk content sync just to populate UI placeholders.

/// GET_SPACE_META message type - request a single space's display metadata
pub const MSG_GET_SPACE_META: u8 = 0xC0;

/// SPACE_META message type - response carrying space name, creator, timestamp
pub const MSG_SPACE_META: u8 = 0xC1;

// === Branch Subscription Limits ===

/// Maximum branches a node can subscribe to
pub const MAX_BRANCH_SUBSCRIPTIONS: usize = 100;

/// Maximum branches to advertise per BRANCH_INVENTORY message
pub const MAX_BRANCH_INVENTORY_ENTRIES: usize = 50;

/// Default storage budget for branch content (400MB)
pub const DEFAULT_BRANCH_STORAGE_BUDGET: u64 = 400 * 1024 * 1024;

/// Minimum storage budget (50MB - at least one full branch)
pub const MIN_BRANCH_STORAGE_BUDGET: u64 = 50 * 1024 * 1024;

// === SPEC_12: Spam Attestation Protocol (§5) ===

/// SPAM_ATTESTATION message type - flag content as spam (SPEC_12 §5)
/// Sent by Resident+ members to attest that content is spam.
pub const MSG_SPAM_ATTESTATION: u8 = 0x80;

/// COUNTER_ATTESTATION message type - dispute spam flag (SPEC_12 §5)
/// Sent by Lifeguard+ members to counter a spam attestation.
pub const MSG_COUNTER_ATTESTATION: u8 = 0x81;

/// QUALITY_ATTESTATION message type - positive quality signal (SPEC_12 §5)
/// Reserved for future use: positive attestations about content quality.
pub const MSG_QUALITY_ATTESTATION: u8 = 0x82;

/// REPUTATION_QUERY message type - query reputation state (SPEC_12 §5)
/// Query the spam attestation state for content.
pub const MSG_REPUTATION_QUERY: u8 = 0x83;

/// REPUTATION_RESPONSE message type - reputation state response (SPEC_12 §5)
/// Response with spam attestation aggregation results.
pub const MSG_REPUTATION_RESPONSE: u8 = 0x84;

// === SPEC_12: Spam Attestation Constants (§3-4) ===

/// Number of independent sponsor trees required to flag content (SPEC_12 §4.2)
pub const SPAM_ATTESTATION_THRESHOLD: u8 = 3;

/// Number of Lifeguard+ counter-attestations to clear spam flag (SPEC_12 §3.4)
pub const COUNTER_ATTESTATION_THRESHOLD: u8 = 5;

/// Decay half-life for flagged content in seconds (4 hours) (SPEC_12 §4.3)
pub const FLAGGED_DECAY_HALF_LIFE_SECS: u64 = 14_400;

// === SPEC_11: Public Sponsorship Offers (§5.1) ===

/// SPONSORSHIP_OFFER message type - broadcast new offer (SPEC_11 §5.1)
/// Sent by sponsors to advertise available sponsorship slots.
pub const MSG_SPONSORSHIP_OFFER: u8 = 0x49;

/// SPONSORSHIP_OFFER_CLAIM message type - claim an offer (SPEC_11 §5.1)
/// Sent by newcomers to claim a public sponsorship offer.
pub const MSG_SPONSORSHIP_OFFER_CLAIM: u8 = 0x4A;

/// SPONSORSHIP_CLAIM_RESPONSE message type - approval/rejection (SPEC_11 §5.1)
/// Sent by sponsors to approve or reject a pending claim.
pub const MSG_SPONSORSHIP_CLAIM_RESPONSE: u8 = 0x4B;

/// SPONSORSHIP_OFFER_QUERY message type - query available offers (SPEC_11 §5.1)
/// Request to list active sponsorship offers matching criteria.
pub const MSG_SPONSORSHIP_OFFER_QUERY: u8 = 0x4C;

/// SPONSORSHIP_OFFER_LIST message type - response to offer query (SPEC_11 §5.1)
/// Response containing matching sponsorship offers.
pub const MSG_SPONSORSHIP_OFFER_LIST: u8 = 0x4D;

// === Mempool Gossip Protocol ===

/// ACTION_ANNOUNCE message type - broadcast pending action to peers
/// Sent when a node receives a new action (POST, REPLY, ENGAGE) via RPC.
/// Other nodes add the action to their local mempool (BlockBuilder).
pub const MSG_ACTION_ANNOUNCE: u8 = 0x93;

/// GETMEMPOOL message type - request peer's mempool inventory
/// Sent on new peer connection to sync mempools.
/// Peer responds with MSG_INV containing hashes of all pending actions.
pub const MSG_GETMEMPOOL: u8 = 0x94;

/// MEMPOOL_INV message type - inventory of mempool actions
/// Response to MSG_GETMEMPOOL containing hashes of pending actions.
/// Receiver can request missing actions via MSG_GETDATA.
pub const MSG_MEMPOOL_INV: u8 = 0x95;

/// DM_REQUEST_ANNOUNCE message type - gossip a direct-message request to peers.
/// Self-authenticating (Ed25519 signature + anti-spam PoW); re-flooded until it
/// reaches the recipient, whose node stores it as a pending DM request.
pub const MSG_DM_REQUEST_ANNOUNCE: u8 = 0x96;

/// DM_ACCEPT_ANNOUNCE message type - propagate a DM acceptance back to the requester.
/// Signed by the acceptor; the requester's node flips its pending request to Accepted.
pub const MSG_DM_ACCEPT_ANNOUNCE: u8 = 0x97;

/// DM_DECLINE_ANNOUNCE message type - propagate a DM decline back to the requester.
/// Signed by the decliner; the requester's node marks its pending request Declined.
pub const MSG_DM_DECLINE_ANNOUNCE: u8 = 0x98;

/// HOLE_PUNCH_INTRO message type - a well-connected node (typically the seed)
/// introduces two NAT'd peers to each other for Layer 2 NAT traversal. The receiver
/// attempts an outbound dial to the advertised endpoint; a simultaneous dial from the
/// other side punches both NAT mappings. Advisory only (no auth beyond "a connected
/// peer suggested this address"); a bad intro just wastes one failed connect.
pub const MSG_HOLE_PUNCH_INTRO: u8 = 0x99;
