# Vision & Spec Alignment Review: Proof-of-Work Systems

## Summary

The Proof-of-Work systems feature demonstrates **strong vision alignment** with Swimchain's core principles of decentralization, anti-spam, and anti-Sybil protection. The dual PoW approach (SHA-256 for identity, Argon2id for actions) correctly implements the "computational cost for access" philosophy without central gatekeeping. However, there is a **critical spec deviation**: the documented Swimmer Level difficulty scaling (where established contributors get reduced PoW requirements) is NOT implemented, creating a gap between documentation and reality. The feature scores well on architectural fit and future compatibility.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 28 | 30 | Strong decentralization; minor concern about verification DoS |
| Spec Compliance | 18 | 25 | Swimmer Level scaling documented but NOT implemented |
| Architectural Fit | 23 | 25 | Clean separation, follows patterns, proper layering |
| Future Compatibility | 18 | 20 | Good extensibility; minor breaking change risk in level integration |
| **Total** | **87** | **100** | |

## Vision Alignment Assessment

### Supports Vision

1. **Decentralized Access Control**: PoW replaces centralized gatekeeping with cryptographic proof of computational investment. Any device can generate valid PoW without permission from any authority.

2. **Anti-Sybil Through Computation**: Identity PoW (difficulty 20, ~10-30 seconds) makes bulk identity creation expensive. Creating 1000 identities would require ~3-8 hours of dedicated computation, making Sybil attacks economically impractical.

3. **Spam Resistance Without Central Moderation**: Action PoW (Argon2id) creates per-action costs that:
   - Scale with action importance (SpaceCreation: 22 bits, Engage: 16 bits)
   - Use memory-hard Argon2id (64 MiB) to resist ASIC/GPU farms
   - Include content binding to prevent PoW reuse

4. **User Empowerment Over Platform Control**: The PoW system puts power in users' hands:
   - No rate limiting by central authority
   - No permission requests
   - Portable across devices (keypair-based)
   - 24-hour anti-stockpile window prevents hoarding while allowing reasonable flexibility

5. **Organic Contribution Rewards (Planned)**: The documented (but unimplemented) Swimmer Level difficulty scaling aligns with organic moderation:
   - Contributors earn reduced PoW through hosting
   - "Give bandwidth, get compute" reciprocity model
   - Rewards sustained participation, not just posting volume

### Vision Concerns

1. **Verification DoS Vector**: The current implementation lacks verification rate limiting. Since Argon2id verification costs 50-200ms and 64 MiB per call, a malicious actor could send invalid PoW solutions to exhaust node resources. This creates a potential **centralization pressure** where only well-resourced nodes can withstand such attacks.

   **Impact**: Medium - Could force smaller operators offline, concentrating the network

2. **Equal Burden on New vs. Established Users**: Without Swimmer Level scaling, new users face the same PoW burden as long-time contributors. This is documented as a feature ("Give bandwidth, get compute") but the implementation doesn't deliver on this vision.

   **Impact**: High - Violates the documented social contract

3. **Mobile/Low-Power Device Exclusion Risk**: 64 MiB Argon2id with difficulty 20+ may be impractical for:
   - Older mobile devices (heat throttling)
   - IoT/embedded devices
   - Users on shared/cloud infrastructure

   **Mitigation**: Mobile config exists (64 MiB, 2 parallelism) and PoW delegation is listed as future work

4. **No PoW Caching**: The same content may be verified 3+ times (RPC acceptance, mempool, block inclusion, sync), multiplying computational cost without benefit. This wastes resources that could serve legitimate requests.

### Vision Alignment Score Rationale

Deducted 2 points for:
- Verification DoS vector that could pressure centralization (-1)
- Swimmer Level benefits documented but not implemented (-1)

## Spec Deviations

| Spec Reference | Expected | Actual | Severity |
|----------------|----------|--------|----------|
| MASTER_FEATURES §2 "Difficulty Scaling" | Status: Complete | `get_adjusted_difficulty()` returns static values, no SwimmerLevel integration | **Critical** |
| MASTER_FEATURES §2 Table | Guppy: 20, Minnow: 18, ..., Anchor: 10 | All users: same difficulty per action type | **High** |
| SPEC_03 §3.1 ActionType | SpaceCreation = 0x00 | SpaceCreation = 0x01 | **Low** (internal enum values) |
| SPEC_03 §4.2 Serialization | Challenge: 75 bytes | Challenge: 82 bytes | **Medium** (test comment notes discrepancy) |
| Feature Doc "Edit ActionType" | Not in MASTER_FEATURES difficulty table | ActionType::Edit exists (0x06) with difficulty 18 | **Low** |

### Critical Deviation: Swimmer Level Scaling

**Documentation states:**
```
| Feature | Status | Files | Description |
| Difficulty Scaling | Complete | crypto/action_pow.rs | Swimmer level adjustments |
```

**Reality (from `src/crypto/action_pow.rs:620-631`):**
```rust
pub fn get_adjusted_difficulty(action: ActionType, _fork_config: &ForkPoWConfig) -> u8 {
    // Per SPEC_03 SC-5: "SHOULD NOT require difficulty adjustment over time"
    // This stub exists for future fork-level customization
    match action {
        ActionType::SpaceCreation => difficulty::SPACE_CREATION,
        ActionType::Post => difficulty::POST,
        // ... static values, no level parameter
    }
}
```

The function signature doesn't accept a SwimmerLevel parameter, and the implementation returns hard-coded values. The feature is **documented as Complete but is NOT implemented**.

## Architectural Observations

### Fits Well

1. **Clean Module Separation**:
   - `crypto/pow.rs` - Identity PoW (SHA-256)
   - `crypto/action_pow.rs` - Action PoW (Argon2id)
   - `crypto/hash.rs` - Shared utilities (leading_zeros, pow_hash)
   - WASM/client code isolated appropriately

2. **Configuration Layering**: Fork-level Argon2id configuration (`ForkPoWConfig`) allows different parameters for:
   - Production (64 MiB, 3 iterations)
   - Mobile (64 MiB, 2 parallelism - heat management)
   - Testnet (8 MiB, 1 iteration)
   - Tests (1 MiB, 1 iteration)

3. **Verification Code Reuse**: The verification functions mirror mining logic closely, reducing divergence risk.

4. **Cancellable Mining**: `compute_pow_cancellable()` follows good UX patterns for long-running operations.

5. **Content Binding**: `verify_content_binding()` correctly prevents PoW reuse across different content.

### Concerns

1. **Missing Rate Limiting Layer**: Verification DoS protection should be in a layer above PoW (e.g., RPC or network), but there's no evidence of this integration in the codebase.

2. **SwimmerLevel Module Missing**: `crate::level::SwimmerLevel` is referenced in `api/anti_abuse.rs` but the module definition cannot be found in the standard module tree. This suggests:
   - Conditional compilation not visible in searches
   - Incomplete module structure
   - Potential compilation issues in some configurations

3. **Browser PoW Split**: Action PoW in browsers uses `hash-wasm` library instead of native WASM Argon2id. This creates two codepaths that must be kept in sync (TypeScript constants must match Rust constants).

4. **Hardcoded WASM Export**: `swimchain-wasm/src/pow.rs` only exports identity PoW, with action PoW handled separately in TypeScript. This is architecturally acceptable but creates sync risk.

## Future Compatibility

### Extensibility Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| New ActionTypes | Good | Enum is extensible, difficulty can be added to match block |
| Difficulty Adjustment | Good | Stub exists (`get_adjusted_difficulty`), ready for implementation |
| Fork-Level Customization | Good | `ForkPoWConfig` designed for per-fork parameters |
| Alternative Hash Functions | Fair | SHA-256/Argon2id are hardcoded, but wrapped in clean functions |
| WebGPU Acceleration | Fair | Would require new codepath but mining interface is clean |
| PoW Delegation | Good | Solution struct is self-contained, can be computed elsewhere |

### Breaking Change Risks

1. **Swimmer Level Integration**: When implemented, `get_adjusted_difficulty()` must change signature to accept SwimmerLevel. This could break callers.

   **Mitigation**: Add a new function `get_level_adjusted_difficulty()` rather than modifying existing

2. **Serialization Size Mismatch**: SPEC_03 says 75 bytes, implementation uses 82. If any external systems depend on the spec, they'll fail.

   **Mitigation**: Update SPEC_03 to match reality (82 bytes)

3. **ActionType Enum Values**: Adding new action types must use sequential values. Edit (0x06) exists but isn't in MASTER_FEATURES, suggesting inconsistent documentation.

### Migration Paths

1. **Level Scaling Migration**:
   - Add `SwimmerLevel` parameter to verification (optional, defaults to Guppy)
   - Nodes auto-upgrade: old PoW still valid (meets or exceeds new requirements)
   - No hard fork required

2. **Memory Parameter Changes**:
   - `ForkPoWConfig` already supports fork-level overrides
   - Backward compatible: higher memory still validates

## Recommendations

### Priority 1: Critical Spec Alignment

1. **Update MASTER_FEATURES §2 Status**: Change "Difficulty Scaling" from "Complete" to "Planned" or "Stub Only" until SwimmerLevel integration is implemented.

2. **Implement Swimmer Level Difficulty**: Create the actual integration:
   ```rust
   pub fn get_level_adjusted_difficulty(
       action: ActionType,
       level: SwimmerLevel,
       config: &ForkPoWConfig
   ) -> u8
   ```

3. **Define SwimmerLevel Module**: Ensure `crate::level::SwimmerLevel` is properly defined and exported in `lib.rs`.

### Priority 2: Vision Protection

4. **Add Verification Rate Limiting**: Implement token-bucket rate limiting per IP/identity at the RPC layer to prevent verification DoS attacks.

5. **Add PoW Verification Cache**: LRU cache for recently-verified PoW solutions to avoid redundant Argon2id computation.

### Priority 3: Spec Cleanup

6. **Update SPEC_03 §4.2**: Change serialization size from 75 to 82 bytes to match implementation.

7. **Document Edit ActionType**: Add Edit (0x06) to the MASTER_FEATURES difficulty table.

8. **Align ActionType Enum Values**: Verify SPEC_03 §3.1 matches implementation enum values.

### Priority 4: Architecture

9. **Synchronize TypeScript Constants**: Add automated tests to verify browser constants match Rust constants.

10. **Consider Single Codepath for Browser PoW**: Evaluate whether WASM Argon2id is viable for action PoW (even if slower than hash-wasm) to reduce maintenance burden.

---

## Alignment Summary

| Swimchain Principle | Alignment | Assessment |
|---------------------|-----------|------------|
| Decentralization | **Strong** | No central authority; computational work is the gate |
| No Central Control | **Strong** | Fork-level config allows community adjustment |
| User Empowerment | **Moderate** | Broken by missing swimmer level scaling |
| Identity IS Keypair | **Strong** | PoW bound to specific keypair |
| PoW for Spam Resistance | **Strong** | Dual PoW system correctly implemented |
| Content Decay (Organic Moderation) | **N/A** | PoW enables actions; decay handles lifecycle |
| Privacy Through Encryption | **N/A** | PoW is public computation |
| Local-First | **Good** | Mining happens client-side |

**Overall Vision Alignment: 87% - Strong foundation with critical gap in progressive trust model**

---

*Review Date: 2026-01-13*
*Reviewer: Vision & Spec Alignment Expert*
*Feature Document: docs/features/proof-of-work-systems_FEATURE_DOC.md*
*Source Files: src/crypto/pow.rs, src/crypto/action_pow.rs, swimchain-wasm/src/pow.rs*
