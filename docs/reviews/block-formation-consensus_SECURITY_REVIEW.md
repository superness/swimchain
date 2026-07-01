# Security Review: Block Formation & Consensus

## Summary

The Block Formation & Consensus feature demonstrates solid security foundations with proper use of Ed25519 signatures, SHA-256 Merkle trees, and Argon2id-based PoW with anti-stockpile mechanisms. However, there are **two critical vulnerabilities** (UTF-8 parsing silently fails, `.unwrap()` on slice conversions), **one high-severity gap** (signature verification not automatically called in basic validation path), and several medium-risk issues around mempool size limits and input validation that require attention before mainnet deployment.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 18 | 25 | Signature verify exists but not auto-called; leader election secure |
| Crypto Correctness | 22 | 25 | Ed25519 + SHA-256 + Argon2id proper; nonce handling good |
| Input Validation | 16 | 25 | UTF-8 silent failure; missing bounds; no mempool limits |
| Data Protection | 20 | 25 | No key logging found; private space encryption separate module |
| **Total** | **76** | **100** | **Solid base, needs hardening before mainnet** |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Malformed action crashes node | Medium | High | `.unwrap()` on byte slices; malicious peer can craft crash |
| Signature bypass | Low | Critical | `validate_action()` doesn't verify sig; caller must use `validate_action_full()` |
| UTF-8 injection | Medium | Medium | Invalid UTF-8 in display_name silently becomes None |
| Mempool exhaustion DoS | High | Medium | No mempool size limits; attacker floods pending actions |
| Leader election manipulation | Low | Medium | XOR distance is deterministic and verifiable |
| PoW stockpiling | Low | Low | Timestamp window (10min) + recomputation prevents stockpiling |
| Fork manipulation | Low | High | Cumulative PoW fork resolution is sound |
| Replay attacks | Low | Low | Action hash deduplication in seen_actions set |
| Timestamp manipulation | Medium | Low | ±10 min past, 60s future tolerance; reasonable |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Silent UTF-8 Validation Failure
**Vulnerability**: Invalid UTF-8 in display_name silently returns `None` instead of erroring
**Location**: `src/blocks/action.rs:639-640`
```rust
String::from_utf8(name_bytes.to_vec()).ok()
```
**Attack**: Attacker sends malformed UTF-8 bytes in display_name field. Different nodes may interpret differently - some may accept, some reject, causing consensus divergence.
**Impact**: Network split, inconsistent state across nodes
**Fix**: Return `ActionError::DeserializationError` for invalid UTF-8
**CVSS**: 7.5 (High) - Network availability impact

#### 2. Panic on Malformed Input During Deserialization
**Vulnerability**: Multiple `.unwrap()` calls on slice-to-array conversions
**Location**: `src/blocks/action.rs:583,607,611,667`
```rust
let timestamp = u64::from_be_bytes(data[offset..offset + 8].try_into().unwrap());
```
**Attack**: Crafted Action packet with length exactly 432 bytes but internal structure causes slice mismatch, triggering panic
**Impact**: Node crash via malicious network message
**Fix**: Replace `.unwrap()` with `.map_err()` returning `ActionError::DeserializationError`
**CVSS**: 7.5 (High) - Denial of service

### High

#### 1. Signature Verification Not Automatically Called
**Vulnerability**: `validate_action()` does NOT call signature verification; callers must know to use `validate_action_full()`
**Location**: `src/blocks/validation.rs:149` (comment at line 147-148 explicitly notes this)
```rust
/// Does NOT check:
/// - Signature (expensive, use validate_action_signature separately)
```
**Attack**: If any code path calls `validate_action()` alone (which passes), forged actions with invalid signatures could be processed
**Impact**: Unauthorized actions accepted into blocks
**Fix**: Either rename to `validate_action_basic()` or add a compile-time warning/attribute; audit all call sites
**CVSS**: 8.1 (High) - Authentication bypass

### Medium

#### 1. No Mempool Size Limits
**Vulnerability**: `BlockBuilder` has no cap on `threads` HashMap or `seen_actions` HashSet size
**Location**: `src/blocks/builder.rs:85-97`
**Attack**: Attacker floods mempool with valid (PoW-solved) actions until node runs out of memory
**Impact**: Node memory exhaustion, degraded performance, potential OOM crash
**Fix**: Add configurable `max_pending_actions` and `max_threads` limits; evict lowest-PoW actions when full
**CVSS**: 6.5 (Medium) - Resource exhaustion

#### 2. Replace-In-Mempool Author Check is Only Field Comparison
**Vulnerability**: RIM only checks `old_action.actor != new_action.actor` without signature verification
**Location**: `src/blocks/builder.rs:266-267`
```rust
if old_action.actor != new_action.actor {
```
**Attack**: If an attacker can get an action into mempool with a forged actor field (via upstream bug), they can replace any action
**Impact**: Mempool manipulation, replaced content before confirmation
**Fix**: Verify signature of replacement action matches actor public key
**CVSS**: 5.3 (Medium) - Requires another vulnerability

#### 3. Emoji Field Accepts Invalid Values
**Vulnerability**: Emoji field accepts any u8 value 1-255 despite documentation limiting to 1-8
**Location**: `src/blocks/action.rs:624-629`
```rust
let emoji = if data[offset] == 0 { None } else { Some(data[offset]) };
```
**Attack**: Send emoji value 255; may cause unexpected behavior in UI clients
**Impact**: UI confusion, potential display issues
**Fix**: Validate `emoji <= 8` in `validate_action()` for Engage actions
**CVSS**: 3.1 (Low) - Information disclosure/UI issue

#### 4. BlockBuilder Action Hash Uses Partial Data
**Vulnerability**: `action_hash()` only uses actor+timestamp+type+content_hash, not signature
**Location**: `src/blocks/builder.rs:154-165`
**Attack**: Two actions with same metadata but different signatures hash identically, causing dedup collision
**Impact**: One valid action rejected as duplicate of another
**Fix**: Include signature in hash computation or use full `action.hash()`
**CVSS**: 4.3 (Medium) - Availability impact

### Low

#### 1. Timestamp Quantization Reduces Precision
**Vulnerability**: 10-second quantization windows may group unrelated actions
**Location**: `src/blocks/builder.rs:455`
**Impact**: Minor timing inaccuracy; documented limitation
**CVSS**: 2.0 (Low)

#### 2. Genesis Block Special-Case Weakens Validation
**Vulnerability**: Genesis block bypasses PoW difficulty check
**Location**: `src/blocks/validation.rs:479` (`verify_genesis()`)
**Impact**: Must ensure genesis is hardcoded/trusted; documented
**CVSS**: 2.0 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Signature | **Secure** - Modern, well-audited via ed25519-dalek |
| SHA-256 | Merkle trees, hashing | **Secure** - Industry standard |
| Argon2id | PoW memory-hard function | **Secure** - OWASP recommended, ASIC-resistant |

### Key Management
- **Generation**: Uses `OsRng` (cryptographically secure PRNG) - `src/crypto/signature.rs:15`
- **Storage**: Private keys stored in 64-byte format (32-byte seed + 32-byte pubkey)
- **Protection**: No hardcoded secrets found in reviewed files
- **Concern**: `generate_keypair_from_seed()` exists but is test-only (`#[cfg(test)]`)

### Random Number Generation
- Uses `rand::rngs::OsRng` for keypair generation - **Secure**
- Uses `rand::thread_rng()` for nonce_space generation - **Adequate** for non-security-critical use
- PoW nonce is sequential, not random - **Acceptable** for PoW

### Nonce Handling
- Action PoW nonces: Sequential search from 0 - standard PoW approach
- Challenge nonce_space: 8 random bytes per challenge - prevents pre-computation
- Anti-stockpile: 10-minute timestamp window prevents pre-mining

## Attack Surface

### External Inputs
| Input | Source | Validation |
|-------|--------|------------|
| Action bytes | Network/RPC | 432-byte fixed size checked; internal parsing has `.unwrap()` bugs |
| PoW solution | RPC | Argon2id recomputed and verified; timestamp window checked |
| Block data | P2P | Merkle root verified; PoW sum verified |
| display_name | User | 31-byte max enforced; UTF-8 silently dropped (bug) |
| space_id | RPC | bech32m decoding with version byte check |
| content_hash | RPC | 32-byte hex validation |

### Trust Boundaries
1. **RPC → Node**: PoW required, signature required, sponsorship check (testnet/mainnet)
2. **P2P → Node**: Block validation, action validation, leader eligibility check
3. **Node → Chain**: Merkle proof verification, cumulative PoW comparison
4. **User → Action**: Signature binding content_hash + timestamp

### Privileged Operations
| Operation | Authorization |
|-----------|--------------|
| Block creation | Leader election (XOR distance + time expansion) |
| Action submission | PoW + Signature + Sponsorship chain |
| Space creation | PoW (60s difficulty) + Signature |
| Kick member | Admin signature + PoW |
| Key rotation | Admin signature + PoW |

## Recommendations

### Priority 1 (Critical - Pre-Release Blockers)

1. **Fix UTF-8 validation** in `Action::deserialize()` - return error instead of `None`
2. **Replace all `.unwrap()` with error handling** in `Action::deserialize()` - prevent node crash

### Priority 2 (High - Should Fix Before Mainnet)

3. **Add mempool size limits** - cap `max_pending_actions` (suggest 10,000) and `max_threads` (suggest 1,000)
4. **Audit all `validate_action()` call sites** - ensure `validate_action_full()` or explicit signature verification is used
5. **Add signature verification to RIM** - verify replacement action signature before accepting

### Priority 3 (Medium - Recommended)

6. **Validate emoji range** - reject values > 8 in `validate_action()` for Engage
7. **Use full action hash for dedup** - include signature in `BlockBuilder::action_hash()`
8. **Add rate limiting per-identity** in mempool - prevent single actor flooding

### Priority 4 (Low - Nice to Have)

9. **Add fuzzing tests** for `Action::deserialize()` with malformed inputs
10. **Document security model** - create SECURITY.md explaining trust assumptions

## Security Best Practices Check

- [x] No hardcoded secrets (verified in reviewed files)
- [x] Timing-safe comparisons (Ed25519 library handles this)
- [x] Secure defaults (production PoW config: 64MiB memory, 3 iterations)
- [x] Principle of least privilege (leader election restricts block creation)
- [ ] Input validation complete (UTF-8 and emoji issues)
- [ ] Error handling complete (`.unwrap()` issues)
- [x] No key material logged (verified via grep)
- [x] Signature bound to content+timestamp (prevents replay)
- [x] Anti-stockpile mechanism (timestamp window)
- [ ] Resource limits (mempool unbounded)

## Swimchain-Specific Security Analysis

### PoW Validation (Anti-Stockpile)
**Status**: **Implemented correctly**
- 10-minute challenge validity window prevents pre-mining
- Argon2id recomputation on verification prevents hash reuse
- Timestamp checked against current time with ±tolerance
- Location: `src/crypto/action_pow.rs:547-560`

### Signature Verification on All Actions
**Status**: **Partially implemented - requires caller discipline**
- `validate_action_signature()` exists and is correct
- `validate_action_full()` combines all checks
- Risk: Basic `validate_action()` does NOT verify signatures
- Location: `src/blocks/validation.rs:296-316`

### Spam Attestation Thresholds
**Status**: **Separate module (not reviewed in this feature)**
- `SpamAttestationStore` referenced in RPC methods
- Would require separate review of `src/spam_attestation/`

### Private Space Encryption
**Status**: **Separate module (not reviewed in this feature)**
- KeyRotation, Invite, Kick action types defined
- Actual encryption logic in separate module

### Identity Key Protection
**Status**: **Adequate**
- OsRng for generation
- No logging of private keys found
- Test-only seed generation properly gated

---

*Review conducted: 2026-01-12*
*Reviewer: Security Review Agent*
*Feature Version: Block Formation & Consensus (Implementation Complete)*
