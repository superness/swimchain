# Research Spike: Bootstrap & Peer Discovery

## Status: DRAFT

## Executive Summary

Bootstrap and peer discovery represent a fundamental challenge for Swimchain: how do nodes find each other without any central coordination? This research examines approaches ranging from highly centralized (hardcoded bootstrap nodes, DNS seeds) to fully decentralized (social/out-of-band bootstrap, local network discovery). For Swimchain's vision of true decentralization with no mega-nodes and explicit rejection of central authority, the optimal approach is a layered discovery system that prioritizes social and local mechanisms over infrastructure-dependent ones.

The primary recommendation is a **six-layer discovery stack**: (0) Cached peers from previous sessions, (1) Local network discovery via mDNS for zero-infrastructure LAN bootstrap, (2) Social graph bootstrap where the social network itself serves as the discovery mechanism through QR codes and direct peer exchange, (3) Community introduction points—well-known addresses with no protocol authority, (4) DHT-based discovery using Kademlia for scalable peer finding once initially connected, with sybil resistance through proof-of-work integration, (5) Peer exchange gossip. This approach aligns with Swimchain's thesis that "friction is intentional" and that organic, human-mediated growth is preferable to infrastructure-optimized growth.

**Key distinction (clarified December 2024):** We reject nodes with **protocol-level authority** (validation power, required for operation), but accept **well-known addresses** that simply help you find the network. A seed node is no different from a mobile phone that happens to be always connected—the only difference is you know its address in advance. DNS seeds remain rejected because they depend on ICANN infrastructure that can be seized or censored. Recent 2024 research on IPFS/libp2p DHT sybil vulnerabilities indicates that DHT discovery must be paired with proof-of-work or reputation mechanisms to prevent eclipse attacks during bootstrap—a natural fit for Swimchain's existing PoW requirements.

## Research Question

How does a new decentralized network start? How do nodes find each other without any central coordination?

## Context

Swimchain aims for true decentralization with no servers. This creates several bootstrap challenges:

- **First users need to find each other somehow** - The "first user problem" has no easy solution
- **New nodes need to discover existing peers** - Ongoing discovery must work at scale
- **Can't rely on a "mastodon.social" equivalent mega-node** - No privileged infrastructure
- **DNS and hardcoded IPs introduce centralization** - Traditional solutions violate core principles

### Relevant Theses
- **THESIS_01_EXCLUSION.md** - No mega-nodes that become de facto authorities
- **THESIS_05_GROWTH.md** - No growth imperative but need critical mass

### Relevant Specs
- **SPEC_06_NETWORK_SYNC.md** - Network layer design must integrate with discovery

## Prior Art Analysis

### Infrastructure-Dependent Bootstrap

#### Hardcoded Bootstrap Nodes (Bitcoin/Ethereum)

- **How it works**: Software ships with a list of known node IP addresses or domain names. New nodes connect to these hardcoded addresses to learn about other peers.
- **Decentralization**: Low. The hardcoded nodes become de facto authorities. Bitcoin uses ~10 DNS seeds; Ethereum maintains bootnodes.json with ~20 nodes.
- **Trust assumptions**: Trust that bootstrap node operators are honest, available, and not compromised. Trust that software updates will add/remove nodes appropriately.
- **Pros**: Simple to implement. Reliable—nodes are chosen for stability. Works immediately on first launch.
- **Cons**: Single point of failure for new nodes. Can be targeted for censorship or capture. Creates privileged node class. Requires software updates to change.
- **Real-world outcomes**: Works well for Bitcoin/Ethereum but creates ongoing dependency on bootstrap node operators. Several incidents of bootstrap nodes going offline.
- **Swimchain applicability**: **Nuanced.** The original concern was overstated. Hardcoded addresses become problematic only if they have protocol-level authority (validation power, required for operation). Well-known addresses that simply help you find the network are acceptable—see "Clarification: Seed Nodes vs. Authority Nodes" section below.

#### DNS Seeds

- **How it works**: DNS records (A/AAAA records) point to known network nodes. New nodes resolve DNS names to get IP addresses of peers.
- **Decentralization**: Low. Depends on ICANN-controlled DNS infrastructure. DNS seeds can be censored, seized, or poisoned.
- **Trust assumptions**: Trust DNS infrastructure. Trust seed operators to maintain accurate records. Trust DNSSEC if used.
- **Pros**: Leverages existing infrastructure. Dynamic—records can be updated without software changes. Familiar operational model.
- **Cons**: DNS is fundamentally centralized (ICANN root). Subject to government seizure and censorship. DNS poisoning attacks possible.
- **Real-world outcomes**: Bitcoin uses DNS seeds successfully in permissive jurisdictions. Subject to blocking in China and other restrictive regions.
- **Swimchain applicability**: **Incompatible.** Fundamentally depends on centralized infrastructure that can be captured.

### Distributed Hash Tables

#### BitTorrent Mainline DHT

- **How it works**: Kademlia-based DHT with XOR distance metric. Nodes maintain routing tables of peers at various "distances." Lookups traverse the network to find responsible nodes.
- **Decentralization**: High once connected. No privileged nodes—all peers are equal participants.
- **Trust assumptions**: Assumes honest majority of DHT participants. Vulnerable to sybil attacks where adversary creates many identities.
- **Pros**: Proven at massive scale (millions of nodes). Self-organizing. No central infrastructure required for ongoing operation.
- **Cons**: Still has bootstrap problem—need to know at least one node to join. Vulnerable to sybil and eclipse attacks. Churn (nodes joining/leaving) creates overhead.
- **Real-world outcomes**: Most successful decentralized discovery system in production. Handles millions of nodes reliably.
- **Swimchain applicability**: **Excellent for Layer 3** of discovery stack. Must solve initial bootstrap separately.

#### Kademlia Protocol

- **How it works**: XOR metric defines "distance" between node IDs. Each node maintains k-buckets of peers at logarithmic distance intervals. Lookups iteratively query closest known nodes.
- **Decentralization**: High. Mathematically elegant—no privileged positions.
- **Trust assumptions**: Node ID generation must be costly (to prevent sybil attacks). Assumes routing tables aren't poisoned.
- **Pros**: O(log n) lookup complexity. Self-healing—naturally replaces failed nodes. Well-understood formally.
- **Cons**: Complex to implement correctly. Eclipse attacks possible if node ID generation is cheap.
- **Real-world outcomes**: Foundation for BitTorrent, IPFS, Ethereum discovery, and many others.
- **Swimchain applicability**: **Strong candidate** for DHT protocol. Should pair with PoW node ID generation for sybil resistance.

#### IPFS/libp2p DHT

- **How it works**: Kademlia-based DHT with content addressing. Nodes store and retrieve data based on content hashes.
- **Decentralization**: High in theory. Recent research reveals vulnerabilities.
- **Trust assumptions**: Similar to Kademlia. Recent 2024 research shows active sybil attacks on IPFS DHT.
- **Pros**: Rich ecosystem (libp2p). Content-addressable. Active development.
- **Cons**: 2024 research papers document successful sybil attacks. Higher complexity than pure Kademlia. Heavy dependency on libp2p ecosystem.
- **Real-world outcomes**: Works but under active attack. IPFS team developing mitigations including proof-of-work node IDs.
- **Swimchain applicability**: **Usable with caution.** Must implement sybil resistance. Consider using Kademlia directly rather than full libp2p dependency.

### Local Network Discovery

#### mDNS/Bonjour

- **How it works**: Multicast DNS allows devices on the same local network to discover each other without any infrastructure. Nodes broadcast their presence and listen for others.
- **Decentralization**: Maximum. Zero infrastructure required. Works even without internet.
- **Trust assumptions**: Trust local network isn't adversarial. Limited trust—you only discover, not automatically connect.
- **Pros**: Zero configuration. No internet required. Works in disaster scenarios. Mature, widely supported.
- **Cons**: Limited to local network. Won't help first users in different locations.
- **Real-world outcomes**: Standard in Apple ecosystem. Used by many P2P applications for local discovery.
- **Swimchain applicability**: **Must include.** Perfect for Layer 1 of discovery stack. Should always be running.

#### SSDP (Simple Service Discovery Protocol)

- **How it works**: UDP-based discovery protocol used by UPnP. Devices announce services and discover others.
- **Decentralization**: High for local network.
- **Trust assumptions**: Similar to mDNS.
- **Pros**: Widely supported. Simple protocol.
- **Cons**: Less universal than mDNS. Primarily for device discovery rather than peer discovery.
- **Real-world outcomes**: Common in home networking (routers, media devices).
- **Swimchain applicability**: **Optional.** mDNS is preferred but SSDP could be fallback.

### Social/Out-of-Band Bootstrap

#### QR Codes and Direct Exchange

- **How it works**: Users share peer connection information (IP/port, public key, multiaddr) encoded in QR codes, links, or text. New users scan/click to connect to first peer.
- **Decentralization**: Maximum. No infrastructure at all. Human network is the discovery network.
- **Trust assumptions**: Trust the person sharing the QR code. This is usually desired—you're connecting to someone you know.
- **Pros**: Zero infrastructure. Friction is intentional—prevents bot spam. Social graph becomes discovery graph.
- **Cons**: Requires physical proximity or out-of-band channel. Slow to bootstrap. Not "just download and go."
- **Real-world outcomes**: Used by Signal for device linking. Briar for contact exchange. Matrix for verification.
- **Swimchain applicability**: **Perfect fit.** Embodies "friction is intentional" philosophy. Primary bootstrap for new users.

#### SSB Pubs and Rooms

- **How it works**: Scuttlebutt "pubs" are relay nodes that help peers discover each other. "Rooms" are lighter-weight—just facilitate introductions, don't store content.
- **Decentralization**: Medium. Pubs/rooms are semi-centralized but fungible—many can exist.
- **Trust assumptions**: Pub operators see who connects. Rooms just see connection metadata.
- **Pros**: Better UX than pure social bootstrap. Anyone can run a pub/room. Users can switch easily.
- **Cons**: Introduces infrastructure dependency. Pub operators have some power.
- **Real-world outcomes**: SSB community runs dozens of pubs. Works well for onboarding.
- **Swimchain applicability**: **Viable alternative** for communities wanting easier onboarding. Should not be required path.

#### Briar Contact Exchange

- **How it works**: Briar requires in-person QR code exchange to add contacts. No central servers involved. Connections can also use Tor.
- **Decentralization**: Maximum. Designed for activists and high-risk users.
- **Trust assumptions**: Trust only people you physically meet.
- **Pros**: Extreme security. No infrastructure to attack. Perfect for adversarial environments.
- **Cons**: Very high friction. Can't add contacts remotely without pre-shared secret.
- **Real-world outcomes**: Used by activists, journalists in hostile environments. Small but dedicated user base.
- **Swimchain applicability**: **Valuable model.** Swimchain's default should be Briar-style but with optional easier paths.

### Decentralized Naming Alternatives

#### ENS (Ethereum Name Service)

- **How it works**: Smart contracts on Ethereum provide DNS-like name resolution. Names resolve to Ethereum addresses, but can include arbitrary records.
- **Decentralization**: Medium. Decentralized name resolution but depends on Ethereum blockchain.
- **Trust assumptions**: Trust Ethereum consensus. Trust ENS contracts.
- **Pros**: Human-readable names. Censorship-resistant (as resistant as Ethereum).
- **Cons**: Requires Ethereum dependency. Gas costs for registration. Not censorship-resistant in all jurisdictions.
- **Real-world outcomes**: Popular for crypto identity. Growing ecosystem.
- **Swimchain applicability**: **Not recommended for core bootstrap.** Adds significant dependency. Could be optional for vanity addresses.

#### Handshake

- **How it works**: Blockchain-based alternative DNS root. Replaces ICANN at the root level.
- **Decentralization**: Medium. Decentralized root but still hierarchical structure.
- **Trust assumptions**: Trust Handshake consensus. Requires running Handshake node or trusting resolver.
- **Pros**: True DNS alternative. Censorship-resistant naming.
- **Cons**: Low adoption. Requires ecosystem support. Adds blockchain dependency.
- **Real-world outcomes**: Functional but limited adoption. Most users don't run Handshake resolvers.
- **Swimchain applicability**: **Not recommended.** Adds complexity without solving core bootstrap problem.

## Comparative Analysis

| Approach | Decentralization | Privacy | Scalability | Complexity | Maturity |
|----------|-----------------|---------|-------------|------------|----------|
| Hardcoded Bootstrap Nodes | Low | Low | High | Low | High |
| DNS Seeds | Low | Low | High | Low | High |
| BitTorrent/Kademlia DHT | High | Medium | High | High | High |
| IPFS/libp2p DHT | High | Medium | High | High | Medium |
| mDNS/Local Discovery | High | High | Low (local only) | Low | High |
| QR Code/Social Bootstrap | High | High | Low | Low | Medium |
| SSB Pubs/Rooms | Medium | Medium | Medium | Medium | Medium |
| ENS/Handshake | Medium | Low | Medium | High | Medium |
| Tor Directory Authorities | Low | High | High | Medium | High |

## Patterns Identified

### Pattern 1: The Bootstrap Paradox

Every decentralized discovery system faces the same fundamental problem: you need to know at least one peer to discover more peers. DHTs, gossip protocols, and peer exchange all require an initial connection. The only solutions are:

1. **Out-of-band bootstrap** (social, physical, pre-configured)
2. **Local discovery** (mDNS, Bluetooth—limited to physical proximity)
3. **Centralized assistance** (violates decentralization)

Swimchain must accept that the first connection requires human coordination.

### Pattern 2: Layered Discovery

Successful decentralized systems use multiple discovery methods in priority order:

1. **Local first** (mDNS, Bluetooth)
2. **Social second** (trusted contacts, out-of-band exchange)
3. **DHT third** (once connected, discover more peers)
4. **Fallback infrastructure** (optional, semi-centralized)

This provides resilience—if one method fails, others work.

### Pattern 3: Social Graph as Discovery Graph

For a social network, the social connections themselves can serve as the discovery mechanism. Following someone means learning their network address. The social graph and the network topology become aligned. This is a natural fit for Swimchain.

### Pattern 4: Friction as Feature

High-friction bootstrap (QR codes, physical meetups) is often seen as a UX problem to solve. But friction:

- Prevents bot/spam accounts
- Creates genuine social connections
- Ensures users understand what they're joining
- Aligns incentives with organic growth

Swimchain should embrace friction, not minimize it.

### Pattern 5: Sybil Resistance Requires Cost

Any discovery system where creating identities is free will be sybil-attacked. Solutions:

- **Proof-of-work** for node IDs (computational cost)
- **Social vouching** (reputation cost)
- **Stake** (financial cost—but creates plutocracy)

Swimchain's PoW requirements can extend to DHT node IDs for natural sybil resistance.

## Clarification: Seed Nodes vs. Authority Nodes

**Updated December 2024**: The original draft of this document conflated two distinct concepts that must be separated.

### The Critical Distinction

| Concept | What It Is | The Problem |
|---------|------------|-------------|
| **Authority Nodes** | Nodes with special protocol privileges | Creates power asymmetry, capture vector |
| **Seed Nodes** | Well-known addresses for initial peer discovery | Just information, no authority |

**A seed node is no different from a mobile phone that happens to be always connected.** The only difference is that you know its address in advance.

### What Makes Something "Centralization"?

The concern is **authority**, not **information**:

| Centralization Concern | Seed Nodes? |
|-----------------------|-------------|
| Controls block validity | ❌ No - any node validates |
| Can censor content | ❌ No - content flows peer-to-peer |
| Can exclude users | ❌ No - just tells you about other peers |
| Required for network function | ❌ No - once connected, never needed again |
| Has special protocol role | ❌ No - same software as any node |
| Can be replaced trivially | ✅ Yes - run your own, share alternatives |

**A website listing peer addresses is "infrastructure" in the same way a phone book is infrastructure.** It helps you find people; it doesn't control your conversations.

### Revised Position on Bootstrap Nodes

The original rejection of "hardcoded bootstrap nodes" was overly rigid. The actual concern is:

1. **REJECT**: Nodes with protocol-level authority (validation power, required for operation)
2. **ACCEPT**: Well-known addresses that help you find the network initially

### Practical Architecture: Community Introduction Points

```
WHAT THEY ARE
├── Stable addresses (domain or IP) that run Swimchain software
├── Published by community (website, README, social media)
├── Multiple independent operators (no single source)
├── Anyone can run one (no permission required)
├── Client caches discovered peers (reducing dependency)
└── Used ONLY for initial connection

WHAT THEY ARE NOT
├── Required by the protocol
├── Privileged in any way
├── Able to see/control content
├── Single points of failure (many exist)
├── Gatekeepers (open to all)
└── Different from any other always-on node
```

### Updated Discovery Stack

The four-layer model now becomes five layers:

1. **Layer 0: Cached Peers** - Client remembers peers from previous sessions
2. **Layer 1: mDNS Local Discovery** - Zero-infrastructure LAN discovery
3. **Layer 2: Social Graph Bootstrap** - QR codes, direct exchange, word-of-mouth
4. **Layer 3: Community Introduction Points** - Well-known addresses, multiple operators
5. **Layer 4: DHT Discovery (Kademlia)** - Once connected, discover more peers
6. **Layer 5: Peer Exchange Protocol** - Connected peers share their peer lists

**Layer 3 is the pragmatic addition** that solves the "scattered users who don't know each other" problem.

### Who Runs Introduction Points?

| Operator | Motivation | Trust Level |
|----------|------------|-------------|
| Project maintainers | Project success | Same as trusting the software |
| Community volunteers | Belief in project | Same as any peer |
| Organizations | Their community needs it | Depends on organization |
| Power users | Want to help | Same as any peer |

**The key insight**: Running an introduction point grants no power. It's like handing out business cards at a conference - helpful, but the card holder has no authority over subsequent relationships.

### Addressing Original Concerns

| Original Concern | Resolution |
|-----------------|------------|
| "Creates de facto authorities" | Only if they have protocol power - introduction points don't |
| "Can be targeted for censorship" | Multiple operators; anyone can run one; client caches peers |
| "Creates privileged node class" | No privilege - same software, same rules, no special treatment |
| "Single point of failure" | Design requires multiple independent operators |

### What Remains Rejected

| Approach | Still Rejected? | Why |
|----------|----------------|-----|
| DNS Seeds | ✅ Yes | Depends on ICANN infrastructure that can be seized |
| **Hardcoded Authority Nodes** | ✅ Yes | Protocol-level power creates capture vector |
| **Hardcoded Introduction Points** | ⚠️ Nuanced | Acceptable IF: multiple operators, no protocol privilege, community-maintained list |
| Temporary centralization | ✅ Yes | "We'll decentralize later" never happens |
| Required centralized servers | ✅ Yes | "Required" is the problem, not "available" |

---

## Approaches Incompatible with Swimchain

| Approach | Why Incompatible |
|----------|------------------|
| Authority Nodes with Protocol Power | Creates permanent central points of control. Nodes become de facto authorities that could be captured, censored, or used to eclipse new joiners. |
| DNS Seeds | Depends on ICANN-controlled DNS infrastructure. DNS can be censored, poisoned, or seized. Even with DNSSEC, root of trust is centralized. |
| Temporary Centralization Schemes | Swimchain's thesis explicitly rejects "we'll decentralize later" pattern. Temporary centralization creates path dependency and rarely becomes decentralized. |
| Required Introduction Servers | Any persistent server new nodes **must** contact becomes a mega-node. Introduces power asymmetry. (Note: **optional** introduction points with multiple operators are acceptable.) |
| Tor Directory Authority Model | While Tor is privacy-preserving, its directory authority model involves hardcoded trusted entities with protocol-level authority. |
| Incentivized Introduction (Token Rewards) | Creates incentive to sybil the introduction layer. Rewards for introducing peers can be gamed by creating fake peers or eclipse attacks. |
| Stake-Based Discoverable Nodes | Introduces plutocracy into discovery layer. Wealthy nodes become more discoverable, recreating power asymmetries. |

## Recommendations

### Primary Recommendation

**Approach**: Layered Social-First Discovery Stack

**Rationale**: A priority-ordered discovery system that attempts more decentralized methods first, never falling back to centralized ones. This embodies Swimchain's philosophy: friction is intentional, the social graph matters, and no infrastructure is required.

**The Six Layers** (Updated December 2024):

1. **Layer 0: Cached Peers**
   - Client remembers peers from previous sessions
   - First thing checked on startup
   - No network required
   - Eliminates seed dependency for returning users

2. **Layer 1: mDNS Local Discovery**
   - Always running
   - Discovers peers on same LAN
   - Zero infrastructure required
   - Works without internet

3. **Layer 2: Social Graph Bootstrap**
   - Users share peer info via QR codes, direct messages, or physical exchange
   - The social network IS the discovery network
   - Friction is intentional and valuable
   - Works for known communities

4. **Layer 3: Community Introduction Points** (NEW)
   - Well-known addresses published by community (website, README)
   - Multiple independent operators (3-5 minimum)
   - Anyone can run one - no permission required
   - **Not protocol-privileged** - just always-on nodes you know about
   - Used only for initial connection; client caches discovered peers
   - Like a phone book, not a gatekeeper

5. **Layer 4: DHT Discovery (Kademlia)**
   - Once connected to at least one peer, use DHT for broader discovery
   - Integrate PoW into DHT node IDs for sybil resistance
   - Self-organizing at scale
   - No privileged nodes

6. **Layer 5: Peer Exchange Protocol**
   - Connected peers share their peer lists
   - Creates organic network growth
   - Gossip-style propagation
   - Must include protections against peer list poisoning

**Implementation Level**: Protocol

**Tradeoffs Accepted**:
- Slower initial network growth compared to centralized bootstrap
- Requires physical or out-of-band coordination for first users
- Higher UX friction for onboarding (no "just download and go")
- DHT bootstrap still requires knowing at least one peer initially
- May create geographic clustering if early adoption is localized

**Open Questions**:
- How to encode peer info in QR codes efficiently (multiaddr format? custom encoding?)
- What's the minimum peer list size for resilient DHT participation?
- How to handle NAT traversal for nodes behind firewalls?
- Should PoW difficulty for DHT node IDs scale with network size?
- How to prevent peer list poisoning in peer exchange?

### Alternative Approaches

#### SSB-Style Community Rooms

**When to use**: For communities that want easier onboarding and accept some semi-centralization.

A "room" is a relay that helps peers discover each other but doesn't store content. Rooms can be run by anyone, creating a market of introduction points rather than a single authority.

**Tradeoffs**: Introduces semi-centralized infrastructure. Room operators have some visibility into who's connecting. However, rooms are fungible—users can switch easily. Better UX than pure social bootstrap.

#### Mesh Network First

**When to use**: For deployments in areas with limited/censored internet access.

Prioritize Bluetooth, WiFi direct, and physical proximity discovery. Build local mesh networks that occasionally bridge to the internet.

**Tradeoffs**: Very slow to grow beyond local area. Requires physical proximity. Excellent for activist communities, disaster response, or censorship-circumvention use cases.

#### Reputation-Gated DHT

**When to use**: When sybil attacks become a significant problem at scale.

Require nodes to have earned reputation (through PoW, stake, or social vouching) before they can participate in DHT routing.

**Tradeoffs**: Adds complexity. Creates chicken-and-egg for new nodes (need reputation to discover, but need to participate to earn reputation). May need "probationary" participation mode.

### Explicitly Rejected Approaches

| Approach | Why Rejected |
|----------|--------------|
| Any DNS-based discovery | Fundamentally depends on ICANN infrastructure. Cannot be made censorship-resistant. |
| **Authority nodes** (nodes with protocol privileges) | Creates permanent points of centralization with power to validate, censor, or exclude. |
| Incentivized introduction | Creates incentive to sybil the introduction layer. Rewards can be gamed. Conflicts with "no growth imperative." |
| Stake-based discovery | Introduces plutocracy. Wealthy nodes become more discoverable, recreating power asymmetries. |
| "Temporary" centralized bootstrap | Swimchain's thesis explicitly rejects this pattern. If you can't bootstrap without centralization, you've already compromised. |

**Note:** "Hardcoded bootstrap lists" are NOT rejected if they are simply well-known addresses with no protocol authority. The key distinction is **authority** vs. **information**. See "Clarification: Seed Nodes vs. Authority Nodes" above.

## Implementation Considerations

- **Dependencies**:
  - SPEC_06_NETWORK_SYNC.md must define peer address format
  - Proof-of-work system needed for sybil-resistant DHT node IDs
  - Cryptographic identity system for signing peer exchanges
  - NAT traversal solution (STUN/TURN or libp2p's NAT traversal)

- **Complexity**: Medium
  - mDNS: Low complexity, well-understood
  - QR/social exchange: Low complexity, mostly UX work
  - Kademlia DHT: High complexity, but libraries available
  - Peer exchange: Medium complexity, needs poison resistance

- **Prototype Questions**:
  - Test mDNS discovery in various network configurations (home NAT, corporate firewall, etc.)
  - Measure QR code scanning UX—how much peer info can fit in a scannable code?
  - Simulate DHT bootstrap with varying numbers of initial peers—what's minimum for stability?
  - Test sybil resistance of PoW-gated DHT node IDs
  - Measure time-to-first-peer for different bootstrap methods
  - Test peer exchange gossip protocol for convergence and poisoning resistance

## Remaining Gaps

1. **NAT Traversal Strategy**: How do nodes behind NATs discover and connect to each other? STUN/TURN servers reintroduce centralization. libp2p has approaches but adds dependency.

2. **Bootstrap for Mobile Nodes**: Mobile devices may not be able to run full nodes or participate in DHT routing. How do they discover peers?

3. **Geographic Distribution**: Social bootstrap may create geographic clustering. How to encourage geographic diversity for network resilience?

4. **Recovery from Network Partition**: If the network splits, how do partitions rediscover each other without central coordination?

5. **Peer Quality Signaling**: How do nodes distinguish high-quality peers (stable, honest, well-connected) from low-quality ones during discovery?

6. **Eclipse Attack Detection**: How does a new node know if it's being surrounded by malicious peers during bootstrap?

7. **IPv4 vs IPv6**: Address format and discovery may differ. How to handle dual-stack nodes?

8. **Onion/Tor Integration**: For privacy-sensitive users, how to bootstrap through Tor without using Tor's directory authorities?

## References

- BitTorrent Enhancement Proposal 5 (BEP-5): Mainline DHT specification
- Kademlia: A Peer-to-peer Information System Based on the XOR Metric (Maymounkov & Mazières, 2002)
- Scuttlebutt Protocol Guide: https://ssbc.github.io/scuttlebutt-protocol-guide/
- Briar Security Documentation: https://briarproject.org/how-it-works/
- IPFS DHT Sybil Attack Research (2024): Academic papers documenting vulnerabilities
- libp2p specifications: https://github.com/libp2p/specs
- mDNS/DNS-SD specifications: RFC 6762, RFC 6763
- Bitcoin DNS Seed documentation: https://github.com/bitcoin/bitcoin/blob/master/doc/dnsseed-policy.md

---

*Research completed: 2025-12-24*
*Status: DRAFT - Ready for team review*
