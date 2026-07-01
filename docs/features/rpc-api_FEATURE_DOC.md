# RPC API - Feature Documentation

**Section**: 12. RPC API
**Owner Directory**: `src/rpc/`
**Status**: Complete (60+ methods implemented)

---

## Overview

The Swimchain RPC API provides a JSON-RPC 2.0 interface for programmatic access to node operations, content management, and network interaction. It serves as the primary integration point for CLI tools, web frontends, mobile apps, and third-party applications.

The RPC server runs alongside the P2P server, providing local and remote access to node functionality while enforcing authentication and proof-of-work validation for write operations.

**Architecture Overview**:
- P2P Server: `0.0.0.0:9735` (network peer communication)
- RPC Server: `127.0.0.1:9736` (local CLI/API access)

---

## Quick Start Guide

Get started with the RPC API in 5 minutes. These examples use `curl` and assume a local node running on the default port.

### 1. Check Node Status

```bash
# Get node info (requires authentication via cookie)
COOKIE=$(cat ~/.swimchain/.cookie)
curl -s -X POST http://127.0.0.1:9736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n "__cookie__:$COOKIE" | base64)" \
  -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}'
```

### 2. List Spaces

```bash
# List all public spaces (first 20)
curl -s -X POST http://127.0.0.1:9736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n "__cookie__:$COOKIE" | base64)" \
  -d '{"jsonrpc":"2.0","method":"list_spaces","params":{"limit":20,"offset":0},"id":2}'
```

### 3. Get Content from a Space

```bash
# Get posts from a specific space
curl -s -X POST http://127.0.0.1:9736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n "__cookie__:$COOKIE" | base64)" \
  -d '{"jsonrpc":"2.0","method":"get_space_content","params":{"space_id":"sp1...","limit":10},"id":3}'
```

### 4. Submit a Post (requires PoW)

```bash
# Step 1: Get a PoW challenge
curl -s -X POST http://127.0.0.1:9736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n "__cookie__:$COOKIE" | base64)" \
  -d '{"jsonrpc":"2.0","method":"get_pow_challenge","params":{"action_type":"post"},"id":4}'

# Step 2: Compute PoW (client-side with Argon2id), then submit_post with the solution
```

### 5. Browser Authentication (Signature-based)

For browser clients without access to the cookie file:

```javascript
// Sign the request with your keypair
const timestamp = Math.floor(Date.now() / 1000).toString();
const paramsHash = sha256(JSON.stringify(params));
const message = `swimchain-rpc:${method}:${paramsHash}:${timestamp}`;
const signature = ed25519Sign(keypair.privateKey, message);

// Include in request headers
fetch('http://127.0.0.1:9736', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CS-Identity': keypair.publicKey,  // 64 hex chars
    'X-CS-Timestamp': timestamp,
    'X-CS-Signature': signature,         // 128 hex chars
  },
  body: JSON.stringify({jsonrpc: '2.0', method, params, id: 1})
});
```

### Common Workflows

| Task | Methods |
|------|---------|
| Browse content | `list_spaces` → `get_space_content` → `get_content` |
| Post content | `get_pow_challenge` → (compute PoW) → `submit_post` |
| React to content | `get_pow_challenge` → (compute PoW) → `submit_engage` |
| Check sync status | `get_sync_status`, `get_peer_count` |
| Manage identity | `get_identity_info`, `set_identity_name` |

---

## Architecture

```
+-----------------------------------------------------------------------+
|                          Client Layer                                  |
+---------------+---------------+---------------+-----------------------+
|   CLI Tool    |  Web Frontend |   Mobile App  |    External Tools     |
|  (RpcClient)  |  (Signature)  |  (Signature)  |   (Cookie/Creds)      |
+-------+-------+-------+-------+-------+-------+-----------+-----------+
        |               |               |                   |
        v               v               v                   v
+-----------------------------------------------------------------------+
|                     HTTP Transport (hyper)                             |
|                     POST / (JSON-RPC 2.0)                              |
|                     CORS Enabled for Browsers                          |
+-----------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
|                       Authentication Layer                             |
|  +------------------+ +------------------+ +------------------------+  |
|  |   Cookie Auth    | | Credential Auth  | |    Signature Auth      |  |
|  |   .cookie file   | |  user:password   | |   X-CS-* headers       |  |
|  +------------------+ +------------------+ +------------------------+  |
+-----------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
|                       Method Dispatcher                                |
|                    RpcMethods::dispatch()                              |
|                        60+ Methods                                     |
+-------------------------------+---------------------------------------+
                                |
          +---------------------+---------------------+
          v                     v                     v
+------------------+  +------------------+  +------------------+
|   Node State     |  |   Chain Store    |  | Content Store    |
|   SyncState      |  |   Blocks         |  |   Media          |
|   Peers          |  |   Actions        |  |   DHT            |
+------------------+  +------------------+  +------------------+
```

**Architecture Description** (for screen readers and accessibility):

The RPC API architecture consists of four layers:

1. **Client Layer**: Various clients connect to the RPC server - CLI tools use the RpcClient, web frontends and mobile apps authenticate via Ed25519 signatures using X-CS-* headers, and external tools can use cookie or credential authentication.

2. **HTTP Transport**: All clients communicate over HTTP using the POST method with JSON-RPC 2.0 protocol. CORS is enabled for browser-based clients.

3. **Authentication Layer**: Three authentication methods are supported - Cookie authentication (auto-generated .cookie file), Credential authentication (username/password), and Signature authentication (X-CS-Identity, X-CS-Timestamp, X-CS-Signature headers for browser clients).

4. **Method Dispatcher**: The RpcMethods::dispatch() function routes requests to the appropriate handlers among 60+ available methods. These methods interact with three core data stores: Node State (sync status, peer connections), Chain Store (blocks and actions), and Content Store (media and DHT lookups).

---

## Data Structures

### RpcServerConfig

Server configuration for the RPC endpoint.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bind` | `String` | `"127.0.0.1"` | IP address to bind to |
| `port` | `u16` | `9736` | Port number (network-dependent) |
| `data_dir` | `PathBuf` | `"."` | Data directory for cookie file |
| `username` | `Option<String>` | `None` | Optional username for credential auth |
| `password` | `Option<String>` | `None` | Optional password for credential auth |
| `max_body_size` | `usize` | `7MB` | Maximum request body size |

**Network-Specific Ports**:
- Mainnet: `9736`
- Testnet: `19736`
- Regtest: `29736`

**Purpose**: Configuration for the RPC HTTP server
**Used by**: `RpcServer::new()`, `NodeManager`

### RpcRequest

Standard JSON-RPC 2.0 request structure.

| Field | Type | Description |
|-------|------|-------------|
| `jsonrpc` | `String` | Must be `"2.0"` |
| `method` | `String` | Method name to call |
| `params` | `Value` | Parameters (object or array) |
| `id` | `Value` | Request ID (string, number, or null) |

**Purpose**: JSON-RPC 2.0 request structure
**Used by**: All RPC calls

### RpcResponse

Standard JSON-RPC 2.0 response structure.

| Field | Type | Description |
|-------|------|-------------|
| `jsonrpc` | `String` | Always `"2.0"` |
| `result` | `Option<Value>` | Success result (mutually exclusive with error) |
| `error` | `Option<RpcResponseError>` | Error object (mutually exclusive with result) |
| `id` | `Value` | Request ID (matches request) |

**Purpose**: JSON-RPC 2.0 response structure
**Used by**: All RPC method handlers

### RpcResponseError

Error object for failed requests.

| Field | Type | Description |
|-------|------|-------------|
| `code` | `i32` | Error code |
| `message` | `String` | Human-readable error message |
| `data` | `Option<Value>` | Optional additional error data |

**Purpose**: Error object within RPC response
**Used by**: `RpcResponse::error()`

### AuthCookie

Authentication cookie for local access.

| Field | Type | Description |
|-------|------|-------------|
| `path` | `PathBuf` | Path to cookie file (`.cookie`) |
| `value` | `String` | 64-character hex string (32 bytes) |

**Purpose**: Cookie-based authentication token
**Used by**: `Authenticator`, `RpcClient`

### Authenticator

Manages authentication for incoming requests.

| Field | Type | Description |
|-------|------|-------------|
| `cookie` | `Option<AuthCookie>` | Cookie authentication |
| `credentials` | `Option<(String, String)>` | Username/password pair |

**Purpose**: Validates RPC request authentication
**Used by**: `RpcServer::handle_request()`

### NodeRef

Reference to node components for RPC method dispatch.

| Field | Type | Description |
|-------|------|-------------|
| `state` | `Arc<RwLock<NodeState>>` | Node state |
| `start_time` | `Instant` | For uptime calculation |
| `network` | `String` | Network mode (mainnet, testnet, regtest) |
| `node_id` | `String` | Node public key (hex) |
| `p2p_port` | `u16` | P2P server port |
| `rpc_port` | `u16` | RPC server port |
| `connection_manager` | `Option<Arc<ConnectionManager>>` | Peer connections |
| `sync_state` | `Arc<RwLock<SyncState>>` | Synchronization state |
| `data_dir` | `PathBuf` | Data directory path |
| `content_store` | `Option<Arc<PersistentContentStore>>` | Content storage |
| `chain_store` | `Option<Arc<ChainStore>>` | Blockchain storage |
| `dht` | `Option<Arc<DhtManager>>` | DHT for content discovery |
| `membership_store` | `Option<Arc<MembershipStore>>` | Private space membership |
| `sponsorship_store` | `Option<Arc<SponsorshipStore>>` | Identity sponsorship chain |
| `keypair` | `KeyPair` | Node's identity keypair |
| `shutdown_tx` | `broadcast::Sender<()>` | Shutdown signal |
| `identity_name` | `Arc<RwLock<Option<String>>>` | Display name |

**Purpose**: Reference to node components for RPC method dispatch
**Used by**: `RpcMethods`

---

## Core APIs

### RpcServer

The HTTP server handling JSON-RPC requests.

#### new()
```rust
pub fn new(config: RpcServerConfig, shutdown_rx: watch::Receiver<bool>) -> Result<Self, RpcError>
```

**Purpose**: Create a new RPC server instance.

**Parameters**:
- `config`: Server configuration
- `shutdown_rx`: Shutdown signal receiver

**Returns**: `Result<RpcServer, RpcError>`

**Side effects**: Logs warning if binding to non-localhost without credentials

#### start()
```rust
pub async fn start(self, methods: RpcMethods) -> Result<SocketAddr, RpcError>
```

**Purpose**: Start the RPC server and begin accepting connections.

**Parameters**:
- `methods`: The method dispatcher to handle requests

**Returns**: The actual bound address (useful when port is 0)

**Side effects**:
- Generates authentication cookie in data directory
- Spawns TCP listener loop
- Writes `.rpc_addr` file for CLI discovery

### RpcMethods

Method dispatcher that routes requests to handlers.

#### dispatch()
```rust
pub async fn dispatch(&self, method: &str, params: Value, id: Value) -> RpcResponse
```

**Purpose**: Route an incoming request to the appropriate handler method.

**Parameters**:
- `method`: Method name to dispatch
- `params`: Method parameters
- `id`: Request ID

**Returns**: `RpcResponse` with result or error

### RpcClient

Client for connecting to RPC servers from CLI or tools.

#### new()
```rust
pub fn new(config: RpcClientConfig) -> Self
```

**Purpose**: Create a new RPC client.

#### from_data_dir()
```rust
pub fn from_data_dir(data_dir: &Path, network: &str) -> Result<Self, RpcError>
```

**Purpose**: Create client using cookie from node's data directory.

#### call()
```rust
pub fn call(&mut self, method: &str, params: Value) -> Result<RpcResponse, RpcError>
```

**Purpose**: Call an RPC method and get the raw response.

#### call_result()
```rust
pub fn call_result<T: DeserializeOwned>(&mut self, method: &str, params: Value) -> Result<T, RpcError>
```

**Purpose**: Call an RPC method and deserialize the result.

### Authenticator

#### validate()
```rust
pub fn validate(&self, auth_header: Option<&str>) -> Result<(), RpcError>
```

**Purpose**: Validate cookie or credential authentication from HTTP Basic Auth header.

#### validate_signature()
```rust
pub fn validate_signature(
    &self,
    identity: Option<&str>,
    timestamp: Option<&str>,
    signature: Option<&str>,
    method: &str,
    params_json: &[u8],
) -> Result<(), RpcError>
```

**Purpose**: Validate signature-based authentication for browser clients.

**Parameters**:
- `identity`: User's public key (64 hex chars = 32 bytes)
- `timestamp`: UNIX timestamp string
- `signature`: Ed25519 signature (128 hex chars = 64 bytes)
- `method`: RPC method name
- `params_json`: Raw JSON params bytes

---

## Behaviors

### Authentication Flow

The RPC server supports three authentication methods, tried in order:

1. **Signature Authentication** (browser clients)
   - Requires `X-CS-Identity`, `X-CS-Timestamp`, `X-CS-Signature` headers
   - Signs: `"swimchain-rpc:" + method + ":" + sha256(params_json) + ":" + timestamp`
   - Timestamp must be within tolerance (past: 1 hour, future: 5 minutes)

2. **Cookie Authentication** (CLI/local tools)
   - Uses `.cookie` file generated at node startup
   - Format: `Authorization: Basic base64(__cookie__:<cookie_hex>)`
   - Cookie is 32 random bytes (64 hex chars)

3. **Credential Authentication** (configured users)
   - Uses configured username/password
   - Format: `Authorization: Basic base64(username:password)`

**Trigger**: HTTP request to RPC server
**Outcome**: Request proceeds or returns 401/403 error

### PoW Validation for Write Operations

All content submission methods require client-side proof-of-work:

1. Client computes Argon2id PoW with appropriate difficulty
2. Submits PoW solution with content
3. Server verifies:
   - Difficulty meets minimum for action type and network
   - Hash is valid for given challenge
   - Timestamp is within tolerance
4. On success, action is added to mempool

**Network-Adjusted Difficulties**:
- Mainnet: Full difficulty requirements
- Testnet: Reduced difficulty (development)
- Regtest: Minimal difficulty (testing)

**Trigger**: Content submission (`submit_post`, `submit_reply`, `submit_engagement`, etc.)
**Outcome**: Submission accepted or `PowInvalid` error (-32010)

### Sponsorship Chain Enforcement

On Testnet and Mainnet, identities must be sponsored:

1. RPC checks `sponsorship_store.can_identity_act()`
2. Unsponsored identities receive `IdentityNotSponsored` error
3. Regtest mode bypasses this check for testing

**Trigger**: Content submission on testnet/mainnet
**Outcome**: Submission accepted or `IdentityNotSponsored` error (-32015)

### Block Formation on PoW Threshold

When mempool accumulated PoW meets threshold:

1. Leader election determines eligible block producer
2. If eligible, node forms block immediately
3. Block is broadcast to peers
4. Mempool actions are cleared

**Trigger**: Action added to mempool via RPC
**Outcome**: Block formed and propagated or action stays in mempool

### Cookie Management

**Trigger**: RPC server startup/shutdown
**Process**:
1. On start: Generate 32 random bytes, write hex to `.cookie` file with mode 0600
2. Write RPC address to `.rpc_addr` file
3. On shutdown: Delete cookie file

**Outcome**: Secure ephemeral authentication token

### CORS Support

Full CORS support for browser clients:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-CS-Identity, X-CS-Timestamp, X-CS-Signature`
- Preflight responses cached for 86400 seconds

---

## Configuration

### Server Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rpc_enabled` | `bool` | `true` | Enable RPC server |
| `rpc_bind` | `IpAddr` | `127.0.0.1` | Bind address (WARNING: 0.0.0.0 exposes to network) |
| `rpc_port` | `Option<u16>` | P2P port + 1 | RPC port (9736/19736/29736) |
| `rpc_user` | `Option<String>` | None | Credential auth username |
| `rpc_password` | `Option<String>` | None | Credential auth password |

### Network-Specific Defaults

| Network | P2P Port | RPC Port |
|---------|----------|----------|
| Mainnet | 9735 | 9736 |
| Testnet | 19735 | 19736 |
| Regtest | 29735 | 29736 |

### Example config.toml

```toml
[rpc]
enabled = true
bind = "127.0.0.1"
port = 9736
# username = "admin"
# password = "secure-password"
```

---

## RPC Methods

### Node Status Methods (7 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_info` | None | `GetInfoResult` | Node version, network, uptime, peer count, block height |
| `get_peers` | None | `Vec<PeerInfoResult>` | Connected peer list with connection details |
| `get_sync_status` | None | `GetSyncStatusResult` | Sync state, chain height, mempool status, leader election |
| `get_chain_stats` | None | `GetChainStatsResult` | Block counts, space counts, storage usage |
| `get_block` | `{ height: u64 }` | `GetBlockResult` | Block details at height |
| `get_content_block` | `{ hash: string }` | `GetContentBlockResult` | Content block details by hash |
| `stop` | None | `{ stopping: true }` | Graceful node shutdown |

**Example - get_info**:

Request:
```json
{"jsonrpc": "2.0", "method": "get_info", "params": {}, "id": 1}
```

Response:
```json
{
  "result": {
    "version": "0.1.0",
    "network": "testnet",
    "uptime_seconds": 3600,
    "peer_count": 5,
    "block_height": 1234,
    "node_id": "abc123...",
    "rpc_port": 19736,
    "p2p_port": 19735
  }
}
```

**Example - get_sync_status**:

Request:
```json
{"jsonrpc": "2.0", "method": "get_sync_status", "params": {}, "id": 1}
```

Response:
```json
{
  "result": {
    "state": "synced",
    "chain_percent": 100,
    "peer_count": 5,
    "chain_height": 1234,
    "tip_hash": "abc123...",
    "storage_mb": 256,
    "storage_target_mb": 1024,
    "last_block_time": 1704067200,
    "mempool_pow": 50,
    "mempool_threshold": 100,
    "mempool_actions": 3,
    "mempool_waiting_secs": 30,
    "leader_eligible": true,
    "leader_eta_secs": 0
  }
}
```

### Peer Management Methods (2 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `add_peer` | `{ address: string }` | `{ added, address, peer_id }` | Connect to peer |
| `remove_peer` | `{ peer_id: string }` | `{ removed: bool }` | Disconnect peer |

### Content Submission Methods (6 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `submit_post` | `SubmitPostParams` | `SubmitPostResult` | Create new post with PoW |
| `submit_reply` | `SubmitReplyParams` | `SubmitPostResult` | Reply to content with PoW |
| `submit_edit` | `SubmitEditParams` | `SubmitPostResult` | Edit existing content |
| `upload_media` | `UploadMediaParams` | `UploadMediaResult` | Upload image (base64) |
| `get_media` | `{ media_hash: string }` | `GetMediaResult` | Retrieve uploaded media |
| `submit_engagement` | `SubmitEngagementParams` | `{ success, broadcast }` | Engage with content (reactions) |

**Example - submit_post**:

Request:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_post",
  "params": {
    "space_id": "sp1...",
    "title": "Post Title",
    "body": "Post content here...",
    "author_id": "abc123...",
    "pow_nonce": 12345,
    "pow_difficulty": 20,
    "pow_nonce_space": "0123456789abcdef",
    "pow_hash": "def456...",
    "signature": "sig789...",
    "timestamp": 1704067200,
    "media_refs": []
  },
  "id": 1
}
```

Response:
```json
{
  "result": {
    "content_id": "sha256:abc123...",
    "broadcast": true,
    "recipients": 5
  }
}
```

**Emoji Codes for submit_engagement**:
- 1: heart
- 2: thumbs up
- 3: thumbs down
- 4: laugh
- 5: thinking
- 6: mind blown
- 7: fire
- 8: swimmer

### Content Query Methods (9 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_content` | `{ content_id: string }` | `GetContentResult` | Get content by ID |
| `list_spaces` | `{ limit?, offset? }` | `ListSpacesResult` | List all spaces |
| `create_space` | `CreateSpaceParams` | `CreateSpaceResult` | Create new public space |
| `list_space_content` | `ListSpaceContentParams` | `ListSpaceContentResult` | List content in space |
| `list_space_posts` | `{ space_id, limit?, offset? }` | `ListSpaceContentResult` | List posts only |
| `get_user_posts` | `GetUserPostsParams` | `GetUserPostsResult` | Get user's content |
| `request_content` | `{ content_id: string }` | `{ requested, found }` | Request content from network |
| `get_replies` | `GetRepliesParams` | `GetRepliesResult` | Get replies to content |
| `search` | `{ query, space_id?, limit? }` | Search results | Full-text search |

**Sort Options for list_space_content**: `recent`, `hot`, `top`

### Identity Methods (5 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_identity_info` | None | `GetIdentityInfoResult` | Node's loaded identity |
| `sign_message` | `{ message: string }` | `{ signature: string }` | Sign with node identity |
| `get_identity_level` | `{ identity_id: string }` | `GetIdentityLevelResult` | Get swimmer level (deprecated) |
| `get_identity_name` | None | `{ name?: string }` | Get node's display name |
| `set_identity_name` | `{ name: string }` | `{ success: bool }` | Set node's display name |

**Note**: `get_identity_level` returns placeholder values as the level system has been removed.

### Reaction Methods (4 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_reactions` | `{ content_id: string }` | `GetReactionsResult` | Get reaction counts |
| `get_user_reactions` | `{ content_id, user_id }` | `GetUserReactionsResult` | Get user's reactions |
| `get_chain_engagements` | `{ content_id?, verbose? }` | `GetChainEngagementsResult` | Debug engagement data |
| `rebuild_reactions` | None | `{ success: bool }` | Rebuild reaction cache |

### Engagement Pool Methods (4 methods) - DEPRECATED

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create_pool` | `CreatePoolParams` | `CreatePoolResult` | Create engagement pool |
| `contribute_to_pool` | `ContributeToPoolParams` | `ContributeToPoolResult` | Add PoW to pool |
| `get_pool_info` | `{ pool_id: string }` | `GetPoolInfoResult` | Get pool status |
| `get_pool_for_content` | `{ content_id: string }` | `GetPoolForContentResult` | Find pool for content |

**Note**: Pool system is deprecated. Use `submit_engagement` directly instead.

### Fork Methods (5 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create_fork` | `{ name, description, content_selector }` | Fork info | Create new fork |
| `switch_fork` | `{ fork_id: string }` | `{ success: bool }` | Switch active fork |
| `list_forks` | None | Fork list | List all forks |
| `get_fork_info` | `{ fork_id: string }` | Fork details | Get fork details |
| `get_active_fork` | None | Fork info | Get current fork |

**Content Selector Options**: `all`, `none`, `selective`

### Private Space Methods (12 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create_private_space` | `CreatePrivateSpaceParams` | `CreatePrivateSpaceResult` | Create encrypted space |
| `invite_to_space` | `InviteToSpaceParams` | `InviteToSpaceResult` | Invite user to space |
| `accept_invite` | `AcceptInviteParams` | `AcceptInviteResult` | Accept space invite |
| `leave_space` | `LeaveSpaceParams` | `LeaveSpaceResult` | Leave private space |
| `kick_member` | `KickMemberParams` | `KickMemberResult` | Remove member (admin) |
| `get_my_invites` | `{ user: string }` | `GetMyInvitesResult` | List pending invites |
| `get_space_members` | `{ space_id: string }` | `GetSpaceMembersResult` | List space members |
| `get_my_private_spaces` | `{ user: string }` | `GetMyPrivateSpacesResult` | List user's spaces |
| `request_dm` | `RequestDMParams` | `RequestDMResult` | Request DM with user |
| `accept_dm` | `AcceptDMParams` | `AcceptDMResult` | Accept DM request |
| `decline_dm` | `DeclineDMParams` | `DeclineDMResult` | Decline DM request |
| `get_pending_dm_requests` | `{ user: string }` | `GetPendingDMRequestsResult` | List DM requests |

### Spam Attestation Methods (3 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `submit_spam_attestation` | Attestation params | Result | Flag content as spam |
| `submit_counter_attestation` | Counter params | Result | Counter a spam flag |
| `get_spam_status` | `{ content_id: string }` | Spam status | Get spam status |

**Spam Reason Options**: `advertising`, `repetitive`, `off_topic`, `harassment`, `illegal_content`

### Sponsorship Methods (3 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `register_genesis_identity` | `RegisterGenesisIdentityParams` | `RegisterGenesisIdentityResult` | Register genesis identity |
| `register_sponsored_identity` | `RegisterSponsoredIdentityParams` | `RegisterSponsoredIdentityResult` | Register sponsored identity |
| `get_sponsorship_info` | `{ identity_pubkey: string }` | `SponsorshipInfo` | Get sponsorship status |

### Debug Methods (3 methods)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `dht_status` | None | DHT status | DHT routing table status |
| `content_providers` | `{ content_hash: string }` | Provider list | Find content providers |
| `verify_action_finalized` | `{ action_hash: string }` | Verification result | Check if action is on-chain |

---

## CLI Commands

### Basic Usage

```bash
# Get node info
cs get_info

# Get sync status
cs get_sync_status

# List peers
cs get_peers

# Stop node
cs stop
```

### Content Operations

```bash
# List spaces
cs list_spaces

# List content in space
cs list_space_content --space-id sp1...

# Get specific content
cs get_content --content-id sha256:abc123...

# Search content
cs search --query "search term"
```

### Testing RPC Locally

```bash
# Start node in regtest mode (no sponsorship required)
cs node start --network regtest

# Test with curl
curl -X POST http://127.0.0.1:29736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(cat ~/.swimchain/regtest/.cookie | xxd -r -p | base64)" \
  -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}'
```

---

## Error Handling

| Code | Name | Cause | Resolution |
|------|------|-------|------------|
| -32700 | `ParseError` | Malformed JSON | Check JSON syntax |
| -32600 | `InvalidRequest` | Invalid JSON-RPC format | Use JSON-RPC 2.0 |
| -32601 | `MethodNotFound` | Unknown method | Check method name |
| -32602 | `InvalidParams` | Invalid parameters | Check parameter types |
| -32603 | `InternalError` | Server error | Check server logs |
| -32000 | `ServerError` | Generic server error | Check server logs |
| -32001 | `AuthenticationRequired` | No auth provided | Add authentication |
| -32002 | `AuthenticationFailed` | Invalid credentials | Check cookie/password |
| -32003 | `NodeNotRunning` | Node offline | Start the node |
| -32004 | `ContentNotFound` | Content doesn't exist | Check content ID |
| -32005 | `PeerNotFound` | Peer doesn't exist | Check peer ID |
| -32006 | `InvalidContentId` | Malformed content ID | Use sha256:... format |
| -32007 | `InvalidSignature` | Bad signature | Regenerate signature |
| -32008 | `StorageError` | Storage failure | Check disk space |
| -32009 | `NetworkError` | Network failure | Check connectivity |
| -32010 | `PowInvalid` | PoW verification failed | Recompute PoW |
| -32011 | `SubsystemUnavailable` | Feature not ready | Wait for initialization |
| -32012 | `ContentBlocked` | Content is blocked | Content violates policy |
| -32013 | `PermissionDenied` | Insufficient permissions | Check authorization |
| -32014 | `SpaceNotFound` | Space doesn't exist | Check space ID |
| -32015 | `IdentityNotSponsored` | No sponsorship chain | Get sponsored first |

---

## Testing

### Integration Tests

```bash
# Run RPC tests
cargo test --test rpc_pow_validation

# Run with logging
RUST_LOG=debug cargo test rpc --nocapture
```

---

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `RPC_PORT_OFFSET` | `1` | Offset from P2P port to RPC port |
| `max_body_size` | `7MB` | Maximum request body (for base64 images) |
| `COOKIE_FILENAME` | `.cookie` | Cookie file name in data directory |
| `COOKIE_USERNAME` | `__cookie__` | Magic username for cookie auth |
| `COOKIE_SIZE` | `32` | Cookie size in bytes |
| `SIGNATURE_PAST_TOLERANCE_SECS` | `3600` | Max signature age (1 hour) |
| `SIGNATURE_FUTURE_TOLERANCE_SECS` | `300` | Max signature future (5 minutes) |

---

## Integration Points

### CLI Commands
All CLI commands use `RpcClient` for node communication:
- `swimchain info` -> `get_info`
- `swimchain peers` -> `get_peers`
- `swimchain sync` -> `get_sync_status`
- `swimchain post` -> `submit_post`
- `swimchain reply` -> `submit_reply`
- `swimchain space create` -> `create_space`
- `swimchain stop` -> `stop`

### Frontend SDK
Browser clients authenticate via signature headers:
```
X-CS-Identity: <public_key_hex>
X-CS-Timestamp: <unix_seconds>
X-CS-Signature: <ed25519_signature_hex>
```

Signed message format:
```
swimchain-rpc:<method>:<sha256(params_json)>:<timestamp>
```

### Network Messages
RPC actions trigger P2P broadcasts:
- `submit_post` -> `ActionAnnounce` + `IHave` + `DhtStore`
- `submit_reply` -> `ActionAnnounce` + `IHave`
- Block formation -> `BlockAnnounce`

### Storage Integration
- **ChainStore**: Block storage, space existence validation
- **ContentStore**: Content item persistence
- **BlobStore**: Large content blobs
- **MembershipStore**: Private space membership
- **SpamAttestationStore**: Spam flags
- **SponsorshipStore**: Identity sponsorship chain

---

## Security Considerations

1. **Localhost Binding**: RPC binds to 127.0.0.1 by default. Binding to 0.0.0.0 logs warning and requires credentials.

2. **Cookie Security**: Cookie file created with mode 0600 (owner read/write only on Unix).

3. **Signature Timestamps**: Signatures expire after 1 hour (past) or are rejected if >5 minutes in future.

4. **PoW Requirement**: All content submission requires valid PoW proof (anti-spam).

5. **Blocklist Check**: Content hashes checked against blocklist before storage.

6. **Sponsorship Chain**: Non-regtest networks require identity sponsorship for actions.

---

## Files

| File | Purpose |
|------|---------|
| `src/rpc/mod.rs` | Module exports, constants |
| `src/rpc/server.rs` | HTTP server, request handling, CORS |
| `src/rpc/methods.rs` | 60+ method implementations, dispatch |
| `src/rpc/auth.rs` | Authentication (cookie, credentials, signature) |
| `src/rpc/types.rs` | Request/response type definitions |
| `src/rpc/error.rs` | Error codes and types |
| `src/rpc/client.rs` | Rust client for CLI/tools |

---

## Known Limitations

1. **HTTP Only**: WebSocket transport is not implemented; clients must poll for updates
2. **No Event Broadcasting**: Real-time event subscriptions are not available
3. **Single Connection**: RPC client uses new TCP connection per request
4. **Rate Limiting**: Only spam attestation has rate limiting implemented
5. **Body Size Limit**: Maximum 7MB request body (limits media uploads)

---

## Deprecated Features

### Engagement Pools
The pool system (`create_pool`, `contribute_to_pool`, `get_pool_info`, `get_pool_for_content`) is deprecated. Use `submit_engagement` directly instead.

### Level System
The level system (`get_identity_level`) has been removed per commit a2e6934. Method returns placeholder values for backwards compatibility.

---

## Gaps Between Documentation and Implementation

1. **WebSocket Transport**: MASTER_FEATURES mentions WebSocket but only HTTP is implemented
2. **Event Broadcasting**: No real-time push events (clients must poll)
3. **Missing Files**: `rpc/pow.rs` and `rpc/events.rs` mentioned in docs don't exist (functionality integrated into `methods.rs`)
4. **Rate Limiting**: Quality checklist item not fully implemented

---

## Future Work

- WebSocket transport for real-time updates
- Server-sent events for subscriptions
- Request batching support
- Enhanced rate limiting
- Connection pooling in client

---

## Related Features

- [Proof-of-Work Systems](./proof-of-work-systems_FEATURE_DOC.md) - PoW validation details
- [Private Spaces & Encryption](./private-spaces-encryption_FEATURE_DOC.md) - Private space operations
- [Sponsorship & Sybil Resistance](./sponsorship-sybil-resistance_FEATURE_DOC.md) - Identity sponsorship
- [React SDK](./react-sdk_FEATURE_DOC.md) - React hooks for RPC

---

*Generated: 2026-01-12*
