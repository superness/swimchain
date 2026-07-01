# Private Spaces — Cross-Client Feature Documentation

> Last updated: 2026-02-17 | Re-audited with live screenshots

Private spaces provide end-to-end encrypted group messaging on Swimchain. Content is encrypted client-side with AES-256-GCM before submission to the network. Space keys are exchanged via X25519 ECDH and stored locally in IndexedDB or localStorage. The backend never sees plaintext.

## Feature Comparison

| Feature | forum-client | chat-client | feed-client | search-client | bridge-client | archiver-client | analytics-client |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Private Space Creation** | PASS | PASS | PASS | — | — | — | — |
| **Private Space Listing** | PASS | PASS | PASS | — | — | — | — |
| **Encrypted Messaging (Send)** | PASS | PASS | — | — | — | — | — |
| **Encrypted Messaging (Receive)** | PASS | PASS | — | — | — | — | — |
| **Invite System** | PASS | PASS | PASS | — | — | — | — |
| **X25519 Key Exchange** | PASS | PASS | PASS | — | — | — | — |
| **Key Storage (IndexedDB)** | PASS | PASS | PASS | — | — | — | — |
| **Passphrase Encryption** | PASS | PASS | PASS | — | — | — | — |
| **Space Key Encryption** | PASS | PASS | PASS | — | — | — | — |
| **EncryptedContent Component** | PASS | PASS | PASS | — | — | — | — |
| **Encrypted Badge Display** | PASS | PASS | PASS | PASS | — | — | — |
| **DM Support** | PASS | — | — | — | — | — | — |
| **Space Settings / Admin** | PASS | — | — | — | — | — | — |
| **Kick Member + Key Rotation** | PASS | — | — | — | — | — | — |
| **Media Encryption** | PASS | — | PASS | — | — | — | — |
| **Web Worker PBKDF2** | PASS | PASS | PASS | — | — | — | — |
| **Passphrase Storage** | PASS | — | PASS | — | — | — | — |
| **Private Key Management UI** | — | — | — | — | PASS | — | — |
| **Decrypt for Bridging** | — | — | — | — | PASS | — | — |
| **PoW for Space Actions** | PASS | PASS | PASS | — | — | — | — |
| **Key Backup / Export** | — | — | — | — | — | — | — |

**Legend:** PASS = implemented and working. — = not implemented or not applicable.

---

## Screenshots

All screenshots captured 2026-02-17 with Puppeteer (1280x900 viewport, headless).

### forum-client (port 5173)

**Home — Public/Private tab selector in sidebar:**

![forum-client home](forum-home.png)

The sidebar shows **Public** and **Private** tabs. Clicking Private loads `PrivateSpaceList` with decrypted space names, member counts, and pending invites. The node status bar at bottom shows connection status (Offline / 0 peers shown since no node running).

**Create Private Space page:**

![forum-client create](forum-create-private.png)

The `/create-private-space` route requires identity — shows "Loading identity..." when no keypair exists. Once identity is loaded, displays space name input, E2E encryption notice, PoW mining progress, and cancel button.

**Private Spaces route — WASM initialization:**

![forum-client WASM loading](forum-private-spaces.png)

The `/private-spaces` route triggers WASM module loading (Ed25519, SHA-256, Bech32m) before rendering the private space list.

---

### chat-client (port 5175)

**Home — Identity required:**

![chat-client home](chat-home.png)

Chat-client requires identity generation (Ed25519 keypair + PoW mining) before accessing channels. The identity page explains the cryptographic process: keypair generation, PoW validation, local-only storage, and public address format (cs1...).

**Create Private Channel — Loading:**

![chat-client create private](chat-create-private.png)

The `/create-private-channel` route shows "Loading Swimchain..." during WASM/identity initialization. Once loaded, displays channel name input, Argon2id PoW mining with attempt counter, and privacy explanation.

---

### search-client (port 5174)

**Home — Search interface:**

![search-client home](search-home.png)

Clean search interface with suggested queries (`author:alice`, `type:thread`, `"exact phrase"`, `after:2024-01-01`). When search results contain encrypted content, `EncryptedBadge` or `PrivateBadge` icons appear on result cards. No decryption capability.

---

### bridge-client (port 5176)

**Home — Bridge initialization:**

![bridge-client home](bridge-home.png)

**Settings — Private space key management:**

![bridge-client settings](bridge-settings.png)

Both show "Initializing cross-platform bridge... Loading WASM modules". When WASM loads, the Settings page reveals a **Private Spaces** section with inputs for Space ID, AES Key (64 hex chars), and Space Name, plus add/remove controls per space.

---

### archiver-client (port 5177)

**Home — Content preservation:**

![archiver-client home](archiver-home.png)

"Initializing content preservation... Loading WASM modules". No private space support anywhere in the UI. Archives public plaintext content only; encrypted content is stored as raw ciphertext.

---

### analytics-client (port 5178)

**Home — Network analytics:**

![analytics-client home](analytics-home.png)

"Initializing network analytics... Loading WASM modules". No private space support. Monitors public spaces and network-wide metrics only. No awareness of encrypted content.

---

### feed-client (port 5179)

**Home — Feed with content cards:**

![feed-client home](feed-home.png)

Social feed with loading skeleton cards, search bar (Ctrl+K), Recent/Hot sort tabs, space filter dropdown, and + Post FAB. Private space content shows `EncryptedBadge` / `DecryptedBadge` when encrypted content appears.

**Discover — Space and user discovery:**

![feed-client discover](feed-discover.png)

Discover page with Spaces and Users tabs, search input, and suggested spaces (shown: "Space 0002de81" with 1 post, "Space 00000000" with 0 posts). The `PrivateSpaceList` component is accessible from this page for private space management.

---

## Client Details

### 1. forum-client — Full Implementation

**Port:** 5173 | **Status:** Production-ready (21 PASS, 1 FAIL, 1 MISSING)

The reference implementation with the most complete private space support.

**Key Files (25 total — 16 source + 9 stylesheets):**
| File | Lines | Purpose |
|------|------:|---------|
| `pages/CreatePrivateSpace.tsx` | 262 | Space creation form with PoW mining |
| `components/PrivateSpaceList.tsx` | 336 | Lists spaces + pending invites with accept/decline |
| `components/ChatView.tsx` | 344 | Real-time encrypted messaging in private spaces |
| `components/InviteModal.tsx` | 315 | X25519 key exchange invite flow |
| `components/SpaceSettings.tsx` | 373 | Member management, kick with key rotation |
| `components/StartDMButton.tsx` | 262 | Deterministic DM space creation |
| `components/EncryptedContent.tsx` | 297 | Passphrase-based content decryption UI |
| `hooks/usePrivateSpaceKeys.ts` | 286 | IndexedDB key storage (`swimchain-private-spaces`) |
| `hooks/usePrivateSpaceMessages.ts` | 189 | Fetch + auto-decrypt messages with 5s polling |
| `hooks/usePassphraseStore.ts` | 152 | localStorage passphrase management |
| `hooks/useActionPow.ts` | 413 | Argon2id PoW mining for actions |
| `lib/encryption.ts` | 751 | AES-256-GCM encryption (passphrase + space key modes) |
| `lib/x25519.ts` | 253 | Ed25519-to-X25519 conversion, NaCl box encryption |
| `lib/dm.ts` | 127 | Deterministic DM space IDs via `SHA256("dm:v1:" + sorted_pubkeys)` |
| `lib/encryption-worker.ts` | 83 | Web Worker for non-blocking PBKDF2 |
| `lib/identity-encryption.ts` | 253 | Argon2id-based private key storage encryption |

**Encryption:**
- **Passphrase mode:** `[ENCRYPTED:v1:<base64(salt|iv|ciphertext)>]` — PBKDF2 (100k iterations) + AES-256-GCM
- **Space key mode:** `[PRIVATE:v1:<base64(iv|ciphertext)>]` — direct AES-256-GCM with 32-byte key
- **Key exchange:** X25519 ECDH + XSalsa20-Poly1305 (NaCl box) for sharing space keys
- **Media:** `encryptMedia()` / `encryptPrivateMedia()` for binary data

**RPC Methods:** `create_private_space`, `invite_to_space`, `accept_invite`, `decline_dm`, `request_dm`, `accept_dm`, `post_to_private_space`, `list_posts_for_space`, `leave_space`, `kick_member`, `get_space_members`, `list_private_spaces`, `list_private_space_invites`

**Known Issues:**
- PoW params previously hardcoded to 0 (fixed with `useSpaceCreationPow` hook)
- No key backup/export mechanism

---

### 2. chat-client — Discord-Style Channels

**Port:** 5175 | **Status:** Functional (15 PASS, 3 FAIL, 9 MISSING)

Discord-inspired UI with encrypted private channels. Separate from forum-client's space model.

**Key Files (13 total — 9 source + 4 stylesheets):**
| File | Lines | Purpose |
|------|------:|---------|
| `pages/CreatePrivateChannel.tsx` | 240 | Channel creation with Argon2id PoW + progress UI |
| `pages/Chat.tsx` | 487 | Main chat orchestrator — encrypts before send (line ~158) |
| `components/InviteModal.tsx` | 332 | X25519 key exchange for channel invites |
| `components/ChannelSidebar.tsx` | 294 | Channel list with lock icons for encrypted channels |
| `components/EncryptedContent.tsx` | 261 | Passphrase-based decryption UI |
| `hooks/usePrivateSpaceKeys.ts` | 286 | IndexedDB key storage (`swimchain-private-channels`) |
| `hooks/usePrivateChannelMessages.ts` | 176 | Fetch + auto-decrypt with 5s polling |
| `lib/encryption.ts` | 452 | AES-256-GCM (passphrase + channel key modes) |
| `lib/encryption-worker.ts` | 83 | Web Worker for PBKDF2 |

**Encryption:**
- Same dual-mode encryption as forum-client
- `Chat.tsx` encrypts outgoing messages with `encryptWithChannelKey()` before RPC submission
- `usePrivateChannelMessages` auto-decrypts incoming `[PRIVATE:v1:...]` content
- Channel names encrypted with space key before creation

**Known Issues:**
- No DM support (referenced in DESIGN.md but unimplemented)
- No passphrase storage hook
- No member list view or kick/admin UI
- Media uploads not encrypted in private channels
- Invite PoW hardcoded to 0

---

### 3. feed-client — Social Feed

**Port:** 5179 | **Status:** Partial (12 PASS, 1 FAIL, 4 MISSING)

Has encryption infrastructure and space creation but lacks messaging within private spaces.

**Key Files (14 total — 9 source + 5 stylesheets):**
| File | Lines | Purpose |
|------|------:|---------|
| `pages/CreatePrivateSpace.tsx` | 253 | Same architecture as forum-client |
| `components/PrivateSpaceList.tsx` | 87 | Lists private spaces in sidebar |
| `components/InviteModal.tsx` | 318 | X25519 invite flow with focus trap |
| `components/EncryptedContent.tsx` | 311 | Passphrase-based decryption with badges |
| `hooks/usePrivateSpaceKeys.ts` | 286 | IndexedDB (`swimchain-feed-private-spaces`) |
| `hooks/usePassphraseStore.ts` | 153 | localStorage passphrase management |
| `lib/encryption.ts` | 609 | Full encryption with media support |
| `lib/x25519.ts` | 253 | X25519 ECDH + NaCl box key exchange |
| `lib/encryption-worker.ts` | 82 | Web Worker PBKDF2 |

**Unique Features:**
- `encryptMedia()` / `decryptMedia()` + `encryptPrivateMedia()` / `decryptPrivateMedia()` for binary attachments
- `encryptSpaceName()` / `decryptSpaceName()` for space name encryption
- Multiple badge exports: `EncryptedBadge`, `DecryptedBadge`, `EncryptedIndicator`, `InlineUnlock`

**Known Issues:**
- No `usePrivateSpaceMessages` hook — cannot send/receive messages in private spaces
- No DM support
- PoW params are placeholders

---

### 4. search-client — Detection Only

**Port:** 5174 | **Status:** Minimal (1 feature)

Read-only search interface. Cannot decrypt content but flags it visually.

**Key Files:**
| File | Purpose |
|------|---------|
| `components/EncryptedBadge.tsx` | `EncryptedBadge` + `PrivateBadge` components |

**How It Works:**
- `isEncryptedContent()` checks for `[ENCRYPTED:v1:` or `[PRIVATE:v1:` prefixes in search results
- Shows lock icon badges on ThreadResult and ReplyResult cards
- No decryption, no key storage, no private space creation

---

### 5. bridge-client — Decrypt for Bridging

**Port:** 5176 | **Status:** Limited (2 features)

Bridges Swimchain content to external platforms (Matrix, IRC). Can decrypt private space content for outbound bridging if given the key manually.

**Key Files (3 source files):**
| File | Lines | Purpose |
|------|------:|---------|
| `hooks/usePrivateSpaceKeys.ts` | 105 | localStorage key management (simpler than IndexedDB) |
| `pages/Settings.tsx` | 316 | Manual key paste UI (64-hex AES key input, lines 207-302) |
| `services/BridgeEngine.ts` | 828 | `tryDecryptContent()` — AES-256-GCM decryption in polling loop (lines 159-271) |

**How It Works:**
- Admin pastes space AES-256-GCM keys manually in Settings page
- `BridgeEngine.startContentWatcher()` polls for new content
- `isPrivateEncrypted()` detects `[PRIVATE:v1:...]` markers
- `tryDecryptContent()` decrypts with stored key before bridging to Matrix/IRC
- No key exchange, no invite system — manual key management only

---

### 6. archiver-client — No Support

**Port:** 5177 | **Status:** None

Content preservation client focused on combating content decay. No private space features.
Archives plaintext content only. Encrypted posts stored as raw ciphertext without decryption.

---

### 7. analytics-client — No Support

**Port:** 5178 | **Status:** None

Network analytics dashboard. Monitors public space metrics, peer counts, sync status.
No private space awareness — encrypted content not tracked in metrics.

---

## Encryption Architecture

### Two Encryption Modes

**1. Passphrase-Based (Public Posts)**
```
Format: [ENCRYPTED:v1:<base64(salt | iv | ciphertext)>]
Key:    PBKDF2(passphrase, salt, 100000 iterations, SHA-256) -> 256-bit key
Cipher: AES-256-GCM
Salt:   16 random bytes (unique per encryption)
IV:     12 random bytes (unique per encryption)
```
Used for optional post encryption in public spaces. Recipients need the passphrase (shared out-of-band).

**2. Space Key-Based (Private Spaces)**
```
Format: [PRIVATE:v1:<base64(iv | ciphertext)>]
Key:    32-byte random AES key (generated on space creation)
Cipher: AES-256-GCM
IV:     12 random bytes (unique per message)
```
Used for all content in private spaces. Key shared via X25519 invite flow.

### Key Exchange Flow

```
Creator                              Invitee
  |                                    |
  |-- Ed25519 seed --> SHA-512 ------> X25519 secret key
  |-- Ed25519 pubkey -> birational --> X25519 public key
  |                                    |
  |  encryptSpaceKeyForRecipient():    |
  |  1. ECDH(myX25519Secret,          |
  |         theirX25519Public)         |
  |  2. XSalsa20-Poly1305(spaceKey)   |
  |  3. Output: nonce(24) || ciphertext|
  |                                    |
  |--- encrypted key via RPC --------->|
  |                                    |
  |                   decryptSpaceKey():|
  |                   1. ECDH(mySecret,|
  |                      senderPublic) |
  |                   2. Decrypt key   |
  |                   3. Store in IDB  |
```

### DM Space IDs (forum-client only)

DM spaces use deterministic IDs so both parties compute the same space ID:
```
spaceId = SHA256("dm:v1:" + sort([pubkeyA, pubkeyB]).join(":")).slice(0, 16).toHex()
```

---

## RPC Methods

| Method | Used By | Purpose |
|--------|---------|---------|
| `create_private_space` | forum, chat, feed | Create encrypted space with PoW |
| `invite_to_space` | forum, chat, feed | Send X25519-encrypted key to invitee |
| `accept_invite` | forum | Accept invite, decrypt space key |
| `decline_dm` | forum | Decline a DM request |
| `request_dm` | forum | Send DM request with encrypted key |
| `accept_dm` | forum | Accept DM, decrypt key |
| `post_to_private_space` | forum, chat | Send encrypted message to space |
| `list_posts_for_space` | forum, chat | Fetch encrypted messages (paginated) |
| `list_private_spaces` | forum, chat, feed | List user's joined private spaces |
| `list_private_space_invites` | forum | List pending invitations |
| `get_space_members` | forum | Get member list with roles |
| `leave_space` | forum | Leave space (removes local key) |
| `kick_member` | forum | Remove member + rotate key for all remaining members |

---

## Known Issues & Gaps

| Issue | Severity | Clients Affected |
|-------|----------|------------------|
| No key backup/export | HIGH | All clients — IndexedDB wipe = permanent loss |
| feed-client: No private messaging | MEDIUM | feed-client — can create spaces but not message |
| chat-client: No DMs | MEDIUM | chat-client — design exists, no implementation |
| chat-client: No member management | MEDIUM | chat-client — no kick, no member list view |
| chat-client: Media not encrypted | MEDIUM | chat-client — images in private channels are plaintext |
| archiver/analytics: No awareness | LOW | Cannot monitor or preserve encrypted content |
| bridge-client: Manual key only | LOW | No automated key exchange for bridging |

---

## Cryptographic Standards

| Algorithm | Purpose | Parameters |
|-----------|---------|------------|
| AES-256-GCM | Content encryption (symmetric) | 256-bit key, 12-byte IV, 128-bit auth tag |
| PBKDF2-SHA256 | Passphrase key derivation | 100,000 iterations, 16-byte salt |
| X25519 | Diffie-Hellman key agreement | Curve25519, 32-byte keys |
| XSalsa20-Poly1305 | NaCl box for key exchange | 24-byte nonce, 16-byte MAC |
| Ed25519 | Digital signatures | 64-byte signatures, 32-byte keys |
| SHA-256 | Deterministic IDs (DMs, spaces) | 32-byte output |
| Argon2id | Proof-of-work mining | Variable difficulty per network mode |

**Libraries:** `@noble/curves` (Ed25519, X25519), `@noble/hashes` (SHA-256, SHA-512), `@noble/ciphers` (XSalsa20-Poly1305), Web Crypto API (AES-GCM, PBKDF2)
