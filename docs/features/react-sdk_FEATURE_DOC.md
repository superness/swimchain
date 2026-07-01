# React SDK - Feature Documentation

**Section**: 15. React SDK
**Owner Area**: `swimchain-react/`
**Package**: `@swimchain/react`
**Status**: Complete
**Last Updated**: 2026-01-11

## Overview

The Swimchain React SDK (`@swimchain/react`) provides a comprehensive TypeScript/React integration layer for building Swimchain applications. It offers React hooks, context providers, and utility libraries that handle:

- **WASM Initialization**: Automatic loading and management of core cryptographic WASM bindings
- **RPC Communication**: Type-safe JSON-RPC client with signature authentication and auto-reconnect
- **Identity Management**: Keypair generation, persistent storage, and address validation
- **Content Operations**: Hooks for fetching spaces, threads, replies, and user posts
- **Proof-of-Work**: Both identity PoW (Web Worker) and action PoW (Argon2id) computation
- **Content Decay**: Real-time decay calculation with requestAnimationFrame updates
- **Encryption**: Passphrase-based and space-key encryption for private content
- **Key Exchange**: X25519 for private space key distribution
- **Caching**: Multi-layer cache (IndexedDB, memory, localStorage)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                             │
├─────────────────────────────────────────────────────────────────┤
│                        Content Hooks                            │
│    useSpaces, useThread, useReplies, useReactions, useUserPosts │
├─────────────────────────────────────────────────────────────────┤
│                       Feature Hooks                             │
│    useDecay, usePow, useKeypair, useStoredIdentity              │
├─────────────────────────────────────────────────────────────────┤
│                     Utility Libraries                           │
│   encryption | x25519 | action-pow | cache | profile | dm       │
├─────────────────────────────────────────────────────────────────┤
│                       RPC Provider                              │
│           SwimchainRpc client, auto-reconnect                   │
├─────────────────────────────────────────────────────────────────┤
│                    Swimchain Provider                           │
│              WASM initialization, context                       │
├─────────────────────────────────────────────────────────────────┤
│                      @swimchain/core                            │
│         WASM bindings (Keypair, decay, PoW, crypto)             │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
swimchain-react/
├── src/
│   ├── index.ts                    # Main entry point, all public exports
│   ├── SwimchainProvider.tsx       # WASM initialization provider
│   └── hooks/
│   │   ├── useRpc.tsx              # RPC provider and connection hooks
│   │   ├── useIdentity.ts          # Identity/keypair management
│   │   ├── useDecay.ts             # Real-time decay calculations
│   │   ├── usePow.ts               # Identity PoW mining
│   │   ├── useContent.ts           # Content fetching hooks
│   │   └── useStoredIdentity.ts    # Persistent identity storage
│   └── lib/
│       ├── rpc.ts                  # RPC client class
│       ├── action-pow.ts           # Argon2id PoW for actions
│       ├── encryption.ts           # AES-GCM encryption utilities
│       ├── x25519.ts               # Key exchange for private spaces
│       ├── dm.ts                   # Direct message utilities
│       ├── profile.ts              # User profile utilities
│       └── cache.ts                # Multi-layer caching
```

## Data Structures

### SwimchainContextValue

Context value provided by `SwimchainProvider`.

| Field | Type | Description |
|-------|------|-------------|
| `isLoaded` | `boolean` | Whether WASM is loaded and ready |
| `loadError` | `Error \| null` | Error that occurred during loading |

### RpcContextValue

Context value provided by `RpcProvider`.

| Field | Type | Description |
|-------|------|-------------|
| `rpc` | `SwimchainRpc \| null` | RPC client instance |
| `connected` | `boolean` | Whether connected to a node |
| `connecting` | `boolean` | Whether currently connecting |
| `error` | `string \| null` | Connection error message |
| `nodeInfo` | `{ version, network, peerCount }` | Node information after connection |
| `connect` | `(config: RpcConfig) => Promise<boolean>` | Connect to a node |
| `disconnect` | `() => void` | Disconnect from node |
| `setAuth` | `(auth: SignatureAuth \| null) => void` | Set signature authentication |

### StoredIdentity

Persistent identity structure stored in localStorage.

| Field | Type | Description |
|-------|------|-------------|
| `seed` | `string` | Hex-encoded 32-byte seed (private key) |
| `publicKey` | `string` | Hex-encoded 32-byte public key |
| `address` | `string` | Bech32m-encoded address |
| `createdAt` | `number` | UNIX timestamp when created |
| `displayName` | `string?` | Optional display name |

### Space

Public space metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Space ID (hex) |
| `name` | `string` | Space display name |
| `description` | `string` | Space description |
| `postCount` | `number` | Number of posts in space |
| `lastActivity` | `number \| null` | Last activity timestamp |

### Thread

Thread/post content structure.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Content ID |
| `spaceId` | `string` | Parent space ID |
| `author` | `string` | Author's public key (hex) |
| `title` | `string` | Post title |
| `content` | `string` | Post body |
| `createdAt` | `number` | Creation timestamp |
| `lastEngagement` | `number` | Last engagement timestamp |
| `replyCount` | `number` | Number of replies |
| `decayState` | `string` | Current decay state |
| `survivalProbability` | `number` | Probability of survival |
| `hasPool` | `boolean` | Whether content has an engagement pool |
| `poolProgress` | `number` | Pool completion percentage |

### Reply

Reply content structure with tree support.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Content ID |
| `parentId` | `string \| null` | Parent content ID (null for root replies) |
| `author` | `string` | Author's public key (hex) |
| `content` | `string` | Reply body |
| `createdAt` | `number` | Creation timestamp |
| `lastEngagement` | `number` | Last engagement timestamp |
| `depth` | `number` | Nesting depth in tree |
| `childCount` | `number` | Number of child replies |
| `children` | `Reply[]` | Child reply objects |
| `decayState` | `string` | Current decay state |
| `bodyLoading` | `boolean` | Whether body is still loading from network |

### PoWChallenge

Action PoW challenge structure (SPEC_03).

| Field | Type | Description |
|-------|------|-------------|
| `actionType` | `ActionType` | Type of action (Post, Reply, Engage, etc.) |
| `contentHash` | `Uint8Array` | SHA-256 hash of content (32 bytes) |
| `authorId` | `Uint8Array` | Author's public key (32 bytes) |
| `timestamp` | `number` | UNIX timestamp (seconds) |
| `difficulty` | `number` | Required leading zero bits |
| `nonceSpace` | `Uint8Array` | Random nonce space (8 bytes) |

### PoWSolution

Action PoW solution structure.

| Field | Type | Description |
|-------|------|-------------|
| `challenge` | `PoWChallenge` | Original challenge |
| `nonce` | `bigint` | Solution nonce |
| `hash` | `Uint8Array` | Resulting hash (32 bytes) |

### ProfileInfo

User profile information structure.

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | `string?` | Display name |
| `bio` | `string?` | Short bio/description |
| `website` | `string?` | Website URL |
| `links` | `Record<string, string>?` | Additional links |
| `bannerColor` | `string?` | Profile banner color |
| `updatedAt` | `number` | Last update timestamp |
| `isPrivate` | `boolean?` | Whether profile is encrypted |

### DMInfo

Direct message relationship information.

| Field | Type | Description |
|-------|------|-------------|
| `status` | `DMStatus` | Relationship status |
| `spaceId` | `string` | DM space ID |
| `otherParty` | `string` | Other party's public key |
| `createdAt` | `number?` | When DM was created |
| `requestHash` | `string?` | Hash for pending requests |

## Core APIs

### Providers

#### SwimchainProvider

**Location**: `swimchain-react/src/SwimchainProvider.tsx:65`

**Purpose**: Initializes WASM and provides context to child components.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Child components |
| `onLoad` | `() => void` | - | Called when WASM loads |
| `onError` | `(error: Error) => void` | - | Called on load failure |
| `fallback` | `ReactNode` | - | Loading fallback component |

**Example**:
```tsx
<SwimchainProvider
  fallback={<div>Loading WASM...</div>}
  onError={(err) => console.error('WASM failed:', err)}
>
  <MainApp />
</SwimchainProvider>
```

**Context Hooks**:
- `useSwimchain()` - Access WASM loading state
- `useRequireSwimchain()` - Throws if WASM not loaded

#### RpcProvider

**Location**: `swimchain-react/src/hooks/useRpc.tsx:84`

**Purpose**: Manages RPC connection to a Swimchain node with auto-reconnect.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Child components |
| `config` | `RpcConfig` | `LOCAL_TESTNET` | RPC endpoint configuration |
| `useRemoteSeed` | `boolean` | `false` | Use remote testnet seed |
| `signatureAuth` | `SignatureAuth` | - | Signature authentication |
| `autoConnect` | `boolean` | `true` | Auto-connect on mount |
| `retryInterval` | `number` | `5000` | Retry interval in ms |

**Example**:
```tsx
<RpcProvider
  autoConnect
  config={TESTNET_SEED_SF}
  signatureAuth={{
    sign: (msg) => keypair.sign(msg),
    publicKey: publicKeyHex,
  }}
>
  <App />
</RpcProvider>
```

### Identity Hooks

#### useKeypair()

**Location**: `swimchain-react/src/hooks/useIdentity.ts:37`

**Signature**: `useKeypair(): UseKeypairResult`

**Purpose**: Manages an in-memory cryptographic keypair.

**Returns**:
| Field | Type | Description |
|-------|------|-------------|
| `keypair` | `Keypair \| null` | WASM Keypair object |
| `publicKey` | `Uint8Array \| null` | 32-byte public key |
| `address` | `string \| null` | Bech32m-encoded address |
| `generate` | `() => void` | Generate new keypair |
| `sign` | `(msg: Uint8Array) => Uint8Array \| null` | Sign a message |
| `clear` | `() => void` | Clear keypair from memory |

**Memory Management**: Automatically frees WASM Keypair on unmount via `Keypair.free()`.

**Example**:
```tsx
function IdentityManager() {
  const { keypair, address, generate, sign } = useKeypair();

  return (
    <div>
      <button onClick={generate}>Generate Identity</button>
      {address && <p>Address: {address}</p>}
    </div>
  );
}
```

#### useStoredIdentity()

**Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:102`

**Signature**: `useStoredIdentity(): UseStoredIdentityResult`

**Purpose**: Manages persistent identity in localStorage.

**Storage Key**: `swimchain-identity`

**Returns**:
| Field | Type | Description |
|-------|------|-------------|
| `identity` | `StoredIdentity \| null` | Stored identity data |
| `isLoading` | `boolean` | Loading from storage |
| `error` | `string \| null` | Error message |
| `saveIdentity` | `(identity: StoredIdentity) => void` | Save identity |
| `clearIdentity` | `() => void` | Remove stored identity |
| `hasIdentity` | `boolean` | Whether identity exists |

#### useStoredKeypair()

**Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:167`

**Signature**: `useStoredKeypair(): UseStoredKeypairResult`

**Purpose**: Creates a WASM Keypair from stored identity.

**Returns**:
| Field | Type | Description |
|-------|------|-------------|
| `keypair` | `Keypair \| null` | WASM Keypair from stored seed |
| `publicKey` | `Uint8Array \| null` | Public key bytes |
| `publicKeyHex` | `string \| null` | Public key as hex |
| `address` | `string \| null` | Bech32m address |
| `isLoading` | `boolean` | Loading state |
| `error` | `string \| null` | Error message |
| `sign` | `(msg: Uint8Array) => Uint8Array \| null` | Sign function |

#### createNewIdentity()

**Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:251`

**Signature**: `createNewIdentity(keypair: Keypair, displayName?: string): StoredIdentity`

**Purpose**: Create a new identity from a keypair for storage.

#### loadStoredIdentity()

**Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:268`

**Signature**: `loadStoredIdentity(): StoredIdentity | null`

**Purpose**: Non-hook identity loader for RPC auth setup before React renders.

#### Address Validation Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useAddressValidation(address)` | useIdentity.ts:115 | Validate address format, returns `AddressValidation` |
| `useEncodeAddress(publicKey)` | useIdentity.ts:145 | Encode public key to bech32m address |
| `useDecodeAddress(address)` | useIdentity.ts:164 | Decode address to public key |
| `useVerifySignature(pk, msg, sig)` | useIdentity.ts:185 | Verify Ed25519 signature |
| `useIsValidAddress(address)` | useIdentity.ts:204 | Simple boolean check |

### Decay Hooks

#### useDecay()

**Location**: `swimchain-react/src/hooks/useDecay.ts:48`

**Signature**: `useDecay(createdAtSecs: number, lastEngagementSecs: number, options?: UseDecayOptions): DecayState | null`

**Purpose**: Calculates content decay in real-time using requestAnimationFrame.

**Parameters**:
- `createdAtSecs`: Content creation timestamp (UNIX seconds)
- `lastEngagementSecs`: Last engagement timestamp (UNIX seconds)
- `options`: Optional configuration

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `updateInterval` | `number` | `1000` | Update throttle in ms |
| `realTime` | `boolean` | `true` | Enable RAF updates |

**Returns**: `DecayState` from `@swimchain/core` with `currentHeat`, `isProtected`, `isDecayed`, etc.

**Example**:
```tsx
function ContentCard({ content }) {
  const decay = useDecay(content.createdAt, content.lastEngagement);

  return (
    <div>
      <div
        className="heat-bar"
        style={{ width: `${(decay?.currentHeat ?? 0) * 100}%` }}
      />
      {decay?.isDecayed && <span>Expired</span>}
    </div>
  );
}
```

#### useDecayOnce()

**Signature**: `useDecayOnce(createdAtSecs: number, lastEngagementSecs: number): DecayState | null`

**Purpose**: Single decay calculation (non-reactive).

#### useIsProtected()

**Signature**: `useIsProtected(createdAtSecs: number): boolean`

**Purpose**: Check if content is within protection period.

#### useIsDecayed()

**Signature**: `useIsDecayed(createdAtSecs: number, lastEngagementSecs: number): boolean`

**Purpose**: Check if content has decayed below threshold.

### PoW Hooks

#### usePow()

**Location**: `swimchain-react/src/hooks/usePow.ts:73`

**Signature**: `usePow(): UsePowResult`

**Purpose**: Non-blocking identity PoW mining using Web Workers.

**Returns**:
| Field | Type | Description |
|-------|------|-------------|
| `state` | `MiningState` | Current state: idle, initializing, mining, complete, cancelled, error |
| `solution` | `PowSolution \| null` | Mining solution if complete |
| `error` | `string \| null` | Error message |
| `attempts` | `number` | Number of hash attempts |
| `elapsedMs` | `number` | Elapsed time in milliseconds |
| `mine` | `(publicKey: Uint8Array, difficulty?: number) => void` | Start mining |
| `cancel` | `() => void` | Cancel current mining |
| `reset` | `() => void` | Reset state |

**Example**:
```tsx
function IdentityCreator() {
  const { keypair } = useKeypair();
  const { state, solution, mine, cancel } = usePow();

  return (
    <div>
      <button
        onClick={() => mine(keypair.publicKey(), 8)}
        disabled={state === 'mining'}
      >
        {state === 'mining' ? 'Mining...' : 'Create Identity'}
      </button>
      {state === 'mining' && <button onClick={cancel}>Cancel</button>}
      {solution && <p>Success! Nonce: {solution.nonce.toString()}</p>}
    </div>
  );
}
```

#### usePowSync()

**Location**: `swimchain-react/src/hooks/usePow.ts:170`

**Purpose**: Synchronous (blocking) PoW mining. **Warning**: Blocks main thread.

#### useVerifyPow()

**Signature**: `useVerifyPow(publicKey, timestamp, nonce, difficulty): boolean`

**Purpose**: Verify a PoW solution.

#### useMiningEstimate()

**Signature**: `useMiningEstimate(difficulty: number, hashRate?: number): { seconds: number, formatted: string }`

**Purpose**: Estimate mining time for a given difficulty.

### RPC Hooks

#### useRpc()

**Location**: `swimchain-react/src/hooks/useRpc.tsx:237`

**Signature**: `useRpc(): RpcContextValue`

**Purpose**: Access RPC context for making API calls.

**Throws**: Error if used outside `RpcProvider`.

#### useSyncStatus()

**Location**: `swimchain-react/src/hooks/useRpc.tsx:248`

**Signature**: `useSyncStatus(pollIntervalMs?: number): { status, loading, error, refetch }`

**Purpose**: Fetch and poll node sync status.

**Parameters**:
- `pollIntervalMs`: Polling interval (default: 10000ms)

#### usePeers()

**Location**: `swimchain-react/src/hooks/useRpc.tsx:293`

**Signature**: `usePeers(): { peers, loading, error, refetch }`

**Purpose**: Fetch connected peer list.

### Content Hooks

#### useSpaces()

**Location**: `swimchain-react/src/hooks/useContent.ts:65`

**Signature**: `useSpaces(options?: { limit?: number, offset?: number }): UseSpacesResult`

**Purpose**: Fetch paginated list of spaces.

**Returns**:
| Field | Type | Description |
|-------|------|-------------|
| `spaces` | `Space[]` | List of spaces |
| `total` | `number` | Total space count |
| `loading` | `boolean` | Loading state |
| `error` | `string \| null` | Error message |
| `refetch` | `() => Promise<void>` | Refetch function |

#### useSpaceThreads()

**Location**: `swimchain-react/src/hooks/useContent.ts:123`

**Signature**: `useSpaceThreads(spaceId: string, options?): UseSpaceThreadsResult`

**Purpose**: Fetch threads/posts for a space with automatic content fetching.

**Behavior**: Automatically requests missing content bodies from the network and polls for arrival.

**Returns** includes `fetching: boolean` indicating network content requests in progress.

#### useThread()

**Location**: `swimchain-react/src/hooks/useContent.ts:206`

**Signature**: `useThread(contentId: string): UseThreadResult`

**Purpose**: Fetch a single thread by content ID.

#### useReplies()

**Location**: `swimchain-react/src/hooks/useContent.ts:270`

**Signature**: `useReplies(contentId: string): UseRepliesResult`

**Purpose**: Fetch reply tree for content.

**Returns**: `replies: Reply[]` as a nested tree structure.

#### useReactions()

**Location**: `swimchain-react/src/hooks/useContent.ts:366`

**Signature**: `useReactions(contentId: string): UseReactionsResult`

**Purpose**: Fetch reactions for content.

#### useUserPosts()

**Location**: `swimchain-react/src/hooks/useContent.ts:432`

**Signature**: `useUserPosts(userId: string, options?): UseUserPostsResult`

**Purpose**: Fetch posts by a specific user.

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `50` | Items per page |
| `offset` | `number` | `0` | Pagination offset |
| `includeReplies` | `boolean` | `false` | Include user's replies |

## Behaviors

### WASM Initialization

When `SwimchainProvider` mounts:
1. Checks if WASM is already loaded via `isWasmLoaded()`
2. If not loaded, calls `initWasm()` asynchronously
3. Shows fallback component during loading
4. Sets `isLoaded: true` on success, or `loadError` on failure
5. Calls `onLoad` or `onError` callbacks accordingly

### RPC Auto-Reconnect

When `RpcProvider` mounts with `autoConnect`:
1. Attempts initial connection to configured endpoint
2. If connection fails and `retryInterval > 0`, starts retry loop
3. Retries every `retryInterval` ms until successful
4. Clears retry interval on successful connection or unmount

### Content Fetching with Network Requests

When using content hooks (e.g., `useSpaceThreads`):
1. Fetches content from local node storage
2. Identifies items with `body === null` (not yet synced)
3. Calls `rpc.requestContent()` for missing items
4. Polls node every 2 seconds (up to 15 times) for content arrival
5. Updates state as content bodies arrive

### Identity Memory Management

To prevent WASM memory leaks:
1. `useKeypair` stores keypair reference in `useRef`
2. Calls `Keypair.free()` on unmount via cleanup effect
3. Frees previous keypair before creating new one on `generate()`

## Configuration

### Network Presets

| Preset | Endpoint | Port | Use Case |
|--------|----------|------|----------|
| `LOCAL_TESTNET` | `http://127.0.0.1:19756` | 19756 | Local testnet development |
| `LOCAL_REGTEST` | `http://127.0.0.1:29736` | 29736 | Local regtest |
| `LOCAL_MAINNET` | `http://127.0.0.1:9736` | 9736 | Local mainnet |
| `TESTNET_SEED_SF` | `http://64.225.115.108:8736` | 8736 | SF testnet seed |
| `TESTNET_SEED_NYC` | `http://104.236.106.124:8736` | 8736 | NYC testnet seed |

### Action PoW Difficulty

| Action | Production | Testnet |
|--------|------------|---------|
| Space Creation | 22 | 12 |
| Post | 20 | 10 |
| Reply | 18 | 8 |
| Engage | 16 | 6 |
| Identity Update | 20 | 10 |

### PoW Memory Configuration

| Config | Memory | Iterations | Parallelism | Use Case |
|--------|--------|------------|-------------|----------|
| `PRODUCTION_CONFIG` | 64 MiB | 3 | 4 | Production |
| `TESTNET_CONFIG` | 8 MiB | 1 | 2 | Testnet |
| `TEST_CONFIG` | 1 MiB | 1 | 1 | Unit tests |

### Encryption Parameters

| Parameter | Value |
|-----------|-------|
| PBKDF2 Iterations | 100,000 |
| Salt Length | 16 bytes |
| IV Length | 12 bytes |
| AES Key Length | 256 bits |
| NaCl Nonce Length | 24 bytes |

### Cache Configuration

| Layer | Storage | TTL | Use Case |
|-------|---------|-----|----------|
| Memory | `Map` | Configurable | Fast repeated access |
| IndexedDB Content | IndexedDB | 5 min | API response caching |
| IndexedDB Media | IndexedDB | Permanent | Content-addressable media |
| localStorage | localStorage | Configurable | Small persistent data |

## RPC Methods

The `SwimchainRpc` class provides typed methods for all RPC endpoints.

### Node Status

| Method | Request | Response |
|--------|---------|----------|
| `connect()` | - | `Promise<boolean>` |
| `isConnected()` | - | `boolean` |
| `getNodeInfo()` | - | `NodeInfo \| null` (cached) |
| `getInfo()` | - | `Promise<NodeInfo>` |
| `getSyncStatus()` | - | `Promise<SyncStatus>` |
| `getPeers()` | - | `Promise<Peer[]>` |

### Content Read

| Method | Parameters | Response |
|--------|------------|----------|
| `getContent(contentId)` | `content_id` | `ContentResult` |
| `listSpaces(options?)` | `limit?, offset?` | `ListSpacesResult` |
| `listSpaceContent(spaceId, options?)` | `space_id, limit?, offset?, sort?` | `SpaceContentResult` |
| `listSpacePosts(spaceId, options?)` | `space_id, limit?, offset?` | `SpaceContentResult` |
| `getUserPosts(userId, options?)` | `user_id, limit?, offset?, include_replies?` | `UserPostsResult` |
| `requestContent(contentId)` | `content_id` | `{ status, message }` |
| `getReplies(contentId)` | `content_id` | `{ parent_id, replies, total_count }` |
| `getReactions(contentId)` | `content_id` | `{ content_id, reactions, total }` |
| `getUserReactions(contentId, userId)` | `content_id, user_id` | `{ reaction_types }` |

### Content Write

| Method | Parameters |
|--------|------------|
| `submitPost(params)` | spaceId, title, body, authorId, pow params, signature, timestamp |
| `submitReply(params)` | parentId, body, authorId, pow params, signature, timestamp |
| `submitEngagement(params)` | contentId, authorId, pow params, signature, timestamp, emoji? |
| `createSpace(params)` | name, creatorId, pow params, signature, timestamp |

### Identity & Pools

| Method | Parameters | Response |
|--------|------------|----------|
| `getIdentityLevel(identityId)` | `identity_id` | `IdentityLevel` |
| `getPoolInfo(poolId)` | `pool_id` | `PoolInfo` |
| `getPoolForContent(contentId)` | `content_id` | Pool info |

### Spam Attestation

| Method | Purpose |
|--------|---------|
| `submitSpamAttestation(params)` | Flag content as spam |
| `submitCounterAttestation(params)` | Dispute spam flag |
| `getSpamStatus(contentId)` | Get spam status for content |

### Direct Messages

| Method | Purpose |
|--------|---------|
| `requestDM(params)` | Send DM request |
| `acceptDM(params)` | Accept DM request |
| `declineDM(params)` | Decline DM request |
| `getPendingDMRequests(userId)` | Get pending DM requests |

### Private Space Management

| Method | Purpose |
|--------|---------|
| `kickMember(params)` | Remove member and rotate keys |
| `leaveSpace(params)` | Leave a private space |
| `getSpaceMembers(spaceId)` | Get space member list |

### Signature Authentication

```typescript
interface SignatureAuth {
  sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
  publicKey: string; // Hex
}

// Message format: swimchain-rpc:{method}:{paramsHashHex}:{timestamp}
// Headers: X-CS-Identity, X-CS-Timestamp, X-CS-Signature
```

## CLI Commands

N/A - This is a client-side React library. See RPC API documentation for node CLI commands.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "WASM not loaded" | Hook used before SwimchainProvider ready | Ensure SwimchainProvider wraps component |
| "useRpc must be used within RpcProvider" | RPC hook outside provider | Wrap component in RpcProvider |
| "Invalid seed length: X (expected 32)" | Seed bytes not 32 | Verify identity seed is correct |
| "Mining cancelled" | PoW mining was cancelled | Expected behavior on cancel() |
| "Content not found" | Content not in local storage | Content will be requested from network |
| "Decryption failed" | Wrong passphrase or corrupted data | Verify passphrase |
| "Space key must be 32 bytes" | Invalid space key | Verify key generation |
| "Ed25519 public key must be 32 bytes" | Invalid public key for X25519 | Verify key format |

## Testing

### Package Scripts

```bash
cd swimchain-react
npm install
npm run build        # TypeScript compilation
npm run test         # Run vitest
npm run test:watch   # Watch mode
npm run lint         # ESLint
```

### Unit Testing Example

```typescript
import { createPostChallenge, computePow, TEST_CONFIG, serializeChallenge } from '@swimchain/react';

test('computes post PoW', async () => {
  const challenge = await createPostChallenge(
    'test-space',
    'Test Title',
    'Test body',
    '0'.repeat(64),
    true
  );

  // Use TEST_CONFIG for fast tests
  const solution = await computePow(challenge, TEST_CONFIG);

  expect(solution.nonce).toBeGreaterThanOrEqual(0n);
  expect(solution.hash.length).toBe(32);
});
```

### Integration Testing Example

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { SwimchainProvider, RpcProvider, useSpaces, LOCAL_TESTNET } from '@swimchain/react';

function TestComponent() {
  const { spaces, loading, error } = useSpaces();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>{spaces.length} spaces</div>;
}

test('loads spaces from node', async () => {
  render(
    <SwimchainProvider>
      <RpcProvider config={LOCAL_TESTNET}>
        <TestComponent />
      </RpcProvider>
    </SwimchainProvider>
  );

  await waitFor(() => {
    expect(screen.getByText(/spaces/)).toBeInTheDocument();
  });
});
```

## Known Limitations

1. **Web Worker Support Required**: The `usePow()` hook requires Web Worker support for non-blocking mining. Falls back to blocking `usePowSync()` if unavailable.

2. **IndexedDB Required**: Caching utilities require IndexedDB. Falls back gracefully but with reduced performance.

3. **SharedArrayBuffer Issues**: Some encryption operations create new ArrayBuffers to avoid SharedArrayBuffer compatibility issues in certain browsers.

4. **Memory Usage**: Production PoW config uses 64MiB memory. Use `TESTNET_CONFIG` or `TEST_CONFIG` for development.

5. **No SSR Support**: React SDK requires browser APIs (crypto, IndexedDB, localStorage) and does not support server-side rendering.

6. **Single RPC Connection**: RpcProvider manages a single connection. Multiple nodes require multiple providers or manual client management.

7. **No Automated Test Suite**: Despite vitest being configured, no automated test files exist yet.

## Future Work

- Add WebSocket support for real-time content updates
- Implement offline-first architecture with sync queue
- Add React Native support via separate package
- Implement connection pooling for multiple nodes
- Add comprehensive automated test suite
- Add React Server Components compatibility (partial)

## Related Features

- **[WASM Bindings](./wasm-bindings_FEATURE_DOC.md)** - Core cryptography (Section 16)
- **[RPC API](./rpc-api_FEATURE_DOC.md)** - Backend API specification (Section 12)
- **[Private Spaces & Encryption](./private-spaces-encryption_FEATURE_DOC.md)** - Encryption concepts (Section 10)
- **[Proof-of-Work Systems](./proof-of-work-systems_FEATURE_DOC.md)** - PoW specification (Section 2)
- **[Content & Decay Engine](./content-decay-engine_FEATURE_DOC.md)** - Decay algorithm (Section 4)
- **Frontend SDK** - Shared React components (Section 14)
- **Client Applications** - Apps using React SDK (Section 23)

---

## Appendix: Library Function Reference

### Action PoW (`lib/action-pow`)

| Function | Purpose |
|----------|---------|
| `computePow(challenge, config, onProgress?, isCancelled?)` | Main mining function |
| `createChallenge(actionType, content, authorPk, difficulty)` | Generic challenge creator |
| `createPostChallenge(spaceId, title, body, authorPkHex, isTestnet)` | Post challenge |
| `createReplyChallenge(parentId, body, authorPkHex, isTestnet)` | Reply challenge |
| `createEngageChallenge(contentId, authorPkHex, isTestnet)` | Engagement challenge |
| `createSpaceChallenge(name, authorPkHex, isTestnet)` | Space creation challenge |
| `solutionToRpcParams(solution)` | Convert to RPC params |
| `getDifficulty(actionType, isTestnet)` | Get difficulty for action |
| `getConfig(isTestnet)` | Get PoW config for network |
| `estimateMiningTime(difficulty, hashRate)` | Time estimate |
| `serializeChallenge(challenge)` | Serialize to 82-byte format |
| `leadingZeros(hash)` | Count leading zero bits |
| `sha256(data)` | SHA-256 hash |
| `generateNonceSpace()` | Generate 8-byte random nonce |
| `hexToBytes(hex)` | Convert hex to bytes |
| `bytesToHex(bytes)` | Convert bytes to hex |

### Encryption (`lib/encryption`)

| Function | Purpose |
|----------|---------|
| `isEncrypted(content)` | Check passphrase-encrypted |
| `encryptContent(content, passphrase)` | Encrypt text |
| `decryptContent(encrypted, passphrase)` | Decrypt text |
| `encryptPost(title, body, passphrase)` | Encrypt post |
| `decryptPost(encrypted, passphrase)` | Decrypt post |
| `encryptMedia(data, passphrase)` | Encrypt binary |
| `decryptMedia(encrypted, passphrase)` | Decrypt binary |
| `generatePassphrase(length?)` | Random passphrase |
| `base64ToBytes(base64)` | Base64 decode |
| `bytesToBase64(bytes)` | Base64 encode |
| `isPrivateEncrypted(content)` | Check space-key encrypted |
| `encryptWithSpaceKey(content, spaceKey)` | Encrypt with space key |
| `decryptWithSpaceKey(encrypted, spaceKey)` | Decrypt with space key |
| `encryptPrivatePost(title, body, spaceKey)` | Encrypt private post |
| `decryptPrivatePost(encrypted, spaceKey)` | Decrypt private post |
| `encryptPrivateMedia(data, spaceKey)` | Encrypt private media |
| `decryptPrivateMedia(encrypted, spaceKey)` | Decrypt private media |
| `encryptSpaceName(name, spaceKey)` | Encrypt space name |
| `decryptSpaceName(encrypted, spaceKey)` | Decrypt space name |

### X25519 (`lib/x25519`)

| Function | Purpose |
|----------|---------|
| `ed25519PrivateToX25519(ed25519Key)` | Convert private key |
| `ed25519PublicToX25519(ed25519Key)` | Convert public key |
| `deriveX25519Keys(ed25519Seed)` | Derive keypair |
| `x25519SharedSecret(mySecret, theirPublic)` | DH shared secret |
| `x25519Box(message, recipientPk, senderSk)` | NaCl box encrypt |
| `x25519Unbox(boxed, senderPk, recipientSk)` | NaCl box decrypt |
| `generateSpaceKey()` | Generate 32-byte key |
| `encryptSpaceKeyForRecipient(key, recipientPk, senderSk)` | Key wrapping |
| `decryptSpaceKey(encrypted, senderPk, recipientSk)` | Key unwrapping |
| `hexToBytes(hex)` | Convert hex to bytes |
| `bytesToHex(bytes)` | Convert bytes to hex |

### DM (`lib/dm`)

| Function | Purpose |
|----------|---------|
| `getDMSpaceId(myPk, theirPk)` | Deterministic DM space ID |
| `isDMSpace(spaceId, pk1, pk2)` | Check if DM space |
| `getDMSpaceName(myPk, theirPk)` | Display name for DM |
| `canInitiateDM(status)` | Check if can start DM |
| `getDMStatusText(status)` | Human-readable status |
| `getDMAction(status)` | UI action for status |

### Profile (`lib/profile`)

| Function | Purpose |
|----------|---------|
| `getProfileSpaceId(userPk)` | Profile space ID |
| `isProfileSpace(spaceId, userPk)` | Check if profile space |
| `encodeProfileInfo(info)` | Serialize public profile |
| `decodeProfileInfo(body)` | Deserialize public profile |
| `encodeAvatarInfo(avatar)` | Serialize avatar |
| `decodeAvatarInfo(body)` | Deserialize avatar |
| `getAvatarColor(userPk)` | HSL color from pubkey |
| `getAvatarInitials(name?, pk?)` | Initials for avatar |
| `createEmptyProfile(userPk)` | Default empty profile |
| `deriveProfileKey(privateKeyHex)` | Derive encryption key |
| `encryptProfileInfo(info, key)` | Encrypt profile |
| `decryptProfileInfo(encrypted, key)` | Decrypt profile |
| `encodePrivateProfileInfo(info, key, publicName?, publicAvatar?)` | Encode private profile |
| `decodePrivateProfileInfo(body, key?)` | Decode private profile |
| `isPrivateProfile(body)` | Check if private |
| `decodeAnyProfileInfo(body, key?)` | Handle both formats |

### Cache (`lib/cache`)

| Function | Purpose |
|----------|---------|
| `getMediaFromCache(hash)` | Get cached media |
| `setMediaInCache(hash, data, mediaType)` | Store media |
| `getContentFromCache<T>(id)` | Get cached content |
| `setContentInCache<T>(id, data)` | Store content |
| `deleteContentFromCache(id)` | Remove content |
| `getFromMemory<T>(key)` | Memory cache get |
| `setInMemory<T>(key, data, ttlMs?)` | Memory cache set |
| `invalidateMemory(keyPrefix)` | Invalidate by prefix |
| `getFromStorage<T>(key)` | localStorage get |
| `setInStorage<T>(key, data, ttlMs?)` | localStorage set |
| `removeFromStorage(key)` | localStorage remove |
| `getCacheStats()` | Cache statistics |
| `clearDecryptedMediaCache()` | Clear decrypted media |
| `clearAllCaches()` | Clear all layers |
