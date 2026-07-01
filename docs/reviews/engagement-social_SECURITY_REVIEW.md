# Security Review: Engagement Social

**Review Date**: 2026-01-13 (Updated)
**Reviewer**: Security Specialist (Automated Review)
**Feature Document**: `/mnt/c/github/swimchain/docs/features/engagement-social_FEATURE_DOC.md`
**Review Type**: Comprehensive Security Analysis
**Previous Review**: 2026-01-12

---

## Summary

The Engagement & Social feature demonstrates **solid cryptographic foundations** with proper PoW validation (Argon2id), anti-stockpile timestamp checking, and sponsorship verification for Sybil resistance. However, there are **critical and high-severity security gaps**: (1) **signature verification is missing** in the `submit_engagement` RPC handler - signatures are parsed but never cryptographically verified, (2) **notification IDs use weak entropy** (timestamp + counter) instead of cryptographic randomness, and (3) **unique engagement counters never increment**, breaking spam detection. The identity key storage uses industry-standard Argon2id + ChaCha20-Poly1305, and spam attestation thresholds correctly implement Sybil-resistance through independent sponsor tree counting.

---

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 16 | 25 | Sponsorship check present, **signature NOT verified at RPC layer** |
| Crypto Correctness | 20 | 25 | Good primitives, weak notification ID entropy, deferred signature check |
| Input Validation | 21 | 25 | Comprehensive bounds checking, missing emoji validation |
| Data Protection | 22 | 25 | ChaCha20-Poly1305 for keys, encrypted space keys for private spaces |
| **Total** | **79** | **100** | **Needs Improvement (Critical Fix Required)** |

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **Engagement forgery (missing signature check)** | **High** | **High** | **Signature extracted but NOT verified in `submit_engagement`** |
| Notification ID collision/prediction | Medium | Low | Uses timestamp+counter instead of crypto RNG |
| Spam detection bypass (broken counters) | **High** | Medium | `unique_engagers`/`unique_authors_engaged` always 0 |
| PoW stockpiling | Low | Medium | Anti-stockpile: 1h validity window enforced in `verify_pow()` |
| Sybil spam attestation | Low | Medium | Requires 3 independent sponsor trees (tree-deduplicated counting) |
| Linear chain Sybil attack | Medium | Medium | `LinearChainWarning` detection with health score penalty |
| Self-engagement spam | Medium | Low | Detected via `looks_organic()` but not blocked |
| Sponsorship bypass at startup | Medium | Medium | Graceful degradation allows unsponsored during init |
| Regtest bypass abuse | Low | Low | Intentional for testing; production uses proper checks |

---

## Vulnerabilities Found

### Critical (Exploitable)

1. **Signature Not Verified in `submit_engagement` RPC Handler**
   - **Location**: `src/rpc/methods.rs:2674-2885` (specifically 2749-2761)
   - **Attack**: An attacker can submit engagement actions with **any** `author_id` and a fabricated signature. The signature is parsed at line 2749-2761 but **never cryptographically verified** against the engagement content. The verification function exists at `src/blocks/validation.rs:296-316` but is only called during block processing.
   - **Impact**: Complete bypass of action authenticity - anyone can submit engagements on behalf of any identity, breaking:
     - Content attribution ("Kept alive by" displays)
     - Decay timer resets (content kept alive without real engagement)
     - Achievement triggers (gaming milestones)
     - Engagement statistics (polluting organic detection)
   - **Fix**: Add signature verification immediately after parsing:
     ```rust
     // After line 2761, add verification:
     let mut message = [0u8; 40];
     message[..32].copy_from_slice(&content_bytes);
     message[32..].copy_from_slice(&params.timestamp.to_le_bytes());

     if !crate::crypto::signature::verify(
         &PublicKey(author_bytes),
         &message,
         &Signature(signature_bytes)
     ) {
         return RpcResponse::error(
             RpcErrorCode::InvalidSignature,
             "Signature verification failed",
             id,
         );
     }
     ```
   - **CVSS**: 9.1 (Critical) - Authentication bypass with high impact on integrity
   - **Evidence**: Block validation layer (`src/blocks/validation.rs:292-316`) DOES verify signatures via `validate_action_signature()`, but this is only called during block processing. Actions reach the mempool and are broadcast to peers **without signature verification**.

### High

1. **Weak Notification ID Entropy**
   - **Location**: `src/notification/types.rs:116-134`
   - **Attack**: Notification IDs are generated from `(nanosecond_timestamp, atomic_counter)`:
     ```rust
     id[0..8].copy_from_slice(&(nanos as u64).to_le_bytes());
     static COUNTER: AtomicU64 = AtomicU64::new(0);
     let count = COUNTER.fetch_add(1, Ordering::Relaxed);
     id[8..16].copy_from_slice(&count.to_le_bytes());
     ```
   - **Impact**: Counter resets to 0 on each process restart. An attacker who knows approximately when a notification was generated can predict the ID. Could enable targeted manipulation or tracking.
   - **Fix**: Use cryptographic RNG:
     ```rust
     pub fn generate_notification_id() -> NotificationId {
         let mut id = [0u8; 16];
         rand::thread_rng().fill_bytes(&mut id);
         id
     }
     ```
   - **CVSS**: 5.3 (Medium) - Information disclosure potential

2. **`unique_engagers`/`unique_authors_engaged` Counters Never Increment**
   - **Location**: `src/engagement_graph/storage.rs:231-293`
   - **Attack**: The `looks_organic()` spam detection relies on diversity metrics:
     ```rust
     // In looks_organic():
     let diversity = self.unique_authors_engaged as f64 / self.total_outgoing as f64;
     if diversity < 0.1 { return (false, "low_diversity"); }
     ```
     But these counters are always 0, so diversity check passes trivially (0/0 handled separately).
   - **Impact**: Spam/Sybil patterns cannot be detected via engagement diversity analysis.
   - **Fix**: Actually track unique engagers in `update_stats_outgoing()` and `update_stats_incoming()`.
   - **CVSS**: 6.5 (Medium) - Security control bypass

3. **Sponsorship Check Graceful Degradation Bypass**
   - **Location**: `src/rpc/methods.rs:394-398`
   - **Attack**: If sponsorship store is not initialized during node startup, the check passes.
   - **Impact**: Temporary Sybil resistance bypass window during node restart.
   - **Fix**: Block engagement submissions until sponsorship store is initialized.
   - **CVSS**: 5.3 (Medium)

### Medium

1. **Non-Atomic Achievement Unlock Pattern**
   - **Location**: `src/achievement/service.rs:65-96`
   - **Issue**: Events are emitted before confirming persistence. If storage fails, events are already emitted.
   - **Impact**: Inconsistent state between event consumers and storage.
   - **Fix**: Move event emission after successful `self.store.save()`.
   - **CVSS**: 4.3

2. **Missing Emoji Value Validation**
   - **Location**: `src/rpc/methods.rs:2821`
   - **Issue**: Emoji parameter accepts `[u8; 4]` without validating range.
   - **Attack**: Submit engagement with invalid emoji values (e.g., 255).
   - **Impact**: Invalid data propagated to network, displays as "(unknown: N)".
   - **Fix**: Validate emoji values are in valid range at submission.
   - **CVSS**: 3.7

3. **Production `unwrap()` Calls in Rate Calculation**
   - **Location**: `src/engagement_graph/types.rs:95-96`
   - **Issue**: `recent_timestamps.first().unwrap()` and `.last().unwrap()` after len check.
   - **Impact**: Potential panic if vector modified between check and access.
   - **Fix**: Use `if let Some(first) = ...` pattern.
   - **CVSS**: 4.0

4. **Content Existence Not Validated Before Mempool**
   - **Location**: `src/rpc/methods.rs:2865-2870`
   - **Issue**: If content not found, engagement still logged with warning.
   - **Impact**: Orphan actions in mempool until block formation.
   - **Fix**: Return error if content not found.
   - **CVSS**: 3.1

### Low

1. **Self-Engagement Allowed by Design**
   - **Location**: `src/content/engagement.rs:71`
   - **Mitigation**: Tracked separately for spam detection per SPEC_02 §4.2.
   - **CVSS**: 2.0

2. **Hardcoded Spam Detection Thresholds**
   - **Location**: `src/engagement_graph/types.rs:175-193`
   - **Issue**: Fixed 30% self-engagement and 10% diversity thresholds.
   - **Impact**: Attackers who understand thresholds can stay just under limits.
   - **CVSS**: 2.1

3. **Regtest Mode Bypasses All Sponsorship**
   - **Location**: `src/rpc/methods.rs:369-370`
   - **Mitigation**: By design for testing; ensure production never runs as regtest.
   - **CVSS**: N/A (Informational)

---

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 (`ed25519_dalek`) | Action signatures | **Secure** - Industry standard, constant-time |
| Argon2id | PoW mining (64 MiB, 3 iter) | **Secure** - OWASP recommended, memory-hard |
| Argon2id | Key derivation (passphrase) | **Secure** - OWASP parameters |
| ChaCha20-Poly1305 | Identity key storage | **Secure** - Modern AEAD cipher |
| SHA-256 | Content hashing, PoW binding | **Secure** - Standard choice |
| BLAKE3 | Some internal hashing | **Secure** - Fast, secure alternative |
| X25519 | Private space key exchange | **Secure** - ECDH standard |

### Key Management

- **Identity Keys**: Encrypted with Argon2id-derived key + ChaCha20-Poly1305
- **Space Keys**: Encrypted per-member with X25519 box
- **Nonce Generation**: Uses `rand::RngCore` for cryptographic randomness
- **Key Zeroing**: Uses `zeroize` crate for secure memory clearing
- **No Hardcoded Keys**: All keys generated at runtime
- **Assessment**: **Good** - Follows security best practices

### Random Number Generation

| Location | Source | Assessment |
|----------|--------|------------|
| Identity key generation | `OsRng` | **Secure** |
| Identity key storage | `rand::RngCore` | **Secure** |
| Notification IDs | Timestamp + counter | **Weak** - Should use crypto RNG |
| PoW nonce_space | `rand::RngCore` | **Secure** |
| ChaCha20 nonces | `rand::RngCore` | **Secure** |

### Nonce Handling

- **PoW nonce_space**: 8 bytes, cryptographically random per challenge
- **ChaCha20 nonces**: 12 bytes, cryptographically random
- **Argon2 salt**: 16 bytes, cryptographically random
- **Timestamp in PoW**: 64-bit, provides anti-stockpile binding
- **Assessment**: **Secure** - Proper unique nonce generation (except notification IDs)

### Signature Verification

- **Algorithm**: Ed25519 via `ed25519_dalek` library
- **Constant-Time**: Library provides timing-safe comparison
- **Message Format**: `content_hash || timestamp (LE bytes)` - 40 bytes
- **Block Layer**: Verified at `src/blocks/validation.rs:296-316` - **Working**
- **RPC Layer**: Signature parsed but **NOT verified** - **Critical Gap**

---

## Attack Surface

### External Inputs

| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| `content_id` | RPC | SHA256 prefix check, hex decode, 32-byte check | Low |
| `author_id` | RPC | Hex decode, 32-byte check, sponsorship verification | Low |
| `pow_*` fields | RPC | Full Argon2id recomputation, timestamp window check | Low |
| `signature` | RPC | Format validation only (**NOT verified cryptographically**) | **Critical** |
| `emoji` | RPC | 4-element array, **no value range validation** | Medium |
| `timestamp` | RPC | Window check (1h past, 5min future) via PoW | Low |

### Trust Boundaries

1. **RPC Layer → Block Builder**: Actions added **without signature verification**
2. **Mempool → Block Formation**: Block validation DOES verify signatures
3. **Client → Node**: PoW verified, sponsorship verified, signature **NOT verified**
4. **Peer → Peer**: Message signatures verified in gossip protocol

### Privileged Operations

| Operation | Authorization | Assessment |
|-----------|--------------|------------|
| Submit Engagement | PoW + Sponsorship | **Missing signature verification** |
| Achievement Unlock | Internal (TriggerContext) | No direct user control |
| Notification Creation | Internal event system | Safe |
| Space Health Query | Public read | Safe |
| Modify Preferences | Identity-bound | No additional auth required |

---

## Recommendations

### Priority 1: Critical (Immediate Action Required)

1. **Add signature verification to `submit_engagement` RPC handler**
   - **Location**: `src/rpc/methods.rs:2748-2761`
   - The signature is already extracted; add verification before action creation
   - Reference implementation: `src/blocks/validation.rs:292-316` (`validate_action_signature`)
   - **This is a blocking security issue**

### Priority 2: High (Fix Within Sprint)

2. **Replace weak notification ID generation**
   - **Location**: `src/notification/types.rs:116-134`
   - Use `rand::RngCore` or `uuid::Uuid::new_v4()`
   - Current implementation is predictable and restarts counter on process restart

3. **Fix `unique_engagers`/`unique_authors_engaged` counter tracking**
   - **Location**: `src/engagement_graph/storage.rs:231-293`
   - These counters are critical for `looks_organic()` spam detection
   - Currently always 0, making diversity checks ineffective

4. **Fix sponsorship check graceful degradation**
   - **Location**: `src/rpc/methods.rs:394-398`
   - Block engagement submissions until sponsorship store is initialized
   - Or queue pending engagements for verification after initialization

### Priority 3: Medium (Fix Within Month)

5. **Ensure atomic achievement unlock + event emission**
   - Move event emission after successful storage persistence
   - Prevents inconsistent state if storage fails

6. **Add emoji value validation**
   - Validate emoji values are in valid range at submission
   - Return `InvalidParams` error for out-of-range values

7. **Replace `unwrap()` calls in production code**
   - `src/engagement_graph/types.rs:95-96`: Use pattern matching instead
   - Prevents potential panics

8. **Validate content existence before mempool**
   - Return error if content_id doesn't exist
   - Don't allow orphan engagements

### Priority 4: Low (Backlog)

9. **Use sled transactions for engagement graph**
   - Wrap multi-key updates in atomic transactions
   - Prevents inconsistent state from concurrent access

10. **Consider making spam detection thresholds configurable**
    - Current hardcoded 30%/10% thresholds may need tuning
    - Configuration allows adaptation without code changes

---

## Security Best Practices Check

- [x] No hardcoded secrets
- [x] Timing-safe comparisons (Ed25519 verification via ed25519_dalek)
- [x] Secure defaults (PoW required, sponsorship required)
- [x] Principle of least privilege (identity-scoped operations)
- [x] Proper key zeroization (uses `zeroize` crate)
- [x] Cryptographically secure RNG (OsRng) for keys
- [x] Anti-stockpile timestamp validation (1h window)
- [ ] **Signature verification at entry point** (CRITICAL - MISSING in submit_engagement)
- [ ] Complete input validation (emoji range missing)
- [ ] Cryptographic ID generation (notification IDs use weak entropy)
- [ ] No graceful degradation bypasses (sponsorship has startup bypass)

---

## Swimchain-Specific Security Assessment

### PoW Validation (Anti-Stockpile)

- **Implementation**: `src/crypto/action_pow.rs:543-585` (`verify_pow`)
- **Timestamp Window**:
  - Past: `CHALLENGE_VALIDITY_SECS` (varies by action type, typically 1h)
  - Future: `CHALLENGE_FUTURE_TOLERANCE_SECS` (5 minutes)
- **Memory-Hardness**: Argon2id with 64 MiB memory, 3 iterations
- **Assessment**: **Properly Implemented** - PoW cannot be pre-computed and stockpiled

### Signature Verification on All Actions

- **Block Layer**: `src/blocks/validation.rs:296-316` - **Verified** ✓
- **RPC Layer**: `src/rpc/methods.rs:2674-2885` - **NOT Verified** ✗
- **Gossip Layer**: Various handlers verify incoming messages - **Verified** ✓
- **Assessment**: **Critical Gap at RPC entry point** - Actions reach mempool and network without signature verification

### Spam Attestation Thresholds

- **Spam Threshold**: 3 independent sponsor trees (`SPAM_ATTESTATION_THRESHOLD`)
- **Counter Threshold**: 5 Lifeguard+ attestations (`COUNTER_ATTESTATION_THRESHOLD`)
- **Tree Deduplication**: `src/spam_attestation/aggregation.rs:119` - Properly counts unique trees
- **Assessment**: **Properly Implemented** - Sybil-resistant attestation counting

### Private Space Encryption

- **Key Exchange**: X25519 box encryption for `encrypted_space_key`
- **Storage**: Per-member encrypted keys in `MemberRecord`
- **Key Rotation**: Supported via `update_member_key()` with version tracking
- **Assessment**: **Properly Implemented** - End-to-end encryption for private spaces

### Identity Key Protection

- **Algorithm**: Argon2id (OWASP parameters: 64 MiB, 3 iterations) + ChaCha20-Poly1305
- **Salt**: 16 bytes, cryptographically random
- **Nonce**: 12 bytes, cryptographically random
- **Memory Protection**: Uses `zeroize` crate
- **Assessment**: **Industry Best Practice** - Follows OWASP recommendations

---

## Conclusion

The Engagement & Social feature has a **strong cryptographic foundation** with proper use of modern algorithms (Ed25519, Argon2id, ChaCha20-Poly1305). The PoW anti-stockpile mechanism and Sybil-resistant spam attestation are well-implemented. However:

**Critical Issue**: The **missing signature verification at the RPC layer** (`submit_engagement`) must be addressed immediately. This allows anyone to submit engagements on behalf of any identity, completely bypassing authentication.

**High Priority Issues**:
- Weak notification ID entropy (predictable)
- Broken spam detection counters (`unique_engagers`/`unique_authors_engaged`)
- Sponsorship check bypass during startup

**Overall Security Rating**: 79/100 (Needs Improvement - Critical Fix Required)

---

*Security Review Completed: 2026-01-13 (Updated)*
*Previous Review: 2026-01-12*
*Reviewer: Security Specialist Agent*
*Feature Version: 2.0*
