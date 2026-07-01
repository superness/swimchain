# Security Review: Forum Client

## Summary
The Forum Client demonstrates strong cryptographic foundations with proper use of modern algorithms (AES-256-GCM, PBKDF2, X25519, XSalsa20-Poly1305, Argon2id). Key security mechanisms are well-implemented including PoW validation, signature authentication, and end-to-end encryption. However, there are significant concerns around key material storage in localStorage (unencrypted), potential sensitive data logging, and missing input validation/sanitization in several areas. The overall security posture is **good but requires hardening** before production deployment.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 20 | 25 | Solid signature auth, but no session timeout; keypair stored in localStorage |
| Crypto Correctness | 22 | 25 | Strong algorithms, proper nonce generation; minor PBKDF2 iteration concern |
| Input Validation | 17 | 25 | Limited validation on user inputs; no sanitization for displayed content |
| Data Protection | 16 | 25 | Private keys in localStorage unencrypted; sensitive data in console logs |
| **Total** | 75 | 100 | Good foundation, needs hardening |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS stealing private key | Medium | Critical | Keys stored in localStorage accessible to XSS; no CSP documented |
| Malicious content injection | Medium | High | React escapes by default, but no explicit sanitization layer |
| MITM on RPC connection | Low | High | HTTP used (not HTTPS) for localhost; signature auth provides integrity |
| Passphrase brute-forcing | Low | Medium | PBKDF2 with 100k iterations; could be higher |
| PoW stockpiling attack | Low | Low | Timestamp validation server-side prevents pre-mining |
| Key material in logs | Medium | High | Console logs include partial seeds/keys for debugging |
| IndexedDB key theft | Medium | High | Space keys stored unencrypted in IndexedDB |
| localStorage manipulation | Medium | Medium | Identity stored as JSON; no integrity verification |

## Vulnerabilities Found

### Critical (Exploitable)

None found.

### High

#### 1. **Private Key Stored Unencrypted in localStorage**
   **Location**: `forum-client/src/hooks/useStoredIdentity.ts:38`
   **Attack**: XSS attack could read `localStorage['swimchain-identity']` to steal the user's private seed
   **Impact**: Complete identity compromise - attacker can impersonate user, sign transactions, decrypt private spaces
   **Fix**: Encrypt the seed using a user-provided password before storing, or use Web Crypto API's non-extractable keys where possible
   **CVSS**: 7.5 (High)

#### 2. **Passphrase Stored in localStorage Unencrypted**
   **Location**: `forum-client/src/hooks/usePassphraseStore.ts:74,134`
   **Attack**: XSS attack could read `localStorage['swimchain-default-passphrase']` and `localStorage['swimchain-passphrases']`
   **Impact**: Attacker can decrypt all previously encrypted content
   **Fix**: Either don't persist passphrases, or encrypt them with a master password
   **CVSS**: 6.5 (Medium-High)

#### 3. **Space Keys Stored Unencrypted in IndexedDB**
   **Location**: `forum-client/src/hooks/usePrivateSpaceKeys.ts:140-150`
   **Attack**: XSS attack could access IndexedDB `swimchain-private-spaces` store to steal space keys
   **Impact**: Attacker can decrypt all private space messages
   **Fix**: Encrypt space keys with the user's identity seed or a derived key before storage
   **CVSS**: 6.5 (Medium-High)

### Medium

#### 4. **Sensitive Data Logged to Console**
   **Location**: Multiple files including:
   - `forum-client/src/hooks/useRpc.tsx:156-161` - logs seed presence and public key prefix
   - `forum-client/src/lib/rpc.ts:230-238` - logs signature auth details
   **Attack**: Console logs accessible via browser dev tools or log aggregation
   **Impact**: Partial key exposure aids cryptanalysis; full message reconstruction aids replay attacks
   **Fix**: Remove or gate sensitive logging behind a DEBUG flag; never log seed-related info
   **CVSS**: 4.3 (Medium)

#### 5. **No Content Sanitization Before Display**
   **Location**: Throughout `forum-client/src/components/` - React renders content directly
   **Attack**: While React escapes HTML by default, URLs, markdown parsing, or future features could introduce XSS
   **Impact**: XSS leading to key theft (see vulnerabilities 1-3)
   **Fix**: Add explicit sanitization layer (e.g., DOMPurify) for user-generated content; implement CSP headers
   **CVSS**: 5.3 (Medium)

#### 6. **HTTP Used for RPC Connections**
   **Location**: `forum-client/src/lib/rpc.ts:868,879-886`
   **Attack**: MITM on local network could intercept RPC traffic (though signature auth prevents tampering)
   **Impact**: Metadata exposure; potential response manipulation before signature verification
   **Fix**: Use HTTPS for all connections; document that localhost is acceptable only for trusted environments
   **CVSS**: 4.3 (Medium)

#### 7. **No Session Timeout or Key Rotation**
   **Location**: `forum-client/src/hooks/useStoredIdentity.ts`
   **Attack**: Stolen keys remain valid indefinitely
   **Impact**: Long-term compromise if key is ever exposed
   **Fix**: Implement session timeouts; add ability to rotate keys; clear sensitive data on logout
   **CVSS**: 4.0 (Medium)

### Low

#### 8. **PBKDF2 Iteration Count Could Be Higher**
   **Location**: `forum-client/src/lib/encryption.ts:14`
   **Attack**: Offline passphrase brute-forcing
   **Impact**: Weak passphrases more vulnerable to cracking
   **Fix**: Increase `PBKDF2_ITERATIONS` from 100,000 to 600,000+ per OWASP 2023 recommendations
   **CVSS**: 3.7 (Low)

#### 9. **Missing Input Length Validation**
   **Location**: Throughout - hex parsing functions don't validate input length
   **Attack**: Malformed input could cause unexpected behavior
   **Impact**: DoS or incorrect cryptographic operations
   **Fix**: Add explicit length checks before `hexToBytes` operations; validate all user inputs
   **CVSS**: 3.1 (Low)

#### 10. **No Integrity Check on Stored Identity**
   **Location**: `forum-client/src/hooks/useStoredIdentity.ts:24-29`
   **Attack**: Attacker with storage access could modify stored identity JSON
   **Impact**: Replace user's key with attacker-controlled key
   **Fix**: Add MAC/signature over stored identity data
   **CVSS**: 3.1 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Purpose | Assessment |
|-----------|---------|------------|
| AES-256-GCM | Content encryption | Excellent - authenticated encryption, proper IV handling |
| PBKDF2-SHA256 | Key derivation | Good - but 100k iterations is below current recommendations |
| X25519 | Key exchange | Excellent - modern ECDH implementation via @noble/curves |
| XSalsa20-Poly1305 | NaCl box encryption | Excellent - battle-tested authenticated encryption |
| Argon2id | PoW hashing | Excellent - memory-hard, appropriate for spam resistance |
| SHA-256 | Content hashing | Good - appropriate for non-password uses |
| Ed25519 | Digital signatures | Excellent - via WASM bindings and @noble/curves |

### Key Management
- **Generation**: Uses `crypto.getRandomValues()` for all random material
- **Storage**: Keys stored in localStorage/IndexedDB without encryption (vulnerability)
- **Derivation**: Ed25519 to X25519 conversion correctly implemented using birational map
- **Cleanup**: `keypair.free()` called on component unmount (good WASM hygiene)

### Random Number Generation
- Uses Web Crypto API's `crypto.getRandomValues()` consistently
- Salt and IV generation properly randomized
- Nonce space for PoW uses CSPRNG

### Nonce Handling
- AES-GCM IV: 12 bytes randomly generated per encryption (correct)
- XSalsa20 nonce: 24 bytes randomly generated per message (correct)
- No nonce reuse detected - each encryption generates new randomness

## Attack Surface

### External Inputs
1. RPC responses from Swimchain node
2. Content from other users (threads, replies, messages)
3. Encrypted content requiring passphrase decryption
4. URL parameters (search queries, IDs)
5. postMessage from parent frame (iframe mode)
6. User-uploaded media (images)

### Trust Boundaries
1. **Browser ↔ localStorage/IndexedDB**: Treated as secure, but vulnerable to XSS
2. **Client ↔ RPC Node**: Authenticated via signatures, but transport not always encrypted
3. **Client ↔ Encrypted Content**: Passphrase required for decryption
4. **Client ↔ Parent Frame**: Receives RPC config via postMessage (origin not validated)

### Privileged Operations
1. Private key operations (signing, decryption)
2. Space key management
3. Identity creation/deletion
4. Passphrase storage
5. Content creation (requires PoW + signature)

## Recommendations

### P0 - Critical (Address Before Production)
1. **Encrypt private key at rest**: Use a master password to encrypt the seed in localStorage
2. **Remove sensitive console logging**: Gate behind explicit DEBUG mode, never log seeds/keys
3. **Encrypt IndexedDB space keys**: Derive encryption key from user's identity

### P1 - High (Address Soon)
4. **Add Content Security Policy**: Configure CSP headers to prevent XSS
5. **Implement passphrase protection**: Either don't persist or encrypt with master password
6. **Validate postMessage origin**: Check `event.origin` before accepting parent frame config
7. **Add session timeout**: Clear sensitive data after inactivity period

### P2 - Medium (Planned)
8. **Increase PBKDF2 iterations**: Raise to 600,000+ per OWASP recommendations
9. **Add sanitization layer**: Implement DOMPurify for user-generated content
10. **Use HTTPS for remote connections**: Document security requirements for deployment
11. **Add input validation**: Validate hex strings, content IDs, and other user inputs

### P3 - Low (Nice to Have)
12. **Add integrity verification**: MAC over stored identity data
13. **Implement key rotation**: Allow users to rotate keys without losing access
14. **Add security headers documentation**: X-Frame-Options, X-Content-Type-Options, etc.

## Security Best Practices Check

- [x] No hardcoded secrets (credentials loaded from environment/storage)
- [ ] Timing-safe comparisons (not verified for all signature checks)
- [x] Secure defaults (encryption enabled by design)
- [x] Principle of least privilege (PoW required for all content creation)
- [ ] No sensitive data in logs (partial seeds/keys logged)
- [x] Proper random number generation (uses Web Crypto API)
- [x] Modern cryptographic algorithms (no deprecated algorithms)
- [x] Authenticated encryption (AES-GCM, NaCl box)
- [ ] Protected key storage (localStorage/IndexedDB unencrypted)
- [x] Signature verification (all RPC calls can be authenticated)

## Swimchain-Specific Security

### PoW Validation
- **Implementation**: Argon2id with configurable difficulty per action type
- **Anti-stockpile**: Timestamp included in challenge; server validates freshness
- **Assessment**: Correctly implemented - timestamps prevent pre-mining attacks

### Signature Verification
- **Implementation**: Ed25519 signatures on all content submissions
- **Message Format**: `swimchain-rpc:${method}:${paramsHash}:${timestamp}`
- **Assessment**: Strong - includes method, params hash, and timestamp to prevent replay

### Spam Attestation
- **Implementation**: PoW required to submit attestations
- **Assessment**: Good - prevents spam of the spam-reporting mechanism itself

### Private Space Encryption
- **Implementation**: X25519 key exchange + AES-256-GCM
- **Assessment**: Cryptographically sound, but keys stored unencrypted (see vulnerability #3)

### Identity Key Protection
- **Current State**: Stored in localStorage as hex string
- **Assessment**: Insufficient - needs encryption at rest

---

**Review Date**: 2026-01-12
**Reviewer**: Security Review Agent
**Version**: 1.0
