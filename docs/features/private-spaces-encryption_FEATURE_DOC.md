# Private Spaces & Encryption - Feature Documentation

## Overview

Private Spaces provide end-to-end encrypted group communication within Swimchain. Unlike public spaces where all content is visible to any node, private spaces encrypt all content using a shared symmetric key that only members possess.

**Key Characteristics:**
- **Private Space**: An encrypted group with membership controls
- **Space Key**: A 32-byte AES-256 key shared among all members
- **X25519 Key Exchange**: Used to securely share the space key with new members
- **DMs (Direct Messages)**: Special case of private spaces with exactly 2 members

**Why Private Spaces?**
- End-to-end encryption - nodes cannot read content without the space key
- Membership control - only invited users can join
- Key rotation - kicked members lose access to new content
- Deterministic DM space IDs - both parties compute the same space ID

---

## Architecture

```
+----------------------------------------------------------------+
|                         Client Layer                            |
+----------------------------------------------------------------+
|  +-------------+  +-------------+  +-------------------------+  |
|  |  x25519.ts  |  |encryption.ts|  |         dm.ts           |  |
|  |             |  |             |  |                         |  |
|  | Key derive  |  | AES-256-GCM |  | Deterministic DM IDs    |  |
|  | X25519 box  |  | Content enc |  | Status helpers          |  |
|  +------+------+  +------+------+  +------------+------------+  |
|         |                |                      |               |
|         +----------------+----------------------+               |
|                          |                                      |
|                    +-----v-----+                                |
|                    |  RPC API  |                                |
|                    +-----+-----+                                |
+--------------------------|--------------------------------------+
                           | JSON-RPC
+--------------------------|--------------------------------------+
|                    Node Layer                                   |
+--------------------------|--------------------------------------+
|                    +-----v-----+                                |
|                    |methods.rs |                                |
|                    |           |                                |
|                    | Private   |                                |
|                    | space RPC |                                |
|                    +-----+-----+                                |
|                          |                                      |
|                    +-----v----------+                           |
|                    |membership.rs   |                           |
|                    |                |                           |
|                    | MemberRecord   |                           |
|                    | InviteRecord   |                           |
|                    | DMRequestRecord|                           |
|                    +-------+--------+                           |
|                            |                                    |
|                    +-------v--------+                           |
|                    |   Sled DB      |                           |
|                    |                |                           |
|                    | members tree   |                           |
|                    | invites tree   |                           |
|                    | dm_requests    |                           |
|                    +----------------+                           |
+----------------------------------------------------------------+
```

### Encryption Architecture

```
Ed25519 Identity Key (32 bytes)
        |
        v
   SHA-512 Hash
        |
        v
 X25519 Private Key (32 bytes, clamped)
        |
        +--------------------------------------+
        v                                      v
X25519 Public Key                    X25519 DH Exchange
        |                                      |
        |                                      v
        |                           Shared Secret (32 bytes)
        |                                      |
        |                                      v
        |                           XSalsa20-Poly1305
        |                           (NaCl box)
        |                                      |
        +--------------------------------------+
                       |
                       v
              Encrypted Space Key
                       |
                       v
              AES-256-GCM Content Encryption
```

---

## Data Structures

### MemberRole
Defines permission levels within a private space.

| Value | Role | Permissions |
|-------|------|-------------|
| 0 | Admin | Full control - kick anyone, invite, change settings |
| 1 | Moderator | Can kick members (not admins/mods), invite users |
| 2 | Member | Can post, leave |

**Location**: `src/storage/membership.rs:19-29`

### MemberRecord
Record of a member in a private space.

| Field | Type | Description |
|-------|------|-------------|
| member_pk | [u8; 32] | Member's Ed25519 public key |
| role | MemberRole | Permission level in the space |
| joined_at | u64 | Unix timestamp when they joined |
| invited_by | [u8; 32] | Public key of inviter (zeroed for creator) |
| encrypted_space_key | Vec<u8> | X25519-boxed space key for this member |
| key_version | u32 | Current key version (increments on rotation) |

**Location**: `src/storage/membership.rs:48-63`

### InviteRecord
Record of a pending or processed invite.

| Field | Type | Description |
|-------|------|-------------|
| invite_hash | [u8; 32] | Unique identifier (action hash) |
| space_id | [u8; 16] | Target space |
| inviter_pk | [u8; 32] | Who sent the invite |
| invitee_pk | [u8; 32] | Who is being invited |
| encrypted_space_key | Vec<u8> | Space key encrypted for invitee |
| created_at | u64 | Unix timestamp |
| expires_at | Option<u64> | Optional expiry (None = never) |
| status | InviteStatus | Pending/Accepted/Declined/Revoked/Expired |
| message | Option<Vec<u8>> | Optional encrypted invite message |

**Location**: `src/storage/membership.rs:82-102`

### InviteStatus

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Pending | Awaiting response |
| 1 | Accepted | Invite was accepted |
| 2 | Declined | Invite was declined |
| 3 | Revoked | Sender revoked the invite |
| 4 | Expired | Invite expired |

**Location**: `src/storage/membership.rs:66-79`

### DMRequestRecord
Record of a direct message request.

| Field | Type | Description |
|-------|------|-------------|
| request_hash | [u8; 32] | Request action hash |
| requester_pk | [u8; 32] | Who sent the request |
| recipient_pk | [u8; 32] | Who is being requested |
| requester_key_share | Vec<u8> | Requester's X25519 public key |
| created_at | u64 | Unix timestamp |
| status | DMRequestStatus | Pending/Accepted/Declined |
| space_id | Option<[u8; 16]> | DM space ID (set when accepted) |

**Location**: `src/storage/membership.rs:117-133`

### DMRequestStatus

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Pending | Awaiting response |
| 1 | Accepted | Request accepted, DM space created |
| 2 | Declined | Request was declined |

**Location**: `src/storage/membership.rs:104-114`

### MembershipStore
Sled-backed storage for membership data.

**Storage Trees:**
- `members`: `space_id(16) || member_pk(32)` -> `MemberRecord`
- `user_spaces`: `member_pk(32) || space_id(16)` -> `()` (reverse index)
- `pending_invites`: `invite_hash(32)` -> `InviteRecord`
- `invites_by_user`: `invitee_pk(32) || invite_hash(32)` -> `()` (index)
- `dm_requests`: `requester_pk(32) || recipient_pk(32)` -> `DMRequestRecord`
- `dm_requests_by_recipient`: `recipient_pk(32) || requester_pk(32)` -> `()` (index)

**Location**: `src/storage/membership.rs:136-151`

---

## Core APIs

### Storage Layer (membership.rs)

#### add_member()
**Signature**: `fn add_member(&self, space_id: &[u8; 16], record: &MemberRecord) -> Result<(), StorageError>`

**Purpose**: Add a member to a private space with their encrypted key.

#### remove_member()
**Signature**: `fn remove_member(&self, space_id: &[u8; 16], member_pk: &[u8; 32]) -> Result<bool, StorageError>`

**Purpose**: Remove a member from a space. Returns true if member existed.

#### get_member()
**Signature**: `fn get_member(&self, space_id: &[u8; 16], member_pk: &[u8; 32]) -> Result<Option<MemberRecord>, StorageError>`

**Purpose**: Retrieve a member's record including their encrypted space key.

#### get_space_members()
**Signature**: `fn get_space_members(&self, space_id: &[u8; 16]) -> Result<Vec<MemberRecord>, StorageError>`

**Purpose**: Get all members of a space (for key rotation, member list display).

#### get_user_spaces()
**Signature**: `fn get_user_spaces(&self, member_pk: &[u8; 32]) -> Result<Vec<[u8; 16]>, StorageError>`

**Purpose**: Get all private spaces a user belongs to.

#### update_member_key()
**Signature**: `fn update_member_key(&self, space_id: &[u8; 16], member_pk: &[u8; 32], encrypted_space_key: Vec<u8>, key_version: u32) -> Result<bool, StorageError>`

**Purpose**: Update a member's encrypted key after key rotation.

### Client-Side Encryption (x25519.ts)

**Location**: `forum-client/src/lib/x25519.ts`

#### deriveX25519Keys()
**Signature**: `function deriveX25519Keys(ed25519Seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array }`

**Purpose**: Derive X25519 keypair from Ed25519 identity seed for key exchange.

**Example**:
```typescript
import { deriveX25519Keys } from './lib/x25519';

// From Ed25519 seed (32 bytes)
const { publicKey, secretKey } = deriveX25519Keys(ed25519Seed);
```

#### generateSpaceKey()
**Signature**: `function generateSpaceKey(): Uint8Array`

**Purpose**: Generate a random 32-byte AES-256 key for a new private space.

#### encryptSpaceKeyForRecipient()
**Signature**: `function encryptSpaceKeyForRecipient(spaceKey: Uint8Array, recipientX25519PublicKey: Uint8Array, senderX25519SecretKey: Uint8Array): Uint8Array`

**Purpose**: Encrypt the space key for a specific recipient using NaCl box.

**Returns**: Nonce (24 bytes) || Ciphertext

#### decryptSpaceKey()
**Signature**: `function decryptSpaceKey(encryptedSpaceKey: Uint8Array, senderX25519PublicKey: Uint8Array, recipientX25519SecretKey: Uint8Array): Uint8Array | null`

**Purpose**: Decrypt a space key that was encrypted for us.

### Client-Side Content Encryption (encryption.ts)

**Location**: `forum-client/src/lib/encryption.ts`

#### encryptWithSpaceKey()
**Signature**: `async function encryptWithSpaceKey(content: string, spaceKey: Uint8Array): Promise<string>`

**Purpose**: Encrypt text content for a private space using AES-256-GCM.

**Returns**: `[PRIVATE:v1:<base64(iv:ciphertext)>]`

#### decryptWithSpaceKey()
**Signature**: `async function decryptWithSpaceKey(encryptedContent: string, spaceKey: Uint8Array): Promise<string | null>`

**Purpose**: Decrypt content from a private space.

#### encryptPrivatePost()
**Signature**: `async function encryptPrivatePost(title: string, body: string, spaceKey: Uint8Array): Promise<{ encryptedTitle: string; encryptedBody: string }>`

**Purpose**: Encrypt a full post (title + body) for a private space.

**Example**:
```typescript
import { encryptPrivatePost, decryptPrivatePost } from './lib/encryption';

// Encrypt a post
const { encryptedTitle, encryptedBody } = await encryptPrivatePost(
  'My Secret Topic',
  'This is private content...',
  spaceKey
);

// Decrypt a post
const result = await decryptPrivatePost(encryptedBody, spaceKey);
if (result) {
  console.log(result.title, result.body);
}
```

### DM Utilities (dm.ts)

**Location**: `forum-client/src/lib/dm.ts`

#### getDMSpaceId()
**Signature**: `function getDMSpaceId(myPk: string, theirPk: string): string`

**Purpose**: Generate deterministic DM space ID from two public keys.

**Algorithm**:
1. Sort public keys lexicographically (lowercase)
2. Hash: `SHA256("dm:v1:" + pk1 + ":" + pk2)`
3. Take first 16 bytes as space ID

**Example**:
```typescript
import { getDMSpaceId } from './lib/dm';

const spaceId = getDMSpaceId(myPublicKey, theirPublicKey);
// Both parties compute the same ID
```

---

## Behaviors

### Private Space Creation Flow

1. **Client generates space key**: `generateSpaceKey()` -> 32-byte random key
2. **Client derives X25519 keys**: `deriveX25519Keys(ed25519Seed)`
3. **Client encrypts space key for self**: `encryptSpaceKeyForRecipient(spaceKey, myX25519Pk, myX25519Sk)`
4. **Client calls RPC**: `create_private_space` with encrypted key
5. **Node stores**: Creator as Admin with `encrypted_space_key`
6. **Client stores**: Space key locally (IndexedDB)

```typescript
// Example: Create private space
const spaceKey = generateSpaceKey();
const { publicKey, secretKey } = deriveX25519Keys(identitySeed);
const encryptedKey = encryptSpaceKeyForRecipient(spaceKey, publicKey, secretKey);

const result = await rpc.createPrivateSpace({
  name: await encryptSpaceName(spaceName, spaceKey),
  creator: myPublicKeyHex,
  creator_encrypted_key: bytesToHex(encryptedKey),
  // ... PoW and signature
});
```

### Invite Flow

1. **Inviter encrypts space key** for invitee's X25519 public key
2. **Inviter calls RPC**: `invite_to_space` with encrypted key
3. **Node stores**: `InviteRecord` with status `Pending`
4. **Invitee receives notification** (via `get_my_invites`)
5. **Invitee accepts**: Calls `accept_invite`
6. **Node adds member**: With their `encrypted_space_key`
7. **Invitee decrypts space key** and stores locally

```typescript
// Example: Invite a user
const inviteeX25519Pk = ed25519PublicToX25519(hexToBytes(inviteePublicKey));
const encryptedKey = encryptSpaceKeyForRecipient(spaceKey, inviteeX25519Pk, myX25519Sk);

await rpc.inviteToSpace({
  space_id: spaceId,
  inviter: myPublicKey,
  invitee: inviteePublicKey,
  encrypted_space_key: bytesToHex(encryptedKey),
  // ... PoW and signature
});
```

### Leave Space Flow

1. **Member calls RPC**: `leave_space`
2. **Node removes member** from membership store
3. **Client deletes** local space key

### Kick Member Flow

1. **Admin/Mod generates new space key** (key rotation)
2. **Admin encrypts new key** for all remaining members
3. **Admin calls RPC**: `kick_member` with `new_encrypted_keys` map
4. **Node removes kicked member**
5. **Node updates keys** for remaining members with new version
6. **Remaining members receive** new encrypted key

**Permission Check** (implemented at `src/rpc/methods.rs:8864-8876`):
- Admins can kick anyone (except themselves)
- Moderators can only kick Members (not Admins or other Mods)

**Key Rotation Processing** (implemented at `src/rpc/methods.rs:8926-8952`):
- The `kick_member` handler iterates through `new_encrypted_keys`
- For each remaining member, calls `update_member_key` with new version
- Logs number of keys rotated

### DM Request Flow

1. **Requester generates X25519 key share**
2. **Requester calls RPC**: `request_dm` with key share
3. **Node checks** for existing DM in both directions
4. **Node stores**: `DMRequestRecord` with status `Pending`
5. **Recipient sees request** via `get_pending_dm_requests`
6. **Recipient accepts**: Calls `accept_dm`
7. **Node creates DM space** with deterministic ID
8. **Both parties added** as Admins with empty `encrypted_space_key`
9. **Clients derive shared key** from DH exchange

**DM Space ID Generation** (client-side):
```typescript
function getDMSpaceId(myPk: string, theirPk: string): string {
  // Sort public keys to ensure deterministic ordering
  const sorted = [myPk.toLowerCase(), theirPk.toLowerCase()].sort();

  // Create the preimage
  const preimage = `dm:v1:${sorted[0]}:${sorted[1]}`;

  // Hash with SHA256
  const hash = sha256(new TextEncoder().encode(preimage));

  // Take first 16 bytes (128 bits) for space ID
  return bytesToHex(hash.slice(0, 16));
}
```

---

## Configuration

### Encryption Constants

| Constant | Value | Description |
|----------|-------|-------------|
| PBKDF2_ITERATIONS | 100,000 | Iterations for passphrase-based encryption |
| SALT_LENGTH | 16 bytes | Salt size for PBKDF2 |
| IV_LENGTH | 12 bytes | Nonce size for AES-GCM |
| NONCE_SIZE | 24 bytes | Nonce size for XSalsa20-Poly1305 |
| SPACE_KEY_LENGTH | 32 bytes | AES-256 key size |

### Content Prefixes

| Prefix | Format | Usage |
|--------|--------|-------|
| `[ENCRYPTED:v1:<base64>]` | base64(salt:iv:ciphertext) | Passphrase-encrypted posts |
| `[PRIVATE:v1:<base64>]` | base64(iv:ciphertext) | Private space content |

---

## RPC Methods

### create_private_space
Create a new encrypted private space.

**Request**:
```json
{
  "method": "create_private_space",
  "params": {
    "name": "Team Chat",
    "description": "Private team discussion",
    "creator": "a1b2c3...(32-byte hex)",
    "creator_encrypted_key": "...(X25519 box, hex)",
    "pow_nonce": 12345,
    "pow_difficulty": 16,
    "pow_nonce_space": "...(8-byte hex)",
    "pow_hash": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "space_id": "a1b2c3...(16-byte hex)",
    "space_id_bech32": "swim1...",
    "broadcast": true
  }
}
```

**Location**: `src/rpc/methods.rs:8087`, `src/rpc/types.rs:1099-1131`

### invite_to_space
Invite a user to join a private space.

**Request**:
```json
{
  "method": "invite_to_space",
  "params": {
    "space_id": "...(16-byte hex)",
    "inviter": "...(32-byte hex)",
    "invitee": "...(32-byte hex)",
    "encrypted_space_key": "...(X25519 box, hex)",
    "expires_at": 1704153600,
    "message": "...(optional, encrypted hex)",
    "pow_nonce": 12345,
    "pow_difficulty": 16,
    "pow_nonce_space": "...(8-byte hex)",
    "pow_hash": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "invite_hash": "...(32-byte hex)",
    "broadcast": true
  }
}
```

**Location**: `src/rpc/methods.rs:8278`, `src/rpc/types.rs:1135-1169`

### accept_invite
Accept a pending invite and join the space.

**Request**:
```json
{
  "method": "accept_invite",
  "params": {
    "invite_hash": "...(32-byte hex)",
    "acceptor": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "space_id": "...(16-byte hex)",
    "broadcast": true
  }
}
```

**Location**: `src/rpc/types.rs:1173-1191`

### leave_space
Leave a private space.

**Request**:
```json
{
  "method": "leave_space",
  "params": {
    "space_id": "...(16-byte hex)",
    "member": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "broadcast": true
  }
}
```

**Location**: `src/rpc/types.rs:1195-1213`

### kick_member
Remove a member from a space (Admin/Moderator only).

**Request**:
```json
{
  "method": "kick_member",
  "params": {
    "space_id": "...(16-byte hex)",
    "admin": "...(32-byte hex)",
    "member": "...(32-byte hex)",
    "new_encrypted_keys": {
      "pubkey1_hex": "new_encrypted_key1_hex",
      "pubkey2_hex": "new_encrypted_key2_hex"
    },
    "key_version": 2,
    "pow_nonce": 12345,
    "pow_difficulty": 16,
    "pow_nonce_space": "...(8-byte hex)",
    "pow_hash": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "key_version": 2,
    "broadcast": false
  }
}
```

**Note**: Key rotation IS processed - the handler iterates `new_encrypted_keys` and updates each member's key via `update_member_key()`. See `src/rpc/methods.rs:8926-8952`.

**Location**: `src/rpc/methods.rs:8761`, `src/rpc/types.rs:1217-1251`

### request_dm
Send a direct message request to another user.

**Request**:
```json
{
  "method": "request_dm",
  "params": {
    "requester": "...(32-byte hex)",
    "recipient": "...(32-byte hex)",
    "key_share": "...(X25519 public key, hex)",
    "pow_nonce": 12345,
    "pow_difficulty": 16,
    "pow_nonce_space": "...(8-byte hex)",
    "pow_hash": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "request_hash": "...(32-byte hex)",
    "broadcast": false
  }
}
```

**Location**: `src/rpc/types.rs:1317-1347`

### accept_dm
Accept a DM request, creating the DM space.

**Request**:
```json
{
  "method": "accept_dm",
  "params": {
    "request_hash": "...(32-byte hex)",
    "acceptor": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "space_id": "...(16-byte hex, deterministic)",
    "broadcast": false
  }
}
```

**Location**: `src/rpc/types.rs:1351-1365`

### decline_dm
Decline a DM request.

**Request**:
```json
{
  "method": "decline_dm",
  "params": {
    "request_hash": "...(32-byte hex)",
    "decliner": "...(32-byte hex)",
    "signature": "...(64-byte hex)",
    "timestamp": 1704067200
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "broadcast": false
  }
}
```

**Location**: `src/rpc/types.rs:1369-1393`

### get_my_invites
Get all pending invites for the current user.

**Request**:
```json
{
  "method": "get_my_invites",
  "params": {
    "user": "...(32-byte hex)"
  }
}
```

**Response**:
```json
{
  "result": {
    "invites": [
      {
        "invite_hash": "...",
        "space_id": "...",
        "inviter": "...",
        "encrypted_space_key": "...",
        "created_at": 1704067200,
        "expires_at": 1704153600
      }
    ]
  }
}
```

### get_my_private_spaces
Get all private spaces the user is a member of.

**Request**:
```json
{
  "method": "get_my_private_spaces",
  "params": {
    "user": "...(32-byte hex)"
  }
}
```

**Response**:
```json
{
  "result": {
    "spaces": [
      {
        "space_id": "...(hex)",
        "space_id_bech32": "swim1...",
        "encrypted_name": "...(hex, optional)",
        "role": "Admin",
        "joined_at": 1704067200,
        "member_count": 5,
        "key_version": 1
      }
    ]
  }
}
```

**Location**: `src/rpc/types.rs:1424-1453`

### get_pending_dm_requests
Get all pending DM requests where user is the recipient.

**Request**:
```json
{
  "method": "get_pending_dm_requests",
  "params": {
    "user": "...(32-byte hex)"
  }
}
```

**Response**:
```json
{
  "result": {
    "requests": [
      {
        "request_hash": "...",
        "requester": "...(32-byte hex)",
        "key_share": "...(X25519 pubkey, hex)",
        "created_at": 1704067200
      }
    ]
  }
}
```

**Location**: `src/rpc/types.rs:1397-1419`

---

## CLI Commands

*Private space operations are currently only available via RPC. CLI commands are planned for future releases.*

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Invalid creator: must be 32-byte hex" | Malformed public key | Ensure public key is properly hex-encoded |
| "You are not a member of this space" | Attempting to invite without membership | Join the space first or verify space_id |
| "You don't have permission to kick members" | Non-admin/mod attempting kick | Only Admin or Moderator roles can kick |
| "Moderators can only kick regular members" | Mod trying to kick admin/mod | Only Admins can kick Mods/Admins |
| "Cannot kick yourself" | Self-kick attempt | Use `leave_space` instead |
| "Target is not a member of this space" | Invalid kick target | Verify member exists in space |
| "Invite not found" | Invalid invite hash | Verify invite_hash from `get_my_invites` |
| "Invite has expired" | Expired invite | Request a new invite |
| "You already have a DM with this user" | Duplicate DM request | Check existing DMs first |
| "Membership store not available" | Node configuration issue | Ensure node has membership storage enabled |

---

## Testing

### Unit Tests

```bash
# Run membership store tests
cargo test --package swimchain --lib storage::membership::tests

# Example tests included:
# - test_member_role_try_from
# - test_add_and_get_member
# - test_remove_member
# - test_update_member_key
# - test_invite_operations
# - test_dm_request_operations
```

### Integration Tests

```bash
# Test private space creation flow
cargo test --test private_space_integration

# Test DM flow
cargo test --test dm_integration
```

### Client-Side Tests

```bash
# Run TypeScript encryption tests
cd forum-client
npm test -- --grep "encryption"

# Test X25519 key derivation
npm test -- --grep "x25519"
```

---

## Known Limitations

1. **No Network Broadcast for Kick/DM**: The `kick_member`, `request_dm`, `accept_dm`, and `decline_dm` operations return `broadcast: false`. These actions are stored locally but not propagated to other nodes. This means:
   - Private space membership changes only exist on the node that processed the request
   - DM requests/responses must be manually synced or repeated on each node

2. **Empty encrypted_space_key for DMs**: When a DM is accepted, both parties' `MemberRecord` entries have empty `encrypted_space_key`. Clients must derive the shared key locally using the X25519 DH exchange from the key shares.

3. **Key Rotation Client Responsibility**: While the `kick_member` handler processes `new_encrypted_keys` and updates member records, the client must:
   - Generate a new space key
   - Re-encrypt for all remaining members
   - Include all encrypted keys in the kick request

4. **No Invite Revocation Broadcast**: Revoking an invite is a local operation.

5. **Single-Node Scope**: Private spaces currently operate per-node. Cross-node private space sync requires additional infrastructure.

---

## Security Considerations

### Cryptographic Properties

| Property | Implementation |
|----------|----------------|
| Encryption at rest | AES-256-GCM with random IVs |
| Key exchange | X25519 ECDH |
| Authenticated encryption | XSalsa20-Poly1305 (NaCl box) for key transport |
| Forward secrecy | Not implemented (static space keys) |
| Key rotation | Supported on kick (storage mechanism works, network broadcast pending) |

### Security Checklist

- [x] X25519 key derivation follows libsodium conventions
- [x] AES-GCM nonces are randomly generated per encryption
- [x] Space keys are 32 bytes (256 bits)
- [x] Local key storage uses IndexedDB (browser storage)
- [x] No plaintext space keys in network messages
- [x] Key rotation storage mechanism implemented
- [ ] Key rotation network broadcast (pending)
- [ ] Rate limiting on DM requests (infrastructure exists but not wired)

---

## Future Work

- **Network Gossip for Private Space Actions**: Implement Action types (`Invite`, `Leave`, `Kick`, `KeyRotation`, `DMRequest`, `AcceptDM`, `DeclineDM`) for network propagation
- **DM Network Broadcast**: Enable broadcast for DM operations
- **Invite Link System**: Generate shareable invite links with time-limited access
- **Multi-Device Sync**: Securely sync space keys across user devices
- **Group Admin Transfer**: Allow changing space ownership
- **Read Receipts**: Track which members have read messages (optional, encrypted)

---

## External Dependencies

### Rust Crates

| Crate | Purpose |
|-------|---------|
| `sled` | Embedded database for membership storage |
| `bincode` | Binary serialization |
| `hex` | Hexadecimal encoding |

### TypeScript Packages

| Package | Purpose |
|---------|---------|
| `@noble/curves/ed25519` | X25519 key derivation |
| `@noble/hashes/sha256` | SHA-256 hashing |
| `@noble/hashes/sha512` | SHA-512 for key derivation |
| `@noble/ciphers/salsa.js` | XSalsa20-Poly1305 encryption |

---

## Related Features

- [Identity & Cryptography](./identity-cryptography_FEATURE_DOC.md) - Ed25519 keypairs that underpin X25519 derivation
- [RPC API](./rpc-api_FEATURE_DOC.md) - Full RPC reference including private space methods
- [Block Formation](./block-formation-consensus_FEATURE_DOC.md) - How private space actions are included in blocks
- [Content Decay](./content-decay-engine_FEATURE_DOC.md) - How decay applies to encrypted content
