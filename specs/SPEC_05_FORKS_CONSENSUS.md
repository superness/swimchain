# Protocol Specification: Forks & Consensus System

## Status: DRAFT

## Version: 0.1.0

## 1. Overview

### 1.1 Purpose

The Forks & Consensus system defines how Swimchain communities split, reach agreement within splits, and maintain independent governance. Unlike traditional blockchain designs where forks represent failures to achieve consensus, Swimchain treats forks as **features**—the primary mechanism for community autonomy, governance evolution, and capture resistance.

This system provides:
- **Fork initiation**: How communities coordinate and execute chain splits
- **Intra-fork consensus**: How nodes within a fork agree on chain state
- **Fork identity**: How forks are uniquely identified and discovered
- **Cross-fork portability**: How identities and content bridge fork boundaries
- **Fork lineage**: How fork history and relationships are tracked

### 1.2 Design Principles

The following principles, derived from THESIS_03_FORKS.md and VISION.md, guide this specification:

1. **Exit as Power**: The credible threat of forking disciplines governance. Forks need not be frequent; they must be possible. "Platforms that know their users can leave must govern differently." (THESIS_03)

2. **Evolutionary Selection**: Different forks experiment with different parameters. Users migrate toward preferred governance. Successful innovations propagate through adoption. (THESIS_03)

3. **Capture Immunity**: State capture, corporate capture, and ideological capture are defeated by migration. The captured fork loses its community; the community continues elsewhere. (THESIS_03)

4. **Forks ARE Communities**: Rather than communities within a platform, each fork represents a community with shared values and rules. (VISION.md)

5. **Small Is Sustainable**: Fork viability doesn't require massive scale. A small committed community may provide more value than a large captured platform. (THESIS_05)

6. **Zero Exit Cost**: Fork migration preserves identity, history, and social graph. The only cost is the coordination to decide. (THESIS_03)

7. **No Global Consensus**: Consensus exists only within forks. There is no cross-fork agreement required or possible. (VISION.md)

8. **Active User Assumption**: Fork migration assumes active users who recognize capture and coordinate departure. The system protects participants, not passive consumers. (VISION.md)

### 1.3 Scope

**In scope:**
- Fork initiation mechanisms and triggers
- Consensus protocol for intra-fork agreement
- Fork identity and discovery
- Peer discovery per fork
- Fork history and lineage tracking
- Cross-fork identity portability
- Content bridging between forks
- Fork parameter governance
- Exclusion mechanisms at fork creation

**Out of scope:**
- Specific governance voting mechanisms (community choice)
- Content moderation policies (fork-specific)
- Client UI for fork management (implementation detail)
- Economic incentives for fork participation (no tokenomics)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

| ID | Requirement | Source |
|----|-------------|--------|
| FK-H01 | Fork migration MUST preserve identity—same keypair works on all forks | THESIS_03 |
| FK-H02 | Fork migration MUST preserve full chain history up to fork point | THESIS_03 |
| FK-H03 | Fork migration MUST preserve social graph (via identity persistence) | THESIS_03 |
| FK-H04 | No global consensus MUST be required—consensus only within forks | VISION.md |
| FK-H05 | A new fork MUST be able to exclude specific identities at protocol level | VISION.md, THESIS_03 |
| FK-H06 | Forks MUST be able to adjust parameters (PoW difficulty, decay, etc.) | VISION.md |
| FK-H07 | No central authority MUST be required for fork creation or operation | VISION.md |
| FK-H08 | Exit cost MUST approach zero (except coordination decision itself) | THESIS_03 |
| FK-H09 | Each fork MUST have a unique, cryptographically-derived identifier | Protocol requirement |
| FK-H10 | Fork lineage MUST be cryptographically verifiable | VISION.md |
| FK-H11 | Intra-fork consensus MUST be achievable without global coordination | VISION.md |

### 2.2 Soft Constraints (SHOULD)

| ID | Requirement | Source |
|----|-------------|--------|
| FK-S01 | Fork friction SHOULD discourage trivial forks while permitting serious ones | THESIS_03 |
| FK-S02 | Cross-fork identity verification SHOULD be possible | THESIS_03 |
| FK-S03 | Cross-fork content bridges SHOULD enable discovery across boundaries | THESIS_03 |
| FK-S04 | Fork lineage/history SHOULD be trackable for migration decisions | VISION.md |
| FK-S05 | Selective content inheritance SHOULD be possible when forking | VISION.md |
| FK-S06 | Users SHOULD be able to maintain presence across multiple forks | THESIS_03 |
| FK-S07 | Fork friction MAY include waiting periods or supermajority requirements | THESIS_03 |
| FK-S08 | Fork discovery SHOULD work without centralized registries | VISION.md |

### 2.3 Anti-Patterns (MUST NOT)

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| FK-A01 | MUST NOT require global consensus across forks | THESIS_03 |
| FK-A02 | MUST NOT create lock-in preventing migration | THESIS_03 |
| FK-A03 | MUST NOT make forking so trivial it happens at every disagreement | THESIS_03 |
| FK-A04 | MUST NOT allow forks to invalidate identities from other forks | THESIS_03 |
| FK-A05 | MUST NOT require central registry of forks | VISION.md |
| FK-A06 | MUST NOT create mega-nodes that become fork authorities | VISION.md |
| FK-A07 | MUST NOT optimize for fork count or size as metrics | THESIS_05 |
| FK-A08 | MUST NOT allow retroactive history modification after fork | Protocol integrity |

---

## 3. Data Structures

### 3.1 ForkIdentifier

```
ForkIdentifier {
    fork_hash:     [u8; 32]    // SHA-256 of genesis block header
}
```

**Fields:**
- `fork_hash`: A unique identifier derived from the fork's genesis block. This is the canonical name of the fork.

**Invariants:**
- fork_hash MUST be computed as SHA-256 of the serialized GenesisBlock
- fork_hash is immutable once the fork exists
- Two forks with identical genesis blocks are the same fork

### 3.2 GenesisBlock

```
GenesisBlock {
    version:           u8                      // Genesis format version (currently 1)
    parent_fork:       Option<ForkIdentifier>  // Parent fork (None for primordial)
    parent_height:     Option<u64>             // Block height at fork point
    parent_block_hash: Option<[u8; 32]>        // Hash of parent block at fork
    fork_timestamp:    u64                     // Unix timestamp of fork creation
    fork_name:         [u8; 64]                // Human-readable name (UTF-8, null-padded)
    fork_description:  [u8; 256]               // Description (UTF-8, null-padded)
    config:            ForkConfig              // Fork parameters
    excluded_ids:      Vec<IdentityID>         // Identities excluded from this fork
    included_content:  ContentSelector         // What content to inherit
    creator_signature: SignatureEnvelope       // Signature by fork creator
    supporter_sigs:    Vec<SignatureEnvelope>  // Signatures from supporting identities
}
```

**Fields:**
- `version`: Format version for future extensibility
- `parent_fork`: If this is a child fork, the identifier of the parent
- `parent_height`: The block height in the parent chain where the fork occurred
- `parent_block_hash`: Hash of the specific parent block being forked from
- `fork_timestamp`: When the fork was created
- `fork_name`: Human-readable fork name (max 64 UTF-8 bytes)
- `fork_description`: Description of fork purpose (max 256 UTF-8 bytes)
- `config`: Fork-specific parameters (see ForkConfig)
- `excluded_ids`: List of identities barred from participating in this fork
- `included_content`: Selector for what parent content to inherit
- `creator_signature`: Signature from the identity initiating the fork
- `supporter_sigs`: Additional signatures from identities supporting the fork

**Invariants:**
- If `parent_fork` is Some, `parent_height` and `parent_block_hash` MUST also be Some
- `fork_timestamp` MUST be after parent block timestamp (if parent exists)
- `creator_signature` MUST be valid Ed25519 signature over genesis fields
- Each `supporter_sigs` entry MUST be a valid signature over genesis fields

### 3.3 ForkConfig

```
ForkConfig {
    pow_config:        PoWConfig               // Proof-of-work parameters
    decay_config:      DecayConfig             // Content decay parameters
    consensus_config:  ConsensusConfig         // Consensus parameters
    space_creation:    SpaceCreationRules      // Rules for creating spaces
    min_supporters:    u16                     // Minimum fork supporters required
    fork_cooldown:     u64                     // Seconds before subfork allowed
}

PoWConfig {
    algorithm:         u8                      // 0x01 = Argon2id
    memory_kib:        u32                     // Memory parameter
    iterations:        u32                     // Time parameter
    parallelism:       u8                      // Thread parameter
    difficulties:      [u8; 8]                 // Per-action difficulties
}

DecayConfig {
    base_halflife:     u64                     // Seconds until 50% decay
    interaction_boost: u64                     // Seconds added per interaction
    min_lifetime:      u64                     // Minimum content lifetime
    max_lifetime:      u64                     // Maximum content lifetime
}

ConsensusConfig {
    block_interval:    u64                     // Target seconds between blocks
    difficulty_adj:    u64                     // Blocks between difficulty adjustments
    max_block_size:    u32                     // Maximum block size in bytes
    finality_depth:    u16                     // Blocks until considered final
}
```

**Invariants:**
- All PoW memory values MUST be >= 32768 KiB (32 MiB minimum for ASIC resistance)
- `block_interval` MUST be >= 60 seconds (prevents race conditions)
- `finality_depth` MUST be >= 6 blocks
- `min_supporters` MUST be >= 1 (creator counts as first supporter)

### 3.4 ContentSelector

```
ContentSelector {
    mode:           ContentMode                // Selection mode
    space_filter:   Option<Vec<SpaceID>>       // Specific spaces to include
    time_filter:    Option<TimeRange>          // Time range to include
    identity_filter: Option<Vec<IdentityID>>   // Specific identities' content
}

enum ContentMode {
    All,                                       // Include all parent content
    None,                                      // Fresh start, no content
    Selective,                                 // Use filters below
}

TimeRange {
    start:  Option<u64>                        // Unix timestamp start
    end:    Option<u64>                        // Unix timestamp end
}
```

**Purpose:** Allows forks to selectively inherit content from parent chain.

### 3.5 Block

```
Block {
    header:     BlockHeader
    content:    Vec<SignedContent>             // Posts, replies, reactions
    metadata:   Vec<IdentityMetadata>          // Identity updates
}

BlockHeader {
    version:        u8                         // Block format version
    fork_id:        ForkIdentifier             // Which fork this block belongs to
    height:         u64                        // Block number in this fork
    prev_hash:      [u8; 32]                   // Hash of previous block
    content_root:   [u8; 32]                   // Merkle root of content
    state_root:     [u8; 32]                   // Merkle root of chain state
    timestamp:      u64                        // Block creation time
    producer:       IdentityID                 // Block producer identity
    nonce:          u64                        // PoW nonce
    pow_hash:       [u8; 32]                   // Resulting PoW hash
    signature:      [u8; 64]                   // Producer signature
}
```

**Invariants:**
- `prev_hash` MUST equal SHA-256 of previous block header (or genesis for height 0)
- `content_root` MUST be valid Merkle root of block contents
- `timestamp` MUST be > previous block timestamp
- `pow_hash` MUST meet current difficulty target
- `signature` MUST be valid Ed25519 signature by `producer` over unsigned header

### 3.6 ForkAnnouncement

```
ForkAnnouncement {
    genesis:        GenesisBlock               // The new fork's genesis
    bootstrap_peers: Vec<PeerAddress>          // Initial peers for discovery
    announcement_ts: u64                       // When announced
    announcer:      IdentityID                 // Who is announcing
    signature:      [u8; 64]                   // Signature over announcement
}

PeerAddress {
    transport:  TransportType                  // TCP, UDP, Tor, etc.
    address:    [u8; 64]                       // Address bytes (format per transport)
    port:       u16                            // Port number
}

enum TransportType {
    TCPv4 = 0x01,
    TCPv6 = 0x02,
    Tor   = 0x03,
    I2P   = 0x04,
}
```

**Purpose:** How new forks are announced to the network for discovery.

### 3.7 ForkLineage

```
ForkLineage {
    fork_id:        ForkIdentifier
    parent:         Option<ForkIdentifier>
    children:       Vec<ForkIdentifier>
    fork_height:    Option<u64>                // Height at which parent forked
    known_since:    u64                        // When this node learned of fork
}
```

**Purpose:** Tracks family tree of forks for navigation and discovery.

### 3.8 CrossForkProof

```
CrossForkProof {
    identity:       IdentityID                 // The identity being proven
    fork_a:         ForkIdentifier             // First fork
    fork_b:         ForkIdentifier             // Second fork
    challenge:      [u8; 32]                   // Random challenge
    timestamp:      u64                        // Proof creation time
    signature:      [u8; 64]                   // Signature over (fork_a || fork_b || challenge || timestamp)
}
```

**Purpose:** Proves same identity controls accounts on multiple forks.

---

## 4. Algorithms

### 4.1 Fork Creation

**Purpose:** Create a new fork from an existing chain.

**Input:**
- `parent_chain`: ChainState of parent fork
- `creator`: Identity initiating fork
- `config`: Desired ForkConfig
- `excluded`: List of identities to exclude
- `content_selector`: What content to inherit
- `supporters`: List of identities supporting fork

**Output:**
- `GenesisBlock`: The new fork's genesis block
- `ForkIdentifier`: Unique identifier for the fork

**Steps:**
1. Validate `creator` exists in parent chain
2. Validate all `supporters` exist in parent chain
3. Validate `min_supporters` threshold from parent config is met
4. Validate fork cooldown period has passed (if applicable)
5. Construct genesis block with current parent head as fork point
6. Sign genesis with creator's key
7. Collect supporter signatures
8. Compute fork_hash as SHA-256 of serialized genesis
9. Begin block production on new fork

```
function create_fork(
    parent_chain: ChainState,
    creator: Identity,
    config: ForkConfig,
    excluded: Vec<IdentityID>,
    content_selector: ContentSelector,
    supporters: Vec<Identity>
) -> Result<(GenesisBlock, ForkIdentifier), Error> {

    // Validate creator exists
    if !parent_chain.has_identity(creator.public_key) {
        return Err(Error::CreatorNotFound)
    }

    // Validate supporters exist and aren't excluded
    for supporter in supporters {
        if !parent_chain.has_identity(supporter.public_key) {
            return Err(Error::SupporterNotFound)
        }
        if excluded.contains(supporter.public_key) {
            return Err(Error::SupporterExcluded)
        }
    }

    // Check minimum supporters
    let total_support = 1 + supporters.len()  // Creator + supporters
    if total_support < parent_chain.config.min_supporters as usize {
        return Err(Error::InsufficientSupport)
    }

    // Check cooldown
    let parent_age = current_time() - parent_chain.genesis.fork_timestamp
    if parent_age < parent_chain.config.fork_cooldown {
        return Err(Error::CooldownNotExpired)
    }

    // Build genesis
    let parent_head = parent_chain.head()
    let genesis = GenesisBlock {
        version: 1,
        parent_fork: Some(parent_chain.fork_id),
        parent_height: Some(parent_head.height),
        parent_block_hash: Some(hash(parent_head)),
        fork_timestamp: current_time(),
        fork_name: config.name,
        fork_description: config.description,
        config: config,
        excluded_ids: excluded,
        included_content: content_selector,
        creator_signature: sign(creator, genesis_unsigned()),
        supporter_sigs: supporters.map(|s| sign(s, genesis_unsigned())),
    }

    let fork_id = ForkIdentifier {
        fork_hash: sha256(serialize(genesis))
    }

    return Ok((genesis, fork_id))
}
```

**Complexity:** O(n) where n is number of supporters

**Edge Cases:**
- Creator attempts to exclude themselves: Allow (creator forfeits participation)
- Zero supporters beyond creator: Allowed if parent's min_supporters is 1
- Excluded identity is also a supporter: Error

### 4.2 Fork Validation

**Purpose:** Validate a received fork genesis is legitimate.

**Input:**
- `genesis`: GenesisBlock to validate
- `known_chains`: Map of known ForkIdentifier -> ChainState

**Output:**
- `bool`: True if valid

**Steps:**
1. Verify genesis version is supported
2. If parent_fork present, verify parent exists and is known
3. Verify parent_block_hash matches actual block at parent_height
4. Verify fork_timestamp is after parent block timestamp
5. Verify all signatures are valid
6. Verify config parameters are within allowed ranges
7. Verify excluded_ids don't include creator or supporters
8. Verify supporter count meets parent's minimum

```
function validate_genesis(
    genesis: GenesisBlock,
    known_chains: Map<ForkIdentifier, ChainState>
) -> bool {

    // Version check
    if genesis.version > CURRENT_VERSION {
        return false
    }

    // Parent validation
    if let Some(parent_id) = genesis.parent_fork {
        let parent = known_chains.get(parent_id)?
        let parent_block = parent.block_at(genesis.parent_height?)?

        if hash(parent_block) != genesis.parent_block_hash? {
            return false
        }

        if genesis.fork_timestamp <= parent_block.timestamp {
            return false
        }
    }

    // Signature validation
    let unsigned = genesis_without_signatures(genesis)

    if !verify_signature(
        genesis.creator_signature,
        unsigned,
        genesis.creator_signature.signer
    ) {
        return false
    }

    for sig in genesis.supporter_sigs {
        if !verify_signature(sig, unsigned, sig.signer) {
            return false
        }
    }

    // Config validation
    if !validate_config(genesis.config) {
        return false
    }

    // Exclusion validation
    if genesis.excluded_ids.contains(genesis.creator_signature.signer) {
        return false
    }

    for sig in genesis.supporter_sigs {
        if genesis.excluded_ids.contains(sig.signer) {
            return false
        }
    }

    return true
}
```

**Complexity:** O(s + e) where s is supporters, e is excluded identities

### 4.3 Intra-Fork Consensus

**Purpose:** Achieve agreement on block ordering within a single fork.

Swimchain uses **Proof-of-Work Longest Chain** consensus, similar to Bitcoin but with key differences:
- PoW serves as friction/commitment, not mining reward
- No financial incentive for block production
- Block producers are contributing to community, not mining profit
- Lower difficulty acceptable (social network, not financial system)

**Algorithm: Block Selection**

```
function select_chain_tip(
    candidates: Vec<BlockHeader>,
    current_tip: BlockHeader
) -> BlockHeader {

    // Filter valid candidates
    let valid = candidates.filter(|b| validate_block(b))

    // Find highest cumulative work
    let best = valid.max_by(|a, b|
        cumulative_work(a).cmp(cumulative_work(b))
    )

    // If tie, prefer lower block hash (deterministic)
    if cumulative_work(best) == cumulative_work(current_tip) {
        if hash(best) < hash(current_tip) {
            return best
        }
        return current_tip
    }

    if cumulative_work(best) > cumulative_work(current_tip) {
        return best
    }

    return current_tip
}

function cumulative_work(block: BlockHeader) -> u256 {
    // Work = sum of 2^difficulty for all blocks in chain
    let mut work = 0
    let mut current = block
    while current.height > 0 {
        work += 2_u256.pow(leading_zeros(current.pow_hash))
        current = get_parent(current)
    }
    return work
}
```

**Finality:**
Blocks are considered final after `finality_depth` confirmations (default: 6 blocks). Before finality:
- Reorganizations are possible
- Content should be considered tentative
- Clients SHOULD indicate unconfirmed status

### 4.4 Block Production

**Purpose:** Create new blocks for the fork.

**Input:**
- `chain_state`: Current chain state
- `pending_content`: Content waiting to be included
- `producer`: Identity producing the block

**Output:**
- `Block`: New valid block

```
function produce_block(
    chain_state: ChainState,
    pending_content: Vec<SignedContent>,
    producer: Identity
) -> Block {

    let prev = chain_state.head()

    // Select content that fits in block
    let selected = select_content(
        pending_content,
        chain_state.config.max_block_size
    )

    // Build Merkle trees
    let content_root = merkle_root(selected.content)
    let state_root = compute_state_root(chain_state, selected)

    // Build unsigned header
    let header = BlockHeader {
        version: 1,
        fork_id: chain_state.fork_id,
        height: prev.height + 1,
        prev_hash: hash(prev),
        content_root: content_root,
        state_root: state_root,
        timestamp: current_time(),
        producer: producer.public_key,
        nonce: 0,
        pow_hash: [0; 32],
        signature: [0; 64],
    }

    // Perform PoW
    let (nonce, pow_hash) = compute_block_pow(header, chain_state.config)
    header.nonce = nonce
    header.pow_hash = pow_hash

    // Sign
    header.signature = sign(producer, header_without_sig(header))

    return Block {
        header: header,
        content: selected.content,
        metadata: selected.metadata,
    }
}
```

**Block Production Incentive:**
Unlike Bitcoin, there is no block reward. Block production is a community service:
- Active community members produce blocks
- Blocks require PoW to prevent spam blocks
- Any identity can produce blocks
- No mining pools or professional mining expected

### 4.5 Peer Discovery per Fork

**Purpose:** Find peers participating in a specific fork.

Swimchain uses a **Kademlia-style DHT** with fork-specific keyspaces.

**DHT Key Structure:**
```
dht_key = SHA-256(fork_id || "peers" || random_id)
```

**Discovery Algorithm:**

```
function discover_fork_peers(
    fork_id: ForkIdentifier,
    bootstrap: Vec<PeerAddress>
) -> Vec<PeerAddress> {

    // Generate lookup keys
    let keys = (0..8).map(|i|
        sha256(fork_id.fork_hash || "peers" || random_bytes(8))
    )

    let mut peers = HashSet::new()

    // Bootstrap from known peers
    for addr in bootstrap {
        let result = dht_lookup(addr, keys[0])
        peers.extend(result.peers)
    }

    // Iterative lookup
    for key in keys {
        let closest = dht_find_node(key, peers)
        let result = dht_get_value(key, closest)
        peers.extend(result.peers)
    }

    // Filter to peers actually serving this fork
    return peers.filter(|p| ping_fork(p, fork_id))
}

function announce_fork_presence(
    fork_id: ForkIdentifier,
    my_address: PeerAddress
) {
    let keys = generate_announcement_keys(fork_id)

    for key in keys {
        let closest = dht_find_node(key)
        for peer in closest {
            dht_store(peer, key, ForkPeerRecord {
                fork_id: fork_id,
                address: my_address,
                timestamp: current_time(),
            })
        }
    }
}
```

**Bootstrap Mechanism:**
- Genesis blocks include initial bootstrap peers
- Fork announcements include discoverer addresses
- Well-known community endpoints can be hardcoded (not required)

### 4.6 Cross-Fork Identity Verification

**Purpose:** Prove same identity controls accounts on multiple forks.

**Input:**
- `identity`: Identity to prove
- `fork_a`, `fork_b`: The two forks
- `challenge`: Random bytes from verifier

**Output:**
- `CrossForkProof`: Proof of cross-fork identity

```
function create_cross_fork_proof(
    identity: Identity,
    fork_a: ForkIdentifier,
    fork_b: ForkIdentifier,
    challenge: [u8; 32]
) -> CrossForkProof {

    let timestamp = current_time()
    let message = fork_a.fork_hash
        || fork_b.fork_hash
        || challenge
        || u64_to_le(timestamp)

    let signature = ed25519_sign(identity.private_key, message)

    return CrossForkProof {
        identity: identity.public_key,
        fork_a: fork_a,
        fork_b: fork_b,
        challenge: challenge,
        timestamp: timestamp,
        signature: signature,
    }
}

function verify_cross_fork_proof(
    proof: CrossForkProof
) -> bool {
    let message = proof.fork_a.fork_hash
        || proof.fork_b.fork_hash
        || proof.challenge
        || u64_to_le(proof.timestamp)

    return ed25519_verify(proof.identity, message, proof.signature)
}
```

**Use Cases:**
- Proving reputation portability
- Linking content across forks
- Establishing trust based on other-fork history

### 4.7 Content Inheritance

**Purpose:** Determine what content migrates to a new fork.

**Input:**
- `parent_chain`: Parent chain state
- `selector`: ContentSelector from genesis
- `excluded_ids`: Identities excluded from fork

**Output:**
- `Vec<SignedContent>`: Content to include in child fork

```
function inherit_content(
    parent_chain: ChainState,
    selector: ContentSelector,
    excluded_ids: Vec<IdentityID>
) -> Vec<SignedContent> {

    match selector.mode {
        ContentMode::None => {
            return vec![]
        }

        ContentMode::All => {
            return parent_chain.all_content()
                .filter(|c| !excluded_ids.contains(c.author))
                .collect()
        }

        ContentMode::Selective => {
            let mut content = parent_chain.all_content()

            // Apply space filter
            if let Some(spaces) = selector.space_filter {
                content = content.filter(|c| spaces.contains(c.space))
            }

            // Apply time filter
            if let Some(range) = selector.time_filter {
                content = content.filter(|c| {
                    (range.start.is_none() || c.timestamp >= range.start.unwrap())
                    && (range.end.is_none() || c.timestamp <= range.end.unwrap())
                })
            }

            // Apply identity filter
            if let Some(ids) = selector.identity_filter {
                content = content.filter(|c| ids.contains(c.author))
            }

            // Always exclude excluded identities
            content = content.filter(|c| !excluded_ids.contains(c.author))

            return content.collect()
        }
    }
}
```

**Complexity:** O(n) where n is parent content count

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x50 | FORK_ANNOUNCE | Announce new fork existence |
| 0x51 | FORK_QUERY | Request fork information |
| 0x52 | FORK_INFO | Fork information response |
| 0x53 | FORK_PEERS | Request/response for fork peers |
| 0x54 | BLOCK_ANNOUNCE | Announce new block |
| 0x55 | BLOCK_REQUEST | Request specific block |
| 0x56 | BLOCK_RESPONSE | Block data response |
| 0x57 | CHAIN_STATUS | Current chain tip status |
| 0x58 | CROSSFORK_PROOF | Cross-fork identity proof |

### 5.2 Message Formats

**Byte Order:** All multi-byte integers are **little-endian** unless specified.

#### 5.2.1 FORK_ANNOUNCE (0x50)

```
[1 byte: type (0x50)]
[4 bytes: genesis_length (u32)]
[N bytes: serialized GenesisBlock]
[2 bytes: peer_count (u16)]
[M * 68 bytes: PeerAddress array]
[8 bytes: timestamp (u64)]
[32 bytes: announcer identity]
[64 bytes: signature]
```

#### 5.2.2 FORK_QUERY (0x51)

```
[1 byte: type (0x51)]
[32 bytes: fork_id query (or zeros for "all known")]
[1 byte: query_flags]
    - 0x01: include genesis
    - 0x02: include config
    - 0x04: include peer list
    - 0x08: include lineage
```

#### 5.2.3 FORK_INFO (0x52)

```
[1 byte: type (0x52)]
[32 bytes: fork_id]
[1 byte: info_flags (what's included)]
[variable: GenesisBlock if flag 0x01]
[variable: ForkConfig if flag 0x02]
[variable: peer list if flag 0x04]
[variable: ForkLineage if flag 0x08]
```

#### 5.2.4 BLOCK_ANNOUNCE (0x54)

```
[1 byte: type (0x54)]
[32 bytes: fork_id]
[8 bytes: block height (u64)]
[32 bytes: block hash]
[8 bytes: timestamp (u64)]
[32 bytes: producer identity]
```

#### 5.2.5 BLOCK_REQUEST (0x55)

```
[1 byte: type (0x55)]
[32 bytes: fork_id]
[1 byte: request_type]
    - 0x01: by hash
    - 0x02: by height
    - 0x03: range by height
[32 bytes or 8 bytes: hash or height]
[8 bytes: count (for range, else 0)]
```

#### 5.2.6 BLOCK_RESPONSE (0x56)

```
[1 byte: type (0x56)]
[32 bytes: fork_id]
[2 bytes: block_count (u16)]
[for each block:
    [4 bytes: block_length (u32)]
    [N bytes: serialized Block]
]
```

#### 5.2.7 CHAIN_STATUS (0x57)

```
[1 byte: type (0x57)]
[32 bytes: fork_id]
[8 bytes: height (u64)]
[32 bytes: tip hash]
[8 bytes: cumulative_work (u64, approximation)]
[4 bytes: pending_content_count (u32)]
```

---

## 6. Validation Rules

### 6.1 Genesis Validation

- `V-GEN-01`: Version MUST be <= current supported version
- `V-GEN-02`: If parent_fork present, parent MUST be known and valid
- `V-GEN-03`: parent_block_hash MUST match actual block at parent_height
- `V-GEN-04`: fork_timestamp MUST be > parent block timestamp
- `V-GEN-05`: fork_timestamp MUST NOT be > current_time + 300 seconds
- `V-GEN-06`: creator_signature MUST be valid for genesis content
- `V-GEN-07`: All supporter_sigs MUST be valid for genesis content
- `V-GEN-08`: Total supporters MUST meet parent's min_supporters
- `V-GEN-09`: No excluded_id MAY be creator or supporter
- `V-GEN-10`: Config parameters MUST be within allowed ranges

### 6.2 Block Validation

- `V-BLK-01`: fork_id MUST match the chain being extended
- `V-BLK-02`: height MUST equal parent height + 1
- `V-BLK-03`: prev_hash MUST equal SHA-256 of parent header
- `V-BLK-04`: timestamp MUST be > parent timestamp
- `V-BLK-05`: timestamp MUST NOT be > current_time + 300 seconds
- `V-BLK-06`: content_root MUST be valid Merkle root of contents
- `V-BLK-07`: pow_hash MUST meet difficulty target
- `V-BLK-08`: signature MUST be valid Ed25519 by producer
- `V-BLK-09`: producer MUST NOT be in fork's excluded_ids
- `V-BLK-10`: All content MUST have valid PoW and signatures

### 6.3 Fork Config Validation

- `V-CFG-01`: pow_config.memory_kib MUST be >= 32768 (32 MiB)
- `V-CFG-02`: consensus_config.block_interval MUST be >= 60 seconds
- `V-CFG-03`: consensus_config.finality_depth MUST be >= 6
- `V-CFG-04`: All difficulty values MUST be > 0
- `V-CFG-05`: decay_config.min_lifetime MUST be <= decay_config.max_lifetime

### 6.4 Exclusion Validation

- `V-EXC-01`: Excluded identities CANNOT produce blocks
- `V-EXC-02`: Excluded identities' content MUST be rejected
- `V-EXC-03`: Exclusion is checked at content validation, not discovery
- `V-EXC-04`: Exclusion list is immutable after genesis

---

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Description | Severity |
|--------|-------------|----------|
| TH-FK-01 | 51% attack on single fork | High |
| TH-FK-02 | Genesis spoofing | Medium |
| TH-FK-03 | Fork announcement spam | Medium |
| TH-FK-04 | Peer discovery poisoning | Medium |
| TH-FK-05 | Eclipse attack (isolation) | High |
| TH-FK-06 | Selfish block withholding | Low |
| TH-FK-07 | Long-range reorg attack | Medium |
| TH-FK-08 | Excluded identity circumvention | Low |

### 7.2 Mitigations

**TH-FK-01 (51% Attack):**
The primary defense is fork migration:
- Community recognizes capture (requires active users)
- Community coordinates fork to new chain
- New fork excludes attacker identities
- Attacker "wins" an abandoned chain
- Attack becomes economically irrational

This is the core design principle: 51% attacks are survivable because communities can leave.

**TH-FK-02 (Genesis Spoofing):**
- Genesis hash is deterministic from content
- Signatures from known identities required
- Clients verify supporter signatures against known identities
- Parent chain reference allows verification

**TH-FK-03 (Fork Announcement Spam):**
- Fork creation requires PoW (supporter signatures constitute commitment)
- Minimum supporter threshold limits frivolous forks
- Cooldown period prevents rapid fork cycling
- Nodes can rate-limit fork announcements per source

**TH-FK-04 (Peer Discovery Poisoning):**
- DHT nodes verify fork membership before listing
- Clients verify peers actually serve claimed fork
- Multiple DHT lookups with different keys
- Cross-reference with bootstrap peers

**TH-FK-05 (Eclipse Attack):**
- Maintain diverse peer connections
- Periodically query DHT for new peers
- Allow manual peer addition
- Monitor for anomalous network behavior

**TH-FK-06 (Selfish Block Withholding):**
- No financial reward eliminates primary incentive
- Community-oriented block production
- Multiple producers reduce impact
- Low severity: delays content, doesn't corrupt

**TH-FK-07 (Long-Range Reorg):**
- Finality depth (6 blocks default)
- Clients treat deep blocks as immutable
- Checkpointing for very old history
- Not critical: social network, not financial system

**TH-FK-08 (Excluded Identity Circumvention):**
- Excluded identity cannot create new identity with same key
- Creating new identity loses all reputation
- Social verification of identity continuity
- Acceptable risk: excludes key, not person

---

## 8. Privacy Considerations

### 8.1 What Is Exposed

- **Fork participation**: Which forks a node participates in is visible to peers
- **Block production**: Block producers are publicly identified
- **Content authorship**: All content is signed and attributable
- **Cross-fork linkage**: Same public key is linkable across forks (by design)
- **Fork announcement**: Fork creators and supporters are public

### 8.2 What Is Protected

- **Multi-identity usage**: Users can create separate identities per fork
- **Viewing behavior**: What users read is not on-chain
- **Client location**: IP address protection via Tor/I2P transport options
- **Fork browsing**: Querying fork information doesn't reveal intent to join

### 8.3 Privacy Recommendations

- Users who want fork-isolated identity SHOULD create new keypairs
- Nodes SHOULD support Tor/I2P transports for IP privacy
- Cross-fork proofs are opt-in; users control linkability
- Fork discovery queries should be batched/delayed for privacy

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency |
|-----------|------------|
| Identity (SPEC_01) | Fork participants are identities; signing uses Ed25519 |
| Proof-of-Work (SPEC_03) | Block PoW uses Argon2id; config inherits PoW params |
| Content/Decay (SPEC_02) | Inherited content subject to fork's decay rules |
| Spaces (SPEC_04) | Spaces exist within forks; content selector can filter by space |
| Network/Sync (SPEC_06) | Peer discovery, block propagation, sync protocol |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `create_fork()` | Initiate new fork from parent | Clients, governance tools |
| `validate_genesis()` | Verify fork legitimacy | All nodes |
| `select_chain_tip()` | Determine canonical chain | Consensus layer |
| `discover_fork_peers()` | Find participants | Network layer |
| `verify_cross_fork_proof()` | Validate identity linkage | Reputation systems |
| `inherit_content()` | Migrate content to child fork | Fork creation |

### 9.3 Cross-Fork Communication

Forks are independent but interoperable:
- **Identity**: Same keypair works on all forks
- **Content reference**: Content can reference content on other forks via (fork_id, content_hash)
- **Proof of identity**: CrossForkProof enables reputation portability
- **No cross-fork consensus**: Forks do not validate each other's chains

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Fork Detection:**
1. Monitor parent chain for fork announcements
2. Validate announcements before caching
3. Provide user notification of new forks
4. Allow joining/ignoring forks

**Chain Management:**
1. Store each fork's chain independently
2. Share identity data across forks (optional optimization)
3. Content storage can be fork-specific or shared (implementation choice)
4. Maintain fork lineage graph for UI navigation

**Sync Strategy:**
1. Full sync for primary forks
2. Header-only sync for discovered forks
3. Full sync on user request to join
4. Prune inactive forks after threshold

**Block Production:**
- Not all nodes need to produce blocks
- Producing nodes should have stable connectivity
- Rotation/selection can be informal (no protocol enforcement)
- GUI should make production opt-in

### 10.2 Known Challenges

**Challenge 1: Fork Discovery at Scale**
With many forks, discovery becomes complex. Mitigations:
- Hierarchical DHT structure
- Fork popularity/activity metrics
- Community-curated fork lists (non-authoritative)
- Follow-the-user: discover forks peers participate in

**Challenge 2: Storage Requirements**
Participating in many forks multiplies storage. Mitigations:
- Support pruned/archive modes
- Share common content across forks
- Allow dropping inactive fork data
- Cloud storage integration (optional, user choice)

**Challenge 3: Coordination for Forking**
Successful forks require social coordination. Protocol provides:
- Fork announcement mechanism
- Supporter signature collection
- Time for community deliberation (cooldown optional)
- Tools cannot force coordination; users must organize

**Challenge 4: Empty Fork Problem**
New forks start with few participants. Mitigations:
- Content inheritance brings history
- Cross-fork identity brings reputation
- Bootstrap peers enable discovery
- Accept: some forks will fail (evolutionary selection)

**Challenge 5: Excluded Identity Rejoining**
Excluded users can create new identities. This is acceptable:
- New identity has no reputation
- Social verification can identify bad actors
- Exclusion is key-based, not person-based
- Perfect exclusion is impossible and undesirable

---

## 11. Test Vectors

### 11.1 Fork Identifier Computation

**Input GenesisBlock (simplified):**
```
version: 1
parent_fork: None
fork_timestamp: 1703980800
fork_name: "TestFork" (null-padded to 64 bytes)
...
```

**Expected fork_hash:**
```
SHA-256(serialize(genesis)) = [computed hash]
```

*Note: Full serialization format defined in Section 4. Test implementations should verify against reference implementation.*

### 11.2 Block Validation

**Valid block:**
```
height: 100
prev_hash: [hash of block 99]
timestamp: block99.timestamp + 61
pow_hash: 0x00000abc... (meets difficulty)
```
Expected: VALID

**Invalid - wrong parent:**
```
height: 100
prev_hash: [hash of block 97]  // Wrong!
timestamp: block99.timestamp + 61
```
Expected: INVALID (V-BLK-03)

**Invalid - future timestamp:**
```
timestamp: current_time + 3600  // 1 hour in future
```
Expected: INVALID (V-BLK-05)

### 11.3 Cross-Fork Proof

**Input:**
```
identity: 0x0123456789abcdef...
fork_a: 0xaaaa...
fork_b: 0xbbbb...
challenge: 0xcccc...
timestamp: 1703980800
```

**Message to sign:**
```
0xaaaa... || 0xbbbb... || 0xcccc... || 0x00C2EB6500000000
```

**Verification:**
```
ed25519_verify(identity, message, signature) == true
```

### 11.4 Content Selector

**Selective mode test:**
```
selector = ContentSelector {
    mode: Selective,
    space_filter: Some(["space1", "space2"]),
    time_filter: Some(TimeRange { start: 1000, end: 2000 }),
    identity_filter: None,
}
excluded = ["bad_actor"]

Content A: space="space1", time=1500, author="user1" -> INCLUDED
Content B: space="space3", time=1500, author="user1" -> EXCLUDED (space)
Content C: space="space1", time=500, author="user1" -> EXCLUDED (time)
Content D: space="space1", time=1500, author="bad_actor" -> EXCLUDED (identity)
```

---

## 12. Open Questions

### 12.1 Resolved Questions

1. **Consensus mechanism**: Proof-of-Work longest chain. Not PoS because Swimchain has no staking token. Not BFT because no fixed validator set.

2. **Fork identifier**: SHA-256 of genesis block. Deterministic, unique, verifiable.

3. **Cross-fork identity**: Same keypair works everywhere. This is fundamental to zero exit cost.

### 12.2 Unresolved Questions

1. **Optimal fork friction**: What minimum supporter count and cooldown period discourages trivial forks while permitting serious ones?
   - Options: 3 supporters, 5 supporters, 10 supporters?
   - Options: 24-hour cooldown, 7-day cooldown, no cooldown?
   - May need experimentation to determine

2. **Fork governance evolution**: Can a fork change its config after genesis?
   - If yes: What's the governance mechanism?
   - If no: Forks must re-fork to change parameters
   - Current design: No post-genesis changes (fork to evolve)

3. **Pruning old forks**: When can nodes drop data for inactive forks?
   - Risk: Premature pruning loses history
   - Risk: No pruning leads to unbounded storage
   - Suggestion: Activity threshold + user override

4. **Fork naming collisions**: Fork names are not unique. Is this a problem?
   - fork_hash is unique; names are convenience only
   - Clients should always show fork_hash or abbreviation
   - Consider: fork naming registry (optional, non-authoritative)

5. **Minimum viable fork size**: How small can a fork be before network effects make it unsustainable?
   - Per THESIS_05: Small is acceptable if community is committed
   - Protocol doesn't enforce minimum; economics determine viability
   - May need UX patterns to show fork health indicators

6. **Content bridge protocols**: How do forks reference each other's content?
   - Cross-fork content addressing: (fork_id, content_hash)
   - Content fetching across forks: separate spec needed?
   - Deferred: May be client-level feature

7. **Reputation across forks**: Is reputation forked or shared?
   - Current design: Reputation is fork-specific
   - Cross-fork reputation: Via CrossForkProof + client interpretation
   - Community choice: Clients can weight cross-fork history differently

---

## 13. References

### Thesis Documents
- **THESIS_03_FORKS.md**: Fork migration as collective exit-right; evolutionary governance selection; capture immunity through exit
- **THESIS_05_GROWTH.md**: Rejecting growth imperative; small forks are sustainable; avoiding fork-count metrics

### Vision Document
- **VISION.md**: Fork-friendly ecosystem; forks as features; communities ARE forks; 51% attack immunity through migration; consensus only within forks

### Related Specifications
- **SPEC_01_IDENTITY.md**: Cryptographic identity that persists across forks
- **SPEC_02_CONTENT_DECAY.md**: Content decay parameters (fork-configurable)
- **SPEC_03_PROOF_OF_WORK.md**: PoW for block production and spam resistance
- **SPEC_04_SPACES.md**: Spaces exist within forks
- **SPEC_06_NETWORK_SYNC.md**: Network layer for peer discovery and sync

### Academic/Industry References
- Hirschman, A.O. (1970). *Exit, Voice, and Loyalty*. Harvard University Press.
- Tiebout, C. (1956). A Pure Theory of Local Expenditures. *Journal of Political Economy*.
- Bitcoin/Bitcoin Cash fork (2017) - community fork precedent
- Ethereum/Ethereum Classic fork (2016) - ideological fork precedent
- Hive/Steem fork (2020) - capture-triggered fork precedent
- Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System.

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2024-12-24*
*Status: DRAFT - Ready for review*
