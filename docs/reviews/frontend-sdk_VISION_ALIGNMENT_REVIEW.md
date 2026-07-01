# Vision & Spec Alignment Review: Frontend SDK

## Summary

The Frontend SDK demonstrates **strong alignment** with Swimchain's core vision of decentralization, user sovereignty, and proof-of-work based spam resistance. The SDK correctly implements client-side cryptography, keypair-as-identity, and dual PoW systems (SHA-256 identity + Argon2id action). However, there are minor spec deviations in challenge serialization format and some architectural concerns around SDK duplication across clients that could lead to drift from specification compliance.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 27 | 30 | Strong decentralization; minor concerns about localStorage centrality |
| Spec Compliance | 21 | 25 | Minor serialization deviations; correct algorithms |
| Architectural Fit | 20 | 25 | Good patterns; SDK duplication is concerning |
| Future Compatibility | 18 | 20 | Extensible; versioned encryption; migration paths exist |
| **Total** | **86** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

1. **Identity IS the Keypair** (SPEC_01 ID-H01, THESIS_01)
   - `useKeypair.ts` generates Ed25519 keypairs locally via WASM
   - `useStoredIdentity.ts` stores the seed (private key), not an account reference
   - No external identity provider - pure self-custody
   - Address encoding uses `cs1...` Bech32m format per SPEC_01 Section 3.3

2. **No Recovery by Design** (SPEC_01 ID-H02, THESIS_01)
   - No password reset, no recovery mechanism
   - Seed stored in localStorage - lose it, lose identity
   - This is correct per vision: "Losing your key is semantically equivalent to forgetting who you are"

3. **Proof-of-Work for Spam Resistance** (SPEC_03, THESIS_02)
   - Identity PoW: SHA-256 with configurable difficulty (default 16)
   - Action PoW: Argon2id with memory-hard parameters (8-64 MiB)
   - Both systems create mandatory friction per THESIS_02: "The delay IS the feature"
   - Difficulty scales by action type: SpaceCreation (22/12) > Post (20/10) > Reply (18/8) > Engage (16/6)

4. **Client-Side Cryptography** (VISION.md, SPEC_01)
   - All encryption/decryption happens in browser via Web Crypto API
   - PBKDF2 (100k iterations) for passphrase-based key derivation
   - AES-256-GCM for symmetric encryption
   - No server-side key escrow or encryption services

5. **Fork Portability** (SPEC_01 Section 9.3)
   - Keypairs work identically across any fork
   - No fork-specific identity bindings
   - Same Ed25519 signature verifies on any chain

6. **Privacy Through Encryption, Not Obscurity** (VISION.md)
   - Private space content encrypted with AES-256-GCM
   - Space key encryption for member-only access
   - Content is encrypted at rest and in transit

### Vision Concerns

1. **localStorage as Single Point of Failure** (Minor)
   - Identity storage in `localStorage['swimchain-identity']` is browser-local
   - This is philosophically correct (no cloud backup = no recovery)
   - However, could benefit from clear user warnings about backup importance
   - **Recommendation**: Add explicit "backup your seed" flow during identity creation

2. **No Multi-Device Support** (Acceptable)
   - Same identity cannot be used across devices without manual seed transfer
   - This is per vision (SPEC_01 Section 10.2 Challenge 4): "Private key must exist on each device"
   - Not a concern, but clients should make this clear to users

3. **Centralized Testnet Configuration** (Minor)
   - `getConfig(isTestnet)` and `getDifficulty(type, isTestnet)` have hardcoded values
   - These should ideally come from fork configuration per SPEC_03 Section 3.3
   - Current approach works for single-fork deployments but limits configurability

---

## Spec Deviations

| Spec Reference | Expected | Actual | Severity |
|---------------|----------|--------|----------|
| SPEC_03 §4.2 Challenge Size | 75 bytes | 82 bytes | Medium |
| SPEC_03 §4.2 Byte Order | Big-endian (explicit) | Big-endian (correct) | None |
| SPEC_03 §3.1 Action Type Values | CreateSpace=0x00, Post=0x01 | SpaceCreation=0x01, Post=0x02 | Medium |
| SPEC_01 §3.4 Identity PoW | `pow_hash = SHA-256(public_key \|\| timestamp_le \|\| nonce_le)` | Uses WASM `mine_identity_pow` | None (delegated) |
| SPEC_03 §6.4 Difficulties | SPACE_CREATION=22, POST=20, REPLY=18, ENGAGE=16 | Matches | None |
| SPEC_03 Testnet Difficulties | Not specified | 12, 10, 8, 6 (custom) | N/A |

### Detailed Analysis of Deviations

**1. Challenge Serialization (82 vs 75 bytes)**

SPEC_03 §4.2 defines a 75-byte canonical format:
```
Offset  Size  Field
0       1     action_type
1       32    content_hash
33      32    author_id
65      8     timestamp (big-endian)
73      1     difficulty
74      8     nonce_space [MISSING]
Total: 82 bytes per implementation
```

The SDK's `serializeChallenge()` at `action-pow.ts:105-120` produces 82 bytes, which includes all fields. The spec says 75 bytes but lists nonce_space as a field - this appears to be a spec error (75 + 8 = 83, not 82). The SDK's 82-byte format is likely correct.

**Recommendation**: Clarify SPEC_03 §4.2 - the math doesn't add up (1+32+32+8+1+8 = 82, not 75).

**2. ActionType Enumeration Values**

SPEC_03 §3.1 defines:
```rust
SPACE_CREATION = 0x01
POST = 0x02
REPLY = 0x03
ENGAGE = 0x04
IDENTITY_UPDATE = 0x05
```

SDK `action-pow.ts:16-22` defines:
```typescript
SpaceCreation = 0x01  // Matches
Post = 0x02           // Matches
Reply = 0x03          // Matches
Engage = 0x04         // Matches
IdentityUpdate = 0x05 // Matches
```

Wait - reviewing again, SPEC_03 shows `SPACE_CREATION = 0x01` but in the original enum block (§3.1) it shows `CREATE_SPACE = 0x00`. The spec has an internal inconsistency. The SDK follows the numbered table in §6.4 which uses values starting at 0x01.

**Verdict**: SDK matches SPEC_03 §6.4 difficulty table. Spec has internal inconsistency that should be resolved.

**3. Encryption Format Versioning**

The SDK uses versioned encryption prefixes:
- `[ENCRYPTED:v1:<base64>]` for passphrase encryption
- `[PRIVATE:v1:<base64>]` for space key encryption

This is **excellent practice** not explicitly required by spec, enabling future algorithm migration.

---

## Architectural Observations

### Fits Well

1. **Layered Architecture**
   - Providers (`SwimchainProvider`, `IdentityProvider`) handle initialization
   - Hooks (`usePow`, `useKeypair`, etc.) provide stateful logic
   - Library functions (`action-pow.ts`, `encryption.ts`) are pure utilities
   - Components (`WaveLoader`, `PowProgress`) are presentation-only

2. **WASM Integration Pattern**
   - `SwimchainProvider` handles async WASM initialization
   - `useSwimchain()` context provides loading state
   - Components can show fallback during WASM load
   - Correct use of `useMemo` for context value stability

3. **Separation of Concerns**
   - Identity PoW (SHA-256) handled by WASM
   - Action PoW (Argon2id) handled by pure TypeScript (`hash-wasm`)
   - Encryption uses Web Crypto API (no WASM dependency)
   - This separation prevents monolithic WASM bundles

4. **Error Handling Philosophy**
   - `decryptContent()` returns `null` on failure (no throw)
   - `usePow` has explicit error state
   - Components can handle failure gracefully

### Concerns

1. **SDK Duplication Across Clients** (High)
   - `forum-client/src/lib/action-pow.ts` duplicates `swimchain-frontend/src/lib/action-pow.ts`
   - `forum-client/src/hooks/useActionPow.ts` duplicates hook logic
   - Similarly for `feed-client`, `chat-client`
   - This creates drift risk - fixes in one location won't propagate

   **Risk**: A spec compliance fix in `swimchain-frontend` won't reach `forum-client` unless manually synchronized.

   **Recommendation**: Consolidate into single package; ensure all clients import from `@swimchain/frontend`.

2. **Two SDK Packages** (Medium)
   - `swimchain-frontend/` provides components + hooks
   - `swimchain-react/` provides RPC hooks + more utilities
   - Overlap in functionality creates confusion
   - Feature doc §14 acknowledges: "SDK consolidation: Merge overlapping functionality"

   **Recommendation**: Complete the planned consolidation before adding new features.

3. **Blocking PoW on Main Thread** (High)
   - `usePow.ts:68-80` calls `mine_identity_pow()` synchronously
   - `computePow()` in `action-pow.ts` runs in main thread
   - This blocks UI during mining (known limitation)
   - Per SPEC_03 §10.4: "Consider WebWorker offloading to prevent UI blocking"

   **Status**: Documented as "Future Work" - acceptable for MVP, critical for production.

---

## Future Compatibility

### Extensibility

1. **Versioned Encryption** (Excellent)
   - `[ENCRYPTED:v1:...]` format allows migration to `v2` without breaking existing content
   - Decryption can dispatch based on version prefix
   - New algorithms (e.g., XChaCha20-Poly1305) can be added as `v2`

2. **Configurable PoW Parameters**
   - `PoWConfig` interface allows custom `memoryKib`, `iterations`, `parallelism`
   - `TESTNET_CONFIG`, `PRODUCTION_CONFIG` presets
   - Easy to add new configurations for mobile, desktop, etc.

3. **Action Type Extensibility**
   - `ActionType` enum can be extended with new values
   - Serialization format has room for additional types (0x06-0xFF)

### Breaking Change Risks

1. **Challenge Serialization Changes**
   - Any change to `serializeChallenge()` format invalidates existing solutions
   - Must be handled as fork migration, not backward-compatible change
   - Current format should be locked as "v1"

2. **Encryption Format Changes**
   - Current PBKDF2+AES-GCM is hardcoded
   - New version would require `v2` prefix and detection logic
   - Migration path exists but not implemented

3. **localStorage Schema Changes**
   - `swimchain-identity` key stores JSON with specific fields
   - Adding fields requires migration logic
   - Consider adding schema version field: `{ schemaVersion: 1, ... }`

### Migration Paths

1. **Web Worker PoW Migration**
   - Current: Main thread blocking
   - Target: Web Worker with `postMessage` updates
   - Migration: Replace `computePow()` implementation; same API
   - No breaking changes to consumers

2. **IndexedDB Storage Migration**
   - Current: `localStorage` with JSON
   - Target: `IndexedDB` with structured data
   - Migration: Read from localStorage on first load, write to IndexedDB
   - Fall back to localStorage for legacy browsers

---

## Recommendations

### Critical (P0)

1. **Consolidate SDK Duplication**
   - Remove duplicate `action-pow.ts` from client applications
   - Update all clients to import from `@swimchain/frontend/lib`
   - Prevents spec compliance drift

### High (P1)

2. **Implement Web Worker PoW**
   - Move `computePow()` and WASM mining to dedicated Web Worker
   - Per SPEC_03 §10.4 requirement for responsive UI
   - Returns control of main thread during mining

3. **Add Schema Versioning to StoredIdentity**
   ```typescript
   interface StoredIdentity {
     schemaVersion: 1;  // Add this
     address: string;
     // ... rest
   }
   ```
   - Enables future migrations without data loss

### Medium (P2)

4. **Clarify Spec Inconsistencies**
   - SPEC_03 §4.2 states 75 bytes but fields sum to 82
   - ActionType enum in §3.1 vs §6.4 uses different naming
   - Document resolution in SDK implementation notes

5. **Add Device Memory Detection**
   - Use `navigator.deviceMemory` to auto-select PoW config
   - Prevents OOM on low-memory devices with 64 MiB Argon2id
   - Per SPEC_03 §10.2 mobile considerations

### Low (P3)

6. **Merge swimchain-frontend and swimchain-react**
   - Single `@swimchain/sdk` package
   - Clearer developer experience
   - Prevents feature duplication

7. **Add "Backup Your Seed" User Flow**
   - Explicit backup prompt during identity creation
   - Per SPEC_01 §10.2 Challenge 1: "Clients SHOULD implement robust backup encouragement"

---

## Alignment Summary

The Frontend SDK is **well-aligned** with Swimchain's decentralization vision:

| Vision Principle | SDK Alignment |
|-----------------|---------------|
| Identity = Keypair | Full compliance |
| No Recovery | Full compliance |
| PoW Friction | Full compliance (both systems) |
| Self-Custody | Full compliance |
| Fork Portability | Full compliance |
| Privacy via Encryption | Full compliance |
| Client-Side Crypto | Full compliance |
| Offline Verification | Full compliance (WASM) |

The primary concerns are operational (SDK duplication, main thread blocking) rather than philosophical. The SDK correctly embodies Swimchain's principles and should serve as the reference implementation for future clients.

---

*Review Date: 2026-01-12*
*Reviewer: Vision & Spec Alignment Expert*
*SDK Version: 0.1.0*
*Specs Referenced: SPEC_01 v1.0.0, SPEC_03 v2.0.0*
