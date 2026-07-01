# Functionality Review: Proof-of-Work Systems

## Summary

The Proof-of-Work Systems implementation provides a robust dual-PoW architecture with SHA-256 for identity creation (anti-Sybil) and Argon2id for action spam prevention. Core mining and verification functions are well-implemented with proper error handling, timestamp validation, and content binding. The codebase demonstrates solid cryptographic design choices including memory-hard ASIC resistance. However, a **critical feature gap** exists: the documented Swimmer Level difficulty scaling is entirely unimplemented, with `get_adjusted_difficulty()` returning static values regardless of user reputation. Additionally, the `SwimmerLevel` type referenced in `anti_abuse.rs` does not exist in the codebase, indicating an incomplete refactor. The implementation achieves ~85% completeness for core PoW functionality but fails to deliver the progressive trust model central to Swimchain's vision.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Completeness | 18 | 25 | Core PoW complete; Swimmer Level scaling missing; SwimmerLevel type undefined |
| Correctness | 22 | 25 | Sound algorithms; minor edge case handling issues (nonce exhaustion) |
| API Design | 22 | 25 | Clean, intuitive APIs; some cross-platform inconsistencies |
| Integration | 16 | 25 | Good RPC integration; broken SwimmerLevel import; no rate-limiting |
| **Total** | **78** | **100** | |

## Strengths

1. **Clean Separation of Concerns**: Two distinct PoW systems (Identity SHA-256 vs Action Argon2id) are well-separated with clear purposes - anti-Sybil vs anti-spam.

2. **Comprehensive Error Types**: Both `IdentityError` and `ActionPowError` provide specific, actionable error variants (e.g., `PowTimestampStockpile`, `ChallengeExpired`, `ContentMismatch`) defined in `src/types/error.rs:94-150`.

3. **Memory-Hard ASIC Resistance**: Argon2id with 64 MiB memory requirement effectively prevents hardware optimization attacks. The `MIN_MEMORY_KIB = 32768` validation at `action_pow.rs:82` ensures security floor.

4. **Progress and Cancellation Support**: Mining functions provide callbacks for UX feedback and cancellation tokens for responsive user experience (`compute_pow_cancellable` at `action_pow.rs:467-522`).

5. **Content Binding Verification**: `verify_content_binding()` at `action_pow.rs:587-613` prevents PoW reuse across different content - a critical security feature.

6. **Anti-Stockpile Protection**: 24-hour timestamp window (`POW_MAX_AGE_SECS = 86400` at `pow.rs:23`) prevents pre-computation attacks for identity creation.

7. **Cross-Platform Implementation**: Consistent implementations across:
   - Rust native (`src/crypto/pow.rs`, `src/crypto/action_pow.rs`)
   - WASM browser identity PoW (`swimchain-wasm/src/pow.rs`)
   - TypeScript browser action PoW (`forum-client/src/lib/action-pow.ts` via hash-wasm)

8. **Test Coverage**: 27+ unit tests covering core scenarios including:
   - Serialization vectors (`test_serialization_vector`)
   - Boundary conditions (`test_leading_zero_boundary`)
   - Expiry checks (`test_challenge_expiry`)
   - Config validation (`test_memory_validation`)

## Issues Found

### Critical (Must Fix)

1. **Issue**: Swimmer Level difficulty scaling is NOT implemented despite documentation claiming "Status: Complete"
   **Location**: `src/crypto/action_pow.rs:619-631`
   **Impact**: The documented feature "Guppy users do 20 bits PoW, Anchor users do 10 bits PoW" does not exist. All users pay identical PoW costs regardless of reputation/contribution. This breaks the core "give bandwidth, get compute" reciprocity model described in MASTER_FEATURES §2.
   **Recommendation**: Implement the difficulty scaling with a new function:
   ```rust
   pub fn get_level_adjusted_difficulty(
       action: ActionType,
       swimmer_level: SwimmerLevel,
       config: &ForkPoWConfig,
   ) -> u8 {
       let base = config.get_difficulty(action);
       let reduction = match swimmer_level {
           SwimmerLevel::Guppy => 0,
           SwimmerLevel::Minnow => 2,
           SwimmerLevel::Swimmer => 4,
           SwimmerLevel::Dolphin => 6,
           SwimmerLevel::Shark => 8,
           SwimmerLevel::PoolKeeper => 10,
           SwimmerLevel::Anchor => 12,
       };
       base.saturating_sub(reduction).max(4) // Floor at 4 bits for security
   }
   ```

2. **Issue**: `SwimmerLevel` type does not exist in the codebase
   **Location**: `src/api/anti_abuse.rs:25` has `use crate::level::SwimmerLevel` but `src/lib.rs` has no `pub mod level;` declaration
   **Impact**: Build failure if this code path is exercised. Indicates an incomplete refactor - the type is referenced but never defined.
   **Recommendation**: Define the SwimmerLevel enum:
   ```rust
   // src/level.rs
   #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
   pub enum SwimmerLevel {
       Guppy, Minnow, Swimmer, Dolphin, Shark, PoolKeeper, Anchor,
   }
   ```
   Then add `pub mod level;` to `src/lib.rs`.

### Major (Should Fix)

1. **Issue**: Nonce exhaustion returns invalid proof instead of error
   **Location**: `src/crypto/pow.rs:113-119`
   **Impact**: If u64 nonce space is exhausted (theoretically impossible with reasonable difficulty), the function returns a proof with `nonce: 0` and `pow_hash: [0; 32]` which would fail verification. This silent failure violates Rust's principle of making invalid states unrepresentable.
   **Recommendation**: Change return type to `Result<IdentityCreationProof, PowError>`:
   ```rust
   if nonce == 0 {
       return Err(PowError::NonceSpaceExhausted);
   }
   ```

2. **Issue**: Missing `ActionType::Invite`
   **Location**: `src/crypto/action_pow.rs:44-57`
   **Impact**: Per MASTER_FEATURES, invite actions should require PoW but no `ActionType::Invite` variant exists. Currently invites likely bypass PoW or use an incorrect action type.
   **Recommendation**: Add `Invite = 0x07` with appropriate difficulty (suggest 16 bits, same as Engage).

3. **Issue**: Inconsistent timestamp byte ordering
   **Location**: `src/crypto/pow.rs:85` uses **little-endian**, `src/crypto/action_pow.rs:136` uses **big-endian**
   **Impact**: Cross-platform serialization confusion; harder to debug interoperability issues. WASM uses little-endian at `swimchain-wasm/src/pow.rs:163`.
   **Recommendation**: Standardize on big-endian for all network-facing serialization per protocol conventions. Document the discrepancy clearly if intentional.

4. **Issue**: No rate limiting on verify_pow()
   **Location**: `src/crypto/action_pow.rs:543-585`
   **Impact**: Each verification takes 50-200ms of CPU due to Argon2id recomputation. An attacker could submit many invalid solutions to exhaust server resources (DoS vector).
   **Recommendation**: Add rate limiting by IP or pubkey in the RPC layer before calling `verify_pow()`. Consider a "cheap check first" pattern - verify timestamp windows before expensive Argon2id computation.

5. **Issue**: TypeScript `pow_nonce` conversion may lose precision
   **Location**: `forum-client/src/lib/action-pow.ts:267` - `Number(solution.nonce)`
   **Impact**: JavaScript's `Number.MAX_SAFE_INTEGER` is 2^53. Nonces above this lose precision, causing verification failures.
   **Recommendation**: Keep as string in RPC params:
   ```typescript
   pow_nonce: solution.nonce.toString(),
   ```

### Minor (Nice to Fix)

1. **Issue**: `ActionType::Edit` (0x06) is undocumented in MASTER_FEATURES difficulty table
   **Location**: `src/crypto/action_pow.rs:56`
   **Impact**: Documentation gap; users don't know expected mining time for edits.
   **Recommendation**: Add Edit to the difficulty table in documentation (currently 18 bits like Reply).

2. **Issue**: WASM `verify_identity_pow()` doesn't perform timestamp checks
   **Location**: `swimchain-wasm/src/pow.rs:208-220`
   **Impact**: Browser verification is less complete than native; could accept old/stockpiled proofs.
   **Recommendation**: Add optional `current_time` parameter for full validation.

3. **Issue**: Progress callback frequency inconsistent
   **Location**: `pow.rs:38` uses 1M interval, `action_pow.rs:436` uses 100, `action_pow.rs:488` uses 10
   **Impact**: UX inconsistency between Identity and Action PoW progress updates.
   **Recommendation**: Document the rationale (SHA-256 is fast ~500K H/s, Argon2id is slow ~10 H/s).

4. **Issue**: Challenge serialization size discrepancy with spec
   **Location**: `src/crypto/action_pow.rs:84-85` - code comment notes "spec says 75 but offset table = 82"
   **Impact**: Spec documentation is incorrect; potential interop issues.
   **Recommendation**: Update SPEC_03 §4.2 to show 82-byte size, or file errata.

5. **Issue**: Test coverage gap for cancellation
   **Location**: `src/crypto/action_pow.rs:467-522` - `compute_pow_cancellable`
   **Impact**: No unit tests verify cancellation behavior works correctly.
   **Recommendation**: Add cancellation test with `AtomicBool`.

## Missing Functionality

| Feature | Status | Impact |
|---------|--------|--------|
| Swimmer Level Difficulty Scaling | NOT IMPLEMENTED | Core vision feature missing |
| SwimmerLevel type definition | NOT IMPLEMENTED | Broken imports in codebase |
| ActionType::Invite | NOT IMPLEMENTED | Invite actions lack proper PoW |
| Shared test vectors (Rust/WASM/TS) | NOT IMPLEMENTED | No cross-platform verification |
| PoW caching/pooling | NOT IMPLEMENTED | No mechanism for lightweight clients |
| Verification rate limiting | NOT IMPLEMENTED | DoS vulnerability |
| GPU/WebGPU acceleration | NOT IMPLEMENTED | Documented as future work |
| Adaptive network difficulty | NOT IMPLEMENTED | Spec says SHOULD NOT be needed |

## API Design Analysis

### Well-Designed APIs

| API | Location | Quality | Notes |
|-----|----------|---------|-------|
| `mine_identity_pow()` | pow.rs:52-55 | Excellent | Simple signature, clear return |
| `verify_identity_pow()` | pow.rs:183-233 | Good | Returns Result with specific errors |
| `compute_pow()` | action_pow.rs:382-416 | Excellent | Generic challenge/config pattern |
| `PoWChallenge::generate()` | action_pow.rs:177-198 | Good | Convenient factory method |
| `solutionToRpcParams()` | action-pow.ts:259-277 | Excellent | Clean bridge to RPC layer |
| React hooks | useActionPow.ts | Excellent | Idiomatic React with state machine |
| `ForkPoWConfig` presets | action_pow.rs:257-303 | Good | Clear environment separation |

### API Improvements Needed

| API | Issue | Suggestion |
|-----|-------|------------|
| `get_adjusted_difficulty()` | Missing `SwimmerLevel` param | Add new function `get_level_adjusted_difficulty()` |
| `ForkPoWConfig::validate()` | Returns Ok for test configs | Add `validate_strict()` that always enforces minimum |
| `mine_identity_pow*` | Returns invalid proof on exhaustion | Return `Result` type |
| `verify_identity_pow` (WASM) | No timestamp validation | Add `current_time` parameter |

## Integration Analysis

### Good Integration Points

1. **RPC Layer**: PoW parameters (`pow_nonce`, `pow_difficulty`, `pow_nonce_space`, `pow_hash`, `timestamp`) are cleanly passed through JSON-RPC.
2. **WASM Bridge**: `WasmPowSolution` provides proper JS interop with BigInt conversions for nonce/timestamp.
3. **React Hooks**: `useActionPow`, `usePostPow`, `useReplyPow`, etc. encapsulate mining state machine for UI components.
4. **Error Types**: Errors integrate well with broader error handling system via thiserror derive.

### Integration Gaps

| Gap | Impact | Severity |
|-----|--------|----------|
| SwimmerLevel not wired to PoW | Progressive trust model broken | Critical |
| Broken `use crate::level` import | Build failure in anti_abuse.rs | Critical |
| No verification caching | Re-verification overhead | Medium |
| Block formation flow unclear | Documentation gap | Low |

## Recommendations

### Priority 0 (Blocking)
1. **Define SwimmerLevel type** in `src/level.rs` and export from `src/lib.rs` to fix broken imports.

### Priority 1 (Critical)
2. **Implement Swimmer Level difficulty scaling** OR correct MASTER_FEATURES documentation. This is a fundamental feature gap.

### Priority 2 (High)
3. **Add rate limiting** to RPC PoW verification endpoints (50-200ms verification time = DoS vector).
4. **Add `ActionType::Invite`** with appropriate difficulty.

### Priority 3 (Medium)
5. **Create shared test vectors** across Rust/WASM/TypeScript for cross-platform verification.
6. **Fix nonce exhaustion handling** to return `Result::Err` instead of invalid proof.
7. **Fix BigInt precision loss** in TypeScript RPC params.

### Priority 4 (Low)
8. **Standardize timestamp byte ordering** (recommend big-endian for network serialization).
9. **Add cancellation unit tests**.
10. **Document ActionType::Edit** in difficulty table.

---

*Reviewed: 2026-01-13*
*Reviewer: Functionality Expert*
*Files Examined: src/crypto/pow.rs, src/crypto/action_pow.rs, src/crypto/hash.rs, src/types/error.rs, swimchain-wasm/src/pow.rs, forum-client/src/lib/action-pow.ts, forum-client/src/hooks/useActionPow.ts*
