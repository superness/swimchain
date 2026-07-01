# Vision & Spec Alignment Review: Chat-Client

> **Review Type**: Vision & Specification Compliance
> **Client**: @swimchain/chat-client
> **Version**: 0.1.0
> **Review Date**: 2026-01-12
> **Reviewer Role**: Vision & Spec Alignment Expert

---

## Summary

The Chat-Client demonstrates strong alignment with Swimchain's decentralization vision while maintaining familiar Discord-style UX. The client correctly implements identity-as-keypair, PoW-based spam resistance, and local-first architecture. However, there are notable spec deviations in PoW difficulty values and missing integration with pooled engagement mechanics. The client's mapping of Discord concepts to Swimchain structures is architecturally sound but obscures some protocol features that users should understand.

---

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong decentralization; minor concerns with localhost-only design |
| Spec Compliance | 18 | 25 | PoW difficulties deviate from spec; engagement pools not implemented |
| Architectural Fit | 23 | 25 | Excellent React patterns; good separation of concerns |
| Future Compatibility | 17 | 20 | WebSocket-ready; needs pooled engagement architecture |
| **Total** | **84** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

#### 1. Decentralization (Excellent)
- **No central server**: Client connects to local Swimchain node only, no cloud dependencies
- **Identity ownership**: Users control private keys entirely; stored in localStorage with seed phrase backup available
- **No account recovery**: Correctly implements "lose key = lose identity" philosophy per THESIS_01
- **Portable identity**: Same keypair works across any node/fork per SPEC_01

#### 2. User Empowerment (Strong)
- **Self-custody**: Users manage their own identity without platform intervention
- **Pseudonymity**: No real-name requirements; identity is public key per SPEC_01 Section 1.2.3
- **Exit capability**: Users can migrate to any node or fork with their identity intact
- **Transparency**: All actions are cryptographically signed and verifiable

#### 3. Organic Moderation (Good)
- **PoW spam prevention**: All messages require Argon2id proof-of-work per SPEC_03
- **No central moderators**: No admin roles or ban functionality at protocol level per SP-A07
- **Decay visualization**: HeatIndicator component shows content freshness/activity level
- **Natural lifecycle**: Content visibility tied to engagement, not algorithmic boost

#### 4. Active Navigation (Good)
- **No algorithmic feeds**: Server/channel navigation is explicit user choice per SP-A01
- **No trending/recommended**: Space discovery is user-driven per SPEC_04 Section 1.2.1
- **Direct navigation**: URL-based routing to specific spaces/channels

### Vision Concerns

| ID | Concern | Impact | Recommendation |
|----|---------|--------|----------------|
| VC-01 | **Localhost-only connection** | Limits deployment to users running local nodes | Add optional remote node connection with explicit user consent; warn about trust implications |
| VC-02 | **No offline support** | Requires always-online node; violates local-first principle | Implement offline message queue; sync when reconnected |
| VC-03 | **Reactions not wired** | Users cannot contribute to engagement pools | Complete reaction implementation per SPEC_03 Section 7 (pooled engagement) |
| VC-04 | **No E2E encryption** | Private spaces visible to node operators | Integrate private space encryption for DMs per documentation |
| VC-05 | **Discord terminology may mislead** | "Server" implies central control; Swimchain has no servers | Consider renaming to "Lane" or "Space" in UI to match protocol terminology |
| VC-06 | **No decay visibility for users** | Users may not understand why content disappears | Add explicit decay timers and engagement pool status per SPEC_02 |

### Vision Alignment Score Breakdown

| Principle | Score | Max | Justification |
|-----------|-------|-----|---------------|
| Identity IS keypair | 5 | 5 | Correct implementation |
| No recovery by design | 5 | 5 | Correctly refuses account recovery |
| Self-custody | 5 | 5 | Full user control of keys |
| PoW for all actions | 4 | 5 | Messages work; reactions incomplete |
| Active navigation | 4 | 5 | No algorithms; but discovery limited |
| Decentralization | 3 | 5 | Localhost-only limits deployment |
| **Total** | **26** | **30** | |

---

## Spec Deviations

### SPEC_01: Identity System

| Spec Requirement | Expected | Actual | Severity |
|------------------|----------|--------|----------|
| ID-H06: All posts signed | Ed25519 signature required | Implemented via `SignatureEnvelope` | Compliant |
| Identity address format | `cs1` prefix, bech32m | `sp1` for spaces, correct format | Compliant |
| V-SIG-03: Timestamp tolerance | Max 3600s past | Not explicitly validated client-side | Low |
| Display name + address | Always show address with display name | Address not prominently shown | Medium |

**Concern**: The client shows display names without prominently displaying the underlying identity address, which per SPEC_01 Section 3.5 should always be shown to prevent impersonation.

### SPEC_03: Proof of Work

| Spec Requirement | Expected | Actual | Severity |
|------------------|----------|--------|----------|
| Reply difficulty | 18 bits (~15s) | 10 bits (~15s, different calibration) | Medium |
| Reaction/Engage difficulty | 16 bits (~5-60s) | 8 bits (~1s) | High |
| Identity difficulty | 20 bits | 20 bits | Compliant |
| Memory parameter | 64 MiB | Implementation-dependent | Low |
| Pooled engagement | 60s total required | Not implemented | High |

**Critical Issue**: The client uses `MESSAGE_DIFFICULTY = 10` and `REACTION_DIFFICULTY = 8` (per CLIENT_DOC.md), but SPEC_03 Section 6.4 specifies REPLY = 18 bits and ENGAGE = 16 bits. This significant deviation means:
1. Messages are much faster to create than spec intends
2. Reactions provide minimal friction
3. Spam resistance is weaker than designed

**Pooled Engagement Missing**: SPEC_03 Section 7 defines pooled engagement where multiple users contribute PoW to meet a 60-second total requirement. The client has no UI for:
- Viewing pool status
- Contributing to existing pools
- Understanding sunk cost risk

### SPEC_04: Spaces

| Spec Requirement | Expected | Actual | Severity |
|------------------|----------|--------|----------|
| Space ID format | `sp1` + bech32m | Correctly implemented | Compliant |
| Space creation PoW | 24 bits (~2-30 min) | Not exposed in UI | Low |
| SP-H03: User-driven navigation | No algorithmic discovery | Correctly implemented | Compliant |
| Space parameters | Custom PoW, decay modifier | Not displayed/selectable | Medium |
| min_identity_age | Spaces can require identity age | Not enforced client-side | Medium |

**Concern**: Space parameters (`post_pow_difficulty`, `reply_pow_difficulty`, `min_identity_age`) are not displayed to users when browsing spaces. Users cannot see if a space requires established identities.

### SPEC_09: Social Layer

| Spec Requirement | Expected | Actual | Severity |
|------------------|----------|--------|----------|
| Contribution visibility | Show hosting metrics | No contribution display | Medium |
| Identity age visibility | Show age in UI | Not visible | Medium |
| Peer attestation | Show attestation count | Not implemented | Low |

**Concern**: The social layer is designed to make contribution visible, but the client shows no hosting metrics, identity age, or reputation indicators.

### Protocol Compliance Summary

| Protocol Area | Compliance | Critical Issues |
|---------------|------------|-----------------|
| Identity (SPEC_01) | 90% | Display name prominence |
| Proof of Work (SPEC_03) | 60% | Wrong difficulty values; no pooled engagement |
| Spaces (SPEC_04) | 85% | Parameter visibility |
| Social Layer (SPEC_09) | 40% | No contribution visibility |

---

## Architectural Observations

### Fits Well

1. **Provider hierarchy**: Clean separation matching Swimchain's layered architecture
   ```
   SwimchainProvider (WASM) → RpcProvider → IdentityProvider → UI
   ```

2. **Hook-based data flow**: Matches React best practices with proper encapsulation
   - `useRpc()`: RPC abstraction
   - `useActionPow()`: PoW state machine
   - `useOptimisticMessages()`: Pending/confirmed separation

3. **Signature authentication**: Correct implementation of X-CS-Identity, X-CS-Timestamp, X-CS-Signature headers per wire protocol

4. **Content addressing**: Uses `sha256:...` hash format for messages/channels as expected

5. **Decay awareness**: HeatIndicator component visualizes decay state, though could be more prominent

### Concerns

| ID | Concern | Architectural Impact |
|----|---------|---------------------|
| AF-01 | `useRpc.tsx` is 1272 lines | Violates single-responsibility; hard to maintain |
| AF-02 | Polling instead of WebSocket | Not a violation (WebSocket not in spec), but adds latency |
| AF-03 | No offline capability | Architectural gap for local-first principle |
| AF-04 | Identity stored unencrypted | SPEC_01 Section 10.1 recommends encrypting at rest |
| AF-05 | No contribution tracking | SPEC_09 requires tracking hosting contribution |

---

## Future Compatibility

### Extensibility Assessment

| Feature | Compatibility | Notes |
|---------|--------------|-------|
| WebSocket real-time | Ready | Polling layer can be swapped |
| Pooled engagement | Needs work | Requires pool UI and contribution flow |
| Private spaces (E2E) | Partially ready | Identity exists; need encryption layer |
| Multi-node | Limited | Currently hardcoded to localhost |
| Fork support | Ready | Same identity works cross-fork |
| Display name lookup | Missing | No profile fetching |
| Contribution badges | Missing | No SPEC_09 integration |

### Breaking Change Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PoW difficulty increase | High | Users expect current speeds | Add difficulty version negotiation |
| Pooled engagement requirement | High | Reactions currently don't use pools | Build pool infrastructure now |
| Identity format change | Low | Key format stable | Already using Ed25519 standard |
| Wire protocol changes | Medium | RPC methods may change | Abstract RPC layer (already done) |

### Migration Considerations

1. **Difficulty calibration**: Current difficulties are lower than spec. Migration to spec values will slow down messaging significantly - needs clear user communication.

2. **Engagement pools**: Adding pooled engagement changes the reaction UX fundamentally. Users must understand sunk cost risk.

3. **Contribution visibility**: Adding SPEC_09 social layer will require new UI real estate and user education.

---

## Recommendations

### Critical (Must Fix Before Release)

| Priority | Issue | Action |
|----------|-------|--------|
| 1 | PoW difficulties don't match spec | Align MESSAGE_DIFFICULTY=18, REACTION_DIFFICULTY=16, or document deviation as intentional |
| 2 | Reactions not wired to engagement pools | Implement SPEC_03 Section 7 pooled engagement |
| 3 | Identity address not prominent | Per SPEC_01 Section 3.5, always show address alongside display name |

### High Priority

| Priority | Issue | Action |
|----------|-------|--------|
| 4 | No pool status visibility | Add UI showing engagement pool state, contributions needed, time remaining |
| 5 | No identity age display | Show identity age per SPEC_09 to help users assess reputation |
| 6 | Space parameters hidden | Display space's PoW requirements and identity age requirements |

### Medium Priority

| Priority | Issue | Action |
|----------|-------|--------|
| 7 | Discord terminology | Consider using Swimchain terminology (Spaces, Lanes) to better reflect decentralized nature |
| 8 | No offline queue | Add pending message queue for when node disconnects |
| 9 | No contribution display | Add SPEC_09 hosting metrics visibility |
| 10 | Seed stored unencrypted | Encrypt seed with user password per SPEC_01 Section 10.1 |

### Low Priority (Future)

| Priority | Issue | Action |
|----------|-------|--------|
| 11 | Multi-node support | Add node discovery and selection |
| 12 | Private space encryption | Integrate E2E encryption for DMs |
| 13 | Decay timer display | Show explicit countdown to decay, not just heat |

---

## Conclusion

The Chat-Client is architecturally sound and demonstrates good understanding of Swimchain's vision. The mapping from Discord concepts to Swimchain structures is clever and will ease user adoption. However, significant spec deviations in PoW difficulty values and the complete absence of pooled engagement mechanics mean the client does not fully implement the spam resistance and organic moderation that Swimchain's design requires.

**Key Strengths:**
- Identity-as-keypair correctly implemented
- No central authority or moderation
- Clean React architecture with good separation
- Optimistic UI provides good UX

**Key Gaps:**
- PoW difficulties significantly lower than spec
- Pooled engagement (SPEC_03 Section 7) not implemented
- Social layer visibility (SPEC_09) missing
- Identity address not prominently displayed

**Recommendation**: Address the PoW difficulty alignment and pooled engagement implementation before public release. These are core to Swimchain's spam resistance model. The current implementation provides a weaker guarantee than the protocol design intends.

---

*Review conducted according to Swimchain Vision & Spec Alignment framework.*
*Specifications referenced: SPEC_01 (Identity), SPEC_03 (Proof of Work), SPEC_04 (Spaces), SPEC_09 (Social Layer)*
