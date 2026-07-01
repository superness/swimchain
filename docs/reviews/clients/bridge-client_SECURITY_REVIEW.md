# Security Review: Bridge Client

## Summary

The Bridge Client presents **critical security vulnerabilities** that make it unsuitable for production deployment. The most severe issue is the storage of private keys (seeds) and access tokens in **plaintext localStorage**, easily accessible to any JavaScript running on the page (XSS attacks, browser extensions). Additionally, there is **no input validation** on configuration fields, **no authentication** on configuration changes, and JSON parsing of WebSocket data without validation creates potential for injection attacks. The cryptographic implementation is sound but runs on the main thread, creating DoS potential.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 8 | 25 | No authorization checks, plaintext credentials |
| Crypto Correctness | 20 | 25 | Good Argon2id usage, secure nonce generation |
| Input Validation | 10 | 25 | Missing validation on config fields, URLs |
| Data Protection | 5 | 25 | Plaintext secrets, no encryption at rest |
| **Total** | **43** | **100** | **CRITICAL ISSUES PRESENT** |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS steals private key from localStorage | High | Critical | None - plaintext storage |
| XSS steals Matrix access token | High | Critical | None - plaintext storage |
| Malicious browser extension steals keys | High | Critical | None - plaintext storage |
| IRC WebSocket proxy injection | Medium | High | None - no message validation |
| DoS via PoW exhaustion | Medium | Medium | Daily budget limits (partial) |
| CSRF on config changes | Low | Medium | None - no CSRF protection |
| Matrix homeserver MITM | Low | High | TLS (partial) |
| IRC proxy MITM | Medium | High | No verification of proxy |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Private Key Stored in Plaintext localStorage

**Location**: `src/hooks/useStoredIdentity.ts:38`, `src/types/index.ts:229-234`

**Vulnerability**: The `StoredIdentity` interface includes a `seed` field (the private key) stored as hex string directly in localStorage without any encryption.

```typescript
// src/types/index.ts:229-234
export interface StoredIdentity {
  address: string;
  publicKey: string;
  seed: string;            // PRIVATE KEY IN PLAINTEXT!
  createdAt: number;
}

// src/hooks/useStoredIdentity.ts:38
localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));  // Plaintext!
```

**Attack**:
1. XSS vulnerability anywhere in the application
2. Attacker injects `localStorage.getItem('swimchain-bridge-identity')`
3. Attacker extracts seed (private key)
4. Attacker can impersonate the bridge, sign arbitrary content

**Impact**: Complete compromise of bridge identity. Attacker can post malicious content as the bridge, drain PoW budget, and damage reputation of bridge operator.

**CVSS**: 9.8 (Critical) - Network attack, no privileges required, complete confidentiality/integrity impact

**Fix**:
- Encrypt the seed with a user-provided passphrase using PBKDF2/Argon2
- Use Web Crypto API's `crypto.subtle.encrypt` with derived key
- Consider using IndexedDB with CryptoKey objects that cannot be exported
- Never store raw seed in localStorage

---

#### 2. Matrix Access Token Stored in Plaintext localStorage

**Location**: `src/types/index.ts:56-67` (MatrixConfig), `src/services/BridgeEngine.ts:631-637`

**Vulnerability**: The Matrix access token is stored in plaintext within the bridge configuration.

```typescript
// src/types/index.ts:56-67
export interface MatrixConfig {
  accessToken: string;  // PLAINTEXT!
}

// BridgeEngine.ts:631-637 - saves entire config including accessToken
localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
```

**Attack**:
1. XSS extracts `localStorage.getItem('bridge_config')`
2. Attacker extracts `accessToken`
3. Attacker has full access to the Matrix user account

**Impact**: Complete compromise of Matrix account. Attacker can read all messages, send messages, join rooms, and potentially access encrypted messages if keys are available.

**CVSS**: 9.1 (Critical) - Network attack, complete confidentiality/integrity of Matrix account

**Fix**:
- Encrypt access token with user-provided passphrase
- Implement token refresh mechanism with short-lived tokens
- Store only a session identifier, with the token in secure memory

---

#### 3. Unvalidated JSON Parsing of WebSocket Messages

**Location**: `src/adapters/IrcAdapter.ts:85`

**Vulnerability**: WebSocket messages from the IRC proxy are parsed without validation.

```typescript
// src/adapters/IrcAdapter.ts:85
const msg = JSON.parse(event.data);  // No try/catch, no schema validation

if (msg.type === IRC_PROXY_MSG.CONNECTED) { ... }
```

**Attack**:
1. Malicious or compromised IRC proxy sends malformed JSON
2. Application crashes or enters undefined state
3. Prototype pollution possible with crafted `__proto__` keys

**Impact**: Application crash, potential prototype pollution leading to broader exploitation.

**CVSS**: 7.5 (High) - Network attack, availability impact, potential integrity impact

**Fix**:
```typescript
try {
  const msg = JSON.parse(event.data);
  if (typeof msg !== 'object' || msg === null) throw new Error('Invalid message');
  if (!['connect', 'connected', 'data', 'error', 'disconnected'].includes(msg.type)) {
    throw new Error('Unknown message type');
  }
  // Process validated message
} catch (error) {
  console.error('[IrcAdapter] Invalid proxy message:', error);
  return;
}
```

---

### High

#### 4. No Input Validation on Configuration Fields

**Location**: Multiple config pages (documented in CLIENT_DOC.md)

**Vulnerability**: Configuration fields like homeserver URLs, IRC servers, room IDs, and channel names are not validated before use.

**Attack Examples**:
- Homeserver URL: `javascript:alert(1)` - potential XSS if URL is rendered
- Room ID: Very long string causing memory exhaustion
- IRC channel: IRC injection via `#test\r\nPRIVMSG NickServ :IDENTIFY password`

**Impact**: XSS, IRC command injection, DoS

**CVSS**: 7.2 (High)

**Fix**:
- Validate URL format with URL constructor
- Limit string lengths (room IDs, channel names)
- Sanitize IRC channel names (alphanumeric + `-_` only)
- Validate Matrix room ID format (`!room:server`)

---

#### 5. No Rate Limiting Bypass Protection

**Location**: `src/services/RateLimiter.ts`

**Vulnerability**: Rate limit state is stored in localStorage and can be manipulated by the user or attacker.

```typescript
// RateLimiter.ts:136-150
private loadState(): void {
  const stored = localStorage.getItem(STORAGE_KEYS.RATE_LIMITS);
  const data = JSON.parse(stored) as Record<SpaceId, number[]>;
  // No validation that timestamps are in the past
}
```

**Attack**:
1. Attacker clears `localStorage.getItem('bridge_rate_limits')`
2. Rate limits are reset, allowing spam

**Impact**: Bypass of spam protection, potential for abuse of Swimchain space

**CVSS**: 6.5 (Medium-High) - Local attack but enables remote spam

**Fix**:
- Server-side rate limiting (primary)
- Sign rate limit state with session key
- Verify timestamps are not in the future

---

#### 6. IRC Command Injection

**Location**: `src/adapters/IrcAdapter.ts:165-169`

**Vulnerability**: IRC messages are sent without sanitizing newlines.

```typescript
// IrcAdapter.ts:165-169
sendMessage(channel: string, content: string): void {
  if (!channel.startsWith('#')) channel = '#' + channel;
  this.sendIrc(`PRIVMSG ${channel} :${content}`);  // content not sanitized!
}
```

**Attack**:
1. Swimchain message contains: `test\r\nPRIVMSG NickServ :DROP #channel`
2. IRC command injection allows arbitrary IRC commands

**Impact**: IRC command injection, channel takeover, nick registration attacks

**CVSS**: 7.5 (High)

**Fix**:
```typescript
sendMessage(channel: string, content: string): void {
  // Remove newlines and carriage returns
  const sanitized = content.replace(/[\r\n]/g, ' ');
  this.sendIrc(`PRIVMSG ${channel} :${sanitized}`);
}
```

---

### Medium

#### 7. PoW Budget State Tamperable

**Location**: `src/services/BridgeEngine.ts:667-678`

**Vulnerability**: Daily PoW budget is stored in localStorage and can be reset by clearing storage.

**Attack**: Clear `bridge_pow_state` to reset daily budget

**Impact**: Bypass PoW budget limits, excessive resource consumption

**CVSS**: 5.3 (Medium)

---

#### 8. No CSRF Protection

**Location**: All configuration endpoints

**Vulnerability**: No anti-CSRF tokens protect configuration changes.

**Impact**: Malicious page could modify bridge configuration

**CVSS**: 5.4 (Medium)

---

#### 9. Timing Attack on Echo Detection

**Location**: `src/services/EchoTracker.ts:77-92`

**Vulnerability**: `wasBridgedTo()` iterates through all entries, timing varies based on match position.

```typescript
// EchoTracker.ts:77-92
wasBridgedTo(targetId: string): boolean {
  for (const [key, entry] of this.seen) {
    if (entry.targetId === targetId) return true;  // Early exit reveals info
  }
  return false;
}
```

**Impact**: Information leakage about bridged message count/order

**CVSS**: 3.1 (Low)

---

### Low

#### 10. Console Logging of Sensitive Information

**Location**: Multiple files

**Vulnerability**: Identity addresses and partial keys logged to console.

```typescript
// BridgeEngine.ts:118
console.log('[BridgeEngine] Identity loaded:', stored.address);

// rpc.ts:92
console.log('[RPC] Identity set:', publicKeyHex.substring(0, 16) + '...');
```

**Impact**: Information leakage via browser console/logs

**CVSS**: 2.4 (Low)

**Fix**: Remove or conditionally compile debug logging

---

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Argon2id | PoW mining | **Good** - Memory-hard, OWASP recommended |
| SHA-256 | Content hashing, RPC signing | **Good** - Standard choice |
| Ed25519 | Signatures (via WASM Keypair) | **Good** - Modern, secure |

### Key Management

**Assessment: CRITICAL FAILURE**

- Private key (seed) stored in plaintext localStorage
- No key derivation from user password
- No secure enclave/key storage used
- Keys accessible to any JavaScript on page

### Random Number Generation

**Assessment: Good**

```typescript
// action-pow.ts:143-146
export function generateNonceSpace(): Uint8Array {
  const nonceSpace = new Uint8Array(8);
  crypto.getRandomValues(nonceSpace);  // Uses Web Crypto API - secure
  return nonceSpace;
}
```

Uses `crypto.getRandomValues()` which is cryptographically secure.

### Nonce Handling

**Assessment: Good**

- Nonce space is 8 bytes (64 bits) randomly generated per challenge
- Nonce counter starts at 0 and increments - standard pattern
- No nonce reuse issues observed

### Signature Verification

**Assessment: Partial**

- Signatures are created correctly using Ed25519
- Signature format follows Swimchain spec
- **Gap**: Client doesn't verify signatures on received content (relies on node)

## Attack Surface

### External Inputs

| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| Matrix messages | Matrix API | Prefix check only | Medium |
| IRC messages | WebSocket proxy | Regex parse only | High |
| Config forms | User | None | High |
| Swimchain content | RPC | None | Medium |
| WebSocket proxy messages | IRC proxy | JSON.parse only | High |

### Trust Boundaries

1. **Browser localStorage** - Trusted but shouldn't be (XSS accessible)
2. **Matrix homeserver** - External, TLS protected
3. **IRC proxy** - External, **no verification**
4. **Swimchain node** - Local, trusted by design
5. **User input** - Untrusted, **not validated**

### Privileged Operations

1. **Signing with private key** - Critical
2. **Posting to Swimchain** - High (PoW gated)
3. **Sending Matrix messages** - High (rate limited)
4. **Sending IRC messages** - High (via proxy)

## Recommendations

### Critical (Fix Immediately)

1. **Encrypt stored credentials** - Implement passphrase-based encryption for seed and access tokens using Web Crypto API
2. **Validate all JSON parsing** - Wrap in try/catch, validate schema
3. **Sanitize IRC messages** - Strip newlines/carriage returns before sending

### High Priority

4. **Add input validation** - URL validation, length limits, format checks on all config fields
5. **Implement server-side rate limiting** - Don't rely solely on client-side limits
6. **Sanitize IRC channel injection** - Validate channel names

### Medium Priority

7. **Move PoW to Web Worker** - Prevents main thread blocking, improves security isolation
8. **Add CSRF protection** - SameSite cookies or anti-CSRF tokens
9. **Reduce console logging** - Remove sensitive data from logs

### Low Priority

10. **Implement constant-time comparison** - For echo detection timing attacks
11. **Add Content Security Policy** - Mitigate XSS impact
12. **Audit WebSocket proxy** - Ensure proxy is trustworthy and TLS-enabled

## Security Best Practices Check

- [ ] **No hardcoded secrets** - Partial pass (no hardcoded, but stored insecurely)
- [ ] **Timing-safe comparisons** - Fail (echo tracker has timing variations)
- [ ] **Secure defaults** - Partial (TLS enabled by default for IRC)
- [ ] **Principle of least privilege** - Fail (full private key accessible in memory)
- [ ] **Input validation** - Fail (missing throughout)
- [ ] **Output encoding** - N/A (no HTML output)
- [ ] **Secure storage** - **CRITICAL FAIL** (plaintext secrets)
- [ ] **Transport security** - Partial (Matrix TLS, IRC proxy variable)
- [ ] **Error handling** - Partial (catches exist but often empty)
- [ ] **Logging hygiene** - Fail (sensitive data logged)

## Conclusion

The Bridge Client has **fundamental security flaws** that must be addressed before production use. The plaintext storage of private keys and access tokens represents an **unacceptable risk** - any XSS vulnerability or malicious browser extension would result in complete compromise of the bridge identity and connected accounts.

**Do not deploy this client with real credentials until critical issues are resolved.**

Estimated remediation effort:
- Critical fixes: 3-5 days
- High priority: 2-3 days
- Full hardening: 2 weeks

---

*Review conducted: 2026-01-12*
*Reviewer: Security Review Agent*
*Severity Rating: CRITICAL - Not Production Ready*
