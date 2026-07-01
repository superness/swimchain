# Mobile Platform - Feature Documentation

## Overview

The Mobile Platform (`mobile-client/`) is a React Native application for iOS and Android that provides a touch-first interface to the Swimchain network. It implements device-aware resource management, battery-conscious proof-of-work mining, and a novel "Tidal UX" interaction paradigm where content "breathes" and requires community tending to survive.

The mobile client connects to Swimchain nodes via JSON-RPC 2.0, supports offline operation through a queued action system, and provides progressive storage management with 5-tier eviction priorities.

## Architecture

```
+------------------------------------------------------------------+
|                         App.tsx                                   |
|  +------------------------------------------------------------+  |
|  |              MobileSwimchainProvider                        |  |
|  |  +----------------------+  +----------------------------+   |  |
|  |  |  GestureHandlerRoot  |  |    SafeAreaProvider       |   |  |
|  |  +----------------------+  +----------------------------+   |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
                              |
         +--------------------+--------------------+
         |                                         |
+--------v--------+                     +----------v---------+
|  RootNavigator  |                     |    Services        |
|  (Native Stack) |                     |  +---------------+ |
|                 |                     |  | SwimchainRpc  | |
|  +------------+ |                     |  | NetworkMonitor| |
|  | TabNavigator |                     |  | OfflineQueue  | |
|  | +--------+  |                     |  | StorageManager| |
|  | | Home   |  |                     |  | ChallengeManager|
|  | | Search |  |                     |  | NativeArgon2  | |
|  | | Post   |  |                     |  +---------------+ |
|  | | Profile|  |                     +--------------------+
|  | +--------+  |
|  +------------+ |                     +--------------------+
+-----------------+                     |    Hooks           |
                                        |  +---------------+ |
                                        |  | useMobilePow  | |
                                        |  | useRpc*       | |
                                        |  | useKeypair    | |
                                        |  | useStoredId   | |
                                        |  +---------------+ |
                                        +--------------------+
```

### Navigation Structure

```
RootNavigator (Stack)
├── Main (TabNavigator)
│   ├── Home Tab
│   │   ├── HomeScreen (Feed)
│   │   ├── SpaceViewScreen (Space details)
│   │   └── ThreadViewScreen (Thread + replies)
│   ├── Search Tab
│   │   └── SearchScreen
│   ├── Post Tab (Action - opens Compose modal)
│   └── Profile Tab
│       ├── ProfileScreen
│       ├── StorageScreen
│       ├── SettingsScreen
│       └── QueueScreen
└── Modal Screens
    └── ComposeScreen (Create post/reply)
```

### Component Layers

1. **App Entry** - Provider wrapping, navigation container, gesture handler
2. **Navigation** - Tab-based with modal screens, stack navigation for drilldown
3. **Screens** - Home, Search, Compose, Profile, Settings, Storage, Queue, ThreadView, SpaceView
4. **Components** - Tidal UX (BreathIndicator, TendGesture), Thread/Reply cards
5. **Services** - RPC client, network monitoring, offline queue, storage, challenge manager
6. **Hooks** - React hooks for PoW, RPC, identity, memory warnings
7. **Native Modules** - Platform-specific Argon2id implementation

## Data Structures

### RpcConfig
Configuration for connecting to a Swimchain node.

| Field | Type | Description |
|-------|------|-------------|
| host | string | Node hostname (e.g., "10.0.2.2" for Android emulator) |
| port | number | RPC port (default: 39736) |
| protocol | 'http' \| 'https' | Connection protocol |

### ContentItem
Represents a post or reply from the network.

| Field | Type | Description |
|-------|------|-------------|
| content_id | string | Unique content identifier |
| content_type | string | Type of content (post, reply) |
| author_id | string | Author's public key hex |
| space_id | string | Space this content belongs to |
| parent_id | string \| null | Parent content ID for replies |
| created_at | number | Creation timestamp (Unix seconds) |
| last_engagement | number | Last engagement timestamp |
| body | string \| null | Content body text |
| title | string \| null | Optional title for posts |
| engagement_count | number | Total engagements received |
| decay_state | string | Current decay state |
| seconds_until_decay | number \| null | Time until content decays |
| survival_probability | number | Probability of surviving (0-1) |
| reply_count | number | Number of replies |

### NetworkState
Current network connectivity state.

| Field | Type | Description |
|-------|------|-------------|
| isConnected | boolean | Device has network connectivity |
| isWifi | boolean | Connected via WiFi |
| isCellular | boolean | Connected via cellular |
| syncMode | SyncMode | Current sync behavior ('full' \| 'headers' \| 'paused') |

### SyncSettings
User-configurable sync preferences.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| wifiOnlyFullSync | boolean | true | Only do full sync on WiFi |
| cellularBudgetMb | 50 \| 100 \| 200 | 100 | Daily cellular data limit |
| backgroundSyncEnabled | boolean | true | Allow background sync |

### QueuedAction
An action queued for offline submission.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID for this queued action |
| type | 'post' \| 'reply' \| 'engage' | Action type |
| spaceId | string | Target space ID |
| content | { title?: string; body: string } | Content for posts/replies |
| replyToId | string | Parent ID for replies |
| engageSeconds | number | Engagement duration for engagements |
| status | 'pending' \| 'processing' \| 'failed' | Current status |
| retryCount | number | Number of retry attempts |
| createdAt | number | When action was queued |
| lastAttemptAt | number | Last submission attempt |
| error | string | Error message if failed |

### StorageItem
Tracked item in local storage.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Content ID |
| category | 'own' \| 'pinned' \| 'subscribed' \| 'other' | Storage category |
| bytes | number | Size in bytes |
| createdAt | number | When stored |
| lastAccessed | number | Last access timestamp |
| priority | EvictionPriority | Eviction priority (1-5) |

### StoredIdentity
User identity stored in AsyncStorage.

| Field | Type | Description |
|-------|------|-------------|
| address | string | Bech32m address (cs1...) |
| publicKey | string | Ed25519 public key (hex) |
| seed | string | Private seed (hex, encrypted) |
| createdAt | number | Identity creation timestamp |

### Argon2Config
Configuration for Argon2id PoW hashing.

| Field | Type | Value | Description |
|-------|------|-------|-------------|
| memoryKib | number | 65536 | Memory cost (64 MiB) |
| iterations | number | 3 | Time cost iterations |
| parallelism | number | 2 | Parallel lanes (mobile-optimized) |
| hashLength | number | 32 | Output hash length |

### MiningProgress
Progress updates during PoW mining.

| Field | Type | Description |
|-------|------|-------------|
| currentNonce | string | Current nonce being tested |
| hashesPerSecond | number | Mining rate |
| elapsedMs | number | Time elapsed |
| estimatedRemainingMs | number | Estimated time remaining |

### PowSolution
Successful PoW mining result.

| Field | Type | Description |
|-------|------|-------------|
| nonce | string | Winning nonce |
| hash | string | Hash meeting difficulty (hex) |
| attempts | number | Total hashes computed |
| elapsedMs | number | Total mining time |

### ContributionSettings (Rust Backend)
Device constraint configuration for network contribution.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| wifi_only | bool | true | Contribute only on WiFi |
| daily_bandwidth_cap | u64 | 500MB | Maximum daily bandwidth |
| battery_threshold | u8 | 20 | Pause below this battery % |
| thermal_pause | bool | true | Pause during thermal throttling |

### ContributionMode (Rust Backend)
User-selected commitment level affecting background behavior.

| Mode | Value | Background | WiFi Required | Daily Cap |
|------|-------|------------|---------------|-----------|
| Swimmer | 0 | No | N/A | Yes |
| ActiveSwimmer | 1 | Yes | Yes | Yes |
| DedicatedSwimmer | 2 | Yes | No | Yes |
| AnchorMode | 3 | Yes | No | No |

### ThermalState (Rust Backend)
Maps to system thermal APIs for pause decisions.

| State | Value | Pause (thermal_pause=true) | Pause (thermal_pause=false) |
|-------|-------|---------------------------|----------------------------|
| Normal | 0 | No | No |
| Fair | 1 | No | No |
| Serious | 2 | Yes | No |
| Critical | 3 | Yes | Yes (always) |

## Core APIs

### SwimchainRpc

Full JSON-RPC 2.0 client for communicating with Swimchain nodes.

#### constructor(config?: RpcConfig)
**Signature**: `constructor(config?: RpcConfig)`

**Purpose**: Create a new RPC client instance.

**Parameters**:
- `config`: Optional RPC configuration (defaults to Android emulator localhost)

**Example**:
```typescript
const rpc = new SwimchainRpc({ host: 'localhost', port: 39736 });
```

#### connect()
**Signature**: `async connect(): Promise<boolean>`

**Purpose**: Establish connection to the node and fetch node info.

**Returns**: `true` if connection successful, `false` otherwise.

#### startAutoReconnect()
**Signature**: `startAutoReconnect(intervalMs?: number): void`

**Purpose**: Begin automatic reconnection attempts at specified interval.

**Parameters**:
- `intervalMs`: Retry interval in milliseconds (default: 5000)

#### getSyncStatus()
**Signature**: `async getSyncStatus(): Promise<SyncStatus>`

**Purpose**: Get current chain synchronization status.

**Returns**: Sync state, progress percentage, peer count, storage used.

#### listSpaces()
**Signature**: `async listSpaces(): Promise<{ spaces: SpaceInfo[] }>`

**Purpose**: Fetch all known spaces from the node.

#### listSpaceContent()
**Signature**: `async listSpaceContent(spaceId: string, options?): Promise<{ items: ContentItem[] }>`

**Purpose**: Fetch content within a space.

**Parameters**:
- `spaceId`: Space to query
- `options.limit`: Maximum items (default: 50)
- `options.offset`: Pagination offset (default: 0)
- `options.sort`: Sort order ('recent' | 'hot')

#### getContent()
**Signature**: `async getContent(contentId: string): Promise<ContentItem>`

**Purpose**: Fetch a single content item by ID.

#### getReplies()
**Signature**: `async getReplies(contentId: string): Promise<{ replies: ReplyItem[]; total_count: number }>`

**Purpose**: Fetch all replies to a content item.

#### getChallenge()
**Signature**: `async getChallenge(actionType: 'post' | 'reply' | 'engagement'): Promise<Challenge>`

**Purpose**: Fetch a PoW challenge for content submission.

**Returns**: Challenge object with `challenge_id`, `challenge`, `difficulty`, and `expires_at`.

#### submitPost()
**Signature**: `async submitPost(params): Promise<{ content_id: string; broadcast: boolean; recipients: number }>`

**Purpose**: Submit a new post with PoW proof.

**Parameters**:
- `spaceId`: Target space
- `title`: Post title
- `body`: Post body
- `authorId`: Author public key hex
- `powNonce`: PoW solution nonce
- `powHash`: PoW solution hash
- `signature`: Ed25519 signature
- `timestamp`: Action timestamp

#### submitReply()
**Signature**: `async submitReply(params): Promise<{ content_id: string }>`

**Purpose**: Submit a reply to existing content.

#### submitEngagement()
**Signature**: `async submitEngagement(params): Promise<{ success: boolean; new_probability: number }>`

**Purpose**: Submit engagement (tend) to content.

---

### NetworkMonitorService

Singleton service for network state monitoring and sync mode management.

#### init()
**Signature**: `async init(): Promise<void>`

**Purpose**: Initialize network monitoring, load settings from storage.

#### subscribe()
**Signature**: `subscribe(listener: (state: NetworkState) => void): () => void`

**Purpose**: Subscribe to network state changes.

**Returns**: Unsubscribe function.

#### saveSettings()
**Signature**: `async saveSettings(settings: Partial<SyncSettings>): Promise<void>`

**Purpose**: Update sync settings and persist to storage.

#### trackCellularUsage()
**Signature**: `async trackCellularUsage(bytes: number): Promise<void>`

**Purpose**: Track cellular data usage for budget enforcement.

#### getCellularUsage()
**Signature**: `getCellularUsage(): { usedMb: number; budgetMb: number; percentage: number }`

**Purpose**: Get current cellular usage against daily budget.

---

### OfflineQueueService

Singleton service for managing offline action queue.

#### add()
**Signature**: `async add(action): Promise<string>`

**Purpose**: Add an action to the offline queue.

**Returns**: UUID of the queued action.

#### getNext()
**Signature**: `async getNext(): Promise<QueuedAction | null>`

**Purpose**: Get the oldest pending action for processing.

#### updateStatus()
**Signature**: `async updateStatus(id: string, status: QueuedActionStatus, error?: string): Promise<void>`

**Purpose**: Update action status after processing attempt.

#### retry()
**Signature**: `async retry(id: string): Promise<void>`

**Purpose**: Reset a failed action to pending for retry.

---

### StorageManagerService

Singleton service for storage management with eviction.

#### init()
**Signature**: `async init(): Promise<void>`

**Purpose**: Load storage profile and item index.

#### setProfile()
**Signature**: `async setProfile(profile: StorageProfile): Promise<void>`

**Purpose**: Set storage profile and trigger eviction if needed.

#### trackItem()
**Signature**: `async trackItem(id: string, category: string, bytes: number): Promise<void>`

**Purpose**: Track a stored item for eviction management.

#### getStats()
**Signature**: `async getStats(): Promise<StorageStats>`

**Purpose**: Get storage usage statistics by category.

#### checkEviction()
**Signature**: `async checkEviction(): Promise<void>`

**Purpose**: Check if eviction threshold reached and evict if needed.

---

### NativeArgon2

TypeScript wrapper for native Argon2id module.

#### isAvailable()
**Signature**: `isAvailable(): boolean`

**Purpose**: Check if native module is linked.

#### hash()
**Signature**: `async hash(input: Uint8Array, salt: Uint8Array, config?: Argon2Config): Promise<Uint8Array>`

**Purpose**: Compute Argon2id hash.

#### mine()
**Signature**: `async mine(challenge: Uint8Array, difficulty: number, config?: Argon2Config, onProgress?: MiningProgressCallback): Promise<PowSolution>`

**Purpose**: Mine for a valid PoW solution with progress callbacks.

#### cancel()
**Signature**: `cancel(): void`

**Purpose**: Cancel ongoing mining operation.

## React Hooks

### useMobilePow()
**Signature**: `function useMobilePow(): UseMobilePowResult`

**Purpose**: Battery-conscious PoW mining with progress tracking.

**Returns**:
```typescript
{
  state: 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';
  progress: MiningProgress | null;
  solution: PowSolution | null;
  error: string | null;
  mine: (challenge: Uint8Array, difficulty: number) => Promise<PowSolution>;
  cancel: () => void;
  estimateDuration: (difficulty: number) => number;
  estimateBattery: (durationMs: number) => number;
  isNativeAvailable: boolean;
}
```

**Example**:
```typescript
const { mine, progress, estimateBattery } = useMobilePow();

// Estimate battery usage
const batteryPct = estimateBattery(51000); // ~8.5% for 51s mining

// Start mining
const solution = await mine(challengeBytes, 9);
```

### useRpcConnection()
**Signature**: `function useRpcConnection(): UseRpcConnectionResult`

**Purpose**: RPC connection state with auto-reconnect.

**Returns**:
```typescript
{
  rpc: SwimchainRpc;
  connected: boolean;
  connecting: boolean;
  reconnect: () => Promise<void>;
}
```

### useSpaces()
**Signature**: `function useSpaces(): UseSpacesResult`

**Purpose**: Fetch and cache space list.

**Returns**: `{ spaces, loading, error, refresh }`

### useSpaceThreads()
**Signature**: `function useSpaceThreads(spaceId: string | null): UseSpaceThreadsResult`

**Purpose**: Fetch threads within a space.

**Returns**: `{ threads, loading, error, refresh }`

### useThread()
**Signature**: `function useThread(contentId: string | null): UseThreadResult`

**Purpose**: Fetch thread with all replies.

**Returns**: `{ thread, replies, loading, error, refresh }`

### useStoredIdentity()
**Signature**: `function useStoredIdentity(): UseStoredIdentityResult`

**Purpose**: Manage identity in AsyncStorage.

**Returns**:
```typescript
{
  identity: StoredIdentity | null;
  loading: boolean;
  save: (identity: StoredIdentity) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

### useKeypair()
**Signature**: `function useKeypair(): UseKeypairResult`

**Purpose**: Derive signing keypair from stored identity.

**Returns**:
```typescript
{
  keypair: KeypairLike | null;
  publicKeyHex: string | null;
  address: string | null;
  loading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
  isReady: boolean;
}
```

## Behaviors

### Network-Aware Sync State Machine

```
                    +--------+
                    |  Init  |
                    +---+----+
                        |
                        v
            +-----------+-----------+
            |                       |
            v                       v
    +-------+-------+       +-------+-------+
    |  No Network   |       | Has Network   |
    | syncMode:     |       +-------+-------+
    |  'paused'     |               |
    +---------------+       +-------+-------+
                            |               |
                            v               v
                    +-------+---+   +-------+---+
                    |   WiFi    |   | Cellular  |
                    | syncMode: |   +-----+-----+
                    |  'full'   |         |
                    +-----------+   +-----+-----+
                                    |           |
                                    v           v
                            +-------+---+ +-----+-----+
                            | Under     | | Over      |
                            | Budget    | | Budget    |
                            | syncMode: | | syncMode: |
                            | 'headers' | | 'paused'  |
                            +-----------+ +-----------+
```

**Sync Modes**:
- `full`: Download all blocks and content
- `headers`: Download only block headers (save bandwidth)
- `paused`: No sync activity

### Storage Eviction Algorithm

Storage eviction uses LRU with 5-tier priority:

```
1. Calculate usage percentage: usedBytes / maxBytes
2. If below evictionThreshold, return
3. Target 75% of maxBytes after eviction
4. Get all items sorted by:
   a. Priority (ascending - lower = evict first)
   b. lastAccessed (ascending - older = evict first)
5. Evict items until target reached
6. Never evict OwnContent (priority 5)
```

**Priority Levels** (lowest evicted first):
1. OldUnfollowed - Content >7 days old, not in subscribed spaces
2. OldFollowed - Content >7 days old, in subscribed spaces
3. RecentFollowed - Content <=7 days old, in subscribed spaces
4. Pinned - User-pinned content
5. OwnContent - Content authored by user (never evicted)

### Offline Queue Retry Logic

```
1. Action added to queue with status 'pending'
2. When online, get oldest pending action
3. Set status to 'processing'
4. Attempt submission:
   a. Success: Remove from queue
   b. Failure:
      - Increment retryCount
      - Set status to 'failed'
      - If retryCount < MAX_RETRIES (3), can be retried
      - If retryCount >= MAX_RETRIES, stays failed
5. User can manually retry failed actions
```

### Battery-Aware PoW Mining

Mining operations are designed to be battery-conscious with user feedback:

1. Fetch challenge from node with difficulty based on action type
2. Calculate estimated duration using difficulty lookup table
3. Calculate battery usage estimate (~5% per 30 seconds)
4. Display mining progress UI with cancel option
5. Execute native Argon2id mining with progress callbacks
6. On completion, submit content with PoW solution

### Challenge Lifecycle Management

```
1. fetchChallenge(actionType, contentHash)
   ↓
2. Store with fetchedAt timestamp
   ↓
3. Mining begins
   ↓
4. shouldRefresh() checks if elapsed > 80% of 10 min (8 minutes)
   ↓
5. If approaching expiry during mining, onExpiryWarning callback fires
   ↓
6. On submission rejection, handleRejection() determines retry strategy
```

## Tidal UX System

The mobile client implements a novel "Tidal UX" paradigm where content has visible vitality and requires community tending to survive. This is implemented through specialized components.

### BreathIndicator Component

Visualizes content vitality through animated "breathing" dots and wave.

**Props**:
- `survivalProbability`: number (0-1) - Content's survival probability
- `size`: 'sm' | 'md' | 'lg' - Size variant
- `showWave`: boolean - Show wave animation

**Breath States**:

| Survival Probability | State | Color | Dots | Pulse |
|---------------------|-------|-------|------|-------|
| >= 80% | strong | #14B8A6 (teal) | 5/5 | 1000ms |
| >= 50% | steady | #60A5FA (blue) | 3/5 | 1500ms |
| >= 20% | fading | #A78BFA (lavender) | 2/5 | 2500ms |
| >= 5% | gasping | #F59E0B (amber) | 1/5 | irregular |
| < 5% | final | #9CA3AF (gray) | 0/5 | 6000ms |

### TendGesture Component

Hold-to-tend interaction with tiered contribution levels.

**Props**:
- `contentId`: string - Content to tend
- `currentBreaths`: number - Current breath state
- `onTendStart`: () => void - Called when tend begins
- `onTendProgress`: (progress: number) => void - Progress updates (0-1)
- `onTendComplete`: (seconds: number) => void - Called with contribution
- `onTendCancel`: () => void - Called if cancelled
- `isMining`: boolean - Disable during mining
- `disabled`: boolean - Disable interaction

**Contribution Tiers**:

| Hold Duration | Seconds | Haptic |
|--------------|---------|--------|
| 1000ms | 5 | impactLight |
| 2500ms | 15 | impactMedium |
| 5000ms | 30 | impactHeavy |

### Other Tidal Components

- **DepthFeed** - Depth-based content navigation (Surface, Shallows, Deep, Archive)
- **RescueMission** - Collaborative real-time content saving
- **StewardshipProfile** - Profile focused on tending history

## Configuration

### Protocol Constants

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| CHALLENGE_EXPIRY_SECS | number | 600 | Challenge valid for 10 minutes |
| CHALLENGE_REFRESH_THRESHOLD | number | 0.8 | Refresh at 80% (8 minutes) |
| MAX_POW_RETRIES | number | 3 | Maximum mining retry attempts |

### Argon2id Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| memoryKib | 65536 | 64 MiB memory |
| iterations | 3 | Time cost |
| parallelism | 2 | Parallel lanes (mobile-optimized) |
| hashLength | 32 | Output hash size |

### Difficulty Settings

| Action | Difficulty | Expected Time |
|--------|------------|---------------|
| post | 9 | ~51 seconds |
| reply | 8 | ~26 seconds |
| engage | 8 | ~26 seconds |

### Battery Estimates

| Metric | Value |
|--------|-------|
| perThirtySeconds | 5% |

### Storage Profiles

| Profile | Max Size | Eviction Threshold |
|---------|----------|-------------------|
| Budget1GB | 1 GB | 85% |
| Standard5GB | 5 GB | 90% |
| Flagship10GB | 10 GB | 92% |

### Engagement Pool Settings

| Setting | Value |
|---------|-------|
| requiredSeconds | 60 |
| contributionOptions | [5, 15, 30] |

### Content Limits

| Limit | Value |
|-------|-------|
| titleMaxLength | 140 |
| bodyMaxLength | 10000 |
| spaceNameMaxLength | 32 |

### AsyncStorage Keys

| Key | Purpose |
|-----|---------|
| @swimchain/identity | Stored user identity |
| @swimchain/sync_settings | Sync preferences |
| @swimchain/cellular_usage | Daily cellular usage tracking |
| @swimchain/offline_queue | Queued offline actions |
| @swimchain/storage_settings | Storage profile |
| @swimchain/storage_items | Storage item index |

## RPC Methods

### get_info
**Request**:
```json
{"jsonrpc": "2.0", "method": "get_info", "params": {}, "id": 1}
```

**Response**:
```json
{
  "result": {
    "version": "0.1.0",
    "network": "testnet",
    "uptime_seconds": 3600,
    "peer_count": 5,
    "block_height": 12345,
    "node_id": "...",
    "rpc_port": 39736,
    "p2p_port": 39735
  }
}
```

### get_sync_status
**Request**:
```json
{"jsonrpc": "2.0", "method": "get_sync_status", "params": {}, "id": 1}
```

**Response**:
```json
{
  "result": {
    "state": "synced",
    "chain_percent": 100,
    "peer_count": 5,
    "storage_mb": 128
  }
}
```

### list_spaces
**Request**:
```json
{"jsonrpc": "2.0", "method": "list_spaces", "params": {}, "id": 1}
```

**Response**:
```json
{
  "result": {
    "spaces": [
      {"space_id": "...", "name": "general", "post_count": 42, "last_activity": 1704067200}
    ],
    "total": 1
  }
}
```

### list_space_content
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "list_space_content",
  "params": {"space_id": "...", "limit": 50, "offset": 0, "sort": "recent"},
  "id": 1
}
```

### get_content
**Request**:
```json
{"jsonrpc": "2.0", "method": "get_content", "params": {"content_id": "..."}, "id": 1}
```

### get_replies
**Request**:
```json
{"jsonrpc": "2.0", "method": "get_replies", "params": {"content_id": "..."}, "id": 1}
```

### get_challenge
**Request**:
```json
{"jsonrpc": "2.0", "method": "get_challenge", "params": {"action_type": "post"}, "id": 1}
```

**Response**:
```json
{
  "result": {
    "challenge_id": "...",
    "challenge": "...",
    "difficulty": 9,
    "expires_at": 1704068000
  }
}
```

### submit_content
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_content",
  "params": {
    "space_id": "...",
    "parent_id": null,
    "title": "Post Title",
    "body": "Post body content",
    "author_id": "...",
    "pow_nonce": 12345,
    "pow_hash": "...",
    "signature": "...",
    "timestamp": 1704067200
  },
  "id": 1
}
```

### submit_engagement
**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_engagement",
  "params": {
    "content_id": "...",
    "author_id": "...",
    "pow_nonce": 12345,
    "pow_hash": "...",
    "signature": "...",
    "timestamp": 1704067200
  },
  "id": 1
}
```

## CLI Commands

The mobile client does not have CLI commands. Node operations are performed via the main Swimchain CLI:

### cs node start
```bash
cs node start --rpc-port 39736
```
Start node that mobile connects to.

### cs node info
```bash
cs node info
```
Check node status.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| NativeArgon2 module not available | Native module not linked | Run `pod install` (iOS) or rebuild (Android) |
| Mining already in progress | Called mine() while mining | Wait for current mining to complete or cancel |
| RPC Error -32600 | Invalid JSON-RPC request | Check request format |
| RPC Error -32601 | Method not found | Verify method name |
| RPC Error -32602 | Invalid params | Check parameter types |
| HTTP 401 | Authentication failed | Check dev cookie or signature |
| HTTP 503 | Node not synced | Wait for node sync |
| Network request failed | No connectivity | Check network, use offline queue |
| Cellular budget exceeded | Over daily limit | Wait for reset or use WiFi |

### Rejection Codes (PoW)

| Code | Name | Cause | Needs New Challenge? |
|------|------|-------|---------------------|
| 0x01 | INVALID_HASH | PoW hash doesn't meet difficulty | Yes |
| 0x02 | EXPIRED_CHALLENGE | Challenge expired (>10 min) | Yes |
| 0x03 | INVALID_SIGNATURE | Ed25519 signature invalid | No |
| 0x04 | INSUFFICIENT_DIFFICULTY | Difficulty too low for action | Yes |

## Testing

### Running the Development Server

```bash
cd mobile-client
pnpm install

# Start Metro bundler
pnpm start

# Run on Android
pnpm android

# Run on iOS
pnpm ios
```

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
```

### Testing with Local Node

```bash
# Terminal 1: Start local node
cs node start --data-dir ./testnet --rpc-port 39736 --dev-cookie cdd2b0a77b6bd9a8d6f2b85ec73c2ba7724b4f3962cfbb2ed779362d078387d1

# Terminal 2: Run mobile app
cd mobile-client && pnpm android
```

### Mobile Simulation Tests

```bash
# Run Rust backend device constraint tests
cargo test --package swimchain --lib device_constraints

# Run mobile simulation tests
cargo test --test mobile_simulation

# Run PoW benchmark
cargo bench --bench mobile_pow
```

### Android Emulator Network

The mobile client uses `10.0.2.2` as the host for Android emulator, which maps to the host machine's localhost.

## Known Limitations

1. **Ed25519 Signing Stub**: The `useKeypair` hook currently uses a stub implementation for signing that returns zero bytes. Production use requires integrating a native Ed25519 module.

2. **Native Argon2 Not Bundled**: Native Argon2id source files (Android/iOS) are not included in the repository. They must be implemented or a third-party library must be integrated.

3. **No Test Suite**: Jest is configured but no test files exist. Testing relies on manual verification.

4. **Battery Estimation Static**: Battery usage estimation uses a static ~5%/30s calculation. No real-time battery API integration.

5. **No Thermal Awareness**: Device thermal state monitoring is not implemented despite being supported in the Rust backend.

6. **No Push Notifications**: Rescue mission notifications mentioned in TIDAL_VISION.md are not implemented.

7. **Background Sync Setting Only**: The backgroundSyncEnabled setting exists in UI but no actual background task implementation.

8. **Single Dev Cookie**: Authentication uses a hardcoded dev cookie. Production requires signature-based authentication.

9. **Maximum Threading Depth**: Reply nesting limited to 2 levels per CLIENT_DESIGN.md.

10. **Argon2 Parallelism Discrepancy**: Mobile uses parallelism=2 while MASTER_FEATURES §2 documents parallelism=4.

11. **SPEC_03 Difficulty Infeasible**: Default difficulties (16-22) from SPEC_03 are infeasible on mobile. Mobile uses reduced difficulty (8-10).

## Future Work

### High Priority
- Implement native Ed25519 signing module
- Add native Argon2id implementations (Android/iOS)
- Create comprehensive test suite
- Implement push notifications for rescue missions

### Medium Priority
- Real-time battery monitoring via native APIs
- Thermal throttling based on device temperature
- Background sync task implementation
- Production authentication (remove dev cookie)
- Update MASTER_FEATURES §24 to document all 20+ implemented features

### Lower Priority
- Accessibility audit and improvements
- Internationalization (i18n)
- Tablet and landscape layout support
- Offline mode with full sync on reconnect

### Tidal UX Roadmap
- Phase 2: Rescue mission real-time collaboration
- Phase 3: Fork visualization, archive exploration
- Phase 4: Performance optimization, accessibility
- Phase 5: Desktop companion, API for integrations

## Related Features

- [Device Constraints](./device-constraints_FEATURE_DOC.md) - Backend device constraint logic
- [Storage Layer](../MASTER_FEATURES.md#5-storage-layer) - Eviction priorities, storage profiles
- [Proof-of-Work Systems](../MASTER_FEATURES.md#2-proof-of-work-systems) - Argon2id mining, difficulty scaling
- [RPC API](../MASTER_FEATURES.md#12-rpc-api) - JSON-RPC protocol, all methods
- [React SDK](../MASTER_FEATURES.md#15-react-sdk) - Shared hooks and encryption utilities
- [Seeding & Availability](../MASTER_FEATURES.md#21-seeding--availability) - Mobile seeding configuration

---

## Rust Backend Integration

The mobile client integrates with Rust-based device constraint management for backend behavior.

### ContributionSettings (Rust Backend)

```rust
pub struct ContributionSettings {
    pub wifi_only: bool,           // Default: true
    pub daily_bandwidth_cap: u64,  // Default: 500_000_000 (500 MB)
    pub battery_threshold: u8,     // Default: 20 (pause at 20%)
    pub thermal_pause: bool,       // Default: true
}
```
**Location**: `src/device_constraints/types.rs:27-40`

**Presets**:
- `minimal()`: WiFi-only, 100MB cap, 30% battery threshold
- `maximum()`: No restrictions, unlimited cap, 5% threshold

### ContributionMode (Rust Backend)

```rust
pub enum ContributionMode {
    Swimmer = 0,          // Foreground only, minimal background
    ActiveSwimmer = 1,    // Background on WiFi with daily cap
    DedicatedSwimmer = 2, // Background always, high daily cap
    AnchorMode = 3,       // Always-on, no cap
}
```
**Location**: `src/device_constraints/types.rs:103-117`

### ThermalState (Rust Backend)

```rust
pub enum ThermalState {
    Normal = 0,   // OK to contribute
    Fair = 1,     // OK to contribute
    Serious = 2,  // Pause if thermal_pause enabled
    Critical = 3, // Always pause (regardless of settings)
}
```
**Location**: `src/device_constraints/types.rs:218-231`

### BatteryChecker Hysteresis

The Rust backend implements battery monitoring with hysteresis to prevent rapid pause/resume cycling:

```
RESUME_HYSTERESIS_PERCENT = 5

If paused at 20% threshold:
  - Resume only at 25% (threshold + 5) OR when charging
  - Charging bypasses all battery checks
  - Critical thermal (ThermalState::Critical) always pauses
```
**Location**: `src/device_constraints/battery.rs:13, 141-182`

### DeviceConstraintManager (Rust Backend)

Unified manager coordinating all constraints:

```rust
impl DeviceConstraintManager {
    pub fn should_contribute(&self) -> bool  // Check all constraints
    pub fn check_constraints(&self) -> ConstraintStatus  // Detailed status
    pub fn try_serve(&self, bytes: u64) -> u64  // Acquire bandwidth
    pub fn battery_state(&self) -> BatteryState
    pub fn remaining_daily_bandwidth(&self) -> u64
    pub fn efficiency_score(&self) -> f32
    pub fn qualifies_for_efficient_swimmer(&self) -> bool
}
```
**Location**: `src/device_constraints/manager.rs:102-344`

---

## Mobile Simulation Test Results

Based on `tests/mobile_simulation/full_flow.rs`:

### Viability Summary

| Category | Finding |
|----------|---------|
| **Storage** | Budget1GB viable for 100+ users; decay bounds to ~130 MB steady state |
| **Network** | Header-only sync saves 70%+ bandwidth |
| **Sync Times** | 100K headers (20 MB): 16s on 4G, 80s on 3G |
| **Budget Phone** | 50 MB/day can sync 262K headers |
| **PoW** | Mobile config ~100ms/hash; difficulty 8 = ~26s (acceptable) |

### Difficulty Feasibility

| Difficulty | Attempts | Expected Time | Mobile Feasible? |
|------------|----------|---------------|------------------|
| 4 | 16 | 1.6s | Yes |
| 6 | 64 | 6.4s | Yes |
| 8 | 256 | 26s | Yes (target) |
| 10 | 1024 | 102s | Marginal |
| 12 | 4096 | 410s | No |
| 16 | 65536 | 1.8h | No |
| 20 | 1M | 29h | No (SPEC default) |

**Recommendation**: Use difficulty 8-10 for mobile. SPEC_03 defaults (16-22) are infeasible.

### Acceptance Criteria

Per `tests/mobile_simulation/full_flow.rs`:
- Full flow (identity → sync → PoW → view) must complete in under 10 minutes
- Budget 3G flow should complete in under 60 seconds with test config
- Mobile PoW config validated: 64 MiB, 3 iterations, parallelism 2
