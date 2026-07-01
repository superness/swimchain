# Swimchain Master Feature Document

> **Purpose**: Comprehensive feature reference for developers to own, expand, and iterate on quality.
> Each section represents a development area with clear ownership boundaries.

---

## Table of Contents

1. [Identity & Cryptography](#1-identity--cryptography)
2. [Proof-of-Work Systems](#2-proof-of-work-systems)
3. [Block Formation & Consensus](#3-block-formation--consensus)
4. [Content & Decay Engine](#4-content--decay-engine)
5. [Storage Layer](#5-storage-layer)
6. [Network & Transport](#6-network--transport)
7. [Synchronization](#7-synchronization)
8. [Sponsorship & Sybil Resistance](#8-sponsorship--sybil-resistance)
9. [Spam & Reputation](#9-spam--reputation)
10. [Private Spaces & Encryption](#10-private-spaces--encryption)
11. [Engagement & Social](#11-engagement--social)
12. [RPC API](#12-rpc-api)
13. [CLI Interface](#13-cli-interface)
14. [Frontend SDK](#14-frontend-sdk)
15. [React SDK](#15-react-sdk)
16. [WASM Bindings](#16-wasm-bindings)
17. [DHT & Peer Discovery](#17-dht--peer-discovery)
18. [Fork System](#18-fork-system)
19. [Blocklist Protocol](#19-blocklist-protocol)
20. [Device Constraints](#20-device-constraints)
21. [Seeding & Availability](#21-seeding--availability)
22. [API Layer](#22-api-layer)
23. [Client Applications](#23-client-applications)
24. [Mobile Platform](#24-mobile-platform)
25. [Desktop Platform](#25-desktop-platform)

---

## 1. Identity & Cryptography

**Owner Area**: `src/crypto/`, `src/identity/`, `src/types/identity.rs`

### Core Concepts
- Identity IS the keypair (no account recovery, no passwords)
- Ed25519 cryptographic signatures
- Bech32m address encoding (`cs1...`)
- PoW-gated identity creation for Sybil resistance

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Keypair Generation | Complete | `crypto/signature.rs` | Ed25519 keypair creation |
| Address Encoding | Complete | `crypto/address.rs` | Bech32m `cs1...` format |
| Signature Creation | Complete | `crypto/signature.rs` | Sign arbitrary messages |
| Signature Verification | Complete | `crypto/signature.rs` | Verify signed messages |
| Identity PoW | Complete | `crypto/pow.rs` | SHA-256 mining for identity creation |
| Encrypted Key Storage | Complete | `identity/portable.rs` | Argon2id + ChaCha20-Poly1305 |
| Portable Identity Format | Complete | `identity/portable.rs` | Export/import identity files |
| Signature Envelope | Complete | `crypto/envelope.rs` | Timestamped signed messages |

### Data Structures
```rust
KeyPair { public_key, private_key }
PublicKey([u8; 32])
IdentityId([u8; 32])
IdentityAddress(String)  // cs1...
IdentityCreationProof { public_key, timestamp, nonce, pow_hash }
SignatureEnvelope { message, signature, timestamp }
IdentityMetadata { display_name: Option<String> }  // max 31 chars
```

### API Methods
- `generate_keypair()` - Create new Ed25519 keypair
- `sign(message, keypair)` - Sign message
- `verify(message, signature, pubkey)` - Verify signature
- `encode_address(pubkey)` - Convert to cs1... address
- `decode_address(address)` - Parse cs1... address
- `encrypt_private_key(key, password)` - Encrypt for storage
- `decrypt_private_key(encrypted, password)` - Decrypt from storage

### Quality Checklist
- [ ] Key generation uses secure random source
- [ ] Timing-safe signature verification
- [ ] Address checksum validation
- [ ] Encrypted storage uses proper KDF parameters
- [ ] No key material in logs

---

## 2. Proof-of-Work Systems

**Owner Area**: `src/crypto/pow.rs`, `src/crypto/action_pow.rs`, `swimchain-wasm/src/pow.rs`

### Core Concepts
- Two PoW types: Identity (SHA-256) and Action (Argon2id)
- Identity PoW: One-time cost to create identity (anti-Sybil)
- Action PoW: Per-post cost to prevent spam (scales by swimmer level)

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Identity PoW Mining | Complete | `crypto/pow.rs` | SHA-256 leading zeros |
| Identity PoW Verification | Complete | `crypto/pow.rs` | Validate proof meets difficulty |
| Action PoW Mining | Complete | `crypto/action_pow.rs` | Argon2id for posts/replies |
| Action PoW Verification | Complete | `crypto/action_pow.rs` | Validate action proof |
| Difficulty Scaling | Planned | `crypto/action_pow.rs` | Swimmer level adjustments (stub exists) |
| Timestamp Validation | Complete | `crypto/pow.rs` | Anti-stockpile checks |
| WASM Identity Mining | Complete | `swimchain-wasm/pow.rs` | Browser-compatible mining |

### Constants
```rust
// Identity PoW
DEFAULT_IDENTITY_POW_DIFFICULTY = 20  // ~10-30 seconds
POW_MAX_AGE_SECS = 86400              // 24 hours anti-stockpile
POW_PAST_TOLERANCE_SECS = 3600        // 1 hour verification tolerance
POW_FUTURE_TOLERANCE_SECS = 300       // 5 minutes clock drift

// Action PoW (Argon2id)
ARGON2_MEMORY_KB = 65536   // 64MB
ARGON2_ITERATIONS = 3
ARGON2_PARALLELISM = 4
```

### Difficulty by Swimmer Level
| Level | Difficulty | Expected Time |
|-------|------------|---------------|
| Guppy | 20 | ~10s |
| Minnow | 18 | ~2.5s |
| Regular | 16 | ~0.6s |
| Swimmer | 14 | ~0.15s |
| Lifeguard | 12 | ~0.04s |
| Anchor | 10 | ~0.01s |

### Quality Checklist
- [ ] PoW difficulty meets security requirements
- [ ] Timestamp checks prevent stockpiling
- [ ] Memory-hard Argon2id resists GPU attacks
- [ ] WASM mining works in all browsers
- [ ] Progress callbacks for UX

---

## 3. Block Formation & Consensus

**Owner Area**: `src/blocks/`, `src/branch/`

### Core Concepts
- 3-level recursive hierarchy: Root → Space → Content blocks
- PoW aggregates upward through levels
- Parent-anchored threading (replies stay with parent thread)
- ~30 second target block interval

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Root Block Creation | Complete | `blocks/root_block.rs` | Chain coordination layer |
| Space Block Creation | Complete | `blocks/space_block.rs` | Space-level aggregation |
| Content Block Creation | Complete | `blocks/content_block.rs` | Thread-level blocks |
| Merkle Root Computation | Complete | `blocks/merkle.rs` | Transaction commitment |
| Block Validation | Complete | `blocks/validation.rs` | Structural validation |
| Block Leader Election | Complete | `blocks/leader.rs` | PoW-based leader selection |
| Branch Path System | Complete | `blocks/branch.rs` | LEFT/RIGHT child paths |
| Branch Fracturing | Complete | `branch/storage.rs` | Auto-split at 50MB |
| Action Types | Complete | `blocks/action.rs` | POST, REPLY, ENGAGE, etc. |

### Block Hierarchy
```
RootBlock (30s intervals)
├── SpaceBlock[0] (merkle of content blocks)
│   ├── ContentBlock[0] (thread actions)
│   └── ContentBlock[1]
├── SpaceBlock[1]
│   └── ContentBlock[0]
└── SpaceBlock[N]
```

### Action Types
```rust
enum ActionType {
    CreateSpace = 0x00,
    Post = 0x01,
    Reply = 0x02,
    Engage = 0x03,
    Edit = 0x04,
    Invite = 0x05,
    Leave = 0x06,
    Kick = 0x07,
    RevokeInvite = 0x08,
    KeyRotation = 0x09,
    DMRequest = 0x0A,
    AcceptDM = 0x0B,
    DeclineDM = 0x0C,
}
```

### Quality Checklist
- [ ] Block timestamps monotonically increase
- [ ] Merkle roots correctly computed
- [ ] Branch paths maintain thread integrity
- [ ] PoW validates at each level
- [ ] Orphan blocks handled correctly

---

## 4. Content & Decay Engine

**Owner Area**: `src/content/`, `src/types/content.rs`

### Core Concepts
- Organic moderation through engagement-based decay
- Half-life model (default 7 days)
- Engagement resets decay timer
- Content dies naturally without engagement

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Decay Calculation | Complete | `content/lifecycle.rs` | Half-life based survival |
| Engagement Reset | Complete | `content/engagement.rs` | Reset timer on engagement |
| Decay Floor | Complete | `content/lifecycle.rs` | 48-hour protection period |
| Pruning | Complete | `content/lifecycle.rs` | Remove decayed content |
| Engagement Pools | Complete | `content/pool.rs` | Collective PoW pooling |
| Pool Completion | Complete | `content/pool.rs` | Multi-contributor pools |
| Content Chunking | Complete | `content/chunking.rs` | Large file support |
| Media Types | Complete | `types/content.rs` | Image, video detection |
| Content Retrieval | Complete | `content/retrieval.rs` | Parallel fetching |

### Decay Formula
```
survival_probability = 0.5^(effective_decay_time / half_life)

where:
  effective_decay_time = time_since_last_engagement
  half_life = 7 days (default, adaptive based on storage)
  decay_threshold = 6.25% (content pruned below this)
  decay_floor = 48 hours (minimum age before decay applies)
```

### Engagement Pool Lifecycle
```
1. Creator starts pool with target PoW
2. Contributors submit partial PoW
3. Pool completes when target reached
4. Content decay resets on completion
5. Contributors get attribution
```

### Content Types
```rust
enum ContentType {
    Post,
    Reply,
    Quote,
    Media,
}

struct ContentItem {
    content_id: ContentId,
    author_id: IdentityId,
    content_type: ContentType,
    space_id: SpaceId,
    parent_id: Option<ContentId>,
    created_at: u64,
    last_engagement: u64,
    body_inline: Option<String>,  // <= 1KB
    content_hash: Option<ContentHash>,  // > 1KB
    display_name: Option<String>,  // Author display name (max 31 chars)
}
```

### Quality Checklist
- [ ] Decay calculation numerically stable
- [ ] Engagement pools prevent gaming
- [ ] Large content chunking works reliably
- [ ] Media type detection accurate
- [ ] Parallel retrieval handles failures

---

## 5. Storage Layer

**Owner Area**: `src/storage/`

### Core Concepts
- Sled embedded database for chain data
- Content-addressed blob storage
- LRU cache with 5-tier eviction priorities
- Mobile-optimized storage profiles

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Chain Store | Complete | `storage/chain.rs` | Block storage |
| Content Store | Complete | `storage/content.rs` | Content metadata |
| Blob Store | Complete | `storage/blob.rs` | Raw content blobs |
| LRU Cache | Complete | `storage/cache.rs` | Memory caching |
| Eviction Priority | Complete | `storage/cache.rs` | 5-tier eviction |
| Storage Profiles | Complete | `storage/mod.rs` | Mobile profiles |
| Membership Store | Complete | `storage/membership.rs` | Space membership |
| Aggregation Cache | Complete | `storage/aggregation_cache.rs` | Stats caching |

### Eviction Priorities (lowest evicted first)
```rust
enum EvictionPriority {
    OldUnfollowed = 1,  // Evict first
    OldFollowed = 2,
    RecentFollowed = 3,
    Pinned = 4,         // User protected
    OwnContent = 5,     // Never auto-evict
}
```

### Storage Profiles
| Profile | Target Size | Use Case |
|---------|-------------|----------|
| Budget | 1 GB | Low-end mobile |
| Standard | 5 GB | Average mobile |
| Flagship | 10 GB | High-end mobile |
| Desktop | 50 GB | Desktop nodes |

### Quality Checklist
- [ ] Sled database handles crashes
- [ ] Blob storage 2-char prefix distribution
- [ ] LRU correctly tracks access times
- [ ] Eviction respects priorities
- [ ] Storage metrics accurate

---

## 6. Network & Transport

**Owner Area**: `src/network/`, `src/transport/`

### Core Concepts
- 22 message types (SPEC_06 wire protocol)
- TCP transport with future Tor/I2P/QUIC support
- VERSION/VERACK handshake
- Gossip protocol for propagation

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| TCP Transport | Complete | `transport/tcp.rs` | IPv4/IPv6 TCP |
| Message Framing | Complete | `network/serialize.rs` | 46-byte envelope |
| Handshake Protocol | Complete | `network/handshake.rs` | VERSION/VERACK |
| Gossip Protocol | Complete | `network/gossip.rs` | Message propagation |
| Peer Management | Complete | `network/peer.rs` | Connection tracking |
| Message Types | Complete | `network/messages.rs` | 22 message types |
| Network Modes | Complete | `network/mode.rs` | Mainnet/Testnet/Regtest |

### Message Types
```rust
enum MessageType {
    VERSION = 0x00,
    VERACK = 0x01,
    PING = 0x02,
    PONG = 0x03,
    GETBLOCKS = 0x04,
    BLOCKS = 0x05,
    GETDATA = 0x06,
    DATA = 0x07,
    INV = 0x08,
    NOTFOUND = 0x09,
    CONTENT = 0x10,
    GETCONTENTBLOCKS = 0x11,
    CONTENTBLOCKS = 0x12,
    ATTESTATION = 0x13,
    POOL_ANNOUNCE = 0x20,
    POOL_CONTRIBUTION = 0x21,
    POOL_COMPLETE = 0x22,
    DHT_PING = 0x30,
    DHT_FIND_NODE = 0x31,
    DHT_FIND_VALUE = 0x32,
    DHT_STORE = 0x33,
    DHT_RESPONSE = 0x34,
}
```

### Message Envelope (46 bytes)
```
[magic: 4][type: 1][flags: 1][length: 4][checksum: 4][payload: N]
```

### Quality Checklist
- [ ] Handshake validates peer version
- [ ] Message checksums verified
- [ ] Gossip doesn't create loops
- [ ] Connection limits enforced
- [ ] Timeout handling correct

---

## 7. Synchronization

**Owner Area**: `src/sync/`

### Core Concepts
- Header-first synchronization
- Block download with validation
- Fork detection and handling
- Progress tracking for UX

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Chain Syncer | Complete | `sync/chain.rs` | Main sync loop |
| Header Sync | Complete | `sync/header_sync.rs` | Headers first |
| Block Download | Complete | `sync/block_download.rs` | Full block fetch |
| Fork Detection | Complete | `sync/fork.rs` | Detect chain forks |
| Progress Tracking | Complete | `sync/progress.rs` | Sync progress events |
| Branch Subscriptions | Complete | `sync/subscription.rs` | Subscribe to branches |
| Mempool Sync | Complete | `storage/chain.rs` | Bitcoin-style pending actions |

### Sync States
```rust
enum SyncState {
    Idle,
    Connecting,
    DownloadingHeaders,
    DownloadingBlocks,
    Validating,
    Complete,
    Failed(SyncError),
}
```

### Validation Rules
- V-SYNC-01: Chain linkage (prev_hash matches parent block hash)
- V-SYNC-02: PoW meets difficulty target
- V-SYNC-03: Monotonic timestamps (blocks must be newer than parent)
- V-SYNC-04: Merkle roots match (transaction commitment verified)
- V-SYNC-05: Block height within requested range
- V-SYNC-06: Request/response matching (no unsolicited data)

### Quality Checklist
- [ ] Sync resumes after disconnect
- [ ] Fork resolution correct
- [ ] Progress events accurate
- [ ] Request deduplication works
- [ ] Timeout handling correct

---

## 8. Sponsorship & Sybil Resistance

**Owner Area**: `src/sponsorship/`

### Core Concepts
- Sponsorship tree for identity validation
- Genesis identities as trust roots
- Sponsors vouch for sponsored identities
- Consequences propagate through tree

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Genesis Identities | Complete | `sponsorship/genesis.rs` | Trust root management |
| Sponsor Tree | Complete | `sponsorship/tree.rs` | Hierarchical trust |
| Public Offers | Complete | `sponsorship/offers.rs` | Claim-based sponsorship |
| Consequence Propagation | Complete | `sponsorship/penalties.rs` | Bad actor handling |
| Penalty System | Complete | `sponsorship/penalties.rs` | Graduated penalties |

### Penalty Types
```rust
enum PenaltyType {
    RestrictedPosting,    // Reduced posting rate
    LostInviteSlots,      // Can't sponsor others
    AcceleratedDecay,     // 4-hour half-life
    PermanentRevocation,  // Identity banned
}
```

### Sponsor Tree Structure
```
Genesis Identity (hardcoded trust root)
├── Sponsored Identity A
│   ├── Sponsored Identity A1
│   └── Sponsored Identity A2
└── Sponsored Identity B
    └── Sponsored Identity B1
```

### Quality Checklist
- [ ] Genesis identities hardcoded correctly
- [ ] Sponsor tree depth limits enforced
- [ ] Penalty propagation stops appropriately
- [ ] Offer system prevents gaming
- [ ] Recovery mechanisms work

---

## 9. Spam & Reputation

**Owner Area**: `src/spam_attestation/`, `src/spam_heuristics/`, `src/reputation/`

### Core Concepts
- Community-driven spam flagging
- Reputation score affects capabilities
- Heuristics detect automated abuse
- Sybil-resistant attestation aggregation

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Spam Attestation | Complete | `spam_attestation/` | Community flagging |
| Counter-Attestation | Complete | `spam_attestation/` | Flag reversal |
| Reputation Scoring | Complete | `reputation/` | Identity reputation |
| Rate Limiting | Complete | `spam_heuristics/` | Post rate limits |
| Pattern Detection | Complete | `spam_heuristics/` | Automated abuse detection |
| Repetition Detection | Complete | `spam_heuristics/` | Duplicate detection |

### Reputation Thresholds
| Level | Score Range | Effects |
|-------|-------------|---------|
| Trusted | 150+ | Full capabilities |
| Normal | 100-149 | Standard limits |
| Watched | 50-99 | Increased scrutiny |
| Restricted | 25-49 | Limited posting |
| Untrusted | 0-24 | Severe restrictions |

### Spam Detection Heuristics
- Exact duplicate detection
- Fuzzy similarity matching
- Cross-posting limits
- Link density thresholds
- Mention spam detection
- Rate limit enforcement

### Quality Checklist
- [ ] 3-attester threshold enforced
- [ ] Sponsor tree deduplication works
- [ ] Counter-attestation 5-Lifeguard rule
- [ ] Reputation recovery +1/day
- [ ] Heuristics don't false-positive

---

## 10. Private Spaces & Encryption

**Owner Area**: `src/storage/membership.rs`, `forum-client/src/lib/encryption.ts`

### Core Concepts
- Private spaces with encrypted content
- X25519 key exchange for member keys
- Space-level symmetric key (AES-256-GCM)
- DMs are just 2-member private spaces

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Private Space Creation | Complete | `rpc/methods.rs` | Create encrypted space |
| Member Invites | Complete | `rpc/methods.rs` | Invite with key exchange |
| Accept/Decline Invite | Complete | `rpc/methods.rs` | Invite response |
| Leave Space | Complete | `rpc/methods.rs` | Member departure |
| Kick Member | Complete | `rpc/methods.rs` | Admin removal + key rotation |
| DM Requests | Complete | `rpc/methods.rs` | 1:1 message requests |
| Content Encryption | Complete | `lib/encryption.ts` | AES-GCM encryption |
| Key Rotation | Planned | - | Post-kick key update |

### Encryption Flow
```
1. Creator generates space_key (32-byte AES-256)
2. Creator stores encrypted copy for self (X25519 box)
3. On invite: encrypt space_key for invitee's X25519 pubkey
4. Invitee decrypts and stores space_key locally
5. All content encrypted with space_key (AES-256-GCM)
```

### Quality Checklist
- [ ] X25519 key derivation correct
- [ ] AES-GCM nonces never reused
- [ ] Key rotation on member kick
- [ ] Local key storage encrypted
- [ ] No plaintext in transit/storage

---

## 11. Engagement & Social

**Owner Area**: `src/engagement_graph/`, `src/achievement/`, `src/notification/`, `src/space_health/`

### Core Concepts
- Engagement edges form social graph
- Achievements reward contributions
- Notifications keep users informed
- Space health tracks community vitality

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Engagement Graph | Complete | `engagement_graph/` | Directed engagement edges |
| Swimmer Levels | Complete | `types/swimmer.rs` | 6 progression levels |
| Achievement System | Complete | `achievement/` | 12 achievement types |
| Notification Service | Complete | `notification/` | 6 notification types |
| Space Health | Complete | `space_health/` | Community vitality score |
| Attribution | Complete | `attribution/` | "Kept alive by" display |

### Swimmer Levels
```rust
enum SwimmerLevel {
    Guppy,      // New identity
    Minnow,     // 1 week + 5 posts
    Regular,    // 1 month + 25 posts
    Swimmer,    // 3 months + 100 posts
    Lifeguard,  // 6 months + 500 posts + hosting
    Anchor,     // 1 year + 1000 posts + significant hosting
}
```

### Achievement Types
- First Stroke (first post created)
- First Serve (first content served to peer)
- Week Swimmer (7-day hosting streak)
- Month Swimmer (30-day hosting streak)
- Centurion (100-day hosting streak)
- Bandwidth Baron (100GB served)
- Terabyte Club (1TB served)
- Always On (30 days at 95%+ uptime) [placeholder]
- Anchor Drop [DEPRECATED - level system removed]
- Lane Opener (created first space)
- Keeper of the Flame (100+ posts kept alive)
- Efficient Swimmer (contribution/cost ratio >= 2.0) [provisional]

### Quality Checklist
- [ ] Engagement edges update atomically
- [ ] Level upgrades trigger correctly
- [ ] Achievements non-transferable
- [ ] Notifications respect throttling
- [ ] Space health formula balanced

---

## 12. RPC API

**Owner Area**: `src/rpc/`

### Core Concepts
- JSON-RPC 2.0 protocol
- HTTP transport (WebSocket planned)
- Authenticated requests (signature + PoW)
- Polling-based updates (real-time events planned)

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| JSON-RPC Server | Complete | `rpc/server.rs` | Request handling |
| Method Dispatch | Complete | `rpc/methods.rs` | 60+ RPC methods |
| Authentication | Complete | `rpc/auth.rs` | Signature verification |
| PoW Validation | Complete | `rpc/methods.rs` | Action PoW checking (integrated) |
| Event Broadcasting | Planned | - | Real-time updates (not yet implemented) |

### RPC Method Categories

**Node Operations**
- `get_info` - Node information
- `get_peers` - Connected peers
- `get_sync_status` - Sync progress
- `stop` - Shutdown node

**Content Operations**
- `submit_post` - Create new post
- `submit_reply` - Reply to content
- `submit_engagement` - React to content
- `get_content` - Fetch content by ID
- `list_space_content` - Content in space
- `search` - Search content

**Space Operations**
- `list_spaces` - All known spaces
- `create_space` - Create new space
- `create_private_space` - Create encrypted space
- `get_space_members` - Space membership

**Identity Operations**
- `get_identity_info` - Identity details
- `get_identity_level` - Swimmer level
- `register_genesis_identity` - Genesis registration

**Private Space Operations**
- `invite_to_space` - Send invite
- `accept_invite` - Accept invite
- `leave_space` - Leave space
- `kick_member` - Remove member
- `request_dm` - Start DM
- `accept_dm` / `decline_dm` - DM response

### Quality Checklist
- [ ] All methods documented
- [ ] Error codes consistent
- [ ] Authentication enforced
- [ ] Rate limiting applied
- [ ] Events properly broadcast

---

## 13. CLI Interface

**Owner Area**: `src/cli/`, `src/bin/`

### Core Concepts
- Clap-based argument parsing
- Subcommand structure
- Progress indicators
- Multiple output formats

### Commands

| Command | Status | Description |
|---------|--------|-------------|
| `identity` | Complete | Identity management |
| `space` | Complete | Space operations |
| `post` | Complete | Post creation/viewing |
| `sync` | Complete | Synchronization control |
| `config` | Complete | Configuration |
| `node` | Complete | Node control |
| `block` | Complete | Block inspection |
| `branch` | Complete | Branch management |
| `fork` | Complete | Fork operations |
| `sponsor` | Complete | Sponsorship |
| `search` | Complete | Full-text content search |
| `completions` | Complete | Shell completion generation |

### Search Command Features
- Full-text search via Tantivy
- Space ID filtering (`--space`)
- Minimum heat filtering (`--min-heat`)
- Sort by heat, newest, or oldest
- Result count limiting (`--limit`)
- JSON output mode (`--json`)

### Shell Completions
- Bash completions
- Zsh completions
- Fish completions
- PowerShell completions
- Elvish completions

### Output Formats
- Text (human-readable)
- JSON (machine-readable)
- Table (structured display)

### Quality Checklist
- [ ] All commands have --help
- [ ] Shell completions work
- [ ] Progress bars accurate
- [ ] Error messages helpful
- [ ] JSON output parseable

---

## 14. Frontend SDK

**Owner Area**: `swimchain-frontend/`

### Core Concepts
- Shared React components across clients
- Custom hooks for common patterns
- Provider components for context
- WASM integration utilities

### Exports

| Export | Status | Description |
|--------|--------|-------------|
| `./components` | Complete | React components |
| `./hooks` | Complete | React hooks |
| `./providers` | Complete | Context providers |
| `./lib` | Complete | Utility functions |

### Components
- `WaveLoader` - Loading animation
- `PageTransition` - Page transitions
- `PowProgress` - PoW mining progress
- `AddressDisplay` - Address formatting
- `IdentityCard` - Identity display

### Hooks
- `useKeypair` - Keypair management
- `usePow` - PoW mining state
- `useStoredIdentity` - Identity persistence
- `useStoredKeypair` - Keypair persistence

### Providers
- `SwimchainProvider` - WASM initialization
- `IdentityProvider` - Identity context

### Quality Checklist
- [ ] All components typed
- [ ] Hooks handle edge cases
- [ ] Providers memoize values
- [ ] CSS modules scoped
- [ ] Tree-shakeable exports

---

## 15. React SDK

**Owner Area**: `swimchain-react/`

### Core Concepts
- Full-featured React hooks for Swimchain
- RPC client with auto-reconnect
- Action PoW (Argon2id) integration
- Content encryption utilities
- X25519 key exchange for private spaces

### Providers

| Provider | Status | Description |
|----------|--------|-------------|
| `SwimchainProvider` | Complete | WASM initialization and context |
| `RpcProvider` | Complete | RPC connection management |

### Identity Hooks

| Hook | Status | Description |
|------|--------|-------------|
| `useKeypair` | Complete | Keypair generation and management |
| `useStoredIdentity` | Complete | Persistent identity storage |
| `useStoredKeypair` | Complete | Persistent keypair storage |
| `useAddressValidation` | Complete | Address format validation |
| `useEncodeAddress` | Complete | Public key to address conversion |
| `useDecodeAddress` | Complete | Address to public key conversion |
| `useVerifySignature` | Complete | Signature verification |

### Decay Hooks

| Hook | Status | Description |
|------|--------|-------------|
| `useDecay` | Complete | Real-time decay calculation |
| `useDecayOnce` | Complete | One-time decay snapshot |
| `useIsProtected` | Complete | Check if in decay floor period |
| `useIsDecayed` | Complete | Check if below threshold |

### PoW Hooks

| Hook | Status | Description |
|------|--------|-------------|
| `usePow` | Complete | Async PoW mining with progress |
| `usePowSync` | Complete | Synchronous PoW mining |
| `useVerifyPow` | Complete | PoW verification |
| `useMiningEstimate` | Complete | Time estimate calculation |

### RPC Hooks

| Hook | Status | Description |
|------|--------|-------------|
| `useRpc` | Complete | RPC client access |
| `useSyncStatus` | Complete | Chain sync progress |
| `usePeers` | Complete | Connected peer info |

### Content Hooks

| Hook | Status | Description |
|------|--------|-------------|
| `useSpaces` | Complete | List all spaces |
| `useSpaceThreads` | Complete | Threads in a space |
| `useThread` | Complete | Single thread with replies |
| `useReplies` | Complete | Replies to content |
| `useReactions` | Complete | Engagement reactions |
| `useUserPosts` | Complete | Posts by identity |

### Encryption Utilities (`lib/encryption`)

| Function | Status | Description |
|----------|--------|-------------|
| `encryptContent` | Complete | AES-GCM encryption |
| `decryptContent` | Complete | AES-GCM decryption |
| `encryptPost` | Complete | Encrypt full post |
| `decryptPost` | Complete | Decrypt full post |
| `encryptMedia` | Complete | Media file encryption |
| `decryptMedia` | Complete | Media file decryption |
| `generatePassphrase` | Complete | Secure passphrase generation |

### X25519 Key Exchange (`lib/x25519`)

| Function | Status | Description |
|----------|--------|-------------|
| `ed25519PrivateToX25519` | Complete | Ed25519 to X25519 private key |
| `ed25519PublicToX25519` | Complete | Ed25519 to X25519 public key |
| `deriveX25519Keys` | Complete | Full key derivation |
| `x25519SharedSecret` | Complete | Diffie-Hellman shared secret |
| `x25519Box` | Complete | Encrypt for recipient |
| `x25519Unbox` | Complete | Decrypt from sender |
| `generateSpaceKey` | Complete | Random space key |
| `encryptSpaceKeyForRecipient` | Complete | Key wrapping for invite |
| `decryptSpaceKey` | Complete | Key unwrapping |

### DM Utilities (`lib/dm`)

| Function | Status | Description |
|----------|--------|-------------|
| `getDMSpaceId` | Complete | Deterministic DM space ID |
| `isDMSpace` | Complete | Check if space is DM |
| `getDMSpaceName` | Complete | Display name for DM |
| `canInitiateDM` | Complete | Check DM permissions |
| `getDMStatusText` | Complete | Human-readable status |

### Profile Utilities (`lib/profile`)

| Function | Status | Description |
|----------|--------|-------------|
| `getProfileSpaceId` | Complete | Profile space ID |
| `isProfileSpace` | Complete | Check if profile space |
| `encodeProfileInfo` | Complete | Serialize profile data |
| `decodeProfileInfo` | Complete | Deserialize profile data |
| `getAvatarColor` | Complete | Identity-based color |
| `getAvatarInitials` | Complete | Initials from name |

### Caching Utilities (`lib/cache`)

| Function | Status | Description |
|----------|--------|-------------|
| `getMediaFromCache` | Complete | Retrieve cached media |
| `setMediaInCache` | Complete | Store media in cache |
| `getContentFromCache` | Complete | Retrieve cached content |
| `setContentInCache` | Complete | Store content in cache |
| `getCacheStats` | Complete | Cache usage statistics |
| `clearAllCaches` | Complete | Full cache clear |

### Action PoW (`lib/action-pow`)

| Function | Status | Description |
|----------|--------|-------------|
| `computePow` | Complete | Argon2id PoW computation |
| `createPostChallenge` | Complete | Challenge for new post |
| `createReplyChallenge` | Complete | Challenge for reply |
| `createEngageChallenge` | Complete | Challenge for engagement |
| `createSpaceChallenge` | Complete | Challenge for space creation |
| `getDifficulty` | Complete | Get difficulty for level |
| `estimateMiningTime` | Complete | Time estimate |

### Quality Checklist
- [ ] All hooks properly typed
- [ ] Error boundaries handle failures
- [ ] Caching prevents redundant requests
- [ ] X25519 keys correctly derived
- [ ] Memory leaks prevented

---

## 16. WASM Bindings

**Owner Area**: `swimchain-wasm/`

### Core Concepts
- Browser-compatible cryptography
- Identity PoW mining (SHA-256)
- Address encoding/decoding
- Decay calculations

### Exports

| Function | Status | Description |
|----------|--------|-------------|
| `WasmKeypair` | Complete | Keypair operations |
| `mine_identity_pow` | Complete | PoW mining |
| `verify_identity_pow` | Complete | PoW verification |
| `encode_address` | Complete | Bech32m encoding |
| `decode_address` | Complete | Bech32m decoding |
| `sha256` | Complete | Hashing |
| `content_id` | Complete | Content ID generation |
| `leading_zeros` | Complete | PoW difficulty check |
| `calculate_decay` | Complete | Decay state |

### Limitations
- No Argon2id (memory constraints)
- No private key encryption (use JS instead)

### Quality Checklist
- [ ] WASM size optimized
- [ ] Panic hook installed
- [ ] Memory management correct
- [ ] Works in all browsers
- [ ] No blocking main thread

---

## 17. DHT & Peer Discovery

**Owner Area**: `src/dht/`, `src/discovery/`

### Core Concepts
- Kademlia-based Distributed Hash Table
- Content provider discovery
- Peer discovery by node ID
- Six-layer discovery stack
- PoW-gated node IDs for Sybil resistance

### DHT Features (`src/dht/`)

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Routing Table | Complete | `routing_table.rs` | K-bucket peer storage |
| Provider Store | Complete | `provider_store.rs` | Content availability records |
| Lookup Coordinator | Complete | `lookup.rs` | Iterative lookups |
| DHT Manager | Complete | `manager.rs` | Main coordinator |
| Node ID Derivation | Complete | `node_id.rs` | PoW-gated IDs |

### DHT Protocol Messages
```rust
DHT_PING = 0x80       // Liveness check
DHT_PONG = 0x81       // Ping response
DHT_FIND_NODE = 0x82  // Find k-closest nodes
DHT_NODES = 0x83      // Find node response (list of closest nodes)
DHT_FIND_VALUE = 0x84 // Find content providers
DHT_PROVIDERS = 0x85  // Find value response with providers
DHT_STORE = 0x86      // Announce availability
DHT_STORE_ACK = 0x87  // Store acknowledgment
```

### DHT Parameters
```rust
K = 8      // Nodes per bucket
ALPHA = 3  // Parallel lookups
```

### Discovery Stack (`src/discovery/`)

| Layer | Status | Description |
|-------|--------|-------------|
| Layer 0: Cached | Complete | Persistent peer cache (first checked) |
| Layer 1: mDNS | Planned | Local network discovery |
| Layer 2: Social | Complete | QR codes, links (external) |
| Layer 3: Seeds | Complete | Introduction points |
| Layer 4: DHT | Complete | Distributed lookup |
| Layer 5: PEX | Complete | Peer exchange (GETADDR/ADDR) |

### Discovery Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| PeerStore | Complete | `peer_store.rs` | Sled-backed peer cache |
| PeerEntry | Complete | `peer_entry.rs` | Scored peer data (95 bytes) |
| PeerKey | Complete | `peer_key.rs` | Unique peer ID (67 bytes) |
| AddrHandler | Complete | `addr_handler.rs` | GETADDR/ADDR processing |
| PeerExchange | Complete | `peer_exchange.rs` | Peer sharing logic |
| PeerBranchTracker | Complete | `peer_branches.rs` | Branch coverage tracking |
| SeedList | Complete | `seed_list.rs` | Bootstrap seed nodes |
| DiscoveryManager | Complete | `manager.rs` | Unified coordinator |

### Quality Checklist
- [ ] K-buckets maintain diversity
- [ ] Provider records expire correctly
- [ ] Sybil-resistant node IDs
- [ ] PEX rate limiting enforced
- [ ] Seed fallback works

---

## 18. Fork System

**Owner Area**: `src/fork/`

### Core Concepts
- Community escape from captured chains
- Identity preservation across forks
- Selective content migration
- Bad actor exclusion lists

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| Fork Config | Complete | `genesis.rs` | Fork configuration builder |
| Fork Genesis | Complete | `genesis.rs` | Fork genesis block creation |
| Fork Registry | Complete | `registry.rs` | Track known forks |
| Fork Store | Complete | `storage.rs` | Persistent fork data |
| Content Selector | Complete | `genesis.rs` | Content migration modes |
| Exclusion Lists | Complete | `genesis.rs` | Bad actor filtering |

### Content Migration Modes
```rust
enum ContentSelector {
    All,              // Migrate all content
    None,             // Fresh start
    Selective {       // Filtered migration
        space_filter: Option<Vec<String>>,
        time_filter: Option<TimeRange>,
        identity_filter: Option<Vec<IdentityId>>,
    },
}
```

### Fork Configuration
```rust
let config = ForkConfig::builder()
    .name("community-v2")
    .description("Fork away from hostile takeover")
    .exclude_identity(attacker_pubkey)
    .content_mode(ContentSelector::Selective { ... })
    .build();
```

### Quality Checklist
- [ ] Fork IDs deterministically derived
- [ ] Identity keys work across forks
- [ ] Exclusion lists properly applied
- [ ] Content migration complete
- [ ] Genesis validation correct

---

## 19. Blocklist Protocol

**Owner Area**: `src/blocklist/`

### Core Concepts
- Distributed blocklist for illegal content (CSAM, terrorism)
- 3-attester threshold for addition
- 5-Anchor threshold for removal
- Merkle-based eventual consistency
- Gossip propagation

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| BlocklistEntry | Complete | `types.rs` | Hash-based content identification |
| BlocklistStore | Complete | `storage.rs` | Sled persistence |
| BlocklistGossip | Complete | `gossip.rs` | Message propagation |
| MerkleSync | Complete | `merkle.rs` | Eventual consistency |
| BlocklistUpdate | Complete | `types.rs` | Add/remove operations |

### Protocol Messages
```rust
MSG_BLOCKLIST_UPDATE = 0x55  // Add/remove hash
MSG_BLOCKLIST_SYNC = 0x58    // Merkle root exchange
MSG_BLOCKLIST_REQUEST = 0x59 // Request entries
```

### Thresholds
```rust
ILLEGAL_CONTENT_ATTESTATION_THRESHOLD = 3  // Attesters to add
BLOCKLIST_REMOVAL_THRESHOLD = 5            // Anchors to remove
MIN_BLOCKLIST_CONFIRMATIONS = 3            // Independent trees
BLOCKLIST_SYNC_INTERVAL_SECS = 3600        // 1 hour sync
```

### Blocklist Entry Types
```rust
enum BlocklistReason {
    Csam,           // Child abuse material
    Terrorism,      // Terrorism content
    Other(String),  // Other illegal content
}
```

### Quality Checklist
- [ ] 3-attester threshold enforced
- [ ] Independent sponsor tree verification
- [ ] Merkle sync achieves consistency
- [ ] Content rejection on storage
- [ ] Content rejection on retrieval

---

## 20. Device Constraints

**Owner Area**: `src/device_constraints/`

### Core Concepts
- Mobile-aware resource management
- Battery monitoring and thermal awareness
- Daily bandwidth caps
- Efficiency tracking for achievements

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| BatteryMonitor | Complete | `battery.rs` | Battery state tracking |
| BandwidthLimiter | Complete | `bandwidth.rs` | Daily bandwidth caps |
| EfficiencyTracker | Complete | `efficiency.rs` | Resource efficiency |
| DeviceSettingsStore | Complete | `storage.rs` | Persistent settings |
| DeviceConstraintManager | Complete | `manager.rs` | Unified coordinator |

### Contribution Modes
```rust
enum ContributionMode {
    Swimmer = 0,          // Foreground only, minimal background
    ActiveSwimmer = 1,    // Background on WiFi, daily cap
    DedicatedSwimmer = 2, // Background always, high cap
    AnchorMode = 3,       // Always-on, no cap
}
```

### Thermal States
```rust
enum ThermalState {
    Normal = 0,   // OK to contribute
    Fair = 1,     // Slightly elevated, OK to contribute
    Serious = 2,  // Pause if thermal_pause enabled
    Critical = 3, // Always pause
}
```

### Pause Reasons
Content contribution is paused when:
- Battery level below threshold (default 20%)
- Thermal state is Serious (with thermal_pause enabled) or Critical
- WiFi-only mode enabled and on cellular data
- Daily bandwidth cap reached
- Network disconnected

### Quality Checklist
- [ ] Battery monitoring accurate
- [ ] Bandwidth resets at UTC midnight
- [ ] Thermal throttling responsive
- [ ] Efficiency calculations correct
- [ ] Settings persist correctly

---

## 21. Seeding & Availability

**Owner Area**: `src/seeding/`

### Core Concepts
- Voluntary content sharing
- Bandwidth rate limiting
- Availability announcements via gossip
- Statistics tracking for achievements

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| SeedingConfig | Complete | `config.rs` | Seeding configuration |
| SeedingManager | Complete | `manager.rs` | Main coordinator |
| TokenBucketLimiter | Complete | `rate_limiter.rs` | Bandwidth throttling |
| SeedingStatistics | Complete | `statistics.rs` | Metrics tracking |
| AvailabilityHandler | Complete | `availability.rs` | Gossip announcements |
| PeerAvailabilityMap | Complete | `availability.rs` | Track peer content |

### Seeding Modes
```rust
enum SeedingMode {
    Disabled,       // No seeding
    OwnContent,     // Seed only own content
    ViewedContent,  // Seed viewed content (default)
    FullSpace,      // Seed all content in specified spaces
}
```

### Statistics Tracking
```rust
struct SeedingStatistics {
    bytes_served: u64,
    bytes_received: u64,
    requests_served: u64,
    requests_denied: u64,
    per_space: HashMap<SpaceId, SpaceStats>,
}
```

### Mobile Configuration
```rust
struct MobileConfig {
    wifi_only: bool,
    daily_cellular_mb: u32,
    battery_threshold: u8,
}
```

### Quality Checklist
- [ ] Rate limiter prevents overload
- [ ] Availability announcements efficient
- [ ] Statistics accurate
- [ ] Mobile constraints respected
- [ ] Re-announcement timer correct

---

## 22. API Layer

**Owner Area**: `src/api/`

### Core Concepts
- Event-driven subscriptions via broadcast channels
- Request/response queries for content
- Command handlers with PoW
- Type-safe bindings for GUI/CLI

### Features

| Feature | Status | Files | Description |
|---------|--------|-------|-------------|
| ApiClient | Complete | `client.rs` | Main API interface |
| QueryHandler | Complete | `queries.rs` | Read operations |
| CommandHandler | Complete | `commands.rs` | Write operations |
| SubscriptionManager | Complete | `subscription.rs` | Event broadcasting |
| ApiConfig | Complete | `config.rs` | Configuration |

### Event Types
```rust
enum ApiEvent {
    Content(ContentEvent),
    Network(NetworkEvent),
    Pool(PoolEvent),
    Pow(PowEvent),
}

enum ContentEvent {
    NewPost { content_id, space_id, author_id },
    NewReply { content_id, parent_id },
    ContentDecayed { content_id },
}

enum NetworkEvent {
    PeerConnected { peer_count },
    PeerDisconnected { peer_count },
    SyncProgress { height, target },
}

enum PoolEvent {
    PoolCreated { pool_id, content_id },
    PoolCompleted { pool_id },
    PoolExpired { pool_id },
}
```

### API Client Builder
```rust
let client = ApiClient::builder()
    .storage(storage)
    .pool_manager(pool_manager)
    .use_test_pow()  // For testing
    .build()?;

// Subscribe to events
let mut rx = client.subscribe();

// Get sync status
let status = client.get_sync_status();

// Create content
let content = client.create_post(space_id, "Hello!", None)?;
```

### Quality Checklist
- [ ] Event delivery reliable
- [ ] Query timeouts enforced
- [ ] PoW validation correct
- [ ] Thread-safe access
- [ ] Memory bounded

---

## 23. Client Applications

**Owner Area**: `*-client/` folders

### Forum Client
**Path**: `forum-client/`
**Purpose**: Reddit/forum-style threaded discussion interface

| Feature | Status | Description |
|---------|--------|-------------|
| Thread Creation | Complete | Rich text posts with Markdown |
| Thread Viewing | Complete | Nested threaded replies |
| Space Navigation | Complete | Browse and follow spaces |
| Media Upload | Complete | Image attachments with preview |
| Action PoW | Complete | Argon2id mining with progress |
| Content Encryption | Complete | Private space encryption |
| Private Spaces | Complete | Create/join encrypted spaces |
| DM System | Complete | Direct messaging |
| User Profiles | Complete | Profile pages with posts |
| User Blocking | Complete | Block/unblock users |
| Blocklist Manager | Complete | Manage blocked content |
| Search | Complete | Full-text search |
| Settings | Complete | Preferences and configuration |
| Debug Panel | Complete | Developer tools |
| Node Status Bar | Complete | Connection/sync status |

### Chat Client
**Path**: `chat-client/`
**Purpose**: Discord-like real-time messaging interface

| Feature | Status | Description |
|---------|--------|-------------|
| Channel Messaging | Complete | Real-time chat messages |
| Server Navigation | Complete | Multi-server support |
| Server List | Complete | Server sidebar |
| Channel Sidebar | Complete | Channel navigation |
| Chat Area | Complete | Message display |
| Message Input | Complete | Compose with PoW |
| Identity Display | Complete | User cards |
| Action PoW | Complete | Argon2id mining |

### Search Client
**Path**: `search-client/`
**Purpose**: Dedicated content search interface

| Feature | Status | Description |
|---------|--------|-------------|
| Text Search | Complete | Full-text query |
| Space Search | Complete | Find spaces |
| Result Display | Complete | Highlighted results |
| Wave Loader | Complete | Loading animation |

### Feed Client
**Path**: `feed-client/`
**Purpose**: Social feed aggregation (Twitter-like)

| Feature | Status | Description |
|---------|--------|-------------|
| Feed Display | Complete | Content stream |
| Follow System | Complete | Space following |
| Engagement | Complete | Reactions |

### Analytics Client
**Path**: `analytics-client/`
**Purpose**: Network health and statistics dashboard

| Feature | Status | Description |
|---------|--------|-------------|
| Network Stats | Complete | Health metrics |
| Space Stats | Complete | Activity tracking |
| RPC Integration | Complete | Real-time data |

### Archiver Client
**Path**: `archiver-client/`
**Purpose**: Content preservation and decay prevention

| Feature | Status | Description |
|---------|--------|-------------|
| Content Monitoring | Complete | Track at-risk posts |
| Survival Prediction | Complete | Decay probability |
| Auto-Engage Engine | Complete | Prioritized engagement |
| Local Archive | Complete | IndexedDB storage |
| Budget Management | Complete | Daily PoW budget |
| Dashboard | Complete | Archive overview |

### Bridge Client
**Path**: `bridge-client/`
**Purpose**: External platform bridging (Matrix, IRC)

| Feature | Status | Description |
|---------|--------|-------------|
| Matrix Integration | Complete | Matrix homeserver bridge |
| IRC Integration | Complete | IRC channel bridge |
| Echo Prevention | Complete | Loop prevention |
| Rate Limiting | Complete | Sliding window limits |
| Activity Log | Complete | Operation tracking |
| Dashboard | Complete | Bridge status |

### Debug Dashboard
**Path**: `debug-dashboard/`
**Purpose**: Network visualization and debugging

| Feature | Status | Description |
|---------|--------|-------------|
| Network Visualizer | Complete | Node/connection graph |
| Node List | Complete | All nodes with status |
| Message Log | Complete | Real-time message log |
| Content Debug | Complete | Content inspection |
| Peer Connections | Complete | Connection visualization |

---

## 24. Mobile Platform

**Owner Area**: `mobile-client/`

### Core Concepts
- React Native for iOS/Android
- Device-aware resource management
- Battery and bandwidth optimization
- Native gestures and animations

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Navigation | Complete | Tab-based UI |
| Async Storage | Complete | Local persistence |
| Network Awareness | Complete | Connectivity detection |
| Haptic Feedback | Complete | Touch response |
| Gesture Handling | Complete | Swipe/pinch |
| Safe Area | Complete | Notch handling |

### Device Constraints
- Battery monitoring
- WiFi-only mode
- Cellular data limits
- Thermal awareness
- Storage profiles

### Quality Checklist
- [ ] 60fps animations
- [ ] Battery efficient
- [ ] Works offline
- [ ] Accessibility support
- [ ] Both platforms tested

---

## 25. Desktop Platform

**Owner Area**: `desktop-app/`

### Core Concepts
- Tauri (Rust + React)
- Native system integration
- Full node capability
- System tray presence

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Tauri Wrapper | Complete | Native shell |
| System Tray | Partial | Background presence |
| Node Integration | Partial | Embedded node |
| Auto-updates | Planned | Self-updating |

### Quality Checklist
- [ ] Cross-platform build
- [ ] Installer packages
- [ ] Code signing
- [ ] Crash reporting
- [ ] Memory efficient

---

## Development Guidelines

### Adding New Features

1. **Identify Owner Area**: Determine which section owns the feature
2. **Update This Document**: Add feature to appropriate table
3. **Implement**: Follow existing patterns in that area
4. **Test**: Add unit and integration tests
5. **Document**: Update inline docs and this document
6. **Quality Check**: Run through area's quality checklist

### Quality Standards

- All public APIs documented
- Error handling comprehensive
- Tests cover edge cases
- Performance profiled
- Security reviewed

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-11 | Initial comprehensive document |
| 1.1 | 2026-01-11 | Added: React SDK (§15), DHT & Peer Discovery (§17), Fork System (§18), Blocklist Protocol (§19), Device Constraints (§20), Seeding & Availability (§21), API Layer (§22). Expanded Client Applications (§23) with Archiver Client, Bridge Client, Debug Dashboard. Added CLI search and completions commands. |

---

*This document is the source of truth for Swimchain features. Keep it updated as the project evolves.*
