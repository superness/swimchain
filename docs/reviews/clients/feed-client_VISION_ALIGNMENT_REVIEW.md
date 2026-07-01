# Vision & Spec Alignment Review: Feed Client

## Summary

The Feed Client demonstrates **strong alignment** with Swimchain's decentralized vision through its local-first architecture, client-side cryptography via WASM, and PoW-validated identity creation. The implementation correctly places user control at the center - preferences are per-user, identity is keypair-based with no recovery mechanism, and all data aggregation happens client-side. However, there are **significant spec deviations**: the PoW implementation uses SHA-256 instead of the specified Argon2id (SPEC_03), key storage lacks encryption (SPEC_01 §7.2), and engagement pool support (SPEC_03 §7) is entirely missing. The decay visualization also doesn't fully match CLIENT_DESIGN.md patterns.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 24 | 30 | Strong decentralization; unencrypted keys, RPC dependency |
| Spec Compliance | 17 | 25 | SHA-256 vs Argon2id, missing engagement pools, key encryption |
| Architectural Fit | 21 | 25 | Good patterns; missing pool infrastructure |
| Future Compatibility | 16 | 20 | Extensible but migration paths unclear |
| **Total** | **78** | **100** | **Grade: C+** |

## Vision Alignment Assessment

### Supports Vision

**Decentralization (Excellent)**
- All feed aggregation happens client-side - no central server decides what users see
- Preferences stored locally per-user (`feed_prefs_{publicKey}`) - no platform database of user preferences
- Multi-endpoint fallback architecture (parent frame → env var → Tauri → local node) supports running against any Swimchain node
- No account system - identity IS the keypair, exactly as the vision specifies

**User Empowerment (Strong)**
- Users control their own keypairs via WASM generation
- Follow/mute preferences are entirely client-controlled
- Saved posts stored locally - bookmarks aren't shared with the network
- PoW mining happens in-browser, no trusted third party
- Clear display of content decay states empowers users to engage with content they want to preserve

**Organic Moderation Support (Good)**
- Decay indicators show content lifecycle visually (Green/Blue/Yellow/Red)
- Mute functionality is client-side only - doesn't affect other users
- Follow system aggregates from spaces rather than relying on algorithmic curation
- No central blocklist - users curate their own feeds

**PoW Spam Resistance (Partial)**
- Identity creation requires mining PoW proof
- Mining difficulty configurable (currently 20 bits per SPEC_01 §4.6)
- Progress display shows attempts, hash rate, elapsed time
- Cancel mechanism allows user control
- **Gap**: Uses SHA-256 instead of Argon2id (SPEC_03 §4.1)
- **Gap**: Action PoW (posts, replies) not implemented - placeholder routes

### Vision Concerns

**Single RPC Endpoint Dependency (Minor)**
- While architecture supports multiple endpoints, active connection is to a single node
- If that node is compromised or censored, user loses access
- **Recommendation**: Add multi-node fallback with automatic failover
- **Severity**: Low - desktop app can configure different endpoints

**No Content Signature Verification (Moderate)**
- Content fetched from RPC is displayed without verifying author signatures
- Malicious node could serve tampered content
- **Recommendation**: Verify content signatures client-side before display
- **Severity**: Medium - undermines "don't trust, verify" principle

**Centralized Media Handling (Minor)**
- Media fetched via `getMedia` RPC without hash verification shown
- Should verify media hash matches content reference
- **Recommendation**: Add SHA-256 verification of fetched media blobs

**No P2P Fallback (Low)**
- If RPC unavailable, client cannot function
- Vision includes P2P networking but client doesn't utilize gossip directly
- **Recommendation**: Future consideration for WebRTC peer discovery
- **Severity**: Low - acceptable for initial implementation

**Unencrypted Private Key Storage (High)**
- SPEC_01 §7.2 states: "Clients SHOULD encrypt stored keys at rest"
- Current implementation stores seed unencrypted in localStorage
- Key compromise = permanent identity loss with no recovery
- **Recommendation**: Implement Argon2id KDF + ChaCha20-Poly1305 encryption
- **Severity**: High - violates security best practice from spec

**Missing Fork Indicator (Medium)**
- CLIENT_DESIGN.md §2.7 specifies fork indicator UI
- Users cannot see which fork they're connected to
- Vision emphasizes fork-friendly architecture
- **Recommendation**: Add fork name/context to status bar

## Spec Deviations

| Spec | Expected | Actual | Severity |
|------|----------|--------|----------|
| SPEC_03 §4.1 | Argon2id for action PoW (64 MiB, t=3, p=4) | SHA-256 for identity PoW | **High** |
| SPEC_01 §7.2 | Keys encrypted at rest (Argon2id KDF + ChaCha20-Poly1305) | Unencrypted localStorage | **High** |
| SPEC_03 §7 | Engagement pools with pooled PoW (60s total) | Not implemented | **High** |
| SPEC_03 §6.4 | Action PoW: POST ~30s, REPLY ~15s, ENGAGE pooled | Posts/replies are placeholders | **High** |
| CLIENT_DESIGN §2.1 | Decay states: Full Heat/Warm/Cooling/Fading | Shows: Protected/Active/Stale/Decayed | Medium |
| CLIENT_DESIGN §2.2 | Engagement pool progress UI | No pool visualization | Medium |
| CLIENT_DESIGN §2.7 | Fork indicator with name/genesis | Not implemented | Medium |
| Content verification | Verify signatures client-side | Trust RPC responses | Medium |
| Address format | bech32m `cs1...` | Correct implementation | None |
| Auth headers | `X-CS-Identity`, `X-CS-Timestamp`, `X-CS-Signature` | Implemented correctly | None |
| Network ports | 9736/19736/29736 | Correctly mapped | None |
| PoW difficulty | 20 bits for identity (SPEC_01 §12.1) | Correct at 20 bits | None |

### Detailed Deviation Analysis

**1. PoW Algorithm Mismatch (SPEC_03 vs Implementation)**

SPEC_03 §4.1 specifies Argon2id for all action PoW:
```
Algorithm: Argon2id (RFC 9106)
Memory: 64 MiB (65536 KiB)
Iterations: 3
Parallelism: 4
Hash length: 32 bytes
```

Feed Client's `usePow.ts` uses:
```typescript
// SHA-256 based PoW for identity creation
const hash = await sha256(publicKey || timestamp || nonce);
// Checks leading zeros against difficulty
```

**Impact**: SHA-256 is not memory-hard, reducing ASIC resistance that SPEC_03 was designed to provide. However, SPEC_01 §4.6 does specify SHA-256 specifically for identity creation PoW - this is an inter-spec inconsistency between SPEC_01 and SPEC_03.

**2. Missing Engagement Pool Support (SPEC_03 §7)**

SPEC_03 §7 defines mandatory pooled engagement:
- Pool total: 60 seconds PoW
- Multiple contributors allowed
- Pool completion triggers decay reset
- Incomplete pools lose contributed work

Feed Client shows reaction buttons in `FeedCard.tsx` but:
- No pool progress visualization per CLIENT_DESIGN §2.2
- No contribution mechanism
- Buttons are non-functional placeholders

**3. Decay State Vocabulary Mismatch**

CLIENT_DESIGN.md §2.1 specifies:
```
FULL HEAT (100%) → WARM (60%) → COOLING (20%) → FADING (5%) → DECAYED
```

Feed Client uses (per client doc):
```
Protected (Green) → Active (Blue) → Stale (Yellow) → Decayed (Red)
```

Missing "Cooling" and "Fading" intermediate states. "Stale" not in CLIENT_DESIGN vocabulary.

### Unverified Specs (Need Protocol Doc Review)

- Feed aggregation limits (50 items per space?) - not specified
- Maximum followed spaces limit - no enforcement
- Cache TTL values (5min/30min) - may differ from protocol recommendations

## Architectural Observations

### Fits Well

**Layer Separation (Excellent)**
- Clear provider hierarchy: WASM → RPC → Identity → Router
- Hooks layer cleanly separates data fetching from UI
- Components receive data via props, not direct RPC calls
- Follows React best practices for the decentralized context

**State Management (Good)**
- Context providers for cross-cutting concerns (WASM, RPC, Identity)
- Local state for component-specific data
- Preferences hook provides computed Sets for efficient lookups
- No unnecessary global state

**WASM Integration (Correct)**
- Cryptographic operations properly delegated to WASM
- Browser-based key generation maintains user sovereignty
- No key material leaves the client
- PoW mining uses WASM for performance

**Caching Architecture (Appropriate)**
- 3-tier cache (Memory → localStorage → IndexedDB) follows local-first principle
- Per-user preference keys prevent data leakage between identities
- TTL-based invalidation for network data
- Permanent storage for user-controlled data (preferences)

### Concerns

**Missing Engagement Pool Infrastructure**
- No data structures for tracking pool contributions
- No RPC integration for pool operations
- Would require significant additions to implement SPEC_03 §7
- **Impact**: Cannot support pooled engagement feature from spec
- **Recommendation**: Add `useEngagementPool` hook with pool tracking

**Missing Offline Support**
- No service worker for offline access
- Cached data exists but UI doesn't gracefully handle offline state
- **Impact**: Undermines local-first philosophy when network unavailable
- **Recommendation**: Add offline mode with stale data display

**No Export/Import of Preferences**
- User preferences trapped in single browser's localStorage
- Vision supports user data portability
- **Recommendation**: Add preference export/import as JSON

**No Argon2id WASM Bindings**
- Current WASM provides SHA-256 for PoW
- SPEC_03 requires Argon2id for action PoW (posts/replies)
- Would need additional WASM compilation
- **Recommendation**: Add argon2-wasm or similar binding

**Testing Coverage Unknown**
- Testing infrastructure mentioned but zero test coverage found
- Critical paths (PoW, identity creation) should have high coverage
- **Recommendation**: Establish minimum coverage requirements for crypto paths

## Future Compatibility

### Extensibility Assessment

**Well Positioned For:**
- Additional content types (threads, replies, media) - FeedItem type extensible
- New sort algorithms - sorting logic isolated in useFeed
- Additional spaces sources - fetchFeedItems pattern supports new endpoints
- Multi-identity support - per-user preference keys already isolated
- Desktop integration - Tauri hooks already present

**Neutral:**
- WebSocket live updates - would require new provider but architecture accommodates
- Rich text/markdown content - FeedCard would need updates
- Encryption for private spaces - encryption.ts already present

**Challenging Without Refactor:**
- P2P mode - RPC-centric design would need significant rework
- Multi-node aggregation - current design assumes single endpoint
- Cross-device sync of preferences - localStorage-based design

### Breaking Change Risks

| Area | Risk Level | Notes |
|------|------------|-------|
| Identity format change | High | Would invalidate all stored identities |
| RPC protocol changes | Medium | SwimchainRpc class isolates, but methods hardcoded |
| Content type evolution | Low | FeedItem type uses flexible structure |
| Preference schema change | Low | Simple JSON, could version |

### Migration Considerations

**Not Addressed:**
- No versioning in stored preference format
- No migration path for identity format changes
- Cache schema changes would lose data silently

**Recommendations:**
1. Add schema version to stored preferences
2. Implement preference migration logic
3. Add identity format version detection
4. Document breaking change protocol for client updates

## Recommendations

### P0: Critical (Vision/Security)

1. **Encrypt Private Key at Rest** (SPEC_01 §7.2)
   - Current: `localStorage["swimchain-identity"] = { seed: "unencrypted..." }`
   - Target: Argon2id KDF (t=3, m=64MB, p=1) + ChaCha20-Poly1305 encryption
   - Reference: Rust implementation in `src/identity/` does this correctly
   - Migration: Prompt user for passphrase on first load of existing identity

2. **Implement Action PoW for Posts/Replies** (SPEC_03 §6.4)
   - Posts currently navigate to placeholder route
   - Must require ~30s PoW (POST) or ~15s PoW (REPLY) before submission
   - Add WASM Argon2id bindings for spec-compliant action PoW
   - Show mining progress per CLIENT_DESIGN §2.3

3. **Add Engagement Pool Support** (SPEC_03 §7)
   - Implement pool visualization per CLIENT_DESIGN §2.2
   - Show: `████████░░░░ 45s / 60s • 12 contributors`
   - Wire reaction buttons to pool contributions
   - Handle pool expiration and incomplete pools

### P1: High (Spec Compliance)

4. **Implement content signature verification** - Before displaying content, verify the author signature matches the claimed author public key. Fundamental to "don't trust, verify".

5. **Fix decay state vocabulary** - Match CLIENT_DESIGN §2.1 terms:
   - Full Heat → Warm → Cooling → Fading → Decayed
   - Add intermediate states currently missing

6. **Add fork indicator** (CLIENT_DESIGN §2.7) - Show current fork name in status bar, enable fork awareness per vision.

7. **Add media hash verification** - Verify retrieved blob SHA-256 matches content reference before display.

### P2: Medium (Architectural)

8. **Align PoW algorithm** - Consider moving identity PoW from SHA-256 to Argon2id for consistency with SPEC_03. SPEC_01 §4.6 currently conflicts with SPEC_03 - recommend following SPEC_03 as authoritative.

9. **Add preference schema versioning** - Include `{ version: 1, ... }` wrapper for future migrations.

10. **Implement offline mode** - Display cached content with indicator. Queue actions for reconnection.

### P3: Low (Future-Proofing)

11. **Export identity functionality** - Users should backup encrypted identity for device portability.

12. **Add multi-node failover** - Store known nodes, attempt reconnection to alternates on failure.

13. **Create preference export/import** - JSON file with preferences, follows, and saved posts.

14. **Document upgrade paths** - Create UPGRADING.md for breaking changes to stored data.

## Vision Alignment Verdict

The Feed Client is **moderately aligned** with Swimchain's decentralized vision. It correctly implements:
- Keypair-based identity with no recovery (SPEC_01)
- Client-side feed curation
- Local-first data storage
- User-controlled preferences
- Bech32m address encoding (SPEC_01)

**Critical Gaps** that must be addressed:
1. **Unencrypted key storage** - Violates SPEC_01 §7.2 security recommendation
2. **Missing engagement pools** - Core SPEC_03 §7 feature not implemented
3. **No action PoW** - Posts/replies bypass PoW requirement (placeholder routes)
4. **SHA-256 vs Argon2id** - PoW algorithm doesn't match SPEC_03 §4.1

The architectural foundation is solid and extensible. With P0 recommendations addressed, the client would be fully spec-compliant and vision-aligned.

**Overall Assessment**: Functional prototype requiring significant spec compliance work before production use. Foundation is correct but implementation incomplete.

---

*Review conducted against:*
- SPEC_01_IDENTITY.md v1.0.0 (IMPLEMENTED)
- SPEC_02_CONTENT_DECAY.md v0.4.1 (IMPLEMENTED)
- SPEC_03_PROOF_OF_WORK.md v2.0.0 (DRAFT)
- CLIENT_DESIGN.md (Reference)
- feed-client_CLIENT_DOC.md

*Reviewer: Vision & Spec Alignment Expert*
*Date: 2026-01-12*
