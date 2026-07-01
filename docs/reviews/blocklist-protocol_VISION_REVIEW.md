# Vision & Spec Alignment Review: Blocklist Protocol

**Reviewer Type**: Vision & Spec Alignment Expert
**Feature**: Blocklist Protocol (Section 19)
**Specification**: SPEC_12 Sections 3.6, 4.4, 4.6, 5.4-5.5
**Date**: 2026-01-12

---

## Summary

The Blocklist Protocol demonstrates **strong alignment** with Swimchain's decentralized vision while addressing the critical need for illegal content moderation. It successfully maintains the community-driven governance philosophy through attestation thresholds (3 to add, 5 Anchors to remove) and avoids creating central points of control. However, there are notable spec deviations, architectural concerns around the wire protocol message ID conflict, and incomplete implementations that could undermine the protocol's integrity in production.

---

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong decentralization; minor Sybil verification gap |
| Spec Compliance | 18 | 25 | Message ID conflict; missing signature verification |
| Architectural Fit | 20 | 25 | Good module structure; router storage limitation |
| Future Compatibility | 17 | 20 | Extensible design; needs migration plan for message IDs |
| **Total** | **81** | **100** | Good foundation with critical issues to address |

---

## Vision Alignment Assessment

### Supports Vision

**1. Decentralized Moderation (Excellent)**
- No central authority decides what to block
- Community-driven through 3-attester threshold
- Hash-based identification - never stores illegal content
- Each node enforces blocklist independently

**2. Sybil-Resistant Design (Good)**
- Requires attestations from independent sponsor trees (per spec)
- Higher bar for removal (5 Anchor-level attesters)
- PoW requirement on attestations prevents spam
- Leverages existing SwimmerLevel system for trust

**3. Privacy-Preserving (Excellent)**
- No content scanning - only hash matching
- Attesters attest to specific hashes, not content types
- Propagation via gossip, not centralized database
- Merkle tree sync for eventual consistency without revealing full blocklist

**4. User Empowerment (Good)**
- Users can participate in moderation through attestations
- Counter-attestation mechanism for dispute resolution
- Level progression rewards trusted community members with removal authority

**5. Organic Moderation Philosophy (Good)**
- Integrates with decay system - blocked content removed from network
- Attestation propagation follows gossip patterns
- No permanent, irrevocable decisions (removal possible)

### Vision Concerns

**1. Simplified Sybil Check (-2 points)**
The current implementation uses attester ID comparison instead of full sponsor tree verification:

```rust
// gossip.rs:77 - Current simplified check
if existing.attester == attestation.attester {
    return Err(BlocklistError::DuplicateSponsorTree);
}
```

Per SPEC_12 §4.4, attestations should be from **independent sponsor trees**, not just different attesters. An attacker controlling multiple identities in the same sponsor tree could potentially manipulate blocklist additions.

**2. External List Integration Risk (-2 points)**
The `BlocklistReason::ExternalList` variant allows importing hashes from external databases (NCMEC, etc.). While practical for combating illegal content, this:
- Creates dependency on external authorities
- Could be weaponized if external lists are compromised
- Needs clear governance around which external lists are trusted

**Recommendation**: Require explicit node operator opt-in for external lists, with cryptographic verification of list authenticity.

---

## Spec Deviations

| Spec Reference | Expected | Actual | Severity |
|----------------|----------|--------|----------|
| SPEC_12 §5.1 | MSG_BLOCKLIST_UPDATE = 0x55 (unique) | 0x55 conflicts with MSG_FORKINFO | **Critical** |
| SPEC_12 §4.4 | Independent sponsor tree verification | Attester ID comparison only | High |
| SPEC_12 §5.4 | Ed25519 signature verification | TODO - not implemented | High |
| SPEC_12 §4.7 | Priority queuing for attestations | Not implemented | Medium |
| SPEC_12 §4.6 | Full Merkle reconciliation | Partial - sync only, no entry request | Medium |
| Feature Doc | MIN_BLOCKLIST_CONFIRMATIONS = 3 | Code has = 10 | Low (doc outdated) |

### Critical: Wire Protocol Message ID Conflict

**Impact**: Message routing ambiguity when both fork and blocklist features are active.

**Evidence**:
- `src/blocklist/gossip.rs:18`: `MSG_BLOCKLIST_UPDATE = 0x55`
- `src/types/constants.rs:441`: `MSG_FORKINFO = 0x55`

**Risk**: When a node receives message type 0x55:
1. Router line 298 handles it as `MSG_FORKINFO` for fork operations
2. Line 326 handles it as `MSG_BLOCKLIST_UPDATE` for blocklist
3. Behavior depends on which match arm is reached first

**Resolution Required**: Reassign blocklist messages to unused range (0x85-0x87 are available).

---

## Architectural Observations

### Fits Well

**1. Module Organization**
```
src/blocklist/
├── types.rs      # Data structures per SPEC_12 §3.6
├── storage.rs    # Sled persistence (consistent with storage layer)
├── gossip.rs     # Protocol operations (consistent with network layer)
├── merkle.rs     # Sync mechanisms (consistent with sync patterns)
└── error.rs      # Error handling (consistent with error patterns)
```

**2. Integration Points**
- RPC layer correctly checks blocklist before content creation
- Router correctly checks blocklist before storing network content
- Anti-abuse handler provides consistent interface for retrieval checks
- Uses existing `SpamAttestation` infrastructure

**3. Data Structure Consistency**
- `BlocklistEntry` follows the pattern of other indexed structures
- Wire protocol messages use consistent serialization (little-endian)
- Merkle tree implementation matches chain sync patterns

### Concerns

**1. Router Storage Limitation (Architecture Issue)**
```rust
// router.rs - Has Arc<BlocklistStore> but add() requires &mut self
// Cannot store updates received from network
```

The router can only **validate** blocklist updates, not **store** them. This breaks the gossip propagation model where nodes should both validate and store updates they receive.

**Resolution**: Wrap in `Arc<RwLock<BlocklistStore>>` following the pattern used for other mutable stores.

**2. Missing Gossip Forwarding**
Per the architecture, validated updates should be forwarded to peers. Current implementation:
```rust
// router.rs:4487-4490
// Note: BlocklistStore requires &mut self for add(), but we have Arc<BlocklistStore>.
// For now, we log the update and trust that the RPC layer will handle storage.
```

This defeats the purpose of gossip-based propagation.

**3. Consistency with Spam Attestation Layer**
The blocklist uses `SpamAttestation` but diverges in validation:
- Spam attestation validates attester level (Resident+)
- Blocklist doesn't verify attester level on incoming updates
- Could allow unqualified attesters to contribute to blocklist additions

---

## Future Compatibility

### Extensibility (Good)

**1. Reason Enum Extensibility**
```rust
pub enum BlocklistReason {
    CSAM = 0x01,
    Terrorism = 0x02,
    ExternalList = 0x03,
    // Room for 0x04-0xFF future reasons
}
```

**2. Message Format Extensibility**
- Variable-length attestation lists allow future attestation format changes
- Reserved bytes in message headers for future flags

**3. Merkle Sync Extensibility**
- Can add proof verification without protocol changes
- Supports partial sync via `BlocklistRequest`

### Breaking Change Risks

**1. Message ID Resolution (Breaking)**
Fixing the 0x55 conflict requires:
- Coordinated network upgrade
- Protocol version bump
- All nodes must update simultaneously

**Recommendation**:
```rust
// In SPEC_12 update and constants.rs
pub const MSG_BLOCKLIST_UPDATE: u8 = 0x85;  // New ID
pub const MSG_BLOCKLIST_SYNC: u8 = 0x86;    // New ID
pub const MSG_BLOCKLIST_REQUEST: u8 = 0x87; // New ID
```

**2. Signature Verification (Non-Breaking)**
Adding signature verification is additive:
- Nodes can start verifying without breaking old messages
- Grace period: accept unsigned during transition

**3. Full Sponsor Tree Verification (Potentially Breaking)**
Implementing proper sponsor tree checks may:
- Reject previously accepted attestations
- Require re-attestation of existing entries
- Need migration plan for existing blocklist entries

---

## Recommendations

### Priority 1: Critical (Must Fix Before Production)

1. **Resolve Wire Protocol Conflict**
   - Assign unique message IDs: 0x85, 0x86, 0x87
   - Update SPEC_12, constants.rs, blocklist/gossip.rs
   - Coordinate network-wide upgrade

2. **Implement Signature Verification**
   - `validate_update()` must verify Ed25519 signatures
   - Reject unsigned updates after transition period
   - Use existing `crypto::verify_signature()` infrastructure

3. **Fix Router Storage**
   - Change `Arc<BlocklistStore>` to `Arc<RwLock<BlocklistStore>>`
   - Enable router to store validated updates
   - Complete the gossip propagation loop

### Priority 2: High (Important for Vision Integrity)

4. **Implement Full Sponsor Tree Verification**
   - Integrate with `SponsortshipStore` for tree lookups
   - Verify attesters are from independent trees
   - Add `SponsorTreeRoot` to attestation if needed

5. **Add Attester Level Verification**
   - Verify attesters are Resident+ (Level 2+) per SPEC_12 §A2
   - Verify removal attesters are Anchor (Level 4+)
   - Use existing `SwimmerLevel` verification

6. **Implement Gossip Forwarding**
   - Router should forward validated updates to peers
   - Use `BlocklistGossip::peers_to_forward()` to determine recipients
   - Track propagation confirmations

### Priority 3: Medium (Protocol Completeness)

7. **Full Merkle Reconciliation**
   - When sync detects mismatch, request missing entries
   - Implement entry response handling
   - Add proof verification for received entries

8. **Priority Queuing**
   - Per SPEC_12 §4.7, blocklist updates should have CRITICAL priority
   - Implement priority queue in gossip layer

9. **Update Documentation**
   - Fix MIN_BLOCKLIST_CONFIRMATIONS discrepancy (doc says 3, code says 10)
   - Document message ID resolution

### Priority 4: Low (Enhancements)

10. **CLI Commands**
    - `cs blocklist check <hash>`
    - `cs blocklist list [--reason]`
    - `cs blocklist stats`

11. **External List Governance**
    - Implement opt-in mechanism for external lists
    - Add cryptographic verification of list sources

---

## Vision Compliance Summary

| Principle | Compliance | Notes |
|-----------|------------|-------|
| Decentralization | Strong | No central authority; community-driven |
| Identity = Keypair | Aligned | Uses Ed25519 pubkeys for attesters |
| PoW Spam Resistance | Aligned | Attestations require PoW |
| Organic Moderation | Aligned | Threshold-based, not automated |
| Privacy | Strong | Hash-based, no content scanning |
| Local-First | Aligned | Each node maintains own blocklist |

The Blocklist Protocol demonstrates thoughtful design that preserves Swimchain's decentralization ethos while addressing the legitimate need to prevent distribution of illegal content. The 3-attester addition and 5-Anchor removal thresholds create appropriate friction against both under-moderation and over-censorship.

**Key Insight**: The protocol succeeds in making content moderation a **community function** rather than a **platform function**, which is core to Swimchain's vision. However, the implementation gaps (message ID conflict, missing signature verification, incomplete gossip propagation) must be resolved before the protocol can be trusted in production.

---

*Review completed by Vision & Spec Alignment Expert*

DECISION: review_complete
