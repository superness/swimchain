# Area Owner Review: DHT & Peer Discovery

**Generated**: 2026-01-12
**Overall Health Score**: 76/100
**Status**: Needs Attention

## Executive Summary

The DHT & Peer Discovery system provides a solid Kademlia-based DHT with a comprehensive six-layer peer discovery hierarchy. Core functionality is complete with proper XOR distance metrics, K=8/ALPHA=3 parameters, and Sybil-resistant node IDs derived from PoW-gated Ed25519 keys. However, critical security vulnerabilities (eclipse attacks, unsigned provider records), performance bottlenecks (blocking DNS, sequential lookup processing), and missing persistence (DHT routing table, provider store) require immediate attention before mainnet. The feature is testnet-ready but needs hardening for production.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 85/100 | 🟢 |
| Performance | 75/100 | 🟡 |
| Vision Alignment | 85/100 | 🟢 |
| User Experience | 70/100 | 🟡 |
| Accessibility | 68/100 | 🟡 |
| Quality | 76/100 | 🟡 |
| Security | 72/100 | 🟡 |
| **Overall** | **76/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Eclipse Attack Vulnerability
- **Source**: Security Review
- **Severity**: Critical (CVSS 8.1)
- **Description**: No bucket diversity requirements in routing table. Attacker can generate many PoW-gated identities targeting specific bucket ranges and isolate victim nodes from the honest network.
- **Impact**: Complete network isolation; victim sees only attacker's view of network; can manipulate content availability and block transactions.
- **Action**: Implement per-subnet limits (max 2 nodes per /24 IPv4, /48 IPv6), require minimum bucket diversity, prefer longer-lived nodes.
- **Effort**: M
- **Location**: `src/dht/routing_table.rs:130-161`

### 2. Unsigned Provider Records Enable Content Poisoning
- **Source**: Security Review, Vision Review
- **Severity**: Critical (CVSS 7.5)
- **Description**: `ProviderRecord` contains only `node_id`, `addr`, and `timestamp` without cryptographic signatures. Any node can announce as provider for content they don't have.
- **Impact**: Content integrity compromise; potential malware distribution; denial of service for specific content. Violates "identity IS keypair" principle.
- **Action**: Add Ed25519 signature field to `ProviderRecord`, sign over content_hash || node_id || timestamp, verify on STORE handling.
- **Effort**: M
- **Location**: `src/dht/provider_store.rs:14-22`

### 3. Blocking DNS Resolution Stalls Async Runtime
- **Source**: Functionality Review, Performance Review
- **Severity**: Critical
- **Description**: `DnsSeed::resolve()` uses synchronous `to_socket_addrs()` which blocks the async runtime during DNS resolution, affecting all concurrent tasks.
- **Impact**: Node unresponsive during DNS resolution (5-10 seconds per seed); can cause missed messages and connection timeouts.
- **Action**: Replace with `tokio::net::lookup_host()` with timeout.
- **Effort**: S
- **Location**: `src/discovery/seed_list.rs:160-169`

## High Priority Issues

### 1. STORE Always Accepts Without Validation
- **Source**: Security Review, Functionality Review
- **Severity**: High (CVSS 6.5)
- **Description**: STORE handler accepts all requests without validation, allowing provider store flooding.
- **Impact**: Provider store pollution; content unavailability; wasted lookup bandwidth.
- **Action**: Validate STORE with content hash proof, rate-limit per sender, require signature.
- **Effort**: M
- **Location**: `src/dht/manager.rs:220-229`

### 2. No DHT Persistence
- **Source**: Functionality Review, Vision Review, Quality Review
- **Severity**: High
- **Description**: DHT routing table and provider store are in-memory only - completely reset on restart. Creates asymmetric durability (PeerStore persists, DHT doesn't).
- **Impact**: Multi-minute bootstrap required after every restart; poor user experience; content unavailable until providers re-announce.
- **Action**: Implement sled-backed persistence for routing table and provider store with versioned format.
- **Effort**: M
- **Location**: `src/dht/routing_table.rs`, `src/dht/provider_store.rs`

### 3. No Message Authentication
- **Source**: Security Review
- **Severity**: High (CVSS 6.8)
- **Description**: DHT messages are not authenticated. Attacker on network path can inject forged messages claiming to be from legitimate nodes.
- **Impact**: Routing table pollution; traffic redirection; eclipse attack enablement.
- **Action**: Add optional Ed25519 message signing; verify sender_id matches signature before routing table update.
- **Effort**: M
- **Location**: `src/dht/manager.rs:150-157`

### 4. NodeStatusBar Status Dot Uses Color Alone
- **Source**: Accessibility Review
- **Severity**: High (WCAG 1.4.1 Violation)
- **Description**: Status dot in NodeStatusBar uses color alone to convey status (green=running, yellow=connecting, red=stopped).
- **Impact**: Users with color vision deficiencies cannot distinguish node states.
- **Action**: Add icon or shape indicator alongside color (checkmark for running, spinner for connecting, X for stopped).
- **Effort**: S
- **Location**: `NodeStatusBar.tsx:99-103`

### 5. NodeStatusBar Dropdown Not Keyboard Accessible
- **Source**: Accessibility Review
- **Severity**: High (WCAG 2.1.1 Violation)
- **Description**: Node controls dropdown menu is click-only with no keyboard navigation.
- **Impact**: Keyboard-only users cannot access Stop Node, Restart Node, Settings, or Documentation actions.
- **Action**: Add onKeyDown handler for arrow key navigation, trap focus, close on Escape, manage focus return.
- **Effort**: S
- **Location**: `NodeStatusBar.tsx:142-166`

### 6. Integration Tests Not Implemented
- **Source**: Quality Review
- **Severity**: High
- **Description**: `peer_store_integration.rs` contains 18 `todo!()` stubs - no actual integration testing.
- **Impact**: Router/PeerStore integration untested; bugs may go undetected until production.
- **Action**: Implement all integration test stubs.
- **Effort**: M
- **Location**: `tests/peer_store_integration.rs`

## Medium Priority Issues

### 1. Sequential Lookup Processing
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: Despite ALPHA=3 parallel queries, lookup results are processed sequentially after `join_all()`.
- **Impact**: Suboptimal lookup performance; 2-3x slower than possible.
- **Action**: Use `FuturesUnordered` or mpsc channels for concurrent result processing.
- **Effort**: M
- **Location**: `src/dht/lookup.rs:207-238`

### 2. O(n) Full Table Scans in PeerStore
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: Eviction and cleanup operations scan entire peer table.
- **Impact**: Performance degrades with large peer counts; O(n) for each maintenance operation.
- **Action**: Add score index for O(1) eviction candidate selection.
- **Effort**: M
- **Location**: `src/discovery/peer_store.rs:70-78`

### 3. Message Byte Documentation Discrepancy
- **Source**: Functionality Review, Vision Review
- **Severity**: Medium
- **Description**: MASTER_FEATURES.md shows 0x40-0x43, implementation uses 0x80-0x87 (8 message types vs 4 documented).
- **Impact**: Documentation mismatch; potential interoperability issues.
- **Action**: Update MASTER_FEATURES.md to reflect actual message bytes.
- **Effort**: S
- **Location**: `MASTER_FEATURES.md`, `src/dht/constants.rs:38-62`

### 4. Silent RPC Failures
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: Failed RPCs in lookup are silently ignored without logging, metrics, or retry.
- **Impact**: Difficult to debug lookup failures; no visibility into network issues.
- **Action**: Log failed RPCs with context, add metrics, implement retry with backoff.
- **Effort**: S
- **Location**: `src/dht/lookup.rs:234-237`

### 5. mDNS Not Implemented
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Layer 1 (local network discovery) marked as "Planned" but not implemented.
- **Impact**: LAN deployments cannot discover peers without internet connectivity.
- **Action**: Implement mDNS-based local peer discovery.
- **Effort**: M

### 6. No Bootstrap Progress Indicator
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Users stare at "Connecting..." with no feedback during bootstrap. No indication of which discovery layer is being tried.
- **Impact**: Users may assume app is broken; poor first-run experience.
- **Action**: Add bootstrap phase indicators showing current layer and estimated time.
- **Effort**: S
- **Location**: `NodeStatusBar.tsx:80-90`

### 7. PeerBranchTracker Not Thread-Safe
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: Uses plain `HashMap` without synchronization primitives.
- **Impact**: Data races possible if accessed from multiple async tasks.
- **Action**: Wrap in `Arc<RwLock<>>` like other shared state.
- **Effort**: S
- **Location**: `src/discovery/peer_branches.rs:153-157`

### 8. DebugPanel Peer Table Headers Lack Scope
- **Source**: Accessibility Review
- **Severity**: Medium (WCAG 1.3.1 Violation)
- **Description**: Table headers lack `scope` attribute for screen reader navigation.
- **Impact**: Screen reader users cannot navigate table by column.
- **Action**: Add `scope="col"` to `<th>` elements.
- **Effort**: S
- **Location**: `DebugPanel.tsx:213-229`

## Quick Wins (Low Effort, High Impact)

1. **Async DNS Resolution**: Replace `to_socket_addrs()` with `tokio::net::lookup_host()` - S effort, prevents runtime stalls
2. **Fix Documentation**: Update MASTER_FEATURES.md message bytes to 0x80-0x87 - S effort, prevents confusion
3. **Add Status Icons**: Add icons to NodeStatusBar status dot alongside colors - S effort, WCAG compliance
4. **Keyboard Navigation**: Add keyboard handlers to NodeStatusBar dropdown - S effort, accessibility win
5. **Table Accessibility**: Add `scope="col"` to DebugPanel table headers - S effort, screen reader support
6. **Log RPC Failures**: Add logging context to silent RPC failures in lookup.rs - S effort, debugging improvement
7. **Add ARIA Labels**: Add `role="status"` and `aria-live="polite"` to NodeStatusBar - S effort, screen reader announcements
8. **Thread-Safe BranchTracker**: Wrap PeerBranchTracker in Arc<RwLock<>> - S effort, prevents race conditions

## Strengths to Preserve

- **Complete Kademlia Implementation**: Standard K=8, ALPHA=3 parameters with proper XOR distance metrics and k-bucket update rules following Kademlia spec
- **Sybil-Resistant Identity**: Node IDs derived from SHA-256 hash of Ed25519 public keys with PoW-gated identity creation
- **Six-Layer Discovery Stack**: Robust fallback from cached peers → mDNS (planned) → social → seeds → DHT → PEX
- **Comprehensive Error Types**: 12 DhtError variants and 7 DiscoveryError variants with contextual information
- **Branch-Selective Sync Tracking**: Innovative bidirectional indexing for O(1) peer-to-branch lookups
- **Rate-Limited Peer Exchange**: V-PEER-04 compliant with 1000 address limit and 60s per-peer rate limiting
- **Good Test Coverage**: 86 unit tests across modules with serialization roundtrip coverage
- **Well-Documented Module Headers**: Clear spec references and purpose documentation

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Fix blocking DNS resolution with `tokio::net::lookup_host()`
- [ ] Add eclipse attack mitigation (per-subnet limits, bucket diversity)
- [ ] Sign provider records with Ed25519
- [ ] Add icons alongside status dot colors in NodeStatusBar
- [ ] Make NodeStatusBar dropdown keyboard accessible
- [ ] Update MASTER_FEATURES.md message byte documentation

### Short Term (Next 2-4 Weeks)
- [ ] Implement DHT routing table persistence
- [ ] Add provider store persistence
- [ ] Add optional DHT message authentication
- [ ] Implement STORE message validation
- [ ] Complete integration test stubs in peer_store_integration.rs
- [ ] Add bootstrap progress indicators to UI
- [ ] Parallelize lookup result processing
- [ ] Add RPC failure logging and retry logic
- [ ] Add ARIA attributes to DebugPanel toggles and NodeStatusBar
- [ ] Wrap PeerBranchTracker in Arc<RwLock<>>

### Long Term (Backlog)
- [ ] Implement mDNS discovery (Layer 1)
- [ ] Add provider proximity scoring
- [ ] Persist branch tracker
- [ ] Add fuzz testing for wire format parsing
- [ ] Add property-based testing for XOR distance
- [ ] Implement circuit breaker pattern for failing peers
- [ ] Add `add_bootstrap_peer` RPC/CLI for manual peer addition
- [ ] Add DHT metrics/telemetry
- [ ] Test in Windows High Contrast mode
- [ ] Add `prefers-reduced-motion` support for animations

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Blocking DNS resolution | S | H | 1 |
| No DHT persistence | M | H | 2 |
| Integration test stubs (18 todo!()) | M | H | 2 |
| Sequential lookup processing | M | M | 3 |
| DRY violation in lookup.rs (do_lookup/do_lookup_value) | S | M | 4 |
| Magic number `failure_count >= 3` | S | L | 5 |
| Missing `#[must_use]` attributes | S | L | 5 |
| Unused `peer_exchange` dead code | S | L | 5 |
| Duplicate test helpers across modules | S | L | 6 |
| Abbreviation inconsistency (addr vs address) | S | L | 6 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Eclipse attack isolates nodes | Medium | High | Implement bucket diversity requirements, per-subnet limits |
| Content poisoning via fake providers | Medium | Medium | Sign provider records with Ed25519 |
| DNS resolution blocks runtime | High | Medium | Use async DNS with timeout |
| Data loss on restart | High | Low | Implement DHT persistence |
| Integration bugs undetected | Medium | Medium | Complete integration test stubs |
| Accessibility lawsuit/complaint | Low | Medium | Fix WCAG violations in NodeStatusBar, DebugPanel |
| Performance degrades at scale | Medium | Medium | Fix O(n) scans, parallelize lookups |
| Documentation confusion | High | Low | Fix message byte discrepancy |

## Appendix: Detailed Review Summaries

### Functionality
**Score: 85/100**

Key points:
- Complete Kademlia implementation with standard K=8, ALPHA=3 parameters
- Robust six-layer discovery with graceful fallback
- Well-defined wire formats (67-byte PeerKey, 95-byte PeerEntry)
- Comprehensive error handling (9 DhtError + 7 DiscoveryError variants)
- **Critical**: Blocking DNS resolution, unsigned provider records
- **Major**: No DHT persistence, mDNS unimplemented, STORE always accepts
- 19+ unit tests with good serialization roundtrip coverage

### Performance
**Score: 75/100**

Key points:
- Standard Kademlia O(log n) lookup complexity
- Memory: ~200KB routing table, ~190KB peer cache, unbounded provider/branch stores
- **Bottlenecks**: Blocking DNS (5-10s), sequential lookup processing (2-3x slower), O(n) full table scans
- **Optimizations needed**: Async DNS (5-10x faster bootstrap), heap-based K-closest selection (2-3x faster FIND_NODE), score index for peer store
- ALPHA=3 parallel queries correctly implemented but results processed sequentially

### Vision Alignment
**Score: 85/100**

Key points:
- Strong decentralization alignment: Kademlia DHT with no central coordinator
- Identity IS keypair: NodeId from SHA-256(Ed25519 pubkey)
- PoW-gated Sybil resistance properly integrated
- Seeds are unprivileged introduction points per design
- **Concerns**: Provider records not authenticated (violates identity principle), IP addresses exposed in PEX
- **Spec deviation**: Message bytes 0x80-0x87 vs documented 0x40-0x43
- Transport types support Tor/I2P (defined, not implemented)

### User Experience
**Score: 70/100**

Key points:
- Basic visibility through NodeStatusBar, DebugPanel, StatusBar
- Auto-refresh, color coding, expandable peer list work well
- **Critical**: No progress indicator during bootstrap
- **Major**: Cannot manually add peers, no DHT visibility in UI, error messages lack actionable guidance
- User flows analyzed: First-time startup, health check, content discovery failure, troubleshooting
- Status bar ARIA labels present; DebugPanel accessibility gaps

### Accessibility
**Score: 68/100**

Key points:
- StatusBar has excellent accessibility (role="status", aria-live, aria-labels)
- Global focus styles and touch targets meet standards
- **Critical WCAG Violations**: Color-only status (1.4.1), non-keyboard dropdown (2.1.1), table headers lack scope (1.3.1)
- **Major Violations**: No live region for status changes (4.1.3), missing aria-expanded on toggles (4.1.2)
- NodeStatusBar and DebugPanel need improvement; StatusBar is good
- Animations lack `prefers-reduced-motion` support

### Quality
**Score: 76/100**

Key points:
- Well-structured modules with single-responsibility files
- Consistent Arc<RwLock<>> pattern for thread safety
- 86 unit tests across modules with good coverage
- **Critical**: Integration tests are todo!() stubs, silent RPC failures
- **Gaps**: No retry logic, no fuzz testing, PeerBranchTracker not thread-safe
- Comprehensive error types with contextual information
- Timeouts are compile-time constants, not runtime-configurable

### Security
**Score: 72/100**

Key points:
- PoW-gated identity derivation provides Sybil resistance
- Standard cryptographic primitives (SHA-256, Ed25519) correctly used
- No secrets in logs, proper key derivation
- **Critical vulnerabilities**: Eclipse attack (CVSS 8.1), unsigned provider records (CVSS 7.5)
- **High vulnerabilities**: No message authentication (CVSS 6.8), STORE always accepts (CVSS 6.5)
- Rate limiting present but per-peer only (not per-IP)
- Input validation present for lengths; missing TTL clamping and NODES limit

---

*Review synthesized: 2026-01-12*
*Source reviews: Functionality, Performance, Vision, UX, Accessibility, Quality, Security*
*Overall weighted score: 76/100 (Needs Attention)*
*Next review recommended: After P0/P1 items addressed*
