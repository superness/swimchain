# Security Review: Mobile Client (Tidal)

## Summary
The Mobile Client has **CRITICAL security vulnerabilities** that must be addressed before production deployment. The most severe issues are: (1) private key seed stored in plaintext AsyncStorage, (2) hardcoded dev cookie credential in source code, and (3) stub signing implementation that returns zero bytes. The HTTP-only RPC communication and lack of certificate pinning further expose users to network-level attacks.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 5 | 25 | Stub signing, hardcoded credentials, no biometric |
| Crypto Correctness | 8 | 25 | Ed25519 planned but stub; iOS uses SHA256 in debug |
| Input Validation | 18 | 25 | Good length limits, React Native XSS-resistant |
| Data Protection | 4 | 25 | Plaintext key storage, HTTP-only transport |
| **Total** | **35** | **100** | **CRITICAL - Not Production Ready** |

## Threat Model
| Threat | Likelihood | Impact | Mitigation Status |
|--------|------------|--------|-------------------|
| Key Theft (device access) | High | Critical | NOT MITIGATED - AsyncStorage plaintext |
| Man-in-the-Middle | High | High | NOT MITIGATED - HTTP only, no pinning |
| Credential Exposure | High | Medium | NOT MITIGATED - Hardcoded dev cookie |
| Invalid Signatures | High | High | NOT MITIGATED - Stub returns zeros |
| PoW Bypass/Stockpile | Medium | Medium | PARTIAL - Uses native Argon2, but debug uses SHA256 |
| Replay Attacks | Medium | Medium | PARTIAL - Timestamp present but not validated |
| Session Hijacking | Medium | High | NOT MITIGATED - No session management |
| Malicious RPC Response | Medium | Medium | PARTIAL - Basic type validation only |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Private Key Stored in Plaintext**
   - **Location**: `src/hooks/useStoredIdentity.ts:50-52`
   - **Attack**: Any app with storage access or rooted device can read `@swimchain/identity` from AsyncStorage and extract the seed
   - **Impact**: Complete identity theft; attacker controls user's Swimchain identity forever
   - **Fix**: Use `react-native-keychain` or `expo-secure-store` with biometric protection
   - **CVSS**: 9.1 (Critical)
   ```typescript
   // VULNERABLE: Plaintext storage
   await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(newIdentity));
   // newIdentity contains { seed: "hex..." } - private key material!
   ```

2. **Hardcoded Dev Cookie in Source**
   - **Location**: `src/services/SwimchainRpc.ts:105`
   - **Attack**: Attacker extracts cookie from APK/IPA, gains authenticated access to testnet nodes
   - **Impact**: Unauthorized RPC access, impersonation, potential testnet manipulation
   - **Fix**: Remove hardcoded credential; use environment variables or runtime configuration
   - **CVSS**: 8.6 (High)
   ```typescript
   // CRITICAL: Hardcoded secret in source
   private devCookie: string | null = 'cdd2b0a77b6bd9a8d6f2b85ec73c2ba7724b4f3962cfbb2ed779362d078387d1';
   ```

3. **Signing Returns Zero Bytes**
   - **Location**: `src/hooks/useKeypair.ts:76-79`
   - **Attack**: All signatures are invalid (64 zero bytes); content can be trivially forged or rejected
   - **Impact**: All submitted content has invalid signatures; impersonation is trivial
   - **Fix**: Implement actual Ed25519 signing via `react-native-ed25519` or WASM binding
   - **CVSS**: 9.0 (Critical)
   ```typescript
   // CRITICAL: Stub implementation
   sign: (_message: Uint8Array): Uint8Array => {
     console.warn('Signing not implemented - using stub');
     return new Uint8Array(64); // ALL ZEROS - INVALID SIGNATURE
   },
   ```

4. **HTTP-Only RPC Communication**
   - **Location**: `src/services/SwimchainRpc.ts:14-18`
   - **Attack**: MITM can intercept/modify all RPC traffic including credentials and content
   - **Impact**: Cookie theft, content tampering, identity exposure
   - **Fix**: Enforce HTTPS; implement certificate pinning
   - **CVSS**: 7.5 (High)
   ```typescript
   // VULNERABLE: HTTP only
   export const DEFAULT_CONFIG: RpcConfig = {
     host: '10.0.2.2',
     port: 39736,
     protocol: 'http', // INSECURE
   };
   ```

### High

5. **Debug Mode Uses SHA256 Instead of Argon2**
   - **Location**: `ios/NativeArgon2.swift:188-217`
   - **Attack**: Debug builds have weaker PoW; if shipped to production, PoW is trivially solvable
   - **Impact**: PoW anti-spam protection completely bypassed
   - **Fix**: Ensure `#if DEBUG` code never ships; integrate actual Argon2Swift
   - **CVSS**: 7.2 (High)
   ```swift
   #if DEBUG
   // WEAK: Using SHA256 instead of Argon2id
   CC_SHA256(ptr.baseAddress, CC_LONG(hasher.count), &hash)
   #else
   fatalError("Production Argon2id not yet integrated")
   #endif
   ```

6. **No Identity Export Encryption**
   - **Location**: `src/screens/ProfileScreen.tsx:46-61`
   - **Attack**: When export is implemented without encryption, seed is exposed in plaintext
   - **Impact**: Identity theft via exported backup
   - **Fix**: Implement proper encrypted export with user-derived key (PBKDF2/Argon2)
   - **CVSS**: 6.8 (Medium-High)

### Medium

7. **Missing Signature Verification on RPC Responses**
   - **Location**: `src/services/SwimchainRpc.ts:145-172`
   - **Attack**: Malicious RPC server can return forged content/data
   - **Impact**: User sees/interacts with fake content
   - **Fix**: Verify content signatures client-side; verify node identity
   - **CVSS**: 5.5 (Medium)

8. **Simulated Engagement Bypasses PoW**
   - **Location**: Engagement contribution uses setTimeout instead of real PoW
   - **Attack**: If shipped, engagement pools can be manipulated without PoW cost
   - **Impact**: Spam engagement, unfair pool manipulation
   - **Fix**: Implement real PoW for engagement contributions
   - **CVSS**: 5.0 (Medium)

9. **Missing Rate Limiting on RPC Calls**
   - **Location**: `src/hooks/useRpc.ts` - all data hooks
   - **Attack**: Rapid reconnection/refresh could DoS local node or waste bandwidth
   - **Impact**: Resource exhaustion, battery drain
   - **Fix**: Add debouncing and exponential backoff
   - **CVSS**: 4.3 (Medium)

10. **Fixed Salt in PoW Hashing**
    - **Location**: `ios/NativeArgon2.swift:113`
    - **Attack**: Reduces Argon2 ASIC-resistance; enables rainbow table optimization
    - **Impact**: PoW mining optimization unfair advantage
    - **Fix**: Use dynamic salt derived from challenge
    - **CVSS**: 4.0 (Medium)
    ```swift
    let salt = Data(repeating: 0, count: 16) // Fixed salt - BAD
    ```

### Low

11. **No Certificate Pinning**
    - **Location**: Network configuration
    - **Attack**: CA compromise allows MITM even with HTTPS
    - **Impact**: Traffic interception with compromised CA
    - **Fix**: Implement certificate pinning for production RPC servers
    - **CVSS**: 3.5 (Low)

12. **Logging Sensitive Data**
    - **Location**: `src/services/SwimchainRpc.ts:146`
    - **Attack**: Method names logged; in production could leak patterns
    - **Impact**: Information disclosure
    - **Fix**: Disable or sanitize logging in production builds
    - **CVSS**: 2.5 (Low)
    ```typescript
    console.log('[RPC] Calling:', method);
    ```

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Signing (planned) | **NOT IMPLEMENTED** - stub returns zeros |
| Argon2id | PoW mining | **PARTIAL** - iOS debug uses SHA256 |
| SHA256 | iOS debug fallback | **INSECURE** for PoW (too fast) |

### Key Management
- **Generation**: Implied but not shown in reviewed code
- **Storage**: **CRITICAL** - Plaintext in AsyncStorage (`StoredIdentity.seed`)
- **Access Control**: None - any app/user can read
- **Backup**: Not implemented (placeholder only)

### Random Number Generation
- PoW nonce starts at 0 and increments sequentially (acceptable for mining)
- No cryptographic RNG usage observed for identity generation in reviewed code

### Nonce Handling
- PoW nonce: Sequential from 0 (acceptable for mining)
- Timestamp included in content but no anti-replay verification observed

## Attack Surface

### External Inputs
1. RPC responses from network (partially trusted)
2. User text input (title, body, search query)
3. Navigation route params (spaceId, replyTo, contentId)
4. Network state events (NetInfo API)

### Trust Boundaries
1. **Client ↔ RPC Node**: HTTP only, no verification
2. **Client ↔ AsyncStorage**: No encryption
3. **Client ↔ Native Module**: Trusted (same app)
4. **Client ↔ User**: Input validation present

### Privileged Operations
1. Identity seed storage/retrieval
2. Content signing (currently broken)
3. PoW computation
4. RPC authenticated calls (dev cookie)

## Recommendations

### P0 - Block Release (Fix Immediately)
1. **Implement encrypted keychain storage**
   - Use `react-native-keychain` with `ACCESSIBLE_WHEN_UNLOCKED_THIS_DEVICE_ONLY`
   - Add biometric authentication option for seed access
   - Estimate: 2-3 days

2. **Remove hardcoded dev cookie**
   - Move to environment variable or runtime configuration
   - Add build-time secret injection for CI/CD
   - Estimate: 0.5 day

3. **Implement actual Ed25519 signing**
   - Integrate `react-native-ed25519` or use WASM binding
   - Derive keypair from seed properly
   - Estimate: 2-3 days

4. **Enforce HTTPS for RPC**
   - Update default config to require HTTPS
   - Add certificate pinning for known production nodes
   - Estimate: 1 day

### P1 - Pre-Beta (Fix Before Beta)
5. **Fix production Argon2 on iOS**
   - Integrate Argon2Swift pod properly
   - Remove `#if DEBUG` fallback to SHA256
   - Estimate: 1-2 days

6. **Implement real engagement PoW**
   - Replace simulated 2-second delay with actual mining
   - Estimate: 1 day

7. **Add identity export encryption**
   - Use Argon2 KDF for passphrase-derived key
   - Encrypt seed with AES-GCM before export
   - Estimate: 2 days

### P2 - Pre-Launch (Fix Before GA)
8. **Add signature verification on content**
   - Verify received content signatures client-side
   - Alert users to unsigned/invalid content
   - Estimate: 2 days

9. **Implement rate limiting and retry logic**
   - Add exponential backoff for reconnection
   - Debounce refresh operations
   - Estimate: 1 day

10. **Use dynamic salt for PoW**
    - Derive salt from challenge bytes
    - Estimate: 0.5 day

## Security Best Practices Check
- [ ] **No hardcoded secrets** - FAIL (dev cookie in source)
- [ ] **Timing-safe comparisons** - N/A (no sensitive comparisons implemented)
- [ ] **Secure defaults** - FAIL (HTTP, plaintext storage)
- [ ] **Principle of least privilege** - PARTIAL (all-or-nothing key access)
- [ ] **Input validation** - PASS (length limits enforced)
- [ ] **Output encoding** - PASS (React Native handles)
- [ ] **Authentication enforced** - FAIL (broken signing)
- [ ] **Transport security** - FAIL (HTTP only)
- [ ] **Key material never logged** - UNCERTAIN (needs audit)
- [ ] **Error messages don't leak info** - PARTIAL (some raw errors exposed)

## Estimated Remediation Effort
- **P0 (Critical)**: ~7-8 dev days
- **P1 (High)**: ~4-5 dev days
- **P2 (Medium)**: ~3-4 dev days
- **Total**: ~15-17 dev days (~3-4 weeks)

## Conclusion
The Mobile Client is **NOT READY for production deployment** due to multiple critical security vulnerabilities. The plaintext key storage and broken signing implementation represent fundamental security failures that would expose all users to identity theft. These must be addressed before any external testing or release.
