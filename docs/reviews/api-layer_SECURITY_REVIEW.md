# Security Review: API Layer

## Summary

The API Layer demonstrates **reasonable security foundations** with proper use of Ed25519 signatures, Argon2id-based PoW, and content validation per SPEC_12. However, the **disabled anti-abuse module (709 lines)** is a critical gap that leaves the API vulnerable to DoS and spam attacks. Identity handling is secure with encrypted private keys, but the lack of rate limiting and query timeouts creates exploitable attack vectors.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 19 | 25 | Identity required for writes, but no session mgmt |
| Crypto Correctness | 23 | 25 | Ed25519, Argon2id, SHA-256 used correctly |
| Input Validation | 17 | 25 | Content format validated, but no rate limits active |
| Data Protection | 19 | 25 | Private keys encrypted, no key logging found |
| **Total** | **78** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| DoS via query flood | **High** | High | **UNMITIGATED** - anti-abuse disabled, no timeouts |
| PoW stockpiling | Medium | Medium | Partial - timestamp checks, but no anti-stockpile |
| Content spam flooding | **High** | High | **UNMITIGATED** - no rate limiting active |
| Identity theft | Low | High | Encrypted private keys with password protection |
| Signature forgery | Low | Critical | Ed25519 correctly implemented |
| Replay attacks | Low | Medium | Timestamp checks with tolerance windows |
| Memory exhaustion (event buffer) | Medium | Medium | Fixed buffer size (default 100) |
| RwLock deadlock/panic | Medium | High | `.unwrap()` on 18+ lock operations in anti_abuse.rs |
| Malformed input parsing | Low | Medium | Proper bounds checking in deserialization |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Anti-Abuse Module Disabled - No Rate Limiting**
   **Location**: `src/api/mod.rs:75-76`
   **Attack**: Attacker can flood the API with unlimited content creation requests
   **Impact**: DoS attack, storage exhaustion, network spam
   **Fix**: Re-enable and update the `AntiAbuseHandler` module
   **CVSS**: 7.5 (High - Network DoS)

   ```rust
   // TEMPORARY: Disabled due to API changes - needs update
   // pub mod anti_abuse;
   ```

### High

1. **Query Timeout Not Enforced**
   **Location**: `src/api/config.rs:11` (configured), `src/api/queries.rs` (not used)
   **Attack**: Slow queries can tie up resources indefinitely
   **Impact**: Resource exhaustion, DoS
   **Fix**: Implement timeout wrapping using `tokio::time::timeout`
   **CVSS**: 6.5

   ```rust
   // ApiConfig defines timeout but QueryHandler never uses it:
   pub query_timeout_ms: u64,  // Default: 5000ms - NOT ENFORCED
   ```

2. **RwLock Unwrap Panics in Anti-Abuse Module**
   **Location**: `src/api/anti_abuse.rs:116, 128, 139, 159, 197, 203, 209, 246, 254, 283, 293, 314, 320, 375, 382, 389, 397, 403`
   **Attack**: Poisoned mutex from panic in another thread
   **Impact**: Application crash, DoS
   **Fix**: Replace `.unwrap()` with proper error handling
   **CVSS**: 5.9

   ```rust
   let tracker = self.rate_limit_tracker.read().unwrap();  // Panics on poison
   ```

### Medium

1. **PoW Cancellation Not Properly Implemented**
   **Location**: `src/api/commands.rs:217-224`
   **Attack**: User cannot cancel long-running PoW, tying up resources
   **Impact**: Resource exhaustion, poor UX
   **Fix**: Implement proper cancellation in `compute_pow_with_callback`
   **CVSS**: 4.3

   ```rust
   // Note: The callback returning false means cancel,
   // but compute_pow_with_callback doesn't support cancellation.
   // This is a limitation...
   ```

2. **No PoW Anti-Stockpile Verification**
   **Location**: `src/api/commands.rs:105-145`
   **Attack**: Attacker pre-computes PoW during low-activity periods
   **Impact**: Spam bursts during peak times
   **Fix**: Add anti-stockpile timestamp verification per SPEC_03
   **CVSS**: 5.3

3. **Event Buffer Overflow Silent Drop**
   **Location**: `src/api/subscription.rs:47-49`
   **Attack**: Attacker generates events faster than subscriber can process
   **Impact**: Event loss, inconsistent state view
   **Fix**: Consider back-pressure mechanism or alerting
   **CVSS**: 3.7

   ```rust
   // Ignore send errors - they occur when there are no subscribers
   let _ = self.sender.send(event);
   ```

### Low

1. **Identity Public Key Exposed in Commands**
   **Location**: `src/api/commands.rs:84-87`
   **Attack**: Information disclosure via `public_key()` method
   **Impact**: Minor - public keys are meant to be public
   **Fix**: None required, but document intended usage
   **CVSS**: 2.1

2. **Sync Status Placeholder Returns False Information**
   **Location**: `src/api/queries.rs:141-143`
   **Attack**: Users may make decisions based on incorrect sync status
   **Impact**: User confusion, potential inconsistent views
   **Fix**: Connect to actual sync manager
   **CVSS**: 2.5

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Purpose | Assessment |
|-----------|---------|------------|
| Ed25519 | Signatures | **Secure** - Industry standard, correctly implemented |
| SHA-256 | Content hashing | **Secure** - Appropriate for content IDs |
| Argon2id | Action PoW | **Secure** - Memory-hard, ASIC resistant |
| AES-GCM (assumed) | Private key encryption | **Secure** - Standard authenticated encryption |
| Base64 | Portable identity encoding | **Adequate** - Not for security, just encoding |

### Key Management

- **Private Key Storage**: Encrypted with password-derived key (salt+nonce+ciphertext+tag format)
- **Key Generation**: Uses `OsRng` for cryptographic randomness
- **Key Lifetime**: Not explicitly managed in API layer
- **Assessment**: **Good** - Keys properly protected at rest

### Random Number Generation

| Usage | Source | Assessment |
|-------|--------|------------|
| Keypair generation | `OsRng` | **Secure** |
| Nonce space in PoW | `rand::random()` | **Secure** - Uses `thread_rng` |
| Challenge uniqueness | `rand::thread_rng().fill_bytes()` | **Secure** |

### Nonce Handling

- PoW nonces: Random 8-byte nonce_space ensures challenge uniqueness
- Timestamp checks: 10-minute validity window prevents replay
- **Assessment**: **Good** - Proper nonce handling with replay protection

## Attack Surface

### External Inputs

| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| Content body | User | Size limits (10KB text, 500KB image) | Low |
| Image dimensions | User | Max 2048px | Low |
| Content format | User | Enum validation, video blocked | Low |
| PoW nonce | Computed | Argon2id verification | Low |
| Identity | Storage/User | Encrypted, magic bytes checked | Low |
| Space ID | User | 32-byte hash, no validation | Medium |
| Parent ID | User | 32-byte hash, existence not checked | Medium |

### Trust Boundaries

1. **User ↔ ApiClient**: Partially trusted - PoW required for writes
2. **ApiClient ↔ Storage**: Trusted - Same process
3. **ApiClient ↔ PoolManager**: Trusted - Same process
4. **Subscriber ↔ SubscriptionManager**: Untrusted - No authentication

### Privileged Operations

| Operation | Auth Required | PoW Required | Notes |
|-----------|---------------|--------------|-------|
| get_content | No | No | Read-only |
| get_sync_status | No | No | Read-only |
| create_post | Identity | Yes | Writes to storage |
| create_reply | Identity | Yes | Writes to storage |
| set_identity | No | No | Local config only |
| subscribe | No | No | Events are public |
| emit_event | No | No | Internal use only |

## Recommendations

### Priority 1 (Critical)

1. **Re-enable Anti-Abuse Module**
   - Update `AntiAbuseHandler` APIs for current architecture
   - Enable rate limiting, blocklist checks, and reputation tracking
   - Wire into `CommandHandler` pre-write flow

2. **Implement Query Timeouts**
   ```rust
   // In QueryHandler::get_content
   tokio::time::timeout(
       Duration::from_millis(self.config.query_timeout_ms),
       async { /* query logic */ }
   ).await?
   ```

### Priority 2 (High)

3. **Fix RwLock Unwrap Panics**
   ```rust
   // Replace:
   let tracker = self.rate_limit_tracker.read().unwrap();
   // With:
   let tracker = self.rate_limit_tracker.read()
       .map_err(|e| AntiAbuseError::Internal(e.to_string()))?;
   ```

4. **Add PoW Anti-Stockpile Verification**
   - Verify challenge timestamp is within validity window
   - Reject pre-computed PoW that's too old

### Priority 3 (Medium)

5. **Implement Proper PoW Cancellation**
   - Modify `compute_pow_with_callback` to check return value
   - Add cancellation token support

6. **Add Event Subscriber Authentication**
   - Consider requiring identity for subscriptions
   - Implement per-subscriber rate limits

### Priority 4 (Low)

7. **Wire Sync Status to Real Data**
   - Connect `get_sync_status()` to actual sync manager
   - Remove placeholder response

8. **Add Audit Logging**
   - Log security-relevant events (auth attempts, rate limit hits)
   - Ensure no secret material is logged

## Security Best Practices Check

- [x] No hardcoded secrets
- [x] Ed25519 signatures use constant-time comparison (via ed25519_dalek)
- [x] Secure defaults for PoW difficulty
- [ ] **FAIL**: Rate limiting not active (anti-abuse disabled)
- [ ] **FAIL**: Query timeouts not enforced
- [x] Private keys encrypted at rest
- [x] Cryptographic randomness from OS
- [x] Timestamp tolerance checks for replay prevention
- [ ] **PARTIAL**: Error messages may leak internal state details
- [x] No SQL/command injection vectors identified

## Conclusion

The API Layer has **solid cryptographic foundations** but **critical operational security gaps**. The disabled anti-abuse module and unenforced timeouts create significant DoS and spam attack vectors. The cryptographic implementations are correct and follow industry best practices, with Ed25519 signatures, Argon2id PoW, and proper key protection.

**Immediate action required**: Re-enable the anti-abuse module to protect against rate-limit and spam attacks. This is the single most impactful security improvement that can be made to the API Layer.

---

*Security Review completed: 2026-01-12*
*Reviewer: AI Security Analyst*
*Scope: src/api/, src/content/content_format.rs, src/crypto/, src/identity/*
