# Security Review: Identity Cryptography

## Summary

The Identity Cryptography feature demonstrates **excellent security design** with proper use of modern cryptographic primitives, secure key derivation, and memory-safe handling of sensitive material. The implementation follows industry best practices including constant-time operations (via `ed25519_dalek`), memory-hard key derivation (Argon2id), and authenticated encryption (ChaCha20-Poly1305). Minor issues include potential panic paths in production code and the lack of recovery mechanisms, which are by design but require user education.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 23 | 25 | Proper signature verification, timestamp tolerance checks |
| Crypto Correctness | 24 | 25 | Modern algorithms, correct usage, minor nonce concerns |
| Input Validation | 22 | 25 | Good bounds checking, some unchecked paths |
| Data Protection | 23 | 25 | Excellent encryption, proper key zeroing |
| **Total** | **92** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Brute-force key derivation | Low | Critical | Argon2id with 64MB memory, 3 iterations |
| Pre-computed identity stockpile | Medium | Medium | 24h anti-stockpile limit on PoW proofs |
| Replay attacks | Low | Medium | Timestamp tolerances (1h past, 5min future) |
| Memory scraping for keys | Low | Critical | Volatile zeroing on PrivateKey drop |
| Sybil attack (mass identity creation) | Low | High | 20-bit PoW (~10-30s per identity) |
| Key material logging | Very Low | Critical | Debug output shows [REDACTED] |
| Timing side channels | Very Low | Medium | ed25519_dalek uses constant-time ops |
| Passphrase brute-force | Low | Critical | Argon2id memory-hard KDF |
| Malformed signature DoS | Low | Low | Proper error handling returns false |
| PoW timestamp manipulation | Medium | Low | Both future (5min) and past (24h) checked |
| Corrupted portable identity | Low | Low | Extensive validation in deserialize_portable |

## Vulnerabilities Found

### Critical (Exploitable)

None identified.

### High

None identified.

### Medium

1. **Vulnerability**: Potential panic in `current_timestamp()` on system time before UNIX epoch
   **Location**: `src/crypto/signature.rs:104-107`
   **Attack**: If system clock is set before 1970 (misconfigured system), the node panics
   **Impact**: Denial of service
   **Fix**: Return `Result<u64, TimeError>` or use `saturating_duration_since`
   **CVSS**: 4.3 (AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L)

2. **Vulnerability**: `expect()` calls in address encoding that could panic
   **Location**: `src/crypto/address.rs:25,29,41,45`
   **Attack**: Theoretical; HRP "cs" is hardcoded and always valid
   **Impact**: Code review concern rather than exploitable
   **Fix**: Use `const` assertion or unwrap_unchecked in release mode
   **CVSS**: 2.0 (theoretical only)

3. **Vulnerability**: Display name length uses `u8` cast potentially truncating long names
   **Location**: `src/identity/portable.rs:294`
   **Attack**: Display names >255 bytes get silently truncated during serialization
   **Impact**: Data corruption, but MAX_DISPLAY_NAME_BYTES is 64 so unlikely
   **Fix**: Validate length before cast or use u16 consistently
   **CVSS**: 3.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N)

### Low

1. **Vulnerability**: No passphrase strength validation
   **Location**: `src/identity/storage.rs:56-87`
   **Attack**: Users may use weak passphrases
   **Impact**: Easier brute-force of encrypted keys
   **Fix**: Add optional passphrase strength requirements or warnings
   **CVSS**: 2.5

2. **Vulnerability**: Empty passphrase allowed
   **Location**: `src/identity/storage.rs` - `encrypt_private_key` accepts any string
   **Attack**: Users can encrypt with empty string
   **Impact**: No protection for exported identity
   **Fix**: Validate minimum passphrase length
   **CVSS**: 2.0

3. **Vulnerability**: No rate limiting on failed decryption attempts
   **Location**: `src/identity/storage.rs:97-137`
   **Attack**: Offline brute-force attack on encrypted key file
   **Impact**: Limited by Argon2id's memory-hardness
   **Fix**: Consider adding lockout or increasing iterations after failures
   **CVSS**: 2.0

4. **Vulnerability**: Nonce collision theoretical possibility with ChaCha20
   **Location**: `src/identity/storage.rs:70-72`
   **Attack**: If OsRng produces duplicate 96-bit nonces, encryption fails
   **Impact**: Extremely unlikely (2^-96 probability per encryption)
   **Fix**: Consider using XChaCha20 with 192-bit nonces for extra margin
   **CVSS**: 1.0 (theoretical)

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Signatures | **Excellent** - 128-bit security, deterministic, constant-time |
| SHA-256 | PoW hash, IdentityId | **Excellent** - NIST standard, appropriate for PoW |
| Argon2id | Key derivation | **Excellent** - Winner of PHC, memory-hard, timing-resistant |
| ChaCha20-Poly1305 | Key encryption | **Excellent** - IETF standard AEAD, fast in software |
| Bech32m | Address encoding | **Excellent** - BIP-350 standard, error detection |
| Blake3 | Internal hashing | **Excellent** - Fast, modern, appropriate for non-crypto uses |

### Key Management

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Generation | OsRng (crypto-secure PRNG) | **Correct** |
| Storage format | 64 bytes (seed + pubkey) | **Correct** per ed25519 convention |
| Memory zeroing | Volatile write + compiler_fence | **Correct** - prevents optimizer from skipping |
| Debug output | [REDACTED] | **Correct** - no key leakage in logs |
| File storage | Hex(pubkey).key naming | **Acceptable** - pubkey is public |

### Random Number Generation

| Source | Usage | Assessment |
|--------|-------|------------|
| `OsRng` | Keypair generation | **Correct** - OS-level entropy |
| `OsRng` | Salt generation | **Correct** - 16 bytes = 128 bits |
| `OsRng` | Nonce generation | **Correct** - 12 bytes for ChaCha20 |

### Nonce Handling

| Context | Implementation | Assessment |
|---------|----------------|------------|
| ChaCha20-Poly1305 | 12-byte random nonce | **Acceptable** - unique per salt/key combination |
| PoW nonce | Sequential u64 | **Correct** - mining requires iteration |
| Timestamp in signatures | UNIX seconds | **Correct** - provides replay protection |

## Attack Surface

### External Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Passphrase | User | None - any string accepted |
| Bech32m address | User/Network | HRP, version, length validated |
| Signature envelope | Network | Timestamp tolerance, signature verification |
| PoW proof | Network | Hash recomputation, difficulty, timestamp |
| Portable identity | File/Network | Magic bytes, version, length checks |
| Encrypted key blob | File | Minimum length, AEAD authentication |

### Trust Boundaries

| Boundary | Description | Protection |
|----------|-------------|------------|
| User → Node | Identity creation, signing | PoW gating, local keypair |
| Network → Node | Signature verification | Ed25519 verification |
| Network → Node | PoW proof verification | Hash recomputation, timestamp checks |
| File → Node | Key decryption | AEAD authentication |
| Memory → Disk | Key storage | Encryption with Argon2id+ChaCha20 |

### Privileged Operations

| Operation | Privilege | Control |
|-----------|-----------|---------|
| Sign messages | Requires private key | Key never leaves memory unencrypted |
| Create identity | Requires PoW | 20-bit difficulty (~10-30s) |
| Export identity | Requires passphrase | Encryption mandatory |
| Import identity | Requires passphrase | Decryption with authentication |

## Recommendations

### Priority 1 - High Impact Security Improvements

1. **Replace `expect()` in `current_timestamp()` with proper error handling**
   - Location: `src/crypto/signature.rs:106`
   - Use `SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default()` or return Result

2. **Add minimum passphrase length validation**
   - Location: `src/identity/storage.rs:56`
   - Recommend minimum 8 characters with warning for weak passphrases

3. **Validate display_name length before u8 cast**
   - Location: `src/identity/portable.rs:294`
   - Add explicit length check to prevent silent truncation

### Priority 2 - Defense in Depth

4. **Consider XChaCha20-Poly1305 for larger nonce space**
   - Current 96-bit nonces are safe but 192-bit provides better margin
   - Particularly relevant for high-volume key operations

5. **Add file locking for key storage operations**
   - Location: `src/identity/storage.rs:188-203`
   - Prevent race conditions during concurrent access

6. **Implement key file integrity verification**
   - Add HMAC or similar to detect tampering beyond AEAD scope
   - Could detect file corruption vs wrong passphrase

### Priority 3 - Enhanced Security Features

7. **Add optional WebAuthn/Passkey support** (Future)
   - Enable hardware-backed key storage
   - Listed in Known Limitations

8. **Implement HD key derivation** (Future)
   - Allow deterministic child key generation
   - Listed in Future Work

9. **Add key rotation protocol** (Future)
   - Enable identity key changes while preserving reputation
   - Listed in Future Work

## Security Best Practices Check

- [x] No hardcoded secrets
- [x] Timing-safe comparisons (via ed25519_dalek constant-time operations)
- [x] Secure defaults (20-bit PoW, Argon2id parameters)
- [x] Principle of least privilege (private keys only in memory when needed)
- [x] Memory protection (volatile zeroing on drop)
- [x] Authenticated encryption (ChaCha20-Poly1305 AEAD)
- [x] Proper key derivation (Argon2id with salt)
- [x] Replay protection (timestamp tolerances)
- [x] Anti-stockpile protection (24h PoW expiry)
- [ ] Passphrase strength validation (missing)
- [ ] Rate limiting on failed decryption (missing - but Argon2id mitigates)
- [ ] Atomic file operations (missing)

## Specification Compliance

| SPEC_01 Section | Requirement | Implementation | Status |
|-----------------|-------------|----------------|--------|
| §3.3 | Bech32m with "cs" HRP | `encode_address_from_pubkey()` | **Compliant** |
| §3.4 | SHA-256 PoW | `pow_hash()` uses SHA-256 | **Compliant** |
| §3.5 | Display name max 64 bytes | `MAX_DISPLAY_NAME_BYTES = 64` | **Compliant** |
| §6.2 | Signature 1h past, 5min future | Constants defined correctly | **Compliant** |
| §6.3 V-POW-01 | Recompute hash | `verify_identity_pow()` | **Compliant** |
| §6.3 V-POW-02 | Check leading zeros | `leading_zeros()` | **Compliant** |
| §6.3 V-POW-03 | 1h verification tolerance | `verify_identity_pow_strict()` | **Compliant** |
| §6.3 V-POW-04 | 24h anti-stockpile | `POW_MAX_AGE_SECS = 86400` | **Compliant** |
| §12.1 | Default difficulty 20 bits | `DEFAULT_IDENTITY_POW_DIFFICULTY = 20` | **Compliant** |

## Conclusion

The Identity Cryptography implementation demonstrates strong security engineering with proper use of modern cryptographic primitives and attention to defense-in-depth. The choice of Ed25519 for signatures, Argon2id for key derivation, and ChaCha20-Poly1305 for encryption represents current best practices. The anti-stockpile and replay protection mechanisms are well-designed. The main areas for improvement are edge-case error handling (replacing `expect()` calls) and adding passphrase strength validation to protect users from themselves.

---

**Review Date**: 2026-01-12
**Reviewer**: Security Reviewer Agent
**Feature Version**: 52804af
**Overall Security Rating**: **92/100 - Excellent**
