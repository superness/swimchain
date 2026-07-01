# Vision & Spec Alignment Review: Fork System

## Summary

The Fork System implementation demonstrates strong alignment with Swimchain's core vision of decentralized, community-driven governance through the "exit as power" paradigm. The feature enables communities to escape captured chains while preserving cryptographic identity across forks - a fundamental principle from VISION and THESIS_03. However, there are notable spec deviations, particularly around supporter requirements and content migration, that require attention before the system can fulfill its full vision promise.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong core philosophy; exit mechanisms intact |
| Spec Compliance | 18 | 25 | Several deviations from SPEC_05 |
| Architectural Fit | 21 | 25 | Good module organization; some coupling concerns |
| Future Compatibility | 17 | 20 | Extensible design; migration path unclear |
| **Total** | **82** | **100** | Good foundation; spec gaps need resolution |

---

## Vision Alignment Assessment

### Supports Vision

**1. Exit as Power (Core Thesis)**
The implementation directly enables the "credible threat of forking" that disciplines governance (THESIS_03). Key support:
- `ForkRegistry::create_fork()` allows any identity to initiate a fork
- No central authority required for fork creation or operation
- Fork IDs are deterministically derived via SHA-256 (no registry needed)

**2. Zero Exit Cost**
- Same Ed25519 keypair works across all forks (Theorem 5.1 compliance)
- `Identity::from_secret_key()` allows using existing keys on new forks
- No protocol-level barrier to migration

**3. Capture Immunity**
- `excluded_ids` mechanism allows blocking bad actors at fork creation
- `is_excluded()` check prevents excluded identities from participating
- Communities can escape hostile takeovers while preserving social graph

**4. Community Sovereignty**
- `ForkConfig::builder()` provides full customization:
  - `pow_multiplier`: Adjust PoW difficulty for different spam tolerance
  - `decay_multiplier`: Adjust content lifecycle for different community needs
  - `content_mode()`: Control content inheritance

**5. Decentralized Discovery**
- Fork announcements designed for gossip propagation (message types 0x53-0x55 in doc)
- No central fork registry required
- Bootstrap peers in genesis enable peer-to-peer discovery

### Vision Concerns

**1. Minimum Supporter Threshold Not Enforced**

The implementation does NOT enforce `min_supporters` from parent fork config as specified in SPEC_05 Section 3.3:

```
// From SPEC_05:
ForkConfig {
    min_supporters: u16    // Minimum fork supporters required
}
```

**Current implementation** (`src/fork/registry.rs:119-133`):
- Validates name length (1-64 chars)
- Validates multiplier ranges (0.1-10.0)
- Does NOT check minimum supporter count

**Impact**: This could allow trivial forks by single actors, contrary to FK-S01 "Fork friction SHOULD discourage trivial forks while permitting serious ones."

**2. Supporter Signature Verification Missing**

When supporters are added via `add_fork_support()`, their signatures are stored but NEVER verified:

```rust
// src/fork/registry.rs:302-309
pub fn add_fork_support(&self, fork_id: &ForkId, identity: &Identity) -> Result<(), ForkError> {
    let mut genesis = self.store.get_genesis(fork_id)?
        .ok_or_else(|| ForkError::NotFound(*fork_id))?;

    let bytes = genesis.to_bytes();
    let signature = identity.sign(&bytes);
    genesis.add_supporter(identity.public_key(), signature);  // No verification!

    self.store.store_genesis(fork_id, &genesis)?;
    Ok(())
}
```

**Impact**: Anyone can add invalid supporter signatures. Per FK-H05, exclusion lists are critical; without signature verification, this is a potential attack vector.

**3. Content Migration Not Implemented**

The `ContentSelector` types exist, but actual content migration is estimation-only:

```rust
// src/fork/registry.rs:178-198
let inherited_content_count = match &config.content_selector {
    ContentSelector::All => parent_height.saturating_mul(10), // ESTIMATE ONLY
    ContentSelector::None => 0,
    ContentSelector::Selective { time_filter, .. } => { ... } // ESTIMATE ONLY
};
```

**Vision Impact**: SPEC_05 Section 4.7 defines `inherit_content()` algorithm, but implementation returns only estimates. FK-S05 states "Selective content inheritance SHOULD be possible when forking" - currently this is not functional.

**4. No Fork Cooldown Enforcement**

SPEC_05 defines `fork_cooldown: u64` in ForkConfig to prevent rapid fork cycling, but implementation ignores this:

```rust
// Missing from src/fork/registry.rs:create_fork()
// Should check: parent_age < parent_chain.config.fork_cooldown
```

---

## Spec Deviations

| Spec Reference | Expected | Actual | Severity |
|---------------|----------|--------|----------|
| SPEC_05 §3.3 `min_supporters` | Enforced from parent config | Not checked | **High** |
| SPEC_05 §3.3 `fork_cooldown` | Enforced waiting period | Not implemented | Medium |
| SPEC_05 §4.1 Step 3 | Validate min_supporters threshold | Missing validation | **High** |
| SPEC_05 §4.1 Step 4 | Validate cooldown period passed | Missing validation | Medium |
| SPEC_05 §4.2 `V-GEN-08` | Total supporters >= parent's min | Not checked | **High** |
| SPEC_05 §4.7 | Actual content migration | Estimation only | **High** |
| SPEC_05 §3.4 `time_filter` | `TimeRange { start, end }` | `Option<u64>` (timestamp only) | Low |
| SPEC_05 §5.1 Message 0x50 | FORK_ANNOUNCE propagation | Partial implementation | Medium |
| MASTER_FEATURES §18 | `time_filter: TimeRange` | `time_filter: Option<u64>` | Low |

### Validation Rules Compliance

| Rule | Status | Notes |
|------|--------|-------|
| V-GEN-01 Version check | Partial | Hardcoded to version 1 |
| V-GEN-02 Parent fork validation | Partial | No verification parent is known |
| V-GEN-03 Parent block hash match | **Missing** | No chain store access guaranteed |
| V-GEN-04 Timestamp > parent | **Missing** | No timestamp validation |
| V-GEN-05 Future timestamp check | **Missing** | No future timestamp rejection |
| V-GEN-06 Creator signature | **Implemented** | Correctly signs genesis |
| V-GEN-07 Supporter signatures | **Missing** | Added but never verified |
| V-GEN-08 Supporter count | **Missing** | No threshold enforcement |
| V-GEN-09 Excluded in creator/supporter | Partial | Creator checked, supporters not |
| V-GEN-10 Config range validation | **Implemented** | Multipliers clamped 0.1-10.0 |

---

## Architectural Observations

### Fits Well

**1. Module Organization**
- Clean separation: `genesis.rs`, `registry.rs`, `storage.rs`
- Builder pattern for `ForkConfig` (idiomatic Rust)
- Clear ownership: `src/fork/` owns fork mechanics

**2. Storage Layer**
- Sled-based persistence matches overall storage strategy
- Separate trees for genesis, known forks, and active fork
- `ForkStore` mirrors patterns from `ChainStore`

**3. Type Design**
- `ForkId` uses existing `types/block.rs` structure
- `ContentSelector` enum covers all SPEC_05 modes
- `ForkError` provides clear error taxonomy

**4. Cryptographic Consistency**
- Uses Ed25519 via `ed25519-dalek` (matches identity system)
- SHA-256 for fork ID calculation (matches block hashing)
- Signature envelope pattern consistent with rest of codebase

### Concerns

**1. Optional Chain Store Coupling**
```rust
// src/fork/registry.rs:100
pub fn new(store: Arc<ForkStore>, chain_store: Option<Arc<ChainStore>>) -> Self
```

Making `chain_store` optional means fork creation can proceed without chain validation. This violates:
- V-GEN-03: Parent block hash verification
- V-GEN-04: Timestamp ordering

**Recommendation**: `chain_store` should be required, or fork creation should fail if no chain context available.

**2. Linear Exclusion Check Performance**
```rust
// src/fork/genesis.rs:213-214
pub fn is_excluded(&self, id: &[u8; 32]) -> bool {
    self.excluded_ids.contains(id)  // Vec::contains() is O(n)
}
```

`ForkConfig` uses `HashSet` for exclusions, but `ForkGenesis` converts to `Vec` during serialization, losing O(1) lookup. This becomes a hot path if `is_excluded()` is called on every action validation.

**3. Missing Serialization Determinism**
While `ForkGenesis::to_bytes()` is deterministic, the spec (SPEC_05 §3.2) specifies exact field ordering. The current implementation follows the order but doesn't document this guarantee.

---

## Future Compatibility

### Extensibility Assessment

**Strengths:**
- `version: u32` field in `ForkGenesis` allows future format changes
- `config: Vec<u8>` stores serialized config, allowing future expansion
- `content_selector_bytes: Vec<u8>` is forward-compatible

**Concerns:**
- No migration path from estimation-only to real content migration
- Cross-fork sync not designed (each fork is independent silo)
- Fork merge/reconciliation mentioned in Future Work but no hooks exist

### Breaking Change Risks

| Change | Risk Level | Impact |
|--------|------------|--------|
| Add `min_supporters` enforcement | Medium | Existing forks remain valid; new forks stricter |
| Implement content migration | **High** | Existing forks have no migrated content |
| Add signature verification | Medium | Invalid supporters need cleanup |
| Change serialization format | **High** | All fork IDs change; requires version bump |
| Add `fork_cooldown` | Low | Only affects new fork attempts |

### Backwards Compatibility

**Protocol versioning** is handled via `version: u32` in genesis:
- Current version: 1
- Deserializer accepts version <= current
- Unknown versions rejected per V-GEN-01

**Storage schema** uses sled trees which are append-only:
- `fork_genesis`: Keyed by ForkId bytes
- `fork_known`: Flat list of known fork IDs
- `fork_active`: Single active fork ID

Upgrading to add indices or relationships requires migration.

---

## Recommendations

### P0 (Critical - Blocks Vision)

1. **Implement supporter signature verification**
   - Location: `src/fork/registry.rs:add_fork_support()`
   - Action: Verify signature before storing
   - Rationale: Security foundation for fork legitimacy

2. **Implement content migration (at minimum for `ContentSelector::All`)**
   - Location: New `src/fork/migration.rs` module
   - Action: Copy eligible content when fork created
   - Rationale: FK-S05 requires functional content inheritance

### P1 (High - Spec Compliance)

3. **Enforce `min_supporters` threshold**
   - Location: `src/fork/registry.rs:create_fork()`
   - Action: Check supporter count >= config threshold
   - Rationale: V-GEN-08 compliance, prevents trivial forks

4. **Add genesis timestamp validation**
   - Location: `src/fork/registry.rs:create_fork()`
   - Action: Verify timestamp > parent block timestamp
   - Rationale: V-GEN-04, V-GEN-05 compliance

5. **Make `chain_store` required**
   - Location: `ForkRegistry::new()`
   - Action: Change `Option<Arc<ChainStore>>` to `Arc<ChainStore>`
   - Rationale: Ensures proper chain context for validation

### P2 (Medium - Quality)

6. **Convert exclusion list to HashSet on load**
   - Location: `src/fork/genesis.rs`
   - Action: Cache HashSet for `is_excluded()` calls
   - Rationale: O(n) -> O(1) lookup performance

7. **Implement `fork_cooldown` enforcement**
   - Location: `src/fork/registry.rs:create_fork()`
   - Action: Check time since parent genesis > cooldown
   - Rationale: FK-S01 friction against trivial forks

8. **Align `time_filter` with spec**
   - Location: `src/fork/genesis.rs:ContentSelector`
   - Action: Change `Option<u64>` to `Option<TimeRange>`
   - Rationale: SPEC_05 §3.4 specifies start/end range

### P3 (Low - Documentation)

9. **Document serialization format determinism**
   - Add comments ensuring `to_bytes()` order matches spec
   - Add test vectors for fork ID calculation

10. **Add cross-fork proof implementation**
    - SPEC_05 §3.8 defines `CrossForkProof` structure
    - Enables reputation portability across forks

---

## Conclusion

The Fork System provides a solid foundation for Swimchain's vision of community escape and evolutionary governance. The core mechanics - fork creation, identity preservation, exclusion lists - align well with the thesis documents. However, critical spec deviations around supporter verification and content migration prevent the system from delivering its full promise.

**Key Strengths:**
- Cryptographically sound fork identity (SHA-256 of genesis)
- Ed25519 keypair portability across forks (Theorem 5.1)
- Builder pattern for flexible fork configuration
- Clean architectural separation

**Key Gaps:**
- No supporter signature verification (security risk)
- Content migration is estimation-only (functional gap)
- Min supporters threshold not enforced (governance gap)

Addressing P0 and P1 recommendations would bring the implementation into full spec compliance and enable the "exit as power" vision to be operationally realized.

---

*Review generated: 2026-01-12*
*Reviewer: Vision & Spec Alignment Expert*
*Feature: Fork System (Section 18)*
*Specs Referenced: SPEC_01_IDENTITY, SPEC_05_FORKS_CONSENSUS, MASTER_FEATURES*
