# Action Log: DHT & Peer Discovery

**Generated**: 2026-01-13
**Updated**: 2026-01-13 (Pass 2 - HIGH priority fixes)
**Review Source**: `/docs/reviews/dht-peer-discovery_AREA_OWNER_REVIEW.md`
**Overall Review Score**: 76/100

---

## Summary

- **Total issues identified**: 17 (3 CRITICAL, 6 HIGH, 8 MEDIUM)
- **Auto-fixed (S effort)**: 7
- **Flagged for review (M/L effort)**: 8
- **Not actionable (false positive)**: 1
- **Skipped (files not found)**: 1

---

## CRITICAL Issues

### FIXED: C1 - Blocking DNS Resolution Stalls Async Runtime

**Status: FIXED**

#### Problem
`DnsSeed::resolve()` at `src/discovery/seed_list.rs:160-169` used synchronous `to_socket_addrs()` which blocks the async runtime during DNS resolution, affecting all concurrent tasks.

#### Changes Made
- `src/discovery/seed_list.rs:161-178`: Replaced `to_socket_addrs()` with `tokio::net::lookup_host()` with 10-second timeout
- `src/discovery/seed_list.rs:181-189`: Made `resolve_to_entries()` async
- `src/discovery/seed_list.rs:222-229`: Made `resolve_dns_seeds()` async
- `src/node/manager.rs:824`: Added `.await` to `resolve_dns_seeds()` call

#### Files Modified
- `src/discovery/seed_list.rs`
- `src/node/manager.rs`

---

### NEEDS_HUMAN_REVIEW: C2 - Eclipse Attack Vulnerability

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires architectural changes to routing table bucket management
- **Risk**: Security-critical feature that needs careful design and testing

#### Recommended Implementation Plan
1. Add subnet tracking struct to `KBucket` (HashMap of subnet prefix -> count)
2. In `KBucket::update()`, check if new node's /24 (IPv4) or /48 (IPv6) subnet is at limit
3. Add `per_subnet_limit` constant (suggested: 2 nodes)
4. Reject nodes from over-represented subnets
5. Add `min_bucket_diversity` check - prefer nodes that increase subnet diversity
6. Add `first_seen` timestamp to `NodeEntry` and prefer longer-lived nodes during eviction
7. Add unit tests for subnet limit enforcement

#### Files Involved
- `src/dht/routing_table.rs` (add subnet tracking, modify update logic)
- `src/dht/constants.rs` (add SUBNET_LIMIT constant)

#### Estimated Effort
4-8 hours including tests

---

### NEEDS_HUMAN_REVIEW: C3 - Unsigned Provider Records Enable Content Poisoning

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires changes to data structures, serialization, and verification logic
- **Risk**: Security-critical; incorrect implementation could break content discovery

#### Recommended Implementation Plan
1. Add `signature: [u8; 64]` field to `ProviderRecord` struct
2. Create signing function: `sign_provider_record(content_hash, node_id, timestamp, keypair) -> signature`
3. Create verification function: `verify_provider_record(record, content_hash) -> bool`
4. Update `add_provider()` to verify signature before storing
5. Update STORE handler in `manager.rs` to require and verify signature
6. Add tests for signature verification

#### Files Involved
- `src/dht/provider_store.rs` (add signature field, verification)
- `src/dht/manager.rs` (verify on STORE handling)
- `src/dht/messages.rs` (update wire format if needed)

#### Estimated Effort
6-10 hours including tests

---

## HIGH Priority Issues

### NEEDS_HUMAN_REVIEW: H1 - STORE Always Accepts Without Validation

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires rate limiting infrastructure and validation logic
- **Risk**: Affects network security; needs careful design

#### Recommended Implementation Plan
1. Add per-sender rate limiter (suggested: HashMap<NodeId, TokenBucket>)
2. Require content hash proof (node must prove they have the content)
3. Integrate with signed provider records (C3)
4. Add `max_providers_per_sender` limit
5. Log rejected STORE attempts

#### Files Involved
- `src/dht/manager.rs:220-229` (add validation to STORE handler)

#### Estimated Effort
4-6 hours

---

### NEEDS_HUMAN_REVIEW: H2 - No DHT Persistence

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires sled database integration and serialization
- **Risk**: Data format needs versioning for future upgrades

#### Recommended Implementation Plan
1. Add sled tree for routing table persistence
2. Implement `RoutingTable::save()` and `RoutingTable::load()`
3. Add sled tree for provider store persistence
4. Implement periodic save (e.g., every 5 minutes)
5. Save on graceful shutdown
6. Add versioned format prefix for future migrations

#### Files Involved
- `src/dht/routing_table.rs` (add persistence methods)
- `src/dht/provider_store.rs` (add persistence methods)
- `src/dht/manager.rs` (trigger saves)

#### Estimated Effort
6-10 hours

---

### NEEDS_HUMAN_REVIEW: H3 - No Message Authentication

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires wire format changes and signature infrastructure
- **Risk**: Protocol-level change affects all nodes

#### Recommended Implementation Plan
1. Add optional `signature` field to DHT messages
2. Sign `(msg_type, payload, timestamp)` with node's Ed25519 key
3. On receive, verify sender_id matches signature before processing
4. Make signature optional for backward compatibility initially
5. Log unsigned messages for monitoring

#### Files Involved
- `src/dht/manager.rs:150-157` (add verification)
- `src/dht/messages.rs` (add signature field)

#### Estimated Effort
6-8 hours

---

### FIXED: H4 - NodeStatusBar Status Dot Uses Color Alone

**Status: FIXED**

#### Problem
Status dot in NodeStatusBar used color alone to convey status (green=running, yellow=connecting, red=stopped), which is inaccessible to users with color vision deficiencies (WCAG 1.4.1 violation).

#### Changes Made
- `forum-client/src/components/NodeStatusBar.tsx:80-91`: Added `icon` and `ariaLabel` properties to status indicator
  - Checking: ○ (circle)
  - Stopped: ✕ (X mark)
  - Connecting: ↻ (spinning arrow)
  - Running: ✓ (checkmark)
- `forum-client/src/components/NodeStatusBar.tsx:98-107`: Added `role="status"`, `aria-live="polite"`, and `aria-label` for screen reader support; status dot now displays icon inside colored circle
- `forum-client/src/components/NodeStatusBar.css:26-38`: Updated `.status-dot` to be 16x16px with flexbox centering for icon display

#### Files Modified
- `forum-client/src/components/NodeStatusBar.tsx`
- `forum-client/src/components/NodeStatusBar.css`

---

### FIXED: H5 - NodeStatusBar Dropdown Not Keyboard Accessible

**Status: FIXED**

#### Problem
Node controls dropdown menu was click-only with no keyboard navigation (WCAG 2.1.1 violation). Keyboard-only users could not access Stop Node, Restart Node, Settings, or Documentation actions.

#### Changes Made
- `forum-client/src/components/NodeStatusBar.tsx:6`: Added `useRef` and `KeyboardEvent` imports
- `forum-client/src/components/NodeStatusBar.tsx:27-29`: Added `focusedIndex` state and refs for dropdown/trigger
- `forum-client/src/components/NodeStatusBar.tsx:55-89`: Added effects for:
  - Close on Escape key (returns focus to trigger button)
  - Close on click outside
  - Focus management for dropdown items
- `forum-client/src/components/NodeStatusBar.tsx:114-150`: Added keyboard handlers:
  - `handleDropdownKeyDown`: Arrow Up/Down navigation, Home/End, Tab to close
  - `handleTriggerKeyDown`: ArrowDown/Enter/Space to open and focus first item
- `forum-client/src/components/NodeStatusBar.tsx:213-255`: Updated button and dropdown elements:
  - Added `ref`, `onKeyDown`, `aria-haspopup="menu"`, `aria-expanded`, `aria-label` to trigger button
  - Added `ref`, `role="menu"`, `aria-label`, `onKeyDown` to dropdown
  - Added `role="menuitem"` to all dropdown buttons

#### Files Modified
- `forum-client/src/components/NodeStatusBar.tsx`

---

### NEEDS_HUMAN_REVIEW: H6 - Integration Tests Not Implemented

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: 18 test stubs need implementation
- **Risk**: Low risk but high effort

#### Recommended Implementation Plan
1. Review each `todo!()` stub in `tests/peer_store_integration.rs`
2. Implement tests for router/PeerStore integration
3. Add multi-node test scenarios
4. Add edge case coverage

#### Files Involved
- `tests/peer_store_integration.rs`

#### Estimated Effort
8-12 hours

---

## MEDIUM Priority Issues

### NEEDS_HUMAN_REVIEW: M1 - Sequential Lookup Processing

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Architectural change to lookup algorithm
- **Risk**: Could affect lookup correctness if done wrong

#### Recommended Implementation Plan
1. Replace `join_all()` with `FuturesUnordered`
2. Process results as they arrive using `while let Some(result) = futures.next().await`
3. Update candidates heap incrementally
4. Add early termination check after each result

#### Files Involved
- `src/dht/lookup.rs:207-238`

#### Estimated Effort
3-5 hours

---

### NEEDS_HUMAN_REVIEW: M2 - O(n) Full Table Scans in PeerStore

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: Requires adding index data structure

#### Recommended Implementation Plan
1. Add `score_index: BTreeMap<OrderedFloat<f32>, HashSet<PeerKey>>` to PeerStore
2. Update index on score changes
3. Use index for O(1) eviction candidate selection
4. Benchmark to verify improvement

#### Files Involved
- `src/discovery/peer_store.rs:70-78`

#### Estimated Effort
3-5 hours

---

### FIXED: M3 - Message Byte Documentation Discrepancy

**Status: FIXED**

#### Problem
MASTER_FEATURES.md documented message bytes as 0x40-0x43 (4 types), but implementation uses 0x80-0x87 (8 types).

#### Changes Made
- `docs/MASTER_FEATURES.md`: Updated DHT Protocol Messages section to reflect actual values:
  - DHT_PING = 0x80
  - DHT_PONG = 0x81
  - DHT_FIND_NODE = 0x82
  - DHT_NODES = 0x83
  - DHT_FIND_VALUE = 0x84
  - DHT_PROVIDERS = 0x85
  - DHT_STORE = 0x86
  - DHT_STORE_ACK = 0x87

#### Files Modified
- `docs/MASTER_FEATURES.md`

---

### FIXED: M4 - Silent RPC Failures

**Status: FIXED**

#### Problem
Failed RPCs in lookup were silently ignored without logging, making debugging difficult.

#### Changes Made
- `src/dht/lookup.rs:234-242`: Added debug logging for failed RPCs in `do_lookup()`
- `src/dht/lookup.rs:360-368`: Added debug logging for failed RPCs in `do_lookup_value()`

Logging now includes:
- First 8 bytes of node ID (hex)
- Node address
- Error details

#### Files Modified
- `src/dht/lookup.rs`

---

### NEEDS_HUMAN_REVIEW: M5 - mDNS Not Implemented

**Status: NEEDS_HUMAN_REVIEW**

#### Why Not Auto-Implemented
- **Effort**: M
- **Scope**: New feature requiring mDNS library integration

#### Recommended Implementation Plan
1. Add `mdns` or `libmdns` dependency
2. Create `src/discovery/mdns.rs` module
3. Implement service advertisement and discovery
4. Integrate with DiscoveryManager as Layer 1

#### Estimated Effort
8-12 hours

---

### SKIPPED: M6 - No Bootstrap Progress Indicator

**Status: SKIPPED**

#### Reason
This is a UX enhancement requiring design decisions (what phases to show, estimated times, visual design). Flagged for product/design review before implementation.

---

### NOT_ACTIONABLE: M7 - PeerBranchTracker Not Thread-Safe

**Status: NOT_ACTIONABLE (False Positive)**

#### Analysis
The review flagged `PeerBranchTracker` struct as not thread-safe because it uses plain `HashMap` internally. However, upon code analysis, this is **already correctly handled** at all usage sites:

- `src/node/manager.rs:564`: `Arc::new(RwLock::new(PeerBranchTracker::new()))`
- `src/node/router/router.rs:142`: `peer_branch_tracker: Option<Arc<RwLock<PeerBranchTracker>>>`
- `src/node/tasks.rs:320`: `peer_branch_tracker: Arc<RwLock<PeerBranchTracker>>`

The struct itself doesn't need internal synchronization because callers wrap it in `Arc<RwLock<>>` following standard Rust patterns. This is the recommended approach for allowing flexibility in usage (some callers may only need single-threaded access).

**No changes required.**

---

### FIXED: M8 - DebugPanel Peer Table Headers Lack Scope

**Status: FIXED**

#### Problem
Table headers in DebugPanel's peer list lacked `scope` attribute, making table navigation difficult for screen reader users (WCAG 1.3.1 violation).

#### Changes Made
- `forum-client/src/components/DebugPanel.tsx:215-217`: Added `scope="col"` to all `<th>` elements in peer table

#### Files Modified
- `forum-client/src/components/DebugPanel.tsx`

---

## Validation

### Cargo Check Results (Pass 1)
- **Status**: PASSED
- **Errors**: 0
- **Warnings**: 75 (all pre-existing, unrelated to changes)

### TypeScript Type Check (Pass 2)
- **Status**: PASSED
- **Directory**: `forum-client/`
- **Command**: `npx tsc --noEmit`
- **Errors**: 0

---

## Files Modified

| File | Changes |
|------|---------|
| `src/discovery/seed_list.rs` | Made DNS resolution async with timeout |
| `src/node/manager.rs` | Added await to async DNS resolution call |
| `src/dht/lookup.rs` | Added debug logging for RPC failures |
| `docs/MASTER_FEATURES.md` | Fixed DHT message byte documentation |
| `forum-client/src/components/NodeStatusBar.tsx` | Added status icons (H4), keyboard navigation (H5), ARIA attributes |
| `forum-client/src/components/NodeStatusBar.css` | Updated status dot styling for icons |
| `forum-client/src/components/DebugPanel.tsx` | Added `scope="col"` to table headers (M8) |

---

## Recommendations

### Immediate Actions (Before Next Sprint)
1. Address C2 (Eclipse Attack) - CRITICAL security issue
2. Address C3 (Unsigned Provider Records) - CRITICAL security issue
3. Address H1-H3 security-related HIGH issues

### Short Term (Next 2 Sprints)
1. Implement H6 (Integration Tests)
2. Address M1-M2 performance issues
3. Design M6 (Bootstrap Progress Indicator) with product team

### Long Term (Backlog)
1. Implement M5 (mDNS discovery)

---

## Summary by Priority

### CRITICAL Issues (3)
- ✅ C1: Blocking DNS Resolution - FIXED
- ⏳ C2: Eclipse Attack Vulnerability - NEEDS_HUMAN_REVIEW
- ⏳ C3: Unsigned Provider Records - NEEDS_HUMAN_REVIEW

### HIGH Issues (6)
- ⏳ H1: STORE Without Validation - NEEDS_HUMAN_REVIEW
- ⏳ H2: No DHT Persistence - NEEDS_HUMAN_REVIEW
- ⏳ H3: No Message Authentication - NEEDS_HUMAN_REVIEW
- ✅ H4: Color-Only Status Indicator - FIXED
- ✅ H5: Keyboard Navigation - FIXED
- ⏳ H6: Integration Tests - NEEDS_HUMAN_REVIEW

### MEDIUM Issues (8)
- ⏳ M1: Sequential Lookup - NEEDS_HUMAN_REVIEW
- ⏳ M2: O(n) Table Scans - NEEDS_HUMAN_REVIEW
- ✅ M3: Documentation Discrepancy - FIXED
- ✅ M4: Silent RPC Failures - FIXED
- ⏳ M5: mDNS Not Implemented - NEEDS_HUMAN_REVIEW
- ⏸️ M6: Bootstrap Progress - SKIPPED (needs design)
- ✔️ M7: Thread Safety - NOT_ACTIONABLE (false positive)
- ✅ M8: Table Header Scope - FIXED

---

*Action log generated: 2026-01-13*
*Pass 2 completed: 2026-01-13*
