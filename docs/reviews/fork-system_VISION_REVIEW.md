# Vision & Spec Alignment Review: Fork System

## Summary

The Fork System implementation faithfully embodies Swimchain's core vision of community sovereignty and capture resistance through fork migration. The feature correctly implements identity preservation across forks (FK-H01), deterministic fork IDs (FK-H09), and identity exclusion at protocol level (FK-H05). However, the implementation has significant gaps: actual content migration is not implemented (FK-S05 partially unmet), cross-fork communication protocols are incomplete, and the spec's `TimeRange` for content filtering diverges from the implementation's simple `u64` timestamp.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Excellent decentralization, minor centralization risk in RPC |
| Spec Compliance | 18 | 25 | Content migration unimplemented, time_filter type mismatch |
| Architectural Fit | 22 | 25 | Clean module structure, follows established patterns |
| Future Compatibility | 19 | 20 | Extensible design, version fields present |
| **Total** | **85** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

**1. Community Sovereignty (VISION Section 5)**
The Fork System directly implements the "Fork-Friendly Chain Ecosystem" described in VISION.md. Key alignments:

- **"Any community can fork away from hostile takeovers or governance disputes"** - Implemented via `ForkRegistry::create_fork()` which allows any identity to initiate a fork with configurable parameters
- **"New forks can exclude known bad actors at protocol level"** - Implemented via `excluded_ids` in `ForkConfig` (genesis.rs:35-48)
- **"New forks can adjust PoW difficulty and decay parameters"** - Implemented via `pow_multiplier` and `decay_multiplier` in ForkConfig (clamped to 0.1-10.0 range)

**2. Identity IS the Keypair (Theorem 5.1 / FK-H01)**
The implementation correctly preserves identity across forks:
- `Identity` wrapper (registry.rs:13-54) uses Ed25519 keypairs that work universally
- `ForkRegistry::is_excluded()` checks identity against active fork's exclusion list, not global identity validity
- Same keypair can participate in any fork not explicitly excluding it

**3. No Central Authority (FK-H07)**
- Fork creation requires no permission from any central entity
- Fork IDs are deterministically computed from genesis content (`calculate_fork_id()` uses SHA-256)
- ForkStore uses local sled database, not remote servers
- Peer discovery via DHT is specified (SPEC_05 Section 4.5), though not fully implemented

**4. Exit as Power (THESIS_03)**
The implementation embodies the Hirschmanian exit-right:
- Zero exit cost: identity, reputation (via keypair), and content history (up to fork point) preserved
- Fork creation workflow captures parent chain state automatically
- `ForkCreationResult` includes `inherited_content_count` (though only as estimate)

**5. Evolutionary Governance (VISION.md)**
Fork configuration allows experimental governance:
- `pow_multiplier`: Communities can make posting harder or easier
- `decay_multiplier`: Communities can control content lifecycle
- `excluded_ids`: Communities can remove bad actors from inception

### Vision Concerns

**1. Centralization Risk in RPC Layer (Minor)**
The RPC interface (`create_fork` method) accepts a `secret_key` parameter directly (methods.rs). While functionally necessary, transmitting secret keys over RPC creates a potential centralization vector:
- If RPC endpoint is compromised, all fork creator identities are exposed
- Recommendation: Client-side signing with signature submission instead of key transmission

**2. Content Migration Incompleteness (Moderate)**
VISION.md states: "New forks can inherit content selectively" - but actual content copying is NOT implemented:
- `inherited_content_count` in `ForkCreationResult` is an **estimate only** (height * 10 for All mode)
- The `ContentSelector` enum exists but doesn't trigger actual content migration
- This violates FK-S05 ("Selective content inheritance SHOULD be possible")

**3. Fork Network Propagation Gap (Moderate)**
While wire protocol message types are defined (SPEC_05 Section 5.1: 0x53 ForkAnnounce, 0x54 ForkQuery, 0x55 ForkInfo), the feature doc notes:
> "handlers for propagating forks across the network are not fully implemented"

This limits the decentralized discovery of new forks, potentially requiring manual bootstrap.

**4. No Cross-Fork Sync (Significant)**
The feature lacks the ability to maintain connections to multiple forks simultaneously:
- Switching forks requires full re-sync
- Users cannot seamlessly follow content across fork boundaries
- This partially undermines the "zero exit cost" promise (coordination overhead remains)

---

## Spec Deviations

| Spec Requirement | Expected | Actual | Severity |
|------------------|----------|--------|----------|
| FK-S05 (Content inheritance) | Actual content copying | Estimate only (`inherited_content_count`) | **High** |
| `time_filter` type (SPEC_05 3.4) | `TimeRange { start: Option<u64>, end: Option<u64> }` | `Option<u64>` (single timestamp) | **Medium** |
| FK-S03 (Cross-fork bridges) | Content discoverable across forks | Not implemented | **Medium** |
| min_supporters (SPEC_05 3.3) | `>= 1` in ForkConfig | No minimum supporter validation in create_fork | **Low** |
| Fork cooldown (SPEC_05 3.3) | `fork_cooldown` enforced | Not checked in current implementation | **Low** |
| ForkAnnouncement wire protocol | Message type 0x50-0x55 | Types defined but handlers incomplete | **Medium** |

### MASTER_FEATURES.md Discrepancy
The feature doc correctly notes:
> "MASTER_FEATURES.md shows `time_filter: Option<TimeRange>` but the actual implementation uses `time_filter: Option<u64>`"

The spec (SPEC_05_FORKS_CONSENSUS.md Section 3.4) defines:
```
TimeRange {
    start:  Option<u64>
    end:    Option<u64>
}
```

The implementation only accepts a single Unix timestamp, losing the ability to specify time ranges.

---

## Architectural Observations

### Fits Well

**1. Module Structure**
Clean separation of concerns following Rust idioms:
```
src/fork/
  mod.rs       - Module exports, calculate_fork_id()
  genesis.rs   - ForkConfig, ForkConfigBuilder, ForkGenesis, ContentSelector
  registry.rs  - ForkRegistry, Identity, ForkInfo, ForkCreationResult, ForkError
  storage.rs   - ForkStore persistence, ForkStoreError
```

**2. Builder Pattern**
`ForkConfigBuilder` follows established patterns seen elsewhere in codebase, with fluent API:
```rust
ForkConfig::builder()
    .name("community-v2")
    .exclude_identity([0xBA; 32])
    .build()
```

**3. Storage Layer**
`ForkStore` uses sled with proper tree separation:
- `fork_genesis`: Genesis blocks keyed by ForkId
- `fork_known`: List of known fork IDs
- `fork_active`: Currently active fork

This mirrors the storage patterns used in ChainStore and ContentStore.

**4. Error Handling**
`ForkError` and `ForkStoreError` use `thiserror` with appropriate variants, consistent with project-wide error handling approach.

**5. Deterministic Fork IDs**
`calculate_fork_id()` correctly uses SHA-256 of serialized genesis, ensuring:
- Same genesis always produces same ID
- Different configurations produce different IDs
- Verifiable by any node

### Architectural Concerns

**1. RPC Selective Filter Limitation**
The RPC layer doesn't expose full `ContentSelector` capabilities:
```rust
// RPC accepts content_mode: "all" | "none" | "selective"
// But for "selective", space_filter/time_filter/identity_filter are all None
```

This forces users to use Rust API for full filtering, violating the principle of feature parity across interfaces.

**2. Linear Exclusion Check**
`ForkGenesis::is_excluded()` uses `Vec::contains()` which is O(n). For forks with large exclusion lists (e.g., spam resistance), this could become a bottleneck. The `ForkConfig` uses `HashSet` internally, but this is lost during genesis creation.

**3. Missing Signature Verification in add_fork_support**
The `add_fork_support` method adds supporter signatures but the feature doc doesn't indicate cryptographic verification of those signatures against the genesis content.

---

## Future Compatibility

### Extensibility

**1. Version Fields**
`ForkGenesis` includes `version: u32` (currently 1), allowing future protocol evolution without breaking existing forks.

**2. Serialization Robustness**
`ForkGenesis::to_bytes()` and `from_bytes()` enable forward-compatible serialization if new fields are added.

**3. Configurable Parameters**
All governance-relevant parameters (PoW multiplier, decay multiplier, exclusion lists) are in ForkConfig, allowing future additions without structural changes.

**4. Content Selector Extensibility**
The `Selective` variant of `ContentSelector` already has optional fields for space, time, and identity filtering - these can be extended with additional filter types.

### Breaking Change Risks

**1. TimeRange vs u64**
If the implementation is updated to match the spec's `TimeRange`, existing RPC clients expecting single timestamps will break.

**2. Content Migration Implementation**
When actual content migration is implemented, the semantics of `inherited_content_count` must change from "estimate" to "actual count" - this could break client assumptions.

**3. Fork Network Protocol**
Completing the fork propagation handlers (ForkAnnounce, ForkQuery, ForkInfo) may require wire protocol version bumps if message formats change.

### Migration Path Considerations

**1. Multi-Fork Sync**
Future implementation of multi-fork sync should consider:
- Storage partitioning by fork_id
- Connection multiplexing across forks
- Unified identity layer with fork-specific content layers

**2. Cross-Fork Content Bridges**
When implementing FK-S03 (cross-fork bridges), consider:
- Content addressing: `(fork_id, content_hash)` tuples as specified in SPEC_05 Section 9.3
- Lazy fetching of cross-fork referenced content
- Cache coherence across fork boundaries

---

## Recommendations

### Priority 1: Critical (Vision Alignment)

1. **Implement Actual Content Migration**
   - Current: `inherited_content_count` is purely an estimate
   - Required: Implement `inherit_content()` algorithm from SPEC_05 Section 4.7
   - Impact: Without this, forks don't actually inherit content, violating core vision
   - Location: `src/fork/registry.rs` in `create_fork()`

2. **Add Cryptographic Verification for Supporter Signatures**
   - Current: `add_fork_support()` accepts signatures without verification
   - Required: Verify each supporter signature against genesis content before adding
   - Impact: Prevents signature spoofing attacks
   - Reference: SPEC_05 Validation Rule V-GEN-07

### Priority 2: Spec Compliance

3. **Align time_filter Type with Spec**
   - Current: `time_filter: Option<u64>`
   - Required: `time_filter: Option<TimeRange>` per SPEC_05 Section 3.4
   - Consider: Deprecation path for existing code

4. **Expose Full ContentSelector in RPC**
   - Current: `content_mode: "selective"` sets all filters to None
   - Required: Add `space_filter`, `time_filter`, `identity_filter` RPC params
   - Impact: Feature parity across interfaces

5. **Implement Fork Cooldown Validation**
   - Current: `fork_cooldown` in config but not enforced
   - Required: Check `parent_age < parent_chain.config.fork_cooldown` in create_fork
   - Reference: SPEC_05 Algorithm 4.1

### Priority 3: Architectural Improvement

6. **Replace Linear Exclusion Check**
   - Current: `Vec::contains()` for exclusion check
   - Recommendation: Use `HashSet` in `ForkGenesis` or add binary search
   - Impact: Performance for large exclusion lists

7. **Client-Side Signing for Fork Creation**
   - Current: RPC accepts raw secret_key
   - Recommendation: Accept pre-signed genesis, verify signature server-side
   - Impact: Reduces key exposure risk

### Priority 4: Future Preparation

8. **Document Cross-Fork Content Addressing**
   - Prepare for FK-S03 implementation
   - Define `(fork_id, content_hash)` resolution protocol
   - Consider lazy fetch vs eager sync trade-offs

9. **Design Multi-Fork Sync Architecture**
   - Current: Fork switch requires full re-sync
   - Future: Maintain multiple fork connections simultaneously
   - Consider: Memory/storage budget per fork

---

## Alignment Summary

| Vision Principle | Implementation Status | Fidelity |
|------------------|----------------------|----------|
| Community Sovereignty | Fully implemented via fork creation | Excellent |
| Identity = Keypair | Ed25519 keypairs work across all forks | Excellent |
| No Central Authority | Deterministic IDs, local storage, no permission required | Excellent |
| Exit as Power | Zero exit cost (except content migration gap) | Good |
| Evolutionary Governance | Configurable PoW/decay multipliers | Excellent |
| Bad Actor Exclusion | Protocol-level exclusion lists | Excellent |
| Content Inheritance | **NOT IMPLEMENTED** (estimate only) | Poor |
| Cross-Fork Discovery | Protocol defined, handlers incomplete | Fair |
| Fork Propagation | Wire messages defined, not implemented | Fair |

**Overall Vision Alignment: 85/100**

The Fork System is architecturally sound and faithfully implements the philosophical foundations of Swimchain's fork-friendly design. The implementation correctly prioritizes identity preservation, deterministic fork identification, and configurable governance parameters. The primary gaps - content migration and network propagation - are clearly documented and represent deferred implementation rather than design failures. Addressing these gaps should be a high priority to fully realize the vision of "zero exit cost" fork migration.

---

*Review conducted: 2026-01-12*
*Reviewer perspective: Vision & Spec Alignment*
*Feature document: fork-system_FEATURE_DOC.md*
*Primary references: VISION.md Section 5, SPEC_05_FORKS_CONSENSUS.md, THESIS_03_FORKS.md*
