# Private Spaces Feature Test Report

**Date**: 2026-02-05 (Updated)
**Status**: BLOCKED - Node-side key derivation not implemented

## Feature Overview

Private Spaces allow users to create encrypted direct messages (DMs) and group chats. The feature includes:
- Private space list in sidebar (under "Private" tab)
- Create private space form
- Invite system for adding members
- End-to-end encryption using X25519 key exchange

## Test Results (Latest Session)

### Screenshots Captured

| Screenshot | Description |
|------------|-------------|
| `01-home.png` | Home page initial state |
| `02-private-spaces-list.png` | Spaces page with Public/Private tabs |
| `03-private-tab.png` | Private tab selected, showing "No private spaces yet" |
| `04-create-form.png` | Button click didn't navigate (bug) |
| `05-create-page.png` | Direct navigation to /private/create redirected |
| `06-create-form-correct.png` | Actual create form at /spaces/new/private |
| `07-form-filled.png` | Form with "Test Private Space" entered |
| `08-after-create.png` | **ERROR**: "Seed is not available" message |
| `09-private-list-final.png` | Private spaces list still empty |

### Critical Bug Found

#### BUG: Private Space Creation Fails - Node-Side Key Derivation Required

**Error Message**:
```
Seed is not available - identity private key is managed by the node.
Private spaces require node-side key derivation (not yet implemented).
```

**Root Cause**:
After the identity consolidation changes, the private key (seed) is stored only on the node, not in the browser. Private spaces require X25519 key derivation from the Ed25519 seed to create encryption keys. Since the browser no longer has access to the seed, this operation fails.

**Technical Details**:
- The `useStoredKeypair` hook now returns a keypair that uses RPC for signing
- When `keypair.seed()` is called (needed for X25519 derivation), it throws an error
- This affects: CreatePrivateSpace.tsx, PrivateSpaceList.tsx, and any E2E encryption

**Location**:
- `forum-client/src/pages/CreatePrivateSpace.tsx` - calls `keypair.seed()` for X25519
- `forum-client/src/hooks/useStoredKeypair.ts:35` - throws error when seed() is called

### UI Flow Documented

1. **Spaces Page** (`/spaces`)
   - Has Public/Private tabs in sidebar
   - Private tab shows "PRIVATE SPACES" section with + button

2. **Private Tab**
   - Shows "No private spaces yet" when empty
   - "Create Private Space" button visible
   - Note: Button click doesn't navigate (minor bug)

3. **Create Private Space Form** (`/spaces/new/private`)
   - Space Name input with placeholder
   - "Only members can see the space name (encrypted)" note
   - "End-to-end encrypted" info box
   - Cancel and "Create Space" buttons

4. **Error State**
   - Clear error message explaining the limitation
   - Form remains usable but submission blocked

### Working Features

1. **UI Navigation** - Tab switching between Public/Private works
2. **Create Form UI** - Form renders correctly with all fields
3. **Error Handling** - Clear error message shown to user
4. **Node Status** - Synced with 10 peers, storage at 7/500 MB

### Blocked Features (Until Node-Side Key Derivation)

1. Private space creation
2. Inviting members
3. Accepting/declining invites
4. Private space messaging
5. E2E encryption/decryption

## Recommendations

### Option 1: Implement Node-Side Key Derivation (Recommended)

Add an RPC method `derive_x25519_key` that:
1. Takes the space ID or derivation path
2. Uses the node's Ed25519 seed internally
3. Derives the X25519 key pair server-side
4. Returns the public key and performs encryption/decryption on node

**Pros**: Most secure, keeps private key on node
**Cons**: Requires Rust implementation

### Option 2: Expose Seed via RPC (Not Recommended)

Add an RPC method to export the seed with strong warnings.

**Pros**: Quick fix
**Cons**: Security risk, defeats purpose of node-managed identity

### Option 3: Hybrid Identity Mode

Allow users to choose between:
- Node-managed identity (for public spaces, no private features)
- Browser-stored identity (full features including private spaces)

**Pros**: User choice, backwards compatible
**Cons**: UX complexity, two paths to maintain

## Code References

- `/forum-client/src/pages/CreatePrivateSpace.tsx` - Create form component
- `/forum-client/src/hooks/useStoredKeypair.ts` - Keypair hook with seed() limitation
- `/forum-client/src/hooks/usePrivateSpaceKeys.ts` - Key derivation for private spaces
- `/src/rpc/server.rs` - RPC server implementation
