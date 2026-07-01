# Security Review: Proof-of-Work Systems

## Summary
The Proof-of-Work implementation demonstrates **strong cryptographic foundations** with proper use of SHA-256 and Argon2id algorithms, secure key generation via `OsRng`/`crypto.getRandomValues()`, and comprehensive timestamp-based anti-stockpile protection. However, there are **critical security concerns**: (1) no rate limiting on verification endpoints creates a 50-200ms DoS amplification vector, (2) hash comparisons lack constant-time guarantees, (3) nonce exhaustion returns an invalid fallback instead of error, and (4) TypeScript nonce handling risks overflow. The absence of swimmer level difficulty scaling (documented but not implemented) also undermines the intended spam resistance model.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 22 | 25 | Strong signature verification, missing rate limits on endpoints |
| Crypto Correctness | 20 | 25 | Correct algorithms, missing constant-time comparisons |
| Input Validation | 21 | 25 | Good bounds checking, nonce exhaustion edge case |
| Data Protection | 22 | 25 | Keys not logged, proper RNG usage |
| **Total** | **85** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| DoS via verification flooding | High | High | **NOT MITIGATED** - 50-200ms per verify_pow() call with no rate limit |
| PoW stockpiling attack | Low | Medium | 24h anti-stockpile window for identity, 10min for action (GOOD) |
| Timing side-channel on hash comparison | Medium | Low | Standard `!=` comparison, not constant-time (PARTIAL) |
| Nonce overflow (TypeScript) | Low | Medium | Uses `nonce++` instead of BigInt arithmetic |
| ASIC/GPU spam acceleration | Low | Medium | 64 MiB Argon2id memory-hardness (GOOD) |
| Challenge replay attack | Low | Medium | nonce_space provides uniqueness per challenge (GOOD) |
| Content binding bypass | Low | High | verify_content_binding() validates hash + author (GOOD) |
| Identity PoW pre-computation | Low | Medium | 24h window limits stockpile value (GOOD) |

## Vulnerabilities Found

### Critical (Exploitable)

1. **DoS Amplification via Verification Endpoint**
   **Location**: `src/crypto/action_pow.rs:524-585` (`verify_pow()`)
   **Attack**: Attacker sends flood of invalid PoW solutions; each verification requires 50-200ms Argon2id recomputation. With 100 concurrent requests, server spends 5-20 seconds per batch while attacker spends ~0.
   **Impact**: Service unavailability, resource exhaustion
   **Fix**: Implement per-IP rate limiting (e.g., 10 verifications/second/IP), add connection-level throttling in RPC layer
   **CVSS**: 7.5 (High) - Network-based, no auth required, high availability impact

### High

1. **Nonce Exhaustion Returns Invalid Proof**
   **Location**: `src/crypto/pow.rs:113-119`
   **Attack**: If nonce wraps (u64::MAX iterations), function returns `IdentityCreationProof` with `nonce: 0, pow_hash: [0;32]` instead of error. This invalid proof could propagate through system.
   **Impact**: Invalid identity proofs accepted by systems not validating hash
   **Fix**: Return `Result<IdentityCreationProof, PowError>` with new error variant `NonceSpaceExhausted`
   **CVSS**: 5.3 (Medium) - Requires theoretical nonce exhaustion

2. **TypeScript Nonce Overflow Risk**
   **Location**: `forum-client/src/lib/action-pow.ts:252`
   **Attack**: JavaScript `nonce++` uses Number type. After 2^53 (Number.MAX_SAFE_INTEGER), precision is lost. While unlikely to hit, long-running mining could produce invalid solutions.
   **Impact**: Silent corruption of nonce values, invalid PoW solutions
   **Fix**: Use `nonce = nonce + 1n` (BigInt addition) consistently
   **CVSS**: 4.0 (Medium) - Requires extended mining time

### Medium

1. **Non-Constant-Time Hash Comparison**
   **Location**: `src/crypto/action_pow.rs:571-573`
   ```rust
   if expected_hash != solution.hash {
       return Err(ActionPowError::HashMismatch);
   }
   ```
   **Attack**: Timing attack could theoretically reveal hash byte-by-byte, though practical exploitation is difficult with 32-byte hashes.
   **Impact**: Potential information leakage about valid hash prefixes
   **Fix**: Use `subtle::ConstantTimeEq` or `ring::constant_time::verify_slices_are_equal`
   **CVSS**: 3.7 (Low) - Difficult to exploit remotely

2. **Missing Rate Limiting on Identity PoW Verification**
   **Location**: `src/crypto/pow.rs:183-233`
   **Attack**: SHA-256 verification is fast (~1μs), but repeated calls from same IP could still be used for fingerprinting or resource exhaustion at scale.
   **Impact**: Minor resource consumption, potential for abuse
   **Fix**: Add basic per-IP throttling at RPC layer
   **CVSS**: 4.3 (Medium)

3. **Test/Testnet Config Memory Below ASIC Resistance Floor**
   **Location**: `src/crypto/action_pow.rs:273-278` (test config: 1 MiB), `src/crypto/action_pow.rs:297-303` (testnet: 8 MiB)
   **Attack**: Testnet/test PoW can be ASIC-optimized. If testnet tokens have value or testnet is used for testing production scenarios, this undermines security.
   **Impact**: Spam resistance bypassed on testnet
   **Fix**: Document clearly that testnet PoW is NOT production-equivalent; add warning logs when using sub-32MiB configs
   **CVSS**: 3.1 (Low) - Testnet-only impact

### Low

1. **Error Type Reuse for Nonce Exhaustion**
   **Location**: `src/crypto/action_pow.rs:413-415`
   ```rust
   Err(ActionPowError::Argon2Error("nonce space exhausted".to_string()))
   ```
   **Attack**: None directly, but error handling code may not distinguish nonce exhaustion from actual Argon2 errors.
   **Impact**: Incorrect error categorization in logs/metrics
   **Fix**: Add dedicated `ActionPowError::NonceSpaceExhausted` variant
   **CVSS**: 2.0 (Informational)

2. **Content vs Author Mismatch Indistinguishable**
   **Location**: `src/crypto/action_pow.rs:603-609`
   ```rust
   if solution.challenge.content_hash != expected_hash {
       return Err(ActionPowError::ContentMismatch);
   }
   if &solution.challenge.author_id != author_pubkey {
       return Err(ActionPowError::ContentMismatch);  // Same error!
   }
   ```
   **Attack**: None, but debugging is harder when same error is returned for different failure modes.
   **Impact**: Difficult troubleshooting for developers
   **Fix**: Add `AuthorMismatch` variant or include reason string in `ContentMismatch`
   **CVSS**: 1.0 (Informational)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| **SHA-256** | Identity PoW, content hashing | GOOD - Standard, well-audited |
| **Argon2id** | Action PoW | GOOD - Memory-hard, ASIC-resistant, recommended by OWASP |
| **Ed25519** | Signatures | GOOD - Deterministic, constant-time in `ed25519-dalek` |
| **Blake3** | Internal fast hashing | GOOD - Modern, fast, secure |

### Key Management
- **Generation**: Uses `OsRng` (Rust) and `crypto.getRandomValues()` (Browser) - GOOD
- **Storage**: Private keys stored encrypted with Argon2id-derived KEK - GOOD
- **No hardcoded keys**: Confirmed, no embedded secrets found - GOOD

### Random Number Generation
| Location | Source | Assessment |
|----------|--------|------------|
| `src/crypto/signature.rs:15` | `OsRng` | GOOD - OS-provided CSPRNG |
| `src/crypto/action_pow.rs:188` | `thread_rng()` | ACCEPTABLE - Uses `getrandom` on modern platforms |
| `forum-client/src/lib/action-pow.ts:147` | `crypto.getRandomValues()` | GOOD - Browser CSPRNG |
| `swimchain-wasm/src/identity.rs` | `OsRng` | GOOD - WASM CSPRNG |

### Nonce Handling
| Component | Nonce Source | Assessment |
|-----------|--------------|------------|
| Identity PoW | Sequential from 0 | ACCEPTABLE - Timestamp provides uniqueness per mining session |
| Action PoW nonce_space | `rand::thread_rng().fill_bytes()` | GOOD - 64-bit random unique per challenge |
| Action PoW mining nonce | Sequential from 0 | ACCEPTABLE - nonce_space ensures global uniqueness |

## Attack Surface

### External Inputs
1. **RPC Endpoints** (`src/rpc/methods.rs`)
   - `pow_nonce`, `pow_difficulty`, `pow_nonce_space`, `pow_hash`, `timestamp`
   - Validation: Hex decoding, length checks, timestamp bounds
   - Risk: DoS via verification flooding (HIGH)

2. **Browser PoW Mining** (`forum-client/src/lib/action-pow.ts`)
   - User-provided content, author pubkey
   - Validation: Implicit type coercion, no explicit bounds
   - Risk: Nonce overflow (MEDIUM)

3. **WASM PoW Mining** (`swimchain-wasm/src/pow.rs`)
   - `public_key`, `difficulty`, `max_attempts`
   - Validation: Length checks, difficulty range (1-64)
   - Risk: Low - Well-bounded

### Trust Boundaries
1. **Client ↔ Node RPC**: PoW provides proof-of-work gate, but no authentication
2. **Browser ↔ WASM**: SHA-256 identity PoW only; Argon2id via `hash-wasm`
3. **Node ↔ Node P2P**: Actions include signatures; PoW verified on receipt

### Privileged Operations
1. **Identity Creation**: Requires valid Identity PoW (20 bits, ~10-30s)
2. **Content Submission**: Requires valid Action PoW (16-22 bits based on action)
3. **Space Creation**: Highest difficulty (22 bits, ~60s) - appropriate gating

## Recommendations

### P0 - Critical (Fix Before Production)

1. **Implement Rate Limiting on Verification Endpoints**
   - Add per-IP rate limiting in RPC layer (recommend: 10 verifications/second/IP)
   - Add connection-level throttling with exponential backoff
   - Location: `src/rpc/methods.rs` around `verify_pow_submission()`

2. **Return Error on Nonce Exhaustion**
   - Change `pow.rs:113-119` and `action_pow.rs:412-415` to return proper errors
   - Add `NonceSpaceExhausted` error variant to both `IdentityError` and `ActionPowError`

### P1 - High (Fix Before Beta)

3. **Use Constant-Time Hash Comparison**
   - Add `subtle` crate dependency
   - Replace `expected_hash != solution.hash` with `subtle::ConstantTimeEq::ct_eq()`
   - Apply to all hash/signature comparisons

4. **Fix TypeScript Nonce Overflow**
   - Change `nonce++` to `nonce = nonce + 1n` in `action-pow.ts:252`
   - Ensure all nonce operations use BigInt consistently

### P2 - Medium (Track for Post-Launch)

5. **Add Separate Error for Author Mismatch**
   - Create `ActionPowError::AuthorMismatch` variant
   - Improve debugging experience for content binding failures

6. **Add Warning Logs for Sub-Production Configs**
   - Log warning when `memory_kib < MIN_MEMORY_KIB` (32 MiB)
   - Help prevent accidental use of test configs in production

### P3 - Low (Nice to Have)

7. **Document Testnet Security Model**
   - Clarify in docs that testnet PoW is NOT ASIC-resistant
   - Note that testnet tokens should have no real value

## Security Best Practices Check

- [x] No hardcoded secrets
- [ ] Timing-safe comparisons (MISSING - standard `!=` used)
- [x] Secure defaults (production config is secure)
- [x] Principle of least privilege (PoW gating per action type)
- [x] Input validation (lengths, ranges, timestamps checked)
- [x] Proper RNG usage (OsRng, crypto.getRandomValues)
- [ ] Rate limiting (MISSING on verification endpoints)
- [x] Anti-replay (nonce_space + timestamp window)
- [x] Anti-stockpile (24h identity, 10min action windows)
- [x] Memory-hardness for ASIC resistance (64 MiB Argon2id)

## Positive Security Findings

1. **Strong Anti-Stockpile Protection**: 24-hour window for identity PoW and 10-minute window for action PoW effectively prevent pre-computation attacks.

2. **Proper Memory-Hard PoW**: 64 MiB Argon2id with 3 iterations provides genuine ASIC resistance. The MIN_MEMORY_KIB constant (32 MiB) prevents configuration mistakes.

3. **Content Binding**: PoW is cryptographically bound to specific content and author via `verify_content_binding()`, preventing PoW reuse.

4. **Secure Key Generation**: Consistent use of OS-provided CSPRNGs across Rust, WASM, and browser implementations.

5. **Ed25519 Signature Security**: Uses `ed25519-dalek` which provides constant-time signature operations, protecting against timing attacks on signatures.

6. **Difficulty Scaling by Action Type**: SpaceCreation (22) > Post/IdentityUpdate (20) > Reply/Edit (18) > Engage (16) provides appropriate cost hierarchy.

---

*Security Review Date: 2026-01-12*
*Reviewer: Security Analysis Agent*
*Files Reviewed: src/crypto/pow.rs, src/crypto/action_pow.rs, src/crypto/hash.rs, src/crypto/signature.rs, swimchain-wasm/src/pow.rs, forum-client/src/lib/action-pow.ts, forum-client/src/hooks/useActionPow.ts, src/rpc/methods.rs, src/types/error.rs*
