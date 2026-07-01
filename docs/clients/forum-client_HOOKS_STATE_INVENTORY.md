# forum-client: Hooks & State Inventory

Complete documentation of all custom hooks, context providers, and state management patterns in the Swimchain forum-client.

---

## Table of Contents

1. [Provider Hierarchy](#provider-hierarchy)
2. [Context Providers](#context-providers)
3. [Custom Hooks](#custom-hooks)
4. [State Patterns](#state-patterns)
5. [Data Flow](#data-flow)
6. [Caching Strategies](#caching-strategies)

---

## Provider Hierarchy

The application wraps components in multiple providers, ordered from outermost to innermost:

```
main.tsx:
┌─────────────────────────────────────────────┐
│ React.StrictMode                            │
│  └─ ErrorBoundary                           │
│      └─ SwimchainProvider (WASM)            │
│          └─ RpcProvider (Node Connection)   │
│                                             │
│  App.tsx:                                   │
│              └─ PreferencesProvider         │
│                  └─ BrowserRouter           │
│                      └─ IdentityProvider    │
│                          └─ KeyboardNav...  │
│                              └─ MainLayout  │
│                                  └─ Routes  │
└─────────────────────────────────────────────┘
```

---

## Context Providers

### SwimchainProvider (`src/providers/SwimchainProvider.tsx`)

**Purpose**: Initialize and provide WASM module for cryptographic operations

**Value Shape**:
```typescript
interface SwimchainContextValue {
  isLoaded: boolean;      // True when WASM is ready
  loadError: Error | null; // Error if WASM failed to load
}
```

**Initialization**:
- Calls `initWasm()` from local loader on mount
- Shows `fallback` prop content until loaded
- Triggers `onLoad` / `onError` callbacks

**Used By**: `useSwimchain()`, `useRequireSwimchain()`

**Children Access**: `useSwimchain()` hook

---

### RpcProvider (`src/hooks/useRpc.tsx`)

**Purpose**: Manage JSON-RPC connection to local Swimchain node with signature authentication

**Value Shape**:
```typescript
interface RpcContextValue {
  rpc: SwimchainRpc | null;   // RPC client instance
  connected: boolean;          // Connection status
  connecting: boolean;         // True during connection attempt
  error: string | null;        // Connection error
  nodeInfo: {                  // Cached node information
    version: string;
    network: string;
    peerCount: number;
  } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
}
```

**Initialization**:
1. Checks for parent frame config (desktop-app wrapper)
2. Falls back to env var `VITE_USE_REMOTE_SEED`
3. Falls back to Tauri auth (desktop app)
4. Falls back to `LOCAL_CONFIG` (localhost:19736 for testnet)
5. Loads identity from localStorage for signature auth
6. Auto-reconnects every 5 seconds if connection fails
7. Monitors identity changes and reconnects with new credentials

**Authentication Methods**:
- **Signature Auth**: Ed25519 signatures using stored identity seed
- **Basic Auth**: Username/password (Tauri desktop app)
- **Auth Header**: Raw `Authorization` header from parent frame

**Used By**: All data-fetching hooks, submission hooks

---

### IdentityProvider (`src/providers/IdentityProvider.tsx`)

**Purpose**: Global identity state management with localStorage persistence

**Value Shape**:
```typescript
interface IdentityContextValue {
  identity: StoredIdentity | null;  // Current identity
  isLoading: boolean;               // Loading from storage
  hasValidIdentity: boolean;        // Has seed + address
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
}
```

**Storage**: `localStorage['swimchain-identity']`

**StoredIdentity Shape**:
```typescript
interface StoredIdentity {
  address: string;      // cs1... bech32m address
  publicKey: string;    // 64-char hex (32 bytes)
  seed: string;         // 64-char hex private key
  createdAt: number;    // UNIX timestamp
  powSolution?: {       // Optional saved PoW
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}
```

**Used By**: `useIdentityContext()`, `RequireIdentity` component

---

### PreferencesProvider (`src/hooks/usePreferences.tsx`)

**Purpose**: User preferences with localStorage persistence

**Value Shape**:
```typescript
interface PreferencesContextValue {
  preferences: Preferences;
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetToDefaults: () => void;
}

interface Preferences {
  threadOrdering: 'newest' | 'oldest' | 'replies' | 'active';
  threadsPerPage: number;      // Default: 25
  storageTargetMB: number;     // Default: 500
}
```

**Storage**: `localStorage['swimchain-preferences']`

**Used By**: `usePreferences()`, Settings page, thread sorting

---

### KeyboardNavigationProvider (`src/hooks/useKeyboardNavigation.tsx`)

**Purpose**: Vim-style keyboard navigation across the application

**Value Shape**:
```typescript
interface KeyboardNavContextValue {
  selectedIndex: number;           // Currently selected item
  setSelectedIndex: (i: number) => void;
  items: string[];                 // Navigable item paths
  setItems: (items: string[]) => void;
  isShortcutsModalOpen: boolean;
  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
}
```

**Keyboard Shortcuts**:
| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `Enter` | Open selected item |
| `n` | Focus new thread form |
| `r` | Focus reply form |
| `e` | Engage +5 seconds |
| `E` | Engage +15 seconds |
| `/` | Focus search |
| `?` | Show shortcuts help |
| `Backspace` | Go back |
| `Escape` | Close modal |

**Used By**: `useKeyboardNavigation()`, thread lists, replies

---

## Custom Hooks

### Identity & Authentication

#### useStoredIdentity (`src/hooks/useStoredIdentity.ts`)

**Purpose**: Persist user identity to localStorage

**Parameters**: None

**Returns**:
```typescript
interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}
```

**Storage**: `localStorage['swimchain-identity']`

**Side Effects**: Reads/writes localStorage on load/set/clear

**Dependencies**: None

---

#### useStoredKeypair (`src/hooks/useStoredKeypair.ts`)

**Purpose**: Bridge stored identity to WASM Keypair for signing operations

**Parameters**: None

**Returns**:
```typescript
interface UseStoredKeypairResult {
  keypair: WasmKeypair | null;    // WASM keypair object
  publicKey: Uint8Array | null;   // 32-byte public key
  address: string | null;         // cs1... bech32m address
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}
```

**Side Effects**:
- Creates WASM Keypair from hex seed
- Auto-frees keypair on unmount

**Dependencies**: `useSwimchain()`, `useStoredIdentity()`

**Used By**: Post submission, reply submission, engagement

---

#### useNodeIdentity (`src/hooks/useNodeIdentity.ts`)

**Purpose**: Use the node's identity via RPC (alternative to browser identity)

**Parameters**: None

**Returns**:
```typescript
interface UseNodeIdentityResult {
  identity: NodeIdentity | null;  // { publicKey, address }
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
  refetch: () => void;
}
```

**Side Effects**: RPC call to `get_identity_info`, `sign_message`

**Dependencies**: `useRpc()`

---

#### useKeypair (`src/hooks/useKeypair.ts`)

**Purpose**: Generate fresh in-memory WASM keypairs

**Parameters**: None

**Returns**:
```typescript
interface UseKeypairResult {
  keypair: WasmKeypair | null;
  address: string | null;
  generate: () => void;
  clear: () => void;
}
```

**Side Effects**: Creates new WASM Keypair, frees previous on clear

**Dependencies**: `useSwimchain()`

**Used By**: Identity creation page

---

### RPC & Data Fetching

#### useRpc (`src/hooks/useRpc.tsx`)

**Purpose**: Access RPC context for node communication

**Parameters**: None

**Returns**: `RpcContextValue` (see RpcProvider above)

**Side Effects**: None (just context access)

**Dependencies**: Must be within `RpcProvider`

---

#### useNetworkStatus (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch network sync status from node

**Parameters**: None

**Returns**:
```typescript
{
  status: SyncStatus | null;
  loading: boolean;
  error: string | null;
}
```

**Side Effects**:
- RPC calls to `get_sync_status`, `get_peers`
- Auto-refreshes every 10 seconds

**Dependencies**: `useRpc()`

---

#### useSyncStatus (`src/hooks/useSyncStatus.ts`)

**Purpose**: Simplified sync status hook

**Parameters**: None

**Returns**:
```typescript
interface UseSyncStatusResult {
  syncStatus: SyncStatus;
  connected: boolean;
  refresh: () => void;
}
```

**Side Effects**: RPC call, 10-second polling interval

**Dependencies**: `useRpc()`

---

#### useSpaces (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch list of all spaces from node

**Parameters**: None

**Returns**:
```typescript
{
  spaces: Space[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Caching**:
- Memory cache: 5 minutes TTL
- localStorage cache: 30 minutes TTL
- Background refresh on storage cache hit

**Side Effects**: RPC call to `list_spaces`

**Dependencies**: `useRpc()`

---

#### useSpaceThreads (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch paginated threads for a space

**Parameters**:
```typescript
(spaceId: string, options?: { offset?: number; limit?: number })
```

**Returns**:
```typescript
{
  threads: Thread[];
  loading: boolean;
  error: string | null;
  fetching: boolean;    // Fetching missing content from network
  total: number;        // Total count for pagination
  refetch: () => Promise<void>;
}
```

**Caching**: Memory cache, 2-minute TTL

**Side Effects**:
- RPC call to `list_space_posts`
- Auto-requests missing content bodies from network
- Polls for content arrival (2s intervals, 30s max)

**Dependencies**: `useRpc()`

---

#### useThread (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch a single thread with pool data

**Parameters**: `contentId: string`

**Returns**:
```typescript
{
  thread: Thread | null;
  loading: boolean;
  error: string | null;
  fetching: boolean;    // Fetching from network
  refetch: () => Promise<void>;
}
```

**Side Effects**:
- RPC calls to `get_content`, `get_pool_for_content`
- Auto-requests missing content from network
- Polls for content arrival (1s intervals, 30s max)

**Dependencies**: `useRpc()`

---

#### useReplies (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch and build reply tree for content

**Parameters**: `contentId: string`

**Returns**:
```typescript
{
  replies: Reply[];     // Tree structure
  loading: boolean;
  fetching: boolean;    // Fetching missing bodies
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Side Effects**:
- RPC call to `get_replies`
- Builds nested tree from flat list
- Requests missing bodies from network
- Sorts by depth then creation time

**Dependencies**: `useRpc()`

---

#### useReactions (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch emoji reactions for content

**Parameters**: `contentId: string`

**Returns**:
```typescript
{
  reactions: {
    reactions: Array<{ emoji: string; reactionType: number; count: number }>;
    total: number;
    userReactions?: number[];  // User's own reactions
  } | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Side Effects**: RPC calls to `get_reactions`, `get_user_reactions`

**Dependencies**: `useRpc()`

---

#### useSpamStatus (`src/hooks/useRpc.tsx`)

**Purpose**: Fetch spam attestation status for content

**Parameters**: `contentId: string`

**Returns**:
```typescript
{
  status: SpamStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Side Effects**: RPC call to `get_spam_status`

**Dependencies**: `useRpc()`

---

#### useUserProfile (`src/hooks/useUserProfile.ts`)

**Purpose**: Fetch user profile data from profile space

**Parameters**: `userPk: string | undefined`

**Returns**:
```typescript
{
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Caching**: In-memory Map with 60-second TTL

**Side Effects**: RPC call to `list_posts_for_space` on profile space

**Dependencies**: `useRpc()`

---

#### useUserProfiles (`src/hooks/useUserProfile.ts`)

**Purpose**: Batch fetch multiple user profiles

**Parameters**: `userPks: string[]`

**Returns**:
```typescript
{
  profiles: Map<string, UserProfile>;
  loading: boolean;
}
```

**Caching**: Shared in-memory cache with `useUserProfile`

**Side Effects**: Batch RPC calls (5 concurrent max)

**Dependencies**: `useRpc()`

---

### Content Submission

#### usePostSubmit (`src/hooks/useRpc.tsx`)

**Purpose**: Submit new posts (threads) with PoW

**Parameters**: None

**Returns**:
```typescript
{
  submitPost: (
    spaceId: string,
    title: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Promise<Uint8Array | null>,
    powParams: { pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp },
    mediaRefs?: Array<{ media_hash, media_type, size_bytes }>
  ) => Promise<{ success: boolean; contentId: string | null }>;
  submitting: boolean;
  error: string | null;
}
```

**Side Effects**: RPC call to `submit_post`

**Dependencies**: `useRpc()`

---

#### useReplySubmit (`src/hooks/useRpc.tsx`)

**Purpose**: Submit replies with PoW

**Parameters**: None

**Returns**:
```typescript
{
  submitReply: (
    parentId: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
    powParams: { pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp }
  ) => Promise<{ success: boolean; contentId: string | null }>;
  submitting: boolean;
  error: string | null;
}
```

**Side Effects**: RPC call to `submit_reply`

**Dependencies**: `useRpc()`

---

#### useEditSubmit (`src/hooks/useRpc.tsx`)

**Purpose**: Submit content edits with PoW

**Parameters**: None

**Returns**:
```typescript
{
  submitEdit: (
    originalContentId: string,
    title: string | undefined,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
    powParams: { pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp }
  ) => Promise<{ success: boolean; contentId: string | null }>;
  submitting: boolean;
  error: string | null;
}
```

**Side Effects**: RPC call to `submit_edit`

**Dependencies**: `useRpc()`

---

#### usePoolContribution (`src/hooks/useRpc.tsx`)

**Purpose**: Submit engagement (reactions) with PoW

**Parameters**: None

**Returns**:
```typescript
{
  contribute: (
    contentId: string,
    targetSeconds: number,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
    emoji?: number  // 1-8 reaction code
  ) => Promise<{ success: boolean; poolComplete: boolean; totalPow: number }>;
  contributing: boolean;
  progress: { attempts: number; elapsedMs: number };
  error: string | null;
}
```

**Side Effects**:
- Argon2id PoW mining for engagement
- RPC call to `submit_engagement`

**Dependencies**: `useRpc()`

---

### Media Upload

#### useMediaUpload (`src/hooks/useRpc.tsx`)

**Purpose**: Upload and retrieve media (images)

**Parameters**: None

**Returns**:
```typescript
{
  uploadImage: (file: File) => Promise<MediaUploadResponse>;
  compressAndUpload: (file: File) => Promise<MediaUploadResponse>;
  uploadEncryptedImage: (file: File, passphrase: string) => Promise<MediaUploadResponse>;
  compressAndUploadEncrypted: (file: File, passphrase: string) => Promise<MediaUploadResponse>;
  getMediaUrl: (mediaHash: string) => Promise<string | null>;
  uploading: boolean;
  error: string | null;
}
```

**Caching**: IndexedDB for permanent media storage

**Side Effects**:
- Canvas-based image compression
- AES-256-GCM encryption for encrypted uploads
- RPC calls to `upload_media`, `get_media`

**Dependencies**: `useRpc()`

---

### Proof-of-Work

#### useActionPow (`src/hooks/useActionPow.ts`)

**Purpose**: Argon2id PoW mining for all content actions

**Parameters**: None

**Returns**:
```typescript
interface UseActionPowResult {
  state: 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';
  progress: { attempts: number; elapsedMs: number; hashRate: number };
  solution: PoWSolution | null;
  error: string | null;
  mine: (
    actionType: ActionType,
    content: Uint8Array,
    authorPubkey: Uint8Array,
    isTestnet?: boolean
  ) => Promise<PoWSolution>;
  cancel: () => void;
  reset: () => void;
  getRpcParams: () => { pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp } | null;
}
```

**ActionTypes**:
- `Post` - Thread creation
- `Reply` - Reply to content
- `Engage` - Engagement/reaction
- `SpaceCreation` - Create new space
- `Edit` - Edit existing content

**Side Effects**: Argon2id hashing via hash-wasm

**Dependencies**: None

---

#### Specialized PoW Hooks

All wrap `useActionPow` with convenience methods:

| Hook | Purpose | Extra Method |
|------|---------|--------------|
| `useEngagementPow` | Pool contributions | `mineEngagement(contentId, pubkey)` |
| `useReplyPow` | Reply PoW | `mineReply(body, pubkey)` |
| `usePostPow` | Post PoW | `minePost(body, pubkey)` |
| `useSpaceCreationPow` | Space creation | `mineSpaceCreation(name, pubkey)` |
| `useEditPow` | Edit PoW | `mineEdit(body, pubkey)` |

---

#### usePow (`src/hooks/usePow.ts`)

**Purpose**: Identity PoW mining using WASM (for identity registration)

**Parameters**: None

**Returns**:
```typescript
interface UsePowResult {
  state: 'idle' | 'initializing' | 'mining' | 'complete' | 'cancelled' | 'error';
  solution: { nonce: bigint; timestamp: bigint; elapsedMs: number } | null;
  attempts: number;
  elapsedMs: number;
  mine: (publicKey: Uint8Array, difficulty: number) => void;
  cancel: () => void;
  reset: () => void;
}
```

**Side Effects**: WASM-based PoW mining in batches

**Dependencies**: `useSwimchain()`

---

### Private Spaces & Encryption

#### usePrivateSpaceKeys (`src/hooks/usePrivateSpaceKeys.ts`)

**Purpose**: Store and manage space encryption keys in IndexedDB

**Parameters**: `userPublicKey?: string`

**Returns**:
```typescript
{
  loading: boolean;
  error: string | null;
  spaceCount: number;
  getSpaceKey: (spaceId: string) => Uint8Array | null;
  getSpaceKeyInfo: (spaceId: string) => PrivateSpaceKey | null;
  storeSpaceKey: (spaceId, spaceKey, invitedBy, keyVersion?, spaceName?) => Promise<void>;
  updateSpaceKey: (spaceId, newSpaceKey, newKeyVersion) => Promise<void>;
  removeSpaceKey: (spaceId: string) => Promise<void>;
  hasSpaceKey: (spaceId: string) => boolean;
  listMyPrivateSpaces: PrivateSpaceKey[];
}
```

**Storage**: IndexedDB `swimchain-private-spaces` database

**Side Effects**: IndexedDB reads/writes

**Dependencies**: None

---

#### usePrivateSpaceMessages (`src/hooks/usePrivateSpaceMessages.ts`)

**Purpose**: Fetch and decrypt messages in private spaces

**Parameters**:
```typescript
(
  spaceId: string | undefined,
  spaceKey: Uint8Array | null,
  options?: { pollInterval?: number; limit?: number }
)
```

**Returns**:
```typescript
{
  messages: PrivateMessage[];  // Decrypted messages
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

**Side Effects**:
- RPC call to `list_posts_for_space`
- XSalsa20-Poly1305 decryption
- Polling at configurable interval (default 5s)

**Dependencies**: `useRpc()`

---

#### usePassphraseStore (`src/hooks/usePassphraseStore.ts`)

**Purpose**: Store decryption passphrases for encrypted content

**Parameters**: None

**Returns**:
```typescript
{
  getPassphrase: (contentId: string) => string | null;
  getPassphrasesToTry: (contentId: string) => string[];
  savePassphrase: (contentId: string, passphrase: string) => void;
  removePassphrase: (contentId: string) => void;
  hasPassphrase: (contentId: string) => boolean;
  clearAll: () => void;
  getStoredIds: () => string[];
  defaultPassphrase: string | null;
  setDefaultPassphrase: (passphrase: string | null) => void;
  hasDefaultPassphrase: boolean;
}
```

**Storage**:
- `localStorage['swimchain-passphrases']` - Per-content passphrases
- `localStorage['swimchain-default-passphrase']` - Default passphrase

**Dependencies**: None

---

### Client Features

#### useBlocklist (`src/hooks/useBlocklist.ts`)

**Purpose**: Client-side content blocking (content still exists on network)

**Parameters**: None

**Returns**:
```typescript
{
  isUserBlocked: (userId: string) => boolean;
  isPostBlocked: (postId: string) => boolean;
  isSpaceBlocked: (spaceId: string) => boolean;
  isReplyBlocked: (replyId: string) => boolean;
  isBlocked: (id: string, type: BlockType) => boolean;
  block: (id: string, type: BlockType, reason?: string) => void;
  unblock: (id: string, type: BlockType) => void;
  getBlocked: (type: BlockType) => BlockedItem[];
  blocklist: Blocklist;
  clearAll: () => void;
  filterBlocked: <T>(items: T[], type: BlockType, options?) => T[];
}
```

**Storage**: `localStorage['swimchain-blocklist']`

**Side Effects**: localStorage reads/writes

**Dependencies**: None

---

#### useParentRpcConfig (`src/hooks/useParentRpcConfig.ts`)

**Purpose**: Receive RPC config from parent frame (desktop-app wrapper)

**Parameters**: None

**Returns**: `ParentRpcConfig | null`

**Side Effects**: Window message listener for `SWIMCHAIN_RPC_CONFIG`

**Dependencies**: None

---

## State Patterns

### Async Data Pattern

Standard pattern used across all data-fetching hooks:

```typescript
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// For network content fetching
const [fetching, setFetching] = useState(false);  // Secondary loading state
```

**Used In**: `useSpaces`, `useSpaceThreads`, `useThread`, `useReplies`, `useUserProfile`, etc.

---

### Mining State Pattern

For PoW mining operations:

```typescript
const [state, setState] = useState<MiningState>('idle');
const [progress, setProgress] = useState<MiningProgress>({ attempts: 0, elapsedMs: 0 });
const [solution, setSolution] = useState<PoWSolution | null>(null);
const [error, setError] = useState<string | null>(null);
const cancelledRef = useRef(false);
```

**States**: `'idle' | 'mining' | 'complete' | 'error' | 'cancelled'`

**Used In**: `useActionPow`, `usePow`

---

### Submission Pattern

For content submission operations:

```typescript
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Used In**: `usePostSubmit`, `useReplySubmit`, `useEditSubmit`, `usePoolContribution`

---

### Cache-First Pattern

For frequently accessed data:

```typescript
const refetch = useCallback(async (skipCache = false) => {
  // 1. Check memory cache (fastest)
  if (!skipCache) {
    const memoryCached = getFromMemory<T>(CACHE_KEY);
    if (memoryCached) {
      setData(memoryCached);
      setLoading(false);
      // Background refresh
      setTimeout(() => refetch(true), 100);
      return;
    }
  }

  // 2. Check localStorage cache
  // 3. Fetch from RPC
  // 4. Update caches
}, [rpc, connected]);
```

**Used In**: `useSpaces`, `useSpaceThreads`, profile caching

---

### Network Content Request Pattern

For content that may need to be fetched from network peers:

```typescript
// Check if content body is missing
if (!content.body) {
  setFetching(true);
  await rpc.requestContent(contentId);

  // Poll for arrival
  const poll = async () => {
    const result = await rpc.getContent(contentId);
    if (result.body) {
      setData(result);
      setFetching(false);
    } else {
      setTimeout(poll, 2000);  // Retry in 2s
    }
  };
  poll();
}
```

**Used In**: `useThread`, `useSpaceThreads`, `useReplies`

---

## Data Flow

### RPC → UI Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                         RpcProvider                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SwimchainRpc Client                                  │   │
│  │  • Signature authentication                           │   │
│  │  • Request/response handling                          │   │
│  │  • Auto-reconnection                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Data Fetching Hooks                       │
│  useSpaces, useSpaceThreads, useThread, useReplies, etc.    │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  Memory Cache   │  │ localStorage    │                   │
│  │  (5-30min TTL)  │  │  Cache          │                   │
│  └─────────────────┘  └─────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      Page Components                         │
│  SpaceList, SpaceView, ThreadView, etc.                     │
│  • useState for local UI state                              │
│  • Props passed to child components                         │
└──────────────────────────────────────────────────────────────┘
```

### Content Submission Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Input    │ ──▶ │   PoW Mining    │ ──▶ │   Signing       │
│   (Form)        │     │   (Argon2id)    │     │   (WASM)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   UI Update     │ ◀── │   Refetch Data  │ ◀── │   RPC Submit    │
│   (Navigate)    │     │   (Cache Clear) │     │   (submit_*)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Caching Strategies

### Three-Layer Cache Architecture

```typescript
// lib/cache.ts provides:

// 1. Memory Cache (fastest, volatile)
getFromMemory<T>(key: string): T | null
setInMemory<T>(key: string, data: T, ttlMs: number): void

// 2. localStorage Cache (persistent, small data)
getFromStorage<T>(key: string): T | null
setInStorage<T>(key: string, data: T, ttlMs?: number): void

// 3. IndexedDB Cache (persistent, large data)
getMediaFromCache(hash: string): Promise<CachedMedia | null>
setMediaInCache(hash: string, data: string, mediaType: string): Promise<void>
getContentFromCache<T>(id: string): Promise<T | null>
setContentInCache<T>(id: string, data: T): Promise<void>
```

### Cache Usage by Data Type

| Data Type | Memory | localStorage | IndexedDB |
|-----------|--------|--------------|-----------|
| Spaces list | 5 min | 30 min | - |
| Thread list | 2 min | - | - |
| User profiles | 1 min | - | - |
| Media blobs | - | - | Permanent |
| Private keys | - | - | Permanent |
| Identity | - | Permanent | - |
| Preferences | - | Permanent | - |
| Blocklist | - | Permanent | - |
| Passphrases | - | Permanent | - |

### Cache Invalidation

- **On content submission**: Clear memory cache for affected space/thread
- **On passphrase clear**: Clear decrypted media from IndexedDB
- **Manual**: `clearAllCaches()` clears everything

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Context Providers | 5 |
| Custom Hooks | 26 |
| Storage Keys (localStorage) | 6 |
| IndexedDB Databases | 2 |
| RPC Methods Used | 25+ |
