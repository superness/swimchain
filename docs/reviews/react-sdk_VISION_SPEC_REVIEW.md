# Vision & Spec Alignment Review: React SDK

## Summary

The React SDK demonstrates **strong alignment** with Swimchain's core vision of decentralized, user-empowered social networking. It correctly implements key principles: identity IS the keypair, PoW for spam resistance, content decay for organic moderation, and client-side cryptography. However, there are notable spec deviations in PoW serialization format and some architectural decisions that could create future compatibility challenges.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 25 | 30 | Strong decentralization support; minor identity storage concerns |
| Spec Compliance | 20 | 25 | Mostly compliant; serialization format deviation |
| Architectural Fit | 22 | 25 | Follows established patterns; some layer bleed |
| Future Compatibility | 15 | 20 | Good extensibility; missing versioning in some areas |
| **Total** | **82** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

#### 1. Identity IS the Keypair (THESIS_01)
The SDK correctly implements identity as pure Ed25519 keypair:
- `useKeypair()` generates identity via WASM Keypair (`useIdentity.ts:37`)
- No account abstraction layer - public key IS the identity
- Bech32m address encoding for human readability (`useEncodeAddress`)
- Proper WASM memory management with `Keypair.free()` on unmount

#### 2. No Central Authority (VISION.md)
The SDK operates without requiring centralized services:
- Local key generation using CSPRNG (`crypto.getRandomValues`)
- P2P RPC communication - connects directly to nodes
- Signature authentication is cryptographic, not account-based
- Content can be verified offline (once synced)

#### 3. Proof-of-Work Friction (THESIS_02)
Correctly implements PoW as behavioral intervention:
- Action PoW using Argon2id per SPEC_03 (`action-pow.ts`)
- Difficulty tiers match spec: Space(22), Post(20), Reply(18), Engage(16)
- Memory-hard parameters (64MiB production) resist ASIC optimization
- Progress callbacks allow UI feedback during mandatory delay

#### 4. Content Decay (THESIS_06)
Implements organic moderation through decay:
- `useDecay()` provides real-time decay calculations (`useDecay.ts:48`)
- Uses `@swimchain/core` WASM for deterministic decay computation
- Supports `currentHeat`, `isProtected`, `isDecayed` states
- No server-side persistence bypass

#### 5. Privacy Through Encryption, Not Obscurity
Implements client-side encryption:
- Passphrase-based AES-256-GCM (`encryption.ts`)
- X25519 key exchange for private spaces (`x25519.ts`)
- PBKDF2 with 100K iterations for key derivation
- Encryption happens client-side before submission

### Vision Concerns

#### 1. Unencrypted Seed Storage **[HIGH CONCERN]**
```typescript
// useStoredIdentity.ts:124
localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(newIdentity));
```
The identity seed (private key) is stored unencrypted in localStorage. Per SPEC_01 Section 10.1:
> "Clients SHOULD encrypt stored keys at rest"

**Risk**: Any JavaScript running on the same origin can extract the private key. This undermines the "Identity IS the keypair" principle - if keys can be trivially stolen, identity integrity is compromised.

**Recommendation**: Encrypt seed with user-provided passphrase using same PBKDF2+AES-GCM pattern used for content encryption.

#### 2. Single RPC Connection
The SDK manages only one RPC connection per `RpcProvider`. While not violating vision directly, this creates centralization pressure - users tend to connect to the same nodes. Consider:
- Connection pooling to multiple nodes
- Node diversity recommendations in docs

#### 3. Missing Offline-First Architecture
Current implementation requires network connectivity for most operations. VISION.md states:
> "Verification without connectivity: Identity verification is purely cryptographic signature verification"

The SDK doesn't support:
- Queuing content for later submission
- Local content caching for offline read
- Optimistic UI with background sync

---

## Spec Deviations

| Spec | Expected | Actual | Severity |
|------|----------|--------|----------|
| SPEC_03: Challenge serialization | 75 bytes (big-endian timestamp at offset 65) | 82 bytes (includes 7 extra bytes) | Medium |
| SPEC_03: Wire format | Big-endian integers | Mixed endianness in some areas | Low |
| SPEC_01: Key storage | Encrypted at rest | Plaintext localStorage | High |
| SPEC_02: Decay half-life | 7 days (604800s) default | Delegated to WASM (correct) | None |
| SPEC_03: PoW memory | 64 MiB minimum (32 MiB floor) | 64 MiB production, 8 MiB testnet | None |
| SPEC_01: Timestamp tolerance | ±5min future, ±1h past | Client doesn't validate | Low |

### Detailed Deviation Analysis

#### Challenge Serialization (SPEC_03 Section 4.2)

**Spec requires** (75 bytes):
```
Offset  Size  Field
------  ----  -----
0       1     action_type (uint8)
1       32    content_hash (bytes32)
33      32    author_id (bytes32)
65      8     timestamp (uint64, big-endian)
73      1     difficulty (uint8)
74      8     nonce_space (bytes8)
```

**Implementation** (`action-pow.ts:174-192`):
```typescript
export function serializeChallenge(challenge: PoWChallenge): Uint8Array {
  const buffer = new Uint8Array(82); // 82 bytes, not 75
  // ...
}
```

The 7-byte discrepancy suggests either:
1. Different field ordering
2. Additional fields
3. Different integer sizes

**Impact**: Cross-client/node PoW verification may fail if Rust backend expects exact 75-byte format.

#### Client-Side Timestamp Validation

SPEC_01 Section 6.2 states:
> "Signature timestamp MUST NOT be more than 3600 seconds (1 hour) in the past"
> "Signature timestamp MUST NOT be more than 300 seconds (5 minutes) in the future"

The SDK creates timestamps but doesn't validate received timestamps against these bounds. While node-side validation provides protection, client-side validation would improve UX by catching issues early.

---

## Architectural Observations

### Fits Well

1. **Clean Layer Separation**
   - Hooks handle React state (`/hooks/`)
   - Libraries handle pure logic (`/lib/`)
   - WASM bindings via `@swimchain/core`
   - Clear provider hierarchy (Swimchain → RPC → Application)

2. **Correct Abstraction Level**
   - `SwimchainProvider` handles WASM initialization
   - `RpcProvider` handles connection lifecycle
   - Content hooks abstract RPC details from components
   - Encryption library is framework-agnostic

3. **Established React Patterns**
   - Context providers for global state
   - Custom hooks for reusable logic
   - Proper cleanup on unmount
   - Memoization where appropriate

4. **Consistent with Similar Features**
   - Identity management mirrors forum-client patterns
   - RPC structure matches other clients
   - Encryption API consistent across uses

### Concerns

1. **Layer Bleed: PoW Blocks UI**
The Action PoW implementation (`action-pow.ts:332`) runs synchronously on main thread:
```typescript
while (true) {
  // Argon2id computation - blocks for 10-60+ seconds
}
```

This violates the architectural principle that UI-blocking operations should run in workers. Identity PoW correctly uses Web Workers (`usePow.ts:73`), but action PoW doesn't.

2. **Mixed Crypto Libraries**
The SDK uses multiple crypto sources:
- `@noble/curves` for Ed25519/X25519
- `@noble/ciphers` for XChaCha20-Poly1305
- `hash-wasm` for Argon2id
- Native WebCrypto for AES-GCM
- `@swimchain/core` WASM for some crypto

While each is justified, this creates:
- Larger bundle size
- Multiple audit surfaces
- Potential subtle incompatibilities

3. **Polling Instead of Subscriptions**
Content hooks poll for missing content (`useContent.ts:591-637`):
```typescript
// Poll up to 15 times at 2s intervals
```

This works but doesn't scale well. Should integrate with planned WebSocket support.

---

## Future Compatibility

### Extensibility Assessment

**Good:**
- PoW difficulty/config are parameterized, not hardcoded
- Encryption versioning (`[ENCRYPTED:v1:`, `[PRIVATE:v1:`) allows format evolution
- Action types defined as enum, easily extensible
- RPC methods are modular - new endpoints easily added

**Concerning:**
- No version field in `StoredIdentity` - migration path unclear
- Challenge serialization doesn't include version byte
- Cache keys don't include version - could cause issues during upgrades
- No protocol negotiation in RPC client

### Breaking Change Risks

1. **Identity Format Change**
   - `StoredIdentity` has no version field
   - Changing seed format would orphan existing identities
   - **Mitigation**: Add `version` field, implement migration on load

2. **PoW Algorithm Change**
   - Argon2id parameters are configuration-based (good)
   - But no algorithm identifier in challenge
   - Future algorithm change would break verification
   - **Mitigation**: Include algorithm ID in serialized challenge

3. **Encryption Format Evolution**
   - Versioned format is good (`v1`)
   - But no upgrade path for encrypted content
   - Users would need to decrypt/re-encrypt on format change
   - **Mitigation**: Document migration procedures

4. **RPC API Changes**
   - No API version negotiation
   - Node upgrades could break clients
   - **Mitigation**: Add version handshake to connect()

### Planned Features Support

| Feature | Ready? | Notes |
|---------|--------|-------|
| WebSocket subscriptions | Partially | RPC structure supports it, needs implementation |
| Offline-first | No | Would require significant refactoring |
| React Native | No | Dependencies are web-only (IndexedDB, WebCrypto) |
| Multiple nodes | Partially | RpcProvider structure allows, needs pooling |
| SSR | No | Requires browser APIs |

---

## Recommendations

### Priority 1: Critical Vision Alignment

1. **Encrypt Identity Seed at Rest**
   - Implement passphrase-protected storage
   - Use existing PBKDF2+AES-GCM pattern
   - Prompt for passphrase on app start
   - Consider Web Crypto `extractable: false` keys

### Priority 2: Spec Compliance

2. **Fix Challenge Serialization**
   - Verify 75-byte format matches SPEC_03
   - Ensure big-endian integers
   - Add interoperability tests against Rust implementation

3. **Move Action PoW to Web Worker**
   - Follow Identity PoW pattern
   - Prevents UI blocking during 10-60s computation
   - Provides consistent UX

### Priority 3: Architectural Improvements

4. **Add Version Fields**
   - `StoredIdentity.version: number`
   - `PoWChallenge.algorithmId: number`
   - Cache key versioning

5. **Consolidate Crypto Dependencies**
   - Consider using `@swimchain/core` WASM for all crypto
   - Reduces audit surface
   - Ensures cross-client consistency

### Priority 4: Future-Proofing

6. **RPC Version Negotiation**
   - Add version handshake to `connect()`
   - Graceful degradation for older nodes
   - Feature detection for new capabilities

7. **Offline Queue Infrastructure**
   - Add content queue for later submission
   - IndexedDB persistence for queue
   - Background sync when reconnected

---

## Conclusion

The React SDK demonstrates strong vision alignment with Swimchain's core principles. The decentralized identity model, PoW-based spam resistance, and content decay implementation all correctly embody the thesis documents. The primary concerns are:

1. **Unencrypted seed storage** - directly contradicts spec recommendation and undermines identity security
2. **Challenge serialization deviation** - could cause interoperability issues
3. **Main-thread PoW** - architectural issue affecting UX

With these addressed, the SDK would be well-positioned as the canonical React integration for Swimchain applications.

---

*Review Date: 2026-01-12*
*Reviewer: Vision & Spec Alignment Expert*
*SDK Version: swimchain-react (unversioned)*
*Specs Referenced: SPEC_01 v1.0.0, SPEC_02 v0.4.1, SPEC_03 v2.0.0*
