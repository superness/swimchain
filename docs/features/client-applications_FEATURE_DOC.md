# Client Applications - Feature Documentation

## Overview

Swimchain provides a suite of specialized web-based client applications, each designed for a specific use case within the decentralized network. These clients share common infrastructure (WASM bindings, RPC communication, identity management) while offering distinct user experiences tailored to different interaction patterns.

**Client Portfolio:**
- **Forum Client** - Reddit-style threaded discussions with spam reporting
- **Chat Client** - Discord-like real-time messaging with presence/typing
- **Search Client** - Full-text content search with advanced query syntax
- **Feed Client** - Twitter-like social feed (partially implemented)
- **Analytics Client** - Network health monitoring
- **Archiver Client** - Content preservation and decay prevention
- **Bridge Client** - External platform integration (Matrix, IRC)
- **Debug Dashboard** - Network visualization and debugging (HTML+JS)

## Architecture

All client applications follow a consistent layered architecture:

```
+-------------------------------------------------------------+
|                    React Application                         |
+-------------------------------------------------------------+
|   SwimchainProvider (WASM Loader)                           |
|       +-- RpcProvider (Node Connection)                     |
|           +-- IdentityProvider (Keypair Management)         |
|               +-- KeyboardNavProvider (Vim shortcuts)       |
|                   +-- App Routes & Components               |
+-------------------------------------------------------------+
|   Shared Libraries (lib/)                                    |
|   +-- rpc.ts          - JSON-RPC 2.0 client                 |
|   +-- action-pow.ts   - Argon2id PoW computation            |
|   +-- encryption.ts   - AES-GCM content encryption          |
|   +-- x25519.ts       - Key exchange utilities              |
|   +-- dm.ts           - Direct message space generation     |
|   +-- profile.ts      - User profile management             |
|   +-- cache.ts        - Multi-layer caching                 |
|   +-- queryParser.ts  - Advanced search syntax (search-client)
+-------------------------------------------------------------+
|   WASM Bindings (swimchain-wasm)                            |
|   +-- Keypair generation                                    |
|   +-- Identity PoW mining                                   |
|   +-- Address encoding/decoding                             |
|   +-- Decay calculations                                    |
+-------------------------------------------------------------+
|   Swimchain Node (RPC Server)                               |
|   +-- JSON-RPC 2.0 + WebSocket                              |
+-------------------------------------------------------------+
```

### Shared Provider Stack

```tsx
<SwimchainProvider>           {/* WASM initialization */}
  <RpcProvider>               {/* Node connection */}
    <IdentityProvider>        {/* Keypair context */}
      <KeyboardNavProvider>   {/* Vim-style navigation */}
        <PreferencesProvider> {/* User settings */}
          <App />
        </PreferencesProvider>
      </KeyboardNavProvider>
    </IdentityProvider>
  </RpcProvider>
</SwimchainProvider>
```

---

## Data Structures

### Common Types (All Clients)

#### StoredIdentity
Browser-persisted cryptographic identity.

| Field | Type | Description |
|-------|------|-------------|
| address | string | Bech32m address (cs1...) |
| publicKey | string | Hex-encoded Ed25519 public key |
| seed | string | Hex-encoded seed for key derivation |
| createdAt | number | Unix timestamp |
| powSolution | object? | Optional identity PoW proof |

#### SyncStatus
Network synchronization state.

| Field | Type | Description |
|-------|------|-------------|
| chainPercent | number | Chain sync progress (0-100) |
| peerCount | number | Connected peers |
| storageUsed | number | Local storage bytes |
| state | string | 'synced' \| 'syncing' \| 'behind' \| 'offline' |

### Forum Client Types

#### Thread
Forum thread with decay tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Content hash identifier |
| spaceId | string | Parent space identifier |
| title | string | Thread title |
| body | string | Thread content (Markdown) |
| authorId | string | Author's public key |
| createdAt | number | Unix timestamp |
| replyCount | number | Number of replies |
| decayInfo | DecayInfo | Content persistence state |
| poolState | PoolState? | Engagement pool status |
| reactions | ReactionCounts | Emoji reactions |

#### DecayInfo
Content lifecycle state from node.

| Field | Type | Description |
|-------|------|-------------|
| survival_probability | number | Heat (0-1) |
| decay_state | string | 'protected' \| 'active' \| 'stale' \| 'decayed' |
| seconds_until_decay_starts | number | Time to decay floor end |
| seconds_until_pruned | number | Time until removal |
| last_engagement | number | Last engagement timestamp |

#### PoolState
Engagement pool contribution status.

| Field | Type | Description |
|-------|------|-------------|
| pool_id | string | Pool identifier |
| current_seconds | number | Accumulated PoW (0-60) |
| required_seconds | number | Target (always 60) |
| contributor_count | number | Number of contributors |

#### PoWChallenge
82-byte canonical PoW challenge format.

| Field | Type | Description |
|-------|------|-------------|
| actionType | ActionType | Action type byte |
| contentHash | Uint8Array | SHA-256 of content (32 bytes) |
| authorId | Uint8Array | Author public key (32 bytes) |
| timestamp | number | Unix timestamp |
| difficulty | number | Target difficulty |
| nonceSpace | Uint8Array | Nonce space (8 bytes) |

#### PoWSolution
Completed proof-of-work solution.

| Field | Type | Description |
|-------|------|-------------|
| challenge | PoWChallenge | Original challenge |
| nonce | bigint | Solution nonce |
| hash | Uint8Array | Resulting hash (32 bytes) |

#### DMStatus
Direct message status type.

```typescript
type DMStatus = 'none' | 'pending_sent' | 'pending_received' | 'active' | 'declined';
```

**DM State Machine:**
```
[none] ----request_dm----> [pending_sent] (requester view)
[none] <--request_dm----- [pending_received] (target view)
[pending_received] ----accept_dm----> [active]
[pending_received] ----decline_dm---> [declined]
[active] <--messages--> [active]
```

#### DMInfo
Direct message relationship info.

| Field | Type | Description |
|-------|------|-------------|
| status | DMStatus | Current DM status |
| spaceId | string? | DM space ID if active |
| otherParty | string | Other user's public key |
| createdAt | number? | Relationship creation time |
| requestHash | string? | DM request content hash |

#### SpamReason
Spam attestation reason categories (SPEC_12 §3).

| Value | Title | Description |
|-------|-------|-------------|
| advertising | Advertising | Commercial promotion or spam links |
| repetitive | Repetitive | Duplicate or copy-paste content |
| off_topic | Off Topic | Unrelated to the space/discussion |
| harassment | Harassment | Personal attacks or bullying |
| illegal_content | Illegal Content | Violates law (CSAM, etc.) |

#### EmojiCount
Reaction count per emoji type.

| Field | Type | Description |
|-------|------|-------------|
| emoji | string | Emoji type (8 supported) |
| count | number | Number of reactions |

**Supported Emoji Types:**
`heart`, `thumbs_up`, `fire`, `laugh`, `thinking`, `mind_blown`, `swimming`, `thumbs_down`

### Chat Client Types

#### PresenceStatus
User online status.

```typescript
type PresenceStatus = 'online' | 'away' | 'offline';
```

#### PresenceState
Full presence information.

| Field | Type | Description |
|-------|------|-------------|
| userId | string | User public key |
| status | PresenceStatus | Current status |
| lastSeen | number | Last activity timestamp |

### Search Client Types

#### ParsedQuery
Parsed search query with operators.

| Field | Type | Description |
|-------|------|-------------|
| terms | string[] | Regular search terms |
| phrases | string[] | Exact phrase matches |
| excludeTerms | string[] | Terms to exclude |
| author | string? | Filter by author |
| space | string? | Filter by space |
| type | SearchResultType? | Content type filter |
| before | number? | Unix timestamp upper bound |
| after | number? | Unix timestamp lower bound |
| hasMedia | boolean? | Require media attachments |
| minReplies | number? | Minimum reply count |
| minReactions | number? | Minimum reaction count |

#### SearchResultType
Content type filter values.

```typescript
type SearchResultType = 'space' | 'thread' | 'reply' | 'user';
```

### Archiver Client Types

#### ArchiverConfig
Content preservation configuration.

| Field | Type | Description |
|-------|------|-------------|
| targetSpaces | string[] | Spaces to monitor |
| archiveThreshold | number | Heat below which to archive (default 5%) |
| autoEngageThreshold | number | Heat below which to auto-engage (default 10%) |
| storageBudgetGB | number | Max local archive size (default 50) |
| dailyPowBudgetSeconds | number | Daily PoW budget (default 3600) |
| enableAutoEngage | boolean | Auto-engage enabled flag |

#### AtRiskContent
Content at risk of decay.

| Field | Type | Description |
|-------|------|-------------|
| postHash | string | Content identifier |
| spaceId | string | Parent space |
| title | string | Content title |
| heat | number | Current survival probability |
| poolProgress | number | Pool completion (0-1) |
| urgency | string | 'critical' \| 'warning' \| 'normal' |
| timeToDecay | number | Seconds until threshold |
| replyCount | number | Engagement metric |

#### ArchiveEntry
Locally archived content.

| Field | Type | Description |
|-------|------|-------------|
| postHash | string | Primary key |
| spaceId | string | Original space |
| title | string | Content title |
| body | string | Content body |
| author | string | Author address |
| timestamp | Date | Original creation time |
| archivedAt | Date | Archive timestamp |
| originalHeat | number | Heat at archive time |
| replies | ArchiveEntry[]? | Nested replies |

#### BudgetState
Daily PoW budget tracking.

| Field | Type | Description |
|-------|------|-------------|
| used | number | Seconds used today |
| date | string | YYYY-MM-DD UTC |
| limit | number | Daily budget limit |

### Bridge Client Types

#### BridgeConfig
Cross-platform bridging configuration.

| Field | Type | Description |
|-------|------|-------------|
| enabled | boolean | Bridge active |
| targetSpace | string | Swimchain space to bridge |
| dailyPowBudgetSeconds | number | PoW limit (default 3600) |
| maxPostsPerHour | number | Rate limit (default 10) |
| matrix | MatrixConfig | Matrix settings |
| irc | IrcConfig | IRC settings |

#### MatrixConfig
Matrix homeserver settings.

| Field | Type | Description |
|-------|------|-------------|
| enabled | boolean | Matrix bridging active |
| homeserverUrl | string | Matrix server URL |
| accessToken | string | User access token |
| userId | string | Matrix user ID (@user:server) |
| roomIds | string[] | Rooms to bridge |

#### IrcConfig
IRC server settings.

| Field | Type | Description |
|-------|------|-------------|
| enabled | boolean | IRC bridging active |
| server | string | IRC server hostname |
| port | number | IRC port (6697 TLS / 6667) |
| tls | boolean | Use TLS encryption |
| nickname | string | IRC nickname |
| channels | string[] | Channels to bridge |
| proxyUrl | string | **Required** WebSocket proxy URL |

#### EchoEntry
Echo prevention tracking entry.

| Field | Type | Description |
|-------|------|-------------|
| sourceId | string | Original message ID |
| targetId | string | Bridged message ID |
| platform | string | Source platform |
| timestamp | number | Entry creation time |
| expiresAt | number | TTL expiration time |

### Analytics Client Types

#### NetworkHealth
Overall network health metrics.

| Field | Type | Description |
|-------|------|-------------|
| score | number | Health score (0-100) |
| status | string | 'critical' \| 'warning' \| 'healthy' \| 'excellent' |
| activeSwimmers | number | Active node count |
| postsAtRisk | number | Posts below heat threshold |
| lastSyncAgeMinutes | number | Time since last sync |
| avgHeat | number | Network-wide average heat |
| breakdown | object | Per-metric scores |

#### SpaceMetrics
Per-space statistics.

| Field | Type | Description |
|-------|------|-------------|
| spaceId | string | Space identifier |
| name | string | Space display name |
| totalPosts | number | Total post count |
| postsAtRisk | number | Posts at decay risk |
| healthyPosts | number | Posts above threshold |
| avgHeat | number | Average survival probability |
| activeContributors | number | Unique authors |
| postsLast24h | number | Recent post count |
| engagementsLast24h | number | Recent engagements (**returns 0 - not implemented**) |

---

## Core APIs

### RPC Client

#### SwimchainRpc
**Location**: `*/src/lib/rpc.ts`

JSON-RPC 2.0 client with signature authentication.

```typescript
class SwimchainRpc {
  constructor(config: RpcConfig)

  async call<T>(method: string, params?: object): Promise<T>
  async connect(): Promise<void>
  async getSpaces(): Promise<Space[]>
  async listPosts(spaceId: string, pagination?: object): Promise<Thread[]>
  async createPost(params: CreatePostParams): Promise<string>
  async getSyncStatus(): Promise<SyncStatus>
  async searchSuggest(prefix: string, limit: number): Promise<string[]>
}
```

**Authentication Flow:**
```typescript
// Request signing
const message = `swimchain-rpc:${method}:${sha256(params)}:${timestamp}`;
const signature = sign(message, keypair.privateKey);

// Headers sent
{
  'X-CS-Identity': publicKeyHex,
  'X-CS-Timestamp': timestamp,
  'X-CS-Signature': signatureHex
}
```

### Action PoW

#### createChallenge()
**Signature**: `createChallenge(actionType: ActionType, contentHash: Uint8Array, authorId: Uint8Array, difficulty: number): PoWChallenge`

**Purpose**: Creates a proof-of-work challenge for an action.

**Parameters**:
- `actionType`: Type of action (Post=0x02, Reply=0x03, Engage=0x04, SpamAttestation=0x08, etc.)
- `contentHash`: SHA-256 hash of content (32 bytes)
- `authorId`: Author's public key (32 bytes)
- `difficulty`: Target difficulty (leading zeros)

**Returns**: Challenge struct with 82-byte canonical format.

#### computePow()
**Signature**: `async computePow(challenge: PoWChallenge, onProgress?: (attempts: number, hashRate: number) => void): Promise<PoWSolution>`

**Purpose**: Mines a proof-of-work solution using Argon2id.

**Parameters**:
- `challenge`: PoW challenge from createChallenge()
- `onProgress`: Optional progress callback

**Returns**: Solution with nonce and hash meeting difficulty.

**Example**:
```typescript
import { createChallenge, computePow, ActionType } from './lib/action-pow';

const challenge = createChallenge(
  ActionType.Post,
  contentHash,
  authorPublicKey,
  difficulty
);

const solution = await computePow(challenge, (attempts, rate) => {
  console.log(`Mining: ${attempts} attempts, ${rate} H/s`);
});

// Convert for RPC submission
const params = solutionToRpcParams(solution);
```

#### computeActionHash()
**Signature**: `computeActionHash(authorId: Uint8Array, timestamp: number, actionType: ActionType, contentHash: Uint8Array): Uint8Array`

**Purpose**: Computes action hash for Replace-In-Mempool (RIM) tracking.

**Returns**: SHA-256 hash identifying the action for replacement within 30-second window.

#### computePoolPowTarget()
**Signature**: `computePoolPowTarget(contentHash: Uint8Array, poolId: string, prevBlockHash: Uint8Array): Uint8Array`

**Purpose**: Computes pool PoW target for engagement pool contributions.

**Returns**: SHA-256 hash used as pool contribution target.

### Encryption

#### encryptContent()
**Signature**: `async encryptContent(content: string, passphrase: string): Promise<string>`

**Purpose**: Encrypts content with a passphrase using AES-GCM.

**Parameters**:
- `content`: Plaintext content
- `passphrase`: User-provided passphrase

**Returns**: Encrypted string in format `[ENCRYPTED:v1:<base64>]`

**Process**:
1. Generate 16-byte random salt
2. Generate 12-byte random IV
3. Derive key via PBKDF2-SHA256 (100,000 iterations)
4. Encrypt with AES-256-GCM
5. Format: `[ENCRYPTED:v1:<base64(salt||iv||ciphertext)>]`

#### decryptContent()
**Signature**: `async decryptContent(encrypted: string, passphrase: string): Promise<string>`

**Purpose**: Decrypts passphrase-encrypted content.

#### encryptWithSpaceKey()
**Signature**: `async encryptWithSpaceKey(content: string, spaceKey: Uint8Array): Promise<string>`

**Purpose**: Encrypts content with a space's symmetric key for private spaces.

**Format**: `[PRIVATE:v1:<base64(iv||ciphertext)>]`

#### encryptMedia() / decryptPrivateMedia()
**Signature**: `async encryptMedia(data: Uint8Array, passphrase: string): Promise<Uint8Array>`

**Purpose**: Encrypts media files using same PBKDF2 + AES-GCM scheme.

**Format**: `salt (16) || iv (12) || ciphertext`

#### encryptSpaceName() / decryptSpaceName()
**Signature**: `async encryptSpaceName(name: string, spaceKey: Uint8Array): Promise<string>`

**Purpose**: Encrypts private space names for display privacy.

### X25519 Key Exchange

#### ed25519PrivateToX25519()
**Signature**: `ed25519PrivateToX25519(ed25519Private: Uint8Array): Uint8Array`

**Purpose**: Converts Ed25519 private key to X25519 using SHA-512 with clamping.

#### ed25519PublicToX25519()
**Signature**: `ed25519PublicToX25519(ed25519Public: Uint8Array): Uint8Array`

**Purpose**: Converts Ed25519 public key to X25519 using birational map.

**Formula**: `u = (1 + y) / (1 - y) mod p`

#### x25519Box()
**Signature**: `x25519Box(message: Uint8Array, recipientPublicKey: Uint8Array, senderPrivateKey: Uint8Array): Uint8Array`

**Purpose**: Encrypts a message for a specific recipient using X25519 + XSalsa20-Poly1305.

**Format**: `nonce (24 bytes) || ciphertext`

#### x25519Unbox()
**Signature**: `x25519Unbox(sealed: Uint8Array, senderPublicKey: Uint8Array, recipientPrivateKey: Uint8Array): Uint8Array`

**Purpose**: Decrypts a sealed box from a known sender.

#### generateSpaceKey()
**Signature**: `generateSpaceKey(): Uint8Array`

**Purpose**: Generates random 32-byte AES-256 key for private space.

**Example**:
```typescript
import { ed25519PrivateToX25519, x25519Box, x25519Unbox } from './lib/x25519';

// Convert Ed25519 keys to X25519
const senderX25519Private = ed25519PrivateToX25519(senderEd25519Private);
const recipientX25519Public = ed25519PublicToX25519(recipientEd25519Public);

// Encrypt space key for invite
const encryptedKey = x25519Box(spaceKey, recipientX25519Public, senderX25519Private);

// Recipient decrypts
const decryptedKey = x25519Unbox(encryptedKey, senderX25519Public, recipientX25519Private);
```

### DM Utilities

#### getDMSpaceId()
**Signature**: `getDMSpaceId(myPublicKey: Uint8Array, theirPublicKey: Uint8Array): string`

**Purpose**: Generates deterministic DM space ID from two public keys.

**Algorithm**:
```
1. Sort public keys lexicographically
2. Concatenate: "dm:v1:" + sorted_pk1 + sorted_pk2
3. SHA-256 hash the string
4. Take first 16 bytes as space ID
```

Both parties compute identical space IDs, enabling private conversations without central coordination.

#### isDMSpace()
**Signature**: `isDMSpace(spaceId: string, myPk: Uint8Array, theirPk: Uint8Array): boolean`

**Purpose**: Verifies if a space ID is a valid DM space between two users.

#### canInitiateDM()
**Signature**: `canInitiateDM(status: DMStatus): boolean`

**Purpose**: Checks if DM can be initiated (returns true for 'none' or 'declined').

#### getDMStatusText()
**Signature**: `getDMStatusText(status: DMStatus): string`

**Purpose**: Returns human-readable DM status text.

#### getDMAction()
**Signature**: `getDMAction(status: DMStatus): string | null`

**Purpose**: Returns the action user can take based on current DM status.

### Search Query Parser

#### parseQuery()
**Location**: `search-client/src/lib/queryParser.ts`

**Signature**: `parseQuery(input: string): ParsedQuery`

**Purpose**: Parses Google-like search syntax into structured query.

**Supported Operators**:
| Operator | Example | Description |
|----------|---------|-------------|
| `"..."` | `"exact phrase"` | Match exact phrase |
| `author:` | `author:alice` | Filter by author |
| `space:` | `space:programming` | Filter by space |
| `type:` | `type:thread` | Content type (thread, reply, space, user) |
| `before:` | `before:2024-01-01` | Content before date |
| `after:` | `after:2024-06-01` | Content after date |
| `has:` | `has:media` | Content with attachments |
| `-term` | `-spam` | Exclude term |
| `OR` | `rust OR go` | Match either term |
| `replies:>N` | `replies:>10` | Minimum reply count |
| `reactions:>N` | `reactions:>50` | Minimum reaction count |

**Date Formats**:
- ISO: `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss`
- Relative: `today`, `yesterday`
- Duration: `7d`, `1w`, `1m`, `1y` (days, weeks, months, years)

**Example**:
```typescript
import { parseQuery, buildQueryString } from './lib/queryParser';

const parsed = parseQuery('rust "async await" author:ferris type:thread after:7d');
// {
//   terms: ['rust'],
//   phrases: ['async await'],
//   author: 'ferris',
//   type: 'thread',
//   after: 1704326400
// }

const rebuilt = buildQueryString(parsed);
// 'rust "async await" author:ferris type:thread after:2024-01-04'
```

#### buildQueryString()
**Signature**: `buildQueryString(parsed: ParsedQuery): string`

**Purpose**: Reconstructs query string from parsed query.

#### getHighlightTerms()
**Signature**: `getHighlightTerms(parsed: ParsedQuery): {terms: string[], phrases: string[]}`

**Purpose**: Extracts terms for search result highlighting.

### Content Monitor (Archiver)

#### calculateSurvival()
**Signature**: `calculateSurvival(lastEngagement: number, now: number): number`

**Purpose**: Calculates content survival probability based on decay model.

**Formula**:
```
effectiveDecayTime = max(0, timeSinceEngagement - DECAY_FLOOR)
survival = 0.5^(effectiveDecayTime / HALF_LIFE)

where:
  DECAY_FLOOR = 172,800 seconds (48 hours)
  HALF_LIFE = 604,800 seconds (7 days)
  DECAY_THRESHOLD = 6.25%
```

#### estimateDecayTime()
**Signature**: `estimateDecayTime(currentHeat: number): number`

**Purpose**: Estimates seconds until content falls below decay threshold.

**Formula**:
```
timeToDecay = HALF_LIFE * log2(currentHeat / DECAY_THRESHOLD)
```

### Auto-Engage Engine

#### calculatePriority()
**Signature**: `calculatePriority(content: AtRiskContent): number`

**Purpose**: Calculates engagement priority for at-risk content.

**Formula**:
```
priority = (heatUrgency * 0.5) + (replyValue * 0.3) + (poolProgress * 0.2)

where:
  heatUrgency = (threshold - heat) / threshold
  replyValue = min(1, log10(replyCount + 1) / 3)
  poolProgress = currentSeconds / requiredSeconds
```

**Weighting**:
- 50% Heat urgency (lower heat = higher priority)
- 30% Reply engagement value
- 20% Pool completion proximity

#### getEngagementQueue()
**Signature**: `getEngagementQueue(atRisk: AtRiskContent[], policies: Map<string, ArchiverPolicy>): AtRiskContent[]`

**Purpose**: Returns prioritized list of content to engage, filtered by policies.

---

## UI Components

### ReportModal (Forum Client)
**Location**: `forum-client/src/components/ReportModal.tsx`

**Purpose**: Spam attestation UI per SPEC_12 §3.

**Props**:
```typescript
interface ReportModalProps {
  contentId: string;
  onClose: () => void;
}
```

**Features**:
- Five spam reason categories with descriptions
- PoW proof mining for reports
- Counter-attestation ("Defend") button for flagged content
- Mining progress visualization
- Shows current spam status and attestation count

**Related Components**:
- `SpamBadge` - Badge showing report count or "Flagged" status
- `ReportButton` - Small button to trigger modal

### InviteModal (Forum Client)
**Location**: `forum-client/src/components/InviteModal.tsx`

**Purpose**: Private space invitation workflow.

**Props**:
```typescript
interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
}
```

**Features**:
- Validates recipient address (64-char hex Ed25519 public key)
- X25519 key derivation and encryption for space key
- Ed25519 signature authentication
- Optional personal message field
- Auto-closes after successful invite

### ContentStatus (Forum Client)
**Location**: `forum-client/src/components/ContentStatus.tsx`

**Purpose**: Emoji reaction system with 8 reaction types.

**Props**:
```typescript
interface ContentStatusProps {
  onReact?: (emoji: string) => void;
  isReacting?: boolean;
  emojiCounts?: EmojiCount[];
  compact?: boolean;
}
```

**Render Modes**:
1. **compact=true**: Single-line emoji count chips
2. **onReact=undefined**: Read-only mode, shows counts only
3. **Default**: Interactive with picker button

### ThreadPanel (Chat Client)
**Location**: `chat-client/src/components/ThreadPanel.tsx`

**Purpose**: Inline thread expansion panel per CLIENT_DESIGN.md §5.4.

**Props**:
```typescript
interface ThreadPanelProps {
  parentMessage: Message;
  replies: Message[];
  isLoading: boolean;
  onClose: () => void;
  onReplySent: (message: Message) => void;
}
```

**Features**:
- Shows parent message with all replies
- Presence dots for each reply author
- Reply count header
- Message input for adding replies
- Loading state with spinner

---

## Behaviors

### Identity Authentication Flow

All clients require cryptographic identity for write operations.

**Steps**:
1. User visits `/identity` page
2. Generates Ed25519 keypair (or imports existing)
3. Keypair stored in localStorage (`swimchain-identity`)
4. IdentityProvider makes identity available globally
5. RPC client signs requests with private key
6. Node verifies signature before accepting actions

**RequireIdentity Guard**:
```tsx
// Wraps protected routes
<RequireIdentity>
  <ProtectedPage />
</RequireIdentity>

// Redirects to /identity if no valid identity
```

### Content Creation with PoW

All content creation requires proof-of-work to prevent spam.

**Steps**:
1. User composes content
2. Client creates PoW challenge with content hash
3. Argon2id mining begins (shows progress UI)
4. Solution computed (nonce meeting difficulty)
5. RPC submission with PoW parameters
6. Node validates PoW and creates action
7. Action enters mempool, included in next block

**Difficulty Levels** (testnet/mainnet):
| Action | Testnet | Mainnet |
|--------|---------|---------|
| Post | 10 | 20 |
| Reply | 8 | 18 |
| Engage | 6 | 16 |
| Space Creation | 12 | 22 |
| Edit | 8 | 18 |
| Spam Attestation | 8 | 18 |

### Spam Reporting Flow (SPEC_12)

Users can attest content as spam with PoW proof.

**Report Flow**:
1. User clicks Report button on content
2. ReportModal opens with reason selection
3. User selects spam category
4. PoW mining begins (Argon2id)
5. SpamAttestation action submitted
6. Spam score increments based on attestation

**Counter-Attestation (Defend)**:
1. For flagged content, users can defend
2. Counter-attestation reduces spam score
3. Prevents malicious flagging abuse

### Replace-In-Mempool (RIM)

Allows replacing pending actions before block formation (~30 second window).

**Steps**:
1. User submits action, receives action hash
2. Within 30 seconds, user can submit replacement
3. Replacement uses same `computeActionHash()` as original
4. Node replaces pending action with new version
5. Only newest action included in block

**Use Case**: Edit post before it's confirmed on chain.

### Private Space Encryption

Private spaces use symmetric encryption with key exchange for members.

**Space Creation**:
1. Creator generates random 32-byte space key
2. Space key encrypted for creator using X25519 box
3. Stored in IndexedDB (`swimchain-private-spaces`)

**Member Invitation** (via InviteModal):
1. Creator enters invitee's public key
2. Space key encrypted for invitee's X25519 public key
3. Invite action includes encrypted key blob
4. Invitee decrypts with their X25519 private key
5. Stores space key locally

**Content Encryption**:
1. All content AES-GCM encrypted with space key
2. 12-byte random IV per message (never reused)
3. Encrypted content stored on chain (opaque to non-members)

### Direct Message Space Generation

DMs use deterministically generated private spaces.

**Steps**:
1. User A initiates DM with User B
2. DM space ID computed: `SHA256("dm:v1:" + sorted(pk_A, pk_B))[0:16]`
3. Both users derive identical space ID
4. Space key generated and exchanged via DM request/accept flow
5. Messages encrypted with shared space key

### Keyboard Navigation (Vim-style)

Forum client supports keyboard shortcuts via `useKeyboardNavigation` hook.

| Key | Action |
|-----|--------|
| `j` | Move selection down |
| `k` | Move selection up |
| `Enter` | Open selected item |
| `n` | Focus new thread form |
| `r` | Focus reply form |
| `e` | Engage +5s |
| `E` | Engage +15s |
| `/` | Focus search |
| `?` | Show shortcuts modal |
| `Backspace` | Go back |
| `Escape` | Close modal |

**Notes**:
- Shortcuts disabled when typing in text fields
- Selection resets on route change
- Shows modal with `?` key

### Typing Indicators (Chat Client)

Real-time typing feedback using ephemeral state.

**Features**:
- Ephemeral, in-memory only (never persisted)
- Auto-expires after TYPING_TIMEOUT_MS
- Map-based: spaceId -> Set of typing users
- Current user excluded from display

**Context API**:
```typescript
const { typingUsers, startTyping, stopTyping, getTypingUsers } = useTyping();

// Start typing when user types
startTyping(spaceId);

// Get typing users for display
const usersTyping = getTypingUsers(spaceId); // Excludes self
```

### Presence System (Chat Client)

Online/away/offline status tracking.

**Status Types**:
- `online`: Active in last PRESENCE_AWAY_THRESHOLD_MS
- `away`: Idle beyond threshold
- `offline`: Disconnected

**Features**:
- Activity tracking via keydown, mousemove, click, touchstart
- Heartbeat interval at PRESENCE_HEARTBEAT_MS
- Auto-transitions to 'away' after inactivity
- Sorted user list (online first)

**Context API**:
```typescript
const { presenceMap, setOwnPresence, getPresence, onlineCount } = usePresence();

// Get specific user's presence
const userPresence = getPresence(userId);
```

### Search Suggestions

Autocomplete suggestions using debounced search.

**Hook**: `useSearchSuggestions(prefix, debounceMs = 200, minLength = 2)`

**Features**:
- Debounced autocomplete (default 200ms)
- Minimum prefix length (default 2 chars)
- Stale request prevention
- Max 8 suggestions

**Trending Searches Hook**: `useTrendingSearches()`
- Fetches top 10 trending searches
- Fallback hardcoded topics on error

### Search History

Query history with localStorage persistence.

**Hook**: `useSearchHistory()`

**Features**:
- localStorage persistence (key: `search-history`)
- Maximum 20 items
- Deduplication (moves existing to top, case-insensitive)

```typescript
const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();
```

### Archiver Auto-Engagement

The archiver client automatically preserves at-risk content.

**Monitoring Loop** (60-second interval):
1. Scan configured spaces for content
2. Filter content below heat threshold (default 10%)
3. Calculate urgency classification:
   - Critical: heat < 5%
   - Warning: heat < 10%
4. Sort by priority (heat urgency + engagement + pool progress)
5. Update subscribers (dashboard)

**Auto-Engage Flow**:
1. Check daily PoW budget allows engagement
2. Validate content meets policy (per-space settings)
3. Contribute PoW to content's engagement pool
4. Record engagement, update budget
5. Log activity

**Note**: Current implementation simulates engagement with timeout. TODO: Integrate actual PoW API.

### Bridge Echo Prevention

Prevents message loops when bridging bidirectionally.

**Tracking Mechanism**:
```typescript
// Mark message as bridged
echoTracker.markBridged('matrix', sourceMessageId, swimchainPostHash);

// Check before bridging
if (echoTracker.isBridged('matrix', messageId)) {
  return; // Skip, already bridged
}

// Check before outbound bridge
if (echoTracker.wasBridgedTo(postHash)) {
  return; // Skip, originated from external
}
```

**TTL**: 1 hour (entries expire automatically)

**Message Prefixes** (secondary protection):
- `[matrix/username]` - Originated from Matrix
- `[irc/nickname]` - Originated from IRC
- `[cs/address]` - Originated from Swimchain

### Bridge Rate Limiting

Sliding window rate limiter per Swimchain space.

**Algorithm**:
```
1. Store timestamps of recent posts per space
2. Filter to posts within last hour
3. If count >= 10, deny new post
4. Calculate next available time from oldest timestamp
```

**Configuration**:
- Max 10 posts per hour per space
- 1-hour sliding window
- Automatic pruning of expired timestamps

---

## Configuration

### Forum Client Preferences

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| threadOrdering | string | 'newest' | Thread sort order |
| threadsPerPage | number | 25 | Pagination size |
| storageTargetMB | number | 500 | Local cache size limit |

### Archiver Client Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| targetSpaces | string[] | [] | Spaces to monitor |
| archiveThreshold | number | 0.05 | Heat threshold for archiving |
| autoEngageThreshold | number | 0.10 | Heat threshold for auto-engage |
| storageBudgetGB | number | 50 | Max archive storage |
| dailyPowBudgetSeconds | number | 3600 | Daily PoW limit (1 hour) |
| enableAutoEngage | boolean | false | Enable automatic engagement |

### Bridge Client Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | false | Bridge active |
| targetSpace | string | '' | Swimchain space to bridge |
| dailyPowBudgetSeconds | number | 3600 | Daily PoW budget |
| maxPostsPerHour | number | 10 | Rate limit per space |
| matrix.enabled | boolean | false | Matrix integration |
| matrix.homeserverUrl | string | 'https://matrix.org' | Matrix server |
| matrix.accessToken | string | '' | User access token |
| matrix.roomIds | string[] | [] | Rooms to bridge |
| irc.enabled | boolean | false | IRC integration |
| irc.server | string | '' | IRC server |
| irc.port | number | 6697 | IRC port |
| irc.tls | boolean | true | Use TLS |
| irc.proxyUrl | string | '' | WebSocket proxy URL (**required**) |
| irc.channels | string[] | [] | Channels to bridge |

### Analytics Client Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| pollIntervalMs | number | 30000 | Metrics collection interval |
| historyRetentionHours | number | 24 | Health history retention |
| alertThresholds.minSwimmers | number | 5 | Low swimmer alert threshold |
| alertThresholds.maxRiskPercent | number | 20 | High risk posts threshold |
| alertThresholds.maxSyncAgeMinutes | number | 10 | Stale sync threshold |

---

## RPC Methods Used

### Content Operations

#### list_space_content
**Request**:
```json
{
  "method": "list_space_content",
  "params": {
    "space_id": "sp1abc...",
    "limit": 50,
    "offset": 0
  }
}
```

**Response**:
```json
{
  "result": {
    "items": [
      {
        "content_id": "sha256:abc...",
        "title": "Thread Title",
        "body": "Content body...",
        "author_id": "cs1abc...",
        "created_at": 1704067200,
        "survival_probability": 0.85,
        "pool_progress": 0.5,
        "reply_count": 12,
        "spam_attestations": 0
      }
    ],
    "total": 150
  }
}
```

#### submit_post
**Request**:
```json
{
  "method": "submit_post",
  "params": {
    "space_id": "sp1abc...",
    "title": "New Thread",
    "body": "Thread content...",
    "author_id": "cs1abc...",
    "pow_nonce": 12345678,
    "pow_difficulty": 10,
    "pow_nonce_space": "abc123...",
    "pow_hash": "def456...",
    "signature": "sig789...",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "content_id": "sha256:newcontent..."
  }
}
```

#### submit_engagement
**Request**:
```json
{
  "method": "submit_engagement",
  "params": {
    "content_id": "sha256:abc...",
    "author_id": "cs1abc...",
    "seconds": 15,
    "pow_nonce": 87654321,
    "pow_difficulty": 6,
    "pow_nonce_space": "xyz789...",
    "pow_hash": "uvw012...",
    "signature": "sig345..."
  }
}
```

#### submit_spam_attestation
**Request**:
```json
{
  "method": "submit_spam_attestation",
  "params": {
    "content_id": "sha256:abc...",
    "author_id": "cs1abc...",
    "reason": "advertising",
    "is_counter": false,
    "pow_nonce": 11111111,
    "pow_difficulty": 8,
    "signature": "sig..."
  }
}
```

### Space Operations

#### list_spaces
**Request**:
```json
{
  "method": "list_spaces",
  "params": {}
}
```

**Response**:
```json
{
  "result": [
    {
      "space_id": "sp1abc...",
      "name": "General Discussion",
      "is_private": false,
      "member_count": 150,
      "post_count": 1234
    }
  ]
}
```

#### create_private_space
**Request**:
```json
{
  "method": "create_private_space",
  "params": {
    "name": "Secret Club",
    "creator_id": "cs1abc...",
    "encrypted_space_key": "base64...",
    "pow_nonce": 11111111,
    "pow_difficulty": 12,
    "signature": "sig..."
  }
}
```

### DM Operations

#### request_dm
**Request**:
```json
{
  "method": "request_dm",
  "params": {
    "requester_id": "cs1abc...",
    "target_id": "cs1xyz...",
    "encrypted_space_key": "base64...",
    "pow_nonce": 12345,
    "signature": "sig..."
  }
}
```

#### accept_dm / decline_dm
**Request**:
```json
{
  "method": "accept_dm",
  "params": {
    "request_hash": "sha256:abc...",
    "responder_id": "cs1xyz...",
    "signature": "sig..."
  }
}
```

### Search Operations

#### search
**Request**:
```json
{
  "method": "search",
  "params": {
    "query": "rust async",
    "space": "programming",
    "type": "thread",
    "limit": 20,
    "offset": 0
  }
}
```

**Response**:
```json
{
  "result": {
    "items": [
      {
        "type": "thread",
        "id": "sha256:abc...",
        "title": "Async Rust Guide",
        "snippet": "...using async/await in Rust...",
        "score": 0.95
      }
    ],
    "total": 42
  }
}
```

#### search_suggest
**Request**:
```json
{
  "method": "search_suggest",
  "params": {
    "prefix": "rus",
    "limit": 8
  }
}
```

**Response**:
```json
{
  "result": ["rust", "rust programming", "rust async"]
}
```

### Node Status

#### get_sync_status
**Request**:
```json
{
  "method": "get_sync_status",
  "params": {}
}
```

**Response**:
```json
{
  "result": {
    "chain_height": 12345,
    "sync_height": 12340,
    "peer_count": 8,
    "sync_state": "syncing",
    "sync_percent": 99.5
  }
}
```

#### get_peers
**Request**:
```json
{
  "method": "get_peers",
  "params": {}
}
```

**Response**:
```json
{
  "result": [
    {
      "peer_id": "abc123...",
      "address": "192.168.1.1:19736",
      "version": "0.1.0",
      "height": 12345,
      "latency_ms": 45
    }
  ]
}
```

---

## CLI Commands

The CLI does not directly interact with client applications, but clients use the same RPC interface available via CLI:

### cs space list
```bash
cs space list [--json]
```
Lists all spaces (same as `list_spaces` RPC).

### cs post create
```bash
cs post create --space <SPACE_ID> --title "Title" --body "Content"
```
Creates a post (same as `submit_post` RPC, PoW computed locally).

### cs search
```bash
cs search "query" [--space <SPACE_ID>] [--limit 20] [--json]
```
Full-text search across content.

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `NO_IDENTITY` | No stored identity found | Navigate to /identity, create or import keypair |
| `INVALID_SIGNATURE` | Request signature failed verification | Check keypair integrity, re-authenticate |
| `POW_INVALID` | PoW solution doesn't meet difficulty | Retry mining, verify difficulty settings |
| `POW_EXPIRED` | PoW timestamp too old | Re-mine with current timestamp |
| `RATE_LIMITED` | Too many requests | Wait for rate limit window to reset |
| `SPACE_NOT_FOUND` | Referenced space doesn't exist | Verify space ID, ensure synced |
| `CONTENT_DECAYED` | Content below decay threshold | Cannot interact with decayed content |
| `BUDGET_EXCEEDED` | Daily PoW budget exhausted | Wait for UTC midnight reset |
| `ENCRYPTION_FAILED` | Space key missing or invalid | Re-fetch space key, rejoin space |
| `IRC_PROXY_REQUIRED` | Direct IRC connection attempted | Configure WebSocket proxy URL |
| `INVALID_INVITE_ADDRESS` | Recipient address not 64-char hex | Verify Ed25519 public key format |
| `SPAM_COOLDOWN` | Too many spam attestations | Wait before submitting more reports |

### Error Handling Pattern

```typescript
try {
  await rpc.call('submit_post', params);
} catch (error) {
  if (error.code === 'POW_INVALID') {
    // Re-mine with higher difficulty
  } else if (error.code === 'RATE_LIMITED') {
    // Show cooldown timer
  } else {
    // Generic error display
  }
}
```

---

## Testing

### Running Client Development Servers

```bash
# Forum Client
cd forum-client && pnpm dev
# Opens http://localhost:5173

# Chat Client
cd chat-client && pnpm dev
# Opens http://localhost:5174

# Search Client
cd search-client && pnpm dev
# Opens http://localhost:5175

# Feed Client
cd feed-client && pnpm dev
# Opens http://localhost:5176

# Analytics Client
cd analytics-client && pnpm dev
# Opens http://localhost:5177

# Archiver Client
cd archiver-client && pnpm dev
# Opens http://localhost:5178

# Bridge Client
cd bridge-client && pnpm dev
# Opens http://localhost:5179

# Debug Dashboard
cd debug-dashboard && node proxy.js
# Opens http://localhost:3000
```

### Testing with Local Node

```bash
# Start local node
cargo run -- node start --data-dir ./test-data

# Clients auto-connect to localhost:19736
# Or configure RPC URL in client settings
```

### Testing Private Spaces

1. Create two identities in separate browser profiles
2. Identity A creates private space
3. Identity A invites Identity B via InviteModal
4. Identity B accepts invite
5. Both can view encrypted content

### Testing Spam Reporting

1. Create test content
2. Click Report button
3. Select spam reason
4. Wait for PoW mining
5. Verify SpamBadge shows attestation count
6. Test "Defend" counter-attestation

### Testing Keyboard Navigation

1. Open Forum Client
2. Press `?` to view shortcuts modal
3. Press `j`/`k` to navigate threads
4. Press `Enter` to open selected
5. Press `/` to focus search

### Testing Bridge Client

```bash
# Start WebSocket-to-IRC proxy (required for IRC)
# Use external proxy like websocat or custom server

# Configure Matrix
# 1. Get access token from Matrix client (Element -> Settings -> Help)
# 2. Enter homeserver URL and token in Bridge settings
# 3. Add room IDs to bridge

# Configure IRC
# 1. Deploy WebSocket proxy
# 2. Enter proxy URL (ws://localhost:8080)
# 3. Configure server, nickname, channels
```

---

## Known Limitations

### Forum Client
- Profile images require manual upload (no gravatar integration)
- No offline mode (requires node connection)
- Markdown preview not real-time
- **Note**: MASTER_FEATURES.md lists "Debug Panel" but this refers to DebugPanel component for diagnostic info display

### Chat Client
- No notification API integration (no desktop notifications)
- Presence tracking is polling-based (5-second delay)
- No voice/video channels
- Typing indicators are ephemeral (not persisted)

### Search Client
- Search is server-side only (no client-side caching)
- Deep links require other clients running
- Four result types: ThreadResult, SpaceResult, ReplyResult, UserResult
- Search history limited to 20 entries

### Feed Client
- **Partially implemented**: Multiple routes show "Coming Soon"
  - Saved posts: Placeholder
  - Compose: Placeholder
  - Profile page: Placeholder
- Saved posts stored locally only (not synced)
- No algorithmic feed (chronological only)

### Analytics Client
- `engagementsLast24h` always returns 0 (not implemented)
- Health history limited to 24 hours
- No export functionality

### Archiver Client
- **AutoEngageEngine uses simulated PoW** (TODO: integrate actual PoW API)
- Key rotation not implemented
- No cloud backup option

### Bridge Client
- **IRC requires WebSocket proxy** (browsers cannot connect directly to IRC servers)
- Matrix token stored unencrypted in localStorage
- No message queue for budget overflow
- Echo TTL (1 hour) may not cover slow propagation

### Debug Dashboard
- **Single-file HTML architecture** (not React components)
- Requires proxy for authenticated RPC
- No persistence of settings
- 123-line proxy.js for node discovery and auth

---

## Future Work

Based on gap analysis, the following improvements are planned:

### High Priority
1. **AutoEngageEngine** - Integrate actual PoW API (remove simulation)
2. **IRC WebSocket Proxy** - Provide reference proxy implementation
3. **Feed Client** - Implement Saved Posts, Profile, Compose pages
4. **Analytics engagementsLast24h** - Wire up actual engagement tracking

### Medium Priority
5. **Key Rotation** - Implement post-kick key rotation for private spaces
6. **Desktop Notifications** - Integrate Notification API in chat-client
7. **Offline Mode** - IndexedDB-based offline support for forum-client
8. **Debug Dashboard** - Modularize into React components

### Documentation Updates
9. **Update Feed Client status** - Mark placeholders as "Planned" in MASTER_FEATURES
10. **Add IRC proxy reference** - Provide deployment guide

---

## Related Features

- [React SDK (swimchain-react)](/docs/features/react-sdk_FEATURE_DOC.md) - Shared hooks and providers
- [WASM Bindings (swimchain-wasm)](/docs/features/wasm-bindings_FEATURE_DOC.md) - Browser cryptography
- [RPC API](/docs/features/rpc-api_FEATURE_DOC.md) - Backend API specification
- [Private Spaces & Encryption](/docs/features/private-spaces_FEATURE_DOC.md) - Encryption implementation
- [Content & Decay Engine](/docs/features/decay-engine_FEATURE_DOC.md) - Decay mechanics
- [Mobile Platform](/docs/features/mobile-platform_FEATURE_DOC.md) - React Native client
- [Desktop Platform](/docs/features/desktop-platform_FEATURE_DOC.md) - Tauri wrapper

---

## Appendix: Client File Structure

```
forum-client/
+-- src/
    +-- main.tsx                 # Entry point
    +-- App.tsx                  # Routing
    +-- components/              # UI components
    |   +-- Header.tsx
    |   +-- Sidebar.tsx
    |   +-- ThreadList.tsx
    |   +-- ReplyTree.tsx
    |   +-- EncryptedContent.tsx
    |   +-- ReportModal.tsx      # Spam attestation UI
    |   +-- InviteModal.tsx      # Private space invites
    |   +-- ContentStatus.tsx    # Emoji reactions
    |   +-- ...
    +-- pages/                   # Route pages
    |   +-- SpaceList.tsx
    |   +-- SpaceView.tsx
    |   +-- ThreadView.tsx
    |   +-- ...
    +-- hooks/                   # React hooks
    |   +-- useRpc.tsx
    |   +-- useActionPow.ts
    |   +-- usePrivateSpaceKeys.ts
    |   +-- useKeyboardNavigation.tsx  # Vim shortcuts
    |   +-- useSpamStatus.ts
    |   +-- useSpamReport.ts
    |   +-- ...
    +-- lib/                     # Utilities
    |   +-- rpc.ts
    |   +-- action-pow.ts
    |   +-- encryption.ts
    |   +-- x25519.ts
    |   +-- dm.ts
    |   +-- cache.ts
    +-- types/                   # TypeScript types

chat-client/
+-- src/
    +-- components/
    |   +-- ServerList.tsx
    |   +-- ChannelSidebar.tsx
    |   +-- ChatArea.tsx
    |   +-- MessageItem.tsx
    |   +-- ThreadPanel.tsx      # Inline thread expansion
    |   +-- ...
    +-- contexts/
    |   +-- TypingContext.tsx    # Typing indicators
    |   +-- PresenceContext.tsx  # Online status
    +-- hooks/
        +-- useMessages.ts
        +-- useOptimisticMessages.ts

search-client/
+-- src/
    +-- hooks/
    |   +-- useSearch.ts
    |   +-- useSearchSuggestions.ts  # Autocomplete
    |   +-- useSearchHistory.ts      # Query history
    +-- lib/
        +-- queryParser.ts       # Advanced query syntax

archiver-client/
+-- src/
    +-- services/                # Business logic
    |   +-- ContentMonitor.ts
    |   +-- AutoEngageEngine.ts
    |   +-- ArchiveStorage.ts
    +-- pages/
    |   +-- Dashboard.tsx
    |   +-- ArchivedContent.tsx
    |   +-- Settings.tsx
    +-- hooks/
        +-- useContentMonitor.ts
        +-- useArchiveStorage.ts

bridge-client/
+-- src/
    +-- services/
    |   +-- BridgeEngine.ts
    |   +-- EchoTracker.ts
    |   +-- RateLimiter.ts
    +-- adapters/
    |   +-- MatrixAdapter.ts
    |   +-- IrcAdapter.ts
    +-- pages/
        +-- Dashboard.tsx
        +-- MatrixConfig.tsx
        +-- IrcConfig.tsx
        +-- ActivityLog.tsx

debug-dashboard/
+-- index.html                   # Single-file application
+-- proxy.js                     # Node.js RPC proxy
```

---

## Appendix: Constants Reference

### PoW Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Post Difficulty (Testnet) | 10 | Leading zero bits |
| Reply Difficulty (Testnet) | 8 | Leading zero bits |
| Engage Difficulty (Testnet) | 6 | Leading zero bits |
| Spam Attestation (Testnet) | 8 | Leading zero bits |
| Post Difficulty (Mainnet) | 20 | Leading zero bits |
| Argon2id Memory (Testnet) | 8 MiB | Browser-friendly |
| Argon2id Memory (Mainnet) | 64 MiB | Production |
| Argon2id Iterations | 1-3 | Based on network |
| Argon2id Parallelism | 2-4 | Based on network |

### Encryption Constants

| Constant | Value | Description |
|----------|-------|-------------|
| PBKDF2 Iterations | 100,000 | Key derivation |
| Salt Length | 16 bytes | Unique per encryption |
| AES-GCM IV | 12 bytes | Unique per encryption |
| NaCl Box Nonce | 24 bytes | X25519 key exchange |
| Space Key | 32 bytes | AES-256 key |

### Decay & Archiver Constants

| Constant | Value | Description |
|----------|-------|-------------|
| HALF_LIFE_SECONDS | 604,800 | 7 days |
| DECAY_FLOOR_SECONDS | 172,800 | 48 hours protection |
| DECAY_THRESHOLD | 0.0625 | 6.25% survival |
| AUTO_ENGAGE_THRESHOLD | 0.10 | 10% for archiver |
| DAILY_POW_BUDGET_SECS | 3,600 | 1 hour per day |
| POOL_REQUIRED_POW_SECS | 60 | Per content pool |

### Bridge Constants

| Constant | Value | Description |
|----------|-------|-------------|
| MAX_BRIDGE_POSTS_PER_HOUR | 10 | Rate limit |
| ECHO_TTL_MS | 3,600,000 | 1 hour |
| MATRIX_POLL_INTERVAL_MS | 5,000 | 5 seconds |
| IRC_POLL_INTERVAL_MS | 1,000 | 1 second |
| CONNECTION_TIMEOUT_MS | 30,000 | 30 seconds |

### UI Constants

| Constant | Value | Description |
|----------|-------|-------------|
| TYPING_TIMEOUT_MS | 3,000 | Typing indicator expiration |
| PRESENCE_HEARTBEAT_MS | 10,000 | Presence update interval |
| PRESENCE_AWAY_THRESHOLD_MS | 300,000 | 5 minutes to 'away' |
| SEARCH_DEBOUNCE_MS | 200 | Suggestion debounce |
| SEARCH_HISTORY_MAX | 20 | Max saved queries |

---

*Document Version: 3.0*
*Last Updated: 2026-01-12*
*Covers: forum-client, chat-client, search-client, feed-client, analytics-client, archiver-client, bridge-client, debug-dashboard*
