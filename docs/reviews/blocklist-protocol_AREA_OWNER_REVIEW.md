# Area Owner Review: Blocklist Protocol

**Generated**: 2026-01-12
**Overall Health Score**: 73/100
**Status**: Needs Attention

## Executive Summary

The Blocklist Protocol has a solid architectural foundation with well-designed data structures, comprehensive unit testing (88+ tests), and proper multi-layer integration (RPC, Router, Anti-Abuse). However, three critical implementation gaps block production readiness: (1) wire protocol message ID conflict with fork subsystem (0x55), (2) missing Ed25519 signature verification allowing forged updates, and (3) router storage limitation preventing network-based blocklist synchronization. The addition flow works correctly with the 3-attester threshold, but removal flow, gossip forwarding, and Merkle reconciliation remain incomplete. Immediate attention required on security-critical signature verification before deployment.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 70/100 | 🟡 |
| Performance | 75/100 | 🟡 |
| Vision Alignment | 81/100 | 🟢 |
| User Experience | 70/100 | 🟡 |
| Accessibility | 58/100 | 🔴 |
| Quality | 75/100 | 🟡 |
| Security | 65/100 | 🟡 |
| **Overall** | **73/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Wire Protocol Message ID Conflict (0x55)
- **Source**: Functionality, Vision, Security Reviews
- **Severity**: Critical
- **Description**: `MSG_BLOCKLIST_UPDATE` (0x55) in `src/blocklist/gossip.rs:18` conflicts with `MSG_FORKINFO` (0x55) in `src/types/constants.rs:441`. Both subsystems use the same message identifier.
- **Impact**: Message routing corruption when both fork and blocklist features are active. Nodes may process blocklist updates as fork info or vice versa, causing unpredictable behavior and potential security vulnerabilities.
- **Action**: Reassign blocklist messages to unused range:
  - `MSG_BLOCKLIST_UPDATE = 0x85`
  - `MSG_BLOCKLIST_SYNC = 0x86`
  - `MSG_BLOCKLIST_REQUEST = 0x87`
- **Effort**: S (Small - constant changes + router handler updates)

### 2. Missing Ed25519 Signature Verification
- **Source**: Security, Functionality, Quality Reviews
- **Severity**: Critical (CVSS 9.1)
- **Description**: `validate_update()` in `src/blocklist/gossip.rs:142-144` contains a TODO comment but never verifies the Ed25519 signature on `BlocklistUpdate` messages.
- **Impact**: Malicious nodes can forge blocklist updates to censor arbitrary legitimate content. Any node can claim content is illegal without proof of attestation. Completely undermines the trust model.
- **Action**: Implement signature verification:
  ```rust
  // In validate_update()
  let signing_message = update.signing_message();
  if !ed25519_verify(&update.reporting_node, &signing_message, &update.signature) {
      return Err(BlocklistError::InvalidSignature);
  }
  ```
- **Effort**: M (Medium - implement verification + add tests)

### 3. Router Cannot Store Network Updates
- **Source**: Functionality, Quality, Vision Reviews
- **Severity**: Critical
- **Description**: Router holds `Arc<BlocklistStore>` but `BlocklistStore::add()` requires `&mut self`. At `src/node/router/router.rs:4487-4490`, updates are logged but never persisted.
- **Impact**: Distributed blocklist synchronization is completely broken. Nodes cannot receive blocklist updates from the network - only local RPC additions work. Defeats the purpose of a distributed blocklist.
- **Action**: Change storage wrapper in node manager:
  ```rust
  // In NodeManager
  self.blocklist = Some(Arc::new(RwLock::new(blocklist)));

  // In Router handlers
  let mut store = self.blocklist.write().await;
  store.add_or_update(entry)?;
  ```
- **Effort**: M (Medium - affects manager, router, and potentially RPC layer)

## High Priority Issues

### 1. Simplified Sybil Resistance
- **Source**: Security, Functionality Reviews
- **Severity**: High (CVSS 8.1)
- **Description**: `process_attestation()` uses simple attester ID comparison instead of full sponsor tree verification per SPEC_12 Section 4.4.
- **Impact**: Attackers with multiple identities from the same sponsor tree can bypass the 3-attester threshold.
- **Action**: Integrate sponsor tree lookup and verify attesters are from independent trees.
- **Effort**: M

### 2. Unbounded Vector Deserialization
- **Source**: Security, Performance Reviews
- **Severity**: High (CVSS 7.5)
- **Description**: `BlocklistUpdate::from_bytes()` deserializes attestation vectors without size limits.
- **Impact**: Memory exhaustion attack via crafted messages with millions of attestations.
- **Action**: Add `MAX_ATTESTATIONS_PER_UPDATE = 100` constant and validate during deserialization.
- **Effort**: S

### 3. Incomplete Gossip Forwarding
- **Source**: Functionality Review
- **Severity**: High
- **Description**: Router handlers in `handle_blocklist_update()` validate and log updates but never forward to peers. `BlocklistGossip::peers_to_forward()` exists but is unused.
- **Impact**: Blocklist updates don't propagate through the network. Each node is an island.
- **Action**: After validation, call `peers_to_forward()` and send to selected peers.
- **Effort**: M

### 4. Merkle Root Recomputation on Every Write
- **Source**: Performance Review
- **Severity**: High
- **Description**: Every `add()` or `remove()` triggers O(n log n) full Merkle tree rebuild.
- **Impact**: At 10K+ entries, add operations take 100ms+, causing latency spikes.
- **Action**: Implement incremental Merkle tree updates or batch processing.
- **Effort**: L (Large - significant refactor)

## Medium Priority Issues

### 1. Cryptic Error Messages
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Users see "Content rejected: matches blocklist" with no explanation or recourse.
- **Impact**: Users cannot understand why content was rejected or appeal false positives.
- **Action**: Improve to: "This content matches the signature of known harmful material. If you believe this is an error, please contact support."
- **Effort**: S

### 2. Missing Focus Management in Modals
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: `ReportModal.tsx` doesn't trap focus or move focus to modal when opened.
- **Impact**: Keyboard users cannot navigate the modal; fails WCAG 2.4.3.
- **Action**: Implement focus trap using `useEffect` to focus first element and trap Tab key.
- **Effort**: S

### 3. SVG Icons Lack Accessible Names
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: SVG icons in `BlockButton.tsx:95-98` have no `aria-label` or `role="img"`.
- **Impact**: Screen readers skip or misannounce icons; fails WCAG 1.1.1.
- **Action**: Add `aria-hidden="true"` to decorative icons, `role="img" aria-label="..."` to meaningful ones.
- **Effort**: S

### 4. Unbounded HashMap Growth in Gossip State
- **Source**: Performance, Security Reviews
- **Severity**: Medium
- **Description**: `pending_attestations` and `seen_by_peers` HashMaps grow without limit.
- **Impact**: Memory exhaustion over time; attackers can accelerate by flooding attestations.
- **Action**: Implement LRU eviction with `max_pending = 10000` and `max_seen = 50000`.
- **Effort**: S

### 5. Color Contrast Failures
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Tertiary text using #888 on dark backgrounds fails WCAG 4.5:1 contrast ratio.
- **Impact**: Low vision users cannot read secondary information.
- **Action**: Change tertiary color to #aaa or lighter.
- **Effort**: S

### 6. Incomplete 5-Anchor Removal Flow
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Counter-attestation accumulation and Anchor-level verification not wired despite constants existing.
- **Impact**: No mechanism to remove false positives from blocklist.
- **Action**: Implement counter-attestation processing mirroring the addition flow.
- **Effort**: L

## Quick Wins (Low Effort, High Impact)

1. **Fix message ID conflict**: Change 3 constants (0x55 -> 0x85, etc.) - 30 minutes
2. **Add vector size limits**: Add constant + one check in deserializer - 1 hour
3. **Improve error message**: Single string change in RPC methods - 15 minutes
4. **Add aria-hidden to SVG icons**: Few lines per component - 1 hour
5. **Fix color contrast**: CSS variable change - 15 minutes
6. **Add bounded HashMap cleanup**: Add `max_entries` to existing `cleanup_*` methods - 2 hours

## Strengths to Preserve

- **Strong architectural design**: Clean separation into types, storage, gossip, merkle modules
- **Hash-based privacy preservation**: Never stores or scans actual illegal content
- **Comprehensive unit testing**: 88+ tests across all modules with good coverage
- **Well-documented code**: SPEC references throughout, clear error taxonomy
- **Defense in depth**: Checks at RPC, Router, and Anti-Abuse layers
- **Vision-aligned governance**: Community-driven thresholds (3 to add, 5 Anchors to remove)
- **Extensible design**: `BlocklistReason` enum supports future categories

## Action Plan for Area Owner

### Immediate (This Sprint)

- [ ] **P0**: Reassign wire protocol message IDs to 0x85-0x87
- [ ] **P0**: Implement Ed25519 signature verification in `validate_update()`
- [ ] **P0**: Wrap `BlocklistStore` in `RwLock` for router storage
- [ ] **P1**: Add maximum attestation count validation (100 max)
- [ ] **P1**: Improve rejection error message with user guidance

### Short Term (Next 2-4 Weeks)

- [ ] Implement gossip forwarding in router handlers
- [ ] Add LRU eviction to gossip state HashMaps
- [ ] Fix accessibility issues (focus trap, ARIA labels, contrast)
- [ ] Add integration test: full attestation -> blocklist -> rejection flow
- [ ] Implement sponsor tree verification for Sybil resistance
- [ ] Add per-peer rate limiting on attestation processing

### Long Term (Backlog)

- [ ] Implement incremental Merkle tree updates
- [ ] Complete 5-Anchor removal flow
- [ ] Add dedicated RPC query methods (blocklist_check, blocklist_list, blocklist_stats)
- [ ] Implement CLI commands for blocklist management
- [ ] Full Merkle reconciliation (request missing entries)
- [ ] External database integration (NCMEC import)
- [ ] Add bloom filter for negative lookup optimization
- [ ] Create illegal content reporting UI flow separate from spam

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Signature verification TODO | M | H | 1 |
| Router storage mutability | M | H | 1 |
| Message ID conflict | S | H | 1 |
| Simplified Sybil check | M | H | 2 |
| Gossip forwarding incomplete | M | H | 2 |
| 5-Anchor removal flow | L | M | 3 |
| Merkle reconciliation incomplete | M | M | 3 |
| Missing RPC query methods | S | M | 4 |
| Missing CLI commands | S | L | 5 |
| Full sponsor tree verification | L | M | 4 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Forged blocklist updates censor content | H (no sig check) | H | Implement signature verification immediately |
| Message routing corruption | M (both features active) | H | Reassign message IDs before fork feature deployment |
| Memory exhaustion via large vectors | M | M | Add size limits in deserialization |
| Network desync (router can't store) | H (confirmed) | H | Add RwLock wrapper |
| Sybil attack bypasses threshold | M | H | Implement sponsor tree verification |
| Performance degradation at scale | M | M | Implement incremental Merkle updates |
| False positives with no recourse | L | H | Complete removal flow |
| Accessibility lawsuits | L | M | Fix WCAG failures |

## Appendix: Detailed Review Summaries

### Functionality
The core addition path works correctly with 3-attester threshold enforcement. However, three critical blockers exist: wire protocol message ID conflict (0x55 shared with fork), missing signature verification, and router's inability to persist network updates due to Arc/mut mismatch. The removal flow, gossip forwarding, and Merkle reconciliation remain incomplete. APIs are well-designed with proper error types, but integration is broken at the router layer.

**Key Metrics**:
- Completeness: 16/25
- Correctness: 18/25
- API Design: 21/25
- Integration: 15/25

### Performance
Efficient O(log n) lookups using sled's B+ tree structure. Primary concerns: O(n log n) Merkle root recomputation on every write (problematic at 10K+ entries), unbounded HashMap growth in gossip state, and full table scans for filtered queries.

**Scale Thresholds**:
| Scale | Entries | Merkle Build | Risk |
|-------|---------|--------------|------|
| Small | <1K | <1ms | Low |
| Medium | 1K-10K | 10-100ms | Medium |
| Large | 10K-100K | 100ms-1s | High |

**Recommended Optimizations**: Incremental Merkle updates, bloom filter for negative lookups, batch processing, secondary indexes.

### Vision Alignment
Strong alignment with Swimchain's decentralized vision. Community-driven governance through attestation thresholds (3 to add, 5 Anchors to remove) preserves no-central-authority philosophy. Hash-based identification maintains privacy. Each node enforces independently.

**Concerns**: `ExternalList` reason could create external authority dependency; simplified Sybil check deviates from SPEC_12 Section 4.4.

### User Experience
Client-side personal blocklist has polished UI with intuitive controls and smooth animations. Protocol-level illegal content blocking is nearly invisible to users - no tracking of report contributions, cryptic rejection messages, and no dedicated reporting flow.

**Critical Gaps**:
- Two distinct blocklist concepts (personal vs network) conflated
- Error message "Content rejected: matches blocklist" provides no guidance
- No visibility into network blocklist status

### Accessibility
Does not meet WCAG 2.1 AA. Critical failures across all four WCAG principles.

| Criterion | Status |
|-----------|--------|
| 1.1.1 Non-text Content | Fail |
| 1.4.3 Contrast | Fail |
| 2.1.1 Keyboard | Partial |
| 2.4.3 Focus Order | Partial |
| 2.4.7 Focus Visible | Fail |
| 4.1.2 Name, Role, Value | Partial |

### Quality
Well-structured codebase with 5 focused modules, excellent naming conventions, and comprehensive documentation with SPEC references. Strong unit test coverage (88+ tests) but no integration or e2e tests.

**Test Coverage**:
| Module | Unit Tests | Integration |
|--------|------------|-------------|
| types.rs | 13 | None |
| storage.rs | 9 | None |
| gossip.rs | 10 | None |
| merkle.rs | 12 | None |

**Missing Tests**: Router integration, signature verification, concurrent access, network partition recovery.

### Security
Appropriate cryptographic primitives (SHA-256, Ed25519, Blake3) but critical implementation gaps.

**Vulnerabilities by Severity**:
| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 3 | Missing signature verification (CVSS 9.1), message ID conflict, router storage |
| High | 2 | Simplified Sybil check (CVSS 8.1), unbounded vectors (CVSS 7.5) |
| Medium | 3 | Unbounded HashMaps, no rate limiting, unbounded BlocklistRequest |
| Low | 2 | Silent failure on storage error, metadata leakage |

---

*Review completed: 2026-01-12*
*Synthesized from: Functionality, Performance, Vision, UX, Accessibility, Quality, and Security perspectives*
