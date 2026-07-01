# Bootstrap Mechanism (Milestone 2.3)

This document describes how Swimchain nodes discover peers without central infrastructure.

## Overview

Swimchain uses a **six-layer discovery stack** that provides defense-in-depth for peer discovery. Any single method failing doesn't prevent network access.

## The Six-Layer Discovery Stack

```
┌─────────────────────────────────────────────────┐
│ Layer 5: Peer Exchange (GETADDR/ADDR)           │
│   Connected peers share their peer lists        │
├─────────────────────────────────────────────────┤
│ Layer 4: DHT Discovery (Future)                 │
│   Kademlia-based decentralized discovery        │
├─────────────────────────────────────────────────┤
│ Layer 3: Introduction Points                    │
│   Well-known addresses, multiple operators      │
├─────────────────────────────────────────────────┤
│ Layer 2: Social Bootstrap                       │
│   QR codes, links, manual peer entry            │
├─────────────────────────────────────────────────┤
│ Layer 1: mDNS Local Discovery (Optional)        │
│   Zero-infrastructure LAN discovery             │
├─────────────────────────────────────────────────┤
│ Layer 0: Cached Peers                           │
│   Peers from previous sessions (sled storage)   │
└─────────────────────────────────────────────────┘
```

### Layer 0: Cached Peers (Implemented)

**First thing checked - eliminates dependency for returning users.**

Peers from previous sessions are persisted to disk using sled. On startup, cached peers are loaded first.

```rust
// Cached peers are stored in PeerStore
let peer_store = PeerStore::open(Path::new("./data/peers"))?;
let cached_peers = peer_store.get_by_min_score(0)?;
```

Properties:
- Persisted to disk via sled
- Sorted by reputation score (highest first)
- Excludes banned peers (score < -500)
- Zero network requests required

### Layer 1: mDNS Local Discovery (Optional)

**Works without internet - zero infrastructure.**

Multicast DNS allows devices on the same LAN to discover each other without any infrastructure.

Status: Optional for Milestone 2.3

### Layer 2: Social Bootstrap

**Human network IS the discovery network.**

Users share peer connection info via:
- QR codes at meetups
- Direct messages/links
- Manual entry in client

Properties:
- Maximum decentralization
- Friction is intentional (prevents bots)
- Creates genuine social connections

### Layer 3: Introduction Points (Implemented)

**Well-known addresses with NO protocol authority.**

```rust
use swimchain::discovery::{default_dev_seeds, default_mainnet_seeds};

// Development seeds (localhost)
let dev_seeds = default_dev_seeds();
// Returns: [127.0.0.1:9735, 127.0.0.1:9736, 127.0.0.1:9737]

// Mainnet seeds (placeholder - to be published)
let mainnet_seeds = default_mainnet_seeds();
```

**Critical distinction:**

| Concept | What It Is | Centralization? |
|---------|------------|-----------------|
| Authority Nodes | Nodes with protocol privileges | REJECTED |
| Introduction Points | Well-known addresses for discovery | Acceptable |

**Why introduction points are NOT centralization:**
- No protocol-level authority
- Cannot censor content
- Cannot exclude users
- Once connected, never needed again
- Anyone can run one
- Multiple independent operators

A website listing peer addresses is "infrastructure" like a phone book - it helps you find people but doesn't control your conversations.

### Layer 4: DHT Discovery (Future)

**Kademlia-based decentralized discovery.**

Once connected to at least one peer, DHT enables discovery at scale without privileged nodes. Planned for future milestone.

Properties:
- O(log n) lookup complexity
- Self-organizing
- Requires initial peer (bootstrap paradox)
- Must include sybil resistance (PoW node IDs)

### Layer 5: Peer Exchange (Implemented)

**Connected peers share their peer lists via GETADDR/ADDR.**

```rust
use swimchain::discovery::PeerExchange;

// Decide whether to request peers
let should_request = PeerExchange::should_request_peers(peer_score, current_count);

// Create GETADDR request
let request = PeerExchange::create_getaddr_request();
```

Properties:
- Gossip-style propagation
- Rate limited (60s between requests from same peer)
- Max 1000 addresses per response (V-PEER-04)
- Prioritizes high-score peers

## Bootstrap Flow

```rust
pub fn bootstrap(&self) -> Result<Vec<WireAddr>, DiscoveryError> {
    let mut peers = Vec::new();

    // Layer 0: Load cached peers (highest score first)
    let cached = self.peer_store.get_by_min_score(0)?;
    peers.extend(cached.iter().map(|e| e.wire_addr.clone()));

    // Layer 3: Add seeds if insufficient peers
    if peers.len() < MIN_PEERS {
        for seed in &self.seed_list {
            peers.push(seed.to_wire_addr());
        }
    }

    Ok(peers)
}
```

**Priority order:**
1. Cached peers with positive score (most trusted)
2. Introduction points (seeds)
3. Peers discovered via exchange (after connecting)

## Seed List Configuration

Development seeds for local testing:

```rust
pub fn default_dev_seeds() -> Vec<SeedEntry> {
    vec![
        SeedEntry::tcp_v4([127, 0, 0, 1], 9735),
        SeedEntry::tcp_v4([127, 0, 0, 1], 9736),
        SeedEntry::tcp_v4([127, 0, 0, 1], 9737),
    ]
}
```

**Production deployment notes:**
- Seeds should be geographically distributed
- Multiple independent operators (no single source)
- Mix of transport types (TCP, Tor, I2P)
- Published in README, website, social media
- Anyone can run one - no permission required

## Anti-Patterns Avoided

| Anti-Pattern | Why Avoided |
|--------------|-------------|
| DNS Seeds | Depends on ICANN - can be seized/censored |
| Authority Nodes | Creates permanent power asymmetry |
| Required Introduction Servers | Becomes a mega-node if required |
| Stake-Based Discovery | Introduces plutocracy |
| Temporary Centralization | "We'll decentralize later" never happens |

## Protocol Messages

### GETADDR (0x10)

Request peer addresses from a connected peer.

```rust
pub struct GetAddrPayload {
    pub fork_id: [u8; 32],    // Filter by fork (zeros = any)
    pub max_addrs: u16,       // Maximum addresses requested
}
```

### ADDR (0x11)

Response containing peer addresses.

```rust
pub struct AddrPayload {
    pub addresses: Vec<WireAddr>,  // Up to 1000 entries
}
```

## V-PEER-04 Compliance

Both GETADDR and ADDR enforce limits:

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Max addresses per message | 1000 | Reject/truncate |
| Rate limit | 60s | `DiscoveryError::RateLimited` |

## Security Considerations

### Eclipse Attack Prevention

- Peer scoring deprioritizes unreliable/malicious peers
- Multiple seed operators (no single source)
- Cached peers reduce dependency on seeds
- Geographic diversity recommended

### Sybil Resistance

- DHT node IDs will require PoW (future milestone)
- Peer scoring penalizes failed connections
- Rate limiting prevents address flooding

### Peer List Poisoning

- Only accept addresses from established connections
- Score-based filtering of returned peers
- Maximum cache size with lowest-score eviction

## Related Documentation

- [Peer Discovery](peer-discovery.md) - Module API reference
- [Transport Layer](transport-layer.md) - Connection establishment
- [Message Types](message-types.md) - GETADDR/ADDR wire format

## References

- SPEC_06 Section 4.1: Bootstrap
- RESEARCH_02: Bootstrap & Peer Discovery spike
- Bitcoin BEP-5: Mainline DHT specification
- Kademlia paper (Maymounkov & Mazieres, 2002)
