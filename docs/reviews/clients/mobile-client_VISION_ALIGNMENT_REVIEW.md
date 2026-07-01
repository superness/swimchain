# Vision & Spec Alignment Review: Mobile Client (Tidal)

## Summary

The Mobile Client demonstrates **strong vision alignment** with Swimchain's decentralized philosophy, particularly through its innovative Tidal UX paradigm that visualizes content decay as a living ecosystem. However, significant **spec deviations** in identity management and authentication undermine the "identity is the keypair" principle, with unencrypted key storage and a hardcoded dev cookie representing critical centralization risks. The architectural fit is good for a React Native application, but the Tidal UX features remain unintegrated, limiting the vision's full expression.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 22 | 30 | Strong philosophy, but identity/auth issues |
| Spec Compliance | 15 | 25 | Signing stub, hardcoded credentials, incomplete PoW |
| Architectural Fit | 21 | 25 | Good RN patterns, Tidal not integrated |
| Future Compatibility | 16 | 20 | Extensible design, but some technical debt |
| **Total** | **74** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

#### 1. Decentralization Through Local-First Design
The client embraces decentralization by:
- **On-device PoW mining**: All Argon2id computation happens locally (`useMobilePow`), ensuring no central mining authority
- **Local identity generation**: Ed25519 keypairs generated on-device, not server-provisioned
- **Offline queue**: Actions can be composed offline and submitted later, supporting disconnected operation
- **P2P-ready architecture**: RPC client designed for multiple node connections

#### 2. Organic Content Moderation Philosophy
The Tidal UX components brilliantly embody the organic moderation vision:
- **BreathIndicator**: Visualizes content survival probability as living "breath" states (strong → gasping → final)
- **TendGesture**: "Hold to tend" gestures make engagement contribution feel like nurturing rather than clicking
- **DepthFeed**: Organizes content by age/survival ("surface" → "archive") rather than algorithmic ranking
- **RescueMission**: Collaborative rescue embodies community-driven content preservation with the philosophy note: *"Not all content needs saving. Choose what's worth your effort."*

#### 3. User Empowerment
- **Battery-conscious PoW**: Estimates show users battery impact (~8% per post), respecting mobile constraints
- **Tiered storage profiles**: Users control local storage allocation (1GB/5GB/10GB)
- **Network-aware sync**: Users choose WiFi-only full sync vs cellular budget
- **Cancellable mining**: Users can abort PoW operations mid-process

#### 4. Privacy Through Encryption
- Identity stored locally with no server-side backup required (by design)
- Address display with copy functionality supports self-sovereign identity sharing

### Vision Concerns

#### CRITICAL: Identity IS NOT the Keypair (Current Implementation)

**Issue**: The "identity is the keypair" principle is violated by:

1. **Unencrypted key storage** (`useStoredIdentity.ts:50-57`):
```typescript
await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(newIdentity));
// Seed stored as plaintext hex string!
```
The private key seed is stored unencrypted in AsyncStorage, accessible to any app with root access.

2. **Signing is a stub** (`useKeypair.ts:76-79`):
```typescript
sign: (_message: Uint8Array): Uint8Array => {
  console.warn('Signing not implemented - using stub');
  return new Uint8Array(64); // Returns zeros!
}
```
Content is not actually cryptographically signed, breaking the identity verification chain.

**Impact**: Users cannot prove ownership of their identity. The "no account recovery" principle becomes "no account security."

#### HIGH: Centralization Through Hardcoded Authentication

**Issue** (`SwimchainRpc.ts:105`):
```typescript
private devCookie: string | null = 'cdd2b0a77b6bd9a8d6f2b85ec73c2ba7724b4f3962cfbb2ed779362d078387d1';
```

This hardcoded cookie:
- Creates a single point of authentication control
- Bypasses the PoW-based Sybil resistance
- Allows any client with the cookie to submit without proper identity verification
- Contradicts "no central authority"

#### MEDIUM: HTTP-Only RPC Transport

**Issue** (`SwimchainRpc.ts:17-25`):
```typescript
protocol: 'http', // Not https
```

All RPC communication is unencrypted, allowing:
- MITM interception of content submissions
- Credential (cookie) theft
- Content tampering

#### LOW: Tidal UX Not Integrated

The most vision-aligned features (BreathIndicator, TendGesture, DepthFeed, RescueMission, StewardshipProfile) are fully implemented but **not integrated** into the main navigation flow. Users experience a standard social app rather than the intended "tending a garden" metaphor.

---

## Spec Deviations

| Spec | Expected | Actual | Severity |
|------|----------|--------|----------|
| Ed25519 Signing | Valid 64-byte signatures | `new Uint8Array(64)` zeros | **CRITICAL** |
| Key Storage | Encrypted keychain | Plaintext AsyncStorage | **CRITICAL** |
| Authentication | PoW + signature | Hardcoded dev cookie | **HIGH** |
| Engagement PoW | Real Argon2id mining | 2-second simulated delay | **HIGH** |
| RPC Transport | HTTPS (production) | HTTP only | **MEDIUM** |
| POST_DIFFICULTY | 9 (~51s) | Correctly defined | Compliant |
| REPLY_DIFFICULTY | 8 (~26s) | Correctly defined | Compliant |
| ARGON2_MEMORY | 64 MiB | Correctly defined | Compliant |
| ARGON2_ITERATIONS | 3 | Correctly defined | Compliant |
| MAX_TITLE_LENGTH | 140 | Correctly validated | Compliant |
| MAX_BODY_LENGTH | 10000 | Correctly validated | Compliant |

### Protocol Constants Compliance

The `src/constants/protocol.ts` file correctly defines:
- Challenge expiry (600s)
- Mining parameters (64 MiB, 3 iterations)
- Difficulty levels (9/8/8 for post/reply/engage)
- Pool total seconds (60)
- Content length limits (140/10000)

However, **engagement contribution uses simulated delay** instead of actual PoW, bypassing the spam resistance mechanism for this action type.

---

## Architectural Observations

### Fits Well

1. **React Native patterns**: Proper use of hooks, context, FlatList virtualization
2. **Service layer separation**: `SwimchainRpc`, `NetworkMonitor`, `OfflineQueue`, `StorageManager` as singletons
3. **Reanimated animations**: Smooth 60fps animations using worklets
4. **Gesture handling**: Proper use of react-native-gesture-handler for TendGesture
5. **Theme system**: Centralized tokens for spacing, typography, colors
6. **Component composition**: Memoized list items, proper prop drilling patterns

### Concerns

1. **Singleton RPC without context**: `getRpcClient()` singleton bypasses React context, making testing difficult and causing multiple subscription issues
2. **Native module bridge incomplete**: `NativeArgon2` module referenced but signing still uses JS stub
3. **Tidal UX orphaned**: 5 complete components with no integration points in navigation
4. **Provider bloat**: `MobileSwimchainProvider` bundles identity, network, storage, queue, and PoW - should be split

### Layer Violations

| Component | Expected Layer | Actual | Issue |
|-----------|---------------|--------|-------|
| `SwimchainRpc` | Service | Service + Auth | Auth logic embedded in RPC client |
| `useKeypair` | Hook | Hook + Service | Directly calls `getRpcClient().setIdentity()` |
| `getRecentContent` | RPC | RPC | N+1 query pattern (calls listSpaces then listSpaceContent N times) |

---

## Future Compatibility

### Extensibility Assessment

**Positive**:
- Tidal UX components designed with callback interfaces for easy integration
- DepthFeed accepts generic `renderItem` for content type agnostic rendering
- Storage profiles easily extended with new tiers
- RPC methods properly typed with TypeScript interfaces

**Concerns**:
- No versioning in stored identity format (migration risk)
- Hardcoded endpoint configs instead of discovery protocol
- No message format versioning in RPC calls

### Breaking Change Risks

| Risk | Description | Migration Impact |
|------|-------------|------------------|
| Identity format change | `StoredIdentity` lacks version field | All users lose identity |
| Key encryption addition | Moving to keychain storage | Complex migration with passphrase |
| RPC protocol changes | No version negotiation | Hard breakage on server updates |
| Engagement PoW enablement | Simulated → real PoW | User expectations shift |

### Planned Feature Support

| Planned Feature | Current Support | Blockers |
|-----------------|-----------------|----------|
| Identity export | Placeholder | Signing implementation |
| Background mining | Button navigates away | iOS/Android restrictions |
| Real engagement PoW | Simulated | Signing + RPC integration |
| Settings persistence | UI only | AsyncStorage integration |
| Fork detection | Mock data | RPC method not called |

---

## Recommendations

### Priority 1: Security-Critical (Identity Crisis)

1. **Implement encrypted keychain storage**
   - Use `react-native-keychain` or `expo-secure-store`
   - Store seed encrypted with device biometric/PIN
   - Add passphrase option for export scenarios

2. **Implement actual Ed25519 signing**
   - Option A: Native module wrapping libsodium
   - Option B: Use existing `@swimchain/core` WASM bindings
   - Test signature verification round-trip with node

3. **Remove hardcoded dev cookie**
   - Delete `devCookie` property from source
   - Implement signature-based authentication
   - Add authentication negotiation flow

### Priority 2: Spec Compliance

4. **Enable real engagement PoW**
   - Connect `useMobilePow` to engagement contribution
   - Remove 2-second simulated delay
   - Add progress UI for engagement mining

5. **Add HTTPS support**
   - Make protocol configurable
   - Default to HTTPS for non-localhost
   - Certificate pinning for production

### Priority 3: Vision Expression

6. **Integrate Tidal UX into main flow**
   - Replace HeatBadge with BreathIndicator on ThreadCard
   - Add TendGesture to ThreadViewScreen as engagement option
   - Create DepthFeed variant of HomeScreen
   - Show RescueMission for `survival_probability < 0.1`
   - Add StewardshipProfile to Profile tab

7. **Add identity version field**
   ```typescript
   interface StoredIdentity {
     version: 1;
     address: string;
     publicKey: string;
     seed: string;
     createdAt: number;
   }
   ```

### Priority 4: Architectural Improvements

8. **Centralize RPC in context**
   - Create `RpcContext` provider
   - Single connection/subscription per app
   - Proper cleanup on unmount

9. **Split provider responsibilities**
   - `IdentityProvider`: address, keypair, signing
   - `NetworkProvider`: connection, sync mode
   - `StorageProvider`: profile, stats
   - `QueueProvider`: offline actions

---

## Vision Alignment Summary

The Mobile Client has **excellent conceptual alignment** with Swimchain's vision. The Tidal UX paradigm is a creative interpretation of organic moderation that could differentiate Swimchain in the mobile space. The "tending a garden" metaphor naturally expresses decentralized, community-driven content stewardship.

However, **implementation gaps** in identity management and authentication create a contradiction: the app philosophically supports "identity is the keypair" while technically storing keys insecurely and not using them for signing. This must be resolved before the client can claim true decentralization.

**Bottom Line**: The vision is right; the implementation needs security hardening and Tidal UX integration to fully express it.

---

*Review Date: 2026-01-12*
*Reviewer: Vision & Spec Alignment Expert*
*Client Version: React Native 0.73.2*
