# C-DHT-2 Implementation Log

**Issue**: Eclipse Attack Vulnerability
**Priority**: CRITICAL
**Effort**: M (4-8 hours)
**Status**: IMPLEMENTED
**Date**: 2026-01-13

## Problem

The DHT routing table had no subnet-based peer diversity tracking. An attacker could isolate a node by populating its routing table with malicious nodes all from the same subnet (eclipse attack).

## Implementation Plan (from OUTSTANDING_ACTIONS.md)

1. Add subnet tracking to KBucket
2. Add per_subnet_limit (suggested: 2 nodes per /24)
3. Reject nodes from over-represented subnets
4. Add `first_seen` timestamp, prefer longer-lived nodes

## Changes Made

### 1. src/dht/constants.rs

Added new constant for subnet limit:
```rust
/// Maximum nodes per /24 subnet in each bucket (eclipse attack mitigation)
/// This prevents a single subnet from dominating the routing table
pub const MAX_NODES_PER_SUBNET: usize = 2;
```

### 2. src/dht/error.rs

Added new error variant for subnet limit exceeded:
```rust
/// Subnet limit exceeded (eclipse attack mitigation)
SubnetLimitExceeded {
    subnet: [u8; 3],
    limit: usize,
},
```

With corresponding Display implementation.

### 3. src/dht/routing_table.rs

#### Added subnet extraction helper:
```rust
fn extract_subnet(addr: &SocketAddr) -> [u8; 3] {
    match addr.ip() {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            [octets[0], octets[1], octets[2]]
        }
        IpAddr::V6(ipv6) => {
            let octets = ipv6.octets();
            [octets[0], octets[1], octets[2]]
        }
    }
}
```

#### Added first_seen to NodeEntry:
```rust
pub struct NodeEntry {
    pub id: NodeId,
    pub addr: SocketAddr,
    pub last_seen: Instant,
    pub first_seen: Instant,  // NEW: For longevity preference
    pub failure_count: u32,
}
```

Added helper methods:
- `subnet()` - Get the /24 subnet of this node
- `age()` - Get duration since first_seen

#### Added UpdateResult enum:
```rust
pub enum UpdateResult {
    Success,
    PingRequired(NodeEntry),
    SubnetLimitExceeded { subnet: [u8; 3], count: usize },
}
```

#### Modified KBucket:
- Added `subnet_counts: HashMap<[u8; 3], usize>` field
- Added `subnet_count()`, `increment_subnet()`, `decrement_subnet()` methods
- Modified `update()` to check subnet limits before adding new nodes
- Modified `on_ping_result()` to maintain subnet counts on eviction
- Modified `remove()` to maintain subnet counts

#### Modified RoutingTable::update():
Returns `DhtError::SubnetLimitExceeded` when subnet limit is exceeded.

### 4. Tests Added

- `test_subnet_limit_enforcement` - Verifies nodes are rejected when subnet limit reached
- `test_subnet_count_tracking` - Verifies subnet counts are properly maintained
- `test_routing_table_subnet_limit` - Integration test for subnet limits
- `test_first_seen_preserved` - Verifies first_seen is preserved on node updates

## Validation

```
cargo check                           # No errors
cargo test --lib dht::               # 53 tests pass
cargo test --lib dht::routing_table  # 12 tests pass
```

## Security Impact

This change mitigates eclipse attacks by:
1. Limiting each /24 subnet to 2 nodes per k-bucket
2. Tracking when nodes were first seen (for future longevity-based preferences)
3. Ensuring routing table diversity across different network segments

An attacker would need to control many different /24 subnets to eclipse a node, significantly increasing attack cost.

## Files Modified

- `src/dht/constants.rs` - Added MAX_NODES_PER_SUBNET constant
- `src/dht/error.rs` - Added SubnetLimitExceeded error variant
- `src/dht/routing_table.rs` - Added subnet tracking and eclipse mitigation logic

## Notes

- The subnet limit is per k-bucket, not per routing table, which is the correct granularity for Kademlia
- IPv6 support uses the first 3 bytes as a rough subnet approximation
- The first_seen timestamp enables future enhancements where longer-lived nodes are preferred
