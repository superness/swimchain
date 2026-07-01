# Security Review: Mobile Platform

## Summary

The Mobile Platform has **critical security vulnerabilities that prevent production deployment**. The Ed25519 signing implementation is a stub returning zero bytes (completely broken authentication), private key material is stored unencrypted in AsyncStorage, and a hardcoded dev cookie provides the only authentication mechanism. While the architecture demonstrates security awareness (signature-based auth design, PoW anti-spam), the implementation has fundamental gaps that would allow impersonation attacks, identity theft, and complete bypass of authentication.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 5 | 25 | Stub signing = no authentication; hardcoded dev cookie |
| Crypto Correctness | 8 | 25 | Argon2id params correct; Ed25519 not implemented; no encryption |
| Input Validation | 18 | 25 | Good content limits; no XSS sanitization documented |
| Data Protection | 6 | 25 | Private keys stored plaintext in AsyncStorage |
| **Total** | **37** | **100** | **CRITICAL - Not deployable** |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Identity impersonation | **Critical** | **Critical** | Stub signing returns zeros - any content can be forged. **NONE** |
| Private key theft via backup | High | Critical | Seed stored plaintext in AsyncStorage - readable via backup. **NONE** |
| Dev cookie exploitation | High | High | Hardcoded cookie in source code. **Remove before production** |
| Content spoofing | High | High | All signatures are zeros - server cannot verify. **NONE** |
| PoW challenge replay | Medium | Medium | Challenge has 10-min expiry. **Partially mitigated** |
| Challenge stockpiling | Low | Medium | Anti-stockpile per SPEC_03. **Mitigated server-side** |
| Local storage tampering | Medium | Low | AsyncStorage unprotected but low-value data. **Acceptable risk** |
| Network eavesdropping | Medium | Medium | HTTP default (dev only), signature auth designed. **Config-dependent** |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Ed25519 Signing Stub Returns Zero Bytes
**Vulnerability**: The signing function returns a 64-byte zero array instead of an actual signature.
**Location**: `mobile-client/src/hooks/useKeypair.ts:76-80`
```typescript
sign: (_message: Uint8Array): Uint8Array => {
  // Placeholder - actual signing would use native module
  console.warn('Signing not implemented - using stub');
  return new Uint8Array(64);
},
```
**Attack**: Any attacker can forge signatures by submitting zero bytes. All content submitted from mobile clients can be impersonated.
**Impact**: Complete authentication bypass. Any user can post as any other user. Total loss of non-repudiation.
**Fix**: Implement native Ed25519 signing module using react-native-libsodium or similar.
**CVSS**: 10.0 (Critical) - AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N

#### 2. Private Seed Stored Plaintext in AsyncStorage
**Vulnerability**: The user's Ed25519 seed (private key) is stored as plaintext hex in AsyncStorage.
**Location**: `mobile-client/src/hooks/useStoredIdentity.ts:52`
```typescript
await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(newIdentity));
// StoredIdentity.seed is plaintext hex
```
**Attack**: Device backup extraction, rooted device, or malicious app with storage access can steal the seed.
**Impact**: Complete identity theft. Attacker gains permanent control of user's identity.
**Fix**: Use react-native-keychain or Secure Enclave for seed storage with biometric protection.
**CVSS**: 8.4 (High) - AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N

#### 3. Hardcoded Dev Cookie in Production Code
**Vulnerability**: A hardcoded authentication cookie is present in the RPC client source.
**Location**: `mobile-client/src/services/SwimchainRpc.ts:105`
```typescript
private devCookie: string | null = 'cdd2b0a77b6bd9a8d6f2b85ec73c2ba7724b4f3962cfbb2ed779362d078387d1';
```
**Attack**: Anyone who reads the source code (or decompiles the app) has full RPC authentication.
**Impact**: Unauthorized access to any testnet node using this cookie.
**Fix**: Remove hardcoded cookie. Implement proper signature-based auth for production.
**CVSS**: 7.5 (High) - AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N

### High

#### 4. All Submitted Content Has Invalid Signatures
**Vulnerability**: Content submission uses the stub sign function, resulting in zero-byte signatures.
**Location**: `mobile-client/src/screens/ComposeScreen.tsx:102-103`
```typescript
const signature = keypair.sign(contentBytes);
const signatureHex = bytesToHex(signature);
// signature is always 64 zero bytes
```
**Attack**: Server should reject all submissions, but if signature verification is disabled/bypassed, content integrity is compromised.
**Impact**: Either all mobile submissions fail (denial of service) or all can be forged (if verification bypassed).
**Fix**: Dependent on Critical #1 fix.
**CVSS**: 7.5

#### 5. No TLS Certificate Pinning
**Vulnerability**: RPC client uses plain fetch() without certificate pinning.
**Location**: `mobile-client/src/services/SwimchainRpc.ts:148`
**Attack**: MITM attack can intercept/modify all RPC traffic.
**Impact**: Credential theft, content manipulation.
**Fix**: Implement certificate pinning for production nodes.
**CVSS**: 6.8

### Medium

#### 6. Content Not Sanitized Before Display
**Vulnerability**: User-provided content (title, body) displayed without XSS sanitization.
**Location**: `mobile-client/src/screens/ComposeScreen.tsx:187-208`
**Attack**: React Native is generally safe from XSS, but WebView usage or future changes could enable injection.
**Impact**: Potential script injection if architecture changes.
**Fix**: Add content sanitization layer for defense in depth.
**CVSS**: 4.3

#### 7. HTTP Protocol Default for Android Emulator
**Vulnerability**: Default RPC config uses unencrypted HTTP.
**Location**: `mobile-client/src/services/SwimchainRpc.ts:14-18`
```typescript
export const DEFAULT_CONFIG: RpcConfig = {
  host: '10.0.2.2',
  port: 39736,
  protocol: 'http',
};
```
**Attack**: Network eavesdropping on local/adjacent networks.
**Impact**: Credential/session theft on shared networks.
**Fix**: Default to HTTPS for production; HTTP only for explicit dev mode.
**CVSS**: 5.3

#### 8. Race Condition in OfflineQueue Load
**Vulnerability**: Non-atomic check-and-set on `loaded` flag allows duplicate loads.
**Location**: `mobile-client/src/services/OfflineQueue.ts:40-41`
```typescript
async load(): Promise<void> {
  if (this.loaded) return;
  // ... load operation
  this.loaded = true;
}
```
**Attack**: Concurrent calls during startup could result in duplicate queue processing.
**Impact**: Duplicate action submissions, potentially double-spending engagement.
**Fix**: Use proper mutex/lock pattern or move load to synchronous initialization.
**CVSS**: 4.0

### Low

#### 9. Nonce Conversion Potential Precision Loss
**Vulnerability**: PoW nonce parsed as integer may lose precision for large values.
**Location**: `mobile-client/src/screens/ComposeScreen.tsx:112`
```typescript
powNonce: parseInt(powSolution.nonce, 10),
```
**Attack**: Nonces exceeding Number.MAX_SAFE_INTEGER would be truncated.
**Impact**: Theoretical PoW invalidation for extremely high nonce values.
**Fix**: Use BigInt for nonce handling or ensure difficulty keeps nonces reasonable.
**CVSS**: 2.1

#### 10. Debug Logging of Signing Operations
**Vulnerability**: Console.warn on every sign attempt reveals security operation.
**Location**: `mobile-client/src/hooks/useKeypair.ts:78`
```typescript
console.warn('Signing not implemented - using stub');
```
**Attack**: Log analysis reveals signing patterns and stub usage.
**Impact**: Information disclosure; aids attack planning.
**Fix**: Remove or gate behind debug flag.
**CVSS**: 2.0

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Argon2id | PoW mining | **GOOD** - Correct params (64 MiB, 3 iter, p=2) |
| Ed25519 | Signing | **BROKEN** - Stub implementation only |
| Base64 | Data encoding | **OK** - Standard usage |
| Hex encoding | Key/signature serialization | **OK** - Consistent implementation |

### Key Management
- **Generation**: Not implemented in mobile client (expects pre-generated)
- **Storage**: **CRITICAL FAILURE** - Plaintext in AsyncStorage
- **Protection**: **NONE** - No encryption, no biometric lock, no secure enclave
- **Rotation**: Not implemented
- **Backup**: Mentioned in UI but implementation unclear

### Random Number Generation
- **PoW nonces**: Delegated to native module (not verified)
- **UUIDs**: Using uuid.v4() for queue IDs (acceptable for non-crypto use)
- **Challenge generation**: Server-side (out of scope)

### Nonce Handling
- **PoW nonces**: Start from 0, incremented by native miner
- **Challenge IDs**: Server-generated, 10-minute expiry
- **Anti-stockpile**: Server enforces per SPEC_03

## Attack Surface

### External Inputs
1. **RPC responses** - JSON parsed without schema validation
2. **Challenge data** - Hex-decoded and passed to native module
3. **User content** - Title/body from TextInput with length limits only
4. **Navigation params** - spaceId, replyTo from navigation state

### Trust Boundaries
1. **Mobile App <-> Node RPC** - Currently HTTP with dev cookie
2. **JavaScript <-> Native Module** - Base64 bridge for Argon2
3. **App <-> AsyncStorage** - Plaintext storage
4. **App <-> OS** - Clipboard, filesystem access potential

### Privileged Operations
1. **Identity creation/import** - Creates signing keypair
2. **Content signing** - Signs messages with private key (BROKEN)
3. **PoW mining** - Intensive computation (battery/thermal impact)
4. **RPC authentication** - Dev cookie or signature-based

## Recommendations

### P0 - Critical (Block Release)

1. **Implement Native Ed25519 Signing Module**
   - Integrate react-native-libsodium or similar
   - Replace stub in useKeypair.ts
   - Verify signatures match Swimchain format

2. **Secure Private Key Storage**
   - Move seed to react-native-keychain
   - Add biometric authentication for key access
   - Never store seed in AsyncStorage

3. **Remove Hardcoded Dev Cookie**
   - Delete line 105 from SwimchainRpc.ts
   - Implement signature-based RPC authentication
   - Add environment-based configuration

4. **Enable HTTPS by Default**
   - Change default protocol to 'https'
   - Add certificate pinning for production nodes

### P1 - High Priority

5. **Add RPC Response Validation**
   - Validate JSON-RPC response schema
   - Type-check critical fields before use
   - Handle malformed responses gracefully

6. **Implement Content Sanitization**
   - Sanitize user content on display
   - Prevent future XSS vectors
   - Consider markdown sanitizer

7. **Fix Race Condition in OfflineQueue**
   - Use mutex pattern for load()
   - Ensure atomic state transitions

### P2 - Medium Priority

8. **Add Security Event Logging**
   - Log authentication attempts
   - Log signing operations (without keys)
   - Enable security audit trail

9. **Implement Key Rotation**
   - Allow identity key rotation
   - Handle key migration gracefully

10. **Add Jailbreak/Root Detection**
    - Warn users on compromised devices
    - Consider restricting functionality

## Security Best Practices Check

- [ ] **No hardcoded secrets** - FAIL: Dev cookie hardcoded in source
- [ ] **Timing-safe comparisons** - N/A: No crypto comparisons in JS layer
- [ ] **Secure defaults** - FAIL: HTTP default, plaintext storage default
- [ ] **Principle of least privilege** - PARTIAL: Good service separation, but all have storage access
- [ ] **Defense in depth** - FAIL: Single points of failure in auth chain
- [ ] **Input validation** - PARTIAL: Length limits but no sanitization
- [ ] **Output encoding** - OK: React Native handles JSX encoding
- [ ] **Cryptographic agility** - PARTIAL: Config-based Argon2, but Ed25519 hardcoded
- [ ] **Secure key storage** - FAIL: Plaintext AsyncStorage
- [ ] **TLS everywhere** - FAIL: HTTP default
- [ ] **No sensitive data in logs** - FAIL: Sign warnings logged
- [ ] **Biometric protection** - NOT IMPLEMENTED

## Swimchain-Specific Security

| Requirement | Status | Notes |
|-------------|--------|-------|
| PoW validation (anti-stockpile) | Server-side | Mobile delegates to server |
| Signature verification on all actions | **BROKEN** | Stub returns zeros |
| Spam attestation thresholds | Server-side | Not mobile concern |
| Private space encryption | **NOT IMPLEMENTED** | No E2E encryption in mobile |
| Identity key protection | **BROKEN** | Plaintext storage |

## Conclusion

The Mobile Platform is **not safe for production use**. The three critical vulnerabilities (stub signing, plaintext key storage, hardcoded cookie) must be resolved before any real user data is processed. The architecture shows security-conscious design intentions (signature-based auth, PoW spam prevention), but implementation gaps render these protections ineffective.

**Recommended Action**: Halt any production deployment plans until P0 items are resolved and a security retest is completed.

---

*Review Date: 2026-01-12*
*Reviewer: Security Review Agent*
*Feature Version: Per mobile-platform_FEATURE_DOC.md*
