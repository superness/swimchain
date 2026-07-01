# Vision & Spec Alignment Review: Private Spaces Encryption

## Summary

The Private Spaces Encryption feature demonstrates **excellent conceptual alignment** with Swimchain's decentralized, privacy-first vision. The design correctly treats private spaces as an extension of the existing space system, uses identity keypairs for encryption, and implements deterministic DM space IDs that require no central coordination. However, **implementation gaps critically undermine the decentralization promise**: membership changes only propagate locally (`broadcast: false`), creating a fundamentally single-node feature that contradicts Swimchain's core vision. The cryptographic implementation follows specifications well, but the network layer integration remains incomplete.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 18 | 30 | Strong design; `broadcast: false` critically undermines decentralization |
| Spec Compliance | 20 | 25 | Crypto specs followed; Action types defined but not networked |
| Architectural Fit | 21 | 25 | Follows patterns well; RPC layer too heavy vs. Actions |
| Future Compatibility | 16 | 20 | Good extensibility; migration complexity for key rotation |
| **Total** | **75** | **100** | Solid foundation with critical P2P gap |

---

## Vision Alignment Assessment

### Supports Vision

1. **End-to-End Encryption (Strong)**
   - Content is encrypted client-side with AES-256-GCM before transmission
   - Space keys are never transmitted in plaintext
   - Nodes cannot read private content without membership
   - Aligns with "Privacy through encryption, not obscurity"

2. **Identity IS the Keypair (Strong)**
   - X25519 keys derived from Ed25519 identity seeds
   - No separate "encryption account" - your identity IS your encryption identity
   - Key derivation follows libsodium conventions
   - Aligns with core identity principle

3. **PoW for Spam Resistance (Partial)**
   - Private space creation requires PoW
   - Invites require PoW
   - DM requests require PoW (documented but rate limiting not wired)
   - Aligns with spam resistance philosophy

4. **User Empowerment (Strong)**
   - Users control who joins their spaces
   - Admin/Moderator/Member role hierarchy
   - Key rotation on kick protects future content
   - Deterministic DM IDs prevent platform manipulation

5. **Local-First (Strong)**
   - Space keys stored in IndexedDB
   - Encryption/decryption happens client-side
   - Works offline once keys are cached

### Vision Concerns

1. **Critical: Network Broadcast Disabled** (Breaks Decentralization)
   ```rust
   // src/rpc/methods.rs:7816
   broadcast: false, // Not broadcast yet - requires gossip implementation

   // src/rpc/methods.rs:8965
   broadcast: false, // TODO: Create and broadcast Kick + KeyRotation actions
   ```

   This means:
   - Private space membership only exists on ONE node
   - Users connecting to different nodes won't see the same membership
   - This is **fundamentally centralized** - contradicts core vision
   - Kick operations are ineffective across the network

   **Severity: CRITICAL** - This undermines the decentralization guarantee.

2. **Membership Metadata Visible On-Chain**
   - Design decision: "Membership Visibility: ON-CHAIN"
   - While content is encrypted, WHO is in which space is public
   - This is a deliberate trade-off for auditability
   - Some privacy-conscious users may object

   **Severity: LOW** - Documented trade-off, but could add optional membership encryption.

3. **No Forward Secrecy**
   - Static space keys mean compromised key = all historical content compromised
   - Key rotation only happens on kick, not proactively
   - Modern messaging standards (Signal Protocol) expect forward secrecy

   **Severity: MEDIUM** - Acceptable for MVP but should be roadmapped.

4. **DM Request Rate Limiting Not Wired**
   - From feature doc: "Rate limiting on DM requests (infrastructure exists but not wired)"
   - Without rate limiting, DM requests can be spammed
   - Undermines spam resistance vision

   **Severity: MEDIUM** - Infrastructure exists, just needs connection.

---

## Spec Compliance

### Spec Deviations

| Spec/Design | Expected | Actual | Severity |
|-------------|----------|--------|----------|
| Network broadcast | Actions broadcast to peers | `broadcast: false` for kick, DM ops | **CRITICAL** |
| Key rotation broadcast | Network propagates new keys | Storage-only, no gossip | **HIGH** |
| DM rate limiting | Limit pending requests per user | Not wired despite infrastructure | **MEDIUM** |
| Action types in blocks | Invite/Leave/Kick/DM in block actions | Action types defined, handlers incomplete | **MEDIUM** |
| `kick_member` | Full key rotation flow | Storage works, broadcast pending | **HIGH** |

### Protocol Compliance

| Protocol Element | Spec | Implementation | Status |
|-----------------|------|----------------|--------|
| AES-256-GCM | 32-byte key, 12-byte IV | `forum-client/src/lib/encryption.ts` | Compliant |
| X25519 key exchange | Ed25519 to X25519 derivation | `forum-client/src/lib/x25519.ts` | Compliant |
| XSalsa20-Poly1305 | NaCl box for key transport | `@noble/ciphers/salsa.js` | Compliant |
| Space ID | 16 bytes | `[u8; 16]` in MemberRecord | Compliant |
| Content prefix | `[PRIVATE:v1:<base64>]` | Implemented | Compliant |
| DM space ID | SHA256 of sorted pubkeys | `getDMSpaceId()` | Compliant |

### Constants Verified

| Constant | Spec | Implementation | Match |
|----------|------|----------------|-------|
| PBKDF2_ITERATIONS | 100,000 | 100,000 | Yes |
| SALT_LENGTH | 16 bytes | 16 bytes | Yes |
| IV_LENGTH | 12 bytes | 12 bytes | Yes |
| NONCE_SIZE | 24 bytes | 24 bytes | Yes |
| SPACE_KEY_LENGTH | 32 bytes | 32 bytes | Yes |

---

## Architectural Observations

### Fits Well

1. **Layered Architecture**
   - Storage: `src/storage/membership.rs` - Sled-backed, follows existing patterns
   - RPC: `src/rpc/methods.rs` - Standard method handlers
   - Client: `forum-client/src/lib/` - TypeScript utilities
   - Clean separation of concerns

2. **Consistent Data Structures**
   - `MemberRecord`, `InviteRecord`, `DMRequestRecord` follow existing patterns
   - Sled tree naming (`members`, `user_spaces`) consistent with other stores
   - Serialization via bincode matches chain.rs patterns

3. **RPC Method Patterns**
   - Uses standard `Params`/`Result` structs
   - Follows existing signature + PoW verification pattern
   - Error messages consistent with other handlers

4. **Client-Side Crypto**
   - WASM for identity PoW (consistent)
   - `@noble/*` libraries for encryption (appropriate for browser)
   - IndexedDB for key storage (standard web pattern)

5. **Action Types**
   - New actions (`Invite = 0x05` through `DeclineDM = 0x0C`) follow existing enum pattern
   - Documented in MASTER_FEATURES.md

### Concerns

1. **Missing Gossip Integration**
   - Existing gossip infrastructure (`src/network/gossip.rs`) not connected
   - Action broadcast requires defining wire protocol messages
   - This is the largest architectural gap

2. **No Message Types for Private Space Actions**
   - Wire protocol (SPEC_06) defines 22 message types
   - No `PRIVATE_SPACE_ACTION` or similar message type
   - Needed for network propagation

3. **Incomplete Action Handler Chain**
   - Actions defined in `blocks/action.rs`
   - RPC handlers exist in `rpc/methods.rs`
   - Block builder integration incomplete for some actions
   - Full chain: RPC -> Action -> BlockBuilder -> Gossip

4. **Test Coverage Gap**
   - 13 unit tests for storage layer (good)
   - No integration tests for full flows
   - No cross-node test scenarios

---

## Future Compatibility

### Extensibility Assessment

| Extension | Compatibility | Notes |
|-----------|---------------|-------|
| Network gossip for actions | Good | Action types defined, just need handlers |
| Multi-device key sync | Medium | Requires key derivation redesign |
| Forward secrecy | Medium | Major crypto upgrade, possible |
| Group admin transfer | Good | Role system supports it |
| Read receipts | Good | Can be added as new action type |
| Invite links | Good | Can extend InviteRecord |

### Breaking Change Risks

1. **Network Broadcast Addition**
   - When gossip is added, existing single-node spaces won't sync
   - Need migration path for existing membership data
   - Could require "re-announce" of existing spaces

2. **Key Recovery Strategy**
   - Currently: "Identity IS the keypair - no account recovery"
   - Space keys are derived from identity
   - If identity is lost, all private space access is lost
   - This is by design but users need to understand

3. **Schema Compatibility**
   - `MemberRecord.key_version: u32` supports future rotations
   - `InviteRecord.expires_at: Option<u64>` allows future policy changes
   - No obvious schema blockers

### Migration Considerations

1. **Single-Node to Multi-Node**
   - Existing membership data is node-local
   - When network broadcast is added, need to:
     - Announce existing memberships
     - Handle conflicts (user in space on node A, not on node B)
   - Recommend: Clean migration with re-invite flow

2. **Key Version Upgrades**
   - `key_version` field supports incremental rotation
   - Clients must handle receiving content with older key versions
   - Already designed for this

---

## Recommendations

### Priority 1: Critical (Vision-Breaking)

1. **Implement Network Gossip for Private Space Actions**
   - Define wire protocol messages for membership actions
   - Connect action handlers to gossip layer
   - Without this, the feature is fundamentally centralized
   - Estimated scope: Add 3-4 message types, integrate with existing gossip

2. **Complete Action Handler Chain**
   - Wire `kick_member` to broadcast `Kick` + `KeyRotation` actions
   - Wire DM operations to broadcast
   - Ensure actions appear in blocks

### Priority 2: High (Spec Compliance)

3. **Wire DM Request Rate Limiting**
   - Infrastructure exists (noted in security checklist)
   - Connect to existing rate limiting mechanisms
   - Prevents DM spam attacks

4. **Add Integration Tests**
   - Cross-node membership sync tests
   - Full create -> invite -> accept -> kick flow
   - DM request -> accept flow

### Priority 3: Medium (Future-Proofing)

5. **Document Key Recovery Strategy**
   - Users must understand "no recovery" model
   - Consider optional key backup (encrypted export)
   - Add prominent warnings in UI

6. **Plan Forward Secrecy Upgrade Path**
   - Document how future crypto upgrade could work
   - Consider Double Ratchet for DMs specifically
   - Not urgent for MVP but roadmap it

### Priority 4: Low (Polish)

7. **Consider Optional Membership Privacy**
   - Some users want hidden membership
   - Could encrypt membership metadata (more complex)
   - Trade-off with auditability

---

## Appendix: Spec Reference

### Action Types Defined (src/blocks/action.rs)
```rust
Invite = 0x05,
Leave = 0x06,
Kick = 0x07,
RevokeInvite = 0x08,
KeyRotation = 0x09,
DMRequest = 0x0A,
AcceptDM = 0x0B,
DeclineDM = 0x0C,
```

### Storage Trees (src/storage/membership.rs)
- `members`: space_id(16) || member_pk(32) -> MemberRecord
- `user_spaces`: member_pk(32) || space_id(16) -> ()
- `pending_invites`: invite_hash(32) -> InviteRecord
- `invites_by_user`: invitee_pk(32) || invite_hash(32) -> ()
- `dm_requests`: requester_pk(32) || recipient_pk(32) -> DMRequestRecord
- `dm_requests_by_recipient`: recipient_pk(32) || requester_pk(32) -> ()

### RPC Methods Implemented
- `create_private_space` - broadcast: true (via block builder)
- `invite_to_space` - broadcast: true (via block builder)
- `accept_invite` - broadcast: false (TODO)
- `leave_space` - broadcast: false (TODO)
- `kick_member` - broadcast: false (TODO)
- `request_dm` - broadcast: false
- `accept_dm` - broadcast: false
- `decline_dm` - broadcast: false

---

---

## Conclusion

The Private Spaces Encryption feature embodies Swimchain's vision in its design: decentralized authority, cryptographic identity, and privacy through encryption. The cryptographic implementation is solid and specification-compliant. However, the **critical gap in network broadcast** (`broadcast: false`) creates a fundamental contradiction - a "decentralized" feature that only works on a single node.

**The feature is 75% of the way to vision alignment.** The remaining 25% requires implementing the network layer integration that was deferred during initial development. The ActionTypes are defined (0x05-0x0C), the storage is ready, the crypto is correct - the gossip protocol integration is the missing piece.

**Recommendation**: Prioritize network broadcast implementation over new features. The current single-node limitation makes the feature unsuitable for production multi-node deployments and contradicts Swimchain's core value proposition.

---

*Review conducted: 2026-01-12*
*Reviewer perspective: Vision & Spec Alignment*

DECISION: review_complete
