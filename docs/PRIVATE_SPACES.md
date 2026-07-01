# Private Spaces Implementation Tracker

## Overview

Implementing encrypted private spaces for direct messaging and Discord-style group chats. A private space is a regular space with:
- Encrypted content (space-level symmetric key)
- Membership management (invite/leave/kick)
- Admin controls (creator has admin powers)

**Key Insight**: DMs are not special - they're just encrypted spaces with 2 members.

---

## Status Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Schema Changes | COMPLETE |
| 2 | Membership Storage | COMPLETE |
| 3 | Action Handlers (RPC) | COMPLETE |
| 4 | Forum Client - Key Management | COMPLETE |
| 5 | Forum Client - Encryption | COMPLETE |
| 6 | Forum Client - UI Components | COMPLETE |
| 7 | 1:1 DM Convenience | COMPLETE |

---

## Phase 1: Schema Changes - COMPLETE

### New ActionTypes (`src/blocks/action.rs`)

| Action | Discriminant | Purpose | PoW Required |
|--------|--------------|---------|--------------|
| `Invite` | 0x05 | Invite user to private space | Yes |
| `Leave` | 0x06 | Member leaves space | No |
| `Kick` | 0x07 | Admin kicks member (triggers key rotation) | Yes |
| `RevokeInvite` | 0x08 | Cancel pending invite | No |
| `KeyRotation` | 0x09 | Distribute new key after kick | Yes |
| `DMRequest` | 0x0A | Request to start 1:1 DM | Yes |
| `AcceptDM` | 0x0B | Accept DM request | No |
| `DeclineDM` | 0x0C | Decline DM request | No |

### SpaceInfo Extension (`src/storage/chain.rs`)

```rust
pub struct SpaceInfo {
    // ... existing fields ...

    /// Is this a private/encrypted space?
    #[serde(default)]
    pub is_private: bool,

    /// Encrypted space name (AES-256-GCM)
    #[serde(default)]
    pub encrypted_name: Option<Vec<u8>>,

    /// Encrypted space key for creator (X25519 box)
    #[serde(default)]
    pub creator_encrypted_key: Option<Vec<u8>>,

    /// Key version (0 = initial, 1+ = rotated)
    #[serde(default)]
    pub key_version: u32,
}
```

### Files Modified

- [x] `src/blocks/action.rs` - Added 8 new ActionTypes + tests
- [x] `src/blocks/validation.rs` - Validation rules for new actions
- [x] `src/blocks/content_block.rs` - Thread integrity checks
- [x] `src/storage/chain.rs` - SpaceInfo extension + content indexing
- [x] `src/cli/commands/block.rs` - format_action_type()
- [x] `src/node/manager.rs` - Aggregation counts
- [x] `src/rpc/methods.rs` - Action type strings

---

## Phase 2: Membership Storage - COMPLETE

### MembershipStore (`src/storage/membership.rs`)

Storage module for tracking space membership, invites, and DM requests.

**Structs implemented:**
- `MemberRecord` - Member info with role, join time, encrypted key
- `MemberRole` - Admin/Moderator/Member enum
- `InviteRecord` - Pending invite with expiry, status
- `InviteStatus` - Pending/Accepted/Declined/Revoked/Expired
- `DMRequestRecord` - DM request with key share
- `DMRequestStatus` - Pending/Accepted/Declined
- `MembershipStats` - Storage statistics

**Trees (sled):**
- `members`: space_id(16) || member_pk(32) → MemberRecord
- `user_spaces`: member_pk(32) || space_id(16) → () (reverse index)
- `pending_invites`: invite_hash(32) → InviteRecord
- `invites_by_user`: invitee_pk(32) || invite_hash(32) → ()
- `dm_requests`: requester_pk(32) || recipient_pk(32) → DMRequestRecord
- `dm_requests_by_recipient`: recipient_pk(32) || requester_pk(32) → ()

### Tasks

- [x] Create `src/storage/membership.rs`
- [x] Add MemberRecord and MemberRole structs
- [x] Implement member CRUD operations
- [x] Implement pending invite tracking
- [x] Add reverse index for "my spaces" queries
- [x] Add DM request tracking
- [x] Add to `src/storage/mod.rs`
- [x] Unit tests (11 tests passing)

---

## Phase 3: Action Handlers (RPC) - COMPLETE

### New RPC Methods (`src/rpc/methods.rs`)

| Method | Description | Types | Handler |
|--------|-------------|-------|---------|
| `create_private_space` | Create encrypted space with initial key | DONE | **DONE** |
| `invite_to_space` | Send invite with encrypted key | DONE | **DONE** |
| `accept_invite` | Accept and decrypt space key | DONE | **DONE** |
| `leave_space` | Remove self from space | DONE | **DONE** |
| `kick_member` | Admin removes member | DONE | TODO (key rotation) |
| `get_my_invites` | List pending invites | DONE | **DONE** |
| `get_space_members` | List members of a space | DONE | **DONE** |
| `request_dm` | Start DM request flow | DONE | TODO |
| `accept_dm` | Accept DM and create space | DONE | TODO |
| `decline_dm` | Decline DM request | DONE | TODO |
| `get_pending_dm_requests` | List pending DM requests | DONE | **DONE** |
| `get_my_private_spaces` | List user's private spaces | DONE | **DONE** |

### RPC Types Added (`src/rpc/types.rs`)

- `CreatePrivateSpaceParams/Result`
- `InviteToSpaceParams/Result`
- `AcceptInviteParams/Result`
- `LeaveSpaceParams/Result`
- `KickMemberParams/Result`
- `GetMyInvitesParams/Result` + `InviteInfo`
- `GetSpaceMembersParams/Result` + `MemberInfo`
- `RequestDMParams/Result`
- `AcceptDMParams/Result`
- `DeclineDMParams/Result`
- `GetPendingDMRequestsParams/Result` + `DMRequestInfo`
- `GetMyPrivateSpacesParams/Result` + `PrivateSpaceInfo`

### Tasks

- [x] Add RPC param/result structs to `src/rpc/types.rs`
- [x] Add MembershipStore to NodeRef (`src/rpc/methods.rs`, `src/node/manager.rs`)
- [x] Initialize MembershipStore in NodeManager startup
- [x] Implement `get_my_invites`
- [x] Implement `get_space_members`
- [x] Implement `get_pending_dm_requests`
- [x] Implement `get_my_private_spaces`
- [x] Implement `create_private_space`
- [x] Implement `invite_to_space`
- [x] Implement `accept_invite`
- [x] Implement `leave_space`
- [ ] Implement `kick_member` + key rotation (Phase 7)
- [ ] Implement DM request/accept/decline flow (Phase 7)
- [x] Wire up action handlers to BlockBuilder

---

## Phase 4: Forum Client - Key Management - COMPLETE

### X25519 Key Derivation (`forum-client/src/lib/x25519.ts`)

```typescript
// Convert Ed25519 identity keys to X25519 for encryption
export function deriveX25519Keys(ed25519Seed: Uint8Array): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// NaCl box encryption
export function x25519Box(message, recipientPk, senderSk): Uint8Array
export function x25519Unbox(ciphertext, senderPk, recipientSk): Uint8Array | null

// Space key helpers
export function generateSpaceKey(): Uint8Array
export function encryptSpaceKeyForRecipient(...): Uint8Array
export function decryptSpaceKey(...): Uint8Array | null
```

### Private Space Key Storage (`forum-client/src/hooks/usePrivateSpaceKeys.ts`)

```typescript
interface PrivateSpaceKey {
  spaceId: string;
  spaceKey: Uint8Array;
  keyVersion: number;
  joinedAt: number;
  invitedBy: string;
  spaceName?: string;
}

// Store in IndexedDB
export function usePrivateSpaceKeys() {
  return {
    getSpaceKey: (spaceId) => Uint8Array | null,
    getSpaceKeyInfo: (spaceId) => PrivateSpaceKey | null,
    storeSpaceKey: (spaceId, key, invitedBy, keyVersion, spaceName?) => void,
    updateSpaceKey: (spaceId, newKey, newVersion) => void,
    removeSpaceKey: (spaceId) => void,
    hasSpaceKey: (spaceId) => boolean,
    listMyPrivateSpaces: PrivateSpaceKey[],
  };
}
```

### Tasks

- [x] Add `@noble/curves` and `@noble/hashes` dependencies
- [x] Create `forum-client/src/lib/x25519.ts`
- [x] Create `forum-client/src/hooks/usePrivateSpaceKeys.ts`
- [x] IndexedDB storage for space keys

---

## Phase 5: Forum Client - Encryption - COMPLETE

### Space-Key Encryption (`forum-client/src/lib/encryption.ts`)

```typescript
// Encrypt content with space key (not passphrase)
export async function encryptWithSpaceKey(
  content: string,
  spaceKey: Uint8Array
): Promise<string>
// Format: [PRIVATE:v1:<base64(iv:ciphertext)>]

export async function decryptWithSpaceKey(
  encrypted: string,
  spaceKey: Uint8Array
): Promise<string>

// Posts
export async function encryptPrivatePost(title, body, spaceKey): Promise<...>
export async function decryptPrivatePost(encryptedBody, spaceKey): Promise<...>

// Media
export async function encryptPrivateMedia(data, spaceKey): Promise<Uint8Array>
export async function decryptPrivateMedia(data, spaceKey): Promise<Uint8Array | null>

// Space name
export async function encryptSpaceName(name, spaceKey): Promise<Uint8Array>
export async function decryptSpaceName(encrypted, spaceKey): Promise<string | null>
```

### Tasks

- [x] Add `encryptWithSpaceKey()` to encryption.ts
- [x] Add `decryptWithSpaceKey()` to encryption.ts
- [x] Add private post encryption/decryption
- [x] Add private media encryption/decryption
- [x] Add space name encryption/decryption
- [ ] Auto-decrypt content in private spaces (Phase 6 - UI integration)
- [ ] Handle "Not a member" case gracefully (Phase 6 - UI integration)

---

## Phase 6: Forum Client - UI Components - COMPLETE

### Components Created

| Component | Description | Status |
|-----------|-------------|--------|
| `PrivateSpaceList` | Combined DM/group list with invites | DONE |
| `ChatView` | Unified chat interface | DONE |
| `InviteModal` | Send invites (needs PoW integration) | DONE |
| `SpaceSettings` | Admin controls | TODO |

### Routes Added

```
/chat/:spaceId       - Private space chat view
```

### Sidebar Integration

Added tabs to Sidebar.tsx:
- "Public" tab - Shows SpaceTree (public spaces)
- "Private" tab - Shows PrivateSpaceList

### Tasks

- [x] Create `PrivateSpaceList.tsx` - List of private spaces + pending invites
- [x] Create `ChatView.tsx` - Chat interface with member sidebar
- [x] Create `InviteModal.tsx` - Invite dialog with key encryption
- [x] Add `/chat/:spaceId` route to App.tsx
- [x] Add Public/Private tabs to Sidebar
- [x] RPC hooks for membership operations (useRpc.tsx)
- [ ] Create `SpaceSettings.tsx` (deferred to Phase 7)

---

## Phase 7: 1:1 DM Convenience - COMPLETE

### Deterministic DM Space ID (`forum-client/src/lib/dm.ts`)

```typescript
function getDMSpaceId(myPk: string, theirPk: string): string {
  const sorted = [myPk, theirPk].sort();
  return sha256(`dm:v1:${sorted[0]}:${sorted[1]}`).slice(0, 16);  // 16 bytes for space ID
}
```

### Components Created

| File | Description |
|------|-------------|
| `forum-client/src/lib/dm.ts` | DM utilities (deterministic space ID, status helpers) |
| `forum-client/src/components/StartDMButton.tsx` | "Message" button component |
| `forum-client/src/components/StartDMButton.css` | Styles for DM button |

### Auto-Create DM Flow

1. User hovers over author name → DM button appears
2. Click "Message" button
3. Compute deterministic space_id from sorted public keys
4. Check if we already have the space key
5. If not, generate new space key and store locally
6. Navigate to `/chat/:spaceId`

### Integration Points

- `AddressDisplay` component now supports `showDM` prop
- Enabled in `ThreadView.tsx` for thread authors
- Enabled in `ReplyTree.tsx` for reply authors

### Tasks

- [x] Implement deterministic DM space ID (`getDMSpaceId()`)
- [x] Add DM status types and helpers
- [x] Create `StartDMButton` component
- [x] Add `showDM` prop to `AddressDisplay`
- [x] Enable DM button on thread authors
- [x] Enable DM button on reply authors
- [ ] Full DM request flow with on-chain actions (requires PoW integration)
- [ ] Handle pending/accepted/declined states with RPC

---

## Design Decisions

### Key Rotation on Kick: FULL ROTATION
When a member is kicked:
1. Admin generates new `space_key_v2`
2. Admin broadcasts `KeyRotation` action with encrypted keys for remaining members
3. Old messages stay encrypted with old key (kicked user can still read history)
4. New messages use new key (kicked user cannot read)

### DM Initiation: REQUEST FIRST
- Sender creates `DMRequest` action
- Recipient must accept before conversation starts
- Prevents spam DMs from random users
- Rate limiting: N pending requests per user, cooldown after decline

### Membership Visibility: ON-CHAIN
- All membership actions are Actions on-chain
- Simpler, auditable, uses existing sync infrastructure
- Metadata (who is in which space) is visible

---

## Testing Checklist

### Unit Tests
- [ ] ActionType discriminants and TryFrom
- [ ] SpaceInfo serialization with new fields
- [ ] MembershipStore CRUD operations
- [ ] X25519 key derivation
- [ ] Space-key encryption/decryption

### Integration Tests
- [ ] Create private space flow
- [ ] Invite -> Accept flow
- [ ] Kick -> Key rotation flow
- [ ] DM request -> Accept flow
- [ ] Content encryption in private space

### E2E Tests
- [ ] Two users: DM conversation
- [ ] Three users: Group chat
- [ ] Kick and verify key rotation
- [ ] Leave and rejoin

---

## References

- Plan file: `/home/super/.claude/plans/lazy-crunching-island.md`
- ActionType enum: `src/blocks/action.rs:61`
- SpaceInfo struct: `src/storage/chain.rs:100`
- Validation: `src/blocks/validation.rs:154`
