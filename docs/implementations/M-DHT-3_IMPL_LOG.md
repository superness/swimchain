# M-DHT-3: mDNS Discovery Implementation Log

**Issue ID**: M-DHT-3
**Priority**: Medium
**Effort**: L (8-12 hours estimated)
**Status**: IMPLEMENTED
**Date**: 2026-01-14

---

## Problem Statement

mDNS (multicast DNS) discovery layer was not implemented. Per SPEC_06 §4.1, the discovery stack includes Layer 1 for mDNS-based LAN peer discovery, which provides zero-configuration peer discovery for nodes on the same local network.

## Pre-Approved Decision

From IMPLEMENTATION_DECISIONS.md:
- **Crate**: `mdns` version 3.0
- **Service Name**: `_swimchain._tcp.local`

## Implementation Summary

### Files Modified

1. **Cargo.toml**
   - Added `mdns = "3.0"` dependency

2. **src/discovery/mdns.rs** (new)
   - Created mDNS discovery module with:
     - `MdnsDiscoveredPeer` struct for discovered peer information
     - `MdnsDiscovery` service for running discovery queries
     - Constants: `MDNS_SERVICE_NAME`, `MDNS_QUERY_INTERVAL_SECS`, `MDNS_MAX_PEERS_PER_ROUND`
     - Methods for one-shot and continuous discovery
     - Conversion from mDNS records to `WireAddr`

3. **src/discovery/error.rs**
   - Added `MdnsError(String)` variant to `DiscoveryError` enum

4. **src/discovery/mod.rs**
   - Added `pub mod mdns;` declaration
   - Added exports: `MdnsDiscoveredPeer`, `MdnsDiscovery`, `MDNS_SERVICE_NAME`
   - Updated documentation to reflect Layer 1 is now implemented

5. **src/discovery/manager.rs**
   - Added `discover_mdns()` and `discover_mdns_with_timeout()` async methods
   - Added `create_mdns_discovery()` method for creating continuous discovery service
   - Updated module documentation

### Key Implementation Details

#### Service Discovery
- Service name: `_swimchain._tcp.local` (per DNS-SD conventions)
- Queries for A (IPv4) and AAAA (IPv6) records
- Extracts IP addresses and converts to `WireAddr` format
- Filters out loopback and link-local addresses

#### MdnsDiscovery Service
```rust
pub struct MdnsDiscovery {
    discovered_tx: mpsc::Sender<MdnsDiscoveredPeer>,
    discovered_rx: Option<mpsc::Receiver<MdnsDiscoveredPeer>>,
    shutdown: Arc<AtomicBool>,
}
```

- Channel-based peer notification (64-element buffer)
- Graceful shutdown via atomic flag
- Configurable timeout for discovery queries
- Maximum 16 peers per discovery round

#### Integration with DiscoveryManager
```rust
// One-shot discovery (5 second timeout)
let peers = manager.discover_mdns().await?;

// Custom timeout
let peers = manager.discover_mdns_with_timeout(Duration::from_secs(10)).await?;

// Continuous discovery service
let mdns = manager.create_mdns_discovery();
let mut rx = mdns.take_receiver().unwrap();
tokio::spawn(mdns.run_discovery_loop(Duration::from_secs(30)));
```

#### Wire Format Conversion
- IPv4: transport = 0x01 (TCPv4)
- IPv6: transport = 0x02 (TCPv6)
- Services = 0x01 (full node)
- Discovered peers automatically added to peer store

### Technical Notes

1. **Pinning Required**: The mdns stream requires pinning for async iteration:
   ```rust
   let mut stream = pin!(stream.listen());
   ```

2. **Discovery Only**: The `mdns` crate version 3.0 supports discovery only, not advertising. Service advertising would require an additional crate (e.g., `libmdns`). This is acceptable for Layer 1 discovery which focuses on finding peers.

3. **Stream Processing**: Uses `FuturesUnordered`-style processing with early termination when:
   - Shutdown flag is set
   - Maximum peers reached (16)
   - Timeout expires

## Tests Added

5 unit tests in `src/discovery/mdns.rs`:
1. `test_service_name` - Verifies service name constant
2. `test_mdns_discovered_peer_to_wire_addr_v4` - IPv4 conversion
3. `test_mdns_discovered_peer_to_wire_addr_v6` - IPv6 conversion
4. `test_mdns_discovery_new` - Constructor and receiver
5. `test_mdns_discovery_shutdown` - Graceful shutdown

## Validation

```
$ cargo check
✓ No compilation errors (clean pass, no mdns-related warnings)

$ cargo test --lib -- discovery::mdns
running 5 tests
test discovery::mdns::tests::test_service_name ... ok
test discovery::mdns::tests::test_mdns_discovered_peer_to_wire_addr_v4 ... ok
test discovery::mdns::tests::test_mdns_discovered_peer_to_wire_addr_v6 ... ok
test discovery::mdns::tests::test_mdns_discovery_new ... ok
test discovery::mdns::tests::test_mdns_discovery_shutdown ... ok

test result: ok. 5 passed; 0 failed; 0 ignored

$ cargo test --lib -- discovery::manager
running 10 tests
test discovery::manager::tests::* ... ok

test result: ok. 10 passed; 0 failed; 0 ignored
```

### Validation Fixes Applied
During validation, the following issues were identified and fixed:
1. **Unused imports** - Removed unused `Ipv4Addr` and `SocketAddr` imports from main module
2. **Missing test import** - Added `use std::net::Ipv4Addr;` to tests module

## Future Enhancements

1. **Service Advertising**: Add `libmdns` for announcing presence on LAN
2. **Background Task Integration**: Add mDNS discovery to `node/tasks.rs` task runner
3. **SRV Record Support**: Extract port from SRV records instead of using default

## Related Specifications

- SPEC_06 §4.1: Discovery Stack (Layer 1: mDNS)
- RFC 6762: Multicast DNS
- RFC 6763: DNS-Based Service Discovery

---

*Implementation completed 2026-01-14*
