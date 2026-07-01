# Security Review: Chat-Client

## Summary
The Chat-Client demonstrates **good foundational security practices** with Ed25519 signature authentication, Argon2id PoW for spam prevention, and proper cryptographic key usage via WASM bindings. However, there are **critical concerns** around private key storage in localStorage (unencrypted, no passphrase protection), excessive logging of sensitive metadata, and missing input sanitization for message content that could enable XSS attacks.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 19 | 25 | Good signature auth; localStorage exposure risk |
| Crypto Correctness | 20 | 25 | Strong primitives; seed storage unencrypted |
| Input Validation | 15 | 25 | Basic content trim; no XSS sanitization |
| Data Protection | 14 | 25 | Keys unencrypted; sensitive data logged |
| **Total** | **68** | **100** | |

## Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS via message content | Medium | High | Not mitigated - message.content rendered directly |
| Key theft via XSS | Medium | Critical | Not mitigated - seeds in plaintext localStorage |
| Key theft via browser extension | Medium | Critical | Not mitigated - no encryption layer |
| Timestamp replay attack | Low | Medium | Partially mitigated - timestamp in signature |
| PoW stockpiling | Low | Medium | Mitigated - timestamp in PoW challenge |
| Impersonation via seed theft | Medium | High | Not mitigated - seed enables full impersonation |
| MITM on RPC calls | Low | High | Mitigated - localhost only + signature auth |
| Memory extraction | Low | Medium | Not mitigated - seed stays in JS heap |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. **Private Key (Seed) Stored Unencrypted in localStorage**
**Location**: `src/pages/IdentityPage.tsx:52`, `src/types/index.ts:318-319`
**Attack**: Any XSS vulnerability, malicious browser extension, or physical access can read `localStorage['swimchain-identity']` and extract the 32-byte seed (private key) in hex format.
**Impact**: Full identity theft - attacker can impersonate user, sign any actions as them, send messages as them forever.
**Fix**:
1. Encrypt seed with user-provided passphrase using PBKDF2 + AES-GCM
2. Require passphrase on app launch to decrypt
3. Consider Web Crypto API `extractable: false` for key operations
**CVSS**: 9.1 (Critical) - CWE-312 (Cleartext Storage of Sensitive Information)

```typescript
// Current vulnerable pattern:
seed: toHex(keypair.seed()), // Store seed for signing RPC requests

// Stored as:
{ "seed": "abc123...", "publicKey": "def456..." }
```

#### 2. **XSS via Unsanitized Message Content**
**Location**: `src/components/MessageItem.tsx:191`
**Attack**: Attacker sends message containing malicious HTML/JavaScript. When rendered, `message.content` is displayed directly without sanitization.
**Impact**: Combined with #1, attacker can steal all user seeds in the chat.
**Fix**:
1. Use DOMPurify or similar to sanitize message content
2. Escape HTML entities before rendering
3. Use React's built-in escaping and avoid `dangerouslySetInnerHTML`
**CVSS**: 8.6 (High) - CWE-79 (Cross-site Scripting)

```tsx
// Potentially vulnerable pattern:
<div className="message-body">
  {message.content}  // If content contains React elements or HTML-like strings
</div>
```

Note: React does auto-escape strings, but this relies on message.content always being a primitive string. If content is ever an object or contains JSX, this could be exploited.

### High

#### 3. **Sensitive Seed Metadata Logged to Console**
**Location**: `src/hooks/useRpc.tsx:144-149`
**Attack**: Browser devtools, crash reports, or error monitoring services capture seed length and presence, confirming valuable target.
**Impact**: Information disclosure helps attacker identify high-value targets.
**Fix**: Remove all logging of seed-related information, or hash values before logging.
**CVSS**: 5.3 (Medium) - CWE-532 (Information Exposure Through Log Files)

```typescript
// Vulnerable logging:
console.log('[RPC] Loaded identity from storage:', {
  hasSeed: !!identity?.seed,
  seedLength: identity?.seed?.length,  // Reveals seed exists
  hasPublicKey: !!identity?.publicKey,
  publicKeyPrefix: identity?.publicKey?.substring(0, 16) + '...',
});
```

#### 4. **No Session Expiration or Idle Timeout**
**Location**: Application-wide
**Attack**: User leaves browser open on shared computer; next user has full access to identity.
**Impact**: Unauthorized access to identity and all associated actions.
**Fix**: Implement idle detection with automatic session lock requiring passphrase.
**CVSS**: 5.9 (Medium) - CWE-613 (Insufficient Session Expiration)

### Medium

#### 5. **Keypair Not Cleared from Memory After Use**
**Location**: `src/pages/Chat.tsx:22-27`, `src/lib/rpc.ts:156-165`
**Attack**: Memory dump or JavaScript debugger can extract seed bytes that remain in heap.
**Impact**: Key material exposure via memory inspection.
**Fix**: Call `keypair.free()` immediately after signing; zero-out seed arrays.
**CVSS**: 4.7 (Medium) - CWE-316 (Cleartext Storage of Sensitive Information in Memory)

```typescript
// Pattern that leaves keys in memory:
function createSignFn(identity: { seed: string; publicKey: string }) {
  return (message: Uint8Array): Uint8Array => {
    const seedBytes = hexToBytes(identity.seed);
    const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
    return keypair.sign(message);
    // keypair.free() never called
    // seedBytes still in memory
  };
}
```

#### 6. **No Rate Limiting on Identity Check Polling**
**Location**: `src/hooks/useRpc.tsx:210-237`
**Attack**: Identity check runs every 1 second indefinitely, creating constant localStorage reads that could be monitored.
**Impact**: Performance degradation; side-channel for identity presence detection.
**Fix**: Increase interval to 5+ seconds; use event-based detection instead of polling.
**CVSS**: 3.1 (Low) - CWE-400 (Uncontrolled Resource Consumption)

#### 7. **Message Content Length Not Validated**
**Location**: `src/components/ChatMessageInput.tsx:42-46`
**Attack**: User sends extremely long message; PoW is mined but RPC may reject; DoS on sender's CPU.
**Impact**: Resource waste; potential memory issues on receiving clients.
**Fix**: Enforce maximum message length (e.g., 4000 chars) before PoW mining.
**CVSS**: 3.7 (Low) - CWE-20 (Improper Input Validation)

```typescript
const handleSend = useCallback(async () => {
  const trimmedContent = content.trim();
  if (!trimmedContent || disabled || isSending) return;
  // No length check before mining PoW
  await onSend(trimmedContent);
}, ...);
```

### Low

#### 8. **No HTTPS Enforcement for RPC Endpoint**
**Location**: `src/lib/rpc.ts:637-639`
**Attack**: On localhost this is acceptable, but if endpoint ever changes, HTTP would expose signatures.
**Impact**: Theoretical MITM if used with non-localhost endpoints.
**Fix**: Enforce HTTPS for non-localhost endpoints; add warning for HTTP.
**CVSS**: 2.4 (Low)

#### 9. **Signature Message Format Could Allow Confusion**
**Location**: `src/lib/rpc.ts:214`
**Attack**: If another application uses similar format, signature could be replayed.
**Impact**: Cross-protocol signature replay.
**Fix**: Add domain separator or version number; current format is acceptable for Swimchain-only use.
**CVSS**: 2.1 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Signature authentication | Excellent - modern, secure |
| Argon2id | PoW mining | Excellent - memory-hard, ASIC-resistant |
| SHA-256 | Params hashing for signature | Good - standard |
| CSPRNG | Nonce generation | Good - uses `crypto.getRandomValues()` |

### Key Management
- **Generation**: Secure - uses WASM-wrapped cryptographic library
- **Storage**: **CRITICAL** - Plaintext in localStorage, no encryption
- **Transmission**: Good - seed never transmitted, only signatures
- **Destruction**: Poor - Keys remain in memory, no explicit cleanup

### Random Number Generation
- Uses `crypto.getRandomValues()` for nonce space generation: Secure
- Nonce spaces are 8 bytes (64 bits): Sufficient for replay prevention

### Nonce Handling
- PoW nonces include timestamp, preventing stockpiling: Good
- Nonce space is random per-action, preventing precomputation: Good
- Signature includes timestamp, limiting replay window: Good

## Attack Surface

### External Inputs
1. **Message content from other users** - Rendered in UI, potential XSS vector
2. **User-provided message text** - Sent to PoW miner and RPC
3. **Route parameters (serverId, channelId)** - Used in navigation, could cause unexpected routing
4. **RPC responses** - Parsed as JSON, assumed trustworthy from local node

### Trust Boundaries
1. **Browser ↔ localStorage** - No encryption, full trust assumed
2. **Client ↔ Local Node (RPC)** - Signature authenticated, localhost trusted
3. **User ↔ Client** - No passphrase protection
4. **WASM ↔ JavaScript** - Trusted, memory boundary

### Privileged Operations
1. `setIdentity()` - Stores keypair to localStorage
2. `signFn()` - Uses seed to sign messages
3. `submitReply()`, `submitPost()`, `submitEngagement()` - Authenticated actions
4. `clearIdentity()` - Deletes keypair (with confirmation)

## Recommendations

### Priority 1 (Critical - Fix Before Production)
1. **Encrypt seed with passphrase** - Use PBKDF2 + AES-GCM to encrypt seed before storing
2. **Add passphrase lock screen** - Require passphrase on app launch and after idle
3. **Sanitize message content** - Use DOMPurify or escape HTML entities

### Priority 2 (High - Fix Soon)
4. **Remove sensitive logging** - Never log seed presence, length, or related metadata
5. **Add message length limits** - Enforce max 4000 characters before PoW mining
6. **Clear keypairs from memory** - Call `keypair.free()` after signing operations

### Priority 3 (Medium - Address in Upcoming Release)
7. **Add idle timeout** - Lock after 15 minutes of inactivity
8. **Reduce identity polling** - Increase interval from 1s to 5s
9. **Add export/backup feature** - Allow encrypted seed export for recovery

### Priority 4 (Low - Consider for Future)
10. **Consider Web Crypto SubtleCrypto** - For non-extractable key storage where possible
11. **Add domain separation** - Version signature format for future compatibility
12. **Implement CSP headers** - Restrict script sources when deployed

## Security Best Practices Check
- [x] No hardcoded secrets
- [x] Timing-safe comparisons (delegated to WASM)
- [ ] **Secure defaults** - Seeds stored unencrypted by default
- [ ] **Principle of least privilege** - Seed available app-wide, not scoped
- [x] No eval() or innerHTML usage
- [ ] **Input sanitization** - Missing for message content
- [x] CORS not applicable (localhost RPC)
- [x] PoW prevents spam attacks
- [x] Signature authentication prevents impersonation (when seed is secure)
- [ ] **Memory protection** - Keys remain in JS heap

## Swimchain-Specific Security

### PoW Validation (Anti-Stockpile)
**Status**: Properly implemented
- Timestamp included in challenge: `createChallenge()` uses current timestamp
- Difficulty enforced per action type
- Nonce space is random per action

### Signature Verification on All Actions
**Status**: Properly implemented
- All submissions (post, reply, engagement) require signature
- Signature format includes method, params hash, timestamp
- Server-side verification assumed in local node

### Spam Attestation Thresholds
**Status**: Correctly configured
- MESSAGE_DIFFICULTY = 10 (~15s)
- REACTION_DIFFICULTY = 8 (~1s)
- IDENTITY_DIFFICULTY = 20 (high barrier)

### Private Space Encryption
**Status**: Not evaluated (not implemented in chat-client)
- Chat-client is public-only currently

### Identity Key Protection
**Status**: **CRITICAL WEAKNESS**
- Seed stored in plaintext localStorage
- No passphrase protection
- No encryption at rest
- Browser extensions can read localStorage
- Any XSS can exfiltrate seeds

---

**Review Date**: 2026-01-12
**Reviewer**: Security Review Agent
**Client Version**: 0.1.0
**Risk Level**: HIGH (due to unencrypted key storage)
