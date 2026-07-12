# Protocol Specification: Network & Sync System

## Status: DRAFT

## Version: 0.2.3

## 1. Overview

### 1.1 Purpose

The Network & Sync System defines how Swimchain nodes discover each other, propagate content, and maintain synchronized views of fork state—all without central infrastructure. This is the connective tissue that makes Swimchain a functioning network rather than isolated databases.

**Two-Layer Architecture:** Swimchain uses a hybrid model (see VISION.md):

| Layer | Model | What It Syncs | Spec Reference |
|-------|-------|---------------|----------------|
| **Authoritative** | Bitcoin-like | Post metadata, PoW proofs, signatures, content hashes | This spec |
| **Content** | BitTorrent-like | Actual content blobs (images, large text) | SPEC_07 |

This specification focuses on the **authoritative layer** (chain sync) and coordinates with SPEC_07 for content distribution.

This system provides:
- **Node Discovery**: How nodes find peers participating in specific forks
- **Gossip Protocol**: How post records and blocks propagate through the network
- **Chain Sync**: How new nodes bootstrap their authoritative chain state
- **Continuous Sync**: How nodes stay current as the network evolves
- **Wire Protocol**: Message formats and transport layer
- **Content Layer Integration**: Coordination with SPEC_07 for blob retrieval

### 1.2 Design Principles

The following principles, derived from the thesis documents, guide this specification:

1. **Zero Central Infrastructure**: No servers, no databases, no DNS. Users ARE the infrastructure. Like Bitcoin—if you can't walk away and have it keep working, it's not decentralized. (VISION.md)

2. **Every Client Is a Node**: Full participation by default. No distinction between "users" and "infrastructure." The network exists because participants exist. (VISION.md, THESIS_01)

3. **No Mega-Nodes**: Bootstrap must not depend on dominant infrastructure providers. Mastodon's mega-instance pattern is explicitly rejected. (VISION.md)

4. **Decay Bounds Chain Size**: The decay mechanism keeps storage bounded, making full-node sync practical on consumer hardware and mobile devices. (VISION.md, THESIS_05)

5. **Fork-Aware Networking**: The network is many forks, not one chain. Discovery, sync, and gossip must work within forks and support fork migration. (VISION.md, THESIS_03)

6. **Technical Barriers as Commitment**: Bandwidth and storage requirements filter for committed participants. This is a feature, not a bug. (THESIS_01)

7. **Active Users Assumed**: Protocol can require periodic online presence and active participation. No passive consumption mode. (VISION.md)

8. **Resilience Through Distribution**: Any subset of nodes should be able to form a functioning network. No quorum requirements that could enable capture. (VISION.md)

9. **State-Level Threat Awareness**: Consider traffic analysis resistance, IP obfuscation options, and censorship circumvention. (VISION.md)

10. **Transparent Physics**: Sync and propagation rules are deterministic and auditable. No opaque prioritization. (VISION.md)

### 1.3 Scope

**In scope:**
- Node discovery mechanisms (bootstrap, DHT, peer exchange)
- Gossip protocol for content and block propagation
- Initial sync protocol for new nodes
- Continuous sync for staying current
- Message formats and wire protocol
- Bandwidth and storage requirements
- Transport layer options (TCP, Tor, I2P)
- Fork-specific peer management

**Out of scope:**
- Client UI for network status (implementation detail)
- Specific bandwidth optimization algorithms (implementation choice)
- CDN or caching infrastructure (violates zero infrastructure)
- Rate limiting specifics (client policy)
- Mobile background sync scheduling (OS-specific)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

| ID | Requirement | Source |
|----|-------------|--------|
| NET-H01 | Network MUST function with zero central infrastructure | VISION.md |
| NET-H02 | Every client MUST operate as a full node (store chain, validate, propagate) | VISION.md, THESIS_01 |
| NET-H03 | Network MUST continue functioning if any single entity disappears | VISION.md |
| NET-H04 | Bootstrap MUST NOT depend on a fixed list of DNS names or IP addresses that can be blocked | VISION.md |
| NET-H05 | Each fork MUST have independent peer discovery | SPEC_05 |
| NET-H06 | Content propagation MUST respect decay (no propagating decayed content) | SPEC_02 |
| NET-H07 | All propagated content MUST have valid signatures | SPEC_01 |
| NET-H08 | Protocol MUST NOT require always-on connectivity | THESIS_01 |
| NET-H09 | Nodes MUST be able to verify chain state independently | VISION.md |
| NET-H10 | No entity MUST be able to prevent content propagation through protocol-level censorship | VISION.md |

### 2.2 Soft Constraints (SHOULD)

| ID | Requirement | Source |
|----|-------------|--------|
| NET-S01 | Mobile devices SHOULD be capable of full participation with bounded chain size | VISION.md Thesis 5 |
| NET-S02 | Initial sync time SHOULD be reasonable for new users (minutes, not hours) | VISION.md risks |
| NET-S03 | Bootstrap SHOULD work organically without manipulation | THESIS_05 |
| NET-S04 | Bandwidth requirements SHOULD be compatible with consumer internet (~5 Mbps) | THESIS_01 |
| NET-S05 | Background sync SHOULD keep mobile nodes current | VISION.md Thesis 5 |
| NET-S06 | Network discovery SHOULD work across forks (discover siblings) | VISION.md |
| NET-S07 | Protocol SHOULD support Tor/I2P for traffic analysis resistance | VISION.md threat model |
| NET-S08 | Nodes SHOULD maintain diverse peer connections for eclipse attack resistance | Security requirement |
| NET-S09 | Sync protocol SHOULD prioritize recent content over historical | Usability |
| NET-S10 | Peer scoring SHOULD deprioritize unreliable or malicious peers | Security requirement |

### 2.3 Anti-Patterns (MUST NOT)

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| NET-A01 | MUST NOT rely on DNS-style central registries for discovery | VISION.md |
| NET-A02 | MUST NOT have a "mastodon.social" equivalent mega-node | VISION.md |
| NET-A03 | MUST NOT require ISP or DNS cooperation for basic operation | VISION.md |
| NET-A04 | MUST NOT create identifiable traffic patterns enabling censorship | VISION.md threat model |
| NET-A05 | MUST NOT have bootstrap rely on a fixed list that can be blocked | Decentralization |
| NET-A06 | MUST NOT require specialized hardware for participation | THESIS_01 |
| NET-A07 | MUST NOT implement centralized content delivery or caching | VISION.md |
| NET-A08 | MUST NOT allow nodes to learn private information about other nodes' viewing behavior | Privacy |

---

## 3. Data Structures

### 3.1 PeerIdentity

```
PeerIdentity {
    node_id:        [u8; 32]        // SHA-256(public_key), ephemeral per session
    public_key:     [u8; 32]        // Ed25519 public key for this node
    identity_id:    Option<[u8; 32]> // Swimchain identity (if disclosed)
    version:        u16             // Protocol version
    capabilities:   u32             // Capability flags (bitmask)
}
```

**Fields:**
- `node_id`: Unique identifier for this node session. SHA-256 of the session public key.
- `public_key`: Ed25519 public key for encrypting and authenticating messages to this node.
- `identity_id`: Optionally, the node's Swimchain identity (may be withheld for privacy).
- `version`: Protocol version supported by this node.
- `capabilities`: Bitmask of supported features.

**Capability Flags:**
```
CAPABILITY_FULL_NODE      = 0x0001  // Stores full chain, serves sync requests
CAPABILITY_BLOCK_PRODUCER = 0x0002  // Actively produces blocks
CAPABILITY_RELAY          = 0x0004  // Accepts relay connections (for NAT traversal)
CAPABILITY_TOR            = 0x0008  // Accepts Tor connections
CAPABILITY_I2P            = 0x0010  // Accepts I2P connections
CAPABILITY_MOBILE         = 0x0020  // Mobile node (may have limited availability)
```

**Invariants:**
- `node_id` MUST equal SHA-256(public_key)
- `version` MUST be >= minimum supported version

### 3.2 PeerAddress

```
PeerAddress {
    transport:      TransportType    // Transport protocol
    address:        [u8; 64]         // Address bytes (format per transport)
    port:           u16              // Port number (ignored for some transports)
    last_seen:      u64              // Unix timestamp when last contacted
    last_success:   u64              // Unix timestamp of last successful exchange
    failures:       u16              // Consecutive connection failures
}

enum TransportType {
    TCPv4       = 0x01,             // IPv4 TCP (address: 4 bytes IP)
    TCPv6       = 0x02,             // IPv6 TCP (address: 16 bytes IP)
    Tor         = 0x03,             // Tor onion v3 (address: 56-char onion)
    I2P         = 0x04,             // I2P (address: b32 destination)
    QUIC        = 0x05,             // QUIC over UDP (address: IP)
}
```

**Address Format by Transport:**
| Transport | Address Content | Port Used |
|-----------|-----------------|-----------|
| TCPv4 | 4 bytes IPv4 address, zero-padded | Yes |
| TCPv6 | 16 bytes IPv6 address, zero-padded | Yes |
| Tor | 56-byte onion v3 address | Fixed 9735 |
| I2P | 52-byte base32 destination | Fixed 9735 |
| QUIC | 4 or 16 bytes IP address | Yes |

### 3.3 PeerInfo

```
PeerInfo {
    identity:       PeerIdentity     // Peer's identity information
    addresses:      Vec<PeerAddress> // Known addresses for this peer
    forks:          Vec<ForkIdentifier> // Forks this peer participates in
    services:       u32              // Services offered (subset of capabilities)
    user_agent:     [u8; 64]         // Client software identifier
    chain_heights:  Vec<(ForkIdentifier, u64)> // Current height per fork
    score:          i32              // Peer reputation score
}
```

**Invariants:**
- `addresses` MUST contain at least one reachable address
- `score` ranges from -1000 (banned) to +1000 (excellent)
- Peers with score < -500 SHOULD be disconnected

### 3.4 Message Envelope

```
MessageEnvelope {
    magic:          [u8; 4]          // Protocol magic bytes: "CSOC"
    version:        u8               // Protocol version
    message_type:   u8               // Message type ID
    fork_id:        [u8; 32]         // Fork context (zeros for fork-agnostic)
    payload_length: u32              // Length of payload in bytes
    checksum:       [u8; 4]          // First 4 bytes of SHA-256(payload)
    payload:        [u8]             // Message-specific payload
}
```

**Fields:**
- `magic`: Protocol identifier, always "CSOC" (0x43534F43)
- `version`: Current version is 1
- `message_type`: Identifies payload type (see Section 5)
- `fork_id`: Which fork this message relates to (all zeros for cross-fork)
- `payload_length`: Size of payload in bytes
- `checksum`: Integrity check for payload
- `payload`: Serialized message content

**Invariants:**
- `magic` MUST equal "CSOC"
- `checksum` MUST equal SHA-256(payload)[0..4]
- `payload_length` MUST match actual payload size

### 3.5 SyncRequest

```
SyncRequest {
    fork_id:        ForkIdentifier   // Which fork to sync
    start_height:   u64              // Starting block height
    end_height:     Option<u64>      // Ending height (None = to tip)
    include_content: bool            // Include block contents, not just headers
    filter:         Option<SyncFilter> // Optional content filter
    request_id:     u64              // Unique request identifier
}

SyncFilter {
    spaces:         Option<Vec<SpaceID>>    // Only content from these spaces
    identities:     Option<Vec<IdentityID>> // Only content from these identities
    since_timestamp: Option<u64>            // Only content after this time
}
```

### 3.6 SyncResponse

```
SyncResponse {
    request_id:     u64              // Matches request
    fork_id:        ForkIdentifier   // Fork being synced
    blocks:         Vec<Block>       // Requested blocks (may be partial)
    has_more:       bool             // More blocks available
    tip_height:     u64              // Current chain tip height
    tip_hash:       [u8; 32]         // Current chain tip hash
}
```

### 3.7 GossipMessage

```
GossipMessage {
    message_type:   GossipType       // What is being gossiped
    fork_id:        ForkIdentifier   // Which fork
    content_id:     [u8; 32]         // Hash of content being announced
    timestamp:      u64              // When originated
    ttl:            u8               // Remaining hops (decremented on forward)
    payload:        Option<bytes>    // Content itself (for small messages)
}

enum GossipType {
    BlockAnnounce   = 0x01,          // New block available
    ContentNew      = 0x02,          // New post/reply/reaction
    ContentRequest  = 0x03,          // Request specific content
    ContentResponse = 0x04,          // Provide requested content
    PeerAnnounce    = 0x05,          // Announce peer availability
}
```

### 3.8 DHTRecord

```
DHTRecord {
    key:            [u8; 32]         // DHT key
    value:          bytes            // Stored value
    owner:          IdentityID       // Who stored this
    timestamp:      u64              // When stored
    ttl:            u64              // Seconds until expiry
    signature:      [u8; 64]         // Owner's signature
}

// Key formats:
// Fork peers:    SHA-256("fork:" || fork_id || "peers")
// Fork metadata: SHA-256("fork:" || fork_id || "meta")
// Identity:      SHA-256("identity:" || identity_id)
```

---

## 4. Algorithms

### 4.1 Node Discovery (Bootstrap)

**Purpose:** Enable a new node to find initial peers without central infrastructure.

#### 4.1.1 Clarification: Introduction Points vs. Authority Nodes

**A seed node is no different from a mobile phone that happens to be always connected.** The only difference is that you know its address in advance.

| Concept | What It Is | Centralization? |
|---------|------------|-----------------|
| **Authority Nodes** | Nodes with protocol privileges | ❌ Rejected |
| **Introduction Points** | Well-known addresses for discovery | ✅ Acceptable |

**Why introduction points are NOT centralization:**
- They have no protocol-level authority
- They cannot censor content
- They cannot exclude users
- Once connected, you never need them again
- Anyone can run one
- Multiple independent operators exist

**A website listing peer addresses is "infrastructure" in the same way a phone book is infrastructure.** It helps you find people; it doesn't control your conversations.

#### 4.1.2 Five-Layer Discovery Stack

Node-level discovery uses a defense-in-depth approach to bootstrap, where any single method failing doesn't prevent network access. The five node-level layers are cached peers, mDNS, seed nodes (introduction points), DHT, and peer exchange. Social bootstrap (QR codes, invite links) is a client-layer concern that feeds addresses into the node as ordinary peers — it is not a node discovery layer.

```
function bootstrap_network() -> Vec<PeerInfo> {
    let mut peers = Vec::new()

    // Layer 0: Cached peers from previous sessions
    // First thing checked - eliminates dependency for returning users
    peers.extend(load_cached_peers())

    // Layer 1: Local network discovery (mDNS)
    // On by default. Zero infrastructure, works without internet
    peers.extend(mdns_discovery())

    // Layer 2: Community introduction points (seed nodes)
    // Well-known addresses, multiple operators
    // NOT authoritative - just always-on nodes you know about
    if peers.len() < MIN_PEERS {
        peers.extend(load_introduction_points())
    }

    // Layer 3: DHT bootstrap
    // Once we have any peer, DHT finds more
    if peers.len() < MIN_PEERS && peers.len() > 0 {
        peers.extend(dht_bootstrap())
    }

    // Layer 4: Peer exchange
    // Connected peers share their peer lists
    for peer in peers {
        if connect(peer).is_ok() {
            let more = request_peer_addresses(peer)
            peers.extend(more)
        }
    }

    return peers
}
```

**Community Introduction Points:**
```
// These are NOT hardcoded in the protocol binary
// They are published by community (website, README, social media)
// Anyone can run one - no permission required
// Client caches discovered peers, reducing dependency

INTRODUCTION_POINTS = load_from_config_or_defaults([
    // Multiple independent operators
    // Geographically distributed
    // No single source controls the list
    PeerAddress { transport: Tor, address: onion1... },
    PeerAddress { transport: Tor, address: onion2... },
    PeerAddress { transport: TCPv4, address: ip1... },
    PeerAddress { transport: I2P, address: i2p1... },
    // ... (recommend 5-10 across multiple operators)
])

// Key properties:
// - NOT required by protocol
// - NOT privileged in any way
// - NOT able to see/control content
// - NOT single points of failure (many exist)
// - NOT gatekeepers (open to all)
// - NOT different from any other always-on node
```

**Why We Don't Use DNS Seeds:**
While simpler, DNS seeds are explicitly rejected because:
- DNS depends on ICANN-controlled infrastructure
- DNS can be censored, poisoned, or seized
- Even with DNSSEC, root of trust is centralized

Introduction points avoid this by being direct IP/onion addresses.

**mDNS Local Discovery (on by default):**
```
function mdns_discovery() -> Vec<PeerAddress> {
    // Discover Swimchain nodes on local network. Enabled by default.
    // Useful for home networks, office LANs
    // Works without any internet connectivity
    let service = "_swimchain._tcp.local"
    let peers = mdns_browse(service)
    return peers.map(|p| PeerAddress::from_mdns(p))
}
```

**Social Bootstrap (client layer):**

QR codes and invite links are a client-layer concern, not a node discovery layer. Clients
encode peer connection info for users to share in person or via messaging apps, then hand
any resulting addresses to the node as ordinary peers. The social network IS the discovery
network at this layer.

```
// QR codes encode peer connection info
// Users share via messaging apps, in-person, etc.

struct PeerQRCode {
    addresses: Vec<PeerAddress>,
    node_id: [u8; 32],
    fork_hints: Vec<ForkIdentifier>,  // Optional: forks they participate in
}

function generate_my_qr_code() -> QRCode {
    let info = PeerQRCode {
        addresses: my_reachable_addresses(),
        node_id: my_node_id(),
        fork_hints: my_active_forks(),
    }
    return qr_encode(serialize(info))
}
```

**Complexity:** O(n) where n is number of discovered peers
**Expected Time:** < 30 seconds to minimum viable peer set

### 4.2 Fork-Specific Peer Discovery

**Purpose:** Find peers participating in a specific fork.

Swimchain uses a **Kademlia-style DHT** with fork-specific keyspaces (as defined in SPEC_05).

```
function discover_fork_peers(fork_id: ForkIdentifier) -> Vec<PeerInfo> {
    // Generate multiple DHT lookup keys for redundancy
    let keys = (0..8).map(|i|
        sha256(fork_id.fork_hash || "peers" || u8_to_bytes(i))
    )

    let mut peers = HashSet::new()

    // Look up each key in DHT
    for key in keys {
        let records = dht_get(key)
        for record in records {
            if verify_signature(record) {
                let peer = deserialize<PeerInfo>(record.value)
                if peer.forks.contains(fork_id) {
                    peers.insert(peer)
                }
            }
        }
    }

    // Verify peers actually serve this fork
    let verified = peers.filter(|p| {
        let status = request_chain_status(p, fork_id)
        status.is_ok()
    })

    return verified.collect()
}

function announce_fork_presence(fork_id: ForkIdentifier, my_info: PeerInfo) {
    let keys = (0..8).map(|i|
        sha256(fork_id.fork_hash || "peers" || u8_to_bytes(i))
    )

    let record = DHTRecord {
        key: keys[0],  // Primary key
        value: serialize(my_info),
        owner: my_info.identity.identity_id.unwrap_or(my_info.identity.node_id),
        timestamp: current_time(),
        ttl: 3600,     // 1 hour
        signature: sign(my_key, ...),
    }

    for key in keys {
        dht_put(key, record)
    }

    // Re-announce periodically
    schedule_reannounce(fork_id, 1800)  // Every 30 minutes
}
```

**Complexity:** O(log n) DHT lookups where n is network size
**Expected Time:** 1-5 seconds for peer discovery

### 4.3 Gossip Protocol

**Purpose:** Efficiently propagate new content and blocks through the network.

Swimchain uses **epidemic gossip** with controlled redundancy:

```
GOSSIP_FANOUT = 8       // Number of peers to forward to
GOSSIP_TTL = 6          // Maximum hops
SEEN_CACHE_SIZE = 10000 // Recently seen message IDs

function gossip_content(content: SignedContent, origin: PeerInfo?) {
    let content_id = sha256(content)

    // Check if already seen
    if seen_cache.contains(content_id) {
        return
    }
    seen_cache.insert(content_id)

    // Validate content
    if !validate_content(content) {
        return
    }

    // Store locally
    store_content(content)

    // Select peers to forward to
    let peers = select_gossip_peers(origin)

    // Create gossip message
    let gossip = GossipMessage {
        message_type: GossipType::ContentNew,
        fork_id: content.fork_id,
        content_id: content_id,
        timestamp: current_time(),
        ttl: GOSSIP_TTL,
        payload: Some(serialize(content)),
    }

    // Forward to selected peers
    for peer in peers {
        send_async(peer, gossip)
    }
}

function select_gossip_peers(exclude: Option<PeerInfo>) -> Vec<PeerInfo> {
    let candidates = connected_peers()
        .filter(|p| Some(p) != exclude)
        .filter(|p| p.forks.contains(current_fork))
        .filter(|p| p.score > 0)

    // Prefer diverse selection: different IPs, different ASNs if possible
    let selected = weighted_random_selection(
        candidates,
        GOSSIP_FANOUT,
        weight_fn = |p| p.score + diversity_bonus(p)
    )

    return selected
}

function on_receive_gossip(gossip: GossipMessage, sender: PeerInfo) {
    // Check TTL
    if gossip.ttl == 0 {
        return
    }

    // Check if already seen
    if seen_cache.contains(gossip.content_id) {
        return
    }
    seen_cache.insert(gossip.content_id)

    // Process based on type
    match gossip.message_type {
        GossipType::BlockAnnounce => {
            // Request block if we don't have it
            if !have_block(gossip.content_id) {
                request_block(sender, gossip.content_id)
            }
        }

        GossipType::ContentNew => {
            if let Some(payload) = gossip.payload {
                let content = deserialize<SignedContent>(payload)
                if validate_content(content) {
                    store_content(content)

                    // Forward with decremented TTL
                    gossip.ttl -= 1
                    forward_gossip(gossip, sender)
                }
            } else {
                // Request content
                request_content(sender, gossip.content_id)
            }
        }

        // ... other types
    }
}
```

**Block Announcement (Compact):**
```
function announce_block(block: Block) {
    let block_hash = hash_block_header(block.header)

    // First, send compact announcement (header only)
    let gossip = GossipMessage {
        message_type: GossipType::BlockAnnounce,
        fork_id: block.header.fork_id,
        content_id: block_hash,
        timestamp: block.header.timestamp,
        ttl: GOSSIP_TTL,
        payload: Some(serialize(block.header)),  // Header only, ~200 bytes
    }

    broadcast_gossip(gossip)
}
```

**Complexity:** O(log n) expected propagation time for n nodes
**Redundancy:** Each message received ~2-3 times on average (acceptable for reliability)

### 4.4 Two-Layer Sync Model

**Purpose:** Efficiently sync both the authoritative chain and content blobs.

The hybrid architecture separates sync into two distinct processes:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TWO-LAYER SYNC MODEL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CHAIN SYNC (this spec)          CONTENT SYNC (SPEC_07)        │
│   ─────────────────────           ──────────────────────        │
│                                                                  │
│   1. Download block headers       1. User wants to view post    │
│   2. Verify PoW chain             2. Check local cache          │
│   3. Download post records        3. If missing, request blob   │
│   4. Verify signatures            4. Fetch from any peer        │
│   5. Store authoritative data     5. Verify hash matches        │
│                                   6. Cache for re-seeding       │
│                                                                  │
│   SMALL, REPLICATED               LARGE, ON-DEMAND              │
│   Every node has full chain       Nodes have what they've seen  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight:** The chain is small (post metadata only, ~500 bytes per post). Decay keeps it bounded. Every node can verify the full authoritative chain.

Content blobs (images, large text) are fetched on-demand when a user wants to view them, similar to BitTorrent.

**Sync Phases:**

| Phase | Layer | What Happens | When |
|-------|-------|--------------|------|
| 1. Chain Sync | Authoritative | Download headers, verify PoW chain | Node startup, continuous |
| 2. Record Sync | Authoritative | Download post records for non-decayed blocks | After headers verified |
| 3. Content Fetch | Content | Fetch blobs for posts user views | On-demand, lazy |
| 4. Content Seed | Content | Share cached blobs with peers | While online |

### 4.5 Initial Chain Sync Protocol

**Purpose:** Enable new nodes to bootstrap their chain state efficiently.

**Strategy:** Swimchain uses a **header-first sync** approach, downloading block headers first, then fetching post records (not content blobs) for non-decayed blocks.

```
function initial_chain_sync(fork_id: ForkIdentifier) {
    // IMPORTANT: This syncs the AUTHORITATIVE CHAIN only (small, ~500 bytes/post)
    // Content blobs are fetched on-demand via SPEC_07 when user views posts

    // Phase 1: Find best chain tip from multiple peers
    let peers = discover_fork_peers(fork_id)
    let chain_tips = []

    for peer in peers.take(8) {  // Query multiple peers
        let status = request_chain_status(peer, fork_id)
        chain_tips.push((peer, status))
    }

    // Select chain with most cumulative work
    let best_tip = chain_tips.max_by(|(_, s)| s.cumulative_work)
    let target_height = best_tip.1.height

    // Phase 2: Download headers
    emit_progress("Downloading headers", 0, target_height)

    let headers = download_headers(fork_id, 0, target_height)
    verify_header_chain(headers)  // Check PoW, prev_hash links

    emit_progress("Headers verified", target_height, target_height)

    // Phase 3: Identify non-decayed posts
    let current_time = current_time()
    let decay_threshold = current_time - MAX_CONTENT_LIFETIME

    let relevant_blocks = headers.filter(|h|
        h.timestamp > decay_threshold
    )

    emit_progress("Downloading post records", 0, relevant_blocks.len())

    // Phase 4: Download post records (NOT content blobs - those are fetched on-demand)
    // Post records are small (~500 bytes): author, space, timestamp, PoW, content_hash, signature
    let record_tasks = []

    for (i, header) in relevant_blocks.enumerate() {
        let peer = select_peer_for_block(header.height)
        record_tasks.push(async {
            download_block_records(peer, header.height, fork_id)
        })

        if record_tasks.len() >= PARALLEL_DOWNLOADS {
            // Process batch
            let results = await_all(record_tasks)
            for block in results {
                validate_and_store_block(block)
            }
            record_tasks.clear()
            emit_progress("Downloading post records", i, relevant_blocks.len())
        }
    }

    // Process remaining
    let results = await_all(record_tasks)
    for block in results {
        validate_and_store_block(block)
    }

    emit_progress("Chain sync complete", relevant_blocks.len(), relevant_blocks.len())

    // NOTE: Content blobs (images, large text) are NOT synced here.
    // They are fetched on-demand when user views a post (see SPEC_07).
    // This keeps initial sync fast - only chain data is required.
}

function download_headers(
    fork_id: ForkIdentifier,
    start: u64,
    end: u64
) -> Vec<BlockHeader> {
    let headers = []
    let batch_size = 2000  // Headers per request

    let current = start
    while current < end {
        let request = SyncRequest {
            fork_id: fork_id,
            start_height: current,
            end_height: Some(min(current + batch_size, end)),
            include_content: false,
            filter: None,
            request_id: generate_request_id(),
        }

        let peer = select_sync_peer()
        let response = send_and_wait(peer, request)

        for block in response.blocks {
            headers.push(block.header)
        }

        current += batch_size
    }

    return headers
}
```

**Sync Optimization: Checkpoint Hints**
```
// Optional: Well-known checkpoints for faster validation
// NOT required, NOT authoritative, just optimization hints
CHECKPOINT_HINTS = [
    (height: 100000, hash: 0xabc...),
    (height: 200000, hash: 0xdef...),
]

function verify_header_chain(headers: Vec<BlockHeader>) {
    let mut prev_hash = genesis_hash()

    for header in headers {
        // Verify chain linkage
        if header.prev_hash != prev_hash {
            return Err(Error::InvalidChain)
        }

        // Verify PoW
        if !verify_pow(header) {
            return Err(Error::InvalidPoW)
        }

        // Optional: Check against checkpoint hints
        if let Some(checkpoint) = CHECKPOINT_HINTS.get(header.height) {
            if hash(header) != checkpoint.hash {
                log_warning("Checkpoint mismatch at height {}", header.height)
                // Don't fail - checkpoints are hints, not authoritative
            }
        }

        prev_hash = hash(header)
    }
}
```

**Expected Chain Sync Time (decay-bounded, post records only):**

Because the chain only contains post records (~500 bytes each) and not content blobs, sync is fast:

| Chain Age | Est. Post Records | Chain Size | Sync Time (10 Mbps) |
|-----------|-------------------|------------|---------------------|
| 30 days | ~100K posts | ~50 MB | < 30 seconds |
| 180 days | ~500K posts | ~250 MB | < 2 minutes |
| 1 year | ~1M posts | ~500 MB | < 5 minutes |

*Note: These are CHAIN sizes only. Content blobs (images, large text) are fetched on-demand via SPEC_07 and are not included in initial sync. This keeps first-time sync fast.*

**What's NOT synced here:**
- Images, large text (content blobs) - fetched on-demand
- Content from decayed posts - already pruned from chain

**After chain sync, content fetching is lazy:**
1. User opens app → chain is synced (fast, < 5 min even for old network)
2. User navigates to space → post records already available
3. User views specific post → content blob fetched from peers (if available)
4. Content blob cached locally for future viewing/seeding

### 4.5 Continuous Sync Protocol

**Purpose:** Keep synced nodes current as new content arrives.

```
SYNC_INTERVAL = 30        // Seconds between sync checks
BLOCK_REQUEST_TIMEOUT = 10 // Seconds to wait for block

function continuous_sync_loop(fork_id: ForkIdentifier) {
    loop {
        sleep(SYNC_INTERVAL)

        // Check for new blocks
        let local_tip = get_local_tip(fork_id)
        let peer_tips = query_peer_tips(fork_id)

        // Find peers with better chain
        let better_peers = peer_tips.filter(|(_, tip)|
            tip.cumulative_work > local_tip.cumulative_work
        )

        if better_peers.is_empty() {
            // We're at tip, just process gossip
            continue
        }

        // Sync from best peer
        let (peer, tip) = better_peers.max_by(|(_, t)| t.cumulative_work)

        // Request missing blocks
        let missing_heights = (local_tip.height + 1)..=tip.height

        for height in missing_heights {
            let request = SyncRequest {
                fork_id: fork_id,
                start_height: height,
                end_height: Some(height),
                include_content: true,
                filter: None,
                request_id: generate_request_id(),
            }

            match send_and_wait_timeout(peer, request, BLOCK_REQUEST_TIMEOUT) {
                Ok(response) => {
                    for block in response.blocks {
                        if validate_block(block) {
                            store_block(block)
                            notify_new_block(block)
                        }
                    }
                }
                Err(Timeout) => {
                    // Try different peer
                    adjust_peer_score(peer, -10)
                    break
                }
            }
        }
    }
}

function on_new_block_gossip(header: BlockHeader, sender: PeerInfo) {
    // Validate header
    if !validate_header(header) {
        adjust_peer_score(sender, -50)
        return
    }

    let local_tip = get_local_tip(header.fork_id)

    // Check if this extends our chain
    if header.prev_hash == hash(local_tip) {
        // Direct extension - fetch full block immediately
        let block = request_block_content(sender, header.height)
        if validate_block(block) {
            store_block(block)
            notify_new_block(block)
            adjust_peer_score(sender, +5)
        }
    } else if header.height > local_tip.height {
        // Possible fork or missing blocks - trigger sync
        trigger_sync(header.fork_id)
    }
}
```

**Mobile Background Sync:**
```
function mobile_background_sync(fork_id: ForkIdentifier) {
    // Runs during system-allocated background time
    // Optimized for minimal battery/data usage

    let local_tip = get_local_tip(fork_id)

    // Just sync headers in background
    let peer = select_best_peer()
    let remote_tip = query_chain_status(peer, fork_id)

    if remote_tip.height > local_tip.height {
        // Download headers only (small)
        let new_headers = download_headers(
            fork_id,
            local_tip.height + 1,
            remote_tip.height
        )

        // Verify and store headers
        for header in new_headers {
            store_header(header)
        }

        // Mark content for foreground download
        schedule_content_download(local_tip.height + 1, remote_tip.height)
    }
}

function mobile_foreground_sync() {
    // Called when app is active
    // Download content for blocks where we only have headers

    let pending = get_blocks_needing_content()

    for height in pending {
        if is_decayed(height) {
            // Skip decayed blocks
            mark_block_complete(height)
            continue
        }

        let block = download_block_content(height)
        store_block_content(block)
        mark_block_complete(height)
    }
}
```

### 4.6 Peer Scoring and Management

**Purpose:** Maintain healthy peer connections and deprioritize bad actors.

```
INITIAL_SCORE = 100
MAX_SCORE = 1000
MIN_SCORE = -1000
BAN_THRESHOLD = -500
EXCELLENT_THRESHOLD = 500

struct PeerScore {
    score: i32,
    last_update: u64,
    connection_count: u32,
    bytes_provided: u64,
    invalid_messages: u32,
    response_times: RingBuffer<Duration>,
}

function adjust_peer_score(peer: PeerInfo, delta: i32) {
    let current = get_peer_score(peer)
    let new_score = clamp(current.score + delta, MIN_SCORE, MAX_SCORE)

    current.score = new_score
    current.last_update = current_time()

    save_peer_score(peer, current)

    // Take action based on score
    if new_score <= BAN_THRESHOLD {
        disconnect_peer(peer)
        ban_peer(peer, duration: 3600)  // 1 hour ban
    }
}

// Score adjustments for various events
SCORE_ADJUSTMENTS = {
    valid_block_provided: +10,
    valid_content_provided: +2,
    invalid_block: -100,
    invalid_content: -50,
    invalid_signature: -200,
    connection_timeout: -5,
    fast_response: +3,
    slow_response: -2,
    successful_sync: +20,
    gossip_spam: -30,
    protocol_violation: -100,
}

function select_peer_for_request() -> PeerInfo {
    let candidates = connected_peers()
        .filter(|p| p.score > 0)

    if candidates.is_empty() {
        // All peers have negative score - try to connect new ones
        attempt_new_connections()
        return random_peer()
    }

    // Weighted selection favoring high-score peers
    let total_weight = candidates.sum(|p| p.score)
    let selection = random(0, total_weight)

    let mut cumulative = 0
    for peer in candidates {
        cumulative += peer.score
        if cumulative >= selection {
            return peer
        }
    }

    return candidates.last()
}
```

**Peer Connection Management:**
```
MIN_PEERS = 8            // Minimum connections to maintain
TARGET_PEERS = 25        // Target number of connections
MAX_PEERS = 100          // Maximum connections

function maintain_connections() {
    let connected = connected_peers().len()

    if connected < MIN_PEERS {
        // Critical: need more peers
        let needed = TARGET_PEERS - connected
        for _ in 0..needed {
            let peer = discover_new_peer()
            attempt_connection(peer)
        }
    } else if connected < TARGET_PEERS {
        // Below target: occasionally add peers
        if random() < 0.1 {  // 10% chance each cycle
            let peer = discover_new_peer()
            attempt_connection(peer)
        }
    } else if connected > MAX_PEERS {
        // Too many: disconnect lowest-scoring
        let to_disconnect = connected - TARGET_PEERS
        let worst = connected_peers()
            .sorted_by(|p| p.score)
            .take(to_disconnect)

        for peer in worst {
            disconnect_peer(peer)
        }
    }

    // Ensure peer diversity
    ensure_diverse_connections()
}

function ensure_diverse_connections() {
    // Group peers by ASN (Autonomous System Number)
    let by_asn = connected_peers().group_by(|p| get_asn(p))

    // If any ASN has >50% of connections, disconnect some
    for (asn, peers) in by_asn {
        let concentration = peers.len() as f32 / connected_peers().len() as f32

        if concentration > 0.5 {
            let to_disconnect = peers.len() - (connected_peers().len() / 4)
            for peer in peers.take(to_disconnect) {
                disconnect_peer(peer)
                log("Disconnecting for diversity: ASN {}", asn)
            }
        }
    }
}
```

### 4.7 NAT Traversal and Relay

**Purpose:** Enable nodes behind NAT to participate fully.

```
function setup_connectivity() {
    // Try direct connectivity first
    let external_addr = detect_external_address()

    if external_addr.is_some() && test_inbound(external_addr) {
        // Direct connectivity works
        announce_address(external_addr)
        return
    }

    // Try UPnP port mapping
    if let Some(mapped) = upnp_map_port(DEFAULT_PORT) {
        if test_inbound(mapped) {
            announce_address(mapped)
            return
        }
    }

    // Try NAT-PMP / PCP
    if let Some(mapped) = natpmp_map_port(DEFAULT_PORT) {
        if test_inbound(mapped) {
            announce_address(mapped)
            return
        }
    }

    // Fallback: STUN + UDP hole punching
    let stun_addr = stun_discover()
    if stun_addr.is_some() {
        // Use QUIC transport which works better with NAT
        configure_quic_transport(stun_addr)
    }

    // Last resort: use relay peers
    enable_relay_mode()
}

function enable_relay_mode() {
    // Find peers willing to relay
    let relay_peers = connected_peers()
        .filter(|p| p.capabilities & CAPABILITY_RELAY != 0)
        .filter(|p| p.score > 300)  // Only use trusted relays

    if relay_peers.is_empty() {
        log_warning("No relay peers available - limited connectivity")
        return
    }

    // Register with relay peers
    for relay in relay_peers.take(3) {
        let circuit = establish_relay_circuit(relay)
        announce_relay_address(relay, circuit)
    }
}

// Relay protocol message
struct RelayRequest {
    target_node_id: [u8; 32],    // Who we want to reach
    payload: bytes,              // Encrypted message for target
}

function relay_message(relay: PeerInfo, target: NodeID, message: bytes) {
    // Encrypt message to target's public key
    let encrypted = encrypt_to(target.public_key, message)

    let request = RelayRequest {
        target_node_id: target.node_id,
        payload: encrypted,
    }

    send(relay, request)
}

// On relay peer:
function handle_relay_request(request: RelayRequest, from: PeerInfo) {
    // Check if we know the target
    let target = find_peer(request.target_node_id)

    if target.is_none() {
        send_error(from, Error::TargetNotFound)
        return
    }

    // Rate limit relaying
    if !check_relay_rate_limit(from) {
        send_error(from, Error::RateLimited)
        return
    }

    // Forward to target
    forward_relay(target, from, request.payload)
}
```

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x00 | VERSION | Initial handshake with version info |
| 0x01 | VERACK | Version acknowledgment |
| 0x02 | PING | Keep-alive ping |
| 0x03 | PONG | Keep-alive response |
| 0x10 | GETADDR | Request peer addresses |
| 0x11 | ADDR | Peer address response |
| 0x20 | INV | Inventory announcement (have this content) |
| 0x21 | GETDATA | Request specific content by hash |
| 0x22 | DATA | Content response |
| 0x23 | NOTFOUND | Requested content not available |
| 0x30 | GETBLOCKS | Request block range |
| 0x31 | BLOCKS | Block response |
| 0x32 | GETHEADERS | Request headers only |
| 0x33 | HEADERS | Headers response |
| 0x34 | CHAINSTATUS | Announce/query chain tip |
| 0x40 | GOSSIP | Gossip protocol message |
| 0x50 | FORK_ANNOUNCE | New fork announcement |
| 0x51 | FORK_QUERY | Fork information request |
| 0x52 | FORK_INFO | Fork information response |
| 0x60 | REJECT | Reject with reason |
| 0x61 | ALERT | Network alert (soft fork, etc.) |

### 5.2 Message Formats

**Byte Order:** All multi-byte integers are **little-endian**.

#### 5.2.1 VERSION (0x00)

```
[4 bytes: magic "CSOC"]
[1 byte: version = 0x01]
[1 byte: type = 0x00]
[32 bytes: fork_id (zeros if multi-fork)]
[4 bytes: payload_length]
[4 bytes: checksum]
Payload:
  [4 bytes: protocol_version (u32)]
  [8 bytes: node_services (u64 bitmask)]
  [8 bytes: timestamp (u64)]
  [26 bytes: sender_addr (PeerAddress)]
  [26 bytes: receiver_addr (PeerAddress)]
  [8 bytes: nonce (u64, for connection dedup)]
  [1 byte: user_agent_len]
  [N bytes: user_agent (max 256)]
  [4 bytes: start_height (u32)]
  [1 byte: relay_flag (bool)]
```

#### 5.2.2 GETADDR (0x10)

```
[header: 46 bytes]
Payload:
  [32 bytes: fork_id (request peers for this fork)]
  [2 bytes: max_addrs (u16, max addresses to return)]
```

#### 5.2.3 ADDR (0x11)

```
[header: 46 bytes]
Payload:
  [2 bytes: addr_count (u16)]
  [N * 34 bytes: addresses]
    Each address:
      [1 byte: transport_type]
      [64 bytes: address]
      [2 bytes: port]
      [4 bytes: services (u32)]
      [4 bytes: timestamp (u32, last seen)]
```

#### 5.2.4 INV (0x20)

```
[header: 46 bytes]
Payload:
  [2 bytes: inv_count (u16)]
  [N * 33 bytes: inventory items]
    Each item:
      [1 byte: inv_type]
        0x01 = block
        0x02 = content
        0x03 = identity
      [32 bytes: hash]
```

#### 5.2.5 GETDATA (0x21)

```
[header: 46 bytes]
Payload:
  [2 bytes: request_count (u16)]
  [N * 33 bytes: requested items (same format as INV)]
```

#### 5.2.6 GETBLOCKS (0x30)

```
[header: 46 bytes]
Payload:
  [8 bytes: start_height (u64)]
  [8 bytes: end_height (u64)]
  [1 byte: include_content (bool)]
  [2 bytes: max_blocks (u16)]
```

#### 5.2.7 BLOCKS (0x31)

```
[header: 46 bytes]
Payload:
  [2 bytes: block_count (u16)]
  [N blocks: variable length]
    Each block:
      [4 bytes: block_length (u32)]
      [M bytes: serialized Block]
```

#### 5.2.8 CHAINSTATUS (0x34)

```
[header: 46 bytes]
Payload:
  [8 bytes: height (u64)]
  [32 bytes: tip_hash]
  [8 bytes: cumulative_work (u64)]
  [4 bytes: pending_content_count (u32)]
  [8 bytes: timestamp (u64)]
```

#### 5.2.9 GOSSIP (0x40)

```
[header: 46 bytes]
Payload:
  [1 byte: gossip_type]
  [32 bytes: content_id]
  [8 bytes: timestamp (u64)]
  [1 byte: ttl]
  [4 bytes: payload_length (u32)]
  [N bytes: optional payload]
```

#### 5.2.10 REJECT (0x60)

```
[header: 46 bytes]
Payload:
  [1 byte: rejected_message_type]
  [1 byte: rejection_code]
    0x01 = malformed
    0x02 = invalid
    0x03 = obsolete
    0x04 = duplicate
    0x05 = not_found
    0x06 = rate_limited
    0x07 = banned
  [1 byte: reason_length]
  [N bytes: reason_text (UTF-8, max 256)]
  [32 bytes: rejected_hash (if applicable)]
```

### 5.3 Connection Handshake

```
Initiator                     Responder
    |                             |
    |------- VERSION ------------>|
    |                             |
    |<------ VERSION -------------|
    |                             |
    |------- VERACK ------------->|
    |                             |
    |<------ VERACK --------------|
    |                             |
    |  (connection established)   |
    |                             |
```

**Handshake Rules:**
1. Both peers send VERSION as first message
2. VERSION MUST be sent within 10 seconds of connection
3. VERACK sent only after valid VERSION received
4. Connection established after both VERACK exchanged
5. If version incompatible, send REJECT and close

---

## 6. Validation Rules

### 6.1 Message Validation

- `V-MSG-01`: Magic bytes MUST equal "CSOC"
- `V-MSG-02`: Version MUST be supported (currently only 1)
- `V-MSG-03`: Checksum MUST match SHA-256(payload)[0..4]
- `V-MSG-04`: Payload length MUST match actual payload size
- `V-MSG-05`: Message type MUST be recognized
- `V-MSG-06`: Fork ID MUST be known or zeros (for fork-agnostic)

### 6.2 Peer Validation

- `V-PEER-01`: Node ID MUST equal SHA-256 of claimed public key
- `V-PEER-02`: Version handshake MUST complete within 30 seconds
- `V-PEER-03`: PING MUST receive PONG within 60 seconds
- `V-PEER-04`: Peers MUST NOT announce more than 1000 addresses per ADDR message
- `V-PEER-05`: Advertised forks MUST be verifiable via CHAINSTATUS

### 6.3 Sync Validation

- `V-SYNC-01`: Block headers MUST form valid chain (prev_hash linkage)
- `V-SYNC-02`: Block PoW MUST meet difficulty target
- `V-SYNC-03`: Block timestamps MUST be monotonically increasing
- `V-SYNC-04`: Block content MUST have valid signatures
- `V-SYNC-05`: Received blocks MUST match requested range
- `V-SYNC-06`: Sync responses MUST reference valid request ID

### 6.4 Gossip Validation

- `V-GOSSIP-01`: TTL MUST be > 0 to forward
- `V-GOSSIP-02`: Content MUST have valid signature before forwarding
- `V-GOSSIP-03`: Decayed content MUST NOT be gossiped
- `V-GOSSIP-04`: Gossip timestamp MUST be within ±5 minutes of local time
- `V-GOSSIP-05`: Duplicate gossip (same content_id) MUST be dropped

---

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Description | Severity |
|--------|-------------|----------|
| TH-NET-01 | Eclipse attack (peer isolation) | Critical |
| TH-NET-02 | Sybil attack (fake peer identities) | High |
| TH-NET-03 | Traffic analysis / surveillance | High |
| TH-NET-04 | DNS poisoning of seed servers | Medium |
| TH-NET-05 | ISP-level blocking | Medium |
| TH-NET-06 | Gossip spam / DoS | Medium |
| TH-NET-07 | Message manipulation | Low (signatures) |
| TH-NET-08 | Relay abuse | Medium |

### 7.2 Mitigations

**TH-NET-01 (Eclipse Attack):**
- Maintain minimum 8 diverse peer connections
- Require connections across multiple ASNs
- Periodically discover and connect to new peers
- Cache known-good peers for reconnection
- Support multiple bootstrap mechanisms
- Allow manual peer addition

**TH-NET-02 (Sybil Attack):**
- Peer scoring reduces impact of malicious nodes
- PoW content validation prevents fake content injection
- Diverse peer selection prevents concentration
- Ban and rate-limit misbehaving peers
- Reputation carries across sessions

**TH-NET-03 (Traffic Analysis):**
- Support Tor transport for IP privacy
- Support I2P transport as alternative
- Use encrypted connections (TLS 1.3 or Noise protocol)
- Optional traffic padding to obscure patterns
- No unencrypted metadata leakage

**TH-NET-04 (DNS Poisoning):**
- DNS seeds are optional, not required
- Multiple independent DNS seed operators
- Cached peers survive DNS unavailability
- Tor/I2P bootstrap bypasses DNS entirely
- Manual peer entry as fallback

**TH-NET-05 (ISP Blocking):**
- Tor hidden service support
- I2P eepsite support
- QUIC transport (harder to deep-packet inspect)
- Domain fronting may be possible (client choice)
- Local network discovery (mDNS), enabled by default

**TH-NET-06 (Gossip Spam):**
- TTL limits propagation distance
- Rate limiting per peer
- Seen message cache prevents duplicates
- Peer scoring penalizes spammers
- All gossip requires valid signatures

**TH-NET-07 (Message Manipulation):**
- All content cryptographically signed
- Message checksums detect corruption
- Invalid messages lower peer score
- Persistent misbehavior leads to ban

**TH-NET-08 (Relay Abuse):**
- Relay peers rate-limit forwarding
- Only high-score peers offered relay service
- Relayed messages encrypted end-to-end
- Relay circuits time-limited
- Relay peers can refuse service

---

## 8. Privacy Considerations

### 8.1 What Is Exposed

- **IP Addresses**: Visible to direct peers (mitigated by Tor/I2P)
- **Fork Participation**: Which forks a node participates in is visible to peers
- **Content Requests**: What content a node requests (can use bloom filters)
- **Connection Patterns**: When a node comes online/goes offline
- **Peer Relationships**: Who a node is connected to

### 8.2 What Is Protected

- **Content Viewing**: What content a user reads is not revealed (local storage)
- **Search Queries**: No query logging (all search is local)
- **Identity Linkage**: Node identity can be separate from Swimchain identity
- **Cross-Fork Activity**: Activity on different forks can use different connections

### 8.3 Privacy Enhancements

**Bloom Filters for Requests:**
```
function request_content_privately(content_ids: Vec<ContentID>) {
    // Create bloom filter containing wanted content
    let filter = BloomFilter::new(false_positive_rate: 0.01)
    for id in content_ids {
        filter.insert(id)
    }

    // Add decoy entries
    for _ in 0..content_ids.len() * 2 {
        filter.insert(random_content_id())
    }

    // Send filter to peers
    let response = send_filtered_request(filter)

    // Discard unwanted responses locally
    return response.filter(|c| content_ids.contains(c.id))
}
```

**Dandelion++ for Gossip Origin Privacy:**
```
function gossip_with_privacy(content: SignedContent) {
    // Stem phase: forward through chain of peers
    let stem_length = random(2, 5)
    let current_peer = select_random_peer()

    for _ in 0..stem_length {
        send_stem(current_peer, content)
        current_peer = get_next_stem_peer(current_peer)
    }

    // Fluff phase: broadcast normally
    send_fluff(current_peer, content)
}
```

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency | Description |
|-----------|------------|-------------|
| Identity (SPEC_01) | Node authentication | Use Ed25519 for peer identity |
| Content/Decay (SPEC_02) | Content validity | Check decay before propagation |
| PoW (SPEC_03) | Spam prevention | Validate PoW on received content |
| Spaces (SPEC_04) | Content filtering | Optional sync filtering by space |
| Forks (SPEC_05) | Fork-specific networking | Per-fork peer discovery and sync |
| **Content Distribution (SPEC_07)** | **Content retrieval** | **Fetch media blobs on-demand** |

### 9.1.1 Content Layer Integration (SPEC_07)

The network layer (this spec) and content layer (SPEC_07) work together:

```
                    NETWORK LAYER                      CONTENT LAYER
                    (SPEC_06)                         (SPEC_07)
                         │                                 │
User joins network ──────┼─────────────────────────────────┤
                         │                                 │
                   Chain Sync                              │
                   (headers +                              │
                    records)                               │
                         │                                 │
                         ▼                                 │
              "I know all posts exist"                     │
                         │                                 │
User views post ─────────┼─────────────────────────────────┤
                         │                                 │
                         │    ┌─────────────────────────────┤
                         │    │     Content Fetch           │
                         │    │     (on-demand)             │
                         │    │                             │
                         │    ▼                             │
                         │  "I have the actual image"      │
                         │                                 │
```

**Data Flow:**

1. **Chain sync provides:** Post metadata, author signatures, content hashes
2. **Content layer provides:** Actual bytes (images, large text)
3. **Chain record references content:** `content_hash: "sha256:abc123..."`
4. **Content verified by hash:** After fetch, verify hash matches chain record

**When content is unavailable:**

- Chain record exists (authoritative proof of posting)
- Content blob unavailable (no peers seeding)
- UI shows: "Content unavailable - no seeders"
- User can still see: author, timestamp, space, that a post existed

**Protocol messages shared between layers:**

| Message | Layer | Purpose |
|---------|-------|---------|
| WHO_HAS | Content | Ask who has a blob |
| I_HAVE | Content | Announce blob availability |
| GET | Content | Request blob bytes |
| DATA | Content | Return blob bytes |
| GETBLOCKS | Chain | Request post records |
| BLOCKS | Chain | Return post records |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `bootstrap_network()` | Initial peer discovery | Node startup |
| `discover_fork_peers(fork_id)` | Find fork-specific peers | Fork joining |
| `gossip_content(content)` | Propagate new content | Content creation |
| `sync_chain(fork_id, start, end)` | Sync block range | Initial/continuous sync |
| `get_connected_peers()` | List current connections | Client UI, diagnostics |
| `get_peer_score(peer)` | Query peer reputation | Connection decisions |
| `announce_address(addr)` | Advertise reachability | NAT traversal |

### 9.3 Transport Layer

Swimchain supports multiple transports:

| Transport | Port | Use Case |
|-----------|------|----------|
| TCP/IPv4 | 9735 | Default, direct connectivity |
| TCP/IPv6 | 9735 | IPv6-enabled networks |
| QUIC/UDP | 9735 | NAT-friendly, mobile |
| Tor | 9735 | Privacy, censorship resistance |
| I2P | 9735 | Alternative privacy network |

**Connection Preference (configurable):**
1. Direct TCP (if reachable)
2. QUIC (for NAT traversal)
3. Tor (for privacy)
4. I2P (alternative privacy)
5. Relay (last resort)

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Phase 1: Basic Connectivity**
1. Implement TCP transport with handshake
2. Implement bootstrap from hardcoded seeds
3. Implement basic gossip (block announcements)
4. Implement initial sync (header-first)
5. Implement peer scoring (basic)

**Phase 2: Robustness**
1. Add DHT for peer discovery
2. Implement continuous sync loop
3. Add peer diversity enforcement
4. Implement NAT traversal (UPnP, STUN)
5. Add QUIC transport

**Phase 3: Privacy & Resilience**
1. Add Tor transport
2. Add I2P transport
3. Implement Dandelion++ gossip
4. Add bloom filter requests
5. Implement relay protocol

**Recommended Libraries:**
- Networking: libp2p, tokio, async-std
- DHT: kad (Kademlia implementation)
- Encryption: ring, rustls, snow (Noise protocol)
- Tor: arti (Rust Tor implementation)

### 10.2 Known Challenges

**Challenge 1: Bootstrap Censorship Resistance**
Problem: Hardcoded seeds and DNS can be blocked by state actors.
Mitigations:
- Embed Tor seeds (harder to block)
- Allow QR code peer sharing for in-person bootstrap
- Support mesh networks for local discovery
- Community-maintained seed lists

**Challenge 2: Mobile Battery and Data**
Problem: Full node participation drains battery and data.
Mitigations:
- Header-only background sync
- WiFi-only full sync option
- Aggressive content pruning
- QUIC for efficient reconnection

**Challenge 3: Network Partition**
Problem: Network could partition into disconnected subgraphs.
Mitigations:
- Maintain connections across regions
- Periodic random peer discovery
- Monitor for partition indicators
- Alert users to low peer count

**Challenge 4: Sync Prioritization**
Problem: Which content to sync first when bandwidth limited.
Mitigations:
- Recent blocks first
- User's spaces prioritized
- Following identities prioritized
- Content from high-score peers prioritized

**Challenge 5: DHT Attacks**
Problem: Attackers could poison DHT with false entries.
Mitigations:
- Signed DHT records
- Verify peers serve claimed forks
- Multiple lookup keys per fork
- Rate limit DHT writes

---

## 11. Test Vectors

### 11.1 Message Encoding

**VERSION Message:**
```
Input:
  protocol_version: 1
  services: 0x0003 (full node + relay)
  timestamp: 1704067200 (2024-01-01 00:00:00)
  user_agent: "Swimchain/1.0"
  start_height: 1000

Expected encoding (hex):
  43534F43 01 00 0000...0000 [header]
  01000000 03000000 00000000 00C2EB65 00000000 ...
```

### 11.2 Handshake Sequence

**Valid Handshake:**
```
Node A -> Node B: VERSION (version=1, height=100)
Node B -> Node A: VERSION (version=1, height=200)
Node A -> Node B: VERACK
Node B -> Node A: VERACK
Result: Connection established, Node A should sync to height 200
```

**Invalid Version:**
```
Node A -> Node B: VERSION (version=99)
Node B -> Node A: REJECT (code=0x03 obsolete, reason="unsupported version")
Node B: Closes connection
```

### 11.3 Gossip Propagation

**Valid Gossip:**
```
Input:
  gossip_type: ContentNew (0x02)
  content_id: 0xabc123...
  ttl: 6
  timestamp: now

Forward behavior:
  - Select 8 peers
  - Decrement TTL to 5
  - Forward to all selected
  - Store in seen_cache
```

**TTL Exhausted:**
```
Input:
  ttl: 0

Behavior:
  - Do not forward
  - Still store content locally if valid
```

### 11.4 Sync Request/Response

**Header Sync:**
```
Request:
  fork_id: 0xdef456...
  start_height: 1000
  end_height: 2000
  include_content: false

Response:
  1000 block headers (200 bytes each)
  Total: ~200 KB
```

**Full Block Sync:**
```
Request:
  start_height: 1000
  end_height: 1010
  include_content: true

Response:
  10 complete blocks
  Size varies based on content
```

---

## 12. Open Questions

### 12.1 Resolved Questions

| Question | Resolution |
|----------|------------|
| How do nodes discover each other? | Multi-layer bootstrap: cached peers, mDNS, seed nodes, DHT, peer exchange |
| What's the gossip protocol? | Epidemic gossip with TTL=6, fanout=8, seen-cache |
| How does initial sync work? | Header-first sync, then content for non-decayed blocks |
| How do nodes stay in sync? | Continuous sync loop + gossip-driven updates |
| What's the message format? | Binary wire protocol with 46-byte envelope |

### 12.2 Remaining Open Questions

| Question | Notes |
|----------|-------|
| Exact bandwidth requirements? | Depends on activity level; need empirical measurement |
| Optimal gossip parameters? | Fanout=8, TTL=6 are reasonable defaults; may need tuning |
| Mobile sync frequency? | OS-dependent background fetch; recommend 15-minute intervals |
| DHT storage limits? | How many peers per fork to store; suggest 1000 max |
| Relay payment? | Currently altruistic; may need incentive mechanism |
| Traffic padding overhead? | Privacy vs efficiency tradeoff; configurable |

---

## 13. References

### Thesis Documents
- **THESIS_01_EXCLUSION.md**: Technical barriers (bandwidth, storage) as commitment filters; explicit hardware requirements
- **THESIS_05_GROWTH.md**: Organic growth, sustainability over scale, bootstrap without manipulation

### Vision Document
- **VISION.md**: Zero infrastructure; every client is a node; users ARE the infrastructure; mobile as full participant; fork-aware networking; state-level threat model

### Related Specifications
- **SPEC_01_IDENTITY.md**: Ed25519 identity for node authentication
- **SPEC_02_CONTENT_DECAY.md**: Decay bounds sync requirements
- **SPEC_03_PROOF_OF_WORK.md**: PoW validation for received content
- **SPEC_05_FORKS_CONSENSUS.md**: Fork-specific peer discovery
- **SPEC_07_CONTENT_DISTRIBUTION.md**: BitTorrent-like content blob retrieval (NEW)

### External References
- Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System.
- Maymounkov, P. & Mazieres, D. (2002). Kademlia: A Peer-to-peer Information System Based on the XOR Metric.
- Fanti, G. & Viswanath, P. (2017). Dandelion: Redesigning the Bitcoin Network for Anonymity.
- Perkins, T. & Zeledon, J. Noise Protocol Framework.
- BitTorrent Protocol Specification (BEP 5: DHT).

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-25 (v0.2.0 - Added two-layer sync model, SPEC_07 integration)*
*Status: DRAFT - Ready for review*

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2.3 | 2025-12-26 | Multi-Node Network testing implemented (Milestone 4.2): In-process simulation framework (TestNetwork), PartitionController, 54+ tests covering convergence, partition, propagation, and failure scenarios. Propagation timing: 10ms mesh, 50ms ring, 20ms star. NET-H03 validated. |
| 0.2.2 | 2025-12-25 | Gossip protocol implemented (Milestone 2.5): SeenCache, V-GOSSIP-01 to V-GOSSIP-05 validation, weighted peer selection, TTL-based forwarding, INV/GETDATA/DATA handlers. Phase 2 complete. |
| 0.2.1 | 2025-12-25 | Chain sync implemented (Milestone 2.4): header-first sync, continuous sync, fork detection, all V-SYNC rules |
| 0.2.0 | 2024-12-24 | Added two-layer sync model, SPEC_07 integration for content distribution |
| 0.1.0 | 2024-12-23 | Initial draft |

---

## Implementation Status

| Section | Status | Implementation |
|---------|--------|----------------|
| 4.1 Bootstrap | ✅ Implemented | `src/discovery/` - PeerStore, SeedEntry, DiscoveryManager |
| 4.1 Peer Exchange | ✅ Implemented | `src/discovery/addr_handler.rs`, `peer_exchange.rs` |
| 5.1-5.3 Wire Protocol | ✅ Implemented | `src/network/` - 22 message types, 46-byte envelope |
| 5.3 Handshake | ✅ Implemented | `src/transport/handshake.rs` - VERSION/VERACK |
| V-PEER-04 | ✅ Implemented | Max 1000 addresses per ADDR message |
| V-MSG-01 to V-MSG-06 | ✅ Implemented | Message validation rules |
| 4.2 Fork-Specific Discovery | Pending | DHT implementation (Phase 3+) |
| 4.3 Gossip Protocol | ✅ Implemented | `src/gossip/` - SeenCache, validation (V-GOSSIP-01 to V-GOSSIP-05), peer selection, INV/GETDATA/DATA handlers, TTL-based forwarding |
| 4.4-4.5 Chain Sync | ✅ Implemented | `src/sync/` - 13 files, header-first sync, continuous sync, fork detection |
| V-SYNC-01 to V-SYNC-06 | ✅ Implemented | All 6 sync validation rules in header_sync.rs, block_download.rs, request_tracker.rs |
| 4.6 Peer Scoring | Partial | Basic scoring in PeerStore |
| 4.7 NAT Traversal | Pending | Phase 3+ |
| **Multi-Node Testing** | ✅ Validated | `tests/network/` - 54+ tests: convergence (12), partition (11), propagation (17), failure (14). TestNetwork + PartitionController. 10ms/50ms/20ms propagation. |
| NET-H03 | ✅ Validated | Network continues if any single entity disappears (failure_tests.rs) |
