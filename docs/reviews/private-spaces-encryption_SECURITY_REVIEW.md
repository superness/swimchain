# Security Review: Private Spaces Encryption

## Summary

The Private Spaces Encryption feature demonstrates **solid cryptographic foundations** (76/100) using industry-standard primitives (X25519, XSalsa20-Poly1305, AES-256-GCM). However, significant security gaps exist: missing signature verification on critical operations (`kick_member`, `accept_dm`, `request_dm`), unencrypted local key storage in IndexedDB, no validation of key_share length allowing potential DoS, and the complete lack of network broadcast for membership changes undermining security guarantees in distributed deployments.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 16 | 25 | Missing signature verification on kick/DM ops; good role checks |
| Crypto Correctness | 22 | 25 | Excellent primitives; missing key_share validation |
| Input Validation | 20 | 25 | Good hex parsing; missing size limits on encrypted_space_key |
| Data Protection | 18 | 25 | Space keys stored unencrypted in IndexedDB |
| **Total** | **76** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Kicked member retains old messages | High | Medium | Key rotation implemented but not broadcast |
| Malicious admin impersonation | Medium | High | No signature verification on `kick_member` |
| DM request spam/harassment | Medium | Medium | PoW required but no rate limiting wired |
| Local key theft (XSS/device access) | Medium | High | Keys stored unencrypted in IndexedDB |
| Key_share DoS (huge payload) | Low | Low | No size validation on key_share field |
| Membership desync across nodes | High | High | `broadcast: false` on all membership ops |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Vulnerability**: Missing signature verification on `kick_member`
   **Location**: `src/rpc/methods.rs:8761-8968`
   **Attack**: An attacker who knows the admin's public key can kick any member by submitting a `kick_member` request without proving they control the admin's private key. The handler checks role permissions but never verifies the signature parameter.
   **Impact**: Any network observer can kick members from private spaces if they know an admin's public key.
   **Fix**: Add `ed25519_verify()` check on the signature parameter before processing the kick.
   **CVSS**: 8.1 (High)

2. **Vulnerability**: No network broadcast for membership changes
   **Location**: `src/rpc/methods.rs:8965` (`broadcast: false`)
   **Attack**: In a multi-node deployment, kicking a member only removes them from one node. The kicked member can continue using other nodes, and the key rotation is not propagated.
   **Impact**: Kicked members retain access to the space on other nodes; key rotation is ineffective.
   **Fix**: Implement gossip/action broadcast for `Kick`, `KeyRotation`, `DMRequest`, `AcceptDM`, `DeclineDM` actions.
   **CVSS**: 7.5 (High)

### High

1. **Vulnerability**: Missing signature verification on `request_dm` and `accept_dm`
   **Location**: `src/rpc/methods.rs:7677-7876`
   **Attack**: Requests include `signature` and `timestamp` parameters but the handlers never verify them. An attacker could create DM requests impersonating any user.
   **Impact**: DM impersonation, unwanted DM spaces created under false pretenses.
   **Fix**: Verify signature against the constructed message (requester + recipient + timestamp).
   **CVSS**: 7.2 (High)

2. **Vulnerability**: Unencrypted space key storage in IndexedDB
   **Location**: `forum-client/src/hooks/usePrivateSpaceKeys.ts:140-147`
   **Attack**: Space keys are stored as hex strings in IndexedDB without encryption. XSS attacks or device access expose all private space keys.
   **Impact**: Complete compromise of all private space content the user has access to.
   **Fix**: Encrypt space keys with a key derived from the user's identity seed before storing.
   **CVSS**: 6.8 (Medium-High)

### Medium

1. **Vulnerability**: No validation of key_share length
   **Location**: `src/rpc/methods.rs:7720-7730`
   **Attack**: The `key_share` field accepts arbitrary-length hex data. Very large payloads could cause memory pressure or storage bloat.
   **Impact**: Resource exhaustion, storage DoS.
   **Fix**: Validate that `key_share` is exactly 32 bytes (X25519 public key size).
   **CVSS**: 5.3 (Medium)

2. **Vulnerability**: No size limit on encrypted_space_key field
   **Location**: `src/rpc/methods.rs:8344-8353`
   **Attack**: `encrypted_space_key` accepts arbitrary-length Vec<u8>. Expected size is 56 bytes (24 nonce + 32 ciphertext). Large payloads waste storage.
   **Impact**: Storage bloat, potential DoS.
   **Fix**: Validate `encrypted_space_key.len() == 56` (or reject if > 256 bytes as safety margin).
   **CVSS**: 4.3 (Medium)

3. **Vulnerability**: Silent failures in hex decoding during key rotation
   **Location**: `src/rpc/methods.rs:8926-8938`
   **Attack**: Invalid hex in `new_encrypted_keys` map entries are silently skipped (`continue`). An attacker could cause partial key rotation by mixing valid and invalid entries.
   **Impact**: Some members may not receive rotated keys, causing access issues.
   **Fix**: Return error if any key rotation entry fails to parse.
   **CVSS**: 4.0 (Medium)

### Low

1. **Vulnerability**: DM request rate limiting not wired
   **Location**: `src/rpc/methods.rs:7677` (infrastructure exists in `src/api/anti_abuse.rs` but unused)
   **Attack**: Spam DM requests to harassment targets.
   **Impact**: User harassment, storage consumption.
   **Fix**: Wire `RateLimitTracker` to `request_dm` handler.
   **CVSS**: 3.7 (Low)

2. **Vulnerability**: Console logging of decryption failures
   **Location**: `forum-client/src/lib/encryption.ts:148`, `:441`, `:606`
   **Attack**: Error objects logged to console may contain sensitive information visible to browser extensions.
   **Impact**: Minor information disclosure.
   **Fix**: Log generic messages without error details, or remove console logging in production.
   **CVSS**: 2.4 (Low)

## Cryptographic Assessment

### Algorithms Used

| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| X25519 | Key exchange for space key sharing | **Excellent** - Industry standard ECDH |
| XSalsa20-Poly1305 | NaCl box for encrypting space keys | **Excellent** - Authenticated encryption |
| AES-256-GCM | Content encryption with space keys | **Excellent** - AEAD cipher |
| SHA-256 | DM space ID generation, hashing | **Good** - Appropriate for non-security-critical hashing |
| SHA-512 | Ed25519-to-X25519 key derivation | **Good** - Follows libsodium convention |
| PBKDF2-SHA256 | Passphrase-based encryption (100k iterations) | **Good** - Adequate iterations for 2024+ |

### Key Management

| Aspect | Status | Notes |
|--------|--------|-------|
| Key generation | **Good** | Uses `crypto.getRandomValues()` / `randomBytes()` |
| Key derivation | **Good** | Follows libsodium Ed25519→X25519 conversion |
| Key rotation | **Partial** | Storage works; network broadcast missing |
| Key storage (server) | **Good** | Encrypted space keys only; plaintext keys never on server |
| Key storage (client) | **Weak** | Stored unencrypted in IndexedDB |
| Key backup/recovery | **Missing** | No documented recovery mechanism |

### Random Number Generation

- **Client**: Uses `crypto.getRandomValues()` and `@noble/hashes/utils.randomBytes()` - **Secure**
- **Server**: Rust's `rand` crate with OS entropy - **Secure**

### Nonce Handling

| Context | Implementation | Assessment |
|---------|----------------|------------|
| AES-GCM IV | 12-byte random per encryption | **Correct** |
| XSalsa20-Poly1305 nonce | 24-byte random per box | **Correct** |
| Nonce reuse prevention | Random generation; no counter | **Good** (statistically safe) |

## Attack Surface

### External Inputs

1. **RPC Parameters** (all private space methods):
   - `space_id`, `creator`, `inviter`, `invitee`, `admin`, `member`, `requester`, `recipient` - 32-byte hex public keys
   - `encrypted_space_key`, `key_share` - Arbitrary-length hex (needs bounds)
   - `pow_*` parameters - PoW validation exists
   - `signature`, `timestamp` - Verification partially missing

2. **Client-Side**:
   - Encrypted content from network (could be malformed base64)
   - Space keys from IndexedDB (could be tampered if XSS)
   - User passphrases for passphrase-based encryption

### Trust Boundaries

1. **Client ↔ Node RPC**: PoW validation, sponsorship checks (mostly good)
2. **Node ↔ Node Gossip**: Missing for private space operations
3. **Client ↔ IndexedDB**: No integrity protection

### Privileged Operations

| Operation | Protection | Gap |
|-----------|------------|-----|
| Create private space | PoW + Sponsorship | None |
| Invite to space | PoW + Membership check | None |
| Accept invite | Membership check | Signature not verified |
| Kick member | Role check (Admin/Mod) | Signature not verified |
| Request DM | PoW | No rate limit, signature not verified |
| Accept/Decline DM | Recipient check | Signature not verified |

## Recommendations

### Priority 1 - Critical (Fix Immediately)

1. **Add signature verification to `kick_member`, `request_dm`, `accept_dm`, `decline_dm`**
   - Create message from operation parameters
   - Verify Ed25519 signature against actor's public key
   - Reject if verification fails

2. **Implement network broadcast for membership operations**
   - Create Action types for `Invite`, `AcceptInvite`, `Kick`, `KeyRotation`, `DMRequest`, `AcceptDM`, `DeclineDM`
   - Use existing gossip infrastructure to propagate
   - Process incoming membership actions on all nodes

### Priority 2 - High (Fix Before Production)

3. **Encrypt space keys before storing in IndexedDB**
   - Derive encryption key from user's identity seed using HKDF
   - Encrypt with AES-256-GCM before storing
   - Decrypt on retrieval

4. **Validate key_share and encrypted_space_key sizes**
   - `key_share`: Must be exactly 32 bytes
   - `encrypted_space_key`: Must be 40-100 bytes (reasonable bound)
   - Return explicit errors for invalid sizes

### Priority 3 - Medium (Address Soon)

5. **Wire DM request rate limiting**
   - Use existing `RateLimitTracker` infrastructure
   - Limit to ~10 DM requests per hour per requester

6. **Add transaction semantics to accept_dm**
   - The operation creates space + adds 2 members
   - If any step fails, rollback all changes

7. **Fail loudly on key rotation parsing errors**
   - Return error if any `new_encrypted_keys` entry is malformed
   - Don't silently skip malformed entries

### Priority 4 - Low (Hardening)

8. **Remove console.error calls with error objects in production**
   - Log generic messages or use structured logging

9. **Document key recovery strategy**
   - Users need a way to recover space keys if they lose device
   - Consider encrypted backup mechanism

## Security Best Practices Check

- [x] No hardcoded secrets
- [x] Timing-safe comparisons (crypto library handles)
- [x] Secure defaults (AES-256, X25519, etc.)
- [x] Principle of least privilege (role-based access for kicks)
- [ ] **Signature verification on all authenticated operations** ❌
- [x] PoW anti-spam on public operations
- [ ] **Rate limiting on DM requests** ❌ (not wired)
- [ ] **Encrypted local key storage** ❌
- [x] No plaintext space keys in network messages
- [x] Random nonce generation (no reuse)
- [ ] **Input size validation** ❌ (partial)
- [ ] **Network broadcast for membership changes** ❌

---

**Review Date**: 2026-01-12
**Reviewer**: Security Reviewer (Claude Opus 4.5)
**Feature Version**: As documented in `private-spaces-encryption_FEATURE_DOC.md`
